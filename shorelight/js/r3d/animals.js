// 彼岸燈 — G.Animal3D: real-time 3D quadrupeds & birds, incl. the pets 芋圓 Yuyuan, 麻糬 Mochi and 糰子 Tuanzi.
// (contract: docs/CONTRACTS_3D.md "G.Char3D" instance interface; references: docs/design/REFERENCES.md)
//
// PIPELINE (all procedural, built once per sprite id and shared by instances):
//   plan    species "body plan" → joints (skeleton, rest pose facing +z) + SDF primitives (ellipsoids / round cones,
//           each owned by a bone, with fur-clump displacement) + extra parametric parts (ears, eyelids, mouth, horns…).
//   mesh    surface nets over the SDF in a WARPED grid (a fisheye magnification around the head, so the face gets
//           ~2× the vertex density of the body), vertices Newton-projected onto the exact surface, SDF-gradient normals.
//   skin    weights from primitive ownership (distance falloff between neighbouring primitives + joint split along
//           round cones) → one SkinnedMesh, plus a coarse SDF hull for the inverted-hull outline.
//   coat    a toon material patched with a procedural fur shader: per-vertex masks (white / patches / stripes /
//           spots / AO) thresholded per-pixel with rest-space noise, ticking, strand detail, a painted face texture
//           (cylindrical projection around the head: tabby "M", eye-lines, nose leather, lip line) and region colours.
//   cards   alpha-tested fur cards (ruff, plume, tufts, cheek fluff) and whiskers sharing the coat shader.
//   eyes    real eyeballs (iris / slit pupil / cornea highlight shader) skinned to eye bones, under skinned eyelids.
// ANIMATION: a procedural pose layer (blendable parameter vectors): foot-planted gait cycles (lateral-sequence walk,
//   trot, rotary gallop) with analytic leg IK (2-bone + pantograph metatarsus), moving scapulae, spine flex, head
//   stabilisation; behaviour clips (sit, loaf, groom, stretch, yawn, knead, …) crossfaded on top; additive layers
//   (breathing, blinks, ear flicks, tail swish, look-at, purr); verlet spring bones (tail, ears, belly, ruff, whiskers).
'use strict';
G.Animal3D = (() => {
  const A = {};
  const PI = Math.PI, TAU = PI * 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const T3 = () => window.THREE;

  // ================================================================================== noise (CPU)
  function hash3(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1440662683) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const c = (i, j, k) => hash3(xi + i, yi + j, zi + k);
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }

  // ================================================================================== SDF primitives
  // All authored in "plan units" (real animal metres); the asset is uniformly scaled at the end.
  function sdEllipsoid(x, y, z, rx, ry, rz) {
    const k0 = sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
    const k1 = sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
    return k1 < 1e-9 ? -min(rx, ry, rz) : k0 * (k0 - 1) / k1;
  }
  // iq's round cone between a (radius r1) and b (radius r2); also reports t along the segment via out[0]
  function sdRoundCone(px, py, pz, P, out) {
    const bax = P.bx - P.ax, bay = P.by - P.ay, baz = P.bz - P.az;
    const l2 = P.l2, rr = P.r1 - P.r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    const pax = px - P.ax, pay = py - P.ay, paz = pz - P.az;
    const y = pax * bax + pay * bay + paz * baz, z = y - l2;
    if (out) out[0] = clamp(y * il2, 0, 1);
    const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - P.r2;
    if (Math.sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - P.r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - P.r1;
  }
  function smin(a, b, k) { if (k <= 0) return min(a, b); const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { return -smin(-a, -b, k); }

  // rotation helpers (euler XYZ in radians) → 3x3 row-major
  function rotMat(rx = 0, ry = 0, rz = 0) {
    const cx = cos(rx), sx = sin(rx), cy = cos(ry), sy = sin(ry), cz = cos(rz), sz = sin(rz);
    // R = Rz * Ry * Rx
    return [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
      sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
      -sy, cy * sx, cy * cx];
  }

  // Primitive factory. opts: { bone, k (blend radius), sub (subtract), region, fluff, flow:[x,y,z], wk, noSkin, hullSkip }
  function ell(c, r, opts = {}) {
    const R = rotMat(...(opts.rot || [0, 0, 0]));
    return Object.assign({ type: 'e', cx: c[0], cy: c[1], cz: c[2], rx: r[0], ry: r[1], rz: r[2], R, k: 0.02 }, opts);
  }
  function cone(a, b, r1, r2, opts = {}) {
    const P = Object.assign({ type: 'c', ax: a[0], ay: a[1], az: a[2], bx: b[0], by: b[1], bz: b[2], r1, r2, k: 0.02 }, opts);
    P.l2 = (P.bx - P.ax) ** 2 + (P.by - P.ay) ** 2 + (P.bz - P.az) ** 2 || 1e-8;
    return P;
  }
  const _t = [0];
  function primDist(P, x, y, z) {
    let d;
    if (P.type === 'e') {
      const dx = x - P.cx, dy = y - P.cy, dz = z - P.cz, R = P.R;
      // local = R^T * d
      const lx = R[0] * dx + R[3] * dy + R[6] * dz, ly = R[1] * dx + R[4] * dy + R[7] * dz, lz = R[2] * dx + R[5] * dy + R[8] * dz;
      d = sdEllipsoid(lx, ly, lz, P.rx, P.ry, P.rz);
      _t[0] = 0.5;
    } else d = sdRoundCone(x, y, z, P, _t);
    if (P.fluff && d < P.fluff * 3) d -= P.fluff * fluffNoise(P, x, y, z);
    return d;
  }
  // clumped fur displacement: anisotropic noise stretched along the fur flow direction (tufts, not bumps)
  function fluffNoise(P, x, y, z) {
    const f = P.flow || [0, -0.3, -1], fl = Math.hypot(f[0], f[1], f[2]);
    const fx = f[0] / fl, fy = f[1] / fl, fz = f[2] / fl;
    const along = x * fx + y * fy + z * fz;
    const px = x - fx * along, py = y - fy * along, pz = z - fz * along;
    const s = P.clump || 70;
    const n = vnoise(px * s + along * s * 0.3, py * s + along * s * 0.3 + 7.1, pz * s + 3.3) * 0.7 + vnoise(px * s * 2.1, py * s * 2.1, pz * s * 2.1 + along * s * 0.6) * 0.3;
    return smooth(0.25, 0.85, n);
  }

  // Evaluate the whole field. prims are applied in order: additive ones by smooth-union, `sub` ones by smooth
  // subtraction (they carve: eye sockets, mouth slit, nostrils).
  function makeField(prims) {
    const add = prims.filter((p) => !p.sub && !p.hullOnly), sub = prims.filter((p) => p.sub);
    return function field(x, y, z) {
      let d = 1e9;
      for (let i = 0; i < add.length; i++) {
        const P = add[i];
        if (P.bb && (x < P.bb[0] || x > P.bb[3] || y < P.bb[1] || y > P.bb[4] || z < P.bb[2] || z > P.bb[5])) continue;
        d = smin(d, primDist(P, x, y, z), P.k);
      }
      for (let i = 0; i < sub.length; i++) { const P = sub[i]; d = smax(d, -primDist(P, x, y, z), P.k); }
      return d;
    };
  }
  function primBox(P, pad) {
    if (P.type === 'e') { const r = max(P.rx, P.ry, P.rz) + pad; return [P.cx - r, P.cy - r, P.cz - r, P.cx + r, P.cy + r, P.cz + r]; }
    const r = max(P.r1, P.r2) + pad;
    return [min(P.ax, P.bx) - r, min(P.ay, P.by) - r, min(P.az, P.bz) - r, max(P.ax, P.bx) + r, max(P.ay, P.by) + r, max(P.az, P.bz) + r];
  }

  // ================================================================================== surface nets mesher
  // opts: { h (voxel size, plan units), warp: { c:[x,y,z], m (magnification), R (radius) } }
  function meshSDF(field, prims, opts) {
    const h = opts.h, W = opts.warp;
    // bounds
    let bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const P of prims) {
      if (P.sub) continue;
      const pad = P.k + (P.fluff || 0) + 0.004;
      P.bb = primBox(P, pad + 2 * h);
      const b = primBox(P, pad);
      for (let i = 0; i < 3; i++) { bb[i] = min(bb[i], b[i]); bb[i + 3] = max(bb[i + 3], b[i + 3]); }
    }
    const mm = W ? W.m : 1, wR = W ? W.R : 0, cx = W ? W.c[0] : 0, cy = W ? W.c[1] : 0, cz = W ? W.c[2] : 0;
    const shrink = W ? (1 - 1 / mm) * wR : 0;
    // u-space bounds (expanded so the warped grid covers the p-space box)
    const lo = [], n = [];
    for (let i = 0; i < 3; i++) {
      const c = [cx, cy, cz][i];
      const a = bb[i] - 2 * h, b = bb[i + 3] + 2 * h;
      const ua = W ? min(a, c - (c - a) - shrink) : a, ub = W ? max(b, c + (b - c) + shrink) : b;
      lo[i] = ua; n[i] = Math.ceil((ub - ua) / h) + 1;
    }
    // symmetric about x = 0 if the box is (keeps the mesh mirror-symmetric)
    if (abs(bb[0] + bb[3]) < 1e-6) { const half = Math.ceil(-lo[0] / h); lo[0] = -half * h; n[0] = half * 2 + 1; }
    const [nx, ny, nz] = n;
    const warp = (ux, uy, uz, out) => {
      if (!W) { out[0] = ux; out[1] = uy; out[2] = uz; return; }
      const dx = ux - cx, dy = uy - cy, dz = uz - cz, r = sqrt(dx * dx + dy * dy + dz * dz);
      if (r < 1e-9) { out[0] = cx; out[1] = cy; out[2] = cz; return; }
      const f = (r - (1 - 1 / mm) * wR * Math.tanh(r / wR)) / r;
      out[0] = cx + dx * f; out[1] = cy + dy * f; out[2] = cz + dz * f;
    };
    const N = nx * ny * nz;
    const val = new Float32Array(N);
    const pp = [0, 0, 0];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      warp(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h, pp);
      val[i + nx * (j + ny * k)] = field(pp[0], pp[1], pp[2]);
    }
    // one vertex per sign-changing cell
    const vidx = new Int32Array(N).fill(-1);
    const pos = [];
    const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const o = corner[c];
        cv[c] = val[(i + o[0]) + nx * ((j + o[1]) + ny * (k + o[2]))];
        if (cv[c] < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, b] of edges) {
        const va = cv[a], vb = cv[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb), oa = corner[a], ob = corner[b];
        sx += oa[0] + (ob[0] - oa[0]) * t; sy += oa[1] + (ob[1] - oa[1]) * t; sz += oa[2] + (ob[2] - oa[2]) * t; cnt++;
      }
      warp(lo[0] + (i + sx / cnt) * h, lo[1] + (j + sy / cnt) * h, lo[2] + (k + sz / cnt) * h, pp);
      vidx[i + nx * (j + ny * k)] = pos.length / 3;
      pos.push(pp[0], pp[1], pp[2]);
    }
    // quads across sign-changing grid edges
    const idx = [];
    const V = (i, j, k) => vidx[i + nx * (j + ny * k)];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      if (flip) { const t = b; b = d; d = t; }
      // shorter diagonal
      const dac = dist2(pos, a, c), dbd = dist2(pos, b, d);
      if (dac < dbd) idx.push(a, b, c, a, c, d); else idx.push(a, b, d, b, c, d);
    };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const v0 = val[i + nx * (j + ny * k)];
      const in0 = v0 < 0;
      // +x edge
      if (i < nx - 1) { const v1 = val[(i + 1) + nx * (j + ny * k)]; if (in0 !== (v1 < 0)) quad(V(i, j - 1, k - 1), V(i, j, k - 1), V(i, j, k), V(i, j - 1, k), !in0); }
      if (j < ny - 1) { const v1 = val[i + nx * ((j + 1) + ny * k)]; if (in0 !== (v1 < 0)) quad(V(i - 1, j, k - 1), V(i - 1, j, k), V(i, j, k), V(i, j, k - 1), !in0); }
      if (k < nz - 1) { const v1 = val[i + nx * (j + ny * (k + 1))]; if (in0 !== (v1 < 0)) quad(V(i - 1, j - 1, k), V(i, j - 1, k), V(i, j, k), V(i - 1, j, k), !in0); }
    }
    // project onto the exact surface + gradient normals
    const nrm = new Float32Array(pos.length);
    const e = h * 0.15;
    for (let v = 0; v < pos.length / 3; v++) {
      let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
      let gx = 0, gy = 0, gz = 1;
      for (let it = 0; it < 4; it++) {
        const d = field(x, y, z);
        gx = field(x + e, y, z) - field(x - e, y, z); gy = field(x, y + e, z) - field(x, y - e, z); gz = field(x, y, z + e) - field(x, y, z - e);
        const g2 = gx * gx + gy * gy + gz * gz;
        if (g2 < 1e-14) break;
        const gl = sqrt(g2) / (2 * e);
        const s = d / gl;
        if (abs(s) > h) break; // never jump further than one voxel
        x -= gx / sqrt(g2) * s; y -= gy / sqrt(g2) * s; z -= gz / sqrt(g2) * s;
        if (abs(d) < h * 0.002) break;
      }
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      gx = field(x + e, y, z) - field(x - e, y, z); gy = field(x, y + e, z) - field(x, y - e, z); gz = field(x, y, z + e) - field(x, y, z - e);
      const gl = Math.hypot(gx, gy, gz) || 1;
      nrm[v * 3] = gx / gl; nrm[v * 3 + 1] = gy / gl; nrm[v * 3 + 2] = gz / gl;
    }
    return { pos: new Float32Array(pos), nrm, idx };
  }
  function dist2(p, a, b) { const dx = p[a * 3] - p[b * 3], dy = p[a * 3 + 1] - p[b * 3 + 1], dz = p[a * 3 + 2] - p[b * 3 + 2]; return dx * dx + dy * dy + dz * dz; }

  // ================================================================================== vertex records
  // Every vertex (SDF surface or parametric part) carries: skin [[bone, w]…], coat masks M and optional overrides.
  // M: { white, pa, pb, st (stripe strength), sc (stripe coord, 1 unit = 1 stripe period), spot, ao, tick,
  //      col:[r,g,b,a] (flat colour override), face (weight of the painted face texture), rest:[x,y,z] (pattern anchor) }
  const M0 = () => ({ white: 0, pa: 0, pb: 0, st: 0, sc: 0, spot: 0, ao: 1, tick: 1, col: null, face: 0, rest: null, fu: 0, fv: 0 });
  class Parts {
    constructor() { this.pos = []; this.nrm = []; this.idx = []; this.skin = []; this.m = []; this.extra = []; }
    get n() { return this.pos.length / 3; }
    vert(p, nrm, skin, m, extra) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(nrm[0], nrm[1], nrm[2]); this.skin.push(skin); this.m.push(m || M0()); this.extra.push(extra || null); return this.n - 1; }
    tri(a, b, c) { this.idx.push(a, b, c); }
    // grid of (nu+1)×(nv+1) vertices from f(u, v) → { p, n, skin, m }; closedU wraps u
    grid(nu, nv, f, flip, closedU) {
      const base = this.n, cols = closedU ? nu : nu + 1;
      for (let j = 0; j <= nv; j++) for (let i = 0; i < cols; i++) { const r = f(i / nu, j / nv); this.vert(r.p, r.n, r.skin, r.m, r.x); }
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
        const i1 = closedU ? (i + 1) % nu : i + 1;
        const a = base + j * cols + i, b = base + j * cols + i1, c = base + (j + 1) * cols + i1, d = base + (j + 1) * cols + i;
        if (flip) { this.tri(a, c, b); this.tri(a, d, c); } else { this.tri(a, b, c); this.tri(a, c, d); }
      }
      return base;
    }
  }
  const V3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]), norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)],
    mat: (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]],
  };
  const hex = (h) => { const c = new (T3().Color)(h); return [c.r, c.g, c.b]; }; // linear rgb for shader use
  const hexS = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  // ================================================================================== skinning of SDF vertices
  // Weighted by primitive ownership: raw_i = (1 - (d_i - d_min)/wk_i)^2. Round cones split their weight towards the
  // parent bone near the start (bp) and towards the child bone near the end (bc) so joints bend smoothly.
  function primWeights(prims, x, y, z, out) {
    let dmin = 1e9;
    const ds = out.ds, ts = out.ts;
    for (let i = 0; i < prims.length; i++) {
      const P = prims[i];
      if (P.bb && (x < P.bb[0] || x > P.bb[3] || y < P.bb[1] || y > P.bb[4] || z < P.bb[2] || z > P.bb[5])) { ds[i] = 1e9; continue; }
      ds[i] = primDist(P, x, y, z); ts[i] = _t[0];
      if (ds[i] < dmin) dmin = ds[i];
    }
    let sum = 0;
    for (let i = 0; i < prims.length; i++) {
      const P = prims[i];
      const wk = P.wk || max(P.k * 1.2, 0.006);
      const r = ds[i] > 1e8 ? 0 : max(0, 1 - (ds[i] - dmin) / wk);
      out.raw[i] = r * r * (P.wmul || 1); sum += out.raw[i];
    }
    if (sum <= 0) { // fall back to nearest primitive
      let bi = 0; for (let i = 1; i < prims.length; i++) if (ds[i] < ds[bi]) bi = i;
      out.raw[bi] = 1; sum = 1;
    }
    for (let i = 0; i < prims.length; i++) out.raw[i] /= sum;
  }
  function boneShare(P, t, acc, w, x, y, z) {
    if (P.boneFn) { for (const [b, bw] of P.boneFn(x, y, z, t)) acc[b] = (acc[b] || 0) + w * bw; return; }
    let wp = 0, wc = 0;
    if (P.type === 'c') { if (P.bp) wp = 0.5 * (1 - smooth(0, 0.35, t)); if (P.bc) wc = 0.5 * smooth(0.65, 1, t); }
    const ws = 1 - wp - wc;
    acc[P.bone] = (acc[P.bone] || 0) + w * ws;
    if (wp) acc[P.bp] = (acc[P.bp] || 0) + w * wp;
    if (wc) acc[P.bc] = (acc[P.bc] || 0) + w * wc;
  }
  function topSkin(acc) {
    const arr = Object.entries(acc).filter((e) => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = arr.reduce((a, e) => a + e[1], 0) || 1;
    return arr.map(([b, w]) => [b, w / s]);
  }
  // SDF ambient occlusion (5 taps along the normal)
  function sdfAO(field, x, y, z, nx, ny, nz, step) {
    let occ = 0, wsum = 0;
    for (let i = 1; i <= 5; i++) {
      const h = step * i;
      const d = field(x + nx * h, y + ny * h, z + nz * h);
      occ += (h - max(0, d)) / h * (1 / i); wsum += 1 / i;
    }
    return clamp(1 - occ / wsum * 1.6, 0, 1);
  }

  // ================================================================================== shaders
  const GLSL_NOISE = `
    float an_h31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float an_vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(an_h31(i), an_h31(i + vec3(1,0,0)), f.x), mix(an_h31(i + vec3(0,1,0)), an_h31(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(an_h31(i + vec3(0,0,1)), an_h31(i + vec3(1,0,1)), f.x), mix(an_h31(i + vec3(0,1,1)), an_h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float an_fbm(vec3 p){ return an_vn(p) * 0.55 + an_vn(p * 2.03 + 11.7) * 0.3 + an_vn(p * 4.11 + 3.1) * 0.15; }
    float an_worley(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); float d = 8.0;
      for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 b = vec3(float(x), float(y), float(z));
        vec3 o = vec3(an_h31(i + b), an_h31(i + b + 13.7), an_h31(i + b + 29.3));
        vec3 r = b + o * 0.8 + 0.1 - f; d = min(d, dot(r, r)); }
      return sqrt(d); }`;

  // Coat material: MeshToonMaterial (+ the shared fresnel rim from G.R3M.toon) with the procedural fur colour.
  // P (palette): base, base2 (ticking), dark, white, pa, pb, (all hex); opts: { stripeW, spots, tick, detail, faceTex,
  // cards (alpha-tested strand atlas), rim, rimColor, glow }
  function coatMaterial(P, opts = {}) {
    const THREE = T3();
    const mat = G.R3M.toon({ color: 0xffffff, rim: opts.rim != null ? opts.rim : 0.3, rimColor: opts.rimColor || '#fff4e6', bands: 3,
      side: opts.cards ? THREE.DoubleSide : THREE.FrontSide, alphaTest: opts.cards ? 0.5 : 0 });
    const U = {
      cBase: { value: new THREE.Color(P.base) }, cBase2: { value: new THREE.Color(P.base2 || P.base) }, cDark: { value: new THREE.Color(P.dark) },
      cWhite: { value: new THREE.Color(P.white) }, cPA: { value: new THREE.Color(P.pa || P.base) }, cPB: { value: new THREE.Color(P.pb || P.base) },
      uStripeW: { value: opts.stripeW != null ? opts.stripeW : 0.32 }, uTick: { value: opts.tick != null ? opts.tick : 0.35 },
      uDetail: { value: opts.detail != null ? opts.detail : 0.22 }, uScale: { value: 1 / (opts.scale || 1) },
      tFace: { value: opts.faceTex || null }, tCard: { value: opts.cardTex || null },
      uGhost: { value: 0 }, cGhost: { value: new THREE.Color(opts.ghostTint || '#bfe8ff') },
      cGlow: { value: new THREE.Color(opts.glow || '#000000') }, uGlow: { value: opts.glow ? (opts.glowK || 0.35) : 0 },
      uFade: { value: 1 }, uTime: { value: 0 },
    };
    mat.userData.coat = U;
    const prev = mat.onBeforeCompile;
    const defs = (opts.spots ? '#define AN_SPOTS\n' : '') + (opts.faceTex ? '#define AN_FACE\n' : '') + (opts.cards ? '#define AN_CARDS\n' : '');
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aRest; attribute vec4 aM; attribute vec4 aS; attribute vec4 aCol; attribute vec3 aFace;
          varying vec3 vRest; varying vec4 vM; varying vec4 vS; varying vec4 vCol; varying vec3 vFace;
          #ifdef AN_CARDS
          attribute vec2 aCardUv; varying vec2 vCardUv;
          #endif`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRest = aRest; vM = aM; vS = aS; vCol = aCol; vFace = aFace;
          #ifdef AN_CARDS
          vCardUv = aCardUv;
          #endif`);
      sh.fragmentShader = defs + sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 cBase, cBase2, cDark, cWhite, cPA, cPB, cGhost, cGlow;
          uniform float uStripeW, uTick, uDetail, uScale, uGhost, uGlow, uFade, uTime;
          uniform sampler2D tFace; uniform sampler2D tCard;
          varying vec3 vRest; varying vec4 vM; varying vec4 vS; varying vec4 vCol; varying vec3 vFace;
          #ifdef AN_CARDS
          varying vec2 vCardUv;
          #endif
          ${GLSL_NOISE}
          vec3 an_coat(out float strandA){
            vec3 p = vRest * uScale;               // plan-space metres (pattern glued to the rest pose)
            vec3 c = mix(cBase, cBase2, smoothstep(0.35, 0.75, an_vn(p * vec3(160.0, 60.0, 160.0))) * uTick * vS.w);
            // patches (calico / dilute patches) with ragged organic edges
            float pa = smoothstep(0.46, 0.54, vM.y + (an_fbm(p * 22.0) - 0.5) * 0.55);
            float pb = smoothstep(0.46, 0.54, vM.z + (an_fbm(p * 22.0 + 7.0) - 0.5) * 0.55);
            c = mix(c, cPA, pa); c = mix(c, cPB, pb);
            // tabby stripes: stripe coordinate warped by noise, broken into dashes on the flanks
            float sc = vS.x + (an_vn(p * 26.0) - 0.5) * 0.7 + (an_vn(p * 70.0) - 0.5) * 0.22;
            float tri = abs(fract(sc) - 0.5) * 2.0;
            float stripe = (1.0 - smoothstep(uStripeW, uStripeW + 0.16, tri)) * vM.w;
            stripe *= smoothstep(0.18, 0.5, an_vn(p * 16.0 + 5.0) + 0.32);
            c = mix(c, cDark, stripe);
            #ifdef AN_SPOTS
            float w1 = an_worley(p * 34.0);
            float spot = (1.0 - smoothstep(0.26, 0.36, w1 + (an_vn(p * 90.0) - 0.5) * 0.12)) * vS.y;
            c = mix(c, cDark, spot);
            #endif
            float wm = smoothstep(0.44, 0.56, vM.x + (an_fbm(p * 20.0 + 3.0) - 0.5) * 0.42);
            c = mix(c, cWhite, wm);
            #ifdef AN_FACE
            vec4 fp = texture2D(tFace, vFace.xy);
            c = mix(c, fp.rgb, fp.a * vFace.z);
            #endif
            c = mix(c, vCol.rgb, vCol.a);
            // fine strand texture (anisotropic noise) + baked AO
            float strand = an_vn(vec3(p.x * 520.0, p.y * 150.0, p.z * 520.0)) * 0.6 + an_vn(p * 260.0) * 0.4;
            c *= 1.0 + (strand - 0.5) * uDetail;
            strandA = 1.0;
            #ifdef AN_CARDS
            vec4 cd = texture2D(tCard, vCardUv);
            strandA = cd.a; c *= mix(0.75, 1.08, cd.r);
            #endif
            return c * vS.z;
          }`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `float an_a; vec3 an_c = an_coat(an_a);
          vec4 diffuseColor = vec4( diffuse * an_c, opacity * an_a * uFade );`)
        .replace('#include <opaque_fragment>', `
          { vec3 vn = normalize(normal); vec3 vv = normalize(vViewPosition);
            float fr = 1.0 - clamp(dot(vn, vv), 0.0, 1.0);
            outgoingLight += cGlow * uGlow * (0.25 + smoothstep(0.35, 0.95, fr));
            if (uGhost > 0.0) {
              vec3 g = cGhost * (0.45 + 1.4 * smoothstep(0.25, 1.0, fr)) + outgoingLight * 0.35;
              outgoingLight = mix(outgoingLight, g, uGhost);
              diffuseColor.a *= mix(1.0, 0.35 + 0.6 * smoothstep(0.2, 0.95, fr), uGhost);
            } }
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'animalcoat|' + defs;
    return mat;
  }

  // Eyes: real eyeballs. aEye = unit position in the eye's own frame (+z = gaze). Iris with radial fibres, limbal
  // ring and a slit / round pupil (uPupil), a hand-placed view-space cornea highlight and a soft lid shadow.
  function eyeMaterial(E) {
    const THREE = T3();
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: G.R3M.ramp(2) });
    const U = {
      cIris: { value: new THREE.Color(E.iris) }, cIris2: { value: new THREE.Color(E.iris2 || E.iris) }, cRing: { value: new THREE.Color(E.ring || '#2a2a1a') },
      cSclera: { value: new THREE.Color(E.sclera || '#f2efe6') }, uIrisR: { value: E.irisR || 0.86 }, uPupil: { value: 0.28 },
      uPupilH: { value: E.pupilH || 0.82 }, uGhost: { value: 0 }, cGhost: { value: new THREE.Color('#bfe8ff') }, uFade: { value: 1 },
      uRound: { value: E.round ? 1 : 0 }, uGlowE: { value: E.glow || 0.12 },
    };
    mat.userData.eye = U;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aEye; varying vec3 vEye;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEye = aEye;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 cIris, cIris2, cRing, cSclera, cGhost; uniform float uIrisR, uPupil, uPupilH, uGhost, uFade, uRound, uGlowE;
          varying vec3 vEye; ${GLSL_NOISE}`)
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
          vec2 q = vEye.xy; float front = vEye.z;
          float r = length(q) / uIrisR;
          float ang = atan(q.y, q.x);
          float fib = an_vn(vec3(ang * 9.0, r * 3.0, 1.0)) * 0.6 + an_vn(vec3(ang * 23.0, r * 7.0, 4.0)) * 0.4;
          vec3 iris = mix(cIris2, cIris, smoothstep(0.15, 0.95, r));
          iris *= 0.82 + 0.36 * fib;
          iris = mix(iris, cRing, smoothstep(0.78, 1.0, r));
          // pupil: vertical slit (cats) .. round
          float pw = mix(uPupil, 1.0, uRound) * 0.5, ph = uPupilH;
          float pd = length(vec2(q.x / max(pw * uIrisR, 0.02), q.y / (ph * uIrisR)));
          float pupil = 1.0 - smoothstep(0.9, 1.05, pd);
          vec3 col = mix(iris, vec3(0.02, 0.018, 0.025), pupil);
          float inIris = 1.0 - smoothstep(0.98, 1.03, r);
          col = mix(cSclera, col, inIris);
          if (front < 0.0) col = cSclera * 0.6;
          // lid shadow on the upper eyeball
          col *= 1.0 - 0.35 * smoothstep(0.1, 0.75, q.y);
          vec4 diffuseColor = vec4( col, opacity * uFade );`)
        .replace('#include <opaque_fragment>', `
          { vec3 vn = normalize(normal);
            float hl = pow(max(dot(vn, normalize(vec3(-0.38, 0.5, 0.78))), 0.0), 90.0);
            float hl2 = pow(max(dot(vn, normalize(vec3(0.3, -0.25, 0.92))), 0.0), 260.0);
            outgoingLight = outgoingLight + diffuseColor.rgb * uGlowE + vec3(1.0) * (smoothstep(0.55, 0.75, hl) * 1.1 + smoothstep(0.5, 0.7, hl2) * 0.5);
            if (uGhost > 0.0) outgoingLight = mix(outgoingLight, cGhost * 1.4, uGhost * 0.6); }
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'animaleye';
    return mat;
  }

//@@PART3
  A._internal = { meshSDF, makeField, ell, cone, primDist, vnoise, smin, smax };
  return A;
})();

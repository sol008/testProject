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
    const s = P.clump || 40;
    const n = vnoise(px * s + along * s * 0.25, py * s + along * s * 0.25 + 7.1, pz * s + 3.3) * 0.75 + vnoise(px * s * 1.9, py * s * 1.9, pz * s * 1.9 + along * s * 0.5) * 0.25;
    return smooth(0.2, 0.8, n);
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
      cSclera: { value: new THREE.Color(E.sclera || '#f2efe6') }, uIrisR: { value: E.irisR || 0.58 }, uPupil: { value: 0.28 },
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

  // ================================================================================== parametric parts
  // Eye frame from a centre, gaze dir and world up → { c, x, y, z } (orthonormal; z = gaze)
  function frameOf(c, gaze, up = [0, 1, 0]) {
    const z = V3.norm(gaze), x = V3.norm(V3.cross(up, z)), y = V3.cross(z, x);
    return { c, x, y, z, to: (l) => V3.add(c, V3.add(V3.mul(x, l[0]), V3.add(V3.mul(y, l[1]), V3.mul(z, l[2])))), dir: (l) => V3.add(V3.mul(x, l[0]), V3.add(V3.mul(y, l[1]), V3.mul(z, l[2]))) };
  }
  // eyeball (UV sphere, pole = gaze) into an eye Parts with aEye extra
  function addEyeball(parts, F, r, bone) {
    const nu = 20, nv = 14;
    parts.grid(nu, nv, (u, v) => {
      const th = v * PI * 0.92, ph = u * TAU;
      const l = [sin(th) * cos(ph), sin(th) * sin(ph), cos(th)];
      return { p: F.to(V3.mul(l, r)), n: F.dir(l), skin: [[bone, 1]], x: l };
    }, true, true);
  }
  // eyelid shell: spherical patch (elevation b0..b1 as functions of azimuth a ∈ [-am, am]) at radius r around the eye,
  // with a rolled-in margin strip at the moving edge (dark "eyeliner" rim). upper=true: the edge is the lower boundary.
  function addLid(parts, F, r, bone, upper, edgeFn, farB, am, mFn, rimCol) {
    const nu = 14, nv = 6;
    const dirAt = (a, b) => [sin(a) * cos(b), sin(b), cos(a) * cos(b)];
    const base = parts.grid(nu, nv, (u, v) => {
      const a = (u * 2 - 1) * am, e = edgeFn(a);
      const b = upper ? lerp(e, farB, v * v) : lerp(e, farB, v * v);
      const l = dirAt(a, b), p = F.to(V3.mul(l, r));
      const m = mFn(p); m.rest = p;
      return { p, n: F.dir(l), skin: [[bone, 1]], m };
    }, !upper);
    // margin strip: from the edge inward toward the eyeball
    parts.grid(nu, 1, (u, v) => {
      const a = (u * 2 - 1) * am, e = edgeFn(a);
      const l = dirAt(a, e), rr = lerp(r, r * 0.955, v);
      const p = F.to(V3.mul(l, rr));
      const m = mFn(p); m.rest = p; m.col = [rimCol[0], rimCol[1], rimCol[2], 1]; m.ao = 0.8;
      const n = F.dir(dirAt(a, e + (upper ? -1 : 1) * 1.2));
      return { p, n, skin: [[bone, 1]], m };
    }, upper);
    void base;
  }
  // cupped ear: base centre B, frame (x across, y up the ear, z = the opening's facing), H height, W half width at base
  // shape: tri (pointed) | round; returns nothing (adds to parts). inner pink + furnishings via col override.
  function addEar(parts, F, H, W, o, bone, headBone, mOuter, innerCol) {
    const nu = 10, nv = 9, cup = o.cup != null ? o.cup : 0.38, th = o.thick || 0.12;
    const width = (v) => (o.round ? W * sqrt(max(0, 1 - Math.pow(v, 2.2))) * (1 - 0.2 * v) : W * Math.pow(1 - v, o.taper || 0.95) * (1 + 0.12 * sin(PI * v)));
    const mid = (u, v) => [u * width(v), v * H + (o.round ? 0 : -abs(u) * H * 0.08 * (1 - v)), -cup * W * (1 - u * u) * (1 - 0.5 * v) + (o.lean || 0) * v * v * H];
    const skinAt = (v) => (v < 0.2 ? [[bone, 0.5 + v * 2.5], [headBone, 0.5 - v * 2.5]] : [[bone, 1]]);
    const thick = (v) => th * W * (1 - 0.75 * v) + 0.0004;
    // front (inner, facing +z) and back surfaces
    for (const side of [1, -1]) {
      parts.grid(nu, nv, (uu, v) => {
        const u = uu * 2 - 1, q = mid(u, v);
        const p = F.to([q[0], q[1], q[2] + side * thick(v) * 0.5]);
        // normal ≈ ± z with a bit of cup curvature
        const n = V3.norm(F.dir([-u * 0.6 * side, -0.15 * side, side]));
        const m = mOuter(p);
        m.rest = p;
        if (side > 0) {
          const edge = abs(u), inner = smooth(0.92, 0.6, edge) * smooth(0.97, 0.75, v);
          const furn = (edge > 0.55 && v < 0.75) || v < 0.12;
          const ic = innerCol(u, v, edge);
          if (inner > 0) m.col = [ic[0], ic[1], ic[2], inner * (furn ? 0.25 : 1)];
          m.white = max(m.white, furn ? 0.9 : 0);
          m.ao = lerp(0.7, 1, smooth(0, 0.6, edge)) * lerp(0.75, 1, v);
          m.st = 0;
        }
        return { p, n, skin: skinAt(v), m };
      }, side < 0);
    }
    // rim strips joining front/back at the two side edges
    for (const s of [-1, 1]) {
      parts.grid(nv, 1, (vv, w) => {
        const v = vv, u = s, q = mid(u * 0.999, v);
        const p = F.to([q[0], q[1], q[2] + (w * 2 - 1) * thick(v) * 0.5]);
        const n = V3.norm(F.dir([s, 0.1, 0]));
        const m = mOuter(p); m.rest = p;
        return { p, n, skin: skinAt(v), m };
      }, s < 0);
    }
  }
  // generic ellipsoid mesh (for small solid parts: tongue, mouth bag, bow lobes, horns...)
  function addEllipsoid(parts, c, r, R, segU, segV, skin, mFn, inward) {
    parts.grid(segU, segV, (u, v) => {
      const th = v * PI, ph = u * TAU;
      const l = [sin(th) * cos(ph), cos(th), sin(th) * sin(ph)];
      const lp = [l[0] * r[0], l[1] * r[1], l[2] * r[2]];
      const p = V3.add(c, R ? V3.mat(R, lp) : lp);
      const nl = V3.norm([l[0] / r[0], l[1] / r[1], l[2] / r[2]]);
      const n = R ? V3.mat(R, nl) : nl;
      const m = mFn(p); m.rest = m.rest || p;
      return { p, n: inward ? V3.mul(n, -1) : n, skin: typeof skin === 'function' ? skin(p) : skin, m };
    }, !!inward, true);
  }

  // ================================================================================== face paint (ported from the design kit)
  // Normalised head-local coordinates (x = cat's left, y up, z forward, units of head radius R), as used by
  // tools/design2/tuanzi_yuyuan_mochi_catkit.js, so the 3D face marks match the approved design cards.
  function segD(px, py, ax, ay, bx, by) { const ex = bx - ax, ey = by - ay; const t = clamp(((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey), 0, 1); return sqrt((px - ax - ex * t) ** 2 + (py - ay - ey * t) ** 2); }
  function mouthMark(ax, y, lw) { // the 'w' mouth + philtrum
    const t = 0.022 * lw, r = 0.085, cy = -0.4;
    const d = sqrt((ax - r) ** 2 + (y - cy) ** 2);
    if (y < cy + 0.005 && abs(d - r) < t && ax < r * 2) return true;
    if (ax < 0.016 * lw && y > cy - 0.005 && y < -0.23) return true;
    return false;
  }
  function noseMark(x, y) { // inverted rounded triangle nose leather → 0 outside, 1 inside, 2 nostril
    const yt = -0.07, yb = -0.25;
    if (y > yt + 0.02 || y < yb - 0.01) return 0;
    const k = (y - yb) / (yt - yb); // 0 bottom .. 1 top
    const hw = 0.035 + 0.13 * Math.pow(clamp(k, 0, 1), 0.8);
    const top = y > yt ? 1 - (y - yt) / 0.02 : 1;
    if (abs(x) > hw * top) return 0;
    if (k < 0.55 && k > 0.2 && abs(abs(x) - hw * 0.62) < 0.028) return 2;
    return 1;
  }
  const FACE = {};
  FACE.tabby = (x, y, z, c) => {
    const ax = abs(x), D = c.dark, W = c.white;
    if (z > 0.55) {
      const nm = noseMark(x, y); if (nm) return nm === 2 ? c.nostril : c.nose;
      if (mouthMark(ax, y, 1)) return c.line;
      const m1 = ((ax - 0.14) / 0.32) ** 2 + ((y + 0.33) / 0.21) ** 2, m2 = (x / 0.32) ** 2 + ((y + 0.5) / 0.21) ** 2;
      if (m1 < 1 || m2 < 1) { for (const [wx, wy] of [[0.2, -0.27], [0.27, -0.31], [0.22, -0.35], [0.3, -0.24]]) if ((ax - wx) ** 2 + (y - wy) ** 2 < 0.0006) return mixc(D, W, 0.35); return (m1 < 1 && m1 > 0.75) ? mixc(W, c.base, 0.3) : W; }
    }
    if (y < -0.52 && z > 0.1) return W; // pale chin / throat
    const t = 0.03;
    if (z > 0.15) { // the classic M + brow arcs
      if (segD(ax, y, 0.0, 0.3, 0.0, 0.95) < t * 0.85) return D;
      if (segD(ax, y, 0.11, 0.24, 0.095, 0.86) < t) return D;
      if (segD(ax, y, 0.24, 0.3, 0.17, 0.72) < t) return D;
      if (segD(ax, y, 0.16, 0.21, 0.4, 0.3) < t * 0.8) return D;
    }
    if (y > 0.55 || z < 0.15) { // mackerel lines over the crown to the nape
      const lx = ax / (1 + max(0, -z) * 0.3);
      if (y > -0.4 && (lx < 0.03 || (lx > 0.1 && lx < 0.15) || (lx > 0.24 && lx < 0.285))) return D;
    }
    if (z > -0.3 && y < 0.15 && ax > 0.42) { // mascara line + cheek swirl
      if (segD(ax, y, 0.57, 0.0, 0.88, -0.06) < t * 0.95) return D;
      if (segD(ax, y, 0.55, -0.22, 0.8, -0.27) < t * 0.85 || segD(ax, y, 0.8, -0.27, 0.93, -0.12) < t * 0.85) return D;
    }
    // pale "spectacles" around the eyes
    if (z > 0.3 && y > -0.12 && y < 0.24 && abs(ax - 0.36) < 0.2 && ((ax - 0.36) / 0.2) ** 2 + ((y - 0.06) / 0.18) ** 2 < 1) return mixc(W, c.base, 0.45);
    return null;
  };
  FACE.calico = (x, y, z, c) => {
    const ax = abs(x);
    if (z > 0.55) { const nm = noseMark(x, y); if (nm) return nm === 2 ? c.nostril : c.nose; if (mouthMark(ax, y, 0.9)) return c.line; }
    // white blaze + muzzle, grey over the cat's right eye/ear (x<0), cream patch over the left brow (x>0)
    const n = (vnoise(x * 3 + 4, y * 3, z * 3) - 0.5) * 0.44;
    const blaze = ax < 0.1 + max(0, -y + 0.1) * 0.55 + n * 0.3 && z > 0.2 && y < 0.6;
    if (blaze || y < -0.18 + n * 0.3) return c.white;
    if (x < 0) { if (y > -0.2 + n) return (y > 0.45 || ax > 0.55) ? mixc(c.grey, c.greyDark, 0.25) : c.grey; }
    else { const cr = ((x - 0.32) / 0.38) ** 2 + ((y - 0.48) / 0.34) ** 2 + n; if (cr < 1 && z > -0.2) return c.cream; if (z < -0.1 && y > 0.2 + n) return mixc(c.grey, c.cream, 0.35); }
    return c.white;
  };
  FACE.orange = (x, y, z, c) => FACE.tabby(x, y, z, c);
  FACE.leopard = (x, y, z, c) => {
    const ax = abs(x), D = c.dark, W = c.white;
    if (z > 0.55) { const nm = noseMark(x, y); if (nm) return nm === 2 ? c.nostril : c.nose; if (mouthMark(ax, y, 1)) return c.line; }
    if (z > 0.25) { const m1 = ((ax - 0.13) / 0.3) ** 2 + ((y + 0.33) / 0.2) ** 2, m2 = (x / 0.3) ** 2 + ((y + 0.5) / 0.2) ** 2; if (m1 < 1 || m2 < 1) return W; }
    const back = max(0, -z), lx = ax / (1 + back * 0.35);
    if (y > 0.16 || (z < 0.15 && y > -0.6)) {
      if (lx < 0.03) return D;
      if (lx > 0.075 && lx < 0.125 && z > 0.05) return W; // the 石虎 white forehead lines
      if (lx > 0.155 && lx < 0.2) return D;
    }
    if (z > -0.3 && y < 0.12 && ax > 0.4) {
      if (segD(ax, y, 0.6, -0.03, 1.0, -0.17) < 0.035 || segD(ax, y, 0.5, -0.38, 0.92, -0.5) < 0.033) return D;
      if (segD(ax, y, 0.56, -0.2, 0.95, -0.33) < 0.045) return W;
    }
    return null;
  };
  function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  // ================================================================================== cat family plan
  // cfg: { coat:'tabby'|'calico'|'orange'|'leopard', pal (hex palette), fat, len, leg, head, cheek, ear:{size,flare,round,
  //   lynx}, eye:{iris,iris2,round,pupil,lid}, tail:{len,r,fluff}, fluff (long hair 0..1), ruff, scale, bow }
  function catPlan(cfg) {
    const f = cfg.fat || 1, sf = sqrt(f), L = cfg.len || 1, lg = cfg.leg || 1, hs = cfg.head || 1.15, ch = cfg.cheek || 1, lr = cfg.legR || 1;
    const fl = cfg.fluff || 0;
    const legH = 0.155 * lg, zH = -0.14 * L, zS = 0.13 * L, spY = legH + 0.06;
    const R = 0.05 * hs; // head radius
    const hc = [0, spY + 0.075 + 0.012 * hs, zS + 0.085 + R * 0.35];
    const J = [];
    const j = (name, parent, p) => J.push([name, parent, p]);
    j('root', null, [0, 0, 0]);
    j('hips', 'root', [0, spY, zH]);
    j('spine1', 'hips', [0, spY + 0.006, lerp(zH, zS, 0.33)]);
    j('belly', 'spine1', [0, spY - 0.05 * f, lerp(zH, zS, 0.45)]);
    j('spine2', 'spine1', [0, spY + 0.006, lerp(zH, zS, 0.66)]);
    j('chest', 'spine2', [0, spY - 0.004, zS]);
    j('neck', 'chest', [0, spY + 0.022, zS + 0.04]);
    j('head', 'neck', [0, hc[1] - 0.45 * R, hc[2] - 0.75 * R]);
    j('jaw', 'head', [0, hc[1] - 0.3 * R, hc[2] + 0.1 * R]);
    // eyes
    const eyeR = R * (cfg.eye && cfg.eye.size || 0.4);
    const eyes = [];
    for (const s of [1, -1]) {
      const ez = cfg.eye && cfg.eye.z != null ? cfg.eye.z : 0.5;
      const c = [hc[0] + s * R * (cfg.eye && cfg.eye.x || 0.3), hc[1] + R * (cfg.eye && cfg.eye.y || 0.07), hc[2] + R * ez];
      const yaw = s * (cfg.eye && cfg.eye.yaw || 0.36);
      const F = frameOf(c, [sin(yaw), 0.04, cos(yaw)]);
      const sx = s > 0 ? 'L' : 'R';
      j('eye' + sx, 'head', c); j('lidU' + sx, 'head', c); j('lidD' + sx, 'head', c);
      eyes.push({ s, c, F, sx, r: eyeR });
    }
    // ears
    const es = (cfg.ear && cfg.ear.size) || 1, earH = R * 0.84 * es, earW = R * 0.36 * es;
    const ears = [];
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      const base = [s * R * 0.5, hc[1] + R * 0.6, hc[2] - R * 0.1];
      const flare = (cfg.ear && cfg.ear.flare != null ? cfg.ear.flare : 0.3);
      const up = V3.norm([s * sin(flare), cos(flare), -0.12]);
      const face = V3.norm([s * 0.42, 0.05, 1]);
      const F = frameOf(base, face, up);
      // re-orthonormalise so y = up exactly
      const yv = up, zv = V3.norm(V3.sub(face, V3.mul(yv, V3.dot(face, yv)))), xv = V3.cross(yv, zv);
      F.x = xv; F.y = yv; F.z = zv;
      j('ear' + sx, 'head', base);
      ears.push({ s, sx, F, base });
    }
    // tail chain: base behind the rump, drooping arc
    const tl = 0.27 * (cfg.tail && cfg.tail.len || 1), tN = 7;
    const tailP = [];
    let tp = [0, spY + 0.012, zH - 0.05];
    for (let i = 0; i <= tN; i++) {
      tailP.push(tp);
      const a = -0.25 - 0.55 * (i / tN);
      tp = V3.add(tp, [0, sin(a) * tl / tN, -cos(a) * tl / tN]);
    }
    for (let i = 0; i < tN; i++) j('tail' + (i + 1), i ? 'tail' + i : 'hips', tailP[i]);
    // legs (x > 0 = the cat's left)
    const hx = 0.04 * sf, fx = 0.043 * sf;
    const legs = {};
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      j('thigh' + sx, 'hips', [s * hx, legH + 0.035, zH]);
      j('shin' + sx, 'thigh' + sx, [s * (hx + 0.004), 0.105 * lg, zH + 0.05 * lg]);
      j('hock' + sx, 'shin' + sx, [s * hx, 0.055 * lg, zH - 0.035 * lg]);
      j('foot' + sx, 'hock' + sx, [s * hx, 0.017, zH - 0.012]);
      j('scap' + sx, 'chest', [s * 0.028 * sf, spY + 0.032, zS - 0.045]);
      j('arm' + sx, 'scap' + sx, [s * fx, legH + 0.02, zS + 0.02]);
      j('fore' + sx, 'arm' + sx, [s * fx, 0.105 * lg, zS - 0.02]);
      j('wrist' + sx, 'fore' + sx, [s * (fx - 0.003), 0.032, zS]);
      j('hand' + sx, 'wrist' + sx, [s * (fx - 0.003), 0.017, zS + 0.012]);
      legs['H' + sx] = { s, front: false, chain: ['thigh' + sx, 'shin' + sx, 'hock' + sx, 'foot' + sx], toe: [s * hx, 0.012, zH + 0.024], girdle: 'hips' };
      legs['F' + sx] = { s, front: true, scap: 'scap' + sx, chain: ['arm' + sx, 'fore' + sx, 'wrist' + sx, 'hand' + sx], toe: [s * (fx - 0.003), 0.012, zS + 0.042], girdle: 'chest' };
    }
    if (cfg.ruff) j('ruff', 'chest', [0, spY + 0.0, zS + 0.05]);
    const JP = {}; for (const [n, , p] of J) JP[n] = p;

    // ----- primitives
    const prims = [];
    const P = (p) => { prims.push(p); return p; };
    const spineBones = [['hips', JP.hips[2]], ['spine1', JP.spine1[2]], ['spine2', JP.spine2[2]], ['chest', JP.chest[2]]];
    const spineW = (x, y, z) => {
      if (z <= spineBones[0][1]) return [['hips', 1]];
      for (let i = 0; i < spineBones.length - 1; i++) {
        const [a, za] = spineBones[i], [b, zb] = spineBones[i + 1];
        if (z <= zb) { const t = smooth(0, 1, (z - za) / (zb - za)); return [[a, 1 - t], [b, t]]; }
      }
      return [['chest', 1]];
    };
    const torsoSc = (x, y, z) => -z / 0.034 + abs(x) * 5;
    const TORSO = { region: 'torso', boneFn: spineW, st: 1, scFn: torsoSc, fluff: fl * 0.009, flow: [0, -0.2, -1], clump: 55 };
    P(ell([0, spY - 0.004, zH + 0.012], [0.066 * f, 0.07 * sf, 0.078], Object.assign({ bone: 'hips', k: 0.04 }, TORSO)));
    P(ell([0, spY - 0.012, lerp(zH, zS, 0.5)], [0.072 * f, 0.08 * sf, 0.125 * L], Object.assign({ bone: 'spine1', k: 0.04 }, TORSO)));
    P(ell([0, spY - 0.008, zS - 0.004], [0.06 * Math.pow(f, 0.7), 0.074 * sf, 0.074], Object.assign({ bone: 'chest', k: 0.035 }, TORSO)));
    P(ell([0, spY - 0.052 * f, lerp(zH, zS, 0.42)], [0.058 * f, 0.038 * f, 0.1 * L], Object.assign({}, TORSO, { bone: 'belly', boneFn: null, k: 0.04, region: 'belly', fluff: fl * 0.012, flow: [0, -1, -0.3] })));
    // neck / ruff
    P(cone([0, spY + 0.012, zS + 0.01], [0, hc[1] - R * 0.25, hc[2] - R * 0.35], 0.05 * sf, 0.042 * hs, { bone: 'neck', bp: 'chest', bc: 'head', k: 0.03, region: 'neck', st: 0.8, scFn: torsoSc, fluff: fl * 0.012, flow: [0, -0.6, -1] }));
    if (cfg.ruff) {
      P(ell([0, spY + 0.004, zS + 0.05], [0.075 * cfg.ruff, 0.07 * cfg.ruff, 0.055 * cfg.ruff], { rot: [-0.5, 0, 0], bone: 'ruff', k: 0.035, region: 'ruff', white: 1, fluff: 0.016, flow: [0, -1, 0.35], clump: 45 }));
    }
    // head
    const H = (o, pos) => [hc[0] + pos[0] * R, hc[1] + pos[1] * R, hc[2] + pos[2] * R];
    const HEADM = { region: 'head', bone: 'head' };
    P(ell(H(0, [0, 0.04, -0.04]), [R * 1.03, R * 0.88, R * 0.93], Object.assign({ k: 0.012 }, HEADM)));
    for (const s of [1, -1]) {
      P(ell(H(0, [s * (0.36 + 0.07 * ch), -(0.22 + 0.05 * ch), 0.14]), [R * (0.5 + 0.14 * ch), R * (0.4 + 0.07 * ch), R * 0.5], Object.assign({ k: R * 0.17, fluff: fl * 0.006, flow: [s, -0.6, -0.5], clump: 70 }, HEADM)));
      P(ell(H(0, [s * 0.15, -0.3, 0.69]), [R * 0.19, R * 0.17, R * 0.19], Object.assign({ k: R * 0.12 }, HEADM))); // whisker pads
    }
    P(ell(H(0, [0, -0.03, 0.62]), [R * 0.17, R * 0.2, R * 0.24], Object.assign({ k: R * 0.15 }, HEADM))); // bridge
    P(ell(H(0, [0, -0.14, 0.86]), [R * 0.11, R * 0.075, R * 0.07], Object.assign({ k: R * 0.04 }, HEADM))); // nose leather
    P(ell(H(0, [0, -0.47, 0.54]), [R * 0.15, R * 0.11, R * 0.13], { region: 'head', bone: 'jaw', k: R * 0.12 })); // chin
    // legs
    const LEGM = { region: 'leg', st: 0.75, scFn: (x, y) => y / 0.03, fluff: fl * 0.004, flow: [0, -1, -0.4] };
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      const g = (n) => JP[n + sx];
      P(ell(V3.lerp(g('thigh'), g('shin'), 0.4).map((v, i) => v + (i === 0 ? s * 0.01 : i === 1 ? 0.005 : 0)), [0.034 * sf, 0.058, 0.058], Object.assign({}, LEGM, { rot: [0.45, 0, 0], bone: 'thigh' + sx, bp: 'hips', k: 0.03, region: 'haunch', fluff: fl * 0.014 })));
      P(cone(g('thigh'), g('shin'), 0.036 * sf * lr, 0.022 * lr, Object.assign({}, LEGM, { bone: 'thigh' + sx, bp: 'hips', bc: 'shin' + sx, k: 0.02 })));
      P(cone(g('shin'), g('hock'), 0.021 * lr, 0.0145 * lr, Object.assign({}, LEGM, { bone: 'shin' + sx, bc: 'hock' + sx, k: 0.012 })));
      P(cone(g('hock'), g('foot'), 0.0145 * lr, 0.0138 * lr, Object.assign({}, LEGM, { bone: 'hock' + sx, bc: 'foot' + sx, k: 0.01, region: 'lowleg' })));
      P(ell(V3.lerp(g('foot'), legs['H' + sx].toe, 0.45), [0.0185 * lr, 0.0145 * lr, 0.028 * lr], Object.assign({}, LEGM, { bone: 'foot' + sx, k: 0.01, region: 'paw' })));
      P(ell(V3.lerp(g('scap'), g('arm'), 0.55), [0.026 * sf, 0.045, 0.034], Object.assign({}, LEGM, { rot: [-0.5, 0, 0], bone: 'scap' + sx, bp: 'chest', k: 0.03, region: 'shoulder' })));
      P(cone(g('arm'), g('fore'), 0.029 * sf * lr, 0.021 * lr, Object.assign({}, LEGM, { bone: 'arm' + sx, bp: 'scap' + sx, bc: 'fore' + sx, k: 0.022 })));
      P(cone(g('fore'), g('wrist'), 0.019 * lr, 0.0145 * lr, Object.assign({}, LEGM, { bone: 'fore' + sx, bc: 'wrist' + sx, k: 0.012 })));
      P(cone(g('wrist'), g('hand'), 0.0145 * lr, 0.0145 * lr, Object.assign({}, LEGM, { bone: 'wrist' + sx, bc: 'hand' + sx, k: 0.01, region: 'lowleg' })));
      P(ell(V3.lerp(g('hand'), legs['F' + sx].toe, 0.4), [0.019 * lr, 0.0145 * lr, 0.026 * lr], Object.assign({}, LEGM, { bone: 'hand' + sx, k: 0.01, region: 'paw' })));
    }
    // tail
    const tr0 = 0.018 * (cfg.tail && cfg.tail.r || 1), tr1 = tr0 * (cfg.tail && cfg.tail.taper != null ? cfg.tail.taper : 0.62);
    for (let i = 0; i < tN; i++) {
      P(cone(tailP[i], tailP[i + 1], lerp(tr0, tr1, i / tN), lerp(tr0, tr1, (i + 1) / tN), {
        bone: 'tail' + (i + 1), bp: i ? 'tail' + i : 'hips', bc: i < tN - 1 ? 'tail' + (i + 2) : null, k: i ? 0.008 : 0.025, region: 'tail',
        st: 1, sc: [i * 8 / tN, (i + 1) * 8 / tN], tailT: [i / tN, (i + 1) / tN], fluff: (cfg.tail && cfg.tail.fluff || 0), flow: V3.sub(tailP[i + 1], tailP[i]), clump: 40,
      }));
    }
    return {
      cfg, joints: J, JP, prims, legs, eyes, ears, hc, R, spY, legH, zH, zS, tailN: tN,
      h: cfg.voxel || 0.0125, hullH: 0.017, warp: { c: hc, m: 2.4, R: R * 1.3 },
      scale: cfg.scale || 1.5,
    };
  }

  // ================================================================================== coats
  const PALETTES = {
    tabby: { base: '#8E97A3', base2: '#C6CDD6', dark: '#545C69', white: '#E3E5E8', nose: '#C98884', nostril: '#6E4A4C', inner: '#E2AAA6', line: '#2E3440', rim: '#2E3440', iris: '#7E8E36', iris2: '#CFCB5E', paw: '#B9BFC8' },
    calico: { base: '#F5F2EC', base2: '#FFFFFF', dark: '#7F8894', white: '#F7F4EF', grey: '#9BA3AE', greyDark: '#7F8894', cream: '#EBC79D', nose: '#EC9FA8', nostril: '#B56A76', inner: '#EDB3B3', line: '#4A4450', rim: '#4A4450', iris: '#8DB43A', iris2: '#DCE45E', paw: '#F7F4EF' },
    orange: { base: '#E4A464', base2: '#F4CB92', dark: '#B4682F', white: '#FBF2E2', nose: '#E39486', nostril: '#8A4A40', inner: '#EFB0A8', line: '#5A3220', rim: '#5A3220', iris: '#6E9A36', iris2: '#D6C24E', paw: '#F6E3C8' },
    leopard: { base: '#C49A62', base2: '#DDBA88', dark: '#3B2A1E', white: '#F3ECDD', nose: '#B8695B', nostril: '#5A2E28', inner: '#D7B1A0', line: '#3A2617', rim: '#2A1E16', iris: '#93A44C', iris2: '#E9C752', paw: '#E8D6B8', earBack: '#2B2320' },
  };
  // per-vertex coat rules on top of the primitive masks. n = surface normal, reg = region weights
  function coatPost(plan, x, y, z, n, M, reg) {
    const cfg = plan.cfg, coat = cfg.coat, spY = plan.spY, lg = cfg.leg || 1;
    const torso = (reg.torso || 0) + (reg.belly || 0) + (reg.neck || 0);
    const legish = (reg.leg || 0) + (reg.lowleg || 0) + (reg.paw || 0) + (reg.haunch || 0) + (reg.shoulder || 0);
    if (coat === 'tabby' || coat === 'orange') {
      M.st *= lerp(1, smooth(spY - 0.08, spY - 0.025, y), torso) * lerp(1, 0.25, reg.paw || 0);
      M.white = max(M.white, smooth(-0.15, -0.65, n[1]) * smooth(spY - 0.03, spY - 0.07, y) * torso * 0.9);
      // dorsal line
      if (abs(x) < 0.016 && n[1] > 0.55 && torso > 0.5) M.col = [...hex(PAL(plan).dark), 0.85 * smooth(0.016, 0.008, abs(x))];
      // lighter inner legs and paws ("socks")
      const inner = smooth(0.2, 0.75, -Math.sign(x || 1) * n[0]) * legish;
      M.white = max(M.white, inner * 0.7 * smooth(0.16 * lg, 0.04, y));
      if (reg.paw > 0.3) { M.col = [...hex(PAL(plan).paw), 0.55 * reg.paw]; M.st = 0; }
      if (M.tailT != null && M.tailT > 0.86) M.col = [...hex(PAL(plan).dark), smooth(0.86, 0.9, M.tailT) * reg.tail];
      M.tick = 1;
    } else if (coat === 'calico') {
      M.st = 0;
      const neckY = spY + 0.03;
      const bib = smooth(-0.1, 0.45, n[2]) * smooth(neckY + 0.04, neckY - 0.02, y) * smooth(plan.zS - 0.06, plan.zS + 0.02, z);
      const under = smooth(-0.05, -0.45, n[1]);
      const low = smooth(spY - 0.035, spY - 0.075, y);
      M.white = max(M.white, bib, under * (1 - (reg.tail || 0)), low * (1 - (reg.tail || 0)));
      // dilute patches on the top surfaces (grey dominant, cream islands), seeded noise
      const top = smooth(-0.15, 0.4, n[1]) * (1 - M.white);
      const n1 = vnoise(x * 11 + 2.3, y * 11, z * 11 + 1.1) * 0.65 + vnoise(x * 25, y * 25 + 3, z * 25) * 0.35;
      const n2 = vnoise(x * 17 + 9, y * 17 + 4, z * 17);
      M.pa = max(M.pa, top * smooth(0.4, 0.48, n1) * (1 - (reg.tail || 0)));
      M.pb = max(M.pb, top * smooth(0.5, 0.6, n2) * (1 - M.pa * 0.7) * (1 - (reg.tail || 0)));
      if (M.tailT != null && reg.tail > 0.3) { // banded grey / cream plume with a white tip
        const ph = sin(M.tailT * 15 + vnoise(x * 30, y * 30, z * 30) * 3);
        M.pa = M.tailT > 0.88 ? 0 : (ph > 0.2 ? 1 : 0) * reg.tail;
        M.pb = M.tailT > 0.88 ? 0 : (ph <= 0.2 && ph > -0.5 ? 1 : 0) * reg.tail;
        M.white = M.tailT > 0.88 ? 1 : (ph <= -0.5 ? 0.8 : 0);
      }
      M.tick = 0.3;
    } else if (coat === 'leopard') {
      M.spot = max(M.spot, (1 - M.white) * (torso + legish * 0.8) * (1 - (reg.paw || 0)));
      M.white = max(M.white, smooth(-0.15, -0.6, n[1]) * smooth(spY - 0.03, spY - 0.07, y) * torso);
      M.st = (reg.tail || 0) * (M.tailT > 0.45 ? 1 : 0);
      if (M.tailT != null && M.tailT > 0.88) M.col = [...hex(PAL(plan).dark), reg.tail];
      if (reg.paw > 0.3) M.col = [...hex(PAL(plan).paw), 0.5 * reg.paw];
    }
  }
  const PAL = (plan) => Object.assign({}, PALETTES[plan.cfg.coat] || PALETTES.tabby, plan.cfg.pal || {});

  // painted face texture (lat-long around the head centre). The head surface is found by sphere-tracing the head-only
  // field on a coarse grid; each texel then evaluates the face-mark function at its true surface point.
  const FLON = 2.2, FLAT = 1.5;
  function faceTexture(plan, key) {
    const prims = plan.prims.filter((p) => p.region === 'head' && !p.sub);
    const field = makeField(prims);
    const hc = plan.hc, R = plan.R;
    const gw = 96, gh = 48, rad = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const lon = ((i + 0.5) / gw * 2 - 1) * FLON, lat = ((j + 0.5) / gh * 2 - 1) * FLAT;
      const d = [sin(lon) * cos(lat), sin(lat), cos(lon) * cos(lat)];
      let t = R * 2.4;
      for (let k = 0; k < 60; k++) { const v = min(R * 0.3, field(hc[0] + d[0] * t, hc[1] + d[1] * t, hc[2] + d[2] * t)); t -= v * 0.9; if (abs(v) < R * 0.002 || t < 0) break; }
      rad[i + j * gw] = max(t, R * 0.2);
    }
    const radAt = (u, v) => { // bilinear
      const fx = clamp(u * gw - 0.5, 0, gw - 1.001), fy = clamp(v * gh - 0.5, 0, gh - 1.001);
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const a = rad[ix + iy * gw], b = rad[ix + 1 + iy * gw], c = rad[ix + (iy + 1) * gw], dd = rad[ix + 1 + (iy + 1) * gw];
      return lerp(lerp(a, b, tx), lerp(c, dd, tx), ty);
    };
    const pal = PAL(plan), C = {};
    for (const k in pal) if (typeof pal[k] === 'string' && pal[k][0] === '#') C[k] = hexS(pal[k]);
    const fn = FACE[plan.cfg.coat] || FACE.tabby;
    return G.R3M.tex('animalface|' + key, 768, 384, (g, w, h) => {
      const img = g.createImageData(w, h), D = img.data;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        let r = 0, gg = 0, b = 0, a = 0;
        for (let sy = 0; sy < 2; sy++) for (let sx2 = 0; sx2 < 2; sx2++) {
          const uu = (px + 0.25 + sx2 * 0.5) / w, vv = 1 - (py + 0.25 + sy * 0.5) / h;
          const lon = (uu * 2 - 1) * FLON, lat = (vv * 2 - 1) * FLAT, rr = radAt(uu, vv);
          const c = fn(sin(lon) * cos(lat) * rr / R, sin(lat) * rr / R, cos(lon) * cos(lat) * rr / R, C);
          if (c) { r += c[0]; gg += c[1]; b += c[2]; a += 1; }
        }
        const o = (px + py * w) * 4;
        if (a) { D[o] = r / a * 255; D[o + 1] = gg / a * 255; D[o + 2] = b / a * 255; D[o + 3] = a / 4 * 255; }
      }
      g.putImageData(img, 0, 0);
    });
  }

  // ================================================================================== asset build
  function vertexInfo(plan, skinPrims, W, x, y, z, n) {
    primWeights(skinPrims, x, y, z, W);
    const acc = {}, reg = {}, M = M0();
    let sc = 0, scw = 0, tailT = 0, tw = 0;
    for (let i = 0; i < skinPrims.length; i++) {
      const w = W.raw[i]; if (w <= 0) continue;
      const P = skinPrims[i], t = W.ts[i];
      boneShare(P, t, acc, w, x, y, z);
      reg[P.region || 'body'] = (reg[P.region || 'body'] || 0) + w;
      M.white += w * (P.white || 0); M.pa += w * (P.pa || 0); M.pb += w * (P.pb || 0); M.st += w * (P.st || 0); M.spot += w * (P.spot || 0);
      if (P.sc) { sc += w * lerp(P.sc[0], P.sc[1], t); scw += w; } else if (P.scFn) { sc += w * P.scFn(x, y, z); scw += w; }
      if (P.tailT) { tailT += w * lerp(P.tailT[0], P.tailT[1], t); tw += w; }
    }
    M.sc = scw > 0 ? sc / scw : 0;
    if (tw > 0.05) M.tailT = tailT / tw;
    // stripe coordinates of different primitives disagree at junctions → fade stripes where regions mix
    let dom = 0; for (const k in reg) dom = max(dom, reg[k]);
    M.st *= smooth(0.5, 0.85, dom);
    coatPost(plan, x, y, z, n, M, reg);
    const hw = (reg.head || 0);
    if (hw > 0) {
      const dx = x - plan.hc[0], dy = y - plan.hc[1], dz = z - plan.hc[2];
      const lon = Math.atan2(dx, dz), lat = Math.atan2(dy, Math.hypot(dx, dz));
      M.fu = 0.5 + lon / (2 * FLON); M.fv = 0.5 + lat / (2 * FLAT);
      M.face = abs(lon) < FLON * 0.97 ? hw : 0;
      M.st *= 1 - hw;
    }
    return { skin: topSkin(acc), M, reg };
  }

  function buildAsset(id, spec) {
    const THREE = T3();
    const plan = planFor(id, spec);
    const t0 = performance.now();
    const prims = plan.prims;
    const field = makeField(prims);
    const mesh = meshSDF(field, prims, { h: plan.h, warp: plan.warp });
    const skinPrims = prims.filter((p) => !p.sub && !p.noSkin);
    const NP = skinPrims.length;
    const W = { ds: new Float64Array(NP), ts: new Float64Array(NP), raw: new Float64Array(NP) };
    const body = new Parts();
    const nv = mesh.pos.length / 3;
    for (let v = 0; v < nv; v++) {
      const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2];
      const n = [mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2]];
      const info = vertexInfo(plan, skinPrims, W, x, y, z, n);
      info.M.ao = sdfAO(field, x, y, z, n[0], n[1], n[2], plan.h * 1.6);
      body.vert([x, y, z], n, info.skin, info.M);
    }
    body.idx = mesh.idx.slice();
    const mAt = (p) => { const r = vertexInfo(plan, skinPrims, W, p[0], p[1], p[2], [0, 1, 0]); return r.M; };
    plan.mAt = mAt;
    const pal = PAL(plan);
    // eyelids (inside the body mesh so they share the coat shader) and ears
    const rimC = hex(pal.rim);
    for (const e of plan.eyes) {
      const am = 0.95;
      // open-state lid edges sit on the rim of the exposed eye dome (cat eye: arched upper, flatter lower lid)
      addLid(body, e.F, e.r * 1.025, 'lidU' + e.sx, true, (a) => 0.5 + 0.12 * (1 - (a / am) ** 2) + 0.05 * e.s * a, 1.35, am, mAt, rimC);
      addLid(body, e.F, e.r * 1.02, 'lidD' + e.sx, false, (a) => -0.5 - 0.06 * (1 - (a / am) ** 2) + 0.06 * e.s * a, -1.3, am, mAt, rimC);
    }
    const inner = hex(pal.inner), innerD = mixc(hex(pal.inner), hex('#6a3a3c'), 0.35);
    for (const e of plan.ears) {
      const R = plan.R, es = plan.cfg.ear && plan.cfg.ear.size || 1;
      addEar(body, e.F, R * 0.84 * es, R * 0.36 * es, { round: plan.cfg.ear && plan.cfg.ear.round, cup: 0.42, thick: 0.16 }, 'ear' + e.sx, 'head',
        (p) => earBackM(plan, p, e), (u, v, edge) => mixc(innerD, inner, smooth(0.0, 0.6, edge) * 0.6 + v * 0.4));
    }
    if (plan.parts) plan.parts(body, plan, mAt);
    // eyes
    const eyeP = new Parts();
    for (const e of plan.eyes) addEyeball(eyeP, e.F, e.r, 'eye' + e.sx);
    // hull for the outline (coarse SDF, no warp)
    // hull: no fur noise (it would pierce the fine surface), slightly inflated instead; eye sockets kept closed
    const hullPrims = prims.filter((p) => !p.noHull && !p.sub).map((p) => {
      const q = Object.assign({}, p, { fluff: 0, bb: null });
      const inf = (p.fluff || 0) * 0.55;
      if (q.type === 'e') { q.rx += inf; q.ry += inf; q.rz += inf; } else { q.r1 += inf; q.r2 += inf; }
      return q;
    });
    const hm = meshSDF(makeField(hullPrims), hullPrims, { h: plan.hullH });
    const hull = new Parts();
    for (let v = 0; v < hm.pos.length / 3; v++) {
      const x = hm.pos[v * 3], y = hm.pos[v * 3 + 1], z = hm.pos[v * 3 + 2];
      primWeights(skinPrims, x, y, z, W);
      const acc = {}; for (let i = 0; i < NP; i++) if (W.raw[i] > 0) boneShare(skinPrims[i], W.ts[i], acc, W.raw[i], x, y, z);
      hull.vert([x, y, z], [hm.nrm[v * 3], hm.nrm[v * 3 + 1], hm.nrm[v * 3 + 2]], topSkin(acc));
    }
    hull.idx = hm.idx;
    // bones
    const boneNames = plan.joints.map((jj) => jj[0]);
    const bi = {}; boneNames.forEach((nm, i) => (bi[nm] = i));
    const S = plan.scale;
    const asset = {
      id, plan, S, boneNames, bi,
      geo: toGeometry(body, bi, S, true), hull: toGeometry(hull, bi, S, false), eyeGeo: toGeometry(eyeP, bi, S, false, true),
      faceTex: faceTexture(plan, id), pal,
    };
    // bounds for culling (generous; animation stays inside)
    asset.geo.computeBoundingBox();
    const bb = asset.geo.boundingBox; const sz = bb.getSize(new THREE.Vector3());
    asset.sphere = new THREE.Sphere(bb.getCenter(new THREE.Vector3()), sz.length() * 0.75);
    asset.height = bb.max.y;
    asset.buildMs = performance.now() - t0;
    return asset;
  }
  function earBackM(plan, p, e) {
    const M = plan.mAt(p), coat = plan.cfg.coat, pal = PAL(plan);
    M.st = 0; M.white = 0;
    if (coat === 'calico') { M.pa = e.s < 0 ? 1 : 0; M.pb = e.s > 0 ? 1 : 0; }
    else if (coat === 'leopard') M.col = [...hex(pal.earBack), 1];
    else M.col = [...hex(pal.dark), 0.35];
    M.face = 0;
    return M;
  }
  function toGeometry(parts, bi, S, coat, eye) {
    const THREE = T3();
    const n = parts.n;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), nrm = new Float32Array(parts.nrm), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n * 3; i++) pos[i] = parts.pos[i] * S;
    for (let v = 0; v < n; v++) {
      const sk = parts.skin[v] || [['root', 1]];
      for (let k = 0; k < 4; k++) { const e = sk[k]; si[v * 4 + k] = e ? (bi[e[0]] != null ? bi[e[0]] : 0) : 0; sw[v * 4 + k] = e ? e[1] : 0; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (coat) {
      const rest = new Float32Array(n * 3), aM = new Float32Array(n * 4), aS = new Float32Array(n * 4), aC = new Float32Array(n * 4), aF = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) {
        const m = parts.m[v] || M0(), r = m.rest || [parts.pos[v * 3], parts.pos[v * 3 + 1], parts.pos[v * 3 + 2]];
        rest[v * 3] = r[0]; rest[v * 3 + 1] = r[1]; rest[v * 3 + 2] = r[2];
        aM[v * 4] = m.white; aM[v * 4 + 1] = m.pa; aM[v * 4 + 2] = m.pb; aM[v * 4 + 3] = clamp(m.st, 0, 1);
        aS[v * 4] = m.sc; aS[v * 4 + 1] = clamp(m.spot, 0, 1); aS[v * 4 + 2] = m.ao; aS[v * 4 + 3] = m.tick;
        if (m.col) { aC[v * 4] = m.col[0]; aC[v * 4 + 1] = m.col[1]; aC[v * 4 + 2] = m.col[2]; aC[v * 4 + 3] = m.col[3]; }
        aF[v * 3] = m.fu; aF[v * 3 + 1] = m.fv; aF[v * 3 + 2] = m.face;
      }
      g.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
      g.setAttribute('aM', new THREE.BufferAttribute(aM, 4));
      g.setAttribute('aS', new THREE.BufferAttribute(aS, 4));
      g.setAttribute('aCol', new THREE.BufferAttribute(aC, 4));
      g.setAttribute('aFace', new THREE.BufferAttribute(aF, 3));
    }
    if (eye) {
      const ae = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) { const x = parts.extra[v] || [0, 0, 1]; ae[v * 3] = x[0]; ae[v * 3 + 1] = x[1]; ae[v * 3 + 2] = x[2]; }
      g.setAttribute('aEye', new THREE.BufferAttribute(ae, 3));
    }
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(parts.idx, 1) : new THREE.Uint16BufferAttribute(parts.idx, 1));
    return g;
  }

  // ================================================================================== species → plan
  const PETS = {
    yuyuan: { coat: 'tabby', fat: 1.5, head: 1.36, cheek: 1.3, ear: { size: 1.18, flare: 0.28 }, eye: { yaw: 0.3, round: false, pupil: 0.2, lid: 0.34 }, tail: { len: 0.9, r: 1.35 }, scale: 1.5, leg: 0.84, len: 0.94, legR: 1.25 },
    mochi: { coat: 'calico', fat: 1.32, head: 1.26, cheek: 1.05, ear: { size: 1.15, flare: 0.24, lynx: 1 }, eye: { yaw: 0.3, round: true, pupil: 0.42, lid: 0.08 }, tail: { len: 1.1, r: 1.9, taper: 0.9, fluff: 0.014 }, fluff: 1, ruff: 1.15, scale: 1.55, leg: 0.9, len: 1.08, legR: 1.2 },
    cat: { coat: 'orange', fat: 1.0, head: 1.18, cheek: 0.75, ear: { size: 1.05, flare: 0.3 }, eye: { yaw: 0.32, pupil: 0.25 }, tail: { len: 1.05 }, scale: 1.45, leg: 1.0, len: 1.0, legR: 1.05 },
    leopard: { coat: 'leopard', fat: 1.05, head: 1.18, cheek: 0.85, ear: { size: 0.95, flare: 0.36, round: true }, eye: { yaw: 0.32, round: true, pupil: 0.5 }, tail: { len: 1.05, r: 1.2, taper: 0.85 }, scale: 1.45, leg: 1.0, len: 1.05, legR: 1.05 },
  };
  function planFor(id, spec) {
    const sp = spec.species;
    if (PETS[id]) return catPlan(PETS[id]);
    if (sp === 'leopardcat') return catPlan(Object.assign({}, PETS.leopard, { scale: PETS.leopard.scale * (spec.size || 1) / 1.3 * 1.15 }));
    return catPlan(PETS.cat);
  }

  // ================================================================================== instance
  const BONE_ALIAS = { spine: 'spine1', handL: 'handL', handR: 'handR', footL: 'footL', footR: 'footR', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head' };
  class AnimalInst {
    constructor(asset, opts = {}) {
      const THREE = T3();
      this.asset = asset; this.id = asset.id; this.opts = opts;
      const plan = asset.plan, S = asset.S;
      this.root = new THREE.Group(); this.root.name = 'animal:' + asset.id;
      // bones (rest orientation = identity, positions relative to the parent)
      this.bones = []; this.B = {};
      for (const [name, parent, p] of plan.joints) {
        const b = new THREE.Bone(); b.name = name;
        const pp = parent ? plan.JP[parent] : [0, 0, 0];
        b.position.set((p[0] - pp[0]) * S, (p[1] - pp[1]) * S, (p[2] - pp[2]) * S);
        if (parent) this.B[parent].add(b);
        this.bones.push(b); this.B[name] = b;
      }
      this.rest = this.bones.map((b) => b.position.clone());
      const rootBone = this.B.root;
      rootBone.updateMatrixWorld(true);
      this.skeleton = new THREE.Skeleton(this.bones);
      const pal = asset.pal;
      this.mat = coatMaterial(pal, { faceTex: asset.faceTex, spots: plan.cfg.coat === 'leopard', tick: plan.cfg.coat === 'tabby' ? 0.55 : 0.25, stripeW: 0.3 });
      this.body = new THREE.SkinnedMesh(asset.geo, this.mat);
      this.body.add(rootBone);
      this.body.bind(this.skeleton);
      this.body.castShadow = true; this.body.receiveShadow = true;
      this.eyeMat = eyeMaterial({ iris: pal.iris, iris2: pal.iris2, round: false });
      this.eyes = new THREE.SkinnedMesh(asset.eyeGeo, this.eyeMat);
      this.eyes.bind(this.skeleton, this.body.bindMatrix);
      const fake = { isSkinnedMesh: true, geometry: asset.hull, skeleton: this.skeleton, bindMatrix: this.body.bindMatrix };
      this.outline = G.R3M.outline(fake, { width: 0.0012, color: 0x2a2430 });
      for (const m of [this.body, this.eyes, this.outline]) { m.boundingSphere = asset.sphere.clone(); m.frustumCulled = true; }
      this.eyes.castShadow = false;
      this.root.add(this.body, this.eyes, this.outline);
      this.height = asset.height;
      this.yaw = 0; this._speed = 0;
    }
    setFacing(yaw) { this.yaw = yaw; this.root.rotation.y = yaw; }
    setMove(speed) { this._speed = speed; }
    play() {} emote() {} setExpression() {} lookAt() {}
    setOpacity(a, ghost) {
      const U = this.mat.userData.coat; U.uFade.value = a; U.uGhost.value = ghost ? 1 : 0;
      const tr = a < 0.99 || ghost; this.mat.transparent = tr; this.mat.depthWrite = !ghost;
      this.eyeMat.transparent = tr; this.eyeMat.userData.eye.uFade.value = a;
      this.outline.visible = a > 0.6 && !ghost;
    }
    update(dt) { this.root.updateMatrixWorld(true); }
    bone(name) { return this.B[BONE_ALIAS[name] || name] || this.B.root; }
    dispose() { this.mat.dispose(); this.eyeMat.dispose(); this.outline.material.dispose(); }
  }

  // ================================================================================== registry
  const cache = new Map();
  A.has = function (id) {
    const sp = G.Sprites && G.Sprites.spec && G.Sprites.spec(id);
    return !!(sp && (sp.kind === 'quad' || sp.kind === 'bird'));
  };
  A.asset = function (id) {
    const spec = G.Sprites.spec(id) || { kind: 'quad', species: 'cat' };
    const key = id + '|' + JSON.stringify(spec);
    let a = cache.get(id);
    if (!a || a.key !== key) { a = buildAsset(id, spec); a.key = key; cache.set(id, a); }
    return a;
  };
  A.create = function (id, opts = {}) { return new AnimalInst(A.asset(id), opts); };

  A._internal = { meshSDF, makeField, ell, cone, primDist, vnoise, smin, smax };
  return A;
})();

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
      uMouth: { value: 0 }, uMouthC: { value: new THREE.Vector2(0.5, 0.33) }, uMouthR: { value: new THREE.Vector2(0.04, 0.06) },
      cMouthIn: { value: new THREE.Color('#5a1e26') }, cTongue: { value: new THREE.Color('#e88a92') }, cLip: { value: new THREE.Color(P.line || '#2a2020') },
    };
    if (opts.mouth) { U.uMouthC.value.set(opts.mouth.c[0], opts.mouth.c[1]); U.uMouthR.value.set(opts.mouth.r[0], opts.mouth.r[1]); }
    mat.userData.coat = U;
    const prev = mat.onBeforeCompile;
    const defs = (opts.spots ? '#define AN_SPOTS\n' : '') + (opts.faceTex ? '#define AN_FACE\n' : '') + (opts.cards ? '#define AN_CARDS\n' : '');
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = defs + sh.vertexShader
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
          uniform float uMouth; uniform vec2 uMouthC, uMouthR; uniform vec3 cMouthIn, cTongue, cLip;
          varying vec3 vRest; varying vec4 vM; varying vec4 vS; varying vec4 vCol; varying vec3 vFace;
          #ifdef AN_CARDS
          varying vec2 vCardUv;
          #endif
          ${GLSL_NOISE}
          vec3 an_coat(out float strandA){
            vec3 p = vRest * uScale;               // plan-space metres (pattern glued to the rest pose)
            vec3 c = mix(cBase, cBase2, (smoothstep(0.45, 0.85, an_vn(p * vec3(420.0, 150.0, 420.0))) * 0.7 + an_fbm(p * 30.0) * 0.3) * uTick * vS.w);
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
            if (uMouth > 0.01 && vFace.z > 0.3) { // open mouth: grows down from the painted lip line
              vec2 mr = uMouthR * vec2(0.55 + 0.45 * uMouth, max(uMouth, 0.05));
              vec2 md = (vFace.xy - (uMouthC - vec2(0.0, mr.y))) / mr;
              float me = length(md);
              if (me < 1.0) {
                vec3 mc = mix(cMouthIn, cTongue, smoothstep(-0.05, -0.65, md.y) * smoothstep(1.0, 0.5, abs(md.x)));
                c = mix(mc, cLip, smoothstep(0.78, 0.95, me));
              }
            }
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
        .replace('#include <normal_fragment_begin>', opts.cards ? THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '') : '#include <normal_fragment_begin>')
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
      cSclera: { value: new THREE.Color(E.sclera || E.iris).multiplyScalar(0.55) }, uIrisR: { value: E.irisR || 0.64 }, uPupil: { value: 0.28 },
      uPupilH: { value: E.pupilH || 0.82 }, uGhost: { value: 0 }, cGhost: { value: new THREE.Color('#bfe8ff') }, uFade: { value: 1 },
      uRound: { value: E.round ? 1 : 0 }, uGlowE: { value: E.glow || 0.12 }, cHL: { value: new THREE.Color(E.hl || '#ffffff') }, cHL2: { value: new THREE.Color(E.hl2 || '#ffffff') },
    };
    mat.userData.eye = U;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aEye; varying vec3 vEye;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEye = aEye;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 cIris, cIris2, cRing, cSclera, cGhost, cHL, cHL2; uniform float uIrisR, uPupil, uPupilH, uGhost, uFade, uRound, uGlowE;
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
          float pw = mix(uPupil * 0.5, 0.25 + uPupil * 0.5, uRound) * (uRound > 0.5 ? 1.0 : 1.0), ph = mix(uPupilH, 0.25 + uPupil * 0.55, uRound);
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
            outgoingLight = outgoingLight + diffuseColor.rgb * uGlowE + cHL * smoothstep(0.55, 0.75, hl) * 1.1 + cHL2 * smoothstep(0.5, 0.7, hl2) * 0.7;
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
    const nu = 16, nv = 10;
    parts.grid(nu, nv, (u, v) => {
      const th = v * PI * 0.6, ph = u * TAU;
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
  FACE.dog = (x, y, z, c) => {
    const ax = abs(x);
    if (z > 1.3 && y < -0.05 && y > -0.42 && ax < 0.2) return c.nose; // nose leather
    if (z > 0.7 && abs(y + 0.48 + 0.08 * (z - 1)) < 0.03 && ax > 0.08) return c.line; // lip line
    if (z > 0.6 && y < -0.3) return c.white; // pale muzzle / chin
    if (z > 0.45 && y < -0.1 && ax > 0.25) return mixc(c.white, c.base, 0.4); // cheeks
    if (y > 0.3 && z > 0.2 && ax < 0.12) return mixc(c.base, c.dark, 0.3); // stop / forehead line
    return null;
  };
  FACE.muntjac = (x, y, z, c) => {
    const ax = abs(x);
    if (z > 1.6) return c.nose;
    if (z > 0.3 && y > 0.05 && y < 0.95 && abs(ax - (0.12 + (y - 0.05) * 0.35)) < 0.06) return c.dark; // dark facial V ridges
    if (z > 0.35 && abs(ax - 0.5) < 0.12 && abs(y + 0.05) < 0.05) return c.dark; // preorbital gland slit
    if (y < -0.5 && z > 0.2) return c.white; // pale chin / throat
    if (z > 0.9 && y < -0.35) return mixc(c.white, c.base, 0.5);
    return null;
  };
  FACE.buffalo = (x, y, z, c) => {
    const ax = abs(x);
    if (z > 1.75 && y < -0.35) { if (abs(ax - 0.3) < 0.1 && abs(y + 0.7) < 0.1) return c.nostril; return mixHexC(c.base, [0.6, 0.55, 0.55], 0.45); } // muzzle pad
    if (abs(ax - 0.62) < 0.18 && abs(y - 0.42) < 0.06 && z > 0.2) return mixc(c.white, c.base, 0.35); // pale brows
    return null;
  };
  FACE.bird = () => null;
  function mixHexC(a, b, t) { return mixc(a, b, t); }
  function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  // ================================================================================== cat family plan
  // cfg: { coat:'tabby'|'calico'|'orange'|'leopard', pal (hex palette), fat, len, leg, head, cheek, ear:{size,flare,round,
  //   lynx}, eye:{iris,iris2,round,pupil,lid}, tail:{len,r,fluff}, fluff (long hair 0..1), ruff, scale, bow }
  function catPlan(cfg) {
    // Proportions follow the approved design kit's standing pose (tools/design2/tuanzi_yuyuan_mochi_catkit.js,
    // POSES.stand), authored in kit units and converted to plan units (≈ real cat metres) by u.
    const u = 0.36;
    const f = cfg.fat || 1, sf = sqrt(f), lg = cfg.leg || 1, ch = cfg.cheek != null ? cfg.cheek : 0.6, lr = cfg.legR || 1;
    const fl = cfg.fluff || 0;
    const Rk = cfg.R || 0.19;
    const Y = (y) => (y <= 0.47 ? y * lg : y - 0.47 * (1 - lg));
    const k3 = (x, y, z) => [x * u, Y(y) * u, z * u];
    const R = Rk * u * (cfg.head || 1); // head radius (plan units)
    const hc = k3(0, 0.6 + Rk * 0.55 + (cfg.headUp || 0), 0.44 + (cfg.headFwd || 0));
    const spY = Y(0.46) * u, zS = 0.2 * u, zH = -0.27 * u;
    const J = [];
    const j = (name, parent, p) => J.push([name, parent, p]);
    j('root', null, [0, 0, 0]);
    j('hips', 'root', k3(0, 0.45, -0.27));
    j('spine1', 'hips', k3(0, 0.46, -0.13));
    j('belly', 'spine1', k3(0, 0.3, -0.06));
    j('spine2', 'spine1', k3(0, 0.465, 0.02));
    j('chest', 'spine2', k3(0, 0.47, 0.17));
    j('neck', 'chest', k3(0, 0.52, 0.28));
    j('head', 'neck', [0, hc[1] - 0.45 * R, hc[2] - 0.7 * R]);
    j('jaw', 'head', [0, hc[1] - 0.3 * R, hc[2] + 0.1 * R]);
    // eyes: large deep-set eyeballs; only a shallow dome is exposed (the opening ≈ the kit's painted eye)
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
    // ears (kit: base (0.46R, 0.52R, -0.06R), length 0.78R·es, base radius 0.36R·es, flare/yaw/back tilt)
    const es = (cfg.ear && cfg.ear.size) || 1, earH = R * 0.8 * es, earW = R * 0.36 * es;
    const ears = [];
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      const base = [s * R * 0.47, hc[1] + R * 0.55, hc[2] - R * 0.08];
      const flare = (cfg.ear && cfg.ear.flare != null ? cfg.ear.flare : 0.3);
      const up = V3.norm([s * sin(flare), cos(flare), -0.2]);
      const face = V3.norm([s * 0.45, 0.05, 1]);
      const F = frameOf(base, face, up);
      const yv = up, zv = V3.norm(V3.sub(face, V3.mul(yv, V3.dot(face, yv)))), xv = V3.cross(yv, zv);
      F.x = xv; F.y = yv; F.z = zv;
      j('ear' + sx, 'head', base);
      ears.push({ s, sx, F, base });
    }
    // tail: base behind the rump, relaxed drooping arc (rest pose; animation lifts it)
    const tl = 0.6 * u * (cfg.tail && cfg.tail.len || 1), tN = 7;
    const tailP = [];
    let tp = k3(0, 0.47, -0.4);
    for (let i = 0; i <= tN; i++) {
      tailP.push(tp);
      const a = -0.2 - 0.5 * (i / tN);
      tp = V3.add(tp, [0, sin(a) * tl / tN, -cos(a) * tl / tN]);
    }
    for (let i = 0; i < tN; i++) j('tail' + (i + 1), i ? 'tail' + i : 'hips', tailP[i]);
    // legs (x > 0 = the cat's left)
    const legs = {};
    const lx = (x) => x * (0.75 + 0.25 * sf);
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      j('thigh' + sx, 'hips', k3(s * lx(0.11), 0.4, -0.28));
      j('shin' + sx, 'thigh' + sx, k3(s * lx(0.13), 0.255, -0.17));
      j('hock' + sx, 'shin' + sx, k3(s * lx(0.12), 0.11, -0.37));
      j('foot' + sx, 'hock' + sx, k3(s * lx(0.115), 0.048, -0.33));
      j('scap' + sx, 'chest', k3(s * lx(0.07), 0.56, 0.16));
      j('arm' + sx, 'scap' + sx, k3(s * lx(0.1), 0.43, 0.25));
      j('fore' + sx, 'arm' + sx, k3(s * lx(0.105), 0.265, 0.2));
      j('wrist' + sx, 'fore' + sx, k3(s * lx(0.1), 0.095, 0.255));
      j('hand' + sx, 'wrist' + sx, k3(s * lx(0.1), 0.048, 0.278));
      legs['H' + sx] = { s, front: false, chain: ['thigh' + sx, 'shin' + sx, 'hock' + sx, 'foot' + sx], toe: k3(s * lx(0.115), 0.03, -0.25), girdle: 'hips' };
      legs['F' + sx] = { s, front: true, scap: 'scap' + sx, chain: ['arm' + sx, 'fore' + sx, 'wrist' + sx, 'hand' + sx], toe: k3(s * lx(0.1), 0.03, 0.345), girdle: 'chest' };
    }
    if (cfg.ruff) j('ruff', 'chest', k3(0, 0.44, 0.3));
    const JP = {}; for (const [n, , p] of J) JP[n] = p;

    // ----- primitives (kit stand pose, kit blend radii ×u)
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
    const torsoSc = (x, y, z) => -z / 0.036 + abs(x) * 4;
    const TORSO = { region: 'torso', boneFn: spineW, st: 1, scFn: torsoSc, fluff: fl * 0.004, flow: [0, -0.25, -1], clump: 30 };
    const kt = 0.06 * u;
    P(ell(k3(0, 0.45, 0.19), [0.16 * sf * u, 0.18 * u, 0.19 * u], Object.assign({ rot: [0.17, 0, 0], bone: 'chest', k: kt }, TORSO)));
    P(ell(k3(0, 0.38, -0.04), [0.19 * f * u, 0.17 * sf * u, 0.25 * u], Object.assign({ bone: 'spine1', k: kt }, TORSO)));
    P(ell(k3(0, 0.44, -0.27), [0.15 * sf * u, 0.16 * u, 0.15 * u], Object.assign({ bone: 'hips', k: kt }, TORSO)));
    if (f > 1.15) P(ell(k3(0, 0.3, -0.07), [0.15 * f * u, 0.1 * f * u, 0.19 * u], Object.assign({}, TORSO, { bone: 'belly', boneFn: null, k: kt, region: 'belly', fluff: fl * 0.01, flow: [0, -1, -0.3] })));
    // neck / ruff
    P(cone(k3(0, 0.5, 0.26), [0, hc[1] - R * 0.3, hc[2] - R * 0.45], 0.11 * u * sf, 0.1 * u, { bone: 'neck', bp: 'chest', bc: 'head', k: 0.045 * u, region: 'neck', st: 0.8, scFn: torsoSc, fluff: fl * 0.01, flow: [0, -0.6, -1] }));
    if (cfg.ruff) {
      P(ell(k3(0, 0.44, 0.3), [0.17 * cfg.ruff * u, 0.17 * cfg.ruff * u, 0.12 * cfg.ruff * u], { rot: [-0.45, 0, 0], bone: 'ruff', k: 0.05 * u, region: 'ruff', white: 1, fluff: 0.014, flow: [0, -1, 0.4], clump: 34 }));
    }
    // head (kit head: skull, cheeks/jowls, nose bridge, whisker pads, chin, nose leather; blend 0.17R)
    const H = (pos) => [hc[0] + pos[0] * R, hc[1] + pos[1] * R, hc[2] + pos[2] * R];
    const HEADM = { region: 'head', bone: 'head' };
    const mz = cfg.muzzle || 1;
    P(ell(H([0, 0.04, -0.04]), [R * (cfg.skullW || 1), R * 0.86, R * 0.9], Object.assign({ k: R * 0.17 }, HEADM)));
    for (const s of [1, -1]) {
      P(ell(H([s * (0.36 + 0.07 * ch), -(0.22 + 0.05 * ch), 0.14]), [R * (0.5 + 0.14 * ch), R * (0.4 + 0.07 * ch), R * 0.48], Object.assign({ k: R * 0.17, fluff: fl * 0.006, flow: [s, -0.6, -0.5], clump: 60 }, HEADM)));
      P(ell(H([s * 0.14 * mz, -0.3, 0.68 + 0.03 * mz]), [R * 0.185 * mz, R * 0.185 * mz, R * 0.185 * mz], Object.assign({ k: R * 0.17 }, HEADM))); // whisker pads
    }
    P(ell(H([0, -0.04, 0.62]), [R * 0.17, R * 0.2, R * 0.22], Object.assign({ k: R * 0.17 }, HEADM))); // bridge
    for (const e of eyes) P(ell(V3.add(e.c, V3.mul(e.F.z, R * 0.12)), [R * 0.25, R * 0.23, R * 0.16], Object.assign({ rot: [0, e.s * 0.3, 0], k: R * 0.17 }, HEADM))); // brow/eye bulge
    P(ell(H([0, -0.15, 0.86 + 0.03 * mz]), [R * 0.1, R * 0.07, R * 0.065], Object.assign({ k: R * 0.03 }, HEADM))); // nose leather
    P(ell(H([0, -0.46, 0.56]), [R * 0.14 * mz, R * 0.1, R * 0.12], { region: 'head', bone: 'jaw', k: R * 0.17 })); // chin
    // limbs (kit radii) + haunch/shoulder masses
    const LEGM = { region: 'leg', st: 0.75, scFn: (x, y) => y / 0.032, fluff: fl * 0.004, flow: [0, -1, -0.4] };
    const kl = 0.02 * u;
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      const g = (n) => JP[n + sx];
      P(ell(k3(s * lx(0.11), 0.4, -0.25), [0.1 * u * sf, 0.15 * u, 0.15 * u], Object.assign({}, LEGM, { rot: [-0.26, 0, 0], bone: 'thigh' + sx, bp: 'hips', k: 0.05 * u, region: 'haunch', st: 0.9, scFn: torsoSc, fluff: fl * 0.012 })));
      P(ell(k3(s * lx(0.1), 0.48, 0.24), [0.06 * u * sf, 0.12 * u, 0.08 * u], Object.assign({}, LEGM, { rot: [0.44, 0, 0], bone: 'scap' + sx, bp: 'chest', k: 0.05 * u, region: 'shoulder', scFn: torsoSc })));
      P(cone(g('thigh'), g('shin'), 0.085 * u * lr, 0.066 * u * lr, Object.assign({}, LEGM, { bone: 'thigh' + sx, bp: 'hips', bc: 'shin' + sx, k: kl })));
      P(cone(g('shin'), g('hock'), 0.066 * u * lr, 0.042 * u * lr, Object.assign({}, LEGM, { bone: 'shin' + sx, bc: 'hock' + sx, k: kl })));
      P(cone(g('hock'), g('foot'), 0.042 * u * lr, 0.038 * u * lr, Object.assign({}, LEGM, { bone: 'hock' + sx, bc: 'foot' + sx, k: kl, region: 'lowleg' })));
      P(ell(V3.lerp(g('foot'), legs['H' + sx].toe, 0.42), [0.056 * u * lr, 0.04 * u * lr, 0.07 * u * lr], Object.assign({}, LEGM, { bone: 'foot' + sx, k: 0.018 * u, region: 'paw' })));
      P(cone(g('arm'), g('fore'), 0.068 * u * lr, 0.058 * u * lr, Object.assign({}, LEGM, { bone: 'arm' + sx, bp: 'scap' + sx, bc: 'fore' + sx, k: kl })));
      P(cone(g('fore'), g('wrist'), 0.058 * u * lr, 0.045 * u * lr, Object.assign({}, LEGM, { bone: 'fore' + sx, bc: 'wrist' + sx, k: kl })));
      P(cone(g('wrist'), g('hand'), 0.045 * u * lr, 0.043 * u * lr, Object.assign({}, LEGM, { bone: 'wrist' + sx, bc: 'hand' + sx, k: kl, region: 'lowleg' })));
      P(ell(V3.lerp(g('hand'), legs['F' + sx].toe, 0.38), [0.058 * u * lr, 0.042 * u * lr, 0.072 * u * lr], Object.assign({}, LEGM, { bone: 'hand' + sx, k: 0.018 * u, region: 'paw' })));
    }
    // sculpted fur clumps (long hair): pointed round cones blended into the body: ruff, cheeks, britches, belly fringe
    if (fl) {
      const tuft = (base, dir, len, r, bone, region, extra) => {
        const d = V3.norm(dir);
        P(cone(base, V3.add(base, V3.mul(d, len)), r, r * 0.06, Object.assign({ bone, k: r * 0.45, region, white: 1, noHull: true, tuft: true }, extra || {})));
      };
      const rc = k3(0, 0.44, 0.3), rr = 0.17 * (cfg.ruff || 1) * u;
      for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 2.6 + (row % 2) * 0.15, h = [0.55, 0.05, -0.45][row];
        const nrm = V3.norm([sin(a), h, cos(a)]);
        const base = V3.add(rc, [nrm[0] * rr * 0.95, nrm[1] * rr * 0.9, nrm[2] * rr * 0.8]);
        tuft(base, V3.add(V3.mul(nrm, 0.7), [0, -1, 0.15]), (0.04 + 0.01 * hash3(i, row, 1)) * (row === 2 ? 1.15 : 1), 0.019, 'ruff', 'ruff');
      }
    }
    // tail
    const tr0 = 0.05 * u * (cfg.tail && cfg.tail.r || 1), tr1 = tr0 * (cfg.tail && cfg.tail.taper != null ? cfg.tail.taper : 0.72);
    for (let i = 0; i < tN; i++) {
      P(cone(tailP[i], tailP[i + 1], lerp(tr0, tr1, i / tN), lerp(tr0, tr1, (i + 1) / tN), {
        bone: 'tail' + (i + 1), bp: i ? 'tail' + i : 'hips', bc: i < tN - 1 ? 'tail' + (i + 2) : null, k: i ? 0.008 : 0.03 * u, region: 'tail',
        st: 1, sc: [i * 7 / tN, (i + 1) * 7 / tN], tailT: [i / tN, (i + 1) / tN], fluff: (cfg.tail && cfg.tail.fluff || 0), flow: V3.sub(tailP[i + 1], tailP[i]), clump: 36,
      }));
      if (fl && i > 0) { // plume: clumps around each segment, pointing out and back along the tail
        const a = tailP[i], b2 = tailP[i + 1], ax = V3.norm(V3.sub(b2, a));
        const side = V3.norm(V3.cross(ax, [0, 1, 0])), up = V3.cross(side, ax);
        const r = lerp(tr0, tr1, i / tN);
        for (let kk = 0; kk < 4; kk++) {
          const ang = kk / 4 * TAU + i * 0.7, dv = V3.add(V3.mul(side, cos(ang)), V3.mul(up, sin(ang)));
          const base = V3.add(V3.lerp(a, b2, 0.5), V3.mul(dv, r * 0.7));
          P(cone(base, V3.add(base, V3.add(V3.mul(dv, r * 1.1), V3.mul(ax, r * 1.4))), r * 0.55, r * 0.05, { bone: 'tail' + (i + 1), k: r * 0.5, region: 'tail', tailT: [i / tN, (i + 1) / tN], noHull: true, tuft: true }));
        }
      }
    }
    const tailDir = V3.norm(V3.sub(tailP[tN], tailP[0]));
    const cheekWhere = (p) => p[1] < hc[1] - 0.12 * R && abs(p[0]) > 0.42 * R && p[2] < hc[2] + 0.45 * R;
    const FUR = fl ? {
      ruff: { dens: 0.9, len: 0.05, w: 0.044, lift: 0.4, droop: 0.7, flow: [0, -1, 0.35] },
      neck: { dens: 0.55, len: 0.042, w: 0.04, lift: 0.3, droop: 0.6, flow: [0, -0.8, -0.5], where: (p, n) => n[1] < 0.3 },
      belly: { dens: 0.8, len: 0.042, w: 0.04, lift: 0.08, droop: 0.2, flow: [0, -1, -0.25], grav: 0.3, where: (p, n) => n[1] < -0.2 },
      haunch: { dens: 0.6, len: 0.042, w: 0.04, lift: 0.18, droop: 0.5, flow: [0, -1, -0.7], where: (p, n) => n[2] < 0.2 },
      tail: { dens: 1, len: 0.046, w: 0.042, lift: 0.55, droop: 0.4, flow: (p, n) => V3.add(tailDir, V3.mul(n, 0.1)), grav: 0.04 },
      head: { dens: 1, len: 0.028, w: 0.03, lift: 0.55, droop: 0.4, flow: (p) => [Math.sign(p[0]), -0.7, -0.45], where: cheekWhere },
      paw: { dens: 0.6, len: 0.014, w: 0.018, lift: 0.45, droop: 0.2, flow: [0, 0.1, 1], where: (p) => p[1] < 0.02 },
    } : {
      head: { dens: 0.75, len: 0.017, w: 0.018, lift: 0.7, droop: 0.4, flow: (p) => [Math.sign(p[0]), -0.6, -0.5], where: cheekWhere },
      neck: { dens: 0.25, len: 0.018, w: 0.02, lift: 0.3, droop: 0.4, flow: [0, -0.9, 0.3], where: (p) => p[2] > zS },
    };
    return {
      fur: FUR, furMax: fl ? 120 : 70, whiskers: { col: cfg.whiskerCol || '#f7f5f0' },
      cfg, joints: J, JP, prims, legs, eyes, ears, hc, R, spY, zH, zS, tailN: tN,
      h: cfg.voxel || 0.0125, hullH: cfg.hullH || 0.019, warp: { c: hc, m: 2.4, R: R * 1.3 },
      springs: (S) => {
        const d = [];
        for (let i = 0; i < tN; i++) {
          const a = tailP[i], b2 = tailP[i + 1];
          d.push({ bone: 'tail' + (i + 1), tail: V3.mul(V3.sub(b2, a), S), stiff: lerp(0.3, 0.13, i / (tN - 1)), drag: 0.16, grav: 0.002 });
        }
        for (const e of ears) d.push({ bone: 'ear' + e.sx, tail: V3.mul(e.F.y, earH * S), stiff: 0.32, drag: 0.22 });
        d.push({ bone: 'belly', tail: [0, -0.05 * S, 0.01 * S], stiff: 0.16, drag: 0.1, w: 0.8 });
        if (cfg.ruff) d.push({ bone: 'ruff', tail: [0, -0.04 * S, 0.03 * S], stiff: 0.2, drag: 0.12 });
        return d;
      },
      scale: cfg.scale || 1.5,
    };
  }

  // ================================================================================== coats
  const PALETTES = {
    tabby: { base: '#8E97A3', base2: '#C6CDD6', dark: '#545C69', white: '#E3E5E8', nose: '#C98884', nostril: '#6E4A4C', inner: '#E2AAA6', line: '#2E3440', rim: '#2E3440', iris: '#7E8E36', iris2: '#CFCB5E', paw: '#B9BFC8' },
    calico: { base: '#F5F2EC', base2: '#FFFFFF', dark: '#7F8894', white: '#F7F4EF', grey: '#9BA3AE', greyDark: '#7F8894', cream: '#EBC79D', pa: '#9BA3AE', pb: '#EBC79D', nose: '#EC9FA8', nostril: '#B56A76', inner: '#EDB3B3', line: '#4A4450', rim: '#4A4450', iris: '#8DB43A', iris2: '#DCE45E', paw: '#F7F4EF' },
    orange: { base: '#E4A464', base2: '#F4CB92', dark: '#B4682F', white: '#FBF2E2', nose: '#E39486', nostril: '#8A4A40', inner: '#EFB0A8', line: '#5A3220', rim: '#5A3220', iris: '#6E9A36', iris2: '#D6C24E', paw: '#F6E3C8' },
    leopard: { base: '#C49A62', base2: '#DDBA88', dark: '#3B2A1E', white: '#F3ECDD', nose: '#B8695B', nostril: '#5A2E28', inner: '#D7B1A0', line: '#3A2617', rim: '#2A1E16', iris: '#93A44C', iris2: '#E9C752', paw: '#E8D6B8', earBack: '#2B2320' },
  };
  // per-vertex coat rules on top of the primitive masks. n = surface normal, reg = region weights
  function coatPost(plan, x, y, z, n, M, reg) {
    if (plan.coatPost) return plan.coatPost(plan, x, y, z, n, M, reg);
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
      const bib = max(smooth(-0.1, 0.45, n[2]) * smooth(neckY + 0.04, neckY - 0.02, y) * smooth(plan.zS - 0.06, plan.zS + 0.02, z),
        smooth(-0.3, 0.2, n[2]) * smooth(plan.zS - 0.02, plan.zS + 0.03, z) * smooth(plan.hc[1] - 0.2 * plan.R, plan.hc[1] - 0.45 * plan.R, y) * (1 - (reg.head || 0)));
      const under = smooth(-0.05, -0.45, n[1]);
      const low = smooth(spY - 0.035, spY - 0.075, y);
      M.white = max(M.white, bib, under * (1 - (reg.tail || 0)), low * (1 - (reg.tail || 0)));
      // authored dilute-calico patches (reference: grey saddle + right shoulder, cream on the left flank / rump)
      const top = smooth(-0.35, 0.25, n[1]) * (1 - M.white);
      const blob = (cx, cy, cz, rx, ry, rz) => { const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2; return smooth(1.25, 0.6, d); };
      const sp = plan.spY, zs = plan.zS, zh = plan.zH;
      const grey = max(blob(-0.012, sp + 0.03, lerp(zh, zs, 0.45), 0.07, 0.06, 0.075), blob(-0.05, sp + 0.01, zs - 0.01, 0.04, 0.05, 0.05), blob(0.02, sp + 0.02, zh - 0.02, 0.05, 0.05, 0.05));
      const cream = max(blob(0.06, sp - 0.005, lerp(zh, zs, 0.25), 0.045, 0.05, 0.06), blob(0.035, sp + 0.03, lerp(zh, zs, 0.72), 0.035, 0.035, 0.04));
      M.pa = max(M.pa, top * grey * (1 - (reg.tail || 0)) * (1 - (reg.head || 0)));
      M.pb = max(M.pb, top * cream * (1 - M.pa * 0.8) * (1 - (reg.tail || 0)) * (1 - (reg.head || 0)));
      if (M.tailT != null && reg.tail > 0.3) { // banded grey / cream plume with a white tip
        const ph = sin(M.tailT * 9.5 + vnoise(x * 30, y * 30, z * 30) * 2.5);
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
  function palFrom(col, o) { // 2D sprite colours → 3D palette
    return Object.assign({ base: col.base, base2: mixHex(col.base, '#ffffff', 0.25), dark: col.dark, white: col.belly, pa: mixHex(col.base, col.dark, 0.45), pb: mixHex(col.base, col.dark, 0.25),
      nose: col.nose, nostril: '#141010', inner: '#c89090', line: '#241a16', rim: '#1e1614', iris: col.eye, iris2: mixHex(col.eye, '#c89040', 0.5), paw: col.belly }, o || {});
  }
  function mixHex(a, b, t) { const A = hexS(a), B2 = hexS(b); const h = (v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0'); return '#' + h(lerp(A[0], B2[0], t)) + h(lerp(A[1], B2[1], t)) + h(lerp(A[2], B2[2], t)); }

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
    const fn = FACE[plan.face || plan.cfg.coat] || FACE.tabby;
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

  // fur cards: tufts rooted on SDF vertices, oriented along the region's fur flow, lifted off the surface by `lift`
  // and drooping toward the flow; colour comes from the coat at the root (aRest = root), alpha from a strand atlas.
  function hash1(i) { return hash3(i, 17, 91); }
  function addFurCards(parts, plan, mesh, vinfo) {
    const F = plan.fur, nv = mesh.pos.length / 3;
    const cand = [];
    for (let v = 0; v < nv; v++) {
      const reg = vinfo[v].reg; let best = null, bw = 0;
      for (const k in reg) if (F[k] && reg[k] > bw) { bw = reg[k]; best = k; }
      if (!best || bw < 0.45) continue;
      const spec = F[best];
      const p = [mesh.pos[v * 3], mesh.pos[v * 3 + 1], mesh.pos[v * 3 + 2]], n = [mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2]];
      if (spec.where && !spec.where(p, n)) continue;
      if (hash1(v) > spec.dens) continue;
      cand.push({ v, p, n, spec, key: best });
    }
    const maxN = plan.furMax || 400;
    const step = cand.length > maxN ? cand.length / maxN : 1;
    for (let c = 0; c < cand.length && c / step < maxN; c += step) {
      const { v, p, n, spec } = cand[Math.floor(c)];
      const r1 = hash3(v, 3, 5), r2 = hash3(v, 7, 11), r3 = hash3(v, 13, 2);
      let fl = typeof spec.flow === 'function' ? spec.flow(p, n) : spec.flow;
      fl = V3.sub(fl, V3.mul(n, V3.dot(fl, n)));
      if (V3.len(fl) < 1e-4) fl = V3.cross(n, [1, 0, 0]);
      fl = V3.norm(V3.add(V3.norm(fl), [(r1 - 0.5) * 0.25, (r2 - 0.5) * 0.15, (r3 - 0.5) * 0.25]));
      fl = V3.norm(V3.sub(fl, V3.mul(n, V3.dot(fl, n))));
      const bn = V3.norm(V3.cross(n, fl));
      const L = spec.len * (0.75 + 0.5 * r2), w = spec.w * (0.8 + 0.4 * r3), lift = spec.lift * (0.7 + 0.6 * r1);
      const info = vinfo[v], M = info.M;
      const root = V3.sub(p, V3.mul(n, 0.0015));
      const segs = 3;
      parts.grid(1, segs, (uu, t) => {
        const a = lift * (1 - t * spec.droop);
        const along = V3.add(V3.mul(fl, cos(a)), V3.mul(n, sin(a)));
        const q = V3.add(root, V3.add(V3.mul(along, L * t), V3.mul([0, -1, 0], L * t * t * (spec.grav || 0.15))));
        const wt = w * (1 - 0.35 * t) * (uu - 0.5);
        const pos = V3.add(q, V3.mul(bn, wt));
        const m = Object.assign({}, M, { rest: p, ao: lerp(0.72, 1.05, t) * (M.ao || 1), col: M.col });
        return { p: pos, n, skin: info.skin, m, x: [uu, t] };
      }, false);
    }
  }
  // whiskers: long thin tapered white strips from the whisker pads (+ two brow whiskers), skinned to the head
  function addWhiskers(parts, plan, mAt) {
    const R = plan.R, hc = plan.hc, W = plan.whiskers;
    const rows = W.rows || [[-0.25, 12, 1.45], [-0.29, 2, 1.55], [-0.33, -9, 1.5], [-0.37, -20, 1.3]];
    const white = [...hex(W.col || '#f7f5f0'), 1];
    const add = (a, b, bend, wid) => {
      const segs = 4;
      parts.grid(1, segs, (uu, t) => {
        const q = V3.add(V3.lerp(a, b, t), [0, -bend * sin(PI * t) * 0.5 - bend * t * t, 0]);
        const side = V3.norm(V3.cross(V3.sub(b, a), [0, 0, 1]));
        const wd = wid * (1 - 0.85 * t);
        const pos = V3.add(q, V3.mul([0, 1, 0], (uu - 0.5) * wd));
        const m = M0(); m.rest = a; m.col = white; m.ao = 1.15; m.tick = 0;
        return { p: pos, n: V3.norm(V3.add([0, 0.6, 0], V3.mul(side, 0.3))), skin: [['head', 1]], m, x: [0.5, 0.25 + t * 0.2] };
      }, false);
    };
    for (const s of [1, -1]) {
      for (const [wy, ang, l] of rows) {
        const A = ang * PI / 180;
        const a = [hc[0] + s * 0.24 * R, hc[1] + wy * R, hc[2] + 0.8 * R];
        const b = [hc[0] + s * (0.24 + Math.cos(A) * l) * R, hc[1] + (wy + Math.sin(A) * l) * R, hc[2] + (0.8 - 0.55 * l) * R];
        add(a, b, 0.12 * R, W.w || 0.012 * R * 4);
      }
      for (const [bx, ang, l] of [[0.24, 60, 0.55], [0.32, 48, 0.6]]) {
        const A = ang * PI / 180;
        const a = [hc[0] + s * bx * R, hc[1] + 0.3 * R, hc[2] + 0.66 * R];
        const b = [hc[0] + s * (bx + Math.cos(A) * l * 0.6) * R, hc[1] + (0.3 + Math.sin(A) * l) * R, hc[2] + (0.66 - 0.3 * l) * R];
        add(a, b, -0.05 * R, W.w || 0.04 * R);
      }
    }
  }
  function cardTexture() {
    // 2×1 atlas of fur tufts: solid flame-shaped clumps (alpha) with strand shading in R (dark root → light tip)
    return G.R3M.tex('animalFurCard2', 128, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const tuft = (cx, base, top, wd, lean) => {
        g.beginPath();
        g.moveTo(cx - wd, base);
        g.bezierCurveTo(cx - wd * 1.05, base - (base - top) * 0.45, cx - wd * 0.35 + lean * 0.5, top + (base - top) * 0.25, cx + lean, top);
        g.bezierCurveTo(cx + wd * 0.35 + lean * 0.5, top + (base - top) * 0.25, cx + wd * 1.05, base - (base - top) * 0.45, cx + wd, base);
        g.closePath();
      };
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgb(110,110,110)'); gr.addColorStop(0.55, 'rgb(205,205,205)'); gr.addColorStop(1, 'rgb(255,255,255)');
      g.fillStyle = gr;
      // a main clump with two side locks
      tuft(w * 0.5, h, h * 0.02, w * 0.3, w * 0.02); g.fill();
      tuft(w * 0.27, h, h * 0.22, w * 0.2, -w * 0.08); g.fill();
      tuft(w * 0.73, h, h * 0.18, w * 0.2, w * 0.09); g.fill();
      // strand lines (darker grooves) inside the clumps
      g.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 22; i++) {
        const x0 = w * (0.15 + 0.7 * hash3(i, 3, 1)), x1 = lerp(x0, w * 0.5, 0.6);
        g.strokeStyle = `rgba(70,70,70,${0.25 + 0.25 * hash3(i, 5, 2)})`; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0, h * 0.5, x1, h * (0.08 + 0.3 * hash3(i, 1, 9))); g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    });
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
    const vinfo = [];
    for (let v = 0; v < nv; v++) {
      const x = mesh.pos[v * 3], y = mesh.pos[v * 3 + 1], z = mesh.pos[v * 3 + 2];
      const n = [mesh.nrm[v * 3], mesh.nrm[v * 3 + 1], mesh.nrm[v * 3 + 2]];
      const info = vertexInfo(plan, skinPrims, W, x, y, z, n);
      info.M.ao = sdfAO(field, x, y, z, n[0], n[1], n[2], plan.h * 1.6);
      body.vert([x, y, z], n, info.skin, info.M);
      vinfo.push(info);
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
      const lu = plan.lid ? plan.lid.up : 0.5, ld = plan.lid ? plan.lid.dn : -0.5;
      addLid(body, e.F, e.r * 1.025, 'lidU' + e.sx, true, (a) => lu + 0.12 * (1 - (a / am) ** 2) + 0.05 * e.s * a, 1.35, am, mAt, rimC);
      addLid(body, e.F, e.r * 1.02, 'lidD' + e.sx, false, (a) => ld - 0.06 * (1 - (a / am) ** 2) + 0.06 * e.s * a, -1.3, am, mAt, rimC);
    }
    const inner = hex(pal.inner), innerD = mixc(hex(pal.inner), hex('#6a3a3c'), 0.35);
    for (const e of plan.ears) {
      const R = plan.R, es = plan.cfg.ear && plan.cfg.ear.size || 1;
      addEar(body, e.F, e.H || R * 0.84 * es, e.W || R * 0.36 * es, e.o || { round: plan.cfg.ear && plan.cfg.ear.round, cup: 0.42, thick: 0.16 }, 'ear' + e.sx, 'head',
        (p) => earBackM(plan, p, e), (u, v, edge) => mixc(innerD, inner, smooth(0.0, 0.6, edge) * 0.6 + v * 0.4));
    }
    plan.field = field;
    if (plan.parts) plan.parts(body, plan, mAt);
    if (plan.cfg && plan.cfg.bow) addCollarBow(body, plan, mAt);
    // fur cards + whiskers (separate alpha-tested mesh sharing the coat shader)
    const cards = new Parts();
    if (plan.fur) addFurCards(cards, plan, mesh, vinfo);
    if (plan.whiskers) addWhiskers(cards, plan, mAt);
    if (plan.feathers) plan.feathers(cards, plan, mAt);
    // eyes
    const eyeP = new Parts();
    for (const e of plan.eyes) addEyeball(eyeP, e.F, e.r, 'eye' + e.sx);
    // hull for the outline (coarse SDF, no warp)
    // hull: no fur noise (it would pierce the fine surface), slightly inflated instead; eye sockets kept closed
    const hullPrims = prims.filter((p) => !p.noHull && !p.sub).map((p) => {
      const q = Object.assign({}, p, { fluff: 0, bb: null });
      const inf = 0; // fur displacement only pushes outward, so the plain hull always stays inside
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
      cardGeo: cards.n ? toGeometry(cards, bi, S, true, false, true) : null,
      faceTex: faceTexture(plan, id), cardTex: cardTexture(), pal, mouth: mouthUV(plan),
    };
    // bounds for culling (generous; animation stays inside)
    asset.geo.computeBoundingBox();
    const bb = asset.geo.boundingBox; const sz = bb.getSize(new THREE.Vector3());
    asset.sphere = new THREE.Sphere(bb.getCenter(new THREE.Vector3()), sz.length() * 0.75);
    asset.height = bb.max.y;
    asset.buildMs = performance.now() - t0;
    return asset;
  }
  // mouth position / size in face-texture uv (lat-long around the head centre)
  function mouthUV(plan) {
    const m = plan.mouth || { c: [0, -0.4, 0.74], w: 0.13, h: 0.17 }, R = plan.R;
    const dy = m.c[1] * R, dz = m.c[2] * R;
    const lat = Math.atan2(dy, dz), r = Math.hypot(dy, dz);
    return { c: [0.5, 0.5 + lat / (2 * FLAT)], r: [m.w * R / (r * 2 * FLON), m.h * R / (r * 2 * FLAT)] };
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
  function toGeometry(parts, bi, S, coat, eye, card) {
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
    if (card) {
      const uv = new Float32Array(n * 2);
      for (let v = 0; v < n; v++) { const x = parts.extra[v] || [0.5, 0.5]; uv[v * 2] = x[0]; uv[v * 2 + 1] = x[1]; }
      g.setAttribute('aCardUv', new THREE.BufferAttribute(uv, 2));
    }
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(parts.idx, 1) : new THREE.Uint16BufferAttribute(parts.idx, 1));
    return g;
  }

  // 芋圓's red silk bow collar (design pick #07 石獅繡球): a band hugging the real neck surface + bow + knot + tails
  function addCollarBow(body, plan, mAt) {
    const B = plan.cfg.bow, field = plan.field, JP = plan.JP;
    const a = JP.neck, b = plan.hc;
    const ax = V3.norm(V3.sub(b, a));
    const c = V3.lerp(a, b, B.at || 0.42);
    const side = V3.norm(V3.cross(ax, [1, 0, 0])), up2 = V3.cross(ax, side);
    const red = [...hex(B.col || '#C8332E'), 1], redD = [...hex(B.dark || '#8E1F22'), 1];
    const ring = [];
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const ang = i / N * TAU, d = V3.add(V3.mul([1, 0, 0], cos(ang)), V3.mul(side, sin(ang)));
      let t = 0.005;
      for (let k = 0; k < 40; k++) { const q = V3.add(c, V3.mul(d, t)); if (field(q[0], q[1], q[2]) > 0) break; t += 0.0025; }
      ring.push(V3.add(c, V3.mul(d, t - 0.001)));
    }
    const skin = [['neck', 0.75], ['head', 0.1], ['chest', 0.15]];
    addTube(body, ring, ring.map(() => 0.0055), 6, skin, (p) => { const m = M0(); m.col = red; m.rest = p; m.ao = 0.95; return m; });
    // front-most ring point → bow
    let fi = 0; for (let i = 0; i < N; i++) if (ring[i][2] - ring[i][1] * 0.3 > ring[fi][2] - ring[fi][1] * 0.3) fi = i;
    const f = ring[fi], fwd = V3.norm(V3.sub(f, c));
    const bowM = (p) => { const m = M0(); m.col = red; m.rest = p; m.ao = 1; return m; };
    const bowMD = (p) => { const m = M0(); m.col = redD; m.rest = p; return m; };
    const k = V3.add(f, V3.mul(fwd, 0.006));
    for (const s of [1, -1]) {
      const lc = V3.add(k, [s * 0.021, 0.004, 0.0]);
      addEllipsoid(body, lc, [0.02, 0.013, 0.006], rotMat(0.25, 0, -s * 0.25), 8, 6, skin, bowM);
      const tc = V3.add(k, [s * 0.009, -0.018, 0.002]);
      addEllipsoid(body, tc, [0.007, 0.017, 0.003], rotMat(0.2, 0, s * 0.35), 6, 5, skin, bowMD);
    }
    addEllipsoid(body, V3.add(k, [0, 0.0, 0.003]), [0.0085, 0.008, 0.007], null, 7, 5, skin, bowMD);
  }

  // ================================================================================== other quadrupeds
  // tube along a polyline (horns, antlers, tail tufts): radii per point, ring count, skin + mask callbacks
  function addTube(parts, pts, radii, ring, skin, mFn, capTip) {
    const n = pts.length;
    const frames = [];
    let prevN = null;
    for (let i = 0; i < n; i++) {
      const t = V3.norm(V3.sub(pts[min(n - 1, i + 1)], pts[max(0, i - 1)]));
      let nn = prevN ? V3.norm(V3.sub(prevN, V3.mul(t, V3.dot(prevN, t)))) : V3.norm(V3.cross(t, abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      prevN = nn;
      frames.push({ t, n: nn, b: V3.cross(t, nn) });
    }
    parts.grid(ring, n - 1, (u, v) => {
      const i = Math.round(v * (n - 1)), F = frames[i], a = u * TAU;
      const d = V3.add(V3.mul(F.n, cos(a)), V3.mul(F.b, sin(a)));
      const p = V3.add(pts[i], V3.mul(d, radii[i]));
      const m = mFn(p, i / (n - 1)); m.rest = m.rest || p;
      return { p, n: d, skin: typeof skin === 'function' ? skin(i / (n - 1)) : skin, m };
    }, true, true);
    if (capTip) { // close the base with a small fan
      const c = pts[0], F = frames[0], base = parts.n;
      const mc = mFn(c, 0); mc.rest = c;
      parts.vert(c, V3.mul(F.t, -1), typeof skin === 'function' ? skin(0) : skin, mc);
      for (let k = 0; k < ring; k++) { const a = k / ring * TAU; const d = V3.add(V3.mul(F.n, cos(a)), V3.mul(F.b, sin(a))); const p = V3.add(c, V3.mul(d, radii[0])); const m = mFn(p, 0); m.rest = p; parts.vert(p, V3.mul(F.t, -1), typeof skin === 'function' ? skin(0) : skin, m); }
      for (let k = 0; k < ring; k++) parts.tri(base, base + 1 + ((k + 1) % ring), base + 1 + k);
    }
  }

  // Generic quadruped (dog / deer / bovine): same joint names as the cats so the whole animation system applies.
  // Q (plan units = metres): hipH, shH, zH, zS, spY, chestY (bottom of the ribcage), hx, fx (leg spread), torso radii,
  // head:{ c, R, muzzle:{len, r0, r1, drop}, ... }, neck, tail, legs radii, hoof, ears, eyes, coat
  function quadPlan(Q) {
    const J = [], j = (n, p, v) => J.push([n, p, v]);
    const { hipH, shH, zH, zS, spY } = Q;
    const hc = Q.head.c, R = Q.head.R;
    j('root', null, [0, 0, 0]);
    j('hips', 'root', [0, spY - 0.02 * Q.k, zH]);
    j('spine1', 'hips', [0, spY, lerp(zH, zS, 0.33)]);
    j('belly', 'spine1', [0, Q.chestY + 0.02 * Q.k, lerp(zH, zS, 0.45)]);
    j('spine2', 'spine1', [0, spY, lerp(zH, zS, 0.66)]);
    j('chest', 'spine2', [0, spY - 0.01 * Q.k, zS]);
    j('neck', 'chest', Q.neck.a);
    j('head', 'neck', Q.neck.b);
    j('jaw', 'head', [0, hc[1] - 0.35 * R, hc[2] + 0.3 * R]);
    const eyes = [];
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      const c = V3.add(hc, [s * Q.eye.x * R, Q.eye.y * R, Q.eye.z * R]);
      const F = frameOf(c, [s * sin(Q.eye.yaw), 0.05, cos(Q.eye.yaw)]);
      j('eye' + sx, 'head', c); j('lidU' + sx, 'head', c); j('lidD' + sx, 'head', c);
      eyes.push({ s, c, F, sx, r: Q.eye.r * R });
    }
    const ears = [];
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R', E = Q.ear;
      const base = V3.add(hc, [s * E.x * R, E.y * R, E.z * R]);
      const up = V3.norm([s * sin(E.flare), cos(E.flare) * (E.droop != null ? 1 - E.droop : 1) - (E.droop || 0) * 0.2, E.back != null ? -E.back : -0.2]);
      const face = V3.norm([s * (E.out != null ? E.out : 0.45), 0.05, 1]);
      const F = frameOf(base, face, up);
      const yv = V3.norm(up), zv = V3.norm(V3.sub(face, V3.mul(yv, V3.dot(face, yv)))), xv = V3.cross(yv, zv);
      F.x = xv; F.y = yv; F.z = zv;
      j('ear' + sx, 'head', base);
      ears.push({ s, sx, F, base, H: E.h * R, W: E.w * R, o: { round: E.round, cup: E.cup != null ? E.cup : 0.4, thick: 0.16, taper: E.taper, lean: E.lean } });
    }
    // tail chain from Q.tail.pts
    const tailP = Q.tail.pts, tN = tailP.length - 1;
    for (let i = 0; i < tN; i++) j('tail' + (i + 1), i ? 'tail' + i : 'hips', tailP[i]);
    const legs = {};
    const H = Q.hind, F_ = Q.fore;
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      const hj = (fy, dz) => [s * Q.hx, hipH * fy, zH + dz * hipH];
      const fj = (fy, dz) => [s * Q.fx, shH * fy, zS + dz * shH];
      j('thigh' + sx, 'hips', hj(1, 0));
      j('shin' + sx, 'thigh' + sx, hj(H.knee[0], H.knee[1]));
      j('hock' + sx, 'shin' + sx, hj(H.hock[0], H.hock[1]));
      j('foot' + sx, 'hock' + sx, hj(H.foot[0], H.foot[1]));
      j('scap' + sx, 'chest', [s * Q.fx * 0.7, spY + 0.03 * Q.k, zS - 0.05 * Q.k]);
      j('arm' + sx, 'scap' + sx, fj(1, 0));
      j('fore' + sx, 'arm' + sx, fj(F_.elbow[0], F_.elbow[1]));
      j('wrist' + sx, 'fore' + sx, fj(F_.wrist[0], F_.wrist[1]));
      j('hand' + sx, 'wrist' + sx, fj(F_.hand[0], F_.hand[1]));
      legs['H' + sx] = { s, front: false, chain: ['thigh' + sx, 'shin' + sx, 'hock' + sx, 'foot' + sx], toe: hj(H.toe[0], H.toe[1]), girdle: 'hips' };
      legs['F' + sx] = { s, front: true, scap: 'scap' + sx, chain: ['arm' + sx, 'fore' + sx, 'wrist' + sx, 'hand' + sx], toe: fj(F_.toe[0], F_.toe[1]), girdle: 'chest' };
    }
    const JP = {}; for (const [n, , p] of J) JP[n] = p;
    const prims = [], P = (p) => { prims.push(p); return p; };
    const spineBones = [['hips', JP.hips[2]], ['spine1', JP.spine1[2]], ['spine2', JP.spine2[2]], ['chest', JP.chest[2]]];
    const spineW = (x, y, z) => {
      if (z <= spineBones[0][1]) return [['hips', 1]];
      for (let i = 0; i < 3; i++) { const [a, za] = spineBones[i], [b, zb] = spineBones[i + 1]; if (z <= zb) { const t = smooth(0, 1, (z - za) / (zb - za)); return [[a, 1 - t], [b, t]]; } }
      return [['chest', 1]];
    };
    const TORSO = { region: 'torso', boneFn: spineW };
    for (const t of Q.torso) P(ell(t.c, t.r, Object.assign({ rot: t.rot, bone: t.bone || 'spine1', k: t.k || Q.kt }, TORSO, t.belly ? { bone: 'belly', boneFn: null, region: 'belly' } : {})));
    P(cone(Q.neck.c0, Q.neck.c1, Q.neck.r0, Q.neck.r1, { bone: 'neck', bp: 'chest', bc: 'head', k: Q.kt, region: 'neck' }));
    for (const h of Q.head.prims) P(ell(h.c, h.r, { rot: h.rot, bone: h.bone || 'head', k: h.k != null ? h.k : R * 0.25, region: 'head', sub: h.sub }));
    if (Q.head.cones) for (const h of Q.head.cones) P(cone(h.a, h.b, h.r0, h.r1, { bone: h.bone || 'head', k: h.k != null ? h.k : R * 0.2, region: 'head' }));
    const LR = Q.legR;
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R', g = (n) => JP[n + sx];
      if (Q.haunch) P(ell(V3.add(g('thigh'), [s * Q.haunch.dx, Q.haunch.dy, Q.haunch.dz]), Q.haunch.r, { rot: Q.haunch.rot, bone: 'thigh' + sx, bp: 'hips', k: Q.kt, region: 'haunch' }));
      if (Q.shoulder) P(ell(V3.add(g('arm'), [s * Q.shoulder.dx, Q.shoulder.dy, Q.shoulder.dz]), Q.shoulder.r, { rot: Q.shoulder.rot, bone: 'scap' + sx, bp: 'chest', k: Q.kt, region: 'shoulder' }));
      const kl = Q.kl;
      P(cone(g('thigh'), g('shin'), LR.thigh[0], LR.thigh[1], { bone: 'thigh' + sx, bp: 'hips', bc: 'shin' + sx, k: kl, region: 'leg' }));
      P(cone(g('shin'), g('hock'), LR.shin[0], LR.shin[1], { bone: 'shin' + sx, bc: 'hock' + sx, k: kl, region: 'leg' }));
      P(cone(g('hock'), g('foot'), LR.meta[0], LR.meta[1], { bone: 'hock' + sx, bc: 'foot' + sx, k: kl * 0.7, region: 'lowleg' }));
      P(cone(g('arm'), g('fore'), LR.arm[0], LR.arm[1], { bone: 'arm' + sx, bp: 'scap' + sx, bc: 'fore' + sx, k: kl, region: 'leg' }));
      P(cone(g('fore'), g('wrist'), LR.fore[0], LR.fore[1], { bone: 'fore' + sx, bc: 'wrist' + sx, k: kl, region: 'leg' }));
      P(cone(g('wrist'), g('hand'), LR.metaF[0], LR.metaF[1], { bone: 'wrist' + sx, bc: 'hand' + sx, k: kl * 0.7, region: 'lowleg' }));
      for (const [bone, toe, front] of [['foot' + sx, legs['H' + sx].toe, false], ['hand' + sx, legs['F' + sx].toe, true]]) {
        const a = JP[bone];
        if (Q.hoof) P(cone(a, V3.add(toe, [0, 0.0, 0]), Q.hoof.r0 * (front ? 1.05 : 1), Q.hoof.r1, { bone, k: kl * 0.4, region: 'paw' }));
        else P(ell(V3.lerp(a, toe, 0.42), Q.paw.r, { bone, k: kl * 0.6, region: 'paw' }));
      }
    }
    const tr = Q.tail.r;
    for (let i = 0; i < tN; i++) P(cone(tailP[i], tailP[i + 1], tr[i], tr[i + 1], { bone: 'tail' + (i + 1), bp: i ? 'tail' + i : 'hips', bc: i < tN - 1 ? 'tail' + (i + 2) : null, k: i ? Q.kl * 0.6 : Q.kt * 0.6, region: 'tail', tailT: [i / tN, (i + 1) / tN] }));
    if (Q.extraPrims) Q.extraPrims(P, JP);
    const plan = {
      kind: 'quad', species: Q.species, cfg: Q.cfg, joints: J, JP, prims, legs, eyes, ears, hc, R, spY, zH, zS, tailN: tN,
      h: Q.voxel, hullH: Q.hullH, warp: { c: hc, m: Q.warpM || 2, R: R * (Q.warpR || 1.6) },
      gs: Q.gs, gaits: Q.gaits, w2t: Q.w2t, t2g: Q.t2g, scale: Q.scale, coatPost: Q.coatPost, parts: Q.parts, face: Q.face,
      whiskers: Q.whiskers, fur: Q.fur, furMax: Q.furMax, clips: Q.clips, lid: Q.lid,
      springs: (S) => {
        const d = [];
        for (let i = 0; i < tN; i++) d.push({ bone: 'tail' + (i + 1), tail: V3.mul(V3.sub(tailP[i + 1], tailP[i]), S), stiff: lerp(Q.tail.stiff || 0.3, (Q.tail.stiff || 0.3) * 0.45, i / max(1, tN - 1)), drag: 0.16, grav: Q.tail.grav || 0.003 });
        for (const e of ears) d.push({ bone: 'ear' + e.sx, tail: V3.mul(e.F.y, e.H * S), stiff: Q.ear.stiff || 0.3, drag: 0.2, grav: Q.ear.grav || 0 });
        d.push({ bone: 'belly', tail: [0, -0.05 * S * Q.k, 0.01 * S], stiff: 0.18, drag: 0.12, w: 0.7 });
        return d;
      },
    };
    return plan;
  }

  // ---- 阿黃: yellow Formosan mountain dog (台灣土狗) with a red collar
  function dogPlan(spec) {
    const k = 2.2; // ≈ dog / cat size (positions of shared clips scale with gs)
    const hc = [0, 0.545, 0.37], R = 0.058;
    const col = Object.assign({ base: '#d6a24c', belly: '#f2dcae', dark: '#6a4422', nose: '#2a2020', eye: '#3a2618', collar: '#c0302a' }, spec.col || {});
    const muz = [0, -0.25, 1.55];
    return quadPlan({
      species: 'dog', k, gs: 2.25, scale: 1.08 * (spec.size || 1), voxel: 0.027, hullH: 0.036, warpM: 2.4, kt: 0.045, kl: 0.018,
      cfg: { coat: 'dog', eye: { round: true, irisR: 0.7 }, pal: palFrom(col, { iris: '#6b4424', iris2: '#b88440', white: col.belly, pa: mixHex(col.base, col.dark, 0.35) }) },
      hipH: 0.33, shH: 0.32, zH: -0.21, zS: 0.19, spY: 0.43, chestY: 0.28, hx: 0.06, fx: 0.065,
      torso: [
        { c: [0, 0.4, 0.17], r: [0.085, 0.12, 0.13], rot: [0.25, 0, 0], bone: 'chest' },
        { c: [0, 0.4, -0.02], r: [0.08, 0.085, 0.17], bone: 'spine1' },
        { c: [0, 0.41, -0.2], r: [0.075, 0.085, 0.09], bone: 'hips' },
      ],
      neck: { a: [0, 0.46, 0.25], b: [0, 0.52, 0.32], c0: [0, 0.43, 0.22], c1: [0, 0.53, 0.33], r0: 0.06, r1: 0.045 },
      head: {
        c: hc, R,
        prims: [
          { c: V3.add(hc, [0, 0.01, -0.01]), r: [R * 0.95, R * 0.85, R * 1.05] },
          { c: V3.add(hc, [0, -0.032, 0.03]), r: [R * 0.75, R * 0.55, R * 0.75], k: R * 0.4 }, // cheeks
          { c: V3.add(hc, V3.mul(muz, R)), r: [R * 0.13, R * 0.1, R * 0.1], k: R * 0.12 }, // nose leather
          { c: V3.add(hc, [0, -R * 0.62, R * 0.9]), r: [R * 0.3, R * 0.14, R * 0.45], bone: 'jaw', k: R * 0.3 }, // lower jaw
        ],
        cones: [{ a: V3.add(hc, [0, -R * 0.08, R * 0.55]), b: V3.add(hc, [0, -R * 0.28, R * 1.42]), r0: R * 0.42, r1: R * 0.24, k: R * 0.35 }],
      },
      eye: { x: 0.36, y: 0.16, z: 0.58, r: 0.27, yaw: 0.35 },
      ear: { x: 0.44, y: 0.62, z: -0.15, h: 1.3, w: 0.45, flare: 0.28, back: 0.15, out: 0.5, cup: 0.45, taper: 1.1, stiff: 0.28 },
      tail: { pts: [[0, 0.44, -0.29], [0, 0.5, -0.33], [0, 0.57, -0.33], [0, 0.62, -0.29], [0, 0.64, -0.23], [0.01, 0.63, -0.18], [0.02, 0.6, -0.15]], r: [0.022, 0.024, 0.022, 0.019, 0.016, 0.013, 0.009], stiff: 0.35 },
      hind: { knee: [0.64, 0.3], hock: [0.32, -0.28], foot: [0.09, -0.2], toe: [0.04, -0.05] },
      fore: { elbow: [0.6, -0.12], wrist: [0.22, 0.0], hand: [0.09, 0.04], toe: [0.04, 0.17] },
      legR: { thigh: [0.055, 0.04], shin: [0.035, 0.024], meta: [0.02, 0.019], arm: [0.045, 0.033], fore: [0.026, 0.02], metaF: [0.019, 0.019] },
      paw: { r: [0.026, 0.017, 0.034] },
      haunch: { dx: 0.0, dy: -0.04, dz: 0.03, r: [0.05, 0.09, 0.085], rot: [-0.3, 0, 0] },
      shoulder: { dx: 0.0, dy: 0.03, dz: -0.02, r: [0.035, 0.08, 0.05], rot: [0.4, 0, 0] },
      gaits: { walk: { duty: 0.6, lift: 0.03, liftF: 0.035, f0: 1.2, fk: 1.6, sweepMax: 0.12, roll: 0.02, yaw: 0.04, flexF: 0.55 }, trot: { duty: 0.42, flexF: 0.6, f0: 2.0 }, gallop: { flex: 0.16, flexF: 0.6 } },
      w2t: 1.1, t2g: 2.6,
      whiskers: { col: '#2a2420', rows: [[-0.35, 8, 0.9], [-0.42, -6, 0.85]], w: 0.012 },
      face: 'dog', faceCol: col,
      coatPost(plan, x, y, z, n, M, reg) {
        const under = smooth(-0.1, -0.6, n[1]), legish = (reg.leg || 0) + (reg.lowleg || 0) + (reg.paw || 0);
        M.white = max(under * ((reg.torso || 0) + (reg.neck || 0)) * 0.9, legish * smooth(0.22, 0.06, y) * 0.6, (reg.tail || 0) * smooth(-0.2, -0.6, n[1]) * 0.8);
        M.pa = smooth(0.3, 0.8, n[1]) * smooth(0.36, 0.44, y) * (1 - (reg.head || 0)) * 0.9; // darker saddle
        M.tick = 0.6;
        // red collar
        const a = plan.JP.neck, b2 = plan.JP.head;
        const ax = V3.norm(V3.sub(b2, a)), t = V3.dot(V3.sub([x, y, z], a), ax);
        if ((reg.neck || 0) > 0.3 && t > 0.006 && t < 0.026) M.col = [...hex(col.collar), 1];
      },
    }, col);
  }

  // ---- 山羌: Formosan Reeves's muntjac
  function muntjacPlan(spec) {
    const hc = [0, 0.54, 0.4], R = 0.046;
    const col = Object.assign({ base: '#9a6438', belly: '#d8b488', dark: '#4a2c16', nose: '#2a2020', eye: '#2a1a10' }, spec.col || {});
    return quadPlan({
      species: 'muntjac', k: 2.4, gs: 2.45, scale: 1.15 * (spec.size || 1) / 0.9, voxel: 0.023, hullH: 0.034, warpM: 2.4, kt: 0.04, kl: 0.012,
      cfg: { coat: 'muntjac', eye: { round: true, irisR: 0.8 }, pal: palFrom(col, { iris: '#1e120c', iris2: '#3a2414', white: '#efe4d0', pa: col.dark, pb: mixHex(col.base, col.dark, 0.4) }) },
      hipH: 0.37, shH: 0.33, zH: -0.22, zS: 0.18, spY: 0.47, chestY: 0.32, hx: 0.05, fx: 0.05,
      torso: [
        { c: [0, 0.43, 0.15], r: [0.07, 0.1, 0.12], rot: [0.2, 0, 0], bone: 'chest' },
        { c: [0, 0.44, -0.03], r: [0.075, 0.09, 0.16], bone: 'spine1' },
        { c: [0, 0.47, -0.2], r: [0.075, 0.085, 0.1], bone: 'hips' },
      ],
      neck: { a: [0, 0.47, 0.22], b: [0, 0.52, 0.34], c0: [0, 0.45, 0.2], c1: [0, 0.53, 0.35], r0: 0.045, r1: 0.032 },
      head: {
        c: hc, R,
        prims: [
          { c: V3.add(hc, [0, 0.008, -0.01]), r: [R * 0.85, R * 0.8, R * 1.0] },
          { c: V3.add(hc, [0, -R * 0.3, R * 1.75]), r: [R * 0.26, R * 0.22, R * 0.2], k: R * 0.15 }, // rhinarium
          { c: V3.add(hc, [0, -R * 0.62, R * 1.0]), r: [R * 0.24, R * 0.14, R * 0.5], bone: 'jaw', k: R * 0.3 },
        ],
        cones: [{ a: V3.add(hc, [0, -R * 0.05, R * 0.5]), b: V3.add(hc, [0, -R * 0.3, R * 1.65]), r0: R * 0.5, r1: R * 0.26, k: R * 0.4 }],
      },
      eye: { x: 0.48, y: 0.18, z: 0.45, r: 0.34, yaw: 0.75 },
      ear: { x: 0.45, y: 0.6, z: -0.3, h: 1.35, w: 0.62, flare: 0.75, back: 0.35, out: 0.75, cup: 0.5, round: true, stiff: 0.32 },
      tail: { pts: [[0, 0.5, -0.29], [0, 0.48, -0.33], [0, 0.45, -0.36], [0, 0.42, -0.37]], r: [0.022, 0.024, 0.02, 0.012], stiff: 0.4 },
      hind: { knee: [0.68, 0.24], hock: [0.42, -0.22], foot: [0.1, -0.16], toe: [0.0, -0.07] },
      fore: { elbow: [0.66, -0.1], wrist: [0.32, 0.0], hand: [0.1, 0.02], toe: [0.0, 0.1] },
      legR: { thigh: [0.048, 0.03], shin: [0.026, 0.014], meta: [0.011, 0.0105], arm: [0.035, 0.022], fore: [0.016, 0.011], metaF: [0.0105, 0.0105] },
      hoof: { r0: 0.012, r1: 0.008 },
      haunch: { dx: 0.0, dy: -0.04, dz: 0.02, r: [0.045, 0.09, 0.08], rot: [-0.3, 0, 0] },
      gaits: { walk: { duty: 0.62, lift: 0.04, liftF: 0.045, f0: 1.3, fk: 1.4, sweepMax: 0.12, roll: 0.015, yaw: 0.03, flexF: 0.5 }, trot: { duty: 0.4, flexF: 0.55 }, gallop: { flex: 0.12, flexF: 0.5, duty: 0.28 } },
      w2t: 1.0, t2g: 2.2,
      face: 'muntjac', faceCol: col,
      extraPrims(P, JP) {}, // antlers are tube parts (below)
      parts(body, plan, mAt) {
        const hcc = plan.hc, RR = plan.R, horn = [...hex('#d9c7a0'), 1], ped = [...hex(col.base), 1];
        for (const s of [1, -1]) { // hairy pedicles + short spikes curving back, then a tiny brow tine
          const b0 = V3.add(hcc, [s * 0.32 * RR, 0.72 * RR, 0.05 * RR]);
          const pts = [b0, V3.add(b0, [s * 0.05 * RR, 0.42 * RR, -0.12 * RR]), V3.add(b0, [s * 0.08 * RR, 0.8 * RR, -0.25 * RR]), V3.add(b0, [s * 0.06 * RR, 1.1 * RR, -0.5 * RR]), V3.add(b0, [s * 0.02 * RR, 1.22 * RR, -0.75 * RR])];
          addTube(body, pts, [0.12 * RR, 0.1 * RR, 0.085 * RR, 0.06 * RR, 0.012 * RR], 6, [['head', 1]], (p, t) => { const m = mAt(p); m.col = t < 0.35 ? ped : horn; m.face = 0; return m; }, true);
        }
      },
      coatPost(plan, x, y, z, n, M, reg) {
        const under = smooth(-0.1, -0.6, n[1]);
        M.white = max(under * ((reg.torso || 0) + (reg.neck || 0)), (reg.tail || 0) * smooth(0.1, -0.5, n[1]));
        M.pa = (reg.lowleg || 0) * 0.8 + (reg.leg || 0) * smooth(0.25, 0.12, y) * 0.7; // darker legs
        M.pb = smooth(0.4, 0.9, n[1]) * (reg.torso || 0) * 0.6; // darker dorsal line
        if ((reg.paw || 0) > 0.4) M.col = [...hex('#2a2420'), 1];
        M.tick = 0.5;
      },
    }, col);
  }

  // ---- 水牛: Taiwanese water buffalo (swamp type): slate-grey hide, crescent swept-back horns, white throat
  // chevrons, pale lower legs, nose rope through the septum, tufted tail
  function buffaloPlan(spec) {
    const hc = [0, 1.02, 1.12], R = 0.17;
    const col = Object.assign({ base: '#5c6068', belly: '#7a7e86', dark: '#34363c', nose: '#2a2a2e', eye: '#1c1a1e' }, spec.col || {});
    return quadPlan({
      species: 'buffalo', k: 5.5, gs: 5.6, scale: 0.95 * (spec.size || 1), voxel: 0.075, hullH: 0.12, kt: 0.12, kl: 0.05, warpM: 1.9, warpR: 1.7,
      cfg: { coat: 'buffalo', eye: { round: true, irisR: 0.8 }, pal: palFrom(col, { iris: '#2a2220', iris2: '#4a3a30', white: '#e8e4dc', pa: '#4a4640', pb: '#a39c96', base2: '#6a6e78' }) },
      hipH: 0.86, shH: 0.84, zH: -0.62, zS: 0.52, spY: 1.18, chestY: 0.72, hx: 0.17, fx: 0.18,
      torso: [
        { c: [0, 1.05, 0.48], r: [0.3, 0.36, 0.38], rot: [0.12, 0, 0], bone: 'chest' },
        { c: [0, 1.0, -0.05], r: [0.36, 0.36, 0.55], bone: 'spine1' },
        { c: [0, 0.82, -0.05], r: [0.3, 0.2, 0.42], belly: true },
        { c: [0, 1.06, -0.55], r: [0.27, 0.3, 0.3], bone: 'hips' },
        { c: [0, 1.25, 0.38], r: [0.16, 0.12, 0.28], bone: 'chest' }, // withers ridge
      ],
      neck: { a: [0, 1.12, 0.78], b: [0, 1.07, 0.98], c0: [0, 1.08, 0.72], c1: [0, 1.04, 1.0], r0: 0.27, r1: 0.19 },
      head: {
        c: hc, R,
        prims: [
          { c: V3.add(hc, [0, 0.0, 0.0]), r: [R * 1.0, R * 0.85, R * 1.0] },
          { c: V3.add(hc, [0, -R * 0.72, R * 1.95]), r: [R * 0.62, R * 0.42, R * 0.38], k: R * 0.3 }, // broad muzzle
          { c: V3.add(hc, [0, -R * 1.0, R * 1.5]), r: [R * 0.42, R * 0.22, R * 0.6], bone: 'jaw', k: R * 0.3 },
        ],
        cones: [{ a: V3.add(hc, [0, -R * 0.1, R * 0.5]), b: V3.add(hc, [0, -R * 0.62, R * 1.8]), r0: R * 0.72, r1: R * 0.55, k: R * 0.4 }],
      },
      eye: { x: 0.68, y: 0.15, z: 0.5, r: 0.2, yaw: 0.95 },
      ear: { x: 0.85, y: 0.18, z: -0.25, h: 1.2, w: 0.42, flare: 1.35, back: 0.3, out: 0.9, cup: 0.45, droop: 0.25, round: true, stiff: 0.25, grav: 0.002 },
      tail: { pts: [[0, 1.18, -0.85], [0, 1.02, -0.92], [0, 0.85, -0.93], [0, 0.68, -0.92], [0, 0.52, -0.9], [0, 0.38, -0.88]], r: [0.06, 0.04, 0.03, 0.025, 0.022, 0.05], stiff: 0.22, grav: 0.004 },
      hind: { knee: [0.66, 0.22], hock: [0.48, -0.2], foot: [0.11, -0.12], toe: [0.0, -0.02] },
      fore: { elbow: [0.62, -0.08], wrist: [0.34, 0.0], hand: [0.11, 0.03], toe: [0.0, 0.12] },
      legR: { thigh: [0.16, 0.1], shin: [0.09, 0.06], meta: [0.055, 0.05], arm: [0.14, 0.095], fore: [0.07, 0.058], metaF: [0.052, 0.05] },
      hoof: { r0: 0.065, r1: 0.06 },
      haunch: { dx: 0.02, dy: -0.12, dz: 0.06, r: [0.14, 0.26, 0.24], rot: [-0.25, 0, 0] },
      shoulder: { dx: 0.0, dy: 0.06, dz: -0.04, r: [0.11, 0.24, 0.16], rot: [0.35, 0, 0] },
      gaits: { walk: { duty: 0.66, lift: 0.025, liftF: 0.03, f0: 0.95, fk: 1.0, sweepMax: 0.11, roll: 0.025, yaw: 0.03, flexF: 0.4, bob: 0.003 }, trot: { duty: 0.48, flexF: 0.45, f0: 1.6 }, gallop: { flex: 0.06, flexF: 0.4, duty: 0.35 } },
      w2t: 1.25, t2g: 2.6,
      face: 'buffalo', faceCol: col,
      parts(body, plan, mAt) {
        const h = plan.hc, RR = plan.R;
        const hornC = [...hex('#3a3632'), 1], tipC = [...hex('#1e1c1a'), 1];
        for (const s of [1, -1]) { // crescent horns sweeping out, back and up (in the plane of the forehead)
          const pts = [];
          for (let i = 0; i <= 9; i++) {
            const t = i / 9, a = t * 2.35;
            pts.push(V3.add(h, [s * (0.55 + 1.45 * sin(a * 0.75)) * RR, (0.62 + 0.45 * t + 0.35 * sin(a * 0.9) * t) * RR, (-0.05 - 1.7 * (1 - cos(a * 0.62)) - 0.2 * t) * RR]));
          }
          const radii = pts.map((_, i) => RR * 0.26 * (1 - Math.pow(i / 9, 1.4) * 0.92));
          addTube(body, pts, radii, 9, [['head', 1]], (p, t) => { const m = mAt(p); m.face = 0; m.col = t > 0.8 ? tipC : hornC; m.ao = 0.85 + 0.15 * (sin(t * 60) > 0 ? 1 : 0.6); return m; }, true);
        }
        // nose rope: a ring through the septum and a lead hanging down
        const ring = [];
        const nc = V3.add(h, [0, -0.92 * RR, 2.22 * RR]);
        for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU; ring.push(V3.add(nc, [0.14 * RR * cos(a), -0.12 * RR + 0.12 * RR * sin(a), 0])); }
        const rope = [...hex('#b88a4a'), 1];
        addTube(body, ring, ring.map(() => RR * 0.035), 5, [['jaw', 0.4], ['head', 0.6]], (p) => { const m = M0(); m.col = rope; m.rest = p; return m; });
        const lead = [V3.add(nc, [0.12 * RR, -0.15 * RR, 0]), V3.add(nc, [0.35 * RR, -0.7 * RR, -0.2 * RR]), V3.add(nc, [0.5 * RR, -1.5 * RR, -0.6 * RR]), V3.add(nc, [0.58 * RR, -2.4 * RR, -1.1 * RR])];
        addTube(body, lead, lead.map(() => RR * 0.03), 5, (t) => [['head', 1 - t * 0.6], ['neck', t * 0.6]], (p) => { const m = M0(); m.col = rope; m.rest = p; return m; });
      },
      coatPost(plan, x, y, z, n, M, reg) {
        // slate hide, paler grey-pink lower legs ("stockings"), two white throat chevrons, dark muddy hooves
        M.white = 0; M.tick = 0.15;
        const legish = (reg.leg || 0) + (reg.lowleg || 0);
        M.pb = legish * smooth(0.55, 0.3, y);
        if ((reg.paw || 0) > 0.35) M.col = [...hex('#2a2622'), 1];
        if ((reg.neck || 0) + (reg.head || 0) * 0.3 > 0.3 && n[1] < -0.2) {
          const a = plan.JP.neck, t = z - a[2];
          if (abs(t - 0.02) < 0.03 || abs(t - 0.2 + abs(x) * 0.6) < 0.025) M.col = [...hex('#e8e4dc'), 0.95];
        }
        M.pa = smooth(-0.3, -0.8, n[1]) * (reg.torso || 0) * 0.6; // mud-darkened underside
      },
    }, col);
  }

  // ================================================================================== birds
  // Same rig vocabulary (hips/chest/neck/head, tail*, legs HL/HR with the digitigrade 4-bone chain) plus wing bones.
  function birdPlan(id, spec) {
    const magpie = /magpie/.test(id), crow = spec.species === 'crow' && !magpie;
    const B = magpie ? { body: [0.05, 0.05, 0.09], head: 0.024, neck: 0.03, legH: 0.11, tail: 0.3, beak: 0.032, scale: 1.25 * (spec.size || 1) / 1.2 }
      : crow ? { body: [0.055, 0.055, 0.1], head: 0.028, neck: 0.035, legH: 0.12, tail: 0.13, beak: 0.045, scale: 1.3 * (spec.size || 1) }
        : { body: [0.075, 0.08, 0.11], head: 0.027, neck: 0.04, legH: 0.15, tail: 0.16, beak: 0.024, scale: 1.2 * (spec.size || 1) };
    const pal = magpie ? { base: '#2f6fd0', base2: '#4a8ae8', dark: '#101018', white: '#f4f4f0', pa: '#101018', pb: '#2f6fd0', beak: '#d0302a', leg: '#d0302a', iris: '#f0e060', iris2: '#f8f0a0', comb: '#d0302a', tail: '#2f6fd0' }
      : crow ? { base: '#24222c', base2: '#3a3a52', dark: '#141218', white: '#2a2833', pa: '#24222c', pb: '#24222c', beak: '#2a2830', leg: '#2e2a34', iris: '#2a2028', iris2: '#4a3a40', tail: '#1c1a24' }
        : { base: '#f2ece0', base2: '#fff8ea', dark: '#c8a070', white: '#fbf6ec', pa: '#d89848', pb: '#c86030', beak: '#e8a83a', leg: '#e0a040', iris: '#c86a20', iris2: '#f0b040', comb: '#d8302a', tail: '#2e5a40' };
    const y0 = B.legH + B.body[1] * 0.55;
    const hc = [0, y0 + B.body[1] * 1.1 + B.neck * 1.6, B.body[2] * 0.85];
    const R = B.head;
    const J = [], j = (n, p, v) => J.push([n, p, v]);
    j('root', null, [0, 0, 0]);
    j('hips', 'root', [0, y0, -B.body[2] * 0.2]);
    j('spine1', 'hips', [0, y0 + 0.004, 0]);
    j('belly', 'spine1', [0, y0 - B.body[1] * 0.5, 0]);
    j('spine2', 'spine1', [0, y0 + 0.008, B.body[2] * 0.25]);
    j('chest', 'spine2', [0, y0 + 0.012, B.body[2] * 0.5]);
    j('neck', 'chest', [0, y0 + B.body[1] * 0.6, B.body[2] * 0.7]);
    j('head', 'neck', [0, hc[1] - R * 0.6, hc[2] - R * 0.5]);
    j('jaw', 'head', [0, hc[1] - R * 0.25, hc[2] + R * 0.7]);
    const eyes = [];
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      const c = V3.add(hc, [s * R * 0.55, R * 0.18, R * 0.35]);
      const F = frameOf(c, [s * sin(1.15), 0.05, cos(1.15)]);
      j('eye' + sx, 'head', c); j('lidU' + sx, 'head', c); j('lidD' + sx, 'head', c);
      eyes.push({ s, c, F, sx, r: R * 0.4 });
    }
    const tl = B.tail;
    const tailP = [[0, y0 + 0.01, -B.body[2] * 0.85], [0, y0 + (crow || magpie ? 0.0 : 0.05), -B.body[2] * 0.85 - tl * 0.5], [0, y0 + (crow || magpie ? -0.01 : 0.1), -B.body[2] * 0.85 - tl]];
    for (let i = 0; i < 2; i++) j('tail' + (i + 1), i ? 'tail' + i : 'hips', tailP[i]);
    const legs = {};
    const hx = B.body[0] * 0.45;
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      j('thigh' + sx, 'hips', [s * hx, y0 - 0.01, -0.005]);
      j('shin' + sx, 'thigh' + sx, [s * hx * 1.1, y0 - B.body[1] * 0.55, 0.03]);
      j('hock' + sx, 'shin' + sx, [s * hx, B.legH * 0.62, -0.012]);
      j('foot' + sx, 'hock' + sx, [s * hx, 0.012, 0.0]);
      legs['H' + sx] = { s, front: false, chain: ['thigh' + sx, 'shin' + sx, 'hock' + sx, 'foot' + sx], toe: [s * hx, 0.006, 0.045], girdle: 'hips' };
      j('wing' + sx, 'chest', [s * B.body[0] * 0.85, y0 + B.body[1] * 0.45, B.body[2] * 0.35]);
      j('wing2' + sx, 'wing' + sx, [s * B.body[0] * 0.95, y0 + B.body[1] * 0.3, -B.body[2] * 0.35]);
    }
    const JP = {}; for (const [n, , p] of J) JP[n] = p;
    const prims = [], P = (p) => { prims.push(p); return p; };
    const bw = (x, y, z) => (z > 0.01 ? [['chest', 1]] : [['spine1', 0.5], ['hips', 0.5]]);
    P(ell([0, y0, 0], B.body, { rot: [-0.25, 0, 0], boneFn: bw, bone: 'spine1', k: 0.02, region: 'torso', fluff: crow ? 0 : 0.004, flow: [0, -0.3, -1], clump: 60 }));
    P(ell([0, y0 - 0.005, B.body[2] * 0.5], [B.body[0] * 0.85, B.body[1] * 0.85, B.body[2] * 0.55], { bone: 'chest', k: 0.03, region: 'torso' }));
    P(cone([0, y0 + B.body[1] * 0.4, B.body[2] * 0.62], [0, hc[1] - R * 0.5, hc[2] - R * 0.3], B.neck, B.neck * 0.7, { bone: 'neck', bp: 'chest', bc: 'head', k: 0.025, region: 'neck', fluff: magpie || crow ? 0 : 0.006, flow: [0, -1, -0.4], clump: 70 }));
    P(ell(hc, [R, R * 1.0, R * 1.1], { bone: 'head', k: R * 0.3, region: 'head' }));
    for (const s of [1, -1]) {
      const sx = s > 0 ? 'L' : 'R';
      P(ell(V3.lerp(JP['wing' + sx], JP['wing2' + sx], 0.5), [B.body[0] * 0.28, B.body[1] * 0.55, B.body[2] * 0.6], { rot: [-0.2, 0, s * 0.15], bone: 'wing' + sx, bc: 'wing2' + sx, k: 0.012, region: 'wing' }));
      P(ell(V3.lerp(JP['shin' + sx], JP['hock' + sx], 0.35), [0.016 * B.body[0] / 0.06, 0.03 * B.body[1] / 0.06, 0.022 * B.body[2] / 0.1], { bone: 'shin' + sx, bp: 'thigh' + sx, k: 0.015, region: 'leg' }));
    }
    if (!crow && !magpie) { // comb + wattles
      for (let i = 0; i < 4; i++) P(ell(V3.add(hc, [0, R * (0.95 + 0.25 * sin(i / 3 * PI)), R * (0.55 - i * 0.38)]), [R * 0.12, R * 0.32, R * 0.22], { bone: 'head', k: R * 0.12, region: 'comb', white: 0 }));
      for (const s of [1, -1]) P(ell(V3.add(hc, [s * R * 0.15, -R * 0.95, R * 0.75]), [R * 0.14, R * 0.32, R * 0.14], { bone: 'jaw', k: R * 0.15, region: 'comb' }));
    }
    const legC = [...hex(pal.leg), 1], beakC = [...hex(pal.beak), 1];
    return {
      kind: 'bird', species: magpie ? 'magpie' : crow ? 'crow' : 'chicken', cfg: { coat: 'bird', pal, eye: { round: true } },
      joints: J, JP, prims, legs, eyes, ears: [], hc, R, spY: y0, zH: -B.body[2], zS: B.body[2], tailN: 2,
      h: crow || magpie ? 0.0095 : 0.0116, hullH: 0.017, warp: { c: hc, m: 2.2, R: R * 1.8 },
      gs: B.legH / 0.144 * 0.9, scale: B.scale, lid: { up: 0.35, dn: -0.25 },
      gaits: { walk: { duty: 0.6, off: { HL: 0, HR: 0.5 }, lift: 0.025, f0: 1.6, fk: 1.6, sweepMax: 0.07, bob: 0.004, roll: 0.05, yaw: 0.0 },
        trot: { duty: 0.42, off: { HL: 0, HR: 0.5 }, lift: 0.03, f0: 2.4, fk: 1.0, sweepMax: 0.08, bob: 0.008, roll: 0.03, yaw: 0 },
        gallop: crow || magpie ? { duty: 0.3, off: { HL: 0, HR: 0.03 }, lift: 0.06, f0: 2.2, fk: 0.4, sweepMax: 0.09, bob: 0.03, flex: 0, hop: true } : { duty: 0.36, off: { HL: 0, HR: 0.5 }, lift: 0.035, f0: 2.8, fk: 0.8, sweepMax: 0.1, bob: 0.01, flex: 0 } },
      w2t: 1.0, t2g: crow || magpie ? 1.6 : 2.4,
      face: 'bird', whiskers: null, fur: null,
      coatPost(plan, x, y, z, n, M, reg) {
        M.st = 0; M.tick = 0.2;
        if (reg.comb > 0.3) M.col = [...hex(pal.comb || pal.beak), 1];
        if (plan.species === 'chicken') { M.pa = (reg.neck || 0) * smooth(0.0, 0.6, n[1] + 0.3) * 0.9; M.pb = (reg.wing || 0) * 0.7; }
        if (plan.species === 'magpie') { M.pa = max(reg.head || 0, (reg.neck || 0) * smooth(plan.hc[1] - 0.06, plan.hc[1] - 0.03, y)); M.white = smooth(-0.2, -0.7, n[1]) * (reg.torso || 0) * 0.3; }
        if (plan.species === 'crow') M.tick = 0.6;
      },
      parts(body, plan, mAt) {
        const hcc = plan.hc, RR = plan.R;
        // beak: tapered tube (upper on head, lower on jaw)
        for (const [bone, dy, len, r0] of [['head', 0.0, B.beak, RR * 0.32], ['jaw', -RR * 0.18, B.beak * 0.85, RR * 0.22]]) {
          const a = V3.add(hcc, [0, dy - RR * 0.05, RR * 0.85]);
          const pts = [a, V3.add(a, [0, -len * 0.08, len * 0.5]), V3.add(a, [0, -len * (crow ? 0.28 : 0.2), len])];
          addTube(body, pts, [r0, r0 * 0.62, r0 * 0.06], 7, [[bone, 1]], (p) => { const m = M0(); m.col = beakC; m.rest = p; m.ao = 1; return m; }, true);
        }
        // legs: scaled shank + three forward toes and a hind toe
        for (const s of [1, -1]) {
          const sx = s > 0 ? 'L' : 'R';
          const h = plan.JP['hock' + sx], f = plan.JP['foot' + sx];
          const rl = B.legH * 0.055;
          addTube(body, [V3.add(h, [0, 0.01, 0]), V3.lerp(h, f, 0.5), f], [rl * 1.3, rl, rl * 0.9], 6, (t) => [['hock' + sx, 1 - t * 0.3], ['foot' + sx, t * 0.3]], () => { const m = M0(); m.col = legC; m.ao = 0.95; return m; });
          for (const [ang, len] of [[-0.45, 1], [0, 1.2], [0.45, 1], [PI, 0.6]]) {
            const d = [sin(ang) * s, 0, cos(ang)], L2 = B.legH * 0.33 * len;
            const pts = [f, V3.add(f, [d[0] * L2 * 0.5, -0.004, d[2] * L2 * 0.5]), V3.add(f, [d[0] * L2, -0.007, d[2] * L2])];
            addTube(body, pts, [rl * 0.8, rl * 0.6, rl * 0.3], 5, [['foot' + sx, 1]], () => { const m = M0(); m.col = legC; return m; });
          }
        }
      },
      feathers(cards, plan, mAt) { // wing primaries, tail fan (rooster sickles / magpie streamers)
        for (const s of [1, -1]) {
          const sx = s > 0 ? 'L' : 'R';
          const a = plan.JP['wing' + sx], b = plan.JP['wing2' + sx];
          for (let i = 0; i < 7; i++) {
            const t = i / 6, root = V3.lerp(a, b, 0.35 + 0.65 * t);
            const dir = V3.norm([s * 0.12, -0.12 - 0.05 * t, -1]), L = B.body[2] * (0.75 + 0.5 * t);
            featherCard(cards, root, dir, [s, 0.15, 0], L, B.body[2] * 0.22, [['wing2' + sx, 0.4 + 0.6 * t], ['wing' + sx, 0.6 - 0.6 * t]], mAt(root), pal.dark);
          }
        }
        const tb = plan.JP.tail1, nT = magpie ? 6 : crow ? 7 : 9;
        for (let i = 0; i < nT; i++) {
          const u = i / (nT - 1) - 0.5;
          const up = magpie || crow ? -0.15 : 0.6 + 0.25 * cos(u * PI);
          const dir = V3.norm([u * (magpie ? 0.25 : 0.7), up, -1]);
          const L = B.tail * (magpie ? (abs(u) < 0.2 ? 1.6 : 1.1 - abs(u)) : crow ? 1 : 0.9 + 0.35 * cos(u * PI));
          featherCard(cards, V3.add(tb, [u * 0.02, 0, 0]), dir, [1, 0, 0], L, B.body[2] * (magpie ? 0.28 : 0.3), [['tail2', 0.6], ['tail1', 0.4]], mAt(tb), magpie ? '#f4f4f0' : pal.tail, magpie);
        }
      },
      clips: 'bird',
    };
  }
  function featherCard(cards, root, dir, side, L, W, skin, M, tipCol, whiteTip) {
    const bn = V3.norm(V3.sub(side, V3.mul(dir, V3.dot(side, dir))));
    const n = V3.norm(V3.cross(dir, bn));
    cards.grid(1, 3, (uu, t) => {
      const q = V3.add(root, V3.add(V3.mul(dir, L * t), [0, -L * 0.15 * t * t, 0]));
      const p = V3.add(q, V3.mul(bn, (uu - 0.5) * W * (1 - 0.3 * t)));
      const m = Object.assign({}, M, { rest: root, ao: lerp(0.8, 1.05, t), col: t > 0.82 && whiteTip ? [...hex('#f4f4f0'), 1] : (tipCol ? [...hex(tipCol), smooth(0.3, 0.9, t) * 0.8] : M.col) });
      return { p, n, skin, m, x: [uu, t] };
    }, false);
  }

  // ================================================================================== species → plan
  const PETS = {
    // values from the approved design kit (tools/design2/yuyuan.js, mochi.js BASE specs)
    yuyuan: { judge: true, exprBase: 'judging', bow: { col: '#C8332E', dark: '#8E1F22' }, coat: 'tabby', R: 0.19, fat: 1.42, cheek: 1.15, skullW: 1.04, ear: { size: 1.25, flare: 0.28 }, eye: { yaw: 0.3, pupil: 0.2 }, tail: { len: 0.95, r: 1.1 }, scale: 1.5, leg: 0.94, legR: 1.05 },
    mochi: { chirpy: true, voxel: 0.0135, hullH: 0.021, coat: 'calico', R: 0.2, fat: 1.32, cheek: 0.9, skullW: 1.02, ear: { size: 1.15, flare: 0.31, lynx: 1 }, eye: { yaw: 0.3, round: true, pupil: 0.42, hl: '#ffe2a8', hl2: '#ffc870' }, tail: { len: 1.1, r: 1.5, taper: 0.95, fluff: 0.012 }, fluff: 1, ruff: 1.1, scale: 1.55, leg: 0.97, legR: 1.05 },
    cat: { voxel: 0.0175, hullH: 0.024, coat: 'orange', R: 0.18, fat: 1.0, cheek: 0.5, ear: { size: 1.05, flare: 0.3 }, eye: { yaw: 0.32, pupil: 0.25 }, tail: { len: 1.05 }, scale: 1.45 },
    leopard: { voxel: 0.0165, hullH: 0.023, coat: 'leopard', R: 0.18, fat: 1.05, cheek: 0.6, ear: { size: 0.95, flare: 0.36, round: true }, eye: { yaw: 0.32, round: true, pupil: 0.5 }, tail: { len: 1.05, r: 1.2, taper: 0.85 }, scale: 1.45 },
  };

  function planFor(id, spec) {
    const sp = spec.species;
    if (PETS[id]) return catPlan(PETS[id]);
    if (spec.kind === 'bird') return birdPlan(id, spec);
    if (sp === 'buffalo') return buffaloPlan(spec);
    if (sp === 'dog' && /muntjac/.test(id)) return muntjacPlan(spec);
    if (sp === 'dog') return dogPlan(spec);
    if (sp === 'leopardcat') return catPlan(Object.assign({}, PETS.leopard, { scale: PETS.leopard.scale * (spec.size || 1) / 1.3 * 1.15 }));
    return catPlan(PETS.cat);
  }

  // ================================================================================== pose layer
  // A pose is a flat set of blendable numbers (plan units / radians). Clips write absolute poses starting from the
  // neutral standing pose; the instance crossfades locomotion ↔ clips, then adds additive layers, then solves the rig.
  const LEGK = ['FL', 'FR', 'HL', 'HR'];
  const PK = ['hipX', 'hipY', 'hipZ', 'hipP', 'hipYw', 'hipR', 'sp1P', 'sp1Y', 'sp1R', 'sp2P', 'sp2Y', 'sp2R', 'chP', 'chY', 'chR',
    'neckP', 'neckY', 'neckR', 'headP', 'headY', 'headR', 'jaw', 'tongue',
    'earLP', 'earLY', 'earLR', 'earRP', 'earRY', 'earRR', 'scapL', 'scapR', 'bellyY',
    'lidUL', 'lidUR', 'lidDL', 'lidDR', 'pupil', 'eyeY', 'eyeP',
    'tailP', 'tailY', 'tailCurl', 'tailCurlY', 'tailTipP', 'tailWaveA', 'tailWaveF', 'purr', 'look', 'breath',
    'neckZ', 'wing', 'flap', 'flapF', 'wingFold'];
  for (const l of LEGK) for (const c of ['x', 'y', 'z', 'g', 'm', 't']) PK.push(l + c);
  const PI_ = {}; PK.forEach((k, i) => (PI_[k] = i));
  const NP = PK.length;
  const newPose = () => new Float32Array(NP);
  // pose accessor: p.k = value via proxy-free helpers (fast and blendable)
  function W(p, k, v) { p[PI_[k]] = v; }
  function Ad(p, k, v) { p[PI_[k]] += v; }
  function Rd(p, k) { return p[PI_[k]]; }
  function blendInto(dst, src, w) { if (w <= 0) return; if (w >= 1) { dst.set(src); return; } for (let i = 0; i < NP; i++) dst[i] += (src[i] - dst[i]) * w; }
  function neutral(p, I) {
    p.fill(0);
    W(p, 'pupil', I.expr.pupil); W(p, 'look', 1); W(p, 'breath', 1);
    W(p, 'lidUL', I.expr.lidU); W(p, 'lidUR', I.expr.lidU); W(p, 'lidDL', I.expr.lidD); W(p, 'lidDR', I.expr.lidD);
    W(p, 'tailP', 0.1); W(p, 'tailCurl', -0.06); W(p, 'tailTipP', -0.25); W(p, 'tailWaveA', 0.06); W(p, 'tailWaveF', 0.35);
    return p;
  }
  const ease = (t) => t * t * (3 - 2 * t);
  const easeO = (t) => 1 - (1 - t) * (1 - t);
  const pulse = (t, a, b, c, d) => smooth(a, b, t) * (1 - smooth(c, d, t)); // 0→1 between a..b, back to 0 between c..d

  // ================================================================================== gaits (cat family)
  // offsets: phase of each foot's touchdown within the stride; duty: stance fraction. All lengths in plan units.
  const GAITS = {
    walk: { duty: 0.64, off: { HL: 0, FL: 0.24, HR: 0.5, FR: 0.74 }, lift: 0.032, liftF: 0.04, f0: 1.25, fk: 2.4, sweepMax: 0.11, bob: 0.004, roll: 0.03, yaw: 0.07, scap: 0.008 },
    trot: { duty: 0.44, off: { FL: 0, HR: 0.02, FR: 0.5, HL: 0.52 }, lift: 0.04, liftF: 0.048, f0: 2.3, fk: 0.9, sweepMax: 0.13, bob: 0.006, roll: 0.02, yaw: 0.035, scap: 0.006 },
    gallop: { duty: 0.24, off: { HL: 0, HR: 0.09, FR: 0.44, FL: 0.53 }, lift: 0.05, liftF: 0.06, f0: 2.7, fk: 0.22, sweepMax: 0.16, bob: 0.014, roll: 0.0, yaw: 0.0, scap: 0.004, flex: 0.2 },
  };
  function gaitPose(p, I, g, phase, vp, vf) {
    const G_ = I.gaits[g];
    const f = I.cadence[g];
    const sweep = vp * G_.duty / max(f, 0.01);
    for (const L of I.legKeys) {
      const front = L[0] === 'F';
      const ph = ((phase + G_.off[L]) % 1 + 1) % 1;
      let z, y = 0, m = 0, t = 0;
      if (ph < G_.duty) { // stance: the foot sweeps back at exactly body speed (planted)
        const s = ph / G_.duty;
        z = sweep * (0.5 - s);
        if (!front) m = -0.25 * smooth(0.6, 1, s); // heel (hock) lifts in push-off
        else m = -0.4 * smooth(0.65, 1, s);
        t = 0.25 * smooth(0.7, 1, s);
      } else { // swing: accelerate forward, arc up, paw flicks back then reaches
        const s = (ph - G_.duty) / (1 - G_.duty);
        z = sweep * (-0.5 + ease(s));
        y = (front ? G_.liftF : G_.lift) * Math.pow(sin(PI * s), 0.8) * min(1, 0.45 + vf * 1.2);
        if (front) { const fl = sin(PI * Math.pow(s, 0.75)) * min(1, 0.45 + vf) * (G_.flexF != null ? G_.flexF : 1); m = -1.5 * fl; t = 1.3 * fl; }
        else { m = -0.5 * sin(PI * s); t = 0.5 * sin(PI * s); }
      }
      if (g === 'gallop') z += front ? 0.025 : 0.02;
      W(p, L + 'z', z); W(p, L + 'y', y); W(p, L + 'm', m); W(p, L + 't', t);
    }
    const ph2 = phase * TAU;
    // legs reach further by lowering the body: drop ≈ (sweep/2)² / (2·leg length)
    const drop = (sweep * 0.5) ** 2 / (2 * I.legLenN);
    if (g === 'gallop') {
      const fl = G_.flex;
      const flex = cos(ph2 - 0.3); // +1 gathered (arched), -1 extended
      W(p, 'sp1P', -fl * 0.5 * flex); W(p, 'sp2P', -fl * 0.5 * flex); W(p, 'chP', -fl * 0.25 * flex);
      W(p, 'hipP', 0.12 * sin(ph2 - 1.2));
      W(p, 'hipY', G_.bob * cos(ph2 - 5.6) - 0.004 - drop);
      W(p, 'hipZ', 0.012 * flex);
      W(p, 'neckP', 0.12 * sin(ph2 - 0.6)); W(p, 'headP', -0.12 * sin(ph2 - 0.6));
      W(p, 'tailP', -0.15 + 0.15 * sin(ph2)); W(p, 'tailCurl', 0.03);
      W(p, 'earLP', -0.25); W(p, 'earRP', -0.25);
    } else {
      // two dips per stride (each hind touchdown), roll toward the stance side, lateral spine wave, head stabilised
      W(p, 'hipY', -G_.bob * (0.5 + 0.5 * cos(2 * ph2 - 0.6)) - drop);
      W(p, 'hipR', G_.roll * sin(ph2));
      W(p, 'chR', -G_.roll * 0.8 * sin(ph2 + PI * 0.5));
      W(p, 'sp1Y', G_.yaw * sin(ph2)); W(p, 'sp2Y', -G_.yaw * 0.5 * sin(ph2)); W(p, 'chY', -G_.yaw * 0.6 * sin(ph2 + 0.4));
      W(p, 'neckY', G_.yaw * 0.6 * sin(ph2 + 0.4)); W(p, 'headY', G_.yaw * 0.3 * sin(ph2 + 0.4)); W(p, 'headR', G_.roll * 0.5 * sin(ph2));
      W(p, 'headP', 0.03 * cos(2 * ph2)); W(p, 'neckP', g === 'walk' ? 0.12 : 0.05);
      W(p, 'tailP', g === 'walk' ? -0.25 : -0.1); W(p, 'tailCurl', g === 'walk' ? -0.1 : -0.04); W(p, 'tailTipP', -0.35);
      W(p, 'tailY', 0.12 * sin(ph2 + 1.5));
    }
    if (I.plan.kind === 'bird') {
      // head stabilisation (chicken head-bob): the head holds still in the world through each step, then thrusts
      const u = (phase * 2) % 1, amp = vp * 0.5 / max(f, 0.01) * 0.8;
      W(p, 'neckZ', G_.hop ? 0 : (u < 0.75 ? amp * (0.5 - u / 0.75) : amp * (-0.5 + (u - 0.75) / 0.25)));
      W(p, 'hipR', G_.roll * sin(ph2)); W(p, 'sp1Y', 0); W(p, 'sp2Y', 0); W(p, 'chY', 0); W(p, 'neckY', 0); W(p, 'headY', 0); W(p, 'headR', 0);
      W(p, 'hipY', -drop);
      if (G_.hop) { W(p, 'hipY', G_.bob * max(0, sin(ph2 - 0.5)) - drop); W(p, 'wing', 0.08 * max(0, sin(ph2))); W(p, 'tailP', -0.2 * sin(ph2)); }
      W(p, 'tailP', Rd(p, 'tailP') * 0.3); W(p, 'tailWaveA', 0);
      return;
    }
    // shoulder blades ride up through each front stance
    for (const [L, k] of [['FL', 'scapL'], ['FR', 'scapR']]) {
      const ph = ((phase + G_.off[L]) % 1 + 1) % 1;
      W(p, k, G_.scap * (ph < G_.duty ? sin(PI * ph / G_.duty) : -0.4 * sin(PI * (ph - G_.duty) / (1 - G_.duty))));
    }
    W(p, 'tailWaveA', 0.04); W(p, 'tailWaveF', g === 'walk' ? 0.5 : 0.8);
    W(p, 'breath', 0.5);
  }

  // ================================================================================== behaviour clips (cats)
  // Each clip: { dur, loop, fn(t, p, I, k) } where k = normalised time (0..1 of dur, wraps if looping).
  function sitBase(p, I, amt = 1) {
    W(p, 'hipY', -0.135 * amt); W(p, 'hipZ', 0.012 * amt); W(p, 'hipP', -0.62 * amt);
    W(p, 'sp1P', -0.12 * amt); W(p, 'sp2P', -0.12 * amt); W(p, 'chP', -0.06 * amt);
    W(p, 'neckP', 0.55 * amt); W(p, 'headP', 0.32 * amt);
    for (const s of ['L', 'R']) {
      W(p, 'H' + s + 'z', 0.085 * amt); W(p, 'H' + s + 'y', 0); W(p, 'H' + s + 'm', 1.25 * amt); W(p, 'H' + s + 't', -0.1 * amt);
      W(p, 'F' + s + 'z', -0.025 * amt); W(p, 'F' + s + 'm', -0.2 * amt);
    }
    W(p, 'HLx', 0.012 * amt); W(p, 'HRx', -0.012 * amt);
    W(p, 'tailP', 1.05 * amt); W(p, 'tailCurl', 0.04); W(p, 'tailCurlY', 0.36 * amt); W(p, 'tailTipP', 0.1); W(p, 'tailWaveA', 0.02);
  }
  function loafBase(p, I, amt = 1) {
    W(p, 'hipY', -0.122 * amt); W(p, 'hipZ', 0.0); W(p, 'hipP', 0.04 * amt);
    W(p, 'chP', -0.05 * amt); W(p, 'sp2P', 0.02 * amt);
    W(p, 'neckP', -0.25 * amt); W(p, 'headP', 0.18 * amt);
    for (const s of ['L', 'R']) {
      W(p, 'F' + s + 'g', amt); W(p, 'F' + s + 'z', -0.06 * amt); W(p, 'F' + s + 'y', 0.075 * amt); W(p, 'F' + s + 'm', 2.2 * amt); W(p, 'F' + s + 't', 1.4 * amt);
      W(p, 'H' + s + 'g', amt); W(p, 'H' + s + 'z', 0.07 * amt); W(p, 'H' + s + 'y', 0.07 * amt); W(p, 'H' + s + 'm', 1.25 * amt); W(p, 'H' + s + 't', 0.2 * amt);
    }
    W(p, 'tailP', 1.0 * amt); W(p, 'tailCurlY', 0.33 * amt); W(p, 'tailCurl', 0.03); W(p, 'tailWaveA', 0.015);
  }
  function eyes(p, u, d) { W(p, 'lidUL', u); W(p, 'lidUR', u); if (d != null) { W(p, 'lidDL', d); W(p, 'lidDR', d); } }
  function ears(p, pitch, yaw, roll) { W(p, 'earLP', pitch); W(p, 'earRP', pitch); W(p, 'earLY', yaw || 0); W(p, 'earRY', yaw || 0); W(p, 'earLR', roll || 0); W(p, 'earRR', roll || 0); }
  const CLIPS = {
    sit: { dur: 4, loop: true, fn(t, p, I) { sitBase(p, I, 1); W(p, 'headY', 0.12 * sin(t * 0.4)); } },
    loaf: { dur: 6, loop: true, fn(t, p, I) { loafBase(p, I, 1); eyes(p, 0.45 + 0.1 * sin(t * 0.3), 0.15); } },
    sleep: { dur: 6, loop: true, fn(t, p, I) {
      // curled "donut": low loaf, spine curled sideways, head tucked toward the tail, tail wrapped round the front
      loafBase(p, I, 1);
      W(p, 'hipY', -0.135); W(p, 'hipR', 0.32); W(p, 'hipYw', -0.55); W(p, 'sp1Y', 0.4); W(p, 'sp2Y', 0.42); W(p, 'chY', 0.38); W(p, 'chR', 0.1);
      W(p, 'neckY', 0.55); W(p, 'neckP', 0.55); W(p, 'headY', 0.35); W(p, 'headP', 0.55); W(p, 'headR', -0.35);
      W(p, 'tailP', 0.9); W(p, 'tailY', 1.0); W(p, 'tailCurlY', 0.42); W(p, 'tailCurl', 0.02); W(p, 'tailWaveA', 0.0);
      W(p, 'FLy', 0.06); W(p, 'FRy', 0.06); W(p, 'FLz', -0.03); W(p, 'FRz', -0.04);
      eyes(p, 1, 0.3); ears(p, 0.25, 0.3, 0.15); W(p, 'breath', 1.6); W(p, 'look', 0);
    } },
    groom: { dur: 3.2, loop: true, fn(t, p, I, k) {
      sitBase(p, I, 1);
      // lick, lick, then wipe over the ear
      const lick = k < 0.55, cyc = k / 0.55 * 2 % 1;
      W(p, 'FLg', 1); W(p, 'FLy', 0.135); W(p, 'FLz', 0.06); W(p, 'FLm', 1.9); W(p, 'FLt', 1.0); W(p, 'FLx', -0.012);
      if (lick) {
        W(p, 'neckP', 0.75 + 0.1 * sin(cyc * TAU)); W(p, 'headP', 0.55 + 0.18 * sin(cyc * TAU)); W(p, 'headY', 0.15); W(p, 'headR', -0.12);
        W(p, 'jaw', 0.25 * pulse(cyc, 0.1, 0.3, 0.6, 0.8)); W(p, 'tongue', pulse(cyc, 0.15, 0.3, 0.55, 0.75));
        eyes(p, 0.7, 0.2);
      } else {
        const w = (k - 0.55) / 0.45;
        W(p, 'neckP', 0.5); W(p, 'headP', 0.6 - 0.3 * sin(w * PI)); W(p, 'headY', 0.3); W(p, 'headR', -0.35 * sin(w * PI));
        W(p, 'FLy', 0.15 + 0.07 * sin(w * PI)); W(p, 'FLz', 0.075 - 0.02 * sin(w * PI)); W(p, 'FLx', 0.0);
        eyes(p, 0.85, 0.3); ears(p, -0.1, 0.3, 0.3);
      }
    } },
    stretch: { dur: 3, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0.0, 0.25, 0.7, 1.0);
      W(p, 'hipP', 0.32 * a); W(p, 'sp1P', 0.1 * a); W(p, 'sp2P', 0.1 * a); W(p, 'chP', 0.05 * a); W(p, 'hipY', 0.01 * a);
      W(p, 'FLz', 0.13 * a); W(p, 'FRz', 0.12 * a); W(p, 'FLm', -0.5 * a); W(p, 'FRm', -0.5 * a);
      W(p, 'neckP', -0.7 * a); W(p, 'headP', -0.35 * a); W(p, 'jaw', 0.5 * pulse(k, 0.2, 0.35, 0.55, 0.7));
      W(p, 'tailP', -0.9 * a); W(p, 'tailCurl', 0.05);
      eyes(p, 0.9 * a + I.expr.lidU * (1 - a), 0.3 * a); ears(p, 0.4 * a, 0.3 * a, 0);
    } },
    yawn: { dur: 2.6, loop: false, fn(t, p, I, k) {
      sitBase(p, I, 1);
      const a = pulse(k, 0.05, 0.35, 0.65, 0.95);
      W(p, 'neckP', 0.35); W(p, 'headP', 0.32 - 0.55 * a); W(p, 'jaw', 0.75 * a); W(p, 'tongue', 0.6 * a);
      eyes(p, 0.25 + 0.75 * a, 0.4 * a); ears(p, 0.55 * a, 0.45 * a, 0.2 * a);
    } },
    knead: { dur: 1.2, loop: true, fn(t, p, I, k) {
      loafBase(p, I, 0.55);
      for (const [s, o] of [['L', 0], ['R', 0.5]]) {
        const c = (k + o) % 1; const up = pulse(c, 0.0, 0.25, 0.35, 0.6);
        W(p, 'F' + s + 'g', 0); W(p, 'F' + s + 'y', 0.03 * up); W(p, 'F' + s + 'z', 0.02); W(p, 'F' + s + 'm', 0.8 * up - 0.2); W(p, 'F' + s + 't', -0.4 * up + 0.2);
      }
      W(p, 'chY', 0.04 * sin(k * TAU)); W(p, 'headY', -0.03 * sin(k * TAU));
      eyes(p, 0.7, 0.3); W(p, 'purr', 1); ears(p, 0.05, 0.25, 0);
    } },
    headbutt: { dur: 1.4, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0.1, 0.35, 0.55, 0.9);
      W(p, 'neckP', 0.25 * a); W(p, 'headP', 0.45 * a); W(p, 'hipZ', 0.03 * a); W(p, 'headR', -0.4 * pulse(k, 0.35, 0.55, 0.7, 0.9));
      W(p, 'chP', 0.08 * a); eyes(p, 0.95 * a + I.expr.lidU * (1 - a), 0.2 * a); ears(p, 0.35 * a, 0.35 * a, 0);
      W(p, 'tailP', -0.9 * a); W(p, 'tailCurl', 0.12 * a); W(p, 'tailTipP', -0.6 * a);
    } },
    purr: { dur: 4, loop: true, fn(t, p, I) { loafBase(p, I, 1); eyes(p, 0.92, 0.35); ears(p, 0.1, 0.2, 0); W(p, 'purr', 1); W(p, 'headP', 0.28); } },
    pounce: { dur: 2.6, loop: false, fn(t, p, I, k) {
      // crouch + butt wiggle (0..0.55) → leap (0.55..0.75) → land & recover
      const crouch = pulse(k, 0, 0.15, 0.55, 0.62), leap = pulse(k, 0.55, 0.64, 0.72, 0.85), back = smooth(0.8, 1, k);
      const wig = sin(t * 26) * smooth(0.25, 0.35, k) * (1 - smooth(0.5, 0.55, k));
      W(p, 'hipY', -0.06 * crouch + 0.06 * leap); W(p, 'hipZ', -0.02 * crouch + 0.18 * leap * (1 - back));
      W(p, 'hipYw', 0.12 * wig); W(p, 'hipR', 0.06 * wig); W(p, 'hipP', 0.08 * crouch - 0.15 * leap);
      W(p, 'chP', 0.12 * crouch); W(p, 'neckP', -0.45 * crouch + 0.3 * leap); W(p, 'headP', 0.3 * crouch - 0.2 * leap);
      for (const s of ['L', 'R']) {
        W(p, 'H' + s + 'z', -0.02 * crouch + 0.05 * wig * (s === 'L' ? 1 : -1) * 0); W(p, 'H' + s + 'm', 0.5 * crouch); W(p, 'H' + s + 'y', 0.02 * leap);
        W(p, 'F' + s + 'z', 0.03 * crouch + 0.12 * leap); W(p, 'F' + s + 'y', 0.06 * leap); W(p, 'F' + s + 'm', -0.3 * crouch + 0.6 * leap); W(p, 'F' + s + 't', -0.5 * leap);
      }
      W(p, 'pupil', 0.85 * crouch + 0.3); eyes(p, 0, 0); ears(p, -0.3 * crouch, 0, 0);
      W(p, 'tailP', -0.1 * crouch); W(p, 'tailWaveA', 0.35 * crouch); W(p, 'tailWaveF', 2.5);
    } },
    judge: { dur: 7, loop: true, fn(t, p, I, k) { // 芋圓's flat, unimpressed stare
      sitBase(p, I, 1);
      W(p, 'neckP', 0.42); W(p, 'headP', 0.22 + 0.04 * smooth(0.4, 0.6, k)); W(p, 'headR', 0.06 * smooth(0.3, 0.5, k) * (1 - smooth(0.8, 0.95, k)));
      eyes(p, 0.5, 0.18); W(p, 'pupil', 0.12); ears(p, 0.05, 0.42, 0.18);
      W(p, 'tailWaveA', 0.0); W(p, 'tailTipP', 0.1 + 0.4 * pulse((t * 0.6) % 1, 0.0, 0.1, 0.15, 0.3));
    } },
    chirp: { dur: 1.3, loop: false, fn(t, p, I, k) { // 麻糬's chirp: quick bright trill with a head bob
      const a = pulse(k, 0, 0.15, 0.75, 1), b1 = pulse(k, 0.15, 0.25, 0.3, 0.4), b2 = pulse(k, 0.42, 0.5, 0.56, 0.66);
      W(p, 'neckP', -0.15 * a); W(p, 'headP', -0.12 * a + 0.1 * (b1 + b2)); W(p, 'headR', 0.18 * a);
      W(p, 'jaw', 0.32 * (b1 + b2)); ears(p, -0.2 * a, -0.2 * a, 0); eyes(p, 0, 0); W(p, 'pupil', 0.55);
      W(p, 'tailP', -1.0 * a); W(p, 'tailCurl', 0.08 * a); W(p, 'tailTipP', -0.5 * a); W(p, 'tailWaveA', 0.05);
    } },
    sniff: { dur: 2.4, loop: true, fn(t, p, I, k) {
      W(p, 'neckP', 0.75); W(p, 'headP', 0.35 + 0.05 * sin(t * 15) * pulse(k, 0.1, 0.2, 0.6, 0.7)); W(p, 'headY', 0.25 * sin(k * TAU));
      W(p, 'chP', 0.08); W(p, 'hipZ', 0.01); ears(p, -0.15, 0, 0); W(p, 'tailP', -0.5); W(p, 'tailCurl', 0.05);
    } },
    slowblink: { dur: 2.2, loop: false, fn(t, p, I, k) { eyes(p, I.expr.lidU + (1 - I.expr.lidU) * pulse(k, 0.15, 0.4, 0.65, 0.9), 0.3 * pulse(k, 0.15, 0.4, 0.65, 0.9)); W(p, 'headP', 0.08 * pulse(k, 0.1, 0.4, 0.7, 0.95)); } },
    // ---- battle (assist) clips
    idle: { dur: 3, loop: true, battle: true, fn(t, p, I) {
      W(p, 'hipY', -0.012); W(p, 'chP', 0.06); W(p, 'neckP', -0.1); W(p, 'headP', 0.05);
      W(p, 'FLz', 0.02); W(p, 'FRz', -0.01); W(p, 'HLz', 0.01); W(p, 'HRz', -0.015);
      ears(p, -0.15, 0, 0); W(p, 'tailP', -0.35); W(p, 'tailCurl', 0.06); W(p, 'tailWaveA', 0.18); W(p, 'tailWaveF', 0.7); W(p, 'pupil', 0.5);
    } },
    ready: { dur: 2, loop: true, fn(t, p, I) {
      W(p, 'hipY', -0.03); W(p, 'hipP', 0.08); W(p, 'chP', 0.1); W(p, 'neckP', -0.3); W(p, 'headP', 0.3);
      W(p, 'FLz', 0.03); W(p, 'FRz', 0.03); W(p, 'HLm', 0.3); W(p, 'HRm', 0.3);
      ears(p, -0.35, 0.1, 0); W(p, 'tailP', 0.1); W(p, 'tailWaveA', 0.3); W(p, 'tailWaveF', 1.6); W(p, 'pupil', 0.75);
    } },
    attack: { dur: 1.1, loop: false, fn(t, p, I, k) { // anticipation → lunge-swipe → follow-through → recover
      const ant = pulse(k, 0, 0.22, 0.28, 0.36), hit = pulse(k, 0.28, 0.4, 0.5, 0.75);
      W(p, 'hipY', -0.04 * ant + 0.04 * hit); W(p, 'hipZ', -0.03 * ant + 0.14 * hit); W(p, 'hipP', 0.1 * ant - 0.25 * hit);
      W(p, 'chP', 0.12 * ant - 0.15 * hit); W(p, 'neckP', -0.4 * ant + 0.2 * hit); W(p, 'headP', 0.3 * ant);
      W(p, 'FRg', hit); W(p, 'FRy', 0.14 * hit); W(p, 'FRz', 0.12 * hit); W(p, 'FRx', 0.03 * pulse(k, 0.3, 0.42, 0.45, 0.55) - 0.04 * pulse(k, 0.45, 0.52, 0.6, 0.75)); W(p, 'FRm', -0.6 * hit); W(p, 'FRt', -0.6 * hit);
      W(p, 'FLz', 0.08 * hit); W(p, 'HLm', 0.4 * ant); W(p, 'HRm', 0.4 * ant);
      ears(p, -0.55 * (ant + hit), 0.2, 0); W(p, 'jaw', 0.35 * hit); W(p, 'pupil', 0.8);
      W(p, 'tailP', -0.4 * hit); W(p, 'tailWaveA', 0.2);
    } },
    attack2: { dur: 1.2, loop: false, fn(t, p, I, k) {
      const up = pulse(k, 0.1, 0.3, 0.7, 0.9);
      W(p, 'hipY', -0.08 * up); W(p, 'hipP', -0.5 * up); W(p, 'neckP', 0.3 * up); W(p, 'headP', 0.2 * up);
      for (const [s, o] of [['L', 0], ['R', 0.12]]) {
        const sw = pulse(k, 0.3 + o, 0.38 + o, 0.42 + o, 0.55 + o);
        W(p, 'F' + s + 'g', up); W(p, 'F' + s + 'y', 0.12 * up + 0.03 * sw); W(p, 'F' + s + 'z', 0.05 * up + 0.08 * sw); W(p, 'F' + s + 'm', -0.4 * up); W(p, 'F' + s + 't', -0.5 * up);
      }
      for (const s of ['L', 'R']) { W(p, 'H' + s + 'm', 0.9 * up); W(p, 'H' + s + 'z', 0.04 * up); }
      ears(p, -0.5 * up, 0.2, 0); W(p, 'jaw', 0.3 * up); W(p, 'tailP', 0.5 * up); W(p, 'tailWaveA', 0.2);
    } },
    cast: { dur: 1.4, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0.05, 0.3, 0.75, 1);
      sitBase(p, I, a); W(p, 'neckP', 0.55 * a - 0.35 * pulse(k, 0.35, 0.5, 0.6, 0.8)); W(p, 'headP', 0.32 * a - 0.2 * pulse(k, 0.35, 0.5, 0.6, 0.8));
      eyes(p, 0.95 * pulse(k, 0.1, 0.25, 0.4, 0.5), 0.3 * pulse(k, 0.1, 0.25, 0.4, 0.5)); W(p, 'pupil', 0.9);
      W(p, 'tailP', -0.8 * a); W(p, 'tailCurl', 0.1 * a); W(p, 'tailTipP', -0.6 * a); ears(p, -0.2 * a, 0, 0);
    } },
    skill: { dur: 1.8, loop: false, fn(t, p, I, k) { CLIPS.cast.fn(t, p, I, k); W(p, 'jaw', 0.4 * pulse(k, 0.4, 0.5, 0.6, 0.75)); W(p, 'hipY', Rd(p, 'hipY') + 0.03 * pulse(k, 0.4, 0.5, 0.55, 0.7)); } },
    hurt: { dur: 0.7, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0, 0.08, 0.3, 1);
      W(p, 'hipZ', -0.06 * a); W(p, 'hipY', -0.02 * a); W(p, 'hipP', -0.15 * a); W(p, 'neckP', -0.2 * a); W(p, 'headP', -0.3 * a); W(p, 'headR', 0.2 * a);
      eyes(p, 0.9 * a, 0.5 * a); ears(p, 0.9 * a, 0.5 * a, 0.4 * a); W(p, 'jaw', 0.3 * a); W(p, 'tailP', 0.6 * a);
      W(p, 'FLz', -0.03 * a); W(p, 'FRz', -0.03 * a);
    } },
    guard: { dur: 2, loop: true, fn(t, p, I) { // 芋圓 plants himself: wide, low, unmovable
      W(p, 'hipY', -0.05); W(p, 'chP', 0.05); W(p, 'neckP', -0.35); W(p, 'headP', 0.4);
      W(p, 'FLx', 0.02); W(p, 'FRx', -0.02); W(p, 'HLx', 0.02); W(p, 'HRx', -0.02); W(p, 'FLz', 0.02); W(p, 'FRz', 0.02);
      ears(p, 0.6, 0.45, 0.35); eyes(p, 0.45, 0.2); W(p, 'pupil', 0.15); W(p, 'tailP', 0.7); W(p, 'tailWaveA', 0.12); W(p, 'tailWaveF', 1.2);
    } },
    ko: { dur: 1.2, loop: false, hold: true, fn(t, p, I, k) {
      const a = easeO(min(1, k * 1.4));
      CLIPS.sleep.fn(t, p, I, k); blendInto(p, neutral(newPose(), I), 1 - a);
      W(p, 'breath', 0.4); eyes(p, a, 0.4 * a); W(p, 'tailWaveA', 0);
    } },
    revive: { dur: 1.2, loop: false, fn(t, p, I, k) {
      const a = 1 - ease(min(1, k * 1.2)); const q = newPose(); CLIPS.sleep.fn(t, q, I, 0); neutral(p, I); blendInto(p, q, a);
      W(p, 'hipY', Rd(p, 'hipY') + 0.03 * pulse(k, 0.5, 0.65, 0.7, 0.9)); ears(p, -0.2 * pulse(k, 0.5, 0.7, 0.8, 1), 0, 0);
    } },
    victory: { dur: 3, loop: true, fn(t, p, I, k) {
      sitBase(p, I, 1); W(p, 'neckP', 0.35); W(p, 'headP', 0.15); W(p, 'headR', 0.12 * sin(t * 1.2));
      W(p, 'tailP', -0.9); W(p, 'tailCurlY', 0); W(p, 'tailCurl', 0.12); W(p, 'tailTipP', -0.7); W(p, 'tailWaveA', 0.05);
      eyes(p, I.expr.lidU * 0.5 + 0.6 * pulse((t * 0.35) % 1, 0.1, 0.25, 0.4, 0.55), 0.1); ears(p, -0.15, 0, 0);
    } },
    item: { dur: 1.4, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0.05, 0.25, 0.7, 1); const tap = pulse(k, 0.35, 0.45, 0.5, 0.6);
      W(p, 'neckP', 0.6 * a); W(p, 'headP', 0.3 * a); W(p, 'FRy', 0.05 * tap); W(p, 'FRz', 0.04 * a); W(p, 'FRm', 0.6 * tap);
      ears(p, -0.25 * a, 0, 0); W(p, 'tailP', -0.6 * a); W(p, 'tailCurl', 0.08);
    } },
    dodge: { dur: 0.6, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0, 0.15, 0.35, 0.9), air = pulse(k, 0.08, 0.2, 0.3, 0.45);
      W(p, 'hipX', 0.1 * a); W(p, 'hipY', 0.06 * air - 0.02 * a); W(p, 'hipR', -0.25 * air);
      for (const L of LEGK) W(p, L + 'y', 0.04 * air); ears(p, 0.5 * a, 0.3, 0); W(p, 'tailP', -0.3 * a);
    } },
    // ---- field / cutscene clips shared with the humans' vocabulary
    talk: { dur: 1.2, loop: true, fn(t, p, I, k) { W(p, 'jaw', 0.28 * max(0, sin(k * TAU * 2))); W(p, 'headP', -0.08 * max(0, sin(k * TAU * 2))); ears(p, -0.1, 0, 0); } },
    nod: { dur: 0.9, loop: false, fn(t, p, I, k) { W(p, 'headP', 0.3 * sin(PI * k) * (k < 1 ? 1 : 0)); W(p, 'neckP', 0.1 * sin(PI * k)); } },
    shake: { dur: 0.8, loop: false, fn(t, p, I, k) { W(p, 'headY', 0.35 * sin(k * TAU * 2.5) * sin(PI * k)); W(p, 'headR', 0.12 * sin(k * TAU * 2.5)); ears(p, 0.3 * sin(PI * k), 0.2, 0); } },
    bow: { dur: 3, loop: false, fn(t, p, I, k) { CLIPS.stretch.fn(t, p, I, k); } },
    kneel: { dur: 6, loop: true, fn(t, p, I) { loafBase(p, I, 1); } },
    point: { dur: 1.5, loop: true, fn(t, p, I) { sitBase(p, I, 1); W(p, 'FRg', 1); W(p, 'FRy', 0.1); W(p, 'FRz', 0.09); W(p, 'FRm', -0.2); } },
    wave: { dur: 1.2, loop: true, fn(t, p, I, k) { sitBase(p, I, 1); W(p, 'FRg', 1); W(p, 'FRy', 0.12 + 0.02 * sin(k * TAU * 2)); W(p, 'FRz', 0.06); W(p, 'FRx', 0.02 * sin(k * TAU * 2)); W(p, 'FRm', 1.2); W(p, 'FRt', 0.8); } },
    cry: { dur: 3, loop: true, fn(t, p, I) { sitBase(p, I, 1); W(p, 'neckP', 0.75); W(p, 'headP', 0.4); ears(p, 0.4, 0.7, 0.5); eyes(p, 0.6, 0.3); W(p, 'tailWaveA', 0); } },
    laugh: { dur: 1.3, loop: false, fn(t, p, I, k) { CLIPS.chirp.fn(t, p, I, k); } },
    think: { dur: 3, loop: true, fn(t, p, I) { sitBase(p, I, 1); W(p, 'headR', 0.35); W(p, 'headY', 0.1); ears(p, -0.1, 0.1, 0); W(p, 'tailTipP', 0.3 * sin(t * 2)); } },
    surprise: { dur: 0.9, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0, 0.08, 0.45, 0.9), air = pulse(k, 0.02, 0.1, 0.18, 0.3);
      W(p, 'hipY', 0.07 * air); W(p, 'hipZ', -0.05 * a); W(p, 'sp1P', -0.15 * a); W(p, 'sp2P', -0.15 * a); for (const L of LEGK) W(p, L + 'y', 0.05 * air);
      eyes(p, 0, 0); W(p, 'pupil', 0.95); ears(p, -0.35 * a, -0.15, 0); W(p, 'tailP', -0.9 * a); W(p, 'tailCurl', 0.1 * a);
    } },
    pray: { dur: 4, loop: true, fn(t, p, I) { sitBase(p, I, 1); eyes(p, 1, 0.35); W(p, 'headP', 0.45); } },
    fall: { dur: 1, loop: false, hold: true, fn(t, p, I, k) { CLIPS.ko.fn(t, p, I, k); } },
    run: { dur: 1, loop: true, fn() {} }, // locomotion handles run; kept for the battle vocabulary
  };
  // emotes → short additive reactions (deltas on top of whatever is playing)
  const EMOTES = {
    '!': { dur: 0.8, fn(p, k) { const a = pulse(k, 0, 0.08, 0.5, 1); Ad(p, 'hipY', 0.025 * pulse(k, 0, 0.06, 0.12, 0.25)); Ad(p, 'headP', -0.15 * a); Ad(p, 'earLP', -0.4 * a); Ad(p, 'earRP', -0.4 * a); Ad(p, 'pupil', 0.6 * a); Ad(p, 'lidUL', -0.5 * a); Ad(p, 'lidUR', -0.5 * a); Ad(p, 'tailP', -0.5 * a); } },
    '?': { dur: 1.4, fn(p, k) { const a = pulse(k, 0, 0.2, 0.7, 1); Ad(p, 'headR', 0.4 * a); Ad(p, 'earLY', 0.3 * a); Ad(p, 'earRY', -0.2 * a); } },
    '…': { dur: 1.6, fn(p, k) { const a = pulse(k, 0, 0.2, 0.75, 1); Ad(p, 'lidUL', 0.35 * a); Ad(p, 'lidUR', 0.35 * a); Ad(p, 'earLY', 0.4 * a); Ad(p, 'earRY', 0.4 * a); Ad(p, 'tailTipP', 0.5 * pulse(k, 0.3, 0.4, 0.45, 0.6)); } },
    '♪': { dur: 1.6, fn(p, k) { const a = pulse(k, 0, 0.15, 0.8, 1); Ad(p, 'headR', 0.15 * sin(k * TAU * 2) * a); Ad(p, 'tailP', -0.6 * a); Ad(p, 'tailTipP', -0.4 * a); Ad(p, 'lidUL', 0.4 * a); Ad(p, 'lidUR', 0.4 * a); } },
    '💢': { dur: 1.2, fn(p, k) { const a = pulse(k, 0, 0.1, 0.7, 1); Ad(p, 'earLP', 0.9 * a); Ad(p, 'earRP', 0.9 * a); Ad(p, 'earLY', 0.6 * a); Ad(p, 'earRY', 0.6 * a); Ad(p, 'jaw', 0.4 * a); Ad(p, 'pupil', -0.2 * a); Ad(p, 'tailWaveA', 0.4 * a); Ad(p, 'tailWaveF', 2 * a); Ad(p, 'hipY', -0.02 * a); } },
    '♥': { dur: 2.2, fn(p, k) { const a = pulse(k, 0.1, 0.35, 0.6, 0.9); Ad(p, 'lidUL', 0.9 * a); Ad(p, 'lidUR', 0.9 * a); Ad(p, 'lidDL', 0.3 * a); Ad(p, 'lidDR', 0.3 * a); Ad(p, 'headR', -0.15 * a); Ad(p, 'headP', 0.08 * a); Ad(p, 'tailP', -0.4 * a); Ad(p, 'purr', a); } },
    '💧': { dur: 1.8, fn(p, k) { const a = pulse(k, 0, 0.2, 0.7, 1); Ad(p, 'earLP', 0.5 * a); Ad(p, 'earRP', 0.5 * a); Ad(p, 'earLR', 0.5 * a); Ad(p, 'earRR', 0.5 * a); Ad(p, 'headP', 0.2 * a); Ad(p, 'tailP', 0.6 * a); } },
    '✦': { dur: 1.4, fn(p, k) { const a = pulse(k, 0, 0.1, 0.7, 1); Ad(p, 'pupil', 0.7 * a); Ad(p, 'lidUL', -0.4 * a); Ad(p, 'lidUR', -0.4 * a); Ad(p, 'earLP', -0.3 * a); Ad(p, 'earRP', -0.3 * a); Ad(p, 'headP', -0.1 * a); } },
  };
  // expressions → targets for lids / pupils / ears / mouth (smoothed)
  const EXPR = {
    neutral: { lidU: 0.1, lidD: 0.05, pupil: 0.3, ear: 0, earY: 0, jaw: 0 },
    smile: { lidU: 0.45, lidD: 0.2, pupil: 0.35, ear: -0.05, earY: 0.1, jaw: 0 },
    sad: { lidU: 0.4, lidD: 0.05, pupil: 0.45, ear: 0.5, earY: 0.6, jaw: 0 },
    angry: { lidU: 0.3, lidD: 0.25, pupil: 0.08, ear: 0.9, earY: 0.65, jaw: 0.25 },
    surprised: { lidU: -0.25, lidD: -0.1, pupil: 0.9, ear: -0.35, earY: -0.1, jaw: 0.1 },
    shy: { lidU: 0.35, lidD: 0.15, pupil: 0.5, ear: 0.2, earY: 0.5, jaw: 0 },
    pain: { lidU: 0.75, lidD: 0.45, pupil: 0.2, ear: 0.7, earY: 0.5, jaw: 0.15 },
    closed: { lidU: 1, lidD: 0.35, pupil: 0.3, ear: 0, earY: 0.1, jaw: 0 },
    determined: { lidU: 0.3, lidD: 0.2, pupil: 0.2, ear: -0.3, earY: 0, jaw: 0 },
    judging: { lidU: 0.5, lidD: 0.18, pupil: 0.12, ear: 0.05, earY: 0.35, jaw: 0 },
  };

  // extra clips for dogs / grazers (shared CLIPS table; positions scale with the plan's gait scale)
  Object.assign(CLIPS, {
    graze: { dur: 4, loop: true, fn(t, p, I, k) {
      W(p, 'neckP', 1.05); W(p, 'headP', 0.55); W(p, 'chP', 0.05); W(p, 'jaw', 0.18 * max(0, sin(t * 7)));
      W(p, 'headY', 0.15 * sin(t * 0.7)); W(p, 'FLz', 0.03); W(p, 'tailWaveA', 0.12); W(p, 'tailWaveF', 0.6); ears(p, 0.15, 0.2, 0.1);
    } },
    chew: { dur: 4, loop: true, fn(t, p, I) { W(p, 'jaw', 0.12 * (0.5 + 0.5 * sin(t * 5.5))); W(p, 'headY', 0.03 * sin(t * 5.5)); eyes(p, 0.45, 0.1); W(p, 'tailWaveA', 0.18); W(p, 'tailWaveF', 0.5); ears(p, 0.1, 0.35, 0.1); } },
    alert: { dur: 3, loop: true, fn(t, p, I) { W(p, 'neckP', -0.35); W(p, 'headP', 0.15); ears(p, -0.35, -0.2, 0); eyes(p, -0.1, 0); W(p, 'tailP', -0.7); W(p, 'tailWaveA', 0); W(p, 'breath', 0.3); } },
    pant: { dur: 1, loop: true, fn(t, p, I, k) { sitBase(p, I, 1); W(p, 'jaw', 0.35 + 0.08 * sin(k * TAU * 2)); W(p, 'breath', 2.5); ears(p, 0.1, 0.25, 0); W(p, 'tailWaveA', 0.25); W(p, 'tailWaveF', 1.6); } },
    wag: { dur: 2, loop: true, fn(t, p, I) { W(p, 'tailWaveA', 0.45); W(p, 'tailWaveF', 2.6); W(p, 'tailP', -0.4); W(p, 'hipYw', 0.04 * sin(t * 2.6 * TAU)); ears(p, 0.25, 0.3, 0); W(p, 'jaw', 0.2); } },
    bark: { dur: 0.9, loop: false, fn(t, p, I, k) { const a = pulse(k, 0, 0.12, 0.3, 0.55); W(p, 'jaw', 0.5 * a); W(p, 'neckP', -0.2 * a); W(p, 'headP', -0.15 * a); W(p, 'hipZ', -0.01 * a); ears(p, -0.3 * a, 0, 0); } },
    scratch: { dur: 1.8, loop: false, fn(t, p, I, k) { sitBase(p, I, 1); const a = pulse(k, 0.05, 0.2, 0.8, 0.95); W(p, 'HLg', a); W(p, 'HLy', 0.12 * a + 0.015 * sin(t * 40) * a); W(p, 'HLz', 0.12 * a); W(p, 'headR', -0.4 * a); W(p, 'headY', 0.3 * a); eyes(p, 0.6 * a, 0.2 * a); } },
  });
  // ---- bird clips (same pose vocabulary; wings via 'wing' spread and 'flap' oscillator)
  const BIRD_CLIPS = {
    alias: { sit: 'roost', loaf: 'roost', sleep: 'roost', groom: 'preen', attack2: 'attack', skill: 'cast', run: 'idle', ready: 'idle', guard: 'idle', kneel: 'roost', pray: 'roost', talk: 'call', laugh: 'call', chirp: 'call', yawn: 'call', bow: 'peck', nod: 'peck', point: 'look', wave: 'flap', think: 'look', cry: 'roost', fall: 'ko', judge: 'look', purr: 'roost', knead: 'scratch', headbutt: 'peck', pounce: 'attack', stretch: 'flap', slowblink: 'look', sniff: 'peck' },
    idle: { dur: 3, loop: true, fn(t, p) { W(p, 'headY', 0.3 * Math.sign(sin(t * 1.7)) * (abs(sin(t * 1.7)) > 0.3 ? 1 : 0)); W(p, 'neckP', -0.05); } },
    look: { dur: 2.4, loop: false, fn(t, p, I, k) { const st = Math.floor(k * 4); W(p, 'headY', [0.6, -0.5, 0.3, 0][st]); W(p, 'headR', [0.3, -0.2, 0.4, 0][st]); W(p, 'neckP', -0.1); } },
    peck: { dur: 1.6, loop: false, fn(t, p, I, k) {
      const a = pulse(k, 0.05, 0.2, 0.8, 0.95), pk = max(0, sin(k * TAU * 3)) * a;
      W(p, 'neckP', 0.9 * a + 0.35 * pk); W(p, 'headP', 0.6 * a + 0.2 * pk); W(p, 'neckZ', 0.03 * a); W(p, 'hipP', 0.25 * a); W(p, 'tailP', -0.4 * a);
    } },
    preen: { dur: 2.6, loop: false, fn(t, p, I, k) { const a = pulse(k, 0.05, 0.2, 0.8, 0.95); W(p, 'neckY', 1.4 * a); W(p, 'headY', 0.9 * a); W(p, 'neckP', 0.5 * a); W(p, 'headR', 0.4 * sin(t * 8) * a); W(p, 'wing', 0.15 * a); W(p, 'jaw', 0.2 * max(0, sin(t * 10)) * a); } },
    flap: { dur: 1.6, loop: false, fn(t, p, I, k) { const a = pulse(k, 0.05, 0.15, 0.75, 0.95); W(p, 'wing', a); W(p, 'flap', 0.6 * a); W(p, 'flapF', 4.5); W(p, 'hipP', -0.35 * a); W(p, 'neckP', -0.3 * a); W(p, 'tailP', -0.3 * a); } },
    call: { dur: 1.5, loop: false, fn(t, p, I, k) { const a = pulse(k, 0.05, 0.25, 0.7, 0.95); W(p, 'neckP', -0.6 * a); W(p, 'headP', -0.5 * a); W(p, 'jaw', 0.6 * pulse(k, 0.25, 0.32, 0.6, 0.7)); W(p, 'wing', 0.25 * a); W(p, 'flap', 0.15 * a); W(p, 'flapF', 6); W(p, 'hipP', -0.2 * a); } },
    scratch: { dur: 1.4, loop: false, fn(t, p, I, k) { const c = (k * 3) % 1, kick = pulse(c, 0.1, 0.3, 0.4, 0.7); const s = Math.floor(k * 3) % 2 ? 'L' : 'R'; W(p, 'H' + s + 'z', -0.06 * kick); W(p, 'H' + s + 'y', 0.02 * pulse(c, 0, 0.15, 0.3, 0.45)); W(p, 'hipP', 0.2); W(p, 'neckP', 0.4); W(p, 'headP', 0.3); } },
    roost: { dur: 5, loop: true, fn(t, p) { W(p, 'hipY', -0.05); W(p, 'HLm', 0.9); W(p, 'HRm', 0.9); W(p, 'HLz', 0.02); W(p, 'HRz', 0.02); W(p, 'neckP', 0.35); W(p, 'neckZ', -0.02); eyes(p, 0.55, 0.3); } },
    attack: { dur: 0.9, loop: false, fn(t, p, I, k) { const ant = pulse(k, 0, 0.2, 0.25, 0.35), hit = pulse(k, 0.25, 0.35, 0.45, 0.7); W(p, 'neckP', -0.4 * ant + 1.0 * hit); W(p, 'neckZ', -0.02 * ant + 0.05 * hit); W(p, 'headP', 0.5 * hit); W(p, 'wing', 0.6 * (ant + hit)); W(p, 'flap', 0.4 * hit); W(p, 'flapF', 6); W(p, 'hipZ', 0.06 * hit); } },
    cast: { dur: 1.4, loop: false, fn(t, p, I, k) { CLIPS_FN_FLAP(p, k); } },
    hurt: { dur: 0.6, loop: false, fn(t, p, I, k) { const a = pulse(k, 0, 0.08, 0.3, 1); W(p, 'hipZ', -0.05 * a); W(p, 'neckP', -0.4 * a); W(p, 'wing', 0.5 * a); W(p, 'flap', 0.5 * a); W(p, 'flapF', 7); eyes(p, 0.8 * a, 0.5 * a); } },
    ko: { dur: 1, loop: false, hold: true, fn(t, p, I, k) { const a = easeO(min(1, k * 1.5)); W(p, 'hipY', -0.08 * a); W(p, 'hipR', 1.2 * a); W(p, 'neckP', 0.6 * a); W(p, 'wing', 0.4 * a); eyes(p, a, 0.5 * a); } },
    revive: { dur: 1, loop: false, fn(t, p, I, k) { CLIPS_FN_FLAP(p, k); } },
    victory: { dur: 2, loop: true, fn(t, p, I, k) { CLIPS_FN_FLAP(p, k); W(p, 'jaw', 0.5 * pulse(k, 0.3, 0.4, 0.6, 0.7)); } },
    item: { dur: 1.2, loop: false, fn(t, p, I, k) { BIRD_CLIPS.peck.fn(t, p, I, k); } },
    dodge: { dur: 0.6, loop: false, fn(t, p, I, k) { const a = pulse(k, 0, 0.15, 0.35, 0.9); W(p, 'hipX', 0.08 * a); W(p, 'hipY', 0.05 * pulse(k, 0.05, 0.2, 0.3, 0.45)); W(p, 'wing', a); W(p, 'flap', 0.5 * a); W(p, 'flapF', 7); } },
    surprise: { dur: 0.9, loop: false, fn(t, p, I, k) { const a = pulse(k, 0, 0.08, 0.45, 0.9); W(p, 'hipY', 0.06 * pulse(k, 0.02, 0.1, 0.2, 0.35)); W(p, 'wing', a); W(p, 'flap', 0.6 * a); W(p, 'flapF', 7); W(p, 'neckP', -0.4 * a); } },
    fly: { dur: 1, loop: true, fn(t, p) { W(p, 'hipY', 0.25); W(p, 'wing', 1); W(p, 'flap', 0.75); W(p, 'flapF', 5); W(p, 'hipP', -0.2); for (const L of ['HL', 'HR']) { W(p, L + 'g', 1); W(p, L + 'y', 0.06); W(p, L + 'z', -0.03); W(p, L + 'm', 0.6); } } },
  };
  function CLIPS_FN_FLAP(p, k) { const a = pulse(k, 0.05, 0.2, 0.75, 0.95); W(p, 'wing', a); W(p, 'flap', 0.55 * a); W(p, 'flapF', 5); W(p, 'hipY', 0.04 * a); W(p, 'neckP', -0.4 * a); W(p, 'headP', -0.3 * a); }
  // idle behaviour tables (non-cat species): weighted next-clip choices from the current one
  const IDLE = {
    dog: { gap: [4, 6], back: null, none: [['sit', 4], ['loaf', 2], ['sniff', 2], ['wag', 1]], sit: [['pant', 2], ['scratch', 1], ['loaf', 2], ['stand', 1]], pant: [['sit', 2], ['loaf', 1]], loaf: [['sleep', 1], ['sit', 1], ['stand', 1]], sleep: [['loaf', 1]], sniff: [['stand', 1], ['sit', 1]], wag: [['stand', 1], ['sit', 1]], scratch: [['sit', 1]] },
    buffalo: { gap: [5, 8], none: [['graze', 3], ['chew', 2]], graze: [['chew', 1], ['stand', 1]], chew: [['graze', 2], ['stand', 1]] },
    muntjac: { gap: [3, 5], none: [['graze', 3], ['alert', 1]], graze: [['alert', 1], ['stand', 2]], alert: [['graze', 2], ['stand', 1]] },
    chicken: { gap: [1.2, 2.5], back: null, none: [['peck', 4], ['look', 3], ['scratch', 2], ['preen', 1], ['flap', 0.5], ['call', 0.3]] },
    crow: { gap: [1.5, 3], none: [['peck', 3], ['look', 3], ['preen', 1], ['flap', 0.6], ['call', 0.8]] },
    magpie: { gap: [1.5, 3], none: [['look', 3], ['peck', 2], ['preen', 1], ['flap', 0.8], ['call', 0.6]] },
  };

  // ================================================================================== spring bones
  // Verlet "jiggle" chains (VRM-style): each bone's tail is a particle pulled toward its animated position, with drag
  // and gravity, length-constrained to the bone; the bone is then rotated to point at it. Fixed 60 Hz substeps.
  class Springs {
    constructor(inst, defs) {
      const THREE = T3();
      this.I = inst; this.list = [];
      for (const d of defs) {
        const b = inst.B[d.bone]; if (!b) continue;
        this.list.push({ b, tailL: new THREE.Vector3(...d.tail), stiff: d.stiff, drag: d.drag, grav: d.grav || 0, cur: new THREE.Vector3(), prev: new THREE.Vector3(), len: Math.hypot(...d.tail), init: false, w: d.w != null ? d.w : 1 });
      }
      this.acc = 0;
      this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); this._h = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._pq = new THREE.Quaternion(); this._wq = new THREE.Quaternion();
      this._d0 = new THREE.Vector3(); this._d1 = new THREE.Vector3();
    }
    reset() { for (const s of this.list) s.init = false; }
    step(dt) {
      this.acc = min(this.acc + dt, 4 / 60);
      const n = Math.floor(this.acc * 60 + 1e-6);
      this.acc -= n / 60;
      const sub = max(1, n);
      for (const s of this.list) {
        const b = s.b;
        b.updateMatrixWorld(true);
        const h = this._h.setFromMatrixPosition(b.matrixWorld);
        const ta = this._a.copy(s.tailL).applyMatrix4(b.matrixWorld);
        if (!s.init) { s.cur.copy(ta); s.prev.copy(ta); s.init = true; }
        const worldLen = ta.distanceTo(h);
        if (n > 0) for (let i = 0; i < sub; i++) {
          const v = this._v.copy(s.cur).sub(s.prev).multiplyScalar(1 - s.drag);
          s.prev.copy(s.cur);
          s.cur.add(v).add(this._d0.copy(ta).sub(s.cur).multiplyScalar(s.stiff));
          s.cur.y -= s.grav * worldLen;
          const d = this._d1.copy(s.cur).sub(h); const l = d.length() || 1;
          s.cur.copy(h).addScaledVector(d, worldLen / l);
        }
        // rotate the bone so its tail points at the particle
        const d0 = this._d0.copy(ta).sub(h).normalize(), d1 = this._d1.copy(s.cur).sub(h).normalize();
        if (d0.dot(d1) > 0.99999 || s.w <= 0) continue;
        const q = this._q.setFromUnitVectors(d0, d1);
        if (s.w < 1) q.slerp(this._wq.identity(), 1 - s.w);
        b.getWorldQuaternion(this._wq);
        const nw = q.multiply(this._wq);
        b.parent.getWorldQuaternion(this._pq);
        b.quaternion.copy(this._pq.invert().multiply(nw));
        b.updateMatrixWorld(true);
      }
    }
  }

  // ================================================================================== instance
  const BONE_ALIAS = { spine: 'spine1', hips: 'hips', chest: 'chest', neck: 'neck', head: 'head', handL: 'handL', handR: 'handR', footL: 'footL', footR: 'footR' };
  const _v1 = () => new (T3().Vector3)();
  function frameQuat(d0, s0, d1, s1, out) { // rotation taking basis (s0, d0) → (s1, d1)
    const THREE = T3();
    const a = s0.clone().addScaledVector(d0, -s0.dot(d0)).normalize(), b = s1.clone().addScaledVector(d1, -s1.dot(d1)).normalize();
    const c0 = new THREE.Vector3().crossVectors(a, d0), c1 = new THREE.Vector3().crossVectors(b, d1);
    const m0 = new THREE.Matrix4().makeBasis(a, d0, c0), m1 = new THREE.Matrix4().makeBasis(b, d1, c1);
    return out.setFromRotationMatrix(m1.multiply(m0.transpose()));
  }
  class AnimalInst {
    constructor(asset, opts = {}) {
      const THREE = T3();
      this.asset = asset; this.id = asset.id; this.opts = opts; this.context = opts.context || 'map';
      const plan = asset.plan, S = asset.S;
      this.plan = plan; this.S = S; this.ps = S * (plan.gs || 1);
      this.gaits = {}; for (const g in GAITS) this.gaits[g] = Object.assign({}, GAITS[g], plan.gaits && plan.gaits[g]);
      this.root = new THREE.Group(); this.root.name = 'animal:' + asset.id;
      this.bones = []; this.B = {};
      for (const [name, parent, p] of plan.joints) {
        const b = new THREE.Bone(); b.name = name;
        const pp = parent ? plan.JP[parent] : [0, 0, 0];
        b.position.set((p[0] - pp[0]) * S, (p[1] - pp[1]) * S, (p[2] - pp[2]) * S);
        if (parent) this.B[parent].add(b);
        this.bones.push(b); this.B[name] = b;
      }
      this.restPos = {}; for (const b of this.bones) this.restPos[b.name] = b.position.clone();
      const rootBone = this.B.root;
      rootBone.updateMatrixWorld(true);
      this.skeleton = new THREE.Skeleton(this.bones);
      const pal = asset.pal, cfg = plan.cfg;
      this.mat = coatMaterial(pal, { mouth: asset.mouth, faceTex: asset.faceTex, spots: cfg.coat === 'leopard', tick: cfg.coat === 'tabby' ? 0.55 : 0.25, stripeW: 0.3, ghostTint: (G.Sprites.spec(asset.id) || {}).ghostTint });
      this.body = new THREE.SkinnedMesh(asset.geo, this.mat);
      this.body.add(rootBone);
      this.body.bind(this.skeleton);
      this.body.castShadow = true; this.body.receiveShadow = true;
      this.eyeMat = eyeMaterial({ iris: pal.iris, iris2: pal.iris2, round: !!(cfg.eye && cfg.eye.round), irisR: cfg.eye && cfg.eye.irisR, pupilH: cfg.eye && cfg.eye.round ? 0.62 : 0.82, hl: cfg.eye && cfg.eye.hl, hl2: cfg.eye && cfg.eye.hl2 });
      this.eyes = new THREE.SkinnedMesh(asset.eyeGeo, this.eyeMat);
      this.eyes.bind(this.skeleton, this.body.bindMatrix);
      const fake = { isSkinnedMesh: true, geometry: asset.hull, skeleton: this.skeleton, bindMatrix: this.body.bindMatrix };
      this.outline = G.R3M.outline(fake, { width: 0.0012, color: 0x2a2430 });
      for (const m of [this.body, this.eyes, this.outline]) { m.boundingSphere = asset.sphere.clone(); m.frustumCulled = true; }
      this.eyes.castShadow = false;
      this.root.add(this.body, this.eyes, this.outline);
      if (asset.cardGeo) {
        this.cardMat = coatMaterial(pal, { faceTex: asset.faceTex, cards: true, cardTex: asset.cardTex, spots: cfg.coat === 'leopard', tick: cfg.coat === 'tabby' ? 0.55 : 0.25, stripeW: 0.3, ghostTint: (G.Sprites.spec(asset.id) || {}).ghostTint, rim: 0.2 });
        this.cards = new THREE.SkinnedMesh(asset.cardGeo, this.cardMat);
        this.cards.bind(this.skeleton, this.body.bindMatrix);
        this.cards.boundingSphere = asset.sphere.clone(); this.cards.castShadow = false;
        this.root.add(this.cards);
      }
      this.height = asset.height;
      // rig data (model space, scaled)
      this.legs = {};
      this.legKeys = LEGK.filter((L) => plan.legs[L]);
      this.clipSet = plan.clips === 'bird' ? BIRD_CLIPS : CLIPS;
      for (const L of this.legKeys) {
        const lg = plan.legs[L];
        const ch = lg.chain.map((n) => new THREE.Vector3(...plan.JP[n]).multiplyScalar(S));
        const toe = new THREE.Vector3(...lg.toe).multiplyScalar(S);
        const gird = new THREE.Vector3(...plan.JP[lg.girdle]).multiplyScalar(S);
        const down = new THREE.Vector3(0, -1, 0), fwd = new THREE.Vector3(0, 0, 1);
        const metaDir = ch[3].clone().sub(ch[2]).normalize();
        this.legs[L] = {
          def: lg, bones: lg.chain.map((n) => this.B[n]), girdle: this.B[lg.girdle], front: lg.front,
          la: ch[1].distanceTo(ch[0]), lb: ch[2].distanceTo(ch[1]), lc: ch[3].distanceTo(ch[2]),
          restDirs: [ch[1].clone().sub(ch[0]).normalize(), ch[2].clone().sub(ch[1]).normalize(), metaDir, toe.clone().sub(ch[3]).normalize()],
          restPaw: ch[3].clone(), pawInGirdle: ch[3].clone().sub(gird), minY: ch[3].y,
          meta0: Math.atan2(metaDir.dot(fwd), metaDir.dot(down)),
          femur0: (() => { const d = ch[1].clone().sub(ch[0]).normalize(); return Math.atan2(d.dot(fwd), d.dot(down)); })(),
        };
      }
      this.legLenN = min(...this.legKeys.map((L) => this.legs[L].la + this.legs[L].lb + this.legs[L].lc * 0.8)) / this.ps;
      // eye/lid axes (head-local = model at rest)
      this.eyeInfo = plan.eyes.map((e) => ({ sx: e.sx, x: new THREE.Vector3(...e.F.x), y: new THREE.Vector3(...e.F.y), z: new THREE.Vector3(...e.F.z) }));
      // state
      this.t = 0; this.yaw = 0; this.yawPrev = null; this.yawRate = 0; this._speed = 0; this.speed = 0; this.accel = 0;
      this.phase = 0; this.gait = 'walk'; this.gaitPrev = null; this.gaitFade = 1; this.moveW = 0;
      this.cadence = { walk: 1, trot: 2, gallop: 3 };
      this.clip = null; this.clipPrev = null; this.emotes = [];
      this.expr = Object.assign({}, EXPR.neutral, cfg.exprBase ? EXPR[cfg.exprBase] : null); this.exprName = 'neutral';
      this.exprT = Object.assign({}, this.expr);
      this.blink = { next: 1.5 + Math.random() * 3, t: -1, dbl: false };
      this.earFlick = { next: 2 + Math.random() * 4, t: -1, side: 1 };
      this.idleBrain = { t: 0, next: 3 + Math.random() * 3, cur: null };
      this.lookTarget = null; this.lookW = 0; this.lookYaw = 0; this.lookPitch = 0; this.saccade = { t: 0, x: 0, y: 0 };
      this.tailOsc = 0; this.purrT = 0;
      this.P = newPose(); this.Q = newPose(); this.R = newPose(); this.E = newPose();
      this.springs = new Springs(this, plan.springs ? plan.springs(S) : []);
      this.opacity = 1; this.ghost = false;
      const sp = G.Sprites.spec(asset.id) || {};
      if (sp.ghost) this.setOpacity(1, true);
      this._tmp = { a: _v1(), b: _v1(), c: _v1(), d: _v1(), e: _v1(), f: _v1(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4(), m2: new THREE.Matrix4(), eu: new THREE.Euler(0, 0, 0, 'YXZ') };
      this.update(0);
    }
    // ---------------------------------------------------------------- public interface
    setFacing(yaw) { this.yaw = yaw; }
    setMove(speed) { this._speed = max(0, speed || 0); }
    play(name, o = {}) {
      if (!name) { if (this.clip) { this.clipPrev = this.clip; this.clipPrev.fadeOut = o.fade || 0.3; this.clipPrev.fo = 0; } this.clip = null; return; }
      const set = this.clipSet;
      let key = name;
      if (!set[key]) key = (set.alias && set.alias[name]) || (set.sit ? 'sit' : 'idle');
      if (!key || !set[key]) return;
      const def = set[key];
      if (this.clip && this.clip.name === key && (o.loop != null ? o.loop : def.loop)) return;
      if (this.clip) { this.clipPrev = this.clip; this.clipPrev.fadeOut = o.fade || 0.25; this.clipPrev.fo = 0; }
      this.clip = { name: key, def, t: 0, w: 0, fade: o.fade != null ? o.fade : 0.28, loop: o.loop != null ? o.loop : def.loop, onDone: o.onDone || null, explicit: true };
    }
    emote(k) { const d = EMOTES[k]; if (d) this.emotes.push({ d, t: 0 }); if (k === '♥' && !this.clip) this.play('slowblink'); }
    setExpression(name) { const e = EXPR[name] || EXPR.neutral; this.exprName = name; Object.assign(this.exprT, e); }
    lookAt(v) { this.lookTarget = v ? v.clone() : null; }
    setOpacity(a, ghost) {
      this.opacity = a; this.ghost = !!ghost;
      const U = this.mat.userData.coat; U.uFade.value = a; U.uGhost.value = ghost ? 1 : 0;
      const tr = a < 0.99 || !!ghost;
      if (this.mat.transparent !== tr) { this.mat.transparent = tr; this.mat.needsUpdate = true; this.eyeMat.transparent = tr; this.eyeMat.needsUpdate = true; }
      this.mat.depthWrite = !ghost;
      const EU = this.eyeMat.userData.eye; EU.uFade.value = a; EU.uGhost.value = ghost ? 1 : 0;
      if (this.cardMat) { const C = this.cardMat.userData.coat; C.uFade.value = a; C.uGhost.value = ghost ? 1 : 0; this.cardMat.depthWrite = !ghost; if (this.cardMat.transparent !== tr) { this.cardMat.transparent = tr; this.cardMat.needsUpdate = true; } }
      this.outline.visible = a > 0.6 && !ghost;
      this.body.castShadow = !ghost && a > 0.5;
    }
    bone(name) { return this.B[BONE_ALIAS[name] || name] || this.B.root; }
    dispose() { this.mat.dispose(); this.eyeMat.dispose(); this.outline.material.dispose(); if (this.cardMat) this.cardMat.dispose(); }

    // ---------------------------------------------------------------- update
    update(dt, camYaw, camera) {
      dt = min(dt || 0, 0.1); this._dt = dt;
      this.t += dt;
      this.root.rotation.y = this.yaw;
      // turn rate (for leaning into turns)
      if (this.yawPrev == null) this.yawPrev = this.yaw;
      const dy = Math.atan2(sin(this.yaw - this.yawPrev), cos(this.yaw - this.yawPrev)); this.yawPrev = this.yaw;
      if (dt > 0) this.yawRate += (dy / dt - this.yawRate) * min(1, dt * 8);
      // speed smoothing + gait selection with hysteresis
      const prevSpeed = this.speed;
      this.speed += (this._speed - this.speed) * min(1, dt * 10);
      if (dt > 0) this.accel += ((this.speed - prevSpeed) / dt - this.accel) * min(1, dt * 6);
      const S = this.S, gs = this.plan.gs || 1, vp = this.speed / (S * gs), vf = vp * sqrt(gs);
      const want = this.gaitFor(vf);
      if (want !== this.gait) { this.gaitPrev = this.gait; this.gait = want; this.gaitFade = 0; }
      this.gaitFade = min(1, this.gaitFade + dt / 0.3);
      for (const g in this.gaits) { const G_ = this.gaits[g]; this.cadence[g] = max((G_.f0 + G_.fk * vf) / sqrt(gs), vp * G_.duty / G_.sweepMax); }
      const f = lerp(this.cadence[this.gaitPrev || this.gait], this.cadence[this.gait], this.gaitFade);
      this.phase = (this.phase + dt * f) % 1;
      this.moveW += ((this.speed > 0.05 ? 1 : 0) - this.moveW) * min(1, dt * (this.speed > 0.05 ? 9 : 5));
      // expression smoothing
      for (const k in this.exprT) this.expr[k] += (this.exprT[k] - this.expr[k]) * min(1, dt * 8);
      // ---- base: idle stand ↔ locomotion
      const P = this.P, Q = this.Q;
      neutral(P, this);
      this.idlePose(P, dt);
      if (this.moveW > 0.001) {
        neutral(Q, this); gaitPose(Q, this, this.gait, this.phase, vp, vf);
        if (this.gaitPrev && this.gaitFade < 1) { const R = this.R; neutral(R, this); gaitPose(R, this, this.gaitPrev, this.phase, vp, vf); blendInto(R, Q, this.gaitFade); Q.set(R); }
        blendInto(P, Q, this.moveW);
      }
      // ---- clips (crossfaded over the base; moving cancels idle-brain clips)
      if (this.clip && !this.clip.explicit && this.speed > 0.15) this.play(null, { fade: 0.18 });
      if (this.clipPrev) {
        const c = this.clipPrev; c.fo += dt; c.t += dt;
        const w = c.w * (1 - c.fo / c.fadeOut);
        if (w <= 0) this.clipPrev = null; else { this.evalClip(c, Q); blendInto(P, Q, w); }
      }
      if (this.clip) {
        const c = this.clip; c.t += dt; c.w = min(1, c.w + dt / max(0.01, c.fade));
        const done = !c.loop && c.t >= c.def.dur;
        this.evalClip(c, Q);
        let w = c.w;
        if (this.speed > 0.15 && !c.def.battle) w *= 1 - this.moveW * 0.85; // locomotion wins while moving
        blendInto(P, Q, w);
        if (done && !c.def.hold) { const cb = c.onDone; this.play(null, { fade: 0.35 }); if (cb) cb(); }
        else if (done && c.def.hold && c.onDone) { const cb = c.onDone; c.onDone = null; cb(); }
      }
      // ---- additive layers
      this.additive(P, dt);
      // ---- solve
      this.applyPose(P, dt);
      this.springs.step(dt);
      // eye uniforms
      this.eyeMat.userData.eye.uPupil.value = clamp(Rd(P, 'pupil'), 0.06, 1);
      this.mat.userData.coat.uMouth.value = clamp((Rd(P, 'jaw') - 0.04) / 0.6, 0, 1);
      this.mat.userData.coat.uTime.value = this.t;
    }
    gaitFor(vp) {
      const g = this.gait, h = 0.06;
      const w2t = this.plan.w2t || 1.15, t2g = this.plan.t2g || 2.35; // cat-equivalent (Froude-scaled) plan speeds
      if (g === 'walk') return vp > w2t + h ? (vp > t2g + h ? 'gallop' : 'trot') : 'walk';
      if (g === 'trot') return vp < w2t - h ? 'walk' : vp > t2g + h ? 'gallop' : 'trot';
      return vp < t2g - h ? (vp < w2t - h ? 'walk' : 'trot') : 'gallop';
    }
    evalClip(c, out) {
      neutral(out, this);
      const dur = c.def.dur;
      const k = c.loop ? (c.t / dur) % 1 : min(1, c.t / dur);
      c.def.fn(c.t, out, this, k);
    }
    // idle behaviour brain: stand → sit → (groom | look around | loaf | yawn) while nothing else is requested
    idlePose(P, dt) {
      const B_ = this.idleBrain;
      // standing idle: weight shift + slow head looks
      const t = this.t;
      W(P, 'hipX', 0.003 * sin(t * 0.37)); W(P, 'hipR', 0.015 * sin(t * 0.37)); W(P, 'headY', 0.18 * sin(t * 0.23) * sin(t * 0.11)); W(P, 'neckP', 0.05);
      if (this.speed > 0.05 || (this.clip && this.clip.explicit)) { B_.t = 0; return; }
      if (this.context !== 'map' && this.context !== 'cutscene') return;
      B_.t += dt;
      const IT = IDLE[this.plan.species || 'cat'];
      if (IT && B_.t > B_.next) {
        B_.t = 0; B_.next = IT.gap[0] + Math.random() * IT.gap[1];
        const cur = this.clip ? this.clip.name : 'none';
        const opts = IT[cur] || IT.none;
        let r = Math.random() * opts.reduce((a, o) => a + o[1], 0), pick = null;
        for (const [c, w] of opts) { r -= w; if (r <= 0) { pick = c; break; } }
        if (pick === 'stand') { this.play(null, { fade: 0.6 }); return; }
        if (pick && this.clipSet[pick]) {
          const def = this.clipSet[pick];
          this.play(pick, { fade: def.loop ? 0.8 : 0.35 }); this.clip.explicit = false;
          if (!def.loop) { const back = IT.back || null; this.clip.onDone = back ? () => { this.play(back, { fade: 0.6 }); if (this.clip) this.clip.explicit = false; } : null; }
        }
        return;
      }
      if (IT) return;
      if (B_.t > B_.next) {
        B_.t = 0;
        const pet = this.plan.cfg;
        const r = Math.random();
        let pick;
        if (!this.clip) pick = r < 0.6 ? 'sit' : r < 0.85 ? 'loaf' : 'stretch';
        else if (this.clip.name === 'sit') pick = r < 0.25 ? 'groom' : r < 0.4 ? 'yawn' : r < 0.55 && pet.judge ? 'judge' : r < 0.65 ? 'loaf' : r < 0.72 && pet.chirpy ? 'chirp' : null;
        else if (this.clip.name === 'loaf') pick = r < 0.25 ? 'purr' : r < 0.35 ? 'sleep' : r < 0.5 ? 'sit' : null;
        else if (this.clip.name === 'groom' || this.clip.name === 'judge' || this.clip.name === 'purr') pick = r < 0.6 ? 'sit' : 'loaf';
        if (pick) { this.play(pick, { fade: pick === 'sit' || pick === 'loaf' ? 0.9 : 0.5 }); this.clip.explicit = false; if (!CLIPS[pick].loop) this.clip.onDone = () => this.play('sit', { fade: 0.6 }); if (this.clip) this.clip.explicit = false; }
        B_.next = 4 + Math.random() * 6;
      }
    }
    additive(P, dt) {
      const t = this.t;
      // breathing (chest/belly) – faster when moving or after running
      const br = Rd(P, 'breath'), rate = 1.6 + this.moveW * 1.2;
      W(P, 'bellyY', Rd(P, 'bellyY') + 0.0018 * br * sin(t * rate * TAU / 2));
      Ad(P, 'chP', -0.012 * br * sin(t * rate * TAU / 2));
      // tail: base swish oscillator (frequency from the pose, phase kept here so blending never pops)
      this.tailOsc += dt * Rd(P, 'tailWaveF') * TAU;
      // ear flicks
      const ef = this.earFlick;
      if (t > ef.next && ef.t < 0) { ef.t = 0; ef.side = Math.random() < 0.5 ? 1 : -1; ef.next = t + 3 + Math.random() * 6; }
      if (ef.t >= 0) {
        ef.t += dt; const a = pulse(ef.t, 0, 0.05, 0.12, 0.3);
        Ad(P, ef.side > 0 ? 'earLY' : 'earRY', 0.5 * a); Ad(P, ef.side > 0 ? 'earLR' : 'earRR', 0.3 * a);
        if (ef.t > 0.3) ef.t = -1;
      }
      // blinks (occasional double blink)
      const bl = this.blink;
      if (t > bl.next && bl.t < 0) { bl.t = 0; bl.dbl = Math.random() < 0.2; bl.next = t + 2 + Math.random() * 4.5; }
      if (bl.t >= 0) {
        bl.t += dt;
        const one = (x) => pulse(x, 0, 0.06, 0.1, 0.2);
        const a = max(one(bl.t), bl.dbl ? one(bl.t - 0.24) : 0);
        for (const k of ['lidUL', 'lidUR']) W(P, k, Rd(P, k) + (1 - Rd(P, k)) * a);
        for (const k of ['lidDL', 'lidDR']) W(P, k, Rd(P, k) + (0.3 - Rd(P, k)) * a * 0.6);
        if (bl.t > (bl.dbl ? 0.45 : 0.22)) bl.t = -1;
      }
      // emotes
      for (let i = this.emotes.length - 1; i >= 0; i--) {
        const e = this.emotes[i]; e.t += dt; const k = e.t / e.d.dur;
        if (k >= 1) { this.emotes.splice(i, 1); continue; }
        e.d.fn(P, k);
      }
      // expression ears
      Ad(P, 'earLP', this.expr.ear); Ad(P, 'earRP', this.expr.ear); Ad(P, 'earLY', this.expr.earY); Ad(P, 'earRY', this.expr.earY);
      Ad(P, 'jaw', this.expr.jaw);
      // purr: fine vibration + closed-eye contentment
      const pu = Rd(P, 'purr');
      if (pu > 0.01) { const v = sin(t * 2 * PI * 23) * 0.5 + sin(t * 2 * PI * 17.3) * 0.5; Ad(P, 'chP', 0.004 * pu * v); Ad(P, 'headP', 0.006 * pu * v); Ad(P, 'bellyY', 0.0008 * pu * v); }
      // turn lean & acceleration
      const yr = clamp(this.yawRate, -6, 6) * this.moveW;
      Ad(P, 'sp1Y', -0.03 * yr); Ad(P, 'sp2Y', -0.03 * yr); Ad(P, 'chY', -0.02 * yr); Ad(P, 'neckY', -0.05 * yr); Ad(P, 'hipR', 0.025 * yr);
      Ad(P, 'tailY', 0.06 * yr);
      const ac = clamp(this.accel / this.S, -6, 6);
      Ad(P, 'hipP', 0.01 * ac); Ad(P, 'chP', 0.008 * ac);
      // look-at (head + eyes) with limits & smoothing; saccades when idle
      this.updateLook(P, dt);
    }
    updateLook(P, dt) {
      let ty = 0, tp = 0, w = 0;
      if (this.lookTarget) {
        const hb = this.B.head, hp = this._tmp.a; hb.getWorldPosition(hp);
        const d = this._tmp.b.copy(this.lookTarget).sub(hp);
        const yawW = Math.atan2(d.x, d.z);
        ty = Math.atan2(sin(yawW - this.yaw), cos(yawW - this.yaw));
        tp = -Math.atan2(d.y, Math.hypot(d.x, d.z));
        w = abs(ty) < 2.2 ? 1 : 0;
      }
      this.lookW += (w - this.lookW) * min(1, dt * 4);
      this.lookYaw += (clamp(ty, -1.3, 1.3) - this.lookYaw) * min(1, dt * 5);
      this.lookPitch += (clamp(tp, -0.6, 0.5) - this.lookPitch) * min(1, dt * 5);
      const lw = this.lookW * Rd(P, 'look');
      Ad(P, 'neckY', this.lookYaw * 0.45 * lw); Ad(P, 'headY', this.lookYaw * 0.4 * lw);
      Ad(P, 'headP', this.lookPitch * 0.6 * lw); Ad(P, 'headR', -this.lookYaw * 0.12 * lw);
      // eyes: remaining yaw + saccades
      const sc = this.saccade; sc.t -= dt;
      if (sc.t <= 0) { sc.t = 0.6 + Math.random() * 2.2; sc.x = (Math.random() - 0.5) * 0.18; sc.y = (Math.random() - 0.5) * 0.1; }
      Ad(P, 'eyeY', this.lookYaw * 0.15 * lw + sc.x); Ad(P, 'eyeP', this.lookPitch * 0.3 * lw + sc.y);
    }
    // ---------------------------------------------------------------- rig solve
    applyPose(P, dt) {
      const B = this.B, S = this.ps, eu = this._tmp.eu, rp = this.restPos;
      const setR = (b, x, y, z) => { eu.set(x, y, z, 'YXZ'); b.quaternion.setFromEuler(eu); };
      B.hips.position.copy(rp.hips).add(this._tmp.a.set(Rd(P, 'hipX') * S, Rd(P, 'hipY') * S, Rd(P, 'hipZ') * S));
      setR(B.hips, Rd(P, 'hipP'), Rd(P, 'hipYw'), Rd(P, 'hipR'));
      setR(B.spine1, Rd(P, 'sp1P'), Rd(P, 'sp1Y'), Rd(P, 'sp1R'));
      setR(B.spine2, Rd(P, 'sp2P'), Rd(P, 'sp2Y'), Rd(P, 'sp2R'));
      setR(B.chest, Rd(P, 'chP'), Rd(P, 'chY'), Rd(P, 'chR'));
      setR(B.neck, Rd(P, 'neckP'), Rd(P, 'neckY'), Rd(P, 'neckR'));
      B.neck.position.copy(rp.neck); B.neck.position.z += Rd(P, 'neckZ') * S;
      if (B.wingL) {
        this.flapOsc = (this.flapOsc || 0) + this._dt * Rd(P, 'flapF') * TAU;
        const sp = clamp(Rd(P, 'wing'), 0, 1), fl = Rd(P, 'flap') * sin(this.flapOsc);
        for (const [sx, sg] of [['L', 1], ['R', -1]]) {
          eu.set(-0.15 * sp, -sg * sp * 1.25, sg * (sp * 0.35 + fl), 'ZYX'); B['wing' + sx].quaternion.setFromEuler(eu);
          eu.set(0, -sg * sp * 0.5, sg * fl * 0.4, 'ZYX'); B['wing2' + sx].quaternion.setFromEuler(eu);
        }
      }
      setR(B.head, Rd(P, 'headP'), Rd(P, 'headY'), Rd(P, 'headR'));
      if (B.jaw) setR(B.jaw, Rd(P, 'jaw') * 0.6, 0, 0);
      if (B.belly) B.belly.position.copy(rp.belly).add(this._tmp.a.set(0, Rd(P, 'bellyY') * S, 0));
      // tail: base + per-segment curl + travelling swish wave (tip lags)
      const n = this.plan.tailN, wa = Rd(P, 'tailWaveA');
      for (let i = 0; i < n; i++) {
        const b = B['tail' + (i + 1)]; if (!b) break;
        const u = i / (n - 1);
        // tail bones point backwards: a positive x-rotation lifts them, so negate (pose convention: + = down)
        const pitch = -((i === 0 ? Rd(P, 'tailP') : 0) + Rd(P, 'tailCurl') + (i >= n - 2 ? Rd(P, 'tailTipP') * 0.5 : 0));
        const yaw = (i === 0 ? Rd(P, 'tailY') : 0) + Rd(P, 'tailCurlY') + wa * (0.4 + u) * sin(this.tailOsc - i * 0.55);
        setR(b, pitch, yaw, 0);
      }
      // ears (R mirrored: positive yaw/roll = outward for both)
      if (B.earL) setR(B.earL, Rd(P, 'earLP'), -Rd(P, 'earLY') * 0.9, -Rd(P, 'earLR') * 0.9 - Rd(P, 'earLY') * 0.4);
      if (B.earR) setR(B.earR, Rd(P, 'earRP'), Rd(P, 'earRY') * 0.9, Rd(P, 'earRR') * 0.9 + Rd(P, 'earRY') * 0.4);
      // scapulae ride up/down
      for (const [k, s] of [['scapL', 'L'], ['scapR', 'R']]) { const b = B['scap' + s]; if (b) { b.position.copy(rp['scap' + s]).add(this._tmp.a.set(0, Rd(P, k) * S, 0)); } }
      // eyes & lids
      for (const e of this.eyeInfo) {
        const s = e.sx;
        const up = clamp(Rd(P, 'lidU' + s), -0.4, 1.05), dn = clamp(Rd(P, 'lidD' + s), -0.3, 1);
        B['lidU' + s].quaternion.setFromAxisAngle(e.x, up * 0.62);
        B['lidD' + s].quaternion.setFromAxisAngle(e.x, -dn * 0.34);
        const q = this._tmp.q.setFromAxisAngle(e.y, clamp(Rd(P, 'eyeY'), -0.4, 0.4));
        B['eye' + s].quaternion.setFromAxisAngle(e.x, clamp(Rd(P, 'eyeP'), -0.3, 0.3)).premultiply(q);
      }
      this.root.updateMatrixWorld(true);
      // legs (model space = skeleton root space)
      const rootInv = this._tmp.m.copy(B.root.matrixWorld).invert();
      // pelvis adjustment: lower the whole body until every ground-space paw target is within reach
      // (instant when more drop is needed, smooth release), so planted paws never get dragged
      let need = 0;
      for (const L of this.legKeys) need = max(need, this.reachDeficit(L, P, rootInv));
      this.dropS = need > (this.dropS || 0) ? need : (this.dropS || 0) + (need - (this.dropS || 0)) * min(1, this._dt * 6);
      if (this.dropS > 1e-5) { B.hips.position.y -= this.dropS; this.root.updateMatrixWorld(true); rootInv.copy(B.root.matrixWorld).invert(); }
      for (const L of this.legKeys) this.solveLeg(L, P, rootInv);
    }
    reachDeficit(L, P, rootInv) {
      const lg = this.legs[L], S = this.ps;
      if (Rd(P, L + 'g') > 0.3) return 0;
      const T = this._tmp.e.set(Rd(P, L + 'x') * S, Rd(P, L + 'y') * S, Rd(P, L + 'z') * S).add(lg.restPaw);
      T.y = max(T.y, lg.minY * 0.6);
      const pA = this._tmp.f.setFromMatrixPosition(this._tmp.m2.multiplyMatrices(rootInv, lg.bones[0].matrixWorld));
      const maxR = (lg.la + lg.lb) * 0.975 + lg.lc * 0.9 + (lg.front ? lg.la * 0.3 : 0);
      const d = T.distanceTo(pA);
      if (d <= maxR) return 0;
      const dx = Math.hypot(T.x - pA.x, T.z - pA.z), hy = pA.y - T.y;
      return max(0, hy - sqrt(max(0, maxR * maxR - dx * dx)));
    }
    solveLeg(L, P, rootInv) {
      const THREE = T3();
      const lg = this.legs[L], S = this.ps, [A, Bn, C, D] = lg.bones;
      const mG = this._tmp.m2.multiplyMatrices(rootInv, lg.girdle.matrixWorld);
      const gx = new THREE.Vector3().setFromMatrixColumn(mG, 0).normalize();
      const gy = new THREE.Vector3().setFromMatrixColumn(mG, 1).normalize();
      const gz = new THREE.Vector3().setFromMatrixColumn(mG, 2).normalize();
      const off = new THREE.Vector3(Rd(P, L + 'x') * S, Rd(P, L + 'y') * S, Rd(P, L + 'z') * S);
      const g = clamp(Rd(P, L + 'g'), 0, 1);
      const Tg = lg.restPaw.clone().add(off);
      Tg.y = max(Tg.y, lg.minY * 0.6);
      const Tl = lg.pawInGirdle.clone().add(off).applyMatrix4(mG);
      const T = Tg.lerp(Tl, g);
      // joint A position (model)
      const pA = new THREE.Vector3().setFromMatrixPosition(this._tmp.m.clone().multiply(A.matrixWorld)); // rootInv * A.world
      // leg plane: side = girdle x; down/forward blend between ground frame and girdle frame
      const down = new THREE.Vector3(0, -1, 0).lerp(gy.clone().negate(), max(g, 0.35)).normalize();
      const n = gx.clone();
      const fwd = new THREE.Vector3().crossVectors(n, down).normalize().negate(); // forward in the leg plane
      const sign = lg.front ? 1 : -1;
      let phi = lg.meta0 + Rd(P, L + 'm');
      let pB, K;
      // out of reach? 1) the scapula glides toward the paw (front), 2) the metatarsus aligns with the reach line
      const reach = (lg.la + lg.lb) * 0.985;
      if (lg.front && lg.def.scap && lg.bones[0].parent) {
        const sc = lg.bones[0].parent, need = T.distanceTo(pA) - reach - lg.lc * 0.6;
        if (need > 0) {
          const dm = T.clone().sub(pA).normalize().multiplyScalar(min(need, lg.la * 0.35));
          const qc = new THREE.Quaternion(); new THREE.Matrix4().multiplyMatrices(this._tmp.m, sc.parent.matrixWorld).decompose(new THREE.Vector3(), qc, new THREE.Vector3());
          sc.position.add(dm.clone().applyQuaternion(qc.invert()));
          sc.updateMatrixWorld(true);
          pA.setFromMatrixPosition(this._tmp.m.clone().multiply(A.matrixWorld));
        }
      }
      for (let it = 0; it < (lg.front ? 1 : 2); it++) {
        let md = down.clone().multiplyScalar(cos(phi)).addScaledVector(fwd, sin(phi));
        K = T.clone().addScaledVector(md, -lg.lc);
        const over = K.distanceTo(pA) - reach;
        if (over > 0) { // swing the metatarsus toward the hip→paw line (heel lift) just enough to reach
          const line = T.clone().sub(pA).normalize();
          const w = clamp(over / (lg.lc * 0.8), 0, 1);
          md = md.lerp(line, w).normalize();
          K = T.clone().addScaledVector(md, -lg.lc);
        }
        pB = this.solve2(pA, K, lg.la, lg.lb, n, sign);
        if (!lg.front) { // pantograph: metatarsus stays roughly parallel to the femur
          const fd = pB.clone().sub(pA).normalize();
          const femur = Math.atan2(fd.dot(fwd), fd.dot(down));
          phi = lerp(phi, femur + (lg.meta0 - lg.femur0) + Rd(P, L + 'm'), 0.65 * (1 - smooth(0.3, 0.8, abs(Rd(P, L + 'm')))));
        }
      }
      // K may have been pulled in by the reach clamp
      const dirs = [pB.clone().sub(pA).normalize(), K.clone().sub(pB).normalize(), T.clone().sub(K).normalize()];
      // paw (toe) direction: forward along the ground (or girdle), curled by the toe param
      const pf = new THREE.Vector3(0, 0, 1).lerp(gz, g).normalize();
      const pd = pf.clone().applyAxisAngle(n, Rd(P, L + 't') + 0.12).normalize();
      dirs.push(pd);
      // set bone rotations: model rotation from rest frame, then local = parentModel^-1 * model
      const parentQ = new THREE.Quaternion();
      A.parent.updateMatrixWorld(true);
      const mp = this._tmp.m.clone().multiply(A.parent.matrixWorld);
      mp.decompose(new THREE.Vector3(), parentQ, new THREE.Vector3());
      const X = new THREE.Vector3(1, 0, 0);
      let prevQ = parentQ;
      [A, Bn, C, D].forEach((b, i) => {
        const mq = frameQuat(lg.restDirs[i], X, dirs[i], n, new THREE.Quaternion());
        b.quaternion.copy(prevQ.clone().invert().multiply(mq));
        prevQ = mq;
      });
      A.updateMatrixWorld(true);
    }
    solve2(pA, K, la, lb, n, sign) {
      const AK = K.clone().sub(pA); let d = AK.length();
      const u = AK.divideScalar(d || 1);
      d = clamp(d, abs(la - lb) + 1e-4, (la + lb) * 0.9995);
      K.copy(pA).addScaledVector(u, d);
      const ca = clamp((la * la + d * d - lb * lb) / (2 * la * d), -1, 1);
      const a = Math.acos(ca) * sign;
      return pA.clone().addScaledVector(u.clone().applyAxisAngle(n, a), la);
    }
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

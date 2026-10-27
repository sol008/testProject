// 彼岸燈 — G.Char3D: real-time 3D humanoid characters built procedurally from G.Sprites specs.
// Contract: docs/CONTRACTS_3D.md ("G.Char3D"). Bespoke main-cast looks live in chars_cast.js.
//
// Pipeline (per sprite id, cached as a template; instances share geometry & textures):
//   spec (G.Sprites.spec + optional cast look) → proportions (BODY) → bone rig (bind pose = relaxed A-pose, all bone
//   frames world-aligned) → parts (body, garments, hair, hat, beard, props) emitted into ONE skinned body geometry with
//   UVs into a painted per-character atlas (fabric weave, piping, embroidery bands, hair strands …) + a head geometry
//   whose UVs (spherical, front-weighted) address a per-INSTANCE face canvas (eyes / brows / mouth, redrawn on blinks,
//   saccades, expressions and lip-flap) + one inverted-hull outline over both. → 3 draw calls (+1 halo/aura if any).
//   Props are rigidly skinned to prop bones; hidden props (map vs battle) are collapsed by scaling their bone to 0.
//   Secondary motion: VRM-style spring-bone chains (hair, ribbons, sleeves, skirts/robe hems, sashes, capes, lanterns)
//   with sphere/capsule colliders on the body, sub-stepped for stability at 30–144 fps.
//   Animation: every clip (locomotion, battle, field gestures) is authored as eased key poses (or a procedural gait
//   function) and BAKED per body type into THREE.AnimationClips with analytic two-bone leg/arm IK (planted feet,
//   two-handed grips), played by an AnimationMixer with cross-fades. Locomotion is a phase-synchronised 1D blend
//   space (idle / stroll / walk / run) whose cadence = speed / stride, so feet never slide. A runtime layer adds
//   turn & acceleration lean, breathing, additive look-at (eyes lead, head follows) and the spring bones.
'use strict';
G.Char3D = (() => {
  const C = {};
  const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
  const { sin, cos, abs, min, max, sqrt, hypot, atan2, pow, exp, floor, round } = Math;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const fract = (x) => x - floor(x);
  const TH = () => window.THREE;

  // ================================================================================== colour helpers
  function hex2rgb(h) {
    h = (h || '#888888').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  function shade(h, a) { // a in -1..1 : darken / lighten
    const [r, g, b] = hex2rgb(h);
    if (a >= 0) return rgb2hex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a);
    return rgb2hex(r * (1 + a), g * (1 + a), b * (1 + a));
  }
  function mixc(h1, h2, t) { const a = hex2rgb(h1), b = hex2rgb(h2); return rgb2hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)); }
  function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }
  function lum(h) { const [r, g, b] = hex2rgb(h); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
  // stylised shadow colour: darker, slightly cooler & more saturated (painterly, never grey)
  function shadowOf(h, k = 0.3) { return mixc(shade(h, -k), '#3a2c5a', 0.12); }

  // deterministic RNG (so every build of an id is identical)
  function rng(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
    s = (s ^ 0x9e3779b9) >>> 0;
    return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ================================================================================== spec normalisation
  function merge(a, b) {
    for (const k in b) {
      const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) a[k] = merge(Object.assign({}, a[k]), v);
      else a[k] = Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? merge({}, v) : v);
    }
    return a;
  }
  C.merge = merge;
  function normalize(raw) {
    const s = merge({}, raw || {});
    s.kind = s.kind || 'human';
    s.body = s.body || 'adult';
    s.skin = s.skin || '#f2cfb0';
    s.eyes = s.eyes || '#4a3328';
    s.hair = Object.assign({ style: 'messy', color: '#2a2630', back: 'short' }, s.hair || {});
    s.top = Object.assign({ color: '#6a7a8a', len: 0.2, closure: 'cross', sleeve: 'long' }, s.top || {});
    s.bottom = Object.assign({ type: 'pants', color: '#3a3540' }, s.bottom || {});
    s.shoes = Object.assign({ type: 'cloth', color: '#2b2730' }, s.shoes || {});
    if (s.hat && typeof s.hat === 'string') s.hat = { type: s.hat };
    if (s.hip && !Array.isArray(s.hip)) s.hip = [s.hip];
    s.face = s.face || {};
    return s;
  }

  // ================================================================================== proportions
  // Half-widths (x) and front/back depths are radii in metres. 7–7.5 heads for adults (stylised), 5.5 for children.
  const BODY = {};
  BODY.adult = {
    H: 1.72, head: 0.232, headW: 0.18, headD: 0.196, neckLen: 0.05, neckR: 0.047, legTop: 0.875,
    sh: 0.178, shY: 0.0, chestW: 0.152, chestF: 0.1, chestB: 0.094, waistW: 0.128, waistF: 0.085, waistB: 0.082,
    hipW: 0.148, hipF: 0.094, hipB: 0.104, upArm: 0.285, foreArm: 0.245, hand: 0.17, armR: 0.047, elbowR: 0.037, foreR: 0.04, wristR: 0.028,
    thighR: 0.076, kneeR: 0.047, calfR: 0.052, ankleR: 0.03, foot: 0.245, footW: 0.047, hipSep: 0.088, palm: 1,
    bust: 0, belly: 0, stoop: 0, fem: 0, age: 0,
  };
  BODY.female = Object.assign({}, BODY.adult, {
    H: 1.63, head: 0.225, headW: 0.173, headD: 0.188, neckLen: 0.052, neckR: 0.04, legTop: 0.85,
    sh: 0.153, chestW: 0.13, chestF: 0.088, chestB: 0.082, waistW: 0.103, waistF: 0.072, waistB: 0.07,
    hipW: 0.148, hipF: 0.09, hipB: 0.108, upArm: 0.265, foreArm: 0.228, hand: 0.155, armR: 0.035, elbowR: 0.028, foreR: 0.029, wristR: 0.021,
    thighR: 0.072, kneeR: 0.042, calfR: 0.046, ankleR: 0.026, foot: 0.22, footW: 0.04, hipSep: 0.082, bust: 1, fem: 1, palm: 0.9,
  });
  BODY.stout = Object.assign({}, BODY.adult, {
    H: 1.69, legTop: 0.83, sh: 0.195, chestW: 0.182, chestF: 0.12, chestB: 0.11, waistW: 0.18, waistF: 0.135, waistB: 0.1,
    hipW: 0.172, hipF: 0.11, hipB: 0.118, armR: 0.052, elbowR: 0.042, foreR: 0.044, wristR: 0.03, thighR: 0.09, kneeR: 0.056, calfR: 0.06,
    neckR: 0.056, belly: 1, hipSep: 0.1, palm: 1.12, headW: 0.188,
  });
  BODY.elder = Object.assign({}, BODY.adult, { H: 1.66, legTop: 0.84, stoop: 1, age: 1, chestW: 0.146, waistW: 0.134, waistF: 0.095, armR: 0.04, foreR: 0.033, thighR: 0.07, calfR: 0.047 });
  BODY.elderf = Object.assign({}, BODY.female, { H: 1.55, legTop: 0.79, stoop: 1.15, age: 1, waistW: 0.12, waistF: 0.088, bust: 0.6, head: 0.218 });
  BODY.child = Object.assign({}, BODY.adult, {
    H: 1.15, head: 0.208, headW: 0.182, headD: 0.188, neckLen: 0.032, neckR: 0.034, legTop: 0.53,
    sh: 0.118, chestW: 0.105, chestF: 0.075, chestB: 0.07, waistW: 0.1, waistF: 0.074, waistB: 0.066, hipW: 0.106, hipF: 0.07, hipB: 0.078,
    upArm: 0.18, foreArm: 0.155, hand: 0.11, armR: 0.03, elbowR: 0.025, foreR: 0.026, wristR: 0.019,
    thighR: 0.053, kneeR: 0.036, calfR: 0.037, ankleR: 0.023, foot: 0.165, footW: 0.034, hipSep: 0.06, palm: 0.8, kid: 1,
  });
  BODY.tall = Object.assign({}, BODY.adult, { H: 1.82, legTop: 0.94, head: 0.236, upArm: 0.3, foreArm: 0.26, hand: 0.178, sh: 0.182 });
  BODY.tallf = Object.assign({}, BODY.female, { H: 1.73, legTop: 0.91, head: 0.228, upArm: 0.28, foreArm: 0.24, hand: 0.16 });

  function bodyProps(spec) {
    const P = Object.assign({}, BODY[spec.body] || BODY.adult, spec.body3d || {});
    const s = P.H / 1.72;
    P.s = s;
    P.crown = P.H;
    P.chin = P.H - P.head;
    P.headC = [0, P.chin + P.head * 0.5, 0.006];
    P.headY = P.chin + P.head * 0.16;                  // head bone (skull base / jaw pivot)
    P.neckY = P.chin - P.neckLen;                      // neck bone (base of neck)
    P.shoulderY = P.neckY - 0.032 * s;
    P.chestY = P.neckY - 0.17 * s;
    P.hipsY = P.legTop + 0.07 * s;
    P.spineY = P.hipsY + (P.chestY - P.hipsY) * 0.42;
    P.waistY = P.hipsY + (P.chestY - P.hipsY) * 0.5;
    P.ankleY = 0.072 * s;
    P.kneeY = P.ankleY + (P.legTop - P.ankleY) * 0.49;
    P.armOut = 9 * D2R;                                // bind: arms 9° out from vertical (relaxed A-pose)
    const dx = sin(P.armOut), dy = -cos(P.armOut);
    P.shJ = [P.sh, P.shoulderY, -0.008];
    P.elbow = [P.sh + dx * P.upArm, P.shoulderY + dy * P.upArm, -0.008];
    P.wrist = [P.elbow[0] + dx * P.foreArm, P.elbow[1] + dy * P.foreArm, -0.008];
    P.armDir = [dx, dy, 0];
    P.footZ = 0.0;
    return P;
  }
  C.BODY = BODY;
  C.bodyProps = bodyProps;

  // ================================================================================== geometry builder
  // Vertices carry: position, normal, uv (rect-local, remapped after atlas packing), skin weights, AO (vertex colour).
  class Geo {
    constructor() { this.p = []; this.n = []; this.uv = []; this.rect = []; this.w = []; this.ao = []; this.ix = []; this.count = 0; }
    v(x, y, z, nx, ny, nz, u, v, rect, W, ao = 1) {
      this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v); this.rect.push(rect); this.w.push(W); this.ao.push(ao);
      return this.count++;
    }
    t(a, b, c) { this.ix.push(a, b, c); }
    // remap uv through rect table → THREE.BufferGeometry
    build(rects, S, flipV = true) {
      const THREE = TH();
      const n = this.count;
      const pos = new Float32Array(this.p), nrm = new Float32Array(this.n);
      const uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = rects ? rects[this.rect[i]] : null;
        let u = this.uv[i * 2], v = this.uv[i * 2 + 1];
        if (r) { u = (r.x + u * r.w) / S; v = (r.y + v * r.h) / S; }
        uv[i * 2] = u; uv[i * 2 + 1] = flipV ? 1 - v : v;
        const W = normW(this.w[i]);
        for (let k = 0; k < 4; k++) { si[i * 4 + k] = W[k] ? W[k][0] : 0; sw[i * 4 + k] = W[k] ? W[k][1] : 0; }
        const a = this.ao[i]; col[i * 3] = a; col[i * 3 + 1] = a; col[i * 3 + 2] = a;
        if (!isFinite(pos[i * 3]) || !isFinite(pos[i * 3 + 1]) || !isFinite(pos[i * 3 + 2])) { pos[i * 3] = pos[i * 3 + 1] = pos[i * 3 + 2] = 0; }
        if (!isFinite(nrm[i * 3] + nrm[i * 3 + 1] + nrm[i * 3 + 2])) { nrm[i * 3] = 0; nrm[i * 3 + 1] = 1; nrm[i * 3 + 2] = 0; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.ix, 1) : new THREE.Uint16BufferAttribute(this.ix, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      return g;
    }
  }
  function normW(W) {
    if (typeof W === 'number') return [[W, 1]];
    const m = new Map();
    for (const [b, w] of W) if (w > 1e-4) m.set(b, (m.get(b) || 0) + w);
    const arr = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0; for (const e of arr) s += e[1];
    if (s <= 0) return [[0, 1]];
    for (const e of arr) e[1] /= s;
    return arr;
  }
  // blend two weight lists: (1-t)*A + t*B
  function wmix(A, B, t) {
    if (typeof A === 'number') A = [[A, 1]];
    if (typeof B === 'number') B = [[B, 1]];
    if (t <= 0) return A; if (t >= 1) return B;
    const out = [];
    for (const [b, w] of A) out.push([b, w * (1 - t)]);
    for (const [b, w] of B) out.push([b, w * t]);
    return out;
  }

  // Parametric grid: f(u, v) → { p:[x,y,z], w, ao } for u∈[0,1] (nu segments), v∈[0,1] (nv segments).
  // Normal = ∂v × ∂u (outward when u runs counter-clockwise seen from below the +y axis … see notes) ; opts.flip reverses.
  // opts.closed: u wraps (column nu duplicates column 0 for the UV seam but shares its normal).
  // opts.normal(u, v, p) optional analytic normal override (e.g. smooth ellipsoid normals for faces).
  function grid(G, nu, nv, rect, f, opts = {}) {
    const P = [], Wt = [], AO = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const r = f(i / nu, j / nv);
      P.push(r.p); Wt.push(r.w); AO.push(r.ao != null ? r.ao : 1);
    }
    const idx = (i, j) => j * (nu + 1) + i;
    const base = G.count;
    const closed = !!opts.closed;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const p = P[idx(i, j)];
      let iL = i - 1, iR = i + 1;
      if (closed) { if (iL < 0) iL = nu - 1; if (iR > nu) iR = 1; } else { iL = max(0, iL); iR = min(nu, iR); }
      const jU = max(0, j - 1), jD = min(nv, j + 1);
      const pu1 = P[idx(iR, j)], pu0 = P[idx(iL, j)], pv1 = P[idx(i, jD)], pv0 = P[idx(i, jU)];
      let du = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
      let dv = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
      // degenerate rows (poles / collapsed tips): fall back to neighbouring row derivative
      if (du[0] * du[0] + du[1] * du[1] + du[2] * du[2] < 1e-14) {
        const jj = j === 0 ? 1 : j - 1, a = P[idx(iR, jj)], b = P[idx(iL, jj)];
        du = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      }
      let n = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]];
      if (opts.flip) n = [-n[0], -n[1], -n[2]];
      if (opts.normal) n = opts.normal(i / nu, j / nv, p, n);
      const l = hypot(n[0], n[1], n[2]) || 1;
      G.v(p[0], p[1], p[2], n[0] / l, n[1] / l, n[2] / l, opts.uvf ? opts.uvf(i / nu, j / nv)[0] : i / nu, opts.uvf ? opts.uvf(i / nu, j / nv)[1] : j / nv, rect, Wt[idx(i, j)], AO[idx(i, j)]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + idx(i, j), b = base + idx(i + 1, j), c = base + idx(i, j + 1), d = base + idx(i + 1, j + 1);
      if (opts.flip) { G.t(a, b, c); G.t(b, d, c); } else { G.t(a, c, b); G.t(b, c, d); }
    }
    return base;
  }

  // vector helpers on plain arrays
  const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vsc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const vlen = (a) => hypot(a[0], a[1], a[2]);
  const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  // Catmull-Rom through control values (numbers) at parameter t∈[0,1] with knots spaced by ks (sorted)
  function spline(ks, vs, t) {
    const n = ks.length;
    if (t <= ks[0]) return vs[0];
    if (t >= ks[n - 1]) return vs[n - 1];
    let i = 0;
    while (i < n - 2 && t > ks[i + 1]) i++;
    const t0 = ks[i], t1 = ks[i + 1], u = (t - t0) / (t1 - t0 || 1);
    const p0 = vs[max(0, i - 1)], p1 = vs[i], p2 = vs[i + 1], p3 = vs[min(n - 1, i + 2)];
    const m1 = (p2 - p0) * 0.5 * (t1 - t0) / ((ks[i + 1] - ks[max(0, i - 1)]) || 1) * 2;
    const m2 = (p3 - p1) * 0.5 * (t1 - t0) / ((ks[min(n - 1, i + 2)] - ks[i]) || 1) * 2;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
  }

  // Tube along a polyline (parallel-transport frames). ring(s) → { rx, ry, ox, oy } in the frame (x = side, y = 'up' ref)
  // pts: array of [x,y,z]; weights(s, ptIndexFloat) → W. Closed ring of `seg` sides. uv: u around, v along.
  function tube(G, pts, seg, rect, ring, weights, opts = {}) {
    if (typeof weights !== 'function') { const W0 = weights; weights = () => W0; }
    // arc-length parametrise
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + vlen(vsub(pts[i], pts[i - 1])));
    const total = L[L.length - 1] || 1;
    const nv = opts.nv || (pts.length - 1) * (opts.sub || 2);
    const at = (s) => { // position, tangent, float index at arc fraction s
      const d = s * total;
      let i = 0;
      while (i < L.length - 2 && d > L[i + 1]) i++;
      const t = (d - L[i]) / ((L[i + 1] - L[i]) || 1);
      // smooth position with catmull-rom on the polyline
      const p0 = pts[max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1] || pts[i], p3 = pts[min(pts.length - 1, i + 2)];
      const cr = (k) => {
        const a = p0[k], b = p1[k], c = p2[k], e = p3[k];
        return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - e) * t * t + (-a + 3 * b - 3 * c + e) * t * t * t);
      };
      const p = opts.linear ? vlerp(p1, p2, t) : [cr(0), cr(1), cr(2)];
      return { p, fi: i + t };
    };
    const samples = [];
    for (let j = 0; j <= nv; j++) samples.push(at(j / nv));
    // tangents
    const tan = samples.map((s, j) => vnorm(vsub(samples[min(nv, j + 1)].p, samples[max(0, j - 1)].p)));
    // initial reference: opts.up or a vector not parallel to the first tangent
    let ref = opts.up || [0, 0, 1];
    if (abs(vdot(ref, tan[0])) > 0.95) ref = [1, 0, 0];
    let X = vnorm(vcross(ref, tan[0]));
    let Y = vcross(tan[0], X);
    const frames = [];
    for (let j = 0; j <= nv; j++) {
      if (j > 0) { // parallel transport
        const t0 = tan[j - 1], t1 = tan[j];
        const ax = vcross(t0, t1), sl = vlen(ax);
        if (sl > 1e-6) {
          const ang = atan2(sl, vdot(t0, t1)), k = vsc(ax, 1 / sl);
          const rot = (v) => { // Rodrigues
            const c = cos(ang), s = sin(ang);
            return vadd(vadd(vsc(v, c), vsc(vcross(k, v), s)), vsc(k, vdot(k, v) * (1 - c)));
          };
          X = rot(X); Y = rot(Y);
        }
      }
      frames.push([X, Y]);
    }
    const P = [], N = [], Wt = [], AO = [];
    for (let j = 0; j <= nv; j++) {
      const s = j / nv, { p, fi } = samples[j];
      const [fx, fy] = frames[j];
      const r = ring(s, fi);
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU + (opts.phase || 0);
        let cx = cos(a), cy = sin(a);
        let rx = r.rx, ry = r.ry != null ? r.ry : r.rx;
        if (r.shape) { const q = r.shape(a); rx *= q[0]; ry *= q[1]; }
        const ox = (r.ox || 0), oy = (r.oy || 0);
        const q = vadd(p, vadd(vsc(fx, cx * rx + ox), vsc(fy, cy * ry + oy)));
        // ellipse normal
        let nn = vnorm(vadd(vsc(fx, cx / (rx || 1e-4)), vsc(fy, cy / (ry || 1e-4))));
        P.push(q); N.push(nn); Wt.push(weights(s, fi, a)); AO.push(r.ao != null ? r.ao : 1);
      }
    }
    const base = G.count;
    for (let k = 0; k < P.length; k++) {
      const j = floor(k / (seg + 1)), i = k % (seg + 1);
      const uvf = opts.uvf ? opts.uvf(i / seg, j / nv) : [i / seg, j / nv];
      G.v(P[k][0], P[k][1], P[k][2], N[k][0], N[k][1], N[k][2], uvf[0], uvf[1], rect, Wt[k], AO[k]);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      // orientation: frame X×Y = tangent; ring angle ccw around tangent → outward normal with (a, b, c)
      if (opts.flip) { G.t(a, c, b); G.t(b, c, d); } else { G.t(a, b, c); G.t(b, d, c); }
    }
    // caps
    if (opts.capStart) capRing(G, base, seg, P[0] && samples[0].p, rect, Wt[0], true, tan[0]);
    if (opts.capEnd) capRing(G, base + nv * (seg + 1), seg, samples[nv].p, rect, Wt[P.length - 1], false, tan[nv]);
    return { base, nv, seg };
  }
  function capRing(G, start, seg, center, rect, W, isStart, tn) {
    const n = isStart ? vsc(tn, -1) : tn;
    const c = G.v(center[0], center[1], center[2], n[0], n[1], n[2], 0.5, isStart ? 0 : 1, rect, W, 0.8);
    for (let i = 0; i < seg; i++) {
      if (isStart) G.t(c, start + i + 1, start + i); else G.t(c, start + i, start + i + 1);
    }
  }

  // Ellipsoid-ish blob (lat/long). f(nx,ny,nz) → deformed point & weight. Used for heads, buns, hands, shoes.
  function blob(G, nu, nv, rect, center, rad, W, opts = {}) {
    return grid(G, nu, nv, rect, (u, v) => {
      const th = (u - 0.5) * TAU, ph = v * PI;
      let n = [sin(ph) * sin(th), cos(ph), sin(ph) * cos(th)];
      let p = opts.deform ? opts.deform(n, u, v) : [n[0] * rad[0], n[1] * rad[1], n[2] * rad[2]];
      if (opts.rot) p = opts.rot(p);
      return { p: vadd(center, p), w: typeof W === 'function' ? W(n, u, v) : W, ao: opts.ao ? opts.ao(n, u, v) : 1 };
    }, { closed: true, normal: opts.normal, uvf: opts.uvf });
  }

  // ================================================================================== atlas
  // Rect requests in metres (scaled by a global texel density that is solved to fit) or fixed pixels.
  class Atlas {
    constructor(size) { this.S = size; this.req = []; }
    add(wm, hm, paint, opts = {}) { this.req.push({ wm, hm, paint, px: opts.px, minPx: opts.minPx || 6, maxPx: opts.maxPx || 4096, emissive: !!opts.emissive }); return this.req.length - 1; }
    pack() {
      const S = this.S;
      const tryD = (d) => {
        const rs = this.req.map((r, i) => ({ i, w: clamp(round(r.px ? r.px[0] : r.wm * d), r.minPx, min(S - 4, r.maxPx)), h: clamp(round(r.px ? r.px[1] : r.hm * d), r.minPx, min(S - 4, r.maxPx)) }));
        const order = rs.slice().sort((a, b) => b.h - a.h);
        let x = 0, y = 0, rowH = 0;
        const pad = 3;
        for (const r of order) {
          if (x + r.w + pad > S) { x = 0; y += rowH + pad; rowH = 0; }
          r.x = x + 1; r.y = y + 1; x += r.w + pad; rowH = max(rowH, r.h);
        }
        return { ok: y + rowH <= S - 1, rs };
      };
      let lo = 20, hi = 1200, best = null;
      for (let it = 0; it < 18; it++) {
        const mid = (lo + hi) / 2;
        const r = tryD(mid);
        if (r.ok) { best = r; best.d = mid; lo = mid; } else hi = mid;
      }
      if (!best) { best = tryD(lo); best.d = lo; }
      this.d = best.d;
      this.rects = [];
      for (const r of best.rs) this.rects[r.i] = r;
      return this.rects;
    }
    paint() {
      const S = this.S;
      const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g = cv.getContext('2d');
      g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
      let ecv = null, eg = null;
      if (this.req.some((r) => r.emissive)) { ecv = document.createElement('canvas'); ecv.width = ecv.height = S; eg = ecv.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, S, S); }
      this.req.forEach((r, i) => {
        const R = this.rects[i];
        g.save();
        // bleed: paint slightly beyond the rect so bilinear/mip sampling never picks the grey background
        g.beginPath(); g.rect(R.x - 1, R.y - 1, R.w + 2, R.h + 2); g.clip();
        try { r.paint(g, R.x, R.y, R.w, R.h, this.d, eg); } catch (e) { console.warn('char paint', e); }
        g.restore();
      });
      this.canvas = cv; this.ecanvas = ecv;
      return cv;
    }
  }

  // ---------------------------------------------------------------------------------- painting library
  const patCache = new Map();
  // grayscale weave / grain tiles used as multiply overlays
  function weaveTile(kind) {
    if (patCache.has(kind)) return patCache.get(kind);
    const n = 32, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d');
    const R = rng('weave' + kind);
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let v = 0.5;
      if (kind === 'cotton') v = 0.5 + 0.18 * (((x >> 1) + (y >> 1)) % 2 ? 1 : -1) * 0.5 + (R() - 0.5) * 0.25;
      else if (kind === 'silk') v = 0.5 + 0.08 * sin(y * 1.6) + (R() - 0.5) * 0.08;
      else if (kind === 'linen') v = 0.5 + 0.22 * ((x % 3 === 0) ? 1 : 0) - 0.12 * ((y % 4 === 0) ? 1 : 0) + (R() - 0.5) * 0.3;
      else if (kind === 'leather') v = 0.5 + (R() - 0.5) * 0.35;
      else if (kind === 'straw') v = 0.5 + 0.3 * sin(x * 1.1 + sin(y * 0.4) * 2) + (R() - 0.5) * 0.2;
      else if (kind === 'wood') v = 0.5 + 0.25 * sin(x * 0.6 + sin(y * 0.15) * 3) + (R() - 0.5) * 0.12;
      else if (kind === 'hair') v = 0.5 + 0.3 * sin(x * 2.1 + R() * 0.5) * (0.6 + 0.4 * sin(x * 0.37)) + (R() - 0.5) * 0.15;
      else v = 0.5 + (R() - 0.5) * 0.2;
      const b = clamp(v, 0, 1) * 255;
      const i = (y * n + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    patCache.set(kind, cv);
    return cv;
  }
  // overlay a weave tile (soft-light-ish via alpha multiply + screen)
  function texture(g, x, y, w, h, kind, k = 0.22, scale = 1) {
    const t = weaveTile(kind);
    const pat = g.createPattern(t, 'repeat');
    g.save();
    if (scale !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
    g.globalAlpha = k; g.globalCompositeOperation = 'overlay';
    g.fillStyle = pat; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    g.restore();
  }
  function vgrad(g, x, y, w, h, stops) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    for (const [t, c] of stops) gr.addColorStop(t, c);
    g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4);
  }
  // decorative motif strip (embroidery / woven bands)
  function motif(g, x0, x1, yc, h, acc, type) {
    g.save();
    g.fillStyle = acc; g.strokeStyle = acc; g.lineWidth = max(0.8, h * 0.14);
    const step = max(4, h * 1.15);
    if (type === 'diamond') {
      for (let x = x0; x < x1 + step; x += step) { g.beginPath(); g.moveTo(x, yc - h * 0.38); g.lineTo(x + step * 0.32, yc); g.lineTo(x, yc + h * 0.38); g.lineTo(x - step * 0.32, yc); g.closePath(); g.fill(); }
      g.globalAlpha = 0.6;
      for (let x = x0 + step / 2; x < x1 + step; x += step) { g.fillRect(x - h * 0.06, yc - h * 0.06, h * 0.12, h * 0.12); }
    } else if (type === 'zigzag') {
      g.beginPath(); g.moveTo(x0, yc); let up = true;
      for (let x = x0; x < x1 + step; x += step / 2) { g.lineTo(x, yc + (up ? -h * 0.3 : h * 0.3)); up = !up; }
      g.stroke();
    } else if (type === 'dots') {
      for (let x = x0; x < x1 + step; x += step * 0.7) { g.beginPath(); g.arc(x, yc, h * 0.18, 0, TAU); g.fill(); }
    } else if (type === 'cross') {
      for (let x = x0; x < x1 + step; x += step) { g.fillRect(x - h * 0.07, yc - h * 0.3, h * 0.14, h * 0.6); g.fillRect(x - h * 0.3, yc - h * 0.07, h * 0.6, h * 0.14); }
    } else if (type === 'cloud') { // 雲紋 scrolls
      g.lineWidth = max(0.8, h * 0.12); g.lineCap = 'round';
      for (let x = x0; x < x1 + step * 2; x += step * 1.8) {
        g.beginPath(); g.arc(x, yc, h * 0.22, PI * 0.2, PI * 1.9); g.stroke();
        g.beginPath(); g.arc(x + step * 0.55, yc, h * 0.15, PI * 1.1, PI * 2.8); g.stroke();
      }
    } else if (type === 'wave') {
      g.lineWidth = max(0.8, h * 0.12);
      for (let r = 0; r < 2; r++) { g.beginPath(); for (let x = x0; x < x1 + step; x += 2) g.lineTo(x, yc + sin((x - x0) / step * TAU) * h * 0.18 + (r - 0.5) * h * 0.36); g.stroke(); }
    } else if (type === 'key') { // 回紋 meander
      g.lineWidth = max(0.8, h * 0.1);
      for (let x = x0; x < x1 + step; x += step) {
        const a = h * 0.32; g.beginPath(); g.moveTo(x - a, yc + a); g.lineTo(x - a, yc - a); g.lineTo(x + a, yc - a); g.lineTo(x + a, yc + a * 0.3); g.lineTo(x - a * 0.2, yc + a * 0.3); g.lineTo(x - a * 0.2, yc - a * 0.2); g.stroke();
      }
    } else {
      g.fillRect(x0, yc - h * 0.12, x1 - x0, h * 0.24);
    }
    g.restore();
  }
  function bandsAcross(g, x, y, w, h, list) { // horizontal bands: b.at (0 top .. 1 bottom of rect), b.h fraction
    for (const b of list || []) {
      const yy = y + h * b.at, bh = max(2, h * (b.h || 0.1));
      g.fillStyle = b.color; g.fillRect(x - 2, yy - bh / 2, w + 4, bh);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x - 2, yy + bh / 2 - max(1, bh * 0.12), w + 4, max(1, bh * 0.12));
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 2, yy - bh / 2, w + 4, max(1, bh * 0.1));
      if (b.acc) motif(g, x, x + w, yy, bh, b.acc, b.motif || 'diamond');
    }
  }
  // piping: a bordered stripe along a polyline in canvas px
  function piping(g, pts, col, wpx) {
    if (!pts.length) return;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.strokeStyle = shade(col, -0.45); g.lineWidth = wpx + max(1, wpx * 0.35); g.stroke();
    g.strokeStyle = col; g.lineWidth = wpx; g.stroke();
    g.strokeStyle = rgba(shade(col, 0.4), 0.5); g.lineWidth = max(0.6, wpx * 0.25); g.stroke();
    g.restore();
  }
  // 盤扣 frog knot button
  function knot(g, x, y, s, col) {
    g.save();
    g.strokeStyle = shade(col, -0.4); g.lineWidth = max(1, s * 0.5);
    g.beginPath(); g.moveTo(x - s * 1.6, y); g.lineTo(x + s * 1.6, y); g.stroke();
    g.strokeStyle = col; g.lineWidth = max(0.8, s * 0.32); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, s * 0.55, 0, TAU); g.fill();
    g.fillStyle = rgba('#ffffff', 0.35); g.beginPath(); g.arc(x - s * 0.15, y - s * 0.15, s * 0.22, 0, TAU); g.fill();
    g.restore();
  }
  // cloth base: colour + vertical light falloff + soft fold streaks + weave
  function cloth(g, x, y, w, h, col, o = {}) {
    g.fillStyle = col; g.fillRect(x - 2, y - 2, w + 4, h + 4);
    const R = rng(o.seed || col + w + h);
    if (o.folds !== false) {
      g.save();
      const n = o.nfolds || max(3, round(w / 18));
      for (let i = 0; i < n; i++) {
        const fx = x + R() * w, fw = (0.03 + R() * 0.06) * w;
        const gr = g.createLinearGradient(fx - fw, 0, fx + fw, 0);
        const dark = rgba(shadowOf(col, 0.35), 0.2 + R() * 0.12);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, dark); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        const top = o.foldTop != null ? y + h * o.foldTop : y + h * (0.2 + R() * 0.4);
        g.fillRect(fx - fw, top, fw * 2, y + h - top);
        if (R() < 0.5) { // light ridge beside the valley
          const gl = g.createLinearGradient(fx + fw * 0.6, 0, fx + fw * 2, 0);
          gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, rgba('#ffffff', 0.08)); gl.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gl; g.fillRect(fx + fw * 0.6, top, fw * 1.4, y + h - top);
        }
      }
      g.restore();
    }
    texture(g, x, y, w, h, o.weave || 'cotton', o.weaveK != null ? o.weaveK : 0.2, o.weaveScale || 1);
    if (o.stripes) {
      const n = o.stripes.n || 4; g.fillStyle = o.stripes.color;
      for (let i = 0; i < n; i++) { const sy = y + h * (i + 0.5) / n; g.fillRect(x - 2, sy - h * 0.025, w + 4, h * 0.05); }
    }
  }
  // vertical ambient occlusion (darken top/bottom edges), drawn last
  function aoEdges(g, x, y, w, h, top = 0.25, bot = 0.2, col = '#1a1426') {
    if (top > 0) { const gr = g.createLinearGradient(0, y, 0, y + h * 0.18); gr.addColorStop(0, rgba(col, top)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h * 0.18 + 2); }
    if (bot > 0) { const gr = g.createLinearGradient(0, y + h * 0.85, 0, y + h); gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, bot)); g.fillStyle = gr; g.fillRect(x - 2, y + h * 0.85, w + 4, h * 0.15 + 2); }
  }
  C.paint = { cloth, texture, motif, bandsAcross, piping, knot, aoEdges, vgrad, shade, mixc, rgba, shadowOf, weaveTile };

  // ================================================================================== materials
  // Character toon material = G.R3M.toon (2-band ramp + fresnel rim) + extra chain: painterly shadow tint, vertex AO,
  // optional ghost fresnel glow, per-instance opacity. One program shared by all characters.
  function charMat(opts = {}) {
    const THREE = TH();
    const m = G.R3M.toon({ color: 0xffffff, map: opts.map || null, rim: opts.rim != null ? opts.rim : 0.32, rimColor: opts.rimColor || 0xfff0e0, bands: 2 });
    if (opts.emissiveMap) { m.emissiveMap = opts.emissiveMap; m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = opts.emissiveIntensity || 1.6; }
    m.vertexColors = !!opts.vertexColors;
    m.side = opts.side != null ? opts.side : THREE.DoubleSide;
    const U = {
      uShadowTint: { value: new THREE.Color(opts.shadowTint || 0xb8a8d8) },
      uGhost: { value: 0 }, uGhostCol: { value: new THREE.Color(0xbfe0ff) }, uGlow: { value: new THREE.Color(0x000000) },
    };
    m.userData.u = U;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uShadowTint, uGhostCol, uGlow; uniform float uGhost;')
        .replace('#include <opaque_fragment>', `
          { // painterly shadow tint: where lighting falls below the albedo, push toward a cool/violet shadow colour
            float la = max(dot(diffuseColor.rgb, vec3(0.299,0.587,0.114)), 1e-3);
            float lo = dot(outgoingLight, vec3(0.299,0.587,0.114));
            float sh = 1.0 - smoothstep(0.45, 0.85, lo / la);
            outgoingLight = mix(outgoingLight, outgoingLight * uShadowTint * 1.12, sh * 0.6);
            outgoingLight += uGlow;
            if (uGhost > 0.0) {
              float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
              outgoingLight = mix(outgoingLight, outgoingLight * 0.7 + uGhostCol * 0.35, uGhost * 0.6);
              outgoingLight += uGhostCol * pow(fr, 2.0) * 1.2 * uGhost;
            }
          }
          #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'toonrim|char';
    return m;
  }
  C.charMat = charMat;

  // ================================================================================== export (filled in below)
  C._internal = { Geo, grid, tube, blob, Atlas, wmix, normW, vadd, vsub, vsc, vlen, vnorm, vcross, vdot, vlerp, spline, sstep, lerp, clamp, rng, hex2rgb, rgb2hex, shade, mixc, rgba, lum, shadowOf, normalize };
  return C;
})();

// ==================================================================================================== RIG + BODY + GARMENTS
(() => {
  const C = G.Char3D, I = C._internal;
  const { Geo, grid, tube, blob, Atlas, wmix, vadd, vsub, vsc, vlen, vnorm, vcross, vdot, vlerp, spline, sstep, lerp, clamp, rng, shade, mixc, rgba, lum, shadowOf } = I;
  const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
  const { sin, cos, abs, min, max, sqrt, hypot, atan2, pow, exp, floor, round } = Math;
  const Pn = C.paint;
  const PX = 0.0185; // one 2D sprite px (map scale) ≈ 1.85 cm — used to read widths from the 2D spec

  // ------------------------------------------------------------------------------------------ builder
  class Builder {
    constructor(id, spec, opts = {}) {
      this.id = id; this.S = spec; this.P = C.bodyProps(spec); this.opts = opts;
      this.hero = !!opts.hero;
      this.bones = []; this.bi = {};
      this.G = new Geo(); this.HG = new Geo(); this.FX = new Geo();
      this.atlas = new Atlas(opts.atlas || (this.hero ? 1024 : 512));
      this.chains = []; this.colliders = []; this.lights = []; this.propBones = {}; this.sockets = {};
      this.rects = {}; this.flags = {};
      this.R = rng(id);
      this.cover = { armTo: 0, legTo: 1 }; // what skin stays visible (filled by garments)
    }
    bone(name, parent, pos) {
      const i = this.bones.length;
      this.bones.push({ name, parent: parent == null ? -1 : (typeof parent === 'string' ? this.bi[parent] : parent), pos: pos.slice() });
      this.bi[name] = i;
      return i;
    }
    b(n) { const i = this.bi[n]; if (i == null) throw new Error('no bone ' + n); return i; }
    pos(n) { return this.bones[this.b(n)].pos; }
    rect(key, wm, hm, paint, o) { if (this.rects[key] != null) return this.rects[key]; return (this.rects[key] = this.atlas.add(wm, hm, paint, o)); }
    // spring chain through points (absolute bind positions); returns bone indices
    chain(name, parent, pts, cfg = {}) {
      const ids = [];
      let par = parent;
      for (let i = 0; i < pts.length - 1; i++) { const id = this.bone(name + i, par, pts[i]); ids.push(id); par = id; }
      this.chains.push(Object.assign({ name, bones: ids, tail: pts[pts.length - 1].slice(), stiff: 1.4, drag: 0.35, grav: 0.6, r: 0.02, groups: ['body'] }, cfg));
      return ids;
    }
    collider(bone, off, r, group = 'body', off2 = null) { this.colliders.push({ bone: this.b(bone), off, off2, r, group }); }
  }
  C.Builder = Builder;

  // ------------------------------------------------------------------------------------------ skeleton
  function rig(B) {
    const P = B.P, s = P.s;
    B.bone('root', null, [0, 0, 0]);
    B.bone('hips', 'root', [0, P.hipsY, 0]);
    B.bone('spine', 'hips', [0, P.spineY, -0.005]);
    B.bone('chest', 'spine', [0, P.chestY, -0.01]);
    B.bone('neck', 'chest', [0, P.neckY, -0.012]);
    B.bone('head', 'neck', [0, P.headY, -0.008]);
    for (const [S, sg] of [['L', 1], ['R', -1]]) {
      B.bone('shoulder' + S, 'chest', [sg * 0.035 * s, P.shoulderY + 0.005, -0.01]);
      B.bone('upperArm' + S, 'shoulder' + S, [sg * P.shJ[0], P.shJ[1], P.shJ[2]]);
      B.bone('foreArm' + S, 'upperArm' + S, [sg * P.elbow[0], P.elbow[1], P.elbow[2]]);
      B.bone('hand' + S, 'foreArm' + S, [sg * P.wrist[0], P.wrist[1], P.wrist[2]]);
      B.bone('thigh' + S, 'hips', [sg * P.hipSep, P.legTop, 0]);
      B.bone('shin' + S, 'thigh' + S, [sg * P.hipSep, P.kneeY, 0.004]);
      B.bone('foot' + S, 'shin' + S, [sg * P.hipSep, P.ankleY, 0]);
      B.bone('toe' + S, 'foot' + S, [sg * P.hipSep, 0.02 * s, P.foot * 0.56 - 0.055 * s]);
      // prop sockets: grip in the fist (object axis = local +z), field held item & battle weapon separately so either
      // can be collapsed (bone scale 0) without touching the mesh
      const g = gripPoint(P, sg);
      B.bone('grip' + S, 'hand' + S, g);
      B.bone('held' + S, 'grip' + S, g);
      B.bone('weap' + S, 'grip' + S, g);
    }
    B.bone('back', 'chest', [0, P.chestY + 0.02, -(P.chestB + 0.06)]);
    B.bone('backWeap', 'back', [0, P.chestY + 0.02, -(P.chestB + 0.06)]);
    B.bone('hipL2', 'hips', [P.hipW + 0.03, P.legTop + 0.06, 0.01]);
    B.bone('hipR2', 'hips', [-(P.hipW + 0.03), P.legTop + 0.06, 0.01]);
    // body colliders for springs
    const sc = P.s;
    B.collider('head', [0, P.headC[1] - P.headY + 0.01, 0.0], P.headW * 0.56, 'head');
    B.collider('chest', [0, -0.02 * sc, 0.0], P.chestW * 0.95, 'body');
    B.collider('spine', [0, 0.0, 0.0], P.waistW * 1.0, 'body');
    B.collider('hips', [0, -0.02 * sc, 0], P.hipW * 0.95, 'body');
    for (const [S, sg] of [['L', 1], ['R', -1]]) {
      B.collider('upperArm' + S, [0, -0.02, 0], P.armR * 1.4, 'body', vsub(B.pos('foreArm' + S), B.pos('upperArm' + S)));
      B.collider('thigh' + S, [0, -0.02, 0.0], P.thighR * 1.05, 'leg', vsub(B.pos('shin' + S), B.pos('thigh' + S)));
      B.collider('shin' + S, [0, 0, 0], P.calfR * 1.05, 'leg', vsub(B.pos('foot' + S), B.pos('shin' + S)));
      B.collider('shoulder' + S, vsub(vadd(B.pos('upperArm' + S), [0, 0.02, 0]), B.pos('shoulder' + S)), P.armR * 1.5, 'body');
    }
  }
  function gripPoint(P, sg) {
    const d = P.armDir;
    const w = P.wrist;
    return [sg * (w[0] + d[0] * P.hand * 0.42) - sg * 0.004, w[1] + d[1] * P.hand * 0.42, w[2] + 0.012];
  }
  C.rig = rig;

  // ------------------------------------------------------------------------------------------ torso shape
  // Control rings top→bottom. Each: y, rx (half width), rf (front depth), rb (back depth), drop (shoulder slope).
  function torsoRings(P) {
    const s = P.s;
    return [
      { y: P.neckY + 0.012 * s, rx: P.neckR * 1.08, rf: P.neckR * 1.02, rb: P.neckR * 1.1, drop: 0 },
      { y: P.shoulderY + 0.016 * s, rx: P.sh * 0.92, rf: P.chestF * 0.68, rb: P.chestB * 0.8, drop: 0.04 * s, sq: 2.0 },
      { y: P.shoulderY - 0.045 * s, rx: P.sh * 0.98, rf: P.chestF * 0.9 + P.bust * 0.01, rb: P.chestB * 0.94, drop: 0.01 * s, sq: 2.1 },
      { y: P.chestY + 0.015 * s, rx: P.chestW * 1.03, rf: P.chestF + P.bust * 0.024, rb: P.chestB, drop: 0 },
      { y: P.chestY - 0.07 * s, rx: P.chestW * 0.96, rf: P.chestF * 0.96 + P.bust * 0.012 + P.belly * 0.01, rb: P.chestB * 0.95, drop: 0 },
      { y: P.waistY, rx: P.waistW, rf: P.waistF + P.belly * 0.035, rb: P.waistB, drop: 0 },
      { y: P.legTop + 0.06 * s, rx: P.hipW, rf: P.hipF + P.belly * 0.02, rb: P.hipB, drop: 0 },
      { y: P.legTop - 0.02 * s, rx: P.hipW * 0.94, rf: P.hipF * 0.85, rb: P.hipB * 0.92, drop: 0 },
      { y: P.legTop - 0.07 * s, rx: P.hipW * 0.5, rf: P.hipF * 0.45, rb: P.hipB * 0.5, drop: 0 },
    ];
  }
  // ring params at height y (monotone between rings)
  function ringAt(R, y) {
    const ys = R.map((r) => -r.y);
    const t = -y;
    const out = {};
    for (const k of ['rx', 'rf', 'rb', 'drop']) out[k] = spline(ys, R.map((r) => r[k]), t);
    out.sq = spline(ys, R.map((r) => r.sq || SQ), t);
    out.y = y;
    return out;
  }
  // point on the torso surface at height y, angle th (0 = front, +π/2 = +x / character's left)
  const SQ = 2.35;
  function torsoPt(r, th, inflate = 0, yOff = 0) {
    const s = sin(th), c = cos(th);
    const ex = 2 / (r.sq || SQ);
    const xs = Math.sign(s) * pow(abs(s), ex), zs = Math.sign(c) * pow(abs(c), ex);
    const rz = c >= 0 ? r.rf : r.rb;
    const x = xs * (r.rx + inflate), z = zs * (rz + inflate);
    const y = r.y + yOff - r.drop * s * s;
    return [x, y, z];
  }
  C.torsoRings = torsoRings; C.ringAt = ringAt; C.torsoPt = torsoPt;

  // torso skin weights by height (and shoulder blend toward the arms)
  function torsoW(B, p) {
    const P = B.P, y = p[1], x = p[0];
    const c = [[(P.hipsY + P.spineY) * 0.5 - 0.03 * P.s, 'hips'], [(P.spineY + P.chestY) * 0.5, 'spine'], [(P.chestY + P.neckY) * 0.5, 'chest'], [P.neckY + 0.02 * P.s, 'neck']];
    let W;
    if (y <= c[0][0]) W = [[B.b('hips'), 1]];
    else if (y >= c[3][0]) W = [[B.b('neck'), 1]];
    else {
      let i = 0; while (i < 2 && y > c[i + 1][0]) i++;
      const t = sstep(0, 1, (y - c[i][0]) / (c[i + 1][0] - c[i][0]));
      W = [[B.b(c[i][1]), 1 - t], [B.b(c[i + 1][1]), t]];
    }
    // neck ring: mostly chest so the collar does not twist with the head
    if (y > P.neckY - 0.01) W = wmix(W, [[B.b('chest'), 1]], 0.45);
    const S = x >= 0 ? 'L' : 'R';
    const ta = sstep(P.sh * 0.5, P.sh * 1.05, abs(x)) * sstep(P.chestY - 0.03 * P.s, P.shoulderY - 0.03 * P.s, y);
    if (ta > 0) W = wmix(W, [[B.b('shoulder' + S), 0.55], [B.b('upperArm' + S), 0.45]], ta * 0.85);
    return W;
  }

  // ------------------------------------------------------------------------------------------ paint: skin
  function skinRect(B) {
    const sk = B.S.skin;
    return B.rect('skin', 0.5, 0.5, (g, x, y, w, h) => {
      g.fillStyle = sk; g.fillRect(x - 2, y - 2, w + 4, h + 4);
      Pn.texture(g, x, y, w, h, 'plain', 0.05);
    });
  }
  function handRect(B) {
    const sk = B.S.skin;
    return B.rect('hand', 0.14, 0.14, (g, x, y, w, h) => {
      g.fillStyle = sk; g.fillRect(x - 2, y - 2, w + 4, h + 4);
      // nails / knuckle accents (subtle): darker at the finger end
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba(sk, 0)); gr.addColorStop(1, rgba(shade(sk, -0.18), 0.6));
      g.fillStyle = gr; g.fillRect(x, y, w, h);
    }, { minPx: 8 });
  }

  // ------------------------------------------------------------------------------------------ body parts
  function buildTorsoSkin(B, yTop, yBot) {
    const P = B.P, R = torsoRings(P), rect = skinRect(B);
    const nu = 20, nv = 14;
    grid(B.G, nu, nv, rect, (u, v) => {
      const y = lerp(yTop, yBot, v);
      const r = ringAt(R, y), th = (u - 0.5) * TAU;
      const p = torsoPt(r, th);
      // pecs / shoulder blades hint
      return { p, w: torsoW(B, p), ao: 1 - 0.25 * sstep(0.7, 1, v) };
    }, { closed: true });
  }
  function buildNeck(B) {
    const P = B.P, s = P.s, rect = skinRect(B);
    const a = [0, P.neckY - 0.03 * s, -0.008], b = [0, P.headY + 0.03 * s, -0.012];
    tube(B.G, [a, b], 10, rect, (t) => ({ rx: P.neckR * (1.02 - 0.06 * t), ry: P.neckR * (0.98 - 0.05 * t), ao: 0.85 + 0.15 * t }),
      (t) => wmix([[B.b('neck'), 1]], [[B.b('head'), 1]], sstep(0.55, 1, t)), { nv: 4, up: [0, 0, 1] });
  }
  // arm skin from fraction s0 (0 = shoulder, 1 = wrist)
  function armProfile(P, t) {
    const e = P.upArm / (P.upArm + P.foreArm);
    const ks = [0, 0.12, e * 0.6, e, e + (1 - e) * 0.3, 1];
    const vs = [P.armR * 1.12, P.armR * 1.04, P.armR * 0.92, P.elbowR, P.foreR, P.wristR];
    return spline(ks, vs, t);
  }
  function armPts(B, S) {
    return [B.pos('upperArm' + S), B.pos('foreArm' + S), B.pos('hand' + S)];
  }
  function armW(B, S, t) {
    const P = B.P, e = P.upArm / (P.upArm + P.foreArm);
    const k = sstep(e - 0.07, e + 0.07, t);
    let W = [[B.b('upperArm' + S), 1 - k], [B.b('foreArm' + S), k]];
    if (t > 0.94) W = wmix(W, [[B.b('hand' + S), 1]], sstep(0.94, 1.02, t) * 0.35);
    return W;
  }
  function buildArmSkin(B, S, t0) {
    const P = B.P, rect = skinRect(B);
    const pts = armPts(B, S);
    const a = pts[0], w = pts[2];
    const st = vlerp(a, w, 0), L = P.upArm + P.foreArm;
    const sub = (t) => { // position at fraction along the 2-segment arm (bind: straight line)
      return vlerp(a, w, t);
    };
    const p0 = sub(t0), p1 = sub(1.0 + 0.02);
    const nv = max(2, round((1 - t0) * 10));
    const sg = S === 'L' ? 1 : -1;
    tube(B.G, [p0, vlerp(p0, p1, 0.5), p1], 9, rect, (t) => {
      const tt = lerp(t0, 1.02, t);
      return { rx: armProfile(P, min(1, tt)), ry: armProfile(P, min(1, tt)) * 0.92 };
    }, (t) => armW(B, S, lerp(t0, 1.02, t)), { nv, linear: true, up: [0, 0, 1], capStart: t0 > 0.05 });
  }
  // stylised hand (relaxed or fist) in the hand bone frame
  function buildHand(B, S, fist) {
    const P = B.P, rect = handRect(B), sg = S === 'L' ? 1 : -1;
    const w = B.pos('hand' + S);
    const a = [sg * P.armDir[0], P.armDir[1], 0];              // along fingers (down/out)
    const n = vnorm([-sg * cos(P.armOut), -sg * sin(P.armOut) * 0, 0]); // palm normal (toward body)
    const f = [0, 0, 1];                                        // thumb side
    const k = P.palm * P.s;
    const W = [[B.b('hand' + S), 1]];
    const place = (o, rad, deform) => {
      const c = vadd(w, vadd(vadd(vsc(a, o[0] * k), vsc(n, o[1] * k)), vsc(f, o[2] * k)));
      blob(B.G, 10, 7, rect, c, [1, 1, 1], W, {
        deform: (q) => {
          let p = vadd(vadd(vsc(a, q[1] * rad[0] * k), vsc(n, q[0] * rad[1] * k)), vsc(f, q[2] * rad[2] * k));
          if (deform) p = deform(p, q);
          return p;
        },
        uvf: (u, v) => [u, v],
      });
    };
    if (fist) {
      place([0.05, 0.0, 0.002], [0.042, 0.022, 0.04]);           // palm
      place([0.082, 0.02, 0.004], [0.026, 0.026, 0.038]);        // curled fingers (knuckle roll)
      place([0.05, 0.022, 0.034], [0.022, 0.014, 0.014]);        // thumb over fingers
    } else {
      place([0.045, 0.0, 0.0], [0.04, 0.017, 0.037]);            // palm
      place([0.098, 0.006, -0.002], [0.04, 0.0145, 0.034], (p, q) => vadd(p, vsc(n, (q[1] + 1) * 0.004 * k))); // fingers, slight curl
      place([0.04, 0.012, 0.036], [0.03, 0.012, 0.012]);          // thumb
    }
  }
  function legProfile(P, t) { // t from hip joint (0) to ankle (1)
    const k = (P.legTop - P.kneeY) / (P.legTop - P.ankleY);
    const ks = [0, 0.15, k * 0.75, k, k + (1 - k) * 0.28, 0.82, 1];
    const vs = [P.thighR * 1.08, P.thighR, P.thighR * 0.8, P.kneeR, P.calfR, P.ankleR * 1.15, P.ankleR];
    return spline(ks, vs, t);
  }
  function legW(B, S, t) {
    const P = B.P, k = (P.legTop - P.kneeY) / (P.legTop - P.ankleY);
    const kk = sstep(k - 0.06, k + 0.05, t);
    let W = [[B.b('thigh' + S), 1 - kk], [B.b('shin' + S), kk]];
    if (t < 0.12) W = wmix([[B.b('hips'), 1]], W, sstep(-0.05, 0.12, t) * 0.7 + 0.3);
    if (t > 0.94) W = wmix(W, [[B.b('foot' + S), 1]], sstep(0.94, 1.03, t));
    return W;
  }
  function legPt(B, S, t) {
    const a = B.pos('thigh' + S), k = B.pos('shin' + S), f = B.pos('foot' + S);
    const P = B.P, kt = (P.legTop - P.kneeY) / (P.legTop - P.ankleY);
    return t < kt ? vlerp(a, k, t / kt) : vlerp(k, f, (t - kt) / (1 - kt));
  }
  function buildLegSkin(B, S, t0, t1 = 1.0) {
    const P = B.P, rect = skinRect(B);
    const n = 6;
    const pts = []; for (let i = 0; i <= n; i++) pts.push(legPt(B, S, lerp(t0, t1, i / n)));
    pts[0] = vadd(pts[0], [0, t0 < 0.02 ? 0.05 : 0, 0]);
    tube(B.G, pts, 10, rect, (t) => {
      const tt = lerp(t0, t1, t);
      const r = legProfile(P, tt);
      return { rx: r, ry: r * 1.05, oy: tt > 0.55 && tt < 0.85 ? -r * 0.12 * sin((tt - 0.55) / 0.3 * PI) : 0 };
    }, (t) => legW(B, S, lerp(t0, t1, t)), { nv: n * 2, up: [0, 0, 1], capStart: t0 > 0.05 });
  }
  // foot / shoe loft along +z in the foot frame
  function footShape(P, t, kind) { // t 0 heel → 1 toe : [halfWidth, height, yCenter]
    const s = P.s, fw = P.footW;
    const w = spline([0, 0.15, 0.55, 0.85, 1], [fw * 0.72, fw * 0.88, fw * 1.0, fw * 0.9, fw * 0.45], t);
    const top = spline([0, 0.18, 0.4, 0.7, 1], [0.08 * s, 0.085 * s, 0.06 * s, 0.035 * s, 0.022 * s], t);
    return [w, top];
  }
  function buildFoot(B, S, kind, col, rect) {
    const P = B.P, s = P.s, sg = S === 'L' ? 1 : -1;
    const f = B.pos('foot' + S);
    const heel = -0.06 * s, toe = P.foot - 0.06 * s;
    const ball = B.pos('toe' + S)[2];
    const infl = kind === 'bare' || kind === 'sandal' ? 0 : kind === 'boots' ? 0.009 : 0.006;
    const nu = 14, nv = 10;
    grid(B.G, nu, nv, rect, (u, v) => {
      const z = lerp(heel, toe, v);
      const [w, top] = footShape(P, v, kind);
      const th = (u - 0.5) * TAU; // around the foot axis (z): 0 = top
      const cx = sin(th), cy = cos(th);
      // flat sole: squash the lower half
      const yy = cy >= 0 ? cy * (top + infl) : cy * (0.012 * s + infl * 0.5) ;
      const x = sg * 0.004 + cx * (w + infl) * (cy < 0 ? 1 : 1 - 0.15 * cy * cy);
      const y = max(0.0015, 0.012 * s + yy + (v < 0.3 ? 0.0 : 0));
      const zz = z + (v === 0 ? 0 : 0);
      const p = [f[0] + x, y, zz + (v < 0.02 ? 0 : 0)];
      const wt = sstep(ball - 0.03, ball + 0.02, zz);
      return { p, w: [[B.b('foot' + S), 1 - wt], [B.b('toe' + S), wt]], ao: cy < -0.3 ? 0.7 : 1 };
    }, { closed: true, flip: true });
    // close the heel & toe ends visually by pinching (the grid ends are tiny rings)
  }

  // ------------------------------------------------------------------------------------------ garment helpers
  function clothRect(B, key, wm, hm, col, o = {}) {
    return B.rect(key, wm, hm, (g, x, y, w, h, d) => {
      Pn.cloth(g, x, y, w, h, col, o);
      if (o.after) o.after(g, x, y, w, h, d);
    }, o.ro);
  }
  const fabricOf = (col, hint) => hint || (lum(col) > 0.7 ? 'linen' : 'cotton');

  // Lower garment shell (robe/jacket hem, skirt, apron, cape) with spring chains + leg colliders.
  // o: { yTop, yHem, inflate, flare, th0, th1 (arc; full ring if omitted), chains, segs, top(θ) → [x,y,z] override,
  //      rect, weights(θ,t) override, stiff, grav, nu, nv, hemWave(θ)->dy }
  function hemShell(B, o) {
    const P = B.P, s = P.s, R = torsoRings(P);
    const full = o.th0 == null;
    const th0 = full ? -PI : o.th0, th1 = full ? PI : o.th1;
    const yTop = o.yTop, yHem = max(0.03, o.yHem);
    const len = yTop - yHem;
    const nu = o.nu || (full ? 28 : 14), nv = o.nv || max(4, round(len / 0.07));
    const segs = o.segs || clamp(round(len / 0.22), 1, 4);
    const nCh = o.chains || (full ? 8 : 3);
    const legR = o.noClear ? P.thighR : (B.flags.legR || P.thighR * 1.15); // outer radius of the (trousered) legs
    const legClear = P.hipSep + legR + 0.03 * s;
    const flare = o.flare != null ? o.flare : 0.25;
    const infl = o.inflate || 0.02;
    // rest surface point at (θ, t)
    const topPt = (th) => (o.top ? o.top(th) : torsoPt(ringAt(R, yTop), th, infl));
    const surf = o.surf || ((th, t) => {
      const a = topPt(th);
      const rTopX = a[0], rTopZ = a[2];
      // hem radius: flared and never inside the legs' swing volume
      const hx = Math.sign(sin(th)) * max(abs(rTopX) * (1 + flare * 0.9), abs(sin(th)) * legClear) ;
      const hz = Math.sign(cos(th)) * max(abs(rTopZ) * (1 + flare * 1.1) + flare * 0.05 * s, abs(cos(th)) * max((0.12 + flare * 0.08) * s, legR + 0.05 * s) * (cos(th) > 0 ? 1.15 : 1.0));
      const e = pow(t, o.curve || 0.85);
      const x = lerp(rTopX, hx, e), z = lerp(rTopZ, hz, e);
      let y = lerp(a[1], yHem, t);
      if (o.hemWave && t > 0.98) y += o.hemWave(th);
      return [x, y, z];
    });
    // chains at evenly spaced angles
    const chs = [];
    for (let k = 0; k < nCh; k++) {
      const th = full ? (k / nCh) * TAU - PI + PI / nCh * 0 : lerp(th0, th1, (k + 0.5) / nCh);
      const pts = [];
      for (let i = 0; i <= segs; i++) pts.push(surf(th, i / segs));
      const ids = B.chain((o.name || 'hem') + k + '_', o.parent || 'hips', pts, {
        stiff: o.stiff != null ? o.stiff : 2.2, drag: o.drag != null ? o.drag : 0.45, grav: o.grav != null ? o.grav : 0.35, r: o.hitR || 0.03 * s,
        groups: o.groups || ['leg', 'body'], kind: 'cloth', rest: o.restBias,
      });
      chs.push({ th, ids });
    }
    const chW = (th, t) => {
      // angular blend between nearest chains
      let k0 = 0, k1 = 0, f = 0;
      if (full) {
        const pos = ((th + PI) / TAU) * nCh; // chain k at angle k/nCh*TAU - PI
        k0 = floor(pos) % nCh; k1 = (k0 + 1) % nCh; f = pos - floor(pos);
      } else {
        const pos = clamp((th - th0) / (th1 - th0) * nCh - 0.5, 0, nCh - 1);
        k0 = floor(pos); k1 = min(nCh - 1, k0 + 1); f = pos - k0;
      }
      f = sstep(0, 1, f);
      const seg = clamp(t * segs, 0, segs - 1e-4), si = floor(seg), sf = seg - si;
      const along = (k) => {
        const ids = chs[k].ids;
        const W = [[ids[si], 1 - sstep(0.6, 1, sf) * 0.5]];
        if (si + 1 < ids.length) W.push([ids[si + 1], sstep(0.6, 1, sf) * 0.5]);
        return W;
      };
      let W = wmix(along(k0), along(k1), f);
      const lb = o.legBlend != null ? o.legBlend : 0;
      if (lb > 0) {
        const y = lerp(yTop, yHem, t);
        const tl = clamp((P.legTop - y) / (P.legTop - P.ankleY), 0, 1);
        const fside = sstep(0.2, 0.8, 0.5 + 0.5 * sin(th));
        const legMix = wmix(legW(B, 'R', tl), legW(B, 'L', tl), fside);
        W = wmix(W, legMix, lb * sstep(0.06, 0.45, t) * (0.6 + 0.4 * abs(cos(th))));
      }
      const topT = 1 - sstep(0.0, o.rigidTop || 0.12, t);
      if (topT > 0) W = wmix(W, o.topW ? o.topW(th) : [[B.b(o.parent || 'hips'), 1]], topT);
      return W;
    };
    const rect = o.rect;
    grid(B.G, nu, nv, rect, (u, v) => {
      const th = lerp(th0, th1, u);
      const p = surf(th, v);
      return { p, w: chW(th, v), ao: o.ao ? o.ao(th, v) : (1 - 0.18 * sstep(0.85, 1, v)) };
    }, { closed: full, uvf: o.uvf });
    return { chs, surf };
  }
  C.hemShell = hemShell;

  // Upper garment shell over the torso between yEdge(θ) and yBot.
  function torsoShell(B, o) {
    const P = B.P, R = torsoRings(P);
    const nu = o.nu || 28, nv = o.nv || 14;
    const infl = o.inflate || 0.014;
    const loose = o.loose || 0;
    const chestR = ringAt(R, P.chestY - 0.03 * P.s);
    grid(B.G, nu, nv, o.rect, (u, v) => {
      const th = (u - 0.5) * TAU;
      const yE = o.edge ? o.edge(th) : o.yTop;
      const y = lerp(yE, o.yBot, v);
      let r = ringAt(R, y);
      if (loose > 0 && y < chestR.y) { // garment hangs from the chest instead of hugging the waist
        r = Object.assign({}, r, { rx: lerp(r.rx, max(r.rx, chestR.rx * 0.98), loose), rf: lerp(r.rf, max(r.rf, chestR.rf * 0.98), loose), rb: lerp(r.rb, max(r.rb, chestR.rb), loose) });
      }
      const p = torsoPt(r, th, infl * (o.inflK ? o.inflK(y) : 1));
      return { p, w: o.weights ? o.weights(p, th, v) : torsoW(B, p), ao: o.ao ? o.ao(th, v, y) : 1 };
    }, { closed: true, uvf: o.uvf });
  }
  C.torsoShell = torsoShell;

  // sleeve tube along the arm. o: { t1 (end fraction), r0, r1, cuffR, flare, drape (0..1), rect, roll }
  function sleeve(B, S, o) {
    const P = B.P, s = P.s;
    const pts = armPts(B, S);
    const a = vadd(pts[0], [S === 'L' ? -0.012 * s : 0.012 * s, 0.004 * s, 0]), w = pts[2];
    const L = P.upArm + P.foreArm;
    const ext = o.ext || 0;
    const end = vadd(w, vsc(vnorm(vsub(w, a)), ext));
    const t1 = o.t1;
    const tip = t1 >= 1 ? end : vlerp(a, w, t1);
    const n = 8;
    const poly = []; for (let i = 0; i <= n; i++) poly.push(vlerp(a, tip, i / n));
    // drape spring bone for wide / flowing sleeves
    let drapeIds = null;
    const hang = o.hang || 0; // banner sleeves: the back of the sleeve hangs as a deep panel below a raised forearm
    if (o.drape > 0) {
      const e = P.upArm / L;
      const head = vlerp(pts[1], pts[2], hang ? 0.15 : 0.35);
      const dirArm = vnorm(vsub(w, a));
      const t2 = vadd(end, vadd(vsc(dirArm, 0.02), [0, -o.drape * 0.06 * s, -hang * 0.6]));
      drapeIds = B.chain('sleeve' + S, 'foreArm' + S, [head, vlerp(head, t2, 0.55), t2], { stiff: hang ? 0.7 : 1.2, drag: 0.4, grav: hang ? 1.3 : 0.9, r: 0.03 * s, groups: ['leg', 'body'], kind: 'sleeve' });
    }
    const e = P.upArm / L;
    const hangK = (t) => hang * sstep(0.3, 0.95, t);
    tube(B.G, poly, o.seg || 12, o.rect, (t) => {
      const tt = t * t1 * (1 + ext / L);
      let r = lerp(armProfile(P, min(1, tt)) + (o.r0 || 0.016) * s, o.r1 != null ? o.r1 : 0, sstep(0.2, 1, t) * (o.flare || 0));
      if (t < 0.16) r *= lerp(0.45, 1, sstep(0.0, 0.16, t));
      if (o.cuffR && t > 0.6) r = lerp(r, o.cuffR, sstep(0.6, 1, t) * (o.flare ? 1 : 0.6));
      if (o.roll && t > 0.88) r += o.roll * sin((t - 0.88) / 0.12 * PI) * s;
      const hk = hangK(t);
      return { rx: r, ry: r * (o.flat || 0.96) + hk * 0.5, oy: (o.drape ? -o.drape * r * 0.25 * sstep(0.4, 1, t) : 0) - hk * 0.5, ao: t > 0.97 ? 0.6 : 1 };
    }, (t, fi, ang) => {
      const tt = t * t1;
      let W = armW(B, S, min(1, tt));
      if (t < 0.12) W = wmix(torsoW(B, vlerp(a, tip, t)), W, sstep(0.0, 0.12, t) * 0.6 + 0.4);
      if (drapeIds) {
        let k = sstep(0.62, 1, t) * o.drape;
        if (hang) k = max(k, sstep(0.25, 0.9, t) * sstep(0.2, -0.9, sin(ang || 0)) * 0.95); // back panel rides the drape chain
        W = wmix(W, [[drapeIds[t > 0.85 || (hang && sin(ang || 0) < -0.5 && t > 0.6) ? 1 : 0], 1]], k);
      }
      return W;
    }, { nv: o.nv || 10, linear: true, up: [0, 0, 1], uvf: (u, v) => [u, v] });
    return tip;
  }
  C.sleeve = sleeve;

  // ------------------------------------------------------------------------------------------ jacket / robe painter
  // Rect layout for upper garments: u = angle (0 back-left … 0.5 front … 1), v = 0 top edge … 1 hem.
  function paintJacket(B, top, o) {
    return (g, x, y, w, h, d) => {
      const col = top.color, trim = top.trim || shade(col, -0.35), inner = top.inner || shade(col, 0.5);
      Pn.cloth(g, x, y, w, h, col, { weave: o.weave || fabricOf(col), seed: B.id + o.key, foldTop: o.foldTop, nfolds: o.nfolds });
      const U = (th) => x + (th / TAU + 0.5) * w;               // angle → px
      const V = (yy, th = 0) => { const yE = o.edge ? o.edge(th) : o.yTop; return y + (yE - yy) / (yE - o.yBot) * h; };
      const pipeW = max(1.5, d * 0.012);
      // kasaya: a diagonal panel over the left shoulder (monks)
      if (B.S.kasaya) {
        g.save(); g.fillStyle = B.S.kasaya.color;
        g.beginPath(); g.moveTo(U(0.9), y); g.lineTo(U(2.2), y); g.lineTo(U(-0.9), y + h * 0.85); g.lineTo(U(-1.6), y + h * 0.7); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(U(2.0), y); g.lineTo(U(3.2), y); g.lineTo(U(3.2), y + h * 0.5); g.lineTo(U(-2.9), y + h * 0.9); g.lineTo(U(-2.0), y + h * 0.55); g.closePath(); g.fill();
        g.strokeStyle = shade(B.S.kasaya.color, -0.3); g.lineWidth = pipeW * 0.6;
        for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(U(-1.2 + i * 0.18), y + h * 0.1); g.lineTo(U(-1.2 + i * 0.18 - 0.6), y + h * 0.8); g.stroke(); }
        Pn.texture(g, x, y, w, h, 'linen', 0.1);
        g.restore();
      }
      // bands (embroidered / woven) at world heights given as fractions of the garment
      if (top.bands) Pn.bandsAcross(g, x, y, w, h, top.bands);
      if (top.lowBands) Pn.bandsAcross(g, x, y, w, h, top.lowBands);
      if (top.stripes && typeof top.stripes === 'object') { const n = top.stripes.n || 4; g.fillStyle = top.stripes.color; for (let i = 0; i < n; i++) g.fillRect(x, y + h * (0.25 + 0.6 * i / n), w, h * 0.04); }
      if (top.stripes && typeof top.stripes === 'string') { g.fillStyle = top.stripes; for (let i = 0; i < 8; i++) g.fillRect(x + w * i / 8, y, w * 0.035, h); }
      // embroidery border along the hem
      if (top.emb) { const hy = y + h * 0.94; g.fillStyle = rgba(shade(top.emb, -0.2), 0.25); g.fillRect(x, hy - h * 0.035, w, h * 0.07); Pn.motif(g, x, x + w, hy, h * 0.06, top.emb, o.long ? 'cloud' : 'key'); }
      // hem piping
      g.fillStyle = trim; g.fillRect(x - 2, y + h - max(2, h * 0.018), w + 4, max(2, h * 0.018) + 2);
      if (top.hemBand) { g.fillStyle = top.hemBand.color || trim; g.fillRect(x - 2, y + h * (1 - (top.hemBand.h || 0.05)), w + 4, h * (top.hemBand.h || 0.05)); }
      // side slits (開衩): piped edges at the sides and the centre-back vent
      if (o.slitY != null) {
        const sy = V(o.slitY);
        for (const th of [-PI / 2, PI / 2]) Pn.piping(g, [[U(th), sy], [U(th), y + h]], trim, pipeW * 1.6);
        g.fillStyle = trim; g.fillRect(x - 1, sy, pipeW * 1.2, y + h - sy); g.fillRect(x + w - pipeW * 1.2 + 1, sy, pipeW * 1.2, y + h - sy);
        if (top.toggles) for (const th of [-PI / 2, PI / 2]) for (const k of [0.15, 0.4]) Pn.knot(g, U(th), lerp(sy, y + h, k), pipeW * 1.1, top.toggles);
      }
      const cl = top.closure;
      const yNeck = V(B.P.neckY), yArm = V(B.P.chestY + 0.02 * B.P.s), yWaist = V(B.P.waistY);
      if (cl === 'cross' || cl === 'open') {
        // lapel band following the V edge, plus the overlapping panel edge down to the wearer's right.
        // top.lapel = { w (m), guard: '#hex' (護領 guard collar laid over the upper lapel), guardLen 0..1 } widens it.
        const lp = top.lapel;
        g.fillStyle = trim;
        const bw = lp ? max(4, d * (lp.w || 0.03)) : max(3, d * 0.028);
        g.beginPath();
        for (let i = 0; i <= 40; i++) { const th = -PI + TAU * i / 40; const yy = y + 0; g.rect(U(th) - 1, yy, w / 40 + 2, bw); }
        g.fill();
        if (cl === 'cross') {
          const tipTh = o.tipTh || -0.18, tipY = V(o.tipY, tipTh);
          const lpts = [[U(tipTh), tipY], [U(-0.55), lerp(tipY, yWaist, 0.55)], [U(-0.95), yWaist + h * 0.03], [U(-1.05), y + h]];
          Pn.piping(g, lpts, trim, bw * (lp ? 1.0 : 0.8));
          if (lp && lp.guard) { // white guard collar over the neckline and the upper part of the crossing edge
            g.fillStyle = lp.guard;
            g.beginPath(); for (let i = 0; i <= 40; i++) { const th = -PI + TAU * i / 40; g.rect(U(th) - 1, y, w / 40 + 2, bw * 0.72); } g.fill();
            const gl = lp.guardLen != null ? lp.guardLen : 0.45;
            Pn.piping(g, [lpts[0], [lerp(lpts[0][0], lpts[1][0], min(1, gl * 1.8)), lerp(lpts[0][1], lpts[1][1], min(1, gl * 1.8))]], lp.guard, bw * 0.72);
            g.fillStyle = rgba('#000000', 0.12); g.fillRect(x, y + bw * 0.72, w, max(1, bw * 0.06));
          }
        } else {
          g.fillStyle = inner; g.fillRect(U(-0.12), y, U(0.12) - U(-0.12), h);
          Pn.texture(g, U(-0.12), y, U(0.12) - U(-0.12), h, 'cotton', 0.15);
          Pn.piping(g, [[U(-0.12), y], [U(-0.12), y + h]], trim, bw * 0.6);
          Pn.piping(g, [[U(0.12), y], [U(0.12), y + h]], trim, bw * 0.6);
        }
      } else if (cl === 'side') {
        // 大襟: from the throat across to the wearer's right armpit, then down the right side seam
        const pts = [[U(0.0), yNeck], [U(-0.35), lerp(yNeck, yArm, 0.25)], [U(-0.8), lerp(yNeck, yArm, 0.75)], [U(-1.15), yArm], [U(-1.2), y + h]];
        Pn.piping(g, pts, trim, pipeW * 1.3);
        const kc = top.button || shade(trim, 0.2);
        Pn.knot(g, U(0.0) + w * 0.01, yNeck + h * 0.02, pipeW * 1.2, kc);
        Pn.knot(g, U(-0.55), lerp(yNeck, yArm, 0.5), pipeW * 1.2, kc);
        Pn.knot(g, U(-1.12), yArm + h * 0.02, pipeW * 1.2, kc);
        Pn.knot(g, U(-1.18), lerp(yArm, y + h, 0.35), pipeW * 1.2, kc);
        Pn.knot(g, U(-1.18), lerp(yArm, y + h, 0.6), pipeW * 1.2, kc);
        // contrast piping along the front of the flap (滾邊)
        if (top.cuff) Pn.piping(g, pts, top.cuff, pipeW * 0.5);
      } else if (cl === 'center') {
        Pn.piping(g, [[U(0), y], [U(0), y + h]], trim, pipeW * 1.1);
        const kc = top.button || shade(trim, 0.3);
        const n = o.long ? 7 : 5;
        for (let i = 0; i < n; i++) Pn.knot(g, U(0), lerp(yNeck + h * 0.02, yWaist + (y + h - yWaist) * 0.5, i / (n - 1)), pipeW * 1.15, kc);
      }
      // chest cover (鄒 chest piece) / patch roundel
      if (B.S.chest) {
        const c = B.S.chest; g.fillStyle = c.color;
        g.fillRect(U(-0.75), yNeck + h * 0.02, U(0.75) - U(-0.75), (yWaist - yNeck) * 0.95);
        Pn.texture(g, U(-0.75), yNeck, U(0.75) - U(-0.75), yWaist - yNeck, 'cotton', 0.2);
        if (c.trim) { g.strokeStyle = c.trim; g.lineWidth = pipeW; g.strokeRect(U(-0.72), yNeck + h * 0.03, U(0.72) - U(-0.72), (yWaist - yNeck) * 0.9); Pn.motif(g, U(-0.7), U(0.7), lerp(yNeck, yWaist, 0.6), h * 0.04, c.trim, 'diamond'); }
      }
      if (o.patch) for (const th of [0, PI - 0.001]) {
        const px = U(th), py = lerp(yNeck, yWaist, 0.55), r = h * 0.09;
        g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
        g.strokeStyle = o.patch.color; g.lineWidth = r * 0.12; g.stroke();
        g.fillStyle = o.patch.color; g.font = `bold ${round(r * 1.2)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.patch.text || '勇', px, py + r * 0.05);
      }
      for (const m of top.mends || []) { // mended patches: { th (angle), v (0 top..1 hem), w, h (m), color }
        const px = U(m.th), py = y + h * m.v, pw = m.w * d, ph = m.h * d;
        g.fillStyle = m.color || shade(col, 0.12); g.fillRect(px - pw / 2, py - ph / 2, pw, ph);
        Pn.texture(g, px - pw / 2, py - ph / 2, pw, ph, 'linen', 0.25);
        g.strokeStyle = rgba(shade(col, -0.5), 0.8); g.lineWidth = max(1, d * 0.004); g.setLineDash([max(2, d * 0.01), max(1.5, d * 0.008)]);
        g.strokeRect(px - pw / 2 + 2, py - ph / 2 + 2, pw - 4, ph - 4); g.setLineDash([]);
      }
      if (top.hemArt) top.hemArt(g, x, y, w, h, d, U, V, Pn);
      if (o.after) o.after(g, x, y, w, h, d, U, V);
      // underarm / side shading and top AO
      Pn.aoEdges(g, x, y, w, h, 0.18, 0.12);
    };
  }

  // ------------------------------------------------------------------------------------------ garments
  function buildGarments(B) {
    const S = B.S, P = B.P, s = P.s, top = S.top;
    const legLen = P.legTop;
    const R = torsoRings(P);
    const bare = !!top.bare || top.closure === 'skin';
    const robe = (top.len || 0) > 0.36;
    const hemY = max(0.06 * s, P.legTop - (top.len || 0) * legLen * 1.0);
    const shirtInfl = 0.012 * s + (S.body === 'stout' ? 0.004 : 0);
    // ---- skin torso where needed (bare torso or open front showing skin)
    if (bare) buildTorsoSkin(B, P.neckY + 0.01, P.legTop - 0.05 * s);
    buildNeck(B);
    // ---- trousers / legs
    const bt = S.bottom.type;
    let legSkin0 = 1.0; // fraction along the leg where skin becomes visible
    let tr = { pants: 1.0, wide: 1.0, cropped: 0.72, shorts: 0.36, bare: 0 }[bt] != null ? { pants: 1.0, wide: 1.0, cropped: 0.72, shorts: 0.36, bare: 0 }[bt] : 1;
    const bloused = !!S.leggings && (bt === 'wide' || bt === 'pants') && S.shoes.type !== 'boots';
    if (bloused) tr = 0.66; // trousers bloused over the leg wraps (綁腿)
    if (bt !== 'bare') {
      // under floor-length robes / skirts the trousers take the outer colour so a grazing knee never reads as a hole
      const longOuter = (top.len || 0) > 0.6 ? top.color : (S.skirt && (S.skirt.len || 0) > 0.8 ? S.skirt.color : null);
      const tcol = longOuter ? mixc(S.bottom.color, shade(longOuter, -0.15), 0.85) : S.bottom.color;
      const wide = bt === 'wide' ? 1 : bt === 'pants' ? 0 : 0.5;
      const rect = clothRect(B, 'pants', 0.5, P.legTop, tcol, { weave: 'cotton', seed: B.id + 'p', foldTop: 0.1, after: (g, x, y, w, h) => {
        if (S.bottom.cuff) { g.fillStyle = S.bottom.cuff; g.fillRect(x - 2, y + h * 0.93, w + 4, h * 0.08); }
        Pn.aoEdges(g, x, y, w, h, 0.25, 0.25);
      } });
      for (const SD of ['L', 'R']) {
        const n = 8, pts = [];
        const t1 = tr;
        for (let i = 0; i <= n; i++) pts.push(legPt(B, SD, lerp(-0.12, t1, i / n)));
        pts[0] = vadd(pts[0], [SD === 'L' ? -0.02 : 0.02, 0.0, 0]);
        tube(B.G, pts, 12, rect, (t) => {
          const tt = lerp(-0.12, t1, t);
          const body = legProfile(P, clamp(tt, 0, 1));
          const w0 = body + 0.014 * s + wide * (0.045 * s * sstep(0.2, 1, tt) + 0.02 * s);
          const hem = bt === 'wide' ? 0.06 * s : bt === 'pants' ? 0.01 * s : 0.03 * s;
          let r = w0;
          if (bloused && tt > tr - 0.12) r = lerp(w0, legProfile(P, tr) + 0.02 * s, sstep(tr - 0.03, tr, tt)) + 0.012 * s * sin(clamp((tt - (tr - 0.14)) / 0.12, 0, 1) * PI);
          const top = sstep(0.12, -0.08, tt); const rr = lerp(r, P.thighR * 0.92, top); return { rx: rr, ry: rr * 1.05, ao: 1 };
        }, (t) => legW(B, SD, lerp(-0.12, t1, t)), { nv: 14, up: [0, 0, 1] });
      }
      // seat / pelvis panel joining the legs (visible under short jackets)
      torsoShell(B, { rect, yTop: P.waistY + 0.02 * s, yBot: P.legTop - 0.06 * s, inflate: shirtInfl * 0.8, nu: 20, nv: 5, uvf: (u, v) => [u, v * 0.15] });
      legSkin0 = tr;
      B.flags.legR = P.thighR * 1.05 + 0.014 * s + (bt === 'wide' ? 0.065 * s : bt === 'pants' ? 0.0 : 0.032 * s);
    }
    // bare legs
    const shoe = S.shoes.type;
    if (legSkin0 < 0.99) buildLegSkin(B, 'L', max(0, legSkin0 - 0.04), shoe === 'boots' ? 0.72 : 1.0), buildLegSkin(B, 'R', max(0, legSkin0 - 0.04), shoe === 'boots' ? 0.72 : 1.0);
    else if (shoe === 'bare' || shoe === 'sandal') { buildLegSkin(B, 'L', 0.93, 1.0); buildLegSkin(B, 'R', 0.93, 1.0); }
    // ---- leg wraps
    if (S.leggings) {
      const L = S.leggings;
      const rect = B.rect('wraps', 0.3, 0.4, (g, x, y, w, h) => {
        Pn.cloth(g, x, y, w, h, L.color, { weave: 'linen', folds: false });
        g.strokeStyle = rgba(shade(L.color, -0.35), 0.8); g.lineWidth = max(1, h * 0.012);
        for (let i = -6; i < 16; i++) { g.beginPath(); g.moveTo(x, y + i * h / 10); g.lineTo(x + w, y + (i + 1.6) * h / 10); g.stroke(); }
        if (L.bands) { g.fillStyle = L.bands; g.fillRect(x, y, w, h * 0.06); g.fillRect(x, y + h * 0.94, w, h * 0.06); }
        Pn.aoEdges(g, x, y, w, h, 0.2, 0.25);
      });
      for (const SD of ['L', 'R']) {
        const pts = [legPt(B, SD, 0.52), legPt(B, SD, 0.75), legPt(B, SD, 0.985)];
        const wideK = bt === 'wide' ? 0.012 : 0;
        tube(B.G, pts, 10, rect, (t) => { const r = legProfile(P, lerp(0.52, 0.985, t)) + (0.011 + wideK) * s + (t < 0.15 ? 0.008 * s * (1 - t / 0.15) : 0); return { rx: r, ry: r * 1.05 }; },
          (t) => legW(B, SD, lerp(0.52, 0.985, t)), { nv: 6, up: [0, 0, 1] });
      }
    }
    // ---- shoes / feet
    const shCol = S.shoes.color || '#2b2730';
    for (const SD of ['L', 'R']) {
      let rect;
      if (shoe === 'bare' || shoe === 'sandal') {
        rect = B.rect('foot_' + shoe, 0.25, 0.25, (g, x, y, w, h) => {
          g.fillStyle = S.skin; g.fillRect(x - 2, y - 2, w + 4, h + 4);
          if (shoe === 'sandal') { // straw straps
            g.fillStyle = shade(shCol, -0.1);
            g.fillRect(x, y + h * 0.35, w, h * 0.08); g.fillRect(x, y + h * 0.62, w, h * 0.07);
            g.fillRect(x + w * 0.46, y + h * 0.6, w * 0.08, h * 0.4);
          }
          const gr = g.createLinearGradient(0, y + h * 0.7, 0, y + h); gr.addColorStop(0, rgba(S.skin, 0)); gr.addColorStop(1, rgba(shade(S.skin, -0.25), 0.7));
          g.fillStyle = gr; g.fillRect(x, y, w, h);
        });
      } else {
        rect = B.rect('shoe_' + shoe, 0.25, 0.25, (g, x, y, w, h) => {
          Pn.cloth(g, x, y, w, h, shCol, { weave: shoe === 'boots' ? 'leather' : 'cotton', folds: false });
          // 千層底: white layered sole stripe on the lower half of the loft (u ≈ 0.25..0.75 is the sole side)
          g.fillStyle = S.shoes.sole || (shoe === 'boots' ? shade(shCol, -0.3) : '#ece6d6');
          g.fillRect(x + w * 0.31, y - 2, w * 0.38, h + 4);
          g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 4; i++) g.fillRect(x + w * (0.33 + i * 0.09), y, 1, h);
          g.fillStyle = rgba('#ffffff', 0.12); g.fillRect(x + w * 0.85, y, w * 0.1, h);
        });
      }
      buildFoot(B, SD, shoe, shCol, rect);
      if (shoe === 'sandal') { // straw sole slab
        const P2 = B.P, f = B.pos('foot' + SD), sole = B.rect('straw', 0.3, 0.3, (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, S.shoes.color || '#cfae72', { weave: 'straw', folds: false, weaveK: 0.4 }); });
        grid(B.G, 10, 4, sole, (u, v) => {
          const th = (u - 0.5) * TAU, z = lerp(-0.07 * s, P2.foot - 0.045 * s, v);
          const w = spline([0, 0.5, 1], [P2.footW * 0.85, P2.footW * 1.12, P2.footW * 0.8], v);
          const cy = cos(th);
          return { p: [f[0] + sin(th) * w, 0.006 * s + cy * 0.006 * s, z], w: [[B.b('foot' + SD), 1 - sstep(0.55, 0.7, v)], [B.b('toe' + SD), sstep(0.55, 0.7, v)]] };
        }, { closed: true, flip: true });
      }
      if (shoe === 'boots') {
        const rectB = B.rect('shoe_boots', 0.25, 0.25, () => {});
        const bf = S.shoes.from || 0.55, bfl = S.shoes.flare || 1.08; // boot top (fraction hip→ankle) and top flare
        const pts = [legPt(B, SD, bf), legPt(B, SD, lerp(bf, 1, 0.55)), legPt(B, SD, 1.0)];
        const wk = bt === 'wide' ? 0.03 : 0.0;
        tube(B.G, pts, 11, B.rect('bootleg', 0.3, 0.3, (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, shCol, { weave: 'leather', folds: false }); g.fillStyle = S.shoes.band || shade(shCol, 0.25); g.fillRect(x - 2, y - 2, w + 4, h * (S.shoes.band ? 0.12 : 0.08) + 2); Pn.aoEdges(g, x, y, w, h, 0, 0.3); }),
          (t) => { const r = legProfile(P, lerp(bf, 1, t)) + (0.018 + wk * (1 - t)) * s; return { rx: r * (t < 0.1 ? bfl : 1), ry: r * 1.06 * (t < 0.1 ? lerp(1, bfl, 0.7) : 1) }; },
          (t) => legW(B, SD, lerp(bf, 1.0, t)), { nv: 6, up: [0, 0, 1] });
      }
    }
    // ---- upper garment
    const sl = top.sleeve || 'long';
    const sleeveEnd = { long: 1.0, wide: 1.0, flow: 1.0, rolled: 0.64, short: 0.27, none: 0 }[sl] != null ? { long: 1.0, wide: 1.0, flow: 1.0, rolled: 0.64, short: 0.27, none: 0 }[sl] : 1;
    const armSkinFrom = bare || sl === 'none' ? 0 : sleeveEnd < 1 ? sleeveEnd - 0.03 : 1;
    if (armSkinFrom < 1) { buildArmSkin(B, 'L', armSkinFrom); buildArmSkin(B, 'R', armSkinFrom); }
    const heldSides = handsHolding(B);
    buildHand(B, 'L', heldSides.L); buildHand(B, 'R', heldSides.R);
    if (!bare) {
      const cl = top.closure || 'cross';
      const s2 = s;
      // neckline edge
      const tipTh = -0.2, dip = cl === 'cross' ? 0.15 * s2 : cl === 'open' ? 0.2 * s2 : 0.012 * s2;
      const tipW = cl === 'cross' ? 1.05 : cl === 'open' ? 0.75 : 0.9;
      const yNeckTop = P.neckY + 0.012 * s2;
      const edge = (th) => {
        const d = abs(Math.atan2(sin(th - (cl === 'cross' ? tipTh : 0)), cos(th - (cl === 'cross' ? tipTh : 0))));
        return yNeckTop - dip * pow(max(0, 1 - d / tipW), 1.25);
      };
      const tipY = yNeckTop - dip;
      const jacketBot = robe ? P.legTop + 0.04 * s : max(hemY, P.legTop + 0.04 * s);
      const hasHem = hemY < P.legTop + 0.03 * s;
      const totalH = yNeckTop - hemY;
      const key = 'top';
      const jo = { key, yTop: yNeckTop, yBot: hemY, edge, tipTh, tipY, long: robe, patch: S.patch, slitY: hasHem && top.slits ? jacketBot : null };
      // one rect for the whole garment: torso part maps to v∈[0, kTorso], hem part to [kTorso, 1]
      const kTorso = (yNeckTop - jacketBot) / totalH;
      const rect = B.rect(key, 2 * PI * (P.chestW + 0.02) * 1.05, totalH, paintJacket(B, top, jo));
      const inflT = shirtInfl + (S.armor ? 0.004 : 0);
      torsoShell(B, { rect, edge, yBot: jacketBot, inflate: inflT, loose: robe ? 0.55 : 0.25, nu: 30, nv: robe ? 12 : 12, inflK: (y) => 1 + 1.1 * sstep(P.waistY, P.legTop + 0.04 * s, y) * 0 + 1.1 * (1 - sstep(P.legTop + 0.04 * s, P.waistY, y)),
        uvf: (u, v) => [u, v * kTorso] });
      if (hasHem) {
        const yT = jacketBot;
        const r0 = ringAt(R, yT);
        const chest = ringAt(R, P.chestY - 0.03 * s);
        const looseK = robe ? 0.55 : 0.25;
        const rr = Object.assign({}, r0, { rx: lerp(r0.rx, max(r0.rx, chest.rx * 0.98), looseK), rf: lerp(r0.rf, max(r0.rf, chest.rf * 0.98), looseK), rb: lerp(r0.rb, max(r0.rb, chest.rb), looseK) });
        B.flags.jacket = { yT, yH: hemY };
        const hemO = { name: 'robe', rect, yTop: yT, yHem: hemY, inflate: inflT * 2.1, flare: robe ? 0.35 + (top.flare || 0) : 0.18, chains: robe ? 8 : 6, legBlend: robe ? 0.5 : 0.42, hitR: (robe ? 0.05 : 0.04) * s,
          top: (th) => torsoPt(rr, th, inflT * 2.1), uvf: (u, v) => [u, kTorso + v * (1 - kTorso)], stiff: robe ? 2.4 : 3.0, grav: 0.4,
          topW: (th) => [[B.b('hips'), 1]] };
        if (top.slits) {
          // 開衩: side slits → the skirt is three panels (front, and the back halves meeting at a centre-back vent), each
          // on its own chains, so the legs open the slits when walking / in a stance. top.slits: gap half-angle (rad) or true.
          const g = typeof top.slits === 'number' ? top.slits : 0.07;
          const panels = [['robeF', -PI / 2 + g, PI / 2 - g, robe ? 4 : 3, 16], ['robeL', PI / 2 + g, PI, 2, 9], ['robeR', -PI, -PI / 2 - g, 2, 9]];
          for (const [name, th0, th1, chains, nu] of panels) {
            const hs = hemShell(B, Object.assign({}, hemO, { name, th0, th1, chains, nu, uvf: (u, v) => [lerp(th0, th1, u) / TAU + 0.5, kTorso + v * (1 - kTorso)] }));
            if (!B.flags.jacket.hs) B.flags.jacket.hs = hs; // its surf() is valid at any θ (used by aprons)
          }
        } else B.flags.jacket.hs = hemShell(B, hemO);
      }
      // inner layer visible in the V / open front
      if (cl === 'cross' || cl === 'open') {
        const icol = top.inner || '#efe9dc';
        const isSkin = icol.toLowerCase() === S.skin.toLowerCase();
        const irect = isSkin ? skinRect(B) : clothRect(B, 'inner', 0.4, 0.3, icol, { folds: false, weave: 'linen' });
        torsoShell(B, { rect: irect, yTop: P.neckY + 0.02 * s, yBot: cl === 'open' ? jacketBot + 0.01 : tipY - 0.05 * s, inflate: shirtInfl * 0.5, nu: 20, nv: 6 });
      }
      // stand collar (立領) for side / centre / round closures
      if (cl === 'side' || cl === 'center' || cl === 'round') {
        const crect = clothRect(B, 'collar', 0.3, 0.05, top.trim || shade(top.color, -0.3), { folds: false });
        const nr = P.neckR + shirtInfl + 0.006 * s;
        tube(B.G, [[0, P.neckY - 0.004 * s, -0.008], [0, P.neckY + 0.034 * s, -0.012]], 16, crect, (t) => ({ rx: nr * (1 - 0.06 * t), ry: nr * (1 - 0.06 * t) * 1.02 }),
          (t) => wmix([[B.b('chest'), 1]], [[B.b('neck'), 1]], 0.35 + t * 0.3), { nv: 2, up: [0, 0, 1], phase: 0, flipFrame: false, axisY: true });
      }
      // sleeves
      if (sl !== 'none') {
        const srect = B.rect('sleeve', 0.5, P.upArm + P.foreArm, (g, x, y, w, h, d) => {
          Pn.cloth(g, x, y, w, h, top.color, { weave: fabricOf(top.color), seed: B.id + 's', nfolds: 6 });
          if (top.bands && sl !== 'short') for (const b of top.bands) if (b.at < 0.4) { /* bands mostly on the body */ }
          const cuff = top.cuff || top.trim;
          const cw = top.cuffW || (sl === 'flow' || sl === 'banner' ? 0.14 : sl === 'wide' ? 0.1 : sl === 'rolled' ? 0.16 : 0.06);
          if (cuff) { g.fillStyle = cuff; g.fillRect(x - 2, y + h * (1 - cw), w + 4, h * cw + 2); g.fillStyle = rgba('#000', 0.18); g.fillRect(x - 2, y + h * (1 - cw), w + 4, max(1, h * 0.008)); }
          if (top.cuff2) { // turned-back cuff: a second contrast band (反摺袖口) inside the first
            g.fillStyle = top.cuff2; g.fillRect(x - 2, y + h * (1 - cw * 0.42), w + 4, h * cw * 0.22);
            g.fillStyle = rgba('#000', 0.12); g.fillRect(x - 2, y + h * (1 - cw * 0.2), w + 4, max(1, h * 0.006));
          }
          if (top.sleeveStripe) { g.fillStyle = top.sleeveStripe; g.fillRect(x + w * 0.47, y, w * 0.06, h * (1 - cw)); } // piping along the outer seam
          if (top.emb && (sl === 'wide' || sl === 'flow')) Pn.motif(g, x, x + w, y + h * (1 - cw * 0.5), h * cw * 0.5, top.emb, 'cloud');
          if (top.ext) { g.fillStyle = top.ext; g.fillRect(x - 2, y + h * 0.985, w + 4, h * 0.02); }
          Pn.aoEdges(g, x, y, w, h, 0.15, 0.2);
        });
        for (const SD of ['L', 'R']) {
          if (sl === 'long') sleeve(B, SD, { rect: srect, t1: 1, r0: 0.018 * s, ext: 0.012 * s, cuffR: P.wristR + 0.026 * s, flare: 0 });
          else if (sl === 'wide') sleeve(B, SD, { rect: srect, t1: 1, r0: 0.022 * s, ext: 0.03 * s, flare: 1, r1: 0.075 * s, drape: 0.5 });
          else if (sl === 'flow') sleeve(B, SD, { rect: srect, t1: 1, r0: 0.026 * s, ext: 0.07 * s, flare: 1, r1: 0.125 * s, drape: 1, seg: 14, nv: 12, flat: 0.9 });
          else if (sl === 'banner') sleeve(B, SD, { rect: srect, t1: 1, r0: 0.03 * s, ext: 0.05 * s, flare: 1, r1: (top.sleeveR || 0.1) * s, drape: 1, seg: 16, nv: 14, flat: 0.9, hang: (top.hang || 0.17) * s });
          else if (sl === 'rolled') sleeve(B, SD, { rect: srect, t1: sleeveEnd, r0: 0.02 * s, roll: 0.012 });
          else if (sl === 'short') sleeve(B, SD, { rect: srect, t1: sleeveEnd, r0: 0.02 * s, roll: 0.006 });
        }
      }
    }
    // ---- vest / waistcoat (馬褂 / 背心 / woven vest)
    if (S.vest) {
      const v = S.vest;
      const yT = P.neckY + 0.008 * s;
      const vBot = max(0.1, (bare ? P.legTop + 0.03 * s : P.legTop + 0.02 * s) - (v.len || 0.1) * legLen * 0.9);
      const vrect = B.rect('vest', 2 * PI * (P.chestW + 0.03), yT - vBot, (g, x, y, w, h, d) => {
        Pn.cloth(g, x, y, w, h, v.color, { weave: fabricOf(v.color), seed: B.id + 'v' });
        if (typeof v.stripes === 'string') { g.fillStyle = v.stripes; for (let i = 0; i < 10; i++) g.fillRect(x + w * (i + 0.3) / 10, y, w * 0.025, h); }
        if (v.bands) Pn.bandsAcross(g, x, y, w, h, v.bands);
        const tc = v.trim || shade(v.color, -0.35);
        g.fillStyle = tc; g.fillRect(x - 2, y + h * 0.95, w + 4, h * 0.06);
        if (v.closure === 'yizi') { // 一字襟 (巴圖魯坎肩): a straight button row across the upper chest + buttoned side seams
          const U = (th) => x + (th / TAU + 0.5) * w, pw = max(1.5, d * 0.012), yy = y + h * (v.rowAt || 0.2);
          Pn.piping(g, [[U(-1.35), yy], [U(1.35), yy]], tc, pw * 1.4);
          const n = v.buttons || 9;
          for (let i = 0; i < n; i++) Pn.knot(g, U(lerp(-1.15, 1.15, i / (n - 1))), yy, pw * 1.25, i % 2 && v.button2 ? v.button2 : (v.button || '#c99a48'));
          for (const th of [-1.45, 1.45]) { Pn.piping(g, [[U(th), yy], [U(th), y + h]], tc, pw); for (let k = 1; k < 4; k++) Pn.knot(g, U(th), lerp(yy, y + h, k / 4), pw * 1.1, v.button || '#c99a48'); }
        } else if (v.open !== false || bare) {
          const U = (th) => x + (th / TAU + 0.5) * w;
          g.fillStyle = tc; g.fillRect(U(-0.2), y, U(-0.13) - U(-0.2), h); g.fillRect(U(0.13), y, U(0.2) - U(0.13), h);
        } else { // 馬褂-style centre closure with knots
          const U = (th) => x + (th / TAU + 0.5) * w;
          Pn.piping(g, [[U(0), y], [U(0), y + h]], tc, max(1.5, d * 0.012));
          for (let i = 0; i < 5; i++) Pn.knot(g, U(0), y + h * (0.12 + i * 0.18), max(1.5, d * 0.012), v.trim || '#c9a24e');
        }
        if (S.patch) for (const th of [0, PI - 0.001]) {
          const px = x + (th / TAU + 0.5) * w, py = y + h * 0.42, r = min(h * 0.16, w * 0.06);
          g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
          g.strokeStyle = S.patch.color; g.lineWidth = r * 0.12; g.stroke();
          g.fillStyle = S.patch.color; g.font = `bold ${round(r * 1.25)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(S.patch.text || '勇', px, py + r * 0.05);
        }
        Pn.aoEdges(g, x, y, w, h, 0.1, 0.15);
      });
      const open = v.open !== false;
      const dipV = open ? 0.22 * s : 0.02 * s;
      const edgeV = (th) => yT - dipV * pow(max(0, 1 - abs(th) / 0.6), 1.1);
      const vInfl = (bare ? 0.008 : 0.022) * s + (robe ? 0.004 : 0);
      const yHip = P.legTop + 0.04 * s;
      if (vBot >= yHip - 0.01) torsoShell(B, { rect: vrect, edge: edgeV, yBot: vBot, inflate: vInfl, loose: 0.3, nu: 28, nv: 10, inflK: (y) => 1 + 0.4 * sstep(P.chestY, P.legTop, y) });
      else {
        const k = (yT - yHip) / (yT - vBot);
        torsoShell(B, { rect: vrect, edge: edgeV, yBot: yHip, inflate: vInfl, loose: 0.3, nu: 28, nv: 10, uvf: (u, vv) => [u, vv * k] });
        hemShell(B, { name: 'vest', rect: vrect, yTop: yHip, yHem: vBot, inflate: vInfl + 0.012 * s, flare: 0.12, chains: 6, uvf: (u, vv) => [u, k + vv * (1 - k)], stiff: 3 });
      }
    }
    // ---- armour (temple guard / procession general): chest plate + pauldrons, painted lamellae
    if (S.armor) {
      const A = S.armor;
      const arect = B.rect('armor', 1.0, 0.5, (g, x, y, w, h) => {
        Pn.cloth(g, x, y, w, h, A.color, { weave: 'leather', folds: false });
        g.strokeStyle = rgba(shade(A.color, -0.45), 0.8); g.lineWidth = max(1, h * 0.01);
        const rows = 9, cols = 26;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const cx = x + (c + (r % 2) * 0.5) * w / cols, cy = y + (r + 0.5) * h / rows;
          g.beginPath(); g.arc(cx, cy - h / rows * 0.2, w / cols * 0.48, 0.15 * PI, 0.85 * PI); g.stroke();
        }
        if (A.trim) { g.fillStyle = A.trim; g.fillRect(x, y, w, h * 0.07); g.fillRect(x, y + h * 0.93, w, h * 0.07); }
        Pn.aoEdges(g, x, y, w, h, 0.1, 0.2);
      });
      torsoShell(B, { rect: arect, yTop: P.shoulderY - 0.01 * s, yBot: P.waistY - 0.02 * s, inflate: 0.032 * s, loose: 0.4, nu: 26, nv: 8, edge: (th) => P.shoulderY + 0.01 * s - 0.05 * s * pow(max(0, cos(th)), 4) });
      for (const SD of ['L', 'R']) {
        const sg = SD === 'L' ? 1 : -1, c = vadd(B.pos('upperArm' + SD), [sg * 0.015 * s, 0.01 * s, 0]);
        blob(B.G, 12, 8, arect, c, [1, 1, 1], (n) => (n[1] > 0.2 ? [[B.b('shoulder' + SD), 0.5], [B.b('upperArm' + SD), 0.5]] : [[B.b('upperArm' + SD), 1]]), {
          deform: (n) => { const k = n[1] < -0.2 ? 0.0 : 1; return [n[0] * (P.armR + 0.04 * s), (n[1] > -0.3 ? n[1] : -0.3 + (n[1] + 0.3) * 0.2) * 0.075 * s - 0.03 * s, n[2] * (P.armR + 0.035 * s)]; },
        });
      }
    }
    // ---- waist: sash / belt
    const waistInfl = (robe ? 0.028 : 0.022) * s + (S.vest ? 0.012 * s : 0) + (S.armor ? 0.012 * s : 0);
    if (S.sash) buildSash(B, S.sash, waistInfl);
    if (S.belt) buildBelt(B, S.belt, waistInfl + (S.sash ? 0.01 * s : 0));
    // ---- apron
    if (S.apron) {
      const ap = S.apron;
      const yT = P.waistY + 0.005 * s, yH = max(0.12, P.legTop - (ap.len || 0.6) * legLen * 0.95);
      const arect = B.rect('apron', 0.55, yT - yH, (g, x, y, w, h) => {
        Pn.cloth(g, x, y, w, h, ap.color, { weave: 'linen', seed: B.id + 'ap' });
        g.fillStyle = ap.band || shade(ap.color, -0.25); g.fillRect(x - 2, y - 2, w + 4, h * 0.06);
        if (ap.stains) for (const st of ap.stains) { g.fillStyle = rgba(st.color, st.a || 0.5); g.beginPath(); g.ellipse(x + st.x * w, y + st.y * h, st.r * w, st.r * w * 0.8, 0, 0, TAU); g.fill(); }
        if (ap.pocket) { g.strokeStyle = rgba(shade(ap.color, -0.4), 0.8); g.lineWidth = max(1, w * 0.008); g.setLineDash([3, 2]); g.strokeRect(x + w * 0.36, y + h * 0.18, w * 0.28, h * 0.24); g.setLineDash([]); }
        if (ap.stitch) { // running-stitch border just inside the hem
          g.strokeStyle = ap.stitch; g.lineWidth = max(1, w * 0.007); g.setLineDash([max(2, w * 0.02), max(2, w * 0.016)]);
          g.beginPath(); g.moveTo(x + w * 0.06, y + h * 0.9); g.quadraticCurveTo(x + w * 0.5, y + h * 0.95, x + w * 0.94, y + h * 0.9); g.stroke(); g.setLineDash([]);
        }
        if (ap.emb) { // embroidered flowers (挑花) in a row above the hem
          const n = ap.embN || 3;
          for (let i = 0; i < n; i++) {
            const cx = x + w * (0.5 + (i - (n - 1) / 2) * 0.17), cy = y + h * 0.8, r = w * 0.032;
            g.fillStyle = ap.emb;
            for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.ellipse(cx + cos(a) * r * 0.62, cy + sin(a) * r * 0.62, r * 0.48, r * 0.26, a, 0, TAU); g.fill(); }
            g.fillStyle = shade(ap.emb, -0.3); g.beginPath(); g.arc(cx, cy, r * 0.28, 0, TAU); g.fill();
          }
        }
        if (ap.trim) { g.fillStyle = ap.trim; g.fillRect(x - 2, y, max(2, w * 0.018), h); g.fillRect(x + w - max(2, w * 0.018), y, max(2, w * 0.018) + 2, h); }
        Pn.aoEdges(g, x, y, w, h, 0.2, 0.1);
      });
      // 圍身裙 bib: a flat panel from the waist up over the chest, hung from the neck (optionally by a silver chain)
      if (ap.bib) {
        const yB = P.neckY - (ap.bibDrop || 0.07) * s, bw = ap.bibW || 0.62;
        const brect = B.rect('apronBib', 0.3, yB - yT, (g, x, y, w, h) => {
          Pn.cloth(g, x, y, w, h, ap.color, { weave: 'linen', folds: false, seed: B.id + 'apb' });
          if (ap.stitch) { g.strokeStyle = ap.stitch; g.lineWidth = max(1, w * 0.012); g.setLineDash([max(2, w * 0.03), max(2, w * 0.025)]); g.beginPath(); g.moveTo(x + w * 0.1, y + h * 0.12); g.quadraticCurveTo(x + w * 0.5, y + h * 0.2, x + w * 0.9, y + h * 0.12); g.stroke(); g.setLineDash([]); }
          if (ap.trim) { g.fillStyle = ap.trim; g.fillRect(x - 2, y, max(2, w * 0.03), h); g.fillRect(x + w - max(2, w * 0.03), y, max(2, w * 0.03) + 2, h); }
          g.fillStyle = shade(ap.color, 0.12); g.fillRect(x - 2, y - 2, w + 4, h * 0.05);
          Pn.aoEdges(g, x, y, w, h, 0.05, 0.3);
        });
        const binf = (S.top && (S.top.closure === 'side' || S.top.closure === 'center') ? 0.026 : 0.022) * s;
        grid(B.G, 8, 6, brect, (u, v) => {
          const y = lerp(yB, yT + 0.01 * s, v);
          const th = (u - 0.5) * 2 * bw * lerp(0.8, 1.0, v);
          const p = torsoPt(ringAt(R, y), th, binf + 0.002 * s * v);
          return { p: [p[0] * 0.97, p[1], max(p[2], 0.02 * s)], w: torsoW(B, p) };
        }, { flip: false });
        if (ap.chain) { // silver neck chain: from the bib's top corners up and round the back of the neck, with a clasp plate
          const crect = B.rect('apronChain', 0, 0, (g, x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, shade(ap.chain, -0.3)); gr.addColorStop(0.5, shade(ap.chain, 0.4)); gr.addColorStop(1, shade(ap.chain, -0.2)); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4); }, { px: [12, 12] });
          const pts = [];
          for (let i = 0; i <= 18; i++) {
            const t = i / 18, th = lerp(-bw * 0.8, -(TAU - bw * 0.8), t); // from the right top corner round the back to the left one
            const y = lerp(yB, P.neckY + 0.004 * s, sin(t * PI) ** 0.4);
            const p = torsoPt(ringAt(R, clamp(y, P.legTop, P.neckY)), th, binf + 0.008 * s);
            pts.push(p);
          }
          tube(B.G, pts, 4, crect, () => ({ rx: 0.0028 * s }), (t) => [[B.b('chest'), 0.75], [B.b('neck'), 0.25 * sin(t * PI)]], { nv: 36, up: [0, 1, 0] });
          const cp = torsoPt(ringAt(R, yB), 0, binf + 0.004 * s);
          blob(B.G, 6, 4, crect, cp, [0.014 * s, 0.008 * s, 0.003 * s], torsoW(B, cp));
        }
      }
      const inf = waistInfl + 0.006 * s;
      const jac = B.flags.jacket;
      // flat front panel laid over whatever is beneath (jacket hem or trousers), hanging straight below it
      const apSurf = (th, t) => {
        const y = lerp(yT, yH, t);
        let p;
        if (jac && jac.hs && y <= jac.yT) {
          const tj = clamp((jac.yT - y) / (jac.yT - jac.yH), 0, 1);
          const q = jac.hs.surf(th, tj);
          p = [q[0], y, q[2]];
        } else p = torsoPt(ringAt(R, y), th, inf);
        const n = [sin(th), 0, cos(th)];
        const front = max(p[2], 0.0);
        return [p[0] * 0.96 + n[0] * 0.012 * s, y, front + 0.014 * s + (1 - cos(th)) * 0.006 * s];
      };
      hemShell(B, { name: 'apron', rect: arect, yTop: yT, yHem: yH, inflate: inf, flare: 0.05, th0: -0.95, th1: 0.95, chains: 3, nu: 12, stiff: 2.6, grav: 0.5, rigidTop: 0.06, legBlend: 0.8, hitR: 0.03 * s, noClear: true,
        surf: apSurf });
    }
    // ---- skirt
    if (S.skirt) {
      const sk = S.skirt;
      const yT = P.waistY + 0.01 * s, yH = max(0.04, P.legTop - (sk.len || 0.9) * legLen);
      const srect = B.rect('skirt', 2 * PI * (P.hipW + 0.05), yT - yH, (g, x, y, w, h) => {
        Pn.cloth(g, x, y, w, h, sk.color, { weave: fabricOf(sk.color), seed: B.id + 'sk', nfolds: 14, foldTop: 0.05 });
        if (sk.stripes) { const n = sk.stripes.n || 5; g.fillStyle = sk.stripes.color; for (let i = 0; i < n; i++) g.fillRect(x - 2, y + h * (0.15 + 0.8 * i / n), w + 4, h * 0.035); }
        if (sk.bands) Pn.bandsAcross(g, x, y, w, h, sk.bands);
        if (sk.trim) { g.fillStyle = sk.trim; g.fillRect(x - 2, y + h * 0.95, w + 4, h * 0.06); }
        Pn.aoEdges(g, x, y, w, h, 0.25, 0.15);
      });
      const inf = (robe && hemY < yT ? 0.04 : 0.016) * s;
      hemShell(B, { name: 'skirt', rect: srect, yTop: yT, yHem: yH, inflate: inf, flare: 0.25 + (sk.flare || 0.3) * 0.8, chains: 8, stiff: 2.2, grav: 0.45, rigidTop: 0.05, legBlend: 0.45, hitR: 0.045 * s });
    }
    // ---- cape / mantle
    if (S.cape) buildCape(B, S.cape);
    // ---- towel round the neck, beads, bag strap, bracers, bracelet
    if (S.towel) buildTowel(B, S.towel);
    if (S.scarf) buildScarf(B, S.scarf);
    if (S.beads) buildBeads(B, S.beads);
    if (S.bag) buildBag(B, S.bag);
    if (S.bracers) for (const SD of S.bracers.side ? [S.bracers.side] : ['L', 'R']) {
      const BR = S.bracers;
      const rect = clothRect(B, 'bracer', 0.2, 0.2, BR.color, { weave: BR.cloth ? 'cotton' : 'leather', folds: !!BR.cloth, after: (g, x, y, w, h) => {
        if (BR.tapes) { g.fillStyle = BR.tapes; g.fillRect(x - 2, y + h * 0.02, w + 4, h * 0.09); g.fillRect(x - 2, y + h * 0.86, w + 4, h * 0.09); g.fillStyle = rgba('#000', 0.15); g.fillRect(x - 2, y + h * 0.1, w + 4, h * 0.02); }
        else { g.strokeStyle = rgba(shade(BR.color, 0.35), 0.6); g.lineWidth = max(1, h * 0.03); for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x, y + h * i / 5); g.lineTo(x + w, y + h * i / 5 + h * 0.05); g.stroke(); } } } });
      const e = P.upArm / (P.upArm + P.foreArm);
      const pts = armPts(B, SD);
      const a = vlerp(pts[1], pts[2], S.bracers.from != null ? S.bracers.from : 0.35), b = vlerp(pts[1], pts[2], 1.0);
      tube(B.G, [a, b], 10, rect, (t) => { const r = armProfile(P, lerp(e + (1 - e) * 0.35, 1, t)) + (sl === 'long' ? 0.03 : 0.012) * s; return { rx: r, ry: r * 0.95 }; }, () => [[B.b('foreArm' + SD), 1]], { nv: 3, linear: true, up: [0, 0, 1] });
    }
    if (S.bracelet) {
      const SD = S.bracelet.side || 'R';
      const rect = clothRect(B, 'bracelet', 0.05, 0.05, S.bracelet.color, { folds: false });
      const pts = armPts(B, SD), c = vlerp(pts[1], pts[2], 0.97);
      tube(B.G, [vsub(c, vsc(vnorm(vsub(pts[2], pts[1])), 0.004)), vadd(c, vsc(vnorm(vsub(pts[2], pts[1])), 0.004))], 10, rect, () => ({ rx: P.wristR + 0.006 * s, ry: P.wristR + 0.005 * s }), () => [[B.b('foreArm' + SD), 1]], { nv: 1, linear: true, up: [0, 0, 1] });
    }
  }
  C.buildGarments = buildGarments;

  // which hands grip something (→ fist shape)
  function handsHolding(B) {
    const S = B.S;
    return { R: !!(S.held || S.weapon), L: !!(S.heldL) || ['spear', 'glaive', 'halberd', 'lstaff', 'oar', 'staff', 'bow', 'crook', 'flute'].includes(S.weapon) };
  }

  function buildSash(B, sa, infl) {
    const P = B.P, s = P.s, R = torsoRings(P);
    const wv = clamp((sa.w || 2.6) * PX * 1.1, 0.03, 0.08) * s;
    const yC = P.waistY + 0.005 * s;
    const col = sa.color;
    const rect = B.rect('sash', 2 * PI * (P.waistW + 0.04), wv * 1.4, (g, x, y, w, h) => {
      Pn.cloth(g, x, y, w, h, col, { weave: 'silk', folds: false });
      g.strokeStyle = rgba(shade(col, -0.35), 0.7); g.lineWidth = max(1, h * 0.05);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x, y + h * (0.3 + i * 0.2)); for (let k = 0; k <= 20; k++) g.lineTo(x + w * k / 20, y + h * (0.3 + i * 0.2) + sin(k * 1.3 + i) * h * 0.05); g.stroke(); }
      Pn.aoEdges(g, x, y, w, h, 0.3, 0.3);
    });
    grid(B.G, 28, 3, rect, (u, v) => {
      const th = (u - 0.5) * TAU, y = yC + wv * 0.5 - v * wv;
      const p = torsoPt(ringAt(R, y), th, infl + 0.004 * s * sin(v * PI));
      return { p, w: torsoW(B, p) };
    }, { closed: true });
    // knot at the wearer's front-left + two tails on spring chains
    const kth = sa.emblem ? 0 : 0.55;
    const kp = torsoPt(ringAt(R, yC), kth, infl + 0.012 * s);
    const krect = B.rect('sashknot', 0.12, 0.12, (g, x, y, w, h) => {
      Pn.cloth(g, x, y, w, h, col, { weave: 'silk', folds: false });
      if (sa.emblem === 'taiji') { // 太極
        const cx = x + w / 2, cy = y + h * 0.5, r = min(w, h) * 0.32;
        g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
        g.fillStyle = '#1e1c22'; g.beginPath(); g.arc(cx, cy, r, -PI / 2, PI / 2); g.arc(cx, cy + r / 2, r / 2, PI / 2, -PI / 2, true); g.arc(cx, cy - r / 2, r / 2, PI / 2, -PI / 2, false); g.fill();
        g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(cx, cy + r / 2, r * 0.13, 0, TAU); g.fill();
        g.fillStyle = '#1e1c22'; g.beginPath(); g.arc(cx, cy - r / 2, r * 0.13, 0, TAU); g.fill();
        g.strokeStyle = '#c9a24e'; g.lineWidth = r * 0.12; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
      }
    });
    const nrm = vnorm([sin(kth), 0, cos(kth)]);
    blob(B.G, 10, 7, krect, vadd(kp, vsc(nrm, 0.004)), [1, 1, 1], torsoW(B, kp), { deform: (n) => {
      const big = sa.emblem ? 1.25 : 1;
      const x = n[0] * 0.034 * s * big, y = n[1] * wv * 0.62 * big, z = n[2] * 0.016 * s;
      return [x * cos(kth) + z * sin(kth), y, -x * sin(kth) + z * cos(kth)];
    }, uvf: (u, v) => [u, v] });
    if (sa.tails !== false) {
      const tl = (0.26 + (sa.tailLen || 0)) * s;
      for (const off of [-0.022, 0.022]) {
        const side = [cos(kth), 0, -sin(kth)];
        const p0 = vadd(vadd(kp, vsc(side, off * s)), vsc(nrm, 0.01 * s));
        const pts = [p0, vadd(p0, [0, -tl * 0.35, 0.012 * s]), vadd(p0, [0, -tl * 0.7, 0.018 * s]), vadd(p0, [0, -tl, 0.02 * s])];
        const ids = B.chain('sashT' + (off > 0 ? 'a' : 'b'), 'hips', pts, { stiff: 0.6, drag: 0.3, grav: 1.0, r: 0.015 * s, groups: ['leg', 'body'], kind: 'ribbon' });
        ribbon(B, pts, ids, rect, (t) => (0.018 + 0.006 * t) * s * (sa.w ? sa.w / 2.6 : 1), side, (t) => 0.004 * s);
      }
    }
  }
  // flat ribbon (2-sided card with slight thickness) along chain points
  function ribbon(B, pts, ids, rect, halfW, side, thick, opts = {}) {
    const n = (pts.length - 1) * 3;
    const Wf = (t) => {
      const seg = clamp(t * (pts.length - 1), 0, ids.length - 1e-4), si = floor(seg), sf = seg - si;
      const W = [[ids[si], 1 - sf * 0.5]]; if (si + 1 < ids.length) W.push([ids[si + 1], sf * 0.5]); else W[0][1] = 1;
      return W;
    };
    tube(B.G, pts, 6, rect, (t) => ({ rx: halfW(t), ry: thick(t), ao: opts.ao ? opts.ao(t) : 1 }), (t) => Wf(t), { nv: n, up: side, uvf: opts.uvf, phase: 0 });
  }
  C.ribbon = ribbon;

  function buildBelt(B, be, infl) {
    const P = B.P, s = P.s, R = torsoRings(P);
    const wv = (be.w || 0.03) * s, yC = P.waistY - 0.012 * s + (be.dy || 0) * s;
    const rect = B.rect('belt', 2 * PI * (P.waistW + 0.04), wv * 1.3, (g, x, y, w, h) => {
      Pn.cloth(g, x, y, w, h, be.color, { weave: 'leather', folds: false });
      g.strokeStyle = rgba(shade(be.color, 0.3), 0.5); g.setLineDash([2, 2]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y + h * 0.2); g.lineTo(x + w, y + h * 0.2); g.moveTo(x, y + h * 0.8); g.lineTo(x + w, y + h * 0.8); g.stroke(); g.setLineDash([]);
    });
    grid(B.G, 28, 2, rect, (u, v) => {
      const th = (u - 0.5) * TAU, y = yC + wv * 0.5 - v * wv;
      const p = torsoPt(ringAt(R, y), th, infl + 0.006 * s);
      return { p, w: torsoW(B, p) };
    }, { closed: true });
    if (be.buckle) {
      const brect = B.rect('buckle', 0.05, 0.05, (g, x, y, w, h) => { g.fillStyle = be.buckle; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.strokeStyle = shade(be.buckle, -0.4); g.lineWidth = max(1, w * 0.12); g.strokeRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6); g.fillStyle = rgba('#fff', 0.35); g.fillRect(x, y, w, h * 0.25); }, { minPx: 8 });
      const p = torsoPt(ringAt(R, yC), 0, infl + 0.012 * s);
      if (be.round) { // round brass boss buckle (武俠 belts)
        const br = be.round * s;
        blob(B.G, 12, 6, brect, vadd(p, [0, 0, 0.002 * s]), [br, br, 0.008 * s], torsoW(B, p), { deform: (n) => [n[0] * br, n[1] * br, n[2] * 0.009 * s * (n[2] > 0 ? 1 : 0.4)] });
      } else blob(B.G, 8, 6, brect, p, [0.028 * s, 0.022 * s, 0.008 * s], torsoW(B, p), { deform: (n) => [Math.sign(n[0]) * pow(abs(n[0]), 0.5) * 0.026 * s, Math.sign(n[1]) * pow(abs(n[1]), 0.5) * 0.02 * s, n[2] * 0.008 * s] });
    }
  }

  function buildCape(B, cp) {
    const P = B.P, s = P.s, R = torsoRings(P);
    const yTop = P.neckY + 0.01 * s;
    const yHem = max(0.08, P.shoulderY - (cp.len || 0.8) * P.shoulderY * 0.95);
    const col = cp.color, feathers = !!cp.feathers, ragged = !!cp.ragged;
    const rect = B.rect('cape', 2 * PI * (P.sh + 0.08), yTop - yHem, (g, x, y, w, h) => {
      Pn.cloth(g, x, y, w, h, col, { weave: feathers ? 'silk' : 'cotton', seed: B.id + 'cape', nfolds: 10 });
      if (feathers) {
        const R2 = rng(B.id + 'f');
        for (let r = 0; r < 14; r++) for (let c = 0; c < 26; c++) {
          const fx = x + (c + (r % 2) * 0.5) / 26 * w, fy = y + (r + 0.6) / 14 * h;
          const fw = w / 26 * 0.62, fh = h / 14 * 1.6;
          g.fillStyle = rgba(shade(col, -0.35 + R2() * 0.15), 0.9);
          g.beginPath(); g.moveTo(fx, fy - fh * 0.7); g.quadraticCurveTo(fx + fw, fy, fx, fy + fh * 0.35); g.quadraticCurveTo(fx - fw, fy, fx, fy - fh * 0.7); g.fill();
          g.strokeStyle = rgba(cp.sheen || '#6a5aa0', 0.45); g.lineWidth = 1; g.beginPath(); g.moveTo(fx, fy - fh * 0.6); g.lineTo(fx, fy + fh * 0.3); g.stroke();
        }
      }
      if (cp.trim) { g.fillStyle = cp.trim; g.fillRect(x, y + h * 0.96, w, h * 0.05); }
      Pn.aoEdges(g, x, y, w, h, 0.0, 0.25);
    });
    // shoulders wrap: top ring hugs the neck/shoulders then falls from the shoulder line
    const inf = 0.04 * s + (B.S.armor ? 0.015 * s : 0);
    const sh = ringAt(R, P.shoulderY - 0.035 * s);
    const th0 = cp.front ? -PI : -PI * 0.78, th1 = cp.front ? PI : PI * 0.78; // open at the front
    const top = (th) => { // around the shoulders: pass over the deltoids
      const a = torsoPt(ringAt(R, P.neckY + 0.005 * s), th, inf * 0.7);
      return a;
    };
    const wave = ragged || feathers ? (th) => (feathers ? -0.05 * s * abs(sin(th * 9)) : -0.06 * s * (0.5 + 0.5 * sin(th * 7.3) * sin(th * 3.1))) : null;
    hemShell(B, { name: 'cape', parent: 'chest', rect, yTop, yHem, inflate: inf, flare: 0.35, th0: cp.closed ? -PI : 0.24, th1: cp.closed ? PI : TAU - 0.24, chains: 7, nu: 32, nv: 12, segs: 3,
      surf: (th, t) => {
        const tS = 0.16;
        const yS = P.shoulderY - 0.045 * s;
        if (t <= tS) { const k = t / tS; const y = lerp(P.neckY + 0.004 * s, yS, k); const p = torsoPt(ringAt(R, y), th, lerp(0.014 * s, inf, k)); return p; }
        const k = (t - tS) / (1 - tS);
        const a = torsoPt(ringAt(R, yS), th, inf);
        const y = lerp(yS, yHem, k);
        const body = torsoPt(ringAt(R, clamp(y, P.legTop - 0.06 * s, P.shoulderY)), th, inf);
        const fl = 1 + 0.35 * pow(k, 1.2);
        let x = a[0] * fl, z = a[2] * fl - 0.02 * s * k;
        if (abs(body[0]) + 0.01 > abs(x)) x = body[0] + Math.sign(body[0]) * 0.01;
        if (body[2] < 0 && body[2] - 0.01 < z) z = min(z, body[2] - 0.015 * s);
        let yy = y; if (wave && t > 0.98) yy += wave(th);
        return [x, yy, z];
      },
      curve: 0.55, stiff: 1.8, grav: 0.55, hemWave: wave, rigidTop: 0.28,
      topW: (th) => [[B.b('chest'), 0.8], [B.b('neck'), 0.2]], groups: ['body', 'leg'], hitR: 0.04 * s,
      surfOverride: true });
    // raised collar (feather ruff / stand collar)
    if (cp.collar || cp.collarColor) {
      const crect = clothRect(B, 'capecollar', 0.5, 0.1, cp.collarColor || shade(col, -0.1), { weave: feathers ? 'silk' : 'cotton', folds: false });
      const hc = (typeof cp.collar === 'number' ? cp.collar * PX * 0.9 : 0.06) * s;
      tube(B.G, [[0, P.neckY - 0.01 * s, -0.012], [0, P.neckY + hc, -0.02 * s]], 16, crect, (t) => ({ rx: P.neckR + 0.03 * s + t * 0.035 * s, ry: P.neckR + 0.03 * s + t * 0.04 * s }),
        (t) => wmix([[B.b('chest'), 1]], [[B.b('neck'), 1]], t * 0.4), { nv: 3, up: [0, 0, 1] });
    }
  }

  function buildTowel(B, tw) {
    const P = B.P, s = P.s;
    const rect = clothRect(B, 'towel', 0.4, 0.06, tw.color, { weave: 'linen', folds: false, after: (g, x, y, w, h) => { g.fillStyle = rgba('#3a6ab0', 0.5); g.fillRect(x, y + h * 0.2, w, h * 0.08); } });
    const pts = [];
    for (let i = 0; i <= 16; i++) { const th = (i / 16) * TAU; pts.push([sin(th) * (P.neckR + 0.03 * s), P.neckY - 0.006 * s - 0.012 * s * max(0, cos(th)), cos(th) * (P.neckR + 0.03 * s)]); }
    tube(B.G, pts, 8, rect, () => ({ rx: 0.016 * s, ry: 0.012 * s }), () => [[B.b('chest'), 0.7], [B.b('neck'), 0.3]], { nv: 32, up: [0, 1, 0] });
  }

  // 圍巾 neck scarf (sprite piece `scarf: { color }`): a thick wrap round the neck, a short end hanging down the chest
  // from a knot at the wearer's right, and a long tail trailing back over the left shoulder. Both ends are spring
  // ribbons; the tail's rest line sweeps out sideways (stiff enough to read as "trailing" at rest, free in motion).
  // sc: { color, trim, tail (length m, default 0.62), front (m, 0.24), w (half width m, 0.04), sweep 0..1 }
  function buildScarf(B, sc) {
    const P = B.P, s = P.s, R = torsoRings(P);
    const col = sc.color || '#d9622a', trim = sc.trim || shade(col, -0.22);
    const rect = B.rect('scarf', 0.6, 0.12, (g, x, y, w, h) => {
      Pn.cloth(g, x, y, w, h, col, { weave: 'cotton', folds: false, seed: B.id + 'scarf' });
      g.fillStyle = rgba(shade(col, -0.3), 0.35); for (let i = 0; i < 5; i++) g.fillRect(x, y + h * (0.12 + i * 0.19), w, max(1, h * 0.025)); // soft knit ribs
      g.fillStyle = trim; g.fillRect(x - 2, y - 2, w + 4, max(1.5, h * 0.06)); g.fillRect(x - 2, y + h * 0.95, w + 4, h * 0.07);
      Pn.aoEdges(g, x, y, w, h, 0.15, 0.15);
    });
    const hw = (sc.w || 0.04) * s;
    const yN = P.neckY + 0.006 * s, rN = P.neckR + 0.03 * s + (B.S.top && ['side', 'center', 'round'].includes(B.S.top.closure) ? 0.008 * s : 0);
    // the wrap: a fat ring, a touch lower at the front
    const ring = [];
    for (let i = 0; i <= 20; i++) { const th = (i / 20) * TAU; ring.push([sin(th) * rN * 1.04, yN - 0.014 * s * max(0, cos(th)), cos(th) * rN + 0.004 * s]); }
    tube(B.G, ring, 8, rect, () => ({ rx: 0.017 * s, ry: 0.026 * s }), () => [[B.b('chest'), 0.55], [B.b('neck'), 0.45]], { nv: 40, up: [0, 1, 0], uvf: (u, v) => [v, u * 0.5] });
    // knot at the wearer's right of the throat
    const kth = -0.42;
    const kp = [sin(kth) * rN * 1.15, yN - 0.03 * s, cos(kth) * rN * 1.15 + 0.008 * s];
    blob(B.G, 9, 7, rect, kp, [0.028 * s, 0.026 * s, 0.017 * s], [[B.b('chest'), 0.8], [B.b('neck'), 0.2]]);
    // short end down the chest (follows the torso front)
    const fL = (sc.front || 0.24) * s;
    const fpt = (t) => { const y = kp[1] - fL * t; const p = torsoPt(ringAt(R, clamp(y, P.legTop, P.neckY)), kth * (1 - 0.6 * t) + 0.05, 0.03 * s + 0.006 * s * t); return [p[0], y, max(p[2], kp[2] * (1 - t))]; };
    const fp = [kp, fpt(0.35), fpt(0.7), fpt(1)];
    const fids = B.chain('nscarfF', 'chest', fp, { stiff: 1.2, drag: 0.35, grav: 0.8, r: 0.016 * s, groups: ['body'], kind: 'ribbon' });
    ribbon(B, fp, fids, rect, (t) => hw * (1 - 0.55 * pow(t, 1.5)) * (t > 0.92 ? (1 - t) / 0.08 * 0.5 + 0.5 : 1), [sin(kth) * 0.5, 0, 1], () => 0.004 * s, { uvf: (u, v) => [v, 0.5 + u * 0.5] });
    // long tail from the back-left of the neck, sweeping back and out over the left shoulder blade
    const tL = (sc.tail || 0.62) * s, sw = sc.sweep != null ? sc.sweep : 0.6;
    const t0 = [sin(2.3) * rN, yN - 0.01 * s, cos(2.3) * rN - 0.004 * s];
    const tp = [t0];
    for (let i = 1; i <= 4; i++) {
      const t = i / 4, y = t0[1] - tL * lerp(0.95, 0.55, sw) * t;
      const bz = -(ringAt(R, clamp(y, P.legTop, P.neckY)).rb + 0.035 * s);
      tp.push([t0[0] + (0.05 + tL * 0.55 * sw * t) * s, y, min(bz, t0[2]) - tL * 0.35 * sw * t * t]);
    }
    const tids = B.chain('nscarfT', 'chest', tp, { stiff: 0.55 + sw * 0.6, drag: 0.3, grav: 0.75, r: 0.02 * s, groups: ['body'], kind: 'ribbon' });
    ribbon(B, tp, tids, rect, (t) => hw * (1.05 - 0.45 * t) * (t > 0.9 ? (1 - t) / 0.1 * 0.6 + 0.4 : 1), [0.45, 0.15, -1], () => 0.004 * s, { uvf: (u, v) => [v, 0.5 + u * 0.5] });
  }

  function buildBeads(B, bd) {
    const P = B.P, s = P.s, R = torsoRings(P);
    const cols = bd.colors || ['#e0e0e0'];
    const rect = B.rect('beads', 0.5, 0.03, (g, x, y, w, h) => {
      g.fillStyle = cols[0]; g.fillRect(x - 2, y - 2, w + 4, h + 4);
      const n = 40;
      for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(x + w * i / n, y, w / n * 0.9, h); g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + w * i / n, y, w / n * 0.3, h * 0.4); }
    });
    const rows = bd.rows || 1;
    for (let r = 0; r < rows; r++) {
      const dropF = 0.06 * s + r * 0.03 * s;
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const th = (i / 24) * TAU - PI;
        const y = P.neckY - 0.005 * s - dropF * pow(max(0, cos(th)), 1.5);
        const p = torsoPt(ringAt(R, y), th, 0.026 * s + (B.S.vest ? 0.012 * s : 0));
        pts.push(p);
      }
      tube(B.G, pts, 6, rect, () => ({ rx: 0.008 * s, ry: 0.008 * s }), () => [[B.b('chest'), 1]], { nv: 48, up: [0, 1, 0] });
    }
  }

  function buildBag(B, bg) {
    const P = B.P, s = P.s, R = torsoRings(P);
    const rect = B.rect('bag', 0.3, 0.3, (g, x, y, w, h) => {
      Pn.cloth(g, x, y, w, h, bg.color, { weave: 'linen', folds: false });
      if (bg.acc) { Pn.motif(g, x, x + w, y + h * 0.3, h * 0.12, bg.acc, 'diamond'); Pn.motif(g, x, x + w, y + h * 0.7, h * 0.1, bg.acc, 'zigzag'); }
      Pn.aoEdges(g, x, y, w, h, 0.25, 0.25);
    });
    const srect = clothRect(B, 'strap', 0.4, 0.04, bg.strap || shade(bg.color, -0.3), { folds: false });
    // strap from the right shoulder across the chest to the left hip, and down the back
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = lerp(P.shoulderY + 0.01 * s, P.legTop + 0.08 * s, t);
      const th = lerp(-0.62 * PI * 0.5, 0.55 * PI, t);
      pts.push(torsoPt(ringAt(R, y), th, 0.028 * s + (B.S.vest ? 0.012 * s : 0)));
    }
    tube(B.G, pts, 4, srect, () => ({ rx: 0.016 * s, ry: 0.004 * s }), (t) => torsoW(B, pts[min(12, round(t * 12))]), { nv: 24, up: [0, 0, 1] });
    const c = torsoPt(ringAt(R, P.legTop + 0.0), PI * 0.55, 0.06 * s);
    blob(B.G, 10, 6, rect, c, [1, 1, 1], [[B.b('hips'), 1]], { deform: (n) => [n[0] * 0.03 * s + n[2] * 0.0, Math.sign(n[1]) * pow(abs(n[1]), 0.6) * 0.085 * s, n[2] * 0.075 * s].map((v, i) => v) });
    if (bg.tassels) for (let k = 0; k < 3; k++) {
      const p0 = vadd(c, [0.01 * s, -0.09 * s, -0.04 * s + k * 0.04 * s]);
      tube(B.G, [p0, vadd(p0, [0, -0.07 * s, 0])], 5, clothRect(B, 'tassel_' + bg.tassels, 0.05, 0.05, bg.tassels, { folds: false }), (t) => ({ rx: 0.008 * s * (1 - t * 0.6) }), () => [[B.b('hips'), 1]], { nv: 2, linear: true });
    }
  }

  // expose helpers for other sections / bespoke builds
  Object.assign(C._internal, { torsoW, armW, legW, legPt, armPts, armProfile, legProfile, skinRect, handRect, clothRect, PX, buildHand, buildLegSkin, buildArmSkin, buildTorsoSkin, paintJacket, fabricOf });
})();

// ==================================================================================================== HEAD · FACE · HAIR · HATS · BEARDS
(() => {
  const C = G.Char3D, I = C._internal;
  const { grid, tube, blob, wmix, vadd, vsub, vsc, vlen, vnorm, vcross, vdot, vlerp, spline, sstep, lerp, clamp, rng, shade, mixc, rgba, lum, shadowOf, ribbon: _r } = I;
  const PI = Math.PI, TAU = PI * 2, D2R = PI / 180;
  const { sin, cos, abs, min, max, sqrt, hypot, atan2, asin, acos, pow, exp, floor, round } = Math;
  const Pn = C.paint;

  // ------------------------------------------------------------------------------------------ face parameters
  // Derived from the 2D spec (eyeStyle, brows, mouth, face{}) and overridable per look via spec.face3d.
  const EYE = {
    round:  { ew: 0.175, eh: 0.82, tilt: 0.05, iris: 0.62, lid: 1.0, lash: 0.2, low: 0.6, dbl: 0.4, droop: 0 },
    soft:   { ew: 0.17, eh: 0.72, tilt: 0.12, iris: 0.6, lid: 1.0, lash: 0.6, low: 0.55, dbl: 0.6, droop: 0.05 },
    sharp:  { ew: 0.17, eh: 0.58, tilt: 0.34, iris: 0.55, lid: 1.25, lash: 0.45, low: 0.7, dbl: 0.3, droop: 0 },
    narrow: { ew: 0.168, eh: 0.5, tilt: 0.12, iris: 0.52, lid: 1.15, lash: 0.2, low: 0.6, dbl: 0.5, droop: 0.32 },
    line:   { ew: 0.15, eh: 0.42, tilt: 0.0, iris: 0.42, lid: 1.0, lash: 0.0, low: 0.35, dbl: 0.0, droop: 0.42, happy: 0.55 },
    dot:    { ew: 0.13, eh: 0.66, tilt: 0.06, iris: 0.66, lid: 0.9, lash: 0.0, low: 0.3, dbl: 0.0, droop: 0.05, simple: 1 },
    fierce: { ew: 0.165, eh: 0.55, tilt: 0.42, iris: 0.42, lid: 1.4, lash: 0.2, low: 0.9, dbl: 0.2, droop: 0 },
  };
  const BROW = { normal: { w: 1, arch: 0.4, ang: 0.0 }, grumpy: { w: 1.35, arch: 0.1, ang: -0.35, low: 0.2 }, soft: { w: 0.8, arch: 0.55, ang: 0.12 }, fierce: { w: 1.4, arch: 0.25, ang: -0.55 } };
  function faceParams(B) {
    const S = B.S, P = B.P, f3 = S.face3d || {};
    const es = EYE[f3.eyeStyle || S.eyeStyle || 'round'] || EYE.round;
    const br = BROW[S.brows || 'normal'] || BROW.normal;
    const hairC = S.hair.color;
    const darkHair = lum(hairC) < 0.45;
    const F = Object.assign({
      skin: S.skin, iris: S.eyes || '#4a3328', sheenIris: null,
      ew: es.ew * (P.kid ? 1.85 : 1.72), eh: es.eh, tilt: es.tilt, irisR: es.iris, lidW: es.lid, lash: es.lash + (P.fem ? 0.25 : 0), low: es.low, dbl: es.dbl, droop: es.droop, happyBase: es.happy || 0, simple: es.simple || 0,
      eyeX: P.kid ? 0.43 : 0.42, eyeY: P.kid ? -0.15 : P.age ? -0.05 : -0.08, gap: 0,
      browW: br.w * 1.35, browArch: br.arch, browAng: br.ang, browLow: br.low || 0, browCol: darkHair ? shade(hairC, -0.1) : mixc(hairC, '#4a3a30', P.age ? 0.25 : 0.5), browY: 0.16,
      lidCol: '#2a1c1e', lips: P.fem ? '#d46a72' : shade(S.skin, -0.35), lipTint: P.fem ? 0.45 : 0.15,
      mouth: S.mouth || 'flat', mouthY: P.kid ? -0.56 : -0.6, mouthW: P.kid ? 0.15 : 0.17,
      noseY: P.kid ? -0.36 : -0.36, nose: P.age ? 1.2 : 1, blush: S.face && S.face.blush === false ? 0 : (P.fem || P.kid ? 0.5 : 0.18),
      wrinkles: P.age ? 1 : 0, marks: [], shaved: false,
      chin: P.fem ? 0.36 : P.kid ? 0.5 : P.belly ? 0.56 : 0.44, jaw: P.fem ? 0.8 : P.kid ? 0.9 : P.belly ? 0.95 : 0.88, cheek: P.kid ? 0.07 : P.fem ? 0.035 : 0.02,
      paint: S.face && S.face.paint, tattoo: S.face && S.face.tattoo,
    }, f3);
    if (F.irisLight == null) F.irisLight = shade(F.iris, 0.35);
    if (F.restCurve == null) F.restCurve = { smile: 0.42, frown: -0.42, smirk: 0.3, flat: 0 }[F.mouth] || 0;
    return F;
  }
  C.faceParams = faceParams;

  // ------------------------------------------------------------------------------------------ head geometry
  // Unit-sphere param (θ around y, 0 = front; φ polar from the crown) → deformed stylised head (absolute bind coords).
  function headDeform(B, n, F) {
    const P = B.P, a = P.headW / 2, b = P.head / 2, c = P.headD / 2;
    const [nx, ny, nz] = n;
    // width profile: full cranium, tapering jaw to a small chin
    const wk = ny > -0.12 ? 1 - 0.05 * sstep(0.55, 1, ny) : spline([-1, -0.9, -0.74, -0.52, -0.3, -0.12], [F.chin * 0.8, F.chin, lerp(F.chin, F.jaw, 0.62), F.jaw, 0.97, 1], ny);
    let x = nx * a * wk * (1 + F.cheek * exp(-pow((ny + 0.38) / 0.22, 2)) * (nz > 0 ? 1 : 0.3));
    let y = ny * b;
    let z;
    if (nz >= 0) {
      z = nz * c * (1 - 0.1 * sstep(0.4, 1, nz) * sstep(-0.6, 0.3, ny)); // flatter face plane
      // chin forward, under-jaw
      z += c * 0.18 * sstep(-0.55, -1, ny) * nz;
      // nose
      z += c * 0.075 * F.nose * exp(-pow(nx / 0.1, 2) - pow((ny - F.noseY) / 0.13, 2)) * sstep(0.7, 0.95, nz);
      // brow ridge (very subtle) & lips
      z += c * 0.02 * exp(-pow((ny - (F.eyeY + 0.2)) / 0.06, 2)) * sstep(0.6, 0.95, nz);
    } else {
      z = nz * c * 1.06 * (1 - 0.42 * sstep(-0.25, -0.95, ny));
    }
    // jaw underside rises toward the neck at the back
    if (ny < -0.55 && nz < 0.3) y += b * 0.15 * sstep(-0.55, -1, ny) * sstep(0.3, -0.6, nz);
    return [P.headC[0] + x, P.headC[1] + y, P.headC[2] + z];
  }
  function headPt(B, th, ph, off, F) {
    const n = [sin(ph) * sin(th), cos(ph), sin(ph) * cos(th)];
    const p = headDeform(B, n, F || B.F);
    if (!off) return p;
    // offset along the (smooth) ellipsoid normal
    const P = B.P, a = P.headW / 2, b = P.head / 2, c = P.headD / 2;
    const nn = vnorm([n[0] / a, n[1] / b, n[2] / c]);
    return vadd(p, vsc(nn, off));
  }
  C.headPt = headPt;
  function buildHead(B) {
    const P = B.P, F = B.F;
    const hb = B.b('head');
    const a = P.headW / 2, b = P.head / 2, c = P.headD / 2;
    const W = [[hb, 1]];
    // main head: 36 × 26
    grid(B.HG, 36, 26, 0, (u, v) => {
      const th = (u - 0.5) * TAU, ph = v * PI;
      const n = [sin(ph) * sin(th), cos(ph), sin(ph) * cos(th)];
      const p = headDeform(B, n, F);
      const ao = 1 - 0.3 * sstep(-0.6, -1, n[1]) * (n[2] < 0.5 ? 1 : 0.3);
      return { p, w: W, ao };
    }, {
      closed: true, flip: false,
      // anime faces: shade with smooth ellipsoid normals (no nose/jaw shading noise)
      normal: (u, v, p, gn) => {
        const th = (u - 0.5) * TAU, ph = v * PI;
        const n = [sin(ph) * sin(th), cos(ph), sin(ph) * cos(th)];
        const en = vnorm([n[0] / a, n[1] / b * 0.85, n[2] / c]);
        const g = vnorm(gn);
        const k = n[2] > 0.2 && n[1] > -0.8 ? 0.8 : 0.35;
        let nn = vnorm(vlerp(g, en, k));
        // face plate: bias toward a forward/up normal so the toon terminator never crosses the features
        const fw = sstep(0.25, 0.75, n[2]) * sstep(-0.95, -0.6, n[1]) * (1 - sstep(0.55, 0.9, n[1]));
        if (fw > 0) nn = vnorm(vlerp(nn, vnorm([n[0] * 0.35, 0.2, 1]), fw * 0.75));
        return nn;
      },
      uvf: (u, v) => {
        const th = (u - 0.5) * TAU, ph = v * PI;
        return [0.5 + 0.5 * sin(th / 2), (1 - cos(ph)) / 2];
      },
    });
    // ears
    for (const sg of [1, -1]) {
      const th = sg * 1.55, ph = acos(clamp(F.eyeY - 0.12, -1, 1));
      const base = headPt(B, th, ph, -0.004);
      const s = (F.ears || 1) * (P.age ? 1.15 : 1);
      blob(B.HG, 10, 8, 0, vadd(base, [0, 0, -0.008 * P.s]), [1, 1, 1], W, {
        deform: (n) => {
          const x = n[0] * 0.012 * s * P.s, y = n[1] * b * 0.3 * s, z = n[2] * c * 0.2 * s;
          return [x * cos(0.25 * sg) + sg * abs(n[0]) * 0.006 + (n[1] > 0 ? sg * 0.004 * n[1] : 0), y, z - (n[1] > 0 ? 0.004 * n[1] : 0)];
        },
        uvf: () => [0.5 + sg * 0.42, 0.55],
      });
    }
  }
  C.buildHead = buildHead;

  // ------------------------------------------------------------------------------------------ face painter (per instance)
  class FacePainter {
    constructor(B, size) {
      this.F = B.F; this.P = B.P; this.N = size;
      this.cv = document.createElement('canvas'); this.cv.width = this.cv.height = size;
      this.g = this.cv.getContext('2d');
      this.tex = G.R3M.canvasTex(this.cv);
      this.tex.generateMipmaps = true;
      this.key = '';
      this.a = B.P.headW / 2; this.b = B.P.head / 2;
      this.lw = size <= 256 ? 2.3 : 1.5; // stroke widths are in mm; keep them ≥ ~2 texels
    }
    // metres on the face (X: + = character's left, Y: up, relative to head centre) → canvas px
    px(X, Y) {
      const xn = X / this.a, yn = clamp(Y / this.b, -0.995, 0.995);
      const sp = sqrt(1 - yn * yn);
      const th = asin(clamp(xn / sp, -1, 1));
      return [(0.5 + 0.5 * sin(th / 2)) * this.N, (1 - yn) / 2 * this.N];
    }
    // set a local transform (units: mm, +y down) centred at face point (X, Y)
    at(X, Y, mirror = 1) {
      const e = 0.0005;
      const p0 = this.px(X, Y), px = this.px(X + e, Y), py = this.px(X, Y - e);
      const k = 0.001 / e;
      this.g.setTransform((px[0] - p0[0]) * k * mirror, (px[1] - p0[1]) * k * mirror, (py[0] - p0[0]) * k, (py[1] - p0[1]) * k, p0[0], p0[1]);
    }
    draw(st) {
      const key = st.key;
      if (key === this.key) return false;
      this.key = key;
      const g = this.g, N = this.N, F = this.F, a = this.a, b = this.b;
      g.setTransform(1, 0, 0, 1, 0, 0);
      // skin base (+ slight warm gradient, darker under the chin)
      g.fillStyle = F.skin; g.fillRect(0, 0, N, N);
      const gr = g.createLinearGradient(0, N * 0.72, 0, N);
      gr.addColorStop(0, rgba(F.skin, 0)); gr.addColorStop(1, rgba(shade(F.skin, -0.22), 0.85));
      g.fillStyle = gr; g.fillRect(0, 0, N, N);
      if (F.shaved) { // Qing shaved crown: bluish stubble on the front of the skull
        g.fillStyle = rgba(mixc(F.skin, '#5a6a80', 0.55), 0.45);
        g.beginPath(); g.ellipse(N * 0.5, 0, N * 0.42, N * 0.3, 0, 0, TAU); g.fill();
      }
      if (F.paint) this.paintFace(F.paint);
      if (F.tattoo) this.tattoo(F.tattoo);
      // hair shadow on the forehead under bangs
      if (F.bangShadow) {
        const [cx, cy] = this.px(0, b * (F.eyeY + 0.42));
        const gr2 = g.createLinearGradient(0, cy - N * 0.06, 0, cy + N * 0.05);
        gr2.addColorStop(0, rgba(shadowOf(F.skin, 0.25), 0.55)); gr2.addColorStop(1, rgba(F.skin, 0));
        g.save(); g.globalCompositeOperation = 'multiply';
        const rg = g.createRadialGradient(N * 0.5, cy - N * 0.05, N * 0.02, N * 0.5, cy - N * 0.05, N * 0.24);
        rg.addColorStop(0, rgba(shadowOf(F.skin, 0.12), 0.9)); rg.addColorStop(0.55, rgba(shadowOf(F.skin, 0.06), 0.5)); rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg; g.beginPath(); g.ellipse(N * 0.5, cy - N * 0.05, N * 0.24, N * 0.09, 0, 0, TAU); g.fill(); g.restore();
      }
      // blush
      const bl = clamp(F.blush + (st.blush || 0), 0, 1.4);
      if (bl > 0.02) for (const sg of [-1, 1]) {
        this.at(sg * a * 0.5, b * (F.eyeY - 0.28));
        const r = a * 1000 * 0.2;
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
        rg.addColorStop(0, rgba('#ff7a8a', 0.32 * bl)); rg.addColorStop(1, rgba('#ff7a8a', 0));
        g.fillStyle = rg; g.beginPath(); g.ellipse(0, 0, r * 1.25, r * 0.7, 0, 0, TAU); g.fill();
        if ((st.blush || 0) > 0.5) { g.strokeStyle = rgba('#e05a6a', 0.55); g.lineWidth = (0.5) * this.lw; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * 3 - 1.5, 1.5); g.lineTo(i * 3 + 1.5, -1.5); g.stroke(); } }
      }
      if (F.wrinkles) this.wrinkles(st);
      // eyes, brows
      for (const sg of [1, -1]) this.eye(sg, st);
      for (const sg of [1, -1]) this.brow(sg, st);
      this.nose(st);
      this.mouth(st);
      // marks (beauty mark etc.)
      for (const m of F.marks || []) { this.at(m.x * a, m.y * b); g.fillStyle = m.color || '#3a2424'; g.beginPath(); g.arc(0, 0, m.r || 0.7, 0, TAU); g.fill(); }
      if (st.tears) this.tears(st.tears);
      if (st.sweat) { this.at(-a * 0.72, b * (F.eyeY + 0.22)); g.fillStyle = 'rgba(170,215,255,0.9)'; g.beginPath(); g.moveTo(0, -3); g.quadraticCurveTo(2.2, 1, 0, 2.4); g.quadraticCurveTo(-2.2, 1, 0, -3); g.fill(); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      this.tex.needsUpdate = true;
      return true;
    }
    eye(sg, st) {
      const g = this.g, F = this.F, a = this.a, b = this.b;
      const ew = F.ew * a * 1000, eh = ew * F.eh;            // mm
      const X = sg * F.eyeX * a, Y = F.eyeY * b;
      this.at(X, Y, sg);                                      // local +x = outer corner
      const open = clamp(st.open, 0, 1.2);
      const tilt = F.tilt + (st.tilt || 0);
      const happy = clamp((st.happy || 0) + F.happyBase * (1 - (st.unHappy || 0)), 0, 1);
      const squint = clamp(st.squint || 0, 0, 1);
      const droop = clamp(F.droop + (st.droop || 0), -0.3, 0.95);
      const lidCol = F.lidCol;
      // key points
      const inX = -ew, outX = ew;
      const inY = eh * 0.12, outY = -eh * tilt;
      const topY = -eh * (1.0 - droop * 0.55) * open + (1 - open) * eh * 0.15;
      const botY = eh * (0.62 - squint * 0.45);
      g.lineCap = 'round'; g.lineJoin = 'round';
      if (open < 0.12 || happy > 0.6) {
        // closed / happy arcs
        g.strokeStyle = lidCol; g.lineWidth = (1.4 * F.lidW) * this.lw;
        g.beginPath();
        if (happy > 0.6) { g.moveTo(inX * 0.9, eh * 0.25); g.quadraticCurveTo(0, -eh * 0.75, outX * 0.95, eh * 0.15); }
        else { g.moveTo(inX * 0.95, eh * 0.05); g.quadraticCurveTo(0, eh * 0.55, outX, outY * 0.6 + eh * 0.05); }
        g.stroke();
        if (F.lash > 0.3 && !(happy > 0.6)) { g.lineWidth = (0.9) * this.lw; g.beginPath(); g.moveTo(outX * 0.96, eh * 0.05 + outY * 0.6); g.lineTo(outX * 1.2, -eh * 0.12 + outY * 0.6); g.stroke(); }
        return;
      }
      const upper = new Path2D();
      upper.moveTo(inX, inY);
      upper.bezierCurveTo(inX * 0.55, topY * 0.95, outX * 0.3, topY * 1.05, outX, outY);
      const shape = new Path2D();
      shape.moveTo(inX, inY);
      shape.bezierCurveTo(inX * 0.55, topY * 0.95, outX * 0.3, topY * 1.05, outX, outY);
      shape.bezierCurveTo(outX * 0.6, botY * 0.8, inX * 0.4, botY * 1.02, inX, inY);
      // eye white
      g.fillStyle = '#fbf7f4'; g.fill(shape);
      g.save(); g.clip(shape);
      // iris
      const lx = (st.lookX || 0) * sg, ly = st.lookY || 0;
      const ir = eh * F.irisR * (st.irisK || 1) * 1.45, irx = ir * 0.84;
      const ix = clamp(lx, -1, 1) * ew * 0.36, iy = clamp(-ly, -1, 1) * eh * 0.28 + eh * 0.08;
      if (!F.simple) {
        const ig = g.createLinearGradient(0, iy - ir, 0, iy + ir);
        ig.addColorStop(0, shade(F.iris, -0.55)); ig.addColorStop(0.45, F.iris); ig.addColorStop(1, F.irisLight);
        g.fillStyle = ig; g.beginPath(); g.ellipse(ix, iy, irx, ir, 0, 0, TAU); g.fill();
        g.strokeStyle = shade(F.iris, -0.6); g.lineWidth = (0.55) * this.lw; g.stroke();
        // pupil
        g.fillStyle = shade(F.iris, -0.75); g.beginPath(); g.ellipse(ix, iy + ir * 0.05, irx * 0.45 * (st.pupil || 1), ir * 0.5 * (st.pupil || 1), 0, 0, TAU); g.fill();
        // iris inner ring sparkle
        g.strokeStyle = rgba(F.irisLight, 0.6); g.lineWidth = (0.35) * this.lw; g.beginPath(); g.ellipse(ix, iy + ir * 0.25, irx * 0.62, ir * 0.45, 0, 0.15 * PI, 0.85 * PI); g.stroke();
        // highlights
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(ix - irx * 0.35 * sg, iy - ir * 0.42, irx * 0.3, ir * 0.24, -0.3 * sg, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(ix + irx * 0.35 * sg, iy + ir * 0.35, irx * 0.13, 0, TAU); g.fill();
      } else {
        g.fillStyle = shade(F.iris, -0.45); g.beginPath(); g.ellipse(ix, iy, irx * 0.92, ir * 0.95, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(ix - irx * 0.3 * sg, iy - ir * 0.38, irx * 0.28, 0, TAU); g.fill();
      }
      // lid shadow
      const ls = g.createLinearGradient(0, topY, 0, topY + eh * 0.7);
      ls.addColorStop(0, 'rgba(70,50,90,0.45)'); ls.addColorStop(1, 'rgba(70,50,90,0)');
      g.fillStyle = ls; g.fillRect(-ew * 1.2, topY - 1, ew * 2.4, eh * 0.8);
      g.restore();
      // upper lid line (thick, tapering, heavier at the outer corner) + lash flick
      g.strokeStyle = lidCol;
      g.lineWidth = (0.9 * F.lidW) * this.lw; g.stroke(upper);
      g.lineWidth = (1.6 * F.lidW) * this.lw;
      const outer = new Path2D(); outer.moveTo(outX * 0.15, topY * 1.02); outer.bezierCurveTo(outX * 0.45, topY * 1.02, outX * 0.8, (topY + outY) * 0.55, outX * 1.02, outY); g.stroke(outer);
      if (F.lash > 0.05) {
        g.fillStyle = lidCol;
        g.beginPath(); g.moveTo(outX * 0.82, outY - 0.3); g.lineTo(outX * (1.12 + 0.12 * F.lash), outY - eh * (0.25 + 0.25 * F.lash)); g.lineTo(outX * 1.02, outY + 0.4); g.fill();
        if (F.lash > 0.5) { g.beginPath(); g.moveTo(outX * 0.62, topY * 0.8); g.lineTo(outX * 0.86, topY * 1.08 - 0.6); g.lineTo(outX * 0.78, topY * 0.72); g.fill(); }
      }
      // lower lid
      if (F.low > 0) {
        g.strokeStyle = rgba(lidCol, 0.55); g.lineWidth = (0.5) * this.lw;
        g.beginPath(); g.moveTo(outX * 0.98, outY + 0.4); g.bezierCurveTo(outX * 0.6, botY * 0.82, outX * 0.05, botY * 1.02, inX * (0.2 + 0.5 * (1 - F.low)), botY * 0.95); g.stroke();
      }
      // double lid crease
      if (F.dbl > 0.05 && open > 0.6) {
        g.strokeStyle = rgba(shade(F.skin, -0.45), 0.55 * F.dbl); g.lineWidth = (0.45) * this.lw;
        g.beginPath(); g.moveTo(inX * 0.35, topY - eh * 0.32); g.bezierCurveTo(outX * 0.2, topY - eh * 0.42, outX * 0.7, topY - eh * 0.3, outX * 0.98, outY - eh * 0.25); g.stroke();
      }
      if (F.eyeShadow) { g.globalCompositeOperation = 'multiply'; const es = g.createLinearGradient(0, topY - eh * 0.8, 0, topY + 1); es.addColorStop(0, rgba(F.eyeShadow, 0)); es.addColorStop(1, rgba(F.eyeShadow, 0.6)); g.fillStyle = es; g.fillRect(-ew * 1.1, topY - eh * 0.8, ew * 2.4, eh * 0.9); g.globalCompositeOperation = 'source-over'; }
      if (F.bags) { g.strokeStyle = rgba(shade(F.skin, -0.4), 0.4 * F.bags); g.lineWidth = (0.5) * this.lw; g.beginPath(); g.moveTo(inX * 0.5, botY + eh * 0.35); g.quadraticCurveTo(0, botY + eh * 0.55, outX * 0.7, botY + eh * 0.25); g.stroke(); }
    }
    brow(sg, st) {
      const g = this.g, F = this.F, a = this.a, b = this.b;
      const ew = F.ew * a * 1000;
      const X = sg * F.eyeX * a, Y = (F.eyeY + F.browY + (st.browY || 0) * 0.12 - F.browLow * 0.05) * b;
      this.at(X, Y, sg);
      const ang = F.browAng + (st.browAng || 0);        // + = inner end raised (sad), − = inner lowered (angry)
      const inY = -ang * 6.0, outY = ang * 1.6 + 0.6;
      const w = F.browW * (st.browW || 1);
      g.fillStyle = F.browCol;
      g.beginPath();
      g.moveTo(-ew * 0.95, inY + 0.9 * w);
      g.quadraticCurveTo(-ew * 0.2, inY - 1.2 * w - F.browArch * 2.2 * (1 + (st.browArch || 0)), ew * 1.12, outY);
      g.quadraticCurveTo(-ew * 0.1, inY - 0.4 * w - F.browArch * 1.6, -ew * 0.95, inY - 0.55 * w);
      g.closePath(); g.fill();
      if (F.browBushy) { g.strokeStyle = F.browCol; g.lineWidth = (0.6) * this.lw; for (let i = 0; i < 6; i++) { const x = -ew * 0.9 + i * ew * 0.38; g.beginPath(); g.moveTo(x, inY + 0.4); g.lineTo(x + 1.6, inY + (outY - inY) * (i / 6) + 2.4 * F.browBushy); g.stroke(); } }
    }
    nose(st) {
      const g = this.g, F = this.F, a = this.a, b = this.b;
      this.at(0, F.noseY * b);
      if (F.noseRed) { const rg = g.createRadialGradient(0, 0, 0, 0, 0, 5); rg.addColorStop(0, rgba(F.noseRed, 0.55)); rg.addColorStop(1, rgba(F.noseRed, 0)); g.fillStyle = rg; g.beginPath(); g.arc(0, 0.5, 5, 0, TAU); g.fill(); }
      g.strokeStyle = rgba(shade(F.skin, -0.42), 0.85); g.lineWidth = (0.65 * (F.nose > 1.1 ? 1.2 : 1)) * this.lw; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-1.8 * F.nose, 0.9); g.quadraticCurveTo(-0.4, 1.7, 1.2 * F.nose, 0.9); g.stroke();
      g.fillStyle = rgba(shade(F.skin, -0.3), 0.5); g.beginPath(); g.ellipse(-2.2, -2.5, 0.9, 3.5, 0.25, 0, TAU); g.fill();
      g.fillStyle = rgba('#ffffff', 0.35); g.beginPath(); g.arc(0.6, -0.8, 0.7, 0, TAU); g.fill();
    }
    mouth(st) {
      const g = this.g, F = this.F, a = this.a, b = this.b;
      this.at(0, F.mouthY * b + (st.mouthDy || 0) * b);
      const w = F.mouthW * a * 1000 * (st.mouthW || 1);  // half width mm
      const curve = st.curve != null ? st.curve : F.restCurve || 0;       // + smile
      const open = clamp(st.mOpen || 0, 0, 1);
      const cy = -curve * 2.2;
      g.lineCap = 'round'; g.lineJoin = 'round';
      const lipLine = shade(F.lips, -0.45);
      if (open < 0.06) {
        g.strokeStyle = lipLine; g.lineWidth = (0.75) * this.lw;
        const sk = F.mouth === 'smirk' && st.curve == null ? 1.6 : 0;
        g.beginPath(); g.moveTo(-w, cy + sk * 0.4); g.quadraticCurveTo(0, cy + curve * 4.2 + (st.pout || 0) * 1.5, w, cy - sk); g.stroke();
        if (F.lipTint > 0.1) { g.fillStyle = rgba(F.lips, F.lipTint); g.beginPath(); g.ellipse(0, 1.5 + curve * 1.5, w * 0.55, 1.4, 0, 0, TAU); g.fill(); }
        if (curve > 0.5) { g.strokeStyle = rgba(lipLine, 0.6); g.lineWidth = (0.45) * this.lw; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * w * 1.02, cy - 0.6); g.lineTo(s * w * 1.12, cy + 0.6); g.stroke(); } }
        return;
      }
      const h = 1.4 + open * 10;
      const ww = w * (st.round ? 0.62 : 1);
      const p = new Path2D();
      p.moveTo(-ww, cy);
      p.quadraticCurveTo(0, cy - h * 0.18 + curve * 2.6, ww, cy);
      p.quadraticCurveTo(0, cy + h + curve * 2.2, -ww, cy);
      g.fillStyle = '#5a2228'; g.fill(p);
      g.save(); g.clip(p);
      if (open > 0.3 && !st.round) { g.fillStyle = '#fbf6f2'; g.fillRect(-ww, cy - h, ww * 2, h * 0.62); }
      g.fillStyle = '#d46a72'; g.beginPath(); g.ellipse(0, cy + h * 0.9, ww * 0.6, h * 0.45, 0, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = lipLine; g.lineWidth = (0.6) * this.lw; g.stroke(p);
    }
    wrinkles(st) {
      const g = this.g, F = this.F, a = this.a, b = this.b;
      g.strokeStyle = rgba(shade(F.skin, -0.4), 0.45 * F.wrinkles); g.lineWidth = (0.45) * this.lw; g.lineCap = 'round';
      for (const sg of [-1, 1]) {
        this.at(sg * a * 0.66, b * (F.eyeY + 0.02), sg); // crow's feet
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(0.5, i * 1.6); g.lineTo(3.2, i * 2.4); g.stroke(); }
        this.at(sg * a * 0.24, b * (F.mouthY + 0.12), sg); // nasolabial
        g.beginPath(); g.moveTo(-0.5, -6); g.quadraticCurveTo(2.5, -1, 1.2, 4); g.stroke();
      }
      this.at(0, b * 0.42); // forehead
      for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(-9, i * 2.5); g.quadraticCurveTo(0, i * 2.5 - 1.2, 9, i * 2.5); g.stroke(); }
    }
    tears(k) {
      const g = this.g, F = this.F, a = this.a, b = this.b;
      for (const sg of [-1, 1]) {
        this.at(sg * F.eyeX * a + sg * F.ew * a * 0.2, b * (F.eyeY - 0.08));
        g.fillStyle = 'rgba(170,215,255,0.85)';
        g.beginPath(); g.moveTo(-1, 0); g.quadraticCurveTo(-1.6, 6 * k, 0, 10 * k); g.quadraticCurveTo(1.6, 6 * k, 1, 0); g.fill();
      }
    }
    paintFace(pt) {
      const g = this.g, F = this.F, a = this.a, b = this.b;
      if (pt.style === 'opera') { // 歌仔戲: white base, rose eye shadow, winged brows, small red lips
        this.at(0, b * -0.1);
        g.fillStyle = pt.base || '#fbf2ee'; g.beginPath(); g.ellipse(0, 0, a * 1000 * 0.98, b * 1000 * 0.95, 0, 0, TAU); g.fill();
        for (const sg of [-1, 1]) {
          this.at(sg * F.eyeX * a, b * (F.eyeY - 0.02), sg);
          const rg = g.createRadialGradient(0, 0, 0, 0, 0, 14); rg.addColorStop(0, 'rgba(230,70,110,0.8)'); rg.addColorStop(1, 'rgba(230,70,110,0)');
          g.fillStyle = rg; g.beginPath(); g.ellipse(0, -2, 15, 10, 0.3, 0, TAU); g.fill();
        }
        F.lips = '#d0203a'; F.lipTint = 0.9; F.browCol = '#1a1418'; F.browAng = 0.35; F.browW = 1.2;
        return;
      }
      // painted ritual face (八家將 / procession figures)
      this.at(0, b * -0.05);
      g.fillStyle = pt.base || '#c8342c'; g.beginPath(); g.ellipse(0, 0, a * 1000 * 1.02, b * 1000 * 1.0, 0, 0, TAU); g.fill();
      if (pt.mark) {
        g.fillStyle = pt.mark;
        this.at(0, b * 0.32); g.beginPath(); g.moveTo(-4, 8); g.quadraticCurveTo(0, -16, 4, 8); g.closePath(); g.fill(); // forehead flame
        for (const sg of [-1, 1]) {
          this.at(sg * F.eyeX * a, b * (F.eyeY + 0.02), sg);
          g.beginPath(); g.moveTo(-14, -4); g.quadraticCurveTo(0, -16, 20, -10); g.quadraticCurveTo(10, 6, -14, 6); g.closePath(); g.fill(); // black eye mask swirl
          this.at(sg * a * 0.42, b * (F.mouthY + 0.08), sg);
          g.beginPath(); g.arc(0, 0, 4.5, 0, TAU); g.fill();
        }
      }
      if (pt.acc) {
        g.strokeStyle = pt.acc; g.lineWidth = (1.6) * this.lw;
        for (const sg of [-1, 1]) { this.at(sg * a * 0.55, b * (F.eyeY - 0.25), sg); g.beginPath(); g.moveTo(-6, -4); g.quadraticCurveTo(2, 2, -2, 10); g.stroke(); }
        this.at(0, b * 0.15); g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.stroke();
      }
      F.blush = 0;
    }
    tattoo(kind) { // 紋面: forehead band (+ cheek band from the ears to the mouth for women, chin band for men)
      const g = this.g, F = this.F, a = this.a, b = this.b;
      const col = 'rgba(40,52,78,0.8)';
      g.fillStyle = col;
      this.at(0, b * 0.36); g.fillRect(-3.2, -14, 6.4, 22);
      g.strokeStyle = rgba('#283450', 0.55); g.lineWidth = (0.5) * this.lw; for (let i = -12; i < 8; i += 3) { g.beginPath(); g.moveTo(-3, i); g.lineTo(3, i + 2); g.stroke(); }
      if (kind === 'truku_f') {
        g.fillStyle = col;
        for (const sg of [-1, 1]) {
          const p0 = this.px(sg * a * 0.95, b * -0.28), p1 = this.px(sg * a * 0.12, b * (F.mouthY - 0.02)), p2 = this.px(sg * a * 0.12, b * (F.mouthY - 0.2)), p3 = this.px(sg * a * 0.95, b * -0.48);
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo((p0[0] + p1[0]) / 2, p1[1] - 4, p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.quadraticCurveTo((p2[0] + p3[0]) / 2, p2[1], p3[0], p3[1]); g.closePath(); g.fill();
        }
      } else {
        this.at(0, b * (F.mouthY - 0.28)); g.fillRect(-5, -2.5, 10, 5);
      }
    }
  }
  C.FacePainter = FacePainter;

  // ------------------------------------------------------------------------------------------ hair
  function hairPaint(B, col, sheen, kind) {
    return (g, x, y, w, h) => {
      const dark = shade(col, lum(col) > 0.6 ? -0.28 : -0.45);
      const gr = g.createLinearGradient(0, y, 0, y + h);
      if (kind === 'cap') { gr.addColorStop(0, shade(col, 0.06)); gr.addColorStop(0.55, col); gr.addColorStop(1, dark); }
      else { gr.addColorStop(0, shade(col, -0.05)); gr.addColorStop(0.35, col); gr.addColorStop(1, mixc(col, dark, 0.6)); }
      g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4);
      // strand streaks along v
      const R = rng(B.id + kind);
      for (let i = 0; i < w * 0.9; i++) {
        const sx = x + R() * w, ln = h * (0.3 + R() * 0.7), sy = y + R() * (h - ln);
        g.strokeStyle = rgba(R() < 0.6 ? dark : shade(col, 0.25), 0.18 + R() * 0.2); g.lineWidth = 0.6 + R() * 0.8;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + (R() - 0.5) * 2, sy + ln); g.stroke();
      }
      // angel-ring highlight band
      const sh = sheen || shade(col, lum(col) > 0.6 ? 0.25 : 0.38);
      const hy = y + h * (kind === 'cap' ? 0.4 : 0.14), hh = h * (kind === 'cap' ? 0.1 : 0.06);
      g.save();
      for (let i = 0; i < w; i += 2) {
        const k = 0.5 + 0.5 * sin(i * 0.37) * sin(i * 0.11);
        g.fillStyle = rgba(sh, 0.35 + 0.35 * k);
        const yy = hy + sin(i * 0.21) * hh * 0.4;
        g.fillRect(x + i, yy - hh * (0.4 + 0.6 * k), 1.6, hh * 2 * (0.4 + 0.6 * k));
      }
      g.restore();
      if (B.S.hair.temples && kind === 'cap') { for (const uc of [0.25, 0.75]) { const gx = x + w * uc; const gr2 = g.createRadialGradient(gx, y + h * 0.85, 0, gx, y + h * 0.85, w * 0.12); gr2.addColorStop(0, rgba(B.S.hair.temples, 0.95)); gr2.addColorStop(1, rgba(B.S.hair.temples, 0)); g.fillStyle = gr2; g.fillRect(gx - w * 0.13, y + h * 0.5, w * 0.26, h * 0.52); } }
      if (B.S.hair.vines && kind !== 'cap') { g.strokeStyle = '#5a7a3a'; g.lineWidth = max(1, w * 0.04); for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x, y + h * (0.1 + i * 0.2)); g.lineTo(x + w, y + h * (0.18 + i * 0.2)); g.stroke(); } }
    };
  }
  // tapered lock along points. w0: base half-width, th0: half-thickness; W(t) weights
  function lock(B, rect, pts, w0, th0, W, opts = {}) {
    tube(B.G, pts, opts.seg || 6, rect, (t) => {
      const tip = opts.blunt ? 1 - 0.5 * sstep(0.85, 1, t) : pow(1 - pow(t, opts.taperP || 1.6), opts.taperQ || 0.9);
      const swell = 1 + (opts.swell || 0.15) * sin(t * PI);
      return { rx: max(0.0006, w0 * tip * swell * (opts.baseK && t < 0.15 ? lerp(opts.baseK, 1, t / 0.15) : 1)), ry: max(0.0005, th0 * (opts.blunt ? 1 : (1 - 0.7 * t))), ao: opts.ao ? opts.ao(t) : 1 };
    }, W, { nv: opts.nv || max(4, (pts.length - 1) * 3), up: opts.up || [0, 0, 1], uvf: opts.uvf });
  }
  C.lock = lock;

  // back-of-body clearance: z (negative) of the garment surface at height y, plus margin
  function backZ(B, y, extra = 0.03) {
    const P = B.P, R = C.torsoRings(P);
    const yy = clamp(y, P.legTop - 0.05, P.neckY);
    const r = C.ringAt(R, yy);
    return -(r.rb + 0.03 * P.s + (B.S.cape ? 0.05 : 0) + (B.S.vest ? 0.012 : 0) + extra);
  }
  function shoulderX(B, y) { const P = B.P; return y > P.shoulderY - 0.05 ? P.sh + P.armR * 0.6 : C.ringAt(C.torsoRings(P), clamp(y, P.legTop, P.neckY)).rx + 0.035; }

  function buildHair(B) {
    const S = B.S, P = B.P, H = S.hair, F = B.F;
    const style = H.style || 'messy';
    const col = H.color, sheen = H.sheen;
    const hb = B.b('head');
    const W = [[hb, 1]];
    const a = P.headW / 2, b = P.head / 2, c = P.headD / 2;
    const vol = H.vol || 1;
    const capR = B.rect('hairCap', 0.5, 0.35, hairPaint(B, col, sheen, 'cap'));
    const lockR = B.rect('hairLock', 0.3, 0.5, hairPaint(B, col, sheen, 'lock'));
    const R = B.R;
    if (style === 'bald') { F.shaved = false; return; }
    // ---- cap: hairline φmax(θ)
    const shaved = !!H.shaved;
    const fr = style === 'back' || style === 'part' ? 0.98 : 1.04;     // front hairline (rad from crown)
    const phiMax = (th) => {
      const t = abs(th);
      return spline([0, 0.55, 1.1, 1.5, 2.1, 2.6, PI], [fr, fr + 0.08, 1.42, 1.5, 1.85, 2.15, 2.22], t);
    };
    const capOff = (0.006 + 0.008 * vol) * P.s;
    if (!shaved) {
      grid(B.G, 30, 12, capR, (u, v) => {
        const th = (u - 0.5) * TAU, ph = v * phiMax(th);
        const off = capOff * (1 + 0.6 * sstep(0.8, 0, ph)) * (style === 'wild' ? 1.4 : 1);
        return { p: headPt(B, th, ph, off), w: W, ao: 1 - 0.2 * sstep(0.7, 1, v) };
      }, { closed: true });
    } else {
      // Qing 薙髮: only the back half of the scalp keeps hair (the rest is painted stubble on the face canvas)
      F.shaved = true;
      grid(B.G, 18, 10, capR, (u, v) => {
        const th = lerp(PI * 0.42, PI * 1.58, u), ph = lerp(0.55, phiMax(th) - 0.05, v);
        return { p: headPt(B, th, ph, capOff * 0.7), w: W };
      }, {});
    }
    // ---- fringe / bangs
    const bang = (th0, th1, phEnd, w0, opts = {}) => {
      const n = 6, pts = [];
      const ph0 = opts.ph0 != null ? opts.ph0 : 0.25;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const th = lerp(th0, th1, pow(t, opts.sweepP || 1.4));
        const ph = lerp(ph0, phEnd, t);
        const off = capOff * 1.4 + (opts.lift || 0.006) * P.s * sin(t * PI * 0.9) + 0.004 * t;
        pts.push(headPt(B, th, ph, off));
      }
      if (opts.curl) { const e = pts[n], d = vsub(pts[n], pts[n - 1]); pts[n] = vadd(e, vsc([d[0], 0, d[2]], opts.curl)); }
      lock(B, lockR, pts, w0 * P.s, 0.006 * P.s, W, { taperP: opts.blunt ? 3 : 1.5, blunt: opts.blunt, up: vnorm(vsub(pts[0], P.headC)), nv: 10 });
    };
    const eyeLvl = acos(clamp(F.eyeY + 0.18, -1, 1)); // φ at the brow line
    if (!shaved) {
      if (style === 'messy' || style === 'tuft' || style === 'wild') {
        const n = style === 'wild' ? 9 : 7;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1) - 0.5;
          const th0 = t * 1.5, th1 = th0 + (R() - 0.5) * 0.5 + t * 0.35;
          bang(th0, th1, eyeLvl - 0.05 - R() * 0.32 + (abs(t) > 0.35 ? 0.2 : 0), 0.026 + R() * 0.008, { lift: 0.01 + R() * 0.01, curl: R() * 0.5 });
        }
        F.bangShadow = true;
      } else if (style === 'side') {
        for (let i = 0; i < 6; i++) {
          const t = i / 5;
          bang(lerp(0.35, -0.6, t) * 1.0 + 0.5, lerp(-0.1, -1.0, t), eyeLvl - 0.1 + t * 0.25, 0.03, { ph0: 0.2, sweepP: 0.8 });
        }
        F.bangShadow = true;
      } else if (style === 'center') {
        const po = H.part || 0; // off-centre part (rad, + = toward the character's left)
        for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) {
          const t = i / 3;
          const span = (sg > 0 ? 1 - po : 1 + po) * (H.bangSpread || 1);
          // curtain fringe: short at the part, lengthening toward the temples so the eyes stay clear
          bang(po + sg * (0.08 + t * 0.35 * span), po + sg * (0.42 + t * 0.6) * span, eyeLvl + 0.05 + t * 0.35 + (H.bangLen || 0) + (H.bangSpread ? (t - 0.5) * 0.2 : 0), 0.03 - t * 0.003, { ph0: 0.12, sweepP: H.bangSpread ? 0.7 : 0.9, lift: 0.006 });
        }
      } else if (style === 'straight') {
        for (let i = 0; i < 9; i++) { const t = i / 8 - 0.5; bang(t * 1.6, t * 1.75, eyeLvl - 0.02 + abs(t) * 0.35, 0.028, { ph0: 0.2, blunt: true, lift: 0.004 }); }
        F.bangShadow = true;
      } else if (style === 'part') {
        for (let i = 0; i < 4; i++) { const t = i / 3; bang(0.55 - t * 0.2, -0.2 - t * 0.6, 0.85 + t * 0.35, 0.034, { ph0: 0.12, sweepP: 0.7, lift: 0.01 }); }
      } else if (style === 'back') {
        // combed back: a few raised ridge locks from the hairline over the crown
        for (let i = 0; i < 5; i++) {
          const th = (i / 4 - 0.5) * 1.1; const pts = [];
          for (let k = 0; k <= 5; k++) pts.push(headPt(B, th * (1 - k * 0.05), lerp(fr + 0.02, 0.2, k / 5), capOff * 1.25));
          lock(B, lockR, pts, 0.02 * P.s, 0.004 * P.s, W, { taperP: 3, up: [0, 1, 0], nv: 6 });
        }
      }
      if (style === 'tuft' || style === 'wild') { // spikes on top
        for (let i = 0; i < (style === 'wild' ? 8 : 3); i++) {
          const th = (R() - 0.5) * TAU, ph = 0.2 + R() * 0.6;
          const p0 = headPt(B, th, ph, capOff), nrm = vnorm(vsub(p0, P.headC));
          const p1 = vadd(p0, vsc(nrm, 0.04 * P.s)), p2 = vadd(p0, vadd(vsc(nrm, 0.075 * P.s), [0, -0.01, -0.02]));
          lock(B, lockR, [p0, p1, p2], 0.022 * P.s, 0.008 * P.s, W, { up: [0, 0, 1], nv: 5 });
        }
      }
    }
    // ---- side / face-framing locks
    const locks = H.locks || 0;
    const lockChains = [];
    if (locks > 0) {
      for (const sg of (H.locksSide === 'L' ? [1] : H.locksSide === 'R' ? [-1] : [-1, 1])) {
        const L = locks * P.head * 0.95;
        const p0 = headPt(B, sg * 1.0, 0.95, capOff * 1.3);
        const p1 = headPt(B, sg * 1.22, 1.45, capOff * 1.6);
        const p2 = vadd(p1, [sg * 0.006 * P.s, -L * 0.3, 0.012 * P.s]);
        const yEnd = p1[1] - L;
        const pts = [p0, p1, p2];
        const steps = 3;
        for (let k = 1; k <= steps; k++) { const t = k / steps; const y = lerp(p2[1], yEnd, t); const z = max(p2[2], y < P.neckY ? C.torsoPt(C.ringAt(C.torsoRings(P), clamp(y, P.legTop, P.neckY)), sg * 0.55, 0.05 * P.s)[2] + 0.02 : p2[2]); pts.push([p2[0] + sg * (y < P.shoulderY ? 0.03 : 0.012) * P.s * t, y, z]); }
        const ids = B.chain('lock' + (sg > 0 ? 'L' : 'R'), 'head', pts.slice(1), { stiff: 1.0, drag: 0.4, grav: 0.8, r: 0.014 * P.s, groups: ['body', 'head'], kind: 'hair' });
        lockChains.push(ids);
        const Wl = (t) => {
          const f = t * (pts.length - 1);
          if (f < 1) return W;
          const seg = clamp(f - 1, 0, ids.length - 1e-4), si = floor(seg), sf = seg - si;
          const w = [[ids[si], 1 - sf * 0.4]]; if (si + 1 < ids.length) w.push([ids[si + 1], sf * 0.4]);
          return f < 1.4 ? wmix(W, w, (f - 1) / 0.4) : w;
        };
        lock(B, lockR, pts, 0.024 * P.s * vol, 0.008 * P.s, Wl, { up: [sg, 0, 0.3], nv: 14 });
        if (locks > 1.0) lock(B, lockR, pts.map((p, i) => vadd(p, [sg * -0.012 * P.s * (i > 1 ? 1 : 0), 0, -0.012 * P.s])), 0.02 * P.s, 0.007 * P.s, Wl, { up: [sg, 0, 0.3], nv: 14 });
      }
    }
    // ---- back hair
    const back = H.back || 'short';
    const yEndLen = (len) => P.crown - len * P.crown * 1.0;
    if (H.queue) buildQueue(B, lockR, W, H);
    else if (back === 'short' || shaved) {
      if (!shaved && style !== 'back') for (let i = 0; i < 7; i++) { // nape tufts
        const th = PI + (i / 6 - 0.5) * 2.6;
        const p0 = headPt(B, th, 1.75, capOff), p1 = headPt(B, th, 2.15, capOff * 1.6);
        const p2 = vadd(p1, [sin(th) * 0.01, -0.03 * P.s, cos(th) * 0.012]);
        lock(B, lockR, [p0, p1, p2], 0.028 * P.s, 0.008 * P.s, W, { up: [sin(th), 0, cos(th)], nv: 5 });
      }
    } else if (back === 'long' || (back === 'lowtie' && !H.knotOnly)) {
      longHair(B, lockR, W, H, back === 'lowtie', capOff);
    } else if (back === 'ponytail') {
      ponytail(B, lockR, W, H, capOff);
    }
    // ---- knots / buns
    const tieCol = H.tie || shade(col, -0.2);
    const bunAt = (th, ph, r, rz) => {
      const c0 = headPt(B, th, ph, capOff + r * 0.75);
      blob(B.G, 12, 9, capR, c0, [r, r * (rz || 0.85), r], W, {});
      return c0;
    };
    const tieAt = (cen, nrm, r) => {
      const trect = C._internal.clothRect(B, 'tie' + tieCol, 0.05, 0.05, tieCol, { folds: false });
      const n = vnorm(nrm);
      tube(B.G, [vsub(cen, vsc(n, 0.004)), vadd(cen, vsc(n, 0.004))], 10, trect, () => ({ rx: r, ry: r }), () => W, { nv: 1, linear: true, up: Math.abs(n[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0] });
    };
    const k = H.knot;
    if (k === 'topknot') {
      const c0 = bunAt(PI, 0.22, 0.03 * P.s * vol, 1.05);
      tieAt(vadd(headPt(B, PI, 0.22, capOff), [0, 0.006, 0]), [0, 1, 0.2], 0.022 * P.s);
    } else if (k === 'bunTop') {
      bunAt(0, 0.0, 0.036 * P.s * vol, 0.9);
      if (H.tie) tieAt(headPt(B, 0, 0.0, capOff + 0.004), [0, 1, 0], 0.026 * P.s);
    } else if (k === 'bun') {
      bunAt(PI, 1.45, 0.042 * P.s * vol, 0.8);
      if (H.tie) tieAt(headPt(B, PI, 1.45, capOff + 0.01), [0, 0, -1], 0.03 * P.s);
    } else if (k === 'twin') {
      for (const sg of [-1, 1]) {
        const c0 = bunAt(sg * 2.05, 0.95, 0.032 * P.s, 0.9);
        tieAt(headPt(B, sg * 2.05, 0.95, capOff + 0.004), vsub(c0, P.headC), 0.024 * P.s);
        // short tails
        const p0 = vadd(c0, [sg * 0.01, -0.02, -0.01]);
        const pts = [p0, vadd(p0, [sg * 0.015, -0.06 * P.s, -0.01]), vadd(p0, [sg * 0.02, -0.12 * P.s, -0.015])];
        const ids = B.chain('twin' + (sg > 0 ? 'L' : 'R'), 'head', pts, { stiff: 1.0, drag: 0.35, grav: 0.8, r: 0.012, groups: ['body', 'head'], kind: 'hair' });
        lock(B, lockR, pts, 0.022 * P.s, 0.014 * P.s, (t) => (t < 0.1 ? W : [[ids[t < 0.5 ? 0 : 1], 1]]), { up: [0, 0, 1], nv: 8 });
      }
    } else if (k === 'halfup') {
      const c0 = bunAt(PI, 0.62, 0.026 * P.s, 0.8);
      if (H.tie) tieAt(headPt(B, PI, 0.62, capOff + 0.006), [0, 0.5, -1], 0.02 * P.s);
    }
    // ---- pins & ornaments
    for (const pin of H.pins || []) hairPin(B, pin, capOff);
    // ribbons (long ribbon ends from the tie)
    if (H.ribbon && B._tieAt) {
      const rc = H.tie || '#d8282a';
      const rrect = C._internal.clothRect(B, 'ribbon' + rc, 0.1, 0.5, rc, { weave: 'silk', folds: false });
      for (const sg of [-1, 1]) {
        const p0 = vadd(B._tieAt, [sg * 0.015 * P.s, 0, -0.01]);
        const L = 0.38 * P.s;
        const pts = [p0, vadd(p0, [sg * 0.02, -L * 0.25, -0.03]), vadd(p0, [sg * 0.025, -L * 0.55, -0.04]), vadd(p0, [sg * 0.025, -L * 0.8, -0.045]), vadd(p0, [sg * 0.02, -L, -0.05])];
        const ids = B.chain('ribbon' + (sg > 0 ? 'L' : 'R'), 'head', pts, { stiff: 0.35, drag: 0.25, grav: 1.0, r: 0.012, groups: ['body', 'head'], kind: 'ribbon' });
        C.ribbon(B, pts, ids, rrect, (t) => (0.014 + 0.004 * t) * P.s, [1, 0, 0], () => 0.002);
      }
    }
  }
  C.buildHair = buildHair;

  function longHair(B, lockR, W, H, tied, capOff) {
    const P = B.P, s = P.s;
    const len = H.len || 0.5;
    const yEnd = max(0.25, P.crown - len * P.crown);
    // 5 chains across the back (they make the sheet swing as one with soft variation)
    const nC = tied ? 1 : 5;
    const chains = [];
    const pathFor = (th, spread, k = 0) => {
      const pts = [];
      const p0 = headPt(B, th, 1.25, capOff * 1.4), p1 = headPt(B, th, 1.9, capOff * 1.8);
      pts.push(p0, p1);
      const ny = P.neckY - 0.01;
      const yS = P.shoulderY;
      const steps = 5;
      const sx = sin(th);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const y = lerp(p1[1] - 0.02, yEnd, t);
        const bz = backZ(B, y, 0.02 + 0.012 * k);
        const xw = tied ? sx * 0.03 * (1 - t) : sx * lerp(abs(p1[0]) / max(0.01, abs(sx)) * 0.9, shoulderX(B, min(y, yS)) * spread, sstep(0, 0.35, t));
        let x = tied ? p1[0] * (1 - t) : xw;
        let z = min(bz, p1[2] + (bz - p1[2]) * sstep(0, 0.3, t));
        if (abs(sx) > 0.8 && y < yS) z = lerp(z, bz * 0.3, 0.6); // side curtains drift toward the shoulder line
        pts.push([x, y, z]);
      }
      return pts;
    };
    for (let ci = 0; ci < nC; ci++) {
      const th = nC === 1 ? PI : PI + (ci / (nC - 1) - 0.5) * 2.2;
      const pts = pathFor(th, 0.9);
      const ids = B.chain('hairB' + ci, 'head', pts.slice(1), { stiff: 0.9, drag: 0.4, grav: 0.85, r: 0.03 * s, groups: ['body', 'head'], kind: 'hair' });
      chains.push({ th, ids });
    }
    const nS = tied ? 7 : 11;
    for (let i = 0; i < nS; i++) {
      const t = i / (nS - 1) - 0.5;
      const th = PI + t * (tied ? 2.0 : 2.5);
      const pts = pathFor(th, 0.95, (i % 2) * 0.6);
      // tied: all strands converge at the nape tie, then a single tail
      if (tied) { for (let k = 2; k < pts.length; k++) { const f = sstep(1, 3, k); pts[k] = [lerp(pts[k][0], 0, f), pts[k][1], pts[k][2]]; } }
      // weights: head for the scalp part, then blend between the two nearest chains
      let f = nC === 1 ? 0 : ((th - (PI - 1.1)) / 2.2) * (nC - 1);
      f = clamp(f, 0, nC - 1);
      const c0 = floor(f), c1 = min(nC - 1, c0 + 1), cf = f - c0;
      const np = pts.length;
      const Wf = (tt) => {
        const fp = tt * (np - 1);
        if (fp <= 1) return wmix(W, [[chains[c0].ids[0], 1]], sstep(0.5, 1, fp) * 0.5);
        const seg = clamp(fp - 1, 0, chains[c0].ids.length - 1e-4), si = floor(seg), sf = seg - si;
        const one = (ids) => { const w = [[ids[si], 1 - sf * 0.5]]; if (si + 1 < ids.length) w.push([ids[si + 1], sf * 0.5]); return w; };
        return wmix(one(chains[c0].ids), one(chains[c1].ids), cf);
      };
      const wid = (tied ? 0.03 : 0.036) * s * (1 - abs(t) * 0.25) * (H.vol || 1);
      lock(B, lockR, pts, wid, 0.012 * s, Wf, { up: [sin(th), 0, cos(th)], nv: 18, taperP: 2.2, taperQ: 0.8, swell: 0.25 });
    }
    if (tied) {
      const tie = headPt(B, PI, 2.0, capOff * 2.2);
      B._tieAt = tie;
      const tieCol = H.tie || shade(H.color, -0.2);
      const trect = C._internal.clothRect(B, 'tie' + tieCol, 0.05, 0.05, tieCol, { folds: false });
      tube(B.G, [vadd(tie, [0, 0.012, 0.004]), vadd(tie, [0, -0.012, -0.002])], 10, trect, () => ({ rx: 0.022 * s, ry: 0.018 * s }), () => [[chains[0].ids[0], 1]], { nv: 1, linear: true, up: [0, 0, 1] });
      // red string tails
      for (const sg of [-1, 1]) {
        const p0 = vadd(tie, [sg * 0.012, -0.01, -0.012]);
        const pts = [p0, vadd(p0, [sg * 0.01, -0.06, -0.01]), vadd(p0, [sg * 0.012, -0.12, -0.012])];
        tube(B.G, pts, 4, trect, () => ({ rx: 0.0028, ry: 0.0028 }), (t) => [[chains[0].ids[t < 0.5 ? 0 : 1], 1]], { nv: 4 });
      }
    }
  }
  function ponytail(B, lockR, W, H, capOff) {
    const P = B.P, s = P.s;
    // H.tiePh: tie height (φ from the crown; 0.62 = back of the head, ~0.25 = crown-high 高馬尾), H.arch: how far the
    // tail fountains up/back before falling (m), H.sweep: sideways drift of the tail (m, + = wearer's left)
    const tie = headPt(B, PI, H.tiePh != null ? H.tiePh : 0.62, capOff * 1.8);
    B._tieAt = tie;
    const len = (H.len || 0.4) * P.crown * 0.95;
    const p0 = vadd(tie, [0, 0.01 * s, -0.02 * s]);
    const ar = (H.arch || 0) * s, swp = (H.sweep || 0) * s;
    const pts = [p0, vadd(p0, [swp * 0.1, ar * 0.6, -0.06 * s - ar * 0.4]), vadd(p0, [swp * 0.25, -0.08 * s + ar * 0.5, -0.1 * s - ar * 0.9])];
    const steps = 4;
    for (let i = 1; i <= steps; i++) { const t = i / steps; const y = pts[2][1] - (len - 0.08 * s) * t; pts.push([swp * (0.25 + 0.75 * t), y, min(backZ(B, y, 0.03), -0.1 * s - P.headD * 0.4 - ar * (1 - t))]); }
    const ids = B.chain('tail', 'head', pts, { stiff: H.stiff || 0.55, drag: 0.22, grav: 0.85, r: 0.035 * s, groups: ['body', 'head'], kind: 'hair' });
    const np = pts.length;
    const Wf = (t) => { const f = t * (np - 1), seg = clamp(f, 0, ids.length - 1e-4), si = floor(seg), sf = seg - si; const w = [[ids[si], 1 - sf * 0.5]]; if (si + 1 < ids.length) w.push([ids[si + 1], sf * 0.5]); return w; };
    for (let k = 0; k < 3; k++) {
      const off = [(k - 1) * 0.012 * s, k === 1 ? 0.004 : 0, 0];
      lock(B, lockR, pts.map((p, i) => vadd(p, vsc(off, i === 0 ? 0.3 : 1 + i * 0.12))), (k === 1 ? 0.04 : 0.03) * s * (H.vol || 1), 0.022 * s, Wf, { up: [1, 0, 0], nv: 18, taperP: 1.7, swell: 0.4, baseK: 0.5 });
    }
    // gather tie + hair cone from the scalp into the tie
    const tieCol = H.tie || shade(H.color, -0.2);
    const trect = C._internal.clothRect(B, 'tie' + tieCol, 0.05, 0.05, tieCol, { folds: false });
    tube(B.G, [vadd(tie, [0, 0, 0.008]), vadd(tie, [0, 0, -0.018 * s])], 10, trect, () => ({ rx: 0.022 * s, ry: 0.022 * s }), () => W, { nv: 1, linear: true, up: [0, 1, 0] });
  }
  // 辮子 queue: braided tube from the back of the crown down the spine
  function buildQueue(B, lockR, W, H) {
    const P = B.P, s = P.s;
    const qR = B.rect('queue', 0.05, 0.6, (g, x, y, w, h) => {
      const col = H.color; g.fillStyle = shade(col, -0.2); g.fillRect(x - 2, y - 2, w + 4, h + 4);
      const n = 26;
      for (let i = 0; i < n; i++) for (const sd of [0, 1]) {
        const yy = y + (i + sd * 0.5) / n * h, xx = x + (sd ? w * 0.5 : 0);
        const gr = g.createLinearGradient(xx, yy, xx + w * 0.5, yy + h / n);
        gr.addColorStop(0, shade(col, 0.25)); gr.addColorStop(1, shade(col, -0.25));
        g.fillStyle = gr; g.beginPath(); g.ellipse(xx + w * 0.25, yy + h / n * 0.5, w * 0.3, h / n * 0.62, sd ? 0.5 : -0.5, 0, TAU); g.fill();
      }
    });
    const capOff = 0.012 * s;
    const p0 = headPt(B, PI, 0.95, capOff);
    const yEnd = (H.queueEnd != null ? H.queueEnd : P.waistY - 0.05 * s);
    const pts = [p0, headPt(B, PI, 1.6, capOff * 2.2)];
    for (let i = 1; i <= 4; i++) { const t = i / 4, y = lerp(pts[1][1] - 0.02, yEnd, t); pts.push([0, y, backZ(B, y, 0.012)]); }
    const ids = B.chain('queue', 'head', pts.slice(1), { stiff: 1.0, drag: 0.4, grav: 0.9, r: 0.016 * s, groups: ['body', 'head'], kind: 'hair' });
    const np = pts.length;
    const Wf = (t) => { const f = t * (np - 1); if (f < 1) return W; const seg = clamp(f - 1, 0, ids.length - 1e-4), si = floor(seg), sf = seg - si; const w = [[ids[si], 1 - sf * 0.5]]; if (si + 1 < ids.length) w.push([ids[si + 1], sf * 0.5]); return w; };
    tube(B.G, pts, 6, qR, (t) => ({ rx: lerp(0.024, 0.011, t) * s * (t < 0.12 ? 1.4 : 1), ry: lerp(0.018, 0.009, t) * s }), Wf, { nv: 18, up: [1, 0, 0] });
    // red silk tie + tassel at the end
    const tc = H.tie || '#b8342b';
    const trect = C._internal.clothRect(B, 'tie' + tc, 0.05, 0.05, tc, { folds: false });
    const e = pts[np - 1];
    const last = [[ids[ids.length - 1], 1]];
    tube(B.G, [vadd(e, [0, 0.012, 0]), vadd(e, [0, -0.012, 0])], 8, trect, () => ({ rx: 0.012 * s, ry: 0.012 * s }), () => last, { nv: 1, linear: true });
    tube(B.G, [vadd(e, [0, -0.012, 0]), vadd(e, [0, -0.07 * s, -0.004])], 8, trect, (t) => ({ rx: lerp(0.006, 0.012, t) * s, ry: lerp(0.006, 0.01, t) * s }), () => last, { nv: 3, linear: true });
  }

  function hairPin(B, pin, capOff) {
    const P = B.P, s = P.s, W = [[B.b('head'), 1]];
    const at = headPt(B, pin.th != null ? pin.th : 2.3, pin.ph != null ? pin.ph : 0.75, capOff + 0.008 * s);
    if (pin.type === 'lantern') {
      const lr = B.rect('pinLantern', 0.05, 0.05, (g, x, y, w, h, d, e) => { g.fillStyle = '#ffcf7a'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = '#c8402a'; g.fillRect(x, y, w, h * 0.15); g.fillRect(x, y + h * 0.85, w, h * 0.15); if (e) { e.fillStyle = '#ffb050'; e.fillRect(x, y + h * 0.15, w, h * 0.7); } }, { emissive: true, minPx: 8 });
      const c0 = vadd(at, [0, -0.025 * s, 0]);
      blob(B.G, 8, 6, lr, c0, [0.012 * s, 0.016 * s, 0.012 * s], W);
      tube(B.G, [at, c0], 4, lr, () => ({ rx: 0.0015 }), () => W, { nv: 1, linear: true });
      B.lights.push({ bone: 'head', pos: c0, color: '#ffb060', i: 0.25, r: 1.2, flicker: 0.15 });
    } else if (pin.type === 'flower') {
      const fc = pin.color || '#e8607a';
      const fr = C._internal.clothRect(B, 'flower' + fc, 0.04, 0.04, fc, { folds: false });
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; blob(B.G, 6, 4, fr, vadd(at, [cos(a) * 0.011 * s, sin(a) * 0.011 * s, 0.004]), [0.009 * s, 0.009 * s, 0.004 * s], W); }
      blob(B.G, 6, 4, C._internal.clothRect(B, 'flowerc', 0.03, 0.03, '#f6e070', { folds: false }), vadd(at, [0, 0, 0.007]), [0.005 * s, 0.005 * s, 0.004 * s], W);
    } else if (pin.type === 'comb') { // 梳篦: an arched jade comb pushed into the hair, optional red-string tails
      const cc = pin.color || '#9fd3bd';
      const cr = C._internal.clothRect(B, 'comb' + cc, 0.04, 0.04, cc, { folds: false, weave: 'silk', after: (g, x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, rgba('#ffffff', 0.45)); gr.addColorStop(0.5, rgba('#ffffff', 0)); gr.addColorStop(1, rgba('#1a4a3a', 0.3)); g.fillStyle = gr; g.fillRect(x, y, w, h); } });
      const nrm = vnorm(vsub(at, B.P.headC));
      const side = vnorm(vcross([0, 1, 0], nrm)), up = vnorm(vcross(nrm, side));
      const wC = (pin.w || 0.05) * s, hC = (pin.h || 0.022) * s;
      grid(B.G, 10, 2, cr, (u, v) => { const a = (u - 0.5) * PI; const r = lerp(0.35, 1, v); return { p: vadd(at, vadd(vadd(vsc(side, sin(a) * wC * 0.5 * r), vsc(up, (cos(a) * r - 0.2) * hC)), vsc(nrm, 0.004 * s * (1 - v) + 0.002 * s))), w: W }; }, {});
      grid(B.G, 10, 1, cr, (u, v) => { const a = (u - 0.5) * PI; return { p: vadd(at, vadd(vadd(vsc(side, sin(a) * wC * 0.5), vsc(up, (cos(a) - 0.2) * hC)), vsc(nrm, 0.002 * s + v * 0.005 * s))), w: W }; }, {});
      if (pin.string) {
        const sr = C._internal.clothRect(B, 'tie' + pin.string, 0.05, 0.05, pin.string, { folds: false });
        for (const k of [-1, 1]) {
          const p0 = vadd(at, vadd(vsc(side, k * wC * 0.3), vsc(nrm, 0.006 * s)));
          const pts = [p0, vadd(p0, vadd(vsc(side, k * 0.006), [0, -0.05 * s, 0])), vadd(p0, vadd(vsc(side, k * 0.01), [0, -0.1 * s, -0.005]))];
          const ids = B.chain('combStr' + (k > 0 ? 'a' : 'b'), 'head', pts, { stiff: 0.6, drag: 0.3, grav: 1.0, r: 0.006, groups: ['head'], kind: 'ribbon' });
          tube(B.G, pts, 4, sr, () => ({ rx: 0.0022 * s }), (t) => [[ids[t < 0.5 ? 0 : 1], 1]], { nv: 6 });
        }
      }
    } else { // gold hairpin (簪): a rod with a small ornament
      const gc = pin.color || '#e0b84a';
      const gr = C._internal.clothRect(B, 'gold' + gc, 0.04, 0.04, gc, { folds: false, weave: 'silk', after: (g, x, y, w, h) => { g.fillStyle = rgba('#fff', 0.4); g.fillRect(x, y, w, h * 0.3); } });
      const dir = vnorm(vsub(at, B.P.headC));
      const side = vnorm(vcross(dir, [0, 0, 1]));
      tube(B.G, [vsub(at, vsc(side, 0.05 * s)), vadd(at, vsc(side, 0.04 * s))], 5, gr, () => ({ rx: 0.0022 * s }), () => W, { nv: 1, linear: true });
      blob(B.G, 6, 5, gr, vadd(at, vsc(side, 0.045 * s)), [0.008 * s, 0.008 * s, 0.008 * s], W);
    }
  }

  // ------------------------------------------------------------------------------------------ hats
  function hatPaint(col, kind, acc) {
    return (g, x, y, w, h) => {
      const weave = kind === 'straw' ? 'straw' : kind === 'leather' ? 'leather' : kind === 'silk' ? 'silk' : 'cotton';
      Pn.cloth(g, x, y, w, h, col, { weave, folds: kind !== 'straw' && kind !== 'metal', weaveK: kind === 'straw' ? 0.45 : 0.2 });
      if (kind === 'straw') { g.strokeStyle = rgba(shade(col, -0.35), 0.5); g.lineWidth = 1; for (let i = 0; i < 24; i++) { g.beginPath(); g.moveTo(x + w * i / 24, y); g.lineTo(x + w * i / 24, y + h); g.stroke(); } for (let j = 1; j < 6; j++) { g.beginPath(); g.moveTo(x, y + h * j / 6); g.lineTo(x + w, y + h * j / 6); g.stroke(); } }
      if (kind === 'metal') { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, rgba('#ffffff', 0.35)); gr.addColorStop(0.5, rgba('#ffffff', 0)); gr.addColorStop(1, rgba('#000000', 0.25)); g.fillStyle = gr; g.fillRect(x, y, w, h); }
      if (acc) { g.fillStyle = acc; g.fillRect(x - 2, y + h * 0.88, w + 4, h * 0.12); }
    };
  }
  function buildHat(B) {
    const S = B.S, P = B.P, s = P.s, h = S.hat;
    if (!h || !h.type) return;
    const W = [[B.b('head'), 1]];
    const crown = headPt(B, 0, 0, 0);
    const top = crown[1];
    const hc = P.headC;
    const a = P.headW / 2, c = P.headD / 2;
    const col = h.color || '#c8a868', acc = h.acc;
    const hairOff = (0.012 + 0.008 * (S.hair.vol || 1)) * s;
    const ring = (yy, rx, rz, cz = hc[2]) => (th) => [sin(th) * rx, yy, cz + cos(th) * rz];
    const lathe = (rect, prof, nu = 28, Wt = W, opts = {}) => { // prof(v) → [r, y]; around head centre axis
      grid(B.G, nu, opts.nv || 8, rect, (u, v) => {
        const th = (u - 0.5) * TAU, [r, y] = prof(v);
        return { p: [hc[0] + sin(th) * r * (opts.sx || 1), y, hc[2] + (opts.cz || 0) + cos(th) * r * (opts.sz || 1)], w: Wt };
      }, { closed: true, flip: !!opts.flip });
    };
    const t = h.type;
    // Shell that follows the scalp (caps, scarves, crowns): φ from 0..phiEnd at offset
    const scalp = (rect, phiEnd, off, opts = {}) => grid(B.G, 28, opts.nv || 8, rect, (u, v) => {
      const th = (u - 0.5) * TAU, ph = v * (typeof phiEnd === 'function' ? phiEnd(th) : phiEnd);
      return { p: headPt(B, th, ph, off + (opts.bulge || 0) * sin(v * PI * 0.9)), w: W };
    }, { closed: true });
    if (t === 'douli' || t === 'tea' || t === 'qing') {
      const R0 = (t === 'qing' ? 0.2 : t === 'tea' ? 0.26 : 0.27) * s, Ht = (t === 'qing' ? 0.13 : 0.12) * s;
      const rect = B.rect('hat', 0.9, 0.3, hatPaint(col, t === 'qing' ? 'cotton' : 'straw'));
      const y0 = top - 0.035 * s + (t === 'qing' ? 0.005 : 0);
      // upper (outer) cone and underside (double-sided via two shells)
      lathe(rect, (v) => [lerp(0.004, R0, v), y0 + Ht * (1 - pow(v, 0.85)) - (v > 0.92 ? (v - 0.92) * 0.12 * s : 0)], 32, W, { nv: 6 });
      lathe(rect, (v) => [lerp(R0, a * 0.9, v), y0 - 0.006 * s + (v > 0.9 ? 0 : 0) + v * 0.02 * s], 32, W, { nv: 3, flip: true });
      if (t === 'qing') { // 紅纓 red tassel fringe radiating from the top + knob
        const tr = C._internal.clothRect(B, 'tassel' + (acc || '#c8282a'), 0.2, 0.2, acc || '#c8282a', { weave: 'silk', folds: false });
        for (let i = 0; i < 14; i++) { const th = i / 14 * TAU; const p0 = [hc[0], y0 + Ht * 0.98, hc[2]]; const p1 = [hc[0] + sin(th) * R0 * 0.62, y0 + Ht * 0.4, hc[2] + cos(th) * R0 * 0.62]; tube(B.G, [p0, vlerp(p0, p1, 0.5), p1], 4, tr, (k) => ({ rx: (0.006 + 0.01 * k) * s, ry: 0.004 * s }), () => W, { nv: 3, up: [0, 1, 0] }); }
        blob(B.G, 8, 6, tr, [hc[0], y0 + Ht + 0.01 * s, hc[2]], [0.014 * s, 0.014 * s, 0.014 * s], W);
      }
      if (t === 'tea' || h.fringe) { // cloth curtain hanging from the brim (tea pickers / Hakka 涼笠)
        const fc = h.fringe || '#f0ece2';
        const fr = C._internal.clothRect(B, 'fringe' + fc, 0.6, 0.12, fc, { weave: 'linen', nfolds: 18 });
        grid(B.G, 30, 3, fr, (u, v) => { const th = (u - 0.5) * TAU; const r = R0 * (0.96 + 0.02 * v); return { p: [hc[0] + sin(th) * r, y0 - 0.01 * s - v * 0.07 * s * (1 + 0.15 * sin(th * 9)), hc[2] + cos(th) * r], w: W }; }, { closed: true });
      }
      if (h.sigil) { // painted sigil on the crown of the hat (emissive)
        const sr = B.rect('hatSigil', 0.08, 0.08, (g, x, y, w, hh, d, e) => { g.fillStyle = col; g.fillRect(x - 2, y - 2, w + 4, hh + 4); Pn.texture(g, x, y, w, hh, 'straw', 0.4); for (const ctx of [g, e]) { if (!ctx) continue; ctx.strokeStyle = h.sigil; ctx.lineWidth = max(1.5, w * 0.06); ctx.beginPath(); ctx.arc(x + w / 2, y + hh / 2, w * 0.36, 0, TAU); ctx.stroke(); ctx.fillStyle = h.sigil; ctx.fillRect(x + w * 0.42, y + hh * 0.3, w * 0.16, hh * 0.36); } }, { emissive: true });
        lathe(sr, (v) => [lerp(0.004, R0 * 0.38, v), y0 + Ht * (1 - pow(v * 0.38, 0.85)) + 0.0015], 16, W, { nv: 2 });
      }
      if (h.strap) { const st = C._internal.clothRect(B, 'strap' + h.strap, 0.1, 0.1, h.strap, { folds: false }); for (const sg of [-1, 1]) tube(B.G, [[sg * a * 0.95, y0, hc[2]], [sg * a * 0.8, P.chin + 0.03 * s, hc[2] + 0.02], [0, P.chin - 0.005, hc[2] + c * 0.5]], 4, st, () => ({ rx: 0.0025 }), () => W, { nv: 6 }); }
      B.flags.wideHat = R0;
    } else if (t === 'cap') { // 瓜皮帽: six-panel skullcap with a knob
      const rect = B.rect('hat', 0.5, 0.2, (g, x, y, w, hh) => { hatPaint(col, 'silk')(g, x, y, w, hh); g.strokeStyle = rgba(shade(col, 0.35), 0.6); g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + w * i / 6, y); g.lineTo(x + w * i / 6, y + hh * 0.85); g.stroke(); } g.fillStyle = shade(col, -0.2); g.fillRect(x - 2, y + hh * 0.85, w + 4, hh * 0.15 + 2); });
      scalp(rect, (th) => 0.95 + 0.12 * (1 - cos(th)) * 0.5, hairOff + 0.006 * s, { nv: 8 });
      const kr = C._internal.clothRect(B, 'knob' + (acc || '#c0302a'), 0.03, 0.03, acc || '#c0302a', { folds: false, weave: 'silk' });
      blob(B.G, 8, 6, kr, vadd(crown, [0, hairOff + 0.014 * s, 0]), [0.011 * s, 0.009 * s, 0.011 * s], W);
    } else if (t === 'scarf' || t === 'hood') { // 頭巾: wrapped head cloth with a knot at the back
      const rect = B.rect('hat', 0.55, 0.25, (g, x, y, w, hh) => { Pn.cloth(g, x, y, w, hh, col, { weave: 'cotton', nfolds: 12 }); if (acc) for (let i = 0; i < 18; i++) { g.fillStyle = acc; g.beginPath(); g.arc(x + (i * 0.37 % 1) * w, y + (i * 0.61 % 1) * hh, 1.5, 0, TAU); g.fill(); } });
      scalp(rect, (th) => (t === 'hood' ? 2.1 : 1.35 + 0.35 * sstep(1.2, PI, abs(th))), hairOff + 0.008 * s, { nv: 9, bulge: 0.006 * s });
      const k = headPt(B, PI, 1.6, hairOff + 0.02 * s);
      blob(B.G, 8, 6, rect, k, [0.028 * s, 0.022 * s, 0.018 * s], W);
      const pts = [k, vadd(k, [0.02, -0.05 * s, -0.02]), vadd(k, [0.03, -0.1 * s, -0.03])];
      const ids = B.chain('scarfT', 'head', pts, { stiff: 0.8, drag: 0.35, grav: 0.9, r: 0.012, groups: ['body', 'head'], kind: 'ribbon' });
      C.ribbon(B, pts, ids, rect, (tt) => (0.02 - 0.006 * tt) * s, [1, 0, 0], () => 0.003);
    } else if (t === 'band') { // headband (woven motif)
      const hh = (h.h || 2.6) * C._internal.PX * 0.9 * s;
      const rect = B.rect('hat', 0.6, hh, (g, x, y, w, hh2) => { Pn.cloth(g, x, y, w, hh2, col, { weave: 'cotton', folds: false }); if (acc) Pn.motif(g, x, x + w, y + hh2 / 2, hh2 * 0.7, acc, h.motif || 'stripe'); });
      const ph0 = acos(clamp(B.F.eyeY + 0.42, -1, 1));
      grid(B.G, 30, 2, rect, (u, v) => { const th = (u - 0.5) * TAU; const ph = ph0 + 0.0 * sin(th) + v * hh / (P.head / 2) * 0.9 + 0.08 * (1 - cos(th)) * 0.5 * -1; return { p: headPt(B, th, ph, hairOff + 0.005 * s), w: W }; }, { closed: true });
      if (h.tails !== false && (t === 'band')) {
        const k = headPt(B, PI * 0.92, ph0 + 0.1, hairOff + 0.01 * s);
        for (const sg of [-1, 1]) { const pts = [k, vadd(k, [sg * 0.015, -0.05 * s, -0.025]), vadd(k, [sg * 0.02, -0.11 * s, -0.035])]; const ids = B.chain('bandT' + sg, 'head', pts, { stiff: 0.7, drag: 0.3, grav: 0.9, r: 0.01, groups: ['body', 'head'], kind: 'ribbon' }); C.ribbon(B, pts, ids, rect, () => hh * 0.4, [1, 0, 0], () => 0.002); }
      }
    } else if (t === 'wreath') { // 卑南 flower wreath
      const ph0 = acos(clamp(B.F.eyeY + 0.45, -1, 1));
      const leaf = C._internal.clothRect(B, 'leaf', 0.05, 0.05, '#3a7a3a', { folds: false });
      const cols = ['#f2c230', '#e8503a', '#f4f0e8', '#e86a9a'];
      for (let i = 0; i < 16; i++) {
        const th = i / 16 * TAU; const p = headPt(B, th, ph0 + 0.04 * sin(th * 2), hairOff + 0.016 * s);
        blob(B.G, 6, 4, leaf, p, [0.016 * s, 0.01 * s, 0.016 * s], W);
        const fr = C._internal.clothRect(B, 'flower' + cols[i % 4], 0.04, 0.04, cols[i % 4], { folds: false });
        blob(B.G, 7, 5, fr, vadd(p, vsc(vnorm(vsub(p, hc)), 0.01 * s)), [0.014 * s, 0.014 * s, 0.014 * s], W);
      }
    } else if (t === 'tsou') { // 鄒: leather cap with long feathers
      const rect = B.rect('hat', 0.5, 0.2, hatPaint(col, 'leather', shade(col, -0.3)));
      scalp(rect, 1.25, hairOff + 0.008 * s, { nv: 8, bulge: 0.004 });
      const fr = B.rect('feather', 0.06, 0.4, (g, x, y, w, hh) => { g.fillStyle = '#f4f0e8'; g.fillRect(x - 2, y - 2, w + 4, hh + 4); g.fillStyle = '#2a2420'; g.fillRect(x, y + hh * 0.55, w, hh * 0.12); g.fillRect(x, y + hh * 0.8, w, hh * 0.2); g.fillStyle = '#c0302c'; g.fillRect(x + w * 0.45, y, w * 0.1, hh); });
      for (let i = 0; i < 3; i++) {
        const p0 = headPt(B, PI * 0.85 + i * 0.12, 0.35, hairOff + 0.01);
        const pts = [p0, vadd(p0, [0.01, 0.12 * s, -0.04]), vadd(p0, [0.02, 0.25 * s, -0.1]), vadd(p0, [0.03, 0.33 * s, -0.18])];
        const ids = B.chain('feather' + i, 'head', pts, { stiff: 3, drag: 0.4, grav: 0.2, r: 0.01, groups: ['head'], kind: 'feather' });
        C.ribbon(B, pts, ids, fr, (tt) => 0.012 * s * (1 - tt * 0.6), [1, 0, 0], () => 0.0015);
      }
    } else if (t === 'crown') { // 髮冠: small crown over the top knot with a horizontal pin
      const rect = B.rect('hat', 0.15, 0.08, (g, x, y, w, hh) => { hatPaint(col, h.metal ? 'metal' : 'wood')(g, x, y, w, hh); if (acc) { g.fillStyle = acc; g.fillRect(x, y + hh * 0.1, w, hh * 0.12); } });
      const c0 = vadd(headPt(B, PI, 0.18, hairOff), [0, 0.012 * s, 0]);
      grid(B.G, 14, 4, rect, (u, v) => { const th = (u - 0.5) * TAU; const r = lerp(0.03, 0.024, v) * s; return { p: [c0[0] + sin(th) * r * 0.9, c0[1] + v * 0.05 * s, c0[2] + cos(th) * r * 1.15], w: W }; }, { closed: true });
      blob(B.G, 10, 4, rect, vadd(c0, [0, 0.05 * s, 0]), [0.024 * s * 0.9, 0.006 * s, 0.024 * s * 1.15], W);
      const pr = C._internal.clothRect(B, 'pin' + (acc || '#efe4c8'), 0.04, 0.04, acc || '#efe4c8', { folds: false });
      tube(B.G, [vadd(c0, [-0.06 * s, 0.03 * s, 0]), vadd(c0, [0.06 * s, 0.03 * s, 0])], 5, pr, () => ({ rx: 0.0035 * s }), () => W, { nv: 1, linear: true });
      B.flags.crownTop = vadd(c0, [0, 0.056 * s, 0]);
    } else if (t === 'taoist' || t === 'scholar') { // 道冠 / 儒巾: tall soft cap with flat top and back flaps
      const rect = B.rect('hat', 0.5, 0.25, (g, x, y, w, hh) => { hatPaint(col, 'silk')(g, x, y, w, hh); if (acc) { g.fillStyle = acc; g.fillRect(x, y + hh * 0.1, w, hh * 0.06); Pn.motif(g, x, x + w, y + hh * 0.5, hh * 0.18, acc, 'cloud'); } });
      const Ht = (t === 'taoist' ? 0.13 : 0.1) * s;
      const base = headPt(B, 0, 0.78, hairOff + 0.004).map((v) => v);
      const y0 = top - 0.06 * s;
      grid(B.G, 24, 6, rect, (u, v) => { const th = (u - 0.5) * TAU; const sq = (k) => Math.sign(k) * pow(abs(k), 0.6); const r = lerp(1, 0.96, v); const pp = headPt(B, th, 0.95 - v * 0.95, hairOff + 0.006 * s); const yy = lerp(pp[1], y0 + Ht, sstep(0.2, 1, v)); return { p: [hc[0] + sq(sin(th)) * a * 1.08 * r, v < 0.25 ? pp[1] : yy, hc[2] + sq(cos(th)) * c * 1.05 * r], w: W }; }, { closed: true });
      grid(B.G, 24, 2, rect, (u, v) => { const th = (u - 0.5) * TAU; const sq = (k) => Math.sign(k) * pow(abs(k), 0.6); return { p: [hc[0] + sq(sin(th)) * a * 1.04 * (1 - v), y0 + Ht, hc[2] + sq(cos(th)) * c * 1.01 * (1 - v)], w: W }; }, { closed: true, flip: true });
      if (t === 'scholar') for (const sg of [-1, 1]) { const p0 = [hc[0] + sg * a * 0.5, y0 + Ht * 0.3, hc[2] - c * 1.0]; const pts = [p0, vadd(p0, [sg * 0.02, -0.08 * s, -0.02]), vadd(p0, [sg * 0.03, -0.16 * s, -0.025])]; const ids = B.chain('flap' + sg, 'head', pts, { stiff: 1, drag: 0.35, grav: 0.8, r: 0.01, groups: ['body', 'head'], kind: 'ribbon' }); C.ribbon(B, pts, ids, rect, () => 0.022 * s, [1, 0, 0], () => 0.002); }
    } else if (t === 'guard' || t === 'peaked' || t === 'giant' || t === 'ornate' || t === 'bajia') {
      const metal = t === 'guard' || t === 'giant';
      const rect = B.rect('hat', 0.6, 0.3, hatPaint(col, metal ? 'metal' : 'silk', acc));
      const big = t === 'giant' ? 1.25 : 1;
      scalp(rect, (th) => (t === 'peaked' ? 1.05 : 1.2), hairOff + (t === 'peaked' ? 0.01 : 0.014) * s * big, { nv: 8, bulge: (t === 'peaked' ? 0.014 : 0.006) * s });
      if (t === 'peaked') { // visor
        grid(B.G, 12, 2, rect, (u, v) => { const th = lerp(-1.0, 1.0, u); const p = headPt(B, th, 1.05, hairOff + 0.012 * s); return { p: vadd(p, [sin(th) * v * 0.03 * s, -v * 0.012 * s, cos(th) * v * 0.055 * s]), w: W }; }, {});
      }
      if (t === 'guard' || t === 'giant') { // brim + spike + neck flaps
        lathe(rect, (v) => [lerp(a * 1.12, a * 1.38, v) * big, P.headC[1] + P.head * 0.18 - v * 0.012], 28, W, { nv: 2 });
        const sp = [hc[0], top + 0.02 * s * big, hc[2]];
        tube(B.G, [sp, vadd(sp, [0, 0.08 * s * big, 0])], 8, rect, (k) => ({ rx: (0.012 * (1 - k) + 0.001) * s * big }), () => W, { nv: 3, linear: true });
        if (acc) { const tr = C._internal.clothRect(B, 'tassel' + acc, 0.1, 0.1, acc, { folds: false, weave: 'silk' }); blob(B.G, 8, 6, tr, vadd(sp, [0, 0.03 * s * big, 0]), [0.02 * s * big, 0.015 * s * big, 0.02 * s * big], W); }
      }
      if (t === 'ornate' || t === 'bajia' || t === 'giant') { // tall front plate + pompoms
        const fr = vadd(headPt(B, 0, 0.6, hairOff + 0.02 * s), [0, 0.02, 0]);
        grid(B.G, 10, 3, rect, (u, v) => { const x = (u - 0.5) * 0.14 * s * big; return { p: [fr[0] + x, fr[1] + v * 0.09 * s * big + (1 - abs(u - 0.5) * 2) * 0.03 * s * v, fr[2] + 0.01 * s - v * 0.02 * s - x * x * 2], w: W }; }, {});
        const pc = [acc || '#e23a3a', '#f2e070', '#4a9ae0'];
        for (let i = 0; i < 5; i++) { const pr = C._internal.clothRect(B, 'pom' + pc[i % 3], 0.03, 0.03, pc[i % 3], { folds: false, weave: 'silk' }); blob(B.G, 6, 5, pr, vadd(fr, [(i - 2) * 0.03 * s * big, 0.1 * s * big + (i % 2) * 0.01, -0.01]), [0.012 * s * big, 0.012 * s * big, 0.012 * s * big], W); }
        if (h.horns) { const hr = C._internal.clothRect(B, 'horn', 0.05, 0.1, h.horns, { folds: false }); for (const sg of [-1, 1]) { const p0 = headPt(B, sg * 0.9, 0.55, hairOff + 0.015 * s); tube(B.G, [p0, vadd(p0, [sg * 0.05 * s, 0.07 * s, 0]), vadd(p0, [sg * 0.11 * s, 0.11 * s, -0.02])], 7, hr, (k) => ({ rx: 0.016 * s * (1 - k) + 0.001 }), () => W, { nv: 6 }); } }
      }
    } else if (t === 'veil') {
      const rect = B.rect('hat', 0.6, 0.5, (g, x, y, w, hh) => Pn.cloth(g, x, y, w, hh, col, { weave: 'silk', nfolds: 14 }));
      scalp(rect, 2.3, hairOff + 0.01 * s, { nv: 10, bulge: 0.006 * s });
    } else if (t === 'amis') { // festive headdress: woven band + tall white feather fan + bead strings
      const rect = B.rect('hat', 0.6, 0.06, (g, x, y, w, hh) => { Pn.cloth(g, x, y, w, hh, '#d4282a', { folds: false }); Pn.motif(g, x, x + w, y + hh / 2, hh * 0.7, '#f2c230', 'diamond'); });
      const ph0 = acos(clamp(B.F.eyeY + 0.44, -1, 1));
      grid(B.G, 30, 2, rect, (u, v) => { const th = (u - 0.5) * TAU; return { p: headPt(B, th, ph0 + v * 0.25, hairOff + 0.008 * s), w: W }; }, { closed: true });
      const fr = B.rect('feather', 0.06, 0.4, (g, x, y, w, hh) => { g.fillStyle = '#f6f2ea'; g.fillRect(x - 2, y - 2, w + 4, hh + 4); g.fillStyle = '#2a2420'; g.fillRect(x, y + hh * 0.85, w, hh * 0.15); });
      for (let i = 0; i < 9; i++) { const th = (i / 8 - 0.5) * 1.6; const p0 = headPt(B, th, ph0 - 0.05, hairOff + 0.012 * s); const d = vnorm(vsub(p0, hc)); tube(B.G, [p0, vadd(p0, vadd(vsc(d, 0.05 * s), [0, 0.1 * s, 0])), vadd(p0, vadd(vsc(d, 0.08 * s), [0, 0.2 * s, 0]))], 4, fr, (k) => ({ rx: 0.012 * s * (1 - k * 0.5), ry: 0.002 }), () => W, { nv: 4, up: d }); }
    }
  }
  C.buildHat = buildHat;

  // ------------------------------------------------------------------------------------------ beards, masks, glasses
  function buildFaceExtras(B) {
    const S = B.S, P = B.P, s = P.s, F = B.F, fc = S.face || {};
    const W = [[B.b('head'), 1]];
    const bcol = fc.beardColor || shade(S.hair.color, 0.05);
    if (fc.beard) {
      const br = B.rect('beard', 0.2, 0.3, hairPaint(B, bcol, null, 'lock'));
      const kind = fc.beard;
      const mouthPh = acos(clamp(F.mouthY, -1, 1));
      if (kind === 'mustache' || kind === 'whiskers' || kind === 'full' || kind === 'goatee' || kind === 'long') {
        // 八字 mustache: two drooping strands from under the nose
        const droop = kind === 'whiskers' ? 0.09 : kind === 'goatee' ? 0.035 : 0.04;
        for (const sg of [-1, 1]) {
          const pts = [];
          for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(headPt(B, sg * lerp(0.02, 0.42, t), lerp(mouthPh - 0.2, mouthPh + 0.06, t), 0.004 * s + 0.004 * s * sin(t * PI))); }
          if (kind === 'whiskers') { const e = pts[4]; pts.push(vadd(e, [sg * 0.008, -droop * s * 0.6, 0.004]), vadd(e, [sg * 0.01, -droop * s, 0.002])); }
          if (fc.beardCurl) { const e = pts[4]; pts.push(vadd(e, [sg * 0.006 * s, 0.006 * s, 0.002]), vadd(e, [sg * 0.004 * s, 0.012 * s, 0.003])); }
          lock(B, br, pts, (kind === 'full' ? 0.012 : 0.009) * s * (fc.beardThin || 1), 0.004 * s * (fc.beardThin || 1), () => W, { up: [0, 0, 1], nv: 8, taperP: 1.3 });
        }
      }
      if (kind === 'goatee' || kind === 'whiskers') {
        const p0 = headPt(B, 0, PI * 0.96, 0.004 * s), p1 = vadd(p0, [0, -0.03 * s, 0.012 * s]), p2 = vadd(p0, [0, -0.055 * s, 0.01 * s]);
        lock(B, br, [headPt(B, 0, PI * 0.86, 0.003), p0, p1, p2], (kind === 'goatee' ? 0.012 : 0.008) * s * (fc.beardThin ? 0.75 : 1), 0.008 * s, () => W, { up: [0, 0, 1], nv: 8 });
      }
      if (kind === 'full') { // beard shell over the jaw
        grid(B.G, 18, 5, br, (u, v) => { const th = lerp(-1.75, 1.75, u); const ph = lerp(mouthPh + 0.1, PI * 0.995, v) - (abs(th) > 1.2 ? (abs(th) - 1.2) * 0.4 * (1 - v) : 0); return { p: headPt(B, th, ph, 0.006 * s + 0.01 * s * v * (1 - abs(th) / 1.75)), w: W }; }, {});
      }
      if (kind === 'long') { // long flowing beard on a chain
        const p0 = headPt(B, 0, PI * 0.9, 0.006 * s);
        const L = 0.2 * s;
        const pts = [p0, vadd(p0, [0, -0.05 * s, 0.02 * s]), vadd(p0, [0, -0.12 * s, 0.035 * s]), vadd(p0, [0, -L, 0.04 * s])];
        const ids = B.chain('beard', 'head', pts, { stiff: 1.4, drag: 0.4, grav: 0.6, r: 0.02, groups: ['body'], kind: 'hair' });
        const Wf = (t) => (t < 0.2 ? W : [[ids[min(2, floor(t * 3))], 1]]);
        lock(B, br, [headPt(B, 0, mouthPh + 0.25, 0.004), ...pts], 0.03 * s, 0.012 * s, Wf, { up: [0, 0, 1], nv: 14, swell: 0.3 });
        for (const sg of [-1, 1]) lock(B, br, [headPt(B, sg * 0.6, mouthPh + 0.1, 0.004), headPt(B, sg * 0.4, PI * 0.92, 0.008), vadd(pts[2], [sg * 0.015, 0, -0.005]), vadd(pts[3], [sg * 0.012, 0.02, -0.005])], 0.018 * s, 0.008 * s, Wf, { up: [0, 0, 1], nv: 10 });
      }
    }
    if (fc.glasses) {
      const gr = C._internal.clothRect(B, 'glasses', 0.03, 0.03, '#a8884a', { folds: false });
      for (const sg of [-1, 1]) {
        const c0 = headPt(B, sg * F.eyeX * 0.95, acos(clamp(F.eyeY, -1, 1)), 0.014 * s);
        const pts = []; for (let i = 0; i <= 16; i++) { const a2 = i / 16 * TAU; pts.push(vadd(c0, [cos(a2) * 0.0135 * s, sin(a2) * 0.012 * s, 0])); }
        tube(B.G, pts, 3, gr, () => ({ rx: 0.0009 * s }), () => W, { nv: 16, up: [0, 0, 1] });
      }
    }
    if (fc.mask === 'ghost' || fc.mask === 'facecloth') {
      const ghost = fc.mask === 'ghost';
      const mr = B.rect('mask', 0.25, 0.25, (g, x, y, w, h) => {
        if (ghost) { // 鬼面: lacquered demon mask
          g.fillStyle = '#e8e2d8'; g.fillRect(x - 2, y - 2, w + 4, h + 4);
          g.fillStyle = '#a8202a';
          g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.05); g.lineTo(x + w * 0.56, y + h * 0.3); g.lineTo(x + w * 0.44, y + h * 0.3); g.fill();
          for (const sg of [-1, 1]) {
            const ex = x + w * (0.5 + sg * 0.2), ey = y + h * 0.42;
            g.fillStyle = '#1a1418'; g.beginPath(); g.moveTo(ex - sg * w * 0.12, ey + h * 0.04); g.quadraticCurveTo(ex, ey - h * 0.12, ex + sg * w * 0.13, ey - h * 0.06); g.quadraticCurveTo(ex, ey + h * 0.08, ex - sg * w * 0.12, ey + h * 0.04); g.fill();
            g.strokeStyle = '#a8202a'; g.lineWidth = max(1.5, w * 0.02); g.beginPath(); g.moveTo(ex - sg * w * 0.14, ey - h * 0.1); g.quadraticCurveTo(ex, ey - h * 0.22, ex + sg * w * 0.18, ey - h * 0.16); g.stroke();
            g.beginPath(); g.moveTo(x + w * (0.5 + sg * 0.08), y + h * 0.7); g.quadraticCurveTo(x + w * (0.5 + sg * 0.25), y + h * 0.62, x + w * (0.5 + sg * 0.3), y + h * 0.8); g.stroke();
          }
          g.fillStyle = '#1a1418'; g.fillRect(x + w * 0.38, y + h * 0.74, w * 0.24, h * 0.05);
          g.fillStyle = '#f4f0e8'; for (let i = 0; i < 5; i++) g.fillRect(x + w * (0.39 + i * 0.045), y + h * 0.74, w * 0.03, h * 0.03);
          Pn.aoEdges(g, x, y, w, h, 0.2, 0.25);
        } else { // flower-print face cloth
          Pn.cloth(g, x, y, w, h, fc.clothColor || '#d65a6a', { folds: false });
          const fa = fc.clothAcc || '#f6e6a0';
          for (let i = 0; i < 16; i++) { const fx = x + ((i * 0.618) % 1) * w, fy = y + ((i * 0.37) % 1) * h; g.fillStyle = fa; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(fx + cos(k * 1.256) * 3, fy + sin(k * 1.256) * 3, 2, 0, TAU); g.fill(); } }
        }
      });
      const y0 = ghost ? -0.95 : -1.0, y1 = ghost ? 0.62 : -0.22;
      const thR = ghost ? 1.05 : 1.65;
      grid(B.G, 18, 12, mr, (u, v) => {
        const th = lerp(-thR, thR, u), yn = lerp(y1, y0, v), ph = acos(clamp(yn, -0.999, 0.999));
        const off = (ghost ? 0.007 + 0.006 * sin(u * PI) : 0.006) * s;
        return { p: headPt(B, th, ph, off), w: W };
      }, {});
    }
    if (fc.horns && !(S.hat && S.hat.horns)) {
      const hr = C._internal.clothRect(B, 'horn', 0.05, 0.1, fc.horns, { folds: false });
      for (const sg of [-1, 1]) { const p0 = headPt(B, sg * 0.5, 0.4, 0.01); tube(B.G, [p0, vadd(p0, [sg * 0.03, 0.05, 0]), vadd(p0, [sg * 0.05, 0.08, -0.02])], 7, hr, (k) => ({ rx: 0.012 * (1 - k) + 0.001 }), () => W, { nv: 5 }); }
    }
    // halo (luminous deity / spirit): emissive ring behind the head
    if (S.halo) {
      const hr = B.rect('halo', 0.2, 0.05, (g, x, y, w, h, d, e) => { g.fillStyle = S.halo; g.fillRect(x - 2, y - 2, w + 4, h + 4); if (e) { e.fillStyle = S.halo; e.fillRect(x - 2, y - 2, w + 4, h + 4); } }, { emissive: true });
      const c0 = vadd(P.headC, [0, 0.02 * s, -P.headD * 0.62]);
      const pts = []; for (let i = 0; i <= 32; i++) { const a2 = i / 32 * TAU; pts.push(vadd(c0, [cos(a2) * P.head * 0.78, sin(a2) * P.head * 0.78, 0])); }
      tube(B.G, pts, 5, hr, () => ({ rx: 0.006 * s, ry: 0.006 * s }), () => W, { nv: 32, up: [0, 0, 1] });
      for (let i = 0; i < 12; i++) { const a2 = i / 12 * TAU; blob(B.G, 6, 4, hr, vadd(c0, [cos(a2) * P.head * 0.78, sin(a2) * P.head * 0.78, 0]), [0.012 * s, 0.012 * s, 0.012 * s], W); }
    }
  }
  C.buildFaceExtras = buildFaceExtras;
})();

// ==================================================================================================== PROPS & WEAPONS
(() => {
  const C = G.Char3D, I = C._internal;
  const { grid, tube, blob, wmix, vadd, vsub, vsc, vlen, vnorm, vcross, vdot, vlerp, sstep, lerp, clamp, rng, shade, mixc, rgba, lum } = I;
  const PI = Math.PI, TAU = PI * 2;
  const { sin, cos, abs, min, max, floor, round, pow } = Math;
  const Pn = C.paint;

  // material swatches (small fixed-pixel atlas tiles)
  const SW = {
    wood: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#8a6038', { weave: 'wood', folds: false, weaveK: 0.45 }); },
    dark: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#3a2a22', { weave: 'wood', folds: false, weaveK: 0.35 }); },
    lacq: (g, x, y, w, h) => { g.fillStyle = '#1e1a20'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = rgba('#ffffff', 0.18); g.fillRect(x, y + h * 0.2, w, h * 0.12); },
    red: (g, x, y, w, h) => { g.fillStyle = '#b02a26'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = rgba('#ffffff', 0.15); g.fillRect(x, y + h * 0.2, w, h * 0.1); },
    bamboo: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#b8a060', { weave: 'linen', folds: false }); g.fillStyle = '#8a7238'; for (let i = 0; i < 6; i++) g.fillRect(x, y + h * i / 6, w, max(1, h * 0.02)); },
    steel: (g, x, y, w, h) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#9aa4ae'); gr.addColorStop(0.45, '#f4f8fc'); gr.addColorStop(0.55, '#c8d0d8'); gr.addColorStop(1, '#6a747e'); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4); },
    gold: (g, x, y, w, h) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#9a7428'); gr.addColorStop(0.5, '#f6d878'); gr.addColorStop(1, '#a8802e'); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4); },
    bronze: (g, x, y, w, h) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#7a5428'); gr.addColorStop(0.5, '#d8a858'); gr.addColorStop(1, '#8a5e2c'); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4); },
    jade: (g, x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#5aa888'); gr.addColorStop(0.5, '#bfe8d0'); gr.addColorStop(1, '#3a8a6a'); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4); },
    straw: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#c8a868', { weave: 'straw', folds: false, weaveK: 0.5 }); },
    leather: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#6a4630', { weave: 'leather', folds: false }); },
    paper: (g, x, y, w, h, d, e) => { g.fillStyle = '#f4ead2'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.strokeStyle = rgba('#a88a5a', 0.6); g.lineWidth = 1; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(x, y + h * i / 8); g.lineTo(x + w, y + h * i / 8); g.stroke(); } },
    lantern: (g, x, y, w, h, d, e) => { // glowing paper lantern body (emissive)
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffcf7a'); gr.addColorStop(0.5, '#fff0c0'); gr.addColorStop(1, '#ffb050'); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4);
      g.strokeStyle = rgba('#a8602a', 0.6); g.lineWidth = 1; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(x, y + h * i / 6); g.lineTo(x + w, y + h * i / 6); g.stroke(); }
      g.fillStyle = '#c8402a'; g.font = `bold ${round(h * 0.4)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('燈', x + w * 0.25, y + h / 2); g.fillText('燈', x + w * 0.75, y + h / 2);
      if (e) { e.fillStyle = '#ff9a40'; e.fillRect(x - 2, y - 2, w + 4, h + 4); e.fillStyle = '#ffd890'; e.fillRect(x, y + h * 0.2, w, h * 0.6); }
    },
    soul: (g, x, y, w, h, d, e) => { // teal soul-lantern paper
      g.fillStyle = '#e8fbf6'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.strokeStyle = rgba('#4fd8c8', 0.6); for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(x, y + h * i / 6); g.lineTo(x + w, y + h * i / 6); g.stroke(); }
      g.fillStyle = '#2a8a80'; g.font = `bold ${round(h * 0.4)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('引', x + w * 0.25, y + h / 2); g.fillText('引', x + w * 0.75, y + h / 2);
      if (e) { e.fillStyle = '#3ab8b0'; e.fillRect(x - 2, y - 2, w + 4, h + 4); e.fillStyle = '#9ff0e8'; e.fillRect(x, y + h * 0.25, w, h * 0.5); }
    },
    blue: (g, x, y, w, h, d, e) => { g.fillStyle = '#cfefff'; g.fillRect(x - 2, y - 2, w + 4, h + 4); if (e) { e.fillStyle = '#6ac8ff'; e.fillRect(x - 2, y - 2, w + 4, h + 4); } },
    ember: (g, x, y, w, h, d, e) => { g.fillStyle = '#ff7a3a'; g.fillRect(x - 2, y - 2, w + 4, h + 4); if (e) { e.fillStyle = '#ff6a2a'; e.fillRect(x - 2, y - 2, w + 4, h + 4); } },
    white: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#efe9dc', { weave: 'silk', folds: false }); },
    hair: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#f2efe8', { weave: 'hair', folds: false, weaveK: 0.5 }); },
    feather: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#2a2634', { weave: 'hair', folds: false, weaveK: 0.4 }); g.fillStyle = rgba('#7a6aa8', 0.5); g.fillRect(x + w * 0.45, y, w * 0.1, h); },
    tassel: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#c8282a', { weave: 'hair', folds: false, weaveK: 0.4 }); },
    celadon: (g, x, y, w, h, d, e) => { g.fillStyle = '#c8e0d6'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.strokeStyle = '#6a9a8a'; g.lineWidth = 1; for (let i = 0; i < 10; i++) { g.beginPath(); g.arc(x + w * (i + 0.5) / 10, y + h * 0.6, w * 0.04, PI, 0); g.stroke(); } if (e) { e.fillStyle = '#2a5a7a'; e.fillRect(x, y + h * 0.15, w, h * 0.35); } },
    green: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#4a7a3a', { weave: 'linen', folds: false }); },
    fiber: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#d8c890', { weave: 'straw', folds: false }); },
    teal: (g, x, y, w, h, d, e) => { g.fillStyle = '#4fd8c8'; g.fillRect(x - 2, y - 2, w + 4, h + 4); if (e) { e.fillStyle = '#3ac8b8'; e.fillRect(x - 2, y - 2, w + 4, h + 4); } },
    darkwood: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#4a3324', { weave: 'wood', folds: false, weaveK: 0.4 }); },
    crow: (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#1d1c27', { weave: 'hair', folds: false, weaveK: 0.35 }); g.fillStyle = rgba('#55609a', 0.45); g.fillRect(x, y + h * 0.3, w, h * 0.12); },
    paperBlue: (g, x, y, w, h, d, e) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#e8f8ff'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#cfefff'); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4);
      g.strokeStyle = rgba('#6aa8c8', 0.6); g.lineWidth = 1; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(x, y + h * i / 6); g.lineTo(x + w, y + h * i / 6); g.stroke(); }
      g.fillStyle = '#c8372b'; g.font = `bold ${round(h * 0.34)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('長', x + w * 0.25, y + h * 0.36); g.fillText('明', x + w * 0.25, y + h * 0.68); g.fillText('長', x + w * 0.75, y + h * 0.36); g.fillText('明', x + w * 0.75, y + h * 0.68);
      if (e) { e.fillStyle = '#5ab8e8'; e.fillRect(x - 2, y - 2, w + 4, h + 4); e.fillStyle = '#aef0ff'; e.fillRect(x, y + h * 0.25, w, h * 0.5); } },
  };
  SW.gourd = (g, x, y, w, h) => { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#e0a858'); gr.addColorStop(0.5, '#c48a3c'); gr.addColorStop(1, '#8a5a24'); g.fillStyle = gr; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = rgba('#fff', 0.25); g.fillRect(x, y + h * 0.2, w, h * 0.1); };
  SW.talisman = (g, x, y, w, h) => { g.fillStyle = '#f2d060'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = '#c8372b'; g.fillRect(x + w * 0.4, y + h * 0.1, w * 0.2, h * 0.8); g.fillRect(x + w * 0.15, y + h * 0.3, w * 0.7, h * 0.06); };
  SW.sachet = (g, x, y, w, h) => { Pn.cloth(g, x, y, w, h, '#e8c860', { weave: 'silk', folds: false }); g.strokeStyle = '#b8862a'; g.lineWidth = 1; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x + w * i / 5, y); g.lineTo(x + w * i / 5, y + h); g.stroke(); } };
  SW.catcharm = (g, x, y, w, h) => { g.fillStyle = '#e8b878'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = '#4a3020'; g.fillRect(x + w * 0.45, y + h * 0.4, w * 0.035, h * 0.12); g.fillRect(x + w * 0.52, y + h * 0.4, w * 0.035, h * 0.12); g.fillStyle = '#d06a6a'; g.fillRect(x + w * 0.49, y + h * 0.56, w * 0.025, h * 0.05); };
  const EMISSIVE_SW = ['lantern', 'soul', 'blue', 'ember', 'celadon', 'teal', 'paperBlue'];
  function sw(B, k) { return B.rect('sw_' + k, 0, 0, SW[k] || SW.wood, { px: k === 'paperBlue' || k === 'soul' || k === 'lantern' ? [48, 48] : [24, 24], emissive: EMISSIVE_SW.includes(k) }); }
  C.swatch = sw; C.SW = SW;

  // prop kit: local frame (origin o, axes X, Y, Z world vectors) → emits into B.G weighted to bone
  function kit(B, bone, o, X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1]) {
    const W = typeof bone === 'number' ? [[bone, 1]] : [[B.b(bone), 1]];
    const T = (p) => vadd(o, vadd(vadd(vsc(X, p[0]), vsc(Y, p[1])), vsc(Z, p[2])));
    const K = {
      W, T,
      cyl(a, b, r0, r1, mat, seg = 8, opts = {}) { tube(B.G, [T(a), T(b)], seg, sw(B, mat), (t) => ({ rx: lerp(r0, r1 != null ? r1 : r0, t), ry: lerp(r0, r1 != null ? r1 : r0, t) * (opts.flat || 1) }), opts.W || (() => W), { nv: opts.nv || 1, linear: true, capStart: opts.cap !== false, capEnd: opts.cap !== false, up: opts.up ? vnorm(vadd(vadd(vsc(X, opts.up[0]), vsc(Y, opts.up[1])), vsc(Z, opts.up[2]))) : (abs(vdot(vnorm(vsub(T(b), T(a))), [0, 1, 0])) > 0.9 ? [0, 0, 1] : [0, 1, 0]) }); },
      path(pts, r, mat, seg = 6, opts = {}) { tube(B.G, pts.map(T), seg, sw(B, mat), (t) => ({ rx: typeof r === 'function' ? r(t) : r, ry: (typeof r === 'function' ? r(t) : r) * (opts.flat || 1) }), opts.W || (() => W), { nv: opts.nv || pts.length * 2, up: opts.up || [0, 0, 1] }); },
      ball(c, r, mat, sx = 1, sy = 1, sz = 1, seg = 8) { blob(B.G, seg + 2, seg, sw(B, mat), T(c), [1, 1, 1], W, { deform: (n) => vadd(vadd(vsc(X, n[0] * r * sx), vsc(Y, n[1] * r * sy)), vsc(Z, n[2] * r * sz)) }); },
      box(c, sx, sy, sz, mat) { blob(B.G, 8, 6, sw(B, mat), T(c), [1, 1, 1], W, { deform: (n) => { const q = (v) => Math.sign(v) * pow(abs(v), 0.35); return vadd(vadd(vsc(X, q(n[0]) * sx), vsc(Y, q(n[1]) * sy)), vsc(Z, q(n[2]) * sz)); } }); },
      lathe(prof, mat, seg = 12, nv = 6, opts = {}) { grid(B.G, seg, nv, sw(B, mat), (u, v) => { const th = (u - 0.5) * TAU, [r, h] = prof(v); return { p: T([sin(th) * r, h, cos(th) * r]), w: opts.W ? opts.W(v) : W }; }, { closed: true, flip: !!opts.flip }); },
      blade(len, w, mat, opts = {}) { // flat tapered blade along +z from z0
        const z0 = opts.z0 || 0;
        grid(B.G, 4, 10, sw(B, mat), (u, v) => { const th = u * TAU; const z = z0 + v * len; const ww = w * (v < 0.8 ? 1 - v * 0.15 : (1 - v) / 0.2 * 0.85); const cx = cos(th), cy = sin(th); return { p: T([cy * (opts.th || 0.004) * (1 - v * 0.5), cx * ww, z]), w: W }; }, { closed: true });
      },
    };
    return K;
  }
  C.propKit = kit;

  // world-space frame for a socket bone at bind: grip point + axes
  function socket(B, bone) { return B.pos(bone); }

  // ------------------------------------------------------------------------------------------ hold classes
  const HOLD = {
    pole: ['staff', 'lstaff', 'oar', 'spear', 'glaive', 'halberd', 'flag', 'pestle', 'rod', 'paddle', 'crook'],
    cane: ['cane'],
    hang: ['lantern', 'oillamp', 'basket', 'medbox', 'beads'],
    shoulder: ['axe', 'pick', 'hoe', 'broom'],
    front: ['book', 'abacus', 'fan', 'ffan', 'tray', 'pipe', 'whisk', 'incense', 'yueqin', 'grass', 'fiber', 'plaque', 'flute', 'bow'],
    blade: ['saber', 'sword'],
  };
  function holdClass(item) { if (!item) return 'none'; for (const k in HOLD) if (HOLD[k].includes(item)) return k; return 'front'; }
  function weaponFamily(w) {
    if (!w) return 'none';
    if (['sword', 'saber'].includes(w)) return 'blade';
    if (['spear', 'glaive', 'halberd', 'lstaff', 'oar', 'staff', 'crook'].includes(w)) return 'pole';
    if (['fan', 'ffan', 'whisk'].includes(w)) return 'fan';
    if (w === 'flute') return 'flute';
    return 'none';
  }
  C.holdClass = holdClass; C.weaponFamily = weaponFamily;

  // ------------------------------------------------------------------------------------------ item geometry
  // All items are built along a local frame at the grip: +Z = object axis (pole/blade direction), +Y = up at bind.
  function buildItem(B, item, bone, ctx = {}) {
    const P = B.P, s = P.s;
    const o = B.pos(bone);
    const K = kit(B, bone, o);
    const look = ctx.look || {};
    switch (item) {
      case 'sword': case 'saber': {
        const L = (item === 'saber' ? 0.62 : 0.72) * (look.len || 1);
        K.cyl([0, 0, -0.07], [0, 0, 0.07], 0.014, 0.014, look.grip || 'dark', 6);           // grip
        K.ball([0, 0, -0.08], 0.017, look.pommel || 'gold');                                 // pommel
        K.box([0, 0, 0.085], 0.045, 0.012, 0.01, look.guard || 'gold');                       // guard
        K.blade(L, item === 'saber' ? 0.022 : 0.016, look.blade || 'steel', { z0: 0.09 });
        if (look.glow) K.cyl([0, 0, 0.12], [0, 0, 0.09 + L * 0.9], 0.004, 0.002, look.glow, 4);
        if (look.tassel) K.path([[0, 0, -0.085], [0, -0.04, -0.09], [0, -0.09, -0.1]], (t) => 0.006 + t * 0.006, 'tassel', 5);
        break;
      }
      case 'spear': case 'glaive': case 'halberd': case 'lstaff': case 'staff': case 'oar': case 'paddle': case 'flag': case 'pestle': case 'rod': {
        const L = { spear: 1.95, glaive: 1.9, halberd: 2.0, lstaff: 2.05, staff: 1.55, oar: 1.9, paddle: 1.35, flag: 1.85, pestle: 1.1, rod: 1.7 }[item] * (look.len || 1) * (P.kid ? 0.7 : 1);
        const g0 = -(look.grip != null ? look.grip : (item === 'spear' || item === 'glaive' || item === 'halberd' ? 0.45 : 0.55)) * L;
        const g1 = g0 + L;
        const shaftMat = look.shaft || (item === 'lstaff' ? 'lacq' : item === 'staff' ? 'wood' : item === 'rod' ? 'bamboo' : 'wood');
        const rS = (item === 'pestle' ? 0.03 : item === 'rod' ? 0.01 : 0.017) * (look.thick || 1);
        if (item === 'rod') { K.cyl([0, 0, g0], [0, 0, g1], 0.013, 0.004, 'bamboo', 6); K.path([[0, 0, g1], [0, -0.3, g1 + 0.05], [0, -0.6, g1 + 0.02]], 0.0012, 'white', 3); break; }
        if (item === 'pestle') { K.cyl([0, 0, g0], [0, 0, g1], 0.032, 0.032, 'wood', 8); K.ball([0, 0, g1], 0.034, 'wood'); K.ball([0, 0, g0], 0.034, 'wood'); break; }
        K.cyl([0, 0, g0], [0, 0, g1 - (item === 'oar' || item === 'paddle' ? 0.4 : 0)], rS, rS * 0.92, shaftMat, 7);
        if (item === 'spear') {
          K.cyl([0, 0, g1 - 0.02], [0, 0, g1 + 0.04], 0.021, 0.017, 'bronze', 7);
          K.blade(0.24, 0.026, 'steel', { z0: g1 + 0.03, th: 0.006 });
          // 紅纓 red horsehair tassel below the head (spring chain)
          const tb = B.chain('tassel', bone, [B.pos(bone).map((v, i) => v + [0, 0, g1 - 0.01][i]), vadd(K.T([0, -0.06, g1 - 0.05]), [0, 0, 0]), K.T([0, -0.14, g1 - 0.08])], { stiff: 0.6, drag: 0.3, grav: 1, r: 0.02, groups: [], kind: 'tassel' });
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const pts = [K.T([cos(a) * 0.01, sin(a) * 0.01, g1 - 0.01]), K.T([cos(a) * 0.035, -0.06 + sin(a) * 0.02, g1 - 0.05]), K.T([cos(a) * 0.03, -0.14, g1 - 0.08 + sin(a) * 0.02])]; tube(B.G, pts, 4, sw(B, look.tasselMat || 'tassel'), (t) => ({ rx: 0.012 * (1 - t * 0.6) }), (t) => [[tb[t < 0.5 ? 0 : 1], 1]], { nv: 4 }); }
        } else if (item === 'glaive' || item === 'halberd') {
          K.cyl([0, 0, g1 - 0.02], [0, 0, g1 + 0.03], 0.024, 0.02, 'gold', 7);
          grid(B.G, 6, 6, sw(B, 'steel'), (u, v) => { const z = g1 + 0.03 + v * 0.36; const w = (item === 'glaive' ? 0.07 : 0.05) * sin(min(1, v * 1.4) * PI * 0.8 + 0.2) + 0.004; const th = u * TAU; return { p: K.T([cos(th) * 0.004, sin(th) * w + w * 0.6, z]), w: K.W }; }, { closed: true });
          if (item === 'halberd') grid(B.G, 6, 4, sw(B, 'steel'), (u, v) => { const th = u * TAU; return { p: K.T([cos(th) * 0.004, -v * 0.14 - 0.02, g1 + 0.09 + sin(th) * 0.04 * (1 - v)]), w: K.W }; }, { closed: true });
        } else if (item === 'lstaff') { // lantern staff: hook top + hanging cage lantern (spring)
          K.cyl([0, 0, g1 - 0.06], [0, 0, g1], 0.024, 0.024, 'gold', 8);
          K.path([[0, 0, g1], [0, 0.0, g1 + 0.1], [0, -0.08, g1 + 0.16], [0, -0.14, g1 + 0.12]], 0.008, 'gold', 6);
          const top = K.T([0, -0.14, g1 + 0.12]);
          hangLantern(B, bone, top, look.lantern || { mat: 'blue', cage: 'gold', r: 0.06, h: 0.16, light: '#a8d8ff' });
        } else if (item === 'staff') {
          K.ball([0, 0, g1], 0.024, 'wood'); K.ball([0, 0, g0], 0.02, 'dark');
        } else if (item === 'oar' || item === 'paddle') {
          const bl = item === 'oar' ? 0.55 : 0.45, bw = item === 'oar' ? 0.075 : 0.09;
          grid(B.G, 8, 8, sw(B, look.blade || 'wood'), (u, v) => { const th = u * TAU; const z = g1 - 0.42 + v * bl; const w = bw * sin(min(1, v * 1.15) * PI * 0.5 + 0.35) * (v > 0.85 ? (1 - v) / 0.15 * 0.6 + 0.4 : 1); return { p: K.T([sin(th) * w, cos(th) * 0.012 * (1 - v * 0.4), z]), w: K.W }; }, { closed: true });
          if (item === 'oar') { K.cyl([0, 0, g0 - 0.005], [0, 0, g0 + 0.005], 0.06, 0.06, look.tgrip || 'dark', 6, { flat: 0.3 }); }
          if (look.inlay) { // glowing tide-line inlay carved into the blade (both faces)
            for (const sd of [1, -1]) for (let k2 = 0; k2 < 3; k2++) { const zz = g1 - 0.32 + k2 * 0.11; K.path([[-0.04, sd * 0.0125, zz], [-0.015, sd * 0.0135, zz + 0.02], [0.015, sd * 0.0135, zz - 0.01], [0.04, sd * 0.0125, zz + 0.012]], 0.0035, 'teal', 3, { flat: 0.5 }); }
          }
          if (look.lantern) { const top = K.T([0, 0, g0 - 0.01]); hangLantern(B, bone, top, look.lantern); }
          if (look.collar) K.cyl([0, 0, g1 - 0.46], [0, 0, g1 - 0.4], 0.022, 0.022, look.collar, 8);
        } else if (item === 'flag') {
          const fr = B.rect('flag', 0.4, 0.5, (g, x, y, w, h) => { g.fillStyle = '#f0c83a'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = '#c8282a'; g.fillRect(x, y, w, h * 0.12); g.fillRect(x, y + h * 0.88, w, h * 0.12); g.font = `bold ${round(w * 0.5)}px serif`; g.textAlign = 'center'; g.fillText('進香', x + w / 2, y + h * 0.55); });
          const pts = [K.T([0, 0, g1]), K.T([0, -0.06, g1 - 0.28]), K.T([0, -0.12, g1 - 0.55])];
          const fb = B.chain('flag', bone, [K.T([0, 0, g1 - 0.02]), K.T([0, -0.28, g1 - 0.2]), K.T([0, -0.5, g1 - 0.3])], { stiff: 0.5, drag: 0.25, grav: 0.8, r: 0.03, groups: [], kind: 'flag' });
          grid(B.G, 6, 6, fr, (u, v) => { const p0 = K.T([0, 0, g1 - 0.03 - u * 0.5]); const d = vsc([0, -1, 0], v * 0.32); return { p: vadd(p0, d), w: [[fb[v < 0.5 ? 0 : 1], 1]] }; }, {});
        }
        if (look.ring) K.cyl([0, 0, g1 - 0.15], [0, 0, g1 - 0.12], 0.024, 0.024, look.ring, 8);
        break;
      }
      case 'crook': {
        const L = 1.95 * (look.len || 1), g0 = -0.55 * L, g1 = g0 + L;
        K.cyl([0, 0, g0], [0, 0, g1], 0.016, 0.015, 'lacq', 7);
        for (let k2 = 1; k2 < 6; k2++) K.cyl([0, 0, g0 + k2 * L / 6 - 0.005], [0, 0, g0 + k2 * L / 6 + 0.005], 0.019, 0.019, 'dark', 7); // bamboo nodes
        K.path([[0, 0, g1], [0, 0.02, g1 + 0.09], [0, 0.0, g1 + 0.16], [0, -0.07, g1 + 0.18], [0, -0.12, g1 + 0.14]], 0.014, 'lacq', 6);
        K.ball([0, -0.13, g1 + 0.14], 0.03, 'crow', 1.2, 0.9, 1); // crow head
        K.path([[0, -0.15, g1 + 0.15], [0, -0.2, g1 + 0.12]], (t) => 0.012 * (1 - t), 'gold', 4); // beak
        hangLantern(B, bone, K.T([0, -0.15, g1 + 0.12]), look.lantern || { mat: 'paperBlue', cage: 'lacq', r: 0.075, h: 0.17, light: '#8cf3ff', cord: 0.05, tasselMat: 'tassel' });
        break;
      }
      case 'cane': { // shaft along the grip axis (+Z, pointing at the ground when held), crook over the fist
        const L = 0.84 * s;
        K.cyl([0, 0, -0.03], [0, 0, L], 0.012, 0.01, 'wood', 6);
        K.path([[0, 0, -0.03], [0, 0, -0.07], [0.0, 0.05, -0.08], [0, 0.07, -0.04]], 0.012, 'wood', 6);
        K.ball([0, 0, L], 0.012, 'dark');
        break;
      }
      case 'lantern': case 'oillamp': hangLantern(B, bone, o, look.lantern || (item === 'oillamp' ? { kind: 'oil', mat: 'lantern', r: 0.05, h: 0.12, light: '#ffcf8a' } : { mat: 'lantern', r: 0.07 * (P.kid ? 0.8 : 1), h: 0.15 * (P.kid ? 0.8 : 1), light: '#ffb060' })); break;
      case 'basket': case 'medbox': case 'beads': {
        const ch = B.chain('hang', bone, [o, vadd(o, [0, -0.06, 0]), vadd(o, [0, -0.18, 0])], { stiff: 1.6, drag: 0.45, grav: 1, r: 0.04, groups: ['leg'], kind: 'prop' });
        const K2 = kit(B, ch[1], vadd(o, [0, -0.06, 0]));
        if (item === 'basket') { K.path([[0, 0, -0.06], [0, 0.0, 0], [0, 0, 0.06]], 0.006, 'bamboo', 4); K2.lathe((v) => [lerp(0.09, 0.07, v), -0.03 - v * 0.1], 'straw', 12, 4); K2.lathe((v) => [0.09 * (1 - v), -0.03], 'straw', 12, 2); K2.path([[0, -0.03, -0.09], [0, 0.04, 0], [0, -0.03, 0.09]], 0.005, 'bamboo', 4); }
        else if (item === 'medbox') { K2.box([0, -0.07, 0], 0.08, 0.06, 0.05, 'wood'); K2.box([0, -0.07, 0.051], 0.06, 0.04, 0.002, 'red'); }
        else { for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; K2.ball([sin(a) * 0.04, -0.05 - cos(a) * 0.04, 0], 0.008, 'dark', 1, 1, 1, 4); } }
        break;
      }
      case 'axe': case 'pick': case 'hoe': case 'broom': {
        const L = item === 'broom' ? 1.2 : 0.8;
        K.cyl([0, 0, -0.08], [0, 0, L - 0.08], 0.016, 0.014, item === 'broom' ? 'bamboo' : 'wood', 6);
        const e = L - 0.08;
        if (item === 'axe') { K.box([0, 0.0, e - 0.04], 0.012, 0.06, 0.03, 'steel'); K.box([0, 0.065, e - 0.04], 0.008, 0.02, 0.05, 'steel'); }
        if (item === 'pick') { K.path([[0, -0.15, e - 0.03], [0, 0, e], [0, 0.15, e - 0.03]], (t) => 0.012 * (1 - abs(t - 0.5)), 'steel', 5); }
        if (item === 'hoe') { K.box([0, -0.07, e - 0.02], 0.06, 0.07, 0.006, 'steel'); }
        if (item === 'broom') { K.lathe((v) => [lerp(0.02, 0.09, v), 0], 'straw', 10, 2); grid(B.G, 10, 4, sw(B, 'straw'), (u, v) => { const th = (u - 0.5) * TAU; return { p: K.T([sin(th) * lerp(0.03, 0.1, v), cos(th) * lerp(0.02, 0.03, v), e + v * 0.28]), w: K.W }; }, { closed: true }); }
        break;
      }
      case 'fan': { // closed folding fan (opens procedurally in battle via scale? kept closed)
        K.box([0, 0, 0.09], 0.012, 0.02, 0.11, look.mat || 'dark'); K.ball([0, 0, -0.02], 0.008, 'gold');
        if (look.tassel !== false) K.path([[0, 0, -0.025], [0, -0.05, -0.03], [0, -0.09, -0.03]], 0.004, 'tassel', 4);
        break;
      }
      case 'ffan': { // feather fan 羽扇
        K.cyl([0, 0, -0.04], [0, 0, 0.1], 0.009, 0.009, 'lacq', 6);
        grid(B.G, 10, 6, sw(B, look.mat || 'feather'), (u, v) => { const a = (u - 0.5) * 1.5; const r = v * 0.22; return { p: K.T([sin(a) * r, 0.004 * cos(u * PI * 8), 0.1 + cos(a) * r]), w: K.W }; }, {});
        grid(B.G, 10, 6, sw(B, look.mat || 'feather'), (u, v) => { const a = (u - 0.5) * 1.5; const r = v * 0.22; return { p: K.T([sin(a) * r, -0.002, 0.1 + cos(a) * r]), w: K.W }; }, { flip: true });
        break;
      }
      case 'whisk': { // 拂塵: handle + horsetail on a spring chain
        K.cyl([0, 0, -0.06], [0, 0, 0.16], 0.01, 0.012, look.handle || 'lacq', 6); K.ball([0, 0, 0.165], 0.014, 'gold');
        const top = K.T([0, 0, 0.16]);
        const ch = B.chain('whisk', bone, [top, vadd(top, [0, -0.1, -0.03]), vadd(top, [0, -0.22, -0.05]), vadd(top, [0, -0.32, -0.06])], { stiff: 0.5, drag: 0.3, grav: 1, r: 0.03, groups: ['leg', 'body'], kind: 'hair' });
        for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; const pts = [top, vadd(top, [cos(a) * 0.015, -0.1, -0.03 + sin(a) * 0.015]), vadd(top, [cos(a) * 0.022, -0.22, -0.05 + sin(a) * 0.02]), vadd(top, [cos(a) * 0.012, -0.33, -0.06])]; tube(B.G, pts, 4, sw(B, 'hair'), (t) => ({ rx: 0.008 * (1 - t * 0.7) }), (t) => [[ch[min(2, floor(t * 3))], 1]], { nv: 6 }); }
        break;
      }
      case 'book': K.box([0, 0, 0.05], 0.012, 0.08, 0.06, 'paper'); K.box([0.013, 0, 0.05], 0.003, 0.082, 0.062, 'blue'); break;
      case 'abacus': K.box([0, 0.02, 0.05], 0.014, 0.06, 0.12, 'wood'); for (let k = 0; k < 6; k++) K.ball([0.016, 0.02 + (k % 2) * 0.02 - 0.01, k * 0.035 - 0.04], 0.008, 'dark', 1, 1, 1, 4); break;
      case 'tray': { // held flat on the palm (the hold pose turns hand +Z to world up)
        const KT = kit(B, bone, vadd(o, [0, 0, 0]), [1, 0, 0], [0, 0, 1], [0, -1, 0]);
        KT.lathe((v) => [0.14 * (1 - v * 0.02), 0.02 + v * 0.012], 'red', 14, 2); KT.lathe((v) => [0.14 * (1 - v), 0.02], 'red', 14, 2, { flip: true });
        KT.ball([0.04, 0.05, 0.02], 0.025, 'white', 1, 0.8, 1); KT.ball([-0.05, 0.045, -0.03], 0.02, 'celadon', 1, 0.8, 1); break;
      }
      case 'pipe': K.cyl([0, 0, -0.05], [0, 0, 0.35], 0.006, 0.006, 'bamboo', 5); K.ball([0, 0.012, 0.35], 0.014, 'bronze', 1, 1.2, 1); K.ball([0, 0, -0.055], 0.008, 'jade'); break;
      case 'incense': for (let k = -1; k <= 1; k++) { K.cyl([k * 0.008, 0, -0.04], [k * 0.008, 0, 0.26], 0.003, 0.002, 'red', 4); K.ball([k * 0.008, 0, 0.262], 0.004, 'ember', 1, 1, 1, 4); } break;
      case 'yueqin': K.lathe((v) => [0.14 * (1 - v * v * 0), (v - 0.5) * 0.04], 'wood', 18, 2); K.cyl([0, 0, 0.12], [0, 0, 0.42], 0.016, 0.014, 'dark', 6); K.box([0, 0.022, 0], 0.05, 0.004, 0.05, 'dark'); break;
      case 'bow': K.path([[0, 0.6, -0.12], [0, 0.3, 0.06], [0, 0, 0.1], [0, -0.3, 0.06], [0, -0.6, -0.12]], 0.01, 'wood', 6); K.path([[0, 0.6, -0.12], [0, -0.6, -0.12]], 0.0015, 'white', 3); break;
      case 'plaque': K.cyl([0, 0, -0.05], [0, 0, 0.5], 0.012, 0.012, 'red', 6); K.box([0, 0, 0.62], 0.012, 0.12, 0.1, 'lacq'); break;
      case 'grass': case 'fiber': for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; K.path([[cos(a) * 0.01, sin(a) * 0.01, -0.06], [cos(a) * 0.02, sin(a) * 0.02, 0.15], [cos(a) * 0.05, sin(a) * 0.05 - 0.04, 0.32]], (t) => 0.005 * (1 - t), item === 'grass' ? 'green' : 'fiber', 3); } break;
      case 'flute': K.cyl([0, 0, -0.18], [0, 0, 0.3], 0.011, 0.011, look.mat || 'jade', 8); for (let k = 0; k < 6; k++) K.ball([0, 0.01, -0.05 + k * 0.05], 0.003, 'dark', 1, 1, 1, 3); K.cyl([0, 0, 0.27], [0, 0, 0.29], 0.013, 0.013, 'gold', 8);
        if (look.tassel) K.path([[0, 0, -0.18], [0, -0.06, -0.19], [0, -0.13, -0.2]], (t) => 0.004 + 0.004 * t, look.tassel, 4);
        if (look.tag) { // red-string jade tag (「白芷」) swinging from the flute's foot on a spring chain
          const t0 = K.T([0, -0.004, -0.175]);
          const ids = B.chain('fluteTag' + bone, bone, [t0, vadd(t0, [0, -0.06, 0]), vadd(t0, [0, -0.1, 0])], { stiff: 0.5, drag: 0.3, grav: 1.2, r: 0.01, groups: [], kind: 'prop' });
          tube(B.G, [t0, vadd(t0, [0, -0.06, 0])], 4, sw(B, 'red'), () => ({ rx: 0.0022 }), (t) => [[t < 0.15 ? B.b(bone) : ids[0], 1]], { nv: 3, linear: true });
          const K2 = kit(B, ids[1], vadd(t0, [0, -0.082, 0]));
          K2.box([0, 0, 0], 0.011, 0.018, 0.005, look.tag === true ? 'jade' : look.tag);
          K2.path([[0, -0.02, 0], [0, -0.04, 0], [0, -0.058, 0]], (t) => 0.003 + 0.004 * t, 'tassel', 4);
        }
        break;
      default: K.box([0, 0, 0.04], 0.02, 0.02, 0.04, 'wood');
    }
  }
  // paper / cage lantern hanging from a point on a 2-bone spring chain
  function hangLantern(B, bone, top, L) {
    const s = B.P.s;
    const r = L.r || 0.07, h = L.h || 0.15, cord = L.cord || 0.06;
    const ids = B.chain('lantern', bone, [top, vadd(top, [0, -cord, 0]), vadd(top, [0, -cord - h, 0])], { stiff: L.stiff || 0.9, drag: 0.35, grav: 1.2, r: r * 0.9, groups: ['leg', 'body'], kind: 'prop' });
    const c = vadd(top, [0, -cord - h * 0.5, 0]);
    const K = kit(B, ids[1], c);
    tube(B.G, [top, vadd(top, [0, -cord, 0])], 4, sw(B, 'dark'), () => ({ rx: 0.0025 }), () => [[ids[0], 1]], { nv: 1, linear: true });
    if (L.kind === 'oil') { // glass oil lamp
      K.lathe((v) => [0.035 * sin(0.2 + v * 2.8) + 0.012, (0.5 - v) * h], 'lantern', 12, 6);
      K.lathe((v) => [lerp(0.04, 0.03, v), -h * 0.5 - v * 0.02], 'bronze', 12, 2);
      K.lathe((v) => [lerp(0.03, 0.01, v), h * 0.5 + v * 0.02], 'bronze', 12, 2);
    } else {
      K.lathe((v) => [r * (0.55 + 0.45 * sin(v * PI)), (0.5 - v) * h], L.mat || 'lantern', 14, 8);
      K.lathe((v) => [r * 0.5, h * 0.5 + v * 0.012], L.cage || 'dark', 12, 1);
      K.lathe((v) => [r * 0.5, -h * 0.5 - v * 0.012], L.cage || 'dark', 12, 1);
      if (L.cage) for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; K.path([[cos(a) * r * 0.5, h * 0.5, sin(a) * r * 0.5], [cos(a) * r * 1.03, 0, sin(a) * r * 1.03], [cos(a) * r * 0.5, -h * 0.5, sin(a) * r * 0.5]], 0.003, L.cage, 3, { nv: 6 }); }
      if (L.tassel !== false) K.path([[0, -h * 0.5 - 0.01, 0], [0, -h * 0.5 - 0.06, 0], [0, -h * 0.5 - 0.1, 0]], (t) => 0.004 + 0.008 * t, L.tasselMat || 'tassel', 4);
    }
    B.lights.push({ bone: ids[1], pos: c, color: L.light || '#ffb060', i: L.i || 0.9, r: L.range || 3.2, flicker: L.flicker != null ? L.flicker : 0.18, socket: bone });
  }
  C.hangLantern = hangLantern;

  // back & hip items
  function buildBackItem(B, item, look = {}) {
    const P = B.P, s = P.s;
    const c = B.pos('back');
    const bz = c[2];
    if (item === 'sword' || item === 'spear') {
      // diagonal across the back: from the right hip up to over the left shoulder
      const ang = 0.7;
      const X = [cos(ang), sin(ang), 0], Y = [-sin(ang), cos(ang), 0], Z = [0, 0, 1];
      if (item === 'sword') {
        const K = kit(B, 'back', vadd(c, [0, 0, -0.012]), [0, 0, 1], X, Y); // scabbard (local +y along diagonal)
        const KS = kit(B, 'backWeap', vadd(c, [0, 0, -0.012]), [0, 0, 1], X, Y);
        K.cyl([0, -0.38, 0], [0, 0.25, 0], 0.022, 0.02, look.scab || 'lacq', 7, { flat: 0.55 });
        K.cyl([0, 0.2, 0], [0, 0.23, 0], 0.024, 0.024, 'bronze', 7, { flat: 0.55 });
        KS.cyl([0, 0.25, 0], [0, 0.42, 0], 0.013, 0.013, 'dark', 6); KS.ball([0, 0.43, 0], 0.016, 'gold'); KS.box([0, 0.255, 0], 0.012, 0.01, 0.042, 'gold');
        // strap across the chest
        const R = C.torsoRings(P);
        const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(C.torsoPt(C.ringAt(R, lerp(P.shoulderY + 0.005, P.waistY - 0.03, t)), lerp(0.62 * PI * 0.5, -0.62 * PI, t) + (t > 0.5 ? 0 : 0), 0.034 * s)); }
        tube(B.G, pts, 4, sw(B, 'leather'), () => ({ rx: 0.012 * s, ry: 0.003 }), (t) => I.torsoW(B, pts[min(12, round(t * 12))]), { nv: 20, up: [0, 0, 1] });
      } else {
        const K = kit(B, 'backWeap', vadd(c, [0, 0, -0.03]), [0, 0, 1], X, Y);
        K.cyl([0, -0.9, 0], [0, 0.85, 0], 0.016, 0.015, 'wood', 6);
        K.cyl([0, 0.85, 0], [0, 0.9, 0], 0.02, 0.016, 'bronze', 6);
        K.cyl([0, 0.9, 0], [0, 1.08, 0], 0.018, 0.002, 'steel', 4, { flat: 0.3 });
      }
    } else if (item === 'basket' || item === 'herbs') { // 背簍 back basket
      const K = kit(B, 'back', vadd(c, [0, -0.05, -0.1 * s]));
      K.lathe((v) => [lerp(0.12, 0.09, v) * s, (0.12 - v * 0.3) * s], 'straw', 12, 5);
      K.lathe((v) => [lerp(0.09, 0, v) * s, -0.18 * s], 'straw', 12, 1, { flip: true });
      if (item === 'herbs') for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; K.path([[cos(a) * 0.06, 0.1, sin(a) * 0.06], [cos(a) * 0.09, 0.22, sin(a) * 0.09], [cos(a) * 0.12, 0.27, sin(a) * 0.12]], (t) => 0.012 * (1 - t), 'green', 3); }
    } else if (item === 'bundle') { // firewood bundle
      const K = kit(B, 'back', vadd(c, [0, -0.02, -0.06 * s]), [0, 0, 1], [0.25, 1, 0], [1, -0.25, 0]);
      for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; K.cyl([cos(a) * 0.04, -0.3, sin(a) * 0.04], [cos(a) * 0.04, 0.32, sin(a) * 0.04], 0.022, 0.02, 'wood', 5); }
      K.cyl([0, 0.05, 0], [0, 0.08, 0], 0.075, 0.075, 'straw', 10);
    } else if (item === 'quiver') {
      const K = kit(B, 'back', vadd(c, [0.05, 0, -0.02]), [1, 0, 0], [0.3, 1, 0], [0, 0, 1]);
      K.cyl([0, -0.25, 0], [0, 0.2, 0], 0.04, 0.045, 'leather', 8);
      for (let k = 0; k < 5; k++) K.cyl([(k - 2) * 0.012, 0.2, (k % 2) * 0.01], [(k - 2) * 0.014, 0.33, (k % 2) * 0.01], 0.004, 0.004, 'white', 3);
    } else if (item === 'umbrella') {
      const K = kit(B, 'back', vadd(c, [0, 0, -0.03]), [1, 0, 0], [0.35, 1, 0], [0, 0, 1]);
      K.cyl([0, -0.5, 0], [0, 0.4, 0], 0.02, 0.05, 'red', 10);
    }
  }
  function buildHipItem(B, item, i) {
    const P = B.P, s = P.s;
    const side = i % 2 === 0 ? 'L' : 'R';
    const sg = side === 'L' ? 1 : -1;
    const bone = 'hip' + side + '2';
    const o = vadd(B.pos(bone), [0, 0, (i >= 2 ? -0.05 : 0.03) * s]);
    const ch = B.chain('hip' + i, bone, [o, vadd(o, [0, -0.07, 0])], { stiff: 2.5, drag: 0.5, grav: 1, r: 0.04, groups: ['leg'], kind: 'prop' });
    const K = kit(B, ch[0], vadd(o, [0, -0.02, 0]));
    const look = (B.S.props3d || {})['hip_' + item] || {};
    if (item === 'gourd') { K.path([[0, 0.03, 0], [0, -0.01, 0]], 0.003, 'red', 3); K.ball([0, -0.05, 0], 0.032, look.mat || 'wood', 1, 1, 1); K.ball([0, -0.11, 0], 0.045, look.mat || 'wood', 1, 1.05, 1); if (look.cord) { K.cyl([0, -0.078, 0], [0, -0.07, 0], 0.024, 0.024, 'red', 8); K.path([[0.02, -0.075, 0.012], [0.03, -0.11, 0.03], [0.028, -0.15, 0.035]], 0.0025, 'red', 3); } }
    else if (item === 'talisman') { // 符袋: leather pouch with a yellow talisman slip sticking out of its mouth
      K.path([[0, 0.02, 0], [0, -0.02, 0]], 0.003, 'leather', 3);
      K.ball([0, -0.065, 0.004], 0.046, 'leather', 1, 1.0, 0.55); K.cyl([0, -0.03, 0.004], [0, -0.022, 0.004], 0.034, 0.03, 'dark', 8, { flat: 0.6 });
      K.box([0.012, -0.012, 0.014], 0.011, 0.045, 0.0015, 'talisman');
    }
    else if (item === 'charm') { // a round yellow sachet and a little cat-face charm (紅纓 secretly loves cute things)
      K.path([[0, 0.02, 0], [0, -0.03, 0]], 0.002, 'red', 3); K.ball([0, -0.065, 0], 0.03, 'sachet', 1, 1.15, 0.5);
      K.path([[0.03, 0.0, 0.01], [0.034, -0.1, 0.012]], 0.0015, 'red', 3); K.ball([0.034, -0.118, 0.012], 0.014, 'catcharm', 1, 0.9, 0.5);
    }
    else if (item === 'pouch') { K.ball([0, -0.06, 0], 0.045, 'leather', 1, 1.1, 0.6); K.cyl([0, -0.015, 0], [0, -0.03, 0], 0.03, 0.03, 'red', 8); }
    else if (item === 'jade') { K.path([[0, 0.02, 0], [0, -0.05, 0]], 0.002, 'red', 3); K.ball([0, -0.075, 0], 0.025, 'jade', 1, 1.2, 0.35); K.path([[0, -0.1, 0], [0, -0.16, 0]], (t) => 0.003 + 0.006 * t, 'tassel', 4); }
    else if (item === 'knife') { const K2 = kit(B, bone, vadd(o, [0, -0.05, 0.02]), [1, 0, 0], [0, 0, 1], [0, -1, 0]); K2.cyl([0, 0, -0.05], [0, 0, 0.2], 0.018, 0.012, 'leather', 6, { flat: 0.5 }); K2.cyl([0, 0, -0.12], [0, 0, -0.05], 0.012, 0.012, 'dark', 5); }
    else if (item === 'sword') { const K2 = kit(B, bone, vadd(o, [0.03 * sg, -0.02, 0.04]), [1, 0, 0], [0, 0.4, 1], [0, -0.92, 0.3]); K2.cyl([0, 0, -0.02], [0, 0, 0.62], 0.02, 0.018, 'lacq', 7, { flat: 0.55 }); K2.cyl([0, 0, -0.2], [0, 0, -0.03], 0.013, 0.013, 'dark', 6); K2.box([0, 0, -0.025], 0.042, 0.012, 0.01, 'gold'); K2.ball([0, 0, -0.21], 0.016, 'gold'); }
    else if (item === 'fan') { K.box([0, -0.07, 0], 0.012, 0.09, 0.02, 'dark'); }
    else if (item === 'flute') { const K2 = kit(B, bone, vadd(o, [0, -0.02, 0.03]), [1, 0, 0], [0, 0, 1], [0, -0.9, 0.4]); K2.cyl([0, 0, -0.1], [0, 0, 0.32], 0.011, 0.011, 'jade', 8); }
    else if (item === 'creel') { K.lathe((v) => [lerp(0.06, 0.08, sin(v * PI)), -v * 0.16], 'straw', 10, 5); }
    else if (item === 'lamp') { K.lathe((v) => [0.025 + 0.01 * sin(v * PI), -v * 0.07], 'bronze', 10, 3); K.ball([0, -0.04, 0.03], 0.012, 'ember'); B.lights.push({ bone: ch[0], pos: K.T([0, -0.04, 0.03]), color: '#ffb060', i: 0.35, r: 1.6, flicker: 0.25 }); }
    else if (item === 'pipe') { const K2 = kit(B, bone, vadd(o, [0.02 * sg, 0.02, 0.05]), [1, 0, 0], [0, 0, 1], [0.15, -0.85, 0.45]); K2.cyl([0, 0, -0.05], [0, 0, 0.45], 0.006, 0.006, 'bamboo', 5); K2.ball([0, 0.012, 0.45], 0.014, 'bronze'); K2.ball([0, 0, -0.055], 0.008, 'jade'); }
    else if (item === 'tally' || item === 'tallyGlow') { // bronze 魚符 half-tally on a cord (glowing teal inlay when souls are near)
      K.path([[0, 0.02, 0], [0, -0.04, 0]], 0.002, 'red', 3); K.box([0, -0.075, 0], 0.026, 0.042, 0.006, 'bronze');
      if (item === 'tallyGlow') { K.box([0, -0.075, 0.0062], 0.012, 0.024, 0.0012, 'teal'); B.lights.push({ bone: ch[0], pos: K.T([0, -0.075, 0.01]), color: '#4fd8c8', i: 0.25, r: 1.2, flicker: 0.1 }); } }
    else if (item === 'jar') { // celadon soul jar
      K.path([[0, 0.02, 0], [0, -0.03, 0]], 0.003, 'red', 3);
      K.lathe((v) => [0.06 * sin(0.3 + v * 2.6) + 0.015, -0.03 - v * 0.15], 'celadon', 14, 6);
      K.lathe((v) => [0.035 * (1 - v), -0.03 + 0.012 * v], 'lacq', 12, 2);
      B.lights.push({ bone: ch[0], pos: K.T([0, -0.1, 0]), color: '#8fdcff', i: 0.35, r: 1.4, flicker: 0.12 });
      K.path([[0.05, -0.05, 0.02], [0.06, -0.1, 0.03], [0.06, -0.16, 0.03]], 0.0018, 'red', 3); K.box([0.06, -0.19, 0.03], 0.024, 0.036, 0.006, 'bronze');
    }
  }
  C.buildBackItem = buildBackItem; C.buildHipItem = buildHipItem;

  function buildProps(B, ctx) {
    const S = B.S;
    const held = S.held, weapon = S.weapon;
    // field held item in the right hand (bone heldR), battle weapon (bone weapR)
    if (held) buildItem(B, held, 'heldR', { look: (S.props3d || {})[held] });
    if (S.heldL) buildItem(B, S.heldL, 'heldL', { look: (S.props3d || {})[S.heldL] });
    const wItem = weapon && weapon !== held ? weapon : null;
    if (wItem) buildItem(B, wItem, 'weapR', { look: (S.props3d || {})[wItem] });
    B.flags.held = held; B.flags.weapon = weapon || (weaponFamily(held) !== 'none' ? held : null);
    B.flags.weaponSame = !!(weapon && weapon === held);
    if (S.back) buildBackItem(B, S.back, (S.props3d || {})['back_' + S.back]);
    (S.hip || []).forEach((h, i) => buildHipItem(B, h, i));
  }
  C.buildProps = buildProps;
})();

// ==================================================================================================== ANIMATION: pose DSL → IK bake → AnimationClips
(() => {
  const C = G.Char3D, I = C._internal;
  const { vadd, vsub, vsc, vlen, vnorm, vcross, vdot, vlerp, sstep, lerp, clamp } = I;
  const PI = Math.PI, TAU = PI * 2, D = PI / 180;
  const { sin, cos, abs, min, max, floor, round, pow, sqrt, acos } = Math;

  const CORE = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'upperArmL', 'foreArmL', 'handL', 'shoulderR', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'];
  const ORDER = { hips: 'YXZ', spine: 'YXZ', chest: 'YXZ', neck: 'YXZ', head: 'YXZ' };
  const ALIAS = { h: 'hips', sp: 'spine', ch: 'chest', nk: 'neck', hd: 'head' };
  const PAIRS = { sh: 'shoulder', ua: 'upperArm', fa: 'foreArm', ha: 'hand', th: 'thigh', sn: 'shin', ft: 'foot', to: 'toe' };
  C.CORE = CORE;

  // ------------------------------------------------------------------------------------------ key-pose DSL
  // key: { t, h:[x,y,z] (deg), sp, ch, nk, hd, uaL, uaR, ua (mirrored pair), faL…, hp:[x,y,z] hips offset (m),
  //        fL/fR:[x,y,z] planted foot offsets (m, root space), fLr/fRr foot rot (deg), hL/hR: IK target, pl:false }
  // Channels interpolate independently with monotone cubic Hermite (no overshoot); a channel holds its value
  // before its first / after its last key. Loops wrap.
  function expandKey(k) {
    const o = {};
    for (const key in k) {
      if (key === 't' || key === 'e') continue;
      const v = k[key];
      if (v === undefined || v === null) continue;
      if (ALIAS[key]) o['r.' + ALIAS[key]] = v;
      else if (PAIRS[key]) { o['r.' + PAIRS[key] + 'L'] = v; o['r.' + PAIRS[key] + 'R'] = [v[0], -v[1], -v[2]]; }
      else if (key.length >= 3 && PAIRS[key.slice(0, 2)] && (key[2] === 'L' || key[2] === 'R')) o['r.' + PAIRS[key.slice(0, 2)] + key[2]] = v;
      else o[key] = v;
    }
    return o;
  }
  function monotone(ts, vs, t, loop, dur) {
    const n = ts.length;
    if (n === 1) return vs[0];
    if (loop) {
      // wrap: extend with neighbours from the other end
      t = ((t % dur) + dur) % dur;
      // drop a closing key that duplicates the first one (t0 + dur)
      let m = n; while (m > 1 && ts[m - 1] >= ts[0] + dur - 1e-6) m--;
      const T = [ts[m - 1] - dur, ...ts.slice(0, m), ts[0] + dur], V = [vs[m - 1], ...vs.slice(0, m), vs[0]];
      return monotone(T, V, t, false, dur);
    }
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];
    let i = 0; while (i < n - 2 && t > ts[i + 1]) i++;
    const h = ts[i + 1] - ts[i], d = (vs[i + 1] - vs[i]) / h;
    const slope = (j) => {
      if (j <= 0 || j >= n - 1) return 0; // flat at the ends (ease in/out)
      const d0 = (vs[j] - vs[j - 1]) / (ts[j] - ts[j - 1]), d1 = (vs[j + 1] - vs[j]) / (ts[j + 1] - ts[j]);
      if (d0 * d1 <= 0) return 0;
      return 3 * (ts[j + 1] - ts[j - 1]) / ((2 * ts[j + 1] - ts[j] - ts[j - 1]) / d0 + (ts[j + 1] + ts[j] - 2 * ts[j - 1]) / d1);
    };
    const m0 = slope(i), m1 = slope(i + 1);
    const u = (t - ts[i]) / h, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * m1;
  }
  // compile key list → sampler(t) returning a pose object
  function keysClip(def) {
    const ch = {};
    for (const k of def.k) {
      const e = expandKey(k);
      for (const c in e) {
        if (!ch[c]) ch[c] = { t: [], v: [] };
        ch[c].t.push(k.t); ch[c].v.push(e[c]);
      }
    }
    const dur = def.dur, loop = !!def.loop;
    return (t) => {
      const pose = { r: {}, pl: def.pl !== false };
      for (const c in ch) {
        const C0 = ch[c];
        const v0 = C0.v[0];
        let val;
        if (typeof v0 === 'number') val = monotone(C0.t, C0.v, t, loop, dur);
        else if (typeof v0 === 'string') { let i = 0; while (i < C0.t.length - 1 && t >= C0.t[i + 1]) i++; val = C0.v[i]; }
        else val = [0, 1, 2].map((j) => monotone(C0.t, C0.v.map((v) => v[j]), t, loop, dur));
        if (c.startsWith('r.')) pose.r[c.slice(2)] = val; else pose[c] = val;
      }
      return pose;
    };
  }
  C.keysClip = keysClip;

  // ------------------------------------------------------------------------------------------ bake rig
  function makeRig(boneDefs) {
    const THREE = window.THREE;
    const bones = {}, list = [];
    for (const d of boneDefs) {
      const b = new THREE.Bone(); b.name = d.name;
      const par = d.parent >= 0 ? boneDefs[d.parent] : null;
      b.position.set(d.pos[0] - (par ? par.pos[0] : 0), d.pos[1] - (par ? par.pos[1] : 0), d.pos[2] - (par ? par.pos[2] : 0));
      bones[d.name] = b; list.push(b);
      if (par) bones[par.name].add(b);
    }
    return { bones, root: bones.root, list, defs: boneDefs, hipsRest: bones.hips.position.clone() };
  }
  const _q = () => new window.THREE.Quaternion(), _v = () => new window.THREE.Vector3();
  function worldPos(b) { return _v().setFromMatrixPosition(b.matrixWorld); }
  function worldQuat(b) { const q = _q(); b.matrixWorld.decompose(_v(), q, _v()); return q; }
  // rotate bone (world-space delta) so that its child at `from` points to `to`
  function aimBone(b, childWorld, target) {
    const THREE = window.THREE;
    const p = worldPos(b);
    const f = childWorld.clone().sub(p).normalize(), t = target.clone().sub(p).normalize();
    if (f.lengthSq() < 1e-8 || t.lengthSq() < 1e-8) return;
    const dq = new THREE.Quaternion().setFromUnitVectors(f, t);
    const wq = worldQuat(b).premultiply(dq);
    const pq = b.parent ? worldQuat(b.parent) : _q();
    b.quaternion.copy(pq.invert().multiply(wq));
    b.updateMatrixWorld(true);
  }
  function setWorldQuat(b, wq) { const pq = b.parent ? worldQuat(b.parent) : _q(); b.quaternion.copy(pq.invert().multiply(wq)); b.updateMatrixWorld(true); }
  function ik2(up, lo, end, target, pole) {
    const THREE = window.THREE;
    const A = worldPos(up), Bp = worldPos(lo), Cp = worldPos(end);
    const l1 = A.distanceTo(Bp), l2 = Bp.distanceTo(Cp);
    const dvec = target.clone().sub(A);
    let d = dvec.length();
    d = clamp(d, abs(l1 - l2) + 1e-4, (l1 + l2) * 0.9995);
    const dir = dvec.normalize();
    const pn = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir)));
    if (pn.lengthSq() < 1e-8) pn.set(0, 0, 1);
    pn.normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = sqrt(max(0, l1 * l1 - a * a));
    const K = A.clone().add(dir.clone().multiplyScalar(a)).add(pn.multiplyScalar(h));
    aimBone(up, Bp, K);
    aimBone(lo, worldPos(end), A.clone().add(dir.clone().multiplyScalar(d)));
  }

  // ------------------------------------------------------------------------------------------ rest pose per body
  function restPose(P, style = {}) {
    const fem = P.fem, st = P.stoop || 0;
    const r = {
      upperArmL: [-3, 0, fem ? -6 : -4], upperArmR: [-3, 0, fem ? 6 : 4],
      foreArmL: [-12, fem ? 8 : 4, 0], foreArmR: [-12, fem ? -8 : -4, 0],
      handL: [4, 0, -6], handR: [4, 0, 6],
      thighL: [0, 0, 1.5], thighR: [0, 0, -1.5],
      spine: [st * 6, 0, 0], chest: [st * 9, 0, 0], neck: [st * 10, 0, 0], head: [-st * 18, 0, 0],
      shoulderL: [0, 0, -st * 3], shoulderR: [0, 0, st * 3],
    };
    if (P.kid) { r.upperArmL[2] += 3; r.upperArmR[2] -= 3; }
    for (const k in style.rest || {}) { const v = style.rest[k]; r[k] = r[k] ? r[k].map((x, i) => x + v[i]) : v.slice(); }
    return { r, hp: [0, -st * 0.025 * P.s + (style.restHp || 0), 0] };
  }

  // ------------------------------------------------------------------------------------------ bake
  // samplerFn(t) → pose; returns THREE.AnimationClip with quaternion tracks for CORE bones + hips position.
  function bake(name, rig, P, sampler, dur, opts = {}) {
    const THREE = window.THREE;
    const fps = opts.fps || 30;
    const n = max(2, round(dur * fps) + 1);
    const times = new Float32Array(n);
    const qs = {}; for (const b of CORE) qs[b] = new Float32Array(n * 4);
    const hp = new Float32Array(n * 3);
    const B = rig.bones;
    const rest = opts.rest || restPose(P);
    const base = {}; for (const d of rig.defs) base[d.name] = d;
    const hipsRest = rig.hipsRest;
    const footRest = { L: _v().fromArray(base.footL.pos), R: _v().fromArray(base.footR.pos) };
    const e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const t = opts.loop ? (i / (n - 1)) * dur : min(dur, i / fps);
      times[i] = t;
      const pose = sampler(t);
      for (const b of CORE) {
        const r0 = rest.r[b] || [0, 0, 0], r1 = (pose.r && pose.r[b]) || [0, 0, 0];
        e.set((r0[0] + r1[0]) * D, (r0[1] + r1[1]) * D, (r0[2] + r1[2]) * D, ORDER[b] || 'XYZ');
        B[b].quaternion.setFromEuler(e);
      }
      const ho = pose.hp || [0, 0, 0];
      B.hips.position.set(hipsRest.x + ho[0] * P.s + rest.hp[0], hipsRest.y + ho[1] * P.s + rest.hp[1], hipsRest.z + ho[2] * P.s + rest.hp[2]);
      rig.root.updateMatrixWorld(true);
      // legs: planted IK
      if (pose.pl !== false) {
        for (const S of ['L', 'R']) {
          const off = pose['f' + S] || [0, 0, 0];
          const tgt = footRest[S].clone().add(_v().set(off[0] * P.s, off[1] * P.s, off[2] * P.s));
          const sg = S === 'L' ? 1 : -1;
          const pole = _v().set(sg * 0.12, 0, 1).applyQuaternion(worldQuat(B.hips)).normalize();
          ik2(B['thigh' + S], B['shin' + S], B['foot' + S], tgt, pole);
          // foot world orientation: flat (+ optional rotation)
          const fr = pose['f' + S + 'r'] || [0, 0, 0];
          const yaw = (pose['f' + S + 'y'] != null ? pose['f' + S + 'y'] : 0) + sg * 4;
          const wq = _q().setFromEuler(new THREE.Euler(fr[0] * D, (fr[1] + yaw) * D, fr[2] * D, 'YXZ'));
          setWorldQuat(B['foot' + S], wq);
          const tr = pose['t' + S] || 0; // toe bend
          B['toe' + S].quaternion.setFromEuler(new THREE.Euler(tr * D, 0, 0));
        }
        rig.root.updateMatrixWorld(true);
      }
      // hand IK: h{S}=[x,y,z] grip target (root space, m) with optional h{S}r=[x,y,z] (deg, YXZ) grip orientation
      // (grip axis = local +Z: sword blade / spear shaft / flute), or h{S}=number → the other hand's weapon shaft at
      // that distance (two-handed grips). Right hand first (the left may grip the right hand's weapon).
      for (const S of ['R', 'L']) {
        const h = pose['h' + S];
        if (h == null || pose['h' + S + 'm'] === 'off') continue;
        const sg = S === 'L' ? 1 : -1;
        const pole = _v().set(sg * 0.7, -0.35, -0.6).applyQuaternion(worldQuat(B.chest)).normalize();
        const hand = B['hand' + S], grip = B['grip' + S];
        if (Array.isArray(h)) {
          const tgt = _v().fromArray(h).multiplyScalar(P.s);
          const r = pose['h' + S + 'r'], dv = pose['h' + S + 'd'];
          if (r || dv) {
            let Qh;
            if (dv) { // grip axis direction (+ optional roll about it); the fist keeps its palm roughly toward the body
              const dn = _v().fromArray(dv).normalize();
              Qh = _q().setFromUnitVectors(_v().set(0, 0, 1), dn);
              const roll = (pose['h' + S + 'roll'] || 0) * D;
              if (roll) Qh.multiply(_q().setFromAxisAngle(_v().set(0, 0, 1), roll));
            } else Qh = _q().setFromEuler(new THREE.Euler(r[0] * D, r[1] * D, r[2] * D, 'YXZ'));
            const off = grip.position.clone().applyQuaternion(Qh);
            ik2(B['upperArm' + S], B['foreArm' + S], hand, tgt.clone().sub(off), pole);
            setWorldQuat(hand, Qh);
          } else ik2(B['upperArm' + S], B['foreArm' + S], hand, tgt, pole);
        } else if (typeof h === 'number') {
          const o = S === 'L' ? 'R' : 'L';
          const og = B['grip' + o];
          const gq = worldQuat(og);
          const axis = _v().set(0, 0, 1).applyQuaternion(gq);
          const tgt = worldPos(og).add(axis.clone().multiplyScalar(h * P.s));
          // fist around the shaft: local +Z along the shaft, palm facing the body
          const hq0 = worldQuat(hand);
          const cur = _v().set(0, 0, 1).applyQuaternion(hq0);
          const Qh = hq0.clone().premultiply(_q().setFromUnitVectors(cur, axis));
          const off = grip.position.clone().applyQuaternion(Qh);
          ik2(B['upperArm' + S], B['foreArm' + S], hand, tgt.clone().sub(off), pole);
          const hq = worldQuat(hand);
          const cur2 = _v().set(0, 0, 1).applyQuaternion(hq);
          setWorldQuat(hand, hq.premultiply(_q().setFromUnitVectors(cur2, axis)));
        }
        rig.root.updateMatrixWorld(true);
      }
      for (const b of CORE) B[b].quaternion.toArray(qs[b], i * 4);
      hp[i * 3] = B.hips.position.x; hp[i * 3 + 1] = B.hips.position.y; hp[i * 3 + 2] = B.hips.position.z;
    }
    // make loops seamless
    if (opts.loop) { for (const b of CORE) for (let k = 0; k < 4; k++) qs[b][(n - 1) * 4 + k] = qs[b][k]; for (let k = 0; k < 3; k++) hp[(n - 1) * 3 + k] = hp[k]; }
    // keep quaternion signs continuous (no flips during interpolation)
    for (const b of CORE) { const a = qs[b]; for (let i = 1; i < n; i++) { const d = a[i * 4] * a[i * 4 - 4] + a[i * 4 + 1] * a[i * 4 - 3] + a[i * 4 + 2] * a[i * 4 - 2] + a[i * 4 + 3] * a[i * 4 - 1]; if (d < 0) for (let k = 0; k < 4; k++) a[i * 4 + k] *= -1; } }
    const tracks = CORE.map((b) => new THREE.QuaternionKeyframeTrack(b + '.quaternion', times, qs[b]));
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hp));
    const clip = new THREE.AnimationClip(name, dur, tracks);
    clip.userData = { loop: !!opts.loop, meta: opts.meta || {} };
    return clip;
  }
  C.bake = bake; C.makeRig = makeRig; C.restPose = restPose; C._ik = { ik2, worldQuat, worldPos, setWorldQuat, aimBone };

  // ------------------------------------------------------------------------------------------ procedural gait
  // p ∈ [0,1): left heel strike at 0, right at 0.5. Feet are planted while in stance and move back at exactly
  // stride/T relative to the hips → zero sliding when cadence = speed / stride.
  const GAITS = {
    walk: { v: 2.2, stride: 1.56, duty: 0.6, lift: 0.08, bob: 0.02, sway: 0.022, hipYaw: 7, hipRoll: 3.5, chestYaw: -6, arm: 20, armOut: 0, elbow: 4, lean: 3, toeOff: 34, heel: 16, bounce: 0, twist: 4 },
    jog: { v: 4.2, stride: 2.2, duty: 0.36, lift: 0.16, bob: 0.028, sway: 0.014, hipYaw: 9, hipRoll: 4, chestYaw: -9, arm: 28, armOut: 2, elbow: 76, lean: 8, toeOff: 44, heel: 8, bounce: 1, twist: 12 },
    run: { v: 6.9, stride: 3.0, duty: 0.28, lift: 0.26, bob: 0.032, sway: 0.01, hipYaw: 11, hipRoll: 4.5, chestYaw: -12, arm: 40, armOut: 3, elbow: 86, lean: 13, toeOff: 52, heel: 4, bounce: 1, twist: 14 },
  };
  C.GAITS = GAITS;
  function gaitSampler(P, g, ctx = {}) {
    const s = P.s;
    const stride = g.stride * s * (ctx.strideK || 1);
    const fem = P.fem;
    const hold = ctx.hold || 'none';
    const aY = P.ankleY, dHeel = 0.062 * s, dBall = P.foot * 0.56 - 0.055 * s;
    const Lmax = (P.legTop - P.ankleY) * 0.975;
    // ankle position for a foot whose flat position is at z=F, pitched by `pitch` (deg, + = heel up) about heel or ball
    const footRoll = (F, pitch, lift) => {
      const th = pitch * D, c = cos(th), sn = sin(th);
      if (lift > 1e-4 || abs(pitch) < 1e-3) return [aY + lift, F];
      if (pitch > 0) return [aY * c + dBall * sn, F + dBall + (aY * sn - dBall * c)];     // pivot: ball of the foot
      return [aY * c - dHeel * sn, F - dHeel + (aY * sn + dHeel * c)];                    // pivot: heel
    };
    return (tt) => {
      const p = tt; // clip duration = 1 → phase
      const pose = { r: {}, pl: true };
      let hpMax = 1;
      const D0 = stride * g.duty;       // distance the flat foot travels back during stance (= speed × contact time)
      for (const S of ['L', 'R']) {
        const ph = ((p + (S === 'R' ? 0.5 : 0)) % 1 + 1) % 1;
        const sg = S === 'L' ? 1 : -1;
        let F, lift = 0, pitch = 0, toe = 0, stance = false;
        if (ph < g.duty) {
          stance = true;
          const u = ph / g.duty;
          F = D0 / 2 - D0 * u;
          // heel strike (toes up, rolling onto the flat foot) → flat → heel off (rolling over the ball)
          pitch = -g.heel * (1 - sstep(0, 0.2, u)) + g.toeOff * pow(sstep(0.45, 1, u), 1.2);
          if (g.bounce) pitch = -g.heel * (1 - sstep(0, 0.12, u)) + g.toeOff * pow(sstep(0.4, 1, u), 1.1);
          toe = pitch > 0 ? -pitch : 0;
        } else {
          const u = (ph - g.duty) / (1 - g.duty);
          const e = u * u * (3 - 2 * u);
          F = -D0 / 2 + D0 * e;
          lift = g.lift * s * pow(sin(PI * min(1, u * 1.05)), 1.3) * (1 - 0.3 * u);
          // swing: toes trail, then the foot dorsiflexes to meet the ground heel-first
          pitch = lerp(g.toeOff * 0.75, -g.heel * 1.1, sstep(0.05, 0.9, u));
          toe = -g.toeOff * 0.35 * (1 - sstep(0, 0.35, u));
          // swing foot starts from the rolled toe-off position: blend the pivot offset out over the first 20 %
          const k0 = 1 - sstep(0, 0.22, u);
          const r0 = footRoll(-D0 / 2, g.toeOff, 0);
          lift += (r0[0] - aY) * k0; F += (r0[1] + D0 / 2) * k0;
        }
        const [ay, az] = stance ? footRoll(F, pitch, 0) : [aY + lift, F];
        pose['f' + S] = [sg * -0.012 * s / s, (ay - aY) / s, az / s];
        pose['f' + S + 'r'] = [pitch, 0, 0];
        pose['t' + S] = toe;
        if (stance || lift < 0.03 * s) { const dz = az, dy = sqrt(max(0, Lmax * Lmax - dz * dz)); hpMax = min(hpMax, ay + dy - P.legTop); }
      }
      // hips: bob (2 per cycle), sway toward the stance foot, yaw with the swinging leg, roll (swing hip drops)
      const c2 = cos(4 * PI * (p - (g.bounce ? 0.0 : g.duty * 0.5)));
      const bob = g.bounce ? -c2 * g.bob : c2 * g.bob;
      const sway = g.sway * cos(TAU * (p - 0.25 + (g.bounce ? 0 : 0.0)));
      const hy = min(bob - (g.bounce ? 0.04 * s : 0.012 * s), hpMax);
      pose.hp = [sway / s, hy / s, 0];
      const yaw = -g.hipYaw * cos(TAU * p);
      const roll = g.hipRoll * sin(TAU * (p - 0.1));
      pose.r.hips = [g.lean * 0.4, yaw, roll];
      pose.r.spine = [g.lean * 0.4, -yaw * 0.4, -roll * 0.5];
      pose.r.chest = [g.lean * 0.3 + (g.bounce ? 1.5 * c2 : 0), g.chestYaw * -cos(TAU * p) * -1 - yaw * 0.25, -roll * 0.4];
      pose.r.neck = [-g.lean * 0.4, -yaw * 0.25, roll * 0.3];
      pose.r.head = [-g.lean * 0.45 - (g.bounce ? 1 * c2 : 0), -yaw * 0.25, roll * 0.25];
      // arms: opposite to the legs, lagging slightly (follow-through); elbow bends more on the forward swing
      for (const S of ['L', 'R']) {
        const sg = S === 'L' ? 1 : -1;
        const ph = p + (S === 'L' ? 0.5 : 0) - 0.04;
        const sw = cos(TAU * ph); // +1 → arm forward
        const fwd = -g.arm * sw - g.arm * 0.15;
        let ua = [fwd, -sg * g.twist, sg * (g.armOut + (fem ? -2 : 0) + 2 * (1 - sw) * 0.5)];
        let fa = [-g.elbow - (g.bounce ? 14 : 7) * max(0, sw) + (g.bounce ? 8 : 0) * max(0, -sw), sg * 4, 0];
        let ha = [g.bounce ? -10 : 6 + 4 * sw, 0, -sg * 8];
        // held props constrain the arm that carries them
        const holds = S === 'R' ? hold : ctx.holdL || 'none';
        if (holds === 'pole') { ua = [-14 + fwd * 0.12, sg * -6, sg * 4]; fa = [-62, sg * -18, 0]; ha = [-18, 0, -sg * 6]; }
        else if (holds === 'cane') { ua = [-10 + fwd * 0.25, 0, sg * 6]; fa = [-28, 0, 0]; ha = [-6, 0, 0];
          const cz = 0.17 + 0.12 * Math.sin(TAU * (p + 0.25)), cy = 0.83 + 0.03 * Math.max(0, Math.cos(TAU * (p + 0.25)));
          pose.hR = [-0.22, cy, cz]; pose.hRd = [0.03, -1, 0.06 - 0.25 * Math.sin(TAU * (p + 0.25))]; pose.hRm = 'on'; }
        else if (holds === 'hang') { ua = [fwd * 0.35 - 8, 0, sg * 10]; fa = [-26 - 6 * max(0, sw), 0, 0]; ha = [10, 0, 0]; }
        else if (holds === 'front') { ua = [-16 + fwd * 0.1, sg * -6, sg * 6]; fa = [-88, sg * -26, 0]; ha = [-8, 0, -sg * 4]; }
        else if (holds === 'shoulder') { ua = [-38, sg * -18, sg * 16]; fa = [-118, sg * -10, 0]; ha = [-20, 0, 0]; }
        else if (holds === 'blade') { ua = [fwd * 0.6 - 4, 0, sg * 6]; fa = [-22 - 10 * max(0, sw), 0, 0]; ha = [24, 0, 0]; }
        else if (holds === 'twohand') { ua = [-30, sg * -10, sg * 6]; fa = [-70, sg * -30, 0]; ha = [-10, 0, 0]; }
        pose.r['upperArm' + S] = ua; pose.r['foreArm' + S] = fa; pose.r['hand' + S] = ha;
        pose.r['shoulder' + S] = [0, sg * 4 * sw, sg * (g.bounce ? 2 : 0) + 1.5 * sw];
      }
      return pose;
    };
  }
  C.gaitSampler = gaitSampler;

  // ------------------------------------------------------------------------------------------ clip library
  // Each entry: (ctx) → { dur, loop, k:[keys] } | { fn, dur, loop }. ctx: { P, fam (weapon family), hold, style, fem, kid }
  const L = {};
  C.CLIPS = L;
  const M = (x, y, z) => [x, y, z];

  // ---- field idle (breathing, slow weight shift, arms settling with a lag)
  L.idle = (c) => {
    const st = c.style || {};
    const holdArm = holdArmKeys(c.hold);
    const k = [
      { t: 0, hp: [0.006, 0, 0], h: [0, 3, 1.5], sp: [0, -1, -1], ch: [-1.2, -1, -0.5], nk: [0, 0, 0], hd: [0, 2, -1], fL: [0, 0, 0], fR: [0, 0, 0], shL: [0, 0, 0], shR: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0] },
      { t: 1.0, ch: [1.5, -0.5, -0.3], shL: [0, 0, 1.8], shR: [0, 0, -1.8], ua: [-1, 0, 1] },
      { t: 2.0, hp: [-0.008, -0.004, 0], h: [0, -2, -1.8], sp: [0, 1, 1], ch: [-1.2, 1, 0.6], hd: [1, -2, 1.2], shL: [0, 0, 0], shR: [0, 0, 0], ua: [0.5, 0, -0.5] },
      { t: 3.0, ch: [1.5, 0.5, 0.3], shL: [0, 0, 1.8], shR: [0, 0, -1.8], ua: [-1, 0, 1], hd: [0.5, -1, 0.8] },
      { t: 4.0, hp: [0.006, 0, 0], h: [0, 3, 1.5], sp: [0, -1, -1], ch: [-1.2, -1, -0.5], hd: [0, 2, -1], shL: [0, 0, 0], shR: [0, 0, 0], ua: [0, 0, 0] },
    ];
    return { dur: 4, loop: true, k: applyHold(k, holdArm) };
  };
  function holdArmKeys(hold) {
    switch (hold) {
      case 'pole': return { uaR: [-12, 6, -6], faR: [-64, -16, 0], haR: [-16, 0, 6] };
      case 'cane': return { uaR: [-14, 0, -8], faR: [-24, 0, 0], haR: [-8, 0, 0], hR: [-0.22, 0.83, 0.17], hRd: [0.03, -1, 0.06], hRm: 'on' };
      case 'hang': return { uaR: [-6, 0, -10], faR: [-24, 0, 0], haR: [10, 0, 0] };
      case 'front': return { uaR: [-14, 6, -6], faR: [-86, -24, 0], haR: [-8, 0, 4] };
      case 'shoulder': return { uaR: [-38, 18, -16], faR: [-118, 10, 0], haR: [-20, 0, 0] };
      case 'blade': return { uaR: [-4, 0, -8], faR: [-20, 0, 0], haR: [26, 0, 0] };
      default: return null;
    }
  }
  function applyHold(keys, hk) {
    if (!hk) return keys;
    return keys.map((k) => {
      const o = Object.assign({}, k);
      if (k.t === 0) for (const kk of ['hR', 'hRd', 'hRm']) if (hk[kk] != null) o[kk] = hk[kk];
      if ('ua' in o || 'uaR' in o || k.t === 0) { const ua = o.ua; if (ua) { o.uaL = ua; delete o.ua; } o.uaR = hk.uaR; }
      if ('fa' in o || 'faR' in o || k.t === 0) { const fa = o.fa; if (fa) { o.faL = fa; delete o.fa; } o.faR = hk.faR; }
      if ('ha' in o || 'haR' in o || k.t === 0) { const ha = o.ha; if (ha) { o.haL = ha; delete o.ha; } o.haR = hk.haR; }
      return o;
    });
  }
  C.applyHold = applyHold; C.holdArmKeys = holdArmKeys;

  // ---- fidgets (played occasionally from idle)
  L.f_look = (c) => ({ dur: 3.2, k: applyHold([
    { t: 0, hd: [0, 0, 0], nk: [0, 0, 0], ch: [0, 0, 0] },
    { t: 0.5, hd: [-2, 28, -3], nk: [0, 14, 0], ch: [0, 6, 0] },
    { t: 1.5, hd: [-2, 30, -3], nk: [0, 15, 0], ch: [0, 6, 0] },
    { t: 1.95, hd: [2, -26, 3], nk: [0, -13, 0], ch: [0, -5, 0] },
    { t: 2.6, hd: [2, -27, 3], nk: [0, -13, 0], ch: [0, -5, 0] },
    { t: 3.2, hd: [0, 0, 0], nk: [0, 0, 0], ch: [0, 0, 0] },
  ], holdArmKeys(c.hold)) });
  L.f_stretch = (c) => ({ dur: 2.8, k: [
    { t: 0, ua: [0, 0, 0], fa: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], hp: [0, 0, 0] },
    { t: 0.35, ua: [-10, 0, 10], fa: [-60, 0, 0], ch: [3, 0, 0] },
    { t: 0.9, uaL: [-170, 0, 18], uaR: [-170, 0, -18], faL: [-25, 0, 0], faR: [-25, 0, 0], haL: [0, 0, -20], haR: [0, 0, 20], ch: [-12, 0, 0], hd: [-14, 0, 0], hp: [0, 0.012, 0] },
    { t: 1.6, uaL: [-172, 0, 22], uaR: [-172, 0, -22], ch: [-14, 0, 0], hd: [-16, 0, 0] },
    { t: 2.2, ua: [-5, 0, 6], fa: [-20, 0, 0], ch: [2, 0, 0], hd: [2, 0, 0], hp: [0, 0, 0], haL: [0, 0, 0], haR: [0, 0, 0] },
    { t: 2.8, ua: [0, 0, 0], fa: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0] },
  ] });
  L.f_shift = (c) => ({ dur: 2.4, k: applyHold([
    { t: 0, hp: [0, 0, 0], h: [0, 0, 0], fL: [0, 0, 0], fR: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0] },
    { t: 0.6, hp: [0.03, -0.012, 0], h: [0, 4, 5], ch: [0, -3, -3], hd: [0, 0, 3] },
    { t: 1.5, hp: [0.03, -0.012, 0], fR: [-0.02, 0, 0.06], fRr: [0, -10, 0], h: [0, 5, 5] },
    { t: 2.4, hp: [0, 0, 0], h: [0, 0, 0], fR: [0, 0, 0], fRr: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0] },
  ], holdArmKeys(c.hold)) });
  L.f_scratch = (c) => ({ dur: 2.2, k: [
    { t: 0, uaL: [0, 0, 0], faL: [0, 0, 0], haL: [0, 0, 0], hd: [0, 0, 0] },
    { t: 0.45, uaL: [-120, 20, 40], faL: [-120, 0, 0], haL: [-10, 0, 0], hd: [6, -8, 8] },
    { t: 0.6, haL: [10, 0, 10] }, { t: 0.75, haL: [-10, 0, -10] }, { t: 0.9, haL: [10, 0, 10] }, { t: 1.05, haL: [-10, 0, -10] }, { t: 1.2, haL: [5, 0, 0] },
    { t: 1.6, uaL: [-10, 0, 0], faL: [-25, 0, 0], hd: [2, -2, 2] },
    { t: 2.2, uaL: [0, 0, 0], faL: [0, 0, 0], haL: [0, 0, 0], hd: [0, 0, 0] },
  ].map((k) => Object.assign(k, holdArmKeys(c.hold) || {})) });

  // ---- talk & gestures
  L.talk = (c) => ({ dur: 3.6, loop: true, k: applyHold([
    { t: 0, ua: [0, 0, 0], fa: [0, 0, 0], ha: [0, 0, 0], hd: [0, 0, 0], ch: [0, 0, 0] },
    { t: 0.5, uaL: [-22, -10, 8], faL: [-62, 30, 0], haL: [-10, 40, 0], hd: [4, 4, -3], ch: [2, 3, 0] },
    { t: 1.0, uaL: [-26, -14, 12], faL: [-55, 36, 0], haL: [8, 50, 0], hd: [-2, 2, 2] },
    { t: 1.5, uaL: [-16, -6, 6], faL: [-48, 20, 0], hd: [3, -4, 0], ch: [1, -3, 0] },
    { t: 2.1, uaR: [-24, 12, -10], faR: [-64, -32, 0], haR: [-12, -40, 0], hd: [2, -6, 3] },
    { t: 2.7, uaR: [-18, 8, -6], faR: [-50, -24, 0], haR: [6, -50, 0], hd: [-2, 0, 0] },
    { t: 3.6, ua: [0, 0, 0], fa: [0, 0, 0], ha: [0, 0, 0], hd: [0, 0, 0], ch: [0, 0, 0] },
  ], holdArmKeys(c.hold)) });
  L.nod = (c) => ({ dur: 0.9, k: applyHold([{ t: 0, hd: [0, 0, 0], nk: [0, 0, 0] }, { t: 0.18, hd: [16, 0, 0], nk: [6, 0, 0] }, { t: 0.36, hd: [-3, 0, 0], nk: [0, 0, 0] }, { t: 0.55, hd: [11, 0, 0], nk: [4, 0, 0] }, { t: 0.9, hd: [0, 0, 0], nk: [0, 0, 0] }], holdArmKeys(c.hold)) });
  L.shake = (c) => ({ dur: 1.0, k: applyHold([{ t: 0, hd: [0, 0, 0] }, { t: 0.15, hd: [2, 22, 0] }, { t: 0.35, hd: [2, -22, 0] }, { t: 0.55, hd: [2, 18, 0] }, { t: 0.75, hd: [1, -12, 0] }, { t: 1.0, hd: [0, 0, 0] }], holdArmKeys(c.hold)) });
  L.bow = (c) => ({ dur: 1.9, k: [
    { t: 0, sp: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], h: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0], hp: [0, 0, 0] },
    { t: 0.3, ua: [-28, -20, -2], fa: [-95, 50, 0], ha: [0, 0, 0] },            // hands come together (拱手)
    { t: 0.75, h: [22, 0, 0], sp: [14, 0, 0], ch: [10, 0, 0], hd: [6, 0, 0], hp: [0, -0.01, -0.04], ua: [-48, -22, -4], fa: [-90, 54, 0] },
    { t: 1.15, h: [24, 0, 0], sp: [15, 0, 0], ch: [11, 0, 0], hd: [8, 0, 0] },
    { t: 1.6, h: [0, 0, 0], sp: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], hp: [0, 0, 0], ua: [-22, -18, -2], fa: [-90, 48, 0] },
    { t: 1.9, ua: [0, 0, 0], fa: [0, 0, 0] },
  ] });
  L.point = (c) => ({ dur: 1.6, k: [
    { t: 0, uaR: [0, 0, 0], faR: [0, 0, 0], haR: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0] },
    { t: 0.18, uaR: [-35, 0, 10], faR: [-50, 0, 0], ch: [0, 4, 0] },                     // anticipation: pull back
    { t: 0.32, uaR: [-86, -6, -8], faR: [-6, 0, 0], haR: [-8, 0, 0], ch: [0, -12, 0], hd: [-4, -10, 0] },
    { t: 0.42, uaR: [-90, -8, -9] },
    { t: 1.15, uaR: [-88, -6, -8], faR: [-8, 0, 0] },
    { t: 1.6, uaR: [0, 0, 0], faR: [0, 0, 0], haR: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0] },
  ] });
  L.wave = (c) => ({ dur: 1.8, k: applyHold([
    { t: 0, uaL: [0, 0, 0], faL: [0, 0, 0], haL: [0, 0, 0], hd: [0, 0, 0] },
    { t: 0.3, uaL: [-30, 0, 80], faL: [-100, 0, 0], haL: [0, 0, 0], hd: [0, 0, -6] },
    { t: 0.5, faL: [-80, 0, 0], haL: [0, 0, 15] }, { t: 0.7, faL: [-110, 0, 0], haL: [0, 0, -15] }, { t: 0.9, faL: [-80, 0, 0], haL: [0, 0, 15] }, { t: 1.1, faL: [-108, 0, 0], haL: [0, 0, -12] },
    { t: 1.35, uaL: [-26, 0, 70] },
    { t: 1.8, uaL: [0, 0, 0], faL: [0, 0, 0], haL: [0, 0, 0], hd: [0, 0, 0] },
  ], holdArmKeys(c.hold)) });
  L.think = (c) => ({ dur: 3.0, loop: true, k: [
    { t: 0, uaR: [-30, 20, -6], faR: [-128, -20, 0], haR: [-30, 0, 0], uaL: [-24, -30, 10], faL: [-90, 40, 0], hd: [6, -8, 6], ch: [2, 0, 0] },
    { t: 1.5, hd: [4, -12, 9], uaR: [-32, 20, -6] },
    { t: 3.0, hd: [6, -8, 6], uaR: [-30, 20, -6] },
  ] });
  L.surprise = (c) => ({ dur: 1.3, k: applyHold([
    { t: 0, hp: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0] },
    { t: 0.08, hp: [0, -0.02, 0], ch: [4, 0, 0] },                                      // tiny anticipation
    { t: 0.2, hp: [0, 0.03, -0.03], ch: [-10, 0, 0], hd: [-12, 0, 0], ua: [-30, 0, 30], fa: [-60, 0, 0] },
    { t: 0.32, hp: [0, 0.0, -0.05], ch: [-6, 0, 0], ua: [-26, 0, 26] },
    { t: 0.9, hp: [0, 0, -0.05], ch: [-4, 0, 0], hd: [-6, 0, 0], ua: [-14, 0, 16], fa: [-40, 0, 0] },
    { t: 1.3, hp: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0] },
  ], null) });
  L.laugh = (c) => ({ dur: 1.8, k: applyHold([
    { t: 0, ch: [0, 0, 0], hd: [0, 0, 0], hp: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0] },
    { t: 0.25, ch: [-8, 0, 0], hd: [-14, 0, 0], ua: [-10, 0, 8], fa: [-40, 0, 0] },
    { t: 0.4, ch: [-4, 0, 0], hp: [0, -0.008, 0] }, { t: 0.55, ch: [-9, 0, 0], hp: [0, 0.004, 0] }, { t: 0.7, ch: [-4, 0, 0], hp: [0, -0.008, 0] },
    { t: 0.85, ch: [-9, 0, 0], hp: [0, 0.004, 0] }, { t: 1.0, ch: [8, 0, 0], hd: [10, 0, 0], ua: [-20, -20, 0], fa: [-80, 30, 0], hp: [0, -0.015, 0] },
    { t: 1.8, ch: [0, 0, 0], hd: [0, 0, 0], hp: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0] },
  ], holdArmKeys(c.hold)) });
  L.cry = (c) => ({ dur: 2.4, loop: true, k: [
    { t: 0, ch: [12, 0, 0], hd: [18, 0, 0], ua: [-60, -24, 8], fa: [-120, 30, 0], ha: [-20, 0, 0], hp: [0, -0.01, 0] },
    { t: 0.6, ch: [14, 0, 0], hd: [20, 0, 2], hp: [0, -0.014, 0] },
    { t: 1.2, ch: [12, 0, 0], hd: [17, 0, -2], hp: [0, -0.01, 0] },
    { t: 1.8, ch: [14.5, 0, 0], hd: [20, 0, 1], hp: [0, -0.015, 0] },
    { t: 2.4, ch: [12, 0, 0], hd: [18, 0, 0], hp: [0, -0.01, 0] },
  ] });
  L.pray = (c) => ({ dur: 3.0, loop: true, k: [
    { t: 0, ua: [-28, -24, 0], fa: [-102, 58, 0], ha: [0, -6, 0], hd: [12, 0, 0], ch: [3, 0, 0] },
    { t: 1.5, hd: [14, 0, 0], ch: [4.5, 0, 0], ua: [-29, -24, 0] },
    { t: 3.0, hd: [12, 0, 0], ch: [3, 0, 0], ua: [-28, -24, 0] },
  ] });
  // sit (on the ground, legs crossed-ish) / kneel / sleep: intro + held loop
  L.sit = (c) => ({ dur: 1.2, pl: false, k: [
    { t: 0, hp: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], snL: [0, 0, 0], snR: [0, 0, 0], h: [0, 0, 0], ch: [0, 0, 0] },
    { t: 0.5, hp: [0, -0.35, -0.08], thL: [-60, 0, 10], thR: [-60, 0, -10], snL: [100, 0, 0], snR: [100, 0, 0], h: [16, 0, 0], ch: [6, 0, 0], ua: [-20, 0, 10], fa: [-30, 0, 0] },
    { t: 1.2, hp: [0, -0.6, -0.04], thL: [-80, 12, 30], thR: [-80, -12, -30], snL: [130, 0, 0], snR: [130, 0, 0], ftL: [20, 0, 0], ftR: [20, 0, 0], h: [6, 0, 0], ch: [6, 0, 0], ua: [-30, -10, 10], fa: [-50, 30, 0] },
  ] });
  L.sit_loop = (c) => ({ dur: 4, loop: true, pl: false, k: [
    { t: 0, hp: [0, -0.6, -0.04], thL: [-80, 12, 30], thR: [-80, -12, -30], snL: [130, 0, 0], snR: [130, 0, 0], ftL: [20, 0, 0], ftR: [20, 0, 0], h: [6, 0, 0], ch: [6, 0, 0], ua: [-30, -10, 10], fa: [-50, 30, 0], hd: [0, 0, 0] },
    { t: 2, ch: [7.5, 0, 0], hd: [3, 4, 2] }, { t: 4, ch: [6, 0, 0], hd: [0, 0, 0] },
  ] });
  L.kneel = (c) => ({ dur: 0.9, k: [
    { t: 0, hp: [0, 0, 0], fL: [0, 0, 0], fR: [0, 0, 0], h: [0, 0, 0], ch: [0, 0, 0] },
    { t: 0.4, hp: [0, -0.25, 0.04], fL: [0, 0, 0.16], fR: [0, 0.05, -0.16], fRr: [40, 0, 0], tR: -40, ch: [8, 0, 0], h: [6, 0, 0] },
    { t: 0.9, hp: [0, -0.4, 0.03], fL: [0, 0, 0.2], fR: [0, 0.06, -0.24], fRr: [70, 0, 0], tR: -60, ch: [6, 0, 0], h: [4, 0, 0], ua: [-10, 0, 6], fa: [-40, 0, 0], hd: [8, 0, 0] },
  ] });
  L.kneel_loop = (c) => ({ dur: 3, loop: true, k: [
    { t: 0, hp: [0, -0.4, 0.03], fL: [0, 0, 0.2], fR: [0, 0.06, -0.24], fRr: [70, 0, 0], tR: -60, ch: [6, 0, 0], h: [4, 0, 0], ua: [-10, 0, 6], fa: [-40, 0, 0], hd: [8, 0, 0] },
    { t: 1.5, ch: [7.5, 0, 0], hd: [9, 0, 0] }, { t: 3, ch: [6, 0, 0], hd: [8, 0, 0] },
  ] });
  L.sleep = (c) => ({ dur: 1.6, pl: false, k: [
    { t: 0, hp: [0, 0, 0], h: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], snL: [0, 0, 0], snR: [0, 0, 0] },
    { t: 0.7, hp: [0, -0.55, -0.1], h: [10, 0, 0], thL: [-70, 0, 8], thR: [-70, 0, -8], snL: [110, 0, 0], snR: [110, 0, 0], ch: [8, 0, 0] },
    { t: 1.6, hp: [0, -(0.9 - 0.08), -0.1], h: [-84, 0, 0], ch: [-4, 0, 0], hd: [-6, 30, 0], thL: [-10, 0, 4], thR: [-6, 0, -4], snL: [16, 0, 0], snR: [10, 0, 0], ftL: [30, 0, 0], ftR: [30, 0, 0], ua: [-10, 0, 10], fa: [-50, 0, 0] },
  ] });
  L.sleep_loop = (c) => ({ dur: 4, loop: true, pl: false, k: [
    { t: 0, hp: [0, -(0.9 - 0.08), -0.1], h: [-84, 0, 0], ch: [-4, 0, 0], hd: [-6, 30, 0], thL: [-10, 0, 4], thR: [-6, 0, -4], snL: [16, 0, 0], snR: [10, 0, 0], ftL: [30, 0, 0], ftR: [30, 0, 0], ua: [-10, 0, 10], fa: [-50, 0, 0] },
    { t: 2, ch: [-1, 0, 0] }, { t: 4, ch: [-4, 0, 0] },
  ] });
  L.fall = (c) => ({ dur: 1.1, pl: false, k: [
    { t: 0, hp: [0, 0, 0], h: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], snL: [0, 0, 0], snR: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0] },
    { t: 0.18, hp: [0, -0.06, -0.06], h: [-10, 0, 0], ch: [-14, 0, 0], hd: [-16, 0, 0], ua: [-50, 0, 40], fa: [-30, 0, 0], thL: [-20, 0, 0], snL: [30, 0, 0] },
    { t: 0.45, hp: [0, -0.55, -0.35], h: [-40, 0, 0], ch: [-10, 0, 0], thL: [-60, 0, 6], thR: [-40, 0, -6], snL: [60, 0, 0], snR: [40, 0, 0], ua: [-30, 0, 50] },
    { t: 0.62, hp: [0, -(0.85), -0.55], h: [-82, 0, 4], ch: [-4, 0, 0], hd: [-10, 0, 6], thL: [-40, 0, 8], thR: [-20, 0, -6], snL: [60, 0, 0], snR: [20, 0, 0], ua: [-20, 0, 60], fa: [-10, 0, 0] },
    { t: 0.72, hp: [0, -(0.82), -0.56], hd: [-14, 0, 6] },
    { t: 1.1, hp: [0, -(0.85), -0.56], h: [-84, 0, 4], hd: [-8, 8, 6], thL: [-30, 0, 8], thR: [-12, 0, -6], snL: [50, 0, 0], snR: [14, 0, 0], ftL: [20, 0, 0], ftR: [30, 0, 0] },
  ] });

  // ---- battle (weapon families: blade, pole, fan, flute, none)
  // Stances: hand grips are IK targets (root space, metres; character faces +Z, its right is −X) with weapon
  // orientation h?r = [pitch, yaw, roll] (deg) of the grip axis; legs are planted IK; torso FK.
  function stance(c) {
    const f = c.fam;
    if (f === 'blade') return { fL: [0.05, 0, 0.15], fR: [-0.05, 0, -0.13], fLy: -8, fRy: 30, hp: [0, -0.08, 0], h: [6, -16, 0], sp: [2, 6, 0], ch: [4, 8, 0], nk: [0, 0, 0], hd: [-6, 4, 0],
      hR: [-0.06, 1.04, 0.4], hRd: [0.05, 0.3, 1], hRm: 'on', hL: [0.3, 1.66, -0.02], hLm: 'on', haL: [-20, 0, 10] };
    if (f === 'pole') return { fL: [0.07, 0, 0.22], fR: [-0.06, 0, -0.18], fLy: -20, fRy: 40, hp: [0.01, -0.06, 0], h: [4, -34, 0], sp: [2, 6, 0], ch: [0, 8, 0], nk: [0, 4, 0], hd: [-2, 14, 0],
      hR: [-0.16, 1.0, -0.08], hRr: [-20, 10, 0], hRm: 'on', hL: 0.6, hLm: 'on' };
    if (f === 'fan') return { fL: [0.04, 0, 0.1], fR: [-0.04, 0, -0.1], fRy: 22, hp: [0, -0.035, 0], h: [3, -14, 0], sp: [0, 0, 0], ch: [-2, 10, 0], nk: [0, 0, 0], hd: [-2, 4, 0],
      hR: [-0.17, 1.32, 0.2], hRr: [-75, -15, 0], hRm: 'on', uaL: [18, -20, 14], faL: [-85, 35, 0], haL: [0, 0, 0] };
    if (f === 'flute') return { fL: [0.02, 0, 0.05], fR: [-0.02, 0, -0.06], hp: [0, -0.015, 0], h: [1, -8, 0], sp: [0, 0, 0], ch: [-3, 4, 0], nk: [0, -4, 0], hd: [-4, -6, 6],
      hR: [-0.2, 1.4, 0.13], hRr: [-4, 90, 0], hRm: 'on', hL: 0.11, hLm: 'on' };
    return { fL: [0.05, 0, 0.12], fR: [-0.04, 0, -0.12], fRy: 15, hp: [0, -0.06, 0], h: [5, 15, 0], sp: [0, 0, 0], ch: [3, -10, 0], nk: [0, 0, 0], hd: [-3, -6, 0],
      uaL: [-40, -10, 12], faL: [-100, 20, 0], uaR: [-30, 10, -14], faR: [-110, -20, 0], haL: [-20, 0, 0], haR: [-20, 0, 0] };
  }
  C.stance = stance;
  const K = (t, base, o) => Object.assign({ t }, base || {}, o || {});
  const offH = (h, d) => (Array.isArray(h) ? [h[0] + d[0], h[1] + d[1], h[2] + d[2]] : h);
  const breathe = (s, k = 1) => [K(0, s), K(0.9, null, { ch: [s.ch[0] + 2 * k, s.ch[1], s.ch[2]], hp: [s.hp[0], s.hp[1] - 0.008 * k, s.hp[2]], hR: offH(s.hR, [0, -0.006 * k, 0]) }), K(1.8, null, { ch: s.ch, hp: s.hp, hR: s.hR })];
  L.bidle = (c) => ({ dur: 1.8, loop: true, k: breathe(stance(c)) });
  L.ready = (c) => { const s = stance(c); const z = { hp: [0, 0, 0], h: [0, 0, 0], sp: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], fL: [0, 0, 0], fR: [0, 0, 0] };
    return { dur: 0.6, k: [K(0, z, { hRm: 'off', hLm: 'off' }), K(0.12, null, { hp: [0, 0.015, 0] }), K(0.2, s, { hp: [s.hp[0], s.hp[1] + 0.01, s.hp[2]] }), K(0.4, s, { hp: [s.hp[0], s.hp[1] - 0.025, s.hp[2]] }), K(0.6, s)] }; };
  function attackClip(c, v) {
    const s = stance(c), f = c.fam;
    let k, dur, hit;
    if (f === 'blade' && v === 1) { // diagonal down-cut: blade cocked over the right shoulder → cuts down-left across the body
      dur = 1.05; hit = 0.27;
      k = [K(0, s),
        K(0.16, null, { hR: [-0.3, 1.5, -0.04], hRd: [-0.25, 0.65, -0.75], h: [4, -40, 0], sp: [0, -12, 0], ch: [-4, -16, 0], hd: [-6, 22, 0], hp: [0, -0.1, -0.07], fR: [-0.05, 0, -0.17], hL: [0.18, 1.32, 0.42] }),
        K(0.27, null, { hR: [0.08, 0.95, 0.52], hRd: [0.6, -0.65, 0.45], h: [10, 24, 0], sp: [6, 14, 0], ch: [12, 18, 0], hd: [0, -18, 0], hp: [0, -0.15, 0.24], fL: [0.05, 0, 0.44], fR: [-0.05, 0, -0.19], hL: [0.42, 1.42, -0.28] }),
        K(0.38, null, { hR: [0.26, 0.8, 0.3], hRd: [0.75, -0.6, -0.15], ch: [14, 24, 0], hp: [0, -0.16, 0.25], hL: [0.45, 1.46, -0.32] }),
        K(0.58, null, { hR: [0.22, 0.84, 0.33], hRd: [0.72, -0.55, -0.05], hp: [0, -0.145, 0.24], ch: [12, 20, 0] }),
        K(0.9, s), K(1.05, s)];
    } else if (f === 'blade') { // rising thrust
      dur = 1.1; hit = 0.29;
      k = [K(0, s),
        K(0.18, null, { hR: [-0.18, 0.86, -0.06], hRd: [0.1, -0.1, 1], h: [4, -32, 0], ch: [6, -12, 0], hd: [-2, 14, 0], hp: [0, -0.14, -0.07], fR: [-0.05, 0, -0.17], hL: [0.28, 1.2, 0.2] }),
        K(0.29, null, { hR: [-0.02, 1.32, 0.7], hRd: [0, 0.35, 1], h: [6, 10, 0], ch: [0, 4, 0], hd: [-4, -6, 0], hp: [0, -0.1, 0.27], fL: [0.05, 0, 0.5], hL: [0.36, 1.52, -0.3] }),
        K(0.4, null, { hR: [0.0, 1.36, 0.74], hp: [0, -0.11, 0.29] }),
        K(0.6, null, { hR: [-0.02, 1.32, 0.68], hp: [0, -0.1, 0.27] }),
        K(0.95, s), K(1.1, s)];
    } else if (f === 'pole' && v === 1) { // lunge thrust
      dur = 1.1; hit = 0.3;
      k = [K(0, s),
        K(0.2, null, { hR: [-0.2, 1.0, -0.3], hRr: [-8, 4, 0], hp: [0, -0.1, -0.08], h: [4, -36, 0], ch: [0, 14, 0] }),
        K(0.3, null, { hR: [-0.05, 1.08, 0.45], hRr: [-4, 0, 0], hp: [0, -0.13, 0.26], fL: [0.06, 0, 0.52], h: [8, -14, 0], ch: [6, 6, 0], hd: [-4, 2, 0] }),
        K(0.42, null, { hR: [-0.04, 1.08, 0.5], hp: [0, -0.135, 0.28] }),
        K(0.62, null, { hR: [-0.05, 1.07, 0.46], hp: [0, -0.13, 0.26] }),
        K(0.95, s), K(1.1, s)];
    } else if (f === 'pole') { // sweeping swing
      dur = 1.15; hit = 0.34;
      k = [K(0, s),
        K(0.2, null, { hR: [-0.3, 1.05, -0.1], hRr: [-6, -70, 0], h: [4, -55, 0], ch: [0, -10, 0], hd: [0, 30, 0], hp: [0, -0.1, 0] }),
        K(0.34, null, { hR: [0.05, 1.0, 0.3], hRr: [-4, 50, 0], h: [6, 20, 0], ch: [4, 14, 0], hd: [0, -10, 0], hp: [0, -0.13, 0.12] }),
        K(0.46, null, { hR: [0.2, 1.0, 0.18], hRr: [-4, 85, 0], h: [6, 28, 0] }),
        K(0.66, null, { hR: [0.18, 1.0, 0.2], hRr: [-4, 78, 0] }),
        K(1.0, s), K(1.15, s)];
    } else if (f === 'fan') { // flick strike (talisman / fan edge)
      dur = 0.95; hit = 0.28;
      k = [K(0, s),
        K(0.18, null, { hR: [-0.38, 1.38, -0.02], hRr: [-60, -80, 0], h: [2, -30, 0], ch: [-2, -6, 0], hp: [0, -0.04, -0.03] }),
        K(0.28, null, { hR: [0.12, 1.22, 0.5], hRr: [-80, 60, 0], h: [4, 20, 0], ch: [2, 16, 0], hp: [0, -0.06, 0.14], fR: [-0.04, 0, 0.0] }),
        K(0.4, null, { hR: [0.28, 1.12, 0.34], hRr: [-70, 85, 0] }),
        K(0.55, null, { hR: [0.26, 1.14, 0.34] }),
        K(0.85, s), K(0.95, s)];
      if (v === 2) { k[1] = K(0.18, null, { hR: [-0.12, 1.75, 0.0], hRr: [-150, 0, 0], ch: [-8, 0, 0], hp: [0, 0.01, -0.03] }); k[2] = K(0.28, null, { hR: [-0.04, 1.0, 0.5], hRr: [-20, 0, 0], ch: [10, 0, 0], hp: [0, -0.08, 0.14] }); k[3] = K(0.4, null, { hR: [-0.03, 0.92, 0.48] }); k[4] = K(0.55, null, { hR: [-0.04, 0.95, 0.46] }); }
    } else if (f === 'flute') { // sharp note: inhale → burst (lean in, nod) → settle
      dur = 0.95; hit = 0.3;
      k = [K(0, s),
        K(0.16, null, { ch: [-8, 4, 0], hd: [-10, -6, 6], hp: [0, 0.0, -0.03], sh: [0, 0, 4] }),
        K(0.3, null, { ch: [8, 4, 0], hd: [10, -6, 6], hp: [0, -0.05, 0.08], sh: [0, 0, -2], fR: [-0.02, 0, 0.0], hR: offH(s.hR, [0, -0.02, 0.06]) }),
        K(0.42, null, { ch: [6, 4, 0], hd: [6, -6, 6] }),
        K(0.8, s), K(0.95, s)];
    } else { // unarmed: right straight punch
      dur = 0.9; hit = 0.3;
      k = [K(0, s),
        K(0.2, null, { hp: [0, -0.07, -0.05], h: [2, 30, 0], ch: [0, 20, 0], uaR: [-30, 40, -30], faR: [-130, 0, 0] }),
        K(0.3, null, { hp: [0, -0.08, 0.16], h: [4, -20, 0], ch: [4, -30, 0], uaR: [-88, 0, 0], faR: [-6, 0, 0], haR: [-10, 0, 0], fL: [0.05, 0, 0.3] }),
        K(0.42, null, { uaR: [-86, -6, 4] }),
        K(0.75, s), K(0.9, s)];
    }
    return { dur, k, meta: { hit } };
  }
  L.attack = (c) => attackClip(c, 1);
  L.attack2 = (c) => attackClip(c, 2);
  L.cast = (c) => { const s = stance(c); const fl = c.fam === 'flute';
    if (fl) return { dur: 1.6, k: [K(0, s), K(0.35, null, { ch: [-6, 8, -4], hd: [-12, -2, 10], hp: [0, 0.01, 0] }), K(0.7, null, { ch: [-2, -4, 4], hd: [-4, -10, 2] }), K(0.95, null, { ch: [-7, 6, -3], hd: [-12, 0, 9], hp: [0, 0.015, 0] }), K(1.35, s), K(1.6, s)], meta: { hit: 0.7 } };
    return { dur: 1.4, k: [K(0, s),
      K(0.3, null, { hp: [0, -0.1, -0.02], ch: [10, 0, 0], hd: [12, 0, 0], uaL: [-50, -30, 10], faL: [-110, 40, 0], haL: [-20, 0, 0], hR: offH(s.hR, [0, -0.04, -0.02]) }),
      K(0.62, null, { hp: [0, -0.06, 0.04], ch: [-10, -10, 0], hd: [-12, -6, 0], uaL: [-150, 0, 30], faL: [-20, 0, 0], haL: [-40, 0, 0], hR: offH(s.hR, [0, 0.0, 0.04]) }),
      K(0.9, null, { hp: [0, -0.06, 0.05], ch: [-8, -10, 0], uaL: [-148, 0, 28] }),
      K(1.25, s), K(1.4, s)], meta: { hit: 0.62 } }; };
  L.skill = (c) => { const s = stance(c), f = c.fam;
    if (f === 'blade') return { dur: 1.7, k: [K(0, s), // gather → spinning release → leaping down-cut
      K(0.3, null, { hp: [0, -0.18, -0.05], hR: [-0.3, 0.9, -0.2], hRd: [-0.9, -0.1, -0.4], h: [8, -60, 0], ch: [10, -20, 0], hd: [6, 40, 0], hL: [0.3, 1.1, 0.35], fLy: 10, fRy: 50 }),
      K(0.5, null, { hp: [0, -0.19, -0.05], hR: [-0.31, 0.89, -0.21] }),
      K(0.62, null, { h: [4, 70, 0], ch: [-2, 30, 0], hd: [-6, -30, 0], hR: [0.1, 1.75, 0.15], hRd: [0.2, 0.9, -0.4], hp: [0, 0.02, 0.22], fL: [0.06, 0.12, 0.35], fR: [-0.05, 0.18, 0.0], fLy: 40, fRy: 50, hL: [0.35, 1.3, -0.3] }),
      K(0.78, null, { h: [10, 16, 0], ch: [14, 10, 0], hd: [2, -8, 0], hR: [0.02, 0.78, 0.62], hRd: [0.1, -0.85, 0.5], hp: [0, -0.17, 0.34], fL: [0.05, 0, 0.5], fR: [-0.05, 0, 0.05], fLy: -8, fRy: 30, hL: [0.4, 1.45, -0.25] }),
      K(0.9, null, { hR: [0.1, 0.68, 0.55], hp: [0, -0.19, 0.35] }),
      K(1.1, null, { hR: [0.08, 0.72, 0.55], hp: [0, -0.17, 0.34] }),
      K(1.5, s), K(1.7, s)], meta: { hit: 0.78 } };
    if (f === 'pole') return { dur: 1.7, k: [K(0, s), // crouch → jump → overhead slam
      K(0.3, null, { hp: [0, -0.2, -0.05], hR: [-0.2, 0.9, -0.2], hRr: [-40, 0, 0], ch: [14, 6, 0], h: [10, -20, 0] }),
      K(0.5, null, { hp: [0, 0.18, 0.1], fL: [0.06, 0.25, 0.2], fR: [-0.05, 0.3, 0.0], hR: [-0.1, 1.65, 0.0], hRr: [-140, 0, 0], ch: [-12, 0, 0], h: [-6, -10, 0], hd: [-10, 0, 0] }),
      K(0.62, null, { hp: [0, 0.22, 0.25], fL: [0.06, 0.3, 0.35], fR: [-0.05, 0.32, 0.1], hR: [-0.1, 1.72, 0.1], hRr: [-150, 0, 0] }),
      K(0.75, null, { hp: [0, -0.15, 0.4], fL: [0.06, 0, 0.5], fR: [-0.05, 0, 0.1], hR: [-0.05, 0.9, 0.55], hRr: [25, 0, 0], ch: [16, 0, 0], h: [12, -10, 0], hd: [6, 0, 0] }),
      K(0.88, null, { hp: [0, -0.18, 0.41], hR: [-0.05, 0.85, 0.56] }),
      K(1.1, null, { hp: [0, -0.16, 0.4] }),
      K(1.5, s), K(1.7, s)], meta: { hit: 0.75 } };
    const a = attackClip(c, 1);
    return { dur: 1.7, k: [K(0, s), K(0.35, null, { hp: [0, -0.14, -0.06], h: [10, 30, 0], ch: [14, 24, 0], hd: [10, 16, 0], ua: [-30, 0, 30], fa: [-90, 0, 0] }), K(0.55, null, { hp: [0, -0.15, -0.07], ch: [16, 26, 0] }),
      K(0.68, null, { hp: [0, 0.0, 0.3], h: [-4, -36, 0], ch: [-10, -30, 0], hd: [-12, -16, 0], uaL: [-40, 0, 70], faL: [-10, 0, 0], fL: [0.05, 0, 0.45] }), K(0.85, null, { hp: [0, -0.1, 0.32], h: [10, 16, 0], ch: [12, -16, 0] }),
      K(1.0, null, { hp: [0, -0.11, 0.32] }), K(1.5, s), K(1.7, s)], meta: { hit: 0.72 } }; };
  L.hurt = (c) => { const s = stance(c); return { dur: 0.75, k: [K(0, s),
    K(0.07, null, { hp: [0, -0.05, -0.12], h: [-10, 0, 6], ch: [-16, 0, 6], hd: [-18, 6, 8], uaL: [-20, 0, 34], faL: [-30, 0, 0], fL: [0.05, 0, 0.02], hR: offH(s.hR, [0, 0.04, -0.14]) }),
    K(0.2, null, { hp: [0, -0.1, -0.14], h: [8, 0, 2], ch: [14, 0, 0], hd: [12, 0, 0], uaL: [-26, 0, 14], faL: [-50, 0, 0], hR: offH(s.hR, [0, -0.06, -0.12]) }),
    K(0.55, s, { hp: [s.hp[0], s.hp[1] - 0.02, s.hp[2] - 0.03] }), K(0.75, s)] }; };
  L.guard = (c) => { const s = stance(c), f = c.fam;
    let g = { hp: [0, -0.11, -0.03], h: [8, 10, 0], ch: [12, -6, 0], hd: [10, 0, 0], uaR: [-70, -30, -20], faR: [-90, -10, 0], haR: [0, 0, 60], uaL: [-70, 30, 20], faL: [-110, 10, 0], hRm: 'off', hLm: 'off' };
    if (f === 'blade') g = Object.assign({}, g, { hRm: 'on', hR: [-0.12, 1.4, 0.32], hRd: [1, 0.12, 0.05], hLm: 'on', hL: [0.16, 1.36, 0.3] });
    if (f === 'pole') g = Object.assign({}, g, { hRm: 'on', hLm: 'on', hR: [-0.28, 1.2, 0.28], hRr: [-6, 90, 0], hL: 0.55 });
    if (f === 'fan') g = Object.assign({}, g, { hRm: 'on', hR: [-0.02, 1.45, 0.3], hRr: [-90, 0, 0] });
    return { dur: 1.6, loop: true, k: [K(0, s, g), K(0.8, null, { ch: [g.ch[0] + 1.5, g.ch[1], 0], hp: [0, -0.118, -0.03] }), K(1.6, null, { ch: g.ch, hp: g.hp })] }; };
  L.ko = (c) => ({ dur: 1.3, pl: false, k: [
    { t: 0, hp: [0, -0.05, 0], h: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], snL: [0, 0, 0], snR: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0] },
    { t: 0.15, hp: [0, -0.12, -0.08], h: [-8, 0, 0], ch: [-18, 0, 4], hd: [-24, 0, 0], ua: [-30, 0, 40], fa: [-20, 0, 0] },
    { t: 0.45, hp: [0, -0.45, -0.05], h: [24, 0, 0], ch: [20, 0, 0], hd: [16, 0, 0], thL: [-70, 0, 6], thR: [-60, 0, -6], snL: [120, 0, 0], snR: [110, 0, 0], ua: [-10, 0, 10], fa: [-20, 0, 0] },
    { t: 0.75, hp: [0, -0.64, 0.12], h: [70, 0, -10], ch: [14, 0, 0], hd: [10, 20, 0], thL: [-40, 0, 10], thR: [-30, 0, -6], snL: [60, 0, 0], snR: [40, 0, 0], ua: [-60, 0, 30], fa: [-10, 0, 0] },
    { t: 0.86, hp: [0, -0.82, 0.32], h: [88, 0, -6], ch: [4, 0, 0], hd: [4, 30, 8] },
    { t: 0.95, hp: [0, -0.8, 0.34] },
    { t: 1.3, hp: [0, -0.82, 0.34], h: [88, 0, -6], ch: [2, 0, 0], hd: [2, 34, 10], thL: [-20, 0, 8], thR: [-10, 0, -4], snL: [30, 0, 0], snR: [14, 0, 0], ftL: [40, 0, 0], ftR: [40, 0, 0], ua: [-80, 0, 20], fa: [-6, 0, 0] },
  ] });
  L.revive = (c) => { const s = stance(c); return { dur: 1.5, pl: false, k: [
    { t: 0, hp: [0, -0.82, 0.34], h: [88, 0, -6], ch: [2, 0, 0], hd: [2, 34, 10], thL: [-20, 0, 8], thR: [-10, 0, -4], snL: [30, 0, 0], snR: [14, 0, 0], ftL: [40, 0, 0], ftR: [40, 0, 0], ua: [-80, 0, 20], fa: [-6, 0, 0] },
    { t: 0.5, hp: [0, -0.55, 0.06], h: [30, 0, 0], ch: [20, 0, 0], hd: [10, 0, 0], thL: [-90, 0, 6], thR: [-60, 0, -6], snL: [130, 0, 0], snR: [100, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], ua: [-30, 0, 20], fa: [-40, 0, 0] },
    { t: 0.95, hp: [0, -0.16, 0], h: [10, 0, 0], ch: [6, 0, 0], hd: [-6, 0, 0], thL: [-30, 0, 2], thR: [-30, 0, -2], snL: [40, 0, 0], snR: [40, 0, 0], ua: [-10, 0, 14], fa: [-20, 0, 0] },
    { t: 1.25, hp: [0, -0.06, 0], h: [s.h[0], s.h[1], 0], thL: [0, 0, 0], thR: [0, 0, 0], snL: [0, 0, 0], snR: [0, 0, 0] },
    { t: 1.5, hp: s.hp, h: s.h },
  ] }; };
  L.victory = (c) => { const s = stance(c), f = c.fam;
    let up = { uaR: [-150, 20, -30], faR: [-60, -30, 0], hRm: 'off', hLm: 'off' };
    if (f === 'blade') up = { hRm: 'on', hR: [-0.18, 1.94, 0.08], hRd: [-0.05, 1, 0.1], hLm: 'on', hL: [0.22, 1.05, 0.12] };
    if (f === 'pole') up = { hRm: 'on', hR: [-0.26, 1.05, 0.12], hRr: [-86, 0, 0], hLm: 'off', uaL: [-10, 0, 20], faL: [-80, 30, 0] };
    if (f === 'fan') up = { hRm: 'on', hR: [-0.1, 1.35, 0.25], hRr: [-80, 20, 0] };
    if (f === 'flute') up = { hRm: 'on', hR: [-0.18, 1.0, 0.18], hRr: [-80, 10, 0], hLm: 'off', uaL: [-20, -20, 10], faL: [-80, 40, 0] };
    return { dur: 1.8, k: [K(0, s),
      K(0.25, null, { hp: [0, -0.1, 0], ch: [10, 0, 0], hd: [12, 0, 0] }),
      K(0.5, null, Object.assign({ hp: [0, 0.03, 0], fL: [0.05, 0, 0.05], fR: [-0.05, 0, -0.05], h: [-4, -10, 0], sp: [0, 0, 0], ch: [-8, 10, 0], hd: [-10, 10, 0], uaL: [-10, 0, 20], faL: [-80, 30, 0] }, up)),
      K(0.65, null, { hp: [0, 0.0, 0] }), K(1.8, null, { hp: [0, 0.0, 0], ch: [-6, 10, 0] })] }; };
  L.victory_loop = (c) => { const v = L.victory(c); const last = v.k.reduce((a, k) => Object.assign(a, k), {}); return { dur: 2, loop: true, k: [Object.assign({}, last, { t: 0 }), { t: 1, ch: [-7.5, 10, 0] }, Object.assign({}, last, { t: 2 })] }; };
  L.item = (c) => { const s = stance(c); return { dur: 1.2, k: [K(0, s, { hLm: s.hLm ? 'on' : 'off' }),
    K(0.12, null, { hLm: 'off' }),
    K(0.25, null, { hp: [0, -0.04, 0], ch: [10, 0, 0], hd: [16, 0, 0], uaL: [-40, -20, 10], faL: [-120, 30, 0] }),
    K(0.55, null, { ch: [-6, 0, 0], hd: [-10, 0, 0], uaL: [-130, -10, 20], faL: [-30, 0, 0], haL: [-30, 0, 0] }),
    K(0.75, null, { uaL: [-128, -10, 18] }),
    K(1.05, s, { hLm: 'off' }), K(1.12, null, { hLm: s.hLm || 'off' }), K(1.2, s)], meta: { hit: 0.55 } }; };
  L.dodge = (c) => { const s = stance(c); const back = [0, 0.02, -0.4]; return { dur: 0.7, k: [K(0, s),
    K(0.06, null, { hp: [0, -0.1, 0.02] }),
    K(0.18, null, { hp: [0, -0.03, -0.42], h: [-8, s.h[1], 0], ch: [-10, s.ch[1], 0], fL: [0.05, 0.08, -0.15], fR: [-0.04, 0.12, -0.42], hR: offH(s.hR, back), uaL: [-20, 0, 30] }),
    K(0.32, null, { hp: [0, -0.12, -0.38], h: [10, s.h[1], 0], ch: [8, s.ch[1], 0], fL: [0.05, 0, -0.18], fR: [-0.04, 0, -0.46], hR: offH(s.hR, [0, -0.06, -0.38]) }),
    K(0.7, s)] }; };
  // battle run: locomotion carrying the drawn weapon (blade low at the side, pole trailing)

  // emote reactions (short, additive-feeling one-shots on top of locomotion idle)
  L.e_hop = (c) => ({ dur: 0.6, pl: false, k: [{ t: 0, hp: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], snL: [0, 0, 0], snR: [0, 0, 0], ua: [0, 0, 0] }, { t: 0.1, hp: [0, -0.05, 0], thL: [-14, 0, 0], thR: [-14, 0, 0], snL: [28, 0, 0], snR: [28, 0, 0] }, { t: 0.22, hp: [0, 0.08, 0], thL: [-4, 0, 0], thR: [-4, 0, 0], snL: [8, 0, 0], snR: [8, 0, 0], ua: [-20, 0, 30], ftL: [20, 0, 0], ftR: [20, 0, 0] }, { t: 0.36, hp: [0, -0.03, 0], thL: [-10, 0, 0], thR: [-10, 0, 0], snL: [20, 0, 0], snR: [20, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] }, { t: 0.6, hp: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], snL: [0, 0, 0], snR: [0, 0, 0], ua: [0, 0, 0] }] });
  L.e_tilt = (c) => ({ dur: 1.4, k: applyHold([{ t: 0, hd: [0, 0, 0], ch: [0, 0, 0] }, { t: 0.3, hd: [4, 6, 18], ch: [0, 0, 4] }, { t: 1.0, hd: [4, 6, 17] }, { t: 1.4, hd: [0, 0, 0], ch: [0, 0, 0] }], holdArmKeys(c.hold)) });
  L.e_sigh = (c) => ({ dur: 1.6, k: applyHold([{ t: 0, ch: [0, 0, 0], hd: [0, 0, 0], sh: [0, 0, 0] }, { t: 0.4, ch: [-4, 0, 0], sh: [0, 0, 5], hd: [-4, 0, 0] }, { t: 0.9, ch: [10, 0, 0], sh: [0, 0, -6], hd: [14, 0, 0] }, { t: 1.6, ch: [0, 0, 0], sh: [0, 0, 0], hd: [0, 0, 0] }], holdArmKeys(c.hold)) });
  L.e_stomp = (c) => ({ dur: 0.9, k: [{ t: 0, ua: [0, 0, 0], fa: [0, 0, 0], fR: [0, 0, 0], hp: [0, 0, 0] }, { t: 0.2, ua: [-20, 0, 20], fa: [-110, 0, 0], fR: [0, 0.1, 0.02], hp: [0, 0.01, 0] }, { t: 0.32, fR: [0, 0, 0.02], hp: [0, -0.03, 0], ch: [8, 0, 0] }, { t: 0.9, ua: [0, 0, 0], fa: [0, 0, 0], fR: [0, 0, 0], hp: [0, 0, 0], ch: [0, 0, 0] }] });
  L.e_sway = (c) => ({ dur: 1.6, k: applyHold([{ t: 0, h: [0, 0, 0], hd: [0, 0, 0], hp: [0, 0, 0] }, { t: 0.4, h: [0, 0, 5], hd: [0, 0, -8], hp: [0.02, 0, 0] }, { t: 0.8, h: [0, 0, -5], hd: [0, 0, 8], hp: [-0.02, 0, 0] }, { t: 1.2, h: [0, 0, 4], hd: [0, 0, -6], hp: [0.015, 0, 0] }, { t: 1.6, h: [0, 0, 0], hd: [0, 0, 0], hp: [0, 0, 0] }], holdArmKeys(c.hold)) });
  L.e_shy = (c) => ({ dur: 1.6, k: [{ t: 0, hd: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0], h: [0, 0, 0] }, { t: 0.35, hd: [14, -10, 6], ua: [-16, -24, 0], fa: [-70, 40, 0], h: [0, 8, 0] }, { t: 1.2, hd: [15, -12, 7] }, { t: 1.6, hd: [0, 0, 0], ua: [0, 0, 0], fa: [0, 0, 0], h: [0, 0, 0] }] });
  L.e_fist = (c) => ({ dur: 1.1, k: [{ t: 0, uaR: [0, 0, 0], faR: [0, 0, 0], ch: [0, 0, 0] }, { t: 0.15, uaR: [-20, 0, -10], faR: [-60, 0, 0], ch: [4, 0, 0] }, { t: 0.3, uaR: [-60, -20, -10], faR: [-120, 0, 0], ch: [-6, -8, 0], hd: [-6, 0, 0] }, { t: 0.75, uaR: [-58, -20, -10] }, { t: 1.1, uaR: [0, 0, 0], faR: [0, 0, 0], ch: [0, 0, 0], hd: [0, 0, 0] }] });

  // ------------------------------------------------------------------------------------------ clip set per (body, family, hold, style)
  const clipCache = new Map();
  C.clipSet = function (B, ctx) {
    const key = JSON.stringify(B.bones.slice(0, 40).map((b) => b.pos.map((v) => round(v * 1000)))) + '|' + ctx.fam + '|' + ctx.hold + '|' + (ctx.styleKey || '');
    if (clipCache.has(key)) return clipCache.get(key);
    const coreDefs = B.bones.filter((b, i) => i < B.coreCount);
    const rig = makeRig(coreDefs);
    const rest = restPose(B.P, ctx.style || {});
    const set = {};
    const P = B.P;
    const c = Object.assign({ P, fem: P.fem, kid: P.kid }, ctx);
    for (const g in GAITS) set[g] = bake(g, rig, P, gaitSampler(P, GAITS[g], c), 1, { loop: true, rest });
    set.brun = bake('brun', rig, P, gaitSampler(P, GAITS.run, Object.assign({}, c, { hold: c.fam === 'pole' ? 'pole' : c.fam === 'blade' ? 'blade' : c.hold })), 1, { loop: true, rest });
    for (const n in L) {
      let def;
      try { def = L[n](c); } catch (e) { console.warn('clip', n, e); continue; }
      if (!def) continue;
      const smp = def.fn || keysClip(def);
      set[n] = bake(n, rig, P, smp, def.dur, { loop: !!def.loop, rest, meta: def.meta });
    }
    for (const n in ctx.extraClips || {}) {
      const def = ctx.extraClips[n](c); set[n] = bake(n, rig, P, def.fn || keysClip(def), def.dur, { loop: !!def.loop, rest, meta: def.meta });
    }
    clipCache.set(key, set);
    return set;
  };
})();

// ==================================================================================================== TEMPLATES · INSTANCES · API
(() => {
  const C = G.Char3D, I = C._internal;
  const { sstep, lerp, clamp, rng, shade, mixc, lum } = I;
  const PI = Math.PI, TAU = PI * 2, D = PI / 180;
  const { sin, cos, abs, min, max, floor, round, pow, sqrt, atan2, hypot, exp, random } = Math;
  const warn = (k, e) => (G.warnOnce ? G.warnOnce(k, e) : console.warn(k, e));

  // ------------------------------------------------------------------------------------------ looks (data specs)
  // C.looks[id] = { name: look } ; a look = { spec overrides (deep-merged onto the G.Sprites spec), face3d, body3d,
  //   props3d, style:{rest, idle}, parts:[fn(B)], hero:true }. chars_cast.js registers looks; setLook swaps costumes.
  C.looks = {}; C.activeLook = {};
  C.defineLook = function (id, name, look) { (C.looks[id] = C.looks[id] || {})[name] = look; if (!C.activeLook[id]) C.activeLook[id] = name; C.invalidate(id); };
  C.setLook = function (id, name) { C.activeLook[id] = name; C.invalidate(id); };
  C.lookOf = (id, ctx) => {
    const L = C.looks[id]; if (!L) return null;
    const base = L[C.activeLook[id]] || null;
    // a look may name per-context variants: { contextLooks: { battle: 'guide' } } (e.g. 陳伯's hidden 引魂人 gear)
    if (ctx && base && base.contextLooks && base.contextLooks[ctx] && L[base.contextLooks[ctx]]) return L[base.contextLooks[ctx]];
    return base;
  };
  C.lookName = (id, ctx) => { const L = C.looks[id]; if (!L) return ''; const base = L[C.activeLook[id]]; if (ctx && base && base.contextLooks && base.contextLooks[ctx]) return base.contextLooks[ctx]; return C.activeLook[id] || ''; };

  function specFor(id, ctx) {
    if (!G.Sprites || !G.Sprites.has(id)) return null;
    const raw = G.Sprites.spec(id);
    let look = C.lookOf(id, ctx);
    // a variant look can extend another look of the same id: { extend: 'day', spec: {...} }
    if (look && look.extend && C.looks[id][look.extend]) { const b = C.looks[id][look.extend]; look = Object.assign({}, b, look, { spec: C.merge(C.merge({}, b.spec || {}), look.spec || {}), parts: (b.parts || []).concat(look.parts || []), face3d: Object.assign({}, b.face3d || {}, look.face3d || {}) }); }
    let s = I.normalize(raw);
    if (look) {
      if (look.replace) s = I.normalize(look.spec || {}); // full replacement spec (costume data)
      else if (look.spec) s = I.normalize(C.merge(C.merge({}, raw), look.spec));
      for (const k of ['face3d', 'body3d', 'props3d', 'style']) if (look[k]) s[k] = look[k];
    }
    return { s, look };
  }

  // ------------------------------------------------------------------------------------------ template build
  const templates = new Map();
  C.invalidate = function (id) { for (const k of Array.from(templates.keys())) if (k.split('#')[0] === id) templates.delete(k); };
  function buildTemplate(id, ctx) {
    const THREE = window.THREE;
    const sp = specFor(id, ctx);
    if (!sp) return null;
    const { s: S, look } = sp;
    const hero = !!(look && look.hero) || (C.HEROES || []).includes(id);
    const B = new C.Builder(id, S, { hero, atlas: look && look.atlas });
    B.look = look;
    B.F = C.faceParams(B);
    C.rig(B);
    B.coreCount = B.bones.length;
    C.buildHead(B);
    C.buildGarments(B);
    C.buildHair(B);
    C.buildHat(B);
    C.buildFaceExtras(B);
    C.buildProps(B);
    if (look && look.parts) for (const fn of look.parts) { try { fn(B, C); } catch (e) { warn('cast part ' + id, e); } }
    // atlas
    const rects = B.atlas.pack();
    B.atlas.paint();
    const map = G.R3M.canvasTex(B.atlas.canvas); map.shared = true;
    let emap = null;
    if (B.atlas.ecanvas) { emap = G.R3M.canvasTex(B.atlas.ecanvas); emap.shared = true; }
    const geo = B.G.build(rects, B.atlas.S);
    const hgeo = B.HG.build(null, 1);
    let ogeo = null;
    try { ogeo = THREE.BufferGeometryUtils.mergeGeometries([geo, hgeo], false); } catch (e) { ogeo = geo; }
    // skeleton data
    const defs = B.bones.map((b) => ({ name: b.name, parent: b.parent, pos: b.pos }));
    const inverses = defs.map((d) => new THREE.Matrix4().makeTranslation(-d.pos[0], -d.pos[1], -d.pos[2]));
    // clips
    const fam = C.weaponFamily(B.flags.weapon);
    const hold = C.holdClass(S.held);
    const style = (look && look.style) || S.style || {};
    const clips = C.clipSet(B, { fam, hold, style, styleKey: look ? id + ':' + C.lookName(id, ctx) : '', extraClips: look && look.clips });
    // outline material (shared per template)
    const tmp = new THREE.SkinnedMesh(ogeo, new THREE.MeshBasicMaterial());
    const outlineCol = new THREE.Color(S.outline || mixc(S.hair.color || '#2a2026', '#1a1218', 0.6));
    const omesh = G.R3M.outline(tmp, { width: 0.0011 * (look && look.outlineK || 1), color: outlineCol });
    const T = {
      id, S, P: B.P, F: B.F, B, geo, hgeo, ogeo, map, emap, defs, inverses, clips, fam, hold,
      chains: B.chains, colliders: B.colliders, lights: B.lights, flags: B.flags, hero,
      outlineMat: omesh.material, faceSize: hero ? 512 : 256,
      height: (B.P.crown + (S.hat ? 0.06 : 0)) * (S.size || 1),
      tris: (geo.index.count + hgeo.index.count) / 3,
    };
    tmp.geometry = new THREE.BufferGeometry(); // detach
    return T;
  }
  function template(id, ctx) {
    const key = id + '#' + C.lookName(id, ctx);
    if (templates.has(key)) return templates.get(key);
    let T = null;
    try { T = buildTemplate(id, ctx); } catch (e) { warn('char3d build ' + id, e); T = null; }
    templates.set(key, T);
    return T;
  }
  C.template = template;

  // ------------------------------------------------------------------------------------------ springs
  const AIR = { hair: 0.3, ribbon: 0.42, cloth: 0.1, sleeve: 0.12, feather: 0.3, flag: 0.45, tassel: 0.35, prop: 0.05 };
  class Springs {
    constructor(inst) {
      const THREE = window.THREE;
      this.inst = inst;
      const T = inst.T;
      this.joints = []; this.chains = [];
      for (const ch of T.chains) {
        const js = [];
        for (let j = 0; j < ch.bones.length; j++) {
          const bi = ch.bones[j];
          const bone = inst.bones[bi];
          const next = j + 1 < ch.bones.length ? T.defs[ch.bones[j + 1]].pos : ch.tail;
          const off = new THREE.Vector3(next[0] - T.defs[bi].pos[0], next[1] - T.defs[bi].pos[1], next[2] - T.defs[bi].pos[2]);
          const len = off.length() || 0.01;
          js.push({ bone, axis: off.clone().normalize(), len, off, tail: new THREE.Vector3(), prev: new THREE.Vector3() });
        }
        // socket: chains under a prop bone are skipped while that prop is hidden
        let sock = null;
        let p = T.defs[ch.bones[0]].parent;
        while (p >= 0) { const n = T.defs[p].name; if (/^(held|weap|backWeap)/.test(n)) { sock = inst.bones[p]; break; } p = T.defs[p].parent; }
        const groups = new Set(ch.groups || []);
        this.chains.push({ cfg: ch, js, sock, cols: [], groups });
      }
      this.cols = T.colliders.map((c) => ({ bone: inst.bones[c.bone], off: new THREE.Vector3().fromArray(c.off), off2: c.off2 ? new THREE.Vector3().fromArray(c.off2) : null, r: c.r, group: c.group, a: new THREE.Vector3(), b: new THREE.Vector3() }));
      for (const c of this.chains) c.cols = this.cols.filter((k) => c.groups.has(k.group));
      this.init = false;
      this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      this._q = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
      this._m = new THREE.Matrix4();
      this.lastRoot = new THREE.Vector3();
      this.wind = new THREE.Vector3();
    }
    reset() { this.init = false; }
    shift(d) { for (const ch of this.chains) for (const J of ch.js) { J.tail.add(d); J.prev.add(d); } this.lastRoot.add(d); }
    worldQuatOf(m, out) { // rotation of a (uniformly scaled) world matrix
      const e = m.elements;
      const sx = hypot(e[0], e[1], e[2]) || 1;
      this._m.set(e[0] / sx, e[4] / sx, e[8] / sx, 0, e[1] / sx, e[5] / sx, e[9] / sx, 0, e[2] / sx, e[6] / sx, e[10] / sx, 0, 0, 0, 0, 1);
      return out.setFromRotationMatrix(this._m);
    }
    update(dt, scale, lod) {
      const [vA, vB, vC, vD, vE] = this._v;
      const [qP, qD, qW] = this._q;
      const root = this.inst.root;
      root.getWorldPosition(vA);
      if (this.init && vA.distanceTo(this.lastRoot) > 1.5) this.init = false;
      // root displacement this frame: springs damp motion RELATIVE to the character (hair follows the body),
      // with only a small 'air drag' fraction of the body velocity lost (so it trails a little when running)
      const dRoot = this._dr || (this._dr = vA.clone().set(0, 0, 0));
      if (this.init) dRoot.copy(vA).sub(this.lastRoot).divideScalar(dt > 1 / 45 ? 2 : 1); else dRoot.set(0, 0, 0);
      this.lastRoot.copy(vA);
      // colliders in world space
      for (const c of this.cols) {
        c.a.copy(c.off).applyMatrix4(c.bone.matrixWorld);
        if (c.off2) c.b.copy(c.off).add(c.off2).applyMatrix4(c.bone.matrixWorld);
        c.rr = c.r * scale;
      }
      const steps = dt > 1 / 45 ? 2 : 1;
      const h = min(dt, 1 / 20) / steps;
      for (const ch of this.chains) {
        if (ch.sock && ch.sock.scale.x < 0.01) continue;
        const cfg = ch.cfg;
        const dragK = 1 - pow(1 - cfg.drag, h * 60);
        for (const J of ch.js) {
          const b = J.bone;
          b.quaternion.set(0, 0, 0, 1);
          b.updateMatrix();
          b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix);
          const head = vB.setFromMatrixPosition(b.matrixWorld);
          this.worldQuatOf(b.parent.matrixWorld, qP);
          const restDir = vC.copy(J.axis).applyQuaternion(qP);
          const L = J.len * scale;
          if (!this.init) { J.tail.copy(head).addScaledVector(restDir, L); J.prev.copy(J.tail); }
          for (let s = 0; s < steps; s++) {
            const air = cfg.air != null ? cfg.air : AIR[cfg.kind] || 0.1;
            const nx = vD.copy(J.tail).sub(J.prev).sub(dRoot).multiplyScalar(1 - dragK).addScaledVector(dRoot, 1 - air).add(J.tail);
            nx.addScaledVector(restDir, cfg.stiff * h * (lod ? 1.3 : 1));
            nx.y -= cfg.grav * h;
            if (this.wind.lengthSq() > 0 && cfg.kind !== 'prop') nx.addScaledVector(this.wind, h * (cfg.kind === 'cloth' ? 0.4 : 1));
            // keep length
            vE.copy(nx).sub(head); const l = vE.length() || 1e-6; nx.copy(head).addScaledVector(vE, L / l);
            // collisions (sphere & capsule)
            if (!lod) for (const c of ch.cols) {
              let cp = c.a;
              if (c.off2) { // closest point on segment a→b
                vE.copy(c.b).sub(c.a); const ll = vE.lengthSq() || 1e-6;
                const t = clamp(vA.copy(nx).sub(c.a).dot(vE) / ll, 0, 1);
                cp = vA.copy(c.a).addScaledVector(vE, t);
              }
              const rr = c.rr + cfg.r * scale;
              const dx = nx.x - cp.x, dy = nx.y - cp.y, dz = nx.z - cp.z, d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < rr * rr && d2 > 1e-10) {
                const d = sqrt(d2), k = rr / d;
                nx.set(cp.x + dx * k, cp.y + dy * k, cp.z + dz * k);
                vE.copy(nx).sub(head); const l2 = vE.length() || 1e-6; nx.copy(head).addScaledVector(vE, L / l2);
              }
            }
            J.prev.copy(J.tail); J.tail.copy(nx);
          }
          // orient the bone toward the simulated tail
          const to = vE.copy(J.tail).sub(head).normalize();
          qD.setFromUnitVectors(restDir.normalize(), to);
          qW.copy(qP).premultiply(qD);           // world rotation
          b.quaternion.copy(qP.invert()).multiply(qW);
          b.updateMatrix();
          b.matrixWorld.multiplyMatrices(b.parent.matrixWorld, b.matrix);
        }
      }
      this.init = true;
    }
  }

  // ------------------------------------------------------------------------------------------ expressions
  const EXPR = {
    neutral: {},
    smile: { squint: 0.4, browY: 0.5, curve: 0.85, mOpen: 0.0, browAng: 0.08 },
    laugh: { happy: 1, browY: 0.7, curve: 1, mOpen: 0.85, mouthW: 1.2, blush: 0.4 },
    sad: { browAng: 0.75, browY: 0.1, droop: 0.28, curve: -0.6, lookY: -0.4 },
    angry: { browAng: -1.0, browY: -0.5, droop: 0.15, squint: 0.3, curve: -0.6, mOpen: 0.25, mouthW: 0.95 },
    surprised: { browY: 1.6, open: 1.15, irisK: 0.78, pupil: 0.75, curve: 0, mOpen: 0.75, round: 1, browArch: 0.5 },
    shy: { blush: 1, droop: 0.22, browAng: 0.4, curve: 0.35, lookX: -0.45, lookY: -0.45, mouthW: 0.7 },
    pain: { happy: 0, open: 0.32, squint: 0.7, browAng: 0.8, browY: -0.3, curve: -0.6, mOpen: 0.35, mouthW: 1.1 },
    closed: { open: 0, curve: 0.1 },
    determined: { browAng: -0.55, browY: -0.15, droop: 0.1, curve: -0.12, mouthW: 0.9 },
    dreamy: { droop: 0.2, curve: 0.38, lookX: 0.35, lookY: 0.45, browAng: 0.15 },
    smug: { droop: 0.3, curve: 0.55, browAng: -0.15, unHappy: 1 },
    grumpy: { browAng: -0.5, browY: -0.25, droop: 0.2, curve: -0.5 },
    cold: { droop: 0.35, browAng: -0.2, curve: -0.1, irisK: 0.9 },
  };
  C.EXPR = EXPR;
  const MOUTHS = [{ mOpen: 0 }, { mOpen: 0.75, mouthW: 1.0 }, { mOpen: 0.28, mouthW: 1.12 }, { mOpen: 0.4, mouthW: 0.6, round: 1 }, { mOpen: 0.45, mouthW: 1.05 }, { mOpen: 0.6, mouthW: 0.72, round: 1 }];

  // ------------------------------------------------------------------------------------------ instance
  const PLAYALIAS = { idle: '_idle', run: '_run', attack3: 'attack', magic: 'cast', defend: 'guard', die: 'ko', dead: 'ko', win: 'victory', walk: '_walk', hit: 'hurt', damage: 'hurt', evade: 'dodge', sad: 'cry', happy: 'laugh', stand: '_idle' };
  const SEQ = { sit: 'sit_loop', kneel: 'kneel_loop', sleep: 'sleep_loop', victory: 'victory_loop' };
  const HOLDS = { ko: 1, fall: 1 };
  const FIDGETS = ['f_look', 'f_shift', 'f_stretch', 'f_scratch', 'f_look', 'f_shift'];
  class Char3DInst {
    constructor(T, opts = {}) {
      const THREE = window.THREE;
      this.T = T; this.id = T.id; this.context = opts.context || 'map';
      this.root = new THREE.Group(); this.root.name = 'char:' + T.id;
      this.model = new THREE.Group();
      const size = T.S.size || 1;
      this.size = size;
      this.model.scale.setScalar(size);
      this.root.add(this.model);
      // skeleton
      this.bones = T.defs.map((d) => { const b = new THREE.Bone(); b.name = d.name; return b; });
      T.defs.forEach((d, i) => {
        const b = this.bones[i];
        const par = d.parent >= 0 ? T.defs[d.parent] : null;
        b.position.set(d.pos[0] - (par ? par.pos[0] : 0), d.pos[1] - (par ? par.pos[1] : 0), d.pos[2] - (par ? par.pos[2] : 0));
        if (d.parent >= 0) this.bones[d.parent].add(b);
      });
      this.bmap = {}; this.bones.forEach((b) => (this.bmap[b.name] = b));
      this.model.add(this.bones[0]);
      this.skeleton = new THREE.Skeleton(this.bones, T.inverses);
      const I4 = new THREE.Matrix4();
      // materials (per instance: opacity / ghost / glow are per-character state; programs are shared)
      const S = T.S;
      const glow = S.glow;
      this.bodyMat = C.charMat({ map: T.map, emissiveMap: T.emap, vertexColors: true, rim: glow ? 0.55 : 0.3, rimColor: glow || 0xfff0e0, shadowTint: 0xb4a6d8 });
      this.face = new C.FacePainter({ F: Object.assign({}, T.F), P: T.P }, T.faceSize);
      this.faceMat = C.charMat({ map: this.face.tex, rim: glow ? 0.5 : 0.25, rimColor: glow || 0xfff0e0, shadowTint: 0xd8a8b0, side: THREE.FrontSide });
      this.body = new THREE.SkinnedMesh(T.geo, this.bodyMat); this.body.name = 'charBody';
      this.head = new THREE.SkinnedMesh(T.hgeo, this.faceMat); this.head.name = 'charHead';
      this.outline = new THREE.SkinnedMesh(T.ogeo, T.outlineMat); this.outline.name = 'charOutline';
      this.outline.userData.outline = true; this.outline.renderOrder = -1; this.outline.castShadow = false; this.outline.receiveShadow = false;
      const H = T.P.crown;
      const sph = new THREE.Sphere(new THREE.Vector3(0, H * 0.5, 0), H * 0.95);
      const box = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, H + 0.1, 0.5));
      for (const m of [this.body, this.head, this.outline]) {
        m.bind(this.skeleton, I4);
        m.boundingSphere = sph.clone(); m.boundingBox = box.clone();
        m.frustumCulled = true;
        this.model.add(m);
      }
      this.body.castShadow = true; this.head.castShadow = true; this.body.receiveShadow = true; this.head.receiveShadow = false;
      if (glow) { this.bodyMat.userData.u.uGlow.value.set(glow).multiplyScalar(0.04); this.faceMat.userData.u.uGlow.value.set(glow).multiplyScalar(0.03); }
      // animation
      this.mixer = new THREE.AnimationMixer(this.model);
      this.actions = {};
      this.loco = {};
      const baseIdle = this.context === 'battle' ? 'bidle' : 'idle';
      for (const n of [baseIdle, 'walk', 'jog', 'run']) {
        const a = this.action(n);
        if (!a) continue;
        a.setLoop(THREE.LoopRepeat); a.play(); a.setEffectiveWeight(n === baseIdle ? 1 : 0);
        if (n !== baseIdle) a.timeScale = 0;
        this.loco[n === baseIdle ? 'idle' : n] = a;
      }
      this.overlays = [];
      this.speed = 0; this.targetSpeed = 0; this.phase = 0;
      this.yaw = 0; this.yawPrev = 0; this.yawRate = 0; this.lean = 0; this.leanF = 0; this.prevSpeed = 0;
      this.t = random() * 10; this.fidgetT = 5 + random() * 8;
      this.lookTarget = null; this.lookW = 0; this.lookYaw = 0; this.lookPitch = 0; this._lv = new THREE.Vector3();
      this.eye = { x: 0, y: 0, tx: 0, ty: 0, next: 0.5 };
      this.blink = { t: 0, next: 1 + random() * 3, dur: 0, dbl: false };
      this.expr = (T.B.look && T.B.look.expr) || (S.face3d && S.face3d.expr) || 'neutral';
      this.baseExpr = this.expr; this.exprT = 0;
      this.talking = false; this.mouth = { i: 0, t: 0 };
      this.springs = new Springs(this);
      this.opacity = 1; this.ghost = !!S.ghost;
      this.height = T.height;
      this.weaponDrawn = this.context === 'battle';
      this.applyProps();
      if (this.ghost) this.setOpacity(1, true);
      this._lights = T.lights.map((l) => ({ l, bone: this.bones[typeof l.bone === 'number' ? l.bone : T.defs.findIndex((d) => d.name === l.bone)], off: null, out: { x: 0, y: 0, z: 0, color: l.color, i: l.i, r: l.r, flicker: l.flicker } }));
      for (const L2 of this._lights) { const d = T.defs[this.bones.indexOf(L2.bone)]; L2.off = new THREE.Vector3(L2.l.pos[0] - d.pos[0], L2.l.pos[1] - d.pos[1], L2.l.pos[2] - d.pos[2]); L2.sock = L2.l.socket ? this.bmap[L2.l.socket] : null; }
      this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v3 = new THREE.Vector3();
      this.update(0, 0, null);
    }
    action(name) {
      if (this.actions[name]) return this.actions[name];
      const clip = this.T.clips[name];
      if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      this.actions[name] = a;
      return a;
    }
    // ---- props per context
    applyProps() {
      const T = this.T, F = T.flags, b = this.bmap;
      const battle = this.weaponDrawn;
      const distinct = F.weapon && !F.weaponSame && F.weapon !== F.held;
      const show = (n, on) => { if (b[n]) b[n].scale.setScalar(on ? 1 : 0.0001); };
      show('heldR', !(battle && distinct));
      show('weapR', battle && distinct);
      show('heldL', true);
      const backIsWeapon = T.S.back && T.S.back === T.S.weapon;
      show('backWeap', !(battle && backIsWeapon));
    }
    setWeaponDrawn(on) { this.weaponDrawn = !!on; this.applyProps(); }
    // move the character without disturbing its secondary motion (spring state is carried along)
    shift(dx, dy, dz) { const d = new window.THREE.Vector3(dx, dy, dz); this.root.position.add(d); this.springs.shift(d); if (this.locks) for (const k in this.locks) this.locks[k].p.add(d); }
    // ---- contract API
    setFacing(yaw) { this.yaw = yaw; }
    setMove(speed) { this.targetSpeed = max(0, speed || 0); }
    bone(name) { return this.bmap[name] || null; }
    clipInfo(name) { const c = this.T.clips[name]; return c ? { dur: c.duration, hit: c.userData.meta.hit, loop: c.userData.loop } : null; }
    play(name, opts = {}) {
      const THREE = window.THREE;
      if (name == null || name === '_idle' || (name === 'idle' && this.context !== 'battle')) { this.clearOverlays(opts.fade != null ? opts.fade : 0.3); return; }
      let n = PLAYALIAS[name] || name;
      if (n === '_idle') { this.clearOverlays(opts.fade != null ? opts.fade : 0.3); return; }
      if (name === 'idle' && this.context === 'battle') n = 'bidle';
      if (n === '_run') n = this.context === 'battle' ? 'brun' : 'run';
      if (n === '_walk') n = 'walk';
      const a = this.action(n);
      if (!a) { warn('char3d clip ' + name, new Error('no clip ' + name)); if (opts.onDone) opts.onDone(); return; }
      const clip = a.getClip();
      const loopClip = clip.userData.loop;
      const loop = opts.loop != null ? opts.loop : loopClip;
      const fade = opts.fade != null ? opts.fade : (n === 'hurt' || n === 'dodge' ? 0.08 : 0.22);
      // restart / crossfade
      for (const o of this.overlays) { o.target = 0; o.rate = 1 / max(0.05, fade); }
      a.reset();
      a.enabled = true;
      a.setLoop(loop && loopClip ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.timeScale = opts.speed || 1;
      a.setEffectiveWeight(0);
      a.play();
      const ov = { name: n, a, w: 0, target: 1, rate: 1 / max(0.05, fade), loop: loop && loopClip, then: loop && SEQ[n] ? SEQ[n] : null, hold: !!HOLDS[n] || (!!SEQ[n] && !loop), onDone: opts.onDone, onHit: opts.onHit, hitDone: false, fadeOut: opts.fadeOut != null ? opts.fadeOut : 0.25 };
      // pose-holding clips played with loop:true go intro → loop
      if (loop && SEQ[n]) { ov.loop = false; ov.then = SEQ[n]; }
      if (!loop && SEQ[n] && opts.hold !== false) ov.hold = true;
      // remove the same action if it was fading
      this.overlays = this.overlays.filter((o) => o.a !== a);
      this.overlays.push(ov);
      this.fidgetT = 8 + random() * 8;
      if (n === 'talk') this.talk(true);
    }
    clearOverlays(fade = 0.3) { for (const o of this.overlays) { o.target = 0; o.rate = 1 / max(0.05, fade); } }
    emote(k) {
      const map = { '!': ['e_hop', 'surprised'], '?': ['e_tilt', 'puzzled'], '…': ['e_sigh', 'closed'], '...': ['e_sigh', 'closed'], '♪': ['e_sway', 'smile'], '💢': ['e_stomp', 'angry'], '♥': ['e_shy', 'shy'], '💧': ['e_sigh', 'sad'], '✦': ['e_fist', 'determined'] };
      const m = map[k] || ['e_tilt', 'surprised'];
      if (!this.overlays.some((o) => o.target > 0 && o.loop)) this.play(m[0], { fade: 0.12 });
      this.setExpression(m[1] === 'puzzled' ? 'surprised' : m[1], 2.6);
      if (k === '💧') this.sweat = 2.4;
    }
    setExpression(name, dur) {
      const n = EXPR[name] ? name : 'neutral';
      if (dur) { this.expr = n; this.exprT = dur; }
      else { this.baseExpr = n; this.expr = n; this.exprT = 0; }
    }
    talk(on) { this.talking = !!on; if (!on) this.mouth.i = 0; }
    lookAt(v) { if (v) { if (!this.lookTarget) this.lookTarget = v.clone(); else this.lookTarget.copy(v); } else this.lookTarget = null; }
    setOpacity(a, ghost) {
      const g = !!ghost || this.ghost;
      const op = a * (g ? 0.78 : 1);
      if (abs(op - this.opacity) < 1e-3 && g === this._g) return;
      this.opacity = op; this._g = g;
      for (const m of [this.bodyMat, this.faceMat]) {
        const tr = op < 0.995;
        if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
        m.opacity = op; m.depthWrite = op > 0.5;
        m.userData.u.uGhost.value = g ? 1 : 0;
        if (g) m.userData.u.uGhostCol.value.set(this.T.S.ghostTint || '#bfe0ff');
      }
      this.outline.visible = op > 0.9 && !g;
      // translucent: depth-only prepass so only the front-most surface blends (no hair/back showing through)
      if (op < 0.995 && !this.prepass) {
        const THREE = window.THREE, dm = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.FrontSide });
        this.prepass = [this.T.geo, this.T.hgeo].map((geo) => { const m = new THREE.SkinnedMesh(geo, dm); m.bind(this.skeleton, new THREE.Matrix4()); m.boundingSphere = this.body.boundingSphere; m.renderOrder = -2; m.castShadow = false; this.model.add(m); return m; });
        this._dm = dm;
      }
      if (this.prepass) for (const m of this.prepass) m.visible = op < 0.995;
      for (const m of [this.body, this.head]) m.renderOrder = op < 0.995 ? 1 : 0;
      this.body.castShadow = op > 0.5 && !g;
    }
    lights() {
      const out = [];
      for (const L2 of this._lights) {
        if (L2.sock && L2.sock.scale.x < 0.01) continue;
        if (!this.root.visible) continue;
        const p = this._v3.copy(L2.off).applyMatrix4(L2.bone.matrixWorld);
        L2.out.x = p.x; L2.out.y = p.y; L2.out.z = p.z;
        out.push(L2.out);
      }
      return out;
    }
    // ---- per frame
    update(dt, camYaw = 0, camera = null) {
      const THREE = window.THREE;
      dt = min(max(dt || 0, 0), 0.1);
      this.t += dt;
      const T = this.T, P = T.P, size = this.size;
      // distance LOD (springs / face detail)
      let far = false;
      if (camera) { const d = camera.position.distanceTo(this.root.position); far = d > 22; this.lodFar = far; }
      // --- facing & lean
      let dy = this.yaw - this.yawPrev; dy = atan2(sin(dy), cos(dy));
      this.yawPrev = this.yaw;
      this.root.rotation.y = this.yaw;
      const rate = dt > 0 ? dy / dt : 0;
      this.yawRate += (rate - this.yawRate) * min(1, dt * 10);
      // --- speed smoothing & locomotion blend space (cadence = speed / stride → planted feet)
      const acc = this.targetSpeed > this.speed ? 9 : 12;
      this.speed += clamp(this.targetSpeed - this.speed, -acc * dt, acc * dt);
      const v = this.speed / size;
      const G0 = C.GAITS, s = P.s;
      const vw = G0.walk.v * s, vj = G0.jog.v * s, vr = G0.run.v * s;
      const sw = G0.walk.stride * s, sj = G0.jog.stride * s, sr = G0.run.stride * s;
      let wI = 0, wW = 0, wJ = 0, wR = 0, stride = sw;
      if (v < 0.02) { wI = 1; }
      else if (v < vw) { const k = sstep(0, 1, v / vw); wI = 1 - k; wW = k; stride = sw; }
      else if (v < vj) { const k = (v - vw) / (vj - vw); wW = 1 - k; wJ = k; stride = lerp(sw, sj, k); }
      else if (v < vr) { const k = (v - vj) / (vr - vj); wJ = 1 - k; wR = k; stride = lerp(sj, sr, k); }
      else { wR = 1; stride = sr; }
      if (v > 0.02) this.phase = (this.phase + dt * v / stride) % 1;
      const accel = dt > 0 ? (this.speed - this.prevSpeed) / dt : 0; this.prevSpeed = this.speed;
      // --- overlay weights
      let sum = 0;
      for (const o of this.overlays) {
        o.w += clamp(o.target - o.w, -o.rate * dt, o.rate * dt);
        const clip = o.a.getClip();
        if (o.target > 0 && !o.loop) {
          if (o.onHit && !o.hitDone && clip.userData.meta.hit != null && o.a.time >= clip.userData.meta.hit) { o.hitDone = true; try { o.onHit(); } catch (e) { warn('onHit', e); } }
          if (o.a.time >= clip.duration - 1e-3 || !o.a.isRunning()) {
            if (o.then) { const nx = o.then; o.then = null; this.play(nx, { loop: true, fade: 0.3 }); }
            else if (!o.hold) { o.target = 0; o.rate = 1 / max(0.05, o.fadeOut); if (o.onDone) { const cb = o.onDone; o.onDone = null; try { cb(); } catch (e) { warn('onDone', e); } } }
            else if (o.onDone) { const cb = o.onDone; o.onDone = null; try { cb(); } catch (e) { warn('onDone', e); } }
          }
        }
      }
      this.overlays = this.overlays.filter((o) => { if (o.target === 0 && o.w <= 1e-3) { o.a.stop(); return false; } return true; });
      for (const o of this.overlays) sum += o.w;
      const k = sum > 1 ? 1 / sum : 1;
      for (const o of this.overlays) o.a.setEffectiveWeight(o.w * k);
      const base = max(0, 1 - sum);
      // moving cancels "field" overlays that are not loops of locomotion (talk etc. stay)
      if (v > 0.3) for (const o of this.overlays) if (/^(sit|kneel|sleep|pray|think|cry|f_)/.test(o.name)) { o.target = 0; o.rate = 1 / 0.25; }
      const L = this.loco;
      if (L.idle) L.idle.setEffectiveWeight(wI * base);
      for (const [n, w] of [['walk', wW], ['jog', wJ], ['run', wR]]) {
        const a = L[n]; if (!a) continue;
        a.setEffectiveWeight(w * base);
        a.time = this.phase * a.getClip().duration;
      }
      // --- idle fidgets
      if (this.context !== 'battle' && v < 0.05 && !this.overlays.length && !this.talking) {
        this.fidgetT -= dt;
        if (this.fidgetT <= 0) { this.play(FIDGETS[floor(random() * FIDGETS.length)], { fade: 0.4 }); this.fidgetT = 9 + random() * 12; }
      } else if (v >= 0.05) this.fidgetT = max(this.fidgetT, 4);
      this.mixer.update(dt);
      // --- procedural layer: lean into turns / acceleration, breathing
      const b = this.bmap;
      const leanT = clamp(-this.yawRate * v * 0.055, -0.3, 0.3) * (v > 0.3 ? 1 : 0);
      this.lean += (leanT - this.lean) * min(1, dt * 6);
      const lf = clamp(accel * 0.012, -0.08, 0.12);
      this.leanF += (lf - this.leanF) * min(1, dt * 5);
      const q = this._q, e = this._e;
      if (abs(this.lean) > 1e-4 || abs(this.leanF) > 1e-4) {
        e.set(this.leanF, 0, this.lean, 'YXZ'); q.setFromEuler(e); b.hips.quaternion.premultiply(q);
        e.set(0, 0, -this.lean * 0.45, 'YXZ'); q.setFromEuler(e); b.chest.quaternion.multiply(q);
      }
      // --- look-at (additive: chest 15%, neck 35%, head 50% of the yaw; eyes lead)
      let lyT = 0, lpT = 0, lw = 0;
      if (this.lookTarget) {
        this.root.updateMatrixWorld(true);
        const hp = b.head.getWorldPosition(this._lv);
        const local = this.root.worldToLocal(this._v3.copy(this.lookTarget));
        const hl = this.root.worldToLocal(hp.clone());
        const dx = local.x - hl.x, dz = local.z - hl.z, dyy = local.y - hl.y - 0.05;
        const yawL = atan2(dx, dz), dist = hypot(dx, dz);
        if (abs(yawL) < 1.9 && dist > 0.15) { lyT = clamp(yawL, -1.25, 1.25); lpT = clamp(atan2(-dyy, dist), -0.55, 0.6); lw = 1; }
      }
      const kk = min(1, dt * 5);
      this.lookYaw += (lyT - this.lookYaw) * kk; this.lookPitch += (lpT - this.lookPitch) * kk; this.lookW += (lw - this.lookW) * min(1, dt * 3);
      if (this.lookW > 0.01) {
        const Y = this.lookYaw * this.lookW, X = this.lookPitch * this.lookW;
        e.set(X * 0.1, Y * 0.15, 0, 'YXZ'); q.setFromEuler(e); b.chest.quaternion.multiply(q);
        e.set(X * 0.35, Y * 0.35, 0, 'YXZ'); q.setFromEuler(e); b.neck.quaternion.multiply(q);
        e.set(X * 0.55, Y * 0.5, 0, 'YXZ'); q.setFromEuler(e); b.head.quaternion.multiply(q);
      }
      // --- runtime foot locking (removes residual slide in gait blend zones and while turning on the move)
      this.footLock(dt, v);
      // ghosts float
      if (this.ghost) { this.model.position.y = 0.06 + 0.03 * sin(this.t * 2.1); }
      // --- springs
      this.root.updateMatrixWorld(true);
      if (dt > 0) {
        this.springTick = (this.springTick || 0) + 1;
        if (!far || this.springTick % 2 === 0) this.springs.update(far ? dt * 2 : dt, size * (this.root.scale.x || 1), far);
      } else this.springs.update(1 / 60, size, false);
      // --- face
      this.updateFace(dt, far, lyT, lpT);
    }
    footLock(dt, v) {
      const THREE = window.THREE, IK = C._ik, b = this.bmap;
      if (!this.locks) this.locks = { L: { on: false, w: 0, p: new THREE.Vector3() }, R: { on: false, w: 0, p: new THREE.Vector3() } };
      let ow = 0; for (const o of this.overlays) ow += o.w;
      const active = v > 0.25 && ow < 0.5 && abs(this.yawRate) < 4 && !this.lodFar && !this.ghost;
      this.root.updateMatrixWorld(true);
      const rootY = this.root.getWorldPosition(this._v3).y;
      const aY = this.T.P.ankleY * this.size;
      for (const S of ['L', 'R']) {
        const Lk = this.locks[S];
        const foot = b['foot' + S];
        const A = IK.worldPos(foot);
        const flat = active && A.y - rootY < aY + 0.01 * this.size;
        if (flat && !Lk.on) { Lk.on = true; Lk.p.copy(A); }
        if (!flat) Lk.on = false;
        Lk.w += clamp((Lk.on ? 1 : 0) - Lk.w, -dt * 14, dt * 30);
        if (Lk.w < 0.01) continue;
        if (Lk.on && A.distanceTo(Lk.p) > 0.22 * this.size) { Lk.on = false; continue; }
        const tgt = A.clone().lerp(new THREE.Vector3(Lk.p.x, A.y, Lk.p.z), Lk.w);
        const fq = IK.worldQuat(foot);
        const sg = S === 'L' ? 1 : -1;
        const pole = new THREE.Vector3(sg * 0.12, 0, 1).applyQuaternion(IK.worldQuat(b.hips)).normalize();
        IK.ik2(b['thigh' + S], b['shin' + S], foot, tgt, pole);
        IK.setWorldQuat(foot, fq);
      }
    }
    updateFace(dt, far, lyT, lpT) {
      const st = {};
      // expression timer
      if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.expr = this.baseExpr; }
      const ex = EXPR[this.expr] || EXPR.neutral;
      Object.assign(st, ex);
      // blink: fast close (60 ms), short hold, slower open (100 ms); occasional double blinks
      const B = this.blink;
      B.next -= dt;
      let open = ex.open != null ? ex.open : 1;
      if (B.dur > 0) {
        B.t += dt;
        const tt = B.t;
        const c = tt < 0.06 ? tt / 0.06 : tt < 0.1 ? 1 : 1 - (tt - 0.1) / 0.1;
        open = min(open, 1 - clamp(c, 0, 1));
        if (tt > 0.2) { B.dur = 0; if (B.dbl) { B.dbl = false; B.next = 0.12; } }
      } else if (B.next <= 0 && !far) { B.dur = 0.2; B.t = 0; B.dbl = random() < 0.15; B.next = 2 + random() * 4.5; }
      st.open = open;
      // eyes: saccades, or lead toward the look target
      const E = this.eye;
      E.next -= dt;
      if (this.lookW > 0.3 && this.lookTarget) { E.tx = clamp((lyT - this.lookYaw * 0.85) * 2.5, -1, 1) + 0; E.ty = clamp(-lpT * 1.2, -1, 1); }
      else if (E.next <= 0) { E.tx = (ex.lookX || 0) + (random() - 0.5) * 0.5; E.ty = (ex.lookY || 0) + (random() - 0.5) * 0.3; E.next = 0.7 + random() * 2.4; }
      E.x += (E.tx - E.x) * min(1, dt * 30); E.y += (E.ty - E.y) * min(1, dt * 30);
      st.lookX = E.x; st.lookY = E.y;
      // mouth: expression or lip flap
      if (this.talking) {
        const M2 = this.mouth; M2.t -= dt;
        if (M2.t <= 0) { M2.i = random() < 0.18 ? 0 : 1 + floor(random() * 5); M2.t = M2.i === 0 ? 0.08 + random() * 0.12 : 0.07 + random() * 0.07; }
        Object.assign(st, MOUTHS[M2.i]);
        if (M2.i && ex.curve) st.curve = ex.curve * 0.5;
      }
      if (this.sweat > 0) { this.sweat -= dt; st.sweat = 1; }
      if (this.expr === 'sad' && this.overlays.some((o) => o.name === 'cry')) st.tears = 1;
      // quantised key → redraw only on change
      const qn = (x, n) => round(x * n) / n;
      st.open = qn(st.open, 4); st.lookX = qn(st.lookX, far ? 1 : 6); st.lookY = qn(st.lookY, far ? 1 : 6);
      st.key = this.expr + '|' + st.open + '|' + st.lookX + '|' + st.lookY + '|' + (this.talking ? this.mouth.i : '-') + '|' + (st.sweat ? 1 : 0) + (st.tears ? 1 : 0);
      this.face.draw(st);
    }
    dispose() {
      if (this.root.parent) this.root.parent.remove(this.root);
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.model);
      this.face.tex.dispose();
      this.bodyMat.dispose(); this.faceMat.dispose(); if (this._dm) this._dm.dispose();
      this.skeleton.dispose();
    }
  }
  C.Inst = Char3DInst;

  // ------------------------------------------------------------------------------------------ public API
  const kindOf = (id) => { if (!G.Sprites || !G.Sprites.has(id)) return null; const s = G.Sprites.spec(id); return (s && s.kind) || 'human'; };
  C.has = function (id) {
    const k = kindOf(id);
    if (!k) return false;
    if (k === 'quad' || k === 'bird') return !!(G.Animal3D && G.Animal3D.has && G.Animal3D.has(id));
    return true;
  };
  C.create = function (id, opts = {}) {
    const k = kindOf(id);
    if (!k) return null;
    if (k === 'quad' || k === 'bird') return G.Animal3D && G.Animal3D.create ? G.Animal3D.create(id, opts) : null;
    const T = template(id, opts.context);
    if (!T) return null;
    try { return new Char3DInst(T, opts); } catch (e) { warn('char3d inst ' + id, e); return null; }
  };
  C.stats = function (id, ctx) { const T = template(id, ctx); return T ? { tris: T.tris, bones: T.defs.length, chains: T.chains.length, atlas: T.B.atlas.S, density: round(T.B.atlas.d) } : null; };
  C.clearCache = function () { templates.clear(); };
})();

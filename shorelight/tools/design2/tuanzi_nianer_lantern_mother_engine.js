// 彼岸燈 Shorelight — design pass v2, spirit cast (糰子 / 夜念 / 燈母)
// Tiny procedural 3D toon renderer used to draw the concept sheets.
//
// Why 3D: the game is moving to cel-shaded 3D characters with an angled camera, so every design is built as a
// modelable stack of primary shapes (signed-distance primitives + smooth unions) with details as *paint* (textures),
// then rendered orthographically from front / 3-4 / side / back with a toon shader (lit / shade / deep band,
// rim light, specular pips) and a depth/normal/part-edge ink outline pass. One model → consistent turnarounds.
//
// Everything is CPU ray-marched into Canvas 2D ImageData — no WebGL, no external images.
'use strict';
(function (G) {
  const E = {};
  // ------------------------------------------------------------------ math
  const sqrt = Math.sqrt, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  E.clamp = clamp; E.mix = mix; E.sstep = sstep;
  const smin = (a, b, k) => { const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; };
  const smax = (a, b, k) => -smin(-a, -b, k);
  E.smin = smin; E.smax = smax;

  // colour helpers ([r,g,b] 0..1)
  const hex = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255]; };
  const toHex = (c) => '#' + c.map((v) => ('0' + Math.round(clamp(v, 0, 1) * 255).toString(16)).slice(-2)).join('');
  const cmix = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
  const cmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  E.hex = hex; E.toHex = toHex; E.cmix = cmix; E.cmul = cmul;
  // shade = darker, cooler, a touch more saturated (painterly shadow shift)
  E.shadeOf = (c, k = 0.68, cool = [0.86, 0.84, 1.0]) => {
    const l = (c[0] + c[1] + c[2]) / 3;
    const s = [c[0] + (c[0] - l) * 0.25, c[1] + (c[1] - l) * 0.25, c[2] + (c[2] - l) * 0.25];
    return [clamp(s[0] * k * cool[0], 0, 1), clamp(s[1] * k * cool[1], 0, 1), clamp(s[2] * k * cool[2], 0, 1)];
  };
  E.lineOf = (c, k = 0.32) => { const s = E.shadeOf(c, 1, [0.9, 0.85, 1]); return [s[0] * k, s[1] * k, s[2] * k * 1.1]; };

  // hashing / noise for textures (only evaluated at shading time)
  function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  E.hash3 = hash3;
  function vnoise(x, y, z) {
    const xi = floor(x), yi = floor(y), zi = floor(z); const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const a = hash3(xi, yi, zi), b = hash3(xi + 1, yi, zi), c = hash3(xi, yi + 1, zi), d = hash3(xi + 1, yi + 1, zi);
    const e = hash3(xi, yi, zi + 1), f = hash3(xi + 1, yi, zi + 1), g = hash3(xi, yi + 1, zi + 1), h = hash3(xi + 1, yi + 1, zi + 1);
    return mix(mix(mix(a, b, u), mix(c, d, u), v), mix(mix(e, f, u), mix(g, h, u), v), w);
  }
  E.noise = vnoise;
  E.fbm = (x, y, z, o = 3) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s; };
  // Worley F1 with jittered cells: returns {d, id} in a shared object
  const WOR = { d: 0, id: 0, cx: 0, cy: 0, cz: 0 };
  E.worley = (x, y, z, jit = 0.8) => {
    const xi = floor(x), yi = floor(y), zi = floor(z); let best = 9, id = 0, bx = 0, by = 0, bz = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const cx = xi + i, cy = yi + j, cz = zi + k;
      const px = cx + 0.5 + (hash3(cx, cy, cz) - 0.5) * jit, py = cy + 0.5 + (hash3(cy, cz, cx + 17) - 0.5) * jit, pz = cz + 0.5 + (hash3(cz + 31, cx, cy) - 0.5) * jit;
      const dx = x - px, dy = y - py, dz = z - pz; const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; id = hash3(cx + 7, cy + 3, cz + 11); bx = px; by = py; bz = pz; }
    }
    WOR.d = sqrt(best); WOR.id = id; WOR.cx = bx; WOR.cy = by; WOR.cz = bz; return WOR;
  };

  // rotation matrix from euler degrees (applied X then Y then Z)
  function rotM(rx, ry, rz) {
    const a = rx * Math.PI / 180, b = ry * Math.PI / 180, c = rz * Math.PI / 180;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    // R = Rz * Ry * Rx
    return [cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa,
      sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa,
      -sb, cb * sa, cb * ca];
  }
  E.rotM = rotM;
  // local frame helper for textures: world -> local (inverse rotation about origin o)
  E.frame = (ox, oy, oz, rx = 0, ry = 0, rz = 0) => {
    const m = rotM(rx, ry, rz); const out = [0, 0, 0];
    return (x, y, z) => { x -= ox; y -= oy; z -= oz; out[0] = m[0] * x + m[3] * y + m[6] * z; out[1] = m[1] * x + m[4] * y + m[7] * z; out[2] = m[2] * x + m[5] * y + m[8] * z; return out; };
  };

  // ------------------------------------------------------------------ SDF scene graph (closures)
  let MAT = 0; // material id of the nearest leaf of the last evaluation
  E.matOf = () => MAT;

  // Scene: registry of materials + builders that capture material ids
  E.Scene = function () {
    const S = { mats: [null], names: {}, root: null, bounds: null, anchors: {}, overlays: [], params: {} };
    S.mat = (name, def) => { const id = S.mats.length; def.name = name; def.id = id; S.mats.push(def); S.names[name] = id; return id; };
    const M = (m) => (typeof m === 'number' ? m : S.names[m]);
    // primitives ------------------------------------------------------------
    S.sphere = (m, cx, cy, cz, r) => { const id = M(m); return (x, y, z) => { MAT = id; x -= cx; y -= cy; z -= cz; return sqrt(x * x + y * y + z * z) - r; }; };
    S.ell = (m, cx, cy, cz, rx, ry, rz) => {
      const id = M(m), irx = 1 / rx, iry = 1 / ry, irz = 1 / rz;
      return (x, y, z) => { MAT = id; x -= cx; y -= cy; z -= cz; const ax = x * irx, ay = y * iry, az = z * irz; const k0 = sqrt(ax * ax + ay * ay + az * az); const bx = ax * irx, by = ay * iry, bz = az * irz; const k1 = sqrt(bx * bx + by * by + bz * bz); return k1 < 1e-9 ? -min(rx, ry, rz) : k0 * (k0 - 1) / k1; };
    };
    // round cone from a (radius r1) to b (radius r2)
    S.cone = (m, ax, ay, az, bx, by, bz, r1, r2) => {
      const id = M(m); const bax = bx - ax, bay = by - ay, baz = bz - az; const l2 = bax * bax + bay * bay + baz * baz; const rr = r1 - r2; const a2 = l2 - rr * rr; const il2 = 1 / l2; const srr = Math.sign(rr) * rr * rr;
      return (x, y, z) => {
        MAT = id; const pax = x - ax, pay = y - ay, paz = z - az; const yy = pax * bax + pay * bay + paz * baz; const zz = yy - l2;
        const xx = pax * l2 - bax * yy, xy = pay * l2 - bay * yy, xz = paz * l2 - baz * yy; const x2 = xx * xx + xy * xy + xz * xz; const y2 = yy * yy * l2, z2 = zz * zz * l2; const k = srr * x2;
        if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
        if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
        return (sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
      };
    };
    S.cap = (m, ax, ay, az, bx, by, bz, r) => S.cone(m, ax, ay, az, bx, by, bz, r, r);
    // chain of round cones through points [[x,y,z,r],...]
    S.tube = (m, pts, k = 0) => { const segs = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; segs.push(S.cone(m, a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3])); } return k > 0 ? S.su(k, ...segs) : S.u(...segs); };
    S.box = (m, cx, cy, cz, hx, hy, hz, r = 0) => {
      const id = M(m); return (x, y, z) => { MAT = id; const qx = abs(x - cx) - hx + r, qy = abs(y - cy) - hy + r, qz = abs(z - cz) - hz + r; const mx = max(qx, 0), my = max(qy, 0), mz = max(qz, 0); return sqrt(mx * mx + my * my + mz * mz) + min(max(qx, max(qy, qz)), 0) - r; };
    };
    // vertical capped cylinder (axis y), rounded edge r
    S.cyl = (m, cx, cy, cz, rad, h, r = 0) => {
      const id = M(m); return (x, y, z) => { MAT = id; x -= cx; y -= cy; z -= cz; const dx = sqrt(x * x + z * z) - rad + r, dy = abs(y) - h + r; const mx = max(dx, 0), my = max(dy, 0); return min(max(dx, dy), 0) + sqrt(mx * mx + my * my) - r; };
    };
    S.torus = (m, cx, cy, cz, R, r) => { const id = M(m); return (x, y, z) => { MAT = id; x -= cx; y -= cy; z -= cz; const q = sqrt(x * x + z * z) - R; return sqrt(q * q + y * y) - r; }; };
    // 2D polygon distance (Quilez) on flat arrays [x0,y0,x1,y1,...]
    function poly2(px, py, v) {
      const n = v.length / 2; let d = (px - v[0]) * (px - v[0]) + (py - v[1]) * (py - v[1]); let s = 1;
      for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const vix = v[2 * i], viy = v[2 * i + 1], vjx = v[2 * j], vjy = v[2 * j + 1];
        const ex = vjx - vix, ey = vjy - viy, wx = px - vix, wy = py - viy;
        const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1); const bx = wx - ex * t, by = wy - ey * t; const dd = bx * bx + by * by; if (dd < d) d = dd;
        const c1 = py >= viy, c2 = py < vjy, c3 = ex * wy > ey * wx; if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
      }
      return s * sqrt(d);
    }
    E.poly2 = poly2;
    // revolve a 2D profile [(r,y)...] around the y axis; ribs: n-fold radial modulation amplitude
    S.lathe = (m, cx, cy, cz, prof, round = 0, ribs = 0, ribAmp = 0, ribPhase = 0) => {
      const id = M(m); const v = Array.isArray(prof[0]) ? prof.flat() : prof;
      let ymin = 1e9, ymax = -1e9, rmax = 0; for (let i = 0; i < v.length; i += 2) { rmax = max(rmax, v[i]); ymin = min(ymin, v[i + 1]); ymax = max(ymax, v[i + 1]); }
      const bcy = (ymin + ymax) / 2, brad = sqrt(rmax * rmax + ((ymax - ymin) / 2) ** 2) + ribAmp + round + 0.01;
      return (x, y, z) => {
        MAT = id; x -= cx; y -= cy; z -= cz;
        const bd = sqrt(x * x + (y - bcy) * (y - bcy) + z * z) - brad; if (bd > 0.3 * brad) return bd;
        let r = sqrt(x * x + z * z); if (ribs) r -= ribAmp * abs(Math.cos(Math.atan2(z, x) * ribs * 0.5 + ribPhase));
        return poly2(r, y, v) - round;
      };
    };
    // extrude a 2D polygon (xy) along z by half-depth hz
    S.extrude = (m, cx, cy, cz, poly, hz, round = 0) => {
      const id = M(m); const v = Array.isArray(poly[0]) ? poly.flat() : poly;
      let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; for (let i = 0; i < v.length; i += 2) { bx0 = min(bx0, v[i]); bx1 = max(bx1, v[i]); by0 = min(by0, v[i + 1]); by1 = max(by1, v[i + 1]); }
      const bcx = (bx0 + bx1) / 2, bcy = (by0 + by1) / 2, brad = sqrt(((bx1 - bx0) / 2) ** 2 + ((by1 - by0) / 2) ** 2 + hz * hz) + round + 0.01;
      return (x, y, z) => {
        MAT = id; x -= cx; y -= cy; z -= cz;
        const bd = sqrt((x - bcx) ** 2 + (y - bcy) ** 2 + z * z) - brad; if (bd > 0.3 * brad) return bd;
        const d2 = poly2(x, y, v) + round; const wz = abs(z) - hz + round; const mx = max(d2, 0), mz = max(wz, 0);
        return min(max(d2, wz), 0) + sqrt(mx * mx + mz * mz) - round;
      };
    };
    S.fn = (m, f) => { const id = M(m); return (x, y, z) => { MAT = id; return f(x, y, z); }; };
    // operators ---------------------------------------------------------------
    S.u = (...n) => { n = n.filter(Boolean); const L = n.length; return (x, y, z) => { let best = 1e9, bm = 0; for (let i = 0; i < L; i++) { const d = n[i](x, y, z); if (d < best) { best = d; bm = MAT; } } MAT = bm; return best; }; };
    S.su = (k, ...n) => { n = n.filter(Boolean); const L = n.length; return (x, y, z) => { let d = n[0](x, y, z), raw = d, bm = MAT; for (let i = 1; i < L; i++) { const e = n[i](x, y, z); if (e < raw) { raw = e; bm = MAT; } d = smin(d, e, k); } MAT = bm; return d; }; };
    // smooth union where the *second* node keeps its material inside the blend (good for painted patches)
    S.sub = (a, b, k = 0) => (x, y, z) => { const da = a(x, y, z); const mm = MAT; const db = b(x, y, z); MAT = mm; return k ? smax(da, -db, k) : max(da, -db); };
    S.inter = (a, b, k = 0) => (x, y, z) => { const da = a(x, y, z); const mm = MAT; const db = b(x, y, z); MAT = mm; return k ? smax(da, db, k) : max(da, db); };
    S.shell = (a, t) => (x, y, z) => abs(a(x, y, z)) - t;
    S.t = (a, tx, ty, tz) => (x, y, z) => a(x - tx, y - ty, z - tz);
    // rotate node about pivot (euler degrees)
    S.r = (a, px, py, pz, rx, ry, rz) => { const m = rotM(rx, ry, rz); return (x, y, z) => { x -= px; y -= py; z -= pz; return a(m[0] * x + m[3] * y + m[6] * z + px, m[1] * x + m[4] * y + m[7] * z + py, m[2] * x + m[5] * y + m[8] * z + pz); }; };
    S.sc = (a, s, px = 0, py = 0, pz = 0) => (x, y, z) => a((x - px) / s + px, (y - py) / s + py, (z - pz) / s + pz) * s;
    S.mx = (a) => (x, y, z) => a(abs(x), y, z); // mirror across x=0
    S.disp = (a, f) => (x, y, z) => a(x, y, z) + f(x, y, z);
    S.bound = (a, cx, cy, cz, r) => (x, y, z) => { const bd = sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r; return bd > 0.25 * r ? bd : a(x, y, z); };
    // rotated ellipsoid about its own centre (euler degrees)
    S.rell = (m, cx, cy, cz, rx, ry, rz, ax, ay, az) => S.t(S.r(S.ell(m, 0, 0, 0, rx, ry, rz), 0, 0, 0, ax, ay, az), cx, cy, cz);
    // non-uniform scale (approximate SDF; fine for mild factors)
    S.ns = (a, sx, sy, sz) => { const k = min(sx, sy, sz); return (x, y, z) => a(x / sx, y / sy, z / sz) * k; };
    // fur clumps: displaces a node outward by amp*bump(p) only near its surface (cheap lower bound elsewhere)
    // bump = scalloped tufts from value noise sharpened; dirY biases tufts downward (gravity)
    S.fluff = (a, amp, freq, o = {}) => {
      const sharp = o.sharp || 2.2, off = o.off || 0, mask = o.mask || null;
      return (x, y, z) => {
        const d = a(x, y, z); if (d > amp * 2.2) return d - amp; const mm = MAT;
        let w = mask ? mask(x, y, z) : 1; if (w <= 0) { MAT = mm; return d; }
        const n = vnoise(x * freq + off, y * freq * (o.sy || 1) + off * 0.7, z * freq - off);
        const b = Math.pow(clamp(n * 1.25 - 0.1, 0, 1), sharp);
        MAT = mm; return d - amp * b * w;
      };
    };
    S.relax = 1;
    return S;
  };

  // ------------------------------------------------------------------ renderer
  // view: { yaw, pitch, cx, cy, cz (look-at), scale (px/unit), w, h, ss }
  function camera(v) {
    const ya = (v.yaw || 0) * Math.PI / 180, pa = (v.pitch || 0) * Math.PI / 180;
    // backward vector (from target toward camera)
    const bx = Math.sin(ya) * Math.cos(pa), by = Math.sin(pa), bz = Math.cos(ya) * Math.cos(pa);
    const rx = Math.cos(ya), ry = 0, rz = -Math.sin(ya);
    const ux = by * rz - bz * ry, uy = bz * rx - bx * rz, uz = bx * ry - by * rx; // up = back x right
    return { b: [bx, by, bz], r: [rx, ry, rz], u: [ux, uy, uz] };
  }
  E.camera = camera;
  E.project = (v, x, y, z) => {
    const c = v.cam || (v.cam = camera(v)); const dx = x - v.cx, dy = y - v.cy, dz = z - (v.cz || 0);
    return [v.w / 2 + (dx * c.r[0] + dy * c.r[1] + dz * c.r[2]) * v.scale, v.h / 2 - (dx * c.u[0] + dy * c.u[1] + dz * c.u[2]) * v.scale, dx * c.b[0] + dy * c.b[1] + dz * c.b[2]];
  };
  const camToWorld = (c, l) => { const x = c.r[0] * l[0] + c.u[0] * l[1] + c.b[0] * l[2], y = c.r[1] * l[0] + c.u[1] * l[1] + c.b[1] * l[2], z = c.r[2] * l[0] + c.u[2] * l[1] + c.b[2] * l[2]; const n = sqrt(x * x + y * y + z * z); return [x / n, y / n, z / n]; };

  // trace rows [j0,j1) of the supersampled image → raw buffers (runs in workers too)
  E.trace = function (S, view, j0, j1) {
    const f = S.root, ss = view.ss || 2, W = Math.round(view.w * ss), H = Math.round(view.h * ss);
    if (j1 == null) j1 = H; const N = W * (j1 - j0);
    const cam = view.cam = camera(view); const sc = view.scale * ss; const px = 1 / sc;
    const P = S.params; const lightCam = view.light || P.light || [-0.55, 0.62, 0.56]; const L = camToWorld(cam, lightCam);
    const rimCam = view.rim || P.rim || [0.85, 0.25, -0.45]; const RL = camToWorld(cam, rimCam);
    const hit = new Int16Array(N), dep = new Float32Array(N), nrm = new Float32Array(N * 3), col = new Float32Array(N * 4), emi = new Float32Array(N * 3), lin = new Float32Array(N * 3);
    const bb = S.bounds; // [x0,y0,z0,x1,y1,z1]
    const back = cam.b, fw = [-back[0], -back[1], -back[2]]; const FAR = 40 * (P.size || 1);
    const eps = px * 0.35; const maxSteps = P.steps || 220; const relax = P.relax || 0.9;
    const shadowsOn = P.shadows !== false;
    const vx = back[0], vy = back[1], vz = back[2];
    // beam pre-pass: one ray per BxB block marched with a block-radius threshold → safe start t (or empty)
    const B = 8, bwN = Math.ceil(W / B), bj0 = Math.floor(j0 / B), bj1 = Math.ceil(j1 / B); const bStart = new Float32Array(bwN * (bj1 - bj0)).fill(-1);
    const brad = B * px * 0.7072 + px;
    for (let bj = bj0; bj < bj1; bj++) for (let bi = 0; bi < bwN; bi++) {
      const u = ((bi + 0.5) * B - W / 2) * px, v = -((bj + 0.5) * B - H / 2) * px;
      const ox = view.cx + cam.r[0] * u + cam.u[0] * v + back[0] * FAR, oy = view.cy + cam.r[1] * u + cam.u[1] * v + back[1] * FAR, oz = (view.cz || 0) + cam.r[2] * u + cam.u[2] * v + back[2] * FAR;
      let t0 = 0, t1 = 1e9, ok = true;
      for (let a = 0; a < 3; a++) { const o = a === 0 ? ox : a === 1 ? oy : oz, d = fw[a]; const lo = bb[a] - brad, hi = bb[a + 3] + brad; if (abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } } else { let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; } }
      if (!ok || t0 > t1) continue;
      let t = t0, st = 0; while (t < t1 && st < 300) { const d = f(ox + fw[0] * t, oy + fw[1] * t, oz + fw[2] * t); if (d < brad) { bStart[(bj - bj0) * bwN + bi] = t; break; } t += (d - brad * 0.98) * relax + px * 0.05; st++; }
    }
    for (let j = j0; j < j1; j++) {
      for (let i = 0; i < W; i++) {
        const bs = bStart[(Math.floor(j / B) - bj0) * bwN + Math.floor(i / B)]; if (bs < 0) continue;
        const u = (i + 0.5 - W / 2) * px, v = -(j + 0.5 - H / 2) * px;
        const ox = view.cx + cam.r[0] * u + cam.u[0] * v + back[0] * FAR, oy = view.cy + cam.r[1] * u + cam.u[1] * v + back[1] * FAR, oz = (view.cz || 0) + cam.r[2] * u + cam.u[2] * v + back[2] * FAR;
        let t0 = 0, t1 = 1e9; let ok = true;
        for (let a = 0; a < 3; a++) {
          const o = a === 0 ? ox : a === 1 ? oy : oz, d = fw[a]; const lo = bb[a], hi = bb[a + 3];
          if (abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } } else { let ta = (lo - o) / d, tb = (hi - o) / d; if (ta > tb) { const q = ta; ta = tb; tb = q; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; }
        }
        const k = (j - j0) * W + i; if (!ok || t0 > t1) continue;
        let t = max(t0, bs), d = 0, steps = 0, found = false;
        while (t < t1 && steps < maxSteps) { d = f(ox + fw[0] * t, oy + fw[1] * t, oz + fw[2] * t); if (d < eps) { found = true; break; } t += d * relax; steps++; }
        if (!found) continue;
        const x = ox + fw[0] * t, y = oy + fw[1] * t, z = oz + fw[2] * t;
        const h = px * 0.6;
        const a1 = f(x + h, y - h, z - h), a2 = f(x - h, y - h, z + h), a3 = f(x - h, y + h, z - h), a4 = f(x + h, y + h, z + h);
        let nx = a1 - a2 - a3 + a4, ny = -a1 - a2 + a3 + a4, nz = -a1 + a2 - a3 + a4; const nl = sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        f(x, y, z); const mid = MAT; const m = S.mats[mid];
        hit[k] = mid; dep[k] = t; nrm[3 * k] = nx; nrm[3 * k + 1] = ny; nrm[3 * k + 2] = nz;
        const sh = { base: m.base, shade: m.shade, deep: m.deep, hi: m.hi, line: m.line, emit: m.emit || null, alpha: m.alpha != null ? m.alpha : 1, spec: m.spec || 0, rim: m.rim, noShade: m.flat };
        if (m.tex) m.tex(x, y, z, nx, ny, nz, sh, view);
        const ndl = nx * L[0] + ny * L[1] + nz * L[2];
        let lit = sstep(-0.03, 0.03, ndl - (m.term != null ? m.term : 0.0));
        if (shadowsOn && lit > 0 && m.recv !== false) {
          let st = px * 3 + 0.004 * (P.size || 1), occ = 1; const smax_ = (P.shadowDist || 0.6) * (P.size || 1);
          for (let s = 0; s < 48 && st < smax_; s++) { const dd = f(x + nx * px * 2 + L[0] * st, y + ny * px * 2 + L[1] * st, z + nz * px * 2 + L[2] * st); if (dd < px * 0.5) { occ = 0; break; } st += max(dd, px * 1.5); }
          lit *= occ;
        }
        let ao = 0; if (m.ao !== false) { let w = 1; const s0 = (P.aoScale || 0.02) * (P.size || 1); for (let s = 1; s <= 4; s++) { const hh = s0 * s; ao += (hh - f(x + nx * hh, y + ny * hh, z + nz * hh)) * w; w *= 0.6; } ao = clamp(ao / s0 * 0.45, 0, 1); }
        let r, g, b;
        if (sh.noShade) { r = sh.base[0]; g = sh.base[1]; b = sh.base[2]; }
        else {
          const sd = sh.shade || E.shadeOf(sh.base);
          r = mix(sd[0], sh.base[0], lit); g = mix(sd[1], sh.base[1], lit); b = mix(sd[2], sh.base[2], lit);
          const dp = sh.deep || E.shadeOf(sd, 0.8);
          const deepT = sstep(0.45, 0.55, ao) * (m.deepAmt != null ? m.deepAmt : 0.7);
          r = mix(r, dp[0], deepT); g = mix(g, dp[1], deepT); b = mix(b, dp[2], deepT);
          if (sh.hi) { const hiT = sstep(0.0, 0.04, ndl - (m.hiAt || 0.78)) * lit; r = mix(r, sh.hi[0], hiT); g = mix(g, sh.hi[1], hiT); b = mix(b, sh.hi[2], hiT); }
          if (sh.spec) {
            const hx = L[0] + vx, hy = L[1] + vy, hz = L[2] + vz; const hl = sqrt(hx * hx + hy * hy + hz * hz); const ndh = (nx * hx + ny * hy + nz * hz) / hl;
            const sp = sstep(0.0, 0.015, ndh - (m.specAt || 0.985)) * sh.spec; r = mix(r, 1, sp); g = mix(g, 1, sp); b = mix(b, 1, sp);
          }
          const rimC = sh.rim !== undefined ? sh.rim : P.rimColor; if (rimC) {
            const fres = 1 - max(nx * vx + ny * vy + nz * vz, 0); const rl = nx * RL[0] + ny * RL[1] + nz * RL[2];
            const rm = sstep(0.62, 0.68, fres) * sstep(0.05, 0.2, rl) * (m.rimAmt != null ? m.rimAmt : (P.rimAmt || 0.85));
            r = mix(r, rimC[0], rm); g = mix(g, rimC[1], rm); b = mix(b, rimC[2], rm);
          }
        }
        if (sh.emit) { emi[3 * k] = sh.emit[0]; emi[3 * k + 1] = sh.emit[1]; emi[3 * k + 2] = sh.emit[2]; r += sh.emit[0] * (m.emitAdd != null ? m.emitAdd : 0.5); g += sh.emit[1] * (m.emitAdd != null ? m.emitAdd : 0.5); b += sh.emit[2] * (m.emitAdd != null ? m.emitAdd : 0.5); }
        col[4 * k] = r; col[4 * k + 1] = g; col[4 * k + 2] = b; col[4 * k + 3] = sh.alpha;
        const lc = sh.line || m.line || E.lineOf(sh.base); lin[3 * k] = lc[0]; lin[3 * k + 1] = lc[1]; lin[3 * k + 2] = lc[2];
      }
    }
    return { j0, j1, hit, dep, nrm, col, emi, lin };
  };

  // merge traced row-blocks, ink outline pass, downsample
  E.finish = function (S, view, parts) {
    const P = S.params; const ss = view.ss || 2, W = Math.round(view.w * ss), H = Math.round(view.h * ss), N = W * H;
    view.cam = camera(view); const FAR = 40 * (P.size || 1);
    const hit = new Int16Array(N), dep = new Float32Array(N), nrm = new Float32Array(N * 3), col = new Float32Array(N * 4), emi = new Float32Array(N * 3), lin = new Float32Array(N * 3);
    for (const p of parts) { const o = p.j0 * W; hit.set(p.hit, o); dep.set(p.dep, o); nrm.set(p.nrm, o * 3); col.set(p.col, o * 4); emi.set(p.emi, o * 3); lin.set(p.lin, o * 3); }
    const outW = (view.lineOut || P.lineOut || 2.2) * ss * 0.75, inW = (view.lineIn || P.lineIn || 1.3) * ss * 0.7;
    const dTh = (P.depthEdge || 0.035) * (P.size || 1); const cTh = P.crease != null ? P.crease : 0.35;
    const dirs = []; for (let a = 0; a < 12; a++) dirs.push([Math.cos(a * Math.PI / 6), Math.sin(a * Math.PI / 6)]);
    const ink = new Float32Array(N);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i; const mk = hit[k]; if (!mk) continue; const mt = S.mats[mk]; if (mt.noLine) continue;
      let e = 0;
      // silhouette (outer) — thicker
      for (const [dx, dy] of dirs) { const ii = Math.round(i + dx * outW), jj = Math.round(j + dy * outW); if (ii < 0 || jj < 0 || ii >= W || jj >= H || !hit[jj * W + ii]) { e = 1; break; } }
      if (!e) for (const [dx, dy] of dirs) {
        const ii = Math.round(i + dx * inW), jj = Math.round(j + dy * inW); const q = jj * W + ii; const mq = hit[q]; if (!mq) continue;
        if (dep[q] - dep[k] > dTh) { e = max(e, 0.95); break; }
        const mtq = S.mats[mq];
        if (mq !== mk && (mtq.grp || 0) !== (mt.grp || 0) && !(mt.noPartLine || mtq.noPartLine)) { if (dep[k] <= dep[q] + dTh * 0.3 && (dep[k] < dep[q] - 1e-4 || mk < mq)) e = max(e, 0.85); }
        if (!mt.noCrease) { const dn = nrm[3 * k] * nrm[3 * q] + nrm[3 * k + 1] * nrm[3 * q + 1] + nrm[3 * k + 2] * nrm[3 * q + 2]; if (dn < cTh && dep[q] > dep[k] - dTh) e = max(e, 0.8); }
      }
      if (e > 0) ink[k] = e * (mt.lineAlpha != null ? mt.lineAlpha : 1);
    }
    const w = view.w, hgt = view.h; const img = new Uint8ClampedArray(w * hgt * 4); const glow = new Float32Array(w * hgt * 3); const mask = new Uint8Array(w * hgt); const ids = new Int16Array(w * hgt);
    const inv = 1 / (ss * ss);
    for (let j = 0; j < hgt; j++) for (let i = 0; i < w; i++) {
      let r = 0, g = 0, b = 0, a = 0, gr = 0, gg = 0, gb = 0, cnt = 0, idv = 0;
      for (let y = 0; y < ss; y++) for (let x = 0; x < ss; x++) {
        const k = (j * ss + y) * W + (i * ss + x); if (!hit[k]) continue; idv = hit[k];
        const al = col[4 * k + 3]; let cr = col[4 * k], cg = col[4 * k + 1], cb = col[4 * k + 2]; const e = ink[k];
        if (e) { cr = mix(cr, lin[3 * k], e); cg = mix(cg, lin[3 * k + 1], e); cb = mix(cb, lin[3 * k + 2], e); }
        const al2 = e ? max(al, e) : al;
        r += cr * al2; g += cg * al2; b += cb * al2; a += al2; gr += emi[3 * k]; gg += emi[3 * k + 1]; gb += emi[3 * k + 2]; cnt++;
      }
      const o = (j * w + i) * 4;
      if (a > 0) { img[o] = r / a * 255; img[o + 1] = g / a * 255; img[o + 2] = b / a * 255; img[o + 3] = a * inv * 255; }
      glow[(j * w + i) * 3] = gr * inv; glow[(j * w + i) * 3 + 1] = gg * inv; glow[(j * w + i) * 3 + 2] = gb * inv;
      mask[j * w + i] = Math.round(cnt * inv * 255); ids[j * w + i] = idv;
    }
    const depth = new Float32Array(w * hgt).fill(1e9);
    for (let j = 0; j < hgt; j++) for (let i = 0; i < w; i++) { const k = (j * ss + (ss >> 1)) * W + i * ss + (ss >> 1); if (hit[k]) depth[j * w + i] = dep[k]; }
    return { w, h: hgt, img, glow, mask, depth, ids, view, FAR };
  };
  E.render = (S, view) => E.finish(S, view, [E.trace(S, view, 0)]);

  // parallel render with Web Workers. key = {who, no, variant}; falls back to single-thread
  E.workers = null;
  E.initWorkers = (n, scripts) => {
    try { E.workers = []; for (let i = 0; i < n; i++) { const w = new Worker(scripts.worker); w.postMessage({ init: scripts.libs }); E.workers.push(w); } } catch (e) { E.workers = null; }
  };
  let JOB = 0;
  E.renderPar = (S, view, key) => {
    if (!E.workers || !key) return Promise.resolve(E.render(S, view));
    const ss = view.ss || 2, H = Math.round(view.h * ss); const n = E.workers.length; const rowsPer = 8; const jobs = [];
    const v = Object.assign({}, view); delete v.cam;
    for (let j = 0; j < H; j += rowsPer) jobs.push([j, Math.min(H, j + rowsPer)]);
    return new Promise((res, rej) => {
      const parts = []; let next = 0, done = 0; const id = ++JOB;
      const feed = (w) => { if (next >= jobs.length) return; const [a, b] = jobs[next++]; w.postMessage({ id, key, view: v, j0: a, j1: b }); };
      E.workers.forEach((w) => {
        w.onmessage = (ev) => { const m = ev.data; if (m.error) { rej(new Error(m.error)); return; } if (m.id !== id) return; parts.push(m.part); done++; if (done === jobs.length) res(E.finish(S, view, parts)); else feed(w); };
        feed(w); feed(w);
      });
    });
  };

  // view-space depth of a world point (distance along the ray from the ray origin plane), for overlay occlusion
  E.depthOf = (R, x, y, z) => { const c = R.view.cam; const dx = x - R.view.cx, dy = y - R.view.cy, dz = z - (R.view.cz || 0); return R.FAR - (dx * c.b[0] + dy * c.b[1] + dz * c.b[2]); };
  E.visible = (R, x, y, z, tol = 0.02) => { const p = E.project(R.view, x, y, z); const i = Math.round(p[0]), j = Math.round(p[1]); if (i < 0 || j < 0 || i >= R.w || j >= R.h) return false; return E.depthOf(R, x, y, z) <= R.depth[j * R.w + i] + tol; };

  // to a canvas (with optional glow pass)
  E.toCanvas = (R, opts = {}) => {
    const c = document.createElement('canvas'); c.width = R.w; c.height = R.h; const g = c.getContext('2d');
    g.putImageData(new ImageData(R.img, R.w, R.h), 0, 0);
    return c;
  };
  E.glowCanvas = (R, gain = 1) => {
    const c = document.createElement('canvas'); c.width = R.w; c.height = R.h; const g = c.getContext('2d'); const id = g.createImageData(R.w, R.h);
    for (let i = 0; i < R.w * R.h; i++) { const r = R.glow[3 * i] * gain, gg = R.glow[3 * i + 1] * gain, b = R.glow[3 * i + 2] * gain; const m = max(r, gg, b); if (m <= 0) continue; id.data[4 * i] = r / m * 255; id.data[4 * i + 1] = gg / m * 255; id.data[4 * i + 2] = b / m * 255; id.data[4 * i + 3] = clamp(m, 0, 1) * 255; }
    g.putImageData(id, 0, 0); return c;
  };
  E.silCanvas = (R, colour = '#000') => {
    const c = document.createElement('canvas'); c.width = R.w; c.height = R.h; const g = c.getContext('2d'); const id = g.createImageData(R.w, R.h); const rgb = hex(colour);
    for (let i = 0; i < R.w * R.h; i++) { id.data[4 * i] = rgb[0] * 255; id.data[4 * i + 1] = rgb[1] * 255; id.data[4 * i + 2] = rgb[2] * 255; id.data[4 * i + 3] = R.mask[i]; }
    g.putImageData(id, 0, 0); return c;
  };

  // ------------------------------------------------------------------ 2D curve helpers (profiles)
  // sample cubic bezier segments into flat point list: segs = [[p0,c1,c2,p1], ...]
  E.bez = (pts, n = 10) => { // pts: [x0,y0, c1x,c1y, c2x,c2y, x1,y1, c1x,... ] chained cubic
    const out = []; for (let s = 0; s + 7 < pts.length; s += 6) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = pts.slice(s, s + 8);
      for (let i = s === 0 ? 0 : 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3); }
    }
    return out;
  };

  G.SDF = E;
})(typeof window !== 'undefined' ? window : self);

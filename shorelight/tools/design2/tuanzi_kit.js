// 彼岸燈 Shorelight — design pass v2 — 糰子 (Tuanzi): Formosan leopard-cat (石虎) model kit
// Shared builders for the 10 options: head (with real 石虎 face markings painted as texture), ears with
// white back-spots, spotted coat (Worley), ringed tail, eyes as painted decals on an eye bulge.
'use strict';
(function (G) {
  const E = G.SDF; const { hex, mix, clamp, sstep, cmix } = E;
  const K = {};
  const sq = Math.sqrt, ab = Math.abs;

  // ---------------------------------------------------------------- palettes
  K.coat = {
    base: '#C49A62', baseDark: '#9A7448', spot: '#3B2A1E', white: '#F3ECDD', earBack: '#2B2320', nose: '#B86A5A', inner: '#D9B3A2',
  };

  // ---------------------------------------------------------------- head
  // o: { R, pos:[x,y,z], rot:[rx,ry,rz], cheek (0..1 chubbiness), earSize, earTilt, earY, muzzle, eye:{...}, mats:{face,ear,nose}, style }
  K.head = function (S, o) {
    const R = o.R; const ch = o.cheek != null ? o.cheek : 0.6; const es = o.earSize || 1; const mz = o.muzzle || 1;
    const F = o.mats.face, EA = o.mats.ear, NO = o.mats.nose;
    const parts = [];
    parts.push(S.ell(F, 0, 0.02 * R, -0.02 * R, R * (o.skullW || 1.0), R * (o.skullH || 0.86), R * 0.9));
    // cheeks (fat jowls) — the 糰子 shape
    parts.push(S.mx(S.ell(F, R * (0.36 + 0.06 * ch), -R * (0.26 + 0.04 * ch), R * 0.16, R * (0.5 + 0.14 * ch), R * (0.4 + 0.08 * ch), R * 0.5)));
    // muzzle pads + chin
    parts.push(S.mx(S.sphere(F, R * 0.15 * mz, -R * 0.3, R * (0.7 + 0.04 * mz), R * 0.2 * mz)));
    parts.push(S.sphere(F, 0, -R * 0.47, R * 0.6, R * 0.14 * mz));
    // eye bulges
    const ey = o.eye || {}; const ex = (ey.x || 0.37) * R, eyy = (ey.y || 0.04) * R, ez = (ey.z || 0.66) * R;
    parts.push(S.mx(S.ell(F, ex, eyy, ez, R * (ey.bw || 0.26), R * (ey.bh || 0.25), R * 0.15)));
    // cheek fur tufts (toon spikes) — modelled as a few flattened cones
    const tufts = [];
    if (o.tufts !== false) {
      const tw = R * (0.82 + 0.1 * ch);
      for (const [ty, tl, ang] of (o.tuftList || [[-0.1, 0.24, 12], [-0.3, 0.27, -10], [-0.5, 0.2, -36]])) {
        const a = ang * Math.PI / 180; const bx = tw - 0.08 * R, by = ty * R; const tx = bx + Math.cos(a) * tl * R, tyy = by + Math.sin(a) * tl * R;
        tufts.push(S.cone(F, bx - 0.1 * R, by, 0.05 * R, tx, tyy, 0.02 * R, 0.14 * R * (o.tuftW || 1), 0.01 * R));
      }
    }
    let headN = S.su(R * 0.18, ...parts);
    if (tufts.length) headN = S.su(R * 0.06, headN, S.mx(S.u(...tufts)));
    // nose
    const nose = S.ell(NO, 0, -R * 0.15, R * (0.86 + 0.03 * mz), R * 0.11, R * 0.075, R * 0.07);
    headN = S.su(R * 0.03, headN, nose);
    // ears (rounded, cupped)
    const eY = (o.earY || 0.66), eX = (o.earX || 0.56);
    const earC = [R * eX, R * eY, -R * 0.1]; const earRot = [o.earPitch || -8, o.earYaw != null ? o.earYaw : 22, -(o.earTilt != null ? o.earTilt : 24)];
    const earShape = S.sub(S.ell(EA, 0, 0, 0, R * 0.33 * es, R * 0.37 * es, R * 0.1 * es), S.ell(EA, 0, R * 0.04 * es, R * 0.1 * es, R * 0.24 * es, R * 0.27 * es, R * 0.09 * es), R * 0.02);
    const ear = S.t(S.r(S.t(earShape, 0, R * 0.12 * es, 0), 0, 0, 0, ...earRot), ...earC);
    headN = S.su(R * 0.08, headN, S.mx(ear));
    if (o.extra) headN = o.extra(headN);
    const node = S.bound(S.t(S.r(headN, 0, 0, 0, ...(o.rot || [0, 0, 0])), ...o.pos), ...o.pos, R * 2.1);
    // frames for texture
    const hf = E.frame(...o.pos, ...(o.rot || [0, 0, 0])); const hfn = E.frame(0, 0, 0, ...(o.rot || [0, 0, 0]));
    const ef = E.frame(...earC, ...earRot); const efn = E.frame(0, 0, 0, ...earRot);
    return { node, R, hf, hfn, ef, efn, earY: R * 0.12 * es, es, ex, eyy, ez, o };
  };

  // eye decal shading in head-local normalised coords. returns true if painted
  // eye: {x,y,z, w,h, yaw, tilt, lid (0 open..1 closed), lower, iris:[c1,c2], pupil:'slit'|'round'|'dot', pw, look:[u,v], shape:'round'|'almond'|'happy'|'closed'|'spiral', liner, white}
  K.eyePaint = function (q, R, eye, sh, c) {
    const ex = (eye.x || 0.37), ey = (eye.y || 0.04), ez = (eye.z || 0.66);
    const s = q[0] >= 0 ? 1 : -1; const x = q[0] / R, y = q[1] / R, z = q[2] / R;
    const a = (eye.yaw || 28) * Math.PI / 180; const ca = Math.cos(a), sa = Math.sin(a);
    const dx = x - s * ex, dy = y - ey, dz = z - ez;
    const w = dx * s * sa + dz * ca; if (w < -0.2) return false;
    let u = (dx * s * ca - dz * sa) / (eye.w || 0.22), v = dy / (eye.h || 0.22);
    v -= (eye.tilt || 0.12) * u; // outer corner lift
    const r = sq(u * u + v * v);
    const shape = eye.shape || 'round';
    if (r > 1.45) return false;
    const liner = c.liner || [0.13, 0.09, 0.07];
    if (shape === 'happy' || shape === 'closed') { // ^ ^ arcs
      const arcY = shape === 'happy' ? -0.15 + 0.55 * (1 - u * u) : -0.1 - 0.25 * (1 - u * u);
      const dd = ab(v - arcY); if (ab(u) < 1.0 && dd < 0.16) { sh.base = liner; sh.shade = liner; sh.noShadeLocal = true; return true; }
      if (r < 1.25 && v < arcY) { return 'rim'; }
      return false;
    }
    const lid = 1 - 2 * (eye.lid || 0); const lower = -1 + 2 * (eye.lower || 0);
    const inside = r < 1 && v < lid && v > lower;
    const lw = eye.liner != null ? eye.liner : 0.16;
    if (inside) {
      const nearTop = v > lid - lw * 1.3 || (r > 1 - lw && v > 0);
      const nearEdge = r > 1 - lw * 0.55 || v < lower + lw * 0.45;
      if (nearTop) { sh.base = liner; sh.shade = liner; return true; }
      if (nearEdge) { sh.base = cmix(liner, [0.35, 0.25, 0.2], 0.4); sh.shade = sh.base; return true; }
      // iris & pupil
      const lu = (eye.look ? eye.look[0] : 0), lv = (eye.look ? eye.look[1] : 0);
      const iu = u - lu, iv = v - lv; const ir = sq(iu * iu + iv * iv);
      const ic = c.iris || [hex('#D9B23A'), hex('#7FA046')];
      let col = cmix(ic[0], ic[1], clamp(ir * 1.1 - 0.05 + (iv < 0 ? 0 : iv * 0.3), 0, 1));
      if (ir > 0.85) col = cmix(col, liner, 0.5);
      const pt = eye.pupil || 'slit'; const pw = eye.pw || 0.22;
      let pd = 9; if (pt === 'slit') pd = sq((iu / pw) ** 2 + (iv / 0.82) ** 2); else if (pt === 'round') pd = sq(iu * iu + iv * iv) / pw; else if (pt === 'dot') pd = sq(iu * iu + iv * iv) / (pw * 0.6);
      if (pd < 1) col = c.pupil || [0.08, 0.06, 0.06];
      if (eye.ring && ir > 0.55 && ir < 0.62) col = cmix(col, [1, 1, 1], 0.6);
      // highlights (painted, toon style)
      const h1 = sq((u - 0.32) ** 2 + (v - 0.38) ** 2), h2 = sq((u + 0.28) ** 2 + (v + 0.4) ** 2);
      if (h1 < (eye.hl || 0.24)) col = [1, 1, 0.97]; else if (h2 < (eye.hl || 0.24) * 0.45) col = [0.95, 0.97, 1];
      sh.base = col; sh.shade = cmix(col, [0.1, 0.08, 0.1], 0.25); sh.spec = 0; sh.rim = null; return true;
    }
    const rimR = eye.rimR || 1.2; if (r < rimR && v > lower - 0.3 && v < lid + 0.3 && (v < 0.15 || u < -0.35 || eye.fullRim)) return 'rim';
    return false;
  };

  // head marking paint (石虎): returns colour or null; q head-local, R radius
  // o.lineW scales stripe widths (stylisation), o.simple drops the faint crown pair
  K.faceMarks = function (q, R, c, o = {}) {
    const x = q[0] / R, y = q[1] / R, z = q[2] / R; const ax = ab(x); const lw = o.lineW || 1;
    const W = c.white, D = c.spot;
    // muzzle + chin white: union of soft ellipses around the whisker pads
    if (z > 0.25) {
      const m1 = ((ax - 0.13) / 0.3) ** 2 + ((y + 0.33) / 0.2) ** 2; const m2 = (x / 0.3) ** 2 + ((y + 0.5) / 0.2) ** 2;
      const mo = K.mouth(ax, y, x, o.mouth || 'w', c, lw);
      if (mo) return mo;
      if (m1 < 1 || m2 < 1) {
        if (ax < 0.022 * lw && y > -0.42 && y < -0.22 && z > 0.8 && o.philtrum !== false) return cmix(D, c.base, 0.35);
        if (o.whiskerDots !== false && z > 0.62) for (const [wx, wy] of [[0.2, -0.27], [0.28, -0.3], [0.22, -0.35], [0.31, -0.24]]) if ((ax - wx) ** 2 + (y - wy) ** 2 < 0.0008) return cmix(D, c.base, 0.35);
        return W;
      }
    }
    // white ring under/around the eyes is painted by the eye decal ('rim')
    // forehead: dark | white | dark | white | dark — white lines start at the inner eye corners
    const back = Math.max(0, -z);
    const lx = ax / (1 + back * 0.35);
    const onTop = y > 0.16 || (z < 0.15 && y > -0.35);
    if (onTop) {
      const fade = sstep(0.95, 0.75, y + back * 0.9); // white lines fade over the crown
      if (lx < 0.03 * lw) return D;
      if (lx > 0.075 && lx < 0.075 + 0.05 * lw && z > 0.05 && fade > 0.5) return W;
      if (lx > 0.155 && lx < 0.155 + 0.045 * lw) return D;
      if (!o.simple && lx > 0.29 && lx < 0.29 + 0.03 * lw && (y > 0.45 || z < 0.2)) return cmix(D, c.base, 0.25);
    }
    // cheek: dark line from outer eye corner back toward the ear, a second lower; white line between
    if (z > -0.3 && y < 0.12 && ax > 0.4) {
      const d1 = segD(ax, y, 0.6, -0.03, 1.0, -0.17), d2 = segD(ax, y, 0.5, -0.38, 0.92, -0.5);
      if (d1 < 0.035 * lw || d2 < 0.033 * lw) return D;
      if (segD(ax, y, 0.56, -0.2, 0.95, -0.33) < 0.045 * lw) return W;
    }
    return null;
  };
  // mouth paint in head-normalised coords (front of muzzle). kinds: w | smile | open | o | chew | flat
  K.mouth = function (ax, y, x, kind, c, lw = 1) {
    const D = c.mouthLine || c.spot; const t = 0.02 * lw;
    if (kind === 'none') return null;
    if (kind === 'open' || kind === 'o' || kind === 'shout') {
      const rx = kind === 'o' ? 0.07 : kind === 'shout' ? 0.17 : 0.13, ry = kind === 'o' ? 0.07 : kind === 'shout' ? 0.14 : 0.09, cy = kind === 'shout' ? -0.53 : -0.49;
      const e = (x / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e < 1) { if (e > 0.72) return D; if (y < cy - ry * 0.25) return c.tongue || [0.86, 0.45, 0.45]; return c.mouthIn || [0.42, 0.13, 0.14]; }
      if (ax < 0.02 * lw && y > cy + ry - 0.01 && y < -0.24) return D;
      return null;
    }
    const r = kind === 'smile' ? 0.12 : 0.09, cy = kind === 'smile' ? -0.36 : -0.4; const cx = r;
    const d = Math.sqrt((ax - cx) ** 2 + (y - cy) ** 2);
    if (y < cy + 0.005 && Math.abs(d - r) < t && ax < cx * 2) return D;
    if (kind === 'chew' && y < cy - 0.02 && y > cy - 0.1 && ax < 0.05) return c.tongue || [0.86, 0.45, 0.45];
    if (kind === 'flat' && Math.abs(y - (cy - 0.05)) < t && ax < 0.14) return D;
    return null;
  };

  function segD(px, py, ax, ay, bx, by) { const ex = bx - ax, ey = by - ay; const t = clamp(((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey), 0, 1); return sq((px - ax - ex * t) ** 2 + (py - ay - ey * t) ** 2); }
  K.segD = segD;

  // default face texture factory
  K.faceTex = function (H, c, eye, opt = {}) {
    const R = H.R;
    return (x, y, z, nx, ny, nz, sh) => {
      const q = H.hf(x, y, z); const qq = [q[0], q[1], q[2]];
      const e = K.eyePaint(qq, R, Object.assign({ x: H.ex / R, y: H.eyy / R, z: H.ez / R }, eye), sh, c);
      if (e === true) return;
      if (e === 'rim') { sh.base = c.white; sh.shade = c.whiteShade || E.shadeOf(c.white, 0.82); return; }
      const m = K.faceMarks(qq, R, c, opt);
      let base = c.base; if (opt.noise !== false) base = cmix(c.base, c.baseDark, E.fbm(x * 30, y * 30, z * 30, 2) * 0.5);
      sh.base = m || base; if (m === c.white) sh.shade = c.whiteShade || E.shadeOf(c.white, 0.82);
      if (opt.post) opt.post(qq, sh, nx, ny, nz);
    };
  };
  K.earTex = function (H, c, o = {}) {
    const R = H.R;
    return (x, y, z, nx, ny, nz, sh) => {
      const q = H.hf(x, y, z); const s = q[0] >= 0 ? 1 : -1; const qx = q[0] * s, qy = q[1], qz = q[2];
      const nn = H.hfn(nx, ny, nz); const nhx = nn[0] * s, nhy = nn[1], nhz = nn[2];
      const e = H.ef(qx, qy, qz); const ex = e[0], ey = e[1] - H.earY, ez = e[2]; const en = H.efn(nhx, nhy, nhz); const enz = en[2];
      const es = H.es;
      if (enz < 0.15 && ez < 0.02 * R) { // back of ear: black with the white ocellus spot
        const d = sq((ex / (0.15 * R * es)) ** 2 + ((ey - 0.03 * R * es) / (0.13 * R * es)) ** 2);
        const wsp = o.spot || c.white;
        sh.base = d < 1 ? wsp : c.earBack; sh.shade = d < 1 ? E.shadeOf(wsp, 0.8) : E.shadeOf(c.earBack, 0.8); sh.rim = d < 1 ? null : cmix(c.earBack, c.base, 0.6); return;
      }
      // inner cup: pale with darker centre and a soft white fringe
      const t = sq((ex / (0.24 * R * es)) ** 2 + ((ey - 0.04 * R * es) / (0.27 * R * es)) ** 2);
      if (t < 1.05) { sh.base = cmix(c.inner, cmix(c.inner, c.earBack, 0.35), sstep(0.85, 0.2, t)); if (t > 0.72 && t < 1.05 && ey < 0.05 * R) sh.base = c.white; sh.shade = E.shadeOf(sh.base, 0.78); sh.rim = null; return; }
      sh.base = cmix(c.earBack, c.base, 0.5); sh.shade = E.shadeOf(sh.base, 0.75);
    };
  };

  // body spot texture. fn returns [col] or null. p world; ctx: {white(x,y,z)->0..1 belly mask, scale, aniso:[ax,ay,az], stripeNape(x,y,z)->bool}
  K.spotTex = function (c, o) {
    const f = o.freq || [9, 8, 7]; const thr = o.thr || 0.3;
    return (x, y, z, nx, ny, nz, sh) => {
      const wm = o.white ? o.white(x, y, z, nx, ny, nz) : 0;
      let base = cmix(c.base, c.baseDark, E.fbm(x * 18, y * 18, z * 18, 2) * 0.45 + (o.backDark ? o.backDark(x, y, z) : 0));
      base = cmix(base, c.white, wm);
      if (o.nape && o.nape(x, y, z, sh)) return;
      const W = E.worley(x * f[0] + 3.1, y * f[1] + 1.7, z * f[2] + 5.3, 0.85);
      const size = (o.spotSize || 0.3) * (0.7 + W.id * 0.6) * (1 - wm * 0.45) * (o.sizeAt ? o.sizeAt(x, y, z, nx, ny, nz) : 1);
      let spot = W.id > (o.gap || 0.12) && W.d < size;
      // rosette-ish broken spots for some cells
      if (spot && o.rosette && W.id > 0.7 && W.d < size * 0.45) spot = false, base = cmix(base, c.baseDark, 0.6);
      sh.base = spot ? cmix(c.spot, base, wm * 0.25) : base;
      if (!spot && wm > 0.5) sh.shade = c.whiteShade || E.shadeOf(c.white, 0.82);
      if (o.post) o.post(x, y, z, nx, ny, nz, sh);
    };
  };
  // tail rings along a polyline [[x,y,z,r],...]
  K.tailTex = function (c, pts, o = {}) {
    const segL = []; let tot = 0; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const l = sq((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2); segL.push(l); tot += l; }
    return (x, y, z, nx, ny, nz, sh) => {
      let best = 9, bt = 0, acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2]; const l2 = ex * ex + ey * ey + ez * ez;
        const t = clamp(((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / l2, 0, 1); const d = (x - a[0] - ex * t) ** 2 + (y - a[1] - ey * t) ** 2 + (z - a[2] - ez * t) ** 2;
        if (d < best) { best = d; bt = (acc + t * segL[i]) / tot; } acc += segL[i];
      }
      const n = o.rings || 7; const tipT = o.tip || 0.88; const ringFrom = o.from || 0.35;
      let base = cmix(c.base, c.baseDark, E.fbm(x * 18, y * 18, z * 18, 2) * 0.4);
      if (o.under) base = cmix(base, c.white, o.under(x, y, z, bt));
      let col = base;
      if (bt > tipT) col = c.spot;
      else if (bt > ringFrom) { const ph = ((bt - ringFrom) / (tipT - ringFrom)) * (n - 0.5); if (ph % 1 > 0.55) col = c.spot; }
      else { const W = E.worley(x * 11, y * 11, z * 11, 0.8); if (W.id > 0.2 && W.d < 0.28) col = c.spot; }
      sh.base = col; if (o.post) o.post(x, y, z, bt, sh);
    };
  };

  // whiskers as 2D overlay strokes from 3D anchors. side views handled by visibility test
  K.whiskers = function (g, R, H, o = {}) {
    const col = o.col || 'rgba(255,250,240,0.9)'; const k = R.w / 300;
    const hf = H; // head info
    const pts = [];
    for (const s of [-1, 1]) for (const [wy, ang, len] of [[-0.26, 10, 1.25], [-0.31, -4, 1.35], [-0.36, -18, 1.15]]) {
      const lx = s * 0.26 * H.R, ly = wy * H.R, lz = 0.78 * H.R; const a = ang * Math.PI / 180;
      const ex = s * (0.26 + Math.cos(a) * len) * H.R, ey = (wy + Math.sin(a) * len) * H.R, ez = (0.78 - 0.45 * len) * H.R;
      pts.push([lx, ly, lz, ex, ey, ez]);
    }
    const toW = (lx, ly, lz) => { // head-local → world (rot then translate)
      const m = E.rotM(...(H.o.rot || [0, 0, 0])); return [m[0] * lx + m[1] * ly + m[2] * lz + H.o.pos[0], m[3] * lx + m[4] * ly + m[5] * lz + H.o.pos[1], m[6] * lx + m[7] * ly + m[8] * lz + H.o.pos[2]];
    };
    g.save(); g.lineCap = 'round';
    for (const [lx, ly, lz, ex, ey, ez] of pts) {
      const A = toW(lx, ly, lz), B = toW(ex, ey, ez), Mx = toW((lx + ex) / 2, (ly + ey) / 2 + 0.06 * H.R, (lz + ez) / 2 + 0.05 * H.R);
      if (!E.visible(R, A[0], A[1], A[2], 0.03 * H.R)) continue;
      const a = E.project(R.view, ...A), b = E.project(R.view, ...B), m = E.project(R.view, ...Mx);
      g.strokeStyle = o.dark || 'rgba(40,30,25,0.55)'; g.lineWidth = Math.max(1, R.view.scale * 0.006) + 0.6;
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(m[0], m[1], b[0], b[1]); g.stroke();
      g.strokeStyle = col; g.lineWidth = Math.max(0.6, R.view.scale * 0.004);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(m[0], m[1], b[0], b[1]); g.stroke();
    }
    g.restore();
  };

  K.mats = function (S, c, extra = {}) {
    const lineFur = hex(extra.line || '#3A2617');
    S.mat('face', Object.assign({ base: hex(c.base), line: lineFur, grp: 1, rim: hex(extra.rimCol || '#FFE9C8'), hi: null }, extra.face || {}));
    S.mat('ear', Object.assign({ base: hex(c.earBack), line: hex('#1C1512'), grp: 1 }, extra.ear || {}));
    S.mat('nose', { base: hex(c.nose), line: hex('#5A2A22'), grp: 2, spec: 0.9, specAt: 0.97, hi: null });
    S.mat('fur', Object.assign({ base: hex(c.base), line: lineFur, grp: 1, rim: hex(extra.rimCol || '#FFE9C8') }, extra.fur || {}));
    S.mat('tail', Object.assign({ base: hex(c.base), line: lineFur, grp: 1, rim: hex(extra.rimCol || '#FFE9C8') }, extra.tail || {}));
    S.mat('paw', { base: hex(c.white), line: lineFur, grp: 1, rim: hex(extra.rimCol || '#FFE9C8') });
  };
  K.cols = (c) => { const o = {}; for (const k in c) o[k] = Array.isArray(c[k]) ? c[k] : hex(c[k]); return o; };

  // bounds helper: AABB from list of [x,y,z,r]
  K.aabb = (list, pad = 0.03) => { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const [x, y, z, r] of list) { b[0] = Math.min(b[0], x - r); b[1] = Math.min(b[1], y - r); b[2] = Math.min(b[2], z - r); b[3] = Math.max(b[3], x + r); b[4] = Math.max(b[4], y + r); b[5] = Math.max(b[5], z + r); } for (let i = 0; i < 3; i++) { b[i] -= pad; b[i + 3] += pad; } return b; };

  G.TZK = K;
})(window);

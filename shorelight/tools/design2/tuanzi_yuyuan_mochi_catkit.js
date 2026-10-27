// 彼岸燈 Shorelight — design pass v2 — shared cat kit for the three pets
//   糰子 Tuanzi (石虎 Formosan leopard-cat spirit) · 芋圓 Yuyuan (blue-grey tabby) · 麻糬 Mochi (long-haired dilute calico)
// An anatomical cat rig for the SDF toon renderer: pose library (joint positions → limb segments with scapula /
// haunch masses, paws with toe beans), skull with cheek/jowl, whisker pads, triangular or rounded cupped ears,
// painted eyes; three coat painters; fur-clump displacement for long hair; a library of culturally grounded charms.
'use strict';
(function (G) {
  const E = G.SDF; const { hex, mix, clamp, sstep, cmix } = E;
  const sq = Math.sqrt, ab = Math.abs;
  const C = {};
  const cv = (v) => (typeof v === 'string' ? hex(v) : Array.isArray(v) && typeof v[0] === 'string' ? v.map(hex) : v);
  C.cols = (c) => { const o = {}; for (const k in c) o[k] = cv(c[k]); return o; };
  function segD(px, py, ax, ay, bx, by) { const ex = bx - ax, ey = by - ay; const t = clamp(((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey), 0, 1); return sq((px - ax - ex * t) ** 2 + (py - ay - ey * t) ** 2); }
  C.segD = segD;

  // ================================================================== coats
  C.COATS = {
    leopard: { base: '#C49A62', baseDark: '#9A7448', spot: '#3B2A1E', white: '#F3ECDD', earBack: '#2B2320', nose: '#B8695B', inner: '#D7B1A0', iris: ['#E9C752', '#93A44C'], line: '#3A2617', rim: '#FFEBC8' },
    tabby: { base: '#8E97A3', baseDark: '#717A87', tick: '#C3CAD3', spot: '#545C69', white: '#E3E5E8', earBack: '#7D8692', nose: '#C98884', inner: '#E2AAA6', iris: ['#C6C25A', '#7E8E36'], line: '#2E3440', rim: '#F2F6FF' },
    calico: { base: '#F5F2EC', baseDark: '#E3DED6', grey: '#9BA3AE', greyDark: '#7F8894', cream: '#EBC79D', creamDark: '#D9AE80', white: '#F7F4EF', earBack: '#9BA3AE', nose: '#EC9FA8', inner: '#EDB3B3', iris: ['#D8E05A', '#8DB43A'], line: '#4A4450', rim: '#FFFFFF' },
  };

  // ================================================================== head
  // o: { R, pos, rot, ear:'round'|'tri', earSize, earFlare, lynx, cheek (0..1.4), muzzle, skullW, eye:{x,y,z,bw,bh}, mats:{face,ear,nose}, tufts, fluff }
  C.head = function (S, o) {
    const R = o.R; const ch = o.cheek != null ? o.cheek : 0.6; const mz = o.muzzle || 1; const F = o.mats.face, EA = o.mats.ear, NO = o.mats.nose;
    const parts = [];
    parts.push(S.ell(F, 0, 0.04 * R, -0.04 * R, R * (o.skullW || 1), R * (o.skullH || 0.86), R * 0.9));
    parts.push(S.mx(S.ell(F, R * (0.36 + 0.07 * ch), -R * (0.22 + 0.05 * ch), R * 0.14, R * (0.5 + 0.14 * ch), R * (0.4 + 0.07 * ch), R * 0.48)));
    parts.push(S.ell(F, 0, -0.04 * R, 0.62 * R, 0.17 * R, 0.2 * R, 0.22 * R)); // nose bridge
    parts.push(S.mx(S.sphere(F, R * 0.14 * mz, -R * 0.3, R * (0.68 + 0.03 * mz), R * 0.185 * mz)));
    parts.push(S.ell(F, 0, -R * 0.46, R * 0.56, R * 0.14 * mz, R * 0.1, R * 0.12));
    const ey = o.eye || {}; const ex = (ey.x || 0.36) * R, eyy = (ey.y || 0.06) * R, ez = (ey.z || 0.64) * R;
    parts.push(S.mx(S.ell(F, ex, eyy, ez, R * (ey.bw || 0.24), R * (ey.bh || 0.22), R * 0.15)));
    let headN = S.su(R * 0.17, ...parts);
    if (o.tufts !== false) {
      const tw = R * (0.8 + 0.12 * ch); const tufts = [];
      for (const [ty, tl, ang] of (o.tuftList || [[-0.08, 0.2, 14], [-0.27, 0.25, -8], [-0.46, 0.2, -34]])) {
        const a = ang * Math.PI / 180; const bx = tw - 0.1 * R, by = ty * R;
        tufts.push(S.cone(F, bx - 0.1 * R, by, 0.04 * R, bx + Math.cos(a) * tl * R, by + Math.sin(a) * tl * R, 0.0, 0.13 * R * (o.tuftW || 1), 0.01 * R));
      }
      headN = S.su(R * 0.06, headN, S.mx(S.u(...tufts)));
    }
    headN = S.su(R * 0.03, headN, S.ell(NO, 0, -R * 0.15, R * (0.85 + 0.03 * mz), R * 0.1, R * 0.07, R * 0.065));
    // ears
    const es = o.earSize || 1; let ear, earC, earRot, earLen = 0;
    if (o.ear === 'round') {
      earC = [R * 0.56, R * 0.64, -R * 0.1]; earRot = [-8, 22, -(o.earTilt != null ? o.earTilt : 24)];
      const shp = S.sub(S.ell(EA, 0, 0, 0, R * 0.33 * es, R * 0.37 * es, R * 0.1 * es), S.ell(EA, 0, R * 0.04 * es, R * 0.1 * es, R * 0.24 * es, R * 0.27 * es, R * 0.09 * es), R * 0.02);
      ear = S.t(S.r(S.t(shp, 0, R * 0.12 * es, 0), 0, 0, 0, ...earRot), ...earC); earLen = R * 0.12 * es;
    } else {
      earC = [R * (o.earX || 0.46), R * (o.earY || 0.52), -R * 0.06]; earRot = [o.earBack != null ? -o.earBack : -12, o.earYaw != null ? o.earYaw : 24, -(o.earFlare != null ? o.earFlare : 20)];
      const L = R * 0.78 * es, rb = R * 0.36 * es, rt = R * 0.05 * es;
      const outer = S.ns(S.cone(EA, 0, 0, 0, 0, L, 0, rb, rt), 1, 1, 0.42);
      const cup = S.t(S.ns(S.cone(EA, 0, 0.06 * R, 0, 0, L * 0.9, 0, rb * 0.78, rt * 0.6), 1, 1, 0.34), 0, 0, 0.055 * R * es);
      let shp = S.sub(outer, cup, 0.012 * R);
      if (o.lynx) shp = S.su(0.02 * R, shp, S.cone(EA, 0, L * 0.92, -0.01 * R, 0.02 * R, L * (1.25 + 0.15 * o.lynx), -0.03 * R, 0.035 * R * es, 0.004 * R));
      ear = S.t(S.r(shp, 0, 0, 0, ...earRot), ...earC); earLen = L;
    }
    headN = S.su(R * 0.07, headN, S.mx(ear));
    if (o.fluff) headN = S.fluff(headN, o.fluff * R, 9 / R, { mask: (x, y, z) => 1, sharp: 2.5 });
    if (o.extra) headN = o.extra(headN);
    const rot = o.rot || [0, 0, 0];
    const node = S.bound(S.t(S.r(headN, 0, 0, 0, ...rot), ...o.pos), ...o.pos, R * (o.lynx ? 2.5 : 2.2));
    const H = { node, R, ex, eyy, ez, earC, earRot, earLen, es, o, ear: o.ear || 'tri' };
    H.hf = E.frame(...o.pos, ...rot); H.hfn = E.frame(0, 0, 0, ...rot); H.ef = E.frame(...earC, ...earRot); H.efn = E.frame(0, 0, 0, ...earRot);
    H.toW = (lx, ly, lz) => { const m = E.rotM(...rot); return [m[0] * lx + m[1] * ly + m[2] * lz + o.pos[0], m[3] * lx + m[4] * ly + m[5] * lz + o.pos[1], m[6] * lx + m[7] * ly + m[8] * lz + o.pos[2]]; };
    return H;
  };

  // ================================================================== eyes (painted decal on the eye bulge)
  // eye: {w,h,yaw,tilt,lid,lidL,lidR,lower,iris:[c1,c2],pupil:'slit'|'round'|'dot'|'spiral',pw,look:[u,v],shape:'round'|'happy'|'closed',liner,hl,flatLid}
  C.eyePaint = function (q, H, eye, sh, c) {
    const R = H.R; const s = q[0] >= 0 ? 1 : -1; const x = q[0] / R, y = q[1] / R, z = q[2] / R;
    const ex = H.ex / R, ey = H.eyy / R, ez = H.ez / R;
    const a = (eye.yaw || 28) * Math.PI / 180; const ca = Math.cos(a), sa = Math.sin(a);
    const dx = x - s * ex, dy = y - ey, dz = z - ez;
    const w = dx * s * sa + dz * ca; if (w < -0.2) return false;
    let u = (dx * s * ca - dz * sa) / (eye.w || 0.21), v = dy / (eye.h || 0.2);
    v -= (eye.tilt != null ? eye.tilt : 0.12) * u;
    const r = sq(u * u + v * v); if (r > 1.5) return false;
    const liner = c.liner || [0.12, 0.1, 0.1];
    const shape = eye.shape || 'round';
    if (shape === 'happy' || shape === 'closed') {
      const arcY = shape === 'happy' ? -0.2 + 0.55 * (1 - u * u) : -0.05 - 0.28 * (1 - u * u);
      if (ab(u) < 1.0 && ab(v - arcY) < 0.15) { sh.base = liner; sh.shade = liner; return true; }
      return r < 1.2 ? 'rim' : false;
    }
    const lidAmt = s > 0 ? (eye.lidL != null ? eye.lidL : eye.lid || 0) : (eye.lidR != null ? eye.lidR : eye.lid || 0);
    // upper lid line: flat (deadpan) or arched
    const lidV = 1 - 2 * lidAmt + (eye.flatLid ? 0 : lidAmt * 0.5 * (1 - u * u)) + (eye.lidSlant || 0) * u;
    const lower = -1 + 2 * (eye.lower || 0);
    const inside = r < 1 && v < lidV && v > lower;
    const lw = eye.liner != null ? eye.liner : 0.15;
    if (inside) {
      if (v > lidV - lw * 1.25 || (r > 1 - lw && v > 0)) { sh.base = liner; sh.shade = liner; sh.rim = null; return true; }
      if (r > 1 - lw * 0.55 || v < lower + lw * 0.45) { sh.base = cmix(liner, [0.4, 0.32, 0.3], 0.35); sh.shade = sh.base; sh.rim = null; return true; }
      const lu = eye.look ? eye.look[0] : 0, lv = eye.look ? eye.look[1] : 0;
      const iu = u - (eye.lookOut ? lu : lu * s), iv = v - lv; const ir = sq(iu * iu + iv * iv);
      const ic = eye.iris || c.iris;
      let col = cmix(ic[0], ic[1], clamp(ir * 1.05 + (iv > 0 ? iv * 0.35 : 0), 0, 1));
      if (lidAmt > 0 && v > lidV - lw * 1.25 - 0.25) col = cmix(col, liner, 0.35); // lid shadow on the iris
      const pt = eye.pupil || 'slit'; const pw = eye.pw || 0.2;
      let pd = 9; if (pt === 'slit') pd = sq((iu / pw) ** 2 + (iv / 0.8) ** 2); else if (pt === 'round') pd = sq(iu * iu + iv * iv) / pw; else if (pt === 'dot') pd = sq(iu * iu + iv * iv) / (pw * 0.55);
      if (pt === 'spiral') { const ang = Math.atan2(iv, iu); const sp = Math.sin(ang * 1 + ir * 18); col = sp > 0.3 ? cmix(col, [0.95, 0.4, 0.9], 0.6) : col; pd = ir / 0.12; }
      if (pd < 1) col = c.pupil || [0.07, 0.06, 0.07];
      if (eye.glow) { sh.emit = cmix(ic[0], [1, 1, 1], 0.2).map((q2) => q2 * eye.glow * (pd < 1 ? 0.2 : 1)); }
      const h1 = sq((u - 0.3) ** 2 + (v - Math.min(0.4, lidV - 0.4)) ** 2), h2 = sq((u + 0.28) ** 2 + (v + 0.42) ** 2);
      if (h1 < (eye.hl || 0.22)) col = [1, 1, 0.97]; else if (h2 < (eye.hl || 0.22) * 0.42) col = [0.95, 0.97, 1];
      sh.base = col; sh.shade = cmix(col, [0.12, 0.1, 0.12], 0.22); sh.spec = 0; sh.rim = null; return true;
    }
    if (r < (eye.rimR || 1.22) && v > lower - 0.32 && v < lidV + 0.3 && (v < 0.15 || u < -0.35 || eye.fullRim)) return 'rim';
    return false;
  };

  // mouth paint: kinds w | smile | open | o | shout | chew | flat | none
  C.mouth = function (ax, y, x, kind, c, lw = 1) {
    const D = c.mouthLine || c.line2 || [0.25, 0.18, 0.18]; const t = 0.02 * lw;
    if (kind === 'none') return null;
    if (kind === 'open' || kind === 'o' || kind === 'shout') {
      const rx = kind === 'o' ? 0.07 : kind === 'shout' ? 0.16 : 0.12, ry = kind === 'o' ? 0.07 : kind === 'shout' ? 0.13 : 0.085, cy = kind === 'shout' ? -0.52 : -0.49;
      const e = (x / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e < 1) { if (e > 0.7) return D; if (y < cy - ry * 0.2) return c.tongue || [0.88, 0.5, 0.52]; return c.mouthIn || [0.4, 0.14, 0.16]; }
      if (ax < 0.018 * lw && y > cy + ry - 0.01 && y < -0.23) return D;
      return null;
    }
    const r = kind === 'smile' ? 0.11 : 0.085, cy = kind === 'smile' ? -0.37 : -0.4;
    const d = sq((ax - r) ** 2 + (y - cy) ** 2);
    if (y < cy + 0.005 && ab(d - r) < t && ax < r * 2) return D;
    if (ax < 0.018 * lw && y > cy - 0.005 && y < -0.23) return D; // philtrum
    if (kind === 'chew' && y < cy - 0.02 && y > cy - 0.09 && ax < 0.045) return c.tongue || [0.88, 0.5, 0.52];
    if (kind === 'flat' && ab(y - (cy - 0.06)) < t * 0.9 && ax < 0.15) return D;
    return null;
  };

  // ================================================================== face paint per coat (returns colour or null), q head-local
  const MARKS = {};
  MARKS.leopard = (q, H, c, o) => {
    const R = H.R; const x = q[0] / R, y = q[1] / R, z = q[2] / R; const ax = ab(x); const lw = o.lineW || 1; const W = c.white, D = c.spot;
    if (z > 0.25) {
      const mo = C.mouth(ax, y, x, o.mouth || 'w', c, lw); if (mo) return mo;
      const m1 = ((ax - 0.13) / 0.3) ** 2 + ((y + 0.33) / 0.2) ** 2, m2 = (x / 0.3) ** 2 + ((y + 0.5) / 0.2) ** 2;
      if (m1 < 1 || m2 < 1) { if (z > 0.62) for (const [wx, wy] of [[0.2, -0.27], [0.28, -0.3], [0.22, -0.35], [0.31, -0.24]]) if ((ax - wx) ** 2 + (y - wy) ** 2 < 0.0008) return cmix(D, c.base, 0.35); return W; }
    }
    const back = Math.max(0, -z); const lx = ax / (1 + back * 0.35);
    if (y > 0.16 || (z < 0.15 && y > -0.6)) {
      const fade = sstep(0.95, 0.75, y + back * 0.9);
      if (lx < 0.03 * lw) return D;
      if (lx > 0.075 && lx < 0.075 + 0.05 * lw && z > 0.05 && fade > 0.5) return o.glowLines ? (o._glow = true, W) : W;
      if (lx > 0.155 && lx < 0.155 + 0.045 * lw) return D;
      if (!o.simple && lx > 0.29 && lx < 0.29 + 0.03 * lw && (y > 0.45 || z < 0.2)) return cmix(D, c.base, 0.25);
    }
    if (z > -0.3 && y < 0.12 && ax > 0.4) {
      if (segD(ax, y, 0.6, -0.03, 1.0, -0.17) < 0.035 * lw || segD(ax, y, 0.5, -0.38, 0.92, -0.5) < 0.033 * lw) return D;
      if (segD(ax, y, 0.56, -0.2, 0.95, -0.33) < 0.045 * lw) return W;
    }
    return null;
  };
  MARKS.tabby = (q, H, c, o) => {
    const R = H.R; const x = q[0] / R, y = q[1] / R, z = q[2] / R; const ax = ab(x); const lw = o.lineW || 1; const D = c.spot, W = c.white;
    if (z > 0.25) {
      const mo = C.mouth(ax, y, x, o.mouth || 'w', c, lw); if (mo) return mo;
      const m1 = ((ax - 0.14) / 0.32) ** 2 + ((y + 0.33) / 0.21) ** 2, m2 = (x / 0.32) ** 2 + ((y + 0.5) / 0.21) ** 2;
      if (m1 < 1 || m2 < 1) { if (z > 0.62) for (const [wx, wy] of [[0.2, -0.27], [0.27, -0.31], [0.22, -0.35]]) if ((ax - wx) ** 2 + (y - wy) ** 2 < 0.0006) return cmix(D, W, 0.4); return cmix(W, c.base, (m1 < 1 && m1 > 0.7) ? 0.25 : 0.0); }
    }
    const t = 0.028 * lw;
    if (z > 0.15) { // the classic M + brow arcs
      if (segD(ax, y, 0.0, 0.3, 0.0, 0.95) < t * 0.85) return D;
      if (segD(ax, y, 0.11, 0.24, 0.095, 0.86) < t) return D;
      if (segD(ax, y, 0.24, 0.3, 0.17, 0.72) < t) return D;
      if (segD(ax, y, 0.16, 0.21, 0.4, 0.3) < t * 0.8) return D;
    } else if (y > -0.5) { // mackerel lines over the crown to the nape
      const lx = ax / (1 + Math.max(0, -z) * 0.3);
      if (lx < 0.03 * lw || (lx > 0.1 && lx < 0.1 + 0.05 * lw) || (lx > 0.24 && lx < 0.24 + 0.045 * lw)) return D;
    }
    if (z > -0.3 && y < 0.15 && ax > 0.42) { // mascara line + cheek swirl
      if (segD(ax, y, 0.58, 0.0, 1.0, -0.1) < t * 1.1) return D;
      if (segD(ax, y, 0.5, -0.24, 0.8, -0.3) < t || segD(ax, y, 0.8, -0.3, 0.95, -0.16) < t) return D;
    }
    return null;
  };
  MARKS.calico = (q, H, c, o) => {
    const R = H.R; const x = q[0] / R, y = q[1] / R, z = q[2] / R; const ax = ab(x);
    if (z > 0.25) { const mo = C.mouth(ax, y, x, o.mouth || 'w', c, o.lineW || 0.9); if (mo) return mo; }
    // white blaze + muzzle, grey over the cat's right eye/ear (x<0), cream patch over the left brow (x>0)
    const n = E.noise(q[0] / R * 3 + 4, q[1] / R * 3, q[2] / R * 3) * 0.22;
    const blaze = ax < 0.1 + Math.max(0, -y + 0.1) * 0.55 + n * 0.3 && z > 0.2 && y < 0.6;
    if (blaze || y < -0.18 + n * 0.3) return c.white;
    if (x < 0) { if (y > -0.2 + n) return (y > 0.45 || ax > 0.55) ? cmix(c.grey, c.greyDark, 0.25) : c.grey; }
    else { const cr = ((x - 0.32) / 0.38) ** 2 + ((y - 0.48) / 0.34) ** 2 + n; if (cr < 1 && z > -0.2) return c.cream; if (z < -0.1 && y > 0.2 + n) return cmix(c.grey, c.cream, 0.35); }
    return c.white;
  };
  C.MARKS = MARKS;

  C.faceTex = function (H, c, coat, eye, opt = {}) {
    return (x, y, z, nx, ny, nz, sh) => {
      const q0 = H.hf(x, y, z); const q = [q0[0], q0[1], q0[2]];
      const e = C.eyePaint(q, H, eye, sh, c);
      if (e === true) return;
      if (e === 'rim') { sh.base = coat === 'calico' && q[0] < 0 && q[1] / H.R > -0.1 ? cmix(c.grey, c.white, 0.5) : c.white; sh.shade = c.whiteShade || E.shadeOf(sh.base, 0.84); return; }
      const m = MARKS[coat](q, H, c, opt);
      let base = c.base;
      if (coat === 'tabby') { const nn = E.fbm(x * 40, y * 40, z * 40, 2); base = cmix(cmix(c.base, c.baseDark, nn * 0.5), c.tick, sstep(0.62, 0.72, E.noise(x * 120, y * 120, z * 120)) * 0.6); }
      else if (coat === 'leopard') base = cmix(c.base, c.baseDark, E.fbm(x * 30, y * 30, z * 30, 2) * 0.5);
      sh.base = m || base;
      if (m === c.white || (coat === 'calico' && m === c.white)) sh.shade = c.whiteShade || E.shadeOf(c.white, 0.84);
      if (opt.post) opt.post(q, sh, nx, ny, nz);
    };
  };

  C.earTex = function (H, c, coat, o = {}) {
    const R = H.R;
    return (x, y, z, nx, ny, nz, sh) => {
      const q = H.hf(x, y, z); const s = q[0] >= 0 ? 1 : -1; const qx = q[0] * s, qy = q[1], qz = q[2];
      const nn = H.hfn(nx, ny, nz); const nhx = nn[0] * s, nhy = nn[1], nhz = nn[2];
      const e = H.ef(qx, qy, qz); const ex = e[0], ey = e[1], ez = e[2]; const en = H.efn(nhx, nhy, nhz); const enz = en[2];
      const es = H.es; const L = H.earLen;
      let backCol;
      if (coat === 'leopard') backCol = c.earBack; else if (coat === 'calico') backCol = s < 0 ? c.grey : c.cream; else backCol = c.earBack;
      const isBack = H.ear === 'round' ? (enz < 0.15 && ez < 0.02 * R) : (enz < 0.1 && ez < 0.03 * R);
      if (isBack) {
        let spot = 9;
        if (coat === 'leopard' || o.spot) { const cy = H.ear === 'round' ? H.earLen + 0.03 * R * es : L * 0.42; spot = sq((ex / (0.15 * R * es)) ** 2 + ((ey - cy) / (0.13 * R * es)) ** 2); }
        const sc = o.spotCol || c.white;
        sh.base = spot < 1 ? sc : backCol; sh.shade = E.shadeOf(sh.base, 0.8);
        if (o.spotGlow && spot < 1) sh.emit = o.spotGlow;
        if (coat === 'tabby' && ey > L * 0.6) sh.base = cmix(backCol, c.spot, 0.5);
        return;
      }
      // inner cup
      if (H.ear === 'round') {
        const t = sq((ex / (0.24 * R * es)) ** 2 + ((ey - H.earLen - 0.04 * R * es) / (0.27 * R * es)) ** 2);
        if (t < 1.05) { sh.base = cmix(c.inner, cmix(c.inner, c.earBack, 0.35), sstep(0.85, 0.2, t)); if (t > 0.72 && ey < H.earLen + 0.05 * R) sh.base = c.white; sh.shade = E.shadeOf(sh.base, 0.78); sh.rim = null; return; }
        sh.base = cmix(c.earBack, c.base, 0.5); return;
      }
      const hw = (0.36 * (1 - ey / L) + 0.05 * ey / L) * R * es; const edge = ab(ex) / Math.max(hw, 1e-4);
      if (edge > 0.82 || ez < 0.0) { sh.base = backCol; sh.shade = E.shadeOf(backCol, 0.8); return; }
      let col = cmix(c.inner, cmix(c.inner, [0.55, 0.35, 0.36], 0.4), sstep(0.5, 0.0, edge) * sstep(0.1 * L, 0.5 * L, ey));
      // ear furnishings (pale hair along the inner rim / base)
      if ((edge > 0.55 && ey < L * 0.7) || (ey < L * 0.22 && Math.sin(ex / R * 60) > 0.2)) col = c.white;
      if (o.furnish && ey < L * 0.55 && ab(Math.sin(ex / R * 45 + ey / R * 8)) > 0.6) col = c.white;
      sh.base = col; sh.shade = E.shadeOf(col, 0.8); sh.rim = null;
    };
  };

  // ================================================================== body coat painters
  // ctx.axis: [ax,ay,az, bx,by,bz] rump→chest axis for mackerel stripes / spot rows; ctx.white(x,y,z,nx,ny,nz) 0..1
  C.bodyTex = function (coat, c, ctx = {}) {
    const ax = ctx.axis || [0, 0.2, -0.2, 0, 0.45, 0.1]; const dx = ax[3] - ax[0], dy = ax[4] - ax[1], dz = ax[5] - ax[2]; const dl = sq(dx * dx + dy * dy + dz * dz);
    const ux = dx / dl, uy = dy / dl, uz = dz / dl;
    return (x, y, z, nx, ny, nz, sh) => {
      const wm = ctx.white ? ctx.white(x, y, z, nx, ny, nz) : 0;
      if (coat === 'leopard') {
        let base = cmix(c.base, c.baseDark, E.fbm(x * 18, y * 18, z * 18, 2) * 0.45); base = cmix(base, c.white, wm);
        if (ctx.nape && ctx.nape(x, y, z, sh)) return;
        const f = ctx.freq || [13, 12, 10]; const W = E.worley(x * f[0] + 3.1, y * f[1] + 1.7, z * f[2] + 5.3, 0.85);
        const size = (ctx.spotSize || 0.31) * (0.7 + W.id * 0.6) * (1 - wm * 0.45) * (ctx.sizeAt ? ctx.sizeAt(x, y, z, nx, ny, nz) : 1);
        const spot = W.id > (ctx.gap || 0.16) && W.d < size;
        sh.base = spot ? cmix(c.spot, base, wm * 0.25) : base;
        if (spot && ctx.spotGlow && W.id > 0.55) sh.emit = ctx.spotGlow;
        if (!spot && wm > 0.5) sh.shade = E.shadeOf(c.white, 0.84);
      } else if (coat === 'tabby') {
        const nn = E.fbm(x * 30, y * 30, z * 30, 2);
        let base = cmix(cmix(c.base, c.baseDark, nn * 0.55), c.tick, sstep(0.6, 0.72, E.noise(x * 110, y * 110, z * 110)) * 0.55);
        const t = (x - ax[0]) * ux + (y - ax[1]) * uy + (z - ax[2]) * uz;
        const warp = E.noise(x * 6, y * 6, z * 6) * 0.9 + ab(x) * 1.2;
        const st = Math.sin((t * (ctx.stripeF || 26)) + warp * 3.0);
        const flank = 1 - wm; let col = base;
        if (st > 0.55 && flank > 0.4) col = cmix(base, c.spot, 0.75 * flank);
        if (ab(x) < 0.03 && ny > 0.4) col = cmix(base, c.spot, 0.8); // spine line
        col = cmix(col, c.white, wm * 0.85);
        if (ctx.rosettes) { const W = E.worley(x * 7 + 1, y * 7 + 2, z * 7 + 3, 0.7); if (W.id > 0.72 && ab(x) > 0.1 && W.d > 0.16 && W.d < 0.26) { col = c.spot; if (ctx.rosetteGlow) sh.emit = ctx.rosetteGlow; } }
        sh.base = col; if (wm > 0.5) sh.shade = E.shadeOf(c.white, 0.84);
      } else { // calico (dilute): white with soft grey / cream patches on the top surfaces
        const n = E.fbm(x * 4.5 + 2, y * 4.5, z * 4.5, 3);
        const top = sstep(-0.1, 0.35, ny) * (ctx.topY ? sstep(ctx.topY - 0.06, ctx.topY + 0.04, y) : 1) * (1 - wm);
        let col = c.white;
        if (top > 0.5 && n > 0.42) col = n > 0.56 ? c.grey : (E.noise(x * 9, y * 9, z * 9) > 0.5 ? c.cream : cmix(c.grey, c.cream, 0.5));
        if (ctx.patch) { const pc = ctx.patch(x, y, z, nx, ny, nz); if (pc) col = pc; }
        sh.base = col; sh.shade = E.shadeOf(col, col === c.white ? 0.86 : 0.8);
        const fs = E.noise(x * 60, y * 25, z * 60); if (fs > 0.72) sh.base = cmix(col, [1, 1, 1], 0.25); // hair strand sheen
      }
      if (ctx.post) ctx.post(x, y, z, nx, ny, nz, sh);
    };
  };
  // legs/paws: bars for tabby, small spots leopard, white for calico
  C.legTex = function (coat, c, o = {}) {
    return (x, y, z, nx, ny, nz, sh) => {
      if (coat === 'calico') { sh.base = c.white; sh.shade = E.shadeOf(c.white, 0.86); return; }
      if (coat === 'tabby') {
        const base = cmix(c.base, c.baseDark, E.fbm(x * 30, y * 30, z * 30, 2) * 0.5); const bar = Math.sin(y * 70 + E.noise(x * 8, y * 8, z * 8) * 2) > 0.6 && y > 0.06 && y < (o.barTop || 0.32);
        const inner = ab(x) < (o.innerX || 0.06) ? 0.5 : 0; sh.base = bar ? cmix(c.spot, c.white, inner) : cmix(base, c.white, inner * 0.6 + (y < 0.05 ? 0.5 : 0)); return;
      }
      const base = cmix(c.base, c.baseDark, E.fbm(x * 18, y * 18, z * 18, 2) * 0.4); const W = E.worley(x * 18, y * 18, z * 18, 0.8);
      sh.base = W.id > 0.25 && W.d < 0.24 && y > 0.06 ? c.spot : (y < 0.05 ? cmix(base, c.white, 0.5) : base);
    };
  };
  C.pawTex = (coat, c) => (x, y, z, nx, ny, nz, sh) => { sh.base = coat === 'calico' ? c.white : coat === 'tabby' ? cmix(c.base, c.white, 0.45) : cmix(c.base, c.white, 0.5); sh.shade = E.shadeOf(sh.base, 0.82); if (ny < -0.6) sh.base = c.inner; };
  C.tailTex = function (coat, c, pts, o = {}) {
    const segL = []; let tot = 0; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; const l = sq((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2); segL.push(l); tot += l; }
    return (x, y, z, nx, ny, nz, sh) => {
      let best = 9, bt = 0, acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2]; const l2 = ex * ex + ey * ey + ez * ez;
        const t = clamp(((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / l2, 0, 1); const d = (x - a[0] - ex * t) ** 2 + (y - a[1] - ey * t) ** 2 + (z - a[2] - ez * t) ** 2;
        if (d < best) { best = d; bt = (acc + t * segL[i]) / tot; } acc += segL[i];
      }
      let col;
      if (coat === 'calico') { const ph = Math.sin(bt * 15 + E.noise(x * 8, y * 8, z * 8) * 3); col = bt > 0.9 ? c.white : ph > 0.2 ? c.grey : ph > -0.5 ? c.cream : cmix(c.grey, c.white, 0.3); sh.base = col; sh.shade = E.shadeOf(col, 0.82); }
      else {
        const base = coat === 'tabby' ? cmix(c.base, c.baseDark, E.fbm(x * 30, y * 30, z * 30, 2) * 0.5) : cmix(c.base, c.baseDark, E.fbm(x * 18, y * 18, z * 18, 2) * 0.4);
        const n = o.rings || 7, tipT = o.tip || (coat === 'tabby' ? 0.9 : 0.88), from = o.from != null ? o.from : (coat === 'tabby' ? 0.05 : 0.38);
        col = base;
        if (bt > tipT) col = c.spot;
        else if (bt > from) { const ph = ((bt - from) / (tipT - from)) * (n - 0.5); if (ph % 1 > (coat === 'tabby' ? 0.6 : 0.55)) col = c.spot; }
        else if (coat === 'leopard') { const W = E.worley(x * 11, y * 11, z * 11, 0.8); if (W.id > 0.2 && W.d < 0.28) col = c.spot; }
        sh.base = col;
      }
      if (o.post) o.post(x, y, z, bt, sh);
    };
  };

  // ================================================================== poses (joint sets). b: {s, fat, R, leg}
  // each returns {torso:[[cx,cy,cz, rx,ry,rz, ax,ay,az],...], neck:[[x,y,z,r],[x,y,z,r]], head:[x,y,z], headRot,
  //   legs:{FL,FR,HL,HR: [[x,y,z,r]... ] }, masses:[[...rell]], paws:[[x,y,z, yaw, size]], tail:[[x,y,z,r]...], axis, white(x,y,z,n), ground}
  const P = {};
  const mir = (pts) => pts.map(([x, y, z, r]) => [-x, y, z, r]);
  P.sit = (b) => { const f = b.fat || 1, R = b.R;
    return {
      torso: [[0, 0.2, -0.1, 0.26 * f, 0.21, 0.25, 0, 0, 0], [0, 0.31, -0.01, 0.22 * f, 0.2, 0.2, -25, 0, 0], [0, 0.44, 0.06, 0.17 * Math.sqrt(f), 0.2, 0.16, -18, 0, 0]],
      neck: [[0, 0.48, 0.05, 0.12], [0, 0.6, 0.09, 0.11]], head: [0, 0.58 + R * 0.85, 0.12],
      legs: { FL: [[0.1, 0.46, 0.09, 0.066], [0.105, 0.3, 0.07, 0.058], [0.09, 0.075, 0.16, 0.042]], FR: mir([[0.1, 0.46, 0.09, 0.066], [0.105, 0.3, 0.07, 0.058], [0.09, 0.075, 0.16, 0.042]]),
        HL: [[0.15, 0.22, -0.1, 0.085], [0.18, 0.15, 0.09, 0.065], [0.165, 0.05, -0.1, 0.042], [0.165, 0.04, 0.12, 0.04]], HR: mir([[0.15, 0.22, -0.1, 0.085], [0.18, 0.15, 0.09, 0.065], [0.165, 0.05, -0.1, 0.042], [0.165, 0.04, 0.12, 0.04]]) },
      masses: [[0.17 * Math.min(f, 1.15), 0.19, -0.03, 0.12, 0.15, 0.2, 20, 0, 0], [-0.17 * Math.min(f, 1.15), 0.19, -0.03, 0.12, 0.15, 0.2, 20, 0, 0], [0.1, 0.45, 0.07, 0.07, 0.12, 0.08, -10, 0, 0], [-0.1, 0.45, 0.07, 0.07, 0.12, 0.08, -10, 0, 0]],
      paws: [[0.09, 0.035, 0.195, 0, 1], [-0.09, 0.035, 0.195, 0, 1], [0.17, 0.035, 0.15, 8, 1.02], [-0.17, 0.035, 0.15, -8, 1.02]],
      tail: [[0, 0.1, -0.32, 0.05], [0.13, 0.05, -0.35, 0.052], [0.26, 0.04, -0.23, 0.05], [0.31, 0.04, -0.04, 0.047], [0.27, 0.04, 0.13, 0.042], [0.19, 0.04, 0.22, 0.036]],
      axis: [0, 0.18, -0.2, 0, 0.5, 0.08],
      white: (x, y, z, nx, ny, nz) => sstep(0.25, 0.55, nz) * sstep(0.62, 0.5, y) * sstep(0.13, 0.05, ab(x)) * sstep(0.12, 0.2, y),
      bounds: [-0.4, -0.01, -0.45, 0.4, 0.58 + R * 2.3, 0.36],
    };
  };
  P.sitPaw = (b) => { const p = P.sit(b); p.legs.FR = [[-0.1, 0.46, 0.09, 0.066], [-0.13, 0.36, 0.16, 0.056], [-0.13, 0.44, 0.27, 0.043]]; p.paws[1] = [-0.13, 0.47, 0.3, 0, 1, -70]; return p; };
  P.loaf = (b) => { const f = b.fat || 1, R = b.R;
    return {
      torso: [[0, 0.19, -0.04, 0.25 * f, 0.18 * Math.sqrt(f), 0.36, 0, 0, 0], [0, 0.22, 0.2, 0.2 * f, 0.18, 0.16, 0, 0, 0]],
      neck: [[0, 0.24, 0.22, 0.12], [0, 0.32, 0.28, 0.11]], head: [0, 0.3 + R * 0.62, 0.31],
      legs: {}, masses: [[0.16 * f, 0.17, -0.22, 0.11, 0.13, 0.18, 0, 0, 0], [-0.16 * f, 0.17, -0.22, 0.11, 0.13, 0.18, 0, 0, 0]],
      paws: [[0.08, 0.04, 0.33, 0, 0.9], [-0.08, 0.04, 0.33, 0, 0.9]],
      tail: [[0, 0.1, -0.38, 0.05], [0.15, 0.05, -0.4, 0.05], [0.27, 0.04, -0.22, 0.048], [0.29, 0.04, 0.04, 0.045], [0.24, 0.04, 0.22, 0.04]],
      axis: [0, 0.2, -0.4, 0, 0.2, 0.3],
      white: (x, y, z, nx, ny, nz) => sstep(0.3, 0.6, nz) * sstep(0.32, 0.22, y) * sstep(0.12, 0.05, ab(x)),
      bounds: [-0.4, -0.01, -0.52, 0.4, 0.3 + R * 2.2, 0.31 + R * 1.2],
    };
  };
  P.sphinx = (b) => { const f = b.fat || 1, R = b.R;
    return {
      torso: [[0, 0.18, -0.12, 0.23 * f, 0.17, 0.36, 0, 0, 0], [0, 0.26, 0.17, 0.17 * f, 0.19, 0.16, -25, 0, 0]],
      neck: [[0, 0.3, 0.2, 0.115], [0, 0.42, 0.25, 0.105]], head: [0, 0.4 + R * 0.75, 0.29],
      legs: { FL: [[0.1, 0.27, 0.19, 0.065], [0.115, 0.08, 0.19, 0.055], [0.1, 0.045, 0.4, 0.04]], FR: mir([[0.1, 0.27, 0.19, 0.065], [0.115, 0.08, 0.19, 0.055], [0.1, 0.045, 0.4, 0.04]]),
        HL: [[0.16, 0.14, -0.3, 0.06], [0.18, 0.045, -0.12, 0.04]], HR: mir([[0.16, 0.14, -0.3, 0.06], [0.18, 0.045, -0.12, 0.04]]) },
      masses: [[0.15 * f, 0.15, -0.3, 0.11, 0.13, 0.18, 0, 0, 0], [-0.15 * f, 0.15, -0.3, 0.11, 0.13, 0.18, 0, 0, 0]],
      paws: [[0.1, 0.035, 0.45, 0, 1], [-0.1, 0.035, 0.45, 0, 1], [0.18, 0.035, -0.07, 4, 0.95], [-0.18, 0.035, -0.07, -4, 0.95]],
      tail: [[0, 0.1, -0.48, 0.05], [0.12, 0.05, -0.55, 0.05], [0.27, 0.04, -0.47, 0.048], [0.33, 0.04, -0.3, 0.045], [0.33, 0.04, -0.12, 0.04]],
      axis: [0, 0.18, -0.45, 0, 0.25, 0.25],
      white: (x, y, z, nx, ny, nz) => sstep(0.2, 0.55, nz) * sstep(0.4, 0.28, y) * sstep(0.12, 0.05, ab(x)) * sstep(0.0, 0.1, z),
      bounds: [-0.42, -0.01, -0.62, 0.42, 0.4 + R * 2.4, 0.56],
    };
  };
  P.stand = (b) => { const f = b.fat || 1, R = b.R;
    return {
      torso: [[0, 0.45, 0.19, 0.16 * Math.sqrt(f), 0.18, 0.19, 10, 0, 0], [0, 0.38, -0.04, 0.19 * f, 0.17 * Math.sqrt(f), 0.25, 0, 0, 0], [0, 0.44, -0.27, 0.15 * Math.sqrt(f), 0.16, 0.15, 0, 0, 0]],
      neck: [[0, 0.5, 0.28, 0.11], [0, 0.6, 0.38, 0.1]], head: [0, 0.6 + R * 0.55, 0.44],
      legs: { FL: [[0.1, 0.46, 0.26, 0.068], [0.105, 0.28, 0.21, 0.058], [0.1, 0.07, 0.27, 0.043]], FR: mir([[0.1, 0.46, 0.26, 0.068], [0.105, 0.28, 0.21, 0.058], [0.1, 0.07, 0.27, 0.043]]),
        HL: [[0.12, 0.44, -0.29, 0.085], [0.135, 0.28, -0.18, 0.066], [0.12, 0.11, -0.37, 0.042], [0.115, 0.045, -0.32, 0.038]], HR: mir([[0.12, 0.44, -0.29, 0.085], [0.135, 0.28, -0.18, 0.066], [0.12, 0.11, -0.37, 0.042], [0.115, 0.045, -0.32, 0.038]]) },
      masses: [[0.11, 0.4, -0.25, 0.1, 0.15, 0.15, -15, 0, 0], [-0.11, 0.4, -0.25, 0.1, 0.15, 0.15, -15, 0, 0], [0.1, 0.48, 0.24, 0.06, 0.12, 0.08, 25, 0, 0], [-0.1, 0.48, 0.24, 0.06, 0.12, 0.08, 25, 0, 0]],
      paws: [[0.1, 0.035, 0.3, 0, 1], [-0.1, 0.035, 0.3, 0, 1], [0.115, 0.035, -0.29, 0, 0.95], [-0.115, 0.035, -0.29, 0, 0.95]],
      tail: [[0, 0.46, -0.38, 0.05], [0, 0.58, -0.48, 0.05], [0, 0.75, -0.52, 0.047], [0, 0.89, -0.48, 0.043], [0, 0.95, -0.4, 0.036]],
      axis: [0, 0.4, -0.4, 0, 0.45, 0.3],
      white: (x, y, z, nx, ny, nz) => Math.max(sstep(-0.2, -0.6, ny) * sstep(0.18, 0.1, ab(x)), sstep(0.3, 0.6, nz) * sstep(0.48, 0.38, y) * sstep(0.1, 0.04, ab(x))),
      bounds: [-0.36, -0.01, -0.6, 0.36, 0.6 + R * 2.4, 0.44 + R * 1.15],
    };
  };
  P.walk = (b) => { const p = P.stand(b);
    p.legs.FL = [[0.1, 0.46, 0.26, 0.068], [0.11, 0.3, 0.27, 0.058], [0.1, 0.16, 0.37, 0.043]]; p.paws[0] = [0.1, 0.11, 0.41, 0, 1, 35];
    p.legs.HR = mir([[0.12, 0.44, -0.29, 0.085], [0.135, 0.28, -0.24, 0.066], [0.12, 0.12, -0.45, 0.042], [0.115, 0.05, -0.43, 0.038]]); p.paws[3] = [-0.115, 0.035, -0.41, 0, 0.95];
    p.legs.FR = mir([[0.1, 0.46, 0.26, 0.068], [0.1, 0.28, 0.18, 0.058], [0.1, 0.07, 0.2, 0.043]]); p.paws[1] = [-0.1, 0.035, 0.23, 0, 1];
    return p; };
  P.lotus = (b) => { const f = b.fat || 1, R = b.R;
    return {
      torso: [[0, 0.24, -0.02, 0.27 * f, 0.24, 0.24, -8, 0, 0], [0, 0.46, -0.04, 0.18, 0.18, 0.15, -6, 0, 0]],
      neck: [[0, 0.5, -0.04, 0.12], [0, 0.62, -0.02, 0.11]], head: [0, 0.6 + R * 0.85, 0.0],
      legs: { FL: [[0.13, 0.48, -0.02, 0.064], [0.2, 0.42, 0.12, 0.056], [0.2, 0.55, 0.2, 0.042]], FR: mir([[0.13, 0.48, -0.02, 0.064], [0.17, 0.33, 0.1, 0.056], [0.08, 0.28, 0.2, 0.042]]),
        HL: [[0.15, 0.14, 0.0, 0.085], [0.25, 0.1, 0.2, 0.066], [0.1, 0.06, 0.28, 0.042]], HR: mir([[0.15, 0.14, 0.0, 0.085], [0.25, 0.1, 0.2, 0.066], [0.1, 0.06, 0.28, 0.042]]) },
      masses: [[0.18, 0.14, 0.04, 0.12, 0.12, 0.18, 0, -25, 0], [-0.18, 0.14, 0.04, 0.12, 0.12, 0.18, 0, 25, 0]],
      paws: [[0.2, 0.59, 0.22, 0, 1, -70], [-0.07, 0.27, 0.23, 0, 0.95, 10], [0.06, 0.07, 0.31, -40, 0.95, -60], [-0.06, 0.07, 0.31, 40, 0.95, -60]],
      tail: [[0, 0.06, -0.24, 0.05], [0.16, 0.04, -0.3, 0.05], [0.3, 0.04, -0.16, 0.047], [0.33, 0.04, 0.04, 0.042], [0.28, 0.04, 0.2, 0.036]],
      axis: [0, 0.1, -0.1, 0, 0.6, -0.02],
      white: (x, y, z, nx, ny, nz) => sstep(0.3, 0.6, nz) * sstep(0.56, 0.44, y) * sstep(0.16, 0.06, ab(x)) * sstep(0.08, 0.16, y),
      bounds: [-0.42, -0.01, -0.42, 0.42, 0.6 + R * 2.3, 0.38],
    };
  };
  C.POSES = P;

  // ================================================================== body builder
  // o: { pose:P.x(b), b, mats, fur (displacement amp), furF, longhair:{ruff, britches, tailPlume}, noTail, tailPts override }
  C.body = function (S, pose, o = {}) {
    const F = o.mats && o.mats.fur || 'fur', LG = o.mats && o.mats.leg || 'leg', PW = o.mats && o.mats.paw || 'paw', TL = o.mats && o.mats.tail || 'tail';
    const k = o.k || 0.06; const parts = [];
    for (const t of pose.torso) parts.push(S.rell(F, ...t));
    for (const m of pose.masses) parts.push(S.rell(LG === F ? F : F, ...m));
    parts.push(S.cone(F, ...pose.neck[0].slice(0, 3), ...pose.neck[1].slice(0, 3), pose.neck[0][3], pose.neck[1][3]));
    let torso = S.su(k, ...parts);
    if (o.fur) torso = S.fluff(torso, o.fur, o.furF || 30, { sharp: o.furSharp || 2.4, mask: o.furMask });
    const legs = [];
    for (const key of ['FL', 'FR', 'HL', 'HR']) { const L = pose.legs[key]; if (!L || L.length < 2) continue; legs.push(S.tube(LG, L, 0.02)); }
    const paws = pose.paws.map(([x, y, z, yaw = 0, sz = 1, pitch = 0]) => {
      const pr = o.pawR || 1; const s2 = sz * pr;
      const toes = []; for (let i = 0; i < 4; i++) { const a = (-0.33 + i * 0.22); toes.push(S.sphere(PW, Math.sin(a) * 0.05 * s2, 0.008 * s2, 0.055 * s2 + Math.cos(a) * 0.012 * s2 - ab(a) * 0.02 * s2, 0.024 * s2)); }
      const pawN = S.su(0.018 * s2, S.ell(PW, 0, 0.004 * s2, 0, 0.058 * s2, 0.042 * s2, 0.072 * s2), ...toes);
      return S.bound(S.t(S.r(pawN, 0, 0, 0, pitch, yaw, 0), x, y, z), x, y, z, 0.1 * s2);
    });
    let limbs = S.su(0.03, ...legs, ...paws);
    if (o.legFur) limbs = S.fluff(limbs, o.legFur, o.furF || 30, { sharp: 2.6 });
    let tail = null;
    const tp = o.tailPts || pose.tail;
    if (!o.noTail && tp) { tail = S.tube(TL, tp, 0.03); if (o.tailFur) tail = S.fluff(tail, o.tailFur, o.tailFurF || 22, { sharp: 2.0 }); }
    const nodes = [torso, limbs, tail].filter(Boolean);
    if (o.extraBody) nodes.push(...o.extraBody);
    return { node: S.su(o.kJoin || 0.035, ...nodes), tail: tp };
  };

  // ================================================================== whiskers / brows overlay
  C.whiskers = function (g, R, H, o = {}) {
    const col = o.col || 'rgba(255,253,248,0.95)'; const dark = o.dark || 'rgba(30,26,30,0.55)';
    const len = o.len || 1.45; const rows = o.rows || [[-0.25, 12, len], [-0.29, 2, len * 1.08], [-0.33, -9, len * 1.02], [-0.37, -20, len * 0.9]];
    const pts = [];
    for (const s of [-1, 1]) {
      for (const [wy, ang, l] of rows) { const a = ang * Math.PI / 180; pts.push([s * 0.24, wy, 0.8, s * (0.24 + Math.cos(a) * l), wy + Math.sin(a) * l, 0.8 - 0.55 * l, 0.07]); }
      if (o.brows !== false) for (const [bx, ang, l] of [[0.24, 60, 0.55], [0.32, 48, 0.6]]) { const a = ang * Math.PI / 180; pts.push([s * bx, 0.3, 0.66, s * (bx + Math.cos(a) * l * 0.6), 0.3 + Math.sin(a) * l, 0.66 - 0.3 * l, 0.1]); }
    }
    g.save(); g.lineCap = 'round';
    const sc = R.view.scale;
    for (const [lx, ly, lz, ex, ey, ez, bend] of pts) {
      const A = H.toW(lx * H.R, ly * H.R, lz * H.R), B = H.toW(ex * H.R, ey * H.R, ez * H.R), M = H.toW((lx + ex) / 2 * H.R, ((ly + ey) / 2 + bend) * H.R, ((lz + ez) / 2 + 0.05) * H.R);
      if (!E.visible(R, A[0], A[1], A[2], 0.05 * H.R)) continue;
      const a = E.project(R.view, ...A), b = E.project(R.view, ...B), m = E.project(R.view, ...M);
      const wdt = Math.max(0.7, sc * H.R * 0.012);
      g.strokeStyle = dark; g.lineWidth = wdt + 1.1; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(m[0], m[1], b[0], b[1]); g.stroke();
      const gr = g.createLinearGradient(a[0], a[1], b[0], b[1]); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.strokeStyle = gr; g.lineWidth = wdt; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(m[0], m[1], b[0], b[1]); g.stroke();
    }
    g.restore();
  };

  // ================================================================== materials
  C.mats = function (S, coat, c, o = {}) {
    const line = c.line; const rim = c.rim;
    S.mat('face', { base: c.base, line, grp: 1, rim });
    S.mat('ear', { base: c.earBack, line, grp: 1, rim });
    S.mat('nose', { base: c.nose, line: cmix(c.nose, [0, 0, 0], 0.6), grp: 2, spec: 0.8, specAt: 0.975 });
    S.mat('fur', { base: c.base, line, grp: 1, rim });
    S.mat('leg', { base: c.base, line, grp: 1, rim });
    S.mat('paw', { base: c.white, line, grp: 1, rim });
    S.mat('tail', { base: c.base, line, grp: 1, rim });
  };

  // ================================================================== full cat assembly
  // spec: { coat, colours (override), poseName, b:{R,fat}, head:{...}, eye:{...}, face:{mouth,...}, body:{fur...}, tailPts, bustNoTail }
  C.cat = function (S, spec, vr = {}) {
    const c = C.cols(Object.assign({}, C.COATS[spec.coat], spec.colours || {}));
    C.mats(S, spec.coat, c);
    const b = Object.assign({ R: 0.2, fat: 1 }, spec.b || {});
    let pose = C.POSES[spec.pose || 'sit'](b); if (spec.poseMod) pose = spec.poseMod(pose) || pose;
    const hs = Object.assign({ R: b.R, pos: pose.head, rot: spec.headRot || [0, 0, 0], mats: { face: 'face', ear: 'ear', nose: 'nose' }, ear: spec.coat === 'leopard' ? 'round' : 'tri' }, spec.head || {});
    const H = C.head(S, hs);
    const bo = Object.assign({ tailPts: spec.tailPts }, spec.body || {}); if (vr.bust && spec.bustNoTail !== false) bo.noTail = true;
    const B = C.body(S, pose, bo);
    S.mats[S.names.face].tex = C.faceTex(H, c, spec.coat, Object.assign({ iris: c.iris }, spec.eye || {}), spec.face || {});
    S.mats[S.names.ear].tex = C.earTex(H, c, spec.coat, spec.earTex || {});
    const white = spec.white || pose.white;
    S.mats[S.names.fur].tex = C.bodyTex(spec.coat, c, Object.assign({ axis: pose.axis, white }, spec.coatCtx || {}));
    S.mats[S.names.leg].tex = spec.coat === 'calico' ? C.legTex('calico', c) : C.bodyTex(spec.coat, c, Object.assign({ axis: pose.axis, white: (x, y, z, nx, ny, nz) => Math.max(white(x, y, z, nx, ny, nz), sstep(0.07, 0.03, y) * 0.6), spotSize: 0.24 }, spec.coatCtx || {}, spec.legCtx || {}));
    if (spec.coat === 'tabby') S.mats[S.names.leg].tex = C.legTex('tabby', c, spec.legCtx || {});
    S.mats[S.names.paw].tex = C.pawTex(spec.coat, c);
    S.mats[S.names.tail].tex = C.tailTex(spec.coat, c, B.tail || pose.tail, spec.tailTex || {});
    const node = S.su(0.045, B.node, H.node);
    return { node, H, pose, c, b };
  };

  // ================================================================== charm & prop library (culturally grounded)
  C.LIB = {};
  // collar cord (torus) around a neck axis: centre, radius, thickness, tilt about x (deg)
  C.LIB.cord = (S, m, cx, cy, cz, R, r, tilt = 40, ry = 0) => S.t(S.r(S.torus(m, 0, 0, 0, R, r), 0, 0, 0, tilt, ry, 0), cx, cy, cz);
  // square-holed copper cash coin facing +z (pitch deg)
  C.LIB.coin = (S, m, x, y, z, r = 0.042, pitch = 72, yaw = 0) => S.t(S.r(S.sub(S.cyl(m, 0, 0, 0, r, r * 0.17, r * 0.08), S.box(m, 0, 0, 0, r * 0.28, r, r * 0.28)), 0, 0, 0, pitch, yaw, 0), x, y, z);
  // brass bell: sphere with a slot and a ring
  C.LIB.bell = (S, m, x, y, z, r = 0.035) => S.t(S.u(S.sub(S.sphere(m, 0, 0, 0, r), S.box(m, 0, -r * 0.55, 0, r * 1.2, r * 0.06, r * 0.25)), S.torus(m, 0, r * 1.05, 0, r * 0.28, r * 0.09)), x, y, z);
  // 平安符 amulet pouch (rounded box) hanging; tex by caller
  C.LIB.pouch = (S, m, x, y, z, w = 0.05, h = 0.065, d = 0.016, rx = 0, ry = 0) => S.t(S.r(S.box(m, 0, 0, 0, w / 2, h / 2, d / 2, d * 0.45), 0, 0, 0, rx, ry, 0), x, y, z);
  // paper lantern (ribbed lathe), with caps
  C.LIB.lantern = (S, m, capM, x, y, z, r = 0.08, h = 0.1, ribs = 14) => {
    const prof = E.bez([0, -h, r * 0.55, -h, r * 1.05, -h * 0.75, r, 0, r * 1.05, h * 0.75, r * 0.55, h, 0, h], 8);
    const body = S.lathe(m, 0, 0, 0, prof, 0.004, ribs, r * 0.035);
    const caps = S.u(S.cyl(capM, 0, h * 0.98, 0, r * 0.5, r * 0.1, r * 0.03), S.cyl(capM, 0, -h * 0.98, 0, r * 0.5, r * 0.1, r * 0.03));
    return S.t(S.u(body, caps), x, y, z);
  };
  C.LIB.lanternTex = (base, band, glow, ribsN = 14) => (x, y, z, nx, ny, nz, sh) => { sh.base = base; sh.emit = glow; };
  // 斗笠 conical bamboo hat
  C.LIB.douli = (S, m, x, y, z, r = 0.3, h = 0.13, tilt = [0, 0, 0]) => {
    const prof = [[0, h], [r * 0.08, h * 0.97], [r, 0.004], [r * 0.98, -0.012], [r * 0.08, h * 0.93 - 0.016], [0, h * 0.93 - 0.016]];
    return S.t(S.r(S.lathe(m, 0, 0, 0, prof, 0.006), 0, 0, 0, ...tilt), x, y, z);
  };
  // 八卦 octagon pendant
  C.LIB.bagua = (S, m, x, y, z, r = 0.045, pitch = 75) => { const pts = []; for (let i = 0; i < 8; i++) { const a = (i + 0.5) * Math.PI / 4; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return S.t(S.r(S.extrude(m, 0, 0, 0, pts, r * 0.12, r * 0.06), 0, 0, 0, pitch - 90, 0, 0), x, y, z); };

  G.CATKIT = C;
})(typeof window !== 'undefined' ? window : self);

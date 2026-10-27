/* 《彼岸燈》 Shorelight — character design pass v2
 * Shared procedural drawing engine for 洛紅纓 (hongying) & 洛青鋒 (qingfeng).
 * Canvas-2D only. Figure coordinates: origin = top-centre of the skull, +y down, units = px at 1x.
 * Screen side sx = -1 is the viewer's left (= the character's RIGHT hand), sx = +1 the viewer's right.
 */
(function () {
  'use strict';
  const LQ = (window.LQ = {});

  /* ------------------------------------------------------------------ colour */
  const h2r = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const r2h = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => v + (B[i] - v) * t)); };
  const mul = (a, b) => { const A = h2r(a), B = h2r(b); return r2h(A.map((v, i) => (v * B[i]) / 255)); };
  const rgba = (h, a) => { const [r, g, b] = h2r(h); return `rgba(${r},${g},${b},${a})`; };
  const lighten = (h, t) => mix(h, '#ffffff', t);
  const darken = (h, t) => mix(h, '#000000', t);
  LQ.col = { h2r, r2h, mix, mul, rgba, lighten, darken };

  /* ------------------------------------------------------------------ state */
  const S = (LQ.S = { ctx: null, tcan: null, tctx: null, Z: 1, sil: false, lw: 1.7, k: 9, rim: '#ffe2b8', rimW: 2.2, tint: '#c4aecb', skinTint: '#e7aea0', lineInk: '#1d1219', detail: 1 });
  LQ.begin = function (ctx, o = {}) {
    S.ctx = ctx; S.Z = o.Z || 1; S.sil = !!o.sil;
    if (!S.tcan) { S.tcan = document.createElement('canvas'); S.tctx = S.tcan.getContext('2d'); }
    if (S.tcan.width !== ctx.canvas.width || S.tcan.height !== ctx.canvas.height) { S.tcan.width = ctx.canvas.width; S.tcan.height = ctx.canvas.height; }
  };
  const shadeOf = (c, tint) => mix(mul(c, tint || S.tint), c, 0.08);
  const deepOf = (c, tint) => mul(mul(c, tint || S.tint), '#d8c8d8');
  const lineOf = (c) => mix(mul(c, '#5d4558'), S.lineInk, 0.5);
  const rimOf = (c) => mix(lighten(c, 0.35), S.rim, 0.55);
  LQ.shadeOf = shadeOf; LQ.deepOf = deepOf; LQ.lineOf = lineOf; LQ.rimOf = rimOf;

  /* ------------------------------------------------------------------ geometry */
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]], sub: (a, b) => [a[0] - b[0], a[1] - b[1]], mul: (a, k) => [a[0] * k, a[1] * k],
    len: (a) => Math.hypot(a[0], a[1]), norm: (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], perp: (a) => [-a[1], a[0]],
    rot: (a, r) => [a[0] * Math.cos(r) - a[1] * Math.sin(r), a[0] * Math.sin(r) + a[1] * Math.cos(r)],
  };
  LQ.V = V;

  // smooth closed/open path through points (Catmull-Rom → Bézier). point[2] truthy = sharp corner
  function sp(pts, closed = true, k = 1) {
    const p = new Path2D(); const n = pts.length;
    const g = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    p.moveTo(pts[0][0], pts[0][1]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      let c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k];
      let c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k];
      if (p1[2]) c1 = V.lerp(p1, p2, 0.25); if (p2[2]) c2 = V.lerp(p2, p1, 0.25);
      p.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  }
  function crSample(pts, seg = 10) {
    const out = []; const n = pts.length; const g = (i) => pts[Math.max(0, Math.min(n - 1, i))];
    if (n === 1) return [pts[0].slice(0, 2)];
    for (let i = 0; i < n - 1; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      for (let s = 0; s < seg; s++) {
        const t = s / seg, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(pts[n - 1].slice(0, 2));
    return out;
  }
  const interp = (arr, t) => { if (typeof arr === 'function') return arr(t); if (typeof arr === 'number') return arr; const f = t * (arr.length - 1); const i = Math.min(arr.length - 2, Math.floor(f)); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };
  // variable-width tube around a smooth centre line. caps: 'round' | 'flat' | 'point'
  function tube(pts, w, o = {}) {
    const c = crSample(pts, o.seg || 12); const n = c.length; const L = [0];
    for (let i = 1; i < n; i++) L.push(L[i - 1] + V.len(V.sub(c[i], c[i - 1])));
    const tot = L[n - 1] || 1; const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)]; const d = V.norm(V.sub(b, a)); const nm = V.perp(d);
      const ww = interp(w, L[i] / tot); left.push(V.add(c[i], V.mul(nm, ww))); right.push(V.add(c[i], V.mul(nm, -ww)));
    }
    const p = new Path2D(); p.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i++) p.lineTo(left[i][0], left[i][1]);
    const e = c[n - 1], dE = V.norm(V.sub(c[n - 1], c[n - 2]));
    if (o.end === 'round') { const r = interp(w, 1); p.quadraticCurveTo(e[0] + dE[0] * r * 1.3 + (left[n - 1][0] - e[0]), e[1] + dE[1] * r * 1.3 + (left[n - 1][1] - e[1]), e[0] + dE[0] * r, e[1] + dE[1] * r); p.quadraticCurveTo(e[0] + dE[0] * r * 1.3 + (right[n - 1][0] - e[0]), e[1] + dE[1] * r * 1.3 + (right[n - 1][1] - e[1]), right[n - 1][0], right[n - 1][1]); }
    else if (o.end === 'point') { p.lineTo(e[0] + dE[0] * interp(w, 1) * 2, e[1] + dE[1] * interp(w, 1) * 2); p.lineTo(right[n - 1][0], right[n - 1][1]); }
    else p.lineTo(right[n - 1][0], right[n - 1][1]);
    for (let i = n - 2; i >= 0; i--) p.lineTo(right[i][0], right[i][1]);
    const s = c[0], dS = V.norm(V.sub(c[1], c[0]));
    if (o.start === 'round') { const r = interp(w, 0); p.quadraticCurveTo(s[0] - dS[0] * r * 1.3 + (right[0][0] - s[0]), s[1] - dS[1] * r * 1.3 + (right[0][1] - s[1]), s[0] - dS[0] * r, s[1] - dS[1] * r); p.quadraticCurveTo(s[0] - dS[0] * r * 1.3 + (left[0][0] - s[0]), s[1] - dS[1] * r * 1.3 + (left[0][1] - s[1]), left[0][0], left[0][1]); }
    p.closePath();
    p.c = c; p.left = left; p.right = right;
    return p;
  }
  const taper = (pts, w, prof) => tube(pts, (t) => w * (prof ? prof(t) : Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.7)) + 0.05);
  function P(...a) { // mini path DSL
    const p = new Path2D(); let i = 0;
    while (i < a.length) {
      const c = a[i++];
      if (c === 'M') { p.moveTo(a[i], a[i + 1]); i += 2; } else if (c === 'L') { p.lineTo(a[i], a[i + 1]); i += 2; }
      else if (c === 'Q') { p.quadraticCurveTo(a[i], a[i + 1], a[i + 2], a[i + 3]); i += 4; }
      else if (c === 'C') { p.bezierCurveTo(a[i], a[i + 1], a[i + 2], a[i + 3], a[i + 4], a[i + 5]); i += 6; }
      else if (c === 'Z') p.closePath();
    }
    return p;
  }
  const ell = (x, y, rx, ry, rot = 0) => { const p = new Path2D(); p.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2); return p; };
  const shifted = (p, dx, dy) => { const q = new Path2D(); q.addPath(p, new DOMMatrix([1, 0, 0, 1, dx, dy])); return q; };
  const xform = (p, m) => { const q = new Path2D(); q.addPath(p, m); return q; };
  const union = (...ps) => { const q = new Path2D(); ps.flat().forEach((p) => p && q.addPath(p)); return q; };
  const mirrorPts = (pts) => pts.map((p) => [-p[0], p[1], p[2]]);
  // symmetric closed outline from the right half (top → bottom); centre points at x=0 are shared
  const sym = (half) => { const r = half; const l = mirrorPts(half).reverse().filter((p) => Math.abs(p[0]) > 1e-6); return r.concat(l); };
  Object.assign(LQ, { sp, tube, taper, P, ell, shifted, xform, union, sym, crSample, mirrorPts });

  /* ------------------------------------------------------------------ painting */
  function tctx() { const t = S.tctx; t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'source-over'; t.globalAlpha = 1; t.clearRect(0, 0, S.tcan.width, S.tcan.height); t.setTransform(S.ctx.getTransform()); return t; }
  function blit(a = 1, op) { const c = S.ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = a; if (op) c.globalCompositeOperation = op; c.drawImage(S.tcan, 0, 0); c.restore(); }
  // paint (p minus p shifted by dx,dy) with col → crescent on the side opposite to the shift
  function band(p, col, dx, dy, a = 1, op) { if (S.sil) return; const t = tctx(); t.fillStyle = col; t.fill(p); t.globalCompositeOperation = 'destination-out'; t.fill(shifted(p, dx, dy)); blit(a, op); }
  function within(p, fn) { if (S.sil) return; const c = S.ctx; c.save(); c.clip(p); fn(c); c.restore(); }
  // cast shadow of occluder (shifted) onto p
  function occl(p, occ, dx, dy, col, a = 1) { if (S.sil) return; within(p, (c) => { c.globalAlpha = a; c.fillStyle = col; c.fill(shifted(occ, dx, dy)); }); }
  function fillIn(p, shape, col, a = 1) { if (S.sil) return; within(p, (c) => { c.globalAlpha = a; c.fillStyle = col; c.fill(shape); }); }
  function cel(p, o) {
    const c = S.ctx; if (typeof o === 'string') o = { fill: o };
    if (S.sil) { c.fillStyle = '#000'; c.fill(p); return; }
    const fill = o.fill; const k = o.k ?? S.k;
    if (o.grad) { const g = c.createLinearGradient(0, o.grad[0], 0, o.grad[1]); g.addColorStop(0, lighten(fill, o.gradA ?? 0.07)); g.addColorStop(1, darken(fill, o.gradB ?? 0.08)); c.fillStyle = g; } else c.fillStyle = o.paint || fill;
    c.fill(p);
    if (o.tex) within(p, o.tex);
    if (o.sh !== 0) { const [dx, dy] = o.sd || [-k, -k * 0.45]; band(p, o.shade || shadeOf(fill, o.tint), dx, dy, 1); }
    if (o.deep) { const [dx, dy] = o.deepSd || [-k * 0.45, -k * 0.25]; band(p, o.deepCol || deepOf(fill, o.tint), dx, dy, 0.55); }
    if (o.hi) { const hk = o.hiK || k * 0.7; band(p, o.hiCol || lighten(fill, 0.22), hk, hk * 0.7, o.hiA ?? 0.55); }
    if (o.rim !== false && S.rim) band(p, o.rimCol || rimOf(fill), -(o.rimW || S.rimW), o.rimDy || 0, o.rimA ?? 0.9);
    if (o.after) within(p, o.after);
    if (o.line !== false) stroke(p, o.line || lineOf(fill), o.lw);
  }
  function stroke(p, col, lw, dash) { if (S.sil) return; const c = S.ctx; c.save(); c.strokeStyle = col; c.lineWidth = (lw || S.lw) / S.Z; c.lineJoin = 'round'; c.lineCap = 'round'; if (dash) c.setLineDash(dash.map((d) => d / S.Z)); c.stroke(p); c.restore(); }
  function line(pts, col, lw, smooth = true, dash) { if (S.sil) return; stroke(smooth ? sp(pts, false) : P('M', pts[0][0], pts[0][1], ...pts.slice(1).flatMap((q) => ['L', q[0], q[1]])), col, lw, dash); }
  function fold(pts, w, col, a = 0.85) { if (S.sil) return; const c = S.ctx; c.save(); c.globalAlpha = a; c.fillStyle = col; c.fill(taper(pts, w)); c.restore(); }
  function stitch(pts, col, lw = 0.8, d = [2.2, 2.2]) { line(pts, col, lw, true, d); }
  function glow(x, y, r, col, a = 0.6) { if (S.sil) return; const c = S.ctx; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  Object.assign(LQ, { band, within, occl, fillIn, cel, stroke, line, fold, stitch, glow });

  /* ------------------------------------------------------------------ figure kit */
  LQ.fig = function (spec) {
    const H = spec.H || 420, n = spec.heads || 7, h = H / n, f = spec.sex !== 'm';
    const F = { spec, H, n, h, f, anchors: {}, back: !!spec.back };
    const X = (v) => v * h;
    F.X = X;
    F.chin = h; F.neckB = h * 1.2;
    F.shY = h + 0.048 * H;
    F.chestY = h + 0.15 * H; F.waistY = h + (f ? 0.235 : 0.25) * H; F.hipY = h + 0.315 * H;
    F.crotch = h + (spec.crotch || 0.37) * H; F.ankle = H - 0.045 * H; F.knee = F.crotch + (F.ankle - F.crotch) * 0.5;
    F.sw = (spec.sw || (f ? 0.122 : 0.15)) * H; F.ww = (spec.ww || (f ? 0.072 : 0.092)) * H; F.hw = (spec.hw || (f ? 0.104 : 0.098)) * H;
    F.nw = (spec.nw || (f ? 0.17 : 0.215)) * h;
    F.upper = (f ? 0.188 : 0.195) * H; F.fore = (f ? 0.158 : 0.165) * H;
    F.stance = (spec.stance || (f ? 0.6 : 0.72)) * h;
    F.legX = (spec.legX || 0.42) * h;
    F.mark = (name, x, y) => { F.anchors[name] = [x, y]; };
    F.shoulderJ = (sx) => [sx * (F.sw - 0.2 * h), F.shY + 0.2 * h];
    F.armpit = (sx) => [sx * (F.sw - 0.28 * h), F.shY + 0.95 * h];
    // two-bone IK, bend = +1/-1 picks the elbow side
    F.ik = function (sx, W, bend = 1, Sj) {
      Sj = Sj || F.shoulderJ(sx); const l1 = F.upper, l2 = F.fore; let d = V.sub(W, Sj); let L = V.len(d);
      if (L > (l1 + l2) * 0.995) { W = V.add(Sj, V.mul(V.norm(d), (l1 + l2) * 0.995)); d = V.sub(W, Sj); L = V.len(d); }
      const a = (l1 * l1 - l2 * l2 + L * L) / (2 * L); const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a)); const u = V.norm(d);
      const el = (b) => [Sj[0] + u[0] * a - u[1] * hh * b, Sj[1] + u[1] * a + u[0] * hh * b];
      let E;
      if (typeof bend === 'string') { const e1 = el(1), e2 = el(-1); const sc = { down: (e) => e[1], up: (e) => -e[1], out: (e) => e[0] * sx, in: (e) => -e[0] * sx }[bend]; E = sc(e1) >= sc(e2) ? e1 : e2; }
      else E = el(bend);
      return { S: Sj, E, W };
    };
    return F;
  };

  /* -------- arm / sleeve: outline from the shoulder line along the arm bones. */
  // o: {sx, arm:{S,E,W}, wS, wE, wC, cuffT (0 elbow → 1 wrist, >1 past wrist), hang (wide-sleeve sag), col, cuffBand:{w,col}, lining, neckX}
  LQ.sleeve = function (F, o) {
    const { sx } = o; const { S: Sj, E, W } = o.arm; const h = F.h;
    const fore = V.sub(W, E); const cuffT = o.cuffT ?? 1; const C = V.add(E, V.mul(fore, cuffT));
    const outN = (d) => V.norm([sx * d[1], -sx * d[0]]);
    const dU = V.norm(V.sub(E, Sj)), dF = V.norm(fore); const oU = outN(dU), oF = outN(dF); const oE = V.norm(V.add(oU, oF));
    const wS = o.wS ?? 0.27 * h, wE = o.wE ?? 0.21 * h, wC = o.wC ?? 0.17 * h, hang = o.hang || 0;
    const top = [sx * (F.sw - (o.capIn ?? 0.42) * h), F.shY - 0.02 * h];
    const tip = [sx * (F.sw + (o.puff || 0)), F.shY + 0.2 * h];
    const eO = V.add(E, V.mul(oE, wE)), eI = V.add(E, V.mul(oE, -wE * 0.92));
    const cO = V.add(C, V.mul(oF, wC)), cI = V.add(C, V.mul(oF, -wC));
    const cIh = V.add(cI, [0, hang]);
    const mid = V.add(V.lerp(cO, cIh, 0.5), V.mul(dF, (o.cuffBulge ?? 0.05) * h));
    const ap = o.armpit || F.armpit(sx);
    const pts = [top, tip, V.add(V.lerp(Sj, E, 0.45), V.mul(oU, wS * 0.98)), eO, [cO[0], cO[1], 1], mid, [cIh[0], cIh[1], 1]];
    if (hang) pts.push(V.add(V.lerp(cI, eI, 0.45), [0, hang * 0.55]));
    pts.push(eI, V.add(V.lerp(Sj, E, 0.55), V.mul(oU, -wS * 0.8)), ap);
    const path = sp(pts, true);
    const res = { path, C, cO, cI: cIh, E, W, eO, eI, dF, oF, linePath: sp(pts.slice(1), false), pts };
    return res;
  };
  LQ.drawSleeve = function (F, sl, o) {
    const c = S.ctx; const fill = o.col;
    if (S.sil) { c.fillStyle = '#000'; c.fill(sl.path); return; }
    c.fillStyle = o.paint || fill; c.fill(sl.path);
    if (o.tex) within(sl.path, o.tex);
    const sx = o.sx; const k = o.k ?? S.k;
    band(sl.path, o.shade || shadeOf(fill), -k * 0.85, -k * 0.15);
    if (S.rim) band(sl.path, rimOf(fill), -S.rimW, 0, 0.85);
    // elbow & cuff folds
    const fcol = o.fold || deepOf(fill);
    if (o.folds !== false) {
      const E = sl.E, d = sl.dF, oF = sl.oF; const h = F.h;
      within(sl.path, () => {
        for (let i = 0; i < (o.nf || 3); i++) {
          const a = V.add(E, V.mul(oF, (0.5 - i * 0.35) * h * 0.4)); const b = V.add(a, V.add(V.mul(d, (0.18 + i * 0.07) * h), V.mul(oF, -0.12 * h)));
          fold([V.add(a, V.mul(d, -0.12 * h)), a, b], 0.035 * h, fcol, 0.7);
        }
        const C = sl.C; fold([V.add(C, V.mul(oF, 0.12 * h)), V.add(C, V.add(V.mul(d, -0.22 * h), V.mul(oF, -0.02 * h))), V.add(C, V.add(V.mul(d, -0.38 * h), V.mul(oF, -0.1 * h)))], 0.03 * h, fcol, 0.6);
      });
    }
    if (o.after) within(sl.path, o.after);
    stroke(sl.linePath, o.line || lineOf(fill), o.lw);
    // cuff opening / band
    if (o.cuffBand) { const b = o.cuffBand; const p = tube([V.add(sl.cO, V.mul(sl.dF, -b.w * 0.5)), V.add(sl.cI, V.mul(sl.dF, -b.w * 0.5))], b.w * 0.5, { seg: 4 }); cel(p, { fill: b.col, k: 3, lw: 1.2 }); }
  };

  /* -------- hands. kinds: grip (around a pole; o.pole = direction vector), relaxed, fist, hip, open */
  LQ.hand = function (F, o) {
    const c = S.ctx; const h = F.h; const sx = o.sx; const skin = o.skin; const W = o.at;
    const sh = o.shade || shadeOf(skin, S.skinTint); const ln = o.line || mix(mul(skin, '#7a4a44'), '#2a1414', 0.4);
    const lw = 1.25;
    c.save(); c.translate(W[0], W[1]);
    const s = o.scale || 1; const u = (v) => v * h * s;
    if (o.kind === 'grip') {
      // frame: a = pole axis (unit), b = perpendicular toward the wrist side
      const a = V.norm(o.pole || [0, 1]); let b = V.perp(a); if (o.toward) { const tw = V.sub(o.toward, W); if (b[0] * tw[0] + b[1] * tw[1] < 0) b = V.mul(b, -1); } else if (b[0] * sx > 0) b = V.mul(b, -1); if (o.flipB) b = V.mul(b, -1);
      c.transform(a[0], a[1], b[0], b[1], 0, 0); // local x along pole, local y toward the back of the hand
      const body = sp([[-u(0.2), -u(0.05)], [-u(0.18), u(0.2)], [-u(0.05), u(0.3)], [u(0.16), u(0.26)], [u(0.22), u(0.1)], [u(0.21), -u(0.12)], [u(0.12), -u(0.2)], [-u(0.12), -u(0.19)]], true);
      cel(body, { fill: skin, shade: sh, k: u(0.09), sd: [u(0.0), -u(0.09)], line: ln, lw, rim: false });
      if (!S.sil) {
        for (let i = 1; i < 4; i++) { const x = -u(0.2) + i * u(0.105); line([[x, -u(0.19)], [x + u(0.01), -u(0.08)], [x - u(0.005), u(0.0)]], ln, 1); }
        line([[-u(0.19), u(0.0)], [-u(0.05), u(0.04)], [u(0.12), u(0.02)], [u(0.2), -u(0.02)]], rgba(ln, 0.6), 0.9);
        // thumb wraps over the index finger
        const th = sp([[-u(0.21), u(0.06)], [-u(0.16), -u(0.12)], [-u(0.06), -u(0.17)], [u(0.0), -u(0.12)], [-u(0.07), -u(0.07)], [-u(0.14), u(0.12)]], true);
        cel(th, { fill: lighten(skin, 0.04), shade: sh, k: u(0.05), sd: [u(0.03), -u(0.05)], line: ln, lw, rim: false });
        c.fillStyle = rgba('#ffffff', 0.45); c.fill(ell(-u(0.06), -u(0.13), u(0.025), u(0.018)));
      }
    } else if (o.kind === 'hip') {
      const r = Math.atan2(o.dir[1], o.dir[0]) - Math.PI / 2; c.rotate(r); if (sx < 0) c.scale(-1, 1);
      const p = sp([[-u(0.13), -u(0.02)], [u(0.13), -u(0.04)], [u(0.2), u(0.18)], [u(0.16), u(0.32)], [u(0.02), u(0.36)], [-u(0.14), u(0.3)], [-u(0.17), u(0.12)]], true);
      cel(p, { fill: skin, shade: sh, k: u(0.08), line: ln, lw, rim: false });
      if (!S.sil) { for (let i = 0; i < 3; i++) line([[-u(0.08) + i * u(0.08), u(0.27)], [-u(0.06) + i * u(0.085), u(0.35)]], ln, 0.9); line([[-u(0.1), u(0.2)], [u(0.13), u(0.2)]], rgba(ln, 0.5), 0.8); }
    } else if (o.kind === 'fist') {
      const r = Math.atan2(o.dir[1], o.dir[0]) - Math.PI / 2; c.rotate(r); if (sx < 0) c.scale(-1, 1);
      const p = sp([[-u(0.14), 0], [u(0.13), 0], [u(0.19), u(0.14)], [u(0.17), u(0.33)], [u(0.0), u(0.37)], [-u(0.15), u(0.32)], [-u(0.17), u(0.12)]], true);
      cel(p, { fill: skin, shade: sh, k: u(0.08), line: ln, lw, rim: false });
      if (!S.sil) { for (let i = 0; i < 3; i++) line([[-u(0.09) + i * u(0.09), u(0.22)], [-u(0.08) + i * u(0.09), u(0.35)]], ln, 0.9); const th = sp([[-u(0.17), u(0.12)], [-u(0.05), u(0.17)], [u(0.08), u(0.2)], [u(0.02), u(0.25)], [-u(0.13), u(0.24)]], true); cel(th, { fill: skin, shade: sh, k: u(0.04), line: ln, lw: 1, rim: false }); }
    } else if (o.kind === 'open') {
      const r = Math.atan2(o.dir[1], o.dir[0]) - Math.PI / 2; c.rotate(r); if (sx < 0) c.scale(-1, 1);
      const palm = sp([[-u(0.13), 0], [u(0.12), 0], [u(0.16), u(0.24)], [-u(0.14), u(0.26)]], true);
      const fingers = [];
      for (let i = 0; i < 4; i++) { const x = -u(0.105) + i * u(0.085); const len = [0.27, 0.3, 0.28, 0.22][i]; fingers.push(tube([[x, u(0.2)], [x + u(0.005) * (i - 1.5), u(0.2 + len * 0.6)], [x + u(0.01) * (i - 1.5), u(0.2 + len)]], u(0.04), { end: 'round' })); }
      const th = tube([[u(0.12), u(0.06)], [u(0.21), u(0.18)], [u(0.24), u(0.3)]], u(0.045), { end: 'round' });
      const all = union(palm, ...fingers, th);
      cel(all, { fill: skin, shade: sh, k: u(0.07), line: false, rim: false });
      fingers.concat([th, palm]).forEach((q) => stroke(q, ln, 1.05));
    } else { // relaxed hanging hand, seen from the thumb side
      const r = Math.atan2(o.dir[1], o.dir[0]) - Math.PI / 2; c.rotate(r); if (sx < 0) c.scale(-1, 1);
      const back = sp([[-u(0.12), -u(0.02)], [u(0.12), -u(0.02)], [u(0.16), u(0.2)], [u(0.13), u(0.42)], [u(0.07), u(0.6)], [u(0.0), u(0.62)], [-u(0.05), u(0.5)], [-u(0.11), u(0.3)], [-u(0.14), u(0.12)]], true);
      cel(back, { fill: skin, shade: sh, k: u(0.08), sd: [u(0.06), -u(0.04)], line: ln, lw, rim: false });
      if (!S.sil) {
        line([[u(0.1), u(0.32)], [u(0.05), u(0.45)], [u(0.03), u(0.56)]], ln, 0.9);
        line([[u(0.13), u(0.25)], [u(0.08), u(0.38)]], rgba(ln, 0.6), 0.8);
        const th = sp([[-u(0.12), u(0.08)], [-u(0.17), u(0.2)], [-u(0.15), u(0.36)], [-u(0.1), u(0.38)], [-u(0.07), u(0.24)], [-u(0.05), u(0.12)]], true);
        cel(th, { fill: lighten(skin, 0.05), shade: sh, k: u(0.04), line: ln, lw: 1.1, rim: false });
      }
    }
    c.restore();
  };

  // wrist position for a fist gripping a pole at `at`, arm coming from `toward` (e.g. the shoulder joint)
  LQ.gripW = function (F, at, pole, toward, k = 0.27) { const a = V.norm(pole); let b = V.perp(a); const tw = V.sub(toward, at); if (b[0] * tw[0] + b[1] * tw[1] < 0) b = V.mul(b, -1); return V.add(at, V.mul(b, k * F.h)); };

  /* -------- trouser leg. o: {sx, top (y), hipW, crotchX, kneeW, ankleW, footX, ankleY, col, flare} */
  LQ.legShape = function (F, o) {
    const h = F.h, sx = o.sx; const ax = sx * (o.footX ?? F.stance); const ay = o.ankleY ?? F.ankle;
    const ky = o.kneeY ?? F.knee; const kx = V.lerp([sx * F.legX, F.crotch], [ax, ay], (ky - F.crotch) / (ay - F.crotch))[0] + sx * (o.kneeOut || 0);
    const kw = o.kneeW ?? 0.3 * h, aw = o.ankleW ?? 0.22 * h; const top = o.top ?? F.waistY;
    const pts = [[sx * 0.0, top], [sx * (o.hipW ?? F.hw + 0.05 * h), top + 0.02 * h], [sx * ((o.hipW ?? F.hw + 0.05 * h) + (o.thigh || 0.04) * h), F.hipY + 0.2 * h], [kx + sx * kw, ky], [ax + sx * (aw + (o.flare || 0)), ay, 1], [ax + sx * (aw * 0.1), ay + (o.hemDip || 0.05) * h], [ax - sx * (aw + (o.flare || 0) * 0.6), ay, 1], [kx - sx * kw * 0.85, ky], [sx * (o.crotchX ?? 0.05 * h), F.crotch + 0.12 * h], [sx * 0.0, F.crotch + 0.02 * h]];
    return { path: sp(pts, true), knee: [kx, ky], ankle: [ax, ay], kw, aw, pts };
  };
  LQ.drawLeg = function (F, L, o) {
    const h = F.h, sx = o.sx; const fill = o.col;
    cel(L.path, { fill, k: o.k ?? 0.2 * h, sd: [sx < 0 ? 0.16 * h : -0.16 * h, -0.05 * h], line: o.line, rim: sx > 0, after: () => {
      if (o.folds === false) return;
      const fc = deepOf(fill); const [kx, ky] = L.knee; const [ax, ay] = L.ankle;
      // crotch pull folds, inner-knee fold, stacked folds above the cuff
      fold([[sx * 0.06 * h, F.crotch + 0.1 * h], [sx * 0.22 * h, F.crotch + 0.3 * h], [sx * 0.42 * h, F.crotch + 0.45 * h]], 0.045 * h, fc, 0.55);
      fold([[sx * 0.08 * h, F.crotch + 0.3 * h], [sx * 0.2 * h, F.crotch + 0.62 * h], [(kx + sx * 0.05 * h), ky - 0.35 * h]], 0.035 * h, fc, 0.4);
      fold([[kx - sx * 0.22 * h, ky - 0.02 * h], [kx - sx * 0.05 * h, ky + 0.08 * h], [kx + sx * 0.06 * h, ky + 0.06 * h]], 0.035 * h, fc, 0.5);
      if (o.bunch) for (let i = 0; i < 3; i++) { const yy = ay - (0.12 + i * 0.16) * h; fold([[ax - sx * L.aw * 0.9, yy + 0.03 * h], [ax - sx * L.aw * 0.1, yy - 0.04 * h], [ax + sx * L.aw * 0.8, yy + (i % 2 ? 0.05 : -0.02) * h]], 0.04 * h, fc, 0.55); }
      if (o.after) o.after();
    } });
  };

  /* -------- boots / shoes (front view). o: {sx, x, y (ankle), topY, col, sole, trim, toe ('point'|'round'|'up'), shaftW} */
  LQ.boot = function (F, o) {
    const h = F.h, sx = o.sx; const x = o.x, y = o.y; const g = o.ground ?? F.H; const sw = o.shaftW ?? 0.2 * h;
    const toeX = x + sx * (o.toeOut ?? 0.1 * h); const soleT = o.soleT ?? 0.05 * h;
    const res = {};
    if (o.topY != null) {
      const shaft = sp([[x - sw * 1.05, o.topY], [x + sw * 1.05, o.topY], [x + sw * 1.0, (o.topY + y) / 2], [x + sw * 0.85, y + 0.05 * h], [x - sw * 0.85, y + 0.05 * h], [x - sw * 1.0, (o.topY + y) / 2]], true);
      cel(shaft, { fill: o.col, k: 0.12 * h, sd: [-0.13 * h * (sx < 0 ? -1 : 1), 0], hi: true, hiA: 0.35 });
      res.shaft = shaft;
      if (o.trim) { const tr = sp([[x - sw * 1.1, o.topY - 0.02 * h], [x + sw * 1.1, o.topY - 0.02 * h], [x + sw * 1.07, o.topY + 0.1 * h], [x - sw * 1.07, o.topY + 0.1 * h]], true); cel(tr, { fill: o.trim, k: 0.05 * h }); }
      if (!S.sil) { fold([[x - sw * 0.7, y - 0.25 * h], [x, y - 0.18 * h], [x + sw * 0.6, y - 0.28 * h]], 0.03 * h, deepOf(o.col), 0.7); fold([[x - sw * 0.5, y - 0.05 * h], [x + sw * 0.1, y + 0.0 * h], [x + sw * 0.6, y - 0.07 * h]], 0.025 * h, deepOf(o.col), 0.6); }
    }
    const fw = o.footW ?? 0.19 * h; const tl = o.toe === 'point' ? 0.07 * h : 0;
    const foot = sp([[x - fw * 0.9, y - 0.02 * h], [x + fw * 0.9, y - 0.02 * h], [toeX + sx * fw * 1.1 + (sx > 0 ? 0 : 0), g - soleT - 0.08 * h], [toeX + sx * fw * 0.6, g - soleT], [toeX - sx * fw * 0.9, g - soleT], [x - sx * fw * 1.05, g - soleT - 0.05 * h], [x - sx * fw * 1.0, y + 0.04 * h]], true);
    cel(foot, { fill: o.col, k: 0.07 * h, sd: [-0.06 * h, -0.08 * h], hi: true, hiA: 0.4 });
    const sole = sp([[toeX - sx * fw * 1.0, g - soleT - 0.01 * h], [toeX + sx * fw * 0.7, g - soleT - 0.01 * h], [toeX + sx * (fw * 1.15 + tl), g - soleT - 0.06 * h - (o.toe === 'up' ? 0.06 * h : 0), 1], [toeX + sx * fw * 1.1, g - 0.005 * h], [toeX - sx * fw * 1.0, g], [x - sx * fw * 1.08, g - 0.01 * h]], true);
    cel(sole, { fill: o.sole || '#e9e1d2', k: 0.03 * h, sd: [0, -0.03 * h], rim: false, lw: 1.3 });
    res.foot = foot; res.toe = [toeX, g];
    return res;
  };

  // low footwear. kind: 'cloth' | 'straw' | 'clog' | 'embroidered'
  LQ.shoe = function (F, o) {
    const h = F.h, sx = o.sx, x = o.x, y = o.y ?? F.ankle, g = F.H; const fw = (o.footW ?? 0.17) * h; const toeX = x + sx * (o.toeOut ?? 0.09) * h;
    const skin = o.skin, sk = shadeOf(skin || '#f0c8b0', S.skinTint); const res = {};
    const bare = o.kind === 'straw' || o.kind === 'clog';
    const soleT = o.kind === 'clog' ? 0.11 * h : o.kind === 'straw' ? 0.045 * h : 0.04 * h; const gb = g - soleT;
    if (bare || o.ankle) {
      const ank = sp([[x - fw * 0.62, y - 0.32 * h], [x + fw * 0.62, y - 0.32 * h], [x + fw * 0.75, y - 0.02 * h], [toeX + sx * fw * 1.05, gb - 0.07 * h], [toeX + sx * fw * 0.8, gb], [toeX - sx * fw * 0.95, gb], [x - sx * fw * 1.0, gb - 0.06 * h], [x - fw * 0.75, y - 0.02 * h]], true);
      cel(ank, { fill: o.sock || skin, shade: o.sock ? undefined : sk, k: 0.08 * h, sd: [-0.07 * h, 0], rim: false, line: o.sock ? undefined : mix(mul(skin, '#80463f'), '#2a1414', 0.35), lw: 1.2 });
      if (!S.sil && bare && !o.sock) for (let i = 0; i < 5; i++) { const tx = toeX - sx * fw * 0.8 + sx * i * fw * 0.42; line([[tx, gb - 0.005 * h], [tx + sx * 0.01 * h, gb - 0.04 * h]], rgba(sk, 0.9), 0.8); }
      res.foot = ank;
    }
    if (o.kind === 'cloth' || o.kind === 'embroidered') {
      const sh = sp([[x - fw * 0.85, y + 0.02 * h], [x + fw * 0.85, y + 0.02 * h], [toeX + sx * fw * 1.1, gb - 0.08 * h], [toeX + sx * fw * 0.65, gb], [toeX - sx * fw * 0.9, gb], [x - sx * fw * 1.05, gb - 0.06 * h]], true);
      cel(sh, { fill: o.col, k: 0.07 * h, sd: [-0.06 * h, -0.06 * h], hi: true, hiA: 0.35, after: o.kind === 'embroidered' ? (c) => { c.fillStyle = o.emb || '#e8b84a'; c.fill(ell(toeX + sx * fw * 0.1, gb - 0.06 * h, fw * 0.35, 0.035 * h)); } : null });
      if (!S.sil) line([[x - fw * 0.7, y + 0.05 * h], [x, y + 0.08 * h], [x + fw * 0.7, y + 0.05 * h]], lineOf(o.col), 1.1);
      res.foot = sh;
    }
    const sole = sp([[toeX - sx * fw * 1.02, gb - 0.005 * h], [toeX + sx * fw * 0.75, gb - 0.005 * h], [toeX + sx * fw * 1.18, gb - 0.04 * h - (o.toeUp || 0) * h, 1], [toeX + sx * fw * 1.15, g - 0.005 * h], [toeX - sx * fw * 1.02, g], [x - sx * fw * 1.12, g - 0.01 * h], [x - sx * fw * 1.12, gb - 0.02 * h]], true);
    cel(sole, { fill: o.sole || (o.kind === 'clog' ? '#b98a56' : o.kind === 'straw' ? '#d8bb7c' : '#ece4d4'), k: 0.03 * h, sd: [0, -0.03 * h], rim: false, lw: 1.2, tex: o.kind === 'straw' ? LQ.pattern('weave', '#8a6a3a', 0.3 * h, 0.35) : null });
    if (o.kind === 'straw') { const st = tube([[x - sx * fw * 0.6, y - 0.05 * h], [toeX - sx * fw * 0.2, gb - 0.06 * h], [x + sx * fw * 0.75, y - 0.03 * h]], 0.022 * h, { seg: 5 }); cel(st, { fill: '#c9a865', k: 1.5, lw: 1, rim: false }); }
    if (o.kind === 'clog') { const st = sp([[toeX - sx * fw * 0.95, gb - 0.02 * h], [toeX - sx * fw * 0.75, gb - 0.13 * h], [toeX + sx * fw * 0.8, gb - 0.14 * h], [toeX + sx * fw * 1.05, gb - 0.02 * h]], true); cel(st, { fill: o.strap || '#2e4a6e', k: 0.03 * h, lw: 1.1 }); }
    res.toe = [toeX, g];
    return res;
  };
  // 綁腿 leg wraps: spiral bands on the lower leg
  LQ.legWrap = function (F, o) {
    const h = F.h; const p = tube([[o.x, o.top], [o.x + (o.dx || 0), (o.top + o.bottom) / 2], [o.x + (o.dx || 0) * 1.4, o.bottom]], [o.w0 ?? 0.2 * h, o.w1 ?? 0.15 * h, o.w2 ?? 0.13 * h], { seg: 6 });
    cel(p, { fill: o.col, k: 0.1 * h, sd: [-0.09 * h, 0], hi: true, hiA: 0.3, after: (c) => {
      const n = o.n || 6; for (let i = 0; i <= n; i++) { const yy = o.top + (o.bottom - o.top) * (i / n); line([[o.x - 0.25 * h, yy + 0.06 * h], [o.x + 0.25 * h, yy - 0.06 * h]], lineOf(o.col), 1); fold([[o.x - 0.22 * h, yy + 0.09 * h], [o.x + 0.22 * h, yy - 0.03 * h]], 0.03 * h, shadeOf(o.col), 0.6); }
    } });
    if (o.tie) { const t = tube([[o.x + 0.12 * h, o.top + 0.05 * h], [o.x + 0.2 * h, o.top + 0.18 * h], [o.x + 0.17 * h, o.top + 0.32 * h]], 0.02 * h, { seg: 4 }); cel(t, { fill: o.tie, k: 1, lw: 0.9, rim: false }); }
    return p;
  };
  // bare forearm between a cuff (point C) and the wrist
  LQ.forearm = function (F, C, W, skin, w0 = 0.12, w1 = 0.09) {
    const h = F.h; const p = tube([C, V.lerp(C, W, 0.55), W], [w0 * h, w0 * 0.95 * h, w1 * h], { seg: 4 });
    cel(p, { fill: skin, shade: shadeOf(skin, S.skinTint), k: 0.07 * h, sd: [-0.07 * h, 0], rim: false, line: mix(mul(skin, '#80463f'), '#2a1414', 0.35), lw: 1.2 });
    return p;
  };

  /* -------- face & head. ---------------------------------------------------------------- */
  // fc: {fw, cheekY, jaw, jawY, chinW, chinY, chinSharp, skin, blush, eye:{...}, brow:{...}, nose:{...}, mouth:{...}, extra(fn)}
  LQ.facePath = function (F, fc) {
    const h = F.h; const fw = fc.fw ?? 0.39, cy = fc.cheekY ?? 0.63, jx = (fc.jaw ?? 0.66) * fw, jy = fc.jawY ?? 0.85, cw = fc.chinW ?? 0.08, chy = fc.chinY ?? 1.0;
    const pts = [[-fw * 0.9, 0.2], [-fw * 0.55, 0.04], [0, 0.0], [fw * 0.55, 0.04], [fw * 0.9, 0.2], [fw * 1.0, 0.42], [fw * 0.98, cy], [jx, jy], [cw, chy - 0.035], [0, chy, fc.chinSharp ? 1 : 0], [-cw, chy - 0.035], [-jx, jy], [-fw * 0.98, cy], [-fw * 1.0, 0.42]];
    return sp(pts.map((p) => [p[0] * h, p[1] * h, p[2]]), true);
  };
  LQ.ears = function (F, fc) {
    const h = F.h; const fw = (fc.fw ?? 0.39) * h; const skin = fc.skin;
    [-1, 1].forEach((sx) => {
      const p = sp([[sx * fw * 0.92, 0.47 * h], [sx * (fw + 0.07 * h), 0.45 * h], [sx * (fw + 0.085 * h), 0.55 * h], [sx * (fw + 0.05 * h), 0.68 * h], [sx * fw * 0.95, 0.72 * h]], true);
      cel(p, { fill: skin, shade: shadeOf(skin, S.skinTint), k: 0.03 * h, sd: [sx * 0.03 * h, 0], line: fc.line || mix(mul(skin, '#80463f'), '#2a1414', 0.35), lw: 1.2, rim: false });
      if (!S.sil) line([[sx * (fw + 0.04 * h), 0.5 * h], [sx * (fw + 0.055 * h), 0.57 * h], [sx * (fw + 0.025 * h), 0.64 * h]], shadeOf(skin, S.skinTint), 1.1);
      if (fc.earring) fc.earring(sx, [sx * (fw + 0.045 * h), 0.71 * h]);
    });
  };
  LQ.neck = function (F, o) {
    const h = F.h; const nw = o.w ?? F.nw; const skin = o.skin;
    const p = sp([[-nw, 0.7 * h], [nw, 0.7 * h], [nw * 1.02, 1.05 * h], [nw * 1.35, (o.bottom ?? 1.3) * h], [-nw * 1.35, (o.bottom ?? 1.3) * h], [-nw * 1.02, 1.05 * h]], true);
    cel(p, { fill: skin, shade: shadeOf(skin, S.skinTint), k: 0.08 * h, sd: [-0.08 * h, 0], line: mix(mul(skin, '#80463f'), '#2a1414', 0.35), lw: 1.3, rim: false });
    return p;
  };
  LQ.eye = function (F, e, sx, skin) {
    const c = S.ctx; const h = F.h; if (S.sil) return;
    const ex = (e.x ?? 0.19) * h, ey = (e.y ?? 0.585) * h, ew = (e.w ?? 0.19) * h, eh = (e.h ?? 0.1) * h, tilt = e.tilt ?? 0.08;
    const lid = e.lid ?? 0; const peak = e.peak ?? 0.35;
    const I = [sx * (ex - ew * 0.5), ey + ew * tilt * 0.5 + (e.innerDrop || 0) * h], O = [sx * (ex + ew * 0.5), ey - ew * tilt * 0.5];
    if (e.closed) { // closed lids (blink / happy arc / pained)
      const Ic = [sx * (ex - ew * 0.5), ey + ew * tilt * 0.5], Oc = [sx * (ex + ew * 0.5), ey - ew * tilt * 0.5];
      const my = e.closed === 'happy' ? ey - eh * 0.55 : ey + eh * 0.3;
      line([Ic, [sx * (ex - ew * 0.1), my], [sx * (ex + ew * 0.2), my + (e.closed === 'happy' ? 0 : -eh * 0.05)], Oc], e.lashCol || '#24161c', 2.6);
      line([Oc, [Oc[0] + sx * ew * (e.flick ?? 0.13), Oc[1] - eh * 0.2]], e.lashCol || '#24161c', 1.6);
      return;
    }
    const upH = eh * (1 - lid * 0.75);
    const U1 = [I[0] + sx * ew * (peak * 0.5), I[1] - upH * 1.25], U2 = [O[0] - sx * ew * (0.55 - peak * 0.5), O[1] - upH * (e.outerLift ?? 0.95)];
    const lowH = eh * (e.low ?? 0.55);
    const L1 = [O[0] - sx * ew * 0.22, O[1] + lowH * 1.15], L2 = [I[0] + sx * ew * 0.28, I[1] + lowH * 1.0];
    const open = P('M', I[0], I[1], 'C', U1[0], U1[1], U2[0], U2[1], O[0], O[1], 'C', L1[0], L1[1], L2[0], L2[1], I[0], I[1], 'Z');
    // sclera
    c.fillStyle = e.white || '#fbf7f4'; c.fill(open);
    within(open, () => {
      const ir = (e.irisR ?? 0.36) * ew; const icx = sx * (ex + (e.gaze ? e.gaze[0] * sx : 0) * h) + (e.gazeX || 0) * h, icy = ey + eh * 0.08 + (e.gaze ? e.gaze[1] * h : 0);
      const iry = ir * (e.irisV ?? 1.12);
      const g = c.createLinearGradient(0, icy - iry, 0, icy + iry);
      g.addColorStop(0, mix(e.iris, '#120a10', 0.55)); g.addColorStop(0.55, e.iris); g.addColorStop(1, lighten(e.iris, 0.42));
      c.fillStyle = g; c.fill(ell(icx, icy, ir, iry));
      c.strokeStyle = mix(e.iris, '#100810', 0.65); c.lineWidth = Math.max(0.6, 0.012 * h) / S.Z * S.Z; c.stroke(ell(icx, icy, ir * 0.97, iry * 0.97));
      // pupil (sharp slit for wild looks)
      c.fillStyle = mix(e.iris, '#0b0609', 0.8);
      if (e.slit) c.fill(ell(icx, icy + iry * 0.05, ir * 0.18, iry * 0.62)); else c.fill(ell(icx, icy + iry * 0.05, ir * (e.pupil ?? 0.42), iry * (e.pupil ?? 0.42)));
      // iris texture rays
      c.strokeStyle = rgba(lighten(e.iris, 0.5), 0.35); c.lineWidth = 0.6 / S.Z;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; c.beginPath(); c.moveTo(icx + Math.cos(a) * ir * 0.5, icy + Math.sin(a) * iry * 0.5); c.lineTo(icx + Math.cos(a) * ir * 0.85, icy + Math.sin(a) * iry * 0.85); c.stroke(); }
      // lid shadow
      c.fillStyle = rgba(e.lidShadow || '#6a4a68', 0.38); c.fill(shifted(P('M', I[0] - sx * ew, I[1] - eh * 3, 'L', O[0] + sx * ew, O[1] - eh * 3, 'L', O[0] + sx * ew, O[1], 'C', U2[0], U2[1], U1[0], U1[1], I[0], I[1], 'Z'), 0, eh * 0.32));
      // highlights
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill(ell(icx - sx * ir * 0.35, icy - iry * 0.42, ir * 0.26, iry * 0.2, -0.4 * sx));
      c.fillStyle = 'rgba(255,255,255,0.75)'; c.fill(ell(icx + sx * ir * 0.38, icy + iry * 0.45, ir * 0.1, ir * 0.1));
      if (e.glint) { c.fillStyle = rgba(e.glint, 0.6); c.fill(ell(icx, icy + iry * 0.55, ir * 0.55, iry * 0.25)); }
    });
    // upper lash line — thick, tapering, with an outer flick
    const N = 16, top = [], bot = [];
    const bez = (t) => { const mt = 1 - t; return [0, 1].map((k) => mt * mt * mt * I[k] + 3 * mt * mt * t * U1[k] + 3 * mt * t * t * U2[k] + t * t * t * O[k]); };
    const lt = (e.lash ?? 0.03) * h;
    for (let i = 0; i <= N; i++) { const t = i / N; const p = bez(t); const th = lt * (0.25 + 0.95 * Math.pow(t, 0.8)) * (t > 0.92 ? 1 - (t - 0.92) * 4 : 1); bot.push(p); top.push([p[0], p[1] - th]); }
    const flick = e.flick ?? 0.13; const fl = [O[0] + sx * ew * flick, O[1] - eh * (e.flickUp ?? 0.25)];
    const lash = new Path2D(); lash.moveTo(bot[0][0], bot[0][1]); top.forEach((p) => lash.lineTo(p[0], p[1])); lash.lineTo(fl[0], fl[1]); for (let i = N; i >= 0; i--) lash.lineTo(bot[i][0], bot[i][1]); lash.closePath();
    c.fillStyle = e.lashCol || '#24161c'; c.fill(lash);
    if (e.lashes) { for (let i = 0; i < e.lashes; i++) { const t = 0.55 + i * 0.13; const p = bez(Math.min(1, t)); line([[p[0], p[1] - lt * 0.6], [p[0] + sx * ew * 0.07, p[1] - lt * 1.6 - i * 0.004 * h]], e.lashCol || '#24161c', 1.0); } }
    // lower lid
    const lb = (t) => { const mt = 1 - t; return [0, 1].map((k) => mt * mt * mt * O[k] + 3 * mt * mt * t * L1[k] + 3 * mt * t * t * L2[k] + t * t * t * I[k]); };
    const lowPts = []; for (let i = 0; i <= 8; i++) lowPts.push(lb(0.08 + i * (e.lowLen ?? 0.6) / 8));
    line(lowPts, rgba(e.lashCol || '#24161c', e.lowA ?? 0.75), (e.lowW ?? 1.1));
    // crease / double eyelid
    if (e.crease !== false) { const cr = []; for (let i = 0; i <= 6; i++) { const p = bez(0.3 + i * 0.1); cr.push([p[0] + sx * 0.005 * h, p[1] - (e.creaseH ?? 0.045) * h - lt * 0.3]); } line(cr, rgba(mix(skin, '#40202a', 0.6), 0.75), 0.9); }
    if (e.bag) { const bg = []; for (let i = 0; i <= 5; i++) { const p = lb(0.15 + i * 0.12); bg.push([p[0], p[1] + 0.035 * h]); } line(bg, rgba(mix(skin, '#40202a', 0.5), 0.55), 0.8); }
    if (e.after) e.after(sx, { I, O, ex, ey, ew, eh });
  };
  LQ.brow = function (F, b, sx, e) {
    if (S.sil) return; const h = F.h;
    const ex = (e.x ?? 0.19) * h, ey = (e.y ?? 0.585) * h, ew = (e.w ?? 0.19) * h;
    const by = ey - (b.off ?? 0.12) * h; const ang = (b.angle ?? 0.1) * h; const len = b.len ?? 1.15;
    const inner = [sx * (ex - ew * (b.in ?? 0.5)), by + (b.innerDrop ?? 0) * h], outer = [sx * (ex - ew * 0.5 + ew * len), by - ang];
    const mid = V.add(V.lerp(inner, outer, b.peakAt ?? 0.55), [0, -(b.arch ?? 0.03) * h]);
    const p = tube([inner, mid, outer], (t) => (b.w ?? 0.022) * h * (1 - t * 0.75) + 0.004 * h, { start: b.blunt ? 'flat' : 'round' });
    S.ctx.fillStyle = b.col; S.ctx.fill(p);
    if (b.hairs) for (let i = 0; i < 4; i++) { const q = V.lerp(inner, mid, i / 4); line([q, V.add(q, [sx * 0.03 * h, -0.02 * h])], b.col, 0.7); }
  };
  LQ.nose = function (F, n, skin) {
    if (S.sil) return; const h = F.h; const y = (n.y ?? 0.76) * h; const sz = n.size ?? 1; const ln = mix(mul(skin, '#7d4440'), '#2a1414', 0.3);
    const sh = shadeOf(skin, S.skinTint);
    if (n.style === 'bridge') {
      S.ctx.fillStyle = rgba(sh, 0.8); S.ctx.fill(P('M', 0.02 * h, y - 0.22 * h * sz, 'Q', 0.05 * h * sz, y - 0.05 * h, 0.045 * h * sz, y, 'L', 0.01 * h, y + 0.01 * h, 'Q', 0.03 * h, y - 0.1 * h, 0.01 * h, y - 0.22 * h * sz, 'Z'));
      line([[0.045 * h * sz, y - 0.01 * h], [0.025 * h, y + 0.02 * h], [-0.015 * h, y + 0.02 * h]], ln, 1.1);
      line([[-0.045 * h * sz, y + 0.005 * h], [-0.03 * h, y + 0.02 * h]], rgba(ln, 0.6), 0.9);
    } else if (n.style === 'line') {
      line([[0.012 * h, y - 0.1 * h * sz], [0.03 * h * sz, y - 0.01 * h], [0.005 * h, y + 0.012 * h]], ln, 1.0);
      S.ctx.fillStyle = rgba(sh, 0.7); S.ctx.fill(ell(0.022 * h, y + 0.01 * h, 0.02 * h, 0.01 * h));
    } else {
      S.ctx.fillStyle = rgba(sh, 0.85); S.ctx.fill(P('M', 0.01 * h, y - 0.06 * h * sz, 'Q', 0.035 * h * sz, y - 0.01 * h, 0.02 * h, y + 0.012 * h, 'L', 0.0, y + 0.008 * h, 'Z'));
      line([[0.024 * h * sz, y - 0.004 * h], [0.006 * h, y + 0.012 * h]], ln, 1.0);
    }
    if (n.hi !== false) { S.ctx.fillStyle = 'rgba(255,250,245,0.35)'; S.ctx.fill(ell(-0.006 * h, y - 0.035 * h, 0.006 * h, 0.016 * h)); }
  };
  LQ.mouth = function (F, m, skin) {
    if (S.sil) return; const c = S.ctx; const h = F.h; const y = (m.y ?? 0.86) * h; const w = (m.w ?? 0.13) * h; const ln = m.col || mix(mul(skin, '#7a3c3c'), '#2a1018', 0.45);
    const ex = m.expr || 'neutral'; const lip = m.lip || mix(skin, '#c4605e', 0.35);
    if (ex === 'open' || ex === 'shout' || ex === 'grin' || ex === 'gasp') {
      const oh = (m.open ?? (ex === 'shout' ? 0.09 : ex === 'gasp' ? 0.07 : 0.05)) * h; const ww = ex === 'gasp' ? w * 0.6 : w;
      const top = ex === 'grin' ? -0.012 * h : 0;
      const p = P('M', -ww * 0.55, y + top, 'Q', 0, y - 0.012 * h + top, ww * 0.55, y + top, 'Q', ww * 0.42, y + oh, 0, y + oh, 'Q', -ww * 0.42, y + oh, -ww * 0.55, y + top, 'Z');
      c.fillStyle = '#5a1e26'; c.fill(p);
      within(p, () => { c.fillStyle = '#fbf3ee'; c.fill(ell(0, y - 0.005 * h + top, ww * 0.5, 0.02 * h)); c.fillStyle = '#c45a62'; c.fill(ell(0, y + oh, ww * 0.35, oh * 0.45)); });
      stroke(p, ln, 1.2);
    } else {
      const curve = { neutral: 0.006, smile: -0.03, soft: -0.02, frown: 0.022, set: 0.0, smirk: 0, pout: 0.012, sad: 0.018 }[ex] ?? 0;
      let pts;
      if (ex === 'smirk') { const s = m.side || 1; pts = [[-w * 0.5, y + 0.004 * h], [0, y + 0.006 * h], [s * w * 0.42, y - 0.006 * h], [s * w * 0.56, y - 0.022 * h]]; }
      else if (ex === 'pout') pts = [[-w * 0.38, y + 0.004 * h], [-w * 0.15, y - 0.006 * h], [0, y + 0.002 * h], [w * 0.15, y - 0.006 * h], [w * 0.38, y + 0.004 * h]];
      else pts = [[-w * 0.5, y + curve * h * 0.5], [-w * 0.2, y - curve * h * 0.25], [w * 0.2, y - curve * h * 0.25], [w * 0.5, y + curve * h * 0.5]];
      line(pts, ln, m.lw || 1.35);
      // lower lip shadow
      c.fillStyle = rgba(lip, m.lipA ?? 0.65); c.fill(ell(0, y + 0.026 * h, w * 0.26, 0.009 * h));
      if (m.upper) { c.fillStyle = rgba(lip, 0.6); c.fill(P('M', -w * 0.42, y, 'Q', -w * 0.2, y - 0.02 * h, 0, y - 0.012 * h, 'Q', w * 0.2, y - 0.02 * h, w * 0.42, y, 'Z')); }
      if (ex === 'smirk') line([[(m.side || 1) * w * 0.58, y - 0.03 * h], [(m.side || 1) * w * 0.62, y - 0.012 * h]], rgba(ln, 0.5), 0.8);
    }
    if (m.fang) { c.fillStyle = '#fff'; const s = m.fang; c.fill(P('M', s * w * 0.18, y + 0.0, 'L', s * w * 0.28, y, 'L', s * w * 0.23, y + 0.022 * h, 'Z')); stroke(P('M', s * w * 0.18, y + 0.0, 'L', s * w * 0.23, y + 0.022 * h, 'L', s * w * 0.28, y), ln, 0.7); }
  };
  LQ.blush = function (F, fc, a = 0.5, hatch = false) {
    if (S.sil) return; const h = F.h; const c = S.ctx; const col = fc.blushCol || '#ff7f86';
    [-1, 1].forEach((sx) => {
      const x = sx * (fc.blushX ?? 0.24) * h, y = (fc.blushY ?? 0.71) * h; const g = c.createRadialGradient(x, y, 0, x, y, 0.1 * h); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fill(ell(x, y, 0.11 * h, 0.06 * h));
      if (hatch) for (let i = 0; i < 3; i++) line([[x - 0.05 * h + i * 0.035 * h, y + 0.02 * h], [x - 0.03 * h + i * 0.035 * h, y - 0.02 * h]], rgba(mix(col, '#a03040', 0.4), 0.8), 0.8);
    });
  };
  // whole face (after hair-back, neck and garments; before the fringe)
  LQ.face = function (F, fc, expr) {
    const h = F.h; const skin = fc.skin; const fp = LQ.facePath(F, fc);
    LQ.ears(F, fc);
    cel(fp, { fill: skin, shade: mix(skin, shadeOf(skin, S.skinTint), 0.8), k: (fc.shadeK ?? 0.05) * h, sd: [-(fc.shadeK ?? 0.05) * h, -0.012 * h], line: fc.line || mix(mul(skin, '#80463f'), '#2a1414', 0.35), lw: 1.5, rim: true, rimCol: mix(skin, '#fff4e0', 0.5), rimW: 1.4 });
    if (S.sil) return fp;
    const e = Object.assign({}, fc.eye, expr && expr.eye); const b = Object.assign({ col: fc.browCol || '#2a1a1c' }, fc.brow, expr && expr.brow);
    const m = Object.assign({}, fc.mouth, expr && expr.mouth);
    if (fc.under) fc.under(F, fp);
    [-1, 1].forEach((sx) => { LQ.eye(F, Object.assign({}, e, sx < 0 && e.L ? e.L : {}), sx, skin); LQ.brow(F, Object.assign({}, b, sx < 0 && b.L ? b.L : {}), sx, e); });
    LQ.nose(F, fc.nose || {}, skin);
    LQ.mouth(F, m, skin);
    if ((expr && expr.blush) || fc.blushA) LQ.blush(F, fc, (expr && expr.blush) || fc.blushA, expr && expr.hatch);
    if (fc.extra) fc.extra(F, fp, expr || {});
    return fp;
  };

  /* -------- hair helpers */
  // a lock: root centre r, width w, tip t, bend (perpendicular sway in px)
  LQ.lock = function (r, w, t, bend = 0, o = {}) {
    const d = V.sub(t, r); const L = V.len(d); const u = V.norm(d); const n = V.perp(u);
    const rl = V.add(r, V.mul(n, -w / 2)), rr = V.add(r, V.mul(n, w / 2));
    const b2 = o.bend2 ?? bend * 0.6;
    const c1 = V.add(V.add(rl, V.mul(u, L * 0.4)), V.mul(n, bend)), c2 = V.add(V.add(t, V.mul(u, -L * 0.35)), V.mul(n, b2 - w * 0.08));
    const c3 = V.add(V.add(t, V.mul(u, -L * 0.3)), V.mul(n, b2 + w * 0.3)), c4 = V.add(V.add(rr, V.mul(u, L * 0.4)), V.mul(n, bend + w * 0.1));
    const q = P('M', rl[0], rl[1], 'C', c1[0], c1[1], c2[0], c2[1], t[0], t[1], 'C', c3[0], c3[1], c4[0], c4[1], rr[0], rr[1], 'Z');
    const bz = (a, b1, b2, e, tt) => { const m = 1 - tt; return [0, 1].map((k) => m * m * m * a[k] + 3 * m * m * tt * b1[k] + 3 * m * tt * tt * b2[k] + tt * tt * tt * e[k]); };
    const seg1 = [], seg2 = []; for (let i = 0; i <= 6; i++) { seg1.push(bz(rl, c1, c2, t, 0.45 + i * 0.09)); seg2.push(bz(t, c3, c4, rr, i * 0.07)); }
    q.inner = o.noInner ? [] : [seg1, seg2]; q.tip = t;
    return q;
  };
  // paint a hair mass with angel-ring highlight and strand lines
  LQ.hairMass = function (F, paths, o) {
    const p = union(paths); const h = F.h; const col = o.col;
    const ln = o.line || mix(mul(col, '#4a3a50'), '#0a0608', 0.55);
    if (!S.sil) paths.forEach((q) => stroke(q, ln, (o.lw || 1.5) * 2));
    cel(p, { fill: col, shade: o.shade || shadeOf(col, '#a99ab8'), k: o.k ?? 0.12 * h, sd: o.sd, rim: o.rim, rimCol: o.rimCol || mix(col, S.rim, 0.35), rimA: 0.6, line: false, after: (c) => {
      if (o.ring) { // broken glossy band following the skull curvature (anime "angel ring")
        const [cx, cy, r, a0, a1] = o.ring; const N = o.ringN || 5; const w = (o.ringW ?? 0.03) * h;
        c.fillStyle = rgba(o.hiCol || lighten(col, 0.32), o.ringA ?? 0.85);
        for (let i = 0; i < N; i++) {
          const s0 = a0 + (a1 - a0) * (i / N), s1 = s0 + ((a1 - a0) / N) * (i % 2 ? 0.7 : 0.92); const pts = [];
          for (let k = 0; k <= 6; k++) { const a = s0 + (s1 - s0) * (k / 6); const rr = r + (i % 2 ? 0.012 * h : 0); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
          c.fill(tube(pts, (t) => w * Math.pow(Math.sin(Math.PI * t), 0.9) + 0.15, { seg: 3 }));
        }
      }
      if (o.under) o.under(c);
    } });
    if (!S.sil) {
      if (o.inner !== false) paths.forEach((q) => { if (q.inner) q.inner.forEach((seg) => line(seg, rgba(ln, 0.85), o.ilw || 0.9)); });
      if (o.strands) o.strands.forEach((s) => line(s, rgba(lighten(col, 0.35), o.strandA ?? 0.5), 0.75));
      if (o.dark) o.dark.forEach((s) => line(s, rgba(ln, 0.6), 0.8));
    }
    return p;
  };
  // flowing tail (ponytail/braid body) from a list of centre points with width profile
  LQ.tail = function (pts, w, o = {}) { return tube(pts, w, { end: o.end || 'point', start: o.start || 'round', seg: 14 }); };

  // multi-strand tail (ponytail / loose hair clump): strands overlap at the root and fan out toward the tips
  LQ.hairTail = function (pts, wfn, o = {}) {
    const n = o.n || 3; const c = crSample(pts, 14); const m = c.length; const L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + V.len(V.sub(c[i], c[i - 1])));
    const tot = L[m - 1]; const at = (t) => { const d = t * tot; let i = 1; while (i < m - 1 && L[i] < d) i++; const f = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1); const p = V.lerp(c[i - 1], c[i], f); const nm = V.perp(V.norm(V.sub(c[i], c[i - 1]))); return { p, nm }; };
    const res = [];
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0 : i / (n - 1) - 0.5; const lenK = (o.lens && o.lens[i]) || 1 - Math.abs(f) * 0.22 - (i % 2) * 0.05;
      const cp = []; for (let j = 0; j <= 10; j++) { const t = (j / 10) * lenK; const { p, nm } = at(t); const spread = wfn(t) * (o.spread ?? 1.1) * Math.pow(t, 0.8) + wfn(t) * 0.2; cp.push(V.add(p, V.mul(nm, f * spread + (o.curl ? Math.sin(t * 7 + i) * o.curl : 0)))); }
      const tp = tube(cp, (t) => wfn(t * lenK) * (o.share || 0.62) * (t > 0.7 ? 1 - (t - 0.7) / 0.3 * 0.85 : 1), { end: 'point', start: 'round', seg: 6 });
      tp.inner = [cp.slice(4, 10).map((q, k) => V.add(q, V.mul(at((4 + k) / 10 * lenK).nm, wfn(((4 + k) / 10) * lenK) * 0.25 * (f >= 0 ? -1 : 1))))];
      res.push(tp);
    }
    return res;
  };
  // textile textures (painted, not modelled)
  const patCache = {};
  LQ.pattern = function (kind, colr, size = 14, a = 0.35) {
    return (c) => {
      const key = kind + colr + size; let pt = patCache[key];
      if (!pt) {
        const cv = document.createElement('canvas'); const s = 64; cv.width = cv.height = s; const x = cv.getContext('2d'); x.strokeStyle = colr; x.fillStyle = colr; x.lineWidth = 3; x.lineCap = 'round';
        if (kind === 'coin') { [[16, 16], [48, 48]].forEach(([u, v]) => { x.beginPath(); x.arc(u, v, 11, 0, 7); x.stroke(); x.strokeRect(u - 4, v - 4, 8, 8); }); }
        else if (kind === 'cloud') { [[18, 20], [50, 50]].forEach(([u, v]) => { x.beginPath(); x.arc(u - 6, v, 6, Math.PI * 0.9, Math.PI * 2.1); x.arc(u + 5, v - 2, 7, Math.PI * 1.0, Math.PI * 2.2); x.stroke(); x.beginPath(); x.moveTo(u - 12, v + 2); x.quadraticCurveTo(u, v + 8, u + 12, v + 2); x.stroke(); }); }
        else if (kind === 'diamond') { x.beginPath(); x.moveTo(32, 4); x.lineTo(60, 32); x.lineTo(32, 60); x.lineTo(4, 32); x.closePath(); x.stroke(); x.beginPath(); x.arc(32, 32, 4, 0, 7); x.fill(); }
        else if (kind === 'dots') { [[16, 16], [48, 48]].forEach(([u, v]) => { x.beginPath(); x.arc(u, v, 4.5, 0, 7); x.fill(); }); }
        else if (kind === 'flower') { [[18, 18], [50, 50]].forEach(([u, v]) => { for (let k = 0; k < 5; k++) { const an = (k / 5) * Math.PI * 2; x.beginPath(); x.ellipse(u + Math.cos(an) * 6, v + Math.sin(an) * 6, 5, 3, an, 0, 7); x.fill(); } }); }
        else if (kind === 'wave') { for (let r = 0; r < 2; r++) for (let k = 0; k < 2; k++) { const u = k * 32 + (r ? 16 : 0), v = r * 32 + 24; x.beginPath(); x.arc(u + 16, v, 14, Math.PI, 0); x.stroke(); x.beginPath(); x.arc(u + 16, v, 8, Math.PI, 0); x.stroke(); } }
        else if (kind === 'straw') { for (let k = 0; k < 16; k++) { x.beginPath(); x.moveTo(k * 4 + (k % 3), 0); x.lineTo(k * 4 + 2, 64); x.lineWidth = 1.5; x.stroke(); } }
        else if (kind === 'weave') { for (let k = 0; k < 8; k++) { x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, k * 8 + 2); x.lineTo(64, k * 8 + 2); x.stroke(); x.beginPath(); x.moveTo(k * 8 + 2, 0); x.lineTo(k * 8 + 2, 64); x.stroke(); } }
        pt = patCache[key] = cv;
      }
      const pat = c.createPattern(pt, 'repeat'); pat.setTransform(new DOMMatrix().scale(size / 64));
      c.save(); c.globalAlpha = a; c.fillStyle = pat; c.fillRect(-2000, -2000, 4000, 4000); c.restore();
    };
  };
  // embroidered border band along a path, motif repeated along it
  LQ.border = function (pts, w, base, motifCol, motif = 'hui', o = {}) {
    const p = tube(pts, w / 2, { seg: 10 }); cel(p, { fill: base, k: w * 0.4, sd: [0, -w * 0.35], lw: o.lw || 1.1, rim: false });
    if (S.sil) return p; const c = S.ctx; const cl = p.c; let acc = 0; const step = o.step || w * 1.1;
    within(p, () => {
      c.strokeStyle = motifCol; c.fillStyle = motifCol; c.lineWidth = Math.max(0.6, w * 0.1); c.lineCap = 'round';
      for (let i = 1; i < cl.length; i++) {
        const d = V.len(V.sub(cl[i], cl[i - 1])); acc += d; if (acc < step) continue; acc = 0;
        const t = V.norm(V.sub(cl[i], cl[i - 1])); const n = V.perp(t); const q = cl[i]; const r = w * 0.32;
        c.save(); c.translate(q[0], q[1]); c.transform(t[0], t[1], n[0], n[1], 0, 0);
        if (motif === 'hui') { c.beginPath(); c.moveTo(-r, r); c.lineTo(-r, -r); c.lineTo(r, -r); c.lineTo(r, r * 0.3); c.lineTo(-r * 0.2, r * 0.3); c.lineTo(-r * 0.2, -r * 0.3); c.stroke(); }
        else if (motif === 'dot') { c.beginPath(); c.arc(0, 0, r * 0.45, 0, 7); c.fill(); }
        else if (motif === 'wave') { c.beginPath(); c.arc(0, r * 0.5, r * 0.9, Math.PI, 0); c.stroke(); }
        else if (motif === 'flower') { for (let k = 0; k < 4; k++) { c.beginPath(); c.ellipse(Math.cos(k * 1.57) * r * 0.45, Math.sin(k * 1.57) * r * 0.45, r * 0.4, r * 0.22, k * 1.57, 0, 7); c.fill(); } }
        else if (motif === 'cloud') { c.beginPath(); c.arc(-r * 0.4, 0, r * 0.45, Math.PI, Math.PI * 2.2); c.arc(r * 0.4, 0, r * 0.45, Math.PI * 0.8, Math.PI * 2); c.stroke(); }
        c.restore();
      }
      c.strokeStyle = rgba(motifCol, 0.8); c.lineWidth = Math.max(0.5, w * 0.06);
      [p.left, p.right].forEach((side) => { c.beginPath(); side.forEach((q, i) => { const qq = V.lerp(q, cl[i], 0.18); i ? c.lineTo(qq[0], qq[1]) : c.moveTo(qq[0], qq[1]); }); c.stroke(); });
    });
    return p;
  };

  /* -------- props */
  // spear: o {butt, tip, shaftW, shaft, blade, bladeL, bladeW, socket, tassel:{col,len,w,sway}, ferrule}
  LQ.spear = function (F, o) {
    const h = F.h; const A = o.butt, B = o.tip; const d = V.norm(V.sub(B, A)); const n = V.perp(d); const L = V.len(V.sub(B, A));
    const bl = (o.bladeL ?? 0.8) * h, bw = (o.bladeW ?? 0.15) * h, sw = (o.shaftW ?? 0.036) * h; const sock = (o.sockL ?? 0.3) * h;
    const base = V.add(A, V.mul(d, L - bl)); const sockA = V.add(base, V.mul(d, -sock));
    const res = { base, sockA, d, n };
    // shaft (with slight taper toward the head)
    const shaft = tube([A, V.add(A, V.mul(d, L * 0.5)), sockA], [sw * 1.1, sw, sw * 0.85], { seg: 4 });
    cel(shaft, { fill: o.shaft || '#c99a5e', k: sw * 0.9, sd: V.mul(n, sw * 0.9), hi: true, hiK: sw * 0.5, hiA: 0.5, lw: 1.3 });
    if (o.wrap) { // grip wraps
      o.wrap.forEach(([t0, t1, col]) => { const g = tube([V.add(A, V.mul(d, L * t0)), V.add(A, V.mul(d, L * t1))], sw * 1.18, { seg: 2 }); cel(g, { fill: col, k: sw, sd: V.mul(n, sw), lw: 1.1 }); if (!S.sil) for (let t = t0; t < t1; t += 0.012) line([V.add(V.add(A, V.mul(d, L * t)), V.mul(n, -sw * 1.15)), V.add(V.add(A, V.mul(d, L * (t + 0.008))), V.mul(n, sw * 1.15))], deepOf(col), 0.8); });
    }
    // ferrule (槍纂)
    const fr = tube([A, V.add(A, V.mul(d, 0.22 * h))], [sw * 0.6, sw * 1.25], { seg: 3, start: 'round' });
    cel(fr, { fill: o.metal2 || '#8a7458', k: sw, sd: V.mul(n, sw), hi: true, lw: 1.2 });
    // socket with rings
    const sk = tube([sockA, base], [sw * 1.05, sw * 1.45], { seg: 3 });
    cel(sk, { fill: o.metal2 || '#8a7458', k: sw, sd: V.mul(n, sw), hi: true, lw: 1.2 });
    [0.2, 0.55, 0.9].forEach((t) => { const p = V.add(sockA, V.mul(d, sock * t)); line([V.add(p, V.mul(n, -sw * 1.4)), V.add(p, V.mul(n, sw * 1.4))], lineOf(o.metal2 || '#8a7458'), 1); });
    // tassel (紅纓) – hangs with gravity from the socket
    if (o.tassel) {
      const t = o.tassel; const at = V.add(sockA, V.mul(d, sock * 0.35)); const len = (t.len ?? 0.95) * h, tw = (t.w ?? 0.2) * h; const sway = (t.sway ?? 0.1) * h;
      const down = [0, 1]; const g = [at, V.add(at, [sway * 0.4, len * 0.35]), V.add(at, [sway, len * 0.75]), V.add(at, [sway * 1.4, len])];
      const mass = tube(g, [tw * 0.4, tw * 0.95, tw * 1.05, tw * 0.75], { seg: 8 });
      const strands = [];
      for (let i = 0; i < 9; i++) { const f = i / 8 - 0.5; strands.push(LQ.lock(V.add(at, [f * tw * 0.6, len * 0.15]), tw * 0.32, V.add(at, [sway * 1.4 + f * tw * 2.1, len * (1.05 + Math.abs(f) * -0.2 + (i % 2) * 0.08)]), f * tw * 0.5)); }
      const tp = union(mass, ...strands); const tc = t.col || '#c8202c';
      if (!S.sil) [mass, ...strands].forEach((q) => stroke(q, lineOf(tc), 2.4));
      cel(tp, { fill: tc, k: tw * 0.45, sd: [-tw * 0.4, -tw * 0.1], deep: true, hi: true, hiA: 0.5, line: false });
      if (!S.sil) { for (let i = 0; i < 14; i++) { const f = i / 13 - 0.5; line([V.add(at, [f * tw * 0.3, len * 0.12]), V.add(at, [sway * 0.8 + f * tw * 1.4, len * 0.6]), V.add(at, [sway * 1.3 + f * tw * 1.9, len * (0.85 + (i % 3) * 0.06)])], i % 2 ? rgba(deepOf(tc), 0.55) : rgba(lighten(tc, 0.35), 0.45), 0.7); } }
      // binding cord
      const bc = tube([V.add(at, [-tw * 0.35, -0.02 * h]), V.add(at, [tw * 0.35, -0.02 * h])], 0.035 * h, { seg: 2 }); cel(bc, { fill: t.cord || '#e0b34a', k: 2, lw: 1 });
      res.tassel = tp;
    }
    // blade: leaf shape with ridge
    const tip = B; const bW = (k) => V.add(V.add(base, V.mul(d, bl * k[0])), V.mul(n, bw * k[1]));
    const shape = o.blade || 'leaf';
    let bp;
    if (shape === 'leaf') bp = sp([base, bW([0.06, 0.55]), bW([0.32, 1.0]), bW([0.62, 0.62]), [tip[0], tip[1], 1], bW([0.62, -0.62]), bW([0.32, -1.0]), bW([0.06, -0.55])], true);
    else if (shape === 'long') bp = sp([base, bW([0.1, 0.6]), bW([0.45, 0.75]), bW([0.8, 0.45]), [tip[0], tip[1], 1], bW([0.8, -0.45]), bW([0.45, -0.75]), bW([0.1, -0.6])], true);
    else bp = sp([base, bW([0.08, 0.9]), bW([0.2, 1.15]), bW([0.5, 0.55]), [tip[0], tip[1], 1], bW([0.5, -0.55]), bW([0.2, -1.15]), bW([0.08, -0.9])], true);
    cel(bp, { fill: o.steel || '#c9cfd6', k: bw * 0.9, sd: V.mul(n, bw * 0.9), shade: '#7c8696', hi: true, hiCol: '#ffffff', hiA: 0.6, lw: 1.3 });
    if (!S.sil) line([V.add(base, V.mul(d, bl * 0.04)), V.add(base, V.mul(d, bl * 0.9))], '#5a6270', 1.0);
    if (o.collar) { const cp = tube([V.add(base, V.mul(d, -0.03 * h)), V.add(base, V.mul(d, 0.05 * h))], bw * 0.42, { seg: 2 }); cel(cp, { fill: o.collar, k: 2, hi: true, lw: 1.1 }); }
    res.bladePath = bp; res.blade = V.add(base, V.mul(d, bl * 0.4));
    return res;
  };
  // jian (straight sword) — o: {a (hilt end / pommel), b (tip), sheathed, scab, grip, guard, tassel}
  LQ.jian = function (F, o) {
    const h = F.h; const A = o.a, B = o.b; const d = V.norm(V.sub(B, A)); const n = V.perp(d); const L = V.len(V.sub(B, A));
    const gl = (o.gripL ?? 0.62) * h; const gw = 0.045 * h; const guardP = V.add(A, V.mul(d, gl + 0.06 * h));
    const res = { d, n, guard: guardP };
    if (o.tassel) { const t = o.tassel; const at = V.add(A, V.mul(d, -0.03 * h)); const cord = tube([at, V.add(at, [t.sway * 0.4 * h, 0.25 * h]), V.add(at, [t.sway * h * 0.7, 0.45 * h])], 0.012 * h, { seg: 6 }); cel(cord, { fill: t.col, k: 1, lw: 0.9 }); const tb = V.add(at, [t.sway * h * 0.7, 0.45 * h]); const tp = tube([tb, V.add(tb, [t.sway * 0.1 * h, 0.12 * h]), V.add(tb, [t.sway * 0.2 * h, 0.5 * h])], [0.02 * h, 0.05 * h, 0.065 * h], { seg: 6 }); cel(tp, { fill: t.col, k: 0.04 * h, deep: true, lw: 1 }); if (!S.sil) for (let i = -2; i <= 2; i++) line([V.add(tb, [i * 0.012 * h, 0.12 * h]), V.add(tb, [t.sway * 0.2 * h + i * 0.022 * h, 0.5 * h])], deepOf(t.col), 0.6); const knot = ell(tb[0], tb[1] + 0.04 * h, 0.035 * h, 0.04 * h); cel(knot, { fill: t.bead || '#d9c27a', k: 2, hi: true, lw: 1 }); }
    if (o.sheathed) {
      const sA = V.add(guardP, V.mul(d, 0.03 * h)); const sc = tube([sA, B], [0.075 * h, 0.07 * h, 0.06 * h], { seg: 3, end: 'round' });
      cel(sc, { fill: o.scab || '#2a1c20', k: 0.07 * h, sd: V.mul(n, 0.07 * h), hi: true, hiA: 0.5, lw: 1.4 });
      const fit = (t0, t1) => { const p = tube([V.add(sA, V.mul(d, (L - gl) * t0)), V.add(sA, V.mul(d, (L - gl) * t1))], 0.083 * h, { seg: 2 }); cel(p, { fill: o.fit || '#b8975a', k: 0.05 * h, sd: V.mul(n, 0.05 * h), hi: true, lw: 1.1 }); return p; };
      fit(0, 0.07); fit(0.3, 0.35); res.chape = fit(0.9, 1.0);
      if (o.scabDeco) within(sc, () => o.scabDeco(sA, d, n, L - gl));
    } else {
      const bA = V.add(guardP, V.mul(d, 0.02 * h)); const bw = 0.06 * h;
      const bp = sp([V.add(bA, V.mul(n, bw)), V.add(V.add(bA, V.mul(d, (L - gl) * 0.85)), V.mul(n, bw * 0.92)), [B[0], B[1], 1], V.add(V.add(bA, V.mul(d, (L - gl) * 0.85)), V.mul(n, -bw * 0.92)), V.add(bA, V.mul(n, -bw))], true);
      cel(bp, { fill: o.steel || '#cfd5dc', shade: '#7c8696', k: bw * 0.95, sd: V.mul(n, bw * 0.95), hi: true, hiCol: '#fff', lw: 1.3 });
      if (!S.sil) line([bA, V.add(bA, V.mul(d, (L - gl) * 0.93))], '#69717e', 0.9);
      res.blade = bp;
    }
    // grip with diamond wrap
    const gp = tube([V.add(A, V.mul(d, 0.05 * h)), V.add(A, V.mul(d, gl))], [gw * 0.9, gw, gw * 0.95], { seg: 3 });
    cel(gp, { fill: o.grip || '#3a2228', k: gw, sd: V.mul(n, gw), lw: 1.2, after: (c) => { if (S.sil) return; c.strokeStyle = rgba(lighten(o.grip || '#3a2228', 0.25), 0.8); c.lineWidth = 0.8 / S.Z; for (let t = 0.05; t < 0.62; t += 0.07) { const p0 = V.add(V.add(A, V.mul(d, t * h)), V.mul(n, -gw)), p1 = V.add(V.add(A, V.mul(d, (t + 0.07) * h)), V.mul(n, gw)); c.beginPath(); c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke(); } } });
    // pommel & guard
    const pm = ell(A[0], A[1], 0.065 * h, 0.065 * h); cel(pm, { fill: o.fit || '#b8975a', k: 0.04 * h, hi: true, lw: 1.2 });
    const gd = sp([V.add(V.add(guardP, V.mul(n, -0.17 * h)), V.mul(d, -0.03 * h)), V.add(V.add(guardP, V.mul(n, -0.2 * h)), V.mul(d, 0.04 * h)), V.add(guardP, V.mul(d, 0.07 * h)), V.add(V.add(guardP, V.mul(n, 0.2 * h)), V.mul(d, 0.04 * h)), V.add(V.add(guardP, V.mul(n, 0.17 * h)), V.mul(d, -0.03 * h)), V.add(guardP, V.mul(d, -0.06 * h))], true);
    cel(gd, { fill: o.fit || '#b8975a', k: 0.05 * h, hi: true, lw: 1.2 });
    res.gripMid = V.add(A, V.mul(d, gl * 0.55));
    return res;
  };
  // 盤扣 knot buttons
  LQ.knot = function (x, y, s, col, ang = 0) {
    if (S.sil) return; const c = S.ctx; c.save(); c.translate(x, y); c.rotate(ang);
    const p = union(ell(0, 0, s * 0.5, s * 0.5), tube([[s * 0.4, 0], [s * 1.3, -s * 0.15], [s * 2.2, 0]], s * 0.22, { seg: 4, end: 'round' }), tube([[-s * 0.4, 0], [-s * 1.3, s * 0.15], [-s * 2.2, 0]], s * 0.22, { seg: 4, end: 'round' }));
    cel(p, { fill: col, k: s * 0.3, sd: [-s * 0.2, -s * 0.2], hi: true, lw: 0.9, rim: false });
    c.restore();
  };
  LQ.stud = function (x, y, r, col) { if (S.sil) return; const p = ell(x, y, r, r); cel(p, { fill: col, k: r * 0.7, sd: [-r * 0.5, -r * 0.5], hi: true, hiCol: '#fff8e0', hiA: 0.8, lw: 0.8, rim: false }); };

  /* ------------------------------------------------------------------ card / sheet layout */
  const FONT_CN = '"WenQuanYi Zen Hei", "Noto Sans CJK TC", sans-serif';
  const FONT_EN = 'Inter, "DejaVu Sans", sans-serif';
  LQ.FONT_CN = FONT_CN; LQ.FONT_EN = FONT_EN;
  function wrap(c, text, maxW) { // CJK-aware word wrap
    const out = []; let cur = ''; const tokens = text.match(/[　-鿿＀-￯]|[^\s　-鿿＀-￯]+\s*|\s+/g) || [];
    tokens.forEach((t) => { if (c.measureText(cur + t).width > maxW && cur) { out.push(cur.trimEnd()); cur = t.trimStart(); } else cur += t; });
    if (cur) out.push(cur.trimEnd()); return out;
  }
  LQ.wrap = wrap;
  function txt(c, s, x, y, font, col, align = 'left') { c.font = font; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(s, x, y); }
  LQ.txt = txt;
  // draw design D's figure into the current ctx, figure origin at (ox, oy), with scale sc
  const layers = [];
  function layer(i, ref) { if (!layers[i]) { const cv = document.createElement('canvas'); layers[i] = { cv, c: cv.getContext('2d') }; } const L = layers[i]; if (L.cv.width !== ref.width || L.cv.height !== ref.height) { L.cv.width = ref.width; L.cv.height = ref.height; } L.c.setTransform(1, 0, 0, 1, 0, 0); L.c.globalCompositeOperation = 'source-over'; L.c.globalAlpha = 1; L.c.clearRect(0, 0, ref.width, ref.height); return L; }
  LQ.drawFigure = function (D, ox, oy, sc, o = {}) {
    if (!o.sil && o.outline !== false && !o._inner) {
      const main = S.ctx; const dpr = main.getTransform().a; const L1 = layer(0, main.canvas); L1.c.setTransform(main.getTransform());
      S.ctx = L1.c; const F = LQ.drawFigure(D, ox, oy, sc, Object.assign({}, o, { _inner: true })); S.ctx = main;
      // unify the figure: soft key light from the upper left, gentle falloff toward the feet
      { const c = L1.c; c.save(); c.globalCompositeOperation = 'source-atop'; c.setTransform(main.getTransform()); c.translate(ox, oy); c.scale(sc, sc);
        const H = F.H; const g = c.createLinearGradient(-H * 0.3, -H * 0.1, H * 0.35, H * 1.05); g.addColorStop(0, 'rgba(255,248,235,0.10)'); g.addColorStop(0.45, 'rgba(255,248,235,0)'); g.addColorStop(0.8, 'rgba(40,20,50,0.06)'); g.addColorStop(1, 'rgba(40,20,50,0.16)');
        c.fillStyle = g; c.fillRect(-H, -H * 0.6, H * 2, H * 2); c.restore(); }
      const L2 = layer(1, main.canvas); const r = (o.olw || 1.25) * dpr * (o.bust ? 1.3 : 1);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; L2.c.drawImage(L1.cv, Math.cos(a) * r, Math.sin(a) * r); }
      L2.c.globalCompositeOperation = 'source-in'; L2.c.fillStyle = D.ink || '#1f1218'; L2.c.fillRect(0, 0, L2.cv.width, L2.cv.height);
      L2.c.globalCompositeOperation = 'source-over'; L2.c.drawImage(L1.cv, 0, 0);
      main.save(); main.setTransform(1, 0, 0, 1, 0, 0); main.drawImage(L2.cv, 0, 0); main.restore();
      return F;
    }
    const c = S.ctx; c.save(); c.translate(ox, oy); c.scale(sc, sc);
    if (o.mirror) c.scale(-1, 1);
    const prevZ = S.Z, prevSil = S.sil; S.Z = (o.Z || 1) * sc; S.sil = !!o.sil;
    const F = LQ.fig(Object.assign({}, D.body, { back: !!o.back }));
    F.bust = !!o.bust; F.view = o.back ? 'back' : 'front';
    S.rim = D.rim || '#ffe2b8';
    D.draw(F, o);
    S.Z = prevZ; S.sil = prevSil; c.restore();
    return F;
  };
  LQ.silhouette = function (D, ox, oy, sc, o = {}) {
    // solid black silhouette rendered through an offscreen canvas so overlaps merge cleanly
    const c = S.ctx; const can = document.createElement('canvas'); can.width = c.canvas.width; can.height = c.canvas.height; const cx = can.getContext('2d'); cx.setTransform(c.getTransform());
    const prev = S.ctx; LQ.begin(cx, { sil: true }); S.ctx = cx;
    LQ.drawFigure(D, ox, oy, sc, Object.assign({ sil: true }, o));
    S.ctx = prev; LQ.begin(prev, {});
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-in'; cx.fillStyle = o.col || '#1c1418'; cx.fillRect(0, 0, can.width, can.height);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(can, 0, 0); c.restore();
  };
  // paper texture
  LQ.paper = function (c, x, y, w, h, base, seed = 1) {
    c.fillStyle = base; c.fillRect(x, y, w, h);
    let s = seed * 9973; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    for (let i = 0; i < (w * h) / 90; i++) { c.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(80,60,40,0.05)'; c.fillRect(x + rnd() * w, y + rnd() * h, 1 + rnd() * 1.5, 1); }
    c.restore();
  };
  // callout with leader line. side -1 = label on left edge, +1 = right edge
  LQ.callouts = function (c, list, F, ox, oy, sc, box) {
    const items = list.map((it) => { const a = F.anchors[it.at]; if (!a) { console.warn('missing anchor', it.at); return null; } return Object.assign({ p: [ox + a[0] * sc, oy + a[1] * sc] }, it); }).filter(Boolean);
    [-1, 1].forEach((side) => {
      const its = items.filter((i) => i.side === side).sort((a, b) => a.p[1] - b.p[1]);
      let lastY = box.y + 4;
      its.forEach((it) => {
        let ly = Math.max(it.ly ?? it.p[1], lastY + 2); const lx = side < 0 ? box.x + 4 : box.x + box.w - 4;
        c.font = `bold 10.5px ${FONT_CN}`; const w1 = c.measureText(it.cn).width; c.font = `8.6px ${FONT_EN}`;
        const enL = wrap(c, it.en, 84); const w2 = Math.max(...enL.map((s) => c.measureText(s).width)); const bw = Math.max(w1, w2) + 10; const bh = 15 + enL.length * 10.5;
        const bx = side < 0 ? lx : lx - bw; const by = ly - 10;
        // leader
        const ex = side < 0 ? bx + bw : bx; const ey = by + 8;
        c.strokeStyle = 'rgba(40,26,30,0.75)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + side * -6, ey); c.lineTo(it.p[0], it.p[1]); c.stroke();
        c.fillStyle = '#fffaf0'; c.strokeStyle = 'rgba(40,26,30,0.85)'; c.beginPath(); c.arc(it.p[0], it.p[1], 2.6, 0, 7); c.fill(); c.stroke();
        c.fillStyle = 'rgba(253,249,240,0.9)'; c.strokeStyle = 'rgba(60,40,44,0.35)'; c.beginPath(); c.roundRect(bx, by, bw, bh, 3); c.fill(); c.stroke();
        txt(c, it.cn, bx + 5, by + 12, `bold 10.5px ${FONT_CN}`, '#2a1a1f');
        enL.forEach((s, i) => txt(c, s, bx + 5, by + 23 + i * 10.5, `italic 8.6px ${FONT_EN}`, '#5a4a4e'));
        lastY = by + bh + 2 + 10;
      });
    });
  };
  LQ.palette = function (c, pal, x, y, w) {
    txt(c, '配色 PALETTE', x, y + 9, `bold 9px ${FONT_EN}`, '#6a585c');
    pal.forEach((p, i) => {
      const yy = y + 15 + i * 21; c.fillStyle = p[0]; c.beginPath(); c.roundRect(x, yy, 26, 17, 3); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; c.stroke();
      txt(c, p[1], x + 32, yy + 8.5, `bold 9.5px ${FONT_CN}`, '#2a1a1f'); txt(c, p[2] + '  ' + p[0].toUpperCase(), x + 32, yy + 17, `7.8px ${FONT_EN}`, '#6a585c');
    });
  };
})();

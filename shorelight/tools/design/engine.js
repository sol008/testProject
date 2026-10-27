// 彼岸燈 — character design tool: portrait engine
// Adapted (copied) from js/gfx/portraits.js so this tool stays standalone while that file is
// being edited. Exposes window.DZ = { build(spec, expr, rs), paint(ctx, spec, expr, x, y, w, h, rs), kit }.
'use strict';
(() => {
  const U = G.U;
  const PW = 300, PH = 340;
  const TAU = Math.PI * 2;
  const EXPRS = ['normal', 'smile', 'laugh', 'sad', 'cry', 'angry', 'surprise', 'think', 'shy', 'hurt', 'serious', 'smug'];
  const defs = {};

  // ------------------------------------------------------------------ geometry helpers
  function bezPt(p, t) {
    const u = 1 - t;
    if (p.length === 4) return [U.lerp(p[0], p[2], t), U.lerp(p[1], p[3], t)];
    if (p.length === 6) return [u * u * p[0] + 2 * u * t * p[2] + t * t * p[4], u * u * p[1] + 2 * u * t * p[3] + t * t * p[5]];
    return [
      u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6],
      u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7],
    ];
  }
  function sample(p, n) {
    const out = [];
    if (p.length > 8) { // poly-cubic chain: x0,y0, (c1,c2,p)*k
      const segs = (p.length - 2) / 6;
      const per = Math.max(2, Math.round(n / segs));
      for (let s = 0; s < segs; s++) {
        const q = p.slice(s * 6, s * 6 + 8);
        for (let i = s ? 1 : 0; i <= per; i++) out.push(bezPt(q, i / per));
      }
      return out;
    }
    for (let i = 0; i <= n; i++) out.push(bezPt(p, i / n));
    return out;
  }
  // smooth curve through points (quadratic mid-point method)
  function through(c, pts, move) {
    if (move) c.moveTo(pts[0][0], pts[0][1]);
    else c.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const l = pts[pts.length - 1];
    c.lineTo(l[0], l[1]);
  }
  function blob(c, pts) { // closed smooth shape through points
    const n = pts.length;
    c.beginPath();
    const m0 = [(pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2];
    c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      c.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    c.closePath();
  }
  function ell(c, x, y, rx, ry, rot) {
    c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, TAU);
  }
  // tapered ribbon along a bezier spine. Returns sampled geometry.
  function ribbonPath(c, sp, w, o) {
    o = o || {};
    const n = o.n || 18;
    const pts = sample(sp, n);
    const N = pts.length - 1;
    const p = o.p != null ? o.p : 0.9, bulge = o.bulge != null ? o.bulge : 0.25, tipw = o.tipw || 0, w0 = o.w0 != null ? o.w0 : 1;
    const L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const t = i / N;
      let ww = w * (w0 + (1 - w0) * Math.min(1, t * 4)) * Math.pow(1 - t, p) * (1 + bulge * Math.sin(Math.PI * t)) + tipw * t;
      ww /= 2;
      const sk = o.skew || 0;
      L.push([pts[i][0] - ty * ww * (1 + sk), pts[i][1] + tx * ww * (1 + sk)]);
      R.push([pts[i][0] + ty * ww * (1 - sk), pts[i][1] - tx * ww * (1 - sk)]);
    }
    c.beginPath();
    through(c, L, true);
    through(c, R.slice().reverse(), false);
    c.closePath();
    return { pts, L, R };
  }

  // ------------------------------------------------------------------ canvas helpers
  let RS = 1; // render scale of the cache currently being built
  function layer() { return U.makeCanvas(PW, PH, RS); }
  let tmpC = null;
  function tmpLayer() {
    if (!tmpC || tmpC.rs !== RS) { tmpC = layer(); tmpC.rs = RS; }
    const c = tmpC.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, tmpC.width, tmpC.height);
    c.setTransform(RS, 0, 0, RS, 0, 0);
    return tmpC;
  }
  function blit(dst, src, op, alpha, dx, dy) {
    const c = dst.getContext('2d');
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = op || 'source-over';
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.drawImage(src, (dx || 0) * RS, (dy || 0) * RS);
    c.restore();
  }
  // tint a copy of a layer with a flat colour
  function silhouette(src, color) {
    const t = tmpLayer();
    blit(t, src);
    const c = t.getContext('2d');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, t.width, t.height);
    c.restore();
    return t;
  }
  // rim light on top-left edges (light comes from top-left)
  function rim(lay, color, alpha, d) {
    d = d || 2.5;
    const t = tmpLayer();
    blit(t, lay);
    blit(t, lay, 'destination-out', 1, d, d * 0.8);
    const c = t.getContext('2d');
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, t.width, t.height);
    c.restore();
    blit(lay, t, 'source-atop', alpha);
  }
  function headT(c, P) {
    c.translate(P.hx, P.hy);
    if (P.rot) c.rotate(P.rot);
    c.scale(P.s, P.s);
  }
  function bodyT(c, P) {
    c.translate(P.hx + (P.bx || 0), P.hy + (P.by || 0));
    c.scale(P.s * (P.bs || 1), P.s * (P.bs || 1));
  }

  // ------------------------------------------------------------------ palettes
  const SKIN = {
    fair: { base: '#fde7da', mid: '#f8d3c3', shade: '#eab3a6', deep: '#d58f86', line: '#b86f6a', blush: '#ff8f96', lip: '#c4626a' },
    warm: { base: '#f9dcc7', mid: '#f1c6ad', shade: '#dea48c', deep: '#c27f6c', line: '#a3604f', blush: '#f58a80', lip: '#b8584f' },
    tan: { base: '#efc9a6', mid: '#e3b28c', shade: '#c98f6c', deep: '#a8704f', line: '#8d5a40', blush: '#e57d6c', lip: '#a3534a' },
    old: { base: '#efcfb6', mid: '#e1b89c', shade: '#c99a80', deep: '#a77862', line: '#8d5c4c', blush: '#e08878', lip: '#a05a50' },
    pale: { base: '#f3ece9', mid: '#e3d8d8', shade: '#c9b9c0', deep: '#a693a3', line: '#8c7488', blush: '#e6a2b0', lip: '#b07080' },
    ghost: { base: '#dff0fb', mid: '#c4def2', shade: '#9fc0e0', deep: '#7c9cc6', line: '#5e7fae', blush: '#a8c8f0', lip: '#7b92c2' },
  };

  // face presets (head-local units)
  const FACE = {
    f: {
      jaw: 0.98, chinX: 15, chinY: 78, cheek: 0, round: 0, jawY: 46,
      eyeX: -24, farX: 40, eyeY: 4, eyeW: 41, eyeH: 37, farW: 0.68, slant: 0.05,
      browY: -25, browTh: 2.6, browCol: null,
      noseX: 26, noseY: 30, nose: 'f', mouthX: 18, mouthY: 51, mouthW: 1,
      lash: 3.4, lashStyle: 'f', neckW: 15, neckX: 2, ear: false, blush: 0.18,
      iris: 1,
    },
    m: {
      jaw: 1.0, chinX: 16, chinY: 90, cheek: -1, round: 0, jawY: 50, chinW: 5,
      eyeX: -24, farX: 40, eyeY: 3, eyeW: 38, eyeH: 25, farW: 0.68, slant: 0.07,
      browY: -19, browTh: 3.9,
      noseX: 29, noseY: 35, nose: 'm', mouthX: 19, mouthY: 61, mouthW: 1.05,
      lash: 2.6, lashStyle: 'm', neckW: 21, neckX: 2, ear: true, blush: 0.04,
      iris: 0.97,
    },
    old_m: {
      jaw: 1.02, chinX: 15, chinY: 88, cheek: 1, round: 0, jawY: 52, chinW: 4,
      eyeX: -24, farX: 40, eyeY: 4, eyeW: 34, eyeH: 21, farW: 0.68, slant: 0.02,
      browY: -18, browTh: 4.2,
      noseX: 29, noseY: 34, nose: 'old', mouthX: 18, mouthY: 60, mouthW: 1.05,
      lash: 2.1, lashStyle: 'm', neckW: 22, neckX: 2, ear: true, blush: 0.06,
      iris: 0.9,
    },
    old_f: {
      jaw: 1.02, chinX: 15, chinY: 82, cheek: 1, round: 0.2,
      eyeX: -24, farX: 40, eyeY: 4, eyeW: 34, eyeH: 23, farW: 0.68, slant: 0.02,
      browY: -20, browTh: 3,
      noseX: 28, noseY: 33, nose: 'old', mouthX: 18, mouthY: 57, mouthW: 1,
      lash: 2.3, lashStyle: 'm', neckW: 18, neckX: 2, ear: false, blush: 0.1,
      iris: 0.92,
    },
    child: {
      jaw: 0.96, chinX: 12, chinY: 72, cheek: 2, round: 0.6, jawY: 42,
      eyeX: -24, farX: 38, eyeY: 8, eyeW: 41, eyeH: 40, farW: 0.68, slant: 0.0,
      browY: -20, browTh: 2.6,
      noseX: 24, noseY: 31, nose: 'f', mouthX: 15, mouthY: 48, mouthW: 0.9,
      lash: 2.8, lashStyle: 'f', neckW: 14, neckX: 2, ear: false, blush: 0.3,
      iris: 1.02,
    },
  };

  // ------------------------------------------------------------------ expressions
  const EX = {
    normal: { open: 1, mouth: 'neutral' },
    smile: { open: 0.86, lift: 0.3, brIn: -1.5, brOut: -1, mouth: 'smile', blush: 0.25 },
    laugh: { shape: 'happy', brIn: -4, brOut: -3, mouth: 'laugh', blush: 0.4 },
    sad: { open: 0.74, outD: 0.12, gy: 0.35, gx: 0.02, brIn: -6, brOut: 3, mouth: 'frown', wet: 1 },
    cry: { open: 0.66, outD: 0.1, gy: 0.25, brIn: -7, brOut: 3, mouth: 'cry', tears: 1, wet: 1, blush: 0.45 },
    angry: { open: 0.92, inD: 0.42, irisS: 0.9, brIn: 6, brOut: -3, mouth: 'shout', vein: 1, pupil: 0.82 },
    surprise: { open: 1.18, lift: -0.08, pupil: 0.55, irisS: 0.8, brIn: -8, brOut: -7, mouth: 'o' },
    think: { open: 0.72, gx: 0.55, gy: -0.45, brIn: 1, brOut: 0, brFar: -5, mouth: 'pout' },
    shy: { open: 0.74, gx: -0.25, gy: 0.4, lift: 0.12, brIn: -4, brOut: 1, mouth: 'wavy', blush: 1, shyLines: 1 },
    hurt: { open: 0.5, inD: 0.18, nearShape: 'squeeze', brIn: 4, brOut: -1, brKnit: 1, mouth: 'grit', sweat: 1, pale: 1 },
    serious: { open: 0.82, inD: 0.2, brIn: 3, brOut: 0, mouth: 'flat' },
    smug: { open: 0.6, lift: 0.14, gx: 0.2, brIn: 2, brOut: 0, brFar: -4, mouth: 'smirk' },
  };
  function exprFor(sp, expr) {
    const E = Object.assign({ open: 1, lift: 0, inD: 0, outD: 0, gx: 0, gy: 0, pupil: 1, brIn: 0, brOut: 0, brFar: 0, blush: 0 }, EX[expr] || EX.normal);
    E.name = expr;
    if (sp.mouths && sp.mouths[expr]) E.mouth = sp.mouths[expr];
    if (sp.expr) sp.expr(E, expr);
    return E;
  }

  // ------------------------------------------------------------------ face
  function facePath(c, F) {
    const j = F.jaw, cy = F.chinY, cx = F.chinX, ch = F.cheek || 0, r = F.round || 0, jy = F.jawY || 52, cw = F.chinW || 0;
    c.beginPath();
    c.moveTo(-64, -44);
    c.bezierCurveTo(-66 - ch, -8, -63 - ch, jy - 30 + r * 8, -50 * j - r * 5, jy + r * 6);
    c.bezierCurveTo(-40 * j - r * 7, jy + 14 + r * 5, cx - cw - 22 - r * 8, cy - 4 - r * 1, cx - cw, cy);
    if (cw) c.quadraticCurveTo(cx, cy + 1, cx + cw * 0.6, cy - 1);
    c.bezierCurveTo(cx + cw * 0.6 + 11 + r * 8, cy - 1 - r * 1, 38 * j + r * 6, jy + 16 + r * 3, 47 * j + r * 4, jy + r * 2);
    c.bezierCurveTo(55 + ch * 0.6, jy - 12, 61 + ch * 0.5, 22, 61 + ch * 0.4, 2);
    c.bezierCurveTo(63, -16, 62, -34, 57, -50);
    c.bezierCurveTo(40, -112, -68, -112, -64, -44);
    c.closePath();
  }
  function farContour(c, F) {
    const j = F.jaw, cy = F.chinY, cx = F.chinX, ch = F.cheek || 0, r = F.round || 0, jy = F.jawY || 52, cw = F.chinW || 0;
    c.beginPath();
    c.moveTo(57, -50);
    c.bezierCurveTo(62, -34, 63, -16, 61 + ch * 0.4, 2);
    c.bezierCurveTo(61 + ch * 0.5, 22, 55 + ch * 0.6, jy - 12, 47 * j + r * 4, jy + r * 2);
    c.bezierCurveTo(38 * j + r * 6, jy + 16 + r * 3, cx + cw * 0.6 + 11 + r * 8, cy - 1 - r * 1, cx + cw * 0.6, cy - 1);
    if (cw) c.quadraticCurveTo(cx, cy + 1, cx - cw, cy);
  }
  function nearContour(c, F) {
    const j = F.jaw, cy = F.chinY, cx = F.chinX, ch = F.cheek || 0, r = F.round || 0, jy = F.jawY || 52, cw = F.chinW || 0;
    c.beginPath();
    c.moveTo(-64, -44);
    c.bezierCurveTo(-66 - ch, -8, -63 - ch, jy - 30 + r * 8, -50 * j - r * 5, jy + r * 6);
    c.bezierCurveTo(-40 * j - r * 7, jy + 14 + r * 5, cx - cw - 22 - r * 8, cy - 4 - r * 1, cx - cw, cy);
  }
  function earPath(c) {
    c.beginPath();
    c.moveTo(-58, -4);
    c.bezierCurveTo(-70, -12, -78, -2, -74, 12);
    c.bezierCurveTo(-71, 24, -64, 32, -56, 30);
    c.closePath();
  }
  function drawNeck(c, sp, F) {
    const S = sp.skin, w = F.neckW, x = F.neckX;
    c.beginPath();
    c.moveTo(x - w, 40);
    c.bezierCurveTo(x - w, 70, x - w - 2, 92, x - w - 10, 108);
    c.bezierCurveTo(x - w - 30, 116, -60, 130, -60, 200);
    c.lineTo(80, 200);
    c.bezierCurveTo(80, 130, x + w + 30, 114, x + w + 10, 108);
    c.bezierCurveTo(x + w + 2, 92, x + w, 70, x + w + 2, 40);
    c.closePath();
    const g = c.createLinearGradient(x - w, 0, x + w, 0);
    g.addColorStop(0, S.mid); g.addColorStop(0.5, S.base); g.addColorStop(1, S.shade);
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    const gd = c.createLinearGradient(0, 96, 0, 180);
    gd.addColorStop(0, U.rgba(S.shade, 0)); gd.addColorStop(0.3, U.rgba(S.shade, 0.35)); gd.addColorStop(1, U.rgba(S.deep, 0.6));
    c.fillStyle = gd; c.fillRect(-80, 96, 170, 110);
    // jaw shadow
    c.save(); c.translate(3, 12); facePath(c, F); c.fillStyle = U.rgba(S.deep, 0.55); c.fill(); c.restore();
    c.save(); c.translate(5, 18); facePath(c, F); c.fillStyle = U.rgba(S.deep, 0.25); c.fill(); c.restore();
    c.restore();
    c.strokeStyle = U.rgba(S.line, 0.8); c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x - w, 50); c.bezierCurveTo(x - w, 70, x - w - 2, 92, x - w - 10, 108); c.stroke();
    c.beginPath(); c.moveTo(x + w + 2, 50); c.bezierCurveTo(x + w, 70, x + w + 2, 92, x + w + 10, 108); c.stroke();
    // collar-bone hint
    c.strokeStyle = U.rgba(S.shade, 0.7); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(x - 6, 100); c.quadraticCurveTo(x + 4, 104, x + 10, 98); c.stroke();
  }

  function drawFaceBase(c, sp, F, E) {
    const S = sp.skin;
    // ear behind face contour
    if (F.ear) {
      earPath(c);
      c.fillStyle = S.mid; c.fill();
      c.strokeStyle = S.line; c.lineWidth = 1.4; c.stroke();
      c.strokeStyle = U.rgba(S.deep, 0.8); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-61, 2); c.bezierCurveTo(-70, -2, -71, 10, -68, 16); c.quadraticCurveTo(-65, 22, -62, 20); c.stroke();
    }
    facePath(c, F);
    const g = c.createRadialGradient(-10, 10, 10, 0, 10, 90);
    g.addColorStop(0, S.base); g.addColorStop(0.75, S.base); g.addColorStop(1, S.mid);
    c.fillStyle = g; c.fill();
  }
  function shadeFace(c, sp, F, E) {
    const S = sp.skin;
    c.save();
    c.globalCompositeOperation = 'source-atop';
    // far-side cel band
    farContour(c, F);
    c.strokeStyle = U.rgba(S.shade, 0.75); c.lineWidth = 9; c.stroke();
    c.strokeStyle = U.rgba(S.mid, 0.6); c.lineWidth = 16; c.stroke();
    // under-jaw soft
    nearContour(c, F);
    c.strokeStyle = U.rgba(S.mid, 0.55); c.lineWidth = 8; c.stroke();
    // cheek blush
    const bl = Math.min(1, (F.blush || 0) + (E.blush || 0) * 0.8);
    if (bl > 0) {
      const ck = (x, y, r, a) => {
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, U.rgba(S.blush, a)); gr.addColorStop(1, U.rgba(S.blush, 0));
        c.fillStyle = gr; c.beginPath(); c.ellipse(x, y, r, r * 0.62, 0, 0, TAU); c.fill();
      };
      ck(F.eyeX - 4, F.eyeY + 30, 20, 0.6 * bl);
      ck(F.farX + 6, F.eyeY + 29, 13, 0.55 * bl);
    }
    if (E.pale) {
      const gp = c.createLinearGradient(0, -60, 0, 20);
      gp.addColorStop(0, 'rgba(110,120,190,0.35)'); gp.addColorStop(1, 'rgba(110,120,190,0)');
      c.fillStyle = gp; c.fillRect(-90, -80, 180, 100);
    }
    // nose-bridge highlight
    c.fillStyle = 'rgba(255,255,255,0.35)';
    ell(c, F.noseX - 4, F.noseY - 10, 2, 5, -0.2); c.fill();
    c.restore();
  }
  function faceLines(c, sp, F) {
    const S = sp.skin;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    nearContour(c, F); c.strokeStyle = S.line; c.lineWidth = 1.6; c.stroke();
    farContour(c, F); c.strokeStyle = S.line; c.lineWidth = 1.8; c.stroke();
    c.restore();
  }
  function drawNose(c, sp, F) {
    const S = sp.skin, x = F.noseX, y = F.noseY;
    c.save(); c.lineCap = 'round';
    if (F.nose === 'm' || F.nose === 'old') {
      c.strokeStyle = U.rgba(S.line, 0.5); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(x - 9, y - 26); c.quadraticCurveTo(x - 2, y - 12, x + 1, y - 2); c.stroke();
      c.strokeStyle = U.rgba(S.line, 0.9); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x + 1, y - 3); c.quadraticCurveTo(x + 4, y + 1, x - 1, y + 3); c.stroke();
      c.fillStyle = U.rgba(S.deep, 0.35);
      ell(c, x - 7, y + 2, 4, 1.8, 0.1); c.fill();
    } else {
      c.fillStyle = U.rgba(S.deep, 0.5);
      c.beginPath(); c.moveTo(x - 1, y - 6); c.quadraticCurveTo(x + 3, y, x - 2, y + 2); c.quadraticCurveTo(x - 1, y - 2, x - 1, y - 6); c.fill();
      c.strokeStyle = U.rgba(S.line, 0.75); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x + 0.5, y - 2); c.quadraticCurveTo(x + 2.5, y + 1, x - 2, y + 2.2); c.stroke();
    }
    c.restore();
  }

  function wrinkles(c, sp, F, lvl) {
    const S = sp.skin;
    c.save(); c.lineCap = 'round';
    c.strokeStyle = U.rgba(S.line, 0.5); c.lineWidth = 1.1;
    const nW = F.eyeW, fW = F.eyeW * F.farW;
    const nx = F.eyeX - nW / 2 - 3, fx = F.farX + fW / 2 + 3, y = F.eyeY;
    // crow's feet
    for (let k = 0; k < 2 + lvl; k++) {
      c.beginPath(); c.moveTo(nx - 1, y + 1 + k * 3 - 3); c.quadraticCurveTo(nx - 6, y + k * 4 - 4, nx - 10 - k, y - 4 + k * 6); c.stroke();
    }
    for (let k = 0; k < 1 + lvl; k++) {
      c.beginPath(); c.moveTo(fx, y + k * 4 - 2); c.lineTo(fx + 6, y - 3 + k * 6); c.stroke();
    }
    // under-eye bags
    c.strokeStyle = U.rgba(S.line, 0.38);
    c.beginPath(); c.moveTo(F.eyeX - nW * 0.35, y + F.eyeH * 0.75); c.quadraticCurveTo(F.eyeX, y + F.eyeH * 0.95 + 2, F.eyeX + nW * 0.35, y + F.eyeH * 0.7); c.stroke();
    c.beginPath(); c.moveTo(F.farX - fW * 0.35, y + F.eyeH * 0.7); c.quadraticCurveTo(F.farX, y + F.eyeH * 0.92 + 2, F.farX + fW * 0.4, y + F.eyeH * 0.7); c.stroke();
    // nasolabial folds
    c.strokeStyle = U.rgba(S.line, 0.55); c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(F.noseX - 16, F.noseY - 2); c.bezierCurveTo(F.noseX - 22, F.noseY + 10, F.mouthX - 18, F.mouthY - 6, F.mouthX - 16, F.mouthY + 6); c.stroke();
    c.beginPath(); c.moveTo(F.noseX + 9, F.noseY + 4); c.quadraticCurveTo(F.mouthX + 16, F.mouthY - 6, F.mouthX + 13, F.mouthY + 4); c.stroke();
    if (lvl >= 2) {
      c.strokeStyle = U.rgba(S.line, 0.4); c.lineWidth = 1.1;
      // marionette lines & chin
      c.beginPath(); c.moveTo(F.mouthX - 12, F.mouthY + 6); c.quadraticCurveTo(F.mouthX - 14, F.mouthY + 14, F.mouthX - 18, F.mouthY + 20); c.stroke();
      c.beginPath(); c.moveTo(F.mouthX + 10, F.mouthY + 6); c.quadraticCurveTo(F.mouthX + 12, F.mouthY + 12, F.mouthX + 14, F.mouthY + 16); c.stroke();
      // cheek lines
      c.beginPath(); c.moveTo(F.eyeX - 20, y + 26); c.quadraticCurveTo(F.eyeX - 14, y + 34, F.eyeX - 16, y + 44); c.stroke();
      // forehead
      for (let k = 0; k < 3; k++) {
        c.beginPath(); c.moveTo(-30 + k * 2, -40 - k * 7); c.quadraticCurveTo(0, -44 - k * 7, 30 - k * 3, -40 - k * 7); c.stroke();
      }
    }
    if (lvl >= 3) {
      c.strokeStyle = U.rgba(S.line, 0.35);
      for (let k = 0; k < 3; k++) {
        c.beginPath(); c.moveTo(F.mouthX - 6 + k * 5, F.mouthY + 4); c.lineTo(F.mouthX - 7 + k * 5, F.mouthY + 8); c.stroke();
        c.beginPath(); c.moveTo(F.mouthX - 6 + k * 5, F.mouthY - 3); c.lineTo(F.mouthX - 7 + k * 5, F.mouthY - 7); c.stroke();
      }
      c.beginPath(); c.moveTo(F.eyeX + 4, y + 22); c.quadraticCurveTo(F.eyeX + 14, y + 26, F.eyeX + 22, y + 22); c.stroke();
    }
    c.restore();
  }

  // ------------------------------------------------------------------ mouth
  function drawMouth(c, sp, F, E) {
    const S = sp.skin;
    const mx = F.mouthX, my = F.mouthY, k = F.mouthW || 1;
    const lineC = U.mix(S.lip, '#3a1a20', 0.35);
    const inC = '#7a2836', tongue = '#e5707c', teeth = '#fffaf7';
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    const stroke = (lw, a) => { c.strokeStyle = U.rgba(lineC, a == null ? 0.95 : a); c.lineWidth = lw; c.stroke(); };
    const lowerLip = (y, w) => {
      c.beginPath(); c.moveTo(mx - w * k, my + y); c.quadraticCurveTo(mx, my + y + 1.5, mx + w * 0.8 * k, my + y);
      c.strokeStyle = U.rgba(S.deep, 0.3); c.lineWidth = 1.4; c.stroke();
    };
    const openMouth = (pathFn, tongueY, teethTop, teethBot) => {
      pathFn(); c.fillStyle = inC; c.fill();
      c.save(); pathFn(); c.clip();
      if (tongueY != null) { c.fillStyle = tongue; ell(c, mx - 1, my + tongueY, 10 * k, 6, 0); c.fill(); }
      if (teethTop) { c.fillStyle = teeth; c.fillRect(mx - 20, my - 12, 40, 12 + teethTop); }
      if (teethBot) { c.fillStyle = teeth; c.fillRect(mx - 20, my + teethBot, 40, 20); }
      if (sp.gap && teethTop) { c.fillStyle = inC; c.fillRect(mx - 1.5, my - 6, 3.2, 12); }
      c.restore();
      pathFn(); stroke(1.6);
    };
    switch (E.mouth) {
      case 'smile':
        c.beginPath(); c.moveTo(mx - 11 * k, my - 3); c.quadraticCurveTo(mx - 1, my + 5, mx + 8 * k, my - 4); stroke(1.8);
        lowerLip(6, 3);
        break;
      case 'bigsmile': // closed grin showing upper teeth
        openMouth(() => { c.beginPath(); c.moveTo(mx - 12 * k, my - 4); c.quadraticCurveTo(mx, my - 1, mx + 9 * k, my - 5); c.quadraticCurveTo(mx, my + 9, mx - 12 * k, my - 4); c.closePath(); }, 7, 2.2, null);
        break;
      case 'laugh':
        openMouth(() => {
          c.beginPath(); c.moveTo(mx - 13 * k, my - 4); c.quadraticCurveTo(mx - 1, my - 1, mx + 10 * k, my - 5);
          c.bezierCurveTo(mx + 9 * k, my + 9, mx - 1, my + 16, mx - 7 * k, my + 11);
          c.quadraticCurveTo(mx - 12 * k, my + 6, mx - 13 * k, my - 4); c.closePath();
        }, 10, 2.4, null);
        break;
      case 'frown':
        c.beginPath(); c.moveTo(mx - 8 * k, my + 2); c.quadraticCurveTo(mx - 1, my - 2.5, mx + 6 * k, my + 1.5); stroke(1.6);
        lowerLip(6, 2);
        break;
      case 'cry':
        openMouth(() => {
          c.beginPath(); c.moveTo(mx - 10 * k, my + 2); c.quadraticCurveTo(mx - 5, my - 3, mx, my - 2); c.quadraticCurveTo(mx + 5, my - 3, mx + 8 * k, my + 1);
          c.quadraticCurveTo(mx + 2, my + 10, mx - 3, my + 9); c.quadraticCurveTo(mx - 8, my + 7, mx - 10 * k, my + 2); c.closePath();
        }, 9, null, null);
        break;
      case 'shout':
        openMouth(() => {
          c.beginPath(); c.moveTo(mx - 9 * k, my - 2); c.quadraticCurveTo(mx, my - 4.5, mx + 7 * k, my - 3);
          c.quadraticCurveTo(mx + 11 * k, my + 6, mx + 9 * k, my + 10); c.quadraticCurveTo(mx - 1, my + 12, mx - 11 * k, my + 10);
          c.quadraticCurveTo(mx - 13 * k, my + 4, mx - 9 * k, my - 2); c.closePath();
        }, 11, 0.8, 8.5);
        break;
      case 'o':
        openMouth(() => { ell(c, mx - 1, my + 2, 4.6 * k, 6.2, 0); }, 6, null, null);
        break;
      case 'pout':
        c.beginPath(); c.moveTo(mx - 5 * k, my + 1); c.quadraticCurveTo(mx - 1, my - 1.5, mx + 4 * k, my + 1); stroke(1.6);
        lowerLip(4.5, 1.8);
        break;
      case 'wavy':
        c.beginPath(); c.moveTo(mx - 8 * k, my + 1);
        c.quadraticCurveTo(mx - 5.5 * k, my - 2.5, mx - 3 * k, my + 0.5);
        c.quadraticCurveTo(mx - 0.5 * k, my + 3, mx + 2 * k, my);
        c.quadraticCurveTo(mx + 4 * k, my - 2, mx + 6 * k, my + 0.5);
        stroke(1.5);
        break;
      case 'grit':
        openMouth(() => {
          c.beginPath(); c.moveTo(mx - 11 * k, my - 1); c.quadraticCurveTo(mx, my - 4, mx + 9 * k, my - 2);
          c.quadraticCurveTo(mx + 9 * k, my + 4, mx + 6 * k, my + 5); c.quadraticCurveTo(mx, my + 3, mx - 10 * k, my + 5); c.closePath();
        }, null, 20, null);
        c.strokeStyle = U.rgba(lineC, 0.45); c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(mx - 10 * k, my + 1.6); c.quadraticCurveTo(mx, my + 0.3, mx + 9 * k, my + 1.3); c.stroke();
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(mx + i * 4, my - 2.5); c.lineTo(mx + i * 4, my + 4); c.stroke(); }
        break;
      case 'flat':
        c.beginPath(); c.moveTo(mx - 9 * k, my); c.quadraticCurveTo(mx, my + 0.6, mx + 7 * k, my - 0.4); stroke(1.6);
        lowerLip(5, 2.5);
        break;
      case 'smirk':
        c.beginPath(); c.moveTo(mx - 9 * k, my + 1); c.quadraticCurveTo(mx, my + 3, mx + 8 * k, my - 4); stroke(1.7);
        c.beginPath(); c.moveTo(mx + 8 * k, my - 4); c.quadraticCurveTo(mx + 10 * k, my - 3, mx + 10 * k, my - 1); stroke(1.1, 0.6);
        lowerLip(6, 2);
        break;
      case 'grumpy':
        c.beginPath(); c.moveTo(mx - 10 * k, my + 2.5); c.quadraticCurveTo(mx, my - 1.5, mx + 8 * k, my + 2.5); stroke(1.8);
        break;
      case 'catw': {
        c.beginPath(); c.moveTo(mx - 9, my - 1); c.quadraticCurveTo(mx - 6, my + 5, mx - 2, my + 1); c.quadraticCurveTo(mx + 2, my + 5, mx + 6, my - 1);
        stroke(1.8);
        break;
      }
      default: // neutral, gentle
        c.beginPath(); c.moveTo(mx - 8 * k, my); c.quadraticCurveTo(mx - 1, my + 2, mx + 6 * k, my - 0.6); stroke(1.6);
        lowerLip(5.5, 2.5);
    }
    c.restore();
  }

  // ------------------------------------------------------------------ eyes
  const UO = [[-0.5, 0.14], [-0.43, -0.3], [-0.17, -0.52], [0.1, -0.5], [0.34, -0.48], [0.5, -0.3], [0.55, 0.02]];
  const UC = [[-0.5, 0.14], [-0.36, 0.3], [-0.1, 0.38], [0.14, 0.37], [0.34, 0.35], [0.48, 0.2], [0.55, 0.02]];
  const LO = [[0.55, 0.02], [0.47, 0.34], [0.2, 0.5], [-0.06, 0.48], [-0.26, 0.46], [-0.42, 0.34], [-0.5, 0.14]];
  const flat = (pts) => pts.reduce((a, p) => a.concat(p), []);

  function eyeFrame(F, sp, near) {
    const eye = sp.eye;
    const W = (near ? F.eyeW : F.eyeW * F.farW) * (eye.w || 1);
    const H = F.eyeH * (near ? 1 : 0.97) * (eye.h || 1);
    const ex = near ? F.eyeX : F.farX, ey = F.eyeY;
    const dir = near ? -1 : 1;
    const ang = -(F.slant + (eye.slant || 0)) * dir;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const T = (p) => { const X = p[0] * W * dir, Y = p[1] * H; return [ex + X * cs - Y * sn, ey + X * sn + Y * cs]; };
    return { W, H, ex, ey, dir, T };
  }
  function lashShape(c, pts, th, wing, flick) {
    // pts: head coords from inner to outer. thickness grows toward the outer corner.
    const N = pts.length - 1;
    const top = [], bot = [];
    for (let i = 0; i <= N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      let nx = ty, ny = -tx; if (ny > 0) { nx = -nx; ny = -ny; }
      const s = i / N;
      const w = th * (0.28 + 0.72 * Math.pow(s, 0.7)) * (s > 0.93 ? 1 - (s - 0.93) * 4 : 1);
      top.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
      bot.push([pts[i][0] - nx * 0.5, pts[i][1] - ny * 0.5]);
    }
    c.beginPath();
    through(c, top, true);
    if (wing) {
      const e = pts[N], p = pts[N - 2];
      let tx = e[0] - p[0], ty = e[1] - p[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      c.quadraticCurveTo(e[0] + tx * wing * 0.6, e[1] + ty * wing * 0.6 - th * 0.4, e[0] + tx * wing, e[1] + ty * wing + (flick || 0));
      c.quadraticCurveTo(e[0] + tx * wing * 0.3, e[1] + ty * wing * 0.3 + 1, e[0], e[1] + 1);
    }
    through(c, bot.reverse(), false);
    c.closePath();
  }

  function drawEye(c, sp, F, E, near, blink) {
    const eye = sp.eye;
    const fr = eyeFrame(F, sp, near);
    const { W, H, T, dir } = fr;
    const lashC = eye.lash || '#2a1c24';
    const lashW = F.lash * (eye.lashMul || 1);
    let shape = (near && E.nearShape) || E.shape || 'open';
    let open = (E.open == null ? 1 : E.open) * (eye.lid || 1);
    if (shape === 'open') open *= blink;
    if (shape === 'open' && open < 0.14) shape = 'closed';
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (shape === 'happy') {
      const pts = sample(flat([[-0.5, 0.26], [-0.32, -0.14], [0.2, -0.2], [0.54, 0.16]]).map((v, i) => v), 14)
        .map((p) => T(p));
      lashShape(c, pts, lashW * 0.85, F.lashStyle === 'f' ? 4 : 1, 2);
      c.fillStyle = lashC; c.fill();
      c.restore();
      return;
    }
    if (shape === 'squeeze') {
      c.beginPath();
      const a = T([0.5, -0.3]), b = T([-0.42, 0.1]), d = T([0.46, 0.4]);
      c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 2, b[0], b[1]);
      c.quadraticCurveTo((b[0] + d[0]) / 2, (b[1] + d[1]) / 2 - 1, d[0], d[1]);
      c.strokeStyle = lashC; c.lineWidth = lashW * 0.75; c.stroke();
      c.restore();
      return;
    }
    // lid geometry in unit space
    const up = UO.map((p, i) => {
      const q = UC[i];
      const oo = open > 1 ? 1 + (open - 1) * 2.2 : open;
      let x = U.lerp(q[0], p[0], oo), y = U.lerp(q[1], p[1], oo);
      const wi = Math.pow(U.clamp(0.5 - x, 0, 1), 1.2), wo = Math.pow(U.clamp(x + 0.5, 0, 1), 1.5);
      y += (E.inD || 0) * wi * Math.min(1, open) + ((E.outD || 0) + (eye.droop || 0)) * wo * Math.min(1, open);
      return [x, y];
    });
    const lo = LO.map((p) => {
      const w = Math.max(0, 1 - Math.pow(Math.abs(p[0] * 2), 2));
      return [p[0], p[1] - (E.lift || 0) * 0.4 * w];
    });
    const uS = sample(flat(up), 16), lS = sample(flat(lo), 16);
    // keep the upper lid above the lower lid
    for (let i = 0; i < uS.length; i++) {
      const j = lS.length - 1 - i;
      if (j >= 0 && uS[i][1] > lS[j][1] - 0.02) uS[i][1] = lS[j][1] - 0.02;
    }
    const uH = uS.map(T), lH = lS.map(T);
    if (shape === 'closed') {
      lashShape(c, uH, lashW * 0.8, F.lashStyle === 'f' ? 3 : 0.5, 2);
      c.fillStyle = lashC; c.fill();
      if (F.lashStyle === 'f') {
        c.strokeStyle = lashC; c.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const p = uH[uH.length - 3 - k * 3];
          c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + dir * 2, p[1] + 3.5); c.stroke();
        }
      }
      c.restore();
      return;
    }
    // ---- open eye
    const eyePath = () => { c.beginPath(); through(c, uH, true); through(c, lH, false); c.closePath(); };
    eyePath();
    c.fillStyle = eye.white || '#fffdfb'; c.fill();
    c.save(); eyePath(); c.clip();
    // sclera shadow under the lid
    c.beginPath(); through(c, uH, true);
    c.strokeStyle = U.rgba(eye.whiteShade || '#a9a9d6', 0.55); c.lineWidth = H * 0.42; c.stroke();
    // iris
    const ir = eye.iris; // [dark, mid, light]
    const isz = (F.iris || 1) * (E.irisS || 1);
    const irx = W * 0.31 * (eye.irisW || 1) * isz, iry = H * 0.47 * (eye.irisH || 1) * isz;
    const ix = fr.ex + (0.1 + (E.gx || 0) * 0.5) * W * 0.32 * (near ? 1 : 0.9);
    const iy = fr.ey + H * 0.03 + (E.gy || 0) * H * 0.18;
    const gi = c.createLinearGradient(0, iy - iry, 0, iy + iry);
    gi.addColorStop(0, ir[0]); gi.addColorStop(0.42, ir[1]); gi.addColorStop(0.85, ir[2]); gi.addColorStop(1, ir[2]);
    ell(c, ix, iy, irx, iry); c.fillStyle = gi; c.fill();
    // lower glow
    const gg = c.createRadialGradient(ix, iy + iry * 0.55, 0, ix, iy + iry * 0.55, irx * 1.1);
    gg.addColorStop(0, U.rgba(ir[3] || ir[2], 0.85)); gg.addColorStop(1, U.rgba(ir[2], 0));
    c.fillStyle = gg; ell(c, ix, iy, irx, iry); c.fill();
    // fibres
    c.strokeStyle = U.rgba(ir[0], 0.35); c.lineWidth = 0.7;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + 0.3;
      c.beginPath();
      c.moveTo(ix + Math.cos(a) * irx * 0.42, iy + Math.sin(a) * iry * 0.42);
      c.lineTo(ix + Math.cos(a) * irx * 0.85, iy + Math.sin(a) * iry * 0.85);
      c.stroke();
    }
    // pupil
    const pc = eye.pupil || U.shade(ir[0], -0.55);
    const pr = (E.pupil || 1) * (eye.pupilSize || 1);
    ell(c, ix, iy - iry * 0.04, irx * 0.42 * pr, iry * 0.48 * pr); c.fillStyle = pc; c.fill();
    // rim
    ell(c, ix, iy, irx, iry); c.strokeStyle = U.rgba(U.shade(ir[0], -0.4), 0.9); c.lineWidth = 1.2; c.stroke();
    // lid shadow over iris
    const top = fr.ey - H * 0.55;
    const gs = c.createLinearGradient(0, top, 0, top + H * 0.55);
    gs.addColorStop(0, U.rgba(U.shade(ir[0], -0.5), 0.75)); gs.addColorStop(1, U.rgba(ir[0], 0));
    c.fillStyle = gs; ell(c, ix, iy, irx + 0.5, iry + 0.5); c.fill();
    // highlights
    c.fillStyle = '#ffffff';
    ell(c, ix - irx * 0.36, iy - iry * 0.36, irx * 0.36, iry * 0.24, -0.5); c.fill();
    c.globalAlpha = 0.9;
    ell(c, ix + irx * 0.34, iy + iry * 0.34, irx * 0.15, irx * 0.15); c.fill();
    c.globalAlpha = 0.6;
    ell(c, ix - irx * 0.05, iy + iry * 0.58, irx * 0.28, iry * 0.07, 0); c.fill();
    c.globalAlpha = 1;
    if (E.wet) {
      c.fillStyle = 'rgba(255,255,255,0.85)';
      ell(c, ix + irx * 0.1, iy - iry * 0.5, irx * 0.14, irx * 0.14); c.fill();
      ell(c, ix - irx * 0.5, iy + iry * 0.2, irx * 0.1, irx * 0.1); c.fill();
      c.beginPath(); through(c, lH, true);
      c.strokeStyle = 'rgba(220,240,255,0.9)'; c.lineWidth = 2.4; c.stroke();
    }
    c.restore();
    // lower lash line
    c.beginPath(); through(c, lH.slice(0, Math.round(lH.length * 0.72)), true);
    c.strokeStyle = U.rgba(lashC, F.lashStyle === 'f' ? 0.75 : 0.5); c.lineWidth = F.lashStyle === 'f' ? 1.2 : 1; c.stroke();
    if (F.lashStyle === 'f') {
      c.beginPath(); through(c, lH.slice(0, 4), true);
      c.strokeStyle = lashC; c.lineWidth = 1.8; c.stroke();
    }
    // crease
    const cr = uH.slice(Math.round(uH.length * 0.3), Math.round(uH.length * 0.96)).map((p) => [p[0] + dir * 0.5, p[1] - H * 0.2]);
    c.beginPath(); through(c, cr, true);
    c.strokeStyle = U.rgba(sp.skin.line, 0.55); c.lineWidth = 1.1; c.stroke();
    // upper lash
    const wing = F.lashStyle === 'f' ? lashW * 1.8 : lashW * 0.9;
    lashShape(c, uH, lashW, wing, F.lashStyle === 'f' ? 1.5 : 0.5);
    c.fillStyle = lashC; c.fill();
    if (F.lashStyle === 'f') {
      // little outer lashes
      c.strokeStyle = lashC; c.lineWidth = 1.1;
      const e = uH[uH.length - 1], p2 = uH[uH.length - 4];
      c.beginPath(); c.moveTo(p2[0], p2[1] - lashW * 0.6); c.quadraticCurveTo(p2[0] + dir * 3, p2[1] - lashW - 2, p2[0] + dir * 6, p2[1] - lashW - 2.5); c.stroke();
      c.beginPath(); c.moveTo(e[0] - dir * 1, e[1] - lashW * 0.4); c.quadraticCurveTo(e[0] + dir * 3, e[1] - lashW, e[0] + dir * 6.5, e[1] - lashW + 0.5); c.stroke();
    }
    // inner corner accent
    const ic = uH[0];
    c.fillStyle = U.rgba(sp.skin.deep, 0.6); ell(c, ic[0] - dir * 1, ic[1] + 1, 1.4, 1.1); c.fill();
    c.restore();
  }

  function drawBrows(c, sp, F, E) {
    const col = (sp.brow && sp.brow.color) || U.shade(sp.hair.dark, -0.2);
    const th = F.browTh * ((sp.brow && sp.brow.th) || 1);
    const by = F.browY + ((sp.brow && sp.brow.dy) || 0);
    const knit = E.brKnit ? 3 : 0;
    const shapeK = (sp.brow && sp.brow.arch) != null ? sp.brow.arch : 1;
    // near brow: inner end near nose (right), outer end to the left
    const nb = [F.eyeX + 19 - knit * 0.5, by + E.brIn, F.eyeX - 4, by - 6 * shapeK + (E.brIn + E.brOut) / 2, F.eyeX - 24, by + 2 + E.brOut];
    const fb = [F.farX - 10 + knit * 0.6, by + E.brIn + 0.5, F.farX + 6, by - 5 * shapeK + (E.brIn + E.brOut) / 2 + E.brFar, F.farX + 20, by + 3 + E.brOut + E.brFar];
    c.save();
    c.fillStyle = col; c.strokeStyle = U.rgba(col, 0.6); c.lineWidth = 0.6;
    ribbonPath(c, nb, th, { p: 0.6, bulge: 0.35, w0: 0.75 }); c.fill(); c.stroke();
    ribbonPath(c, fb, th * 0.85, { p: 0.6, bulge: 0.35, w0: 0.75 }); c.fill(); c.stroke();
    if (sp.brow && sp.brow.bushy) {
      c.strokeStyle = col; c.lineWidth = 1.2; c.lineCap = 'round';
      const rng = U.seeded(7);
      for (const b of [nb, fb]) {
        const pts = sample(b, 8);
        pts.forEach((p, i) => {
          const d = i / 8;
          c.beginPath(); c.moveTo(p[0], p[1] + 1);
          c.lineTo(p[0] + (b === nb ? -5 : 5) * (0.4 + rng()), p[1] - 2 - rng() * 3 + d * 4);
          c.stroke();
        });
      }
    }
    c.restore();
  }

  // ------------------------------------------------------------------ expression marks
  function drawMarks(c, sp, F, E) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (E.tears) {
      for (const near of [true, false]) {
        const fr = eyeFrame(F, sp, near);
        const sx = fr.ex + (near ? -fr.W * 0.18 : fr.W * 0.2), sy = fr.ey + fr.H * 0.42;
        const len = near ? 58 : 40;
        const spn = [sx, sy, sx + (near ? -4 : 3), sy + len * 0.5, sx + (near ? -2 : 5), sy + len];
        ribbonPath(c, spn, near ? 6 : 4.5, { p: 0.3, bulge: 0.2, w0: 0.6 });
        c.fillStyle = 'rgba(170,215,255,0.55)'; c.fill();
        c.strokeStyle = 'rgba(110,160,230,0.6)'; c.lineWidth = 0.9; c.stroke();
        c.beginPath(); c.moveTo(sx - 0.5, sy + 4); c.quadraticCurveTo(sx - 1.5, sy + len * 0.4, sx, sy + len * 0.75);
        c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.1; c.stroke();
        // drop at the end
        ell(c, spn[4], spn[5] + 4, 2.6, 3.6); c.fillStyle = 'rgba(180,220,255,0.75)'; c.fill();
      }
    }
    if (E.sweat) {
      const x = 58, y = -40;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 7, y + 11, x + 4.5, y + 15); c.quadraticCurveTo(x, y + 18, x - 3, y + 14); c.quadraticCurveTo(x - 4, y + 9, x, y);
      c.fillStyle = 'rgba(190,225,255,0.85)'; c.fill();
      c.strokeStyle = 'rgba(90,140,210,0.9)'; c.lineWidth = 1.1; c.stroke();
      c.fillStyle = '#fff'; ell(c, x - 0.5, y + 11, 1.2, 2.2, 0.3); c.fill();
    }
    if (E.vein) {
      const x = 50, y = -66;
      c.strokeStyle = '#d8344a'; c.lineWidth = 2.2;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        c.beginPath();
        c.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
        c.quadraticCurveTo(x + Math.cos(a + 0.5) * 7, y + Math.sin(a + 0.5) * 7, x + Math.cos(a) * 9, y + Math.sin(a) * 9);
        c.stroke();
      }
    }
    if (E.shyLines) {
      c.strokeStyle = U.rgba(sp.skin.deep, 0.7); c.lineWidth = 1.1;
      const lines = (x, y, n) => { for (let k = 0; k < n; k++) { c.beginPath(); c.moveTo(x + k * 5, y + 4); c.lineTo(x + k * 5 + 3, y - 3); c.stroke(); } };
      lines(F.eyeX - 14, F.eyeY + 28, 4);
      lines(F.farX - 2, F.eyeY + 27, 3);
    }
    if (E.pale) {
      c.strokeStyle = 'rgba(80,90,170,0.45)'; c.lineWidth = 1.1;
      for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(-40 + k * 13, -46); c.lineTo(-40 + k * 13, -32 - (k % 2) * 4); c.stroke(); }
    }
    c.restore();
  }

  // ------------------------------------------------------------------ hair kit
  function hairKit(sp) {
    const H = sp.hair;
    const K = {
      // a tapered lock: sp = bezier spine (root first), w = root width
      lock(c, spn, w, o) {
        o = o || {};
        const geo = ribbonPath(c, spn, w, o);
        const pts = geo.pts, a = pts[0], b = pts[pts.length - 1];
        const g = c.createLinearGradient(a[0], a[1], b[0], b[1]);
        const base = o.color || H.base;
        g.addColorStop(0, o.rootCol || U.mix(base, H.dark, o.rootDark != null ? o.rootDark : 0.2));
        g.addColorStop(0.55, base);
        g.addColorStop(1, o.tipCol || U.mix(base, H.light, o.tipLight != null ? o.tipLight : 0.15));
        c.fillStyle = g; c.fill();
        {
          const i0 = Math.floor(geo.L.length * (o.rootLine != null ? o.rootLine : 0.22));
          c.beginPath(); through(c, geo.L.slice(i0), true); through(c, geo.R.slice(i0).reverse(), false);
          c.strokeStyle = o.line || H.line; c.lineWidth = o.lw || 1.3; c.stroke();
        }
        if (o.strands !== false) {
          c.save();
          ribbonPath(c, spn, w, o); c.clip();
          c.lineCap = 'round';
          const n = o.strands || 2;
          for (let k = 0; k < n; k++) {
            const off = (k + 1) / (n + 1) - 0.5;
            const pp = geo.L.map((l, i) => [U.lerp(l[0], geo.R[i][0], 0.5 + off * 0.8), U.lerp(l[1], geo.R[i][1], 0.5 + off * 0.8)]);
            const s0 = Math.floor(pp.length * (0.12 + 0.1 * k)), s1 = Math.floor(pp.length * (0.75 - 0.08 * k));
            c.beginPath(); through(c, pp.slice(s0, s1), true);
            c.strokeStyle = U.rgba(H.line, 0.42); c.lineWidth = 0.9; c.stroke();
          }
          // shadow side
          c.beginPath(); through(c, geo.R, true);
          c.strokeStyle = U.rgba(H.dark, 0.5); c.lineWidth = w * 0.28; c.stroke();
          c.restore();
        }
        return geo;
      },
      // fill a mass shape with hair gradient
      mass(c, pathFn, o) {
        o = o || {};
        pathFn(c);
        const g = c.createLinearGradient(0, o.y0 != null ? o.y0 : -110, 0, o.y1 != null ? o.y1 : 200);
        g.addColorStop(0, o.top || H.base); g.addColorStop(1, o.bot || H.dark);
        c.fillStyle = g; c.fill();
        c.strokeStyle = H.line; c.lineWidth = 1.4; c.stroke();
      },
      // crown cap covering the skull (hairline hidden under bangs)
      cap(c, o) {
        o = o || {};
        const t = o.top != null ? o.top : -110, nx = o.nx != null ? o.nx : -68, fx = o.fx != null ? o.fx : 70, ny = o.ny != null ? o.ny : 26;
        K.mass(c, (c) => {
          c.beginPath();
          c.moveTo(nx, ny);
          c.bezierCurveTo(nx - 20, -30, nx - 12, t + 12, -18, t);
          c.bezierCurveTo(40, t - 8, fx + 10, -84, fx, -24);
          c.lineTo(fx - 6, o.fy != null ? o.fy : 0);
          c.quadraticCurveTo(20, o.hl != null ? o.hl : -66, nx + 10, -30);
          c.lineTo(nx + 6, ny);
          c.closePath();
        }, { top: o.col || H.base, bot: o.col || H.base });
        // hair-flow lines radiating from the crown whorl
        c.save(); c.lineCap = 'round';
        const wx = o.wx != null ? o.wx : -16, wy = o.wy != null ? o.wy : t + 8;
        for (let k = 0; k < 11; k++) {
          const a = U.lerp(-2.9, -0.2, k / 10);
          const ex = wx + Math.cos(a) * 92, ey = wy + 70 + Math.sin(a) * 20;
          c.beginPath(); c.moveTo(wx + Math.cos(a) * 8, wy + 4);
          c.quadraticCurveTo(wx + Math.cos(a) * 60, wy + Math.sin(a) * 10, ex, ey);
          c.strokeStyle = U.rgba(H.line, 0.28); c.lineWidth = 1; c.stroke();
        }
        c.restore();
      },
      locks(c, list, o) { for (const it of list) K.lock(c, it[0], it[1], Object.assign({}, o || {}, it[2] || {})); },
      strand(c, spn, lw, col, a) { // fine flyaway strand
        const pts = sample(spn, 12);
        c.beginPath(); through(c, pts, true);
        c.strokeStyle = U.rgba(col || H.line, a == null ? 0.8 : a); c.lineWidth = lw || 1; c.lineCap = 'round'; c.stroke();
      },
    };
    return K;
  }
  function shadeHair(lay, sp, P, front) {
    const H = sp.hair;
    const c = lay.getContext('2d');
    c.save();
    headT(c, P);
    c.globalCompositeOperation = 'source-atop';
    const g = c.createRadialGradient(-50, -110, 10, -10, -40, 240);
    g.addColorStop(0, U.rgba(H.light, 0.3)); g.addColorStop(0.35, U.rgba(H.base, 0)); g.addColorStop(1, U.rgba(H.dark, 0.6));
    c.fillStyle = g; c.fillRect(-200, -200, 400, 450);
    if (!front) { c.fillStyle = U.rgba(H.dark, 0.32); c.fillRect(-200, -200, 400, 450); }
    const R = sp.ring;
    if (front && R !== null) {
      const r = Object.assign({ cx: -4, cy: -24, rx: 76, ry: 52, a0: 3.5, a1: 5.95, w: 3.4, n: 44, a: 0.8 }, R || {});
      const rng = U.seeded((sp.seed || 3) * 13 + 1);
      const P2 = (a, d) => [r.cx + Math.cos(a) * (r.rx + d), r.cy + Math.sin(a) * (r.ry + d)];
      // jagged band: outer edge and inner edge with alternating spikes
      const outer = [], inner = [];
      for (let k = 0; k <= r.n; k++) {
        const a = U.lerp(r.a0, r.a1, k / r.n);
        const edge = Math.min(1, Math.min(k, r.n - k) / 4); // taper at both ends
        const sp1 = 0.2 + rng() * 0.4;
        const sp2 = rng() < 0.45 ? 0.15 + rng() * 0.4 : 1.2 + rng() * 2.4;
        outer.push(P2(a, r.w * 0.5 * edge + r.w * sp1 * edge));
        inner.push(P2(a, -r.w * 0.5 * edge - r.w * sp2 * edge));
      }
      // broken into a few segments
      c.fillStyle = U.rgba(U.mix(H.base, H.hi || H.light, r.mix != null ? r.mix : 0.6), r.a);
      let k0 = 0;
      while (k0 < r.n) {
        const len = 4 + Math.floor(rng() * 6);
        const k1 = Math.min(r.n, k0 + len);
        c.beginPath(); c.moveTo(outer[k0][0], outer[k0][1]);
        for (let k = k0; k <= k1; k++) c.lineTo(outer[k][0], outer[k][1]);
        for (let k = k1; k >= k0; k--) c.lineTo(inner[k][0], inner[k][1]);
        c.closePath(); c.fill();
        k0 = k1 + 1 + Math.floor(rng() * 2);
      }
      // bright core streaks
      c.fillStyle = U.rgba(H.hi || H.light, r.a * 0.45);
      for (let k = 2; k < r.n - 2; k += 3) {
        const a = U.lerp(r.a0, r.a1, (k + rng()) / r.n);
        const o1 = P2(a, r.w * 0.8), i1 = P2(a, -r.w * 1.1), s1 = P2(a + 0.02, 0), s2 = P2(a - 0.02, 0);
        c.beginPath(); c.moveTo(o1[0], o1[1]); c.quadraticCurveTo(s1[0], s1[1], i1[0], i1[1]); c.quadraticCurveTo(s2[0], s2[1], o1[0], o1[1]); c.fill();
      }
    }
    c.restore();
  }

  // ------------------------------------------------------------------ clothing kit
  // cross-collar (交領右衽) robe drawn in body-local coords
  function robe(c, R) {
    const sw = R.sw || 112, swf = R.swf || 96, yT = R.y || 116;
    const nl = R.nl || -26, nr = R.nr || 30, ny = R.ny || 92;
    // silhouette
    c.beginPath();
    c.moveTo(-sw - 18, 270);
    c.lineTo(-sw - 16, 200);
    c.bezierCurveTo(-sw - 14, 170, -sw - 10, yT + 26, -sw + 14, yT + 6);
    c.bezierCurveTo(-sw + 40, yT - 8, nl - 30, ny + 8, nl, ny);
    c.lineTo(nr, ny);
    c.bezierCurveTo(nr + 24, ny + 6, swf - 40, yT - 6, swf - 14, yT + 8);
    c.bezierCurveTo(swf + 4, yT + 20, swf + 8, 160, swf + 12, 200);
    c.lineTo(swf + 14, 270);
    c.closePath();
    const g = c.createLinearGradient(-sw, 0, swf, 0);
    g.addColorStop(0, R.colL || U.shade(R.col, 0.12)); g.addColorStop(0.55, R.col); g.addColorStop(1, R.colD || U.shade(R.col, -0.25));
    c.fillStyle = g; c.fill();
    c.strokeStyle = R.line || U.shade(R.col, -0.5); c.lineWidth = 1.8; c.stroke();
    if (R.after) R.after(c);
  }
  // collar bands. L = neck-left point, Rr = neck-right point, X = crossing point
  function crossCollar(c, C) {
    const L = C.L || [-24, 92], Rp = C.R || [28, 92], X = C.X || [8, 176];
    const layers = C.layers; // outer→inner: [{col, line, w}]
    const dirR = [X[0] - Rp[0], X[1] - Rp[1]], lr = Math.hypot(dirR[0], dirR[1]);
    const ux = dirR[0] / lr, uy = dirR[1] / lr;
    const ext = [X[0] + ux * 120, X[1] + uy * 120];
    // fill the opening with layers: each successive layer narrower V
    let inset = 0;
    const vPath = (ins, deep) => {
      c.beginPath();
      c.moveTo(L[0] + ins, L[1] - 6);
      c.lineTo(X[0] + (ins * 0.15), X[1] - ins * 2.2 - (deep || 0));
      c.lineTo(Rp[0] - ins, Rp[1] - 6);
      c.quadraticCurveTo((L[0] + Rp[0]) / 2, L[1] - 12, L[0] + ins, L[1] - 6);
      c.closePath();
    };
    for (let i = 0; i < layers.length; i++) {
      const ly = layers[i];
      vPath(inset, ly.deep);
      c.fillStyle = ly.col; c.fill();
      if (ly.line) { c.strokeStyle = ly.line; c.lineWidth = 1.2; c.stroke(); }
      inset += ly.w;
    }
    if (C.skin) { // cut the innermost V so the neck / chest layer shows through
      c.save(); c.globalCompositeOperation = 'destination-out';
      vPath(inset, C.skinDeep || 0); c.fillStyle = '#000'; c.fill();
      c.restore();
      c.save(); vPath(inset, C.skinDeep || 0); c.strokeStyle = U.rgba(layers[layers.length - 1].line || '#888', 0.9); c.lineWidth = 1.2; c.stroke(); c.restore();
    }
    // over-flap (right collar continuing past the crossing)
    if (C.flap !== false) {
      const T = C.trim || layers[0];
      const tw = C.trimW || layers[0].w;
      const nx = -uy, ny = ux; // normal (points to the right/outside)
      c.beginPath();
      c.moveTo(Rp[0], Rp[1] - 6);
      c.lineTo(ext[0], ext[1]);
      c.lineTo(ext[0] - nx * tw * -1, ext[1] - ny * tw * -1);
      c.lineTo(Rp[0] + nx * tw, Rp[1] - 6 + ny * tw);
      c.closePath();
      c.fillStyle = T.col; c.fill();
      c.strokeStyle = T.line || U.shade(T.col, -0.4); c.lineWidth = 1.3; c.stroke();
      if (C.flapDeco) C.flapDeco(c, Rp, ext, nx, ny, tw);
    }
  }

  function shadeBody(lay, sp, P) {
    const c = lay.getContext('2d');
    c.save();
    bodyT(c, P);
    c.globalCompositeOperation = 'source-atop';
    // head / chin shadow
    const g = c.createRadialGradient(12, 92, 4, 12, 100, 70);
    g.addColorStop(0, 'rgba(60,20,40,0.3)'); g.addColorStop(1, 'rgba(60,20,40,0)');
    c.fillStyle = g; c.fillRect(-150, 40, 300, 200);
    // far side
    const g2 = c.createLinearGradient(-20, 0, 150, 0);
    g2.addColorStop(0, 'rgba(20,10,40,0)'); g2.addColorStop(1, 'rgba(20,10,50,0.32)');
    c.fillStyle = g2; c.fillRect(-150, 40, 300, 200);
    // bottom fade to dark
    const g3 = c.createLinearGradient(0, 140, 0, 195);
    g3.addColorStop(0, 'rgba(10,8,20,0)'); g3.addColorStop(1, 'rgba(10,8,20,0.28)');
    c.fillStyle = g3; c.fillRect(-150, 40, 300, 200);
    c.restore();
  }

  // ------------------------------------------------------------------ build
  function build(sp, expr, rs) {
    // (spec passed directly)
    RS = rs;
    const F = Object.assign({}, FACE[sp.face || 'f'], sp.faceOpt || {});
    const P = Object.assign({ hx: 150, hy: 150, s: 1, rot: 0 }, sp.pose || {});
    const E = exprFor(sp, expr);
    const K = hairKit(sp);
    const ctxOf = (cv) => cv.getContext('2d');
    const under = layer();
    const uc = ctxOf(under);
    const Sx = { F, P, E, K, sp, robe, crossCollar, skin: sp.skin, hair: sp.hair, U, ell, blob, ribbonPath, sample, through, expr, drawMouth, drawEye, eyeFrame,
      wr: (c, lvl) => wrinkles(c, sp, F, lvl) };

    if (sp.aura) { uc.save(); headT(uc, P); sp.aura(uc, Sx); uc.restore(); }
    if (sp.behind) { uc.save(); bodyT(uc, P); sp.behind(uc, Sx); uc.restore(); }
    // back hair
    if (sp.back) {
      const lb = layer(); const c = ctxOf(lb);
      c.save(); headT(c, P); sp.back(c, Sx); c.restore();
      shadeHair(lb, sp, P, false);
      if (sp.rimCol !== null) rim(lb, sp.rimCol || sp.hair.light, 0.35, 2);
      blit(under, lb);
    }
    // neck
    {
      const ln = layer(); const c = ctxOf(ln);
      c.save(); headT(c, P); if (sp.neck) sp.neck(c, Sx); else drawNeck(c, sp, F); c.restore();
      blit(under, ln);
    }
    // body
    if (sp.body) {
      const lb = layer(); const c = ctxOf(lb);
      c.save(); bodyT(c, P); sp.body(c, Sx); c.restore();
      shadeBody(lb, sp, P);
      rim(lb, '#fff4e0', 0.3, 2);
      if (sp.bodyAfter) { c.save(); bodyT(c, P); sp.bodyAfter(c, Sx); c.restore(); }
      blit(under, lb);
    }
    // front hair (rendered now so it can shadow the face)
    let lf = null;
    if (sp.front) {
      lf = layer(); const c = ctxOf(lf);
      c.save(); headT(c, P); sp.front(c, Sx); c.restore();
      shadeHair(lf, sp, P, true);
      if (sp.rimCol !== null) rim(lf, sp.rimCol || sp.hair.light, 0.45, 2);
    }
    // face
    {
      const lfa = layer(); const c = ctxOf(lfa);
      c.save(); headT(c, P);
      if (sp.faceDraw) sp.faceDraw(c, Sx); else drawFaceBase(c, sp, F, E);
      if (!sp.noFaceLines) shadeFace(c, sp, F, E);
      c.restore();
      if (lf && sp.hairShadow !== false) {
        const sh = silhouette(lf, U.rgba(sp.skin.deep, 0.5));
        blit(lfa, sh, 'source-atop', 0.9, 2, 6);
      }
      c.save(); headT(c, P);
      if (sp.faceDraw2) sp.faceDraw2(c, Sx);
      if (!sp.noFaceLines) faceLines(c, sp, F);
      if (sp.wrinkles) sp.wrinkles(c, Sx);
      if (!sp.noNose) drawNose(c, sp, F);
      if (sp.mouthDraw) sp.mouthDraw(c, Sx); else drawMouth(c, sp, F, E);
      if (sp.facial) sp.facial(c, Sx);
      c.restore();
      blit(under, lfa);
    }
    if (lf) blit(under, lf);
    if (sp.acc) { uc.save(); headT(uc, P); sp.acc(uc, Sx); uc.restore(); }

    // eyes (cropped region), three blink states
    const box = { x: P.hx - 82 * P.s, y: P.hy - 52 * P.s, w: 170 * P.s, h: 100 * P.s };
    const mkEyes = (blink) => {
      const cv = U.makeCanvas(box.w, box.h, RS); const c = ctxOf(cv);
      c.save(); c.translate(-box.x, -box.y); headT(c, P);
      if (sp.eyesDraw) sp.eyesDraw(c, Sx, blink);
      else { drawEye(c, sp, F, E, true, blink); drawEye(c, sp, F, E, false, blink); }
      c.restore();
      if (lf) {
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'destination-out';
        c.drawImage(lf, -box.x * RS, -box.y * RS); c.restore();
      }
      return cv;
    };
    const eyes = [mkEyes(1)];
    const blinks = (E.shape || 'open') === 'open' && !sp.noBlink;
    if (blinks) { eyes.push(mkEyes(0.45)); eyes.push(mkEyes(0)); } else { eyes.push(eyes[0], eyes[0]); }

    // over layer
    const over = layer();
    {
      const c = ctxOf(over);
      c.save(); headT(c, P);
      if (!sp.noBrows) drawBrows(c, sp, F, E);
      drawMarks(c, sp, F, E);
      if (sp.over) sp.over(c, Sx);
      c.restore();
    }
    let underF = under;
    if (sp.ghost) {
      const g = sp.ghost;
      const tint = (cv, a) => {
        const c = cv.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'source-atop'; c.fillStyle = U.rgba(g.tint, a); c.fillRect(0, 0, cv.width, cv.height); c.restore();
      };
      const fade = (cv) => {
        const c = cv.getContext('2d'); c.save();
        c.globalCompositeOperation = 'destination-out';
        const gr = c.createLinearGradient(0, g.fade || 250, 0, PH);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
        c.fillStyle = gr; c.fillRect(0, 0, PW, PH); c.restore();
      };
      const amt = g.amt != null ? g.amt : 0.3;
      tint(under, amt); tint(over, amt * 0.7);
      new Set(eyes).forEach((cv) => tint(cv, amt * 0.5));
      fade(under); fade(over);
      underF = layer();
      const c = underF.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
      c.shadowColor = g.glow || g.tint; c.shadowBlur = 16 * RS; c.drawImage(under, 0, 0); c.restore();
    }
    if (sp.post) sp.post({ under: underF, eyes, over, box, Sx, P });
    return { under: underF, eyes, over, box, P };
  }

  // ------------------------------------------------------------------ static paint (no blink / cache)
  const cache = new Map();
  function paint(ctx, sp, expr, x, y, w, h, rs) {
    if (!EX[expr]) expr = 'normal';
    const s = Math.min(w / PW, h / PH);
    const dw = PW * s, dh = PH * s;
    const dx = x + (w - dw) / 2, dy = y + h - dh;
    rs = rs || Math.max(1, Math.ceil(s * 4 * (window.devicePixelRatio || 1)) / 4);
    let e = cache.get(sp);
    if (!e || e.rs !== rs || e.expr !== expr) { e = build(sp, expr, rs); e.rs = rs; e.expr = expr; cache.set(sp, e); }
    ctx.save();
    ctx.translate(dx, dy); ctx.scale(s, s);
    ctx.drawImage(e.under, 0, 0, PW, PH);
    const ec = e.eyes[0];
    ctx.drawImage(ec, e.box.x, e.box.y, ec.lw, ec.lh);
    ctx.drawImage(e.over, 0, 0, PW, PH);
    ctx.restore();
  }
  window.DZ = {
    build, paint, PW, PH,
    kit: { SKIN, FACE, EX, ribbonPath, sample, through, blob, ell, robe, crossCollar, headT, bodyT, TAU },
  };
})();

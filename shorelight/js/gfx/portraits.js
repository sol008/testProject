// 彼岸燈 — character bust portraits (procedural Canvas 2D, anime / donghua style)
//
// G.Portraits.draw(ctx, id, expr, x, y, w, h, t, o)
//   Bust fitted into the box (x,y,w,h) (typ. 300x340), bottom-aligned, centred. Faces RIGHT.
//   expr: normal|smile|laugh|sad|cry|angry|surprise|think|shy|hurt|serious|smug
//   t: seconds (blink every ~3–5 s per character, subtle breathing)
//   o: { flip?:bool (face left), alpha?:0..1, dim?:bool (inactive speaker) }
// G.Portraits.has(id) / ids() / define(id, spec)
//
// Implementation notes
//   Every portrait is authored in a 300x340 canonical space. Head parts are drawn in a
//   "head-local" frame: origin = (eye line, skull centre), facing right in a 3/4 view
//   (face midline at x≈+14, chin at y≈+80, crown at y≈-104).
//   Per (id, expr, scale) the static art is pre-rendered into cached canvases:
//     under  = aura, back hair, neck, body, face (+mouth/nose/blush), front hair, accessories
//     eyes[] = open / half / closed (cropped), cut by the front hair so bangs stay on top
//     over   = brows, glasses / masks / props, tears, sweat, marks
//   Each frame only does 3 drawImage calls (+ optional live sparkles).
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
    c.scale(P.s, P.s);
    if (P.rot) { c.translate(0, 70); c.rotate(P.rot); c.translate(0, -70); }
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
      jaw: 1.0, chinX: 16, chinY: 92, cheek: -1, round: 0, jawY: 52, chinW: 6,
      eyeX: -24, farX: 40, eyeY: 3, eyeW: 38, eyeH: 24, farW: 0.68, slant: 0.08,
      browY: -19, browTh: 3.9,
      noseX: 29, noseY: 35, nose: 'm', mouthX: 19, mouthY: 61, mouthW: 1.05,
      lash: 2.6, lashStyle: 'm', neckW: 23, neckX: 2, ear: true, blush: 0.04,
      iris: 0.93,
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
    laugh: { shape: 'happy', brIn: -4, brOut: -3, mouth: 'laugh', blush: 0.4, tilt: -0.03 },
    sad: { open: 0.74, outD: 0.12, gy: 0.35, gx: 0.02, brIn: -6, brOut: 3, mouth: 'frown', wet: 1, tilt: 0.035 },
    cry: { open: 0.66, outD: 0.1, gy: 0.25, brIn: -7, brOut: 3, mouth: 'cry', tears: 1, wet: 1, blush: 0.45, tilt: 0.03 },
    angry: { open: 0.92, inD: 0.42, irisS: 0.9, brIn: 6, brOut: -3, mouth: 'shout', vein: 1, pupil: 0.82 },
    surprise: { open: 1.18, lift: -0.08, pupil: 0.55, irisS: 0.8, brIn: -8, brOut: -7, mouth: 'o', tilt: -0.02 },
    think: { open: 0.72, gx: 0.55, gy: -0.45, brIn: 1, brOut: 0, brFar: -5, mouth: 'pout', tilt: -0.045 },
    shy: { open: 0.74, gx: -0.25, gy: 0.4, lift: 0.12, brIn: -4, brOut: 1, mouth: 'wavy', blush: 1, shyLines: 1, tilt: 0.05 },
    hurt: { open: 0.5, inD: 0.18, nearShape: 'squeeze', brIn: 4, brOut: -1, brKnit: 1, mouth: 'grit', sweat: 1, pale: 1, tilt: 0.03 },
    serious: { open: 0.82, inD: 0.2, brIn: 3, brOut: 0, mouth: 'flat' },
    smug: { open: 0.6, lift: 0.14, gx: 0.2, brIn: 2, brOut: 0, brFar: -4, mouth: 'smirk', tilt: -0.035 },
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
    if (!sp.faceDraw) {
    // far-side cel band
    farContour(c, F);
    c.strokeStyle = U.rgba(S.shade, 0.75); c.lineWidth = 9; c.stroke();
    c.strokeStyle = U.rgba(S.mid, 0.6); c.lineWidth = 16; c.stroke();
    // under-jaw soft
    nearContour(c, F);
    c.strokeStyle = U.rgba(S.mid, 0.55); c.lineWidth = 8; c.stroke();
    }
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
      c.fillStyle = gp; c.fillRect(-120, -160, 240, 180);
    }
    // nose-bridge highlight
    if (!sp.noNose) {
      c.fillStyle = 'rgba(255,255,255,0.35)';
      ell(c, F.noseX - 4, F.noseY - 10, 2, 5, -0.2); c.fill();
    }
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
    c.lineJoin = 'round';
    if (!(sp.brow && sp.brow.halo === false)) {
      c.strokeStyle = U.rgba(sp.skin.base, 0.85); c.lineWidth = 2.6;
      ribbonPath(c, nb, th, { p: 0.6, bulge: 0.35, w0: 0.75 }); c.stroke();
      ribbonPath(c, fb, th * 0.85, { p: 0.6, bulge: 0.35, w0: 0.75 }); c.stroke();
    }
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
        if (K.front && o.shine !== false && sp.ring !== null) K.shine(c, geo, w, o);
        return geo;
      },
      // highlight sliver where a lock crosses the "angel ring" ellipse
      shine(c, geo, w, o) {
        const r = Object.assign({ cx: -4, cy: -24, rx: 78, ry: 54 }, sp.ring || {});
        const ringY = (x) => { const d = (x - r.cx) / r.rx; return Math.abs(d) >= 1 ? null : r.cy - r.ry * Math.sqrt(1 - d * d); };
        const pts = geo.pts;
        for (let i = 1; i < pts.length; i++) {
          const ry = ringY(pts[i][0]);
          if (ry == null) continue;
          if (pts[i - 1][1] < ry && pts[i][1] >= ry) {
            const t = i / (pts.length - 1);
            if (t > 0.8) return;
            const hseed = U.hash(Math.round(pts[0][0] * 7), Math.round(pts[0][1] * 3), 11);
            if (hseed < 0.18 && !o.shineAlways) return;
            const shift = (hseed - 0.5) * 18;
            const a = pts[i - 1], b = pts[Math.min(pts.length - 1, i + 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
            const lw = Math.hypot(geo.L[i][0] - geo.R[i][0], geo.L[i][1] - geo.R[i][1]);
            const hw = lw * (0.22 + hseed * 0.16), len = 6 + lw * 0.45 + (U.hash(i, Math.round(pts[0][0]), 3) * 9);
            const cx = U.lerp(geo.L[i][0], geo.R[i][0], 0.42) + tx * shift, cy = U.lerp(geo.L[i][1], geo.R[i][1], 0.42) + ty * shift;
            const nx = -ty, ny = tx;
            c.save();
            c.beginPath();
            c.moveTo(cx - tx * len * 0.45, cy - ty * len * 0.45);
            c.quadraticCurveTo(cx + nx * hw, cy + ny * hw, cx + tx * len * 0.75, cy + ty * len * 0.75);
            c.quadraticCurveTo(cx - nx * hw, cy - ny * hw, cx - tx * len * 0.45, cy - ty * len * 0.45);
            c.fillStyle = U.rgba(U.mix(H.base, H.hi || H.light, 0.62), o.shineA || 0.72); c.fill();
            c.beginPath();
            c.moveTo(cx - tx * len * 0.2, cy - ty * len * 0.2);
            c.quadraticCurveTo(cx + nx * hw * 0.3, cy + ny * hw * 0.3, cx + tx * len * 0.35, cy + ty * len * 0.35);
            c.quadraticCurveTo(cx - nx * hw * 0.3, cy - ny * hw * 0.3, cx - tx * len * 0.2, cy - ty * len * 0.2);
            c.fillStyle = U.rgba(H.hi || H.light, 0.55); c.fill();
            c.restore();
            return;
          }
        }
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
        if (K.front && sp.ring !== null) {
          for (let k = 0; k < 6; k++) {
            const a = U.lerp(-2.6, -0.5, k / 5);
            const x0 = wx + Math.cos(a) * 8, y0 = wy + 4;
            const spn = [x0, y0, wx + Math.cos(a) * 60, wy + Math.sin(a) * 10, wx + Math.cos(a) * 92, wy + 70 + Math.sin(a) * 20];
            const pts = sample(spn, 18);
            const L = pts.map((p) => [p[0] - 7, p[1]]), R = pts.map((p) => [p[0] + 7, p[1]]);
            K.shine(c, { pts, L, R }, 14, { shineA: 0.55 });
          }
        }
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
      const r = Object.assign({ cx: -4, cy: -24, rx: 78, ry: 54, a0: 3.6, a1: 5.85 }, R || {});
      c.beginPath(); c.ellipse(r.cx, r.cy, r.rx, r.ry, 0, r.a0, r.a1);
      c.strokeStyle = U.rgba(H.hi || H.light, 0.12); c.lineWidth = 12; c.stroke();
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
    if (R.folds !== false) {
      // soft fabric folds: shadow strokes with a light edge beside them
      c.save(); c.lineCap = 'round';
      const fold = (pts, w) => {
        c.beginPath(); c.moveTo(pts[0], pts[1]); c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]);
        c.strokeStyle = U.rgba(R.colD || U.shade(R.col, -0.25), 0.55); c.lineWidth = w; c.stroke();
        c.beginPath(); c.moveTo(pts[0] - 2.5, pts[1]); c.quadraticCurveTo(pts[2] - 2.5, pts[3], pts[4] - 2.5, pts[5]);
        c.strokeStyle = U.rgba(R.colL || U.shade(R.col, 0.12), 0.35); c.lineWidth = 1; c.stroke();
      };
      fold([-sw + 26, yT + 30, -sw + 34, yT + 60, -sw + 28, yT + 96], 2.2);
      fold([-sw + 52, yT + 40, -sw + 58, yT + 70, -sw + 54, yT + 100], 1.6);
      fold([swf - 30, yT + 34, swf - 22, yT + 64, swf - 28, yT + 96], 2);
      fold([-40, 150, -34, 170, -38, 196], 1.4);
      c.restore();
    }
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
      if (C.stitch) {
        c.save(); c.setLineDash([3, 3]); c.strokeStyle = C.stitch; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(Rp[0] + nx * tw * 0.5, Rp[1] - 6 + ny * tw * 0.5); c.lineTo(ext[0] + nx * tw * 0.5, ext[1] + ny * tw * 0.5); c.stroke();
        c.restore();
      }
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
  function build(id, expr, rs) {
    const sp = defs[id];
    RS = rs;
    const F = Object.assign({}, FACE[sp.face || 'f'], sp.faceOpt || {});
    const E = exprFor(sp, expr);
    const P = Object.assign({ hx: 150, hy: 150, s: 1, rot: 0 }, sp.pose || {});
    P.rot += (E.tilt || 0) * (sp.tiltMul != null ? sp.tiltMul : 1);
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
      K.front = true;
      c.save(); headT(c, P); sp.front(c, Sx); c.restore();
      K.front = false;
      shadeHair(lf, sp, P, true);
      if (sp.rimCol !== null) rim(lf, sp.rimCol || sp.hair.light, 0.45, 2);
    }
    // face
    {
      const lfa = layer(); const c = ctxOf(lfa);
      c.save(); headT(c, P);
      if (sp.faceDraw) sp.faceDraw(c, Sx); else drawFaceBase(c, sp, F, E);
      shadeFace(c, sp, F, E);
      c.restore();
      if (lf && sp.hairShadow !== false) {
        const sh = silhouette(lf, U.rgba(sp.skin.deep, 0.5));
        blit(lfa, sh, 'source-atop', 0.9, 2, 6);
      }
      c.save(); headT(c, P);
      if (sp.faceDraw2) sp.faceDraw2(c, Sx);
      if (!sp.faceDraw) faceLines(c, sp, F);
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

  // ------------------------------------------------------------------ cache + draw
  const cache = new Map();
  const MAX_CACHE = 24;
  function getEntry(id, expr, rs) {
    const key = id + '|' + expr + '|' + rs;
    let e = cache.get(key);
    if (e) { cache.delete(key); cache.set(key, e); return e; }
    e = build(id, expr, rs);
    cache.set(key, e);
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    return e;
  }
  let scratch = null;
  function getScratch(w, h, rs) {
    if (!scratch || scratch.lw !== w || scratch.lh !== h || scratch.rs !== rs) {
      scratch = U.makeCanvas(w, h, rs); scratch.rs = rs;
    }
    const c = scratch.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, scratch.width, scratch.height);
    c.setTransform(rs, 0, 0, rs, 0, 0);
    return scratch;
  }
  function blinkState(sp, t) {
    const seed = sp.seed || 1;
    const per = 3 + U.hash(seed, 7, 11) * 2;
    let ph = (t + seed * 1.37) % per;
    // occasional double blink
    if (U.hash(Math.floor((t + seed * 1.37) / per), seed, 5) < 0.2 && ph > 0.3 && ph < 0.6) ph -= 0.3;
    if (ph < 0.05) return 1;
    if (ph < 0.12) return 2;
    if (ph < 0.18) return 1;
    return 0;
  }
  function paint(c, e, bi, live, sp, t, P) {
    c.drawImage(e.under, 0, 0, PW, PH);
    const ec = e.eyes[bi];
    c.drawImage(ec, e.box.x, e.box.y, ec.lw, ec.lh);
    c.drawImage(e.over, 0, 0, PW, PH);
    if (live && sp.live) { c.save(); headT(c, P); sp.live(c, t); c.restore(); }
  }
  function draw(ctx, id, expr, x, y, w, h, t, o) {
    const sp = defs[id];
    if (!sp) return;
    o = o || {};
    t = t || 0;
    if (!EX[expr]) expr = 'normal';
    const s = Math.min(w / PW, h / PH);
    if (!(s > 0)) return;
    const dw = PW * s, dh = PH * s;
    const dx = x + (w - dw) / 2, dy = y + h - dh;
    const rs = Math.min(4, Math.max(0.5, Math.ceil((G.S || 1) * s * 4) / 4));
    const e = getEntry(id, expr, rs);
    const bi = blinkState(sp, t);
    const br = Math.sin(t * TAU / (3.4 + (sp.seed || 1) % 3 * 0.3) + (sp.seed || 0));
    const sy = 1 + 0.0055 * br;
    const alpha = (o.alpha == null ? 1 : o.alpha) * (sp.alpha == null ? 1 : sp.alpha);
    if (alpha <= 0) return;
    const P = e.P;
    ctx.save();
    if (o.flip) { ctx.translate(dx + dw, 0); ctx.scale(-1, 1); ctx.translate(-dx, 0); }
    if (alpha < 1 || o.dim) {
      const sc = getScratch(PW, PH, rs);
      const c = sc.getContext('2d');
      c.translate(0, PH); c.scale(1, sy); c.translate(0, -PH);
      paint(c, e, bi, true, sp, t, P);
      if (o.dim) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        c.fillStyle = 'rgba(14,16,34,0.5)';
        c.fillRect(0, 0, sc.width, sc.height);
      }
      ctx.globalAlpha *= alpha;
      ctx.drawImage(sc, dx, dy, dw, dh);
    } else {
      ctx.translate(dx, dy + dh);
      ctx.scale(s, s * sy);
      ctx.translate(0, -PH);
      paint(ctx, e, bi, true, sp, t, P);
    }
    ctx.restore();
  }

  function define(id, spec) {
    spec.seed = spec.seed || Math.floor(U.hash(id.length, id.charCodeAt(0) + id.charCodeAt(id.length - 1) * 31, 9) * 97) + 1;
    defs[id] = spec;
    for (const k of Array.from(cache.keys())) if (k.startsWith(id + '|')) cache.delete(k);
  }

  G.Portraits = {
    draw,
    has: (id) => !!defs[id],
    ids: () => Object.keys(defs),
    exprs: () => EXPRS.slice(),
    define,
    clearCache: () => cache.clear(),
    _kit: { SKIN, FACE, EX, ribbonPath, sample, through, blob, ell, robe, crossCollar },
  };

  // =================================================================== characters
  const C = {};

  // ---------------- 白芷 Bai Zhi
  define('baizhi', {
    face: 'f',
    faceOpt: { blush: 0.18, eyeW: 38, eyeH: 29, slant: 0.09, chinY: 84 }, // softer almond eyes, oval face (reference)
    skin: Object.assign({}, SKIN.fair, { base: '#fff0e8', mid: '#fadcd0' }),
    // client pick v2 #02 藍衫笛歌 + face/hair reference (docs/design/REFERENCES.md, docs/design/PICKS.md)
    eye: { iris: ['#2a1810', '#4a3024', '#7a5238', '#c8a080'], lash: '#1e1418', whiteShade: '#c4c4d8' },
    brow: { color: '#2a2228', th: 0.95, halo: false },
    hair: { base: '#1d1b24', dark: '#0e0d14', light: '#46506e', line: '#08070c', hi: '#8a9cc4' },
    rimCol: '#e8fbff',
    aura(c) {
      const g = c.createRadialGradient(0, 10, 20, 0, 20, 145);
      g.addColorStop(0, 'rgba(190,240,255,0.35)'); g.addColorStop(0.6, 'rgba(160,220,255,0.1)'); g.addColorStop(1, 'rgba(160,220,255,0)');
      c.fillStyle = g; c.fillRect(-170, -170, 340, 380);
    },
    back(c, S) {
      const K = S.K;
      // long loose mass behind (tied low at the nape, flowing behind the shoulders)
      K.mass(c, (c) => {
        c.beginPath();
        c.moveTo(-30, -104);
        c.bezierCurveTo(-92, -98, -100, -20, -92, 40);
        c.bezierCurveTo(-88, 90, -84, 140, -96, 200);
        c.lineTo(70, 200);
        c.bezierCurveTo(74, 140, 70, 80, 70, 40);
        c.bezierCurveTo(84, -30, 60, -104, -30, -104);
        c.closePath();
      }, { y0: -100, y1: 200 });
      K.lock(c, [-66, -50, -100, 20, -84, 110, -102, 200], 34, { p: 0.35 });
      K.lock(c, [-50, -30, -74, 60, -66, 130, -80, 200], 26, { p: 0.4 });
      K.lock(c, [56, -40, 76, 30, 64, 110, 74, 196], 26, { p: 0.4 });
    },
    body(c, S) {
      // indigo Hakka 藍衫, right-overlap 大襟 with light-blue piping, white inner collar
      S.robe(c, { sw: 106, swf: 94, y: 120, col: '#36598a', colL: '#4a70a2', colD: '#26426a', line: '#182a48', nl: -20, nr: 24 });
      S.crossCollar(c, {
        L: [-18, 94], R: [22, 94], X: [4, 150],
        layers: [{ col: '#a9c9e6', line: '#5a7aa0', w: 6 }, { col: '#f4efe6', line: '#9aa4b4', w: 4 }],
        skin: S.skin.base, skinShade: S.skin.shade, trimW: 6,
      });
      // 大襟 side closure line sweeping to the wearer's right, with 盤扣 knot buttons
      c.strokeStyle = '#a9c9e6'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(22, 112); c.bezierCurveTo(40, 120, 58, 132, 70, 152); c.lineTo(72, 200); c.stroke();
      c.strokeStyle = '#182a48'; c.lineWidth = 1; c.stroke();
      c.fillStyle = '#e8ecf2';
      for (const [x, y] of [[36, 118], [56, 132], [71, 160]]) { ell(c, x, y, 2.6, 2); c.fill(); c.strokeStyle = '#3a4a64'; c.lineWidth = 0.8; c.stroke(); }
      // 圍身裙 apron bib with silver neck chain
      c.beginPath();
      c.moveTo(-46, 200); c.lineTo(-40, 164); c.quadraticCurveTo(4, 156, 46, 164); c.lineTo(52, 200); c.closePath();
      c.fillStyle = '#2b2a3a'; c.fill(); c.strokeStyle = '#141320'; c.lineWidth = 1.3; c.stroke();
      c.strokeStyle = 'rgba(169,201,230,0.55)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-38, 170); c.quadraticCurveTo(4, 162, 44, 170); c.stroke();
      c.strokeStyle = '#d4dae4'; c.lineWidth = 1.5; c.setLineDash([2.2, 1.6]);
      c.beginPath(); c.moveTo(-40, 166); c.bezierCurveTo(-34, 130, -14, 104, -8, 96); c.stroke();
      c.beginPath(); c.moveTo(46, 166); c.bezierCurveTo(40, 130, 24, 106, 18, 98); c.stroke();
      c.setLineDash([]);
    },
    front(c, S) {
      const K = S.K;
      // crown cap
      K.mass(c, (c) => {
        c.beginPath();
        c.moveTo(-68, 30);
        c.bezierCurveTo(-86, -30, -80, -98, -18, -110);
        c.bezierCurveTo(38, -118, 80, -84, 70, -24);
        c.lineTo(64, 0);
        c.quadraticCurveTo(20, -66, -58, -30);
        c.lineTo(-62, 30);
        c.closePath();
      }, { y0: -110, y1: 40, top: S.hair.base, bot: S.hair.base });
      // long side locks framing the face (in front of the shoulders)
      K.lock(c, [-58, -50, -82, 20, -62, 90, -76, 172], 28, { p: 0.75, strands: 3 });
      K.lock(c, [-50, -40, -64, 40, -48, 100, -58, 150], 16, { p: 0.8 });
      K.lock(c, [60, -44, 74, 20, 68, 80, 74, 142], 20, { p: 0.8, strands: 3 });
      // bangs: soft, swept from a part on the near side
      K.locks(c, [
        [[-28, -100, -58, -86, -74, -44, -72, 8], 30],
        [[-26, -100, -42, -82, -50, -50, -50, -18], 30],
        [[-24, -100, -26, -76, -30, -48, -32, -20], 22],
        [[-22, -100, 30, -94, 58, -60, 68, -4], 30],
        [[-22, -100, 20, -90, 44, -56, 52, -16], 32],
        [[-22, -100, 6, -84, 24, -52, 28, -18], 30],
        [[-20, -100, -8, -76, 0, -40, 8, 4], 18],
      ].map((l) => { l[0] = l[0].slice(); l[0][1] += 6; return l; }), { p: 1, bulge: 0.3, rootDark: 0.08, strands: 1, rootLine: 0.35, w0: 0.45 });
      // wisps
      K.strand(c, [-20, -94, -10, -50, -2, -10], 0.9);
      K.strand(c, [62, -40, 80, -10, 76, 30], 1, null, 0.6);
      K.strand(c, [-62, -40, -86, 0, -78, 40], 1, null, 0.6);
    },
    acc(c, S) {
      c.save();
      // half-up tie at the back of the crown: red string wraps + jade comb
      c.strokeStyle = '#c3303a'; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-74, -64); c.quadraticCurveTo(-66, -56, -58, -66); c.stroke();
      c.beginPath(); c.moveTo(-76, -58); c.quadraticCurveTo(-67, -50, -58, -60); c.stroke();
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-66, -54); c.quadraticCurveTo(-76, -40, -72, -26); c.stroke();
      c.beginPath(); c.moveTo(-65, -54); c.quadraticCurveTo(-60, -40, -63, -30); c.stroke();
      const jg = c.createLinearGradient(-84, -86, -60, -70);
      jg.addColorStop(0, '#c8eedd'); jg.addColorStop(0.5, '#9fd3bd'); jg.addColorStop(1, '#5fa88c');
      c.beginPath(); c.moveTo(-86, -76); c.quadraticCurveTo(-72, -94, -56, -82); c.lineTo(-58, -76); c.quadraticCurveTo(-72, -86, -82, -72); c.closePath();
      c.fillStyle = jg; c.fill(); c.strokeStyle = '#3c7a64'; c.lineWidth = 1; c.stroke();
      // long drop earring (dark bead + jade drop) below the ear
      c.strokeStyle = '#c9a24a'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(-66, 34); c.lineTo(-66, 52); c.stroke();
      c.fillStyle = '#1a1a22'; ell(c, -66, 54, 2.6, 2.6); c.fill();
      c.beginPath(); c.moveTo(-66, 57); c.lineTo(-66, 66); c.stroke();
      c.fillStyle = '#9fd3bd'; ell(c, -66, 71, 3, 5); c.fill(); c.strokeStyle = '#3c7a64'; c.lineWidth = 0.8; c.stroke();
      // beauty mark on her right (near) cheek beside the nose
      c.fillStyle = 'rgba(70,40,36,0.85)'; ell(c, 4, 30, 1.6, 1.5); c.fill();
      c.restore();
    },
    live(c, t) {
      // drifting motes of light
      for (let k = 0; k < 6; k++) {
        const ph = (t * 0.12 + k / 6) % 1;
        const side = k % 2 ? 1 : -1;
        const x = side * (80 + U.hash(k, 3, 1) * 60) + Math.sin(t * 0.8 + k) * 6;
        const y = 150 - ph * 280;
        const a = Math.sin(ph * Math.PI) * 0.7;
        const g = c.createRadialGradient(x, y, 0, x, y, 6);
        g.addColorStop(0, `rgba(255,255,230,${a})`); g.addColorStop(1, 'rgba(180,240,255,0)');
        c.fillStyle = g; c.fillRect(x - 6, y - 6, 12, 12);
      }
    },
  });

  // ---------------- 沈星河 Shen Xinghe
  define('xinghe', {
    face: 'm',
    faceOpt: { jaw: 1.02, chinY: 82, eyeH: 28, browY: -22 },
    skin: SKIN.warm,
    eye: { iris: ['#4a2210', '#9a5422', '#e3a356', '#ffd59a'], lash: '#2a1a1a' },
    brow: { color: '#2d2026' },
    hair: { base: '#3a2c34', dark: '#1d1520', light: '#8a7488', line: '#160f16', hi: '#a98fa6' },
    behind(c) {
      // sword 「螢火」 on the back: hilt rising behind the far shoulder
      c.save();
      c.translate(74, 112); c.rotate(0.62);
      c.fillStyle = '#3a2a24'; c.fillRect(-5, 0, 10, 40);
      c.fillStyle = '#5a3a22'; c.fillRect(-4, -46, 8, 44);
      c.strokeStyle = '#2a170c'; c.lineWidth = 1.2; c.strokeRect(-4, -46, 8, 44);
      c.strokeStyle = '#c9a24a'; c.lineWidth = 1;
      for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(-4, -42 + k * 6); c.lineTo(4, -39 + k * 6); c.stroke(); }
      c.fillStyle = '#d6ae52'; ell(c, 0, -1, 13, 4); c.fill(); c.strokeStyle = '#7a5a1a'; c.stroke();
      ell(c, 0, -49, 5, 4); c.fill(); c.stroke();
      c.strokeStyle = '#d0283a'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(0, -52); c.quadraticCurveTo(8, -62, 4, -74); c.stroke();
      c.fillStyle = '#d0283a'; ell(c, 4, -76, 2.5, 4); c.fill();
      c.restore();
    },
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath();
        c.moveTo(-30, -104);
        c.bezierCurveTo(-94, -96, -96, -10, -78, 40);
        c.lineTo(-56, 52);
        c.lineTo(58, 10);
        c.bezierCurveTo(82, -60, 50, -110, -30, -104);
        c.closePath();
      });
      // messy nape
      K.lock(c, [-72, -10, -86, 24, -84, 56], 22);
      K.lock(c, [-62, 0, -70, 36, -62, 66], 18);
      K.lock(c, [-50, 10, -52, 40, -44, 60], 14);
    },
    body(c, S) {
      S.robe(c, { sw: 120, swf: 104, y: 116, col: '#34477a', colL: '#4a5f96', colD: '#232f55', line: '#16203e' });
      S.crossCollar(c, {
        L: [-24, 94], R: [28, 94], X: [4, 166],
        layers: [{ col: '#2a3966', line: '#16203e', w: 8 }, { col: '#f3efe6', line: '#a7a095', w: 7 }],
        skin: S.skin.base, skinShade: S.skin.shade, stitch: 'rgba(170,190,240,0.55)',
      });
      // shoulder seam & folds
      c.strokeStyle = 'rgba(20,28,60,0.55)'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-96, 128); c.quadraticCurveTo(-86, 160, -92, 200); c.stroke();
      c.beginPath(); c.moveTo(-60, 150); c.quadraticCurveTo(-52, 170, -56, 196); c.stroke();
      // sword strap across the chest
      c.fillStyle = '#5a3a26'; c.strokeStyle = '#2a170c'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(66, 118); c.lineTo(78, 124); c.lineTo(-6, 200); c.lineTo(-22, 200); c.closePath(); c.fill(); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      // short topknot: small bun with a spiky tail
      K.lock(c, [-20, -112, -30, -136, -10, -146], 18, { p: 0.8, bulge: 0.4, shine: false });
      K.lock(c, [-16, -114, 2, -136, 18, -136], 13, { p: 0.9, shine: false });
      K.lock(c, [-24, -112, -44, -128, -54, -116], 11, { p: 0.9, shine: false });
      ell(c, -18, -110, 15, 11, -0.3); c.fillStyle = S.hair.base; c.fill(); c.strokeStyle = S.hair.line; c.lineWidth = 1.3; c.stroke();
      K.mass(c, (c) => {
        c.beginPath();
        c.moveTo(-66, 20);
        c.bezierCurveTo(-88, -40, -76, -100, -18, -110);
        c.bezierCurveTo(40, -118, 82, -80, 70, -26);
        c.lineTo(64, -4);
        c.quadraticCurveTo(10, -70, -56, -24);
        c.lineTo(-60, 20);
        c.closePath();
      }, { top: S.hair.base, bot: S.hair.base });
      // red cord wrapped around the knot
      c.strokeStyle = '#c8283a'; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.ellipse(-18, -112, 11, 4, -0.35, 0.2, Math.PI - 0.2); c.stroke();
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-28, -110); c.quadraticCurveTo(-40, -102, -42, -90); c.stroke();
      c.beginPath(); c.moveTo(-26, -108); c.quadraticCurveTo(-34, -98, -32, -86); c.stroke();
      // messy spiky bangs
      const bangs = [
        [[-52, -78, -84, -44, -74, 8], 26],
        [[-40, -86, -60, -54, -56, -22], 26],
        [[-26, -92, -34, -56, -38, -24], 24],
        [[-12, -94, -12, -60, -20, -22], 24],
        [[0, -96, 10, -56, 6, -6], 22],
        [[10, -94, 22, -60, 16, 2], 18],
        [[20, -92, 38, -60, 38, -22], 24],
        [[32, -88, 58, -58, 58, -22], 24],
        [[44, -80, 70, -46, 70, -4], 20],
      ];
      for (const [s, w] of bangs) K.lock(c, s, w, { p: 1.05, bulge: 0.3, rootDark: 0.15 });
      // flyaways
      K.lock(c, [-30, -100, -52, -110, -68, -96], 9, { p: 1, strands: false });
      K.lock(c, [30, -104, 52, -110, 64, -92], 8, { p: 1, strands: false });
      // sideburn in front of the ear
      K.lock(c, [-58, -24, -66, 8, -56, 24], 14);
    },
  });


  // ---------------- 洛紅纓 Luo Hongying
  const HY_EYE = { iris: ['#3e0c12', '#93262a', '#e2744c', '#ffc08a'], lash: '#1e1016', slant: 0.16, h: 0.8, w: 1.04, lashMul: 1.15 };
  define('hongying', {
    face: 'f',
    faceOpt: { chinY: 78, blush: 0.12, browTh: 3.1, browY: -24 },
    skin: SKIN.fair,
    eye: HY_EYE,
    brow: { color: '#1e1418', arch: 0.6 },
    hair: { base: '#2c2333', dark: '#120c16', light: '#6c5c7c', line: '#0b070d', hi: '#9a8ab2' },
    mouths: { normal: 'flat' },
    behind(c) {
      // red-tasseled spear behind the far shoulder
      c.save(); c.translate(70, 140); c.rotate(0.3);
      c.fillStyle = '#5a3420'; c.fillRect(-3.5, -140, 7, 200);
      c.strokeStyle = '#2a1408'; c.lineWidth = 1; c.strokeRect(-3.5, -140, 7, 200);
      c.fillStyle = '#c9cfd8'; c.beginPath(); c.moveTo(0, -196); c.lineTo(8, -152); c.lineTo(0, -144); c.lineTo(-8, -152); c.closePath(); c.fill();
      c.strokeStyle = '#5c6470'; c.stroke();
      c.fillStyle = '#b0883a'; c.fillRect(-5, -146, 10, 6);
      for (let k = 0; k < 9; k++) {
        c.strokeStyle = k % 2 ? '#d8283a' : '#a8121f'; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-4 + k, -140); c.quadraticCurveTo(-14 + k * 2.5, -118, -10 + k * 3, -96 + (k % 3) * 4); c.stroke();
      }
      c.restore();
    },
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104);
        c.bezierCurveTo(-94, -96, -96, -10, -80, 30); c.lineTo(-50, 40); c.lineTo(58, 0);
        c.bezierCurveTo(82, -60, 50, -110, -30, -104); c.closePath();
      });
      // high ponytail: from the tie at the back-top, arcing back and down behind the shoulder
      K.lock(c, [-40, -112, -110, -120, -116, -20, -104, 130], 46, { p: 0.7, bulge: 0.4, strands: 4 });
      K.lock(c, [-44, -110, -96, -100, -88, -10, -74, 110], 30, { p: 0.8, strands: 3 });
      K.lock(c, [-46, -114, -128, -90, -130, 20, -126, 90], 22, { p: 0.9 });
      // ribbon tails
      for (const [sp1, w, col] of [[[-40, -112, -80, -90, -66, -10, -88, 80], 10, '#d42638'], [[-40, -112, -60, -80, -40, 0, -50, 60], 9, '#b8172a']]) {
        ribbonPath(c, sp1, w, { p: 0.15, bulge: 0.1, w0: 1 });
        c.fillStyle = col; c.fill(); c.strokeStyle = '#6a0814'; c.lineWidth = 1.1; c.stroke();
      }
    },
    body(c, S) {
      S.robe(c, { sw: 108, swf: 96, y: 118, col: '#b3202c', colL: '#d23a40', colD: '#7c1220', line: '#4a0810' });
      S.crossCollar(c, {
        L: [-20, 94], R: [24, 94], X: [6, 158],
        layers: [{ col: '#1e1a1e', line: '#000', w: 7 }, { col: '#f2ede6', line: '#a49c94', w: 5 }],
        skin: true, stitch: 'rgba(210,60,70,0.7)',
      });
      // black leather vest panels
      for (const side of [-1, 1]) {
        c.beginPath();
        if (side < 0) { c.moveTo(-58, 112); c.bezierCurveTo(-74, 112, -96, 120, -98, 132); c.lineTo(-92, 200); c.lineTo(-26, 200); c.bezierCurveTo(-34, 170, -40, 140, -38, 116); }
        else { c.moveTo(48, 108); c.bezierCurveTo(62, 110, 80, 118, 84, 130); c.lineTo(82, 200); c.lineTo(34, 200); c.bezierCurveTo(30, 170, 30, 140, 36, 112); }
        c.closePath();
        const g = c.createLinearGradient(-100, 110, 90, 200);
        g.addColorStop(0, '#3e3438'); g.addColorStop(1, '#17121a');
        c.fillStyle = g; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.4; c.stroke();
        c.setLineDash([2.5, 2.5]); c.strokeStyle = 'rgba(200,170,130,0.55)'; c.lineWidth = 0.9;
        c.beginPath();
        if (side < 0) { c.moveTo(-40, 120); c.bezierCurveTo(-42, 140, -36, 170, -30, 198); } else { c.moveTo(39, 116); c.bezierCurveTo(34, 140, 34, 170, 38, 198); }
        c.stroke(); c.setLineDash([]);
      }
      // brass studs
      c.fillStyle = '#d8b25a';
      for (const [x, y] of [[-44, 150], [-42, 172], [40, 150], [40, 172]]) { ell(c, x, y, 2, 2); c.fill(); }
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -112 });
      // ponytail base + red ribbon bow
      K.lock(c, [-30, -108, -44, -122, -58, -116], 22, { p: 0.6 });
      c.save();
      for (const [a, l] of [[-2.6, 16], [-0.9, 14]]) {
        c.beginPath(); c.moveTo(-38, -112);
        c.quadraticCurveTo(-38 + Math.cos(a - 0.4) * l, -112 + Math.sin(a - 0.4) * l, -38 + Math.cos(a) * l, -112 + Math.sin(a) * l);
        c.quadraticCurveTo(-38 + Math.cos(a + 0.5) * l * 0.8, -112 + Math.sin(a + 0.5) * l * 0.8, -38, -112);
        c.fillStyle = '#d42638'; c.fill(); c.strokeStyle = '#6a0814'; c.lineWidth = 1.1; c.stroke();
      }
      ell(c, -38, -112, 4.5, 4); c.fillStyle = '#a8121f'; c.fill(); c.stroke();
      c.restore();
      // side-swept sharp bangs
      K.locks(c, [
        [[-50, -80, -82, -46, -72, 16], 24],
        [[-38, -88, -58, -56, -54, -22], 26],
        [[-24, -92, -34, -58, -34, -26], 24],
        [[-8, -96, -6, -60, -14, -24], 22],
        [[4, -96, 16, -56, 12, 8], 20],
        [[16, -94, 34, -60, 34, -22], 24],
        [[30, -88, 54, -58, 54, -20], 24],
        [[44, -80, 70, -46, 66, 6], 20],
      ], { p: 1.1, bulge: 0.3, rootDark: 0.15 });
      // chin-length side locks
      K.lock(c, [-58, -40, -74, 10, -62, 50, -68, 76], 18, { p: 0.9 });
      K.lock(c, [60, -40, 72, 0, 66, 40, 70, 64], 14, { p: 0.9 });
    },
  });

  // ---------------- 雲歸 Yun Gui
  define('yungui', {
    face: 'm',
    faceOpt: { jaw: 1.02, chinY: 84, browY: -21 },
    skin: SKIN.fair,
    eye: { iris: ['#16302a', '#3f6f5e', '#8fc2a6', '#d4f0d8'], lash: '#1a1418', lid: 0.72, slant: 0.05, h: 0.92 },
    brow: { color: '#211a22', arch: 0.5 },
    hair: { base: '#2a2533', dark: '#100c16', light: '#6a6280', line: '#09070c', hi: '#a19ac0' },
    mouths: { normal: 'smirk', smile: 'smile' },
    expr(E, ex) { if (ex === 'surprise') E.open = 1.3; if (ex === 'angry') E.open = 1.15; if (ex === 'normal') { E.lift = 0.22; E.brFar = -2; } },
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104);
        c.bezierCurveTo(-96, -96, -100, 0, -96, 80); c.bezierCurveTo(-94, 130, -100, 170, -104, 200);
        c.lineTo(70, 200); c.bezierCurveTo(74, 130, 70, 60, 66, 20);
        c.bezierCurveTo(82, -60, 50, -110, -30, -104); c.closePath();
      }, { y0: -100, y1: 200 });
      K.lock(c, [-70, -30, -104, 40, -88, 120, -104, 200], 34, { p: 0.35 });
      K.lock(c, [56, -30, 78, 40, 64, 120, 76, 200], 26, { p: 0.35 });
    },
    body(c, S) {
      S.robe(c, { sw: 118, swf: 102, y: 116, col: '#7d8ea2', colL: '#98a8ba', colD: '#56657a', line: '#2e3846' });
      S.crossCollar(c, {
        L: [-24, 94], R: [28, 94], X: [4, 172],
        layers: [{ col: '#2c3646', line: '#121820', w: 10 }, { col: '#f1efe8', line: '#a9a59a', w: 6 }],
        skin: true, stitch: 'rgba(200,210,230,0.45)',
      });
      // talisman tucked in the collar
      c.save(); c.translate(-30, 150); c.rotate(-0.25);
      c.fillStyle = '#f2d36a'; c.fillRect(-7, -22, 14, 40); c.strokeStyle = '#a07d20'; c.lineWidth = 1; c.strokeRect(-7, -22, 14, 40);
      c.strokeStyle = '#c0242c'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(0, -18); c.lineTo(0, 12); c.moveTo(-4, -12); c.lineTo(4, -12); c.moveTo(-4, -4); c.quadraticCurveTo(0, 0, 4, -4); c.moveTo(-3, 4); c.lineTo(3, 8); c.stroke();
      c.restore();
      // sleeve folds
      c.strokeStyle = 'rgba(40,50,64,0.5)'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-100, 130); c.quadraticCurveTo(-88, 165, -96, 200); c.stroke();
      c.beginPath(); c.moveTo(84, 134); c.quadraticCurveTo(80, 170, 88, 200); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      // half-up bun on top
      K.lock(c, [-14, -104, -26, -134, 2, -138], 34, { p: 0.4, bulge: 0.7, strands: 3 });
      K.cap(c, { top: -112, wx: -2, hl: -104 });
      // centre parting: two swept curtains + finer locks
      K.locks(c, [
        [[-2, -100, -30, -98, -56, -60, -70, -10], 34],
        [[-4, -98, -40, -84, -60, -30, -66, 30], 22],
        [[-2, -100, -16, -80, -28, -50, -36, -22], 18],
        [[4, -100, 30, -98, 52, -64, 64, -16], 30],
        [[6, -100, 40, -86, 60, -36, 66, 24], 20],
        [[4, -100, 18, -78, 26, -52, 30, -26], 16],
      ], { p: 1, bulge: 0.25, rootDark: 0.05 });
      // stray strands over the forehead
      K.lock(c, [0, -100, 4, -70, -4, -40, 2, -12], 8, { p: 1, strands: false });
      K.lock(c, [-6, -98, -12, -70, -10, -46, -16, -24], 7, { p: 1, strands: false });
      // long side locks in front of the shoulders
      K.lock(c, [-62, -30, -80, 30, -62, 110, -74, 170], 24, { p: 0.6, strands: 3 });
      K.lock(c, [62, -30, 76, 30, 66, 100, 72, 150], 18, { p: 0.6 });
    },
    acc(c) {
      // wooden hairpin crown on the bun
      c.save();
      c.fillStyle = '#7a4f2c'; c.strokeStyle = '#3a2210'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-26, -118); c.lineTo(-22, -136); c.quadraticCurveTo(-10, -146, 2, -136); c.lineTo(6, -118); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#b07a46'; c.beginPath(); c.moveTo(-22, -128); c.lineTo(2, -128); c.stroke();
      c.fillStyle = '#d8b46a'; ell(c, -10, -130, 2.4, 2.4); c.fill();
      // pin through it
      c.strokeStyle = '#5a361a'; c.lineWidth = 2.6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-40, -120); c.lineTo(20, -134); c.stroke();
      c.fillStyle = '#c99550'; ell(c, 22, -134.5, 3, 3); c.fill();
      c.restore();
    },
  });

  // ---------------- 糰子 Tuanzi (石虎 leopard-cat spirit)
  const TZ = { fur: '#d0a066', furL: '#f4e4c6', furD: '#9c6c3a', spot: '#4e2f1a', line: '#5a3820', white: '#fffaf0' };
  function tzHead(c) {
    blob(c, [[-82, 6], [-76, -44], [-40, -76], [8, -82], [56, -72], [86, -36], [92, 10], [78, 50], [40, 72], [0, 76], [-44, 70], [-78, 44]]);
  }
  define('tuanzi', {
    face: 'f',
    faceOpt: { eyeX: -27, farX: 37, eyeY: 2, eyeW: 40, eyeH: 40, farW: 0.78, iris: 1.08, lash: 2.8, noseX: 6, noseY: 26, mouthX: 6, mouthY: 38, mouthW: 0.8, browY: -26, blush: 0.25 },
    skin: Object.assign({}, SKIN.fair, { base: TZ.fur, mid: TZ.furD, shade: TZ.furD, deep: '#7a4a2a', line: TZ.line, blush: '#ff9aa0', lip: '#a05050' }),
    eye: { iris: ['#2a3a10', '#7d9a22', '#e4e070', '#fff6b0'] },
    hair: { base: TZ.fur, dark: TZ.furD, light: TZ.furL, line: TZ.line },
    pose: { hx: 150, hy: 172, s: 1 },
    noNose: true, noBrows: true, ring: null, rimCol: null,
    neck() {},
    body(c) {
      // chubby round body
      blob(c, [[-96, 200], [-100, 140], [-80, 96], [-40, 76], [40, 74], [84, 96], [100, 140], [96, 200]]);
      c.fillStyle = TZ.fur; c.fill(); c.strokeStyle = TZ.line; c.lineWidth = 2; c.stroke();
      blob(c, [[-50, 200], [-56, 130], [-20, 96], [30, 96], [60, 130], [56, 200]]);
      c.fillStyle = TZ.furL; c.fill();
      c.fillStyle = TZ.spot;
      for (const [x, y, r] of [[-82, 130, 6], [-70, 150, 5], [-86, 168, 5], [74, 126, 5], [82, 150, 6], [70, 170, 4], [-64, 112, 4], [64, 108, 4]]) { ell(c, x, y, r, r * 0.8, 0.4); c.fill(); }
      // little paws holding a glowing mushroom
      c.save(); c.translate(16, 150);
      c.fillStyle = '#e8d8ff'; ell(c, 0, -10, 4, 10); c.fill();
      const mg = c.createRadialGradient(0, -24, 2, 0, -24, 22);
      mg.addColorStop(0, '#ffd0ff'); mg.addColorStop(0.5, '#c070f0'); mg.addColorStop(1, '#6a2aa8');
      c.beginPath(); c.moveTo(-18, -18); c.quadraticCurveTo(-16, -38, 0, -38); c.quadraticCurveTo(16, -38, 18, -18); c.closePath();
      c.fillStyle = mg; c.fill(); c.strokeStyle = '#4a1a78'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.8)'; for (const [x, y] of [[-8, -28], [4, -32], [10, -24]]) { ell(c, x, y, 2.2, 1.8); c.fill(); }
      for (const dx of [-9, 9]) {
        ell(c, dx, -4, 10, 8, dx * 0.03); c.fillStyle = TZ.furL; c.fill(); c.strokeStyle = TZ.line; c.lineWidth = 1.5; c.stroke();
        c.lineWidth = 1.1;
        for (const k of [-4, 0, 4]) { c.beginPath(); c.moveTo(dx + k, -11.5); c.lineTo(dx + k * 0.9, -8); c.stroke(); }
      }
      c.restore();
    },
    front(c) {},
    faceDraw(c, S) {
      // ears
      for (const [x, y, r, sc] of [[-52, -62, -0.5, 1], [50, -66, 0.45, 0.85]]) {
        c.save(); c.translate(x, y); c.rotate(r); c.scale(sc, 1);
        c.beginPath(); c.moveTo(-24, 14); c.quadraticCurveTo(-26, -30, 0, -38); c.quadraticCurveTo(26, -30, 24, 14); c.closePath();
        c.fillStyle = TZ.fur; c.fill(); c.strokeStyle = TZ.line; c.lineWidth = 2; c.stroke();
        c.beginPath(); c.moveTo(-14, 10); c.quadraticCurveTo(-14, -22, 0, -27); c.quadraticCurveTo(14, -22, 14, 10); c.closePath();
        c.fillStyle = '#f6c8b8'; c.fill();
        c.strokeStyle = TZ.white; c.lineWidth = 1.2;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * 5, 8); c.lineTo(k * 7, -8); c.stroke(); }
        c.fillStyle = TZ.spot; c.beginPath(); c.moveTo(-6, -34); c.quadraticCurveTo(0, -40, 6, -34); c.quadraticCurveTo(0, -30, -6, -34); c.fill();
        c.restore();
      }
      tzHead(c);
      const g = c.createRadialGradient(-20, -30, 10, 0, 0, 100);
      g.addColorStop(0, '#e2b67c'); g.addColorStop(0.7, TZ.fur); g.addColorStop(1, TZ.furD);
      c.fillStyle = g; c.fill();
      c.save(); tzHead(c); c.clip();
      // cream muzzle & cheeks
      const mg = c.createRadialGradient(6, 40, 6, 6, 44, 60);
      mg.addColorStop(0, TZ.white); mg.addColorStop(0.6, TZ.furL); mg.addColorStop(1, U.rgba(TZ.furL, 0));
      c.fillStyle = mg; ell(c, 6, 44, 62, 40); c.fill();
      // white eye marks
      c.fillStyle = TZ.white;
      for (const [x, w] of [[-26, 20], [36, 15]]) {
        c.beginPath(); c.moveTo(x - w * 0.6, 14); c.quadraticCurveTo(x, 30, x + w * 0.2, 44); c.quadraticCurveTo(x + w * 0.5, 26, x + w * 0.7, 14); c.closePath(); c.fill();
      }
      ell(c, -26, -18, 16, 6); c.fill(); ell(c, 36, -20, 12, 5); c.fill();
      // forehead stripes (4 dark)
      c.strokeStyle = TZ.spot; c.lineCap = 'round';
      for (const [x0, x1, w] of [[-12, -18, 5], [0, -2, 5.5], [12, 14, 5.5], [22, 32, 4.5]]) {
        c.lineWidth = w;
        c.beginPath(); c.moveTo(x0, -30); c.quadraticCurveTo((x0 + x1) / 2 - 2, -60, x1, -84); c.stroke();
      }
      // cheek stripes & spots
      c.lineWidth = 3.5;
      c.beginPath(); c.moveTo(-60, 12); c.quadraticCurveTo(-72, 18, -80, 14); c.stroke();
      c.beginPath(); c.moveTo(-58, 24); c.quadraticCurveTo(-70, 32, -78, 30); c.stroke();
      c.beginPath(); c.moveTo(66, 10); c.quadraticCurveTo(78, 14, 86, 10); c.stroke();
      c.fillStyle = TZ.spot;
      for (const [x, y, r] of [[-60, -30, 4], [-68, -14, 3.5], [70, -30, 3.5], [-40, -50, 3], [54, -50, 3]]) { ell(c, x, y, r, r * 0.8); c.fill(); }
      c.restore();
      tzHead(c); c.strokeStyle = TZ.line; c.lineWidth = 2.2; c.stroke();
      // fluffy cheek tufts
      c.fillStyle = TZ.furL; c.strokeStyle = TZ.line; c.lineWidth = 1.6;
      for (const [x, y, d] of [[-80, 36, -1], [86, 34, 1]]) {
        c.beginPath(); c.moveTo(x - d * 4, y - 14); c.lineTo(x + d * 10, y - 6); c.lineTo(x + d * 2, y); c.lineTo(x + d * 10, y + 8); c.lineTo(x - d * 6, y + 14); c.closePath(); c.fill(); c.stroke();
      }
    },
    faceDraw2(c, S) {
      // nose
      c.fillStyle = '#e88a90';
      c.beginPath(); c.moveTo(-1, 22); c.quadraticCurveTo(6, 19, 13, 22); c.quadraticCurveTo(10, 29, 6, 31); c.quadraticCurveTo(2, 29, -1, 22); c.fill();
      c.strokeStyle = '#8a3a40'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)'; ell(c, 4, 23.5, 2.2, 1.2); c.fill();
      c.strokeStyle = TZ.line; c.lineWidth = 1.4; c.beginPath(); c.moveTo(6, 31); c.lineTo(6, 35); c.stroke();
    },
    mouths: { normal: 'catw', smile: 'catw', smug: 'catw', think: 'catw' },
    over(c, S) {
      // whiskers
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.1; c.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        c.beginPath(); c.moveTo(-24, 34 + k * 5); c.quadraticCurveTo(-60, 30 + k * 7, -96, 28 + k * 12); c.stroke();
        c.beginPath(); c.moveTo(34, 32 + k * 5); c.quadraticCurveTo(70, 28 + k * 6, 100, 24 + k * 11); c.stroke();
      }
      // expressive little brows (fur tufts)
      const E = S.E;
      c.strokeStyle = TZ.spot; c.lineWidth = 3.4;
      const b = (x, y, dIn, dOut, dir) => { c.beginPath(); c.moveTo(x + dir * 7, y + dIn * 0.6); c.lineTo(x - dir * 7, y + dOut * 0.6); c.stroke(); };
      b(-26, -28, E.brIn, E.brOut, 1); b(36, -29, E.brIn, E.brOut + E.brFar, -1);
    },
  });

  // ---------------- 陳伯 Chen Bo
  define('chenbo', {
    face: 'old_m',
    faceOpt: { browY: -17 },
    skin: SKIN.old,
    eye: { iris: ['#2a1a10', '#5e3a22', '#a07450', '#d8b08a'], lash: '#2a1a14', lid: 0.85 },
    brow: { color: '#a8a4a0', th: 1.3, bushy: true, arch: 0.5 },
    hair: { base: '#a9a7a8', dark: '#6c6870', light: '#e8e6e4', line: '#4a464c', hi: '#f2f0ee' },
    mouths: { normal: 'grumpy', serious: 'grumpy', sad: 'frown' },
    wrinkles(c, S) { S.wr(c, 2); },
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-40, -96); c.bezierCurveTo(-92, -86, -92, -10, -76, 30); c.lineTo(-54, 44); c.lineTo(56, 0); c.bezierCurveTo(76, -60, 40, -104, -40, -96); c.closePath();
      });
    },
    body(c, S) {
      S.robe(c, { sw: 118, swf: 104, y: 118, col: '#6b5040', colL: '#836552', colD: '#4a372c', line: '#2a1c14' });
      S.crossCollar(c, {
        L: [-24, 96], R: [30, 96], X: [6, 170],
        layers: [{ col: '#3e2e24', line: '#1e140e', w: 8 }, { col: '#d9cdb4', line: '#8f846e', w: 6 }],
        skin: true,
      });
      // patches & paint stains (lantern maker)
      c.fillStyle = '#7d6250'; c.strokeStyle = '#2a1c14'; c.lineWidth = 1;
      c.fillRect(-92, 150, 18, 16); c.setLineDash([2, 2]); c.strokeRect(-92, 150, 18, 16); c.setLineDash([]);
      c.fillStyle = 'rgba(200,40,40,0.6)'; ell(c, 60, 160, 4, 3); c.fill(); ell(c, 66, 166, 2, 2); c.fill();
    },
    front(c, S) {
      const K = S.K;
      // receding hairline: grey hair only on the sides and back, topknot on the crown
      K.lock(c, [-22, -100, -24, -128, -2, -128], 32, { p: 0.4, bulge: 0.8 });
      c.fillStyle = '#7a5a3a'; c.strokeStyle = '#3a2410'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-36, -116); c.lineTo(16, -122); c.lineTo(17, -119); c.lineTo(-35, -113); c.closePath(); c.fill(); c.stroke();
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-64, 24); c.bezierCurveTo(-86, -30, -76, -98, -20, -106);
        c.bezierCurveTo(30, -112, 68, -86, 64, -40); c.lineTo(58, -38);
        c.bezierCurveTo(50, -80, 0, -92, -40, -70); c.bezierCurveTo(-56, -50, -58, -20, -56, 24); c.closePath();
      }, { top: S.hair.base, bot: S.hair.base });
      K.locks(c, [
        [[-50, -76, -70, -40, -64, 10], 18], [[-58, -50, -70, -10, -60, 22], 14], [[56, -70, 66, -50, 62, -30], 12],
      ], { p: 0.9 });
    },
    faceDraw2(c, S) {
      // bald pate sheen
      c.fillStyle = 'rgba(255,255,255,0.25)'; ell(c, -10, -76, 20, 8, -0.2); c.fill();
    },
    facial(c, S) {
      // short grey moustache & chin tuft
      const F = S.F;
      c.fillStyle = '#b8b4b0'; c.strokeStyle = '#6a6466'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(F.mouthX - 14, F.mouthY - 1); c.quadraticCurveTo(F.mouthX - 6, F.mouthY - 10, F.mouthX + 2, F.mouthY - 7);
      c.quadraticCurveTo(F.mouthX + 9, F.mouthY - 10, F.mouthX + 12, F.mouthY - 1); c.quadraticCurveTo(F.mouthX + 2, F.mouthY - 4, F.mouthX - 14, F.mouthY - 1); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(F.chinX - 8, F.chinY - 6); c.quadraticCurveTo(F.chinX, F.chinY + 12, F.chinX + 6, F.chinY - 6); c.fill(); c.stroke();
    },
  });

  // ---------------- 夜玄 Ye Xuan
  define('yexuan', {
    face: 'm',
    faceOpt: { jaw: 0.98, chinY: 92, cheek: -3, browY: -19, eyeH: 24, mouthY: 61, blush: 0 },
    skin: Object.assign({}, SKIN.fair, { base: '#f8e6dc', mid: '#efd2c4', blush: '#e8a0a0' }),
    eye: { iris: ['#140f20', '#3f3456', '#8d7cb0', '#c8bce0'], lash: '#16101a', droop: 0.1, lid: 0.9 },
    brow: { color: '#201820', arch: 0.4 },
    hair: { base: '#24202a', dark: '#0c0a10', light: '#5e5868', line: '#060508', hi: '#8a8498' },
    mouths: { normal: 'flat', smile: 'smile' },
    expr(E, ex) { E.outD += 0.04; if (ex === 'normal') { E.brIn = -2; E.brOut = 1; } },
    wrinkles(c, S) {
      // gaunt cheek hollows & tired eyes
      const F = S.F;
      c.save();
      c.strokeStyle = 'rgba(130,100,120,0.45)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(F.eyeX - 12, F.eyeY + 17); c.quadraticCurveTo(F.eyeX, F.eyeY + 21, F.eyeX + 10, F.eyeY + 16); c.stroke();
      const g = c.createLinearGradient(-60, 30, -40, 50);
      g.addColorStop(0, 'rgba(160,120,130,0.16)'); g.addColorStop(1, 'rgba(160,120,130,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(-62, 20); c.quadraticCurveTo(-50, 40, -34, 52); c.lineTo(-50, 60); c.closePath(); c.fill();
      c.restore();
    },
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104);
        c.bezierCurveTo(-100, -96, -104, 0, -100, 80); c.bezierCurveTo(-98, 130, -104, 170, -110, 200);
        c.lineTo(76, 200); c.bezierCurveTo(80, 130, 74, 60, 70, 20);
        c.bezierCurveTo(84, -60, 50, -110, -30, -104); c.closePath();
      }, { y0: -100, y1: 200 });
      K.lock(c, [-70, -30, -110, 40, -94, 120, -112, 200], 36, { p: 0.3 });
      K.lock(c, [-60, -20, -88, 60, -80, 140, -92, 200], 20, { p: 0.3, color: '#8c8a94', rootCol: '#5a5862' });
      K.lock(c, [58, -30, 84, 40, 70, 120, 84, 200], 28, { p: 0.35 });
    },
    body(c, S) {
      S.robe(c, { sw: 116, swf: 102, y: 116, col: '#1c1a22', colL: '#2e2b36', colD: '#0c0b10', line: '#000' });
      const gold = '#d6ae52';
      S.crossCollar(c, {
        L: [-24, 94], R: [28, 94], X: [4, 176],
        layers: [{ col: '#f2efe9', line: '#9a958c', w: 12 }, { col: '#1c1a22', line: '#000', w: 4 }, { col: '#ffffff', line: '#aaa', w: 5 }],
        skin: true,
        flapDeco(c, R0, ext, nx, ny, tw) {
          // gold lantern motifs on the white collar band
          for (let k = 1; k < 6; k++) {
            const t = k / 6.5, x = U.lerp(R0[0], ext[0], t) + nx * tw / 2, y = U.lerp(R0[1], ext[1], t) + ny * tw / 2;
            c.fillStyle = gold; ell(c, x, y, 3, 3.8); c.fill();
            c.fillRect(x - 2, y - 5, 4, 1.4); c.fillRect(x - 2, y + 3.8, 4, 1.4);
            c.strokeStyle = gold; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y + 5); c.lineTo(x, y + 8); c.stroke();
          }
        },
      });
      // gold lantern embroidery on the black robe
      c.strokeStyle = 'rgba(214,174,82,0.85)'; c.lineWidth = 1.1;
      for (const [x, y, sc] of [[-80, 150, 1.3], [-56, 178, 1], [70, 150, 1.1]]) {
        c.save(); c.translate(x, y); c.scale(sc, sc);
        c.beginPath(); c.ellipse(0, 0, 6, 8, 0, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(-4, -8); c.lineTo(4, -8); c.moveTo(-4, 8); c.lineTo(4, 8); c.moveTo(0, -8); c.lineTo(0, -14); c.moveTo(0, 8); c.lineTo(0, 13); c.stroke();
        c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.stroke();
        c.restore();
      }
      // white over-mantle shoulder trim
      c.strokeStyle = '#e9e5dc'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-104, 124); c.quadraticCurveTo(-70, 108, -40, 104); c.stroke();
      c.beginPath(); c.moveTo(90, 124); c.quadraticCurveTo(70, 110, 50, 104); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -112, wx: 0, hl: -100 });
      // centre-parted, long, slightly unkempt
      K.locks(c, [
        [[-6, -98, -40, -84, -60, -30], 26],
        [[-12, -96, -56, -70, -72, 0], 22],
        [[-2, -98, -18, -62, -34, -28], 18],
        [[6, -98, 26, -70, 40, -26], 20],
        [[12, -96, 48, -74, 62, -24], 22],
        [[18, -94, 60, -66, 70, 4], 18],
      ], { p: 1, bulge: 0.25, rootDark: 0.1 });
      // grey streak
      K.lock(c, [-10, -98, -46, -84, -62, -40, -72, 10], 10, { p: 0.9, color: '#9a98a2', rootCol: '#6a6872', tipCol: '#b8b6c0' });
      // long locks over the shoulders
      K.lock(c, [-62, -30, -84, 40, -68, 120, -84, 180], 22, { p: 0.5, strands: 3 });
      K.lock(c, [62, -30, 76, 40, 66, 110, 76, 170], 18, { p: 0.5 });
      K.lock(c, [64, -20, 78, 50, 72, 100, 80, 140], 6, { p: 0.6, color: '#9a98a2', rootCol: '#6a6872', strands: false });
      // a single strand across the face
      K.strand(c, [0, -96, 16, -40, 8, 10], 1.1, '#141018', 0.9);
    },
    acc(c) {
      // small silver crown with a gold lantern finial
      c.save();
      c.fillStyle = '#c9ccd4'; c.strokeStyle = '#555a66'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(-28, -110); c.lineTo(-24, -124); c.quadraticCurveTo(-10, -132, 6, -124); c.lineTo(8, -110); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#d6ae52'; ell(c, -10, -130, 4, 5); c.fill(); c.strokeStyle = '#7a5a1a'; c.stroke();
      c.strokeStyle = '#2a2a30'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-38, -114); c.lineTo(16, -122); c.stroke();
      c.restore();
    },
  });

  // ---------------- 洛青鋒 Luo Qingfeng (and masked 鬼面)
  const QF = {
    face: 'm',
    faceOpt: { jaw: 1.0, chinY: 84, browY: -21, eyeH: 27 },
    skin: SKIN.fair,
    eye: { iris: ['#2e080c', '#7a1c22', '#c8503a', '#f09070'], lash: '#140a0e', slant: 0.12, h: 0.92 },
    brow: { color: '#181014', arch: 0.5 },
    hair: { base: '#28202c', dark: '#0e0a10', light: '#5c5068', line: '#08060a', hi: '#8a7c98' },
    mouths: { normal: 'flat' },
    expr(E, ex) { if (ex === 'normal') { E.inD = 0.12; E.brIn = 2; } },
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104);
        c.bezierCurveTo(-94, -96, -96, -10, -80, 30); c.lineTo(-50, 40); c.lineTo(58, 0);
        c.bezierCurveTo(82, -60, 50, -110, -30, -104); c.closePath();
      });
      K.lock(c, [-40, -110, -104, -110, -104, -10, -96, 140], 36, { p: 0.7, bulge: 0.3, strands: 3 });
      K.lock(c, [-44, -108, -88, -90, -82, 0, -70, 120], 24, { p: 0.8 });
      ribbonPath(c, [-40, -110, -70, -90, -62, -30, -74, 40], 7, { p: 0.15, bulge: 0.1, w0: 1 });
      c.fillStyle = '#7a1420'; c.fill(); c.strokeStyle = '#3a0408'; c.lineWidth = 1; c.stroke();
    },
    body(c, S) {
      S.robe(c, { sw: 118, swf: 104, y: 116, col: '#221c22', colL: '#342c34', colD: '#0e0a0e', line: '#000' });
      S.crossCollar(c, {
        L: [-22, 94], R: [26, 94], X: [6, 160],
        layers: [{ col: '#6e1a22', line: '#2a0408', w: 9 }, { col: '#1a1418', line: '#000', w: 5 }],
        skin: true,
      });
      // leather shoulder guard & strap
      c.fillStyle = '#3a2a26'; c.strokeStyle = '#120a08'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-110, 128); c.quadraticCurveTo(-96, 106, -60, 108); c.lineTo(-66, 140); c.quadraticCurveTo(-92, 138, -112, 150); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#5e1a20'; c.beginPath(); c.moveTo(-60, 108); c.lineTo(-48, 110); c.lineTo(34, 200); c.lineTo(16, 200); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#a88a52'; ell(c, -84, 124, 2.4, 2.4); c.fill(); ell(c, -72, 122, 2.4, 2.4); c.fill();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -112 });
      K.lock(c, [-30, -108, -44, -120, -56, -112], 18, { p: 0.6 });
      c.fillStyle = '#7a1420'; c.strokeStyle = '#3a0408'; c.lineWidth = 1; ell(c, -40, -111, 6, 4, -0.4); c.fill(); c.stroke();
      K.locks(c, [
        [[-50, -78, -84, -44, -74, 10], 24],
        [[-38, -88, -58, -56, -56, -22], 24],
        [[-22, -94, -32, -58, -36, -24], 22],
        [[-6, -96, -2, -60, -10, -22], 20],
        [[4, -96, 18, -50, 10, 16], 16],
        [[16, -94, 36, -60, 36, -22], 22],
        [[30, -88, 56, -58, 56, -20], 22],
        [[44, -80, 70, -46, 68, 0], 18],
      ], { p: 1.1, bulge: 0.3, rootDark: 0.15 });
      K.lock(c, [-58, -36, -72, 0, -62, 30, -66, 50], 14);
    },
  };
  define('qingfeng', Object.assign({}, QF));
  define('qingfeng_mask', Object.assign({}, QF, {
    mouths: { normal: 'flat', smile: 'smirk', laugh: 'smirk', shy: 'flat' },
    noBrows: true,
    over(c, S) {
      // white 鬼面 half-mask with red markings, covering the upper face
      const holes = (c) => {
        for (const near of [true, false]) {
          const fr = S.eyeFrame(S.F, S.sp, near);
          const T = fr.T;
          const a = T([-0.62, 0.18]), b = T([-0.2, -0.62]), d = T([0.72, -0.12]), e = T([0.2, 0.62]);
          c.moveTo(a[0], a[1]); c.quadraticCurveTo(b[0], b[1], d[0], d[1]); c.quadraticCurveTo(e[0], e[1], a[0], a[1]); c.closePath();
        }
      };
      const mask = (c) => {
        c.beginPath();
        c.moveTo(-68, -60); c.bezierCurveTo(-40, -82, 40, -84, 66, -56);
        c.bezierCurveTo(70, -20, 66, 10, 60, 26);
        c.quadraticCurveTo(44, 30, 34, 38); c.quadraticCurveTo(26, 30, 18, 30);
        c.quadraticCurveTo(-30, 38, -66, 22);
        c.bezierCurveTo(-72, 0, -72, -30, -68, -60); c.closePath();
      };
      c.save();
      mask(c); holes(c);
      const g = c.createLinearGradient(-60, -70, 60, 30);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#eceae6'); g.addColorStop(1, '#c4c0bc');
      c.fillStyle = g; c.fill('evenodd');
      c.strokeStyle = '#6a6460'; c.lineWidth = 1.6; c.stroke();
      c.save(); c.beginPath(); holes(c); c.fillStyle = 'rgba(10,0,4,0.35)'; c.fill(); c.restore();
      // red markings: brows, cheek flames, forehead jewel
      c.beginPath(); mask(c); c.clip();
      c.fillStyle = '#c4162a'; c.strokeStyle = '#c4162a'; c.lineCap = 'round';
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(-6, -32); c.quadraticCurveTo(-26, -46, -54, -36); c.stroke();
      c.beginPath(); c.moveTo(26, -30); c.quadraticCurveTo(44, -42, 62, -34); c.stroke();
      c.lineWidth = 2.4;
      for (const [x, y, d] of [[-50, 14, -1], [-40, 18, -1], [52, 12, 1]]) {
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + d * 4, y - 10, x + d * 2, y - 20); c.stroke();
      }
      c.beginPath(); c.moveTo(10, -66); c.lineTo(16, -54); c.lineTo(10, -42); c.lineTo(4, -54); c.closePath(); c.fill();
      c.lineWidth = 1.4; c.strokeStyle = 'rgba(80,70,70,0.4)';
      c.beginPath(); c.moveTo(16, -40); c.quadraticCurveTo(26, -10, 24, 26); c.stroke();
      c.restore();
    },
  }));

  // ---------------- 清虛真人 Qingxu
  define('qingxu', {
    face: 'old_m',
    faceOpt: { browY: -18, chinY: 84 },
    skin: SKIN.old,
    eye: { iris: ['#1e1a16', '#4a4036', '#8a7c6a', '#c0b4a0'], lash: '#3a3430', lid: 0.7 },
    brow: { color: '#f4f2ee', th: 1.4, bushy: true, arch: 0.3, halo: false },
    hair: { base: '#eeece8', dark: '#b4b2b6', light: '#ffffff', line: '#8a8890', hi: '#ffffff' },
    mouths: { normal: 'flat', smile: 'smile' },
    wrinkles(c, S) { S.wr(c, 2); },
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104); c.bezierCurveTo(-96, -96, -98, 0, -92, 60); c.bezierCurveTo(-90, 120, -96, 160, -98, 200);
        c.lineTo(66, 200); c.bezierCurveTo(70, 120, 66, 40, 62, 10); c.bezierCurveTo(80, -60, 50, -110, -30, -104); c.closePath();
      }, { y0: -100, y1: 200 });
    },
    body(c, S) {
      S.robe(c, { sw: 118, swf: 104, y: 118, col: '#2f3d6a', colL: '#43548a', colD: '#1c2648', line: '#0c1228' });
      S.crossCollar(c, {
        L: [-24, 96], R: [30, 96], X: [6, 176],
        layers: [{ col: '#16192a', line: '#000', w: 11 }, { col: '#f3f1ea', line: '#9e9a90', w: 6 }],
        skin: true,
      });
      // taiji emblem on the sleeve
      c.save(); c.translate(-84, 160);
      ell(c, 0, 0, 11, 11); c.fillStyle = '#f3f1ea'; c.fill(); c.strokeStyle = '#d8b04a'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.arc(0, 0, 11, -Math.PI / 2, Math.PI / 2); c.arc(0, 5.5, 5.5, Math.PI / 2, -Math.PI / 2, true); c.arc(0, -5.5, 5.5, Math.PI / 2, -Math.PI / 2, false); c.fillStyle = '#16192a'; c.fill();
      ell(c, 0, -5.5, 1.8, 1.8); c.fill(); ell(c, 0, 5.5, 1.8, 1.8); c.fillStyle = '#f3f1ea'; c.fill();
      c.restore();
    },
    front(c, S) {
      const K = S.K;
      K.lock(c, [-14, -104, -24, -132, 4, -136], 34, { p: 0.4, bulge: 0.8 });
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-64, 24); c.bezierCurveTo(-86, -30, -76, -100, -18, -110);
        c.bezierCurveTo(36, -116, 72, -86, 66, -36); c.lineTo(60, -30);
        c.bezierCurveTo(40, -66, 0, -72, -30, -64); c.bezierCurveTo(-52, -56, -58, -20, -56, 24); c.closePath();
      }, { top: S.hair.base, bot: S.hair.base });
      K.locks(c, [[[-56, -50, -72, -10, -62, 30], 16], [[60, -40, 70, -10, 66, 20], 12]], { p: 0.9 });
    },
    acc(c) {
      // black 道冠 with a jade pin
      c.save();
      c.fillStyle = '#1a1a22'; c.strokeStyle = '#000'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(-30, -114); c.lineTo(-26, -138); c.lineTo(8, -142); c.lineTo(10, -116); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = '#d6ae52'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-28, -122); c.lineTo(9, -126); c.stroke();
      c.strokeStyle = '#5aa880'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-42, -124); c.lineTo(22, -132); c.stroke();
      c.restore();
    },
    facial(c, S) {
      const F = S.F, K = S.K;
      // long white beard and moustache
      const H = { color: '#f4f2ee', rootCol: '#d8d6d4', tipCol: '#ffffff', line: '#8a8890' };
      K.lock(c, [F.chinX - 2, F.chinY - 22, F.chinX - 12, F.chinY + 40, F.chinX + 4, F.chinY + 90, F.chinX - 4, F.chinY + 130], 46, Object.assign({ p: 0.8, bulge: 0.2, strands: 4, w0: 0.7 }, H));
      K.lock(c, [F.chinX - 22, F.chinY - 26, F.chinX - 30, F.chinY + 20, F.chinX - 22, F.chinY + 60, F.chinX - 30, F.chinY + 90], 22, Object.assign({ p: 0.9 }, H));
      K.lock(c, [F.chinX + 18, F.chinY - 26, F.chinX + 24, F.chinY + 10, F.chinX + 18, F.chinY + 50, F.chinX + 22, F.chinY + 80], 16, Object.assign({ p: 0.9 }, H));
      K.lock(c, [F.mouthX - 2, F.mouthY - 6, F.mouthX - 16, F.mouthY - 4, F.mouthX - 26, F.mouthY + 16], 9, Object.assign({ p: 1, strands: false }, H));
      K.lock(c, [F.mouthX + 2, F.mouthY - 6, F.mouthX + 12, F.mouthY - 4, F.mouthX + 16, F.mouthY + 12], 7, Object.assign({ p: 1, strands: false }, H));
    },
  });

  // ---------------- 墨鴉 Mo Ya
  function moyaFeather(c, x, y, ang, len, w) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(w * 0.9, len * 0.25, w * 0.7, len * 0.8, 0, len); c.bezierCurveTo(-w * 0.6, len * 0.75, -w * 0.9, len * 0.25, 0, 0); c.closePath();
    const g = c.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, '#30324a'); g.addColorStop(0.45, '#12121c'); g.addColorStop(1, '#22243a');
    c.fillStyle = g; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.1; c.stroke();
    c.strokeStyle = 'rgba(130,150,230,0.5)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, 3); c.quadraticCurveTo(w * 0.1, len * 0.5, 0, len * 0.9); c.stroke();
    c.strokeStyle = 'rgba(90,100,170,0.35)'; c.lineWidth = 0.7;
    for (let k = 1; k < 5; k++) { const yy = len * k / 5; c.beginPath(); c.moveTo(0, yy - 4); c.lineTo(w * 0.5, yy); c.moveTo(0, yy - 4); c.lineTo(-w * 0.45, yy); c.stroke(); }
    c.restore();
  }
  define('moya', {
    face: 'm',
    faceOpt: { jaw: 0.97, chinY: 94, cheek: -3, eyeH: 22, browY: -19, chinW: 4 },
    skin: Object.assign({}, SKIN.pale, { base: '#f6ebe4', mid: '#e8d6cc' }),
    eye: { iris: ['#1e0a2c', '#5a2a80', '#b070d8', '#e8c0ff'], lash: '#120a14', slant: 0.16, lid: 0.82 },
    brow: { color: '#0e0a10', arch: 1.2 },
    hair: { base: '#1e1c28', dark: '#08070c', light: '#4a4a66', line: '#040306', hi: '#7a86b0' },
    mouths: { normal: 'smirk', smile: 'smirk' },
    expr(E, ex) { if (ex === 'normal') { E.brFar = -3; } },
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104); c.bezierCurveTo(-94, -96, -94, -20, -80, 26); c.lineTo(-50, 30); c.lineTo(58, 0); c.bezierCurveTo(82, -60, 50, -110, -30, -104); c.closePath();
      });
      S.K.lock(c, [-70, -20, -92, 20, -96, 56], 22);
    },
    body(c, S) {
      S.robe(c, { sw: 116, swf: 102, y: 116, col: '#2a2236', colL: '#3a3048', colD: '#120e18', line: '#000' });
      S.crossCollar(c, {
        L: [-20, 94], R: [24, 94], X: [6, 160],
        layers: [{ col: '#4a2a6a', line: '#1a0a2a', w: 6 }, { col: '#14101a', line: '#000', w: 5 }],
        skin: true,
      });
    },
    behind(c) {
      // tall feather collar fanning up behind the neck
      for (let k = 0; k < 11; k++) {
        const t = k / 10;
        moyaFeather(c, U.lerp(-60, 66, t), 112 - Math.sin(t * Math.PI) * 4, (t - 0.5) * 1.6 + Math.PI, 52 + Math.sin(t * Math.PI) * 26, 11);
      }
    },
    bodyAfter(c, S) {
      // crow-feather mantle over both shoulders
      const rng = U.seeded(41);
      for (let row = 0; row < 3; row++) {
        for (const side of [-1, 1]) {
          const n = 6;
          for (let k = 0; k < n; k++) {
            const t = k / (n - 1);
            const x0 = side < 0 ? U.lerp(-34, -122, t) : U.lerp(40, 108, t);
            const y0 = 106 + Math.pow(t, 1.5) * 24 + row * 30;
            const ang = side * (0.25 + t * 0.5) + (rng() - 0.5) * 0.2;
            moyaFeather(c, x0 + (rng() - 0.5) * 6, y0, -ang, 46 + rng() * 14, 12 + rng() * 3);
          }
        }
      }
      // silver clasp & chain
      c.fillStyle = '#c8ccd8'; c.strokeStyle = '#4a4e5a'; c.lineWidth = 1.2;
      ell(c, -30, 118, 6, 6); c.fill(); c.stroke(); ell(c, 38, 116, 6, 6); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-24, 119); c.quadraticCurveTo(6, 132, 32, 117); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -114, hl: -84, wx: -30 });
      // swept back, with long sharp locks falling over the far side
      K.locks(c, [
        [[-40, -104, -76, -80, -80, -30], 26],
        [[-20, -110, -60, -100, -76, -60], 22],
        [[0, -108, 30, -100, 56, -70], 22],
        [[-10, -104, 20, -84, 44, -50, 50, -10], 18],
        [[0, -104, 30, -80, 58, -40, 64, 10], 20],
        [[-14, -102, 0, -76, 18, -46, 22, -20], 12],
      ], { p: 1.15, bulge: 0.25 });
      K.lock(c, [-58, -40, -70, -10, -62, 18], 12);
    },
    acc(c) {
      // single crow feather hair ornament
      moyaFeather(c, -48, -96, -2.5, 40, 9);
      c.fillStyle = '#c8ccd8'; c.strokeStyle = '#4a4e5a'; c.lineWidth = 1; ell(c, -48, -96, 3.4, 3.4); c.fill(); c.stroke();
    },
  });

  // ---------------- 藤婆 Tengpo
  define('tengpo', {
    face: 'old_f',
    faceOpt: { cheek: -2, browY: -19 },
    skin: Object.assign({}, SKIN.tan, { base: '#e8c4a2', mid: '#d6ac88', shade: '#b88a68', deep: '#94684a', line: '#74503a' }),
    eye: { iris: ['#1a2a14', '#46602e', '#94b064', '#d0e0a0'], lash: '#2a2018', lid: 0.66 },
    brow: { color: '#f0eee6', th: 1.2, bushy: true, arch: 0.8 },
    hair: { base: '#ecebe4', dark: '#a8aa9c', light: '#ffffff', line: '#7e8072', hi: '#ffffff' },
    mouths: { normal: 'smirk', smile: 'smirk', serious: 'flat', think: 'smirk' },
    expr(E, ex) { if (ex === 'normal') { E.lift = 0.18; E.brFar = -3; } },
    wrinkles(c, S) { S.wr(c, 3); },
    back(c, S) {
      const K = S.K;
      // wild white mane
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-20, -112);
        c.bezierCurveTo(-110, -110, -130, -20, -112, 60); c.bezierCurveTo(-104, 110, -120, 160, -116, 200);
        c.lineTo(86, 200); c.bezierCurveTo(90, 140, 96, 60, 90, 10);
        c.bezierCurveTo(110, -70, 60, -118, -20, -112); c.closePath();
      }, { y0: -110, y1: 200 });
      K.locks(c, [
        [[-60, -80, -120, -60, -134, 10], 34], [[-70, -40, -126, 20, -118, 90], 30], [[-76, 0, -110, 80, -124, 160], 30],
        [[60, -80, 110, -50, 112, 10], 28], [[66, -30, 104, 30, 96, 110], 26], [[30, -104, 70, -134, 104, -118], 20],
        [[-10, -110, -50, -140, -90, -128], 22],
      ], { p: 0.9, bulge: 0.4 });
    },
    body(c, S) {
      S.robe(c, { sw: 112, swf: 98, y: 120, col: '#55704a', colL: '#6e8a5e', colD: '#384c30', line: '#1c2818' });
      S.crossCollar(c, {
        L: [-22, 96], R: [26, 96], X: [6, 170],
        layers: [{ col: '#7c9460', line: '#2e3e24', w: 8 }, { col: '#3e5434', line: '#1c2818', w: 6 }, { col: '#c8c4a0', line: '#7c7a60', w: 5 }],
        skin: true,
      });
      // layered robe edges & moss texture
      c.strokeStyle = 'rgba(30,44,24,0.6)'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-108, 140); c.quadraticCurveTo(-80, 150, -60, 200); c.stroke();
      c.beginPath(); c.moveTo(-100, 130); c.quadraticCurveTo(-60, 140, -46, 200); c.stroke();
      const rng = U.seeded(77);
      for (let k = 0; k < 40; k++) {
        const x = -110 + rng() * 210, y = 120 + rng() * 80;
        c.fillStyle = rng() < 0.5 ? 'rgba(140,170,90,0.4)' : 'rgba(40,60,30,0.35)';
        ell(c, x, y, 2 + rng() * 3, 1.5 + rng() * 2, rng() * 3); c.fill();
      }
      // herb pouch cord
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(60, 110); c.quadraticCurveTo(30, 150, -10, 200); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -114 });
      // wild loose top-knot
      K.locks(c, [
        [[-10, -108, -30, -140, 0, -150], 30, { bulge: 0.7, p: 0.5 }],
        [[-6, -112, 20, -140, 36, -130], 14], [[-16, -112, -40, -140, -50, -126], 12],
      ]);
      K.locks(c, [
        [[-46, -88, -84, -60, -82, 0], 26], [[-30, -96, -56, -60, -50, -24], 22], [[-12, -100, -20, -66, -24, -34], 18],
        [[10, -100, 30, -70, 40, -34], 20], [[26, -96, 58, -66, 62, -20], 22], [[40, -86, 76, -60, 80, 0], 20],
        [[-60, -40, -84, 20, -70, 80], 20], [[62, -40, 80, 20, 76, 60], 16],
      ], { p: 0.9, bulge: 0.35, rootDark: 0.1 });
      for (const sp1 of [[-40, -100, -90, -120, -110, -96], [20, -106, 60, -130, 86, -112], [-60, -70, -104, -70, -112, -40], [60, -60, 96, -60, 104, -30]]) K.strand(c, sp1, 1.2, '#8a8c80', 0.8);
    },
    acc(c) {
      // vines & dried herbs tied in the hair
      c.save(); c.lineCap = 'round';
      c.strokeStyle = '#4e6a2a'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-30, -122); c.bezierCurveTo(-14, -132, 10, -130, 20, -118); c.stroke();
      c.beginPath(); c.moveTo(-76, -50); c.bezierCurveTo(-60, -82, -20, -100, 20, -100); c.bezierCurveTo(46, -98, 64, -80, 70, -58); c.stroke();
      c.strokeStyle = '#6e8a3a'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-76, -50); c.bezierCurveTo(-56, -76, -24, -94, 16, -96); c.stroke();
      const leaf = (x, y, a, l, col) => {
        c.save(); c.translate(x, y); c.rotate(a);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(l * 0.5, -l * 0.35, l, 0); c.quadraticCurveTo(l * 0.5, l * 0.35, 0, 0); c.closePath();
        c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(30,40,10,0.7)'; c.lineWidth = 0.9; c.stroke();
        c.beginPath(); c.moveTo(0, 0); c.lineTo(l * 0.8, 0); c.stroke();
        c.restore();
      };
      leaf(-60, -76, -2.2, 14, '#6e9a3a'); leaf(-40, -92, -1.9, 12, '#88aa44'); leaf(40, -98, -1.0, 13, '#6e9a3a'); leaf(64, -72, -0.6, 12, '#5a8432');
      leaf(-6, -132, -1.4, 12, '#9aa84a'); leaf(12, -128, -0.7, 11, '#7a9a3a');
      // dried herbs bundle (brown sprigs + tiny yellow flowers)
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.3;
      for (let k = 0; k < 5; k++) { c.beginPath(); c.moveTo(-20, -126); c.lineTo(-40 - k * 4, -150 - k * 3); c.stroke(); }
      c.fillStyle = '#e0c050';
      for (let k = 0; k < 5; k++) { ell(c, -40 - k * 4, -151 - k * 3, 2.2, 2.2); c.fill(); }
      c.fillStyle = '#b0503a'; ell(c, 24, -120, 3, 3); c.fill(); ell(c, 30, -116, 2.4, 2.4); c.fill();
      c.restore();
    },
    over(c, S) {
      // long pipe from the corner of the mouth
      const F = S.F, x0 = F.mouthX + 6, y0 = F.mouthY + 1;
      c.save(); c.lineCap = 'round';
      c.strokeStyle = '#3a2414'; c.lineWidth = 4.4;
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(x0 + 40, y0 + 30, x0 + 76, y0 + 64); c.stroke();
      c.strokeStyle = '#6a4424'; c.lineWidth = 2.4; c.stroke();
      c.fillStyle = '#c8b070'; c.fillRect(x0 - 2, y0 - 2, 5, 5);
      // bowl
      c.translate(x0 + 78, y0 + 62);
      c.beginPath(); c.moveTo(-7, -14); c.lineTo(7, -14); c.lineTo(6, 2); c.quadraticCurveTo(0, 7, -6, 2); c.closePath();
      c.fillStyle = '#5a3a20'; c.fill(); c.strokeStyle = '#24140a'; c.lineWidth = 1.3; c.stroke();
      ell(c, 0, -14, 7, 2.4); c.fillStyle = '#1a0e08'; c.fill(); c.stroke();
      ell(c, 0, -14.5, 4, 1.3); c.fillStyle = '#ff8a3a'; c.fill();
      c.restore();
    },
    live(c, t) {
      // pipe smoke
      const x0 = 18 + 6 + 78, y0 = 57 + 1 + 62 - 16;
      for (let k = 0; k < 5; k++) {
        const ph = (t * 0.25 + k / 5) % 1;
        const x = x0 + Math.sin(ph * 6 + k) * 6 + ph * 10, y = y0 - ph * 90;
        const r = 4 + ph * 12;
        c.fillStyle = `rgba(230,230,240,${0.28 * (1 - ph)})`;
        ell(c, x, y, r, r * 0.8); c.fill();
      }
    },
  });

  // ---------------- 夜念 Nian'er (ghost girl)
  define('nianer', {
    face: 'child',
    faceOpt: { blush: 0.08 },
    skin: SKIN.ghost,
    eye: { iris: ['#1c2a4a', '#4a6aa0', '#a8c8f0', '#e0f0ff'], lash: '#2a3a5a', droop: 0.1, lid: 0.82, white: '#f4faff' },
    brow: { color: '#3a4a6a' },
    hair: { base: '#3a4868', dark: '#1a2440', light: '#8aa0c8', line: '#121a30', hi: '#b8d0f0' },
    mouths: { normal: 'frown', smile: 'smile' },
    expr(E, ex) { if (ex === 'normal') { E.brIn = -3; E.brOut = 1; E.gy = 0.25; } },
    pose: { hx: 150, hy: 170, s: 0.92, bs: 0.82, by: 4 },
    ghost: { tint: '#9fd2ff', amt: 0.28, glow: 'rgba(150,210,255,0.9)', fade: 240 },
    alpha: 0.86,
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-20, -108); c.bezierCurveTo(-92, -100, -94, -10, -76, 40); c.lineTo(-50, 44); c.lineTo(58, 10);
        c.bezierCurveTo(84, -60, 50, -110, -20, -108); c.closePath();
      });
      // twin bun tails
      K.lock(c, [-56, -100, -90, -60, -90, 10, -98, 50], 16, { p: 0.6 });
      K.lock(c, [46, -104, 84, -64, 84, -4, 90, 34], 14, { p: 0.6 });
    },
    body(c, S) {
      S.robe(c, { sw: 104, swf: 92, y: 118, col: '#e8f0fa', colL: '#f8fbff', colD: '#b8c8e0', line: '#6a80a8' });
      S.crossCollar(c, {
        L: [-18, 94], R: [22, 94], X: [6, 150],
        layers: [{ col: '#c8d6ec', line: '#6a80a8', w: 7 }, { col: '#ffffff', line: '#8a9ac0', w: 4 }],
        skin: true,
      });
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -108 });
      // twin buns on top of the head
      for (const [x, y, r] of [[-44, -110, 19], [36, -114, 16]]) {
        ell(c, x, y, r, r * 0.9); c.fillStyle = S.hair.base; c.fill(); c.strokeStyle = S.hair.line; c.lineWidth = 1.3; c.stroke();
        c.save(); ell(c, x, y, r, r * 0.9); c.clip();
        c.strokeStyle = U.rgba(S.hair.line, 0.55); c.lineWidth = 1;
        for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + 2, y + 3, r * (1.1 - k * 0.2), r * (0.5 - k * 0.08), -0.5, 3.4, 6.2); c.stroke(); }
        c.fillStyle = U.rgba(S.hair.hi, 0.5); ell(c, x - r * 0.35, y - r * 0.4, r * 0.35, r * 0.15, -0.6); c.fill();
        c.restore();
      }
      K.locks(c, [
        [[-40, -84, -66, -50, -60, 0], 26], [[-24, -92, -38, -56, -38, -20], 26], [[-6, -96, -10, -56, -14, -18], 22],
        [[8, -96, 16, -56, 12, 0], 20], [[20, -92, 36, -56, 36, -18], 24], [[34, -86, 58, -52, 60, -8], 22],
      ], { p: 1, bulge: 0.35, rootDark: 0.1 });
      K.lock(c, [-56, -40, -68, 0, -60, 30], 14); K.lock(c, [58, -40, 66, 0, 60, 24], 12);
    },
    acc(c) {
      // pale ribbons on the buns
      c.fillStyle = '#f0f6ff'; c.strokeStyle = '#7a8ab0'; c.lineWidth = 1;
      for (const [x, y, a] of [[-30, -100, 0.7], [24, -104, -0.5]]) {
        ell(c, x - 4, y, 6, 3.4, a); c.fill(); c.stroke(); ell(c, x + 4, y + 1, 6, 3.4, -a); c.fill(); c.stroke();
      }
    },
    live(c, t) {
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.15 + k / 4) % 1;
        const x = (k % 2 ? 1 : -1) * (74 + U.hash(k, 9, 2) * 50) + Math.sin(t + k) * 8, y = 120 - ph * 220;
        const g = c.createRadialGradient(x, y, 0, x, y, 7);
        g.addColorStop(0, `rgba(200,235,255,${Math.sin(ph * Math.PI) * 0.7})`); g.addColorStop(1, 'rgba(160,210,255,0)');
        c.fillStyle = g; c.fillRect(x - 7, y - 7, 14, 14);
      }
    },
  });

  // ---------------- 阿炳伯 A-Bing (storyteller)
  define('abing', {
    face: 'old_m',
    faceOpt: { jaw: 1.08, cheek: 3, browY: -18 },
    skin: SKIN.old,
    eye: { iris: ['#24160e', '#5a3a20', '#a07040', '#d8b080'], lash: '#2a1a14', lid: 0.8 },
    brow: { color: '#8a8480', th: 1.1, bushy: true, arch: 1.2 },
    hair: { base: '#9c9a9c', dark: '#5e5c62', light: '#dcdad8', line: '#3e3c42', hi: '#eeeeee' },
    mouths: { normal: 'smile', serious: 'flat' },
    wrinkles(c, S) { S.wr(c, 2); },
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-50, -80); c.bezierCurveTo(-94, -70, -90, -10, -76, 30); c.lineTo(-54, 44); c.lineTo(-40, -60); c.closePath();
      });
    },
    body(c, S) {
      S.robe(c, { sw: 120, swf: 106, y: 118, col: '#4c5a6e', colL: '#627288', colD: '#323c4c', line: '#161c26' });
      // standing collar long gown + dark 馬褂 jacket with knot buttons
      c.fillStyle = '#4c5a6e'; c.strokeStyle = '#161c26'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-26, 84); c.quadraticCurveTo(2, 92, 30, 84); c.lineTo(32, 100); c.quadraticCurveTo(2, 108, -28, 100); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#2a2420'; c.strokeStyle = '#0c0806'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-112, 132); c.quadraticCurveTo(-90, 108, -40, 104); c.quadraticCurveTo(-10, 120, 0, 200); c.lineTo(-114, 200); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(100, 132); c.quadraticCurveTo(84, 110, 40, 104); c.quadraticCurveTo(14, 120, 6, 200); c.lineTo(104, 200); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#c8a050';
      for (let k = 0; k < 3; k++) { ell(c, 4, 132 + k * 22, 3, 3); c.fill(); c.strokeStyle = '#c8a050'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-6, 132 + k * 22); c.lineTo(14, 132 + k * 22); c.stroke(); }
    },
    neck(c, S) {
      const F = S.F;
      c.beginPath(); c.moveTo(-20, 40); c.lineTo(-22, 96); c.lineTo(26, 96); c.lineTo(24, 40); c.closePath();
      c.fillStyle = S.skin.mid; c.fill();
    },
    bodyAfter(c, S) {
      // folding fan, open, held up at the front
      c.save(); c.translate(70, 196); c.rotate(-0.25);
      const n = 12, r0 = 14, r1 = 92, a0 = -2.4, a1 = -1.1;
      c.beginPath(); c.arc(0, 0, r1, a0, a1); c.arc(0, 0, r0, a1, a0, true); c.closePath();
      const g = c.createRadialGradient(0, 0, r0, 0, 0, r1);
      g.addColorStop(0, '#efe4c8'); g.addColorStop(1, '#f8f0dc');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#6a5030'; c.lineWidth = 1.4; c.stroke();
      c.strokeStyle = 'rgba(110,80,40,0.5)'; c.lineWidth = 0.9;
      for (let k = 0; k <= n; k++) { const a = U.lerp(a0, a1, k / n); c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); c.stroke(); }
      // ink calligraphy strokes
      c.strokeStyle = '#2a2018'; c.lineWidth = 2.2; c.lineCap = 'round';
      for (const [a, rr, l] of [[-2.1, 60, 18], [-1.85, 66, 22], [-1.6, 58, 16], [-1.35, 64, 20]]) {
        c.beginPath(); c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); c.lineTo(Math.cos(a) * (rr + l), Math.sin(a) * (rr + l)); c.stroke();
      }
      c.fillStyle = '#c0282a'; c.fillRect(Math.cos(-1.25) * 40 - 3, Math.sin(-1.25) * 40 - 3, 6, 6);
      c.restore();
    },
    front(c, S) {
      const K = S.K;
      // bald crown with grey hair at the sides and back
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-62, 24); c.bezierCurveTo(-84, -10, -82, -50, -60, -70); c.quadraticCurveTo(-52, -40, -54, 24); c.closePath();
      });
      K.locks(c, [[[-62, -60, -80, -20, -66, 20], 16], [[60, -50, 68, -20, 62, 6], 10]], { p: 0.9 });
    },
    faceDraw2(c) { c.fillStyle = 'rgba(255,255,255,0.3)'; ell(c, -8, -78, 24, 10, -0.2); c.fill(); },
    facial(c, S) {
      const F = S.F, K = S.K;
      const H = { color: '#c8c6c4', rootCol: '#9a9898', tipCol: '#e8e6e4', line: '#6a686c' };
      // long thin moustache & goatee
      K.lock(c, [F.mouthX - 2, F.mouthY - 6, F.mouthX - 18, F.mouthY - 4, F.mouthX - 28, F.mouthY + 22], 6, Object.assign({ p: 1, strands: false }, H));
      K.lock(c, [F.mouthX + 2, F.mouthY - 6, F.mouthX + 14, F.mouthY - 4, F.mouthX + 18, F.mouthY + 18], 5, Object.assign({ p: 1, strands: false }, H));
      K.lock(c, [F.chinX - 2, F.chinY - 6, F.chinX - 4, F.chinY + 16, F.chinX + 2, F.chinY + 34], 12, Object.assign({ p: 0.9, strands: 2 }, H));
    },
    over(c, S) {
      // round glasses
      c.save();
      for (const near of [true, false]) {
        const fr = S.eyeFrame(S.F, S.sp, near);
        const rx = near ? 19 : 13, ry = 17;
        ell(c, fr.ex + (near ? 0 : 1), fr.ey + 1, rx, ry);
        c.fillStyle = 'rgba(200,230,255,0.12)'; c.fill();
        c.strokeStyle = '#3a2a1a'; c.lineWidth = 2.2; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.6;
        c.beginPath(); c.arc(fr.ex - rx * 0.2, fr.ey - 2, Math.min(rx, ry) * 0.7, 3.6, 4.4); c.stroke();
      }
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(10, -6, 24, 1); c.stroke();
      c.beginPath(); c.moveTo(-43, 0); c.lineTo(-62, -4); c.stroke();
      c.restore();
    },
  });

  // ---------------- 阿柑姨 A-Gan (芋圓 auntie)
  define('agan', {
    face: 'f',
    faceOpt: { round: 1.4, cheek: 6, chinY: 80, jaw: 1.08, eyeW: 34, eyeH: 26, lash: 2.6, browY: -20, mouthY: 54, blush: 0.4, neckW: 20 },
    skin: SKIN.warm,
    eye: { iris: ['#2a160c', '#6a3a1c', '#b07a40', '#e0b080'], lash: '#2a1810' },
    brow: { color: '#3a2620', th: 1.1 },
    hair: { base: '#2e2424', dark: '#140e0e', light: '#6a5a58', line: '#0c0808', hi: '#8a7a78' },
    mouths: { normal: 'bigsmile', smile: 'bigsmile', serious: 'flat' },
    expr(E, ex) { if (ex === 'normal' || ex === 'smile') { E.lift = 0.35; E.open = 0.85; E.brIn = -2; } },
    wrinkles(c, S) {
      const F = S.F;
      c.strokeStyle = U.rgba(S.skin.line, 0.4); c.lineWidth = 1.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(F.noseX - 16, F.noseY); c.quadraticCurveTo(F.mouthX - 22, F.mouthY - 4, F.mouthX - 17, F.mouthY + 6); c.stroke();
      c.beginPath(); c.moveTo(F.eyeX - 22, F.eyeY + 2); c.lineTo(F.eyeX - 27, F.eyeY - 1); c.moveTo(F.eyeX - 22, F.eyeY + 6); c.lineTo(F.eyeX - 27, F.eyeY + 7); c.stroke();
    },
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -100); c.bezierCurveTo(-94, -92, -96, -10, -80, 20); c.lineTo(58, 0); c.bezierCurveTo(82, -60, 50, -104, -30, -100); c.closePath();
      });
    },
    body(c, S) {
      S.robe(c, { sw: 128, swf: 112, y: 114, col: '#c8603a', colL: '#e0784e', colD: '#9a4222', line: '#4a1c0c' });
      S.crossCollar(c, {
        L: [-26, 94], R: [30, 94], X: [6, 160],
        layers: [{ col: '#7a3018', line: '#3a1408', w: 7 }, { col: '#f0e4cc', line: '#9a8c70', w: 5 }],
        skin: true,
      });
      // apron (bib) with straps
      c.fillStyle = '#ece6d8'; c.strokeStyle = '#8a8270'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-40, 146); c.quadraticCurveTo(6, 140, 50, 144); c.lineTo(58, 200); c.lineTo(-48, 200); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-40, 146); c.lineTo(-30, 100); c.lineTo(-24, 100); c.lineTo(-32, 146); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(50, 144); c.lineTo(40, 98); c.lineTo(46, 98); c.lineTo(56, 144); c.closePath(); c.fill(); c.stroke();
      // taro-ball stains & pocket
      c.fillStyle = 'rgba(150,110,170,0.35)'; ell(c, -18, 170, 4, 3); c.fill(); ell(c, 30, 182, 3, 2.5); c.fill();
      c.strokeStyle = '#a8a090'; c.strokeRect(-10, 172, 30, 20);
      // rolled sleeves hint
      c.strokeStyle = 'rgba(70,20,10,0.5)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-112, 150); c.quadraticCurveTo(-96, 160, -98, 200); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -106 });
      K.locks(c, [[[-40, -80, -66, -50, -60, -10], 18], [[54, -70, 64, -40, 60, -14], 12]], { p: 0.9 });
    },
    acc(c) {
      // floral headscarf wrapped over the hair, knotted at the nape
      c.save();
      const scarf = () => {
        c.beginPath();
        c.moveTo(-60, -34); c.bezierCurveTo(-60, -60, -30, -82, 6, -82); c.bezierCurveTo(44, -82, 64, -60, 68, -30);
        c.bezierCurveTo(80, -70, 60, -122, 0, -124); c.bezierCurveTo(-60, -126, -96, -86, -90, -30);
        c.bezierCurveTo(-88, -10, -80, 6, -72, 14); c.quadraticCurveTo(-64, -10, -60, -34); c.closePath();
      };
      scarf();
      const g = c.createLinearGradient(0, -124, 0, -20);
      g.addColorStop(0, '#3a72b8'); g.addColorStop(1, '#22508a');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#102848'; c.lineWidth = 1.5; c.stroke();
      c.save(); scarf(); c.clip();
      const rng = U.seeded(5);
      for (let k = 0; k < 26; k++) {
        const x = -96 + rng() * 170, y = -126 + rng() * 120;
        c.fillStyle = '#ffffff';
        for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; ell(c, x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.8, 1.8); c.fill(); }
        c.fillStyle = '#f0c040'; ell(c, x, y, 1.4, 1.4); c.fill();
      }
      // folds
      c.strokeStyle = 'rgba(10,30,60,0.45)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-70, -60); c.quadraticCurveTo(-30, -96, 30, -100); c.stroke();
      c.beginPath(); c.moveTo(-80, -30); c.quadraticCurveTo(-60, -60, -20, -70); c.stroke();
      c.restore();
      // folded front edge
      c.strokeStyle = '#6a9ad8'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-60, -34); c.bezierCurveTo(-60, -60, -30, -82, 6, -82); c.bezierCurveTo(44, -82, 64, -60, 68, -30); c.stroke();
      // knot & tails at the nape
      c.fillStyle = '#2e62a8'; c.strokeStyle = '#102848'; c.lineWidth = 1.3;
      ell(c, -84, 6, 9, 8); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-88, 10); c.quadraticCurveTo(-104, 30, -100, 46); c.lineTo(-90, 42); c.quadraticCurveTo(-90, 26, -82, 12); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-80, 12); c.quadraticCurveTo(-80, 34, -70, 44); c.lineTo(-64, 36); c.quadraticCurveTo(-72, 26, -76, 10); c.closePath(); c.fill(); c.stroke();
      c.restore();
    },
  });

  // ---------------- 小金 Xiao Jin (kid)
  define('xiaojin', {
    face: 'child',
    faceOpt: { lashStyle: 'm', lash: 2.4, eyeH: 36, blush: 0.32, browTh: 3.2, browY: -18 },
    skin: Object.assign({}, SKIN.warm, { base: '#f6d2b4' }),
    eye: { iris: ['#24140a', '#5e3818', '#b07a3a', '#f0c890'], lash: '#24160e' },
    brow: { color: '#2a1c18' },
    hair: { base: '#2c2420', dark: '#120c0a', light: '#6a5a50', line: '#0a0605', hi: '#8a7a6e' },
    gap: true,
    mouths: { normal: 'bigsmile', smile: 'bigsmile', smug: 'bigsmile' },
    pose: { hx: 150, hy: 172, s: 0.9, bs: 0.8, by: 2 },
    faceDraw2(c, S) {
      // plaster on the cheek + freckles
      c.save(); c.translate(-40, 34); c.rotate(-0.4);
      c.fillStyle = '#f0dcb4'; c.fillRect(-9, -4, 18, 8); c.strokeStyle = '#b09a70'; c.lineWidth = 1; c.strokeRect(-9, -4, 18, 8);
      c.beginPath(); c.moveTo(-3, -4); c.lineTo(-3, 4); c.moveTo(3, -4); c.lineTo(3, 4); c.stroke();
      c.restore();
      c.fillStyle = 'rgba(160,90,50,0.4)';
      for (const [x, y] of [[44, 26], [50, 30], [40, 30]]) { ell(c, x, y, 1.2, 1.2); c.fill(); }
    },
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104); c.bezierCurveTo(-94, -96, -94, -10, -74, 30); c.lineTo(58, 0); c.bezierCurveTo(82, -60, 50, -110, -30, -104); c.closePath();
      });
    },
    body(c, S) {
      S.robe(c, { sw: 108, swf: 94, y: 120, col: '#5a7aa0', colL: '#7090b4', colD: '#3e5878', line: '#1a2a3e' });
      S.crossCollar(c, {
        L: [-22, 94], R: [26, 94], X: [6, 160],
        layers: [{ col: '#e6dcc4', line: '#8a806a', w: 7 }],
        skin: true,
      });
      // patch
      c.fillStyle = '#b08a5a'; c.strokeStyle = '#4a3418'; c.lineWidth = 1;
      c.fillRect(56, 150, 18, 16); c.setLineDash([2, 2]); c.strokeRect(56, 150, 18, 16); c.setLineDash([]);
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -108 });
      // spiky short hair with a cowlick
      K.locks(c, [
        [[-46, -80, -76, -50, -72, -8], 24], [[-32, -90, -52, -60, -52, -24], 24], [[-16, -96, -24, -64, -30, -26], 22],
        [[0, -98, 6, -64, -2, -24], 22], [[14, -96, 30, -64, 28, -22], 22], [[28, -90, 52, -62, 56, -18], 22], [[42, -80, 68, -50, 68, -4], 18],
        [[-6, -104, 10, -130, 30, -126], 14, { p: 1 }], [[-10, -104, -26, -128, -40, -124], 12, { p: 1 }],
      ], { p: 1.1, bulge: 0.3, rootDark: 0.15 });
    },
  });

  // ---------------- 阿土伯 A-Tu (ghost miner)
  define('atu', {
    face: 'old_m',
    faceOpt: { cheek: 2 },
    skin: Object.assign({}, SKIN.old),
    eye: { iris: ['#1a2a2a', '#3a5a5a', '#80a8a8', '#c0e0e0'], lash: '#1a2424', lid: 0.75 },
    brow: { color: '#8a8a8a', th: 1.2, bushy: true },
    hair: { base: '#8a8a8e', dark: '#4e4e54', light: '#c8c8cc', line: '#2e2e34', hi: '#dddddd' },
    mouths: { normal: 'smile' },
    wrinkles(c, S) { S.wr(c, 2); },
    ghost: { tint: '#8fe0d0', amt: 0.32, glow: 'rgba(120,230,210,0.85)', fade: 250 },
    alpha: 0.84,
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-50, -70); c.bezierCurveTo(-90, -60, -90, -10, -76, 30); c.lineTo(-54, 40); c.lineTo(-40, -60); c.closePath();
      });
    },
    body(c, S) {
      S.robe(c, { sw: 120, swf: 104, y: 118, col: '#4a4038', colL: '#5e544a', colD: '#2e2620', line: '#14100c' });
      S.crossCollar(c, {
        L: [-24, 94], R: [28, 94], X: [6, 166],
        layers: [{ col: '#3a3028', line: '#14100c', w: 7 }, { col: '#8a8270', line: '#4a4234', w: 5 }],
        skin: true,
      });
      // towel around the neck
      c.fillStyle = '#e8e2d4'; c.strokeStyle = '#8a8272'; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-40, 96); c.quadraticCurveTo(2, 124, 46, 94); c.lineTo(52, 108); c.quadraticCurveTo(2, 142, -46, 110); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-46, 110); c.lineTo(-56, 170); c.lineTo(-38, 172); c.lineTo(-30, 118); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(80,120,160,0.5)'; c.beginPath(); c.moveTo(-54, 160); c.lineTo(-39, 162); c.stroke();
      // grime
      c.fillStyle = 'rgba(30,24,20,0.35)'; ell(c, 70, 160, 10, 6); c.fill(); ell(c, -90, 176, 8, 5); c.fill();
    },
    front(c, S) {
      S.K.locks(c, [[[-60, -40, -74, -10, -64, 20], 14], [[58, -40, 66, -14, 60, 8], 10]], { p: 0.9 });
    },
    acc(c) {
      // old rattan mining helmet with an oil lamp
      c.save();
      c.beginPath(); c.moveTo(-84, -40); c.bezierCurveTo(-86, -118, 74, -124, 76, -40); c.closePath();
      const g = c.createLinearGradient(0, -118, 0, -40);
      g.addColorStop(0, '#c8a868'); g.addColorStop(1, '#8a6a34');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#4a3410'; c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = 'rgba(80,56,20,0.45)'; c.lineWidth = 1;
      for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(-84 + k * 26, -42); c.quadraticCurveTo(-60 + k * 20, -110, -4 + k * 4, -112); c.stroke(); }
      // brim
      c.beginPath(); c.ellipse(-4, -40, 92, 12, 0.02, 0, TAU);
      c.fillStyle = '#9a7840'; c.fill(); c.strokeStyle = '#4a3410'; c.lineWidth = 1.5; c.stroke();
      // lamp
      c.fillStyle = '#6a5a4a'; c.fillRect(-2, -86, 18, 24); c.strokeStyle = '#2a2016'; c.strokeRect(-2, -86, 18, 24);
      const lg = c.createRadialGradient(7, -74, 1, 7, -74, 14);
      lg.addColorStop(0, '#fff8d0'); lg.addColorStop(0.4, '#ffd060'); lg.addColorStop(1, 'rgba(255,180,60,0)');
      c.fillStyle = lg; ell(c, 7, -74, 14, 14); c.fill();
      c.restore();
    },
    facial(c, S) {
      const F = S.F;
      c.fillStyle = '#9a9a9e'; c.strokeStyle = '#4e4e54'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(F.mouthX - 18, F.mouthY + 2); c.quadraticCurveTo(F.mouthX - 8, F.mouthY - 12, F.mouthX + 2, F.mouthY - 7);
      c.quadraticCurveTo(F.mouthX + 12, F.mouthY - 12, F.mouthX + 16, F.mouthY + 1); c.quadraticCurveTo(F.mouthX + 2, F.mouthY - 3, F.mouthX - 18, F.mouthY + 2); c.fill(); c.stroke();
      // soot
      c.fillStyle = 'rgba(40,40,50,0.25)'; ell(c, -36, 36, 8, 4); c.fill();
    },
  });

  // ---------------- 阿蓮 A-Lian (young widow)
  define('alian', {
    face: 'f',
    faceOpt: { chinY: 79, eyeH: 33, blush: 0.1 },
    skin: SKIN.fair,
    eye: { iris: ['#20140e', '#5a3a26', '#a07a58', '#d8c0a0'], lash: '#22161a', droop: 0.1, lid: 0.9 },
    brow: { color: '#3a2a2a', th: 0.9 },
    hair: { base: '#2a2228', dark: '#100c10', light: '#625662', line: '#080608', hi: '#8a7e8a' },
    mouths: { normal: 'flat' },
    expr(E, ex) { if (ex === 'normal') { E.brIn = -3; E.brOut = 1; } },
    back(c, S) {
      S.K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104); c.bezierCurveTo(-94, -96, -94, -10, -78, 24); c.lineTo(58, 0); c.bezierCurveTo(82, -60, 50, -108, -30, -104); c.closePath();
      });
      // low bun
      ell(c, -78, -6, 24, 22); c.fillStyle = S.hair.base; c.fill(); c.strokeStyle = S.hair.line; c.lineWidth = 1.3; c.stroke();
      c.strokeStyle = U.rgba(S.hair.light, 0.5);
      for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(-78, -6, 8 + k * 5, 3.8, 5.6); c.stroke(); }
    },
    body(c, S) {
      S.robe(c, { sw: 104, swf: 92, y: 120, col: '#8c96a4', colL: '#a4aebb', colD: '#646e7c', line: '#2c3440' });
      S.crossCollar(c, {
        L: [-18, 94], R: [22, 94], X: [6, 152],
        layers: [{ col: '#e8e6e0', line: '#8a8880', w: 6 }, { col: '#f6f4f0', line: '#9a9890', w: 4 }],
        skin: true,
      });
      c.strokeStyle = 'rgba(40,50,60,0.4)'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-92, 140); c.quadraticCurveTo(-80, 170, -86, 200); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -108 });
      // neat centre parting, hair swept back
      K.locks(c, [
        [[-4, -98, -44, -90, -66, -40], 30], [[-6, -98, -58, -70, -68, -10], 18],
        [[6, -98, 40, -92, 62, -44], 26], [[8, -98, 56, -74, 64, -18], 16],
      ], { p: 0.7, bulge: 0.2, rootDark: 0.1 });
      K.strand(c, [-30, -84, -52, -40, -50, 10], 1.1, '#100c10', 0.8);
      K.lock(c, [-56, -30, -66, 10, -58, 40], 10);
    },
    acc(c) {
      // white mourning flower & plain wooden pin
      c.save();
      c.strokeStyle = '#7a5a3a'; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(-96, -20); c.lineTo(-58, 4); c.stroke();
      c.translate(-70, -38);
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU;
        ell(c, Math.cos(a) * 5, Math.sin(a) * 5, 5, 3.2, a); c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = '#a8a8b0'; c.lineWidth = 0.8; c.stroke();
      }
      ell(c, 0, 0, 2.6, 2.6); c.fillStyle = '#e8e4d0'; c.fill();
      c.restore();
    },
  });

  // ---------------- 林投姐 Linto (ghost woman)
  define('linto', {
    face: 'f',
    faceOpt: { chinY: 80, eyeH: 33, blush: 0 },
    skin: Object.assign({}, SKIN.pale, { base: '#eef0ee', mid: '#d6dcda', shade: '#b0bcbc', deep: '#8a9a9c', line: '#6a7a80', lip: '#8a6070' }),
    eye: { iris: ['#1a0408', '#4a1018', '#8a2a34', '#c06070'], lash: '#0e0a0c', droop: 0.14, lid: 0.86, white: '#f4f6f4', pupilSize: 0.7 },
    brow: { color: '#141014', th: 0.9 },
    hair: { base: '#16141a', dark: '#040306', light: '#3a3a4a', line: '#000000', hi: '#5a5e74' },
    mouths: { normal: 'frown', smile: 'flat' },
    expr(E, ex) { E.brIn -= 2; E.brOut += 1; },
    ghost: { tint: '#b8e8d8', amt: 0.18, glow: 'rgba(170,240,220,0.7)', fade: 260 },
    alpha: 0.92,
    wrinkles(c, S) {
      const F = S.F;
      // dark circles
      for (const [x, w] of [[F.eyeX, 18], [F.farX, 12]]) {
        const g = c.createRadialGradient(x, F.eyeY + 16, 1, x, F.eyeY + 16, w);
        g.addColorStop(0, 'rgba(90,70,110,0.35)'); g.addColorStop(1, 'rgba(90,70,110,0)');
        c.fillStyle = g; ell(c, x, F.eyeY + 16, w, w * 0.5); c.fill();
      }
    },
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -104); c.bezierCurveTo(-100, -96, -106, 0, -100, 80); c.bezierCurveTo(-96, 130, -106, 170, -110, 200);
        c.lineTo(84, 200); c.bezierCurveTo(88, 130, 80, 60, 74, 20); c.bezierCurveTo(88, -60, 50, -110, -30, -104); c.closePath();
      }, { y0: -100, y1: 200 });
      K.lock(c, [-70, -30, -112, 40, -96, 120, -116, 200], 36, { p: 0.3 });
      K.lock(c, [60, -30, 90, 40, 76, 120, 92, 200], 30, { p: 0.3 });
    },
    body(c, S) {
      S.robe(c, { sw: 104, swf: 92, y: 120, col: '#dfe4e2', colL: '#f0f4f2', colD: '#a8b4b2', line: '#5a6a6a' });
      S.crossCollar(c, {
        L: [-18, 94], R: [22, 94], X: [6, 156],
        layers: [{ col: '#c4ccca', line: '#5a6a6a', w: 6 }, { col: '#f4f6f4', line: '#8a9898', w: 4 }],
        skin: true,
      });
      // tattered hem/water stains
      c.fillStyle = 'rgba(80,110,110,0.25)'; ell(c, -70, 170, 20, 10); c.fill(); ell(c, 60, 186, 16, 8); c.fill();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -110 });
      // long straight curtain of hair, one side partly over the far cheek
      K.locks(c, [
        [[-10, -98, -50, -84, -68, -20], 30], [[-14, -96, -62, -60, -70, 30], 20],
        [[-2, -98, -18, -64, -28, -24], 16],
        [[8, -98, 40, -80, 58, -20], 28], [[14, -96, 62, -50, 66, 40], 24],
      ], { p: 0.8, bulge: 0.2, rootDark: 0.1 });
      K.lock(c, [-62, -40, -84, 40, -68, 120, -82, 180], 24, { p: 0.4, strands: 3 });
      K.lock(c, [58, -40, 72, 40, 62, 120, 72, 180], 22, { p: 0.4, strands: 3 });
      K.lock(c, [50, -60, 66, 0, 54, 50, 60, 100], 14, { p: 0.6 });
      for (const sp1 of [[-40, -90, -60, -40, -54, 20], [30, -90, 56, -40, 50, 30], [10, -96, 26, -40, 18, 10]]) K.strand(c, sp1, 1, '#000', 0.8);
    },
    live(c, t) {
      // dripping water
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.5 + k / 3) % 1;
        const x = [-66, 64, -84][k], y = [130, 140, 186][k] + ph * 30;
        c.fillStyle = `rgba(200,240,255,${0.7 * (1 - ph)})`;
        ell(c, x, y, 1.8, 3); c.fill();
      }
    },
  });

  // ---------------- 燈母 Lantern Mother
  define('lantern_mother', {
    face: 'f',
    faceOpt: { chinY: 80, eyeW: 40, eyeH: 34, blush: 0.15 },
    skin: Object.assign({}, SKIN.fair, { base: '#fff4e4', mid: '#fbe2c8', shade: '#f0c8a0', deep: '#d8a070', line: '#c0885a', blush: '#ffb080' }),
    eye: { iris: ['#8a5410', '#e0a020', '#fff0a0', '#ffffff'], lash: '#8a5a2a', lid: 0.5, white: '#fffaf0' },
    brow: { color: '#c89850', th: 0.9, halo: false },
    hair: { base: '#fff0c8', dark: '#e2b064', light: '#ffffff', line: '#c08a40', hi: '#ffffff' },
    mouths: { normal: 'smile', serious: 'neutral', angry: 'flat', laugh: 'smile', cry: 'frown', hurt: 'frown' },
    expr(E, ex) { if (ex === 'normal') { E.lift = 0.15; } if (ex === 'surprise') E.open = 0.9; E.vein = 0; E.sweat = 0; },
    rimCol: '#ffffff',
    aura(c, S) {
      const g = c.createRadialGradient(0, -20, 10, 0, -10, 148);
      g.addColorStop(0, 'rgba(255,240,180,0.85)'); g.addColorStop(0.45, 'rgba(255,200,100,0.32)'); g.addColorStop(1, 'rgba(255,180,80,0)');
      c.fillStyle = g; c.fillRect(-170, -190, 340, 400);
      // halo with rays
      c.save(); c.translate(-6, -40);
      c.strokeStyle = 'rgba(255,230,150,0.9)'; c.lineWidth = 2.5; c.beginPath(); c.arc(0, 0, 116, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,240,190,0.6)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 124, 0, TAU); c.stroke();
      for (let k = 0; k < 36; k++) {
        const a = k / 36 * TAU, l = k % 2 ? 14 : 26;
        c.strokeStyle = `rgba(255,225,140,${k % 2 ? 0.5 : 0.8})`; c.lineWidth = k % 2 ? 1 : 2;
        c.beginPath(); c.moveTo(Math.cos(a) * 128, Math.sin(a) * 128); c.lineTo(Math.cos(a) * (128 + l), Math.sin(a) * (128 + l)); c.stroke();
      }
      c.restore();
    },
    back(c, S) {
      const K = S.K;
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-30, -108); c.bezierCurveTo(-110, -100, -120, 0, -112, 80); c.bezierCurveTo(-108, 130, -120, 170, -126, 200);
        c.lineTo(96, 200); c.bezierCurveTo(100, 130, 92, 60, 84, 20); c.bezierCurveTo(100, -60, 50, -112, -30, -108); c.closePath();
      }, { y0: -100, y1: 200, top: S.hair.base, bot: S.hair.dark });
      K.locks(c, [
        [[-70, -40, -120, 30, -100, 120, -128, 200], 36], [[-60, -10, -96, 70, -84, 140, -104, 200], 24],
        [[60, -40, 100, 30, 84, 120, 100, 200], 30],
      ], { p: 0.35 });
    },
    body(c, S) {
      S.robe(c, { sw: 110, swf: 96, y: 120, col: '#fbf4e4', colL: '#ffffff', colD: '#e6d0a8', line: '#b08a50' });
      S.crossCollar(c, {
        L: [-20, 94], R: [24, 94], X: [6, 150],
        layers: [{ col: '#e8c060', line: '#9a7020', w: 7 }, { col: '#fffaf0', line: '#c0a070', w: 5 }],
        skin: true,
      });
      // 瓔珞 necklace
      c.strokeStyle = '#d8a83a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-34, 104); c.quadraticCurveTo(2, 150, 40, 102); c.stroke();
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, x = U.lerp(-30, 36, t), y = 104 + Math.sin(t * Math.PI) * 40;
        c.fillStyle = k % 2 ? '#ff8a5a' : '#f0d070'; ell(c, x, y + 4, 2.6, 3.2); c.fill();
      }
      c.fillStyle = '#ffe080'; ell(c, 4, 152, 6, 8); c.fill(); c.strokeStyle = '#a07020'; c.lineWidth = 1.2; c.stroke();
      // flowing gold-trimmed shawl
      c.strokeStyle = 'rgba(230,180,80,0.8)'; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(-108, 136); c.quadraticCurveTo(-60, 120, -40, 110); c.stroke();
      c.beginPath(); c.moveTo(92, 136); c.quadraticCurveTo(70, 120, 50, 110); c.stroke();
    },
    front(c, S) {
      const K = S.K;
      K.cap(c, { top: -112 });
      K.locks(c, [
        [[-6, -98, -44, -86, -62, -26], 28], [[-12, -96, -60, -64, -70, 4], 20], [[-2, -98, -18, -62, -28, -26], 16],
        [[6, -98, 36, -80, 52, -26], 24], [[12, -96, 56, -66, 66, -2], 20],
      ], { p: 0.9, bulge: 0.3, rootDark: 0.05, tipLight: 0.4 });
      K.lock(c, [-60, -30, -82, 40, -64, 110, -80, 170], 24, { p: 0.5, strands: 3, tipLight: 0.5 });
      K.lock(c, [60, -30, 76, 40, 66, 110, 76, 160], 18, { p: 0.5, tipLight: 0.5 });
    },
    acc(c) {
      // golden crown with a flame jewel
      c.save();
      const g = c.createLinearGradient(0, -140, 0, -100);
      g.addColorStop(0, '#fff2a0'); g.addColorStop(1, '#d09a30');
      c.fillStyle = g; c.strokeStyle = '#8a5a10'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-50, -98); c.quadraticCurveTo(-10, -112, 40, -100);
      c.lineTo(36, -110); c.lineTo(24, -118); c.lineTo(16, -132); c.lineTo(6, -120); c.lineTo(-4, -146); c.lineTo(-14, -120); c.lineTo(-24, -132); c.lineTo(-32, -118); c.lineTo(-44, -110); c.closePath();
      c.fill(); c.stroke();
      const fg = c.createRadialGradient(-4, -116, 1, -4, -116, 10);
      fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.5, '#ffd060'); fg.addColorStop(1, '#ff7a30');
      c.fillStyle = fg; c.beginPath(); c.moveTo(-4, -128); c.quadraticCurveTo(4, -116, -4, -106); c.quadraticCurveTo(-12, -116, -4, -128); c.fill();
      c.restore();
    },
    over(c) {
      // face half-hidden in light
      const g = c.createRadialGradient(62, -40, 4, 54, -24, 92);
      g.addColorStop(0, 'rgba(255,255,245,0.98)'); g.addColorStop(0.35, 'rgba(255,248,215,0.8)'); g.addColorStop(0.7, 'rgba(255,225,150,0.25)'); g.addColorStop(1, 'rgba(255,210,120,0)');
      c.fillStyle = g; c.fillRect(-60, -140, 220, 200);
    },
    live(c, t) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const p = 0.5 + 0.5 * Math.sin(t * 1.3);
      const g = c.createRadialGradient(60, -40, 2, 60, -40, 60 + p * 10);
      g.addColorStop(0, `rgba(255,240,200,${0.18 + p * 0.1})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = g; c.fillRect(-20, -120, 160, 160);
      for (let k = 0; k < 8; k++) {
        const ph = (t * 0.1 + k / 8) % 1;
        const x = (k % 2 ? 1 : -1) * (78 + U.hash(k, 4, 8) * 60) + Math.sin(t * 0.7 + k) * 8, y = 160 - ph * 300;
        const gg = c.createRadialGradient(x, y, 0, x, y, 6);
        gg.addColorStop(0, `rgba(255,230,160,${Math.sin(ph * Math.PI) * 0.8})`); gg.addColorStop(1, 'rgba(255,200,100,0)');
        c.fillStyle = gg; c.fillRect(x - 6, y - 6, 12, 12);
      }
      c.restore();
    },
  });

})();

// ---------------------------------------------------------------- baked image portraits
// Characters whose final art is baked from the design sheets (G.PortraitImages[id] = { expr: dataURL, expr_blink: … },
// e.g. js/gfx/portraits_baizhi.js) are drawn from images: same box fitting / flip / dim / alpha contract, with blinking.
(function () {
  const vec = G.Portraits.draw;
  const imgs = {};
  function img(id, key) {
    const set = G.PortraitImages && G.PortraitImages[id];
    if (!set || !set[key]) return null;
    const k = id + '|' + key;
    if (!imgs[k]) { imgs[k] = new Image(); imgs[k].src = set[key]; }
    return imgs[k].complete && imgs[k].naturalWidth ? imgs[k] : null;
  }
  G.Portraits.draw = function (ctx, id, expr, x, y, w, h, t, o = {}) {
    const set = G.PortraitImages && G.PortraitImages[id];
    if (!set) return vec.apply(this, arguments);
    let e = expr && set[expr] ? expr : 'normal';
    // blink: ~0.13 s every 3.2–5 s (per-character phase)
    const per = 4.1, ph = ((t || 0) + 1.7) % per;
    const blink = ph < 0.13 && set[e + '_blink'];
    const im = img(id, blink ? e + '_blink' : e) || img(id, e);
    if (!im) { img(id, 'normal'); return; } // decoding — draw nothing for a frame
    const sc = Math.min(w / 300, h / 340);
    const dw = 300 * sc, dh = 340 * sc;
    const breathe = 1 + Math.sin((t || 0) * 1.6) * 0.004;
    ctx.save();
    ctx.globalAlpha *= o.alpha != null ? o.alpha : 1;
    if (o.dim) ctx.filter = 'brightness(0.55) saturate(0.7)';
    ctx.translate(x + w / 2, y + h);
    if (o.flip) ctx.scale(-1, 1);
    ctx.scale(1, breathe);
    ctx.drawImage(im, -dw / 2, -dh, dw, dh);
    ctx.restore();
  };
  // pre-decode
  G.Portraits.preloadImages = function () { for (const id in (G.PortraitImages || {})) for (const k in G.PortraitImages[id]) img(id, k); };
  if (G.PortraitImages) setTimeout(G.Portraits.preloadImages, 0);
})();

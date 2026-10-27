// 彼岸燈 — design pass v2 — 沈星河 options 01–05 (+ shared garment helpers XD)
// Figure space: origin = ground between the feet, 1 unit = 1 css px at full-body scale, figure 420 px tall, y up = negative.
'use strict';
(function (global) {
  const XL = global.XL;
  const XD = global.XD = {};
  global.XINGHE_DESIGNS = global.XINGHE_DESIGNS || [];

  // ------------------------------------------------------------ shared garment helpers
  // head: draws back-hair fn, face, then front-hair fn, in head-unit space at (x, top)
  XD.head = (ctx, x, top, hu, F, backHair, frontHair, o = {}) => {
    XL.withT(ctx, x, top + hu, o.tilt || 0, hu, hu, (c) => {
      c.translate(0, -1);
      if (backHair) backHair(c);
      XL.face(c, F);
      if (frontHair) frontHair(c);
    });
  };
  XD.neck = (ctx, x, chinY, shY, w, skin, hu) => {
    const p = XL.curve([[x - w * 0.5, chinY - hu * 0.2, 'c'], [x + w * 0.5, chinY - hu * 0.2, 'c'], [x + w * 0.52, shY - hu * 0.05], [x + w * 0.9, shY + hu * 0.12, 'c'], [x - w * 0.9, shY + hu * 0.12, 'c'], [x - w * 0.52, shY - hu * 0.05]]);
    const jaw = XL.curve([[x - w, chinY - hu * 0.3], [x + w, chinY - hu * 0.3], [x + w, chinY - hu * 0.02], [x, chinY + hu * 0.1], [x - w, chinY - hu * 0.02]]);
    XL.paint(ctx, p, skin, { shCol: XL.skinShadow(skin), shadows: [jaw], sh: [2.5, 0], lw: 1.5, line: XL.ink(skin, 0.45) });
  };
  // arm sleeve segment: ribbon along points with widths, cuff band at the end
  XD.sleeve = (ctx, pts, ws, col, o = {}) => {
    const p = XL.ribbon(pts, ws, { round: o.round });
    XL.paint(ctx, p, col, Object.assign({ rim: o.rim, rimW: 1.6 }, o.paint || {}));
    return p;
  };
  XD.limb = (ctx, pts, ws, skin, o = {}) => {
    const p = XL.ribbon(pts, ws, { roundEnd: true });
    XL.paint(ctx, p, skin, { shCol: XL.skinShadow(skin), rim: o.rim, lw: 1.5, line: XL.ink(skin, 0.45) });
    return p;
  };
  // fold lines inside a garment
  XD.folds = (ctx, list, col, w = 1.1) => list.forEach((f) => XL.taper(ctx, f, w, col));
  // a round paper lantern hanging from (x, y) (top of the hanger), body radius r
  XD.lantern = (ctx, x, y, r, o = {}) => {
    const paper = o.paper || '#c8432b', rib = o.rib || '#c9a25e', hang = o.hang || r * 0.55;
    const cy = y + hang + r * 0.95;
    const ry = r * (o.tall || 0.95), rx = r;
    if (o.glow) XL.glow(ctx, x, cy, r * 2.6, o.glow, 0.55);
    // hanger cord
    XL.line(ctx, [[x, y], [x, y + hang]], '#3a2a22', 1.2);
    const cap = (yy, w) => XL.paint(ctx, XL.curve([[x - w, yy - r * 0.07, 'c'], [x + w, yy - r * 0.07, 'c'], [x + w, yy + r * 0.07, 'c'], [x - w, yy + r * 0.07, 'c']]), o.capCol || '#2a2228', { lw: 1.1, hl: false });
    const body = XL.ell(x, cy, rx, ry);
    const papered = o.papered || 'full';
    if (papered !== 'none') {
      ctx.save();
      if (papered === 'half') { ctx.beginPath(); ctx.rect(x - r * 1.2, cy - r * 0.08, r * 2.4, r * 1.3); ctx.clip(); }
      XL.paint(ctx, body, paper, {
        sh: [r * 0.22, r * 0.05], rim: o.rim, rimW: 1.4, lw: 1.5,
        after: (c) => {
          // inner glow / paper translucency
          if (o.lit) { const g = c.createRadialGradient(x - r * 0.15, cy, 0, x, cy, r * 1.05); g.addColorStop(0, XL.rgba('#fff2b8', 0.85)); g.addColorStop(0.55, XL.rgba(XL.light(paper, 0.35), 0.45)); g.addColorStop(1, XL.rgba(paper, 0)); c.fillStyle = g; c.fill(body); }
          for (let i = -3; i <= 3; i++) { const k = i / 3.6; XL.line(c, [[x + rx * k * 0.98, cy - ry], [x + rx * k * 1.04, cy], [x + rx * k * 0.98, cy + ry]], XL.rgba(XL.shadow(paper, 0.35), 0.55), 0.8); }
          for (let j = -2; j <= 2; j++) XL.line(c, [[x - rx, cy + ry * j * 0.4], [x, cy + ry * j * 0.4 + r * 0.06], [x + rx, cy + ry * j * 0.4]], XL.rgba(XL.shadow(paper, 0.3), 0.35), 0.6);
          if (o.char) { c.save(); c.fillStyle = o.charCol || '#1d1416'; c.font = `bold ${r * 0.9}px "WenQuanYi Zen Hei"`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.char, x - r * 0.04, cy + r * 0.05); c.restore(); }
        },
      });
      ctx.restore();
    }
    if (papered !== 'full') {
      // bare bamboo ribs on the uncovered part
      ctx.save(); ctx.beginPath(); ctx.rect(x - r * 1.2, cy - r * 1.3, r * 2.4, papered === 'half' ? r * 1.22 : r * 2.6); ctx.clip();
      for (let i = -3; i <= 3; i++) { const k = i / 3.4; ctx.save(); ctx.strokeStyle = XL.ink(rib); ctx.lineWidth = XL.lw(ctx, 2.6); ctx.beginPath(); ctx.ellipse(x, cy, Math.abs(rx * k) + 0.01, ry, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = rib; ctx.lineWidth = XL.lw(ctx, 1.3); ctx.stroke(); ctx.restore(); }
      ctx.restore();
      ctx.save(); ctx.strokeStyle = XL.ink(rib); ctx.lineWidth = XL.lw(ctx, 2.4); ctx.beginPath(); ctx.ellipse(x, cy - r * 0.02, rx, r * 0.12, 0, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = rib; ctx.lineWidth = XL.lw(ctx, 1.2); ctx.stroke(); ctx.restore();
    }
    cap(cy - ry, r * 0.42); cap(cy + ry, r * 0.42);
    if (o.tassel) { XL.paint(ctx, XL.lock(x, cy + ry + r * 0.06, x + r * 0.05, cy + ry + r * 0.75, r * 0.22, 0, { mid: 1, tipW: 2 }), o.tassel, { lw: 1 }); }
    return cy;
  };
  // jian (straight sword) — hilt only or full, along a direction; (x,y) = guard centre, ang = direction of blade
  XD.swordHilt = (ctx, x, y, ang, s, o = {}) => {
    XL.withT(ctx, x, y, ang, 1, 1, (c) => {
      // grip extends to -y (local), blade to +y
      const grip = XL.ribbon([[0, 0], [0, -s * 0.9]], [s * 0.16, s * 0.15]);
      XL.paint(c, grip, o.grip || '#3a2a2a', { lw: 1.2 });
      for (let i = 1; i < 6; i++) XL.line(c, [[-s * 0.08, -s * 0.15 * i], [s * 0.08, -s * 0.15 * i + s * 0.05]], XL.light(o.grip || '#3a2a2a', 0.3), 0.8);
      XL.paint(c, XL.curve([[-s * 0.28, -s * 0.02], [-s * 0.16, -s * 0.12], [0, -s * 0.07], [s * 0.16, -s * 0.12], [s * 0.28, -s * 0.02], [s * 0.16, s * 0.08], [0, s * 0.04], [-s * 0.16, s * 0.08]]), o.guard || '#b8893a', { lw: 1.2 });
      XL.paint(c, XL.ell(0, -s * 0.96, s * 0.12, s * 0.1), o.guard || '#b8893a', { lw: 1.1 });
      if (o.tassel) { XL.line(c, [[0, -s * 1.04], [s * 0.05, -s * 1.2]], o.tassel, 1); XL.paint(c, XL.lock(s * 0.05, -s * 1.18, s * 0.12, -s * 1.7, s * 0.14, s * 0.04, { mid: 1, tipW: 1.6 }), o.tassel, { lw: 0.9 }); }
    });
  };
  // anime/toon hair shine: a band with a jagged lower edge, following the skull curve (unit head space)
  XD.shine = (c, y, x0, x1, col, o = {}) => {
    const n = o.n || 4, th = o.th || 0.024, curve = o.curve === undefined ? 0.07 : o.curve, len = o.len || 0.82;
    for (let i = 0; i < n; i++) {
      const t0 = (i + (1 - len) / 2) / n, t1 = (i + 1 - (1 - len) / 2) / n, pts = [];
      for (let k = 0; k <= 4; k++) { const t = t0 + (t1 - t0) * k / 4; pts.push([x0 + (x1 - x0) * t, y + curve * Math.pow(2 * t - 1, 2) + (k === 2 ? (o.dip || 0.005) : 0)]); }
      XL.taper(c, pts, (th * 100) * (0.75 + 0.25 * Math.sin(i * 2.1 + 1)), col);
    }
  };
  XD.motifs = {
    lanterns: (ctx, w, h, col) => {
      ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = col; ctx.fillStyle = col;
      for (let i = 0; i < 9; i++) { const x = 30 + i * 55, y = 26 + (i % 2) * 8; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.ellipse(x, y + 11, 9, 11, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    },
    stairs: (ctx, w, h, col) => {
      ctx.save(); ctx.globalAlpha = 0.14; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      for (let i = 0; i < 12; i++) { const y = h - 40 - i * 24, x = w - 150 + i * 6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(w, y); ctx.lineTo(w, y + 24); ctx.stroke(); }
      for (let i = 0; i < 4; i++) { const x = w - 70 - i * 28, y = 180 - i * 30; ctx.strokeRect(x, y, 26, 40); ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 13, y - 12); ctx.lineTo(x + 31, y); ctx.stroke(); }
      ctx.restore();
    },
    waves: (ctx, w, h, col) => {
      ctx.save(); ctx.globalAlpha = 0.16; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      for (let r = 0; r < 5; r++) { ctx.beginPath(); for (let x = 0; x <= w; x += 4) { const y = h - 30 - r * 16 + Math.sin(x / 22 + r) * 4; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
      ctx.restore();
    },
    rain: (ctx, w, h, col) => {
      ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = col; ctx.lineWidth = 1;
      let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 110; i++) { const x = rnd() * w, y = rnd() * h, l = 10 + rnd() * 16; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.18, y + l); ctx.stroke(); }
      ctx.restore();
    },
    fireflies: (ctx, w, h, col) => {
      let s = 3; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
      for (let i = 0; i < 26; i++) XL.glow(ctx, rnd() * w, rnd() * h * 0.85, 4 + rnd() * 6, col, 0.6);
    },
    clouds: (ctx, w, h, col) => {
      ctx.save(); ctx.globalAlpha = 0.13; ctx.strokeStyle = col; ctx.lineWidth = 1.4;
      [[70, 120], [400, 90], [380, 300], [60, 330]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 14, Math.PI, 0); ctx.arc(x + 22, y, 10, Math.PI, 0); ctx.arc(x + 9, y + 2, 16, 0, Math.PI); ctx.stroke(); });
      ctx.restore();
    },
  };

  // ================================================================== 01 薙髮學徒
  (function () {
    const B = XL.body({ heads: 6.6, sh: 0.92, waist: 0.6, hip: 0.66, stance: 0.4 });
    const hu = B.hu;
    const C = { skin: '#e8b38b', indigo: '#34486e', guard: '#ebe4d3', apron: '#d5c5a3', trou: '#2f2d36', hair: '#1d191e', red: '#c8432b', paper: '#c8432b', bamboo: '#c9a25e', wrap: '#5a7aa3', straw: '#c9ad6e' };
    const rim = null;
    const F = {
      skin: C.skin, temple: 0.355, cheek: 0.385, jaw: 0.315, jawY: 0.79, chin: 0.125, chinY: 1.0, earS: 1.18, earY: 0.49,
      hairCol: C.hair, rim,
      eye: { x: 0.172, y: 0.59, w: 0.088, h: 0.062, iris: '#8a5426', ir: 0.056, tilt: 0.006, up: 1, lo: 0.72, lashW: 2.1, peak: 0.05, look: 0.05, creaseUp: 0.004 },
      brow: { x0: 0.065, y0: 0.468, x1: 0.265, y1: 0.452, th: 0.036, arch: 0.016 },
      nose: { type: 'broad', y: 0.735, w: 0.056 },
      mouth: { type: 'grin', y: 0.85, w: 0.1, asym: 0.008 },
      blushA: 0.24,
      skinExtras: (c, shc) => {
        // shaved crown (薙髮): blue-grey stubble on the dome, feathered toward the forehead
        const hl = XL.curve([[-0.5, -0.1, 'c'], [0.5, -0.1, 'c'], [0.5, 0.42, 'c'], [0.36, 0.4], [0.31, 0.25], [0.12, 0.21], [0, 0.225], [-0.12, 0.21], [-0.31, 0.25], [-0.36, 0.4], [-0.5, 0.42, 'c']]);
        c.fillStyle = XL.rgba('#7d8a99', 0.42); c.fill(hl);
        c.save(); c.clip(hl); c.strokeStyle = XL.rgba('#7d8a99', 0.25); c.lineWidth = 0.03; c.stroke(hl); c.restore();
        // ink smudge from lantern work
        c.fillStyle = XL.rgba('#3a3040', 0.55); c.fill(XL.curve([[0.2, 0.69], [0.27, 0.665], [0.29, 0.69], [0.22, 0.71]]));
      },
    };
    const backHair = (c) => {
      // queue base peeking above the crown (hair is kept only on the back of the crown)
      XL.paint(c, XL.curve([[-0.24, 0.06], [-0.18, -0.06], [0, -0.1], [0.18, -0.06], [0.24, 0.06], [0, 0.02]]), C.hair, { lw: 1.6, rim });
    };
    const frontHair = (c) => {
      // coiled queue (盤辮) wound round the head: braid band of alternating lobes
      const lobes = [];
      const N = 11;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1), x = -0.4 + t * 0.8, y = 0.13 - Math.sin(t * Math.PI) * 0.1;
        lobes.push(XL.ell(x, y + (i % 2 ? 0.012 : -0.012), 0.05, 0.038, (i % 2 ? 0.5 : -0.5)));
      }
      // cast shadow of the braid on the forehead
      c.save(); c.clip(XL.faceShape(F)); c.fillStyle = XL.rgba(XL.skinShadow(C.skin), 0.9);
      c.fill(XL.curve([[-0.42, 0.14], [0, 0.07], [0.42, 0.14], [0.42, 0.2], [0, 0.12], [-0.42, 0.2]])); c.restore();
      XL.paintMass(c, lobes, C.hair, { lw: 1.4, rim, hlCol: XL.rgba('#8a8fa8', 0.5), hl: [1.2, 1.2],
        after: (cc) => lobes.forEach((l, i) => { const t = i / (N - 1); XL.line(cc, [[-0.42 + t * 0.8, 0.12 - Math.sin(t * Math.PI) * 0.1], [-0.38 + t * 0.8, 0.1 - Math.sin(t * Math.PI) * 0.1]], XL.rgba('#9aa0b8', 0.6), 0.9); }) });
      // braid tail tucked with a red cord at the right temple
      XL.paint(c, XL.lock(0.4, 0.12, 0.47, 0.32, 0.08, 0.02), C.hair, { lw: 1.3, rim });
      XL.paint(c, XL.ell(0.41, 0.15, 0.035, 0.026, 0.4), C.red, { lw: 1 });
    };

    function draw(ctx, opt = {}) {
      // sword 螢火 wrapped in cloth, slung on the back (hilt over the left shoulder)
      XL.withT(ctx, 0, 0, 0, 1, 1, (c) => {
        const bundle = XL.ribbon([[40, -352], [-6, -290], [-50, -214]], [13, 14, 12], { round: true });
        XL.paint(c, bundle, C.wrap, { rim, lw: 1.5 });
        XD.swordHilt(c, 40, -350, Math.PI * 0.16, 40, { grip: '#2e2626', guard: '#a8834a', tassel: C.red });
      });
      // trousers 大褲 (wide, rolled to mid-calf)
      [-1, 1].forEach((sd) => {
        const leg = XL.ribbon([[sd * 20, -212], [sd * 27, -150], [sd * 30, -84]], [44, 48, 52]);
        XL.paint(ctx, leg, C.trou, { rim, sh: [8, 2], lw: 1.6 });
        XD.folds(ctx, [[[sd * 14, -170], [sd * 22, -130], [sd * 20, -96]], [[sd * 38, -150], [sd * 42, -110]]], XL.light(C.trou, 0.18), 1.3);
        // rolled cuff
        XL.paint(ctx, XL.curve([[sd * 30 - 27, -92, 'c'], [sd * 30 + 27, -92, 'c'], [sd * 30 + 26, -76, 'c'], [sd * 30 - 26, -76, 'c']]), XL.light(C.trou, 0.08), { rim, lw: 1.5 });
        // calf
        XD.limb(ctx, [[sd * 29, -80], [sd * 29.5, -52], [sd * 27, -24]], [18, 16, 11.5], C.skin, { rim });
        XL.foot(ctx, sd * 28, -22, B.footS, C.skin, 'straw', sd, { rim });
      });
      // neck + upper sleeves sit behind the jacket body (連袖 dropped shoulder)
      XD.neck(ctx, 0, B.chin, B.shY, B.neckW * 2, C.skin, hu);
      XD.sleeve(ctx, [[-46, -326], [-60, -298], [-70, -270]], [17, 23, 23], C.indigo, { rim, round: true, paint: { sh: [7, 2], after: (c) => XD.folds(c, [[[-64, -300], [-58, -286]], [[-70, -286], [-66, -276]]], XL.shadow(C.indigo, 0.3), 1.4) } });
      XD.sleeve(ctx, [[46, -326], [58, -298], [65, -270]], [17, 23, 23], C.indigo, { rim, round: true, paint: { sh: [7, 2], after: (c) => XD.folds(c, [[[64, -298], [58, -284]]], XL.shadow(C.indigo, 0.3), 1.4) } });
      // jacket 對襟短衫
      const jk = XL.sym([[0, -343], [13, -344], [32, -339], [50, -332], [57, -322, 'c'], [56, -296], [56, -262], [61, -214], [64, -193, 'c'], [30, -189], [0, -188]]);
      const jacket = XL.curve(jk);
      XL.paint(ctx, jacket, C.indigo, {
        rim, lw: 1.8, sh: [13, 5],
        shadows: [XL.curve([[-58, -300], [-40, -290], [-44, -250], [-58, -240]])],
        after: (c) => {
          // centre opening with piping and 5 cloth knot buttons
          XL.line(c, [[0, -341], [0, -189]], XL.ink(C.indigo), 1.4);
          XD.folds(c, [[[-30, -300], [-26, -270], [-30, -240]], [[34, -296], [30, -262]], [[-40, -214], [-30, -196]], [[40, -220], [46, -196]]], XL.shadow(C.indigo, 0.3), 1.6);
          XL.line(c, [[-56, -333], [-38, -339], [-14, -347]], XL.light(C.indigo, 0.25), 0.9);
        },
      });
      for (let i = 0; i < 5; i++) XL.knot(ctx, 0, -334 + i * 22, 2.3, '#283651', 6, '#283651');
      // stand collar
      XL.paint(ctx, XL.curve([[-14, -350, 'c'], [0, -351], [14, -350, 'c'], [16, -340, 'c'], [-16, -340, 'c']]), C.indigo, { lw: 1.4 });
      // sling of the sword bundle across the chest
      XL.paint(ctx, XL.ribbon([[36, -340], [0, -292], [-46, -228]], 9), XL.shadow(C.wrap, 0.12), { rim, lw: 1.4 });
      // apron 圍裙 with waist cord
      const ap = XL.curve([[-38, -250, 'c'], [38, -250, 'c'], [42, -170], [47, -72, 'c'], [0, -68], [-47, -72, 'c'], [-42, -170]]);
      XL.paint(ctx, ap, C.apron, {
        rim, lw: 1.7, sh: [9, 3],
        after: (c) => {
          XD.folds(c, [[[-18, -230], [-22, -160], [-20, -86]], [[16, -220], [20, -150], [24, -80]], [[-34, -190], [-38, -100]]], XL.shadow(C.apron, 0.22), 1.6);
          // paste stains + red paint spatter
          c.fillStyle = XL.rgba('#f4ecda', 0.8); c.fill(XL.curve([[-10, -150], [2, -156], [8, -146], [-2, -138]]));
          c.fillStyle = XL.rgba(C.red, 0.75); [[12, -120, 2.4], [18, -112, 1.4], [6, -108, 1.2], [-26, -96, 1.8]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); });
          // pocket with tools
          XL.paint(c, XL.curve([[8, -214, 'c'], [36, -214, 'c'], [35, -180, 'c'], [9, -180, 'c']]), XL.shadow(C.apron, 0.06), { lw: 1.2 });
        },
      });
      // tool handles in the pocket (bamboo knife, brush)
      XL.paint(ctx, XL.ribbon([[14, -212], [12, -232]], 4), '#8a6a3c', { lw: 1 });
      XL.paint(ctx, XL.ribbon([[24, -212], [27, -236]], 3.2), '#2e2a2a', { lw: 1 });
      XL.paint(ctx, XL.ribbon([[30, -212], [31, -228]], 3.6), C.bamboo, { lw: 1 });
      XL.paint(ctx, XL.ribbon([[-60, -252], [0, -249], [60, -252]], 4.5), '#8a6a42', { lw: 1.2 });
      XL.paint(ctx, XL.lock(-40, -251, -46, -228, 5, -3), '#8a6a42', { lw: 1 });
      // ---- arms
      // screen-left arm: holds the half-papered lantern by its loop
      XL.paint(ctx, XL.ribbon([[-68, -278], [-72, -266]], 26), XL.light(C.indigo, 0.1), { rim, lw: 1.3, sh: [4, 1] }); // rolled cuff
      XD.sleeve(ctx, [[-72, -264], [-80, -238], [-86, -214]], [22, 21, 18], C.guard, { rim, paint: { after: (c) => XD.folds(c, [[[-82, -250], [-74, -246]], [[-85, -232], [-77, -228]]], XL.shadow(C.guard, 0.25), 1.2) } });
      XL.paint(ctx, XL.ribbon([[-77, -220], [-95, -214]], 3.2), '#8a6a42', { lw: 0.9 });
      XD.lantern(ctx, -97, -204, 30, { papered: 'half', paper: C.paper, rib: C.bamboo, hang: 14, char: '', rim, tall: 1.0 });
      XL.hand(ctx, -88, -214, 0.08, B.handL * 0.92, C.skin, 'gripV', true, { rim });
      // screen-right arm: relaxed, brush in hand, red string bracelet
      XL.paint(ctx, XL.ribbon([[64, -278], [66, -266]], 26), XL.light(C.indigo, 0.1), { rim, lw: 1.3, sh: [4, 1] });
      XD.sleeve(ctx, [[66, -266], [69, -240], [71, -214]], [22, 21, 18], C.guard, { rim, paint: { after: (c) => XD.folds(c, [[[64, -252], [72, -248]], [[64, -232], [73, -229]]], XL.shadow(C.guard, 0.25), 1.2) } });
      XL.paint(ctx, XL.ribbon([[63, -218], [79, -216]], 3.2), '#8a6a42', { lw: 0.9 });
      XL.paint(ctx, XL.ribbon([[64, -209], [79, -207]], 2.6), C.red, { lw: 0.9 });
      // paste brush
      XL.paint(ctx, XL.ribbon([[66, -196], [86, -168]], 3.6), '#8a6a3c', { lw: 1 });
      XL.paint(ctx, XL.curve([[84, -172], [92, -168], [96, -156], [88, -158], [82, -166]]), '#efe3c4', { lw: 1 });
      XL.hand(ctx, 71, -212, -0.08, B.handL, C.skin, 'relax', false, { rim });
      // ---- head
      XD.head(ctx, 0, B.top, hu, F, backHair, frontHair, { tilt: -0.05 });
    }
    function back(ctx) {
      // back-view extras: braid coil seen from behind + wrapped sword diagonal
      ctx.fillStyle = '#000';
      ctx.fill(XL.ribbon([[-30, -350], [6, -290], [50, -214]], [13, 14, 12], { round: true }));
      ctx.fill(XL.ribbon([[-34, -356], [-50, -392]], 7));
    }
    global.XINGHE_DESIGNS.push({
      id: '01', zh: '薙髮學徒', en: 'The Queue-bound Apprentice', tag: '歷史寫實', tagEn: 'HISTORICAL',
      heads: 6.6, hairNote: '薙髮留辮・盤辮（歷史）', accent: '#c8432b', accentInk: '#8c2f22',
      bg: { motif: (ctx, w, h) => XD.motifs.lanterns(ctx, w, h, '#8c2f22') },
      palette: [['#34486e', '靛藍', 'indigo'], ['#d5c5a3', '胚布', 'unbleached'], ['#ebe4d3', '袖套白', 'guard'], ['#2f2d36', '烏褲', 'soot'], ['#c8432b', '燈紙紅', 'lantern red'], ['#e8b38b', '膚', 'skin'], ['#1d191e', '髮', 'hair']],
      callouts: [
        { x: -18, y: -410, zh: '盤辮', en: 'queue coiled for work', side: 'L', ly: 40 },
        { x: -97, y: -150, zh: '半糊燈籠', en: 'half-papered lantern', side: 'L' },
        { x: -82, y: -240, zh: '袖套', en: 'paste sleeve-guards', side: 'L', ly: 180 },
        { x: 6, y: -312, zh: '對襟短衫・盤扣', en: 'centre-front jacket', side: 'R', ly: 92 },
        { x: 46, y: -365, zh: '布包螢火劍', en: 'cloth-wrapped sword', side: 'R', ly: 40 },
        { x: 30, y: -140, zh: '圍裙', en: 'work apron, paste-stained', side: 'R', ly: 300 },
        { x: 34, y: -18, zh: '草鞋', en: 'straw sandals', side: 'R', ly: 400 },
      ],
      idea: '最寫實的一版：九份燈籠舖小學徒，前額薙髮、辮子盤頭好幹活；圓臉大笑、招風耳，一手提糊到一半的燈籠、一手拿漿刷，劍「螢火」還用布包著斜背。',
      culture: '依據清代臺灣閩南男子「薙髮留辮」與勞動時盤辮於頂的習慣、對襟短衫盤扣、大褲捲管、草鞋；燈籠匠用袖套與圍裙防漿糊。唯一的奇幻是背上那把劍。',
      model3d: '髮茬用貼圖；盤辮做成一圈粗辮環體；燈籠上半骨架用 alpha 貼圖。主形：圓燈籠＋長圍裙＋肩後劍柄。',
      silNote: '關鍵剪影：圓燈籠、長圍裙、肩上劍柄',
      faceNote: '圓臉・寬鼻・招風耳・露齒笑',
      costume: ['盤辮（薙髮留辮，辮子繞頭一圈、尾端紅繩塞好）', '靛藍對襟短衫，立領、五顆同色布盤扣，袖子捲到肘', '白布袖套（燈籠匠防漿糊）', '胚布圍裙，漿糊與紅顏料污漬，口袋插竹刀、毛筆', '烏色大褲捲到小腿肚；草鞋', '布包「螢火」劍斜背、布帶斜跨胸前；左腕紅繩'],
      systems: '頭像：光額＋盤辮讓頭部輪廓最圓、表情最好讀。地圖精靈：圓燈籠是辨識點（可做走路搖擺動畫）。戰鬥精靈：拔劍時布包甩開成為起手動作。',
      draw, back,
    });
  })();
})(window);

// 彼岸燈 — design options: 糰子 Tuanzi (石虎 Formosan leopard-cat spirit)
// A parametric leopard-cat bust: body shape, fur palette, markings, ears, eyes, tail and props.
'use strict';
(() => {
  const U = G.U;
  const { SKIN, ell, blob, ribbonPath, sample, TAU } = DZ.kit;
  const { AC, glowDot, sparkle } = DL;

  const FUR = {
    tawny: { fur: '#d0a066', furL: '#f4e4c6', furD: '#9c6c3a', spot: '#4e2f1a', line: '#5a3820', white: '#fffaf0', hl: '#e2b67c' },
    wild: { fur: '#a89070', furL: '#e8dcc4', furD: '#76603e', spot: '#2e2214', line: '#3a2a18', white: '#fbf6ea', hl: '#c0a888' },
    golden: { fur: '#e8b450', furL: '#fff0c8', furD: '#b07a2a', spot: '#6a3a14', line: '#6a4018', white: '#fffbee', hl: '#f6cc70' },
    moon: { fur: '#d8dce8', furL: '#ffffff', furD: '#9aa2bc', spot: '#5a6488', line: '#5a6080', white: '#ffffff', hl: '#eef0f8' },
    ember: { fur: '#e08a48', furL: '#ffe4c8', furD: '#a8542a', spot: '#5a2010', line: '#6a2c14', white: '#fff6ea', hl: '#f4a868' },
    cocoa: { fur: '#b08058', furL: '#f0dcc4', furD: '#7a5030', spot: '#3a2010', line: '#4a2a14', white: '#fff8ee', hl: '#c89870' },
    cosmic: { fur: '#c8a070', furL: '#f8e8d0', furD: '#8a6a50', spot: '#6a3aa0', line: '#4a3050', white: '#ffffff', hl: '#e0bc90' },
  };

  function headPts(w, h) {
    return [[-82, 6], [-76, -44], [-40, -76], [8, -82], [56, -72], [86, -36], [92, 10], [78, 50], [40, 72], [0, 76], [-44, 70], [-78, 44]]
      .map(([x, y]) => [x * w, y * h + (y > 0 ? 0 : 0)]);
  }

  // ------------------------------------------------------------------ builder
  function tz(o) {
    const T = Object.assign({}, FUR[o.fur || 'tawny'], o.furOver || {});
    const hw = (o.head && o.head.w) || 1, hh = (o.head && o.head.h) || 1;
    const es = (o.ears && o.ears.s) || 1, et = (o.ears && o.ears.tilt) || 0;
    const head = (c) => blob(c, headPts(hw, hh));
    const spots = o.spots || 'spots';
    const glowSpot = o.glowSpots;
    const faceOpt = Object.assign({ eyeX: -26, farX: 36, eyeY: 2, eyeW: 34, eyeH: 34, farW: 0.8, noseX: 6, noseY: 26, mouthX: 6, mouthY: 38, mouthW: 0.8, browY: -26, blush: 0.25 }, o.faceOpt || {});
    const spec = {
      face: 'f', faceOpt,
      skin: Object.assign({}, SKIN.fair, { base: T.fur, mid: T.furD, shade: T.furD, deep: U.shade(T.furD, -0.25), line: T.line, blush: o.blush || '#ff9aa0', lip: '#a05050' }),
      eye: Object.assign({ iris: ['#2a3a10', '#7d9a22', '#e4e070', '#fff6b0'], lash: U.shade(T.line, -0.3) }, o.eye || {}),
      hair: { base: T.fur, dark: T.furD, light: T.furL, line: T.line },
      pose: Object.assign({ hx: 150, hy: 172, s: 1 }, o.pose || {}),
      noNose: true, noBrows: true, ring: null, rimCol: null, hairShadow: false,
      mouths: Object.assign({ normal: 'catw', smile: 'catw', smug: 'catw', think: 'catw', serious: 'catw' }, o.mouths || {}),
      neck() {},
      aura: o.aura,
      behind(c, S) {
        if (o.behind0) o.behind0(c, S);
        drawTail(c, T, o.tail || {});
        if (o.behind) o.behind(c, S);
      },
      body(c, S) {
        drawBody(c, T, o.body || 'round', spots, glowSpot, o);
        if (o.bodyExtra) o.bodyExtra(c, S, T);
      },
      front() {},
      faceDraw(c, S) {
        // ears
        const ears = [[-52 * hw, -62 * hh, -0.5 - et, 1], [50 * hw, -66 * hh, 0.45 + et, 0.85]];
        for (const [x, y, r, sc] of ears) {
          c.save(); c.translate(x, y); c.rotate(r); c.scale(sc * es, es);
          const tip = o.ears && o.ears.round ? 0.6 : 1;
          c.beginPath(); c.moveTo(-24, 14); c.quadraticCurveTo(-26, -30 * tip, 0, -38 * tip); c.quadraticCurveTo(26, -30 * tip, 24, 14); c.closePath();
          c.fillStyle = T.fur; c.fill(); c.strokeStyle = T.line; c.lineWidth = 2; c.stroke();
          c.beginPath(); c.moveTo(-14, 10); c.quadraticCurveTo(-14, -22 * tip, 0, -27 * tip); c.quadraticCurveTo(14, -22 * tip, 14, 10); c.closePath();
          c.fillStyle = o.earInner || '#f6c8b8'; c.fill();
          c.strokeStyle = T.white; c.lineWidth = 1.2;
          for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(k * 5, 8); c.lineTo(k * 7, -8 * tip); c.stroke(); }
          c.fillStyle = T.spot; c.beginPath(); c.moveTo(-8, -32 * tip); c.quadraticCurveTo(0, -42 * tip, 8, -32 * tip); c.quadraticCurveTo(0, -27 * tip, -8, -32 * tip); c.fill();
          if (o.ears && o.ears.tuft) { c.strokeStyle = T.spot; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -38 * tip); c.lineTo(2, -50); c.stroke(); }
          c.restore();
        }
        head(c);
        const g = c.createRadialGradient(-20, -30, 10, 0, 0, 100);
        g.addColorStop(0, T.hl); g.addColorStop(0.7, T.fur); g.addColorStop(1, T.furD);
        c.fillStyle = g; c.fill();
        c.save(); head(c); c.clip();
        // cream muzzle & cheeks
        c.fillStyle = T.furL;
        blob(c, [[-46, 30], [-30, 14], [6, 18], [40, 12], [62, 30], [50, 62], [10, 76], [-30, 64]].map(([x, y]) => [x * Math.min(1.1, hw), y])); c.fill();
        // white eye-lines (the leopard cat's signature)
        c.fillStyle = T.white;
        for (const [x, w] of [[-26, 20], [36, 15]]) {
          c.beginPath(); c.moveTo(x - w * 0.6, 14); c.quadraticCurveTo(x, 30, x + w * 0.2, 44); c.quadraticCurveTo(x + w * 0.5, 26, x + w * 0.7, 14); c.closePath(); c.fill();
        }
        ell(c, -26, -18, 16, 6); c.fill(); ell(c, 36, -20, 12, 5); c.fill();
        // white stripes running up from the inner eye corners
        c.strokeStyle = T.white; c.lineWidth = 3.4; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-8, -18); c.quadraticCurveTo(-10, -40, -14, -58); c.stroke();
        c.beginPath(); c.moveTo(20, -20); c.quadraticCurveTo(22, -42, 26, -60); c.stroke();
        // forehead stripes
        c.strokeStyle = glowSpot ? glowSpot : T.spot;
        for (const [x0, x1, w] of [[-18, -26, 5], [2, 0, 5.5], [12, 14, 5], [30, 40, 4.5]]) {
          c.lineWidth = w * (o.stripeW || 1);
          c.beginPath(); c.moveTo(x0, -30); c.quadraticCurveTo((x0 + x1) / 2 - 2, -60, x1, -86 * hh); c.stroke();
        }
        c.lineWidth = 3.5; c.strokeStyle = T.spot;
        c.beginPath(); c.moveTo(-60, 12); c.quadraticCurveTo(-72, 18, -84, 14); c.stroke();
        c.beginPath(); c.moveTo(-58, 24); c.quadraticCurveTo(-70, 32, -82, 30); c.stroke();
        c.beginPath(); c.moveTo(66, 10); c.quadraticCurveTo(78, 14, 92, 10); c.stroke();
        c.fillStyle = glowSpot || T.spot;
        const sp = spots === 'dense' ? [[-60, -30, 4], [-68, -14, 3.5], [70, -30, 3.5], [-40, -50, 3], [54, -50, 3], [-70, -2, 3], [76, -14, 3], [-52, -44, 2.5], [62, -44, 2.6], [40, -58, 2.4]]
          : spots === 'sparse' ? [[-62, -26, 3.5], [70, -28, 3]] : [[-60, -30, 4], [-68, -14, 3.5], [70, -30, 3.5], [-40, -50, 3], [54, -50, 3]];
        for (const [x, y, r] of sp) { ell(c, x * hw, y, r, r * 0.8); c.fill(); }
        if (o.faceMark) o.faceMark(c, T);
        c.restore();
        head(c); c.strokeStyle = T.line; c.lineWidth = 2.2; c.stroke();
        // fluffy cheek tufts
        c.fillStyle = T.furL; c.strokeStyle = T.line; c.lineWidth = 1.6;
        const fl = o.fluff || 1;
        for (const [x, y, d] of [[-80 * hw, 36, -1], [86 * hw, 34, 1]]) {
          c.beginPath(); c.moveTo(x - d * 4, y - 14); c.lineTo(x + d * 10 * fl, y - 6); c.lineTo(x + d * 2, y); c.lineTo(x + d * 10 * fl, y + 8); c.lineTo(x - d * 6, y + 14); c.closePath(); c.fill(); c.stroke();
          if (fl > 1.2) { c.beginPath(); c.moveTo(x - d * 2, y + 10); c.lineTo(x + d * 8 * fl, y + 18); c.lineTo(x - d * 8, y + 22); c.closePath(); c.fill(); c.stroke(); }
        }
      },
      faceDraw2(c) {
        c.fillStyle = o.noseCol || '#e88a90';
        c.beginPath(); c.moveTo(-1, 22); c.quadraticCurveTo(6, 19, 13, 22); c.quadraticCurveTo(10, 29, 6, 31); c.quadraticCurveTo(2, 29, -1, 22); c.fill();
        c.strokeStyle = '#8a3a40'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.7)'; ell(c, 4, 23.5, 2.2, 1.2); c.fill();
        c.strokeStyle = T.line; c.lineWidth = 1.4; c.beginPath(); c.moveTo(6, 31); c.lineTo(6, 35); c.stroke();
      },
      acc: o.acc,
      over(c, S) {
        c.strokeStyle = o.whisker || 'rgba(255,255,255,0.9)'; c.lineWidth = 1.1; c.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          c.beginPath(); c.moveTo(-24, 34 + k * 5); c.quadraticCurveTo(-60, 30 + k * 7, -100, 28 + k * 12); c.stroke();
          c.beginPath(); c.moveTo(34, 32 + k * 5); c.quadraticCurveTo(70, 28 + k * 6, 104, 24 + k * 11); c.stroke();
        }
        const E = S.E;
        c.strokeStyle = T.spot; c.lineWidth = 3.4;
        const b = (x, y, dIn, dOut, dir) => { c.beginPath(); c.moveTo(x + dir * 7, y + dIn * 0.6); c.lineTo(x - dir * 7, y + dOut * 0.6); c.stroke(); };
        b(-26, -28 * hh, E.brIn, E.brOut, 1); b(36, -29 * hh, E.brIn, E.brOut + E.brFar, -1);
        if (o.over) o.over(c, S, T);
      },
      eyesDraw: o.eyesDraw,
    };
    return spec;
  }

  function drawTail(c, T, t) {
    if (t.hide) return;
    const sp = t.spine || [70, 168, 150, 150, 150, 50, 112, 26];
    const w = t.w || 28;
    const geo = ribbonPath(c, sp, w, { p: 0.15, bulge: 0.2, w0: 1, n: 26 });
    const g = c.createLinearGradient(sp[0], sp[1], sp[6], sp[7]); g.addColorStop(0, T.furD); g.addColorStop(0.6, T.fur); g.addColorStop(1, T.hl);
    c.fillStyle = g; c.fill(); c.strokeStyle = T.line; c.lineWidth = 2; c.stroke();
    // rings
    c.save(); ribbonPath(c, sp, w, { p: 0.15, bulge: 0.2, w0: 1, n: 26 }); c.clip();
    const pts = geo.pts, N = pts.length - 1;
    for (let k = 0; k < (t.rings || 5); k++) {
      const i = Math.round(U.lerp(N * 0.38, N * 0.92, k / Math.max(1, (t.rings || 5) - 1)));
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
      const p = pts[i];
      c.strokeStyle = t.ring || T.spot; c.lineWidth = t.ringW || 6;
      if (t.ringGlow) { c.save(); c.shadowColor = t.ringGlow; c.shadowBlur = 14; }
      c.beginPath(); c.moveTo(p[0] - Math.cos(ang) * w, p[1] - Math.sin(ang) * w); c.lineTo(p[0] + Math.cos(ang) * w, p[1] + Math.sin(ang) * w); c.stroke();
      if (t.ringGlow) c.restore();
    }
    // dark tip
    const e = pts[N];
    c.fillStyle = t.tip || T.spot; ell(c, e[0], e[1], w * 0.7, w * 0.7); c.fill();
    c.restore();
    if (t.ringGlow) for (let k = 0; k < (t.rings || 5); k++) { const i = Math.round(U.lerp(N * 0.38, N * 0.92, k / Math.max(1, (t.rings || 5) - 1))); glowDot(c, pts[i][0], pts[i][1], 22, t.ringGlow, 0.45); }
    if (t.flame) {
      const fx = e[0], fy = e[1] - 6;
      glowDot(c, fx, fy - 8, 40, '#ffb040', 0.6);
      c.beginPath(); c.moveTo(fx, fy - 40); c.bezierCurveTo(fx + 16, fy - 22, fx + 18, fy - 4, fx + 10, fy + 6); c.quadraticCurveTo(fx, fy + 12, fx - 10, fy + 6); c.bezierCurveTo(fx - 18, fy - 4, fx - 10, fy - 18, fx, fy - 40);
      c.fillStyle = 'rgba(255,140,40,0.9)'; c.fill();
      c.beginPath(); c.moveTo(fx, fy - 24); c.bezierCurveTo(fx + 8, fy - 12, fx + 8, fy, fx, fy + 4); c.bezierCurveTo(fx - 8, fy, fx - 8, fy - 12, fx, fy - 24);
      c.fillStyle = '#fff2b0'; c.fill();
    }
    if (t.lantern) AC.lantern(c, e[0] + 4, e[1] + 6, 1.1, {});
    if (t.bow) AC.bow(c, pts[Math.round(N * 0.3)][0], pts[Math.round(N * 0.3)][1], t.bow, 0.8, true);
  }

  const BODY = {
    round: [[-96, 200], [-100, 140], [-80, 96], [-40, 76], [40, 74], [84, 96], [100, 140], [96, 200]],
    pear: [[-122, 200], [-118, 140], [-84, 96], [-40, 78], [40, 76], [86, 96], [118, 140], [122, 200]],
    loaf: [[-138, 200], [-136, 124], [-110, 90], [-50, 76], [50, 74], [108, 88], [134, 124], [138, 200]],
    tiny: [[-62, 200], [-66, 140], [-50, 104], [-24, 88], [26, 88], [52, 104], [66, 140], [62, 200]],
    sleek: [[-70, 200], [-76, 140], [-62, 100], [-34, 80], [36, 80], [62, 100], [76, 140], [70, 200]],
  };
  function drawBody(c, T, kind, spots, glowSpot, o) {
    const pts = BODY[kind] || BODY.round;
    blob(c, pts);
    const g = c.createLinearGradient(-100, 0, 100, 0); g.addColorStop(0, T.hl); g.addColorStop(0.5, T.fur); g.addColorStop(1, T.furD);
    c.fillStyle = g; c.fill(); c.strokeStyle = T.line; c.lineWidth = 2; c.stroke();
    // belly
    const bw = kind === 'loaf' ? 1.3 : kind === 'pear' ? 1.15 : kind === 'tiny' ? 0.7 : kind === 'sleek' ? 0.7 : 1;
    blob(c, [[-50, 200], [-56, 130], [-20, 96], [30, 96], [60, 130], [56, 200]].map(([x, y]) => [x * bw, y]));
    c.fillStyle = T.furL; c.fill();
    // spots / rosettes on the sides
    c.save(); blob(c, pts); c.clip();
    const r = DL.rng(o.spotSeed || 5);
    const n = spots === 'dense' ? 26 : spots === 'sparse' ? 8 : 16;
    const W = Math.abs(pts[0][0]);
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;
      const x = side * U.lerp(W * 0.55, W * 0.98, r()), y = U.lerp(96, 196, r()), rr = 3.5 + r() * 3;
      if (glowSpot) { glowDot(c, x, y, rr * 3, glowSpot, 0.6); }
      c.fillStyle = glowSpot || T.spot;
      if (spots === 'rosette') { c.strokeStyle = T.spot; c.lineWidth = 2; c.beginPath(); c.arc(x, y, rr + 1, 0.4, TAU - 0.4); c.stroke(); }
      else { ell(c, x, y, rr, rr * 0.8, r()); c.fill(); }
    }
    c.restore();
    // paws
    if (o.paws !== false) {
      const px = kind === 'tiny' ? 26 : kind === 'loaf' ? 44 : 34;
      for (const dx of [-px, px]) {
        ell(c, dx, 188, 15, 11); c.fillStyle = T.furL; c.fill(); c.strokeStyle = T.line; c.lineWidth = 1.5; c.stroke();
        c.beginPath(); c.moveTo(dx - 4, 182); c.lineTo(dx - 4, 188); c.moveTo(dx + 4, 182); c.lineTo(dx + 4, 188); c.stroke();
      }
    }
  }

  // held props (body-local, at the paws)
  const PROP = {
    mushroom(c) {
      c.save(); c.translate(16, 150);
      glowDot(c, 0, -24, 36, '#d080ff', 0.45);
      c.fillStyle = '#e8d8ff'; ell(c, 0, -10, 4, 10); c.fill();
      const mg = c.createRadialGradient(0, -24, 2, 0, -24, 22);
      mg.addColorStop(0, '#ffd0ff'); mg.addColorStop(0.5, '#c070f0'); mg.addColorStop(1, '#6a2aa8');
      c.beginPath(); c.moveTo(-18, -18); c.quadraticCurveTo(-16, -38, 0, -38); c.quadraticCurveTo(16, -38, 18, -18); c.closePath();
      c.fillStyle = mg; c.fill(); c.strokeStyle = '#4a1a78'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.8)'; for (const [x, y] of [[-8, -28], [4, -32], [10, -24]]) { ell(c, x, y, 2.2, 1.8); c.fill(); }
      c.restore();
    },
    // 紅龜粿 red turtle cake
    redTurtle(c) {
      c.save(); c.translate(6, 150);
      ell(c, 0, -14, 30, 20); const g = c.createRadialGradient(-8, -20, 2, 0, -14, 30); g.addColorStop(0, '#ff7a7a'); g.addColorStop(1, '#c8202a');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#7a0a14'; c.lineWidth = 1.4; c.stroke();
      c.strokeStyle = 'rgba(120,10,20,0.6)'; c.lineWidth = 1.2;
      ell(c, 0, -14, 18, 11); c.stroke();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 6, -14 + Math.sin(a) * 4); c.lineTo(Math.cos(a) * 16, -14 + Math.sin(a) * 10); c.stroke(); }
      c.fillStyle = '#f4e8c8'; ell(c, 0, 4, 34, 6); c.fill(); c.strokeStyle = '#8a7a50'; c.stroke();
      c.restore();
    },
    coin(c) {
      c.save(); c.translate(10, 146);
      glowDot(c, 0, -16, 34, '#ffe070', 0.5);
      ell(c, 0, -16, 22, 22); const g = c.createRadialGradient(-6, -22, 2, 0, -16, 22); g.addColorStop(0, '#fff4b0'); g.addColorStop(1, '#d8a020');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#8a6010'; c.lineWidth = 1.6; c.stroke();
      c.fillStyle = '#8a6010'; c.fillRect(-5, -21, 10, 10);
      c.fillStyle = '#c08a20'; c.font = 'bold 9px serif'; c.textAlign = 'center';
      c.fillText('福', 0, -26); c.fillText('壽', 0, 0);
      c.restore();
    },
    lantern(c) { AC.lantern(c, 12, 112, 1.6, {}); c.strokeStyle = '#6a4020'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 112); c.lineTo(12, 100); c.stroke(); },
    fish(c) {
      c.save(); c.translate(8, 150); c.rotate(-0.2);
      c.beginPath(); c.moveTo(-30, -14); c.quadraticCurveTo(-4, -32, 22, -14); c.lineTo(34, -24); c.lineTo(32, -4); c.lineTo(22, -14); c.quadraticCurveTo(-4, 4, -30, -14);
      const g = c.createLinearGradient(0, -30, 0, 0); g.addColorStop(0, '#6a8aa8'); g.addColorStop(1, '#d8e8f4'); c.fillStyle = g; c.fill(); c.strokeStyle = '#2a4058'; c.lineWidth = 1.3; c.stroke();
      c.fillStyle = '#1a2030'; ell(c, -20, -16, 2.2, 2.2); c.fill();
      c.restore();
    },
    peach(c) {
      c.save(); c.translate(10, 146);
      glowDot(c, 0, -14, 30, '#ffc0c0', 0.5);
      c.beginPath(); c.moveTo(0, -36); c.bezierCurveTo(22, -30, 24, -2, 0, 2); c.bezierCurveTo(-24, -2, -22, -30, 0, -36);
      const g = c.createRadialGradient(-6, -20, 2, 0, -16, 26); g.addColorStop(0, '#fff0e0'); g.addColorStop(0.6, '#ffb0a0'); g.addColorStop(1, '#e0607a');
      c.fillStyle = g; c.fill(); c.strokeStyle = '#a03a4a'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#5a9a4a'; c.beginPath(); c.moveTo(0, -34); c.quadraticCurveTo(14, -44, 20, -36); c.quadraticCurveTo(10, -32, 0, -34); c.fill();
      c.restore();
    },
  };
  const held = (name) => (c) => PROP[name](c);

  // ------------------------------------------------------------------ options
  DESIGN_OPTIONS.push({
    id: 'tuanzi', name: '糰子', en: 'Tuanzi — leopard-cat spirit companion', accent: '#ffd080',
    brief: '雲歸的夥伴，一隻會說話的圓滾滾石虎（台灣石虎）精。什麼都吃、動不動就慌，吃了七彩靈蕈之後會一臉正經地發表宇宙級廢話。設計重點：石虎的白色眼線與額頭條紋、耳背白斑、身上斑點、環紋尾巴；可愛優先，神秘感點到為止。',
    options: [
      {
        name: '糰子本尊', en: 'Tuanzi Classic (canon)', style: 'classic', expr: 'smile', bg: ['#2a2040', '#4a3050'],
        desc: '原設定：麻糬般的圓身體、黃褐毛色配黑斑，石虎招牌的白眼線與額紋，抱著一朵發光的紫色靈蕈。標準吉祥物比例。',
        spec: tz({ body: 'round', bodyExtra: held('mushroom'), tail: {} }),
      },
      {
        name: '大福紅龜粿', en: 'Big Mochi with Red Turtle Cake', style: 'water', expr: 'smile', bg: ['#f0c080', '#e0a0a0'], accent: '#f0a070',
        desc: '「什麼都吃」放大版：吃成一顆攤開的大麻糬，耳朵小小、瞇瞇眼，雙手抱著比臉還大的紅龜粿，嘴邊還有碎屑。最療癒。',
        spec: tz({
          body: 'loaf', head: { w: 1.08, h: 0.96 }, ears: { s: 0.82 }, fluff: 1.4,
          eye: { lid: 0.55 }, faceOpt: { eyeH: 30, blush: 0.5 },
          bodyExtra: held('redTurtle'), tail: { spine: [100, 176, 170, 168, 170, 100, 140, 80], w: 30 },
          over(c) { c.fillStyle = '#f4e8c8'; for (const [x, y] of [[-6, 50], [20, 46], [12, 54]]) { ell(c, x, y, 1.8, 1.4); c.fill(); } },
        }),
      },
      {
        name: '靈光尾環', en: 'Glowing Tail-rings', style: 'donghua', expr: 'normal', bg: ['#081828', '#10304a'], accent: '#60f0ff', rim: '#c0faff',
        desc: '靈獸感：身形略修長、尾巴高高捲起，尾上環紋發出青藍靈光，額紋與斑點也微微透光；眼睛是湖水綠。夜裡會自己發亮。',
        spec: tz({
          body: 'sleek', head: { w: 0.96, h: 1 }, ears: { s: 1.08, tuft: true }, glowSpots: '#40d8f0',
          eye: { iris: ['#063a3a', '#10a0a0', '#80fff0', '#e0ffff'] },
          tail: { spine: [56, 170, 150, 160, 160, 40, 108, 2], w: 26, ring: '#40d8f0', ringGlow: '#60f0ff', rings: 5 },
          aura(c) { AC.aura(c, '#60f0ff', 0.18, 170); },
          over(c) { AC.motes(c, { kind: 'spark', col: '#80f8ff', n: 10, seed: 3, s: 3 }); },
        }),
      },
      {
        name: '符咒項圈', en: 'Talisman Collar & Tiny Cap', style: 'classic', expr: 'smile', bg: ['#1a2a3a', '#3a4a5a'], accent: '#ffd060',
        desc: '和雲歸成套：頭頂一頂迷你黑道冠、脖子上紅繩項圈掛金鈴與小黃符，肩上斜背一隻縮小版酒葫蘆。一看就是「道觀的貓」。',
        spec: tz({
          body: 'round',
          bodyExtra(c) {
            // red collar with bell and talisman tags
            c.strokeStyle = '#c8283a'; c.lineWidth = 6; c.lineCap = 'round';
            c.beginPath(); c.moveTo(-58, 88); c.quadraticCurveTo(4, 112, 64, 86); c.stroke();
            glowDot(c, 4, 116, 16, '#ffe070', 0.5);
            ell(c, 4, 114, 9, 9); const g = c.createRadialGradient(0, 110, 1, 4, 114, 9); g.addColorStop(0, '#fff4b0'); g.addColorStop(1, '#c89020');
            c.fillStyle = g; c.fill(); c.strokeStyle = '#7a5010'; c.lineWidth = 1.2; c.stroke();
            c.beginPath(); c.moveTo(-3, 116); c.lineTo(11, 116); c.stroke();
            AC.talisman(c, -30, 118, 0.25, 0.55);
            AC.talisman(c, 36, 116, -0.25, 0.5);
            AC.gourd(c, 78, 150, 0.7);
          },
          tail: {},
          acc(c) {
            c.save(); c.translate(-2, -20); c.scale(0.9, 0.9);
            AC.daoGuan(c, { col: '#1a1a22', taiji: true, pin: '#c99550' });
            c.restore();
          },
        }),
      },
      {
        name: '小奶糰', en: 'Tiny Kitten', style: 'cel', expr: 'surprise', bg: ['#ffb0c0', '#ffe8b0'], accent: '#ffffff',
        desc: '幼崽版：小小一隻、頭比身體大，超大耳朵和水汪汪大眼，粉紅鼻頭，抱著一條小魚乾一臉「咦？」。萌度最高，適合 Q 版周邊。',
        spec: tz({
          body: 'tiny', head: { w: 1.02, h: 1.04 }, ears: { s: 1.3, tilt: 0.1 },
          faceOpt: { eyeW: 40, eyeH: 44, eyeX: -28, farX: 38, blush: 0.6 }, eye: { iris: ['#2a3a10', '#7daa32', '#e8f080', '#fffad0'], pupilSize: 1.15 },
          noseCol: '#ff9aaa', earInner: '#ffc0c8',
          bodyExtra: held('fish'), tail: { spine: [40, 176, 100, 170, 110, 120, 90, 100], w: 20 },
        }),
      },
      {
        name: '山林野貓', en: 'Wild Leopard-cat', style: 'ink', expr: 'serious', bg: ['#6a8a5a', '#222'],
        desc: '最貼近真實石虎：灰褐毛、密集黑斑與清楚的白眼線、窄一點的口鼻、琥珀眼小瞳孔，神情警覺。水墨畫法，帶「保育」的寫實味。',
        spec: tz({
          fur: 'wild', body: 'sleek', head: { w: 0.94, h: 1.02 }, ears: { s: 1, round: true }, spots: 'dense', stripeW: 1.15,
          eye: { iris: ['#3a2a08', '#a07a20', '#f0c860', '#fff0c0'], pupilSize: 0.6 }, faceOpt: { eyeH: 30, blush: 0 },
          tail: { spine: [50, 174, 130, 176, 160, 130, 150, 90], w: 22, rings: 6 },
          over(c) { AC.bamboo(c, -160, 150, 1.2, -0.4, '#2a2a2a'); },
        }),
      },
      {
        name: '蕈仙開悟', en: 'Mushroom-enlightened Sage', style: 'donghua', expr: 'smug', bg: ['#1a0a3a', '#3a1a5a'], accent: '#d080ff', rim: '#ffe0ff',
        desc: '「吃太多靈蕈」形態：額上睜開第三隻眼、斑點變成七彩、半閉的禪定眼，頭頂浮著一朵蕈傘當光環，準備開講宇宙真理。喜劇必殺。',
        spec: tz({
          fur: 'cosmic', body: 'round', eye: { lid: 0.5, iris: ['#3a1060', '#9050d0', '#f0b0ff', '#ffffff'] },
          glowSpots: '#ff80d0', mouths: { smug: 'catw' },
          aura(c) {
            AC.aura(c, '#c080ff', 0.28, 180);
            // rainbow halo rings
            for (const [r, col] of [[120, '#ff6080'], [112, '#ffb040'], [104, '#80e060'], [96, '#40c0ff'], [88, '#a060ff']]) { c.strokeStyle = U.rgba(col, 0.35); c.lineWidth = 3; c.beginPath(); c.arc(0, -10, r, 0, TAU); c.stroke(); }
          },
          faceMark(c) {
            glowDot(c, 8, -48, 16, '#ffe080', 0.8);
            c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-2, -48); c.quadraticCurveTo(8, -58, 18, -48); c.quadraticCurveTo(8, -38, -2, -48); c.fill();
            c.fillStyle = '#a040e0'; ell(c, 8, -48, 3.5, 3.5); c.fill();
          },
          tail: { ring: '#ff60c0', ringGlow: '#ff80e0' },
          acc(c) { AC.mushroom(c, 6, -112, 2.4, '#e04aa8', '#ff90e0'); },
          over(c) { AC.motes(c, { kind: 'spark', col: '#ffc0ff', n: 14, seed: 23, s: 3 }); },
        }),
      },
      {
        name: '月光石虎', en: 'Moonlight Spirit', style: 'classic', expr: 'normal', bg: ['#0e1a3a', '#2a3a6a'], accent: '#c0d8ff',
        desc: '靈體版：銀白毛色、霧藍斑點，額上一彎新月印記，身形邊緣微微發光、像月光凝成的貓。安靜神秘，可做「靈獸覺醒」形態。',
        spec: tz({
          fur: 'moon', body: 'round', eye: { iris: ['#1a2a5a', '#4a6ab0', '#b0d0ff', '#ffffff'] },
          noseCol: '#d0a8c8', earInner: '#e8d8f0', whisker: 'rgba(255,255,255,0.95)',
          aura(c) { AC.aura(c, '#c0d8ff', 0.3, 175); },
          faceMark(c) {
            glowDot(c, 8, -52, 14, '#e0f0ff', 0.8);
            c.fillStyle = '#ffffff'; c.beginPath(); c.arc(8, -52, 8, 0.6, TAU - 0.6); c.arc(12, -54, 7, TAU - 0.9, 0.9, true); c.closePath(); c.fill();
          },
          tail: { ring: '#5a6488' },
          over(c) { AC.motes(c, { kind: 'glow', col: '#e0f0ff', n: 12, seed: 7, s: 4 }); },
        }),
      },
      {
        name: '燈火尾巴', en: 'Lantern-flame Tail', style: 'cel', expr: 'laugh', bg: ['#f08040', '#3a1a4a'], accent: '#ffd060',
        desc: '和燈籠舖呼應：毛色偏橘紅、尾巴尖端燃著一簇不燙手的燈火，脖子繫紅緞帶，張嘴大笑。跟星河站在一起像「燈籠舖的招牌貓」。',
        spec: tz({
          fur: 'ember', body: 'pear', ears: { s: 1.05 }, eye: { iris: ['#4a2a08', '#c06a10', '#ffc050', '#fff4c0'] },
          tail: { spine: [86, 170, 160, 160, 160, 60, 118, 30], w: 26, flame: true, ring: '#5a2010' },
          bodyExtra(c) { AC.bow(c, 6, 98, '#d0283a', 1.1, true); },
        }),
      },
      {
        name: '招財糰子', en: 'Lucky Beckoning Tuanzi', style: 'water', expr: 'smile', bg: ['#f0d070', '#f09090'], accent: '#f0c050',
        desc: '過年版：金黃毛色、胸前紅肚兜繡金「福」，舉起一隻肉球招手、另一手抱著福壽古錢，鈴鐺叮噹。適合節慶活動與商店吉祥物。',
        spec: tz({
          fur: 'golden', body: 'round', spots: 'sparse', eye: { iris: ['#3a2a08', '#8a6a10', '#f0d050', '#fffbd0'] },
          paws: false,
          bodyExtra(c) {
            // red bib 肚兜
            c.beginPath(); c.moveTo(-40, 96); c.quadraticCurveTo(4, 110, 48, 94); c.lineTo(40, 150); c.quadraticCurveTo(4, 176, -32, 150); c.closePath();
            const g = c.createLinearGradient(0, 96, 0, 170); g.addColorStop(0, '#e83a3a'); g.addColorStop(1, '#b01a24');
            c.fillStyle = g; c.fill(); c.strokeStyle = '#6a0a10'; c.lineWidth = 1.4; c.stroke();
            c.strokeStyle = '#f0c050'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-36, 102); c.quadraticCurveTo(4, 116, 44, 100); c.stroke();
            c.fillStyle = '#f8d060'; c.font = 'bold 26px "LXGW WenKai TC","Kaiti TC","STKaiti","Noto Serif TC","WenQuanYi Zen Hei",serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText('福', 4, 134);
            PROP.coin(c);
            // paws: one raised beckoning
            ell(c, -40, 186, 15, 11); c.fillStyle = '#fff0c8'; c.fill(); c.strokeStyle = '#6a4018'; c.lineWidth = 1.5; c.stroke();
            c.save(); c.translate(-82, 92); c.rotate(-0.3);
            c.beginPath(); c.moveTo(-14, 40); c.quadraticCurveTo(-18, 0, 0, -10); c.quadraticCurveTo(18, 0, 14, 40); c.closePath();
            c.fillStyle = '#e8b450'; c.fill(); c.stroke();
            ell(c, 0, -6, 14, 12); c.fillStyle = '#fff0c8'; c.fill(); c.stroke();
            c.fillStyle = '#ff9aa0'; ell(c, 0, -4, 5, 4); c.fill(); for (const [x, y] of [[-7, -12], [0, -15], [7, -12]]) { ell(c, x, y, 2.4, 2.2); c.fill(); }
            c.restore();
          },
          tail: { spine: [70, 168, 140, 160, 150, 90, 120, 70], w: 26 },
          over(c) { AC.motes(c, { kind: 'spark', col: '#ffe080', n: 8, seed: 33, s: 3 }); },
        }),
      },
    ],
  });
})();

// 彼岸燈 — character design tool: component library
// Hair (back / front / tops), outfits, accessories and effects used to compose the option specs.
// Coordinates: head-local (eye line = 0, face midline x≈+14, chin y≈80, crown y≈-110, faces right)
// and body-local (neck base y≈92–108, shoulders y≈116–130, bust bottom y≈190).
'use strict';
(() => {
  const U = G.U;
  const { ribbonPath, sample, through, blob, ell, TAU } = DZ.kit;
  const L = window.DL = {};

  // ------------------------------------------------------------------ small helpers
  // scale a spine around its root (len > 1 lengthens the lock)
  const scl = (sp, k, kx) => sp.map((v, i) => (i < 2 ? v : (i % 2 === 0 ? sp[0] + (v - sp[0]) * (kx || k) : sp[1] + (v - sp[1]) * k)));
  const mirrorX = (sp) => sp.map((v, i) => (i % 2 === 0 ? -v + 12 : v));
  L.scl = scl;
  const rng = (seed) => U.seeded(seed || 7);
  L.rng = rng;
  function glowDot(c, x, y, r, col, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, U.rgba(col, a == null ? 0.9 : a)); g.addColorStop(1, U.rgba(col, 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  L.glowDot = glowDot;
  function sparkle(c, x, y, r, col) {
    c.save(); c.fillStyle = col || '#fff';
    c.beginPath();
    c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r * 0.35, y); c.quadraticCurveTo(x, y, x, y + r);
    c.quadraticCurveTo(x, y, x - r * 0.35, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
    c.beginPath();
    c.moveTo(x - r * 0.7, y); c.quadraticCurveTo(x, y, x, y - r * 0.25); c.quadraticCurveTo(x, y, x + r * 0.7, y);
    c.quadraticCurveTo(x, y, x, y + r * 0.25); c.quadraticCurveTo(x, y, x - r * 0.7, y); c.fill();
    c.restore();
  }
  L.sparkle = sparkle;

  // ================================================================== HAIR — BACK
  const HB = L.HB = {};
  // short messy nape
  HB.nape = (c, S, o = {}) => {
    const K = S.K;
    K.mass(c, (c) => {
      c.beginPath(); c.moveTo(-30, -104);
      c.bezierCurveTo(-94, -96, -96, -10, -78, 40); c.lineTo(-56, 52); c.lineTo(58, 10);
      c.bezierCurveTo(82, -60, 50, -110, -30, -104); c.closePath();
    });
    const n = o.len || 1;
    K.lock(c, scl([-72, -10, -88, 24, -86, 58], n), 22);
    K.lock(c, scl([-62, 0, -72, 36, -64, 68], n), 18);
    K.lock(c, scl([-50, 10, -54, 40, -46, 62], n), 14);
    if (o.flick) { K.lock(c, [-76, 0, -100, 20, -108, 44], 14, { p: 1 }); K.lock(c, [60, 0, 80, 20, 84, 44], 12, { p: 1 }); }
  };
  // long loose hair (len = head-local y of the tips; >= 190 runs off the bottom)
  HB.long = (c, S, o = {}) => {
    const K = S.K, Ln = o.len || 210, w = o.w || 1, wf = o.wf || 1;
    const end = Math.min(Ln, 200);
    K.mass(c, (c) => {
      c.beginPath(); c.moveTo(-30, -104);
      c.bezierCurveTo(-92 * w, -98, -102 * w, -20, -94 * w, 40);
      c.bezierCurveTo(-90 * w, 90, -88 * w, end - 50, -98 * w, end);
      c.lineTo(72 * wf, end); c.bezierCurveTo(76 * wf, end - 50, 72 * wf, 80, 70, 40);
      c.bezierCurveTo(84, -30, 60, -104, -30, -104); c.closePath();
    }, { y0: -100, y1: end });
    K.lock(c, [-66, -50, -102 * w, 20, -88 * w, end - 90, -104 * w, end], 34, { p: 0.35 });
    K.lock(c, [-50, -30, -76 * w, 60, -68 * w, end - 70, -82 * w, end], 26, { p: 0.4 });
    K.lock(c, [56, -40, 78 * wf, 30, 66 * wf, end - 90, 78 * wf, end], 26, { p: 0.4 });
    if (Ln < 190) { // tapered tips along the bottom edge
      const r = rng(5);
      for (let x = -98 * w; x <= 70 * wf; x += 21) {
        K.lock(c, [x + 6, end - 40, x + 4, end, x + (r() - 0.5) * 10, end + 22 + r() * 14], 26, { p: 0.9, strands: 1 });
      }
    }
  };
  // ethereal floating hair that drifts sideways & fades into light
  HB.float = (c, S, o = {}) => {
    const K = S.K, H = S.hair;
    const tip = o.tip || 'rgba(200,240,255,0)';
    K.mass(c, (c) => {
      c.beginPath(); c.moveTo(-30, -104);
      c.bezierCurveTo(-96, -100, -110, -20, -104, 40); c.lineTo(76, 40);
      c.bezierCurveTo(84, -30, 60, -104, -30, -104); c.closePath();
    }, { y0: -100, y1: 60 });
    const locks = [
      [[-60, -40, -130, 10, -110, 90, -150, 170], 46], [[-50, -20, -100, 60, -86, 120, -120, 200], 40],
      [[-70, -60, -150, -50, -150, 30, -148, 90], 30], [[56, -40, 100, 10, 90, 80, 120, 150], 34],
      [[50, -20, 74, 60, 70, 130, 96, 200], 30], [[-40, 0, -64, 80, -50, 140, -70, 200], 36],
    ];
    for (const [sp, w] of locks) K.lock(c, sp, w, { p: 0.55, bulge: 0.4, tipCol: tip, strands: 3 });
  };
  // high ponytail (Hongying canon)
  HB.ponyHigh = (c, S, o = {}) => {
    const K = S.K, k = o.len || 1;
    K.mass(c, (c) => {
      c.beginPath(); c.moveTo(-30, -104);
      c.bezierCurveTo(-94, -96, -96, -10, -80, 30); c.lineTo(-50, 40); c.lineTo(58, 0);
      c.bezierCurveTo(82, -60, 50, -110, -30, -104); c.closePath();
    });
    const tc = o.tip ? { tipCol: o.tip, tipLight: 0 } : {};
    K.lock(c, scl([-40, -112, -110, -120, -116, -20, -104, 130], k), 46 * (o.vol || 1), Object.assign({ p: 0.7, bulge: 0.4, strands: 4 }, tc));
    K.lock(c, scl([-44, -110, -96, -100, -88, -10, -74, 110], k), 30 * (o.vol || 1), Object.assign({ p: 0.8, strands: 3 }, tc));
    K.lock(c, scl([-46, -114, -128, -90, -130, 20, -126, 90], k), 22 * (o.vol || 1), Object.assign({ p: 0.9 }, tc));
    if (o.ribbon) {
      for (const [sp1, w, col] of [[[-40, -112, -80, -90, -66, -10, -88, 80], 10, o.ribbon], [[-40, -112, -60, -80, -40, 0, -50, 60], 9, U.shade(o.ribbon, -0.15)]]) {
        ribbonPath(c, sp1, w, { p: 0.15, bulge: 0.1, w0: 1 });
        c.fillStyle = col; c.fill(); c.strokeStyle = U.shade(o.ribbon, -0.6); c.lineWidth = 1.1; c.stroke();
      }
    }
  };
  // twin high tails
  HB.twinTails = (c, S, o = {}) => {
    const K = S.K;
    HB.nape(c, S, { len: 0.8 });
    K.lock(c, [-56, -96, -124, -96, -120, 0, -120, 120], 34, { p: 0.65, bulge: 0.5, strands: 3 });
    K.lock(c, [-58, -94, -100, -70, -96, 20, -92, 90], 20, { p: 0.8 });
    K.lock(c, [50, -100, 110, -100, 108, -10, 112, 100], 28, { p: 0.65, bulge: 0.5, strands: 3 });
  };
  // low ponytail falling behind the near shoulder
  HB.ponyLow = (c, S, o = {}) => {
    const K = S.K;
    HB.nape(c, S, { len: 0.6 });
    K.lock(c, [-62, 36, -96, 80, -86, 140, -100, 200], 34 * (o.vol || 1), { p: 0.5, bulge: 0.3, strands: 3 });
    K.lock(c, [-58, 40, -78, 90, -70, 150, -80, 200], 22 * (o.vol || 1), { p: 0.6 });
    if (o.tie) { c.fillStyle = o.tie; c.strokeStyle = U.shade(o.tie, -0.5); c.lineWidth = 1; ell(c, -64, 40, 9, 5, 0.5); c.fill(); c.stroke(); }
  };
  // chin-to-shoulder bob
  HB.bob = (c, S, o = {}) => {
    const K = S.K, y = o.len || 60;
    K.mass(c, (c) => {
      c.beginPath(); c.moveTo(-30, -104);
      c.bezierCurveTo(-98, -100, -104, -10, -96, y - 10); c.quadraticCurveTo(-88, y + 12, -60, y + 6);
      c.lineTo(52, y); c.quadraticCurveTo(78, y + 6, 78, y - 14);
      c.bezierCurveTo(82, -30, 64, -104, -30, -104); c.closePath();
    }, { y0: -100, y1: y + 10 });
  };
  // braid (generic): spine bezier, width
  L.braid = (c, S, spn, w, o = {}) => {
    const H = S.hair;
    const pts = sample(spn, 40);
    const n = o.n || 9;
    const seg = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, idx = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
      const a = pts[idx], b = pts[idx + 1];
      seg.push({ x: a[0], y: a[1], ang: Math.atan2(b[1] - a[1], b[0] - a[0]), w: w * (1 - t * 0.45) });
    }
    // alternating lobes, drawn bottom-up so each upper lobe overlaps the one below
    for (let i = seg.length - 1; i >= 0; i--) {
      const s = seg[i], side = i % 2 ? 1 : -1;
      const nx = -Math.sin(s.ang), ny = Math.cos(s.ang);
      const cx = s.x + nx * side * s.w * 0.2, cy = s.y + ny * side * s.w * 0.2;
      c.save(); c.translate(cx, cy); c.rotate(s.ang + side * 0.55);
      const rx = s.w * 0.62, ry = s.w * 0.36;
      c.beginPath(); c.moveTo(-rx, 0); c.quadraticCurveTo(-rx * 0.2, -ry * 1.5, rx, -ry * 0.1); c.quadraticCurveTo(-rx * 0.1, ry * 1.4, -rx, 0); c.closePath();
      const g = c.createLinearGradient(0, -ry, 0, ry);
      g.addColorStop(0, U.mix(H.base, H.light, 0.35)); g.addColorStop(0.55, H.base); g.addColorStop(1, H.dark);
      c.fillStyle = g; c.fill(); c.strokeStyle = H.line; c.lineWidth = 1.1; c.stroke();
      c.strokeStyle = U.rgba(H.light, 0.55); c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(-rx * 0.6, -ry * 0.2); c.quadraticCurveTo(0, -ry * 0.75, rx * 0.6, -ry * 0.2); c.stroke();
      c.strokeStyle = U.rgba(H.line, 0.45);
      c.beginPath(); c.moveTo(-rx * 0.5, ry * 0.25); c.quadraticCurveTo(0, ry * 0.5, rx * 0.5, 0); c.stroke();
      c.restore();
    }
    const e = pts[pts.length - 1];
    if (o.tie) {
      c.fillStyle = o.tie; c.strokeStyle = U.shade(o.tie, -0.5); c.lineWidth = 1;
      const s = seg[seg.length - 1];
      ell(c, s.x + Math.cos(s.ang) * s.w * 0.6, s.y + Math.sin(s.ang) * s.w * 0.6, s.w * 0.55, s.w * 0.3, s.ang + Math.PI / 2); c.fill(); c.stroke();
    }
    // tuft
    const s = seg[seg.length - 1];
    const bx = s.x + Math.cos(s.ang) * s.w * 0.8, by = s.y + Math.sin(s.ang) * s.w * 0.8;
    S.K.lock(c, [bx, by, bx + Math.cos(s.ang) * 14, by + Math.sin(s.ang) * 14, e[0] + Math.cos(s.ang) * 22, e[1] + Math.sin(s.ang) * 26], s.w * 0.9, { p: 0.7, strands: 1 });
  };
  HB.braid = (c, S, o = {}) => {
    HB.nape(c, S, { len: 0.7 });
    L.braid(c, S, o.spine || [-58, 30, -92, 80, -80, 140, -96, 200], o.w || 26, { tie: o.tie, n: 9 });
  };

  // ================================================================== HAIR — FRONT
  const HF = L.HF = {};
  HF.cap = (c, S, o = {}) => {
    const K = S.K;
    if (o.mode === 'smooth') {
      K.mass(c, (c) => {
        c.beginPath(); c.moveTo(-68, 30);
        c.bezierCurveTo(-86, -30, -80, -98, -18, -110);
        c.bezierCurveTo(38, -118, 80, -84, 70, -24); c.lineTo(64, 0);
        c.quadraticCurveTo(20, o.hl || -66, -58, -30); c.lineTo(-62, 30); c.closePath();
      }, { y0: -110, y1: 40, top: S.hair.base, bot: S.hair.base });
    } else K.cap(c, Object.assign({ top: -112 }, o));
  };
  // bang sets
  const BANGS = {
    messy: [
      [[-52, -78, -84, -44, -74, 8], 26], [[-40, -86, -60, -54, -56, -22], 26], [[-26, -92, -34, -56, -38, -24], 24],
      [[-12, -94, -12, -60, -20, -22], 24], [[0, -96, 10, -56, 6, -6], 22], [[10, -94, 22, -60, 16, 2], 18],
      [[20, -92, 38, -60, 38, -22], 24], [[32, -88, 58, -58, 58, -22], 24], [[44, -80, 70, -46, 70, -4], 20],
    ],
    sharp: [
      [[-50, -80, -82, -46, -72, 16], 24], [[-38, -88, -58, -56, -54, -22], 26], [[-24, -92, -34, -58, -34, -26], 24],
      [[-8, -96, -6, -60, -14, -24], 22], [[4, -96, 16, -56, 12, 8], 20], [[16, -94, 34, -60, 34, -22], 24],
      [[30, -88, 54, -58, 54, -20], 24], [[44, -80, 70, -46, 66, 6], 20],
    ],
    soft: [
      [[-46, -82, -80, -48, -70, 10], 26], [[-36, -88, -56, -54, -50, -18], 26], [[-20, -92, -30, -56, -28, -22], 26],
      [[-6, -94, -6, -56, -12, -20], 22], [[2, -94, 14, -50, 10, 6], 22], [[14, -92, 30, -54, 30, -20], 24],
      [[28, -88, 50, -54, 50, -18], 24], [[42, -82, 66, -44, 64, 0], 22],
    ],
    center: [
      [[-2, -100, -30, -98, -56, -60, -70, -10], 34], [[-4, -98, -40, -84, -60, -30, -66, 30], 22],
      [[-2, -100, -16, -80, -28, -50, -36, -22], 18], [[4, -100, 30, -98, 52, -64, 64, -16], 30],
      [[6, -100, 40, -86, 60, -36, 66, 24], 20], [[4, -100, 18, -78, 26, -52, 30, -26], 16],
    ],
    // swept toward the far side from a part on the near side
    side: [
      [[-40, -96, -70, -70, -76, -20], 26], [[-36, -98, -20, -80, 0, -40, 14, -18], 30], [[-30, -100, 0, -90, 30, -56, 46, -24], 30],
      [[-24, -102, 20, -98, 50, -70, 66, -30], 28], [[-20, -104, 30, -104, 64, -80, 72, -40], 22], [[-38, -98, -50, -60, -54, -30], 18],
    ],
    // curtain + long lock falling over the far eye
    veil: [
      [[-40, -96, -70, -70, -76, -20], 26], [[-38, -98, -50, -60, -54, -26], 20], [[-32, -100, -14, -76, 2, -40, 8, 4], 26],
      [[-26, -102, 10, -92, 36, -50, 42, 14], 30], [[-20, -104, 30, -102, 60, -70, 68, -20], 26],
    ],
    // swept back (forehead shows) with a few loose strands
    back: [
      [[-30, -76, -60, -100, -80, -86, -84, -50], 26], [[-10, -80, -30, -112, -60, -112, -76, -84], 28],
      [[14, -78, 0, -110, -30, -118, -56, -104], 26], [[34, -70, 30, -104, 0, -118, -30, -116], 22],
    ],
  };
  HF.bangs = (c, S, set, o = {}) => {
    const K = S.K, k = o.len || 1;
    const list = BANGS[set];
    const base = { p: o.p != null ? o.p : (set === 'center' || set === 'side' || set === 'veil' || set === 'back' ? 1 : 1.0), bulge: 0.3, rootDark: 0.15 };
    if (o.tip) { base.tipCol = o.tip; base.tipLight = 0; }
    for (const [sp, w] of list) K.lock(c, k === 1 ? sp : scl(sp, k), w * (o.w || 1), base);
    if (set === 'soft') {
      K.lock(c, [-30, -96, 0, -76, 22, -40, 36, -14], 18, { p: 1, bulge: 0.2, rootDark: 0.1 });
      K.lock(c, [-30, -96, -50, -70, -58, -40, -62, -10], 14, { p: 1, rootDark: 0.1 });
    }
    if (set === 'back') {
      K.lock(c, [-6, -82, 4, -50, -4, -20, 6, 6], 8, { p: 1, strands: false });
      K.lock(c, [20, -78, 34, -50, 30, -26, 38, -6], 7, { p: 1, strands: false });
    }
  };
  // blunt straight-cut fringe
  HF.blunt = (c, S, o = {}) => {
    const K = S.K, y = o.y || -34;
    K.mass(c, (c) => {
      c.beginPath(); c.moveTo(-66, -10);
      c.bezierCurveTo(-74, -70, -40, -102, 0, -102); c.bezierCurveTo(44, -102, 72, -70, 66, -14);
      c.lineTo(62, y + 4);
      for (let i = 0; i <= 10; i++) { const x = U.lerp(60, -60, i / 10); c.lineTo(x + 3, y + 2 + (i % 2) * 3 + Math.sin(i) * 1.5); }
      c.lineTo(-62, -10); c.closePath();
    }, { y0: -110, y1: y, top: S.hair.base, bot: U.mix(S.hair.base, S.hair.dark, 0.3) });
    c.save(); c.strokeStyle = U.rgba(S.hair.line, 0.4); c.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const x = U.lerp(-54, 58, i / 11); c.beginPath(); c.moveTo(x * 0.6, -96); c.quadraticCurveTo(x * 0.95, -70, x, y + 2); c.stroke(); }
    c.restore();
  };
  HF.sideLocks = (c, S, o = {}) => {
    const K = S.K, n = o.near != null ? o.near : 1, f = o.far != null ? o.far : 1, w = o.w || 1;
    const tc = o.tip ? { tipCol: o.tip, tipLight: 0 } : {};
    if (n > 0) {
      K.lock(c, scl([-58, -50, -82, 20, -62, 90, -76, 172], n), 28 * w, Object.assign({ p: 0.75, strands: 3 }, tc));
      K.lock(c, scl([-50, -40, -64, 40, -48, 100, -58, 150], n), 16 * w, Object.assign({ p: 0.8 }, tc));
    }
    if (f > 0) K.lock(c, scl([60, -44, 74, 20, 68, 80, 74, 142], f), 20 * w, Object.assign({ p: 0.8, strands: 3 }, tc));
  };
  HF.sideburn = (c, S) => S.K.lock(c, [-58, -24, -66, 8, -56, 24], 14);
  // crown pieces
  HF.topknot = (c, S, o = {}) => {
    const K = S.K;
    K.lock(c, [-18, -100, -30, -126, -12, -140], 22, { p: 0.7, bulge: 0.5 });
    K.lock(c, [-14, -104, 4, -128, 20, -128], 16, { p: 0.8 });
    K.lock(c, [-22, -102, -46, -118, -54, -104], 13, { p: 0.9 });
  };
  HF.bun = (c, S, o = {}) => {
    const K = S.K, x = o.x || -10, y = o.y || -120, r = o.r || 1;
    K.lock(c, [x - 4, y + 16, x - 16 * r, y - 14 * r, x + 12 * r, y - 18 * r], 34 * r, { p: 0.4, bulge: 0.7, strands: 3 });
  };
  HF.twinBuns = (c, S, o = {}) => {
    const K = S.K, r = o.r || 1;
    for (const [x, y] of [[-52, -96], [40, -104]]) {
      c.save(); c.translate(x, y);
      K.mass(c, (c) => { ell(c, 0, 0, 22 * r, 20 * r); }, { y0: -20, y1: 20 });
      c.strokeStyle = U.rgba(S.hair.line, 0.45); c.lineWidth = 1;
      for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, 2, (6 + k * 4) * r, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      c.restore();
    }
  };
  // two hair loops (雙環髻) standing up on the crown
  HF.loops = (c, S, o = {}) => {
    const K = S.K, s = o.s || 1;
    // each loop = a lock that leaves the crown, arcs up and tucks back in (leaves a hole)
    for (const [x, y, d] of [[-40, -104, -1], [4, -110, 1]]) {
      // loop leans outward (d) and is wider than tall
      const sp = d < 0
        ? [x + 10, y, x - 44 * s, y - 10 * s, x - 50 * s, y - 56 * s, x - 6, y - 8]
        : [x - 6, y, x + 40 * s, y - 14 * s, x + 44 * s, y - 58 * s, x + 10, y - 8];
      K.lock(c, sp, 14 * s, { p: 0.15, bulge: 0.1, w0: 1, strands: 2, rootLine: 0 });
    }
    // knot at the base of the loops
    K.mass(c, (c) => { ell(c, -16, -106, 26, 12, -0.1); }, { y0: -118, y1: -94 });
  };

  // ================================================================== OUTFITS (body-local)
  const OF = L.OF = {};
  // cross-collar robe: o.col (+colL/colD/line), o.collar = [{col,line,w}...], o.X crossing point
  OF.robe = (c, S, o) => {
    S.robe(c, { sw: o.sw || 116, swf: o.swf || 102, y: o.y || 116, col: o.col, colL: o.colL, colD: o.colD, line: o.line });
    S.crossCollar(c, {
      L: o.L || [-24, 94], R: o.R || [28, 94], X: o.X || [4, 166],
      layers: o.collar, skin: true, trimW: o.trimW, flapDeco: o.flapDeco,
    });
  };
  // stand collar band
  function standCollar(c, col, line, h) {
    h = h || 9;
    c.beginPath();
    c.moveTo(-24, 98 - h); c.quadraticCurveTo(4, 104 - h, 30, 96 - h);
    c.lineTo(32, 98); c.quadraticCurveTo(4, 108, -26, 99); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1.3; c.stroke();
  }
  L.standCollar = standCollar;
  // frog button 盤扣
  function frog(c, x, y, a, col, s) {
    s = s || 1;
    c.save(); c.translate(x, y); c.rotate(a || 0); c.scale(s, s);
    c.strokeStyle = col; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-9, 0); c.lineTo(9, 0); c.stroke();
    c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(-8, 0, 4, 2.6, 0, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(8, 0, 4, 2.6, 0, 0, TAU); c.stroke();
    c.fillStyle = col; ell(c, 0, 0, 2.3, 2.3); c.fill();
    c.restore();
  }
  L.frog = frog;
  // 大裪衫 / 大襟 short jacket: right-lapped curved opening running to the near armpit
  OF.daJin = (c, S, o) => {
    S.robe(c, { sw: o.sw || 116, swf: o.swf || 100, y: o.y || 118, col: o.col, colL: o.colL, colD: o.colD, line: o.line });
    const line = o.line || U.shade(o.col, -0.5);
    // under panel peeking (inner shirt) at the neck
    if (o.inner) {
      c.beginPath(); c.moveTo(-22, 96); c.quadraticCurveTo(4, 112, 30, 95); c.lineTo(30, 104); c.quadraticCurveTo(4, 118, -22, 104); c.closePath();
      c.fillStyle = o.inner; c.fill();
    }
    standCollar(c, o.collarCol || o.trim || U.shade(o.col, -0.25), line, o.collarH);
    // the 襟 curve + trim
    const trim = o.trim || U.shade(o.col, -0.3), tw = o.trimW || 7;
    const path = () => { c.beginPath(); c.moveTo(6, 104); c.bezierCurveTo(-14, 112, -46, 112, -62, 128); c.bezierCurveTo(-70, 140, -70, 170, -68, 200); };
    path(); c.strokeStyle = line; c.lineWidth = tw + 2.6; c.stroke();
    path(); c.strokeStyle = trim; c.lineWidth = tw; c.stroke();
    if (o.trim2) { path(); c.strokeStyle = o.trim2; c.lineWidth = 1.6; c.stroke(); }
    // hem trim of the sleeve shoulder seam
    c.strokeStyle = U.rgba(line, 0.5); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-98, 126); c.quadraticCurveTo(-88, 160, -94, 200); c.stroke();
    c.beginPath(); c.moveTo(82, 128); c.quadraticCurveTo(78, 160, 84, 200); c.stroke();
    const fc = o.frog || trim;
    if (o.frogs !== false) {
      frog(c, 4, 102, 0.1, fc, 0.9);
      frog(c, -40, 114, -0.15, fc);
      frog(c, -66, 146, 1.4, fc);
      frog(c, -68, 176, 1.5, fc);
    }
  };
  // 對襟 centre-front jacket
  OF.duiJin = (c, S, o) => {
    S.robe(c, { sw: o.sw || 116, swf: o.swf || 100, y: o.y || 118, col: o.col, colL: o.colL, colD: o.colD, line: o.line });
    const line = o.line || U.shade(o.col, -0.5), trim = o.trim || U.shade(o.col, -0.3), tw = o.trimW || 6;
    if (o.inner) {
      c.beginPath(); c.moveTo(-14, 98); c.lineTo(22, 98); c.lineTo(10, 200); c.lineTo(-2, 200); c.closePath();
      c.fillStyle = o.inner; c.fill();
    }
    standCollar(c, o.collarCol || trim, line, o.collarH);
    for (const [x0, x1] of [[-2, -8], [14, 18]]) {
      c.beginPath(); c.moveTo(x0 + 2, 104); c.quadraticCurveTo(x0, 150, x1, 200);
      c.strokeStyle = line; c.lineWidth = tw + 2.4; c.stroke(); c.strokeStyle = trim; c.lineWidth = tw; c.stroke();
    }
    if (o.open) return;
    const fc = o.frog || '#d8b25a';
    for (let k = 0; k < 4; k++) frog(c, 6 + k * 0.6, 112 + k * 24, 0, fc, 0.95);
  };
  // 褙子 open long jacket with straight front bands over a cross-collar inner
  OF.beizi = (c, S, o) => {
    S.robe(c, { sw: o.sw || 106, swf: o.swf || 94, y: o.y || 120, col: o.col, colL: o.colL, colD: o.colD, line: o.line, nl: -20, nr: 24 });
    S.crossCollar(c, { L: [-18, 94], R: [22, 94], X: [4, 150], layers: o.inner, skin: true, trimW: 6 });
    for (const [x0, x1, dir] of [[-30, -46, -1], [32, 50, 1]]) {
      c.beginPath();
      c.moveTo(x0, 96); c.bezierCurveTo(x0 + dir * 4, 130, x1, 160, x1 - dir * 2, 200);
      c.lineTo(x1 + dir * 14, 200); c.bezierCurveTo(x1 + dir * 14, 160, x0 + dir * 16, 128, x0 + dir * 12, 98);
      c.closePath();
      c.fillStyle = o.band; c.fill(); c.strokeStyle = o.bandLine || U.shade(o.band, -0.4); c.lineWidth = 1.3; c.stroke();
      if (o.emb) {
        c.strokeStyle = o.emb; c.lineWidth = 1.1;
        for (let k = 0; k < 5; k++) {
          const yy = 110 + k * 18, xx = U.lerp(x0, x1, (yy - 94) / 106) + dir * 6;
          c.beginPath(); c.arc(xx, yy, 3.2, Math.PI * 0.9, Math.PI * 2.1); c.stroke();
          c.beginPath(); c.arc(xx + dir * 3, yy + 6, 2, Math.PI, Math.PI * 2); c.stroke();
        }
      }
    }
  };
  // wave embroidery on shoulders
  OF.waves = (c, col, y0) => {
    c.strokeStyle = col; c.lineWidth = 1.2;
    for (let k = 0; k < 6; k++) {
      c.beginPath(); c.arc(-100 + k * 9, (y0 || 150) + (k % 2) * 4, 5, Math.PI, TAU); c.stroke();
      c.beginPath(); c.arc(62 + k * 8, (y0 || 150) + 6 + (k % 2) * 4, 4, Math.PI, TAU); c.stroke();
    }
  };
  // leather vest panels
  OF.vest = (c, S, o) => {
    for (const side of [-1, 1]) {
      c.beginPath();
      if (side < 0) { c.moveTo(-58, 112); c.bezierCurveTo(-74, 112, -96, 120, -98, 132); c.lineTo(-92, 200); c.lineTo(-26, 200); c.bezierCurveTo(-34, 170, -40, 140, -38, 116); }
      else { c.moveTo(48, 108); c.bezierCurveTo(62, 110, 80, 118, 84, 130); c.lineTo(82, 200); c.lineTo(34, 200); c.bezierCurveTo(30, 170, 30, 140, 36, 112); }
      c.closePath();
      const g = c.createLinearGradient(-100, 110, 90, 200);
      g.addColorStop(0, o.colL || U.shade(o.col, 0.15)); g.addColorStop(1, o.col);
      c.fillStyle = g; c.fill(); c.strokeStyle = o.line || '#000'; c.lineWidth = 1.4; c.stroke();
      c.setLineDash([2.5, 2.5]); c.strokeStyle = o.stitch || 'rgba(200,170,130,0.55)'; c.lineWidth = 0.9;
      c.beginPath();
      if (side < 0) { c.moveTo(-40, 120); c.bezierCurveTo(-42, 140, -36, 170, -30, 198); } else { c.moveTo(39, 116); c.bezierCurveTo(34, 140, 34, 170, 38, 198); }
      c.stroke(); c.setLineDash([]);
    }
    if (o.studs) {
      c.fillStyle = o.studs;
      for (const [x, y] of [[-44, 150], [-42, 172], [40, 150], [40, 172]]) { ell(c, x, y, 2, 2); c.fill(); }
    }
  };
  // 雲肩 four-lobed cloud collar
  OF.yunjian = (c, S, o) => {
    const col = o.col, line = o.line || U.shade(col, -0.45), tr = o.trim || '#d8b25a';
    const shape = () => {
      c.beginPath();
      c.moveTo(-26, 96);
      // near lobe (big), front lobe, far lobe
      c.bezierCurveTo(-60, 96, -112, 104, -118, 128);
      c.bezierCurveTo(-122, 146, -100, 150, -96, 140);
      c.bezierCurveTo(-96, 162, -72, 170, -64, 156);
      c.bezierCurveTo(-56, 176, -30, 178, -22, 160);
      c.bezierCurveTo(-14, 186, 20, 186, 22, 160);
      c.bezierCurveTo(32, 176, 54, 170, 56, 152);
      c.bezierCurveTo(70, 160, 92, 150, 86, 132);
      c.bezierCurveTo(100, 132, 104, 112, 92, 108);
      c.bezierCurveTo(70, 98, 50, 96, 30, 95);
      c.quadraticCurveTo(4, 110, -26, 96); c.closePath();
    };
    shape();
    const g = c.createLinearGradient(0, 96, 0, 180); g.addColorStop(0, o.colL || U.shade(col, 0.2)); g.addColorStop(1, col);
    c.fillStyle = g; c.fill(); c.strokeStyle = line; c.lineWidth = 1.5; c.stroke();
    c.save(); shape(); c.clip();
    c.strokeStyle = tr; c.lineWidth = 2.2;
    c.save(); c.translate(0, -6); c.scale(0.9, 0.9); c.translate(0, 14); shape(); c.restore(); c.stroke();
    // ruyi swirls
    c.lineWidth = 1.2; c.strokeStyle = U.rgba(o.emb || tr, 0.9);
    for (const [x, y, s] of [[-88, 136, 1], [-44, 156, 1], [2, 164, 1.1], [44, 150, 0.9], [76, 128, 0.8]]) {
      c.beginPath(); c.arc(x, y, 6 * s, Math.PI * 0.2, Math.PI * 1.7); c.stroke();
      c.beginPath(); c.arc(x - 2 * s, y - 1 * s, 2.5 * s, 0, TAU); c.stroke();
    }
    c.restore();
    if (o.tassels) {
      for (const [x, y] of [[-96, 142], [-64, 160], [-22, 164], [22, 164], [56, 156]]) {
        c.strokeStyle = o.tassels; c.lineWidth = 1.4;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + k * 1.5, y + 16); c.stroke(); }
        c.fillStyle = tr; ell(c, x, y + 1, 2.4, 2.4); c.fill();
      }
    }
  };
  // armour: layered pauldron on the near shoulder + chest mirror
  OF.armor = (c, S, o) => {
    const m = o.metal || '#9aa3b0', mL = U.shade(m, 0.35), mD = U.shade(m, -0.4), line = o.line || '#2a2e36';
    for (let k = 2; k >= 0; k--) {
      const oy = k * 13, ox = -k * 3;
      c.beginPath();
      c.moveTo(-58 + ox, 106 + oy); c.quadraticCurveTo(-102 + ox, 100 + oy, -128 + ox, 126 + oy);
      c.lineTo(-130 + ox, 142 + oy); c.quadraticCurveTo(-102 + ox, 118 + oy, -58 + ox, 122 + oy); c.closePath();
      const g = c.createLinearGradient(0, 100 + oy, 0, 142 + oy); g.addColorStop(0, mL); g.addColorStop(0.6, m); g.addColorStop(1, mD);
      c.fillStyle = g; c.fill(); c.strokeStyle = line; c.lineWidth = 1.3; c.stroke();
      if (o.edge) { c.strokeStyle = o.edge; c.lineWidth = 2; c.beginPath(); c.moveTo(-128 + ox, 140 + oy); c.quadraticCurveTo(-102 + ox, 117 + oy, -60 + ox, 121 + oy); c.stroke(); }
      c.fillStyle = o.edge || mL;
      for (const [rx, ry] of [[-74, 114], [-96, 114], [-116, 124]]) { ell(c, rx + ox, ry + oy, 1.8, 1.8); c.fill(); }
    }
    // far shoulder small plate
    c.save(); c.translate(80, 124);
    c.beginPath(); c.moveTo(-26, -6); c.quadraticCurveTo(0, -20, 22, 2); c.lineTo(20, 14); c.quadraticCurveTo(0, 2, -24, 8); c.closePath();
    const g2 = c.createLinearGradient(0, -18, 0, 14); g2.addColorStop(0, mL); g2.addColorStop(1, mD);
    c.fillStyle = g2; c.fill(); c.strokeStyle = line; c.lineWidth = 1.2; c.stroke();
    c.restore();
    if (o.mirror) {
      const x = o.mx || -18, y = o.my || 166;
      c.strokeStyle = o.strap || '#3a2a22'; c.lineWidth = 5;
      c.beginPath(); c.moveTo(x - 16, y - 8); c.lineTo(-70, 120); c.stroke();
      c.beginPath(); c.moveTo(x + 16, y - 8); c.lineTo(50, 112); c.stroke();
      ell(c, x, y, 18, 18); const gm = c.createRadialGradient(x - 6, y - 6, 2, x, y, 18);
      gm.addColorStop(0, '#ffffff'); gm.addColorStop(0.4, mL); gm.addColorStop(1, mD);
      c.fillStyle = gm; c.fill(); c.strokeStyle = o.edge || '#c9a24a'; c.lineWidth = 3; c.stroke();
      c.strokeStyle = line; c.lineWidth = 1; ell(c, x, y, 19.5, 19.5); c.stroke();
    }
  };
  // cape: back drape (call from behind) and front edges + clasp (call from body after outfit)
  OF.capeBack = (c, o) => {
    c.beginPath(); c.moveTo(-130, 200); c.bezierCurveTo(-140, 150, -120, 110, -60, 100); c.lineTo(60, 98);
    c.bezierCurveTo(110, 104, 130, 150, 122, 200); c.closePath();
    const g = c.createLinearGradient(-130, 0, 130, 0); g.addColorStop(0, U.shade(o.col, 0.1)); g.addColorStop(1, U.shade(o.col, -0.35));
    c.fillStyle = g; c.fill(); c.strokeStyle = U.shade(o.col, -0.6); c.lineWidth = 1.4; c.stroke();
    if (o.lining) { c.fillStyle = o.lining; c.beginPath(); c.moveTo(-128, 200); c.bezierCurveTo(-134, 170, -126, 140, -114, 128); c.lineTo(-108, 200); c.closePath(); c.fill(); }
  };
  OF.capeFront = (c, o) => {
    const col = o.col, line = U.shade(col, -0.6);
    for (const side of [-1, 1]) {
      c.beginPath();
      if (side < 0) { c.moveTo(-40, 100); c.bezierCurveTo(-80, 104, -118, 112, -124, 140); c.lineTo(-128, 200); c.lineTo(-96, 200); c.bezierCurveTo(-92, 160, -70, 130, -38, 112); }
      else { c.moveTo(44, 98); c.bezierCurveTo(80, 102, 106, 114, 112, 140); c.lineTo(118, 200); c.lineTo(90, 200); c.bezierCurveTo(86, 160, 72, 126, 46, 110); }
      c.closePath();
      const g = c.createLinearGradient(0, 96, 0, 200); g.addColorStop(0, U.shade(col, 0.15)); g.addColorStop(1, U.shade(col, -0.2));
      c.fillStyle = g; c.fill(); c.strokeStyle = line; c.lineWidth = 1.4; c.stroke();
      if (o.trim) {
        c.strokeStyle = o.trim; c.lineWidth = 2.4; c.beginPath();
        if (side < 0) { c.moveTo(-96, 200); c.bezierCurveTo(-92, 160, -70, 130, -38, 112); } else { c.moveTo(90, 200); c.bezierCurveTo(86, 160, 72, 126, 46, 110); }
        c.stroke();
      }
    }
    if (o.fur) { // fur collar
      const r = rng(11);
      c.fillStyle = o.fur; c.strokeStyle = U.shade(o.fur, -0.35); c.lineWidth = 1;
      for (let k = 0; k < 16; k++) {
        const t = k / 15, x = U.lerp(-100, 96, t), y = 112 - Math.sin(t * Math.PI) * 14 + r() * 6;
        ell(c, x, y, 14 + r() * 4, 9 + r() * 3, r()); c.fill(); c.stroke();
      }
    }
    if (o.clasp) {
      c.strokeStyle = o.clasp; c.lineWidth = 2; c.beginPath(); c.moveTo(-36, 112); c.quadraticCurveTo(4, 124, 46, 110); c.stroke();
      c.fillStyle = o.clasp; ell(c, -36, 112, 4.5, 4.5); c.fill(); ell(c, 46, 110, 4.5, 4.5); c.fill();
    }
  };
  // diagonal strap (sword / satchel)
  OF.strap = (c, o) => {
    const col = o.col || '#5a3a26', line = o.line || U.shade(col, -0.55);
    c.fillStyle = col; c.strokeStyle = line; c.lineWidth = 1.2;
    if (o.dir === 'near') { c.beginPath(); c.moveTo(-70, 114); c.lineTo(-58, 110); c.lineTo(36, 200); c.lineTo(18, 200); c.closePath(); }
    else { c.beginPath(); c.moveTo(66, 118); c.lineTo(78, 124); c.lineTo(-6, 200); c.lineTo(-22, 200); c.closePath(); }
    c.fill(); c.stroke();
    if (o.studs) { c.fillStyle = o.studs; const pts = o.dir === 'near' ? [[-40, 132], [-10, 160], [14, 184]] : [[50, 140], [26, 162], [2, 184]]; for (const [x, y] of pts) { ell(c, x, y, 2.2, 2.2); c.fill(); } }
  };
  // sash / belt across the bottom
  OF.sash = (c, o) => {
    c.beginPath(); c.moveTo(-120, 180); c.quadraticCurveTo(0, 190, 110, 178); c.lineTo(112, 200); c.lineTo(-120, 200); c.closePath();
    c.fillStyle = o.col; c.fill(); c.strokeStyle = U.shade(o.col, -0.5); c.lineWidth = 1.2; c.stroke();
    if (o.trim) { c.strokeStyle = o.trim; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-120, 184); c.quadraticCurveTo(0, 194, 110, 182); c.stroke(); }
  };
  // neckerchief / scarf
  OF.scarf = (c, o) => {
    const col = o.col, line = U.shade(col, -0.5);
    c.beginPath(); c.moveTo(-34, 96); c.quadraticCurveTo(4, 120, 40, 94); c.lineTo(46, 108); c.quadraticCurveTo(4, 136, -40, 108); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1.3; c.stroke();
    // knot + tails
    c.beginPath(); ell(c, -14, 124, 9, 7, 0.3); c.fillStyle = U.shade(col, -0.1); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-18, 128); c.quadraticCurveTo(-34, 150, -30, 176); c.lineTo(-20, 172); c.quadraticCurveTo(-20, 150, -10, 130); c.closePath(); c.fillStyle = col; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-10, 128); c.quadraticCurveTo(0, 150, 6, 168); c.lineTo(14, 160); c.quadraticCurveTo(6, 146, -4, 126); c.closePath(); c.fill(); c.stroke();
    if (o.pattern) { c.fillStyle = o.pattern; for (const [x, y] of [[-24, 108], [-6, 116], [14, 112], [30, 104], [-26, 156], [6, 152]]) { ell(c, x, y, 1.8, 1.8); c.fill(); } }
  };
  // apron straps / bib (workshop apprentice)
  OF.apron = (c, o) => {
    const col = o.col, line = U.shade(col, -0.5);
    c.fillStyle = col; c.strokeStyle = line; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-44, 110); c.lineTo(-34, 108); c.lineTo(-22, 150); c.lineTo(-34, 152); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(42, 106); c.lineTo(52, 108); c.lineTo(38, 150); c.lineTo(28, 150); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-40, 150); c.lineTo(44, 148); c.lineTo(52, 200); c.lineTo(-48, 200); c.closePath(); c.fill(); c.stroke();
    if (o.pocket) { c.strokeStyle = U.rgba(line, 0.8); c.setLineDash([2, 2]); c.strokeRect(-20, 166, 36, 22); c.setLineDash([]); }
    if (o.stains) { c.fillStyle = o.stains; for (const [x, y, r] of [[30, 172, 4], [36, 178, 2], [-30, 186, 3]]) { ell(c, x, y, r, r * 0.8); c.fill(); } }
  };
  // fold lines
  OF.folds = (c, col) => {
    c.strokeStyle = col; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(-96, 128); c.quadraticCurveTo(-86, 160, -92, 200); c.stroke();
    c.beginPath(); c.moveTo(-60, 150); c.quadraticCurveTo(-52, 170, -56, 196); c.stroke();
    c.beginPath(); c.moveTo(84, 134); c.quadraticCurveTo(80, 170, 88, 200); c.stroke();
  };
  // taiji emblem
  L.taiji = (c, x, y, r, light, dark, rimc) => {
    c.save(); c.translate(x, y);
    ell(c, 0, 0, r, r); c.fillStyle = light; c.fill(); c.strokeStyle = rimc || '#d8b04a'; c.lineWidth = 1.5; c.stroke();
    c.beginPath(); c.arc(0, 0, r, -Math.PI / 2, Math.PI / 2); c.arc(0, r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); c.arc(0, -r / 2, r / 2, Math.PI / 2, -Math.PI / 2, false); c.fillStyle = dark; c.fill();
    ell(c, 0, -r / 2, r * 0.16, r * 0.16); c.fill(); ell(c, 0, r / 2, r * 0.16, r * 0.16); c.fillStyle = light; c.fill();
    c.restore();
  };
  // bagua trigram band along a line
  L.trigrams = (c, x, y, col, s) => {
    c.save(); c.translate(x, y); c.scale(s || 1, s || 1); c.fillStyle = col;
    const tg = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1]];
    tg.forEach((t, i) => t.forEach((b, j) => { if (b) c.fillRect(i * 14, j * 4, 10, 2.4); else { c.fillRect(i * 14, j * 4, 4, 2.4); c.fillRect(i * 14 + 6, j * 4, 4, 2.4); } }));
    c.restore();
  };

  // ================================================================== ACCESSORIES
  const AC = L.AC = {};
  // paper lantern (hairpin / charm). x,y = top of lantern
  AC.lantern = (c, x, y, s, o = {}) => {
    s = s || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    const body = o.col || '#f05a3c', dk = o.dark || '#a8202a';
    if (o.glow !== false) glowDot(c, 0, 9, 22, o.glowCol || '#ffc070', 0.45);
    const lg = c.createRadialGradient(-1, 7, 1, 0, 8, 11);
    lg.addColorStop(0, o.core || '#ffe7a0'); lg.addColorStop(0.5, body); lg.addColorStop(1, dk);
    ell(c, 0, 8, 7, 8.5); c.fillStyle = lg; c.fill();
    c.strokeStyle = U.shade(dk, -0.4); c.lineWidth = 1.1; c.stroke();
    c.strokeStyle = U.rgba(U.shade(dk, -0.4), 0.5); c.lineWidth = 0.8;
    c.beginPath(); c.ellipse(0, 8, 3.5, 8.3, 0, 0, TAU); c.stroke();
    c.fillStyle = o.cap || '#d9a640'; c.fillRect(-4, -1.5, 8, 2.5); c.fillRect(-4, 16, 8, 2.5);
    c.strokeStyle = o.tassel || '#c33'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(0, 18); c.lineTo(0, 27); c.stroke();
    c.restore();
  };
  // a hairpin stick with lantern dangling
  AC.lanternPin = (c, x, y, s, o = {}) => {
    c.save(); c.strokeStyle = o.stick || '#7a3a20'; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 4, y + 2); c.lineTo(x + 18, y - 18); c.stroke();
    c.restore();
    AC.lantern(c, x, y, s, o);
  };
  // red cord wrapped around a lock at (x,y)
  AC.cordWrap = (c, x, y, col, ang) => {
    c.save(); c.translate(x, y); c.rotate(ang || 0);
    c.strokeStyle = col || '#d0283a'; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-9, -2); c.quadraticCurveTo(0, 2, 9, -2); c.stroke();
    c.beginPath(); c.moveTo(-9, 3); c.quadraticCurveTo(0, 7, 9, 3); c.stroke();
    c.beginPath(); c.moveTo(0, 5); c.quadraticCurveTo(-4, 16, 2, 26); c.stroke();
    c.restore();
  };
  // ribbon bow
  AC.bow = (c, x, y, col, s, tails) => {
    s = s || 1; const line = U.shade(col, -0.55);
    c.save(); c.translate(x, y); c.scale(s, s);
    if (tails) {
      for (const [sp, w] of [[[0, 0, -6, 20, 4, 40, -4, 58], 7], [[0, 0, 10, 18, 14, 36, 20, 50], 6]]) {
        ribbonPath(c, sp, w, { p: 0.1, bulge: 0.1, w0: 1 }); c.fillStyle = U.shade(col, -0.1); c.fill(); c.strokeStyle = line; c.lineWidth = 1; c.stroke();
      }
    }
    for (const [a, l] of [[-2.6, 16], [-0.5, 15]]) {
      c.beginPath(); c.moveTo(0, 0);
      c.quadraticCurveTo(Math.cos(a - 0.45) * l, Math.sin(a - 0.45) * l, Math.cos(a) * l, Math.sin(a) * l);
      c.quadraticCurveTo(Math.cos(a + 0.55) * l * 0.85, Math.sin(a + 0.55) * l * 0.85, 0, 0);
      c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1.1; c.stroke();
    }
    ell(c, 0, 0, 4.5, 4); c.fillStyle = U.shade(col, -0.2); c.fill(); c.stroke();
    c.restore();
  };
  // 彼岸花 spider lily
  AC.lily = (c, x, y, s, col) => {
    s = s || 1; col = col || '#e0283a';
    c.save(); c.translate(x, y); c.scale(s, s);
    glowDot(c, 0, 0, 22, col, 0.35);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      c.save(); c.rotate(a);
      c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(6, -3, 14, -2, 16, -8); c.bezierCurveTo(12, -4, 6, 2, 0, 1.5); c.closePath();
      c.fillStyle = col; c.fill(); c.strokeStyle = U.shade(col, -0.45); c.lineWidth = 0.7; c.stroke();
      // stamens
      c.strokeStyle = U.shade(col, 0.1); c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(14, 4, 22, -4); c.stroke();
      ell(c, 22, -4, 1.1, 1.1); c.fillStyle = '#ffd36a'; c.fill();
      c.restore();
    }
    ell(c, 0, 0, 3, 3); c.fillStyle = U.shade(col, -0.3); c.fill();
    c.restore();
  };
  // small flower (plum / jasmine)
  AC.flower = (c, x, y, r, col, core) => {
    c.save(); c.translate(x, y);
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU - Math.PI / 2; ell(c, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.55, r * 0.55); c.fillStyle = col; c.fill(); c.strokeStyle = U.shade(col, -0.35); c.lineWidth = 0.8; c.stroke(); }
    ell(c, 0, 0, r * 0.3, r * 0.3); c.fillStyle = core || '#ffd36a'; c.fill();
    c.restore();
  };
  // 抹額 headband across the forehead (drawn after front hair)
  AC.headband = (c, o) => {
    const col = o.col, y = o.y || -64, line = U.shade(col, -0.55);
    c.beginPath();
    c.moveTo(-70, y + 14); c.bezierCurveTo(-50, y - 10, 30, y - 16, 68, y + 6);
    c.lineTo(66, y + 15); c.bezierCurveTo(30, y - 6, -50, y, -68, y + 24); c.closePath();
    c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1.2; c.stroke();
    if (o.trim) { c.strokeStyle = o.trim; c.lineWidth = 1; c.beginPath(); c.moveTo(-68, y + 18); c.bezierCurveTo(-50, y - 4, 30, y - 10, 67, y + 10); c.stroke(); }
    if (o.jewel) {
      const jx = 8, jy = y - 6;
      glowDot(c, jx, jy, 12, o.jewel, 0.5);
      c.beginPath(); c.moveTo(jx, jy - 7); c.lineTo(jx + 5, jy); c.lineTo(jx, jy + 7); c.lineTo(jx - 5, jy); c.closePath();
      c.fillStyle = o.jewel; c.fill(); c.strokeStyle = o.trim || '#d8b25a'; c.lineWidth = 1.4; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.8)'; ell(c, jx - 1.5, jy - 2.5, 1.4, 2); c.fill();
    }
    if (o.tails) { // knot tails flying behind the near side
      for (const [sp, w] of [[[-66, y + 18, -92, y + 20, -110, y + 40, -128, y + 34], 7], [[-66, y + 18, -88, y + 30, -98, y + 56, -116, y + 66], 6]]) {
        ribbonPath(c, sp, w, { p: 0.1, bulge: 0.1, w0: 1 }); c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1; c.stroke();
      }
    }
  };
  // headscarf (cloth wrapped over the crown)
  AC.wrap = (c, o) => {
    const col = o.col, line = U.shade(col, -0.5);
    c.beginPath();
    c.moveTo(-74, -30); c.bezierCurveTo(-86, -80, -50, -122, 0, -122); c.bezierCurveTo(50, -122, 80, -90, 72, -40);
    c.bezierCurveTo(50, -66, -40, -74, -74, -30); c.closePath();
    const g = c.createLinearGradient(0, -122, 0, -40); g.addColorStop(0, U.shade(col, 0.15)); g.addColorStop(1, U.shade(col, -0.15));
    c.fillStyle = g; c.fill(); c.strokeStyle = line; c.lineWidth = 1.3; c.stroke();
    c.strokeStyle = U.rgba(line, 0.5); c.lineWidth = 1;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-60 + k * 6, -50 - k * 16); c.quadraticCurveTo(0, -80 - k * 14, 60 - k * 8, -56 - k * 14); c.stroke(); }
    if (o.pattern) { c.fillStyle = o.pattern; for (let k = 0; k < 14; k++) { const x = -54 + (k % 7) * 18, y = -90 + Math.floor(k / 7) * 22 + (k % 2) * 6; ell(c, x, y, 2, 2); c.fill(); } }
    // knot at the back
    c.fillStyle = U.shade(col, -0.05);
    ell(c, -76, -60, 10, 8, 0.4); c.fill(); c.stroke();
    for (const [sp, w] of [[[-80, -56, -100, -50, -110, -30, -120, -20], 10], [[-80, -56, -96, -40, -98, -14, -108, 6], 9]]) {
      ribbonPath(c, sp, w, { p: 0.15, bulge: 0.2, w0: 1 }); c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1; c.stroke();
    }
  };
  // round spectacles
  AC.glasses = (c, S, o = {}) => {
    const F = S.F;
    const col = o.col || '#3a2a20';
    c.save(); c.lineWidth = 2; c.strokeStyle = col;
    const nr = o.r || 21;
    for (const [x, r] of [[F.eyeX + 2, nr], [F.farX - 1, nr * 0.72]]) {
      c.beginPath(); c.ellipse(x, F.eyeY + 2, r, r * 0.9, 0, 0, TAU);
      c.fillStyle = 'rgba(220,240,255,0.12)'; c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.4;
      c.beginPath(); c.arc(x, F.eyeY + 2, r * 0.75, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
      c.strokeStyle = col; c.lineWidth = 2;
    }
    c.beginPath(); c.moveTo(F.eyeX + 2 + nr, F.eyeY - 2); c.quadraticCurveTo(14, F.eyeY - 8, F.farX - 1 - nr * 0.72, F.eyeY - 2); c.stroke();
    c.beginPath(); c.moveTo(F.eyeX + 2 - nr, F.eyeY); c.lineTo(-66, F.eyeY - 4); c.stroke();
    if (o.chain) { c.strokeStyle = o.chain; c.lineWidth = 1; c.beginPath(); c.moveTo(F.eyeX + 2 - nr, F.eyeY + 2); c.quadraticCurveTo(-60, 60, -50, 110); c.stroke(); }
    c.restore();
  };
  // jade tag pendant
  AC.jadeTag = (c, x, y, s, col, cord) => {
    s = s || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    c.strokeStyle = cord || '#c8283a'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, -18); c.lineTo(0, 0); c.stroke();
    c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.lineTo(8, 20); c.lineTo(0, 26); c.lineTo(-8, 20); c.closePath();
    const g = c.createLinearGradient(-8, 0, 8, 26); g.addColorStop(0, U.shade(col || '#9fe0c0', 0.4)); g.addColorStop(1, col || '#5aae88');
    c.fillStyle = g; c.fill(); c.strokeStyle = U.shade(col || '#5aae88', -0.45); c.lineWidth = 1; c.stroke();
    c.strokeStyle = U.rgba(U.shade(col || '#5aae88', -0.5), 0.7); c.beginPath(); c.moveTo(0, 5); c.lineTo(0, 18); c.moveTo(-3, 9); c.lineTo(3, 9); c.stroke();
    c.strokeStyle = cord || '#c8283a'; c.lineWidth = 1.2;
    for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(0, 26); c.lineTo(k * 2, 38); c.stroke(); }
    c.restore();
  };
  // bead string (念珠) across the chest
  AC.beads = (c, o) => {
    const pts = sample(o.spine || [-46, 104, -30, 170, 30, 176, 50, 104], 22);
    pts.forEach((p, i) => {
      const r = (i === Math.floor(pts.length / 2)) ? (o.big || 6) : (o.r || 3.6);
      const g = c.createRadialGradient(p[0] - r * 0.3, p[1] - r * 0.3, 0.5, p[0], p[1], r);
      g.addColorStop(0, U.shade(o.col, 0.5)); g.addColorStop(1, o.col);
      ell(c, p[0], p[1], r, r); c.fillStyle = g; c.fill(); c.strokeStyle = U.shade(o.col, -0.5); c.lineWidth = 0.8; c.stroke();
    });
  };
  // red string bracelet / generic cord with knot
  AC.knot = (c, x, y, col, s) => {
    s = s || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    c.strokeStyle = col; c.lineWidth = 2;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; c.beginPath(); c.ellipse(Math.cos(a) * 4, Math.sin(a) * 4, 4, 2.4, a, 0, TAU); c.stroke(); }
    c.fillStyle = col; ell(c, 0, 0, 2.5, 2.5); c.fill();
    c.lineWidth = 1.6; c.beginPath(); c.moveTo(-2, 6); c.lineTo(-4, 20); c.moveTo(2, 6); c.lineTo(4, 20); c.stroke();
    c.restore();
  };
  // tassel earring
  AC.earring = (c, x, y, col, bead) => {
    c.save();
    c.strokeStyle = '#d8b25a'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 8); c.stroke();
    ell(c, x, y + 10, 3, 3); c.fillStyle = bead || '#e8f4ff'; c.fill(); c.strokeStyle = '#8a7a50'; c.stroke();
    c.strokeStyle = col; c.lineWidth = 1.3;
    for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(x, y + 13); c.lineTo(x + k * 1.6, y + 26); c.stroke(); }
    c.restore();
  };
  // talisman slip (符)
  AC.talisman = (c, x, y, a, s, o = {}) => {
    s = s || 1;
    c.save(); c.translate(x, y); c.rotate(a || 0); c.scale(s, s);
    if (o.glow) glowDot(c, 0, 0, 30, o.glow, 0.5);
    c.fillStyle = o.paper || '#f2d36a'; c.fillRect(-8, -24, 16, 48);
    c.strokeStyle = o.edge || '#a07d20'; c.lineWidth = 1; c.strokeRect(-8, -24, 16, 48);
    c.strokeStyle = o.ink || '#c0242c'; c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-4, -19); c.lineTo(4, -19); c.moveTo(0, -19); c.lineTo(0, 16);
    c.moveTo(-5, -10); c.quadraticCurveTo(0, -6, 5, -10); c.moveTo(-4, -2); c.lineTo(4, 2); c.moveTo(-4, 6); c.quadraticCurveTo(0, 12, 4, 6);
    c.moveTo(-3, 14); c.lineTo(3, 18); c.stroke();
    c.restore();
  };
  // folding fan
  AC.fan = (c, x, y, r, a0, a1, o = {}) => {
    c.save(); c.translate(x, y);
    const n = o.ribs || 12;
    c.beginPath(); c.moveTo(Math.cos(a0) * r * 0.28, Math.sin(a0) * r * 0.28);
    c.arc(0, 0, r, a0, a1); c.arc(0, 0, r * 0.28, a1, a0, true); c.closePath();
    const g = c.createRadialGradient(0, 0, r * 0.3, 0, 0, r);
    g.addColorStop(0, o.paper2 || '#f6efe0'); g.addColorStop(1, o.paper || '#e8dcc0');
    c.fillStyle = g; c.fill(); c.strokeStyle = o.line || '#5a4630'; c.lineWidth = 1.3; c.stroke();
    // pleats
    for (let k = 1; k < n; k++) {
      const a = U.lerp(a0, a1, k / n);
      c.beginPath(); c.moveTo(Math.cos(a) * r * 0.28, Math.sin(a) * r * 0.28); c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      c.strokeStyle = k % 2 ? 'rgba(90,70,48,0.35)' : 'rgba(255,255,255,0.4)'; c.lineWidth = 1; c.stroke();
    }
    if (o.art) o.art(c, r);
    // guard sticks
    c.strokeStyle = o.stick || '#4a3020'; c.lineWidth = 3;
    for (const a of [a0, a1]) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.stroke(); }
    ell(c, 0, 0, 3, 3); c.fillStyle = '#d8b25a'; c.fill();
    if (o.tassel) { c.strokeStyle = o.tassel; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-4, 14, 2, 26); c.stroke(); c.fillStyle = o.tassel; ell(c, 2, 28, 2.5, 5); c.fill(); }
    c.restore();
  };
  // gourd
  AC.gourd = (c, x, y, s, o = {}) => {
    s = s || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    const col = o.col || '#c88a3a';
    const g = c.createRadialGradient(-5, -4, 2, 0, 4, 26);
    g.addColorStop(0, U.shade(col, 0.4)); g.addColorStop(1, U.shade(col, -0.35));
    c.fillStyle = g; c.strokeStyle = U.shade(col, -0.6); c.lineWidth = 1.3;
    ell(c, 0, 14, 16, 17); c.fill(); c.stroke();
    ell(c, 0, -10, 10, 10); c.fill(); c.stroke();
    c.fillStyle = o.cord || '#c8283a'; c.fillRect(-7, -2, 14, 4);
    c.fillStyle = '#6a4020'; c.fillRect(-3, -24, 6, 6);
    c.strokeStyle = o.cord || '#c8283a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-6, 2); c.quadraticCurveTo(-12, 14, -8, 24); c.stroke();
    if (o.label) { c.fillStyle = '#f4e8c8'; c.fillRect(-6, 8, 12, 14); c.fillStyle = '#7a2020'; c.font = 'bold 10px serif'; c.textAlign = 'center'; c.fillText(o.label, 0, 19); }
    c.restore();
  };
  // sword hilt rising behind the far shoulder (body-local)
  AC.swordBack = (c, o = {}) => {
    c.save();
    c.translate(o.x || 74, o.y || 112); c.rotate(o.a != null ? o.a : 0.62);
    const grip = o.grip || '#5a3a22', guard = o.guard || '#d6ae52';
    c.fillStyle = o.sheath || '#3a2a24'; c.fillRect(-5, 0, 10, 60);
    c.fillStyle = grip; c.fillRect(-4, -46, 8, 44);
    c.strokeStyle = U.shade(grip, -0.5); c.lineWidth = 1.2; c.strokeRect(-4, -46, 8, 44);
    c.strokeStyle = guard; c.lineWidth = 1;
    for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(-4, -42 + k * 6); c.lineTo(4, -39 + k * 6); c.stroke(); }
    c.fillStyle = guard; ell(c, 0, -1, 13, 4); c.fill(); c.strokeStyle = U.shade(guard, -0.5); c.stroke();
    ell(c, 0, -49, 5, 4); c.fill(); c.stroke();
    if (o.tassel !== false) {
      c.strokeStyle = o.tassel || '#d0283a'; c.lineWidth = 1.8;
      c.beginPath(); c.moveTo(0, -52); c.quadraticCurveTo(8, -62, 4, -74); c.stroke();
      c.fillStyle = o.tassel || '#d0283a'; ell(c, 4, -76, 2.5, 4); c.fill();
    }
    if (o.glow) { glowDot(c, 0, -20, 30, o.glow, 0.35); }
    c.restore();
  };
  // spear behind (body-local)
  AC.spearBack = (c, o = {}) => {
    c.save(); c.translate(o.x || 70, o.y || 140); c.rotate(o.a != null ? o.a : 0.3);
    c.fillStyle = o.shaft || '#5a3420'; c.fillRect(-3.5, -140, 7, 200);
    c.strokeStyle = '#2a1408'; c.lineWidth = 1; c.strokeRect(-3.5, -140, 7, 200);
    c.fillStyle = o.blade || '#c9cfd8'; c.beginPath(); c.moveTo(0, -196); c.lineTo(8, -152); c.lineTo(0, -144); c.lineTo(-8, -152); c.closePath(); c.fill();
    c.strokeStyle = '#5c6470'; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -192); c.lineTo(0, -148); c.stroke();
    c.fillStyle = o.collar || '#b0883a'; c.fillRect(-5, -146, 10, 6);
    const tc = o.tassel || '#d8283a';
    for (let k = 0; k < 9; k++) {
      c.strokeStyle = k % 2 ? tc : U.shade(tc, -0.25); c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(-4 + k, -140); c.quadraticCurveTo(-14 + k * 2.5, -118, -10 + k * 3, -96 + (k % 3) * 4); c.stroke();
    }
    c.restore();
  };
  // flute held diagonally in front of the chest (body-local)
  AC.flute = (c, o = {}) => {
    c.save(); c.translate(o.x || -20, o.y || 170); c.rotate(o.a != null ? o.a : -0.5);
    const col = o.col || '#8fd8b8';
    const g = c.createLinearGradient(0, -5, 0, 5); g.addColorStop(0, U.shade(col, 0.45)); g.addColorStop(1, U.shade(col, -0.3));
    c.fillStyle = g; c.fillRect(-90, -4.5, 180, 9); c.strokeStyle = U.shade(col, -0.55); c.lineWidth = 1; c.strokeRect(-90, -4.5, 180, 9);
    c.fillStyle = U.shade(col, -0.6); for (let k = 0; k < 6; k++) { ell(c, -40 + k * 12, 0, 1.8, 1.4); c.fill(); }
    c.fillStyle = '#d8b25a'; c.fillRect(-90, -5, 6, 10); c.fillRect(84, -5, 6, 10);
    c.strokeStyle = o.tassel || '#c8283a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-88, 4); c.quadraticCurveTo(-96, 20, -90, 36); c.stroke();
    c.restore();
  };
  // oil-paper umbrella behind (body-local)
  AC.umbrella = (c, o = {}) => {
    c.save(); c.translate(o.x || 10, o.y || -10); c.rotate(o.a || -0.25);
    const r = o.r || 150, col = o.col || '#c8483a';
    c.beginPath(); c.moveTo(-r, 30); c.quadraticCurveTo(0, -r * 0.55, r, 30);
    for (let k = 8; k >= 0; k--) { const x = U.lerp(-r, r, k / 8); c.quadraticCurveTo(x + r / 8, 42, x, 30); }
    c.closePath();
    const g = c.createRadialGradient(0, -30, 10, 0, 0, r); g.addColorStop(0, U.shade(col, 0.35)); g.addColorStop(1, U.shade(col, -0.2));
    c.fillStyle = g; c.globalAlpha = o.alpha || 0.95; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = U.shade(col, -0.55); c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = U.rgba(U.shade(col, -0.5), 0.6); c.lineWidth = 1;
    for (let k = 0; k <= 8; k++) { const x = U.lerp(-r, r, k / 8); c.beginPath(); c.moveTo(0, -r * 0.22); c.quadraticCurveTo(x * 0.5, -r * 0.2, x, 30); c.stroke(); }
    if (o.art) o.art(c, r);
    c.restore();
  };
  // 斗笠 straw hat hanging behind (body-local) or worn (head-local) — cx,cy centre
  AC.strawHat = (c, cx, cy, rx, ry, a, o = {}) => {
    c.save(); c.translate(cx, cy); c.rotate(a || 0);
    const col = o.col || '#d8b878';
    c.beginPath(); c.moveTo(-rx, 0); c.quadraticCurveTo(0, -ry * 2.4, rx, 0); c.quadraticCurveTo(0, ry * 0.6, -rx, 0); c.closePath();
    const g = c.createLinearGradient(0, -ry * 2, 0, ry); g.addColorStop(0, U.shade(col, 0.3)); g.addColorStop(1, U.shade(col, -0.3));
    c.fillStyle = g; c.fill(); c.strokeStyle = U.shade(col, -0.6); c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = U.rgba(U.shade(col, -0.5), 0.5); c.lineWidth = 1;
    for (let k = 1; k < 10; k++) { const x = U.lerp(-rx, rx, k / 10); c.beginPath(); c.moveTo(0, -ry * 1.15); c.lineTo(x, (1 - Math.pow(Math.abs(x / rx), 2)) * ry * 0.3); c.stroke(); }
    for (let k = 1; k < 4; k++) { c.beginPath(); c.ellipse(0, -ry * 1.15 + k * ry * 0.33, rx * k / 4, ry * 0.3 * k / 4 + 2, 0, Math.PI * 0.05, Math.PI * 0.95, true); c.stroke(); }
    if (o.band) { c.strokeStyle = o.band; c.lineWidth = 3; c.beginPath(); c.ellipse(0, -ry * 0.55, rx * 0.42, ry * 0.18, 0, Math.PI, TAU); c.stroke(); }
    c.restore();
  };
  // 斗笠 seen from above, hanging flat on the back (body-local): a big woven disc
  AC.hatDisc = (c, cx, cy, r, o = {}) => {
    c.save(); c.translate(cx, cy); c.rotate(o.a || -0.2); c.scale(1, o.squash || 0.82);
    const col = o.col || '#d8b878';
    const g = c.createRadialGradient(-r * 0.3, -r * 0.3, 4, 0, 0, r);
    g.addColorStop(0, U.shade(col, 0.35)); g.addColorStop(0.6, col); g.addColorStop(1, U.shade(col, -0.3));
    ell(c, 0, 0, r, r); c.fillStyle = g; c.fill(); c.strokeStyle = U.shade(col, -0.6); c.lineWidth = 1.6; c.stroke();
    c.strokeStyle = U.rgba(U.shade(col, -0.55), 0.45); c.lineWidth = 1;
    for (let k = 1; k <= 5; k++) { ell(c, 0, 0, r * k / 6, r * k / 6); c.stroke(); }
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.stroke(); }
    ell(c, 0, 0, r * 0.14, r * 0.14); c.fillStyle = U.shade(col, -0.4); c.fill();
    if (o.band) { c.strokeStyle = o.band; c.lineWidth = 3; ell(c, 0, 0, r * 0.98, r * 0.98); c.stroke(); }
    c.restore();
  };
  // lotus water-lantern ornament (水燈)
  AC.lotus = (c, x, y, s, o = {}) => {
    s = s || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    glowDot(c, 0, -4, 26, o.glow || '#ffd0a0', 0.5);
    const pc = o.col || '#f8b0c0';
    for (const [a, l, w, k] of [[-2.4, 14, 7, 0.8], [-0.7, 14, 7, 0.8], [-1.95, 17, 7, 1], [-1.2, 17, 7, 1], [-1.57, 19, 7.5, 1.1]]) {
      c.save(); c.rotate(a + Math.PI / 2);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-w, -l * 0.5, 0, -l); c.quadraticCurveTo(w, -l * 0.5, 0, 0);
      const g = c.createLinearGradient(0, 0, 0, -l); g.addColorStop(0, U.shade(pc, 0.5 * k)); g.addColorStop(1, pc);
      c.fillStyle = g; c.fill(); c.strokeStyle = U.shade(pc, -0.4); c.lineWidth = 0.9; c.stroke();
      c.restore();
    }
    c.fillStyle = '#ffe9a0'; ell(c, 0, -6, 3, 4); c.fill();
    glowDot(c, 0, -8, 8, '#fff6c0', 0.9);
    c.restore();
  };
  // 步搖 hairpin with dangling bead strings
  AC.buyao = (c, x, y, a, o = {}) => {
    c.save(); c.translate(x, y); c.rotate(a || 0);
    const gold = o.gold || '#e0b850';
    c.strokeStyle = U.shade(gold, -0.3); c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-26, 0); c.lineTo(10, 0); c.stroke();
    if (o.flower) AC.flower(c, 12, 0, 7, o.flower, gold); else { c.fillStyle = gold; ell(c, 12, 0, 6, 6); c.fill(); c.strokeStyle = U.shade(gold, -0.5); c.lineWidth = 1; c.stroke(); }
    c.restore();
    c.save(); c.translate(x, y);
    for (let k = 0; k < (o.n || 3); k++) {
      const bx = Math.cos(a || 0) * (6 + k * 4), by = Math.sin(a || 0) * (6 + k * 4) + 4;
      const len = (o.len || 22) + k * 5;
      c.strokeStyle = U.shade(gold, -0.2); c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(bx, by); c.lineTo(bx, by + len); c.stroke();
      for (let j = 1; j <= 3; j++) { ell(c, bx, by + len * j / 3, 2, 2); c.fillStyle = j === 3 ? (o.bead || '#d0283a') : '#f4f0e0'; c.fill(); }
    }
    c.restore();
  };
  // tall Taoist cap 道冠 (head-local)
  AC.daoGuan = (c, o = {}) => {
    const col = o.col || '#1a1a22', gold = o.gold || '#d6ae52';
    c.save();
    c.beginPath(); c.moveTo(-34, -108); c.lineTo(-30, -146); c.quadraticCurveTo(-12, -156, 10, -148); c.lineTo(12, -110); c.quadraticCurveTo(-10, -100, -34, -108); c.closePath();
    const g = c.createLinearGradient(-34, 0, 12, 0); g.addColorStop(0, U.shade(col, 0.25)); g.addColorStop(1, col);
    c.fillStyle = g; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.2; c.stroke();
    c.strokeStyle = gold; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-32, -120); c.quadraticCurveTo(-10, -112, 11, -122); c.stroke();
    c.beginPath(); c.moveTo(-30, -140); c.quadraticCurveTo(-10, -134, 10, -142); c.stroke();
    if (o.taiji) DL.taiji(c, -10, -131, 6, '#f3f1ea', col, gold);
    c.strokeStyle = o.pin || '#5aa880'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-50, -124); c.lineTo(28, -132); c.stroke();
    c.restore();
  };
  // small lotus / ring crown for the hair bun
  AC.crown = (c, x, y, o = {}) => {
    const col = o.col || '#e8e8f0', line = o.line || '#5a5a6a';
    c.save(); c.translate(x, y);
    if (o.lotus) {
      for (const [a, l] of [[-0.9, 16], [-0.45, 19], [0, 21], [0.45, 19], [0.9, 16]]) {
        c.save(); c.rotate(a); c.beginPath(); c.moveTo(-5, 4); c.quadraticCurveTo(-6, -l * 0.6, 0, -l); c.quadraticCurveTo(6, -l * 0.6, 5, 4); c.closePath();
        c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1; c.stroke(); c.restore();
      }
    } else {
      c.beginPath(); c.moveTo(-18, 6); c.lineTo(-14, -10); c.quadraticCurveTo(0, -18, 16, -10); c.lineTo(18, 6); c.closePath();
      c.fillStyle = col; c.fill(); c.strokeStyle = line; c.lineWidth = 1.1; c.stroke();
    }
    if (o.gem) { c.fillStyle = o.gem; ell(c, 0, -4, 3, 3); c.fill(); }
    c.restore();
  };
  // floating 披帛 shawl ribbon behind the shoulders (body-local)
  AC.pibo = (c, o = {}) => {
    const col = o.col || '#dff0ff';
    // one long scarf arching behind the back from hip to hip, plus a fluttering end
    const sp = [-150, 210, -176, 40, 160, 30, 140, 210];
    ribbonPath(c, sp, 22, { p: 0, bulge: 0.15, w0: 1, n: 30 });
    const g = c.createLinearGradient(0, 30, 0, 210); g.addColorStop(0, U.rgba(col, 0.5)); g.addColorStop(1, U.rgba(col, 0.9));
    c.fillStyle = g; c.fill(); c.strokeStyle = U.rgba(o.line || '#8aa8c8', 0.7); c.lineWidth = 1; c.stroke();
    ribbonPath(c, [-128, 150, -150, 110, -170, 120, -176, 80], 12, { p: 0.4, bulge: 0.3, w0: 1 });
    c.fillStyle = U.rgba(col, 0.75); c.fill(); c.stroke();
  };
  // a bowl of 芋圓 held in front (body-local)
  AC.taroBowl = (c, x, y) => {
    c.save(); c.translate(x, y);
    glowDot(c, 0, -6, 30, '#fff0d0', 0.35);
    // steam
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.6;
    for (const dx of [-10, 2, 14]) { c.beginPath(); c.moveTo(dx, -14); c.bezierCurveTo(dx - 6, -24, dx + 6, -30, dx, -40); c.stroke(); }
    c.beginPath(); c.moveTo(-30, -6); c.quadraticCurveTo(-28, 22, 0, 24); c.quadraticCurveTo(28, 22, 30, -6); c.closePath();
    const g = c.createLinearGradient(0, -6, 0, 24); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#c8d4e0');
    c.fillStyle = g; c.fill(); c.strokeStyle = '#5a6a80'; c.lineWidth = 1.2; c.stroke();
    c.strokeStyle = '#3a6ab0'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-26, 6); c.quadraticCurveTo(0, 12, 26, 6); c.stroke();
    ell(c, 0, -6, 30, 6); c.fillStyle = '#e8d8b0'; c.fill(); c.strokeStyle = '#5a6a80'; c.stroke();
    for (const [bx, by, col] of [[-14, -8, '#b890d0'], [-4, -9, '#f0d070'], [6, -8, '#b890d0'], [14, -7, '#f4e8c8'], [-8, -5, '#f0d070'], [2, -5, '#e8b0c0']]) {
      c.fillStyle = col; c.save(); c.translate(bx, by); c.rotate(0.3); c.fillRect(-3.5, -2.5, 7, 5); c.restore();
    }
    // spoon
    c.strokeStyle = '#a07a50'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(10, -8); c.lineTo(30, -30); c.stroke();
    c.restore();
  };
  // tiny leopard-cat plush charm (Hongying's secret)
  AC.catCharm = (c, x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s || 1, s || 1);
    c.strokeStyle = '#c8283a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -16); c.lineTo(0, -8); c.stroke();
    c.fillStyle = '#d0a066'; c.strokeStyle = '#5a3820'; c.lineWidth = 1.1;
    for (const d of [-1, 1]) { c.beginPath(); c.moveTo(d * 9, -2); c.lineTo(d * 7, -12); c.lineTo(d * 2, -6); c.closePath(); c.fill(); c.stroke(); }
    ell(c, 0, 0, 11, 9); c.fill(); c.stroke();
    c.fillStyle = '#f4e4c6'; ell(c, 0, 4, 6, 4); c.fill();
    c.fillStyle = '#2a1a10'; ell(c, -4, -1, 1.6, 2); c.fill(); ell(c, 4, -1, 1.6, 2); c.fill();
    c.fillStyle = '#e88a90'; ell(c, 0, 2.5, 1.4, 1); c.fill();
    c.strokeStyle = '#4e2f1a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-2, -8); c.lineTo(-2, -4); c.moveTo(2, -8); c.lineTo(2, -4); c.stroke();
    c.restore();
  };
  // bamboo sprig
  AC.bamboo = (c, x, y, s, a, col) => {
    c.save(); c.translate(x, y); c.rotate(a || 0); c.scale(s || 1, s || 1);
    col = col || '#2a3a2a';
    c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(20, -10, 46, -6); c.stroke();
    for (const [lx, ly, la] of [[10, -4, -0.6], [22, -7, 0.5], [32, -7, -0.3], [44, -6, 0.2]]) {
      c.save(); c.translate(lx, ly); c.rotate(la);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(10, -5, 26, -1); c.quadraticCurveTo(10, 3, 0, 0); c.fillStyle = col; c.fill();
      c.restore();
    }
    c.restore();
  };
  // small floating motes / embers / petals
  AC.motes = (c, o) => {
    const r = rng(o.seed || 3);
    for (let k = 0; k < (o.n || 12); k++) {
      const x = U.lerp(o.x0 || -130, o.x1 || 130, r()), y = U.lerp(o.y0 || -150, o.y1 || 180, r()), s = (o.s || 5) * (0.5 + r());
      if (o.kind === 'ember') {
        glowDot(c, x, y, s * 2.2, o.col, 0.6);
        c.fillStyle = o.core || '#fff4c0'; c.save(); c.translate(x, y); c.rotate(r() * TAU);
        c.beginPath(); c.moveTo(0, -s * 0.8); c.lineTo(s * 0.35, 0); c.lineTo(0, s * 0.8); c.lineTo(-s * 0.35, 0); c.closePath(); c.fill(); c.restore();
      } else if (o.kind === 'petal') {
        c.save(); c.translate(x, y); c.rotate(r() * TAU); c.fillStyle = U.rgba(o.col, 0.85);
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(s, -s * 0.8, s * 1.8, 0); c.quadraticCurveTo(s, s * 0.6, 0, 0); c.fill(); c.restore();
      } else if (o.kind === 'spark') {
        glowDot(c, x, y, s * 2, o.col, 0.5); sparkle(c, x, y, s * 0.9, o.core || '#ffffff');
      } else { glowDot(c, x, y, s * 1.6, o.col, 0.7); }
    }
  };
  // a soft radial aura (head-local)
  AC.aura = (c, col, a, r, y) => {
    const g = c.createRadialGradient(0, y || 10, 20, 0, (y || 10) + 10, r || 170);
    g.addColorStop(0, U.rgba(col, a)); g.addColorStop(0.6, U.rgba(col, a * 0.35)); g.addColorStop(1, U.rgba(col, 0));
    c.fillStyle = g; c.fillRect(-190, -200, 380, 420);
  };
  // halo ring behind head
  AC.halo = (c, o) => {
    c.save(); c.translate(o.x || -6, o.y || -40);
    const r = o.r || 104;
    glowDot(c, 0, 0, r * 1.3, o.glow || '#ffe8a0', 0.25);
    c.strokeStyle = o.col || '#f2d27a'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r - 8, 0, TAU); c.stroke();
    if (o.lanterns) for (let k = 0; k < o.lanterns; k++) {
      const a = -Math.PI / 2 + (k - (o.lanterns - 1) / 2) * 0.42;
      AC.lantern(c, Math.cos(a) * r - 0, Math.sin(a) * r - 9, 0.75, { col: o.lcol || '#ffb050', dark: '#c86a20', glowCol: '#ffe0a0' });
    }
    c.restore();
  };
  // 花鈿 forehead mark
  AC.forehead = (c, col, kind) => {
    c.save(); c.translate(10, -66);
    glowDot(c, 0, 0, 12, col, 0.5);
    c.fillStyle = col;
    if (kind === 'flame') { c.beginPath(); c.moveTo(0, -9); c.quadraticCurveTo(5, -2, 3, 4); c.quadraticCurveTo(0, 8, -3, 4); c.quadraticCurveTo(-5, -2, 0, -9); c.fill(); }
    else if (kind === 'eye') { c.beginPath(); c.moveTo(-6, 0); c.quadraticCurveTo(0, -6, 6, 0); c.quadraticCurveTo(0, 6, -6, 0); c.fill(); ell(c, 0, 0, 2, 2); c.fillStyle = '#fff'; c.fill(); }
    else { for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(0, -2 + k * 0.5, 2.2, 6, (k - 1) * 0.6, 0, TAU); c.fill(); } }
    c.restore();
  };
  // scar (on the near cheek)
  AC.scar = (c, x, y) => {
    c.save(); c.strokeStyle = 'rgba(190,90,90,0.75)'; c.lineWidth = 1.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 16, y + 12); c.stroke();
    c.lineWidth = 1; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(x + 3 + k * 5, y + 5 + k * 3); c.lineTo(x + 6 + k * 5, y + 1 + k * 3); c.stroke(); }
    c.restore();
  };
  // ink smudge / paint dab on cheek
  AC.smudge = (c, x, y, col) => { c.save(); c.fillStyle = U.rgba(col, 0.55); ell(c, x, y, 7, 3, -0.3); c.fill(); ell(c, x + 6, y + 3, 3, 1.6, -0.3); c.fill(); c.restore(); };
  // grass stalk in mouth
  AC.grass = (c, S) => {
    const F = S.F;
    c.save(); c.strokeStyle = '#7aa040'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(F.mouthX + 4, F.mouthY + 1); c.quadraticCurveTo(F.mouthX + 30, F.mouthY + 2, F.mouthX + 52, F.mouthY - 14); c.stroke();
    c.fillStyle = '#9ac050'; c.beginPath(); c.moveTo(F.mouthX + 52, F.mouthY - 14); c.quadraticCurveTo(F.mouthX + 60, F.mouthY - 24, F.mouthX + 66, F.mouthY - 22); c.quadraticCurveTo(F.mouthX + 58, F.mouthY - 16, F.mouthX + 52, F.mouthY - 14); c.fill();
    c.restore();
  };
  // little mushroom
  AC.mushroom = (c, x, y, s, cap, glow) => {
    s = s || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    if (glow) glowDot(c, 0, -8, 20, glow, 0.5);
    c.fillStyle = '#f4ead8'; c.beginPath(); c.moveTo(-3, 0); c.quadraticCurveTo(-4, -8, -2, -10); c.lineTo(2, -10); c.quadraticCurveTo(4, -8, 3, 0); c.closePath(); c.fill();
    c.strokeStyle = '#8a7050'; c.lineWidth = 0.8; c.stroke();
    const g = c.createRadialGradient(-2, -16, 1, 0, -12, 12); g.addColorStop(0, U.shade(cap, 0.5)); g.addColorStop(1, cap);
    c.beginPath(); c.moveTo(-11, -9); c.quadraticCurveTo(-10, -20, 0, -20); c.quadraticCurveTo(10, -20, 11, -9); c.closePath();
    c.fillStyle = g; c.fill(); c.strokeStyle = U.shade(cap, -0.5); c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)'; for (const [px, py] of [[-5, -14], [2, -17], [6, -12]]) { ell(c, px, py, 1.6, 1.3); c.fill(); }
    c.restore();
  };
  // lightning bolt
  AC.bolt = (c, x, y, s, col, a) => {
    c.save(); c.translate(x, y); c.rotate(a || 0); c.scale(s, s);
    glowDot(c, 0, 20, 34, col, 0.4);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 14); c.lineTo(4, 16); c.lineTo(14, 34); c.lineTo(-2, 18); c.lineTo(4, 16); c.lineTo(-6, 4); c.closePath();
    c.fillStyle = '#ffffff'; c.fill(); c.strokeStyle = col; c.lineWidth = 2; c.stroke();
    c.restore();
  };
  // soul flame (wisp)
  AC.wisp = (c, x, y, s, col, core) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    glowDot(c, 0, 0, 22, col, 0.55);
    c.beginPath(); c.moveTo(0, -18); c.bezierCurveTo(8, -8, 10, 2, 6, 8); c.quadraticCurveTo(0, 13, -6, 8); c.bezierCurveTo(-10, 2, -6, -6, 0, -18);
    c.fillStyle = U.rgba(col, 0.85); c.fill();
    ell(c, 0, 3, 3.5, 5); c.fillStyle = core || '#ffffff'; c.fill();
    c.restore();
  };
  // cloud swirl (ruyi cloud) for backgrounds/effects
  AC.cloud = (c, x, y, s, col, line) => {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath();
    c.moveTo(-40, 10); c.bezierCurveTo(-48, -6, -30, -18, -18, -8); c.bezierCurveTo(-16, -26, 12, -28, 14, -10);
    c.bezierCurveTo(26, -20, 44, -8, 36, 6); c.bezierCurveTo(46, 12, 40, 22, 30, 20); c.lineTo(-34, 20); c.bezierCurveTo(-44, 20, -46, 14, -40, 10); c.closePath();
    c.fillStyle = col; c.fill(); if (line) { c.strokeStyle = line; c.lineWidth = 1.4; c.stroke(); }
    if (line) { c.beginPath(); c.arc(-14, 2, 6, Math.PI, TAU * 0.95); c.stroke(); c.beginPath(); c.arc(16, -2, 7, Math.PI, TAU * 0.95); c.stroke(); }
    c.restore();
  };
})();

'use strict';
// Soft-clay art kit: candies, specials, blockers, screws, plates, toolboxes, icons, Bolt and the cast portraits.
// Everything is drawn procedurally and cached per (id, size, pixel ratio). Draw calls are isolated (save/restore).
(function () {
  const G = window.G;
  const R = G.Render;
  const K = (G.Clay = G.Clay || {});

  K.CANDY = [
    { name: 'cherry', col: '#ef6f6c', shape: 'round' },
    { name: 'caramel', col: '#f4a259', shape: 'square' },
    { name: 'lemon', col: '#f6d55c', shape: 'star' },
    { name: 'mint', col: '#7cc6a4', shape: 'leaf' },
    { name: 'berry', col: '#6fa8dc', shape: 'diamond' },
    { name: 'grape', col: '#a98bd6', shape: 'flower' },
  ];
  K.SCREW = ['#ef6f6c', '#6fa8dc', '#f6d55c', '#7cc6a4', '#a98bd6', '#f4a259'];
  K.SCREW_NAMES = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'];

  // Sprite cache. Sizes are snapped to a few buckets (8 per doubling) and scaled when drawn, and the cache is
  // capped (oldest entries freed), so animations that change size every frame never create unbounded canvases.
  // WebKit (Safari, iOS, the Claude apps) caps total canvas memory and returns blank canvases once it is hit.
  const cache = new Map();
  const MAX_SPRITES = 220;
  K.cacheSize = () => cache.size;
  K.clearCache = function () { for (const c of cache.values()) { c.width = 0; c.height = 0; } cache.clear(); };
  const bucket = (size) => Math.max(8, Math.round(Math.pow(2, Math.ceil(Math.log2(size) * 8) / 8)));
  // Draw cached art centred at (x, y) with logical size `size`.
  K.sprite = function (ctx, key, size, painter, x, y, alpha) {
    if (!(size > 0.5)) return;
    const pr = Math.min(3, R.scale * R.dpr);
    const bs = bucket(size);
    const ck = key + '@' + bs + '@' + pr.toFixed(2);
    let c = cache.get(ck);
    if (c) { cache.delete(ck); cache.set(ck, c); }   // LRU: move to the newest end
    else {
      const pad = Math.ceil(bs * 0.25);
      const px = Math.ceil((bs + pad * 2) * pr);
      c = R.makeCanvas(px, px);
      const g = c.getContext('2d');
      if (!g) { G.warnOnce('sprite canvas unavailable'); return; }
      g.setTransform(pr, 0, 0, pr, 0, 0);
      g.translate(pad + bs / 2, pad + bs / 2);
      try { painter(g, bs); } catch (e) { G.warnOnce('paint ' + key, e); G.lastError = e; }
      c._pad = pad;
      c._size = bs;
      cache.set(ck, c);
      while (cache.size > MAX_SPRITES) {
        const oldest = cache.keys().next().value;
        const o = cache.get(oldest);
        o.width = 0; o.height = 0;   // release the backing store now (WebKit frees it lazily otherwise)
        cache.delete(oldest);
      }
    }
    const k = size / c._size;
    const full = (c._size + c._pad * 2) * k;
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.drawImage(c, x - full / 2, y - full / 2, full, full);
    ctx.restore();
  };

  // ---- clay shading helpers ----
  function clayFill(g, path, col, size) {
    g.save();
    g.shadowColor = 'rgba(70,40,20,0.28)';
    g.shadowBlur = size * 0.12;
    g.shadowOffsetY = size * 0.06;
    path(g);
    g.fillStyle = R.shade(col, -0.18);
    g.fill();
    g.restore();
    g.save();
    path(g);
    g.clip();
    const rg = g.createRadialGradient(-size * 0.18, -size * 0.22, size * 0.05, 0, 0, size * 0.62);
    rg.addColorStop(0, R.shade(col, 0.45));
    rg.addColorStop(0.55, col);
    rg.addColorStop(1, R.shade(col, -0.22));
    g.fillStyle = rg;
    g.fillRect(-size, -size, size * 2, size * 2);
    // matte speckle for the clay look
    g.globalAlpha = 0.08;
    g.fillStyle = '#000';
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996, r = (i / 18) * size * 0.45;
      g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, size * 0.012, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // soft highlight
    g.save();
    g.globalAlpha = 0.55;
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(-size * 0.14, -size * 0.2, size * 0.12, size * 0.07, -0.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  const SHAPES = {
    round: (s) => (g) => { g.beginPath(); g.arc(0, 0, s * 0.38, 0, Math.PI * 2); },
    square: (s) => (g) => { R.rr(g, -s * 0.34, -s * 0.34, s * 0.68, s * 0.68, s * 0.16); },
    star: (s) => (g) => {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.2 : s * 0.42, a = -Math.PI / 2 + i * Math.PI / 5;
        const x = Math.cos(a) * r, y = Math.sin(a) * r + s * 0.03;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.lineJoin = 'round';
    },
    leaf: (s) => (g) => {
      g.beginPath();
      g.moveTo(0, -s * 0.42);
      g.bezierCurveTo(s * 0.42, -s * 0.12, s * 0.36, s * 0.34, 0, s * 0.38);
      g.bezierCurveTo(-s * 0.36, s * 0.34, -s * 0.42, -s * 0.12, 0, -s * 0.42);
      g.closePath();
    },
    diamond: (s) => (g) => {
      g.beginPath();
      g.moveTo(0, -s * 0.42); g.quadraticCurveTo(s * 0.06, -s * 0.06, s * 0.4, 0);
      g.quadraticCurveTo(s * 0.06, s * 0.06, 0, s * 0.42); g.quadraticCurveTo(-s * 0.06, s * 0.06, -s * 0.4, 0);
      g.quadraticCurveTo(-s * 0.06, -s * 0.06, 0, -s * 0.42); g.closePath();
    },
    flower: (s) => (g) => {
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.moveTo(Math.cos(a) * s * 0.22 + s * 0.17, Math.sin(a) * s * 0.22); g.arc(Math.cos(a) * s * 0.22, Math.sin(a) * s * 0.22, s * 0.17, 0, Math.PI * 2); }
      g.moveTo(s * 0.2, 0); g.arc(0, 0, s * 0.2, 0, Math.PI * 2);
    },
  };

  K.candy = function (ctx, c, sp, x, y, size, alpha) {
    const info = K.CANDY[c] || K.CANDY[0];
    if (sp === 'rainbow') { K.sprite(ctx, 'rainbow', size, paintRainbow, x, y, alpha); return; }
    K.sprite(ctx, 'candy' + c + (sp || ''), size, (g, s) => {
      if (sp === 'bomb') paintWrapper(g, s, info.col);
      clayFill(g, SHAPES[info.shape](s), info.col, s);
      if (sp === 'rh' || sp === 'rv') {
        g.save();
        SHAPES[info.shape](s)(g);
        g.clip();
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = s * 0.07;
        for (let k = -2; k <= 2; k++) {
          g.beginPath();
          if (sp === 'rh') { g.moveTo(-s, k * s * 0.16); g.lineTo(s, k * s * 0.16); } else { g.moveTo(k * s * 0.16, -s); g.lineTo(k * s * 0.16, s); }
          g.stroke();
        }
        g.restore();
      }
    }, x, y, alpha);
  };
  function paintWrapper(g, s, col) {
    g.save();
    g.fillStyle = R.shade(col, 0.25);
    g.strokeStyle = R.shade(col, -0.3);
    g.lineWidth = s * 0.03;
    for (const d of [-1, 1]) {
      g.beginPath();
      g.moveTo(d * s * 0.3, 0); g.lineTo(d * s * 0.5, -s * 0.18); g.lineTo(d * s * 0.5, s * 0.18); g.closePath();
      g.fill(); g.stroke();
    }
    g.restore();
  }
  function paintRainbow(g, s) {
    clayFill(g, SHAPES.round(s), '#7a4a32', s);
    const cols = K.CANDY.map((c) => c.col);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.39996, r = s * 0.08 + (i % 5) * s * 0.06;
      g.save();
      g.translate(Math.cos(a) * r, Math.sin(a) * r);
      g.rotate(a * 3);
      g.fillStyle = cols[i % cols.length];
      R.rr(g, -s * 0.05, -s * 0.018, s * 0.1, s * 0.036, s * 0.018);
      g.fill();
      g.restore();
    }
  }

  K.gear = function (ctx, x, y, size, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    K.sprite(ctx, 'gear', size, (g, s) => {
      const path = (gg) => {
        gg.beginPath();
        const n = 8;
        for (let i = 0; i < n * 2; i++) {
          const a = i * Math.PI / n, r = i % 2 ? s * 0.3 : s * 0.42;
          gg.lineTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r);
          gg.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r);
        }
        gg.closePath();
        gg.moveTo(s * 0.12, 0);
        gg.arc(0, 0, s * 0.12, 0, Math.PI * 2, true);
      };
      clayFill(g, path, '#d9a441', s);
    }, 0, 0);
    ctx.restore();
  };

  K.dust = function (ctx, x, y, size, layers) {
    K.sprite(ctx, 'dust' + layers, size, (g, s) => {
      g.fillStyle = layers > 1 ? 'rgba(150,130,115,0.75)' : 'rgba(170,150,135,0.5)';
      R.rr(g, -s / 2 + 2, -s / 2 + 2, s - 4, s - 4, s * 0.18);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < (layers > 1 ? 14 : 8); i++) {
        const a = i * 2.1, r = ((i * 37) % 10) / 10 * s * 0.4;
        g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, s * 0.035, 0, Math.PI * 2); g.fill();
      }
    }, x, y);
  };

  K.crate = function (ctx, x, y, size, hp) {
    K.sprite(ctx, 'crate' + hp, size, (g, s) => {
      const path = (gg) => R.rr(gg, -s * 0.44, -s * 0.44, s * 0.88, s * 0.88, s * 0.12);
      clayFill(g, path, '#c8945e', s);
      g.strokeStyle = 'rgba(90,55,30,0.35)';
      g.lineWidth = s * 0.03;
      g.beginPath(); g.moveTo(-s * 0.44, -s * 0.12); g.lineTo(s * 0.44, -s * 0.12); g.moveTo(-s * 0.44, s * 0.16); g.lineTo(s * 0.44, s * 0.16); g.stroke();
      g.fillStyle = 'rgba(235,215,170,0.9)';
      g.fillRect(-s * 0.08, -s * 0.44, s * 0.16, s * 0.88);
      if (hp > 1) g.fillRect(-s * 0.44, -s * 0.06, s * 0.88, s * 0.12);
    }, x, y);
  };

  K.twine = function (ctx, x, y, size) {
    K.sprite(ctx, 'twine', size, (g, s) => {
      g.strokeStyle = '#b07a4f';
      g.lineWidth = s * 0.08;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(-s * 0.45, -s * 0.3); g.lineTo(s * 0.45, s * 0.3); g.moveTo(-s * 0.45, s * 0.3); g.lineTo(s * 0.45, -s * 0.3); g.stroke();
      g.strokeStyle = '#e1b88a';
      g.lineWidth = s * 0.03;
      g.stroke();
      g.fillStyle = '#b07a4f';
      g.beginPath(); g.arc(0, 0, s * 0.09, 0, Math.PI * 2); g.fill();
    }, x, y);
  };

  // ---- screws, plates, boxes ----
  K.screw = function (ctx, c, x, y, size, opts) {
    opts = opts || {};
    const col = c < 0 ? '#9a9a9a' : K.SCREW[c];
    const key = 'screw' + c + (opts.lock ? 'L' : '') + (opts.key ? 'K' : '');
    K.sprite(ctx, key, size, (g, s) => {
      clayFill(g, (gg) => { gg.beginPath(); gg.arc(0, 0, s * 0.42, 0, Math.PI * 2); }, col, s);
      g.strokeStyle = 'rgba(60,35,20,0.55)';
      g.lineWidth = s * 0.08;
      g.lineCap = 'round';
      if (c < 0) {
        g.fillStyle = '#fff';
        g.font = '900 ' + Math.round(s * 0.5) + 'px ' + G.CONFIG.font.stack;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', 0, s * 0.03);
      } else {
        g.beginPath(); g.moveTo(-s * 0.2, 0); g.lineTo(s * 0.2, 0); g.moveTo(0, -s * 0.2); g.lineTo(0, s * 0.2); g.stroke();
      }
      if (opts.key) {
        g.strokeStyle = '#fff3c4'; g.lineWidth = s * 0.07;
        g.beginPath(); g.arc(0, 0, s * 0.47, 0, Math.PI * 2); g.stroke();
      }
    }, x, y, opts.alpha);
    if (opts.lock) K.padlock(ctx, x + size * 0.28, y + size * 0.28, size * 0.55);
    if (opts.key) K.keyIcon(ctx, x + size * 0.32, y - size * 0.3, size * 0.5);
  };
  K.padlock = function (ctx, x, y, size) {
    K.sprite(ctx, 'padlock', size, (g, s) => {
      g.strokeStyle = '#8a6a3a'; g.lineWidth = s * 0.12;
      g.beginPath(); g.arc(0, -s * 0.1, s * 0.2, Math.PI, 0); g.stroke();
      clayFill(g, (gg) => R.rr(gg, -s * 0.3, -s * 0.1, s * 0.6, s * 0.45, s * 0.1), '#e3b04b', s);
      g.fillStyle = '#6b4a22'; g.beginPath(); g.arc(0, s * 0.1, s * 0.06, 0, Math.PI * 2); g.fill();
    }, x, y);
  };
  K.keyIcon = function (ctx, x, y, size) {
    K.sprite(ctx, 'key', size, (g, s) => {
      g.strokeStyle = '#e3b04b'; g.lineWidth = s * 0.14; g.lineCap = 'round';
      g.beginPath(); g.arc(-s * 0.15, 0, s * 0.16, 0, Math.PI * 2); g.moveTo(0, 0); g.lineTo(s * 0.38, 0); g.moveTo(s * 0.3, 0); g.lineTo(s * 0.3, s * 0.14); g.stroke();
    }, x, y);
  };

  // Plate drawn in board space; u = pixels per board unit. Holes are drawn where screws sit.
  K.plate = function (ctx, p, u, holes, alpha) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    ctx.translate(p.x * u, p.y * u);
    const path = () => {
      ctx.beginPath();
      if (p.shape === 'circle') ctx.arc(0, 0, p.r * u, 0, Math.PI * 2);
      else { ctx.rotate((p.rot || 0) * Math.PI / 180); R.rr(ctx, -p.w * u / 2, -p.h * u / 2, p.w * u, p.h * u, Math.min(p.w, p.h) * u * 0.42); }
    };
    ctx.save();
    ctx.shadowColor = 'rgba(70,40,20,0.3)';
    ctx.shadowBlur = u * 0.35;
    ctx.shadowOffsetY = u * 0.18;
    path();
    ctx.fillStyle = p.tint || '#e8c9a0';
    ctx.fill();
    ctx.restore();
    ctx.save();
    path();
    ctx.lineWidth = Math.max(2, u * 0.07);
    ctx.strokeStyle = R.shade(p.tint || '#e8c9a0', -0.28);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    path();
    ctx.clip();
    const s = (p.shape === 'circle' ? p.r * 2 : Math.max(p.w, p.h)) * u;
    const lg = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
    lg.addColorStop(0, 'rgba(255,255,255,0.45)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    lg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = lg;
    ctx.fillRect(-s, -s, s * 2, s * 2);
    ctx.restore();
    ctx.restore();
    // holes (in world space)
    if (holes) {
      ctx.save();
      if (alpha != null) ctx.globalAlpha *= alpha;
      for (const h of holes) {
        ctx.fillStyle = 'rgba(80,50,30,0.35)';
        ctx.beginPath(); ctx.arc(h.x * u, h.y * u, u * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  };

  K.toolbox = function (ctx, c, x, y, w, h, filled, alpha) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha *= alpha;
    const col = K.SCREW[c];
    R.panel(ctx, x - w / 2, y - h / 2, w, h, { fill: R.shade(col, 0.15), r: 16, lift: 5 });
    ctx.fillStyle = R.shade(col, -0.25);
    R.rr(ctx, x - w * 0.2, y - h / 2 - 10, w * 0.4, 14, 7);
    ctx.fill();
    for (let k = 0; k < 3; k++) {
      const sx = x + (k - 1) * w * 0.29, sy = y + 4;
      ctx.fillStyle = 'rgba(60,35,20,0.25)';
      ctx.beginPath(); ctx.arc(sx, sy, w * 0.11, 0, Math.PI * 2); ctx.fill();
      if (k < filled) K.screw(ctx, c, sx, sy, w * 0.26);
    }
    ctx.restore();
  };

  // ---- icons ----
  K.icon = function (ctx, id, x, y, size) {
    K.sprite(ctx, 'icon_' + id, size, (g, s) => {
      if (id === 'star') {
        clayFill(g, SHAPES.star(s * 1.15), '#ffc85a', s);
      } else if (id === 'starOff') {
        g.globalAlpha = 0.5; clayFill(g, SHAPES.star(s * 1.15), '#c9b8a4', s);
      } else if (id === 'coin') {
        clayFill(g, (gg) => { gg.beginPath(); gg.arc(0, 0, s * 0.4, 0, Math.PI * 2); }, '#f2b632', s);
        g.strokeStyle = 'rgba(120,70,10,0.45)'; g.lineWidth = s * 0.06; g.beginPath(); g.arc(0, 0, s * 0.26, 0, Math.PI * 2); g.stroke();
      } else if (id === 'hammer') {
        g.rotate(-0.6);
        clayFill(g, (gg) => R.rr(gg, -s * 0.06, -s * 0.15, s * 0.12, s * 0.55, s * 0.05), '#b9824f', s);
        clayFill(g, (gg) => R.rr(gg, -s * 0.3, -s * 0.38, s * 0.6, s * 0.24, s * 0.08), '#8d99a6', s);
      } else if (id === 'shuffle') {
        g.strokeStyle = '#6fa8dc'; g.lineWidth = s * 0.12; g.lineCap = 'round';
        g.beginPath(); g.arc(0, 0, s * 0.28, -2.6, 1.2); g.stroke();
        g.fillStyle = '#6fa8dc'; g.beginPath(); g.moveTo(s * 0.2, s * 0.36); g.lineTo(s * 0.02, s * 0.2); g.lineTo(s * 0.26, s * 0.12); g.fill();
        g.beginPath(); g.arc(-s * 0.1, -s * 0.05, s * 0.07, 0, 7); g.fillStyle = '#ef6f6c'; g.fill();
      } else if (id === 'slot') {
        clayFill(g, (gg) => R.rr(gg, -s * 0.4, -s * 0.22, s * 0.8, s * 0.44, s * 0.14), '#c8945e', s);
        g.fillStyle = '#fff'; g.font = '900 ' + Math.round(s * 0.42) + 'px ' + G.CONFIG.font.stack;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+1', 0, s * 0.02);
      } else if (id === 'settings') {
        clayFill(g, (gg) => { gg.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, r = i % 2 ? s * 0.3 : s * 0.4; gg.lineTo(Math.cos(a) * r, Math.sin(a) * r); } gg.closePath(); gg.moveTo(s * 0.13, 0); gg.arc(0, 0, s * 0.13, 0, 7, true); }, '#9fb3c8', s);
      } else if (id === 'stats') {
        [[-0.25, 0.2], [0, 0.4], [0.25, 0.3]].forEach(([dx, hgt], i) => clayFill(g, (gg) => R.rr(gg, dx * s - s * 0.09, s * 0.35 - hgt * s * 1.4, s * 0.18, hgt * s * 1.4, s * 0.05), ['#7cc6a4', '#f4a259', '#6fa8dc'][i], s));
      } else if (id === 'back') {
        g.strokeStyle = G.CONFIG.palette.ink; g.lineWidth = s * 0.13; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(s * 0.12, -s * 0.25); g.lineTo(-s * 0.15, 0); g.lineTo(s * 0.12, s * 0.25); g.stroke();
      } else if (id === 'pause') {
        g.fillStyle = G.CONFIG.palette.ink; R.rr(g, -s * 0.2, -s * 0.24, s * 0.13, s * 0.48, s * 0.05); g.fill(); R.rr(g, s * 0.07, -s * 0.24, s * 0.13, s * 0.48, s * 0.05); g.fill();
      } else if (id === 'check') {
        g.strokeStyle = '#4f9d69'; g.lineWidth = s * 0.16; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(-s * 0.25, 0); g.lineTo(-s * 0.06, s * 0.2); g.lineTo(s * 0.28, -s * 0.2); g.stroke();
      } else if (id === 'gift') {
        clayFill(g, (gg) => R.rr(gg, -s * 0.36, -s * 0.18, s * 0.72, s * 0.52, s * 0.08), '#ef6f6c', s);
        g.fillStyle = '#ffd36b'; g.fillRect(-s * 0.06, -s * 0.18, s * 0.12, s * 0.52); g.fillRect(-s * 0.36, -s * 0.02, s * 0.72, s * 0.1);
        g.beginPath(); g.ellipse(-s * 0.12, -s * 0.26, s * 0.12, s * 0.07, 0.4, 0, 7); g.ellipse(s * 0.12, -s * 0.26, s * 0.12, s * 0.07, -0.4, 0, 7); g.fill();
      } else {
        g.fillStyle = '#ccc'; g.beginPath(); g.arc(0, 0, s * 0.3, 0, 7); g.fill();
      }
    }, x, y);
  };

  // ---- Bolt (the player character). Variant index picks the design option (G2 gallery). ----
  K.BOLT_VARIANTS = [
    { name: 'Mint Classic', body: '#8fd8c4', face: '#fff8ee', eye: '#3b3b4f', ant: '#ffc85a', shape: 'round', ears: 'none' },
    { name: 'Sunny Tin', body: '#f6d55c', face: '#fff8ee', eye: '#3b3b4f', ant: '#ef6f6c', shape: 'box', ears: 'bolts' },
    { name: 'Berry Bot', body: '#6fa8dc', face: '#eef6ff', eye: '#23324f', ant: '#f6d55c', shape: 'round', ears: 'dials' },
    { name: 'Peach Puff', body: '#f9b38a', face: '#fff8ee', eye: '#4a3428', ant: '#7cc6a4', shape: 'bean', ears: 'none' },
    { name: 'Lilac Spark', body: '#b9a3e3', face: '#fbf7ff', eye: '#352a4f', ant: '#8fd8c4', shape: 'box', ears: 'dials' },
    { name: 'Cherry Gear', body: '#ef6f6c', face: '#fff2ec', eye: '#3a2020', ant: '#ffc85a', shape: 'round', ears: 'bolts' },
    { name: 'Moss Sprout', body: '#9cc77a', face: '#fbfff3', eye: '#2f3a22', ant: '#f9b38a', shape: 'bean', ears: 'leaf' },
    { name: 'Sky Kettle', body: '#9fd3ef', face: '#ffffff', eye: '#20384a', ant: '#ef6f6c', shape: 'kettle', ears: 'none' },
    { name: 'Cocoa Cub', body: '#b98a6a', face: '#fff3e6', eye: '#2e1d12', ant: '#8fd8c4', shape: 'round', ears: 'round' },
    { name: 'Cream Button', body: '#efe3c8', face: '#ffffff', eye: '#4a3428', ant: '#ff8c6b', shape: 'box', ears: 'round' },
  ];
  K.boltVariant = () => G.CONFIG.boltVariant || 0;   // the G2 design pick lives in CONFIG

  // mood: 'idle' | 'happy' | 'sad' | 'wow'
  K.bolt = function (ctx, x, y, size, opts) {
    opts = opts || {};
    const v = K.BOLT_VARIANTS[opts.variant != null ? opts.variant : K.boltVariant()] || K.BOLT_VARIANTS[0];
    const t = opts.t || 0;
    const bob = Math.sin(t * 3) * size * 0.02;
    ctx.save();
    ctx.translate(x, y + bob);
    const s = size;
    // shadow
    ctx.fillStyle = 'rgba(70,40,20,0.18)';
    ctx.beginPath(); ctx.ellipse(0, s * 0.48 - bob, s * 0.3, s * 0.06, 0, 0, 7); ctx.fill();
    // legs
    ctx.fillStyle = R.shade(v.body, -0.3);
    R.rr(ctx, -s * 0.18, s * 0.3, s * 0.12, s * 0.17, s * 0.05); ctx.fill();
    R.rr(ctx, s * 0.06, s * 0.3, s * 0.12, s * 0.17, s * 0.05); ctx.fill();
    // body
    const body = (g) => {
      if (v.shape === 'box') R.rr(g, -s * 0.28, s * 0.02, s * 0.56, s * 0.34, s * 0.1);
      else if (v.shape === 'bean') { g.beginPath(); g.ellipse(0, s * 0.2, s * 0.27, s * 0.2, 0, 0, 7); }
      else if (v.shape === 'kettle') { g.beginPath(); g.moveTo(-s * 0.3, s * 0.36); g.quadraticCurveTo(-s * 0.32, s * 0.02, 0, s * 0.02); g.quadraticCurveTo(s * 0.32, s * 0.02, s * 0.3, s * 0.36); g.closePath(); }
      else R.rr(g, -s * 0.26, s * 0.02, s * 0.52, s * 0.34, s * 0.17);
    };
    clayFill(ctx, body, v.body, s * 0.8);
    // chest dial
    ctx.fillStyle = R.shade(v.body, 0.5);
    ctx.beginPath(); ctx.arc(0, s * 0.19, s * 0.06, 0, 7); ctx.fill();
    ctx.fillStyle = v.ant;
    ctx.beginPath(); ctx.arc(0, s * 0.19, s * 0.03, 0, 7); ctx.fill();
    // arms
    const wave = opts.mood === 'happy' ? Math.sin(t * 10) * 0.5 - 0.9 : 0.2;
    ctx.strokeStyle = R.shade(v.body, -0.25);
    ctx.lineWidth = s * 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.12); ctx.lineTo(-s * 0.25 - Math.cos(wave) * s * 0.14, s * 0.12 + Math.sin(wave) * s * 0.14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.25, s * 0.12); ctx.lineTo(s * 0.25 + s * 0.12, s * 0.22); ctx.stroke();
    // head
    ctx.save();
    ctx.rotate(Math.sin(t * 1.7) * 0.04);
    const head = (g) => {
      if (v.shape === 'box' || v.shape === 'kettle') R.rr(g, -s * 0.3, -s * 0.38, s * 0.6, s * 0.42, s * 0.12);
      else { g.beginPath(); g.ellipse(0, -s * 0.17, s * 0.31, s * 0.23, 0, 0, 7); }
    };
    // ears
    ctx.fillStyle = R.shade(v.body, -0.2);
    if (v.ears === 'bolts') { for (const d of [-1, 1]) { R.rr(ctx, d * s * 0.33 - s * 0.05, -s * 0.22, s * 0.1, s * 0.12, s * 0.03); ctx.fill(); } }
    if (v.ears === 'dials') { for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * s * 0.32, -s * 0.16, s * 0.07, 0, 7); ctx.fill(); } }
    if (v.ears === 'round') { for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * s * 0.22, -s * 0.36, s * 0.08, 0, 7); ctx.fill(); } }
    if (v.ears === 'leaf') { ctx.fillStyle = '#7cc6a4'; ctx.beginPath(); ctx.ellipse(s * 0.1, -s * 0.44, s * 0.08, s * 0.04, -0.6, 0, 7); ctx.fill(); }
    clayFill(ctx, head, v.body, s * 0.8);
    // face screen
    ctx.fillStyle = v.face;
    R.rr(ctx, -s * 0.21, -s * 0.29, s * 0.42, s * 0.24, s * 0.09);
    ctx.fill();
    // eyes
    const blink = (Math.sin(t * 0.9) > 0.985) ? 0.15 : 1;
    ctx.fillStyle = v.eye;
    const ey = -s * 0.18;
    if (opts.mood === 'happy') {
      ctx.strokeStyle = v.eye; ctx.lineWidth = s * 0.035;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * s * 0.09, ey + s * 0.015, s * 0.04, Math.PI, 0); ctx.stroke(); }
    } else {
      const eh = (opts.mood === 'wow' ? 1.3 : 1) * blink;
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * s * 0.09, ey, s * 0.035, s * 0.05 * eh, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#fff';
      for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * s * 0.09 + s * 0.012, ey - s * 0.015, s * 0.012, 0, 7); ctx.fill(); }
    }
    // mouth / cheeks
    ctx.strokeStyle = v.eye; ctx.lineWidth = s * 0.025; ctx.lineCap = 'round';
    ctx.beginPath();
    if (opts.mood === 'sad') ctx.arc(0, -s * 0.07, s * 0.04, Math.PI * 1.15, Math.PI * 1.85);
    else if (opts.mood === 'wow') { ctx.arc(0, -s * 0.105, s * 0.022, 0, 7); }
    else ctx.arc(0, -s * 0.13, s * 0.04, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,140,120,0.45)';
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(d * s * 0.16, -s * 0.12, s * 0.03, s * 0.018, 0, 0, 7); ctx.fill(); }
    // antenna
    ctx.strokeStyle = R.shade(v.body, -0.35); ctx.lineWidth = s * 0.025;
    const topY = (v.shape === 'box' || v.shape === 'kettle') ? -s * 0.38 : -s * 0.4;
    ctx.beginPath(); ctx.moveTo(0, topY); ctx.lineTo(0, topY - s * 0.1); ctx.stroke();
    const glow = 0.6 + Math.sin(t * 4) * 0.25;
    ctx.fillStyle = v.ant;
    ctx.globalAlpha = 0.35 * glow;
    ctx.beginPath(); ctx.arc(0, topY - s * 0.12, s * 0.07, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0, topY - s * 0.12, s * 0.04, 0, 7); ctx.fill();
    ctx.restore();
    ctx.restore();
  };

  // ---- portraits for dialogue ----
  K.portrait = function (ctx, who, x, y, size, t) {
    ctx.save();
    ctx.translate(x, y);
    const s = size;
    if (who === 'bolt') { ctx.restore(); K.bolt(ctx, x, y + s * 0.05, s * 1.1, { t, mood: 'happy' }); return; }
    if (who === 'tinker') {
      clayFill(ctx, (g) => { g.beginPath(); g.ellipse(0, s * 0.42, s * 0.42, s * 0.22, 0, Math.PI, 0); g.closePath(); }, '#6a8fbf', s);
      ctx.fillStyle = '#8a5a3a'; ctx.fillRect(-s * 0.2, s * 0.22, s * 0.4, s * 0.2);
      clayFill(ctx, (g) => { g.beginPath(); g.ellipse(0, -s * 0.02, s * 0.27, s * 0.3, 0, 0, 7); }, '#f2c6a0', s);
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath(); ctx.ellipse(-s * 0.26, -s * 0.08, s * 0.08, s * 0.12, 0, 0, 7); ctx.ellipse(s * 0.26, -s * 0.08, s * 0.08, s * 0.12, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-s * 0.1, s * 0.1, s * 0.14, s * 0.06, 0.25, 0, 7); ctx.ellipse(s * 0.1, s * 0.1, s * 0.14, s * 0.06, -0.25, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7a5c4a'; ctx.lineWidth = s * 0.025;
      ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.05, s * 0.07, 0, 7); ctx.moveTo(s * 0.17, -s * 0.05); ctx.arc(s * 0.1, -s * 0.05, s * 0.07, 0, 7); ctx.moveTo(-s * 0.03, -s * 0.05); ctx.lineTo(s * 0.03, -s * 0.05); ctx.stroke();
      ctx.fillStyle = '#3b2a20';
      ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.05, s * 0.022, 0, 7); ctx.arc(s * 0.1, -s * 0.05, s * 0.022, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8a988'; ctx.beginPath(); ctx.ellipse(0, s * 0.03, s * 0.045, s * 0.04, 0, 0, 7); ctx.fill();
    } else if (who === 'mina') {
      clayFill(ctx, (g) => { g.beginPath(); g.ellipse(0, s * 0.42, s * 0.36, s * 0.22, 0, Math.PI, 0); g.closePath(); }, '#e2574c', s);
      ctx.fillStyle = '#3b2a2a';
      ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.3, s * 0.32, 0, 0, 7); ctx.fill();
      clayFill(ctx, (g) => { g.beginPath(); g.ellipse(0, s * 0.02, s * 0.23, s * 0.25, 0, 0, 7); }, '#f5d0b0', s);
      ctx.fillStyle = '#3b2a2a';
      ctx.beginPath(); ctx.ellipse(0, -s * 0.18, s * 0.26, s * 0.12, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffd34d'; R.rr(ctx, s * 0.12, -s * 0.22, s * 0.12, s * 0.05, s * 0.02); ctx.fill();
      ctx.fillStyle = '#2b1d1d';
      ctx.beginPath(); ctx.arc(-s * 0.08, 0, s * 0.028, 0, 7); ctx.arc(s * 0.08, 0, s * 0.028, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a04a3a'; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.arc(0, s * 0.08, s * 0.05, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,110,0.45)'; ctx.beginPath(); ctx.ellipse(-s * 0.14, s * 0.06, s * 0.035, s * 0.02, 0, 0, 7); ctx.ellipse(s * 0.14, s * 0.06, s * 0.035, s * 0.02, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  };
})();

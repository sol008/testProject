'use strict';
// Main 2D canvas in a fixed 540×960 logical space, letterboxed and HiDPI-scaled. Text helpers that always fit.
(function () {
  const G = window.G;
  const R = (G.Render = G.Render || {});
  R.scale = 1;   // logical → CSS pixels
  R.dpr = 1;
  R.offX = 0;
  R.offY = 0;
  R.shake = 0;
  R.flash = 0;

  R.init = function () {
    R.canvas = document.getElementById('game');
    G.ctx = R.canvas.getContext('2d');
    R.resize();
    window.addEventListener('resize', R.resize);
  };

  R.resize = function () {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / G.W, vh / G.H);
    R.scale = s;
    R.dpr = Math.min(2, window.devicePixelRatio || 1);
    // Fill the full height on tall phones: the 540×960 layout stays centred, the extra height (padY, logical px)
    // above and below is painted by scenes with R.fill(). Wide screens keep side letterboxing.
    const cw = Math.round(G.W * s), ch = Math.round(Math.min(vh, G.H * 1.25 * s));
    R.padY = Math.max(0, (ch / s - G.H) / 2);
    R.offX = Math.round((vw - cw) / 2);
    R.offY = Math.round((vh - ch) / 2);
    for (const c of [R.canvas, G.R3 && G.R3.canvas].filter(Boolean)) {
      c.style.width = cw + 'px';
      c.style.height = ch + 'px';
      c.style.left = R.offX + 'px';
      c.style.top = R.offY + 'px';
    }
    R.canvas.width = Math.round(cw * R.dpr);
    R.canvas.height = Math.round(ch * R.dpr);
    if (G.R3 && G.R3.resize) G.R3.resize(cw, ch);
  };

  // CSS client coords → logical coords.
  R.toLogical = (cx, cy) => ({ x: (cx - R.offX) / R.scale, y: (cy - R.offY) / R.scale - R.padY });
  R.toClient = (x, y) => ({ x: R.offX + x * R.scale, y: R.offY + (y + R.padY) * R.scale });
  R.padY = 0;
  // Fill the whole visible canvas (including the padding above/below the 540×960 layout).
  R.fill = function (ctx, style, y0, y1) {
    ctx.fillStyle = style;
    const top = y0 == null ? -R.padY : y0, bot = y1 == null ? G.H + R.padY : y1;
    ctx.fillRect(-2, top, G.W + 4, bot - top);
  };

  R.begin = function (transparent) {
    const ctx = G.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, R.canvas.width, R.canvas.height);
    const k = R.scale * R.dpr;
    let sx = 0, sy = 0;
    if (R.shake > 0 && !(G.Settings && G.Settings.get('reduceFx'))) {
      sx = (Math.random() - 0.5) * R.shake * 14;
      sy = (Math.random() - 0.5) * R.shake * 14;
    }
    ctx.setTransform(k, 0, 0, k, sx * k, (sy + R.padY) * k);
    if (!transparent) R.fill(ctx, G.CONFIG.palette.bg);
  };

  R.update = function (dt) {
    R.shake = Math.max(0, R.shake - dt * 3);
    R.flash = Math.max(0, R.flash - dt * 2.5);
  };

  R.drawOverlays = function (ctx) {
    if (R.flash > 0 && !(G.Settings && G.Settings.get('reduceFx'))) {
      R.fill(ctx, 'rgba(255,250,235,' + (R.flash * 0.5).toFixed(3) + ')');
    }
  };

  R.addShake = (v) => { R.shake = Math.min(1, R.shake + v); };
  R.addFlash = (v) => { R.flash = Math.min(1, R.flash + v); };

  // ---- text ----
  R.font = (size, weight) => (weight || 800) + ' ' + size + 'px ' + G.CONFIG.font.stack;
  R.text = function (ctx, str, x, y, opts) {
    opts = opts || {};
    const size = opts.size || 24;
    ctx.save();
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.base || 'middle';
    let s = size;
    ctx.font = R.font(s, opts.weight);
    if (opts.maxW) {
      while (s > (opts.minSize || 10) && ctx.measureText(str).width > opts.maxW) { s -= 1; ctx.font = R.font(s, opts.weight); }
    }
    if (opts.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = opts.strokeW || Math.max(3, s * 0.18);
      ctx.strokeStyle = opts.stroke;
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = opts.color || G.CONFIG.palette.ink;
    ctx.fillText(str, x, y);
    ctx.restore();
  };
  // Word wrap. Returns the lines; draws them when ctx is given.
  R.wrap = function (ctx, str, x, y, maxW, opts) {
    opts = opts || {};
    const size = opts.size || 22, lh = opts.lh || size * 1.3;
    ctx.save();
    ctx.font = R.font(size, opts.weight || 700);
    const words = String(str).split(/\s+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    if (!opts.measureOnly) {
      ctx.textAlign = opts.align || 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = opts.color || G.CONFIG.palette.ink;
      lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
    }
    ctx.restore();
    return lines;
  };

  // ---- shapes ----
  R.rr = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  // A soft clay panel: drop shadow, body, light top edge.
  R.panel = function (ctx, x, y, w, h, opts) {
    opts = opts || {};
    const r = opts.r == null ? 22 : opts.r;
    ctx.save();
    ctx.fillStyle = opts.shadow || G.CONFIG.palette.shadow;
    R.rr(ctx, x, y + (opts.lift == null ? 6 : opts.lift), w, h, r);
    ctx.fill();
    ctx.fillStyle = opts.fill || G.CONFIG.palette.cream;
    R.rr(ctx, x, y, w, h, r);
    ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.06)');
    ctx.fillStyle = g;
    R.rr(ctx, x, y, w, h, r);
    ctx.fill();
    if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = opts.borderW || 3; R.rr(ctx, x, y, w, h, r); ctx.stroke(); }
    ctx.restore();
  };

  R.shade = function (hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
  };

  R.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return c;
  };
})();

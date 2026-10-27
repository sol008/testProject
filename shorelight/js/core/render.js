// Canvas setup, HiDPI scaling, text helpers, screen transitions.
'use strict';
G.Render = (() => {
  const R = {};
  let canvas, ctx;

  R.init = function () {
    canvas = G.canvas = document.getElementById('game');
    ctx = G.ctx = canvas.getContext('2d', { alpha: false });
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(window.innerWidth / G.W, window.innerHeight / G.H);
    // backing store scale: crisp on Retina, capped for performance
    G.S = G.U.clamp(Math.round(dpr * Math.max(fit, 0.5) * 4) / 4, 1, 2);
    if (G.settings && G.settings.quality === 'low') G.S = 1;
    canvas.width = Math.round(G.W * G.S);
    canvas.height = Math.round(G.H * G.S);
    R.resize();
    window.addEventListener('resize', R.resize);
  };

  R.resize = function () {
    const fit = Math.min(window.innerWidth / G.W, window.innerHeight / G.H);
    canvas.style.width = Math.floor(G.W * fit) + 'px';
    canvas.style.height = Math.floor(G.H * fit) + 'px';
  };

  R.toggleFullscreen = function () {
    const el = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    }
  };

  R.begin = function () {
    ctx.setTransform(G.S, 0, 0, G.S, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  };

  // ---------- text ----------
  // Simple inline markup: {y}yellow{/} {r}red{/} {b}blue{/} {g}green{/} {p}purple{/} {o}orange{/} {w}white{/}
  const COLORS = { y: '#ffd97a', r: '#ff7b6b', b: '#8fd0ff', g: '#9be8a0', p: '#d6a8ff', o: '#ffb36b', w: '#ffffff', d: '#9a9a9a' };
  R.COLORS = COLORS;

  R.parseMarkup = function (text) {
    // returns array of {ch, color}
    const out = [];
    let color = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '{') {
        const j = text.indexOf('}', i);
        if (j > i) {
          const tag = text.slice(i + 1, j);
          if (tag === '/') { color = null; i = j; continue; }
          if (COLORS[tag]) { color = COLORS[tag]; i = j; continue; }
        }
      }
      out.push({ ch: c, color });
    }
    return out;
  };

  const NO_LINE_START = '，。、！？；：」』）》〉…—,.!?;:)';
  // Wrap marked-up text into lines of glyph arrays that fit maxW
  R.wrap = function (ctx2, text, maxW) {
    const glyphs = R.parseMarkup(G.T(String(text)));
    const lines = [];
    let line = [], w = 0;
    let lastSpace = -1; // index in `line` of the last space (for word wrapping Latin text)
    const isLatin = (c) => /[A-Za-z0-9'’\-.,!?;:"()]/.test(c);
    for (const g of glyphs) {
      if (g.ch === '\n') { lines.push(line); line = []; w = 0; lastSpace = -1; continue; }
      const cw = ctx2.measureText(g.ch).width;
      if (w + cw > maxW && line.length) {
        if (g.ch === ' ') { lines.push(line); line = []; w = 0; lastSpace = -1; continue; }
        if (NO_LINE_START.includes(g.ch) && !isLatin(g.ch)) {
          // hang CJK punctuation on this line
          line.push(g); w += cw; continue;
        }
        if (isLatin(g.ch) && lastSpace > 0) {
          // move the partial word to the next line
          const carry = line.slice(lastSpace + 1);
          lines.push(line.slice(0, lastSpace));
          line = carry;
          w = carry.reduce((a, q) => a + ctx2.measureText(q.ch).width, 0);
          lastSpace = -1;
        } else { lines.push(line); line = []; w = 0; lastSpace = -1; }
      }
      if (g.ch === ' ' && !line.length) continue; // no leading spaces
      if (g.ch === ' ') lastSpace = line.length;
      line.push(g); w += cw;
    }
    if (line.length) lines.push(line);
    return lines;
  };
  // translated text width
  R.measure = (ctx2, s) => ctx2.measureText(G.T(String(s))).width;

  // Draw wrapped glyph lines; limit = number of glyphs to show (typewriter)
  R.drawLines = function (ctx2, lines, x, y, lh, baseColor, limit = Infinity, shadow = true) {
    let n = 0;
    for (let li = 0; li < lines.length; li++) {
      let cx = x;
      for (const g of lines[li]) {
        if (n >= limit) return n;
        if (shadow) {
          ctx2.fillStyle = 'rgba(0,0,0,0.55)';
          ctx2.fillText(g.ch, cx + 1.5, y + li * lh + 2);
        }
        ctx2.fillStyle = g.color || baseColor;
        ctx2.fillText(g.ch, cx, y + li * lh);
        cx += ctx2.measureText(g.ch).width;
        n++;
      }
    }
    return n;
  };

  R.countGlyphs = (lines) => lines.reduce((a, l) => a + l.length, 0);

  R.text = function (ctx2, str, x, y, o = {}) {
    str = G.T(str);
    ctx2.save();
    ctx2.font = G.font(o.size || 22, o.bold);
    ctx2.textAlign = o.align || 'left';
    ctx2.textBaseline = o.baseline || 'top';
    if (o.glow) {
      ctx2.shadowColor = o.glow;
      ctx2.shadowBlur = o.glowBlur || 12;
    }
    if (o.shadow !== false && !o.glow) {
      ctx2.fillStyle = 'rgba(0,0,0,0.6)';
      ctx2.fillText(str, x + 1.5, y + 2);
    }
    if (o.stroke) {
      ctx2.lineWidth = o.strokeW || 4;
      ctx2.strokeStyle = o.stroke;
      ctx2.lineJoin = 'round';
      ctx2.strokeText(str, x, y);
    }
    ctx2.fillStyle = o.color || '#f3ead2';
    ctx2.globalAlpha *= o.alpha == null ? 1 : o.alpha;
    ctx2.fillText(str, x, y);
    ctx2.restore();
  };

  // ---------- screen transitions ----------
  // fade: 0 = clear, 1 = fully covered
  R.fade = { a: 0, color: '#000' };
  R.fadeTo = function (a, dur = 0.5, color) {
    if (color) R.fade.color = color;
    return G.Tweens.to(R.fade, { a }, dur, 'linear');
  };
  R.flash = { a: 0, color: '#fff' };
  R.doFlash = function (color = '#fff', dur = 0.35, a = 0.8) {
    R.flash.color = color; R.flash.a = a;
    return G.Tweens.to(R.flash, { a: 0 }, dur, 'outQuad');
  };
  R.shake = { mag: 0, t: 0 };
  R.doShake = function (mag = 8, dur = 0.4) {
    R.shake.mag = mag; R.shake.t = dur; R.shake.dur = dur;
  };
  R.shakeOffset = function () {
    if (R.shake.t <= 0) return [0, 0];
    const k = R.shake.t / (R.shake.dur || 1);
    return [(Math.random() * 2 - 1) * R.shake.mag * k, (Math.random() * 2 - 1) * R.shake.mag * k];
  };
  R.updateFx = function (dt) { if (R.shake.t > 0) R.shake.t -= dt; };
  R.drawOverlays = function () {
    if (R.flash.a > 0.001) {
      ctx.globalAlpha = R.flash.a; ctx.fillStyle = R.flash.color;
      ctx.fillRect(0, 0, G.W, G.H); ctx.globalAlpha = 1;
    }
    if (R.fade.a > 0.001) {
      ctx.globalAlpha = Math.min(1, R.fade.a); ctx.fillStyle = R.fade.color;
      ctx.fillRect(-10, -10, G.W + 20, G.H + 20); ctx.globalAlpha = 1;
    }
  };

  // Snapshot of current screen (for battle transition effects)
  R.snapshot = function () {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0);
    c.lw = G.W; c.lh = G.H;
    return c;
  };

  return R;
})();

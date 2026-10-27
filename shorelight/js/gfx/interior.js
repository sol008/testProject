// 彼岸燈 — interior props. Registers into G.Objects (see docs/CONTRACTS.md "Objects").
//
// Every prop is drawn procedurally in 3/4 top-down view (light from the top-left). Coordinates inside
// the art functions are LOCAL: (0,0) = top-left of the footprint, W = w*64, H = h*64. Props may draw
// above the footprint (negative y) — tall furniture standing in the row directly below a wall rises
// over the wall face, which is exactly how it should read in a room.
//
// Static art is rendered once per type + variant + size into offscreen canvases (G.U.makeCanvas) and
// blitted with drawImage. Only flames, smoke, glows and beams are drawn live from `t`.
//   art(c, W, H, o)         static layer drawn first (cached)
//   live(ctx, x, y, o, t, W, H, ph)   animated layer (x,y = footprint top-left in logical px; ph = 0..1 per-instance phase)
//   front(c, W, H, o)       optional static layer drawn over the live layer (cached) — e.g. a brazier's front rim
//
// Extra (non-contract) def fields used by tools: d.up (px the art rises above the footprint),
// d.wallMount (place on the wall-face row: mural, door_frame), d.resize ('w' | 'wh': o.w / o.h overrides).
//
// Params: chair o.dir ('down'|'up'|'left'|'right', or o.v 0..3) · chest o.open · switch o.on ·
// mural o.v 0..4 · plant_pot o.v 0..2 · shelf_lanterns o.v (arrangement seed) · table / counter /
// shelf_lanterns / jar_row / bookshelf o.w · rug o.w, o.h.
'use strict';
(() => {
  const U = G.U;
  const T = G.TILE || 64;
  const TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, abs = Math.abs;
  const shade = U.shade, mix = U.mix, rgba = U.rgba;

  // ---------------------------------------------------------------------------------------------
  // palette
  const C = {
    wood: '#8f5d36', woodL: '#b5824f', woodD: '#5b3820', teak: '#7a4626', rose: '#5e2b1d', walnut: '#6b4428',
    pine: '#b48a5a', bamboo: '#c9a560', bambooD: '#94733a',
    lac: '#b0281e', lacD: '#6d1610', lacL: '#e0503a',
    gold: '#d7a443', goldL: '#f6d98a', goldD: '#8c6522',
    bronze: '#93703f', bronzeD: '#4e3a1e', patina: '#5f9384',
    paper: '#f1e5c6', ink: '#2a2420',
    stone: '#9a968d', stoneD: '#5d5b57', plaster: '#ebe3d1',
    indigo: '#2f4a7a', jade: '#3fae8f', brick: '#a5452f',
  };
  const LANTERN_COLS = ['#d8342a', '#ee8a2a', '#f2c14e', '#e8739a', '#3fae8f', '#4d9bd6', '#f3ead2', '#8e5bb5', '#c62f4b', '#f06a3a'];

  // ---------------------------------------------------------------------------------------------
  // cache
  const cache = new Map();
  function layer(key, W, H, up, pad, fn) {
    const S = G.S || 1;
    const k = key + '@' + S;
    let cv = cache.get(k);
    if (!cv) {
      cv = U.makeCanvas(W + pad * 2, H + up + pad, S);
      const c = cv.getContext('2d');
      c.translate(pad, up);
      c.lineJoin = 'round'; c.lineCap = 'round';
      try { fn(c); } catch (e) { console.error('interior art', key, e); }
      cv.ox = pad; cv.oy = up;
      cache.set(k, cv);
    }
    return cv;
  }
  const blit = (ctx, cv, px, py) => ctx.drawImage(cv, px - cv.ox, py - cv.oy, cv.lw, cv.lh);

  const META = {};
  function def(type, s) {
    const d = {
      w: s.w || 1, h: s.h || 1,
      solid: s.solid !== false,
      anim: !!(s.live || s.anim),
      over: !!s.over,
      up: s.up || 0,
      wallMount: !!s.wallMount,
      resize: s.resize || null,
    };
    if (s.solidAt) d.solidAt = s.solidAt;
    const dims = (o) => {
      const w = (s.resize && o.w) ? max(1, o.w | 0) : d.w;
      const h = (s.resize === 'wh' && o.h) ? max(1, o.h | 0) : d.h;
      return [w, h];
    };
    const up = (s.up || 0) + 12, pad = s.pad || 14;
    d.draw = (ctx, px, py, o, t) => {
      o = o || {};
      const [w, h] = dims(o);
      const W = w * T, H = h * T;
      const key = type + '|' + w + 'x' + h + '|' + (s.key ? s.key(o) : '');
      blit(ctx, layer(key + '|b', W, H, up, pad, (c) => s.art(c, W, H, o)), px, py);
      if (s.live) s.live(ctx, px, py, o, t || 0, W, H, U.hash((o.x | 0) + 11, (o.y | 0) + 7, 91));
      if (s.front) blit(ctx, layer(key + '|f', W, H, up, pad, (c) => s.front(c, W, H, o)), px, py);
    };
    if (s.lights) d.lights = (o) => { o = o || {}; const [w, h] = dims(o); return s.lights(o, w * T, h * T); };
    META[type] = d;
    G.Objects.define(type, d);
  }

  // ---------------------------------------------------------------------------------------------
  // drawing helpers
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const ell = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, max(0.01, rx), max(0.01, ry), 0, 0, TAU); };
  function lg(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }
  function rg(c, x, y, r, stops, x0, y0, r0) {
    const g = c.createRadialGradient(x0 == null ? x : x0, y0 == null ? y : y0, r0 || 0, x, y, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    return g;
  }
  function fs(c, fill, stroke, lw) {
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = lw || 1.4; c.strokeStyle = stroke; c.stroke(); }
  }
  const ol = (col, a) => shade(col, a == null ? -0.55 : a);
  function line(c, x1, y1, x2, y2, col, lw) {
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = col; c.lineWidth = lw || 1; c.stroke();
  }

  // soft elliptical ground shadow
  function ground(c, cx, cy, rx, ry, a) {
    a = a == null ? 0.34 : a;
    c.save(); c.translate(cx, cy); c.scale(1, ry / rx);
    c.fillStyle = rg(c, 0, 0, rx, [[0, `rgba(25,12,6,${a})`], [0.55, `rgba(25,12,6,${a * 0.6})`], [1, 'rgba(25,12,6,0)']]);
    c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill();
    c.restore();
  }
  // soft rectangular contact shadow
  function groundRect(c, x, y, w, h, a) {
    a = a == null ? 0.3 : a;
    for (let i = 5; i >= 0; i--) {
      rr(c, x - i * 1.6, y - i * 0.8, w + i * 3.2, h + i * 1.8, 4 + i * 2);
      c.fillStyle = `rgba(25,12,6,${a / 6})`; c.fill();
    }
  }

  // wood grain into a rect (assumes clip already set, or sets its own)
  function grain(c, x, y, w, h, base, seed, vertical, dens) {
    const r = U.seeded((seed * 7919 + 13) >>> 0);
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    const L = vertical ? h : w, Wd = vertical ? w : h;
    const n = max(2, Math.round(Wd / (dens || 2.4)));
    for (let i = 0; i < n; i++) {
      const off = r() * Wd;
      const dark = r() < 0.62;
      c.strokeStyle = rgba(dark ? shade(base, -0.5) : shade(base, 0.38), dark ? 0.1 + r() * 0.16 : 0.07 + r() * 0.12);
      c.lineWidth = 0.45 + r() * 0.8;
      const ph = r() * 10, amp = 0.3 + r() * 1.3, fr = 0.025 + r() * 0.05;
      c.beginPath();
      for (let s = 0; s <= L + 4; s += 4) {
        const d = off + sin(s * fr + ph) * amp;
        if (vertical) { if (s) c.lineTo(x + d, y + s); else c.moveTo(x + d, y + s); } else { if (s) c.lineTo(x + s, y + d); else c.moveTo(x + s, y + d); }
      }
      c.stroke();
    }
    if (r() < 0.4 && w > 16 && h > 10) {
      const kx = x + w * (0.2 + r() * 0.6), ky = y + h * (0.25 + r() * 0.5);
      for (let k = 3; k >= 1; k--) {
        c.beginPath(); c.ellipse(kx, ky, vertical ? k * 0.9 : k * 2.2, vertical ? k * 2.2 : k * 0.9, 0, 0, TAU);
        c.strokeStyle = rgba(shade(base, -0.5), 0.18); c.lineWidth = 0.6; c.stroke();
      }
    }
    c.restore();
  }
  // a wooden board / block face: gradient + grain + outline + top-edge highlight
  function board(c, x, y, w, h, base, seed, o) {
    o = o || {};
    const r = o.r == null ? 1.5 : o.r;
    rr(c, x, y, w, h, r);
    c.fillStyle = lg(c, x, y, x + w * 0.3, y + h, [[0, shade(base, o.hi == null ? 0.1 : o.hi)], [1, shade(base, o.lo == null ? -0.14 : o.lo)]]);
    c.fill();
    if (o.grain !== false && w > 3 && h > 3) grain(c, x, y, w, h, base, seed || 1, o.vertical, o.dens);
    if (o.hl !== false && w > 4) { c.fillStyle = rgba('#fff4dc', o.hla || 0.16); c.fillRect(x + 1, y + 0.6, w - 2, 1.1); }
    if (o.stroke !== false) { rr(c, x, y, w, h, r); c.lineWidth = o.lw || 1.2; c.strokeStyle = o.sc || ol(base); c.stroke(); }
  }
  // vertical darkening at the bottom of a face (ambient occlusion)
  function aoBottom(c, x, y, w, h, a) {
    c.fillStyle = lg(c, 0, y, 0, y + h, [[0, 'rgba(20,10,5,0)'], [1, `rgba(20,10,5,${a || 0.35})`]]);
    c.fillRect(x, y, w, h);
  }
  function aoTop(c, x, y, w, h, a) {
    c.fillStyle = lg(c, 0, y, 0, y + h, [[0, `rgba(15,8,4,${a || 0.5})`], [1, 'rgba(15,8,4,0)']]);
    c.fillRect(x, y, w, h);
  }
  // lacquered panel (red by default) with soft specular sheen
  function lacquer(c, x, y, w, h, base, r) {
    rr(c, x, y, w, h, r || 1.5);
    c.fillStyle = lg(c, x, y, x + w * 0.4, y + h, [[0, shade(base, 0.12)], [0.5, base], [1, shade(base, -0.28)]]);
    c.fill();
    c.save(); rr(c, x, y, w, h, r || 1.5); c.clip();
    c.fillStyle = lg(c, x, y, x + w, y + h * 0.3, [[0, 'rgba(255,240,220,0)'], [0.25, 'rgba(255,240,220,0.22)'], [0.4, 'rgba(255,240,220,0)']]);
    c.fillRect(x, y, w, h);
    c.restore();
    rr(c, x, y, w, h, r || 1.5); c.lineWidth = 1.2; c.strokeStyle = ol(base, -0.6); c.stroke();
  }
  // gold leaf thin frame line
  function goldLine(c, x, y, w, h, r) {
    rr(c, x, y, w, h, r || 1); c.lineWidth = 0.9; c.strokeStyle = rgba(C.goldL, 0.85); c.stroke();
  }
  // cylinder fill gradient (horizontal shading, light from left)
  function cylGrad(c, x0, x1, base, hi, lo) {
    return lg(c, x0, 0, x1, 0, [[0, shade(base, -0.35)], [0.18, shade(base, hi == null ? 0.25 : hi)], [0.35, shade(base, 0.05)], [0.8, shade(base, lo == null ? -0.3 : lo)], [1, shade(base, -0.5)]]);
  }
  function speckle(c, x, y, w, h, n, col, a, seed, rmax) {
    const r = U.seeded(seed || 7);
    c.fillStyle = rgba(col, a);
    for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + r() * w, y + r() * h, 0.3 + r() * (rmax || 0.9), 0, TAU); c.fill(); }
  }
  // brass/bronze round plate with highlight
  function brassDot(c, x, y, r, col) {
    col = col || C.gold;
    ell(c, x, y, r, r);
    c.fillStyle = rg(c, x, y, r, [[0, shade(col, 0.55)], [0.5, col], [1, shade(col, -0.45)]], x - r * 0.35, y - r * 0.35, 0);
    c.fill(); c.lineWidth = 0.7; c.strokeStyle = shade(col, -0.6); c.stroke();
  }

  // paper lantern — x,y body centre; rw/rh half extents
  // opt: shape 'round'|'long'|'drum'|'palace'|'skeleton', motif 0..5, lit, tassel, cap, paper (unpainted)
  function lantern(c, x, y, rw, rh, col, opt) {
    opt = opt || {};
    const shape = opt.shape || 'round';
    const capC = opt.cap || '#2f1d14';
    const top = y - rh, bot = y + rh;
    // tassel
    if (opt.tassel !== false) {
      const tc = opt.tasselCol || (col === '#d8342a' || col === '#c62f4b' ? C.gold : '#c8302a');
      line(c, x, bot + 1, x, bot + 4, shade(tc, -0.2), 1);
      c.beginPath(); c.moveTo(x - 1.6, bot + 4); c.lineTo(x + 1.6, bot + 4); c.lineTo(x + 2.4, bot + 4 + rh * 0.55); c.lineTo(x - 2.4, bot + 4 + rh * 0.55); c.closePath();
      c.fillStyle = lg(c, 0, bot + 4, 0, bot + 4 + rh * 0.55, [[0, shade(tc, 0.15)], [1, shade(tc, -0.3)]]); c.fill();
      brassDot(c, x, bot + 4, 1.6, C.gold);
    }
    if (opt.hang) line(c, x, top - opt.hang, x, top - 1, '#3a2a20', 0.9);
    // body path
    const body = () => {
      c.beginPath();
      if (shape === 'drum') c.roundRect(x - rw, y - rh, rw * 2, rh * 2, [rw * 0.5, rw * 0.5, rw * 0.5, rw * 0.5]);
      else if (shape === 'palace') {
        c.moveTo(x - rw * 0.7, top); c.lineTo(x + rw * 0.7, top); c.lineTo(x + rw, y - rh * 0.45); c.lineTo(x + rw, y + rh * 0.45);
        c.lineTo(x + rw * 0.7, bot); c.lineTo(x - rw * 0.7, bot); c.lineTo(x - rw, y + rh * 0.45); c.lineTo(x - rw, y - rh * 0.45); c.closePath();
      } else c.ellipse(x, y, rw, rh, 0, 0, TAU);
    };
    if (shape !== 'skeleton') {
      body();
      if (opt.lit) {
        c.fillStyle = rg(c, x, y, max(rw, rh) * 1.05, [[0, mix(col, '#fff6cf', 0.75)], [0.45, mix(col, '#ffe4a0', 0.35)], [1, shade(col, -0.15)]]);
      } else {
        c.fillStyle = rg(c, x, y, max(rw, rh) * 1.25, [[0, shade(col, 0.32)], [0.55, col], [1, shade(col, -0.38)]], x - rw * 0.4, y - rh * 0.45, 0);
      }
      c.fill();
    }
    // ribs
    c.save();
    if (shape !== 'skeleton') { body(); c.clip(); }
    const ribs = opt.ribs || (shape === 'palace' ? 0 : 5);
    c.lineWidth = shape === 'skeleton' ? 0.9 : 0.6;
    c.strokeStyle = shape === 'skeleton' ? C.bambooD : rgba(shade(col, -0.45), opt.lit ? 0.3 : 0.45);
    for (let k = 1; k < ribs; k++) {
      const f = -1 + (2 * k) / ribs;
      c.beginPath(); c.ellipse(x, y, max(0.3, rw * abs(f)), rh, 0, -PI / 2, PI / 2, f < 0); c.stroke();
    }
    if (shape === 'skeleton') {
      for (const f of [-0.6, -0.2, 0.2, 0.6]) {
        const yy = y + f * rh, ww = rw * Math.sqrt(1 - f * f);
        c.beginPath(); c.ellipse(x, yy, ww, 1.4, 0, 0, PI); c.stroke();
      }
      c.beginPath(); c.ellipse(x, y, rw, rh, 0, 0, TAU); c.stroke();
    }
    // pleat bands (horizontal ribs) for round/long
    if (shape === 'round' || shape === 'long') {
      c.strokeStyle = rgba(shade(col, -0.4), opt.lit ? 0.18 : 0.28);
      for (let k = 1; k < 7; k++) {
        const f = -1 + (2 * k) / 7, yy = y + f * rh, ww = rw * Math.sqrt(1 - f * f);
        c.beginPath(); c.ellipse(x, yy, ww, 1.2, 0, 0, PI); c.stroke();
      }
    }
    if (shape !== 'skeleton') {
      const m = opt.motif || 0;
      if (m === 1) { // gold bands
        c.fillStyle = rgba(C.goldL, 0.85); c.fillRect(x - rw, top + rh * 0.22, rw * 2, rh * 0.14); c.fillRect(x - rw, bot - rh * 0.36, rw * 2, rh * 0.14);
      } else if (m === 2) { // painted plum blossoms
        const r = U.seeded(((x * 13 + y * 7) | 0) + 3);
        for (let k = 0; k < 4; k++) {
          const fx = x + (r() - 0.5) * rw * 1.1, fy = y + (r() - 0.5) * rh * 1.1, fr = 1.2 + r() * 1.3;
          c.fillStyle = rgba('#fff3f0', 0.9);
          for (let p = 0; p < 5; p++) { ell(c, fx + cos(p * 1.256) * fr, fy + sin(p * 1.256) * fr, fr * 0.75, fr * 0.75); c.fill(); }
          c.fillStyle = C.gold; ell(c, fx, fy, fr * 0.45, fr * 0.45); c.fill();
        }
        c.strokeStyle = rgba('#3b2418', 0.6); c.lineWidth = 0.7;
        c.beginPath(); c.moveTo(x - rw, y + rh * 0.5); c.quadraticCurveTo(x - rw * 0.2, y + rh * 0.1, x + rw * 0.4, y - rh * 0.4); c.stroke();
      } else if (m === 3) { // calligraphy roundel (福-ish brush mark)
        ell(c, x, y, rw * 0.5, rh * 0.42); c.fillStyle = rgba(opt.lit ? '#fff8e0' : '#f6e7c4', 0.9); c.fill();
        c.strokeStyle = '#2a1712'; c.lineWidth = max(0.8, rw * 0.11);
        c.beginPath();
        c.moveTo(x - rw * 0.26, y - rh * 0.18); c.lineTo(x - rw * 0.26, y + rh * 0.22);
        c.moveTo(x - rw * 0.36, y - rh * 0.08); c.lineTo(x - rw * 0.16, y - rh * 0.1);
        c.moveTo(x - rw * 0.02, y - rh * 0.22); c.lineTo(x + rw * 0.28, y - rh * 0.22);
        c.moveTo(x, y - rh * 0.04); c.lineTo(x + rw * 0.26, y - rh * 0.04); c.lineTo(x + rw * 0.24, y + rh * 0.24); c.lineTo(x, y + rh * 0.24); c.closePath();
        c.moveTo(x + rw * 0.13, y - rh * 0.04); c.lineTo(x + rw * 0.13, y + rh * 0.24);
        c.stroke();
      } else if (m === 4) { // stripes
        c.fillStyle = rgba(shade(col, -0.35), 0.45);
        for (let k = -2; k <= 2; k++) c.fillRect(x - rw, y + k * rh * 0.36 - rh * 0.05, rw * 2, rh * 0.1);
      } else if (m === 5) { // wave pattern
        c.strokeStyle = rgba('#ffffff', 0.7); c.lineWidth = 0.8;
        for (let k = -1; k <= 1; k++) {
          c.beginPath();
          for (let s = -rw; s <= rw; s += rw / 3) c.arc(x + s, y + k * rh * 0.45 + 1.5, rw / 6, PI, 0);
          c.stroke();
        }
      }
      // highlight
      if (!opt.lit) {
        c.fillStyle = rgba('#ffffff', 0.32);
        c.beginPath(); c.ellipse(x - rw * 0.45, y - rh * 0.38, rw * 0.18, rh * 0.32, -0.35, 0, TAU); c.fill();
      } else {
        c.fillStyle = rg(c, x, y, rw * 0.8, [[0, 'rgba(255,255,235,0.6)'], [1, 'rgba(255,255,235,0)']]);
        c.fillRect(x - rw, y - rh, rw * 2, rh * 2);
      }
    }
    c.restore();
    if (shape !== 'skeleton') { body(); c.lineWidth = 1.1; c.strokeStyle = shade(col, -0.55); c.stroke(); }
    // caps
    const cw = shape === 'drum' || shape === 'palace' ? rw * 1.1 : rw * 0.8;
    rr(c, x - cw / 2 - 1, top - 2.5, cw + 2, 4, 1.2); c.fillStyle = capC; c.fill();
    c.fillStyle = rgba('#ffffff', 0.18); c.fillRect(x - cw / 2, top - 2.2, cw, 0.9);
    rr(c, x - cw / 2 - 1, bot - 1.5, cw + 2, 4, 1.2); c.fillStyle = capC; c.fill();
    if (shape === 'palace') {
      c.strokeStyle = shade(capC, 0.25); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(x - rw * 0.7, top); c.lineTo(x - rw * 0.7, bot); c.moveTo(x + rw * 0.7, top); c.lineTo(x + rw * 0.7, bot); c.stroke();
    }
  }

  // ----- live helpers --------------------------------------------------------------------------
  const FL = {
    warm: { glow: '#ff9a3a', o0: '#ff5418', o1: '#ffb43a', i0: '#fff6d0', i1: '#ffd25e' },
    candle: { glow: '#ffb653', o0: '#ff7a22', o1: '#ffd060', i0: '#ffffff', i1: '#fff0a8' },
    blue: { glow: '#4fb4ff', o0: '#2a6dff', o1: '#78cfff', i0: '#ffffff', i1: '#c4f0ff' },
    pale: { glow: '#ffe2a0', o0: '#ffc560', o1: '#fff0c0', i0: '#ffffff', i1: '#fffbe8' },
  };
  function tongue(ctx, x, y, hw, h, sw, fill) {
    ctx.beginPath();
    ctx.moveTo(x - hw, y - hw * 0.2);
    ctx.bezierCurveTo(x - hw * 1.05, y - h * 0.45, x + sw - hw * 0.3, y - h * 0.72, x + sw, y - h);
    ctx.bezierCurveTo(x + sw + hw * 0.3, y - h * 0.72, x + hw * 1.05, y - h * 0.45, x + hw, y - hw * 0.2);
    ctx.arc(x, y - hw * 0.2, hw, 0, PI);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }
  // flame with base at (x,y); s = size (≈ half width * 1.6)
  function flame(ctx, x, y, s, t, ph, pal, glowMul) {
    pal = pal || FL.warm;
    const p = ph * 40;
    const f1 = sin(t * 11 + p), f2 = sin(t * 17.3 + p * 1.7), f3 = sin(t * 4.3 + p * 0.6);
    const h = s * (2.0 + 0.2 * f1 + 0.12 * f2);
    const sw = s * (0.22 * f3 + 0.1 * f2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gr = s * 3.4 * (glowMul || 1);
    ctx.fillStyle = rg(ctx, x, y - s * 0.8, gr, [[0, rgba(pal.glow, 0.42 + 0.06 * f1)], [0.4, rgba(pal.glow, 0.14)], [1, rgba(pal.glow, 0)]]);
    ctx.fillRect(x - gr, y - s * 0.8 - gr, gr * 2, gr * 2);
    ctx.restore();
    tongue(ctx, x, y, s * 0.6, h, sw, lg(ctx, 0, y, 0, y - h, [[0, rgba(pal.o1, 0.95)], [0.6, rgba(pal.o0, 0.9)], [1, rgba(pal.o0, 0.15)]]));
    tongue(ctx, x, y - s * 0.02, s * 0.34, h * 0.6, sw * 0.6, lg(ctx, 0, y, 0, y - h * 0.6, [[0, pal.i0], [1, rgba(pal.i1, 0.6)]]));
  }
  function smoke(ctx, x, y, t, ph, h, n, a, col) {
    h = h || 56; n = n || 7; a = a == null ? 0.26 : a; col = col || '#dcd6cc';
    for (let k = 0; k < n; k++) {
      const life = (t * 0.2 + k / n + ph) % 1;
      const yy = y - life * h;
      const xx = x + sin(life * 5 + t * 0.8 + k * 1.3 + ph * 6) * (1.5 + life * 9);
      const r = 1.6 + life * 7;
      const al = a * min(1, life * 6) * (1 - life);
      ctx.fillStyle = rg(ctx, xx, yy, r, [[0, rgba(col, al)], [1, rgba(col, 0)]]);
      ctx.fillRect(xx - r, yy - r, r * 2, r * 2);
    }
    ctx.beginPath();
    for (let s = 0; s <= 1.0001; s += 0.1) {
      const px = x + sin(s * 7 - t * 2.2 + ph * 9) * s * 3.5, py = y - s * h * 0.42;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = rgba(col, a * 0.9); ctx.lineWidth = 0.9; ctx.stroke();
  }
  function glow(ctx, x, y, r, col, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rg(ctx, x, y, r, [[0, rgba(col, a)], [0.45, rgba(col, a * 0.35)], [1, rgba(col, 0)]]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  // red lacquer small temple table, used by several props. Top surface y0..y0+d
  function redTable(c, x, y0, w, d, legBot) {
    const fy = y0 + d;
    // back legs
    board(c, x + 4, fy - 4, 4, legBot - fy - 4, C.lacD, 3, { grain: false });
    board(c, x + w - 8, fy - 4, 4, legBot - fy - 4, C.lacD, 3, { grain: false });
    // front legs with horse-hoof feet
    for (const lx of [x + 2, x + w - 8]) {
      c.beginPath(); c.moveTo(lx, fy); c.lineTo(lx + 6, fy); c.lineTo(lx + 6, legBot - 3);
      c.quadraticCurveTo(lx + 6, legBot, lx + (lx < x + w / 2 ? 2 : 9), legBot); c.lineTo(lx + (lx < x + w / 2 ? -1 : 4), legBot);
      c.quadraticCurveTo(lx, legBot - 1, lx, legBot - 4); c.closePath();
      c.fillStyle = lg(c, lx, 0, lx + 6, 0, [[0, C.lacL], [0.5, C.lac], [1, C.lacD]]); c.fill();
      c.strokeStyle = ol(C.lac, -0.65); c.lineWidth = 1; c.stroke();
    }
    // apron
    c.beginPath(); c.moveTo(x + 8, fy + 4); c.lineTo(x + w - 8, fy + 4); c.lineTo(x + w - 8, fy + 8);
    c.bezierCurveTo(x + w - 14, fy + 8, x + w - 14, fy + 12, x + w / 2 + 6, fy + 11);
    c.quadraticCurveTo(x + w / 2, fy + 14, x + w / 2 - 6, fy + 11);
    c.bezierCurveTo(x + 14, fy + 12, x + 14, fy + 8, x + 8, fy + 8); c.closePath();
    fs(c, lg(c, 0, fy + 4, 0, fy + 13, [[0, C.lac], [1, C.lacD]]), ol(C.lac, -0.65), 1);
    line(c, x + 12, fy + 6.5, x + w - 12, fy + 6.5, rgba(C.goldL, 0.7), 0.7);
    // top
    lacquer(c, x, fy, w, 5, shade(C.lac, -0.15), 1);
    lacquer(c, x, y0, w, d, C.lac, 2);
    goldLine(c, x + 2.5, y0 + 2.5, w - 5, d - 5, 1);
  }

  // =============================================================================================
  // FURNITURE
  // =============================================================================================

  // 八仙桌 square table; o.w widens it into a long table
  def('table', {
    w: 1, resize: 'w', up: 0,
    art(c, W) {
      const base = C.teak;
      groundRect(c, 6, 44, W - 12, 16, 0.32);
      const L = 4, R = W - 4;
      board(c, L + 5, 30, 5, 22, shade(base, -0.35), 1, { grain: false });
      board(c, R - 10, 30, 5, 22, shade(base, -0.35), 2, { grain: false });
      if (W > 64) for (let i = 1; i < W / 64; i++) board(c, i * 64 - 2, 30, 4, 22, shade(base, -0.38), 2, { grain: false });
      // apron with cloud cut-out
      c.beginPath(); c.moveTo(L + 6, 31); c.lineTo(R - 6, 31); c.lineTo(R - 6, 36);
      c.bezierCurveTo(R - 13, 36, R - 12, 41, R - 20, 39); c.lineTo(L + 20, 39);
      c.bezierCurveTo(L + 12, 41, L + 13, 36, L + 6, 36); c.closePath();
      fs(c, lg(c, 0, 31, 0, 41, [[0, shade(base, -0.2)], [1, shade(base, -0.45)]]), ol(base), 1);
      line(c, L + 9, 33.5, R - 9, 33.5, rgba(shade(base, 0.3), 0.4), 0.7);
      // front legs
      for (const lx of [L + 1, R - 8]) {
        board(c, lx, 29, 7, 31, shade(base, -0.08), lx, { vertical: true, r: 1.2 });
        aoBottom(c, lx, 50, 7, 10, 0.25);
      }
      // top edge + surface
      board(c, L - 1, 26, R - L + 2, 6, shade(base, -0.18), 3, { r: 1.5 });
      board(c, L - 1, 5, R - L + 2, 22, shade(base, 0.04), 4, { r: 2.5, dens: 2 });
      // lacquer sheen
      c.save(); rr(c, L - 1, 5, R - L + 2, 22, 2.5); c.clip();
      c.fillStyle = lg(c, L, 5, L + 40, 27, [[0, 'rgba(255,235,200,0)'], [0.45, 'rgba(255,235,200,0.14)'], [0.6, 'rgba(255,235,200,0)']]);
      c.fillRect(L - 1, 5, R - L + 2, 22);
      c.restore();
      line(c, L + 1, 26.6, R - 1, 26.6, rgba('#ffe6c0', 0.35), 1);
    },
  });

  // chair — o.dir 'down' (default) | 'up' | 'left' | 'right'
  const chairDir = (o) => o.dir || ['down', 'up', 'left', 'right'][(o.v | 0) % 4];
  def('chair', {
    up: 16, key: chairDir,
    art(c, W, H, o) {
      const dir = chairDir(o);
      const base = C.teak, dk = shade(base, -0.25);
      ground(c, 32, 55, 19, 6, 0.32);
      const crest = (y, x0, x1) => {
        c.beginPath(); c.moveTo(x0, y - 3); c.quadraticCurveTo((x0 + x1) / 2, y + 3, x1, y - 3);
        c.lineWidth = 5; c.strokeStyle = ol(base); c.stroke();
        c.lineWidth = 3.4; c.strokeStyle = base; c.stroke();
        c.beginPath(); c.moveTo(x0 + 1, y - 4); c.quadraticCurveTo((x0 + x1) / 2, y + 1.6, x1 - 1, y - 4);
        c.lineWidth = 1; c.strokeStyle = rgba('#ffe2c0', 0.4); c.stroke();
      };
      if (dir === 'down') {
        board(c, 18, -6, 5, 46, dk, 1, { vertical: true });
        board(c, 41, -6, 5, 46, dk, 2, { vertical: true });
        board(c, 28, -2, 8, 32, shade(base, -0.1), 3, { vertical: true, r: 2 });
        ell(c, 32, 8, 2.6, 3.2); fs(c, shade(base, -0.4), null);
        ell(c, 32, 8, 1.2, 1.6); fs(c, rgba(C.gold, 0.7), null);
        crest(-6, 13, 51);
        board(c, 19, 40, 4, 14, shade(base, -0.4), 4, { grain: false });
        board(c, 41, 40, 4, 14, shade(base, -0.4), 5, { grain: false });
        board(c, 15, 26, 34, 14, shade(base, 0.05), 6, { r: 2 });
        board(c, 15, 39, 34, 4.5, shade(base, -0.2), 7, { r: 1 });
        board(c, 16, 43, 5, 17, base, 8, { vertical: true });
        board(c, 43, 43, 5, 17, base, 9, { vertical: true });
        board(c, 21, 52, 22, 2.5, dk, 10, { grain: false, hl: false });
      } else if (dir === 'up') {
        board(c, 18, 32, 4, 18, shade(base, -0.4), 4, { grain: false });
        board(c, 42, 32, 4, 18, shade(base, -0.4), 5, { grain: false });
        board(c, 15, 20, 34, 13, shade(base, 0.05), 6, { r: 2 });
        board(c, 15, 32, 34, 4, shade(base, -0.2), 7, { r: 1 });
        board(c, 16, 6, 5, 54, dk, 1, { vertical: true });
        board(c, 43, 6, 5, 54, dk, 2, { vertical: true });
        board(c, 28, 8, 8, 30, shade(base, -0.28), 3, { vertical: true, r: 2 });
        crest(6, 11, 53);
        board(c, 21, 50, 22, 2.5, dk, 10, { grain: false, hl: false });
      } else {
        c.save();
        if (dir === 'right') { c.translate(64, 0); c.scale(-1, 1); }
        board(c, 19, 40, 4, 16, shade(base, -0.4), 4, { grain: false });
        board(c, 15, 30, 32, 10, shade(base, 0.05), 6, { r: 2 });
        board(c, 15, 39, 32, 4.5, shade(base, -0.18), 7, { r: 1 });
        board(c, 16, 42, 5, 18, base, 8, { vertical: true });
        board(c, 41, 42, 5, 18, base, 9, { vertical: true });
        board(c, 40, -4, 7, 46, dk, 1, { vertical: true });
        c.beginPath(); c.moveTo(37, -6); c.quadraticCurveTo(44, -3, 50, -9);
        c.lineWidth = 5; c.strokeStyle = ol(base); c.stroke(); c.lineWidth = 3.4; c.strokeStyle = base; c.stroke();
        board(c, 21, 51, 22, 2.5, dk, 10, { grain: false, hl: false });
        c.restore();
      }
    },
  });

  // bed — 1x2, headboard against the wall above, 客家花布 quilt
  def('bed', {
    w: 1, h: 2, up: 36,
    art(c, W, H) {
      const base = C.rose;
      groundRect(c, 2, 24, 60, 102, 0.32);
      // headboard + posts
      board(c, 2, -34, 7, 58, shade(base, -0.1), 1, { vertical: true });
      board(c, 55, -34, 7, 58, shade(base, -0.1), 2, { vertical: true });
      for (const px of [5.5, 58.5]) brassDot(c, px, -35, 3.6, '#7a3c22');
      board(c, 9, -26, 46, 42, base, 3, { r: 1 });
      // lattice panel
      rr(c, 13, -22, 38, 30, 2); fs(c, shade(base, -0.45), null);
      c.save(); rr(c, 13, -22, 38, 30, 2); c.clip();
      c.strokeStyle = shade(base, 0.18); c.lineWidth = 1.3;
      for (let i = -40; i < 60; i += 7) { c.beginPath(); c.moveTo(13 + i, -22); c.lineTo(13 + i + 30, 8); c.stroke(); c.beginPath(); c.moveTo(51 - i, -22); c.lineTo(51 - i - 30, 8); c.stroke(); }
      c.restore();
      rr(c, 13, -22, 38, 30, 2); c.strokeStyle = shade(base, 0.25); c.lineWidth = 1.2; c.stroke();
      ell(c, 32, -7, 6, 6); fs(c, shade(base, 0.05), shade(base, -0.5), 1);
      ell(c, 32, -7, 3, 3); fs(c, C.gold, null);
      board(c, 6, -30, 52, 5, shade(base, 0.08), 4);
      // side rails
      board(c, 2, 14, 7, 100, shade(base, -0.05), 5, { vertical: true });
      board(c, 55, 14, 7, 100, shade(base, -0.05), 6, { vertical: true });
      // mattress (rattan)
      rr(c, 8, 14, 48, 96, 3); fs(c, lg(c, 8, 0, 56, 0, [[0, '#e3d2a6'], [1, '#c4ad7c']]), null);
      c.save(); rr(c, 8, 14, 48, 96, 3); c.clip();
      for (let y = 15; y < 110; y += 2.2) line(c, 8, y, 56, y, rgba('#8a7346', 0.22), 0.6);
      c.restore();
      // pillow
      rr(c, 13, 18, 38, 15, 6);
      fs(c, lg(c, 0, 18, 0, 33, [[0, '#fbf4e4'], [1, '#d9ccb2']]), '#9d8e74', 1);
      rr(c, 14, 30, 36, 2, 1); fs(c, rgba('#6a5a44', 0.2), null);
      c.fillStyle = '#c84a3a'; for (const fx of [22, 32, 42]) { ell(c, fx, 25, 2.2, 1.6); c.fill(); }
      c.fillStyle = '#4f8a5a'; for (const fx of [26.5, 37.5]) { ell(c, fx, 25.5, 1.6, 0.9); c.fill(); }
      // quilt (客家花布: red ground, peonies)
      const qx = 5, qy = 42, qw = 54, qh = 68;
      c.beginPath(); c.moveTo(qx + 2, qy); c.lineTo(qx + qw - 2, qy); c.quadraticCurveTo(qx + qw + 1, qy + 30, qx + qw, qy + qh);
      c.lineTo(qx, qy + qh); c.quadraticCurveTo(qx - 1, qy + 30, qx + 2, qy); c.closePath();
      c.fillStyle = lg(c, qx, 0, qx + qw, 0, [[0, '#c63a2c'], [0.5, '#b22e24'], [1, '#86201a']]); c.fill();
      c.save(); c.clip();
      const r = U.seeded(42);
      for (let i = 0; i < 9; i++) {
        const fx = qx + 6 + (i % 3) * 18 + (Math.floor(i / 3) % 2) * 9, fy = qy + 14 + Math.floor(i / 3) * 19;
        c.fillStyle = '#2f7a4a';
        for (const a of [0.6, 2.4, 4.2]) { c.beginPath(); c.ellipse(fx + cos(a) * 5, fy + sin(a) * 4, 3.4, 1.6, a, 0, TAU); c.fill(); }
        const pc = r() < 0.5 ? '#f3a6b8' : '#f7e6b8';
        for (let p = 0; p < 6; p++) { ell(c, fx + cos(p * 1.05) * 2.6, fy + sin(p * 1.05) * 2.2, 2.6, 2.2); c.fillStyle = pc; c.fill(); }
        ell(c, fx, fy, 1.8, 1.6); c.fillStyle = '#f4d35e'; c.fill();
      }
      for (let i = 0; i < 40; i++) { c.fillStyle = rgba('#ffffff', 0.5); ell(c, qx + r() * qw, qy + r() * qh, 0.6, 0.6); c.fill(); }
      // soft folds
      c.fillStyle = lg(c, qx, 0, qx + qw, 0, [[0, 'rgba(0,0,0,0)'], [0.3, 'rgba(255,255,255,0.08)'], [0.42, 'rgba(0,0,0,0.12)'], [0.6, 'rgba(0,0,0,0)'], [0.8, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.25)']]);
      c.fillRect(qx, qy, qw, qh);
      c.restore();
      c.strokeStyle = '#5a140f'; c.lineWidth = 1.1; c.stroke();
      // turned-down sheet band
      rr(c, qx + 1, qy - 2, qw - 2, 8, 3); fs(c, lg(c, 0, qy - 2, 0, qy + 6, [[0, '#fbf6ea'], [1, '#d8cdb4']]), '#9c8f78', 1);
      // foot board
      board(c, 2, 108, 60, 14, base, 7, { r: 1.5 });
      rr(c, 8, 111, 48, 8, 1); fs(c, shade(base, -0.3), shade(base, 0.2), 0.8);
      board(c, 2, 104, 7, 22, shade(base, 0.05), 8, { vertical: true });
      board(c, 55, 104, 7, 22, shade(base, 0.05), 9, { vertical: true });
    },
  });

  // tall 頂箱櫃 cabinet with brass fittings
  def('cabinet', {
    up: 56,
    art(c) {
      const base = C.rose;
      groundRect(c, 4, 50, 56, 12, 0.36);
      board(c, 6, 50, 6, 10, shade(base, -0.1), 1, { grain: false });
      board(c, 52, 50, 6, 10, shade(base, -0.1), 2, { grain: false });
      c.beginPath(); c.moveTo(12, 50); c.lineTo(52, 50); c.lineTo(52, 53); c.quadraticCurveTo(32, 58, 12, 53); c.closePath();
      fs(c, shade(base, -0.25), ol(base), 1);
      board(c, 6, -42, 52, 93, base, 3, { vertical: true, r: 1 });
      // top surface + cornice
      board(c, 3, -54, 58, 9, shade(base, 0.12), 4, { r: 1.5 });
      board(c, 3, -46, 58, 5, shade(base, -0.15), 5, { r: 1 });
      // doors (upper pair, lower pair)
      const door = (x, y, w, h, s) => {
        board(c, x, y, w, h, shade(base, -0.06), s, { vertical: true, r: 1, lw: 1 });
        rr(c, x + 3, y + 3, w - 6, h - 6, 1);
        c.fillStyle = lg(c, x, y, x + w, y + h, [[0, shade(base, -0.28)], [1, shade(base, -0.12)]]); c.fill();
        c.save(); rr(c, x + 3, y + 3, w - 6, h - 6, 1); c.clip(); grain(c, x + 3, y + 3, w - 6, h - 6, base, s + 50, true, 1.8); c.restore();
        line(c, x + 3.5, y + h - 3, x + w - 3, y + h - 3, rgba('#ffdcb8', 0.25), 0.8);
        line(c, x + w - 3, y + 3.5, x + w - 3, y + h - 3, rgba('#ffdcb8', 0.2), 0.8);
      };
      door(9, -38, 22, 28, 11); door(33, -38, 22, 28, 12);
      board(c, 8, -8, 48, 3, shade(base, -0.1), 13, { grain: false });
      door(9, -4, 22, 52, 14); door(33, -4, 22, 52, 15);
      // brass (白銅) fittings
      const plate = (y, r) => {
        ell(c, 32, y, r, r);
        c.fillStyle = rg(c, 32, y, r, [[0, '#f6ecc8'], [0.6, '#cdb47a'], [1, '#7e6633']], 30, y - 2, 0); c.fill();
        c.lineWidth = 0.8; c.strokeStyle = '#5a4520'; c.stroke();
        line(c, 32, y - r + 1, 32, y + r - 1, '#5a4520', 0.8);
      };
      plate(-24, 5); plate(16, 8);
      for (const [x, y] of [[30, -18], [34, -18], [29, 25], [35, 25]]) { line(c, x, y - 2, x, y + 6, '#c9ad6a', 1.4); brassDot(c, x, y + 6, 1.4, '#d6bd7a'); }
      for (const [x, y] of [[9, -34], [9, -16], [9, 2], [9, 38], [52, -34], [52, -16], [52, 2], [52, 38]]) { rr(c, x, y, 3, 5, 0.5); fs(c, '#c7ab6c', '#5a4520', 0.6); }
      // left-side sheen
      c.fillStyle = lg(c, 6, 0, 22, 0, [[0, 'rgba(255,230,200,0.12)'], [1, 'rgba(255,230,200,0)']]); c.fillRect(6, -42, 16, 92);
      aoBottom(c, 6, 36, 52, 14, 0.25);
    },
  });

  // shelf frame shared by bookshelf / shelf_lanterns / herbs
  function shelfFrame(c, W, top, bot, rows, base, seed, divider) {
    groundRect(c, 3, bot - 8, W - 6, 12, 0.36);
    board(c, 4, top, W - 8, bot - top, base, seed, { vertical: true, r: 1 });
    // compartments
    const ih = (bot - top - 8 - (rows.length - 1) * 4 - 6) / rows.length;
    const comps = [];
    let y = top + 6;
    for (let i = 0; i < rows.length; i++) {
      const cols = rows[i];
      const span = W - 8 - 8 - (cols - 1) * 4;
      let x = 8;
      for (let j = 0; j < cols; j++) {
        const cw = span / cols;
        rr(c, x, y, cw, ih, 1);
        c.fillStyle = lg(c, 0, y, 0, y + ih, [[0, shade(base, -0.68)], [1, shade(base, -0.5)]]); c.fill();
        c.save(); rr(c, x, y, cw, ih, 1); c.clip(); grain(c, x, y, cw, ih, shade(base, -0.5), seed + i * 7 + j, false, 3); c.restore();
        aoTop(c, x, y, cw, 7, 0.5);
        c.fillStyle = lg(c, x, 0, x + 5, 0, [[0, 'rgba(15,8,4,0.35)'], [1, 'rgba(15,8,4,0)']]); c.fillRect(x, y, 5, ih);
        comps.push({ x, y, w: cw, h: ih, row: i, col: j });
        x += cw + 4;
      }
      y += ih;
      if (i < rows.length - 1) {
        board(c, 6, y, W - 12, 4, shade(base, 0.12), seed + 20 + i, { r: 0.8 });
        y += 4;
      }
    }
    // top board
    board(c, 2, top - 8, W - 4, 9, shade(base, 0.12), seed + 40, { r: 1.5 });
    board(c, 2, top - 0.5, W - 4, 4, shade(base, -0.12), seed + 41, { r: 0.8, grain: false });
    // base kick
    board(c, 6, bot - 6, W - 12, 6, shade(base, -0.15), seed + 42, { r: 0.8 });
    return comps;
  }
  function shelfFronts(c, comps, base) {
    // the shelf plank lip in front of contents (drawn after contents)
    for (const k of comps) line(c, k.x, k.y + k.h - 0.5, k.x + k.w, k.y + k.h - 0.5, rgba('#ffe7c8', 0.18), 1);
  }

  // books / scrolls
  function bookStack(c, x, yb, w, n, r) {
    let y = yb;
    const covers = ['#2f4a7a', '#34557f', '#3a5a6a', '#2c3e5c', '#6b3a2a', '#4a5a3a'];
    for (let i = 0; i < n; i++) {
      const th = 2.6 + r() * 1.6, dx = (r() - 0.5) * 3, bw = w - r() * 4;
      const cv = covers[(r() * covers.length) | 0];
      rr(c, x + dx, y - th, bw, th, 0.6); fs(c, '#e8dcbc', null);
      line(c, x + dx, y - th + 0.4, x + dx + bw, y - th + 0.4, cv, 0.9);
      line(c, x + dx, y - 0.4, x + dx + bw, y - 0.4, cv, 0.9);
      line(c, x + dx + bw - 0.4, y - th, x + dx + bw - 0.4, y, shade(cv, -0.2), 0.8);
      y -= th;
      if (i === n - 1) {
        rr(c, x + dx, y - 2.4, bw, 2.6, 0.6); fs(c, cv, shade(cv, -0.4), 0.6);
        rr(c, x + dx + bw * 0.62, y - 2.2, 3, 2, 0.3); fs(c, '#efe6cf', null);
      }
    }
  }
  function cases(c, x, yb, n, r, hmax) {
    const cols = ['#2c4d78', '#6d3b2a', '#365e57', '#7a6232', '#3d3a5c'];
    for (let i = 0; i < n; i++) {
      const bw = 6 + r() * 3, bh = hmax * (0.75 + r() * 0.25), col = cols[(r() * cols.length) | 0];
      rr(c, x, yb - bh, bw, bh, 0.8);
      fs(c, lg(c, x, 0, x + bw, 0, [[0, shade(col, 0.2)], [1, shade(col, -0.25)]]), shade(col, -0.5), 0.8);
      rr(c, x + 1.5, yb - bh + 3, bw - 3, 5, 0.3); fs(c, '#efe5ca', null);
      line(c, x + bw / 2, yb - bh + 4, x + bw / 2, yb - bh + 7, rgba('#2a2420', 0.6), 0.6);
      x += bw + 0.5;
    }
    return x;
  }
  function scrolls(c, x, yb, w, r) {
    const rows = [[0, 3], [1, 2]];
    for (const [ri, n] of rows) {
      for (let i = 0; i < n; i++) {
        const cx = x + i * 5.5 + ri * 2.8, cy = yb - 2.6 - ri * 4.6, len = w - 6 - r() * 4;
        const pc = r() < 0.5 ? '#efe4c6' : '#e2d2a8';
        rr(c, cx, cy - 2.4, len, 4.8, 2.4); fs(c, lg(c, 0, cy - 2.4, 0, cy + 2.4, [[0, shade(pc, 0.2)], [1, shade(pc, -0.25)]]), shade(pc, -0.5), 0.6);
        ell(c, cx + len, cy, 1.8, 2.6); fs(c, '#4a2a1c', null);
        line(c, cx + len * 0.5, cy - 2.4, cx + len * 0.5, cy + 2.4, '#c0392b', 1);
      }
    }
  }
  function vase(c, x, yb, h, col) {
    c.beginPath();
    c.moveTo(x - 2.4, yb - h); c.lineTo(x + 2.4, yb - h);
    c.bezierCurveTo(x + 2, yb - h * 0.6, x + h * 0.38, yb - h * 0.5, x + h * 0.32, yb - h * 0.15);
    c.quadraticCurveTo(x + h * 0.26, yb, x, yb); c.quadraticCurveTo(x - h * 0.26, yb, x - h * 0.32, yb - h * 0.15);
    c.bezierCurveTo(x - h * 0.38, yb - h * 0.5, x - 2, yb - h * 0.6, x - 2.4, yb - h); c.closePath();
    fs(c, lg(c, x - h * 0.35, 0, x + h * 0.35, 0, [[0, shade(col, 0.35)], [0.4, col], [1, shade(col, -0.4)]]), shade(col, -0.55), 0.8);
    ell(c, x - h * 0.12, yb - h * 0.35, 0.9, h * 0.12); fs(c, rgba('#ffffff', 0.5), null);
    ell(c, x, yb - h, 2.6, 0.9); fs(c, shade(col, -0.5), null);
  }

  // 書櫃 — stacked 線裝書, cloth cases, scrolls, vase
  def('bookshelf', {
    w: 2, resize: 'w', up: 60, key: (o) => o.v | 0,
    art(c, W, H, o) {
      const base = C.walnut;
      const nc = Math.max(1, Math.round(W / 64));
      const comps = shelfFrame(c, W, -50, 60, [nc, nc, nc], base, 3 + (o.v | 0));
      const r = U.seeded(77 + (o.v | 0) * 31);
      const kinds = ['stack', 'cases', 'scrolls', 'mix', 'stack2'];
      comps.forEach((k, i) => {
        const kind = kinds[(i * 3 + ((r() * 5) | 0)) % kinds.length];
        const yb = k.y + k.h;
        if (kind === 'stack') { bookStack(c, k.x + 3, yb, k.w * 0.5, 4 + ((r() * 3) | 0), r); bookStack(c, k.x + k.w * 0.56, yb, k.w * 0.4, 2 + ((r() * 3) | 0), r); }
        else if (kind === 'cases') { const ex = cases(c, k.x + 3, yb, 4 + ((r() * 2) | 0), r, k.h - 6); vase(c, min(k.x + k.w - 7, ex + 7), yb, 14, '#6fa59a'); }
        else if (kind === 'scrolls') scrolls(c, k.x + 2, yb, k.w - 2, r);
        else if (kind === 'stack2') { bookStack(c, k.x + 4, yb, k.w * 0.62, 6, r); rr(c, k.x + k.w * 0.72, yb - 8, 9, 8, 1); fs(c, '#7a4a2a', '#3a2216', 0.8); brassDot(c, k.x + k.w * 0.72 + 4.5, yb - 4, 1.2); }
        else { cases(c, k.x + 2, yb, 2, r, k.h - 7); bookStack(c, k.x + k.w * 0.45, yb, k.w * 0.5, 3, r); }
      });
      shelfFronts(c, comps, base);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // 陳記燈籠舖 lantern shelves — lots of colourful paper lanterns
  const lanLayouts = {};
  function lanternLayout(W, v) {
    const k = W + ':' + v;
    if (lanLayouts[k]) return lanLayouts[k];
    const r = U.seeded(1234 + v * 977 + W);
    const top = -50, bot = 60;
    const rowsY = [];
    const ih = (bot - top - 8 - 2 * 4 - 6) / 3;
    let y = top + 6;
    for (let i = 0; i < 3; i++) { rowsY.push([y, y + ih]); y += ih + 4; }
    const out = [];
    const shapes = ['round', 'round', 'long', 'drum', 'round', 'palace'];
    rowsY.forEach(([y0, y1], ri) => {
      let x = 11;
      while (x < W - 16) {
        const shape = ri === 2 && r() < 0.25 ? 'folded' : shapes[(r() * shapes.length) | 0];
        let rw = shape === 'long' ? 6 + r() * 2 : shape === 'folded' ? 9 : 8 + r() * 3;
        let rh = shape === 'long' ? 11 : shape === 'drum' ? rw * 0.95 : shape === 'folded' ? 4 : rw * (0.82 + r() * 0.15);
        rh = min(rh, (y1 - y0) / 2 - 4);
        if (x + rw * 2 > W - 10) break;
        out.push({ x: x + rw, y: y1 - rh - 3, rw, rh, shape, col: LANTERN_COLS[(r() * LANTERN_COLS.length) | 0], motif: (r() * 6) | 0, lit: r() < 0.22, row: ri, tag: r() < 0.2 });
        x += rw * 2 + 1.5 + r() * 2;
      }
    });
    // big display lanterns standing on top
    const nTop = max(2, Math.round(W / 48));
    for (let i = 0; i < nTop; i++) {
      const rw = 11 + r() * 3;
      out.push({ x: W * (i + 0.5) / nTop + (r() - 0.5) * 6, y: -60 - rw * 0.85, rw, rh: rw * 0.88, shape: r() < 0.3 ? 'palace' : 'round', col: ['#d8342a', '#f2c14e', '#e8739a', '#3fae8f', '#ee8a2a'][(r() * 5) | 0], motif: [1, 2, 3][(r() * 3) | 0], lit: i % 2 === 0, row: -1 });
    }
    return (lanLayouts[k] = out);
  }
  def('shelf_lanterns', {
    w: 2, resize: 'w', up: 92, key: (o) => o.v | 0,
    art(c, W, H, o) {
      const base = '#9a6438';
      const nc = Math.max(1, Math.round(W / 64));
      const comps = shelfFrame(c, W, -50, 60, [1, 1, 1], base, 21 + (o.v | 0));
      const L = lanternLayout(W, o.v | 0);
      for (const l of L) {
        if (l.row < 0) {
          // little wooden stand under the display lanterns
          rr(c, l.x - 5, -61, 10, 3, 1); fs(c, '#4a2c1a', null);
          lantern(c, l.x, l.y, l.rw, l.rh, l.col, { shape: l.shape, motif: l.motif, lit: l.lit, tassel: false });
          continue;
        }
        if (l.shape === 'folded') {
          // collapsed accordion lanterns lying in a stack
          for (let k = 0; k < 3; k++) {
            const yy = l.y + l.rh - k * 4;
            ell(c, l.x, yy, l.rw, 2.4); fs(c, shade(l.col, -0.1 - k * 0.05), shade(l.col, -0.5), 0.7);
            line(c, l.x - l.rw + 2, yy - 0.6, l.x + l.rw - 2, yy - 0.6, rgba('#ffffff', 0.25), 0.6);
          }
          continue;
        }
        lantern(c, l.x, l.y, l.rw, l.rh, l.col, { shape: l.shape, motif: l.motif, lit: l.lit, tassel: false });
        if (l.tag) {
          line(c, l.x + l.rw * 0.6, l.y - l.rh * 0.3, l.x + l.rw + 2, l.y + 1, '#6b5a44', 0.5);
          rr(c, l.x + l.rw + 0.5, l.y + 1, 3.6, 5.5, 0.4); fs(c, '#f4ecd8', '#8a7a5e', 0.4);
          line(c, l.x + l.rw + 2.3, l.y + 2.4, l.x + l.rw + 2.3, l.y + 5, '#a33', 0.5);
        }
      }
      shelfFronts(c, comps, base);
      // red valance with gold fringe along the top board
      c.beginPath(); c.moveTo(3, -50); c.lineTo(W - 3, -50); c.lineTo(W - 3, -45);
      const n = Math.round(W / 12);
      for (let i = n; i >= 0; i--) { const x = 3 + (W - 6) * i / n; c.quadraticCurveTo(x + (W - 6) / n / 2, -40, x, -45); }
      c.closePath(); fs(c, lg(c, 0, -50, 0, -40, [[0, '#c8302a'], [1, '#8e1c16']]), '#5a100c', 0.8);
      line(c, 4, -48, W - 4, -48, rgba(C.goldL, 0.9), 0.8);
      for (let i = 0; i <= n; i++) { const x = 3 + (W - 6) * i / n; line(c, x, -45, x, -41.5, C.gold, 0.8); }
    },
    live(ctx, x, y, o, t, W, H, ph) {
      const L = lanternLayout(W, o.v | 0);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      L.forEach((l, i) => {
        if (!l.lit) return;
        const f = 0.75 + 0.15 * sin(t * 2.3 + i * 1.7 + ph * 9) + 0.08 * sin(t * 7.1 + i);
        const r = l.rw * 2.2;
        ctx.fillStyle = rg(ctx, x + l.x, y + l.y, r, [[0, rgba('#ffcf7a', 0.32 * f)], [1, 'rgba(255,190,90,0)']]);
        ctx.fillRect(x + l.x - r, y + l.y - r, r * 2, r * 2);
      });
      ctx.restore();
    },
    lights(o, W) {
      return lanternLayout(W, o.v | 0).filter((l) => l.lit).slice(0, 3).map((l) => ({ dx: l.x, dy: l.y, r: 70, color: '#ffc477', flicker: 0.12 }));
    },
  });

  // ---------------------------------------------------------------------------------------------
  // shop counter with abacus, ledger, brushes, a little lit lantern
  def('counter', {
    w: 2, resize: 'w', up: 18,
    art(c, W) {
      const base = '#7e4a2a';
      groundRect(c, 3, 48, W - 6, 14, 0.36);
      board(c, 4, 20, W - 8, 38, shade(base, -0.12), 2, { r: 1 });
      // lacquered recessed panels
      const n = Math.max(1, Math.round((W - 8) / 30));
      const pw = (W - 16 - (n - 1) * 4) / n;
      for (let i = 0; i < n; i++) {
        const x = 8 + i * (pw + 4);
        rr(c, x, 25, pw, 26, 1); fs(c, shade(base, -0.45), null);
        lacquer(c, x + 2, 27, pw - 4, 22, '#9e2a20', 1);
        goldLine(c, x + 4, 29, pw - 8, 18, 1);
        // gold coin motif
        ell(c, x + pw / 2, 38, 4.2, 4.2); fs(c, null, rgba(C.goldL, 0.9), 1);
        rr(c, x + pw / 2 - 1.5, 36.5, 3, 3, 0.2); fs(c, null, rgba(C.goldL, 0.9), 0.8);
      }
      board(c, 4, 54, W - 8, 5, shade(base, -0.3), 4, { grain: false, r: 0.8 });
      // top
      board(c, 1, 16, W - 2, 6, shade(base, -0.05), 5, { r: 1.5 });
      board(c, 1, 2, W - 2, 15, shade(base, 0.12), 6, { r: 2, dens: 2 });
      c.fillStyle = lg(c, 0, 2, W, 17, [[0, 'rgba(255,240,220,0)'], [0.3, 'rgba(255,240,220,0.12)'], [0.4, 'rgba(255,240,220,0)']]); c.fillRect(1, 2, W - 2, 15);
      // abacus
      const ax = 7, ay = 4;
      rr(c, ax, ay, 30, 11, 1); fs(c, '#3b2216', '#1e110a', 0.8);
      rr(c, ax + 2, ay + 1.5, 26, 8, 0.5); fs(c, '#5c3a24', null);
      line(c, ax + 2, ay + 4, ax + 28, ay + 4, '#2a170d', 1);
      for (let i = 0; i < 9; i++) {
        const bx = ax + 3.6 + i * 2.85;
        line(c, bx, ay + 1.5, bx, ay + 9.5, '#c8a870', 0.4);
        ell(c, bx, ay + 2.6, 1.2, 0.8); fs(c, '#1a0e08', null);
        for (let k = 0; k < 3; k++) { ell(c, bx, ay + 5.6 + k * 1.4 + (i % 3 === 0 ? 0.6 : 0), 1.2, 0.7); fs(c, '#24140b', null); }
      }
      // ledger
      const lx = W / 2 - 13;
      c.beginPath(); c.moveTo(lx, 6); c.lineTo(lx + 12, 5); c.lineTo(lx + 13, 15); c.lineTo(lx + 1, 15.5); c.closePath(); fs(c, '#f2e8cc', '#8a7a5a', 0.6);
      c.beginPath(); c.moveTo(lx + 13, 5); c.lineTo(lx + 25, 6); c.lineTo(lx + 24, 15.5); c.lineTo(lx + 13, 15); c.closePath(); fs(c, '#e9dcbc', '#8a7a5a', 0.6);
      for (let i = 0; i < 4; i++) { line(c, lx + 3 + i * 2.4, 7, lx + 3.4 + i * 2.4, 13.5, rgba('#2a2420', 0.55), 0.5); line(c, lx + 15 + i * 2.4, 7, lx + 15.2 + i * 2.4, 13, rgba('#2a2420', 0.5), 0.5); }
      line(c, lx - 1, 15.6, lx + 25, 15.6, '#2f4a7a', 1.2);
      // brush & inkstone
      rr(c, lx + 28, 8, 7, 6, 1.5); fs(c, '#2a2a2e', '#111', 0.6); ell(c, lx + 31.5, 10.5, 2, 1.4); fs(c, '#0a0a0c', null);
      line(c, lx + 26, 14, lx + 38, 6, '#b08850', 1.2); line(c, lx + 26, 14, lx + 28, 12.8, '#1a1410', 1.6);
      // coins
      for (const [cx, cy] of [[W - 30, 12], [W - 26, 13.4], [W - 28, 10]]) { ell(c, cx, cy, 2.4, 1.3); fs(c, '#d9b25a', '#7a5a20', 0.5); }
      // small display lantern
      lantern(c, W - 12, -1, 7, 7, '#d8342a', { motif: 3, lit: true, tassel: true });
      rr(c, W - 16, 7, 8, 3, 1); fs(c, '#3a2214', null);
    },
    live(ctx, x, y, o, t, W, H, ph) {
      glow(ctx, x + W - 12, y - 1, 18, '#ffb860', 0.28 + 0.05 * sin(t * 3 + ph * 7));
    },
    lights: (o, W) => [{ dx: W - 12, dy: -1, r: 80, color: '#ffbe70', flicker: 0.1 }],
  });

  // ---------------------------------------------------------------------------------------------
  // 灶 — brick & plaster stove, two woks, chimney with a 灶君 paper, fire in the mouths
  def('stove', {
    w: 2, up: 70,
    art(c) {
      groundRect(c, 2, 46, 124, 16, 0.4);
      // chimney
      rr(c, 98, -68, 18, 74, 2);
      fs(c, lg(c, 98, 0, 116, 0, [[0, '#f2ebdc'], [0.6, '#ddd3be'], [1, '#b8ad96']]), '#8a8070', 1);
      c.fillStyle = lg(c, 0, -68, 0, -40, [[0, 'rgba(40,30,25,0.55)'], [1, 'rgba(40,30,25,0)']]); c.fillRect(98, -68, 18, 28);
      rr(c, 96, -72, 22, 6, 1); fs(c, '#a5452f', '#5a2216', 1);
      rr(c, 101, -40, 12, 16, 0.5); fs(c, '#c8302a', '#7a1a14', 0.6);
      c.fillStyle = '#f2c14e'; ell(c, 107, -35, 3, 3); c.fill();
      line(c, 104, -29, 110, -29, '#2a1410', 0.8); line(c, 104, -27, 110, -27, '#2a1410', 0.8);
      // front face: red brick
      rr(c, 2, 28, 124, 31, 3); fs(c, '#9e432e', null);
      c.save(); rr(c, 2, 28, 124, 31, 3); c.clip();
      for (let row = 0; row < 6; row++) {
        const yy = 34 + row * 4.4;
        line(c, 2, yy, 126, yy, rgba('#e9d6c0', 0.45), 0.8);
        for (let x = (row % 2) * 6; x < 128; x += 12) line(c, x + 2, yy, x + 2, yy + 4.4, rgba('#e9d6c0', 0.4), 0.8);
        const r = U.seeded(row + 5);
        for (let x = 0; x < 128; x += 12) { c.fillStyle = rgba(r() < 0.5 ? '#7a2c1c' : '#c56a4a', 0.25); c.fillRect(x + 3 + (row % 2) * 6, yy + 0.6, 10.5, 3.4); }
      }
      c.fillStyle = lg(c, 0, 28, 0, 36, [[0, '#ece4d2'], [1, '#d6ccb6']]); c.fillRect(2, 28, 124, 6);
      aoBottom(c, 2, 46, 124, 13, 0.3);
      c.restore();
      rr(c, 2, 28, 124, 31, 3); c.strokeStyle = '#4a1c12'; c.lineWidth = 1.2; c.stroke();
      // fire mouths
      for (const mx of [34, 92]) {
        c.beginPath(); c.moveTo(mx - 10, 56); c.lineTo(mx - 10, 45); c.arc(mx, 45, 10, PI, 0); c.lineTo(mx + 10, 56); c.closePath();
        fs(c, lg(c, 0, 35, 0, 56, [[0, '#0e0705'], [1, '#3a1206']]), '#2a120a', 1.4);
        c.beginPath(); c.moveTo(mx - 12, 56); c.lineTo(mx - 12, 45); c.arc(mx, 45, 12, PI, 0); c.lineTo(mx + 12, 56);
        c.strokeStyle = '#d8cdb6'; c.lineWidth = 1.6; c.stroke();
        ell(c, mx, 54, 8, 2.4); fs(c, rg(c, mx, 54, 8, [[0, '#ffb24a'], [0.6, '#c2400f'], [1, 'rgba(90,20,5,0)']]), null);
      }
      // top surface: plaster with red-tile border
      rr(c, 0, -2, 128, 32, 4); fs(c, '#a8432e', '#5a2216', 1.2);
      for (let x = 6; x < 128; x += 9) line(c, x, -1.5, x, 2.4, rgba('#5a2216', 0.5), 0.7);
      rr(c, 4, 2, 120, 24, 3); fs(c, lg(c, 4, 2, 50, 26, [[0, '#f1ead9'], [1, '#d4c9b1']]), '#9a8d75', 0.8);
      line(c, 1, 29, 127, 29, rgba('#ffd9c0', 0.35), 1);
      // wok holes
      const wok = (wx, lid) => {
        ell(c, wx, 14, 22, 10.5); fs(c, '#3a332c', null);
        ell(c, wx, 14, 20.5, 9.5); fs(c, rg(c, wx, 16, 21, [[0, '#2c2a28'], [0.7, '#45403a'], [1, '#6a625a']], wx - 4, 12, 0), '#1a1714', 1);
        c.beginPath(); c.ellipse(wx, 14, 19, 8.6, 0, PI * 1.05, PI * 1.5); c.strokeStyle = rgba('#e0d8cc', 0.5); c.lineWidth = 1; c.stroke();
        if (lid) {
          ell(c, wx, 12.5, 17, 7.6);
          fs(c, rg(c, wx, 10, 18, [[0, '#d0a66c'], [0.7, '#a77a44'], [1, '#6f4a26']], wx - 6, 8, 0), '#4a2e16', 1);
          for (let k = -3; k <= 3; k++) { c.beginPath(); c.ellipse(wx, 12.5, 17 * Math.sqrt(1 - (k / 4) ** 2), 0.6, 0, 0, PI); c.strokeStyle = rgba('#5a3a1a', 0.0); c.stroke(); line(c, wx + k * 4.4, 6, wx + k * 4.4, 19, rgba('#5a3a1a', 0.25), 0.6); }
          rr(c, wx - 7, 8.5, 14, 3.4, 1.5); fs(c, '#6a4222', '#3a2210', 0.8);
        } else {
          ell(c, wx, 15.5, 12, 4.6); fs(c, rg(c, wx, 15.5, 12, [[0, '#f4efe2'], [1, '#c8bfa8']]), null);
          for (let k = 0; k < 7; k++) { ell(c, wx - 8 + k * 2.7, 15 + (k % 2), 1.1, 0.6); fs(c, rgba('#ffffff', 0.7), null); }
        }
      };
      wok(34, true); wok(92, false);
      // 吹火筒 bamboo blow-tube & ladle on the top surface
      line(c, 58, 24, 74, 4, C.bambooD, 3); line(c, 58, 24, 74, 4, C.bamboo, 2); line(c, 64, 16.5, 65.4, 15, '#7a5a2a', 2.6);
    },
    live(ctx, x, y, o, t, W, H, ph) {
      for (const [i, mx] of [[0, 34], [1, 92]]) {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(x + mx - 10, y + 56); ctx.lineTo(x + mx - 10, y + 45); ctx.arc(x + mx, y + 45, 10, PI, 0); ctx.lineTo(x + mx + 10, y + 56); ctx.closePath(); ctx.clip();
        flame(ctx, x + mx - 3, y + 55, 4.2, t, ph + i * 0.3, FL.warm, 0.7);
        flame(ctx, x + mx + 3, y + 55.5, 3.6, t + 0.4, ph + i * 0.3 + 0.2, FL.warm, 0.7);
        ctx.restore();
        glow(ctx, x + mx, y + 52, 22, '#ff8a2a', 0.22 + 0.06 * sin(t * 9 + i * 2 + ph * 10));
      }
      smoke(ctx, x + 92, y + 12, t, ph, 40, 6, 0.22, '#f4f1ea');
      smoke(ctx, x + 107, y - 72, t * 0.8, ph + 0.5, 46, 6, 0.18, '#8a847c');
    },
    lights: () => [{ dx: 34, dy: 50, r: 70, color: '#ff8a3a', flicker: 0.35 }, { dx: 92, dy: 50, r: 70, color: '#ff8a3a', flicker: 0.35 }],
  });

  // 神桌 — red lacquer altar table with tablets, candles, incense, fruit and an embroidered 桌裙
  def('altar', {
    w: 2, up: 68,
    art(c) {
      groundRect(c, 4, 48, 120, 14, 0.38);
      const lacq = C.lac;
      // back legs
      board(c, 12, 4, 5, 50, C.lacD, 1, { grain: false });
      board(c, 111, 4, 5, 50, C.lacD, 2, { grain: false });
      // front legs
      for (const lx of [8, 114]) {
        rr(c, lx, 8, 7, 52, 1); fs(c, lg(c, lx, 0, lx + 7, 0, [[0, C.lacL], [0.4, lacq], [1, C.lacD]]), '#3e0a07', 1);
        rr(c, lx - 1, 56, 9, 4, 1); fs(c, C.gold, C.goldD, 0.7);
      }
      // tabletop with 翹頭 upturned ends
      lacquer(c, 2, 4, 124, 6, shade(lacq, -0.15), 1);
      lacquer(c, 2, -10, 124, 15, lacq, 2);
      for (const [ex, dir] of [[2, 1], [126, -1]]) {
        c.beginPath(); c.moveTo(ex, -10); c.quadraticCurveTo(ex - dir * 2, -16, ex - dir * 5, -18); c.quadraticCurveTo(ex + dir * 2, -15, ex + dir * 9, -10); c.closePath();
        fs(c, lacq, '#3e0a07', 1);
      }
      goldLine(c, 5, -8, 118, 11, 1);
      // 桌裙 embroidered front cloth
      const cy0 = 9, cy1 = 50;
      c.beginPath(); c.moveTo(14, cy0); c.lineTo(114, cy0); c.lineTo(114, cy1);
      for (let i = 10; i >= 0; i--) c.lineTo(14 + i * 10, cy1 + (i % 2 ? 2 : 0));
      c.closePath();
      fs(c, lg(c, 0, cy0, 0, cy1, [[0, '#c22a20'], [1, '#8a1812']]), '#4a0c08', 1);
      c.save(); c.clip();
      c.fillStyle = lg(c, 14, 0, 114, 0, [[0, 'rgba(0,0,0,0.15)'], [0.15, 'rgba(255,255,255,0.07)'], [0.3, 'rgba(0,0,0,0.1)'], [0.5, 'rgba(255,255,255,0.06)'], [0.7, 'rgba(0,0,0,0.1)'], [0.85, 'rgba(255,255,255,0.06)'], [1, 'rgba(0,0,0,0.2)']]);
      c.fillRect(14, cy0, 100, cy1 - cy0 + 3);
      c.restore();
      rr(c, 14, cy0, 100, 7, 0); fs(c, '#d9a441', '#7a5a20', 0.6);
      for (let x = 18; x < 112; x += 6) { ell(c, x, cy0 + 3.5, 1.6, 1.6); fs(c, '#b8322a', null); }
      rr(c, 18, cy0 + 10, 92, cy1 - cy0 - 14, 2); c.strokeStyle = rgba(C.goldL, 0.8); c.lineWidth = 0.9; c.stroke();
      // central medallion: gold roundel with stylised dragon swirl
      ell(c, 64, 31, 11, 9.5); fs(c, rg(c, 64, 31, 11, [[0, '#f8dd90'], [1, '#c48a2c']]), '#7a5a20', 0.8);
      c.strokeStyle = '#a2241a'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(64, 31, 6, 0.3, PI * 1.7); c.stroke();
      c.beginPath(); c.arc(64, 31, 2.8, PI, PI * 2.6); c.stroke();
      for (const sx of [30, 98]) {
        c.strokeStyle = rgba(C.goldL, 0.75); c.lineWidth = 0.9;
        c.beginPath(); c.arc(sx, 31, 5, PI * 0.2, PI * 1.6); c.stroke(); c.beginPath(); c.arc(sx + (sx < 64 ? 7 : -7), 31, 3.5, PI * 1.2, PI * 2.6); c.stroke();
      }
      for (let x = 15; x < 114; x += 3) line(c, x, cy1 + 1, x, cy1 + 4.5, '#e2b24e', 0.7);
      // ---- items on the altar top (back → front)
      // tablets
      const tablet = (x, w, h, crown) => {
        const yb = -6;
        rr(c, x - w / 2 - 2, yb - 4, w + 4, 5, 1); fs(c, '#3a1a10', '#1a0a06', 0.6);
        rr(c, x - w / 2, yb - h, w, h - 4, 1); lacquer(c, x - w / 2, yb - h, w, h - 4, '#a8231b', 1);
        goldLine(c, x - w / 2 + 1.5, yb - h + 2, w - 3, h - 7, 0.5);
        for (let i = 0; i < 4; i++) rr(c, x - 0.8, yb - h + 5 + i * (h - 12) / 4, 1.6, (h - 12) / 4 - 1.5, 0.3), fs(c, rgba(C.goldL, 0.9), null);
        if (crown) {
          // cloud-scroll headpiece (wider than the tablet, flat-topped with curled ends)
          const hw = w / 2 + 4, hy = yb - h;
          c.beginPath(); c.moveTo(x - hw, hy + 2);
          c.bezierCurveTo(x - hw - 2, hy - 3, x - hw + 3, hy - 6, x - hw * 0.45, hy - 4);
          c.quadraticCurveTo(x, hy - 9, x + hw * 0.45, hy - 4);
          c.bezierCurveTo(x + hw - 3, hy - 6, x + hw + 2, hy - 3, x + hw, hy + 2); c.closePath();
          fs(c, lg(c, 0, hy - 9, 0, hy + 2, [[0, C.goldL], [1, C.goldD]]), '#5a3a10', 0.7);
          c.beginPath(); c.arc(x - hw * 0.55, hy - 1.5, 1.6, 0, PI * 1.6); c.arc(x + hw * 0.55, hy - 1.5, 1.6, PI, PI * 2.6);
          c.strokeStyle = '#7a5418'; c.lineWidth = 0.6; c.stroke();
        }
      };
      tablet(44, 13, 30, true); tablet(84, 13, 30, true); tablet(64, 17, 44, true);
      // candlesticks
      for (const cx of [20, 108]) {
        ell(c, cx, -2, 6, 2.2); fs(c, '#c9c4b8', '#5e5a52', 0.7);
        rr(c, cx - 1.5, -12, 3, 10, 0.5); fs(c, lg(c, cx - 1.5, 0, cx + 1.5, 0, [[0, '#ece8de'], [1, '#8a867c']]), null);
        ell(c, cx, -12, 4.5, 1.6); fs(c, '#d8d3c8', '#5e5a52', 0.6);
        rr(c, cx - 2.6, -34, 5.2, 22, 1); fs(c, lg(c, cx - 2.6, 0, cx + 2.6, 0, [[0, '#ea4a3a'], [0.4, '#c8281e'], [1, '#7a120c']]), '#4a0806', 0.6);
        ell(c, cx, -34, 2.6, 0.9); fs(c, '#f06a50', null);
        c.fillStyle = rgba(C.goldL, 0.8); c.fillRect(cx - 1, -30, 2, 12);
        line(c, cx, -34, cx, -36.5, '#1a0a06', 0.8);
      }
      // fruit plates (oranges)
      for (const fx of [34, 94]) {
        ell(c, fx, 1, 9, 3); fs(c, '#e9e4d8', '#7d786c', 0.7);
        for (const [ox, oy, rad] of [[-4, -2, 3.6], [4, -2, 3.6], [0, -1, 3.6], [0, -6.5, 3.4]]) {
          ell(c, fx + ox, oy, rad, rad); fs(c, rg(c, fx + ox, oy, rad, [[0, '#ffd27a'], [0.6, '#f0962a'], [1, '#b85e10']], fx + ox - 1.2, oy - 1.2, 0), '#8a4408', 0.5);
        }
        line(c, fx, -10, fx + 1.6, -11.6, '#3f6a2a', 1);
      }
      // incense burner (bronze)
      c.beginPath(); c.moveTo(56, -4); c.lineTo(72, -4); c.quadraticCurveTo(72, 4, 64, 5); c.quadraticCurveTo(56, 4, 56, -4); c.closePath();
      fs(c, lg(c, 56, 0, 72, 0, [[0, '#d0a85a'], [0.4, '#a07a3a'], [1, '#4e3a1e']]), '#3a2810', 0.7);
      ell(c, 64, -4, 8, 2.4); fs(c, '#8a8070', '#3a2810', 0.6);
      for (const [sx, tx] of [[61, -2], [64, 0], [67, 2]]) {
        line(c, sx, -4.5, sx + tx, -20, '#a3342a', 0.9);
        ell(c, sx + tx, -20, 0.8, 0.8); fs(c, '#ffb84a', null);
      }
      // tea cups
      for (const tx of [52, 76]) { ell(c, tx, 2.5, 2.4, 1.2); fs(c, '#f4f1ea', '#8a8478', 0.5); }
    },
    live(ctx, x, y, o, t, W, H, ph) {
      flame(ctx, x + 20, y - 35.5, 2.4, t, ph, FL.candle, 1.3);
      flame(ctx, x + 108, y - 35.5, 2.4, t + 0.7, ph + 0.37, FL.candle, 1.3);
      for (const [k, tx] of [[0, 59], [1, 64], [2, 69]]) {
        glow(ctx, x + tx, y - 20, 3, '#ff9a3a', 0.6 + 0.3 * sin(t * 3 + k * 2));
        smoke(ctx, x + tx, y - 21, t, ph + k * 0.31, 46, 5, 0.2);
      }
    },
    lights: () => [{ dx: 20, dy: -38, r: 90, color: '#ffb560', flicker: 0.2 }, { dx: 108, dy: -38, r: 90, color: '#ffb560', flicker: 0.2 }, { dx: 64, dy: -14, r: 60, color: '#ff9a50', flicker: 0.1 }],
  });

  // big bronze temple 香爐 on a granite pedestal
  def('incense_burner', {
    up: 36,
    art(c) {
      groundRect(c, 8, 48, 48, 12, 0.36);
      // pedestal
      rr(c, 9, 40, 46, 18, 1.5); fs(c, lg(c, 9, 40, 9, 58, [[0, '#8f8b84'], [1, '#5f5c57']]), '#3a3834', 1);
      speckle(c, 9, 40, 46, 18, 60, '#2a2826', 0.25, 3, 0.7);
      rr(c, 14, 44, 36, 10, 1); fs(c, null, rgba('#2a2826', 0.5), 0.8);
      c.beginPath(); c.arc(32, 49, 3, 0, TAU); c.strokeStyle = rgba('#2a2826', 0.5); c.stroke();
      rr(c, 7, 33, 50, 8, 1.5); fs(c, lg(c, 7, 33, 30, 41, [[0, '#b7b3aa'], [1, '#8a867e']]), '#4a4842', 1);
      // legs
      for (const lx of [15, 49]) {
        c.beginPath(); c.moveTo(lx - 3, 26); c.lineTo(lx + 3, 26); c.lineTo(lx + 4, 36); c.lineTo(lx - 4, 36); c.closePath();
        fs(c, lg(c, lx - 4, 0, lx + 4, 0, [[0, '#b08a4a'], [1, '#4a3418']]), '#2e200c', 0.8);
        ell(c, lx, 36, 4.5, 1.6); fs(c, '#5a4220', null);
      }
      // ears (behind rim)
      for (const ex of [13, 51]) {
        rr(c, ex - 3, -6, 6, 12, 1.5); fs(c, lg(c, ex - 3, 0, ex + 3, 0, [[0, '#c69a52'], [1, '#5a4020']]), '#2e200c', 0.9);
        rr(c, ex - 1.4, -4, 2.8, 6, 1); fs(c, '#2a1c0c', null);
      }
      // bowl body
      c.beginPath(); c.moveTo(9, 6); c.bezierCurveTo(8, 22, 18, 31, 32, 31); c.bezierCurveTo(46, 31, 56, 22, 55, 6); c.closePath();
      fs(c, lg(c, 9, 0, 55, 0, [[0, '#7a5a2c'], [0.2, '#d6ad62'], [0.38, '#a8803e'], [0.8, '#5c4220'], [1, '#3a2812']]), '#2a1c0a', 1.2);
      // relief band + patina
      c.save(); c.beginPath(); c.moveTo(9, 6); c.bezierCurveTo(8, 22, 18, 31, 32, 31); c.bezierCurveTo(46, 31, 56, 22, 55, 6); c.closePath(); c.clip();
      c.strokeStyle = rgba('#2a1c0a', 0.55); c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(32, 12, 23, 5, 0, 0, PI); c.stroke(); c.beginPath(); c.ellipse(32, 19, 22, 5, 0, 0, PI); c.stroke();
      for (let i = 0; i < 6; i++) { const sx = 14 + i * 7.2; c.beginPath(); c.arc(sx, 16.5, 2, PI * 0.2, PI * 1.6); c.stroke(); }
      speckle(c, 9, 6, 46, 26, 40, C.patina, 0.35, 9, 1.4);
      c.restore();
      // rim and ash
      ell(c, 32, 6, 23.5, 6.5); fs(c, lg(c, 9, 0, 55, 0, [[0, '#e0bc72'], [1, '#6a4c24']]), '#2a1c0a', 1);
      ell(c, 32, 6, 20, 5); fs(c, rg(c, 32, 6, 20, [[0, '#cbc5ba'], [1, '#77706a']]), null);
      speckle(c, 13, 3, 38, 6, 30, '#3a3632', 0.3, 4, 0.6);
      // incense sticks
      const r = U.seeded(8);
      for (let i = 0; i < 11; i++) {
        const sx = 18 + r() * 28, sy = 4 + r() * 4, tx = sx + (r() - 0.5) * 6, ty = -14 - r() * 12;
        line(c, sx, sy, tx, ty, r() < 0.5 ? '#b33a2c' : '#d0663a', 1);
        ell(c, tx, ty, 0.9, 0.9); fs(c, '#ffb050', null);
      }
    },
    live(ctx, x, y, o, t, W, H, ph) {
      const r = U.seeded(8);
      const tips = [];
      for (let i = 0; i < 11; i++) { const sx = 18 + r() * 28; r(); const tx = sx + (r() - 0.5) * 6, ty = -14 - r() * 12; tips.push([tx, ty]); }
      tips.forEach(([tx, ty], i) => glow(ctx, x + tx, y + ty, 3.2, '#ff8a2a', 0.5 + 0.35 * sin(t * 2.5 + i * 1.9)));
      for (let k = 0; k < 3; k++) smoke(ctx, x + tips[k * 4][0], y + tips[k * 4][1], t, ph + k * 0.33, 64, 7, 0.24);
      glow(ctx, x + 32, y + 4, 20, '#ff7a2a', 0.08);
    },
  });

  // 屏風 — 4-panel folding screen with ink landscape
  def('screen', {
    w: 2, up: 50,
    art(c) {
      groundRect(c, 4, 50, 120, 12, 0.3);
      const xs = [4, 34, 64, 94, 124], off = (k) => (k % 2) * 5;
      const top = -46, bot = 56;
      // landscape canvas (drawn once, clipped into each panel)
      const scene = () => {
        c.fillStyle = lg(c, 0, top, 0, bot, [[0, '#f3e8cc'], [1, '#e2d2ac']]); c.fillRect(0, top - 6, 128, bot - top + 12);
        // moon
        ell(c, 98, -30, 6, 6); fs(c, rgba('#ffffff', 0.7), null);
        // far mountains
        const mtn = (base, amp, col, a, seed) => {
          const r = U.seeded(seed);
          c.beginPath(); c.moveTo(0, base + 20);
          let yy = base;
          for (let x = 0; x <= 128; x += 6) { yy = base - abs(sin(x * 0.045 + seed)) * amp - r() * amp * 0.25; c.lineTo(x, yy); }
          c.lineTo(128, base + 20); c.closePath();
          c.fillStyle = lg(c, 0, base - amp, 0, base + 14, [[0, rgba(col, a)], [1, rgba(col, 0)]]); c.fill();
        };
        mtn(-6, 26, '#5a6e7a', 0.55, 2);
        mtn(10, 22, '#3c4c56', 0.65, 5);
        mtn(26, 16, '#2a3238', 0.7, 9);
        // mist
        c.fillStyle = rgba('#f4ead2', 0.55); c.fillRect(0, 4, 128, 5); c.fillRect(0, 22, 128, 4);
        // pine branch top-left
        c.strokeStyle = '#2a2420'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(4, -40); c.quadraticCurveTo(20, -34, 30, -26); c.stroke();
        c.fillStyle = rgba('#2e4a38', 0.85);
        for (const [px, py] of [[14, -36], [22, -32], [28, -27], [18, -30]]) { ell(c, px, py, 4.5, 2); c.fill(); }
        // boat
        c.beginPath(); c.moveTo(60, 30); c.quadraticCurveTo(66, 33, 74, 30); c.strokeStyle = '#2a2420'; c.lineWidth = 1.2; c.stroke();
        line(c, 68, 30, 68, 25, '#2a2420', 0.8);
        // calligraphy columns + seal
        c.strokeStyle = rgba('#2a2420', 0.65); c.lineWidth = 0.8;
        for (let col = 0; col < 3; col++) for (let k = 0; k < 6; k++) { const yy = -40 + k * 4; c.beginPath(); c.moveTo(116 - col * 4, yy); c.lineTo(115 - col * 4, yy + 2.6); c.stroke(); }
        rr(c, 113, -14, 4, 4, 0.5); fs(c, '#b8322a', null);
      };
      for (let i = 0; i < 4; i++) {
        const x0 = xs[i], x1 = xs[i + 1], t0 = top - off(i), t1 = top - off(i + 1), b0 = bot - off(i), b1 = bot - off(i + 1);
        // frame
        c.beginPath(); c.moveTo(x0, t0); c.lineTo(x1, t1); c.lineTo(x1, b1); c.lineTo(x0, b0); c.closePath();
        fs(c, lg(c, x0, 0, x1, 0, [[0, i % 2 ? '#4a2216' : '#6a3220'], [1, i % 2 ? '#3a180e' : '#5a2a1a']]), '#24100a', 1.2);
        // silk panel
        const ins = 3.5;
        c.save();
        c.beginPath(); c.moveTo(x0 + ins, t0 + ins); c.lineTo(x1 - ins, t1 + ins); c.lineTo(x1 - ins, b1 - 18); c.lineTo(x0 + ins, b0 - 18); c.closePath(); c.clip();
        scene();
        c.fillStyle = i % 2 ? 'rgba(40,20,10,0.16)' : 'rgba(255,250,235,0.06)'; c.fillRect(x0, t0 - 10, 32, 120);
        c.restore();
        // lower carved lattice
        c.save();
        c.beginPath(); c.moveTo(x0 + ins, b0 - 15); c.lineTo(x1 - ins, b1 - 15); c.lineTo(x1 - ins, b1 - ins); c.lineTo(x0 + ins, b0 - ins); c.closePath(); c.clip();
        c.fillStyle = '#1e0c06'; c.fillRect(x0, b0 - 20, 32, 24);
        c.strokeStyle = '#8a4a2a'; c.lineWidth = 1.2;
        for (let k = -2; k < 6; k++) { c.beginPath(); c.moveTo(x0 + k * 6, b0 - 16); c.lineTo(x0 + k * 6 + 12, b0); c.stroke(); c.beginPath(); c.moveTo(x0 + k * 6 + 12, b0 - 16); c.lineTo(x0 + k * 6, b0); c.stroke(); }
        c.restore();
        // highlight on frame top edge
        line(c, x0 + 1, t0 + 1, x1 - 1, t1 + 1, rgba('#ffd8b8', 0.3), 1);
      }
      // hinges / feet
      for (let k = 0; k < 5; k++) {
        rr(c, xs[k] - 2.5, bot - off(k) - 1, 5, 4, 1); fs(c, '#3a1a10', null);
        rr(c, xs[k] - 1, top - off(k) + 12, 2, 4, 0.4); fs(c, C.gold, null);
        rr(c, xs[k] - 1, bot - off(k) - 30, 2, 4, 0.4); fs(c, C.gold, null);
      }
    },
  });

  // rug — non-solid, resizable (default 3x2)
  def('rug', {
    w: 3, h: 2, resize: 'wh', solid: false,
    art(c, W, H) {
      const x = 5, y = 6, w = W - 10, h = H - 12;
      rr(c, x + 1, y + 2, w, h, 3); fs(c, 'rgba(20,10,5,0.25)', null);
      // fringe
      for (let yy = y + 3; yy < y + h - 2; yy += 2.5) { line(c, x - 3, yy, x, yy, '#e8dcc0', 0.9); line(c, x + w, yy, x + w + 3, yy, '#e8dcc0', 0.9); }
      rr(c, x, y, w, h, 2.5); fs(c, '#243a6a', '#141f3a', 1);
      rr(c, x + 3, y + 3, w - 6, h - 6, 2); fs(c, '#d6a446', null);
      rr(c, x + 4.5, y + 4.5, w - 9, h - 9, 2); fs(c, '#2c4478', null);
      // key-pattern border
      c.strokeStyle = rgba('#e7c46a', 0.9); c.lineWidth = 0.9;
      const kp = (x0, y0, len, horiz) => {
        for (let s = 0; s < len - 6; s += 7) {
          c.beginPath();
          if (horiz) { c.moveTo(x0 + s, y0 + 2); c.lineTo(x0 + s, y0 - 2); c.lineTo(x0 + s + 4, y0 - 2); c.lineTo(x0 + s + 4, y0 + 1); c.lineTo(x0 + s + 2, y0 + 1); }
          else { c.moveTo(x0 + 2, y0 + s); c.lineTo(x0 - 2, y0 + s); c.lineTo(x0 - 2, y0 + s + 4); c.lineTo(x0 + 1, y0 + s + 4); c.lineTo(x0 + 1, y0 + s + 2); }
          c.stroke();
        }
      };
      kp(x + 9, y + 8.5, w - 14, true); kp(x + 9, y + h - 8.5, w - 14, true); kp(x + 8.5, y + 11, h - 18, false); kp(x + w - 8.5, y + 11, h - 18, false);
      // field
      const fx = x + 13, fy = y + 13, fw = w - 26, fh = h - 26;
      rr(c, fx, fy, fw, fh, 2);
      fs(c, rg(c, fx + fw / 2, fy + fh / 2, max(fw, fh) * 0.7, [[0, '#c03a2c'], [1, '#801c16']]), rgba('#e7c46a', 0.9), 1);
      c.save(); rr(c, fx, fy, fw, fh, 2); c.clip();
      // scattered small flowers
      const r = U.seeded((W * 7 + H) | 0);
      for (let i = 0; i < fw * fh / 160; i++) {
        const px = fx + r() * fw, py = fy + r() * fh;
        c.fillStyle = rgba(r() < 0.5 ? '#e7c46a' : '#f0e2c4', 0.55);
        for (let p = 0; p < 4; p++) { ell(c, px + cos(p * PI / 2) * 1.4, py + sin(p * PI / 2) * 1.4, 0.9, 0.9); c.fill(); }
      }
      // corner quarter-medallions
      for (const [cx, cy] of [[fx, fy], [fx + fw, fy], [fx, fy + fh], [fx + fw, fy + fh]]) {
        ell(c, cx, cy, 12, 10); fs(c, '#2c4478', rgba('#e7c46a', 0.9), 1);
        ell(c, cx, cy, 7, 6); fs(c, '#d6a446', null);
      }
      c.restore();
      // central medallion
      const mx = x + w / 2, my = y + h / 2, mr = min(fw, fh) * 0.36;
      c.beginPath();
      for (let k = 0; k <= 16; k++) { const a = k / 16 * TAU, rr2 = mr * (k % 2 ? 0.86 : 1); c.lineTo(mx + cos(a) * rr2 * 1.25, my + sin(a) * rr2); }
      c.closePath(); fs(c, '#2c4478', '#e7c46a', 1.2);
      ell(c, mx, my, mr * 0.95, mr * 0.72); fs(c, '#d6a446', '#7a5a20', 0.8);
      ell(c, mx, my, mr * 0.7, mr * 0.52); fs(c, '#a82a20', null);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.beginPath(); c.ellipse(mx + cos(a) * mr * 0.38, my + sin(a) * mr * 0.28, mr * 0.2, mr * 0.09, a, 0, TAU); fs(c, '#f0e2c4', null); }
      ell(c, mx, my, mr * 0.17, mr * 0.13); fs(c, '#e7c46a', null);
      // fabric texture + soft edge light
      c.save(); rr(c, x, y, w, h, 2.5); c.clip();
      speckle(c, x, y, w, h, w * h / 30, '#000000', 0.08, 5, 0.6);
      c.fillStyle = lg(c, x, y, x + w, y + h, [[0, 'rgba(255,240,220,0.1)'], [1, 'rgba(0,0,0,0.12)']]); c.fillRect(x, y, w, h);
      c.restore();
    },
  });

  // door_frame — doorway with a blue 門簾 bearing a lantern crest. Place on the wall-face row. Non-solid.
  def('door_frame', {
    solid: false, up: 26, wallMount: true,
    art(c) {
      rr(c, 9, -16, 46, 76, 1);
      fs(c, lg(c, 0, -16, 0, 60, [[0, '#0b0605'], [0.7, '#1c120c'], [1, '#3a2a1c']]), null);
      // glimpse of floor beyond
      c.fillStyle = lg(c, 0, 44, 0, 60, [[0, 'rgba(120,80,40,0)'], [1, 'rgba(160,110,60,0.45)']]); c.fillRect(9, 44, 46, 16);
      // posts + lintel
      board(c, 3, -18, 8, 80, C.rose, 1, { vertical: true });
      board(c, 53, -18, 8, 80, C.rose, 2, { vertical: true });
      board(c, 0, -26, 64, 11, shade(C.rose, 0.05), 3);
      rr(c, 22, -24, 20, 7, 1); fs(c, '#1e0c06', null);
      lacquer(c, 23, -23.5, 18, 6, '#a8231b', 0.8);
      ell(c, 32, -20.5, 2, 2); fs(c, C.goldL, null);
      // curtain (two halves)
      for (const [x0, x1] of [[11, 31.5], [32.5, 53]]) {
        c.beginPath(); c.moveTo(x0, -15); c.lineTo(x1, -15); c.lineTo(x1, 22);
        c.quadraticCurveTo((x0 + x1) / 2, 25, x0, 22); c.closePath();
        c.fillStyle = lg(c, x0, 0, x1, 0, [[0, '#2c4a86'], [0.3, '#36579a'], [0.55, '#253f74'], [0.8, '#30518e'], [1, '#1f355f']]); c.fill();
        c.strokeStyle = '#121f3a'; c.lineWidth = 1; c.stroke();
      }
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(11, 16, 42, 6);
      // crest: white circle with a lantern
      ell(c, 32, 2, 9, 9); fs(c, null, '#f2ecdf', 1.6);
      ell(c, 32, 2.5, 4, 4.8); fs(c, '#f2ecdf', null);
      rr(c, 29.5, -3.5, 5, 1.5, 0.5); fs(c, '#f2ecdf', null); rr(c, 29.5, 7.5, 5, 1.5, 0.5); fs(c, '#f2ecdf', null);
      line(c, 32, -15, 32, 23, '#0e1830', 1.2);
      rr(c, 10, -16, 44, 3, 1); fs(c, '#6a4a2a', '#2a1a0c', 0.8);
      // threshold
      board(c, 6, 56, 52, 6, C.walnut, 7, { r: 1 });
    },
  });

  // stairs going up (north). Non-solid.
  def('stairs_up', {
    solid: false, up: 30,
    art(c) {
      const n = 6, base = '#9a6a40';
      ground(c, 32, 60, 30, 5, 0.25);
      // stringers
      board(c, 2, -26, 7, 88, shade(base, -0.35), 1, { vertical: true });
      board(c, 55, -26, 7, 88, shade(base, -0.35), 2, { vertical: true });
      for (let i = n - 1; i >= 0; i--) {
        const yb = 62 - i * 14.5;
        board(c, 8, yb - 9, 48, 9, shade(base, -0.22 - i * 0.04), 10 + i, { r: 0.5, hl: false });
        aoTop(c, 8, yb - 9, 48, 4, 0.35);
        board(c, 7, yb - 15, 50, 6.5, shade(base, 0.12 - i * 0.03), 20 + i, { r: 1 });
        line(c, 8, yb - 9.2, 56, yb - 9.2, rgba('#ffe6c4', 0.35), 0.9);
      }
      // fade into the upper floor
      c.fillStyle = lg(c, 0, -28, 0, 30, [[0, 'rgba(15,8,4,0.7)'], [1, 'rgba(15,8,4,0)']]); c.fillRect(2, -28, 60, 58);
      // newel posts
      for (const px of [4, 60]) { rr(c, px - 3, 34, 6, 28, 1); fs(c, lg(c, px - 3, 0, px + 3, 0, [[0, '#a86e44'], [1, '#4a2a16']]), '#2a160a', 0.9); brassDot(c, px, 33, 3.4, '#8a5a34'); }
    },
  });

  // stairs going down (a hole in the floor). Non-solid.
  def('stairs_down', {
    solid: false, up: 4,
    art(c) {
      const base = '#8f5d36';
      board(c, 2, 2, 60, 60, shade(base, 0.05), 3, { r: 2 });
      rr(c, 8, 8, 48, 50, 1); fs(c, '#0a0604', null);
      c.save(); rr(c, 8, 8, 48, 50, 1); c.clip();
      // far (north) wall of the pit
      c.fillStyle = lg(c, 0, 8, 0, 20, [[0, '#050302'], [1, '#1a0f08']]); c.fillRect(8, 8, 48, 14);
      for (let i = 0; i < 6; i++) {
        const yb = 58 - i * 7.2, a = 1 - i * 0.16;
        rr(c, 9, yb - 6.5, 46, 6.5, 0.5);
        c.fillStyle = lg(c, 0, yb - 6.5, 0, yb, [[0, rgba(shade(base, 0.05), a)], [1, rgba(shade(base, -0.3), a)]]); c.fill();
        line(c, 9, yb - 6.2, 55, yb - 6.2, rgba('#ffe0b8', 0.25 * a), 0.8);
        line(c, 9, yb - 0.3, 55, yb - 0.3, 'rgba(0,0,0,0.6)', 1.2);
      }
      c.fillStyle = lg(c, 0, 8, 0, 58, [[0, 'rgba(5,3,2,0.9)'], [0.6, 'rgba(5,3,2,0.25)'], [1, 'rgba(5,3,2,0)']]); c.fillRect(8, 8, 48, 50);
      c.fillStyle = lg(c, 8, 0, 56, 0, [[0, 'rgba(0,0,0,0.5)'], [0.15, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]); c.fillRect(8, 8, 48, 50);
      aoTop(c, 8, 8, 48, 8, 0.8);
      c.restore();
      rr(c, 8, 8, 48, 50, 1); c.strokeStyle = '#2a160a'; c.lineWidth = 1.4; c.stroke();
      line(c, 9, 58.5, 55, 58.5, rgba('#ffe0b8', 0.3), 1);
      // rail stubs
      for (const px of [5, 59]) { rr(c, px - 2.5, 10, 5, 46, 1); fs(c, lg(c, px - 2.5, 0, px + 2.5, 0, [[0, '#a86e44'], [1, '#4a2a16']]), '#2a160a', 0.8); }
    },
  });

  // ornate wooden treasure chest — o.open
  def('chest', {
    up: 16, key: (o) => (o.open ? 1 : 0),
    art(c, W, H, o) {
      const wood = '#7a3a20', brass = '#d4a548';
      groundRect(c, 9, 50, 46, 10, 0.4);
      // body
      board(c, 10, 30, 44, 28, wood, 1, { r: 1.5 });
      aoBottom(c, 10, 46, 44, 12, 0.3);
      rr(c, 14, 34, 36, 20, 1); fs(c, null, rgba(shade(wood, -0.5), 0.6), 0.8);
      if (!o.open) {
        // lid front + domed top
        board(c, 9, 20, 46, 12, shade(wood, 0.05), 2, { r: 1.5 });
        c.beginPath(); c.moveTo(9, 21); c.bezierCurveTo(9, 10, 12, 7, 18, 7); c.lineTo(46, 7); c.bezierCurveTo(52, 7, 55, 10, 55, 21); c.closePath();
        fs(c, lg(c, 0, 7, 0, 21, [[0, shade(wood, 0.32)], [1, shade(wood, 0.02)]]), ol(wood), 1.2);
        c.save(); c.clip(); grain(c, 9, 7, 46, 14, wood, 6, false, 2); c.restore();
        line(c, 11, 20.6, 53, 20.6, rgba('#ffd8b0', 0.3), 1);
        // brass bands over lid and body
        for (const bx of [17, 47]) {
          c.beginPath(); c.moveTo(bx - 2.5, 8); c.lineTo(bx + 2.5, 8); c.lineTo(bx + 2.5, 57); c.lineTo(bx - 2.5, 57); c.closePath();
          fs(c, lg(c, bx - 2.5, 0, bx + 2.5, 0, [[0, '#f2d07a'], [1, '#8a6420']]), '#5a3e10', 0.7);
          for (const sy of [12, 24, 36, 48]) brassDot(c, bx, sy, 1.1, brass);
        }
        // lock plate (ruyi)
        c.beginPath(); c.moveTo(32, 22); c.bezierCurveTo(39, 22, 40, 28, 37, 31); c.lineTo(36, 38); c.lineTo(28, 38); c.lineTo(27, 31); c.bezierCurveTo(24, 28, 25, 22, 32, 22); c.closePath();
        fs(c, rg(c, 32, 29, 9, [[0, '#ffe8a0'], [0.6, brass], [1, '#7a5418']], 30, 26, 0), '#4a3008', 0.9);
        rr(c, 31, 28, 2, 5, 1); fs(c, '#2a1806', null); ell(c, 32, 28, 1.6, 1.6); fs(c, '#2a1806', null);
        // corner brackets
        for (const [cx, cy, sx, sy] of [[10, 56, 1, -1], [54, 56, -1, -1], [9, 21, 1, 1], [55, 21, -1, 1]]) {
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + sx * 6, cy); c.lineTo(cx, cy + sy * 6); c.closePath(); fs(c, brass, '#5a3e10', 0.6);
        }
      } else {
        // lid swung back: its lined underside faces us
        c.beginPath(); c.moveTo(9, 22); c.lineTo(9, -8); c.bezierCurveTo(9, -13, 12, -14, 16, -14); c.lineTo(48, -14); c.bezierCurveTo(52, -14, 55, -13, 55, -8); c.lineTo(55, 22); c.closePath();
        fs(c, lg(c, 0, -14, 0, 22, [[0, shade(wood, -0.1)], [1, shade(wood, -0.4)]]), ol(wood), 1.2);
        rr(c, 13, -10, 38, 28, 2); fs(c, lg(c, 0, -10, 0, 18, [[0, '#a8282c'], [1, '#5a1014']]), '#3a080a', 0.8);
        c.save(); rr(c, 13, -10, 38, 28, 2); c.clip();
        c.strokeStyle = rgba('#e8a0a0', 0.15); for (let k = -30; k < 60; k += 5) line(c, 13 + k, -10, 13 + k + 28, 18, rgba('#ffb0b0', 0.12), 0.8);
        c.restore();
        for (const bx of [17, 47]) { rr(c, bx - 2.5, -13, 5, 34, 0.5); fs(c, lg(c, bx - 2.5, 0, bx + 2.5, 0, [[0, '#e8c46a'], [1, '#7a5418']]), '#5a3e10', 0.6); }
        // opening (interior)
        rr(c, 10, 20, 44, 12, 1); fs(c, '#2a0c0a', ol(wood), 1);
        rr(c, 12, 22, 40, 9, 1); fs(c, lg(c, 0, 22, 0, 31, [[0, '#3a0a0c'], [1, '#8a2228']]), null);
        c.fillStyle = rg(c, 32, 28, 16, [[0, 'rgba(255,220,140,0.35)'], [1, 'rgba(255,220,140,0)']]); c.fillRect(12, 22, 40, 9);
        line(c, 10, 31.5, 54, 31.5, rgba('#ffd8b0', 0.3), 1);
        for (const bx of [17, 47]) { rr(c, bx - 2.5, 30, 5, 27, 0.5); fs(c, lg(c, bx - 2.5, 0, bx + 2.5, 0, [[0, '#f2d07a'], [1, '#8a6420']]), '#5a3e10', 0.7); }
        rr(c, 29, 31, 6, 7, 1); fs(c, brass, '#4a3008', 0.7);
      }
      for (const hx of [8, 56]) { ell(c, hx, 40, 2.4, 3.4); fs(c, null, '#c9a04a', 1.2); }
    },
  });

  // switch — stone pressure plate with a bagua rune. o.on. Non-solid.
  def('switch', {
    solid: false, up: 0, key: (o) => (o.on ? 1 : 0), anim: true,
    art(c, W, H, o) {
      const on = !!o.on;
      const lip = on ? 1.5 : 4;
      rr(c, 9, 14, 46, 42, 3); fs(c, 'rgba(20,10,5,0.3)', null);
      rr(c, 10, 52 - lip, 44, lip + 2, 2); fs(c, '#55524c', '#2e2c28', 0.8);
      rr(c, 10, 15 - (4 - lip), 44, 38, 3);
      fs(c, lg(c, 10, 14, 40, 52, [[0, '#a7a39a'], [1, '#77736c']]), '#3a3834', 1);
      const cy = 34 - (4 - lip);
      speckle(c, 12, cy - 18, 40, 36, 50, '#2a2826', 0.25, 13, 0.7);
      // octagon + trigrams
      const ring = on ? '#7fffd0' : '#4c4944';
      c.beginPath();
      for (let k = 0; k <= 8; k++) { const a = k / 8 * TAU + PI / 8; c.lineTo(32 + cos(a) * 15, cy + sin(a) * 13); }
      c.strokeStyle = ring; c.lineWidth = on ? 1.4 : 1.2; c.stroke();
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU;
        for (let j = 0; j < 3; j++) {
          const rr2 = 9.5 + j * 1.6, broken = ((k >> j) & 1) === 1;
          const px = cos(a) * rr2, py = sin(a) * rr2 * 0.87, tx = -sin(a) * 2.2, ty = cos(a) * 2.2 * 0.87;
          if (broken) { line(c, 32 + px - tx, cy + py - ty, 32 + px - tx * 0.25, cy + py - ty * 0.25, ring, 0.9); line(c, 32 + px + tx * 0.25, cy + py + ty * 0.25, 32 + px + tx, cy + py + ty, ring, 0.9); }
          else line(c, 32 + px - tx, cy + py - ty, 32 + px + tx, cy + py + ty, ring, 0.9);
        }
      }
      // taiji
      ell(c, 32, cy, 5.5, 4.8); fs(c, on ? '#d8fff0' : '#8a867e', ring, 0.8);
      c.beginPath(); c.ellipse(32, cy, 5.5, 4.8, 0, -PI / 2, PI / 2); c.ellipse(32, cy + 2.4, 2.75, 2.4, 0, PI / 2, -PI / 2, true); c.ellipse(32, cy - 2.4, 2.75, 2.4, 0, PI / 2, PI * 1.5, false);
      fs(c, on ? '#2aa880' : '#4c4944', null);
      line(c, 11, 15.5 - (4 - lip), 53, 15.5 - (4 - lip), rgba('#ffffff', 0.25), 1);
    },
    live(ctx, x, y, o, t, W, H, ph) {
      if (!o.on) return;
      glow(ctx, x + 32, y + 34, 24, '#6ff0c4', 0.28 + 0.1 * sin(t * 2.6 + ph * 8));
    },
    lights: (o) => (o.on ? [{ dx: 32, dy: 34, r: 70, color: '#7fe8c8', flicker: 0.1 }] : []),
  });

  // bronze tripod brazier with live flames
  def('brazier', {
    up: 40,
    art(c) {
      ground(c, 32, 56, 24, 6, 0.38);
      // back leg
      c.beginPath(); c.moveTo(30, 30); c.lineTo(34, 30); c.lineTo(34, 50); c.lineTo(30, 50); c.closePath(); fs(c, '#3a2a14', null);
      // inside of bowl
      ell(c, 32, 18, 23, 8.5); fs(c, '#2a1c0c', '#1a1006', 1);
      ell(c, 32, 19, 20, 6.8);
      fs(c, rg(c, 32, 19, 20, [[0, '#ffe08a'], [0.25, '#ff9a2a'], [0.6, '#c2400f'], [1, '#3a0e04']]), null);
      const r = U.seeded(31);
      for (let i = 0; i < 16; i++) { const a = r() * TAU, d = r(); ell(c, 32 + cos(a) * d * 16, 19 + sin(a) * d * 5, 2.6, 1.6); fs(c, rgba(d > 0.6 ? '#2a0c04' : '#5a1806', 0.75), null); }
    },
    front(c) {
      // legs (front two, curling feet)
      for (const [lx, d] of [[15, -1], [49, 1]]) {
        c.beginPath(); c.moveTo(lx - 2.5, 30); c.quadraticCurveTo(lx + d * 4, 44, lx + d * 6, 56); c.lineTo(lx + d * 9, 57); c.quadraticCurveTo(lx + d * 2, 44, lx + 2.5, 30); c.closePath();
        fs(c, lg(c, lx - 4, 0, lx + 6, 0, [[0, '#c69a52'], [1, '#4a3418']]), '#2a1c0a', 0.9);
        ell(c, lx + d * 7.5, 56.5, 3, 1.6); fs(c, '#5a4220', null);
      }
      // bowl front half
      c.beginPath(); c.moveTo(9, 18); c.bezierCurveTo(10, 32, 20, 38, 32, 38); c.bezierCurveTo(44, 38, 54, 32, 55, 18); c.ellipse(32, 18, 23, 8.5, 0, 0, PI, false); c.closePath();
      fs(c, lg(c, 9, 0, 55, 0, [[0, '#6a4a22'], [0.22, '#d8b066'], [0.4, '#a27a3a'], [0.85, '#4e3618'], [1, '#2e200c']]), '#24180a', 1.1);
      c.save(); c.clip();
      c.strokeStyle = rgba('#2a1c0a', 0.5); c.lineWidth = 0.8;
      c.beginPath(); c.ellipse(32, 26, 22, 6, 0, 0, PI); c.stroke();
      for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(14 + i * 6, 29, 1.8, 0, TAU); c.stroke(); }
      speckle(c, 9, 18, 46, 20, 25, C.patina, 0.3, 4, 1.2);
      c.restore();
      c.beginPath(); c.ellipse(32, 18, 23, 8.5, 0, 0, PI); c.strokeStyle = '#e8c47a'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.ellipse(32, 18, 23, 8.5, 0, 0.1, PI * 0.5); c.strokeStyle = rgba('#fff0c0', 0.6); c.lineWidth = 1; c.stroke();
    },
    live(ctx, x, y, o, t, W, H, ph) {
      glow(ctx, x + 32, y + 12, 42, '#ff8a30', 0.22 + 0.05 * sin(t * 8 + ph * 9));
      flame(ctx, x + 26, y + 20, 6, t, ph, FL.warm);
      flame(ctx, x + 39, y + 20, 5.5, t + 0.5, ph + 0.2, FL.warm);
      flame(ctx, x + 32, y + 21, 8, t + 0.25, ph + 0.4, FL.warm);
      for (let k = 0; k < 5; k++) {
        const life = (t * 0.7 + k / 5 + ph) % 1;
        const sx = x + 32 + sin(k * 2.1 + t * 1.3) * (6 + life * 8), sy = y + 14 - life * 44;
        ctx.fillStyle = rgba('#ffcf6a', (1 - life) * 0.9);
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
    },
    lights: () => [{ dx: 32, dy: 8, r: 190, color: '#ff9a40', flicker: 0.3 }],
  });

  // red lacquer pillar on a stone plinth
  def('pillar', {
    up: 172,
    art(c) {
      ground(c, 34, 56, 26, 6, 0.4);
      const x0 = 17, x1 = 47;
      // capital bracket
      rr(c, 8, -176, 48, 12, 1); fs(c, lg(c, 0, -176, 0, -164, [[0, '#2e5a5a'], [1, '#1c3a3a']]), '#0e2020', 1);
      for (let k = 0; k < 4; k++) { ell(c, 14 + k * 12, -170, 3.6, 3.6); fs(c, '#d9a441', '#6a4a12', 0.6); ell(c, 14 + k * 12, -170, 1.6, 1.6); fs(c, '#1c3a3a', null); }
      rr(c, 12, -165, 40, 6, 1); fs(c, '#6a1410', '#3a0806', 0.8);
      // column
      rr(c, x0, -160, x1 - x0, 206, 0);
      c.fillStyle = cylGrad(c, x0, x1, '#b5281e', 0.28, -0.32); c.fill();
      c.fillStyle = lg(c, 0, -160, 0, -100, [[0, 'rgba(20,5,2,0.45)'], [1, 'rgba(20,5,2,0)']]); c.fillRect(x0, -160, x1 - x0, 60);
      c.fillStyle = rgba('#ffffff', 0.18); c.fillRect(x0 + 5, -150, 2, 190);
      c.fillStyle = rgba('#ffffff', 0.08); c.fillRect(x0 + 8, -150, 3, 190);
      // gold bands
      for (const by of [-152, 28]) {
        c.beginPath(); c.moveTo(x0, by); c.ellipse(32, by, 15, 3, 0, PI, 0, true); c.lineTo(x1, by + 5); c.ellipse(32, by + 5, 15, 3, 0, 0, PI, false); c.closePath();
        c.fillStyle = cylGrad(c, x0, x1, C.gold, 0.4, -0.3); c.fill();
        c.strokeStyle = '#6a4a12'; c.lineWidth = 0.7; c.stroke();
      }
      line(c, x0, -160, x0, 46, '#4a0806', 1.2); line(c, x1, -160, x1, 46, '#4a0806', 1.2);
      // plinth (柱珠)
      c.beginPath(); c.moveTo(11, 44); c.bezierCurveTo(9, 52, 12, 57, 32, 58); c.bezierCurveTo(52, 57, 55, 52, 53, 44); c.closePath();
      fs(c, cylGrad(c, 10, 54, '#a19c92', 0.25, -0.3), '#3e3c38', 1);
      c.strokeStyle = rgba('#3e3c38', 0.5); c.lineWidth = 0.8;
      for (let k = 0; k < 7; k++) { const px = 14 + k * 6; c.beginPath(); c.moveTo(px, 55); c.quadraticCurveTo(px + 3, 46, px + 6, 55); c.stroke(); }
      ell(c, 32, 44, 21, 5.5); fs(c, lg(c, 11, 0, 53, 0, [[0, '#cbc6bc'], [1, '#8a867c']]), '#3e3c38', 1);
      c.beginPath(); c.moveTo(x0, 44); c.ellipse(32, 44, 15, 3.6, 0, PI, 0, true); c.lineTo(x1, 40); c.ellipse(32, 40, 15, 3.6, 0, 0, PI, false); c.closePath();
      c.fillStyle = cylGrad(c, x0, x1, '#9e2218', 0.2, -0.35); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(32, 44, 15, 3.6, 0, 0, PI); c.fill();
    },
  });

  // ---------------------------------------------------------------------------------------------
  // soul jar — glass jar sealed with a talisman, a trapped blue soul-light inside
  const jarPath = (c) => {
    c.beginPath();
    c.moveTo(24, 2); c.lineTo(40, 2);
    c.bezierCurveTo(40, 8, 52, 12, 52, 28); c.bezierCurveTo(52, 42, 46, 50, 32, 50); c.bezierCurveTo(18, 50, 12, 42, 12, 28); c.bezierCurveTo(12, 12, 24, 8, 24, 2);
    c.closePath();
  };
  def('soul_jar', {
    up: 20,
    art(c) {
      ground(c, 32, 56, 21, 5, 0.4);
      // stand
      ell(c, 32, 52, 19, 5); fs(c, '#3a2216', null);
      rr(c, 14, 52, 36, 5, 1.5); fs(c, lg(c, 14, 0, 50, 0, [[0, '#6a4228'], [1, '#2e1a10']]), '#1a0c06', 0.8);
      ell(c, 32, 51, 19, 5); fs(c, lg(c, 13, 0, 51, 0, [[0, '#7a4e30'], [1, '#4a2c1a']]), '#1a0c06', 0.8);
      // inside of jar: dark blue
      jarPath(c); fs(c, rg(c, 32, 28, 26, [[0, '#1a3550'], [1, '#081420']]), null);
      ell(c, 32, 48, 16, 3); fs(c, rgba('#4fb4ff', 0.12), null);
    },
    front(c) {
      // glass body
      jarPath(c);
      c.fillStyle = lg(c, 12, 0, 52, 0, [[0, 'rgba(190,230,255,0.28)'], [0.3, 'rgba(190,230,255,0.06)'], [0.75, 'rgba(120,180,220,0.08)'], [1, 'rgba(120,180,220,0.25)']]); c.fill();
      c.strokeStyle = 'rgba(200,236,255,0.7)'; c.lineWidth = 1.2; c.stroke();
      c.beginPath(); c.moveTo(17, 18); c.quadraticCurveTo(14, 30, 18, 42); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.8; c.stroke();
      c.beginPath(); c.moveTo(46, 22); c.quadraticCurveTo(48, 30, 46, 38); c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1; c.stroke();
      // lid
      ell(c, 32, 2, 10, 3); fs(c, '#5a4428', null);
      rr(c, 21, -5, 22, 7, 2); fs(c, lg(c, 21, 0, 43, 0, [[0, '#c69a52'], [0.35, '#e6c27a'], [1, '#5a4020']]), '#2e200c', 0.9);
      ell(c, 32, -5, 11, 3); fs(c, lg(c, 21, 0, 43, 0, [[0, '#e8c884'], [1, '#7a5a2c']]), '#2e200c', 0.8);
      ell(c, 32, -8, 3, 2.5); fs(c, '#d6ad62', '#2e200c', 0.7);
      // red cord at neck
      c.beginPath(); c.ellipse(32, 5, 9, 2.4, 0, 0, PI); c.strokeStyle = '#c0281e'; c.lineWidth = 1.4; c.stroke();
      line(c, 40, 5.6, 42, 12, '#c0281e', 1); line(c, 40, 5.6, 39, 13, '#c0281e', 1);
      // talisman
      c.beginPath(); c.moveTo(28.5, -7); c.lineTo(35.5, -7); c.quadraticCurveTo(36.5, 8, 36, 28); c.lineTo(28, 29); c.quadraticCurveTo(28, 8, 28.5, -7); c.closePath();
      fs(c, lg(c, 28, 0, 36, 0, [[0, '#f6dc6a'], [1, '#d4b040']]), '#8a6a1a', 0.6);
      c.strokeStyle = '#b8241c'; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(30, 0); c.lineTo(34, 0); c.moveTo(32, -2); c.lineTo(32, 26); c.moveTo(30, 6); c.quadraticCurveTo(34, 8, 30, 11); c.moveTo(34, 13); c.quadraticCurveTo(30, 16, 34, 19); c.moveTo(30, 22); c.lineTo(34, 24); c.stroke();
      ell(c, 32, 28.5, 2, 1); fs(c, '#d4b040', null);
    },
    live(ctx, x, y, o, t, W, H, ph) {
      const bob = sin(t * 1.6 + ph * 9) * 2.2;
      const cx = x + 32 + sin(t * 0.9 + ph * 5) * 2, cy = y + 30 + bob;
      ctx.save();
      jarPathAt(ctx, x, y); ctx.clip();
      glow(ctx, cx, cy, 30, '#3fa0ff', 0.45 + 0.1 * sin(t * 3.1 + ph * 4));
      flame(ctx, cx, cy + 6, 4.2, t, ph, FL.blue, 0.8);
      for (let k = 0; k < 5; k++) {
        const a = t * (0.8 + k * 0.17) + k * 1.3 + ph * 6;
        const mx = cx + cos(a) * (8 + k * 1.5), my = cy + sin(a) * (5 + k) * 0.7;
        ctx.fillStyle = rgba('#c8f0ff', 0.5 + 0.4 * sin(t * 4 + k));
        ctx.beginPath(); ctx.arc(mx, my, 0.9, 0, TAU); ctx.fill();
      }
      ctx.restore();
      glow(ctx, x + 32, y + 28, 40, '#3f90ff', 0.12);
    },
    lights: () => [{ dx: 32, dy: 28, r: 120, color: '#5ab8ff', flicker: 0.25 }],
  });
  function jarPathAt(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x + 24, y + 2); ctx.lineTo(x + 40, y + 2);
    ctx.bezierCurveTo(x + 40, y + 8, x + 52, y + 12, x + 52, y + 28); ctx.bezierCurveTo(x + 52, y + 42, x + 46, y + 50, x + 32, y + 50);
    ctx.bezierCurveTo(x + 18, y + 50, x + 12, y + 42, x + 12, y + 28); ctx.bezierCurveTo(x + 12, y + 12, x + 24, y + 8, x + 24, y + 2);
    ctx.closePath();
  }

  // 長明燈 — stone pillar lamp with a bronze lamp-house and eternal pale flame
  def('eternal_lamp', {
    up: 72,
    art(c) {
      ground(c, 32, 56, 20, 5, 0.38);
      const st = '#a8a398';
      // base (octagonal step)
      c.beginPath(); c.moveTo(14, 46); c.lineTo(50, 46); c.lineTo(52, 57); c.lineTo(12, 57); c.closePath(); fs(c, lg(c, 12, 0, 52, 0, [[0, '#bdb8ad'], [1, '#6e6a62']]), '#3a3834', 1);
      ell(c, 32, 46, 18, 4.5); fs(c, '#c8c3b8', '#3a3834', 0.9);
      // shaft
      rr(c, 26, -10, 12, 57, 1); fs(c, cylGrad(c, 26, 38, st, 0.3, -0.3), '#3a3834', 1);
      for (const ry of [6, 26]) { rr(c, 24, ry, 16, 4, 1.5); fs(c, cylGrad(c, 24, 40, st, 0.3, -0.3), '#3a3834', 0.8); }
      speckle(c, 26, -10, 12, 56, 25, '#3a3834', 0.25, 6, 0.6);
      // platform
      rr(c, 15, -17, 34, 8, 1.5); fs(c, lg(c, 15, -17, 15, -9, [[0, '#cfcabd'], [1, '#8a867c']]), '#3a3834', 1);
      // lamp house back
      rr(c, 19, -44, 26, 28, 1); fs(c, lg(c, 0, -44, 0, -16, [[0, '#3a2a14'], [1, '#5a4222']]), null);
      c.fillStyle = rg(c, 32, -26, 16, [[0, 'rgba(255,236,180,0.85)'], [1, 'rgba(255,200,120,0.1)']]); c.fillRect(19, -44, 26, 28);
      // oil cup
      ell(c, 32, -19, 5, 1.6); fs(c, '#6a4a22', null);
      rr(c, 29, -21, 6, 3, 1); fs(c, '#8a6a3a', '#3a2810', 0.6);
    },
    front(c) {
      // bronze posts + lattice
      for (const px of [18, 43]) { rr(c, px, -45, 3.5, 30, 0.6); fs(c, lg(c, px, 0, px + 3.5, 0, [[0, '#d0a85a'], [1, '#4e3a1e']]), '#2a1c0a', 0.7); }
      c.strokeStyle = '#6a4e24'; c.lineWidth = 0.9;
      for (const lx of [25, 32, 39]) { c.beginPath(); c.moveTo(lx, -42); c.lineTo(lx, -36); c.moveTo(lx, -22); c.lineTo(lx, -17); c.stroke(); }
      line(c, 21, -36, 43, -36, '#6a4e24', 0.9); line(c, 21, -22, 43, -22, '#6a4e24', 0.9);
      rr(c, 17, -17, 30, 3, 1); fs(c, '#8a6a3a', '#2a1c0a', 0.6);
      // roof with upturned eaves
      c.beginPath(); c.moveTo(10, -44); c.quadraticCurveTo(16, -46, 22, -52); c.lineTo(42, -52); c.quadraticCurveTo(48, -46, 54, -44); c.quadraticCurveTo(52, -42, 50, -42); c.lineTo(14, -42); c.quadraticCurveTo(12, -42, 10, -44); c.closePath();
      fs(c, lg(c, 0, -52, 0, -42, [[0, '#7aa898'], [1, '#3e6a5e']]), '#1c3a32', 1);
      c.beginPath(); c.moveTo(22, -52); c.quadraticCurveTo(32, -60, 42, -52); c.closePath(); fs(c, '#5f9384', '#1c3a32', 0.8);
      ell(c, 32, -61, 3.2, 3.2); fs(c, rg(c, 32, -61, 3.2, [[0, '#fff0b0'], [1, '#c8902a']], 31, -62, 0), '#6a4a12', 0.6);
      line(c, 12, -43.5, 52, -43.5, rgba('#e6f4ee', 0.4), 0.8);
    },
    live(ctx, x, y, o, t, W, H, ph) {
      ctx.save(); ctx.beginPath(); ctx.rect(x + 19, y - 44, 26, 28); ctx.clip();
      flame(ctx, x + 32, y - 21, 3.4, t * 0.6, ph, FL.pale, 1.1);
      ctx.restore();
      glow(ctx, x + 32, y - 28, 34, '#ffe6b0', 0.2 + 0.03 * sin(t * 2 + ph * 6));
      glow(ctx, x + 32, y - 28, 12, '#9ff0ff', 0.08);
    },
    lights: () => [{ dx: 32, dy: -28, r: 160, color: '#ffe2a8', flicker: 0.06 }],
  });

  // =============================================================================================
  // WALL ART, BEDDING, SMALL FURNITURE
  // =============================================================================================

  // mural (2x1) — place on the wall-face row. o.v 0..4
  function muralScene(c, v, x, y, w, h) {
    const r = U.seeded(500 + v * 17);
    const cx = x + w / 2;
    if (v === 0) { // 燈母 lantern goddess
      c.fillStyle = lg(c, 0, y, 0, y + h, [[0, '#2a3a5a'], [1, '#4a5a6a']]); c.fillRect(x, y, w, h);
      c.fillStyle = rg(c, cx, y + h * 0.45, h * 0.9, [[0, 'rgba(255,214,140,0.85)'], [0.5, 'rgba(240,170,90,0.3)'], [1, 'rgba(240,170,90,0)']]); c.fillRect(x, y, w, h);
      c.strokeStyle = rgba('#ffe6a8', 0.4); c.lineWidth = 0.8;
      for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; line(c, cx + cos(a) * 9, y + 17 + sin(a) * 9, cx + cos(a) * 34, y + 17 + sin(a) * 26, rgba('#ffe6a8', 0.25), 0.8); }
      ell(c, cx, y + 13, 8, 8); fs(c, null, '#f6d98a', 1.3);
      // robe (flowing)
      c.beginPath(); c.moveTo(cx - 3, y + 17); c.bezierCurveTo(cx - 12, y + 26, cx - 20, y + 38, cx - 26, y + h - 2); c.lineTo(cx + 24, y + h - 2); c.bezierCurveTo(cx + 18, y + 36, cx + 10, y + 26, cx + 3, y + 17); c.closePath();
      fs(c, lg(c, 0, y + 16, 0, y + h, [[0, '#f8f0dc'], [1, '#c8b890']]), '#8a7a5a', 0.6);
      c.strokeStyle = rgba('#b8a070', 0.7); c.lineWidth = 0.6;
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(cx + k * 2, y + 22); c.quadraticCurveTo(cx + k * 6, y + 34, cx + k * 9, y + h - 3); c.stroke(); }
      // sleeves / scarf
      c.beginPath(); c.moveTo(cx - 4, y + 20); c.quadraticCurveTo(cx - 26, y + 18, cx - 40, y + 30); c.strokeStyle = rgba('#e88a6a', 0.8); c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.moveTo(cx + 4, y + 20); c.quadraticCurveTo(cx + 26, y + 18, cx + 40, y + 28); c.stroke();
      // head + hair
      ell(c, cx, y + 13, 3, 3.4); fs(c, '#f4e2c8', null);
      ell(c, cx, y + 9.5, 3.2, 2); fs(c, '#2a2420', null);
      // lantern held at the chest
      ell(c, cx, y + 26, 3.4, 3.8); fs(c, rg(c, cx, y + 26, 4, [[0, '#fff6c8'], [1, '#e8642a']]), null);
      c.fillStyle = rg(c, cx, y + 26, 12, [[0, 'rgba(255,220,140,0.6)'], [1, 'rgba(255,220,140,0)']]); c.fillRect(cx - 12, y + 14, 24, 24);
      // clouds
      c.strokeStyle = rgba('#f4ead2', 0.8); c.lineWidth = 1;
      for (const [px, py] of [[x + 12, y + h - 8], [x + w - 16, y + h - 10], [x + 22, y + 10], [x + w - 24, y + 12]]) { c.beginPath(); c.arc(px, py, 4, PI, TAU); c.arc(px + 7, py, 3, PI, TAU); c.arc(px + 3.5, py + 3, 2.4, 0, PI); c.stroke(); }
      for (let k = 0; k < 8; k++) { const lx = x + 6 + r() * (w - 12), ly = y + 4 + r() * (h - 10); if (abs(lx - cx) < 26) continue; ell(c, lx, ly, 1.6, 2); fs(c, '#f0a040', null); }
    } else if (v === 1) { // a girl of light on the sea
      c.fillStyle = lg(c, 0, y, 0, y + h, [[0, '#14243a'], [0.55, '#1e3a52'], [1, '#2a5468']]); c.fillRect(x, y, w, h);
      ell(c, x + w - 18, y + 9, 5, 5); fs(c, '#f4ecd0', null);
      for (let k = 0; k < 20; k++) { c.fillStyle = rgba('#f4ecd0', 0.6); c.fillRect(x + r() * w, y + r() * h * 0.45, 0.8, 0.8); }
      c.fillStyle = rg(c, cx, y + 22, 30, [[0, 'rgba(200,240,255,0.7)'], [1, 'rgba(200,240,255,0)']]); c.fillRect(x, y, w, h);
      // waves (青海波)
      for (let row = 0; row < 4; row++) {
        const wy = y + 30 + row * 4.4;
        for (let wx = x - 4 + (row % 2) * 5; wx < x + w + 6; wx += 10) {
          for (let k = 3; k >= 1; k--) { c.beginPath(); c.arc(wx, wy + 4, k * 1.6, PI, TAU); c.strokeStyle = rgba(k === 3 ? '#e8f4f0' : '#5a9aaa', 0.75); c.lineWidth = 0.7; c.stroke(); }
        }
      }
      // girl figure
      c.beginPath(); c.moveTo(cx, y + 9); c.bezierCurveTo(cx - 4, y + 14, cx - 6, y + 24, cx - 9, y + 32); c.lineTo(cx + 8, y + 32); c.bezierCurveTo(cx + 5, y + 24, cx + 4, y + 14, cx, y + 9); c.closePath();
      fs(c, lg(c, 0, y + 9, 0, y + 32, [[0, '#ffffff'], [1, '#bfeaff']]), null);
      c.beginPath(); c.moveTo(cx - 1, y + 9); c.bezierCurveTo(cx + 10, y + 10, cx + 16, y + 16, cx + 22, y + 14); c.strokeStyle = rgba('#e8f8ff', 0.85); c.lineWidth = 1.4; c.stroke();
      ell(c, cx, y + 9, 2.4, 2.6); fs(c, '#ffffff', null);
      // reflection
      c.fillStyle = lg(c, 0, y + 32, 0, y + h, [[0, 'rgba(220,250,255,0.6)'], [1, 'rgba(220,250,255,0)']]); c.fillRect(cx - 4, y + 32, 8, h - 32);
    } else if (v === 2) { // the ferryman
      c.fillStyle = lg(c, 0, y, 0, y + h, [[0, '#c87a3a'], [0.5, '#e8b070'], [0.56, '#3a4a5a'], [1, '#1e2a36']]); c.fillRect(x, y, w, h);
      c.beginPath(); c.arc(x + 22, y + 10, 5, -0.6, PI * 0.7); c.arc(x + 24, y + 9, 4.2, PI * 0.7, -0.6, true); fs(c, '#fff4d8', null);
      // distant shore
      c.fillStyle = rgba('#5a4a5a', 0.6); c.beginPath(); c.moveTo(x, y + 24); c.quadraticCurveTo(x + 30, y + 17, x + 60, y + 23); c.quadraticCurveTo(x + 90, y + 18, x + w, y + 24); c.lineTo(x + w, y + 25); c.lineTo(x, y + 25); c.fill();
      // boat
      const bx = cx + 6, by = y + 32;
      c.beginPath(); c.moveTo(bx - 22, by - 3); c.quadraticCurveTo(bx, by + 6, bx + 20, by - 4); c.lineTo(bx + 16, by - 1); c.quadraticCurveTo(bx, by + 2, bx - 18, by - 1); c.closePath(); fs(c, '#1a1410', null);
      c.beginPath(); c.moveTo(bx - 22, by - 3); c.quadraticCurveTo(bx, by + 6, bx + 20, by - 4); c.strokeStyle = rgba('#ffb060', 0.8); c.lineWidth = 0.8; c.stroke();
      c.fillStyle = lg(c, 0, by + 2, 0, by + 12, [[0, 'rgba(255,170,90,0.35)'], [1, 'rgba(255,170,90,0)']]); c.fillRect(bx - 18, by + 2, 36, 10);
      // ferryman
      c.beginPath(); c.moveTo(bx + 8, by - 2); c.lineTo(bx + 5, by - 14); c.lineTo(bx + 11, by - 14); c.closePath(); fs(c, '#1a1410', null);
      c.beginPath(); c.moveTo(bx + 1, by - 18); c.lineTo(bx + 15, by - 18); c.lineTo(bx + 8, by - 21); c.closePath(); fs(c, '#1a1410', null);
      ell(c, bx + 8, by - 16, 1.8, 1.8); fs(c, '#1a1410', null);
      line(c, bx + 2, by - 16, bx + 22, by + 8, '#1a1410', 1);
      // lantern on boat + floating lanterns
      const lan = (lx, ly, s) => { c.fillStyle = rg(c, lx, ly, s * 4, [[0, 'rgba(255,200,110,0.6)'], [1, 'rgba(255,200,110,0)']]); c.fillRect(lx - s * 4, ly - s * 4, s * 8, s * 8); ell(c, lx, ly, s, s * 1.1); fs(c, '#ffb050', null); line(c, lx, ly + s, lx, ly + s + 3, rgba('#ffb050', 0.4), s * 0.8); };
      lan(bx - 18, by - 8, 1.8);
      for (let k = 0; k < 9; k++) lan(x + 6 + r() * (w - 12), y + 30 + r() * 12, 0.9 + r() * 0.5);
    } else if (v === 3) { // a thousand lanterns rising
      c.fillStyle = lg(c, 0, y, 0, y + h, [[0, '#0e1430'], [0.7, '#2a2a50'], [1, '#4a3a50']]); c.fillRect(x, y, w, h);
      for (let k = 0; k < 120; k++) {
        const d = r(), lx = x + r() * w, ly = y + h - 6 - Math.pow(r(), 0.7) * (h - 4);
        const s = 0.6 + (ly - y) / h * 1.6 * (0.6 + d * 0.4);
        c.fillStyle = rg(c, lx, ly, s * 3, [[0, 'rgba(255,190,90,0.45)'], [1, 'rgba(255,190,90,0)']]); c.fillRect(lx - s * 3, ly - s * 3, s * 6, s * 6);
        rr(c, lx - s * 0.6, ly - s * 0.8, s * 1.2, s * 1.6, s * 0.4); fs(c, mix('#ffd27a', '#ff8a3a', r()), null);
      }
      for (const [col, base, amp, sd] of [['#2a2440', y + h - 10, 9, 1], ['#18142a', y + h - 4, 7, 4]]) {
        c.beginPath(); c.moveTo(x, y + h);
        for (let px = 0; px <= w; px += 5) c.lineTo(x + px, base - abs(sin(px * 0.06 + sd)) * amp);
        c.lineTo(x + w, y + h); c.closePath(); fs(c, col, null);
      }
    } else { // a serpent and a clouded leopard
      c.fillStyle = lg(c, 0, y, 0, y + h, [[0, '#2f6a5a'], [1, '#1c4a42']]); c.fillRect(x, y, w, h);
      c.strokeStyle = rgba('#d8e8c8', 0.55); c.lineWidth = 0.9;
      for (let k = 0; k < 7; k++) { const px = x + 8 + r() * (w - 16), py = y + 6 + r() * (h - 12); c.beginPath(); c.arc(px, py, 3, PI * 0.5, PI * 2.2); c.stroke(); c.beginPath(); c.arc(px + 5, py + 1, 2, PI, PI * 2.6); c.stroke(); }
      // serpent body (patterned band)
      const pts = [];
      for (let s = 0; s <= 1.0001; s += 0.02) pts.push([x + 30 + s * (w - 36), y + h * 0.5 + sin(s * 9) * h * 0.28 * (0.4 + s * 0.6)]);
      c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.strokeStyle = '#1a2a24'; c.lineWidth = 7; c.stroke();
      c.strokeStyle = '#d8a848'; c.lineWidth = 5; c.stroke();
      for (let i = 1; i < pts.length; i += 2) { const [px, py] = pts[i]; c.save(); c.translate(px, py); c.rotate(PI / 4); c.fillStyle = i % 4 === 1 ? '#a8321e' : '#2a2a3a'; c.fillRect(-1.5, -1.5, 3, 3); c.restore(); }
      const [hx, hy] = pts[pts.length - 1];
      ell(c, hx + 2, hy, 4, 3); fs(c, '#d8a848', '#1a2a24', 0.8); ell(c, hx + 3, hy - 1, 0.7, 0.7); fs(c, '#a8321e', null);
      // clouded leopard leaping (left)
      const lx = x + 18, ly = y + h * 0.42;
      c.beginPath(); c.moveTo(lx - 12, ly + 6); c.bezierCurveTo(lx - 8, ly - 2, lx + 6, ly - 4, lx + 12, ly - 1);
      c.lineTo(lx + 16, ly - 4); c.lineTo(lx + 17, ly + 1); c.bezierCurveTo(lx + 12, ly + 5, lx + 2, ly + 6, lx - 4, ly + 7); c.closePath();
      fs(c, '#c8a060', '#3a2a14', 0.7);
      c.beginPath(); c.moveTo(lx - 11, ly + 5); c.quadraticCurveTo(lx - 20, ly + 2, lx - 22, ly + 10); c.strokeStyle = '#c8a060'; c.lineWidth = 2; c.stroke();
      for (const [a, b] of [[-6, 2], [0, 1], [6, 1], [-2, 5], [4, 4]]) { ell(c, lx + a, ly + b, 2, 1.3); fs(c, null, '#3a2a14', 0.7); }
      line(c, lx + 10, ly + 2, lx + 15, ly + 10, '#c8a060', 1.6); line(c, lx - 8, ly + 6, lx - 13, ly + 13, '#c8a060', 1.6);
    }
  }
  def('mural', {
    w: 2, up: 4, wallMount: true, key: (o) => (o.v | 0) % 5,
    art(c, W, H, o) {
      const v = (o.v | 0) % 5;
      rr(c, 3, 3, W - 6, 56, 2); fs(c, rgba('#000000', 0.18), null);
      rr(c, 4, 2, W - 8, 55, 2); fs(c, lg(c, 0, 2, 0, 57, [[0, '#d9c49a'], [1, '#c2aa7c']]), '#6a5434', 1);
      rr(c, 6.5, 4.5, W - 13, 50, 1); fs(c, '#7a2a1e', null);
      rr(c, 8, 6, W - 16, 47, 1); c.strokeStyle = rgba(C.goldL, 0.8); c.lineWidth = 0.8; c.stroke();
      const x = 9.5, y = 7.5, w = W - 19, h = 44;
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      muralScene(c, v, x, y, w, h);
      // ageing: faded wash, flaking, cracks, vignette
      c.fillStyle = rgba('#d8c49a', 0.16); c.fillRect(x, y, w, h);
      const r = U.seeded(900 + v);
      for (let k = 0; k < 7; k++) { ell(c, x + r() * w, y + r() * h, 0.8 + r() * 2.4, 0.6 + r() * 1.4); fs(c, rgba('#e2d2ac', 0.15 + r() * 0.2), null); }
      c.strokeStyle = rgba('#2a1e14', 0.35); c.lineWidth = 0.5;
      for (let k = 0; k < 4; k++) { let px = x + r() * w, py = y + r() * h; c.beginPath(); c.moveTo(px, py); for (let s = 0; s < 5; s++) { px += (r() - 0.5) * 12; py += r() * 6; c.lineTo(px, py); } c.stroke(); }
      c.fillStyle = rg(c, x + w / 2, y + h / 2, w * 0.62, [[0.55, 'rgba(40,25,10,0)'], [1, 'rgba(40,25,10,0.45)']]); c.fillRect(x, y, w, h);
      c.restore();
    },
  });

  // bed_mat — 草蓆 sleeping mat with pillow and folded 藍染 quilt. 1x2, non-solid.
  def('bed_mat', {
    w: 1, h: 2, solid: false, up: 0,
    art(c) {
      rr(c, 6, 9, 54, 114, 3); fs(c, 'rgba(25,12,6,0.25)', null);
      rr(c, 5, 6, 54, 114, 3); fs(c, lg(c, 5, 0, 59, 0, [[0, '#dcc690'], [1, '#c2aa70']]), '#6a5430', 1);
      c.save(); rr(c, 5, 6, 54, 114, 3); c.clip();
      for (let yy = 6; yy < 122; yy += 1.8) line(c, 5, yy, 59, yy, rgba('#8a7040', 0.22), 0.6);
      for (let xx = 9; xx < 59; xx += 9) line(c, xx, 6, xx, 122, rgba('#6a5430', 0.18), 0.8);
      c.restore();
      rr(c, 5, 6, 54, 114, 3); c.strokeStyle = '#3a4a6a'; c.lineWidth = 2.4; c.stroke();
      // pillow
      rr(c, 13, 11, 38, 14, 5); fs(c, lg(c, 0, 11, 0, 25, [[0, '#f8f2e2'], [1, '#d4c8ac']]), '#8a7c60', 0.9);
      for (const yy of [15, 18.5, 22]) line(c, 15, yy, 49, yy, rgba('#3a5a8a', 0.45), 0.9);
      // folded quilt
      c.beginPath(); c.moveTo(8, 66); c.quadraticCurveTo(32, 62, 56, 66); c.lineTo(57, 112); c.quadraticCurveTo(32, 116, 7, 112); c.closePath();
      fs(c, lg(c, 7, 0, 57, 0, [[0, '#3a5a92'], [0.5, '#2c4a80'], [1, '#1e345e']]), '#121f3a', 1);
      c.save(); c.clip();
      const r = U.seeded(17);
      for (let k = 0; k < 26; k++) { const px = 10 + r() * 46, py = 68 + r() * 44; ell(c, px, py, 1.6, 1.6); fs(c, null, rgba('#e8eef8', 0.6), 0.6); ell(c, px, py, 0.5, 0.5); fs(c, rgba('#e8eef8', 0.7), null); }
      c.fillStyle = lg(c, 0, 66, 0, 112, [[0, 'rgba(255,255,255,0.12)'], [0.12, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0.12)'], [0.55, 'rgba(255,255,255,0.06)'], [1, 'rgba(0,0,0,0.2)']]); c.fillRect(6, 62, 52, 54);
      c.restore();
      c.beginPath(); c.moveTo(9, 88); c.quadraticCurveTo(32, 85, 55, 88); c.strokeStyle = rgba('#0e1830', 0.6); c.lineWidth = 1; c.stroke();
    },
  });

  // gongfu tea set on a low wooden tea table
  def('tea_set', {
    up: 0,
    art(c) {
      const base = '#5e3622';
      groundRect(c, 8, 46, 48, 12, 0.32);
      for (const lx of [9, 50]) board(c, lx, 46, 5, 13, shade(base, -0.1), lx, { grain: false });
      board(c, 6, 42, 52, 6, shade(base, -0.15), 2, { r: 1 });
      board(c, 6, 20, 52, 23, shade(base, 0.08), 3, { r: 2.5 });
      // bamboo tray
      rr(c, 11, 23, 42, 17, 2); fs(c, '#a88450', '#5a4020', 0.8);
      for (let x = 13; x < 52; x += 3) line(c, x, 24, x, 39, rgba('#5a4020', 0.5), 0.8);
      // teapot (紫砂)
      const tx = 26, ty = 30;
      c.beginPath(); c.moveTo(tx - 9, ty - 1); c.quadraticCurveTo(tx - 14, ty - 2, tx - 15, ty - 6); c.lineTo(tx - 13, ty - 6.5); c.quadraticCurveTo(tx - 12, ty - 3, tx - 8, ty - 3); c.closePath(); fs(c, '#6a3a2a', '#2a140c', 0.7);
      c.beginPath(); c.ellipse(tx + 9, ty - 0.5, 3, 3.6, 0, -PI / 2, PI / 2); c.strokeStyle = '#5a2e20'; c.lineWidth = 1.8; c.stroke();
      ell(c, tx, ty + 1, 8.5, 6); fs(c, rg(c, tx, ty + 1, 9, [[0, '#9a5a40'], [0.6, '#6e3a28'], [1, '#3a1a10']], tx - 3, ty - 2, 0), '#2a140c', 0.8);
      ell(c, tx, ty - 3.5, 4, 1.6); fs(c, '#7a4430', '#2a140c', 0.6); ell(c, tx, ty - 5, 1.4, 1.2); fs(c, '#8a5038', null);
      ell(c, tx - 3, ty - 1, 1.6, 2.4); fs(c, rgba('#ffffff', 0.25), null);
      // cups (white & blue)
      for (const [cx, cy] of [[40, 27], [46, 31], [40, 35], [34, 37]]) {
        ell(c, cx, cy + 1.2, 3.4, 1.6); fs(c, 'rgba(0,0,0,0.2)', null);
        c.beginPath(); c.moveTo(cx - 3, cy); c.quadraticCurveTo(cx - 2.6, cy + 3, cx, cy + 3); c.quadraticCurveTo(cx + 2.6, cy + 3, cx + 3, cy); c.closePath(); fs(c, '#f4f2ec', '#8a8a90', 0.5);
        ell(c, cx, cy, 3, 1.3); fs(c, '#c08a3a', '#8a8a90', 0.5);
        line(c, cx - 2, cy + 1.8, cx + 2, cy + 1.8, '#3a5a9a', 0.5);
      }
      // tea caddy
      rr(c, 47, 21, 6, 8, 1); fs(c, cylGrad(c, 47, 53, '#3a6a5a'), '#1a2a24', 0.6); ell(c, 50, 21, 3, 1); fs(c, '#d8b060', null);
    },
  });

  // bamboo rack with lanterns hung to dry (bare, pasted, painted)
  def('lantern_rack', {
    w: 2, up: 72,
    art(c) {
      groundRect(c, 4, 52, 120, 10, 0.3);
      const pole = (x, y0, y1) => {
        rr(c, x - 3, y0, 6, y1 - y0, 2); fs(c, cylGrad(c, x - 3, x + 3, C.bamboo), C.bambooD, 0.8);
        for (let y = y0 + 14; y < y1 - 4; y += 22) { line(c, x - 3, y, x + 3, y, shade(C.bambooD, -0.2), 1.2); line(c, x - 3, y + 1.2, x + 3, y + 1.2, rgba('#fff0c8', 0.4), 0.6); }
      };
      const bar = (y, x0, x1) => {
        rr(c, x0, y - 2.5, x1 - x0, 5, 2.5); fs(c, lg(c, 0, y - 2.5, 0, y + 2.5, [[0, shade(C.bamboo, 0.3)], [1, shade(C.bamboo, -0.25)]]), C.bambooD, 0.8);
        for (let x = x0 + 18; x < x1 - 4; x += 26) line(c, x, y - 2.5, x, y + 2.5, shade(C.bambooD, -0.2), 1);
      };
      // feet
      for (const fx of [9, 119]) { rr(c, fx - 9, 54, 18, 5, 1.5); fs(c, lg(c, 0, 54, 0, 59, [[0, '#8a6a3a'], [1, '#5a4020']]), '#3a2a10', 0.8); }
      pole(9, -66, 57); pole(119, -66, 57);
      bar(-60, 3, 125); bar(-14, 5, 123);
      // ties at joints
      for (const [x, y] of [[9, -60], [119, -60], [9, -14], [119, -14]]) { line(c, x - 4, y - 3, x + 4, y + 3, '#7a5a2a', 1.2); line(c, x - 4, y + 3, x + 4, y - 3, '#7a5a2a', 1.2); }
      const kinds = [
        { shape: 'skeleton' }, { col: '#f3ead2', motif: 0 }, { col: '#d8342a', motif: 1 }, { col: '#f3ead2', motif: 3 },
        { col: '#d8342a', motif: 3 }, { shape: 'skeleton' }, { col: '#f2c14e', motif: 2 }, { col: '#f3ead2', motif: 4 },
      ];
      [-60, -14].forEach((by, ri) => {
        [28, 52, 76, 100].forEach((x, i) => {
          const k = kinds[ri * 4 + i];
          const rw = 9 + ((i + ri) % 2) * 1.5, rh = rw * (k.shape === 'skeleton' ? 1.05 : 0.95);
          const cy = by + 8 + rh;
          line(c, x, by + 2, x, cy - rh - 2, '#4a3a28', 0.8);
          lantern(c, x, cy, rw, rh, k.col || C.bamboo, { shape: k.shape || 'round', motif: k.motif, tassel: k.col === '#d8342a' });
        });
      });
      // drying paper strips
      for (const [x, col] of [[16, '#c8302a'], [112, '#f2c14e'], [64, '#c8302a']]) {
        c.beginPath(); c.moveTo(x - 2, -58); c.lineTo(x + 2, -58); c.quadraticCurveTo(x + 3.5, -46, x + 2.5, -36); c.lineTo(x - 1.5, -36); c.quadraticCurveTo(x - 0.5, -46, x - 2, -58); c.closePath();
        fs(c, col, shade(col, -0.4), 0.5);
      }
    },
  });

  // big glazed water jar (水缸) with wooden lid and ladle
  def('pot', {
    up: 6,
    art(c) {
      ground(c, 33, 56, 25, 6, 0.4);
      c.beginPath(); c.moveTo(17, 12); c.bezierCurveTo(6, 20, 6, 38, 14, 50); c.quadraticCurveTo(18, 58, 32, 58); c.quadraticCurveTo(46, 58, 50, 50); c.bezierCurveTo(58, 38, 58, 20, 47, 12); c.closePath();
      fs(c, lg(c, 7, 0, 57, 0, [[0, '#4a2a16'], [0.22, '#9a6038'], [0.4, '#6e3e20'], [0.85, '#3a200e'], [1, '#22120a']]), '#1a0c06', 1.2);
      c.save(); c.clip();
      c.fillStyle = lg(c, 0, 44, 0, 58, [[0, 'rgba(176,110,70,0)'], [0.3, 'rgba(176,110,70,0.9)'], [1, 'rgba(140,80,50,1)']]); c.fillRect(0, 44, 64, 16);
      // glaze drips
      c.fillStyle = rgba('#5a3018', 0.75);
      c.beginPath(); c.moveTo(6, 42);
      for (let k = 0; k < 10; k++) { const dx = 8 + k * 5, dl = 2 + (k * 37 % 5); c.quadraticCurveTo(dx + 1, 42, dx + 1.5, 42 + dl); c.quadraticCurveTo(dx + 2.5, 42 + dl + 1.5, dx + 3.5, 42); }
      c.lineTo(58, 42); c.lineTo(58, 40); c.lineTo(6, 40); c.closePath(); c.fill();
      c.fillStyle = rgba('#ffffff', 0.25); ell(c, 18, 28, 2.4, 9); c.fill();
      c.strokeStyle = rgba('#2a1408', 0.5); c.lineWidth = 0.8; c.beginPath(); c.ellipse(32, 20, 24, 5, 0, 0, PI); c.stroke();
      c.restore();
      // mouth + lid
      ell(c, 32, 11, 16, 5); fs(c, '#2a160a', null);
      ell(c, 32, 9, 17.5, 5.5); fs(c, rg(c, 32, 9, 18, [[0, '#c69a62'], [1, '#7a5430']], 26, 7, 0), '#3a2410', 1);
      line(c, 15, 9, 49, 9, rgba('#3a2410', 0.4), 0.7);
      rr(c, 25, 5, 14, 3.5, 1.5); fs(c, '#6a4424', '#3a2410', 0.7);
      // ladle
      line(c, 36, 8, 54, -2, '#3a2810', 2.6); line(c, 36, 8, 54, -2, C.bamboo, 1.6);
      ell(c, 34, 8.5, 3.6, 2.2); fs(c, C.bambooD, '#3a2810', 0.6);
    },
  });

  // ---------------------------------------------------------------------------------------------
  // CRAFT: lantern-making
  // ---------------------------------------------------------------------------------------------
  function lowTable(c, W, top, d, legBot, base) {
    groundRect(c, 6, legBot - 12, W - 12, 12, 0.3);
    board(c, 10, top + d, 5, legBot - top - d - 6, shade(base, -0.4), 1, { grain: false });
    board(c, W - 15, top + d, 5, legBot - top - d - 6, shade(base, -0.4), 2, { grain: false });
    board(c, 5, top + d + 3, 6, legBot - top - d - 3, base, 3, { vertical: true });
    board(c, W - 11, top + d + 3, 6, legBot - top - d - 3, base, 4, { vertical: true });
    board(c, 3, top + d, W - 6, 5, shade(base, -0.15), 5, { r: 1 });
    board(c, 3, top, W - 6, d, shade(base, 0.1), 6, { r: 2 });
  }
  function bambooBundle(c, x, y, len, n) {
    for (let k = 0; k < n; k++) line(c, x + k * 0.4, y + k * 1.2, x + len - k * 0.6, y + k * 1.2 - 2, k % 2 ? C.bamboo : shade(C.bamboo, -0.12), 1.1);
    line(c, x + len * 0.3, y - 1, x + len * 0.3, y + n * 1.2 + 1, '#a33', 1.4);
    line(c, x + len * 0.7, y - 2, x + len * 0.7, y + n * 1.2, '#a33', 1.4);
  }
  // lantern skeleton being pasted, on a little worktable
  def('lantern_frame', {
    up: 20,
    art(c, W) {
      lowTable(c, W, 26, 18, 60, '#9a6a40');
      // ring stand
      ell(c, 30, 34, 9, 3); fs(c, null, '#5a3a1e', 2);
      // skeleton sphere: back ribs, paper on the lower part, front ribs
      const x = 30, y = 12, rw = 15, rh = 18;
      c.save(); c.beginPath(); c.rect(x - rw - 2, y + 2, rw * 2 + 4, rh + 4); c.clip();
      ell(c, x, y, rw, rh); fs(c, rg(c, x, y + 6, rw * 1.3, [[0, rgba('#fbf3dc', 0.95)], [1, rgba('#d8c8a0', 0.95)]], x - 5, y + 2, 0), null);
      const r = U.seeded(4);
      for (let k = 0; k < 40; k++) line(c, x - rw + r() * rw * 2, y + 2 + r() * rh, x - rw + r() * rw * 2, y + 2 + r() * rh, rgba('#b8a880', 0.25), 0.4);
      c.restore();
      c.beginPath(); c.ellipse(x, y + 2, rw, 2.4, 0, 0, PI); c.strokeStyle = rgba('#c8b890', 0.9); c.lineWidth = 0.8; c.stroke();
      c.strokeStyle = C.bambooD; c.lineWidth = 0.9;
      for (let k = 0; k < 8; k++) { const a = k / 8 * PI; c.beginPath(); c.ellipse(x, y, max(0.4, rw * abs(cos(a))), rh, 0, -PI / 2, PI / 2, cos(a) < 0); c.stroke(); }
      for (const f of [-0.75, -0.4, 0, 0.4, 0.75]) { const yy = y + f * rh, ww = rw * Math.sqrt(1 - f * f); c.beginPath(); c.ellipse(x, yy, ww, 1.6, 0, 0, TAU); c.stroke(); }
      ell(c, x, y, rw, rh); c.strokeStyle = shade(C.bambooD, -0.15); c.lineWidth = 1.1; c.stroke();
      rr(c, x - 5, y - rh - 2, 10, 3, 1); fs(c, '#4a2c1a', null);
      // tools on the table
      bambooBundle(c, 8, 37, 22, 4);
      ell(c, 50, 33, 5, 2.4); fs(c, '#e8e4dc', '#7a766c', 0.6); ell(c, 50, 32.6, 3.6, 1.5); fs(c, '#f8f6ee', null);
      line(c, 49, 33, 56, 26, '#8a6a3a', 1); // brush in paste
      line(c, 42, 40, 52, 39, '#c8ccd0', 1.6); line(c, 52, 39, 56, 39, '#3a2214', 2);
    },
  });

  // heavy lantern-maker's workbench
  def('workbench', {
    w: 2, up: 16,
    art(c) {
      const base = '#94603a';
      groundRect(c, 4, 48, 120, 14, 0.36);
      board(c, 12, 36, 6, 18, shade(base, -0.4), 1, { grain: false }); board(c, 110, 36, 6, 18, shade(base, -0.4), 2, { grain: false });
      board(c, 14, 50, 100, 4, shade(base, -0.3), 3, { r: 1 });
      for (const lx of [5, 115]) board(c, lx, 34, 8, 26, base, lx, { vertical: true });
      board(c, 2, 26, 124, 10, shade(base, -0.15), 4, { r: 1.5 });
      rr(c, 52, 28, 24, 6, 1); fs(c, shade(base, -0.35), shade(base, -0.6), 0.8); brassDot(c, 64, 31, 1.6, '#c8a050');
      board(c, 2, 4, 124, 23, shade(base, 0.12), 5, { r: 2.5, dens: 2 });
      c.save(); rr(c, 2, 4, 124, 23, 2.5); c.clip();
      speckle(c, 2, 4, 124, 23, 30, '#3a2010', 0.25, 22, 1.2); // dents & paint drops
      for (const [px, py, col] of [[40, 20, '#c8302a'], [44, 22, '#c8302a'], [96, 9, '#d7a443']]) { ell(c, px, py, 1.2, 0.8); fs(c, col, null); }
      c.restore();
      // bamboo strips
      bambooBundle(c, 6, 8, 34, 5);
      // paper sheets + brush
      c.save(); c.translate(54, 14); c.rotate(-0.08);
      rr(c, -10, -8, 22, 15, 0.5); fs(c, '#efe4c8', '#9a8a6a', 0.5); rr(c, -8, -7, 22, 15, 0.5); fs(c, '#f6ecd4', '#9a8a6a', 0.5);
      c.restore();
      // paint dishes
      for (const [px, col] of [[76, '#c8302a'], [84, '#d7a443'], [92, '#22201e']]) { ell(c, px, 9, 3.6, 2); fs(c, '#f2efe6', '#8a867c', 0.5); ell(c, px, 8.8, 2.4, 1.2); fs(c, col, null); }
      // brush pot
      rr(c, 101, 0, 8, 12, 1.5); fs(c, cylGrad(c, 101, 109, '#e8e4da', 0.2, -0.3), '#7a766c', 0.6);
      line(c, 103, 1, 101, -9, '#8a6a3a', 1); line(c, 105, 1, 106, -11, '#8a6a3a', 1); line(c, 107, 1, 110, -8, '#8a6a3a', 1);
      line(c, 101, -9, 100.5, -11, '#222', 1.4); line(c, 106, -11, 106.2, -13, '#222', 1.4); line(c, 110, -8, 111, -10, '#c8302a', 1.4);
      // half-painted drum lantern lying on its side
      c.save(); c.translate(76, 20); c.rotate(PI / 2);
      lantern(c, 0, 0, 6, 9, '#d8342a', { shape: 'drum', motif: 1, tassel: false });
      c.restore();
      // chisel + knife
      line(c, 112, 20, 122, 18, '#b8bcc0', 1.4); line(c, 104, 21, 112, 20, '#6a4224', 2.4);
      // shavings
      c.strokeStyle = '#e0b882'; c.lineWidth = 0.8;
      for (const [px, py] of [[30, 22], [34, 24], [118, 10], [96, 22]]) { c.beginPath(); c.arc(px, py, 1.6, 0, PI * 1.6); c.stroke(); }
    },
  });

  // stacks of lantern paper on a low pallet
  def('paper_stack', {
    up: 8,
    art(c) {
      groundRect(c, 6, 48, 52, 12, 0.32);
      board(c, 5, 50, 54, 7, '#7a5634', 1, { r: 1 });
      for (const sx of [10, 30, 50]) board(c, sx - 3, 54, 6, 5, '#5a3a20', sx, { grain: false });
      const stack = (x, y0, w, n, col, twine) => {
        const top = y0 - n * 1.6;
        rr(c, x, top, w, n * 1.6, 0.5); fs(c, lg(c, 0, top, 0, y0, [[0, shade(col, 0.05)], [1, shade(col, -0.2)]]), shade(col, -0.5), 0.7);
        for (let k = 1; k < n; k++) line(c, x + 0.5, top + k * 1.6, x + w - 0.5, top + k * 1.6, rgba(shade(col, -0.4), 0.35), 0.4);
        rr(c, x - 0.5, top - 9, w + 1, 9, 0.8); fs(c, lg(c, x, top - 9, x + w, top, [[0, shade(col, 0.2)], [1, shade(col, -0.05)]]), shade(col, -0.5), 0.7);
        if (twine) { line(c, x + w / 2, top - 9, x + w / 2, y0, '#8a6a3a', 1); line(c, x, top - 4.5, x + w, top - 4.5, '#8a6a3a', 1); }
      };
      stack(31, 50, 25, 18, '#f1e5c6', true);
      stack(8, 50, 24, 10, '#c8302a', true);
      stack(10, 25, 14, 4, '#e8c050', false);
      // rolls
      for (const [x, y, col] of [[33, 13, '#f1e5c6'], [37, 8.5, '#e8739a']]) {
        rr(c, x, y - 3, 20, 6, 3); fs(c, lg(c, 0, y - 3, 0, y + 3, [[0, shade(col, 0.25)], [1, shade(col, -0.25)]]), shade(col, -0.5), 0.6);
        ell(c, x + 20, y, 2, 3); fs(c, shade(col, -0.1), shade(col, -0.5), 0.6); ell(c, x + 20, y, 0.8, 1.2); fs(c, '#6a5a44', null);
      }
    },
  });

  // row of wine / pickle jars along a wall (o.w = number of tiles)
  def('jar_row', {
    w: 2, resize: 'w', up: 8, key: (o) => o.v | 0,
    art(c, W, H, o) {
      const n = Math.round(W / 64), r = U.seeded(300 + (o.v | 0) * 13 + n);
      const jars = [];
      for (let i = 0; i < n; i++) {
        jars.push({ x: i * 64 + 19 + (r() - 0.5) * 4, big: true, s: 15 + r() * 3, kind: r() < 0.6 ? 'wine' : 'brown', yb: 56 - r() * 6 });
        jars.push({ x: i * 64 + 47 + (r() - 0.5) * 4, big: false, s: 10 + r() * 2.5, kind: r() < 0.5 ? 'green' : 'black', yb: 58 - r() * 3 });
      }
      jars.sort((a, b) => a.yb - b.yb);
      for (const j of jars) {
        const { x, s, yb } = j, hgt = s * 2.3;
        ground(c, x + 2, yb, s + 4, 4.5, 0.38);
        const col = { wine: '#5a3420', brown: '#7a4a24', green: '#3e5a3a', black: '#2a2622' }[j.kind];
        c.beginPath(); c.moveTo(x - s * 0.45, yb - hgt);
        c.bezierCurveTo(x - s * 1.25, yb - hgt * 0.75, x - s * 1.1, yb - hgt * 0.15, x - s * 0.6, yb);
        c.lineTo(x + s * 0.6, yb); c.bezierCurveTo(x + s * 1.1, yb - hgt * 0.15, x + s * 1.25, yb - hgt * 0.75, x + s * 0.45, yb - hgt); c.closePath();
        fs(c, lg(c, x - s, 0, x + s, 0, [[0, shade(col, -0.2)], [0.25, shade(col, 0.4)], [0.45, col], [1, shade(col, -0.55)]]), shade(col, -0.65), 1);
        ell(c, x - s * 0.45, yb - hgt * 0.62, s * 0.12, s * 0.3); fs(c, rgba('#ffffff', 0.3), null);
        if (j.kind === 'wine') {
          // red-cloth & clay seal + 酒 label
          ell(c, x, yb - hgt, s * 0.55, s * 0.2); fs(c, '#8a6a4a', null);
          c.beginPath(); c.moveTo(x - s * 0.6, yb - hgt + 1); c.quadraticCurveTo(x, yb - hgt - s * 0.7, x + s * 0.6, yb - hgt + 1); c.quadraticCurveTo(x, yb - hgt + 3, x - s * 0.6, yb - hgt + 1); fs(c, '#b8302a', '#5a100c', 0.7);
          line(c, x - s * 0.55, yb - hgt + 1.8, x + s * 0.55, yb - hgt + 1.8, '#d8b060', 1);
          c.save(); c.translate(x, yb - hgt * 0.5); c.rotate(PI / 4);
          c.fillStyle = '#c8302a'; c.fillRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64); c.restore();
          c.strokeStyle = '#1a0e08'; c.lineWidth = 0.9;
          c.beginPath(); c.moveTo(x - 2.4, yb - hgt * 0.5 - 2.5); c.lineTo(x - 1.6, yb - hgt * 0.5 - 1.6); c.moveTo(x - 2.6, yb - hgt * 0.5); c.lineTo(x - 1.6, yb - hgt * 0.5 + 0.4); c.moveTo(x - 2.6, yb - hgt * 0.5 + 3); c.lineTo(x - 1.4, yb - hgt * 0.5 + 1.6);
          c.rect(x - 0.6, yb - hgt * 0.5 - 2.5, 3.2, 5.4); c.moveTo(x - 0.6, yb - hgt * 0.5); c.lineTo(x + 2.6, yb - hgt * 0.5); c.stroke();
        } else {
          ell(c, x, yb - hgt, s * 0.5, s * 0.18); fs(c, shade(col, -0.5), null);
          ell(c, x, yb - hgt - 1, s * 0.58, s * 0.22); fs(c, j.kind === 'brown' ? '#a88a62' : shade(col, 0.15), shade(col, -0.6), 0.7);
          if (j.kind !== 'brown') { ell(c, x, yb - hgt - 2.4, 1.6, 1.2); fs(c, shade(col, 0.3), null); }
          else { line(c, x - s * 0.5, yb - hgt + 1.5, x + s * 0.5, yb - hgt + 1.5, '#6a5a3a', 1.2); }
        }
      }
    },
  });

  // =============================================================================================
  // TEMPLE PROPS
  // =============================================================================================

  // temple drum hung in a red stand, face toward the viewer
  def('drum', {
    up: 40,
    art(c) {
      ground(c, 32, 57, 27, 5, 0.38);
      // stand
      for (const px of [6, 52]) { rr(c, px, -32, 6, 90, 1); fs(c, lg(c, px, 0, px + 6, 0, [[0, C.lacL], [0.5, C.lac], [1, C.lacD]]), '#3e0a07', 1); }
      board(c, 1, 50, 62, 6, '#5a2a1a', 3, { r: 1.5 });
      lacquer(c, 0, -38, 64, 7, C.lac, 1.5);
      for (const [ex, d] of [[0, -1], [64, 1]]) { c.beginPath(); c.moveTo(ex, -38); c.quadraticCurveTo(ex + d * 4, -40, ex + d * 5, -45); c.quadraticCurveTo(ex + d * 2, -40, ex - d * 4, -31); c.closePath(); fs(c, C.gold, C.goldD, 0.7); }
      goldLine(c, 3, -36.5, 58, 4, 0.5);
      // rings
      for (const px of [14, 50]) { line(c, px, -31, px, -22, '#c8a050', 1.4); }
      // barrel (top of the drum body, extending back)
      const cx = 32, cy = 12, rx = 22, ry = 21;
      c.beginPath(); c.ellipse(cx, cy - 8, rx, ry, 0, PI, 0); c.lineTo(cx + rx, cy); c.ellipse(cx, cy, rx, ry, 0, 0, PI, true); c.closePath();
      fs(c, lg(c, cx - rx, 0, cx + rx, 0, [[0, '#6a1410'], [0.25, '#c8362a'], [0.5, '#a8261c'], [1, '#4a0c08']]), '#2a0604', 1);
      // brass studs on the barrel edge
      for (let k = 0; k <= 18; k++) { const a = PI + k / 18 * PI; brassDot(c, cx + cos(a) * (rx - 1), cy - 2 + sin(a) * (ry - 1), 1.2, C.gold); }
      // drum head
      ell(c, cx, cy, rx, ry); fs(c, rg(c, cx, cy, rx, [[0, '#f4e6c4'], [0.75, '#dcc69a'], [1, '#a88a5a']], cx - 6, cy - 6, 0), '#5a3a1a', 1.2);
      ell(c, cx, cy, rx - 3, ry - 3); fs(c, null, rgba('#8a6a3a', 0.5), 0.8);
      // painted taiji
      ell(c, cx, cy, 6, 6); fs(c, '#f4ecd8', '#2a1a10', 0.7);
      c.beginPath(); c.arc(cx, cy, 6, -PI / 2, PI / 2); c.arc(cx, cy + 3, 3, PI / 2, -PI / 2, true); c.arc(cx, cy - 3, 3, PI / 2, PI * 1.5, false); fs(c, '#2a1a10', null);
      ell(c, cx, cy - 3, 0.9, 0.9); fs(c, '#2a1a10', null); ell(c, cx, cy + 3, 0.9, 0.9); fs(c, '#f4ecd8', null);
      for (let k = 0; k < 20; k++) { const a = k / 20 * TAU; brassDot(c, cx + cos(a) * (rx - 0.6), cy + sin(a) * (ry - 0.6), 1, '#c8962a'); }
      // drumsticks resting
      line(c, 12, 49, 30, 42, '#3a2010', 2.6); line(c, 52, 49, 34, 42, '#3a2010', 2.6);
      ell(c, 30, 42, 2, 2); fs(c, '#c8302a', null); ell(c, 34, 42, 2, 2); fs(c, '#c8302a', null);
    },
  });

  // bronze temple bell in a wooden frame
  def('bell', {
    up: 66,
    art(c) {
      ground(c, 32, 57, 28, 5, 0.38);
      rr(c, 3, 50, 58, 9, 1.5); fs(c, lg(c, 0, 50, 0, 59, [[0, '#a8a398'], [1, '#6e6a62']]), '#3a3834', 1);
      for (const px of [7, 51]) board(c, px, -52, 7, 104, '#6a2a1a', px, { vertical: true });
      c.save(); c.translate(0, 22);
      // beam with upturned ends
      c.beginPath(); c.moveTo(-2, -86); c.quadraticCurveTo(4, -80, 12, -80); c.lineTo(52, -80); c.quadraticCurveTo(60, -80, 66, -86); c.lineTo(64, -76); c.lineTo(0, -76); c.closePath();
      fs(c, lg(c, 0, -86, 0, -76, [[0, '#8a3a24'], [1, '#4a1a10']]), '#2a0c06', 1);
      line(c, 6, -79, 58, -79, rgba('#ffd0b0', 0.3), 0.8);
      // 蒲牢 hook
      rr(c, 28, -76, 8, 8, 2); fs(c, '#4e3a1e', '#2a1c0a', 0.8);
      // bell body
      c.beginPath(); c.moveTo(22, -66); c.quadraticCurveTo(32, -71, 42, -66); c.lineTo(44, -10); c.quadraticCurveTo(46, -2, 50, 0); c.quadraticCurveTo(32, 5, 14, 0); c.quadraticCurveTo(18, -2, 20, -10); c.closePath();
      fs(c, lg(c, 14, 0, 50, 0, [[0, '#2e3a2a'], [0.2, '#8a7a4a'], [0.38, '#5a5a3a'], [0.8, '#2e3a2e'], [1, '#1a2018']]), '#0e140c', 1.2);
      c.save(); c.clip();
      speckle(c, 14, -70, 36, 74, 70, '#6fa898', 0.35, 21, 1.6);
      for (const by of [-58, -34, -10]) { line(c, 14, by, 50, by, rgba('#1a2018', 0.7), 1.4); line(c, 14, by + 1.4, 50, by + 1.4, rgba('#c8b880', 0.35), 0.7); }
      line(c, 32, -58, 32, -34, rgba('#1a2018', 0.6), 1.2);
      for (let row = 0; row < 3; row++) for (let k = 0; k < 3; k++) { brassDot(c, 24 + k * 3.2, -53 + row * 6.5, 1.1, '#8a8a5a'); brassDot(c, 36 + k * 3.2, -53 + row * 6.5, 1.1, '#7a7a4a'); }
      ell(c, 32, -20, 4.5, 4.5); fs(c, null, rgba('#c8b880', 0.5), 1); // striking lotus
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ell(c, 32 + cos(a) * 3, -20 + sin(a) * 3, 1.2, 1.2); fs(c, rgba('#c8b880', 0.4), null); }
      c.restore();
      c.beginPath(); c.ellipse(32, 0, 18, 2.6, 0, 0, PI); c.strokeStyle = rgba('#d8c890', 0.4); c.lineWidth = 0.8; c.stroke();
      // wooden striker hanging on ropes
      line(c, 50, -76, 52, -40, '#8a6a3a', 0.8); line(c, 60, -76, 60, -40, '#8a6a3a', 0.8);
      rr(c, 46, -42, 18, 5, 2.5); fs(c, cylGrad(c, 46, 64, '#a87a4a'), '#4a2a14', 0.8);
      c.restore();
    },
  });

  // weapon rack — spears with red tassels, a 關刀, swords
  def('weapon_rack', {
    w: 2, up: 96,
    art(c) {
      const base = '#6a3a22';
      groundRect(c, 4, 50, 120, 10, 0.36);
      for (const px of [6, 116]) board(c, px, -48, 7, 104, base, px, { vertical: true });
      lacquer(c, 2, -52, 124, 7, '#7a2a1a', 1.5);
      // weapons behind the front bars
      const spear = (x, top, tassel, blade) => {
        line(c, x, 54, x, top + 12, '#2a160c', 3); line(c, x - 0.5, 54, x - 0.5, top + 12, '#6a4428', 1.6);
        if (blade === 'guandao') {
          c.beginPath(); c.moveTo(x - 1, top + 14); c.lineTo(x - 1, top - 4); c.quadraticCurveTo(x + 4, top - 22, x + 1, top - 30); c.quadraticCurveTo(x + 12, top - 16, x + 10, top + 2); c.lineTo(x + 6, top + 2); c.lineTo(x + 7, top + 6); c.lineTo(x + 1, top + 14); c.closePath();
          fs(c, lg(c, x, 0, x + 10, 0, [[0, '#e8ecf0'], [0.5, '#a8b0b8'], [1, '#5a626a']]), '#2a3036', 0.9);
          line(c, x + 1, top - 26, x + 3, top, rgba('#ffffff', 0.6), 0.7);
          ell(c, x + 4, top + 4, 1.4, 1.4); fs(c, '#2a3036', null);
          rr(c, x - 3, top + 12, 6, 4, 1); fs(c, C.gold, C.goldD, 0.6);
        } else {
          c.beginPath(); c.moveTo(x, top - 16); c.quadraticCurveTo(x + 4, top - 6, x + 2, top + 2); c.lineTo(x - 2, top + 2); c.quadraticCurveTo(x - 4, top - 6, x, top - 16); c.closePath();
          fs(c, lg(c, x - 4, 0, x + 4, 0, [[0, '#eef2f4'], [1, '#6a727a']]), '#2a3036', 0.8);
          line(c, x, top - 14, x, top + 1, rgba('#4a525a', 0.6), 0.6);
          rr(c, x - 2.4, top + 2, 4.8, 5, 1); fs(c, C.gold, C.goldD, 0.6);
        }
        if (tassel) {
          c.beginPath(); c.moveTo(x - 2, top + 7); c.quadraticCurveTo(x - 7, top + 14, x - 5, top + 22); c.lineTo(x + 5, top + 22); c.quadraticCurveTo(x + 7, top + 14, x + 2, top + 7); c.closePath();
          fs(c, lg(c, x - 6, 0, x + 6, 0, [[0, '#e8402e'], [1, '#8a1810']]), '#5a0c08', 0.7);
          for (let k = -4; k <= 4; k += 2) line(c, x + k * 0.8, top + 12, x + k, top + 21.5, rgba('#ff8a70', 0.45), 0.6);
        }
      };
      spear(24, -76, true); spear(44, -66, true, 'guandao'); spear(66, -80, true); spear(84, -72, false);
      // swords in scabbards
      for (const [x, ang] of [[98, 0.08], [108, -0.06]]) {
        c.save(); c.translate(x, 52); c.rotate(ang);
        rr(c, -2.4, -56, 4.8, 48, 2); fs(c, lg(c, -2.4, 0, 2.4, 0, [[0, '#4a1a12'], [1, '#1e0806']]), '#0e0402', 0.7);
        rr(c, -2.6, -20, 5.2, 3, 0.5); fs(c, C.gold, null); rr(c, -2.6, -44, 5.2, 3, 0.5); fs(c, C.gold, null);
        rr(c, -5, -59, 10, 3, 1); fs(c, C.gold, C.goldD, 0.6);
        rr(c, -1.6, -72, 3.2, 13, 1); fs(c, '#2a1a10', null);
        for (let k = 0; k < 4; k++) line(c, -1.6, -70 + k * 3, 1.6, -69 + k * 3, '#6a5a3a', 0.6);
        ell(c, 0, -73, 2.4, 1.6); fs(c, C.gold, C.goldD, 0.5);
        line(c, 0, -73, -2, -64, '#c8302a', 1); line(c, 0, -73, 1, -63, '#c8302a', 1);
        c.restore();
      }
      // bars (front)
      lacquer(c, 4, -38, 120, 5, '#7a2a1a', 1);
      lacquer(c, 4, 6, 120, 5, '#7a2a1a', 1);
      for (const x of [24, 44, 66, 84]) { ell(c, x, 8.5, 2.6, 1.4); fs(c, '#2a0c06', null); }
      board(c, 2, 46, 124, 9, base, 9, { r: 1.5 });
      for (const x of [24, 44, 66, 84, 98, 108]) { ell(c, x, 48, 3, 1.2); fs(c, '#1a0a04', null); }
    },
  });

  // 照魂鏡 — ornate bronze mirror on a carved stand, faint spectral glow
  def('mirror_stand', {
    up: 46,
    art(c) {
      ground(c, 32, 57, 24, 5, 0.38);
      // base with cloud feet
      c.beginPath(); c.moveTo(8, 58); c.quadraticCurveTo(6, 50, 12, 48); c.lineTo(52, 48); c.quadraticCurveTo(58, 50, 56, 58); c.closePath();
      fs(c, lg(c, 0, 48, 0, 58, [[0, '#7a3a24'], [1, '#3a160c']]), '#1e0804', 1);
      c.beginPath(); c.arc(16, 54, 3, PI, TAU); c.arc(48, 54, 3, PI, TAU); c.strokeStyle = rgba('#e0a080', 0.4); c.lineWidth = 0.8; c.stroke();
      ell(c, 32, 47, 20, 4.5); fs(c, lg(c, 12, 0, 52, 0, [[0, '#9a5a38'], [1, '#4a2214']]), '#1e0804', 0.9);
      // uprights with finials
      for (const px of [11, 48]) { rr(c, px, -26, 5, 74, 1.5); fs(c, lg(c, px, 0, px + 5, 0, [[0, '#9a5a38'], [1, '#3a160c']]), '#1e0804', 0.9); brassDot(c, px + 2.5, -28, 3, C.gold); }
      // support lotus
      c.beginPath(); c.moveTo(22, 16); c.quadraticCurveTo(32, 26, 42, 16); c.lineTo(38, 12); c.lineTo(26, 12); c.closePath(); fs(c, C.gold, C.goldD, 0.7);
      line(c, 16, 14, 48, 14, '#5a2a18', 3);
      // mirror rim
      const cx = 32, cy = -10;
      ell(c, cx, cy, 22, 22); fs(c, lg(c, cx - 22, cy - 22, cx + 22, cy + 22, [[0, '#e8c47a'], [0.5, '#9a7038'], [1, '#4a3418']]), '#2a1c0a', 1.2);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ell(c, cx + cos(a) * 19.5, cy + sin(a) * 19.5, 2.6, 2.6); fs(c, lg(c, 0, cy - 22, 0, cy + 22, [[0, '#f0d08a'], [1, '#7a5428']]), '#3a2810', 0.6); }
      for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; ell(c, cx + cos(a) * 16.5, cy + sin(a) * 16.5, 0.7, 0.7); fs(c, '#5a4020', null); }
      // crest
      c.beginPath(); c.moveTo(cx - 9, cy - 21); c.quadraticCurveTo(cx - 6, cy - 32, cx, cy - 30); c.quadraticCurveTo(cx + 6, cy - 32, cx + 9, cy - 21); c.closePath(); fs(c, C.gold, C.goldD, 0.8);
      ell(c, cx, cy - 26, 2.4, 2.4); fs(c, '#6fd8e8', '#1a4a5a', 0.6);
      // mirror face
      ell(c, cx, cy, 15, 15); fs(c, rg(c, cx, cy, 15, [[0, '#d8f0f2'], [0.6, '#9cc4cc'], [1, '#4a6a74']], cx - 4, cy - 5, 0), '#2a3a3e', 1);
      c.beginPath(); c.ellipse(cx - 5, cy - 5, 6, 3, -0.8, 0, TAU); fs(c, rgba('#ffffff', 0.35), null);
    },
    live(ctx, x, y, o, t, W, H, ph) {
      const cx = x + 32, cy = y - 10;
      ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, 15, 15, 0, 0, TAU); ctx.clip();
      const s = ((t * 0.25 + ph) % 1.6) - 0.3;
      ctx.fillStyle = lg(ctx, cx - 20 + s * 40, cy - 20, cx - 10 + s * 40, cy + 10, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(230,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
      ctx.fillRect(cx - 16, cy - 16, 32, 32);
      // faint drifting wisp in the glass
      const a = 0.18 + 0.12 * sin(t * 1.3 + ph * 7);
      ctx.fillStyle = rg(ctx, cx + sin(t * 0.7) * 4, cy + cos(t * 0.9) * 3, 9, [[0, rgba('#b0f4ff', a)], [1, 'rgba(176,244,255,0)']]);
      ctx.fillRect(cx - 16, cy - 16, 32, 32);
      ctx.restore();
      glow(ctx, cx, cy, 38, '#8fe4ff', 0.12 + 0.05 * sin(t * 1.7 + ph * 5));
    },
    lights: () => [{ dx: 32, dy: -10, r: 100, color: '#9fe6ff', flicker: 0.12 }],
  });

  // bronze tripod 鼎 cauldron with a bubbling brew
  def('cauldron', {
    up: 20,
    art(c) {
      ground(c, 32, 57, 26, 6, 0.4);
      // back leg
      rr(c, 29, 34, 6, 16, 1); fs(c, '#3a2a14', null);
      // ears
      for (const ex of [13, 51]) { rr(c, ex - 3.5, -4, 7, 18, 1.5); fs(c, lg(c, ex - 3.5, 0, ex + 3.5, 0, [[0, '#c69a52'], [1, '#4a3418']]), '#2a1c0a', 0.9); rr(c, ex - 1.5, -2, 3, 9, 1); fs(c, '#2a1c0a', null); }
      // body
      c.beginPath(); c.moveTo(9, 14); c.bezierCurveTo(8, 34, 18, 42, 32, 42); c.bezierCurveTo(46, 42, 56, 34, 55, 14); c.closePath();
      fs(c, lg(c, 9, 0, 55, 0, [[0, '#6a4a22'], [0.22, '#d0a85a'], [0.4, '#9a7438'], [0.85, '#4a3418'], [1, '#2a1c0a']]), '#24180a', 1.2);
      c.save(); c.clip();
      rr(c, 9, 20, 46, 9, 0); fs(c, rgba('#2a1c0a', 0.25), null);
      c.strokeStyle = rgba('#2a1c0a', 0.6); c.lineWidth = 0.8;
      for (let k = 0; k < 5; k++) { const sx = 15 + k * 8.5; c.beginPath(); c.arc(sx, 24.5, 2.6, PI * 0.1, PI * 1.8); c.stroke(); c.beginPath(); c.arc(sx + 4, 24.5, 1.2, 0, TAU); c.stroke(); }
      line(c, 9, 20, 55, 20, rgba('#f0d08a', 0.4), 0.7);
      speckle(c, 9, 14, 46, 28, 40, C.patina, 0.4, 12, 1.5);
      c.restore();
      // front legs
      for (const lx of [17, 47]) {
        c.beginPath(); c.moveTo(lx - 3.5, 38); c.lineTo(lx + 3.5, 38); c.lineTo(lx + 3, 54); c.quadraticCurveTo(lx + 5, 58, lx, 58); c.quadraticCurveTo(lx - 5, 58, lx - 3, 54); c.closePath();
        fs(c, lg(c, lx - 4, 0, lx + 4, 0, [[0, '#c69a52'], [1, '#3a2812']]), '#1e1408', 0.9);
      }
      // rim + brew
      ell(c, 32, 14, 23, 7.5); fs(c, lg(c, 9, 0, 55, 0, [[0, '#e8c47a'], [1, '#5a4020']]), '#24180a', 1);
      ell(c, 32, 14.5, 19.5, 5.5); fs(c, rg(c, 32, 15, 20, [[0, '#6a8a3a'], [0.7, '#3a5a24'], [1, '#1a2a10']], 28, 13, 0), null);
    },
    live(ctx, x, y, o, t, W, H, ph) {
      for (let k = 0; k < 5; k++) {
        const life = (t * 0.9 + k / 5 + ph) % 1;
        const bx = x + 32 + sin(k * 2.7 + ph * 10) * 12, by = y + 15 + cos(k * 1.9) * 2.5;
        const r = 0.6 + life * 1.8;
        ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU);
        ctx.strokeStyle = rgba('#b8e08a', (1 - life) * 0.8); ctx.lineWidth = 0.7; ctx.stroke();
      }
      smoke(ctx, x + 28, y + 12, t, ph, 50, 6, 0.22, '#e8f0dc');
      smoke(ctx, x + 38, y + 13, t + 2, ph + 0.4, 42, 5, 0.18, '#e8f0dc');
    },
  });

  // drying rack of herb sieves and hanging bundles
  def('herbs_rack', {
    up: 50,
    art(c) {
      groundRect(c, 4, 50, 56, 10, 0.34);
      const base = '#8a6238';
      for (const px of [6, 53]) board(c, px, -44, 5, 102, base, px, { vertical: true });
      board(c, 2, -48, 60, 6, shade(base, 0.1), 1, { r: 1.5 });
      const shelfY = [-16, 14, 44];
      const herbs = [['#5a7a3a', '#86a24e'], ['#b8402a', '#e0703a'], ['#e8c040', '#f4dc80']];
      shelfY.forEach((sy, i) => {
        board(c, 6, sy, 52, 4, shade(base, 0.05), 10 + i, { r: 0.8 });
        // sieve (笸籮)
        ell(c, 32, sy - 3, 23, 6.5); fs(c, '#a8844a', '#5a4020', 0.9);
        ell(c, 32, sy - 3.5, 20, 5); fs(c, lg(c, 0, sy - 8, 0, sy, [[0, '#c8a46a'], [1, '#9a7a44']]), null);
        const r = U.seeded(40 + i);
        const [c1, c2] = herbs[i];
        for (let k = 0; k < 34; k++) { const a = r() * TAU, d = Math.sqrt(r()); ell(c, 32 + cos(a) * d * 17, sy - 3.5 + sin(a) * d * 4, 1.6 + r(), 0.9 + r() * 0.5); fs(c, r() < 0.5 ? c1 : c2, null); }
        c.beginPath(); c.ellipse(32, sy - 3, 23, 6.5, 0, 0.1, PI - 0.1); c.strokeStyle = '#6a4a20'; c.lineWidth = 1.4; c.stroke();
      });
      // hanging bundles
      for (const [x, col] of [[16, '#6a7a3a'], [32, '#8a6a3a'], [48, '#5a6a44']]) {
        line(c, x, -42, x, -36, '#6a5a3a', 0.8);
        c.beginPath(); c.moveTo(x - 2, -36); c.lineTo(x + 2, -36); c.lineTo(x + 6, -22); c.lineTo(x - 6, -22); c.closePath(); fs(c, col, shade(col, -0.45), 0.7);
        for (let k = -2; k <= 2; k++) line(c, x + k * 0.6, -35, x + k * 2.4, -22.5, rgba(shade(col, 0.35), 0.7), 0.6);
        rr(c, x - 2.6, -36, 5.2, 2.4, 0.5); fs(c, '#c0281e', null);
      }
    },
  });

  // =============================================================================================
  // SMALL HOUSEHOLD PROPS
  // =============================================================================================
  def('bucket', {
    up: 20,
    art(c) {
      ground(c, 32, 56, 18, 5, 0.38);
      // rope handle (back half)
      c.beginPath(); c.moveTo(18, 27); c.quadraticCurveTo(32, -8, 46, 27); c.strokeStyle = '#6a5434'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(18, 27); c.quadraticCurveTo(32, -8, 46, 27); c.strokeStyle = '#b89a68'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.moveTo(17, 27); c.lineTo(20, 56); c.quadraticCurveTo(32, 59, 44, 56); c.lineTo(47, 27); c.closePath();
      fs(c, lg(c, 17, 0, 47, 0, [[0, '#7a5430'], [0.25, '#c69a62'], [0.5, '#a8804a'], [1, '#4a3018']]), '#2a1a0c', 1);
      c.save(); c.clip();
      for (let k = 0; k < 8; k++) { const xx = 19 + k * 3.8; line(c, xx, 27, xx + (xx - 32) * 0.08, 58, rgba('#3a2410', 0.4), 0.7); }
      for (const hy of [33, 50]) { rr(c, 14, hy, 36, 3.4, 0); fs(c, lg(c, 14, 0, 50, 0, [[0, '#6a6a3a'], [0.3, '#c8b070'], [1, '#4a4020']]), null); line(c, 14, hy, 50, hy, rgba('#2a2410', 0.5), 0.6); }
      c.restore();
      ell(c, 32, 27, 15, 4.6); fs(c, '#6a4a28', '#2a1a0c', 1);
      ell(c, 32, 27.6, 13, 3.6); fs(c, lg(c, 0, 24, 0, 31, [[0, '#4a7a8a'], [1, '#8ac0c8']]), null);
      c.beginPath(); c.ellipse(29, 26.6, 6, 1.2, 0, 0, TAU); fs(c, rgba('#ffffff', 0.45), null);
    },
  });

  def('broom', {
    up: 44,
    art(c) {
      ground(c, 30, 57, 22, 4.5, 0.32);
      // dustpan (畚箕) on the right
      c.beginPath(); c.moveTo(38, 44); c.lineTo(60, 42); c.lineTo(62, 57); c.quadraticCurveTo(48, 60, 36, 57); c.closePath();
      fs(c, lg(c, 36, 0, 62, 0, [[0, '#c8a868'], [1, '#8a6a3a']]), '#5a4020', 0.9);
      c.save(); c.clip(); for (let k = 0; k < 10; k++) line(c, 36 + k * 3, 42, 37 + k * 3, 60, rgba('#5a4020', 0.35), 0.7); for (let k = 0; k < 6; k++) line(c, 36, 45 + k * 2.6, 62, 44 + k * 2.6, rgba('#5a4020', 0.25), 0.6); c.restore();
      rr(c, 37, 41, 25, 3, 1.5); fs(c, '#7a5a2a', '#4a3010', 0.6);
      // broom leaning on the wall: handle + straw head
      line(c, 37, -40, 24, 34, '#4a3018', 3.6); line(c, 37, -40, 24, 34, C.bamboo, 2.4);
      line(c, 36.4, -38, 26, 22, rgba('#fff0c8', 0.5), 0.6);
      c.beginPath(); c.moveTo(21, 30); c.lineTo(28, 31); c.quadraticCurveTo(34, 46, 36, 58); c.lineTo(10, 58); c.quadraticCurveTo(14, 44, 21, 30); c.closePath();
      fs(c, lg(c, 10, 0, 36, 0, [[0, '#c8a858'], [0.4, '#e2c47a'], [1, '#9a7a3a']]), '#5a4418', 0.9);
      c.save(); c.clip(); const r = U.seeded(3); for (let k = 0; k < 22; k++) { const sx = 22 + r() * 6; line(c, sx, 32, 10 + r() * 26, 58, rgba(r() < 0.5 ? '#7a5a24' : '#f4dc90', 0.6), 0.6); } c.restore();
      for (const by of [33, 38]) line(c, 20.5, by, 29, by + 0.6, '#a8301e', 1.6);
    },
  });

  // potted plant — o.v 0: 萬年青, 1: orchid, 2: lucky bamboo
  def('plant_pot', {
    up: 48, key: (o) => (o.v | 0) % 3,
    art(c, W, H, o) {
      const v = (o.v | 0) % 3;
      ground(c, 32, 57, 16, 4.5, 0.38);
      const leaf = (x0, y0, x1, y1, wd, col) => {
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1;
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx + nx / L * wd, my + ny / L * wd, x1, y1); c.quadraticCurveTo(mx - nx / L * wd, my - ny / L * wd, x0, y0); c.closePath();
        fs(c, lg(c, x0, y0, x1, y1, [[0, shade(col, -0.25)], [0.6, col], [1, shade(col, 0.25)]]), shade(col, -0.5), 0.6);
        line(c, x0, y0, x1, y1, rgba(shade(col, 0.4), 0.6), 0.5);
      };
      if (v === 0) {
        const r = U.seeded(5);
        for (let k = 0; k < 11; k++) { const a = -PI / 2 + (k / 10 - 0.5) * 2.4 + (r() - 0.5) * 0.2, L = 26 + r() * 14; leaf(32, 34, 32 + cos(a) * L * 0.9, 34 + sin(a) * L, 3.4 + r() * 1.4, k % 3 ? '#3e8a4a' : '#5aa65a'); }
      } else if (v === 1) {
        const r = U.seeded(6);
        for (let k = 0; k < 6; k++) { const d = k % 2 ? 1 : -1, L = 14 + r() * 8; c.beginPath(); c.moveTo(32, 33); c.quadraticCurveTo(32 + d * L * 0.6, 22 - r() * 6, 32 + d * L, 34 + r() * 4); c.strokeStyle = '#2e6a3a'; c.lineWidth = 3; c.stroke(); c.strokeStyle = '#4a9a54'; c.lineWidth = 1.6; c.stroke(); }
        for (const [d, tx] of [[-1, 14], [1, 50]]) {
          c.beginPath(); c.moveTo(32, 30); c.quadraticCurveTo(32 + d * 4, -18, tx, -8); c.strokeStyle = '#4a6a3a'; c.lineWidth = 1; c.stroke();
          for (let k = 0; k < 4; k++) {
            const tt = 0.45 + k * 0.17, fx = (1 - tt) * (1 - tt) * 32 + 2 * (1 - tt) * tt * (32 + d * 4) + tt * tt * tx, fy = (1 - tt) * (1 - tt) * 30 + 2 * (1 - tt) * tt * -18 + tt * tt * -8;
            for (let p = 0; p < 5; p++) { const a = p / 5 * TAU - PI / 2; ell(c, fx + cos(a) * 2.4, fy + 3 + sin(a) * 2.2, 2.2, 1.8); fs(c, p === 2 ? '#e890b8' : '#fbf2f6', '#b07898', 0.4); }
            ell(c, fx, fy + 3, 1, 1); fs(c, '#d8508a', null);
          }
        }
      } else {
        const stalks = [[26, -20], [32, -40], [38, -28], [30, -8], [35, -12]];
        for (const [sx, top] of stalks) {
          rr(c, sx - 1.6, top, 3.2, 36 - top, 1.4); fs(c, cylGrad(c, sx - 1.6, sx + 1.6, '#6aaa4a'), '#2a5a24', 0.6);
          for (let y = top + 8; y < 32; y += 9) line(c, sx - 1.6, y, sx + 1.6, y, '#3a6a2a', 0.8);
          leaf(sx, top + 2, sx - 8, top - 6, 2.2, '#4a9a44'); leaf(sx, top + 2, sx + 7, top - 8, 2.2, '#5aaa4e'); leaf(sx, top + 1, sx + 1, top - 10, 1.8, '#5aaa4e');
        }
        c.beginPath(); c.ellipse(32, 20, 8, 2.2, 0, 0, TAU); c.strokeStyle = '#c8281e'; c.lineWidth = 1.6; c.stroke();
        line(c, 32, 22, 30, 28, '#c8281e', 1); line(c, 33, 22, 35, 27, '#c8281e', 1);
      }
      // blue-and-white porcelain pot
      c.beginPath(); c.moveTo(18, 34); c.lineTo(46, 34); c.bezierCurveTo(48, 44, 44, 56, 38, 58); c.lineTo(26, 58); c.bezierCurveTo(20, 56, 16, 44, 18, 34); c.closePath();
      fs(c, lg(c, 17, 0, 47, 0, [[0, '#c8ccd4'], [0.3, '#ffffff'], [0.6, '#eef0f4'], [1, '#9aa0ac']]), '#4a5468', 0.9);
      c.save(); c.clip();
      c.strokeStyle = rgba('#2a4a9a', 0.85); c.lineWidth = 1;
      line(c, 16, 38, 48, 38, '#2a4a9a', 1); line(c, 16, 53, 48, 53, '#2a4a9a', 1);
      for (let k = 0; k < 4; k++) { const sx = 20 + k * 7.5; c.beginPath(); c.arc(sx, 45.5, 2.6, PI * 0.2, PI * 1.7); c.stroke(); c.beginPath(); c.moveTo(sx + 2, 45); c.quadraticCurveTo(sx + 4, 42, sx + 6, 46); c.stroke(); }
      c.restore();
      ell(c, 32, 34, 14.5, 4); fs(c, '#e8ecf2', '#4a5468', 0.9);
      ell(c, 32, 34.5, 12, 2.8); fs(c, '#3a2a1c', null);
    },
  });

  // 筊杯 on a small red temple table
  def('divination_blocks', {
    up: 6,
    art(c) {
      redTable(c, 4, 12, 56, 22, 60);
      // red cloth mat
      rr(c, 12, 16, 40, 14, 2); fs(c, '#d8b04a', '#8a6a20', 0.6);
      rr(c, 14, 17.5, 36, 11, 1.5); fs(c, '#a82a1e', null);
      // two crescent blocks: one flat side up, one round side up (聖筊)
      const block = (x, y, rot, flat) => {
        c.save(); c.translate(x, y); c.rotate(rot);
        c.beginPath(); c.moveTo(-8, 0); c.quadraticCurveTo(0, flat ? -2 : -7, 8, 0); c.quadraticCurveTo(0, 4.5, -8, 0); c.closePath();
        fs(c, flat ? lg(c, 0, -3, 0, 4, [[0, '#e8b080'], [1, '#c8603a']]) : lg(c, 0, -7, 0, 4, [[0, '#ff6a4a'], [0.5, '#c8281e'], [1, '#7a1008']]), '#4a0806', 0.8);
        if (!flat) { c.beginPath(); c.ellipse(-1, -2.4, 4, 1, -0.1, 0, TAU); fs(c, rgba('#ffffff', 0.4), null); }
        c.restore();
      };
      block(24, 24, -0.25, true); block(40, 23, 0.3, false);
      // joss paper & a small offering dish
      rr(c, 46, 13, 9, 7, 0.5); fs(c, '#e8c050', '#8a6a20', 0.5); rr(c, 48.5, 14.5, 4, 3.5, 0.3); fs(c, '#c89a2a', null);
      ell(c, 12, 16, 4, 1.8); fs(c, '#f4f0e8', '#8a8478', 0.5);
    },
  });

  // 籤筒 fortune-stick tube on a red temple table
  def('fortune_sticks', {
    up: 34,
    art(c) {
      redTable(c, 4, 12, 56, 22, 60);
      // fallen sticks
      line(c, 12, 28, 26, 25, '#d8b878', 1.6); line(c, 12, 28, 14, 27.6, '#c0281e', 1.8);
      line(c, 40, 29, 54, 30, '#d8b878', 1.6); line(c, 52, 29.8, 54, 30, '#c0281e', 1.8);
      // tube
      const cx = 32;
      ell(c, cx, 26, 9, 3); fs(c, 'rgba(0,0,0,0.3)', null);
      const r = U.seeded(14);
      const sticks = [];
      for (let k = 0; k < 18; k++) sticks.push([cx + (r() - 0.5) * 12, -18 - r() * 10, (r() - 0.5) * 0.35]);
      sticks.sort((a, b) => a[1] - b[1]);
      for (const [sx, top, a] of sticks) {
        c.save(); c.translate(sx, 0); c.rotate(a);
        rr(c, -1, top, 2, 14 - top, 0.5); fs(c, lg(c, -1, 0, 1, 0, [[0, '#f0d8a0'], [1, '#b89858']]), '#6a5228', 0.4);
        rr(c, -1, top, 2, 4, 0.5); fs(c, '#c0281e', null);
        c.restore();
      }
      rr(c, cx - 8.5, -2, 17, 28, 2); fs(c, cylGrad(c, cx - 8.5, cx + 8.5, '#b02a1e', 0.3, -0.35), '#3e0a07', 1);
      c.save(); rr(c, cx - 8.5, -2, 17, 28, 2); c.clip();
      for (const by of [2, 21]) { c.fillStyle = cylGrad(c, cx - 8.5, cx + 8.5, C.gold, 0.4, -0.3); c.fillRect(cx - 9, by, 18, 2.4); }
      ell(c, cx, 11.5, 4.2, 4.2); fs(c, '#f4d27a', '#8a6420', 0.6);
      line(c, cx - 2, 10, cx + 2, 10, '#a8261c', 0.9); line(c, cx, 9, cx, 14, '#a8261c', 0.9); line(c, cx - 2, 12.5, cx + 2, 12.5, '#a8261c', 0.9);
      c.restore();
      ell(c, cx, -2, 8.5, 2.6); fs(c, '#5a120c', '#3e0a07', 0.8);
    },
  });

  // 擂茶 — ridged earthenware bowl with a guava-wood pestle
  def('mill_stone', {
    up: 36,
    art(c) {
      ground(c, 32, 56, 26, 6, 0.38);
      // straw ring the bowl sits on
      ell(c, 32, 52, 18, 5); fs(c, '#a8844a', '#5a4020', 0.8);
      // bowl outside
      c.beginPath(); c.moveTo(7, 24); c.bezierCurveTo(8, 42, 20, 53, 32, 53); c.bezierCurveTo(44, 53, 56, 42, 57, 24); c.closePath();
      fs(c, lg(c, 7, 0, 57, 0, [[0, '#7a3a1c'], [0.22, '#c86a3a'], [0.45, '#a4532a'], [1, '#4a1e0c']]), '#2a1006', 1.1);
      c.save(); c.clip(); c.fillStyle = lg(c, 0, 24, 0, 33, [[0, '#4a2a18'], [1, 'rgba(74,42,24,0)']]); c.fillRect(6, 24, 52, 10); c.restore();
      // interior with radial combed ridges
      ell(c, 32, 24, 25, 9.5); fs(c, '#5a2a14', '#2a1006', 1);
      ell(c, 32, 25, 22.5, 8); fs(c, rg(c, 32, 27, 23, [[0, '#8a4a28'], [1, '#b4673a']]), null);
      c.save(); ell(c, 32, 25, 22.5, 8); c.clip();
      for (let k = 0; k < 40; k++) { const a = k / 40 * TAU; line(c, 32 + cos(a) * 6, 27 + sin(a) * 2, 32 + cos(a) * 24, 25 + sin(a) * 9, rgba('#4a1e0c', 0.45), 0.5); }
      c.restore();
      // green tea-sesame paste
      ell(c, 32, 28, 10, 3.6); fs(c, rg(c, 32, 28, 10, [[0, '#a8b86a'], [1, '#6a7a3a']]), null);
      speckle(c, 23, 25, 18, 6, 18, '#f0e8d0', 0.8, 2, 0.5);
      // pestle
      c.beginPath(); c.moveTo(33, 28); c.lineTo(36, 27); c.lineTo(17, -34); c.lineTo(13, -33); c.closePath();
      fs(c, lg(c, 13, 0, 36, 0, [[0, '#c8a070'], [0.4, '#9a7040'], [1, '#5a3a1e']]), '#3a2410', 0.8);
      for (const [kx, ky] of [[22, -6], [18, -20], [27, 12]]) { ell(c, kx, ky, 1.2, 1.8); fs(c, null, '#4a2c14', 0.6); }
      ell(c, 15, -33.5, 2, 1); fs(c, '#d8b080', '#3a2410', 0.5);
    },
  });

  // small upright loom with a half-woven geometric cloth
  def('loom_small', {
    up: 44,
    art(c) {
      groundRect(c, 6, 50, 52, 10, 0.32);
      const base = '#8a5a34';
      board(c, 4, 50, 56, 7, shade(base, -0.1), 1, { r: 1.5 });
      for (const px of [7, 51]) board(c, px, -40, 6, 92, base, px, { vertical: true });
      // top warp beam
      rr(c, 4, -38, 56, 7, 3.5); fs(c, lg(c, 0, -38, 0, -31, [[0, '#c69a62'], [1, '#6a4424']]), '#3a2410', 0.9);
      // warp threads
      for (let x = 15; x <= 49; x += 1.8) line(c, x, -31, x, 10, rgba('#f0e8d8', 0.75), 0.5);
      // heddle + shed sticks
      rr(c, 12, -20, 40, 3, 1.5); fs(c, '#a87a44', '#4a2c14', 0.7);
      rr(c, 12, -8, 40, 3.5, 1.7); fs(c, '#c8a060', '#4a2c14', 0.7);
      for (let x = 15; x <= 49; x += 3.6) line(c, x, -20, x, -17, '#f0e8d8', 0.6);
      // woven cloth
      rr(c, 14, 4, 36, 36, 0); fs(c, '#efe6d2', null);
      c.save(); c.beginPath(); c.rect(14, 4, 36, 36); c.clip();
      for (const [y0, col] of [[6, '#2a2420'], [9, '#b82a20'], [33, '#b82a20'], [36, '#2a2420']]) { c.fillStyle = col; c.fillRect(14, y0, 36, 2); }
      for (let k = 0; k < 4; k++) {
        const dx = 18.5 + k * 9, dy = 21.5;
        c.beginPath(); c.moveTo(dx, dy - 8); c.lineTo(dx + 4.5, dy); c.lineTo(dx, dy + 8); c.lineTo(dx - 4.5, dy); c.closePath(); fs(c, '#b82a20', null);
        c.beginPath(); c.moveTo(dx, dy - 4); c.lineTo(dx + 2.2, dy); c.lineTo(dx, dy + 4); c.lineTo(dx - 2.2, dy); c.closePath(); fs(c, '#2a2420', null);
      }
      for (let y = 4; y < 40; y += 1.2) line(c, 14, y, 50, y, rgba('#000000', 0.06), 0.4);
      c.restore();
      line(c, 14, 4, 50, 4, rgba('#ffffff', 0.4), 0.8);
      // cloth beam
      rr(c, 6, 40, 52, 7, 3.5); fs(c, lg(c, 0, 40, 0, 47, [[0, '#e8dcc4'], [1, '#a89a7a']]), '#5a4a30', 0.9);
      line(c, 6, 42.5, 58, 42.5, rgba('#b82a20', 0.7), 1);
      // shuttle with red yarn
      rr(c, 20, -3, 26, 4, 2); fs(c, '#6a4424', '#2a160a', 0.6);
      ell(c, 33, -1, 5, 2); fs(c, '#c8302a', '#6a100c', 0.5);
    },
  });

  // fishing net hung between two poles, with glass and cork floats
  def('fishing_net', {
    w: 2, up: 58,
    art(c) {
      groundRect(c, 4, 50, 120, 10, 0.3);
      for (const px of [7, 121]) { rr(c, px - 3.5, -54, 7, 112, 2); fs(c, cylGrad(c, px - 3.5, px + 3.5, '#7a6448', 0.2, -0.3), '#3a2a18', 0.9); }
      // net shape
      const net = () => {
        c.beginPath(); c.moveTo(9, -46); c.quadraticCurveTo(64, -38, 119, -46);
        c.lineTo(118, 30); c.quadraticCurveTo(100, 50, 84, 36); c.quadraticCurveTo(64, 22, 44, 38); c.quadraticCurveTo(24, 52, 10, 30); c.closePath();
      };
      net(); fs(c, rgba('#5a4a34', 0.18), null);
      c.save(); net(); c.clip();
      c.strokeStyle = rgba('#7a6a4e', 0.85); c.lineWidth = 0.6;
      for (let k = -140; k < 140; k += 5.5) { c.beginPath(); c.moveTo(k, -50); c.lineTo(k + 110, 60); c.stroke(); c.beginPath(); c.moveTo(k + 128, -50); c.lineTo(k + 18, 60); c.stroke(); }
      // folds
      c.fillStyle = lg(c, 0, 0, 128, 0, [[0, 'rgba(0,0,0,0.25)'], [0.15, 'rgba(0,0,0,0)'], [0.3, 'rgba(0,0,0,0.2)'], [0.45, 'rgba(255,240,210,0.08)'], [0.6, 'rgba(0,0,0,0.2)'], [0.75, 'rgba(0,0,0,0)'], [0.9, 'rgba(0,0,0,0.22)'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(0, -50, 128, 110);
      c.restore();
      // bottom lead line with sinkers
      c.beginPath(); c.moveTo(10, 30); c.quadraticCurveTo(24, 52, 44, 38); c.quadraticCurveTo(64, 22, 84, 36); c.quadraticCurveTo(100, 50, 118, 30); c.strokeStyle = '#4a3a28'; c.lineWidth = 1; c.stroke();
      for (const [x, y] of [[22, 42], [44, 38], [64, 30], [86, 37], [106, 42]]) { rr(c, x - 2, y - 1, 4, 3, 1); fs(c, '#4a4a50', '#1a1a1e', 0.5); }
      // top rope + floats
      c.beginPath(); c.moveTo(4, -48); c.quadraticCurveTo(64, -38, 124, -48); c.strokeStyle = '#8a7450'; c.lineWidth = 1.6; c.stroke();
      [[22, 'g'], [38, 'c'], [54, 'g'], [72, 'c'], [90, 'g'], [106, 'c']].forEach(([x, k]) => {
        const y = -46 + 8 * (1 - ((x - 64) / 60) ** 2) * 0.62;
        if (k === 'g') {
          ell(c, x, y + 3, 5, 5); fs(c, rg(c, x, y + 3, 5, [[0, '#bff0e0'], [0.6, '#4aa894'], [1, '#1e5a50']], x - 1.6, y + 1.4, 0), '#1e4a40', 0.7);
          ell(c, x - 1.6, y + 1.4, 1.2, 0.9); fs(c, rgba('#ffffff', 0.8), null);
          c.beginPath(); c.ellipse(x, y + 3, 5, 2, 0, 0, TAU); c.strokeStyle = rgba('#6a5a3a', 0.8); c.lineWidth = 0.6; c.stroke();
        } else { rr(c, x - 4, y, 8, 5, 2); fs(c, lg(c, 0, y, 0, y + 5, [[0, '#d8b880'], [1, '#9a7a48']]), '#5a4020', 0.6); }
      });
      // pile of net on the floor
      c.beginPath(); c.moveTo(30, 58); c.quadraticCurveTo(34, 46, 46, 47); c.quadraticCurveTo(58, 44, 66, 50); c.quadraticCurveTo(76, 48, 80, 58); c.closePath();
      fs(c, lg(c, 0, 44, 0, 58, [[0, '#8a7a5a'], [1, '#4a3e2a']]), '#3a2e1c', 0.8);
      c.save(); c.clip(); for (let k = 0; k < 20; k++) { c.beginPath(); c.arc(32 + k * 2.6, 52 + (k % 3), 2.6, PI, TAU); c.strokeStyle = rgba('#2a2014', 0.5); c.lineWidth = 0.5; c.stroke(); } c.restore();
    },
  });

  // =============================================================================================
  // LIGHTHOUSE LAMP — big Fresnel lens with a rotating beam (2x2)
  // =============================================================================================
  const lensPath = (c) => {
    c.beginPath();
    c.moveTo(40, -40); c.bezierCurveTo(24, -30, 22, 50, 38, 66); c.lineTo(90, 66); c.bezierCurveTo(106, 50, 104, -30, 88, -40); c.closePath();
  };
  def('lighthouse_lamp', {
    w: 2, h: 2, up: 76,
    art(c) {
      ground(c, 64, 118, 54, 10, 0.42);
      // platform + pedestal
      c.beginPath(); c.moveTo(18, 104); c.lineTo(18, 114); c.ellipse(64, 114, 46, 10, 0, PI, 0, true); c.lineTo(110, 104); c.closePath();
      fs(c, cylGrad(c, 18, 110, '#4a4e54', 0.25, -0.3), '#1a1c20', 1);
      ell(c, 64, 104, 46, 10); fs(c, lg(c, 18, 0, 110, 0, [[0, '#8a8e94'], [1, '#4a4e54']]), '#1a1c20', 1);
      rr(c, 50, 64, 28, 42, 2); fs(c, cylGrad(c, 50, 78, '#b08a3a', 0.4, -0.3), '#3a2a0c', 1);
      for (const ry of [72, 92]) { rr(c, 47, ry, 34, 4, 2); fs(c, cylGrad(c, 47, 81, '#d0a84a', 0.4, -0.3), '#3a2a0c', 0.7); }
      // lens interior: warm core
      lensPath(c); fs(c, rg(c, 64, 14, 52, [[0, '#fff8e0'], [0.3, '#f8d890'], [0.7, '#8a7a5a'], [1, '#3a3a3a']]), null);
      // prism rings (horizontal bands) above and below the belt
      c.save(); lensPath(c); c.clip();
      for (let y = -38; y < 66; y += 5.5) {
        if (y > 0 && y < 28) continue;
        c.beginPath(); c.ellipse(64, y, 44, 4, 0, 0, PI); c.strokeStyle = rgba('#ffffff', 0.55); c.lineWidth = 1.3; c.stroke();
        c.beginPath(); c.ellipse(64, y + 2.2, 44, 4, 0, 0, PI); c.strokeStyle = rgba('#4a6a7a', 0.45); c.lineWidth = 1; c.stroke();
      }
      // belt: bulls-eye panel
      ell(c, 64, 14, 15, 14); fs(c, rg(c, 64, 14, 15, [[0, '#ffffff'], [1, '#ffe8b0']]), null);
      for (let k = 1; k <= 5; k++) { ell(c, 64, 14, k * 3, k * 2.8); fs(c, null, rgba(k % 2 ? '#c8a050' : '#ffffff', 0.6), 0.8); }
      c.fillStyle = lg(c, 22, 0, 106, 0, [[0, 'rgba(60,80,90,0.45)'], [0.3, 'rgba(255,255,255,0.12)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(40,50,60,0.5)']]); c.fillRect(20, -42, 90, 110);
      c.restore();
      lensPath(c); c.strokeStyle = '#3a2a0c'; c.lineWidth = 1.4; c.stroke();
      // top cap with vent ball
      c.beginPath(); c.moveTo(36, -38); c.quadraticCurveTo(64, -66, 92, -38); c.closePath();
      fs(c, lg(c, 36, 0, 92, 0, [[0, '#7a5a1e'], [0.3, '#e8c060'], [1, '#4a3410']]), '#2a1c06', 1.1);
      rr(c, 59, -66, 10, 10, 2); fs(c, cylGrad(c, 59, 69, '#c8a040'), '#2a1c06', 0.8);
      ell(c, 64, -70, 7, 6); fs(c, rg(c, 64, -70, 7, [[0, '#f8e090'], [1, '#6a4a14']], 62, -72, 0), '#2a1c06', 0.8);
      rr(c, 34, -42, 60, 5, 2); fs(c, cylGrad(c, 34, 94, '#c8a040'), '#2a1c06', 0.8);
      rr(c, 34, 64, 60, 5, 2); fs(c, cylGrad(c, 34, 94, '#c8a040'), '#2a1c06', 0.8);
    },
    front(c) {
      // brass struts and belt rings
      for (const [x0, x1] of [[40, 30], [64, 64], [88, 98]]) {
        c.beginPath(); c.moveTo(x0, -38); c.quadraticCurveTo(x1 + (x1 - 64) * 0.2, 14, x0 + (x0 < 64 ? -2 : x0 > 64 ? 2 : 0), 64);
        c.strokeStyle = '#3a2a0c'; c.lineWidth = 3; c.stroke(); c.strokeStyle = '#d8b050'; c.lineWidth = 1.6; c.stroke();
      }
      for (const by of [0, 28]) { c.beginPath(); c.ellipse(64, by, 41, 4.4, 0, 0, PI); c.strokeStyle = '#3a2a0c'; c.lineWidth = 3; c.stroke(); c.strokeStyle = '#d8b050'; c.lineWidth = 1.6; c.stroke(); }
    },
    live(ctx, x, y, o, t, W, H, ph) {
      const cx = x + 64, cy = y + 14;
      const a = t * 0.9 + ph * TAU;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const off of [0, PI]) {
        const ang = a + off, dx = cos(ang), dy = sin(ang) * 0.45;
        const L = 320, spread = 0.2;
        const ex1 = cos(ang - spread), ey1 = sin(ang - spread) * 0.45, ex2 = cos(ang + spread), ey2 = sin(ang + spread) * 0.45;
        const facing = 0.55 + 0.45 * Math.max(0, sin(ang)); // brighter when sweeping toward the viewer
        ctx.beginPath(); ctx.moveTo(cx + dy * 8, cy - dx * 4); ctx.lineTo(cx + ex1 * L, cy + ey1 * L); ctx.lineTo(cx + ex2 * L, cy + ey2 * L); ctx.lineTo(cx - dy * 8, cy + dx * 4); ctx.closePath();
        ctx.fillStyle = lg(ctx, cx, cy, cx + dx * L, cy + dy * L, [[0, `rgba(255,244,200,${0.4 * facing})`], [0.4, `rgba(255,236,180,${0.12 * facing})`], [1, 'rgba(255,236,180,0)']]);
        ctx.fill();
      }
      ctx.restore();
      ctx.save(); lensPathAt(ctx, x, y); ctx.clip();
      glow(ctx, cx, cy, 50, '#fff0c0', 0.5 + 0.06 * sin(t * 5 + ph * 9));
      ctx.restore();
      glow(ctx, cx, cy, 90, '#ffe8b0', 0.16);
    },
    lights: () => [{ dx: 64, dy: 14, r: 300, color: '#fff1c8', flicker: 0.05 }],
  });
  function lensPathAt(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x + 40, y - 40); ctx.bezierCurveTo(x + 24, y - 30, x + 22, y + 50, x + 38, y + 66); ctx.lineTo(x + 90, y + 66); ctx.bezierCurveTo(x + 106, y + 50, x + 104, y - 30, x + 88, y - 40); ctx.closePath();
  }

})();

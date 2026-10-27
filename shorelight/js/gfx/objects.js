// 彼岸燈 Shorelight — buildings & street props (js/gfx/objects.js). Registers into G.Objects.
// See docs/CONTRACTS.md "Objects". Everything is procedural Canvas 2D; static art is pre-rendered once
// per type + size + variant + params into offscreen canvases (G.U.makeCanvas) and blitted; only the
// genuinely animated bits (flames, swaying lanterns, bobbing boats, waving banners) are drawn live.
//
// Conventions
//   * (px,py) = logical px of the footprint's top-left cell. Art may extend above / around the footprint
//     (roofs, towers, lantern cords). The engine y-sorts by footprint bottom.
//   * Buildings: bottom footprint row = front wall, rows above = roof. `o.door` = column offset of the
//     door in the bottom row (non-solid, drawn as an open doorway with a cloth curtain). door:false / -1
//     removes the door. `o.w` / `o.h` override the size of resizable things (see report list below).
//   * `o.v` picks a variant; when omitted, a deterministic variant is chosen from hash(x, y).
//   * `o.lit === false` → dark windows / unlit lanterns-free interior (abandoned houses).
//   * `o.text` → sign / plaque text where supported. `o.color` → lantern / banner colour.
//   * lights(o) → [{dx, dy, r, color, flicker}] px offsets from the footprint top-left.
'use strict';
(() => {
  const U = G.U;
  const T = G.TILE || 64;
  const TAU = Math.PI * 2, PI = Math.PI;
  const { sin, cos, abs, min, max, floor, round, pow, sqrt } = Math;
  const rgba = U.rgba, shade = U.shade, mix = U.mix, lerp = U.lerp, clamp = U.clamp;
  const FONT = (s, b) => (G.font ? G.font(s, b) : `${b ? 'bold ' : ''}${s}px serif`);

  // =================================================================================================
  // cache / definition helpers
  // =================================================================================================
  const CACHE = new Map();
  function art(key, w, h, paint) {
    const k = key + '@' + G.S;
    let c = CACHE.get(k);
    if (!c) {
      c = U.makeCanvas(w, h);
      const g = c.getContext('2d');
      g.lineJoin = 'round'; g.lineCap = 'round';
      paint(g);
      CACHE.set(k, c);
    }
    return c;
  }
  const blit = (ctx, c, x, y) => ctx.drawImage(c, x, y, c.lw, c.lh);
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function variant(o, n, salt) {
    if (o.v != null) return (((o.v | 0) % n) + n) % n;
    return floor(U.hash(o.x | 0, o.y | 0, salt || 11) * n) % n;
  }
  function doorCol(o, d, w) {
    let c = o.door;
    if (c === undefined || c === null) c = d;
    if (c === false || c === -1 || c == null || c < 0) return -1;
    return clamp(c | 0, 0, w - 1);
  }
  const seedOf = (o) => U.hash(o.x | 0, o.y | 0, 5) * 1000;

  // defObj(type, S)
  //   S = { w, h, fixed?, resize? ('w'|'h'|'wh'), door?:col|fn(w), nv?, solid?, solidAt?(L,dx,dy,o), over?,
  //         pad: [l,t,r,b] | fn(L), layout?(L,o), key?(o), paint?(g,L,o,rng), live?(ctx,px,py,L,o,t),
  //         lights?(L,o) }
  function defObj(type, S) {
    const lay = (o) => {
      let w = S.w, h = S.h;
      if (!S.fixed) {
        const rs = S.resize || 'wh';
        if (rs.includes('w') && o.w) w = max(1, o.w | 0);
        if (rs.includes('h') && o.h) h = max(1, o.h | 0);
      }
      const L = { w, h, W: w * T, H: h * T, v: S.nv ? variant(o, S.nv, S.salt) : 0, lit: o.lit !== false, text: o.text };
      L.door = S.door == null ? -1 : doorCol(o, typeof S.door === 'function' ? S.door(w) : S.door, w);
      if (S.layout) S.layout(L, o);
      return L;
    };
    const keyOf = (L, o) => [L.w, L.h, L.v, L.door, L.lit ? 1 : 0, L.text || '', S.key ? S.key(o, L) : ''].join('|');
    const d = {
      w: S.w, h: S.h, solid: S.solid !== false, anim: !!S.anim, over: !!S.over,
      draw(ctx, px, py, o, t) {
        const L = lay(o);
        if (S.paint) {
          const p = typeof S.pad === 'function' ? S.pad(L) : (S.pad || [8, 8, 8, 8]);
          const k = keyOf(L, o);
          const c = art(type + '|' + k, L.W + p[0] + p[2], L.H + p[1] + p[3], (g) => {
            g.translate(p[0], p[1]);
            S.paint(g, L, o, U.seeded(hashStr(type + k) || 1));
          });
          blit(ctx, c, px - p[0], py - p[1]);
        }
        if (S.live) S.live(ctx, px, py, L, o, t);
      },
      lights(o) { return S.lights ? S.lights(lay(o), o) : []; },
      layout: lay,
    };
    if (S.solidAt) d.solidAt = (o, dx, dy) => S.solidAt(lay(o), dx, dy, o);
    else if (S.door != null) d.solidAt = (o, dx, dy) => { const L = lay(o); return !(L.door >= 0 && dy === L.h - 1 && dx === L.door); };
    G.Objects.define(type, d);
  }
  const LT = (dx, dy, r, color, flicker) => ({ dx, dy, r, color, flicker: flicker || 0 });
  const LANTERN_LIGHT = '#ff7a3c', WINDOW_LIGHT = '#ffb862', FIRE_LIGHT = '#ff9a40';

  // =================================================================================================
  // primitive helpers
  // =================================================================================================
  function LG(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    return gr;
  }
  function RG(g, x, y, r, stops, r0 = 0, x0 = x, y0 = y) {
    const gr = g.createRadialGradient(x0, y0, r0, x, y, max(0.01, r));
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    return gr;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
  }
  function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, max(0.01, rx), max(0.01, ry), rot, 0, TAU); }
  function poly(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  function fs(g, fill, stroke, lw) {
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.5; g.stroke(); }
  }
  // soft elliptical shadow
  function shadowEll(g, cx, cy, rx, ry, a = 0.35) {
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    g.fillStyle = RG(g, 0, 0, rx, [[0, `rgba(14,10,18,${a})`], [0.55, `rgba(14,10,18,${a * 0.65})`], [1, 'rgba(14,10,18,0)']]);
    g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
  }
  // building cast shadow (light from top-left → shadow to the lower right) + contact AO along base
  function buildingShadow(g, x, y, w, hgt) {
    hgt = min(hgt, 150);
    g.save();
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(16,10,20,0.07)';
      g.beginPath();
      g.moveTo(x + w - 4, y - hgt + 10 + i * 3);
      g.lineTo(x + w + 8 + i * 4, y - hgt + 18 + i * 3);
      g.lineTo(x + w + 8 + i * 4, y + 6 + i * 2);
      g.lineTo(x + 4, y + 6 + i * 2);
      g.lineTo(x + 4, y);
      g.closePath(); g.fill();
    }
    g.fillStyle = LG(g, 0, y - 2, 0, y + 9, [[0, 'rgba(12,8,14,0.42)'], [1, 'rgba(12,8,14,0)']]);
    g.fillRect(x - 5, y - 2, w + 12, 11);
    g.restore();
  }
  // AO gradient at the foot of a wall face
  function wallAO(g, x, y, w, h = 16, a = 0.32) {
    g.fillStyle = LG(g, 0, y - h, 0, y, [[0, 'rgba(10,6,8,0)'], [1, `rgba(10,6,8,${a})`]]);
    g.fillRect(x, y - h, w, h);
  }
  function eaveShadow(g, x, y, w, h = 18, a = 0.5) {
    g.fillStyle = LG(g, 0, y, 0, y + h, [[0, `rgba(12,8,10,${a})`], [1, 'rgba(12,8,10,0)']]);
    g.fillRect(x, y, w, h);
  }

  // ---- text ---------------------------------------------------------------------------------------
  function hchars(g, s, cx, cy, size, color, spacing = 1.05, shadow) {
    const ch = [...String(s)]; const n = ch.length; const step = size * spacing;
    g.font = FONT(size, true); g.textAlign = 'center'; g.textBaseline = 'middle';
    ch.forEach((c, i) => {
      const x = cx + (i - (n - 1) / 2) * step;
      if (shadow) { g.fillStyle = shadow; g.fillText(c, x + 0.8, cy + 0.9); }
      g.fillStyle = color; g.fillText(c, x, cy);
    });
  }
  function vchars(g, s, cx, cy, size, color, spacing = 1.05, shadow) {
    const ch = [...String(s)]; const n = ch.length; const step = size * spacing;
    g.font = FONT(size, true); g.textAlign = 'center'; g.textBaseline = 'middle';
    ch.forEach((c, i) => {
      const y = cy + (i - (n - 1) / 2) * step;
      if (shadow) { g.fillStyle = shadow; g.fillText(c, cx + 0.8, y + 0.9); }
      g.fillStyle = color; g.fillText(c, cx, y);
    });
  }
  // horizontal lacquered plaque 匾額
  function plaque(g, x, y, w, h, text, o = {}) {
    const bg = o.bg || '#1f1a20', fg = o.fg || '#f0c869', rim = o.rim || '#b8862e';
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, x + 1.5, y + 2, w, h, 2); g.fill();
    rr(g, x, y, w, h, 2); g.fillStyle = rim; g.fill();
    rr(g, x + 2, y + 2, w - 4, h - 4, 1.5);
    g.fillStyle = LG(g, 0, y, 0, y + h, [[0, shade(bg, 0.18)], [1, shade(bg, -0.2)]]); g.fill();
    g.fillStyle = rgba('#ffffff', 0.18); g.fillRect(x + 2, y + 2, w - 4, 1);
    if (text) {
      const n = [...String(text)].length;
      const size = min(h * 0.66, (w - 8) / n / 1.02);
      hchars(g, text, x + w / 2, y + h / 2 + 0.5, size, fg, 1.02, 'rgba(0,0,0,0.6)');
    }
    g.restore();
  }
  function vplaque(g, x, y, w, h, text, o = {}) {
    const bg = o.bg || '#1f1a20', fg = o.fg || '#f0c869', rim = o.rim || '#b8862e';
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.35)'; rr(g, x + 2, y + 2, w, h, 2); g.fill();
    rr(g, x, y, w, h, 2); g.fillStyle = rim; g.fill();
    rr(g, x + 2, y + 2, w - 4, h - 4, 1.5);
    g.fillStyle = LG(g, x, 0, x + w, 0, [[0, shade(bg, 0.15)], [1, shade(bg, -0.18)]]); g.fill();
    if (text) {
      const n = [...String(text)].length;
      const size = min(w * 0.72, (h - 8) / n / 1.04);
      vchars(g, text, x + w / 2, y + h / 2, size, fg, 1.04, 'rgba(0,0,0,0.55)');
    }
    g.restore();
  }

  // =================================================================================================
  // materials
  // =================================================================================================
  function clip(g, x, y, w, h) { g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); }
  function planks(g, x, y, w, h, base, rng, bw = 11) {
    clip(g, x, y, w, h);
    g.fillStyle = shade(base, -0.35); g.fillRect(x, y, w, h);
    for (let bx = x; bx < x + w; bx += bw) {
      const c = shade(base, (rng() - 0.5) * 0.26);
      g.fillStyle = LG(g, 0, y, 0, y + h, [[0, shade(c, 0.08)], [1, shade(c, -0.14)]]);
      g.fillRect(bx, y, bw - 1, h);
      g.strokeStyle = rgba(shade(c, -0.45), 0.35); g.lineWidth = 0.6;
      for (let k = 0; k < 2; k++) {
        const gx = bx + 2 + rng() * (bw - 5);
        g.beginPath(); g.moveTo(gx, y);
        g.bezierCurveTo(gx + rng() * 2 - 1, y + h * 0.35, gx + rng() * 2 - 1, y + h * 0.7, gx + rng() * 1.5, y + h);
        g.stroke();
      }
      g.fillStyle = rgba('#fff3dc', 0.08); g.fillRect(bx, y, 1, h);
      if (rng() < 0.25) { ell(g, bx + bw / 2, y + rng() * h, 1.5, 2.4); g.fillStyle = rgba(shade(c, -0.55), 0.6); g.fill(); }
    }
    g.restore();
  }
  function clapboard(g, x, y, w, h, base, rng, bh = 9) {
    clip(g, x, y, w, h);
    for (let by = y; by < y + h; by += bh) {
      const c = shade(base, (rng() - 0.5) * 0.2);
      g.fillStyle = LG(g, 0, by, 0, by + bh, [[0, shade(c, 0.12)], [0.7, c], [1, shade(c, -0.28)]]);
      g.fillRect(x, by, w, bh);
      g.fillStyle = 'rgba(8,4,4,0.35)'; g.fillRect(x, by + bh - 1.3, w, 1.3);
      g.strokeStyle = rgba(shade(c, -0.4), 0.28); g.lineWidth = 0.6;
      for (let k = 0; k < w / 26; k++) { const sx = x + rng() * w; line(g, sx, by + 2 + rng() * (bh - 4), sx + 6 + rng() * 14, by + 2 + rng() * (bh - 4)); }
      if (rng() < 0.7) { const jx = x + rng() * w; g.fillStyle = 'rgba(8,4,4,0.3)'; g.fillRect(jx, by, 1, bh - 1); }
    }
    g.restore();
  }
  function bricks(g, x, y, w, h, base, rng, ch = 7, bl = 17, mortar = '#cbb9a2') {
    clip(g, x, y, w, h);
    g.fillStyle = mortar; g.fillRect(x, y, w, h);
    let row = 0;
    for (let by = y; by < y + h; by += ch, row++) {
      const off = (row % 2) * bl / 2;
      for (let bx = x - off; bx < x + w; bx += bl) {
        const c = shade(base, (rng() - 0.5) * 0.3);
        g.fillStyle = c; g.fillRect(bx + 0.8, by + 0.8, bl - 1.6, ch - 1.6);
        g.fillStyle = rgba('#ffe8d0', 0.1); g.fillRect(bx + 0.8, by + 0.8, bl - 1.6, 1);
        g.fillStyle = rgba('#200a06', 0.16); g.fillRect(bx + 0.8, by + ch - 1.8, bl - 1.6, 1);
        if (rng() < 0.07) { g.fillStyle = rgba('#2a1410', 0.3); g.fillRect(bx + 0.8, by + 0.8, bl - 1.6, ch - 1.6); }
      }
    }
    g.restore();
  }
  function stones(g, x, y, w, h, rng, base = '#8f8e86', rowH = 13, moss = 0.3) {
    clip(g, x, y, w, h);
    g.fillStyle = shade(base, -0.5); g.fillRect(x, y, w, h);
    for (let by = y; by < y + h;) {
      const rh = rowH * (0.75 + rng() * 0.5);
      for (let bx = x - rng() * 14; bx < x + w;) {
        const bw = rh * (1.1 + rng() * 1.5);
        const c = shade(mix(base, '#7c8676', rng() * 0.45), (rng() - 0.5) * 0.26);
        rr(g, bx + 1, by + 1, bw - 2, rh - 2, 2.5);
        g.fillStyle = LG(g, 0, by, 0, by + rh, [[0, shade(c, 0.2)], [0.5, c], [1, shade(c, -0.18)]]); g.fill();
        g.strokeStyle = rgba(shade(c, -0.55), 0.55); g.lineWidth = 0.8; g.stroke();
        if (rng() < moss) { ell(g, bx + rng() * bw, by + rh - 2, 2 + rng() * 4, 1.2 + rng() * 1.5); g.fillStyle = rgba('#5d7a3a', 0.55); g.fill(); }
        bx += bw;
      }
      by += rh;
    }
    g.restore();
  }
  // natural rock: overlapping faceted boulders, lower ones in front (caller clips)
  function rockFace(g, x, y, w, h, rng, base) {
    const rocks = [];
    const n = round(w * h / 300);
    for (let i = 0; i < n; i++) rocks.push([x + rng() * w, y + rng() * h, 10 + rng() * 16]);
    rocks.sort((a, b) => a[1] - b[1]);
    for (const [rx, ry, rs] of rocks) {
      const c = shade(mix(base, rng() < 0.5 ? '#6a5e4c' : '#5c6460', rng() * 0.55), (rng() - 0.5) * 0.25);
      const k = 6 + floor(rng() * 3);
      g.beginPath();
      for (let j = 0; j < k; j++) { const a = j / k * TAU + rng() * 0.4, r = rs * (0.72 + rng() * 0.35); const px = rx + cos(a) * r * 1.3, py = ry + sin(a) * r * 0.8; if (j) g.lineTo(px, py); else g.moveTo(px, py); }
      g.closePath();
      g.fillStyle = LG(g, rx - rs, ry - rs, rx + rs * 0.6, ry + rs, [[0, shade(c, 0.3)], [0.5, c], [1, shade(c, -0.35)]]); g.fill();
      g.strokeStyle = rgba(shade(c, -0.65), 0.55); g.lineWidth = 1; g.stroke();
      if (rng() < 0.25) { ell(g, rx - rs * 0.3, ry - rs * 0.5, rs * 0.5, rs * 0.2); g.fillStyle = 'rgba(90,120,60,0.45)'; g.fill(); }
    }
  }
  function slabs(g, x, y, w, h, rng, base = '#6d6f6c', rowH = 6) {
    clip(g, x, y, w, h);
    g.fillStyle = shade(base, -0.55); g.fillRect(x, y, w, h);
    for (let by = y; by < y + h;) {
      const rh = rowH * (0.7 + rng() * 0.7);
      for (let bx = x - rng() * 20; bx < x + w;) {
        const bw = 18 + rng() * 34;
        const c = shade(mix(base, rng() < 0.5 ? '#6e6556' : '#5b666d', rng() * 0.6), (rng() - 0.5) * 0.3);
        g.beginPath();
        g.moveTo(bx + 1, by + 0.6 + rng()); g.lineTo(bx + bw - 1, by + 0.6 + rng());
        g.lineTo(bx + bw - 1 - rng() * 2, by + rh - 0.4); g.lineTo(bx + 1 + rng() * 2, by + rh - 0.4); g.closePath();
        g.fillStyle = LG(g, 0, by, 0, by + rh, [[0, shade(c, 0.22)], [1, shade(c, -0.15)]]); g.fill();
        bx += bw;
      }
      by += rh;
    }
    g.restore();
  }
  function plaster(g, x, y, w, h, base, rng) {
    clip(g, x, y, w, h);
    g.fillStyle = LG(g, x, y, x + w * 0.4, y + h, [[0, shade(base, 0.08)], [1, shade(base, -0.08)]]);
    g.fillRect(x, y, w, h);
    for (let i = 0; i < w * h / 160; i++) {
      ell(g, x + rng() * w, y + rng() * h, 2 + rng() * 9, 1.5 + rng() * 5);
      g.fillStyle = rng() < 0.5 ? rgba(shade(base, -0.25), 0.08) : rgba(shade(base, 0.3), 0.08); g.fill();
    }
    g.strokeStyle = rgba(shade(base, -0.5), 0.35); g.lineWidth = 0.7;
    for (let i = 0; i < w / 70; i++) {
      let cx = x + rng() * w, cy = y + rng() * h * 0.6;
      g.beginPath(); g.moveTo(cx, cy);
      for (let k = 0; k < 4; k++) { cx += rng() * 6 - 3; cy += 3 + rng() * 5; g.lineTo(cx, cy); }
      g.stroke();
    }
    g.restore();
  }
  // weathering: drip streaks from the top + darkening toward the ground
  function grime(g, x, y, w, h, rng, a = 0.2) {
    clip(g, x, y, w, h);
    for (let i = 0; i < w / 9; i++) {
      const sx = x + rng() * w, sw = 2 + rng() * 6, sh = h * (0.2 + rng() * 0.6);
      g.fillStyle = LG(g, 0, y, 0, y + sh, [[0, `rgba(20,14,10,${a * (0.4 + rng() * 0.6)})`], [1, 'rgba(20,14,10,0)']]);
      g.fillRect(sx, y, sw, sh);
    }
    g.fillStyle = LG(g, 0, y + h * 0.55, 0, y + h, [[0, 'rgba(30,24,16,0)'], [1, `rgba(30,24,16,${a * 1.1})`]]);
    g.fillRect(x, y + h * 0.55, w, h * 0.45);
    g.restore();
  }
  function woodPost(g, x, y, w, h, col) {
    g.fillStyle = LG(g, x, 0, x + w, 0, [[0, shade(col, 0.22)], [0.35, col], [1, shade(col, -0.35)]]);
    g.fillRect(x, y, w, h);
    g.fillStyle = rgba(shade(col, -0.6), 0.6); g.fillRect(x + w - 1, y, 1, h);
  }
  // red lacquer pillar with gold bands
  function redPillar(g, cx, y0, y1, w, col = '#a8261f') {
    const x = cx - w / 2;
    g.fillStyle = LG(g, x, 0, x + w, 0, [[0, shade(col, -0.2)], [0.28, shade(col, 0.32)], [0.55, col], [1, shade(col, -0.45)]]);
    g.fillRect(x, y0, w, y1 - y0);
    g.fillStyle = LG(g, x, 0, x + w, 0, [[0, '#8a6420'], [0.3, '#f2d27a'], [1, '#6e4c16']]);
    g.fillRect(x - 1, y0, w + 2, 4); g.fillRect(x - 1, y0 + 8, w + 2, 2);
    // stone base drum
    g.fillStyle = LG(g, x, 0, x + w, 0, [[0, '#b6b2a6'], [0.4, '#d6d2c6'], [1, '#7b776d']]);
    rr(g, x - 2.5, y1 - 7, w + 5, 7, 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 2.5, y1 - 1, w + 5, 1);
  }

  // =================================================================================================
  // lantern / window / doorway
  // =================================================================================================
  // Red paper lantern centred at (x,y), r = half width. o: {color, from (eave y → cord), glyph, halo, tassel, glow}
  function lantern(g, x, y, r, o = {}) {
    const col = o.color || '#d42f25';
    const hh = r * 1.3;
    g.save();
    const topY = y - hh - 3;
    const from = o.from != null ? o.from : topY - 6;
    if (from < topY) { g.strokeStyle = '#24160e'; g.lineWidth = 1; line(g, x, from, x, topY + 1); }
    if (o.halo !== false && o.lit !== false) {
      const gc = o.glow || '#ff8a3c';
      g.fillStyle = RG(g, x, y, r * 3, [[0, rgba(gc, 0.34)], [0.4, rgba(gc, 0.12)], [1, rgba(gc, 0)]]);
      g.fillRect(x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ell(g, x, y, r, hh);
    const inner = o.lit === false ? shade(col, -0.1) : mix(col, '#ffeaa6', 0.78);
    g.fillStyle = RG(g, x, y, r * 1.25, [[0, inner], [0.38, o.lit === false ? col : mix(col, '#ffb060', 0.38)], [0.8, col], [1, shade(col, -0.4)]], 0, x - r * 0.22, y - hh * 0.18);
    g.fill();
    g.strokeStyle = shade(col, -0.55); g.lineWidth = 1; g.stroke();
    g.save(); ell(g, x, y, r, hh); g.clip();
    g.strokeStyle = rgba(shade(col, -0.6), 0.32); g.lineWidth = 0.75;
    for (let k = 1; k <= 2; k++) { ell(g, x, y, r * k / 3, hh); g.stroke(); }
    g.strokeStyle = rgba(shade(col, -0.6), 0.2);
    for (let k = -2; k <= 2; k++) { const yy = y + k * hh * 0.34; g.beginPath(); g.moveTo(x - r, yy); g.quadraticCurveTo(x, yy + r * 0.25, x + r, yy); g.stroke(); }
    g.restore();
    if (o.glyph) {
      g.font = FONT(max(6, r * 1.05), true); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = rgba('#2a0806', 0.72); g.fillText(o.glyph, x, y + r * 0.06);
    }
    g.strokeStyle = rgba('#fff3cf', 0.5); g.lineWidth = 1;
    g.beginPath(); g.ellipse(x, y, r * 0.78, hh * 0.84, 0, PI * 1.08, PI * 1.42); g.stroke();
    g.fillStyle = '#1d1613';
    rr(g, x - r * 0.52, topY, r * 1.04, 4, 1.2); g.fill();
    rr(g, x - r * 0.46, y + hh - 1, r * 0.92, 4, 1.2); g.fill();
    g.fillStyle = 'rgba(228,180,84,0.9)';
    g.fillRect(x - r * 0.52, topY + 0.5, r * 1.04, 0.9); g.fillRect(x - r * 0.46, y + hh + 2, r * 0.92, 0.9);
    if (o.tassel !== false) {
      g.strokeStyle = o.tasselColor || '#d9a640'; g.lineWidth = 0.9;
      const ty = y + hh + 3, tl = max(4, r * 0.95);
      for (let k = -1; k <= 1; k++) line(g, x + k * 1.1, ty, x + k * 1.6, ty + tl);
      ell(g, x, ty + 1, 1.4, 1.4); g.fillStyle = '#e0b048'; g.fill();
    }
    g.restore();
  }
  // lantern sprite (hang point at sprite (cx, 0)), cached — used by animated swaying lanterns
  function lanternSprite(r, color, glyph, cord, lit = true) {
    const hh = r * 1.3, wpx = r * 6, hpx = cord + hh * 2 + r * 3 + 10;
    return art(`lantern|${r}|${color}|${glyph || ''}|${cord}|${lit ? 1 : 0}`, wpx, hpx, (g) => {
      lantern(g, wpx / 2, cord + hh + 3, r, { color, glyph, from: 0, lit });
    });
  }
  function drawLanternSprite(ctx, x, y, r, color, glyph, cord, angle, lit) {
    const c = lanternSprite(r, color, glyph, cord, lit);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    ctx.drawImage(c, -c.lw / 2, 0, c.lw, c.lh);
    ctx.restore();
  }
  // live additive glow (main canvas)
  function liveGlow(ctx, x, y, r, col, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = RG(ctx, x, y, r, [[0, rgba(col, a)], [0.35, rgba(col, a * 0.4)], [1, rgba(col, 0)]]);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  const flick = (t, s) => 0.82 + 0.1 * sin(t * 7.3 + s) + 0.08 * sin(t * 13.1 + s * 2.7);

  function windowLat(g, x, y, w, h, lit, o = {}) {
    const fr = o.frame || '#3b2516';
    g.save();
    if (lit && o.spill !== false) {
      g.fillStyle = RG(g, x + w / 2, y + h / 2, max(w, h) * 0.95, [[0, 'rgba(255,186,104,0.2)'], [1, 'rgba(255,186,104,0)']]);
      g.fillRect(x - w, y - h, w * 3, h * 3);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 1, y - 1, w + 6, h + 6);
    g.fillStyle = fr; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle = rgba(shade(fr, 0.5), 0.6); g.fillRect(x - 3, y - 3, w + 6, 1.2);
    g.fillStyle = lit ? LG(g, x, y, x + w * 0.3, y + h, [[0, '#ffe9b2'], [0.5, '#ffc56f'], [1, '#e5823c']])
      : LG(g, x, y, x, y + h, [[0, '#3a3b47'], [1, '#18171d']]);
    g.fillRect(x, y, w, h);
    g.strokeStyle = shade(fr, -0.1); g.lineWidth = 1.3;
    const pat = o.pattern || 'grid';
    if (pat === 'grid' || pat === 'shoji') {
      const sx = pat === 'shoji' ? 8 : 6, sy = pat === 'shoji' ? 8 : h / 3;
      for (let xx = x + sx; xx < x + w - 1; xx += sx) line(g, xx, y, xx, y + h);
      for (let yy = y + sy; yy < y + h - 1; yy += sy) line(g, x, yy, x + w, yy);
    } else if (pat === 'diamond') {
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      for (let k = -h; k < w + h; k += 7) { line(g, x + k, y, x + k + h, y + h); line(g, x + k + h, y, x + k, y + h); }
      g.restore();
    } else if (pat === 'bars') { // 竹節窗 stone bars
      const n = max(3, round(w / 8));
      for (let i = 0; i < n; i++) {
        const bx = x + (i + 0.5) * w / n;
        g.fillStyle = LG(g, bx - 2.5, 0, bx + 2.5, 0, [[0, '#d7d6cc'], [0.4, '#a9aba0'], [1, '#5d6058']]);
        g.fillRect(bx - 2.5, y, 5, h);
        g.fillStyle = 'rgba(40,40,36,0.5)';
        for (let k = 1; k < 3; k++) g.fillRect(bx - 2.5, y + h * k / 3 - 0.6, 5, 1.2);
      }
    }
    g.fillStyle = LG(g, 0, y, 0, y + h * 0.45, [[0, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x, y, w, h * 0.45);
    if (o.sill !== false) {
      g.fillStyle = shade(fr, 0.12); g.fillRect(x - 5, y + h + 2, w + 10, 3);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - 5, y + h + 5, w + 10, 1.5);
    }
    g.restore();
  }
  // open doorway: frame, dark warm interior, 門簾 cloth curtain
  function doorway(g, x, y, w, h, o = {}) {
    const fr = o.frame || '#2e1d13';
    const lit = o.lit !== false;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 3, y - 4, w + 9, h + 4);
    g.fillStyle = fr; g.fillRect(x - 4, y - 5, w + 8, h + 5);
    g.fillStyle = rgba(shade(fr, 0.6), 0.5); g.fillRect(x - 4, y - 5, w + 8, 1.4);
    g.fillStyle = LG(g, 0, y, 0, y + h, [[0, '#120c0b'], [0.55, lit ? '#3a2317' : '#191414'], [1, lit ? '#93582a' : '#241c18']]);
    g.fillRect(x, y, w, h);
    if (lit) {
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.fillStyle = RG(g, x + w * 0.55, y + h, w, [[0, 'rgba(255,190,100,0.55)'], [1, 'rgba(255,190,100,0)']]);
      g.fillRect(x, y, w, h);
      g.restore();
    }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y, 4, h); g.fillRect(x, y, w, 3);
    if (o.curtain !== false) {
      const cc = o.curtain || '#2c3d6e', ch = h * (o.ch || 0.44);
      for (let s = 0; s < 2; s++) {
        const cx0 = x + s * w / 2 + 0.5, cw = w / 2 - 1;
        g.beginPath(); g.moveTo(cx0, y); g.lineTo(cx0 + cw, y); g.lineTo(cx0 + cw, y + ch + (s ? 0 : -1.5));
        g.quadraticCurveTo(cx0 + cw / 2, y + ch + 2.5, cx0, y + ch + (s ? -1.5 : 0)); g.closePath();
        g.fillStyle = LG(g, cx0, y, cx0 + cw, y + ch, [[0, shade(cc, 0.18)], [1, shade(cc, -0.22)]]); g.fill();
        g.strokeStyle = rgba(shade(cc, -0.5), 0.5); g.lineWidth = 0.8;
        for (let k = 1; k < 3; k++) line(g, cx0 + cw * k / 3, y + 2, cx0 + cw * k / 3 + (s ? 0.6 : -0.6), y + ch - 1);
      }
      if (o.mark !== false) {
        const ink = o.ink || '#efe6d2';
        g.strokeStyle = rgba(ink, 0.85); g.lineWidth = 1.2;
        ell(g, x + w / 2, y + ch * 0.55, ch * 0.24, ch * 0.24); g.stroke();
        if (o.glyph) { g.font = FONT(ch * 0.3, true); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = ink; g.fillText(o.glyph, x + w / 2, y + ch * 0.57); }
      }
      g.fillStyle = '#4e3220'; g.fillRect(x - 2, y - 1, w + 4, 2.4);
    }
    g.fillStyle = '#77716a'; g.fillRect(x - 6, y + h - 3, w + 12, 4);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(x - 6, y + h - 3, w + 12, 1);
    g.restore();
  }

  // =================================================================================================
  // roofs
  // =================================================================================================
  // Gable roof seen in 3/4 top-down: front slope from ridge (top) to eave (bottom), thin back-slope sliver.
  // R = { x0, x1, ridge, eave, lift, sag, back, kind:'tar'|'tile'|'slate'|'thatch', base, tileW, batten }
  // returns surface helpers { X(u), at(u,v), eY(u), rY(u), w }
  function roof(g, R, rng) {
    const { x0, x1, ridge, eave } = R;
    const lift = R.lift || 0, sag = R.sag || 0, back = R.back == null ? 8 : R.back;
    const kind = R.kind || 'tar', base = R.base || '#2c2d33';
    const w = x1 - x0, N = 40;
    const dd = (u) => abs(2 * u - 1);
    const eY = (u) => eave - lift * pow(dd(u), 3);
    const rY = (u) => ridge + sag * (1 - dd(u) * dd(u)) - lift * 0.55 * pow(dd(u), 3);
    const X = (u) => x0 + w * u;
    const at = (u, v) => lerp(rY(u), eY(u), v);
    const S = { X, at, eY, rY, w, x0, x1, ridge, eave };
    S.curve = (v, off = 0) => {
      g.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N; const yy = at(u, v) + off; if (i) g.lineTo(X(u), yy); else g.moveTo(X(u), yy); }
    };
    const surf = (topOff) => {
      g.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N; const yy = rY(u) + topOff; if (i) g.lineTo(X(u), yy); else g.moveTo(X(u), yy); }
      for (let i = N; i >= 0; i--) { const u = i / N; g.lineTo(X(u), eY(u)); }
      g.closePath();
    };
    // back slope sliver
    if (back > 0) {
      g.beginPath();
      for (let i = 0; i <= N; i++) { const u = i / N; const yy = rY(u) - back; if (i) g.lineTo(X(u), yy); else g.moveTo(X(u), yy); }
      for (let i = N; i >= 0; i--) { const u = i / N; g.lineTo(X(u), rY(u) + 1); }
      g.closePath();
      g.fillStyle = LG(g, 0, ridge - back, 0, ridge, [[0, shade(base, -0.5)], [1, shade(base, -0.28)]]); g.fill();
    }
    // under-eave dark lip (thickness of the roof edge)
    g.beginPath();
    for (let i = 0; i <= N; i++) { const u = i / N; const yy = eY(u) + 4; if (i) g.lineTo(X(u), yy); else g.moveTo(X(u), yy); }
    for (let i = N; i >= 0; i--) { const u = i / N; g.lineTo(X(u), eY(u) - 2); }
    g.closePath(); g.fillStyle = shade(base, -0.55); g.fill();
    // front slope
    surf(0);
    g.fillStyle = LG(g, 0, ridge, 0, eave, [[0, shade(base, 0.16)], [0.55, base], [1, shade(base, -0.12)]]); g.fill();
    g.save(); surf(0); g.clip();
    (TEX[kind] || TEX.tar)(g, R, S, rng, base);
    g.fillStyle = LG(g, x0, ridge, x0 + w * 0.75, eave + 20, [[0, 'rgba(255,238,215,0.13)'], [0.6, 'rgba(255,238,215,0.02)'], [1, 'rgba(0,0,0,0.12)']]);
    g.fillRect(x0, ridge - 60, w, eave - ridge + 120);
    g.restore();
    // side edges (barge boards)
    g.strokeStyle = shade(base, -0.55); g.lineWidth = 2;
    line(g, X(0) + 0.5, rY(0) - back, X(0) + 0.5, eY(0) + 3);
    line(g, X(1) - 0.5, rY(1) - back, X(1) - 0.5, eY(1) + 3);
    g.strokeStyle = rgba(shade(base, 0.5), 0.35); g.lineWidth = 1;
    line(g, X(0) + 2, rY(0), X(0) + 2, eY(0));
    // eave finish
    if (kind === 'tar' || kind === 'slate') {
      S.curve(1, 1.6); g.strokeStyle = kind === 'tar' ? '#1c140e' : shade(base, -0.5); g.lineWidth = 4; g.stroke();
      S.curve(1, -0.4); g.strokeStyle = rgba(kind === 'tar' ? '#8a6a4c' : shade(base, 0.4), 0.45); g.lineWidth = 1; g.stroke();
    } else if (kind === 'tile') {
      const sp = R.tileW || 9, n = max(2, round(w / sp));
      for (let i = 0; i <= n; i++) {
        const u = i / n, xx = X(u), yy = eY(u);
        if (i < n) { // drip tile 滴水
          const xm = X((i + 0.5) / n), ym = eY((i + 0.5) / n);
          g.beginPath(); g.moveTo(xm - sp * 0.32, ym); g.lineTo(xm + sp * 0.32, ym); g.lineTo(xm, ym + 4); g.closePath();
          fs(g, shade(base, -0.25), shade(base, -0.6), 0.7);
        }
        ell(g, xx, yy + 0.5, sp * 0.33, sp * 0.33);
        fs(g, RG(g, xx, yy, sp * 0.33, [[0, shade(base, 0.25)], [1, shade(base, -0.15)]], 0, xx - 1, yy - 1), shade(base, -0.6), 0.8);
        ell(g, xx, yy + 0.5, sp * 0.14, sp * 0.14); g.strokeStyle = rgba(shade(base, -0.6), 0.6); g.lineWidth = 0.6; g.stroke();
      }
    } else if (kind === 'thatch') {
      for (let x = x0 + 1; x < x1 - 1; x += 1.6) {
        const u = (x - x0) / w, yy = eY(u);
        g.strokeStyle = mix(base, rng() < 0.5 ? '#3c2d18' : '#d8c07a', rng() * 0.6); g.lineWidth = 1.1;
        line(g, x, yy - 4, x + rng() * 2 - 1, yy + 2 + rng() * 4);
      }
    }
    // ridge
    if (R.ridgeStyle !== 'none') {
      S.curve(0, -back * 0.3); g.strokeStyle = shade(base, -0.45); g.lineWidth = kind === 'thatch' ? 6 : 5; g.stroke();
      S.curve(0, -back * 0.3 - 1.6); g.strokeStyle = rgba(shade(base, 0.45), 0.55); g.lineWidth = 1.2; g.stroke();
    }
    return S;
  }
  const TEX = {
    tar(g, R, S, rng, base) {
      const step = 11; const rows = max(2, round((R.eave - R.ridge) / step));
      for (let k = 1; k < rows; k++) {
        const v = k / rows;
        S.curve(v, 0); g.strokeStyle = 'rgba(8,8,11,0.6)'; g.lineWidth = 1.4; g.stroke();
        S.curve(v, 1.5); g.strokeStyle = rgba(shade(base, 0.4), 0.3); g.lineWidth = 1; g.stroke();
      }
      for (let i = 0; i < S.w / 16; i++) {
        const u = rng(), v = rng();
        ell(g, S.X(u), S.at(u, v), 5 + rng() * 12, 2 + rng() * 4);
        g.fillStyle = rng() < 0.55 ? 'rgba(10,10,14,0.35)' : 'rgba(96,80,60,0.14)'; g.fill();
      }
      const bsp = R.batten || 21;
      for (let x = S.x0 + bsp * 0.6; x < S.x1 - 3; x += bsp) {
        const u = (x - S.x0) / S.w, y0 = S.rY(u) - 4, y1 = S.eY(u) + 1;
        g.strokeStyle = 'rgba(6,6,8,0.75)'; g.lineWidth = 3.6; line(g, x + 1, y0, x + 1, y1);
        g.strokeStyle = shade(base, 0.1); g.lineWidth = 2.6; line(g, x, y0, x, y1);
        g.strokeStyle = rgba(shade(base, 0.6), 0.4); g.lineWidth = 0.9; line(g, x - 0.8, y0, x - 0.8, y1);
      }
    },
    tile(g, R, S, rng, base) {
      const sp = R.tileW || 9; const n = max(2, round(S.w / sp));
      const rows = max(3, round((R.eave - R.ridge) / 8));
      g.fillStyle = rgba(shade(base, -0.4), 0.45); g.fillRect(S.x0, R.ridge - 40, S.w, R.eave - R.ridge + 80);
      for (let k = 1; k < rows; k++) { S.curve(k / rows); g.strokeStyle = rgba(shade(base, -0.6), 0.3); g.lineWidth = 1; g.stroke(); }
      for (let i = 0; i <= n; i++) {
        const u = i / n, x = S.X(u), y0 = S.rY(u) - 6, y1 = S.eY(u);
        const c = shade(base, (rng() - 0.5) * 0.14);
        g.strokeStyle = shade(c, -0.45); g.lineWidth = sp * 0.62; line(g, x + 1, y0, x + 1, y1);
        g.strokeStyle = c; g.lineWidth = sp * 0.5; line(g, x, y0, x, y1);
        g.strokeStyle = rgba(shade(c, 0.5), 0.65); g.lineWidth = 1.1; line(g, x - sp * 0.12, y0, x - sp * 0.12, y1);
        g.strokeStyle = rgba(shade(c, -0.55), 0.5); g.lineWidth = 0.8;
        for (let k = 1; k < rows; k++) { const yy = lerp(y0 + 6, y1, k / rows); line(g, x - sp * 0.24, yy, x + sp * 0.24, yy + 0.6); }
      }
      // weathering (lichen / soot)
      for (let i = 0; i < S.w / 30; i++) {
        const u = rng(), v = rng();
        ell(g, S.X(u), S.at(u, v), 4 + rng() * 10, 2 + rng() * 5);
        g.fillStyle = rng() < 0.5 ? 'rgba(40,30,20,0.13)' : 'rgba(150,160,110,0.1)'; g.fill();
      }
    },
    slate(g, R, S, rng, base) {
      const rowH = R.rowH || 8; const H = R.eave - R.ridge; const rows = Math.ceil(H / rowH) + 1;
      for (let k = rows; k >= 0; k--) {
        const v0 = k / rows - 0.02;
        let x = S.x0 - rng() * 20;
        while (x < S.x1) {
          const sw = 13 + rng() * 22;
          const c = shade(mix(base, rng() < 0.5 ? '#6f6656' : '#58646c', rng() * 0.55), (rng() - 0.5) * 0.28);
          const um = clamp((x + sw / 2 - S.x0) / S.w, 0, 1);
          const yt = S.at(um, max(0, v0)) - 2, yb = yt + rowH + 3;
          g.beginPath();
          g.moveTo(x + 1, yt + rng()); g.lineTo(x + sw - 1, yt + rng());
          g.lineTo(x + sw - 1 - rng() * 2.5, yb); g.lineTo(x + 1 + rng() * 2.5, yb + rng() * 1.5); g.closePath();
          g.fillStyle = LG(g, 0, yt, 0, yb, [[0, shade(c, 0.25)], [1, shade(c, -0.12)]]); g.fill();
          g.strokeStyle = rgba(shade(c, -0.6), 0.5); g.lineWidth = 0.7; g.stroke();
          g.fillStyle = 'rgba(10,10,12,0.35)'; g.fillRect(x + 1, yb, sw - 2, 1.8);
          if (rng() < 0.12) { ell(g, x + sw / 2, yt + rowH / 2, 3, 1.5); g.fillStyle = 'rgba(120,140,80,0.35)'; g.fill(); }
          x += sw - 1;
        }
      }
    },
    thatch(g, R, S, rng, base) {
      const rowH = R.rowH || 10; const H = R.eave - R.ridge; const rows = Math.ceil(H / rowH) + 1;
      for (let k = rows; k >= 0; k--) {
        const v0 = k / rows - 0.05;
        for (let x = S.x0; x < S.x1; x += 1.7) {
          const u = clamp((x - S.x0) / S.w, 0, 1);
          const yt = S.at(u, max(0, v0)) - 3;
          g.strokeStyle = mix(base, rng() < 0.5 ? '#3f2f1a' : '#e2cb86', rng() * 0.55); g.lineWidth = 1.2;
          line(g, x, yt, x + rng() * 2 - 1, yt + rowH + 2 + rng() * 3);
        }
        S.curve(clamp(v0 + 1 / rows, 0, 1), 0); g.strokeStyle = 'rgba(40,28,12,0.35)'; g.lineWidth = 1.5; g.stroke();
      }
    },
  };

  // Hip / pyramidal roof (攢尖 when rh = 0) with lifted, flared corners (翹角), seen in 3/4 top-down.
  // R = { cx, hw (eave half width), rh (ridge half length), ridge (ridge y), eave (front eave y),
  //       depth (projected roof depth: back eave = eave - depth), lift, flare, base, ridgeCol, tipCol }
  function hipRoof(g, R, rng) {
    const { cx, hw, ridge, eave } = R;
    const rh = R.rh || 0, lift = R.lift || 0, flare = R.flare || 0, base = R.base;
    const depth = R.depth == null ? hw * 0.6 : R.depth;
    const ex = (s) => cx + s * (hw + flare * pow(abs(s), 5));
    const ey = (s) => eave - lift * pow(abs(s), 4);
    const Lc = [ex(-1), ey(-1)], Rc = [ex(1), ey(1)];
    const BL = [ex(-1) + 2, ey(-1) - depth], BR = [ex(1) - 2, ey(1) - depth];
    const A = [cx - rh, ridge], B = [cx + rh, ridge];
    const N = 30;
    const hipC = (P0, P1, sgn) => [lerp(P0[0], P1[0], 0.5) - sgn * 6, lerp(P0[1], P1[1], 0.5) + 6];
    const eavePath = (rev) => { for (let i = 0; i <= N; i++) { const s = rev ? 1 - 2 * i / N : -1 + 2 * i / N; g.lineTo(ex(s), ey(s)); } };
    // under-eave lip
    g.beginPath(); g.moveTo(Lc[0], Lc[1] - 2); for (let i = 0; i <= N; i++) { const s = -1 + 2 * i / N; g.lineTo(ex(s), ey(s) + 4); } g.lineTo(Rc[0], Rc[1] - 2); g.closePath();
    g.fillStyle = shade(base, -0.6); g.fill();
    // back slope (only visible when the roof is low)
    if (ridge > BL[1]) { poly(g, [BL, BR, B, A]); g.fillStyle = shade(base, -0.35); g.fill(); }
    // side slopes: left lit, right in shade
    const cL = hipC(A, Lc, -1), cR = hipC(B, Rc, 1);
    g.beginPath(); g.moveTo(BL[0], BL[1]); g.lineTo(A[0], A[1]); g.quadraticCurveTo(cL[0], cL[1], Lc[0], Lc[1]); g.closePath();
    g.fillStyle = LG(g, Lc[0], 0, A[0], 0, [[0, shade(base, 0.02)], [1, shade(base, 0.22)]]); g.fill();
    g.save(); g.clip();
    for (let k = 1; k < 8; k++) { const y = lerp(Lc[1], BL[1], k / 8); g.strokeStyle = shade(base, -0.3); g.lineWidth = 2.6; line(g, Lc[0], y, A[0], A[1]); g.strokeStyle = rgba(shade(base, 0.45), 0.5); g.lineWidth = 0.8; line(g, Lc[0] - 0.8, y, A[0], A[1]); }
    g.restore();
    g.beginPath(); g.moveTo(BR[0], BR[1]); g.lineTo(B[0], B[1]); g.quadraticCurveTo(cR[0], cR[1], Rc[0], Rc[1]); g.closePath();
    g.fillStyle = LG(g, B[0], 0, Rc[0], 0, [[0, shade(base, -0.22)], [1, shade(base, -0.42)]]); g.fill();
    g.save(); g.clip();
    for (let k = 1; k < 8; k++) { const y = lerp(Rc[1], BR[1], k / 8); g.strokeStyle = shade(base, -0.55); g.lineWidth = 2.6; line(g, Rc[0], y, B[0], B[1]); }
    g.restore();
    // front slope
    const front = () => {
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]);
      g.quadraticCurveTo(cR[0], cR[1], Rc[0], Rc[1]);
      eavePath(true);
      g.quadraticCurveTo(cL[0], cL[1], A[0], A[1]);
      g.closePath();
    };
    front();
    g.fillStyle = LG(g, 0, ridge, 0, eave, [[0, shade(base, 0.2)], [0.6, base], [1, shade(base, -0.12)]]); g.fill();
    g.save(); front(); g.clip();
    const n = max(6, round(hw * 2 / 8));
    for (let i = 0; i <= n; i++) {
      const s = -1 + 2 * i / n;
      const bx = ex(s), by = ey(s), tx = lerp(A[0], B[0], (s + 1) / 2), ty = ridge;
      g.strokeStyle = shade(base, -0.4); g.lineWidth = 4.4; line(g, bx + 0.8, by, tx + 0.3, ty);
      g.strokeStyle = shade(base, 0.06); g.lineWidth = 3.4; line(g, bx, by, tx, ty);
      g.strokeStyle = rgba(shade(base, 0.55), 0.5); g.lineWidth = 0.9; line(g, bx - 0.9, by, tx - 0.3, ty);
    }
    const rows = max(3, round((eave - ridge) / 9));
    g.strokeStyle = rgba(shade(base, -0.6), 0.3); g.lineWidth = 1;
    for (let k = 1; k < rows; k++) {
      const v = k / rows; g.beginPath();
      for (let i = 0; i <= N; i++) { const s = -1 + 2 * i / N; const xx = lerp(lerp(A[0], B[0], (s + 1) / 2), ex(s), v); const yy = lerp(ridge, ey(s), v); if (i) g.lineTo(xx, yy); else g.moveTo(xx, yy); }
      g.stroke();
    }
    g.fillStyle = LG(g, cx - hw, ridge, cx + hw * 0.4, eave, [[0, 'rgba(255,240,210,0.14)'], [1, 'rgba(0,0,0,0.1)']]);
    g.fillRect(cx - hw - flare, ridge - 10, (hw + flare) * 2, eave - ridge + 20);
    g.restore();
    // eave edge
    g.strokeStyle = shade(base, -0.55); g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(Lc[0], Lc[1]); eavePath(false); g.stroke();
    g.strokeStyle = rgba(shade(base, 0.5), 0.6); g.lineWidth = 1;
    g.beginPath(); for (let i = 0; i <= N; i++) { const s = -1 + 2 * i / N; g.lineTo(ex(s), ey(s) - 1.6); } g.stroke();
    // hips & ridge
    const rc = R.ridgeCol || shade(base, -0.3);
    const stroke3 = (w) => { g.strokeStyle = shade(rc, -0.45); g.lineWidth = w + 1.7; g.stroke(); g.strokeStyle = rc; g.lineWidth = w; g.stroke(); g.strokeStyle = rgba(shade(rc, 0.6), 0.55); g.lineWidth = 0.9; g.stroke(); };
    const curl = (P1, sgn, s = 1) => {
      g.beginPath(); g.moveTo(P1[0], P1[1]);
      g.quadraticCurveTo(P1[0] + sgn * 7 * s, P1[1] - 1, P1[0] + sgn * 10 * s, P1[1] - 9 * s);
      g.strokeStyle = shade(rc, -0.45); g.lineWidth = 4.5 * s; g.stroke();
      g.strokeStyle = rc; g.lineWidth = 2.8 * s; g.stroke();
      ell(g, P1[0] + sgn * 10 * s, P1[1] - 10 * s, 2.2 * s, 2.2 * s); fs(g, R.tipCol || '#e9c25a', shade(rc, -0.5), 0.8);
    };
    // back hips (silhouette)
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(BL[0], BL[1]); stroke3(2.6);
    g.beginPath(); g.moveTo(B[0], B[1]); g.lineTo(BR[0], BR[1]); stroke3(2.6);
    curl(BL, -1, 0.7); curl(BR, 1, 0.7);
    g.beginPath(); g.moveTo(A[0], A[1]); g.quadraticCurveTo(cL[0], cL[1], Lc[0], Lc[1]); stroke3(3.8);
    g.beginPath(); g.moveTo(B[0], B[1]); g.quadraticCurveTo(cR[0], cR[1], Rc[0], Rc[1]); stroke3(3.8);
    curl(Lc, -1); curl(Rc, 1);
    if (rh > 0) { g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); stroke3(5); }
    return { A, B, Lc, Rc };
  }

  // swallow-tail ridge end 燕尾 — (x,y) = end of the straight ridge band (centre line), dir -1 left / +1 right
  function swallowTail(g, x, y, dir, s, col, th) {
    th = th || s * 0.22;
    g.save(); g.translate(x, y); g.scale(dir, 1);
    g.beginPath();
    g.moveTo(-8, -th / 2);
    g.bezierCurveTo(s * 0.35, -th / 2, s * 0.62, -s * 0.3, s * 0.92, -s * 1.02);
    g.lineTo(s * 0.8, -s * 0.66);
    g.lineTo(s * 1.12, -s * 0.74);
    g.bezierCurveTo(s * 0.7, -s * 0.18, s * 0.38, th / 2, -8, th / 2);
    g.closePath();
    g.fillStyle = LG(g, 0, -s, 0, th, [[0, shade(col, 0.25)], [1, shade(col, -0.25)]]); g.fill();
    g.strokeStyle = shade(col, -0.55); g.lineWidth = 1.2; g.stroke();
    g.beginPath(); g.moveTo(-6, -th / 2 + 1.2); g.bezierCurveTo(s * 0.35, -th / 2 + 1.2, s * 0.6, -s * 0.28, s * 0.88, -s * 0.96);
    g.strokeStyle = rgba('#fff5e0', 0.5); g.lineWidth = 1; g.stroke();
    g.restore();
  }
  // decorative ridge band following a roof's ridge curve
  function ridgeBand(g, S, ua, ub, th, col, deco) {
    const N = 36;
    const top = (u) => S.rY(u) - th + 2, bot = (u) => S.rY(u) + 2.5;
    g.beginPath();
    for (let i = 0; i <= N; i++) { const u = lerp(ua, ub, i / N); if (i) g.lineTo(S.X(u), top(u)); else g.moveTo(S.X(u), top(u)); }
    for (let i = N; i >= 0; i--) { const u = lerp(ua, ub, i / N); g.lineTo(S.X(u), bot(u)); }
    g.closePath();
    g.fillStyle = LG(g, 0, S.ridge - th, 0, S.ridge + 3, [[0, shade(col, 0.2)], [1, shade(col, -0.3)]]); g.fill();
    g.strokeStyle = shade(col, -0.6); g.lineWidth = 1.2; g.stroke();
    if (deco) {
      const x0 = S.X(ua), x1 = S.X(ub);
      for (let x = x0 + 3, i = 0; x < x1 - 3; x += 4.5, i++) {
        const u = (x - S.x0) / S.w, yy = S.rY(u) - th * 0.5 + 1.5;
        g.fillStyle = deco[i % deco.length];
        g.fillRect(x - 1.8, yy - th * 0.22, 3.6, th * 0.44);
      }
    }
    g.beginPath();
    for (let i = 0; i <= N; i++) { const u = lerp(ua, ub, i / N); if (i) g.lineTo(S.X(u), top(u) + 1); else g.moveTo(S.X(u), top(u) + 1); }
    g.strokeStyle = rgba('#fff4dc', 0.55); g.lineWidth = 1.1; g.stroke();
  }
  // temple ridge dragon (剪黏 style). (hx,hy) head; dir = facing (+1 right)
  function dragon(g, hx, hy, dir, len, s, pal) {
    pal = pal || { body: '#2e9c7a', belly: '#f0c85a', fin: '#e8602e', dark: '#123e33' };
    const pts = [], N = 30;
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      pts.push([hx - dir * (6 * s + k * len), hy + 3 * s - sin(k * PI * 2.3 + 0.9) * 8 * s * (1 - k * 0.35) + k * 4 * s, (5.6 - 3.8 * k) * s]);
    }
    for (let i = N; i >= 0; i--) { const p = pts[i]; ell(g, p[0], p[1], p[2] + 1.3, p[2] + 1.3); g.fillStyle = pal.dark; g.fill(); }
    for (let i = N - 1; i >= 2; i -= 2) {
      const p = pts[i];
      g.beginPath(); g.moveTo(p[0] - 2.5 * s, p[1] - p[2] + 1); g.lineTo(p[0] + dir * 1.5 * s, p[1] - p[2] - p[2] * 1.1); g.lineTo(p[0] + 2.5 * s, p[1] - p[2] + 1); g.closePath();
      fs(g, pal.fin, shade(pal.fin, -0.5), 0.6);
    }
    // legs
    for (const k of [0.22, 0.58]) {
      const p = pts[round(k * N)];
      g.strokeStyle = pal.dark; g.lineWidth = 3.4 * s; line(g, p[0], p[1], p[0] + dir * 3 * s, p[1] + 7 * s);
      g.strokeStyle = pal.body; g.lineWidth = 2.2 * s; line(g, p[0], p[1], p[0] + dir * 3 * s, p[1] + 7 * s);
      g.strokeStyle = pal.belly; g.lineWidth = 1;
      for (let c = -1; c <= 1; c++) line(g, p[0] + dir * 3 * s, p[1] + 7 * s, p[0] + dir * (3 + c * 2.2 + 1.5) * s, p[1] + 9.5 * s);
    }
    for (let i = N; i >= 0; i--) {
      const p = pts[i];
      ell(g, p[0], p[1], p[2], p[2]);
      g.fillStyle = RG(g, p[0], p[1], p[2], [[0, shade(pal.body, 0.4)], [1, pal.body]], 0, p[0] - p[2] * 0.3, p[1] - p[2] * 0.45); g.fill();
    }
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1] + p[2] * 0.55) : g.moveTo(p[0], p[1] + p[2] * 0.55)));
    g.strokeStyle = pal.belly; g.lineWidth = 1.5 * s; g.stroke();
    for (let i = 2; i < N; i += 2) { const p = pts[i]; ell(g, p[0] + 0.6, p[1] - p[2] * 0.25, 0.9 * s, 0.9 * s); g.fillStyle = rgba('#d6fff0', 0.7); g.fill(); }
    // head
    g.save(); g.translate(hx, hy - 1 * s); g.scale(dir * s, s);
    g.beginPath(); g.moveTo(-6, -5); g.bezierCurveTo(-12, -16, -4, -18, -1, -11); g.bezierCurveTo(-8, -20, 4, -20, 2, -10); g.lineTo(-2, -4); g.closePath();
    fs(g, pal.fin, shade(pal.fin, -0.5), 0.6);
    g.beginPath(); g.moveTo(-7, -6); g.quadraticCurveTo(3, -11, 13, -6); g.lineTo(16, -3); g.lineTo(12, 0.5); g.lineTo(5, 1); g.lineTo(14, 4.5); g.lineTo(10, 7.5); g.quadraticCurveTo(-1, 8, -7, 4); g.closePath();
    fs(g, LG(g, 0, -10, 0, 8, [[0, shade(pal.body, 0.35)], [1, shade(pal.body, -0.1)]]), pal.dark, 1);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(6, 1); g.lineTo(8, 3.4); g.lineTo(10, 1.2); g.fill();
    ell(g, 3, -5, 2.4, 2); g.fillStyle = '#fffbe8'; g.fill(); ell(g, 3.6, -5, 1.1, 1.3); g.fillStyle = '#1a1010'; g.fill();
    g.strokeStyle = pal.belly; g.lineWidth = 1.6; line(g, -2, -8, -11, -15);
    g.lineWidth = 0.8; g.beginPath(); g.moveTo(15, -3); g.quadraticCurveTo(21, -4, 24, -10); g.stroke();
    g.beginPath(); g.moveTo(13, 6); g.quadraticCurveTo(19, 9, 21, 14); g.stroke();
    g.restore();
  }
  function flamingPearl(g, x, y, r) {
    for (let i = 0; i < 9; i++) {
      const a = -PI / 2 + (i - 4) * 0.36;
      g.beginPath(); g.moveTo(x + cos(a - 0.2) * r, y + sin(a - 0.2) * r);
      g.quadraticCurveTo(x + cos(a) * r * 2.3, y + sin(a) * r * 2.3, x + cos(a + 0.25) * r * 2.1, y + sin(a + 0.25) * r * 2.1);
      g.lineTo(x + cos(a + 0.2) * r, y + sin(a + 0.2) * r); g.closePath();
      fs(g, i % 2 ? '#f28a2e' : '#ffcf4a', '#a8401a', 0.6);
    }
    ell(g, x, y, r, r);
    fs(g, RG(g, x, y, r, [[0, '#ffffff'], [0.5, '#bfe6ff'], [1, '#4c8fc9']], 0, x - r * 0.35, y - r * 0.35), '#2b4c78', 1);
  }

  // =================================================================================================
  // BUILDINGS
  // =================================================================================================
  function chimney(g, x, y, rng) {
    shadowEll(g, x + 7, y + 2, 13, 4, 0.4);
    bricks(g, x - 7, y - 26, 14, 28, '#7d5a48', rng, 5, 7, '#4f423b');
    g.fillStyle = LG(g, x - 7, 0, x + 7, 0, [[0, 'rgba(255,230,200,0.12)'], [1, 'rgba(0,0,0,0.3)']]); g.fillRect(x - 7, y - 26, 14, 28);
    g.fillStyle = '#3a3330'; g.fillRect(x - 9, y - 31, 18, 5);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x - 9, y - 31, 18, 1);
    g.fillStyle = '#121010'; g.fillRect(x - 5, y - 32, 10, 1.6);
  }
  const lanternLights = (arr, r = 84) => arr.map((l) => LT(round(l.x), round(l.y), l.lr || r, l.lc || LANTERN_LIGHT, 0.35));

  // ---- 九份 house: wooden walls, black tar-paper roof, red lanterns -------------------------------
  const JF = [
    { wall: '#5d3b2a', mat: 'clap', trim: '#2a1a11', curtain: '#2b3b68', roof: '#2a2b31' },
    { wall: '#6e4a31', mat: 'planks', stone: true, trim: '#2f1e14', curtain: '#7a2a24', roof: '#2d2c30' },
    { wall: '#4e675c', mat: 'clap', trim: '#26302b', curtain: '#8a3424', roof: '#28292f' },
    { wall: '#b39a74', mat: 'plaster', stone: true, trim: '#3a2618', curtain: '#2b3b68', roof: '#2b2c33' },
  ];
  defObj('house_jiufen', {
    w: 4, h: 3, door: 1, nv: 4, salt: 21,
    pad: (L) => [28, max(34, 44 - L.ridge), 44, 22],
    layout(L) {
      const { W, H } = L;
      L.wallTop = H - 108; L.eave = L.wallTop + 6; L.ridge = min(16, L.eave - 64);
      L.dx = L.door >= 0 ? L.door * T + 10 : -1;
      L.lan = []; L.win = [];
      if (L.door >= 0) { const c = L.door * T + 32; L.lan.push({ x: c - 31, y: L.eave + 21, r: 7.5 }, { x: c + 31, y: L.eave + 21, r: 7.5 }); }
      else L.lan.push({ x: W / 2, y: L.eave + 21, r: 8 });
      for (let c = 0; c < L.w; c++) if (c !== L.door) L.win.push({ x: c * T + 14, y: L.wallTop + 32, w: 36, h: 30 });
      L.chim = (L.v % 2 === 0) && L.w >= 3;
    },
    paint(g, L, o, rng) {
      const P = JF[L.v], { W, H } = L, wy = L.wallTop, wh = H - wy;
      buildingShadow(g, 0, H, W, H - L.ridge);
      if (P.mat === 'clap') clapboard(g, 0, wy, W, wh, P.wall, rng);
      else if (P.mat === 'planks') planks(g, 0, wy, W, wh, P.wall, rng);
      else plaster(g, 0, wy, W, wh, P.wall, rng);
      if (P.stone) stones(g, 0, H - 24, W, 24, rng, '#8b877b', 11);
      grime(g, 0, wy, W, wh, rng, 0.22);
      woodPost(g, 0, wy, 7, wh, P.trim); woodPost(g, W - 7, wy, 7, wh, P.trim);
      for (let c = 1; c < L.w; c++) if (c !== L.door && c !== L.door + 1) woodPost(g, c * T - 2.5, wy, 5, wh - (P.stone ? 24 : 0), P.trim);
      g.fillStyle = P.trim; g.fillRect(0, H - (P.stone ? 28 : 9), W, 5);
      g.fillRect(0, wy + 20, W, 4);
      for (const wn of L.win) windowLat(g, wn.x, wn.y, wn.w, wn.h, L.lit, { frame: P.trim, pattern: L.v === 3 ? 'shoji' : 'grid' });
      // small life details under windows: potted plant / bucket
      L.win.forEach((wn, i) => {
        if ((i + L.v) % 2) return;
        const bx = wn.x + 8 + (i % 2) * 14, by = H - 2;
        shadowEll(g, bx + 1, by, 10, 3, 0.4);
        g.fillStyle = LG(g, bx - 7, 0, bx + 7, 0, [[0, '#a8573a'], [1, '#6a2f1e']]);
        g.beginPath(); g.moveTo(bx - 7, by - 12); g.lineTo(bx + 7, by - 12); g.lineTo(bx + 5, by); g.lineTo(bx - 5, by); g.closePath(); g.fill();
        for (let k = 0; k < 7; k++) { ell(g, bx - 6 + rng() * 12, by - 15 - rng() * 8, 3.5, 2, rng() * 3); g.fillStyle = mix('#3f7a3a', '#7fb055', rng()); g.fill(); }
      });
      if (L.door >= 0) doorway(g, L.dx, H - 80, 44, 80, { curtain: P.curtain, lit: L.lit, frame: P.trim, glyph: L.v === 2 ? '湯' : null });
      wallAO(g, 0, H, W);
      eaveShadow(g, 0, L.eave, W, 18);
      const S = roof(g, { x0: -12, x1: W + 12, ridge: L.ridge, eave: L.eave, kind: 'tar', base: P.roof, back: 9 }, rng);
      if (L.chim) chimney(g, S.X(0.8), S.at(0.8, 0.4), rng);
      if (L.text && L.door >= 0) plaque(g, L.dx, H - 99, 44, 15, L.text, { bg: '#3a2a1c', fg: '#f3e2bd', rim: '#1e140d' });
      for (const ln of L.lan) lantern(g, ln.x, ln.y, ln.r, { from: L.eave, lit: L.lit });
    },
    lights(L) {
      if (!L.lit) return [];
      const out = lanternLights(L.lan, 84);
      for (const w of L.win) out.push(LT(w.x + w.w / 2, w.y + w.h / 2, 60, WINDOW_LIGHT, 0.08));
      if (L.door >= 0) out.push(LT(L.dx + 22, L.H - 18, 56, WINDOW_LIGHT, 0.1));
      return out;
    },
  });

  // ---- 九份 茶樓 teahouse: multi-storey, balcony, many red lanterns ------------------------------------
  defObj('teahouse', {
    w: 5, h: 4, fixed: true, door: 2, pad: [36, 116, 52, 24],
    layout(L) {
      const { W, H } = L;
      L.gTop = H - 112; L.pentEave = L.gTop + 8; L.pentRidge = L.gTop - 32;
      L.uTop = 18; L.uBot = L.gTop - 20; L.eave = 30; L.ridge = -54;
      L.dx = L.door * T + 10;
      L.uwin = [0, 1, 2, 3].map((i) => ({ x: 42 + i * 68, y: 44, w: 50, h: 40 }));
      L.gwin = [];
      for (let c = 0; c < L.w; c++) if (c !== L.door) L.gwin.push({ x: c * T + 12, y: L.gTop + 34, w: 40, h: 32 });
      L.lan = [];
      for (let i = 0; i < 8; i++) L.lan.push({ x: 20 + i * 40, y: L.eave + 19, r: 8 });
      const dc = L.door * T + 32;
      for (let i = 0; i < 8; i++) { const x = 20 + i * 40; if (abs(x - dc) < 34) continue; L.lan.push({ x, y: L.pentEave + 21, r: 8.5 }); }
      L.dwin = { x: W / 2, y: -8 };
    },
    paint(g, L, o, rng) {
      const { W, H } = L;
      buildingShadow(g, 0, H, W, H + 50);
      // upper storey
      clapboard(g, 8, L.uTop, W - 16, L.uBot - L.uTop, '#6b4532', rng);
      grime(g, 8, L.uTop, W - 16, L.uBot - L.uTop, rng, 0.18);
      for (const x of [8, 100, 168, 236, W - 16]) woodPost(g, x - (x > 8 && x < W - 16 ? 2 : 0), L.uTop, 8, L.uBot - L.uTop, '#2c1a10');
      for (const w of L.uwin) windowLat(g, w.x, w.y, w.w, w.h, L.lit, { frame: '#2c1a10', pattern: 'shoji' });
      eaveShadow(g, 8, L.eave, W - 16, 16);
      // balcony
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(4, L.uBot - 26, W - 8, 30);
      g.fillStyle = '#2a1a12'; g.fillRect(2, L.uBot - 4, W - 4, 7);
      g.fillStyle = 'rgba(255,220,180,0.2)'; g.fillRect(2, L.uBot - 4, W - 4, 1);
      for (let x = 6; x < W - 4; x += 6.5) {
        g.fillStyle = LG(g, x, 0, x + 3, 0, [[0, '#c0453a'], [1, '#6e1c16']]); g.fillRect(x, L.uBot - 22, 3, 18);
      }
      g.fillStyle = LG(g, 0, L.uBot - 26, 0, L.uBot - 20, [[0, '#d0574a'], [1, '#701d17']]); g.fillRect(2, L.uBot - 26, W - 4, 5);
      plaque(g, W / 2 - 54, L.uBot - 30, 108, 24, L.text || '燈火茶樓', { bg: '#1b1a22', fg: '#f2cb68' });
      // ground floor
      planks(g, 0, L.gTop, W, H - L.gTop, '#4e2e20', rng, 12);
      stones(g, 0, H - 16, W, 16, rng, '#7f7a70', 8);
      grime(g, 0, L.gTop, W, H - L.gTop - 16, rng, 0.2);
      for (let c = 0; c <= L.w; c++) woodPost(g, clamp(c * T - 4, 0, W - 8), L.gTop, 8, H - L.gTop - 14, '#24160d');
      for (const w of L.gwin) windowLat(g, w.x, w.y, w.w, w.h, L.lit, { frame: '#24160d', pattern: 'diamond' });
      doorway(g, L.dx, H - 82, 44, 82, { curtain: '#2b3b68', lit: L.lit, frame: '#24160d', glyph: '茶' });
      wallAO(g, 0, H, W);
      eaveShadow(g, 0, L.pentEave, W, 18);
      // pent roof (腰簷)
      roof(g, { x0: -12, x1: W + 12, ridge: L.pentRidge, eave: L.pentEave, kind: 'tar', base: '#2a2a30', back: 0, ridgeStyle: 'none', batten: 18 }, rng);
      g.fillStyle = '#1a1612'; g.fillRect(-12, L.pentRidge - 2, W + 24, 4);
      // top roof with a front gable (破風)
      const S = roof(g, { x0: -18, x1: W + 18, ridge: L.ridge, eave: L.eave, kind: 'tar', base: '#2a2b31', back: 10 }, rng);
      const cx = W / 2, by = L.eave - 2, ap = L.ridge + 6, hw = 64;
      g.save();
      poly(g, [[cx - hw + 12, by], [cx, ap + 12], [cx + hw - 12, by]]); g.clip();
      planks(g, cx - hw, ap, hw * 2, by - ap, '#5a3826', rng, 8);
      g.fillStyle = LG(g, 0, ap, 0, by, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0.1)']]); g.fillRect(cx - hw, ap, hw * 2, by - ap);
      g.restore();
      // round lit window in gable
      ell(g, cx, L.dwin.y, 11, 11); fs(g, '#2a1a10');
      ell(g, cx, L.dwin.y, 8.5, 8.5);
      fs(g, L.lit ? RG(g, cx, L.dwin.y, 9, [[0, '#ffe9b0'], [1, '#f08a3a']]) : '#26252c');
      g.strokeStyle = '#2a1a10'; g.lineWidth = 1.2; line(g, cx - 8, L.dwin.y, cx + 8, L.dwin.y); line(g, cx, L.dwin.y - 8, cx, L.dwin.y + 8);
      // gable roof boards
      for (const sgn of [-1, 1]) {
        g.beginPath(); g.moveTo(cx, ap); g.lineTo(cx + sgn * hw, by + 4);
        g.strokeStyle = '#141418'; g.lineWidth = 15; g.stroke();
        g.strokeStyle = '#2e2f36'; g.lineWidth = 11; g.stroke();
        g.beginPath(); g.moveTo(cx, ap + 7); g.lineTo(cx + sgn * (hw - 6), by + 7);
        g.strokeStyle = '#d9cdb1'; g.lineWidth = 3.4; g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, ap + 9.5); g.lineTo(cx + sgn * (hw - 6), by + 9.5); g.stroke();
      }
      // 懸魚 hanging ornament
      g.beginPath(); g.moveTo(cx - 5, ap + 8); g.lineTo(cx + 5, ap + 8); g.lineTo(cx + 3, ap + 20); g.lineTo(cx, ap + 24); g.lineTo(cx - 3, ap + 20); g.closePath();
      fs(g, '#e2d6b8', '#6a5a40', 1);
      // vertical hanging sign off the left corner
      g.fillStyle = '#20140c'; g.fillRect(-16, 46, 20, 3);
      vplaque(g, -16, 52, 18, 64, '茶館', { bg: '#a3241e', fg: '#ffe7b0', rim: '#1d120c' });
      for (const ln of L.lan) lantern(g, ln.x, ln.y, ln.r, { from: ln.y < L.gTop ? L.eave + 2 : L.pentEave + 2, lit: L.lit, glyph: ln.y < L.gTop ? null : null });
      void S;
    },
    lights(L) {
      if (!L.lit) return [];
      const out = lanternLights(L.lan, 90);
      for (const w of L.uwin) out.push(LT(w.x + w.w / 2, w.y + w.h / 2, 70, WINDOW_LIGHT, 0.06));
      for (const w of L.gwin) out.push(LT(w.x + w.w / 2, w.y + w.h / 2, 56, WINDOW_LIGHT, 0.08));
      out.push(LT(L.dx + 22, L.H - 18, 60, WINDOW_LIGHT, 0.1), LT(L.dwin.x, L.dwin.y, 40, WINDOW_LIGHT, 0.06));
      return out;
    },
  });

  // ---- 閩南 red-brick house with swallowtail ridge 燕尾脊 -------------------------------------------
  defObj('house_minnan', {
    w: 5, h: 3, door: (w) => floor(w / 2), nv: 2, salt: 23,
    pad: (L) => [40, max(70, 60 - L.ridge + 30), 52, 22],
    layout(L) {
      const { W, H } = L;
      L.wallTop = H - 104; L.eave = L.wallTop + 8; L.ridge = min(26, L.eave - 62);
      L.dx = L.door >= 0 ? L.door * T + 10 : -1;
      L.win = []; L.lan = [];
      for (let c = 0; c < L.w; c++) if (c !== L.door) L.win.push({ x: c * T + 13, y: L.wallTop + 40, w: 38, h: 30 });
      if (L.door >= 0) { const c = L.door * T + 32; L.lan.push({ x: c - 34, y: L.eave + 22, r: 8.5 }, { x: c + 34, y: L.eave + 22, r: 8.5 }); }
    },
    paint(g, L, o, rng) {
      const { W, H } = L, wy = L.wallTop;
      buildingShadow(g, 0, H, W, H - L.ridge);
      bricks(g, 0, wy, W, H - wy - 18, L.v ? '#b85a3e' : '#a8462f', rng);
      stones(g, 0, H - 18, W, 18, rng, '#a5a094', 9, 0.15);
      // granite corner quoins
      for (const qx of [0, W - 10]) for (let y = wy + 14; y < H - 18; y += 14) {
        g.fillStyle = LG(g, qx, 0, qx + 10, 0, [[0, '#bdb8ab'], [1, '#8f8a7e']]); g.fillRect(qx, y, 10, 12);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(qx, y + 12, 10, 1.5);
      }
      grime(g, 0, wy, W, H - wy, rng, 0.16);
      // 水車堵 painted frieze under the eave
      g.fillStyle = '#e8dcc2'; g.fillRect(0, wy + 10, W, 14);
      for (let x = 6; x < W - 14; x += 26) {
        g.fillStyle = ['#3d8a7a', '#c9453a', '#2f5e9a', '#d9a23a'][floor(x / 26) % 4];
        rr(g, x, wy + 13, 20, 8, 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 3, wy + 14, 6, 1.4);
      }
      g.fillStyle = 'rgba(80,40,20,0.6)'; g.fillRect(0, wy + 23, W, 1.5);
      for (const wn of L.win) {
        g.fillStyle = '#9b968a'; g.fillRect(wn.x - 6, wn.y - 6, wn.w + 12, wn.h + 12);
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(wn.x - 6, wn.y - 6, wn.w + 12, 1.5);
        windowLat(g, wn.x, wn.y, wn.w, wn.h, false, { frame: '#77736a', pattern: 'bars', spill: false });
      }
      if (L.door >= 0) {
        const dx = L.dx;
        doorway(g, dx, H - 84, 44, 84, { curtain: false, lit: L.lit, frame: '#3a1a12' });
        // open door leaves
        for (const sx of [dx + 1, dx + 35]) {
          g.fillStyle = LG(g, sx, 0, sx + 8, 0, [[0, '#7a2a1c'], [1, '#4a160e']]); g.fillRect(sx, H - 82, 8, 79);
        }
        // couplets 春聯 & 橫批
        for (const cx of [dx - 13, dx + 57]) {
          g.fillStyle = '#c4281f'; g.fillRect(cx - 4.5, H - 80, 9, 54);
          g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(cx - 4.5, H - 80, 1, 54);
          vchars(g, cx < dx ? '春滿門' : '福臨家', cx, H - 53, 8, '#1a0c0a', 1.9);
        }
        g.fillStyle = '#c4281f'; g.fillRect(dx + 2, H - 96, 40, 9);
        hchars(g, '吉祥如意', dx + 22, H - 91.5, 7, '#1a0c0a', 1.25);
      }
      wallAO(g, 0, H, W);
      eaveShadow(g, 0, L.eave, W, 16);
      const S = roof(g, { x0: -10, x1: W + 10, ridge: L.ridge, eave: L.eave, kind: 'tile', base: '#b14b34', lift: 6, sag: 3, back: 7, ridgeStyle: 'none' }, rng);
      const rc = '#8a3426';
      ridgeBand(g, S, 0.04, 0.96, 10, rc, null);
      g.beginPath(); for (let i = 0; i <= 30; i++) { const u = lerp(0.05, 0.95, i / 30); if (i) g.lineTo(S.X(u), S.rY(u) - 2.5); else g.moveTo(S.X(u), S.rY(u) - 2.5); }
      g.strokeStyle = 'rgba(240,226,200,0.8)'; g.lineWidth = 1.6; g.stroke();
      swallowTail(g, S.X(0.04), S.rY(0.04) - 2.5, -1, 30, rc, 10);
      swallowTail(g, S.X(0.96), S.rY(0.96) - 2.5, 1, 30, rc, 10);
      for (const ln of L.lan) lantern(g, ln.x, ln.y, ln.r, { from: L.eave + 2, glyph: '福', lit: L.lit });
    },
    lights(L) {
      if (!L.lit) return [];
      const out = lanternLights(L.lan, 88);
      if (L.door >= 0) out.push(LT(L.dx + 22, L.H - 18, 60, WINDOW_LIGHT, 0.1));
      return out;
    },
  });

  // ---- 亭仔腳 arcaded shophouse ------------------------------------------------------------------------
  const SHOP = ['#dccdad', '#a9c4b3', '#dcaa95', '#c4bfd6'];
  const SHOP_NAMES = ['金源號', '福春行', '永安堂', '和記'];
  defObj('shophouse', {
    w: 4, h: 3, door: 1, nv: 4, salt: 27, resize: 'w', pad: [26, 46, 44, 22],
    layout(L) {
      const { W, H } = L;
      L.arcTop = H - 86; L.top = 20;
      L.lan = [];
      for (let c = 0; c < L.w; c++) if (c !== L.door) L.lan.push({ x: c * T + 32, y: L.arcTop + 34, r: 7 });
    },
    paint(g, L, o, rng) {
      const { W, H } = L, col = SHOP[L.v], at = L.arcTop;
      buildingShadow(g, 0, H, W, H + 10);
      // roof peeking behind parapet
      roof(g, { x0: -6, x1: W + 6, ridge: -14, eave: L.top + 6, kind: 'tile', base: '#9e4a35', back: 4, ridgeStyle: 'plain' }, rng);
      // upper facade
      plaster(g, 0, L.top, W, at - L.top, col, rng);
      grime(g, 0, L.top, W, at - L.top, rng, 0.16);
      for (let c = 0; c <= L.w; c++) {
        const x = clamp(c * T - 5, 0, W - 10);
        g.fillStyle = LG(g, x, 0, x + 10, 0, [[0, shade(col, 0.2)], [1, shade(col, -0.18)]]); g.fillRect(x, L.top, 10, at - L.top);
        g.fillStyle = shade(col, 0.25); g.fillRect(x - 2, L.top + 6, 14, 4);
      }
      for (let c = 0; c < L.w; c++) {
        const x = c * T + 19, y = L.top + 22, w = 26, h = 42;
        // shutters
        g.fillStyle = '#3f6e5a'; g.fillRect(x - 11, y + 4, 10, h - 4); g.fillRect(x + w + 1, y + 4, 10, h - 4);
        g.strokeStyle = '#26473a'; g.lineWidth = 0.8;
        for (let k = y + 7; k < y + h; k += 3) { line(g, x - 10, k, x - 2, k); line(g, x + w + 2, k, x + w + 10, k); }
        // arched glazing
        g.save(); g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(x + w / 2, y + w / 2, w / 2, PI, 0); g.lineTo(x + w, y + h); g.closePath();
        g.fillStyle = shade(col, -0.45); g.lineWidth = 5; g.strokeStyle = shade(col, 0.3); g.stroke();
        g.fillStyle = L.lit ? LG(g, x, y, x, y + h, [[0, '#ffe2a0'], [1, '#e8873e']]) : '#2b2b33'; g.fill();
        g.clip();
        g.strokeStyle = '#3a2a1e'; g.lineWidth = 1.2;
        line(g, x + w / 2, y, x + w / 2, y + h); for (let k = y + 16; k < y + h; k += 9) line(g, x, k, x + w, k);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y, w, 8);
        g.restore();
        g.fillStyle = shade(col, 0.35); g.fillRect(x + w / 2 - 3, y - 4, 6, 6); // keystone
        g.fillStyle = shade(col, -0.2); g.fillRect(x - 4, y + h, w + 8, 3);
      }
      // floor cornice
      g.fillStyle = shade(col, 0.22); g.fillRect(0, at - 10, W, 6);
      g.fillStyle = shade(col, -0.35); g.fillRect(0, at - 4, W, 4);
      // parapet with central crest
      const pc = shade(col, 0.1);
      g.beginPath(); g.moveTo(0, L.top + 2); g.lineTo(0, 4); g.lineTo(W * 0.3, 4); g.lineTo(W * 0.33, -6);
      g.quadraticCurveTo(W / 2, -30, W * 0.67, -6); g.lineTo(W * 0.7, 4); g.lineTo(W, 4); g.lineTo(W, L.top + 2); g.closePath();
      fs(g, LG(g, 0, -24, 0, L.top, [[0, shade(pc, 0.12)], [1, shade(pc, -0.08)]]), shade(col, -0.45), 1.4);
      for (const [a, b] of [[6, W * 0.3 - 4], [W * 0.7 + 4, W - 6]]) {
        g.fillStyle = shade(col, -0.55); g.fillRect(a, 8, b - a, 9);
        for (let x = a + 3; x < b - 2; x += 7) { g.fillStyle = shade(col, 0.15); rr(g, x, 8, 4, 9, 2); g.fill(); }
      }
      g.fillStyle = shade(col, 0.3); g.fillRect(0, L.top - 2, W, 3); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, L.top + 1, W, 2);
      plaque(g, W / 2 - 46, -8, 92, 20, L.text || SHOP_NAMES[L.v], { bg: '#f1e6c9', fg: '#8a2418', rim: '#6c5434' });
      for (const sx of [-1, 1]) { ell(g, W / 2 + sx * 54, 2, 4, 4); fs(g, ['#c9453a', '#3d8a7a'][sx > 0 ? 1 : 0], 'rgba(0,0,0,0.4)', 0.8); }
      ell(g, W / 2, -20, 4, 4); fs(g, '#d9a23a', 'rgba(0,0,0,0.4)', 0.8);
      // arcade interior (deep shadow)
      g.fillStyle = LG(g, 0, at, 0, H, [[0, '#1a1210'], [1, '#3a2a22']]); g.fillRect(0, at, W, H - at);
      planks(g, 0, at + 14, W, H - at - 22, '#3d2a1e', rng, 12);
      g.fillStyle = 'rgba(10,6,6,0.45)'; g.fillRect(0, at + 14, W, H - at - 22);
      for (let c = 0; c < L.w; c++) {
        if (c === L.door) doorway(g, c * T + 14, H - 70, 36, 62, { curtain: '#2b3b68', lit: L.lit, frame: '#1e140e', glyph: '店' });
        else {
          windowLat(g, c * T + 13, H - 62, 38, 26, L.lit, { frame: '#22160f', pattern: 'grid', spill: true });
          for (let k = 0; k < 3; k++) { const jx = c * T + 18 + k * 13; ell(g, jx, H - 24, 5, 6); fs(g, ['#6a4a2a', '#4a5a6a', '#7a3a2a'][(k + c) % 3], 'rgba(0,0,0,0.5)', 0.8); }
          g.fillStyle = '#2a1a10'; g.fillRect(c * T + 10, H - 19, 44, 4);
        }
      }
      g.fillStyle = LG(g, 0, H - 8, 0, H, [[0, '#6a3a2a'], [1, '#8a4a34']]); g.fillRect(0, H - 8, W, 8);
      g.fillStyle = LG(g, 0, at, 0, at + 40, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(0, at, W, 40);
      // arcade front plane with arches (evenodd)
      g.beginPath(); g.rect(0, at, W, H - at);
      for (let c = 0; c < L.w; c++) {
        const x0 = c * T + 7 + (c === 0 ? 3 : 0), x1 = (c + 1) * T - 7 - (c === L.w - 1 ? 3 : 0), sp = at + 26;
        g.moveTo(x0, H); g.lineTo(x0, sp); g.quadraticCurveTo((x0 + x1) / 2, at + 6, x1, sp); g.lineTo(x1, H); g.closePath();
      }
      g.fillStyle = LG(g, 0, at, 0, H, [[0, shade(col, 0.05)], [1, shade(col, -0.15)]]); g.fill('evenodd');
      for (let c = 0; c <= L.w; c++) {
        const x = c === 0 ? 0 : c === L.w ? W - 10 : c * T - 7, w = c === 0 || c === L.w ? 10 : 14;
        g.fillStyle = LG(g, x, 0, x + w, 0, [[0, shade(col, 0.22)], [0.4, col], [1, shade(col, -0.3)]]); g.fillRect(x, at + 20, w, H - at - 20);
        g.fillStyle = shade(col, -0.4); g.fillRect(x - 1, H - 10, w + 2, 10);
        g.fillStyle = shade(col, 0.3); g.fillRect(x - 1, H - 10, w + 2, 1.5);
      }
      g.fillStyle = shade(col, 0.25); g.fillRect(0, at, W, 3);
      wallAO(g, 0, H, W, 10);
      for (const ln of L.lan) lantern(g, ln.x, ln.y, ln.r, { from: L.arcTop + 12, lit: L.lit });
    },
    lights(L) {
      if (!L.lit) return [];
      const out = lanternLights(L.lan, 70);
      for (let c = 0; c < L.w; c++) out.push(LT(c * T + 32, L.H - 40, 54, WINDOW_LIGHT, 0.08), LT(c * T + 32, L.top + 44, 52, WINDOW_LIGHT, 0.06));
      return out;
    },
  });

  // ---- big temple: dragons on the ridge, 門神 doors, carved stone -----------------------------------
  function doorGod(g, x, y, w, h, flip, faceCol) {
    g.fillStyle = LG(g, x, 0, x + w, 0, [[0, '#8e2219'], [1, '#6a1610']]); g.fillRect(x, y, w, h);
    g.strokeStyle = '#d6a542'; g.lineWidth = 1.2; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    const cx = x + w / 2, s = w / 26;
    g.save(); g.translate(cx, y + h * 0.5); if (flip) g.scale(-1, 1);
    // armour body
    g.beginPath(); g.moveTo(-9 * s, -10 * s); g.lineTo(9 * s, -10 * s); g.lineTo(11 * s, 22 * s); g.lineTo(-11 * s, 22 * s); g.closePath();
    fs(g, LG(g, 0, -10 * s, 0, 22 * s, [[0, '#2f6e8a'], [1, '#1d4a5e']]), '#10242e', 1);
    g.fillStyle = '#e2b24a'; g.fillRect(-9 * s, -2 * s, 18 * s, 3 * s); g.fillRect(-2 * s, -10 * s, 4 * s, 32 * s);
    ell(g, 0, 8 * s, 5 * s, 5 * s); fs(g, '#d9443a', '#6a1610', 0.8);
    // head
    ell(g, 0, -17 * s, 6.5 * s, 7.5 * s); fs(g, faceCol, shade(faceCol, -0.5), 1);
    g.fillStyle = '#16100e'; g.beginPath(); g.moveTo(-6 * s, -14 * s); g.quadraticCurveTo(0, -2 * s, 6 * s, -14 * s); g.quadraticCurveTo(0, -9 * s, -6 * s, -14 * s); g.fill();
    g.fillStyle = '#fff'; g.fillRect(-4 * s, -19 * s, 2.6 * s, 1.6 * s); g.fillRect(1.4 * s, -19 * s, 2.6 * s, 1.6 * s);
    g.beginPath(); g.moveTo(-8 * s, -21 * s); g.quadraticCurveTo(0, -32 * s, 8 * s, -21 * s); g.closePath(); fs(g, '#e2b24a', '#7a5a1a', 0.8);
    g.fillStyle = '#d9443a'; ell(g, 0, -29 * s, 1.8 * s, 3 * s); g.fill();
    // weapon
    g.strokeStyle = '#e8d6a0'; g.lineWidth = 1.6 * s; line(g, 11 * s, -30 * s, 11 * s, 24 * s);
    g.restore();
  }
  defObj('temple', {
    w: 7, h: 5, fixed: true, door: 3, pad: [50, 160, 64, 28],
    layout(L) {
      const { W, H } = L;
      L.fTop = H - 124; L.fb = H - 22;
      L.dx = L.door * T + 8; L.dw = 48;
      const dc = L.dx + 24;
      L.big = [{ x: dc - 42, y: L.fTop + 42, r: 13 }, { x: dc + 42, y: L.fTop + 42, r: 13 }];
      L.small = [40, 132, 316, 408].map((x) => ({ x, y: L.fTop + 30, r: 7 }));
    },
    paint(g, L, o, rng) {
      const { W, H } = L, fy = L.fTop, fb = L.fb;
      const deco = ['#3fb08a', '#f2c94c', '#e05a3a', '#4a8fd0', '#f6efe0', '#9a5ad0'];
      buildingShadow(g, 0, H, W, H + 110);
      // main hall roof (behind)
      const M = roof(g, { x0: -28, x1: W + 28, ridge: 34, eave: 168, lift: 16, sag: 6, back: 12, kind: 'tile', base: '#c4632f', tileW: 10, ridgeStyle: 'none' }, rng);
      // descending side ridges 垂脊
      for (const [ua, ub] of [[0.06, 0.0], [0.94, 1.0]]) {
        g.beginPath(); g.moveTo(M.X(ua), M.rY(ua)); g.quadraticCurveTo(M.X((ua + ub) / 2), M.at((ua + ub) / 2, 0.5), M.X(ub) + (ub ? -4 : 4), M.eY(ub) - 6);
        g.strokeStyle = '#173040'; g.lineWidth = 6.5; g.stroke();
        g.strokeStyle = '#2f5e7a'; g.lineWidth = 4.5; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke();
      }
      ridgeBand(g, M, 0.05, 0.95, 16, '#2f5e7a', deco);
      swallowTail(g, M.X(0.05), M.rY(0.05) - 6, -1, 48, '#2f5e7a', 16);
      swallowTail(g, M.X(0.95), M.rY(0.95) - 6, 1, 48, '#2f5e7a', 16);
      const ry = M.rY(0.5) - 14;
      // flower ornaments along ridge
      for (const u of [0.14, 0.86]) { const x = M.X(u), y = M.rY(u) - 14; for (let k = 0; k < 5; k++) { ell(g, x + cos(k * 1.26) * 4, y - 3 + sin(k * 1.26) * 4, 3, 3); fs(g, deco[k % 4], 'rgba(0,0,0,0.35)', 0.6); } }
      dragon(g, W / 2 - 22, ry - 4, 1, 120, 1.15);
      dragon(g, W / 2 + 22, ry - 4, -1, 120, 1.15);
      g.fillStyle = '#7a5a2a'; g.fillRect(W / 2 - 4, ry - 10, 8, 12);
      flamingPearl(g, W / 2, ry - 16, 7);
      // facade
      stones(g, 0, fy, W, fb - fy, rng, '#aaa69c', 15, 0.1);
      g.fillStyle = 'rgba(255,250,235,0.08)'; g.fillRect(0, fy, W, fb - fy);
      // centre bay red wooden wall
      g.fillStyle = LG(g, 0, fy, 0, fb, [[0, '#8a241c'], [1, '#6a1a14']]); g.fillRect(160, fy, 128, fb - fy);
      // side bays: 龍虎窗 round windows + carved panels
      for (const [cx, tiger] of [[88, true], [360, false]]) {
        const wy = fy + 44;
        ell(g, cx, wy, 26, 26); fs(g, LG(g, 0, wy - 26, 0, wy + 26, [[0, '#d2cec2'], [1, '#8d897e']]), '#5e5a52', 1.5);
        ell(g, cx, wy, 19, 19); fs(g, '#1d1a1a');
        g.save(); ell(g, cx, wy, 19, 19); g.clip();
        for (let k = -3; k <= 3; k++) {
          const bx = cx + k * 5.2;
          g.fillStyle = LG(g, bx - 2, 0, bx + 2, 0, [[0, '#c9c7bc'], [1, '#6c6e66']]); g.fillRect(bx - 2, wy - 20, 4, 40);
          g.fillStyle = 'rgba(30,30,28,0.55)'; g.fillRect(bx - 2, wy - 6, 4, 1.2); g.fillRect(bx - 2, wy + 7, 4, 1.2);
        }
        g.restore();
        g.strokeStyle = tiger ? '#c48a3a' : '#3f9a7a'; g.lineWidth = 2;
        g.beginPath(); g.arc(cx, wy, 23, PI * 0.8, PI * 2.2); g.stroke();
        // carved stone panel with relief
        const py = fy + 78;
        rr(g, cx - 40, py, 80, 34, 2); fs(g, LG(g, 0, py, 0, py + 34, [[0, '#c7c3b7'], [1, '#97938a']]), '#6a665d', 1.2);
        rr(g, cx - 35, py + 5, 70, 24, 2); fs(g, 'rgba(60,56,50,0.25)');
        g.strokeStyle = 'rgba(70,64,56,0.6)'; g.lineWidth = 1.2;
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx - 24 + k * 16, py + 17, 5, PI * (0.2 + k * 0.3), PI * (1.7 + k * 0.3)); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.8;
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx - 24.6 + k * 16, py + 16.4, 5, PI * (1.0 + k * 0.3), PI * (1.4 + k * 0.3)); g.stroke(); }
      }
      // painted beams 彩繪
      g.fillStyle = '#21485a'; g.fillRect(0, fy, W, 16);
      for (let x = 0; x < W; x += 32) {
        g.fillStyle = '#2f7a6a'; rr(g, x + 3, fy + 3, 26, 10, 4); g.fill();
        g.fillStyle = '#e2b24a'; ell(g, x + 16, fy + 8, 4, 3); g.fill();
        g.fillStyle = '#c9453a'; ell(g, x + 16, fy + 8, 1.6, 1.4); g.fill();
      }
      g.fillStyle = '#e2b24a'; g.fillRect(0, fy + 15, W, 2);
      // door & leaves
      const dx = L.dx, dw = L.dw;
      doorway(g, dx, fy + 34, dw, fb - fy - 34, { curtain: false, lit: L.lit, frame: '#3a120e' });
      if (L.lit) {
        // altar silhouette & deity glow inside
        g.save(); g.beginPath(); g.rect(dx, fy + 34, dw, fb - fy - 34); g.clip();
        g.fillStyle = RG(g, dx + dw / 2, fb - 40, 26, [[0, 'rgba(255,214,120,0.75)'], [1, 'rgba(255,170,80,0)']]); g.fillRect(dx, fy + 34, dw, fb - fy - 34);
        ell(g, dx + dw / 2, fb - 42, 6, 9); fs(g, '#d9a33a'); ell(g, dx + dw / 2, fb - 53, 4, 4); fs(g, '#e8c070');
        g.fillStyle = '#7a1c14'; g.fillRect(dx + 4, fb - 26, dw - 8, 7);
        g.fillStyle = '#e2b24a'; g.fillRect(dx + 4, fb - 26, dw - 8, 1.4);
        for (const cx of [dx + 9, dx + dw - 9]) { g.fillStyle = '#c42a1f'; g.fillRect(cx - 1.5, fb - 34, 3, 8); ell(g, cx, fb - 36, 1.6, 2.6); fs(g, '#ffe080'); }
        g.restore();
      }
      doorGod(g, dx - 27, fy + 36, 24, fb - fy - 38, false, '#e9b48c');
      doorGod(g, dx + dw + 3, fy + 36, 24, fb - fy - 38, true, '#c9563e');
      // pillars
      for (const px of [16, W - 16]) redPillar(g, px, fy + 14, fb, 14);
      for (const px of [160, 288]) {
        const x = px - 8;
        g.fillStyle = LG(g, x, 0, x + 16, 0, [[0, '#7d7a71'], [0.3, '#d2cec2'], [1, '#6d6a62']]); g.fillRect(x, fy + 14, 16, fb - fy - 14);
        // coiled dragon relief
        g.save(); g.beginPath(); g.rect(x, fy + 14, 16, fb - fy - 14); g.clip();
        for (let y = fy + 18; y < fb; y += 3) {
          const k = (y - fy) / 22;
          const xx = x + 8 + sin(k * PI) * 7;
          ell(g, xx, y, 3.2, 2.2); g.fillStyle = cos(k * PI) > 0 ? '#5f8f7e' : '#3d6458'; g.fill();
        }
        g.restore();
        g.fillStyle = '#e2b24a'; g.fillRect(x - 1, fy + 14, 18, 3);
        g.fillStyle = '#b7b3a7'; rr(g, x - 3, fb - 8, 22, 8, 2); g.fill();
      }
      plaque(g, L.door * T + 32 - 46, fy + 14, 92, 22, L.text || '靈安宮', { bg: '#1c2f5a', fg: '#f6d06a', rim: '#d6a542' });
      // platform & steps
      stones(g, -8, fb, W + 16, H - fb, rng, '#9e9a8e', 11, 0.1);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(-8, fb, W + 16, 2);
      const sx0 = L.door * T - 16, sx1 = L.door * T + 80;
      for (let k = 0; k < 3; k++) {
        const yy = fb + 2 + k * 7;
        g.fillStyle = shade('#b9b5aa', -k * 0.05); g.fillRect(sx0 - k * 4, yy, sx1 - sx0 + k * 8, 6);
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(sx0 - k * 4, yy, sx1 - sx0 + k * 8, 1.2);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(sx0 - k * 4, yy + 5, sx1 - sx0 + k * 8, 1.2);
      }
      wallAO(g, 0, fb, W, 14, 0.25);
      eaveShadow(g, 0, fy, W, 22, 0.55);
      // porch roof (full width) and raised centre roof 三川脊
      const P1 = roof(g, { x0: -18, x1: W + 18, ridge: 150, eave: 202, lift: 10, sag: 2, back: 0, kind: 'tile', base: '#c8662f', tileW: 9, ridgeStyle: 'none' }, rng);
      ridgeBand(g, P1, 0.03, 0.97, 10, '#2f5e7a', deco);
      swallowTail(g, P1.X(0.03), P1.rY(0.03) - 4, -1, 26, '#2f5e7a', 10);
      swallowTail(g, P1.X(0.97), P1.rY(0.97) - 4, 1, 26, '#2f5e7a', 10);
      eaveShadow(g, 140, 190, 168, 14, 0.5);
      const P2 = roof(g, { x0: 134, x1: 314, ridge: 120, eave: 190, lift: 9, sag: 2, back: 0, kind: 'tile', base: '#cf6d33', tileW: 9, ridgeStyle: 'none' }, rng);
      ridgeBand(g, P2, 0.05, 0.95, 10, '#2f5e7a', deco);
      swallowTail(g, P2.X(0.05), P2.rY(0.05) - 4, -1, 24, '#2f5e7a', 10);
      swallowTail(g, P2.X(0.95), P2.rY(0.95) - 4, 1, 24, '#2f5e7a', 10);
      dragon(g, W / 2 - 12, P2.rY(0.5) - 9, 1, 46, 0.6, { body: '#d9a23a', belly: '#fff0b0', fin: '#e05a3a', dark: '#5a3a10' });
      dragon(g, W / 2 + 12, P2.rY(0.5) - 9, -1, 46, 0.6, { body: '#d9a23a', belly: '#fff0b0', fin: '#e05a3a', dark: '#5a3a10' });
      flamingPearl(g, W / 2, P2.rY(0.5) - 16, 4);
      for (const ln of L.small) lantern(g, ln.x, ln.y, ln.r, { from: 200, lit: L.lit });
      for (const ln of L.big) lantern(g, ln.x, ln.y, ln.r, { from: 186, glyph: '平安'[L.big.indexOf(ln)], lit: L.lit });
    },
    lights(L) {
      if (!L.lit) return [];
      const out = lanternLights(L.big, 130).concat(lanternLights(L.small, 64));
      out.push(LT(L.dx + 24, L.fb - 30, 90, '#ffc070', 0.15));
      return out;
    },
  });

  // ---- 土地公廟 small shrine ---------------------------------------------------------------------------
  defObj('shrine_small', {
    w: 2, h: 2, fixed: true, pad: [26, 50, 34, 12],
    paint(g, L, o, rng) {
      const W = 128;
      shadowEll(g, 70, 122, 66, 12, 0.4);
      stones(g, 8, 106, 112, 20, rng, '#9a958a', 9, 0.3);
      g.fillStyle = '#bab5a8'; g.fillRect(8, 104, 112, 4); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(8, 104, 112, 1);
      bricks(g, 20, 56, 88, 48, '#a9442e', rng, 6, 14);
      grime(g, 20, 56, 88, 48, rng, 0.2);
      // niche
      g.save(); g.beginPath(); g.moveTo(42, 104); g.lineTo(42, 76); g.arc(64, 76, 22, PI, 0); g.lineTo(86, 104); g.closePath();
      g.fillStyle = '#7c7668'; g.lineWidth = 5; g.strokeStyle = '#8f897b'; g.stroke();
      g.fillStyle = LG(g, 0, 54, 0, 104, [[0, '#140c0a'], [1, '#4a2414']]); g.fill(); g.clip();
      g.fillStyle = RG(g, 64, 96, 30, [[0, 'rgba(255,170,80,0.7)'], [1, 'rgba(255,120,40,0)']]); g.fillRect(40, 54, 48, 52);
      // 土地公 statue
      g.beginPath(); g.moveTo(52, 104); g.quadraticCurveTo(52, 82, 64, 80); g.quadraticCurveTo(76, 82, 76, 104); g.closePath();
      fs(g, LG(g, 52, 0, 76, 0, [[0, '#f0c25a'], [1, '#9a6a1e']]), '#5a3a10', 0.8);
      g.fillStyle = '#a3241e'; g.fillRect(57, 88, 14, 3);
      ell(g, 64, 74, 6, 6.5); fs(g, '#d79a6a', '#6a3a1e', 0.8);
      g.beginPath(); g.moveTo(59, 76); g.quadraticCurveTo(64, 90, 69, 76); g.closePath(); fs(g, '#f4efe4');
      g.fillStyle = '#1c1414'; g.fillRect(57, 65, 14, 4); g.fillRect(53, 67, 22, 2);
      for (const cx of [48, 80]) { g.fillStyle = '#d2281e'; g.fillRect(cx - 2, 92, 4, 11); ell(g, cx, 89, 1.8, 3); fs(g, '#ffe27a'); }
      g.restore();
      // couplets
      for (const cx of [31, 97]) { g.fillStyle = '#c4281f'; g.fillRect(cx - 4, 64, 8, 36); vchars(g, cx < 64 ? '福德' : '正神', cx, 82, 7.5, '#1a0c0a', 2.1); }
      wallAO(g, 20, 104, 88, 10);
      eaveShadow(g, 20, 58, 88, 12);
      const S = roof(g, { x0: 8, x1: 120, ridge: 24, eave: 60, lift: 6, sag: 2, back: 5, kind: 'tile', base: '#b9573a', tileW: 8, ridgeStyle: 'none' }, rng);
      ridgeBand(g, S, 0.1, 0.9, 7, '#2f5e7a', ['#3fb08a', '#f2c94c', '#e05a3a', '#f6efe0']);
      swallowTail(g, S.X(0.1), S.rY(0.1) - 2, -1, 19, '#2f5e7a', 7);
      swallowTail(g, S.X(0.9), S.rY(0.9) - 2, 1, 19, '#2f5e7a', 7);
      flamingPearl(g, 64, S.rY(0.5) - 9, 3.5);
      plaque(g, 46, 50, 36, 11, L.text || '福德祠', { bg: '#1c2f5a', fg: '#f6d06a', rim: '#d6a542' });
      // incense burner on the platform
      g.fillStyle = '#3a2a1a'; g.fillRect(55, 116, 3, 6); g.fillRect(70, 116, 3, 6);
      ell(g, 64, 113, 12, 6); fs(g, LG(g, 52, 0, 76, 0, [[0, '#b0884a'], [1, '#5a3a1a']]), '#2a1a0a', 1);
      ell(g, 64, 109, 11, 3.2); fs(g, '#2a1e16', '#8a6a3a', 1);
      for (const k of [-3, 0, 3]) { g.strokeStyle = '#a8442e'; g.lineWidth = 1; line(g, 64 + k, 109, 64 + k * 1.4, 96); ell(g, 64 + k * 1.4, 96, 1, 1); fs(g, '#ff8a3a'); }
    },
    lights: () => [LT(64, 92, 72, '#ff7a34', 0.4)],
  });

  // ---- 石板屋 slate house ------------------------------------------------------------------------------
  defObj('slate_house', {
    w: 4, h: 3, door: 1, resize: 'w', pad: [26, 40, 40, 20],
    layout(L) { L.wallTop = L.H - 78; L.eave = L.wallTop + 6; L.ridge = L.H - 166; L.dx = L.door >= 0 ? L.door * T + 12 : -1; },
    paint(g, L, o, rng) {
      const { W, H } = L, wy = L.wallTop;
      buildingShadow(g, 0, H, W, H - L.ridge);
      slabs(g, 0, wy, W, H - wy, rng, '#6f706b', 6);
      for (const qx of [0, W - 12]) stones(g, qx, wy, 12, H - wy, rng, '#7c7a72', 10, 0.2);
      grime(g, 0, wy, W, H - wy, rng, 0.22);
      for (let c = 0; c < L.w; c++) {
        if (c === L.door) continue;
        if ((c + L.w) % 2) continue;
        const x = c * T + 20, y = wy + 24;
        g.fillStyle = '#3a2a1e'; g.fillRect(x - 3, y - 3, 30, 22);
        g.fillStyle = L.lit ? LG(g, 0, y, 0, y + 16, [[0, '#2a160c'], [1, '#a2502a']]) : '#151313'; g.fillRect(x, y, 24, 16);
      }
      if (L.door >= 0) {
        const x = L.dx;
        doorway(g, x, H - 62, 40, 62, { curtain: false, lit: L.lit, frame: '#3a2a1e' });
        if (L.lit) { g.fillStyle = RG(g, x + 20, H - 10, 30, [[0, 'rgba(255,140,60,0.5)'], [1, 'rgba(255,120,40,0)']]); g.fillRect(x, H - 62, 40, 62); }
        // carved posts & lintel with geometric motifs
        for (const px of [x - 8, x + 41]) {
          g.fillStyle = LG(g, px, 0, px + 8, 0, [[0, '#6a4a32'], [1, '#3a2618']]); g.fillRect(px, H - 66, 8, 64);
          for (let y = H - 60; y < H - 8; y += 10) { poly(g, [[px + 4, y], [px + 7, y + 4], [px + 4, y + 8], [px + 1, y + 4]]); fs(g, '#e8e0cc'); ell(g, px + 4, y + 4, 1.2, 1.2); fs(g, '#a8322a'); }
        }
        g.fillStyle = LG(g, 0, H - 74, 0, H - 64, [[0, '#6a4a32'], [1, '#3a2618']]); g.fillRect(x - 10, H - 74, 60, 9);
        for (let k = 0; k < 9; k++) { const zx = x - 7 + k * 6.4; poly(g, [[zx, H - 66], [zx + 3.2, H - 72], [zx + 6.4, H - 66]]); fs(g, k % 2 ? '#a8322a' : '#e8e0cc'); }
      }
      // woodpile
      const wx = L.door === L.w - 1 ? 6 : W - 44;
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
        const lx = wx + 6 + k * 9 + r * 4.5, ly = H - 6 - r * 8;
        ell(g, lx, ly, 4.6, 4.2); fs(g, '#8a6a46', '#3a2614', 1);
        ell(g, lx, ly, 2.2, 2); g.strokeStyle = 'rgba(60,40,20,0.6)'; g.lineWidth = 0.6; g.stroke();
      }
      wallAO(g, 0, H, W);
      eaveShadow(g, 0, L.eave, W, 14);
      roof(g, { x0: -12, x1: W + 12, ridge: L.ridge, eave: L.eave, kind: 'slate', base: '#6c6e6b', back: 7, rowH: 9 }, rng);
    },
    lights(L) { return L.lit && L.door >= 0 ? [LT(L.dx + 20, L.H - 20, 80, FIRE_LIGHT, 0.45)] : []; },
  });

  // ---- raised granary --------------------------------------------------------------------------------
  defObj('granary', {
    w: 2, h: 2, fixed: true, pad: [18, 66, 30, 14],
    paint(g, L, o, rng) {
      shadowEll(g, 70, 122, 62, 11, 0.42);
      for (const px of [34, 94]) woodPost(g, px - 3, 84, 7, 28, '#4a3422');
      for (const px of [22, 106]) woodPost(g, px - 4, 84, 8, 40, '#5a3e28');
      for (const px of [22, 34, 94, 106]) {
        ell(g, px, 88, 11, 3.6); fs(g, LG(g, 0, 84, 0, 92, [[0, '#a89e8a'], [1, '#6a6254']]), '#4a4438', 1);
      }
      // woven body
      g.save(); rr(g, 12, 42, 104, 46, 3); g.clip();
      g.fillStyle = '#8c6a43'; g.fillRect(12, 42, 104, 46);
      for (let y = 42; y < 88; y += 5) for (let x = 12 + ((y / 5) % 2) * 5; x < 116; x += 10) {
        g.fillStyle = shade('#a7834f', (rng() - 0.5) * 0.2); rr(g, x, y + 0.5, 9, 4, 1.5); g.fill();
      }
      g.fillStyle = LG(g, 0, 42, 0, 88, [[0, 'rgba(0,0,0,0.45)'], [0.4, 'rgba(0,0,0,0.05)'], [1, 'rgba(0,0,0,0.25)']]); g.fillRect(12, 42, 104, 46);
      g.restore();
      for (const px of [12, 112]) woodPost(g, px, 42, 5, 46, '#4a3422');
      g.fillStyle = '#3a2618'; g.fillRect(10, 84, 108, 5);
      // hatch
      g.fillStyle = '#4a3020'; g.fillRect(52, 56, 24, 26); g.strokeStyle = '#2a1a10'; g.lineWidth = 1.2; g.strokeRect(52, 56, 24, 26); line(g, 52, 69, 76, 69);
      // notched log ladder
      g.save(); g.translate(64, 126); g.rotate(-0.12);
      g.fillStyle = LG(g, -4, 0, 4, 0, [[0, '#8a6a46'], [1, '#4a3420']]); g.fillRect(-4, -44, 8, 44);
      for (let y = -40; y < 0; y += 8) { g.fillStyle = '#2a1a10'; g.fillRect(-4, y, 8, 2); }
      g.restore();
      roof(g, { x0: 0, x1: 128, ridge: -26, eave: 48, kind: 'thatch', base: '#a4874f', back: 9, rowH: 9 }, rng);
      g.strokeStyle = '#5a4020'; g.lineWidth = 1.5;
      for (let x = 10; x < 124; x += 18) line(g, x, -30, x, -20);
    },
  });

  // ---- 涼亭 pavilion (front-middle step cell is walkable) -------------------------------------------
  defObj('pavilion', {
    w: 3, h: 3, fixed: true, pad: [40, 110, 54, 20],
    solidAt: (L, dx, dy) => !(dy === 2 && dx === 1),
    layout(L) { L.lan = [{ x: 40, y: 94, r: 8 }, { x: 152, y: 94, r: 8 }]; },
    paint(g, L, o, rng) {
      buildingShadow(g, 4, 190, 184, 220);
      rr(g, 4, 68, 184, 100, 4);
      g.fillStyle = LG(g, 0, 68, 0, 168, [[0, '#a29c8e'], [1, '#bdb7a8']]); g.fill();
      g.save(); rr(g, 4, 68, 184, 100, 4); g.clip();
      g.strokeStyle = 'rgba(70,64,56,0.35)'; g.lineWidth = 1;
      for (let y = 80; y < 168; y += 14) line(g, 4, y, 188, y);
      for (let y = 68, r = 0; y < 168; y += 14, r++) for (let x = 4 + (r % 2) * 14; x < 188; x += 28) line(g, x, y, x, y + 14);
      g.fillStyle = 'rgba(20,14,18,0.35)'; g.fillRect(4, 68, 184, 62);
      g.restore();
      stones(g, 4, 166, 184, 22, rng, '#9c978b', 10, 0.25);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(4, 166, 184, 1.5);
      for (let k = 0; k < 2; k++) {
        const y = 172 + k * 9;
        g.fillStyle = '#b8b3a6'; g.fillRect(70 - k * 4, y, 52 + k * 8, 8);
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(70 - k * 4, y, 52 + k * 8, 1.2);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(70 - k * 4, y + 7, 52 + k * 8, 1);
      }
      redPillar(g, 32, 60, 112, 10); redPillar(g, 160, 60, 112, 10);
      // 美人靠 bench between back pillars
      g.fillStyle = '#6a2a1e'; g.fillRect(36, 98, 120, 6); g.fillStyle = '#8a3a2a'; g.fillRect(36, 96, 120, 3);
      for (let x = 40; x < 156; x += 8) { g.fillStyle = '#5a2016'; g.fillRect(x, 84, 2.5, 13); }
      // stone table and stools
      shadowEll(g, 98, 140, 26, 7, 0.35);
      g.fillStyle = LG(g, 88, 0, 104, 0, [[0, '#a8a397'], [1, '#6e6a60']]); g.fillRect(89, 124, 14, 16);
      ell(g, 96, 122, 22, 8); fs(g, LG(g, 0, 114, 0, 130, [[0, '#d0ccc0'], [1, '#8e8a7e']]), '#5e5a50', 1);
      for (const [sx, sy] of [[64, 132], [128, 132], [96, 148]]) { ell(g, sx, sy + 6, 7, 3); fs(g, '#7e7a70'); g.fillStyle = '#9a968a'; g.fillRect(sx - 6, sy, 12, 6); ell(g, sx, sy, 6, 2.6); fs(g, '#c2beb2', '#6e6a60', 0.8); }
      redPillar(g, 20, 66, 172, 12); redPillar(g, 172, 66, 172, 12);
      // painted beam + hanging lattice 掛落
      g.fillStyle = '#21485a'; g.fillRect(14, 70, 164, 10);
      for (let x = 20; x < 172; x += 24) { g.fillStyle = '#2f7a6a'; rr(g, x, 72, 18, 6, 3); g.fill(); g.fillStyle = '#e2b24a'; ell(g, x + 9, 75, 2.4, 2); g.fill(); }
      g.strokeStyle = '#7a2a1c'; g.lineWidth = 1.4;
      for (let x = 30; x < 164; x += 8) line(g, x, 80, x, 86);
      line(g, 26, 86, 166, 86);
      hipRoof(g, { cx: 96, hw: 106, rh: 0, ridge: -40, eave: 72, depth: 70, lift: 14, flare: 12, base: '#3b7a63', ridgeCol: '#2c5c4a' }, rng);
      // gourd finial
      ell(g, 96, -44, 6, 5); fs(g, LG(g, 90, 0, 102, 0, [[0, '#f6d77a'], [1, '#a8781e']]), '#6a4a10', 1);
      ell(g, 96, -53, 4, 4); fs(g, LG(g, 92, 0, 100, 0, [[0, '#f6d77a'], [1, '#a8781e']]), '#6a4a10', 1);
      g.strokeStyle = '#a8781e'; g.lineWidth = 1.5; line(g, 96, -57, 96, -64);
      for (const ln of L.lan) lantern(g, ln.x, ln.y, ln.r, { from: 76, lit: L.lit });
    },
    lights: (L) => (L.lit ? lanternLights(L.lan, 80) : []),
  });

  // ---- 牌坊 memorial gateway (posts solid, middle cells passable) -------------------------------------
  defObj('paifang', {
    w: 4, h: 1, fixed: true, nv: 2, salt: 31, pad: [24, 210, 36, 14],
    solidAt: (L, dx) => dx === 0 || dx === L.w - 1,
    paint(g, L, o, rng) {
      const W = L.W, stone = L.v === 0;
      const post = stone ? '#aaa69a' : '#a3281f';
      const beam = stone ? '#9e9a8e' : '#8a2219';
      for (const px of [34, W - 34]) {
        shadowEll(g, px + 6, 60, 28, 7, 0.4);
        // drum stones 抱鼓石
        for (const s of [-1, 1]) {
          const bx = px + s * 17;
          g.fillStyle = LG(g, 0, 44, 0, 62, [[0, '#c4c0b4'], [1, '#868276']]); g.fillRect(bx - 7, 50, 14, 12);
          ell(g, bx, 44, 8, 8); fs(g, LG(g, bx - 8, 0, bx + 8, 0, [[0, '#d6d2c6'], [1, '#88847a']]), '#5e5a50', 1);
          ell(g, bx, 44, 4, 4); g.strokeStyle = 'rgba(80,76,68,0.6)'; g.stroke();
        }
        g.fillStyle = LG(g, px - 12, 0, px + 12, 0, [[0, shade(post, -0.15)], [0.3, shade(post, 0.25)], [1, shade(post, -0.4)]]);
        g.fillRect(px - 11, -112, 22, 172);
        if (stone) { grime(g, px - 11, -112, 22, 172, rng, 0.2); vchars(g, px < W / 2 ? '慈航普渡' : '燈照彼岸', px, -18, 10, 'rgba(50,46,40,0.85)', 1.25); }
        else { g.fillStyle = '#e2b24a'; g.fillRect(px - 12, -112, 24, 3); g.fillRect(px - 12, 48, 24, 3); vchars(g, px < W / 2 ? '慈航普渡' : '燈照彼岸', px, -18, 10, '#f2cb68', 1.25, 'rgba(0,0,0,0.4)'); }
        g.fillStyle = LG(g, 0, 52, 0, 62, [[0, '#b8b4a8'], [1, '#7e7a70']]); g.fillRect(px - 14, 52, 28, 10);
      }
      // beams
      const bm = (y, h, x0, x1) => {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0 + 2, y + 2, x1 - x0, h);
        g.fillStyle = LG(g, 0, y, 0, y + h, [[0, shade(beam, 0.25)], [1, shade(beam, -0.3)]]); g.fillRect(x0, y, x1 - x0, h);
        if (!stone) { g.fillStyle = '#e2b24a'; g.fillRect(x0, y, x1 - x0, 1.5); g.fillRect(x0, y + h - 1.5, x1 - x0, 1.5); }
      };
      bm(-58, 12, 14, W - 14);
      // relief side panels
      for (const [a, b] of [[45, W / 2 - 56], [W / 2 + 56, W - 45]]) {
        g.fillStyle = stone ? '#bab6aa' : '#2a5a6a'; g.fillRect(a, -98, b - a, 40);
        g.strokeStyle = stone ? 'rgba(80,76,68,0.55)' : '#e2b24a'; g.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(a + (b - a) * (k + 0.5) / 3, -78, 6, PI * 0.1, PI * 1.6); g.stroke(); }
      }
      plaque(g, W / 2 - 54, -100, 108, 40, L.text || '彼岸', stone ? { bg: '#2a3a5a', fg: '#f2d070', rim: '#8e8a7e' } : { bg: '#1c2f5a', fg: '#f6d06a', rim: '#d6a542' });
      bm(-112, 12, 4, W - 4);
      const S = roof(g, { x0: -6, x1: W + 6, ridge: -148, eave: -110, lift: 9, sag: 2, back: 6, kind: 'tile', base: stone ? '#4a7a68' : '#b5503a', tileW: 8, ridgeStyle: 'none' }, rng);
      ridgeBand(g, S, 0.06, 0.94, 8, stone ? '#2c4c42' : '#7a2a1e', ['#3fb08a', '#f2c94c', '#e05a3a', '#f6efe0']);
      swallowTail(g, S.X(0.06), S.rY(0.06) - 3, -1, 22, stone ? '#2c4c42' : '#7a2a1e', 8);
      swallowTail(g, S.X(0.94), S.rY(0.94) - 3, 1, 22, stone ? '#2c4c42' : '#7a2a1e', 8);
      flamingPearl(g, W / 2, S.rY(0.5) - 11, 4.5);
    },
  });

  // ---- lighthouse (rotating beam) --------------------------------------------------------------------
  defObj('lighthouse', {
    w: 3, h: 3, fixed: true, door: 1, anim: true, pad: [44, 290, 60, 20],
    layout(L) { L.lamp = { x: 96, y: -208 }; },
    paint(g, L, o, rng) {
      shadowEll(g, 128, 176, 96, 20, 0.35);
      // stone base
      g.save(); g.beginPath(); g.ellipse(96, 150, 92, 34, 0, 0, PI); g.lineTo(4, 150); g.closePath();
      g.beginPath(); g.moveTo(4, 150); g.lineTo(4, 168); g.ellipse(96, 168, 92, 22, 0, PI, 0, true); g.lineTo(188, 150); g.ellipse(96, 150, 92, 34, 0, 0, PI, true); g.closePath();
      g.clip(); stones(g, 0, 140, 192, 52, rng, '#8a867c', 11, 0.3); g.restore();
      ell(g, 96, 150, 92, 34); fs(g, LG(g, 0, 116, 0, 184, [[0, '#b2ad9f'], [1, '#8e897d']]), '#5e5a50', 1.2);
      g.save(); ell(g, 96, 150, 92, 34); g.clip();
      g.strokeStyle = 'rgba(80,74,66,0.3)'; g.lineWidth = 1;
      for (let r = 20; r < 100; r += 16) { ell(g, 96, 150, r, r * 0.37); g.stroke(); }
      g.restore();
      // tower body
      const tw = (y) => lerp(50, 33, (166 - y) / (166 + 176));
      g.beginPath(); g.moveTo(96 - tw(-176), -176); g.lineTo(96 + tw(-176), -176); g.lineTo(96 + tw(160), 160);
      g.ellipse(96, 160, tw(160), 10, 0, 0, PI); g.closePath();
      g.fillStyle = LG(g, 46, 0, 146, 0, [[0, '#d9d6cc'], [0.25, '#fbf9f2'], [0.6, '#e6e2d8'], [1, '#a5a196']]); g.fill();
      g.strokeStyle = '#7e7a70'; g.lineWidth = 1.2; g.stroke();
      g.save(); g.clip();
      for (let y = -170; y < 166; y += 18) { g.strokeStyle = 'rgba(120,114,100,0.18)'; g.lineWidth = 1; g.beginPath(); g.ellipse(96, y, tw(y), 4, 0, 0, PI); g.stroke(); }
      grime(g, 40, -176, 112, 342, rng, 0.08);
      g.fillStyle = LG(g, 0, 120, 0, 170, [[0, 'rgba(60,70,50,0)'], [1, 'rgba(60,70,50,0.3)']]); g.fillRect(40, 120, 112, 50);
      g.restore();
      for (const wy of [-120, -40, 40]) {
        g.fillStyle = '#5a6a72'; rr(g, 88, wy, 12, 20, 6); g.fill();
        g.fillStyle = L.lit ? '#ffcf80' : '#2a2e36'; rr(g, 90, wy + 2, 8, 16, 4); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(86, wy + 20, 16, 2);
      }
      doorway(g, 78, 118, 36, 46, { curtain: false, lit: L.lit, frame: '#3a4a52' });
      g.fillStyle = '#3a4a52'; g.beginPath(); g.arc(96, 118, 22, PI, 0); g.lineTo(114, 118); g.lineTo(78, 118); g.fill();
      g.fillStyle = '#26303a'; g.beginPath(); g.arc(96, 118, 18, PI, 0); g.fill();
      // gallery
      ell(g, 96, -176, 48, 11); fs(g, '#2e3236', '#141618', 1.2);
      g.strokeStyle = '#1e2124'; g.lineWidth = 1.3;
      for (let a = 0.05; a < PI; a += 0.2) { const x = 96 + cos(a) * 46, y = -176 + sin(a) * 10; line(g, x, y, x, y - 12); }
      g.beginPath(); g.ellipse(96, -188, 46, 10, 0, 0, PI); g.stroke();
      // lantern room
      g.fillStyle = '#2a2e30'; g.fillRect(70, -188, 52, 6);
      g.fillStyle = LG(g, 72, 0, 120, 0, [[0, '#fff6d8'], [0.5, '#fffdf2'], [1, '#e8d8a0']]); g.fillRect(73, -232, 46, 44);
      ell(g, 96, -210, 12, 14); g.fillStyle = RG(g, 96, -210, 14, [[0, '#ffffff'], [0.6, '#fff1b0'], [1, 'rgba(255,220,120,0)']]); g.fill();
      g.strokeStyle = '#2a2e30'; g.lineWidth = 2; for (let x = 73; x <= 119; x += 11.5) line(g, x, -232, x, -188);
      line(g, 73, -210, 119, -210);
      g.beginPath(); g.moveTo(68, -232); g.quadraticCurveTo(96, -270, 124, -232); g.closePath();
      fs(g, LG(g, 68, 0, 124, 0, [[0, '#4a6a62'], [0.4, '#6a8a80'], [1, '#26383a']]), '#16201e', 1.2);
      ell(g, 96, -253, 4, 4); fs(g, '#4a6a62', '#16201e', 1);
      g.strokeStyle = '#16201e'; g.lineWidth = 1.2; line(g, 96, -257, 96, -270);
    },
    live(ctx, px, py, L, o, t) {
      if (!L.lit) return;
      const lx = px + L.lamp.x, ly = py + L.lamp.y;
      if (o.beam !== false) {
        const a = t * 0.9;
        const dx = cos(a), dy = sin(a) * 0.3, len = 340 * (0.45 + 0.55 * abs(dx));
        const ex = lx + dx * len, ey = ly + dy * len + 10;
        const nx = -dy, ny = dx, spread = 26 + 30 * abs(dx);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createLinearGradient(lx, ly, ex, ey);
        gr.addColorStop(0, 'rgba(255,244,200,0.42)'); gr.addColorStop(1, 'rgba(255,244,200,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(lx + nx * 3, ly + ny * 3); ctx.lineTo(ex + nx * spread, ey + ny * spread); ctx.lineTo(ex - nx * spread, ey - ny * spread); ctx.lineTo(lx - nx * 3, ly - ny * 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      liveGlow(ctx, lx, ly, 60, '#fff0b8', 0.45 + 0.08 * sin(t * 3));
    },
    lights: (L) => (L.lit ? [LT(96, -208, 340, '#fff0c0', 0.05), LT(96, 150, 50, WINDOW_LIGHT, 0.1)] : []),
  });

  // ---- 礦坑 timbered mine entrance ---------------------------------------------------------------------
  defObj('mine_entrance', {
    w: 3, h: 2, fixed: true, door: 1, pad: [34, 84, 44, 14],
    layout(L) { L.x0 = L.door * T; },
    paint(g, L, o, rng) {
      const x0 = L.x0;
      const hill = [[-26, 130], [-22, 70], [-4, 22], [30, -18], [70, -46], [118, -50], [160, -30], [196, 6], [214, 64], [218, 130]];
      g.save();
      g.beginPath(); g.moveTo(hill[0][0], hill[0][1]);
      for (let i = 1; i < hill.length; i++) { const p = hill[i - 1], q = hill[i]; g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
      g.lineTo(218, 130); g.closePath();
      g.fillStyle = '#4e463c'; g.fill(); g.clip();
      rockFace(g, -30, -60, 260, 196, rng, '#766b5c');
      g.fillStyle = LG(g, -20, -50, 200, 130, [[0, 'rgba(255,240,210,0.12)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]); g.fillRect(-30, -60, 260, 190);
      g.restore();
      // grass & ferns along the crest
      for (let i = 0; i < 70; i++) {
        const k = rng(); const idx = min(hill.length - 2, floor(k * (hill.length - 1))), f = k * (hill.length - 1) - idx;
        const x = lerp(hill[idx][0], hill[idx + 1][0], f), y = lerp(hill[idx][1], hill[idx + 1][1], f) + 3;
        g.strokeStyle = mix('#3f6a2e', '#86b04e', rng()); g.lineWidth = 1.4;
        line(g, x, y, x + rng() * 6 - 3, y - 5 - rng() * 7);
      }
      for (const [fx, fy] of [[-8, 104], [196, 100], [12, 40]]) {
        for (let k = 0; k < 6; k++) { const a = -PI / 2 + (k - 2.5) * 0.4; g.strokeStyle = '#3e6e34'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + cos(a) * 10, fy + sin(a) * 14, fx + cos(a) * 18, fy + sin(a) * 16 + 6); g.stroke(); }
      }
      // tunnel
      const tx = x0 + 8, tw = 48, ty = 38;
      g.fillStyle = LG(g, 0, ty, 0, 128, [[0, '#040303'], [0.7, '#120d0a'], [1, '#2a2018']]); g.fillRect(tx, ty, tw, 128 - ty);
      g.strokeStyle = '#3a3a3e'; g.lineWidth = 1.6;
      line(g, tx + 12, 128, tx + 20, 70); line(g, tx + 36, 128, tx + 28, 70);
      for (let k = 0; k < 6; k++) { const v = k / 6, y = lerp(126, 72, v); g.fillStyle = `rgba(90,64,40,${0.8 - v * 0.6})`; g.fillRect(lerp(tx + 8, tx + 18, v), y, lerp(32, 12, v), 2.6); }
      g.fillStyle = LG(g, 0, ty, 0, ty + 30, [[0, 'rgba(0,0,0,0.8)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(tx, ty, tw, 30);
      // timber frame
      woodPost(g, x0 + 2, 34, 9, 94, '#5a3b22'); woodPost(g, x0 + 53, 34, 9, 94, '#5a3b22');
      g.fillStyle = LG(g, 0, 26, 0, 38, [[0, '#7a5434'], [1, '#3a2614']]); g.fillRect(x0 - 4, 26, 72, 11);
      for (const ex of [x0 - 1, x0 + 65]) { ell(g, ex, 31.5, 3.5, 5); fs(g, '#9a7a54', '#3a2614', 0.8); }
      g.strokeStyle = '#4a3020'; g.lineWidth = 5; line(g, x0 + 10, 50, x0 + 22, 37); line(g, x0 + 54, 50, x0 + 42, 37);
      plaque(g, x0 + 12, 6, 40, 17, L.text || '金坑', { bg: '#5a3e26', fg: '#f3e2bd', rim: '#2a1a10' });
      g.strokeStyle = '#2a1a10'; g.lineWidth = 1; line(g, x0 + 18, 23, x0 + 18, 27); line(g, x0 + 46, 23, x0 + 46, 27);
      // oil lamp on the left post
      g.strokeStyle = '#2a1a10'; g.lineWidth = 1.5; line(g, x0 + 2, 52, x0 - 6, 52); line(g, x0 - 6, 52, x0 - 6, 56);
      g.fillStyle = '#2a2420'; g.fillRect(x0 - 11, 56, 10, 3); g.fillRect(x0 - 10, 69, 8, 3);
      g.fillStyle = RG(g, x0 - 6, 64, 6, [[0, '#fff2b0'], [1, '#e89a3a']]); g.fillRect(x0 - 10, 59, 8, 10);
      g.strokeStyle = '#2a2420'; g.lineWidth = 1; g.strokeRect(x0 - 10, 59, 8, 10);
      // rubble
      for (let i = 0; i < 9; i++) { const rx = rng() * 192, ry = 118 + rng() * 10; if (abs(rx - (x0 + 32)) < 34) continue; ell(g, rx, ry, 4 + rng() * 5, 3 + rng() * 2); fs(g, mix('#7a7064', '#5a5248', rng()), '#3a342c', 0.8); }
    },
    lights: (L) => [LT(L.x0 - 6, 64, 90, '#ffb050', 0.3)],
  });

  // ---- city wall (w x 1) -------------------------------------------------------------------------------
  defObj('city_wall', {
    w: 4, h: 1, resize: 'w', nv: 2, salt: 33, pad: [8, 140, 26, 14],
    key: (o) => (o.tall || 110),
    paint(g, L, o, rng) {
      const W = L.W, ft = 64 - (o.tall || 110), top = ft - 30;
      const brick = L.v === 1;
      buildingShadow(g, 0, 64, W, 64 - top);
      // walkway top
      g.fillStyle = LG(g, 0, top, 0, ft, [[0, '#6e6a60'], [1, '#9a958a']]); g.fillRect(0, top, W, ft - top);
      g.strokeStyle = 'rgba(50,46,40,0.35)'; g.lineWidth = 1;
      for (let x = 0; x < W; x += 24) line(g, x, top, x, ft);
      line(g, 0, top + 15, W, top + 15);
      g.fillStyle = '#5a564e'; g.fillRect(0, top - 5, W, 6);
      // face
      if (brick) bricks(g, 0, ft, W, 64 - ft, '#9a4a36', rng, 8, 20, '#7a6a5a');
      else stones(g, 0, ft, W, 64 - ft, rng, '#8e8a80', 18, 0.25);
      grime(g, 0, ft, W, 64 - ft, rng, 0.24);
      g.fillStyle = LG(g, 0, 40, 0, 64, [[0, 'rgba(70,90,50,0)'], [1, 'rgba(70,90,50,0.35)']]); g.fillRect(0, 40, W, 24);
      // merlons 雉堞
      for (let x = 2; x < W - 4; x += 30) {
        const mw = min(18, W - 2 - x);
        g.fillStyle = brick ? '#8a4030' : '#88847a'; g.fillRect(x, ft - 20, mw, 20);
        if (brick) bricks(g, x, ft - 20, mw, 20, '#9a4a36', rng, 8, 10, '#7a6a5a'); else stones(g, x, ft - 20, mw, 20, rng, '#959186', 10, 0.1);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, ft - 20, mw, 2);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + mw - 2, ft - 18, 2, 18);
      }
      g.fillStyle = brick ? '#b8a890' : '#b4b0a4'; g.fillRect(0, ft, W, 5);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, ft + 5, W, 2);
      for (let x = 40; x < W - 20; x += 128) { g.fillStyle = '#4a4640'; g.fillRect(x, ft + 8, 8, 5); g.fillStyle = 'rgba(30,40,30,0.3)'; g.fillRect(x + 1, ft + 13, 6, 30); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(W - 3, top, 3, 64 - top);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, top, 2, 64 - top);
      wallAO(g, 0, 64, W, 12);
    },
  });

  // ---- city gate with tower ------------------------------------------------------------------------------
  defObj('gate_city', {
    w: 3, h: 2, fixed: true, door: 1, anim: true, pad: [28, 220, 44, 14],
    solidAt: (L, dx) => dx !== L.door,
    layout(L) {
      L.x0 = L.door * T;
      L.lan = [{ x: 46, y: -74, r: 8 }, { x: 146, y: -74, r: 8 }];
      L.torch = [{ x: L.x0 - 6, y: 62 }, { x: L.x0 + 70, y: 62 }];
    },
    paint(g, L, o, rng) {
      const x0 = L.x0;
      buildingShadow(g, 0, 128, 192, 330);
      // tower hall
      g.fillStyle = '#5a1a14'; g.fillRect(18, -98, 156, 62);
      for (let i = 0; i < 3; i++) windowLat(g, 34 + i * 48, -84, 28, 34, L.lit, { frame: '#3a120e', pattern: 'diamond', sill: false });
      for (const px of [22, 70, 122, 170]) redPillar(g, px, -100, -34, 9);
      g.fillStyle = '#3a120e'; g.fillRect(14, -40, 164, 6);
      for (let x = 16; x < 176; x += 6) { g.fillStyle = '#7a2a1c'; g.fillRect(x, -46, 2.5, 7); }
      eaveShadow(g, 18, -96, 156, 14);
      // walkway & merlons
      g.fillStyle = LG(g, 0, -52, 0, -22, [[0, '#6e6a60'], [1, '#9a958a']]); g.fillRect(0, -34, 192, 14);
      // wall face
      stones(g, 0, -20, 192, 148, rng, '#8e8a80', 18, 0.25);
      grime(g, 0, -20, 192, 148, rng, 0.25);
      for (let x = 2; x < 188; x += 30) {
        g.fillStyle = '#88847a'; stones(g, x, -38, 18, 18, rng, '#959186', 9, 0.1);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, -38, 18, 2);
      }
      g.fillStyle = '#b4b0a4'; g.fillRect(0, -20, 192, 5); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, -15, 192, 2);
      // arch
      const ax = x0 + 32, ar = 26, spring = 46;
      g.save(); g.beginPath(); g.moveTo(ax - ar, 128); g.lineTo(ax - ar, spring); g.arc(ax, spring, ar, PI, 0); g.lineTo(ax + ar, 128); g.closePath(); g.clip();
      g.fillStyle = LG(g, 0, spring - ar, 0, 128, [[0, '#0a0808'], [0.6, '#1c1612'], [1, '#3a3026']]); g.fillRect(ax - ar, spring - ar, ar * 2, 128);
      g.fillStyle = RG(g, ax, 60, 16, [[0, 'rgba(200,220,240,0.25)'], [1, 'rgba(200,220,240,0)']]); g.fillRect(ax - ar, 20, ar * 2, 80);
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(ax + s * ar, spring - 6); g.lineTo(ax + s * (ar - 10), spring); g.lineTo(ax + s * (ar - 10), 122); g.lineTo(ax + s * ar, 128); g.closePath();
        g.fillStyle = '#5a2a1a'; g.fill();
        g.fillStyle = '#c8a050'; for (let y = spring + 8; y < 120; y += 12) { ell(g, ax + s * (ar - 5), y, 1.4, 1.4); g.fill(); }
      }
      g.restore();
      g.strokeStyle = '#6a665c'; g.lineWidth = 9; g.beginPath(); g.arc(ax, spring, ar + 4.5, PI, 0); g.stroke();
      g.strokeStyle = '#b4b0a4'; g.lineWidth = 7; g.beginPath(); g.arc(ax, spring, ar + 4.5, PI, 0); g.stroke();
      g.strokeStyle = '#6a665c'; g.lineWidth = 1;
      for (let a = PI; a <= TAU + 0.01; a += PI / 8) line(g, ax + cos(a) * ar, spring + sin(a) * ar, ax + cos(a) * (ar + 9), spring + sin(a) * (ar + 9));
      plaque(g, ax - 26, -10, 52, 18, L.text || '東門', { bg: '#d8d2c2', fg: '#2a2420', rim: '#7a766c' });
      wallAO(g, 0, 128, 192, 14);
      // tower roof
      const S = roof(g, { x0: -4, x1: 196, ridge: -158, eave: -94, lift: 12, sag: 4, back: 8, kind: 'tile', base: '#5b5f68', tileW: 9, ridgeStyle: 'none' }, rng);
      ridgeBand(g, S, 0.06, 0.94, 8, '#3a3d44', null);
      swallowTail(g, S.X(0.06), S.rY(0.06) - 3, -1, 22, '#3a3d44', 8);
      swallowTail(g, S.X(0.94), S.rY(0.94) - 3, 1, 22, '#3a3d44', 8);
      for (const ln of L.lan) lantern(g, ln.x, ln.y, ln.r, { from: -92, lit: L.lit });
      for (const tc of L.torch) {
        g.fillStyle = '#2a2420'; g.fillRect(tc.x - 2, tc.y, 4, 14); g.fillRect(tc.x - 4, tc.y + 12, 8, 3);
        g.fillStyle = '#4a3020'; g.fillRect(tc.x - 3.5, tc.y - 4, 7, 6);
      }
    },
    live(ctx, px, py, L, o, t) {
      if (!L.lit) return;
      for (const tc of L.torch) flame(ctx, px + tc.x, py + tc.y - 3, 5, t, tc.x);
    },
    lights: (L) => (L.lit ? lanternLights(L.lan, 80).concat(L.torch.map((tc) => LT(tc.x, tc.y - 8, 90, FIRE_LIGHT, 0.55))) : []),
  });

  // live flame (main canvas): base at (x,y), s = size
  function flame(ctx, x, y, s, t, seed) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = RG(ctx, x, y - s, s * 4, [[0, 'rgba(255,150,60,0.35)'], [1, 'rgba(255,120,40,0)']]);
    ctx.fillRect(x - s * 4, y - s * 5, s * 8, s * 8);
    ctx.restore();
    const tongues = [[-0.5, 0.75, 1.3], [0.45, 0.8, 1.7], [0, 1.15, 0.9]];
    for (let i = 0; i < tongues.length; i++) {
      const [ox, hm, ph] = tongues[i];
      const hgt = s * (2.4 + 0.5 * sin(t * 9 + ph + seed) + 0.3 * sin(t * 15.3 + ph * 2)) * hm;
      const sw = sin(t * 6 + ph * 3 + seed) * s * 0.35;
      const bx = x + ox * s;
      ctx.beginPath(); ctx.moveTo(bx - s * 0.75, y);
      ctx.quadraticCurveTo(bx - s * 0.8, y - hgt * 0.5, bx + sw, y - hgt);
      ctx.quadraticCurveTo(bx + s * 0.8, y - hgt * 0.5, bx + s * 0.75, y);
      ctx.closePath();
      ctx.fillStyle = RG(ctx, bx, y, hgt, [[0, '#fff4c0'], [0.35, '#ffc54a'], [0.75, '#f0662a'], [1, 'rgba(200,40,20,0.6)']]);
      ctx.fill();
    }
  }

  // =================================================================================================
  // STREET / OUTDOOR PROPS
  // =================================================================================================
  const PAL_RED = '#d42f25';
  // ---- lantern_string: red lanterns strung across a street (over:true, non-solid, sway) ----------
  const STRING_COLS = [[PAL_RED], [PAL_RED, '#e8a33a', '#f0e6cf', PAL_RED, '#c8542a'], ['#5fa8d8', '#8fd0f0']];
  defObj('lantern_string', {
    w: 3, h: 1, resize: 'w', solid: false, over: true, anim: true,
    layout(L, o) {
      L.v = clamp(o.v | 0, 0, 2);
      L.lift = o.lift != null ? o.lift : 46;
      L.sag = 8 + L.W * 0.025;
      L.n = max(2, round(L.W / 44));
      L.cord = 5; L.r = o.r || 8;
      L.pts = [];
      for (let i = 0; i < L.n; i++) {
        const u = (i + 0.5) / L.n, x = L.W * u, y = -L.lift + L.sag * 4 * u * (1 - u);
        L.pts.push({ x, y, u, col: o.color || STRING_COLS[L.v][i % STRING_COLS[L.v].length] });
      }
    },
    live(ctx, px, py, L, o, t) {
      const sway = sin(t * 1.3 + px * 0.01) * 1.5;
      const y0 = py - L.lift;
      ctx.save();
      ctx.fillStyle = '#2a1a12';
      ctx.fillRect(px - 3, y0 - 4, 6, 8); ctx.fillRect(px + L.W - 3, y0 - 4, 6, 8);
      ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(px, y0); ctx.quadraticCurveTo(px + L.W / 2, y0 + L.sag * 2 + sway * 2, px + L.W, y0); ctx.stroke();
      if (L.v === 1) { // paper pennants
        const n = L.n * 3;
        for (let i = 0; i < n; i++) {
          const u = (i + 0.25) / n, x = px + L.W * u, y = y0 + (L.sag + sway) * 4 * u * (1 - u);
          ctx.fillStyle = ['#e8a33a', '#3d8a7a', '#c9453a', '#f0e6cf'][i % 4];
          ctx.beginPath(); ctx.moveTo(x - 3.5, y); ctx.lineTo(x + 3.5, y); ctx.lineTo(x + sin(t * 3 + i) * 1.2, y + 8); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
      L.pts.forEach((p, i) => {
        const hy = py + p.y + sway * 4 * p.u * (1 - p.u);
        const a = 0.07 * sin(t * 1.7 + i * 0.8 + px * 0.02);
        drawLanternSprite(ctx, px + p.x, hy, L.r, p.col, null, L.cord, a, true);
        liveGlow(ctx, px + p.x - a * 20, hy + L.cord + L.r * 1.3 + 3, L.r * 3, '#ff9a4a', 0.16 * flick(t, i * 1.7 + px));
      });
    },
    lights(L) { return L.pts.map((p) => LT(round(p.x), round(p.y + L.cord + L.r * 1.3 + 3), 80, p.col === PAL_RED ? LANTERN_LIGHT : '#ffc070', 0.35)); },
  });

  // ---- lamp_post: wooden post with a paper 行燈 lamp box ------------------------------------------
  defObj('lamp_post', {
    w: 1, h: 1, pad: [24, 112, 30, 10],
    paint(g, L, o) {
      shadowEll(g, 36, 57, 17, 5, 0.42);
      g.fillStyle = LG(g, 22, 0, 42, 0, [[0, '#b2ada0'], [1, '#77736a']]); g.fillRect(22, 42, 20, 15);
      g.fillStyle = '#c6c1b4'; g.fillRect(20, 40, 24, 4); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(20, 44, 24, 1);
      woodPost(g, 28.5, -52, 7, 93, '#3c2818');
      g.fillStyle = '#2a1a10'; g.fillRect(24, -56, 16, 5);
      // lamp box
      const x = 17, y = -94, w = 30, h = 36;
      g.fillStyle = RG(g, 32, y + h / 2, 40, [[0, 'rgba(255,190,100,0.3)'], [1, 'rgba(255,190,100,0)']]); g.fillRect(-10, y - 30, 84, 100);
      g.fillStyle = L.lit ? LG(g, x, y, x + w, y + h, [[0, '#fff0c4'], [0.6, '#ffc76e'], [1, '#e48a3c']]) : '#4a4238';
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#2a1a10'; g.lineWidth = 2.4; g.strokeRect(x, y, w, h);
      g.lineWidth = 1; line(g, x + w / 2, y, x + w / 2, y + h); line(g, x, y + h * 0.66, x + w, y + h * 0.66);
      vchars(g, L.text || '燈', x + w / 2 - 7, y + h * 0.36, 9, 'rgba(60,20,10,0.75)');
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + w - 6, y, 6, h);
      g.beginPath(); g.moveTo(x - 7, y + 1); g.lineTo(x + w + 7, y + 1); g.lineTo(x + w - 3, y - 10); g.lineTo(x + 3, y - 10); g.closePath();
      fs(g, LG(g, 0, y - 10, 0, y, [[0, '#4a4040'], [1, '#1e1a1a']]), '#100c0c', 1);
      ell(g, 32, y - 13, 3.5, 3.5); fs(g, '#2a2222', '#100c0c', 1);
      g.fillStyle = '#2a1a10'; g.fillRect(x - 1, y + h, w + 2, 3);
    },
    lights: (L) => (L.lit ? [LT(32, -76, 120, '#ffb45a', 0.18)] : []),
  });

  // ---- stone_lantern 石燈籠 -------------------------------------------------------------------------
  defObj('stone_lantern', {
    w: 1, h: 1, pad: [16, 76, 24, 10],
    paint(g, L, o, rng) {
      const st = (x0, x1) => LG(g, x0, 0, x1, 0, [[0, '#cfcabd'], [0.35, '#b4afa2'], [1, '#77736a']]);
      shadowEll(g, 36, 56, 20, 6, 0.42);
      g.fillStyle = st(14, 50); g.fillRect(14, 44, 36, 13); g.fillStyle = '#d6d1c4'; g.fillRect(13, 42, 38, 3);
      g.fillStyle = st(26, 38); g.fillRect(26, 12, 12, 32);
      g.fillStyle = '#c2bdb0'; g.fillRect(24, 26, 16, 3);
      g.fillStyle = st(17, 47); g.fillRect(17, 6, 30, 7); g.fillStyle = '#d6d1c4'; g.fillRect(16, 4, 32, 3);
      g.fillStyle = st(20, 44); g.fillRect(20, -24, 24, 28);
      g.fillStyle = L.lit ? RG(g, 32, -10, 10, [[0, '#fff2c0'], [1, '#e88a3a']]) : '#2a2622'; g.fillRect(26, -18, 12, 16);
      g.strokeStyle = '#6a665c'; g.lineWidth = 1; g.strokeRect(26, -18, 12, 16); line(g, 32, -18, 32, -2);
      if (L.lit) { g.fillStyle = RG(g, 32, -10, 26, [[0, 'rgba(255,190,100,0.28)'], [1, 'rgba(255,190,100,0)']]); g.fillRect(4, -38, 56, 56); }
      g.beginPath(); g.moveTo(9, -22); g.quadraticCurveTo(14, -24, 20, -32); g.lineTo(44, -32); g.quadraticCurveTo(50, -24, 55, -22); g.lineTo(55, -19); g.lineTo(9, -19); g.closePath();
      fs(g, LG(g, 0, -34, 0, -19, [[0, '#cfcabd'], [1, '#8e8a7e']]), '#5e5a50', 1);
      g.beginPath(); g.moveTo(20, -32); g.quadraticCurveTo(32, -42, 44, -32); g.closePath(); fs(g, '#bab5a8', '#5e5a50', 1);
      ell(g, 32, -42, 4, 4.5); fs(g, st(28, 36), '#5e5a50', 1);
      for (let i = 0; i < 6; i++) { ell(g, 15 + rng() * 34, 44 + rng() * 10, 2 + rng() * 3, 1.2 + rng()); g.fillStyle = 'rgba(90,120,60,0.55)'; g.fill(); }
      grime(g, 14, -24, 36, 80, rng, 0.12);
    },
    lights: (L) => (L.lit ? [LT(32, -10, 96, '#ffc070', 0.25)] : []),
  });

  // ---- red_lantern: big lantern on a bamboo pole (o.hang → hangs from an eave, non-solid) ----------
  defObj('red_lantern', {
    w: 1, h: 1, anim: true, pad: [8, 112, 30, 10],
    solidAt: (L) => !L.hang,
    layout(L, o) {
      L.hang = !!o.hang; L.r = o.r || 11; L.col = o.color || PAL_RED;
      L.glyph = o.text ? [...String(o.text)][0] : '福';
      L.hx = L.hang ? 32 : 42; L.hy = L.hang ? -48 : -88; L.cord = L.hang ? 14 : 8;
    },
    key: (o) => (o.hang ? 'h' : 'p'),
    paint(g, L) {
      if (L.hang) return;
      shadowEll(g, 22, 57, 12, 4, 0.4);
      g.fillStyle = LG(g, 12, 0, 30, 0, [[0, '#a8a397'], [1, '#6e6a60']]); g.fillRect(11, 46, 20, 11);
      g.fillStyle = LG(g, 15, 0, 22, 0, [[0, '#c2b46a'], [0.5, '#a8964e'], [1, '#6a5e2e']]); g.fillRect(15, -96, 6, 143);
      for (let y = -86; y < 44; y += 22) { g.fillStyle = '#6a5e2e'; g.fillRect(14.5, y, 7, 2); }
      g.strokeStyle = '#8a7a3e'; g.lineWidth = 3; g.beginPath(); g.moveTo(18, -92); g.quadraticCurveTo(30, -96, 44, -90); g.stroke();
      g.strokeStyle = '#2a1a10'; g.lineWidth = 1; line(g, 20, -80, 30, -93);
    },
    live(ctx, px, py, L, o, t) {
      const a = 0.08 * sin(t * 1.5 + px * 0.03);
      drawLanternSprite(ctx, px + L.hx, py + L.hy, L.r, L.col, L.glyph, L.cord, a, L.lit);
      if (L.lit) liveGlow(ctx, px + L.hx - a * 20, py + L.hy + L.cord + L.r * 1.3 + 3, L.r * 3.4, '#ff9a4a', 0.18 * flick(t, px));
    },
    lights: (L) => (L.lit ? [LT(L.hx, round(L.hy + L.cord + L.r * 1.3 + 3), 100, LANTERN_LIGHT, 0.35)] : []),
  });

  // ---- well -------------------------------------------------------------------------------------------
  defObj('well', {
    w: 1, h: 1, pad: [14, 72, 22, 10],
    paint(g, L, o, rng) {
      shadowEll(g, 35, 54, 28, 8, 0.4);
      // posts & little roof
      for (const x of [8, 52]) woodPost(g, x, -30, 6, 74, '#4a3220');
      g.fillStyle = '#3a2618'; g.fillRect(6, -32, 54, 5);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(32, -54); g.lineTo(32 + s * 36, -30); g.lineTo(32 + s * 36, -25); g.lineTo(32, -48); g.closePath(); fs(g, s < 0 ? '#3a3a40' : '#26262c', '#141418', 1); }
      g.strokeStyle = '#5a5a64'; g.lineWidth = 1; for (let k = 1; k < 5; k++) { line(g, 32 - k * 7, -54 + k * 4.6, 32 - k * 7, -49 + k * 4.6); }
      ell(g, 32, -26, 5.5, 5.5); fs(g, '#6a4a2e', '#2a1a10', 1.2); ell(g, 32, -26, 1.5, 1.5); fs(g, '#2a1a10');
      g.strokeStyle = '#c8b48a'; g.lineWidth = 1; line(g, 32, -21, 32, 26);
      // stone ring
      g.save(); g.beginPath(); g.moveTo(8, 36); g.ellipse(32, 36, 24, 10, 0, PI, 0, true); g.lineTo(56, 52); g.ellipse(32, 52, 24, 7, 0, 0, PI); g.closePath(); g.clip();
      stones(g, 6, 26, 52, 34, rng, '#8e8a80', 8, 0.35); g.restore();
      ell(g, 32, 36, 24, 10); fs(g, LG(g, 0, 26, 0, 46, [[0, '#c4bfb2'], [1, '#8a8679']]), '#5e5a50', 1.2);
      ell(g, 32, 36, 18, 6.8); fs(g, LG(g, 0, 30, 0, 42, [[0, '#0e1418'], [1, '#1e3038']]));
      ell(g, 28, 37, 6, 1.4); g.fillStyle = 'rgba(200,230,255,0.25)'; g.fill();
      // bucket hanging & bucket on rim
      g.fillStyle = LG(g, 27, 0, 37, 0, [[0, '#9a7448'], [1, '#5a3e22']]); g.fillRect(27, 20, 10, 10);
      g.fillStyle = '#2a2420'; g.fillRect(26.5, 22, 11, 1.4); g.fillRect(26.5, 27, 11, 1.4);
      g.fillStyle = LG(g, 46, 0, 58, 0, [[0, '#a8804e'], [1, '#5a3e22']]); g.fillRect(46, 32, 12, 12);
      ell(g, 52, 32, 6, 2); fs(g, '#3a2a1a');
      g.fillStyle = '#2a2420'; g.fillRect(45.5, 35, 13, 1.4); g.fillRect(45.5, 41, 13, 1.4);
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(8, 36, 2, 14);
    },
  });

  // ---- cart: wooden handcart with sacks (2x1) -----------------------------------------------------
  defObj('cart', {
    w: 2, h: 1, pad: [14, 50, 30, 10],
    paint(g, L, o, rng) {
      shadowEll(g, 66, 56, 58, 8, 0.4);
      // far wheel
      ell(g, 62, 30, 20, 20); fs(g, '#3a2818');
      // handles
      g.strokeStyle = '#3a2416'; g.lineWidth = 5; line(g, 96, 26, 126, 44);
      g.strokeStyle = '#7a5434'; g.lineWidth = 3.4; line(g, 96, 26, 126, 44);
      g.strokeStyle = '#5a3c24'; g.lineWidth = 3; line(g, 118, 40, 118, 56);
      // bed
      g.fillStyle = LG(g, 0, 4, 0, 18, [[0, '#a37a4e'], [1, '#7a5634']]); g.fillRect(12, 6, 88, 12);
      g.strokeStyle = 'rgba(40,24,12,0.5)'; g.lineWidth = 1; for (let x = 24; x < 100; x += 12) line(g, x, 6, x, 18);
      planks(g, 10, 18, 92, 14, '#6a4628', rng, 15);
      g.fillStyle = '#3a2416'; g.fillRect(10, 30, 92, 3);
      // load: sacks + jar
      for (const [sx, sy, sw] of [[22, 2, 18], [44, 0, 20], [34, -10, 18]]) {
        rr(g, sx - sw / 2 + 10, sy - 6, sw, 16, 6); fs(g, LG(g, 0, sy - 6, 0, sy + 10, [[0, '#e4d6b4'], [1, '#a8966e']]), '#6e5e40', 1);
        g.strokeStyle = '#8a3a2a'; g.lineWidth = 1.4; line(g, sx + 10 + sw / 2 - 3, sy - 4, sx + 10 + sw / 2 - 3, sy + 8);
        vchars(g, '米', sx + 10, sy + 2, 7, 'rgba(140,40,30,0.7)');
      }
      ell(g, 82, 0, 9, 10); fs(g, LG(g, 72, 0, 92, 0, [[0, '#8a5a32'], [1, '#4a2a14']]), '#2a160a', 1);
      g.fillStyle = '#c4281f'; g.fillRect(78, -12, 8, 4);
      // near wheel
      ell(g, 54, 36, 21, 21); fs(g, null, '#3a2416', 5);
      ell(g, 54, 36, 21, 21); g.strokeStyle = '#8a643e'; g.lineWidth = 3; g.stroke();
      for (let k = 0; k < 8; k++) { const a = k * PI / 4; g.strokeStyle = '#6a4a2a'; g.lineWidth = 2.2; line(g, 54, 36, 54 + cos(a) * 19, 36 + sin(a) * 19); }
      ell(g, 54, 36, 4.5, 4.5); fs(g, '#3a2a1a', '#1a100a', 1);
      g.strokeStyle = 'rgba(255,230,190,0.35)'; g.lineWidth = 1; g.beginPath(); g.arc(54, 36, 20, PI * 1.05, PI * 1.5); g.stroke();
    },
  });

  // ---- barrel / crate / jar / basket helpers -------------------------------------------------------
  function barrel(g, cx, by, rw, h, o = {}) {
    const top = by - h, col = o.col || '#8a5a32';
    shadowEll(g, cx + 3, by, rw * 1.15, rw * 0.35, 0.4);
    g.beginPath(); g.moveTo(cx - rw * 0.88, top); g.quadraticCurveTo(cx - rw * 1.08, by - h / 2, cx - rw * 0.88, by);
    g.ellipse(cx, by, rw * 0.88, rw * 0.3, 0, PI, 0, true); g.quadraticCurveTo(cx + rw * 1.08, by - h / 2, cx + rw * 0.88, top); g.closePath();
    g.fillStyle = LG(g, cx - rw, 0, cx + rw, 0, [[0, shade(col, -0.15)], [0.3, shade(col, 0.28)], [0.65, col], [1, shade(col, -0.45)]]); g.fill();
    g.strokeStyle = shade(col, -0.6); g.lineWidth = 1.2; g.stroke();
    g.save(); g.clip();
    g.strokeStyle = rgba(shade(col, -0.6), 0.45); g.lineWidth = 0.8;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(cx + k * rw * 0.26, top); g.quadraticCurveTo(cx + k * rw * 0.33, by - h / 2, cx + k * rw * 0.26, by); g.stroke(); }
    for (const f of [0.2, 0.78]) {
      const y = top + h * f;
      g.beginPath(); g.ellipse(cx, y, rw * 1.1, rw * 0.3, 0, 0, PI); g.strokeStyle = '#2a2622'; g.lineWidth = 3.2; g.stroke();
      g.beginPath(); g.ellipse(cx, y - 1, rw * 1.1, rw * 0.3, 0, PI * 0.1, PI * 0.5); g.strokeStyle = 'rgba(220,220,220,0.4)'; g.lineWidth = 1; g.stroke();
    }
    g.restore();
    ell(g, cx, top, rw * 0.88, rw * 0.3);
    fs(g, o.open ? LG(g, 0, top - 4, 0, top + 4, [[0, '#14202a'], [1, '#2e4a58']]) : LG(g, 0, top - 5, 0, top + 5, [[0, shade(col, 0.2)], [1, shade(col, -0.1)]]), shade(col, -0.6), 1.2);
    if (!o.open) { g.strokeStyle = rgba(shade(col, -0.6), 0.5); g.lineWidth = 0.8; for (let k = -1; k <= 1; k++) line(g, cx + k * rw * 0.3, top - rw * 0.26, cx + k * rw * 0.3, top + rw * 0.26); }
    else { ell(g, cx - rw * 0.3, top, rw * 0.25, rw * 0.06); g.fillStyle = 'rgba(220,240,255,0.35)'; g.fill(); }
  }
  defObj('barrel', {
    w: 1, h: 1, nv: 3, salt: 41, pad: [10, 30, 18, 8],
    paint(g, L) {
      if (L.v === 0) barrel(g, 32, 56, 18, 46, {});
      else if (L.v === 1) { barrel(g, 26, 54, 16, 42, { open: true }); barrel(g, 48, 58, 10, 22, { col: '#9a6a3a' }); }
      else { barrel(g, 40, 46, 14, 36, { col: '#7a4e2c' }); barrel(g, 24, 58, 15, 38, {}); }
    },
  });
  function crate(g, x, by, w, h, d, label, col = '#a07448') {
    const y = by - h;
    shadowEll(g, x + w / 2 + 4, by, w * 0.62, 5, 0.38);
    g.fillStyle = LG(g, 0, y - d, 0, y, [[0, shade(col, 0.3)], [1, shade(col, 0.12)]]); g.fillRect(x, y - d, w, d);
    g.strokeStyle = rgba(shade(col, -0.55), 0.6); g.lineWidth = 0.8; for (let k = 1; k < 4; k++) line(g, x, y - d + d * k / 4, x + w, y - d + d * k / 4);
    g.strokeStyle = shade(col, -0.5); g.lineWidth = 1.2; g.strokeRect(x, y - d, w, d);
    g.fillStyle = LG(g, x, 0, x + w, 0, [[0, shade(col, 0.05)], [1, shade(col, -0.25)]]); g.fillRect(x, y, w, h);
    g.strokeStyle = rgba(shade(col, -0.55), 0.55); g.lineWidth = 0.8; for (let k = 1; k < 4; k++) line(g, x, y + h * k / 4, x + w, y + h * k / 4);
    g.strokeStyle = shade(col, -0.4); g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    g.beginPath(); g.moveTo(x + 3, by - 3); g.lineTo(x + w - 3, y + 3); g.stroke();
    g.strokeStyle = rgba(shade(col, 0.5), 0.5); g.lineWidth = 0.8; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (label) { g.save(); g.globalAlpha = 0.8; hchars(g, label, x + w / 2, y + h / 2, h * 0.42, '#7a1e14'); g.restore(); }
  }
  defObj('crate', {
    w: 1, h: 1, nv: 3, salt: 43, pad: [10, 36, 18, 8],
    paint(g, L) {
      const lab = ['茶', '米', '鹽'];
      if (L.v === 0) crate(g, 10, 58, 44, 34, 12, lab[0]);
      else if (L.v === 1) { crate(g, 8, 58, 44, 30, 10, lab[1]); crate(g, 16, 18, 30, 22, 8, null, '#8a6440'); }
      else {
        crate(g, 6, 58, 34, 28, 10, lab[2]);
        rr(g, 38, 34, 22, 24, 8); fs(g, LG(g, 0, 34, 0, 58, [[0, '#e4d6b4'], [1, '#a8966e']]), '#6e5e40', 1);
        g.strokeStyle = '#8a3a2a'; g.lineWidth = 1.4; line(g, 41, 38, 57, 38);
      }
    },
  });
  function jar(g, cx, by, r, h, o = {}) {
    const col = o.col || '#6e3c1e', top = by - h;
    shadowEll(g, cx + 3, by, r * 1.05, r * 0.3, 0.4);
    g.beginPath(); g.moveTo(cx - r * 0.42, top + 2);
    g.bezierCurveTo(cx - r * 1.25, top + h * 0.22, cx - r * 1.05, by - h * 0.12, cx - r * 0.6, by);
    g.lineTo(cx + r * 0.6, by);
    g.bezierCurveTo(cx + r * 1.05, by - h * 0.12, cx + r * 1.25, top + h * 0.22, cx + r * 0.42, top + 2); g.closePath();
    g.fillStyle = RG(g, cx, top + h * 0.45, r * 1.3, [[0, shade(col, 0.4)], [0.5, col], [1, shade(col, -0.5)]], 0, cx - r * 0.45, top + h * 0.3); g.fill();
    g.strokeStyle = shade(col, -0.65); g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = 'rgba(255,240,220,0.45)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - r * 0.7, top + h * 0.3); g.quadraticCurveTo(cx - r * 0.9, top + h * 0.5, cx - r * 0.65, top + h * 0.75); g.stroke();
    ell(g, cx, top + 2, r * 0.46, r * 0.14); fs(g, shade(col, -0.2), shade(col, -0.65), 1);
    if (o.cloth) {
      g.beginPath(); g.moveTo(cx - r * 0.55, top + 4); g.quadraticCurveTo(cx, top - r * 0.35, cx + r * 0.55, top + 4); g.lineTo(cx + r * 0.62, top + 9); g.quadraticCurveTo(cx, top + 6, cx - r * 0.62, top + 9); g.closePath();
      fs(g, LG(g, 0, top - 4, 0, top + 9, [[0, '#d64a36'], [1, '#8a1e14']]), '#5a1008', 1);
      g.strokeStyle = '#e8c070'; g.lineWidth = 1.2; line(g, cx - r * 0.5, top + 6, cx + r * 0.5, top + 6);
    }
    if (o.label) {
      const ly = top + h * 0.5, s = r * 0.42;
      poly(g, [[cx, ly - s], [cx + s, ly], [cx, ly + s], [cx - s, ly]]); fs(g, '#d12e22', '#7a1410', 0.8);
      g.font = FONT(s * 1.05, true); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1a0806'; g.fillText(o.label, cx, ly + 0.5);
    }
  }
  defObj('jar', {
    w: 1, h: 1, nv: 3, salt: 47, pad: [10, 30, 18, 8],
    paint(g, L) {
      if (L.v === 0) jar(g, 32, 58, 20, 46, { cloth: true, label: '酒' });
      else if (L.v === 1) { jar(g, 42, 48, 13, 30, { col: '#5a3a24', cloth: true }); jar(g, 24, 58, 17, 38, { label: '醋', col: '#7a4422' }); jar(g, 50, 60, 9, 18, { col: '#8a5a32' }); }
      else {
        shadowEll(g, 35, 56, 28, 7, 0.4);
        g.beginPath(); g.moveTo(6, 30); g.quadraticCurveTo(6, 58, 20, 58); g.lineTo(44, 58); g.quadraticCurveTo(58, 58, 58, 30); g.closePath();
        fs(g, LG(g, 6, 0, 58, 0, [[0, '#7a6a5a'], [0.3, '#a89888'], [1, '#4a4038']]), '#2a2420', 1.2);
        ell(g, 32, 30, 26, 9); fs(g, '#8a7a6a', '#2a2420', 1.2);
        ell(g, 32, 31, 22, 7); fs(g, LG(g, 0, 24, 0, 38, [[0, '#18303a'], [1, '#3a6070']]));
        ell(g, 26, 31, 8, 1.5); g.fillStyle = 'rgba(220,240,255,0.3)'; g.fill();
        g.strokeStyle = '#7a5a3a'; g.lineWidth = 2.2; line(g, 40, 30, 58, 16); ell(g, 38, 31, 5, 2); fs(g, '#8a6a42', '#3a2a1a', 1);
      }
    },
  });
  const BASKET_GOODS = [
    (g, cx, cy, s, rng) => { for (let i = 0; i < 7; i++) { ell(g, cx + (rng() - 0.5) * s * 1.4, cy - rng() * s * 0.5, s * 0.32, s * 0.24, rng()); fs(g, mix('#8a6a9a', '#b89aa8', rng()), '#4a3050', 0.8); } }, // taro
    (g, cx, cy, s, rng) => { for (let i = 0; i < 5; i++) { const x = cx + (rng() - 0.5) * s * 1.2, y = cy - rng() * s * 0.4; ell(g, x, y, s * 0.5, s * 0.14, (rng() - 0.5) * 0.6); fs(g, LG(g, 0, y - 3, 0, y + 3, [[0, '#d8e4ea'], [1, '#6a8090']]), '#3a4a54', 0.8); } }, // fish
    (g, cx, cy, s, rng) => { for (let i = 0; i < 8; i++) { const x = cx + (rng() - 0.5) * s * 1.3, y = cy - rng() * s * 0.5; ell(g, x, y, s * 0.24, s * 0.22); fs(g, RG(g, x, y, s * 0.24, [[0, '#ffc060'], [1, '#d8701e']], 0, x - 1, y - 1), '#8a3a10', 0.7); } }, // oranges
    (g, cx, cy, s, rng) => { for (let i = 0; i < 12; i++) { ell(g, cx + (rng() - 0.5) * s * 1.4, cy - rng() * s * 0.5, s * 0.3, s * 0.12, rng() * 3); fs(g, mix('#3f7a3a', '#8fc060', rng()), '#2a4a20', 0.6); } }, // greens / tea
  ];
  function basket(g, cx, by, r, goods, rng) {
    shadowEll(g, cx + 2, by, r * 1.1, r * 0.3, 0.38);
    const top = by - r * 0.9;
    g.beginPath(); g.moveTo(cx - r, top); g.lineTo(cx - r * 0.72, by - 1); g.quadraticCurveTo(cx, by + 3, cx + r * 0.72, by - 1); g.lineTo(cx + r, top); g.closePath();
    g.fillStyle = LG(g, cx - r, 0, cx + r, 0, [[0, '#c8a868'], [0.4, '#b08a4c'], [1, '#6a5028']]); g.fill();
    g.save(); g.clip();
    g.strokeStyle = 'rgba(70,50,20,0.55)'; g.lineWidth = 0.8;
    for (let y = top + 3; y < by; y += 3.2) line(g, cx - r, y, cx + r, y + 0.5);
    for (let x = cx - r; x < cx + r; x += 4) line(g, x, top, x + (x - cx) * -0.15, by);
    g.restore();
    g.strokeStyle = '#5a4020'; g.lineWidth = 1; g.stroke();
    ell(g, cx, top, r, r * 0.3); fs(g, '#3a2a14');
    goods(g, cx, top + 1, r, rng);
    g.beginPath(); g.ellipse(cx, top, r, r * 0.3, 0, 0, PI); g.strokeStyle = '#d8b878'; g.lineWidth = 2.4; g.stroke();
    g.strokeStyle = '#6a5028'; g.lineWidth = 0.8; g.stroke();
  }
  defObj('basket', {
    w: 1, h: 1, nv: 4, salt: 53, pad: [10, 24, 18, 8],
    paint(g, L, o, rng) {
      const gd = BASKET_GOODS[L.v];
      basket(g, 42, 44, 14, gd, rng);
      basket(g, 24, 58, 18, gd, rng);
    },
  });

  // ---- stall: food stall with awning & steaming pot (2x1) -----------------------------------------
  const AWN = [['#c8342a', '#f0e6cf'], ['#2c3d6e', '#e8e0cc'], ['#3d7a5a', '#f0e6cf']];
  defObj('stall', {
    w: 2, h: 1, anim: true, nv: 3, salt: 57, pad: [18, 100, 28, 10],
    layout(L) { L.lan = { x: 114, y: -26, r: 7 }; },
    paint(g, L, o, rng) {
      const [c1, c2] = AWN[L.v];
      shadowEll(g, 68, 56, 64, 8, 0.4);
      for (const x of [10, 116]) { g.fillStyle = LG(g, x, 0, x + 5, 0, [[0, '#c2b46a'], [1, '#6a5e2e']]); g.fillRect(x, -58, 5, 114); }
      // counter
      g.fillStyle = LG(g, 0, 6, 0, 16, [[0, '#9a7048'], [1, '#6a4a2c']]); g.fillRect(4, 6, 120, 12);
      planks(g, 4, 16, 120, 38, '#5e3e24', rng, 14);
      g.fillStyle = '#3a2616'; g.fillRect(4, 16, 120, 3); g.fillRect(4, 51, 120, 4);
      // cloth banner on counter front
      g.fillStyle = LG(g, 0, 20, 0, 48, [[0, shade(c2, 0.05)], [1, shade(c2, -0.15)]]); g.fillRect(30, 20, 68, 28);
      g.strokeStyle = c1; g.lineWidth = 2; g.strokeRect(32, 22, 64, 24);
      const txt = String(L.text || '芋圓'); const n = [...txt].length;
      hchars(g, txt, 64, 34.5, min(17, 58 / n), c1 === '#f0e6cf' ? '#2a1a10' : c1, 1.04);
      // goods on top: pot, bowls, ladle
      ell(g, 30, 8, 15, 5); fs(g, '#2a2420');
      g.fillStyle = LG(g, 16, 0, 44, 0, [[0, '#6a6a70'], [0.35, '#b0b0b8'], [1, '#3a3a40']]); g.fillRect(16, -6, 28, 14);
      ell(g, 30, -6, 14, 4.5); fs(g, '#d8c8a0', '#3a3a40', 1.2);
      ell(g, 30, -6, 11, 3.2); fs(g, LG(g, 0, -9, 0, -3, [[0, '#f4ecd8'], [1, '#c8a878']]));
      for (let i = 0; i < 6; i++) { ell(g, 24 + rng() * 12, -6 + rng() * 2 - 1, 1.6, 1.2); fs(g, ['#b89aa8', '#e8c070', '#a0c080'][i % 3]); }
      for (let k = 0; k < 3; k++) { ell(g, 66 + k * 2, 4 - k * 3, 8, 3); fs(g, '#f2ede0', '#8a8478', 0.8); g.strokeStyle = '#3a6aa0'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(66 + k * 2, 4 - k * 3, 8, 3, 0, 0.2, PI - 0.2); g.stroke(); }
      for (const bx of [88, 100]) { ell(g, bx, 6, 6, 2.6); fs(g, '#f2ede0', '#8a8478', 0.8); ell(g, bx, 5.4, 4.2, 1.4); fs(g, '#9a7aa0'); }
      g.strokeStyle = '#5a3c24'; g.lineWidth = 1.6; line(g, 38, -10, 50, -22);
      // awning
      g.beginPath(); g.moveTo(-4, -64); g.lineTo(132, -64); g.lineTo(138, -40); g.lineTo(-10, -40); g.closePath();
      g.save(); g.clip();
      for (let x = -12, i = 0; x < 140; x += 12, i++) { g.fillStyle = i % 2 ? c2 : c1; g.beginPath(); g.moveTo(x + 2, -64); g.lineTo(x + 14, -64); g.lineTo(x + 13, -40); g.lineTo(x - 0.5, -40); g.closePath(); g.fill(); }
      g.fillStyle = LG(g, 0, -64, 0, -40, [[0, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,0,0,0.25)']]); g.fillRect(-12, -64, 152, 24);
      g.restore();
      for (let x = -10, i = 0; x < 138; x += 12, i++) {
        g.beginPath(); g.moveTo(x, -40); g.quadraticCurveTo(x + 6, -32, x + 12, -40); g.closePath();
        fs(g, i % 2 ? c2 : c1, rgba(shade(c1, -0.5), 0.6), 0.6);
      }
      g.strokeStyle = shade(c1, -0.5); g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4, -64); g.lineTo(132, -64); g.stroke();
      lantern(g, L.lan.x, L.lan.y, L.lan.r, { from: -36, lit: L.lit });
    },
    live(ctx, px, py, L, o, t) {
      ctx.save();
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.5 + k / 3) % 1;
        const x = px + 24 + k * 6 + sin(t * 2 + k * 2) * 3, y = py - 8 - ph * 34;
        const r = 5 + ph * 8;
        ctx.globalAlpha = 0.45 * sin(ph * PI);
        ctx.fillStyle = RG(ctx, x, y, r, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
    lights: (L) => (L.lit ? [LT(L.lan.x, L.lan.y, 80, LANTERN_LIGHT, 0.35), LT(30, -4, 50, '#ffb070', 0.2)] : []),
  });

  // ---- signboard: standing vertical sign with o.text ----------------------------------------------
  defObj('signboard', {
    w: 1, h: 1, pad: [12, 70, 20, 10],
    paint(g, L, o) {
      const txt = String(L.text || '客棧'), n = [...txt].length;
      const bh = max(54, n * 17 + 12), y0 = 50 - bh - 8;
      shadowEll(g, 34, 57, 18, 5, 0.4);
      for (const x of [17, 43]) { woodPost(g, x, y0 - 2, 5, 58 - y0, '#4a3220'); g.fillStyle = '#7a756a'; rr(g, x - 3, 52, 11, 6, 2); g.fill(); }
      const red = o.v === 1;
      vplaque(g, 20, y0, 24, bh, txt, red ? { bg: '#a3241e', fg: '#ffe7b0', rim: '#3a1a10' } : { bg: '#e8dcbc', fg: '#1e140e', rim: '#4a3220' });
      g.beginPath(); g.moveTo(32, y0 - 12); g.lineTo(50, y0); g.lineTo(14, y0); g.closePath(); fs(g, '#2e2f36', '#121216', 1);
    },
  });

  // ---- fences (w x 1 horizontal, or w=1 h>1 vertical run) -----------------------------------------
  function fenceDef(type, bamboo) {
    defObj(type, {
      w: 3, h: 1, pad: [8, 40, 18, 10],
      layout(L) { L.vert = L.h > 1 && L.w === 1; },
      paint(g, L, o, rng) {
        const { W, H } = L;
        const wood = '#7a6650';
        const postAt = (x, y, ph) => {
          if (bamboo) {
            g.fillStyle = LG(g, x - 3.8, 0, x + 3.8, 0, [[0, '#7a8a3e'], [0.35, '#c4c47a'], [1, '#4e5a26']]); g.fillRect(x - 3.8, y - ph, 7.6, ph);
            g.strokeStyle = 'rgba(40,50,20,0.6)'; g.lineWidth = 0.8; g.strokeRect(x - 3.8, y - ph, 7.6, ph);
            ell(g, x, y - ph, 3.8, 1.6); fs(g, '#e2d8a0', '#6a6a3a', 0.8);
            for (let k = y - ph + 14; k < y - 4; k += 15) { g.fillStyle = '#566428'; g.fillRect(x - 4.2, k, 8.4, 1.8); g.fillStyle = 'rgba(255,255,220,0.3)'; g.fillRect(x - 4.2, k + 1.8, 8.4, 0.8); }
          } else {
            woodPost(g, x - 3.5, y - ph, 7, ph, wood);
            g.fillStyle = shade(wood, 0.3); g.fillRect(x - 4.5, y - ph - 2, 9, 3);
          }
        };
        if (!L.vert) {
          shadowEll(g, W / 2 + 4, 58, W / 2, 5, 0.3);
          const step = bamboo ? 9 : 32, ph = bamboo ? 46 : 40;
          if (!bamboo) {
            for (const ry of [28, 44]) {
              g.fillStyle = LG(g, 0, ry - 3, 0, ry + 3, [[0, shade(wood, 0.25)], [1, shade(wood, -0.3)]]); g.fillRect(3, ry - 3, W - 6, 6);
              g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(3, ry + 3, W - 6, 1.5);
            }
          }
          for (let x = 5; x <= W - 4; x += step) postAt(min(x, W - 5), 58 - (bamboo ? rng() * 2 : 0), ph - (bamboo ? (x / step % 2 ? 6 : 0) + rng() * 3 : 0));
          if (!bamboo && (W - 5) % 32) postAt(W - 5, 58, ph);
          if (bamboo) for (const ry of [26, 44]) {
            g.fillStyle = LG(g, 0, ry - 3, 0, ry + 3, [[0, '#b0b860'], [1, '#5a6a2a']]); g.fillRect(1, ry - 3, W - 2, 5);
            for (let x = 8; x < W; x += 16) { g.strokeStyle = '#6a5030'; g.lineWidth = 1; line(g, x, ry - 4, x + 2, ry + 3); }
          }
          grime(g, 0, 10, W, 50, rng, 0.06);
        } else {
          // vertical run: posts down the column, rails seen from above
          const step = bamboo ? 10 : 32, ph = bamboo ? 46 : 40;
          shadowEll(g, 36, H / 2, 8, H / 2, 0.25);
          if (!bamboo) for (const off of [14, 30]) { g.fillStyle = LG(g, 28, 0, 36, 0, [[0, shade(wood, 0.25)], [1, shade(wood, -0.3)]]); g.fillRect(29, 8 - (ph - off), 6, H - 10); }
          for (let y = 8; y <= H - 4; y += step) postAt(32, y + ph * 0.25, bamboo ? ph * 0.7 : ph * 0.75);
        }
      },
    });
  }
  fenceDef('fence_wood', false);
  fenceDef('fence_bamboo', true);

  // ---- bench (2x1 default; v1 = stone) ------------------------------------------------------------
  defObj('bench', {
    w: 2, h: 1, resize: 'w', pad: [8, 20, 16, 8],
    paint(g, L, o, rng) {
      const { W } = L, stone = o.v === 1;
      shadowEll(g, W / 2 + 4, 56, W / 2 - 4, 5, 0.38);
      const legs = [10, W - 18]; if (W > 128) legs.push(W / 2 - 4);
      for (const x of legs) {
        if (stone) { g.fillStyle = LG(g, x - 2, 0, x + 12, 0, [[0, '#b8b3a6'], [1, '#77736a']]); g.fillRect(x - 2, 36, 14, 20); }
        else { woodPost(g, x, 38, 7, 18, '#4a3220'); }
      }
      if (stone) {
        g.fillStyle = LG(g, 0, 24, 0, 34, [[0, '#d0ccc0'], [1, '#a8a498']]); g.fillRect(4, 24, W - 8, 10);
        g.fillStyle = LG(g, 0, 34, 0, 40, [[0, '#9a968a'], [1, '#77736a']]); g.fillRect(4, 34, W - 8, 6);
        grime(g, 4, 24, W - 8, 16, rng, 0.12);
      } else {
        for (let k = 0; k < 3; k++) { g.fillStyle = LG(g, 0, 24 + k * 4, 0, 28 + k * 4, [[0, '#a87a4e'], [1, '#7a5432']]); g.fillRect(4, 24 + k * 4, W - 8, 3.4); }
        g.fillStyle = LG(g, 0, 36, 0, 40, [[0, '#6a4628'], [1, '#4a2e18']]); g.fillRect(4, 36, W - 8, 4);
        g.strokeStyle = 'rgba(40,20,10,0.35)'; g.lineWidth = 0.6; for (let i = 0; i < W / 10; i++) { const x = 6 + rng() * (W - 16); line(g, x, 25 + rng() * 10, x + 8, 25 + rng() * 10); }
      }
    },
  });

  // ---- laundry line (2x1; posts solid, middle cells passable when w>2) ----------------------------
  const CLOTHES = ['#2c3d6e', '#f0ece2', '#c8342a', '#d9a23a', '#6a8a9a', '#f0ece2'];
  defObj('laundry', {
    w: 2, h: 1, resize: 'w', anim: true, pad: [10, 100, 20, 10],
    solidAt: (L, dx) => dx === 0 || dx === L.w - 1,
    layout(L) {
      L.items = [];
      const n = max(2, floor((L.W - 24) / 24));
      for (let i = 0; i < n; i++) L.items.push({ x: 16 + (i + 0.5) * (L.W - 32) / n, k: i % 3, col: CLOTHES[(i * 2 + L.w) % CLOTHES.length] });
    },
    paint(g, L) {
      const { W } = L;
      for (const x of [8, W - 8]) {
        shadowEll(g, x + 3, 57, 9, 3, 0.4);
        g.fillStyle = LG(g, x - 3, 0, x + 3, 0, [[0, '#c2b46a'], [1, '#6a5e2e']]); g.fillRect(x - 2.5, -66, 5, 122);
        g.fillStyle = '#8a8478'; rr(g, x - 6, 50, 12, 7, 2); g.fill();
      }
    },
    live(ctx, px, py, L, o, t) {
      const W = L.W, y0 = py - 60;
      ctx.save();
      ctx.strokeStyle = '#d8ccb0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 8, y0); ctx.quadraticCurveTo(px + W / 2, y0 + 10, px + W - 8, y0); ctx.stroke();
      for (const it of L.items) {
        const u = (it.x - 8) / (W - 16), hy = y0 + 10 * 2 * u * (1 - u) * 2 * 0.5 + 2;
        const sw = sin(t * 2 + it.x * 0.1) * 0.08;
        ctx.save(); ctx.translate(px + it.x, hy); ctx.rotate(sw);
        ctx.fillStyle = it.col; ctx.strokeStyle = rgba(shade(it.col, -0.5), 0.8); ctx.lineWidth = 1;
        ctx.beginPath();
        if (it.k === 0) { ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.lineTo(14, 8); ctx.lineTo(9, 10); ctx.lineTo(8, 26); ctx.lineTo(-8, 26); ctx.lineTo(-9, 10); ctx.lineTo(-14, 8); }
        else if (it.k === 1) { ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(9, 28); ctx.lineTo(2, 28); ctx.lineTo(0, 10); ctx.lineTo(-2, 28); ctx.lineTo(-9, 28); }
        else { ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(10 + sw * 20, 34); ctx.lineTo(-10 + sw * 20, 34); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        const gr = ctx.createLinearGradient(-10, 0, 10, 0); gr.addColorStop(0, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = gr; ctx.fill();
        ctx.fillStyle = '#6a5a3a'; ctx.fillRect(-5, -2, 2, 4); ctx.fillRect(3, -2, 2, 4);
        ctx.restore();
      }
      ctx.restore();
    },
  });

  // ---- boats ------------------------------------------------------------------------------------------
  function hull(g, x0, x1, gun, deep, bowLift, col) {
    const mid = (x0 + x1) / 2;
    // inner floor (seen from above)
    g.beginPath(); g.moveTo(x0 + 4, gun - bowLift * 0.6);
    g.quadraticCurveTo(mid, gun - deep * 0.55, x1 - 4, gun - bowLift);
    g.quadraticCurveTo(mid, gun + deep * 0.15, x0 + 4, gun - bowLift * 0.6); g.closePath();
    g.fillStyle = LG(g, 0, gun - deep * 0.5, 0, gun, [[0, shade(col, -0.45)], [1, shade(col, -0.2)]]); g.fill();
    // outer side
    g.beginPath(); g.moveTo(x0, gun - bowLift * 0.7);
    g.quadraticCurveTo(mid, gun + deep * 0.25, x1, gun - bowLift);
    g.quadraticCurveTo(x1 - 10, gun + deep * 0.8, mid, gun + deep);
    g.quadraticCurveTo(x0 + 10, gun + deep * 0.8, x0, gun - bowLift * 0.7); g.closePath();
    g.fillStyle = LG(g, 0, gun, 0, gun + deep, [[0, shade(col, 0.15)], [0.5, col], [1, shade(col, -0.45)]]); g.fill();
    g.strokeStyle = shade(col, -0.6); g.lineWidth = 1.4; g.stroke();
    g.save(); g.clip();
    g.strokeStyle = rgba(shade(col, -0.6), 0.45); g.lineWidth = 0.8;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x0, gun - bowLift * 0.7 + k * deep * 0.22); g.quadraticCurveTo(mid, gun + deep * 0.25 + k * deep * 0.2, x1, gun - bowLift + k * deep * 0.22); g.stroke(); }
    g.restore();
    // gunwale
    g.beginPath(); g.moveTo(x0, gun - bowLift * 0.7); g.quadraticCurveTo(mid, gun + deep * 0.25, x1, gun - bowLift);
    g.strokeStyle = shade(col, -0.55); g.lineWidth = 4; g.stroke(); g.strokeStyle = shade(col, 0.35); g.lineWidth = 1.6; g.stroke();
  }
  function waterLine(ctx, x0, x1, y, t, seed) {
    ctx.save();
    ctx.strokeStyle = 'rgba(210,235,255,0.35)'; ctx.lineWidth = 1.2;
    for (let k = 0; k < 2; k++) {
      const ph = (t * 0.6 + k * 0.5 + seed) % 1;
      ctx.globalAlpha = 0.6 * (1 - ph);
      ctx.beginPath(); ctx.ellipse((x0 + x1) / 2, y, (x1 - x0) / 2 + 4 + ph * 14, 5 + ph * 5, 0, 0.1, PI - 0.1); ctx.stroke();
    }
    ctx.restore();
  }
  defObj('boat_small', {
    w: 2, h: 1, anim: true, pad: [12, 44, 24, 14],
    paint(g, L, o, rng) {
      hull(g, 2, 126, 30, 22, 10, '#7a5434');
      g.fillStyle = '#5a3a22'; for (const x of [30, 98]) g.fillRect(x, 16, 4, 16);
      // canopy 篷
      g.beginPath(); g.moveTo(44, 30); g.bezierCurveTo(44, -4, 88, -4, 88, 30); g.closePath();
      fs(g, LG(g, 44, 0, 88, 0, [[0, '#8a7448'], [0.4, '#c4a870'], [1, '#5a4828']]), '#3a2a14', 1.2);
      g.save(); g.clip(); g.strokeStyle = 'rgba(60,40,20,0.45)'; g.lineWidth = 0.8;
      for (let x = 44; x < 90; x += 4) line(g, x, -4, x, 32);
      for (let y = 2; y < 32; y += 5) line(g, 44, y, 90, y);
      g.restore();
      g.beginPath(); g.moveTo(50, 30); g.bezierCurveTo(50, 8, 82, 8, 82, 30); g.closePath(); fs(g, '#1a120c');
      g.strokeStyle = '#6a4a2a'; g.lineWidth = 2.4; line(g, 8, 6, 40, 40);
      g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(36, 37, 3, 8, -0.7, 0, TAU); g.fill();
    },
    live(ctx, px, py, L, o, t) { waterLine(ctx, px + 4, px + 124, py + 46, t, seedOf(o)); },
  });
  defObj('boat_ferry', {
    w: 3, h: 2, anim: true, pad: [14, 80, 30, 16],
    layout(L, o) { L.col = o.color || '#ffcf6a'; L.lan = { x: 168, y: -30 }; },
    paint(g, L, o, rng) {
      hull(g, 4, 188, 80, 36, 22, '#4a3220');
      g.fillStyle = '#3a2416'; for (const x of [30, 150]) g.fillRect(x, 54, 5, 26);
      // eye 龍目 on the bow
      ell(g, 164, 82, 6, 5); fs(g, '#f2ede0', '#1a0c08', 1); ell(g, 165, 82, 3, 3); fs(g, '#1a0c08'); ell(g, 164, 82, 8, 6.5); g.strokeStyle = '#c4281f'; g.lineWidth = 1.5; g.stroke();
      // cabin canopy
      g.beginPath(); g.moveTo(66, 78); g.lineTo(66, 34); g.bezierCurveTo(66, 4, 128, 4, 128, 34); g.lineTo(128, 78); g.closePath();
      fs(g, LG(g, 66, 0, 128, 0, [[0, '#6a5838'], [0.35, '#a8905e'], [1, '#3a301c']]), '#241a0e', 1.2);
      g.save(); g.clip(); g.strokeStyle = 'rgba(40,28,12,0.45)'; g.lineWidth = 0.8;
      for (let x = 66; x < 130; x += 4) line(g, x, 4, x, 80);
      for (let y = 10; y < 80; y += 6) line(g, 66, y, 130, y);
      g.restore();
      g.beginPath(); g.moveTo(76, 78); g.lineTo(76, 40); g.bezierCurveTo(76, 20, 118, 20, 118, 40); g.lineTo(118, 78); g.closePath(); fs(g, '#120c08');
      g.fillStyle = RG(g, 97, 66, 22, [[0, 'rgba(255,190,100,0.45)'], [1, 'rgba(255,190,100,0)']]); g.fill();
      // stern scull oar
      g.strokeStyle = '#5a3c22'; g.lineWidth = 3; line(g, 14, 50, -6, 104);
      g.fillStyle = '#5a3c22'; g.beginPath(); g.ellipse(-6, 102, 3.5, 10, 0.35, 0, TAU); g.fill();
      // lantern pole at the bow
      g.strokeStyle = '#3a2416'; g.lineWidth = 4; g.beginPath(); g.moveTo(176, 74); g.quadraticCurveTo(180, 10, 168, -44); g.stroke();
      g.strokeStyle = '#7a5434'; g.lineWidth = 2; g.stroke();
    },
    live(ctx, px, py, L, o, t) {
      waterLine(ctx, px + 8, px + 184, py + 112, t, seedOf(o));
      const a = 0.09 * sin(t * 1.3 + px * 0.02);
      drawLanternSprite(ctx, px + L.lan.x, py + L.lan.y - 14, 9, L.col === '#ffcf6a' ? '#e8a33a' : L.col, null, 6, a, true);
      liveGlow(ctx, px + L.lan.x, py + L.lan.y + 8, 34, L.col, 0.3 * flick(t, px));
    },
    lights: (L) => [LT(L.lan.x, L.lan.y + 8, 120, L.col, 0.3)],
  });
  // boats bob: wrap their draw so the cached hull moves with the water
  for (const type of ['boat_small', 'boat_ferry']) {
    const d = G.Objects.get(type), base = d.draw;
    d.draw = (ctx, px, py, o, t) => {
      const s = seedOf(o);
      const bob = sin(t * 1.4 + s) * 1.8;
      base(ctx, px, py + bob, o, t);
    };
  }

  // ---- dock_post: wooden piling(s) with rope ------------------------------------------------------
  defObj('dock_post', {
    w: 1, h: 1, nv: 2, salt: 61, pad: [10, 40, 18, 10],
    paint(g, L) {
      const pile = (x, top, w, bot) => {
        g.fillStyle = LG(g, x - w / 2, 0, x + w / 2, 0, [[0, '#6a5440'], [0.3, '#9a8062'], [1, '#3a2c1e']]); g.fillRect(x - w / 2, top, w, bot - top);
        g.fillStyle = LG(g, 0, bot - 14, 0, bot, [[0, 'rgba(40,70,50,0)'], [1, 'rgba(40,70,50,0.75)']]); g.fillRect(x - w / 2, bot - 14, w, 14);
        ell(g, x, top, w / 2, w * 0.2); fs(g, '#a88a68', '#3a2c1e', 1);
        g.strokeStyle = 'rgba(60,40,24,0.6)'; g.lineWidth = 0.6; ell(g, x, top, w * 0.25, w * 0.1); g.stroke();
        for (let k = 0; k < 4; k++) { const y = top + 12 + k * 3; g.strokeStyle = '#d8c8a0'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(x, y, w / 2 + 1, 2, 0, 0, PI); g.stroke(); g.strokeStyle = 'rgba(90,70,40,0.6)'; g.lineWidth = 0.6; g.stroke(); }
      };
      if (L.v === 0) pile(32, -10, 16, 58);
      else { pile(22, -4, 14, 56); pile(42, 4, 12, 60); g.strokeStyle = '#d8c8a0'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(22, 10); g.quadraticCurveTo(32, 20, 42, 16); g.stroke(); }
    },
    live(ctx, px, py, L, o, t) { waterLine(ctx, px + 16, px + 48, py + 56, t, seedOf(o)); },
    anim: true,
  });

  // ---- water_lantern 水燈頭 (floating, bob, flicker, light) ---------------------------------------
  defObj('water_lantern', {
    w: 1, h: 1, solid: false, anim: true,
    layout(L, o) { L.col = o.color || '#c9302a'; L.txt = String(o.text || '陳'); },
    key: (o) => o.color || '',
    live(ctx, px, py, L, o, t) {
      const s = seedOf(o);
      const bob = sin(t * 1.6 + s) * 2.2, tilt = 0.04 * sin(t * 1.1 + s * 1.3);
      const f = flick(t, s);
      // reflection on water
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 5; k++) {
        const y = py + 52 + k * 4, w = (14 - k * 2) * (0.8 + 0.2 * sin(t * 3 + k + s));
        ctx.fillStyle = `rgba(255,170,80,${(0.28 - k * 0.05) * f})`;
        ctx.fillRect(px + 32 - w + sin(t * 2 + k) * 2, y, w * 2, 1.6);
      }
      ctx.restore();
      waterLine(ctx, px + 10, px + 54, py + 48 + bob, t, s);
      const c = art('wlantern|' + L.col + '|' + L.txt, 72, 72, (g) => {
        g.translate(4, 8);
        // raft
        ell(g, 32, 44, 26, 8); fs(g, LG(g, 0, 36, 0, 52, [[0, '#a8824e'], [1, '#5a3e22']]), '#3a2614', 1);
        g.strokeStyle = 'rgba(50,30,14,0.5)'; g.lineWidth = 0.8; for (let x = 12; x < 54; x += 7) line(g, x, 37, x, 51);
        // paper house body
        const col = L.col;
        g.fillStyle = LG(g, 14, 0, 50, 0, [[0, shade(col, 0.2)], [1, shade(col, -0.25)]]); g.fillRect(16, 16, 32, 26);
        g.strokeStyle = '#e8b53a'; g.lineWidth = 1.4; g.strokeRect(17, 17, 30, 24);
        g.fillStyle = RG(g, 32, 29, 9, [[0, '#fff6d0'], [1, '#ffb050']]); g.fillRect(25, 21, 14, 14);
        g.strokeStyle = shade(col, -0.4); g.lineWidth = 1; line(g, 32, 21, 32, 35); line(g, 25, 28, 39, 28);
        g.font = FONT(9, true); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2a0c08'; g.fillText([...L.txt][0], 20.5, 29); g.fillText([...L.txt][1] || '', 43.5, 29);
        // roof
        g.beginPath(); g.moveTo(10, 18); g.lineTo(54, 18); g.lineTo(46, 6); g.lineTo(18, 6); g.closePath();
        fs(g, LG(g, 0, 6, 0, 18, [[0, '#f0c050'], [1, '#c88a22']]), '#7a4a10', 1);
        swallowTail(g, 18, 7, -1, 6, '#c9302a', 2.5);
        swallowTail(g, 46, 7, 1, 6, '#c9302a', 2.5);
        ell(g, 32, 3, 2.6, 2.6); fs(g, '#ffe080', '#a8601a', 0.8);
      });
      ctx.save(); ctx.translate(px + 32, py + 50 + bob); ctx.rotate(tilt);
      ctx.drawImage(c, -36, -50, c.lw, c.lh);
      ctx.restore();
      liveGlow(ctx, px + 32, py + 30 + bob, 46, '#ffaa50', 0.32 * f);
    },
    lights: () => [LT(32, 30, 110, '#ffb060', 0.35)],
  });

  // ---- sky_lantern 天燈 (floating high above its cell, over:true, non-solid) ------------------------
  const SKY_COLS = ['#d8432f', '#f2e6c8', '#e8b13a', '#e88a9a'];
  defObj('sky_lantern', {
    w: 1, h: 1, solid: false, over: true, anim: true, nv: 4, salt: 67,
    layout(L, o) { L.alt = o.alt != null ? o.alt : 150; L.txt = String(o.text || ['平安', '心願', '團圓', '如意'][L.v]); },
    live(ctx, px, py, L, o, t) {
      const s = seedOf(o);
      const dy = sin(t * 0.9 + s) * 6, dx = sin(t * 0.5 + s * 2) * 3;
      const c = art('skylantern|' + L.v + '|' + L.txt, 56, 70, (g) => {
        const col = SKY_COLS[L.v];
        g.translate(28, 6);
        g.beginPath(); g.moveTo(-17, 0); g.quadraticCurveTo(0, -5, 17, 0); g.quadraticCurveTo(15, 24, 13, 46); g.lineTo(-13, 46); g.quadraticCurveTo(-15, 24, -17, 0); g.closePath();
        g.fillStyle = LG(g, 0, 0, 0, 46, [[0, shade(col, -0.1)], [0.6, mix(col, '#ffd890', 0.45)], [1, mix(col, '#fff4d0', 0.75)]]); g.fill();
        g.strokeStyle = shade(col, -0.45); g.lineWidth = 1; g.stroke();
        g.save(); g.clip();
        g.fillStyle = LG(g, -17, 0, 17, 0, [[0, 'rgba(0,0,0,0.18)'], [0.4, 'rgba(255,255,255,0.12)'], [1, 'rgba(0,0,0,0.25)']]); g.fillRect(-18, -6, 36, 54);
        g.strokeStyle = rgba(shade(col, -0.5), 0.35); g.lineWidth = 0.7; line(g, -6, -2, -5, 46); line(g, 6, -2, 5, 46);
        g.restore();
        vchars(g, L.txt, 0, 20, 10, 'rgba(30,14,8,0.75)', 1.15);
        g.strokeStyle = '#4a3020'; g.lineWidth = 1; line(g, -13, 46, 13, 46); line(g, -13, 46, 0, 52); line(g, 13, 46, 0, 52);
      });
      const x = px + 32 + dx, y = py + 32 - L.alt + dy;
      liveGlow(ctx, x, y + 10, 50, '#ffa040', 0.22 * flick(t, s));
      ctx.drawImage(c, x - 28, y - 30, c.lw, c.lh);
      liveGlow(ctx, x, y + 22, 9, '#fff0a0', 0.9 * flick(t * 1.3, s));
    },
    lights: (L) => [LT(32, 32 - L.alt + 10, 120, '#ffb050', 0.3)],
  });

  // ---- statue_lion 石獅 (o.flip mirrors; v0 male with ball, v1 female with cub) ------------------
  defObj('statue_lion', {
    w: 1, h: 1, nv: 2, salt: 71, pad: [14, 64, 22, 10],
    key: (o) => (o.flip ? 'f' : ''),
    paint(g, L, o, rng) {
      shadowEll(g, 36, 57, 22, 6, 0.42);
      const st = (x0, x1) => LG(g, x0, 0, x1, 0, [[0, '#d2cec2'], [0.4, '#b0ac9f'], [1, '#6e6a60']]);
      g.fillStyle = st(10, 54); g.fillRect(10, 30, 44, 27); g.fillStyle = '#d6d2c6'; g.fillRect(8, 27, 48, 4);
      g.fillStyle = 'rgba(80,76,68,0.35)'; g.fillRect(16, 36, 32, 15); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.strokeRect(16, 36, 32, 15);
      g.save(); if (o.flip) { g.translate(64, 0); g.scale(-1, 1); }
      const S = '#b6b2a5', D = '#5e5a50';
      // haunch & back
      ell(g, 42, 12, 13, 15); fs(g, st(29, 55), D, 1.2);
      // tail curl
      g.strokeStyle = D; g.lineWidth = 1.2; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(50, -2 + k * 5, 4, PI * 1.2, PI * 2.6); g.stroke(); }
      // chest & front legs
      g.beginPath(); g.moveTo(18, 0); g.quadraticCurveTo(16, 20, 18, 28); g.lineTo(40, 28); g.quadraticCurveTo(42, 12, 36, -2); g.closePath(); fs(g, st(16, 42), D, 1.2);
      for (const lx of [20, 31]) { g.fillStyle = st(lx, lx + 8); g.fillRect(lx, 8, 8, 20); g.strokeStyle = D; g.lineWidth = 1; g.strokeRect(lx, 8, 8, 20); for (let k = 0; k < 3; k++) { ell(g, lx + 1.5 + k * 2.5, 27, 1.4, 1.4); fs(g, S, D, 0.6); } }
      if (L.v === 0) { ell(g, 40, 22, 6, 6); fs(g, st(34, 46), D, 1); g.strokeStyle = 'rgba(80,76,68,0.6)'; g.beginPath(); g.arc(40, 22, 3.5, 0, PI * 1.5); g.stroke(); }
      else { ell(g, 41, 23, 5, 4.5); fs(g, st(36, 46), D, 1); ell(g, 42, 18, 3.4, 3); fs(g, st(38, 46), D, 1); }
      // mane & head
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; ell(g, 27 + cos(a) * 13, -14 + sin(a) * 12, 4.4, 4.4); fs(g, st(20, 36), D, 1); }
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.strokeStyle = 'rgba(70,66,58,0.55)'; g.lineWidth = 0.8; g.beginPath(); g.arc(27 + cos(a) * 13, -14 + sin(a) * 12, 2.2, 0, PI * 1.4); g.stroke(); }
      ell(g, 27, -13, 11, 10.5); fs(g, st(16, 38), D, 1.2);
      ell(g, 22, -17, 3.2, 3); fs(g, '#e4e0d4', D, 1); ell(g, 32, -17, 3.2, 3); fs(g, '#e4e0d4', D, 1);
      ell(g, 22.6, -16.6, 1.3, 1.3); fs(g, '#3a3830'); ell(g, 32.6, -16.6, 1.3, 1.3); fs(g, '#3a3830');
      g.beginPath(); g.moveTo(21, -20.5); g.lineTo(25, -21.5); g.moveTo(29, -21.5); g.lineTo(33, -20.5); g.strokeStyle = D; g.lineWidth = 1.4; g.stroke();
      ell(g, 27, -11, 4, 2.6); fs(g, '#9a968a', D, 1);
      g.beginPath(); g.moveTo(20, -7); g.quadraticCurveTo(27, 0, 34, -7); g.quadraticCurveTo(27, -3, 20, -7); g.closePath(); fs(g, '#4a463e');
      g.fillStyle = '#e4e0d4'; g.fillRect(22, -6.5, 2, 2); g.fillRect(30, -6.5, 2, 2);
      g.restore();
      grime(g, 8, -30, 48, 88, rng, 0.1);
    },
  });

  // ---- wind_lion 風獅爺 (standing lion with red cape) ---------------------------------------------
  defObj('wind_lion', {
    w: 1, h: 1, pad: [14, 70, 22, 10],
    paint(g, L, o, rng) {
      shadowEll(g, 36, 57, 20, 6, 0.42);
      const st = (x0, x1) => LG(g, x0, 0, x1, 0, [[0, '#d6c8a8'], [0.4, '#b4a482'], [1, '#6e6248']]);
      const D = '#5a4e38';
      g.fillStyle = st(14, 50); g.fillRect(14, 46, 36, 11); g.fillStyle = '#d8ccb0'; g.fillRect(12, 44, 40, 3);
      // legs
      for (const lx of [22, 35]) { g.fillStyle = st(lx, lx + 8); rr(g, lx, 22, 8, 23, 3); g.fill(); g.strokeStyle = D; g.lineWidth = 1; g.stroke(); }
      // body
      g.beginPath(); g.moveTo(18, -6); g.quadraticCurveTo(14, 14, 20, 26); g.lineTo(44, 26); g.quadraticCurveTo(50, 14, 46, -6); g.closePath(); fs(g, st(14, 50), D, 1.2);
      ell(g, 32, 12, 7, 8); fs(g, '#cbbd9c', D, 0.8);
      // arms holding
      for (const s of [-1, 1]) { g.strokeStyle = D; g.lineWidth = 6; line(g, 32 + s * 13, -2, 32 + s * 6, 10); g.strokeStyle = '#bfb08e'; g.lineWidth = 4.4; line(g, 32 + s * 13, -2, 32 + s * 6, 10); }
      // red cape
      g.beginPath(); g.moveTo(16, -8); g.quadraticCurveTo(32, -2, 48, -8); g.lineTo(52, 18); g.quadraticCurveTo(48, 22, 46, 14); g.lineTo(44, -2); g.quadraticCurveTo(32, 4, 20, -2); g.lineTo(18, 14); g.quadraticCurveTo(16, 22, 12, 18); g.closePath();
      fs(g, LG(g, 12, 0, 52, 0, [[0, '#e04a36'], [1, '#8a1a12']]), '#5a0e08', 1);
      ell(g, 32, -4, 3, 2.4); fs(g, '#e8c070', '#7a5a10', 0.8);
      // head & mane
      for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ell(g, 32 + cos(a) * 12, -22 + sin(a) * 11, 4.2, 4.2); fs(g, st(22, 42), D, 1); }
      ell(g, 32, -22, 10.5, 10); fs(g, st(20, 44), D, 1.2);
      ell(g, 27, -25, 3.4, 3.4); fs(g, '#f4eee0', D, 1); ell(g, 37, -25, 3.4, 3.4); fs(g, '#f4eee0', D, 1);
      ell(g, 27.5, -24.5, 1.5, 1.5); fs(g, '#2a2418'); ell(g, 37.5, -24.5, 1.5, 1.5); fs(g, '#2a2418');
      ell(g, 32, -19.5, 3.6, 2.4); fs(g, '#a8987a', D, 0.8);
      g.beginPath(); g.moveTo(25, -16); g.quadraticCurveTo(32, -9, 39, -16); g.quadraticCurveTo(32, -13, 25, -16); g.closePath(); fs(g, '#a8322a');
      g.fillStyle = '#f4eee0'; g.fillRect(27, -15.5, 2, 1.8); g.fillRect(35, -15.5, 2, 1.8);
      grime(g, 12, -36, 40, 94, rng, 0.1);
    },
  });

  // ---- banner: tall pole with a waving flag (o.color, o.text) -------------------------------------
  defObj('banner', {
    w: 1, h: 1, anim: true, pad: [12, 124, 20, 10],
    layout(L, o) { L.col = o.color || '#c0312b'; L.edge = o.edge || '#e8b53a'; L.txt = String(o.text || '燈'); },
    paint(g) {
      shadowEll(g, 20, 57, 12, 4, 0.4);
      for (const s of [-1, 1]) { g.fillStyle = LG(g, 0, 36, 0, 58, [[0, '#b8b3a6'], [1, '#77736a']]); g.fillRect(17 + s * 6 - 2.5, 36, 5, 21); }
      g.fillStyle = LG(g, 14, 0, 20, 0, [[0, '#7a5434'], [0.4, '#a87a4e'], [1, '#4a3020']]); g.fillRect(14.5, -112, 5, 170);
      g.fillStyle = '#3a2416'; g.fillRect(15, -104, 34, 3);
      ell(g, 17, -116, 3.5, 4.5); fs(g, '#e8c060', '#7a5a10', 1);
    },
    live(ctx, px, py, L, o, t) {
      const x0 = px + 19, y0 = py - 101, fw = 28, fh = 88, N = 14, s = seedOf(o);
      const off = (i) => sin(t * 2.6 - i * 0.45 + s) * 3.2 * (i / N);
      ctx.save();
      for (let i = 0; i < N; i++) {
        const ya = y0 + fh * i / N, yb = y0 + fh * (i + 1) / N + 0.6;
        const oa = off(i), ob = off(i + 1);
        const sh = cos(t * 2.6 - i * 0.45 + s) * 0.18;
        ctx.fillStyle = shade(L.col, sh);
        ctx.beginPath(); ctx.moveTo(x0 + oa, ya); ctx.lineTo(x0 + fw + oa * 1.3, ya); ctx.lineTo(x0 + fw + ob * 1.3, yb); ctx.lineTo(x0 + ob, yb); ctx.closePath(); ctx.fill();
        // serrated flame edge 火焰邊 on the free side
        ctx.fillStyle = L.edge;
        ctx.beginPath(); ctx.moveTo(x0 + fw + oa * 1.3, ya); ctx.lineTo(x0 + fw + 5 + (oa + ob) * 0.65, (ya + yb) / 2); ctx.lineTo(x0 + fw + ob * 1.3, yb); ctx.closePath(); ctx.fill();
      }
      const yb = y0 + fh, ob = off(N);
      ctx.fillStyle = L.edge;
      for (let k = 0; k < 4; k++) { const xa = x0 + ob + k * fw / 4; ctx.beginPath(); ctx.moveTo(xa, yb); ctx.lineTo(xa + fw / 8, yb + 6); ctx.lineTo(xa + fw / 4, yb); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = rgba(shade(L.col, -0.5), 0.7); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0); for (let i = 0; i <= N; i++) ctx.lineTo(x0 + off(i), y0 + fh * i / N); ctx.stroke();
      const ch = [...L.txt]; const size = min(18, (fh - 16) / ch.length);
      ctx.font = FONT(size, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ch.forEach((c, k) => {
        const yy = y0 + fh / 2 + (k - (ch.length - 1) / 2) * size * 1.1;
        const i = clamp((yy - y0) / fh * N, 0, N);
        ctx.fillStyle = rgba('#000000', 0.25); ctx.fillText(c, x0 + fw / 2 + off(i) * 1.15 + 0.8, yy + 0.8);
        ctx.fillStyle = '#fff0c0'; ctx.fillText(c, x0 + fw / 2 + off(i) * 1.15, yy);
      });
      ctx.restore();
    },
  });

  // ---- grave (v0 horseshoe tomb, v1 old weathered stone, v2 wooden marker) ------------------------
  defObj('grave', {
    w: 1, h: 1, nv: 3, salt: 73, pad: [10, 30, 18, 8],
    paint(g, L, o, rng) {
      const grass = (x, y, n) => { for (let i = 0; i < n; i++) { const gx = x + (rng() - 0.5) * 40, gy = y + (rng() - 0.5) * 14; g.strokeStyle = mix('#4a6a32', '#8aa858', rng()); g.lineWidth = 1.2; line(g, gx, gy, gx + rng() * 4 - 2, gy - 4 - rng() * 5); } };
      shadowEll(g, 34, 54, 28, 7, 0.35);
      if (L.v === 0) {
        ell(g, 32, 22, 27, 15); fs(g, LG(g, 0, 7, 0, 37, [[0, '#7a9a5a'], [1, '#4a6a36']]), '#3a4a2a', 1);
        grass(32, 18, 26);
        g.beginPath(); g.ellipse(32, 30, 30, 20, 0, PI * 0.95, PI * 2.05); g.strokeStyle = '#6e6a60'; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#a8a498'; g.lineWidth = 5; g.stroke();
        g.fillStyle = LG(g, 0, 30, 0, 56, [[0, '#a8a498'], [1, '#77736a']]); g.fillRect(2, 30, 6, 24); g.fillRect(56, 30, 6, 24);
        g.beginPath(); g.moveTo(20, 50); g.lineTo(20, 22); g.quadraticCurveTo(32, 12, 44, 22); g.lineTo(44, 50); g.closePath();
        fs(g, LG(g, 20, 0, 44, 0, [[0, '#cfcabd'], [1, '#8e8a7e']]), '#5e5a50', 1.2);
        g.fillStyle = 'rgba(160,40,30,0.75)'; g.fillRect(31, 24, 2, 22); g.fillRect(25.5, 28, 1.4, 16); g.fillRect(37, 28, 1.4, 16);
        g.fillStyle = '#9a968a'; g.fillRect(24, 50, 16, 6); ell(g, 32, 50, 8, 2); fs(g, '#bab6aa');
      } else if (L.v === 1) {
        grass(32, 40, 30);
        g.save(); g.translate(32, 50); g.rotate(-0.14);
        g.beginPath(); g.moveTo(-11, 0); g.lineTo(-11, -28); g.quadraticCurveTo(0, -36, 11, -28); g.lineTo(11, 0); g.closePath();
        fs(g, LG(g, -11, 0, 11, 0, [[0, '#a8a89a'], [1, '#6a6a5e']]), '#4a4a40', 1.2);
        g.strokeStyle = '#3a3a32'; g.lineWidth = 1; g.beginPath(); g.moveTo(4, -32); g.lineTo(1, -22); g.lineTo(5, -14); g.stroke();
        for (let i = 0; i < 6; i++) { ell(g, -9 + rng() * 18, -28 + rng() * 28, 2 + rng() * 3, 1.5 + rng() * 2); g.fillStyle = 'rgba(90,120,60,0.6)'; g.fill(); }
        g.fillStyle = 'rgba(40,40,34,0.5)'; g.fillRect(-1, -26, 2, 20);
        g.restore();
        grass(32, 52, 18);
      } else {
        ell(g, 32, 34, 20, 10); fs(g, LG(g, 0, 24, 0, 44, [[0, '#8a6e50'], [1, '#5a4430']]), '#3a2a1a', 1);
        g.fillStyle = LG(g, 27, 0, 37, 0, [[0, '#a8906a'], [1, '#6a5438']]); g.fillRect(27, 2, 10, 36);
        g.beginPath(); g.moveTo(27, 2); g.lineTo(32, -3); g.lineTo(37, 2); g.closePath(); g.fill();
        vchars(g, '之墓', 32, 18, 7, 'rgba(20,12,8,0.8)', 1.4);
        for (let i = 0; i < 4; i++) { const x = 18 + rng() * 26, y = 30 + rng() * 8; g.save(); g.translate(x, y); g.rotate(rng()); g.fillStyle = '#e0c060'; g.fillRect(-3, -2, 6, 4); g.restore(); }
        ell(g, 22, 33, 3, 2); fs(g, '#8a8478'); ell(g, 42, 36, 3, 2); fs(g, '#8a8478');
        grass(32, 46, 14);
      }
    },
  });

  // ---- coffin (2x1) on trestles -------------------------------------------------------------------
  defObj('coffin', {
    w: 2, h: 1, pad: [10, 30, 18, 8],
    paint(g, L) {
      shadowEll(g, 68, 56, 58, 6, 0.4);
      for (const x of [26, 98]) {
        g.fillStyle = '#4a3220'; g.fillRect(x - 12, 34, 4, 22); g.fillRect(x + 8, 34, 4, 22);
        g.fillStyle = LG(g, 0, 30, 0, 36, [[0, '#7a5434'], [1, '#4a3220']]); g.fillRect(x - 14, 30, 28, 6);
      }
      const col = '#3a1410', E = '#140605';
      // lid top (seen from above), convex, wider toward the head (right)
      g.beginPath(); g.moveTo(6, 12); g.lineTo(122, 4); g.quadraticCurveTo(122, -12, 116, -14); g.lineTo(12, -4); g.quadraticCurveTo(5, 0, 6, 12); g.closePath();
      fs(g, LG(g, 0, -14, 0, 12, [[0, shade(col, 0.55)], [0.5, shade(col, 0.25)], [1, shade(col, 0.05)]]), E, 1.2);
      g.strokeStyle = 'rgba(255,225,205,0.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(16, -1); g.lineTo(112, -9); g.stroke();
      // side face
      g.beginPath(); g.moveTo(6, 12); g.lineTo(122, 4); g.lineTo(120, 32); g.lineTo(10, 33); g.closePath();
      fs(g, LG(g, 0, 4, 0, 33, [[0, shade(col, 0.12)], [1, shade(col, -0.45)]]), E, 1.2);
      g.fillStyle = 'rgba(255,220,200,0.22)'; g.beginPath(); g.moveTo(6, 13.5); g.lineTo(122, 5.5); g.lineTo(122, 7); g.lineTo(6, 15); g.fill();
      // flared head-end board
      g.beginPath(); g.moveTo(118, -14); g.quadraticCurveTo(130, -10, 129, 8); g.quadraticCurveTo(128, 24, 122, 34); g.lineTo(120, 32); g.lineTo(122, 4); g.quadraticCurveTo(122, -12, 116, -14); g.closePath();
      fs(g, LG(g, 118, 0, 130, 0, [[0, shade(col, -0.1)], [1, shade(col, -0.45)]]), E, 1);
      // red band & gold 壽 medallion
      g.fillStyle = '#a8261c'; g.fillRect(84, 7, 3, 25);
      ell(g, 104, 18, 8, 8); fs(g, '#a8261c', '#e8c060', 1.2);
      g.font = FONT(10, true); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2cb68'; g.fillText('壽', 104, 18.5);
    },
  });

  // ---- bones (non-solid) ----------------------------------------------------------------------------
  defObj('bones', {
    w: 1, h: 1, solid: false, nv: 2, salt: 79, pad: [8, 8, 8, 8],
    paint(g, L, o, rng) {
      const bone = '#e2dac4', D = '#7a705a';
      ell(g, 32, 40, 24, 10); g.fillStyle = 'rgba(60,40,30,0.18)'; g.fill();
      const longBone = (x, y, len, a) => {
        g.save(); g.translate(x, y); g.rotate(a);
        g.fillStyle = bone; g.strokeStyle = D; g.lineWidth = 0.9;
        g.beginPath(); g.rect(-len / 2, -1.6, len, 3.2); g.fill(); g.stroke();
        for (const s of [-1, 1]) { ell(g, s * len / 2, -1.6, 2.2, 2); fs(g, bone, D, 0.9); ell(g, s * len / 2, 1.6, 2.2, 2); fs(g, bone, D, 0.9); }
        g.restore();
      };
      longBone(22, 46, 20, 0.3 + L.v); longBone(42, 50, 16, -0.6); longBone(46, 34, 14, 1.2 + L.v);
      for (let k = 0; k < 3; k++) { g.strokeStyle = bone; g.lineWidth = 2; g.beginPath(); g.arc(14 + k * 5, 36, 6, PI * 1.1, PI * 1.8); g.stroke(); }
      // skull
      const sx = L.v ? 40 : 28, sy = 34;
      shadowEll(g, sx + 2, sy + 8, 10, 3, 0.35);
      ell(g, sx, sy, 8.5, 7.5); fs(g, RG(g, sx, sy, 9, [[0, '#f4eedc'], [1, '#c4b89a']], 0, sx - 3, sy - 3), D, 1);
      g.fillStyle = bone; g.fillRect(sx - 4.5, sy + 4, 9, 5); g.strokeStyle = D; g.strokeRect(sx - 4.5, sy + 4, 9, 5);
      ell(g, sx - 3.2, sy + 0.5, 2.4, 2.6); fs(g, '#2a2018'); ell(g, sx + 3.2, sy + 0.5, 2.4, 2.6); fs(g, '#2a2018');
      g.fillStyle = '#2a2018'; g.beginPath(); g.moveTo(sx, sy + 3); g.lineTo(sx - 1.2, sy + 5.2); g.lineTo(sx + 1.2, sy + 5.2); g.fill();
      g.strokeStyle = D; g.lineWidth = 0.6; for (let k = -3; k <= 3; k += 1.5) line(g, sx + k, sy + 6, sx + k, sy + 9);
    },
  });

  // ---- firepit (anim, light) ------------------------------------------------------------------------
  defObj('firepit', {
    w: 1, h: 1, anim: true, pad: [8, 10, 12, 8],
    paint(g, L, o, rng) {
      shadowEll(g, 33, 46, 30, 10, 0.35);
      ell(g, 32, 42, 22, 9); fs(g, RG(g, 32, 42, 22, [[0, '#4a2a1a'], [1, '#1e1814']]));
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU + 0.2, x = 32 + cos(a) * 24, y = 42 + sin(a) * 11;
        if (sin(a) > 0.2) continue;
        ell(g, x, y, 6, 4.5); fs(g, LG(g, 0, y - 5, 0, y + 5, [[0, '#a8a498'], [1, '#5e5a50']]), '#3a3630', 1);
      }
      for (const [a, len] of [[0.35, 30], [-0.4, 28], [1.5, 22]]) {
        g.save(); g.translate(32, 42); g.rotate(a);
        g.fillStyle = LG(g, 0, -3, 0, 3, [[0, '#6a4a2e'], [1, '#2a1a10']]); g.fillRect(-len / 2, -3, len, 6);
        g.fillStyle = '#1a100a'; g.fillRect(-4, -3, 8, 6);
        ell(g, len / 2, 0, 2, 3); fs(g, '#e86a2a');
        g.restore();
      }
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * TAU + 0.2, x = 32 + cos(a) * 24, y = 42 + sin(a) * 11;
        if (sin(a) <= 0.2) continue;
        ell(g, x, y, 6.5, 5); fs(g, LG(g, 0, y - 5, 0, y + 5, [[0, '#bab6aa'], [1, '#6e6a60']]), '#3a3630', 1);
      }
    },
    live(ctx, px, py, L, o, t) {
      const s = seedOf(o);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.translate(px + 32, py + 42); ctx.scale(1, 0.45);
      ctx.fillStyle = RG(ctx, 0, 0, 40, [[0, `rgba(255,130,50,${0.35 * flick(t, s)})`], [1, 'rgba(255,100,30,0)']]);
      ctx.fillRect(-40, -40, 80, 80);
      ctx.restore();
      flame(ctx, px + 32, py + 40, 8, t, s);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 7; k++) {
        const ph = (t * 0.7 + k * 0.143 + s) % 1;
        const x = px + 32 + sin(k * 2.3 + t * 2) * 6 * (1 + ph), y = py + 30 - ph * 54;
        ctx.fillStyle = `rgba(255,${160 + k * 10},70,${0.9 * (1 - ph)})`;
        ctx.fillRect(x, y, 1.8, 1.8);
      }
      ctx.restore();
    },
    lights: () => [LT(32, 30, 160, FIRE_LIGHT, 0.6)],
  });

  // ---- totem: carved ancestor pole --------------------------------------------------------------------
  defObj('totem', {
    w: 1, h: 1, pad: [14, 128, 22, 10],
    paint(g, L, o, rng) {
      shadowEll(g, 36, 56, 18, 5, 0.42);
      for (let k = 0; k < 4; k++) { ell(g, 16 + k * 10, 54, 6, 4); fs(g, mix('#7a766a', '#9a968a', rng()), '#4a463e', 1); }
      const wood = '#5e3e28', D = '#2a1a10';
      g.fillStyle = LG(g, 20, 0, 44, 0, [[0, shade(wood, -0.1)], [0.3, shade(wood, 0.3)], [1, shade(wood, -0.45)]]); g.fillRect(20, -112, 24, 166);
      g.strokeStyle = D; g.lineWidth = 1.2; g.strokeRect(20, -112, 24, 166);
      // top: ancestor head with headdress
      g.beginPath(); g.moveTo(18, -110); g.lineTo(32, -124); g.lineTo(46, -110); g.closePath(); fs(g, '#7a5232', D, 1);
      for (let k = 0; k < 5; k++) { g.fillStyle = k % 2 ? '#e8e0cc' : '#a8322a'; g.fillRect(21 + k * 4.6, -112, 3, 4); }
      ell(g, 32, -96, 10, 11); fs(g, LG(g, 22, 0, 42, 0, [[0, '#8a6242'], [1, '#4a3020']]), D, 1);
      ell(g, 28, -98, 2.6, 1.8); fs(g, '#e8e0cc', D, 0.8); ell(g, 36, -98, 2.6, 1.8); fs(g, '#e8e0cc', D, 0.8);
      g.fillStyle = D; g.fillRect(31, -97, 2, 6); g.fillRect(28, -89, 8, 2);
      // arms raised
      for (const s of [-1, 1]) { g.strokeStyle = '#7a5232'; g.lineWidth = 4; g.beginPath(); g.moveTo(32 + s * 8, -78); g.lineTo(32 + s * 11, -86); g.lineTo(32 + s * 11, -96); g.stroke(); }
      g.fillStyle = '#6a4a2e'; g.fillRect(24, -82, 16, 14);
      // geometric bands
      const band = (y, h) => {
        g.fillStyle = '#3a2416'; g.fillRect(20, y, 24, h);
        for (let k = 0; k < 4; k++) { const cx = 23 + k * 6; poly(g, [[cx, y + h / 2], [cx + 3, y + 1], [cx + 6, y + h / 2], [cx + 3, y + h - 1]]); fs(g, k % 2 ? '#a8322a' : '#e8e0cc'); }
      };
      band(-64, 10); band(-24, 10);
      // zigzag relief
      g.strokeStyle = '#d8ccb0'; g.lineWidth = 1.6; g.beginPath();
      for (let k = 0; k <= 6; k++) g.lineTo(22 + k * 3.4, -48 + (k % 2) * 8);
      g.stroke();
      // lower figure
      ell(g, 32, -2, 7, 8); fs(g, '#7a5232', D, 1);
      ell(g, 29.5, -3, 1.6, 1.2); fs(g, '#e8e0cc'); ell(g, 34.5, -3, 1.6, 1.2); fs(g, '#e8e0cc');
      g.fillStyle = '#6a4a2e'; g.fillRect(25, 8, 14, 22);
      g.strokeStyle = '#d8ccb0'; g.lineWidth = 1.2; line(g, 25, 14, 32, 18); line(g, 39, 14, 32, 18);
      grime(g, 20, -112, 24, 166, rng, 0.15);
    },
  });

  // ---- loom: frame loom with geometric red weaving -------------------------------------------------
  defObj('loom', {
    w: 1, h: 1, pad: [10, 60, 18, 8],
    paint(g, L, o, rng) {
      shadowEll(g, 34, 56, 26, 5, 0.4);
      for (const x of [8, 52]) woodPost(g, x, -40, 5, 96, '#5a3e26');
      g.fillStyle = LG(g, 0, -42, 0, -34, [[0, '#8a6442'], [1, '#4a3220']]); g.fillRect(4, -42, 56, 7);
      g.strokeStyle = '#ece6d6'; g.lineWidth = 0.7; for (let x = 15; x <= 49; x += 2.4) line(g, x, -35, x, 2);
      g.fillStyle = '#6a4a2e'; g.fillRect(12, -10, 40, 3);
      // woven cloth
      g.fillStyle = '#8a1e1a'; g.fillRect(14, 2, 36, 38);
      for (let y = 4; y < 40; y += 12) for (let x = 14; x < 50; x += 12) {
        poly(g, [[x + 6, y], [x + 12, y + 6], [x + 6, y + 12], [x, y + 6]]); fs(g, '#1e1414');
        poly(g, [[x + 6, y + 3], [x + 9, y + 6], [x + 6, y + 9], [x + 3, y + 6]]); fs(g, '#ece6d6');
      }
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(14, 2, 36, 38);
      g.fillStyle = LG(g, 0, 38, 0, 46, [[0, '#8a6442'], [1, '#4a3220']]); g.fillRect(4, 39, 56, 7);
      g.strokeStyle = '#a87a4e'; g.lineWidth = 2.4; line(g, 6, -4, 58, -6);
    },
  });

  // ---- drum_rack: temple drum on a stand ------------------------------------------------------------
  defObj('drum_rack', {
    w: 1, h: 1, pad: [12, 60, 20, 10],
    paint(g, L) {
      shadowEll(g, 34, 56, 26, 6, 0.4);
      const red = '#9a2a1e';
      for (const [x0, x1] of [[10, 18], [54, 46]]) { g.strokeStyle = '#3a1a10'; g.lineWidth = 5; line(g, x0, 56, x1, 8); g.strokeStyle = red; g.lineWidth = 3.4; line(g, x0, 56, x1, 8); }
      g.fillStyle = red; g.fillRect(12, 30, 40, 4);
      // drum body (axis toward viewer, slightly tilted)
      ell(g, 33, -6, 26, 22); fs(g, LG(g, 7, 0, 59, 0, [[0, '#7a1e16'], [0.4, '#c8483a'], [1, '#5a120c']]), '#3a0c08', 1.2);
      ell(g, 31, -2, 24, 21); fs(g, RG(g, 31, -2, 24, [[0, '#f2e6c8'], [0.75, '#d8c4a0'], [1, '#a88a62']], 0, 26, -8), '#6a4a2a', 1.2);
      for (let k = 0; k < 18; k++) { const a = k / 18 * TAU; ell(g, 31 + cos(a) * 22.5, -2 + sin(a) * 19.5, 1.3, 1.3); fs(g, '#e8c060'); }
      g.strokeStyle = 'rgba(160,40,30,0.55)'; g.lineWidth = 1.4; ell(g, 31, -2, 9, 8); g.stroke();
      g.font = FONT(10, true); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(160,40,30,0.7)'; g.fillText('鼓', 31, -1.5);
      // sticks
      for (const [a, b] of [[[46, 30], [60, 12]], [[50, 32], [62, 18]]]) { g.strokeStyle = '#5a3a22'; g.lineWidth = 2.6; line(g, a[0], a[1], b[0], b[1]); ell(g, b[0], b[1], 2.4, 2.4); fs(g, '#8a2a1e'); }
    },
  });

  // ---- bell_tower 鐘樓 (2x2) -------------------------------------------------------------------------
  defObj('bell_tower', {
    w: 2, h: 2, fixed: true, pad: [36, 156, 50, 14],
    paint(g, L, o, rng) {
      buildingShadow(g, 2, 126, 124, 200);
      g.fillStyle = LG(g, 0, 66, 0, 96, [[0, '#a29c8e'], [1, '#bdb7a8']]); g.fillRect(2, 66, 124, 30);
      stones(g, 2, 94, 124, 32, rng, '#9c978b', 10, 0.25);
      g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(2, 94, 124, 1.5);
      redPillar(g, 20, 0, 76, 8); redPillar(g, 108, 0, 76, 8);
      // bell
      g.strokeStyle = '#2a1a10'; g.lineWidth = 2; line(g, 64, 6, 64, 16);
      g.beginPath(); g.moveTo(52, 22); g.quadraticCurveTo(52, 14, 64, 14); g.quadraticCurveTo(76, 14, 76, 22); g.lineTo(80, 58); g.quadraticCurveTo(82, 64, 86, 66); g.lineTo(42, 66); g.quadraticCurveTo(46, 64, 48, 58); g.closePath();
      fs(g, LG(g, 42, 0, 86, 0, [[0, '#3a5448'], [0.3, '#7a9a84'], [0.6, '#4a6a5a'], [1, '#1e2e26']]), '#142018', 1.2);
      g.strokeStyle = 'rgba(20,32,24,0.7)'; g.lineWidth = 1.2; for (const y of [30, 44, 58]) { g.beginPath(); g.moveTo(49 - (y - 30) * 0.1, y); g.lineTo(79 + (y - 30) * 0.1, y); g.stroke(); }
      for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { ell(g, 55 + k * 6, 34 + r * 5, 1.4, 1.4); fs(g, '#9ab8a0', '#1e2e26', 0.5); }
      ell(g, 64, 66, 22, 3.5); fs(g, '#1a2620');
      // striker log
      g.strokeStyle = '#c8b48a'; g.lineWidth = 1; line(g, 92, 6, 92, 36); line(g, 116, 6, 116, 36);
      g.fillStyle = LG(g, 0, 33, 0, 41, [[0, '#a87a4e'], [1, '#5a3a22']]); rr(g, 84, 33, 40, 8, 4); g.fill();
      redPillar(g, 12, 6, 100, 10); redPillar(g, 116, 6, 100, 10);
      g.fillStyle = '#21485a'; g.fillRect(6, 4, 116, 8);
      for (let x = 10; x < 118; x += 18) { g.fillStyle = '#2f7a6a'; rr(g, x, 5.5, 14, 5, 2.5); g.fill(); g.fillStyle = '#e2b24a'; ell(g, x + 7, 8, 1.8, 1.6); g.fill(); }
      // lower roof, upper storey, upper roof
      hipRoof(g, { cx: 64, hw: 70, rh: 22, ridge: -24, eave: 8, depth: 34, lift: 9, flare: 8, base: '#3b6a5e', ridgeCol: '#2c5046' }, rng);
      g.fillStyle = '#5a1a14'; g.fillRect(36, -50, 56, 26);
      for (const x of [38, 88]) redPillar(g, x, -52, -22, 6);
      windowLat(g, 48, -46, 32, 16, false, { frame: '#3a120e', pattern: 'diamond', sill: false, spill: false });
      hipRoof(g, { cx: 64, hw: 46, rh: 0, ridge: -96, eave: -46, depth: 30, lift: 8, flare: 7, base: '#3b6a5e', ridgeCol: '#2c5046' }, rng);
      ell(g, 64, -99, 5, 4); fs(g, LG(g, 59, 0, 69, 0, [[0, '#f6d77a'], [1, '#a8781e']]), '#6a4a10', 1);
      ell(g, 64, -107, 3.5, 3.5); fs(g, LG(g, 60, 0, 68, 0, [[0, '#f6d77a'], [1, '#a8781e']]), '#6a4a10', 1);
    },
  });

  G.ObjectsArt = { lantern, lanternSprite, roof, hipRoof, swallowTail, cacheSize: () => CACHE.size };
})();

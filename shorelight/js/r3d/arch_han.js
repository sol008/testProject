// 彼岸燈 Shorelight — Han-Taiwanese architecture in 3D (architecture team A). Contract: docs/CONTRACTS_3D.md.
//
// How it is built
//   * One shared, hand-painted texture ATLAS (2048², 8×8 cells of 240 px + 8 px wrap gutters) holds every tileable
//     surface: roof tiles, brick bond, granite, plaster, timber, lattice, door gods, lantern paper, embroidery …
//     Geometry stores "atlas UVs": u = cell·SPAN + HALF + local, where `local` is a world-scale repeat coordinate.
//     A small shader patch (atlasPatch) turns that into fract()-tiling inside the cell with textureGrad (no seams).
//   * A geometry BUILDER (Bld) writes triangles straight into a handful of material buckets
//     (matte / gloss / metal / glow / decal + animated sway / cloth), so every model is ≤ 6 static draw calls.
//     Vertex colours carry tint, cheap AO (ground contact, under-eave darkening) and — in the glow bucket — emission.
//   * Per-model text (plaques, couplets, shop signs) is painted into a small per-model DECAL sheet.
//   * Lanterns and cloth sway in the vertex shader (pivot attribute + uTime), so they cost one draw call each.
//
// Orientation: origin = footprint centre on the ground, +x east, +z south (= front: doors, plaques), y up, 1 unit = 1 m.
'use strict';
(() => {
  if (!window.G || !G.Models) return;
  const { sin, cos, abs, min, max, floor, sqrt, pow, round, atan2, hypot } = Math;
  const PI = Math.PI, TAU = PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function mulberry(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  const FONT = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px ${G.FONT_FAMILY || 'serif'}`;

  // sRGB hex → [r,g,b] 0..255
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function shade(h, k) { // k>0 lighter, k<0 darker
    const c = hexRGB(h).map((v) => clamp(round(k >= 0 ? v + (255 - v) * k : v * (1 + k)), 0, 255));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function mixHex(a, b, t) { const A = hexRGB(a), B = hexRGB(b); return '#' + A.map((v, i) => round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }
  function rgba(h, a) { const c = hexRGB(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  // linear-space vertex colour from sRGB hex (three expects linear vertex colours)
  const LIN = new Map();
  function lin(h) {
    if (Array.isArray(h)) return h;
    let c = LIN.get(h);
    if (!c) { const t = new THREE.Color(h); c = [t.r, t.g, t.b]; LIN.set(h, c); }
    return c;
  }

  // =================================================================================================
  // periodic noise fields (tileable over S px)
  // =================================================================================================
  function field(S, cells, oct, seed, gain = 0.5) {
    const out = new Float32Array(S * S);
    let amp = 1, tot = 0;
    for (let o = 0; o < oct; o++) {
      const n = cells << o, r = mulberry(seed * 31 + o * 977 + 7), lat = new Float32Array(n * n);
      for (let i = 0; i < lat.length; i++) lat[i] = r();
      for (let y = 0; y < S; y++) {
        const fy = (y / S) * n, y0 = floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = y0 % n, yb = (y0 + 1) % n;
        for (let x = 0; x < S; x++) {
          const fx = (x / S) * n, x0 = floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % n, xb = (x0 + 1) % n;
          const a = lat[ya * n + xa], b = lat[ya * n + xb], c = lat[yb * n + xa], d = lat[yb * n + xb];
          out[y * S + x] += amp * lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
        }
      }
      tot += amp; amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }
  // per-pixel modulation: fn(r,g,b,v,x,y) → [r,g,b] using a noise field
  function modulate(g, S, f, fn) {
    const id = g.getImageData(0, 0, S, S), d = id.data;
    for (let y = 0, i = 0; y < S; y++) for (let x = 0; x < S; x++, i++) {
      const o = i * 4, c = fn(d[o], d[o + 1], d[o + 2], f ? f[i] : 0, x, y);
      d[o] = clamp(c[0], 0, 255); d[o + 1] = clamp(c[1], 0, 255); d[o + 2] = clamp(c[2], 0, 255);
    }
    g.putImageData(id, 0, 0);
  }
  // multiply brightness by (1 + k·(v−0.5)) — general grain / mottling
  function mottle(g, S, f, k) { modulate(g, S, f, (r, gg, b, v) => { const m = 1 + k * (v - 0.5); return [r * m, gg * m, b * m]; }); }
  // darken by a grime field above a threshold, tinted
  function grime(g, S, f, amt, tint = [40, 34, 26], th = 0.5) {
    modulate(g, S, f, (r, gg, b, v) => { const t = clamp((v - th) / (1 - th), 0, 1) * amt; return [lerp(r, tint[0], t), lerp(gg, tint[1], t), lerp(b, tint[2], t)]; });
  }
  // draw something 9× so it wraps seamlessly across tile edges
  function wrap(g, S, fn) { for (let dy = -S; dy <= S; dy += S) for (let dx = -S; dx <= S; dx += S) { g.save(); g.translate(dx, dy); fn(); g.restore(); } }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function ell(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, max(0.01, rx), max(0.01, ry), rot, 0, TAU); }
  function LG(g, x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(x0, y0, x1, y1); for (const s of stops) gr.addColorStop(s[0], s[1]); return gr; }
  function RG(g, x, y, r, stops) { const gr = g.createRadialGradient(x, y, 0, x, y, max(0.01, r)); for (const s of stops) gr.addColorStop(s[0], s[1]); return gr; }
  function line(g, x0, y0, x1, y1) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  // Chinese characters in a box: dir 'h' (right-to-left, as on Qing boards) | 'hl' (left-to-right) | 'v' (top-down)
  function chars(g, text, cx, cy, size, color, dir = 'h', spacing = 1.04, stroke) {
    const ch = [...String(text)], n = ch.length, step = size * spacing;
    g.font = FONT(round(size)); g.textAlign = 'center'; g.textBaseline = 'middle';
    ch.forEach((c, i) => {
      const k = i - (n - 1) / 2;
      const x = dir === 'v' ? cx : cx + (dir === 'h' ? -k : k) * step, y = dir === 'v' ? cy + k * step : cy;
      if (stroke) { g.fillStyle = stroke; g.fillText(c, x + size * 0.04, y + size * 0.05); }
      g.fillStyle = color; g.fillText(c, x, y);
    });
  }

  // =================================================================================================
  // ATLAS
  // =================================================================================================
  const AT = { N: 8, CELL: 256, PAD: 8, IN: 240, SIZE: 2048, SPAN: 128, HALF: 64 };
  const REG = {}; // name → { c, r (canvas row), size (m per repeat), decal }
  const PAINT = []; // [name, size, painter, decal]
  function reg(name, size, painter, decal = false) { PAINT.push([name, size, painter, decal]); }

  // ---------------------------------------------------------------- roof coverings
  // clay tube-and-pan tiles (筒瓦 + 板瓦), 4 tube rows per metre; geometry corrugation matches (TILE_PITCH)
  function paintTiles(base, glaze) {
    return (g, S, R) => {
      const cols = 4, cw = S / cols, rows = 3, rh = S / rows;
      g.fillStyle = shade(base, -0.28); g.fillRect(0, 0, S, S);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // pan tile in the channel (between tubes, centred on c·cw)
        const pc = shade(base, (R() - 0.5) * 0.16 - 0.12);
        wrap(g, S, () => {
          g.fillStyle = LG(g, c * cw - cw / 2, 0, c * cw + cw / 2, 0, [[0, shade(pc, -0.25)], [0.5, pc], [1, shade(pc, -0.25)]]);
          g.fillRect(c * cw - cw * 0.42, r * rh, cw * 0.84, rh + 2);
          g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(c * cw - cw * 0.42, r * rh + rh - 5, cw * 0.84, 5);
        });
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // tube tile (cap) centred on (c+0.5)·cw
        const x = (c + 0.5) * cw, tc = shade(base, (R() - 0.5) * 0.18 + 0.04), y = r * rh + (c % 2) * rh * 0.5;
        wrap(g, S, () => {
          g.fillStyle = 'rgba(0,0,0,0.38)'; g.fillRect(x - cw * 0.26, y, cw * 0.56, rh);
          g.fillStyle = LG(g, x - cw * 0.22, 0, x + cw * 0.22, 0, [[0, shade(tc, -0.35)], [0.32, shade(tc, glaze ? 0.35 : 0.18)], [0.5, shade(tc, glaze ? 0.12 : 0.05)], [1, shade(tc, -0.4)]]);
          g.fillRect(x - cw * 0.22, y, cw * 0.44, rh - 3);
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - cw * 0.22, y + rh - 5, cw * 0.44, 3);
          g.fillStyle = 'rgba(255,240,220,0.18)'; g.fillRect(x - cw * 0.22, y, cw * 0.44, 2);
        });
      }
      mottle(g, S, field(S, 4, 4, 11), 0.35);
      grime(g, S, field(S, 3, 4, 12), glaze ? 0.35 : 0.55, [60, 62, 48], 0.55);   // lichen / soot
      modulate(g, S, field(S, 16, 2, 13), (r, gg, b, v, x) => { const k = v > 0.82 ? 0.82 : 1; return [r * k, gg * k, b * k]; }); // chipped dark specks
    };
  }
  reg('tileRed', 1, paintTiles('#b85434', false));
  reg('tileGrey', 1, paintTiles('#666a72', false));
  reg('tileGreen', 1, paintTiles('#3e8a6c', true));
  reg('tileOrange', 1, paintTiles('#cf6a34', true));
  reg('tileDark', 1, paintTiles('#4a4e54', false));
  // 九份 black tar paper (油毛氈) with nailed battens every 0.5 m (u) and sheet laps every 0.9 m (v)
  reg('tarPaper', 1, (g, S, R) => {
    g.fillStyle = '#2b2c31'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 7; k++) { // patched sheets
      const x = R() * S, y = R() * S, w = 30 + R() * 80, h = 20 + R() * 60, c = shade('#2e2f35', (R() - 0.5) * 0.25);
      wrap(g, S, () => { g.fillStyle = c; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y + h - 2, w, 2); });
    }
    for (const y of [0, S * 0.5]) wrap(g, S, () => { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y, S, 3); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, y + 3, S, 2); });
    for (const x of [S * 0.25, S * 0.75]) wrap(g, S, () => {
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x - 7, 0, 16, S);
      g.fillStyle = LG(g, x - 6, 0, x + 6, 0, [[0, '#1d1d21'], [0.4, '#45464c'], [1, '#202024']]); g.fillRect(x - 6, 0, 12, S);
      g.fillStyle = '#6a6460'; for (let y = 8; y < S; y += 30) g.fillRect(x - 1, y, 2, 2);
    });
    mottle(g, S, field(S, 6, 4, 21), 0.4);
    grime(g, S, field(S, 3, 4, 22), 0.4, [70, 64, 52], 0.6); // dust & dried moss
    modulate(g, S, field(S, 2, 3, 23), (r, gg, b, v, x, y) => { const k = 1 + 0.25 * sstep(0.6, 0.9, v) * (0.6 + 0.4 * sin(y * 0.2)); return [r * k, gg * k, b * k * 1.05]; }); // tar sheen
  });
  // 石板 slate slabs (Paiwan/Rukai slate roofs & walls)
  reg('slateRoof', 1.2, (g, S, R) => {
    g.fillStyle = '#3c3e3c'; g.fillRect(0, 0, S, S);
    const rows = 5, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = R() * 40;
      while (x < S + 40) {
        const w = 34 + R() * 46, c = shade('#6c6f6b', (R() - 0.5) * 0.3), y = r * rh + (R() - 0.5) * 6, xx = x;
        wrap(g, S, () => {
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.moveTo(xx - 2, y); g.lineTo(xx + w + 2, y + 2); g.lineTo(xx + w, y + rh + 10); g.lineTo(xx, y + rh + 8); g.fill();
          g.fillStyle = LG(g, 0, y, 0, y + rh + 6, [[0, shade(c, 0.12)], [1, shade(c, -0.2)]]);
          g.beginPath(); g.moveTo(xx, y); g.lineTo(xx + w, y + 1); g.lineTo(xx + w - 2, y + rh + 6); g.lineTo(xx + 2, y + rh + 4); g.fill();
        });
        x += w + 1;
      }
    }
    mottle(g, S, field(S, 8, 4, 31), 0.4);
    grime(g, S, field(S, 3, 4, 32), 0.5, [70, 80, 50], 0.62);
  });
  reg('thatch', 1, (g, S, R) => {
    g.fillStyle = '#7a6236'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const x = R() * S, y = R() * S, l = 14 + R() * 26, c = mixHex('#c2a462', '#6e5426', R());
      wrap(g, S, () => { g.strokeStyle = c; g.lineWidth = 0.8 + R() * 1.2; line(g, x, y, x + (R() - 0.5) * 4, y + l); });
    }
    for (let r = 0; r < 4; r++) wrap(g, S, () => { g.fillStyle = 'rgba(30,20,8,0.35)'; g.fillRect(0, r * S / 4 + S / 4 - 6, S, 6); });
    grime(g, S, field(S, 3, 4, 41), 0.45, [60, 56, 40], 0.55);
  });
  // 剪黏 cut-porcelain mosaic on white mortar (ridge sides & dragons): glossy shards in bright colours
  function paintShards(cols, mortar, n, sz) {
    return (g, S, R) => {
      g.fillStyle = mortar; g.fillRect(0, 0, S, S);
      for (let i = 0; i < n; i++) {
        const x = R() * S, y = R() * S, s = sz * (0.6 + R() * 0.8), a = R() * TAU, c = cols[floor(R() * cols.length)];
        wrap(g, S, () => {
          g.save(); g.translate(x, y); g.rotate(a);
          g.fillStyle = shade(c, (R() - 0.5) * 0.25); g.beginPath(); g.moveTo(-s, -s * 0.5); g.quadraticCurveTo(0, -s * 0.9, s, -s * 0.4); g.lineTo(s * 0.7, s * 0.6); g.lineTo(-s * 0.8, s * 0.5); g.closePath(); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(-s * 0.5, -s * 0.45, s * 0.7, s * 0.18);
          g.restore();
        });
      }
    };
  }
  reg('porcelain', 0.5, paintShards(['#2f9a74', '#f0c04a', '#e0583a', '#3b78c0', '#f4f0e0', '#9a5ad0', '#2fa0a8'], '#e8e2d2', 380, 9));
  reg('scales', 0.3, (g, S, R) => { // dragon body: overlapping scale shards, tinted by vertex colour
    g.fillStyle = '#2a3a30'; g.fillRect(0, 0, S, S);
    const n = 8, w = S / n;
    for (let r = 0; r < n + 1; r++) for (let c = 0; c < n + 1; c++) {
      const x = c * w + (r % 2) * w / 2, y = r * w * 0.9, k = (R() - 0.5) * 0.3;
      wrap(g, S, () => {
        g.fillStyle = LG(g, 0, y - w / 2, 0, y + w / 2, [[0, shade('#e8f0e0', k)], [1, shade('#7c9a88', k)]]);
        g.beginPath(); g.arc(x, y, w * 0.55, 0, PI); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(20,30,20,0.6)'; g.lineWidth = 1.5; g.stroke();
      });
    }
  });
  reg('ridgeBand', 1, (g, S, R) => { // stacked-tile ridge face: white mortar band + darker courses
    g.fillStyle = '#d8d0bc'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += S / 6) { g.fillStyle = 'rgba(60,40,30,0.35)'; g.fillRect(0, y, S, 3); }
    mottle(g, S, field(S, 6, 4, 51), 0.25);
    grime(g, S, field(S, 3, 4, 52), 0.5, [70, 66, 56], 0.5);
  });

  // ---------------------------------------------------------------- masonry
  function paintBricks(base, mortar, bw, bh, burnt, weather) {
    return (g, S, R) => {
      g.fillStyle = mortar; g.fillRect(0, 0, S, S);
      const rows = round(S / bh), rh = S / rows, cols = round(S / bw), cw = S / cols;
      for (let r = 0; r < rows; r++) {
        const head = r % 2 === 1; // English-ish bond: header courses every other row in brick red
        const n = head ? cols * 2 : cols, w = head ? cw / 2 : cw, off = head ? w / 2 : 0;
        for (let c = 0; c < n; c++) {
          const x = c * w + off, y = r * rh, burn = R() < burnt;
          const col = burn ? shade(base, -0.38 - R() * 0.15) : shade(base, (R() - 0.5) * 0.26);
          wrap(g, S, () => {
            g.fillStyle = col; g.fillRect(x + 1.5, y + 1.5, w - 3, rh - 3);
            g.fillStyle = 'rgba(255,230,210,0.16)'; g.fillRect(x + 1.5, y + 1.5, w - 3, 1.5);
            g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1.5, y + rh - 3, w - 3, 1.5);
          });
        }
      }
      mottle(g, S, field(S, 12, 3, 61), 0.3);
      grime(g, S, field(S, 3, 4, 62), weather, [60, 54, 44], 0.5);
      modulate(g, S, field(S, 24, 2, 63), (r, gg, b, v) => (v > 0.8 ? [r * 0.8, gg * 0.8, b * 0.8] : [r, gg, b]));
    };
  }
  reg('brickRed', 1, paintBricks('#b0503a', '#d6ccb6', 60, 16, 0.08, 0.35));
  reg('brickOld', 1, paintBricks('#9a4632', '#b8ab96', 60, 16, 0.15, 0.6));
  reg('brickGrey', 1, paintBricks('#8a8a86', '#c8c2b6', 60, 16, 0.06, 0.45));
  function paintAshlar(base, bw, bh, weather, seed) {
    return (g, S, R) => {
      g.fillStyle = shade(base, -0.4); g.fillRect(0, 0, S, S);
      const rows = round(S / bh), rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = (r % 2) * bw * 0.5 + R() * 10;
        while (x < S + bw) {
          const w = bw * (0.7 + R() * 0.6), c = shade(base, (R() - 0.5) * 0.2), y = r * rh, xx = x;
          wrap(g, S, () => {
            g.fillStyle = LG(g, 0, y, 0, y + rh, [[0, shade(c, 0.12)], [1, shade(c, -0.1)]]); rr(g, xx + 2, y + 2, w - 4, rh - 4, 3); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(xx + 3, y + 2, w - 6, 2);
          });
          x += w;
        }
      }
      mottle(g, S, field(S, 30, 2, seed), 0.32); // granite speckle
      mottle(g, S, field(S, 5, 3, seed + 1), 0.22);
      grime(g, S, field(S, 3, 4, seed + 2), weather, [64, 66, 52], 0.5);
    };
  }
  reg('ashlar', 1, paintAshlar('#a8a396', 120, 60, 0.45, 71));
  reg('ashlarDark', 1, paintAshlar('#86837b', 120, 60, 0.6, 75));
  reg('granite', 1, (g, S) => {
    g.fillStyle = '#b4b0a4'; g.fillRect(0, 0, S, S);
    mottle(g, S, field(S, 40, 2, 81), 0.35); mottle(g, S, field(S, 4, 3, 82), 0.2);
    grime(g, S, field(S, 3, 4, 83), 0.35, [70, 70, 60], 0.55);
  });
  reg('pave', 1, (g, S, R) => { // 0.5 m square pavers
    g.fillStyle = '#6e6a62'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      const col = shade('#a39f94', (R() - 0.5) * 0.18), x = c * S / 2, y = r * S / 2;
      g.fillStyle = col; rr(g, x + 2, y + 2, S / 2 - 4, S / 2 - 4, 4); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 4, y + 3, S / 2 - 8, 2);
    }
    mottle(g, S, field(S, 30, 2, 91), 0.3);
    grime(g, S, field(S, 3, 4, 92), 0.5, [60, 64, 46], 0.5);
  });
  reg('rubble', 1.2, (g, S, R) => { // fieldstone / coral rubble in lime mortar
    g.fillStyle = '#9a9384'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) {
      const x = R() * S, y = R() * S, rx = 10 + R() * 22, ry = 8 + R() * 14, c = mixHex('#8a8478', '#5e5a52', R());
      wrap(g, S, () => {
        g.fillStyle = 'rgba(0,0,0,0.35)'; ell(g, x + 2, y + 3, rx, ry, R()); g.fill();
        g.fillStyle = RG(g, x - rx * 0.3, y - ry * 0.4, rx * 1.4, [[0, shade(c, 0.25)], [1, shade(c, -0.15)]]); ell(g, x, y, rx, ry); g.fill();
      });
    }
    mottle(g, S, field(S, 24, 2, 101), 0.3);
    grime(g, S, field(S, 3, 4, 102), 0.5, [60, 70, 44], 0.5);
  });
  reg('slateWall', 1, (g, S, R) => { // stacked thin slate slabs
    g.fillStyle = '#2c2d2b'; g.fillRect(0, 0, S, S);
    let y = 0;
    while (y < S) {
      const h = 8 + R() * 10; let x = R() * 30;
      while (x < S + 30) {
        const w = 30 + R() * 60, c = shade('#707470', (R() - 0.5) * 0.3), xx = x, yy = y;
        wrap(g, S, () => { g.fillStyle = c; g.fillRect(xx + 1, yy + 1, w - 2, h - 2); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(xx + 1, yy + 1, w - 2, 1.5); });
        x += w;
      }
      y += h;
    }
    mottle(g, S, field(S, 10, 3, 111), 0.3);
    grime(g, S, field(S, 3, 4, 112), 0.4, [60, 70, 50], 0.55);
  });
  reg('rock', 2, (g, S, R) => { // weathered sandstone/andesite hill face: strata, cracks, lichen and moss
    g.fillStyle = '#7a6e5e'; g.fillRect(0, 0, S, S);
    const F = field(S, 5, 5, 120);
    modulate(g, S, F, (r, gg, b, v, x, y) => { const k = 0.7 + 0.6 * v + 0.08 * sin(y * 0.11 + v * 6); return [r * k, gg * k, b * k]; }); // strata
    g.strokeStyle = 'rgba(30,24,18,0.45)'; g.lineWidth = 1.4;
    for (let i = 0; i < 16; i++) { let x = R() * S, y = R() * S; const a = R() * TAU; wrap(g, S, () => { g.beginPath(); g.moveTo(x, y); let xx = x, yy = y; for (let k = 0; k < 5; k++) { xx += cos(a + (R() - 0.5)) * 12; yy += sin(a + (R() - 0.5)) * 12; g.lineTo(xx, yy); } g.stroke(); }); }
    mottle(g, S, field(S, 24, 2, 121), 0.3);
    grime(g, S, field(S, 3, 5, 122), 0.8, [64, 96, 46], 0.5);  // moss
    grime(g, S, field(S, 10, 3, 123), 0.35, [170, 168, 140], 0.7); // pale lichen
  });

  // ---------------------------------------------------------------- plaster, timber
  reg('plaster', 2, (g, S, R) => { // lime plaster, neutral off-white (tinted by vertex colour)
    g.fillStyle = '#e8e2d4'; g.fillRect(0, 0, S, S);
    mottle(g, S, field(S, 6, 5, 131), 0.16);
    grime(g, S, field(S, 2, 5, 132), 0.35, [150, 138, 116], 0.5); // water stains
    g.strokeStyle = 'rgba(80,70,60,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { // hairline cracks
      let x = R() * S, y = R() * S; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 20; y += 4 + R() * 10; g.lineTo(x, y); }
      g.stroke();
    }
    for (let i = 0; i < 2; i++) { // a couple of small spalled patches showing brick
      const x = R() * S, y = R() * S, w = 6 + R() * 9, h = 4 + R() * 5;
      wrap(g, S, () => { g.fillStyle = 'rgba(150,96,70,0.3)'; ell(g, x, y, w, h, R()); g.fill(); g.strokeStyle = 'rgba(80,60,40,0.25)'; g.stroke(); });
    }
  });
  function paintPlanks(base, vertical, boards, seed) {
    return (g, S, R) => {
      g.fillStyle = shade(base, -0.5); g.fillRect(0, 0, S, S);
      const bw = S / boards;
      for (let i = 0; i < boards; i++) {
        const c = shade(base, (R() - 0.5) * 0.3), a = i * bw;
        if (vertical) {
          g.fillStyle = LG(g, a, 0, a + bw, 0, [[0, shade(c, -0.2)], [0.15, c], [0.85, c], [1, shade(c, -0.3)]]); g.fillRect(a + 1, 0, bw - 2, S);
          for (let k = 0; k < 14; k++) { g.strokeStyle = rgba(shade(c, -0.4), 0.4); g.lineWidth = 0.8; const x = a + 3 + R() * (bw - 6); g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= S; y += 20) g.lineTo(x + sin(y * 0.03 + k) * 2, y); g.stroke(); }
          if (R() < 0.6) { const y = R() * S; ell(g, a + bw / 2, y, 3, 5); g.fillStyle = rgba(shade(c, -0.5), 0.8); g.fill(); }
          g.fillStyle = '#2a221c'; for (const y of [S * 0.1, S * 0.6]) g.fillRect(a + bw / 2 - 1, y, 2, 2);
        } else { // clapboard: each board overlaps the one below
          g.fillStyle = LG(g, 0, a, 0, a + bw, [[0, shade(c, 0.08)], [0.85, c], [1, shade(c, -0.45)]]); g.fillRect(0, a, S, bw);
          g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, a + bw - 2, S, 2);
          for (let k = 0; k < 6; k++) { g.strokeStyle = rgba(shade(c, -0.35), 0.35); g.lineWidth = 0.8; const y = a + 2 + R() * (bw - 6); line(g, 0, y, S, y + (R() - 0.5) * 2); }
        }
      }
      mottle(g, S, field(S, 8, 4, seed), 0.3);
      grime(g, S, field(S, 3, 4, seed + 1), 0.45, [30, 26, 22], 0.5);
    };
  }
  reg('woodV', 1, paintPlanks('#6a4630', true, 5, 141));
  reg('woodH', 1, paintPlanks('#6a4630', false, 6, 145));
  reg('woodNeutral', 1, paintPlanks('#c8b8a0', true, 4, 149)); // tinted by vertex colour (painted boards)
  reg('grain', 1, (g, S, R) => { // neutral timber grain along v (posts, beams); tint = lacquer colour
    g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 60; k++) { const x = R() * S; g.strokeStyle = `rgba(90,70,50,${0.08 + R() * 0.18})`; g.lineWidth = 0.6 + R() * 1.6; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= S; y += 16) g.lineTo(x + sin(y * 0.026 + k) * 3, y); g.stroke(); }
    mottle(g, S, field(S, 6, 4, 151), 0.18);
    grime(g, S, field(S, 3, 4, 152), 0.3, [70, 50, 40], 0.58); // worn lacquer
  });
  reg('soffit', 1, (g, S, R) => { // underside of eaves: round rafters (椽) on boards
    g.fillStyle = '#4a3528'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 5; k++) { const x = (k + 0.5) * S / 5; g.fillStyle = LG(g, x - 12, 0, x + 12, 0, [[0, '#2a1c14'], [0.4, '#7a5a40'], [1, '#2a1c14']]); g.fillRect(x - 12, 0, 24, S); }
    mottle(g, S, field(S, 6, 3, 161), 0.25);
  });
  reg('beamPaint', 1, (g, S, R) => { // 彩繪 painted beam: blue-green ground, gold medallions, red cores (v = across)
    g.fillStyle = '#1f4a5c'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#d9a53a'; g.fillRect(0, 0, S, 10); g.fillRect(0, S - 10, S, 10);
    for (let k = 0; k < 2; k++) {
      const x = (k + 0.5) * S / 2;
      g.fillStyle = '#2f7a6a'; rr(g, x - 50, 30, 100, S - 60, 40); g.fill();
      g.strokeStyle = '#e8c060'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#e8c060'; ell(g, x, S / 2, 26, 22); g.fill();
      g.fillStyle = '#c33a2a'; ell(g, x, S / 2, 12, 10); g.fill();
      g.fillStyle = '#f4f0e0'; ell(g, x - 3, S / 2 - 3, 4, 3); g.fill();
    }
    for (let k = 0; k < 2; k++) { const x = k * S / 2; g.strokeStyle = '#e8c060'; g.lineWidth = 3; for (let j = 0; j < 3; j++) line(g, x - 6 + j * 6, 16, x - 6 + j * 6, S - 16); }
    mottle(g, S, field(S, 6, 3, 171), 0.2);
    grime(g, S, field(S, 3, 4, 172), 0.35, [30, 30, 26], 0.55);
  });
  reg('frieze', 1, (g, S, R) => { // 水車堵: white plaster band with coloured tiles & painted vignettes (v across)
    g.fillStyle = '#ece4d0'; g.fillRect(0, 0, S, S);
    const cols = ['#3d8a7a', '#c9453a', '#2f5e9a', '#d9a23a'];
    for (let k = 0; k < 4; k++) {
      const x = k * S / 4 + 8, c = cols[k];
      g.fillStyle = c; rr(g, x, S * 0.28, S / 4 - 16, S * 0.44, 8); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 6, S * 0.3, S / 8, 5);
      g.strokeStyle = shade(c, -0.4); g.lineWidth = 2; g.beginPath(); g.arc(x + S / 8 - 8, S / 2, 12, 0.3, PI * 1.7); g.stroke();
    }
    g.fillStyle = '#7a3a26'; g.fillRect(0, S - 12, S, 6); g.fillRect(0, 6, S, 6);
    mottle(g, S, field(S, 6, 3, 181), 0.18);
    grime(g, S, field(S, 3, 4, 182), 0.4, [120, 110, 90], 0.5);
  });
  reg('gold', 0.5, (g, S) => {
    g.fillStyle = '#d6a73e'; g.fillRect(0, 0, S, S);
    mottle(g, S, field(S, 10, 3, 191), 0.45);
    modulate(g, S, field(S, 30, 2, 192), (r, gg, b, v) => (v > 0.7 ? [r * 0.75, gg * 0.7, b * 0.6] : [r, gg, b])); // leaf cracks
  });
  reg('bronze', 1, (g, S) => {
    g.fillStyle = '#5a6e5c'; g.fillRect(0, 0, S, S);
    mottle(g, S, field(S, 8, 4, 201), 0.5);
    grime(g, S, field(S, 3, 4, 202), 0.6, [120, 170, 140], 0.55); // verdigris
    grime(g, S, field(S, 5, 3, 203), 0.4, [70, 50, 30], 0.6);
  });
  reg('iron', 0.5, (g, S) => {
    g.fillStyle = '#3a3836'; g.fillRect(0, 0, S, S);
    mottle(g, S, field(S, 10, 3, 211), 0.4);
    grime(g, S, field(S, 4, 4, 212), 0.6, [120, 64, 30], 0.6); // rust
  });

  // ---------------------------------------------------------------- windows & doors (paper glows in the glow bucket)
  function paintLattice(kind) {
    return (g, S) => {
      const bar = kind === 'shoji' ? 5 : 9;
      g.fillStyle = '#f2dcae'; g.fillRect(0, 0, S, S);
      g.fillStyle = RG(g, S / 2, S / 2, S * 0.8, [[0, 'rgba(255,240,200,0.0)'], [1, 'rgba(170,110,60,0.25)']]); g.fillRect(0, 0, S, S);
      g.strokeStyle = '#2a1a10'; g.lineWidth = bar; g.lineCap = 'square';
      if (kind === 'grid') { for (let k = 0; k < 4; k++) { line(g, k * S / 4, 0, k * S / 4, S); line(g, 0, k * S / 4, S, k * S / 4); } }
      else if (kind === 'shoji') { for (let k = 0; k < 4; k++) line(g, k * S / 4, 0, k * S / 4, S); for (let k = 0; k < 6; k++) line(g, 0, k * S / 6, S, k * S / 6); }
      else if (kind === 'diamond') { for (let k = -4; k <= 4; k++) { line(g, k * S / 4, 0, k * S / 4 + S, S); line(g, k * S / 4, S, k * S / 4 + S, 0); } }
      else if (kind === 'turtle') { // 龜甲 hexagonal
        for (let r = -1; r < 4; r++) for (let c = -1; c < 4; c++) {
          const x = c * S / 3 + (r % 2) * S / 6, y = r * S / 3; g.beginPath();
          for (let k = 0; k < 6; k++) { const a = k * PI / 3; g.lineTo(x + cos(a) * S / 6.5, y + sin(a) * S / 6.5); }
          g.closePath(); g.stroke();
        }
      }
      g.strokeStyle = 'rgba(255,220,170,0.18)'; g.lineWidth = 1.5; // bar highlights
      if (kind === 'grid') for (let k = 0; k < 4; k++) line(g, k * S / 4 - bar / 2, 0, k * S / 4 - bar / 2, S);
    };
  }
  reg('latGrid', 0.45, paintLattice('grid'));
  reg('latShoji', 0.5, paintLattice('shoji'));
  reg('latDiamond', 0.4, paintLattice('diamond'));
  reg('latTurtle', 0.45, paintLattice('turtle'));
  // door leaves (decals: uv 0..1 over one leaf)
  function doorGodPainter(flip, face, robe) {
    return (g, S) => {
      g.fillStyle = LG(g, 0, 0, S, 0, [[0, '#8e2219'], [1, '#6a1610']]); g.fillRect(0, 0, S, S);
      g.strokeStyle = '#d6a542'; g.lineWidth = 6; g.strokeRect(6, 6, S - 12, S - 12);
      g.save(); g.translate(S / 2, S * 0.53); if (flip) g.scale(-1, 1); const s = S / 70;
      // cloud base
      g.fillStyle = '#e8e0cc'; for (let k = -2; k <= 2; k++) { ell(g, k * 9 * s, 30 * s, 8 * s, 4 * s); g.fill(); }
      // armoured body, cape, belt
      g.fillStyle = '#1d3e52'; g.beginPath(); g.moveTo(-16 * s, -12 * s); g.lineTo(16 * s, -12 * s); g.lineTo(20 * s, 28 * s); g.lineTo(-20 * s, 28 * s); g.closePath(); g.fill();
      g.fillStyle = robe; g.beginPath(); g.moveTo(-12 * s, -12 * s); g.lineTo(12 * s, -12 * s); g.lineTo(15 * s, 26 * s); g.lineTo(-15 * s, 26 * s); g.closePath(); g.fill();
      g.strokeStyle = '#e2b24a'; g.lineWidth = 1.4 * s; for (let y = -6; y < 24; y += 5) line(g, -13 * s, y * s, 13 * s, y * s);
      g.fillStyle = '#e2b24a'; g.fillRect(-14 * s, 4 * s, 28 * s, 4 * s);
      g.fillStyle = '#d9443a'; ell(g, 0, -4 * s, 6 * s, 6 * s); g.fill();
      // head, beard, helmet with plume
      ell(g, 0, -19 * s, 7 * s, 8 * s); g.fillStyle = face; g.fill();
      g.fillStyle = '#16100e'; g.beginPath(); g.moveTo(-7 * s, -16 * s); g.quadraticCurveTo(0, 0, 7 * s, -16 * s); g.quadraticCurveTo(0, -11 * s, -7 * s, -16 * s); g.fill();
      g.fillStyle = '#fff'; g.fillRect(-4.5 * s, -21 * s, 3 * s, 1.6 * s); g.fillRect(1.5 * s, -21 * s, 3 * s, 1.6 * s);
      g.fillStyle = '#16100e'; g.fillRect(-5.5 * s, -24 * s, 4 * s, 1.2 * s); g.fillRect(1.5 * s, -24 * s, 4 * s, 1.2 * s);
      g.fillStyle = '#e2b24a'; g.beginPath(); g.moveTo(-9 * s, -24 * s); g.quadraticCurveTo(0, -36 * s, 9 * s, -24 * s); g.closePath(); g.fill();
      g.fillStyle = '#d9443a'; ell(g, 0, -34 * s, 2.2 * s, 4 * s); g.fill();
      // halberd
      g.strokeStyle = '#e8d6a0'; g.lineWidth = 2 * s; line(g, 19 * s, -36 * s, 19 * s, 30 * s);
      g.fillStyle = '#d8d8d0'; g.beginPath(); g.moveTo(19 * s, -42 * s); g.lineTo(23 * s, -34 * s); g.lineTo(15 * s, -34 * s); g.fill();
      g.restore();
      mottle(g, S, field(S, 6, 3, flip ? 221 : 222), 0.15);
      grime(g, S, field(S, 3, 4, 223), 0.3, [50, 20, 10], 0.6);
    };
  }
  reg('doorGodL', 1, doorGodPainter(false, '#e9b48c', '#2f6e8a'), true);
  reg('doorGodR', 1, doorGodPainter(true, '#c9563e', '#7a3a8a'), true);
  reg('doorStuds', 1, (g, S) => { // red lacquer leaf with 門釘 gold studs (decal)
    g.fillStyle = LG(g, 0, 0, S, 0, [[0, '#a3281f'], [1, '#7a1a14']]); g.fillRect(0, 0, S, S);
    g.strokeStyle = '#4a0e0a'; g.lineWidth = 6; g.strokeRect(4, 4, S - 8, S - 8);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) {
      const x = S * (0.2 + c * 0.2), y = S * (0.12 + r * 0.125);
      g.fillStyle = RG(g, x - 2, y - 2, 9, [[0, '#fff0b0'], [0.5, '#e0b048'], [1, '#7a5a18']]); ell(g, x, y, 7, 7); g.fill();
    }
    g.fillStyle = '#d9a53a'; ell(g, S * 0.86, S * 0.5, 10, 10); g.fill(); // ring knocker
    g.strokeStyle = '#b08030'; g.lineWidth = 3; ell(g, S * 0.86, S * 0.56, 12, 14); g.stroke();
    mottle(g, S, field(S, 6, 3, 231), 0.15);
    grime(g, S, field(S, 3, 4, 232), 0.3, [50, 20, 10], 0.6);
  }, true);
  reg('doorPlank', 1, (g, S, R) => { // dark plank leaf with iron straps (decal)
    for (let k = 0; k < 4; k++) { const c = shade('#4a3020', (R() - 0.5) * 0.3); g.fillStyle = LG(g, k * S / 4, 0, (k + 1) * S / 4, 0, [[0, shade(c, -0.25)], [0.2, c], [1, shade(c, -0.3)]]); g.fillRect(k * S / 4, 0, S / 4, S); }
    g.fillStyle = '#26221e'; for (const y of [0.18, 0.8]) g.fillRect(0, S * y, S, 10);
    g.fillStyle = '#6a6460'; for (const y of [0.18, 0.8]) for (let k = 0; k < 5; k++) g.fillRect(S * (0.1 + k * 0.2), S * y + 3, 4, 4);
    mottle(g, S, field(S, 6, 3, 241), 0.25);
  }, true);
  reg('doorRed', 1, (g, S) => { // plain red leaf with framed panels (decal) – houses
    g.fillStyle = '#7e2418'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#4e120c'; g.lineWidth = 5;
    g.strokeRect(S * 0.12, S * 0.08, S * 0.76, S * 0.36); g.strokeRect(S * 0.12, S * 0.52, S * 0.76, S * 0.4);
    g.fillStyle = 'rgba(255,200,160,0.12)'; g.fillRect(S * 0.14, S * 0.1, S * 0.72, 3);
    mottle(g, S, field(S, 6, 3, 251), 0.2);
    grime(g, S, field(S, 3, 4, 252), 0.35, [40, 20, 10], 0.55);
  }, true);

  // ---------------------------------------------------------------- lanterns, cloth
  function paintLantern(base, glyph, glyphCol) {
    return (g, S) => { // u wraps around the lantern (u=0.5 faces +z), v bottom→top
      g.fillStyle = base; g.fillRect(0, 0, S, S);
      g.fillStyle = LG(g, 0, 0, 0, S, [[0, 'rgba(0,0,0,0.25)'], [0.5, 'rgba(255,255,220,0.25)'], [1, 'rgba(0,0,0,0.25)']]); g.fillRect(0, 0, S, S);
      g.strokeStyle = rgba(shade(base, -0.5), 0.6); g.lineWidth = 2; for (let k = 0; k < 12; k++) line(g, k * S / 12, 0, k * S / 12, S); // bamboo ribs
      g.strokeStyle = rgba(shade(base, -0.45), 0.45); for (let k = 1; k < 8; k++) line(g, 0, k * S / 8, S, k * S / 8);
      if (glyph) { g.save(); g.translate(S / 2, S / 2); g.scale(0.55, 1); chars(g, glyph, 0, 6, S * 0.5, glyphCol, 'v'); g.restore(); }
    };
  }
  reg('lanternRed', 1, paintLantern('#e04030', null), true);
  reg('lanternFu', 1, paintLantern('#e04030', '福', '#1a0a06'), true);
  reg('lanternPing', 1, paintLantern('#e04030', '平', '#1a0a06'), true);
  reg('lanternAn', 1, paintLantern('#e04030', '安', '#1a0a06'), true);
  reg('lanternWhite', 1, paintLantern('#f0e6cf', null), true);
  reg('lanternBlue', 1, paintLantern('#9ac8f0', null), true);
  function paintCloth(base, seed) {
    return (g, S) => {
      g.fillStyle = base; g.fillRect(0, 0, S, S);
      g.globalAlpha = 0.18; g.strokeStyle = shade(base, -0.5); g.lineWidth = 1;
      for (let k = 0; k < S; k += 3) { line(g, k, 0, k, S); line(g, 0, k, S, k); }
      g.globalAlpha = 1;
      mottle(g, S, field(S, 4, 3, seed), 0.2);
    };
  }
  reg('clothRed', 0.5, paintCloth('#b8261e', 261));
  reg('clothIndigo', 0.5, paintCloth('#2b3b68', 262));
  reg('clothCream', 0.5, paintCloth('#e8dcc0', 263));
  function paintNoren(base, glyph) { // two-panel door curtain (decal over the whole curtain)
    return (g, S) => {
      paintCloth(base, 264)(g, S);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(S / 2 - 2, S * 0.22, 4, S);
      g.fillStyle = shade(base, -0.35); g.fillRect(0, 0, S, S * 0.07);
      if (glyph === '○') { g.strokeStyle = '#efe6d2'; g.lineWidth = 9; ell(g, S / 2, S * 0.48, S * 0.18, S * 0.18); g.stroke(); }
      else if (glyph) { g.fillStyle = '#efe6d2'; ell(g, S / 2, S * 0.48, S * 0.22, S * 0.22); g.fill(); chars(g, glyph, S / 2, S * 0.49, S * 0.3, base, 'v'); }
    };
  }
  reg('norenCha', 1, paintNoren('#2b3b68', '茶'), true);
  reg('norenTang', 1, paintNoren('#8a3424', '湯'), true);
  reg('norenDian', 1, paintNoren('#2b3b68', '店'), true);
  reg('norenPlain', 1, paintNoren('#2b3b68', '○'), true);
  reg('norenRed', 1, paintNoren('#7a2a24', '○'), true);
  reg('embroid', 0.6, (g, S, R) => { // red silk with gold embroidery (altar curtains, table skirts, palanquin)
    g.fillStyle = '#9a1c16'; g.fillRect(0, 0, S, S);
    g.strokeStyle = '#e8b84a'; g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { const y = (k + 0.5) * S / 3; g.beginPath(); for (let x = 0; x <= S; x += 8) g.lineTo(x, y + sin(x / S * TAU * 2) * 14); g.stroke(); }
    for (let k = 0; k < 6; k++) { const x = (k % 3 + 0.5) * S / 3, y = (floor(k / 3) + 0.5) * S / 2 + 20; g.fillStyle = '#f0c75a'; for (let j = 0; j < 5; j++) { ell(g, x + cos(j * 1.26) * 9, y + sin(j * 1.26) * 9, 6, 4, j * 1.26); g.fill(); } g.fillStyle = '#2f9a74'; ell(g, x, y, 4, 4); g.fill(); }
    g.fillStyle = '#e8b84a'; g.fillRect(0, S - 10, S, 6);
    mottle(g, S, field(S, 6, 3, 271), 0.2);
  });
  reg('paperColor', 0.5, (g, S) => { // 紙紮 paper craft: bright panels, gold borders, cut patterns
    const cols = ['#e04a6a', '#3a7ad0', '#f2c94c', '#3fae6a', '#a85ad0'];
    for (let k = 0; k < 5; k++) { g.fillStyle = cols[k]; g.fillRect(k * S / 5, 0, S / 5, S); }
    g.strokeStyle = '#f6e08a'; g.lineWidth = 4; for (let k = 0; k <= 5; k++) line(g, k * S / 5, 0, k * S / 5, S);
    g.fillStyle = 'rgba(255,255,255,0.55)'; for (let k = 0; k < 5; k++) for (let j = 0; j < 4; j++) { ell(g, (k + 0.5) * S / 5, (j + 0.5) * S / 4, 9, 9); g.fill(); }
  });
  reg('rockets', 0.25, (g, S) => { // 蜂炮 bottle-rocket rack: red tube ends in a grid with fuses
    g.fillStyle = '#2a1410'; g.fillRect(0, 0, S, S);
    const n = 8, w = S / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = (c + 0.5) * w, y = (r + 0.5) * w;
      g.fillStyle = RG(g, x - 3, y - 3, w * 0.5, [[0, '#ff6a50'], [1, '#8a1810']]); ell(g, x, y, w * 0.38, w * 0.38); g.fill();
      g.fillStyle = '#f0d070'; ell(g, x, y, w * 0.1, w * 0.1); g.fill();
    }
  });
  reg('bamboo', 1, (g, S) => { // culm: v along the stalk, nodes every 0.33 m
    g.fillStyle = LG(g, 0, 0, S, 0, [[0, '#4e6a2a'], [0.35, '#9ab45a'], [0.6, '#7a9640'], [1, '#3e5420']]); g.fillRect(0, 0, S, S);
    for (let k = 0; k < 3; k++) { const y = k * S / 3; g.fillStyle = '#c8c890'; g.fillRect(0, y, S, 5); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 5, S, 3); }
    mottle(g, S, field(S, 6, 3, 281), 0.25);
    grime(g, S, field(S, 3, 4, 282), 0.4, [120, 110, 70], 0.55);
  });
  reg('weave', 0.5, (g, S) => { // woven bamboo / rattan basketry
    g.fillStyle = '#6a5030'; g.fillRect(0, 0, S, S);
    const n = 8, w = S / n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = c * w, y = r * w, hor = (r + c) % 2 === 0;
      g.fillStyle = hor ? LG(g, 0, y, 0, y + w, [[0, '#7a5c34'], [0.5, '#c8a468'], [1, '#6a4c28']]) : LG(g, x, 0, x + w, 0, [[0, '#6a4c28'], [0.5, '#b8945a'], [1, '#5a3e20']]);
      g.fillRect(x + 1, y + 1, w - 2, w - 2);
    }
    grime(g, S, field(S, 3, 4, 291), 0.35, [50, 40, 30], 0.55);
  });
  reg('relief', 1, (g, S) => { // carved granite panel (decal): border + scrolling clouds & a crane
    g.fillStyle = '#bab6aa'; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(60,56,48,0.6)'; g.lineWidth = 6; g.strokeRect(10, 10, S - 20, S - 20);
    g.lineWidth = 4;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(40 + k * 40, S * 0.7, 16, PI * (0.2 + k * 0.3), PI * (1.7 + k * 0.3)); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(38 + k * 40, S * 0.68, 16, PI * (1.0 + k * 0.3), PI * (1.4 + k * 0.3)); g.stroke(); }
    g.fillStyle = 'rgba(70,64,56,0.55)'; g.beginPath(); g.moveTo(70, 80); g.quadraticCurveTo(120, 40, 170, 70); g.quadraticCurveTo(130, 70, 120, 110); g.quadraticCurveTo(100, 80, 70, 80); g.fill();
    mottle(g, S, field(S, 30, 2, 301), 0.3);
    grime(g, S, field(S, 3, 4, 302), 0.35, [70, 70, 60], 0.55);
  }, true);
  reg('dirt', 1.5, (g, S, R) => {
    g.fillStyle = '#5a4a38'; g.fillRect(0, 0, S, S);
    mottle(g, S, field(S, 12, 4, 311), 0.45);
    for (let i = 0; i < 90; i++) { const x = R() * S, y = R() * S; wrap(g, S, () => { g.fillStyle = rgba(mixHex('#8a7c68', '#4a3e30', R()), 0.9); ell(g, x, y, 2 + R() * 4, 1.5 + R() * 3); g.fill(); }); }
  });
  reg('clapNeutral', 1, paintPlanks('#c8bca8', false, 6, 321)); // clapboard tinted by vertex colour
  reg('white', 1, (g, S) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S); }); // flat: colour comes from the vertex colour

  // paint everything into the atlas (lazily, once)
  function atlas() {
    if (AT.tex) return AT.tex;
    const c = document.createElement('canvas'); c.width = c.height = AT.SIZE;
    const g = c.getContext('2d');
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = AT.IN;
    const tg = tmp.getContext('2d', { willReadFrequently: true });
    PAINT.forEach(([name, size, painter, decal], i) => {
      const col = i % AT.N, row = floor(i / AT.N);
      if (row >= AT.N) { console.warn('arch_han atlas full', name); return; }
      tg.save(); tg.clearRect(0, 0, AT.IN, AT.IN); tg.lineJoin = 'round'; tg.lineCap = 'round';
      try { painter(tg, AT.IN, mulberry(hashStr(name))); } catch (e) { G.warnOnce && G.warnOnce('atlas ' + name, e); }
      tg.restore();
      const x0 = col * AT.CELL + AT.PAD, y0 = row * AT.CELL + AT.PAD;
      // centre + wrap gutters (decals clamp: stretch their edge pixels instead)
      g.save(); g.beginPath(); g.rect(col * AT.CELL, row * AT.CELL, AT.CELL, AT.CELL); g.clip();
      if (decal) { g.drawImage(tmp, x0 - AT.PAD, y0 - AT.PAD, AT.CELL, AT.CELL); g.drawImage(tmp, x0, y0); }
      else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.drawImage(tmp, x0 + dx * AT.IN, y0 + dy * AT.IN);
      g.restore();
      REG[name] = { c: col, r: row, size, decal };
    });
    AT.canvas = c;
    AT.tex = G.R3M.canvasTex(c, {});
    AT.tex.shared = true;
    return AT.tex;
  }
  function region(name) { atlas(); const r = REG[name]; if (!r) throw new Error('arch_han: no atlas region ' + name); return r; }

  // =================================================================================================
  // MATERIALS (shared by every Han building → few shader programs)
  // =================================================================================================
  const MATS = {};
  const ATLAS_GLSL = `
  #ifdef USE_MAP
    vec2 aCell = floor(vMapUv / ${AT.SPAN}.0);
    vec2 aLoc = vMapUv - aCell * ${AT.SPAN}.0;
    vec2 aSt = (aCell * ${AT.CELL}.0 + ${AT.PAD}.0 + fract(aLoc) * ${AT.IN}.0) / ${AT.SIZE}.0;
    vec2 aGx = dFdx(aLoc) * (${AT.IN}.0 / ${AT.SIZE}.0), aGy = dFdy(aLoc) * (${AT.IN}.0 / ${AT.SIZE}.0);
    float aK = min(1.0, (7.0 / ${AT.SIZE}.0) / max(max(length(aGx), length(aGy)), 1e-7));
    vec4 sampledDiffuseColor = textureGrad(map, aSt, aGx * aK, aGy * aK);
    diffuseColor *= sampledDiffuseColor;
  #endif`;
  // vertex sway about a per-vertex pivot (aPivot.xyz, phase in .w); ripple > 0 adds a travelling cloth wave
  function swayGLSL(amp, ripple) {
    return `#include <begin_vertex>
    { vec3 d = transformed - aPivot.xyz; float ph = aPivot.w; float L = max(0.0, -d.y); float t = uTime;
      float ax = (sin(t * 1.9 + ph) * 0.07 + sin(t * 3.3 + ph * 1.7) * 0.025) * ${amp.toFixed(3)};
      float az = (sin(t * 1.35 + ph * 0.6) * 0.06 + sin(t * 2.7 + ph * 2.3) * 0.02) * ${amp.toFixed(3)};
      float c = cos(ax), s = sin(ax); d = vec3(d.x, c * d.y - s * d.z, s * d.y + c * d.z);
      c = cos(az); s = sin(az); d = vec3(c * d.x - s * d.y, s * d.x + c * d.y, d.z);
      d.z += sin(t * 3.1 + ph + L * 5.0) * ${ripple.toFixed(3)} * L;
      d.x += sin(t * 2.2 + ph * 1.3 + L * 3.5) * ${(ripple * 0.4).toFixed(3)} * L;
      transformed = aPivot.xyz + d; }`;
  }
  function patch(mat, key, { atlasMap = true, sway = null } = {}) {
    mat.onBeforeCompile = (sh) => {
      if (atlasMap) sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', ATLAS_GLSL);
      if (sway) {
        sh.uniforms.uTime = G.R3M.cutUniforms().uTime;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec4 aPivot;\nuniform float uTime;')
          .replace('#include <begin_vertex>', swayGLSL(sway[0], sway[1]));
      }
    };
    mat.customProgramCacheKey = () => 'archhan|' + key;
    G.R3M.addCutout(mat);
    return mat;
  }
  function mat(name) {
    if (MATS[name]) return MATS[name];
    const map = atlas();
    let m;
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ map, vertexColors: true, roughness: 0.9, metalness: 0 }, o));
    if (name === 'matte') m = patch(std({}), 'a');
    else if (name === 'gloss') m = patch(std({ roughness: 0.4, envMapIntensity: 1.3 }), 'a');
    else if (name === 'metal') m = patch(std({ roughness: 0.32, metalness: 0.85, envMapIntensity: 1.6 }), 'a');
    else if (name === 'glow') m = patch(new THREE.MeshBasicMaterial({ map, vertexColors: true }), 'g');
    else if (name === 'sway') m = patch(new THREE.MeshBasicMaterial({ map, vertexColors: true }), 's', { sway: [1, 0] });
    else if (name === 'cloth') m = patch(std({ side: THREE.DoubleSide, roughness: 0.95 }), 'c', { sway: [0.45, 0.07] });
    else throw new Error('arch_han: unknown material ' + name);
    m.name = 'archhan_' + name;
    MATS[name] = m;
    return m;
  }

  // =================================================================================================
  // BUILDER: transforms + primitives writing into material buckets
  // =================================================================================================
  const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
  const ANIM = { sway: true, cloth: true };
  class Bld {
    constructor(seed = 1) { this.bk = new Map(); this.m = new THREE.Matrix4(); this.st = []; this.R = mulberry(seed); this.dec = null; this.lights = []; }
    bucket(n) {
      let b = this.bk.get(n);
      if (!b) { b = { p: [], n: [], uv: [], c: [], ix: [], piv: ANIM[n] ? [] : null }; this.bk.set(n, b); }
      return b;
    }
    push() { this.st.push(this.m.clone()); return this; }
    pop() { this.m.copy(this.st.pop()); return this; }
    tr(x, y, z) { this.m.multiply(_m.makeTranslation(x, y, z)); return this; }
    ry(a) { if (a) this.m.multiply(_m.makeRotationY(a)); return this; }
    rx(a) { if (a) this.m.multiply(_m.makeRotationX(a)); return this; }
    rz(a) { if (a) this.m.multiply(_m.makeRotationZ(a)); return this; }
    // world (model-space) position of a local point
    wp(x, y, z) { return _v.set(x, y, z).applyMatrix4(this.m).toArray(); }

    // P, N: flat local arrays; UV: flat local repeat coords (or decal 0..1 / raw); I: indices
    // o: { mat, reg, tint, k, ao, eave, uvAxis, glow, pivot:[x,y,z] (local), phase, raw }
    emit(o, P, N, UV, I) {
      const mname = o.mat || 'matte';
      const b = this.bucket(mname);
      const base = b.p.length / 3, nv = P.length / 3;
      if (!N) N = smoothNormals(P, I);
      _nm.getNormalMatrix(this.m);
      const W = new Float32Array(P.length);
      for (let i = 0; i < nv; i++) {
        _v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(this.m);
        W[i * 3] = _v.x; W[i * 3 + 1] = _v.y; W[i * 3 + 2] = _v.z;
        _n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(_nm).normalize();
        b.p.push(_v.x, _v.y, _v.z); b.n.push(_n.x, _n.y, _n.z);
      }
      // UVs
      let uv = UV;
      if (o.uvAxis || !uv) uv = axisUV(W, b.n, base, nv, o.size || (o.reg ? region(o.reg).size : 1), o.uo || 0, o.vo || 0);
      if (o.raw || mname === 'decal') { for (let i = 0; i < nv * 2; i++) b.uv.push(uv[i]); }
      else {
        const r = region(o.reg || 'white');
        let su = 0, sv = 0;
        if (r.decal) {
          for (let i = 0; i < nv; i++) b.uv.push(r.c * AT.SPAN + AT.HALF + clamp(uv[i * 2], 0.004, 0.996), (AT.N - 1 - r.r) * AT.SPAN + AT.HALF + clamp(uv[i * 2 + 1], 0.004, 0.996));
        } else {
          for (let i = 0; i < nv; i++) { su += uv[i * 2]; sv += uv[i * 2 + 1]; }
          const du = floor(su / nv), dv = floor(sv / nv); // integer recentring keeps the tiling phase
          for (let i = 0; i < nv; i++) b.uv.push(r.c * AT.SPAN + AT.HALF + clamp(uv[i * 2] - du, -AT.HALF + 1, AT.HALF - 1), (AT.N - 1 - r.r) * AT.SPAN + AT.HALF + clamp(uv[i * 2 + 1] - dv, -AT.HALF + 1, AT.HALF - 1));
        }
      }
      // colours: tint × brightness × AO
      const tf = typeof o.tint === 'function' ? o.tint : null;
      const tint = tf ? null : lin(o.tint || '#ffffff');
      const k = o.k != null ? o.k : (o.glow != null ? o.glow : 1);
      const useAO = o.ao !== false && mname !== 'glow' && mname !== 'sway';
      for (let i = 0; i < nv; i++) {
        const y = W[i * 3 + 1];
        let a = 1;
        if (useAO) {
          a = lerp(0.52, 1, sstep(-0.05, 0.75, y + (o.aoOff || 0)));
          if (o.eave != null) a *= lerp(1, 0.68, sstep(o.eave - 0.7, o.eave, y));
        }
        const t = tf ? lin(tf(W[i * 3], y, W[i * 3 + 2], i)) : tint;
        b.c.push(t[0] * k * a, t[1] * k * a, t[2] * k * a);
      }
      if (b.piv) {
        const pv = o.pivot ? this.wp(o.pivot[0], o.pivot[1], o.pivot[2]) : [0, 0, 0];
        for (let i = 0; i < nv; i++) b.piv.push(pv[0], pv[1], pv[2], o.phase || 0);
      }
      const flip = o.flip;
      for (let i = 0; i < I.length; i += 3) {
        if (flip) b.ix.push(base + I[i], base + I[i + 2], base + I[i + 1]);
        else b.ix.push(base + I[i], base + I[i + 1], base + I[i + 2]);
      }
      return this;
    }

    // ---- primitives (local coordinates of the current frame)
    // quad p0..p3 counter-clockwise seen from the front; uvs: optional [[u,v]×4] in repeat units / decal 0..1
    quad(p0, p1, p2, p3, o = {}, uvs) {
      const P = [...p0, ...p1, ...p2, ...p3];
      const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]];
      const n = norm(cross(e1, e2));
      const N = [...n, ...n, ...n, ...n];
      return this.emit(Object.assign({ uvAxis: !uvs }, o), P, N, uvs ? uvs.flat() : null, [0, 1, 2, 0, 2, 3]);
    }
    // planar rectangle facing +z in a sub-frame (x,y centre; w,h), rotated ry about its centre; decal-friendly
    rect(x, y, z, w, h, o = {}, ry = 0, uvs) {
      this.push().tr(x, y, z).ry(ry);
      const u = uvs || (o.decalUV ? [[0, 0], [1, 0], [1, 1], [0, 1]] : null);
      this.quad([-w / 2, -h / 2, 0], [w / 2, -h / 2, 0], [w / 2, h / 2, 0], [-w / 2, h / 2, 0], o, u);
      return this.pop();
    }
    // axis-aligned box, bottom centre at (x,y,z); o.skip: string of faces to omit ('t','b','n','s','e','w')
    box(x, y, z, w, h, d, o = {}) {
      const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2, sk = o.skip || '';
      const F = [];
      if (!sk.includes('s')) F.push([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
      if (!sk.includes('n')) F.push([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]);
      if (!sk.includes('e')) F.push([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]);
      if (!sk.includes('w')) F.push([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]);
      if (!sk.includes('t')) F.push([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
      if (!sk.includes('b')) F.push([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
      const P = [], N = [], I = [];
      for (const f of F) {
        const n = norm(cross(sub(f[1], f[0]), sub(f[3], f[0]))), b = P.length / 3;
        for (const p of f) { P.push(...p); N.push(...n); }
        I.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      return this.emit(Object.assign({ uvAxis: true }, o), P, N, null, I);
    }
    // cylinder / truncated cone (rb bottom, rt top), bottom centre at (x,y,z)
    cyl(x, y, z, rb, rt, h, o = {}) {
      const seg = o.seg || 12, P = [], N = [], UV = [], I = [], size = o.size || (o.reg ? region(o.reg).size : 1);
      const sl = (rb - rt) / h, circ = TAU * max(rb, rt);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU + (o.a0 || 0), c = cos(a), s = sin(a), n = norm([s, sl, c]);
        for (const [r, yy] of [[rb, 0], [rt, h]]) { P.push(x + s * r, y + yy, z + c * r); N.push(...n); UV.push(o.decalU ? j / seg : (j / seg) * circ / size, o.decalU ? yy / h : yy / size); }
      }
      for (let j = 0; j < seg; j++) { const a = j * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      this.emit(o, P, N, UV, I);
      if (o.caps !== false) {
        if (rt > 0.001 && !String(o.capSkip || '').includes('t')) this.disc(x, y + h, z, rt, 1, Object.assign({}, o, { seg }));
        if (rb > 0.001 && !String(o.capSkip || '').includes('b')) this.disc(x, y, z, rb, -1, Object.assign({}, o, { seg }));
      }
      return this;
    }
    disc(x, y, z, r, up, o = {}) {
      const seg = o.seg || 12, P = [x, y, z], N = [0, up, 0], I = [];
      for (let j = 0; j <= seg; j++) { const a = (j / seg) * TAU + (o.a0 || 0); P.push(x + sin(a) * r, y, z + cos(a) * r); N.push(0, up, 0); }
      for (let j = 1; j <= seg; j++) { if (up > 0) I.push(0, j, j + 1); else I.push(0, j + 1, j); }
      return this.emit(Object.assign({}, o, { uvAxis: true }), P, N, null, I);
    }
    // lathe: profile [[r,y],…] bottom→top around the y axis at (x,y,z)
    lathe(x, y, z, prof, o = {}) {
      const seg = o.seg || 12, P = [], UV = [], I = [], n = prof.length, size = o.size || (o.reg ? region(o.reg).size : 1);
      const len = [0]; for (let i = 1; i < n; i++) len.push(len[i - 1] + hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
      const y0 = prof[0][1], y1 = prof[n - 1][1], R = max(...prof.map((p) => p[0]));
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU + (o.a0 || 0);
        for (let i = 0; i < n; i++) {
          P.push(x + sin(a) * prof[i][0], y + prof[i][1], z + cos(a) * prof[i][0]);
          UV.push(o.decalU ? j / seg : (j / seg) * TAU * R / size, o.decalU ? (prof[i][1] - y0) / (y1 - y0 || 1) : len[i] / size);
        }
      }
      for (let j = 0; j < seg; j++) for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = (j + 1) * n + i;
        I.push(a, b, a + 1, a + 1, b, b + 1);
      }
      return this.emit(o, P, lathNormals(P, n, seg), UV, I);
    }
    // grid surface: us, vs parameter arrays; f(u,v) → [x,y,z]; uvf(u,v,p) → [lu,lv]
    grid(us, vs, f, uvf, o = {}) {
      const P = [], UV = [], I = [], nu = us.length, nv = vs.length;
      for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const p = f(us[i], vs[j]); P.push(p[0], p[1], p[2]); const t = uvf ? uvf(us[i], vs[j], p) : [us[i], vs[j]]; UV.push(t[0], t[1]); }
      for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
        const a = j * nu + i, b = a + nu;
        I.push(a, a + 1, b + 1, a, b + 1, b);
      }
      let N = smoothNormals(P, I);
      if (o.face) { // make the surface face roughly along o.face
        let d = 0; for (let i = 0; i < N.length; i += 3) d += N[i] * o.face[0] + N[i + 1] * o.face[1] + N[i + 2] * o.face[2];
        if (d < 0) { for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } for (let i = 0; i < N.length; i++) N[i] = -N[i]; }
      }
      return this.emit(o, P, N, UV, I);
    }
    // sweep a 2D cross-section along a 3D path. shape: [[side, up],…]; o.hard → faceted section; o.closed (default true);
    // o.scale(t) → section scale along the path; o.up: reference up vector; o.caps
    sweep(path, shape, o = {}) {
      const n = path.length, size = o.size || (o.reg ? region(o.reg).size : 1);
      const closed = o.closed !== false, up = o.up || [0, 1, 0];
      const frames = [];
      let acc = 0;
      for (let i = 0; i < n; i++) {
        const a = path[max(0, i - 1)], b = path[min(n - 1, i + 1)];
        const T = norm(sub(b, a));
        let S = cross(T, up); if (len3(S) < 1e-4) S = cross(T, [0, 0, 1]); S = norm(S);
        const U = norm(cross(S, T));
        if (i) acc += len3(sub(path[i], path[i - 1]));
        frames.push({ p: path[i], S, U, t: n > 1 ? i / (n - 1) : 0, d: acc });
      }
      const ring = (f, a, b) => { const s = o.scale ? o.scale(f.t) : 1; const sx = Array.isArray(s) ? s[0] : s, sy = Array.isArray(s) ? s[1] : s; return add(f.p, add(mul(f.S, a * sx), mul(f.U, b * sy))); };
      const edges = [];
      const ns = shape.length;
      for (let k = 0; k < (closed ? ns : ns - 1); k++) edges.push([k, (k + 1) % ns]);
      const P = [], UV = [], I = [];
      if (o.hard) {
        let per = 0;
        for (const [ka, kb] of edges) {
          const base = P.length / 3, el = hypot(shape[kb][0] - shape[ka][0], shape[kb][1] - shape[ka][1]);
          for (const f of frames) for (const [k, pv] of [[ka, per], [kb, per + el]]) { P.push(...ring(f, shape[k][0], shape[k][1])); UV.push(f.d / size, pv / size); }
          for (let i = 0; i < n - 1; i++) { const a = base + i * 2, b = a + 2; I.push(a, b, a + 1, a + 1, b, b + 1); }
          per += el;
        }
      } else {
        const per = [0]; for (let k = 1; k <= ns; k++) per.push(per[k - 1] + hypot(shape[k % ns][0] - shape[k - 1][0], shape[k % ns][1] - shape[k - 1][1]));
        const cols = closed ? ns + 1 : ns;
        for (const f of frames) for (let k = 0; k < cols; k++) { const s = shape[k % ns]; P.push(...ring(f, s[0], s[1])); UV.push(f.d / size, per[k] / size); }
        for (let i = 0; i < n - 1; i++) for (let k = 0; k < cols - 1; k++) { const a = i * cols + k, b = a + cols; I.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      if (o.flipSide) for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
      this.emit(o, P, null, UV, I);
      if (o.caps) for (const [f, dir] of [[frames[0], -1], [frames[n - 1], 1]]) {
        const cP = [], cI = [];
        let cx = 0, cy = 0; for (const s of shape) { cx += s[0]; cy += s[1]; } cx /= ns; cy /= ns;
        cP.push(...ring(f, cx, cy)); for (const s of shape) cP.push(...ring(f, s[0], s[1]));
        for (let k = 0; k < ns; k++) { const a = 1 + k, b = 1 + ((k + 1) % ns); if ((dir > 0) !== !!o.flipCaps) cI.push(0, a, b); else cI.push(0, b, a); }
        this.emit(Object.assign({}, o, { uvAxis: true }), cP, null, null, cI);
      }
      return this;
    }
    // polygon fan from centre c (3D points), front face counter-clockwise
    fan(c, pts, o = {}) {
      const P = [...c], I = [];
      for (const p of pts) P.push(...p);
      for (let k = 1; k < pts.length; k++) I.push(0, k, k + 1);
      if (o.closeFan) I.push(0, pts.length, 1);
      return this.emit(Object.assign({ uvAxis: true }, o), P, null, null, I);
    }

    // ---- per-model decal sheet (plaques, couplets, signs) → 'decal' bucket
    decal(w, h, paint) {
      if (!this.dec) {
        const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
        this.dec = { c, g: c.getContext('2d'), x: 0, y: 0, row: 0 };
      }
      const D = this.dec, pw = Math.ceil(w) + 4, ph = Math.ceil(h) + 4;
      if (D.x + pw > 1024) { D.x = 0; D.y += D.row; D.row = 0; }
      if (D.y + ph > 1024) { console.warn('arch_han decal sheet full'); D.y = 0; }
      const x = D.x + 2, y = D.y + 2;
      D.g.save(); D.g.translate(x, y); D.g.beginPath(); D.g.rect(0, 0, w, h); D.g.clip(); paint(D.g, w, h); D.g.restore();
      D.x += pw; D.row = max(D.row, ph);
      // uv (flipY texture: v = 1 − y/1024)
      return [[x / 1024, 1 - (y + h) / 1024], [(x + w) / 1024, 1 - (y + h) / 1024], [(x + w) / 1024, 1 - y / 1024], [x / 1024, 1 - y / 1024]];
    }

    light(x, y, z, color = '#ff8a3c', intensity = 1, distance = 4, flicker = 0.3) { this.lights.push({ x, y, z, color, intensity, distance, flicker }); return this; }

    // ---- finish: one mesh per bucket
    finish() {
      const g = new THREE.Group();
      for (const [name, b] of this.bk) {
        if (!b.ix.length || (window.__archSkip && window.__archSkip.includes(name))) continue;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
        if (b.piv) geo.setAttribute('aPivot', new THREE.Float32BufferAttribute(b.piv, 4));
        geo.setIndex(b.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(b.ix, 1) : new THREE.Uint16BufferAttribute(b.ix, 1));
        geo.computeBoundingSphere(); geo.computeBoundingBox();
        let m;
        if (name === 'decal') {
          const tx = G.R3M.canvasTex(this.dec.c, {}); tx.shared = true;
          m = G.R3M.env({ map: tx, vertexColors: true, roughness: 0.75 });
        } else m = mat(name);
        const mesh = new THREE.Mesh(geo, m);
        mesh.name = name; mesh.castShadow = name !== 'glow'; mesh.receiveShadow = true;
        if (ANIM[name]) { mesh.userData.noMerge = true; mesh.frustumCulled = false; }
        g.add(mesh);
      }
      g.userData.lights = this.lights;
      return g;
    }
  }
  // vector helpers
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = (a) => hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const vlerp = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  function smoothNormals(P, I) {
    const N = new Float32Array(P.length);
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (let i = 0; i < N.length; i += 3) { const l = hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
    return N;
  }
  function lathNormals(P, n, seg) { // smooth, with the seam welded
    const I = [];
    for (let j = 0; j < seg; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = (j + 1) * n + i; I.push(a, b, a + 1, a + 1, b, b + 1); }
    const N = smoothNormals(P, I);
    for (let i = 0; i < n; i++) { const a = i * 3, b = (seg * n + i) * 3; for (let k = 0; k < 3; k++) { const s = N[a + k] + N[b + k]; N[a + k] = N[b + k] = s; } const l = hypot(N[a], N[a + 1], N[a + 2]) || 1; for (let k = 0; k < 3; k++) { N[a + k] /= l; N[b + k] /= l; } }
    return N;
  }
  // world-axis planar UVs (consistent across separately emitted faces)
  function axisUV(W, Nb, base, nv, size, uo, vo) {
    const out = new Array(nv * 2);
    for (let i = 0; i < nv; i++) {
      const x = W[i * 3], y = W[i * 3 + 1], z = W[i * 3 + 2], nx = Nb[(base + i) * 3], ny = Nb[(base + i) * 3 + 1], nz = Nb[(base + i) * 3 + 2];
      const ax = abs(nx), ay = abs(ny), az = abs(nz);
      let u, v;
      if (ay > ax && ay > az) { u = x; v = ny > 0 ? -z : z; }
      else if (ax > az) { u = nx > 0 ? -z : z; v = y; }
      else { u = nz > 0 ? x : -x; v = y; }
      out[i * 2] = u / size + uo; out[i * 2 + 1] = v / size + vo;
    }
    return out;
  }

  // =================================================================================================
  // DECAL PAINTERS (per-model sheet)
  // =================================================================================================
  function paintBoard(g, w, h, text, { bg = '#1c2f5a', fg = '#f6d06a', rim = '#d6a542', dir = 'h', frame = 0.09 } = {}) {
    const f = min(w, h) * frame;
    g.fillStyle = rim; g.fillRect(0, 0, w, h);
    g.fillStyle = LG(g, 0, 0, 0, h, [[0, shade(rim, 0.3)], [0.5, rim], [1, shade(rim, -0.35)]]); g.fillRect(0, 0, w, h);
    g.fillStyle = LG(g, 0, f, 0, h - f, [[0, shade(bg, 0.16)], [1, shade(bg, -0.2)]]); g.fillRect(f, f, w - 2 * f, h - 2 * f);
    g.strokeStyle = rgba(shade(rim, -0.5), 0.6); g.lineWidth = max(1, f * 0.25); g.strokeRect(f, f, w - 2 * f, h - 2 * f);
    if (text) {
      const n = [...String(text)].length;
      const size = dir === 'v' ? min((w - 2 * f) * 0.78, (h - 2 * f) * 0.92 / n) : min((h - 2 * f) * 0.74, (w - 2 * f) * 0.92 / n);
      chars(g, text, w / 2, h / 2 + size * 0.04, size, fg, dir, 1.02, 'rgba(0,0,0,0.55)');
    }
    // weathering
    g.fillStyle = 'rgba(0,0,0,0.08)'; for (let i = 0; i < 12; i++) g.fillRect((i * 37) % w, ((i * 53) % h), w * 0.1, 2);
  }
  function paintPaper(g, w, h, text, { bg = '#c4281f', fg = '#1a0c0a', dir = 'v' } = {}) { // 春聯 red paper couplets
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,220,160,0.12)'; g.fillRect(0, 0, w * 0.15, h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 6; i++) g.fillRect(0, (i + 0.5) * h / 6, w, 1);
    const n = [...String(text)].length;
    const size = dir === 'v' ? min(w * 0.72, h * 0.9 / n) : min(h * 0.7, w * 0.9 / n);
    chars(g, text, w / 2, h / 2, size, fg, dir, 1.05);
  }

  // =================================================================================================
  // ARCHITECTURAL COMPONENTS
  // =================================================================================================
  const TP = 0.25; // clay tile row pitch (m) — matches the 4 rows/m painted in the tile regions
  const CAP_F = [0, 0.18, 0.29, 0.36, 0.43, 0.5, 0.57, 0.64, 0.71, 0.82];
  // tile corrugation height at coordinate a (along the eave)
  function corrTube(a, amp = 1) {
    const p = a / TP - floor(a / TP), c = p - 0.5, w = 0.22;
    return abs(c) < w ? 0.052 * amp * sqrt(1 - (c / w) * (c / w)) : -0.014 * amp * ((abs(c) - w) / (0.5 - w));
  }
  function corrBatten(a) { // tar paper battens at 0.25 + k·0.5
    const p = (a - 0.25) / 0.5 - floor((a - 0.25) / 0.5), d = min(p, 1 - p) * 0.5;
    return d < 0.022 ? 0.028 : 0;
  }
  function samplesTube(a0, a1) {
    const out = [], k0 = floor(a0 / TP), k1 = Math.ceil(a1 / TP);
    for (let k = k0; k < k1; k++) for (const f of CAP_F) { const a = (k + f) * TP; if (a > a0 && a < a1) out.push(a); }
    return [a0, ...out, a1];
  }
  function samplesBatten(a0, a1) {
    const out = [];
    for (let k = floor((a0 - 0.25) / 0.5) - 1; k <= Math.ceil((a1 - 0.25) / 0.5) + 1; k++) for (const d of [-0.04, -0.023, 0.023, 0.04]) { const a = 0.25 + k * 0.5 + d; if (a > a0 && a < a1) out.push(a); }
    for (let a = Math.ceil(a0 / 0.5) * 0.5; a < a1; a += 0.5) if (a > a0) out.push(a);
    out.sort((x, y) => x - y);
    return [a0, ...out, a1];
  }
  function samplesFlat(a0, a1, step = 0.5) { const n = max(2, Math.ceil((a1 - a0) / step)); return Array.from({ length: n + 1 }, (_, i) => lerp(a0, a1, i / n)); }
  const lin01 = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);

  // Curved roof (硬山/懸山 gable, 廡殿 hip, 歇山 hip-and-gable, 攢尖 pyramid when xr = 0).
  // R: { type:'gable'|'hip'|'xieshan', hx, hz (eave half extents), xr (ridge half length / gable plane), v0 (歇山 gable base),
  //      yr, ye, curve (0..1 concavity), lift (corner/end rise), kick (corner flare), ridgeLift (gable ridge end rise),
  //      tile (atlas region), mat, corr:'tube'|'batten'|'flat'|'slate', thick, tint, soffitTint, cx, cz (centre offset), caps }
  // returns helpers: { P(side, a, v) → point, ridgeY(x), hipLine(sx, sz, n) → points, eaveY }
  function roof(B, R) {
    const { hx, hz } = R, xr = R.xr != null ? R.xr : hx, v0 = R.type === 'xieshan' ? (R.v0 != null ? R.v0 : 0.45) : 0;
    const cv = R.curve != null ? R.curve : 0.45, lift = R.lift || 0, kick = R.kick || 0, rl = R.ridgeLift || 0;
    const thick = R.thick || 0.14, cx = R.cx || 0, cz = R.cz || 0, yr = R.yr, ye = R.ye;
    const corr = R.corr || 'tube';
    const cf = corr === 'tube' ? corrTube : corr === 'batten' ? corrBatten : () => 0;
    const samp = corr === 'tube' ? samplesTube : corr === 'batten' ? samplesBatten : (a, b) => samplesFlat(a, b, 0.35);
    const Fv = (v) => lerp(v, 1 - (1 - v) * (1 - v), cv);
    const hip = R.type !== 'gable';
    const xEnd = (v) => (R.type === 'gable' ? hx : R.type === 'hip' ? lerp(xr, hx, v) : (v < v0 ? xr : lerp(xr, hx, (v - v0) / (1 - v0))));
    // base surface point for parameter position (x,z on the plan) at slope fraction v
    function surf(x, z, v, under) {
      let y = lerp(yr, ye, Fv(v));
      if (hip) {
        const c = clamp(abs(x) / hx, 0, 1) * clamp(abs(z) / hz, 0, 1), c2 = c * c;
        y += lift * c2 * (0.4 + 0.6 * c);
        x += Math.sign(x) * kick * c2 * c; z += Math.sign(z) * kick * c2 * c;
      } else {
        const e = pow(clamp(abs(x) / hx, 0, 1), 2.4);
        y += lerp(rl, lift, v) * e;
      }
      if (under) y -= thick;
      return [x + cx, y, z + cz];
    }
    const vs = (from) => { const n = R.rows || 9; return Array.from({ length: n + 1 }, (_, i) => lerp(from, 1, i / n)); };
    const tile = R.tile || 'tileRed', m = R.mat || 'matte', tint = R.tint || '#ffffff', so = R.soffitTint || '#9a8a7a';
    const vTop = (v, s) => v * hz * s; // distance along the plan for UVs
    // --- front / back panels (tiles run in x)
    for (const sg of R.sides || [1, -1]) {
      const us = samp(-hx, hx);
      const Pt = (a, v, under) => { const xe = xEnd(v), x = clamp(a, -xe, xe); const p = surf(x, sg * v * hz, v, under); if (!under) p[1] += cf(x) * (corr === 'tube' ? sstep(0, 0.06, v) : 1); return p; };
      const slopeLen = (v) => v * hypot(hz, yr - ye);
      B.grid(us, vs(0), (a, v) => Pt(a, v), (a, v) => [a, -slopeLen(v)], { mat: m, reg: tile, tint, ao: false, face: [0, 1, 0] });
      if (R.soffit !== false) B.grid(samplesFlat(-hx, hx, 0.6), vs(0), (a, v) => Pt(a, v, true), (a, v) => [a, vTop(v, 1)], { mat: 'matte', reg: 'soffit', tint: so, ao: false, face: [0, -1, 0] });
      // fascia along the eave
      B.grid(us, [0, 1], (a, t) => { const p = Pt(a, 1, t > 0.5); if (t < 0.5) p[1] += 0.01; return p; }, (a, t) => [a, t * thick], { mat: 'matte', reg: 'grain', tint: '#3a2a20', ao: false, face: [0, 0, sg] });
      if (R.caps !== false && corr === 'tube') { // 瓦當 round tile ends along the eave
        const xe = xEnd(1);
        for (let k = Math.ceil(-xe / TP - 0.5); (k + 0.5) * TP < xe; k++) {
          const a = (k + 0.5) * TP; if (abs(a) > xe - TP * 0.4) continue;
          const p = Pt(a, 1), q = Pt(a, 0.93), d = norm(sub(p, q));
          const c = add(p, [0, -0.02, 0]);
          B.sweep([sub(c, mul(d, 0.08)), add(c, mul(d, 0.012))], circle(0.05, 7), { mat: m, reg: tile, tint: shade(tint, -0.05), ao: false, caps: true, up: [0, 1, 0] });
        }
      }
    }
    // --- side panels: gable ends get barge boards; hip / 歇山 get sloping panels
    if (hip) {
      for (const sg of [1, -1]) {
        const us = samp(-hz - 0.001, hz + 0.001);
        const xs = (v) => (R.type === 'hip' ? lerp(xr, hx, v) : lerp(xr, hx, (v - v0) / (1 - v0)));
        const Pt = (a, v, under) => { const ze = v * hz, z = clamp(a, -ze, ze); const p = surf(sg * xs(v), z, v, under); if (!under) p[1] += cf(z) * (corr === 'tube' ? sstep(0, 0.06, v - v0) : 1); return p; };
        const sl = (v) => (v - v0) * hypot(hx - xr, yr - ye);
        B.grid(us, vs(v0), (a, v) => Pt(a, v), (a, v) => [a, -sl(v)], { mat: m, reg: tile, tint, ao: false, face: [0, 1, 0] });
        if (R.soffit !== false) B.grid(samplesFlat(-hz, hz, 0.6), vs(v0), (a, v) => Pt(a, v, true), (a, v) => [a, v], { mat: 'matte', reg: 'soffit', tint: so, ao: false, face: [0, -1, 0] });
        B.grid(us, [0, 1], (a, t) => { const p = Pt(a, 1, t > 0.5); if (t < 0.5) p[1] += 0.01; return p; }, (a, t) => [a, t * thick], { mat: 'matte', reg: 'grain', tint: '#3a2a20', ao: false, face: [sg, 0, 0] });
        if (R.caps !== false && corr === 'tube') for (let k = Math.ceil(-hz / TP - 0.5); (k + 0.5) * TP < hz; k++) {
          const a = (k + 0.5) * TP; if (abs(a) > hz - TP * 0.4) continue;
          const p = Pt(a, 1), q = Pt(a, 0.93), d = norm(sub(p, q)), c = add(p, [0, -0.02, 0]);
          B.sweep([sub(c, mul(d, 0.08)), add(c, mul(d, 0.012))], circle(0.05, 7), { mat: m, reg: tile, tint: shade(tint, -0.05), ao: false, caps: true });
        }
        if (R.type === 'xieshan') { // 山花 gable triangle (recessed slightly) above the side panel
          const xg = sg * (xr - 0.12), pts = [];
          const n = 10;
          for (let i = 0; i <= n; i++) { const v = v0 * (1 - i / n); const p = surf(xr, v * hz, v, true); pts.push([xg + cx, p[1] - 0.02, p[2]]); }
          for (let i = 1; i <= n; i++) { const v = v0 * (i / n); const p = surf(xr, -v * hz, v, true); pts.push([xg + cx, p[1] - 0.02, p[2]]); }
          const base = surf(xr, 0, v0, true);
          const ctr = [xg + cx, base[1], cz];
          if (sg < 0) pts.reverse();
          B.fan(ctr, pts, { mat: R.gableMat || 'matte', reg: R.gableReg || 'woodV', tint: R.gableTint || '#ffffff', ao: false });
          // barge boards 博風 along the gable edges
          for (const s2 of [1, -1]) {
            const path = []; for (let i = 0; i <= 8; i++) { const v = v0 * i / 8; const p = surf(xr, s2 * v * hz, v); path.push([sg * (xr + 0.02) + cx, p[1] + 0.02, p[2]]); }
            B.sweep(path, [[-0.04, -0.2], [0.04, -0.2], [0.04, 0.04], [-0.04, 0.04]], { hard: true, mat: 'matte', reg: 'grain', tint: R.bargeTint || '#3a2a22', ao: false, caps: true });
          }
        }
      }
    } else if (R.verge !== false) {
      // verge / barge boards on the gable ends (懸山) — the house code adds gable walls (硬山) as needed
      for (const sx of [1, -1]) for (const sg of R.sides || [1, -1]) {
        const path = []; for (let i = 0; i <= 10; i++) { const v = i / 10; const p = surf(sx * hx, sg * v * hz, v); path.push([p[0] + sx * 0.03, p[1] + 0.03, p[2]]); }
        B.sweep(path, [[-0.04, -thick - 0.06], [0.04, -thick - 0.06], [0.04, 0.05], [-0.04, 0.05]], { hard: true, mat: 'matte', reg: R.vergeReg || 'grain', tint: R.vergeTint || '#3a2a22', ao: false, caps: true });
      }
    }
    // helpers for ridges & gable walls
    const api = {
      surf, Fv, xEnd, hx, hz, yr, ye, thick, v0,
      ridgeY: (x) => surf(x, 0, 0)[1],
      // underside profile across the depth at plan x (for gable walls): points from back eave to front eave
      profile(x, n = 12, under = true) { const out = []; for (let i = 0; i <= n; i++) { const v = 1 - (2 * i) / n; const sv = Math.sign(v) || 1, av = abs(v); out.push(surf(x, sv * av * hz, av, under)); } return out; },
      // hip line from the ridge end (or 歇山 gable base) to the corner (sx, sz = ±1)
      hipLine(sx, sz, n = 8) {
        const out = [];
        const va = R.type === 'xieshan' ? v0 : 0;
        for (let i = 0; i <= n; i++) {
          const v = lerp(va, 1, i / n), x = R.type === 'hip' ? lerp(xr, hx, v) : R.type === 'xieshan' ? lerp(xr, hx, (v - v0) / (1 - v0)) : hx;
          out.push(surf(sx * x, sz * v * hz, v));
        }
        return out;
      },
      gableEdge(sx, sz, n = 8) { const out = []; for (let i = 0; i <= n; i++) { const v = v0 * i / n; out.push(surf(sx * xr, sz * v * hz, v)); } return out; },
    };
    return api;
  }
  function circle(r, n = 8, ry = r) { return Array.from({ length: n }, (_, i) => [cos((i / n) * TAU) * r, sin((i / n) * TAU) * ry]); }

  // Ridge (正脊/垂脊): box section swept along `path`; ends: 'swallow' (燕尾), 'curl' (翹), 'plain'
  // o: { w, h, reg, mat, tint, band (side-panel region), bandTint, startEnd, endEnd, len, rise }
  function ridge(B, path, o = {}) {
    const w = o.w || 0.22, h = o.h || 0.28, mt = o.mat || 'matte';
    const sec = [[-w / 2, -0.06], [w / 2, -0.06], [w / 2, h * 0.82], [w * 0.36, h], [-w * 0.36, h], [-w / 2, h * 0.82]];
    B.sweep(path, sec, { hard: true, mat: mt, reg: o.reg || 'ridgeBand', tint: o.tint || '#ffffff', ao: false, caps: !o.ends, size: o.size || 1 });
    if (o.band) { // inset decorative band on both faces (剪黏 panel)
      const bp = path.slice(o.bandFrom || 0, path.length - (o.bandTo || 0));
      if (bp.length > 1) for (const s of [1, -1]) B.sweep(bp, s > 0 ? [[w / 2 + 0.006, h * 0.18], [w / 2 + 0.006, h * 0.7]] : [[-w / 2 - 0.006, h * 0.7], [-w / 2 - 0.006, h * 0.18]], { closed: false, mat: o.bandMat || 'gloss', reg: o.band, tint: o.bandTint || '#ffffff', ao: false, size: 0.5 });
    }
    if (o.ends) for (const end of [0, 1]) {
      const style = Array.isArray(o.ends) ? o.ends[end] : o.ends;
      if (!style || style === 'plain') continue;
      const a = end ? path[path.length - 1] : path[0], b = end ? path[path.length - 2] : path[1];
      const dir = norm(sub(a, b)); dir[1] = 0; const dn = norm(dir);
      const L = o.len || 0.9, H = o.rise || 0.55;
      const pt = (t, side = 0) => { const sd = norm(cross([0, 1, 0], dn)); return add(add(a, mul(dn, L * t)), add([0, H * pow(t, 2.2), 0], mul(sd, side))); };
      if (style === 'swallow') { // 燕尾: sweeps up, then forks into two tails
        const p1 = []; for (let i = 0; i <= 6; i++) p1.push(pt(0.55 * i / 6));
        B.sweep(p1, sec, { hard: true, mat: mt, reg: o.reg || 'ridgeBand', tint: o.tint || '#ffffff', ao: false, caps: false, scale: (t) => [1, lerp(1, 0.8, t)] });
        for (const s of [1, -1]) {
          const p2 = []; for (let i = 0; i <= 7; i++) { const t = lerp(0.5, 1, i / 7); p2.push(pt(t, s * w * (0.22 + 0.9 * pow((t - 0.5) / 0.5, 1.6)))); }
          B.sweep(p2, sec, { hard: true, mat: mt, reg: o.reg || 'ridgeBand', tint: o.tint || '#ffffff', ao: false, caps: true, scale: (t) => [lerp(0.55, 0.22, t), lerp(0.8, 0.35, t)] });
        }
      } else if (style === 'curl') { // 翼角 hip-end upturn
        const p1 = []; for (let i = 0; i <= 8; i++) p1.push(pt(i / 8));
        B.sweep(p1, sec, { hard: true, mat: mt, reg: o.reg || 'ridgeBand', tint: o.tint || '#ffffff', ao: false, caps: true, scale: (t) => [lerp(1, 0.4, t), lerp(1, 0.5, t)] });
      }
    }
  }
  // ridge path along x at the roof's ridge, from -x0 to +x0 (follows ridge lift)
  function ridgePath(rf, x0, n = 16, dy = 0) { const out = []; for (let i = 0; i <= n; i++) { const x = lerp(-x0, x0, i / n); out.push([x + (rf.cx || 0), rf.ridgeY(x) + dy, 0]); } return out; }

  // ---------------------------------------------------------------- walls
  // Wall in a local frame: runs along x from -len/2 (left, seen from outside) to len/2, outer face at z = 0,
  // thickness toward -z, from y0 to y1. holes: [{x0,x1,y0,y1}] (local). o: region / tint / eave …
  function wall(B, len, y0, y1, t, holes = [], o = {}) {
    const hs = holes.filter(Boolean).slice().sort((a, b) => a.x0 - b.x0);
    let x = -len / 2;
    const bo = Object.assign({ reg: 'plaster' }, o);
    const seg = (a, b, ya, yb, skip) => { if (b - a > 0.004 && yb - ya > 0.004) B.box((a + b) / 2, ya, -t / 2, b - a, yb - ya, t, Object.assign({}, bo, { skip })); };
    for (const h of hs) {
      seg(x, h.x0, y0, y1, 'b' + (x <= -len / 2 + 1e-3 ? (o.endL ? '' : 'w') : 'w'));
      seg(h.x0, h.x1, y0, h.y0, 'bwe');
      seg(h.x0, h.x1, h.y1, y1, 'we');
      x = h.x1;
    }
    seg(x, len / 2, y0, y1, 'b' + (o.endR ? '' : 'e') + (hs.length ? '' : (o.endL ? '' : 'w')));
  }
  // frame helper: run fn in the wall frame of a rectangular building side.
  // side: 's' (front, +z), 'n', 'e', 'w'; hw/hd: half width/depth of the wall line
  function side(B, s, hw, hd, fn) {
    B.push();
    if (s === 's') B.tr(0, 0, hd);
    else if (s === 'n') B.tr(0, 0, -hd).ry(PI);
    else if (s === 'e') B.tr(hw, 0, 0).ry(PI / 2);
    else B.tr(-hw, 0, 0).ry(-PI / 2);
    fn(s === 's' || s === 'n' ? hw * 2 : hd * 2);
    B.pop();
  }

  // interior void behind an opening (local wall frame): dark box faces seen through doors / windows
  function voidBox(B, x0, x1, y0, y1, zf, depth, lit, warm = [0.34, 0.2, 0.09]) {
    const zb = zf - depth;
    const dark = [0.035, 0.028, 0.024];
    const col = (x, y, z) => { const k = lit ? sstep(y1, y0 - 0.2, y) * 0.8 + 0.25 : 0.4; return lit ? [lerp(dark[0], warm[0], k), lerp(dark[1], warm[1], k), lerp(dark[2], warm[2], k)] : dark; };
    const o = { mat: 'glow', reg: 'white', tint: col };
    B.quad([x0, y0, zb], [x1, y0, zb], [x1, y1, zb], [x0, y1, zb], o);
    B.quad([x0, y0, zf], [x0, y0, zb], [x0, y1, zb], [x0, y1, zf], o);
    B.quad([x1, y0, zb], [x1, y0, zf], [x1, y1, zf], [x1, y1, zb], o);
    B.quad([x0, y1, zb], [x1, y1, zb], [x1, y1, zf], [x0, y1, zf], o);
    B.quad([x0, y0, zf], [x1, y0, zf], [x1, y0, zb], [x0, y0, zb], o);
  }

  // window in an opening of a wall (local wall frame, outer face z=0, wall thickness t)
  // o: { style: 'grid'|'shoji'|'diamond'|'turtle'|'bars', lit, frameTint, sill, recess, shutters, barReg }
  function windowAt(B, cx, y0, w, h, t, o = {}) {
    const rec = o.recess != null ? o.recess : t * 0.45, fr = o.frame || 0.06, ft = o.frameTint || '#2a1a10';
    const style = o.style || 'grid';
    // frame (in the reveal)
    B.box(cx, y0, -rec, w, fr, 0.08, { reg: 'grain', tint: ft });
    B.box(cx, y0 + h - fr, -rec, w, fr, 0.08, { reg: 'grain', tint: ft });
    B.box(cx - w / 2 + fr / 2, y0, -rec, fr, h, 0.08, { reg: 'grain', tint: ft });
    B.box(cx + w / 2 - fr / 2, y0, -rec, fr, h, 0.08, { reg: 'grain', tint: ft });
    const x0 = cx - w / 2 + fr, x1 = cx + w / 2 - fr, ya = y0 + fr, yb = y0 + h - fr;
    if (style === 'bars') { // 石條窗 granite bars with dark (or lit) interior behind
      const n = max(3, round(w / 0.13));
      for (let i = 0; i < n; i++) { const x = lerp(x0, x1, (i + 0.5) / n); B.push().tr(x, 0, -rec * 0.6).ry(PI / 4); B.box(0, ya, 0, 0.055, yb - ya, 0.055, { reg: o.barReg || 'granite', tint: o.barTint || '#ffffff' }); B.pop(); }
      voidBox(B, x0, x1, ya, yb, -rec - 0.03, 0.5, o.lit);
    } else {
      const reg = { grid: 'latGrid', shoji: 'latShoji', diamond: 'latDiamond', turtle: 'latTurtle' }[style] || 'latGrid';
      const lu = (x, y) => [x / region(reg).size, y / region(reg).size];
      const q = [[x0, ya, -rec - 0.02], [x1, ya, -rec - 0.02], [x1, yb, -rec - 0.02], [x0, yb, -rec - 0.02]];
      if (o.lit) B.quad(...q, { mat: 'glow', reg, tint: (x, y) => [1.25, 0.82, 0.45].map((c) => c * lerp(1.15, 0.8, (y - ya) / (yb - ya || 1))) }, q.map((p) => lu(p[0], p[1])));
      else B.quad(...q, { reg, tint: '#8a7a68' }, q.map((p) => lu(p[0], p[1])));
    }
    if (o.sill !== false) B.box(cx, y0 - 0.06, 0.03, w + 0.16, 0.06, rec + 0.1 + (o.sillOut || 0.04), { reg: o.sillReg || 'granite', tint: o.sillTint || '#ffffff' });
    if (o.shutters) for (const s of [-1, 1]) { // louvred shutters folded open against the wall
      const sx = cx + s * (w / 2 + w * 0.25 + 0.02);
      B.box(sx, y0, 0.03, w * 0.5, h, 0.04, { reg: 'woodNeutral', tint: o.shutters });
      for (let k = 0; k < 8; k++) B.box(sx, y0 + 0.1 + k * (h - 0.2) / 8, 0.055, w * 0.42, 0.025, 0.02, { reg: 'woodNeutral', tint: shade(o.shutters, -0.25) });
    }
  }

  // rectangular surround (4 strips) around an opening, standing proud of the wall face by `out`
  function frameAt(B, cx, y0, w, h, b, out, o = {}) {
    B.box(cx, y0 - b, out / 2, w + 2 * b, b, out, o);
    B.box(cx, y0 + h, out / 2, w + 2 * b, b, out, o);
    B.box(cx - w / 2 - b / 2, y0, out / 2, b, h, out, Object.assign({ skip: 'tb' }, o));
    B.box(cx + w / 2 + b / 2, y0, out / 2, b, h, out, Object.assign({ skip: 'tb' }, o));
  }
  // doorway (local wall frame): reveal is part of the wall hole. o: { leaves:'open'|'closed'|null, reg, lit, curtain(region), frameTint,
  //   threshold, depth (interior), studs, couplet }
  function doorAt(B, cx, w, h, t, o = {}) {
    const ft = o.frameTint || '#3a1a12', d = o.depth || 1.4;
    B.box(cx - w / 2 - 0.05, 0, 0.0, 0.1, h + 0.1, 0.1, { reg: 'grain', tint: ft });
    B.box(cx + w / 2 + 0.05, 0, 0.0, 0.1, h + 0.1, 0.1, { reg: 'grain', tint: ft });
    B.box(cx, h, 0.0, w + 0.3, 0.12, 0.12, { reg: 'grain', tint: ft });
    if (o.pins) for (const s of [-1, 1]) B.cyl(cx + s * w * 0.25, h + 0.06, 0.06, 0.05, 0.05, 0.08, { reg: 'gold', mat: 'metal', seg: 8 }); // 門簪
    if (o.threshold !== false) B.box(cx, 0, -t / 2, w, 0.14, t * 0.9, { reg: 'granite', tint: '#d8d0c0' });
    voidBox(B, cx - w / 2, cx + w / 2, 0, h, -t, d, o.lit);
    if (o.leaves) {
      const lw = w / 2, reg = o.reg || 'doorRed';
      for (const s of [-1, 1]) {
        B.push().tr(cx + s * w / 2, 0, -t * 0.55);
        B.ry(o.leaves === 'open' ? s * 1.25 : 0);
        B.box(-s * lw / 2, 0.02, 0, lw, h - 0.04, 0.06, { reg: 'grain', tint: '#4a1810' });
        B.push().tr(-s * lw / 2, h / 2, 0.031);
        B.quad([-lw / 2, -h / 2 + 0.03, 0], [lw / 2, -h / 2 + 0.03, 0], [lw / 2, h / 2 - 0.03, 0], [-lw / 2, h / 2 - 0.03, 0], { reg: s < 0 && o.regL ? o.regL : reg }, s > 0 && o.mirror ? [[1, 0], [0, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]]);
        B.pop();
        B.pop();
      }
    }
    if (o.curtain) { // 暖簾 hanging noren — sways in the cloth bucket
      const cw = w * 0.96, ch = h * 0.42, ytop = h - 0.02;
      const n = 6, us = lin01(n), vs = lin01(4);
      B.grid(us, vs, (u, v) => [cx - cw / 2 + u * cw, ytop - v * ch, 0.02 + sin(u * PI * 6) * 0.015], (u, v) => [u, 1 - v], { mat: 'cloth', reg: o.curtain, pivot: [cx, ytop, 0.02], phase: cx * 3.1, face: [0, 0, 1], ao: false });
      B.box(cx, ytop, 0.03, cw + 0.1, 0.035, 0.035, { reg: 'bamboo', tint: '#c8b88a' });
    }
  }

  // ---------------------------------------------------------------- columns, lanterns, plaques, steps
  function columnAt(B, x, z, y0, h, r, o = {}) {
    const base = o.base || 'drum';
    let yb = y0;
    if (base === 'drum') { // 柱珠 granite drum base
      B.lathe(x, y0, z, [[r * 1.45, 0], [r * 1.6, 0.04], [r * 1.65, 0.12], [r * 1.5, 0.22], [r * 1.2, 0.26], [r * 1.05, 0.28]], { reg: 'granite', tint: o.baseTint || '#ffffff', seg: 12 });
      yb += 0.28;
    } else if (base === 'square') { B.box(x, y0, z, r * 3, 0.24, r * 3, { reg: 'granite', tint: o.baseTint || '#ffffff' }); yb += 0.24; }
    B.cyl(x, yb, z, r, r * 0.94, h - (yb - y0), { reg: o.reg || 'grain', mat: o.mat || 'gloss', tint: o.tint || '#a82a1f', seg: o.seg || 12, caps: false });
  }
  // stone column wrapped by a coiling dragon (龍柱)
  function dragonColumn(B, x, z, y0, h, r, o = {}) {
    B.box(x, y0, z, r * 3.2, 0.3, r * 3.2, { reg: 'granite', tint: '#d6d0c2' });
    B.cyl(x, y0 + 0.3, z, r, r, h - 0.3, { reg: 'granite', tint: o.stone || '#c4beb0', seg: 10, caps: false });
    const path = [], turns = 1.6, n = 40;
    for (let i = 0; i <= n; i++) { const t = i / n, a = t * turns * TAU + (o.a0 || 0); path.push([x + sin(a) * r * 1.08, y0 + 0.45 + t * (h - 0.9), z + cos(a) * r * 1.08]); }
    B.sweep(path, circle(r * 0.42, 8), { reg: 'scales', tint: o.tint || '#9ab8a8', mat: 'gloss', scale: (t) => (t < 0.08 ? lerp(0.3, 1, t / 0.08) : t > 0.9 ? lerp(1.15, 1.3, (t - 0.9) / 0.1) : 1), size: 0.3 });
    const hd = path[n], pv = path[n - 2], dir = norm(sub(hd, pv));
    B.sweep([hd, add(hd, mul(dir, r * 0.9)), add(add(hd, mul(dir, r * 1.4)), [0, -r * 0.2, 0])], circle(r * 0.5, 8), { reg: 'scales', tint: o.tint || '#9ab8a8', mat: 'gloss', caps: true, scale: (t) => lerp(1, 0.5, t) });
    for (const s of [1, -1]) B.sweep([add(hd, [0, r * 0.3, s * r * 0.2]), add(hd, [-dir[0] * r * 0.6, r * 1.1, s * r * 0.5])], circle(r * 0.08, 5), { reg: 'gold', mat: 'metal', caps: true, scale: (t) => lerp(1, 0.3, t) }); // horns
    B.box(x, y0 + h - 0.12, z, r * 2.6, 0.12, r * 2.6, { reg: 'granite', tint: '#d6d0c2' });
  }
  const LANTERN = { red: 'lanternRed', fu: 'lanternFu', ping: 'lanternPing', an: 'lanternAn', white: 'lanternWhite', blue: 'lanternBlue' };
  // hanging paper lantern (sways about the cord top). o: { r, h, kind, lit, cord (length above the body), glow }
  function lanternAt(B, x, y, z, o = {}) {
    const r = o.r || 0.17, h = o.h || r * 2.4, reg = LANTERN[o.kind || 'red'], lit = o.lit !== false, cord = o.cord != null ? o.cord : 0.2;
    const top = y + h / 2 + 0.05 + cord;
    const so = { mat: 'sway', pivot: [x, top, z], phase: (x * 2.3 + z * 1.7 + (o.ph || 0)) % TAU };
    const prof = []; for (let i = 0; i <= 8; i++) { const t = i / 8, a = (t - 0.5) * PI; prof.push([r * (0.18 + 0.82 * cos(a)), (t - 0.5) * h]); }
    const k = lit ? (o.glow || 1.6) * 0.75 : 0.55;
    B.lathe(x, y, z, prof, Object.assign({ reg, decalU: true, seg: 12, a0: PI, k, tint: (xx, yy) => { const t = clamp(1 - abs(yy - y) / (h * 0.55), 0, 1); return lit ? [0.85 + 0.5 * t, 0.62 + 0.45 * t * t, 0.5 + 0.35 * t * t] : [0.8, 0.8, 0.8]; } }, so));
    const dark = { reg: 'white', tint: [0.05, 0.03, 0.025] };
    B.cyl(x, y + h / 2 - 0.02, z, r * 0.4, r * 0.4, 0.07, Object.assign({}, so, dark, { seg: 8 }));
    B.cyl(x, y - h / 2 - 0.05, z, r * 0.4, r * 0.4, 0.07, Object.assign({}, so, dark, { seg: 8 }));
    B.cyl(x, y - h / 2 - 0.05 - r * 1.1, z, r * 0.1, r * 0.02, r * 1.1, Object.assign({}, so, { reg: 'white', tint: lit ? [0.55, 0.12, 0.06] : [0.3, 0.06, 0.04], seg: 6 })); // tassel
    if (cord > 0) B.box(x, y + h / 2 + 0.05, z, 0.012, cord, 0.012, Object.assign({}, so, dark));
    if (lit && o.light !== false) B.light(x, y, z + 0.1, o.lightColor || '#ff7a3c', o.intensity || 0.9, o.dist || 4, 0.3);
  }
  // board / plaque on a timber backing. o: { bg, fg, rim, dir, ry, depth, px (decal px per m) }
  function plaqueAt(B, x, y, z, w, h, text, o = {}) {
    const ppm = o.ppm || 220;
    const uv = B.decal(w * ppm, h * ppm, (g, W, H) => paintBoard(g, W, H, text, o));
    B.push().tr(x, y, z).ry(o.ry || 0);
    B.box(0, -h / 2 - 0.02, -0.03, w + 0.04, h + 0.04, 0.06, { reg: 'grain', tint: o.backTint || '#3a2418', ao: false });
    B.quad([-w / 2, -h / 2, 0.002], [w / 2, -h / 2, 0.002], [w / 2, h / 2, 0.002], [-w / 2, h / 2, 0.002], { mat: 'decal', ao: false, k: o.k || 1 }, uv);
    B.pop();
  }
  function paperAt(B, x, y, z, w, h, text, o = {}) { // red paper couplet / 橫批 pasted on a surface
    const uv = B.decal(w * 200, h * 200, (g, W, H) => paintPaper(g, W, H, text, o));
    B.push().tr(x, y, z).ry(o.ry || 0);
    B.quad([-w / 2, -h / 2, 0.004], [w / 2, -h / 2, 0.004], [w / 2, h / 2, 0.004], [-w / 2, h / 2, 0.004], { mat: 'decal', ao: false }, uv);
    B.pop();
  }
  // flight of steps rising toward -z from the front edge at z (local), centred on x
  function steps(B, x, z, w, n, rise, tread, o = {}) {
    const zb = z - tread * n; // stair occupies z ∈ [zb, z]; step i (0 = lowest) reaches out to z − tread·i
    for (let i = 0; i < n; i++) B.box(x, 0, (zb + z - tread * i) / 2, w + (o.flare || 0) * (n - i), rise * (i + 1), tread * (n - i), { reg: o.reg || 'granite', tint: o.tint || '#ffffff', skip: 'b' });
  }
  // platform / plinth box with paved top and ashlar sides
  function plinth(B, x, z, w, d, h, o = {}) {
    B.box(x, 0, z, w, h, d, { reg: o.side || 'ashlar', tint: o.tint || '#ffffff', skip: 't' + 'b' });
    B.box(x, h - 0.001, z, w, 0.001, d, { reg: o.top || 'pave', tint: o.topTint || '#ffffff', skip: 'nsewb', ao: false });
    if (o.curb !== false) for (const s of [1, -1]) B.box(x, h - 0.06, z + s * (d / 2 - 0.08), w + 0.04, 0.08, 0.18, { reg: 'granite', tint: '#e0dace', skip: 'b' });
  }

  // arched head of an opening (local wall frame, outer face z = 0, depth t toward −z): fills the region between
  // the arch curve and yTop. The jambs below ys come from the wall hole. o: { rise (default w/2 → semicircle),
  // reg, tint, voussoir (stone ring region), deep (render the intrados — vault — through the full depth) }
  function archAt(B, cx, w, ys, yt, t, o = {}) {
    const r = w / 2, rise = o.rise != null ? o.rise : r, n = o.seg || 12;
    const pts = []; for (let i = 0; i <= n; i++) { const a = PI - (i / n) * PI; pts.push([cx + cos(a) * r, ys + sin(a) * rise]); }
    const fo = Object.assign({ reg: 'plaster' }, o);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      B.quad([x0, y0, 0], [x1, y1, 0], [x1, yt, 0], [x0, yt, 0], fo);                 // front spandrel strip
      B.quad([x1, y1, -t], [x0, y0, -t], [x0, yt, -t], [x1, yt, -t], fo);             // back
      B.quad([x0, y0, -t], [x1, y1, -t], [x1, y1, 0], [x0, y0, 0], Object.assign({}, fo, { reg: o.vaultReg || fo.reg, tint: o.vaultTint || fo.tint })); // intrados
    }
    if (o.voussoir) { // stone ring proud of the face
      const ring = []; for (let i = 0; i <= n; i++) { const a = PI - (i / n) * PI; ring.push([cx + cos(a) * (r + 0.07), ys + sin(a) * (rise + 0.07), 0.025]); }
      B.sweep(ring, [[-0.08, -0.03], [0.08, -0.03], [0.08, 0.03], [-0.08, 0.03]], { hard: true, reg: o.voussoir, tint: o.voussoirTint || '#ffffff', up: [0, 0, 1], caps: true });
      if (o.key) B.box(cx, ys + rise - 0.02, 0.04, 0.18, 0.22, 0.08, { reg: o.voussoir, tint: o.voussoirTint || '#ffffff' });
    }
  }
  // ---------------------------------------------------------------- roof ornaments
  function gourdAt(B, x, y, z, s = 1, o = {}) { // 葫蘆 finial
    B.lathe(x, y, z, [[0.06 * s, 0], [0.16 * s, 0.08 * s], [0.2 * s, 0.2 * s], [0.15 * s, 0.32 * s], [0.07 * s, 0.38 * s], [0.12 * s, 0.46 * s], [0.13 * s, 0.53 * s], [0.08 * s, 0.62 * s], [0.02 * s, 0.7 * s], [0.0, 0.78 * s]], { reg: 'gold', mat: 'metal', seg: 10, tint: o.tint || '#ffffff', ao: false });
  }
  function pearlAt(B, x, y, z, s = 1) { // 火珠 flaming pearl between the twin dragons
    B.lathe(x, y + 0.02 * s, z, Array.from({ length: 7 }, (_, i) => { const a = -PI / 2 + (i / 6) * PI; return [cos(a) * 0.16 * s + 0.001, (sin(a) + 1) * 0.16 * s]; }), { reg: 'white', mat: 'gloss', tint: '#d8ecff', seg: 10, ao: false });
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; B.push().tr(x + cos(a) * 0.17 * s, y + 0.16 * s + sin(a) * 0.17 * s, z).rz(a - PI / 2); B.cyl(0, 0, 0, 0.06 * s, 0.0, 0.2 * s, { reg: 'porcelain', mat: 'gloss', tint: k % 2 ? '#ffb040' : '#ff6a3a', seg: 5, ao: false }); B.pop(); }
    B.box(x, y - 0.1 * s, z, 0.14 * s, 0.12 * s, 0.14 * s, { reg: 'porcelain', mat: 'gloss', ao: false });
  }
  // 剪黏 dragon lying along a ridge: head at (x,y,z), body trailing toward dir (±1 along x), length len, scale s
  function dragonAt(B, x, y, z, dir, len, s = 1, o = {}) {
    const n = 26, path = [];
    for (let i = 0; i <= n; i++) { const t = i / n; path.push([x + dir * t * len, y + 0.16 * s + sin(t * PI * 2.6 + 0.6) * 0.16 * s * (1 - t * 0.4) + t * 0.12 * s, z + sin(t * PI * 1.3) * 0.05 * s]); }
    const body = o.body || '#5ab890', mtl = 'gloss';
    B.sweep(path, circle(0.075 * s, 7), { reg: 'scales', mat: mtl, tint: body, ao: false, size: 0.3, caps: true, scale: (t) => (t < 0.12 ? lerp(1.35, 1, t / 0.12) : lerp(1, 0.25, (t - 0.12) / 0.88)) });
    // head: snout, jaw, horns, whiskers
    const hd = path[0], fw = [-dir, 0, 0];
    B.sweep([add(hd, mul(fw, -0.05 * s)), add(hd, mul(fw, 0.16 * s)), add(add(hd, mul(fw, 0.27 * s)), [0, -0.02 * s, 0])], circle(0.1 * s, 7), { reg: 'scales', mat: mtl, tint: body, ao: false, caps: true, scale: (t) => lerp(1, 0.45, t) });
    B.sweep([add(hd, [0, -0.07 * s, 0]), add(add(hd, mul(fw, 0.22 * s)), [0, -0.12 * s, 0])], circle(0.04 * s, 5), { reg: 'porcelain', mat: mtl, tint: '#f04a3a', ao: false, caps: true });
    for (const sz of [1, -1]) {
      B.sweep([add(hd, [0, 0.07 * s, sz * 0.04 * s]), add(add(hd, mul(fw, -0.15 * s)), [0, 0.24 * s, sz * 0.09 * s])], circle(0.022 * s, 5), { reg: 'gold', mat: 'metal', ao: false, caps: true, scale: (t) => lerp(1, 0.3, t) });
      B.sweep([add(add(hd, mul(fw, 0.2 * s)), [0, 0, sz * 0.05 * s]), add(add(hd, mul(fw, 0.42 * s)), [0, 0.1 * s, sz * 0.16 * s])], circle(0.01 * s, 4), { reg: 'gold', mat: 'metal', ao: false, caps: true });
      B.box(hd[0] + fw[0] * 0.08 * s, hd[1] + 0.05 * s, hd[2] + sz * 0.07 * s, 0.04 * s, 0.04 * s, 0.03 * s, { reg: 'white', tint: '#fff8e0', mat: 'gloss', ao: false });
    }
    // dorsal fins & legs
    for (let i = 3; i < n - 2; i += 3) { const p = path[i]; B.push().tr(p[0], p[1] + 0.06 * s, p[2]); B.cyl(0, 0, 0, 0.035 * s, 0, 0.11 * s, { reg: 'porcelain', mat: mtl, tint: o.fin || '#f06a3a', seg: 4, ao: false }); B.pop(); }
    for (const i of [6, 16]) { const p = path[i]; for (const sz of [1, -1]) B.sweep([p, add(p, [dir * 0.05 * s, -0.16 * s, sz * 0.1 * s])], circle(0.025 * s, 5), { reg: 'scales', mat: mtl, tint: body, ao: false, caps: true }); }
  }
  // the ridge crown of a temple: twin dragons chasing the pearl (or a gourd / pagoda in the middle)
  function ridgeCrown(B, x, y, z, half, s, o = {}) {
    if (o.center === 'gourd') gourdAt(B, x, y, z, s * 1.4);
    else if (o.center === 'pagoda') { for (let k = 0; k < 5; k++) { const ww = (0.34 - k * 0.05) * s; B.box(x, y + k * 0.16 * s, z, ww, 0.1 * s, ww, { reg: 'porcelain', mat: 'gloss', ao: false }); B.box(x, y + k * 0.16 * s + 0.1 * s, z, ww * 1.3, 0.04 * s, ww * 1.3, { reg: 'tileOrange', mat: 'gloss', ao: false }); } gourdAt(B, x, y + 0.8 * s, z, s * 0.6); }
    else pearlAt(B, x, y, z, s);
    if (o.dragons !== false) for (const d of [-1, 1]) dragonAt(B, x + d * 0.3 * s, y, z, d, half, s, o);
  }

  // =================================================================================================
  // MODEL REGISTRATION
  // =================================================================================================
  // Variants, door column, size, lit and text are resolved exactly like the 2D defs (js/gfx/objects*.js):
  // o.v or hash(x, y, salt); o.door default / false / -1; resizable w/h. They form the cache key, so each
  // distinct look is built once and cloned. (models.js overwrites o.v before build(), so key() hands the
  // resolved context to build() through CTX.)
  let CTX = null;
  const LIGHTS = new Map();
  function resolve(id, spec, o) {
    const d = G.Objects.get(id) || { w: spec.w || 1, h: spec.h || 1 };
    const rs = spec.resize != null ? spec.resize : '';
    const w = rs.includes('w') && o.w ? max(1, o.w | 0) : (spec.w || d.w), h = rs.includes('h') && o.h ? max(1, o.h | 0) : (spec.h || d.h);
    const nv = spec.nv || 0;
    const v = nv ? (o.v != null ? (((o.v | 0) % nv) + nv) % nv : floor(G.U.hash(o.x | 0, o.y | 0, spec.salt || 11) * nv) % nv) : 0;
    let door = -1;
    if (spec.door != null) {
      let c = o.door;
      const def = typeof spec.door === 'function' ? spec.door(w) : spec.door;
      if (c === undefined || c === null) c = def;
      const lo = spec.doorMin || 0;
      door = (c === false || c < 0) ? -1 : clamp(c | 0, lo, max(lo, w - 1 - lo));
    }
    const c = { id, w, h, v, door, lit: o.lit !== false, text: o.text != null ? String(o.text) : '', o };
    c.extra = spec.key ? String(spec.key(o)) : '';
    c.key = [w, h, v, door, c.lit ? 1 : 0, c.text, c.extra].join('|');
    return c;
  }
  function han(id, spec) {
    G.Models.define(id, {
      key(o) { CTX = resolve(id, spec, o); return CTX.key; },
      build(o) {
        const c = CTX && CTX.id === id ? CTX : resolve(id, spec, o);
        CTX = null;
        const B = new Bld(hashStr(id + c.key));
        spec.build(B, c);
        const g = B.finish();
        LIGHTS.set(id + '#' + c.key, pickLights(B.lights, spec.maxLights || 4));
        if (spec.post) spec.post(g, c);
        return g;
      },
      update: spec.update,
      lights(o) {
        const c = resolve(id, spec, o), k = id + '#' + c.key;
        if (!LIGHTS.has(k)) G.Models.create(id, o);
        return LIGHTS.get(k) || [];
      },
    });
  }
  // merge nearby lights and keep the strongest few (the view pools only 12 point lights)
  function pickLights(ls, n) {
    const out = [];
    for (const l of ls) {
      const m = out.find((q) => hypot(q.x - l.x, q.y - l.y, q.z - l.z) < 1.3 && q.color === l.color);
      if (m) { const k = m.n / (m.n + 1); m.x = lerp(l.x, m.x, k); m.y = lerp(l.y, m.y, k); m.z = lerp(l.z, m.z, k); m.intensity = min(1.6, m.intensity + l.intensity * 0.4); m.n++; }
      else out.push(Object.assign({ n: 1 }, l));
    }
    out.sort((a, b) => b.intensity - a.intensity);
    return out.slice(0, n).map(({ n: _, ...l }) => l);
  }
  // lantern sway / palanquin etc. share the global time uniform; keep it advancing outside Map3D too (viewer)
  function tick(t) { const u = G.R3M.cutUniforms().uTime; if (!G.Map3D || !G.Map3D.active) u.value = t; }

  // =================================================================================================
  // 閩南 house_minnan — red-brick 三合院 wing: 凹壽 recessed entry, granite base & quoins, 水車堵 frieze,
  // 石條窗 stone-bar windows, curved red-tile roof with 燕尾 (v0) or 馬背 (v1) gables
  // =================================================================================================
  han('house_minnan', {
    nv: 2, salt: 23, resize: 'wh', door: (w) => floor(w / 2),
    build(B, c) {
      const { w, h, v, door, lit } = c;
      const hw = w / 2 - 0.06, hd = h / 2 - 0.12, eaveY = 2.95, T = 0.26;
      const brick = v ? '#f2c2b0' : '#ffffff';
      const hz = h / 2 + 0.42, hx = hw + 0.02, rise = min(1.3, hz * 0.5);
      const rf = roof(B, { type: 'gable', hx, hz, yr: eaveY + rise, ye: eaveY - 0.18, curve: 0.5, lift: 0.18, ridgeLift: 0.3, tile: 'tileRed', mat: 'matte', tint: v ? '#ffe2d6' : '#ffffff', verge: false, thick: 0.13 });
      const wallTop = (z) => rf.surf(0, z, abs(z) / hz, true)[1] + 0.02;
      const dc = door >= 0 ? -w / 2 + door + 0.5 : null, aw = 0.62, ad = 0.9;
      const bo = { reg: 'brickRed', tint: brick, eave: eaveY };
      // --- front (south) wall with the recessed entry
      side(B, 's', hw, hd, (L) => {
        const holes = [];
        for (let i = 0; i < w; i++) {
          if (i === door) { holes.push({ x0: dc - aw, x1: dc + aw, y0: 0, y1: wallTop(hd) + 0.2 }); continue; }
          let x = -w / 2 + i + 0.5; if (dc != null && abs(x - dc) < 1.1) x += Math.sign(x - dc) * 0.1;
          holes.push({ x0: x - 0.3, x1: x + 0.3, y0: 0.95, y1: 1.85, win: true, x });
        }
        wall(B, L, 0.45, wallTop(hd), T, holes.map((q) => (q.win ? q : Object.assign({}, q, { y0: 0.45 - 0.01 }))), bo);
        wall(B, L, 0, 0.45, T + 0.04, holes.filter((q) => !q.win).map((q) => Object.assign({}, q, { y0: -1 })), { reg: 'ashlar', tint: '#f4efe6', size: 1 }); // granite base 勒腳
        for (const q of holes) if (q.win) {
          frameAt(B, q.x, 0.95, 0.6, 0.9, 0.12, 0.05, { reg: 'granite', tint: '#e6e0d2' }); // granite surround
          windowAt(B, q.x, 0.95, 0.6, 0.9, T, { style: 'bars', lit, sill: false, recess: 0.08 });
        }
        // 水車堵 frieze and 鳥踏 ledge
        const fy = wallTop(hd) - 0.42;
        const fx = dc != null ? [[-L / 2, dc - aw], [dc + aw, L / 2]] : [[-L / 2, L / 2]];
        for (const [a, b] of fx) if (b - a > 0.05) {
          B.box((a + b) / 2, fy, 0.03, b - a, 0.36, 0.06, { reg: 'frieze', tint: '#ffffff', size: 1, ao: false });
          B.box((a + b) / 2, fy - 0.07, 0.05, b - a, 0.07, 0.12, { reg: 'granite', tint: '#d8d2c4' });
        }
        // corner quoins
        for (const s of [-1, 1]) for (let y = 0.45; y < wallTop(hd) - 0.5; y += 0.3) B.box(s * (L / 2 - 0.12), y, 0.012, 0.25 + ((y * 10) % 2 < 1 ? 0.08 : 0), 0.26, 0.04, { reg: 'granite', tint: '#e8e2d6' });
        if (dc != null) { // 凹壽 entry: side walls, back wall with door, couplets, lanterns
          const yt = wallTop(hd) - 0.02;
          for (const s of [-1, 1]) { B.push().tr(dc + s * aw, 0, -ad / 2).ry(-s * PI / 2); wall(B, ad, 0, yt, 0.12, [], bo); B.pop(); }
          B.push().tr(0, 0, -ad);
          wall(B, aw * 2, 0, yt, T, [{ x0: dc - 0.45, x1: dc + 0.45, y0: 0, y1: 2.15 }], Object.assign({}, bo, { endL: true, endR: true }));
          B.tr(-dc, 0, 0); B.tr(dc, 0, 0);
          doorAt(B, dc, 0.9, 2.15, T, { leaves: 'open', reg: 'doorRed', lit, pins: true, frameTint: '#3a1a12' });
          paperAt(B, dc - 0.56, 1.35, 0.01, 0.17, 1.0, '春滿門');
          paperAt(B, dc + 0.56, 1.35, 0.01, 0.17, 1.0, '福臨家');
          if (c.text) plaqueAt(B, dc, 2.42, 0.05, 0.9, 0.3, c.text, { bg: '#2a1a12', fg: '#f3d68a', rim: '#a87a3a' });
          else paperAt(B, dc, 2.32, 0.01, 0.62, 0.15, '吉祥如意', { dir: 'h' });
          B.box(dc, 0, 0.0, aw * 2, 0.06, 0.3, { reg: 'granite', tint: '#e0dace', skip: 'b' }); // threshold slab
          B.pop();
          B.box(dc, 0, -ad / 2, aw * 2, 0.04, ad, { reg: 'pave', skip: 'b', ao: false }); // paved floor of the recess
          // ceiling of the recess under the roof
          B.box(dc, wallTop(hd) + 0.05, -ad / 2, aw * 2, 0.06, ad, { reg: 'soffit', tint: '#8a7060', skip: 't', ao: false });
          for (const s of [-1, 1]) lanternAt(B, dc + s * 0.42, 2.18, 0.12, { kind: 'fu', lit, r: 0.16, cord: 0.32 });
          B.light(dc, 1.0, -ad + 0.3, '#ffb862', lit ? 0.6 : 0, 3, 0.1);
        }
      });
      // --- back and gable walls
      side(B, 'n', hw, hd, (L) => {
        const holes = []; for (let i = 1; i < w - 1; i += 2) holes.push({ x0: -L / 2 + i + 0.5 - 0.22, x1: -L / 2 + i + 0.5 + 0.22, y0: 1.2, y1: 1.75, x: -L / 2 + i + 0.5 });
        wall(B, L, 0.45, wallTop(hd), T, holes, bo);
        wall(B, L, 0, 0.45, T + 0.04, [], { reg: 'ashlar', tint: '#f4efe6' });
        for (const q of holes) windowAt(B, q.x, 1.2, 0.44, 0.55, T, { style: 'bars', lit: false, sill: false, recess: 0.08 });
      });
      for (const s of ['e', 'w']) side(B, s, hw, hd, (L) => {
        wall(B, L, 0.45, eaveY - 0.15, T, [], Object.assign({}, bo, { endL: true, endR: true }));
        wall(B, L, 0, 0.45, T + 0.04, [], { reg: 'ashlar', tint: '#f4efe6', endL: true, endR: true });
      });
      // gable triangles + coping (規帶) following the roof, ending in 燕尾 (v0) or rounded 馬背 (v1)
      for (const sx of [1, -1]) {
        const x = sx * (hw + 0.005);
        const top = rf.profile(sx * hx, 14, false).map((p) => [x, p[1] + 0.06, clamp(p[2], -hd - 0.02, hd + 0.02)]);
        const base = [x, eaveY - 0.15, 0];
        const pts = sx > 0 ? top.slice().reverse() : top;
        B.fan(base, [[x, eaveY - 0.15, sx > 0 ? -hd : hd], ...pts.filter((p) => p[1] > eaveY - 0.15), [x, eaveY - 0.15, sx > 0 ? hd : -hd]], { reg: 'brickRed', tint: brick, ao: false });
        B.fan([x - sx * T, eaveY - 0.15, 0], [[x - sx * T, eaveY - 0.15, sx > 0 ? hd : -hd], ...pts.slice().reverse().map((p) => [x - sx * T, p[1], p[2]]).filter((p) => p[1] > eaveY - 0.15), [x - sx * T, eaveY - 0.15, sx > 0 ? -hd : hd]], { reg: 'brickRed', tint: brick, ao: false });
        const cop = rf.profile(sx * hx, 16, false).map((p) => [sx * (hw - 0.08), p[1] + 0.04, p[2] * 0.985]);
        B.sweep(cop, [[-0.15, -0.06], [0.15, -0.06], [0.15, 0.05], [0.09, 0.09], [-0.09, 0.09], [-0.15, 0.05]], { hard: true, reg: 'ridgeBand', tint: '#b8523a', ao: false, caps: true, up: [0, 1, 0] });
        if (v === 1) { // 馬背 (水形): low rounded crown on the gable, brick body with a plaster rim
          const yr0 = rf.ridgeY(sx * hx), R0 = 0.42, H0 = 0.2;
          const arc = []; for (let i = 0; i <= 16; i++) { const a = PI * i / 16; arc.push([sx * (hw - 0.08), yr0 + 0.08 + sin(a) * H0, cos(a) * R0]); }
          B.sweep(arc, [[-0.17, -0.06], [0.17, -0.06], [0.17, 0.05], [0, 0.1], [-0.17, 0.05]], { hard: true, reg: 'plaster', tint: '#e8dcc8', ao: false, caps: true, up: [1, 0, 0] });
          const half = [[R0, -0.1], ...arc.map((p) => [p[2], p[1] - 0.03 - (yr0 + 0.08)]), [-R0, -0.1]].reverse();
          for (const fs of [false, true]) B.sweep([[x - sx * 0.3, yr0 + 0.08, 0], [x, yr0 + 0.08, 0]], half, { hard: true, reg: 'brickRed', tint: brick, ao: false, caps: true, flipSide: fs, flipCaps: fs });
        }
        // 鳥踏 ledge along the gable at eave height
        B.box(x + sx * 0.03, eaveY - 0.22, 0, 0.08, 0.07, h - 0.2, { reg: 'granite', tint: '#d8d2c4' });
      }
      // ridge (正脊): red plaster on tiles with a white line; ends 燕尾 for v0, plain into 馬背 for v1
      const rp = ridgePath(rf, hx - (v ? 0.1 : 0.05), 18, 0.02);
      ridge(B, rp, { w: 0.24, h: 0.3, tint: '#c25a42', reg: 'ridgeBand', ends: v ? null : 'swallow', len: 0.75, rise: 0.5, band: 'porcelain', bandTint: '#ffdcd0', bandFrom: 3, bandTo: 3 });
      // plinth strip around the house
      B.box(0, 0, 0, w - 0.02, 0.08, h - 0.12, { reg: 'pave', tint: '#d0c8b8', skip: 'b' });
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 九份 house_jiufen — hillside miner / shop house: black tar-paper (油毛氈) roof on battens, timber frame with
  // clapboard / planks / plaster infill, stone footing, lattice windows, noren doorway, red lanterns, chimney
  // =================================================================================================
  const JF = [
    { wall: 'clapNeutral', tint: '#8a6a52', trim: '#2a1a11', curtain: 'norenPlain', stone: false, win: 'grid' },
    { wall: 'woodV', tint: '#ffffff', trim: '#2f1e14', curtain: 'norenRed', stone: true, win: 'grid' },
    { wall: 'clapNeutral', tint: '#7a988a', trim: '#26302b', curtain: 'norenTang', stone: false, win: 'grid' },
    { wall: 'plaster', tint: '#d6c29c', trim: '#3a2618', curtain: 'norenPlain', stone: true, win: 'shoji' },
  ];
  han('house_jiufen', {
    nv: 4, salt: 21, resize: 'wh', door: 1,
    build(B, c) {
      const { w, h, v, door, lit } = c, P = JF[v];
      const hw = w / 2 - 0.08, hd = h / 2 - 0.1, eaveY = 2.62, T = 0.16;
      const hz = h / 2 + 0.5, hx = hw + 0.32;
      const rf = roof(B, { type: 'gable', hx, hz, yr: eaveY + min(1.05, hz * 0.45), ye: eaveY - 0.12, curve: 0.12, tile: 'tarPaper', corr: 'batten', thick: 0.1, rows: 4, vergeTint: '#1e1c1c', soffitTint: '#6a5848' });
      const top = (z) => rf.surf(0, z, abs(z) / hz, true)[1] + 0.03;
      const wo = { reg: P.wall, tint: P.tint, eave: eaveY };
      const sb = P.stone ? 0.5 : 0.12; // stone footing height
      const dc = door >= 0 ? -w / 2 + door + 0.5 : null, aw = 0.5, ad = 0.55;
      const post = (x, y0, y1, z) => B.box(x, y0, z, 0.14, y1 - y0, 0.14, { reg: 'grain', tint: P.trim });
      side(B, 's', hw, hd, (L) => {
        const holes = [], wins = [];
        for (let i = 0; i < w; i++) {
          const x = -w / 2 + i + 0.5;
          if (i === door) { holes.push({ x0: dc - aw, x1: dc + aw, y0: 0, y1: top(hd) + 0.1 }); continue; }
          wins.push(x); holes.push({ x0: x - 0.3, x1: x + 0.3, y0: 1.0, y1: 1.62 });
        }
        wall(B, L, sb, top(hd), T, holes.map((q) => (q.y0 === 0 ? Object.assign({}, q, { y0: sb - 0.01 }) : q)), wo);
        wall(B, L, 0, sb, T + 0.04, holes.filter((q) => q.y0 === 0).map((q) => Object.assign({}, q, { y0: -1 })), { reg: P.stone ? 'rubble' : 'ashlarDark', tint: '#ffffff' });
        for (const x of wins) {
          windowAt(B, x, 1.0, 0.6, 0.62, T, { style: P.win, lit, frameTint: P.trim, sillReg: 'grain', sillTint: P.trim, recess: 0.05 });
          if ((round(x * 2) + v) % 3 === 0) { // potted plant on the sill line
            B.cyl(x + 0.18, 0, 0.18, 0.11, 0.14, 0.24, { reg: 'brickRed', tint: '#c87050', seg: 8 });
            for (let k = 0; k < 5; k++) B.push().tr(x + 0.18 + sin(k * 2.4) * 0.08, 0.32 + (k % 2) * 0.06, 0.18 + cos(k * 2.4) * 0.08).rx(0.6).ry(k), B.box(0, -0.05, 0, 0.14, 0.12, 0.05, { reg: 'white', tint: k % 2 ? '#4f8a3e' : '#6aa04c' }), B.pop();
          }
        }
        // timber frame: corner & bay posts, wall plate, sill rail
        for (let i = 0; i <= w; i++) { const x = clamp(-w / 2 + i, -L / 2 + 0.07, L / 2 - 0.07); if (dc != null && abs(x - dc) < aw + 0.05) continue; post(x, sb, top(hd), 0.05); }
        B.box(0, top(hd) - 0.14, 0.06, L + 0.04, 0.12, 0.08, { reg: 'grain', tint: P.trim });
        B.box(0, sb, 0.06, L, 0.1, 0.08, { reg: 'grain', tint: P.trim });
        if (dc != null) { // shallow entry porch with noren
          const yt = top(hd) - 0.02;
          for (const s of [-1, 1]) { B.push().tr(dc + s * aw, 0, -ad / 2).ry(-s * PI / 2); wall(B, ad, 0, yt, 0.1, [], wo); B.pop(); post(dc + s * aw, 0, yt, 0.05); }
          B.push().tr(0, 0, -ad);
          wall(B, aw * 2, 0, yt, T, [{ x0: dc - 0.42, x1: dc + 0.42, y0: 0, y1: 2.0 }], Object.assign({}, wo, { endL: true, endR: true }));
          doorAt(B, dc, 0.84, 2.0, T, { lit, curtain: P.curtain, frameTint: P.trim, depth: 1.3 });
          if (c.text) plaqueAt(B, dc, 2.2, 0.04, 0.78, 0.24, c.text, { bg: '#3a2a1c', fg: '#f3e2bd', rim: '#1e140d' });
          B.pop();
          B.box(dc, 0, -ad / 2, aw * 2, 0.04, ad, { reg: 'pave', skip: 'b' });
          B.box(dc, top(hd) - 0.02, -ad / 2, aw * 2, 0.04, ad, { reg: 'soffit', tint: '#6a5848', skip: 't', ao: false });
          for (const s of [-1, 1]) lanternAt(B, dc + s * 0.5, 1.98, 0.2, { lit, r: 0.15, cord: 0.14 });
          B.light(dc, 0.9, -ad + 0.2, '#ffb862', lit ? 0.5 : 0, 2.6, 0.1);
        } else lanternAt(B, 0, 2.05, 0.25, { lit, r: 0.16, cord: 0.32 });
      });
      side(B, 'n', hw, hd, (L) => {
        const holes = [{ x0: -0.3, x1: 0.3, y0: 1.1, y1: 1.6 }];
        wall(B, L, sb, top(hd), T, holes, wo);
        wall(B, L, 0, sb, T + 0.04, [], { reg: P.stone ? 'rubble' : 'ashlarDark' });
        windowAt(B, 0, 1.1, 0.6, 0.5, T, { style: P.win, lit: false, frameTint: P.trim, sillReg: 'grain', sillTint: P.trim, recess: 0.05 });
        for (const x of [-L / 2 + 0.07, L / 2 - 0.07]) post(x, sb, top(hd), 0.05);
        B.box(0, top(hd) - 0.14, 0.06, L + 0.04, 0.12, 0.08, { reg: 'grain', tint: P.trim });
      });
      for (const s of ['e', 'w']) side(B, s, hw, hd, (L) => {
        const yb = eaveY - 0.12;
        wall(B, L, sb, yb, T, s === 'e' && w >= 3 ? [{ x0: -0.25, x1: 0.25, y0: 1.15, y1: 1.6 }] : [], Object.assign({}, wo, { endL: true, endR: true }));
        if (s === 'e' && w >= 3) windowAt(B, 0, 1.15, 0.5, 0.45, T, { style: P.win, lit, frameTint: P.trim, sillReg: 'grain', sillTint: P.trim, recess: 0.05 });
        wall(B, L, 0, sb, T + 0.04, [], { reg: P.stone ? 'rubble' : 'ashlarDark', endL: true, endR: true });
        // gable infill: vertical boards up to the roof
        const prof = rf.profile(0, 12, true).filter((p) => abs(p[2]) <= hd + 0.01 && p[1] > yb);
        B.fan([0, yb, 0], [[-L / 2, yb, 0], ...prof.map((p) => [(s === 'e' ? -p[2] : p[2]), p[1] - 0.02, 0]).sort((a, b) => a[0] - b[0]), [L / 2, yb, 0]], { reg: 'woodV', tint: '#8a7060', ao: false });
        B.box(0, yb - 0.1, 0.05, L + 0.1, 0.1, 0.08, { reg: 'grain', tint: P.trim });
      });
      // ridge cap (tar-wrapped board) and chimney
      ridge(B, ridgePath(rf, hx, 4, -0.02), { w: 0.2, h: 0.1, reg: 'tarPaper', tint: '#bbbbbb' });
      if (v % 2 === 0 && w >= 3) {
        const x = hw * 0.55, z = -hz * 0.35, y0 = rf.surf(x, z, 0.35)[1] - 0.3;
        B.box(x, y0, z, 0.42, 0.95, 0.42, { reg: 'brickOld', tint: '#c8b0a0', ao: false });
        B.box(x, y0 + 0.95, z, 0.52, 0.08, 0.52, { reg: 'granite', ao: false });
        B.box(x, y0 + 0.95, z, 0.3, 0.12, 0.3, { reg: 'iron', ao: false });
      }
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 街屋 shophouse — two-storey street house with a 亭仔腳 arcade: arched piers, shopfronts in the shade,
  // plastered upper façade with arched windows & louvred shutters, parapet with a crest and the shop's name
  // =================================================================================================
  const SHOP = ['#e6d6b4', '#b4cfbe', '#e6b49e', '#cdc6de'], SHOP_NAMES = ['金源號', '福春行', '永安堂', '和記'];
  han('shophouse', {
    nv: 4, salt: 27, resize: 'w', door: 1,
    build(B, c) {
      const { w, h, v, door, lit } = c, col = SHOP[v];
      const hw = w / 2 - 0.02, hd = h / 2 - 0.04, Ha = 3.1, Hu = 6.15, Hp = 6.95, T = 0.34, AD = 1.0;
      const po = { reg: 'plaster', tint: col, eave: Hu };
      const cellX = (i) => -w / 2 + i + 0.5;
      // --- arcade front: piers and arches
      side(B, 's', hw, hd, (L) => {
        const holes = [];
        for (let i = 0; i < w; i++) { const x = cellX(i), a = 0.33 - (i === 0 || i === w - 1 ? 0.03 : 0); holes.push({ x0: x - a, x1: x + a, y0: 0, y1: 2.2 + a, x, a }); }
        wall(B, L, 0, Ha, T, holes, Object.assign({}, po, { endL: true, endR: true }));
        for (const q of holes) archAt(B, q.x, q.a * 2, 2.2, 2.2 + q.a, T, { reg: 'plaster', tint: col, vaultTint: shade(col, -0.15), voussoir: 'plaster', voussoirTint: shade(col, 0.25), key: true });
        for (let i = 0; i <= w; i++) { const x = clamp(-w / 2 + i, -L / 2 + 0.1, L / 2 - 0.1); B.box(x, 0, 0.04, 0.3, 0.42, 0.08, { reg: 'granite', tint: '#d8d0c0' }); B.box(x, 1.9, 0.03, 0.26, 0.1, 0.06, { reg: 'plaster', tint: shade(col, 0.3) }); } // pier bases & imposts
        // floor-line cornice between storeys
        B.box(0, Ha - 0.16, 0.06, L + 0.08, 0.12, 0.12, { reg: 'plaster', tint: shade(col, 0.25) });
        B.box(0, Ha - 0.04, 0.09, L + 0.12, 0.08, 0.18, { reg: 'plaster', tint: shade(col, -0.25) });
        // arcade: floor, ceiling, shopfront wall at the back
        B.box(0, 0, -AD / 2, L, 0.1, AD, { reg: 'pave', tint: '#e8d8c8', skip: 'b' });
        B.box(0, Ha - 0.3, -AD / 2 - T / 2, L, 0.06, AD - T, { reg: 'soffit', tint: '#8a7464', skip: 't', ao: false });
        B.push().tr(0, 0, -AD);
        const sh = [];
        for (let i = 0; i < w; i++) sh.push(i === door ? { x0: cellX(i) - 0.4, x1: cellX(i) + 0.4, y0: 0.1, y1: 2.25 } : { x0: cellX(i) - 0.36, x1: cellX(i) + 0.36, y0: 0.85, y1: 1.85 });
        wall(B, L, 0, Ha - 0.28, 0.2, sh, { reg: 'woodV', tint: '#a08070', eave: Ha });
        for (let i = 0; i < w; i++) {
          const x = cellX(i);
          if (i === door) {
            doorAt(B, x, 0.8, 2.15, 0.2, { lit, curtain: 'norenDian', frameTint: '#1e140e', depth: 1.2 });
          } else {
            windowAt(B, x, 0.85, 0.72, 1.0, 0.2, { style: 'grid', lit, frameTint: '#22160f', sillReg: 'grain', sillTint: '#2a1a10' });
            for (let k = 0; k < 3; k++) { const jx = x - 0.28 + k * 0.28, rr0 = 0.13 + (k % 2) * 0.03; B.lathe(jx, 0.1, 0.25, [[0.07, 0], [rr0, 0.08], [rr0 + 0.02, 0.22], [rr0 * 0.8, 0.36], [0.07, 0.4], [0.075, 0.44]], { reg: 'white', mat: 'gloss', tint: ['#6a4a2a', '#4a5a6a', '#7a3a2a'][(k + i) % 3], seg: 10 }); }
          }
        }
        B.pop();
        for (let i = 0; i < w; i++) if (i !== door) lanternAt(B, cellX(i), 2.25, -0.55, { lit, r: 0.15, cord: 0.35, intensity: 0.7 });
        if (door >= 0) B.light(cellX(door), 1.0, -AD - 0.3, '#ffb862', lit ? 0.6 : 0, 3, 0.1);
        // --- upper façade
        const uh = [];
        for (let i = 0; i < w; i++) uh.push({ x0: cellX(i) - 0.26, x1: cellX(i) + 0.26, y0: 3.85, y1: 5.1 + 0.26, x: cellX(i) });
        wall(B, L, Ha, Hu, 0.24, uh, Object.assign({}, po, { endL: true, endR: true }));
        for (const q of uh) {
          archAt(B, q.x, 0.52, 5.1, 5.36, 0.24, { reg: 'plaster', tint: col, voussoir: 'plaster', voussoirTint: shade(col, 0.3), key: true });
          windowAt(B, q.x, 3.85, 0.52, 1.25, 0.24, { style: 'grid', lit, frameTint: '#3a2a1e', sillReg: 'plaster', sillTint: shade(col, -0.2), shutters: '#4f8a6e', recess: 0.1 });
          const fanPts = []; for (let k = 0; k <= 10; k++) { const a = PI - (k / 10) * PI; fanPts.push([q.x + cos(a) * 0.2, 5.1 + sin(a) * 0.2, -0.12]); }
          B.fan([q.x, 5.08, -0.12], fanPts, lit ? { mat: 'glow', reg: 'latGrid', tint: [1.2, 0.8, 0.45] } : { reg: 'latGrid', tint: '#8a7a68' });
        }
        for (let i = 0; i <= w; i++) { const x = clamp(-w / 2 + i, -L / 2 + 0.11, L / 2 - 0.11); B.box(x, Ha, 0.04, 0.22, Hu - Ha, 0.08, { reg: 'plaster', tint: shade(col, 0.18) }); B.box(x, Hu - 0.5, 0.06, 0.3, 0.14, 0.12, { reg: 'plaster', tint: shade(col, 0.3) }); }
        // main cornice + parapet with balustrade panels and the central crest (山頭)
        B.box(0, Hu - 0.05, 0.1, L + 0.2, 0.16, 0.2, { reg: 'plaster', tint: shade(col, 0.3) });
        B.box(0, Hu + 0.11, 0.05, L + 0.1, 0.06, 0.1, { reg: 'plaster', tint: shade(col, -0.3) });
        B.box(0, Hu, -0.12, L, Hp - Hu, 0.24, { reg: 'plaster', tint: shade(col, 0.08), skip: 'b' });
        const cw = min(1.7, L * 0.42);
        for (const [a, b] of [[-L / 2 + 0.15, -cw / 2 - 0.1], [cw / 2 + 0.1, L / 2 - 0.15]]) if (b - a > 0.3) {
          B.box((a + b) / 2, Hu + 0.25, 0.02, b - a, 0.42, 0.04, { reg: 'plaster', tint: shade(col, -0.45) });
          for (let x = a + 0.1; x < b - 0.05; x += 0.16) B.cyl(x, Hu + 0.25, 0.05, 0.035, 0.035, 0.42, { reg: 'plaster', tint: shade(col, 0.2), seg: 6, caps: false });
        }
        const crest = []; const ch = 0.75;
        for (let k = 0; k <= 16; k++) { const t = k / 16, x = lerp(-cw / 2, cw / 2, t); crest.push([-x, Hp + 0.05 + ch * pow(sin(t * PI), 0.7) - (abs(t - 0.5) > 0.42 ? 0.12 : 0)]); }
        crest.push([-cw / 2, Hp - 0.1], [cw / 2, Hp - 0.1]);
        B.sweep([[0, 0, -0.18], [0, 0, 0.06]], crest, { hard: true, reg: 'plaster', tint: shade(col, 0.15), caps: true, ao: false });
        plaqueAt(B, 0, Hp + 0.15, 0.08, min(1.25, cw * 0.78), 0.34, c.text || SHOP_NAMES[v], { bg: '#f1e6c9', fg: '#8a2418', rim: '#6c5434', backTint: shade(col, -0.2) });
        for (const sx of [-1, 1]) B.lathe(sx * (cw / 2 + 0.05), Hp, 0, [[0.06, 0], [0.09, 0.1], [0.06, 0.2], [0.0, 0.32]], { reg: 'plaster', tint: shade(col, 0.3), seg: 8 }); // finials
        B.lathe(0, Hp + 0.05 + ch, 0, [[0.07, 0], [0.11, 0.1], [0.0, 0.22]], { reg: 'porcelain', mat: 'gloss', seg: 8 });
      });
      // --- back & party walls
      side(B, 'n', hw, hd, (L) => {
        const holes = []; for (let i = 0; i < w; i++) if (i % 2 === 0) holes.push({ x0: cellX(i) - 0.25, x1: cellX(i) + 0.25, y0: 4.0, y1: 4.8, x: cellX(i) });
        wall(B, L, 0, Hu + 0.1, 0.24, holes, Object.assign({}, po, { tint: shade(col, -0.08) }));
        for (const q of holes) windowAt(B, q.x, 4.0, 0.5, 0.8, 0.24, { style: 'grid', lit: false, frameTint: '#3a2a1e', sillReg: 'plaster', sillTint: shade(col, -0.2) });
        B.box(0, 0, 0.0, L, 0.5, 0.06, { reg: 'ashlarDark' });
      });
      const rf = roof(B, { type: 'gable', hx: hw + 0.02, hz: hd - 0.12, yr: Hu + 1.15, ye: Hu + 0.05, curve: 0.35, tile: 'tileRed', verge: false, rows: 6, cz: -0.05 });
      for (const sname of ['e', 'w']) side(B, sname, hw, hd, (L) => {
        wall(B, L, 0, Hu + 0.1, 0.2, [], { reg: 'brickRed', tint: '#e8c8b8', eave: Hu, endL: true, endR: true });
        B.box(0, Hu + 0.1, -0.1, L, Hp - Hu - 0.1, 0.2, { reg: 'brickRed', tint: '#e8c8b8', skip: 'b' });
        const prof = rf.profile(0, 10, false).map((p) => [sname === 'e' ? -p[2] - 0.05 : p[2] + 0.05, p[1] + 0.08, 0]).filter((p) => p[1] > Hp);
        if (prof.length > 1) { prof.sort((a, b) => a[0] - b[0]); B.fan([prof[0][0], Hp, 0], [...prof, [prof[prof.length - 1][0], Hp, 0]], { reg: 'brickRed', tint: '#e8c8b8', ao: false }); B.fan([prof[prof.length - 1][0], Hp, -0.2], [...prof.map((p) => [p[0], p[1], -0.2]).reverse(), [prof[0][0], Hp, -0.2]], { reg: 'brickRed', tint: '#e8c8b8', ao: false }); }
      });
      ridge(B, ridgePath(rf, hw - 0.05, 8, 0), { w: 0.2, h: 0.2, tint: '#b8503a' });
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 九份 teahouse — multi-storey timber teahouse: plank ground floor with diamond lattice, pent roof (腰簷) hung with
  // a row of red lanterns, balcony with red railing and the name board, shoji upper floor, tar-paper roof with a
  // front cross-gable (破風) holding a round window and 懸魚, a vertical 茶館 sign
  // =================================================================================================
  han('teahouse', {
    door: 2,
    build(B, c) {
      const { w, h, door, lit } = c;
      const hw = w / 2 - 0.05, hd = h / 2 - 0.08, H1 = 3.3, H2 = 6.15, sb = 0.28, set = 0.75, T = 0.18;
      const trim = '#24160d', wo = { reg: 'woodV', tint: '#9a6a52', eave: H1 };
      const dc = -w / 2 + door + 0.5;
      const post = (x, y0, y1, z = 0.05) => B.box(x, y0, z, 0.16, y1 - y0, 0.16, { reg: 'grain', tint: trim });
      // ---------- ground floor
      side(B, 's', hw, hd, (L) => {
        const holes = [];
        for (let i = 0; i < w; i++) { const x = -w / 2 + i + 0.5; holes.push(i === door ? { x0: x - 0.52, x1: x + 0.52, y0: sb - 0.01, y1: 2.3, d: 1 } : { x0: x - 0.33, x1: x + 0.33, y0: 1.0, y1: 1.85, x }); }
        wall(B, L, sb, H1, T, holes, wo);
        wall(B, L, 0, sb, T + 0.05, holes.filter((q) => q.d).map((q) => Object.assign({}, q, { y0: -1 })), { reg: 'ashlarDark' });
        for (const q of holes) if (!q.d) windowAt(B, q.x, 1.0, 0.66, 0.85, T, { style: 'diamond', lit, frameTint: trim, sillReg: 'grain', sillTint: trim });
        doorAt(B, dc, 1.04, 2.3, T, { lit, curtain: 'norenCha', frameTint: trim, depth: 1.6 });
        B.box(dc, 0, 0.25, 1.4, sb, 0.5, { reg: 'granite', tint: '#d0c8b8', skip: 'b' }); // entry step
        for (let i = 0; i <= w; i++) { const x = clamp(-w / 2 + i, -L / 2 + 0.08, L / 2 - 0.08); if (abs(x - dc) < 0.6) continue; post(x, sb, H1); }
        post(dc - 0.62, sb, H1); post(dc + 0.62, sb, H1);
        B.box(0, 2.45, 0.07, L, 0.12, 0.1, { reg: 'grain', tint: trim });
        B.box(0, sb, 0.07, L, 0.1, 0.1, { reg: 'grain', tint: trim });
        B.light(dc, 1.0, -0.5, '#ffb862', lit ? 0.7 : 0, 3.2, 0.1);
      });
      for (const sname of ['e', 'w', 'n']) side(B, sname, hw, hd, (L) => {
        const holes = sname === 'n' ? [{ x0: -0.9, x1: -0.3, y0: 1.1, y1: 1.8, x: -0.6 }, { x0: 0.3, x1: 0.9, y0: 1.1, y1: 1.8, x: 0.6 }] : [{ x0: -0.3, x1: 0.3, y0: 1.1, y1: 1.8, x: 0 }];
        wall(B, L, sb, H1 + 0.12, T, holes, Object.assign({}, wo, { endL: sname !== 'n', endR: sname !== 'n' }));
        wall(B, L, 0, sb, T + 0.05, [], { reg: 'ashlarDark', endL: true, endR: true });
        for (const q of holes) windowAt(B, q.x, 1.1, 0.6, 0.7, T, { style: 'diamond', lit: lit && sname !== 'n', frameTint: trim, sillReg: 'grain', sillTint: trim });
        post(-L / 2 + 0.08, sb, H1); post(L / 2 - 0.08, sb, H1);
      });
      // ---------- balcony deck, railing, name board
      const zf = hd + 0.12, zb = hd - set;
      B.box(0, H1, (zf + zb) / 2, w + 0.1, 0.14, zf - zb, { reg: 'woodH', tint: '#6a4a3a' });
      const ry0 = H1 + 0.14, ry1 = H1 + 1.0;
      B.box(0, ry1 - 0.08, zf - 0.04, w + 0.06, 0.08, 0.1, { reg: 'grain', mat: 'gloss', tint: '#b8302a' });
      B.box(0, ry0, zf - 0.04, w + 0.06, 0.07, 0.08, { reg: 'grain', mat: 'gloss', tint: '#8a2018' });
      for (let x = -w / 2 + 0.06; x <= w / 2; x += 0.16) B.box(x, ry0 + 0.07, zf - 0.04, 0.045, ry1 - ry0 - 0.15, 0.045, { reg: 'grain', mat: 'gloss', tint: '#c03a2e' });
      for (const sx of [-1, 1]) for (let z = zb + 0.1; z < zf - 0.1; z += 0.16) B.box(sx * (w / 2 + 0.03), ry0 + 0.07, z, 0.045, ry1 - ry0 - 0.15, 0.045, { reg: 'grain', mat: 'gloss', tint: '#c03a2e' });
      for (const sx of [-1, 1]) B.box(sx * (w / 2 + 0.03), ry1 - 0.08, (zf + zb) / 2, 0.1, 0.08, zf - zb, { reg: 'grain', mat: 'gloss', tint: '#b8302a' });
      plaqueAt(B, 0, ry0 + 0.45, zf + 0.03, 1.7, 0.42, c.text || '燈火茶樓', { bg: '#1b1a22', fg: '#f2cb68', rim: '#8a6a2a' });
      // ---------- pent roof (腰簷) under the balcony with its lantern row
      roof(B, { type: 'gable', sides: [1], hx: hw + 0.3, hz: 0.82, cz: zf - 0.05, yr: H1 - 0.02, ye: H1 - 0.42, curve: 0.1, tile: 'tarPaper', corr: 'batten', thick: 0.08, rows: 3, vergeTint: '#1e1c1c', soffitTint: '#6a5848' });
      for (let i = 0; i < 8; i++) { const x = -w / 2 + 0.31 + i * (w - 0.62) / 7; if (abs(x - dc) < 0.45) continue; lanternAt(B, x, H1 - 0.82, zf + 0.5, { lit, r: 0.15, cord: 0.12, intensity: 0.6 }); }
      // ---------- upper floor
      side(B, 's', hw, -zb, () => {});
      B.push().tr(0, 0, zb);
      const ux = [-1.7, -0.57, 0.57, 1.7];
      wall(B, w - 0.12, H1 + 0.14, H2 + 0.1, T, ux.map((x) => ({ x0: x - 0.38, x1: x + 0.38, y0: 3.85, y1: 5.15, x })), Object.assign({}, wo, { reg: 'clapNeutral', tint: '#8a5a44', eave: H2 }));
      for (const x of ux) windowAt(B, x, 3.85, 0.76, 1.3, T, { style: 'shoji', lit, frameTint: trim, sill: false });
      for (const x of [-hw + 0.08, -1.13, 0, 1.13, hw - 0.08]) post(x, H1 + 0.14, H2 + 0.1);
      B.box(0, 5.45, 0.07, w - 0.1, 0.1, 0.1, { reg: 'grain', tint: trim });
      B.pop();
      for (const [sname, ctr] of [['e', 1], ['w', -1]]) {
        B.push().tr(ctr * hw, 0, (zb - hd) / 2).ry(ctr * PI / 2);
        const L = zb + hd;
        wall(B, L, H1 + 0.14, H2 + 0.1, T, [{ x0: -0.3, x1: 0.3, y0: 4.0, y1: 4.9 }], Object.assign({}, wo, { reg: 'clapNeutral', tint: '#8a5a44', endL: true, endR: true }));
        windowAt(B, 0, 4.0, 0.6, 0.9, T, { style: 'shoji', lit, frameTint: trim, sill: false });
        B.pop();
      }
      B.push().tr(0, 0, -hd).ry(PI); wall(B, w - 0.1, H1 + 0.14, H2 + 0.1, T, [], Object.assign({}, wo, { reg: 'clapNeutral', tint: '#8a5a44' })); B.pop();
      // ---------- main roof + front cross gable (破風)
      const czr = (zb - hd) / 2, hzr = (zb + hd) / 2 + 0.7;
      const rf = roof(B, { type: 'gable', hx: hw + 0.45, hz: hzr, cz: czr, yr: H2 + 1.25, ye: H2 - 0.15, curve: 0.15, tile: 'tarPaper', corr: 'batten', thick: 0.1, rows: 5, vergeTint: '#1e1c1c', soffitTint: '#6a5848' });
      ridge(B, ridgePath(rf, hw + 0.45, 4, -0.02), { w: 0.22, h: 0.12, reg: 'tarPaper', tint: '#bbbbbb' });
      const gl = 1.5, zfr = zb + 0.62;
      B.push().tr(0, 0, zfr - gl).ry(PI / 2);
      const cg = roof(B, { type: 'gable', hx: gl, hz: 1.15, yr: H2 + 1.05, ye: H2 - 0.05, curve: 0.1, tile: 'tarPaper', corr: 'batten', thick: 0.1, rows: 4, vergeTint: '#2e2f36' });
      B.pop();
      // gable face: planks, round lit window, white-trimmed barge boards, 懸魚
      const gz = zfr - 0.12, apex = H2 + 1.0, gb = H2 - 0.05;
      B.fan([0, gb, gz], [[1.05, gb, gz], [0, apex - 0.1, gz], [-1.05, gb, gz]], { reg: 'woodV', tint: '#7a5038', ao: false, flip: true });
      B.box(0, gb - 0.12, gz, 2.2, 0.14, 0.14, { reg: 'grain', tint: trim });
      const rw = []; for (let k = 0; k <= 16; k++) { const a = (k / 16) * TAU; rw.push([cos(a) * 0.22, H2 + 0.5 + sin(a) * 0.22, gz + 0.02]); }
      B.fan([0, H2 + 0.5, gz + 0.02], rw, lit ? { mat: 'glow', reg: 'latGrid', tint: [1.3, 0.85, 0.45], closeFan: false } : { reg: 'latGrid', tint: '#6a5a48' });
      B.sweep(rw.concat([rw[0]]), [[-0.035, -0.035], [0.035, -0.035], [0.035, 0.035], [-0.035, 0.035]], { hard: true, reg: 'grain', tint: trim, up: [0, 0, 1], closed: true });
      for (const sx of [-1, 1]) B.sweep([[0, apex - 0.08, gz + 0.1], [sx * 1.2, gb - 0.06, gz + 0.1]], [[-0.03, -0.05], [0.03, -0.05], [0.03, 0.0], [-0.03, 0.0]], { hard: true, reg: 'white', tint: '#e0d4b6', caps: true, up: [0, 0, 1] });
      B.sweep([[0, apex - 0.15, gz + 0.06], [0, apex - 0.35, gz + 0.06], [0, apex - 0.48, gz + 0.06]], [[-0.1, 0], [0.1, 0], [0.05, 0.03], [-0.05, 0.03]], { hard: true, reg: 'white', tint: '#e2d6b8', caps: true, up: [0, 0, 1], scale: (t) => [lerp(1, 0.4, t), 1] });
      // upper lantern row under the main eave
      for (let i = 0; i < 8; i++) { const x = -w / 2 + 0.31 + i * (w - 0.62) / 7; if (abs(x) < 1.2) continue; lanternAt(B, x, H2 - 0.55, zb + 0.42, { lit, r: 0.15, cord: 0.12, intensity: 0.6 }); }
      // vertical 茶館 sign hanging from a bracket off the west corner
      B.box(-hw - 0.2, 4.7, zf - 0.05, 0.5, 0.05, 0.05, { reg: 'iron' });
      B.push().tr(-hw - 0.35, 3.95, zf - 0.05);
      const uv = B.decal(70, 240, (g, W, H) => paintBoard(g, W, H, '茶館', { bg: '#a3241e', fg: '#ffe7b0', rim: '#1d120c', dir: 'v' }));
      B.box(0, -0.02, -0.03, 0.34, 0.76, 0.05, { reg: 'grain', tint: '#1d120c' });
      B.quad([-0.15, 0.0, 0.0], [0.15, 0.0, 0.0], [0.15, 0.72, 0.0], [-0.15, 0.72, 0.0], { mat: 'decal', ao: false }, uv);
      B.pop();
      void rf; void cg;
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 土地公廟 shrine_small — roadside 福德祠: stone platform, red-brick shrine with a veiled niche (the deity is never
  // shown: an embroidered curtain, candle glow and offerings), couplets, swallowtail roof with a pearl, incense burner
  // =================================================================================================
  han('shrine_small', {
    key: (o) => o.text || '',
    build(B, c) {
      const { lit } = c, text = c.text || '福德祠', hakka = /伯公/.test(text);
      plinth(B, 0, 0.05, 1.86, 1.7, 0.26, { side: 'ashlar', top: 'pave' });
      steps(B, 0, 0.92, 0.8, 1, 0.13, 0.2);
      const bw = 1.3, bd = 0.9, bz = -0.25, by = 0.26, bh = 1.25;
      B.push().tr(0, by, bz);
      const bo = { reg: 'brickRed', tint: hakka ? '#e0d8d0' : '#ffffff', eave: by + bh };
      side(B, 's', bw / 2, bd / 2, (L) => {
        wall(B, L, 0, bh, 0.16, [{ x0: -0.3, x1: 0.3, y0: 0.1, y1: 0.78 }], bo);
        archAt(B, 0, 0.6, 0.78, 1.08, 0.16, { reg: 'brickRed', tint: bo.tint, voussoir: 'granite', voussoirTint: '#d8d2c4' });
        B.box(0, 0.78 + 0.3, -0.08, 0.6, bh - 1.08, 0.16, { reg: 'brickRed', tint: bo.tint });
        // niche interior: altar, candles, curtain
        voidBox(B, -0.3, 0.3, 0.1, 1.08, -0.16, 0.5, lit, [0.5, 0.26, 0.1]);
        B.box(0, 0.1, -0.42, 0.52, 0.3, 0.16, { reg: 'grain', mat: 'gloss', tint: '#8a1c14' });
        for (const sx of [-0.18, 0.18]) { B.cyl(sx, 0.4, -0.42, 0.018, 0.018, 0.12, { reg: 'white', tint: '#c42a1f', seg: 6 }); B.cyl(sx, 0.52, -0.42, 0.012, 0.0, 0.05, { mat: 'glow', reg: 'white', tint: [2.4, 1.6, 0.6], seg: 5 }); }
        B.grid(lin01(6), lin01(3), (u, v) => [lerp(-0.29, 0.29, u), lerp(1.06, 0.62, v) - (u < 0.3 || u > 0.7 ? 0 : 0) , -0.2 + sin(u * PI * 5) * 0.015 - (abs(u - 0.5) < 0.2 ? 0.0 : 0.01)], (u, v) => [u * 1.2, v * 0.8], { mat: 'cloth', reg: 'embroid', pivot: [0, 1.06, -0.2], phase: 1.3, face: [0, 0, 1], ao: false });
        for (const sx of [-1, 1]) B.grid(lin01(2), lin01(4), (u, v) => [sx * lerp(0.3, 0.2, u) * (1 - v * 0.15), lerp(1.06, 0.15, v), -0.19], (u, v) => [u * 0.3, v], { mat: 'cloth', reg: 'embroid', pivot: [sx * 0.25, 1.06, -0.19], phase: 2 + sx, face: [0, 0, 1], ao: false });
        paperAt(B, -0.48, 0.55, 0.0, 0.13, 0.62, hakka ? '伯公' : '福德');
        paperAt(B, 0.48, 0.55, 0.0, 0.13, 0.62, hakka ? '保庇' : '正神');
        plaqueAt(B, 0, 1.18, 0.03, 0.5, 0.15, text, { bg: '#1c2f5a', fg: '#f6d06a', rim: '#d6a542', ppm: 400 });
      });
      for (const sname of ['n', 'e', 'w']) side(B, sname, bw / 2, bd / 2, (L) => wall(B, L, 0, bh, 0.16, [], Object.assign({}, bo, { endL: sname !== 'n', endR: sname !== 'n' })));
      B.pop();
      const rf = roof(B, { type: 'gable', hx: bw / 2 + 0.16, hz: bd / 2 + 0.32, cz: bz, yr: by + bh + 0.55, ye: by + bh - 0.08, curve: 0.5, lift: 0.1, ridgeLift: 0.14, tile: hakka ? 'tileGrey' : 'tileRed', rows: 5, thick: 0.08 });
      ridge(B, ridgePath(rf, bw / 2 + 0.06, 10, 0), { w: 0.14, h: 0.17, tint: '#3a6a82', ends: 'swallow', len: 0.38, rise: 0.3, band: 'porcelain', bandFrom: 2, bandTo: 2 });
      pearlAt(B, 0, rf.ridgeY(0) + 0.15, bz, 0.55);
      // incense burner (香爐) with smouldering sticks
      B.lathe(0, 0.26, 0.55, [[0.0, 0], [0.12, 0.02], [0.17, 0.08], [0.2, 0.18], [0.17, 0.24], [0.19, 0.26], [0.0, 0.26]], { reg: 'bronze', mat: 'metal', seg: 12 });
      for (const sx of [-1, 1]) B.cyl(sx * 0.09, 0.26, 0.55, 0.02, 0.02, 0.06, { reg: 'bronze', mat: 'metal', seg: 6 });
      for (let k = -2; k <= 2; k++) { B.push().tr(k * 0.035, 0.5, 0.55).rz(k * 0.08); B.cyl(0, 0, 0, 0.006, 0.006, 0.32, { reg: 'white', tint: '#a8442e', seg: 4, caps: false }); B.cyl(0, 0.32, 0, 0.008, 0.008, 0.02, { mat: 'glow', reg: 'white', tint: [3, 1.2, 0.4], seg: 4 }); B.pop(); }
      B.light(0, 0.7, 0.05, '#ff7a34', lit ? 0.9 : 0.3, 3.2, 0.4);
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // well — granite well ring, two posts carrying a little gabled roof, windlass with rope & bucket
  // =================================================================================================
  han('well', {
    build(B) {
      B.lathe(0, 0, 0, [[0.38, 0], [0.4, 0.05], [0.4, 0.52], [0.43, 0.56], [0.43, 0.64], [0.3, 0.64], [0.3, 0.4]], { reg: 'ashlar', seg: 16, size: 1 });
      B.disc(0, 0.38, 0, 0.3, 1, { reg: 'white', mat: 'gloss', tint: '#16242a', seg: 16, ao: false });
      for (const sx of [-1, 1]) {
        B.box(sx * 0.46, 0, 0, 0.12, 2.05, 0.12, { reg: 'grain', tint: '#5a3e28' });
        B.box(sx * 0.46, 0, 0, 0.22, 0.2, 0.22, { reg: 'granite' });
      }
      B.box(0, 1.98, 0, 1.06, 0.1, 0.1, { reg: 'grain', tint: '#4a3020' });
      roof(B, { type: 'gable', hx: 0.66, hz: 0.5, yr: 2.42, ye: 1.98, curve: 0.2, tile: 'tileDark', rows: 3, thick: 0.06, caps: false });
      // windlass drum with crank
      B.push().tr(0, 1.45, 0).rz(PI / 2); B.cyl(0, -0.4, 0, 0.07, 0.07, 0.8, { reg: 'grain', tint: '#6a4a2e', seg: 10 }); B.pop();
      for (let k = 0; k < 6; k++) { B.push().tr(-0.15 + k * 0.05, 1.45, 0).rz(PI / 2); B.cyl(0, -0.006, 0, 0.078, 0.078, 0.012, { reg: 'white', tint: '#c8b48a', seg: 10 }); B.pop(); }
      B.box(0.47, 1.45, 0.1, 0.05, 0.05, 0.25, { reg: 'iron' });
      B.box(0, 0.62, 0.06, 0.012, 0.83, 0.012, { reg: 'white', tint: '#c8b48a' });
      B.lathe(0, 0.42, 0.06, [[0.0, 0], [0.09, 0], [0.11, 0.2], [0.0, 0.2]], { reg: 'woodV', seg: 10 }); // bucket on the rope
      B.lathe(0.32, 0.64, 0.28, [[0.0, 0], [0.11, 0], [0.13, 0.2], [0.12, 0.2], [0.1, 0.03], [0.0, 0.03]], { reg: 'woodV', seg: 10 }); // bucket on the rim
      for (const y of [0.7, 0.8]) B.lathe(0.32, y, 0.28, [[0.115 + (y - 0.64) * 0.1, 0], [0.12 + (y - 0.64) * 0.1, 0.015]], { reg: 'iron', seg: 10 });
    },
  });

  // =================================================================================================
  // 涼亭 pavilion — square 攢尖 pavilion: stone platform & steps, four red columns, painted beams with 掛落 fretwork,
  // 美人靠 bench, stone table & stools, green glazed roof with upswept hips and a gourd finial
  // =================================================================================================
  han('pavilion', {
    build(B, c) {
      const { lit } = c, H = 0.32, cy = 3.0, R = 1.18;
      plinth(B, 0, -0.08, 2.9, 2.7, H);
      steps(B, 0, 1.45, 0.95, 2, H / 2, 0.22, { flare: 0.08 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) columnAt(B, sx * R, sz * R - 0.08, H, cy - H, 0.11, { tint: '#b3291f' });
      // beams, painted bands, fretwork
      for (const [a, b] of [[[-R, R], [R, R]], [[-R, -R], [R, -R]]]) { B.box(0, cy - 0.28, a[1] - 0.08, 2 * R + 0.2, 0.26, 0.16, { reg: 'beamPaint', ao: false }); }
      for (const sx of [-1, 1]) B.box(sx * R, cy - 0.28, -0.08, 0.16, 0.26, 2 * R + 0.2, { reg: 'beamPaint', ao: false });
      for (const sz of [-1, 1]) for (let x = -R + 0.12; x < R - 0.1; x += 0.11) B.box(x, cy - 0.5, sz * R - 0.08, 0.025, 0.22, 0.025, { reg: 'grain', tint: '#8a2a1c' });
      for (const sz of [-1, 1]) B.box(0, cy - 0.53, sz * R - 0.08, 2 * R - 0.2, 0.03, 0.03, { reg: 'grain', tint: '#8a2a1c' });
      // 美人靠 bench along the back & sides
      const bench = (x0, z0, x1, z1) => {
        const L = hypot(x1 - x0, z1 - z0), a = atan2(z1 - z0, x1 - x0);
        B.push().tr((x0 + x1) / 2, H, (z0 + z1) / 2).ry(-a);
        B.box(0, 0.42, 0, L, 0.06, 0.34, { reg: 'grain', mat: 'gloss', tint: '#7a2a1e' });
        B.box(0, 0, 0.06, L, 0.42, 0.04, { reg: 'grain', tint: '#5a2016' });
        for (let x = -L / 2 + 0.06; x < L / 2; x += 0.09) { B.push().tr(x, 0.48, -0.17).rx(0.35); B.box(0, 0, 0, 0.025, 0.42, 0.025, { reg: 'grain', tint: '#6a2418' }); B.pop(); }
        B.push().tr(0, 0.88, -0.32).rx(0.35); B.box(0, 0, 0, L, 0.05, 0.06, { reg: 'grain', mat: 'gloss', tint: '#7a2a1e' }); B.pop();
        B.pop();
      };
      bench(-R + 0.12, -R + 0.08, R - 0.12, -R + 0.08);
      bench(-R + 0.08, R - 0.4, -R + 0.08, -R + 0.25);
      bench(R - 0.08, -R + 0.25, R - 0.08, R - 0.4);
      // stone table & stools
      B.lathe(0, H, 0.0, [[0.22, 0], [0.12, 0.08], [0.1, 0.55], [0.18, 0.62], [0.42, 0.66], [0.44, 0.72], [0.0, 0.74]], { reg: 'granite', seg: 16 });
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.5; B.lathe(sin(a) * 0.68, H, cos(a) * 0.68, [[0.15, 0], [0.11, 0.2], [0.15, 0.4], [0.0, 0.42]], { reg: 'granite', seg: 10 }); }
      // roof
      const rf = roof(B, { type: 'hip', hx: 1.75, hz: 1.75, xr: 0, cz: -0.08, yr: 5.25, ye: cy - 0.05, curve: 0.55, lift: 0.42, kick: 0.22, tile: 'tileGreen', mat: 'gloss', rows: 9, thick: 0.1, soffitTint: '#7a6a5a' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const hl = rf.hipLine(sx, sz, 10).map((p) => [p[0], p[1] + 0.03, p[2]]);
        ridge(B, hl, { w: 0.12, h: 0.16, tint: '#2c5c4a', mat: 'gloss', reg: 'tileGreen', ends: [null, 'curl'], len: 0.35, rise: 0.32, size: 0.5 });
      }
      gourdAt(B, 0, 5.2, -0.08, 1.25);
      for (const sx of [-1, 1]) lanternAt(B, sx * R, cy - 0.85, R + 0.0, { lit, r: 0.15, cord: 0.22 });
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 牌坊 paifang — memorial gateway: two posts with 抱鼓石 drum stones, two beams framing the name board and carved
  // panels, a small tiled roof with swallowtails and a pearl. v0 granite (green tiles), v1 red lacquer (red tiles)
  // =================================================================================================
  han('paifang', {
    nv: 2, salt: 31,
    key: (o) => o.text || '',
    build(B, c) {
      const stone = c.v === 0, px = 1.5, Hp = 4.35;
      const pst = stone ? { reg: 'granite', tint: '#e6e0d4' } : { reg: 'grain', mat: 'gloss', tint: '#b02a20' };
      const bmo = stone ? { reg: 'granite', tint: '#d8d2c6' } : { reg: 'beamPaint', ao: false };
      for (const sx of [-1, 1]) {
        B.box(sx * px, 0, 0, 0.62, 0.32, 0.62, { reg: 'granite', tint: '#d0cabe' });
        B.box(sx * px, 0.32, 0, 0.36, Hp - 0.32, 0.36, pst);
        if (!stone) for (const y of [0.32, Hp - 0.06]) B.box(sx * px, y, 0, 0.38, 0.06, 0.38, { reg: 'gold', mat: 'metal' });
        for (const sz of [-1, 1]) { // 抱鼓石 drum stones bracing the post front and back
          B.box(sx * px, 0.32, sz * 0.42, 0.24, 0.42, 0.46, { reg: 'granite', tint: '#dcd6ca' });
          B.push().tr(sx * px, 0.95, sz * 0.38).rz(PI / 2);
          B.cyl(0, -0.13, 0, 0.26, 0.26, 0.26, { reg: 'granite', tint: '#e2dcd0', seg: 14 });
          B.pop();
        }
        // carved vertical couplets on the post faces
        const txt = sx < 0 ? '慈航普渡' : '燈照彼岸';
        for (const sz of [1, -1]) {
          const uv = B.decal(60, 300, (g, W, H) => { g.fillStyle = stone ? '#cfc9bc' : '#a82a20'; g.fillRect(0, 0, W, H); chars(g, txt, W / 2, H / 2, 46, stone ? 'rgba(50,46,40,0.85)' : '#f2cb68', 'v', 1.25, stone ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.4)'); });
          B.push().tr(sx * px, 2.05, sz * 0.183).ry(sz > 0 ? 0 : PI);
          B.quad([-0.14, -0.75, 0], [0.14, -0.75, 0], [0.14, 0.75, 0], [-0.14, 0.75, 0], { mat: 'decal', ao: false }, uv);
          B.pop();
        }
      }
      // beams (lower 額枋, upper 大額枋) and the panels between them
      B.box(0, 2.95, 0, 2 * px + 0.5, 0.3, 0.3, bmo);
      B.box(0, 3.95, 0, 2 * px + 0.8, 0.32, 0.32, bmo);
      for (const sx of [-1, 1]) { B.box(sx * 0.95, 3.25, 0, 0.9, 0.7, 0.18, stone ? { reg: 'relief', tint: '#ffffff' } : { reg: 'relief', tint: '#9ab8c8' }); B.box(sx * 0.48, 3.25, 0, 0.12, 0.7, 0.22, pst); }
      for (const sz of [1, -1]) plaqueAt(B, 0, 3.6, sz * 0.12, 0.92, 0.6, c.text || '彼岸', Object.assign(stone ? { bg: '#2a3a5a', fg: '#f2d070', rim: '#8e8a7e' } : { bg: '#1c2f5a', fg: '#f6d06a', rim: '#d6a542' }, { ry: sz > 0 ? 0 : PI, ppm: 300 }));
      for (const sx of [-1, 1]) for (const k of [0, 1]) B.box(sx * (0.5 + k * 0.4), 4.27, 0, 0.16, 0.16, 0.16, { reg: stone ? 'granite' : 'gold', mat: stone ? 'matte' : 'metal' }); // 斗 blocks
      const rf = roof(B, { type: 'gable', hx: 2.25, hz: 0.62, yr: 5.08, ye: 4.42, curve: 0.45, lift: 0.14, ridgeLift: 0.16, tile: stone ? 'tileGreen' : 'tileRed', mat: stone ? 'gloss' : 'matte', rows: 4, thick: 0.1, vergeTint: stone ? '#2c4c42' : '#6a2418' });
      ridge(B, ridgePath(rf, 2.0, 14, 0), { w: 0.16, h: 0.2, tint: stone ? '#2c4c42' : '#7a2a1e', ends: 'swallow', len: 0.55, rise: 0.42, band: 'porcelain', bandFrom: 2, bandTo: 2 });
      pearlAt(B, 0, rf.ridgeY(0) + 0.18, 0, 0.7);
    },
  });

  // =================================================================================================
  // GRAND TEMPLES — 三川殿 front hall with a raised central roof (斷簷升箭口), dragon columns (龍柱), door gods (門神),
  // painted beams & pendant brackets, 剪黏 twin dragons on the ridges, and a 歇山 main hall behind.
  // The deity is never shown: the open centre door reveals an altar, candles and a closed embroidered curtain.
  // =================================================================================================
  const TEMPLES = {
    temple: { tile: 'tileOrange', tileTint: '#ffffff', ridge: '#2f5e7a', side: 'ashlar', sideTint: '#ffffff', wood: '#9a2a20', bay: 'round', door: 1.3, text: '靈安宮', plaque: { bg: '#1c2f5a', fg: '#f6d06a', rim: '#d6a542' }, crown: 'pearl', dragon: '#4ab88a', main: 'tileOrange', lantern: 'red', cols: '#b3291f' },
    mazu_temple: { tile: 'tileRed', tileTint: '#ffe8de', ridge: '#a63f2c', side: 'brickRed', sideTint: '#ffffff', wood: '#a8302a', bay: 'door', door: 1.7, text: '天后宮', vertical: true, plaque: { bg: '#1d2a55', fg: '#f2d070', rim: '#d6a542' }, crown: 'pagoda', dragon: '#3aa87a', main: 'tileRed', lantern: 'red', cols: '#aaa59b', studs: 'doorStuds' },
    city_god_temple: { tile: 'tileDark', tileTint: '#ffffff', ridge: '#3c3f43', side: 'brickOld', sideTint: '#a88878', wood: '#3a2420', bay: 'door', door: 1.7, text: '城隍廟', vertical: true, plaque: { bg: '#121212', fg: '#d9b45a', rim: '#8a6a3a' }, crown: 'gourd', dragon: '#5f8a7c', main: 'tileDark', lantern: 'red', cols: '#86837d', studs: 'doorPlank', abacus: true, dim: 0.72 },
  };
  function grandTemple(B, c, C) {
    const { w, h, lit } = c, W = w, D = h;
    const PH = 0.42, hw = W / 2 - 0.08;
    const zP = D / 2 - 0.42, zF = D / 2 - 1.05, zB = zF - 1.75, zM0 = zB - 0.25, zM1 = -D / 2 + 0.12;
    const cw = C.door > 1.5 ? 1.05 : 1.2, dw = C.door, dh = 2.45;
    const wood = C.wood;
    // platform & steps
    plinth(B, 0, 0, W - 0.04, D - 0.04, PH, { side: 'ashlar', top: 'pave' });
    steps(B, 0, D / 2 + 0.02, dw + 1.0, 3, PH / 3, 0.2, { flare: 0.1 });
    B.push().tr(0, PH, 0);
    // ---------------- front hall facade (local wall frame at zF)
    const fe = 3.35; // front eave height above the platform
    B.push().tr(0, 0, zF);
    const sideX = cw + (hw - cw) / 2;
    const holes = [{ x0: -dw / 2, x1: dw / 2, y0: 0, y1: dh }];
    if (C.bay === 'door') for (const s of [-1, 1]) holes.push({ x0: s * sideX - 0.42, x1: s * sideX + 0.42, y0: 0, y1: 2.0 });
    else for (const s of [-1, 1]) holes.push({ x0: s * sideX - 0.48, x1: s * sideX + 0.48, y0: 1.15, y1: 2.11 });
    const fTop = 3.75;
    // centre bay in red timber, side bays in stone / brick
    wall(B, cw * 2, 0, fTop, 0.3, [holes[0]], { reg: 'woodNeutral', tint: wood, eave: fe, endL: true, endR: true });
    for (const s of [-1, 1]) {
      B.push().tr(s * (cw + (hw - cw) / 2), 0, 0);
      wall(B, hw - cw, 0, fTop, 0.3, [holes[s < 0 ? 1 : 2]].map((q) => Object.assign({}, q, { x0: q.x0 - s * sideX, x1: q.x1 - s * sideX })), { reg: C.side, tint: C.sideTint, eave: fe, endL: true, endR: true });
      B.pop();
      B.box(s * sideX, 0, 0.04, hw - cw, 0.5, 0.08, { reg: 'granite', tint: '#e2dccf' }); // 裙堵 base course
      if (C.bay === 'round') { // 龍虎窗: round stone window with bars, carved panel below
        B.push().tr(s * sideX, 1.63, 0);
        const ring = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * TAU; ring.push([cos(a) * 0.55, sin(a) * 0.55, 0.04]); }
        B.sweep(ring, [[-0.09, -0.05], [0.09, -0.05], [0.09, 0.05], [-0.09, 0.05]], { hard: true, reg: 'granite', tint: '#e6e0d4', up: [0, 0, 1] });
        for (let k = -3; k <= 3; k++) { const x = k * 0.13, hh = sqrt(max(0, 0.48 * 0.48 - x * x)); B.push().tr(x, 0, -0.1).ry(PI / 4); B.box(0, -hh, 0, 0.06, hh * 2, 0.06, { reg: 'granite', tint: '#d8d2c6' }); B.pop(); }
        const fill = []; for (let k = 0; k <= 24; k++) { const a = (k / 24) * TAU; fill.push([cos(a) * 0.5, sin(a) * 0.5, -0.2]); }
        B.fan([0, 0, -0.2], fill, { mat: 'glow', reg: 'white', tint: lit ? [0.3, 0.17, 0.07] : [0.03, 0.025, 0.02] });
        B.pop();
        B.box(s * sideX, 0.58, 0.035, 1.2, 0.5, 0.05, { reg: 'relief' });
        B.rect(s * sideX, 0.83, 0.065, 1.1, 0.42, { reg: 'relief', decalUV: true });
      } else { // side doors with studs
        doorAt(B, s * sideX, 0.84, 2.0, 0.3, { leaves: 'closed', reg: C.studs, frameTint: wood, threshold: true, lit: false, depth: 0.4 });
        B.box(s * sideX, 2.2, 0.03, 1.0, 0.36, 0.05, { reg: 'beamPaint', ao: false });
      }
    }
    // centre door: door gods on the leaves, opened inward; interior altar behind (no deity shown)
    doorAt(B, 0, dw, dh, 0.3, { leaves: 'open', reg: 'doorGodR', regL: 'doorGodL', lit, pins: true, frameTint: '#3a120e', depth: 1.9 });
    B.push().tr(0, 0, -0.3);
    B.box(0, 0, -1.25, dw * 0.85, 0.85, 0.42, { reg: 'grain', mat: 'gloss', tint: '#7a1a12' });                 // altar table
    B.box(0, 0.05, -1.03, dw * 0.85, 0.72, 0.02, { reg: 'embroid' });                                          // table skirt 桌裙
    B.lathe(0, 0.85, -1.25, [[0.0, 0], [0.12, 0.02], [0.16, 0.1], [0.14, 0.18], [0.0, 0.18]], { reg: 'bronze', mat: 'metal', seg: 10 });
    for (const sx of [-1, 1]) { B.cyl(sx * dw * 0.32, 0.85, -1.25, 0.03, 0.03, 0.26, { reg: 'white', tint: '#c42a1f', seg: 6 }); B.cyl(sx * dw * 0.32, 1.11, -1.25, 0.02, 0.0, 0.07, { mat: 'glow', reg: 'white', tint: [2.6, 1.6, 0.5], seg: 5 }); }
    B.grid(lin01(8), lin01(3), (u, v) => [lerp(-dw * 0.46, dw * 0.46, u), lerp(dh - 0.05, 0.9, v), -1.72 + sin(u * PI * 7) * 0.03], (u, v) => [u * 2, v * 2.4], { reg: 'embroid', face: [0, 0, 1], ao: false }); // closed shrine curtain
    B.box(0, dh - 0.3, -1.6, dw * 0.95, 0.28, 0.06, { reg: 'gold', mat: 'metal' });
    B.pop();
    B.box(0, fTop - 0.55, 0.02, cw * 2, 0.28, 0.06, { reg: 'beamPaint', ao: false });
    B.pop();
    // ---------------- porch: columns, beams, brackets, pendants, lanterns
    for (const s of [-1, 1]) {
      dragonColumn(B, s * cw, zP, 0, 3.15, 0.15, { tint: C.dragon, a0: s > 0 ? PI : 0 });
      columnAt(B, s * (hw - 0.22), zP, 0, 3.15, 0.14, { tint: C.cols, reg: C.cols === '#b3291f' ? 'grain' : 'granite', mat: C.cols === '#b3291f' ? 'gloss' : 'matte' });
      for (const x of [s * cw, s * (hw - 0.22)]) B.box(x, 3.1, (zP + zF) / 2, 0.18, 0.24, zP - zF + 0.2, { reg: 'beamPaint', ao: false }); // 通樑 tie beams
      for (const x of [s * cw, s * (hw - 0.22)]) for (let k = 0; k < 3; k++) B.box(x, 3.15 + k * 0.14, zP, 0.22 + k * 0.1, 0.12, 0.22 + k * 0.06, { reg: k % 2 ? 'gold' : 'grain', mat: k % 2 ? 'metal' : 'gloss', tint: k % 2 ? '#ffffff' : '#7a2a1e' }); // 斗拱 stack
      // 吊筒 hanging pendants with gilded lotus ends
      const xp = s * sideX;
      B.cyl(xp, 2.75, zP, 0.07, 0.07, 0.45, { reg: 'grain', mat: 'gloss', tint: '#7a2a1e', seg: 8 });
      B.lathe(xp, 2.55, zP, [[0.0, 0], [0.08, 0.04], [0.11, 0.12], [0.08, 0.2]], { reg: 'gold', mat: 'metal', seg: 8 });
    }
    B.box(0, 3.15, zP, 2 * hw + 0.2, 0.3, 0.2, { reg: 'beamPaint', ao: false });
    // name board hung from the porch beam (vertical 豎匾 for 媽祖/城隍, horizontal for the village temple) — kept
    // below the eave line so it reads from the 52° game camera
    if (C.vertical) plaqueAt(B, 0, 2.6, zP + 0.12, 0.42, 1.0, c.text || C.text, Object.assign({ dir: 'v', ppm: 260 }, C.plaque));
    else plaqueAt(B, 0, 2.86, zP + 0.12, 1.35, 0.4, c.text || C.text, Object.assign({ ppm: 260 }, C.plaque));
    B.box(0, 3.45, zP, 2 * hw + 0.3, 0.12, 0.26, { reg: 'grain', tint: '#3a2418' });
    B.box(0, 3.15, zP, 2 * hw + 0.1, 0.05, zP - zF, { reg: 'soffit', tint: '#7a6050', skip: 't', ao: false });
    const lk = C.dim || 1;
    for (const s of [-1, 1]) {
      lanternAt(B, s * 0.68, 2.15, zP - 0.12, { kind: s < 0 ? 'ping' : 'an', lit, r: 0.27, h: 0.62, cord: 0.32, glow: 1.6 * lk, intensity: 1.2 });
      for (const x of [s * (hw - 0.75), s * (cw + 0.42)]) lanternAt(B, x, 2.55, zP - 0.05, { lit, r: 0.14, cord: 0.22, glow: 1.6 * lk, light: abs(x) > 2 });
    }
    if (C.abacus) { // 城隍爺的大算盤 — the City God's great abacus, hung under the porch beam
      B.box(0, 3.0, zP - 0.35, 1.5, 0.06, 0.06, { reg: 'grain', tint: '#2a1a12' }); B.box(0, 2.62, zP - 0.35, 1.5, 0.06, 0.06, { reg: 'grain', tint: '#2a1a12' });
      for (const sx of [-1, 1]) B.box(sx * 0.75, 2.62, zP - 0.35, 0.06, 0.44, 0.06, { reg: 'grain', tint: '#2a1a12' });
      B.box(0, 2.88, zP - 0.35, 1.5, 0.03, 0.05, { reg: 'grain', tint: '#2a1a12' });
      for (let k = 0; k < 9; k++) for (const y of [2.93, 2.72, 2.79]) { B.push().tr(-0.6 + k * 0.15, y, zP - 0.35).rz(PI / 2); B.cyl(0, -0.025, 0, 0.035, 0.035, 0.05, { reg: 'grain', mat: 'gloss', tint: '#5a2a1a', seg: 6 }); B.pop(); }
    }
    // ---------------- front hall body: side & back walls
    for (const s of [-1, 1]) { B.push().tr(s * hw, 0, (zF + zB) / 2).ry(s * PI / 2); wall(B, zF - zB, 0, fTop, 0.3, [], { reg: C.side, tint: C.sideTint, eave: fe, endL: true, endR: true }); B.pop(); }
    B.push().tr(0, 0, zB).ry(PI); wall(B, 2 * hw, 0, fTop, 0.3, [], { reg: C.side, tint: C.sideTint }); B.pop();
    // ---------------- main hall (正殿)
    const mh = 4.3;
    for (const s of [-1, 1]) { B.push().tr(s * hw, 0, (zM0 + zM1) / 2).ry(s * PI / 2); wall(B, zM0 - zM1, 0, mh, 0.3, [{ x0: -0.3, x1: 0.3, y0: 1.5, y1: 2.4 }], { reg: C.side, tint: C.sideTint, eave: mh, endL: true, endR: true }); windowAt(B, 0, 1.5, 0.6, 0.9, 0.3, { style: 'bars', lit, sill: false }); B.pop(); }
    B.push().tr(0, 0, zM1).ry(PI); wall(B, 2 * hw, 0, mh, 0.3, [{ x0: -0.5, x1: 0.5, y0: 1.5, y1: 2.3 }], { reg: C.side, tint: C.sideTint, eave: mh }); windowAt(B, 0, 1.5, 1.0, 0.8, 0.3, { style: 'turtle', lit: false }); B.pop();
    B.push().tr(0, 0, zM0); wall(B, 2 * hw, 3.6, mh, 0.3, [], { reg: C.side, tint: C.sideTint }); B.pop();
    B.box(0, mh - 0.4, (zM0 + zM1) / 2, 2 * hw + 0.02, 0.3, zM0 - zM1 + 0.02, { reg: 'beamPaint', skip: 'b', ao: false });
    // ---------------- roofs
    const rc = (zP + 0.55 + zB - 0.15) / 2, rhz = (zP + 0.55 - (zB - 0.15)) / 2;
    const tileM = C.tile === 'tileOrange' || C.tile === 'tileGreen' ? 'gloss' : 'matte';
    const side = roof(B, { type: 'gable', hx: W / 2 + 0.3, hz: rhz, cz: rc, yr: fe + 1.25, ye: fe, curve: 0.55, lift: 0.22, ridgeLift: 0.28, tile: C.tile, tint: C.tileTint, mat: tileM, rows: 7, vergeTint: shade(C.ridge, -0.2) });
    ridge(B, ridgePath(side, W / 2 + 0.1, 18, 0).map((p) => [p[0], p[1], p[2] + rc]), { w: 0.24, h: 0.32, tint: C.ridge, ends: 'swallow', len: 0.85, rise: 0.75, band: 'porcelain', bandFrom: 2, bandTo: 2 });
    const cen = roof(B, { type: 'gable', hx: cw + 0.45, hz: rhz - 0.12, cz: rc, yr: fe + 2.0, ye: fe + 0.62, curve: 0.55, lift: 0.18, ridgeLift: 0.22, tile: C.tile, tint: C.tileTint, mat: tileM, rows: 7, vergeTint: shade(C.ridge, -0.2) });
    ridge(B, ridgePath(cen, cw + 0.3, 12, 0).map((p) => [p[0], p[1], p[2] + rc]), { w: 0.24, h: 0.32, tint: C.ridge, ends: 'swallow', len: 0.7, rise: 0.65, band: 'porcelain', bandFrom: 2, bandTo: 2 });
    for (const sx of [-1, 1]) B.fan([sx * (cw + 0.42), fe + 0.55, rc], cen.profile(sx * (cw + 0.42), 10, true).map((p) => [sx * (cw + 0.42), p[1], p[2]]).filter((p) => p[1] > fe + 0.5), { reg: 'beamPaint', ao: false, flip: sx < 0 }); // raised-roof side panels
    ridgeCrown(B, 0, cen.ridgeY(0) + 0.3, rc, 0.95, 1.0, { center: C.crown === 'gourd' ? 'gourd' : 'pearl', body: C.dragon });
    // side gables of the front hall (硬山)
    for (const sx of [1, -1]) {
      const x = sx * (hw + 0.0);
      const top = side.profile(sx * (hw), 12, true).map((p) => [x, p[1] - 0.02, p[2] + rc]).filter((p) => p[1] > fTop - 0.01 && p[2] < zF + 0.05 && p[2] > zB - 0.05);
      if (top.length > 2) B.fan([x, fTop, (zF + zB) / 2], (sx > 0 ? top.slice().reverse() : top), { reg: C.side, tint: C.sideTint, ao: false });
    }
    const mcz = (zM0 + zM1) / 2, mhz = (zM0 - zM1) / 2 + 0.65;
    const main = roof(B, { type: 'xieshan', hx: W / 2 + 0.4, hz: mhz, xr: W / 2 - 0.55, v0: 0.42, cz: mcz, yr: mh + 2.15, ye: mh - 0.1, curve: 0.55, lift: 0.4, kick: 0.2, tile: C.main, tint: C.tileTint, mat: tileM, rows: 8, gableReg: 'beamPaint', bargeTint: shade(C.ridge, -0.2) });
    ridge(B, ridgePath(main, W / 2 - 0.5, 18, 0).map((p) => [p[0], p[1], p[2] + mcz]), { w: 0.28, h: 0.38, tint: C.ridge, ends: 'swallow', len: 1.0, rise: 0.85, band: 'porcelain', bandFrom: 2, bandTo: 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      ridge(B, main.hipLine(sx, sz, 8).map((p) => [p[0], p[1] + 0.03, p[2]]), { w: 0.16, h: 0.2, tint: C.ridge, ends: [null, 'curl'], len: 0.5, rise: 0.5 });
      ridge(B, main.gableEdge(sx, sz, 6).map((p) => [p[0] - sx * 0.05, p[1] + 0.03, p[2]]), { w: 0.14, h: 0.18, tint: C.ridge });
    }
    ridgeCrown(B, 0, main.ridgeY(0) + 0.36, mcz, 1.5, 1.35, { center: C.crown, body: C.dragon });
    B.pop();
    B.light(0, PH + 1.0, zF - 0.9, '#ffc070', lit ? 1.1 : 0.2, 4.5, 0.15);
  }
  for (const [id, C] of Object.entries(TEMPLES)) han(id, {
    door: id === 'temple' ? 3 : 2, doorMin: id === 'temple' ? 0 : 1, maxLights: 4,
    key: (o) => o.text || '',
    build(B, c) { grandTemple(B, c, C); },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // FORTIFICATIONS — 城牆 city_wall, 城門 gate_city (竹塹/府城 style), 恆春 fort_gate
  // =================================================================================================
  const WALL_H = 3.6;
  // crenellated parapet (雉堞) along x at local z, from x0..x1 on top of height y
  function merlons(B, x0, x1, y, z, o) {
    const pitch = 0.95, mw = 0.55, n = max(1, round((x1 - x0) / pitch));
    const step = (x1 - x0) / n;
    B.box((x0 + x1) / 2, y, z, x1 - x0, 0.42, 0.28, Object.assign({ skip: 'b' }, o)); // parapet base
    for (let i = 0; i < n; i++) { const x = x0 + (i + 0.5) * step; B.box(x, y + 0.42, z, min(mw, step - 0.12), 0.48, 0.28, Object.assign({ skip: 'b' }, o)); B.box(x, y + 0.9, z, min(mw, step - 0.12) + 0.04, 0.06, 0.32, { reg: 'granite', tint: '#d0cabe', skip: 'b' }); }
  }
  han('city_wall', {
    nv: 2, salt: 33, resize: 'w',
    key: (o) => o.tall || 110,
    build(B, c) {
      const { w, v } = c, H = WALL_H * (c.o.tall || 110) / 110, brick = v === 1;
      const face = brick ? { reg: 'brickOld', tint: '#ffffff' } : { reg: 'ashlarDark', tint: '#f0ece4' };
      const L = w, T = 0.96;
      // battered faces: wider at the foot
      for (const s of [1, -1]) B.quad([-L / 2, 0, s * T / 2], [L / 2, 0, s * T / 2], [L / 2, H, s * (T / 2 - 0.08)], [-L / 2, H, s * (T / 2 - 0.08)], Object.assign({ flip: s < 0 }, face));
      for (const s of [1, -1]) B.quad([s * L / 2, 0, -s * T / 2], [s * L / 2, 0, s * T / 2], [s * L / 2, H, s * (T / 2 - 0.08)], [s * L / 2, H, -s * (T / 2 - 0.08)], Object.assign({ flip: s > 0 }, face));
      B.box(0, 0, 0, L, 0.35, T + 0.1, { reg: 'ashlar', tint: '#d8d2c6', skip: 'b' });                    // footing course
      B.box(0, H - 0.12, 0, L + 0.02, 0.12, T - 0.06, { reg: 'pave', tint: '#cfc8b8', ao: false });       // walkway paving
      B.box(0, H - 0.2, T / 2 - 0.04, L + 0.02, 0.08, 0.1, { reg: 'granite', tint: '#d6d0c4' });        // string course
      merlons(B, -L / 2, L / 2, H - 0.12, T / 2 - 0.2, face);
      B.box(0, H - 0.12, -T / 2 + 0.12, L, 0.45, 0.2, Object.assign({ skip: 'b' }, face));               // low inner parapet (女牆)
      for (let x = -L / 2 + 2; x < L / 2 - 1; x += 4) { B.box(x, H - 0.55, T / 2 - 0.04, 0.14, 0.12, 0.3, { reg: 'granite', tint: '#bab4a8' }); B.rect(x, H - 1.6, T / 2 - 0.075, 0.18, 1.9, { reg: 'white', tint: '#3e4a32', ao: false, k: 0.6 }, -0.08); } // drain spouts with moss streaks
    },
  });
  // gate masonry with an arched passage through column `door`; returns the tower helper
  function gateBlock(B, c, o) {
    const { w, h, door } = c, W = w, D = h, H = o.H || WALL_H;
    const px = -W / 2 + (door >= 0 ? door : floor(w / 2)) + 0.5, pw = 0.96, ys = o.spring || 2.05;
    const face = o.face;
    for (const s of [1, -1]) {
      B.push().tr(0, 0, s * D / 2).ry(s > 0 ? 0 : PI);
      const x = s > 0 ? px : -px;
      wall(B, W, 0, H, 0.5, [{ x0: x - pw / 2, x1: x + pw / 2, y0: 0, y1: ys + pw / 2 }], Object.assign({ endL: true, endR: true }, face));
      if (o.lower) wall(B, W + 0.04, 0, o.lower.h, 0.04, [{ x0: x - pw / 2, x1: x + pw / 2, y0: 0, y1: o.lower.h + 1 }], Object.assign({}, o.lower, { endL: true, endR: true }));
      archAt(B, x, pw, ys, ys + pw / 2, 0.5, Object.assign({}, face, { voussoir: 'granite', voussoirTint: '#e0dace', key: true }));
      B.pop();
    }
    for (const s of [1, -1]) { B.push().tr(s * W / 2, 0, 0).ry(s * PI / 2); wall(B, D - 1.0, 0, H, 0.5, [], Object.assign({ endL: true, endR: true }, face)); B.pop(); }
    B.box(0, 0, 0, W - 1.0, H, D - 1.0, Object.assign({ skip: 'nsewb' }, face)); // core top
    // passage: barrel vault & walls through the full depth, paved floor
    B.push().tr(px, 0, D / 2 - 0.5);
    archAt(B, 0, pw, ys, ys + pw / 2 + 0.01, D - 1.0, { reg: 'ashlarDark', tint: '#a8a49a', ao: false });
    B.pop();
    for (const sx of [-1, 1]) B.quad([px + sx * pw / 2, 0, sx > 0 ? -D / 2 + 0.5 : D / 2 - 0.5], [px + sx * pw / 2, 0, sx > 0 ? D / 2 - 0.5 : -D / 2 + 0.5], [px + sx * pw / 2, ys, sx > 0 ? D / 2 - 0.5 : -D / 2 + 0.5], [px + sx * pw / 2, ys, sx > 0 ? -D / 2 + 0.5 : D / 2 - 0.5], { reg: 'ashlarDark', tint: '#a8a49a' });
    B.box(px, 0, 0, pw, 0.03, D, { reg: 'pave', tint: '#bdb6a8', skip: 'b' });
    // studded gate leaves folded back against the passage walls
    for (const sx of [-1, 1]) { B.push().tr(px + sx * (pw / 2 - 0.05), 0, D / 2 - 0.5 - 0.48).ry(sx * PI / 2); B.box(0, 0, 0, 0.92, ys + 0.3, 0.08, { reg: 'grain', tint: '#4a2418' }); B.rect(0, (ys + 0.3) / 2, 0.041, 0.86, ys + 0.24, { reg: o.leaf || 'doorStuds', decalUV: true }); B.pop(); }
    // plaque & lamps
    plaqueAt(B, px, ys + pw / 2 + 0.42, D / 2 + 0.03, 0.9, 0.34, c.text || o.text, o.plaque || { bg: '#d8d2c2', fg: '#2a2420', rim: '#7a766c' });
    // walkway + merlons around the top
    B.box(0, H - 0.1, 0, W - 0.02, 0.1, D - 0.02, { reg: 'pave', tint: '#cfc8b8', ao: false, skip: 'b' });
    merlons(B, -W / 2 + 0.14, W / 2 - 0.14, H, D / 2 - 0.14, face);
    B.push().ry(PI); merlons(B, -W / 2 + 0.14, W / 2 - 0.14, H, D / 2 - 0.14, face); B.pop();
    return { px, H, pw, ys };
  }
  // one-storey gate tower (城樓) on top of the masonry
  function gateTower(B, x, y, tw, td, c, o = {}) {
    const lit = c.lit, th = o.th || 2.1;
    B.push().tr(x, y, 0);
    B.box(0, 0, 0, tw + 0.3, 0.16, td + 0.3, { reg: 'granite', tint: '#d6d0c4' });
    B.push().tr(0, 0.16, 0);
    const nwin = max(1, round(tw / 0.85));
    side(B, 's', tw / 2, td / 2, (L) => {
      const hs = []; for (let i = 0; i < nwin; i++) { const xx = -L / 2 + (i + 0.5) * L / nwin; hs.push({ x0: xx - 0.27, x1: xx + 0.27, y0: 0.55, y1: 1.55, x: xx }); }
      wall(B, L, 0, th, 0.14, hs, { reg: 'woodNeutral', tint: '#7a2a20', eave: th });
      for (const q of hs) windowAt(B, q.x, 0.55, 0.54, 1.0, 0.14, { style: 'diamond', lit, frameTint: '#3a120e', sill: false });
    });
    for (const sn of ['n', 'e', 'w']) side(B, sn, tw / 2, td / 2, (L) => wall(B, L, 0, th, 0.14, [], { reg: 'woodNeutral', tint: '#6a2418', eave: th, endL: sn !== 'n', endR: sn !== 'n' }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) columnAt(B, sx * (tw / 2 + 0.06), sz * (td / 2 + 0.06), 0, th, 0.09, { base: 'square', tint: '#b3291f' });
    B.box(0, th - 0.22, td / 2 + 0.07, tw + 0.3, 0.22, 0.12, { reg: 'beamPaint', ao: false });
    // balustrade along the front of the platform
    B.box(0, 0, td / 2 + 0.25, tw + 0.3, 0.06, 0.06, { reg: 'grain', tint: '#7a2a1c' });
    const rf = roof(B, { type: o.roofType || 'gable', hx: tw / 2 + 0.55, hz: td / 2 + 0.6, xr: tw / 2 - 0.2, v0: 0.45, yr: th + (o.rise || 1.25), ye: th - 0.1, curve: 0.5, lift: 0.3, kick: 0.15, ridgeLift: 0.2, tile: o.tile || 'tileDark', rows: 6, gableReg: 'beamPaint', vergeTint: '#2a2a30' });
    ridge(B, ridgePath(rf, tw / 2 + 0.3, 12, 0), { w: 0.18, h: 0.22, tint: o.ridge || '#3a3d44', ends: 'swallow', len: 0.55, rise: 0.48 });
    if (o.roofType === 'xieshan') for (const sx of [-1, 1]) for (const sz of [-1, 1]) ridge(B, rf.hipLine(sx, sz, 6).map((p) => [p[0], p[1] + 0.03, p[2]]), { w: 0.12, h: 0.15, tint: o.ridge || '#3a3d44', ends: [null, 'curl'], len: 0.35, rise: 0.35 });
    for (const sx of [-1, 1]) lanternAt(B, sx * (tw / 2 - 0.2), th - 0.55, td / 2 + 0.45, { lit, r: 0.15, cord: 0.15 });
    B.pop(); B.pop();
  }
  // wall-mounted torch: iron bracket + flickering flame (glow) + light
  function torchAt(B, x, y, z, lit) {
    B.box(x, y, z + 0.08, 0.04, 0.04, 0.18, { reg: 'iron' });
    B.lathe(x, y - 0.05, z + 0.18, [[0.02, 0], [0.07, 0.12], [0.06, 0.16]], { reg: 'iron', seg: 6 });
    if (!lit) return;
    B.lathe(x, y + 0.1, z + 0.18, [[0.06, 0], [0.07, 0.05], [0.035, 0.16], [0.0, 0.28]], { mat: 'sway', reg: 'white', tint: (xx, yy) => (yy < y + 0.2 ? [3.0, 1.9, 0.6] : [2.6, 0.9, 0.25]), pivot: [x, y + 0.1, z + 0.18], phase: x * 5, seg: 7 });
    B.light(x, y + 0.3, z + 0.35, '#ff9a40', 0.9, 3.5, 0.55);
  }
  han('gate_city', {
    door: 1,
    build(B, c) {
      const g = gateBlock(B, c, { face: { reg: 'ashlarDark', tint: '#f0ece4' }, text: '東門' });
      for (const sx of [-1, 1]) torchAt(B, g.px + sx * 0.78, 1.55, c.h / 2, c.lit);
      gateTower(B, 0, WALL_H, 2.3, 1.1, c, { th: 2.0 });
    },
    update(node, o, t) { tick(t); },
  });
  han('fort_gate', {
    door: (w) => floor(w / 2), resize: 'w', key: (o) => o.text || '',
    build(B, c) {
      const H = 3.0;
      const g = gateBlock(B, c, { H, spring: 1.75, face: { reg: 'brickOld', tint: '#e8c8b8' }, lower: { reg: 'rubble', tint: '#f0e8e0', h: 1.45 }, text: '南門', leaf: 'doorPlank', plaque: { bg: '#e0d8c4', fg: '#3a2a1e', rim: '#8a7a64' } });
      gateTower(B, g.px, H, 1.5, 0.9, c, { th: 1.7, rise: 0.95 });
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 鐘樓 bell_tower — two-eaved square tower on a stone base: red columns, bronze bell with a striker log hung on
  // ropes, enclosed upper storey with a lattice window, green glazed 攢尖 roofs and a gourd finial
  // =================================================================================================
  han('bell_tower', {
    build(B) {
      const PH = 0.5, R = 0.78, Hc = 2.95;
      plinth(B, 0, 0, 1.96, 1.96, PH, { side: 'ashlar', top: 'pave' });
      steps(B, 0, 1.0, 0.7, 2, PH / 2, 0.18);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) columnAt(B, sx * R, sz * R, PH, Hc, 0.1, { tint: '#b3291f' });
      for (const sz of [-1, 1]) B.box(0, PH + Hc - 0.24, sz * R, 2 * R + 0.2, 0.24, 0.14, { reg: 'beamPaint', ao: false });
      for (const sx of [-1, 1]) B.box(sx * R, PH + Hc - 0.24, 0, 0.14, 0.24, 2 * R + 0.2, { reg: 'beamPaint', ao: false });
      B.box(0, PH + Hc - 0.32, 0, 2 * R, 0.12, 0.12, { reg: 'grain', tint: '#4a2a1a' }); // bell beam
      // bronze bell (梵鐘) with bands & nipples
      const by = PH + 0.95;
      B.lathe(0, by, 0, [[0.0, 1.12], [0.12, 1.12], [0.22, 1.08], [0.27, 0.96], [0.29, 0.6], [0.31, 0.25], [0.36, 0.08], [0.4, 0.0], [0.37, -0.02], [0.33, 0.02]], { reg: 'bronze', mat: 'metal', seg: 20 });
      for (const y of [0.35, 0.7]) B.lathe(0, by + y, 0, [[0.298 + (0.7 - y) * 0.03, 0], [0.31 + (0.7 - y) * 0.03, 0.03], [0.298 + (0.7 - y) * 0.03, 0.06]], { reg: 'bronze', mat: 'metal', seg: 20 });
      B.lathe(0, by + 1.12, 0, [[0.06, 0], [0.09, 0.08], [0.04, 0.2], [0.0, 0.22]], { reg: 'bronze', mat: 'metal', seg: 8 });
      B.box(0, by + 1.3, 0, 0.03, PH + Hc - 0.32 - by - 1.3, 0.03, { reg: 'iron' });
      // striker log (撞木) on two ropes
      B.push().tr(0.62, PH + 1.35, 0.45).rz(PI / 2); B.cyl(0, -0.45, 0, 0.08, 0.08, 0.9, { reg: 'grain', tint: '#a07a50', seg: 10 }); B.pop();
      for (const x of [0.35, 0.85]) B.box(x, PH + 1.35, 0.45, 0.015, Hc - 1.65, 0.015, { reg: 'white', tint: '#c8b48a' });
      // lower eave (腰簷) as a pyramid whose apex is hidden inside the upper storey
      roof(B, { type: 'hip', hx: 1.18, hz: 1.18, xr: 0, yr: PH + Hc + 0.95, ye: PH + Hc - 0.12, curve: 0.45, lift: 0.28, kick: 0.15, tile: 'tileGreen', mat: 'gloss', rows: 7, thick: 0.08 });
      const uy = PH + Hc + 0.3, uh = 1.1;
      side(B, 's', 0.5, 0.5, (L) => { wall(B, L, uy, uy + uh, 0.1, [{ x0: -0.25, x1: 0.25, y0: uy + 0.25, y1: uy + 0.8 }], { reg: 'woodNeutral', tint: '#7a2a20' }); windowAt(B, 0, uy + 0.25, 0.5, 0.55, 0.1, { style: 'diamond', lit: false, frameTint: '#3a120e', sill: false }); });
      for (const sn of ['n', 'e', 'w']) side(B, sn, 0.5, 0.5, (L) => wall(B, L, uy, uy + uh, 0.1, [], { reg: 'woodNeutral', tint: '#7a2a20', endL: sn !== 'n', endR: sn !== 'n' }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * 0.52, uy, sz * 0.52, 0.1, uh, 0.1, { reg: 'grain', mat: 'gloss', tint: '#b3291f' });
      const rf = roof(B, { type: 'hip', hx: 1.0, hz: 1.0, xr: 0, yr: uy + uh + 1.15, ye: uy + uh - 0.06, curve: 0.55, lift: 0.3, kick: 0.16, tile: 'tileGreen', mat: 'gloss', rows: 7, thick: 0.08 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ridge(B, rf.hipLine(sx, sz, 8).map((p) => [p[0], p[1] + 0.03, p[2]]), { w: 0.1, h: 0.13, tint: '#2c5046', mat: 'gloss', reg: 'tileGreen', ends: [null, 'curl'], len: 0.28, rise: 0.28, size: 0.5 });
      gourdAt(B, 0, uy + uh + 1.08, 0, 0.9);
    },
  });

  // =================================================================================================
  // 金礦坑 mine_entrance — adit cut into a mossy hillside: timbered portal with braces and a name board, oil lamp,
  // rails & sleepers running into the dark, ferns and grass on the crest, rubble
  // =================================================================================================
  han('mine_entrance', {
    door: 1, key: (o) => o.text || '',
    build(B, c) {
      const { lit } = c, R = B.R;
      const px = -1.5 + (c.door >= 0 ? c.door : 1) + 0.5;
      const rx = 1.85, zf = 1.0, zb = -1.35, Hh = 3.1;
      const hgt = (x, z) => {
        const u = (x - px) / rx, f = clamp((zf - z) / (zf - zb), 0, 1);
        let y = Hh * pow(max(0, 1 - pow(abs(x) / rx, 2.2)), 0.55) * pow(sstep(0, 0.42, f), 0.7) * (1 - 0.35 * sstep(0.6, 1, f));
        y += (sin(x * 3.1 + z * 1.7) * 0.08 + sin(x * 7.3 - z * 4.1) * 0.04) * sstep(0, 0.2, y);
        const cut = (1 - sstep(0.5, 0.72, abs(x - px))) * (1 - sstep(-0.05, 0.18, -z)); // notch in front of the portal
        void u;
        return y * (1 - cut * (1 - sstep(-0.1, 0.0, z) * 0)) * (z > 0.05 ? 1 - cut : 1);
      };
      const xs = samplesFlat(-rx, rx, 0.11), zs = samplesFlat(zb, zf, 0.11);
      B.grid(xs, zs, (x, z) => [x, hgt(x, z), z], (x, z, p) => [x * 0.5, p[1] * 0.5 - z * 0.35], { reg: 'rock', tint: (x, y, z) => (y > 2.2 ? '#c8d8b0' : '#ffffff'), face: [0, 1, 0], aoOff: 0.2 });
      // tunnel (dark) and portal timber frame
      const zt = 0.05;
      B.push().tr(px, 0, zt);
      voidBox(B, -0.5, 0.5, 0, 2.1, 0, 2.2, false);
      for (const sx of [-1, 1]) { B.box(sx * 0.52, 0, 0.04, 0.17, 2.25, 0.17, { reg: 'grain', tint: '#6a4a30' }); B.push().tr(sx * 0.38, 1.85, 0.06).rz(sx * 0.75); B.box(0, -0.2, 0, 0.1, 0.42, 0.1, { reg: 'grain', tint: '#5a3e26' }); B.pop(); }
      B.push().tr(0, 2.3, 0.05).rz(PI / 2); B.cyl(0, -0.78, 0, 0.11, 0.11, 1.56, { reg: 'grain', tint: '#7a5434', seg: 8 }); B.pop();
      for (let k = 0; k < 4; k++) B.box(0, 2.1 + 0.02, 0.05 - 0.3 - k * 0.5, 1.15, 0.12, 0.14, { reg: 'grain', tint: '#4a3420' }); // inner cap pieces
      plaqueAt(B, 0, 2.62, 0.12, 0.7, 0.28, c.text || '金坑', { bg: '#5a3e26', fg: '#f3e2bd', rim: '#2a1a10', ppm: 300 });
      for (const sx of [-1, 1]) B.box(sx * 0.22, 2.42, 0.1, 0.015, 0.22, 0.015, { reg: 'white', tint: '#2a1a10' });
      // rails & sleepers
      for (let z = 1.0; z > -2.1; z -= 0.42) B.box(0, 0, z, 0.9, 0.06, 0.14, { reg: 'grain', tint: '#5a4632' });
      for (const sx of [-1, 1]) B.box(sx * 0.29, 0.06, -0.55, 0.05, 0.06, 3.2, { reg: 'iron', mat: 'metal', tint: '#8a8078' });
      // oil lamp on the left post
      B.box(-0.52, 1.65, 0.2, 0.03, 0.03, 0.22, { reg: 'iron' });
      lanternAt(B, -0.52, 1.42, 0.33, { kind: 'white', lit, r: 0.08, h: 0.18, cord: 0.08, lightColor: '#ffb050', intensity: 1.0, dist: 4.5, glow: 2.6 });
      B.pop();
      B.box(px, 0, 0.55, 1.1, 0.02, 1.0, { reg: 'dirt', skip: 'b', ao: false });
      // rubble and boulders, ferns and grass tufts on the crest
      const rock = (x, z, r) => B.lathe(x, -0.05, z, [[r, 0], [r * 1.05, r * 0.3], [r * 0.85, r * 0.65], [r * 0.4, r * 0.85], [0, r * 0.9]], { reg: 'rock', seg: 7, a0: x * 3, size: 1 });
      for (let i = 0; i < 9; i++) { const x = -1.4 + R() * 2.8, z = 0.55 + R() * 0.4; if (abs(x - px) < 0.75) continue; rock(x, z, 0.08 + R() * 0.12); }
      rock(px + 1.0, 0.6, 0.28); rock(px - 1.05, 0.75, 0.22);
      const tuft = (x, y, z, s, col) => { for (let k = 0; k < 5; k++) { B.push().tr(x, y, z).ry(k * 1.26 + x).rz(0.35 + (k % 2) * 0.25); B.box(0, 0, 0, 0.04 * s, 0.35 * s, 0.015, { reg: 'white', tint: col, ao: false }); B.pop(); } };
      for (let i = 0; i < 26; i++) {
        const x = -rx * 0.9 + R() * rx * 1.8, z = zb + 0.3 + R() * (zf - zb - 0.5), y = hgt(x, z);
        if (y < 0.4 || (abs(x - px) < 0.8 && z > -0.2)) continue;
        tuft(x, y - 0.02, z, 0.7 + R() * 0.8, R() < 0.5 ? '#5e8a3a' : '#7aa04a');
      }
      for (const [x, z] of [[px - 1.2, 0.85], [px + 1.3, 0.8]]) for (let k = 0; k < 7; k++) { B.push().tr(x, hgt(x, z) * 0 + 0.05, z).ry(k * 0.9).rz(0.9); B.box(0, 0, 0, 0.08, 0.55, 0.012, { reg: 'white', tint: '#3e6e34', ao: false }); B.pop(); }
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 客家伙房 hakka_house — U-shaped 夥房: white-plastered 正身 hall with the ancestral 祖堂 and its 堂號 board,
  // two 橫屋 wings with gable ends to the front (懸魚), grey tile roofs, low front wall with a little 門樓 gate,
  // a brick-paved 禾埕 courtyard with drying trays, and a 化胎 mound + curved back wall hinting at the 圍龍
  // =================================================================================================
  han('hakka_house', {
    resize: 'wh', door: (w) => floor((w - 1) / 2), doorMin: 1, key: (o) => o.text || '',
    build(B, c) {
      const { w, h, door, lit } = c, hw = w / 2 - 0.06, hd = h / 2 - 0.06;
      const plas = { reg: 'plaster', tint: '#f4efe4', eave: 2.6 }, base = { reg: 'brickRed', tint: '#d8b0a0' };
      const ww = 1.25, mz1 = -hd + 1.45, mz0 = -hd + 0.25; // main hall depth (front face at mz1)
      const dcx = -w / 2 + door + 0.5;
      // ---- 化胎 mound & curved back wall behind the hall (圍龍 hint)
      B.grid(samplesFlat(-hw + 0.1, hw - 0.1, 0.3), lin01(4), (x, v) => { const z = lerp(-hd + 0.02, mz0 - 0.02, v); return [x, 0.32 * sin(v * PI) * (1 - pow(abs(x) / hw, 4)), z]; }, (x, v) => [x, v], { reg: 'dirt', tint: '#9ab070', face: [0, 1, 0] });
      // ---- main hall 正身
      const eh = 2.75;
      side(B, 's', hw - ww, (mz1 - mz0) / 2, () => {});
      B.push().tr(0, 0, mz1);
      const hallW = 2 * (hw - ww), hh = [{ x0: -0.5, x1: 0.5, y0: 0, y1: 2.2 }, { x0: -1.25, x1: -0.85, y0: 1.1, y1: 1.75, x: -1.05 }, { x0: 0.85, x1: 1.25, y0: 1.1, y1: 1.75, x: 1.05 }].filter((q) => q.x1 < hallW / 2 - 0.05);
      wall(B, hallW, 0.35, eh + 0.35, 0.22, hh.map((q) => (q.y0 === 0 ? Object.assign({}, q, { y0: 0.34 }) : q)), Object.assign({}, plas, { endL: true, endR: true }));
      wall(B, hallW, 0, 0.35, 0.24, [Object.assign({}, hh[0], { y0: -1 })], Object.assign({}, base, { endL: true, endR: true }));
      doorAt(B, 0, 1.0, 2.2, 0.22, { leaves: 'open', reg: 'doorRed', lit, pins: true, frameTint: '#4a2418', depth: 1.0 });
      for (const q of hh.slice(1)) windowAt(B, q.x, 1.1, 0.4, 0.65, 0.22, { style: 'bars', lit, sill: false, barReg: 'grain', barTint: '#6a4630' });
      plaqueAt(B, 0, 2.5, 0.06, 0.95, 0.3, c.text || '穎川堂', { bg: '#2a1a12', fg: '#f3d68a', rim: '#a87a3a' });
      paperAt(B, -0.66, 1.25, 0.005, 0.15, 0.95, '祖德流芳'); paperAt(B, 0.66, 1.25, 0.005, 0.15, 0.95, '宗功浩大');
      for (const sx of [-1, 1]) lanternAt(B, sx * 0.62, 2.2, 0.3, { kind: 'white', lit, r: 0.15, cord: 0.25, intensity: 0.7 });
      B.pop();
      B.push().tr(0, 0, mz0).ry(PI); wall(B, hallW + 2 * ww, 0, eh + 0.35, 0.22, [], plas); B.pop();
      const mr = roof(B, { type: 'gable', hx: hw - ww + 0.1, hz: (mz1 - mz0) / 2 + 0.55, cz: (mz0 + mz1) / 2, yr: eh + 1.35, ye: eh + 0.2, curve: 0.35, lift: 0.08, ridgeLift: 0.12, tile: 'tileGrey', rows: 6, verge: false });
      ridge(B, ridgePath(mr, hw - ww + 0.12, 10, 0).map((p) => [p[0], p[1], p[2] + (mz0 + mz1) / 2]), { w: 0.2, h: 0.22, tint: '#b8b4ac', ends: 'curl', len: 0.3, rise: 0.22 });
      // ---- wings 橫屋 (one on each side, gable end facing the front)
      for (const sx of [-1, 1]) {
        const xc = sx * (hw - ww / 2), zc = (mz0 + hd) / 2, L = hd - mz0;
        B.push().tr(xc, 0, zc);
        // courtyard-facing wall with doors / windows
        B.push().tr(-sx * ww / 2, 0, 0).ry(-sx * PI / 2);
        const wh = []; for (let z = -L / 2 + 0.6; z < L / 2 - 0.4; z += 1.0) wh.push({ x0: z - 0.2, x1: z + 0.2, y0: 1.05, y1: 1.7, x: z });
        if (wh.length) { wh[0] = { x0: wh[0].x - 0.35, x1: wh[0].x + 0.35, y0: 0.34, y1: 2.0, d: 1, x: wh[0].x }; }
        wall(B, L, 0.35, eh, 0.2, wh, Object.assign({}, plas, { endL: true, endR: true }));
        wall(B, L, 0, 0.35, 0.22, wh.filter((q) => q.d).map((q) => Object.assign({}, q, { y0: -1 })), Object.assign({}, base, { endL: true, endR: true }));
        for (const q of wh) if (q.d) doorAt(B, q.x, 0.7, 1.66, 0.2, { leaves: 'open', reg: 'doorRed', lit, frameTint: '#4a2418', depth: 0.8, threshold: false }); else windowAt(B, q.x, 1.05, 0.4, 0.65, 0.2, { style: 'bars', lit, sill: false, barReg: 'grain', barTint: '#6a4630' });
        B.pop();
        B.push().tr(sx * ww / 2, 0, 0).ry(sx * PI / 2); wall(B, L, 0, eh, 0.2, [{ x0: -0.2, x1: 0.2, y0: 1.2, y1: 1.7 }], plas); windowAt(B, 0, 1.2, 0.4, 0.5, 0.2, { style: 'bars', lit: false, sill: false }); B.pop();
        // white gable end toward the front, with a small window and a 懸魚 ornament
        B.push().tr(0, 0, L / 2);
        wall(B, ww, 0, eh, 0.2, [{ x0: -0.2, x1: 0.2, y0: 1.2, y1: 1.65 }], Object.assign({}, plas, { endL: true, endR: true }));
        windowAt(B, 0, 1.2, 0.4, 0.45, 0.2, { style: 'bars', lit, sill: false, barReg: 'grain', barTint: '#6a4630' });
        B.box(0, 0, 0.02, ww, 0.35, 0.05, base);
        B.pop();
        B.push().ry(PI / 2);
        const wr = roof(B, { type: 'gable', hx: L / 2 + 0.25, hz: ww / 2 + 0.45, yr: eh + 0.95, ye: eh - 0.05, curve: 0.3, tile: 'tileGrey', rows: 5, vergeTint: '#e8e2d6', vergeReg: 'plaster', thick: 0.1 });
        ridge(B, ridgePath(wr, L / 2 + 0.2, 6, 0), { w: 0.16, h: 0.16, tint: '#b8b4ac' });
        B.pop();
        const gz = L / 2 + 0.01, prof = wr.profile(0, 10, true).map((p) => [-p[2], p[1], gz]).filter((p) => p[1] > eh - 0.02);
        B.fan([0, eh, gz], [[-ww / 2, eh, gz], ...prof.filter((p) => abs(p[0]) < ww / 2).sort((a, b) => a[0] - b[0]), [ww / 2, eh, gz]], { reg: 'plaster', tint: '#f4efe4', ao: false });
        B.sweep([[0, eh + 0.75, gz + 0.04], [0, eh + 0.45, gz + 0.04], [0, eh + 0.3, gz + 0.04]], [[-0.12, 0], [0.12, 0], [0.06, 0.03], [-0.06, 0.03]], { hard: true, reg: 'white', tint: '#7a8a9a', caps: true, up: [0, 0, 1], scale: (t) => [lerp(1, 0.4, t), 1] }); // 懸魚
        B.pop();
      }
      // ---- front wall with the 門樓 gate, courtyard paving & drying trays
      const fz = hd;
      B.push().tr(0, 0, fz);
      const fl = 2 * (hw - ww);
      wall(B, fl, 0, 1.55, 0.22, [{ x0: dcx - 0.45, x1: dcx + 0.45, y0: 0, y1: 2.0 }], { reg: 'plaster', tint: '#ece5d6', endL: true, endR: true });
      B.box(0, 1.55, -0.11, fl, 0.1, 0.34, { reg: 'tileGrey', ao: false });
      for (const sx of [-1, 1]) B.box(dcx + sx * 0.56, 0, -0.11, 0.24, 2.3, 0.4, { reg: 'brickGrey', tint: '#e6e0d8' });
      B.box(dcx, 2.05, -0.11, 1.36, 0.25, 0.42, { reg: 'plaster', tint: '#f4efe4' });
      B.pop();
      B.push().tr(dcx, 0, fz - 0.11);
      const gr = roof(B, { type: 'gable', hx: 0.9, hz: 0.48, yr: 2.85, ye: 2.25, curve: 0.4, lift: 0.08, ridgeLift: 0.1, tile: 'tileGrey', rows: 3, thick: 0.08 });
      ridge(B, ridgePath(gr, 0.85, 6, 0), { w: 0.12, h: 0.13, tint: '#b8b4ac', ends: 'curl', len: 0.2, rise: 0.15 });
      B.pop();
      const cz0 = mz1, cz1 = fz - 0.22;
      B.box(0, 0, (cz0 + cz1) / 2, fl, 0.04, cz1 - cz0, { reg: 'brickRed', tint: '#e8c0a8', skip: 'b', ao: false });
      for (const [tx, tz, col] of [[-0.75, (cz0 + cz1) / 2 + 0.1, '#e88a2a'], [0.8, (cz0 + cz1) / 2 - 0.15, '#d8b048']]) {
        if (abs(tx - dcx) < 0.5 && tz > cz1 - 0.6) continue;
        B.lathe(tx, 0.04, tz, [[0.42, 0], [0.45, 0.07], [0.43, 0.08], [0.0, 0.03]], { reg: 'weave', seg: 16 });
        for (let k = 0; k < 14; k++) { const a = k * 2.4, r = 0.08 + (k % 5) * 0.06; B.lathe(tx + cos(a) * r, 0.05, tz + sin(a) * r, [[0.05, 0], [0.06, 0.02], [0.0, 0.05]], { reg: 'white', tint: col, seg: 6 }); }
      }
      if (lit) B.light(0, 1.0, mz1 + 0.3, '#ffb862', 0.6, 3.5, 0.1);
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // red_fort — red-brick colonial fort (紅毛城-inspired, not a copy): battered two-storey keep, white quoins & string
  // courses, arched door & windows, crenellated roof terrace with cannons, a sentry box and a flag
  // =================================================================================================
  han('red_fort', {
    door: (w) => floor((w - 1) / 2), resize: 'wh',
    build(B, c) {
      const { w, h, door, lit } = c, hw = w / 2 - 0.06, hd = h / 2 - 0.06, H1 = 2.9, H2 = 5.6;
      const red = { reg: 'plaster', tint: '#c0503a', eave: H2 }, trim = { reg: 'plaster', tint: '#f0e8d8' };
      const dcx = -w / 2 + door + 0.5;
      const winX = []; for (let i = 0; i < w; i++) winX.push(-w / 2 + i + 0.5);
      for (const sn of ['s', 'n', 'e', 'w']) side(B, sn, hw, hd, (L) => {
        const xs = sn === 's' || sn === 'n' ? winX : Array.from({ length: h }, (_, i) => -h / 2 + i + 0.5);
        const lower = [], upper = [];
        for (const x of xs) {
          if (abs(x) > L / 2 - 0.4) continue;
          if (sn === 's' && abs(x - dcx) < 0.1) lower.push({ x0: x - 0.5, x1: x + 0.5, y0: 0, y1: 2.0, x, d: 1 });
          else lower.push({ x0: x - 0.2, x1: x + 0.2, y0: 1.2, y1: 1.85, x });
          upper.push({ x0: x - 0.26, x1: x + 0.26, y0: 3.55, y1: 4.55, x });
        }
        // battered plinth
        B.quad([-L / 2 - 0.12, 0, 0.12], [L / 2 + 0.12, 0, 0.12], [L / 2, 0.9, 0.0], [-L / 2, 0.9, 0.0], { reg: 'brickOld', tint: '#d0a090' });
        wall(B, L, 0.9, H2, 0.4, lower.concat(upper).map((q) => (q.d ? Object.assign({}, q, { y0: 0.89 }) : q)), Object.assign({}, red, { endL: true, endR: true }));
        wall(B, L, 0, 0.9, 0.42, lower.filter((q) => q.d).map((q) => Object.assign({}, q, { y0: -1 })), { reg: 'brickOld', tint: '#d0a090', endL: true, endR: true });
        for (const q of lower) {
          const ww0 = q.x1 - q.x0;
          archAt(B, q.x, ww0, q.y1, q.y1 + ww0 / 2, 0.4, Object.assign({}, red, { voussoir: 'plaster', voussoirTint: '#f0e8d8', key: true }));
          B.box(q.x, q.y1 + ww0 / 2, -0.2, ww0, 0.001, 0.4, red);
          if (q.d) doorAt(B, q.x, 0.98, 2.0, 0.4, { leaves: 'open', reg: 'doorPlank', lit, frameTint: '#2a1a12', depth: 1.4 });
          else windowAt(B, q.x, q.y0, ww0, q.y1 - q.y0, 0.4, { style: 'bars', lit: false, sillReg: 'plaster', sillTint: '#f0e8d8', barReg: 'iron', barTint: '#ffffff' });
        }
        for (const q of upper) {
          archAt(B, q.x, 0.52, 4.55, 4.81, 0.4, Object.assign({}, red, { voussoir: 'plaster', voussoirTint: '#f0e8d8', key: true }));
          windowAt(B, q.x, 3.55, 0.52, 1.0, 0.4, { style: 'grid', lit, frameTint: '#f0e8d8', sillReg: 'plaster', sillTint: '#f0e8d8' });
          const fp = []; for (let k = 0; k <= 8; k++) { const a = PI - (k / 8) * PI; fp.push([q.x + cos(a) * 0.2, 4.55 + sin(a) * 0.2, -0.2]); }
          B.fan([q.x, 4.53, -0.2], fp, lit ? { mat: 'glow', reg: 'latGrid', tint: [1.2, 0.8, 0.45] } : { reg: 'latGrid', tint: '#8a7a68' });
        }
        B.box(0, H1, 0.04, L + 0.08, 0.16, 0.12, trim);                        // string course
        B.box(0, H2 - 0.1, 0.06, L + 0.14, 0.2, 0.16, trim);                    // cornice
        for (const sx of [-1, 1]) for (let y = 0.9; y < H2 - 0.3; y += 0.36) B.box(sx * (L / 2 - 0.14), y, 0.015, ((y * 10) % 7 < 3.5 ? 0.36 : 0.26), 0.3, 0.05, trim); // quoins
      });
      B.box(0, H2 - 0.1, 0, 2 * hw - 0.6, 0.1, 2 * hd - 0.6, { reg: 'pave', tint: '#bcb4a6', skip: 'b', ao: false }); // roof terrace
      for (const sn of ['s', 'n', 'e', 'w']) side(B, sn, hw, hd, (L) => merlons(B, -L / 2 + 0.18, L / 2 - 0.18, H2 + 0.1, -0.15, red));
      // cannons on wooden carriages, a sentry box, the flag
      for (const sx of [-1, 1]) {
        const x = sx * min(1.2, hw - 0.8), z = hd - 0.75;
        B.box(x, H2, z, 0.42, 0.22, 0.6, { reg: 'grain', tint: '#5a3a22' });
        for (const s2 of [-1, 1]) { B.push().tr(x + s2 * 0.23, H2 + 0.12, z + 0.15).rz(PI / 2); B.cyl(0, -0.03, 0, 0.13, 0.13, 0.06, { reg: 'grain', tint: '#4a3020', seg: 10 }); B.pop(); }
        B.push().tr(x, H2 + 0.33, z).rx(PI / 2 - 0.12); B.cyl(0, -0.25, 0, 0.11, 0.08, 1.0, { reg: 'iron', mat: 'metal', tint: '#7a7470', seg: 10 }); B.pop();
      }
      B.box(-hw + 0.8, H2, -hd + 0.8, 0.8, 1.9, 0.8, { reg: 'plaster', tint: '#c0503a' });
      roof(B, { type: 'hip', hx: 0.6, hz: 0.6, xr: 0, cz: -hd + 0.8, yr: H2 + 2.5, ye: H2 + 1.85, tile: 'tileRed', rows: 3, thick: 0.06, caps: false, curve: 0.1 }).hx;
      B.push().tr(-hw + 0.8, 0, -hd + 0.8); B.rect(0, H2 + 0.9, 0.401, 0.4, 0.75, { mat: 'glow', reg: 'white', tint: [0.04, 0.03, 0.03] }); B.pop();
      B.cyl(hw - 0.7, H2, -hd + 0.7, 0.05, 0.04, 3.4, { reg: 'grain', tint: '#d8d0c0', seg: 8 });
      B.grid(lin01(6), lin01(3), (u, v) => [hw - 0.68 + u * 1.0, H2 + 3.3 - v * 0.62, -hd + 0.7], (u, v) => [u * 2, v], { mat: 'cloth', reg: 'clothRed', pivot: [hw - 0.68, H2 + 3.3, -hd + 0.7], phase: 0.7, face: [0, 0, 1], ao: false });
      lanternAt(B, dcx + 0.62, 2.0, hd + 0.18, { kind: 'white', lit, r: 0.1, h: 0.26, cord: 0.05, lightColor: '#ffc070' });
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // chikan_tower — 赤崁樓-inspired (not a copy): two pavilions on an old red-brick fort podium with an arched gate,
  // the front one a two-storey 重簷歇山 with a red-columned veranda, swallowtail ridges, dragons and a gourd
  // =================================================================================================
  han('chikan_tower', {
    door: (w) => floor((w - 1) / 2), resize: 'wh',
    build(B, c) {
      const { w, h, door, lit } = c, hw = w / 2 - 0.05, hd = h / 2 - 0.05, PH = 1.5;
      const dcx = -w / 2 + door + 0.5;
      // podium with arched gate passage & balustrade
      for (const sn of ['s', 'n', 'e', 'w']) side(B, sn, hw, hd, (L) => {
        const holes = sn === 's' ? [{ x0: dcx - 0.42, x1: dcx + 0.42, y0: 0, y1: 1.05 }] : [];
        wall(B, L, 0, PH, 0.5, holes, { reg: 'brickOld', tint: '#ffffff', endL: true, endR: true });
        if (sn === 's') { archAt(B, dcx, 0.84, 1.05, PH - 0.02, 0.5, { reg: 'brickOld', voussoir: 'brickOld', voussoirTint: '#c89080' }); voidBox(B, dcx - 0.42, dcx + 0.42, 0, 1.45, -0.5, 1.2, lit); }
        for (let x = -L / 2 + 0.1; x < L / 2; x += 0.22) B.box(x, PH, -0.06, 0.06, 0.45, 0.06, { reg: 'plaster', tint: '#e8e0d0' });
        B.box(0, PH + 0.45, -0.06, L, 0.07, 0.12, { reg: 'plaster', tint: '#f0e8dc' });
        B.box(0, PH - 0.14, 0.04, L + 0.04, 0.14, 0.1, { reg: 'granite', tint: '#d8d0c4' });
      });
      B.box(0, PH - 0.01, 0, 2 * hw - 0.9, 0.01, 2 * hd - 0.9, { reg: 'brickRed', tint: '#d09080', skip: 'b', ao: false });
      // rear pavilion (lower)
      const rz = -hd + 0.95;
      B.push().tr(0, PH, rz);
      side(B, 's', 1.6, 0.55, (L) => { wall(B, L, 0, 2.0, 0.12, [{ x0: -0.3, x1: 0.3, y0: 0, y1: 1.7 }], { reg: 'woodNeutral', tint: '#7a2a20', eave: 2.0 }); doorAt(B, 0, 0.6, 1.7, 0.12, { leaves: 'open', reg: 'doorRed', lit, depth: 0.6, threshold: false }); });
      for (const sn of ['n', 'e', 'w']) side(B, sn, 1.6, 0.55, (L) => wall(B, L, 0, 2.0, 0.12, [], { reg: 'woodNeutral', tint: '#7a2a20', endL: sn !== 'n', endR: sn !== 'n' }));
      const r2 = roof(B, { type: 'xieshan', hx: 2.05, hz: 1.0, xr: 1.45, v0: 0.45, yr: 3.15, ye: 1.95, curve: 0.5, lift: 0.3, kick: 0.15, tile: 'tileRed', rows: 6, gableReg: 'beamPaint' });
      ridge(B, ridgePath(r2, 1.45, 10, 0), { w: 0.16, h: 0.2, tint: '#a63f2c', ends: 'swallow', len: 0.45, rise: 0.4 });
      B.pop();
      // front pavilion: veranda columns, enclosed hall, lower eave, upper storey, top 歇山
      const fz = 0.45, fw = 1.75, fd = 0.85;
      B.push().tr(0, PH, fz);
      for (const sn of ['s', 'n', 'e', 'w']) side(B, sn, fw - 0.35, fd - 0.3, (L) => {
        const hs = sn === 's' ? [-0.85, 0, 0.85].map((x) => ({ x0: x - 0.3, x1: x + 0.3, y0: 0.15, y1: 1.85, x })) : [];
        wall(B, L, 0, 2.3, 0.12, hs, { reg: 'woodNeutral', tint: '#7a2a20', eave: 2.3, endL: sn !== 'n' && sn !== 's', endR: sn !== 'n' && sn !== 's' });
        for (const q of hs) windowAt(B, q.x, 0.15, 0.6, 1.7, 0.12, { style: 'turtle', lit, frameTint: '#4a1810', sill: false });
      });
      for (let i = 0; i <= 4; i++) for (const sz of [-1, 1]) columnAt(B, -fw + i * (2 * fw / 4), sz * fd, 0, 2.3, 0.09, { tint: '#b42a22' });
      for (const sx of [-1, 1]) for (const zz of [-fd / 2, fd / 2 - 0.01]) columnAt(B, sx * fw, zz, 0, 2.3, 0.09, { tint: '#b42a22' });
      B.box(0, 2.1, fd, 2 * fw + 0.2, 0.22, 0.12, { reg: 'beamPaint', ao: false });
      for (const sx of [-1, 1]) lanternAt(B, sx * (fw - 0.5), 1.55, fd + 0.05, { lit, r: 0.15, cord: 0.25 });
      roof(B, { type: 'hip', hx: fw + 0.5, hz: fd + 0.5, xr: fw - 0.7, yr: 3.1, ye: 2.2, curve: 0.45, lift: 0.3, kick: 0.15, tile: 'tileRed', rows: 5, thick: 0.08 });
      side(B, 's', fw - 0.55, fd - 0.45, (L) => { wall(B, L, 2.5, 3.85, 0.1, [-0.7, 0, 0.7].map((x) => ({ x0: x - 0.22, x1: x + 0.22, y0: 2.8, y1: 3.5, x })), { reg: 'woodNeutral', tint: '#7a2a20' }); for (const x of [-0.7, 0, 0.7]) { const ring = []; for (let k = 0; k <= 12; k++) { const a = (k / 12) * TAU; ring.push([x + cos(a) * 0.2, 3.15 + sin(a) * 0.2, -0.03]); } B.fan([x, 3.15, -0.03], ring, lit ? { mat: 'glow', reg: 'latTurtle', tint: [1.1, 0.75, 0.4] } : { reg: 'latTurtle', tint: '#7a6050' }); } });
      for (const sn of ['n', 'e', 'w']) side(B, sn, fw - 0.55, fd - 0.45, (L) => wall(B, L, 2.5, 3.85, 0.1, [], { reg: 'woodNeutral', tint: '#7a2a20', endL: sn !== 'n', endR: sn !== 'n' }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * (fw - 0.55), 2.5, sz * (fd - 0.45), 0.12, 1.35, 0.12, { reg: 'grain', mat: 'gloss', tint: '#b42a22' });
      const top = roof(B, { type: 'xieshan', hx: fw + 0.25, hz: fd + 0.3, xr: fw - 0.55, v0: 0.42, yr: 5.0, ye: 3.7, curve: 0.55, lift: 0.38, kick: 0.2, tile: 'tileRed', rows: 7, gableReg: 'beamPaint' });
      ridge(B, ridgePath(top, fw - 0.5, 12, 0), { w: 0.18, h: 0.24, tint: '#a63f2c', ends: 'swallow', len: 0.6, rise: 0.55, band: 'porcelain', bandFrom: 2, bandTo: 2 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ridge(B, top.hipLine(sx, sz, 6).map((p) => [p[0], p[1] + 0.03, p[2]]), { w: 0.12, h: 0.15, tint: '#a63f2c', ends: [null, 'curl'], len: 0.35, rise: 0.35 });
      ridgeCrown(B, 0, top.ridgeY(0) + 0.24, 0, 0.75, 0.75, { center: 'gourd' });
      B.pop();
      // front steps up to the terrace (side stair against the podium)
      if (lit) B.light(dcx, 0.8, hd - 0.6, '#ff9a50', 0.5, 3, 0.2);
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 七娘媽亭 qixi_pavilion — the paper pavilion offered at a 做十六歲 coming-of-age: three tiers of bright paper on a
  // red offering table with an embroidered skirt, flowers, fruit, candles (lights) and incense
  // =================================================================================================
  han('qixi_pavilion', {
    build(B, c) {
      const { lit } = c, tw = 1.7, td = 1.1, th = 0.86;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * (tw / 2 - 0.06), 0, sz * (td / 2 - 0.06), 0.07, th, 0.07, { reg: 'grain', tint: '#6a3420' });
      B.box(0, th - 0.06, 0, tw, 0.06, td, { reg: 'grain', mat: 'gloss', tint: '#8a3a22' });
      B.grid(lin01(10), lin01(3), (u, v) => [lerp(-tw / 2 - 0.01, tw / 2 + 0.01, u), lerp(th - 0.04, 0.05, v), td / 2 + 0.015 + sin(u * PI * 9) * 0.008 * v], (u, v) => [u * 3, v * 1.4], { mat: 'cloth', reg: 'embroid', pivot: [0, th, td / 2 + 0.02], phase: 0.3, face: [0, 0, 1], ao: false }); // 桌裙
      // paper pavilion: base, three tiers with little roofs, flags
      const px = 0, pz = -0.12;
      let y = th;
      B.box(px, y, pz, 0.78, 0.12, 0.6, { reg: 'paperColor', tint: '#ffffff' }); y += 0.12;
      const tiers = [[0.62, 0.42, 0.45], [0.48, 0.34, 0.36], [0.34, 0.26, 0.3]];
      tiers.forEach(([ww, dd, hh], i) => {
        B.box(px, y, pz, ww, hh, dd, { reg: 'paperColor', tint: '#ffffff', ao: false });
        for (const sx of [-1, 1]) B.box(px + sx * ww / 2, y, pz + dd / 2, 0.035, hh, 0.035, { reg: 'gold', mat: 'metal', ao: false });
        B.rect(px, y + hh / 2, pz + dd / 2 + 0.002, ww * 0.42, hh * 0.7, { mat: 'glow', reg: 'latGrid', tint: lit ? [1.2, 0.9, 0.6] : [0.5, 0.45, 0.4] });
        const rr0 = roof(B, { type: 'hip', hx: ww / 2 + 0.1, hz: dd / 2 + 0.1, xr: i === 2 ? 0 : ww / 4, cz: pz, yr: y + hh + 0.16, ye: y + hh - 0.02, curve: 0.3, lift: 0.07, kick: 0.04, tile: 'tileGreen', tint: ['#ffa0b0', '#a0c8ff', '#ffe080'][i], mat: 'gloss', corr: 'flat', rows: 2, thick: 0.03, caps: false, soffit: false });
        void rr0; y += hh + 0.14;
      });
      gourdAt(B, px, y - 0.04, pz, 0.35);
      for (const sx of [-1, 1]) { B.cyl(px + sx * 0.42, th + 0.12, pz, 0.008, 0.008, 0.8, { reg: 'white', tint: '#e8d8a0', seg: 4 }); B.grid(lin01(3), lin01(2), (u, v) => [px + sx * (0.42 + u * 0.22), th + 0.9 - v * 0.15 - u * 0.04, pz], (u, v) => [u, v], { mat: 'cloth', reg: 'clothRed', tint: sx > 0 ? '#ffe080' : '#ffffff', pivot: [px + sx * 0.42, th + 0.9, pz], phase: sx, face: [0, 0, 1], ao: false }); }
      // offerings: flower vases, fruit plates, candles, incense burner
      for (const sx of [-1, 1]) {
        B.lathe(sx * 0.62, th, 0.18, [[0.05, 0], [0.08, 0.06], [0.05, 0.16], [0.04, 0.2], [0.06, 0.24]], { reg: 'white', mat: 'gloss', tint: '#e8eef4', seg: 8 });
        for (let k = 0; k < 6; k++) B.lathe(sx * 0.62 + cos(k) * 0.06, th + 0.24 + (k % 3) * 0.04, 0.18 + sin(k) * 0.06, [[0.0, 0], [0.04, 0.01], [0.0, 0.05]], { reg: 'white', tint: ['#e84a6a', '#f8d040', '#ffffff'][k % 3], seg: 6 });
        B.cyl(sx * 0.32, th, 0.3, 0.12, 0.08, 0.03, { reg: 'white', mat: 'gloss', tint: '#f0f0e8', seg: 12 });
        for (let k = 0; k < 4; k++) B.lathe(sx * 0.32 + cos(k * 1.6) * 0.05, th + 0.03, 0.3 + sin(k * 1.6) * 0.05, [[0.0, 0], [0.05, 0.03], [0.0, 0.07]], { reg: 'white', tint: sx > 0 ? '#f0a020' : '#d83a2a', seg: 8 });
        B.cyl(sx * 0.78, th, td / 2 - 0.12, 0.025, 0.025, 0.24, { reg: 'white', tint: '#c42a1f', seg: 8 });
        if (lit) B.lathe(sx * 0.78, th + 0.24, td / 2 - 0.12, [[0.012, 0], [0.018, 0.02], [0.0, 0.07]], { mat: 'sway', reg: 'white', tint: [3, 2, 0.7], pivot: [sx * 0.78, th + 0.24, td / 2 - 0.12], phase: sx * 2, seg: 6 });
        if (lit) B.light(sx * 0.78, th + 0.4, td / 2 - 0.12, '#ffb060', 0.7, 2.5, 0.6);
      }
      B.lathe(0, th, 0.32, [[0.0, 0], [0.08, 0.01], [0.1, 0.06], [0.09, 0.1], [0.0, 0.1]], { reg: 'bronze', mat: 'metal', seg: 10 });
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // 炮城 firecracker_tower — 鹽水蜂炮 rocket fortress on a cart: timber frame packed with bottle rockets (thousands
  // of red tube ends), a 炮城 banner, two-tier gilded roof; sparks spit out unless o.lit === false
  // =================================================================================================
  const SPARKS = 70;
  han('firecracker_tower', {
    key: (o) => o.text || '',
    build(B, c) {
      const fw = 1.6, fd = 0.62, y0 = 0.62, fh = 1.55;
      // cart
      B.box(0, 0.42, 0, 1.9, 0.14, 0.86, { reg: 'grain', tint: '#5a3a22' });
      for (const sx of [-0.7, 0.7]) for (const sz of [-1, 1]) {
        B.push().tr(sx, 0.3, sz * 0.47).rx(PI / 2);
        B.cyl(0, -0.04, 0, 0.3, 0.3, 0.08, { reg: 'grain', tint: '#3a2616', seg: 14 });
        B.pop();
        for (let k = 0; k < 4; k++) { B.push().tr(sx, 0.3, sz * 0.5).rz(k * PI / 4); B.box(0, -0.27, 0, 0.03, 0.54, 0.03, { reg: 'grain', tint: '#7a5a3a' }); B.pop(); }
      }
      B.box(0, 0.62, 0.52, 2.0, 0.08, 0.08, { reg: 'grain', mat: 'gloss', tint: '#b8302a' }); // front crossbar
      // rocket rack: framed box whose faces are packed with tube ends
      B.box(0, y0, 0, fw, fh, fd, { reg: 'rockets', tint: '#ffffff', skip: 'b', size: 0.25 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * (fw / 2 + 0.03), y0, sz * (fd / 2 + 0.03), 0.08, fh + 0.06, 0.08, { reg: 'grain', mat: 'gloss', tint: '#a8281e' });
      for (const yy of [y0, y0 + fh / 2, y0 + fh]) for (const sz of [-1, 1]) B.box(0, yy - 0.03, sz * (fd / 2 + 0.03), fw + 0.1, 0.06, 0.06, { reg: 'grain', mat: 'gloss', tint: '#a8281e' });
      // banner board, roof tiers, gourd, tassels
      const by = y0 + fh + 0.05;
      plaqueAt(B, 0, by + 0.2, fd / 2 + 0.05, 0.9, 0.34, c.text || '炮城', { bg: '#c8281e', fg: '#ffe7a0', rim: '#e0b048', ppm: 300 });
      const r1 = roof(B, { type: 'hip', hx: 1.05, hz: 0.55, xr: 0.55, yr: by + 0.65, ye: by + 0.38, curve: 0.4, lift: 0.12, kick: 0.06, tile: 'tileOrange', tint: '#ffd890', mat: 'gloss', rows: 3, thick: 0.05, caps: false });
      B.box(0, by + 0.5, 0, 0.6, 0.25, 0.32, { reg: 'grain', mat: 'gloss', tint: '#c8281e' });
      roof(B, { type: 'hip', hx: 0.55, hz: 0.32, xr: 0.0, yr: by + 1.1, ye: by + 0.72, curve: 0.4, lift: 0.08, kick: 0.04, tile: 'tileOrange', tint: '#ffd890', mat: 'gloss', rows: 3, thick: 0.05, caps: false });
      gourdAt(B, 0, by + 1.06, 0, 0.45);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = r1.surf(sx * 1.05, sz * 0.55, 1); B.cyl(p[0], p[1] - 0.28, p[2], 0.02, 0.04, 0.26, { mat: 'cloth', reg: 'clothRed', pivot: [p[0], p[1], p[2]], phase: sx + sz * 2, seg: 6 }); }
      if (c.lit) { for (const sz of [1, -1]) B.light(0, y0 + fh / 2, sz * 1.2, '#ffb050', 1.4, 5, 0.9); }
    },
    post(g, c) { // spark particles (animated in update)
      if (!c.lit) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
      const m = new THREE.PointsMaterial({ color: 0xffc860, size: 0.16, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      const pts = new THREE.Points(geo, m); pts.name = 'sparks'; pts.frustumCulled = false; pts.userData.noMerge = true;
      g.add(pts);
    },
    update(node, o, t) {
      tick(t);
      const sp = node.getObjectByName('sparks');
      if (!sp) return;
      const a = sp.geometry.attributes.position, R = mulberry(7);
      for (let i = 0; i < SPARKS; i++) {
        const sd = R(), life = 0.55 + R() * 0.5, ph = ((t * (0.9 + sd)) / life + R()) % 1, tt = ph * life;
        const ang = R() * TAU, up = 0.6 + R() * 2.2, sp0 = 2.5 + R() * 4;
        const fx = (R() - 0.5) * 1.5, fy = 0.65 + R() * 1.5, sz = R() < 0.5 ? 1 : -1;
        a.setXYZ(i, fx + cos(ang) * sp0 * tt * 0.6, fy + up * tt - 4.9 * tt * tt, sz * (0.3 + sp0 * tt) + sin(ang) * 0.3 * tt);
      }
      a.needsUpdate = true;
    },
  });

  // =================================================================================================
  // 神轎 palanquin — gilded god's sedan: carved red-and-gold cabin with a closed embroidered curtain (the deity is
  // never shown), two-tier golden roof with upswept corners and a gourd, carrying poles. Sways like it is being
  // carried unless o.still (then it rests on two trestles)
  // =================================================================================================
  han('palanquin', {
    key: () => '',
    build(B, c) {
      const py = 0.62;
      for (const sz of [-1, 1]) { B.box(0, 0, sz * 0.75, 1.3, 0.08, 0.1, { reg: 'grain', tint: '#5a3a22' }); for (const sx of [-1, 1]) B.box(sx * 0.6, 0, sz * 0.75, 0.08, 0.55, 0.08, { reg: 'grain', tint: '#5a3a22' }); B.box(0, 0.5, sz * 0.75, 1.3, 0.08, 0.14, { reg: 'grain', tint: '#6a4a2a' }); }
      for (const sx of [-1, 1]) B.box(sx * 0.48, py, 0, 0.09, 0.1, 2.5, { reg: 'grain', mat: 'gloss', tint: '#b8302a' }); // carrying poles
      for (const sz of [-1, 1]) B.box(0, py, sz * 1.15, 1.06, 0.08, 0.08, { reg: 'grain', mat: 'gloss', tint: '#b8302a' });
      const cy = py + 0.08;
      B.box(0, cy, 0, 0.95, 0.22, 0.95, { reg: 'grain', mat: 'gloss', tint: '#b8302a' });
      B.box(0, cy + 0.22, 0, 0.98, 0.05, 0.98, { reg: 'gold', mat: 'metal' });
      const bh = 1.05, by = cy + 0.27;
      for (const sn of ['n', 'e', 'w']) side(B, sn, 0.42, 0.42, (L) => { B.box(0, by, -0.03, L, bh, 0.06, { reg: 'gold', mat: 'metal' }); B.rect(0, by + bh / 2, 0.005, L * 0.7, bh * 0.6, { reg: 'embroid', decalUV: false, uvAxis: true }); });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * 0.42, by, sz * 0.42, 0.08, bh, 0.08, { reg: 'grain', mat: 'gloss', tint: '#c03028' });
      // front: carved gilded frame and a closed curtain
      B.box(0, by + bh - 0.2, 0.42, 0.84, 0.2, 0.06, { reg: 'gold', mat: 'metal' });
      B.grid(lin01(6), lin01(3), (u, v) => [lerp(-0.36, 0.36, u), lerp(by + bh - 0.2, by + 0.04, v), 0.41 + sin(u * PI * 6) * 0.012], (u, v) => [u * 1.2, v * 1.6], { mat: 'cloth', reg: 'embroid', pivot: [0, by + bh - 0.2, 0.41], phase: 1.1, face: [0, 0, 1], ao: false });
      // roofs
      const ry = by + bh;
      B.box(0, ry, 0, 0.96, 0.08, 0.96, { reg: 'grain', mat: 'gloss', tint: '#c03028' });
      roof(B, { type: 'hip', hx: 0.72, hz: 0.72, xr: 0.0, yr: ry + 0.52, ye: ry + 0.08, curve: 0.5, lift: 0.14, kick: 0.07, tile: 'tileOrange', tint: '#ffd070', mat: 'metal', rows: 4, thick: 0.05, caps: false });
      B.box(0, ry + 0.3, 0, 0.44, 0.22, 0.44, { reg: 'gold', mat: 'metal' });
      const r2 = roof(B, { type: 'hip', hx: 0.42, hz: 0.42, xr: 0.0, yr: ry + 0.95, ye: ry + 0.52, curve: 0.5, lift: 0.1, kick: 0.05, tile: 'tileOrange', tint: '#ffd070', mat: 'metal', rows: 3, thick: 0.04, caps: false });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) ridge(B, r2.hipLine(sx, sz, 4).map((p) => [p[0], p[1] + 0.02, p[2]]), { w: 0.05, h: 0.06, reg: 'gold', mat: 'metal', ends: [null, 'curl'], len: 0.12, rise: 0.14 });
      gourdAt(B, 0, ry + 0.92, 0, 0.42);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.cyl(sx * 0.62, ry - 0.2, sz * 0.62, 0.015, 0.035, 0.22, { mat: 'cloth', reg: 'clothRed', pivot: [sx * 0.62, ry + 0.06, sz * 0.62], phase: sx * 3 + sz, seg: 6 });
    },
    update(node, o, t) {
      tick(t);
      if (o.still) return;
      const ph = t * 2.4 + (o.x || 0) * 0.7;
      node.rotation.z = sin(ph) * 0.035;
      node.position.y = abs(sin(ph)) * 0.035;
    },
  });

  // =================================================================================================
  // granary — raised storehouse on posts with stone rat-guards, woven walls, a hatch, a notched log ladder and a
  // steep thatched roof (Indigenous / hill-farm type; a coastal-team model may override this one)
  // =================================================================================================
  han('granary', {
    build(B) {
      const fy = 1.0;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B.cyl(sx * 0.62, 0, sz * 0.55, 0.08, 0.07, fy, { reg: 'grain', tint: '#6a4a30', seg: 8 });
        B.lathe(sx * 0.62, fy - 0.2, sz * 0.55, [[0.08, 0], [0.24, 0.05], [0.26, 0.09], [0.08, 0.12]], { reg: 'granite', tint: '#b8b0a0', seg: 12 }); // rat guard
      }
      B.box(0, fy - 0.08, 0, 1.6, 0.12, 1.45, { reg: 'grain', tint: '#5a3e28' });
      B.box(0, fy + 0.04, 0, 1.46, 1.05, 1.3, { reg: 'weave', tint: '#ffffff' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(sx * 0.74, fy + 0.04, sz * 0.66, 0.08, 1.05, 0.08, { reg: 'grain', tint: '#4a3422' });
      B.box(0, fy + 0.25, 0.655, 0.44, 0.5, 0.03, { reg: 'woodV', tint: '#a08060' });
      B.box(0, fy + 0.5, 0.67, 0.5, 0.03, 0.02, { reg: 'grain', tint: '#2a1a10' });
      B.push().tr(0.05, 0, 0.95).rx(-0.33);
      B.cyl(0, 0, 0, 0.07, 0.06, 1.3, { reg: 'grain', tint: '#8a6a46', seg: 8 });
      for (let y = 0.2; y < 1.2; y += 0.22) B.box(0, y, 0.06, 0.14, 0.03, 0.04, { reg: 'grain', tint: '#2a1a10' });
      B.pop();
      const rf = roof(B, { type: 'gable', hx: 1.05, hz: 1.0, yr: fy + 2.3, ye: fy + 0.95, curve: 0.1, tile: 'thatch', corr: 'flat', thick: 0.22, rows: 4, vergeReg: 'thatch', vergeTint: '#c8b080', soffitTint: '#8a7050' });
      ridge(B, ridgePath(rf, 1.0, 6, 0.04), { w: 0.32, h: 0.16, reg: 'thatch', tint: '#a08850' });
      for (let x = -0.85; x <= 0.86; x += 0.34) B.push().tr(x, rf.ridgeY(x) + 0.12, 0).rx(PI / 2), B.cyl(0, -0.3, 0, 0.018, 0.018, 0.6, { reg: 'bamboo', seg: 5 }), B.pop(); // ridge pins
    },
  });

  // =================================================================================================
  // 石板屋 slate_house — Paiwan/Rukai slate house (not Han; built here so the type is covered — a coastal-team model
  // may override it): stacked slate walls, low heavy slab roof, carved posts & lintel with red/white motifs at the door,
  // hearth glow, woodpile, slab-paved yard
  // =================================================================================================
  han('slate_house', {
    resize: 'w', door: 1,
    build(B, c) {
      const { w, h, door, lit } = c, hw = w / 2 - 0.05, hd = h / 2 - 0.1, eh = 1.85;
      const dcx = door >= 0 ? -w / 2 + door + 0.5 : null;
      const so = { reg: 'slateWall', tint: '#ffffff', eave: eh };
      side(B, 's', hw, hd, (L) => {
        const holes = []; if (dcx != null) holes.push({ x0: dcx - 0.36, x1: dcx + 0.36, y0: 0, y1: 1.45 });
        for (let i = 0; i < w; i++) { const x = -w / 2 + i + 0.5; if (i !== door && (i + w) % 2 === 0) holes.push({ x0: x - 0.22, x1: x + 0.22, y0: 0.9, y1: 1.25, x, win: 1 }); }
        wall(B, L, 0, eh, 0.45, holes, so);
        for (const q of holes) if (q.win) { B.box(q.x, 1.25, 0.03, 0.6, 0.06, 0.08, { reg: 'grain', tint: '#4a3220' }); voidBox(B, q.x0, q.x1, 0.9, 1.25, -0.45, 0.4, lit, [0.42, 0.2, 0.08]); }
        if (dcx != null) {
          voidBox(B, dcx - 0.36, dcx + 0.36, 0, 1.45, -0.45, 1.3, lit, [0.55, 0.24, 0.07]);
          const motif = (g, W, H) => { g.fillStyle = '#6a4a32'; g.fillRect(0, 0, W, H); for (let y = 6; y < H - 10; y += 24) { g.fillStyle = '#e8e0cc'; g.beginPath(); g.moveTo(W / 2, y); g.lineTo(W - 4, y + 10); g.lineTo(W / 2, y + 20); g.lineTo(4, y + 10); g.fill(); g.fillStyle = '#a8322a'; ell(g, W / 2, y + 10, 4, 4); g.fill(); } g.strokeStyle = 'rgba(30,20,10,0.6)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2); };
          for (const sx of [-1, 1]) {
            const uv = B.decal(40, 220, motif);
            B.box(dcx + sx * 0.45, 0, 0.06, 0.18, 1.55, 0.12, { reg: 'grain', tint: '#5a3e28' });
            B.quad([dcx + sx * 0.45 - 0.08, 0.05, 0.121], [dcx + sx * 0.45 + 0.08, 0.05, 0.121], [dcx + sx * 0.45 + 0.08, 1.5, 0.121], [dcx + sx * 0.45 - 0.08, 1.5, 0.121], { mat: 'decal' }, uv);
          }
          const zz = B.decal(300, 50, (g, W, H) => { g.fillStyle = '#6a4a32'; g.fillRect(0, 0, W, H); for (let k = 0; k < 10; k++) { g.fillStyle = k % 2 ? '#a8322a' : '#e8e0cc'; g.beginPath(); g.moveTo(k * W / 10, H - 6); g.lineTo((k + 0.5) * W / 10, 6); g.lineTo((k + 1) * W / 10, H - 6); g.fill(); } });
          B.box(dcx, 1.55, 0.06, 1.15, 0.22, 0.12, { reg: 'grain', tint: '#5a3e28' });
          B.quad([dcx - 0.56, 1.56, 0.121], [dcx + 0.56, 1.56, 0.121], [dcx + 0.56, 1.76, 0.121], [dcx - 0.56, 1.76, 0.121], { mat: 'decal' }, zz);
          B.light(dcx, 0.6, -0.4, '#ff9a40', lit ? 0.8 : 0, 3, 0.45);
        }
      });
      for (const sn of ['n', 'e', 'w']) side(B, sn, hw, hd, (L) => wall(B, L, 0, eh, 0.45, [], Object.assign({}, so, { endL: sn !== 'n', endR: sn !== 'n' })));
      const rf = roof(B, { type: 'gable', hx: hw + 0.18, hz: hd + 0.32, yr: eh + 0.85, ye: eh - 0.05, curve: 0.05, tile: 'slateRoof', corr: 'flat', thick: 0.16, rows: 4, vergeReg: 'slateRoof', vergeTint: '#9a9c98', soffitTint: '#4a4a46' });
      for (const sx of [-1, 1]) { const prof = rf.profile(sx * hw, 10, true).map((p) => [sx * hw, p[1], p[2]]).filter((p) => p[1] > eh && abs(p[2]) < hd); if (prof.length > 2) B.fan([sx * hw, eh, 0], sx > 0 ? prof.slice().reverse() : prof, { reg: 'slateWall', ao: false }); }
      ridge(B, ridgePath(rf, hw + 0.15, 6, 0.02), { w: 0.4, h: 0.08, reg: 'slateRoof', tint: '#b0b2ae' });
      // slab yard and woodpile
      B.box(0, 0, hd + 0.35, w - 0.1, 0.05, 0.5, { reg: 'slateRoof', tint: '#c0c2be', skip: 'b' });
      const wx = door === w - 1 ? -hw + 0.5 : hw - 0.5;
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) { B.push().tr(wx - 0.3 + k * 0.17 + r * 0.085, 0.09 + r * 0.15, hd + 0.3).rx(PI / 2); B.cyl(0, -0.25, 0, 0.08, 0.08, 0.5, { reg: 'grain', tint: '#9a7a52', seg: 7 }); B.pop(); }
    },
  });

  // =================================================================================================
  // 燈篙 c10_denggao — 中元 lantern pole that calls the wandering spirits: stone-piled foot, tall bamboo with nodes,
  // a crossbar hung with lanterns, a leafy top; o.blue → ghost-blue light; o.name → a name lantern lower down
  // =================================================================================================
  han('c10_denggao', {
    key: (o) => (o.blue ? 'b' : '') + '|' + (o.name || ''),
    build(B, c) {
      const blue = !!c.o.blue, H = 6.2;
      for (let k = 0; k < 7; k++) { const a = k * 0.9, r = k < 5 ? 0.24 : 0.1; B.lathe(cos(a) * r, (k >= 5 ? 0.14 : 0) - 0.02, sin(a) * r, [[0.15, 0], [0.16, 0.06], [0.1, 0.15], [0.0, 0.17]], { reg: 'rubble', seg: 7, a0: a }); }
      B.cyl(0, 0, 0, 0.055, 0.045, H, { reg: 'bamboo', seg: 8, size: 1, caps: false });
      for (let y = 0.4; y < H; y += 0.42) B.cyl(0, y, 0, 0.062, 0.062, 0.03, { reg: 'white', tint: '#c8c890', seg: 8 });
      B.push().tr(0, H - 0.35, 0).rz(PI / 2); B.cyl(0, -0.48, 0, 0.03, 0.03, 0.96, { reg: 'bamboo', seg: 6 }); B.pop();
      for (let k = 0; k < 6; k++) { B.push().tr(0, H - 0.05, 0).ry(k * 1.05).rz(0.5 + (k % 2) * 0.3); B.box(0, 0, 0, 0.08, 0.5, 0.015, { reg: 'white', tint: '#5a8a3a', ao: false }); B.pop(); }
      for (const [dx, k] of [[-0.44, 0], [0.44, 1]]) lanternAt(B, dx, H - 0.72, 0, { kind: blue ? 'blue' : k ? 'red' : 'white', r: 0.15, h: 0.36, cord: 0.12, lightColor: blue ? '#8ab8ff' : '#ffcf7a', intensity: 1.2, dist: 6, glow: 1.9 });
      if (c.o.name) lanternAt(B, 0.0, H - 2.0, 0.08, { kind: 'red', r: 0.17, h: 0.42, cord: 0.15, glow: 1.9 });
    },
    update(node, o, t) { tick(t); },
  });

  // expose for tests / other teams
  G.ArchHan = { Bld, roof, ridge, wall, side, windowAt, doorAt, columnAt, dragonColumn, lanternAt, plaqueAt, paperAt, steps, plinth, atlas, region, REG, AT };
})();

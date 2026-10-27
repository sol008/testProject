// 彼岸燈 Shorelight — battle monsters, part 3 (regional roster). Procedural Canvas 2D, painterly-vector look.
// Registers into G.Monsters (js/gfx/registry.js). See docs/CONTRACTS.md "Monsters" / "Monsters (regional)".
//
//   G.Monsters.define(id, { w, h, draw(ctx, x, y, t, o) })
//   x, y = FEET centre (bottom-centre), drawn upward; every monster faces RIGHT.
//   o.state: 'idle' | 'attack' | 'hurt' | 'cast' | 'dead'   o.st: seconds since state began
//   o.variant: 0 | 1 | 2 (palette swap)                     o.phase: 1 | 2 | 3 (bosses)
//
// Ids: wind_demon 風魔 (boss), wind_sprite 九降風精, mountain_ghost 山鬼, plague_ghost 瘟鬼, greed_ghost 貪鬼,
//      moray 海鰻精, fallwind 落山風靈 (boss), sea_monster 海妖, cliff_spirit 斷崖石靈, hungry_ghost 孤魂,
//      pirate_ghost 海盜鬼, gorge_colossus (boss), tide_serpent (boss).
// Static parts (heads, lanterns, bowls, blades, stone blocks…) are pre-rendered once into offscreen canvases
// keyed by id/variant/phase/G.S and blitted; only animated pieces (wind, tubes, limbs, glows) are drawn live.
// Everything lives inside this IIFE so helper names never clash with the other monster modules.
'use strict';
(() => {
  const U = G.U;
  const { clamp, lerp } = U;
  const rgba = U.rgba, shade = U.shade, mix = U.mix;
  const { sin, cos, abs, min, max, PI, atan2, hypot, floor, pow, sqrt } = Math;
  const TAU = PI * 2;
  const EASE = U.ease;

  // =============================================================================================
  // Cache & sprite helpers
  // =============================================================================================
  const CACHE = {};
  // offscreen sprite: fn(g) draws with the origin at anchor (ax, ay)
  function spr(key, w, h, ax, ay, fn) {
    const k = key + '|' + G.S;
    let c = CACHE[k];
    if (!c) {
      c = U.makeCanvas(w, h);
      const g = c.getContext('2d');
      g.translate(ax, ay);
      g.lineJoin = 'round'; g.lineCap = 'round';
      fn(g);
      c.ax = ax; c.ay = ay;
      CACHE[k] = c;
    }
    return c;
  }
  function put(ctx, s, x = 0, y = 0, sc = 1, rot = 0, sy = null) {
    if (!rot && sy == null) { ctx.drawImage(s, x - s.ax * sc, y - s.ay * sc, s.lw * sc, s.lh * sc); return; }
    const ky = sy == null ? sc : sy;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(s, -s.ax * sc, -s.ay * ky, s.lw * sc, s.lh * ky);
    ctx.restore();
  }
  function glowSpr(col) {
    return spr('m3glow:' + col, 128, 128, 64, 64, (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64);
      gr.addColorStop(0, rgba(col, 1));
      gr.addColorStop(0.18, rgba(col, 0.6));
      gr.addColorStop(0.45, rgba(col, 0.2));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
    });
  }
  // additive soft glow
  function glow(ctx, x, y, r, col, a = 1) {
    if (a <= 0.003 || r <= 0) return;
    const s = glowSpr(col);
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * min(1, a);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  // normal-blend soft puff (mist, dust, miasma)
  function puff(ctx, x, y, r, col, a = 1) {
    if (a <= 0.003 || r <= 0) return;
    const s = glowSpr(col);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * min(1, a);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
  }

  // =============================================================================================
  // Path & paint helpers
  // =============================================================================================
  function smooth(pts, closed = true, p = new Path2D()) {
    const n = pts.length;
    const get = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
    p.moveTo(pts[0][0], pts[0][1]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      p.bezierCurveTo(
        p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
        p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
        p2[0], p2[1]);
    }
    if (closed) p.closePath();
    return p;
  }
  function poly(pts, p = new Path2D()) {
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }
  // ragged / tufted silhouette: subdivide polygon, push alternate points outward
  function tufted(pts, amp, sub = 3, seed = 1) {
    const out = [];
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      for (let k = 0; k < sub; k++) {
        const f = k / sub;
        let x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f);
        if (k % 2 === 1 || sub === 1) {
          const dx = x - cx, dy = y - cy, L = hypot(dx, dy) || 1;
          const m = amp * (0.6 + U.hash(i, k, seed) * 0.8);
          x += (dx / L) * m; y += (dy / L) * m;
        }
        out.push([x, y]);
      }
    }
    const p = new Path2D();
    const m0 = [(out[0][0] + out[out.length - 1][0]) / 2, (out[0][1] + out[out.length - 1][1]) / 2];
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      p.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    p.closePath();
    return p;
  }
  function pal(base, rim, k = {}) {
    return {
      b: base, l: k.l || shade(base, 0.32), d: k.d || shade(base, -0.45),
      o: k.o || shade(base, -0.62), rim: rim || null, hl: k.hl || '#ffffff',
    };
  }
  // painterly fill: key-light diagonal gradient, inner rim (bottom-right), top-left highlight, coloured outline
  function paint(ctx, path, x, y, w, h, c, o = {}) {
    const g = ctx.createLinearGradient(x + w * 0.15, y, x + w * 0.85, y + h);
    g.addColorStop(0, c.l); g.addColorStop(o.mid ?? 0.45, c.b); g.addColorStop(1, c.d);
    ctx.fillStyle = g; ctx.fill(path);
    if (c.rim || (o.hl ?? 0.3) > 0) {
      ctx.save(); ctx.clip(path);
      if (o.inside) o.inside(ctx);
      if (c.rim) {
        const rg = ctx.createLinearGradient(x, y, x + w, y + h);
        rg.addColorStop(0.5, rgba(c.rim, 0)); rg.addColorStop(1, rgba(c.rim, o.rimA ?? 0.85));
        ctx.lineWidth = o.rimW ?? 6; ctx.strokeStyle = rg; ctx.stroke(path);
      }
      if ((o.hl ?? 0.3) > 0) {
        const hg = ctx.createLinearGradient(x, y, x + w * 0.7, y + h * 0.7);
        hg.addColorStop(0, rgba(c.hl, o.hl ?? 0.3)); hg.addColorStop(0.45, rgba(c.hl, 0));
        ctx.lineWidth = o.hlW ?? 5; ctx.strokeStyle = hg; ctx.stroke(path);
      }
      ctx.restore();
    }
    if (o.lw !== 0) {
      ctx.lineWidth = o.lw ?? 2; ctx.strokeStyle = o.ol || c.o; ctx.stroke(path);
    }
  }
  function capsule(x1, y1, x2, y2, r1, r2, p = new Path2D()) {
    const a = atan2(y2 - y1, x2 - x1);
    p.arc(x2, y2, r2, a - PI / 2, a + PI / 2);
    p.arc(x1, y1, r1, a + PI / 2, a + PI * 1.5);
    p.closePath();
    return p;
  }
  function limb(ctx, x1, y1, x2, y2, r1, r2, c, lw = 1.8) {
    const p = capsule(x1, y1, x2, y2, r1, r2);
    const dx = x2 - x1, dy = y2 - y1, L = hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, r = max(r1, r2);
    const g = ctx.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
    g.addColorStop(0, c.l); g.addColorStop(0.42, c.b); g.addColorStop(1, c.d);
    ctx.fillStyle = g; ctx.fill(p);
    if (c.rim) {
      ctx.save(); ctx.clip(p);
      ctx.strokeStyle = rgba(c.rim, 0.7); ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x1 - nx * r1 * 0.85, y1 - ny * r1 * 0.85); ctx.lineTo(x2 - nx * r2 * 0.85, y2 - ny * r2 * 0.85);
      ctx.stroke(); ctx.restore();
    }
    if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = c.o; ctx.stroke(p); }
    return p;
  }
  function ball(ctx, x, y, r, c, o = {}) {
    const p = new Path2D(); p.ellipse(x, y, r * (o.sx || 1), r * (o.sy || 1), o.rot || 0, 0, TAU);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    g.addColorStop(0, c.l); g.addColorStop(0.55, c.b); g.addColorStop(1, c.d);
    ctx.fillStyle = g; ctx.fill(p);
    if (c.rim) {
      ctx.save(); ctx.clip(p);
      const rg = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      rg.addColorStop(0.55, rgba(c.rim, 0)); rg.addColorStop(1, rgba(c.rim, 0.8));
      ctx.lineWidth = r * 0.35; ctx.strokeStyle = rg; ctx.stroke(p); ctx.restore();
    }
    if (o.lw !== 0) { ctx.lineWidth = o.lw ?? 1.6; ctx.strokeStyle = c.o; ctx.stroke(p); }
    if (o.spec !== false) {
      ctx.fillStyle = 'rgba(255,255,255,' + (o.specA ?? 0.55) + ')';
      ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
    }
    return p;
  }
  // smooth open polyline stroke
  function strokeLine(ctx, pts, w, col) {
    ctx.lineWidth = w; ctx.strokeStyle = col;
    ctx.stroke(smooth(pts, false));
  }

  // ---- variable-width tube along a centreline (eels, serpents, tentacles, wind ribbons) ---------
  function tubeSides(pts, rs) {
    const n = pts.length, L = [], R = [], A = [];
    for (let i = 0; i < n; i++) {
      const a = pts[max(0, i - 1)], b = pts[min(n - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1];
      const l = hypot(tx, ty) || 1; tx /= l; ty /= l;
      const r = rs[i];
      L.push([pts[i][0] - ty * r, pts[i][1] + tx * r]);
      R.push([pts[i][0] + ty * r, pts[i][1] - tx * r]);
      A.push(atan2(ty, tx));
    }
    return { L, R, A };
  }
  function tube(pts, rs) {
    const n = pts.length;
    const { L, R, A } = tubeSides(pts, rs);
    const p = new Path2D();
    p.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n - 1; i++) p.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
    p.lineTo(L[n - 1][0], L[n - 1][1]);
    const re = rs[n - 1], rb = rs[0];
    if (re > 0.3) p.arc(pts[n - 1][0], pts[n - 1][1], re, A[n - 1] + PI / 2, A[n - 1] - PI / 2, true);
    else p.lineTo(pts[n - 1][0], pts[n - 1][1]);
    p.lineTo(R[n - 1][0], R[n - 1][1]);
    for (let i = n - 2; i > 0; i--) p.quadraticCurveTo(R[i][0], R[i][1], (R[i][0] + R[i - 1][0]) / 2, (R[i][1] + R[i - 1][1]) / 2);
    p.lineTo(R[0][0], R[0][1]);
    if (rb > 0.3) p.arc(pts[0][0], pts[0][1], rb, A[0] - PI / 2, A[0] - PI * 1.5, true);
    p.closePath();
    return p;
  }
  function bbox(pts, pad = 0) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2];
  }
  // shaded tube: gradient body, cel shadow bands offset away from the top-left key light, highlight, rim, outline
  function paintTube(ctx, pts, rs, c, o = {}) {
    const p = tube(pts, rs);
    let rmax = 0; for (const r of rs) rmax = max(rmax, r);
    const [bx, by, bw, bh] = bbox(pts, rmax);
    const g = ctx.createLinearGradient(bx + bw * 0.1, by, bx + bw * 0.9, by + bh);
    g.addColorStop(0, c.l); g.addColorStop(0.45, c.b); g.addColorStop(1, c.d);
    ctx.fillStyle = o.fill || g; ctx.fill(p);
    ctx.save(); ctx.clip(p);
    const sA = o.shA ?? 0.45;
    if (sA > 0) {
      ctx.fillStyle = rgba(c.d, sA);
      ctx.fill(tube(pts.map((q, i) => [q[0] + rs[i] * 0.45, q[1] + rs[i] * 0.6]), rs.map((r) => r * 0.9)));
      ctx.fillStyle = rgba(c.o, sA * 0.7);
      ctx.fill(tube(pts.map((q, i) => [q[0] + rs[i] * 0.8, q[1] + rs[i] * 1.05]), rs.map((r) => r * 0.85)));
    }
    if (o.belly) o.belly(ctx, p);
    const hA = o.hlA ?? 0.45;
    if (hA > 0) {
      ctx.fillStyle = rgba(c.l, hA);
      ctx.fill(tube(pts.map((q, i) => [q[0] - rs[i] * 0.4, q[1] - rs[i] * 0.52]), rs.map((r) => r * 0.32)));
    }
    if (o.inside) o.inside(ctx, p);
    if (c.rim) {
      const rg = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
      rg.addColorStop(0.45, rgba(c.rim, 0)); rg.addColorStop(1, rgba(c.rim, o.rimA ?? 0.8));
      ctx.lineWidth = o.rimW ?? 5; ctx.strokeStyle = rg; ctx.stroke(p);
    }
    ctx.restore();
    if (o.lw !== 0) { ctx.lineWidth = o.lw ?? 2; ctx.strokeStyle = o.ol || c.o; ctx.stroke(p); }
    return p;
  }
  // tapered elliptical arc stroke (wind streak): three passes, wider in the middle
  function windArc(ctx, cx, cy, rx, ry, a0, a1, w, col, a = 1) {
    if (a <= 0.01) return;
    const span = a1 - a0, mid = (a0 + a1) / 2;
    ctx.strokeStyle = rgba(col, a);
    for (let k = 0; k < 2; k++) {
      const f = 1 - k * 0.4;
      ctx.lineWidth = w * (0.45 + k * 0.5);
      ctx.beginPath(); ctx.ellipse(cx, cy, max(0.1, rx), max(0.1, ry), 0, mid - span * f / 2, mid + span * f / 2); ctx.stroke();
    }
  }
  // tapered open-curve streak along points
  function streak(ctx, pts, w, col, a = 1) {
    if (a <= 0.01) return;
    const n = pts.length;
    ctx.strokeStyle = rgba(col, a);
    for (let k = 0; k < 3; k++) {
      const cut = floor(n * k * 0.18);
      const sub = pts.slice(cut, n - cut);
      if (sub.length < 2) break;
      ctx.lineWidth = w * (0.35 + k * 0.33);
      ctx.stroke(smooth(sub, false));
    }
  }

  // =============================================================================================
  // Pose model  — atk 0..1 strike, wind 0..1 wind-up, hurt 1..0 recoil, cast 0..1 channel
  // =============================================================================================
  function pose(o, t) {
    o = o || {};
    const s = o.state || 'idle', st = o.st || 0;
    let atk = 0, hurt = 0, cast = 0, wind = 0;
    if (s === 'attack') {
      if (st < 0.22) wind = EASE.outQuad(st / 0.22);
      else if (st < 0.36) { const p = (st - 0.22) / 0.14; wind = 1 - p; atk = EASE.outCubic(p); }
      else if (st < 0.55) atk = 1;
      else atk = max(0, 1 - EASE.inOutQuad(min(1, (st - 0.55) / 0.4)));
    } else if (s === 'hurt' || s === 'dead') {
      hurt = s === 'dead' ? 1 : (st < 0.06 ? st / 0.06 : clamp(1 - (st - 0.06) / 0.5, 0, 1));
    } else if (s === 'cast') {
      cast = EASE.outCubic(min(1, st / 0.35));
    }
    const shake = s === 'hurt' ? sin(st * 70) * hurt * 4 : 0;
    return {
      s, st, t, atk, hurt, cast, wind, shake,
      v: clamp((o.variant | 0), 0, 2), ph: clamp(o.phase || 1, 1, 3),
      cp: cast * (0.75 + 0.25 * sin(t * 9)),
    };
  }

  function def(id, w, h, draw) {
    G.Monsters.define(id, {
      w, h,
      draw(ctx, x, y, t, o) {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        try { draw(ctx, x, y, t || 0, o || {}); } finally { ctx.restore(); }
      },
    });
  }

  // shared little props ------------------------------------------------------------------------
  function leafSpr(col, col2) {
    return spr('m3leaf:' + col, 26, 16, 13, 8, (g) => {
      const p = new Path2D();
      p.moveTo(-11, 0); p.quadraticCurveTo(-3, -8, 10, -1); p.quadraticCurveTo(-2, 7, -11, 0); p.closePath();
      const gr = g.createLinearGradient(0, -6, 0, 6);
      gr.addColorStop(0, col2); gr.addColorStop(1, col);
      g.fillStyle = gr; g.fill(p);
      g.strokeStyle = shade(col, -0.5); g.lineWidth = 1; g.stroke(p);
      g.strokeStyle = rgba(shade(col, -0.4), 0.8); g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(-12, 0.5); g.quadraticCurveTo(0, -1, 9, -1); g.stroke();
      g.beginPath(); g.moveTo(-3, -0.5); g.lineTo(0, -4); g.moveTo(2, -0.8); g.lineTo(5, -3.5); g.moveTo(-2, 0); g.lineTo(1, 3); g.stroke();
    });
  }
  // 米粉 rice-noodle tuft
  function noodleSpr(col) {
    return spr('m3noodle:' + col, 44, 22, 22, 11, (g) => {
      for (let i = 0; i < 9; i++) {
        g.strokeStyle = i % 3 === 0 ? shade(col, -0.18) : col; g.lineWidth = 1.1;
        g.beginPath();
        const oy = -6 + i * 1.4;
        g.moveTo(-19, oy);
        for (let k = 1; k <= 8; k++) g.lineTo(-19 + k * 4.8, oy + sin(k * 1.7 + i) * 2.2);
        g.stroke();
      }
      g.fillStyle = rgba('#c8402a', 0.9); g.fillRect(-3, -8, 4, 16); // red binding string
    });
  }
  // 柿餅 dried persimmon
  function persimmonSpr() {
    return spr('m3persimmon', 24, 20, 12, 10, (g) => {
      const p = new Path2D(); p.ellipse(0, 1, 10, 7, 0, 0, TAU);
      paint(g, p, -10, -6, 20, 14, pal('#d8762a', null, { l: '#f2a050', o: '#7a3a14' }), { lw: 1.2, hl: 0.4 });
      g.fillStyle = 'rgba(255,248,232,0.45)';
      for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 3 + (i % 4) * 1.6; g.fillRect(cos(a) * r, 1 + sin(a) * r * 0.6, 1.2, 1.2); }
      g.fillStyle = '#4a3a1a'; g.beginPath(); g.ellipse(0, -4.5, 3.5, 1.6, 0, 0, TAU); g.fill();
      g.strokeStyle = '#2e2410'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -5); g.lineTo(1, -8); g.stroke();
    });
  }
  // 銅錢 copper coin
  function coinSpr(col = '#e0b040') {
    return spr('m3coin:' + col, 20, 20, 10, 10, (g) => {
      const p = new Path2D(); p.arc(0, 0, 8, 0, TAU);
      p.rect(-2.4, -2.4, 4.8, 4.8);
      const gr = g.createRadialGradient(-3, -3, 1, 0, 0, 9);
      gr.addColorStop(0, shade(col, 0.5)); gr.addColorStop(0.6, col); gr.addColorStop(1, shade(col, -0.35));
      g.fillStyle = gr; g.fill(p, 'evenodd');
      g.strokeStyle = shade(col, -0.55); g.lineWidth = 1.1; g.stroke(p);
      g.strokeStyle = rgba(shade(col, -0.4), 0.7); g.lineWidth = 0.8;
      g.beginPath(); g.arc(0, 0, 5.6, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,240,0.7)'; g.beginPath(); g.ellipse(-3.5, -4, 2, 1, -0.7, 0, TAU); g.fill();
    });
  }
  // ghost face (drowned voice)
  function ghostFaceSpr(col) {
    return spr('m3gface:' + col, 40, 48, 20, 24, (g) => {
      const gr = g.createRadialGradient(0, -3, 2, 0, 0, 20);
      gr.addColorStop(0, rgba(col, 0.85)); gr.addColorStop(0.6, rgba(col, 0.45)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr;
      const p = new Path2D(); p.moveTo(0, -18); p.bezierCurveTo(14, -18, 15, 4, 8, 14); p.quadraticCurveTo(0, 24, -8, 14);
      p.bezierCurveTo(-15, 4, -14, -18, 0, -18); g.fill(p);
      g.fillStyle = rgba(shade(col, -0.75), 0.85);
      g.beginPath(); g.ellipse(-5, -4, 3, 4.2, 0.15, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(5, -4, 3, 4.2, -0.15, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(0, 8, 3.4, 5.5, 0, 0, TAU); g.fill();
    });
  }

  // =============================================================================================
  // 九降風精 wind_sprite — small swirling gust spirit carrying dried leaves, 米粉 & a 柿餅
  // =============================================================================================
  const WS = [
    { wind: '#dff6ff', core: '#7cc8e4', deep: '#2c6684', eye: '#fffbe6', eyeG: '#9ff4ff', leaf: '#c46c2a', leaf2: '#e8a848', noodle: '#f8f2e2', rim: '#ffffff' },
    { wind: '#fff0d0', core: '#e8a85c', deep: '#86461e', eye: '#fff6d8', eyeG: '#ffd27a', leaf: '#a8401e', leaf2: '#e08a30', noodle: '#fff4dc', rim: '#fff4dc' },
    { wind: '#e6dcff', core: '#9474d8', deep: '#3a2a64', eye: '#ffe6ff', eyeG: '#f0a8ff', leaf: '#5e3e5c', leaf2: '#9a6a8a', noodle: '#ece2f6', rim: '#f6ecff' },
  ];
  def('wind_sprite', 130, 160, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = WS[P.v];
    ctx.translate(x + P.shake - P.hurt * 8, y);
    const bob = sin(t * 2.3) * 5;
    const lean = P.atk * 0.5 - P.wind * 0.3 - P.hurt * 0.35 + sin(t * 1.3) * 0.05;
    const spd = 3 + P.atk * 7 + P.cast * 5 + P.wind * 3;
    const spin = t * spd;
    const H = 118 * (1 - P.hurt * 0.1 + P.atk * 0.06);
    const sq = 1 + P.hurt * 0.1;
    const axis = (h) => [sin(lean) * h * H + sin(t * 1.8 + h * 4) * 5 * (1 - h) + P.atk * 22 * h, -12 + bob - cos(lean) * h * H];
    const rxOf = (h) => (4 + 34 * pow(h / 0.68, 0.95)) * sq;
    const hc = axis(0.8), hr = 30 * sq;
    // ambient glow
    glow(ctx, hc[0], hc[1] + 8, 78 + P.cp * 30, C.core, 0.35 + P.cp * 0.4);
    // orbiting cargo
    const cargo = [];
    for (let i = 0; i < 6; i++) {
      const th = spin * 0.55 + i * TAU / 6 + (i % 2) * 0.3;
      const h = 0.2 + (i % 3) * 0.2 + sin(t + i) * 0.04;
      const a = axis(h);
      const rx = rxOf(h) + 18 + (i % 2) * 8;
      cargo.push({ i, x: a[0] + cos(th) * rx, y: a[1] + sin(th) * rx * 0.32, z: sin(th), rot: t * 3 + i * 1.7 });
    }
    const drawCargo = (c) => {
      const sc = 0.85 + c.z * 0.15;
      ctx.globalAlpha = 0.75 + c.z * 0.25;
      if (c.i === 2) put(ctx, noodleSpr(C.noodle), c.x, c.y, sc * 0.8, c.rot * 0.4);
      else if (c.i === 5) put(ctx, persimmonSpr(), c.x, c.y, sc * 0.9, sin(c.rot) * 0.4);
      else put(ctx, leafSpr(C.leaf, C.leaf2), c.x, c.y, sc, c.rot);
      ctx.globalAlpha = 1;
    };
    for (const c of cargo) if (c.z < 0) drawCargo(c);
    // funnel body
    const N = 16, cl = [], rs = [];
    for (let i = 0; i <= N; i++) { const h = (i / N) * 0.74; cl.push(axis(h)); rs.push(rxOf(h) * 0.8); }
    const fp = tube(cl, rs);
    const fg = ctx.createLinearGradient(0, cl[0][1], 0, cl[N][1]);
    fg.addColorStop(0, rgba(C.wind, 0)); fg.addColorStop(0.5, rgba(C.core, 0.22)); fg.addColorStop(1, rgba(C.wind, 0.5));
    ctx.fillStyle = fg; ctx.fill(fp);
    // back halves of rings
    for (let i = 0; i < 8; i++) {
      const h = 0.06 + i * 0.085, a = axis(h), rx = rxOf(h);
      const a0 = PI + ((spin * (1 + i * 0.07) + i) % TAU) * 0.3;
      windArc(ctx, a[0], a[1], rx, rx * 0.3, a0, a0 + 1.6, 2.4, C.deep, 0.35);
    }
    // head cloud
    const hp = [];
    for (let i = 0; i < 36; i++) {
      const th = i / 36 * TAU;
      const r = hr * (0.9 + 0.12 * abs(sin(th * 3.5 + spin * 0.25)));
      hp.push([hc[0] + cos(th) * r * 1.08, hc[1] + sin(th) * r * 0.95]);
    }
    const head = smooth(hp);
    ctx.globalAlpha = 0.95;
    const hg = ctx.createRadialGradient(hc[0] - 10, hc[1] - 14, 3, hc[0], hc[1], hr * 1.2);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.45, C.wind); hg.addColorStop(1, C.core);
    ctx.fillStyle = hg; ctx.fill(head);
    ctx.save(); ctx.clip(head);
    ctx.strokeStyle = rgba(C.deep, 0.25); ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(hc[0] - 6, hc[1] + 8, hr * 0.95, 0.1, 1.9); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = rgba(C.rim, 0.85);
    ctx.beginPath(); ctx.arc(hc[0] + 6, hc[1] + 2, hr * 1.02, -0.5, 1.2); ctx.stroke();
    // inner swirl
    ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k < 28; k++) {
      const th = -spin * 0.8 + k * 0.25, r = 4 + k * 0.85;
      const px = hc[0] - 8 + cos(th) * r, py = hc[1] - 4 + sin(th) * r * 0.8;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.8; ctx.strokeStyle = rgba(shade(C.core, -0.45), 0.9); ctx.stroke(head);
    // face
    const fx = hc[0] + 6 + P.atk * 3, fy = hc[1] + 2;
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    if (P.hurt > 0.3) {
      ctx.strokeStyle = C.deep; ctx.lineWidth = 2.4;
      for (const ex of [fx - 4, fx + 14]) {
        ctx.beginPath(); ctx.moveTo(ex - 4, fy - 6); ctx.lineTo(ex + 3, fy - 2); ctx.lineTo(ex - 4, fy + 2); ctx.stroke();
      }
    } else {
      for (const [ex, s] of [[fx - 4, 0.85], [fx + 14, 1]]) {
        glow(ctx, ex, fy - 2, 12, C.eyeG, 0.5);
        ctx.fillStyle = C.deep;
        ctx.beginPath(); ctx.ellipse(ex, fy - 2, 4.6 * s, 6.2 * blink * (1 - P.atk * 0.35), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = C.eye;
        ctx.beginPath(); ctx.ellipse(ex + 0.8, fy - 3, 2.6 * s, 3.8 * blink * (1 - P.atk * 0.35), 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 1.6, fy - 5, 1.1, 0, TAU); ctx.fill();
      }
      // brows (mischievous)
      ctx.strokeStyle = rgba(C.deep, 0.8); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(fx - 9, fy - 12 + P.atk * 2); ctx.lineTo(fx - 1, fy - 10 + P.atk * 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx + 10, fy - 10 + P.atk * 3); ctx.lineTo(fx + 19, fy - 13 + P.atk * 2); ctx.stroke();
    }
    // mouth: blowing "o"
    const mo = 2.6 + P.atk * 3 + P.cast * 2 + sin(t * 4) * 0.4;
    ctx.fillStyle = C.deep; ctx.beginPath(); ctx.ellipse(fx + 7, fy + 10, mo * 0.8, mo, 0, 0, TAU); ctx.fill();
    // cheeks
    ctx.fillStyle = rgba('#ff9aa0', 0.28);
    ctx.beginPath(); ctx.ellipse(fx - 8, fy + 6, 4, 2.4, 0, 0, TAU); ctx.ellipse(fx + 21, fy + 5, 3.4, 2.2, 0, 0, TAU); ctx.fill();
    // front halves of rings
    for (let i = 0; i < 8; i++) {
      const h = 0.06 + i * 0.085, a = axis(h), rx = rxOf(h);
      const a0 = ((spin * (1 + i * 0.07) + i * 1.3) % TAU) * 0.35 - 0.2;
      windArc(ctx, a[0], a[1], rx, rx * 0.3, a0, a0 + 1.9, 2.8, C.wind, 0.85);
    }
    // swept ring around the head
    windArc(ctx, hc[0], hc[1] + 6, hr * 1.35, hr * 0.42, (spin * 0.9) % TAU, (spin * 0.9) % TAU + 2.2, 2.6, '#ffffff', 0.8);
    // trailing streaks
    for (let i = 0; i < 3; i++) {
      const yy = hc[1] - 10 + i * 18, ph = (t * 1.6 + i * 0.37) % 1;
      const x0 = hc[0] - 34 - ph * 30;
      streak(ctx, [[x0, yy], [x0 - 18, yy - 4], [x0 - 34, yy + 1]], 2.2, C.wind, 0.6 * sin(ph * PI));
    }
    for (const c of cargo) if (c.z >= 0) drawCargo(c);
    // attack gust
    if (P.atk > 0) {
      for (let i = 0; i < 3; i++) {
        const xx = hc[0] + 40 + P.atk * 40 + i * 6, yy = hc[1] - 10 + i * 14;
        windArc(ctx, xx, yy, 26 + i * 6, 12, -1.2, 1.2, 3, '#ffffff', 0.8 * P.atk);
      }
    }
    if (P.cast > 0) {
      const r = 30 + ((P.st * 1.4) % 1) * 70;
      ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(C.wind, 0.7 * P.cast * (1 - r / 100));
      ctx.beginPath(); ctx.ellipse(hc[0], hc[1] + 30, r * 1.2, r * 0.4, 0, 0, TAU); ctx.stroke();
      glow(ctx, hc[0], hc[1], 40, '#ffffff', 0.4 * P.cp);
    }
  });

  // =============================================================================================
  // 風魔 wind_demon (BOSS) — howling vortex demon of the corrupted 九降風, cracked lantern heart,
  // streaming wind ribbons that carry the faces of the drowned
  // =============================================================================================
  const WD = [
    { storm: '#3c4c70', stormL: '#7c92b8', wind: '#cfe0f4', soul: '#86e8ff', rim: '#9fe8ff', eye: '#e8fbff', horn: '#2a2f44', hornT: '#b8c8dc', face: '#9ad8ff' },
    { storm: '#2e5a58', stormL: '#6ea49a', wind: '#d2f0e4', soul: '#8cffd8', rim: '#a8ffe0', eye: '#eefff6', horn: '#1e3332', hornT: '#b4d4c4', face: '#a8f0d8' },
    { storm: '#4a2c50', stormL: '#9a6a9c', wind: '#f0d6ec', soul: '#ff9ad8', rim: '#ffb0e0', eye: '#fff0fa', horn: '#2c1a2e', hornT: '#d8b0c8', face: '#ffc0e8' },
  ];
  function wdCol(v, ph) {
    const C = Object.assign({}, WD[v]);
    if (ph === 3) { C.storm = mix(C.storm, '#5a1a24', 0.45); C.stormL = mix(C.stormL, '#c05a4a', 0.4); C.eye = '#ffd2a0'; C.rim = mix(C.rim, '#ff7a4a', 0.5); }
    else if (ph === 2) { C.storm = mix(C.storm, '#4a2a3a', 0.2); }
    return C;
  }
  function wdTorso(v, ph) {
    const C = wdCol(v, ph);
    return spr('wd:torso:' + v + ':' + ph, 230, 160, 115, 260, (g) => {
      const pts = [[-58, -150], [-80, -176], [-96, -212], [-84, -240], [-54, -256], [-14, -262], [30, -260], [70, -250], [96, -230], [92, -196], [70, -164], [42, -146], [0, -138], [-32, -140]];
      const body = tufted(pts, 7, 3, 11);
      paint(g, body, -96, -262, 192, 124, pal(C.storm, C.rim, { l: C.stormL }), {
        lw: 2.4, hl: 0.35, rimW: 10, rimA: 0.7,
        inside: (c) => {
          // churning cloud lobes
          for (let i = 0; i < 9; i++) {
            const a = i * 0.7, rx = -70 + (i * 23) % 150, ry = -240 + (i * 37) % 90;
            c.strokeStyle = rgba(C.stormL, 0.35); c.lineWidth = 3;
            c.beginPath(); c.arc(rx, ry, 14 + (i % 3) * 6, a, a + 2.4); c.stroke();
            c.strokeStyle = rgba(shade(C.storm, -0.5), 0.35); c.lineWidth = 4;
            c.beginPath(); c.arc(rx + 3, ry + 4, 14 + (i % 3) * 6, a + 2.6, a + 4); c.stroke();
          }
          // chest cavity around the lantern
          const cg = c.createRadialGradient(8, -200, 6, 8, -200, 52);
          cg.addColorStop(0, rgba('#05060c', 0.95)); cg.addColorStop(0.6, rgba('#0a0c18', 0.7)); cg.addColorStop(1, rgba('#0a0c18', 0));
          c.fillStyle = cg; c.fillRect(-60, -260, 140, 120);
        },
      });
      // pectoral wind swirls
      g.strokeStyle = rgba(C.wind, 0.5); g.lineWidth = 2.2;
      g.beginPath(); g.arc(-40, -214, 22, -2.6, -0.4); g.stroke();
      g.beginPath(); g.arc(56, -214, 20, -2.8, -0.6); g.stroke();
      g.strokeStyle = rgba(C.wind, 0.3); g.lineWidth = 1.6;
      g.beginPath(); g.arc(-50, -186, 16, -2.4, 0.2); g.stroke();
    });
  }
  function wdLantern(v, ph) {
    return spr('wd:lantern:' + ph, 80, 90, 40, 45, (g) => {
      // traditional round paper lantern with gold caps, cracked
      const body = new Path2D(); body.ellipse(0, 0, 24, 28, 0, 0, TAU);
      const red = ph === 3 ? '#a02018' : '#c4302a';
      paint(g, body, -24, -28, 48, 56, pal(red, '#ffb070', { l: '#f05a3a', o: '#4a0e0c' }), { lw: 2, hl: 0.5, rimW: 6 });
      g.save(); g.clip(body);
      g.strokeStyle = rgba('#5a1010', 0.55); g.lineWidth = 1.4;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.ellipse(0, 0, abs(i) * 7.5 + 0.5, 28, 0, 0, TAU); g.stroke(); }
      // inner light
      const ig = g.createRadialGradient(0, 2, 2, 0, 2, 26);
      ig.addColorStop(0, rgba('#ffe0a0', 0.55)); ig.addColorStop(1, rgba('#ffe0a0', 0));
      g.fillStyle = ig; g.fillRect(-26, -30, 52, 60);
      // cracks
      const cracks = [
        [[-6, -27], [-2, -14], [-9, -4], [-3, 6], [-8, 16]],
        [[14, -22], [8, -10], [16, 0], [10, 12]],
      ];
      if (ph >= 2) cracks.push([[-22, -6], [-12, -2], [-14, 10], [-4, 20], [2, 27]], [[20, 4], [12, 8], [16, 20]]);
      if (ph >= 3) cracks.push([[-18, -18], [-8, -20], [2, -12], [12, -16]], [[-24, 6], [-16, 12], [-20, 22]]);
      for (const cr of cracks) {
        g.strokeStyle = rgba('#2a0806', 0.9); g.lineWidth = 3.2; g.stroke(smooth(cr, false));
        g.strokeStyle = ph === 3 ? '#ffb070' : '#ffe8b0'; g.lineWidth = 1.3; g.stroke(smooth(cr, false));
      }
      // missing shard showing blue soul fire
      const hole = poly(ph >= 2 ? [[2, -6], [14, -10], [18, 4], [10, 12], [0, 8], [-4, 0]] : [[4, -4], [12, -6], [14, 4], [6, 8], [2, 2]]);
      g.fillStyle = '#05060c'; g.fill(hole);
      g.strokeStyle = '#ffe0b0'; g.lineWidth = 1.2; g.stroke(hole);
      g.restore();
      // gold caps & tassel ring
      for (const cy of [-28, 28]) {
        const cap = new Path2D(); cap.ellipse(0, cy, 13, 4.5, 0, 0, TAU);
        paint(g, cap, -13, cy - 5, 26, 10, pal('#e0aa40', '#fff0b0', { o: '#6a4410' }), { lw: 1.4, hl: 0.5, rimW: 3 });
      }
      g.fillStyle = '#e0aa40'; g.fillRect(-2, -38, 4, 8);
    });
  }
  function wdHead(v, ph) {
    const C = wdCol(v, ph);
    const bone = pal('#d6dde6', C.rim, { l: '#f6f9fc', d: '#8a96a8', o: '#3a4252' });
    return spr('wd:head:' + v + ':' + ph, 200, 160, 115, 95, (g) => {
      // storm hood / cloud mane mass behind the mask
      const hood = tufted([[-60, -30], [-40, -52], [-6, -56], [26, -46], [30, -24], [4, -2], [-14, 22], [-44, 24], [-66, 4]], 6, 3, 21);
      paint(g, hood, -66, -56, 100, 86, pal(shade(C.storm, -0.15), C.rim, { l: C.stormL }), { lw: 2, hl: 0.25, rimW: 6, rimA: 0.5 });
      g.strokeStyle = rgba(C.wind, 0.45); g.lineWidth = 2;
      g.beginPath(); g.arc(-30, -14, 18, -2.8, -0.2); g.stroke();
      g.beginPath(); g.arc(-40, 6, 12, -2.4, 0.4); g.stroke();
      // swept horns (pale bone)
      for (const [ox, oy, s, back] of [[-20, -30, 0.8, true], [6, -34, 1, false]]) {
        const hp = new Path2D();
        hp.moveTo(ox - 18, oy + 12);
        hp.bezierCurveTo(ox - 30, oy - 20 * s, ox - 52 * s, oy - 46 * s, ox - 88 * s, oy - 42 * s);
        hp.bezierCurveTo(ox - 52 * s, oy - 30 * s, ox - 10 * s, oy - 20 * s, ox + 14, oy + 2);
        hp.closePath();
        const hg = g.createLinearGradient(ox - 84 * s, oy - 42 * s, ox + 4, oy + 8);
        hg.addColorStop(0, '#f6f9fc'); hg.addColorStop(0.5, back ? '#8a94a6' : '#b8c2d0'); hg.addColorStop(1, back ? '#4a5262' : '#6a7486');
        g.fillStyle = hg; g.fill(hp);
        g.save(); g.clip(hp);
        g.strokeStyle = rgba('#1a2030', 0.35); g.lineWidth = 1.4;
        for (let i = 1; i < 6; i++) { g.beginPath(); g.arc(ox - 6 - i * 9 * s, oy - i * 9 * s, 14, 0.2, 1.6); g.stroke(); }
        if (!back) { g.strokeStyle = rgba(C.rim, 0.7); g.lineWidth = 3; g.beginPath(); g.moveTo(ox + 10, oy + 6); g.bezierCurveTo(ox - 10 * s, oy - 20 * s, ox - 52 * s, oy - 30 * s, ox - 88 * s, oy - 42 * s); g.stroke(); }
        g.restore();
        g.strokeStyle = '#2e3444'; g.lineWidth = 1.8; g.stroke(hp);
      }
      // bone mask (3/4 right), howling
      const face = smooth([[-24, -24], [-4, -36], [22, -32], [40, -20], [47, -6], [44, 6], [34, 10], [12, 12], [-10, 10], [-24, 2], [-28, -12]]);
      paint(g, face, -28, -36, 75, 48, bone, { lw: 2.2, hl: 0.5, rimW: 6, rimA: 0.6,
        inside: (c) => {
          // eye sockets
          for (const [ex, ey, s] of [[12, -10, 0.82], [33, -11, 1]]) {
            const sg = c.createRadialGradient(ex, ey, 1, ex, ey, 12 * s);
            sg.addColorStop(0, rgba('#05060c', 0.95)); sg.addColorStop(0.55, rgba('#1a2030', 0.75)); sg.addColorStop(1, rgba('#1a2030', 0));
            c.fillStyle = sg; c.fillRect(ex - 14, ey - 14, 28, 28);
          }
          // cheek hollows
          c.fillStyle = rgba('#5a6478', 0.45);
          c.beginPath(); c.ellipse(24, 4, 10, 4, -0.2, 0, TAU); c.fill();
          c.beginPath(); c.ellipse(-6, 0, 9, 5, 0.3, 0, TAU); c.fill();
          // storm markings
          c.strokeStyle = rgba(C.storm, 0.7); c.lineWidth = 2;
          c.beginPath(); c.moveTo(-20, -18); c.quadraticCurveTo(-8, -26, 4, -22); c.stroke();
          c.beginPath(); c.moveTo(-22, -6); c.quadraticCurveTo(-12, -10, -2, -4); c.stroke();
          c.strokeStyle = rgba(C.storm, 0.55); c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(2, -30); c.lineTo(8, -22); c.moveTo(14, -32); c.lineTo(18, -24); c.stroke();
        } });
      // angry brow ridges
      g.strokeStyle = '#2e3444'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(2, -22); g.quadraticCurveTo(12, -22, 20, -15); g.stroke();
      g.beginPath(); g.moveTo(24, -24); g.quadraticCurveTo(36, -22, 44, -14); g.stroke();
      // nose slits
      g.fillStyle = '#2e3444';
      g.beginPath(); g.ellipse(44, -1, 1.6, 3, 0.4, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(39, 0, 1.4, 2.6, 0.4, 0, TAU); g.fill();
    });
  }
  function wdJaw(v, ph) {
    const C = wdCol(v, ph);
    const bone = pal('#c8d0dc', C.rim, { l: '#eef2f6', d: '#7a8698', o: '#3a4252' });
    return spr('wd:jaw:' + v + ':' + ph, 90, 60, 24, 12, (g) => {
      const jaw = smooth([[-16, -2], [10, 2], [40, 0], [44, 8], [34, 20], [10, 26], [-10, 18]]);
      paint(g, jaw, -16, -2, 60, 28, bone, { lw: 2, hl: 0.35, rimW: 6 });
      g.fillStyle = '#f4f6f8'; g.strokeStyle = '#4a5466'; g.lineWidth = 1;
      for (const [fx, fh] of [[12, 9], [24, 11], [35, 7]]) {
        g.beginPath(); g.moveTo(fx - 3, 3); g.lineTo(fx, 3 - fh); g.lineTo(fx + 3, 3); g.closePath(); g.fill(); g.stroke();
      }
    });
  }
  def('wind_demon', 300, 330, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = wdCol(P.v, P.ph);
    ctx.translate(x + P.shake - P.hurt * 10, y);
    const bob = sin(t * 1.3) * 6;
    const fury = (P.ph - 1) * 0.5;
    const spin = t * (2.2 + fury + P.atk * 3 + P.cast * 2);
    const lean = P.atk * 0.22 - P.wind * 0.16 - P.hurt * 0.2 + sin(t * 0.9) * 0.03;
    // ---- ribbons with drowned faces (behind everything) ----
    const ribbons = [];
    for (let i = 0; i < 5; i++) {
      const sx = -40 + i * 6, sy = -250 + i * 34 + bob;
      const pts = [], rs = [];
      const n = 18, L = 150 + i * 14;
      for (let k = 0; k <= n; k++) {
        const f = k / n;
        pts.push([sx - f * L, sy - 40 * f + (i - 2) * 26 * f * f + sin(t * 2.4 - f * 5 + i * 1.3) * 22 * f]);
        rs.push((1 - f) * (7 - i * 0.6) + 0.6 + sin(f * PI) * 5);
      }
      ribbons.push({ pts, rs, i });
    }
    for (const r of ribbons) {
      const p = tube(r.pts, r.rs);
      const [bx, , bw] = bbox(r.pts);
      const gr = ctx.createLinearGradient(bx + bw, 0, bx, 0);
      gr.addColorStop(0, rgba(C.stormL, 0.55)); gr.addColorStop(0.5, rgba(C.wind, 0.22)); gr.addColorStop(1, rgba(C.wind, 0));
      ctx.fillStyle = gr; ctx.fill(p);
      // fine wind threads along the ribbon
      for (let m = -1; m <= 1; m += 2) {
        const th = r.pts.map((q, k) => [q[0], q[1] + m * r.rs[k] * 0.45]);
        ctx.strokeStyle = rgba(C.wind, 0.3); ctx.lineWidth = 1.3; ctx.stroke(smooth(th.slice(1, 13), false));
      }
    }
    // drowned faces drifting along ribbons
    const nf = 3 + P.ph;
    for (let j = 0; j < nf; j++) {
      const r = ribbons[(j * 2 + 1) % 5];
      const f = ((t * 0.18 + j * 0.37) % 1);
      const k = floor(f * (r.pts.length - 1));
      const q = r.pts[k];
      ctx.globalAlpha = sin(f * PI) * (0.55 + 0.1 * P.ph);
      put(ctx, ghostFaceSpr(C.face), q[0], q[1], 0.8 + f * 0.5, sin(t + j) * 0.2);
      // voice ripples
      ctx.strokeStyle = rgba(C.face, 0.5); ctx.lineWidth = 1.2;
      for (let m = 0; m < 2; m++) { ctx.beginPath(); ctx.arc(q[0] + 2, q[1] + 8, 8 + m * 6 + ((t * 10) % 6), 1.2, 2.2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // ---- vortex lower body ----
    const tipY = -16 + bob, waistY = -150 + bob;
    const vax = (h) => [sin(t * 1.1 + h * 2.6) * 12 * (1 - h) + P.atk * 10 * h, lerp(tipY, waistY, h)];
    const vr = (h) => 8 + 64 * pow(h, 0.85);
    const N = 16, cl = [], rs = [];
    for (let i = 0; i <= N; i++) { const h = i / N; cl.push(vax(h)); rs.push(vr(h)); }
    const vp = tube(cl, rs);
    const vg = ctx.createLinearGradient(0, tipY, 0, waistY);
    vg.addColorStop(0, rgba(C.storm, 0.1)); vg.addColorStop(0.4, rgba(C.storm, 0.75)); vg.addColorStop(1, rgba(C.storm, 0.98));
    ctx.fillStyle = vg; ctx.fill(vp);
    ctx.save(); ctx.clip(vp);
    const vs = ctx.createLinearGradient(-70, 0, 70, 0);
    vs.addColorStop(0, rgba(C.stormL, 0.35)); vs.addColorStop(0.5, rgba(C.storm, 0)); vs.addColorStop(1, rgba('#05060c', 0.45));
    ctx.fillStyle = vs; ctx.fillRect(-90, waistY - 10, 180, tipY - waistY + 20);
    ctx.restore();
    glow(ctx, 0, waistY + 20, 120, C.soul, 0.12 + fury * 0.1);
    for (let i = 0; i < 11; i++) {
      const h = 0.04 + i * 0.09, a = vax(h), r = vr(h);
      const a0 = PI + ((spin * (1 + i * 0.05) + i * 0.9) % TAU) * 0.25;
      windArc(ctx, a[0], a[1], r, r * 0.28, a0, a0 + 1.4, 3, shade(C.storm, -0.5), 0.5);
    }
    // soul wisps orbiting the vortex (back)
    const wisps = [];
    for (let i = 0; i < 4 + P.ph * 2; i++) {
      const th = spin * 0.7 + i * TAU / (4 + P.ph * 2);
      const h = 0.35 + (i % 3) * 0.22;
      const a = vax(h), r = vr(h) + 22;
      wisps.push({ x: a[0] + cos(th) * r, y: a[1] + sin(th) * r * 0.3 + sin(t * 3 + i) * 4, z: sin(th), i });
    }
    const drawWisp = (w) => {
      const s = 0.8 + w.z * 0.2;
      glow(ctx, w.x, w.y, 16 * s, C.soul, 0.8);
      ctx.fillStyle = rgba('#ffffff', 0.85);
      ctx.beginPath(); ctx.moveTo(w.x - 4 * s, w.y + 2); ctx.quadraticCurveTo(w.x - 2, w.y - 10 * s, w.x - 10 * s, w.y - 14 * s);
      ctx.quadraticCurveTo(w.x + 6 * s, w.y - 8 * s, w.x + 4 * s, w.y + 2); ctx.arc(w.x, w.y + 2, 4 * s, 0, PI); ctx.fill();
    };
    for (const w of wisps) if (w.z < 0) drawWisp(w);
    // ---- upper body (leans around the waist) ----
    ctx.save();
    ctx.translate(0, waistY); ctx.rotate(lean); ctx.translate(0, -waistY);
    ctx.translate(0, bob);
    const breathe = 1 + sin(t * 1.6) * 0.015;
    // back arm
    const armSwing = sin(t * 1.4) * 6;
    const bS = [-72, -236], bE = [-122 - P.cast * 10, -196 + armSwing - P.cast * 70], bH = [-128 - P.cast * 6, -142 + armSwing - P.cast * 130];
    drawWindArm(ctx, bS, bE, bH, C, t, -1, 0.75);
    // torso
    put(ctx, wdTorso(P.v, P.ph), 0, 0, 1, 0, breathe);
    // lantern heart
    const lx = 8, ly = -200 * breathe;
    const fl = 0.75 + 0.25 * sin(t * 11) * sin(t * 7.3);
    glow(ctx, lx, ly, 70 + P.cp * 40, P.ph === 3 ? '#ff7040' : '#ffc070', (0.55 + P.cp * 0.4) * fl);
    put(ctx, wdLantern(P.v, P.ph), lx, ly, 1, sin(t * 1.7) * 0.06);
    glow(ctx, lx + 9, ly + 1, 14 + P.ph * 3, C.soul, 0.9 * fl);
    // soul light leaking from the crack
    for (let i = 0; i < 3 + P.ph; i++) {
      const f = (t * 0.7 + i / (3 + P.ph)) % 1;
      const wx = lx + 10 + f * 30 * cos(i * 2.1 - 0.6), wy = ly - f * 60 + sin(t * 4 + i) * 4;
      glow(ctx, wx, wy, 8 * (1 - f) + 2, C.soul, 0.9 * (1 - f));
    }
    // wind bands across the chest
    const chestA = (spin * 0.5) % TAU;
    windArc(ctx, lx, ly + 6, 64, 18, chestA * 0.2 + 0.1, chestA * 0.2 + 1.9, 3, C.wind, 0.6);
    // head
    ctx.save();
    ctx.translate(22 + P.atk * 8, -276 - P.cast * 6); ctx.scale(1.22, 1.22);
    const hx = 0, hy = 0;
    // mane streaming back (live)
    for (let i = 0; i < 7; i++) {
      const pts = [], rr = [];
      const sx = hx - 22, sy = hy - 26 + i * 9;
      for (let k = 0; k <= 10; k++) {
        const f = k / 10;
        pts.push([sx - f * (90 + i * 6), sy - 16 * f + (i - 3) * 8 * f + sin(t * 3 - f * 6 + i) * 9 * f]);
        rr.push((1 - f) * 6 + 0.5);
      }
      const mp = tube(pts, rr);
      ctx.fillStyle = rgba(i % 2 ? C.wind : C.stormL, 0.55); ctx.fill(mp);
    }
    const howl = 0.55 + 0.25 * sin(t * 2.1) + P.atk * 0.5 + P.cast * 0.4 - P.hurt * 0.2;
    // mouth interior
    const mx = hx + 22, my = hy + 8;
    ctx.fillStyle = '#05060c';
    ctx.beginPath(); ctx.ellipse(mx - 2, my + 8 + 10 * howl, 22, 8 + 12 * howl, 0.1, 0, TAU); ctx.fill();
    glow(ctx, mx + 2, my + 12 + 8 * howl, 18 + howl * 10, C.soul, 0.55 + 0.3 * howl);
    put(ctx, wdJaw(P.v, P.ph), hx - 4, hy + 20 + 20 * howl, 1, howl * 0.22);
    put(ctx, wdHead(P.v, P.ph), hx, hy);
    // upper fangs
    ctx.fillStyle = '#eef2f4'; ctx.strokeStyle = '#5a6470'; ctx.lineWidth = 1;
    for (const [fx, fh] of [[hx + 12, 9], [hx + 26, 12], [hx + 37, 8]]) {
      ctx.beginPath(); ctx.moveTo(fx - 3, hy + 9); ctx.lineTo(fx, hy + 9 + fh); ctx.lineTo(fx + 3, hy + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // glowing eyes
    for (const [ex, ey, s] of [[hx + 12, hy - 10, 0.8], [hx + 33, hy - 11, 1]]) {
      glow(ctx, ex, ey, 22 * s, P.ph === 3 ? '#ff8a50' : C.soul, 0.9);
      ctx.fillStyle = C.eye;
      ctx.beginPath(); ctx.ellipse(ex + 1, ey, 5 * s, 2.4 * s * (1 - P.hurt * 0.6), -0.15, 0, TAU); ctx.fill();
    }
    // howl rings (voices)
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.9 + i / 3) % 1;
      ctx.strokeStyle = rgba(C.wind, 0.45 * (1 - f) * (0.4 + howl * 0.6));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(mx + 22 + f * 70, my + 8, 6 + f * 12, 10 + f * 26, 0, -1.3, 1.3); ctx.stroke();
    }
    ctx.restore();
    // front arm
    const fS = [78, -234];
    let fE = [122, -200], fH = [138, -148];
    fE = [lerp(fE[0], 108, P.wind), lerp(fE[1], -272, P.wind)]; fH = [lerp(fH[0], 84, P.wind), lerp(fH[1], -318, P.wind)];
    fE = [lerp(fE[0], 150, P.atk), lerp(fE[1], -230, P.atk)]; fH = [lerp(fH[0], 200, P.atk), lerp(fH[1], -196, P.atk)];
    fE = [lerp(fE[0], 126, P.cast), lerp(fE[1], -262, P.cast)]; fH = [lerp(fH[0], 136, P.cast), lerp(fH[1], -320, P.cast)];
    fE[1] += armSwing * 0.6; fH[1] += armSwing;
    drawWindArm(ctx, fS, fE, fH, C, t + 1, 1, 1);
    if (P.atk > 0.2) {
      for (let i = 0; i < 4; i++) streak(ctx, [[fH[0] - 70, fH[1] - 40 + i * 14], [fH[0] - 20, fH[1] - 26 + i * 12], [fH[0] + 30, fH[1] - 4 + i * 8]], 3, C.wind, 0.6 * P.atk);
    }
    ctx.restore();
    // front vortex rings & wisps
    for (let i = 0; i < 11; i++) {
      const h = 0.04 + i * 0.09, a = vax(h), r = vr(h);
      const a0 = ((spin * (1 + i * 0.05) + i * 1.7) % TAU) * 0.3 - 0.3;
      windArc(ctx, a[0], a[1], r, r * 0.28, a0, a0 + 1.7, 3.4, C.wind, 0.7);
    }
    // debris: broken 米粉 drying-rack slats
    for (let i = 0; i < 3; i++) {
      const th = spin * 0.9 + i * 2.1, h = 0.3 + i * 0.25;
      const a = vax(h), r = vr(h) + 10;
      const dx = a[0] + cos(th) * r, dy = a[1] + sin(th) * r * 0.3;
      if (sin(th) < -0.2) continue;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(t * 2 + i);
      ctx.fillStyle = '#a8844a'; ctx.strokeStyle = '#4a3418'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(-14, -2, 28, 4); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (i === 1) put(ctx, noodleSpr('#d8d0b8'), dx + 6, dy + 8, 0.7, t * 1.5);
    }
    for (const w of wisps) if (w.z >= 0) drawWisp(w);
    if (P.cast > 0) {
      for (let i = 0; i < 8; i++) {
        const th = t * 2.5 + i * TAU / 8;
        const r = 110 + sin(t * 3) * 6;
        const wx = 8 + cos(th) * r, wy = -210 + sin(th) * r * 0.35;
        glow(ctx, wx, wy, 18, C.soul, P.cast * (0.6 + 0.3 * sin(th)));
      }
      glow(ctx, 8, -205, 150, C.soul, 0.25 * P.cp);
    }
  });
  function drawWindArm(ctx, S, E, H, C, t, side, a) {
    const pts = [], rs = [];
    const n = 12;
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      // quadratic through elbow
      const u = 1 - f;
      const cx = 2 * E[0] - (S[0] + H[0]) / 2, cy = 2 * E[1] - (S[1] + H[1]) / 2;
      pts.push([u * u * S[0] + 2 * u * f * cx + f * f * H[0], u * u * S[1] + 2 * u * f * cy + f * f * H[1]]);
      rs.push(lerp(24, 11, f) + sin(f * 9 + t * 4) * 1.5);
    }
    const c = pal(side < 0 ? shade(C.storm, -0.25) : C.storm, side < 0 ? null : C.rim, { l: C.stormL });
    ctx.globalAlpha = a;
    paintTube(ctx, pts, rs, c, {
      lw: 2,
      inside: (g) => {
        // spiralling wind bands
        g.strokeStyle = rgba(C.wind, 0.32); g.lineWidth = 1.8;
        for (let k = 2; k < n; k += 4) {
          const q = pts[k], q2 = pts[k + 1];
          const ang = atan2(q2[1] - q[1], q2[0] - q[0]);
          const ph = (t * 3 + k * 0.6) % 1;
          g.beginPath(); g.ellipse(q[0], q[1], 6, rs[k] * 1.05, ang, -1.4 + ph, 1.0 + ph); g.stroke();
        }
      },
    });
    // claws of compressed wind
    const end = pts[n], prev = pts[n - 2];
    const ang = atan2(end[1] - prev[1], end[0] - prev[0]);
    for (let i = 0; i < 4; i++) {
      const ca = ang + (i - 1.5) * 0.45 + sin(t * 3 + i) * 0.05;
      const cp = [], cr = [];
      for (let k = 0; k <= 6; k++) {
        const f = k / 6;
        const aa = ca + f * 0.9 * side;
        cp.push([end[0] + cos(ca) * 8 + cos(aa) * f * 34, end[1] + sin(ca) * 8 + sin(aa) * f * 34]);
        cr.push((1 - f) * 5 + 0.4);
      }
      paintTube(ctx, cp, cr, pal(C.hornT, null, { l: '#ffffff', o: shade(C.horn, -0.2) }), { lw: 1.4, shA: 0.3, hlA: 0.5 });
    }
    ctx.globalAlpha = 1;
  }

  // =============================================================================================
  // shared ghost props
  // =============================================================================================
  // paper charm 符 (anchor = top centre)
  function charmSpr(col, ink, seed) {
    return spr('m3charm:' + col + ':' + seed, 20, 42, 10, 4, (g) => {
      const r = U.seeded(seed * 97 + 3);
      const bot = [];
      for (let i = 0; i <= 6; i++) bot.push([7 - i * (14 / 6), 26 + r() * 7]);
      const p = poly([[-7, 0], [7, 0], ...bot]);
      const gr = g.createLinearGradient(-7, 0, 7, 30);
      gr.addColorStop(0, shade(col, 0.25)); gr.addColorStop(1, shade(col, -0.2));
      g.fillStyle = gr; g.fill(p);
      g.fillStyle = rgba('#6a4a20', 0.22);
      g.beginPath(); g.ellipse(-2 + r() * 4, 16 + r() * 8, 4, 3, 0, 0, TAU); g.fill();
      g.strokeStyle = shade(col, -0.5); g.lineWidth = 1; g.stroke(p);
      // abstract brush script (never a real legible charm)
      g.strokeStyle = ink; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-4, 4); g.lineTo(4, 4); g.moveTo(-3, 7); g.lineTo(3, 7); g.stroke();
      g.beginPath(); g.moveTo(0, 8);
      for (let k = 0; k < 6; k++) g.lineTo((k % 2 ? 3.5 : -3.5) * (0.6 + r() * 0.4), 11 + k * 3);
      g.stroke();
      g.lineWidth = 1; g.beginPath(); g.arc(0, 15, 3, 0, TAU); g.stroke();
    });
  }
  // 湯圓 bowl: porcelain bowl heaped with white & pink glutinous-rice balls
  function bowlSpr() {
    return spr('m3bowl', 60, 46, 30, 30, (g) => {
      // back rim + soup
      g.fillStyle = '#c8ccd4'; g.beginPath(); g.ellipse(0, -2, 24, 6, 0, 0, TAU); g.fill();
      g.fillStyle = '#e8d6b0'; g.beginPath(); g.ellipse(0, -1.5, 21.5, 4.6, 0, 0, TAU); g.fill();
      const balls = [[-12, -5, 0], [12, -5, 1], [0, -7, 0], [-6, -13, 1], [7, -13, 0], [0, -19, 0]];
      for (const [bx, by, pk] of balls) {
        ball(g, bx, by, 6.6, pal(pk ? '#f4b4c2' : '#f6f1e8', null, { l: '#ffffff', o: pk ? '#b06878' : '#a89c8c' }), { lw: 1, specA: 0.8 });
      }
      // bowl body
      const b = new Path2D();
      b.moveTo(-24, -2); b.bezierCurveTo(-22, 10, -12, 15, -8, 15); b.lineTo(8, 15); b.bezierCurveTo(12, 15, 22, 10, 24, -2);
      b.ellipse(0, -2, 24, 6, 0, 0, PI, false);
      b.closePath();
      const gr = g.createLinearGradient(-24, 0, 24, 14);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e6e8ee'); gr.addColorStop(1, '#a8b0c0');
      g.fillStyle = gr; g.fill(b);
      g.save(); g.clip(b);
      g.strokeStyle = '#2a5aa8'; g.lineWidth = 2.2;
      g.beginPath(); g.ellipse(0, 1.5, 24, 6, 0, 0.05, PI - 0.05); g.stroke();
      g.fillStyle = '#3a6ab8';
      for (const fx of [-12, 0, 12]) {
        g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * TAU / 5; g.moveTo(fx, 9); g.ellipse(fx + cos(a) * 2.2, 9 + sin(a) * 1.6, 1.3, 0.9, a, 0, TAU); } g.fill();
      }
      g.restore();
      g.strokeStyle = '#6a7488'; g.lineWidth = 1.2; g.stroke(b);
      g.fillStyle = '#d0d4dc'; g.fillRect(-8, 14, 16, 3); g.strokeRect(-8, 14, 16, 3);
    });
  }
  // cracked medicine gourd 葫蘆
  function gourdSpr(col, glowc) {
    return spr('m3gourd:' + col, 40, 56, 20, 10, (g) => {
      const c = pal(col, null, { l: shade(col, 0.4) });
      ball(g, 0, 26, 13, c, { lw: 1.6 });
      ball(g, 0, 7, 8.5, c, { lw: 1.6 });
      g.fillStyle = '#b02a20'; g.fillRect(-6, 13, 12, 3.4);
      g.strokeStyle = '#b02a20'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(5, 15); g.quadraticCurveTo(9, 22, 6, 30); g.stroke();
      g.fillStyle = '#5a3a1a'; g.fillRect(-2.5, -4, 5, 6);
      g.strokeStyle = '#1a1a10'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(-6, 20); g.lineTo(-2, 26); g.lineTo(-7, 32); g.lineTo(-3, 36); g.stroke();
      g.strokeStyle = glowc; g.lineWidth = 1; g.stroke();
    });
  }

  // =============================================================================================
  // 山鬼 mountain_ghost — gaunt, mossy mountain ghost (山魈-like), twig antlers, crooked staff
  // =============================================================================================
  const MG = [
    { skin: '#7c8a6e', moss: '#46682f', mossL: '#8aac52', hair: '#26321e', eye: '#eef088', rim: '#c8f0a0', twig: '#5a4630', mist: '#b0c8b8' },
    { skin: '#8c7a68', moss: '#6e5a26', mossL: '#c09a3a', hair: '#30261a', eye: '#ffb050', rim: '#ffd8a0', twig: '#4a3420', mist: '#c8b8a0' },
    { skin: '#5c6474', moss: '#284652', mossL: '#4a8e8e', hair: '#161e28', eye: '#86f2ff', rim: '#a8e8ff', twig: '#3a3440', mist: '#a0b8d0' },
  ];
  function mgBody(v) {
    const C = MG[v];
    const sk = pal(C.skin, C.rim);
    const skD = pal(shade(C.skin, -0.2), null);
    return spr('mg:body:' + v, 170, 210, 70, 200, (g) => {
      // back leg
      paintTube(g, [[-6, -84], [-14, -64], [-20, -46], [-17, -26], [-14, -8]], [7, 6, 5.5, 4.4, 4], skD, { lw: 1.6, shA: 0.35 });
      g.fillStyle = skD.d; g.strokeStyle = skD.o; g.lineWidth = 1.4;
      const f1 = smooth([[-20, -10], [-8, -8], [6, -4], [8, -1], [-18, -1]]); g.fill(f1); g.stroke(f1);
      // moss cloak (behind torso)
      const cloak = tufted([[-28, -170], [4, -178], [30, -164], [36, -146], [14, -140], [-6, -138], [-16, -116], [-24, -88], [-34, -62], [-44, -96], [-44, -140]], 6, 3, 5);
      paint(g, cloak, -44, -178, 80, 116, pal(C.moss, C.rim, { l: C.mossL }), { lw: 2, hl: 0.35, rimA: 0.5,
        inside: (c) => {
          for (let i = 0; i < 40; i++) {
            const px = -42 + U.hash(i, 1, 7) * 76, py = -176 + U.hash(i, 2, 7) * 112;
            c.fillStyle = rgba(i % 3 ? C.mossL : shade(C.moss, -0.4), 0.45);
            c.beginPath(); c.arc(px, py, 2 + U.hash(i, 3, 7) * 3, 0, TAU); c.fill();
          }
        } });
      // hanging moss strands from the cloak hem
      for (let i = 0; i < 9; i++) {
        const sx = -40 + i * 5, sy = -96 + i * 4 - (i > 5 ? 20 : 0);
        g.strokeStyle = rgba(i % 2 ? C.moss : shade(C.moss, -0.3), 0.9); g.lineWidth = 2;
        g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx - 3, sy + 14, sx + 1, sy + 22 + (i % 3) * 6); g.stroke();
      }
      // front leg
      paintTube(g, [[8, -84], [17, -66], [24, -48], [20, -28], [16, -8]], [7.5, 6.5, 6, 5, 4.5], sk, { lw: 1.8, shA: 0.4, rimW: 4 });
      g.fillStyle = rgba(shade(C.skin, 0.35), 0.5); g.beginPath(); g.ellipse(22, -50, 3, 4, 0.3, 0, TAU); g.fill();
      const f2 = smooth([[8, -11], [22, -9], [36, -4], [38, 0], [8, 0]]);
      paint(g, f2, 8, -11, 30, 11, sk, { lw: 1.5 });
      g.strokeStyle = '#2a2a20'; g.lineWidth = 1.4;
      for (const tx of [30, 35, 39]) { g.beginPath(); g.moveTo(tx - 2, -1); g.lineTo(tx + 2, 0.5); g.stroke(); }
      // moss loin skirt
      const skirt = tufted([[-18, -100], [18, -100], [24, -78], [12, -66], [-4, -70], [-20, -64], [-24, -84]], 5, 3, 9);
      paint(g, skirt, -24, -100, 48, 36, pal(C.moss, C.rim, { l: C.mossL }), { lw: 1.6, hl: 0.3 });
      // gaunt hunched torso
      const torso = smooth([[-12, -96], [-20, -122], [-14, -146], [4, -158], [26, -152], [34, -134], [28, -110], [14, -94]]);
      paint(g, torso, -20, -158, 54, 64, sk, { lw: 2, hl: 0.35, rimW: 7,
        inside: (c) => {
          c.strokeStyle = rgba(shade(C.skin, -0.5), 0.6); c.lineWidth = 1.6;
          for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(8, -134 + i * 9, 18, 0.15, 0.75); c.stroke(); }
          c.strokeStyle = rgba(shade(C.skin, 0.4), 0.4); c.lineWidth = 1.2;
          for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(8, -137 + i * 9, 18, 0.2, 0.6); c.stroke(); }
          // bark texture
          c.strokeStyle = rgba(shade(C.skin, -0.45), 0.35); c.lineWidth = 1;
          for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(-16 + i * 6, -150); c.quadraticCurveTo(-12 + i * 6, -124, -14 + i * 6, -98); c.stroke(); }
        } });
      // moss over the shoulders (front)
      const mant = tufted([[-14, -160], [10, -168], [32, -156], [36, -142], [20, -146], [2, -146], [-12, -138]], 4, 3, 13);
      paint(g, mant, -14, -168, 50, 30, pal(C.moss, C.rim, { l: C.mossL }), { lw: 1.6, hl: 0.4 });
      // tiny ferns on the shoulder
      g.strokeStyle = C.mossL; g.lineWidth = 1.4;
      for (const [fx, fy, a] of [[-6, -166, -0.5], [6, -170, -0.1], [20, -164, 0.4]]) {
        g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + sin(a) * 10, fy - 10, fx + sin(a) * 18 + 4, fy - 14); g.stroke();
        for (let k = 1; k < 5; k++) {
          const px = fx + sin(a) * k * 4 + k * 0.8, py = fy - k * 3.4;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px - 4, py - 2); g.moveTo(px, py); g.lineTo(px + 3, py - 4); g.stroke();
        }
      }
    });
  }
  function mgHead(v) {
    const C = MG[v];
    const sk = pal(C.skin, C.rim);
    return spr('mg:head:' + v, 110, 130, 50, 70, (g) => {
      // twig antlers
      g.strokeStyle = C.twig; g.lineCap = 'round';
      for (const [bx, s] of [[-8, 0.8], [6, 1]]) {
        g.lineWidth = 4 * s; g.beginPath(); g.moveTo(bx, -22); g.quadraticCurveTo(bx - 10 * s, -42 * s, bx - 4 * s, -58 * s); g.stroke();
        g.lineWidth = 2.6 * s; g.beginPath(); g.moveTo(bx - 7 * s, -38 * s); g.quadraticCurveTo(bx - 20 * s, -44 * s, bx - 24 * s, -54 * s); g.stroke();
        g.beginPath(); g.moveTo(bx - 4 * s, -50 * s); g.lineTo(bx + 6 * s, -60 * s); g.stroke();
        g.fillStyle = C.mossL; g.beginPath(); g.ellipse(bx - 24 * s, -56 * s, 4, 2, -0.6, 0, TAU); g.fill();
      }
      g.strokeStyle = rgba('#ffffff', 0.25); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(5, -24); g.quadraticCurveTo(-4, -42, 1, -56); g.stroke();
      // mossy hair hanging down the back of the skull
      const hair = tufted([[-6, -30], [6, -30], [0, -8], [-6, 22], [-16, 46], [-28, 32], [-24, 2], [-18, -22]], 4, 3, 3);
      paint(g, hair, -28, -30, 34, 76, pal(shade(C.moss, -0.35), null, { l: C.moss, o: shade(C.hair, -0.2) }), { lw: 1.4, hl: 0.25 });
      // long gaunt head (3/4 right) with jutting jaw
      const head = smooth([[-12, -22], [2, -30], [18, -26], [26, -14], [29, -2], [33, 10], [28, 20], [16, 26], [6, 22], [-4, 10], [-12, -6]]);
      paint(g, head, -12, -30, 45, 56, sk, { lw: 2, hl: 0.45, rimW: 6,
        inside: (c) => {
          c.fillStyle = rgba(shade(C.skin, -0.55), 0.5);
          c.beginPath(); c.ellipse(15, 9, 8, 4.5, -0.4, 0, TAU); c.fill(); // cheek hollow
          for (const [ex, ey, r] of [[16, -6, 9], [4, -6, 6.5]]) {
            const sg = c.createRadialGradient(ex, ey, 1, ex, ey, r);
            sg.addColorStop(0, rgba('#05060a', 0.95)); sg.addColorStop(0.6, rgba('#05060a', 0.6)); sg.addColorStop(1, rgba('#05060a', 0));
            c.fillStyle = sg; c.fillRect(ex - 12, ey - 12, 24, 24);
          }
          // bark wrinkles
          c.strokeStyle = rgba(shade(C.skin, -0.5), 0.45); c.lineWidth = 1;
          c.beginPath(); c.moveTo(0, -24); c.quadraticCurveTo(8, -20, 18, -22); c.moveTo(-6, -16); c.quadraticCurveTo(4, -14, 10, -16); c.stroke();
          c.fillStyle = rgba(C.mossL, 0.5);
          c.beginPath(); c.arc(-6, -14, 3, 0, TAU); c.arc(-2, 6, 2.4, 0, TAU); c.fill();
        } });
      // heavy brow
      g.strokeStyle = shade(C.skin, -0.6); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(8, -14); g.quadraticCurveTo(16, -17, 26, -12); g.stroke();
      // nose ridge
      g.strokeStyle = rgba(shade(C.skin, -0.55), 0.8); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(24, -8); g.quadraticCurveTo(30, 0, 27, 4); g.stroke();
      // underbite mouth & thin teeth
      g.strokeStyle = '#1a140e'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(12, 15); g.quadraticCurveTo(22, 17, 31, 11); g.stroke();
      g.fillStyle = '#e0dcc4';
      for (const tx of [17, 22, 27]) { g.beginPath(); g.moveTo(tx - 1.3, 16); g.lineTo(tx, 11.5); g.lineTo(tx + 1.3, 15.5); g.fill(); }
      // a few strands over the crown, falling back
      for (let i = 0; i < 5; i++) {
        const sx = -6 + i * 4;
        g.strokeStyle = i % 2 ? C.hair : shade(C.moss, -0.2); g.lineWidth = 2 - (i % 2) * 0.6;
        g.beginPath(); g.moveTo(sx + 4, -29); g.quadraticCurveTo(sx - 6, -18, sx - 12 - i * 2, 4 + i * 7); g.stroke();
      }
      g.strokeStyle = shade(C.moss, -0.2); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(14, -28); g.quadraticCurveTo(10, -14, 6, 4); g.stroke();
    });
  }
  def('mountain_ghost', 150, 200, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = MG[P.v];
    const sk = pal(C.skin, C.rim), skD = pal(shade(C.skin, -0.2), null);
    ctx.translate(x + P.shake - P.hurt * 8, y);
    // mist at feet (back)
    for (let i = 0; i < 6; i++) {
      const f = (t * 0.15 + i / 6) % 1;
      puff(ctx, -60 + i * 22 + sin(t + i) * 6, -6 - f * 14, 26 + i % 3 * 6, C.mist, 0.22 * sin(f * PI));
    }
    const breath = sin(t * 1.4);
    const lean = P.atk * 0.14 - P.wind * 0.08 - P.hurt * 0.16 + breath * 0.012;
    ctx.save();
    ctx.translate(0, -2); ctx.rotate(lean); ctx.translate(0, 2);
    // back arm + staff
    const bS = [-4, -148], bE = [-16, -112 + breath], bH = [-10, -84 + breath];
    const sx0 = -12 + P.cast * 6, sTop = -186 - P.cast * 20;
    ctx.strokeStyle = shade(C.twig, -0.4); ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(sx0 - 2, sTop); ctx.quadraticCurveTo(sx0 - 10, -110, -6, -2); ctx.stroke();
    ctx.strokeStyle = C.twig; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx0 - 2, sTop); ctx.quadraticCurveTo(sx0 - 10, -110, -6, -2); ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.25); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sx0 - 4, sTop + 6); ctx.quadraticCurveTo(sx0 - 12, -110, -8, -10); ctx.stroke();
    // staff head knot with moss & a glowing spore
    ctx.fillStyle = C.moss; ctx.beginPath(); ctx.ellipse(sx0 - 2, sTop + 4, 8, 5, 0.3, 0, TAU); ctx.fill();
    glow(ctx, sx0 - 1, sTop - 4, 14 + P.cp * 14, C.eye, 0.5 + P.cp * 0.5);
    paintTube(ctx, [bS, bE, bH], [5, 4, 3.5], skD, { lw: 1.6, shA: 0.3 });
    ctx.fillStyle = skD.b; ctx.strokeStyle = skD.o; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(bH[0] - 1, bH[1], 5.5, 6.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // body
    put(ctx, mgBody(P.v), 0, 0, 1, 0, 1 + breath * 0.01);
    // head
    const hx = 40 + P.atk * 8 - P.hurt * 4, hy = -150 + breath * 1.5 + P.hurt * 4;
    put(ctx, mgHead(P.v), hx, hy, 1, P.atk * 0.12 - P.hurt * 0.15);
    // eyes
    const fl = 0.8 + 0.2 * sin(t * 7) * sin(t * 3.1);
    for (const [ex, ey, s] of [[hx + 4, hy - 6, 0.7], [hx + 16, hy - 6, 1]]) {
      glow(ctx, ex, ey, 14 * s, C.eye, 0.8 * fl);
      ctx.fillStyle = '#fffff0'; ctx.beginPath(); ctx.arc(ex, ey, 2.2 * s * (1 - P.hurt * 0.5), 0, TAU); ctx.fill();
    }
    // front arm (long, clawed)
    let E = [52, -112 + breath], H = [60, -74 + breath];
    E = [lerp(E[0], 44, P.wind), lerp(E[1], -170, P.wind)]; H = [lerp(H[0], 26, P.wind), lerp(H[1], -204, P.wind)];
    E = [lerp(E[0], 76, P.atk), lerp(E[1], -136, P.atk)]; H = [lerp(H[0], 112, P.atk), lerp(H[1], -112, P.atk)];
    E = [lerp(E[0], 60, P.cast), lerp(E[1], -150, P.cast)]; H = [lerp(H[0], 74, P.cast), lerp(H[1], -184, P.cast)];
    const S = [28, -148];
    paintTube(ctx, [S, [lerp(S[0], E[0], 0.5) + 2, lerp(S[1], E[1], 0.5)], E, [lerp(E[0], H[0], 0.5), lerp(E[1], H[1], 0.5)], H], [6.5, 5, 4.6, 4, 3.6], sk, { lw: 1.6, shA: 0.35, rimW: 3 });
    // hanging moss on the forearm
    ctx.strokeStyle = rgba(C.moss, 0.95); ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const f = 0.3 + i * 0.22, px = lerp(E[0], H[0], f), py = lerp(E[1], H[1], f);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px - 4 + sin(t * 2 + i) * 3, py + 10, px - 2 + sin(t * 2 + i) * 5, py + 18 + i * 3); ctx.stroke();
    }
    // long clawed fingers
    const ang = atan2(H[1] - E[1], H[0] - E[0]);
    for (let i = 0; i < 4; i++) {
      const a = ang + (i - 1.5) * 0.3 - P.atk * 0.5;
      const k1 = [H[0] + cos(a) * 10, H[1] + sin(a) * 10];
      const a2 = a + 0.6 - P.atk * 0.4;
      const k2 = [k1[0] + cos(a2) * 11, k1[1] + sin(a2) * 11];
      ctx.strokeStyle = sk.o; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(H[0], H[1]); ctx.lineTo(k1[0], k1[1]); ctx.lineTo(k2[0], k2[1]); ctx.stroke();
      ctx.strokeStyle = C.skin; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(H[0], H[1]); ctx.lineTo(k1[0], k1[1]); ctx.lineTo(k2[0], k2[1]); ctx.stroke();
      ctx.strokeStyle = '#e8e4d0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(k2[0], k2[1]); ctx.lineTo(k2[0] + cos(a2 + 0.5) * 5, k2[1] + sin(a2 + 0.5) * 5); ctx.stroke();
    }
    ball(ctx, H[0], H[1], 5, sk, { spec: false, lw: 1.4 });
    if (P.atk > 0.3) for (let i = 0; i < 3; i++) streak(ctx, [[H[0] - 50, H[1] - 60 + i * 10], [H[0] - 10, H[1] - 26 + i * 8], [H[0] + 14, H[1] + 4 + i * 6]], 2.4, C.rim, 0.55 * P.atk);
    ctx.restore();
    // drifting spores / fireflies
    for (let i = 0; i < 5; i++) {
      const f = (t * 0.12 + i * 0.21) % 1;
      const fx = -50 + i * 26 + sin(t * 0.9 + i * 2) * 12, fy = -30 - f * 170;
      glow(ctx, fx, fy, 7, C.eye, 0.7 * sin(f * PI) * (0.5 + 0.5 * sin(t * 5 + i)));
    }
    // front mist
    for (let i = 0; i < 4; i++) puff(ctx, -40 + i * 30 + sin(t * 0.7 + i) * 8, -2, 22, C.mist, 0.18);
    if (P.cast > 0) {
      glow(ctx, 0, -100, 110, C.eye, 0.25 * P.cp);
      for (let i = 0; i < 6; i++) {
        const a = t * 1.5 + i * TAU / 6;
        glow(ctx, cos(a) * 70, -100 + sin(a) * 26, 10, C.eye, P.cast * 0.8);
      }
    }
  });

  // =============================================================================================
  // 瘟鬼 plague_ghost — sickly robed plague spirit, tattered paper charms, cracked gourd of miasma
  // (a wandering pestilence ghost — never a 王爺 or any deity)
  // =============================================================================================
  const PG = [
    { robe: '#87917c', skin: '#b4c09c', hair: '#1e2420', mias: '#9ccc5c', miasD: '#4a5a2a', eye: '#eaff74', charm: '#e6c45a', ink: '#a8281e', rim: '#d8ffa0', gourd: '#b89a5a' },
    { robe: '#7c6c8c', skin: '#c0b4c8', hair: '#1c1624', mias: '#b884d8', miasD: '#4a2a5a', eye: '#ffa8ff', charm: '#dcc070', ink: '#7a1e3a', rim: '#f0c8ff', gourd: '#8a6a5a' },
    { robe: '#5c5242', skin: '#c4b48c', hair: '#1a140c', mias: '#d4b040', miasD: '#5a4a1a', eye: '#ffd84a', charm: '#e8d070', ink: '#8a1a10', rim: '#ffe8a0', gourd: '#6a5a3a' },
  ];
  function pgBody(v) {
    const C = PG[v];
    const rb = pal(C.robe, C.rim, { l: shade(C.robe, 0.28) });
    return spr('pg:body:' + v, 150, 200, 70, 196, (g) => {
      const robe = smooth([[-6, -150], [20, -148], [32, -130], [34, -100], [40, -70], [46, -44], [34, -40], [36, -24], [22, -32], [14, -16], [4, -34], [-6, -20], [-14, -38], [-26, -26], [-30, -46], [-42, -40], [-38, -70], [-40, -100], [-34, -128], [-22, -146]]);
      paint(g, robe, -42, -150, 88, 134, rb, { lw: 2, hl: 0.3, rimW: 8, rimA: 0.55,
        inside: (c) => {
          // folds
          c.strokeStyle = rgba(shade(C.robe, -0.45), 0.5); c.lineWidth = 2.2;
          for (const [fx, a] of [[-24, -0.08], [-8, 0.02], [10, 0.08], [26, 0.12]]) {
            c.beginPath(); c.moveTo(fx, -120); c.quadraticCurveTo(fx + a * 60, -80, fx + a * 120, -36); c.stroke();
          }
          c.strokeStyle = rgba(shade(C.robe, 0.35), 0.35); c.lineWidth = 1.4;
          for (const [fx, a] of [[-20, -0.08], [-4, 0.02], [14, 0.08]]) {
            c.beginPath(); c.moveTo(fx, -118); c.quadraticCurveTo(fx + a * 60, -80, fx + a * 120, -38); c.stroke();
          }
          // stains & holes
          for (let i = 0; i < 6; i++) {
            c.fillStyle = rgba(i % 2 ? C.miasD : '#1a1a14', 0.3);
            c.beginPath(); c.ellipse(-30 + U.hash(i, 1, 4) * 64, -120 + U.hash(i, 2, 4) * 80, 3 + U.hash(i, 3, 4) * 5, 2 + U.hash(i, 4, 4) * 4, 0, 0, TAU); c.fill();
          }
          // crossed collar 交領 and sash
          c.strokeStyle = shade(C.robe, -0.55); c.lineWidth = 5;
          c.beginPath(); c.moveTo(-10, -146); c.quadraticCurveTo(8, -128, 26, -100); c.stroke();
          c.strokeStyle = shade(C.robe, 0.3); c.lineWidth = 2;
          c.beginPath(); c.moveTo(-10, -148); c.quadraticCurveTo(8, -130, 26, -102); c.stroke();
          c.fillStyle = shade(C.robe, -0.5); c.fillRect(-44, -96, 90, 9);
          c.strokeStyle = rgba(C.charm, 0.5); c.lineWidth = 1; c.strokeRect(-44, -96, 90, 9);
        } });
      // stuck charms
      put(g, charmSpr(C.charm, C.ink, 1), 16, -112, 1, 0.18);
      put(g, charmSpr(C.charm, C.ink, 2), -26, -84, 0.9, -0.28);
      put(g, charmSpr(C.charm, C.ink, 3), 24, -64, 0.85, 0.08);
    });
  }
  function pgHead(v) {
    const C = PG[v];
    const sk = pal(C.skin, C.rim);
    return spr('pg:head:' + v, 90, 100, 40, 40, (g) => {
      const hairB = smooth([[-18, -22], [2, -30], [18, -22], [16, 10], [10, 46], [-8, 50], [-22, 30], [-24, 0]]);
      paint(g, hairB, -24, -30, 42, 80, pal(C.hair, null, { l: shade(C.hair, 0.3) }), { lw: 1.6, hl: 0.2 });
      const face = smooth([[-8, -20], [8, -22], [20, -12], [22, 4], [16, 18], [6, 22], [-4, 16], [-10, 0]]);
      paint(g, face, -10, -22, 32, 44, sk, { lw: 1.8, hl: 0.4,
        inside: (c) => {
          c.fillStyle = rgba(C.miasD, 0.35); c.fillRect(-12, 6, 40, 20);
          for (const [ex, ey, r] of [[4, -2, 6], [15, -2, 7]]) {
            const sg = c.createRadialGradient(ex, ey, 1, ex, ey, r * 1.4);
            sg.addColorStop(0, rgba('#100c08', 0.95)); sg.addColorStop(0.6, rgba(C.miasD, 0.6)); sg.addColorStop(1, rgba(C.miasD, 0));
            c.fillStyle = sg; c.fillRect(ex - 12, ey - 12, 24, 24);
          }
          // sores
          c.fillStyle = rgba(C.mias, 0.55);
          c.beginPath(); c.arc(-4, 10, 2, 0, TAU); c.arc(18, 12, 1.6, 0, TAU); c.fill();
        } });
      g.strokeStyle = '#2a2018'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(8, 14); g.quadraticCurveTo(13, 12, 18, 15); g.stroke();
      // straggly hair: parted fringe, strands falling down the back and one framing the face
      g.fillStyle = C.hair;
      g.beginPath(); g.moveTo(-10, -18); g.quadraticCurveTo(4, -28, 20, -12); g.quadraticCurveTo(10, -18, 6, -12); g.quadraticCurveTo(0, -16, -8, -6); g.closePath(); g.fill();
      for (let i = 0; i < 5; i++) {
        g.strokeStyle = C.hair; g.lineWidth = 2 - (i % 2) * 0.6;
        const sx = -12 + i * 2.6;
        g.beginPath(); g.moveTo(sx + 4, -22); g.quadraticCurveTo(sx - 4, 0, sx - 8 + (i % 3) * 2, 30 + (i % 3) * 10); g.stroke();
      }
      g.strokeStyle = C.hair; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(19, -12); g.quadraticCurveTo(22, 6, 18, 26); g.stroke();
    });
  }
  def('plague_ghost', 150, 190, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = PG[P.v];
    const rb = pal(C.robe, C.rim, { l: shade(C.robe, 0.28) });
    const sk = pal(C.skin, C.rim);
    ctx.translate(x + P.shake - P.hurt * 8, y);
    const bob = sin(t * 1.6) * 5 - 10;
    // miasma behind
    for (let i = 0; i < 7; i++) {
      const f = (t * 0.12 + i / 7) % 1;
      puff(ctx, -50 + (i * 23) % 100 + sin(t * 0.8 + i) * 10, -20 - f * 150, 22 + (i % 3) * 8 + f * 10, i % 2 ? C.mias : C.miasD, 0.3 * sin(f * PI) * (1 + P.cp));
    }
    ctx.translate(0, bob);
    const lean = P.atk * 0.12 - P.wind * 0.08 - P.hurt * 0.12;
    ctx.rotate(lean);
    // wisps below the hem
    for (let i = 0; i < 5; i++) {
      const pts = [], rs = [];
      const sx = -30 + i * 15;
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        pts.push([sx + sin(t * 2.2 + f * 4 + i) * 6 * f - f * 10, -30 + f * 34]);
        rs.push((1 - f) * 6 + 0.3);
      }
      const p = tube(pts, rs);
      const gg = ctx.createLinearGradient(0, -30, 0, 6);
      gg.addColorStop(0, rgba(C.robe, 0.85)); gg.addColorStop(1, rgba(C.robe, 0));
      ctx.fillStyle = gg; ctx.fill(p);
    }
    // back sleeve
    const breath = sin(t * 1.3);
    paintTube(ctx, [[-22, -136], [-32, -112], [-36, -84 + breath * 2]], [8, 10, 15], pal(shade(C.robe, -0.18), null), { lw: 1.8 });
    put(ctx, pgBody(P.v), 0, 0);
    // fluttering charms on strings from the sash
    for (let i = 0; i < 2; i++) {
      const ax = -30 + i * 54, ay = -88;
      const sw = sin(t * 3 + i * 2) * 0.35 + 0.2 - P.atk * 0.4;
      ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + sin(sw) * 12, ay + cos(sw) * 12); ctx.stroke();
      put(ctx, charmSpr(C.charm, C.ink, 4 + i), ax + sin(sw) * 12, ay + cos(sw) * 12, 0.8, -sw * 0.8, 0.8 * (0.85 + 0.15 * cos(t * 6 + i)));
    }
    // head
    const hx = 8 + P.atk * 6, hy = -158 + breath * 1.5;
    put(ctx, pgHead(P.v), hx, hy, 1, 0.1 + P.atk * 0.08 - P.hurt * 0.15);
    const fl = 0.75 + 0.25 * sin(t * 6);
    for (const [ex, ey, s] of [[hx + 4, hy - 1, 0.8], [hx + 15, hy - 1, 1]]) {
      glow(ctx, ex, ey, 10 * s, C.eye, 0.6 * fl);
      ctx.fillStyle = C.eye; ctx.beginPath(); ctx.arc(ex, ey, 1.6 * s, 0, TAU); ctx.fill();
    }
    // front sleeve + hand + gourd
    let H = [46, -84 + breath * 2];
    H = [lerp(H[0], 30, P.wind), lerp(H[1], -122, P.wind)];
    H = [lerp(H[0], 84, P.atk), lerp(H[1], -112, P.atk)];
    H = [lerp(H[0], 46, P.cast), lerp(H[1], -150, P.cast)];
    const S = [18, -132];
    const E = [lerp(S[0], H[0], 0.45) + 4, lerp(S[1], H[1], 0.45) + 6];
    const sv = tube([S, E, [H[0] - 7, H[1] - 1]], [8, 10, 16]);
    paint(ctx, sv, S[0] - 8, S[1] - 8, H[0] - S[0] + 16, H[1] - S[1] + 20, rb, { lw: 2, rimW: 5, hl: 0.35,
      inside: (c) => {
        c.strokeStyle = rgba(shade(C.robe, -0.45), 0.55); c.lineWidth = 1.6;
        for (let i = 1; i <= 3; i++) { const q = [lerp(S[0], H[0], i * 0.22), lerp(S[1], H[1], i * 0.22)]; c.beginPath(); c.arc(q[0] + 8, q[1] - 2, 9 + i * 2, 1.6, 3.2); c.stroke(); }
      } });
    ctx.fillStyle = rgba('#0a0c08', 0.6); ctx.beginPath(); ctx.ellipse(H[0] - 6, H[1] - 1, 5, 14, 0.35, 0, TAU); ctx.fill();
    // bony hand
    ctx.strokeStyle = sk.o; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(H[0] - 4, H[1]); ctx.lineTo(H[0] + 6, H[1] + 2); ctx.stroke();
    ctx.strokeStyle = C.skin; ctx.lineWidth = 2.6; ctx.stroke();
    const gx = H[0] + 8, gy = H[1] - 2;
    put(ctx, gourdSpr(C.gourd, C.mias), gx, gy, 0.9, 0.5 + P.atk * 0.9 - P.cast * 0.3);
    ctx.strokeStyle = sk.o; ctx.lineWidth = 3.6;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(H[0] + 4, H[1] + i * 3 - 2); ctx.quadraticCurveTo(H[0] + 12, H[1] + i * 3 - 4, H[0] + 12, H[1] + i * 3 + 2); ctx.stroke(); }
    ctx.strokeStyle = C.skin; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(H[0] + 4, H[1] + i * 3 - 2); ctx.quadraticCurveTo(H[0] + 12, H[1] + i * 3 - 4, H[0] + 12, H[1] + i * 3 + 2); ctx.stroke(); }
    // miasma pouring from the gourd crack
    const pour = 0.4 + P.atk * 1.2 + P.cast * 0.8;
    for (let i = 0; i < 5; i++) {
      const f = (t * 0.6 + i / 5) % 1;
      const px = gx + 10 + f * (16 + P.atk * 60), py = gy + 18 + f * (10 - P.cast * 40) + sin(t * 3 + i) * 3;
      puff(ctx, px, py, 8 + f * 18, C.mias, 0.4 * (1 - f) * pour);
    }
    glow(ctx, gx + 6, gy + 18, 14, C.mias, 0.5 * fl);
    ctx.rotate(-lean);
    // front miasma
    for (let i = 0; i < 4; i++) {
      const f = (t * 0.1 + i / 4 + 0.13) % 1;
      puff(ctx, -40 + i * 30 + sin(t + i) * 8, -10 - f * 130, 16 + f * 12, C.mias, 0.18 * sin(f * PI));
    }
    if (P.cast > 0) {
      for (let i = 0; i < 6; i++) {
        const a = t * 1.8 + i * TAU / 6;
        puff(ctx, cos(a) * 64, -96 + sin(a) * 22, 18, C.mias, 0.45 * P.cast);
      }
      glow(ctx, 0, -100, 90, C.mias, 0.25 * P.cp);
    }
  });

  // =============================================================================================
  // 貪鬼 greed_ghost — bloated ghost hoarding 湯圓 bowls and strings of coins (半屏山 greed tale)
  // =============================================================================================
  const GG = [
    { body: '#b2a2c6', belly: '#e6dcf0', eye: '#ffd84a', rim: '#fff0b0', mouth: '#4a1a2a', tongue: '#e0607a', glowc: '#ffd060' },
    { body: '#9ab894', belly: '#dcecd4', eye: '#ffe060', rim: '#f4ffc0', mouth: '#2a3a1a', tongue: '#d86a6a', glowc: '#e8e060' },
    { body: '#c48c88', belly: '#f2d8d0', eye: '#ffc040', rim: '#ffd8b0', mouth: '#4a1414', tongue: '#e85a5a', glowc: '#ffa040' },
  ];
  function ggBody(v) {
    const C = GG[v];
    const bc = pal(C.body, C.rim, { l: shade(C.body, 0.35) });
    return spr('gg:body:' + v, 180, 190, 84, 186, (g) => {
      const body = smooth([[-8, -160], [20, -162], [40, -146], [52, -118], [60, -86], [56, -56], [36, -38], [4, -32], [-28, -38], [-50, -58], [-56, -90], [-48, -124], [-30, -150]]);
      paint(g, body, -56, -162, 116, 130, bc, { lw: 2.4, hl: 0.45, rimW: 10, rimA: 0.6,
        inside: (c) => {
          const bg = c.createRadialGradient(14, -70, 4, 14, -70, 50);
          bg.addColorStop(0, rgba(C.belly, 0.85)); bg.addColorStop(1, rgba(C.belly, 0));
          c.fillStyle = bg; c.fillRect(-40, -130, 110, 100);
          // belly stretch lines & navel
          c.strokeStyle = rgba(shade(C.body, -0.3), 0.4); c.lineWidth = 1.4;
          c.beginPath(); c.arc(18, -70, 34, 0.4, 1.4); c.stroke();
          c.beginPath(); c.arc(18, -70, 26, 0.5, 1.3); c.stroke();
          c.fillStyle = rgba(shade(C.body, -0.4), 0.7); c.beginPath(); c.ellipse(22, -62, 3, 2, 0, 0, TAU); c.fill();
        } });
      // ghostly crown curl
      const curl = smooth([[-6, -158], [-2, -172], [8, -178], [14, -172], [8, -168], [6, -160]]);
      paint(g, curl, -6, -178, 20, 20, bc, { lw: 2, hl: 0.4 });
      // cheeks
      for (const [cx, cy, r] of [[48, -110, 12], [10, -112, 9]]) {
        const cp = new Path2D(); cp.ellipse(cx, cy, r, r * 0.8, 0, 0, TAU);
        g.fillStyle = rgba('#ff8aa0', 0.28); g.fill(cp);
      }
    });
  }
  def('greed_ghost', 170, 180, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = GG[P.v];
    const bc = pal(C.body, C.rim, { l: shade(C.body, 0.35) });
    ctx.translate(x + P.shake - P.hurt * 8, y);
    const bob = sin(t * 1.8) * 4 - 8;
    const breath = sin(t * 2);
    // tail wisp
    const tp = [], tr = [];
    for (let k = 0; k <= 12; k++) {
      const f = k / 12;
      tp.push([-10 - f * 40 + sin(t * 2.5 + f * 5) * 6 * f, -40 + bob + f * 34 - f * f * 10]);
      tr.push((1 - f) * 22 + 1);
    }
    ctx.globalAlpha = 0.9;
    paintTube(ctx, tp, tr, bc, { lw: 2, shA: 0.25 });
    ctx.globalAlpha = 1;
    ctx.translate(0, bob);
    const lean = P.atk * 0.1 - P.wind * 0.1 - P.hurt * 0.12;
    ctx.rotate(lean);
    // back arm raising the coin string
    let H = [-34, -132 + breath];
    H = [lerp(H[0], -50, P.wind), lerp(H[1], -160, P.wind)];
    H = [lerp(H[0], 30, P.atk), lerp(H[1], -150, P.atk)];
    H = [lerp(H[0], -30, P.cast), lerp(H[1], -170, P.cast)];
    paintTube(ctx, [[-36, -112], [lerp(-36, H[0], 0.5) - 6, lerp(-112, H[1], 0.5)], H], [12, 10, 9], pal(shade(C.body, -0.12), null, { l: C.body }), { lw: 2 });
    // coin string (錢串) swinging
    const swing = sin(t * 2.4) * 0.35 + P.atk * 1.6 - P.wind * 0.6;
    const n = 9;
    ctx.strokeStyle = '#b02a20'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(H[0], H[1]);
    const cps = [];
    for (let i = 1; i <= n; i++) {
      const a = swing * (0.4 + i / n * 0.8);
      const px = H[0] + sin(a) * i * 6.4, py = H[1] + cos(a) * i * 6.4;
      ctx.lineTo(px, py); cps.push([px, py, a]);
    }
    ctx.stroke();
    for (let i = 0; i < cps.length; i++) {
      const [px, py, a] = cps[i];
      put(ctx, coinSpr(), px, py, 0.62 * (0.4 + 0.6 * abs(cos(t * 3 + i * 0.7))), -a, 0.62);
    }
    glow(ctx, cps[n - 1][0], cps[n - 1][1], 18, C.glowc, 0.35);
    // body
    put(ctx, ggBody(P.v), 0, 0, 1 + breath * 0.012, 0, 1 - breath * 0.012);
    // face
    ctx.save();
    ctx.translate(20 + P.atk * 3, -124 + breath); ctx.scale(1.4, 1.4);
    const fx = 0, fy = 0;
    // eyes: greedy coin-glint slits
    for (const [ex, s] of [[fx - 6, 0.82], [fx + 14, 1]]) {
      ctx.fillStyle = '#1a1020';
      ctx.beginPath(); ctx.ellipse(ex, fy, 6 * s, (P.hurt > 0.3 ? 1.2 : 3.4) * s, -0.1, 0, TAU); ctx.fill();
      if (P.hurt < 0.3) {
        glow(ctx, ex + 1, fy, 9 * s, C.eye, 0.6);
        ctx.fillStyle = C.eye; ctx.beginPath(); ctx.arc(ex + 1, fy, 2.2 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a1020'; ctx.fillRect(ex + 0.2, fy - 0.8, 1.6, 1.6);
      }
    }
    ctx.strokeStyle = '#2a1a2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fx - 14, fy - 10); ctx.quadraticCurveTo(fx - 6, fy - 14, fx, fy - 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx + 8, fy - 10); ctx.quadraticCurveTo(fx + 16, fy - 15, fx + 22, fy - 10); ctx.stroke();
    // wide greedy grin
    const mo = 3 + P.atk * 8 + P.cast * 4 + (P.hurt > 0 ? 6 * P.hurt : 0);
    const mouth = new Path2D();
    mouth.moveTo(fx - 12, fy + 12); mouth.quadraticCurveTo(fx + 6, fy + 18 - 2, fx + 26, fy + 8);
    mouth.quadraticCurveTo(fx + 8, fy + 22 + mo, fx - 12, fy + 12);
    ctx.fillStyle = C.mouth; ctx.fill(mouth);
    ctx.save(); ctx.clip(mouth);
    ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(fx + 8, fy + 20 + mo, 8, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4efe6';
    for (let i = 0; i < 5; i++) ctx.fillRect(fx - 8 + i * 6, fy + 10 + i * 0.2, 4.4, 3.4);
    ctx.restore();
    ctx.strokeStyle = shade(C.body, -0.6); ctx.lineWidth = 1.6; ctx.stroke(mouth);
    // drool
    const dr = (t * 0.7) % 1;
    ctx.fillStyle = rgba('#e8f4ff', 0.7);
    ctx.beginPath(); ctx.ellipse(fx + 24, fy + 12 + dr * 10, 1.6, 2.4 + dr * 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // front arm hugging a stack of 湯圓 bowls
    const bx = 60 + P.atk * 4 - P.cast * 4, by = -58 + breath;
    // stubby arm cradling the stack from below
    paintTube(ctx, [[26, -90], [36, -56], [52, -34]], [13, 11, 10], bc, { lw: 2, rimW: 6 });
    const bw = bowlSpr();
    put(ctx, bw, bx + 4, by - 34, 0.78, 0.06);
    put(ctx, bw, bx - 2, by - 12, 0.86, -0.04);
    put(ctx, bw, bx, by + 12, 0.95, 0.02);
    // steam
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.4 + i / 3) % 1;
      ctx.strokeStyle = rgba('#ffffff', 0.35 * sin(f * PI)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx - 4 + i * 8, by - 52 - f * 20); ctx.quadraticCurveTo(bx + i * 8 + sin(t * 2 + i) * 5, by - 60 - f * 24, bx - 2 + i * 8, by - 70 - f * 26); ctx.stroke();
    }
    // pudgy fingers gripping the bottom bowl
    ball(ctx, bx + 2, by + 22, 9, bc, { lw: 1.8, sx: 1.3, sy: 0.8 });
    ctx.strokeStyle = bc.o; ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(bx - 2 + i * 5, by + 16); ctx.lineTo(bx - 1 + i * 5, by + 22); ctx.stroke(); }
    ball(ctx, bx + 16, by + 14, 4.5, bc, { lw: 1.5, spec: false });
    // spilling coin
    for (let i = 0; i < 2; i++) {
      const f = (t * 0.55 + i * 0.5) % 1;
      const cx = bx + 18 + f * 10, cy = by - 20 + f * f * 70;
      ctx.globalAlpha = 1 - f * 0.6;
      put(ctx, coinSpr(), cx, cy, 0.55 * abs(cos(t * 6 + i)) + 0.1, 0, 0.55);
      ctx.globalAlpha = 1;
    }
    ctx.rotate(-lean);
    if (P.cast > 0) {
      for (let i = 0; i < 8; i++) {
        const a = t * 2 + i * TAU / 8;
        const cx = cos(a) * 80, cy = -96 + sin(a) * 26;
        glow(ctx, cx, cy, 14, C.glowc, 0.6 * P.cast);
        put(ctx, coinSpr(), cx, cy, 0.7 * abs(cos(t * 4 + i)) + 0.1, 0, 0.7);
      }
    }
  });

  // =============================================================================================
  // 孤魂 hungry_ghost — thin wandering ghost of the 7th month: long neck, empty bowl, pleading eyes
  // (meant to be pitiable, never grotesque)
  // =============================================================================================
  const HG = [
    { robe: '#d8d8cc', skin: '#cad8e6', hair: '#262c3a', glowc: '#a8d8ff', flame: '#86c8ff', rim: '#e0f2ff', bowl: '#a89c86' },
    { robe: '#cec4aa', skin: '#e0d4c0', hair: '#2e261c', glowc: '#ffd890', flame: '#ffb460', rim: '#fff0d0', bowl: '#8a7a64' },
    { robe: '#bab2d2', skin: '#d4cce6', hair: '#221c34', glowc: '#c8a8ff', flame: '#b484ff', rim: '#efe2ff', bowl: '#7c7490' },
  ];
  function hgBody(v) {
    const C = HG[v];
    const rb = pal(C.robe, C.rim, { l: '#ffffff' });
    return spr('hg:body:' + v, 130, 170, 60, 160, (g) => {
      const robe = smooth([[-8, -124], [12, -122], [22, -104], [24, -76], [30, -50], [18, -44], [20, -30], [6, -36], [-2, -22], [-10, -38], [-22, -30], [-22, -48], [-30, -58], [-24, -86], [-22, -110]]);
      paint(g, robe, -30, -124, 60, 102, rb, { lw: 1.8, hl: 0.35, rimW: 7, rimA: 0.6,
        inside: (c) => {
          c.strokeStyle = rgba(shade(C.robe, -0.35), 0.5); c.lineWidth = 1.6;
          for (const fx of [-16, -4, 8, 18]) { c.beginPath(); c.moveTo(fx, -110); c.quadraticCurveTo(fx + 3, -76, fx + 6, -40); c.stroke(); }
          // patches & frays
          c.fillStyle = rgba(shade(C.robe, -0.25), 0.6);
          c.fillRect(-18, -72, 9, 7); c.fillRect(8, -90, 7, 6);
          c.strokeStyle = rgba(shade(C.robe, -0.5), 0.6); c.lineWidth = 0.8;
          c.strokeRect(-18, -72, 9, 7); c.strokeRect(8, -90, 7, 6);
          // rope belt
          c.strokeStyle = shade(C.robe, -0.45); c.lineWidth = 3;
          c.beginPath(); c.moveTo(-26, -80); c.quadraticCurveTo(0, -74, 26, -80); c.stroke();
          c.beginPath(); c.moveTo(4, -76); c.lineTo(0, -60); c.moveTo(6, -76); c.lineTo(8, -62); c.stroke();
          // crossed collar
          c.strokeStyle = shade(C.robe, -0.4); c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(-6, -122); c.quadraticCurveTo(4, -108, 16, -96); c.stroke();
        } });
    });
  }
  function hgHead(v) {
    const C = HG[v];
    const sk = pal(C.skin, C.rim, { l: '#ffffff' });
    return spr('hg:head:' + v, 80, 80, 36, 40, (g) => {
      // loose bun & hair
      ball(g, -8, -20, 7, pal(C.hair, null, { l: shade(C.hair, 0.35) }), { lw: 1.4, specA: 0.15 });
      g.strokeStyle = '#c8a860'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-18, -26); g.lineTo(2, -16); g.stroke();
      const hair = smooth([[-16, -10], [-6, -22], [10, -22], [18, -12], [10, -8], [-4, 0], [-10, 16], [-18, 10]]);
      paint(g, hair, -18, -22, 36, 38, pal(C.hair, null, { l: shade(C.hair, 0.3) }), { lw: 1.4, hl: 0.25 });

      const face = smooth([[-8, -12], [8, -14], [18, -4], [18, 8], [10, 16], [0, 16], [-8, 8], [-10, -2]]);
      paint(g, face, -10, -14, 28, 30, sk, { lw: 1.6, hl: 0.5 });
      // fringe
      g.fillStyle = C.hair;
      g.beginPath(); g.moveTo(-8, -12); g.quadraticCurveTo(4, -18, 16, -8); g.quadraticCurveTo(8, -9, 4, -4); g.quadraticCurveTo(0, -8, -8, -2); g.closePath(); g.fill();
      // big sad eyes (looking up)
      for (const [ex, ey, s] of [[3, 2, 0.85], [12, 2, 1]]) {
        g.fillStyle = '#1e2232'; g.beginPath(); g.ellipse(ex, ey, 3.2 * s, 4 * s, 0, 0, TAU); g.fill();
        g.fillStyle = rgba(C.glowc, 0.9); g.beginPath(); g.ellipse(ex + 0.3, ey + 1.2, 2 * s, 1.6 * s, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex + 1, ey - 1.6 * s, 1.2 * s, 0, TAU); g.fill();
        g.strokeStyle = '#3a3e50'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(ex - 3.4 * s, ey - 6.5 * s); g.lineTo(ex + 3 * s, ey - 8 * s - (ex > 5 ? -1.6 : 1.6)); g.stroke();
      }
      // small open mouth
      g.fillStyle = '#4a3a4a'; g.beginPath(); g.ellipse(10, 11, 2, 1.5, 0, 0, TAU); g.fill();
      g.fillStyle = rgba('#a8b8d0', 0.5); g.beginPath(); g.ellipse(-2, 7, 3, 1.6, 0, 0, TAU); g.fill();
    });
  }
  def('hungry_ghost', 120, 190, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = HG[P.v];
    const rb = pal(C.robe, C.rim, { l: '#ffffff' });
    const sk = pal(C.skin, C.rim, { l: '#ffffff' });
    ctx.translate(x + P.shake - P.hurt * 8, y);
    const bob = sin(t * 1.5) * 5 - 14;
    glow(ctx, 6, -90 + bob, 90, C.glowc, 0.22 + P.cp * 0.3);
    // ghost flames 鬼火
    const flames = [];
    for (let i = 0; i < 3; i++) {
      const a = t * 0.8 + i * TAU / 3;
      flames.push({ x: cos(a) * 56, y: -110 + sin(a) * 18 + sin(t * 2 + i) * 6 + bob, z: sin(a) });
    }
    const drawFlame = (f) => {
      const s = 0.8 + f.z * 0.15;
      glow(ctx, f.x, f.y, 16 * s, C.flame, 0.7);
      ctx.fillStyle = rgba('#ffffff', 0.85);
      ctx.beginPath(); ctx.moveTo(f.x - 3.5 * s, f.y + 2);
      ctx.quadraticCurveTo(f.x - 3 * s, f.y - 6 * s, f.x + sin(t * 6) * 2, f.y - 11 * s);
      ctx.quadraticCurveTo(f.x + 4 * s, f.y - 4 * s, f.x + 3.5 * s, f.y + 2); ctx.arc(f.x, f.y + 2, 3.5 * s, 0, PI); ctx.fill();
    };
    for (const f of flames) if (f.z < 0) drawFlame(f);
    ctx.translate(0, bob);
    ctx.globalAlpha = 0.92;
    // wisp tail
    const tp = [], tr = [];
    for (let k = 0; k <= 10; k++) {
      const f = k / 10;
      tp.push([-4 - f * 22 + sin(t * 2 + f * 4) * 5 * f, -34 + f * 30]);
      tr.push((1 - f) * 16 + 0.5);
    }
    const tpp = tube(tp, tr);
    const tg = ctx.createLinearGradient(0, -34, 0, 0);
    tg.addColorStop(0, rgba(C.robe, 0.9)); tg.addColorStop(1, rgba(C.robe, 0));
    ctx.fillStyle = tg; ctx.fill(tpp);
    const reach = P.atk, cringe = P.hurt;
    // back sleeve
    paintTube(ctx, [[-14, -112], [-6, -92], [24 + reach * 10, -92 - P.cast * 10]], [6, 7, 7], pal(shade(C.robe, -0.15), null, { l: C.robe }), { lw: 1.6 });
    put(ctx, hgBody(P.v), 0, 0);
    // long neck stretching forward
    const hx = 28 + reach * 16 - cringe * 12, hy = -150 + sin(t * 1.5 + 1) * 3 + cringe * 10 - P.cast * 6;
    const np = [[0, -116], [6, -128], [hx - 12, hy + 12], [hx - 4, hy + 8]];
    paintTube(ctx, np, [6.5, 5, 4.6, 4.6], sk, { lw: 1.3, shA: 0.25, hlA: 0.35 });
    // collar over the neck base
    ctx.fillStyle = shade(C.robe, -0.1); ctx.strokeStyle = shade(C.robe, -0.5); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(1, -117, 10, 4, -0.2, 0, TAU); ctx.fill(); ctx.stroke();
    put(ctx, hgHead(P.v), hx, hy, 1, -0.15 + reach * 0.1 + cringe * 0.25);
    // tears
    if (P.hurt > 0.1 || P.cast > 0.1 || (t % 6) < 1.4) {
      const f = ((t * 0.8) % 1);
      ctx.fillStyle = rgba(C.glowc, 0.9);
      ctx.beginPath(); ctx.ellipse(hx + 13, hy + 6 + f * 8, 1.2, 1.8, 0, 0, TAU); ctx.fill();
    }
    // hands raised together, holding an empty chipped bowl
    const bx = 46 + reach * 22 - cringe * 10, by = -104 - reach * 6 - P.cast * 16 + sin(t * 1.5) * 2;
    paintTube(ctx, [[10, -110], [24, -100], [bx - 6, by + 4]], [6.5, 7, 7.5], rb, { lw: 1.6 });
    // bowl
    const bp = new Path2D();
    bp.moveTo(bx - 13, by - 4); bp.quadraticCurveTo(bx - 11, by + 8, bx, by + 9); bp.quadraticCurveTo(bx + 11, by + 8, bx + 13, by - 4);
    bp.lineTo(bx + 9, by - 2); bp.lineTo(bx + 7, by - 5); bp.closePath();
    paint(ctx, bp, bx - 13, by - 6, 26, 15, pal(C.bowl, null, { l: shade(C.bowl, 0.4) }), { lw: 1.4, hl: 0.4 });
    ctx.fillStyle = shade(C.bowl, -0.55); ctx.beginPath(); ctx.ellipse(bx - 1, by - 4, 11, 2.6, 0, 0, TAU); ctx.fill();
    // thin fingers cupping the bowl
    ctx.strokeStyle = sk.o; ctx.lineWidth = 3.2;
    for (const [px, py] of [[bx - 12, by + 2], [bx + 11, by + 2]]) { ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + (px < bx ? 2 : -2), py + 4); ctx.stroke(); }
    ctx.strokeStyle = C.skin; ctx.lineWidth = 2;
    for (const [px, py] of [[bx - 12, by + 2], [bx + 11, by + 2]]) { ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + (px < bx ? 2 : -2), py + 4); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (P.cast > 0) {
      glow(ctx, bx, by - 6, 40, C.glowc, 0.6 * P.cp);
      for (let i = 0; i < 3; i++) {
        const f = (P.st * 0.8 + i / 3) % 1;
        ctx.strokeStyle = rgba(C.glowc, 0.6 * (1 - f)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx + 10, hy + 10, 10 + f * 50, -0.8, 0.8); ctx.stroke();
      }
    }
    for (const f of flames) if (f.z >= 0) { f.y -= bob; drawFlame(f); }
  });

  // =============================================================================================
  // 海盜鬼 pirate_ghost — drowned 澎湖 pirate: ragged junk-sail cloak, cutlass, ship lantern
  // =============================================================================================
  const PI_ = [
    { skin: '#7ab4a4', cloth: '#34445a', sash: '#9a3a2a', sail: '#b46a3a', batten: '#5a4024', wrap: '#9a3a34', blade: '#b6c4cc', eye: '#d0fff2', glowc: '#5ae8c4', weed: '#3a7a3a', rim: '#b0fff0' },
    { skin: '#8aa2bc', cloth: '#3a3446', sash: '#5a6a7a', sail: '#8c7c5a', batten: '#4a3a24', wrap: '#4a5a7a', blade: '#c4ccd8', eye: '#e0f0ff', glowc: '#8ac0ff', weed: '#3a5a6a', rim: '#c8e0ff' },
    { skin: '#a08aa8', cloth: '#2a2030', sash: '#6a1a2a', sail: '#5a2a2a', batten: '#2a1a14', wrap: '#2a2a2a', blade: '#aab0b8', eye: '#ffd0d0', glowc: '#ff5a5a', weed: '#4a3a5a', rim: '#ffb0c0' },
  ];
  function ptBody(v) {
    const C = PI_[v];
    const cl = pal(C.cloth, C.rim, { l: shade(C.cloth, 0.3) });
    const sk = pal(C.skin, C.rim);
    return spr('pt:body:' + v, 140, 200, 60, 194, (g) => {
      // legs (wide trousers fading into the mist)
      const legB = smooth([[-16, -86], [-2, -86], [-6, -50], [-16, -30], [-28, -34], [-24, -60]]);
      paint(g, legB, -28, -86, 26, 56, pal(shade(C.cloth, -0.15), null), { lw: 1.8 });
      const legF = smooth([[0, -86], [18, -86], [26, -60], [32, -34], [18, -28], [8, -52]]);
      paint(g, legF, 0, -86, 32, 58, cl, { lw: 1.8, hl: 0.3 });
      // torso: short jacket
      const torso = smooth([[-16, -146], [10, -150], [26, -138], [24, -110], [20, -86], [-18, -84], [-22, -110], [-24, -132]]);
      paint(g, torso, -24, -150, 50, 66, cl, { lw: 2, hl: 0.3, rimW: 7,
        inside: (c) => {
          // exposed chest (drowned skin)
          const ch = poly([[-2, -148], [14, -148], [6, -118]]);
          c.fillStyle = C.skin; c.fill(ch);
          c.strokeStyle = rgba(shade(C.skin, -0.5), 0.6); c.lineWidth = 1; c.stroke(ch);
          c.strokeStyle = shade(C.cloth, -0.5); c.lineWidth = 3;
          c.beginPath(); c.moveTo(-4, -148); c.lineTo(8, -112); c.lineTo(16, -86); c.stroke();
          c.strokeStyle = shade(C.cloth, 0.35); c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(-5, -147); c.lineTo(7, -112); c.stroke();
          // tears in the cloth
          c.fillStyle = rgba('#05080c', 0.5);
          c.beginPath(); c.moveTo(-18, -120); c.lineTo(-12, -116); c.lineTo(-16, -110); c.closePath(); c.fill();
          // barnacles
          for (const [bx, by] of [[-18, -140], [-14, -136], [20, -128]]) {
            c.fillStyle = '#d8d4c8'; c.beginPath(); c.arc(bx, by, 2.6, 0, TAU); c.fill();
            c.fillStyle = '#5a5a50'; c.beginPath(); c.arc(bx, by, 1, 0, TAU); c.fill();
          }
        } });
      // sash
      const sash = smooth([[-22, -98], [22, -100], [22, -88], [-20, -86]]);
      paint(g, sash, -22, -100, 44, 14, pal(C.sash, null), { lw: 1.4, hl: 0.35 });
      g.strokeStyle = shade(C.sash, -0.3); g.lineWidth = 3;
      g.beginPath(); g.moveTo(-18, -90); g.quadraticCurveTo(-24, -76, -20, -64); g.moveTo(-14, -90); g.quadraticCurveTo(-16, -76, -12, -68); g.stroke();
      // seaweed draped on the shoulder
      g.strokeStyle = C.weed; g.lineWidth = 2.4;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-14 + i * 6, -148); g.quadraticCurveTo(-18 + i * 6, -132, -14 + i * 7, -116 - i * 4); g.stroke(); }
      void sk;
      // legs dissolve into sea mist
      g.globalCompositeOperation = 'destination-out';
      const fg = g.createLinearGradient(0, -62, 0, -26);
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = fg; g.fillRect(-40, -62, 80, 40);
      g.globalCompositeOperation = 'source-over';
    });
  }
  function ptHead(v) {
    const C = PI_[v];
    const sk = pal(C.skin, C.rim);
    return spr('pt:head:' + v, 90, 90, 40, 46, (g) => {
      // loose wet hair behind
      const hair = smooth([[-18, -14], [0, -20], [6, 0], [2, 28], [-10, 34], [-22, 16]]);
      paint(g, hair, -22, -20, 28, 54, pal('#1a2024', null, { l: '#3a4448' }), { lw: 1.4, hl: 0.2 });
      const face = smooth([[-10, -14], [8, -16], [20, -6], [22, 6], [16, 16], [4, 20], [-6, 14], [-12, 2]]);
      paint(g, face, -12, -16, 34, 36, sk, { lw: 1.8, hl: 0.4,
        inside: (c) => {
          for (const [ex, ey, r] of [[5, -2, 5], [15, -2, 6]]) {
            const sg = c.createRadialGradient(ex, ey, 1, ex, ey, r * 1.3);
            sg.addColorStop(0, rgba('#05080c', 0.95)); sg.addColorStop(1, rgba('#05080c', 0));
            c.fillStyle = sg; c.fillRect(ex - 10, ey - 10, 20, 20);
          }
          c.fillStyle = rgba(shade(C.skin, -0.45), 0.5); c.beginPath(); c.ellipse(12, 9, 7, 3, -0.3, 0, TAU); c.fill();
        } });
      // scraggly beard
      g.strokeStyle = '#2a3034'; g.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) { const bx = 2 + i * 2.6; g.beginPath(); g.moveTo(bx, 14); g.quadraticCurveTo(bx - 1, 22, bx - 3 + (i % 2) * 2, 28 + (i % 3) * 3); g.stroke(); }
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(10, 12); g.lineTo(19, 10); g.stroke();
      // head wrap
      const wrap = smooth([[-14, -12], [-4, -22], [12, -22], [22, -12], [12, -10], [-2, -8]]);
      paint(g, wrap, -14, -22, 36, 14, pal(C.wrap, null), { lw: 1.5, hl: 0.4 });
      g.strokeStyle = rgba(shade(C.wrap, -0.4), 0.8); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-10, -14); g.quadraticCurveTo(4, -20, 18, -14); g.stroke();
    });
  }
  def('pirate_ghost', 170, 200, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = PI_[P.v];
    const cl = pal(C.cloth, C.rim, { l: shade(C.cloth, 0.3) });
    const sk = pal(C.skin, C.rim);
    ctx.translate(x + P.shake - P.hurt * 8, y);
    const breath = sin(t * 1.5);
    const bob = sin(t * 1.2) * 3 - 6;
    // ghost glow + sea mist at the legs
    glow(ctx, 0, -100, 100, C.glowc, 0.12);
    ctx.translate(0, bob);
    const lean = P.atk * 0.1 - P.wind * 0.08 - P.hurt * 0.12;
    ctx.rotate(lean);
    // junk-sail cloak (behind body), fluttering left
    const rows = 5, sailL = [], sailR = [];
    for (let r = 0; r <= rows; r++) {
      const f = r / rows;
      const flap = sin(t * 2.6 - f * 3) * 7 * f;
      sailL.push([-26 - f * 50 - f * f * 6 + flap, -150 + f * 116 + flap * 0.3]);
      sailR.push([16 - f * 22 + flap * 0.3, -152 + f * 110]);
    }
    const sp = new Path2D();
    sp.moveTo(sailR[0][0], sailR[0][1]);
    for (let r = 1; r <= rows; r++) sp.lineTo(sailR[r][0], sailR[r][1]);
    const bl = sailL[rows], br = sailR[rows];
    for (let k = 1; k < 9; k++) {
      const f = k / 9;
      sp.lineTo(lerp(br[0], bl[0], f), lerp(br[1], bl[1], f) + (k % 2 ? 13 : -1) + sin(t * 3 + k) * 2.5);
    }
    sp.lineTo(bl[0], bl[1]);
    for (let r = rows - 1; r >= 0; r--) {
      const a0 = sailL[r + 1], a1 = sailL[r];
      sp.quadraticCurveTo((a0[0] + a1[0]) / 2 - 7, (a0[1] + a1[1]) / 2, a1[0], a1[1]);
    }
    sp.closePath();
    paint(ctx, sp, -82, -152, 98, 132, pal(C.sail, null, { l: shade(C.sail, 0.22), d: shade(C.sail, -0.5) }), { lw: 1.8, hl: 0.3,
      inside: (c) => {
        // panel shading: each panel bellies between battens
        for (let r = 0; r < rows; r++) {
          const L0 = sailL[r], L1 = sailL[r + 1];
          const gy0 = L0[1], gy1 = L1[1];
          const pg = c.createLinearGradient(0, gy0, 0, gy1);
          pg.addColorStop(0, rgba('#000', 0.28)); pg.addColorStop(0.35, rgba('#fff', 0.06)); pg.addColorStop(1, rgba('#000', 0.12));
          c.fillStyle = pg; c.fillRect(-90, gy0, 120, gy1 - gy0);
        }
        c.fillStyle = 'rgba(8,10,16,0.85)';
        for (const [hx, hy, r] of [[-34, -100, 5], [-50, -60, 7], [-18, -58, 4]]) {
          c.beginPath(); c.ellipse(hx + sin(t * 2.6) * 3, hy, r, r * 0.7, 0.4, 0, TAU); c.fill();
        }
        c.strokeStyle = rgba('#000', 0.15); c.lineWidth = 3;
        for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-64 + i * 16, -150); c.lineTo(-68 + i * 16, -20); c.stroke(); }
      } });
    // bamboo battens (gently sagging)
    for (let r = 1; r < rows; r++) {
      const L = sailL[r], R = sailR[r];
      ctx.strokeStyle = shade(C.batten, -0.35); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(L[0] - 3, L[1]); ctx.quadraticCurveTo((L[0] + R[0]) / 2, (L[1] + R[1]) / 2 + 4, R[0], R[1]); ctx.stroke();
      ctx.strokeStyle = shade(C.batten, 0.2); ctx.lineWidth = 1.4; ctx.stroke();
    }
    // back arm with a dim ship lantern
    const lh = [-26, -92 + breath * 2];
    limb(ctx, -12, -140, -22, -114, 6, 5, pal(shade(C.cloth, -0.15), null));
    limb(ctx, -22, -114, lh[0], lh[1], 5, 4, pal(shade(C.skin, -0.15), null));
    const sw = sin(t * 1.8) * 0.15;
    const lx = lh[0] + sin(sw) * 16, ly = lh[1] + cos(sw) * 16;
    ctx.strokeStyle = '#3a3020'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(lh[0], lh[1]); ctx.lineTo(lx, ly - 8); ctx.stroke();
    glow(ctx, lx, ly + 2, 30, C.glowc, 0.6 + 0.2 * sin(t * 5));
    const lp = new Path2D(); lp.ellipse(lx, ly + 1, 8, 10, 0, 0, TAU);
    ctx.fillStyle = rgba(C.glowc, 0.55); ctx.fill(lp);
    ctx.strokeStyle = '#2a2418'; ctx.lineWidth = 2; ctx.stroke(lp);
    ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(lx, ly + 1, 4, 10, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#2a2418'; ctx.fillRect(lx - 8, ly - 10, 16, 3); ctx.fillRect(lx - 8, ly + 9, 16, 3);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(lx, ly + 2, 2, 3.4, 0, 0, TAU); ctx.fill();
    // body
    put(ctx, ptBody(P.v), 0, 0);
    // leg mist (legs fade)
    for (let i = 0; i < 5; i++) puff(ctx, -24 + i * 13 + sin(t * 1.4 + i) * 4, -26 + sin(t + i) * 3, 20, C.glowc, 0.2);
    // head
    const hx = 10 + P.atk * 6, hy = -164 + breath;
    put(ctx, ptHead(P.v), hx, hy, 1, P.atk * 0.1 - P.hurt * 0.2);
    // wrap tails fluttering
    for (let i = 0; i < 2; i++) {
      const pts = [];
      for (let k = 0; k <= 6; k++) { const f = k / 6; pts.push([hx - 12 - f * 26, hy - 16 + i * 4 + sin(t * 4 - f * 4 + i) * 4 * f + f * 6]); }
      paintTube(ctx, pts, pts.map((_, k) => 3.4 * (1 - k / 8)), pal(C.wrap, null), { lw: 1.2, shA: 0.3, hlA: 0.3 });
    }
    const fl = 0.8 + 0.2 * sin(t * 6.3);
    for (const [ex, ey, s] of [[hx + 5, hy - 2, 0.8], [hx + 15, hy - 2, 1]]) {
      glow(ctx, ex, ey, 12 * s, C.glowc, 0.8 * fl);
      ctx.fillStyle = C.eye; ctx.beginPath(); ctx.arc(ex, ey, 2 * s, 0, TAU); ctx.fill();
    }
    // front arm + cutlass
    let H = [50, -106 + breath], ba = -0.9;
    H = [lerp(H[0], 18, P.wind), lerp(H[1], -184, P.wind)]; ba = lerp(ba, -2.4, P.wind);
    H = [lerp(H[0], 64, P.atk), lerp(H[1], -112, P.atk)]; ba = lerp(ba, 0.35, P.atk);
    H = [lerp(H[0], 40, P.cast), lerp(H[1], -170, P.cast)]; ba = lerp(ba, -1.57, P.cast);
    const S = [22, -140];
    const E = [lerp(S[0], H[0], 0.5) + 8, lerp(S[1], H[1], 0.5) + 10 - P.wind * 14];
    limb(ctx, S[0], S[1], E[0], E[1], 7, 6, cl);
    limb(ctx, E[0], E[1], H[0], H[1], 6, 5, sk);
    if (P.atk > 0.3) {
      // slash arc
      ctx.strokeStyle = rgba(C.glowc, 0.5 * P.atk); ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(H[0] - 10, H[1] + 10, 70, -1.9, 0.5); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.7 * P.atk); ctx.lineWidth = 2.5; ctx.stroke();
    }
    put(ctx, ptBlade(P.v), H[0], H[1], 1, ba);
    ball(ctx, H[0], H[1], 6, sk, { spec: false, lw: 1.5 });
    // seaweed on the forearm
    ctx.strokeStyle = C.weed; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(E[0], E[1]); ctx.quadraticCurveTo(E[0] + 4 + sin(t * 2) * 3, E[1] + 12, E[0] + 2 + sin(t * 2) * 5, E[1] + 22); ctx.stroke();
    ctx.rotate(-lean);
    // dripping water
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.9 + i / 3) % 1;
      ctx.fillStyle = rgba(C.rim, 0.7 * (1 - f));
      ctx.beginPath(); ctx.ellipse(-16 + i * 22, -84 + f * 70, 1.4, 2.6, 0, 0, TAU); ctx.fill();
    }
    if (P.cast > 0) {
      glow(ctx, 0, -110, 100, C.glowc, 0.3 * P.cp);
      for (let i = 0; i < 5; i++) {
        const a = t * 2 + i * TAU / 5;
        ctx.strokeStyle = rgba(C.glowc, 0.6 * P.cast); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, -16, 50 + i * 10, 12 + i * 2, 0, a, a + 1.4); ctx.stroke();
      }
    }
  });
  // 刀 cutlass — anchor = grip, blade points along +x
  function ptBlade(v) {
    const C = PI_[v];
    return spr('pt:blade:' + v, 110, 30, 16, 15, (g) => {
      g.fillStyle = '#2a1a10'; g.fillRect(-14, -2.6, 16, 5.2);
      g.strokeStyle = '#8a6a3a'; g.lineWidth = 1;
      for (let i = -12; i < 2; i += 3) { g.beginPath(); g.moveTo(i, -2.6); g.lineTo(i + 2, 2.6); g.stroke(); }
      const gp = new Path2D(); gp.ellipse(3, 0, 3, 7, 0, 0, TAU);
      paint(g, gp, 0, -7, 6, 14, pal('#8a7a4a', null), { lw: 1, hl: 0.4 });
      const b = new Path2D();
      b.moveTo(5, -4); b.quadraticCurveTo(46, -7, 84, -12); b.quadraticCurveTo(92, -10, 90, -2);
      b.quadraticCurveTo(52, 8, 5, 4); b.closePath();
      const bg = g.createLinearGradient(0, -9, 0, 6);
      bg.addColorStop(0, '#f0f6fa'); bg.addColorStop(0.45, C.blade); bg.addColorStop(1, shade(C.blade, -0.5));
      g.fillStyle = bg; g.fill(b);
      g.save(); g.clip(b);
      g.fillStyle = rgba('#8a4a20', 0.5);
      for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(18 + U.hash(i, 1, 2) * 64, -2 + U.hash(i, 2, 2) * 6, 2 + U.hash(i, 3, 2) * 4, 1.5, 0, 0, TAU); g.fill(); }
      g.restore();
      g.strokeStyle = '#3a4250'; g.lineWidth = 1.2; g.stroke(b);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(10, -3); g.quadraticCurveTo(46, -6, 84, -10.5); g.stroke();
      // chipped notch
      g.fillStyle = '#0b0d18'; g.beginPath(); g.moveTo(56, 4); g.lineTo(60, 0.5); g.lineTo(63, 3.4); g.closePath(); g.fill();
    });
  }

  // =============================================================================================
  // shared: centreline sampling, marble/stone blocks, water pools
  // =============================================================================================
  // sample a Catmull-Rom curve through control points -> n+1 points
  function sampleCurve(ctrl, n) {
    const out = [], m = ctrl.length - 1;
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * m, k = min(m - 1, floor(u)), f = u - k;
      const p0 = ctrl[max(0, k - 1)], p1 = ctrl[k], p2 = ctrl[k + 1], p3 = ctrl[min(m, k + 2)];
      const f2 = f * f, f3 = f2 * f;
      const c = (a, b, c2, d) => 0.5 * ((2 * b) + (-a + c2) * f + (2 * a - 5 * b + 4 * c2 - d) * f2 + (-a + 3 * b - 3 * c2 + d) * f3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
    return out;
  }
  function roundPoly(pts, r) {
    const p = new Path2D(), n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s0 = mid(pts[n - 1], pts[0]);
    p.moveTo(s0[0], s0[1]);
    for (let i = 0; i < n; i++) { const a = pts[i], m = mid(a, pts[(i + 1) % n]); p.arcTo(a[0], a[1], m[0], m[1], r); }
    p.closePath();
    return p;
  }
  // veined stone block: C = { l, b, d, o, vein, band, hl?, rim? }
  function stoneBlock(g, pts, C, seed, o = {}) {
    const path = roundPoly(pts, o.r ?? 5);
    const [bx, by, bw, bh] = bbox(pts);
    const gr = g.createLinearGradient(bx, by, bx + bw * 0.8, by + bh);
    gr.addColorStop(0, C.l); gr.addColorStop(0.5, C.b); gr.addColorStop(1, C.d);
    g.fillStyle = gr; g.fill(path);
    g.save(); g.clip(path);
    const R = U.seeded(seed * 131 + 7);
    // folded marble banding
    const ba = o.bandA ?? -0.25;
    for (let i = 0; i < 6; i++) {
      const y0 = by + (i + R() * 0.8) * bh / 5;
      g.strokeStyle = rgba(C.band, 0.12 + R() * 0.2); g.lineWidth = 2 + R() * 6;
      g.beginPath();
      for (let k = 0; k <= 12; k++) {
        const xx = bx - 10 + k * (bw + 20) / 12;
        const yy = y0 + (xx - bx) * ba + sin(k * 0.9 + i * 2 + seed) * (3 + R() * 3);
        if (k === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.stroke();
    }
    // thin veins
    for (let i = 0; i < (o.veins ?? 3); i++) {
      let xx = bx + R() * bw, yy = by + R() * bh * 0.4;
      g.strokeStyle = rgba(C.vein, 0.55); g.lineWidth = 0.9 + R() * 0.6;
      g.beginPath(); g.moveTo(xx, yy);
      for (let k = 0; k < 7; k++) { xx += (R() - 0.5) * 14; yy += 4 + R() * 9; g.lineTo(xx, yy); }
      g.stroke();
    }
    // speckles
    for (let i = 0; i < bw * bh / 220; i++) {
      g.fillStyle = rgba(R() < 0.5 ? C.vein : '#ffffff', 0.25);
      g.fillRect(bx + R() * bw, by + R() * bh, 1.3, 1.3);
    }
    if (o.facets) for (const [fp, col, a] of o.facets) { g.fillStyle = rgba(col, a); g.fill(poly(fp)); }
    if (o.inside) o.inside(g);
    // occlusion on the lower-right, key light on the upper-left
    const sg = g.createLinearGradient(bx, by, bx + bw, by + bh);
    sg.addColorStop(0.55, rgba(C.o, 0)); sg.addColorStop(1, rgba(C.o, 0.55));
    g.lineWidth = 10; g.strokeStyle = sg; g.stroke(path);
    if (C.rim) {
      const rg = g.createLinearGradient(bx, by, bx + bw, by + bh);
      rg.addColorStop(0.6, rgba(C.rim, 0)); rg.addColorStop(1, rgba(C.rim, 0.75));
      g.lineWidth = 4; g.strokeStyle = rg; g.stroke(path);
    }
    const hg = g.createLinearGradient(bx, by, bx + bw * 0.6, by + bh * 0.6);
    hg.addColorStop(0, rgba(C.hl || '#ffffff', 0.7)); hg.addColorStop(0.5, rgba(C.hl || '#ffffff', 0));
    g.lineWidth = 5; g.strokeStyle = hg; g.stroke(path);
    g.restore();
    g.lineWidth = o.lw ?? 2; g.strokeStyle = C.o; g.stroke(path);
    return path;
  }
  // glowing crack polyline (dark gash + bright core)
  function crack(g, pts, core, w = 1) {
    g.strokeStyle = 'rgba(6,10,16,0.9)'; g.lineWidth = 3.4 * w; g.stroke(smooth(pts, false));
    g.strokeStyle = core; g.lineWidth = 1.4 * w; g.stroke(smooth(pts, false));
  }
  // dark tide pool with ripples
  function pool(ctx, x, y, rx, ry, t, col, glowc, a = 1) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, rx);
    g.addColorStop(0, rgba('#020308', 0.95 * a)); g.addColorStop(0.7, rgba(col, 0.8 * a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.35 + i / 3) % 1;
      ctx.strokeStyle = rgba(glowc, 0.45 * (1 - f) * a); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y, rx * (0.35 + f * 0.65), ry * (0.35 + f * 0.65), 0, 0, TAU); ctx.stroke();
    }
  }

  // =============================================================================================
  // 海鰻精 moray — giant moray-eel spirit rising from a dark tide pool, needle teeth, reticulated hide
  // =============================================================================================
  const MO = [
    { body: '#5c6a26', bodyL: '#8c9a3a', spot: '#e0d468', belly: '#c4c27a', fin: '#7a8a34', eye: '#e8ff6a', glowc: '#9cf0b0', rim: '#d8ffa0', water: '#10303a' },
    { body: '#2e4c62', bodyL: '#4e7a96', spot: '#e8f4ff', belly: '#a8c4d4', fin: '#3e6a86', eye: '#a8f4ff', glowc: '#7ad8ff', rim: '#c0f0ff', water: '#0c2238' },
    { body: '#5a2234', bodyL: '#8a3a4a', spot: '#ffb050', belly: '#d89a8a', fin: '#7a2e40', eye: '#ffcc50', glowc: '#ff8a6a', rim: '#ffc0a0', water: '#2a0c18' },
  ];
  def('moray', 210, 180, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = MO[P.v];
    ctx.translate(x + P.shake - P.hurt * 8, y);
    pool(ctx, -36, -4, 74, 16, t, C.water, C.glowc);
    const sw = t * 2.2;
    const lunge = P.atk, rear = P.wind + P.cast * 0.6;
    const ctrl = [
      [-44, 6], [-56, -40], [-42 - rear * 10, -92 - rear * 10], [-8 - rear * 14 + lunge * 30, -122 - rear * 16 + lunge * 20],
      [28 - rear * 16 + lunge * 52, -126 - rear * 18 + lunge * 34], [48 - rear * 14 + lunge * 68, -118 - rear * 14 + lunge * 42],
    ];
    for (let i = 1; i < ctrl.length; i++) { ctrl[i][0] += sin(sw + i * 1.2) * 4 * (i / ctrl.length); ctrl[i][1] += cos(sw * 0.8 + i) * 3 * (i / ctrl.length); }
    ctrl[1][0] -= P.hurt * 6; ctrl[3][0] -= P.hurt * 18; ctrl[4][0] -= P.hurt * 22; ctrl[5][0] -= P.hurt * 22;
    const pts = sampleCurve(ctrl, 30);
    const rs = pts.map((_, i) => { const f = i / 30; return 13 + sin(f * PI * 0.9) * 7 - f * 2; });
    const S = tubeSides(pts, rs);
    // dorsal fin along the back (R side)
    const fin = new Path2D();
    const k0 = 4, k1 = 28;
    fin.moveTo(S.R[k0][0], S.R[k0][1]);
    for (let k = k0; k <= k1; k++) {
      const p = pts[k], r = rs[k] + 9 + sin(k * 0.9 - t * 6) * 2;
      const dx = S.R[k][0] - p[0], dy = S.R[k][1] - p[1], L = hypot(dx, dy) || 1;
      fin.lineTo(p[0] + dx / L * r, p[1] + dy / L * r);
    }
    for (let k = k1; k >= k0; k--) fin.lineTo(S.R[k][0], S.R[k][1]);
    fin.closePath();
    ctx.fillStyle = rgba(C.fin, 0.85); ctx.fill(fin);
    ctx.strokeStyle = shade(C.fin, -0.55); ctx.lineWidth = 1.5; ctx.stroke(fin);
    ctx.save(); ctx.clip(fin);
    ctx.strokeStyle = rgba(C.rim, 0.35); ctx.lineWidth = 1;
    for (let k = k0; k <= k1; k += 2) { ctx.beginPath(); ctx.moveTo(S.R[k][0], S.R[k][1]); ctx.lineTo(S.R[k][0] + (S.R[k][0] - pts[k][0]) * 1.2, S.R[k][1] + (S.R[k][1] - pts[k][1]) * 1.2); ctx.stroke(); }
    ctx.restore();
    // body
    const c = pal(C.body, C.rim, { l: C.bodyL, o: shade(C.body, -0.7) });
    paintTube(ctx, pts, rs, c, {
      lw: 2.2, shA: 0.35,
      belly: (g) => {
        // pale throat / belly along the L side
        g.fillStyle = rgba(C.belly, 0.55);
        g.fill(tube(pts.map((q, i) => [lerp(q[0], S.L[i][0], 0.75), lerp(q[1], S.L[i][1], 0.75)]), rs.map((r) => r * 0.38)));
        // reticulated spots
        for (let k = 1; k < 30; k++) {
          for (let j = 0; j < 3; j++) {
            const h = U.hash(k, j, 77);
            const off = (h - 0.5) * 1.5;
            const px = pts[k][0] + (S.L[k][0] - pts[k][0]) * off, py = pts[k][1] + (S.L[k][1] - pts[k][1]) * off;
            g.fillStyle = rgba(C.spot, 0.75);
            g.beginPath(); g.ellipse(px, py, 1.6 + U.hash(k, j, 78) * 2.4, 1.4 + U.hash(k, j, 79) * 1.8, h * 3, 0, TAU); g.fill();
          }
        }
      },
    });
    // head
    const e = pts[30], e2 = pts[27];
    const ang = atan2(e[1] - e2[1], e[0] - e2[0]);
    const open = 0.15 + 0.06 * sin(t * 2.5) + P.atk * 0.5 + P.cast * 0.35 + P.wind * 0.2;
    ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(ang);
    const hc = pal(C.body, C.rim, { l: C.bodyL, o: shade(C.body, -0.7) });
    // lower jaw
    ctx.save(); ctx.translate(-4, 6); ctx.rotate(open);
    const jaw = smooth([[-10, -4], [16, -2], [42, 2], [46, 6], [30, 10], [6, 10], [-10, 6]]);
    ctx.fillStyle = '#2a0a10'; ctx.fill(smooth([[-4, -6], [40, -2], [40, 2], [-4, 0]]));
    paint(ctx, jaw, -10, -4, 56, 14, hc, { lw: 2, hl: 0.25 });
    ctx.fillStyle = '#f2f0e4';
    for (let i = 0; i < 7; i++) { const tx = 8 + i * 5; ctx.beginPath(); ctx.moveTo(tx - 1.4, -2); ctx.lineTo(tx + 0.6, -9 + (i % 2) * 2); ctx.lineTo(tx + 1.6, -2); ctx.fill(); }
    ctx.restore();
    // mouth interior
    ctx.fillStyle = '#1a0408'; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(46, 2); ctx.lineTo(46 * cos(open), 6 + 46 * sin(open)); ctx.closePath(); ctx.fill();
    glow(ctx, 22, 6 + 18 * open, 14, C.glowc, 0.3 + open * 0.6);
    // upper head
    const head = smooth([[-12, -14], [10, -18], [32, -14], [50, -6], [54, 0], [46, 4], [20, 4], [-10, 6]]);
    paint(ctx, head, -12, -18, 66, 24, hc, { lw: 2.2, hl: 0.45, rimW: 5,
      inside: (g) => {
        for (let i = 0; i < 10; i++) { g.fillStyle = rgba(C.spot, 0.7); g.beginPath(); g.ellipse(-6 + U.hash(i, 1, 5) * 48, -14 + U.hash(i, 2, 5) * 14, 1.6 + U.hash(i, 3, 5) * 1.6, 1.3, 0, 0, TAU); g.fill(); }
      } });
    ctx.fillStyle = '#f2f0e4';
    for (let i = 0; i < 7; i++) { const tx = 10 + i * 5.2; ctx.beginPath(); ctx.moveTo(tx - 1.4, 3); ctx.lineTo(tx + 0.4, 10 - (i % 2) * 2); ctx.lineTo(tx + 1.6, 3); ctx.fill(); }
    // nostril tube
    ctx.strokeStyle = hc.o; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(48, -4); ctx.lineTo(54, -9); ctx.stroke();
    ctx.strokeStyle = C.bodyL; ctx.lineWidth = 1.4; ctx.stroke();
    // eye
    glow(ctx, 30, -9, 12, C.eye, 0.8);
    ctx.fillStyle = '#0a0c06'; ctx.beginPath(); ctx.ellipse(30, -9, 4.6, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(31, -9, 2.6, P.hurt > 0.3 ? 0.6 : 2.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(29.5, -10.5, 1, 0, TAU); ctx.fill();
    // gill slit
    ctx.strokeStyle = rgba(shade(C.body, -0.7), 0.8); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(-4, -2, 6, -0.9, 0.9); ctx.stroke();
    ctx.restore();
    // pool front lip + splash ring
    ctx.strokeStyle = rgba(C.glowc, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(-44, 2, 24, 6, 0, 0.1, PI - 0.1); ctx.stroke();
    // bubbles
    for (let i = 0; i < 6; i++) {
      const f = (t * 0.4 + i / 6) % 1;
      const bx = -50 + (i * 17) % 60 + sin(t * 2 + i) * 4, by = -6 - f * 120;
      ctx.strokeStyle = rgba(C.rim, 0.6 * (1 - f)); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(bx, by, 2 + (i % 3), 0, TAU); ctx.stroke();
    }
    if (P.cast > 0) {
      glow(ctx, e[0], e[1], 60, C.glowc, 0.35 * P.cp);
      for (let i = 0; i < 3; i++) {
        const f = (P.st * 0.9 + i / 3) % 1;
        ctx.strokeStyle = rgba(C.glowc, 0.6 * (1 - f)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(-36, -4, 30 + f * 70, 8 + f * 14, 0, 0, TAU); ctx.stroke();
      }
    }
  });

  // =============================================================================================
  // 海妖 sea_monster — tide-sick cephalopod beast: barnacle-crusted mantle, sick glow, black ooze
  // =============================================================================================
  const SM = [
    { body: '#6e4e72', bodyL: '#a07aa2', sick: '#a6ff6a', ooze: '#0c0a14', eye: '#f4ff8a', rim: '#d8b0ff', weed: '#3a6a34', under: '#d0a8c8' },
    { body: '#9a5236', bodyL: '#d0845a', sick: '#ffd85a', ooze: '#140a06', eye: '#fff0a0', rim: '#ffc8a0', weed: '#5a6a2a', under: '#e8b8a0' },
    { body: '#245e62', bodyL: '#3c9294', sick: '#ff7ad0', ooze: '#06100f', eye: '#ffb0f0', rim: '#a8fff0', weed: '#2a5a4a', under: '#a8d8d0' },
  ];
  function smMantle(v) {
    const C = SM[v];
    const bc = pal(C.body, C.rim, { l: C.bodyL, o: shade(C.body, -0.7) });
    return spr('sm:mantle:' + v, 160, 150, 70, 175, (g) => {
      const m = smooth([[-52, -134], [-34, -164], [-2, -170], [24, -150], [40, -114], [46, -86], [36, -60], [10, -50], [-22, -58], [-42, -82], [-56, -108]]);
      paint(g, m, -56, -170, 102, 120, bc, { lw: 2.4, hl: 0.45, rimW: 10, rimA: 0.6,
        inside: (c) => {
          // mottling
          for (let i = 0; i < 26; i++) {
            c.fillStyle = rgba(shade(C.body, -0.45), 0.35);
            c.beginPath(); c.ellipse(-50 + U.hash(i, 1, 9) * 90, -160 + U.hash(i, 2, 9) * 100, 2 + U.hash(i, 3, 9) * 6, 1.6 + U.hash(i, 4, 9) * 4, U.hash(i, 5, 9) * 3, 0, TAU); c.fill();
          }
          // black tide ooze bleeding down from the crown
          c.fillStyle = rgba(C.ooze, 0.85);
          const oz = new Path2D();
          oz.moveTo(-60, -180); oz.lineTo(30, -180); oz.lineTo(30, -156);
          for (let k = 0; k < 9; k++) {
            const x0 = 30 - k * 10, x1 = x0 - 10, len = 6 + U.hash(k, 1, 3) * 26;
            oz.lineTo(x0 - 2, -154 + (k % 3) * 2);
            oz.bezierCurveTo(x0 - 3, -150 + len, x1 + 3, -150 + len, x1 + 2, -154 + ((k + 1) % 3) * 2);
          }
          oz.lineTo(-60, -150); oz.closePath(); c.fill(oz);
          c.strokeStyle = rgba(C.sick, 0.35); c.lineWidth = 1.4; c.stroke(oz);
          // sick glow spots
          for (let i = 0; i < 9; i++) {
            const px = -44 + U.hash(i, 6, 9) * 70, py = -130 + U.hash(i, 7, 9) * 60, r = 1.4 + U.hash(i, 8, 9) * 2;
            const sg = c.createRadialGradient(px, py, 0, px, py, r * 2.4);
            sg.addColorStop(0, rgba('#ffffff', 0.9)); sg.addColorStop(0.3, rgba(C.sick, 0.85)); sg.addColorStop(1, rgba(C.sick, 0));
            c.fillStyle = sg; c.fillRect(px - r * 3, py - r * 3, r * 6, r * 6);
          }
        } });
      // barnacle clusters
      for (const [bx, by, n] of [[-30, -140, 5], [10, -158, 3], [-44, -100, 4], [20, -110, 3]]) {
        for (let i = 0; i < n; i++) {
          const px = bx + (U.hash(i, bx, 1) - 0.5) * 18, py = by + (U.hash(i, by, 2) - 0.5) * 12, r = 3 + U.hash(i, n, 3) * 2.5;
          const bp = new Path2D(); bp.ellipse(px, py, r, r * 0.85, 0, 0, TAU);
          paint(g, bp, px - r, py - r, r * 2, r * 2, pal('#cfc8b8', null, { o: '#5a5448' }), { lw: 1, hl: 0.5 });
          g.fillStyle = '#3a342c'; g.beginPath(); g.ellipse(px + 0.4, py - 0.2, r * 0.4, r * 0.25, 0, 0, TAU); g.fill();
        }
      }
      // siphon
      const si = capsule(30, -66, 46, -60, 6, 4.5);
      paint(g, si, 28, -72, 22, 16, bc, { lw: 1.6, hl: 0.4 });
      g.fillStyle = '#1a0a14'; g.beginPath(); g.ellipse(46, -60, 2, 3.4, 0.3, 0, TAU); g.fill();
    });
  }
  def('sea_monster', 200, 185, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = SM[P.v];
    const bc = pal(C.body, C.rim, { l: C.bodyL, o: shade(C.body, -0.7) });
    const bcD = pal(shade(C.body, -0.25), null, { l: C.body, o: shade(C.body, -0.75) });
    ctx.translate(x + P.shake - P.hurt * 8, y);
    // ooze puddle
    pool(ctx, 0, -4, 92, 16, t, '#120c1a', C.sick, 0.9);
    const breath = sin(t * 1.6);
    const tent = (i, front) => {
      // root, sweep direction, curl
      const roots = front ? [[-10, -56], [10, -54], [28, -58]] : [[-36, -64], [-20, -60], [18, -62]];
      const dirs = front ? [-0.6, 0.5, 1.25] : [-1.35, -0.9, 0.95];
      const r0 = roots[i];
      let a = dirs[i];
      const lash = front && i === 2 ? P.atk : 0;
      const rise = P.cast * (front ? 0.6 : 0.4);
      const pts = [r0], rs = [9];
      let px = r0[0], py = r0[1];
      const n = 14, L = front ? 6.2 : 5.4;
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        const wave = sin(t * 2.2 - f * 4 + i * 1.7 + (front ? 0 : 2)) * 0.22;
        const down = f < 0.45 ? 0.75 : -0.9 * (f - 0.45) * 2.2; // reach down then curl up
        const ang = a + wave + (a > 0 ? 1 : -1) * (-down + f * 0.8) * 0.9;
        px += sin(ang) * L * (1 + lash * 0.9); py += cos(ang) * L * (1 - lash * 0.6) * (1 - rise * f * 2.2);
        if (lash) py -= lash * f * 5;
        pts.push([px, min(py, -2)]); rs.push(lerp(9, 1.6, f) * (front ? 1 : 0.85));
      }
      return { pts, rs };
    };
    // back tentacles
    for (let i = 0; i < 3; i++) { const tt = tent(i, false); paintTube(ctx, tt.pts, tt.rs, bcD, { lw: 1.8, shA: 0.3 }); }
    // mantle
    ctx.save();
    ctx.translate(0, -56); ctx.rotate(P.atk * 0.08 - P.hurt * 0.1 - P.wind * 0.06); ctx.scale(1 + breath * 0.02, 1 - breath * 0.02); ctx.translate(0, 56);
    put(ctx, smMantle(P.v), 0, 0);
    // kelp strands
    for (let i = 0; i < 3; i++) {
      const sx = -40 + i * 18, sy = -126 + i * 10;
      ctx.strokeStyle = C.weed; ctx.lineWidth = 3 - i * 0.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx - 8 + sin(t * 1.6 + i) * 4, sy + 22, sx - 6 + sin(t * 1.6 + i) * 8, sy + 44); ctx.stroke();
    }
    // big eyes with horizontal pupils
    for (const [ex, ey, s] of [[12, -86, 0.8], [32, -84, 1]]) {
      const ep = new Path2D(); ep.ellipse(ex, ey, 9 * s, 8 * s, 0, 0, TAU);
      ctx.fillStyle = shade(C.body, -0.5); ctx.beginPath(); ctx.ellipse(ex - 1, ey - 2, 11 * s, 10 * s, 0, 0, TAU); ctx.fill();
      glow(ctx, ex, ey, 18 * s, C.eye, 0.55);
      const eg = ctx.createRadialGradient(ex - 2, ey - 2, 1, ex, ey, 9 * s);
      eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.4, C.eye); eg.addColorStop(1, shade(C.eye, -0.4));
      ctx.fillStyle = eg; ctx.fill(ep);
      ctx.fillStyle = '#0a0608';
      const blink = P.hurt > 0.3 ? 0.3 : 1;
      ctx.beginPath(); ctx.roundRect(ex + 1 - 5 * s, ey - 2.6 * s * blink, 10 * s, 5.2 * s * blink, 2.4 * s); ctx.fill();
      ctx.strokeStyle = shade(C.body, -0.7); ctx.lineWidth = 1.4; ctx.stroke(ep);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(ex - 3 * s, ey - 3 * s, 1.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // front tentacles
    for (let i = 0; i < 3; i++) {
      const tt = tent(i, true);
      paintTube(ctx, tt.pts, tt.rs, bc, { lw: 2, rimW: 4,
        belly: (g) => {
          // sucker row on the underside
          const S = tubeSides(tt.pts, tt.rs);
          for (let k = 2; k < tt.pts.length - 1; k += 1) {
            const q = [lerp(tt.pts[k][0], S.L[k][0], 0.6), lerp(tt.pts[k][1], S.L[k][1], 0.6)];
            g.fillStyle = rgba(C.under, 0.9); g.beginPath(); g.arc(q[0], q[1], tt.rs[k] * 0.32, 0, TAU); g.fill();
            g.fillStyle = rgba(shade(C.under, -0.5), 0.8); g.beginPath(); g.arc(q[0], q[1], tt.rs[k] * 0.14, 0, TAU); g.fill();
          }
        } });
    }
    // black ooze drips
    for (let i = 0; i < 4; i++) {
      const f = (t * 0.5 + i / 4) % 1;
      const dx = -30 + i * 20, dy = -60 + f * 56;
      ctx.fillStyle = rgba(C.ooze, 0.9 * (1 - f * 0.5));
      ctx.beginPath(); ctx.ellipse(dx, dy, 2.2, 3.5 + f * 2, 0, 0, TAU); ctx.fill();
      glow(ctx, dx, dy, 5, C.sick, 0.3 * (1 - f));
    }
    glow(ctx, 0, -110, 70, C.sick, 0.1 + 0.05 * sin(t * 3) + P.cp * 0.3);
    if (P.cast > 0) {
      for (let i = 0; i < 6; i++) {
        const f = (P.st * 0.7 + i / 6) % 1;
        const a = i * 1.1;
        glow(ctx, cos(a) * 60, -20 - f * 140, 10, C.sick, P.cast * (1 - f));
      }
    }
  });

  // =============================================================================================
  // 斷崖石靈 cliff_spirit — marble cliff rock spirit: veined white stone, moss & a tiny cliff pine,
  // floating stone fists, river-light eyes
  // =============================================================================================
  const CS = [
    { l: '#ffffff', b: '#e6e4de', d: '#a8aab0', o: '#5a6270', vein: '#6a7280', band: '#8a92a0', glowc: '#5ae8d8', moss: '#4a7a3a', rim: '#a0fff0' },
    { l: '#e8e6e0', b: '#a8a8a4', d: '#6a6a6a', o: '#34363a', vein: '#2a2c30', band: '#4a4c50', glowc: '#ffb850', moss: '#6a6a2a', rim: '#ffd8a0' },
    { l: '#8a8898', b: '#5a586a', d: '#34323e', o: '#16141c', vein: '#c8c0e0', band: '#9a90b8', glowc: '#c088ff', moss: '#3a4a5a', rim: '#d0b0ff' },
  ];
  function csBody(v) {
    const C = CS[v];
    return spr('cs:body:' + v, 150, 150, 75, 140, (g) => {
      // main boulder with a top facet
      const pts = [[-40, -110], [-14, -132], [22, -128], [44, -100], [48, -60], [34, -28], [0, -18], [-34, -26], [-48, -58], [-50, -88]];
      stoneBlock(g, pts, C, v * 7 + 1, { r: 10, veins: 4,
        facets: [[[[-40, -110], [-14, -132], [22, -128], [44, -100], [16, -102], [-16, -100]], '#ffffff', 0.25],
          [[[44, -100], [48, -60], [34, -28], [24, -50], [26, -86]], C.o, 0.18]],
        inside: (c) => {
          // carved face: brow ledge and eye slits
          c.fillStyle = rgba(C.o, 0.4);
          c.beginPath(); c.moveTo(0, -92); c.lineTo(44, -94); c.lineTo(42, -86); c.lineTo(4, -84); c.closePath(); c.fill();
          c.fillStyle = '#05070c';
          c.beginPath(); c.moveTo(8, -82); c.lineTo(20, -84); c.lineTo(18, -77); c.lineTo(9, -77); c.closePath(); c.fill();
          c.beginPath(); c.moveTo(28, -84); c.lineTo(42, -85); c.lineTo(40, -77); c.lineTo(30, -77); c.closePath(); c.fill();
        } });
      // mouth crack + body fissures
      crack(g, [[12, -56], [20, -52], [28, -56], [36, -51], [42, -55]], C.glowc, 1.1);
      crack(g, [[-30, -100], [-22, -86], [-28, -70], [-20, -58]], C.glowc, 0.8);
      crack(g, [[-8, -30], [-2, -40], [6, -36]], C.glowc, 0.7);
      // moss cap & a tiny cliff pine
      const moss = tufted([[-38, -112], [-14, -134], [20, -130], [30, -122], [6, -118], [-20, -112]], 3, 3, 4);
      paint(g, moss, -38, -134, 68, 22, pal(C.moss, null, { l: shade(C.moss, 0.4) }), { lw: 1.4, hl: 0.4 });
      g.strokeStyle = '#4a3420'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-6, -128); g.quadraticCurveTo(-10, -140, -2, -150); g.stroke();
      for (const [px, py, w] of [[-2, -150, 14], [-6, -142, 18], [0, -136, 12]]) {
        const pp = new Path2D(); pp.ellipse(px, py, w / 2, 4, -0.15, 0, TAU);
        paint(g, pp, px - w / 2, py - 4, w, 8, pal('#2e5a34', null, { l: '#5a8a4a' }), { lw: 1, hl: 0.4 });
      }
    });
  }
  function csFist(v, k) {
    const C = CS[v];
    return spr('cs:fist:' + v + ':' + k, 60, 56, 30, 28, (g) => {
      const pts = k ? [[-18, -14], [6, -20], [20, -8], [18, 12], [-2, 18], [-20, 8]] : [[-16, -16], [10, -18], [20, -2], [12, 16], [-10, 16], [-20, 2]];
      stoneBlock(g, pts, C, v * 5 + k + 11, { r: 6, veins: 2, facets: [[[pts[0], pts[1], pts[2], [4, -6], [-10, -4]], '#ffffff', 0.22]] });
      crack(g, k ? [[-8, -8], [0, 0], [-4, 10]] : [[4, -12], [0, -2], [8, 6]], C.glowc, 0.7);
    });
  }
  def('cliff_spirit', 170, 190, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = CS[P.v];
    ctx.translate(x + P.shake - P.hurt * 8, y);
    const bob = sin(t * 1.4) * 5 - 18;
    glow(ctx, 0, -20, 60, C.glowc, 0.18 + P.cp * 0.3);
    // floating pebbles beneath
    for (let i = 0; i < 4; i++) {
      const a = t * 0.8 + i * TAU / 4;
      const px = cos(a) * 34, py = -16 + sin(a) * 6 + sin(t * 2 + i) * 3;
      ctx.fillStyle = i % 2 ? C.b : C.d; ctx.strokeStyle = C.o; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px - 1, py - 5); ctx.lineTo(px + 5, py - 2); ctx.lineTo(px + 3, py + 4); ctx.lineTo(px - 3, py + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // back fist
    let B = [-58, -86 + sin(t * 1.4 + 1) * 6 + bob];
    B = [lerp(B[0], -54, P.cast), lerp(B[1], -150 + bob, P.cast)];
    put(ctx, csFist(P.v, 1), B[0], B[1], 0.85, sin(t * 0.7) * 0.2);
    // body
    ctx.save();
    ctx.translate(0, bob); ctx.rotate(P.atk * 0.08 - P.wind * 0.08 - P.hurt * 0.12);
    put(ctx, csBody(P.v), 0, 0);
    const fl = 0.75 + 0.25 * sin(t * 4);
    for (const [ex, ey] of [[14, -80], [35, -80]]) {
      glow(ctx, ex, ey, 16, C.glowc, 0.9 * fl);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ex - 4, ey - 1.5, 8, P.hurt > 0.3 ? 1 : 2.5);
    }
    glow(ctx, 28, -54, 22, C.glowc, 0.35 * fl + P.atk * 0.4);
    ctx.restore();
    // dust & grit falling
    for (let i = 0; i < 5; i++) {
      const f = (t * 0.6 + i / 5) % 1;
      ctx.fillStyle = rgba(C.b, 0.7 * (1 - f));
      ctx.fillRect(-30 + i * 14 + sin(i * 3) * 6, -24 + bob + f * 26, 2, 2);
    }
    // front fist (punch)
    let F = [62, -70 + sin(t * 1.4) * 6 + bob];
    F = [lerp(F[0], 30, P.wind), lerp(F[1], -110 + bob, P.wind)];
    F = [lerp(F[0], 112, P.atk), lerp(F[1], -84 + bob, P.atk)];
    F = [lerp(F[0], 58, P.cast), lerp(F[1], -150 + bob, P.cast)];
    if (P.atk > 0.3) for (let i = 0; i < 3; i++) streak(ctx, [[F[0] - 70, F[1] - 10 + i * 10], [F[0] - 36, F[1] - 8 + i * 9], [F[0] - 16, F[1] - 6 + i * 8]], 3, C.glowc, 0.6 * P.atk);
    put(ctx, csFist(P.v, 0), F[0], F[1], 1, sin(t * 0.9) * 0.15 + P.atk * 0.3);
    glow(ctx, F[0], F[1], 12, C.glowc, 0.3 + P.atk * 0.5);
    if (P.cast > 0) {
      glow(ctx, 0, -150 + bob, 50, C.glowc, 0.6 * P.cp);
      for (let i = 0; i < 6; i++) {
        const a = t * 2 + i * TAU / 6;
        const px = cos(a) * 26, py = -150 + bob + sin(a) * 10;
        ctx.fillStyle = C.l; ctx.strokeStyle = C.o; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, 3.5, 0, TAU); ctx.fill(); ctx.stroke();
      }
    }
  });

  // =============================================================================================
  // 落山風靈 fallwind (BOSS) — furious 恆春 downslope-wind spirit: a maned storm giant pouring down
  // the mountain, sweeping gust-blade claws, a rolling grass-and-sand storm for a lower body
  // =============================================================================================
  const FW = [
    { sand: '#c4a068', sandL: '#ecd4a0', sandD: '#7a5832', wind: '#f8efd8', grass: '#c4bc66', grassD: '#7a7430', eye: '#fffbe8', glowc: '#ffe08a', rim: '#fff2c0', mouth: '#2a1608' },
    { sand: '#8a9a86', sandL: '#c8d4c0', sandD: '#465648', wind: '#eef4ea', grass: '#a4b874', grassD: '#5a6a3a', eye: '#effff6', glowc: '#a8f0d0', rim: '#e0fff0', mouth: '#142018' },
    { sand: '#ae5e48', sandL: '#e8a282', sandD: '#58281e', wind: '#ffe6d6', grass: '#d09450', grassD: '#7a4a24', eye: '#fff2e2', glowc: '#ffa064', rim: '#ffd8c0', mouth: '#2a0806' },
  ];
  function fwCol(v, ph) {
    const C = Object.assign({}, FW[v]);
    if (ph >= 2) { C.sand = mix(C.sand, '#8a6040', 0.15); }
    if (ph === 3) { C.sand = mix(C.sand, '#a0402a', 0.35); C.sandL = mix(C.sandL, '#f08a60', 0.3); C.sandD = mix(C.sandD, '#4a1410', 0.35); C.glowc = '#ff7a40'; C.eye = '#ffe0c0'; C.rim = mix(C.rim, '#ff9a6a', 0.5); }
    return C;
  }
  function fwTorso(v, ph) {
    const C = fwCol(v, ph);
    return spr('fw:torso:' + v + ':' + ph, 220, 190, 100, 250, (g) => {
      const pts = [[-36, -100], [-64, -146], [-86, -186], [-62, -224], [-14, -244], [40, -240], [78, -216], [98, -184], [80, -146], [44, -112], [12, -98]];
      // grass tufts sticking out of the back (behind)
      for (let i = 0; i < 12; i++) {
        const bx = -76 + i * 6, by = -150 - i * 7;
        g.strokeStyle = i % 2 ? C.grass : C.grassD; g.lineWidth = 2;
        g.beginPath(); g.moveTo(bx + 10, by + 8); g.quadraticCurveTo(bx - 10, by - 8, bx - 26 - (i % 3) * 6, by - 4 - (i % 4) * 5); g.stroke();
      }
      const body = tufted(pts, 9, 3, 41);
      paint(g, body, -82, -240, 172, 152, pal(C.sand, C.rim, { l: C.sandL, d: C.sandD, o: shade(C.sandD, -0.4) }), { lw: 2.4, hl: 0.45, rimW: 12, rimA: 0.65,
        inside: (c) => {
          // churning dust swirls
          for (let i = 0; i < 10; i++) {
            const rx = -64 + (i * 31) % 140, ry = -220 + (i * 47) % 120, r = 12 + (i % 3) * 8;
            c.strokeStyle = rgba(C.sandL, 0.4); c.lineWidth = 3;
            c.beginPath(); c.arc(rx, ry, r, 2.6 + i, 4.6 + i); c.stroke();
            c.strokeStyle = rgba(C.sandD, 0.35); c.lineWidth = 3.5;
            c.beginPath(); c.arc(rx + 2, ry + 3, r, 4.8 + i, 6.2 + i); c.stroke();
          }
          // muscle masses: pectoral & shoulder
          c.fillStyle = rgba(C.sandD, 0.28);
          c.beginPath(); c.ellipse(36, -150, 40, 26, -0.3, 0, PI); c.fill();
          c.beginPath(); c.ellipse(60, -196, 26, 20, 0.6, 0.6, PI + 0.6); c.fill();
          c.fillStyle = rgba(C.sandL, 0.25);
          c.beginPath(); c.ellipse(20, -176, 34, 16, -0.3, PI, TAU); c.fill();
          // sand grain speckle
          for (let i = 0; i < 160; i++) { c.fillStyle = rgba(i % 2 ? C.sandD : C.sandL, 0.35); c.fillRect(-80 + U.hash(i, 1, 41) * 170, -240 + U.hash(i, 2, 41) * 150, 1.4, 1.4); }
        } });
    });
  }
  function fwHead(v, ph) {
    const C = fwCol(v, ph);
    return spr('fw:head:' + v + ':' + ph, 150, 130, 70, 66, (g) => {
      // swept wind brows / horns of compressed air
      for (const [oy, s] of [[-26, 1], [-14, 0.8]]) {
        const p = new Path2D();
        p.moveTo(36, oy + 6); p.bezierCurveTo(10, oy - 18 * s, -30, oy - 30 * s, -62, oy - 26 * s);
        p.bezierCurveTo(-30, oy - 16 * s, 0, oy - 4, 30, oy + 12); p.closePath();
        const gg = g.createLinearGradient(-60, oy, 36, oy);
        gg.addColorStop(0, rgba(C.wind, 0)); gg.addColorStop(0.5, rgba(C.wind, 0.75)); gg.addColorStop(1, C.wind);
        g.fillStyle = gg; g.fill(p);
      }
      const face = smooth([[-28, -26], [2, -38], [32, -32], [48, -16], [54, 2], [48, 16], [34, 26], [14, 32], [-8, 28], [-24, 14], [-34, -6]]);
      paint(g, face, -34, -38, 88, 70, pal(C.sand, C.rim, { l: C.sandL, d: C.sandD, o: shade(C.sandD, -0.45) }), { lw: 2.4, hl: 0.5, rimW: 8,
        inside: (c) => {
          // deep brow shadow & sockets
          const bg = c.createLinearGradient(0, -20, 0, 0);
          bg.addColorStop(0, rgba(C.sandD, 0)); bg.addColorStop(1, rgba(C.sandD, 0.55));
          c.fillStyle = bg; c.fillRect(-10, -20, 70, 20);
          for (const [ex, ey, r] of [[16, -6, 9], [38, -7, 11]]) {
            const sg = c.createRadialGradient(ex, ey, 1, ex, ey, r);
            sg.addColorStop(0, rgba('#0a0604', 0.95)); sg.addColorStop(1, rgba('#0a0604', 0));
            c.fillStyle = sg; c.fillRect(ex - r, ey - r, r * 2, r * 2);
          }
          // cheek ridges & wind scars
          c.strokeStyle = rgba(C.sandD, 0.6); c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(-20, 0); c.quadraticCurveTo(0, 4, 14, 14); c.stroke();
          c.beginPath(); c.moveTo(-22, 10); c.quadraticCurveTo(-4, 12, 8, 22); c.stroke();
          c.strokeStyle = rgba(C.sandL, 0.55); c.lineWidth = 1.4;
          c.beginPath(); c.moveTo(-18, -2); c.quadraticCurveTo(0, 2, 12, 11); c.stroke();
        } });
      // heavy angry brow ridge
      const brow = smooth([[6, -18], [24, -24], [48, -20], [52, -12], [30, -12], [12, -10]]);
      paint(g, brow, 6, -24, 46, 14, pal(shade(C.sand, -0.15), null, { l: C.sandL, d: C.sandD }), { lw: 1.8, hl: 0.55 });
      // broad nose
      const nose = smooth([[44, -10], [56, 0], [54, 8], [44, 8]]);
      paint(g, nose, 44, -10, 12, 18, pal(C.sand, null, { l: C.sandL, d: C.sandD }), { lw: 1.6, hl: 0.4 });
      g.fillStyle = C.mouth; g.beginPath(); g.ellipse(50, 6, 2.4, 1.6, 0.3, 0, TAU); g.fill();
    });
  }
  function fwSkirt(v, ph) {
    const C = fwCol(v, ph);
    return spr('fw:skirt:' + v + ':' + ph, 340, 150, 170, 140, (g) => {
      const sk = tufted([[-60, -122], [-10, -128], [44, -122], [86, -100], [128, -60], [166, -24], [150, -4], [60, 0], [-60, 0], [-150, -6], [-130, -40], [-94, -84]], 12, 3, 61);
      const gr = g.createLinearGradient(0, -130, 0, 0);
      gr.addColorStop(0, rgba(C.sand, 0.8)); gr.addColorStop(0.5, rgba(C.sandD, 0.55)); gr.addColorStop(1, rgba(C.sandD, 0.05));
      g.fillStyle = gr; g.fill(sk);
      g.save(); g.clip(sk);
      // swirl bands of the rolling storm
      for (let i = 0; i < 7; i++) {
        const yy = -120 + i * 17, w = 70 + i * 14;
        g.strokeStyle = rgba(i % 2 ? C.sandL : C.wind, 0.35); g.lineWidth = 3 + (i % 3);
        g.beginPath(); g.ellipse(-10 + i * 3, yy, w, 9 + i, 0, 0.1 + i * 0.4, 2.4 + i * 0.4); g.stroke();
        g.strokeStyle = rgba(shade(C.sandD, -0.3), 0.35); g.lineWidth = 4;
        g.beginPath(); g.ellipse(-6 + i * 3, yy + 5, w, 9 + i, 0, 3.4 + i * 0.3, 5.2 + i * 0.3); g.stroke();
      }
      const rg = g.createLinearGradient(-150, -130, 150, 0);
      rg.addColorStop(0.55, rgba(C.rim, 0)); rg.addColorStop(1, rgba(C.rim, 0.5));
      g.strokeStyle = rg; g.lineWidth = 10; g.stroke(sk);
      g.restore();
      g.strokeStyle = rgba(shade(C.sandD, -0.4), 0.6); g.lineWidth = 2; g.stroke(sk);
    });
  }
  def('fallwind', 330, 345, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = fwCol(P.v, P.ph);
    ctx.translate(x + P.shake - P.hurt * 10, y);
    const fury = (P.ph - 1) * 0.5;
    const flow = t * (90 + fury * 50 + P.atk * 80);
    const sandC = pal(C.sand, C.rim, { l: C.sandL, d: C.sandD, o: shade(C.sandD, -0.4) });
    // ---- descending wind streams from the upper-left mountain ----
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const f = k / 10;
        pts.push([-170 + i * 16 + f * (150 - i * 10), -340 + i * 18 + f * (170 + i * 12) + sin(t * 1.8 + f * 4 + i) * 8]);
      }
      const rs = pts.map((_, k) => 4 + sin(k / 10 * PI) * (12 - i * 1.4));
      const p = tube(pts, rs);
      const gr = ctx.createLinearGradient(-170, -340, 0, -150);
      gr.addColorStop(0, rgba(C.wind, 0)); gr.addColorStop(0.5, rgba(C.wind, 0.18 + fury * 0.06)); gr.addColorStop(1, rgba(C.sandL, 0.3));
      ctx.fillStyle = gr; ctx.fill(p);
      ctx.setLineDash([26, 40]); ctx.lineDashOffset = -flow - i * 17;
      ctx.strokeStyle = rgba(C.wind, 0.45); ctx.lineWidth = 2;
      ctx.stroke(smooth(pts, false));
      ctx.setLineDash([]);
    }
    // ---- back sandstorm layer ----
    for (let i = 0; i < 12; i++) {
      const f = ((t * (0.12 + fury * 0.05) + i / 12) % 1);
      const px = -170 + f * 340, py = -36 - (i % 4) * 16 - sin(f * PI) * 20;
      puff(ctx, px, py, 40 + (i % 3) * 14, i % 2 ? C.sandD : C.sand, 0.45 * sin(f * PI));
    }
    // back arm, planted in the storm
    const breath = sin(t * 1.5);
    const lean = P.atk * 0.12 - P.wind * 0.1 - P.hurt * 0.14 + breath * 0.01;
    ctx.save();
    ctx.translate(0, -90); ctx.rotate(lean); ctx.translate(0, 90);
    const bA = [[-56, -196], [-104, -150 + breath * 2], [-118, -70 - P.cast * 120]];
    paintTube(ctx, bA, [28, 22, 18], pal(shade(C.sand, -0.2), null, { l: C.sand, d: C.sandD }), { lw: 2.2, shA: 0.35 });
    // ---- storm skirt + torso ----
    ctx.restore();
    put(ctx, fwSkirt(P.v, P.ph), 0, 0, 1 + sin(t * 2.2) * 0.015, 0, 1);
    ctx.save();
    ctx.translate(0, -90); ctx.rotate(lean); ctx.translate(0, 90);
    put(ctx, fwTorso(P.v, P.ph), 0, 0, 1, 0, 1 + breath * 0.012);
    // ---- head + streaming mane ----
    ctx.save();
    ctx.translate(62 + P.atk * 10, -246 + breath * 2 - P.cast * 8); ctx.scale(1.4, 1.4);
    const hx = 0, hy = 0;
    // wild mane of grass & wind framing the face, streaming back up-slope
    for (let i = 0; i < 13; i++) {
      const a0 = -1.9 + i * 0.27;
      const sx = hx + 4 + cos(a0) * 28, sy = hy - 2 + sin(a0) * 30;
      const pts = [], rr = [];
      const len = 70 + (i % 4) * 16 + (i > 8 ? -20 : 0);
      for (let k = 0; k <= 12; k++) {
        const f = k / 12;
        const dir = -2.75 + (i - 6) * 0.06;
        pts.push([sx + cos(dir) * f * len + f * f * (i - 6) * -2, sy + sin(dir) * f * len + sin(t * 3.4 - f * 6 + i * 0.9) * 7 * f - (i < 4 ? f * f * 20 : 0)]);
        rr.push((1 - f) * (11 - abs(i - 6) * 0.5) + 0.6);
      }
      const p = tube(pts, rr);
      const col = i % 3 === 0 ? C.grass : i % 3 === 1 ? C.sandL : C.wind;
      const gr = ctx.createLinearGradient(sx, sy, pts[12][0], pts[12][1]);
      gr.addColorStop(0, rgba(col, 0.95)); gr.addColorStop(1, rgba(col, 0.15));
      ctx.fillStyle = gr; ctx.fill(p);
      ctx.strokeStyle = rgba(i % 3 === 0 ? C.grassD : shade(C.sandD, -0.2), 0.5); ctx.lineWidth = 0.8; ctx.stroke(p);
    }
    // spiky ruff of wind-blown grass around the head
    {
      const rp = [];
      for (let i = 0; i <= 16; i++) {
        const a = -1.5 - i * 0.2;
        const r = i % 2 ? 40 : 60 + (i % 4) * 6;
        const sweep = i % 2 ? 0 : -0.35;
        rp.push([hx + 6 + cos(a + sweep) * r * 1.05, hy + 2 + sin(a + sweep) * r * 0.95 + (i % 2 ? 0 : sin(t * 4 + i) * 3)]);
      }
      rp.push([hx + 2, hy + 34]); rp.push([hx + 22, hy - 30]);
      const ruff = poly(rp);
      paint(ctx, ruff, hx - 60, hy - 60, 100, 100, pal(mix(C.grass, C.sand, 0.4), C.rim, { l: C.wind, d: C.grassD, o: shade(C.grassD, -0.5) }), { lw: 1.8, hl: 0.45, rimW: 6,
        inside: (g) => {
          g.strokeStyle = rgba(C.grassD, 0.55); g.lineWidth = 1.2;
          for (let i = 0; i < 14; i++) { const a = -1.6 - i * 0.22; g.beginPath(); g.moveTo(hx + 6 + cos(a) * 20, hy + sin(a) * 20); g.lineTo(hx + 6 + cos(a - 0.3) * 54, hy + sin(a - 0.3) * 50); g.stroke(); }
        } });
    }
    put(ctx, fwHead(P.v, P.ph), hx, hy, 1, P.atk * 0.08 - P.hurt * 0.12);
    // shouting mouth
    const shout = 0.5 + 0.2 * sin(t * 2.3) + P.atk * 0.5 + P.cast * 0.4 - P.hurt * 0.2;
    const mx = hx + 30, my = hy + 16;
    const mp = new Path2D();
    mp.moveTo(mx - 18, my - 2); mp.quadraticCurveTo(mx, my - 6, mx + 18, my - 3);
    mp.quadraticCurveTo(mx + 16, my + 8 + 14 * shout, mx - 2, my + 10 + 16 * shout);
    mp.quadraticCurveTo(mx - 16, my + 6 + 10 * shout, mx - 18, my - 2); mp.closePath();
    ctx.fillStyle = C.mouth; ctx.fill(mp);
    ctx.save(); ctx.clip(mp);
    glow(ctx, mx, my + 8 * shout, 18, C.glowc, 0.5 + shout * 0.3);
    ctx.fillStyle = '#f6f0e0';
    for (let i = 0; i < 4; i++) { const tx = mx - 12 + i * 8; ctx.beginPath(); ctx.moveTo(tx - 3, my - 5); ctx.lineTo(tx, my + 4); ctx.lineTo(tx + 3, my - 5); ctx.fill(); }
    for (let i = 0; i < 3; i++) { const tx = mx - 8 + i * 8; const by = my + 8 + 14 * shout; ctx.beginPath(); ctx.moveTo(tx - 3, by + 4); ctx.lineTo(tx, by - 4); ctx.lineTo(tx + 3, by + 4); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = shade(C.sandD, -0.45); ctx.lineWidth = 1.8; ctx.stroke(mp);
    // grass beard swaying
    for (let i = 0; i < 6; i++) {
      const bx = hx + 8 + i * 5, by = hy + 26 + (i % 2) * 2;
      ctx.strokeStyle = i % 2 ? C.grass : C.grassD; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx - 8 + sin(t * 3 + i) * 3, by + 14, bx - 18 + sin(t * 3 + i) * 6, by + 22 + (i % 3) * 5); ctx.stroke();
    }
    // eyes
    const fl = 0.85 + 0.15 * sin(t * 8);
    for (const [ex, ey, s] of [[hx + 16, hy - 6, 0.85], [hx + 38, hy - 7, 1]]) {
      glow(ctx, ex, ey, 26 * s, C.glowc, 0.85 * fl);
      ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(ex + 1, ey, 5.5 * s, 2.8 * s * (1 - P.hurt * 0.6), -0.12, 0, TAU); ctx.fill();
    }
    // howling gust from the mouth
    for (let i = 0; i < 3; i++) {
      const f = (t * 1.1 + i / 3) % 1;
      ctx.strokeStyle = rgba(C.wind, 0.5 * (1 - f) * shout); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(mx + 26 + f * 60, my + 6, 6 + f * 8, 12 + f * 20, 0, -1.3, 1.3); ctx.stroke();
    }
    ctx.restore();
    // ---- front arm with gust-blade claws ----
    const fS = [72, -206];
    let fE = [126, -168 + breath * 2], fH = [154, -110 + breath * 3];
    fE = [lerp(fE[0], 104, P.wind), lerp(fE[1], -276, P.wind)]; fH = [lerp(fH[0], 64, P.wind), lerp(fH[1], -330, P.wind)];
    fE = [lerp(fE[0], 156, P.atk), lerp(fE[1], -196, P.atk)]; fH = [lerp(fH[0], 216, P.atk), lerp(fH[1], -150, P.atk)];
    fE = [lerp(fE[0], 130, P.cast), lerp(fE[1], -250, P.cast)]; fH = [lerp(fH[0], 150, P.cast), lerp(fH[1], -318, P.cast)];
    const ap = [fS, [lerp(fS[0], fE[0], 0.5), lerp(fS[1], fE[1], 0.5) - 4], fE, [lerp(fE[0], fH[0], 0.5), lerp(fE[1], fH[1], 0.5)], fH];
    paintTube(ctx, ap, [30, 26, 22, 19, 17], sandC, { lw: 2.4, rimW: 7,
      inside: (g) => {
        g.setLineDash([14, 18]); g.lineDashOffset = -flow * 0.6;
        g.strokeStyle = rgba(C.wind, 0.45); g.lineWidth = 2.4;
        g.stroke(smooth(ap.map((q) => [q[0] - 6, q[1] - 6]), false));
        g.setLineDash([]);
      } });
    const aEnd = fH, aPrev = ap[3];
    const ang = atan2(aEnd[1] - aPrev[1], aEnd[0] - aPrev[0]);
    for (let i = 0; i < 3; i++) {
      const ca = ang + (i - 1) * 0.5;
      const cp = [], cr = [];
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        const aa = ca + f * 1.1;
        cp.push([aEnd[0] + cos(ca) * 10 + cos(aa) * f * 54, aEnd[1] + sin(ca) * 10 + sin(aa) * f * 54]);
        cr.push((1 - f) * 8 + 0.4);
      }
      const bp = tube(cp, cr);
      ctx.fillStyle = rgba(C.wind, 0.92); ctx.fill(bp);
      ctx.strokeStyle = rgba(shade(C.sandD, -0.2), 0.9); ctx.lineWidth = 1.4; ctx.stroke(bp);
      ctx.save(); ctx.clip(bp);
      ctx.strokeStyle = rgba(C.glowc, 0.7); ctx.lineWidth = 3; ctx.stroke(smooth(cp.map((q) => [q[0] + 2, q[1] + 2]), false));
      ctx.restore();
    }
    if (P.atk > 0.2) {
      for (let i = 0; i < 5; i++) streak(ctx, [[aEnd[0] - 120, aEnd[1] - 90 + i * 16], [aEnd[0] - 50, aEnd[1] - 50 + i * 14], [aEnd[0] + 40, aEnd[1] - 6 + i * 10]], 3.4, C.wind, 0.6 * P.atk);
    }
    ctx.restore();
    // ---- front sandstorm layer: rolling dust, flying grass, grains ----
    for (let i = 0; i < 10; i++) {
      const f = ((t * (0.18 + fury * 0.06) + i / 10 + 0.05) % 1);
      const px = -180 + f * 360, py = -14 - (i % 3) * 14 - sin(f * PI) * 10;
      puff(ctx, px, py, 30 + (i % 4) * 10, i % 3 ? C.sand : C.sandL, 0.5 * sin(f * PI));
    }
    ctx.setLineDash([60, 90]);
    for (let i = 0; i < 4; i++) {
      ctx.lineDashOffset = -flow * 1.4 - i * 23;
      ctx.strokeStyle = rgba(C.wind, 0.3); ctx.lineWidth = 2.2;
      const yy = -10 - i * 12;
      ctx.beginPath(); ctx.moveTo(-170, yy); ctx.quadraticCurveTo(0, yy - 14 + sin(t + i) * 6, 170, yy - 4); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let i = 0; i < 9 + P.ph * 3; i++) {
      const f = ((t * (0.35 + (i % 3) * 0.1) + i * 0.137) % 1);
      const px = -170 + f * 360, py = -30 - (i * 29) % 260 + sin(t * 3 + i) * 8;
      ctx.save(); ctx.translate(px, py); ctx.rotate(t * 5 + i);
      if (i % 3 === 0) {
        // 芒草 silver-grass plume
        ctx.strokeStyle = C.grassD; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); ctx.stroke();
        ctx.fillStyle = rgba(C.wind, 0.85);
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(-12 - k * 3, (k % 2 ? 2 : -2), 4, 1.6, (k % 2 ? 0.5 : -0.5), 0, TAU); ctx.fill(); }
      } else {
        ctx.strokeStyle = i % 2 ? C.grass : C.grassD; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, -4, 9, 0); ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = 0; i < 30; i++) {
      const f = ((t * 0.9 + i * 0.071) % 1);
      ctx.fillStyle = rgba(i % 2 ? C.sandL : C.sandD, 0.8 * sin(f * PI));
      ctx.fillRect(-170 + f * 350, -10 - (i * 37) % 150, 2, 2);
    }
    if (P.cast > 0) {
      for (let i = 0; i < 3; i++) {
        const r = 60 + i * 40 + ((P.st * 80) % 40);
        ctx.strokeStyle = rgba(C.wind, 0.4 * P.cast); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, -60, r * 1.4, r * 0.35, 0, t * 2 + i, t * 2 + i + 3.6); ctx.stroke();
      }
      glow(ctx, fH[0], fH[1], 70, C.glowc, 0.4 * P.cp);
    }
  });

  // =============================================================================================
  // gorge_colossus (BOSS) — tide-corrupted marble colossus of the gorge: folded white marble blocks,
  // turquoise river light in its cracks, black tide ooze bleeding out of the seams
  // =============================================================================================
  const GC = [
    { l: '#ffffff', b: '#e4e2dc', d: '#a2a4aa', o: '#4e5664', vein: '#5e6674', band: '#7e8898', glowc: '#46e6d6', glowL: '#c8fff8', moss: '#4a7a3a', rim: '#9ffff0', ooze: '#0a0a16', sheen: '#6a4aa8' },
    { l: '#eeece6', b: '#a8a8a2', d: '#686a6a', o: '#30323a', vein: '#24262c', band: '#44464c', glowc: '#ffb44a', glowL: '#fff0c8', moss: '#6a6a2a', rim: '#ffd8a0', ooze: '#0c0a08', sheen: '#8a5a2a' },
    { l: '#8c8a9a', b: '#5c5a6c', d: '#32303c', o: '#14121a', vein: '#c4bce0', band: '#968cb8', glowc: '#b884ff', glowL: '#f0e0ff', moss: '#3a4a5a', rim: '#d4b4ff', ooze: '#06040c', sheen: '#a04a8a' },
  ];
  // front quad + top & right faces (3/4 block). q = [tl, tr, br, bl]
  function slab(g, q, d, C, seed, o = {}) {
    const dx = d * 0.32, dy = d * 0.42;
    const top = [q[0], q[1], [q[1][0] + dx, q[1][1] - dy], [q[0][0] + dx, q[0][1] - dy]];
    const side = [q[1], [q[1][0] + dx, q[1][1] - dy], [q[2][0] + dx, q[2][1] - dy], q[2]];
    if (o.top !== false) {
      const tp = roundPoly(top, 3);
      const tg = g.createLinearGradient(top[3][0], top[3][1], top[1][0], top[1][1]);
      tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, C.b);
      g.fillStyle = tg; g.fill(tp); g.strokeStyle = C.o; g.lineWidth = 1.6; g.stroke(tp);
    }
    if (o.side !== false) {
      const sp = roundPoly(side, 3);
      g.fillStyle = C.d; g.fill(sp);
      g.fillStyle = rgba(C.o, 0.3); g.fill(sp);
      g.strokeStyle = C.o; g.lineWidth = 1.6; g.stroke(sp);
    }
    return stoneBlock(g, q, C, seed, { r: 5, veins: o.veins ?? 3, inside: o.inside, lw: 2 });
  }
  function oozeRun(g, x, y, w, len, C, seed) {
    const R = U.seeded(seed);
    const p = new Path2D();
    p.moveTo(x - w / 2, y);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x0 = x - w / 2 + i * w / n, x1 = x0 + w / n, l = len * (0.4 + R() * 0.8);
      p.bezierCurveTo(x0 + 1, y + l, x1 - 1, y + l, x1, y + 2);
    }
    p.lineTo(x + w / 2, y - 4); p.quadraticCurveTo(x, y - 10, x - w / 2, y - 4); p.closePath();
    g.fillStyle = C.ooze; g.fill(p);
    g.strokeStyle = rgba(C.sheen, 0.7); g.lineWidth = 1.2; g.stroke(p);
    g.fillStyle = rgba(C.sheen, 0.5); g.beginPath(); g.ellipse(x - w * 0.2, y + 2, w * 0.12, 1.5, 0, 0, TAU); g.fill();
  }
  function gcBody(v, ph) {
    const C = GC[v];
    return spr('gc:body:' + v + ':' + ph, 300, 420, 150, 410, (g) => {
      const cr = (pts, w) => crack(g, pts, C.glowL, w);
      // back leg
      slab(g, [[-74, -150], [-30, -150], [-28, -70], [-70, -72]], 22, C, 3, { top: false });
      slab(g, [[-76, -70], [-30, -70], [-28, -14], [-78, -14]], 22, C, 4, { top: false });
      slab(g, [[-90, -16], [-24, -16], [-22, 0], [-94, 0]], 24, C, 5);
      // front leg
      slab(g, [[4, -150], [56, -152], [60, -74], [8, -70]], 26, C, 6, { top: false, inside: (c) => { cr([[20, -150], [28, -120], [22, -96]], 1); } });
      slab(g, [[6, -72], [62, -74], [64, -16], [4, -14]], 26, C, 7, { top: false, inside: (c) => { cr([[44, -72], [38, -50], [46, -30]], 0.9); } });
      slab(g, [[-6, -16], [70, -18], [74, 0], [-10, 0]], 28, C, 8);
      // pelvis
      slab(g, [[-80, -190], [74, -186], [62, -140], [-70, -142]], 30, C, 9, { top: false });
      // torso: massive hewn cliff-chunk, irregular
      const tq = [[-112, -300], [-70, -330], [20, -334], [96, -320], [118, -284], [100, -236], [70, -190], [-2, -178], [-72, -186], [-100, -236]];
      g.fillStyle = C.d; g.fill(roundPoly(tq.map((q) => [q[0] + 10, q[1] - 12]), 8));
      g.strokeStyle = C.o; g.lineWidth = 1.6; g.stroke(roundPoly(tq.map((q) => [q[0] + 10, q[1] - 12]), 8));
      stoneBlock(g, tq, C, 10, { r: 10, veins: 6, bandA: -0.12,
        facets: [[[[-112, -300], [-70, -330], [20, -334], [96, -320], [60, -306], [-10, -300], [-70, -296]], '#ffffff', 0.28],
          [[[118, -284], [100, -236], [70, -190], [62, -230], [84, -280]], C.o, 0.22]],
        inside: (c) => {
          // strong folded grey striations (gorge marble)
          for (let i = 0; i < 5; i++) {
            c.strokeStyle = rgba(C.band, 0.38); c.lineWidth = 5 + (i % 2) * 4;
            c.beginPath();
            for (let k = 0; k <= 14; k++) { const xx = -120 + k * 18; const yy = -300 + i * 24 + sin(k * 0.7 + i) * 8 + k * 1.2; if (k === 0) c.moveTo(xx, yy); else c.lineTo(xx, yy); }
            c.stroke();
          }
          // carved pectoral ledges
          c.fillStyle = rgba(C.o, 0.25);
          c.beginPath(); c.moveTo(-90, -262); c.quadraticCurveTo(-40, -244, -6, -262); c.lineTo(-6, -254); c.quadraticCurveTo(-40, -236, -90, -254); c.closePath(); c.fill();
          c.beginPath(); c.moveTo(10, -262); c.quadraticCurveTo(56, -246, 100, -262); c.lineTo(98, -254); c.quadraticCurveTo(56, -238, 10, -254); c.closePath(); c.fill();
          // river-light crack network radiating from the core
          cr([[2, -258], [-20, -280], [-40, -276], [-60, -300]], 1.3);
          cr([[2, -258], [26, -236], [52, -244], [76, -228]], 1.3);
          cr([[2, -258], [-6, -226], [-26, -206], [-30, -188]], 1.1);
          cr([[2, -258], [20, -290], [40, -300], [44, -318]], 1.0);
          if (ph >= 2) { cr([[-84, -240], [-60, -230], [-56, -206]], 1); cr([[60, -300], [80, -284], [96, -290]], 1); }
          if (ph >= 3) { cr([[-30, -320], [-24, -300], [-40, -290]], 1); cr([[30, -200], [46, -214], [62, -204]], 1); }
          const cg = c.createRadialGradient(2, -258, 2, 2, -258, 26);
          cg.addColorStop(0, rgba(C.glowL, 1)); cg.addColorStop(0.35, rgba(C.glowc, 0.9)); cg.addColorStop(1, rgba(C.glowc, 0));
          c.fillStyle = cg; c.fillRect(-28, -288, 60, 60);
          // corruption creeping up from below
          const oc = c.createLinearGradient(0, -178, 0, -250 - ph * 20);
          oc.addColorStop(0, rgba(C.ooze, 0.75)); oc.addColorStop(1, rgba(C.ooze, 0));
          c.fillStyle = oc; c.fillRect(-120, -330, 240, 160);
        } });
      // tide ooze bleeding from the seams
      oozeRun(g, -30, -186, 34, 26 + ph * 8, C, 11);
      oozeRun(g, 40, -184, 26, 20 + ph * 10, C, 12);
      oozeRun(g, -52, -142, 22, 30 + ph * 8, C, 13);
      if (ph >= 2) { oozeRun(g, 30, -70, 24, 26, C, 14); oozeRun(g, -60, -276, 26, 30, C, 15); }
      if (ph >= 3) { oozeRun(g, 70, -262, 22, 34, C, 16); oozeRun(g, -50, -70, 20, 30, C, 17); }
      // head: rough-hewn boulder sunk between the shoulders, deep eye sockets
      stoneBlock(g, [[-28, -350], [-4, -372], [30, -368], [44, -344], [36, -318], [-20, -316], [-34, -332]], C, 18, { r: 9, veins: 2,
        facets: [[[[-28, -350], [-4, -372], [30, -368], [44, -344], [20, -350], [-8, -348]], '#ffffff', 0.25]],
        inside: (c) => {
          c.fillStyle = rgba(C.o, 0.5); c.beginPath(); c.moveTo(-6, -352); c.lineTo(44, -350); c.lineTo(42, -342); c.lineTo(-4, -344); c.closePath(); c.fill();
          for (const [ex, ey, r] of [[8, -339, 8], [30, -340, 9]]) {
            const sg = c.createRadialGradient(ex, ey, 1, ex, ey, r);
            sg.addColorStop(0, rgba('#020406', 1)); sg.addColorStop(0.7, rgba('#020406', 0.8)); sg.addColorStop(1, rgba('#020406', 0));
            c.fillStyle = sg; c.fillRect(ex - r, ey - r, r * 2, r * 2);
          }
          c.strokeStyle = rgba(C.o, 0.6); c.lineWidth = 2; c.beginPath(); c.moveTo(10, -324); c.lineTo(36, -326); c.stroke();
        } });
      crack(g, [[-20, -344], [-12, -332], [-18, -322]], C.glowL, 0.8);
      // moss & a little gorge pine on the head
      const moss = tufted([[-26, -352], [-4, -376], [28, -372], [36, -362], [8, -362], [-14, -350]], 3, 3, 8);
      paint(g, moss, -26, -376, 62, 26, pal(C.moss, null, { l: shade(C.moss, 0.4) }), { lw: 1.4, hl: 0.4 });
      g.strokeStyle = '#4a3420'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(22, -372); g.quadraticCurveTo(30, -384, 26, -398); g.stroke();
      for (const [px, py, w] of [[26, -398, 16], [24, -390, 22], [28, -382, 14]]) {
        const pp = new Path2D(); pp.ellipse(px, py, w / 2, 4.4, 0.1, 0, TAU);
        paint(g, pp, px - w / 2, py - 4, w, 8, pal('#2e5a34', null, { l: '#5a8a4a' }), { lw: 1, hl: 0.4 });
      }
      // black tide stain rising from the feet
      g.globalCompositeOperation = 'source-atop';
      const st = g.createLinearGradient(0, 0, 0, -120 - ph * 25);
      st.addColorStop(0, rgba(C.ooze, 0.95)); st.addColorStop(0.35, rgba(C.ooze, 0.7)); st.addColorStop(0.7, rgba(C.sheen, 0.2)); st.addColorStop(1, rgba(C.ooze, 0));
      g.fillStyle = st; g.fillRect(-150, -200, 300, 200);
      g.globalCompositeOperation = 'source-over';
    });
  }
  // shoulder boulder / arm segments
  function gcPart(v, kind) {
    const C = GC[v];
    if (kind === 'shoulder') return spr('gc:sh:' + v, 110, 100, 55, 50, (g) => {
      stoneBlock(g, [[-40, -30], [-6, -44], [34, -34], [46, -2], [32, 30], [-10, 38], [-42, 18]], C, 21, { r: 12, veins: 4,
        facets: [[[[-40, -30], [-6, -44], [34, -34], [20, -18], [-20, -14]], '#ffffff', 0.25]] });
      crack(g, [[-20, -10], [-4, 4], [-10, 20]], C.glowL, 1);
    });
    if (kind === 'upper') return spr('gc:up:' + v, 60, 110, 30, 10, (g) => {
      stoneBlock(g, [[-22, 0], [22, 0], [20, 84], [-18, 86]], C, 22, { r: 6, veins: 3 });
      crack(g, [[-8, 20], [2, 40], [-4, 60]], C.glowL, 0.9);
    });
    if (kind === 'fore') return spr('gc:fo:' + v, 66, 110, 33, 10, (g) => {
      stoneBlock(g, [[-22, 0], [24, 0], [28, 80], [-26, 84]], C, 23, { r: 6, veins: 3 });
      crack(g, [[10, 8], [4, 30], [12, 52]], C.glowL, 0.9);
    });
    return spr('gc:fist:' + v, 90, 90, 45, 45, (g) => {
      stoneBlock(g, [[-32, -26], [24, -32], [38, -6], [34, 28], [-6, 36], [-36, 22]], C, 24, { r: 9, veins: 3,
        facets: [[[[-32, -26], [24, -32], [38, -6], [4, -10], [-20, -8]], '#ffffff', 0.2]],
        inside: (c) => {
          c.strokeStyle = rgba(C.o, 0.5); c.lineWidth = 2;
          for (const yy of [-6, 6, 18]) { c.beginPath(); c.moveTo(14, yy); c.lineTo(36, yy - 2); c.stroke(); }
        } });
      crack(g, [[-20, -14], [-10, 0], [-18, 16]], C.glowL, 0.9);
    });
  }
  function gcArm(ctx, v, S, E, H, C, t, glowA) {
    // gaps between floating segments glow with river light
    glow(ctx, E[0], E[1], 26, C.glowc, glowA);
    glow(ctx, H[0], H[1], 26, C.glowc, glowA);
    const a1 = atan2(E[1] - S[1], E[0] - S[0]) - PI / 2;
    const a2 = atan2(H[1] - E[1], H[0] - E[0]) - PI / 2;
    const l1 = hypot(E[0] - S[0], E[1] - S[1]), l2 = hypot(H[0] - E[0], H[1] - E[1]);
    put(ctx, gcPart(v, 'upper'), S[0], S[1], 1, a1, l1 / 92);
    put(ctx, gcPart(v, 'fore'), E[0], E[1], 1, a2, l2 / 88);
    put(ctx, gcPart(v, 'fist'), H[0], H[1], 1, a2 * 0.4);
  }
  def('gorge_colossus', 340, 390, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = GC[P.v];
    ctx.translate(x + P.shake - P.hurt * 8, y);
    const breath = sin(t * 1.1);
    const pulse = 0.7 + 0.3 * sin(t * 2.2) + (P.ph - 1) * 0.15;
    // ground ooze puddle
    pool(ctx, 0, -2, 130, 18, t, '#100c1c', C.sheen, 0.8);
    const lean = P.atk * 0.06 - P.wind * 0.05 - P.hurt * 0.06;
    ctx.save();
    ctx.translate(0, -150); ctx.rotate(lean); ctx.translate(0, 150);
    const lift = breath * 2;
    // back arm
    const bS = [-110, -294 + lift], bE = [-142 + P.cast * 10, -214 + lift - P.cast * 90], bH = [-150 + P.cast * 20, -130 + lift - P.cast * 200];
    put(ctx, gcPart(P.v, 'shoulder'), bS[0], bS[1], 0.9);
    gcArm(ctx, P.v, [bS[0], bS[1] + 20], bE, bH, C, t, 0.5 * pulse);
    // body (legs/torso/head cached)
    ctx.save(); ctx.translate(0, lift * 0.5);
    ctx.translate(0, -150); ctx.scale(1, 1 + breath * 0.006); ctx.translate(0, 150);
    put(ctx, gcBody(P.v, P.ph), 0, 0);
    ctx.restore();
    // core & visor glow (live)
    glow(ctx, 2, -258 + lift * 0.5, 44 + P.cp * 30, C.glowc, 0.7 * pulse + P.cp * 0.4);
    for (const [ex, ey, s2] of [[8, -339, 0.8], [30, -340, 1]]) {
      glow(ctx, ex, ey + lift * 0.5, 20 * s2, C.glowc, 0.95 * pulse);
      ctx.fillStyle = C.glowL; ctx.beginPath(); ctx.ellipse(ex + 1, ey + lift * 0.5, 4 * s2, (P.hurt > 0.3 ? 0.8 : 2.6) * s2, 0, 0, TAU); ctx.fill();
    }
    // river light flowing in cracks: travelling sparkles
    for (let i = 0; i < 6; i++) {
      const f = (t * 0.5 + i / 6) % 1;
      const pts = [[-60, -300], [76, -228], [-30, -188], [44, -318], [28, -120], [46, -30]][i];
      glow(ctx, lerp(2, pts[0], f), lerp(-258, pts[1], f) + lift * 0.5, 9, C.glowL, 0.7 * sin(f * PI));
    }
    // front shoulder + arm
    const fS = [112, -292 + lift];
    let fE = [150, -214 + lift], fH = [158, -132 + lift];
    fE = [lerp(fE[0], 150, P.wind), lerp(fE[1], -330, P.wind)]; fH = [lerp(fH[0], 116, P.wind), lerp(fH[1], -410, P.wind)];
    fE = [lerp(fE[0], 190, P.atk), lerp(fE[1], -220, P.atk)]; fH = [lerp(fH[0], 236, P.atk), lerp(fH[1], -136, P.atk)];
    fE = [lerp(fE[0], 160, P.cast), lerp(fE[1], -300, P.cast)]; fH = [lerp(fH[0], 150, P.cast), lerp(fH[1], -380, P.cast)];
    gcArm(ctx, P.v, [fS[0], fS[1] + 22], fE, fH, C, t, 0.6 * pulse);
    put(ctx, gcPart(P.v, 'shoulder'), fS[0], fS[1]);
    if (P.atk > 0.3) {
      for (let i = 0; i < 4; i++) streak(ctx, [[fH[0] - 90, fH[1] - 140 + i * 14], [fH[0] - 40, fH[1] - 70 + i * 10], [fH[0] - 10, fH[1] - 20 + i * 6]], 4, C.glowc, 0.5 * P.atk);
      // impact debris
      for (let i = 0; i < 6; i++) {
        const a = -PI / 2 + (i - 2.5) * 0.4;
        const r = 20 + P.atk * 40;
        ctx.fillStyle = C.b; ctx.strokeStyle = C.o; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(fH[0] + 30 + cos(a) * r, fH[1] + 20 + sin(a) * r, 3 + (i % 3), 0, TAU); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
    // black ooze drips (live)
    for (let i = 0; i < 4 + P.ph * 2; i++) {
      const f = (t * 0.45 + i * 0.173) % 1;
      const dx = [-30, 40, -52, 30, -60, 70, -50, 20, 60, -10][i % 10], dy0 = [-160, -164, -112, -46, -240, -226, -40, -60, -120, -150][i % 10];
      ctx.fillStyle = rgba(C.ooze, 0.9 * (1 - f * 0.4));
      ctx.beginPath(); ctx.ellipse(dx, dy0 + f * 60, 2.4, 3.6 + f * 2, 0, 0, TAU); ctx.fill();
    }
    // drifting mist from the gorge river
    for (let i = 0; i < 5; i++) puff(ctx, -140 + i * 70 + sin(t * 0.5 + i) * 10, -10, 40, C.glowc, 0.08);
    if (P.cast > 0) {
      glow(ctx, 0, -250, 160, C.glowc, 0.25 * P.cp);
      for (let i = 0; i < 8; i++) {
        const a = t * 1.2 + i * TAU / 8;
        const px = cos(a) * 150, py = -200 + sin(a) * 40;
        ctx.fillStyle = C.l; ctx.strokeStyle = C.o; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(px - 7, py); ctx.lineTo(px - 2, py - 7); ctx.lineTo(px + 7, py - 3); ctx.lineTo(px + 4, py + 6); ctx.lineTo(px - 4, py + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
        glow(ctx, px, py, 12, C.glowc, 0.5 * P.cast);
      }
    }
  });

  // =============================================================================================
  // tide_serpent (BOSS) — tide-sick sea serpent coiling out of black water: frilled spined head,
  // barnacled coils, sick glowing lateral spots, black ooze
  // =============================================================================================
  const TS = [
    { body: '#1c4454', bodyL: '#3a7a88', belly: '#a8c8b0', fin: '#2a6a72', finE: '#8ae0d0', sick: '#b4ff6a', eye: '#eaff7a', ooze: '#05070c', rim: '#9af0e0', water: '#0a1a24', mouth: '#1a0610' },
    { body: '#34345a', bodyL: '#5a5a8a', belly: '#c4bcd8', fin: '#44447a', finE: '#b4b0f0', sick: '#7ad8ff', eye: '#c8f4ff', ooze: '#05050c', rim: '#c0c8ff', water: '#0c0c22', mouth: '#10081a' },
    { body: '#4a2626', bodyL: '#7a4038', belly: '#d8b090', fin: '#6a3028', finE: '#ffb080', sick: '#ff9a4a', eye: '#ffd26a', ooze: '#080404', rim: '#ffc0a0', water: '#1c0a0a', mouth: '#1a0404' },
  ];
  function tsCol(v, ph) {
    const C = Object.assign({}, TS[v]);
    if (ph === 3) { C.eye = '#ff5a4a'; C.sick = mix(C.sick, '#ff4a8a', 0.5); C.body = mix(C.body, '#2a0a1a', 0.3); }
    return C;
  }
  function tsHead(v, ph) {
    const C = tsCol(v, ph);
    const hc = pal(C.body, C.rim, { l: C.bodyL, o: shade(C.body, -0.7) });
    return spr('ts:head:' + v + ':' + ph, 200, 130, 60, 70, (g) => {
      // spined frill fan behind the skull
      const spines = [[-30, -56], [-44, -36], [-52, -14], [-50, 8]];
      const fan = new Path2D(); fan.moveTo(0, -14);
      for (const [sx, sy] of spines) fan.lineTo(sx, sy);
      fan.lineTo(-10, 14); fan.closePath();
      g.fillStyle = rgba(C.fin, 0.9); g.fill(fan);
      g.save(); g.clip(fan);
      const fg = g.createRadialGradient(0, 0, 4, 0, 0, 60);
      fg.addColorStop(0, rgba(C.finE, 0)); fg.addColorStop(1, rgba(C.finE, 0.55));
      g.fillStyle = fg; g.fillRect(-60, -60, 70, 80);
      g.restore();
      g.strokeStyle = shade(C.fin, -0.5); g.lineWidth = 1.4; g.stroke(fan);
      for (const [sx, sy] of spines) {
        g.strokeStyle = shade(C.fin, -0.5); g.lineWidth = 3.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(sx * 1.08, sy * 1.08); g.stroke();
        g.strokeStyle = C.finE; g.lineWidth = 1.6; g.stroke();
      }
      // skull & long snout
      const head = smooth([[-16, -22], [10, -32], [44, -28], [80, -18], [112, -10], [120, -2], [112, 6], [70, 8], [30, 10], [-6, 14], [-18, 0]]);
      paint(g, head, -18, -32, 138, 46, hc, { lw: 2.4, hl: 0.5, rimW: 7,
        inside: (c) => {
          // scale rows
          c.strokeStyle = rgba(shade(C.body, -0.6), 0.45); c.lineWidth = 1.2;
          for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) {
            const sx = -6 + k * 11 + r * 5, sy = -22 + r * 9 + k * 0.8;
            c.beginPath(); c.arc(sx, sy, 5, 0.2, PI - 0.2); c.stroke();
          }
          // brow ridge shadow
          c.fillStyle = rgba(shade(C.body, -0.6), 0.5);
          c.beginPath(); c.ellipse(46, -16, 22, 6, -0.12, 0, TAU); c.fill();
          // sick lateral spots
          for (let i = 0; i < 5; i++) {
            const px = 4 + i * 12, py = 2 + (i % 2) * 2;
            const sg = c.createRadialGradient(px, py, 0, px, py, 5);
            sg.addColorStop(0, rgba('#ffffff', 0.9)); sg.addColorStop(0.35, rgba(C.sick, 0.9)); sg.addColorStop(1, rgba(C.sick, 0));
            c.fillStyle = sg; c.fillRect(px - 6, py - 6, 12, 12);
          }
        } });
      // brow horn & nostril
      const horn = new Path2D(); horn.moveTo(30, -26); horn.quadraticCurveTo(20, -50, 2, -58); horn.quadraticCurveTo(22, -46, 44, -27); horn.closePath();
      paint(g, horn, 2, -58, 42, 32, pal('#c8ccc0', null, { l: '#ffffff', o: '#3a4038' }), { lw: 1.6, hl: 0.5 });
      g.fillStyle = '#04060a'; g.beginPath(); g.ellipse(108, -8, 3.4, 1.8, -0.3, 0, TAU); g.fill();
      // upper teeth
      g.fillStyle = '#eef0e6'; g.strokeStyle = '#5a5e52'; g.lineWidth = 0.8;
      for (let i = 0; i < 11; i++) {
        const tx = 14 + i * 9, ty = 8 - i * 0.2, th = i % 3 === 1 ? 11 : 7;
        g.beginPath(); g.moveTo(tx - 2.4, ty); g.lineTo(tx, ty + th); g.lineTo(tx + 2.4, ty); g.closePath(); g.fill(); g.stroke();
      }
      // barnacles on the skull
      for (const [bx, by] of [[-4, -16], [4, -24], [-10, -6]]) {
        g.fillStyle = '#d4cec0'; g.beginPath(); g.arc(bx, by, 3.4, 0, TAU); g.fill();
        g.strokeStyle = '#5a5448'; g.lineWidth = 1; g.stroke();
        g.fillStyle = '#3a342c'; g.beginPath(); g.arc(bx, by, 1.2, 0, TAU); g.fill();
      }
    });
  }
  function tsJaw(v, ph) {
    const C = tsCol(v, ph);
    const hc = pal(shade(C.body, -0.1), C.rim, { l: C.bodyL, o: shade(C.body, -0.7) });
    return spr('ts:jaw:' + v + ':' + ph, 150, 60, 20, 16, (g) => {
      const jaw = smooth([[-12, -6], [30, -2], [80, 0], [104, 2], [100, 10], [60, 16], [20, 18], [-10, 10]]);
      paint(g, jaw, -12, -6, 116, 24, hc, { lw: 2, hl: 0.3, rimW: 5,
        inside: (c) => { c.fillStyle = rgba(C.belly, 0.6); c.fillRect(-12, 8, 120, 12); } });
      g.fillStyle = '#eef0e6'; g.strokeStyle = '#5a5e52'; g.lineWidth = 0.8;
      for (let i = 0; i < 10; i++) {
        const tx = 16 + i * 9, th = i % 3 === 0 ? 10 : 6;
        g.beginPath(); g.moveTo(tx - 2.2, -1); g.lineTo(tx, -1 - th); g.lineTo(tx + 2.2, -1); g.closePath(); g.fill(); g.stroke();
      }
    });
  }
  function tsBody(ctx, pts, rs, C, t, ph, dark) {
    const S = tubeSides(pts, rs);
    const n = pts.length - 1;
    // dorsal frill along R side with spines
    const fin = new Path2D();
    fin.moveTo(S.R[2][0], S.R[2][1]);
    const tips = [];
    for (let k = 2; k <= n - 1; k++) {
      const p = pts[k];
      const dx = S.R[k][0] - p[0], dy = S.R[k][1] - p[1], L = hypot(dx, dy) || 1;
      const h = rs[k] + (k % 3 === 0 ? 22 : 12) + sin(k * 0.8 - t * 4) * 3;
      const q = [p[0] + dx / L * h, p[1] + dy / L * h];
      fin.lineTo(q[0], q[1]);
      if (k % 3 === 0) tips.push([S.R[k], q]);
    }
    for (let k = n - 1; k >= 2; k--) fin.lineTo(S.R[k][0], S.R[k][1]);
    fin.closePath();
    ctx.fillStyle = rgba(dark ? shade(C.fin, -0.3) : C.fin, 0.9); ctx.fill(fin);
    ctx.save(); ctx.clip(fin);
    ctx.strokeStyle = rgba(C.finE, 0.5); ctx.lineWidth = 3; ctx.stroke(fin);
    ctx.restore();
    ctx.strokeStyle = shade(C.fin, -0.55); ctx.lineWidth = 1.4; ctx.stroke(fin);
    for (const [a, b] of tips) {
      ctx.strokeStyle = shade(C.fin, -0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = C.finE; ctx.lineWidth = 1.4; ctx.stroke();
    }
    const c = pal(dark ? shade(C.body, -0.25) : C.body, dark ? null : C.rim, { l: C.bodyL, o: shade(C.body, -0.72) });
    paintTube(ctx, pts, rs, c, {
      lw: 2.4, shA: 0.35, rimW: 8,
      belly: (g) => {
        // ventral scutes along the L side
        const bp = pts.map((q, i) => [lerp(q[0], S.L[i][0], 0.7), lerp(q[1], S.L[i][1], 0.7)]);
        g.fillStyle = rgba(C.belly, dark ? 0.35 : 0.6);
        g.fill(tube(bp, rs.map((r) => r * 0.42)));
        g.strokeStyle = rgba(shade(C.belly, -0.5), 0.5); g.lineWidth = 1.2;
        g.beginPath();
        for (let k = 1; k < n; k++) {
          const a = S.L[k], m = [lerp(pts[k][0], S.L[k][0], 0.35), lerp(pts[k][1], S.L[k][1], 0.35)];
          g.moveTo(a[0], a[1]); g.lineTo(m[0], m[1]);
        }
        g.stroke();
        // scale arcs (one batched path)
        g.strokeStyle = rgba(shade(C.body, -0.65), 0.45); g.lineWidth = 1.2;
        g.beginPath();
        for (let k = 1; k < n; k++) {
          const r = rs[k] * 0.26, a0 = S.A[k] - PI / 2 + 0.3;
          for (let j = -1; j <= 1; j++) {
            const off = j * 0.38 - 0.2;
            const px = pts[k][0] - (S.R[k][0] - pts[k][0]) * off, py = pts[k][1] - (S.R[k][1] - pts[k][1]) * off;
            g.moveTo(px + cos(a0) * r, py + sin(a0) * r);
            g.arc(px, py, r, a0, S.A[k] + PI / 2 - 0.3);
          }
        }
        g.stroke();
        // sick lateral line spots (cached glow sprite)
        for (let k = 2; k < n; k += 2) {
          const q = [lerp(pts[k][0], S.R[k][0], 0.15), lerp(pts[k][1], S.R[k][1], 0.15)];
          const r = rs[k] * 0.16 * (0.8 + 0.4 * sin(t * 3 + k));
          glow(g, q[0], q[1], r * 2.6, C.sick, 0.95);
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(q[0], q[1], r * 0.5, 0, TAU); g.fill();
        }
        // barnacle patches & ooze streaks
        for (let k = 3; k < n; k += 7) {
          for (let j = 0; j < 4; j++) {
            const q = [lerp(pts[k][0], S.R[k][0], 0.5) + (U.hash(k, j, 3) - 0.5) * 12, lerp(pts[k][1], S.R[k][1], 0.5) + (U.hash(k, j, 4) - 0.5) * 12];
            g.fillStyle = '#cfc8b8'; g.beginPath(); g.arc(q[0], q[1], 2.6 + U.hash(k, j, 5) * 1.6, 0, TAU); g.fill();
            g.fillStyle = '#3a342c'; g.beginPath(); g.arc(q[0], q[1], 1, 0, TAU); g.fill();
          }
        }
        if (ph >= 2) {
          g.fillStyle = rgba(C.ooze, 0.6);
          for (let k = 4; k < n; k += 5) { g.beginPath(); g.ellipse(pts[k][0], pts[k][1], rs[k] * 0.5, rs[k] * 0.3, S.A[k], 0, TAU); g.fill(); }
        }
      },
    });
  }
  def('tide_serpent', 400, 410, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = tsCol(P.v, P.ph);
    ctx.translate(x + P.shake - P.hurt * 10, y);
    const sw = t * 1.4;
    // black water (back half)
    const wg = ctx.createRadialGradient(0, -12, 10, 0, -12, 200);
    wg.addColorStop(0, rgba('#010204', 0.98)); wg.addColorStop(0.75, rgba(C.water, 0.9)); wg.addColorStop(1, rgba(C.water, 0));
    ctx.fillStyle = wg; ctx.beginPath(); ctx.ellipse(0, -12, 200, 34, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const f = (t * 0.25 + i / 4) % 1;
      ctx.strokeStyle = rgba(C.sick, 0.25 * (1 - f)); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, -12, 60 + f * 140, 10 + f * 24, 0, PI, TAU); ctx.stroke();
    }
    // ---- back coil arch ----
    const archCtrl = [[-182, 0], [-176, -80], [-140, -150 + sin(sw) * 5], [-88, -154 + sin(sw + 1) * 5], [-62, -80], [-58, 2]];
    const arch = sampleCurve(archCtrl, 26);
    const archR = arch.map((_, i) => 22 + sin(i / 26 * PI) * 4);
    tsBody(ctx, arch, archR, C, t, P.ph, true);
    // ---- main neck rising to the head ----
    const lunge = P.atk, rear = P.wind + P.cast * 0.7;
    const ctrl = [
      [16, 4], [36, -80], [6 - rear * 6, -170 - rear * 10], [-28 - rear * 16 + lunge * 20, -250 - rear * 20 + lunge * 40],
      [8 - rear * 20 + lunge * 44, -318 - rear * 24 + lunge * 60], [58 - rear * 24 + lunge * 66, -336 - rear * 24 + lunge * 84],
    ];
    for (let i = 1; i < ctrl.length; i++) { ctrl[i][0] += sin(sw + i * 1.1) * 7 * (i / 5); ctrl[i][1] += cos(sw * 0.9 + i) * 4 * (i / 5); }
    for (let i = 2; i < ctrl.length; i++) { ctrl[i][0] -= P.hurt * 20 * (i / 5); ctrl[i][1] += P.hurt * 10 * (i / 5); }
    const pts = sampleCurve(ctrl, 40);
    const rs = pts.map((_, i) => { const f = i / 40; return 30 + sin(f * PI * 0.8) * 6 - f * 12; });
    tsBody(ctx, pts, rs, C, t, P.ph, false);
    // ---- head ----
    const e = pts[40], e2 = pts[37];
    const ang = atan2(e[1] - e2[1], e[0] - e2[0]) * 0.6 + (-0.1 + lunge * 0.35 - rear * 0.25) * 0.4;
    const open = 0.12 + 0.05 * sin(t * 2) + P.atk * 0.45 + P.cast * 0.5 + P.wind * 0.2;
    ctx.save(); ctx.translate(e[0] - 6, e[1]); ctx.rotate(ang);
    ctx.fillStyle = C.mouth;
    ctx.beginPath(); ctx.moveTo(4, 6); ctx.lineTo(116, 4); ctx.lineTo(100 * cos(open) + 4, 10 + 100 * sin(open)); ctx.closePath(); ctx.fill();
    glow(ctx, 50, 10 + 40 * open, 26, C.sick, 0.3 + open * 0.8);
    put(ctx, tsJaw(P.v, P.ph), 2, 12, 1, open);
    put(ctx, tsHead(P.v, P.ph), 0, 0);
    // eye
    const fl = 0.85 + 0.15 * sin(t * 5);
    glow(ctx, 52, -14, 24, C.eye, 0.85 * fl);
    ctx.fillStyle = '#05060a'; ctx.beginPath(); ctx.ellipse(52, -14, 7.5, 5.6, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(52.5, -14, 6, P.hurt > 0.3 ? 1 : 4.4, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#05060a'; ctx.beginPath(); ctx.ellipse(53, -14, 1.3, P.hurt > 0.3 ? 0.8 : 4, 0, 0, TAU); ctx.fill();
    // ooze strings from the jaw
    for (let i = 0; i < 2; i++) {
      const f = (t * 0.6 + i * 0.5) % 1;
      const dx = 60 + i * 26;
      ctx.strokeStyle = rgba(C.ooze, 0.85); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(dx, 10); ctx.quadraticCurveTo(dx + 2, 10 + 20 * open + f * 16, dx - 1, 14 + 40 * open * f + f * 22); ctx.stroke();
    }
    if (P.cast > 0) {
      glow(ctx, 90, 14 + 30 * open, 30 + P.cp * 16, C.sick, 0.9 * P.cast);
      glow(ctx, 90, 14 + 30 * open, 12, '#ffffff', 0.8 * P.cast);
    }
    ctx.restore();
    // ---- front water: foam lips where the coils pierce the surface, spray ----
    for (const [fx, w] of [[-182, 30], [-58, 28], [18, 38]]) {
      ctx.fillStyle = rgba('#020306', 0.95);
      ctx.beginPath(); ctx.ellipse(fx, 2, w + 10, 9, 0, 0, PI); ctx.fill();
      ctx.strokeStyle = rgba(C.rim, 0.55); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(fx, -2, w + 6, 8, 0, 0.15, PI - 0.15); ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const f = (t * 0.8 + i / 4 + fx * 0.01) % 1;
        ctx.fillStyle = rgba(C.rim, 0.7 * (1 - f));
        ctx.beginPath(); ctx.arc(fx - w + i * w * 0.66, -4 - sin(f * PI) * 16, 2, 0, TAU); ctx.fill();
      }
    }
    ctx.strokeStyle = rgba(C.sick, 0.3); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, -12, 196, 32, 0, 0.05, PI - 0.05); ctx.stroke();
    // drips of black tide from the coils
    for (let i = 0; i < 3 + P.ph * 2; i++) {
      const k = 8 + ((i * 7) % 28);
      const f = (t * 0.5 + i * 0.29) % 1;
      const q = pts[k];
      ctx.fillStyle = rgba(C.ooze, 0.9 * (1 - f * 0.5));
      ctx.beginPath(); ctx.ellipse(q[0] + rs[k] * 0.4, q[1] + rs[k] * 0.7 + f * 40, 2.4, 3.6 + f * 3, 0, 0, TAU); ctx.fill();
    }
    if (P.cast > 0) {
      // water spouts rising
      for (let i = 0; i < 3; i++) {
        const sx = -140 + i * 120, h = 60 + P.cast * 80 + sin(t * 6 + i) * 10;
        const gg = ctx.createLinearGradient(0, -10, 0, -10 - h);
        gg.addColorStop(0, rgba(C.water, 0.9)); gg.addColorStop(1, rgba(C.sick, 0));
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.moveTo(sx - 12, -8); ctx.quadraticCurveTo(sx - 4, -10 - h * 0.6, sx, -10 - h); ctx.quadraticCurveTo(sx + 4, -10 - h * 0.6, sx + 12, -8); ctx.closePath(); ctx.fill();
      }
    }
  });
})();

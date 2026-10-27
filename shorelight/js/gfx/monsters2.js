// 彼岸燈 Shorelight — battle monsters, part 2 (procedural Canvas 2D, painterly-vector look).
// Registers into G.Monsters (js/gfx/registry.js). See docs/CONTRACTS.md "Monsters".
//
//   G.Monsters.define(id, { w, h, draw(ctx, x, y, t, o) })
//   x, y = FEET centre (bottom-centre), drawn upward; monsters face RIGHT.
//   o.state: 'idle' | 'attack' | 'hurt' | 'cast' | 'dead'   o.st: seconds since state began
//   o.variant: 0 | 1 | 2 (palette swap)                     o.phase: 1 | 2 | 3 (bosses)
//
// Static parts are pre-rendered once into offscreen canvases (keyed by id/variant/G.S) and blitted;
// only genuinely animated pieces (limbs, glows, particles, hue-cycling geometry) are drawn live.
// Everything lives inside this IIFE so helper names never clash with js/gfx/monsters.js.
'use strict';
(() => {
  const U = G.U;
  const { clamp, lerp } = U;
  const rgba = U.rgba, shade = U.shade, mix = U.mix;
  const { sin, cos, abs, min, max, PI, atan2, hypot, floor } = Math;
  const TAU = PI * 2;
  const EASE = U.ease;

  // ---------------------------------------------------------------------------------------------
  // Cache & sprite helpers
  // ---------------------------------------------------------------------------------------------
  const CACHE = {};
  // Offscreen sprite: fn(g) draws with the origin at the anchor (ax, ay).
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
  function put(ctx, s, x = 0, y = 0, sc = 1) {
    ctx.drawImage(s, x - s.ax * sc, y - s.ay * sc, s.lw * sc, s.lh * sc);
  }

  function glowSpr(col) {
    return spr('glow:' + col, 128, 128, 64, 64, (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64);
      gr.addColorStop(0, rgba(col, 1));
      gr.addColorStop(0.18, rgba(col, 0.6));
      gr.addColorStop(0.45, rgba(col, 0.18));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
    });
  }
  // additive soft glow (hex colour)
  function glow(ctx, x, y, r, col, a = 1) {
    if (a <= 0.003 || r <= 0) return;
    const s = glowSpr(col);
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ga * min(1, a);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  function softSpr(col) {
    return spr('soft:' + col, 128, 128, 64, 64, (g) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 64);
      gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.3, rgba(col, 0.82));
      gr.addColorStop(0.62, rgba(col, 0.32)); gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
    });
  }
  // normal-blend soft puff
  function puff(ctx, x, y, r, col, a = 1) {
    if (a <= 0.003 || r <= 0) return;
    const s = softSpr(col);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * min(1, a);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
  }
  const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;
  // additive glow of an arbitrary hsl colour
  function hglow(ctx, x, y, r, h, s, l, a = 1) {
    if (a <= 0.003 || r <= 0) return;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, hsl(h, s, l, a));
    gr.addColorStop(0.3, hsl(h, s, l, a * 0.45));
    gr.addColorStop(1, hsl(h, s, l, 0));
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op;
  }

  // ---------------------------------------------------------------------------------------------
  // Path & paint helpers
  // ---------------------------------------------------------------------------------------------
  // Catmull-Rom spline through points [[x,y],...] -> Path2D
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
  // silhouette with tufted (furry / ragged) edge: subdivide polygon and push alternate points outward
  function tufted(pts, amp, sub = 3, seed = 1) {
    const out = [];
    const n = pts.length;
    // centroid
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
    p.moveTo(out[0][0], out[0][1]);
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      p.quadraticCurveTo(a[0], a[1], mx, my);
    }
    p.closePath();
    return p;
  }
  // palette from a base hex: light / base / dark / outline (+ optional rim colour)
  function pal(base, rim, k = {}) {
    return {
      b: base, l: k.l || shade(base, 0.32), d: k.d || shade(base, -0.45),
      o: k.o || shade(base, -0.66), rim: rim || null, hl: k.hl || '#ffffff',
    };
  }
  // Painterly fill: diagonal key-light gradient, inner rim light (bottom-right), top-left highlight,
  // coloured outline. (x,y,w,h) = approximate bounds of the path.
  function paint(ctx, path, x, y, w, h, c, o = {}) {
    const g = ctx.createLinearGradient(x + w * 0.15, y, x + w * 0.85, y + h);
    g.addColorStop(0, c.l); g.addColorStop(o.mid ?? 0.45, c.b); g.addColorStop(1, c.d);
    ctx.fillStyle = g; ctx.fill(path);
    if (c.rim || (o.hl ?? 0.3) > 0) {
      ctx.save(); ctx.clip(path);
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
      ctx.lineWidth = o.lw ?? 2; ctx.strokeStyle = o.ol || c.o; ctx.lineJoin = 'round'; ctx.stroke(path);
    }
  }
  // tapered capsule between two points
  function capsule(x1, y1, x2, y2, r1, r2, p = new Path2D()) {
    const a = atan2(y2 - y1, x2 - x1);
    p.arc(x2, y2, r2, a - PI / 2, a + PI / 2);
    p.arc(x1, y1, r1, a + PI / 2, a + PI * 1.5);
    p.closePath();
    return p;
  }
  // shaded limb segment (cylindrical shading across its width, rim on the dark side)
  function limb(ctx, x1, y1, x2, y2, r1, r2, c, lw = 1.8) {
    const p = capsule(x1, y1, x2, y2, r1, r2);
    const dx = x2 - x1, dy = y2 - y1, L = hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    if (nx + ny > 0) { nx = -nx; ny = -ny; } // n points to the lit (top-left) side
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
  // direction helper: angle a, 0 = straight down, +PI/2 = forward (right), PI = up
  const dirx = (a) => sin(a), diry = (a) => cos(a);
  function chain(x, y, a, L) { return [x + sin(a) * L, y + cos(a) * L]; }

  // shaded ellipse/ball
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
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.22, r * 0.14, -0.6, 0, TAU); ctx.fill();
    }
    return p;
  }

  // ---------------------------------------------------------------------------------------------
  // Pose model shared by all monsters
  //   atk: 0..1 strike extension, wind: 0..1 wind-up, hurt: 1..0 recoil, cast: 0..1 channel
  // ---------------------------------------------------------------------------------------------
  function pose(o, t) {
    o = o || {};
    const s = o.state || 'idle', st = o.st || 0;
    let atk = 0, hurt = 0, cast = 0, wind = 0;
    if (s === 'attack') {
      if (st < 0.2) wind = EASE.outQuad(st / 0.2);
      else if (st < 0.34) { const p = (st - 0.2) / 0.14; wind = 1 - p; atk = EASE.outCubic(p); }
      else if (st < 0.5) atk = 1;
      else atk = max(0, 1 - EASE.inOutQuad(min(1, (st - 0.5) / 0.35)));
    } else if (s === 'hurt' || s === 'dead') {
      hurt = s === 'dead' ? 1 : clamp(1 - (st - 0.08) / 0.5, 0, 1);
    } else if (s === 'cast') {
      cast = EASE.outCubic(min(1, st / 0.35));
    }
    const shake = s === 'hurt' ? sin(st * 70) * hurt * 4 : 0;
    return {
      s, st, t, atk, hurt, cast, wind, shake,
      v: clamp((o.variant | 0), 0, 2), ph: clamp(o.phase || 1, 1, 3),
      // pulsing cast energy
      cp: cast * (0.75 + 0.25 * sin(t * 9)),
    };
  }
  // blend numeric pose params: base, then [params, weight] pairs applied in order
  function blend(base, ...pairs) {
    const r = Object.assign({}, base);
    for (const [p, w] of pairs) if (w > 0) for (const k in p) r[k] = lerp(r[k] ?? 0, p[k], w);
    return r;
  }
  function poseParams(P, idle, wind, strike, hurt, cast) {
    return blend(idle, [wind, P.wind], [strike, P.atk], [cast, P.cast], [hurt, P.hurt]);
  }

  const defs = {};
  function def(id, w, h, draw) {
    defs[id] = { w, h, draw };
    G.Monsters.define(id, {
      w, h,
      draw(ctx, x, y, t, o) {
        ctx.save();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        try { draw(ctx, x, y, t || 0, o || {}); } finally { ctx.restore(); }
      },
    });
  }

  // =============================================================================================
  // 傀儡 marionette — 傀儡戲 string-puppet general: painted opera face, 靠旗 flags, 翎子 plumes
  // =============================================================================================
  const MARI = [
    { robe: '#b0242e', trim: '#e6b84c', skin: '#f6e8d6', flag: '#2a5aa0', wood: '#b88a5c', pants: '#2c2430', plume: '#c8532a', pom: '#f03848', eye: '#ff5a7a', str: '#efe2c4', rim: '#ffcf8a' },
    { robe: '#1d6a5c', trim: '#dcc472', skin: '#ece2d4', flag: '#b02c30', wood: '#9c7c5a', pants: '#1c2a2c', plume: '#d4a03a', pom: '#f2c040', eye: '#70ffd0', str: '#d8ecd8', rim: '#a8ffe0' },
    { robe: '#2a2236', trim: '#c89a3a', skin: '#dcd2e6', flag: '#6a2a90', wood: '#5c4a4a', pants: '#141018', plume: '#7a3ab0', pom: '#b048f0', eye: '#d070ff', str: '#d8c8f0', rim: '#d0a0ff' },
  ];
  function mariSword(v) {
    return spr('mari:sword:' + v, 90, 30, 14, 15, (g) => {
      // grip & pommel
      g.fillStyle = '#3a2418'; g.fillRect(-12, -2.5, 13, 5);
      g.strokeStyle = MARI[v].trim; g.lineWidth = 1;
      for (let i = -10; i < 0; i += 3) { g.beginPath(); g.moveTo(i, -2.5); g.lineTo(i + 2, 2.5); g.stroke(); }
      ball(g, -12, 0, 3, pal(MARI[v].trim), { lw: 1 });
      // tassel
      g.strokeStyle = MARI[v].pom; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-12, 2); g.quadraticCurveTo(-16, 8, -13, 13); g.stroke();
      // guard
      const gp = new Path2D(); gp.ellipse(1.5, 0, 3, 6.5, 0, 0, TAU);
      paint(g, gp, -2, -7, 7, 14, pal(MARI[v].trim), { lw: 1, hl: 0.4 });
      // 柳葉刀 blade (curved)
      const b = new Path2D();
      b.moveTo(4, -3); b.quadraticCurveTo(40, -6, 70, -12); b.quadraticCurveTo(76, -11, 74, -7);
      b.quadraticCurveTo(44, 4, 4, 3.5); b.closePath();
      const bg = g.createLinearGradient(0, -8, 0, 4);
      bg.addColorStop(0, '#f6fbff'); bg.addColorStop(0.45, '#aebccc'); bg.addColorStop(1, '#5d6878');
      g.fillStyle = bg; g.fill(b);
      g.strokeStyle = '#3a4250'; g.lineWidth = 1.2; g.stroke(b);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(8, -2); g.quadraticCurveTo(40, -5, 70, -10.5); g.stroke();
    });
  }
  function mariHead(v) {
    const C = MARI[v];
    return spr('mari:head:' + v, 70, 100, 34, 44, (g) => {
      const skin = pal(C.skin, '#ffd9b0', { o: '#7a4a3a' });
      const gold = pal(C.trim, '#fff0b0');
      // back of helmet / neck flap
      const flap = smooth([[-14, -6], [-6, -2], [-4, 14], [-12, 20], [-20, 12]]);
      paint(g, flap, -20, -6, 16, 26, pal(C.robe), { lw: 1.4 });
      // face (3/4 right)
      const face = smooth([[-10, -8], [0, -12], [10, -8], [14, 2], [12, 12], [5, 19], [-4, 17], [-11, 8]]);
      paint(g, face, -12, -12, 26, 31, skin, { lw: 1.6, hl: 0.5 });
      g.save(); g.clip(face);
      // opera rouge around eyes
      const rr = g.createRadialGradient(5, 3, 1, 5, 3, 13);
      rr.addColorStop(0, 'rgba(230,60,80,0.75)'); rr.addColorStop(1, 'rgba(230,60,80,0)');
      g.fillStyle = rr; g.fillRect(-12, -12, 30, 30);
      g.restore();
      // brows (upswept, painted)
      g.fillStyle = '#16101a';
      g.beginPath(); g.moveTo(1, -2); g.quadraticCurveTo(7, -6, 14, -9); g.quadraticCurveTo(8, -3.5, 1, -0.5); g.fill();
      g.beginPath(); g.moveTo(-3, -1.5); g.quadraticCurveTo(-7, -4, -10, -6); g.quadraticCurveTo(-7, -2, -3, 0); g.fill();
      // eyes
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(7, 2, 3.4, 1.8, -0.2, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(-4.5, 2.5, 2.2, 1.5, 0.15, 0, TAU); g.fill();
      g.fillStyle = '#15101a';
      g.beginPath(); g.arc(8, 2, 1.5, 0, TAU); g.fill();
      g.beginPath(); g.arc(-4, 2.6, 1.1, 0, TAU); g.fill();
      g.strokeStyle = '#2a1018'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(3.5, 1.2); g.quadraticCurveTo(8, -0.6, 11, 1.5); g.stroke();
      // nose & mouth
      g.strokeStyle = 'rgba(120,60,50,0.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(11.5, 3); g.quadraticCurveTo(14, 7, 11, 8); g.stroke();
      // beard 髯口 (three black hanging hanks)
      const hank = (x0, x1, len, sway) => {
        const p = new Path2D();
        p.moveTo(x0, 10); p.lineTo(x1, 10);
        p.quadraticCurveTo(x1 + sway, 10 + len * 0.6, (x0 + x1) / 2 + sway * 1.4, 10 + len);
        p.quadraticCurveTo(x0 + sway * 0.6, 10 + len * 0.5, x0, 10); p.closePath();
        const bg = g.createLinearGradient(0, 10, 0, 10 + len);
        bg.addColorStop(0, '#2c2230'); bg.addColorStop(1, '#0c0810');
        g.fillStyle = bg; g.fill(p);
        g.strokeStyle = 'rgba(160,150,190,0.35)'; g.lineWidth = 0.7;
        for (let i = 0; i < 4; i++) {
          const xx = lerp(x0, x1, (i + 0.5) / 4);
          g.beginPath(); g.moveTo(xx, 12); g.quadraticCurveTo(xx + sway, 10 + len * 0.6, xx + sway * 1.2, 8 + len); g.stroke();
        }
      };
      hank(-2, 5, 30, -3); hank(9, 15, 30, 1); hank(3, 11, 40, -1);
      // helmet 帥盔
      const helm = new Path2D();
      helm.moveTo(-15, -4); helm.quadraticCurveTo(-16, -22, -1, -27); helm.quadraticCurveTo(14, -25, 16, -6);
      helm.quadraticCurveTo(0, -11, -15, -4); helm.closePath();
      paint(g, helm, -16, -27, 32, 23, gold, { lw: 1.6, hl: 0.55 });
      // helmet band with pompoms
      g.strokeStyle = shade(C.robe, -0.2); g.lineWidth = 3.2;
      g.beginPath(); g.moveTo(-15, -6); g.quadraticCurveTo(0, -12, 16, -7); g.stroke();
      for (let i = 0; i < 4; i++) ball(g, -10 + i * 7.5, -12 - (i === 1 || i === 2 ? 1.5 : 0), 3.1, pal(C.pom, '#ffb0b0'), { lw: 1 });
      // front jewel
      ball(g, 3, -20, 3.4, pal('#5ad0e0', '#ffffff'), { lw: 1 });
      // ear flaps with tassels
      const ear = smooth([[-15, -5], [-11, 0], [-13, 8], [-18, 4]]);
      paint(g, ear, -18, -5, 7, 13, gold, { lw: 1.2 });
      g.strokeStyle = C.pom; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-15, 7); g.lineTo(-16, 15); g.stroke();
      // helmet spike
      const sp = new Path2D(); sp.moveTo(-4, -26); sp.lineTo(-1, -40); sp.lineTo(2, -26); sp.closePath();
      paint(g, sp, -4, -40, 6, 14, gold, { lw: 1.2 });
    });
  }
  function mariTorso(v) {
    const C = MARI[v];
    return spr('mari:torso:' + v, 90, 110, 45, 62, (g) => {
      const robe = pal(C.robe, C.rim), gold = pal(C.trim, '#fff2c0');
      // side skirt panels (behind)
      const sideP = smooth([[-18, -4], [-4, 0], [-8, 40], [-24, 36]]);
      paint(g, sideP, -24, -4, 20, 44, pal(shade(C.robe, -0.25), C.rim), { lw: 1.6 });
      // torso armour
      const tor = smooth([[-21, -49], [-6, -55], [10, -55], [23, -47], [21, -28], [16, -8], [1, -2], [-15, -8], [-20, -28]]);
      paint(g, tor, -21, -55, 44, 53, robe, { lw: 2, hl: 0.35 });
      // scale pattern
      g.save(); g.clip(tor);
      g.strokeStyle = rgba(C.trim, 0.55); g.lineWidth = 1;
      for (let row = 0; row < 7; row++) {
        for (let col = -4; col < 5; col++) {
          const sx = col * 7 + (row % 2) * 3.5, sy = -48 + row * 6.5;
          g.beginPath(); g.arc(sx, sy, 3.6, 0.1, PI - 0.1); g.stroke();
        }
      }
      g.restore();
      // cloud collar 雲肩
      const col = new Path2D();
      col.moveTo(-18, -48);
      col.bezierCurveTo(-14, -36, -6, -40, -2, -34);
      col.bezierCurveTo(2, -40, 10, -36, 14, -40);
      col.bezierCurveTo(18, -38, 22, -44, 22, -47);
      col.bezierCurveTo(10, -58, -6, -58, -18, -48); col.closePath();
      paint(g, col, -18, -58, 40, 24, gold, { lw: 1.6, hl: 0.6 });
      // heart mirror 護心鏡
      const mir = new Path2D(); mir.arc(4, -26, 8, 0, TAU);
      paint(g, mir, -4, -34, 16, 16, gold, { lw: 1.6 });
      const mg = g.createRadialGradient(2, -29, 0, 4, -26, 7);
      mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.4, '#cfe2ff'); mg.addColorStop(1, '#5a6aa0');
      g.fillStyle = mg; g.beginPath(); g.arc(4, -26, 5.4, 0, TAU); g.fill();
      // jade belt 玉帶 (hoop sticking out front)
      g.lineWidth = 5; g.strokeStyle = '#2a6a50';
      g.beginPath(); g.ellipse(4, -10, 23, 6, 0.12, 0.15, PI - 0.1); g.stroke();
      g.lineWidth = 2.5; g.strokeStyle = '#7ad6a8';
      g.beginPath(); g.ellipse(4, -11, 23, 6, 0.12, 0.3, PI - 0.3); g.stroke();
      for (let i = 0; i < 5; i++) {
        const a = 0.35 + i * 0.6;
        ball(g, 4 + cos(a) * 23, -10 + sin(a) * 6 + 0.12 * cos(a) * 23, 2.4, pal('#9ae8c0', '#ffffff'), { lw: 0.8, spec: false });
      }
      // front apron panel
      const ap = new Path2D();
      ap.moveTo(-8, -4); ap.lineTo(16, -4); ap.lineTo(19, 30); ap.quadraticCurveTo(5, 36, -10, 30); ap.closePath();
      paint(g, ap, -10, -4, 29, 36, robe, { lw: 1.8 });
      g.strokeStyle = C.trim; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-5, 0); g.lineTo(13, 0); g.lineTo(15, 26); g.quadraticCurveTo(4, 31, -7, 26); g.closePath(); g.stroke();
      // embroidered tiger-face roundel
      ball(g, 4, 13, 6.5, gold, { lw: 1.2, spec: false });
      g.fillStyle = shade(C.robe, -0.3);
      g.beginPath(); g.arc(2, 12, 1.2, 0, TAU); g.arc(6.5, 12, 1.2, 0, TAU); g.fill();
      g.fillRect(1, 15.5, 6, 1);
      // fringe
      g.strokeStyle = C.trim; g.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) {
        const fx = -8 + i * 3.6;
        g.beginPath(); g.moveTo(fx, 30 + (i > 3 ? 1 : 0)); g.lineTo(fx + 0.5, 37); g.stroke();
      }
    });
  }
  function mariFlags(v) {
    const C = MARI[v];
    return spr('mari:flags:' + v, 140, 130, 70, 110, (g) => {
      const fp = pal(C.flag, '#a0c8ff');
      const angles = [-0.75, -0.42, -0.1];
      for (const a of angles) {
        g.save(); g.rotate(a);
        // pole
        g.strokeStyle = '#3a2a1a'; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -98); g.stroke();
        ball(g, 0, -100, 3, pal(C.pom), { lw: 1 });
        // triangular flag with border
        const f = new Path2D();
        f.moveTo(1, -94); f.lineTo(30, -90); f.quadraticCurveTo(14, -60, 2, -30); f.closePath();
        paint(g, f, 1, -94, 29, 64, fp, { lw: 1.5 });
        g.strokeStyle = C.trim; g.lineWidth = 2;
        g.beginPath(); g.moveTo(4, -89); g.lineTo(24, -87); g.quadraticCurveTo(12, -62, 4, -40); g.stroke();
        // dragon scroll motif
        g.strokeStyle = rgba(C.trim, 0.8); g.lineWidth = 1.2;
        g.beginPath(); g.arc(11, -74, 4, 0, PI * 1.5); g.stroke();
        g.beginPath(); g.arc(8, -60, 3, PI, TAU * 0.9); g.stroke();
        g.restore();
      }
    });
  }
  def('marionette', 130, 190, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = MARI[P.v];
    const sw = sin(t * 1.8);
    const A = poseParams(P,
      { fa1: 0.35 + sw * 0.07, fa2: 1.25, fs: 2.55, ba1: -0.3 - sw * 0.1, ba2: 0.55, lean: 0.02 * sw, dx: 0, fl1: 0.18 + sw * 0.12, fl2: -0.25, bl1: -0.12 - sw * 0.12, bl2: -0.2, lift: 0 },
      { fa1: 3.6, fa2: 0.3, fs: 4.3, ba1: 0.7, ba2: 0.8, lean: -0.14, dx: -8, fl1: 0.4, fl2: -0.6, bl1: -0.3, bl2: -0.1, lift: 8 },
      { fa1: 1.35, fa2: 0.15, fs: 1.25, ba1: -0.9, ba2: -0.2, lean: 0.22, dx: 40, fl1: 0.7, fl2: -0.2, bl1: -0.5, bl2: -0.3, lift: 4 },
      { fa1: -0.55, fa2: 0.5, fs: 1.6, ba1: -1.3, ba2: 0.3, lean: -0.3, dx: -16, fl1: 0.5, fl2: -0.8, bl1: 0.3, bl2: -0.9, lift: 10 },
      { fa1: 2.6, fa2: 0.35, fs: 3.0, ba1: -2.5, ba2: -0.3, lean: -0.05, dx: 0, fl1: 0.1, fl2: -0.2, bl1: -0.1, bl2: -0.2, lift: 14 },
    );
    const hover = -7 + sin(t * 1.8 + 0.6) * 3.5 - A.lift;
    const robe = pal(C.robe, C.rim), wood = pal(C.wood, C.rim), pants = pal(C.pants, C.rim, { o: shade(C.pants, -0.5) });
    const skinP = pal(C.skin, '#ffd9b0', { o: '#7a4a3a' });
    ctx.translate(x + A.dx + P.shake, y);
    const hipY = -80 + hover;
    ctx.translate(0, hipY);
    ctx.rotate(A.lean);
    // world positions of attachments for strings (computed in this rotated frame)
    const attach = [];
    // ---- flags (behind)
    ctx.save(); ctx.translate(-8, -50); ctx.rotate(sin(t * 2.3) * 0.02); put(ctx, mariFlags(P.v), 0, 0); ctx.restore();
    // ---- plumes 翎子 (behind body, from helmet)
    const hx = 6, hy = -66;
    for (let k = 0; k < 2; k++) {
      const sway = sin(t * 1.6 + k * 0.7) * 8 - A.lean * 30;
      const x0 = hx - 2 + k * 4, y0 = hy - 26;
      const cx1 = x0 - 30 + sway, cy1 = y0 - 70 - k * 8, ex = x0 - 74 + sway * 1.6, ey = y0 - 30 + k * 14;
      ctx.strokeStyle = shade(C.plume, -0.5); ctx.lineWidth = 5.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx1, cy1, ex, ey); ctx.stroke();
      ctx.strokeStyle = C.plume; ctx.lineWidth = 3.6; ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = shade(C.plume, -0.55); ctx.lineWidth = 3.6; ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = rgba('#ffffff', 0.5); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0 - 1); ctx.quadraticCurveTo(cx1, cy1 - 1, ex, ey - 1); ctx.stroke();
    }
    // ---- back arm
    const bs = [-12, -44];
    const be = chain(bs[0], bs[1], A.ba1, 21), bh = chain(be[0], be[1], A.ba1 + A.ba2, 19);
    limb(ctx, bs[0], bs[1], be[0], be[1], 8, 7, pal(shade(C.robe, -0.3), C.rim));
    limb(ctx, be[0], be[1], bh[0], bh[1], 4.5, 4, pal(shade(C.wood, -0.25), C.rim));
    ball(ctx, bh[0], bh[1], 5, pal(shade(C.skin, -0.2), null, { o: '#6a4a3a' }), { lw: 1.4 });
    attach.push(bh);
    // ---- legs
    const leg = (hx0, a1, a2, dark) => {
      const k = chain(hx0, 4, a1, 25), f = chain(k[0], k[1], a1 + a2, 25);
      const pp = dark ? pal(shade(C.pants, -0.3), C.rim) : pants;
      limb(ctx, hx0, 4, k[0], k[1], 7.5, 6, pp);
      ball(ctx, k[0], k[1], 4.5, dark ? pal(shade(C.wood, -0.3)) : wood, { lw: 1.2 });
      limb(ctx, k[0], k[1], f[0], f[1], 5.5, 5, pp);
      // thick-soled opera boot 厚底靴
      ctx.save(); ctx.translate(f[0], f[1]); ctx.rotate(-(a1 + a2) * 0.6);
      const boot = new Path2D();
      boot.moveTo(-6, -6); boot.lineTo(5, -6); boot.quadraticCurveTo(13, -2, 14, 4); boot.lineTo(-7, 4); boot.closePath();
      paint(ctx, boot, -7, -6, 21, 10, pal(dark ? '#141018' : '#241c28', C.rim), { lw: 1.4 });
      const sole = new Path2D(); sole.roundRect(-8, 3, 23, 6, 2);
      paint(ctx, sole, -8, 3, 23, 6, pal(dark ? '#b8b0a8' : '#f2ece0', null, { o: '#6a6058' }), { lw: 1.2 });
      ctx.restore();
      attach.push(k);
    };
    leg(-6, A.bl1, A.bl2, true);
    leg(8, A.fl1, A.fl2, false);
    // ---- torso
    put(ctx, mariTorso(P.v), 0, 0);
    // pauldron (back)
    ball(ctx, -13, -45, 8, pal(shade(C.trim, -0.25)), { lw: 1.4, sy: 0.85 });
    // ---- head
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(sin(t * 1.8 + 1.4) * 0.06 - A.lean * 0.4);
    put(ctx, mariHead(P.v), 0, 0);
    // spring pompom on top
    const pb = sin(t * 5.2) * 2.5 + P.atk * 4;
    ctx.strokeStyle = '#d8c070'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1, -40); for (let i = 1; i <= 6; i++) ctx.lineTo(-1 + (i % 2 ? 2 : -2), -40 - i * 1.6 + pb * i / 6); ctx.stroke();
    ball(ctx, -1, -52 + pb, 5.5, pal(C.pom, '#ffd0d0'), { lw: 1.2 });
    if (P.cast > 0 || P.atk > 0) {
      const ea = max(P.cp, P.atk * 0.8);
      glow(ctx, 8, 2, 12, C.eye, ea);
      glow(ctx, -4.5, 2.5, 8, C.eye, ea * 0.7);
    }
    ctx.restore();
    attach.push([hx, hy - 30]);
    // ---- front arm + sword
    const fsx = 15, fsy = -46;
    const fe = chain(fsx, fsy, A.fa1, 22), fh = chain(fe[0], fe[1], A.fa1 + A.fa2, 20);
    if (P.atk > 0.2) {
      // slash arc trail
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createRadialGradient(fsx, fsy, 30, fsx, fsy, 90);
      tg.addColorStop(0, rgba(C.eye, 0)); tg.addColorStop(0.7, rgba('#ffffff', 0.5 * P.atk)); tg.addColorStop(1, rgba(C.eye, 0));
      ctx.fillStyle = tg;
      ctx.beginPath(); ctx.moveTo(fsx, fsy); ctx.arc(fsx, fsy, 92, -PI * 0.75, 0.4 * P.atk); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    limb(ctx, fsx, fsy, fe[0], fe[1], 8.5, 7.5, robe);
    ball(ctx, fsx, fsy + 1, 9, pal(C.trim, '#fff2c0'), { lw: 1.6, sy: 0.85 });
    limb(ctx, fe[0], fe[1], fh[0], fh[1], 5, 4.5, wood);
    ctx.lineWidth = 3; ctx.strokeStyle = C.trim;
    ctx.beginPath(); ctx.arc(fe[0], fe[1], 6, 0, TAU); ctx.stroke();
    ctx.save(); ctx.translate(fh[0], fh[1]); ctx.rotate(atan2(cos(A.fs), sin(A.fs)));
    put(ctx, mariSword(P.v), 0, 0);
    ctx.restore();
    ball(ctx, fh[0], fh[1], 5.5, skinP, { lw: 1.4 });
    attach.push(fh);
    attach.push([-4, -40]);
    // ---- strings from above (converging to an unseen control bar)
    const sg = ctx.createLinearGradient(0, 0, 0, -230);
    const sa = 0.7 + P.cast * 0.3;
    sg.addColorStop(0, rgba(C.str, sa)); sg.addColorStop(0.55, rgba(C.str, sa * 0.5)); sg.addColorStop(1, rgba(C.str, 0));
    ctx.strokeStyle = sg; ctx.lineWidth = 1;
    const tops = [];
    for (const a of attach) {
      const tx = a[0] * 0.35 + 4 + sin(t * 1.8) * 6, ty = -240;
      tops.push([tx, ty]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(tx, ty); ctx.stroke();
    }
    if (P.cast > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(C.eye, 0.55 * P.cp); ctx.lineWidth = 2.5;
      attach.forEach((a, i) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(tops[i][0], tops[i][1]); ctx.stroke(); });
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.7 + i / 6) % 1, a = attach[i % attach.length];
        glow(ctx, lerp(a[0], tops[i % tops.length][0], k), lerp(a[1], -240, k), 7, C.eye, P.cp * (1 - k));
      }
    }
  });

  // =============================================================================================
  // Shared extras: flames, wisps, lantern barrels, chains, leaves
  // =============================================================================================
  // flickering flame, base at (x,y), tip up; additive
  function flame(ctx, x, y, w, h, t, outer, inner, seed = 0, a = 1) {
    if (a <= 0.01) return;
    const f1 = sin(t * 11 + seed * 5.1), f2 = sin(t * 6.7 + seed * 2.3), f3 = sin(t * 17 + seed);
    const tipx = x + w * (f1 * 0.2 + f2 * 0.14), tipy = y - h * (1 + f3 * 0.08 + f2 * 0.06);
    const p = new Path2D();
    p.moveTo(x - w * 0.5, y - h * 0.22);
    p.bezierCurveTo(x - w * 0.56, y - h * 0.62, tipx - w * 0.22, tipy + h * 0.42, tipx, tipy);
    p.bezierCurveTo(tipx + w * 0.16, tipy + h * 0.45, x + w * 0.62, y - h * 0.58, x + w * 0.5, y - h * 0.22);
    p.bezierCurveTo(x + w * 0.45, y + h * 0.06, x - w * 0.45, y + h * 0.06, x - w * 0.5, y - h * 0.22);
    p.closePath();
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * min(1, a);
    const g = ctx.createLinearGradient(x, y, x, tipy);
    g.addColorStop(0, rgba(inner, 0.95)); g.addColorStop(0.3, rgba(outer, 0.85)); g.addColorStop(1, rgba(outer, 0));
    ctx.fillStyle = g; ctx.fill(p);
    ctx.save(); ctx.translate(x, y); ctx.scale(0.5, 0.55); ctx.translate(-x, -y);
    const g2 = ctx.createLinearGradient(x, y, x, tipy);
    g2.addColorStop(0, 'rgba(255,255,255,0.9)'); g2.addColorStop(0.5, rgba(inner, 0.5)); g2.addColorStop(1, rgba(inner, 0));
    ctx.fillStyle = g2; ctx.fill(p);
    ctx.restore();
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  // soul-light orb
  function wisp(ctx, x, y, r, col, a = 1) {
    if (a <= 0.01) return;
    glow(ctx, x, y, r * 4.5, col, a * 0.45);
    glow(ctx, x, y, r * 1.7, col, a * 0.9);
    ctx.fillStyle = rgba('#ffffff', 0.85 * a);
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill();
  }
  // bulging lantern barrel
  function barrel(cx, y0, y1, w, bu = 0.12) {
    const p = new Path2D(), h = y1 - y0, xo = w * (0.5 + bu);
    p.moveTo(cx - w * 0.42, y0);
    p.bezierCurveTo(cx - xo, y0 + h * 0.22, cx - xo, y1 - h * 0.22, cx - w * 0.42, y1);
    p.lineTo(cx + w * 0.42, y1);
    p.bezierCurveTo(cx + xo, y1 - h * 0.22, cx + xo, y0 + h * 0.22, cx + w * 0.42, y0);
    p.closePath();
    return p;
  }
  function barrelRibs(g, cx, y0, y1, w, bu, n, col, lw, dk) {
    const h = y1 - y0;
    for (let i = 1; i < n; i++) {
      const s = sin((-1 + 2 * i / n) * PI / 2);
      const xe = cx + s * w * 0.42, xm = cx + s * w * (0.5 + bu);
      const path = new Path2D();
      path.moveTo(xe, y0); path.bezierCurveTo(xm, y0 + h * 0.22, xm, y1 - h * 0.22, xe, y1);
      if (dk) { g.strokeStyle = dk; g.lineWidth = lw + 1.6; g.stroke(path); }
      g.strokeStyle = col; g.lineWidth = lw; g.stroke(path);
    }
  }
  // chain of links along a sagging quadratic
  function chainLinks(ctx, x1, y1, x2, y2, sag, col, dk, n) {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2 + sag;
    for (let i = 0; i <= n; i++) {
      const u = i / n, iu = 1 - u;
      const px = iu * iu * x1 + 2 * iu * u * cx + u * u * x2, py = iu * iu * y1 + 2 * iu * u * cy + u * u * y2;
      const tx = 2 * iu * (cx - x1) + 2 * u * (x2 - cx), ty = 2 * iu * (cy - y1) + 2 * u * (y2 - cy);
      ctx.save(); ctx.translate(px, py); ctx.rotate(atan2(ty, tx));
      ctx.beginPath();
      if (i % 2 === 0) ctx.ellipse(0, 0, 5.5, 3.3, 0, 0, TAU);
      else { ctx.moveTo(-5, 0); ctx.lineTo(5, 0); }
      ctx.strokeStyle = dk; ctx.lineWidth = 4.6; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.restore();
    }
  }
  // generic soft-edged mist made of puffs (seeded positions)
  function mist(ctx, x, y, w, h, t, col, a, n = 9, seed = 1) {
    for (let i = 0; i < n; i++) {
      const hx = U.hash(i, 1, seed), hy = U.hash(i, 2, seed), hr = U.hash(i, 3, seed);
      const px = x + (hx - 0.5) * w + sin(t * (0.4 + hr * 0.5) + i) * w * 0.08;
      const py = y + (hy - 0.5) * h + cos(t * 0.5 + i * 1.7) * h * 0.1;
      puff(ctx, px, py, (0.25 + hr * 0.25) * w, col, a * (0.5 + 0.5 * sin(t * 0.7 + i * 2.1) ** 2));
    }
  }

  // =============================================================================================
  // 長明燈傀 lantern_golem — 鼎 cauldron legs, stacked bronze 長明燈 with trapped blue souls
  // =============================================================================================
  const LGP = [
    { br: '#a8743c', dk: '#0e1a2c', soul: '#5ad2ff', core: '#e0f8ff', tass: '#c83a30', rim: '#8fe6ff', paper: '#e8d27a' },
    { br: '#5f8a6a', dk: '#0c201a', soul: '#6affc4', core: '#e6fff4', tass: '#e0b040', rim: '#9affd8', paper: '#f0e0a0' },
    { br: '#7a5a8a', dk: '#1a0c22', soul: '#e070ff', core: '#ffe6ff', tass: '#ff5a8a', rim: '#f0a0ff', paper: '#e8c0d0' },
  ];
  function lgLegs(v) {
    const C = LGP[v];
    return spr('lg:legs:' + v, 170, 84, 85, 74, (g) => {
      const leg = (x0, dark) => {
        const p = new Path2D();
        p.moveTo(x0 - 12, -64); p.quadraticCurveTo(x0 - 18, -32, x0 - 8, -12);
        p.lineTo(x0 - 17, -3); p.quadraticCurveTo(x0 - 16, 4, x0 - 6, 3);
        p.lineTo(x0 + 17, 3); p.quadraticCurveTo(x0 + 23, 1, x0 + 19, -5);
        p.lineTo(x0 + 9, -12); p.quadraticCurveTo(x0 + 15, -36, x0 + 12, -64); p.closePath();
        paint(g, p, x0 - 17, -64, 40, 68, pal(dark ? shade(C.br, -0.4) : C.br, C.rim), { lw: 2, hl: 0.35 });
        g.strokeStyle = shade(C.br, -0.65); g.lineWidth = 1.3;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x0 + 1 + k * 6, 3); g.lineTo(x0 + 2 + k * 6, -3); g.stroke(); }
        // beast-mask knee
        ball(g, x0, -42, 7, pal(shade(C.br, dark ? -0.3 : 0.12), C.rim), { lw: 1.2 });
        g.fillStyle = shade(C.br, -0.7);
        g.beginPath(); g.arc(x0 - 2.5, -43, 1.3, 0, TAU); g.arc(x0 + 2.5, -43, 1.3, 0, TAU); g.fill();
      };
      leg(-2, true); leg(-38, false); leg(36, false);
    });
  }
  function lgBody(v) {
    const C = LGP[v];
    return spr('lg:body:' + v, 210, 120, 105, 112, (g) => {
      const br = pal(C.br, C.rim);
      g.lineWidth = 6; g.strokeStyle = shade(C.br, -0.5);
      g.beginPath(); g.arc(-60, -80, 11, 0, TAU); g.stroke();
      const bowl = new Path2D();
      bowl.moveTo(-58, -97); bowl.lineTo(58, -97);
      bowl.bezierCurveTo(60, -64, 38, -45, 0, -43); bowl.bezierCurveTo(-38, -45, -60, -64, -58, -97); bowl.closePath();
      paint(g, bowl, -60, -97, 120, 54, br, { lw: 2.2, hl: 0.45, rimW: 12 });
      g.save(); g.clip(bowl);
      for (let i = 0; i < 9; i++) puff(g, (U.hash(i, 3, v) - 0.5) * 110, -48 - U.hash(i, 5, v) * 46, 7 + U.hash(i, 7, v) * 11, '#3fa88a', 0.4);
      g.strokeStyle = rgba(shade(C.br, -0.6), 0.9); g.lineWidth = 1.6;
      for (let i = -6; i <= 6; i++) {
        const mx = i * 9.5, my = -85;
        g.beginPath(); g.moveTo(mx - 3.5, my + 4); g.lineTo(mx - 3.5, my - 4); g.lineTo(mx + 3.5, my - 4);
        g.lineTo(mx + 3.5, my + 1.5); g.lineTo(mx, my + 1.5); g.lineTo(mx, my - 1); g.stroke();
      }
      g.strokeStyle = rgba(shade(C.br, 0.45), 0.55); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-62, -77); g.bezierCurveTo(-20, -74, 20, -74, 62, -77); g.stroke();
      // abstract beast mask
      g.strokeStyle = rgba(shade(C.br, -0.6), 0.85); g.lineWidth = 2;
      for (const s of [-1, 1]) {
        g.beginPath(); g.arc(s * 13 + 6, -62, 6, s > 0 ? PI : 0, s > 0 ? PI * 2.6 : PI * 1.6, s < 0); g.stroke();
        g.beginPath(); g.moveTo(6 + s * 4, -70); g.quadraticCurveTo(6 + s * 18, -76, 6 + s * 28, -66); g.stroke();
      }
      g.beginPath(); g.moveTo(6, -68); g.lineTo(6, -52); g.stroke();
      g.restore();
      const lip = new Path2D(); lip.ellipse(0, -97, 62, 9.5, 0, 0, TAU);
      paint(g, lip, -62, -106, 124, 19, pal(shade(C.br, 0.18), C.rim), { lw: 2, hl: 0.55 });
      g.fillStyle = shade(C.br, -0.75); g.beginPath(); g.ellipse(0, -98, 52, 6, 0, 0, TAU); g.fill();
      g.lineWidth = 6; g.strokeStyle = shade(C.br, -0.6);
      g.beginPath(); g.arc(61, -80, 11, -1.4, 2.4); g.stroke();
      g.lineWidth = 3.5; g.strokeStyle = shade(C.br, 0.15); g.stroke();
    });
  }
  function lgFrame(v) {
    const C = LGP[v];
    return spr('lg:frame:' + v, 240, 200, 120, 272, (g) => {
      const br = pal(C.br, C.rim), dk = shade(C.br, -0.6);
      // torso lantern: outline, ribs, sheen, talisman
      const A = barrel(0, -170, -100, 92, 0.12);
      const sh = g.createLinearGradient(-50, 0, 50, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.18, 'rgba(255,255,255,0.28)');
      sh.addColorStop(0.3, 'rgba(255,255,255,0.04)'); sh.addColorStop(0.85, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,10,0.45)');
      g.fillStyle = sh; g.fill(A);
      barrelRibs(g, 0, -170, -100, 92, 0.12, 6, C.br, 3, dk);
      g.lineWidth = 2.2; g.strokeStyle = dk; g.stroke(A);
      // talisman strip
      const tal = new Path2D(); tal.moveTo(10, -162); tal.lineTo(22, -161); tal.lineTo(21, -112); tal.lineTo(13, -108); tal.lineTo(9, -113); tal.closePath();
      paint(g, tal, 9, -162, 13, 54, pal(C.paper, null, { o: shade(C.paper, -0.5) }), { lw: 1, hl: 0.2 });
      g.strokeStyle = '#b0202a'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(15.5, -157); g.lineTo(15.5, -150); g.moveTo(12, -150); g.lineTo(19, -150);
      g.moveTo(13, -145); g.quadraticCurveTo(18, -140, 13, -136); g.quadraticCurveTo(19, -131, 14, -126);
      g.moveTo(16, -124); g.lineTo(15, -116); g.stroke();
      // bands
      const band = (y, rx, ry, th) => {
        const p = new Path2D(); p.ellipse(0, y, rx, ry, 0, 0, TAU);
        g.lineWidth = th + 2; g.strokeStyle = dk; g.stroke(p);
        const bg = g.createLinearGradient(-rx, 0, rx, 0);
        bg.addColorStop(0, shade(C.br, 0.35)); bg.addColorStop(0.5, C.br); bg.addColorStop(1, shade(C.br, -0.4));
        g.lineWidth = th; g.strokeStyle = bg; g.stroke(p);
        g.lineWidth = 1; g.strokeStyle = rgba('#ffffff', 0.35);
        g.beginPath(); g.ellipse(0, y - th * 0.3, rx, ry, 0, PI * 1.05, PI * 1.6); g.stroke();
      };
      band(-170, 40, 7, 6); band(-101, 40, 7, 6);
      // shoulder domes
      for (const s of [-1, 1]) {
        const d = new Path2D(); d.ellipse(s * 52, -158, 22, 15, s * 0.25, PI, TAU); d.lineTo(s * 52 + 22, -156); d.closePath();
        const dd = new Path2D(); dd.moveTo(s * 52 - 23, -156);
        dd.bezierCurveTo(s * 52 - 22, -180, s * 52 + 22, -180, s * 52 + 23, -156);
        dd.quadraticCurveTo(s * 52, -148, s * 52 - 23, -156); dd.closePath();
        paint(g, dd, s * 52 - 23, -176, 46, 26, pal(s < 0 ? shade(C.br, -0.25) : C.br, C.rim), { lw: 2, hl: 0.5 });
        for (let k = 0; k < 4; k++) ball(g, s * 52 - 14 + k * 9.5, -158 - (k === 1 || k === 2 ? 4 : 0), 1.8, br, { lw: 0.6, spec: false });
        g.strokeStyle = C.tass; g.lineWidth = 2.6;
        for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(s * 52 - 10 + k * 10, -152); g.lineTo(s * 52 - 11 + k * 10, -140); g.stroke(); }
      }
      // neck
      const nk = new Path2D(); nk.roundRect(-14, -188, 28, 20, 3);
      paint(g, nk, -14, -188, 28, 20, br, { lw: 1.8 });
      // head lantern
      const B = barrel(2, -224, -186, 58, 0.1);
      const sh2 = g.createLinearGradient(-30, 0, 34, 0);
      sh2.addColorStop(0, 'rgba(255,255,255,0)'); sh2.addColorStop(0.2, 'rgba(255,255,255,0.25)'); sh2.addColorStop(0.35, 'rgba(255,255,255,0)'); sh2.addColorStop(1, 'rgba(0,0,10,0.4)');
      g.fillStyle = sh2; g.fill(B);
      barrelRibs(g, 2, -224, -186, 58, 0.1, 4, C.br, 2.4, dk);
      g.lineWidth = 2; g.strokeStyle = dk; g.stroke(B);
      const bandB = (y) => {
        const p = new Path2D(); p.ellipse(2, y, 26, 5, 0, 0, TAU);
        g.lineWidth = 6; g.strokeStyle = dk; g.stroke(p);
        g.lineWidth = 4; g.strokeStyle = C.br; g.stroke(p);
      };
      bandB(-186);
      // pagoda roof
      const roof = new Path2D();
      roof.moveTo(-48, -226); roof.quadraticCurveTo(-30, -228, -18, -240); roof.quadraticCurveTo(2, -252, 22, -240);
      roof.quadraticCurveTo(34, -228, 52, -226); roof.quadraticCurveTo(46, -219, 30, -220);
      roof.quadraticCurveTo(2, -216, -26, -220); roof.quadraticCurveTo(-42, -219, -48, -226); roof.closePath();
      paint(g, roof, -48, -252, 100, 36, pal(shade(C.br, -0.15), C.rim), { lw: 2, hl: 0.55 });
      g.save(); g.clip(roof);
      g.strokeStyle = rgba(dk, 0.7); g.lineWidth = 1.2;
      for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(2 + i * 3, -250); g.lineTo(2 + i * 8.5, -216); g.stroke(); }
      g.restore();
      ball(g, 2, -255, 5.5, pal(shade(C.br, 0.1), C.rim), { lw: 1.4 });
      ball(g, 2, -264, 3.6, pal(shade(C.br, 0.2), C.rim), { lw: 1.2 });
      g.strokeStyle = C.tass; g.lineWidth = 2.4;
      for (const ex of [-48, 52]) { g.beginPath(); g.moveTo(ex, -226); g.lineTo(ex + (ex < 0 ? -1 : 1), -208); g.stroke(); ball(g, ex, -226, 2.6, pal(C.tass), { lw: 0.8, spec: false }); }
    });
  }
  function lgMace(v) {
    const C = LGP[v];
    return spr('lg:mace:' + v, 60, 70, 30, 30, (g) => {
      const dk = shade(C.br, -0.6);
      const B = barrel(0, -14, 16, 28, 0.12);
      const sh = g.createLinearGradient(-16, 0, 16, 0);
      sh.addColorStop(0.15, 'rgba(255,255,255,0.3)'); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,10,0.45)');
      g.fillStyle = sh; g.fill(B);
      barrelRibs(g, 0, -14, 16, 28, 0.12, 4, C.br, 2.2, dk);
      g.lineWidth = 1.8; g.strokeStyle = dk; g.stroke(B);
      const cap = new Path2D(); cap.moveTo(-15, -13); cap.quadraticCurveTo(0, -27, 15, -13); cap.closePath();
      paint(g, cap, -15, -24, 30, 12, pal(C.br, C.rim), { lw: 1.6, hl: 0.5 });
      const bot = new Path2D(); bot.moveTo(-13, 15); bot.lineTo(13, 15); bot.lineTo(0, 34); bot.closePath();
      paint(g, bot, -13, 15, 26, 19, pal(shade(C.br, -0.1), C.rim), { lw: 1.6 });
      for (const s of [-1, 1]) {
        const sp = new Path2D(); sp.moveTo(s * 14, -2); sp.lineTo(s * 24, 1); sp.lineTo(s * 14, 5); sp.closePath();
        paint(g, sp, s > 0 ? 14 : -24, -2, 10, 7, pal(C.br), { lw: 1.2, hl: 0 });
      }
      g.lineWidth = 3; g.strokeStyle = dk; g.beginPath(); g.arc(0, -25, 4, 0, TAU); g.stroke();
    });
  }
  function lgSoulInterior(ctx, path, cx, cy, rx, ry, C, t, n, inten, faces) {
    ctx.save(); ctx.clip(path);
    const fl = inten * (0.85 + 0.15 * sin(t * 9.1) * sin(t * 3.7));
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, max(rx, ry) * 1.25);
    g.addColorStop(0, C.core); g.addColorStop(0.3, rgba(C.soul, 0.95)); g.addColorStop(0.75, mix(C.soul, C.dk, 0.6)); g.addColorStop(1, C.dk);
    ctx.globalAlpha = clamp(0.55 + fl * 0.45, 0, 1);
    ctx.fillStyle = g; ctx.fillRect(cx - rx * 1.4, cy - ry * 1.4, rx * 2.8, ry * 2.8);
    ctx.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const a = t * (0.8 + i * 0.13) + i * TAU / n;
      const px = cx + cos(a) * rx * 0.55, py = cy + sin(a * 1.3 + i) * ry * 0.45;
      const depth = (sin(a) + 1) / 2;
      if (faces && i < faces) {
        const fa = 0.25 + depth * 0.35;
        ctx.fillStyle = rgba(C.core, fa);
        ctx.beginPath(); ctx.ellipse(px, py, 7, 9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgba(C.dk, fa * 1.4);
        ctx.beginPath(); ctx.ellipse(px - 2.5, py - 2, 1.3, 2, 0, 0, TAU); ctx.ellipse(px + 2.5, py - 2, 1.3, 2, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(px, py + 3.5, 1.5, 2.4 + sin(t * 3 + i) * 0.6, 0, 0, TAU); ctx.fill();
      }
      wisp(ctx, px, py, 2.6 + depth * 1.6, C.soul, (0.5 + depth * 0.5) * fl);
    }
    ctx.restore();
    glow(ctx, cx, cy, max(rx, ry) * 2.2, C.soul, 0.35 * fl);
  }
  def('lantern_golem', 150, 210, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = LGP[P.v];
    const A = poseParams(P,
      { fa: 0.32 + sin(t * 1.3) * 0.09, ba: -0.3 + sin(t * 1.3 + 1) * 0.07, lean: 0, dx: 0, gl: 0.75 },
      { fa: -0.9, ba: 0.2, lean: -0.08, dx: -6, gl: 0.9 },
      { fa: 1.95, ba: -0.4, lean: 0.12, dx: 24, gl: 1.15 },
      { fa: -0.6, ba: -0.7, lean: -0.15, dx: -12, gl: 0.35 },
      { fa: 0.9, ba: -0.9, lean: 0, dx: 0, gl: 1.5 });
    ctx.translate(x + A.dx + P.shake, y); ctx.scale(0.8, 0.8);
    put(ctx, lgLegs(P.v), 0, 0);
    const bob = sin(t * 1.3) * 1.8;
    ctx.translate(0, bob - 60); ctx.rotate(A.lean); ctx.translate(0, 60);
    const L = 80;
    const arm = (sx, sy, a, front) => {
      const mx = sx + sin(a) * L, my = sy + cos(a) * L;
      chainLinks(ctx, sx, sy, mx, my - 26, 10 * (1 - abs(sin(a))), front ? C.br : shade(C.br, -0.35), shade(C.br, -0.7), 9);
      ctx.save(); ctx.translate(mx, my); ctx.rotate(-a * 0.85);
      const ip = barrel(0, -14, 16, 28, 0.12);
      lgSoulInterior(ctx, ip, 0, 1, 12, 14, C, t + sx, 2, A.gl * (front ? 1 : 0.7), 0);
      put(ctx, lgMace(P.v), 0, 0);
      flame(ctx, 0, -27, 9, 18, t, C.soul, C.core, sx, 0.8 * A.gl);
      ctx.restore();
      return [mx, my];
    };
    arm(-52, -158, A.ba, false);
    put(ctx, lgBody(P.v), 0, 0);
    lgSoulInterior(ctx, barrel(0, -170, -100, 92, 0.12), 0, -135, 42, 34, C, t, 5, A.gl, 3);
    lgSoulInterior(ctx, barrel(2, -224, -186, 58, 0.1), 4, -205, 24, 18, C, t * 1.3 + 2, 2, A.gl * 0.8, 0);
    put(ctx, lgFrame(P.v), 0, 0);
    // eyes in the head lantern
    const ea = 0.8 + 0.2 * sin(t * 5) + P.cp * 0.6 + P.atk * 0.5;
    ctx.fillStyle = rgba('#ffffff', min(1, ea));
    ctx.beginPath(); ctx.ellipse(12, -206, 4.5, 1.6, -0.1, 0, TAU); ctx.ellipse(25, -205, 3.2, 1.4, -0.1, 0, TAU); ctx.fill();
    glow(ctx, 12, -206, 12, C.soul, ea); glow(ctx, 25, -205, 9, C.soul, ea * 0.8);
    flame(ctx, 2, -268, 8, 16, t, C.soul, C.core, 3, 0.6 * A.gl);
    const m = arm(52, -158, A.fa, true);
    if (P.atk > 0.3) glow(ctx, m[0], m[1], 60 * P.atk, C.soul, 0.6 * P.atk);
    if (P.cast > 0.02) {
      for (let i = 0; i < 9; i++) {
        const k = (t * 0.5 + i / 9) % 1;
        const px = sin(i * 2.4 + t) * (30 + k * 50), py = -140 - k * 170;
        wisp(ctx, px, py, 3.2, C.soul, P.cp * (1 - k));
      }
      glow(ctx, 0, -140, 130, C.soul, 0.25 * P.cp);
    }
  });

  // =============================================================================================
  // 林投姐 linto_jie — BOSS. Tainan ghost woman, pale 大裪衫, long hair, pandanus leaves. Sorrowful.
  //   phase 1 sorrow · phase 2 grief-wrath (red eyes, wild hair) · phase 3 release (golden calm)
  // =============================================================================================
  const LTP = [
    { cloth: '#dfe7ea', trim: '#5a7a96', skin: '#e6edf0', hair: '#12121a', hairHi: '#4a5a7a', leaf: '#3e6a52', leafHi: '#9ad0a0', wisp: '#7affd8', eye: '#9ae8ff', fruit: '#e09a40', rim: '#a8f0ff', lip: '#b89aa6' },
    { cloth: '#aaa4ba', trim: '#5a2a44', skin: '#d6d2de', hair: '#0a080e', hairHi: '#6a2a3e', leaf: '#2c3a34', leafHi: '#7a8a70', wisp: '#ff4a6a', eye: '#ff3050', fruit: '#e05a3a', rim: '#ff9ab0', lip: '#8a5a6a' },
    { cloth: '#f4eedf', trim: '#c8a050', skin: '#f6efe4', hair: '#1a1820', hairHi: '#8a7a5a', leaf: '#6a8a4a', leafHi: '#e0e8a0', wisp: '#ffd88a', eye: '#ffe0a0', fruit: '#ffc060', rim: '#fff0c0', lip: '#c89a90' },
  ];
  function pandanLeaf(k, col, hi) {
    return spr('lt:leaf:' + k, 172, 76, 4, 28, (g) => {
      const qd = (u, a, b, c) => (1 - u) * (1 - u) * a + 2 * (1 - u) * u * b + u * u * c;
      const p = new Path2D();
      p.moveTo(0, -7); p.quadraticCurveTo(80, -30, 162, 36); p.quadraticCurveTo(80, -8, 0, 8); p.closePath();
      const gr = g.createLinearGradient(0, -20, 30, 20);
      gr.addColorStop(0, shade(col, 0.28)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.45));
      g.fillStyle = gr; g.fill(p);
      g.strokeStyle = shade(col, -0.6); g.lineWidth = 1.2; g.stroke(p);
      g.strokeStyle = rgba(hi, 0.75); g.lineWidth = 1;
      g.beginPath(); g.moveTo(2, 0); g.quadraticCurveTo(80, -19, 160, 35); g.stroke();
      g.fillStyle = shade(col, -0.5);
      for (let u = 0.05; u < 0.92; u += 0.045) {
        for (const [y0, y1, y2, s0] of [[-7, -30, 36, -1], [8, -8, 36, 1]]) {
          const px = qd(u, 0, 80, 162), py = qd(u, y0, y1, y2);
          const qx = qd(u + 0.02, 0, 80, 162), qy = qd(u + 0.02, y0, y1, y2);
          const dx = qx - px, dy = qy - py, L = hypot(dx, dy) || 1;
          const nx = (-dy / L) * -s0, ny = (dx / L) * -s0;
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx / L * 4.5 - nx * 2.4, py + dy / L * 4.5 - ny * 2.4); g.lineTo(px + dx / L * 2.5, py + dy / L * 2.5); g.fill();
        }
      }
    });
  }
  function ltFruit(k) {
    const C = LTP[k];
    return spr('lt:fruit:' + k, 40, 44, 20, 22, (g) => {
      const fp = pal(C.fruit, '#fff0a0');
      ball(g, 0, 0, 15, fp, { lw: 1.6, sy: 1.15, spec: false });
      g.strokeStyle = shade(C.fruit, -0.45); g.lineWidth = 1;
      for (let r = -3; r <= 3; r++) for (let c = -3; c <= 3; c++) {
        const px = c * 5 + (r % 2 ? 2.5 : 0), py = r * 5;
        if (px * px / 225 + py * py / 297 > 0.9) continue;
        g.beginPath();
        for (let i = 0; i < 6; i++) { const a = i * PI / 3 + PI / 6; g.lineTo(px + cos(a) * 2.9, py + sin(a) * 2.9); }
        g.closePath(); g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(-5, -7, 4, 2.5, -0.6, 0, TAU); g.fill();
    });
  }
  function ltHead(k) {
    const C = LTP[k];
    return spr('lt:head:' + k, 70, 80, 35, 42, (g) => {
      const skin = pal(C.skin, C.rim, { o: shade(C.skin, -0.5) });
      // bun at the back (loose)
      ball(g, -15, -14, 10, pal(C.hair, C.hairHi), { lw: 1.4, spec: false });
      // white mourning flower in bun
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5;
        g.fillStyle = '#f4f6f6'; g.strokeStyle = '#9aa6b0'; g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(-20 + cos(a) * 3.5, -20 + sin(a) * 3.5, 3, 2, a, 0, TAU); g.fill(); g.stroke();
      }
      g.fillStyle = '#d8c070'; g.beginPath(); g.arc(-20, -20, 1.6, 0, TAU); g.fill();
      // neck
      const nk = new Path2D(); nk.moveTo(-5, 10); nk.lineTo(5, 12); nk.lineTo(4, 26); nk.lineTo(-6, 26); nk.closePath();
      paint(g, nk, -6, 10, 11, 16, pal(shade(C.skin, -0.12)), { lw: 1.2 });
      // face
      const face = smooth([[-11, -13], [2, -17], [12, -10], [14.5, 1], [12, 12], [5, 18.5], [-3, 17], [-10, 8], [-12.5, -3]]);
      paint(g, face, -13, -17, 28, 36, skin, { lw: 1.5, hl: 0.4 });
      g.save(); g.clip(face);
      const sg = g.createLinearGradient(-12, 0, 6, 0);
      sg.addColorStop(0, rgba('#6a7aa0', 0.35)); sg.addColorStop(1, rgba('#6a7aa0', 0));
      g.fillStyle = sg; g.fillRect(-14, -18, 20, 40);
      const ey = g.createRadialGradient(5, 2, 1, 5, 2, 9);
      ey.addColorStop(0, rgba('#7a6a90', 0.3)); ey.addColorStop(1, rgba('#7a6a90', 0));
      g.fillStyle = ey; g.fillRect(-5, -8, 20, 20);
      g.restore();
      // downcast eyes (lids lowered)
      const eyeL = (ex, ey2, s) => {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(ex, ey2 + 0.6, 3.2 * s, 1.1, 0.12, 0, PI); g.fill();
        g.fillStyle = '#1a1a24'; g.beginPath(); g.ellipse(ex + 0.6 * s, ey2 + 0.8, 1.4 * s, 0.9, 0, 0, PI); g.fill();
        g.strokeStyle = '#1a1420'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(ex - 3.6 * s, ey2 - 0.2); g.quadraticCurveTo(ex, ey2 + 1.6, ex + 3.8 * s, ey2 + 0.2); g.stroke();
        g.lineWidth = 0.8;
        for (let i = 0; i < 4; i++) { const lx = ex - 2 * s + i * 1.6 * s; g.beginPath(); g.moveTo(lx, ey2 + 0.9); g.lineTo(lx + 0.4 * s, ey2 + 2.6); g.stroke(); }
      };
      eyeL(7, 0, 1); eyeL(-4, 0.6, 0.72);
      // sorrowful brows (inner ends raised)
      g.strokeStyle = shade(C.hair, 0.15); g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(3.5, -6.5); g.quadraticCurveTo(8, -6, 12, -3.5); g.stroke();
      g.beginPath(); g.moveTo(-1.5, -6.2); g.quadraticCurveTo(-5, -5.5, -8, -3.2); g.stroke();
      // nose, mouth
      g.strokeStyle = rgba(shade(C.skin, -0.45), 0.8); g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(13, 2); g.quadraticCurveTo(15, 5.5, 12.5, 6.5); g.stroke();
      g.strokeStyle = C.lip; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(5.5, 11.5); g.quadraticCurveTo(8.5, 10.6, 11, 11.8); g.stroke();
      // tear tracks
      g.strokeStyle = rgba(C.eye, 0.55); g.lineWidth = 1;
      g.beginPath(); g.moveTo(8, 2.5); g.quadraticCurveTo(9, 8, 7.5, 14); g.stroke();
      // hair cap with centre part & side lock
      const cap = new Path2D();
      cap.moveTo(-13, 2); cap.bezierCurveTo(-16, -12, -10, -22, 0, -23); cap.bezierCurveTo(10, -23, 15, -16, 15, -6);
      cap.quadraticCurveTo(11, -11, 7, -12); cap.quadraticCurveTo(2, -11, 0, -8); cap.quadraticCurveTo(-4, -12, -8, -9);
      cap.quadraticCurveTo(-10, -4, -9, 4); cap.closePath();
      paint(g, cap, -16, -23, 31, 27, pal(C.hair, C.hairHi, { l: shade(C.hair, 0.2), hl: C.hairHi }), { lw: 1.3, hl: 0.6 });
      g.strokeStyle = rgba(C.hairHi, 0.6); g.lineWidth = 0.8;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-1 + i * 0.5, -21); g.quadraticCurveTo(-10 + i * 2, -18, -12 + i, -4); g.stroke(); }
      const lock = new Path2D();
      lock.moveTo(12, -12); lock.bezierCurveTo(17, -2, 13, 12, 17, 26); lock.quadraticCurveTo(13, 14, 11, 4); lock.quadraticCurveTo(11, -4, 9, -10); lock.closePath();
      g.fillStyle = C.hair; g.fill(lock); g.strokeStyle = rgba(C.hairHi, 0.5); g.lineWidth = 0.7; g.stroke(lock);
    });
  }
  function ltBody(k) {
    const C = LTP[k];
    return spr('lt:body:' + k, 150, 270, 75, 262, (g) => {
      const cl = pal(C.cloth, C.rim, { o: shade(C.cloth, -0.55) });
      const skirt = new Path2D();
      skirt.moveTo(-20, -176); skirt.lineTo(18, -176);
      skirt.bezierCurveTo(30, -120, 44, -70, 56, -24);
      for (let i = 0; i <= 8; i++) skirt.quadraticCurveTo(52 - i * 14 + 7, -14 - (i % 2) * 10, 52 - (i + 1) * 14 + 2, -22 + (i % 3) * 3);
      skirt.bezierCurveTo(-50, -70, -34, -120, -20, -176); skirt.closePath();
      paint(g, skirt, -66, -176, 122, 160, pal(shade(C.cloth, -0.08), C.rim, { o: shade(C.cloth, -0.55) }), { lw: 1.8, hl: 0.25 });
      g.save(); g.clip(skirt);
      g.strokeStyle = rgba(shade(C.cloth, -0.4), 0.55); g.lineWidth = 2;
      for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(i * 4, -170); g.quadraticCurveTo(i * 8, -100, i * 14 + 4, -10); g.stroke(); }
      g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = 1.2;
      for (let i = -4; i <= 4; i += 2) { g.beginPath(); g.moveTo(i * 4 + 2, -170); g.quadraticCurveTo(i * 8 + 3, -100, i * 14 + 8, -10); g.stroke(); }
      // embroidered hem band
      g.strokeStyle = rgba(C.trim, 0.8); g.lineWidth = 5;
      g.beginPath(); g.moveTo(-60, -50); g.quadraticCurveTo(0, -42, 60, -52); g.stroke();
      g.strokeStyle = rgba(shade(C.trim, 0.5), 0.6); g.lineWidth = 1;
      for (let i = -9; i <= 9; i++) { g.beginPath(); g.arc(i * 6.5, -48 + abs(i) * 0.1, 2, 0, TAU); g.stroke(); }
      g.restore();
      // jacket 大裪衫
      const jk = smooth([[-8, -246], [-22, -237], [-27, -222], [-27, -196], [-24, -164], [4, -159], [26, -168], [25, -200], [25, -225], [14, -241], [4, -246]]);
      paint(g, jk, -27, -242, 53, 82, cl, { lw: 1.8, hl: 0.35 });
      g.save(); g.clip(jk);
      g.strokeStyle = rgba(shade(C.cloth, -0.35), 0.6); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-8, -200); g.quadraticCurveTo(-4, -184, -10, -166); g.moveTo(10, -196); g.quadraticCurveTo(14, -182, 12, -164); g.stroke();
      g.restore();
      // 大襟 diagonal trim + knot buttons
      g.strokeStyle = shade(C.trim, -0.4); g.lineWidth = 5.5;
      const tr = new Path2D(); tr.moveTo(-2, -240); tr.quadraticCurveTo(16, -232, 22, -214); tr.lineTo(24, -166);
      g.stroke(tr); g.strokeStyle = C.trim; g.lineWidth = 3.5; g.stroke(tr);
      g.strokeStyle = shade(C.trim, -0.4); g.lineWidth = 4;
      g.beginPath(); g.moveTo(-26, -166); g.quadraticCurveTo(0, -158, 26, -168); g.stroke();
      g.strokeStyle = C.trim; g.lineWidth = 2.5; g.stroke();
      for (const [bx, by] of [[8, -236], [19, -222], [23, -204], [23.5, -188]]) {
        g.strokeStyle = shade(C.trim, -0.5); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(bx - 5, by); g.lineTo(bx + 1, by); g.stroke();
        ball(g, bx - 5, by, 1.6, pal(C.trim), { lw: 0.6, spec: false });
      }
      // high collar
      const col = new Path2D(); col.moveTo(-8, -246); col.quadraticCurveTo(4, -250, 12, -244); col.lineTo(12, -238); col.quadraticCurveTo(2, -242, -8, -239); col.closePath();
      paint(g, col, -8, -250, 20, 12, pal(C.trim), { lw: 1.2 });
      // fade the hem into mist
      g.globalCompositeOperation = 'destination-out';
      const fg = g.createLinearGradient(0, -110, 0, -16);
      fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = fg; g.fillRect(-75, -110, 150, 110);
      g.globalCompositeOperation = 'source-over';
    });
  }
  function sleeve(ctx, sx, sy, ex, ey, hx, hy, drop, sway, cloth, skin, C) {
    const dx = hx - ex, dy = hy - ey, L = hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    let nx = -uy, ny = ux;
    if (ny < 0) { nx = -nx; ny = -ny; }
    // hanging drape under the forearm
    const e1 = [ex + nx * 8, ey + ny * 8], h1 = [hx + nx * 13, hy + ny * 13];
    const tip = [h1[0] + sway - ux * 6, max(h1[1], e1[1]) + drop];
    const dp = smooth([[ex, ey], e1, [lerp(e1[0], tip[0], 0.5) - 3, lerp(e1[1], tip[1], 0.6)], tip, [h1[0] + 2, lerp(h1[1], tip[1], 0.4)], h1, [hx, hy]]);
    paint(ctx, dp, min(ex, tip[0]) - 10, min(ey, hy), abs(hx - ex) + 24, tip[1] - min(ey, hy), pal(shade(cloth.b, -0.12), cloth.rim, { o: cloth.o }), { lw: 1.5, hl: 0.2 });
    ctx.strokeStyle = rgba(cloth.o, 0.45); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(lerp(ex, hx, 0.4) + nx * 8, lerp(ey, hy, 0.4) + ny * 10); ctx.quadraticCurveTo(tip[0] - 4, lerp(h1[1], tip[1], 0.5), tip[0] - 2, tip[1] - 4); ctx.stroke();
    limb(ctx, sx, sy, ex, ey, 9.5, 8.5, cloth, 1.6);
    limb(ctx, ex, ey, hx, hy, 8.5, 12.5, cloth, 1.6);
    // cuff opening
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(atan2(uy, ux));
    ctx.fillStyle = shade(cloth.b, -0.55); ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 12, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.trim; ctx.lineWidth = 2.6; ctx.stroke();
    const hp = new Path2D(); hp.moveTo(-1, -4); hp.quadraticCurveTo(9, -5.5, 13, -1.5); hp.quadraticCurveTo(10, 3.5, 0, 4); hp.closePath();
    paint(ctx, hp, -1, -5, 14, 9, skin, { lw: 1.1, hl: 0.3 });
    ctx.restore();
  }
  def('linto_jie', 200, 320, (ctx, x, y, t, o) => {
    const P = pose(o, t);
    const k = P.ph > 1 ? P.ph - 1 : P.v;
    const C = LTP[k];
    const wild = k === 1 ? 1 : 0, calm = k === 2 ? 1 : 0;
    const A = poseParams(P,
      { fex: 26, fey: -204, fhx: 20, fhy: -222, bex: -26, bey: -204, bhx: -30, bhy: -176, lean: 0, dx: 0, hair: 0 },
      { fex: 6, fey: -210, fhx: -6, fhy: -232, bex: -30, bey: -212, bhx: -44, bhy: -200, lean: -0.08, dx: -10, hair: -0.3 },
      { fex: 52, fey: -232, fhx: 86, fhy: -238, bex: -30, bey: -214, bhx: -50, bhy: -222, lean: 0.16, dx: 36, hair: 1 },
      { fex: 22, fey: -214, fhx: 16, fhy: -246, bex: -30, bey: -200, bhx: -40, bhy: -190, lean: -0.18, dx: -16, hair: -0.5 },
      { fex: 44, fey: -250, fhx: 60, fhy: -290, bex: -44, bey: -250, bhx: -62, bhy: -290, lean: -0.04, dx: 0, hair: 0.4 });
    const fl = -14 + sin(t * 1.1) * 6;
    const cloth = pal(C.cloth, C.rim, { o: shade(C.cloth, -0.55) });
    const skin = pal(C.skin, C.rim, { o: shade(C.skin, -0.5) });
    ctx.translate(x + A.dx + P.shake, y);
    // ground mist (not floating)
    mist(ctx, 0, -14, 150, 26, t, k === 1 ? '#8a7a9a' : '#c8d8e4', 0.55, 8, 11);
    ctx.translate(0, fl);
    ctx.translate(0, -180); ctx.rotate(A.lean); ctx.translate(0, 180);
    const spin = t * (0.35 + wild * 0.6) + P.cast * P.st * 2;
    // ghost-fires behind
    const fires = [];
    for (let i = 0; i < 5; i++) {
      const a = spin + i * TAU / 5;
      fires.push({ x: cos(a) * (96 + wild * 14), y: -170 + sin(a) * 30 + sin(t * 2 + i) * 8, z: sin(a), i });
    }
    for (const f of fires) if (f.z < 0) flame(ctx, f.x, f.y, 12, 22, t, C.wisp, '#ffffff', f.i, 0.55 + P.cp * 0.4);
    // pandanus thicket: two arching tufts behind her
    const leaf = pandanLeaf(k, C.leaf, C.leafHi), leafD = pandanLeaf(k + 'd', shade(C.leaf, -0.35), C.leafHi);
    const tufts = [[-50, -140, -3.05, -1.45, 8, 0.6, 0.95], [24, -212, -2.35, -0.2, 9, 0.66, 1.02]];
    tufts.forEach(([tx, ty, a0, a1, n, l0, l1], ti) => {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const a = lerp(a0, a1, u) + (U.hash(i, ti, 5) - 0.5) * 0.2 + sin(t * 0.9 + i * 0.8 + ti) * (0.025 + wild * 0.05) + A.hair * 0.04;
        const len = lerp(l0, l1, U.hash(i, 9, ti + 3));
        ctx.save(); ctx.translate(tx, ty); ctx.rotate(a); ctx.scale(len, (cos(a) >= 0 ? 1 : -1) * len);
        put(ctx, (i + ti) % 2 ? leafD : leaf, 0, 0); ctx.restore();
      }
    });
    // fruit lanterns
    for (const [fx, fy, s] of [[-40, -206, 0.9], [-4, -224, 0.75]]) {
      glow(ctx, fx, fy, 30, C.fruit, 0.3 + 0.1 * sin(t * 2 + fx));
      put(ctx, ltFruit(k), fx, fy, s);
    }
    // back hair mass
    const hw = 1 + wild * 0.6 + A.hair * 0.4;
    const wv = (q) => sin(t * 1.4 + q) * (5 + wild * 6);
    const hairPts = [[-8, -286], [6, -284], [-2, -248], [-14, -205], [-20 + wv(1), -160], [-24 + wv(2) - A.hair * 10, -112],
      [-40 * hw + wv(3), -84], [-46 * hw + wv(3.5), -110], [-54 * hw + wv(4), -150], [-44 * hw + wv(4.5), -200], [-30, -250], [-24, -276]];
    const hp = smooth(hairPts);
    paint(ctx, hp, -60, -286, 66, 202, pal(C.hair, C.hairHi, { l: shade(C.hair, 0.12) }), { lw: 1.4, hl: 0.15, rimA: 0.4 });
    ctx.strokeStyle = rgba(C.hairHi, 0.45); ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const u = i / 8;
      ctx.beginPath(); ctx.moveTo(-6 - u * 18, -270);
      ctx.bezierCurveTo(-12 - u * 26 + wv(i), -220, -16 - u * 34 * hw + wv(i + 1), -160, -22 - u * 26 * hw + wv(i + 2), -96 - u * 10);
      ctx.stroke();
    }
    // loose wild strands
    ctx.strokeStyle = rgba(C.hair, 0.9); ctx.lineWidth = 1.6;
    for (let i = 0; i < 6 + wild * 6; i++) {
      const sx2 = -12 - i * 3, sy2 = -262 + i * 6;
      ctx.beginPath(); ctx.moveTo(sx2, sy2);
      ctx.bezierCurveTo(sx2 - 30 + wv(i * 2), sy2 + 20 - wild * 30, sx2 - 50 * hw + wv(i * 3), sy2 + 50 - wild * 40, sx2 - 66 * hw + wv(i), sy2 + 90 - wild * 60 - A.hair * 40);
      ctx.stroke();
    }
    // back sleeve & arm
    sleeve(ctx, -18, -230, A.bex, A.bey, A.bhx, A.bhy, 30, sin(t * 1.3) * 6, pal(shade(C.cloth, -0.18), C.rim, { o: shade(C.cloth, -0.6) }), skin, C);
    put(ctx, ltBody(k), 0, 0);
    // head
    ctx.save(); ctx.translate(6, -262); ctx.rotate(0.12 + sin(t * 1.1 + 0.5) * 0.03 - A.lean * 0.5);
    put(ctx, ltHead(k), 0, 0);
    const tearY = ((t * 0.6) % 1);
    wisp(ctx, 7.8 + tearY * 1, 3 + tearY * 13, 1.2, C.eye, 0.8 * (1 - tearY));
    if (wild || P.atk > 0) {
      const ea = max(wild * (0.7 + 0.3 * sin(t * 6)), P.atk);
      glow(ctx, 7.5, 0.6, 10, C.eye, ea); glow(ctx, -3.5, 1, 7, C.eye, ea * 0.7);
    }
    if (calm) glow(ctx, 0, -6, 60, C.wisp, 0.18 + 0.06 * sin(t * 1.5));
    ctx.restore();
    // front hair strand over shoulder
    ctx.strokeStyle = C.hair; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(18, -258); ctx.bezierCurveTo(24, -236, 20 + wv(2) * 0.4, -214, 24 + wv(3) * 0.6, -186); ctx.stroke();
    ctx.strokeStyle = rgba(C.hairHi, 0.6); ctx.lineWidth = 0.8; ctx.stroke();
    // front sleeve & arm
    sleeve(ctx, 16, -230, A.fex, A.fey, A.fhx, A.fhy, 34, sin(t * 1.3 + 0.8) * 6, cloth, skin, C);
    if (P.atk > 0.2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = rgba(C.wisp, 0.35 * P.atk); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(A.fhx, A.fhy - 6 + i * 3); ctx.quadraticCurveTo(A.fhx + 40, A.fhy - 20 + i * 8, A.fhx + 90 * P.atk, A.fhy + i * 10 - 10); ctx.stroke();
      }
      ctx.restore();
    }
    for (const f of fires) if (f.z >= 0) flame(ctx, f.x, f.y, 12, 22, t, C.wisp, C.wisp, f.i, (0.75 + P.cp * 0.4) * clamp((abs(f.x) - 34) / 30, 0, 1));
    // drifting loose leaves in wrath / cast
    const drift = max(wild, P.cast);
    if (drift > 0.05) {
      for (let i = 0; i < 6; i++) {
        const a = t * 0.8 + i * TAU / 6, r = 110 + sin(t + i) * 14;
        ctx.save(); ctx.globalAlpha = drift * 0.85;
        ctx.translate(cos(a) * r, -170 + sin(a) * 50); ctx.rotate(a + PI / 2 + sin(t * 3 + i) * 0.4); ctx.scale(0.35, 0.6);
        put(ctx, leaf, -60, 0); ctx.restore();
      }
    }
    if (P.cast > 0.02) glow(ctx, 0, -270, 90, C.wisp, 0.35 * P.cp);
  });

  // =============================================================================================
  // 冥燈護法 nether_guardian — BOSS. Corrupted armoured guardian with a black lamp & blue flames.
  //   phase 2: glowing cracks, burning cape · phase 3: shattered breastplate, roaring soul-fire core
  // =============================================================================================
  const NGP = [
    { iron: '#2c3240', ver: '#3a7a72', gold: '#a88a4a', fire: '#3aa8ff', core: '#d8f4ff', cape: '#1a1c2a', capeIn: '#2a1830', rim: '#6ac8ff', blade: '#4a5262' },
    { iron: '#283430', ver: '#4a8a5a', gold: '#9a9a5a', fire: '#3affa0', core: '#e0fff0', cape: '#141e1a', capeIn: '#1a2a24', rim: '#7affc0', blade: '#3e5048' },
    { iron: '#30283c', ver: '#6a4a8a', gold: '#b08a6a', fire: '#b45aff', core: '#f6e0ff', cape: '#1c1426', capeIn: '#2e1430', rim: '#d090ff', blade: '#4a4058' },
  ];
  const NG_CRACKS = [
    [[-30, -280], [-18, -258], [-24, -236], [-8, -214]],
    [[40, -270], [30, -250], [38, -228], [26, -200]],
    [[-50, -150], [-40, -130], [-46, -110]],
    [[20, -150], [30, -128], [22, -104]],
    [[-6, -330], [2, -316], [-4, -304]],
    [[-40, -60], [-34, -40], [-40, -20]],
  ];
  function ngBody(v, ph) {
    const C = NGP[v];
    return spr('ng:body:' + v + ':' + ph, 220, 430, 110, 420, (g) => {
      const ir = pal(C.iron, C.rim, { l: shade(C.iron, 0.35) }), irD = pal(shade(C.iron, -0.3), C.rim, { l: shade(C.iron, 0.1) });
      const gold = pal(C.gold, '#ffe8a0');
      // legs
      const leg = (hx, fx, dark) => {
        const P2 = dark ? irD : ir;
        const th = new Path2D(); th.moveTo(hx - 24, -150); th.lineTo(hx + 24, -150); th.lineTo(fx + 18, -70); th.lineTo(fx - 18, -70); th.closePath();
        paint(g, th, hx - 24, -150, 48, 80, P2, { lw: 2 });
        const gr = smooth([[fx - 20, -80], [fx + 18, -82], [fx + 18, -40], [fx + 12, -14], [fx - 16, -14], [fx - 21, -42]]);
        paint(g, gr, fx - 21, -82, 39, 68, P2, { lw: 2, hl: 0.4 });
        g.strokeStyle = rgba(C.gold, 0.7); g.lineWidth = 2;
        g.beginPath(); g.moveTo(fx - 12, -74); g.lineTo(fx + 11, -76); g.stroke();
        ball(g, fx, -72, 9, gold, { lw: 1.4, sy: 0.8 });
        const boot = new Path2D(); boot.moveTo(fx - 18, -18); boot.lineTo(fx + 12, -18); boot.quadraticCurveTo(fx + 34, -10, fx + 38, 0); boot.lineTo(fx - 20, 0); boot.closePath();
        paint(g, boot, fx - 20, -18, 58, 18, P2, { lw: 2, hl: 0.4 });
        g.strokeStyle = rgba(C.ver, 0.6); g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(fx - 10, -60); g.lineTo(fx + 8, -62); g.moveTo(fx - 10, -46); g.lineTo(fx + 8, -48); g.stroke();
      };
      leg(-20, -42, true); leg(18, 36, false);
      // lamellar armour skirt
      const skirtP = (x0, x1, x2, x3, dark) => {
        const p = new Path2D(); p.moveTo(x0, -182); p.lineTo(x1, -182); p.lineTo(x2, -92); p.quadraticCurveTo((x2 + x3) / 2, -84, x3, -92); p.closePath();
        paint(g, p, min(x0, x3), -182, max(x1, x2) - min(x0, x3), 92, dark ? irD : ir, { lw: 2, hl: 0.3 });
        g.save(); g.clip(p);
        for (let r = 0; r < 7; r++) {
          const yy = -176 + r * 13;
          g.strokeStyle = rgba(shade(C.iron, -0.6), 0.9); g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(-90, yy + 10); g.lineTo(90, yy + 10); g.stroke();
          g.strokeStyle = rgba(C.ver, 0.4); g.lineWidth = 1;
          for (let c = -12; c < 12; c++) { const xx = c * 8 + (r % 2) * 4; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 9); g.stroke(); }
          g.strokeStyle = rgba('#ffffff', 0.12); g.beginPath(); g.moveTo(-90, yy + 1); g.lineTo(90, yy + 1); g.stroke();
        }
        g.restore();
      };
      skirtP(-50, -6, -16, -70, true); skirtP(-14, 52, 70, 4, false);
      // central apron with flame emblem
      const ap = new Path2D(); ap.moveTo(-18, -184); ap.lineTo(26, -184); ap.lineTo(32, -60); ap.lineTo(24, -40); ap.lineTo(16, -54); ap.lineTo(8, -32);
      ap.lineTo(0, -52); ap.lineTo(-8, -38); ap.lineTo(-14, -56); ap.lineTo(-24, -46); ap.closePath();
      paint(g, ap, -24, -184, 56, 152, pal(shade(C.cape, 0.12), C.rim, { l: shade(C.cape, 0.3) }), { lw: 2, hl: 0.25 });
      g.save(); g.clip(ap);
      g.strokeStyle = rgba(C.gold, 0.85); g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(-14, -176); g.lineTo(22, -176); g.lineTo(26, -70); g.moveTo(-14, -176); g.lineTo(-18, -70); g.stroke();
      // tide-wave sigil
      g.strokeStyle = rgba(C.ver, 0.8); g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(4, -120 + i * 18, 10 - i * 2, PI * 1.1, PI * 1.9); g.stroke(); }
      g.strokeStyle = rgba(shade(C.cape, -0.5), 0.8); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-6, -170); g.quadraticCurveTo(-8, -110, -10, -50); g.moveTo(16, -170); g.quadraticCurveTo(18, -110, 20, -50); g.stroke();
      g.restore();
      // torso
      const tor = smooth([[-56, -290], [0, -302], [60, -288], [68, -252], [50, -204], [32, -180], [-30, -180], [-52, -204], [-64, -252]]);
      paint(g, tor, -64, -302, 132, 122, ir, { lw: 2.4, hl: 0.4, rimW: 10 });
      g.save(); g.clip(tor);
      for (let i = 0; i < 10; i++) puff(g, (U.hash(i, 1, v) - 0.5) * 120, -190 - U.hash(i, 2, v) * 100, 8 + U.hash(i, 3) * 12, C.ver, 0.3);
      // plates
      g.strokeStyle = rgba(shade(C.iron, -0.65), 0.9); g.lineWidth = 2;
      g.beginPath(); g.moveTo(-50, -240); g.quadraticCurveTo(0, -226, 58, -242); g.stroke();
      g.beginPath(); g.moveTo(-44, -212); g.quadraticCurveTo(2, -200, 50, -214); g.stroke();
      g.strokeStyle = rgba(C.gold, 0.85); g.lineWidth = 2;
      g.beginPath(); g.moveTo(-50, -243); g.quadraticCurveTo(0, -229, 58, -245); g.stroke();
      g.restore();
      // heart mirror
      if (ph < 3) {
        const mr = new Path2D(); mr.arc(8, -258, 17, 0, TAU);
        paint(g, mr, -9, -275, 34, 34, gold, { lw: 2, hl: 0.5 });
        const mg = g.createRadialGradient(4, -262, 1, 8, -258, 13);
        mg.addColorStop(0, '#5a6a80'); mg.addColorStop(0.6, '#141a26'); mg.addColorStop(1, '#06080e');
        g.fillStyle = mg; g.beginPath(); g.arc(8, -258, 12, 0, TAU); g.fill();
      }
      // belt with lamp-flame plaque
      const belt = new Path2D(); belt.roundRect(-38, -192, 80, 14, 4);
      paint(g, belt, -38, -192, 80, 14, pal(shade(C.cape, 0.25), C.rim), { lw: 1.8 });
      const pl = new Path2D(); pl.ellipse(4, -185, 14, 11, 0, 0, TAU);
      paint(g, pl, -10, -196, 28, 22, gold, { lw: 1.8, hl: 0.5 });
      g.fillStyle = shade(C.gold, -0.55);
      g.beginPath(); g.moveTo(4, -193); g.quadraticCurveTo(10, -186, 4, -178); g.quadraticCurveTo(-2, -186, 4, -193); g.fill();
      // gorget
      const gor = new Path2D(); gor.moveTo(-26, -300); gor.quadraticCurveTo(4, -286, 34, -300); gor.lineTo(28, -316); gor.quadraticCurveTo(4, -306, -20, -316); gor.closePath();
      paint(g, gor, -26, -316, 60, 30, ir, { lw: 2 });
      // helmet & mask
      const hx = 6, hy = -334;
      const horn = (s, broken) => {
        const p = new Path2D();
        if (s < 0) { p.moveTo(hx - 14, hy - 14); p.bezierCurveTo(hx - 34, hy - 24, hx - 44, hy - 46, hx - 40, hy - (broken ? 46 : 70)); p.bezierCurveTo(hx - 34, hy - 46, hx - 26, hy - 32, hx - 6, hy - 22); }
        else { p.moveTo(hx + 8, hy - 20); p.bezierCurveTo(hx + 24, hy - 30, hx + 30, hy - 52, hx + 24, hy - (broken ? 54 : 74)); p.bezierCurveTo(hx + 38, hy - 52, hx + 34, hy - 26, hx + 18, hy - 12); }
        p.closePath();
        paint(g, p, hx - 44, hy - 74, 82, 64, pal(s < 0 ? shade(C.gold, -0.35) : C.gold, '#ffe0a0'), { lw: 1.8, hl: 0.4 });
      };
      horn(-1, ph >= 3); horn(1, false);
      const helm = smooth([[hx - 22, hy + 4], [hx - 24, hy - 14], [hx - 12, hy - 28], [hx + 8, hy - 30], [hx + 22, hy - 18], [hx + 24, hy + 2], [hx + 18, hy + 18], [hx - 14, hy + 18]]);
      paint(g, helm, hx - 24, hy - 30, 48, 48, ir, { lw: 2.2, hl: 0.5 });
      // crest ridge
      g.strokeStyle = C.gold; g.lineWidth = 3;
      g.beginPath(); g.moveTo(hx - 10, hy - 27); g.quadraticCurveTo(hx + 4, hy - 34, hx + 18, hy - 22); g.stroke();
      // mask (featureless, slit eyes, toothed jaw guard)
      const mask = smooth([[hx - 2, hy - 12], [hx + 20, hy - 14], [hx + 25, hy], [hx + 20, hy + 16], [hx + 4, hy + 20], [hx - 6, hy + 6]]);
      paint(g, mask, hx - 6, hy - 14, 31, 34, pal('#14161e', C.rim, { l: '#3a4050' }), { lw: 1.6, hl: 0.4 });
      g.fillStyle = '#04060a';
      g.beginPath(); g.moveTo(hx + 4, hy - 4); g.lineTo(hx + 22, hy - 6); g.lineTo(hx + 20, hy - 1); g.lineTo(hx + 5, hy); g.fill();
      g.fillStyle = C.gold;
      for (let i = 0; i < 5; i++) { const tx = hx + 2 + i * 4.5; g.beginPath(); g.moveTo(tx, hy + 8); g.lineTo(tx + 2.2, hy + 14); g.lineTo(tx + 4.4, hy + 8); g.fill(); }
      // cheek guards
      const ck = new Path2D(); ck.moveTo(hx - 20, hy); ck.quadraticCurveTo(hx - 24, hy + 18, hx - 10, hy + 26); ck.lineTo(hx - 4, hy + 6); ck.closePath();
      paint(g, ck, hx - 24, hy, 20, 26, irD, { lw: 1.6 });
      // pauldrons (layered)
      const paul = (cx, cy, s, dark) => {
        for (let i = 2; i >= 0; i--) {
          const p = new Path2D();
          const yy = cy + i * 12, w = 34 - i * 3;
          p.moveTo(cx - w, yy + 6); p.quadraticCurveTo(cx - w, yy - 22, cx, yy - 24); p.quadraticCurveTo(cx + w, yy - 22, cx + w, yy + 6);
          p.quadraticCurveTo(cx, yy - 4, cx - w, yy + 6); p.closePath();
          paint(g, p, cx - w, yy - 24, w * 2, 30, dark ? irD : ir, { lw: 2, hl: 0.45 });
          g.strokeStyle = rgba(C.gold, 0.8); g.lineWidth = 1.6;
          g.beginPath(); g.moveTo(cx - w + 3, yy + 3); g.quadraticCurveTo(cx, yy - 6, cx + w - 3, yy + 3); g.stroke();
        }
        // spikes
        for (let k = 0; k < 3; k++) {
          const sxp = cx - 18 + k * 18, syp = cy - 22 + (k === 1 ? -4 : 0);
          const sp = new Path2D(); sp.moveTo(sxp - 5, syp + 4); sp.lineTo(sxp + s * 4, syp - 18 - (k === 1 ? 6 : 0)); sp.lineTo(sxp + 5, syp + 4); sp.closePath();
          paint(g, sp, sxp - 5, syp - 24, 10, 28, pal(shade(C.iron, 0.1), C.rim), { lw: 1.4, hl: 0.3 });
        }
      };
      paul(-58, -280, -1, true);
      paul(64, -278, 1, false);
      // cracks
      if (ph >= 2) {
        g.lineCap = 'round';
        for (const cr of NG_CRACKS) {
          g.strokeStyle = '#05060a'; g.lineWidth = 3.4;
          g.beginPath(); cr.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
          g.strokeStyle = C.fire; g.lineWidth = 1.4; g.stroke();
        }
      }
      if (ph >= 3) {
        // shattered breastplate hole
        const hole = smooth([[-14, -284], [16, -290], [34, -268], [30, -236], [6, -222], [-20, -236], [-26, -262]]);
        g.fillStyle = '#04060c'; g.fill(hole);
        g.strokeStyle = shade(C.iron, 0.25); g.lineWidth = 3; g.stroke(hole);
        g.fillStyle = shade(C.iron, -0.4);
        for (let i = 0; i < 7; i++) {
          const a = i * TAU / 7, r1 = 26;
          g.beginPath(); g.moveTo(4 + cos(a) * r1, -256 + sin(a) * r1 * 0.9);
          g.lineTo(4 + cos(a + 0.2) * (r1 - 9), -256 + sin(a + 0.2) * (r1 - 9)); g.lineTo(4 + cos(a + 0.4) * r1, -256 + sin(a + 0.4) * r1 * 0.9); g.fill();
        }
      }
    });
  }
  function ngLamp(v) {
    const C = NGP[v];
    return spr('ng:lamp:' + v, 80, 100, 40, 50, (g) => {
      const ir = pal('#16171e', C.rim, { l: '#3a3c48', o: '#000000' });
      // roof
      const roof = new Path2D(); roof.moveTo(-28, -24); roof.quadraticCurveTo(-10, -28, 0, -42); roof.quadraticCurveTo(10, -28, 28, -24); roof.lineTo(20, -20); roof.lineTo(-20, -20); roof.closePath();
      paint(g, roof, -28, -42, 56, 22, ir, { lw: 1.8, hl: 0.5 });
      ball(g, 0, -45, 4, ir, { lw: 1.2 });
      g.lineWidth = 3; g.strokeStyle = '#2a2c36'; g.beginPath(); g.arc(0, -52, 5, 0, TAU); g.stroke();
      // hexagonal cage (frame only; fire drawn live behind)
      g.strokeStyle = '#000'; g.lineWidth = 6;
      const fr = new Path2D();
      for (const xx of [-19, -7, 7, 19]) { fr.moveTo(xx, -20); fr.lineTo(xx * 0.9, 24); }
      fr.moveTo(-19, -20); fr.lineTo(19, -20); fr.moveTo(-17, 2); fr.lineTo(17, 2);
      g.stroke(fr); g.strokeStyle = '#3a3c48'; g.lineWidth = 3; g.stroke(fr);
      // lattice
      g.strokeStyle = 'rgba(10,10,14,0.9)'; g.lineWidth = 1.4;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(-18, -14 + i * 4); g.lineTo(18, -10 + i * 4); g.stroke(); }
      const base = new Path2D(); base.moveTo(-22, 22); base.lineTo(22, 22); base.lineTo(14, 32); base.lineTo(-14, 32); base.closePath();
      paint(g, base, -22, 22, 44, 10, ir, { lw: 1.6 });
      g.strokeStyle = rgba(C.gold, 0.8); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(-26, -23); g.lineTo(26, -23); g.stroke();
    });
  }
  function ngArm(ctx, sx, sy, ex, ey, hx, hy, ir, C, fistA) {
    limb(ctx, sx, sy, ex, ey, 16, 13, ir, 2);
    limb(ctx, ex, ey, hx, hy, 13, 12, ir, 2);
    // vambrace bands
    for (const u of [0.3, 0.75]) {
      const bx = lerp(ex, hx, u), by = lerp(ey, hy, u), a = atan2(hy - ey, hx - ex);
      ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
      ctx.strokeStyle = shade(C.iron, -0.6); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
      ctx.strokeStyle = C.gold; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
    // elbow cop
    const ec = new Path2D(); const a = atan2(hy - ey, hx - ex) - atan2(ey - sy, ex - sx);
    ec.ellipse(ex, ey, 11, 9, atan2(ey - sy, ex - sx), 0, TAU);
    paint(ctx, ec, ex - 11, ey - 9, 22, 18, pal(shade(C.iron, 0.12), ir.rim), { lw: 1.8, hl: 0.5 });
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(ex, ey, 2.4, 0, TAU); ctx.fill();
    if (fistA != null) ngFist(ctx, hx, hy, ir, C);
    return a;
  }
  function ngFist(ctx, x, y, ir, C) {
    const p = new Path2D(); p.roundRect(x - 11, y - 12, 22, 24, 7);
    paint(ctx, p, x - 11, y - 12, 22, 24, ir, { lw: 2, hl: 0.5 });
    ctx.strokeStyle = rgba(C.gold, 0.85); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - 9, y - 3); ctx.lineTo(x + 9, y - 3); ctx.stroke();
    ctx.strokeStyle = shade(C.iron, -0.6); ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + 2 + i * 3, y + 1); ctx.lineTo(x + 2 + i * 3, y + 10); ctx.stroke(); }
  }
  def('nether_guardian', 260, 360, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = NGP[P.v], ph = P.ph;
    const A = poseParams(P,
      { st: 0.06 + sin(t * 1.2) * 0.03, lean: 0, dx: 0, fh: 0 },
      { st: -0.35, lean: -0.06, dx: -10, fh: 6 },
      { st: 0.95, lean: 0.12, dx: 34, fh: -6 },
      { st: -0.2, lean: -0.12, dx: -18, fh: 0 },
      { st: -0.05, lean: -0.03, dx: 0, fh: -46 });
    const fire = 0.8 + (ph - 1) * 0.35 + P.cp * 0.6;
    ctx.translate(x + A.dx + P.shake, y);
    ctx.scale(0.98, 0.98);
    // ground rune circle while casting / phase 3
    const rc = max(P.cast, ph === 3 ? 0.6 : 0);
    if (rc > 0.02) {
      ctx.save(); ctx.scale(1, 0.28); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(C.fire, 0.6 * rc); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 150, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 128, 0, TAU); ctx.stroke();
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12 + t * 0.3;
        ctx.beginPath(); ctx.moveTo(cos(a) * 128, sin(a) * 128); ctx.lineTo(cos(a + 0.2) * 150, sin(a + 0.2) * 150); ctx.stroke();
      }
      ctx.restore();
    }
    const breathe = sin(t * 1.2) * 1.5;
    ctx.translate(0, -150); ctx.rotate(A.lean); ctx.translate(0, 150);
    // cape behind
    const cw = (q) => sin(t * 1.5 + q) * 8;
    const capePts = [[-46, -296], [30, -300], [10, -250], [-20, -150], [-40 + cw(1), -60], [-60 + cw(1.5), -24], [-80 + cw(2), -44], [-96 + cw(2.5), -20],
      [-112 + cw(3), -52], [-124 + cw(3.5), -40], [-120 + cw(4), -120], [-96 + cw(4.5), -220], [-74, -280]];
    const capeP = poly(capePts);
    paint(ctx, capeP, -124, -300, 154, 280, pal(C.cape, C.rim, { l: shade(C.cape, 0.2) }), { lw: 2, hl: 0.15 });
    ctx.save(); ctx.clip(capeP);
    ctx.strokeStyle = rgba(C.capeIn, 0.9); ctx.lineWidth = 6;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-40 - i * 10, -280); ctx.quadraticCurveTo(-60 - i * 12 + cw(i), -150, -50 - i * 18 + cw(i + 1), -30); ctx.stroke(); }
    ctx.restore();
    if (ph >= 2) for (let i = 4; i < 12; i++) flame(ctx, capePts[i][0], capePts[i][1] + 6, 14, 24 + ph * 6, t, C.fire, C.core, i, 0.6 * fire);
    // back arm resting on planted sword
    const sx0 = -96, swTop = -190;
    ctx.save();
    const bl = new Path2D(); bl.moveTo(sx0 - 10, swTop + 26); bl.lineTo(sx0 + 10, swTop + 26); bl.lineTo(sx0 + 8, -6); bl.lineTo(sx0, 6); bl.lineTo(sx0 - 8, -6); bl.closePath();
    paint(ctx, bl, sx0 - 10, swTop + 26, 20, 180, pal(C.blade, C.rim, { l: shade(C.blade, 0.5) }), { lw: 1.8, hl: 0.5 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { const ry = swTop + 50 + i * 26; ctx.fillStyle = rgba(C.fire, 0.4 + 0.3 * sin(t * 3 + i)); ctx.fillRect(sx0 - 2, ry, 4, 12); }
    ctx.restore();
    const gd = new Path2D(); gd.roundRect(sx0 - 22, swTop + 20, 44, 8, 3);
    paint(ctx, gd, sx0 - 22, swTop + 20, 44, 8, pal(C.gold), { lw: 1.4 });
    limb(ctx, sx0, swTop + 20, sx0, swTop - 6, 4, 4, pal('#2a1a14'));
    ball(ctx, sx0, swTop - 8, 6, pal(C.gold), { lw: 1.2 });
    ctx.restore();
    const ir = pal(C.iron, C.rim, { l: shade(C.iron, 0.35) }), irD = pal(shade(C.iron, -0.3), C.rim, { l: shade(C.iron, 0.1) });
    ngArm(ctx, -58, -266, -88, -222, sx0 + 2, swTop - 8, irD, C, -0.2);
    // mane behind helmet
    ctx.fillStyle = shade(C.cape, -0.2);
    const mn = smooth([[0, -360], [-30 + cw(1) * 0.6, -350], [-70 + cw(2), -330], [-90 + cw(3), -300], [-60 + cw(2), -312], [-30, -318], [-6, -334]]);
    ctx.fill(mn); ctx.strokeStyle = rgba(C.rim, 0.3); ctx.lineWidth = 1; ctx.stroke(mn);
    // body
    ctx.translate(0, breathe * 0.5);
    put(ctx, ngBody(P.v, ph), 0, 0);
    // crack glow pulse
    if (ph >= 2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(C.fire, 0.35 + 0.25 * sin(t * 4)); ctx.lineWidth = 5;
      for (const cr of NG_CRACKS) { ctx.beginPath(); cr.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
      ctx.restore();
    }
    if (ph >= 3) {
      // soul-fire core
      for (let i = 0; i < 7; i++) {
        const a = t * 2 + i * TAU / 7;
        wisp(ctx, 4 + cos(a) * 12, -256 + sin(a) * 10, 2.4, C.fire, 0.9);
      }
      glow(ctx, 4, -256, 50, C.fire, 0.8 + 0.2 * sin(t * 7));
      glow(ctx, 4, -256, 18, C.core, 0.9);
    }
    // eyes
    const ea = 0.8 + 0.2 * sin(t * 4) + P.atk * 0.5 + P.cp * 0.5;
    ctx.fillStyle = rgba(C.core, min(1, ea));
    ctx.beginPath(); ctx.moveTo(10, -337); ctx.lineTo(27, -340); ctx.lineTo(25, -336); ctx.lineTo(11, -335); ctx.fill();
    glow(ctx, 20, -337, 22, C.fire, ea);
    // shoulder flames
    flame(ctx, 64, -300, 22, 36 + ph * 10, t, C.fire, C.core, 1, 0.45 * fire);
    flame(ctx, -58, -302, 20, 30 + ph * 10, t, C.fire, C.core, 2, 0.35 * fire);
    if (ph >= 2) flame(ctx, 4, -360, 18, 30 + ph * 8, t, C.fire, C.core, 4, 0.4 * fire);
    // front arm + staff + black lamp
    const shx = 64, shy = -266;
    const hx = 104, hy = -214 + A.fh;
    ngArm(ctx, shx, shy, shx + 30, shy + 30, hx - 4, hy + 2, ir, C, null);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(A.st);
    const staff = new Path2D(); staff.roundRect(-4, -150, 8, 360, 4);
    paint(ctx, staff, -4, -150, 8, 360, pal('#1c1a22', C.rim, { l: '#4a4652' }), { lw: 1.4 });
    // hook
    ctx.strokeStyle = '#2a2c36'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, -150); ctx.quadraticCurveTo(0, -172, 22, -170); ctx.quadraticCurveTo(34, -166, 30, -154); ctx.stroke();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.stroke();
    // lamp (swings slightly, counter to staff)
    ctx.save(); ctx.translate(30, -154); ctx.rotate(-A.st * 0.8 + sin(t * 1.6) * 0.06);
    ctx.strokeStyle = '#16161c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.stroke();
    ctx.translate(0, 74); ctx.scale(1.3, 1.3);
    // inner fire behind cage
    const lg = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
    lg.addColorStop(0, C.core); lg.addColorStop(0.4, C.fire); lg.addColorStop(1, '#04060c');
    ctx.fillStyle = lg; ctx.fillRect(-19, -20, 38, 44);
    flame(ctx, 0, 18, 22, 36, t, C.fire, C.core, 7, 1);
    put(ctx, ngLamp(P.v), 0, 0);
    glow(ctx, 0, 0, 70 * fire, C.fire, 0.55);
    flame(ctx, 0, -40, 22, 40 + ph * 10 + P.cp * 30, t, C.fire, C.core, 9, 0.85 * fire);
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.6 + i / 5) % 1;
      wisp(ctx, sin(t * 2 + i * 2) * 10 + k * 8, -50 - k * 70, 2, C.fire, (1 - k) * 0.8 * fire);
    }
    ctx.restore();
    ctx.restore();
    ngFist(ctx, hx, hy, ir, C);
    if (P.atk > 0.2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const tg = ctx.createRadialGradient(hx, hy, 60, hx, hy, 200);
      tg.addColorStop(0, rgba(C.fire, 0)); tg.addColorStop(0.75, rgba(C.fire, 0.4 * P.atk)); tg.addColorStop(1, rgba(C.fire, 0));
      ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.arc(hx, hy, 200, -PI * 0.5, -PI * 0.5 + 1.4 * P.atk); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  });

  // =============================================================================================
  // 霧精 fog_spirit — soft mist being, hollow eyes, trailing tendrils, dew sparkles
  // =============================================================================================
  const FGP = [
    { hi: '#f2f8fc', mid: '#b8cada', dk: '#5a6e88', eye: '#9ae8ff' },
    { hi: '#f0fff6', mid: '#a8d8c0', dk: '#3e6a5e', eye: '#a0ffd0' },
    { hi: '#fbf4ff', mid: '#cbb8e4', dk: '#5a4a7a', eye: '#f0b0ff' },
  ];
  def('fog_spirit', 140, 170, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = FGP[P.v];
    const A = poseParams(P, { dx: 0, rise: 0, sx: 1, arm: 0 }, { dx: -8, rise: 4, sx: 0.9, arm: -0.6 },
      { dx: 34, rise: -4, sx: 1.25, arm: 1 }, { dx: -14, rise: 0, sx: 0.85, arm: -0.4 }, { dx: 0, rise: 10, sx: 1.1, arm: 0.6 });
    ctx.translate(x + A.dx + P.shake, y); ctx.scale(1.15, 1.15);
    const fl = -18 + sin(t * 1.4) * 6 - A.rise;
    // ground haze
    mist(ctx, 0, -8, 120, 16, t, C.mid, 0.35, 6, 21);
    ctx.translate(0, fl);
    // tail tendrils
    for (let i = 0; i < 5; i++) {
      const sx = -20 + i * 10, len = 50 + i * 6;
      for (let k = 0; k < 7; k++) {
        const u = k / 6;
        const px = sx - u * 30 + sin(t * 2 + i + u * 3) * 8 * u, py = -40 + u * len * 0.6;
        puff(ctx, px, py, 16 * (1 - u * 0.7), k % 2 ? C.mid : C.dk, 0.35 * (1 - u * 0.6));
      }
    }
    // body: layered puffs (dark back → light front, light from top-left)
    const body = [];
    for (let i = 0; i < 16; i++) {
      const a = U.hash(i, 1, 7) * TAU, r = U.hash(i, 2, 7);
      const by = -100 + sin(a) * 46 * r, bx = cos(a) * 34 * r * A.sx;
      body.push([bx + sin(t * 1.1 + i) * 4, by + cos(t * 0.9 + i * 1.3) * 4, 24 + U.hash(i, 3, 7) * 20]);
    }
    for (const [bx, by, br] of body) puff(ctx, bx + 6, by + 6, br * 1.1, C.dk, 0.45);
    for (const [bx, by, br] of body) puff(ctx, bx, by, br, C.mid, 0.5);
    for (const [bx, by, br] of body) if (bx + by < -90) puff(ctx, bx - 4, by - 6, br * 0.8, C.hi, 0.45);
    // hood-like crown
    puff(ctx, -2, -140, 40, C.hi, 0.55);
    puff(ctx, -6, -146, 24, '#ffffff', 0.35);
    // wispy arms
    for (const s of [-1, 1]) {
      const ax = s > 0 ? 1 : 0.6;
      for (let k = 0; k < 6; k++) {
        const u = k / 5;
        const ang = (s > 0 ? 0.6 + A.arm * 0.8 : 2.6 - A.arm * 0.3) + sin(t * 1.5 + s) * 0.2;
        const px = s * 26 + cos(ang) * u * 46 * ax * s * (s > 0 ? 1 : -1), py = -96 + sin(ang) * u * 30 + sin(t * 2.2 + u * 4 + s) * 5;
        puff(ctx, px, py, 14 * (1 - u * 0.6), u > 0.5 ? C.hi : C.mid, 0.55);
      }
    }
    // inner glow core
    glow(ctx, 2, -100, 46, C.eye, 0.25 + 0.1 * sin(t * 2) + P.cp * 0.4);
    // hollow eyes (facing right)
    const blink = (t % 4.3) < 0.12 ? 0.2 : 1;
    for (const [ex, ey, s] of [[16, -128, 1], [-2, -127, 0.78]]) {
      ctx.fillStyle = rgba(C.dk, 0.85);
      ctx.beginPath(); ctx.ellipse(ex, ey, 5.5 * s, 8 * s * blink, -0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba('#0a1018', 0.75);
      ctx.beginPath(); ctx.ellipse(ex + 0.5, ey + 0.5, 3.6 * s, 6 * s * blink, -0.1, 0, TAU); ctx.fill();
      glow(ctx, ex + 1, ey - 1, 7 * s, C.eye, 0.7 * blink);
    }
    // small 'o' mouth
    ctx.fillStyle = rgba(C.dk, 0.6);
    ctx.beginPath(); ctx.ellipse(10, -110, 2.6, 3.4 + sin(t * 2) * 0.6 + P.atk * 3, 0, 0, TAU); ctx.fill();
    // dew sparkles
    for (let i = 0; i < 8; i++) {
      const k = (t * 0.3 + U.hash(i, 5)) % 1;
      const px = (U.hash(i, 6) - 0.5) * 110, py = -60 - U.hash(i, 7) * 110 - k * 20;
      const tw = sin(k * PI);
      glow(ctx, px, py, 6, C.eye, tw * 0.8);
    }
    if (P.atk > 0.2) {
      for (let i = 0; i < 6; i++) puff(ctx, 40 + i * 16 * P.atk, -100 + sin(i * 2) * 10, 22 - i * 2, C.hi, 0.4 * P.atk);
    }
    if (P.cast > 0.02) {
      for (let i = 0; i < 10; i++) {
        const a = t * 1.5 + i * TAU / 10;
        puff(ctx, cos(a) * 70, -100 + sin(a) * 30, 14, C.hi, 0.5 * P.cp);
      }
    }
  });

  // =============================================================================================
  // Tube renderer (serpentine bodies): cylindrical shading via offset ribbons, belly strip, rim
  // =============================================================================================
  function sampleCR(ctrl, per = 6) {
    const out = [], n = ctrl.length;
    const get = (i) => ctrl[clamp(i, 0, n - 1)];
    for (let i = 0; i < n - 1; i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let k = 0; k < per; k++) {
        const u = k / per, u2 = u * u, u3 = u2 * u;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(ctrl[n - 1].slice());
    return out;
  }
  function spineFrame(pts) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[max(0, i - 1)], b = pts[min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = hypot(dx, dy) || 1;
      out.push([dx / L, dy / L, -dy / L, dx / L]);
    }
    return out;
  }
  function ribbon(pts, fr, rf, of, i0 = 0, i1 = pts.length - 1, open = false) {
    const p = new Path2D();
    for (let i = i0; i <= i1; i++) {
      const r = rf(i), o = of(i), x = pts[i][0] + fr[i][2] * (o + r), y = pts[i][1] + fr[i][3] * (o + r);
      i > i0 ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    // rounded cap at the end
    const e = pts[i1], fe = fr[i1], re = rf(i1), oe = of(i1);
    p.arc(e[0] + fe[2] * oe, e[1] + fe[3] * oe, max(0.01, re), atan2(fe[3], fe[2]), atan2(fe[3], fe[2]) + PI, true);
    for (let i = i1; i >= i0; i--) {
      const r = rf(i), o = of(i);
      p.lineTo(pts[i][0] + fr[i][2] * (o - r), pts[i][1] + fr[i][3] * (o - r));
    }
    if (!open) p.closePath();
    return p;
  }
  // C: { b, l, d, o, belly?, rim?, hl? }   opt: { i0, i1, pattern(ctx, pts, fr, rad, i0, i1), lw }
  function tube(ctx, pts, rad, C, opt = {}) {
    const fr = opt.fr || spineFrame(pts);
    const i0 = opt.i0 ?? 0, i1 = opt.i1 ?? pts.length - 1;
    const dl = (i) => fr[i][2] * -0.6 + fr[i][3] * -0.8;
    const R = (i) => rad[i];
    const body = ribbon(pts, fr, R, () => 0, i0, i1);
    ctx.fillStyle = C.d; ctx.fill(body);
    ctx.save(); ctx.clip(body);
    ctx.fillStyle = C.b; ctx.fill(ribbon(pts, fr, (i) => rad[i] * 0.8, (i) => rad[i] * 0.28 * dl(i), i0, i1));
    if (C.belly) {
      ctx.fillStyle = C.belly; ctx.fill(ribbon(pts, fr, (i) => rad[i] * 0.42, (i) => rad[i] * 0.66, i0, i1));
    }
    ctx.fillStyle = C.l; ctx.globalAlpha = 0.85;
    ctx.fill(ribbon(pts, fr, (i) => rad[i] * 0.3, (i) => rad[i] * 0.5 * dl(i), i0, i1));
    ctx.globalAlpha = 1;
    if (opt.pattern) opt.pattern(ctx, pts, fr, rad, i0, i1);
    if (C.rim) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(C.rim, 0.38);
      ctx.fill(ribbon(pts, fr, (i) => rad[i] * 0.12, (i) => -rad[i] * 0.86 * clamp(dl(i) * 3, -1, 1), i0, i1));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.lineWidth = opt.lw ?? 2; ctx.strokeStyle = C.o;
    if (opt.noCap) {
      const sp = new Path2D();
      for (const sg of [1, -1]) for (let i = i0; i <= i1; i++) {
        const xx = pts[i][0] + fr[i][2] * rad[i] * sg, yy = pts[i][1] + fr[i][3] * rad[i] * sg;
        i > i0 ? sp.lineTo(xx, yy) : sp.moveTo(xx, yy);
      }
      ctx.stroke(sp);
    } else ctx.stroke(i0 > 0 ? ribbon(pts, fr, R, () => 0, i0, i1, true) : body);
    return { body, fr };
  }

  // =============================================================================================
  // 黑熊精 bear_spirit — Formosan black bear, white V chest mark, tide-sick dark aura
  // =============================================================================================
  const BRP = [
    { fur: '#1c1b22', furL: '#3e3842', furHi: '#7a6658', chest: '#f0e8d4', muz: '#b08e6c', aura: '#3affd8', dk: '#2a1a46', eye: '#8affe6' },
    { fur: '#241c18', furL: '#4a3a30', furHi: '#9a7a58', chest: '#f4ecd8', muz: '#c09a70', aura: '#a8ff5a', dk: '#243a16', eye: '#d0ff70' },
    { fur: '#18141e', furL: '#3a2c40', furHi: '#7a5a72', chest: '#ecdce8', muz: '#a88a8a', aura: '#ff4a8a', dk: '#401430', eye: '#ff7aa8' },
  ];
  function furStrokes(g, path, x0, y0, w, h, col, n, seed, len = 7) {
    g.save(); g.clip(path);
    g.strokeStyle = col; g.lineWidth = 1.1;
    for (let i = 0; i < n; i++) {
      const px = x0 + U.hash(i, 1, seed) * w, py = y0 + U.hash(i, 2, seed) * h;
      const lit = clamp(1 - ((px - x0) / w + (py - y0) / h) * 0.7, 0, 1);
      if (U.hash(i, 3, seed) > lit + 0.15) continue;
      g.globalAlpha = 0.25 + lit * 0.5;
      g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px - 1, py + len * 0.5, px + 1.5, py + len); g.stroke();
    }
    g.restore();
  }
  function brBody(v) {
    const C = BRP[v];
    return spr('br:body:' + v, 170, 190, 85, 180, (g) => {
      const fur = pal(C.fur, C.aura, { l: C.furL, o: '#060508' });
      const furD = pal(shade(C.fur, -0.3), C.aura, { l: shade(C.furL, -0.2), o: '#060508' });
      // hind legs
      const leg = (x0, dark) => {
        const p = tufted([[x0 - 20, -64], [x0 + 18, -66], [x0 + 22, -30], [x0 + 18, -6], [x0 - 18, -6], [x0 - 24, -34]], 3, 3, x0 + 40);
        paint(g, p, x0 - 24, -66, 46, 62, dark ? furD : fur, { lw: 2, rimA: 0.5 });
        const paw = new Path2D(); paw.ellipse(x0 + 4, -5, 22, 8, 0, 0, TAU);
        paint(g, paw, x0 - 18, -13, 44, 16, dark ? furD : fur, { lw: 2, hl: 0.2 });
        for (let k = 0; k < 4; k++) {
          const cx = x0 + 12 + k * 4.5;
          const cl = new Path2D(); cl.moveTo(cx - 2, -4); cl.quadraticCurveTo(cx + 5, -4, cx + 6, 2); cl.quadraticCurveTo(cx + 2, 0, cx - 2, 0); cl.closePath();
          g.fillStyle = '#e8e0d0'; g.fill(cl); g.strokeStyle = '#5a5048'; g.lineWidth = 0.8; g.stroke(cl);
        }
      };
      leg(-26, true); leg(22, false);
      // torso
      const tor = tufted([[-48, -40], [-58, -90], [-50, -130], [-30, -156], [2, -166], [30, -156], [48, -128], [50, -84], [40, -44], [0, -30]], 4.5, 3, 7);
      paint(g, tor, -58, -166, 108, 136, fur, { lw: 2.2, hl: 0.25, rimW: 7, rimA: 0.32 });
      furStrokes(g, tor, -58, -166, 108, 136, C.furHi, 220, 3 + v);
      // belly soft shade
      g.save(); g.clip(tor);
      const bg = g.createRadialGradient(8, -70, 4, 8, -70, 50);
      bg.addColorStop(0, rgba(C.furL, 0.45)); bg.addColorStop(1, rgba(C.furL, 0));
      g.fillStyle = bg; g.fillRect(-50, -130, 110, 100);
      g.restore();
      // white V (crescent) chest mark
      const vm = new Path2D();
      vm.moveTo(-18, -150); vm.quadraticCurveTo(-4, -132, 14, -112); vm.quadraticCurveTo(30, -130, 46, -150);
      vm.quadraticCurveTo(48, -140, 42, -130); vm.quadraticCurveTo(28, -112, 14, -94);
      vm.quadraticCurveTo(-2, -112, -16, -128); vm.quadraticCurveTo(-22, -140, -18, -150); vm.closePath();
      paint(g, vm, -14, -146, 58, 46, pal(C.chest, null, { o: shade(C.chest, -0.5), d: shade(C.chest, -0.25) }), { lw: 1.2, hl: 0.4 });
      g.strokeStyle = rgba(C.chest, 0.7); g.lineWidth = 1;
      for (let i = 0; i < 14; i++) {
        const u = i / 13, px = lerp(-12, 42, u), py = -140 + abs(u - 0.48) * -40 + 34;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + 1, py + 4); g.stroke();
      }
    });
  }
  function brHead(v, open) {
    const C = BRP[v];
    return spr('br:head:' + v + ':' + open, 110, 100, 50, 56, (g) => {
      const fur = pal(C.fur, C.aura, { l: C.furL, o: '#060508' });
      // ears
      for (const [ex, ey, s] of [[-22, -30, 0.85], [6, -36, 1]]) {
        const ear = new Path2D(); ear.arc(ex, ey, 11 * s, 0, TAU);
        paint(g, ear, ex - 11, ey - 11, 22, 22, fur, { lw: 1.8 });
        g.fillStyle = shade(C.furL, -0.1); g.beginPath(); g.arc(ex + 1, ey + 1, 5.5 * s, 0, TAU); g.fill();
      }
      const head = tufted([[-32, -10], [-26, -32], [-4, -40], [18, -34], [30, -18], [34, 4], [20, 22], [-10, 24], [-30, 12]], 3, 3, 11);
      paint(g, head, -34, -40, 68, 64, fur, { lw: 2, hl: 0.3, rimW: 8, rimA: 0.5 });
      furStrokes(g, head, -34, -40, 68, 64, C.furHi, 90, 13 + v, 5);
      // muzzle
      if (open) {
        const jaw = new Path2D(); jaw.moveTo(16, 10); jaw.quadraticCurveTo(40, 20, 52, 26); jaw.quadraticCurveTo(44, 34, 20, 26); jaw.closePath();
        paint(g, jaw, 16, 10, 36, 24, pal(C.muz, null, { o: shade(C.muz, -0.6) }), { lw: 1.6 });
        g.fillStyle = '#3a0c18'; g.beginPath(); g.moveTo(18, 6); g.lineTo(52, 6); g.lineTo(50, 24); g.quadraticCurveTo(30, 20, 18, 14); g.closePath(); g.fill();
        g.fillStyle = '#f4ece0';
        for (const [tx, ty, d] of [[24, 7, 1], [44, 7, 1], [26, 19, -1], [44, 23, -1]]) { g.beginPath(); g.moveTo(tx - 2.5, ty); g.lineTo(tx, ty + 6 * d); g.lineTo(tx + 2.5, ty); g.fill(); }
        g.fillStyle = '#c04a5a'; g.beginPath(); g.ellipse(32, 18, 8, 3, 0.2, 0, TAU); g.fill();
      }
      const mz = new Path2D();
      if (open) { mz.moveTo(10, -10); mz.quadraticCurveTo(36, -12, 52, -4); mz.quadraticCurveTo(56, 4, 52, 8); mz.quadraticCurveTo(30, 4, 14, 8); mz.closePath(); }
      else { mz.moveTo(10, -10); mz.quadraticCurveTo(36, -10, 48, 0); mz.quadraticCurveTo(52, 10, 44, 14); mz.quadraticCurveTo(26, 18, 12, 12); mz.closePath(); }
      paint(g, mz, 10, -12, 46, 30, pal(C.muz, null, { o: shade(C.muz, -0.6) }), { lw: 1.6, hl: 0.4 });
      // nose
      ball(g, open ? 52 : 47, open ? -3 : 0, 5, pal('#2a2224', null, { l: '#6a5a5a', o: '#000' }), { lw: 1, sx: 1.1 });
      if (!open) { g.strokeStyle = '#3a2a24'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(46, 5); g.quadraticCurveTo(42, 12, 34, 12); g.stroke(); }
      // eye sockets (glow drawn live)
      g.fillStyle = '#060508';
      g.beginPath(); g.ellipse(14, -16, 4.5, 3.2, -0.2, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(-6, -16, 3.2, 2.6, -0.1, 0, TAU); g.fill();
    });
  }
  function brArm(v, dark) {
    const C = BRP[v];
    return spr('br:arm:' + v + ':' + dark, 70, 110, 30, 14, (g) => {
      const fur = dark ? pal(shade(C.fur, -0.3), C.aura, { l: shade(C.furL, -0.2), o: '#060508' }) : pal(C.fur, C.aura, { l: C.furL, o: '#060508' });
      const a = tufted([[-16, -6], [14, -8], [18, 30], [16, 62], [-12, 64], [-18, 30]], 3, 3, 21 + dark);
      paint(g, a, -18, -8, 36, 72, fur, { lw: 2, rimA: 0.5 });
      furStrokes(g, a, -18, -8, 36, 72, C.furHi, 50, 30 + v + dark, 6);
      const paw = new Path2D(); paw.ellipse(2, 66, 16, 12, 0, 0, TAU);
      paint(g, paw, -14, 54, 32, 24, fur, { lw: 2 });
      for (let k = 0; k < 4; k++) {
        const cx = -8 + k * 6;
        const cl = new Path2D(); cl.moveTo(cx - 2, 74); cl.quadraticCurveTo(cx + 3, 84, cx + 7, 86); cl.quadraticCurveTo(cx + 3, 80, cx + 2, 74); cl.closePath();
        g.fillStyle = '#ece4d6'; g.fill(cl); g.strokeStyle = '#5a5048'; g.lineWidth = 0.8; g.stroke(cl);
      }
    });
  }
  def('bear_spirit', 170, 200, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = BRP[P.v];
    const A = poseParams(P,
      { fa: 0.35 + sin(t * 1.6) * 0.05, ba: -0.25 + sin(t * 1.6 + 1) * 0.05, lean: 0.04, dx: 0, hd: 0 },
      { fa: 2.7, ba: -0.8, lean: -0.12, dx: -8, hd: -0.15 },
      { fa: 1.0, ba: 0.2, lean: 0.24, dx: 30, hd: 0.15 },
      { fa: -0.2, ba: -0.6, lean: -0.2, dx: -14, hd: -0.25 },
      { fa: 2.2, ba: -2.0, lean: -0.05, dx: 0, hd: -0.2 });
    ctx.translate(x + A.dx + P.shake, y);
    const br = sin(t * 1.6) * 1.5;
    // tide-sick aura behind
    for (let i = 0; i < 10; i++) {
      const k = (t * 0.25 + U.hash(i, 1, 4)) % 1;
      const px = (U.hash(i, 2, 4) - 0.5) * 130 + sin(t + i) * 8, py = -30 - k * 170;
      puff(ctx, px, py, 26 + k * 22, C.dk, 0.7 * sin(k * PI));
      if (i % 2) wisp(ctx, px * 0.8, py + 20, 2, C.aura, 0.5 * sin(k * PI));
    }
    glow(ctx, 0, -100, 110, C.aura, 0.12 + P.cp * 0.25);
    ctx.translate(0, -60); ctx.rotate(A.lean); ctx.translate(0, 60);
    // back arm
    ctx.save(); ctx.translate(-28, -134 + br); ctx.rotate(-A.ba); put(ctx, brArm(P.v, 1), 0, 0); ctx.restore();
    ctx.save(); ctx.translate(0, br * 0.5); put(ctx, brBody(P.v), 0, 0); ctx.restore();
    // sickly glowing veins over the body
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(C.aura, 0.35 + 0.2 * sin(t * 2.4)); ctx.lineWidth = 1.4;
    for (const pth of [[[-40, -60], [-30, -80], [-36, -100], [-24, -118]], [[30, -60], [24, -76], [32, -92]], [[-10, -50], [-2, -66], [-8, -80]]]) {
      ctx.beginPath(); pth.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] + br) : ctx.moveTo(p[0], p[1] + br))); ctx.stroke();
    }
    ctx.restore();
    // head
    const open = P.atk > 0.15 || P.cast > 0.3 || P.hurt > 0.3;
    ctx.save(); ctx.translate(26, -166 + br); ctx.rotate(A.hd + sin(t * 1.6 + 0.5) * 0.03);
    put(ctx, brHead(P.v, open ? 1 : 0), 0, 0);
    const ea = 0.75 + 0.25 * sin(t * 3) + P.atk * 0.4;
    glow(ctx, 14, -16, 10, C.eye, ea); glow(ctx, -6, -16, 7, C.eye, ea * 0.8);
    ctx.fillStyle = rgba('#ffffff', 0.9);
    ctx.beginPath(); ctx.arc(15, -16.5, 1.4, 0, TAU); ctx.arc(-5.5, -16.3, 1, 0, TAU); ctx.fill();
    ctx.restore();
    // front arm
    ctx.save(); ctx.translate(34, -132 + br); ctx.rotate(-A.fa); put(ctx, brArm(P.v, 0), 0, 0); ctx.restore();
    if (P.atk > 0.3) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(C.aura, 0.6 * P.atk); ctx.lineWidth = 3 - i * 0.6;
        ctx.beginPath(); ctx.arc(60, -150, 60 + i * 8, -0.4, 1.1 * P.atk); ctx.stroke();
      }
      ctx.restore();
    }
    // dripping black tide
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.7 + U.hash(i, 8, 2)) % 1;
      const px = (U.hash(i, 9, 2) - 0.5) * 90, py = -110 + U.hash(i, 7, 2) * 70 + k * k * 60;
      ctx.fillStyle = rgba(C.dk, 0.9 * (1 - k));
      ctx.beginPath(); ctx.ellipse(px, py, 2.2, 3.4, 0, 0, TAU); ctx.fill();
      glow(ctx, px, py, 5, C.aura, 0.4 * (1 - k));
    }
  });

  // =============================================================================================
  // 百眼 hundred_eye — psychedelic fractal eye-mandala, counter-rotating rings, hue cycling
  // =============================================================================================
  function eyeDraw(ctx, x, y, w, h, rot, open, hue, look, t, olc) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const hh = max(0.6, h * open);
    const p = new Path2D(); p.moveTo(-w, 0); p.quadraticCurveTo(0, -hh * 2, w, 0); p.quadraticCurveTo(0, hh * 2, -w, 0); p.closePath();
    const sg = ctx.createRadialGradient(0, -hh * 0.3, 0, 0, 0, w);
    sg.addColorStop(0, '#fffaf4'); sg.addColorStop(1, hsl(hue + 40, 50, 78));
    ctx.fillStyle = sg; ctx.fill(p);
    if (open > 0.12) {
      ctx.save(); ctx.clip(p);
      const lx = (cos(-rot) * look[0] - sin(-rot) * look[1]) * w * 0.32, ly = (sin(-rot) * look[0] + cos(-rot) * look[1]) * h * 0.3;
      const ir = h * 0.92;
      const ig = ctx.createRadialGradient(lx, ly, 0, lx, ly, ir);
      ig.addColorStop(0, hsl(hue + 60, 100, 70)); ig.addColorStop(0.55, hsl(hue, 95, 52)); ig.addColorStop(1, hsl(hue - 40, 90, 22));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(lx, ly, ir, 0, TAU); ctx.fill();
      ctx.strokeStyle = hsl(hue + 180, 100, 75, 0.6); ctx.lineWidth = max(0.6, ir * 0.08);
      for (let i = 0; i < 8; i++) { const a = i * PI / 4 + t; ctx.beginPath(); ctx.moveTo(lx + cos(a) * ir * 0.4, ly + sin(a) * ir * 0.4); ctx.lineTo(lx + cos(a) * ir * 0.85, ly + sin(a) * ir * 0.85); ctx.stroke(); }
      ctx.fillStyle = '#07040c'; ctx.beginPath(); ctx.ellipse(lx, ly, ir * 0.36, ir * 0.42, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(lx - ir * 0.3, ly - ir * 0.35, ir * 0.18, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.strokeStyle = olc || hsl(hue - 30, 70, 20); ctx.lineWidth = max(1, w * 0.09); ctx.stroke(p);
    ctx.restore();
  }
  def('hundred_eye', 200, 250, (ctx, x, y, t, o) => {
    const P = pose(o, t);
    const H0 = [0, 130, 250][P.v];
    const A = poseParams(P, { dx: 0, ex: 1, spin: 1, sq: 0 }, { dx: -6, ex: 0.85, spin: 0.5, sq: 0.5 },
      { dx: 26, ex: 1.18, spin: 2.5, sq: 0 }, { dx: -12, ex: 0.9, spin: -1, sq: 1 }, { dx: 0, ex: 1.12, spin: 4, sq: 0 });
    const hue = H0 + t * 40 + P.cp * t * 120;
    const cy = -150 + sin(t * 1.3) * 6;
    ctx.translate(x + A.dx + P.shake, y);
    // dangling tendrils with tiny eyes
    for (let i = 0; i < 7; i++) {
      const bx = -36 + i * 12;
      ctx.strokeStyle = hsl(hue + i * 30, 80, 55, 0.7); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, cy + 40);
      const ex = bx + sin(t * 1.7 + i) * 12, ey = cy + 86 + (i % 3) * 10;
      ctx.quadraticCurveTo(bx + sin(t * 1.3 + i * 2) * 14, cy + 66, ex, ey); ctx.stroke();
      eyeDraw(ctx, ex, ey, 5, 3, 0, 0.8, hue + i * 40, [1, 0], t, null);
    }
    ctx.translate(0, cy); ctx.scale(A.ex, A.ex);
    hglow(ctx, 0, 0, 120, hue, 90, 55, 0.35 + P.cp * 0.3);
    // outer petals
    const rot0 = t * 0.25 * A.spin;
    for (let i = 0; i < 14; i++) {
      const a = rot0 + i * TAU / 14;
      ctx.save(); ctx.rotate(a);
      const p = new Path2D(); p.moveTo(54, 0); p.quadraticCurveTo(76, -17, 102 + sin(t * 2 + i) * 4, 0); p.quadraticCurveTo(76, 17, 54, 0); p.closePath();
      const g = ctx.createLinearGradient(52, 0, 98, 0);
      g.addColorStop(0, hsl(hue + i * 20, 90, 30)); g.addColorStop(0.6, hsl(hue + i * 20 + 40, 95, 58)); g.addColorStop(1, hsl(hue + i * 20 + 90, 100, 80));
      ctx.fillStyle = g; ctx.fill(p);
      ctx.strokeStyle = hsl(hue + i * 20 - 40, 80, 18); ctx.lineWidth = 1.4; ctx.stroke(p);
      eyeDraw(ctx, 80, 0, 7, 3.6, 0, 0.9, hue + i * 20 + 180, [cos(-a), sin(-a)], t, null);
      ctx.restore();
    }
    // fractal disc
    const dg = ctx.createRadialGradient(-14, -18, 4, 0, 0, 64);
    dg.addColorStop(0, hsl(hue + 200, 60, 30)); dg.addColorStop(0.7, hsl(hue + 240, 70, 14)); dg.addColorStop(1, hsl(hue + 260, 80, 8));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, 64, 0, TAU); ctx.fill();
    ctx.strokeStyle = hsl(hue + 60, 100, 70, 0.8); ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 3; r++) {
      const n = 6 + r * 3, rr = 22 + r * 14, a0 = (r % 2 ? -1 : 1) * t * 0.4 * A.spin;
      ctx.strokeStyle = hsl(hue + r * 70, 100, 60, 0.35); ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = a0 + i * TAU / n, b = a0 + (i + 0.5) * TAU / n;
        ctx.lineTo(cos(a) * rr, sin(a) * rr); ctx.lineTo(cos(b) * (rr + 8), sin(b) * (rr + 8));
      }
      ctx.stroke();
    }
    ctx.restore();
    const look = [1, 0.1];
    const blinkAt = (i) => { const k = (t * 0.6 + U.hash(i, 3, 9) * 7) % 5; return k < 0.15 ? abs(k - 0.075) / 0.075 : 1; };
    const sq = 1 - A.sq * 0.7;
    // ring 2 eyes
    for (let i = 0; i < 10; i++) {
      const a = -t * 0.35 * A.spin + i * TAU / 10;
      eyeDraw(ctx, cos(a) * 50, sin(a) * 50, 11, 6.2, a + PI / 2, blinkAt(i) * sq, hue + i * 30, look, t, null);
    }
    // ring 1 eyes
    for (let i = 0; i < 6; i++) {
      const a = t * 0.5 * A.spin + i * TAU / 6;
      eyeDraw(ctx, cos(a) * 31, sin(a) * 31, 9, 5.2, a + PI / 2, blinkAt(i + 20) * sq, hue + 180 + i * 50, look, t, null);
    }
    // central eye
    eyeDraw(ctx, 0, 0, 22, 13, 0, (0.85 + P.atk * 0.3) * (blinkAt(99) * 0.8 + 0.2) * sq + 0.05, hue + 90, look, t, hsl(hue + 90, 80, 18));
    if (P.atk > 0.25) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createLinearGradient(10, 0, 200, 0);
      bg.addColorStop(0, hsl(hue + 90, 100, 75, 0.8 * P.atk)); bg.addColorStop(1, hsl(hue + 180, 100, 60, 0));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(220, -26 * P.atk); ctx.lineTo(220, 26 * P.atk); ctx.lineTo(10, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (P.cast > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 3; r++) {
        const k = (P.st * 0.8 + r / 3) % 1;
        ctx.strokeStyle = hsl(hue + r * 120, 100, 65, (1 - k) * 0.6 * P.cast); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 70 + k * 70, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  });

  // =============================================================================================
  // 蛇影 serpent_shade — iridescent shadow serpent, coiled, head raised
  // =============================================================================================
  const SSP = [
    { b: '#1a1426', l: '#4a3a6a', d: '#07050c', o: '#04030a', belly: '#2a2238', h0: 170, eye: '#b8ff6a' },
    { b: '#0e1e1e', l: '#2e5a5a', d: '#030a0a', o: '#020606', belly: '#1a3030', h0: 100, eye: '#ffd84a' },
    { b: '#26101a', l: '#5a2a3e', d: '#0c0408', o: '#060205', belly: '#3a1a28', h0: 300, eye: '#7ae8ff' },
  ];
  function ssHead(v, open) {
    const C = SSP[v];
    return spr('ss:head:' + v + ':' + open, 90, 70, 26, 35, (g) => {
      const P2 = pal(C.b, '#a080ff', { l: C.l, d: C.d, o: C.o });
      if (open) {
        const jaw = new Path2D(); jaw.moveTo(-6, 4); jaw.quadraticCurveTo(20, 14, 44, 22); jaw.quadraticCurveTo(30, 24, 0, 14); jaw.closePath();
        paint(g, jaw, -6, 4, 50, 20, P2, { lw: 1.6 });
        g.fillStyle = '#3a0a2a'; g.beginPath(); g.moveTo(2, 2); g.lineTo(46, 0); g.lineTo(42, 18); g.quadraticCurveTo(18, 10, 2, 8); g.fill();
        g.fillStyle = '#f0ecf4';
        for (const [fx, fy, d] of [[38, 0, 1], [30, 0, 1]]) { g.beginPath(); g.moveTo(fx - 1.5, fy); g.lineTo(fx, fy + 9 * d); g.lineTo(fx + 1.5, fy); g.fill(); }
      }
      const hd = new Path2D();
      hd.moveTo(-18, -2); hd.bezierCurveTo(-16, -16, 4, -20, 20, -14); hd.bezierCurveTo(34, -10, 46, -6, 50, open ? -2 : 2);
      hd.bezierCurveTo(44, 8, 24, 10, 6, 10); hd.bezierCurveTo(-8, 12, -18, 8, -18, -2); hd.closePath();
      paint(g, hd, -18, -20, 68, 32, P2, { lw: 1.8, hl: 0.4, rimA: 0.7 });
      // scutes
      g.save(); g.clip(hd);
      g.strokeStyle = rgba(C.l, 0.6); g.lineWidth = 1;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-6 + i * 9, -14, 6, 0.3, PI - 0.3); g.stroke(); }
      g.restore();
      // brow ridge & eye socket
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(18, -6, 6, 4, -0.2, 0, TAU); g.fill();
      g.strokeStyle = C.l; g.lineWidth = 1.6; g.beginPath(); g.moveTo(10, -11); g.quadraticCurveTo(20, -14, 28, -9); g.stroke();
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(44, -2, 1.6, 1, 0, 0, TAU); g.fill();
    });
  }
  def('serpent_shade', 210, 170, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = SSP[P.v];
    const A = poseParams(P, { hx: 50, hy: -128, dx: 0, sw: 1 }, { hx: 10, hy: -140, dx: -6, sw: 0.4 },
      { hx: 120, hy: -84, dx: 16, sw: 0.3 }, { hx: 20, hy: -112, dx: -14, sw: 0.2 }, { hx: 40, hy: -152, dx: 0, sw: 1.6 });
    ctx.translate(x + A.dx + P.shake, y); ctx.scale(1.12, 1.12);
    // shadow trail
    mist(ctx, -10, -14, 170, 26, t, '#06040c', 0.5, 7, 41);
    const sw = (q, a) => sin(t * 1.6 + q) * a * A.sw;
    const ctrl = [[-92, -10], [-66, -4], [-26, -2], [16, -8], [40, -26], [24, -48], [-12, -52], [-44, -60], [-48, -86 + sw(1, 4)],
      [-10 + sw(2, 6), -104], [A.hx - 36 + sw(3, 6), A.hy + 4], [A.hx - 14, A.hy + 2], [A.hx, A.hy]];
    const pts = sampleCR(ctrl, 5);
    const n = pts.length;
    const rad = pts.map((_, i) => { const u = i / (n - 1); return u < 0.15 ? 2 + u / 0.15 * 12 : u > 0.85 ? lerp(15, 11, (u - 0.85) / 0.15) : 14 + sin(u * PI) * 3; });
    const hue = C.h0 + t * 25;
    const pattern = (c, p, fr, r, i0, i1) => {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = i0; i <= i1; i += 1) {
        const hh = hue + i * 7;
        const dl = fr[i][2] * -0.6 + fr[i][3] * -0.8;
        const sx2 = p[i][0] + fr[i][2] * r[i] * 0.45 * dl, sy2 = p[i][1] + fr[i][3] * r[i] * 0.45 * dl;
        const gg = c.createRadialGradient(sx2, sy2, 0, sx2, sy2, r[i] * 0.8);
        gg.addColorStop(0, hsl(hh, 95, 60, 0.22)); gg.addColorStop(1, hsl(hh, 95, 60, 0));
        c.fillStyle = gg; c.fillRect(sx2 - r[i], sy2 - r[i], r[i] * 2, r[i] * 2);
        if (i % 4 === 0) {
          const bx = p[i][0] - fr[i][2] * r[i] * 0.35, by = p[i][1] - fr[i][3] * r[i] * 0.35, s = r[i] * 0.4;
          c.fillStyle = hsl(hh + 60, 100, 65, 0.6 + 0.3 * sin(t * 3 - i * 0.3));
          c.beginPath(); c.moveTo(bx + fr[i][0] * s, by + fr[i][1] * s); c.lineTo(bx + fr[i][2] * s * 0.5, by + fr[i][3] * s * 0.5);
          c.lineTo(bx - fr[i][0] * s, by - fr[i][1] * s); c.lineTo(bx - fr[i][2] * s * 0.5, by - fr[i][3] * s * 0.5); c.fill();
        }
      }
      c.restore();
    };
    const TC = { b: C.b, l: C.l, d: C.d, o: C.o, belly: C.belly, rim: '#b090ff' };
    const fr = spineFrame(pts);
    const split = floor(n * 0.42);
    tube(ctx, pts, rad, TC, { fr, i0: 0, i1: split + 1, pattern, noCap: true });
    tube(ctx, pts, rad, TC, { fr, i0: split, i1: n - 1, pattern });
    // head
    const hd = fr[n - 1], ang = atan2(hd[1], hd[0]);
    const open = P.atk > 0.2 || P.cast > 0.3 || P.hurt > 0.4;
    ctx.save(); ctx.translate(A.hx - 4, A.hy); ctx.rotate(ang * 0.6); ctx.scale(1.35, 1.35);
    // tongue flick
    const tf = ((t * 0.8) % 2.2);
    if (tf < 0.35 || open) {
      const L2 = open ? 18 : sin(tf / 0.35 * PI) * 16;
      ctx.strokeStyle = '#ff4a7a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(46, 4); ctx.lineTo(46 + L2, 5); ctx.lineTo(50 + L2, 2); ctx.moveTo(46 + L2, 5); ctx.lineTo(50 + L2, 8); ctx.stroke();
    }
    put(ctx, ssHead(P.v, open ? 1 : 0), 0, 0);
    const ea = 0.8 + 0.2 * sin(t * 5) + P.atk * 0.5;
    ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(18.5, -6, 3.6, 2.6, -0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(19, -6, 0.9, 2.4, 0, 0, TAU); ctx.fill();
    glow(ctx, 18.5, -6, 12, C.eye, ea * 0.8);
    ctx.restore();
    if (P.cast > 0.02) {
      for (let i = 0; i < 8; i++) {
        const a = t * 2 + i * TAU / 8;
        hglow(ctx, A.hx + cos(a) * 34, A.hy + sin(a) * 34, 12, hue + i * 45, 100, 60, P.cp * 0.8);
      }
    }
  });

  // =============================================================================================
  // 心魔 inner_demon — dark shimmering mirror-silhouette of a person, cracked-glass light
  // =============================================================================================
  const IDP = [
    { a: '#141a34', b: '#2a3a6a', glint: '#c8e0ff', h0: 220 },
    { a: '#2a0e18', b: '#5a1a2e', glint: '#ffd0d8', h0: 340 },
    { a: '#0a2420', b: '#1a4a40', glint: '#d0fff0', h0: 160 },
  ];
  let ID_PARTS = null;
  function idParts() {
    if (ID_PARTS) return ID_PARTS;
    const head = new Path2D(); head.ellipse(4, -156, 11, 13.5, 0.1, 0, TAU);
    const knot = new Path2D(); knot.ellipse(-1, -171, 5.5, 4.5, 0, 0, TAU);
    const tail = smooth([[-6, -166], [-18, -161], [-30, -147], [-37, -128], [-31, -131], [-22, -146], [-10, -155]]);
    const body = smooth([[8, -143], [20, -137], [25, -127], [21, -110], [18, -93], [22, -80], [30, -52], [36, -30], [42, -6], [50, 0], [26, 0], [20, -24],
      [6, -46], [-8, -28], [-16, -3], [-34, 0], [-28, -8], [-22, -36], [-25, -60], [-20, -84], [-16, -100], [-20, -118], [-22, -131], [-12, -139], [-2, -143]]);
    const arm = capsule(-17, -128, -27, -88, 7.5, 5.5);
    const sash = smooth([[-14, -96], [-30, -90], [-46, -74], [-40, -71], [-26, -84]]);
    ID_PARTS = [tail, sash, arm, body, head, knot];
    return ID_PARTS;
  }
  function idMask(key, col) {
    return spr('id:mask:' + key, 170, 214, 85, 200, (g) => { g.fillStyle = col; for (const p of idParts()) g.fill(p); });
  }
  let ID_L = null;
  function idLayer() {
    if (!ID_L || ID_L.s !== G.S) { ID_L = U.makeCanvas(170, 214); ID_L.s = G.S; ID_L.ax = 85; ID_L.ay = 200; }
    return ID_L;
  }
  const ID_CRACKS = [[[6, -168], [1, -152], [9, -138], [3, -116], [10, -92]], [[3, -116], [-12, -104], [-18, -84]], [[9, -138], [21, -124]],
    [[10, -92], [1, -70], [8, -50], [-6, -24]], [[1, -70], [22, -56], [30, -30]], [[-12, -104], [-20, -116]], [[8, -50], [18, -40]]];
  def('inner_demon', 110, 190, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = IDP[P.v];
    const A = poseParams(P,
      { fa: 0.5 + sin(t * 1.5) * 0.05, wa: 2.1, lean: 0, dx: 0, sh: 1 },
      { fa: 2.8, wa: 3.4, lean: -0.08, dx: -6, sh: 1.4 },
      { fa: 1.45, wa: 1.5, lean: 0.14, dx: 34, sh: 1.8 },
      { fa: 0.1, wa: 2.4, lean: -0.16, dx: -14, sh: 0.4 },
      { fa: 2.4, wa: 2.8, lean: 0, dx: 0, sh: 2.2 });
    const hue = C.h0 + sin(t * 0.7) * 30;
    ctx.translate(x + A.dx + P.shake, y);
    ctx.save(); ctx.scale(1, 0.22); hglow(ctx, 0, 0, 70, hue, 70, 50, 0.35); ctx.restore();
    const bob = sin(t * 1.5) * 1.5;
    ctx.translate(0, bob);
    ctx.translate(0, -60); ctx.rotate(A.lean); ctx.translate(0, 60);
    // compose the mirror body on a scratch layer
    const L = idLayer(), g = L.getContext('2d');
    g.setTransform(G.S, 0, 0, G.S, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.clearRect(0, 0, 170, 214);
    put(g, idMask('k', '#000'), 85, 200);
    g.translate(85, 200);
    g.globalCompositeOperation = 'source-atop';
    const bg = g.createLinearGradient(-30, -175, 30, 0);
    bg.addColorStop(0, C.b); bg.addColorStop(0.5, C.a); bg.addColorStop(1, '#030308');
    g.fillStyle = bg; g.fillRect(-85, -200, 170, 214);
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.25 * A.sh + i * 0.27) % 1.4) - 0.2;
      const bx = -70 + k * 150;
      const sg = g.createLinearGradient(bx - 14, 0, bx + 14, 0);
      sg.addColorStop(0, hsl(hue + i * 50, 80, 70, 0)); sg.addColorStop(0.5, hsl(hue + i * 50, 80, 70, 0.32)); sg.addColorStop(1, hsl(hue + i * 50, 80, 70, 0));
      g.save(); g.translate(bx, -90); g.rotate(0.5); g.fillStyle = sg; g.fillRect(-14, -150, 28, 300); g.restore();
    }
    for (let i = 0; i < 12; i++) {
      const fx = (U.hash(i, 1, 5) - 0.5) * 70, fy = -165 + U.hash(i, 2, 5) * 160;
      g.fillStyle = hsl(hue + i * 30, 70, 65, 0.07 + 0.07 * sin(t * 2 + i));
      g.beginPath(); g.moveTo(fx, fy - 13); g.lineTo(fx + 11, fy + 4); g.lineTo(fx - 7, fy + 11); g.closePath(); g.fill();
    }
    ID_CRACKS.forEach((cr, j) => {
      g.beginPath(); cr.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.strokeStyle = hsl(hue + j * 25, 100, 60, 0.3); g.lineWidth = 5; g.stroke();
      g.strokeStyle = hsl(hue + j * 25 + t * 30, 100, 88, 0.7 + 0.3 * sin(t * 3 + j)); g.lineWidth = 1.3; g.stroke();
    });
    // afterimages, outline & prismatic rim, then the body
    for (let k = 2; k >= 1; k--) {
      ctx.save(); ctx.globalAlpha = 0.2 / k; put(ctx, idMask('ai' + P.v, C.b), -k * 7 + sin(t * 2 + k) * 3, 0); ctx.restore();
    }
    const om = idMask('o' + P.v, shade(C.a, -0.5));
    for (const [ox, oy] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) put(ctx, om, ox, oy);
    ctx.save(); ctx.globalAlpha = 0.85; put(ctx, idMask('r' + P.v, C.glint), 2, 1.6); ctx.restore();
    put(ctx, L, 0, 0);
    // eyes
    const ea = 0.8 + 0.2 * sin(t * 4) + P.atk * 0.5;
    ctx.fillStyle = rgba('#ffffff', min(1, ea));
    ctx.beginPath(); ctx.ellipse(11, -157, 3, 1, -0.1, 0, TAU); ctx.ellipse(2.5, -156, 2.1, 0.9, -0.1, 0, TAU); ctx.fill();
    glow(ctx, 11, -157, 10, C.glint, ea);
    // front arm + mirrored weapon
    const sx = 17, sy = -130;
    const ex = sx + sin(A.fa) * 22, ey = sy + cos(A.fa) * 22;
    const hx = ex + sin(A.fa + 0.4) * 20, hy = ey + cos(A.fa + 0.4) * 20;
    const armP = pal(C.a, C.glint, { l: C.b, o: shade(C.a, -0.5) });
    limb(ctx, sx, sy, ex, ey, 6.5, 5.5, armP, 1.6); limb(ctx, ex, ey, hx, hy, 5.5, 4.5, armP, 1.6);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-A.wa + PI / 2);
    const spear = P.v === 1;
    const len = spear ? 120 : 76;
    const wp = new Path2D();
    if (spear) { wp.rect(-30, -1.6, len, 3.2); wp.moveTo(len - 30, -5); wp.lineTo(len - 8, 0); wp.lineTo(len - 30, 5); wp.closePath(); }
    else { wp.moveTo(6, -3); wp.lineTo(len, -1); wp.lineTo(len + 8, 1); wp.lineTo(6, 3); wp.closePath(); wp.rect(-8, -2, 14, 4); wp.rect(4, -6, 3, 12); }
    const wg = ctx.createLinearGradient(0, 0, len, 0);
    wg.addColorStop(0, '#0a0a14'); wg.addColorStop(0.5, hsl(hue + 30, 60, 30)); wg.addColorStop(1, hsl(hue + 60, 90, 75));
    ctx.fillStyle = wg; ctx.fill(wp); ctx.strokeStyle = hsl(hue + 60, 100, 80, 0.8); ctx.lineWidth = 1; ctx.stroke(wp);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hsl(hue + 90, 100, 80, 0.4 + 0.3 * sin(t * 4)); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.restore();
    ball(ctx, hx, hy, 5, armP, { lw: 1.2, spec: false });
    for (let i = 0; i < 9; i++) {
      const k = (t * 0.22 + U.hash(i, 4, 6)) % 1;
      const px = (U.hash(i, 5, 6) - 0.4) * 80 - k * 30, py = -40 - U.hash(i, 6, 6) * 120 - k * 40;
      ctx.save(); ctx.translate(px, py); ctx.rotate(t * (1 + i * 0.2) + i);
      ctx.globalAlpha = sin(k * PI) * 0.9;
      ctx.fillStyle = hsl(hue + i * 30, 80, 70, 0.7);
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 3); ctx.lineTo(-3, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    if (P.cast > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const a = t * 1.2 + i * TAU / 6;
        ctx.strokeStyle = hsl(hue + i * 60, 100, 70, 0.6 * P.cp); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cos(a) * 30, -90 + sin(a) * 60); ctx.lineTo(cos(a) * 60, -90 + sin(a) * 100); ctx.stroke();
      }
      ctx.restore();
      hglow(ctx, 0, -90, 90, hue, 80, 60, 0.3 * P.cp);
    }
  });

  // =============================================================================================
  // 蛟 jiao — jade lake dragon (young, hornless-ish) rising from mist
  // =============================================================================================
  const JIP = [
    { b: '#2f8a6a', l: '#7ad8a8', d: '#14453a', o: '#0c2c26', belly: '#e6d49a', fin: '#9af0d0', gold: '#e8c060', eye: '#ffe080', mist: '#cfe8e0', pearl: '#f0fff8' },
    { b: '#2a6a8a', l: '#7ac0e8', d: '#123048', o: '#0a1e30', belly: '#e0e0c0', fin: '#a0d8ff', gold: '#d8d0a0', eye: '#a0f0ff', mist: '#d0e0ec', pearl: '#e8f6ff' },
    { b: '#5a3a7a', l: '#b08ae0', d: '#2a1a40', o: '#1a1028', belly: '#f0c8a0', fin: '#e0b0ff', gold: '#f0b060', eye: '#ff9a6a', mist: '#e0d4ec', pearl: '#fff0f8' },
  ];
  function jiHead(v, open) {
    const C = JIP[v];
    return spr('ji:head:' + v + ':' + open, 150, 110, 58, 58, (g) => {
      const P2 = pal(C.b, C.fin, { l: C.l, d: C.d, o: C.o });
      // frill / mane fins behind
      for (let i = 0; i < 4; i++) {
        const f = new Path2D();
        f.moveTo(-10 + i * 5, -6); f.quadraticCurveTo(-36 - i * 4, -30 + i * 12, -46 - i * 2, -18 + i * 14); f.quadraticCurveTo(-26, -4 + i * 6, -6 + i * 4, 4);
        f.closePath();
        const fg = g.createLinearGradient(-46, 0, 0, 0);
        fg.addColorStop(0, rgba(C.fin, 0.2)); fg.addColorStop(1, rgba(C.fin, 0.85));
        g.fillStyle = fg; g.fill(f); g.strokeStyle = rgba(C.o, 0.6); g.lineWidth = 1; g.stroke(f);
      }
      // horns (young, backswept)
      for (const [hx, hy, s] of [[-2, -18, 0.8], [8, -20, 1]]) {
        const h = new Path2D(); h.moveTo(hx, hy); h.quadraticCurveTo(hx - 16 * s, hy - 14 * s, hx - 30 * s, hy - 16 * s); h.quadraticCurveTo(hx - 14 * s, hy - 6 * s, hx + 6, hy + 2); h.closePath();
        paint(g, h, hx - 30, hy - 16, 36, 18, pal(s < 1 ? shade(C.gold, -0.3) : C.gold, '#fff'), { lw: 1.2, hl: 0.5 });
      }
      if (open) {
        const jaw = new Path2D(); jaw.moveTo(4, 8); jaw.quadraticCurveTo(40, 22, 70, 30); jaw.quadraticCurveTo(66, 36, 50, 34); jaw.quadraticCurveTo(20, 28, 0, 16); jaw.closePath();
        paint(g, jaw, 0, 8, 70, 28, pal(C.belly, null, { o: C.o }), { lw: 1.6 });
        g.fillStyle = '#5a1020'; g.beginPath(); g.moveTo(8, 6); g.lineTo(76, 4); g.lineTo(68, 28); g.quadraticCurveTo(36, 20, 8, 12); g.fill();
        g.fillStyle = '#fbf6ea';
        for (let i = 0; i < 6; i++) { const tx = 26 + i * 8; g.beginPath(); g.moveTo(tx - 2, 5); g.lineTo(tx, 11); g.lineTo(tx + 2, 5); g.fill(); }
      }
      const hd = new Path2D();
      hd.moveTo(-14, 6); hd.bezierCurveTo(-18, -14, 0, -26, 20, -20); hd.bezierCurveTo(36, -16, 50, -12, 70, -10);
      hd.bezierCurveTo(82, -8, 86, open ? -2 : 2, 80, open ? 4 : 10); hd.bezierCurveTo(60, open ? 6 : 16, 30, 18, 10, 18); hd.bezierCurveTo(-4, 18, -12, 14, -14, 6); hd.closePath();
      paint(g, hd, -18, -26, 104, 44, P2, { lw: 2, hl: 0.45 });
      g.save(); g.clip(hd);
      // scale texture
      g.strokeStyle = rgba(C.d, 0.6); g.lineWidth = 1;
      for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { g.beginPath(); g.arc(-8 + c * 9 + (r % 2) * 4.5, -16 + r * 7, 4, 0.2, PI - 0.2); g.stroke(); }
      // lower lip pale
      g.fillStyle = rgba(C.belly, 0.8); g.beginPath(); g.ellipse(40, open ? 8 : 16, 40, 5, 0, 0, TAU); g.fill();
      g.restore();
      // brow ridge, nostril, eye socket
      g.fillStyle = C.d; g.beginPath(); g.ellipse(26, -10, 9, 6, -0.15, 0, TAU); g.fill();
      g.strokeStyle = C.gold; g.lineWidth = 2.4; g.beginPath(); g.moveTo(14, -18); g.quadraticCurveTo(28, -24, 40, -15); g.stroke();
      g.fillStyle = C.o; g.beginPath(); g.ellipse(74, -5, 3, 1.6, -0.3, 0, TAU); g.fill();
      // chin barbel tuft
      g.strokeStyle = C.fin; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(12 + i * 3, 17); g.quadraticCurveTo(10 + i * 2, 28, 4 + i * 3, 34); g.stroke(); }
    });
  }
  def('jiao', 270, 270, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = JIP[P.v];
    const A = poseParams(P, { hx: 70, hy: -222, dx: 0, sw: 1, cl: 0.4 }, { hx: 30, hy: -238, dx: -8, sw: 0.5, cl: 1.2 },
      { hx: 140, hy: -170, dx: 20, sw: 0.3, cl: -0.4 }, { hx: 40, hy: -200, dx: -16, sw: 0.3, cl: 0.8 }, { hx: 60, hy: -250, dx: 0, sw: 1.4, cl: 1.4 });
    ctx.translate(x + A.dx + P.shake, y);
    const sw = (q, a) => sin(t * 1.2 + q) * a * A.sw;
    // water/mist base
    mist(ctx, -20, -20, 200, 24, t, C.mist, 0.1, 6, 51);
    const ctrl = [[-130, -40], [-100, -70 + sw(0, 6)], [-60, -60 + sw(1, 8)], [-20, -90 + sw(2, 8)], [-40, -140 + sw(3, 8)], [-20, -180 + sw(4, 6)],
      [20, -196 + sw(5, 6)], [A.hx - 40, A.hy + 22], [A.hx - 12, A.hy + 4], [A.hx, A.hy]];
    const pts = sampleCR(ctrl, 6), n = pts.length, fr = spineFrame(pts);
    const rad = pts.map((_, i) => { const u = i / (n - 1); return u < 0.2 ? 5 + u / 0.2 * 18 : u > 0.88 ? lerp(24, 17, (u - 0.88) / 0.12) : 23 + sin(u * PI) * 5; });
    // dorsal fin spikes (on back side = -normal)
    const fins = () => {
      for (let i = 4; i < n - 4; i += 2) {
        const p = pts[i], f = fr[i], r = rad[i];
        const bx = p[0] - f[2] * r * 0.9, by = p[1] - f[3] * r * 0.9;
        const hgt = 12 + sin(i * 0.7) * 3;
        const tx = bx - f[2] * hgt - f[0] * 8, ty = by - f[3] * hgt - f[1] * 8;
        const fp = new Path2D(); fp.moveTo(bx + f[0] * 6, by + f[1] * 6); fp.quadraticCurveTo(tx + f[0] * 4, ty + f[1] * 4, tx, ty); fp.lineTo(bx - f[0] * 6, by - f[1] * 6); fp.closePath();
        ctx.fillStyle = rgba(C.fin, 0.75); ctx.fill(fp); ctx.strokeStyle = rgba(C.o, 0.8); ctx.lineWidth = 1; ctx.stroke(fp);
      }
    };
    fins();
    const pattern = (c, p, f, r, i0, i1) => {
      c.strokeStyle = rgba(C.d, 0.55); c.lineWidth = 1;
      for (let i = i0; i <= i1; i += 2) {
        for (let j = -2; j <= 1; j++) {
          const off = j * r[i] * 0.38 + (i % 4 ? r[i] * 0.19 : 0);
          const cx = p[i][0] + f[i][2] * off, cy = p[i][1] + f[i][3] * off;
          const a = atan2(f[i][1], f[i][0]);
          c.beginPath(); c.arc(cx, cy, r[i] * 0.22, a + PI / 2 + 0.3, a + PI * 1.5 - 0.3); c.stroke();
        }
        // belly plates
        const bx = p[i][0] + f[i][2] * r[i] * 0.66, by = p[i][1] + f[i][3] * r[i] * 0.66;
        c.strokeStyle = rgba(shade(C.belly, -0.4), 0.7);
        c.beginPath(); c.moveTo(bx - f[i][2] * r[i] * 0.4, by - f[i][3] * r[i] * 0.4); c.lineTo(bx + f[i][2] * r[i] * 0.4, by + f[i][3] * r[i] * 0.4); c.stroke();
        c.strokeStyle = rgba(C.d, 0.55);
      }
      // pearlescent shimmer
      c.save(); c.globalCompositeOperation = 'lighter';
      const k = (t * 0.4) % 1, i = floor(lerp(i0, i1, k));
      if (p[i]) { const gg = c.createRadialGradient(p[i][0], p[i][1], 0, p[i][0], p[i][1], 40); gg.addColorStop(0, rgba(C.l, 0.35)); gg.addColorStop(1, rgba(C.l, 0)); c.fillStyle = gg; c.fillRect(p[i][0] - 40, p[i][1] - 40, 80, 80); }
      c.restore();
    };
    const TC = { b: C.b, l: C.l, d: C.d, o: C.o, belly: C.belly, rim: C.fin };
    const split = floor(n * 0.45);
    tube(ctx, pts, rad, TC, { fr, i0: 0, i1: split + 1, pattern, noCap: true });
    // back claw near lower body
    // front of mist around the lower coils
    mist(ctx, -90, -24, 110, 20, t + 3, C.mist, 0.14, 5, 52);
    tube(ctx, pts, rad, TC, { fr, i0: split, i1: n - 1, pattern });
    // front claw
    const ci = floor(n * 0.78), cp = pts[ci], cf = fr[ci];
    const cbx = cp[0] + cf[2] * rad[ci] * 0.7, cby = cp[1] + cf[3] * rad[ci] * 0.7;
    const cex = cbx + 18, cey = cby + 14 + A.cl * 6, chx = cex + 14 + A.cl * 4, chy = cey - 4 - A.cl * 10;
    const limbP = pal(C.b, C.fin, { l: C.l, d: C.d, o: C.o });
    limb(ctx, cbx, cby, cex, cey, 7, 5, limbP, 1.6); limb(ctx, cex, cey, chx, chy, 5, 4, limbP, 1.6);
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) { const a = -0.9 + k * 0.5; ctx.beginPath(); ctx.moveTo(chx, chy); ctx.quadraticCurveTo(chx + cos(a) * 8, chy + sin(a) * 8, chx + cos(a + 0.4) * 11, chy + sin(a + 0.4) * 11); ctx.stroke(); }
    // pearl
    const pa = t * 1.1;
    const px = chx + 22 + cos(pa) * 6, py = chy - 18 + sin(pa) * 5;
    glow(ctx, px, py, 26, C.pearl, 0.6 + P.cp * 0.4);
    ball(ctx, px, py, 6, pal(C.pearl, C.fin), { lw: 1 });
    // head
    const hf = fr[n - 1];
    const open = P.atk > 0.2 || P.cast > 0.3;
    ctx.save(); ctx.translate(A.hx - 8, A.hy); ctx.rotate(atan2(hf[1], hf[0]) * 0.5); ctx.scale(1.3, 1.3);
    // whiskers (live, flowing back)
    ctx.strokeStyle = rgba(C.gold, 0.9); ctx.lineWidth = 1.5;
    for (const [sx2, sy2, d] of [[72, -4, 1], [66, 0, 0.8]]) {
      ctx.beginPath(); ctx.moveTo(sx2, sy2);
      ctx.bezierCurveTo(sx2 + 14, sy2 + 8, sx2 - 10, sy2 + 28 + sin(t * 1.6 + d) * 8, sx2 - 56 * d, sy2 + 22 + sin(t * 1.3 + d * 3) * 12);
      ctx.stroke();
    }
    put(ctx, jiHead(P.v, open ? 1 : 0), 0, 0);
    const ea = 0.8 + 0.2 * sin(t * 3) + P.atk * 0.5;
    ctx.fillStyle = C.eye; ctx.beginPath(); ctx.ellipse(27, -10, 4.6, 3.2, -0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#100a04'; ctx.beginPath(); ctx.ellipse(28, -10, 1.3, 2.8, 0, 0, TAU); ctx.fill();
    glow(ctx, 27, -10, 14, C.eye, ea * 0.6);
    ctx.restore();
    if (P.atk > 0.2) {
      for (let i = 0; i < 8; i++) puff(ctx, A.hx + 60 + i * 14 * P.atk, A.hy + 10 + sin(i * 1.7) * 10, 18 - i, C.mist, 0.5 * P.atk);
    }
    if (P.cast > 0.02) {
      for (let i = 0; i < 10; i++) {
        const k = (t * 0.6 + i / 10) % 1;
        const a = i * 2.4 + t;
        wisp(ctx, cos(a) * (60 + k * 60), -130 - k * 120 + sin(a) * 20, 2.6, C.fin, P.cp * (1 - k));
      }
    }
  });

  // =============================================================================================
  // 石像衛 stone_guardian — mossy awakened stone guardian statue on its plinth, jade spirit-cracks
  // =============================================================================================
  const SGP = [
    { st: '#8a8a82', moss: '#5a8a3a', glow: '#7affc8', rim: '#cfe8d8' },
    { st: '#7a7068', moss: '#8a7a2a', glow: '#ffc85a', rim: '#ffe0b0' },
    { st: '#6a7080', moss: '#3a6a6a', glow: '#8ad0ff', rim: '#c8e0ff' },
  ];
  const SG_CRACKS = [[[-20, -150], [-12, -132], [-18, -118]], [[16, -146], [10, -128], [18, -112], [12, -96]], [[-30, -80], [-22, -60], [-28, -40]], [[24, -70], [18, -52]], [[2, -196], [6, -184]]];
  function stoneTex(g, path, x0, y0, w, h, col, seed) {
    g.save(); g.clip(path);
    for (let i = 0; i < 90; i++) {
      const px = x0 + U.hash(i, 1, seed) * w, py = y0 + U.hash(i, 2, seed) * h, r = 0.6 + U.hash(i, 3, seed) * 1.6;
      g.fillStyle = U.hash(i, 4, seed) > 0.5 ? rgba(shade(col, 0.35), 0.5) : rgba(shade(col, -0.45), 0.45);
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
    }
    g.restore();
  }
  function mossOn(g, path, pts, C, seed) {
    g.save(); g.clip(path);
    for (const [mx, my, mr] of pts) {
      for (let i = 0; i < 6; i++) puff(g, mx + (U.hash(i, 1, seed + mx) - 0.5) * mr, my + (U.hash(i, 2, seed + my) - 0.5) * mr * 0.6, mr * 0.45, C.moss, 0.55);
      g.fillStyle = rgba(shade(C.moss, 0.4), 0.7);
      for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(mx + (U.hash(i, 3, seed) - 0.5) * mr * 1.2, my - mr * 0.15 + (U.hash(i, 4, seed) - 0.5) * mr * 0.5, 1.1, 0, TAU); g.fill(); }
    }
    g.restore();
  }
  function sgBody(v) {
    const C = SGP[v];
    return spr('sg:body:' + v, 190, 250, 95, 236, (g) => {
      const S = pal(C.st, C.rim), Sd = pal(shade(C.st, -0.22), C.rim);
      // plinth
      const pl = new Path2D(); pl.moveTo(-62, -24); pl.lineTo(62, -24); pl.lineTo(68, -10); pl.lineTo(68, 0); pl.lineTo(-68, 0); pl.lineTo(-68, -10); pl.closePath();
      paint(g, pl, -68, -24, 136, 24, Sd, { lw: 2, hl: 0.3 });
      stoneTex(g, pl, -68, -24, 136, 24, C.st, 1);
      g.strokeStyle = rgba(shade(C.st, -0.5), 0.8); g.lineWidth = 1.4; g.beginPath(); g.moveTo(-66, -10); g.lineTo(66, -10); g.stroke();
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 18 - 4, -20); g.lineTo(i * 18 + 4, -14); g.stroke(); }
      // robe/skirt
      const rb = smooth([[-30, -112], [30, -112], [40, -70], [48, -26], [-48, -26], [-42, -70]]);
      paint(g, rb, -48, -112, 96, 86, S, { lw: 2, hl: 0.35 });
      stoneTex(g, rb, -48, -112, 96, 86, C.st, 2);
      g.strokeStyle = rgba(shade(C.st, -0.45), 0.7); g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 10, -100); g.quadraticCurveTo(i * 15, -60, i * 20, -28); g.stroke(); }
      // armour apron
      const ap = new Path2D(); ap.moveTo(-22, -114); ap.lineTo(28, -114); ap.lineTo(24, -66); ap.lineTo(2, -54); ap.lineTo(-20, -66); ap.closePath();
      paint(g, ap, -22, -114, 50, 60, pal(shade(C.st, 0.08), C.rim), { lw: 2, hl: 0.4 });
      g.strokeStyle = rgba(shade(C.st, -0.5), 0.6); g.lineWidth = 1;
      for (let r = 0; r < 5; r++) for (let c = -3; c < 4; c++) { g.beginPath(); g.arc(c * 7 + (r % 2) * 3.5 + 2, -106 + r * 9, 3.5, 0.2, PI - 0.2); g.stroke(); }
      // torso
      const tor = smooth([[-34, -162], [0, -170], [36, -160], [36, -134], [28, -110], [-28, -110], [-36, -134]]);
      paint(g, tor, -36, -170, 72, 60, S, { lw: 2, hl: 0.45 });
      stoneTex(g, tor, -36, -170, 72, 60, C.st, 3);
      // belt with beast-face buckle
      const belt = new Path2D(); belt.roundRect(-32, -120, 66, 11, 3);
      paint(g, belt, -32, -120, 66, 11, Sd, { lw: 1.6 });
      ball(g, 4, -115, 9, pal(shade(C.st, 0.1), C.rim), { lw: 1.6, spec: false });
      g.fillStyle = shade(C.st, -0.55);
      g.beginPath(); g.arc(0.5, -117, 1.6, 0, TAU); g.arc(7.5, -117, 1.6, 0, TAU); g.fill(); g.fillRect(0, -112, 8, 1.5);
      // shoulders
      for (const [sx, s] of [[-34, -1], [38, 1]]) {
        const sh = new Path2D(); sh.ellipse(sx, -156, 18, 13, s * 0.3, 0, TAU);
        paint(g, sh, sx - 18, -169, 36, 26, s < 0 ? Sd : S, { lw: 2, hl: 0.45 });
      }
      // head: helmet + stern face
      const hd = smooth([[-14, -170], [-16, -190], [-6, -202], [10, -202], [20, -190], [20, -172], [12, -164], [-8, -164]]);
      paint(g, hd, -16, -202, 36, 38, S, { lw: 2, hl: 0.45 });
      stoneTex(g, hd, -16, -202, 36, 38, C.st, 4);
      const helm = new Path2D(); helm.moveTo(-18, -186); helm.quadraticCurveTo(-16, -212, 4, -214); helm.quadraticCurveTo(24, -212, 24, -186); helm.quadraticCurveTo(4, -194, -18, -186); helm.closePath();
      paint(g, helm, -18, -214, 42, 28, pal(shade(C.st, 0.05), C.rim), { lw: 2, hl: 0.5 });
      ball(g, 4, -218, 5, S, { lw: 1.4, spec: false });
      g.fillStyle = shade(C.st, -0.6);
      g.beginPath(); g.ellipse(13, -182, 4, 2.2, 0, 0, TAU); g.ellipse(2, -182, 3, 2, 0, 0, TAU); g.fill();
      g.strokeStyle = shade(C.st, -0.55); g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(8, -186); g.lineTo(18, -188); g.moveTo(-2, -186); g.lineTo(4, -187); g.moveTo(17, -178); g.lineTo(20, -172); g.moveTo(8, -170); g.lineTo(16, -170); g.stroke();
      // stone beard
      const bd = new Path2D(); bd.moveTo(4, -168); bd.lineTo(18, -168); bd.lineTo(14, -150); bd.lineTo(8, -152); bd.closePath();
      paint(g, bd, 4, -168, 14, 18, Sd, { lw: 1.4 });
      // moss
      mossOn(g, tor, [[-28, -160, 18], [30, -164, 12]], C, 7);
      mossOn(g, helm, [[-6, -210, 14]], C, 8);
      mossOn(g, rb, [[-40, -40, 22], [36, -34, 16]], C, 9);
      mossOn(g, pl, [[-50, -22, 20], [40, -20, 24]], C, 10);
      // little ferns
      for (const [fx, fy, s] of [[-40, -164, -1], [-56, -24, -1], [52, -24, 1]]) {
        g.strokeStyle = shade(C.moss, 0.1); g.lineWidth = 1.4;
        for (let k = 0; k < 3; k++) {
          const a = -PI / 2 + s * (0.3 + k * 0.35);
          g.beginPath(); g.moveTo(fx, fy); const ex = fx + cos(a) * 14, ey = fy + sin(a) * 14; g.quadraticCurveTo(fx + cos(a) * 8 + s * 4, fy + sin(a) * 8, ex, ey); g.stroke();
          for (let j = 1; j < 5; j++) { const px = lerp(fx, ex, j / 5), py = lerp(fy, ey, j / 5); g.beginPath(); g.moveTo(px, py); g.lineTo(px + 3, py - 2); g.moveTo(px, py); g.lineTo(px - 3, py - 2); g.stroke(); }
        }
      }
      // cracks
      g.lineCap = 'round';
      for (const cr of SG_CRACKS) {
        g.strokeStyle = shade(C.st, -0.7); g.lineWidth = 2.6;
        g.beginPath(); cr.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
      }
    });
  }
  function sgMace(v) {
    const C = SGP[v];
    return spr('sg:mace:' + v, 40, 130, 20, 20, (g) => {
      const S = pal(C.st, C.rim);
      const grip = new Path2D(); grip.roundRect(-4, -16, 8, 24, 3); paint(g, grip, -4, -16, 8, 24, pal(shade(C.st, -0.3)), { lw: 1.4 });
      const gd = new Path2D(); gd.roundRect(-11, 6, 22, 7, 2); paint(g, gd, -11, 6, 22, 7, S, { lw: 1.4 });
      // 鐧 segmented rod
      const rod = new Path2D(); rod.moveTo(-6, 13); rod.lineTo(6, 13); rod.lineTo(4, 104); rod.lineTo(0, 110); rod.lineTo(-4, 104); rod.closePath();
      paint(g, rod, -6, 13, 12, 97, S, { lw: 1.6, hl: 0.45 });
      g.strokeStyle = shade(C.st, -0.5); g.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) { const yy = 28 + i * 16; g.beginPath(); g.moveTo(-6.5, yy); g.lineTo(6.5, yy); g.stroke(); }
      mossOn(g, rod, [[0, 60, 10]], C, 11);
      ball(g, 0, -18, 4.5, S, { lw: 1.2, spec: false });
    });
  }
  def('stone_guardian', 170, 230, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = SGP[P.v];
    const A = poseParams(P, { fa: 0.25, ma: -0.1, lean: 0, dx: 0, lift: 0 }, { fa: 2.6, ma: -2.8, lean: -0.06, dx: -4, lift: 3 },
      { fa: 1.1, ma: -1.6, lean: 0.1, dx: 22, lift: 0 }, { fa: -0.2, ma: 0.2, lean: -0.1, dx: -10, lift: 0 }, { fa: 1.6, ma: -2.9, lean: 0, dx: 0, lift: 6 });
    const wake = 0.7 + 0.3 * sin(t * 1.7);
    ctx.translate(x + A.dx + P.shake, y);
    ctx.save(); ctx.translate(0, -24); ctx.rotate(A.lean); ctx.translate(0, 24 - A.lift);
    // back arm (static at side)
    const Sd = pal(shade(C.st, -0.28), C.rim);
    limb(ctx, -34, -152, -42, -120, 11, 9, Sd, 2); limb(ctx, -42, -120, -36, -92, 9, 8, Sd, 2);
    ball(ctx, -36, -88, 8, Sd, { lw: 1.8, spec: false });
    put(ctx, sgBody(P.v), 0, 0);
    // spirit-crack glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(C.glow, 0.45 * wake + P.cp * 0.4); ctx.lineWidth = 1.6;
    for (const cr of SG_CRACKS) { ctx.beginPath(); cr.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
    ctx.restore();
    const ea = wake + P.atk * 0.5 + P.cp * 0.5;
    glow(ctx, 13, -182, 12, C.glow, ea); glow(ctx, 2, -182, 9, C.glow, ea * 0.8);
    ctx.fillStyle = rgba('#ffffff', min(1, ea)); ctx.beginPath(); ctx.ellipse(13, -182, 2.4, 1.1, 0, 0, TAU); ctx.ellipse(2, -182, 1.8, 0.9, 0, 0, TAU); ctx.fill();
    // front arm + mace
    const S = pal(C.st, C.rim);
    const sx = 38, sy = -150, ex = sx + sin(A.fa) * 28, ey = sy + cos(A.fa) * 28, hx = ex + sin(A.fa + 0.5) * 24, hy = ey + cos(A.fa + 0.5) * 24;
    limb(ctx, sx, sy, ex, ey, 11, 9, S, 2);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(-A.ma - A.fa * 0.2); put(ctx, sgMace(P.v), 0, 0); ctx.restore();
    limb(ctx, ex, ey, hx, hy, 9, 8, S, 2);
    ball(ctx, hx, hy, 8.5, S, { lw: 1.8, spec: false });
    ctx.restore();
    // falling pebbles & dust on action
    const act = max(P.atk, P.hurt, P.cast * 0.5);
    if (act > 0.05) {
      for (let i = 0; i < 8; i++) {
        const k = ((P.st * 1.4) + U.hash(i, 2, 3)) % 1;
        const px = (U.hash(i, 1, 3) - 0.5) * 80, py = -160 + k * 150;
        ctx.fillStyle = rgba(shade(C.st, -0.2), act * (1 - k));
        ctx.beginPath(); ctx.arc(px, py, 1.5 + U.hash(i, 4) * 2, 0, TAU); ctx.fill();
      }
      mist(ctx, 0, -10, 140, 20, t, shade(C.st, 0.3), 0.3 * act, 6, 61);
    }
    if (P.cast > 0.02) {
      glow(ctx, 0, -120, 110, C.glow, 0.25 * P.cp);
      for (let i = 0; i < 6; i++) { const k = (t * 0.5 + i / 6) % 1; wisp(ctx, sin(i * 2 + t) * 50, -20 - k * 180, 2.5, C.glow, P.cp * (1 - k)); }
    }
  });

  // =============================================================================================
  // 燈蛾 lamp_moth — luminous moth, lantern-patterned wings, feathery antennae, glowing dust
  // =============================================================================================
  const LMP = [
    { wing: '#3a2a3e', wingL: '#7a5a6a', lan: '#ff9a3a', lanC: '#ffe6a0', body: '#d8c0a0', fur: '#f4e6cc', rim: '#ffcf8a', dust: '#ffd27a' },
    { wing: '#1e3a3a', wingL: '#4a7a72', lan: '#5affc0', lanC: '#e0fff0', body: '#b8d8c8', fur: '#e6fff4', rim: '#a8ffe0', dust: '#9affd8' },
    { wing: '#2a1e40', wingL: '#5a4a8a', lan: '#c87aff', lanC: '#f6e0ff', body: '#c8b8e0', fur: '#f0e8ff', rim: '#e0b0ff', dust: '#e0a8ff' },
  ];
  function lmWing(v, hind, far) {
    const C = LMP[v];
    return spr('lm:wing:' + v + hind + far, 150, 130, 10, 80, (g) => {
      const base = far ? shade(C.wing, -0.35) : C.wing;
      const p = new Path2D();
      if (!hind) { p.moveTo(0, 0); p.bezierCurveTo(20, -50, 80, -78, 128, -66); p.bezierCurveTo(136, -50, 120, -24, 96, -8); p.bezierCurveTo(60, 8, 24, 10, 0, 0); }
      else { p.moveTo(0, 0); p.bezierCurveTo(30, -6, 80, 0, 96, 22); p.bezierCurveTo(100, 40, 70, 48, 44, 40); p.bezierCurveTo(20, 30, 4, 14, 0, 0); }
      p.closePath();
      const gr = g.createLinearGradient(0, -60, 100, 30);
      gr.addColorStop(0, shade(base, 0.25)); gr.addColorStop(0.5, base); gr.addColorStop(1, shade(base, -0.4));
      g.fillStyle = gr; g.fill(p);
      g.save(); g.clip(p);
      // veins
      g.strokeStyle = rgba(far ? C.wing : C.wingL, 0.8); g.lineWidth = 1.2;
      const tips = hind ? [[90, 20], [70, 40], [40, 38]] : [[124, -64], [126, -40], [100, -12], [60, 2]];
      for (const [tx, ty] of tips) { g.beginPath(); g.moveTo(2, 0); g.quadraticCurveTo(tx * 0.4, ty * 0.2, tx, ty); g.stroke(); }
      // lantern eye-spots: dark ring, glowing paper body with ribs
      const spots = hind ? [[56, 20, 13]] : [[84, -42, 18], [42, -22, 11]];
      for (const [sx, sy, r] of spots) {
        g.fillStyle = shade(base, -0.6); g.beginPath(); g.ellipse(sx, sy, r * 1.25, r * 1.1, -0.3, 0, TAU); g.fill();
        const lg = g.createRadialGradient(sx - r * 0.2, sy - r * 0.2, 1, sx, sy, r);
        lg.addColorStop(0, far ? shade(C.lanC, -0.3) : C.lanC); lg.addColorStop(0.55, far ? shade(C.lan, -0.3) : C.lan); lg.addColorStop(1, shade(C.lan, -0.5));
        g.fillStyle = lg; g.beginPath(); g.ellipse(sx, sy, r * 0.8, r, -0.3, 0, TAU); g.fill();
        g.strokeStyle = rgba(shade(C.lan, -0.55), 0.8); g.lineWidth = 1;
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.ellipse(sx, sy, r * 0.8 * abs(k * 0.6), r, -0.3, 0, TAU); g.stroke(); }
        g.fillStyle = shade(base, -0.65); g.fillRect(sx - r * 0.35 + sin(0.3) * r, sy - r - 2, r * 0.7, 3);
      }
      // scalloped edge band
      g.strokeStyle = rgba(far ? C.wingL : shade(C.wingL, 0.3), 0.7); g.lineWidth = 3; g.setLineDash([3, 4]); g.stroke(p); g.setLineDash([]);
      g.restore();
      g.strokeStyle = shade(base, -0.7); g.lineWidth = 1.6; g.stroke(p);
    });
  }
  def('lamp_moth', 170, 170, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = LMP[P.v];
    const A = poseParams(P, { dx: 0, hov: 0, fr: 1, tilt: -0.15 }, { dx: -10, hov: 10, fr: 1.6, tilt: -0.4 },
      { dx: 40, hov: -10, fr: 2, tilt: 0.2 }, { dx: -14, hov: 4, fr: 0.5, tilt: -0.5 }, { dx: 0, hov: 14, fr: 2.4, tilt: -0.2 });
    const flap = sin(t * 7 * A.fr);
    const cy = -96 + sin(t * 2) * 6 - A.hov;
    ctx.translate(x + A.dx + P.shake, y);
    // dust trail
    for (let i = 0; i < 14; i++) {
      const k = (t * 0.35 + U.hash(i, 1, 8)) % 1;
      const px = -k * 90 + (U.hash(i, 2, 8) - 0.5) * 50, py = cy + 10 + k * 70 + sin(t * 2 + i) * 6;
      glow(ctx, px, py, 5, C.dust, (1 - k) * 0.8);
    }
    ctx.translate(0, cy); ctx.rotate(A.tilt); ctx.scale(1.1, 1.1);
    glow(ctx, 0, 0, 90, C.lan, 0.18 + P.cp * 0.25);
    // far wings
    ctx.save(); ctx.translate(-2, -8); ctx.rotate(0.95 + flap * 0.3); ctx.scale(-0.85, 0.8 + flap * 0.2); put(ctx, lmWing(P.v, 0, 1), 0, 0); ctx.restore();
    ctx.save(); ctx.translate(-6, -2); ctx.rotate(0.5 + flap * 0.15); ctx.scale(-0.8, 0.8); put(ctx, lmWing(P.v, 1, 1), 0, 0); ctx.restore();
    // abdomen
    const ab = smooth([[-6, -9], [-28, -7], [-48, 3], [-58, 12], [-46, 19], [-22, 15], [-4, 8]]);
    paint(ctx, ab, -58, -9, 54, 28, pal(C.body, C.rim), { lw: 1.6, hl: 0.4 });
    ctx.strokeStyle = rgba(shade(C.body, -0.45), 0.8); ctx.lineWidth = 1.2;
    for (let i = 1; i < 5; i++) { const bx = -8 - i * 8; ctx.beginPath(); ctx.moveTo(bx, -3 + i * 1.5); ctx.lineTo(bx - 2, 11 + i * 0.5); ctx.stroke(); }
    glow(ctx, -44, 10, 16, C.lan, 0.6 + 0.3 * sin(t * 3));
    // thorax (furry)
    const th = tufted([[-10, -12], [6, -16], [16, -6], [12, 8], [-6, 10], [-14, 0]], 2.2, 3, 3);
    paint(ctx, th, -14, -16, 30, 26, pal(C.fur, C.rim), { lw: 1.6, hl: 0.45 });
    // legs
    ctx.strokeStyle = shade(C.body, -0.5); ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const lx = -4 + i * 7; ctx.beginPath(); ctx.moveTo(lx, 6); ctx.lineTo(lx + 4, 18 + sin(t * 3 + i) * 2); ctx.lineTo(lx + 9, 22); ctx.stroke(); }
    // head
    const hd = new Path2D(); hd.ellipse(20, -6, 8, 7.5, 0, 0, TAU);
    paint(ctx, hd, 12, -14, 16, 15, pal(C.fur, C.rim), { lw: 1.4, hl: 0.5 });
    ball(ctx, 24, -6, 4.2, pal('#1a1420', null, { l: '#6a5a7a', o: '#000' }), { lw: 0.8 });
    glow(ctx, 25, -7, 7, C.dust, 0.6 + P.atk * 0.4);
    // feathery antennae
    for (const [s, ph] of [[1, 0], [0.75, 1]]) {
      const ax0 = 20, ay0 = -13, sw = sin(t * 2.4 + ph) * 3;
      const ex = ax0 + 22 * s + sw, ey = ay0 - 26 * s;
      ctx.strokeStyle = shade(C.fur, -0.3); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(ax0, ay0); ctx.quadraticCurveTo(ax0 + 4, ay0 - 18 * s, ex, ey); ctx.stroke();
      ctx.lineWidth = 0.9; ctx.strokeStyle = rgba(C.fur, 0.85);
      for (let k = 1; k < 9; k++) {
        const u = k / 9, px = lerp(ax0 + 2, ex, u), py = lerp(ay0 - 6, ey, u) + 2;
        const L = 5 * sin(u * PI) + 1.5;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + L, py + 2); ctx.moveTo(px, py); ctx.lineTo(px - L * 0.7, py - 2); ctx.stroke();
      }
    }
    // near wings
    const sp = 0.45 + 0.3 * sin(t * 2.6) + P.cp * 0.5 + P.atk * 0.3;
    ctx.save(); ctx.translate(-4, 2); ctx.rotate(-0.05 + flap * 0.12); ctx.scale(-0.95, 0.9 + flap * 0.15); put(ctx, lmWing(P.v, 1, 0), 0, 0);
    glow(ctx, 56, 20, 22, C.lan, sp * 0.7); ctx.restore();
    ctx.save(); ctx.translate(0, -6); ctx.rotate(0.3 + flap * 0.35); ctx.scale(-1, 0.85 + flap * 0.3); put(ctx, lmWing(P.v, 0, 0), 0, 0);
    glow(ctx, 84, -42, 30, C.lan, sp); glow(ctx, 42, -22, 20, C.lan, sp * 0.8); ctx.restore();
    if (P.atk > 0.2) {
      for (let i = 0; i < 10; i++) { const a = i * 0.6 - 3; glow(ctx, 30 + i * 9 * P.atk, sin(a) * 18, 7, C.dust, P.atk * 0.9); }
    }
    if (P.cast > 0.02) {
      for (let i = 0; i < 10; i++) { const a = t * 2 + i * TAU / 10; glow(ctx, cos(a) * 70, sin(a) * 40, 8, C.dust, P.cp); }
    }
  });

  // =============================================================================================
  // 溺屍兵 drowned_soldier — drowned Qing-era soldier, bloated sea-pale, seaweed, rusted saber
  // =============================================================================================
  const DSP = [
    { skin: '#8aa8a4', coat: '#3a4e6a', trim: '#b04a3a', hat: '#6a5a3a', weed: '#3a6a3a', eye: '#cfffea', water: '#4ab0c0', rust: '#8a5a3a' },
    { skin: '#9aa890', coat: '#5a3a3a', trim: '#c8a04a', hat: '#4a4030', weed: '#5a7a2a', eye: '#f0ff9a', water: '#7ac0a0', rust: '#7a4a2a' },
    { skin: '#8a94b0', coat: '#2a2a40', trim: '#6a4a9a', hat: '#3a3448', weed: '#2a4a5a', eye: '#d0b0ff', water: '#7a8ad0', rust: '#6a5a6a' },
  ];
  function dsBody(v) {
    const C = DSP[v];
    return spr('ds:body:' + v, 140, 210, 70, 200, (g) => {
      const sk = pal(C.skin, C.water, { o: shade(C.skin, -0.6) });
      const coat = pal(C.coat, C.water), coatD = pal(shade(C.coat, -0.3), C.water);
      const pants = pal(shade(C.coat, -0.45), C.water);
      // legs (wrapped leggings) and straw sandals
      for (const [lx, fx, d] of [[-10, -18, 1], [12, 18, 0]]) {
        const lg = capsule(lx, -78, fx, -12, 12, 8.5);
        paint(g, lg, min(lx, fx) - 12, -78, abs(fx - lx) + 24, 66, d ? pal(shade(C.coat, -0.6)) : pants, { lw: 1.8 });
        g.strokeStyle = rgba(shade(C.skin, -0.2), 0.8); g.lineWidth = 1.4;
        for (let k = 0; k < 5; k++) { const yy = -52 + k * 8; const xx = lerp(lx, fx, (yy + 78) / 66); g.beginPath(); g.moveTo(xx - 9, yy); g.lineTo(xx + 9, yy + 3); g.stroke(); }
        const ft = new Path2D(); ft.ellipse(fx + 4, -5, 12, 5, 0, 0, TAU);
        paint(g, ft, fx - 8, -10, 24, 10, sk, { lw: 1.4 });
        g.strokeStyle = '#8a7a4a'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx - 6, -2); g.lineTo(fx + 14, -2); g.stroke();
      }
      // tunic 號衣 (tattered hem)
      const tn = smooth([[-24, -146], [24, -148], [30, -120], [32, -80], [26, -64], [18, -72], [10, -60], [2, -70], [-8, -58], [-16, -70], [-26, -62], [-30, -90], [-30, -124]]);
      paint(g, tn, -32, -148, 64, 90, coat, { lw: 2, hl: 0.3 });
      g.save(); g.clip(tn);
      // trim border & water stains
      g.strokeStyle = C.trim; g.lineWidth = 4; g.stroke(tn);
      for (let i = 0; i < 6; i++) puff(g, (U.hash(i, 1, v) - 0.5) * 60, -70 - U.hash(i, 2, v) * 70, 10, shade(C.coat, -0.4), 0.5);
      g.restore();
      // round chest patch with 勇
      ball(g, 6, -114, 13, pal('#e8e0c8', null, { o: '#6a5a40', d: '#b8a888' }), { lw: 1.6, spec: false });
      g.fillStyle = shade(C.trim, -0.2); g.font = G.font(16, true); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('勇', 6, -113);
      g.strokeStyle = 'rgba(40,60,60,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-2, -122); g.lineTo(14, -104); g.stroke();
      // sash
      g.strokeStyle = shade(C.trim, -0.3); g.lineWidth = 5; g.beginPath(); g.moveTo(-28, -88); g.quadraticCurveTo(0, -82, 30, -90); g.stroke();
      // neck & head (hunched forward)
      const nk = capsule(2, -146, 10, -158, 7, 6); paint(g, nk, 0, -164, 16, 20, sk, { lw: 1.4 });
      const hd = smooth([[-2, -176], [12, -182], [26, -172], [28, -158], [22, -148], [6, -148], [-4, -158]]);
      paint(g, hd, -4, -182, 32, 34, sk, { lw: 1.8, hl: 0.35 });
      g.save(); g.clip(hd);
      puff(g, 20, -150, 10, shade(C.skin, -0.35), 0.6);
      g.restore();
      // sunken eye sockets
      g.fillStyle = shade(C.skin, -0.7);
      g.beginPath(); g.ellipse(19, -166, 4, 3.2, -0.2, 0, TAU); g.ellipse(8, -166, 3, 2.6, 0, 0, TAU); g.fill();
      // slack mouth
      g.fillStyle = shade(C.skin, -0.75); g.beginPath(); g.ellipse(21, -154, 3, 2, 0, 0, TAU); g.fill();
      // queue / wet hair strands
      g.strokeStyle = '#141418'; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(2 + i * 4, -172); g.quadraticCurveTo(-2 + i * 3, -160, -4 + i * 2, -146); g.stroke(); }
      // broken rattan hat
      const hat = new Path2D(); hat.moveTo(-14, -170); hat.quadraticCurveTo(8, -200, 34, -172); hat.lineTo(28, -172); hat.lineTo(24, -178); hat.lineTo(18, -170); hat.closePath();
      paint(g, hat, -14, -194, 48, 24, pal(C.hat, C.water), { lw: 1.6, hl: 0.4 });
      g.strokeStyle = rgba(shade(C.hat, -0.5), 0.8); g.lineWidth = 1;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(10, -192); g.lineTo(-12 + i * 7, -171); g.stroke(); }
      ball(g, 10, -193, 3, pal(C.trim), { lw: 0.8, spec: false });
      // seaweed draped
      g.strokeStyle = C.weed; g.lineWidth = 3;
      for (const [sx, sy, len] of [[-22, -146, 40], [24, -140, 30], [-6, -176, 26]]) {
        g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx + 6, sy + len * 0.3, sx - 6, sy + len * 0.6, sx + 2, sy + len); g.stroke();
      }
      g.strokeStyle = rgba(shade(C.weed, 0.4), 0.6); g.lineWidth = 1;
      for (const [sx, sy, len] of [[-22, -146, 40], [24, -140, 30]]) { g.beginPath(); g.moveTo(sx, sy); g.bezierCurveTo(sx + 6, sy + len * 0.3, sx - 6, sy + len * 0.6, sx + 2, sy + len); g.stroke(); }
      // barnacles
      for (const [bx, by] of [[-20, -100], [-16, -96], [22, -132], [-26, -128]]) ball(g, bx, by, 2.2, pal('#d8d4c8', null, { o: '#6a6458' }), { lw: 0.6, spec: false });
    });
  }
  def('drowned_soldier', 120, 200, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = DSP[P.v];
    const A = poseParams(P,
      { fa: 0.5 + sin(t * 1.2) * 0.08, sw: 0.4, ba: -0.2 + sin(t * 1.2 + 1) * 0.08, lean: 0.12 + sin(t * 1.2) * 0.03, dx: 0 },
      { fa: 2.9, sw: 3.6, ba: -0.6, lean: -0.05, dx: -6 },
      { fa: 1.3, sw: 1.6, ba: -0.8, lean: 0.3, dx: 32 },
      { fa: 0.1, sw: 0.6, ba: 0.4, lean: -0.15, dx: -14 },
      { fa: 1.8, sw: 2.6, ba: 1.4, lean: 0.05, dx: 0 });
    ctx.translate(x + A.dx + P.shake, y);
    // puddle
    ctx.save(); ctx.scale(1, 0.25);
    const pg = ctx.createRadialGradient(0, -8, 4, 0, -8, 60);
    pg.addColorStop(0, rgba(C.water, 0.45)); pg.addColorStop(1, rgba(C.water, 0));
    ctx.fillStyle = pg; ctx.fillRect(-60, -70, 120, 120);
    ctx.strokeStyle = rgba(C.water, 0.4); ctx.lineWidth = 2;
    const rr = (t * 30) % 50; ctx.beginPath(); ctx.ellipse(0, -8, 10 + rr, 10 + rr, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.translate(0, -60); ctx.rotate(A.lean); ctx.translate(0, 60);
    const sk = pal(C.skin, C.water, { o: shade(C.skin, -0.6) }), coatD = pal(shade(C.coat, -0.3), C.water);
    // back arm
    const bs = [-20, -138], be = chain(bs[0], bs[1], A.ba, 24), bh = chain(be[0], be[1], A.ba + 0.3, 22);
    limb(ctx, bs[0], bs[1], be[0], be[1], 8, 7, coatD, 1.6); limb(ctx, be[0], be[1], bh[0], bh[1], 5.5, 5, pal(shade(C.skin, -0.25)), 1.4);
    ball(ctx, bh[0], bh[1], 5.5, pal(shade(C.skin, -0.25)), { lw: 1.2, spec: false });
    put(ctx, dsBody(P.v), 0, 0);
    const ea = 0.7 + 0.3 * sin(t * 2.3) + P.atk * 0.5;
    glow(ctx, 19, -166, 8, C.eye, ea); glow(ctx, 8, -166, 6, C.eye, ea * 0.7);
    ctx.fillStyle = rgba(C.eye, min(1, ea)); ctx.beginPath(); ctx.arc(19.5, -166, 1.3, 0, TAU); ctx.arc(8.5, -166, 1, 0, TAU); ctx.fill();
    // front arm + rusted saber
    const fs = [22, -138], fe = chain(fs[0], fs[1], A.fa, 24), fh = chain(fe[0], fe[1], A.fa + 0.35, 22);
    limb(ctx, fs[0], fs[1], fe[0], fe[1], 8.5, 7.5, pal(C.coat, C.water), 1.6);
    ctx.save(); ctx.translate(fh[0], fh[1]); ctx.rotate(PI / 2 - A.sw);
    const bl = new Path2D(); bl.moveTo(4, -3); bl.quadraticCurveTo(40, -6, 66, -14); bl.quadraticCurveTo(70, -8, 64, -4); bl.quadraticCurveTo(36, 4, 4, 3); bl.closePath();
    const bg = ctx.createLinearGradient(0, -10, 0, 4); bg.addColorStop(0, '#aab0a8'); bg.addColorStop(1, '#4a4e4a');
    ctx.fillStyle = bg; ctx.fill(bl);
    ctx.save(); ctx.clip(bl);
    for (let i = 0; i < 7; i++) puff(ctx, 10 + U.hash(i, 1, 9) * 54, -6 + U.hash(i, 2, 9) * 8, 5 + U.hash(i, 3) * 4, C.rust, 0.7);
    ctx.restore();
    ctx.strokeStyle = '#2a2a28'; ctx.lineWidth = 1.2; ctx.stroke(bl);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(-10, -2.5, 14, 5);
    ctx.fillStyle = C.rust; ctx.beginPath(); ctx.ellipse(3, 0, 2.5, 6, 0, 0, TAU); ctx.fill();
    ctx.restore();
    limb(ctx, fe[0], fe[1], fh[0], fh[1], 6, 5.5, sk, 1.4);
    ball(ctx, fh[0], fh[1], 6, sk, { lw: 1.2, spec: false });
    // water drips
    for (let i = 0; i < 7; i++) {
      const k = (t * 0.9 + U.hash(i, 3, 4)) % 1;
      const px = (U.hash(i, 4, 4) - 0.5) * 60, py = -140 + U.hash(i, 5, 4) * 80 + k * k * 90;
      ctx.fillStyle = rgba(C.water, 0.8 * (1 - k));
      ctx.beginPath(); ctx.ellipse(px, py, 1.6, 2.8, 0, 0, TAU); ctx.fill();
    }
    if (P.cast > 0.02) {
      for (let i = 0; i < 8; i++) { const a = t * 2 + i * TAU / 8; wisp(ctx, cos(a) * 40, -100 + sin(a) * 50, 2.2, C.water, P.cp); }
    }
  });

  // =============================================================================================
  // 潮怨 tide_grudge — a cresting wave holding anguished faces and reaching hands
  // =============================================================================================
  const TGP = [
    { deep: '#0a2a3a', mid: '#1a6a7a', hi: '#5ac8c8', foam: '#e6fbff', face: '#cfe8ee', eye: '#9afff0' },
    { deep: '#0a1a2a', mid: '#2a3a6a', hi: '#6a8ae0', foam: '#e8ecff', face: '#d0d4f0', eye: '#b0c0ff' },
    { deep: '#200a20', mid: '#5a1a4a', hi: '#d05a90', foam: '#ffe8f0', face: '#f0d0dc', eye: '#ffb0d0' },
  ];
  function tgFace(ctx, x, y, s, C, t, a, open) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha *= a;
    const f = new Path2D(); f.ellipse(0, 0, 10, 13, 0, 0, TAU);
    const g = ctx.createRadialGradient(-3, -4, 1, 0, 0, 14);
    g.addColorStop(0, C.face); g.addColorStop(1, rgba(C.face, 0.1));
    ctx.fillStyle = g; ctx.fill(f);
    ctx.fillStyle = rgba(C.deep, 0.9);
    ctx.beginPath(); ctx.ellipse(-4, -3, 2.6, 3.6, 0.2, 0, TAU); ctx.ellipse(4, -3, 2.6, 3.6, -0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 6, 2.6, 3 + open * 3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(C.deep, 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(-2, -6.5); ctx.moveTo(7, -8); ctx.lineTo(2, -6.5); ctx.stroke();
    glow(ctx, -4, -3, 4, C.eye, 0.5); glow(ctx, 4, -3, 4, C.eye, 0.5);
    ctx.restore();
  }
  def('tide_grudge', 210, 200, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = TGP[P.v];
    const A = poseParams(P, { dx: 0, crest: 0, h: 1 }, { dx: -10, crest: -0.4, h: 1.08 }, { dx: 30, crest: 1, h: 0.92 },
      { dx: -14, crest: -0.6, h: 0.9 }, { dx: 0, crest: 0.2, h: 1.15 });
    ctx.translate(x + A.dx + P.shake, y);
    const H = 170 * A.h;
    const w = (q, a) => sin(t * 1.8 + q) * a;
    const cx = 40 + A.crest * 40, cyy = -H;
    // wave silhouette (curl to the right)
    const wave = new Path2D();
    wave.moveTo(-100, 0);
    wave.bezierCurveTo(-96, -40 + w(0, 4), -80, -H * 0.7 + w(1, 6), -40, -H * 0.92 + w(2, 5));
    wave.bezierCurveTo(-6, -H * 1.04, cx - 20, cyy - 14 + w(3, 4), cx + 20, cyy + 10 + w(4, 4));
    wave.bezierCurveTo(cx + 40, cyy + 30, cx + 30, cyy + 54 + w(5, 4), cx + 6, cyy + 50);
    wave.bezierCurveTo(cx - 8, cyy + 48, cx - 6, cyy + 34, cx + 4, cyy + 32);
    wave.bezierCurveTo(cx - 10, cyy + 60, 30, -50 + w(6, 5), 60, -24 + w(7, 4));
    wave.bezierCurveTo(80, -10, 96, -4, 104, 0);
    wave.closePath();
    const g = ctx.createLinearGradient(-60, -H, 40, 0);
    g.addColorStop(0, C.hi); g.addColorStop(0.35, C.mid); g.addColorStop(1, C.deep);
    ctx.fillStyle = g; ctx.fill(wave);
    ctx.save(); ctx.clip(wave);
    // inner flow lines
    ctx.strokeStyle = rgba(C.hi, 0.35); ctx.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      const k = i / 7;
      ctx.beginPath(); ctx.moveTo(-90 + k * 30, -10);
      ctx.bezierCurveTo(-80 + k * 40, -H * (0.4 + k * 0.4) + w(i, 6), -20 + k * 30, -H * (0.7 + k * 0.2), cx - 10 + k * 10, cyy + 20 + k * 10);
      ctx.stroke();
    }
    // faces inside the wave
    const faces = [[-50, -100, 1.3, 0], [-10, -60, 1.0, 1], [10, -120, 1.15, 2], [-60, -40, 0.85, 3], [40, -60, 0.8, 4]];
    for (const [fx, fy, s, i] of faces) tgFace(ctx, fx + w(i * 2, 4), fy * A.h + w(i * 3, 3), s, C, t, 0.55 + 0.25 * sin(t * 1.2 + i), 0.5 + 0.5 * sin(t * 2 + i) + P.atk);
    // depth gradient bottom
    const dg = ctx.createLinearGradient(0, -60, 0, 0);
    dg.addColorStop(0, rgba(C.deep, 0)); dg.addColorStop(1, rgba(C.deep, 0.8));
    ctx.fillStyle = dg; ctx.fillRect(-110, -60, 220, 60);
    ctx.restore();
    ctx.strokeStyle = shade(C.deep, -0.3); ctx.lineWidth = 2; ctx.stroke(wave);
    // reaching hands from the crest
    for (let i = 0; i < 3; i++) {
      const bx = cx - 30 + i * 18, by = cyy + 8 + i * 4;
      const reach = 18 + 8 * sin(t * 1.6 + i * 2) + P.atk * 30;
      const ang = -0.6 + i * 0.35;
      const ex = bx + cos(ang) * reach, ey = by + sin(ang) * reach;
      limb(ctx, bx, by, ex, ey, 6, 4.5, pal(C.face, C.eye, { o: shade(C.face, -0.55) }), 1.2);
      ctx.strokeStyle = shade(C.face, -0.4); ctx.lineWidth = 1.6;
      ctx.lineWidth = 2.2; for (let k = -1.5; k <= 1.5; k++) { ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + cos(ang + k * 0.35) * 9, ey + sin(ang + k * 0.35) * 9); ctx.stroke(); }
    }
    // foam along the crest
    for (let i = 0; i < 16; i++) {
      const u = i / 15;
      const fx = lerp(-40, cx + 26, u) + w(i, 3), fy = lerp(-H * 0.94, cyy + 18, u) - sin(u * PI) * 14 + w(i * 2, 3);
      puff(ctx, fx, fy, 9 + sin(t * 3 + i) * 2, C.foam, 0.7);
    }
    for (let i = 0; i < 10; i++) {
      const k = (t * 0.6 + U.hash(i, 1, 12)) % 1;
      const fx = cx + 10 + (U.hash(i, 2, 12) - 0.3) * 40 + k * 20, fy = cyy + 20 + k * 60;
      ctx.fillStyle = rgba(C.foam, 0.8 * (1 - k)); ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, TAU); ctx.fill();
    }
    // base surf
    mist(ctx, 0, -6, 230, 18, t, C.foam, 0.2, 8, 13);
    if (P.cast > 0.02) glow(ctx, -20, -90, 120, C.eye, 0.3 * P.cp);
  });

  // =============================================================================================
  // 溺魂群 drowned_swarm — a swirling shoal of small drowned souls around a dark undertow
  // =============================================================================================
  const DWP = [
    { body: '#bfe6f0', glow: '#5ad2ff', dark: '#06141e', eye: '#0a1a28' },
    { body: '#d0f0d8', glow: '#6affb0', dark: '#061a10', eye: '#0a2016' },
    { body: '#e6d0f0', glow: '#c07aff', dark: '#12061e', eye: '#1a0a28' },
  ];
  function dwSoul(ctx, x, y, s, dir, C, t, seed, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir); ctx.scale(s, s); ctx.globalAlpha *= a;
    // tail
    const tl = new Path2D(); tl.moveTo(0, -8);
    tl.bezierCurveTo(-14, -8, -22, -4 + sin(t * 6 + seed) * 4, -34, sin(t * 5 + seed) * 6);
    tl.bezierCurveTo(-22, 6 + sin(t * 6 + seed) * 3, -12, 8, 0, 8); tl.closePath();
    const tg = ctx.createLinearGradient(0, 0, -34, 0);
    tg.addColorStop(0, rgba(C.body, 0.9)); tg.addColorStop(1, rgba(C.body, 0));
    ctx.fillStyle = tg; ctx.fill(tl);
    glow(ctx, 0, 0, 18, C.glow, 0.4);
    const hd = new Path2D(); hd.ellipse(0, 0, 9, 8.5, 0, 0, TAU);
    const hg = ctx.createRadialGradient(-2, -3, 1, 0, 0, 10);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, C.body);
    ctx.fillStyle = hg; ctx.fill(hd);
    ctx.strokeStyle = rgba(C.glow, 0.7); ctx.lineWidth = 1; ctx.stroke(hd);
    ctx.restore();
    // face stays upright
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha *= a;
    ctx.fillStyle = C.eye;
    ctx.beginPath(); ctx.ellipse(2, -1.5, 1.3, 2, 0, 0, TAU); ctx.ellipse(6, -1.5, 1.1, 1.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(4, 3.5, 1.2, 1.6 + sin(t * 3 + seed) * 0.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  def('drowned_swarm', 210, 190, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = DWP[P.v];
    const A = poseParams(P, { dx: 0, r: 1, sp: 1 }, { dx: -10, r: 0.75, sp: 1.6 }, { dx: 40, r: 1.15, sp: 2.6 }, { dx: -14, r: 1.3, sp: 0.4 }, { dx: 0, r: 0.9, sp: 3 });
    ctx.translate(x + A.dx + P.shake, y);
    const cy = -96 + sin(t * 1.2) * 5;
    // undertow core
    for (let i = 0; i < 8; i++) {
      const a = t * 0.8 * A.sp + i * TAU / 8;
      puff(ctx, cos(a) * 26, cy + sin(a) * 20, 36, C.dark, 0.5);
    }
    glow(ctx, 0, cy, 70, C.glow, 0.2 + P.cp * 0.3);
    // spiral wake
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(C.glow, 0.18); ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let i = 0; i <= 30; i++) { const u = i / 30, a = t * A.sp + k * TAU / 3 + u * 4; const r = (20 + u * 70) * A.r; ctx.lineTo(cos(a) * r, cy + sin(a) * r * 0.6); }
      ctx.stroke();
    }
    ctx.restore();
    // souls, sorted by depth
    const souls = [];
    for (let i = 0; i < 13; i++) {
      const sp = (0.5 + U.hash(i, 1, 14) * 0.5) * A.sp;
      const a = t * sp + U.hash(i, 2, 14) * TAU;
      const r = (40 + U.hash(i, 3, 14) * 50) * A.r;
      const sx = cos(a) * r, sy = cy + sin(a) * r * 0.5 + sin(t * 2 + i) * 8 + (U.hash(i, 4, 14) - 0.5) * 50;
      const dir = a + PI / 2;
      souls.push({ sx, sy, z: sin(a), dir: atan2(cos(a) * 0.5, -sin(a)), s: 0.75 + U.hash(i, 5, 14) * 0.5, i });
    }
    souls.sort((p, q) => p.z - q.z);
    for (const s of souls) dwSoul(ctx, s.sx + (P.atk > 0 ? P.atk * 60 * (s.z + 1) / 2 : 0), s.sy, s.s * (0.85 + s.z * 0.15), s.dir, C, t, s.i, 0.55 + 0.45 * (s.z + 1) / 2);
    // drips into the sea
    for (let i = 0; i < 5; i++) {
      const k = (t * 0.7 + i / 5) % 1;
      ctx.fillStyle = rgba(C.glow, 0.6 * (1 - k));
      ctx.beginPath(); ctx.ellipse((U.hash(i, 9, 14) - 0.5) * 80, cy + 50 + k * 40, 1.5, 3, 0, 0, TAU); ctx.fill();
    }
  });

  // =============================================================================================
  // 鯤 kun — MINI-BOSS. Colossal mythic whale of the black tide, head rising from the water,
  //   lantern-lights set into its skin. phase 2+: red eye, brighter lights, black tide streaming.
  // =============================================================================================
  const KNP = [
    { skin: '#1c2636', top: '#4a6280', belly: '#8a9aac', light: '#ffbf5a', lightC: '#fff2c8', rim: '#7ab8e0', water: '#06101c', foam: '#d8ecf4', eye: '#ffd27a', brass: '#a8844a' },
    { skin: '#14262a', top: '#3a5e5e', belly: '#8aaca8', light: '#5affd0', lightC: '#e0fff6', rim: '#7ae0d0', water: '#041614', foam: '#d8f4ee', eye: '#9affe0', brass: '#7a9a7a' },
    { skin: '#22182a', top: '#523e62', belly: '#a890a8', light: '#ff6a7a', lightC: '#ffe0e4', rim: '#e08ab0', water: '#12061a', foam: '#f0dcec', eye: '#ff8a9a', brass: '#9a6a6a' },
  ];
  const KN_LIGHTS = [[-150, -66, 6], [-112, -96, 7], [-72, -124, 8], [-30, -146, 8], [12, -164, 7], [-92, -62, 6], [-46, -88, 7], [-4, -110, 7], [36, -132, 6],
    [-134, -36, 5], [-60, -44, 5], [-160, -100, 4], [-20, -182, 5], [140, -214, 4], [60, -206, 5]];
  function knBody(v) {
    const C = KNP[v];
    return spr('kn:body:' + v, 460, 300, 230, 280, (g) => {
      const body = new Path2D();
      body.moveTo(-218, 14); body.bezierCurveTo(-200, -40, -150, -110, -90, -158);
      body.bezierCurveTo(-30, -204, 40, -236, 110, -234); body.bezierCurveTo(160, -232, 196, -210, 212, -182);
      body.bezierCurveTo(218, -170, 214, -160, 204, -156);
      body.bezierCurveTo(196, -128, 176, -108, 150, -92); body.bezierCurveTo(110, -66, 60, -30, 40, 14); body.closePath();
      const g1 = g.createLinearGradient(-60, -240, 40, 0);
      g1.addColorStop(0, C.top); g1.addColorStop(0.45, C.skin); g1.addColorStop(1, shade(C.skin, -0.5));
      g.fillStyle = g1; g.fill(body);
      g.save(); g.clip(body);
      // throat pleats
      const th = new Path2D(); th.moveTo(206, -156); th.bezierCurveTo(196, -128, 176, -108, 150, -92); th.bezierCurveTo(110, -66, 60, -30, 40, 14);
      th.lineTo(96, 14); th.bezierCurveTo(100, -50, 130, -110, 206, -156); th.closePath();
      const tg = g.createLinearGradient(120, -150, 80, 0); tg.addColorStop(0, mix(C.belly, C.skin, 0.35)); tg.addColorStop(1, mix(C.belly, C.skin, 0.8));
      g.fillStyle = tg; g.fill(th);
      g.strokeStyle = rgba(shade(C.belly, -0.6), 0.8); g.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(196 - i * 6, -150 + i * 4); g.bezierCurveTo(170 - i * 6, -110 + i * 4, 120 - i * 6, -60 + i * 6, 80 - i * 6, 10); g.stroke(); }
      // mouth line
      g.strokeStyle = shade(C.skin, -0.7); g.lineWidth = 3.5;
      g.beginPath(); g.moveTo(208, -160); g.bezierCurveTo(170, -150, 120, -146, 72, -132); g.stroke();
      g.strokeStyle = rgba(C.top, 0.6); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(206, -164); g.bezierCurveTo(170, -154, 120, -150, 72, -136); g.stroke();
      // carved cloud-spiral motifs along the flank
      g.strokeStyle = rgba(C.top, 0.5); g.lineWidth = 1.8;
      const spiral = (cx, cy, r) => {
        g.beginPath();
        for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 1.6, rr = r * (1 - i / 48); g.lineTo(cx + cos(a) * rr, cy + sin(a) * rr * 0.7); }
        g.stroke();
      };
      for (const [cx, cy, r] of [[-120, -120, 14], [-60, -168, 12], [0, -196, 12], [-170, -60, 10], [60, -214, 9]]) spiral(cx, cy, r);
      g.beginPath(); g.moveTo(-200, -30); g.bezierCurveTo(-140, -100, -60, -170, 40, -208); g.stroke();
      g.beginPath(); g.moveTo(-180, -10); g.bezierCurveTo(-120, -70, -40, -130, 50, -170); g.stroke();
      // texture mottling
      for (let i = 0; i < 40; i++) {
        const px = -200 + U.hash(i, 1, 70 + v) * 380, py = -230 + U.hash(i, 2, 70 + v) * 230;
        puff(g, px, py, 4 + U.hash(i, 3) * 10, U.hash(i, 4) > 0.5 ? C.top : shade(C.skin, -0.5), 0.25);
      }
      // rim light on the back
      g.lineWidth = 10; g.strokeStyle = rgba(C.rim, 0.35); g.stroke(body);
      g.restore();
      // highlight along the crown
      g.strokeStyle = rgba('#ffffff', 0.22); g.lineWidth = 3;
      g.beginPath(); g.moveTo(-120, -128); g.bezierCurveTo(-40, -196, 40, -228, 110, -228); g.bezierCurveTo(150, -226, 180, -214, 198, -194); g.stroke();
      g.lineWidth = 2.4; g.strokeStyle = shade(C.skin, -0.7); g.stroke(body);
      // eye socket ridge
      g.fillStyle = shade(C.skin, -0.6); g.beginPath(); g.ellipse(96, -168, 16, 11, -0.15, 0, TAU); g.fill();
      g.strokeStyle = rgba(C.top, 0.8); g.lineWidth = 2;
      g.beginPath(); g.ellipse(96, -170, 19, 14, -0.15, PI * 1.05, PI * 1.95); g.stroke();
      g.beginPath(); g.moveTo(70, -164); g.quadraticCurveTo(80, -150, 100, -152); g.stroke();
      // lantern-light ports (brass rims; glow is live)
      for (const [lx, ly, r] of KN_LIGHTS) {
        g.fillStyle = shade(C.skin, -0.7); g.beginPath(); g.arc(lx, ly, r + 3, 0, TAU); g.fill();
        g.strokeStyle = C.brass; g.lineWidth = 2; g.beginPath(); g.arc(lx, ly, r + 1.5, 0, TAU); g.stroke();
        const lg = g.createRadialGradient(lx - r * 0.3, ly - r * 0.3, 0, lx, ly, r);
        lg.addColorStop(0, C.lightC); lg.addColorStop(0.6, C.light); lg.addColorStop(1, shade(C.light, -0.5));
        g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, r, 0, TAU); g.fill();
      }
      // barnacle clusters
      for (const [bx, by, n] of [[150, -224, 7], [-40, -196, 6], [-150, -100, 5], [30, -220, 5]]) {
        for (let i = 0; i < n; i++) {
          const px = bx + (U.hash(i, 1, bx) - 0.5) * 26, py = by + (U.hash(i, 2, by) - 0.5) * 10, r = 2 + U.hash(i, 3) * 2.5;
          ball(g, px, py, r, pal('#c8c4b4', null, { o: '#4a4a44', d: '#7a786c' }), { lw: 0.8, spec: false });
          g.fillStyle = '#2a2a28'; g.beginPath(); g.arc(px, py - r * 0.2, r * 0.35, 0, TAU); g.fill();
        }
      }
    });
  }
  function knJaw(v) {
    const C = KNP[v];
    return spr('kn:jaw:' + v, 170, 80, 10, 20, (g) => {
      const j = new Path2D(); j.moveTo(0, -4); j.bezierCurveTo(50, -18, 100, -24, 136, -28); j.bezierCurveTo(140, -14, 120, 6, 90, 20); j.bezierCurveTo(60, 34, 20, 30, 0, 14); j.closePath();
      paint(g, j, 0, -28, 140, 60, pal(mix(C.belly, C.skin, 0.45), C.rim, { l: mix(C.belly, C.skin, 0.2), d: mix(C.belly, C.skin, 0.85), o: shade(C.skin, -0.6) }), { lw: 2, hl: 0.2, rimA: 0.5 });
      g.save(); g.clip(j);
      g.strokeStyle = rgba(shade(C.belly, -0.6), 0.8); g.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(10, 4 + i * 5); g.bezierCurveTo(60, -6 + i * 6, 100, -12 + i * 7, 136, -20 + i * 8); g.stroke(); }
      g.restore();
    });
  }
  def('kun', 420, 260, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = KNP[P.v], ph = P.ph;
    const A = poseParams(P, { dx: 0, rise: 0, jaw: 0, tilt: 0 }, { dx: -10, rise: 10, jaw: 0.05, tilt: -0.04 },
      { dx: 24, rise: 16, jaw: 0.32, tilt: 0.05 }, { dx: -10, rise: -12, jaw: 0.1, tilt: -0.05 }, { dx: 0, rise: 8, jaw: 0.2, tilt: -0.03 });
    const WL = -26; // water line
    ctx.translate(x + A.dx * 0.5 + P.shake, y);
    const bob = sin(t * 0.7) * 4 + A.rise;
    // distant tail fluke
    ctx.save(); ctx.translate(-200, WL + 6); ctx.rotate(sin(t * 0.6) * 0.06 - 0.1);
    const fl = new Path2D(); fl.moveTo(-8, 0); fl.quadraticCurveTo(-4, -50, -6, -80); fl.quadraticCurveTo(-40, -110, -60, -140); fl.quadraticCurveTo(-20, -126, 4, -98);
    fl.quadraticCurveTo(30, -132, 66, -136); fl.quadraticCurveTo(36, -110, 10, -80); fl.quadraticCurveTo(8, -40, 12, 0); fl.closePath();
    paint(ctx, fl, -60, -140, 126, 140, pal(shade(C.skin, 0.06), C.rim, { l: C.top }), { lw: 2, hl: 0.25, rimA: 0.4 });
    ctx.restore();
    // far-water sheen behind
    ctx.save(); ctx.translate(A.dx * 0.5, -bob); ctx.translate(0, -60); ctx.rotate(A.tilt); ctx.translate(0, 60);
    // pectoral fin (behind body edge, mostly under water)
    ctx.save(); ctx.translate(30, -60); ctx.rotate(0.5 + sin(t * 0.9) * 0.12);
    const pf = new Path2D(); pf.moveTo(0, 0); pf.bezierCurveTo(40, 10, 90, 40, 110, 70); pf.bezierCurveTo(80, 70, 30, 46, -6, 24); pf.closePath();
    paint(ctx, pf, -6, 0, 116, 70, pal(C.skin, C.rim, { l: C.top }), { lw: 2 });
    ctx.restore();
    put(ctx, knBody(P.v), 0, 0);
    // lights
    const lb = 0.55 + 0.25 * (ph - 1) + P.cp * 0.5;
    KN_LIGHTS.forEach(([lx, ly, r], i) => glow(ctx, lx, ly, r * 5, C.light, lb * (0.7 + 0.3 * sin(t * 1.8 + i * 1.3))));
    // mouth interior + jaw
    if (A.jaw > 0.01) {
      ctx.save();
      const hx = 72, hy = -132;
      const mi = new Path2D(); mi.moveTo(hx, hy); mi.bezierCurveTo(120, -146, 170, -150, 208, -160);
      const ex = hx + cos(-0.12 + A.jaw) * 140, ey = hy + sin(-0.12 + A.jaw) * 140 + 4;
      mi.lineTo(ex, ey); mi.closePath();
      ctx.fillStyle = '#12060c'; ctx.fill(mi);
      // baleen
      ctx.strokeStyle = 'rgba(200,190,170,0.6)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 16; i++) { const u = i / 16; const bx = lerp(hx + 10, 204, u); ctx.beginPath(); ctx.moveTo(bx, lerp(-136, -158, u)); ctx.lineTo(bx - 2, lerp(-136, -158, u) + 8 + A.jaw * 40 * u); ctx.stroke(); }
      glow(ctx, 150, -140, 50, C.light, A.jaw * 1.4);
      ctx.restore();
    }
    ctx.save(); ctx.translate(72, -128); ctx.rotate(A.jaw); put(ctx, knJaw(P.v), 0, 0); ctx.restore();
    // eye
    const blink = ((t + 1.3) % 6.5) < 0.18 ? 0.15 : 1;
    const ec = ph >= 2 ? '#ff4a3a' : C.eye;
    ctx.save(); ctx.beginPath(); ctx.ellipse(96, -168, 12, 8 * blink, -0.15, 0, TAU); ctx.clip();
    const eg = ctx.createRadialGradient(98, -169, 1, 96, -168, 12);
    eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.3, ec); eg.addColorStop(1, shade(ec, -0.6));
    ctx.fillStyle = eg; ctx.fillRect(80, -180, 32, 24);
    ctx.fillStyle = '#05060a'; ctx.beginPath(); ctx.ellipse(99, -168, 2.5, 6, 0, 0, TAU); ctx.fill();
    ctx.restore();
    glow(ctx, 97, -168, 30, ec, (0.6 + P.atk * 0.6 + P.cp * 0.4) * blink);
    // water streaming off the head
    for (let i = 0; i < 9; i++) {
      const k = (t * 0.5 + U.hash(i, 1, 33)) % 1;
      const sx = -60 + U.hash(i, 2, 33) * 260, sy = -200 + U.hash(i, 3, 33) * 60;
      const py = sy + k * (WL + bob - sy);
      ctx.strokeStyle = rgba(C.foam, 0.35 * (1 - k)); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sx, py - 10); ctx.lineTo(sx, py); ctx.stroke();
    }
    if (ph >= 2) {
      for (let i = 0; i < 6; i++) {
        const k = (t * 0.3 + i / 6) % 1;
        puff(ctx, -120 + i * 50, -180 + i * 6 - k * 60, 20 + k * 20, '#05040a', 0.5 * sin(k * PI));
      }
    }
    ctx.restore();
    // water surface over the body
    const wv = (xx) => sin(xx * 0.035 + t * 1.6) * 3 + sin(xx * 0.08 - t * 2.2) * 1.5;
    const water = new Path2D(); water.moveTo(-240, WL + wv(-240));
    for (let xx = -228; xx <= 240; xx += 12) water.lineTo(xx, WL + wv(xx));
    water.quadraticCurveTo(200, 22, 0, 24); water.quadraticCurveTo(-200, 22, -240, WL); water.closePath();
    const wg = ctx.createLinearGradient(0, WL - 4, 0, 20);
    wg.addColorStop(0, rgba(C.water, 0.55)); wg.addColorStop(1, rgba(C.water, 0.95));
    ctx.fillStyle = wg; ctx.fill(water);
    ctx.strokeStyle = rgba(C.foam, 0.45); ctx.lineWidth = 1.5;
    ctx.beginPath(); for (let xx = -240; xx <= 240; xx += 12) (xx === -240 ? ctx.moveTo(xx, WL + wv(xx)) : ctx.lineTo(xx, WL + wv(xx))); ctx.stroke();
    // reflections of the lights
    for (let i = 0; i < 6; i++) {
      const lx = KN_LIGHTS[i][0], wob = sin(t * 2 + i) * 3;
      ctx.fillStyle = rgba(C.light, 0.3 * lb); ctx.fillRect(lx - 6 + wob, WL + 4 + i % 2 * 3, 12, 2);
    }
    // foam where the body meets water
    for (let i = 0; i < 12; i++) {
      const fx = -210 + i * 22 + sin(t + i) * 4;
      if (fx > 60) break;
      puff(ctx, fx, WL + wv(fx) - 1, 9 + sin(t * 2 + i) * 2, C.foam, 0.35);
    }
    if (P.atk > 0.2) {
      for (let i = 0; i < 10; i++) puff(ctx, 140 + i * 10 * P.atk, WL - 10 - sin(i * 0.7) * 40 * P.atk, 14, C.foam, 0.45 * P.atk);
    }
    if (P.cast > 0.02) {
      for (let i = 0; i < 10; i++) { const k = (t * 0.4 + i / 10) % 1; wisp(ctx, -160 + i * 36, -60 - k * 200, 3, C.light, P.cp * (1 - k)); }
    }
  });

  // =============================================================================================
  // 彼岸花妖 lily_demon — red spider-lily spirit: bare stem body crowned by a great bloom-face
  // =============================================================================================
  const LLP = [
    { pet: '#d8202e', petL: '#ff6a5a', petD: '#6a0a1a', stem: '#3a6a3a', face: '#f4e6e0', glow: '#ff5a4a', stam: '#ff8a7a' },
    { pet: '#f0eae4', petL: '#ffffff', petD: '#a89aa0', stem: '#4a6a4a', face: '#fffaf6', glow: '#ffe0d0', stam: '#fff0e0' },
    { pet: '#7a2aa0', petL: '#c87aff', petD: '#2a0a3a', stem: '#2a4a4a', face: '#efe0f6', glow: '#c060ff', stam: '#e0a0ff' },
  ];
  function lilyBloom(v, big) {
    const C = LLP[v];
    const R = big ? 54 : 22;
    return spr('ll:bloom:' + v + big, R * 4.4, R * 4.4, R * 2.2, R * 2.2, (g) => {
      const n = big ? 9 : 6;
      // petals: narrow, wavy, recurved
      for (let i = 0; i < n; i++) {
        const a = -PI / 2 + (i - (n - 1) / 2) * (big ? 0.42 : 0.6) + (i % 2 ? 0.08 : -0.05);
        g.save(); g.rotate(a);
        const L = R * (0.95 + U.hash(i, 1, v) * 0.2), w = R * 0.12;
        const p = new Path2D(); p.moveTo(0, -w * 0.5);
        for (let k = 1; k <= 8; k++) { const u = k / 8; p.lineTo(L * u, -w * (1 - u * 0.6) + sin(u * 14) * w * 0.4 - u * u * R * 0.25); }
        p.quadraticCurveTo(L * 1.12, -R * 0.4, L * 0.98, -R * 0.12);
        for (let k = 8; k >= 1; k--) { const u = k / 8; p.lineTo(L * u, w * (1 - u * 0.6) + sin(u * 14 + 1) * w * 0.4 - u * u * R * 0.25); }
        p.closePath();
        const gr = g.createLinearGradient(0, 0, L, 0);
        gr.addColorStop(0, C.petD); gr.addColorStop(0.35, C.pet); gr.addColorStop(1, C.petL);
        g.fillStyle = gr; g.fill(p);
        g.strokeStyle = rgba(C.petD, 0.9); g.lineWidth = big ? 1.2 : 0.8; g.stroke(p);
        g.restore();
      }
      // stamens: long upward curves with anther dots
      g.lineWidth = big ? 1.4 : 0.9;
      for (let i = 0; i < (big ? 12 : 6); i++) {
        const a = -PI / 2 + (i - (big ? 5.5 : 2.5)) * (big ? 0.24 : 0.4);
        const L = R * (1.6 + U.hash(i, 2, v) * 0.4);
        const ex = cos(a) * L, ey = sin(a) * L;
        g.strokeStyle = C.stam;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(cos(a) * L * 0.4 - sin(a) * R * 0.3, sin(a) * L * 0.6, ex, ey); g.stroke();
        ball(g, ex, ey, big ? 2.6 : 1.4, pal('#ffd27a', null, { o: '#7a4a1a' }), { lw: 0.6, spec: false });
      }
    });
  }
  function llFace(v) {
    const C = LLP[v];
    return spr('ll:face:' + v, 50, 56, 25, 28, (g) => {
      const f = smooth([[-12, -14], [2, -19], [14, -12], [16, 2], [10, 15], [0, 19], [-10, 13], [-14, 0]]);
      paint(g, f, -14, -19, 30, 38, pal(C.face, C.glow, { o: shade(C.pet, -0.4) }), { lw: 1.4, hl: 0.4 });
      // closed eyes with red lashes, red lip
      g.strokeStyle = shade(C.pet, -0.3); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(3, 0); g.quadraticCurveTo(7.5, 3, 12, 0); g.stroke();
      g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(-4.5, 2.5, -1, 0.5); g.stroke();
      g.fillStyle = C.pet; g.beginPath(); g.ellipse(7, 10, 3, 1.4, 0, 0, TAU); g.fill();
      // petal-marks on forehead
      g.fillStyle = C.pet; g.beginPath(); g.moveTo(2, -12); g.quadraticCurveTo(5, -8, 2, -5); g.quadraticCurveTo(-1, -8, 2, -12); g.fill();
    });
  }
  def('lily_demon', 160, 220, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = LLP[P.v];
    const A = poseParams(P, { lean: 0.02 + sin(t * 1.1) * 0.04, dx: 0, reach: 0, open: 0 }, { lean: -0.12, dx: -6, reach: -0.3, open: 0.3 },
      { lean: 0.2, dx: 26, reach: 1, open: 0.6 }, { lean: -0.2, dx: -12, reach: -0.2, open: -0.3 }, { lean: -0.02, dx: 0, reach: 0.4, open: 1 });
    ctx.translate(x + A.dx + P.shake, y);
    // ground cluster of small lilies
    for (const [bx, s, ph] of [[-46, 0.8, 0], [40, 0.9, 1], [-20, 0.65, 2], [62, 0.6, 3]]) {
      ctx.strokeStyle = shade(C.stem, -0.1); ctx.lineWidth = 2;
      const tx = bx + sin(t * 1.3 + ph) * 3, ty = -26 * s - 10;
      ctx.beginPath(); ctx.moveTo(bx, 0); ctx.quadraticCurveTo(bx, ty * 0.5, tx, ty); ctx.stroke();
      ctx.save(); ctx.translate(tx, ty); ctx.scale(s, s); put(ctx, lilyBloom(P.v, 0), 0, 0); ctx.restore();
    }
    glow(ctx, 0, -10, 60, C.glow, 0.2);
    // main stem body (S-curve) with two tendril-arms
    ctx.translate(0, -10); ctx.rotate(A.lean); ctx.translate(0, 10);
    const hx = 10 + sin(t * 1.1) * 4 + A.reach * 20, hy = -168;
    const stem = [[0, 0], [-6, -50], [8, -100], [hx - 6, -140], [hx, hy + 16]];
    const sp = sampleCR(stem, 6), fr = spineFrame(sp);
    const rad = sp.map((_, i) => lerp(8, 5, i / (sp.length - 1)));
    tube(ctx, sp, rad, { b: C.stem, l: shade(C.stem, 0.35), d: shade(C.stem, -0.45), o: shade(C.stem, -0.65), rim: C.glow }, { fr, lw: 1.4 });
    // arms (stamen-tendrils)
    for (const [s, ph] of [[-1, 0], [1, 1]]) {
      const bx = 6 + s * 2, by = -120;
      const reach = s > 0 ? A.reach : -A.reach * 0.3;
      const ex = bx + s * (40 + reach * 50), ey = by + 10 - reach * 20 + sin(t * 1.6 + ph) * 8;
      const pts = sampleCR([[bx, by], [bx + s * 16, by - 14], [lerp(bx, ex, 0.7), ey - 18 + sin(t * 2 + ph) * 6], [ex, ey]], 5);
      ctx.strokeStyle = shade(C.stem, -0.5); ctx.lineWidth = 4.2;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.strokeStyle = C.stem; ctx.lineWidth = 2.6; ctx.stroke();
      // petal claws
      for (let k = -1; k <= 1; k++) {
        const a = (s > 0 ? 0 : PI) + k * 0.5 + sin(t * 2 + k) * 0.1;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
        const p = new Path2D(); p.moveTo(0, -2); p.quadraticCurveTo(10, -6, 18, -2 + k * 2); p.quadraticCurveTo(10, 3, 0, 2); p.closePath();
        ctx.fillStyle = C.pet; ctx.fill(p); ctx.strokeStyle = C.petD; ctx.lineWidth = 0.8; ctx.stroke(p);
        ctx.restore();
      }
    }
    // leaf-collar
    for (let k = 0; k < 4; k++) {
      const a = PI * 0.6 + k * 0.6;
      ctx.save(); ctx.translate(hx, hy + 20); ctx.rotate(a + sin(t + k) * 0.05);
      const p = new Path2D(); p.moveTo(0, -3); p.quadraticCurveTo(14, -6, 26, 0); p.quadraticCurveTo(14, 4, 0, 3); p.closePath();
      ctx.fillStyle = shade(C.stem, 0.1); ctx.fill(p); ctx.strokeStyle = shade(C.stem, -0.6); ctx.lineWidth = 1; ctx.stroke(p);
      ctx.restore();
    }
    // great bloom (behind face)
    glow(ctx, hx, hy - 20, 90, C.glow, 0.35 + P.cp * 0.4);
    ctx.save(); ctx.translate(hx, hy + 6); ctx.rotate(sin(t * 0.9) * 0.04); ctx.scale(1 + A.open * 0.12, 1 + A.open * 0.12);
    put(ctx, lilyBloom(P.v, 1), 0, 0);
    ctx.restore();
    ctx.save(); ctx.translate(hx + 4, hy - 4); ctx.rotate(0.06); ctx.scale(1.25, 1.25);
    put(ctx, llFace(P.v), 0, 0);
    if (P.atk > 0.2 || P.cast > 0.2) {
      const ea = max(P.atk, P.cp);
      ctx.fillStyle = rgba('#ffffff', ea); ctx.beginPath(); ctx.ellipse(7.5, 1, 3, 1.3, 0, 0, TAU); ctx.ellipse(-4.5, 1, 2.2, 1, 0, 0, TAU); ctx.fill();
      glow(ctx, 7.5, 1, 10, C.glow, ea); glow(ctx, -4.5, 1, 7, C.glow, ea * 0.8);
    }
    ctx.restore();
    // drifting petals
    for (let i = 0; i < 9; i++) {
      const k = (t * 0.18 + U.hash(i, 1, 21)) % 1;
      const px = hx - 20 - k * 120 + sin(t * 1.5 + i) * 14 + P.atk * 80, py = hy + (U.hash(i, 2, 21) - 0.3) * 120 + k * 60;
      ctx.save(); ctx.translate(px, py); ctx.rotate(t * 2 + i); ctx.globalAlpha = sin(k * PI);
      ctx.fillStyle = C.pet; ctx.beginPath(); ctx.ellipse(0, 0, 5, 1.6, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  });

  // =============================================================================================
  // 無面鬼 faceless — tall robed ghost with a blank egg-smooth face, long hair, long sleeves
  // =============================================================================================
  const FLP = [
    { robe: '#1e1e2a', robeL: '#4a4a62', face: '#f2f0ec', hair: '#0a0a10', glow: '#a8c8ff', inner: '#7a2a3a' },
    { robe: '#2a1a1a', robeL: '#6a3a3a', face: '#f4ecea', hair: '#0c0808', glow: '#ff9a8a', inner: '#3a1a4a' },
    { robe: '#e8e4dc', robeL: '#ffffff', face: '#fafaf8', hair: '#121214', glow: '#d0e8ff', inner: '#4a5a7a' },
  ];
  function flBody(v) {
    const C = FLP[v];
    return spr('fl:body:' + v, 150, 240, 75, 226, (g) => {
      const R = pal(C.robe, C.glow, { l: C.robeL, o: shade(C.robe, v === 2 ? -0.5 : -0.6) });
      // back hair curtain
      const hair = smooth([[-10, -214], [6, -218], [10, -196], [2, -150], [-8, -110], [-22, -112], [-26, -150], [-24, -196]]);
      paint(g, hair, -26, -218, 36, 108, pal(C.hair, '#3a4a6a', { l: '#2a2a36' }), { lw: 1.2, hl: 0.2 });
      // robe: long narrow, trailing into wisps
      const robe = new Path2D();
      robe.moveTo(-14, -186); robe.bezierCurveTo(6, -192, 20, -184, 24, -170);
      robe.bezierCurveTo(28, -120, 30, -70, 34, -30);
      robe.quadraticCurveTo(26, -16, 20, -6); robe.quadraticCurveTo(12, -20, 6, -2); robe.quadraticCurveTo(-2, -18, -10, -4); robe.quadraticCurveTo(-16, -18, -26, -10);
      robe.bezierCurveTo(-28, -60, -26, -120, -22, -170); robe.closePath();
      paint(g, robe, -28, -192, 62, 190, R, { lw: 1.8, hl: 0.3 });
      g.save(); g.clip(robe);
      g.strokeStyle = rgba(shade(C.robe, -0.5), 0.6); g.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 6, -170); g.quadraticCurveTo(i * 8, -100, i * 10 + 2, -10); g.stroke(); }
      // inner collar / layered lapel
      g.strokeStyle = C.inner; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-4, -186); g.quadraticCurveTo(10, -170, 20, -150); g.stroke();
      g.strokeStyle = rgba('#ffffff', 0.5); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-6, -184); g.quadraticCurveTo(8, -168, 18, -146); g.stroke();
      g.restore();
      // the blank face
      const f = smooth([[-6, -214], [8, -220], [18, -210], [20, -196], [14, -182], [2, -178], [-8, -186], [-10, -202]]);
      const fg2 = g.createRadialGradient(10, -206, 2, 6, -198, 22);
      fg2.addColorStop(0, '#ffffff'); fg2.addColorStop(0.6, C.face); fg2.addColorStop(1, shade(C.face, -0.35));
      g.fillStyle = fg2; g.fill(f); g.strokeStyle = shade(C.face, -0.55); g.lineWidth = 1.2; g.stroke(f);
      // faint brow & nose shading only
      g.save(); g.clip(f);
      puff(g, 14, -196, 6, shade(C.face, -0.2), 0.5);
      puff(g, 8, -203, 8, shade(C.face, -0.12), 0.35);
      g.restore();
      // front hair (center part, framing)
      const fh = new Path2D(); fh.moveTo(-10, -204); fh.quadraticCurveTo(-4, -226, 10, -222); fh.quadraticCurveTo(20, -218, 20, -206);
      fh.quadraticCurveTo(14, -216, 6, -214); fh.quadraticCurveTo(-2, -212, -6, -196); fh.closePath();
      g.fillStyle = C.hair; g.fill(fh);
      const lock = new Path2D(); lock.moveTo(18, -208); lock.bezierCurveTo(24, -190, 18, -170, 24, -140); lock.quadraticCurveTo(16, -168, 14, -190); lock.closePath();
      g.fill(lock);
      // bottom fade into nothing
      g.globalCompositeOperation = 'destination-out';
      const fgb = g.createLinearGradient(0, -80, 0, -2); fgb.addColorStop(0, 'rgba(0,0,0,0)'); fgb.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = fgb; g.fillRect(-75, -80, 150, 94);
      g.globalCompositeOperation = 'source-over';
    });
  }
  def('faceless', 110, 220, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = FLP[P.v];
    const A = poseParams(P, { fa: 0.25, ba: -0.15, lean: 0.03, dx: 0, rise: 0 }, { fa: 2.2, ba: -0.8, lean: -0.1, dx: -6, rise: 6 },
      { fa: 1.5, ba: -0.3, lean: 0.25, dx: 36, rise: -4 }, { fa: -0.1, ba: -0.6, lean: -0.2, dx: -14, rise: 0 }, { fa: 2.6, ba: -2.6, lean: 0, dx: 0, rise: 10 });
    ctx.translate(x + A.dx + P.shake, y);
    mist(ctx, 0, -8, 90, 14, t, C.robeL, 0.25, 5, 31);
    const fl = -12 + sin(t * 1.2) * 4 - A.rise;
    ctx.translate(0, fl); ctx.translate(0, -100); ctx.rotate(A.lean); ctx.translate(0, 100);
    const R = pal(C.robe, C.glow, { l: C.robeL, o: shade(C.robe, -0.6) });
    const sleeveArm = (sx, sy, a, len, front) => {
      const ex = sx + sin(a) * len, ey = sy + cos(a) * len;
      const p = smooth([[sx - 6, sy - 4], [sx + 6, sy - 2], [ex + 9, ey], [ex + 6, ey + 22 + sin(t * 1.5) * 4], [ex - 8, ey + 18], [sx - 8, sy + 10]]);
      paint(ctx, p, min(sx, ex) - 10, sy - 4, abs(ex - sx) + 20, abs(ey - sy) + 30, front ? R : pal(shade(C.robe, -0.25), C.glow, { o: R.o }), { lw: 1.6, hl: 0.25 });
      // long pale fingers
      ctx.strokeStyle = shade(C.face, -0.15); ctx.lineWidth = 1.6;
      for (let k = 0; k < 4; k++) {
        const fa = a + (k - 1.5) * 0.15;
        ctx.beginPath(); ctx.moveTo(ex, ey + 4); ctx.quadraticCurveTo(ex + sin(fa) * 10, ey + 4 + cos(fa) * 10, ex + sin(fa + 0.2) * 18, ey + 4 + cos(fa + 0.2) * 18); ctx.stroke();
      }
    };
    sleeveArm(-14, -176, A.ba, 54, false);
    put(ctx, flBody(P.v), 0, 0);
    // face vortex on attack / cast (no gore: a soft swirl of darkness)
    const vo = max(P.atk, P.cp * 0.8);
    if (vo > 0.02) {
      ctx.save(); ctx.translate(7, -199);
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = rgba(C.inner, 0.7 * vo); ctx.lineWidth = 2;
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) { const a = k / 24 * TAU * 1.2 + t * 3 + i * 2; const r = 2 + k * 0.35 * vo; ctx.lineTo(cos(a) * r, sin(a) * r * 1.2); }
        ctx.stroke();
      }
      ctx.restore();
      glow(ctx, 7, -199, 22, C.glow, 0.5 * vo);
    }
    // faint sheen sliding over the blank face
    const sh = ((t * 0.3) % 1);
    ctx.save(); const fp = new Path2D(); fp.ellipse(6, -199, 13, 20, 0.1, 0, TAU); ctx.clip(fp);
    ctx.fillStyle = rgba('#ffffff', 0.25); ctx.fillRect(-10 + sh * 40, -222, 4, 46); ctx.restore();
    sleeveArm(16, -174, A.fa, 54, true);
    // trailing robe wisps
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.4 + i / 4) % 1;
      puff(ctx, -20 + i * 12 - k * 30, -10 + k * -10, 10, C.robeL, 0.25 * (1 - k));
    }
  });

  // =============================================================================================
  // 燈塔守 tower_warden — brass & lamplight construct: lantern-room head with Fresnel lens beam
  // =============================================================================================
  const TWP = [
    { brass: '#c09048', iron: '#3a3e48', light: '#ffe08a', ghost: '#8ad8ff', glass: '#bfe8ff', rim: '#ffe6b0', red: '#a8302a' },
    { brass: '#8aa070', iron: '#30403a', light: '#c8ffb0', ghost: '#7affc8', glass: '#d0ffe8', rim: '#e0ffc8', red: '#3a6a5a' },
    { brass: '#a87ab0', iron: '#3a3048', light: '#ffc0f0', ghost: '#c08aff', glass: '#f0d8ff', rim: '#ffd0f8', red: '#5a2a7a' },
  ];
  function twBody(v) {
    const C = TWP[v];
    return spr('tw:body:' + v, 200, 300, 100, 290, (g) => {
      const B = pal(C.brass, C.rim), Bd = pal(shade(C.brass, -0.3), C.rim), I = pal(C.iron, C.rim, { l: shade(C.iron, 0.4) });
      // legs: piston pipes & flared feet
      for (const [lx, fx, dark] of [[-18, -34, 1], [18, 32, 0]]) {
        limb(g, lx, -96, fx, -18, 9, 7, dark ? pal(shade(C.iron, -0.3)) : I, 1.8);
        const sleeveP = capsule(lx, -96, lerp(lx, fx, 0.45), -60, 12, 10);
        paint(g, sleeveP, min(lx, fx) - 12, -100, 30, 44, dark ? Bd : B, { lw: 1.8, hl: 0.45 });
        const ft = new Path2D(); ft.moveTo(fx - 18, 0); ft.lineTo(fx - 12, -18); ft.lineTo(fx + 14, -18); ft.lineTo(fx + 22, 0); ft.closePath();
        paint(g, ft, fx - 18, -18, 40, 18, dark ? Bd : B, { lw: 1.8, hl: 0.4 });
        for (let k = 0; k < 3; k++) ball(g, fx - 8 + k * 10, -8, 1.6, B, { lw: 0.6, spec: false });
      }
      // gallery skirt (like the lighthouse balcony)
      const gal = new Path2D(); gal.ellipse(0, -100, 56, 12, 0, 0, TAU);
      paint(g, gal, -56, -112, 112, 24, I, { lw: 2, hl: 0.4 });
      g.strokeStyle = C.brass; g.lineWidth = 1.4;
      for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(i * 10, -104); g.lineTo(i * 10, -88 + abs(i) * 0.6); g.stroke(); }
      g.beginPath(); g.ellipse(0, -90, 56, 10, 0, 0, PI); g.stroke();
      // tower torso (tapered, white & red bands)
      const tor = new Path2D(); tor.moveTo(-36, -104); tor.lineTo(-28, -186); tor.lineTo(28, -186); tor.lineTo(36, -104); tor.closePath();
      paint(g, tor, -36, -186, 72, 82, pal('#e8e2d4', C.rim, { o: '#5a5040' }), { lw: 2, hl: 0.4 });
      g.save(); g.clip(tor);
      g.fillStyle = C.red; g.fillRect(-40, -150, 80, 18); g.fillRect(-40, -186, 80, 10);
      const sg = g.createLinearGradient(-36, 0, 36, 0); sg.addColorStop(0, 'rgba(255,255,255,0.2)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,20,0.4)');
      g.fillStyle = sg; g.fillRect(-40, -190, 80, 90);
      // door & porthole
      const dr = new Path2D(); dr.moveTo(-8, -104); dr.lineTo(-8, -124); dr.arc(0, -124, 8, PI, TAU); dr.lineTo(8, -104); dr.closePath();
      paint(g, dr, -8, -132, 16, 28, I, { lw: 1.4 });
      g.restore();
      // gauge dial on chest
      ball(g, 18, -164, 8, B, { lw: 1.4, spec: false });
      g.fillStyle = '#f4ecd8'; g.beginPath(); g.arc(18, -164, 5.5, 0, TAU); g.fill();
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 0.8; for (let i = 0; i < 8; i++) { const a = i * PI / 4; g.beginPath(); g.moveTo(18 + cos(a) * 4, -164 + sin(a) * 4); g.lineTo(18 + cos(a) * 5.4, -164 + sin(a) * 5.4); g.stroke(); }
      // rivets on bands
      for (let i = -3; i <= 3; i++) ball(g, i * 9, -141, 1.4, B, { lw: 0.5, spec: false });
      // upper gallery & lantern-room frame (glass drawn live)
      const ug = new Path2D(); ug.ellipse(0, -188, 42, 9, 0, 0, TAU);
      paint(g, ug, -42, -197, 84, 18, I, { lw: 2, hl: 0.4 });
      // shoulder gears
      for (const [gx, s] of [[-40, 1], [40, 0]]) {
        ball(g, gx, -170, 12, s ? Bd : B, { lw: 1.8 });
        g.fillStyle = shade(C.brass, -0.6); g.beginPath(); g.arc(gx, -170, 4, 0, TAU); g.fill();
      }
      // roof cupola
      const rf = new Path2D(); rf.moveTo(-34, -238); rf.quadraticCurveTo(0, -268, 34, -238); rf.closePath();
      paint(g, rf, -34, -260, 68, 22, B, { lw: 2, hl: 0.55 });
      ball(g, 0, -256, 5, B, { lw: 1.2 });
      g.strokeStyle = C.iron; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -260); g.lineTo(0, -272); g.stroke();
    });
  }
  function twFrame(v) {
    const C = TWP[v];
    return spr('tw:frame:' + v, 90, 60, 45, 250, (g) => {
      g.lineCap = 'round';
      g.strokeStyle = shade(C.iron, -0.3); g.lineWidth = 4;
      for (const mx of [-30, -12, 8, 26]) { g.beginPath(); g.moveTo(mx, -194); g.lineTo(mx * 1.05, -238); g.stroke(); }
      g.strokeStyle = C.brass; g.lineWidth = 2;
      for (const mx of [-30, -12, 8, 26]) { g.beginPath(); g.moveTo(mx, -194); g.lineTo(mx * 1.05, -238); g.stroke(); }
      g.beginPath(); g.moveTo(-34, -238); g.lineTo(34, -238); g.stroke();
    });
  }
  def('tower_warden', 180, 270, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = TWP[P.v];
    const A = poseParams(P, { fa: 0.35 + sin(t * 1.4) * 0.05, ba: -0.25, lean: 0, dx: 0, beam: 1 }, { fa: 2.6, ba: -0.5, lean: -0.06, dx: -6, beam: 1.3 },
      { fa: 1.2, ba: -0.4, lean: 0.12, dx: 26, beam: 2 }, { fa: -0.1, ba: -0.6, lean: -0.12, dx: -12, beam: 0.3 }, { fa: 2.0, ba: -2.0, lean: 0, dx: 0, beam: 2.2 });
    ctx.translate(x + A.dx + P.shake, y);
    ctx.translate(0, -100); ctx.rotate(A.lean); ctx.translate(0, 100);
    const B = pal(C.brass, C.rim), I = pal(C.iron, C.rim, { l: shade(C.iron, 0.4) });
    // back arm: piston + chain-hung lantern
    const bs = [-40, -170], be = chain(bs[0], bs[1], A.ba, 30), bh = chain(be[0], be[1], A.ba + 0.2, 26);
    limb(ctx, bs[0], bs[1], be[0], be[1], 7, 6, pal(shade(C.iron, -0.3)), 1.6);
    limb(ctx, be[0], be[1], bh[0], bh[1], 6, 5, pal(shade(C.brass, -0.3)), 1.6);
    ctx.strokeStyle = shade(C.iron, -0.4); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(bh[0], bh[1]); ctx.lineTo(bh[0], bh[1] + 14); ctx.stroke();
    const lan = new Path2D(); lan.roundRect(bh[0] - 9, bh[1] + 14, 18, 24, 4);
    ctx.fillStyle = rgba(C.light, 0.85); ctx.fill(lan); ctx.strokeStyle = shade(C.brass, -0.4); ctx.lineWidth = 2; ctx.stroke(lan);
    glow(ctx, bh[0], bh[1] + 26, 30, C.light, 0.6 + 0.2 * sin(t * 5));
    put(ctx, twBody(P.v), 0, 0);
    // lantern room: glass + ghost light + rotating lens
    const glass = new Path2D(); glass.moveTo(-32, -194); glass.lineTo(-36, -238); glass.lineTo(36, -238); glass.lineTo(32, -194); glass.closePath();
    ctx.save(); ctx.clip(glass);
    const gg = ctx.createLinearGradient(-36, 0, 36, 0);
    gg.addColorStop(0, rgba(C.glass, 0.5)); gg.addColorStop(0.5, rgba(C.glass, 0.15)); gg.addColorStop(1, rgba(C.glass, 0.35));
    ctx.fillStyle = '#10141c'; ctx.fill(glass); ctx.fillStyle = gg; ctx.fill(glass);
    // ghost keeper flame within
    flame(ctx, 0, -200, 18, 30, t, C.ghost, '#ffffff', 2, 0.8);
    // Fresnel lens: rotating ribbed barrel
    const rot = t * 1.2 * A.beam;
    for (let i = 0; i < 8; i++) {
      const a = rot + i * TAU / 8, xx = sin(a) * 16, z = cos(a);
      if (z < -0.1) continue;
      ctx.fillStyle = rgba(C.light, 0.25 + z * 0.4); ctx.fillRect(xx - 3 * z, -230, 6 * z, 30);
    }
    ctx.restore();
    put(ctx, twFrame(P.v), 0, 0);
    // beam sweep
    const bang = sin(t * 0.9 * A.beam) * 0.5 + (P.atk > 0 ? -0.2 * P.atk : 0);
    const facing = cos(rot);
    ctx.save(); ctx.translate(0, -216); ctx.rotate(bang); ctx.globalCompositeOperation = 'lighter';
    const bl = 220 + P.atk * 120, ba = 0.18 + 0.12 * abs(facing) + P.atk * 0.4 + P.cp * 0.2;
    const bg = ctx.createLinearGradient(0, 0, bl, 0);
    bg.addColorStop(0, rgba(C.light, ba)); bg.addColorStop(1, rgba(C.light, 0));
    ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(10, -8); ctx.lineTo(bl, -40 - P.atk * 20); ctx.lineTo(bl, 40 + P.atk * 20); ctx.lineTo(10, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    glow(ctx, 0, -216, 50, C.light, 0.55 + 0.2 * abs(facing) + P.cp * 0.4);
    // front arm: piston with big brass hook
    const fs = [40, -170], fe = chain(fs[0], fs[1], A.fa, 30), fh = chain(fe[0], fe[1], A.fa + 0.4, 26);
    limb(ctx, fs[0], fs[1], fe[0], fe[1], 7.5, 6.5, I, 1.6);
    ball(ctx, fe[0], fe[1], 6.5, B, { lw: 1.4 });
    limb(ctx, fe[0], fe[1], fh[0], fh[1], 6.5, 5.5, B, 1.6);
    ctx.save(); ctx.translate(fh[0], fh[1]); ctx.rotate(-A.fa * 0.6);
    ctx.strokeStyle = shade(C.brass, -0.55); ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.arc(10, 22, 10, PI, PI * 0.1, true); ctx.stroke();
    ctx.strokeStyle = C.brass; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    ball(ctx, fh[0], fh[1], 6, B, { lw: 1.4 });
    // gear spin indicator on shoulders
    for (const gx of [-40, 40]) {
      ctx.strokeStyle = shade(C.brass, 0.3); ctx.lineWidth = 1.6;
      for (let k = 0; k < 4; k++) { const a = t * 2 * (gx > 0 ? 1 : -1) + k * PI / 2; ctx.beginPath(); ctx.moveTo(gx + cos(a) * 5, -170 + sin(a) * 5); ctx.lineTo(gx + cos(a) * 10, -170 + sin(a) * 10); ctx.stroke(); }
    }
    // steam puffs from vents
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.5 + i / 4) % 1;
      puff(ctx, 30 + k * 16, -250 - k * 40, 6 + k * 12, '#e8ecf0', 0.35 * (1 - k));
    }
    if (P.cast > 0.02) {
      for (let i = 0; i < 8; i++) { const a = t * 1.5 + i * TAU / 8; wisp(ctx, cos(a) * 60, -216 + sin(a) * 30, 2.5, C.ghost, P.cp); }
    }
  });

  // =============================================================================================
  // 萬象童子 jewel_child — playful self-transforming prismatic jewel entity of 一息界
  // =============================================================================================
  function sparkle(ctx, x, y, r, col, a) {
    if (a <= 0.02) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r * 0.3, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r * 0.3, y); ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.moveTo(x - r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y - r * 0.25); ctx.quadraticCurveTo(x, y, x + r * 0.7, y); ctx.quadraticCurveTo(x, y, x, y + r * 0.25); ctx.quadraticCurveTo(x, y, x - r * 0.7, y);
    ctx.fill(); ctx.restore();
  }
  function gemShapeR(th, w) {
    const diamond = 1 / (abs(cos(th)) + abs(sin(th))) * 1.05;
    const star = 0.62 + 0.38 * pow01(abs(cos(2.5 * (th + PI / 2))), 2.5);
    const hm = ((th % (PI / 3)) + PI / 3) % (PI / 3);
    const hex = cos(PI / 6) / cos(hm - PI / 6);
    const flower = 0.82 + 0.18 * cos(8 * th);
    return diamond * w[0] + star * w[1] + hex * w[2] + flower * w[3];
  }
  function pow01(v, p) { return Math.pow(v, p); }
  def('jewel_child', 160, 200, (ctx, x, y, t, o) => {
    const P = pose(o, t);
    const H0 = [300, 170, 40][P.v];
    const A = poseParams(P, { dx: 0, spike: 0, sc: 1, rise: 0, hand: 0 }, { dx: -6, spike: 0.3, sc: 0.9, rise: 6, hand: -0.5 },
      { dx: 30, spike: 1, sc: 1.15, rise: -4, hand: 1 }, { dx: -12, spike: 0, sc: 0.85, rise: -4, hand: -0.3 }, { dx: 0, spike: 0.5, sc: 1.1, rise: 10, hand: 0.4 });
    const hue = H0 + t * 50;
    const cy = -112 + sin(t * 1.7) * 8 - A.rise;
    ctx.translate(x + A.dx + P.shake, y);
    // prismatic shadow
    ctx.save(); ctx.scale(1, 0.25); hglow(ctx, 0, 0, 50, hue, 90, 60, 0.4); ctx.restore();
    ctx.translate(0, cy); ctx.scale(1.3, 1.3);
    hglow(ctx, 0, 0, 90, hue + 60, 100, 60, 0.3 + P.cp * 0.3);
    // halo of rotating geometry
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const n = 3 + k * 2, r = 52 + k * 12 + P.cp * 20, a0 = t * (0.6 - k * 0.45);
      ctx.strokeStyle = hsl(hue + k * 90, 100, 65, 0.45);
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = a0 + i * TAU / n; ctx.lineTo(cos(a) * r, sin(a) * r * 0.9); } ctx.stroke();
    }
    ctx.restore();
    // morphing jewel body
    const cyc = t * 0.55;
    const w = [0, 1, 2, 3].map((k) => max(0, cos(cyc - k * TAU / 4)) ** 3);
    w[1] += A.spike * 2;
    const ws = w.reduce((a, b) => a + b, 0) || 1;
    for (let k = 0; k < 4; k++) w[k] /= ws;
    const N = 28, R = 36 * A.sc;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const th = i * TAU / N + t * 0.25;
      const r = R * gemShapeR(th, w) * (1 + 0.04 * sin(t * 4 + i));
      pts.push([cos(th) * r, sin(th) * r * 1.08]);
    }
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N];
      const ang = atan2((a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
      const lit = 0.5 + 0.5 * cos(ang + PI * 0.75);
      ctx.fillStyle = hsl(hue + i * 13, 90, 32 + lit * 38 + (i % 2) * 6);
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.closePath(); ctx.fill();
    }
    // table facet
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * 0.52, p[1] * 0.52 - 4) : ctx.moveTo(p[0] * 0.52, p[1] * 0.52 - 4))); ctx.closePath();
    const tg = ctx.createLinearGradient(-20, -24, 20, 16);
    tg.addColorStop(0, hsl(hue + 180, 100, 88, 0.85)); tg.addColorStop(1, hsl(hue + 220, 100, 60, 0.5));
    ctx.fillStyle = tg; ctx.fill();
    ctx.strokeStyle = hsl(hue + 200, 100, 92, 0.8); ctx.lineWidth = 1; ctx.stroke();
    // facet lines & outline
    ctx.strokeStyle = hsl(hue + 40, 100, 85, 0.45); ctx.lineWidth = 0.8;
    for (let i = 0; i < N; i += 2) { ctx.beginPath(); ctx.moveTo(pts[i][0] * 0.52, pts[i][1] * 0.52 - 4); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.strokeStyle = hsl(hue - 30, 80, 25); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = hsl(hue + 120, 100, 70, 0.5); ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
    // face (looks right)
    const blink = ((t + 0.7) % 3.6) < 0.12 ? 0.15 : 1;
    for (const [ex, s] of [[-4, 0.85], [13, 1]]) {
      ctx.save(); ctx.translate(ex, -4); ctx.scale(s, s * blink);
      ctx.fillStyle = '#1a0c2a'; ctx.beginPath(); ctx.ellipse(0, 0, 5.2, 6.6, 0, 0, TAU); ctx.fill();
      const ig = ctx.createRadialGradient(1, 1.5, 0, 1, 1.5, 5);
      ig.addColorStop(0, hsl(hue + 150, 100, 75)); ig.addColorStop(1, hsl(hue + 150, 100, 35, 0));
      ctx.fillStyle = ig; ctx.beginPath(); ctx.ellipse(1, 1.5, 4, 4.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1.8, -2.2, 1.9, 0, TAU); ctx.arc(-1.4, 2.4, 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = hsl(hue + 330, 100, 75, 0.45);
    ctx.beginPath(); ctx.ellipse(-8, 5, 4, 2, 0, 0, TAU); ctx.ellipse(18, 5, 4, 2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a0c3a'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (P.atk > 0.2 || P.cast > 0.2) { ctx.ellipse(6, 9, 3.2, 3 + P.atk * 1.5, 0, 0, TAU); ctx.fillStyle = '#3a0c2a'; ctx.fill(); }
    else { ctx.arc(6, 6, 4, 0.3, PI - 0.3); ctx.stroke(); }
    // gem hands
    for (const [s, ph] of [[-1, 0], [1, 1]]) {
      const reach = s > 0 ? A.hand : 0;
      const hx = s * (48 + reach * 46) + sin(t * 2 + ph) * 4, hy = 8 + cos(t * 2.3 + ph) * 6 - reach * 10;
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(t * 1.5 * s);
      const d = new Path2D(); d.moveTo(0, -10); d.lineTo(7, 0); d.lineTo(0, 10); d.lineTo(-7, 0); d.closePath();
      ctx.fillStyle = hsl(hue + 90 + ph * 60, 95, 60); ctx.fill(d);
      ctx.fillStyle = hsl(hue + 90 + ph * 60, 95, 82); ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = hsl(hue + 60, 80, 25); ctx.lineWidth = 1.2; ctx.stroke(d);
      ctx.restore();
      hglow(ctx, hx, hy, 16, hue + 90 + ph * 60, 100, 65, 0.5);
    }
    // crown gems
    for (let i = 0; i < 3; i++) {
      const a = t * 1.2 + i * TAU / 3;
      const gx = cos(a) * 22, gy = -R * 1.2 - 8 + sin(a) * 5, z = sin(a);
      ctx.save(); ctx.translate(gx, gy); ctx.scale(0.8 + z * 0.2, 0.8 + z * 0.2);
      ctx.fillStyle = hsl(hue + i * 120, 100, 65); ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(4, 0); ctx.lineTo(0, 5); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // sparkles
    for (let i = 0; i < 7; i++) {
      const k = (t * 0.6 + U.hash(i, 1, 44)) % 1;
      sparkle(ctx, (U.hash(i, 2, 44) - 0.5) * 120, (U.hash(i, 3, 44) - 0.5) * 120, 5 + U.hash(i, 4) * 4, hsl(hue + i * 50, 100, 85), sin(k * PI));
    }
    if (P.cast > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12 + t;
        ctx.strokeStyle = hsl(hue + i * 30, 100, 70, 0.5 * P.cp); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cos(a) * 40, sin(a) * 40); ctx.lineTo(cos(a) * (80 + P.cp * 30), sin(a) * (80 + P.cp * 30)); ctx.stroke();
      }
      ctx.restore();
    }
  });

  // =============================================================================================
  // 雲蛇 baibu — vast benevolent cloud serpent spirit guide, diamond/triangle back patterns
  // =============================================================================================
  const BBP = [
    { b: '#e6d6b4', l: '#fffaf0', d: '#9a8462', o: '#5a4630', belly: '#fff2dc', pat: '#5a3a20', glow: '#ffd27a', rim: '#9ad8ff', cloud: '#eef2fa', eye: '#ffcc66' },
    { b: '#b8d0e8', l: '#f4faff', d: '#6a84a6', o: '#34465e', belly: '#eaf4ff', pat: '#1e3456', glow: '#8ad8ff', rim: '#ffe6a0', cloud: '#eef4ff', eye: '#a0eaff' },
    { b: '#e8c0c8', l: '#fff4f6', d: '#a07484', o: '#5a3a46', belly: '#fff0f2', pat: '#5a2034', glow: '#ff9ab8', rim: '#c0e0ff', cloud: '#fff0f6', eye: '#ffb0c8' },
  ];
  function bbHead(v) {
    const C = BBP[v];
    return spr('bb:head:' + v, 120, 80, 40, 40, (g) => {
      const P2 = pal(C.b, C.rim, { l: C.l, d: C.d, o: C.o });
      // triangular head with upturned snout
      const hd = new Path2D();
      hd.moveTo(-26, 8); hd.bezierCurveTo(-30, -10, -16, -24, 4, -24); hd.bezierCurveTo(26, -24, 50, -18, 66, -14);
      hd.quadraticCurveTo(76, -20, 78, -12); hd.quadraticCurveTo(76, -2, 62, 2);
      hd.bezierCurveTo(44, 10, 20, 16, 0, 16); hd.bezierCurveTo(-14, 16, -24, 14, -26, 8); hd.closePath();
      paint(g, hd, -30, -24, 108, 40, P2, { lw: 2, hl: 0.5 });
      g.save(); g.clip(hd);
      // belly/lip pale
      g.fillStyle = rgba(C.belly, 0.9); g.beginPath(); g.ellipse(26, 14, 46, 7, -0.05, 0, TAU); g.fill();
      // head triangles pattern
      g.fillStyle = C.pat;
      for (const [tx, ty, s] of [[-8, -16, 1], [14, -18, 0.85], [34, -16, 0.7]]) {
        g.beginPath(); g.moveTo(tx - 8 * s, ty - 4); g.lineTo(tx + 8 * s, ty - 4); g.lineTo(tx, ty + 8 * s); g.closePath(); g.fill();
      }
      g.strokeStyle = rgba(C.glow, 0.8); g.lineWidth = 1;
      for (const [tx, ty, s] of [[-8, -16, 1], [14, -18, 0.85], [34, -16, 0.7]]) {
        g.beginPath(); g.moveTo(tx - 8 * s, ty - 4); g.lineTo(tx + 8 * s, ty - 4); g.lineTo(tx, ty + 8 * s); g.closePath(); g.stroke();
      }
      g.restore();
      // mouth line (gentle smile)
      g.strokeStyle = C.o; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(68, 0); g.quadraticCurveTo(40, 8, 14, 6); g.stroke();
      // eye socket
      g.fillStyle = C.o; g.beginPath(); g.ellipse(30, -6, 6.5, 5, -0.1, 0, TAU); g.fill();
      g.fillStyle = C.o; g.beginPath(); g.ellipse(70, -12, 2, 1.2, -0.3, 0, TAU); g.fill();
    });
  }
  // layered cumulus bank, pre-rendered once per (width, colour, seed); drifts gently with t
  function cloudBank(ctx, x, y, w, col, t, a, seed) {
    const H = w * 0.7;
    const c = spr('cloud:' + w + col + seed, w * 1.5, H, w * 0.75, H * 0.62, (g) => {
      const n = max(3, floor(w / 16));
      const P3 = [];
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) : 0.5;
        const px = (u - 0.5) * w, py = -sin(u * PI) * w * 0.12 + (U.hash(i, 1, seed) - 0.5) * 10;
        P3.push([px, py, (0.6 + U.hash(i, 2, seed) * 0.4) * (0.55 + sin(u * PI) * 0.6) * w * 0.3]);
      }
      for (const [px, py, r] of P3) puff(g, px + r * 0.2, py + r * 0.3, r * 1.1, shade(col, -0.3), 0.35);
      for (const [px, py, r] of P3) puff(g, px, py, r, col, 0.75);
      for (const [px, py, r] of P3) puff(g, px - r * 0.25, py - r * 0.35, r * 0.6, '#ffffff', 0.5);
    });
    const ga = ctx.globalAlpha; ctx.globalAlpha = ga * a;
    put(ctx, c, x + sin(t * 0.3 + seed) * 6, y + sin(t * 0.5 + seed * 2) * 2);
    ctx.globalAlpha = ga;
  }
  def('baibu', 400, 300, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = BBP[P.v];
    const A = poseParams(P, { hx: 186, hy: -246, dx: 0, sw: 1 }, { hx: 160, hy: -270, dx: -8, sw: 0.6 },
      { hx: 236, hy: -200, dx: 16, sw: 0.4 }, { hx: 160, hy: -226, dx: -14, sw: 0.3 }, { hx: 176, hy: -280, dx: 0, sw: 1.5 });
    ctx.translate(x + A.dx + P.shake, y);
    const sw = (q, a) => sin(t * 0.9 + q) * a * A.sw;
    // back cloud banks
    cloudBank(ctx, -120, -70, 200, C.cloud, t, 0.45, 1);
    cloudBank(ctx, 100, -150, 150, C.cloud, t, 0.3, 2);
    const ctrl = [[-214, -70 + sw(0, 6)], [-196, -146 + sw(1, 8)], [-146, -222 + sw(2, 10)], [-74, -262 + sw(3, 10)], [-4, -248 + sw(4, 10)],
      [36, -196 + sw(5, 8)], [24, -136 + sw(6, 8)], [-16, -96 + sw(7, 8)], [-20, -54 + sw(8, 6)], [24, -36 + sw(9, 6)], [86, -58 + sw(10, 6)],
      [128, -118 + sw(11, 6)], [150, -190 + sw(12, 4)], [A.hx - 24, A.hy + 18], [A.hx, A.hy]];
    const pts = sampleCR(ctrl, 6), n = pts.length, fr = spineFrame(pts);
    const rad = pts.map((_, i) => { const u = i / (n - 1); return u < 0.12 ? 6 + u / 0.12 * 18 : u > 0.92 ? lerp(27, 19, (u - 0.92) / 0.08) : 25 + sin(u * PI) * 4; });
    // aura along the body
    for (let i = 0; i < n; i += 6) glow(ctx, pts[i][0], pts[i][1], 70, C.glow, 0.26 + P.cp * 0.2);
    const pattern = (c, p, f, r, i0, i1) => {
      for (let i = i0 + 3; i <= i1 - 2; i += 5) {
        const bx = p[i][0] - f[i][2] * r[i] * 0.2, by = p[i][1] - f[i][3] * r[i] * 0.2;
        const L = r[i] * 0.95, W = r[i] * 0.75;
        const dp = new Path2D();
        dp.moveTo(bx + f[i][0] * L, by + f[i][1] * L); dp.lineTo(bx + f[i][2] * W, by + f[i][3] * W);
        dp.lineTo(bx - f[i][0] * L, by - f[i][1] * L); dp.lineTo(bx - f[i][2] * W, by - f[i][3] * W); dp.closePath();
        c.fillStyle = rgba(C.pat, 0.85); c.fill(dp);
        c.strokeStyle = rgba(C.glow, 0.5 + 0.4 * sin(t * 2 - i * 0.2)); c.lineWidth = 1.4; c.stroke(dp);
        // inner pale diamond
        const s2 = 0.4;
        c.fillStyle = rgba(C.l, 0.7); c.beginPath();
        c.moveTo(bx + f[i][0] * L * s2, by + f[i][1] * L * s2); c.lineTo(bx + f[i][2] * W * s2, by + f[i][3] * W * s2);
        c.lineTo(bx - f[i][0] * L * s2, by - f[i][1] * L * s2); c.lineTo(bx - f[i][2] * W * s2, by - f[i][3] * W * s2); c.closePath(); c.fill();
        // flank triangles toward the belly
        const j = i + 2;
        if (j <= i1) {
          const tx = p[j][0] + f[j][2] * r[j] * 0.35, ty = p[j][1] + f[j][3] * r[j] * 0.35;
          c.fillStyle = rgba(C.pat, 0.55);
          c.beginPath(); c.moveTo(tx - f[j][0] * 6, ty - f[j][1] * 6); c.lineTo(tx + f[j][0] * 6, ty + f[j][1] * 6); c.lineTo(tx + f[j][2] * 10, ty + f[j][3] * 10); c.closePath(); c.fill();
        }
      }
    };
    const TC = { b: C.b, l: C.l, d: C.d, o: C.o, belly: C.belly, rim: C.rim };
    const split = floor(n * 0.5);
    tube(ctx, pts, rad, TC, { fr, i0: 0, i1: split + 1, pattern, noCap: true });
    // cloud wrapped around the lower loop
    cloudBank(ctx, -10, -40, 130, C.cloud, t + 2, 0.6, 3);
    tube(ctx, pts, rad, TC, { fr, i0: split, i1: n - 1, pattern });
    // head
    const hf = fr[n - 1];
    ctx.save(); ctx.translate(A.hx - 6, A.hy); ctx.rotate(atan2(hf[1], hf[0]) * 0.4); ctx.scale(1.15, 1.15);
    // cloud mane
    for (let i = 0; i < 5; i++) puff(ctx, -22 - i * 6, -14 + i * 6 + sin(t + i) * 3, 14, C.cloud, 0.55);
    put(ctx, bbHead(P.v), 0, 0);
    const blink = ((t + 2.1) % 5.2) < 0.15 ? 0.2 : 1;
    ctx.save(); ctx.translate(30, -6); ctx.scale(1, blink);
    const eg = ctx.createRadialGradient(1, -1, 0, 0, 0, 5.5);
    eg.addColorStop(0, '#ffffff'); eg.addColorStop(0.45, C.eye); eg.addColorStop(1, shade(C.eye, -0.4));
    ctx.fillStyle = eg; ctx.beginPath(); ctx.ellipse(0, 0, 5.2, 4, -0.1, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.arc(1.5, 0, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -1.5, 1.2, 0, TAU); ctx.fill();
    ctx.restore();
    glow(ctx, 30, -6, 20, C.eye, 0.6 + P.cp * 0.4);
    ctx.restore();
    // front clouds
    cloudBank(ctx, -170, -36, 120, C.cloud, t + 4, 0.8, 4);
    cloudBank(ctx, 120, -24, 110, C.cloud, t + 5, 0.5, 5);
    // drifting light motes
    for (let i = 0; i < 10; i++) {
      const k = (t * 0.2 + U.hash(i, 1, 55)) % 1;
      sparkle(ctx, -180 + U.hash(i, 2, 55) * 360, -40 - k * 220, 4, C.l, sin(k * PI) * 0.8);
    }
    if (P.atk > 0.2) glow(ctx, A.hx + 70, A.hy, 70 * P.atk, C.glow, 0.6 * P.atk);
    if (P.cast > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 3; r++) {
        const k = (P.st * 0.7 + r / 3) % 1;
        ctx.strokeStyle = rgba(C.glow, (1 - k) * 0.6 * P.cast); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, -150, 60 + k * 160, (60 + k * 160) * 0.5, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
  });

  // =============================================================================================
  // 黑潮・無相 wuxiang — FINAL BOSS.
  //   phase 1: towering black wave-giant studded with drowned lanterns & faces
  //   phase 2: cracked open — a vortex core of stolen soul-light, the faint shape of a man inside
  //   phase 3: formless kaleidoscopic fractal void-shape
  // =============================================================================================
  const WXP = [
    { ink: '#03050b', deep: '#0b1626', top: '#2c4662', flow: '#5aa4c8', foam: '#d8eef6', eye: '#c8f8ff', lan: '#ff8a4a', lanC: '#ffe0a8', soul: '#8ad8ff', h0: 200 },
    { ink: '#020806', deep: '#0a1c18', top: '#2a5248', flow: '#5ac8a8', foam: '#d8f6ee', eye: '#c8ffe8', lan: '#ffb04a', lanC: '#fff0b8', soul: '#8affd0', h0: 150 },
    { ink: '#06030b', deep: '#160c26', top: '#3e2c62', flow: '#a07ad8', foam: '#ece0fa', eye: '#f0d8ff', lan: '#ff6a8a', lanC: '#ffd8e0', soul: '#c8a0ff', h0: 270 },
  ];
  let WX_BODY = null;
  function wxBodyPath() {
    if (WX_BODY) return WX_BODY;
    const b = new Path2D();
    b.moveTo(-176, -20);
    b.bezierCurveTo(-196, -120, -182, -232, -146, -302);
    b.bezierCurveTo(-116, -362, -84, -420, -22, -448);
    b.bezierCurveTo(40, -472, 112, -452, 132, -410);
    b.bezierCurveTo(142, -384, 126, -364, 108, -370);
    b.bezierCurveTo(94, -374, 98, -392, 110, -392);
    b.bezierCurveTo(86, -410, 40, -402, 20, -382);
    b.bezierCurveTo(8, -352, 30, -320, 92, -316);
    b.bezierCurveTo(142, -298, 160, -220, 152, -120);
    b.bezierCurveTo(148, -70, 162, -40, 176, -20);
    b.closePath();
    WX_BODY = b;
    return b;
  }
  const WX_LANTERNS = [[-104, -120], [-62, -206], [-124, -252], [-4, -160], [64, -236], [104, -146], [-34, -296], [34, -96], [-84, -70], [-40, -380], [92, -290]];
  const WX_FACES = [[-90, -170, 1.4], [20, -230, 1.2], [-40, -110, 1.1], [80, -190, 1.0], [-110, -300, 1.0]];
  const WX_CRACK = [[-30, -336], [-8, -312], [-40, -290], [-6, -262], [-44, -230], [-10, -196], [-36, -160], [-14, -118], [24, -128], [52, -160], [30, -196], [64, -232],
    [34, -262], [60, -296], [30, -316], [44, -340]];
  const WX_RAYS = [[[-30, -336], [-70, -380], [-110, -400]], [[44, -340], [80, -380]], [[-44, -230], [-100, -220], [-140, -250]], [[64, -232], [110, -250], [140, -220]],
    [[-14, -118], [-50, -80], [-90, -50]], [[24, -128], [70, -90], [110, -70]], [[-40, -290], [-90, -320]], [[60, -296], [110, -330]]];
  function wxBody(v) {
    const C = WXP[v];
    return spr('wx:body:' + v, 420, 500, 210, 480, (g) => {
      const b = wxBodyPath();
      const gr = g.createLinearGradient(-120, -460, 80, -20);
      gr.addColorStop(0, C.top); gr.addColorStop(0.35, C.deep); gr.addColorStop(1, C.ink);
      g.fillStyle = gr; g.fill(b);
      g.save(); g.clip(b);
      for (let i = 0; i < 50; i++) {
        const px = -180 + U.hash(i, 1, 90 + v) * 340, py = -460 + U.hash(i, 2, 90 + v) * 440;
        puff(g, px, py, 10 + U.hash(i, 3) * 26, U.hash(i, 4) > 0.55 ? C.top : C.ink, 0.22);
      }
      // rim light on the right/bottom edge
      g.lineWidth = 12; g.strokeStyle = rgba(C.flow, 0.25); g.stroke(b);
      g.restore();
      g.lineWidth = 2.6; g.strokeStyle = shade(C.ink, -0.5); g.stroke(b);
      // highlight along the hood
      g.strokeStyle = rgba(C.foam, 0.3); g.lineWidth = 3;
      g.beginPath(); g.moveTo(-140, -300); g.bezierCurveTo(-110, -360, -80, -416, -22, -442); g.bezierCurveTo(40, -464, 108, -446, 126, -410); g.stroke();
      // hood void (face shadow)
      const fv = new Path2D(); fv.moveTo(24, -380); fv.bezierCurveTo(44, -402, 90, -404, 106, -380);
      fv.bezierCurveTo(116, -352, 100, -324, 80, -320); fv.bezierCurveTo(44, -322, 16, -340, 24, -380); fv.closePath();
      const vg = g.createRadialGradient(64, -360, 4, 64, -360, 50);
      vg.addColorStop(0, '#000000'); vg.addColorStop(0.7, rgba(C.ink, 0.95)); vg.addColorStop(1, rgba(C.deep, 0.6));
      g.fillStyle = vg; g.fill(fv);
    });
  }
  function wxLantern(ctx, x, y, C, t, i, a) {
    const bob = sin(t * 1.3 + i * 1.7) * 3;
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(sin(t + i) * 0.15); ctx.globalAlpha *= a;
    glow(ctx, 0, 0, 26, C.lan, 0.55 + 0.25 * sin(t * 2.3 + i));
    const lg = ctx.createRadialGradient(-2, -2, 1, 0, 0, 9);
    lg.addColorStop(0, C.lanC); lg.addColorStop(0.6, C.lan); lg.addColorStop(1, shade(C.lan, -0.5));
    ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(0, 0, 7, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(shade(C.lan, -0.6), 0.8); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 9, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#2a1a10'; ctx.fillRect(-4, -11, 8, 3); ctx.fillRect(-4, 8, 8, 3);
    ctx.restore();
  }
  function wxSea(ctx, C, t, w = 250) {
    const wv = (xx) => sin(xx * 0.03 + t * 1.4) * 6 + sin(xx * 0.07 - t * 2) * 3;
    const sea = new Path2D(); sea.moveTo(-w, 10);
    for (let xx = -w; xx <= w; xx += 10) sea.lineTo(xx, -40 + wv(xx) + (abs(xx) / w) ** 2 * 30);
    sea.lineTo(w, 10); sea.quadraticCurveTo(0, 24, -w, 10); sea.closePath();
    const sg = ctx.createLinearGradient(0, -50, 0, 10);
    sg.addColorStop(0, C.deep); sg.addColorStop(1, C.ink);
    ctx.fillStyle = sg; ctx.fill(sea);
    ctx.strokeStyle = rgba(C.foam, 0.5); ctx.lineWidth = 1.6;
    ctx.beginPath(); for (let xx = -w; xx <= w; xx += 10) { const yy = -40 + wv(xx) + (abs(xx) / w) ** 2 * 30; xx === -w ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy); } ctx.stroke();
    for (let i = 0; i < 14; i++) {
      const fx = -w + 20 + i * (w * 2 - 40) / 13;
      puff(ctx, fx, -40 + wv(fx) + (abs(fx) / w) ** 2 * 30, 12 + sin(t * 2 + i) * 3, C.foam, 0.3);
    }
  }
  function wxGiant(ctx, P, C, t, A) {
    const ph = P.ph;
    // back arm (dissolving into the sea)
    const wtc = { b: C.deep, l: C.top, d: C.ink, o: shade(C.ink, -0.5), rim: C.flow };
    const bp = sampleCR([[-132, -300], [-186, -250 + sin(t) * 6], [-210, -170 + sin(t * 1.2) * 8], [-196, -80], [-180, -30]], 6);
    tube(ctx, bp, bp.map((_, i) => lerp(30, 22, i / (bp.length - 1))), wtc, { lw: 2 });
    put(ctx, wxBody(P.v), 0, 0);
    const body = wxBodyPath();
    ctx.save(); ctx.clip(body);
    // descending flow lines
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const x0 = -150 + i * 40 + U.hash(i, 1, 5) * 16;
      ctx.setLineDash([30 + U.hash(i, 2, 5) * 50, 40 + U.hash(i, 3, 5) * 60]); ctx.lineDashOffset = -t * (30 + i * 4) - i * 37;
      ctx.strokeStyle = rgba(C.flow, 0.16 + 0.08 * (i % 3));
      ctx.beginPath(); ctx.moveTo(x0 + 50, -460); ctx.bezierCurveTo(x0 + 70 + sin(t + i) * 10, -340, x0 - 30, -220, x0 + sin(t * 0.7 + i) * 14, 0); ctx.stroke();
    }
    ctx.setLineDash([]);
    // faces drifting in the water
    for (const [fx, fy, s] of WX_FACES) tgFace(ctx, fx + sin(t * 0.6 + fy) * 6, fy + cos(t * 0.5 + fx) * 6, s, { face: C.foam, deep: C.ink, eye: C.eye }, t, 0.38 + 0.15 * sin(t + fx), 0.6);
    // drowned lanterns
    WX_LANTERNS.forEach(([lx, ly], i) => wxLantern(ctx, lx, ly, C, t, i, ph >= 2 && abs(lx) < 50 ? 0.3 : 0.9));
    ctx.restore();
    // phase 2: cracked open
    if (ph >= 2) {
      const cr = poly(WX_CRACK);
      ctx.save(); ctx.clip(cr);
      const cg = ctx.createRadialGradient(8, -240, 4, 8, -240, 130);
      cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.2, C.soul); cg.addColorStop(0.6, rgba(C.soul, 0.4)); cg.addColorStop(1, C.ink);
      ctx.fillStyle = cg; ctx.fillRect(-80, -360, 180, 260);
      // vortex arms of soul-light
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i < 10; i++) {
          const u = i / 10, a = t * 1.6 + k * TAU / 4 + u * 5;
          const r = 8 + u * 90;
          glow(ctx, 8 + cos(a) * r * 0.55, -238 + sin(a) * r, 5 + (1 - u) * 5, i % 3 ? C.soul : '#ffffff', 0.9 * (1 - u * 0.5));
        }
      }
      // faint shape of a man inside, curled, head bowed
      // curled figure hugging his knees, head bowed (drawn as soft strokes)
      const manStroke = (extra, col) => {
        ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.lineWidth = 17 + extra; ctx.beginPath(); ctx.moveTo(2, -262); ctx.quadraticCurveTo(-16, -244, -10, -212); ctx.stroke();
        ctx.lineWidth = 13 + extra; ctx.beginPath(); ctx.moveTo(-10, -210); ctx.lineTo(22, -228); ctx.stroke();
        ctx.lineWidth = 10 + extra; ctx.beginPath(); ctx.moveTo(22, -228); ctx.lineTo(26, -198); ctx.stroke();
        ctx.lineWidth = 7 + extra; ctx.beginPath(); ctx.moveTo(4, -256); ctx.quadraticCurveTo(14, -236, 22, -236); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(10, -268, 10.5 + extra / 2, 0, TAU); ctx.fill();
      };
      ctx.save(); ctx.translate(0, 8); ctx.globalAlpha = 0.6; manStroke(5, rgba('#ffffff', 0.5)); ctx.globalAlpha = 1;
      manStroke(0, rgba(C.ink, 0.6 + 0.1 * sin(t * 1.3))); ctx.restore();
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = shade(C.ink, -0.5); ctx.stroke(cr);
      // glowing rays across the body
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const ry of WX_RAYS) {
        ctx.beginPath(); ry.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = rgba(C.soul, 0.25); ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = rgba(C.soul, 0.6 + 0.3 * sin(t * 3)); ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.restore();
      glow(ctx, 8, -240, 150, C.soul, 0.35 + 0.1 * sin(t * 2));
      // flakes of black water lifting off
      for (let i = 0; i < 10; i++) {
        const k = (t * 0.25 + U.hash(i, 1, 66)) % 1;
        const fx = (U.hash(i, 2, 66) - 0.5) * 300, fy = -300 - k * 160;
        ctx.save(); ctx.translate(fx, fy); ctx.rotate(t + i); ctx.globalAlpha = sin(k * PI) * 0.8;
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 2); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    // eyes in the hood
    const ea = 0.85 + 0.15 * sin(t * 2.4) + P.atk * 0.4 + P.cp * 0.4;
    for (const [ex, ey, s] of [[52, -362, 1], [84, -360, 0.85]]) {
      ctx.fillStyle = rgba('#ffffff', min(1, ea)); ctx.beginPath(); ctx.ellipse(ex, ey, 6 * s, 3 * s, -0.1, 0, TAU); ctx.fill();
      glow(ctx, ex, ey, 26 * s, ph >= 2 ? C.soul : C.eye, ea);
    }
    // front arm: rising wave with foam claw
    const hx = A.hx, hy = A.hy;
    const fp = sampleCR([[112, -300], [168, -314 + sin(t) * 6], [hx + 8 - (hy < -320 ? 30 : 0), lerp(-314, hy, 0.55)], [hx, hy]], 7);
    const ffr = spineFrame(fp);
    tube(ctx, fp, fp.map((_, i) => lerp(30, 20, i / (fp.length - 1))), wtc, { lw: 2, fr: ffr });
    for (let i = 2; i < fp.length - 2; i += 3) {
      const r = lerp(30, 20, i / (fp.length - 1)), sgn = ffr[i][3] < 0 ? 1 : -1;
      puff(ctx, fp[i][0] + ffr[i][2] * r * sgn * 0.9, fp[i][1] + ffr[i][3] * r * sgn * 0.9, 8 + sin(t * 3 + i) * 2, C.foam, 0.4);
    }
    for (let i = 0; i < 9; i++) {
      const a = -1.2 + i * 0.3 + sin(t * 2 + i) * 0.1;
      puff(ctx, hx + cos(a) * 22, hy + sin(a) * 22, 10, C.foam, 0.55);
      ctx.strokeStyle = rgba(C.foam, 0.8); ctx.lineWidth = 2;
      if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(hx + cos(a) * 16, hy + sin(a) * 16); ctx.quadraticCurveTo(hx + cos(a) * 30, hy + sin(a) * 30 - 6, hx + cos(a + 0.2) * 38, hy + sin(a + 0.2) * 38); ctx.stroke(); }
    }
    wxLantern(ctx, hx - 10, hy - 4, C, t, 99, 0.9);
    // hood crest foam
    for (let i = 0; i < 12; i++) {
      const u = i / 11;
      const fx = lerp(-60, 128, u), fy = -446 + sin(u * PI) * -14 + u * u * 40 + sin(t * 2 + i) * 2;
      puff(ctx, fx, fy, 9 + sin(t * 3 + i) * 2, C.foam, 0.55);
    }
    // drips
    for (let i = 0; i < 8; i++) {
      const k = (t * 0.6 + U.hash(i, 3, 77)) % 1;
      const px = 60 + U.hash(i, 4, 77) * 80, py = -370 + k * 120;
      ctx.fillStyle = rgba(C.foam, 0.5 * (1 - k)); ctx.beginPath(); ctx.ellipse(px, py, 1.6, 3, 0, 0, TAU); ctx.fill();
    }
  }
  function wxVoid(ctx, P, C, t) {
    const hue = C.h0 + t * 30;
    const cy = -240 + sin(t * 0.8) * 8;
    const pul = 1 + 0.04 * sin(t * 2.2) + P.atk * 0.15 + P.cp * 0.1;
    ctx.save(); ctx.translate(0, cy); ctx.scale(pul, pul);
    // void tendrils
    hglow(ctx, 0, 0, 300, hue + 30, 90, 50, 0.3);
    for (let k = 0; k < 12; k++) {
      const a0 = k * TAU / 12 + t * 0.1;
      const pts = [];
      for (let i = 0; i <= 18; i++) {
        const u = i / 18, a = a0 + sin(t * 1.3 + k + u * 4) * 0.35 * u;
        const r = 160 + u * (110 + (k % 3) * 30);
        pts.push([cos(a) * r, sin(a) * r]);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const u = i / (pts.length - 1);
        ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 18 * (1 - u) + 1; ctx.stroke();
      }
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.strokeStyle = hsl(hue + k * 30, 100, 65, 0.45); ctx.lineWidth = 1.6; ctx.stroke();
      wisp(ctx, pts[pts.length - 1][0], pts[pts.length - 1][1], 2, C.soul, 0.7);
    }
    // void disc
    const dg = ctx.createRadialGradient(0, 0, 10, 0, 0, 205);
    dg.addColorStop(0, '#000000'); dg.addColorStop(0.55, C.ink); dg.addColorStop(0.9, hsl(hue + 40, 60, 14)); dg.addColorStop(1, hsl(hue + 60, 80, 30, 0));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, 205, 0, TAU); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    // kaleidoscope: 8 mirrored wedges of recursive triangles
    const K = 8;
    const tri = (x1, y1, x2, y2, x3, y3, d, h) => {
      if (d === 0) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
        ctx.fillStyle = hsl(h, 100, 55, 0.16); ctx.fill(); ctx.strokeStyle = hsl(h + 30, 100, 70, 0.5); ctx.lineWidth = 0.8; ctx.stroke();
        return;
      }
      const ax = (x1 + x2) / 2, ay = (y1 + y2) / 2, bx = (x2 + x3) / 2, by = (y2 + y3) / 2, cx = (x1 + x3) / 2, cy2 = (y1 + y3) / 2;
      tri(x1, y1, ax, ay, cx, cy2, d - 1, h + 20); tri(ax, ay, x2, y2, bx, by, d - 1, h + 40); tri(cx, cy2, bx, by, x3, y3, d - 1, h + 60);
    };
    for (let k = 0; k < K; k++) {
      ctx.save(); ctx.rotate(k * TAU / K + t * 0.15);
      if (k % 2) ctx.scale(1, -1);
      const br = 60 + 18 * sin(t * 1.1);
      tri(br, 0, 185, -30, 185, 30 + 12 * sin(t * 1.7), 3, hue + k * 12);
      // petal
      ctx.beginPath(); ctx.moveTo(40, 0); ctx.quadraticCurveTo(90, -26, 140, 0); ctx.quadraticCurveTo(90, 26, 40, 0);
      ctx.strokeStyle = hsl(hue + 180 + k * 20, 100, 70, 0.6); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
    // counter-rotating nested polygons
    for (let r = 0; r < 6; r++) {
      const n = 3 + r, rr = 34 + r * 28, a0 = (r % 2 ? -1 : 1) * t * (0.3 + r * 0.05);
      ctx.strokeStyle = hsl(hue + r * 50, 100, 65, 0.55); ctx.lineWidth = 1.8;
      ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = a0 + i * TAU / n; ctx.lineTo(cos(a) * rr, sin(a) * rr); } ctx.stroke();
    }
    ctx.restore();
    // ring of stolen lantern-lights
    for (let i = 0; i < 12; i++) {
      const a = -t * 0.5 + i * TAU / 12;
      wisp(ctx, cos(a) * 120, sin(a) * 120, 2.4, i % 3 ? C.soul : C.lan, 0.8);
    }
    // abyss eye at the centre
    const ab = ctx.createRadialGradient(0, 0, 2, 0, 0, 40);
    ab.addColorStop(0, '#000'); ab.addColorStop(0.8, '#000'); ab.addColorStop(1, hsl(hue + 90, 100, 70, 0.8));
    ctx.fillStyle = ab; ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();
    const op = 0.5 + 0.5 * sin(t * 0.9);
    ctx.save(); ctx.scale(1, 0.25 + op * 0.5);
    hglow(ctx, 0, 0, 30, hue + 200, 100, 80, 0.8);
    ctx.restore();
    ctx.restore();
    if (P.atk > 0.2) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createLinearGradient(0, cy, 300, cy);
      bg.addColorStop(0, hsl(hue, 100, 70, 0.7 * P.atk)); bg.addColorStop(1, hsl(hue + 120, 100, 60, 0));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(0, cy - 10); ctx.lineTo(320, cy - 60 * P.atk); ctx.lineTo(320, cy + 60 * P.atk); ctx.lineTo(0, cy + 10); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  def('wuxiang', 440, 460, (ctx, x, y, t, o) => {
    const P = pose(o, t), C = WXP[P.v], ph = P.ph;
    const A = poseParams(P, { hx: 214, hy: -230 + sin(t * 1.1) * 10, dx: 0, lean: 0 }, { hx: 190, hy: -380, dx: -10, lean: -0.05 },
      { hx: 290, hy: -110, dx: 24, lean: 0.06 }, { hx: 200, hy: -200, dx: -16, lean: -0.06 }, { hx: 180, hy: -420, dx: 0, lean: -0.02 });
    ctx.translate(x + A.dx + P.shake, y);
    if (ph >= 3) {
      // dark mirror pool beneath the void
      ctx.save(); ctx.scale(1, 0.2);
      const pg = ctx.createRadialGradient(0, -20, 10, 0, -20, 220);
      pg.addColorStop(0, hsl(C.h0 + t * 30, 80, 50, 0.4)); pg.addColorStop(1, hsl(C.h0, 80, 30, 0));
      ctx.fillStyle = pg; ctx.fillRect(-230, -250, 460, 460); ctx.restore();
      wxVoid(ctx, P, C, t);
    } else {
      glow(ctx, 0, -240, 220, ph >= 2 ? C.soul : C.flow, 0.14);
      ctx.save(); ctx.translate(0, -40); ctx.rotate(A.lean + sin(t * 0.6) * 0.01); ctx.translate(0, 40 + sin(t * 0.8) * 4);
      wxGiant(ctx, P, C, t, A);
      ctx.restore();
      wxSea(ctx, C, t);
      // lanterns adrift on the black sea
      for (let i = 0; i < 6; i++) wxLantern(ctx, -200 + i * 80 + sin(t * 0.4 + i) * 8, -34 + sin(t * 1.4 + i) * 3, C, t, i + 20, 0.85);
    }
    if (P.cast > 0.02) {
      for (let i = 0; i < 14; i++) {
        const k = (t * 0.4 + i / 14) % 1, a = i * 2.39;
        wisp(ctx, cos(a) * (60 + k * 180), -240 + sin(a) * (40 + k * 140), 2.6, ph >= 2 ? C.soul : C.eye, P.cp * (1 - k));
      }
    }
  });

  // @@END@@
})();

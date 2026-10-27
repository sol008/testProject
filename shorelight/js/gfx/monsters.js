// 彼岸燈 — battle monsters (part 1). Registers into G.Monsters (see docs/CONTRACTS.md "Monsters").
//
// Every monster is drawn procedurally with Canvas 2D. Coordinates inside each draw function are LOCAL:
// origin = feet centre, +x = forward (monsters face RIGHT), -y = up. The shared wrapper `def()` applies
// the state pose (attack lunge / hurt recoil / cast lift + aura) and the variant palette (hue-shifted
// stronger versions), so each monster only describes its own anatomy and idle animation.
// Static sub-parts are pre-rendered to offscreen canvases with `part()` (cached per variant & scale).
//
// Ids (w x h): sea_wisp 130x150 · water_ghost 120x180 · ghost_lantern 120x180 · mine_bat 170x150 · miner_ghost 120x185 ·
// sand_crab 180x125 · water_ghost_king BOSS 300x320 · mosina 120x150 · mushroom_imp 120x150 · bamboo_spirit 120x200 ·
// bamboo_viper 170x125 · boar_demon 210x165 · macaque_demon 135x160 · tiger_granny BOSS 250x340 · yin_soldier 120x215 ·
// stone_monkey 135x155 · rat_demon 120x145 · river_wraith 150x225 · paper_effigy 100x185 · chair_spirit 175x240 ·
// jiangshi 105x195 · paper_servant 90x150 · hanged_ghost 110x215 · bone_general 150x220 · grudge_maid 105x185 ·
// grudge_feast BOSS 380x385.  Bosses read o.phase (2+: brighter/angrier).  Preview: tools/preview_monsters.html
'use strict';
(() => {
  const U = G.U;
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;

  // ---------------------------------------------------------------------------------------------
  // colour helpers
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = max(r, g, b), mn = min(r, g, b);
    let h = 0, s = 0;
    const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = U.clamp(s, 0, 1); l = U.clamp(l, 0, 1);
    const c = (1 - abs(2 * l - 1)) * s, x = c * (1 - abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return U.rgb2hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function hueShift(hex, dh, sm = 1, dl = 0) {
    const [r, g, b] = U.hex2rgb(hex);
    const [h, s, l] = rgb2hsl(r, g, b);
    return hsl2hex(h + dh, s * sm, l + dl);
  }
  const rgba = U.rgba;
  const shade = U.shade;

  // palette variants: spec = { h: hue degrees, s: saturation mul, l: lightness add, keep: [keys], set: {key: hex} }
  const palCache = {};
  function palette(id, base, vars, v) {
    if (!v || !vars || !vars[v - 1]) return base;
    const k = id + '#' + v;
    if (palCache[k]) return palCache[k];
    const sp = vars[v - 1];
    const out = {};
    for (const key in base) {
      const val = base[key];
      if (typeof val !== 'string' || val[0] !== '#' || (sp.keep && sp.keep.includes(key))) out[key] = val;
      else out[key] = hueShift(val, sp.h || 0, sp.s == null ? 1 : sp.s, sp.l || 0);
    }
    if (sp.set) Object.assign(out, sp.set);
    return (palCache[k] = out);
  }

  // ---------------------------------------------------------------------------------------------
  // offscreen caches
  const cache = {};
  const cacheScale = () => min(3, max(1, G.S) * 1.5);
  // part(key, w, h, ox, oy, fn): cached canvas w x h whose local origin is (ox, oy)
  function part(key, w, h, ox, oy, fn) {
    const sc = cacheScale();
    const k = key + '@' + sc;
    let c = cache[k];
    if (!c) {
      c = U.makeCanvas(w, h, sc);
      const cx = c.getContext('2d');
      cx.translate(ox, oy);
      cx.lineJoin = 'round'; cx.lineCap = 'round';
      fn(cx);
      c.ox = ox; c.oy = oy;
      cache[k] = c;
    }
    return c;
  }
  function blit(ctx, c, x = 0, y = 0) { ctx.drawImage(c, x - c.ox, y - c.oy, c.lw, c.lh); }

  // soft glow sprite per colour (radial falloff), drawn additively
  const glowCache = {};
  function glowSprite(col) {
    let c = glowCache[col];
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, rgba(col, 1));
      gr.addColorStop(0.22, rgba(col, 0.55));
      gr.addColorStop(0.5, rgba(col, 0.18));
      gr.addColorStop(1, rgba(col, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      glowCache[col] = c;
    }
    return c;
  }
  function glow(ctx, x, y, r, col, a = 1) {
    if (a <= 0.003 || r <= 0) return;
    const pa = ctx.globalAlpha, pc = ctx.globalCompositeOperation;
    ctx.globalAlpha = pa * min(1, a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa; ctx.globalCompositeOperation = pc;
  }
  // non-additive soft blob (mist, shadow)
  function soft(ctx, x, y, r, col, a = 1) {
    if (a <= 0.003) return;
    const pa = ctx.globalAlpha;
    ctx.globalAlpha = pa * min(1, a);
    ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = pa;
  }

  // ---------------------------------------------------------------------------------------------
  // path helpers
  function lg(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  function rg(ctx, x0, y0, r0, x1, y1, r1, stops) {
    const g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    return g;
  }
  // smooth closed blob through-ish points (midpoint quadratic)
  function blob(pts, path) {
    const p = path || new Path2D();
    const n = pts.length;
    const mx = (i) => (pts[i % n][0] + pts[(i + 1) % n][0]) / 2, my = (i) => (pts[i % n][1] + pts[(i + 1) % n][1]) / 2;
    p.moveTo(mx(0), my(0));
    for (let i = 1; i <= n; i++) p.quadraticCurveTo(pts[i % n][0], pts[i % n][1], mx(i), my(i));
    p.closePath();
    return p;
  }
  // open smooth curve (midpoint quadratic) — for strokes
  function curve(ctx, pts) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    }
    const l = pts[pts.length - 1];
    ctx.lineTo(l[0], l[1]);
  }
  // Catmull-Rom sample
  function spline(pts, seg = 8) {
    const out = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[min(n - 1, i + 2)];
      for (let j = 0; j < seg; j++) {
        const t = j / seg, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    out.push(pts[n - 1].slice());
    return out;
  }
  // tapered ribbon along a spline through pts; width w0 -> w1 (or wf(u))
  function ribbon(pts, w0, w1, seg = 6, path) {
    const s = spline(pts, seg);
    const n = s.length;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = s[max(0, i - 1)], b = s[min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      dx /= d; dy /= d;
      const u = i / (n - 1);
      const w = (typeof w0 === 'function' ? w0(u) : U.lerp(w0, w1, u)) / 2;
      L.push([s[i][0] - dy * w, s[i][1] + dx * w]);
      R.push([s[i][0] + dy * w, s[i][1] - dx * w]);
    }
    const p = path || new Path2D();
    p.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) p.lineTo(L[i][0], L[i][1]);
    const e = s[n - 1], we = Math.hypot(L[n - 1][0] - e[0], L[n - 1][1] - e[1]);
    if (we > 0.8) {
      const ang = Math.atan2(L[n - 1][1] - e[1], L[n - 1][0] - e[0]);
      p.arc(e[0], e[1], we, ang, ang - PI, true);
    }
    for (let i = n - 1; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
    const s0 = s[0], ws = Math.hypot(R[0][0] - s0[0], R[0][1] - s0[1]);
    if (ws > 0.8) {
      const ang = Math.atan2(R[0][1] - s0[1], R[0][0] - s0[0]);
      p.arc(s0[0], s0[1], ws, ang, ang - PI, true);
    }
    p.closePath();
    return p;
  }
  // inner edge band: stroke the path shifted by (dx,dy) clipped to itself
  function edge(ctx, path, col, dx, dy, w) {
    ctx.save();
    ctx.clip(path);
    ctx.translate(dx, dy);
    ctx.lineWidth = w;
    ctx.strokeStyle = col;
    ctx.stroke(path);
    ctx.restore();
  }
  // painterly fill: fill + soft core shadow (bottom-right) + top-left light + rim + coloured outline
  // o: { sh: shadowColor, shw, hi: highlightColor, hiw, rim: rimColor (back-light, right side), line, lw }
  function paint(ctx, path, fill, o = {}) {
    ctx.fillStyle = fill;
    ctx.fill(path);
    if (o.sh) {
      const w = o.shw || 7;
      edge(ctx, path, o.sh, -w * 0.5, -w * 0.5, w * 1.2);
      edge(ctx, path, o.sh, -w * 0.9, -w * 0.9, w * 2.2);
    }
    if (o.hi) {
      const w = o.hiw || 2;
      edge(ctx, path, o.hi, w, w, w * 2);
    }
    if (o.rim) edge(ctx, path, o.rim, -(o.rimw || 1.6), o.rimdy || 0, (o.rimw || 1.6) * 2);
    if (o.line) {
      ctx.lineWidth = o.lw || 2;
      ctx.strokeStyle = o.line;
      ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
  }
  function circle(x, y, r, p) { p = p || new Path2D(); p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); return p; }
  function ell(x, y, rx, ry, rot = 0, p) { p = p || new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, TAU); return p; }
  function poly(pts, p) {
    p = p || new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
    p.closePath();
    return p;
  }
  // glowing eye: soft bloom + iris + hot core
  function eye(ctx, x, y, r, col, a = 1, core = '#ffffff', ry) {
    glow(ctx, x, y, r * 5, col, 0.55 * a);
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y, r, ry || r, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.45, (ry || r) * 0.45, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // deterministic particle helper: calls fn(i, life 0..1, rnd(k)) for n particles cycling with speed
  function particles(n, t, speed, seed, fn) {
    for (let i = 0; i < n; i++) {
      const ph = U.hash(i, 7, seed);
      const life = (t * speed * (0.7 + 0.6 * U.hash(i, 3, seed)) + ph) % 1;
      const cyc = Math.floor(t * speed * (0.7 + 0.6 * U.hash(i, 3, seed)) + ph);
      fn(i, life, (k) => U.hash(i * 31 + cyc, k, seed));
    }
  }
  function flame(ctx, x, y, s, t, cOut, cIn, seed = 0, a = 1) {
    // flickering flame tongue, base at (x,y), height ~ 2.4s
    const f1 = sin(t * 11 + seed * 3.1) * 0.12 + sin(t * 17 + seed) * 0.08;
    const hgt = s * (2.4 + sin(t * 9 + seed * 2) * 0.25);
    ctx.save();
    ctx.globalAlpha *= a;
    glow(ctx, x, y - hgt * 0.35, s * 3.2, cOut, 0.55);
    for (let k = 0; k < 2; k++) {
      const w = k ? s * 0.55 : s;
      const h = k ? hgt * 0.62 : hgt;
      ctx.fillStyle = k ? cIn : cOut;
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.bezierCurveTo(x - w * 1.1, y - h * 0.45, x + w * (f1 * 4 - 0.3), y - h * 0.7, x + h * f1, y - h);
      ctx.bezierCurveTo(x + w * (0.6 + f1 * 3), y - h * 0.6, x + w * 1.15, y - h * 0.35, x + w, y);
      ctx.quadraticCurveTo(x, y + w * 0.6, x - w, y);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // state pose. Returns offsets in local space and 0..1 intensities
  function pose(o) {
    const st = o.st || 0, s = o.state || 'idle';
    const P = { dx: 0, dy: 0, rot: 0, atk: 0, reach: 0, hurt: 0, cast: 0, wind: 0, st, state: s };
    if (s === 'attack') {
      if (st < 0.18) {
        const k = U.ease.outQuad(st / 0.18);
        P.dx = -12 * k; P.rot = -0.07 * k; P.wind = k;
      } else if (st < 0.32) {
        const k = U.ease.outCubic((st - 0.18) / 0.14);
        P.dx = U.lerp(-12, 46, k); P.rot = U.lerp(-0.07, 0.13, k); P.reach = k; P.wind = 1 - k;
      } else if (st < 0.5) {
        P.dx = 46; P.rot = 0.13; P.reach = 1;
      } else {
        const k = U.ease.inOutQuad(min(1, (st - 0.5) / 0.32));
        P.dx = 46 * (1 - k); P.rot = 0.13 * (1 - k); P.reach = 1 - k;
      }
      P.atk = P.reach;
    } else if (s === 'hurt' || s === 'dead') {
      const amp = s === 'dead' ? 1 : Math.exp(-st * 5);
      const k = min(1, st / 0.07);
      P.hurt = amp * k + (1 - k) * (s === 'dead' ? 1 : 0.6);
      P.dx = -22 * P.hurt + sin(st * 70) * 3 * amp;
      P.rot = -0.14 * P.hurt;
    } else if (s === 'cast') {
      const k = U.ease.outCubic(min(1, st / 0.4));
      P.cast = k;
      P.dy = -10 * k + sin(st * 6) * 2 * k;
    }
    return P;
  }

  // magic circle / aura behind casting monsters
  function castBack(ctx, w, h, col, k, t) {
    const cy = -h * 0.45;
    glow(ctx, 0, cy, max(w, h) * 0.75, col, 0.45 * k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75 * k;
    ctx.strokeStyle = col;
    const rx = w * 0.55 * (0.6 + 0.4 * k), ry = rx * 0.32;
    ctx.translate(0, 4);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.78, ry * 0.78, 0, 0, TAU); ctx.stroke();
    // rotating rune ticks
    for (let i = 0; i < 12; i++) {
      const a = t * 0.8 + (i / 12) * TAU;
      const x0 = cos(a) * rx * 0.78, y0 = sin(a) * ry * 0.78, x1 = cos(a) * rx, y1 = sin(a) * ry;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    // pentagram-ish star
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -t * 0.5 + (i * 2 / 5) * TAU;
      const x = cos(a) * rx * 0.74, y = sin(a) * ry * 0.74;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  function castFront(ctx, w, h, col, k, t) {
    particles(14, t, 0.9, 99, (i, life, r) => {
      const x = (r(1) - 0.5) * w * 1.0, y = -life * h * 1.05;
      const a = sin(life * PI) * k;
      glow(ctx, x + sin(life * 6 + i) * 6, y, 6 + r(2) * 6, col, a * 0.9);
    });
  }

  // ---------------------------------------------------------------------------------------------
  // definition wrapper
  // spec: { w, h, pal, vars, magic: palette key used for cast aura, draw(ctx, t, o, p, P, v) }
  function def(id, spec) {
    G.Monsters.define(id, {
      w: spec.w,
      h: spec.h,
      draw(ctx, x, y, t, o) {
        o = o || {};
        const v = o.variant | 0;
        const p = palette(id, spec.pal, spec.vars, v);
        const P = pose(o);
        ctx.save();
        ctx.translate(x + P.dx, y + P.dy);
        if (P.rot) ctx.rotate(P.rot);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        const mc = p[spec.magic || 'magic'] || '#8fe8ff';
        if (P.cast > 0) castBack(ctx, spec.w, spec.h, mc, P.cast, t);
        spec.draw(ctx, t, o, p, P, v, id);
        if (P.cast > 0) castFront(ctx, spec.w, spec.h, mc, P.cast, t);
        ctx.restore();
      },
    });
  }

  // shared bits ----------------------------------------------------------------------------------
  // dripping droplets from a list of [x,y] sources
  function drips(ctx, srcs, t, col, seed, fall = 60, speed = 0.8) {
    for (let i = 0; i < srcs.length; i++) {
      const ph = U.hash(i, 1, seed);
      const life = (t * speed + ph) % 1;
      const [sx, sy] = srcs[i];
      const yy = sy + life * life * fall;
      const a = life < 0.15 ? life / 0.15 : 1 - (life - 0.15) / 0.85;
      ctx.fillStyle = rgba(col, 0.8 * a);
      ctx.beginPath();
      const r = 1.8 + U.hash(i, 2, seed) * 1.2;
      ctx.moveTo(sx, yy - r * 2.4);
      ctx.quadraticCurveTo(sx + r, yy - r * 0.2, sx, yy + r);
      ctx.quadraticCurveTo(sx - r, yy - r * 0.2, sx, yy - r * 2.4);
      ctx.fill();
    }
  }
  function ripples(ctx, x, y, rx, t, col, n = 3, a = 0.5) {
    ctx.save();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < n; i++) {
      const k = (t * 0.45 + i / n) % 1;
      ctx.strokeStyle = rgba(col, a * (1 - k));
      ctx.beginPath(); ctx.ellipse(x, y, rx * (0.4 + k * 0.8), rx * (0.4 + k * 0.8) * 0.28, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  // seaweed / hair strand
  function strand(ctx, pts, w0, w1, fill, line) {
    const p = ribbon(pts, w0, w1, 5);
    ctx.fillStyle = fill; ctx.fill(p);
    if (line) { ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.stroke(p); }
    return p;
  }

  // =============================================================================================
  // 海霧魂 sea_wisp — misty sea spirit with a faint face (dream tutorial)
  def('sea_wisp', {
    w: 130, h: 150,
    pal: { body: '#a8eef2', deep: '#2c7e9c', core: '#f2ffff', eye: '#0d2f45', glow: '#6fe6ff', line: '#3d9fb8', magic: '#7ff0ff' },
    vars: [{ h: 55, s: 1.1 }, { h: -165, s: 1.3, l: -0.03 }],
    draw(ctx, t, o, p, P) {
      const bob = sin(t * 1.8) * 6;
      ctx.translate(0, -78 + bob);
      const w1 = sin(t * 2.3), w2 = sin(t * 1.7 + 1), w3 = sin(t * 3.1 + 2);
      glow(ctx, 0, 0, 105, p.glow, 0.32 + P.cast * 0.3);
      // trailing mist puffs behind
      particles(9, t, 0.35, 11, (i, life, r) => {
        const x = -30 - life * 70 + r(1) * 20, y = 30 + sin(life * 5 + i) * 10 - life * 30;
        soft(ctx, x, y, 14 + life * 22, p.body, 0.22 * sin(life * PI));
      });
      ctx.save();
      ctx.rotate(-0.08 * P.hurt + 0.06 * P.atk);
      const body = new Path2D();
      body.moveTo(6, -54);
      body.bezierCurveTo(40, -54, 52, -22, 46, 6);
      body.bezierCurveTo(40, 32, 14, 42, -8 + w1 * 4, 48);
      body.bezierCurveTo(-30, 54, -48, 62 + w2 * 6, -66 + w1 * 7, 50 + w3 * 4);
      body.bezierCurveTo(-52, 44, -40, 36, -42, 18);
      body.bezierCurveTo(-48, -14, -32, -54, 6, -54);
      // misty halo around the body
      ctx.strokeStyle = rgba(p.body, 0.12); ctx.lineWidth = 16; ctx.stroke(body);
      ctx.strokeStyle = rgba(p.body, 0.16); ctx.lineWidth = 8; ctx.stroke(body);
      ctx.globalAlpha = 0.88;
      paint(ctx, body, rg(ctx, 12, -18, 4, 0, -2, 70, [0, rgba(p.core, 0.98), 0.35, rgba(p.body, 0.85), 0.8, rgba(p.deep, 0.55), 1, rgba(p.deep, 0.2)]),
        { hi: rgba(p.core, 0.55), hiw: 2.2, line: rgba(p.line, 0.7), lw: 1.6 });
      ctx.globalAlpha = 1;
      // flowing inner swirls
      ctx.save();
      ctx.clip(body);
      ctx.setLineDash([18, 14]);
      ctx.lineDashOffset = -t * 30;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = rgba(p.core, 0.45);
      ctx.beginPath(); curve(ctx, [[-60 + w1 * 6, 48], [-36, 30], [-18, 8], [0, -12], [26, -30], [36, -40]]); ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = rgba(p.deep, 0.5);
      ctx.beginPath(); curve(ctx, [[-50, 38], [-22, 34], [8, 26], [30, 12]]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // inner core light
      glow(ctx, 10, -6, 40, p.core, 0.35 + 0.1 * sin(t * 3));
      // faint face
      const blink = (t % 4.3) > 4.15 ? 0.15 : 1;
      const sad = P.hurt > 0.2 ? 1.6 : 1;
      ctx.fillStyle = rgba(p.eye, 0.78);
      ctx.beginPath(); ctx.ellipse(6, -16, 5.5, 8 * blink / sad, -0.15, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(28, -14, 4.6, 7.2 * blink / sad, 0.1, 0, TAU); ctx.fill();
      glow(ctx, 6, -16, 10, p.glow, 0.35); glow(ctx, 28, -14, 9, p.glow, 0.35);
      ctx.fillStyle = rgba(p.core, 0.9);
      ctx.beginPath(); ctx.arc(7.5, -19, 1.6, 0, TAU); ctx.arc(29.3, -17, 1.3, 0, TAU); ctx.fill();
      const mo = 4 + P.atk * 5 + sin(t * 2) * 1;
      ctx.fillStyle = rgba(p.eye, 0.55);
      ctx.beginPath(); ctx.ellipse(18, 8, 3.2, mo, 0, 0, TAU); ctx.fill();
      ctx.restore();
      // orbiting motes
      for (let i = 0; i < 6; i++) {
        const a = t * 0.9 + i * TAU / 6;
        const x = cos(a) * 62, y = sin(a) * 20 - 6 + sin(t * 2 + i) * 6;
        glow(ctx, x, y, 7 + 2 * sin(t * 4 + i), p.glow, sin(a) > 0 ? 0.9 : 0.4);
      }
    },
  });

  // =============================================================================================
  // 水鬼 water_ghost — drowned man, seaweed hair, dripping, reaching hands
  def('water_ghost', {
    w: 120, h: 180,
    pal: {
      skin: '#a7d3c6', skinD: '#5f9a93', skinL: '#e2f6ee', robe: '#2f5157', robeD: '#16282f', robeL: '#5d8a88',
      hair: '#1d3d2c', hairL: '#4f8a55', eye: '#e9ffd2', water: '#7fd7d9', line: '#173339', magic: '#62e0d6',
    },
    vars: [{ h: 40, s: 1.1 }, { h: -150, s: 1.15, l: -0.04, keep: ['eye'] }],
    draw(ctx, t, o, p, P) {
      const br = sin(t * 1.6);
      const sway = sin(t * 1.1) * 0.03;
      // puddle
      ctx.fillStyle = rgba(p.robeD, 0.55);
      ctx.beginPath(); ctx.ellipse(0, -2, 52, 10, 0, 0, TAU); ctx.fill();
      ripples(ctx, 0, -2, 60, t, p.water, 3, 0.45);
      ctx.save();
      ctx.rotate(sway);
      const reach = P.reach * 28 - P.wind * 6 - P.hurt * 10;
      // back arm
      const sh2 = [-2, -120 + br * 1.5];
      const hand2 = [70 + reach + sin(t * 1.4) * 3, -108 + sin(t * 1.9) * 4];
      armDrowned(ctx, p, sh2, [30 + reach * 0.5, -104], hand2, true, t);
      // body (cached)
      const body = part('water_ghost/body/' + (o.variant | 0), 130, 160, 70, 150, (c) => {
        // ragged robe, hunched
        const robe = new Path2D();
        robe.moveTo(-14, -136);
        robe.bezierCurveTo(10, -142, 30, -128, 30, -104);
        robe.bezierCurveTo(32, -70, 34, -40, 38, -8);
        robe.lineTo(30, -2); robe.lineTo(24, -10); robe.lineTo(18, 0); robe.lineTo(10, -8); robe.lineTo(2, 2);
        robe.lineTo(-6, -8); robe.lineTo(-14, 0); robe.lineTo(-22, -10); robe.lineTo(-30, -2); robe.lineTo(-34, -14);
        robe.bezierCurveTo(-40, -50, -40, -92, -34, -114);
        robe.bezierCurveTo(-30, -128, -24, -134, -14, -136);
        robe.closePath();
        paint(c, robe, lg(c, -30, -130, 30, 0, [0, p.robeL, 0.45, p.robe, 1, p.robeD]),
          { sh: rgba(p.robeD, 0.5), shw: 8, hi: rgba(p.robeL, 0.6), hiw: 1.6, line: p.line, lw: 2 });
        // wet folds
        c.strokeStyle = rgba(p.robeD, 0.7); c.lineWidth = 1.6;
        for (const f of [[-18, -110, -24, -20], [-4, -100, -6, -12], [12, -96, 20, -10], [24, -90, 32, -16]]) {
          c.beginPath(); c.moveTo(f[0], f[1]); c.quadraticCurveTo((f[0] + f[2]) / 2 + 4, (f[1] + f[3]) / 2, f[2], f[3]); c.stroke();
        }
        c.strokeStyle = rgba(p.robeL, 0.35); c.lineWidth = 1.2;
        for (const f of [[-12, -112, -16, -40], [6, -104, 8, -50]]) {
          c.beginPath(); c.moveTo(f[0], f[1]); c.quadraticCurveTo(f[0] - 4, (f[1] + f[3]) / 2, f[2], f[3]); c.stroke();
        }
        // sash rope
        c.strokeStyle = shade(p.robeD, 0.25); c.lineWidth = 4;
        c.beginPath(); c.moveTo(-36, -70); c.quadraticCurveTo(0, -60, 33, -72); c.stroke();
        c.strokeStyle = rgba(p.robeL, 0.4); c.lineWidth = 1;
        c.beginPath(); c.moveTo(-36, -71); c.quadraticCurveTo(0, -61.5, 33, -73.5); c.stroke();
        // barnacles / weed clinging
        for (let i = 0; i < 6; i++) {
          const x = -28 + U.hash(i, 1, 5) * 54, y = -120 + U.hash(i, 2, 5) * 100;
          c.fillStyle = rgba(p.skinL, 0.5); c.beginPath(); c.arc(x, y, 1.6 + U.hash(i, 3, 5) * 1.6, 0, TAU); c.fill();
        }
        // neck
        const neck = blob([[-6, -138], [12, -142], [18, -128], [0, -124]]);
        paint(c, neck, p.skinD, { line: p.line, lw: 1.5 });
      });
      ctx.save();
      ctx.translate(0, br * 0.8);
      blit(ctx, body);
      ctx.restore();
      // head
      ctx.save();
      ctx.translate(22 + P.reach * 5, -142 + br * 1.4);
      ctx.rotate(0.28 + sin(t * 0.9) * 0.05 - P.hurt * 0.25);
      ctx.scale(1.25, 1.25);
      // back hair (behind head) — long seaweed strands
      for (let i = 0; i < 8; i++) {
        const sx = -18 + i * 3.2, sy = -16 + i * 0.8;
        const len = 44 + U.hash(i, 1, 9) * 34;
        const sw = sin(t * 1.5 + i * 0.7) * 5;
        strand(ctx, [[sx, sy], [sx - 9, sy + len * 0.3], [sx - 12 + sw * 0.5, sy + len * 0.65], [sx - 10 + sw, sy + len]],
          6, 1.4, i % 3 ? p.hair : p.hairL, rgba(p.line, 0.6));
      }
      const head = blob([[-16, -10], [-8, -22], [10, -22], [20, -10], [22, 6], [14, 18], [0, 20], [-14, 10]]);
      paint(ctx, head, rg(ctx, 4, -12, 2, 4, 0, 26, [0, p.skinL, 0.5, p.skin, 1, p.skinD]),
        { sh: rgba(p.skinD, 0.7), shw: 5, line: p.line, lw: 1.6 });
      // cheek hollow
      soft(ctx, 6, 8, 9, p.skinD, 0.5);
      // sunken eye sockets
      ctx.fillStyle = rgba(p.robeD, 0.8);
      ctx.beginPath(); ctx.ellipse(13, -3, 5.2, 4.4, 0.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2, -4, 4.2, 3.8, 0, 0, TAU); ctx.fill();
      eye(ctx, 13.5, -2.6, 2, p.eye, 0.9 + 0.1 * sin(t * 5));
      eye(ctx, 2.4, -3.6, 1.4, p.eye, 0.6);
      // nose ridge
      ctx.strokeStyle = rgba(p.skinD, 0.9); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(19, -2); ctx.quadraticCurveTo(23, 4, 19, 6); ctx.stroke();
      // gaping mouth
      ctx.fillStyle = p.robeD;
      ctx.beginPath(); ctx.ellipse(13, 12, 3.6, 3.5 + P.atk * 3 + abs(sin(t * 0.8)) * 1.5, 0.15, 0, TAU); ctx.fill();
      // wet hair cap + front strands over the brow
      const cap = blob([[-18, -4], [-14, -22], [4, -27], [20, -18], [18, -12], [8, -16], [-2, -12], [-10, -6]]);
      paint(ctx, cap, lg(ctx, 0, -26, 0, -6, [0, p.hairL, 1, p.hair]), { hi: rgba(p.hairL, 0.6), hiw: 1.2, line: rgba(p.line, 0.7), lw: 1.2 });
      for (let i = 0; i < 4; i++) {
        const sx = 4 + i * 4.5, sy = -18 + i * 1.5;
        const len = 18 + U.hash(i, 4, 9) * 22;
        const sw = sin(t * 1.7 + i) * 2.5;
        strand(ctx, [[sx, sy], [sx + 1, sy + len * 0.4], [sx + sw * 0.5 + 1, sy + len * 0.75], [sx + sw, sy + len]],
          3.6, 0.8, i % 2 ? p.hair : p.hairL, rgba(p.line, 0.5));
      }
      ctx.restore();
      // front arm
      const sh1 = [16, -118 + br * 1.5];
      const hand1 = [86 + reach + sin(t * 1.2 + 1) * 3, -94 + sin(t * 1.6 + 2) * 4];
      armDrowned(ctx, p, sh1, [48 + reach * 0.5, -100], hand1, false, t);
      // drips
      drips(ctx, [[hand1[0] + 8, hand1[1] + 6], [hand2[0] + 6, hand2[1] + 6], [-6, -40], [24, -30], [4, -110]], t, p.water, 3, 70, 0.9);
      ctx.restore();
      glow(ctx, 0, -2, 50, p.water, 0.18);
    },
  });
  function sqrtSafe(v) { return Math.sqrt(max(0, v)); }
  function armDrowned(ctx, p, sh, el, hand, back, t) {
    const sk = back ? shade(p.skin, -0.18) : p.skin;
    const arm = ribbon([sh, el, hand], 13, 7, 6);
    paint(ctx, arm, lg(ctx, sh[0], sh[1] - 6, sh[0], sh[1] + 10, [0, back ? p.skin : p.skinL, 1, back ? p.skinD : sk]),
      { sh: rgba(p.skinD, 0.5), shw: 3, line: p.line, lw: 1.6 });
    // ragged sleeve
    const sl = new Path2D();
    sl.moveTo(sh[0] - 9, sh[1] - 6);
    sl.quadraticCurveTo(sh[0] + 10, sh[1] - 12, el[0] - 2, el[1] - 7);
    sl.lineTo(el[0] - 4, el[1] + 4); sl.lineTo(el[0] - 10, el[1] + 2); sl.lineTo(el[0] - 14, el[1] + 9);
    sl.quadraticCurveTo(sh[0] - 4, sh[1] + 16, sh[0] - 9, sh[1] - 6);
    paint(ctx, sl, back ? p.robeD : p.robe, { hi: rgba(p.robeL, 0.5), hiw: 1.4, line: p.line, lw: 1.5 });
    // hand with long fingers
    const ang = Math.atan2(hand[1] - el[1], hand[0] - el[0]);
    ctx.save();
    ctx.translate(hand[0], hand[1]);
    ctx.rotate(ang);
    const curl = 0.35 + 0.2 * sin(t * 2 + (back ? 1 : 0));
    ctx.fillStyle = sk; ctx.strokeStyle = p.line; ctx.lineWidth = 1.2;
    const palm = ell(1, 0, 7, 5);
    ctx.fill(palm); ctx.stroke(palm);
    for (let f = 0; f < 5; f++) {
      const fa = (f - 2) * 0.32 + (f === 0 ? -0.35 : 0);
      const L = f === 0 ? 13 : 20 + (f === 2 ? 4 : 0);
      const fp = ribbon([[3, 0], [3 + L * 0.55 * cos(fa), L * 0.55 * sin(fa)], [3 + L * cos(fa + curl), L * sin(fa + curl)]], 3, 1, 4);
      ctx.fill(fp); ctx.stroke(fp);
    }
    // nails
    ctx.fillStyle = rgba(p.robeD, 0.8);
    for (let f = 1; f < 5; f++) {
      const fa = (f - 2) * 0.32, L = 20 + (f === 2 ? 4 : 0);
      ctx.beginPath(); ctx.arc(3 + L * cos(fa + curl), L * sin(fa + curl), 1.1, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // more shared helpers --------------------------------------------------------------------------
  // painted tapered limb along points
  function limb(ctx, pts, w0, w1, fill, o) {
    const p = ribbon(pts, w0, w1, 6);
    paint(ctx, p, fill, o || {});
    return p;
  }
  // short hatch strokes clipped inside a path (fur, bristles, wood grain)
  function hatch(ctx, path, n, seed, box, col, lw, len, ang, jit = 0.5) {
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = box[0] + U.hash(i, 1, seed) * box[2], y = box[1] + U.hash(i, 2, seed) * box[3];
      const a = ang + (U.hash(i, 3, seed) - 0.5) * jit;
      const l = len * (0.6 + U.hash(i, 4, seed) * 0.8);
      ctx.moveTo(x, y); ctx.lineTo(x + cos(a) * l, y + sin(a) * l);
    }
    ctx.stroke();
    ctx.restore();
  }
  // curved claw / talon
  function claw(ctx, x, y, ang, len, wid, fill, line) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -wid / 2);
    ctx.quadraticCurveTo(len * 0.7, -wid * 0.6, len, wid * 0.9);
    ctx.quadraticCurveTo(len * 0.55, wid * 0.2, 0, wid / 2);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.restore();
  }
  // fade the bottom of a cached canvas (ghost tails): erase with a vertical gradient between y0..y1
  function fadeOut(c, x, y0, w, y1) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = lg(c, 0, y0, 0, y1, [0, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,1)']);
    c.fillRect(x, y0, w, y1 - y0 + 40);
    c.restore();
  }
  function wisps(ctx, x, y, w, t, col, n = 5, len = 40, a = 0.45, seed = 1) {
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5;
      const sx = x - w / 2 + u * w;
      const sw = sin(t * 2 + i * 1.7 + seed) * 8;
      const L = len * (0.7 + 0.5 * U.hash(i, 5, seed));
      ctx.fillStyle = rgba(col, a * (0.6 + 0.4 * U.hash(i, 6, seed)));
      ctx.fill(ribbon([[sx, y - 6], [sx + sw * 0.4 - 4, y + L * 0.4], [sx + sw - 8, y + L * 0.75], [sx + sw * 1.4 - 14, y + L]], 14, 1, 5));
    }
  }

  // =============================================================================================
  // 鬼燈籠 ghost_lantern — red paper lantern with a demonic grin, lolling tongue, blue ghost-fire
  def('ghost_lantern', {
    w: 120, h: 180,
    pal: {
      paper: '#d8402e', paperD: '#7e1820', paperL: '#ffb07a', cap: '#2a1a1c', capL: '#6a4a3e', rib: '#8a2a22',
      fire: '#4fb8ff', fireIn: '#e4f8ff', tongue: '#e0566e', tongueD: '#8a1f3a', tassel: '#e8b04a', line: '#5a1016', magic: '#5fc4ff',
    },
    vars: [{ h: -95, s: 0.9, keep: ['tongue', 'tongueD'] }, { h: 32, s: 1.1, l: -0.02, keep: ['tongue', 'tongueD'] }],
    draw(ctx, t, o, p, P) {
      const bob = sin(t * 2.1) * 5;
      const sw = sin(t * 1.3) * 0.06;
      ctx.translate(0, -104 + bob);
      glow(ctx, 0, 0, 110, p.fire, 0.28 + 0.06 * sin(t * 7));
      ctx.save();
      ctx.rotate(sw - P.hurt * 0.25 + P.atk * 0.1);
      // handle wire + bobbing stick stub
      ctx.strokeStyle = p.capL; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-20, -60); ctx.quadraticCurveTo(0, -92, 20, -60); ctx.stroke();
      // blue flames out of the top
      flame(ctx, -6, -58, 9, t, p.fire, p.fireIn, 1, 0.9);
      flame(ctx, 8, -58, 7, t + 0.4, p.fire, p.fireIn, 2, 0.85);
      flame(ctx, 0, -56, 12 + P.cast * 4, t + 0.9, p.fire, p.fireIn, 3, 1);
      // tassel (behind lantern bottom)
      const tw = sin(t * 2.4 + 1) * 6 - P.atk * 6;
      ctx.fillStyle = p.tassel;
      for (let i = 0; i < 7; i++) {
        const x0 = -6 + i * 2;
        ctx.fill(ribbon([[x0, 58], [x0 + tw * 0.3, 74], [x0 + tw * 0.8 + (i - 3) * 1.2, 92]], 2.4, 1, 4));
      }
      ctx.fillStyle = shade(p.tassel, -0.35);
      ctx.beginPath(); ctx.ellipse(0, 60, 6, 4, 0, 0, TAU); ctx.fill();
      // body (cached)
      const body = part('ghost_lantern/body/' + (o.variant | 0), 120, 140, 60, 70, (c) => {
        const shape = ell(0, 0, 47, 54);
        paint(c, shape, rg(c, -10, -12, 4, 0, 0, 60, [0, p.paperL, 0.45, p.paper, 1, p.paperD]),
          { sh: rgba(p.paperD, 0.6), shw: 10, hi: rgba(p.paperL, 0.55), hiw: 2, rim: rgba(p.fire, 0.6), rimw: 1.8, line: p.line, lw: 2.2 });
        // ribs (horizontal bamboo hoops in 3/4)
        c.save(); c.clip(shape);
        for (let i = -4; i <= 4; i++) {
          const y = i * 11.5;
          const rx = 47 * Math.sqrt(max(0, 1 - (y / 54) * (y / 54)));
          c.strokeStyle = rgba(p.rib, 0.75); c.lineWidth = 1.6;
          c.beginPath(); c.ellipse(0, y - 2, rx, 3.5, 0, 0.05, PI - 0.05); c.stroke();
          c.strokeStyle = rgba(p.paperL, 0.25); c.lineWidth = 1;
          c.beginPath(); c.ellipse(0, y - 3.2, rx, 3.5, 0, 0.3, PI - 0.6); c.stroke();
        }
        // vertical seams
        c.strokeStyle = rgba(p.paperD, 0.35); c.lineWidth = 1;
        for (const k of [-0.6, -0.2, 0.2, 0.6]) {
          c.beginPath(); c.ellipse(0, 0, 47 * abs(k), 54, 0, k < 0 ? PI / 2 : -PI / 2, k < 0 ? 1.5 * PI : PI / 2); c.stroke();
        }
        // torn holes leaking fire-light
        for (const h of [[-30, -22, 7], [-22, 30, 5], [34, -30, 4]]) {
          const hp = blob([[h[0] - h[2], h[1]], [h[0], h[1] - h[2] * 0.8], [h[0] + h[2], h[1] - 1], [h[0] + 2, h[1] + h[2]]]);
          c.fillStyle = '#10161f'; c.fill(hp);
          c.fillStyle = rgba(p.fireIn, 0.75); c.save(); c.clip(hp); c.beginPath(); c.arc(h[0] + 2, h[1] + 1, h[2] * 0.6, 0, TAU); c.fill(); c.restore();
          c.strokeStyle = rgba(p.paperL, 0.7); c.lineWidth = 1; c.stroke(hp);
        }
        c.restore();
        // caps
        for (const cy of [-56, 56]) {
          const cap = new Path2D(); cap.roundRect(-24, cy - 6, 48, 12, 4);
          paint(c, cap, lg(c, 0, cy - 6, 0, cy + 6, [0, p.capL, 1, p.cap]), { hi: rgba('#ffffff', 0.15), hiw: 1, line: shade(p.cap, -0.4), lw: 1.5 });
          c.strokeStyle = rgba(p.tassel, 0.6); c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(-22, cy); c.lineTo(22, cy); c.stroke();
        }
      });
      blit(ctx, body);
      // demonic face (live: flicker)
      const fl = 0.75 + 0.25 * sin(t * 13) * sin(t * 7.3);
      const sq = P.hurt > 0.15 ? 0.35 : 1;
      ctx.save();
      ctx.translate(10, 0);
      // brows (painted ink)
      ctx.strokeStyle = shade(p.line, -0.3); ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(-26, -26); ctx.quadraticCurveTo(-14, -20, -4, -16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, -28); ctx.quadraticCurveTo(22, -21, 12, -16); ctx.stroke();
      // eye holes
      for (const [ex, ey, s] of [[-14, -10, 1], [20, -10, 0.85]]) {
        ctx.fillStyle = '#0d1018';
        ctx.beginPath();
        ctx.moveTo(ex - 11 * s, ey - 2 * sq);
        ctx.quadraticCurveTo(ex, ey - 9 * s * sq, ex + 10 * s, ey + 2);
        ctx.quadraticCurveTo(ex, ey + 6 * s * sq, ex - 11 * s, ey - 2 * sq);
        ctx.fill();
        eye(ctx, ex + 1, ey, 3.4 * s, p.fire, fl, p.fireIn, 3 * s * sq);
      }
      // jagged grin
      const open = 6 + P.atk * 10 + P.cast * 6 + sin(t * 2.5) * 1.5;
      const mouth = new Path2D();
      mouth.moveTo(-30, 12);
      mouth.quadraticCurveTo(2, 22, 32, 8);
      mouth.quadraticCurveTo(4, 24 + open * 1.6, -30, 12);
      ctx.fillStyle = '#120a12'; ctx.fill(mouth);
      ctx.save(); ctx.clip(mouth);
      glow(ctx, 0, 22 + open, 26, p.fire, 0.8 * fl);
      ctx.fillStyle = '#f6efe0';
      for (let i = 0; i < 7; i++) {
        const x = -24 + i * 8.4, y = 12 + sin((i / 6) * PI) * 6;
        ctx.beginPath(); ctx.moveTo(x - 3.4, y - 3); ctx.lineTo(x + 3.4, y - 3); ctx.lineTo(x, y + 6); ctx.fill();
        const y2 = 18 + open * 1.4 - (i === 0 || i === 6 ? 6 : 0);
        ctx.beginPath(); ctx.moveTo(x - 2.6, y2 + 3); ctx.lineTo(x + 2.6, y2 + 3); ctx.lineTo(x + 0.6, y2 - 4); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = p.line; ctx.lineWidth = 1.6; ctx.stroke(mouth);
      // long tongue lolling out
      const tl = 38 + P.reach * 70 + P.cast * 10;
      const tsw = sin(t * 2.2) * 8;
      const tp = [[2, 20 + open * 0.6], [10 + tl * 0.25, 30 + open * 0.5], [18 + tl * 0.55, 44 + tsw * 0.4 - P.reach * 20], [24 + tl * 0.9, 58 + tsw - P.reach * 34], [20 + tl, 70 + tsw * 1.3 - P.reach * 42]];
      const tongue = ribbon(tp, 15, 8, 6);
      paint(ctx, tongue, lg(ctx, 0, 20, 30, 70, [0, p.tongueD, 0.3, p.tongue, 1, shade(p.tongue, 0.15)]),
        { hi: rgba('#ffd0dc', 0.6), hiw: 1.6, line: p.tongueD, lw: 1.5 });
      ctx.strokeStyle = rgba(p.tongueD, 0.6); ctx.lineWidth = 1.2;
      ctx.beginPath(); curve(ctx, tp.slice(0, 4)); ctx.stroke();
      ctx.restore();
      ctx.restore();
      // drifting will-o-wisp sparks
      particles(6, t, 0.5, 21, (i, life, r) => {
        glow(ctx, (r(1) - 0.5) * 60 + sin(life * 6 + i) * 8, -60 - life * 70, 5 + r(2) * 4, p.fire, sin(life * PI) * 0.9);
      });
    },
  });

  // =============================================================================================
  // 礦坑蝙蝠 mine_bat — big cave bat with crystal shards growing from its back
  def('mine_bat', {
    w: 170, h: 150,
    pal: {
      fur: '#5a4652', furD: '#2a1e28', furL: '#9a7e86', wing: '#4a3046', wingD: '#1e1222', wingL: '#a0708a', bone: '#c8a8a8',
      eye: '#ffb43a', crystal: '#62f0d8', crystalD: '#1e7a7e', line: '#1a0e18', magic: '#7af5df',
    },
    vars: [{ h: 160, s: 1.2, keep: ['eye'] }, { h: -40, s: 1.4, l: -0.03, set: { eye: '#ff4a3a' } }],
    draw(ctx, t, o, p, P) {
      const fl = sin(t * 7.5 + P.atk * 2);
      const bob = -fl * 6 + sin(t * 1.3) * 3;
      ctx.translate(0, -88 + bob);
      ctx.rotate(P.atk * 0.25 - P.hurt * 0.2);
      // wings
      const wing = (side, back) => {
        const s = side;
        const f = back ? sin(t * 7.5 + 0.3) : fl;
        const lift = f * 34;
        const sh = [s * 10, -10];
        const wr = [s * 56, -40 - lift * 0.9];
        const f1 = [s * 98, -18 - lift * 1.2];
        const f2 = [s * 92, 18 - lift * 0.6];
        const f3 = [s * 62, 34 - lift * 0.2];
        const bd = [s * 12, 16];
        const m = new Path2D();
        m.moveTo(sh[0], sh[1]);
        m.lineTo(wr[0], wr[1]);
        m.lineTo(f1[0], f1[1]);
        m.quadraticCurveTo(s * 82, (f1[1] + f2[1]) / 2 + 2, f2[0], f2[1]);
        m.quadraticCurveTo(s * 70, (f2[1] + f3[1]) / 2 - 4, f3[0], f3[1]);
        m.quadraticCurveTo(s * 34, 22 - lift * 0.1, bd[0], bd[1]);
        m.closePath();
        ctx.save();
        ctx.globalAlpha = 0.97;
        const wc = back ? p.wingD : p.wing;
        paint(ctx, m, lg(ctx, sh[0], sh[1], f2[0], f2[1], [0, back ? p.wingD : p.wingL, 0.35, wc, 1, back ? shade(p.wingD, -0.3) : p.wingD]),
          { sh: back ? null : rgba(p.wingD, 0.5), shw: 6, rim: back ? null : rgba(p.crystal, 0.35), line: p.line, lw: 1.6 });
        // veins / finger bones
        ctx.strokeStyle = back ? rgba(p.bone, 0.35) : rgba(p.bone, 0.75);
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(wr[0], wr[1]); ctx.stroke();
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (const fp of [f1, f2, f3]) { ctx.moveTo(wr[0], wr[1]); ctx.quadraticCurveTo((wr[0] + fp[0]) / 2 + s * 4, (wr[1] + fp[1]) / 2 - 4, fp[0], fp[1]); }
        ctx.stroke();
        // thumb claw
        claw(ctx, wr[0], wr[1], s > 0 ? -1.2 : -1.9, 9, 4, p.bone, p.line);
        ctx.restore();
      };
      wing(-1, true);
      // body cached
      const body = part('mine_bat/body/' + (o.variant | 0), 90, 100, 45, 55, (c) => {
        // crystals on back
        for (const [x, y, a, l] of [[-14, -22, -2.3, 22], [-4, -28, -1.9, 28], [-20, -8, -2.7, 16]]) {
          c.save(); c.translate(x, y); c.rotate(a);
          const cr = poly([[0, -5], [l * 0.85, -4], [l, 0], [l * 0.85, 4], [0, 5]]);
          paint(c, cr, lg(c, 0, -5, 0, 5, [0, shade(p.crystal, 0.5), 0.5, p.crystal, 1, p.crystalD]), { line: p.crystalD, lw: 1.2 });
          c.strokeStyle = rgba('#ffffff', 0.6); c.lineWidth = 1; c.beginPath(); c.moveTo(2, -2); c.lineTo(l * 0.8, -2); c.stroke();
          c.restore();
        }
        const b = blob([[-16, -18], [0, -26], [18, -20], [22, 4], [14, 26], [0, 32], [-14, 24], [-22, 2]]);
        paint(c, b, rg(c, -2, -10, 2, 0, 0, 34, [0, p.furL, 0.5, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 7, hi: rgba(p.furL, 0.5), hiw: 1.6, line: p.line, lw: 2 });
        hatch(c, b, 70, 3, [-24, -26, 48, 60], rgba(p.furD, 0.5), 1, 6, 1.3);
        hatch(c, b, 40, 4, [-20, -26, 30, 30], rgba(p.furL, 0.45), 1, 5, 1.6);
        // chest tuft
        const tuft = blob([[-2, -2], [12, -4], [14, 14], [4, 22], [-4, 10]]);
        c.fillStyle = rgba(p.furL, 0.45); c.fill(tuft);
        // head
        const ears = [poly([[2, -26], [-6, -52], [12, -32]]), poly([[14, -28], [26, -54], [28, -26]])];
        for (const e of ears) paint(c, e, lg(c, 0, -50, 0, -26, [0, p.furL, 1, p.fur]), { line: p.line, lw: 1.6 });
        c.fillStyle = rgba('#d08a9a', 0.7);
        c.beginPath(); c.moveTo(4, -30); c.lineTo(-1, -46); c.lineTo(9, -32); c.fill();
        c.beginPath(); c.moveTo(17, -30); c.lineTo(24, -47); c.lineTo(25, -29); c.fill();
        const hd = blob([[0, -32], [18, -36], [32, -24], [34, -14], [24, -6], [6, -8], [-2, -20]]);
        paint(c, hd, rg(c, 14, -28, 2, 14, -20, 24, [0, p.furL, 0.6, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.5), shw: 5, line: p.line, lw: 1.8 });
        // snout
        const sn = blob([[24, -20], [36, -20], [38, -12], [28, -10]]);
        paint(c, sn, shade(p.fur, 0.2), { line: p.line, lw: 1.3 });
        c.fillStyle = p.line; c.beginPath(); c.arc(35, -17, 1.4, 0, TAU); c.fill();
        // feet
        for (const fx of [-6, 8]) {
          c.strokeStyle = p.bone; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(fx, 26); c.lineTo(fx - 2, 38); c.stroke();
          claw(c, fx - 2, 38, 1.2, 6, 3, p.bone, p.line);
          claw(c, fx - 2, 38, 2.0, 6, 3, p.bone, p.line);
        }
      });
      wing(1, false);
      ctx.save();
      ctx.scale(1.3, 1.3);
      blit(ctx, body);
      // eyes & mouth (live)
      const sq = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 21, -22, 3.8, p.eye, 0.85 + 0.15 * sin(t * 4), '#fff6c0', 3 * sq);
      eye(ctx, 30, -22, 3, p.eye, 0.75, '#fff6c0', 2.4 * sq);
      const mo = 2 + P.atk * 5 + P.cast * 3;
      ctx.fillStyle = '#1a0610';
      ctx.beginPath(); ctx.ellipse(31, -9 + mo * 0.4, 5, mo, 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff4ea';
      ctx.beginPath(); ctx.moveTo(28, -11); ctx.lineTo(30, -11); ctx.lineTo(29, -5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(33, -11); ctx.lineTo(35, -11); ctx.lineTo(34, -5.5); ctx.fill();
      ctx.restore();
      // crystal shimmer
      glow(ctx, -8, -38, 26, p.crystal, 0.35 + 0.15 * sin(t * 3));
      // sonar rings on cast/attack
      const k = max(P.cast, P.atk);
      if (k > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const q = ((t * 1.4) + i / 3) % 1;
          ctx.strokeStyle = rgba(p.crystal, (1 - q) * 0.7 * k); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(36, -14, 10 + q * 50, -0.7, 0.7); ctx.stroke();
        }
        ctx.restore();
      }
    },
  });

  // =============================================================================================
  // 礦工魂 miner_ghost — ghost of a 九份 gold miner: helmet carbide lamp, towel, pickaxe
  def('miner_ghost', {
    w: 120, h: 185,
    pal: {
      skin: '#9fd0c8', skinD: '#4f8a88', skinL: '#dcf6ee', shirt: '#4a6a78', shirtD: '#203844', shirtL: '#86a8b2',
      pants: '#3a4e5e', helm: '#b89a4a', helmD: '#5e4a20', helmL: '#f0dc96', towel: '#e8eee4', lamp: '#ffd27a',
      wood: '#8a6a48', iron: '#9aa6ae', eye: '#bffcff', mist: '#7fd4d0', line: '#16303a', magic: '#9ff0e8',
    },
    vars: [{ h: 70, s: 1.0, keep: ['lamp', 'helm', 'helmD', 'helmL', 'wood', 'iron'] }, { h: -150, s: 1.1, keep: ['lamp', 'helm', 'helmD', 'helmL', 'wood', 'iron'] }],
    draw(ctx, t, o, p, P) {
      const bob = sin(t * 1.5) * 4;
      ctx.translate(0, bob - 6);
      // mist tail
      soft(ctx, 0, -18, 46, p.mist, 0.35);
      wisps(ctx, -4, -46, 54, t, p.mist, 5, 44, 0.32, 3);
      ctx.globalAlpha *= 0.94;
      const body = part('miner_ghost/body/' + (o.variant | 0), 110, 160, 55, 150, (c) => {
        // trousers (fading)
        const pants = blob([[-24, -78], [22, -80], [26, -40], [18, -6], [-4, 0], [-22, -10], [-28, -44]]);
        paint(c, pants, lg(c, 0, -80, 0, 0, [0, p.pants, 1, shade(p.pants, -0.3)]), { sh: rgba(p.shirtD, 0.5), shw: 6, line: p.line, lw: 1.8 });
        c.strokeStyle = rgba(p.shirtD, 0.6); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(0, -70); c.quadraticCurveTo(2, -40, -2, -6); c.stroke();
        // shirt torso
        const shirt = blob([[-22, -126], [0, -132], [22, -124], [28, -100], [24, -76], [0, -72], [-26, -76], [-30, -104]]);
        paint(c, shirt, lg(c, -20, -130, 20, -70, [0, p.shirtL, 0.5, p.shirt, 1, p.shirtD]),
          { sh: rgba(p.shirtD, 0.6), shw: 7, hi: rgba(p.shirtL, 0.6), hiw: 1.6, rim: rgba(p.eye, 0.5), line: p.line, lw: 2 });
        // patch & suspenders
        c.fillStyle = rgba(shade(p.shirt, -0.2), 0.9); c.fillRect(-18, -98, 10, 9);
        c.strokeStyle = rgba(p.shirtL, 0.6); c.setLineDash([2, 2]); c.lineWidth = 1; c.strokeRect(-18, -98, 10, 9); c.setLineDash([]);
        c.strokeStyle = shade(p.pants, -0.2); c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(-14, -126); c.lineTo(-10, -78); c.moveTo(14, -126); c.lineTo(12, -78); c.stroke();
        // belt
        c.fillStyle = shade(p.wood, -0.35); c.fillRect(-28, -82, 54, 7);
        c.fillStyle = p.helm; c.fillRect(-4, -82, 7, 7);
        fadeOut(c, -60, -46, 120, 0);
        // towel around neck
        const tw = blob([[-18, -132], [0, -126], [20, -132], [18, -122], [8, -118], [10, -100], [2, -100], [0, -118], [-16, -122]]);
        paint(c, tw, p.towel, { sh: rgba(p.skinD, 0.5), shw: 4, line: shade(p.towel, -0.5), lw: 1.3 });
        // head
        const hd = blob([[-12, -150], [6, -156], [18, -146], [20, -132], [12, -124], [-2, -124], [-12, -134]]);
        paint(c, hd, rg(c, 4, -146, 2, 4, -140, 22, [0, p.skinL, 0.55, p.skin, 1, p.skinD]), { sh: rgba(p.skinD, 0.6), shw: 5, line: p.line, lw: 1.6 });
        // gaunt cheek & stubble
        soft(c, 8, -132, 8, p.skinD, 0.6);
        hatch(c, hd, 26, 8, [-2, -136, 20, 12], rgba(p.line, 0.35), 0.8, 1.6, 1.6, 1);
        // helmet
        const hm = new Path2D();
        hm.moveTo(-18, -148); hm.bezierCurveTo(-18, -168, 18, -172, 20, -150); hm.closePath();
        paint(c, hm, lg(c, -10, -170, 10, -148, [0, p.helmL, 0.5, p.helm, 1, p.helmD]), { sh: rgba(p.helmD, 0.6), shw: 5, hi: rgba('#ffffff', 0.4), hiw: 1.4, line: shade(p.helmD, -0.4), lw: 1.6 });
        const brim = ell(2, -149, 25, 4.5);
        paint(c, brim, lg(c, 0, -153, 0, -145, [0, p.helm, 1, p.helmD]), { line: shade(p.helmD, -0.4), lw: 1.4 });
        c.strokeStyle = rgba(p.helmD, 0.7); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(1, -169); c.quadraticCurveTo(4, -160, 3, -150); c.stroke();
        // lamp housing
        const lp = new Path2D(); lp.roundRect(14, -164, 9, 11, 2);
        paint(c, lp, p.iron, { line: shade(p.iron, -0.6), lw: 1.2 });
      });
      blit(ctx, body);
      // eyes
      const sq = P.hurt > 0.2 ? 0.3 : 1;
      ctx.fillStyle = rgba(p.line, 0.85);
      ctx.beginPath(); ctx.ellipse(6, -141, 3.6, 3 * sq + 0.5, 0, 0, TAU); ctx.ellipse(15.5, -141, 2.8, 2.6 * sq + 0.5, 0, 0, TAU); ctx.fill();
      eye(ctx, 6.5, -141, 1.6, p.eye, 0.9, '#ffffff', 1.6 * sq);
      eye(ctx, 16, -141, 1.3, p.eye, 0.7, '#ffffff', 1.3 * sq);
      ctx.fillStyle = rgba(p.line, 0.8);
      ctx.beginPath(); ctx.ellipse(13, -130, 2.4, 1.6 + P.atk * 2.5 + P.cast * 1.5, 0, 0, TAU); ctx.fill();
      // lamp beam (flicker)
      const fk = 0.8 + 0.2 * sin(t * 9) * sin(t * 5.3);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bm = new Path2D(); bm.moveTo(23, -160); bm.lineTo(120, -186); bm.lineTo(120, -116); bm.closePath();
      ctx.fillStyle = lg(ctx, 23, -158, 120, -150, [0, rgba(p.lamp, 0.35 * fk), 1, rgba(p.lamp, 0)]);
      ctx.fill(bm);
      ctx.restore();
      glow(ctx, 24, -158, 20, p.lamp, fk);
      glow(ctx, 24, -158, 6, '#ffffff', fk);
      // arms + pickaxe (live)
      const ang = U.lerp(-1.25, 0.55, P.reach) - P.wind * 1.1 + sin(t * 1.5) * 0.04 - P.hurt * 0.3 + P.cast * 0.3;
      const hx = 14 + P.reach * 12, hy = -96 - P.wind * 6;
      // back arm to grip
      limb(ctx, [[-14, -120], [-10 + P.reach * 6, -100], [hx - 4, hy + 4]], 11, 8, shade(p.shirt, -0.15), { line: p.line, lw: 1.5 });
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(ang);
      const hdl = new Path2D(); hdl.roundRect(-18, -2.6, 92, 5.2, 2.6);
      paint(ctx, hdl, lg(ctx, 0, -3, 0, 3, [0, shade(p.wood, 0.3), 1, shade(p.wood, -0.3)]), { line: shade(p.wood, -0.6), lw: 1.2 });
      // pick head
      const ph = new Path2D();
      ph.moveTo(64, -6); ph.quadraticCurveTo(62, -24, 50, -40); ph.quadraticCurveTo(70, -26, 76, -6);
      ph.lineTo(76, 6); ph.quadraticCurveTo(70, 26, 50, 40); ph.quadraticCurveTo(62, 24, 64, 6); ph.closePath();
      paint(ctx, ph, lg(ctx, 60, -30, 76, 30, [0, shade(p.iron, 0.4), 0.5, p.iron, 1, shade(p.iron, -0.4)]), { hi: rgba('#ffffff', 0.5), hiw: 1, line: shade(p.iron, -0.7), lw: 1.4 });
      if (P.reach > 0.3) glow(ctx, 50, 38, 22, p.eye, P.reach * 0.6);
      ctx.restore();
      // front arm
      limb(ctx, [[16, -120], [20 + P.reach * 8, -104], [hx + 2, hy + 2]], 12, 9, p.shirt, { hi: rgba(p.shirtL, 0.5), hiw: 1.2, line: p.line, lw: 1.5 });
      ctx.fillStyle = p.skin; ctx.strokeStyle = p.line; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(hx + 2, hy + 1, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
      // ghost motes
      particles(5, t, 0.4, 41, (i, life, r) => glow(ctx, (r(1) - 0.5) * 70, -20 - life * 120, 4 + r(2) * 3, p.mist, sin(life * PI) * 0.8));
    },
  });

  // =============================================================================================
  // 沙蟹精 sand_crab — giant beach crab spirit with one huge claw
  def('sand_crab', {
    w: 180, h: 125,
    pal: {
      shell: '#d98a4a', shellD: '#7a3a1e', shellL: '#ffd29a', spot: '#b4482a', belly: '#f0dcb8', leg: '#c8743e',
      eye: '#ffe86a', claw: '#e2904e', clawTip: '#3a1a14', line: '#4a2012', sand: '#e6cf9a', magic: '#ffd27a',
    },
    vars: [{ h: 175, s: 0.9, keep: ['sand', 'eye'] }, { h: -28, s: 1.25, l: -0.08, keep: ['sand'], set: { eye: '#9affd8' } }],
    draw(ctx, t, o, p, P) {
      const br = sin(t * 2.2) * 1.5;
      const scut = sin(t * 3.1) * 3;
      // sand puffs
      for (let i = 0; i < 4; i++) soft(ctx, -60 + i * 40, -4, 20, p.sand, 0.18);
      ctx.translate(scut * 0.5, 0);
      const legs = (back) => {
        for (let i = 0; i < 4; i++) {
          const ph = t * 6 + i * 1.3 + (back ? 0.7 : 0);
          const lift = max(0, sin(ph)) * 5 * (abs(scut) > 2 ? 1 : 0.4);
          const bx = -28 + i * 18 + (back ? -6 : 0), by = -42 + (back ? -6 : 0);
          const kx = bx + (i < 2 ? -16 : 12) + (back ? -4 : 0), ky = by - 14 - lift;
          const fx = bx + (i < 2 ? -26 : 22) + (back ? -8 : 4), fy = -2 - lift - (back ? 6 : 0);
          const col = back ? shade(p.leg, -0.3) : p.leg;
          limb(ctx, [[bx, by], [kx, ky]], 12, 9, col, { hi: back ? null : rgba(p.shellL, 0.5), hiw: 1, line: p.line, lw: 1.4 });
          limb(ctx, [[kx, ky], [(kx + fx) / 2 + (i < 2 ? -3 : 3), (ky + fy) / 2], [fx, fy]], 9, 2, col, { hi: back ? null : rgba(p.shellL, 0.5), hiw: 1, line: p.line, lw: 1.4 });
          ctx.fillStyle = back ? shade(p.shellD, -0.2) : p.shellD; ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fill();
        }
      };
      legs(true);
      // small back claw
      const bc = [[-4, -50], [-16 + P.reach * 6, -64], [6 + P.reach * 10, -72]];
      limb(ctx, bc, 10, 7, shade(p.claw, -0.25), { line: p.line, lw: 1.4 });
      ctx.save(); ctx.translate(bc[2][0], bc[2][1]); ctx.rotate(-0.6);
      paint(ctx, blob([[-4, -6], [14, -8], [18, 0], [10, 6], [-4, 5]]), shade(p.claw, -0.2), { line: p.line, lw: 1.3 });
      ctx.restore();
      // shell (cached)
      ctx.save(); ctx.translate(0, br);
      const shell = part('sand_crab/shell/' + (o.variant | 0), 150, 100, 75, 90, (c) => {
        const belly = blob([[-50, -40], [0, -24], [50, -40], [36, -28], [-36, -28]]);
        paint(c, belly, p.belly, { line: p.line, lw: 1.6 });
        const sh = new Path2D();
        sh.moveTo(-62, -44);
        sh.bezierCurveTo(-64, -66, -36, -84, 0, -84);
        sh.bezierCurveTo(40, -84, 64, -66, 62, -46);
        sh.bezierCurveTo(56, -36, 30, -32, 0, -32);
        sh.bezierCurveTo(-30, -32, -56, -36, -62, -44);
        sh.closePath();
        paint(c, sh, rg(c, -14, -72, 4, 0, -56, 70, [0, p.shellL, 0.4, p.shell, 1, p.shellD]),
          { sh: rgba(p.shellD, 0.6), shw: 9, hi: rgba(p.shellL, 0.7), hiw: 2, rim: rgba('#fff2d0', 0.5), line: p.line, lw: 2.2 });
        c.save(); c.clip(sh);
        // grooves (H-shaped crab carapace)
        c.strokeStyle = rgba(p.shellD, 0.55); c.lineWidth = 2;
        c.beginPath(); c.moveTo(-24, -80); c.quadraticCurveTo(-14, -60, -26, -36); c.moveTo(24, -80); c.quadraticCurveTo(14, -60, 26, -36);
        c.moveTo(-16, -58); c.quadraticCurveTo(0, -52, 16, -58); c.stroke();
        // spots & bumps
        for (let i = 0; i < 18; i++) {
          const x = -54 + U.hash(i, 1, 17) * 108, y = -80 + U.hash(i, 2, 17) * 40;
          c.fillStyle = rgba(p.spot, 0.55); c.beginPath(); c.ellipse(x, y, 2 + U.hash(i, 3, 17) * 4, 1.5 + U.hash(i, 4, 17) * 2.5, 0, 0, TAU); c.fill();
        }
        for (let i = 0; i < 10; i++) {
          const x = -40 + U.hash(i, 5, 17) * 80, y = -78 + U.hash(i, 6, 17) * 26;
          c.fillStyle = rgba(p.shellL, 0.7); c.beginPath(); c.arc(x, y, 1.5, 0, TAU); c.fill();
        }
        c.restore();
        // front rim spikes
        for (let i = 0; i < 4; i++) {
          const x = 46 + i * 4, y = -70 + i * 8;
          paint(c, poly([[x - 4, y - 3], [x + 8, y - 1], [x - 2, y + 4]]), p.shell, { line: p.line, lw: 1.2 });
        }
        // barnacle + seaweed bit
        paint(c, circle(-30, -76, 5), '#e8e4d6', { line: '#6a5a4a', lw: 1 });
        c.fillStyle = '#4a3a30'; c.beginPath(); c.arc(-30, -77, 1.8, 0, TAU); c.fill();
        c.fillStyle = '#4f8a55';
        c.fill(ribbon([[-46, -70], [-56, -60], [-54, -48]], 4, 1, 4));
      });
      blit(ctx, shell);
      // eye stalks
      for (const [x, s] of [[30, 1], [44, 0.9]]) {
        const sway = sin(t * 2 + x) * 2 - P.hurt * 4;
        const top = [x + sway + 4, -100 + (s < 1 ? 4 : 0) - P.cast * 4];
        limb(ctx, [[x - 4, -80], [x + sway * 0.5, -92], top], 5, 4, p.leg, { line: p.line, lw: 1.2 });
        ctx.fillStyle = '#1a0c0a'; ctx.beginPath(); ctx.arc(top[0], top[1], 5 * s, 0, TAU); ctx.fill();
        eye(ctx, top[0] + 1, top[1], 2.8 * s, p.eye, 0.9, '#ffffff', P.hurt > 0.2 ? 0.8 : 2.8 * s);
      }
      // mouth bubbles
      particles(5, t, 0.6, 51, (i, life, r) => {
        const x = 52 + life * 20 + sin(life * 8 + i) * 3, y = -44 - life * 30;
        ctx.strokeStyle = rgba('#ffffff', 0.6 * (1 - life)); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, 2 + r(1) * 3, 0, TAU); ctx.stroke();
      });
      ctx.restore();
      legs(false);
      // big claw (front)
      const op = 0.25 + 0.1 * sin(t * 1.8) + P.wind * 0.5 - P.reach * 0.3 + P.cast * 0.2;
      const cx = 56 + P.reach * 28, cy = -50 - P.reach * 6 - P.wind * 8;
      limb(ctx, [[30, -40], [44 + P.reach * 10, -30], [cx - 6, cy + 6]], 14, 12, p.claw, { hi: rgba(p.shellL, 0.6), hiw: 1.4, line: p.line, lw: 1.6 });
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.25 - P.wind * 0.3);
      // palm
      const palm = blob([[-10, -16], [22, -20], [36, -10], [34, 10], [16, 18], [-10, 14]]);
      paint(ctx, palm, rg(ctx, 8, -10, 2, 10, 0, 36, [0, p.shellL, 0.5, p.claw, 1, p.shellD]),
        { sh: rgba(p.shellD, 0.6), shw: 6, hi: rgba(p.shellL, 0.6), hiw: 1.6, line: p.line, lw: 1.8 });
      for (let i = 0; i < 6; i++) { ctx.fillStyle = rgba(p.spot, 0.5); ctx.beginPath(); ctx.arc(4 + U.hash(i, 1, 9) * 24, -10 + U.hash(i, 2, 9) * 20, 1.6, 0, TAU); ctx.fill(); }
      // fixed finger
      const ff = new Path2D();
      ff.moveTo(30, 2); ff.quadraticCurveTo(52, 6, 64, -4); ff.quadraticCurveTo(54, 14, 30, 12); ff.closePath();
      paint(ctx, ff, lg(ctx, 30, 0, 64, 0, [0, p.claw, 0.75, p.claw, 1, p.clawTip]), { line: p.line, lw: 1.5 });
      // moving finger (dactyl)
      ctx.save(); ctx.translate(30, -8); ctx.rotate(-op);
      const mf = new Path2D();
      mf.moveTo(0, -6); mf.quadraticCurveTo(26, -16, 38, 0); mf.quadraticCurveTo(22, -2, 0, 6); mf.closePath();
      paint(ctx, mf, lg(ctx, 0, 0, 38, 0, [0, p.claw, 0.7, p.claw, 1, p.clawTip]), { hi: rgba(p.shellL, 0.6), hiw: 1.2, line: p.line, lw: 1.5 });
      // teeth
      ctx.fillStyle = p.belly;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(8 + i * 7, -0.5 + i * 0.4, 1.5, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.restore();
      if (P.reach > 0.6) glow(ctx, cx + 60, cy - 6, 24, '#ffffff', (P.reach - 0.6) * 1.5);
    },
  });

  // =============================================================================================
  // 水鬼王 water_ghost_king — BOSS: hulking drowned giant in nets & seaweed, shell crown,
  // swallowed lantern-lights glowing inside its translucent body
  def('water_ghost_king', {
    w: 300, h: 320,
    pal: {
      skin: '#4f8a86', skinD: '#1d3f46', skinL: '#9fd4c4', belly: '#7fc4bc', rag: '#2a3e3e', ragD: '#111e22',
      weed: '#2e5a32', weedL: '#6fa458', net: '#c8b88a', float: '#d0603a', shell: '#f0dcc4', shellD: '#a07a64',
      coral: '#e8726a', pearl: '#eaf6ff', eye: '#c8ffd8', lamp1: '#ffc560', lamp2: '#7fd8ff', water: '#7fd7d9',
      line: '#0c2228', magic: '#5fe0d0',
    },
    vars: [{ h: 50, s: 1.0, keep: ['lamp1', 'lamp2', 'shell', 'pearl', 'net'] }, { h: -170, s: 1.15, l: -0.05, keep: ['lamp1', 'shell', 'pearl', 'net'], set: { eye: '#ff7a6a' } }],
    draw(ctx, t, o, p, P, v) {
      const ph = o.phase || 1;
      const br = sin(t * 1.1);
      // pool
      ctx.fillStyle = rgba(p.ragD, 0.6);
      ctx.beginPath(); ctx.ellipse(0, -4, 150, 22, 0, 0, TAU); ctx.fill();
      ripples(ctx, 0, -4, 160, t * 0.7, p.water, 4, 0.4);
      const reach = P.reach * 70 - P.wind * 20;
      // back arm + dragged net (live)
      const bs = [-96, -220 + br * 2], be = [-146 - P.wind * 8, -150], bh = [-128 + P.cast * 10, -76 + br * 3 - P.cast * 40];
      limb(ctx, [bs, be, bh], (u) => 48 - u * 22 + sin(u * PI * 2) * 4, 0, lg(ctx, -150, -200, -100, -80, [0, p.skin, 1, p.skinD]), { sh: rgba(p.skinD, 0.6), shw: 8, line: p.line, lw: 2.4 });
      ctx.strokeStyle = rgba(p.net, 0.7); ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        ctx.moveTo(bh[0] - 8 + i * 4, bh[1] + 6);
        ctx.quadraticCurveTo(bh[0] - 20 - i * 6 + sin(t + i) * 4, bh[1] + 50, -136 - i * 6, -4 + (i % 2) * 4);
      }
      for (let j = 1; j < 4; j++) {
        const u = j / 4;
        ctx.moveTo(U.lerp(bh[0] - 8, -136, u), U.lerp(bh[1] + 6, -4, u) + 8);
        ctx.lineTo(U.lerp(bh[0] + 12, -166, u), U.lerp(bh[1] + 6, 0, u) + 6);
      }
      ctx.stroke();
      paint(ctx, ell(-160, -6, 7, 5), p.float, { line: p.line, lw: 1.2 });
      // back hand
      ctx.save(); ctx.translate(bh[0], bh[1]); ctx.rotate(1.6);
      paint(ctx, blob([[-12, -14], [14, -16], [24, -2], [18, 14], [-10, 14]]), p.skinD, { line: p.line, lw: 2 });
      for (let f = 0; f < 4; f++) claw(ctx, 20, -10 + f * 7, 0.3, 14, 5, shade(p.shell, -0.2), p.line);
      ctx.restore();
      // torso (cached)
      ctx.save();
      ctx.translate(0, br * 2);
      const torso = part('water_ghost_king/torso/' + v, 300, 320, 150, 312, (c) => {
        // massive hunched torso, waist-deep in the sea
        const tor = new Path2D();
        tor.moveTo(-80, -14);
        tor.bezierCurveTo(-96, -80, -134, -150, -126, -212);
        tor.bezierCurveTo(-120, -262, -72, -290, -20, -288);
        tor.bezierCurveTo(30, -286, 74, -262, 88, -230);
        tor.bezierCurveTo(100, -200, 86, -160, 76, -132);
        tor.bezierCurveTo(96, -96, 90, -40, 72, -14);
        tor.bezierCurveTo(30, -4, -40, -4, -80, -14);
        tor.closePath();
        paint(c, tor, rg(c, -30, -230, 10, -10, -180, 140, [0, p.skinL, 0.35, p.skin, 1, p.skinD]),
          { sh: rgba(p.skinD, 0.7), shw: 16, hi: rgba(p.skinL, 0.55), hiw: 3, rim: rgba(p.water, 0.7), rimw: 2.4, line: p.line, lw: 2.6 });
        c.save(); c.clip(tor);
        // translucent belly window where swallowed lanterns glow
        const bw = blob([[-64, -210], [0, -226], [60, -196], [70, -120], [30, -60], [-40, -64], [-78, -150]]);
        c.fillStyle = rg(c, 0, -150, 6, 0, -150, 95, [0, rgba(p.belly, 0.75), 0.7, rgba(p.belly, 0.25), 1, rgba(p.belly, 0)]);
        c.fill(bw);
        // drowned-body mottling & ribs
        for (let i = 0; i < 40; i++) {
          const x = -100 + U.hash(i, 1, 31) * 190, y = -270 + U.hash(i, 2, 31) * 170;
          c.fillStyle = rgba(U.hash(i, 3, 31) > 0.5 ? p.skinD : p.skinL, 0.18);
          c.beginPath(); c.ellipse(x, y, 4 + U.hash(i, 4, 31) * 10, 3 + U.hash(i, 5, 31) * 6, U.hash(i, 6, 31) * 3, 0, TAU); c.fill();
        }
        c.strokeStyle = rgba(p.skinD, 0.45); c.lineWidth = 3;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-70, -210 + i * 22); c.quadraticCurveTo(-30, -196 + i * 22, -8, -204 + i * 20); c.stroke(); }
        // barnacle clusters
        for (let i = 0; i < 14; i++) {
          const x = -90 + U.hash(i, 7, 31) * 70, y = -250 + U.hash(i, 8, 31) * 120;
          const r = 2.5 + U.hash(i, 9, 31) * 3.5;
          c.fillStyle = p.shell; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
          c.fillStyle = p.shellD; c.beginPath(); c.arc(x + 0.5, y - 0.5, r * 0.45, 0, TAU); c.fill();
        }
        // fishing net wrapped diagonally
        const band = new Path2D();
        band.moveTo(-120, -236); band.lineTo(-60, -280); band.lineTo(110, -130); band.lineTo(70, -90); band.closePath();
        c.save(); c.clip(band);
        c.strokeStyle = rgba(p.net, 0.85); c.lineWidth = 1.6;
        c.beginPath();
        for (let i = -30; i < 30; i++) {
          c.moveTo(-140 + i * 11, -300); c.lineTo(-140 + i * 11 + 160, -60);
          c.moveTo(-140 + i * 11, -60); c.lineTo(-140 + i * 11 + 160, -300);
        }
        c.stroke();
        c.restore();
        c.strokeStyle = shade(p.net, -0.3); c.lineWidth = 3.2;
        c.beginPath(); c.moveTo(-120, -236); c.quadraticCurveTo(0, -150, 70, -90); c.stroke();
        c.strokeStyle = rgba(p.net, 0.9); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-120, -237); c.quadraticCurveTo(0, -151, 70, -91); c.stroke();
        for (const [x, y] of [[-70, -190], [-20, -158], [30, -122]]) paint(c, ell(x, y, 7, 5, 0.6), p.float, { hi: rgba('#ffffff', 0.4), hiw: 1, line: p.line, lw: 1.2 });
        c.restore();
        // seaweed draped over the shoulders
        const weeds = [[-70, -262, -104, -120], [-44, -280, -60, -150], [-16, -286, -8, -196], [52, -252, 92, -150], [-104, -200, -124, -70], [-90, -120, -96, -30]];
        weeds.forEach((w, i) => {
          const L = 1 + U.hash(i, 1, 44) * 0.3;
          const pts = [[w[0], w[1]], [U.lerp(w[0], w[2], 0.33) + 8, U.lerp(w[1], w[3], 0.33)], [U.lerp(w[0], w[2], 0.66) - 8, U.lerp(w[1], w[3], 0.66) * L], [w[2], w[3] * L]];
          const sp = ribbon(pts, (u) => 15 * (1 - u * 0.7) * (0.7 + 0.3 * sin(u * 19 + i)), 0, 8);
          paint(c, sp, lg(c, w[0], w[1], w[2], w[3], [0, p.weedL, 1, p.weed]), { hi: rgba(p.weedL, 0.6), hiw: 1.2, line: shade(p.weed, -0.5), lw: 1.3 });
          c.strokeStyle = rgba(p.weedL, 0.5); c.lineWidth = 1; c.beginPath(); curve(c, pts); c.stroke();
        });
      });
      blit(ctx, torso);
      // trapped lantern-lights (live, pulsing)
      const lights = [[-34, -190, p.lamp1], [16, -170, p.lamp2], [-10, -132, p.lamp1], [40, -112, p.lamp1], [-52, -120, p.lamp2], [8, -84, p.lamp2]];
      if (ph >= 2) lights.push([30, -206, p.lamp2], [-30, -86, p.lamp1]);
      lights.forEach(([x, y, col], i) => {
        const pu = 0.6 + 0.4 * sin(t * 2.2 + i * 1.7) + P.cast * 0.4;
        const dx = sin(t * 0.7 + i) * 4, dy = cos(t * 0.9 + i * 2) * 3;
        glow(ctx, x + dx, y + dy, 26 + 6 * pu, col, 0.5 * pu);
        ctx.save(); ctx.translate(x + dx, y + dy); ctx.rotate(sin(t + i) * 0.3);
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 7, 9, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba(shade(col, -0.4), 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(0, 0, 3.5, 9, 0, 0, TAU); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.stroke();
        ctx.fillStyle = shade(col, -0.55); ctx.fillRect(-4, -11, 8, 2.5); ctx.fillRect(-4, 8.5, 8, 2.5);
        ctx.restore();
        glow(ctx, x + dx, y + dy, 6, '#ffffff', 0.7 * pu);
      });
      ctx.restore();
      // head (cached), forward and low
      ctx.save();
      ctx.translate(68 + P.reach * 12 - P.hurt * 14, -212 + br * 3 + P.reach * 6);
      ctx.scale(1.35, 1.35);
      ctx.rotate(0.12 + sin(t * 0.8) * 0.03 + P.reach * 0.1 - P.hurt * 0.2 - P.cast * 0.15);
      const head = part('water_ghost_king/head/' + v, 140, 140, 70, 70, (c) => {
        // seaweed hair hanging behind
        for (let i = 0; i < 6; i++) {
          const x = -20 + i * 6;
          const pts = [[x, -24], [x - 18, -10 + i * 2], [x - 26, 14 + i * 3], [x - 34 + i, 40 + i * 4]];
          paint(c, ribbon(pts, (u) => 9 * (1 - u * 0.7) * (0.7 + 0.3 * sin(u * 16 + i)), 0, 8), i % 2 ? p.weed : shade(p.weed, -0.2), { line: shade(p.weed, -0.55), lw: 1 });
        }
        // seaweed beard
        for (let i = 0; i < 7; i++) {
          const x = -6 + i * 7;
          paint(c, ribbon([[x, 10], [x - 4, 26], [x + 2, 40 + (i % 3) * 6]], 7, 2, 5), i % 2 ? p.weed : p.weedL, { line: shade(p.weed, -0.5), lw: 1 });
        }
        const hd = blob([[-26, -10], [-14, -30], [16, -34], [38, -20], [44, 2], [34, 18], [6, 22], [-20, 12]]);
        paint(c, hd, rg(c, 6, -20, 3, 6, -6, 46, [0, p.skinL, 0.45, p.skin, 1, p.skinD]),
          { sh: rgba(p.skinD, 0.7), shw: 8, hi: rgba(p.skinL, 0.5), hiw: 2, rim: rgba(p.water, 0.6), line: p.line, lw: 2.2 });
        // heavy brow
        const brow = blob([[-4, -16], [20, -22], [44, -12], [40, -6], [18, -12], [0, -8]]);
        paint(c, brow, p.skinD, { line: p.line, lw: 1.4 });
        // eye sockets
        c.fillStyle = p.ragD;
        c.beginPath(); c.ellipse(28, -4, 7, 5, 0.1, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(10, -6, 6, 4.5, 0, 0, TAU); c.fill();
        // gill slits
        c.strokeStyle = rgba(p.skinD, 0.9); c.lineWidth = 1.6;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-14 + i * 5, 0); c.quadraticCurveTo(-12 + i * 5, 6, -15 + i * 5, 12); c.stroke(); }
        // shell crown
        const shells = [[-22, -24, -0.7, 18], [-8, -32, -0.35, 24], [8, -36, 0, 28], [24, -32, 0.35, 22], [36, -24, 0.7, 16]];
        shells.forEach(([x, y, a, l], i) => {
          c.save(); c.translate(x, y); c.rotate(a);
          const sp = new Path2D();
          if (i % 2) { sp.moveTo(-7, 0); sp.quadraticCurveTo(-6, -l * 0.7, 0, -l); sp.quadraticCurveTo(6, -l * 0.7, 7, 0); sp.closePath(); }
          else { sp.moveTo(-9, 0); sp.bezierCurveTo(-12, -l, 12, -l, 9, 0); sp.closePath(); }
          paint(c, sp, lg(c, -8, -l, 8, 0, [0, '#ffffff', 0.4, p.shell, 1, p.shellD]), { line: shade(p.shellD, -0.4), lw: 1.3 });
          c.strokeStyle = rgba(p.shellD, 0.8); c.lineWidth = 1;
          c.beginPath();
          if (i % 2) { for (let k = 1; k < 4; k++) { c.moveTo(-6 + k, -k * l / 4); c.lineTo(6 - k, -k * l / 4 - 2); } }
          else { for (let k = -2; k <= 2; k++) { c.moveTo(0, -2); c.lineTo(k * 4, -l * 0.7); } }
          c.stroke();
          c.restore();
        });
        // coral sprig + pearl
        c.strokeStyle = p.coral; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-26, -22); c.lineTo(-34, -40); c.moveTo(-30, -31); c.lineTo(-40, -34); c.moveTo(-33, -38); c.lineTo(-30, -48); c.stroke();
        paint(c, circle(8, -26, 5), rg(c, 6, -28, 1, 8, -26, 6, [0, '#ffffff', 1, p.pearl]), { line: shade(p.pearl, -0.5), lw: 1 });
      });
      blit(ctx, head);
      // live face: eyes, jaw
      const ec = ph >= 3 ? '#ff6a5a' : p.eye;
      const sq = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 28.5, -4, 3.6, ec, 0.9 + 0.1 * sin(t * 3), '#ffffff', 3 * sq);
      eye(ctx, 10.5, -6, 2.8, ec, 0.8, '#ffffff', 2.4 * sq);
      const jaw = 4 + P.atk * 10 + P.cast * 12 + abs(sin(t * 0.6)) * 2;
      ctx.fillStyle = '#081418';
      ctx.beginPath(); ctx.moveTo(14, 8); ctx.quadraticCurveTo(28, 6, 40, 6); ctx.quadraticCurveTo(30, 12 + jaw * 1.6, 14, 8); ctx.fill();
      ctx.fillStyle = p.shell;
      for (let i = 0; i < 5; i++) { const x = 17 + i * 5; ctx.beginPath(); ctx.moveTo(x - 1.8, 7); ctx.lineTo(x + 1.8, 7); ctx.lineTo(x, 11); ctx.fill(); }
      if (P.cast > 0) glow(ctx, 28, 14, 30, p.magic, P.cast * 0.6);
      ctx.restore();
      // front arm (live): reaching webbed hand
      const fs = [70, -206 + br * 2], fe = [92 + reach * 0.5, -140 - P.wind * 20], fh = [138 + reach, -128 + sin(t * 1.3) * 5 - P.wind * 30 + P.reach * 10];
      paint(ctx, circle(fs[0] + 2, fs[1] + 6, 30), rg(ctx, fs[0] - 6, fs[1] - 8, 4, fs[0], fs[1], 34, [0, p.skinL, 0.5, p.skin, 1, p.skinD]), { sh: rgba(p.skinD, 0.6), shw: 7, line: p.line, lw: 2.4 });
      limb(ctx, [fs, fe, fh], (u) => 52 - u * 26 + sin(u * PI * 2) * 4, 0, lg(ctx, 50, -220, 60, -140, [0, p.skinL, 0.4, p.skin, 1, p.skinD]),
        { sh: rgba(p.skinD, 0.6), shw: 9, hi: rgba(p.skinL, 0.5), hiw: 2, rim: rgba(p.water, 0.6), line: p.line, lw: 2.4 });
      // net bracelet + weed on forearm
      ctx.strokeStyle = rgba(p.net, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(fe[0] + 12, fe[1] + 8, 9, 15, -0.6, 0, TAU); ctx.stroke();
      paint(ctx, ribbon([[fe[0] + 6, fe[1] + 4], [fe[0] + 2, fe[1] + 30], [fe[0] + 10 + sin(t * 1.4) * 5, fe[1] + 54]], 9, 2, 5), p.weedL, { line: shade(p.weed, -0.5), lw: 1 });
      ctx.save();
      ctx.translate(fh[0], fh[1]);
      ctx.rotate(Math.atan2(fh[1] - fe[1], fh[0] - fe[0]) + 0.2);
      const curl = 0.25 + P.reach * 0.6 + 0.08 * sin(t * 1.6);
      // web between fingers
      const web = new Path2D();
      web.moveTo(4, -12);
      for (let f = 0; f < 4; f++) { const a = -0.7 + f * 0.45; web.lineTo(4 + cos(a + curl * 0.5) * 30, sin(a + curl * 0.5) * 30); web.lineTo(4 + cos(a + 0.22) * 18, sin(a + 0.22) * 18); }
      web.closePath();
      ctx.fillStyle = rgba(p.belly, 0.5); ctx.fill(web);
      paint(ctx, blob([[-10, -16], [14, -16], [22, 0], [14, 16], [-10, 14]]), p.skin, { sh: rgba(p.skinD, 0.5), shw: 4, line: p.line, lw: 2 });
      for (let f = 0; f < 4; f++) {
        const a = -0.7 + f * 0.45;
        const fp = [[10, a * 14], [10 + cos(a) * 18, a * 14 + sin(a) * 14], [10 + cos(a + curl) * 32, a * 14 + sin(a + curl) * 28]];
        limb(ctx, fp, 9, 5, p.skin, { line: p.line, lw: 1.5 });
        claw(ctx, fp[2][0], fp[2][1], a + curl + 0.4, 12, 4.5, p.shell, p.line);
      }
      ctx.restore();
      // dripping water
      drips(ctx, [[fh[0], fh[1] + 20], [fe[0], fe[1] + 26], [-100, -110], [-40, -96], [40, -100], [90, -190], [bh[0], bh[1] + 14]], t, p.water, 7, 90, 0.7);
      // drifting soul-motes rising off the water
      particles(8, t, 0.25, 77, (i, life, r) => glow(ctx, (r(1) - 0.5) * 260, -8 - life * 200, 5 + r(2) * 5, i % 3 ? p.lamp2 : p.lamp1, sin(life * PI) * 0.7));
      // front water: the giant stands waist-deep
      const wl = new Path2D();
      wl.moveTo(-150, -8);
      for (let x = -150; x <= 150; x += 10) wl.lineTo(x, -8 - sqrtSafe(1 - (x / 150) * (x / 150)) * 26 + sin(x * 0.07 + t * 2.2) * 2.5);
      wl.ellipse(0, -8, 150, 26, 0, 0, PI);
      wl.closePath();
      ctx.fillStyle = lg(ctx, 0, -40, 0, 20, [0, rgba(p.water, 0.35), 0.4, rgba(p.skinD, 0.75), 1, rgba(p.ragD, 0.9)]);
      ctx.fill(wl);
      ctx.strokeStyle = rgba('#e8ffff', 0.55); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = -140; x <= 140; x += 10) {
        const yy = -8 - sqrtSafe(1 - (x / 150) * (x / 150)) * 26 + sin(x * 0.07 + t * 2.2) * 2.5;
        if (x === -140) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      // foam ring at the waist
      for (let i = 0; i < 14; i++) {
        const a = PI * (i / 13);
        const fx = cos(a) * 96, fy = -30 + sin(a) * 8 + sin(t * 3 + i) * 1.5;
        ctx.fillStyle = rgba('#e8ffff', 0.12 + 0.12 * sin(t * 2 + i * 1.3));
        ctx.beginPath(); ctx.ellipse(fx, fy, 12 + U.hash(i, 1, 3) * 8, 2.5, 0, 0, TAU); ctx.fill();
      }
      ripples(ctx, 0, -6, 170, t * 0.7, p.water, 3, 0.3);
      if (ph >= 2) glow(ctx, 0, -170, 170, p.magic, 0.12 + 0.05 * sin(t * 2));
    },
  });

  // =============================================================================================
  // 魔神仔 mosina — small red-faced, long-limbed grinning forest trickster wrapped in leaves
  def('mosina', {
    w: 120, h: 150,
    pal: {
      face: '#d24a3a', faceD: '#7e1e1e', faceL: '#ff9a7a', limb: '#7a3a2a', limbD: '#3a1610', leaf: '#4f8a3a', leafD: '#1f4020',
      leafL: '#a4d06a', leaf2: '#8a7a32', eye: '#fff07a', teeth: '#f6eedc', line: '#2a0e0a', magic: '#b4f07a',
    },
    vars: [{ h: 40, s: 0.9, keep: ['eye', 'teeth'] }, { h: -60, s: 1.1, l: -0.05, keep: ['teeth', 'face', 'faceD', 'faceL'], set: { eye: '#9af0ff' } }],
    draw(ctx, t, o, p, P) {
      const hop = abs(sin(t * 2.6)) * 8 * (1 - P.hurt);
      const crouch = (1 - abs(sin(t * 2.6))) * 4;
      const lean = P.reach * 30 - P.wind * 10;
      // long spindly legs (grasshopper crouch)
      const hip = [lean * 0.6, -62 - hop + crouch];
      for (const [s, back] of [[-1, true], [1, false]]) {
        const col = back ? p.limbD : p.limb;
        const knee = [hip[0] + 22 * s + 6, hip[1] - 34 + hop * 0.6];
        const foot = [s * 20 + 4, -2];
        limb(ctx, [[hip[0] + s * 6, hip[1]], knee], 9, 7, col, { line: p.line, lw: 1.4 });
        limb(ctx, [knee, [U.lerp(knee[0], foot[0], 0.5) + 4 * s, U.lerp(knee[1], foot[1], 0.5)], foot], 7, 4, col, { line: p.line, lw: 1.4 });
        for (let k = 0; k < 3; k++) claw(ctx, foot[0] + 2, foot[1] - 1, -0.3 + k * 0.4, 10, 3, col, p.line);
      }
      // back arm
      const bsh = [hip[0] - 10, hip[1] - 30];
      limb(ctx, [bsh, [bsh[0] - 24, bsh[1] + 16], [bsh[0] - 16, bsh[1] + 44]], 7, 4, p.limbD, { line: p.line, lw: 1.3 });
      // leaf cloak body (cached)
      ctx.save();
      ctx.translate(hip[0], hip[1]);
      ctx.rotate(P.reach * 0.25 - P.hurt * 0.2);
      const body = part('mosina/body/' + (o.variant | 0), 120, 110, 60, 80, (c) => {
        const leafShape = (x, y, a, l, w, col) => {
          c.save(); c.translate(x, y); c.rotate(a);
          const lp = new Path2D();
          lp.moveTo(0, 0); lp.quadraticCurveTo(l * 0.5, -w, l, 0); lp.quadraticCurveTo(l * 0.5, w, 0, 0); lp.closePath();
          paint(c, lp, lg(c, 0, -w, 0, w, [0, shade(col, 0.3), 1, shade(col, -0.25)]), { line: shade(col, -0.55), lw: 1.1 });
          c.strokeStyle = rgba(shade(col, 0.5), 0.7); c.lineWidth = 0.9;
          c.beginPath(); c.moveTo(1, 0); c.lineTo(l * 0.9, 0); c.stroke();
          c.restore();
        };
        // layered leaf cape hanging from the neck, outer (long, dark) to inner (short, light)
        for (let row = 0; row < 4; row++) {
          const n = 9 - row;
          for (let i = 0; i < n; i++) {
            const u = n > 1 ? i / (n - 1) : 0.5;
            const a = PI * 0.5 + (u - 0.5) * (1.9 - row * 0.3) + (U.hash(i, row, 5) - 0.5) * 0.18;
            const L = 46 - row * 7 + U.hash(i, row + 3, 5) * 6;
            const col = U.hash(i, row + 9, 5) > 0.75 ? p.leaf2 : row === 0 ? p.leafD : row === 1 ? shade(p.leaf, -0.15) : row === 2 ? p.leaf : p.leafL;
            leafShape(-2 + (u - 0.5) * 8, -46 + row * 3, a, L, 8.5 - row * 0.6, col);
          }
        }
        // collar leaves
        for (let i = 0; i < 7; i++) leafShape(-16 + i * 5, -44, PI * 0.5 + (i - 3) * 0.35, 20, 6, i % 2 ? p.leafL : p.leaf);
      });
      blit(ctx, body);
      ctx.restore();
      // head (live: tilt + grin)
      const tilt = sin(t * 1.7) * 0.18 + P.reach * 0.25 - P.hurt * 0.3;
      ctx.save();
      ctx.translate(hip[0] + 6, hip[1] - 50);
      ctx.rotate(tilt);
      // ears
      paint(ctx, poly([[-14, -6], [-34, -18], [-12, -16]]), p.faceD, { line: p.line, lw: 1.2 });
      paint(ctx, poly([[16, -10], [30, -28], [24, -8]]), p.face, { line: p.line, lw: 1.2 });
      // twig & leaf hair
      ctx.strokeStyle = p.limbD; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -22); ctx.lineTo(-14, -40); ctx.lineTo(-20, -44); ctx.moveTo(-12, -36); ctx.lineTo(-6, -46); ctx.moveTo(6, -24); ctx.lineTo(10, -40); ctx.stroke();
      for (const [x, y, a, col] of [[-20, -44, -2.4, p.leafL], [-6, -46, -1.4, p.leaf], [10, -40, -0.9, p.leafL], [-2, -26, -2.0, p.leaf2]]) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(a + sin(t * 2 + x) * 0.15);
        paint(ctx, blob([[0, 0], [7, -5], [16, 0], [7, 5]]), col, { line: shade(col, -0.5), lw: 1 });
        ctx.restore();
      }
      const hd = blob([[-16, -6], [-10, -22], [8, -26], [22, -16], [24, 2], [14, 14], [-4, 14], [-16, 6]]);
      paint(ctx, hd, rg(ctx, 2, -16, 2, 2, -4, 28, [0, p.faceL, 0.45, p.face, 1, p.faceD]), { sh: rgba(p.faceD, 0.7), shw: 5, hi: rgba(p.faceL, 0.6), hiw: 1.4, line: p.line, lw: 1.8 });
      // wrinkles
      ctx.strokeStyle = rgba(p.faceD, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-4, -18); ctx.quadraticCurveTo(6, -21, 14, -18); ctx.moveTo(-2, -14); ctx.quadraticCurveTo(6, -16, 12, -14); ctx.stroke();
      // glinting eyes (mischievous slants)
      const blink = (t % 3.7) > 3.58 ? 0.15 : 1;
      for (const [ex, ey, r] of [[4, -8, 4.5], [17, -9, 3.6]]) {
        ctx.fillStyle = '#1a0606';
        ctx.beginPath(); ctx.ellipse(ex, ey, r, r * 0.8 * blink, -0.25, 0, TAU); ctx.fill();
        eye(ctx, ex + 0.8, ey, r * 0.55, p.eye, 0.95, '#ffffff', r * 0.5 * blink);
      }
      // huge grin
      const gw = 1 + P.atk * 0.25 + P.cast * 0.2;
      const grin = new Path2D();
      grin.moveTo(-10, 0);
      grin.quadraticCurveTo(6, 6, 24 * gw, -2);
      grin.quadraticCurveTo(8, 16 + P.atk * 6, -10, 0);
      ctx.fillStyle = '#2a0608'; ctx.fill(grin);
      ctx.save(); ctx.clip(grin);
      ctx.fillStyle = p.teeth;
      for (let i = 0; i < 8; i++) { const x = -7 + i * 4; ctx.fillRect(x, 0 + sin(i / 7 * PI) * 3, 3, 3.4); }
      ctx.fillStyle = '#c0384a'; ctx.beginPath(); ctx.ellipse(6, 11 + P.atk * 4, 6, 3, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = p.line; ctx.lineWidth = 1.4; ctx.stroke(grin);
      ctx.restore();
      // front arm: long beckoning fingers
      const sh = [hip[0] + 10, hip[1] - 34];
      const el = [sh[0] + 26 + P.reach * 16, sh[1] - 4 + sin(t * 1.4) * 4 - P.wind * 12];
      const hd2 = [el[0] + 22 + P.reach * 22, el[1] - 18 + P.reach * 16];
      limb(ctx, [sh, el, hd2], 8, 5, p.limb, { hi: rgba(p.faceL, 0.4), hiw: 1, line: p.line, lw: 1.3 });
      const beck = 0.6 + 0.6 * (0.5 + 0.5 * sin(t * 4.5)) * (1 - P.reach);
      ctx.save(); ctx.translate(hd2[0], hd2[1]); ctx.rotate(-0.5 + P.reach * 0.5);
      for (let f = 0; f < 4; f++) {
        const a = -0.5 + f * 0.3;
        const c1 = f === 1 ? beck : 0.4;
        limb(ctx, [[0, 0], [cos(a) * 9, sin(a) * 9], [cos(a) * 9 + cos(a + c1) * 9, sin(a) * 9 + sin(a + c1) * 9], [cos(a) * 9 + cos(a + c1) * 9 + cos(a + c1 * 2.2) * 7, sin(a) * 9 + sin(a + c1) * 9 + sin(a + c1 * 2.2) * 7]],
          3.6, 1.4, p.limb, { line: p.line, lw: 1 });
      }
      ctx.restore();
      // swirling leaves
      const swirl = 0.35 + P.cast * 0.65;
      for (let i = 0; i < 6; i++) {
        const a = t * (1.2 + P.cast * 2) + i * TAU / 6;
        const x = hip[0] + cos(a) * 56, y = -70 + sin(a) * 18 + sin(t * 2 + i) * 8;
        ctx.save(); ctx.globalAlpha *= (sin(a) > 0 ? 1 : 0.5) * swirl; ctx.translate(x, y); ctx.rotate(a * 2);
        paint(ctx, blob([[0, 0], [5, -3.5], [11, 0], [5, 3.5]]), i % 2 ? p.leafL : p.leaf2, { line: shade(p.leafD, -0.2), lw: 0.8 });
        ctx.restore();
      }
      if (P.cast > 0) glow(ctx, hip[0] + 30, -100, 50, p.magic, P.cast * 0.4);
    },
  });

  // =============================================================================================
  // 蕈精 mushroom_imp — glowing, colour-cycling psychedelic mushroom creature
  def('mushroom_imp', {
    w: 120, h: 150,
    pal: { stem: '#efe2c8', stemD: '#a8906e', stemL: '#fffaf0', gill: '#f6c6e6', eye: '#1a1030', line: '#3a2440', magic: '#ff8ae8', base: '#ff3fa8' },
    vars: [{ set: { base: '#3fe0ff', magic: '#7affd8' } }, { set: { base: '#ffd23f', magic: '#ffb04a', stem: '#d8c8f0', stemD: '#7a64a0', stemL: '#f4ecff' } }],
    draw(ctx, t, o, p, P) {
      // psychedelic cycling hue
      const [br, bg, bb] = U.hex2rgb(p.base);
      const baseHue = rgb2hsl(br, bg, bb)[0];
      const hue = baseHue + t * 45 + P.cast * 120;
      const c1 = hsl2hex(hue, 0.95, 0.6), c2 = hsl2hex(hue + 70, 0.9, 0.55), c3 = hsl2hex(hue - 60, 0.85, 0.32), c4 = hsl2hex(hue + 160, 1, 0.75);
      const sq = 1 + sin(t * 2.4) * 0.04 - P.wind * 0.08 + P.reach * 0.05;
      const bounce = abs(sin(t * 2.4)) * 4;
      // baby mushrooms at feet
      for (const [x, s, k] of [[-46, 0.5, 0], [-30, 0.35, 1], [44, 0.42, 2]]) {
        const ch = hsl2hex(hue + k * 90, 0.9, 0.62);
        ctx.fillStyle = p.stem; ctx.fillRect(x - 3 * s, -22 * s, 6 * s, 22 * s);
        paint(ctx, (() => { const pp = new Path2D(); pp.moveTo(x - 16 * s, -20 * s); pp.quadraticCurveTo(x, -46 * s, x + 16 * s, -20 * s); pp.closePath(); return pp; })(), ch, { line: rgba(p.line, 0.7), lw: 1 });
        glow(ctx, x, -26 * s, 22 * s, ch, 0.5);
      }
      ctx.save();
      ctx.translate(0, -bounce);
      ctx.scale(1 / sq, sq);
      // stubby feet
      for (const x of [-14, 12]) paint(ctx, ell(x, -5, 11, 6), p.stemD, { line: p.line, lw: 1.4 });
      // stem-body (cached)
      const stem = part('mushroom_imp/stem/' + (o.variant | 0), 90, 110, 45, 100, (c) => {
        const sb = blob([[-24, -86], [20, -88], [28, -50], [26, -14], [10, -4], [-14, -4], [-28, -16], [-30, -54]]);
        paint(c, sb, rg(c, -6, -60, 4, 0, -46, 50, [0, p.stemL, 0.5, p.stem, 1, p.stemD]), { sh: rgba(p.stemD, 0.6), shw: 8, hi: rgba('#ffffff', 0.6), hiw: 2, line: p.line, lw: 2 });
        // fibrous stripes
        c.save(); c.clip(sb);
        c.strokeStyle = rgba(p.stemD, 0.35); c.lineWidth = 1;
        for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(-26 + i * 6.5, -90); c.quadraticCurveTo(-22 + i * 6, -50, -24 + i * 6.2, 0); c.stroke(); }
        c.restore();
        // skirt ring (annulus)
        const ring = new Path2D();
        ring.moveTo(-28, -70); ring.quadraticCurveTo(0, -62, 26, -72);
        for (let i = 0; i <= 8; i++) ring.lineTo(26 - i * 6.75, -60 + (i % 2) * 5);
        ring.closePath();
        paint(c, ring, p.stemL, { line: p.line, lw: 1.3 });
      });
      blit(ctx, stem);
      // face
      const blink = (t % 3.1) > 3.0 ? 0.12 : 1;
      const hurt = P.hurt > 0.2;
      for (const [x, r] of [[2, 7.5], [20, 6.5]]) {
        ctx.fillStyle = p.eye;
        ctx.beginPath(); ctx.ellipse(x, -40, r, r * 1.15 * (hurt ? 0.25 : blink), 0, 0, TAU); ctx.fill();
        if (!hurt && blink > 0.5) {
          ctx.fillStyle = c4; ctx.beginPath(); ctx.arc(x + 1.5, -38, r * 0.45, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x - 1.5, -43, r * 0.3, 0, TAU); ctx.arc(x + 2.5, -36, r * 0.14, 0, TAU); ctx.fill();
        }
      }
      ctx.fillStyle = rgba(c1, 0.5); ctx.beginPath(); ctx.ellipse(-8, -30, 5, 3, 0, 0, TAU); ctx.ellipse(28, -31, 4, 2.6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = p.eye;
      ctx.beginPath(); ctx.ellipse(12, -26, 3.5 + P.atk * 2, 2 + P.atk * 4 + P.cast * 3, 0, 0, PI); ctx.fill();
      // little arms
      const wv = sin(t * 3.2) * 0.4;
      limb(ctx, [[-24, -50], [-38, -40 + wv * 10], [-42, -26 + wv * 14]], 8, 6, p.stem, { line: p.line, lw: 1.3 });
      limb(ctx, [[24, -52], [38 + P.reach * 10, -46 - P.cast * 16], [46 + P.reach * 16, -56 - wv * 10 - P.cast * 20]], 8, 6, p.stemL, { line: p.line, lw: 1.3 });
      // cap (live: colour-cycling)
      ctx.save();
      ctx.translate(0, -78);
      ctx.rotate(sin(t * 1.6) * 0.06 + P.reach * 0.15 - P.hurt * 0.2);
      // glowing gills underside
      const gills = ell(0, 0, 54, 12);
      ctx.fillStyle = lg(ctx, 0, -6, 0, 12, [0, p.gill, 1, c3]); ctx.fill(gills);
      ctx.strokeStyle = rgba(c3, 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); for (let i = -9; i <= 9; i++) { ctx.moveTo(0, 2); ctx.lineTo(i * 5.8, 10 - abs(i) * 0.4); } ctx.stroke();
      glow(ctx, 0, 8, 50, c1, 0.4);
      const cap = new Path2D();
      cap.moveTo(-60, 2);
      cap.bezierCurveTo(-66, -40, -36, -66, 0, -68);
      cap.bezierCurveTo(38, -66, 66, -40, 60, 2);
      cap.bezierCurveTo(40, 10, -40, 10, -60, 2);
      cap.closePath();
      ctx.fillStyle = rg(ctx, -16, -48, 4, 0, -24, 76, [0, c4, 0.35, c1, 0.75, c2, 1, c3]);
      ctx.fill(cap);
      ctx.save(); ctx.clip(cap);
      // breathing concentric bands
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const k = ((t * 0.5 + i / 5) % 1);
        ctx.strokeStyle = rgba(hsl2hex(hue + i * 72, 1, 0.6), 0.35 * (1 - k));
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(0, -10, 10 + k * 70, 6 + k * 48, 0, PI, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      edge(ctx, cap, rgba(c3, 0.6), -5, -5, 12);
      edge(ctx, cap, 'rgba(255,255,255,0.55)', 2.5, 2.5, 4);
      ctx.restore();
      ctx.strokeStyle = rgba(c3, 1); ctx.lineWidth = 2.2; ctx.stroke(cap);
      // glowing spots
      for (const [x, y, r, k] of [[-30, -34, 9, 0], [-4, -52, 7, 1], [22, -40, 10, 2], [44, -18, 6, 3], [-48, -12, 5, 4], [6, -22, 5, 5]]) {
        const sc = hsl2hex(hue + 180 + k * 30, 1, 0.82);
        glow(ctx, x, y, r * 2.8, sc, 0.5 + 0.3 * sin(t * 3 + k));
        ctx.fillStyle = sc; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.25, r * 0.35, r * 0.25, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
      ctx.restore();
      // spores
      particles(12, t, 0.35 + P.cast * 0.5, 61, (i, life, r) => {
        const x = (r(1) - 0.5) * 120 + sin(life * 5 + i) * 10, y = -90 - life * 70 + r(2) * 30;
        glow(ctx, x, y, 4 + r(3) * 4, hsl2hex(hue + i * 30, 1, 0.7), sin(life * PI) * 0.9);
      });
    },
  });

  // =============================================================================================
  // 竹精 bamboo_spirit — a tall figure of bundled bamboo culms with a carved face and leaf crown
  def('bamboo_spirit', {
    w: 120, h: 200,
    pal: {
      cane: '#8cc04a', caneD: '#3e6a24', caneL: '#d8f09a', node: '#5a8a2e', leaf: '#5aa63e', leafD: '#22501c', leafL: '#b0e07a',
      rope: '#c8a464', eye: '#d6ff8a', hollow: '#1a2a10', line: '#1e3812', magic: '#c8ff8a',
    },
    vars: [{ h: -50, s: 0.8, l: 0.02, keep: ['rope'], set: { eye: '#ffe08a' } }, { h: 150, s: 0.7, l: -0.05, keep: ['rope'], set: { eye: '#ff8ae0' } }],
    draw(ctx, t, o, p, P) {
      const sway = sin(t * 1.2) * 0.04 + P.reach * 0.12 - P.hurt * 0.15;
      const cane = (c, x0, y0, x1, y1, w, nodes) => {
        const pth = ribbon([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1]], w, w * 0.9, 4);
        paint(c, pth, lg(c, x0 - w / 2, 0, x0 + w / 2, 0, [0, p.caneL, 0.35, p.cane, 1, p.caneD]), { line: p.line, lw: 1.5 });
        for (let i = 1; i <= nodes; i++) {
          const u = i / (nodes + 1);
          const x = U.lerp(x0, x1, u), y = U.lerp(y0, y1, u);
          c.strokeStyle = p.node; c.lineWidth = 2.4;
          c.beginPath(); c.moveTo(x - w * 0.52, y); c.quadraticCurveTo(x, y + 2.5, x + w * 0.52, y); c.stroke();
          c.strokeStyle = rgba(p.caneL, 0.7); c.lineWidth = 1;
          c.beginPath(); c.moveTo(x - w * 0.45, y - 2); c.quadraticCurveTo(x, y + 0.5, x + w * 0.45, y - 2); c.stroke();
        }
      };
      // roots / legs
      ctx.save();
      const legs = part('bamboo_spirit/legs/' + (o.variant | 0), 100, 80, 50, 76, (c) => {
        cane(c, -14, -2, -10, -70, 13, 2);
        cane(c, 14, -2, 10, -70, 14, 2);
        // root tendrils
        c.strokeStyle = p.caneD; c.lineWidth = 2.5;
        c.beginPath();
        for (const [x, d] of [[-14, -1], [14, 1]]) { c.moveTo(x, -2); c.quadraticCurveTo(x + d * 10, 0, x + d * 24, 2); c.moveTo(x, -2); c.quadraticCurveTo(x - d * 6, 2, x - d * 16, 3); }
        c.stroke();
        // shoots
        for (const x of [-34, 30]) {
          const sp = poly([[x - 5, 0], [x, -20], [x + 5, 0]]);
          paint(c, sp, lg(c, x, -20, x, 0, [0, p.caneL, 1, p.caneD]), { line: p.line, lw: 1 });
        }
      });
      blit(ctx, legs);
      ctx.translate(0, -66);
      ctx.rotate(sway);
      // back arm (branch)
      const armSw = sin(t * 1.6) * 6;
      ctx.strokeStyle = p.caneD; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(-14, -78); ctx.quadraticCurveTo(-40, -60 + armSw, -46, -24 + armSw); ctx.stroke();
      ctx.strokeStyle = p.node; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-14, -79); ctx.quadraticCurveTo(-40, -61 + armSw, -46, -25 + armSw); ctx.stroke();
      leafFan(ctx, -46, -24 + armSw, 1.7, p, t, 0.85, 5);
      // torso: bundle of three culms tied with rope (cached)
      const torso = part('bamboo_spirit/torso/' + (o.variant | 0), 80, 120, 40, 110, (c) => {
        cane(c, -12, 0, -14, -96, 16, 3);
        cane(c, 12, 0, 14, -100, 16, 3);
        cane(c, 0, 4, 0, -104, 18, 3);
        for (const y of [-28, -72]) {
          c.strokeStyle = shade(p.rope, -0.3); c.lineWidth = 5;
          c.beginPath(); c.moveTo(-24, y); c.quadraticCurveTo(0, y + 6, 24, y); c.stroke();
          c.strokeStyle = p.rope; c.lineWidth = 2.5;
          c.beginPath(); c.moveTo(-24, y - 1); c.quadraticCurveTo(0, y + 5, 24, y - 1); c.stroke();
          c.strokeStyle = rgba(shade(p.rope, -0.5), 0.8); c.lineWidth = 1;
          for (let i = -4; i <= 4; i++) { c.beginPath(); c.moveTo(i * 5, y + 1); c.lineTo(i * 5 + 3, y + 5); c.stroke(); }
        }
        // hanging knot tails
        c.strokeStyle = p.rope; c.lineWidth = 2;
        c.beginPath(); c.moveTo(18, -26); c.quadraticCurveTo(22, -16, 18, -8); c.moveTo(20, -26); c.quadraticCurveTo(26, -18, 25, -10); c.stroke();
      });
      blit(ctx, torso);
      // head: diagonally cut culm with carved face
      ctx.save();
      ctx.translate(2, -104);
      ctx.rotate(sin(t * 0.9) * 0.05 + P.reach * 0.1);
      const head = part('bamboo_spirit/head/' + (o.variant | 0), 80, 100, 40, 60, (c) => {
        const hp = new Path2D();
        hp.moveTo(-17, 0); hp.lineTo(-17, -34); hp.lineTo(19, -50); hp.lineTo(19, 0); hp.closePath();
        paint(c, hp, lg(c, -17, 0, 19, 0, [0, p.caneL, 0.35, p.cane, 1, p.caneD]), { sh: rgba(p.caneD, 0.5), shw: 5, line: p.line, lw: 1.8 });
        // cut face (hollow ellipse top)
        const top = ell(1, -42, 18.5, 6, -0.42);
        paint(c, top, lg(c, -10, -46, 14, -38, [0, '#f4f0c8', 1, '#c8c088']), { line: p.line, lw: 1.4 });
        c.fillStyle = p.hollow; c.beginPath(); c.ellipse(1, -42, 13, 3.6, -0.42, 0, TAU); c.fill();
        c.strokeStyle = p.node; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(-17, -4); c.quadraticCurveTo(1, -1, 19, -4); c.stroke();
        // carved hollows for eyes/mouth
        c.fillStyle = p.hollow;
        c.beginPath(); c.ellipse(-2, -20, 4, 5.5, 0, 0, TAU); c.ellipse(12, -22, 3.4, 5, 0, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(0, -9); c.quadraticCurveTo(7, -4, 14, -10); c.quadraticCurveTo(7, -7, 0, -9); c.fill();
        // leaf sprays behind & on the head
        const lf = (x, y, a, l, col) => {
          c.save(); c.translate(x, y); c.rotate(a);
          const lp = new Path2D(); lp.moveTo(0, 0); lp.quadraticCurveTo(l * 0.45, -l * 0.16, l, 0); lp.quadraticCurveTo(l * 0.45, l * 0.16, 0, 0);
          paint(c, lp, lg(c, 0, -5, 0, 5, [0, shade(col, 0.3), 1, shade(col, -0.2)]), { line: shade(col, -0.6), lw: 1 });
          c.strokeStyle = rgba(shade(col, 0.5), 0.7); c.lineWidth = 0.8; c.beginPath(); c.moveTo(1, 0); c.lineTo(l * 0.85, 0); c.stroke();
          c.restore();
        };
        c.strokeStyle = p.caneD; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-14, -32); c.quadraticCurveTo(-24, -48, -20, -60); c.moveTo(16, -48); c.quadraticCurveTo(22, -60, 32, -64); c.stroke();
        lf(-20, -60, -2.0, 30, p.leaf); lf(-20, -60, -1.4, 26, p.leafL); lf(-20, -58, -2.7, 24, p.leafD);
        lf(32, -64, -0.6, 28, p.leaf); lf(32, -64, -1.2, 24, p.leafL); lf(32, -63, 0.0, 22, p.leafD);
      });
      blit(ctx, head);
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, -1.5, -20, 3, p.eye, 0.9 + 0.1 * sin(t * 4), '#ffffff', 3 * ef);
      eye(ctx, 12.5, -22, 2.7, p.eye, 0.85, '#ffffff', 2.8 * ef);
      if (P.atk > 0 || P.cast > 0) glow(ctx, 7, -8, 14, p.eye, max(P.atk, P.cast) * 0.8);
      ctx.restore();
      // front arm (live branch whip)
      const ang = 0.35 + sin(t * 1.4) * 0.12 - P.reach * 0.5 - P.wind * 0.9;
      const ax = 18, ay = -80;
      const ex = ax + 22 + P.reach * 14, ey = ay + 26 - P.reach * 10;
      const hx = ex + cos(ang) * 34, hy = ey + sin(ang) * 34;
      ctx.strokeStyle = p.cane; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ex, ey, hx, hy); ctx.stroke();
      ctx.strokeStyle = rgba(p.caneL, 0.8); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.quadraticCurveTo(ex, ey - 2, hx, hy - 2); ctx.stroke();
      ctx.strokeStyle = p.node; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex - 4, ey - 6, 3.5, 0, TAU); ctx.stroke();
      leafFan(ctx, hx, hy, ang, p, t, 1, 6);
      ctx.restore();
      // drifting bamboo leaves
      particles(5, t, 0.25 + P.cast * 0.4, 81, (i, life, r) => {
        const x = (r(1) - 0.3) * 120 + life * 40, y = -200 + life * 190;
        ctx.save(); ctx.globalAlpha *= sin(life * PI) * 0.9; ctx.translate(x + sin(life * 9 + i) * 10, y); ctx.rotate(life * 8 + i);
        ctx.fillStyle = i % 2 ? p.leafL : p.leaf;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, -2.5, 13, 0); ctx.quadraticCurveTo(6, 2.5, 0, 0); ctx.fill();
        ctx.restore();
      });
      if (P.cast > 0) glow(ctx, 0, -150, 60, p.magic, P.cast * 0.4);
    },
  });
  function leafFan(ctx, x, y, ang, p, t, s, n) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.32 + sin(t * 2.4 + i) * 0.06;
      const l = 26 - abs(i - (n - 1) / 2) * 3;
      const col = i % 2 ? p.leafL : p.leaf;
      ctx.save(); ctx.rotate(a);
      const lp = new Path2D(); lp.moveTo(0, 0); lp.quadraticCurveTo(l * 0.45, -l * 0.17, l, 0); lp.quadraticCurveTo(l * 0.45, l * 0.17, 0, 0);
      ctx.fillStyle = col; ctx.fill(lp);
      ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = 1; ctx.stroke(lp);
      ctx.strokeStyle = rgba(shade(col, 0.5), 0.6); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(l * 0.85, 0); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // thick tube along a spline drawn with round-capped strokes (snakes, tails); layers within one chunk
  // cols: { line, base(u)->col | col, hi, stripe?, stripeOff? }
  function tube(ctx, pts, w0, w1, cols, seg = 6) {
    const s = spline(pts, seg);
    const n = s.length - 1;
    const wAt = (i) => U.lerp(w0, w1, i / n);
    ctx.lineCap = 'round';
    const pass = (col, wf, dx, dy) => {
      for (let i = 0; i < n; i++) {
        ctx.strokeStyle = typeof col === 'function' ? col(i / n) : col;
        ctx.lineWidth = max(0.5, wf(wAt(i)));
        ctx.beginPath(); ctx.moveTo(s[i][0] + dx, s[i][1] + dy); ctx.lineTo(s[i + 1][0] + dx, s[i + 1][1] + dy); ctx.stroke();
      }
    };
    pass(cols.line, (w) => w + 3, 0, 0);
    pass(cols.base, (w) => w, 0, 0);
    if (cols.dark) pass(cols.dark, (w) => w * 0.45, 0, 0.28 * (w0 + w1) / 2);
    if (cols.stripe) pass(cols.stripe, (w) => max(1, w * 0.14), 0, 0.22 * (w0 + w1) / 2);
    if (cols.hi) pass(cols.hi, (w) => w * 0.3, -0.5, -0.24 * (w0 + w1) / 2);
    return s;
  }

  // =============================================================================================
  // 青竹絲 bamboo_viper — coiled bright-green pit viper with a red tail tip
  def('bamboo_viper', {
    w: 170, h: 125,
    pal: {
      body: '#5fd23a', bodyD: '#1f7a2a', bodyL: '#d8ff9a', belly: '#e8f8a0', stripe: '#ffffff', tail: '#e8402e',
      eye: '#ffd23a', tongue: '#e0344a', line: '#0e3a14', magic: '#a8ff6a',
    },
    vars: [{ h: -60, s: 1.1, keep: ['tail', 'tongue', 'stripe'], set: { eye: '#ff6a3a' } }, { h: 150, s: 0.9, l: -0.05, keep: ['tongue', 'stripe'], set: { tail: '#ffd23a' } }],
    draw(ctx, t, o, p, P) {
      const sw = sin(t * 1.6);
      const strike = P.reach, coilK = P.wind;
      // coil (back half then front half), slow breathing
      const br = 1 + sin(t * 2) * 0.02;
      const coilPts = [];
      for (let i = 0; i <= 16; i++) {
        const a = PI * 0.9 + (i / 16) * TAU * 1.15;
        const R = (54 - i * 1.4) * br;
        coilPts.push([cos(a) * R - 8, -16 + sin(a) * R * 0.34 - i * 1.6]);
      }
      const tailPts = [[-82 + sin(t * 3) * 3, -6 - abs(sin(t * 3)) * 4], [-74, -12], coilPts[0]];
      const red = (u) => (u < 0.5 ? p.tail : U.mix(p.tail, p.body, min(1, (u - 0.5) * 3)));
      tube(ctx, tailPts.concat(coilPts.slice(1, 8)), 4, 18, { line: p.line, base: (u) => (u < 0.3 ? red(u / 0.3) : p.body), dark: rgba(p.bodyD, 0.6), stripe: rgba(p.stripe, 0.6), hi: rgba(p.bodyL, 0.55) });
      tube(ctx, coilPts.slice(7), 18, 20, { line: p.line, base: p.body, dark: rgba(p.bodyD, 0.6), stripe: rgba(p.stripe, 0.7), hi: rgba(p.bodyL, 0.6) });
      // neck rising in an S, head
      const last = coilPts[coilPts.length - 1];
      const hx = 44 + sw * 6 + strike * 60 - coilK * 16, hy = -96 + sin(t * 2.3) * 4 + strike * 44 + coilK * 6 + P.hurt * 10;
      const neck = [last, [last[0] + 18, last[1] - 10], [20 + sw * 4 - coilK * 8 + strike * 30, -64 + strike * 20], [hx - 26, hy + 18 + strike * 4], [hx - 8, hy + 4]];
      tube(ctx, neck, 20, 15, { line: p.line, base: p.body, dark: rgba(p.bodyD, 0.55), stripe: rgba(p.stripe, 0.7), hi: rgba(p.bodyL, 0.6) });
      // head
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(-0.1 + sw * 0.06 + strike * 0.35 - P.hurt * 0.3);
      const open = strike * 0.8 + P.cast * 0.3;
      // lower jaw
      ctx.save(); ctx.rotate(open * 0.6);
      paint(ctx, blob([[-12, 2], [10, 4], [30, 6], [10, 10], [-10, 8]]), p.belly, { line: p.line, lw: 1.4 });
      ctx.restore();
      if (open > 0.05) {
        ctx.fillStyle = '#ff9aa8';
        ctx.beginPath(); ctx.moveTo(-8, 3); ctx.lineTo(30, 3); ctx.lineTo(28, 3 + open * 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(22, 2); ctx.lineTo(25, 2); ctx.lineTo(24, 2 + 10 * open); ctx.fill();
        ctx.beginPath(); ctx.moveTo(14, 2); ctx.lineTo(17, 2); ctx.lineTo(16, 2 + 8 * open); ctx.fill();
      }
      const hd = new Path2D();
      hd.moveTo(-14, 4); hd.bezierCurveTo(-16, -10, -4, -16, 8, -14);
      hd.bezierCurveTo(22, -12, 32, -6, 34, 1); hd.bezierCurveTo(24, 5, 4, 6, -14, 4); hd.closePath();
      paint(ctx, hd, lg(ctx, 0, -16, 0, 6, [0, p.bodyL, 0.4, p.body, 1, p.bodyD]), { sh: rgba(p.bodyD, 0.5), shw: 4, hi: rgba('#ffffff', 0.5), hiw: 1.2, line: p.line, lw: 1.6 });
      // scale ridges
      ctx.strokeStyle = rgba(p.bodyD, 0.5); ctx.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-8 + i * 6, -8 + i * 0.6, 2.5, PI * 1.1, PI * 1.9); ctx.stroke(); }
      // eye: yellow with vertical slit, brow scale
      eye(ctx, 15, -6, 3.6, p.eye, 0.9, p.eye);
      ctx.fillStyle = '#101';
      ctx.beginPath(); ctx.ellipse(15.5, -6, 0.9, P.hurt > 0.2 ? 0.6 : 3.1, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = p.line; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(10, -10); ctx.quadraticCurveTo(15, -12.5, 21, -9.5); ctx.stroke();
      ctx.fillStyle = p.line; ctx.beginPath(); ctx.arc(25, -2, 1.1, 0, TAU); ctx.arc(31, -1, 0.9, 0, TAU); ctx.fill();
      // flicking tongue
      const fk = (t * 1.3) % 1;
      const tl = (fk < 0.3 ? sin((fk / 0.3) * PI) : 0) * 16 + strike * 10;
      if (tl > 1) {
        ctx.strokeStyle = p.tongue; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(32, 2); ctx.lineTo(32 + tl, 3 + sin(t * 40) * 1.5);
        ctx.lineTo(36 + tl, 0); ctx.moveTo(32 + tl, 3 + sin(t * 40) * 1.5); ctx.lineTo(36 + tl, 6); ctx.stroke();
      }
      ctx.restore();
      if (P.cast > 0) glow(ctx, hx, hy, 40, p.magic, P.cast * 0.5);
    },
  });

  // =============================================================================================
  // 山豬精 boar_demon — bristly mountain boar spirit with ember mane and curved tusks
  def('boar_demon', {
    w: 210, h: 165,
    pal: {
      fur: '#5a4234', furD: '#24160e', furL: '#9a7a5e', mane: '#2e1c14', snout: '#c89482', snoutD: '#7a4a40', tusk: '#f4ead2',
      hoof: '#2a2020', eye: '#ff5a2a', ember: '#ff8a3a', line: '#1a0c06', magic: '#ff9a4a',
    },
    vars: [{ h: 0, s: 0.4, l: 0.08, keep: ['tusk', 'eye', 'ember'], set: { ember: '#8ae0ff', eye: '#8ae0ff', magic: '#8ae0ff' } }, { h: -20, s: 1.6, l: -0.04, keep: ['tusk'], set: { eye: '#ffe23a', ember: '#ffd23a' } }],
    draw(ctx, t, o, p, P, v) {
      const br = sin(t * 2.2) * 1.5;
      const charge = P.reach;
      const scrape = (t % 2.4) < 0.8 ? sin(((t % 2.4) / 0.8) * TAU) : 0;
      ctx.rotate(-charge * 0.06);
      // legs: back pair (far side) darker
      const leg = (x, back, k) => {
        const col = back ? p.furD : p.fur;
        const lift = k;
        const top = [x, -56], knee = [x + 6 + lift * 6, -30 - lift * 8], foot = [x + 2 + lift * 14, -6 - lift * 6];
        paint(ctx, ell(x - 2, -66, 22, 28, 0.15), lg(ctx, x, -94, x, -40, [0, back ? p.furD : p.furL, 0.5, col, 1, p.furD]), { line: p.line, lw: 1.6 });
        limb(ctx, [top, knee, foot], 18, 9, col, { line: p.line, lw: 1.6, sh: back ? null : rgba(p.furD, 0.5), shw: 4 });
        paint(ctx, poly([[foot[0] - 7, foot[1] - 2], [foot[0] + 7, foot[1] - 2], [foot[0] + 9, foot[1] + 6], [foot[0] + 1, foot[1] + 4], [foot[0] - 7, foot[1] + 6]]), p.hoof, { line: p.line, lw: 1.2 });
      };
      leg(-56, true, 0); leg(40, true, charge * 0.6);
      // body (cached)
      ctx.save(); ctx.translate(0, br);
      const body = part('boar_demon/body/' + v, 220, 150, 110, 140, (c) => {
        const b = new Path2D();
        b.moveTo(-92, -70);
        b.bezierCurveTo(-100, -104, -60, -118, -10, -122);
        b.bezierCurveTo(30, -130, 66, -122, 78, -96);
        b.bezierCurveTo(90, -70, 70, -44, 40, -40);
        b.bezierCurveTo(0, -34, -50, -36, -76, -44);
        b.bezierCurveTo(-90, -50, -94, -60, -92, -70);
        b.closePath();
        paint(c, b, rg(c, -20, -110, 6, 0, -80, 110, [0, p.furL, 0.4, p.fur, 1, p.furD]),
          { sh: rgba(p.furD, 0.7), shw: 12, hi: rgba(p.furL, 0.55), hiw: 2.2, rim: rgba(p.ember, 0.45), rimw: 2, line: p.line, lw: 2.2 });
        hatch(c, b, 260, 11, [-100, -130, 190, 96], rgba(p.furD, 0.55), 1.1, 9, 2.0, 0.6);
        hatch(c, b, 120, 12, [-90, -128, 160, 40], rgba(p.furL, 0.45), 1, 7, 2.1, 0.5);
        // bristle mane ridge along the spine
        const mane = new Path2D();
        mane.moveTo(-70, -108);
        for (let i = 0; i <= 18; i++) {
          const x = -70 + i * 8, base = -112 - sin((i / 18) * PI) * 14 + (i > 12 ? (i - 12) * 2 : 0);
          mane.lineTo(x - 2, base); mane.lineTo(x + 2, base - 10 - U.hash(i, 1, 6) * 12 - sin((i / 18) * PI) * 8);
        }
        mane.lineTo(78, -100); mane.quadraticCurveTo(0, -110, -70, -100); mane.closePath();
        paint(c, mane, lg(c, 0, -150, 0, -100, [0, shade(p.mane, 0.25), 1, p.mane]), { line: p.line, lw: 1.4 });
        // demonic ember markings
        c.strokeStyle = rgba(p.ember, 0.85); c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(-40, -92); c.quadraticCurveTo(-30, -80, -42, -66); c.moveTo(-20, -96); c.quadraticCurveTo(-8, -84, -18, -70);
        c.moveTo(4, -98); c.quadraticCurveTo(16, -86, 6, -74);
        c.stroke();
        // short curly tail
        c.strokeStyle = p.furD; c.lineWidth = 3.5;
        c.beginPath(); c.moveTo(-90, -80); c.bezierCurveTo(-104, -84, -108, -98, -98, -100); c.bezierCurveTo(-90, -100, -94, -90, -100, -92); c.stroke();
      });
      blit(ctx, body);
      glow(ctx, -18, -84, 40, p.ember, 0.18 + 0.1 * sin(t * 3));
      ctx.restore();
      leg(-40, false, 0);
      leg(52, false, max(scrape, 0) * (1 - charge) + charge);
      // head (cached, tilts down on charge)
      ctx.save();
      ctx.translate(74, -86 + br * 0.6 + charge * 12);
      ctx.rotate(0.15 + charge * 0.35 - P.wind * 0.2 - P.hurt * 0.3 + sin(t * 1.4) * 0.03);
      const head = part('boar_demon/head/' + v, 110, 100, 30, 50, (c) => {
        // ear (back)
        paint(c, poly([[-6, -26], [-14, -48], [6, -32]]), p.furD, { line: p.line, lw: 1.3 });
        const h = new Path2D();
        h.moveTo(-14, -30);
        h.bezierCurveTo(10, -40, 40, -26, 60, -6);
        h.lineTo(62, 14);
        h.bezierCurveTo(40, 22, 10, 26, -10, 20);
        h.bezierCurveTo(-24, 10, -24, -20, -14, -30);
        h.closePath();
        paint(c, h, lg(c, 0, -36, 20, 24, [0, p.furL, 0.45, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 7, hi: rgba(p.furL, 0.6), hiw: 1.6, line: p.line, lw: 2 });
        hatch(c, h, 80, 21, [-24, -40, 86, 64], rgba(p.furD, 0.5), 1, 7, 2.6, 0.5);
        // snout disc
        const sn = ell(62, 4, 7, 11, 0.1);
        paint(c, sn, rg(c, 60, 0, 1, 62, 4, 12, [0, p.snout, 1, p.snoutD]), { line: p.line, lw: 1.6 });
        c.fillStyle = p.line; c.beginPath(); c.ellipse(63, 0, 1.6, 2.6, 0, 0, TAU); c.ellipse(64, 8, 1.6, 2.6, 0, 0, TAU); c.fill();
        // tusks
        for (const [x, s] of [[46, 1], [40, 0.75]]) {
          const tk = new Path2D();
          tk.moveTo(x - 4 * s, 12); tk.bezierCurveTo(x + 2, 4, x + 10 * s, -8 * s, x + 4 * s, -22 * s);
          tk.bezierCurveTo(x + 14 * s, -10 * s, x + 8 * s, 10, x + 4 * s, 16); tk.closePath();
          paint(c, tk, lg(c, x, -20, x, 16, [0, '#ffffff', 0.5, p.tusk, 1, shade(p.tusk, -0.35)]), { line: shade(p.tusk, -0.7), lw: 1.3 });
        }
        // front ear
        paint(c, poly([[4, -30], [0, -54], [18, -34]]), p.fur, { hi: rgba(p.furL, 0.5), hiw: 1, line: p.line, lw: 1.4 });
        c.fillStyle = rgba(p.snoutD, 0.7); c.beginPath(); c.moveTo(6, -32); c.lineTo(3, -48); c.lineTo(13, -34); c.fill();
        // angry brow
        c.fillStyle = p.furD; c.beginPath(); c.moveTo(14, -24); c.lineTo(36, -16); c.lineTo(30, -12); c.lineTo(14, -18); c.fill();
      });
      blit(ctx, head);
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 26, -12, 3, p.eye, 0.9 + 0.1 * sin(t * 6), '#fff2c0', 2.4 * ef);
      // steamy snort
      particles(4, t, 0.9, 91, (i, life, r) => soft(ctx, 70 + life * 26, 8 + life * 6 - r(1) * 6, 6 + life * 14, '#d8d0c8', 0.35 * (1 - life) * (0.5 + charge)));
      ctx.restore();
      if (charge > 0.3) for (let i = 0; i < 5; i++) soft(ctx, -70 - i * 18, -8 - i * 3, 14 + i * 4, '#a89070', 0.25 * charge);
      if (P.cast > 0) glow(ctx, 0, -90, 120, p.magic, P.cast * 0.3);
    },
  });

  // =============================================================================================
  // 獼猴精 macaque_demon — Formosan rock macaque spirit, crouched, mischievous, glowing eyes
  def('macaque_demon', {
    w: 135, h: 160,
    pal: {
      fur: '#7a7058', furD: '#3a3428', furL: '#b8ae90', face: '#d8a088', faceD: '#9a6050', faceL: '#f6ccb4', hand: '#5a4a40',
      eye: '#ffb02a', peach: '#ff9a7a', leafc: '#5aa04a', line: '#1e1a12', talis: '#f0d24a', ink: '#c0281a', magic: '#ffc24a',
    },
    vars: [{ h: 190, s: 0.6, l: -0.04, keep: ['face', 'faceD', 'faceL', 'peach', 'leafc', 'talis', 'ink'], set: { eye: '#8af0ff' } }, { h: -30, s: 1.8, l: -0.06, keep: ['face', 'faceD', 'faceL', 'peach', 'leafc', 'talis', 'ink'], set: { eye: '#ff3a3a' } }],
    draw(ctx, t, o, p, P, v) {
      const br = sin(t * 2.6) * 1.6;
      const leap = P.reach;
      ctx.translate(leap * 10, -leap * 18);
      // long tail curling behind
      const ts = sin(t * 1.5);
      tube(ctx, [[-30, -40], [-56, -30], [-70, -56 + ts * 6], [-62, -88 + ts * 10], [-48 + ts * 6, -96 + ts * 8]], 8, 4, { line: p.line, base: p.fur, hi: rgba(p.furL, 0.5) });
      // back arm (knuckles on ground)
      limb(ctx, [[-4, -80], [-10, -50], [-6, -10]], 14, 9, p.furD, { line: p.line, lw: 1.4 });
      paint(ctx, ell(-4, -7, 8, 5), p.hand, { line: p.line, lw: 1.2 });
      // body (cached)
      ctx.save(); ctx.translate(0, br * 0.5);
      const body = part('macaque_demon/body/' + v, 130, 130, 60, 120, (c) => {
        // haunch + foot
        const hn = blob([[-40, -40], [-14, -60], [10, -40], [6, -10], [-20, -2], [-42, -14]]);
        paint(c, hn, rg(c, -20, -44, 4, -16, -30, 40, [0, p.furL, 0.5, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 7, line: p.line, lw: 1.8 });
        hatch(c, hn, 70, 31, [-44, -60, 56, 60], rgba(p.furD, 0.5), 1, 6, 1.8, 0.7);
        paint(c, blob([[-14, -6], [12, -8], [20, -2], [10, 2], [-14, 2]]), p.hand, { line: p.line, lw: 1.3 });
        // torso hunched forward
        const tb = blob([[-34, -66], [-12, -98], [20, -100], [36, -78], [30, -44], [6, -34], [-22, -40]]);
        paint(c, tb, rg(c, 0, -88, 4, 0, -70, 50, [0, p.furL, 0.5, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 8, hi: rgba(p.furL, 0.6), hiw: 1.8, line: p.line, lw: 2 });
        hatch(c, tb, 120, 32, [-36, -104, 76, 70], rgba(p.furD, 0.45), 1, 7, 1.9, 0.8);
        hatch(c, tb, 60, 33, [-30, -104, 50, 30], rgba(p.furL, 0.5), 1, 6, 1.7, 0.6);
        // talisman scrap stuck on its back
        c.save(); c.translate(-18, -86); c.rotate(-0.4);
        paint(c, poly([[-6, -12], [6, -12], [6, 12], [-6, 12]]), p.talis, { line: shade(p.talis, -0.5), lw: 1 });
        c.strokeStyle = p.ink; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 9); c.moveTo(-3, -5); c.lineTo(3, -5); c.moveTo(-3, 0); c.lineTo(3, 1); c.moveTo(-3, 5); c.lineTo(2, 7); c.stroke();
        c.restore();
      });
      blit(ctx, body);
      ctx.restore();
      // head (live: turns, grimace)
      const look = sin(t * 0.8) * 0.12 + leap * 0.15 - P.hurt * 0.3;
      ctx.save();
      ctx.translate(28, -96 + br);
      ctx.rotate(look);
      const hd = blob([[-22, -2], [-18, -22], [0, -32], [20, -26], [28, -10], [24, 10], [6, 18], [-14, 14]]);
      paint(ctx, hd, rg(ctx, 0, -18, 2, 0, -6, 34, [0, p.furL, 0.5, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 5, line: p.line, lw: 1.8 });
      hatch(ctx, hd, 30, 41, [-22, -32, 30, 40], rgba(p.furD, 0.5), 1, 5, 2.4, 0.6);
      // ear
      paint(ctx, ell(-10, -10, 5, 7), p.faceD, { line: p.line, lw: 1.2 });
      // bare face
      const face = blob([[2, -20], [18, -22], [28, -10], [26, 6], [14, 14], [2, 6], [-2, -8]]);
      paint(ctx, face, rg(ctx, 12, -12, 2, 12, -4, 22, [0, p.faceL, 0.5, p.face, 1, p.faceD]), { sh: rgba(p.faceD, 0.6), shw: 4, line: p.line, lw: 1.4 });
      // brow ridge
      ctx.fillStyle = rgba(p.faceD, 0.9);
      ctx.beginPath(); ctx.moveTo(4, -15); ctx.quadraticCurveTo(16, -22, 28, -14); ctx.quadraticCurveTo(16, -17, 4, -12); ctx.fill();
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 12, -9, 2.8, p.eye, 0.95, '#fff2c0', 2.6 * ef);
      eye(ctx, 23, -9, 2.3, p.eye, 0.85, '#fff2c0', 2.2 * ef);
      ctx.fillStyle = p.faceD; ctx.beginPath(); ctx.arc(24, -1, 1, 0, TAU); ctx.arc(27, -1, 1, 0, TAU); ctx.fill();
      // bared-teeth threat grin
      const mo = 2 + leap * 5 + P.cast * 3 + max(0, sin(t * 1.3)) * 2;
      ctx.fillStyle = '#3a0a0a';
      ctx.beginPath(); ctx.moveTo(10, 6); ctx.quadraticCurveTo(18, 4, 26, 5); ctx.quadraticCurveTo(18, 8 + mo, 10, 6); ctx.fill();
      ctx.fillStyle = '#fff6e6';
      ctx.fillRect(13, 5, 10, 1.6);
      ctx.beginPath(); ctx.moveTo(13, 5); ctx.lineTo(15, 5); ctx.lineTo(14, 9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(21, 5); ctx.lineTo(23, 5); ctx.lineTo(22, 9); ctx.fill();
      // cheek ruff
      ctx.fillStyle = p.furL;
      ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(-8, 14); ctx.lineTo(2, 12); ctx.lineTo(0, 18); ctx.lineTo(8, 14); ctx.fill();
      ctx.restore();
      // front arm: holding a stolen peach, swipes on attack
      const sa = -0.3 + leap * 1.4 - P.wind * 0.6 + sin(t * 2) * 0.05;
      const sh = [18, -80];
      const el = [sh[0] + cos(sa + 0.9) * 26, sh[1] + sin(sa + 0.9) * 26];
      const hn = [el[0] + cos(sa) * 26, el[1] + sin(sa) * 26];
      limb(ctx, [sh, el, hn], 14, 9, p.fur, { hi: rgba(p.furL, 0.6), hiw: 1.2, line: p.line, lw: 1.5 });
      if (leap < 0.3) {
        paint(ctx, circle(hn[0] + 6, hn[1] - 4, 10), rg(ctx, hn[0] + 2, hn[1] - 8, 1, hn[0] + 6, hn[1] - 4, 12, [0, '#fff0c0', 0.5, p.peach, 1, shade(p.peach, -0.35)]), { line: shade(p.peach, -0.6), lw: 1.2 });
        ctx.strokeStyle = rgba(shade(p.peach, -0.4), 0.7); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hn[0] + 6, hn[1] - 13); ctx.quadraticCurveTo(hn[0] + 2, hn[1] - 4, hn[0] + 6, hn[1] + 5); ctx.stroke();
        paint(ctx, blob([[hn[0] + 6, hn[1] - 13], [hn[0] + 14, hn[1] - 20], [hn[0] + 20, hn[1] - 16], [hn[0] + 12, hn[1] - 12]]), p.leafc, { line: shade(p.leafc, -0.5), lw: 1 });
      }
      paint(ctx, ell(hn[0], hn[1], 7, 5, sa), p.hand, { line: p.line, lw: 1.2 });
      if (leap > 0.3) for (let i = 0; i < 3; i++) claw(ctx, hn[0] + 4, hn[1] - 3 + i * 3, sa + 0.3, 8, 2.5, '#f0e6d0', p.line);
      if (leap > 0.6) {
        ctx.strokeStyle = rgba('#ffffff', (leap - 0.6) * 1.8); ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(hn[0] - 20, hn[1] + 10, 34 + i * 6, -1.2, 0.3); ctx.stroke(); }
      }
      if (P.cast > 0) glow(ctx, 30, -100, 50, p.magic, P.cast * 0.5);
    },
  });

  // =============================================================================================
  // 虎姑婆 tiger_granny — BOSS: folk-tale tiger disguised as a kindly grandmother
  def('tiger_granny', {
    w: 250, h: 340,
    pal: {
      jacket: '#2e3a6a', jacketD: '#141a36', jacketL: '#5a6aa8', trim: '#c8a24a', pants: '#1e1e2a', pantsD: '#0c0c14',
      scarf: '#b8304a', scarfD: '#5e1024', scarfL: '#ff7a8a', flower: '#ffd27a', fur: '#e8862e', furD: '#8a3a12', furL: '#ffd29a',
      white: '#fff4e2', stripe: '#2a160e', eye: '#ffe23a', nose: '#5a2a2a', claw: '#f6f0e0', cane: '#7a5a36', line: '#1a0e14', magic: '#ff9a3a',
    },
    vars: [{ h: 160, s: 0.8, keep: ['fur', 'furD', 'furL', 'white', 'stripe', 'eye', 'claw', 'cane', 'nose'] }, { h: 0, s: 0.1, l: 0.05, keep: ['jacket', 'jacketD', 'jacketL', 'trim', 'scarf', 'scarfD', 'scarfL', 'flower', 'claw', 'cane', 'pants', 'pantsD'], set: { eye: '#9af6ff', magic: '#9af6ff' } }],
    draw(ctx, t, o, p, P, v) {
      const ph = o.phase || 1;
      const br = sin(t * 1.5);
      // tiger tail sneaking out from under the clothes (behind)
      const tw = sin(t * 1.9), tw2 = sin(t * 1.3 + 1);
      tube(ctx, [[-30, -70], [-74, -60], [-104 + tw * 6, -90 + tw2 * 6], [-100 + tw * 12, -140 + tw2 * 8], [-80 + tw * 18, -160 + tw * 6]], 18, 10,
        { line: p.line, base: (u) => (((u * 7) | 0) % 2 ? p.stripe : p.fur), hi: rgba(p.furL, 0.5) });
      // back arm holding a cane
      const cx = -90 + sin(t * 1.5) * 2;
      ctx.strokeStyle = shade(p.cane, -0.5); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(cx + 4, -170); ctx.quadraticCurveTo(cx - 2, -90, cx, -2); ctx.stroke();
      ctx.strokeStyle = p.cane; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.moveTo(cx + 4, -170); ctx.quadraticCurveTo(cx - 2, -90, cx, -2); ctx.stroke();
      ctx.strokeStyle = shade(p.cane, -0.4); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(cx + 4, -170); ctx.quadraticCurveTo(cx + 6, -186, cx + 20, -184); ctx.stroke();
      limb(ctx, [[-50, -226 + br], [-84, -200], [cx + 4, -166]], 26, 20, p.jacketD, { line: p.line, lw: 1.8 });
      paint(ctx, ell(cx + 4, -164, 12, 10), p.fur, { line: p.line, lw: 1.6 });
      for (let i = 0; i < 3; i++) claw(ctx, cx + 12, -168 + i * 5, 0.6, 10, 3.5, p.claw, p.line);
      // body (cached): wide trousers, side-buttoned 大襟衫, paws peeking from hems
      ctx.save();
      ctx.translate(0, br * 1.5);
      const body = part('tiger_granny/body/' + v, 240, 270, 120, 262, (c) => {
        // paws (feet) under the trousers
        for (const [x, s] of [[-30, 0.9], [26, 1]]) {
          paint(c, ell(x + 6, -8, 20 * s, 10 * s), rg(c, x, -12, 2, x + 6, -8, 22, [0, p.furL, 0.5, p.fur, 1, p.furD]), { line: p.line, lw: 1.6 });
          c.fillStyle = p.stripe; c.fillRect(x - 6, -14, 3, 7); c.fillRect(x + 2, -16, 3, 7);
          for (let k = 0; k < 3; k++) claw(c, x + 18 * s, -10 + k * 4, 0.3, 9, 3, p.claw, p.line);
        }
        // trousers
        const pn = new Path2D();
        pn.moveTo(-60, -110); pn.bezierCurveTo(-66, -70, -62, -30, -58, -14);
        pn.lineTo(-6, -12); pn.lineTo(-2, -60); pn.lineTo(4, -12); pn.lineTo(56, -12);
        pn.bezierCurveTo(60, -40, 62, -80, 56, -112); pn.closePath();
        paint(c, pn, lg(c, -60, 0, 60, 0, [0, p.pants, 0.6, shade(p.pants, 0.12), 1, p.pantsD]), { sh: rgba(p.pantsD, 0.6), shw: 8, hi: rgba(p.jacketL, 0.3), hiw: 1.6, line: p.line, lw: 2 });
        c.strokeStyle = rgba(p.jacketL, 0.25); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(-40, -100); c.quadraticCurveTo(-46, -60, -40, -16); c.moveTo(30, -100); c.quadraticCurveTo(36, -60, 32, -16); c.stroke();
        // jacket (hunched)
        const jk = new Path2D();
        jk.moveTo(-58, -232);
        jk.bezierCurveTo(-20, -250, 30, -246, 56, -226);
        jk.bezierCurveTo(74, -190, 76, -140, 74, -92);
        jk.quadraticCurveTo(0, -80, -74, -92);
        jk.bezierCurveTo(-78, -150, -78, -200, -58, -232);
        jk.closePath();
        paint(c, jk, lg(c, -60, -240, 60, -90, [0, p.jacketL, 0.4, p.jacket, 1, p.jacketD]),
          { sh: rgba(p.jacketD, 0.7), shw: 12, hi: rgba(p.jacketL, 0.5), hiw: 2.2, rim: rgba(p.magic, 0.35), rimw: 2, line: p.line, lw: 2.2 });
        c.save(); c.clip(jk);
        // subtle woven pattern
        c.strokeStyle = rgba(p.jacketL, 0.12); c.lineWidth = 1;
        for (let i = -20; i < 20; i++) { c.beginPath(); c.moveTo(i * 9, -250); c.lineTo(i * 9 + 60, -80); c.stroke(); }
        c.restore();
        // 大襟 diagonal front opening with trim & frog buttons
        const tr = new Path2D();
        tr.moveTo(-14, -238); tr.quadraticCurveTo(30, -220, 40, -196); tr.lineTo(46, -90);
        c.strokeStyle = p.trim; c.lineWidth = 4; c.stroke(tr);
        c.strokeStyle = shade(p.trim, -0.4); c.lineWidth = 1; c.stroke(tr);
        for (const [x, y] of [[22, -224], [38, -200], [42, -168], [44, -136], [45, -108]]) {
          c.strokeStyle = p.trim; c.lineWidth = 2;
          c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 5, y); c.stroke();
          c.fillStyle = p.trim; c.beginPath(); c.arc(x + 6, y, 2.4, 0, TAU); c.fill();
        }
        // hem trim
        c.strokeStyle = p.trim; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-74, -94); c.quadraticCurveTo(0, -82, 74, -94); c.stroke();
        // pocket patch & fold shadows
        c.strokeStyle = rgba(p.jacketD, 0.7); c.lineWidth = 2;
        c.beginPath(); c.moveTo(-50, -210); c.quadraticCurveTo(-56, -160, -50, -100); c.moveTo(-20, -200); c.quadraticCurveTo(-26, -150, -18, -96); c.stroke();
      });
      blit(ctx, body);
      ctx.restore();
      // head: headscarf + tiger face (live tilt)
      const tilt = sin(t * 0.9) * 0.05 + P.reach * 0.12 - P.hurt * 0.25 + (ph >= 2 ? 0.05 : 0);
      ctx.save();
      ctx.translate(28 + P.reach * 10, -258 + br * 2);
      ctx.rotate(tilt);
      const head = part('tiger_granny/head/' + v + '/' + (ph >= 2 ? 2 : 1), 150, 150, 70, 80, (c) => {
        // scarf back (behind face)
        const sb = new Path2D();
        sb.moveTo(-40, 30); sb.bezierCurveTo(-60, -10, -50, -60, -4, -66);
        sb.bezierCurveTo(36, -68, 56, -40, 52, -8); sb.lineTo(40, 30); sb.closePath();
        paint(c, sb, lg(c, -40, -60, 40, 30, [0, p.scarfL, 0.4, p.scarf, 1, p.scarfD]), { sh: rgba(p.scarfD, 0.6), shw: 8, hi: rgba(p.scarfL, 0.5), hiw: 2, line: p.line, lw: 2 });
        // floral print
        c.save(); c.clip(sb);
        for (let i = 0; i < 14; i++) {
          const x = -50 + U.hash(i, 1, 71) * 100, y = -66 + U.hash(i, 2, 71) * 90;
          c.fillStyle = rgba(p.flower, 0.75);
          for (let k = 0; k < 5; k++) { const a = k * TAU / 5; c.beginPath(); c.arc(x + cos(a) * 2.6, y + sin(a) * 2.6, 1.8, 0, TAU); c.fill(); }
          c.fillStyle = rgba(p.scarfD, 0.9); c.beginPath(); c.arc(x, y, 1.2, 0, TAU); c.fill();
        }
        c.restore();
        // tiger ear poking through the scarf
        paint(c, poly([[22, -58], [36, -84], [42, -52]]), p.fur, { line: p.line, lw: 1.6 });
        c.fillStyle = p.white; c.beginPath(); c.moveTo(27, -58); c.lineTo(35, -76); c.lineTo(38, -56); c.fill();
        if (ph >= 2) { paint(c, poly([[-16, -62], [-14, -90], [4, -64]]), p.fur, { line: p.line, lw: 1.6 }); }
        // face
        const fc = new Path2D();
        fc.moveTo(-22, -30); fc.bezierCurveTo(-18, -52, 18, -56, 36, -40);
        fc.bezierCurveTo(52, -26, 62, -10, 60, 6);
        fc.bezierCurveTo(54, 24, 30, 34, 6, 32);
        fc.bezierCurveTo(-16, 28, -26, 0, -22, -30); fc.closePath();
        paint(c, fc, rg(c, 14, -30, 3, 14, -10, 56, [0, p.furL, 0.45, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 8, hi: rgba(p.furL, 0.6), hiw: 1.8, line: p.line, lw: 2 });
        c.save(); c.clip(fc);
        // stripes
        c.fillStyle = p.stripe;
        for (const s of [[-8, -46, 6, -32, 0, -24], [6, -54, 14, -36, 8, -28], [22, -52, 24, -38, 18, -32], [-24, -16, -4, -12, -16, -2], [-24, 2, -6, 6, -16, 12], [46, -38, 36, -26, 48, -22], [54, -26, 46, -16, 58, -12]]) {
          c.beginPath(); c.moveTo(s[0], s[1]); c.quadraticCurveTo(s[2], s[3], s[4], s[5]); c.quadraticCurveTo(s[2] - 6, s[3] + 3, s[0], s[1]); c.fill();
        }
        // white muzzle & cheeks
        c.fillStyle = p.white;
        c.beginPath(); c.ellipse(40, 10, 22, 16, -0.2, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(12, 18, 16, 12, 0.3, 0, TAU); c.fill();
        c.restore();
        // nose
        paint(c, poly([[48, -6], [62, -4], [56, 4]]), p.nose, { line: p.line, lw: 1.2 });
        c.strokeStyle = p.line; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(56, 4); c.lineTo(55, 10); c.stroke();
        // whiskers
        c.strokeStyle = rgba('#ffffff', 0.85); c.lineWidth = 1;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(44, 10 + i * 3); c.quadraticCurveTo(64, 8 + i * 4, 78, 4 + i * 7); c.stroke(); }
        for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(16, 14 + i * 3); c.quadraticCurveTo(0, 14 + i * 4, -14, 18 + i * 7); c.stroke(); }
        // scarf front rim framing the face + knot under the chin
        const rim = new Path2D();
        rim.moveTo(-34, 32); rim.bezierCurveTo(-46, -20, -30, -62, 10, -64);
        rim.bezierCurveTo(26, -64, 34, -60, 38, -54);
        rim.bezierCurveTo(16, -58, -16, -50, -22, -24);
        rim.bezierCurveTo(-26, 0, -18, 24, -4, 34); rim.closePath();
        paint(c, rim, lg(c, -40, -60, 0, 30, [0, p.scarfL, 0.5, p.scarf, 1, p.scarfD]), { hi: rgba(p.scarfL, 0.6), hiw: 1.5, line: p.line, lw: 1.8 });
        const knot = blob([[-8, 28], [8, 26], [12, 36], [0, 42], [-10, 38]]);
        paint(c, knot, p.scarf, { sh: rgba(p.scarfD, 0.6), shw: 4, line: p.line, lw: 1.6 });
        for (const a of [0.5, 1.1]) {
          c.save(); c.translate(2, 40); c.rotate(a);
          paint(c, poly([[0, -4], [24, -6], [20, 2], [26, 8], [0, 4]]), p.scarfD, { line: p.line, lw: 1.4 });
          c.restore();
        }
      });
      blit(ctx, head);
      // eyes (live): sweet squint when idle, wide & glowing on attack
      const wide = max(0.3, P.atk, P.cast, ph >= 2 ? 0.7 : 0);
      const blink = (t % 4.1) > 3.98 ? 0.1 : 1;
      for (const [ex, ey, r] of [[16, -24, 7.5], [40, -26, 6]]) {
        ctx.fillStyle = '#1a0a04';
        ctx.beginPath(); ctx.ellipse(ex, ey, r + 1, (r * 0.35 + r * 0.55 * wide) * blink + 1, -0.1, 0, TAU); ctx.fill();
        eye(ctx, ex, ey, r * 0.8, p.eye, 0.9, '#fffbe0', (r * 0.3 + r * 0.45 * wide) * blink);
        ctx.fillStyle = '#100';
        ctx.beginPath(); ctx.ellipse(ex + 0.5, ey, 1.1, (r * 0.3 + r * 0.4 * wide) * blink, 0, 0, TAU); ctx.fill();
      }
      // mouth: grandmotherly smile that splits into a fanged grin
      const mo = 3 + P.atk * 14 + P.cast * 10 + (ph >= 2 ? 3 : 0);
      ctx.fillStyle = '#3a0810';
      ctx.beginPath(); ctx.moveTo(24, 14); ctx.quadraticCurveTo(42, 22, 58, 12); ctx.quadraticCurveTo(42, 22 + mo * 1.4, 24, 14); ctx.fill();
      ctx.fillStyle = p.claw;
      ctx.beginPath(); ctx.moveTo(30, 16); ctx.lineTo(34, 17); ctx.lineTo(32, 22 + mo * 0.4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(48, 17); ctx.lineTo(52, 15); ctx.lineTo(51, 21 + mo * 0.4); ctx.fill();
      ctx.strokeStyle = p.line; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(24, 14); ctx.quadraticCurveTo(42, 22, 58, 12); ctx.stroke();
      ctx.restore();
      // front arm: wide sleeve, huge tiger paw with claws
      const sw = P.reach * 1.6 - P.wind * 0.9 + sin(t * 1.2) * 0.06 - P.hurt * 0.3 - P.cast * 0.8;
      const sh = [44, -218 + br * 1.5];
      const el = [sh[0] + 30 + sin(sw) * 6, sh[1] + 50 - sw * 20];
      const hn = [el[0] + cos(-0.5 + sw) * 46, el[1] + sin(-0.5 + sw) * 46 - 10];
      // sleeve
      const sl = ribbon([sh, el, [hn[0] - (hn[0] - el[0]) * 0.25, hn[1] - (hn[1] - el[1]) * 0.25]], 34, 40, 5);
      paint(ctx, sl, lg(ctx, sh[0], sh[1], el[0], el[1] + 30, [0, p.jacketL, 0.5, p.jacket, 1, p.jacketD]), { sh: rgba(p.jacketD, 0.6), shw: 6, hi: rgba(p.jacketL, 0.5), hiw: 1.6, line: p.line, lw: 2 });
      ctx.save();
      ctx.translate(hn[0], hn[1]);
      ctx.rotate(-0.5 + sw);
      ctx.strokeStyle = p.trim; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-14, -20); ctx.lineTo(-14, 20); ctx.stroke();
      const paw = blob([[-10, -16], [12, -18], [26, -6], [26, 10], [10, 18], [-10, 14]]);
      paint(ctx, paw, rg(ctx, 6, -8, 2, 6, 0, 28, [0, p.furL, 0.5, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 5, line: p.line, lw: 1.8 });
      ctx.fillStyle = p.stripe; ctx.fillRect(-4, -14, 3, 9); ctx.fillRect(4, -16, 3, 8);
      const ext = 0.6 + P.reach * 0.6 + P.wind * 0.3;
      for (let i = 0; i < 4; i++) claw(ctx, 24, -10 + i * 7, 0.2 + (i - 1.5) * 0.15, 14 * ext + 4, 5, p.claw, p.line);
      ctx.restore();
      if (P.reach > 0.5) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = rgba(p.magic, (P.reach - 0.5) * 1.6 * (1 - i * 0.15)); ctx.lineWidth = 3 - i * 0.4;
          ctx.beginPath(); ctx.moveTo(hn[0] + 10, hn[1] - 60 + i * 14); ctx.quadraticCurveTo(hn[0] + 60, hn[1] - 20 + i * 14, hn[0] + 40, hn[1] + 40 + i * 14); ctx.stroke();
        }
        ctx.restore();
      }
      if (ph >= 2) glow(ctx, 0, -160, 180, p.magic, 0.12 + 0.05 * sin(t * 3));
      if (P.cast > 0) particles(10, t, 0.8, 101, (i, life, r) => glow(ctx, (r(1) - 0.5) * 200, -life * 300, 6 + r(2) * 6, p.magic, sin(life * PI) * P.cast));
    },
  });

  // =============================================================================================
  // 陰兵 yin_soldier — faceless underworld soldier in black lamellar armour with a pennant spear
  def('yin_soldier', {
    w: 120, h: 215,
    pal: {
      armor: '#3a3e4a', armorD: '#15171f', armorL: '#7a8094', bronze: '#9a7a3a', cloth: '#7a2026', clothD: '#3a0c12',
      void: '#05070c', eye: '#7af0ff', mist: '#5a8aa8', shaft: '#3a2a20', blade: '#b8c4d0', flag: '#14161e', ink: '#c8d8e8', line: '#0a0c12', magic: '#7af0ff',
    },
    vars: [{ h: 0, s: 1, keep: ['eye', 'mist', 'magic'], set: { cloth: '#2a5a3a', clothD: '#0e2a18', eye: '#9aff9a', magic: '#9aff9a', bronze: '#7a8a4a' } }, { h: 0, s: 1, set: { eye: '#ff5a4a', magic: '#ff5a4a', cloth: '#d8c8a8', clothD: '#6a5a48', mist: '#8a4a4a' } }],
    draw(ctx, t, o, p, P, v) {
      const fl = sin(t * 1.4) * 4;
      ctx.translate(0, fl - 8);
      soft(ctx, 0, -10, 50, p.mist, 0.35);
      wisps(ctx, 0, -40, 50, t, p.mist, 5, 42, 0.3, 7);
      const thrust = P.reach;
      // spear held upright at its side, pennant hanging from it; levels and thrusts on attack
      const sx = 34 + thrust * 30 - P.wind * 8, sy = -116 + thrust * 6;
      const ang = U.lerp(-1.5, -0.08, thrust) - P.wind * 0.15 + sin(t * 1.4) * 0.02;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(ang);
      ctx.fillStyle = p.shaft; ctx.fillRect(-64, -2.5, 148, 5);
      ctx.fillStyle = rgba(p.armorL, 0.3); ctx.fillRect(-64, -2.5, 148, 1.5);
      const bl = new Path2D(); bl.moveTo(84, -6); bl.quadraticCurveTo(102, -4, 116, 0); bl.quadraticCurveTo(102, 4, 84, 6); bl.closePath();
      paint(ctx, bl, lg(ctx, 84, -6, 84, 6, [0, '#ffffff', 0.5, p.blade, 1, shade(p.blade, -0.4)]), { line: shade(p.blade, -0.7), lw: 1.2 });
      ctx.fillStyle = p.bronze; ctx.fillRect(78, -5, 7, 10);
      ctx.fillStyle = p.cloth;
      for (let i = 0; i < 5; i++) ctx.fill(ribbon([[80, 0], [76 - i, -8 - i * 2], [72 - i * 2 + sin(t * 3 + i) * 2, -18 - i]], 2.5, 1, 4));
      // pennant (令旗)
      const fw = (k) => sin(t * 3.2 - k * 0.15) * (2 + k * 0.12);
      const flag = new Path2D();
      flag.moveTo(72, 3);
      flag.bezierCurveTo(64, 3, 56, 3, 48, 3);
      flag.lineTo(48 + fw(26), 34);
      flag.lineTo(60 + fw(14), 30);
      flag.bezierCurveTo(66, 38 + fw(6), 72, 36, 72, 34);
      flag.closePath();
      paint(ctx, flag, p.flag, { line: p.cloth, lw: 2 });
      ctx.save(); ctx.translate(60 + fw(14) * 0.5, 18); ctx.rotate(-ang);
      ctx.fillStyle = p.ink; ctx.font = G.font(15, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('令', 0, 0);
      ctx.restore();
      ctx.restore();
      ctx.globalAlpha *= 0.95;
      const body = part('yin_soldier/body/' + v, 120, 180, 60, 172, (c) => {
        // tattered under-robe fading
        const rb = new Path2D();
        rb.moveTo(-30, -96); rb.bezierCurveTo(-36, -60, -40, -30, -36, -4);
        for (let i = 0; i <= 8; i++) rb.lineTo(-36 + i * 9, -4 - (i % 2) * 12);
        rb.bezierCurveTo(36, -30, 34, -60, 30, -96); rb.closePath();
        paint(c, rb, lg(c, 0, -96, 0, 0, [0, p.cloth, 1, p.clothD]), { sh: rgba(p.clothD, 0.6), shw: 6, line: p.line, lw: 1.6 });
        // armour skirt panels
        for (const [x, w] of [[-30, 22], [-8, 20], [12, 20]]) {
          const pnl = new Path2D(); pnl.roundRect(x, -98, w, 44, 3);
          paint(c, pnl, lg(c, x, -98, x + w, -54, [0, p.armorL, 0.4, p.armor, 1, p.armorD]), { line: p.line, lw: 1.4 });
          c.strokeStyle = rgba(p.armorL, 0.35); c.lineWidth = 1;
          for (let r = 0; r < 4; r++) { c.beginPath(); c.moveTo(x + 2, -90 + r * 10); c.lineTo(x + w - 2, -90 + r * 10); c.stroke(); }
          c.fillStyle = p.bronze; for (let r = 0; r < 4; r++) { c.beginPath(); c.arc(x + w / 2, -93 + r * 10, 1.1, 0, TAU); c.fill(); }
        }
        fadeOut(c, -60, -50, 120, -2);
        // torso cuirass (lamellar)
        const cu = blob([[-28, -150], [0, -158], [28, -150], [32, -120], [28, -96], [0, -92], [-28, -96], [-32, -122]]);
        paint(c, cu, lg(c, -28, -156, 28, -92, [0, p.armorL, 0.45, p.armor, 1, p.armorD]), { sh: rgba(p.armorD, 0.6), shw: 7, hi: rgba(p.armorL, 0.5), hiw: 1.5, rim: rgba(p.eye, 0.4), line: p.line, lw: 1.8 });
        c.save(); c.clip(cu);
        for (let r = 0; r < 7; r++) for (let k = 0; k < 9; k++) {
          const x = -32 + k * 8 + (r % 2) * 4, y = -152 + r * 9;
          c.strokeStyle = rgba(p.armorD, 0.7); c.lineWidth = 1;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 8); c.quadraticCurveTo(x + 4, y + 10, x + 8, y + 8); c.stroke();
          c.fillStyle = rgba(p.armorL, 0.3); c.fillRect(x + 1, y + 1, 2, 5);
        }
        c.restore();
        // chest mirror (護心鏡)
        paint(c, circle(8, -128, 9), rg(c, 5, -131, 1, 8, -128, 10, [0, '#ffffff', 0.4, p.bronze, 1, shade(p.bronze, -0.5)]), { line: p.line, lw: 1.3 });
        // belt
        c.fillStyle = p.clothD; c.fillRect(-30, -100, 62, 7);
        c.fillStyle = p.bronze; c.fillRect(-2, -101, 10, 9);
        // pauldrons
        for (const [x, s] of [[-26, -1], [26, 1]]) {
          const pd = blob([[x - 14, -156], [x + 6 * s, -162], [x + 16, -150], [x + 14, -136], [x - 12, -138]]);
          paint(c, pd, lg(c, x, -162, x, -136, [0, p.armorL, 1, p.armorD]), { hi: rgba(p.armorL, 0.5), hiw: 1, line: p.line, lw: 1.5 });
        }
        // helm with dark void face
        const hm = new Path2D();
        hm.moveTo(-18, -160); hm.bezierCurveTo(-20, -186, 4, -194, 20, -184); hm.bezierCurveTo(26, -176, 24, -164, 20, -158); hm.closePath();
        paint(c, hm, lg(c, -18, -192, 20, -160, [0, p.armorL, 0.5, p.armor, 1, p.armorD]), { sh: rgba(p.armorD, 0.6), shw: 5, line: p.line, lw: 1.6 });
        c.fillStyle = p.void;
        c.beginPath(); c.ellipse(6, -170, 14, 11, 0, 0, TAU); c.fill();
        // helm brim & crest plume
        c.fillStyle = p.bronze; c.fillRect(-18, -184, 40, 3);
        c.strokeStyle = shade(p.bronze, -0.4); c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, -192); c.lineTo(0, -198); c.stroke();
        // neck guard flaps
        for (let i = 0; i < 4; i++) {
          paint(c, poly([[-18 + i * 3, -164], [-14 + i * 3, -164], [-22 + i * 2, -146], [-26 + i * 2, -148]]), p.armorD, { line: p.line, lw: 1 });
        }
      });
      blit(ctx, body);
      // plume (live)
      ctx.fillStyle = p.cloth;
      for (let i = 0; i < 5; i++) ctx.fill(ribbon([[0, -198], [-10 - i * 3, -200 + i * 2 + sin(t * 2 + i) * 2], [-24 - i * 4 + sin(t * 2.4 + i) * 4, -192 + i * 4]], 4, 1, 4));
      // eyes in the void
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 2, -171, 2.2, p.eye, 0.85 + 0.15 * sin(t * 5), '#ffffff', 1.4 * ef);
      eye(ctx, 13, -171, 1.9, p.eye, 0.8, '#ffffff', 1.2 * ef);
      // arms: gripping spear
      const hand = [sx + cos(ang) * 6, sy + sin(ang) * 6];
      limb(ctx, [[22, -146], [34 + thrust * 6, -130 + thrust * 4], hand], 13, 10, p.armor, { hi: rgba(p.armorL, 0.5), hiw: 1, line: p.line, lw: 1.5 });
      paint(ctx, circle(hand[0], hand[1], 5.5), p.armorD, { line: p.line, lw: 1.2 });
      if (P.cast > 0) glow(ctx, 6, -170, 40, p.magic, P.cast * 0.6);
      particles(4, t, 0.35, 111, (i, life, r) => glow(ctx, (r(1) - 0.5) * 60, -20 - life * 150, 4, p.eye, sin(life * PI) * 0.6));
    },
  });

  // =============================================================================================
  // 石猴 stone_monkey — temple stone monkey statue come alive, ember cracks and moss
  def('stone_monkey', {
    w: 135, h: 155,
    pal: { stone: '#8a8a84', stoneD: '#3e3e3c', stoneL: '#d0cec2', moss: '#5a8a3a', mossL: '#9ac45a', crack: '#ff8a2a', eye: '#ffb03a', line: '#1e1e1c', magic: '#ffa23a' },
    vars: [{ h: 30, s: 2.5, l: -0.05, keep: ['moss', 'mossL'], set: { crack: '#7af0ff', eye: '#7af0ff', magic: '#7af0ff' } }, { h: 0, s: 1, l: -0.18, set: { crack: '#c86aff', eye: '#e8aaff', magic: '#c86aff', moss: '#3a3a5a', mossL: '#6a6a9a' } }],
    draw(ctx, t, o, p, P, v) {
      const br = sin(t * 1.8) * 1;
      const pulse = 0.6 + 0.4 * sin(t * 2.2) + P.cast * 0.5;
      const stone = (c, path, x0, y0, x1, y1, seed) => {
        paint(c, path, lg(c, x0, y0, x1, y1, [0, p.stoneL, 0.45, p.stone, 1, p.stoneD]), { sh: rgba(p.stoneD, 0.7), shw: 7, hi: rgba(p.stoneL, 0.7), hiw: 1.8, line: p.line, lw: 2 });
        c.save(); c.clip(path);
        for (let i = 0; i < 40; i++) {
          c.fillStyle = rgba(U.hash(i, 1, seed) > 0.5 ? p.stoneD : p.stoneL, 0.3);
          c.beginPath(); c.arc(x0 + U.hash(i, 2, seed) * (x1 - x0), y0 + U.hash(i, 3, seed) * (y1 - y0), 0.8 + U.hash(i, 4, seed) * 1.6, 0, TAU); c.fill();
        }
        c.restore();
      };
      // pedestal
      const ped = part('stone_monkey/ped/' + v, 140, 30, 70, 26, (c) => {
        const pd = new Path2D(); pd.roundRect(-58, -22, 116, 22, 4);
        stone(c, pd, -58, -22, 58, 0, 3);
        c.strokeStyle = rgba(p.stoneD, 0.7); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(-58, -14); c.lineTo(58, -14); c.stroke();
        for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(-45 + i * 18, -8, 3, 0, TAU); c.stroke(); }
        c.fillStyle = p.moss; c.beginPath(); c.ellipse(-40, -22, 16, 4, 0, 0, TAU); c.fill();
      });
      blit(ctx, ped);
      ctx.save();
      ctx.translate(0, -22 + br);
      const body = part('stone_monkey/body/' + v, 140, 160, 70, 150, (c) => {
        // tail curled around
        c.strokeStyle = p.stoneD; c.lineWidth = 11;
        c.beginPath(); c.moveTo(-30, -14); c.bezierCurveTo(-60, -10, -64, -48, -44, -56); c.stroke();
        c.strokeStyle = p.stone; c.lineWidth = 8;
        c.beginPath(); c.moveTo(-30, -14); c.bezierCurveTo(-60, -10, -64, -48, -44, -56); c.stroke();
        // squatting legs
        for (const [x, s] of [[-22, -1], [22, 1]]) {
          const lg2 = blob([[x - 18, -50], [x + 4 * s, -62], [x + 18, -40], [x + 14, -6], [x - 14, -2], [x - 20, -24]]);
          stone(c, lg2, x - 20, -62, x + 20, 0, 10 + s);
          stone(c, ell(x + 6 * s, -4, 16, 6), x - 14, -10, x + 22, 2, 12);
        }
        // torso
        const tb = blob([[-30, -60], [-20, -96], [18, -100], [32, -64], [24, -30], [-24, -30]]);
        stone(c, tb, -30, -100, 32, -30, 14);
        // carved belly swirl
        c.strokeStyle = rgba(p.stoneD, 0.7); c.lineWidth = 2;
        c.beginPath(); c.arc(2, -56, 10, 0, PI * 1.6); c.stroke();
        c.beginPath(); c.arc(2, -56, 5, PI, PI * 2.6); c.stroke();
        // moss patches
        c.fillStyle = rgba(p.moss, 0.85);
        for (const [x, y, r] of [[-22, -88, 10], [20, -96, 7], [-26, -40, 6]]) { c.beginPath(); c.ellipse(x, y, r, r * 0.6, 0.3, 0, TAU); c.fill(); }
        c.fillStyle = rgba(p.mossL, 0.8);
        for (const [x, y] of [[-24, -90], [18, -98], [-27, -42]]) { c.beginPath(); c.arc(x, y, 2.5, 0, TAU); c.fill(); }
        // head
        const hd = blob([[-26, -108], [-18, -132], [8, -140], [30, -126], [34, -100], [18, -86], [-12, -86], [-28, -96]]);
        stone(c, hd, -28, -140, 34, -86, 16);
        // ears
        stone(c, circle(-28, -114, 8), -36, -122, -20, -106, 17);
        // carved curly brows & muzzle (temple style)
        c.strokeStyle = p.stoneD; c.lineWidth = 2.4;
        c.beginPath(); c.arc(4, -116, 6, PI, TAU); c.arc(20, -116, 5, PI, TAU); c.stroke();
        const mz = ell(16, -98, 15, 10);
        stone(c, mz, 0, -108, 32, -88, 18);
        c.beginPath(); c.moveTo(6, -96); c.quadraticCurveTo(16, -90, 28, -96); c.stroke();
        c.fillStyle = p.stoneD; c.beginPath(); c.arc(22, -102, 1.5, 0, TAU); c.arc(27, -102, 1.5, 0, TAU); c.fill();
      });
      blit(ctx, body);
      // glowing cracks (live pulse)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(p.crack, 0.75 * pulse); ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (const cr of [[-14, -94, -6, -80, -12, -66, -4, -54], [20, -84, 12, -72, 18, -60], [-30, -50, -20, -40, -24, -26], [8, -138, 4, -128, 10, -122], [26, -36, 20, -20, 26, -10]]) {
        ctx.moveTo(cr[0], cr[1]); for (let i = 2; i < cr.length; i += 2) ctx.lineTo(cr[i], cr[i + 1]);
      }
      ctx.stroke();
      ctx.restore();
      glow(ctx, -6, -76, 34, p.crack, 0.25 * pulse);
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 4, -111, 3.4, p.eye, 0.9, '#fff6d0', 3 * ef);
      eye(ctx, 20, -111, 2.8, p.eye, 0.85, '#fff6d0', 2.6 * ef);
      // arms (live): rest on knees, punch on attack
      for (const [back, sx] of [[true, -24], [false, 24]]) {
        const pr = back ? 0 : P.reach;
        const sh = [sx, -86], hn = back ? [sx - 8, -44 + sin(t * 1.8) * 2] : [sx + 18 + pr * 50 - P.wind * 10, -46 - pr * 30 + sin(t * 1.8 + 1) * 2];
        const el = [U.lerp(sh[0], hn[0], 0.5) + (back ? -10 : 8), U.lerp(sh[1], hn[1], 0.5) + 6];
        const c2 = back ? p.stoneD : p.stone;
        limb(ctx, [sh, el, hn], 20, 15, lg(ctx, sh[0], sh[1], hn[0], hn[1], [0, p.stoneL, 0.5, c2, 1, p.stoneD]), { line: p.line, lw: 1.8 });
        paint(ctx, circle(hn[0] + 2, hn[1], 11), rg(ctx, hn[0], hn[1] - 3, 1, hn[0] + 2, hn[1], 12, [0, p.stoneL, 0.6, c2, 1, p.stoneD]), { line: p.line, lw: 1.6 });
        if (pr > 0.6) glow(ctx, hn[0] + 8, hn[1], 26, p.crack, (pr - 0.6) * 2);
      }
      ctx.restore();
      // pebble chips falling when hurt / attacking
      const k = max(P.hurt, P.reach);
      if (k > 0.1) particles(6, t, 1.4, 121, (i, life, r) => {
        ctx.fillStyle = rgba(p.stone, k * (1 - life));
        ctx.fillRect((r(1) - 0.5) * 60, -100 + life * 90 + r(2) * 20, 3, 3);
      });
    },
  });

  // =============================================================================================
  // 鼠精 rat_demon — hunched upright rat in a ragged robe, clutching a string of old coins
  def('rat_demon', {
    w: 120, h: 145,
    pal: {
      fur: '#6a6058', furD: '#2e2824', furL: '#aaa094', pink: '#e8a0a0', pinkD: '#a0585a', robe: '#6a5a3a', robeD: '#2e2416', robeL: '#a8946a',
      coin: '#d8b04a', coinD: '#7a5a1a', eye: '#ff3a3a', teeth: '#f8e8a0', line: '#1a1410', magic: '#ffd24a',
    },
    vars: [{ h: 0, s: 0.3, l: 0.15, keep: ['pink', 'pinkD', 'coin', 'coinD', 'teeth'], set: { eye: '#ff6ad0' } }, { h: -20, s: 1.2, l: -0.12, keep: ['pink', 'pinkD', 'coin', 'coinD', 'teeth'], set: { eye: '#9aff4a', magic: '#9aff4a' } }],
    draw(ctx, t, o, p, P, v) {
      const br = sin(t * 3) * 1.2;
      const sniff = sin(t * 14) * (sin(t * 0.9) > 0.3 ? 1 : 0.1);
      // tail
      const tw = sin(t * 1.7);
      tube(ctx, [[-20, -30], [-50, -20], [-66 + tw * 4, -6], [-86 + tw * 8, -10 - tw * 4], [-100 + tw * 10, -26 - tw * 6]], 8, 2, { line: p.pinkD, base: p.pink, hi: rgba('#ffffff', 0.4) });
      // feet
      for (const x of [-14, 12]) {
        paint(ctx, blob([[x - 8, -6], [x + 10, -8], [x + 18, -2], [x + 4, 0], [x - 8, 0]]), p.pink, { line: p.pinkD, lw: 1.2 });
        for (let k = 0; k < 3; k++) claw(ctx, x + 14, -4 + k * 1.5, 0.1, 6, 2, '#f6eedc', p.line);
      }
      ctx.save(); ctx.translate(0, br);
      const body = part('rat_demon/body/' + v, 110, 120, 55, 110, (c) => {
        // ragged robe
        const rb = new Path2D();
        rb.moveTo(-22, -86); rb.bezierCurveTo(4, -96, 26, -88, 30, -64);
        rb.bezierCurveTo(34, -40, 30, -20, 28, -6);
        for (let i = 0; i <= 8; i++) rb.lineTo(28 - i * 7, -6 + (i % 2 ? 6 : 0));
        rb.bezierCurveTo(-40, -30, -38, -66, -22, -86); rb.closePath();
        paint(c, rb, lg(c, -30, -90, 30, 0, [0, p.robeL, 0.45, p.robe, 1, p.robeD]), { sh: rgba(p.robeD, 0.6), shw: 8, hi: rgba(p.robeL, 0.5), hiw: 1.6, line: p.line, lw: 2 });
        // patches & stitches
        c.fillStyle = rgba(shade(p.robe, 0.15), 1); c.fillRect(-20, -50, 12, 10);
        c.strokeStyle = rgba(p.robeD, 0.9); c.lineWidth = 1; c.setLineDash([2, 2]); c.strokeRect(-20, -50, 12, 10); c.setLineDash([]);
        c.strokeStyle = rgba(p.robeD, 0.7); c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-6, -84); c.quadraticCurveTo(10, -60, 6, -10); c.moveTo(18, -78); c.quadraticCurveTo(22, -40, 18, -8); c.stroke();
        // rope belt
        c.strokeStyle = p.robeD; c.lineWidth = 4;
        c.beginPath(); c.moveTo(-34, -48); c.quadraticCurveTo(0, -40, 30, -50); c.stroke();
        // fur at the neck
        const nf = blob([[-18, -88], [0, -96], [20, -90], [16, -80], [-14, -78]]);
        paint(c, nf, p.fur, { line: p.line, lw: 1.4 });
        hatch(c, nf, 30, 5, [-18, -96, 40, 20], rgba(p.furD, 0.6), 1, 4, 1.6);
      });
      blit(ctx, body);
      // head (live)
      ctx.save();
      ctx.translate(14, -90);
      ctx.scale(1.35, 1.35);
      ctx.rotate(0.25 + sniff * 0.02 + P.reach * 0.2 - P.hurt * 0.3);
      // big round ears
      for (const [x, y, s] of [[-12, -16, 0.85], [6, -20, 1]]) {
        paint(ctx, ell(x, y, 11 * s, 12 * s, -0.3), p.fur, { line: p.line, lw: 1.4 });
        ctx.fillStyle = p.pink; ctx.beginPath(); ctx.ellipse(x + 1, y + 1, 7 * s, 8 * s, -0.3, 0, TAU); ctx.fill();
      }
      const hd = new Path2D();
      hd.moveTo(-16, 4); hd.bezierCurveTo(-18, -16, 0, -20, 14, -12);
      hd.bezierCurveTo(26, -6, 38, 0, 44 + sniff, 4);
      hd.bezierCurveTo(36, 10, 10, 16, -6, 14); hd.closePath();
      paint(ctx, hd, rg(ctx, 4, -8, 2, 6, 0, 36, [0, p.furL, 0.5, p.fur, 1, p.furD]), { sh: rgba(p.furD, 0.6), shw: 5, hi: rgba(p.furL, 0.6), hiw: 1.4, line: p.line, lw: 1.6 });
      hatch(ctx, hd, 30, 9, [-16, -18, 40, 30], rgba(p.furD, 0.5), 1, 5, 2.8, 0.5);
      paint(ctx, circle(44 + sniff, 4, 3.2), p.pink, { line: p.pinkD, lw: 1 });
      // whiskers
      ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 0.9;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(36, 5 + i * 1.5); ctx.quadraticCurveTo(48, 2 + i * 3 + sniff, 60, -2 + i * 6 + sniff); ctx.stroke(); }
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 16, -4, 3, p.eye, 0.9 + 0.1 * sin(t * 6), '#ffd0d0', 3 * ef);
      // buck teeth
      const mo = P.atk * 5 + P.cast * 3;
      ctx.fillStyle = '#2a0a0a'; ctx.beginPath(); ctx.ellipse(34, 10 + mo * 0.3, 5, 1.5 + mo * 0.6, 0.2, 0, TAU); ctx.fill();
      paint(ctx, poly([[33, 8], [38, 8], [37.5, 15], [33.5, 15]]), p.teeth, { line: shade(p.teeth, -0.6), lw: 0.8 });
      ctx.restore();
      // arms: one clutching coin string, one clawing forward
      const sh = [18, -78];
      const reach = P.reach;
      const hn = [sh[0] + 24 + reach * 26, sh[1] + 10 - reach * 10 + sin(t * 2) * 2];
      limb(ctx, [sh, [sh[0] + 12, sh[1] + 12], hn], 11, 7, p.robe, { hi: rgba(p.robeL, 0.5), hiw: 1, line: p.line, lw: 1.4 });
      ctx.save(); ctx.translate(hn[0], hn[1]);
      paint(ctx, ell(2, 0, 5, 4), p.pink, { line: p.pinkD, lw: 1 });
      for (let k = 0; k < 4; k++) claw(ctx, 5, -3 + k * 2, 0.1 + reach * 0.5, 9, 2.4, '#f6eedc', p.line);
      ctx.restore();
      // coin string held in back hand
      const ch = [-34, -50];
      limb(ctx, [[-16, -80], [-34, -70], ch], 10, 7, shade(p.robe, -0.2), { line: p.line, lw: 1.3 });
      paint(ctx, ell(ch[0], ch[1], 5, 4), p.pinkD, { line: p.line, lw: 1 });
      ctx.strokeStyle = '#7a3a1a'; ctx.lineWidth = 1.4;
      const swing = sin(t * 2.4) * 4;
      ctx.beginPath(); ctx.moveTo(ch[0], ch[1]); ctx.quadraticCurveTo(ch[0] - 6 + swing, ch[1] + 20, ch[0] - 2 + swing * 1.4, ch[1] + 40); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const u = (i + 1) / 7;
        const x = U.lerp(ch[0], ch[0] - 2 + swing * 1.4, u) - sin(u * PI) * 3, y = U.lerp(ch[1], ch[1] + 40, u);
        paint(ctx, ell(x, y, 5.2, 2.6), lg(ctx, x, y - 3, x, y + 3, [0, shade(p.coin, 0.4), 1, p.coinD]), { line: p.coinD, lw: 0.8 });
        ctx.fillStyle = p.coinD; ctx.fillRect(x - 1.2, y - 0.6, 2.4, 1.2);
      }
      glow(ctx, ch[0] - 2, ch[1] + 24, 20, p.coin, 0.25 + 0.1 * sin(t * 3));
      ctx.restore();
      if (P.cast > 0) particles(8, t, 1, 131, (i, life, r) => {
        const x = (r(1) - 0.5) * 80, y = -life * 130;
        ctx.save(); ctx.globalAlpha *= sin(life * PI) * P.cast;
        paint(ctx, ell(x, y, 5, 2.6), p.coin, { line: p.coinD, lw: 0.8 }); ctx.restore();
        glow(ctx, x, y, 10, p.magic, sin(life * PI) * P.cast * 0.6);
      });
    },
  });

  // =============================================================================================
  // 河伯怨靈 river_wraith — grieving river-lord wraith rising from a whirlpool, reed crown, water hair
  def('river_wraith', {
    w: 150, h: 225,
    pal: {
      water: '#4ab0c8', waterD: '#123a5a', waterL: '#b8f4ff', face: '#d8eef0', faceD: '#7aa0b0', reed: '#8a9a4a', reedD: '#4a5a24',
      robe: '#2a5a7a', robeD: '#0e2238', robeL: '#6aa8c8', jade: '#7ae8b0', eye: '#e8ffff', fish: '#ff9a5a', line: '#082030', magic: '#7af0ff',
    },
    vars: [{ h: 90, s: 0.9, keep: ['fish', 'face', 'faceD'] }, { h: -170, s: 1.1, l: -0.06, keep: ['face', 'faceD'], set: { eye: '#ff8a7a', fish: '#7af0ff' } }],
    draw(ctx, t, o, p, P, v) {
      const sw = sin(t * 1.2);
      // whirlpool base
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const r = 70 - i * 14;
        ctx.strokeStyle = rgba(i % 2 ? p.waterL : p.water, 0.5 - i * 0.05); ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, -6, r, r * 0.22, 0, t * (1.5 + i * 0.5), t * (1.5 + i * 0.5) + PI * 1.3); ctx.stroke();
      }
      ctx.restore();
      // spiralling water column
      const col = new Path2D();
      col.moveTo(-40, -6);
      col.bezierCurveTo(-20, -30, -40 + sw * 6, -70, -34, -110);
      col.lineTo(30, -110);
      col.bezierCurveTo(30 + sw * 4, -70, 20, -30, 40, -6);
      col.quadraticCurveTo(0, 4, -40, -6); col.closePath();
      paint(ctx, col, lg(ctx, -40, 0, 40, 0, [0, rgba(p.water, 0.55), 0.5, rgba(p.waterL, 0.7), 1, rgba(p.waterD, 0.6)]), { line: rgba(p.waterL, 0.5), lw: 1.4 });
      ctx.save(); ctx.clip(col);
      ctx.strokeStyle = rgba(p.waterL, 0.6); ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = -((t * 40 + i * 20) % 120);
        ctx.beginPath(); ctx.ellipse(0, y, 36, 6, 0, 0.1, PI - 0.1); ctx.stroke();
      }
      ctx.restore();
      // flowing water hair behind (live)
      for (let i = 0; i < 7; i++) {
        const sx = -6 - i * 3, sy = -176 + i * 3;
        const L = 40 + i * 8;
        const wv = sin(t * 1.8 + i * 0.6);
        paint(ctx, ribbon([[sx, sy], [sx - L * 0.3, sy + 16 + wv * 4], [sx - L * 0.6, sy + 44 + wv * 8], [sx - L * 0.8, sy + 80 + wv * 10]], 10, 2, 6),
          rgba(i % 2 ? p.water : p.waterL, 0.45), { line: rgba(p.waterD, 0.4), lw: 1 });
      }
      // robe torso (cached)
      ctx.save();
      ctx.translate(0, sin(t * 1.5) * 3);
      const body = part('river_wraith/body/' + v, 130, 240, 65, 232, (c) => {
        const rb = new Path2D();
        rb.moveTo(-26, -156); rb.bezierCurveTo(0, -164, 26, -158, 32, -136);
        rb.bezierCurveTo(40, -110, 34, -60, 26, -30); rb.quadraticCurveTo(0, -20, -30, -30);
        rb.bezierCurveTo(-40, -60, -42, -120, -26, -156); rb.closePath();
        paint(c, rb, lg(c, -30, -160, 30, -30, [0, p.robeL, 0.45, p.robe, 1, p.robeD]), { sh: rgba(p.robeD, 0.6), shw: 9, hi: rgba(p.robeL, 0.5), hiw: 1.8, rim: rgba(p.waterL, 0.6), line: p.line, lw: 2 });
        // official's robe details: wide collar, jade belt
        c.strokeStyle = p.robeL; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-18, -156); c.quadraticCurveTo(10, -130, 24, -104); c.stroke();
        c.fillStyle = p.robeD; c.fillRect(-34, -100, 68, 8);
        for (let i = 0; i < 5; i++) paint(c, new Path2D((() => { const pp = new Path2D(); pp.roundRect(-28 + i * 12, -101, 8, 10, 2); return pp; })()), p.jade, { line: shade(p.jade, -0.5), lw: 0.8 });
        // wave embroidery hem
        c.strokeStyle = rgba(p.waterL, 0.6); c.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-22 + i * 15, -40, 6, PI, TAU); c.stroke(); c.beginPath(); c.arc(-22 + i * 15, -40, 3, PI, TAU); c.stroke(); }
        fadeOut(c, -60, -70, 120, -26);
        // pale face mask
        const fc = blob([[-12, -186], [6, -194], [22, -184], [24, -166], [14, -152], [-4, -152], [-14, -164]]);
        paint(c, fc, rg(c, 6, -180, 2, 6, -172, 26, [0, '#ffffff', 0.5, p.face, 1, p.faceD]), { sh: rgba(p.faceD, 0.6), shw: 5, line: p.line, lw: 1.6 });
        // long beard of water
        for (let i = 0; i < 5; i++) {
          paint(c, ribbon([[0 + i * 4, -156], [2 + i * 4, -140], [-2 + i * 5, -118 + i * 2]], 5, 1.5, 4), rgba(p.waterL, 0.8), { line: rgba(p.waterD, 0.5), lw: 0.8 });
        }
        // reed crown
        for (let i = 0; i < 7; i++) {
          const x = -12 + i * 5.5, a = -PI / 2 + (i - 3) * 0.18;
          const l = 22 + (i % 2) * 10;
          c.strokeStyle = i % 2 ? p.reed : p.reedD; c.lineWidth = 2.4;
          c.beginPath(); c.moveTo(x, -188); c.quadraticCurveTo(x + cos(a) * l * 0.5 + 2, -188 + sin(a) * l * 0.5, x + cos(a) * l, -188 + sin(a) * l); c.stroke();
          if (i % 2 === 0) paint(c, ell(x + cos(a) * l, -188 + sin(a) * l - 3, 2.6, 6, a + PI / 2), '#7a4a2a', { line: p.line, lw: 0.8 });
        }
        c.fillStyle = p.reedD; c.fillRect(-14, -192, 38, 5);
      });
      blit(ctx, body);
      // face features (live): weeping eyes
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      ctx.fillStyle = p.waterD;
      ctx.beginPath(); ctx.ellipse(4, -174, 4.5, 3.4 * ef + 0.6, -0.15, 0, TAU); ctx.ellipse(17, -174, 3.8, 3 * ef + 0.6, 0.15, 0, TAU); ctx.fill();
      eye(ctx, 4.5, -174, 1.8, p.eye, 0.9, '#ffffff', 1.6 * ef);
      eye(ctx, 17.5, -174, 1.5, p.eye, 0.85, '#ffffff', 1.4 * ef);
      ctx.strokeStyle = rgba(p.faceD, 0.9); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -180); ctx.lineTo(8, -178); ctx.moveTo(14, -178); ctx.lineTo(22, -180); ctx.stroke();
      ctx.fillStyle = p.waterD; ctx.beginPath(); ctx.ellipse(13, -160, 3.4, 1.4 + P.atk * 3 + P.cast * 4, 0, 0, TAU); ctx.fill();
      drips(ctx, [[4, -170], [17, -170]], t, p.waterL, 141, 22, 0.7);
      ctx.restore();
      // water arms (live): reaching / casting
      for (const [back, sx] of [[true, -22], [false, 24]]) {
        const k = back ? P.cast : max(P.reach, P.cast);
        const sh = [sx, -140];
        const hn = back ? [sx - 34 + sw * 4, -100 - k * 50] : [sx + 36 + P.reach * 50 + sw * 3, -110 - P.cast * 50 + sin(t * 1.7) * 6];
        const el = [U.lerp(sh[0], hn[0], 0.5) + (back ? -10 : 6), U.lerp(sh[1], hn[1], 0.5) + 14];
        paint(ctx, ribbon([sh, el, hn], 16, 8, 6), lg(ctx, sh[0], sh[1], hn[0], hn[1], [0, rgba(p.robe, 0.95), 0.5, rgba(p.water, 0.75), 1, rgba(p.waterL, 0.85)]), { line: rgba(p.waterD, 0.6), lw: 1.4 });
        ctx.save(); ctx.translate(hn[0], hn[1]); ctx.rotate(Math.atan2(hn[1] - el[1], hn[0] - el[0]));
        for (let f = 0; f < 4; f++) {
          const a = -0.5 + f * 0.33;
          paint(ctx, ribbon([[0, 0], [cos(a) * 9, sin(a) * 9], [cos(a + 0.4) * 16, sin(a + 0.4) * 16]], 4, 1, 4), rgba(p.waterL, 0.85), { line: rgba(p.waterD, 0.5), lw: 0.8 });
        }
        ctx.restore();
        if (k > 0) glow(ctx, hn[0], hn[1], 26, p.magic, k * 0.6);
      }
      // ghost carp circling
      for (let i = 0; i < 3; i++) {
        const a = t * 0.9 + i * TAU / 3;
        const x = cos(a) * 66, y = -60 + sin(a) * 18 - i * 30;
        const dir = -sin(a) >= 0 ? 1 : -1;
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.globalAlpha *= sin(a) > 0 ? 0.9 : 0.45;
        const fsh = new Path2D(); fsh.moveTo(10, 0); fsh.quadraticCurveTo(2, -6, -8, -1); fsh.lineTo(-14, -5); fsh.lineTo(-12, 0); fsh.lineTo(-14, 5); fsh.lineTo(-8, 1); fsh.quadraticCurveTo(2, 6, 10, 0);
        paint(ctx, fsh, p.fish, { line: shade(p.fish, -0.5), lw: 0.8 });
        glow(ctx, 0, 0, 14, p.fish, 0.4);
        ctx.restore();
      }
    },
  });

  // =============================================================================================
  // 紙紮人 paper_effigy — funeral paper figure: painted face, bright paper clothes, bamboo frame
  def('paper_effigy', {
    w: 100, h: 185,
    pal: {
      top: '#d8303a', topD: '#7a1018', topL: '#ff8a8a', pants: '#2a8a5a', pantsD: '#0e4a2a', trim: '#f0c84a', face: '#f8f2e4', faceD: '#c8bca4',
      cheek: '#ff6a8a', hair: '#141418', lips: '#d81a3a', bamboo: '#c8a46a', eye: '#141418', glint: '#ff3a3a', line: '#3a1418', magic: '#ff6a6a',
    },
    vars: [{ h: 200, s: 0.9, keep: ['face', 'faceD', 'hair', 'bamboo', 'eye', 'trim', 'cheek', 'lips'] }, { h: 0, s: 0, l: 0.25, keep: ['hair', 'bamboo', 'eye', 'cheek', 'lips', 'line'], set: { glint: '#7affff', magic: '#7affff', trim: '#9a9a9a' } }],
    draw(ctx, t, o, p, P, v) {
      // stiff rocking, occasional unnerving head-snap
      const rock = sin(t * 1.3) * 0.035;
      const snapPh = (t % 5.3);
      const snap = snapPh > 4.6 ? (snapPh < 4.7 ? (snapPh - 4.6) * 10 : snapPh < 5.1 ? 1 : 1 - (snapPh - 5.1) * 5) : 0;
      const lurch = P.reach;
      ctx.rotate(rock + lurch * 0.12 - P.hurt * 0.2);
      const hover = sin(t * 2) * 2 + 4;
      ctx.translate(0, -hover);
      // paper stand base
      const body = part('paper_effigy/body/' + v, 110, 170, 55, 166, (c) => {
        // stand
        const st = new Path2D(); st.roundRect(-30, -10, 60, 10, 2);
        paint(c, st, p.bamboo, { line: shade(p.bamboo, -0.6), lw: 1.2 });
        // trousers (flat paper)
        const pn = poly([[-22, -76], [22, -76], [26, -10], [4, -10], [0, -50], [-4, -10], [-26, -10]]);
        paint(c, pn, lg(c, -22, 0, 22, 0, [0, p.pants, 0.7, shade(p.pants, 0.1), 1, p.pantsD]), { hi: rgba('#ffffff', 0.3), hiw: 1.2, line: p.pantsD, lw: 1.4 });
        // printed pattern
        c.save(); c.clip(pn);
        c.fillStyle = rgba(p.trim, 0.6);
        for (let i = 0; i < 12; i++) { const x = -22 + (i % 4) * 14, y = -70 + Math.floor(i / 4) * 20; c.beginPath(); c.arc(x + 4, y, 2.2, 0, TAU); c.fill(); }
        c.restore();
        c.fillStyle = p.trim; c.fillRect(-26, -14, 22, 3); c.fillRect(4, -14, 22, 3);
        // tunic: straight, flat-folded paper
        const tn = poly([[-24, -132], [24, -132], [30, -70], [-30, -70]]);
        paint(c, tn, lg(c, -24, -132, 24, -70, [0, p.topL, 0.35, p.top, 1, p.topD]), { hi: rgba('#ffffff', 0.35), hiw: 1.3, line: p.topD, lw: 1.5 });
        c.save(); c.clip(tn);
        // crease lines
        c.strokeStyle = rgba(p.topD, 0.5); c.lineWidth = 1;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-18 + i * 12, -132); c.lineTo(-20 + i * 13.5, -70); c.stroke(); }
        // gold 壽 / cloud paper cutting
        c.strokeStyle = p.trim; c.lineWidth = 1.5;
        c.beginPath(); c.arc(0, -100, 10, 0, TAU); c.stroke();
        c.beginPath(); c.moveTo(-6, -106); c.lineTo(6, -106); c.moveTo(-7, -100); c.lineTo(7, -100); c.moveTo(-6, -94); c.lineTo(6, -94); c.moveTo(0, -109); c.lineTo(0, -91); c.stroke();
        c.restore();
        c.fillStyle = p.trim; c.fillRect(-30, -74, 60, 4);
        c.strokeStyle = p.trim; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-12, -132); c.lineTo(0, -118); c.lineTo(12, -132); c.stroke();
        // torn spot showing the bamboo frame
        const tear = blob([[12, -92], [22, -96], [26, -84], [18, -78], [10, -82]]);
        c.fillStyle = '#1a1014'; c.fill(tear);
        c.save(); c.clip(tear);
        c.strokeStyle = p.bamboo; c.lineWidth = 2;
        c.beginPath(); c.moveTo(8, -88); c.lineTo(28, -88); c.moveTo(18, -100); c.lineTo(18, -74); c.stroke();
        c.restore();
        c.strokeStyle = rgba(p.topL, 0.9); c.lineWidth = 1; c.stroke(tear);
        // neck stick
        c.fillStyle = p.bamboo; c.fillRect(-2, -140, 4, 10);
      });
      blit(ctx, body);
      // stiff tube arms (live)
      for (const [back, sx] of [[true, -24], [false, 24]]) {
        const a = back ? 0.25 + sin(t * 1.3) * 0.03 : 0.2 - lurch * 1.5 + P.wind * 0.3 - P.cast * 1.2;
        ctx.save(); ctx.translate(sx, -126); ctx.rotate(back ? a : -a + 0.4);
        const arm = new Path2D(); arm.roundRect(-7, -4, 14, 50, 4);
        paint(ctx, arm, lg(ctx, -7, 0, 7, 0, [0, back ? p.topD : p.topL, 0.5, back ? shade(p.top, -0.2) : p.top, 1, p.topD]), { line: p.topD, lw: 1.3 });
        ctx.fillStyle = p.trim; ctx.fillRect(-7, 40, 14, 3);
        paint(ctx, ell(0, 52, 5, 6), p.face, { line: p.faceD, lw: 1 });
        ctx.restore();
      }
      // head (live): flat, painted, uncanny
      ctx.save();
      ctx.translate(0, -146);
      ctx.rotate(snap * 0.45 + P.hurt * 0.3);
      // hair buns & bangs
      paint(ctx, circle(-14, -32, 8), p.hair, { line: '#000', lw: 1 });
      paint(ctx, circle(14, -32, 8), p.hair, { line: '#000', lw: 1 });
      const hd = ell(0, -14, 19, 21);
      paint(ctx, hd, rg(ctx, -4, -20, 2, 0, -14, 24, [0, '#ffffff', 0.6, p.face, 1, p.faceD]), { line: p.faceD, lw: 1.4 });
      ctx.save(); ctx.clip(hd);
      ctx.fillStyle = p.hair;
      ctx.beginPath(); ctx.moveTo(-22, -40); ctx.lineTo(22, -40); ctx.lineTo(22, -22); ctx.quadraticCurveTo(0, -30, -22, -22); ctx.fill();
      ctx.restore();
      ctx.fillStyle = p.trim; ctx.beginPath(); ctx.arc(0, -36, 3, 0, TAU); ctx.fill();
      // painted cheeks
      glow(ctx, -10, -8, 9, p.cheek, 0.0);
      ctx.fillStyle = rgba(p.cheek, 0.7);
      ctx.beginPath(); ctx.arc(-10, -8, 5, 0, TAU); ctx.arc(10, -8, 5, 0, TAU); ctx.fill();
      // thin painted brows & dot eyes (pupils follow the party)
      ctx.strokeStyle = p.hair; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-12, -21); ctx.quadraticCurveTo(-7, -24, -2, -21); ctx.moveTo(2, -21); ctx.quadraticCurveTo(7, -24, 12, -21); ctx.stroke();
      ctx.fillStyle = p.eye;
      ctx.beginPath(); ctx.ellipse(-7, -15, 3, 2.2, 0, 0, TAU); ctx.ellipse(7, -15, 3, 2.2, 0, 0, TAU); ctx.fill();
      const look = 1 + snap * 0.6 + P.atk;
      eye(ctx, -6 + look * 0.4, -15, 0.9, p.glint, 0.9, '#ffffff');
      eye(ctx, 8 + look * 0.4, -15, 0.9, p.glint, 0.9, '#ffffff');
      // painted smile (fixed), red lips
      ctx.fillStyle = p.lips;
      ctx.beginPath(); ctx.moveTo(-5, -3); ctx.quadraticCurveTo(0, 1 + P.atk * 3, 5, -3); ctx.quadraticCurveTo(0, -1, -5, -3); ctx.fill();
      ctx.restore();
      if (P.cast > 0) {
        particles(8, t, 0.8, 151, (i, life, r) => {
          // burning joss-paper scraps
          const x = (r(1) - 0.5) * 90, y = -40 - life * 140;
          ctx.save(); ctx.globalAlpha *= sin(life * PI) * P.cast; ctx.translate(x, y); ctx.rotate(life * 6 + i);
          ctx.fillStyle = p.trim; ctx.fillRect(-4, -3, 8, 6);
          ctx.restore();
          glow(ctx, x, y, 10, p.magic, sin(life * PI) * P.cast * 0.6);
        });
      }
    },
  });

  // =============================================================================================
  // 椅仔姑 chair_spirit — an old bamboo chair carrying a pale, sad little girl spirit (lost, not evil)
  def('chair_spirit', {
    w: 175, h: 240,
    pal: {
      bamboo: '#c8a060', bambooD: '#6a4a24', bambooL: '#f0d8a0', lash: '#8a5a2a', skin: '#e8f2f6', skinD: '#9ab4c8',
      dress: '#cfe4f2', dressD: '#7a9ab8', dressL: '#ffffff', hair: '#141a24', hairL: '#3a4a64', eye: '#2a3a52', tear: '#bff4ff',
      glow: '#a8e4ff', line: '#3a2a18', magic: '#bfe8ff',
    },
    vars: [{ h: 0, s: 1, keep: ['skin', 'skinD', 'hair', 'hairL', 'eye'], set: { dress: '#f2d6e4', dressD: '#b07a98', glow: '#ffb8e0', tear: '#ffd8f0', magic: '#ffc8e8' } }, { h: 0, s: 1, set: { bamboo: '#6a6a72', bambooD: '#2a2a32', bambooL: '#a8a8b4', lash: '#3a3a44', dress: '#d8f2d0', dressD: '#7aa880', glow: '#b8ffc8', magic: '#b8ffc8' } }],
    draw(ctx, t, o, p, P, v) {
      // the chair rocks & lifts on its own
      ctx.scale(1.12, 1.12);
      const rockA = sin(t * 1.3) * 0.04 + P.reach * 0.1 - P.hurt * 0.12;
      const lift = abs(sin(t * 1.3)) * 4 + P.cast * 10 + P.reach * 8;
      glow(ctx, 0, -110, 120, p.glow, 0.16 + 0.05 * sin(t * 2));
      ctx.save();
      ctx.translate(0, -lift);
      ctx.rotate(rockA);
      const chair = part('chair_spirit/chair/' + v, 180, 220, 90, 212, (c) => {
        const bam = (x0, y0, x1, y1, w, nodes, dark) => {
          const pth = ribbon([[x0, y0], [x1, y1]], w, w, 2);
          const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
          const nx = -dy / d * w / 2, ny = dx / d * w / 2;
          paint(c, pth, lg(c, x0 + nx, y0 + ny, x0 - nx, y0 - ny, [0, dark ? p.bambooD : p.bambooL, 0.4, dark ? shade(p.bamboo, -0.3) : p.bamboo, 1, p.bambooD]), { line: p.line, lw: 1.3 });
          for (let i = 1; i <= nodes; i++) {
            const u = i / (nodes + 1), x = U.lerp(x0, x1, u), y = U.lerp(y0, y1, u);
            c.strokeStyle = rgba(p.bambooD, 0.9); c.lineWidth = 1.6;
            c.beginPath(); c.moveTo(x + nx, y + ny); c.lineTo(x - nx, y - ny); c.stroke();
          }
        };
        // back legs & back posts (far side)
        bam(-48, -84, -46, -4, 7, 1, true);
        bam(24, -84, 26, -6, 7, 1, true);
        // backrest posts (tall)
        bam(-52, -82, -60, -196, 8, 3, true);
        bam(-12, -88, -20, -200, 8, 3, false);
        // backrest slats
        for (let i = 0; i < 4; i++) {
          const y = -110 - i * 22;
          bam(-58 + i * 0.2, y + 2, -18 - i * 0.2, y - 4, 5, 0, i % 2 === 1);
        }
        // seat (slats seen from 3/4 above)
        const seat = poly([[-48, -86], [24, -92], [52, -72], [-24, -64]]);
        paint(c, seat, lg(c, 0, -92, 0, -64, [0, p.bambooL, 1, p.bamboo]), { line: p.line, lw: 1.5 });
        c.save(); c.clip(seat);
        c.strokeStyle = rgba(p.bambooD, 0.6); c.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) { const u = i / 8; c.beginPath(); c.moveTo(U.lerp(-48, -24, u), U.lerp(-86, -64, u)); c.lineTo(U.lerp(24, 52, u), U.lerp(-92, -72, u)); c.stroke(); }
        c.restore();
        // seat front rail and front legs
        bam(-26, -62, 54, -70, 8, 0, false);
        bam(-24, -64, -22, 0, 8, 1, false);
        bam(50, -70, 52, -4, 8, 1, false);
        // stretchers
        bam(-22, -24, 52, -30, 5, 0, false);
        // lashings
        c.fillStyle = p.lash;
        for (const [x, y] of [[-24, -64], [50, -70], [-22, -24], [52, -30], [-56, -110], [-18, -114]]) { c.beginPath(); c.ellipse(x, y, 5, 3, 0, 0, TAU); c.fill(); }
        // worn red cloth tied to the backrest
        const cl = new Path2D(); cl.moveTo(-60, -176); cl.quadraticCurveTo(-70, -160, -76, -140); cl.lineTo(-68, -142); cl.quadraticCurveTo(-64, -160, -56, -170); cl.closePath();
        paint(c, cl, '#a8343a', { line: '#4a1418', lw: 1 });
      });
      blit(ctx, chair);
      // girl spirit (live: breath, hair sway, translucent)
      ctx.save();
      const bob = sin(t * 1.7) * 2;
      ctx.translate(0, bob - 4);
      ctx.globalAlpha *= 0.9;
      // long hair behind, draping over the chair back
      const hs = sin(t * 1.1) * 4 + P.reach * 10;
      for (let i = 0; i < 9; i++) {
        const sx = -14 + i * 2.6, sy = -176;
        const L = 70 + U.hash(i, 1, 41) * 30;
        paint(ctx, ribbon([[sx, sy], [sx - 10 - i, sy + L * 0.35], [sx - 14 - i * 1.5 + hs * 0.5, sy + L * 0.7], [sx - 18 - i * 1.8 + hs, sy + L]], 9, 2, 6),
          i % 3 ? p.hair : p.hairL, { line: rgba('#000000', 0.4), lw: 0.8 });
      }
      // dangling legs
      for (const [x, k] of [[16, 0], [26, 1]]) {
        const sw2 = sin(t * 1.5 + k * 1.4) * 4;
        limb(ctx, [[x - 10, -84], [x + 10, -78], [x + 14 + sw2 * 0.4, -54], [x + 16 + sw2, -34]], 9, 6, k ? p.skin : p.skinD, { line: rgba(p.dressD, 0.8), lw: 1 });
        paint(ctx, ell(x + 18 + sw2, -32, 6, 3.4, 0.3), p.dressL, { line: rgba(p.dressD, 0.8), lw: 1 });
      }
      // dress body
      const dr = new Path2D();
      dr.moveTo(-14, -146); dr.bezierCurveTo(4, -152, 16, -146, 18, -132);
      dr.bezierCurveTo(22, -112, 30, -94, 40, -80);
      dr.quadraticCurveTo(10, -70, -24, -78);
      dr.bezierCurveTo(-26, -100, -24, -130, -14, -146); dr.closePath();
      paint(ctx, dr, lg(ctx, -20, -150, 30, -76, [0, p.dressL, 0.5, p.dress, 1, p.dressD]), { sh: rgba(p.dressD, 0.5), shw: 6, hi: rgba('#ffffff', 0.6), hiw: 1.6, rim: rgba(p.glow, 0.7), line: rgba(p.dressD, 0.9), lw: 1.5 });
      ctx.strokeStyle = rgba(p.dressD, 0.6); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-4, -146); ctx.quadraticCurveTo(8, -128, 14, -110); ctx.stroke();
      // hands folded on lap (raise on cast)
      const hr = P.cast;
      limb(ctx, [[-6, -138], [2, -112 - hr * 10], [16 + hr * 6, -104 - hr * 30]], 8, 6, p.dress, { line: rgba(p.dressD, 0.9), lw: 1.2 });
      paint(ctx, ell(18 + hr * 6, -103 - hr * 30, 5, 4), p.skin, { line: rgba(p.skinD, 0.9), lw: 1 });
      if (hr > 0) glow(ctx, 20, -110 - hr * 30, 24, p.magic, hr * 0.8);
      // head
      ctx.save();
      ctx.translate(4, -162);
      ctx.rotate(0.18 + sin(t * 0.8) * 0.04 - P.reach * 0.1);
      const hd = blob([[-12, -8], [-6, -18], [8, -18], [15, -8], [14, 6], [6, 13], [-6, 11], [-12, 2]]);
      paint(ctx, hd, rg(ctx, 2, -6, 2, 2, 0, 20, [0, '#ffffff', 0.5, p.skin, 1, p.skinD]), { line: rgba(p.skinD, 1), lw: 1.3 });
      // downcast sad eyes, tears
      ctx.strokeStyle = p.eye; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(2, -1, 3, 0.2, PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(11, -1, 2.4, 0.2, PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-1, -6); ctx.lineTo(4, -7.5); ctx.moveTo(9, -7.5); ctx.lineTo(13, -6); ctx.stroke();
      ctx.fillStyle = rgba(p.eye, 0.7); ctx.beginPath(); ctx.ellipse(8, 8, 2, 1, 0, 0, TAU); ctx.fill();
      drips(ctx, [[3, 2], [11.5, 2]], t * 0.6, p.tear, 161, 14, 0.8);
      // hair: center-parted fringe & curtains
      const hc = new Path2D();
      hc.moveTo(-14, 10); hc.bezierCurveTo(-18, -14, -6, -24, 6, -22); hc.bezierCurveTo(14, -20, 18, -12, 16, -4);
      hc.quadraticCurveTo(12, -12, 6, -14); hc.quadraticCurveTo(-4, -12, -6, -2); hc.quadraticCurveTo(-8, 6, -14, 10); hc.closePath();
      paint(ctx, hc, lg(ctx, 0, -22, 0, 10, [0, p.hairL, 1, p.hair]), { line: '#000', lw: 0.8 });
      ctx.fillStyle = p.hair;
      ctx.fill(ribbon([[15, -6], [17, 10], [16 + hs * 0.2, 30]], 5, 2, 4));
      // tiny white flower in her hair
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5; ctx.beginPath(); ctx.arc(-6 + cos(a) * 2.2, -16 + sin(a) * 2.2, 1.6, 0, TAU); ctx.fill(); }
      ctx.restore();
      ctx.restore();
      ctx.restore();
      // drifting pale motes
      particles(7, t, 0.25, 171, (i, life, r) => glow(ctx, (r(1) - 0.5) * 150, -20 - life * 200, 4 + r(2) * 3, p.glow, sin(life * PI) * 0.7));
    },
  });

  // =============================================================================================
  // 殭屍 jiangshi — hopping corpse in a Qing official robe, forehead talisman, arms outstretched
  def('jiangshi', {
    w: 105, h: 195,
    pal: {
      robe: '#1e2a4a', robeD: '#0a1024', robeL: '#4a5a8a', trim: '#6a2a2a', badge: '#c8a24a', skin: '#a8c4a0', skinD: '#5a7a5a', skinL: '#d8ecd0',
      hat: '#1a1a1a', tassel: '#c8202a', bead: '#e8c84a', talis: '#f2d24a', ink: '#c0181a', nail: '#3a3a2a', eye: '#e8ffd0', line: '#0a0c14', magic: '#b8ff8a',
    },
    vars: [{ h: 110, s: 0.9, keep: ['skin', 'skinD', 'skinL', 'talis', 'ink', 'hat', 'tassel', 'bead', 'eye'] }, { h: -150, s: 1.2, l: -0.02, keep: ['talis', 'ink', 'hat', 'bead'], set: { eye: '#ff6a5a', magic: '#ff6a5a' } }],
    draw(ctx, t, o, p, P, v) {
      // hop cycle: up in an arc, squash on landing
      const hp = (t * 1.1 + P.reach * 0.5) % 1;
      const hop = sin(hp * PI) * 16 * (1 - P.hurt);
      const squash = hp < 0.08 ? 1 - (0.08 - hp) * 1.2 : 1;
      ctx.scale(1 / squash, squash);
      ctx.translate(0, -hop);
      ctx.rotate(-P.hurt * 0.15 + P.reach * 0.05);
      const body = part('jiangshi/body/' + v, 110, 170, 55, 166, (c) => {
        // boots
        for (const x of [-10, 8]) {
          const b = new Path2D(); b.moveTo(x - 9, -14); b.lineTo(x + 9, -14); b.lineTo(x + 12, -2); b.quadraticCurveTo(x, 2, x - 10, -2); b.closePath();
          paint(c, b, lg(c, 0, -14, 0, 0, [0, '#3a3a3a', 1, '#0a0a0a']), { line: '#000', lw: 1.2 });
          c.fillStyle = '#e8e4d8'; c.fillRect(x - 10, -3, 22, 3);
        }
        // long robe
        const rb = new Path2D();
        rb.moveTo(-24, -130); rb.bezierCurveTo(0, -138, 22, -134, 28, -120);
        rb.lineTo(32, -14); rb.quadraticCurveTo(0, -8, -30, -14); rb.lineTo(-28, -120); rb.closePath();
        paint(c, rb, lg(c, -28, -130, 30, -14, [0, p.robeL, 0.4, p.robe, 1, p.robeD]), { sh: rgba(p.robeD, 0.7), shw: 9, hi: rgba(p.robeL, 0.5), hiw: 1.6, line: p.line, lw: 2 });
        // hem border & side slit
        c.fillStyle = p.trim; c.fillRect(-30, -22, 62, 7);
        c.strokeStyle = p.badge; c.lineWidth = 1; c.beginPath(); c.moveTo(-30, -21); c.lineTo(32, -21); c.stroke();
        c.strokeStyle = rgba(p.robeD, 0.8); c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(0, -60); c.lineTo(0, -15); c.moveTo(-14, -110); c.quadraticCurveTo(-18, -60, -16, -24); c.stroke();
        // rank badge 補子 with a crane
        const bd = new Path2D(); bd.rect(-14, -104, 30, 30);
        paint(c, bd, '#0e1838', { line: p.badge, lw: 2 });
        c.strokeStyle = p.badge; c.lineWidth = 1.2;
        c.beginPath(); c.arc(1, -89, 10, 0, TAU); c.stroke();
        c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(1, -89, 6, 3.4, -0.4, 0, TAU); c.fill();
        c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(5, -91); c.quadraticCurveTo(8, -97, 6, -100); c.stroke();
        c.fillStyle = p.tassel; c.beginPath(); c.arc(6, -100, 1.4, 0, TAU); c.fill();
        // court beads 朝珠
        c.strokeStyle = p.bead; c.lineWidth = 2.4; c.setLineDash([2.4, 1.4]);
        c.beginPath(); c.moveTo(-14, -130); c.quadraticCurveTo(-4, -100, 16, -130); c.stroke(); c.setLineDash([]);
        // collar
        c.fillStyle = p.robeD; c.beginPath(); c.ellipse(2, -130, 14, 5, 0, 0, TAU); c.fill();
        // neck
        c.fillStyle = p.skinD; c.fillRect(-4, -142, 12, 12);
      });
      blit(ctx, body);
      // head
      ctx.save();
      ctx.translate(2, -158);
      ctx.rotate(-0.04 + P.hurt * -0.2);
      const hd = blob([[-14, -6], [-10, -18], [6, -20], [16, -12], [16, 6], [8, 16], [-6, 16], [-14, 6]]);
      paint(ctx, hd, rg(ctx, 2, -8, 2, 2, 0, 22, [0, p.skinL, 0.5, p.skin, 1, p.skinD]), { sh: rgba(p.skinD, 0.6), shw: 5, line: p.line, lw: 1.5 });
      // sunken eyes, blank stare
      ctx.fillStyle = rgba(p.skinD, 0.9);
      ctx.beginPath(); ctx.ellipse(1, -1, 5, 3.6, 0, 0, TAU); ctx.ellipse(12, -1, 4, 3.2, 0, 0, TAU); ctx.fill();
      eye(ctx, 2, -1, 1.5, p.eye, 0.8, '#ffffff');
      eye(ctx, 12.5, -1, 1.2, p.eye, 0.7, '#ffffff');
      ctx.strokeStyle = p.skinD; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(4, 9); ctx.lineTo(12, 9); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(5, 9); ctx.lineTo(6.5, 9); ctx.lineTo(5.8, 11.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(10, 9); ctx.lineTo(11.5, 9); ctx.lineTo(10.8, 11.5); ctx.fill();
      // Qing official hat: conical with red silk fringe & top finial
      const hb = ell(1, -16, 22, 6);
      paint(ctx, hb, lg(ctx, 0, -22, 0, -10, [0, '#4a4a4a', 1, p.hat]), { line: '#000', lw: 1.2 });
      const cone = new Path2D(); cone.moveTo(-18, -18); cone.quadraticCurveTo(1, -40, 20, -18); cone.closePath();
      ctx.fillStyle = p.tassel; ctx.fill(cone);
      ctx.save(); ctx.clip(cone);
      ctx.strokeStyle = shade(p.tassel, -0.4); ctx.lineWidth = 1;
      for (let i = -9; i <= 9; i++) { ctx.beginPath(); ctx.moveTo(1, -36); ctx.lineTo(1 + i * 2.4, -16); ctx.stroke(); }
      ctx.restore();
      paint(ctx, circle(1, -36, 3.2), p.bead, { line: shade(p.bead, -0.6), lw: 1 });
      // peacock-feather plume at the back
      ctx.strokeStyle = '#2a6a5a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-12, -22); ctx.quadraticCurveTo(-28, -20, -34, -8); ctx.stroke();
      // forehead talisman (flaps)
      const fl = sin(t * 6) * 0.12 + P.hurt * 0.6 + hop * 0.01;
      ctx.save();
      ctx.translate(6, -12);
      const tal = new Path2D();
      tal.moveTo(-6, 0); tal.lineTo(6, 0);
      tal.quadraticCurveTo(8 + fl * 20, 14, 8 + fl * 34, 28);
      tal.lineTo(-4 + fl * 34, 30);
      tal.quadraticCurveTo(-4 + fl * 18, 16, -6, 0); tal.closePath();
      paint(ctx, tal, lg(ctx, 0, 0, 0, 30, [0, '#fff2a0', 1, p.talis]), { line: shade(p.talis, -0.5), lw: 1 });
      ctx.strokeStyle = p.ink; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(1 + fl * 4, 4); ctx.lineTo(2 + fl * 30, 26);
      ctx.moveTo(-1 + fl * 8, 8); ctx.lineTo(4 + fl * 10, 9);
      ctx.moveTo(fl * 16, 14); ctx.lineTo(5 + fl * 18, 15);
      ctx.moveTo(fl * 24, 20); ctx.lineTo(5 + fl * 26, 22);
      ctx.stroke();
      ctx.restore();
      ctx.restore();
      // arms stiffly outstretched forward
      const ar = P.reach * 10 - P.wind * 4 + P.cast * -6;
      for (const [back, y] of [[true, -126], [false, -120]]) {
        ctx.save();
        ctx.translate(back ? 10 : 18, y);
        ctx.rotate(-0.03 + sin(t * 1.1 + (back ? 0 : 1)) * 0.02 - P.cast * 0.3);
        // horseshoe-cuff sleeve
        const sl = new Path2D(); sl.moveTo(0, -8); sl.lineTo(40 + ar, -7); sl.lineTo(42 + ar, 9); sl.lineTo(0, 9); sl.closePath();
        paint(ctx, sl, lg(ctx, 0, -8, 0, 9, [0, back ? p.robe : p.robeL, 1, p.robeD]), { line: p.line, lw: 1.5 });
        const cuff = new Path2D(); cuff.moveTo(40 + ar, -8); cuff.quadraticCurveTo(52 + ar, -6, 50 + ar, 4); cuff.lineTo(42 + ar, 10); cuff.closePath();
        paint(ctx, cuff, p.trim, { line: p.line, lw: 1.2 });
        // hand drooping, long nails
        ctx.translate(50 + ar, 2);
        paint(ctx, blob([[-2, -4], [8, -4], [12, 2], [8, 8], [-2, 6]]), back ? p.skinD : p.skin, { line: p.line, lw: 1.2 });
        for (let f = 0; f < 4; f++) claw(ctx, 10, -2 + f * 2.6, 0.5 + f * 0.05, 10, 2, p.nail, '#000');
        ctx.restore();
      }
      if (P.cast > 0) glow(ctx, 8, -150, 50, p.magic, P.cast * 0.5);
      // corpse-qi wisps
      particles(5, t, 0.4, 181, (i, life, r) => soft(ctx, (r(1) - 0.5) * 50, -40 - life * 140, 10 + life * 14, p.magic, sin(life * PI) * 0.2));
    },
  });

  // =============================================================================================
  // 紙人 paper_servant — small white cut-paper doll, fluttering, folds and a red seal
  def('paper_servant', {
    w: 90, h: 150,
    pal: { paper: '#f6f2e8', paperD: '#b8b0a0', paperL: '#ffffff', ink: '#1a1a1e', seal: '#d0202a', glow: '#ffe8b0', line: '#6a6050', magic: '#ffdc8a' },
    vars: [{ set: { paper: '#f2d24a', paperD: '#b8902a', paperL: '#fff2a0', seal: '#c0181a', glow: '#ffd24a', line: '#7a5a10', magic: '#ffd24a' } }, { set: { paper: '#2a2a32', paperD: '#0e0e14', paperL: '#5a5a6a', ink: '#ff4a4a', seal: '#ff4a4a', glow: '#ff6a6a', line: '#000000', magic: '#ff6a6a' } }],
    draw(ctx, t, o, p, P, v) {
      const fl = sin(t * 3.4);
      const bob = sin(t * 2.1) * 6;
      ctx.translate(0, -22 + bob);
      // afterimage copies (spooky)
      const shape = part('paper_servant/doll/' + v, 90, 130, 45, 124, (c) => {
        const d = new Path2D();
        // head circle + body cut-out as one silhouette
        d.moveTo(0, -122);
        d.bezierCurveTo(13, -122, 17, -108, 12, -98);
        d.lineTo(10, -94);
        d.lineTo(34, -88); d.lineTo(42, -60); d.lineTo(32, -58); d.lineTo(24, -76);
        d.lineTo(22, -50); d.lineTo(30, -6); d.lineTo(10, -6); d.lineTo(0, -40);
        d.lineTo(-10, -6); d.lineTo(-30, -6); d.lineTo(-22, -50);
        d.lineTo(-24, -76); d.lineTo(-32, -58); d.lineTo(-42, -60); d.lineTo(-34, -88);
        d.lineTo(-10, -94); d.lineTo(-12, -98);
        d.bezierCurveTo(-17, -108, -13, -122, 0, -122);
        d.closePath();
        c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 6; c.shadowOffsetX = 2; c.shadowOffsetY = 3;
        c.fillStyle = p.paper; c.fill(d);
        c.shadowColor = 'transparent';
        c.save(); c.clip(d);
        // fibre texture & folds
        for (let i = 0; i < 60; i++) { c.fillStyle = rgba(p.paperD, 0.18); c.fillRect(-44 + U.hash(i, 1, 191) * 88, -124 + U.hash(i, 2, 191) * 120, 2 + U.hash(i, 3, 191) * 4, 0.8); }
        c.fillStyle = rgba(p.paperD, 0.35);
        c.beginPath(); c.moveTo(0, -94); c.lineTo(24, -76); c.lineTo(22, -50); c.lineTo(0, -40); c.closePath(); c.fill();
        c.strokeStyle = rgba(p.paperD, 0.8); c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -96); c.lineTo(0, -40); c.moveTo(-22, -50); c.lineTo(22, -50); c.stroke();
        c.restore();
        c.strokeStyle = p.line; c.lineWidth = 1.2; c.stroke(d);
        // cut-out face (holes)
        c.globalCompositeOperation = 'destination-out';
        c.beginPath(); c.ellipse(-4, -110, 2.6, 3.4, 0, 0, TAU); c.ellipse(6, -110, 2.6, 3.4, 0, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(-5, -103); c.quadraticCurveTo(1, -98, 7, -103); c.quadraticCurveTo(1, -100, -5, -103); c.fill();
        c.globalCompositeOperation = 'source-over';
        // red seal & ink talisman strokes
        c.fillStyle = p.seal; c.fillRect(-7, -82, 14, 14);
        c.strokeStyle = p.paperL; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(-4, -79); c.lineTo(4, -79); c.moveTo(0, -79); c.lineTo(0, -71); c.moveTo(-4, -75); c.lineTo(4, -71); c.stroke();
        c.strokeStyle = p.ink; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(0, -64); c.lineTo(0, -46); c.moveTo(-5, -60); c.lineTo(5, -58); c.moveTo(-4, -52); c.lineTo(4, -50); c.stroke();
      });
      for (let k = 2; k >= 1; k--) {
        ctx.save(); ctx.globalAlpha *= 0.12 * (3 - k) + P.cast * 0.15;
        ctx.translate(-k * 12 - P.reach * k * 10, sin(t * 2.1 - k * 0.5) * 4);
        ctx.transform(1, 0, sin(t * 3.4 - k) * 0.12, 1, 0, 0);
        blit(ctx, shape);
        ctx.restore();
      }
      glow(ctx, 0, -70, 60, p.glow, 0.18 + P.cast * 0.3);
      // main doll: flutter = horizontal squash + shear
      ctx.save();
      const sx = 0.86 + 0.14 * abs(cos(t * 1.7)) - P.hurt * 0.3;
      ctx.rotate(P.reach * 0.3 - P.wind * 0.15 + fl * 0.04);
      ctx.transform(sx, 0, fl * 0.1, 1, 0, 0);
      blit(ctx, shape);
      ctx.restore();
      // eyes glint through the holes
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, -4 * sx, -110, 1.3, p.glow, 0.7 * ef + 0.2 * sin(t * 4));
      eye(ctx, 6 * sx, -110, 1.3, p.glow, 0.7 * ef + 0.2 * sin(t * 4));
      // paper-edge slash on attack
      if (P.reach > 0.4) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(p.glow, (P.reach - 0.4) * 1.5); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(20, -70, 46, -1.2, 0.8); ctx.stroke();
        ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(20, -70, 54, -1.0, 0.6); ctx.stroke();
        ctx.restore();
      }
    },
  });

  // =============================================================================================
  // 吊死鬼 hanged_ghost — limp, swaying figure in white, long hair hiding the face, lolling tongue
  // (unsettling but not gory: the sway implies the rope, which it carries as a coil in its hands)
  def('hanged_ghost', {
    w: 110, h: 215,
    pal: {
      robe: '#dfe6ea', robeD: '#7a8a98', robeL: '#ffffff', skin: '#c8d8dc', skinD: '#7a9098', hair: '#0c0e14', hairL: '#2a3040',
      tongue: '#c83048', tongueD: '#6a1424', rope: '#a8885a', ropeD: '#5a4428', eye: '#d8f4ff', mist: '#9ab8d0', line: '#2a343e', magic: '#bfe0ff',
    },
    vars: [{ h: 0, s: 1, keep: ['skin', 'skinD', 'hair', 'hairL', 'tongue', 'tongueD', 'rope', 'ropeD'], set: { robe: '#c8d8b8', robeD: '#5a7a5a', mist: '#9ad8a0', eye: '#d8ffb0', magic: '#d8ffb0' } }, { h: 0, s: 1, keep: ['skin', 'skinD', 'hair', 'hairL', 'rope', 'ropeD'], set: { robe: '#8a1a2a', robeD: '#3a0810', robeL: '#d84a5a', mist: '#c85a6a', eye: '#ff9a9a', magic: '#ff6a7a' } }],
    draw(ctx, t, o, p, P, v) {
      // pendulum sway about a point far above
      const sway = sin(t * 0.9) * 0.05 + P.reach * 0.25 - P.hurt * 0.15;
      ctx.translate(0, -230);
      ctx.rotate(sway);
      ctx.translate(0, 230);
      // slow spin: subtle horizontal squash
      const spin = 0.92 + 0.08 * cos(t * 0.5);
      ctx.scale(spin, 1);
      soft(ctx, 0, -20, 40, p.mist, 0.25);
      const body = part('hanged_ghost/body/' + v, 120, 200, 60, 196, (c) => {
        // dangling feet, toes pointing down
        for (const [x, k] of [[-6, 0], [8, 1]]) {
          const ft = blob([[x - 5, -40], [x + 5, -40], [x + 6, -24], [x + 2, -14], [x - 3, -16], [x - 6, -26]]);
          paint(c, ft, lg(c, x, -40, x, -14, [0, p.skin, 1, p.skinD]), { line: p.line, lw: 1.2 });
        }
        // long white robe hanging limp
        const rb = new Path2D();
        rb.moveTo(-18, -150); rb.bezierCurveTo(0, -156, 18, -152, 22, -138);
        rb.bezierCurveTo(26, -110, 28, -70, 26, -44);
        rb.bezierCurveTo(14, -36, 4, -40, 0, -36);
        rb.bezierCurveTo(-6, -40, -18, -36, -26, -44);
        rb.bezierCurveTo(-28, -80, -28, -120, -18, -150); rb.closePath();
        paint(c, rb, lg(c, -24, -150, 26, -40, [0, p.robeL, 0.45, p.robe, 1, p.robeD]), { sh: rgba(p.robeD, 0.6), shw: 9, hi: rgba(p.robeL, 0.7), hiw: 1.8, line: p.line, lw: 1.8 });
        c.strokeStyle = rgba(p.robeD, 0.6); c.lineWidth = 1.4;
        for (const x of [-14, -4, 8, 18]) { c.beginPath(); c.moveTo(x * 0.6, -146); c.quadraticCurveTo(x + 2, -90, x, -44); c.stroke(); }
        // sash
        c.strokeStyle = rgba(p.robeD, 0.9); c.lineWidth = 3;
        c.beginPath(); c.moveTo(-26, -96); c.quadraticCurveTo(0, -90, 26, -96); c.stroke();
        c.beginPath(); c.moveTo(6, -93); c.quadraticCurveTo(10, -76, 6, -64); c.stroke();
        // hair hanging from the drooped head down the back & front
        for (let i = 0; i < 12; i++) {
          const x = -14 + i * 2.6;
          const L = 56 + U.hash(i, 1, 201) * 34;
          c.fillStyle = i % 3 ? p.hair : p.hairL;
          c.fill(ribbon([[x, -176], [x - 2 + (i - 6) * 0.6, -176 + L * 0.5], [x - 1 + (i - 6) * 1.1, -176 + L]], 6, 1.5, 4));
        }
      });
      blit(ctx, body);
      // head drooped to the side (live tilt); half the face hidden by a curtain of hair
      ctx.save();
      ctx.translate(4, -170);
      ctx.rotate(0.38 + sin(t * 0.7) * 0.05 - P.cast * 0.3);
      // back hair mass
      ctx.fillStyle = p.hair;
      ctx.beginPath(); ctx.ellipse(-3, -2, 17, 19, 0, 0, TAU); ctx.fill();
      const hd = blob([[-10, -10], [-4, -18], [8, -17], [15, -8], [15, 6], [9, 15], [-2, 16], [-9, 6]]);
      paint(ctx, hd, rg(ctx, 6, -4, 2, 4, 0, 20, [0, '#ffffff', 0.45, p.skin, 1, p.skinD]), { sh: rgba(p.skinD, 0.6), shw: 4, line: p.line, lw: 1.3 });
      // hollow eye with a pin of light, dark under-eye
      ctx.fillStyle = rgba(p.skinD, 0.9); ctx.beginPath(); ctx.ellipse(8, -1, 4.2, 3.6, 0.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a0c12'; ctx.beginPath(); ctx.ellipse(8, -1.5, 3, 2.6 * (P.hurt > 0.2 ? 0.4 : 1), 0, 0, TAU); ctx.fill();
      eye(ctx, 8.5, -1.5, 1, p.eye, 0.8 + 0.2 * sin(t * 2.3) + P.cast * 0.3, '#ffffff');
      // open mouth and long lolling tongue
      ctx.fillStyle = '#1a0a10'; ctx.beginPath(); ctx.ellipse(7, 9, 3.4, 2.4, 0.1, 0, TAU); ctx.fill();
      const tl = 30 + P.atk * 22 + sin(t * 1.2) * 2;
      const tg = ribbon([[7, 9], [9, 9 + tl * 0.5], [6 + sin(t) * 2, 9 + tl]], 5.5, 3.6, 5);
      paint(ctx, tg, lg(ctx, 0, 9, 0, 9 + tl, [0, p.tongueD, 0.3, p.tongue, 1, shade(p.tongue, 0.2)]), { hi: rgba('#ffb0c0', 0.5), hiw: 1, line: p.tongueD, lw: 1.1 });
      // hair: parted on top, curtain over the near half of the face
      const top = new Path2D(); top.moveTo(-18, 6); top.bezierCurveTo(-20, -22, 10, -28, 17, -8); top.quadraticCurveTo(8, -16, 2, -14); top.quadraticCurveTo(-4, -8, -6, 4); top.closePath();
      paint(ctx, top, lg(ctx, 0, -24, 0, 6, [0, p.hairL, 1, p.hair]), { line: '#000', lw: 0.8 });
      for (let i = 0; i < 6; i++) {
        const x = -6 + i * 2.4;
        ctx.fillStyle = i % 2 ? p.hair : p.hairL;
        const L = 40 + U.hash(i, 3, 207) * 26;
        ctx.fill(ribbon([[x, -12], [x - 1, 8], [x - 2 + sin(t * 0.9 + i) * 1.5, -12 + L]], 4.5, 1.2, 4));
      }
      ctx.restore();
      // limp arms with long sleeves; holding a rope coil
      const lift = P.reach * 0.9 + P.cast * 0.6;
      for (const [back, sx] of [[true, -18], [false, 20]]) {
        const hx = sx + (back ? -4 : 6) + (back ? 0 : lift * 40), hy = -70 - (back ? 0 : lift * 50) + sin(t * 0.9 + sx) * 2;
        const sl = ribbon([[sx, -146], [sx + (back ? -6 : 6), -116], [hx, hy]], 10, 15, 5);
        paint(ctx, sl, lg(ctx, sx - 10, 0, sx + 10, 0, [0, back ? p.robeD : p.robeL, 0.5, p.robe, 1, p.robeD]), { line: p.line, lw: 1.5 });
        paint(ctx, ell(hx, hy + 8, 4, 6), p.skin, { line: p.line, lw: 1 });
        if (!back) {
          // rope coil
          ctx.strokeStyle = p.ropeD; ctx.lineWidth = 4.5;
          ctx.beginPath(); ctx.ellipse(hx + 2, hy + 18, 10, 14, 0.2, 0, TAU); ctx.stroke();
          ctx.strokeStyle = p.rope; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(hx + 2, hy + 18, 10, 14, 0.2, 0, TAU); ctx.stroke();
          ctx.strokeStyle = p.ropeD; ctx.lineWidth = 1; ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.ellipse(hx + 2, hy + 18, 10, 14, 0.2, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = p.rope; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(hx + 6, hy + 30); ctx.quadraticCurveTo(hx + 10 + sin(t) * 4, hy + 50, hx + 4 + sin(t * 1.3) * 6, hy + 64); ctx.stroke();
          if (P.reach > 0.3) {
            ctx.beginPath(); ctx.moveTo(hx + 6, hy + 10); ctx.quadraticCurveTo(hx + 50, hy - 20, hx + 70 * P.reach, hy + 20); ctx.stroke();
          }
        }
      }
      ctx.restore();
      // cold mist
      wisps(ctx, 0, -40, 40, t, p.mist, 4, 30, 0.2, 9);
      if (P.cast > 0) glow(ctx, 0, -140, 70, p.magic, P.cast * 0.4);
    },
  });

  // =============================================================================================
  // 骷髏將 bone_general — skeleton general in rusted armour with a tattered cape and a halberd
  def('bone_general', {
    w: 150, h: 220,
    pal: {
      bone: '#e8dcc0', boneD: '#8a7a5a', boneL: '#fffaf0', rust: '#8a4a2a', rustD: '#3a1a0e', rustL: '#c88a5a', iron: '#5a5a5e',
      cape: '#6a1a22', capeD: '#2a060a', plume: '#b8202a', eye: '#b06aff', shaft: '#4a3424', blade: '#a8aeb4', line: '#1e140c', magic: '#b06aff',
    },
    vars: [{ h: 0, s: 1, keep: ['bone', 'boneD', 'boneL'], set: { eye: '#6aff9a', magic: '#6aff9a', cape: '#1a4a3a', capeD: '#06201a', plume: '#2aa86a' } }, { h: 0, s: 1, set: { eye: '#ff4a2a', magic: '#ff6a2a', rust: '#3a3a44', rustD: '#121218', rustL: '#8a8a9a', cape: '#1a1a24', capeD: '#050508', plume: '#d8d8e8' } }],
    draw(ctx, t, o, p, P, v) {
      const br = sin(t * 1.6) * 1.5;
      const rattle = P.hurt > 0 ? sin(t * 60) * P.hurt * 2 : 0;
      // tattered cape (live flutter)
      const cw = sin(t * 2.1);
      const cape = new Path2D();
      cape.moveTo(-20, -168 + br);
      cape.bezierCurveTo(-40, -130, -48 + cw * 4, -80, -56 + cw * 8, -26);
      for (let i = 0; i <= 6; i++) cape.lineTo(-56 + cw * 8 + i * 8, -26 - (i % 2 ? 14 : 0) + sin(t * 3 + i) * 3);
      cape.bezierCurveTo(-6, -80, 0, -130, 10, -168 + br); cape.closePath();
      paint(ctx, cape, lg(ctx, -40, -160, -20, -30, [0, p.cape, 1, p.capeD]), { sh: rgba(p.capeD, 0.6), shw: 6, line: p.line, lw: 1.6 });
      // halberd (behind front arm)
      const swing = P.reach, wind = P.wind;
      const hx = 40 + swing * 20 - wind * 8, hy = -116 + br;
      const ang = U.lerp(-1.5, 0.4, swing) - wind * 0.5 + sin(t * 1.6) * 0.02;
      ctx.save();
      ctx.translate(hx, hy); ctx.rotate(ang);
      ctx.fillStyle = p.shaft; ctx.fillRect(-90, -3, 196, 6);
      ctx.fillStyle = rgba('#ffffff', 0.15); ctx.fillRect(-90, -3, 196, 2);
      ctx.strokeStyle = p.rust; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-10 + i * 4, -3); ctx.lineTo(-8 + i * 4, 3); ctx.stroke(); }
      // spear tip
      const tip = new Path2D(); tip.moveTo(104, -5); tip.quadraticCurveTo(124, -3, 138, 0); tip.quadraticCurveTo(124, 3, 104, 5); tip.closePath();
      paint(ctx, tip, lg(ctx, 104, -5, 104, 5, [0, '#ffffff', 0.5, p.blade, 1, shade(p.blade, -0.4)]), { line: shade(p.blade, -0.7), lw: 1.2 });
      // crescent side blade (戟)
      const cb = new Path2D(); cb.moveTo(90, 3); cb.quadraticCurveTo(100, 22, 88, 40); cb.quadraticCurveTo(108, 30, 104, 3); cb.closePath();
      paint(ctx, cb, lg(ctx, 90, 0, 104, 40, [0, p.blade, 0.6, shade(p.blade, -0.2), 1, p.rust]), { line: shade(p.blade, -0.7), lw: 1.2 });
      ctx.fillStyle = p.rust; ctx.fillRect(86, -6, 18, 12);
      ctx.fillStyle = p.plume;
      for (let i = 0; i < 4; i++) ctx.fill(ribbon([[86, -4], [80 - i * 2, -14 - i * 2 + sin(t * 3 + i) * 2], [72 - i * 3, -24 - i * 2]], 3, 1, 4));
      if (swing > 0.5) glow(ctx, 120, 0, 30, p.magic, (swing - 0.5) * 1.4);
      ctx.restore();
      ctx.save();
      ctx.translate(rattle, br);
      const body = part('bone_general/body/' + v, 140, 200, 70, 196, (c) => {
        const bone = (pts, w0, w1) => limb(c, pts, w0, w1, lg(c, pts[0][0] - 6, 0, pts[0][0] + 6, 0, [0, p.boneL, 0.5, p.bone, 1, p.boneD]), { line: p.line, lw: 1.3 });
        // legs: femur/tibia bones with joints, rusted greaves & sabatons
        for (const [x, back] of [[-12, true], [12, false]]) {
          bone([[x, -88], [x + 2, -54]], 7, 6);
          paint(c, circle(x + 2, -54, 5), p.bone, { line: p.line, lw: 1.2 });
          const gr = new Path2D(); gr.moveTo(x - 7, -50); gr.lineTo(x + 9, -50); gr.lineTo(x + 8, -10); gr.lineTo(x - 6, -10); gr.closePath();
          paint(c, gr, lg(c, x - 7, 0, x + 9, 0, [0, back ? p.rustD : p.rustL, 0.5, p.rust, 1, p.rustD]), { line: p.line, lw: 1.3 });
          const sb = new Path2D(); sb.moveTo(x - 8, -12); sb.lineTo(x + 10, -12); sb.lineTo(x + 18, -2); sb.lineTo(x - 8, -1); sb.closePath();
          paint(c, sb, p.iron, { line: p.line, lw: 1.2 });
        }
        // armour skirt
        for (let i = 0; i < 4; i++) {
          const x = -26 + i * 13;
          const sk = new Path2D(); sk.roundRect(x, -100, 14, 30, 2);
          paint(c, sk, lg(c, x, -100, x, -70, [0, p.rustL, 0.4, p.rust, 1, p.rustD]), { line: p.line, lw: 1.2 });
          c.strokeStyle = rgba(p.rustD, 0.8); c.lineWidth = 1;
          for (let r = 0; r < 3; r++) { c.beginPath(); c.moveTo(x + 1, -92 + r * 8); c.lineTo(x + 13, -92 + r * 8); c.stroke(); }
        }
        // spine & ribs visible above the belt
        bone([[0, -104], [2, -124]], 6, 6);
        for (let i = 0; i < 4; i++) {
          c.strokeStyle = p.line; c.lineWidth = 5.2;
          c.beginPath(); c.moveTo(1, -122 + i * 6); c.quadraticCurveTo(18, -126 + i * 6, 20, -116 + i * 6); c.stroke();
          c.strokeStyle = p.bone; c.lineWidth = 3.2;
          c.beginPath(); c.moveTo(1, -122 + i * 6); c.quadraticCurveTo(18, -126 + i * 6, 20, -116 + i * 6); c.stroke();
        }
        // rusted breastplate (left half covers ribs, broken)
        const bp = new Path2D();
        bp.moveTo(-24, -160); bp.bezierCurveTo(-4, -166, 20, -164, 26, -150); bp.lineTo(22, -134); bp.lineTo(12, -138); bp.lineTo(6, -126); bp.lineTo(-2, -128); bp.lineTo(-4, -104); bp.lineTo(-26, -106);
        bp.bezierCurveTo(-30, -126, -30, -146, -24, -160); bp.closePath();
        paint(c, bp, lg(c, -26, -164, 26, -104, [0, p.rustL, 0.4, p.rust, 1, p.rustD]), { sh: rgba(p.rustD, 0.7), shw: 7, hi: rgba(p.rustL, 0.6), hiw: 1.4, line: p.line, lw: 1.8 });
        c.save(); c.clip(bp);
        for (let i = 0; i < 26; i++) { c.fillStyle = rgba(U.hash(i, 1, 211) > 0.5 ? p.rustD : '#d8904a', 0.5); c.beginPath(); c.arc(-26 + U.hash(i, 2, 211) * 52, -164 + U.hash(i, 3, 211) * 60, 1 + U.hash(i, 4, 211) * 2.4, 0, TAU); c.fill(); }
        c.strokeStyle = rgba(p.rustD, 0.8); c.lineWidth = 1;
        for (let r = 0; r < 6; r++) { c.beginPath(); c.moveTo(-28, -154 + r * 8); c.lineTo(26, -156 + r * 8); c.stroke(); }
        c.restore();
        // belt with a tiger-head buckle
        c.fillStyle = p.rustD; c.fillRect(-28, -106, 56, 7);
        paint(c, circle(0, -102.5, 6), p.rustL, { line: p.line, lw: 1 });
        // pauldrons
        for (const [x, s] of [[-24, -1], [24, 1]]) {
          const pd = blob([[x - 14, -164], [x + 2 * s, -172], [x + 16, -162], [x + 16 * s * (s > 0 ? 1 : -1) * 0 + x * 0 + 14, -146], [x - 14, -148]]);
          paint(c, pd, lg(c, x, -172, x, -146, [0, p.rustL, 1, p.rustD]), { hi: rgba(p.rustL, 0.5), hiw: 1, line: p.line, lw: 1.5 });
        }
        // neck vertebrae
        bone([[2, -160], [4, -172]], 6, 5);
      });
      blit(ctx, body);
      // skull with helmet (live: jaw chatter, eye glow)
      ctx.save();
      ctx.translate(6, -186);
      ctx.rotate(sin(t * 1.1) * 0.04 + swing * 0.1 - P.hurt * 0.2);
      const sk = blob([[-12, -4], [-8, -16], [8, -18], [18, -8], [18, 4], [12, 8], [-6, 8], [-12, 2]]);
      paint(ctx, sk, rg(ctx, 2, -8, 2, 2, -2, 20, [0, p.boneL, 0.5, p.bone, 1, p.boneD]), { sh: rgba(p.boneD, 0.6), shw: 4, line: p.line, lw: 1.5 });
      const jaw = 1 + P.atk * 5 + (sin(t * 9) > 0.7 ? 2 : 0) + P.cast * 4;
      paint(ctx, blob([[0, 6 + jaw], [16, 6 + jaw], [18, 12 + jaw], [2, 14 + jaw]]), p.bone, { line: p.line, lw: 1.2 });
      ctx.fillStyle = p.line;
      for (let i = 0; i < 5; i++) { ctx.fillRect(3 + i * 3, 6, 1, 3); ctx.fillRect(3 + i * 3, 4 + jaw + 2, 1, 3); }
      ctx.fillStyle = '#0a0410';
      ctx.beginPath(); ctx.ellipse(4, -4, 4.5, 4, 0, 0, TAU); ctx.ellipse(14, -4, 3.6, 3.6, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(15, 1); ctx.lineTo(18, 3); ctx.lineTo(15, 4); ctx.fill();
      const ef = P.hurt > 0.2 ? 0.4 : 1;
      eye(ctx, 4.5, -4, 1.8 * ef, p.eye, 0.95, '#ffffff');
      eye(ctx, 14.5, -4, 1.5 * ef, p.eye, 0.9, '#ffffff');
      // helmet
      const hm = new Path2D(); hm.moveTo(-16, -8); hm.bezierCurveTo(-16, -30, 18, -32, 22, -8); hm.lineTo(16, -10); hm.quadraticCurveTo(2, -16, -10, -6); hm.closePath();
      paint(ctx, hm, lg(ctx, -16, -30, 22, -8, [0, p.rustL, 0.45, p.rust, 1, p.rustD]), { hi: rgba(p.rustL, 0.6), hiw: 1.2, line: p.line, lw: 1.5 });
      ctx.fillStyle = p.rustD; ctx.fillRect(2, -36, 3, 8);
      // tattered plume
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? p.plume : shade(p.plume, -0.3);
        ctx.fill(ribbon([[3, -36], [-4 - i * 2, -42 + sin(t * 2.4 + i) * 2], [-16 - i * 3 + sin(t * 2 + i) * 3, -36 + i * 3]], 4, 1, 4));
      }
      ctx.restore();
      // arms (bone): front grips the halberd, back rests on a sword hilt
      const bone2 = (pts) => limb(ctx, pts, 6, 5, p.bone, { line: p.line, lw: 1.2 });
      bone2([[-22, -156], [-30, -126], [-22, -100]]);
      paint(ctx, circle(-22, -98, 5), p.boneD, { line: p.line, lw: 1 });
      const grip = [hx + cos(ang) * 4, hy - br + sin(ang) * 4];
      bone2([[24, -156], [36 + swing * 8, -134], grip]);
      paint(ctx, ell(grip[0], grip[1], 6, 5), p.bone, { line: p.line, lw: 1.2 });
      ctx.restore();
      if (P.cast > 0) castFront(ctx, 120, 200, p.magic, P.cast * 0.6, t * 1.3);
      glow(ctx, 10, -190, 30, p.eye, 0.2 + 0.08 * sin(t * 3));
    },
  });

  // =============================================================================================
  // 怨婢 grudge_maid — ghost of a wronged maidservant: cracked teacup, red tears, violet grudge aura
  def('grudge_maid', {
    w: 105, h: 185,
    pal: {
      top: '#9ab0c0', topD: '#46586a', topL: '#d8e6ee', skirt: '#5a6a80', skirtD: '#222a3a', skin: '#e6eaee', skinD: '#9aa4b4', hair: '#121418', hairL: '#3a4050',
      tear: '#d0203a', aura: '#9a4adf', cup: '#f4f6f0', cupBlue: '#3a5ab8', eye: '#f0d8ff', line: '#1a1e2a', magic: '#b46aff',
    },
    vars: [{ h: 0, s: 1, keep: ['skin', 'skinD', 'hair', 'hairL', 'cup', 'cupBlue', 'tear'], set: { top: '#c0a8a0', topD: '#6a4a44', topL: '#f0dcd4', skirt: '#7a4a4a', skirtD: '#2e1414', aura: '#df4a6a', magic: '#ff6a8a', eye: '#ffd8e0' } }, { h: 0, s: 1, keep: ['skin', 'skinD', 'hair', 'hairL', 'cup', 'cupBlue'], set: { top: '#2a2e3a', topD: '#0c0e14', topL: '#5a6070', skirt: '#1a1c24', skirtD: '#06060a', aura: '#4adfc8', magic: '#4adfc8', eye: '#c8fff4', tear: '#4adfc8' } }],
    draw(ctx, t, o, p, P, v) {
      const fl = sin(t * 1.6) * 4;
      ctx.translate(0, fl - 10);
      // grudge aura
      glow(ctx, 0, -90, 90, p.aura, 0.22 + 0.08 * sin(t * 2.4) + P.cast * 0.2);
      particles(7, t, 0.5, 221, (i, life, r) => soft(ctx, (r(1) - 0.5) * 70 + sin(life * 6 + i) * 8, -30 - life * 150, 8 + life * 10, p.aura, sin(life * PI) * 0.35));
      wisps(ctx, 0, -46, 52, t, p.skirt, 5, 36, 0.4, 13);
      // long sleeve whip (back arm) — lashes on attack
      const lash = P.reach;
      const bsh = [-16, -128];
      const tipX = -44 + lash * 170, tipY = -60 - lash * 30 + sin(t * 2) * 6;
      paint(ctx, ribbon([bsh, [bsh[0] - 18 + lash * 40, -104 - lash * 20], [U.lerp(bsh[0], tipX, 0.7), U.lerp(-100, tipY, 0.7) + sin(t * 3) * 4], [tipX, tipY]], 14, 10, 6),
        lg(ctx, -30, -130, tipX, tipY, [0, p.topD, 0.6, p.top, 1, rgba(p.topL, 0.4)]), { line: p.line, lw: 1.2 });
      const body = part('grudge_maid/body/' + v, 110, 170, 55, 160, (c) => {
        // skirt fading
        const sk = new Path2D();
        sk.moveTo(-22, -96); sk.bezierCurveTo(-30, -60, -36, -30, -34, -6); sk.quadraticCurveTo(0, 4, 32, -6);
        sk.bezierCurveTo(32, -30, 28, -60, 24, -96); sk.closePath();
        paint(c, sk, lg(c, -30, 0, 30, 0, [0, p.skirt, 0.6, shade(p.skirt, 0.1), 1, p.skirtD]), { sh: rgba(p.skirtD, 0.6), shw: 7, line: p.line, lw: 1.6 });
        c.strokeStyle = rgba(p.skirtD, 0.7); c.lineWidth = 1.4;
        for (const x of [-16, -4, 8, 18]) { c.beginPath(); c.moveTo(x * 0.8, -94); c.lineTo(x * 1.3, -8); c.stroke(); }
        fadeOut(c, -60, -56, 120, -4);
        // apron
        const ap = poly([[-14, -96], [16, -96], [20, -50], [-16, -50]]);
        paint(c, ap, lg(c, 0, -96, 0, -50, [0, '#f2f2ee', 1, '#b8bcc4']), { line: p.line, lw: 1.2 });
        c.fillStyle = rgba(p.tear, 0.5); c.beginPath(); c.ellipse(4, -70, 4, 2.4, 0.3, 0, TAU); c.ellipse(10, -64, 2.4, 1.6, 0, 0, TAU); c.fill();
        // jacket
        const jk = blob([[-20, -142], [0, -148], [20, -142], [26, -116], [24, -94], [0, -90], [-24, -94], [-26, -118]]);
        paint(c, jk, lg(c, -24, -146, 24, -90, [0, p.topL, 0.45, p.top, 1, p.topD]), { sh: rgba(p.topD, 0.6), shw: 7, hi: rgba(p.topL, 0.6), hiw: 1.6, rim: rgba(p.aura, 0.6), line: p.line, lw: 1.8 });
        c.strokeStyle = p.topD; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-6, -146); c.quadraticCurveTo(10, -130, 18, -112); c.stroke();
        // neck
        c.fillStyle = p.skinD; c.fillRect(-3, -152, 9, 8);
      });
      blit(ctx, body);
      // head (live)
      ctx.save();
      ctx.translate(4, -164);
      ctx.rotate(0.18 + sin(t * 0.9) * 0.04 - P.hurt * 0.2 + P.reach * 0.1);
      // twin buns (one coming undone)
      paint(ctx, circle(-12, -16, 8), p.hair, { line: '#000', lw: 1 });
      paint(ctx, circle(12, -18, 7), p.hair, { line: '#000', lw: 1 });
      ctx.fillStyle = p.hair;
      ctx.fill(ribbon([[-14, -10], [-20, 10], [-18 + sin(t * 1.4) * 3, 34]], 6, 1.5, 4));
      const hd = blob([[-11, -6], [-6, -16], [8, -16], [14, -6], [13, 6], [5, 13], [-5, 11], [-11, 3]]);
      paint(ctx, hd, rg(ctx, 2, -6, 2, 2, 0, 18, [0, '#ffffff', 0.5, p.skin, 1, p.skinD]), { line: p.skinD, lw: 1.3 });
      ctx.fillStyle = p.hair;
      ctx.beginPath(); ctx.moveTo(-12, 2); ctx.bezierCurveTo(-14, -18, 10, -22, 15, -6); ctx.quadraticCurveTo(6, -12, 0, -6); ctx.quadraticCurveTo(-6, -8, -12, 2); ctx.fill();
      // glowering eyes with dark rings, bloody tears
      ctx.fillStyle = rgba(p.aura, 0.4); ctx.beginPath(); ctx.ellipse(2, 0, 5, 3.4, 0, 0, TAU); ctx.ellipse(11, -0.5, 4, 3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = p.line; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(6, -1.5); ctx.moveTo(8, -2); ctx.lineTo(14, -3.6); ctx.stroke();
      const ef = P.hurt > 0.2 ? 0.3 : 1;
      eye(ctx, 2.5, 0.5, 1.6, p.eye, 0.9, '#ffffff', 1.4 * ef);
      eye(ctx, 11, 0, 1.3, p.eye, 0.8, '#ffffff', 1.1 * ef);
      ctx.fillStyle = p.tear;
      ctx.fillRect(2, 3, 1.2, 6 + sin(t) * 1); ctx.fillRect(10.5, 2.5, 1.1, 4);
      ctx.strokeStyle = rgba(p.line, 0.8); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(4, 8.5 + P.atk * 1); ctx.quadraticCurveTo(8, 7 - P.atk * 2, 11, 8.5); ctx.stroke();
      ctx.restore();
      // front arm holding a cracked blue-and-white teacup (thrown as shards on cast)
      const ch = [26 + P.cast * 10, -112 - P.cast * 24];
      limb(ctx, [[18, -138], [26, -122], ch], 11, 9, p.top, { hi: rgba(p.topL, 0.6), hiw: 1, line: p.line, lw: 1.4 });
      paint(ctx, ell(ch[0] + 3, ch[1] + 2, 4.5, 3.6), p.skin, { line: p.skinD, lw: 1 });
      ctx.save(); ctx.translate(ch[0] + 6, ch[1] - 6);
      const cup = new Path2D(); cup.moveTo(-8, -6); cup.lineTo(8, -6); cup.quadraticCurveTo(7, 6, 0, 7); cup.quadraticCurveTo(-7, 6, -8, -6); cup.closePath();
      paint(ctx, cup, lg(ctx, -8, 0, 8, 0, [0, '#ffffff', 0.6, p.cup, 1, '#b8bcc0']), { line: '#4a5060', lw: 1 });
      ctx.strokeStyle = p.cupBlue; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-6, -3); ctx.quadraticCurveTo(-2, 0, 2, -3); ctx.quadraticCurveTo(5, -5, 7, -2); ctx.stroke();
      ctx.strokeStyle = '#2a2e38'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(0, -1); ctx.lineTo(3, 2); ctx.lineTo(1, 6); ctx.stroke();
      ctx.restore();
      if (P.cast > 0) particles(6, t, 1.2, 231, (i, life, r) => {
        const x = ch[0] + 10 + life * 90, y = ch[1] - 10 + (r(1) - 0.5) * 40 * life;
        ctx.save(); ctx.globalAlpha *= (1 - life) * P.cast; ctx.translate(x, y); ctx.rotate(life * 10 + i);
        ctx.fillStyle = p.cup; ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(4, -3); ctx.lineTo(1, 4); ctx.fill();
        ctx.fillStyle = p.cupBlue; ctx.fillRect(-1, -1, 2, 2);
        ctx.restore();
        glow(ctx, x, y, 10, p.magic, (1 - life) * P.cast * 0.5);
      });
    },
  });

  // =============================================================================================
  // 怨宴 grudge_feast — BOSS: a haunted banquet of grudges. A round red banquet table laid with dishes and
  // candles; behind it rises a mass of resentment with many pale faces, grasping arms and one huge mouth.
  def('grudge_feast', {
    w: 380, h: 385,
    pal: {
      mass: '#2a1838', massD: '#0c0614', massL: '#6a3a7a', cloth: '#a81e2a', clothD: '#4a0810', clothL: '#e8505a', gold: '#e0b04a',
      wood: '#5a1810', woodD: '#24060a', face: '#e6e2ea', faceD: '#8a84a0', lip: '#b87a8a', lipD: '#5a2a3a', mouth: '#2a0610', maw: '#ff3a4a',
      teeth: '#f2ead8', flame: '#7aff9a', flameIn: '#eaffea', candle: '#f0e8dc', plate: '#f4f2ec', blue: '#3a5ab8', eye: '#ffe86a',
      arm: '#c8c0d8', line: '#12060e', magic: '#c86aff',
    },
    vars: [{ h: 0, s: 1, set: { cloth: '#d8d4cc', clothD: '#6a6660', clothL: '#ffffff', gold: '#8a8a94', mass: '#18222e', massD: '#04080c', massL: '#3a5068', flame: '#7ac8ff', flameIn: '#eaf6ff', maw: '#5ac8ff', eye: '#bfefff', magic: '#7ac8ff' } },
      { h: 0, s: 1, set: { cloth: '#1a1a1e', clothD: '#060608', clothL: '#4a4a54', gold: '#e0b04a', mass: '#3a0a10', massD: '#140204', massL: '#8a2a2a', flame: '#ff7a3a', flameIn: '#fff0c0', maw: '#ffb03a', eye: '#ff4a2a', magic: '#ff5a3a' } }],
    draw(ctx, t, o, p, P, v) {
      const ph = o.phase || 1;
      const br = sin(t * 0.9);
      const rage = (ph - 1) * 0.5;
      // the mass of grudges behind the table (cached body + live wisps)
      ctx.save();
      ctx.translate(0, br * 3 - P.cast * 6);
      particles(10, t, 0.3, 241, (i, life, r) => soft(ctx, (r(1) - 0.5) * 360, -300 - life * 90, 30 + life * 30, p.mass, sin(life * PI) * 0.5));
      const mass = part('grudge_feast/mass/' + v, 440, 320, 220, 420, (c) => {
        const m = new Path2D();
        m.moveTo(-178, -110);
        m.bezierCurveTo(-214, -190, -200, -300, -130, -350);
        m.bezierCurveTo(-90, -380, -40, -372, -10, -392);
        m.bezierCurveTo(30, -378, 60, -392, 100, -366);
        m.bezierCurveTo(170, -330, 210, -240, 182, -110);
        m.closePath();
        paint(c, m, rg(c, 0, -260, 20, 0, -240, 220, [0, p.massL, 0.5, p.mass, 1, p.massD]),
          { sh: rgba(p.massD, 0.7), shw: 20, hi: rgba(p.massL, 0.5), hiw: 3, rim: rgba(p.magic, 0.5), rimw: 3, line: rgba(p.magic, 0.5), lw: 2 });
        // swirling smoke striations
        c.save(); c.clip(m);
        for (let i = 0; i < 18; i++) {
          c.strokeStyle = rgba(i % 2 ? p.massL : p.massD, 0.35); c.lineWidth = 3 + U.hash(i, 1, 243) * 5;
          const y = -380 + i * 16, x = -200 + U.hash(i, 2, 243) * 80;
          c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 80, y - 30, x + 200, y + 40, x + 360, y - 10); c.stroke();
        }
        c.restore();
      });
      blit(ctx, mass);
      // ghostly wisp tendrils off the top edge
      for (let i = 0; i < 7; i++) {
        const x = -150 + i * 50, base = -340 - sin((i / 6) * PI) * 40;
        const sw = sin(t * 1.4 + i) * 10;
        ctx.fillStyle = rgba(p.mass, 0.7);
        ctx.fill(ribbon([[x, base + 20], [x + sw * 0.5, base - 10], [x + sw - 6, base - 30 - (i % 3) * 8]], 26, 2, 5));
      }
      // embedded faces (cached sprite, each bobbing / fading)
      const face = part('grudge_feast/face/' + v, 50, 60, 25, 30, (c) => {
        const f = blob([[-14, -14], [0, -24], [14, -14], [16, 6], [8, 22], [-8, 22], [-16, 6]]);
        paint(c, f, rg(c, -2, -8, 2, 0, 0, 26, [0, '#ffffff', 0.4, p.face, 1, rgba(p.faceD, 0.4)]), { line: rgba(p.faceD, 0.8), lw: 1.2 });
        c.fillStyle = p.massD;
        c.beginPath(); c.ellipse(-6, -2, 4, 5.5, 0.15, 0, TAU); c.ellipse(7, -2, 4, 5.5, -0.15, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(0, 12, 3.5, 5, 0, 0, TAU); c.fill();
        c.strokeStyle = rgba(p.faceD, 0.9); c.lineWidth = 1;
        c.beginPath(); c.moveTo(-10, -9); c.lineTo(-3, -7); c.moveTo(10, -9); c.lineTo(3, -7); c.stroke();
      });
      const faces = [[-150, -210, 1.1], [-120, -300, 0.95], [-70, -350, 0.8], [150, -205, 1.05], [128, -300, 0.95], [70, -352, 0.8], [-160, -140, 0.9], [168, -140, 0.9], [-10, -362, 0.7]];
      faces.forEach(([x, y, s], i) => {
        const a = 0.55 + 0.35 * sin(t * 1.3 + i * 1.9) + P.cast * 0.3;
        ctx.save();
        ctx.globalAlpha *= min(1, a);
        ctx.translate(x + sin(t * 0.8 + i) * 3, y + cos(t * 1.1 + i * 2) * 3);
        ctx.rotate(sin(t * 0.6 + i) * 0.15);
        ctx.scale(s * 1.1, s * 1.1);
        blit(ctx, face);
        ctx.restore();
        glow(ctx, x - 6 * s, y - 2 * s, 5, p.eye, 0.25 * a + rage * 0.2);
        glow(ctx, x + 7 * s, y - 2 * s, 5, p.eye, 0.25 * a + rage * 0.2);
      });
      // two great eyes above the mouth
      const blink = (t % 5.2) > 5.05 ? 0.15 : 1;
      for (const [ex, ey, r] of [[-34, -308, 15], [72, -304, 13]]) {
        ctx.fillStyle = p.massD;
        ctx.beginPath(); ctx.ellipse(ex, ey, r + 5, (r + 2) * blink, 0, 0, TAU); ctx.fill();
        eye(ctx, ex + 3, ey, r * 0.7, rage > 0.4 ? '#ff4a3a' : p.eye, 0.9, '#ffffff', r * 0.62 * blink * (P.hurt > 0.2 ? 0.3 : 1));
        ctx.fillStyle = '#100'; ctx.beginPath(); ctx.ellipse(ex + 5, ey, 2.6, r * 0.5 * blink, 0, 0, TAU); ctx.fill();
      }
      // the huge mouth
      const open = 26 + sin(t * 1.3) * 6 + P.atk * 46 + P.cast * 30 + rage * 14 - P.hurt * 10;
      const mx = 20, my = -228, mw = 112;
      const mouth = new Path2D();
      mouth.moveTo(mx - mw, my);
      mouth.bezierCurveTo(mx - mw * 0.5, my - open * 0.9, mx + mw * 0.5, my - open * 0.9, mx + mw, my);
      mouth.bezierCurveTo(mx + mw * 0.5, my + open * 1.1, mx - mw * 0.5, my + open * 1.1, mx - mw, my);
      mouth.closePath();
      ctx.fillStyle = rg(ctx, mx, my, 4, mx, my, mw, [0, p.maw, 0.25, p.mouth, 1, '#050003']);
      ctx.fill(mouth);
      ctx.save(); ctx.clip(mouth);
      glow(ctx, mx, my + 6, 70, p.maw, 0.5 + 0.2 * sin(t * 4) + P.cast * 0.4);
      // tongue
      paint(ctx, ell(mx + 6, my + open * 0.7, mw * 0.5, open * 0.45), lg(ctx, 0, my, 0, my + open, [0, p.lip, 1, p.lipD]), { line: p.lipD, lw: 1.5 });
      // teeth rows
      ctx.fillStyle = p.teeth; ctx.strokeStyle = rgba(p.lipD, 0.7); ctx.lineWidth = 1;
      for (let i = 0; i < 11; i++) {
        const u = (i + 0.5) / 11, x = mx - mw + u * mw * 2;
        const yt = my - open * 0.9 * sin(u * PI) * 0.75;
        const yb = my + open * 1.1 * sin(u * PI) * 0.75;
        const tw = 8 + sin(u * PI) * 4, th = 10 + sin(u * PI) * 8;
        ctx.beginPath(); ctx.moveTo(x - tw / 2, yt - 4); ctx.lineTo(x + tw / 2, yt - 4); ctx.lineTo(x, yt + th); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - tw / 2, yb + 4); ctx.lineTo(x + tw / 2, yb + 4); ctx.lineTo(x + 1, yb - th * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      // lips
      ctx.lineWidth = 7; ctx.strokeStyle = p.lipD; ctx.stroke(mouth);
      ctx.lineWidth = 4; ctx.strokeStyle = p.lip; ctx.stroke(mouth);
      ctx.lineWidth = 1.2; ctx.strokeStyle = rgba('#ffffff', 0.35);
      ctx.beginPath(); ctx.moveTo(mx - mw * 0.6, my - open * 0.62); ctx.quadraticCurveTo(mx, my - open * 0.76, mx + mw * 0.6, my - open * 0.62); ctx.stroke();
      // drool-like grudge drips (spectral)
      drips(ctx, [[mx - 40, my + open * 0.8], [mx + 30, my + open * 0.9], [mx + 70, my + open * 0.6]], t, p.maw, 247, 40, 0.6);
      // back arms reaching out of the mass (live)
      const armR = P.reach;
      const ghostArm = (sx, sy, ang, len, k, hold) => {
        const a = ang + sin(t * 1.2 + k) * 0.12 - armR * 0.3 * (ang > -PI / 2 ? 1 : -1);
        const L = len * (1 + armR * 0.4);
        const el = [sx + cos(a + 0.4) * L * 0.5, sy + sin(a + 0.4) * L * 0.5];
        const hn = [el[0] + cos(a - 0.2) * L * 0.5, el[1] + sin(a - 0.2) * L * 0.5];
        ctx.save(); ctx.globalAlpha *= 0.85;
        paint(ctx, ribbon([[sx, sy], el, hn], 16, 8, 6), lg(ctx, sx, sy, hn[0], hn[1], [0, rgba(p.arm, 0.1), 0.4, rgba(p.arm, 0.75), 1, p.arm]), { line: rgba(p.faceD, 0.6), lw: 1.2 });
        ctx.translate(hn[0], hn[1]); ctx.rotate(a - 0.2);
        paint(ctx, ell(2, 0, 7, 5), p.arm, { line: rgba(p.faceD, 0.8), lw: 1 });
        for (let f = 0; f < 4; f++) paint(ctx, ribbon([[4, -3 + f * 2], [12, -5 + f * 3], [17, -3 + f * 3.4]], 2.6, 1, 3), p.arm, { line: rgba(p.faceD, 0.7), lw: 0.7 });
        if (hold === 'cup') { paint(ctx, poly([[10, -12], [22, -12], [19, -3], [13, -3]]), p.plate, { line: p.blue, lw: 1 }); }
        if (hold === 'sticks') { ctx.strokeStyle = '#3a1a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(34, -14); ctx.moveTo(6, -2); ctx.lineTo(34, -8); ctx.stroke(); }
        ctx.restore();
      };
      ghostArm(-120, -230, -2.4, 120, 0, 'cup');
      ghostArm(120, -250, -0.6, 130, 1, 'sticks');
      ghostArm(140, -165, -0.1, 120, 2, null);
      ghostArm(-140, -160, -3.0, 110, 3, null);
      ctx.restore();
      // the banquet table (cached) in front
      const table = part('grudge_feast/table/' + v, 400, 180, 200, 172, (c) => {
        // legs
        for (const x of [-150, -60, 60, 150]) {
          const lgp = new Path2D(); lgp.moveTo(x - 9, -60); lgp.lineTo(x + 9, -60); lgp.lineTo(x + 7, -4); lgp.quadraticCurveTo(x + 14, 0, x, 0); lgp.quadraticCurveTo(x - 14, 0, x - 7, -4); lgp.closePath();
          paint(c, lgp, lg(c, x - 9, 0, x + 9, 0, [0, p.wood, 0.5, shade(p.wood, 0.2), 1, p.woodD]), { line: p.line, lw: 1.4 });
        }
        // tabletop + hanging cloth
        const cl = new Path2D();
        cl.moveTo(-186, -120);
        cl.ellipse(0, -120, 186, 46, 0, PI, 0, true);
        cl.lineTo(186, -120);
        cl.bezierCurveTo(188, -90, 182, -70, 176, -52);
        for (let i = 0; i <= 14; i++) {
          const u = i / 14, x = 176 - u * 352;
          const y = -52 + sin(u * PI) * 26 + (i % 2 ? 8 : 0);
          cl.lineTo(x, y);
        }
        cl.bezierCurveTo(-182, -70, -188, -90, -186, -120);
        cl.closePath();
        paint(c, cl, lg(c, -180, -120, 180, -40, [0, p.clothL, 0.35, p.cloth, 1, p.clothD]), { sh: rgba(p.clothD, 0.6), shw: 12, hi: rgba(p.clothL, 0.5), hiw: 2, line: p.line, lw: 2 });
        c.save(); c.clip(cl);
        // drape folds
        c.strokeStyle = rgba(p.clothD, 0.6); c.lineWidth = 3;
        for (let i = 0; i < 9; i++) { const x = -160 + i * 40; c.beginPath(); c.moveTo(x, -90 + abs(x) * 0.12); c.quadraticCurveTo(x + 6, -70, x, -40 + sin((x + 180) / 360 * PI) * 20); c.stroke(); }
        // gold trim band & 囍 / longevity medallions
        c.strokeStyle = p.gold; c.lineWidth = 3;
        c.beginPath(); c.ellipse(0, -112, 186, 46, 0, 0.05, PI - 0.05); c.stroke();
        c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, -104, 186, 46, 0, 0.08, PI - 0.08); c.stroke();
        c.restore();
        for (const [x, y] of [[-110, -64], [0, -50], [110, -64]]) {
          paint(c, circle(x, y, 13), p.clothD, { line: p.gold, lw: 2 });
          c.fillStyle = p.gold; c.font = G.font(15, true); c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('冤', x, y + 1);
        }
        // tabletop surface
        const top = ell(0, -120, 182, 44);
        paint(c, top, rg(c, -40, -134, 10, 0, -120, 190, [0, p.clothL, 0.5, p.cloth, 1, p.clothD]), { line: p.line, lw: 1.6 });
        // dishes: a whole fish, bowls of rice with upright chopsticks, a teapot, cups
        const plate = (x, y, rx) => {
          paint(c, ell(x, y + 2, rx + 2, rx * 0.32 + 1), rgba('#000000', 0.25), {});
          paint(c, ell(x, y, rx, rx * 0.32), rg(c, x - rx * 0.3, y - 3, 1, x, y, rx, [0, '#ffffff', 0.7, p.plate, 1, '#b8b4ac']), { line: '#5a5650', lw: 1.1 });
          c.strokeStyle = rgba(p.blue, 0.8); c.lineWidth = 1.2; c.beginPath(); c.ellipse(x, y, rx * 0.8, rx * 0.25, 0, 0, TAU); c.stroke();
        };
        plate(-70, -128, 46);
        // fish (steamed, ghostly pale)
        const fsh = new Path2D(); fsh.moveTo(-108, -128); fsh.quadraticCurveTo(-80, -144, -44, -132); fsh.lineTo(-30, -142); fsh.lineTo(-32, -122); fsh.lineTo(-44, -128); fsh.quadraticCurveTo(-80, -114, -108, -128); fsh.closePath();
        paint(c, fsh, lg(c, 0, -142, 0, -116, [0, '#e8dcc0', 1, '#9a8a6a']), { line: '#4a3a2a', lw: 1.2 });
        c.fillStyle = '#1a1a1a'; c.beginPath(); c.arc(-98, -130, 2, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(80,60,40,0.6)'; c.lineWidth = 1;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-82 + i * 9, -128, 5, -1.2, 1.2); c.stroke(); }
        // rice bowls with chopsticks stuck upright (funeral offering — ominous)
        for (const [x, y] of [[40, -142], [96, -124], [-10, -104]]) {
          paint(c, ell(x, y + 4, 16, 5), rgba('#000', 0.25), {});
          const bw = new Path2D(); bw.moveTo(x - 15, y - 4); bw.quadraticCurveTo(x - 13, y + 10, x, y + 10); bw.quadraticCurveTo(x + 13, y + 10, x + 15, y - 4); bw.closePath();
          paint(c, bw, lg(c, x - 15, 0, x + 15, 0, [0, '#ffffff', 0.6, p.plate, 1, '#a8a49c']), { line: '#5a5650', lw: 1 });
          c.strokeStyle = p.blue; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 12, y + 2); c.quadraticCurveTo(x, y + 6, x + 12, y + 2); c.stroke();
          paint(c, ell(x, y - 6, 13, 5), '#fbf8f0', { line: '#9a968c', lw: 0.8 });
          c.strokeStyle = '#3a1a10'; c.lineWidth = 2;
          c.beginPath(); c.moveTo(x - 2, y - 6); c.lineTo(x - 4, y - 34); c.moveTo(x + 2, y - 6); c.lineTo(x + 3, y - 34); c.stroke();
        }
        // teapot
        const tp = new Path2D(); tp.moveTo(130, -150); tp.bezierCurveTo(112, -150, 112, -128, 130, -124); tp.lineTo(150, -124); tp.bezierCurveTo(168, -128, 168, -150, 150, -150); tp.closePath();
        paint(c, tp, rg(c, 136, -146, 2, 140, -138, 24, [0, '#ffffff', 0.5, p.plate, 1, '#a8a49c']), { line: '#4a4640', lw: 1.2 });
        c.strokeStyle = p.blue; c.lineWidth = 1.2; c.beginPath(); c.moveTo(122, -138); c.quadraticCurveTo(140, -132, 158, -138); c.stroke();
        c.strokeStyle = '#4a4640'; c.lineWidth = 3; c.beginPath(); c.moveTo(160, -142); c.quadraticCurveTo(172, -146, 176, -156); c.stroke();
        c.beginPath(); c.arc(140, -154, 4, PI, TAU); c.stroke();
        // overturned cup & spilled wine
        paint(c, ell(70, -100, 18, 5), rgba(p.clothD, 0.8), {});
        paint(c, poly([[60, -106], [74, -110], [76, -100], [62, -98]]), p.plate, { line: p.blue, lw: 1 });
      });
      ctx.save();
      ctx.translate(0, sin(t * 2.2) * (1 + rage * 2) * (P.atk > 0 ? 3 : 1));
      blit(ctx, table);
      // candles with ghost flames (live)
      for (const [x, y, h, k] of [[-150, -124, 40, 0], [-120, -150, 34, 1], [8, -158, 46, 2], [150, -112, 38, 3], [-40, -96, 30, 4]]) {
        const cd = new Path2D(); cd.roundRect(x - 5, y - h, 10, h, 2);
        paint(ctx, cd, lg(ctx, x - 5, 0, x + 5, 0, [0, '#ffffff', 0.5, p.candle, 1, '#a89c88']), { line: '#5a4a3a', lw: 1 });
        ctx.fillStyle = p.candle; ctx.beginPath(); ctx.ellipse(x + 3, y - h + 8, 2, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#c8202a'; ctx.fillRect(x - 5, y - h * 0.5, 10, 3);
        flame(ctx, x, y - h, 6.5 + P.cast * 3 + rage * 2, t + k, p.flame, p.flameIn, k + 5, 1);
      }
      // front arms reaching out from under the tablecloth
      for (const [sx, a, k] of [[-120, 2.4, 0], [110, 0.6, 1], [176, 0.1, 2]]) {
        const aa = a + sin(t * 1.5 + k * 2) * 0.15 - armR * 0.4;
        const L = 50 + armR * 40 + sin(t * 1.1 + k) * 6;
        const s0 = [sx, -40], h0 = [sx + cos(aa) * L, -40 + sin(aa) * L * 0.6 - 10];
        ctx.save(); ctx.globalAlpha *= 0.8;
        paint(ctx, ribbon([s0, [U.lerp(s0[0], h0[0], 0.5), U.lerp(s0[1], h0[1], 0.5) - 8], h0], 12, 7, 5), lg(ctx, s0[0], s0[1], h0[0], h0[1], [0, rgba(p.arm, 0.15), 1, p.arm]), { line: rgba(p.faceD, 0.6), lw: 1 });
        ctx.translate(h0[0], h0[1]); ctx.rotate(aa);
        for (let f = 0; f < 4; f++) paint(ctx, ribbon([[0, -3 + f * 2], [8, -5 + f * 3], [13, -2 + f * 3.4]], 2.4, 1, 3), p.arm, { line: rgba(p.faceD, 0.7), lw: 0.7 });
        ctx.restore();
      }
      ctx.restore();
      if (ph >= 2) glow(ctx, 20, -230, 200, p.maw, 0.1 + 0.06 * sin(t * 3));
      if (P.cast > 0) particles(12, t, 0.7, 251, (i, life, r) => glow(ctx, (r(1) - 0.5) * 360, -120 - life * 260, 6 + r(2) * 6, p.flame, sin(life * PI) * P.cast));
    },
  });

})();

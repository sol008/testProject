// 彼岸燈 Shorelight — regional architecture & props (objects2.js)
// Registers into G.Objects (js/gfx/registry.js). See docs/CONTRACTS.md "Objects".
//
//   G.Objects.define(type, { w, h, solid|solidAt, draw(ctx, px, py, o, t), lights?(o), anim?, over? })
//   px,py = logical px of the footprint top-left; art may rise above the footprint (roofs, masts).
//   Buildings: the footprint is the full collision rect; the bottom row is the front wall; the cell at
//   column o.door of the bottom row is non-solid and drawn as the doorway.
//
// Types & params (defaults in brackets):
//   hakka_house 6x4      伙房 U-shaped courtyard house. o.door [2] (gate in front wall, clamped 1..w-2),
//                        o.text 堂號 [穎川堂]. Resizable via o.w / o.h. Lights: hall lanterns.
//   drying_rack 2x1      o.v 0 = 米粉 rice-noodle screen, 1 = 柿餅 persimmon trays.
//   red_fort 5x4         紅毛城 red-brick fort. o.door [2]. Lights: gate lamp.
//   chikan_tower 5x4     赤崁樓 pavilion on brick podium. o.door [2]. Lights: eave lanterns.
//   city_god_temple 6x4  城隍廟 (dark & solemn). o.door [2] (centre door spans cols 2–3; 1/4 = side doors).
//   mazu_temple 6x4      天后宮. o.door as above. o.text overrides the plaque. Lights: lanterns + hall glow.
//   palanquin 2x2        神轎, sways (anim). o.still = true → resting, no sway.
//   kuba 4x3             Tsou men's house (raised, thatched). o.door [1] (log ladder). Light: hearth.
//   bunun_house 4x3      Bunun slate house. o.door [1]. Light: hearth glimmer at the door.
//   millet_rack 2x1      frame with drying millet bundles.
//   tao_house 4x3        Tao semi-sunken house (vahey) in a cobble-lined pit. o.door [1] (steps down).
//   tatala 2x1           Tao plank boat (red/white/black, boat-eye rosettes). o.water → bobs (anim).
//   wang_boat 6x3        王船. o.water → afloat & bobbing; otherwise on a beach cradle. Flags flutter (anim).
//   guzhao 4x3           頭城 孤棚: 12 greased poles, platform, 13 孤棧 with flags (very tall). Lights: lanterns.
//   fort_gate 3x2        恆春古城 gate. Whole o.door column [centre] is passable. o.text [南門]. o.w resizable.
//   stone_weir 5x3       石滬 (w/h overrides). o.v 0 = arc, 1 = 雙心 double heart. Solid only along the wall.
//   basalt 2x2           columnar basalt cluster. o.v seeds the arrangement.
//   firecracker_tower 2x1 鹽水蜂炮 炮城 rack; sparks (anim) unless o.lit === false. o.text [炮城]. Light: flicker.
//   qixi_pavilion 2x2    七娘媽亭 paper pavilion on an offering table. Lights: two candles.
//   pilgrim_flag 1x1     進香旗 triangular flag, flutters (anim). o.text [進香], o.color (field) [#f1c232].
//   rainbow_arch 6x2     faint spirit rainbow bridge — over:true, non-solid, anim. w/h overrides.
//
// Plaques with horizontal text are written right-to-left as on traditional Qing-era boards.
// Static art is cached per type + size + variant + door (+ G.S); only small bits are drawn live.
'use strict';
(() => {
  const U = G.U;
  const T = G.TILE || 64;
  const { clamp, lerp } = U;
  const shade = U.shade, mix = U.mix, rgba = U.rgba;
  const { sin, cos, abs, min, max, PI, floor, round, hypot, sqrt } = Math;
  const TAU = PI * 2;
  const F = (s, b) => (G.font ? G.font(s, b) : (b ? 'bold ' : '') + s + 'px serif');

  // ---------------------------------------------------------------------------------------------
  // cache
  // ---------------------------------------------------------------------------------------------
  const CACHE = new Map();
  function spr(key, w, h, ax, ay, fn) {
    const k = key + '|' + G.S;
    let c = CACHE.get(k);
    if (!c) {
      c = U.makeCanvas(w, h);
      const g = c.getContext('2d');
      g.translate(ax, ay);
      g.lineJoin = 'round'; g.lineCap = 'round';
      fn(g);
      c.ax = ax; c.ay = ay;
      CACHE.set(k, c);
    }
    return c;
  }
  const put = (ctx, s, x, y) => ctx.drawImage(s, x - s.ax, y - s.ay, s.lw, s.lh);
  function rngFor(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return U.seeded((h >>> 0) || 7);
  }
  const pick = (r, a) => a[floor(r() * a.length)];

  // ---------------------------------------------------------------------------------------------
  // paint helpers
  // ---------------------------------------------------------------------------------------------
  function P(g, pts) {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }
  function lg(g, x0, y0, x1, y1, stops) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    return gr;
  }
  function rg(g, x, y, r0, r1, stops, x1, y1) {
    const gr = g.createRadialGradient(x, y, r0, x1 == null ? x : x1, y1 == null ? y : y1, r1);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    return gr;
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
  }
  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, max(0.1, rx), max(0.1, ry), 0, 0, TAU); }
  function fillP(g, pts, fill, stroke, lw) {
    P(g, pts); g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1.5; g.stroke(); }
  }
  // soft shadow blob (stacked translucent rounded rects)
  function softRect(g, x, y, w, h, a = 0.3, spread = 10, col = '20,14,26') {
    const n = max(1, floor(spread / 2));
    for (let i = n; i >= 0; i--) {
      const s = i * 2;
      g.fillStyle = `rgba(${col},${a / (n + 1)})`;
      rr(g, x - s, y - s * 0.6, w + s * 2, h + s * 1.2, 4 + s);
      g.fill();
    }
  }
  function ellShadow(g, cx, cy, rx, ry, a = 0.35) {
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    g.fillStyle = rg(g, 0, 0, 0, rx, [[0, `rgba(18,12,24,${a})`], [0.55, `rgba(18,12,24,${a * 0.6})`], [1, 'rgba(18,12,24,0)']]);
    g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore();
  }
  // contact shadow around a building base (light from top-left → shadow falls right & down)
  function baseShadow(g, W, H, a = 0.32, wall = 64) {
    softRect(g, 6, H - 12, W + 4, 18, a, 10);
    softRect(g, W - 6, H - wall, 14, wall - 6, a * 0.6, 8);
  }
  // vertical wall shading: AO under the eave, contact darkening, left-lit horizontal falloff
  function faceAO(g, x, y, w, h, o = {}) {
    const top = o.top == null ? 0.5 : o.top, th = o.th || 14, bot = o.bot == null ? 0.28 : o.bot;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = lg(g, 0, y, 0, y + th, [[0, `rgba(12,6,14,${top})`], [1, 'rgba(12,6,14,0)']]);
    g.fillRect(x, y, w, th);
    g.fillStyle = lg(g, 0, y + h - 12, 0, y + h, [[0, 'rgba(12,6,14,0)'], [1, `rgba(12,6,14,${bot})`]]);
    g.fillRect(x, y + h - 12, w, 12);
    g.fillStyle = lg(g, x, 0, x + w, 0, [[0, 'rgba(255,236,210,0.07)'], [1, 'rgba(18,8,30,0.13)']]);
    g.fillRect(x, y, w, h);
    g.restore();
  }
  function speckle(g, x, y, w, h, rng, n, cols, rmax = 1.4) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = pick(rng, cols);
      const r = 0.4 + rng() * rmax;
      g.fillRect(x + rng() * w, y + rng() * h, r, r);
    }
  }
  function bricks(g, x, y, w, h, base, rng, o = {}) {
    const bw = o.bw || 14, bh = o.bh || 6, v = o.v == null ? 0.09 : o.v;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = o.mortar || shade(base, -0.42); g.fillRect(x, y, w, h);
    for (let r = 0, yy = y + (o.oy || 0); yy < y + h; r++, yy += bh) {
      const off = r % 2 ? bw / 2 : 0;
      for (let xx = x - off; xx < x + w; xx += bw) {
        g.fillStyle = shade(base, (rng() - 0.5) * 2 * v);
        g.fillRect(xx + 0.6, yy + 0.6, bw - 1.2, bh - 1.2);
        g.fillStyle = 'rgba(255,232,205,0.10)'; g.fillRect(xx + 0.6, yy + 0.6, bw - 1.2, 0.9);
      }
    }
    g.restore();
  }
  function plaster(g, x, y, w, h, base, rng, o = {}) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = lg(g, 0, y, 0, y + h, [[0, shade(base, 0.05)], [1, shade(base, -0.08)]]);
    g.fillRect(x, y, w, h);
    // rising damp / weathering
    const n = floor(w / 26) + 1;
    for (let i = 0; i < n; i++) {
      const cx = x + rng() * w, r = 8 + rng() * 18;
      g.fillStyle = rg(g, cx, y + h, 0, r * 1.4, [[0, rgba(o.stain || '#6b604c', 0.22)], [1, rgba(o.stain || '#6b604c', 0)]]);
      g.fillRect(cx - r * 1.4, y + h - r * 1.6, r * 2.8, r * 1.6);
    }
    speckle(g, x, y, w, h, rng, floor(w * h / 60), ['rgba(90,80,60,0.12)', 'rgba(255,255,255,0.18)']);
    g.restore();
  }
  // packed rounded stones (beach cobbles / rubble)
  function cobbles(g, x, y, w, h, pal, rng, sz = 10, o = {}) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = o.gap || shade(pal[0], -0.55); g.fillRect(x, y, w, h);
    const sy = o.flat ? 0.55 : 0.75;
    for (let yy = y - sz * 0.2; yy < y + h + sz * 0.5; yy += sz * sy) {
      for (let xx = x - rng() * sz; xx < x + w + sz; xx += sz * (0.78 + rng() * 0.42)) {
        const rx = sz * (0.44 + rng() * 0.18), ry = sz * (o.flat ? 0.28 : 0.36) * (0.85 + rng() * 0.35);
        const c = shade(pick(rng, pal), (rng() - 0.5) * 0.22);
        const cx = xx + rng() * 2, cy = yy + rng() * 2;
        g.fillStyle = 'rgba(10,8,10,0.35)'; ell(g, cx + 0.8, cy + 1.2, rx, ry); g.fill();
        g.fillStyle = rg(g, cx - rx * 0.35, cy - ry * 0.45, 0, rx * 1.35, [[0, shade(c, 0.28)], [0.5, c], [1, shade(c, -0.3)]]);
        ell(g, cx, cy, rx, ry); g.fill();
      }
    }
    g.restore();
  }
  // stacked slate courses (dry stone, horizontal)
  function slateCourses(g, x, y, w, h, base, rng, o = {}) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = shade(base, -0.62); g.fillRect(x, y, w, h);
    let yy = y;
    while (yy < y + h) {
      const ch = (o.min || 3) + rng() * (o.var || 4);
      let xx = x - rng() * 24;
      while (xx < x + w) {
        const len = 10 + rng() * 30;
        let c = shade(base, (rng() - 0.5) * 0.34);
        if (rng() < 0.2) c = mix(c, '#7a6650', 0.35);
        g.fillStyle = c; g.fillRect(xx + 0.5, yy + 0.4, len - 1.2, ch - 0.9);
        g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(xx + 0.5, yy + 0.4, len - 1.2, 0.8);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(xx + 0.5, yy + ch - 1.6, len - 1.2, 0.8);
        xx += len;
      }
      yy += ch;
    }
    g.restore();
  }
  // tiled roof surface clipped to a path. dir 'v' = tile channels run vertically (ridge left–right);
  // 'h' = channels run horizontally (ridge front–back).
  function tileRoof(g, path, bb, o) {
    const base = o.base, pitch = o.pitch || 7, lit = o.lit || 0, rng = o.rng;
    const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
    g.save(); path(g); g.clip();
    g.fillStyle = lg(g, 0, bb[1], 0, bb[3], [[0, shade(base, 0.12 + lit)], [0.65, shade(base, lit)], [1, shade(base, -0.2 + lit)]]);
    g.fillRect(bb[0], bb[1], bw, bh);
    if (o.dir === 'h') {
      for (let y = bb[1]; y < bb[3]; y += pitch) {
        g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(bb[0], y, bw, 1.3);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(bb[0], y + pitch * 0.28, bw, pitch * 0.24);
        g.fillStyle = 'rgba(0,0,0,0.09)'; g.fillRect(bb[0], y + pitch * 0.62, bw, pitch * 0.3);
      }
      for (let x = bb[0]; x < bb[2]; x += o.course || 9) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x, bb[1], 1, bh); }
    } else {
      for (let x = bb[0] + (o.ox || 0); x < bb[2]; x += pitch) {
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, bb[1], 1.3, bh);
        g.fillStyle = 'rgba(255,255,255,0.13)'; g.fillRect(x + pitch * 0.28, bb[1], pitch * 0.24, bh);
        g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(x + pitch * 0.62, bb[1], pitch * 0.3, bh);
      }
      for (let y = bb[3]; y > bb[1]; y -= o.course || 9) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(bb[0], y, bw, 1); }
    }
    if (rng) speckle(g, bb[0], bb[1], bw, bh, rng, floor(bw * bh / 90), ['rgba(0,0,0,0.10)', 'rgba(255,255,255,0.07)', 'rgba(70,90,50,0.10)'], 2.2);
    // shadow under ridge
    g.fillStyle = lg(g, 0, bb[1], 0, bb[1] + 10, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(bb[0], bb[1], bw, 10);
    g.restore();
    path(g); g.strokeStyle = shade(base, -0.5); g.lineWidth = 1.5; g.stroke();
  }
  // tile ends along an eave: xs from x0..x1, y = yf(x)
  function eaveEnds(g, x0, x1, yf, base, pitch = 7) {
    g.strokeStyle = shade(base, -0.55); g.lineWidth = 2.6;
    g.beginPath();
    for (let x = x0; x <= x1; x += 2) { const y = yf(x) + 1; if (x === x0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    for (let x = x0 + pitch * 0.5; x < x1 - 1; x += pitch) {
      const y = yf(x);
      g.fillStyle = shade(base, -0.25); ell(g, x + 0.6, y, pitch * 0.4, pitch * 0.34); g.fill();
      g.fillStyle = shade(base, 0.25); ell(g, x - 0.2, y - 0.6, pitch * 0.18, pitch * 0.13); g.fill();
    }
  }
  // roof with up-turned corners (翹角). Returns the eave function.
  function curvedRoof(g, o) {
    const { ex0, ex1, eY, rx0, rx1, rY } = o;
    const lift = o.lift == null ? 10 : o.lift, span = ex1 - ex0;
    const yf = (x) => {
      const u = (x - ex0) / span; const e = clamp(min(u, 1 - u) / (o.corner || 0.22), 0, 1);
      return eY - lift * (1 - e) * (1 - e);
    };
    const path = (g2) => {
      g2.beginPath(); g2.moveTo(ex0, yf(ex0));
      for (let i = 1; i <= 40; i++) { const x = ex0 + span * i / 40; g2.lineTo(x, yf(x)); }
      g2.quadraticCurveTo(lerp(rx1, ex1, 0.3), lerp(rY, eY - lift, 0.8), rx1, rY);
      g2.lineTo(rx0, rY);
      g2.quadraticCurveTo(lerp(rx0, ex0, 0.3), lerp(rY, eY - lift, 0.8), ex0, yf(ex0));
      g2.closePath();
    };
    tileRoof(g, path, [ex0 - 2, rY - 2, ex1 + 2, eY + 2], o);
    eaveEnds(g, ex0 + 3, ex1 - 3, yf, o.base, o.pitch || 7);
    // corner tips
    for (const [x, s] of [[ex0, -1], [ex1, 1]]) {
      g.strokeStyle = shade(o.base, -0.55); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x - s * 6, yf(x - s * 6)); g.quadraticCurveTo(x + s * 2, yf(x) + 1, x + s * 4, yf(x) - 5); g.stroke();
      if (o.tipCol) { g.strokeStyle = o.tipCol; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - s * 4, yf(x - s * 4) - 1); g.quadraticCurveTo(x + s * 2, yf(x) - 0.5, x + s * 3.5, yf(x) - 5.5); g.stroke(); }
    }
    return yf;
  }
  // ridge beam with swallowtail (fork) or curled ends
  function ridge(g, x0, x1, y, o = {}) {
    const th = o.th || 7, col = o.col || '#8a3a2a', tail = o.tail == null ? 20 : o.tail, lift = o.lift == null ? 4 : o.lift;
    const fork = o.fork !== false, mid = (x0 + x1) / 2;
    const end = (x, s) => { // s = +1 right end, -1 left end; called while tracing top → tail → bottom
      const by = y - lift;
      if (fork) {
        g.bezierCurveTo(x + s * tail * 0.35, by - 1, x + s * tail * 0.55, by - tail * 0.55, x + s * tail * 0.78, by - tail * 1.12);
        g.lineTo(x + s * tail * 0.74, by - tail * 0.68);
        g.lineTo(x + s * tail * 1.12, by - tail * 0.86);
        g.bezierCurveTo(x + s * tail * 0.75, by - tail * 0.2, x + s * tail * 0.35, by + th, x, by + th);
      } else {
        g.bezierCurveTo(x + s * tail * 0.4, by, x + s * tail * 0.7, by - tail * 0.2, x + s * tail * 0.75, by - tail * 0.65);
        g.quadraticCurveTo(x + s * tail * 0.55, by - tail * 0.95, x + s * tail * 0.4, by - tail * 0.6);
        g.quadraticCurveTo(x + s * tail * 0.5, by - tail * 0.3, x + s * tail * 0.3, by + th * 0.3);
        g.quadraticCurveTo(x + s * tail * 0.15, by + th, x, by + th);
      }
    };
    g.beginPath();
    g.moveTo(x0, y - lift);
    g.quadraticCurveTo(mid, y + lift * 0.7, x1, y - lift);
    end(x1, 1);
    g.quadraticCurveTo(mid, y + lift * 0.7 + th, x0, y - lift + th);
    // left end traced in reverse (bottom → tail → top)
    const by = y - lift, s = -1, x = x0;
    if (fork) {
      g.bezierCurveTo(x + s * tail * 0.35, by + th, x + s * tail * 0.75, by - tail * 0.2, x + s * tail * 1.12, by - tail * 0.86);
      g.lineTo(x + s * tail * 0.74, by - tail * 0.68);
      g.lineTo(x + s * tail * 0.78, by - tail * 1.12);
      g.bezierCurveTo(x + s * tail * 0.55, by - tail * 0.55, x + s * tail * 0.35, by - 1, x, by);
    } else {
      g.quadraticCurveTo(x + s * tail * 0.15, by + th, x + s * tail * 0.3, by + th * 0.3);
      g.quadraticCurveTo(x + s * tail * 0.5, by - tail * 0.3, x + s * tail * 0.4, by - tail * 0.6);
      g.quadraticCurveTo(x + s * tail * 0.55, by - tail * 0.95, x + s * tail * 0.75, by - tail * 0.65);
      g.bezierCurveTo(x + s * tail * 0.7, by - tail * 0.2, x + s * tail * 0.4, by, x, by);
    }
    g.closePath();
    g.fillStyle = lg(g, 0, y - lift - tail, 0, y + th, [[0, shade(col, 0.25)], [0.6, col], [1, shade(col, -0.3)]]);
    g.fill();
    g.strokeStyle = shade(col, -0.55); g.lineWidth = 1.4; g.stroke();
    // top highlight
    g.strokeStyle = rgba('#ffffff', 0.25); g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0 + 2, y - lift + 1); g.quadraticCurveTo(mid, y + lift * 0.7 + 1, x1 - 2, y - lift + 1); g.stroke();
    // 剪黏 decorative band
    if (o.deco) {
      const n = floor((x1 - x0) / 5);
      for (let i = 1; i < n; i++) {
        const xx = x0 + (x1 - x0) * i / n, u = (xx - mid) / ((x1 - x0) / 2);
        const yy = y - lift + lift * 1.7 * (1 - u * u) * 0.5 + th * 0.55;
        g.fillStyle = o.deco[i % o.deco.length];
        g.fillRect(xx - 1.3, yy - 1, 2.6, 2);
      }
    }
  }
  // small cut-porcelain dragon on a ridge. (x,y) = tail base; dir = +1 → head to the right.
  function dragon(g, x, y, dir, s, body, accent) {
    g.save(); g.translate(x, y); g.scale(dir * s, s);
    const path = () => { g.beginPath(); g.moveTo(0, -1); g.bezierCurveTo(6, -14, 13, 7, 20, -5); g.bezierCurveTo(24, -11, 27, -12, 30, -10); };
    path(); g.strokeStyle = shade(body, -0.6); g.lineWidth = 5.4; g.stroke();
    path(); g.strokeStyle = body; g.lineWidth = 3.6; g.stroke();
    g.save(); g.translate(0, 0.9); path(); g.strokeStyle = accent; g.lineWidth = 1.1; g.stroke(); g.restore();
    // dorsal fins
    g.fillStyle = accent;
    for (const [fx, fy, a] of [[4, -9, -0.6], [9, -5, 0.3], [17, -6, -0.5], [23, -10, -0.2]]) {
      g.save(); g.translate(fx, fy); g.rotate(a); P(g, [-1.6, 0, 0, -3.6, 1.6, 0]); g.fill(); g.restore();
    }
    // legs
    g.strokeStyle = shade(body, -0.35); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(8, -3); g.lineTo(6, 2); g.lineTo(8, 3); g.moveTo(19, -3); g.lineTo(18, 2); g.lineTo(20, 3); g.stroke();
    // head
    g.fillStyle = body; g.strokeStyle = shade(body, -0.6); g.lineWidth = 1;
    g.beginPath(); g.ellipse(31.5, -11, 3.6, 2.8, -0.2, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(33, -12); g.lineTo(37.5, -11.5); g.lineTo(34, -9.5); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = accent; g.lineWidth = 1;
    g.beginPath(); g.moveTo(30.5, -13.5); g.quadraticCurveTo(28, -17, 25.5, -17); g.stroke();
    g.beginPath(); g.moveTo(35, -10); g.quadraticCurveTo(38, -7, 40, -9); g.stroke();
    g.fillStyle = '#fff6d0'; g.fillRect(31.5, -12.4, 1.2, 1.2);
    // tail flame
    g.fillStyle = accent; P(g, [0, -1, -4, -6, -2, -1, -5, 1]); g.fill();
    g.restore();
  }
  function flamingPearl(g, x, y, r) {
    g.fillStyle = '#e8572e';
    for (let i = 0; i < 5; i++) {
      const a = -PI / 2 + (i - 2) * 0.55;
      P(g, [x + cos(a - 0.35) * r, y + sin(a - 0.35) * r, x + cos(a) * r * 2.1, y + sin(a) * r * 2.1, x + cos(a + 0.35) * r, y + sin(a + 0.35) * r]);
      g.fill();
    }
    g.fillStyle = rg(g, x - r * 0.3, y - r * 0.3, 0, r * 1.2, [[0, '#fff6c8'], [0.5, '#f2c24e'], [1, '#c9781e']]);
    ell(g, x, y, r, r); g.fill();
    g.strokeStyle = '#8a4a14'; g.lineWidth = 0.8; g.stroke();
  }
  // gourd / pagoda finial
  function gourd(g, x, y, s, col = '#e6b94a') {
    const dk = shade(col, -0.45);
    g.fillStyle = rg(g, x - 2 * s, y - 10 * s, 0, 10 * s, [[0, shade(col, 0.45)], [0.6, col], [1, shade(col, -0.3)]]);
    g.strokeStyle = dk; g.lineWidth = 0.9;
    ell(g, x, y - 4 * s, 5 * s, 4.2 * s); g.fill(); g.stroke();
    ell(g, x, y - 10.5 * s, 3.2 * s, 3 * s); g.fill(); g.stroke();
    g.fillRect(x - 0.8 * s, y - 16 * s, 1.6 * s, 3 * s);
    g.fillStyle = dk; g.fillRect(x - 4 * s, y - 0.5 * s, 8 * s, 1.6 * s);
  }
  // round silk lantern; (x,y) = top of the cord. Returns bottom y.
  function lantern(g, x, y, r, o = {}) {
    const col = o.col || '#d8352a', cord = o.cord == null ? 3 : o.cord;
    g.strokeStyle = '#2a1a14'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + cord); g.stroke();
    const top = y + cord, cy = top + 2 + r * 1.05;
    g.fillStyle = '#c99a3a'; g.fillRect(x - r * 0.55, top, r * 1.1, 2.4);
    g.fillStyle = rg(g, x - r * 0.25, cy - r * 0.2, 0, r * 1.25, [[0, o.glow || '#ffd890'], [0.35, shade(col, 0.15)], [0.8, col], [1, shade(col, -0.45)]]);
    ell(g, x, cy, r, r * 1.08); g.fill();
    g.strokeStyle = rgba(shade(col, -0.5), 0.55); g.lineWidth = 0.8;
    for (const k of [-0.55, 0, 0.55]) { g.beginPath(); g.ellipse(x, cy, r * abs(k) + 0.1, r * 1.06, 0, -PI / 2, PI / 2, k < 0); g.stroke(); }
    g.strokeStyle = shade(col, -0.55); g.lineWidth = 1; ell(g, x, cy, r, r * 1.08); g.stroke();
    if (o.ch) {
      g.fillStyle = o.chCol || '#2a1208'; g.font = F(max(6, r * 0.95), true);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(o.ch, x, cy + 0.5);
    }
    const bot = cy + r * 1.08;
    g.fillStyle = '#c99a3a'; g.fillRect(x - r * 0.45, bot - 1, r * 0.9, 2.4);
    g.strokeStyle = o.tassel || '#d8352a'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - 1, bot + 1); g.lineTo(x - 1.5, bot + 4 + r * 0.4); g.moveTo(x + 1, bot + 1); g.lineTo(x + 1.5, bot + 4 + r * 0.4); g.moveTo(x, bot + 1); g.lineTo(x, bot + 5 + r * 0.45); g.stroke();
    return bot;
  }
  function vPlaque(g, cx, y, w, h, text, o = {}) {
    const bg = o.bg || '#1d2a55', fg = o.fg || '#f0cf6a', fr = o.frame || '#d9a93e';
    g.fillStyle = shade(fr, -0.4); rr(g, cx - w / 2 - 2, y - 2, w + 4, h + 4, 2); g.fill();
    g.fillStyle = lg(g, cx - w / 2, 0, cx + w / 2, 0, [[0, shade(fr, 0.3)], [0.5, fr], [1, shade(fr, -0.25)]]);
    rr(g, cx - w / 2 - 1, y - 1, w + 2, h + 2, 2); g.fill();
    g.fillStyle = bg; g.fillRect(cx - w / 2 + 2.5, y + 3, w - 5, h - 6);
    // crown
    g.fillStyle = fr; P(g, [cx - w / 2 - 2, y - 1, cx, y - 6, cx + w / 2 + 2, y - 1]); g.fill();
    const n = text.length, fs = min((w - 6) * 0.95, (h - 8) / n * 0.92);
    g.fillStyle = fg; g.font = F(fs, true); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) g.fillText(text[i], cx, y + 4 + (h - 8) * (i + 0.5) / n);
  }
  // horizontal plaque, right-to-left (traditional)
  function hPlaque(g, cx, cy, w, h, text, o = {}) {
    const bg = o.bg || '#2b1a12', fg = o.fg || '#e9c46a', fr = o.frame || '#7a4a26';
    g.fillStyle = shade(fr, -0.45); rr(g, cx - w / 2 - 1.5, cy - h / 2 - 1.5, w + 3, h + 3, 2); g.fill();
    g.fillStyle = fr; rr(g, cx - w / 2, cy - h / 2, w, h, 1.5); g.fill();
    g.fillStyle = bg; g.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4);
    const chars = [...text].reverse(), n = chars.length, fs = min(h - 4.5, (w - 6) / n * 0.9);
    g.fillStyle = fg; g.font = F(fs, true); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < n; i++) g.fillText(chars[i], cx - w / 2 + 3 + (w - 6) * (i + 0.5) / n, cy + 0.5);
  }
  function woodPlanks(g, x, y, w, h, base, rng, vertical = true, pw = 6) {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = base; g.fillRect(x, y, w, h);
    if (vertical) {
      for (let xx = x; xx < x + w; xx += pw) {
        g.fillStyle = shade(base, (rng() - 0.5) * 0.18); g.fillRect(xx, y, pw - 0.8, h);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(xx + pw - 0.8, y, 0.8, h);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(xx, y, 0.8, h);
      }
    } else {
      for (let yy = y; yy < y + h; yy += pw) {
        g.fillStyle = shade(base, (rng() - 0.5) * 0.18); g.fillRect(x, yy, w, pw - 0.8);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, yy + pw - 0.8, w, 0.8);
      }
    }
    g.restore();
  }
  // window with wooden/stone bars
  function barWindow(g, x, y, w, h, frame, bars = 5, dark = '#1b1412') {
    g.fillStyle = shade(frame, -0.4); g.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
    g.fillStyle = frame; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = lg(g, 0, y, 0, y + h, [[0, dark], [1, shade(dark, 0.15)]]); g.fillRect(x + 1, y + 1, w - 2, h - 2);
    for (let i = 1; i <= bars; i++) {
      const xx = x + w * i / (bars + 1);
      g.fillStyle = shade(frame, 0.1); g.fillRect(xx - 1, y + 1, 2, h - 2);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(xx - 1, y + 1, 0.7, h - 2);
    }
  }
  function grassTuft(g, x, y, s, col = '#5f8a3a') {
    g.strokeStyle = col; g.lineWidth = 1.1;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i, y); g.quadraticCurveTo(x + i * 1.5, y - 4 * s, x + i * 2.6, y - 6 * s - abs(i)); g.stroke(); }
  }

  // ---------------------------------------------------------------------------------------------
  // registration helpers
  // ---------------------------------------------------------------------------------------------
  function doorOf(o, spec) {
    const w = o.w || spec.w, lo = spec.doorMin || 0;
    const d = o.door != null ? o.door : (spec.doorDefault ? spec.doorDefault(w) : floor((w - 1) / 2));
    return clamp(d | 0, lo, max(lo, w - 1 - lo));
  }
  // spec: { w, h, margin:[l,t,r,b] | fn(W,H,o), paint(g,W,H,o,door,rng), key?(o), live?(ctx,px,py,o,t,W,H,door),
  //         lights?(o,W,H,door), door?:false, solidAt?, solid?, over?, anim? }
  function building(type, spec) {
    const sz = (o) => { const w = o.w || spec.w, h = o.h || spec.h; return [w, h, w * T, h * T]; };
    const def = {
      w: spec.w, h: spec.h, solid: spec.solid == null ? true : spec.solid,
      anim: spec.anim != null ? spec.anim : !!spec.live, over: !!spec.over,
      draw(ctx, px, py, o, t) {
        const [w, h, W, H] = sz(o);
        const d = spec.door === false ? 0 : doorOf(o, spec);
        const m = typeof spec.margin === 'function' ? spec.margin(W, H, o) : spec.margin;
        const key = `${type}:${w}x${h}:${o.v | 0}:${d}:${spec.key ? spec.key(o) : ''}`;
        const s = spr(key, W + m[0] + m[2], H + m[1] + m[3], m[0], m[1], (g) => spec.paint(g, W, H, o, d, rngFor(key)));
        if (spec.blit) spec.blit(ctx, s, px, py, o, t, W, H, d);
        else put(ctx, s, px, py);
        if (spec.live) spec.live(ctx, px, py, o, t, W, H, d);
      },
    };
    if (spec.solidAt) def.solidAt = spec.solidAt;
    else if (spec.door !== false) {
      def.solidAt = (o, dx, dy) => !(dy === (o.h || spec.h) - 1 && dx === doorOf(o, spec));
    }
    if (spec.lights) def.lights = (o) => { const [, , W, H] = sz(o); return spec.lights(o, W, H, spec.door === false ? 0 : doorOf(o, spec)); };
    G.Objects.define(type, def);
  }

  // live glow helper (additive) for sparks / candle flames
  const GLOW = {};
  function glowSpr(col) {
    if (!GLOW[col + G.S]) {
      GLOW[col + G.S] = spr('glow:' + col, 64, 64, 32, 32, (g) => {
        g.fillStyle = rg(g, 0, 0, 0, 32, [[0, rgba(col, 1)], [0.2, rgba(col, 0.55)], [0.5, rgba(col, 0.15)], [1, rgba(col, 0)]]);
        g.fillRect(-32, -32, 64, 64);
      });
    }
    return GLOW[col + G.S];
  }
  function glow(ctx, x, y, r, col, a = 1) {
    if (a <= 0.004) return;
    const s = glowSpr(col), op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * min(1, a);
    ctx.drawImage(s, x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  function flame(ctx, x, y, s, t, seed) {
    const f = 1 + 0.18 * sin(t * 13 + seed) + 0.1 * sin(t * 21 + seed * 2);
    glow(ctx, x, y - 3 * s, 12 * s * f, '#ffb050', 0.55);
    ctx.fillStyle = '#ffcf6a';
    ctx.beginPath(); ctx.moveTo(x, y - 7 * s * f); ctx.quadraticCurveTo(x + 2.4 * s, y - 1 * s, x, y); ctx.quadraticCurveTo(x - 2.4 * s, y - 1 * s, x, y - 7 * s * f); ctx.fill();
    ctx.fillStyle = '#fff8e0'; ell(ctx, x, y - 1.6 * s, 0.9 * s, 1.8 * s); ctx.fill();
  }

  // =============================================================================================
  // 伙房 hakka_house
  // =============================================================================================
  building('hakka_house', {
    w: 6, h: 4, doorMin: 1, margin: [14, 60, 22, 14],
    key: (o) => o.text || '',
    paint(g, W, H, o, d, rng) {
      const ww = 78, plas = '#ece5d3', roofC = '#5a5e63', wood = '#6a4630';
      baseShadow(g, W, H);
      // 禾埕 courtyard
      const cy0 = 132, cy1 = H - 30;
      g.fillStyle = lg(g, 0, cy0, 0, cy1, [[0, '#9c8a6a'], [0.25, '#b9a682'], [1, '#c8b690']]);
      g.fillRect(ww, cy0, W - 2 * ww, cy1 - cy0 + 4);
      g.save(); g.beginPath(); g.rect(ww, cy0, W - 2 * ww, cy1 - cy0 + 4); g.clip();
      for (let y = cy0 + 10; y < cy1 + 4; y += 12) { g.fillStyle = 'rgba(80,60,40,0.12)'; g.fillRect(ww, y, W, 1); }
      for (let y = cy0 + 10, r = 0; y < cy1 + 4; y += 12, r++) for (let x = ww + (r % 2) * 12; x < W - ww; x += 24) { g.fillStyle = 'rgba(80,60,40,0.10)'; g.fillRect(x, y, 1, 12); }
      speckle(g, ww, cy0, W - 2 * ww, cy1 - cy0, rng, 220, ['rgba(255,250,230,0.25)', 'rgba(80,60,40,0.2)']);
      g.restore();
      // ---- main hall 正身
      const hx = W / 2, eaveY = 70, ridgeY = -30, wallTop = 60;
      plaster(g, ww - 2, wallTop, W - 2 * ww + 4, cy0 - wallTop, plas, rng);
      // brick skirting
      bricks(g, ww - 2, cy0 - 12, W - 2 * ww + 4, 12, '#a0573f', rng, { bw: 12, bh: 4 });
      // door, couplets, plaque
      g.fillStyle = shade(wood, -0.45); g.fillRect(hx - 19, 92, 38, cy0 - 92);
      g.fillStyle = lg(g, 0, 94, 0, cy0, [[0, '#1d120c'], [1, '#3a2418']]); g.fillRect(hx - 16, 95, 32, cy0 - 95);
      woodPlanks(g, hx - 16, 95, 9, cy0 - 95, wood, rng, true, 4.5);
      woodPlanks(g, hx + 7, 95, 9, cy0 - 95, wood, rng, true, 4.5);
      g.fillStyle = '#8a6a3a'; g.fillRect(hx - 18, cy0 - 3, 36, 3);
      for (const s of [-1, 1]) {
        const x = hx + s * 26 - 3;
        g.fillStyle = '#c4302a'; g.fillRect(x, 96, 6, 30);
        g.fillStyle = 'rgba(30,10,8,0.55)';
        for (let i = 0; i < 5; i++) g.fillRect(x + 1.8, 99 + i * 5.6, 2.4, 2.6);
      }
      hPlaque(g, hx, 84, 48, 13, o.text || '穎川堂', { bg: '#20140e', fg: '#e8c264', frame: '#6a4026' });
      for (const s of [-1, 1]) {
        barWindow(g, hx + s * 64 - 11, 98, 22, 18, '#6a4a30', 4);
        barWindow(g, hx + s * 104 - 8, 100, 16, 15, '#6a4a30', 3);
      }
      faceAO(g, ww - 2, wallTop, W - 2 * ww + 4, cy0 - wallTop, { top: 0.55, th: 22 });
      // stone step
      g.fillStyle = '#aaa59a'; g.fillRect(ww, cy0, W - 2 * ww, 5);
      g.fillStyle = '#8b867c'; g.fillRect(ww, cy0 + 5, W - 2 * ww, 2);
      // hall roof
      tileRoof(g, (g2) => P(g2, [ww - 14, eaveY, W - ww + 14, eaveY, W - ww + 14, ridgeY + 4, ww - 14, ridgeY + 4]),
        [ww - 14, ridgeY + 4, W - ww + 14, eaveY], { base: roofC, pitch: 6.5, rng });
      eaveEnds(g, ww - 12, W - ww + 12, () => eaveY, roofC, 6.5);
      ridge(g, ww - 10, W - ww + 10, ridgeY + 4, { th: 6, col: '#6b6f72', tail: 9, lift: 3, fork: false });
      // lanterns
      for (const s of [-1, 1]) lantern(g, hx + s * 36, eaveY + 1, 6.5, { col: '#d23a2c' });
      // ---- wings 橫屋
      const gH = 58, apex = 30;
      for (const side of [0, 1]) {
        const x0 = side ? W - ww : 0, xc = x0 + ww / 2;
        const lp = [x0 - 6, H - gH + 2, xc, H - gH - apex, xc, -34, x0 - 6, -22];
        const rp = [xc, H - gH - apex, x0 + ww + 6, H - gH + 2, x0 + ww + 6, -22, xc, -34];
        tileRoof(g, (g2) => P(g2, lp), [x0 - 6, -34, xc, H - gH + 2], { base: roofC, pitch: 6.5, dir: 'h', lit: 0.1, rng });
        tileRoof(g, (g2) => P(g2, rp), [xc, -34, x0 + ww + 6, H - gH + 2], { base: roofC, pitch: 6.5, dir: 'h', lit: -0.12, rng });
        // ridge (front–back)
        g.fillStyle = lg(g, xc - 4, 0, xc + 4, 0, [[0, '#7a7e82'], [1, '#4a4e52']]);
        P(g, [xc - 3.5, -38, xc + 3.5, -38, xc + 3.5, H - gH - apex - 2, xc - 3.5, H - gH - apex - 2]); g.fill();
        g.strokeStyle = '#33363a'; g.lineWidth = 1; g.stroke();
        // eave edge along the long sides
        g.fillStyle = '#3e4145'; g.fillRect(x0 - 7, -22, 3, H - gH + 24); g.fillRect(x0 + ww + 4, -22, 3, H - gH + 24);
        // gable face (white plaster, 馬背 rounded top)
        g.save();
        g.beginPath();
        g.moveTo(x0, H); g.lineTo(x0, H - gH);
        g.quadraticCurveTo(xc - 22, H - gH - apex * 0.55, xc - 9, H - gH - apex + 1);
        g.quadraticCurveTo(xc, H - gH - apex - 6, xc + 9, H - gH - apex + 1);
        g.quadraticCurveTo(xc + 22, H - gH - apex * 0.55, x0 + ww, H - gH);
        g.lineTo(x0 + ww, H); g.closePath();
        g.clip();
        plaster(g, x0, H - gH - apex - 8, ww, gH + apex + 8, plas, rng);
        bricks(g, x0, H - 14, ww, 14, '#a0573f', rng, { bw: 12, bh: 4 });
        faceAO(g, x0, H - gH - apex - 8, ww, gH + apex + 8, { top: 0.12, th: 8 });
        g.restore();
        // 馬背 coping
        g.strokeStyle = '#45484c'; g.lineWidth = 3.5;
        g.beginPath(); g.moveTo(x0 - 5, H - gH + 3);
        g.quadraticCurveTo(xc - 22, H - gH - apex * 0.55, xc - 9, H - gH - apex + 1);
        g.quadraticCurveTo(xc, H - gH - apex - 6, xc + 9, H - gH - apex + 1);
        g.quadraticCurveTo(xc + 22, H - gH - apex * 0.55, x0 + ww + 5, H - gH + 3); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0 - 3, H - gH + 1); g.quadraticCurveTo(xc - 22, H - gH - apex * 0.55 - 2, xc - 9, H - gH - apex - 1); g.quadraticCurveTo(xc, H - gH - apex - 8, xc + 9, H - gH - apex - 1); g.stroke();
        // 懸魚 gable ornament
        g.strokeStyle = '#8a7f6a'; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(xc, H - gH - apex + 6); g.lineTo(xc, H - gH - apex + 15);
        g.moveTo(xc - 7, H - gH - apex + 12); g.quadraticCurveTo(xc - 3, H - gH - apex + 7, xc, H - gH - apex + 12);
        g.quadraticCurveTo(xc + 3, H - gH - apex + 7, xc + 7, H - gH - apex + 12); g.stroke();
        g.fillStyle = '#4f7f88'; ell(g, xc, H - gH - apex + 16, 2.2, 2.2); g.fill();
        // window
        barWindow(g, xc - 10, H - gH + 12, 20, 18, '#6a4a30', 4);
        g.strokeStyle = '#5a5e63'; g.lineWidth = 2; g.beginPath(); g.moveTo(xc - 13, H - gH + 9); g.lineTo(xc + 13, H - gH + 9); g.stroke();
      }
      // ---- front wall & 門樓 gate
      const fwT = H - 30;
      plaster(g, ww, fwT, W - 2 * ww, 30, plas, rng);
      bricks(g, ww, H - 10, W - 2 * ww, 10, '#a0573f', rng, { bw: 12, bh: 4 });
      faceAO(g, ww, fwT, W - 2 * ww, 30, { top: 0.25, th: 6 });
      g.fillStyle = '#4c5054'; g.fillRect(ww - 2, fwT - 5, W - 2 * ww + 4, 6);
      eaveEnds(g, ww, W - ww, () => fwT, '#5a5e63', 5);
      const gx = d * T;
      // gate pillars
      for (const px of [gx + 6, gx + 47]) {
        plaster(g, px, H - 66, 11, 66, '#e6dfcc', rng);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(px + 8, H - 66, 3, 66);
        g.fillStyle = '#c4302a'; g.fillRect(px + 2.5, H - 54, 6, 26);
      }
      // opening: view into the courtyard + open leaves
      g.fillStyle = lg(g, 0, H - 52, 0, H, [[0, '#a89470'], [1, '#c9b791']]); g.fillRect(gx + 17, H - 52, 30, 52);
      g.fillStyle = 'rgba(40,24,14,0.35)'; g.fillRect(gx + 17, H - 52, 30, 8);
      woodPlanks(g, gx + 17, H - 52, 5, 52, '#6e4a30', rng, true, 2.5);
      woodPlanks(g, gx + 42, H - 52, 5, 52, '#5e3e28', rng, true, 2.5);
      g.fillStyle = '#7a6a54'; g.fillRect(gx + 15, H - 4, 34, 4);
      g.fillStyle = '#3a2618'; g.fillRect(gx + 15, H - 55, 34, 4);
      // gate roof
      const yf = curvedRoof(g, { ex0: gx - 4, ex1: gx + 68, eY: H - 60, rx0: gx + 6, rx1: gx + 58, rY: H - 78, lift: 5, base: roofC, pitch: 5.5, rng });
      ridge(g, gx + 8, gx + 56, H - 80, { th: 4, col: '#6b6f72', tail: 9, lift: 2, fork: false });
      void yf;
      // a pair of persimmon trays drying in the courtyard
      for (const tx of [hx - 70, hx + 64]) {
        ellShadow(g, tx + 2, cy0 + 26, 20, 7, 0.3);
        g.fillStyle = '#b89a5c'; ell(g, tx, cy0 + 22, 18, 8); g.fill();
        g.strokeStyle = '#7d6436'; g.lineWidth = 1.2; g.stroke();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * TAU, rr2 = i % 2 ? 10 : 5;
          g.fillStyle = '#e07a2a'; ell(g, tx + cos(a) * rr2, cy0 + 22 + sin(a) * rr2 * 0.42, 3.2, 2.2); g.fill();
          g.fillStyle = '#5b4a22'; g.fillRect(tx + cos(a) * rr2 - 0.6, cy0 + 21 + sin(a) * rr2 * 0.42, 1.2, 1.2);
        }
      }
    },
    lights: (o, W) => [{ dx: W / 2 - 36, dy: 82, r: 70, color: '#ff9a50', flicker: 0.3 }, { dx: W / 2 + 36, dy: 82, r: 70, color: '#ff9a50', flicker: 0.3 }],
  });

  // =============================================================================================
  // drying_rack — v0 米粉 (rice noodles on bamboo screens) / v1 柿餅 (persimmons on round trays)
  // =============================================================================================
  building('drying_rack', {
    w: 2, h: 1, door: false, margin: [10, 40, 12, 8],
    paint(g, W, H, o, d, rng) {
      const bamboo = '#b49a5a', bdk = '#7a6434';
      const pole = (x0, y0, x1, y1, w = 3) => {
        g.strokeStyle = bdk; g.lineWidth = w + 1.4; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = bamboo; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = 'rgba(255,250,220,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x0 - 0.8, y0); g.lineTo(x1 - 0.8, y1); g.stroke();
      };
      ellShadow(g, W / 2 + 6, H - 8, W * 0.5, 12, 0.35);
      if ((o.v | 0) === 0) {
        // tilted bamboo screen facing the sun, rows of square 米粉 cakes
        pole(14, -6, 14, H - 26); pole(W - 14, -6, W - 14, H - 26);
        pole(8, 28, 8, H - 6); pole(W - 8, 28, W - 8, H - 6);
        const q = [10, -8, W - 10, -8, W - 2, 36, 2, 36];
        fillP(g, q, '#c7ad6c', bdk, 1.6);
        g.save(); P(g, q); g.clip();
        for (let x = 0; x < W + 10; x += 3) { g.fillStyle = 'rgba(90,70,30,0.22)'; g.fillRect(x, -10, 1, 50); }
        g.restore();
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 5; c++) {
            const y = -4 + r * 20, h = 16, sk = (y + h / 2 + 8) / 44 * 8;
            const x = 14 - sk + c * 21.5 + (r ? -1.5 : 0);
            g.fillStyle = 'rgba(60,40,10,0.25)'; g.fillRect(x + 1.5, y + 1.5, 18, h);
            g.fillStyle = lg(g, x, y, x + 18, y + h, [[0, '#fffdf4'], [1, '#ddd6c2']]); g.fillRect(x, y, 18, h);
            g.strokeStyle = 'rgba(150,140,120,0.55)'; g.lineWidth = 0.6;
            for (let k = 2; k < h; k += 2) { g.beginPath(); g.moveTo(x + 1, y + k); for (let xx = x + 1; xx <= x + 17; xx += 2) g.lineTo(xx, y + k + sin(xx * 1.7 + k) * 0.7); g.stroke(); }
            g.strokeStyle = 'rgba(120,110,90,0.6)'; g.strokeRect(x + 0.3, y + 0.3, 17.4, h - 0.6);
          }
        }
        pole(0, 36, W, 36, 3.4);
        pole(8, -9, W - 8, -9, 3);
      } else {
        // tiered stand with round 竹篩 trays of persimmons
        for (const x of [8, W - 8]) pole(x, -18, x, H - 6);
        for (const x of [22, W - 22]) pole(x, -26, x, H - 20, 2.6);
        const tray = (cx, cy, rx) => {
          g.fillStyle = 'rgba(40,25,10,0.3)'; ell(g, cx + 2, cy + 4, rx, rx * 0.42); g.fill();
          g.fillStyle = '#a88a4c'; ell(g, cx, cy + 2, rx, rx * 0.44); g.fill();
          g.fillStyle = '#c6a868'; ell(g, cx, cy, rx, rx * 0.42); g.fill();
          g.strokeStyle = '#7a6030'; g.lineWidth = 1.4; g.stroke();
          g.strokeStyle = 'rgba(110,80,30,0.35)'; g.lineWidth = 0.6;
          for (let k = 0.3; k < 1; k += 0.22) { ell(g, cx, cy, rx * k, rx * 0.42 * k); g.stroke(); }
          const items = [];
          for (const [rad, n] of [[0, 1], [0.42, 6], [0.78, 11]]) for (let i = 0; i < n; i++) {
            const a = i / n * TAU + rad * 3;
            items.push([cx + cos(a) * rx * rad, cy + sin(a) * rx * rad * 0.42]);
          }
          items.sort((a, b) => a[1] - b[1]);
          for (const [x, y] of items) {
            g.fillStyle = '#8a3c10'; ell(g, x + 0.4, y + 1, 4.2, 2.6); g.fill();
            g.fillStyle = rg(g, x - 1.2, y - 0.8, 0, 4.5, [[0, '#ffb760'], [0.6, '#e2761f'], [1, '#b04e14']]); ell(g, x, y, 4, 2.5); g.fill();
            g.fillStyle = '#4c3a18'; P(g, [x - 1.6, y - 0.6, x + 1.6, y - 0.6, x, y - 2.2]); g.fill();
          }
        };
        pole(4, 18, W - 4, 18, 3); pole(18, -12, W - 18, -12, 2.6);
        tray(W * 0.3, -14, 24); tray(W * 0.7, -14, 24);
        tray(W * 0.27, 16, 26); tray(W * 0.73, 16, 26);
        pole(4, 40, W - 4, 40, 3);
      }
    },
  });

  // =============================================================================================
  // 紅毛城 red_fort
  // =============================================================================================
  building('red_fort', {
    w: 5, h: 4, margin: [18, 100, 26, 14],
    paint(g, W, H, o, d, rng) {
      // tall two-storey front face; the flat roof terrace is drawn foreshortened above it
      const red = '#b23a26', Fh = 150, ft = H - Fh, top = ft - 116;
      baseShadow(g, W, H, 0.38, 130);
      const dy0 = top + 10, dy1 = ft + 4;
      g.fillStyle = lg(g, 0, dy0, 0, dy1, [[0, '#7d7568'], [1, '#a2988a']]); g.fillRect(4, dy0, W - 8, dy1 - dy0);
      g.save(); g.beginPath(); g.rect(4, dy0, W - 8, dy1 - dy0); g.clip();
      for (let y = dy0; y < dy1; y += 8) for (let x = 4 + ((y / 8) % 2) * 9; x < W; x += 18) {
        g.fillStyle = shade('#968d7c', (rng() - 0.5) * 0.15 + (y - dy0) / (dy1 - dy0) * 0.06); g.fillRect(x + 0.5, y + 0.5, 17, 7);
      }
      for (let i = 0; i < 6; i++) { const x = rng() * W, y = dy0 + rng() * (dy1 - dy0); g.fillStyle = rg(g, x, y, 0, 16, [[0, 'rgba(70,90,50,0.3)'], [1, 'rgba(70,90,50,0)']]); g.fillRect(x - 16, y - 16, 32, 32); }
      g.fillStyle = lg(g, 0, dy0, 0, dy0 + 14, [[0, 'rgba(20,10,10,0.45)'], [1, 'rgba(20,10,10,0)']]); g.fillRect(4, dy0, W - 8, 14);
      g.restore();
      // back parapet (inner face toward us) & side parapet caps
      bricks(g, 0, top, W, 14, shade(red, -0.12), rng, { bw: 10, bh: 4 });
      g.fillStyle = '#d4c3a4'; g.fillRect(0, top - 4, W, 5);
      for (let x = 0; x < W; x += 32) { g.fillStyle = '#d4c3a4'; g.fillRect(x, top - 10, 20, 7); g.fillStyle = shade(red, 0.05); g.fillRect(x, top - 4, 20, 2); }
      for (const x of [0, W - 9]) {
        g.fillStyle = lg(g, x, 0, x + 9, 0, [[0, '#d8c8aa'], [1, '#a8987c']]); g.fillRect(x, top - 4, 9, ft - top + 4);
      }
      // chimney & stair hut
      bricks(g, 30, top + 2, 14, 30, shade(red, -0.05), rng, { bw: 7, bh: 4 });
      g.fillStyle = '#d4c3a4'; g.fillRect(28, top, 18, 4); g.fillStyle = '#2a1a16'; g.fillRect(31, top - 1, 12, 2);
      const sx = W - 96, sy = top + 4;
      g.fillStyle = 'rgba(30,20,20,0.3)'; g.fillRect(sx + 6, sy + 36, 52, 8);
      bricks(g, sx, sy + 12, 50, 28, red, rng, { bw: 10, bh: 4 });
      g.fillStyle = '#d0c4ac'; g.fillRect(sx - 2, sy + 6, 54, 7);
      g.fillStyle = '#9a917f'; g.fillRect(sx - 2, sy, 54, 7);
      g.fillStyle = '#2a1512'; rr(g, sx + 18, sy + 18, 14, 22, [7, 7, 0, 0]); g.fill();
      faceAO(g, sx, sy + 12, 50, 28, { top: 0.35, th: 6 });
      // two old cannons on carriages behind the front parapet, muzzles out to sea
      for (const cx of [W * 0.3, W * 0.56]) {
        const cy = ft - 30;
        g.fillStyle = 'rgba(20,10,10,0.35)'; ell(g, cx + 3, cy + 22, 16, 5); g.fill();
        g.fillStyle = '#5a3a24'; P(g, [cx - 10, cy + 2, cx + 10, cy + 2, cx + 12, cy + 20, cx - 12, cy + 20]); g.fill();
        for (const s of [-1, 1]) { g.fillStyle = '#3a2416'; rr(g, cx + s * 12 - 2.5, cy + 6, 5, 16, 2); g.fill(); }
        g.fillStyle = lg(g, cx - 5, 0, cx + 5, 0, [[0, '#5a5e62'], [0.4, '#2e3134'], [1, '#141618']]);
        rr(g, cx - 5, cy - 2, 10, 26, 4); g.fill();
        g.fillStyle = '#2a2c2e'; ell(g, cx, cy - 4, 3, 3); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx - 3, cy + 1, 1.2, 20);
      }
      // flag pole
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(70, top + 40); g.lineTo(70, top - 70); g.stroke();
      g.fillStyle = '#c9a24a'; ell(g, 70, top - 71, 2.2, 2.2); g.fill();
      g.fillStyle = 'rgba(20,10,10,0.3)'; ell(g, 72, top + 41, 6, 2); g.fill();
      // ---- front facade
      bricks(g, 0, ft, W, Fh, red, rng, { bw: 12, bh: 5, v: 0.1 });
      // painted-over red wash
      g.fillStyle = rgba('#b8402a', 0.35); g.fillRect(0, ft, W, Fh);
      // quoins
      for (const x of [0, W - 16]) for (let y = ft + 14; y < H - 18; y += 12) {
        const w2 = ((y / 12) | 0) % 2 ? 16 : 11;
        const xx = x === 0 ? 0 : W - w2;
        g.fillStyle = shade('#c9b79a', (rng() - 0.5) * 0.1); g.fillRect(xx, y, w2, 11);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(xx, y + 10, w2, 1);
      }
      // string course & cornice
      const midY = ft + 70;
      g.fillStyle = '#d4c3a4'; g.fillRect(0, midY, W, 5); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, midY + 5, W, 2);
      // crenellated parapet (front)
      g.fillStyle = '#d4c3a4'; g.fillRect(0, ft + 16, W, 4);
      const mw = 20, gap = 12;
      for (let x = 0; x < W; x += mw + gap) {
        bricks(g, x, ft - 2, mw, 18, shade(red, 0.06), rng, { bw: 10, bh: 4 });
        g.fillStyle = '#d6c6a8'; g.fillRect(x, ft - 5, mw, 4);
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x, ft - 5, mw, 1);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + mw - 3, ft - 2, 3, 18);
      }
      // arched windows (upper floor)
      const arch = (cx, y, w, h, dark, trim) => {
        g.fillStyle = trim; rr(g, cx - w / 2 - 3, y - 3, w + 6, h + 4, [w / 2 + 3, w / 2 + 3, 0, 0]); g.fill();
        g.fillStyle = dark; rr(g, cx - w / 2, y, w, h, [w / 2, w / 2, 0, 0]); g.fill();
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - w / 2 - 3, y + h, w + 6, 3);
      };
      const cols = W / T;
      for (let c = 0; c < cols; c++) {
        const cx = c * T + 32;
        arch(cx, ft + 30, 18, 32, lg(g, 0, ft + 30, 0, ft + 62, [[0, '#1d2630'], [1, '#33404a']]), '#e2d6be');
        g.strokeStyle = 'rgba(220,210,190,0.6)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx, ft + 32); g.lineTo(cx, ft + 62); g.moveTo(cx - 9, ft + 46); g.lineTo(cx + 9, ft + 46); g.stroke();
        g.fillStyle = '#d4c3a4'; g.fillRect(cx - 13, ft + 63, 26, 3);
        if (c !== d) {
          arch(cx, ft + 92, 14, 22, '#1d1616', '#d8ccb2');
          g.strokeStyle = '#2b2b2b'; g.lineWidth = 1.4;
          for (let k = -4; k <= 4; k += 4) { g.beginPath(); g.moveTo(cx + k, ft + 94); g.lineTo(cx + k, ft + 114); g.stroke(); }
        }
      }
      // battered stone plinth
      g.fillStyle = lg(g, 0, H - 18, 0, H, [[0, '#9b8f7c'], [1, '#6e6456']]);
      P(g, [0, H - 16, W, H - 16, W + 4, H, -4, H]); g.fill();
      for (let x = 0; x < W; x += 22) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x, H - 16, 1, 16); }
      // gate
      const gcx = d * T + 32;
      g.fillStyle = '#d8ccb2'; rr(g, gcx - 21, H - 64, 42, 64, [21, 21, 0, 0]); g.fill();
      for (let k = 0; k < 9; k++) { const a = PI + k / 8 * PI; g.strokeStyle = 'rgba(80,60,40,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(gcx + cos(a) * 16, H - 43 + sin(a) * 16); g.lineTo(gcx + cos(a) * 21, H - 43 + sin(a) * 21); g.stroke(); }
      g.fillStyle = lg(g, 0, H - 58, 0, H, [[0, '#120c0a'], [1, '#2e1e16']]); rr(g, gcx - 16, H - 59, 32, 59, [16, 16, 0, 0]); g.fill();
      woodPlanks(g, gcx - 16, H - 40, 5, 40, '#5a3a24', rng, true, 2.5);
      woodPlanks(g, gcx + 11, H - 40, 5, 40, '#5a3a24', rng, true, 2.5);
      // wall lamp
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(gcx + 26, H - 58); g.lineTo(gcx + 30, H - 58); g.lineTo(gcx + 30, H - 54); g.stroke();
      g.fillStyle = '#2a2a2a'; g.fillRect(gcx + 26, H - 54, 8, 2); g.fillRect(gcx + 26, H - 44, 8, 2);
      g.fillStyle = '#ffd88a'; g.fillRect(gcx + 27, H - 52, 6, 8);
      // grime & AO
      g.save(); g.beginPath(); g.rect(0, ft, W, Fh); g.clip();
      for (let i = 0; i < 9; i++) { const x = rng() * W; g.fillStyle = lg(g, 0, ft, 0, ft + 50, [[0, 'rgba(40,20,15,0.3)'], [1, 'rgba(40,20,15,0)']]); g.fillRect(x, ft + 18, 3 + rng() * 6, 30 + rng() * 30); }
      g.restore();
      faceAO(g, 0, ft, W, Fh, { top: 0.15, th: 6, bot: 0.35 });
    },
    lights: (o, W, H, d) => [{ dx: d * T + 62, dy: H - 48, r: 80, color: '#ffc070', flicker: 0.25 }],
  });

  // =============================================================================================
  // 赤崁樓 chikan_tower — Chinese pavilion with double hip-and-gable roofs on a red-brick podium
  // =============================================================================================
  building('chikan_tower', {
    w: 5, h: 4, margin: [24, 90, 30, 14],
    paint(g, W, H, o, d, rng) {
      const brick = '#a8452e', roofC = '#b24a33', redP = '#b42a22', cx = W / 2;
      baseShadow(g, W, H, 0.38);
      const podT = H - 58;
      // podium top (terrace)
      g.fillStyle = lg(g, 0, 120, 0, podT, [[0, '#8d5040'], [1, '#a7614c']]); g.fillRect(2, 120, W - 4, podT - 120);
      g.save(); g.beginPath(); g.rect(2, 120, W - 4, podT - 120); g.clip();
      for (let y = 120; y < podT; y += 8) for (let x = ((y / 8) % 2) * 8; x < W; x += 16) { g.fillStyle = shade('#a35c48', (rng() - 0.5) * 0.14); g.fillRect(x + 0.5, y + 0.5, 15, 7); }
      g.restore();
      // rear pavilion (the second hall standing behind on the same old fort base)
      g.fillStyle = '#6a2018'; g.fillRect(14, 92, W - 28, 52);
      for (let x = 22; x < W - 22; x += 26) { g.fillStyle = '#2e1410'; g.fillRect(x, 104, 16, 34); g.fillStyle = lg(g, x - 6, 0, x - 1, 0, [[0, '#d8483a'], [1, '#7a1a12']]); g.fillRect(x - 6, 92, 5, 52); }
      faceAO(g, 14, 92, W - 28, 52, { top: 0.6, th: 14, bot: 0.2 });
      curvedRoof(g, { ex0: 2, ex1: W - 2, eY: 100, rx0: 46, rx1: W - 46, rY: 12, lift: 14, base: shade(roofC, -0.12), pitch: 6, rng, tipCol: '#3a8a6a' });
      ridge(g, 50, W - 50, 12, { th: 6, col: '#7a3224', tail: 16, lift: 3, fork: false });
      // ---- pavilion: ground storey
      const s1T = 112, s1B = podT - 8, px0 = 52, px1 = W - 52;
      g.fillStyle = '#c7bfae'; g.fillRect(px0 - 10, s1B, px1 - px0 + 20, 8);
      g.fillStyle = '#9d968a'; g.fillRect(px0 - 10, s1B + 6, px1 - px0 + 20, 3);
      g.fillStyle = '#7a2a20'; g.fillRect(px0, s1T, px1 - px0, s1B - s1T);
      const bays = 5, bw = (px1 - px0) / bays;
      for (let i = 0; i < bays; i++) {
        const x = px0 + i * bw;
        // lattice doors
        g.fillStyle = '#3a1a14'; g.fillRect(x + 5, s1T + 10, bw - 10, s1B - s1T - 12);
        g.strokeStyle = '#a8502e'; g.lineWidth = 1;
        for (let yy = s1T + 13; yy < s1B - 22; yy += 5) { g.beginPath(); g.moveTo(x + 6, yy); g.lineTo(x + bw - 6, yy); g.stroke(); }
        for (let xx = x + 8; xx < x + bw - 6; xx += 5) { g.beginPath(); g.moveTo(xx, s1T + 11); g.lineTo(xx, s1B - 22); g.stroke(); }
        g.fillStyle = '#8a3020'; g.fillRect(x + 5, s1B - 20, bw - 10, 18);
        g.strokeStyle = '#c9a24a'; g.lineWidth = 0.8; g.strokeRect(x + 8, s1B - 17, bw - 16, 12);
      }
      for (let i = 0; i <= bays; i++) {
        const x = px0 + i * bw;
        g.fillStyle = lg(g, x - 3.5, 0, x + 3.5, 0, [[0, '#e0503c'], [0.5, redP], [1, '#6e1610']]); g.fillRect(x - 3.5, s1T, 7, s1B - s1T);
        g.fillStyle = '#b0a898'; g.fillRect(x - 5, s1B - 4, 10, 4);
      }
      // painted beam
      g.fillStyle = '#2f6a63'; g.fillRect(px0 - 4, s1T - 2, px1 - px0 + 8, 9);
      g.fillStyle = '#d6b04a'; for (let x = px0; x < px1; x += 14) g.fillRect(x, s1T + 1, 6, 3);
      faceAO(g, px0, s1T, px1 - px0, s1B - s1T, { top: 0.55, th: 16 });
      // lower eave roof (腰簷)
      const s2B = 92, s2T = 46, qx0 = 86, qx1 = W - 86;
      curvedRoof(g, { ex0: 24, ex1: W - 24, eY: s1T + 10, rx0: qx0 - 4, rx1: qx1 + 4, rY: s2B - 4, lift: 13, base: roofC, pitch: 6, rng, tipCol: '#3a8a6a' });
      // upper storey
      g.fillStyle = '#7a2a20'; g.fillRect(qx0, s2T, qx1 - qx0, s2B - s2T);
      const b2 = (qx1 - qx0) / 3;
      for (let i = 0; i < 3; i++) {
        const x = qx0 + i * b2;
        g.fillStyle = '#2e1612'; g.fillRect(x + 5, s2T + 9, b2 - 10, s2B - s2T - 14);
        g.strokeStyle = '#b8603a'; g.lineWidth = 0.9;
        for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + b2 / 2, s2T + 22, 4 + k * 3.2, 0, TAU); g.stroke(); }
      }
      for (let i = 0; i <= 3; i++) { const x = qx0 + i * b2; g.fillStyle = lg(g, x - 3, 0, x + 3, 0, [[0, '#e0503c'], [1, '#6e1610']]); g.fillRect(x - 3, s2T, 6, s2B - s2T); }
      // balcony railing
      g.fillStyle = '#5a1e16'; g.fillRect(qx0 - 6, s2B - 10, qx1 - qx0 + 12, 3);
      for (let x = qx0 - 4; x < qx1 + 6; x += 6) g.fillRect(x, s2B - 9, 1.6, 9);
      g.fillStyle = '#2f6a63'; g.fillRect(qx0 - 3, s2T - 2, qx1 - qx0 + 6, 7);
      faceAO(g, qx0, s2T, qx1 - qx0, s2B - s2T, { top: 0.55, th: 12 });
      // upper roof (歇山 hip-and-gable)
      const rY = -36;
      curvedRoof(g, { ex0: 34, ex1: W - 34, eY: s2T + 8, rx0: 96, rx1: W - 96, rY: rY + 22, lift: 16, base: roofC, pitch: 6, rng, tipCol: '#3a8a6a' });
      // gable section above the hips
      tileRoof(g, (g2) => P(g2, [96, rY + 24, W - 96, rY + 24, W - 100, rY + 2, 100, rY + 2]), [96, rY, W - 96, rY + 24], { base: roofC, pitch: 6, rng });
      g.strokeStyle = shade(roofC, -0.5); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(96, rY + 24); g.lineTo(100, rY + 2); g.moveTo(W - 96, rY + 24); g.lineTo(W - 100, rY + 2); g.stroke();
      ridge(g, 100, W - 100, rY + 2, { th: 7, col: '#8c3a28', tail: 18, lift: 4, fork: false, deco: ['#3a9a78', '#e2b84a', '#3a78b0'] });
      gourd(g, cx, rY - 3, 1.1, '#e2b84a');
      for (const s of [-1, 1]) dragon(g, cx + s * 52, rY - 2, -s, 0.9, '#3a9a72', '#e8c45a');
      // lanterns
      for (const x of [64, W - 64]) lantern(g, x, s1T + 4, 7.5, { col: '#d8352a' });
      for (const x of [cx - 40, cx + 40]) lantern(g, x, s2T + 4, 6, { col: '#d8352a' });
      // ---- podium front (Dutch-era brick)
      bricks(g, 0, podT, W, 58, brick, rng, { bw: 11, bh: 4.5, v: 0.12 });
      g.fillStyle = '#c9b496'; g.fillRect(-2, podT - 3, W + 4, 5);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-2, podT + 2, W + 4, 2);
      // balustrade on the terrace edge
      for (let x = 4; x < W - 4; x += 16) { g.fillStyle = '#d9cfbb'; g.fillRect(x, podT - 12, 4, 10); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, podT - 12, 1, 10); }
      g.fillStyle = '#e2d8c4'; g.fillRect(2, podT - 14, W - 4, 3);
      // arched gateway
      const gcx = d * T + 32;
      g.fillStyle = '#7a3020'; rr(g, gcx - 22, H - 52, 44, 52, [22, 22, 0, 0]); g.fill();
      g.fillStyle = lg(g, 0, H - 48, 0, H, [[0, '#120a08'], [1, '#2a1a12']]); rr(g, gcx - 17, H - 47, 34, 47, [17, 17, 0, 0]); g.fill();
      g.fillStyle = 'rgba(255,200,140,0.12)'; rr(g, gcx - 8, H - 30, 16, 30, [8, 8, 0, 0]); g.fill();
      // weathering, moss
      g.save(); g.beginPath(); g.rect(0, podT, W, 58); g.clip();
      for (let i = 0; i < 8; i++) { const x = rng() * W; g.fillStyle = rg(g, x, H, 0, 22, [[0, 'rgba(60,80,40,0.35)'], [1, 'rgba(60,80,40,0)']]); g.fillRect(x - 22, H - 22, 44, 22); }
      g.restore();
      faceAO(g, 0, podT, W, 58, { top: 0.25, th: 6, bot: 0.35 });
    },
    lights: (o, W, H) => [
      { dx: 64, dy: 132, r: 80, color: '#ff8a4a', flicker: 0.35 }, { dx: W - 64, dy: 132, r: 80, color: '#ff8a4a', flicker: 0.35 },
      { dx: W / 2, dy: 62, r: 70, color: '#ff9a50', flicker: 0.3 },
    ],
  });

  // =============================================================================================
  // temples — 城隍廟 / 天后宮 (三川殿 front hall + raised central roof + rear hall ridge)
  // =============================================================================================
  const TEMPLE = {
    mazu_temple: {
      roof: '#c25438', ridge: '#a63f2c', deco: ['#2f9a74', '#f0c04a', '#3b78c0', '#f4f0e0'], beam: ['#2b7a6a', '#e2b84a', '#2f5fa0'],
      wall: '#b04a35', wood: '#a8302a', door: '#b42d26', stud: '#f0c75a', stone: '#b7b2a6', col: '#aaa59b',
      dragon: '#2f9a6e', dragon2: '#f0c75a', pBg: '#1d2a55', pFg: '#f2d070', text: '天后宮', inner: '#ffb35a', lantern: '#d8352a', center: 'pearl',
    },
    city_god_temple: {
      roof: '#45494e', ridge: '#3c3f43', deco: ['#4a7a72', '#b0904c', '#5a6a8a'], beam: ['#3a5a58', '#a8894a', '#3e4a66'],
      wall: '#5e3329', wood: '#3a2420', door: '#1f1716', stud: '#b89650', stone: '#8f8c86', col: '#86837d',
      dragon: '#4f7a6c', dragon2: '#b09450', pBg: '#121212', pFg: '#d9b45a', text: '城隍廟', inner: '#e0843e', lantern: '#a8281f', center: 'gourd',
    },
  };
  function paintTemple(g, W, H, o, d, rng, C) {
    const cx = W / 2;
    baseShadow(g, W, H, 0.38);
    // ---- rear hall roof (正殿) peeking above
    tileRoof(g, (g2) => P(g2, [26, 104, W - 26, 104, W - 32, -4, 32, -4]), [26, -4, W - 26, 104], { base: shade(C.roof, -0.08), pitch: 7, rng });
    ridge(g, 40, W - 40, -6, { th: 8, col: C.ridge, tail: 24, lift: 6, deco: C.deco });
    if (C.center === 'pearl') { gourd(g, cx, -14, 1.2, '#e8be52'); } else gourd(g, cx, -14, 1.2, '#9a8450');
    for (const s of [-1, 1]) dragon(g, cx + s * 64, -12, -s, 0.95, C.dragon, C.dragon2);
    // ---- facade
    const wT = 140, wB = H - 12;
    // wall body
    g.fillStyle = shade(C.wall, -0.1); g.fillRect(6, wT, W - 12, wB - wT);
    bricks(g, 6, wT + 8, W - 12, wB - wT - 34, C.wall, rng, { bw: 11, bh: 4.5, v: 0.07 });
    // stone dado (裙堵) with carved panels
    g.fillStyle = C.stone; g.fillRect(6, wB - 28, W - 12, 28);
    for (let x = 14; x < W - 20; x += 34) {
      g.fillStyle = shade(C.stone, -0.12); g.fillRect(x, wB - 23, 26, 18);
      g.strokeStyle = shade(C.stone, 0.25); g.lineWidth = 1; g.strokeRect(x + 2, wB - 21, 22, 14);
      g.strokeStyle = shade(C.stone, -0.35); g.beginPath(); g.arc(x + 13, wB - 14, 4, 0, TAU); g.stroke();
    }
    // side doors (龍門/虎門)
    const sideX = [(6 + cx - 56) / 2, (cx + 56 + W - 6) / 2];
    for (const sx of sideX) {
      g.fillStyle = '#3a3632'; g.fillRect(sx - 23, 176, 46, wB - 176);
      g.fillStyle = C.door; g.fillRect(sx - 20, 182, 40, wB - 182);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(sx - 0.6, 182, 1.2, wB - 182);
      if (C.center === 'pearl') {
        for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) for (const s of [-1, 1]) {
          const x = sx + s * (4 + c * 5.5), y = 189 + r * 10;
          g.fillStyle = shade(C.stud, -0.4); ell(g, x + 0.4, y + 0.5, 1.7, 1.7); g.fill();
          g.fillStyle = C.stud; ell(g, x, y, 1.5, 1.5); g.fill();
        }
      } else {
        for (const s of [-1, 1]) { g.strokeStyle = C.stud; g.lineWidth = 0.8; g.strokeRect(sx + (s < 0 ? -17 : 3), 186, 14, wB - 192); }
      }
      for (const s of [-1, 1]) { g.strokeStyle = C.stud; g.lineWidth = 1.3; g.beginPath(); g.arc(sx + s * 4, 214, 2.6, 0, TAU); g.stroke(); }
      g.fillStyle = '#5a504a'; g.fillRect(sx - 24, wB - 4, 48, 4);
      g.fillStyle = shade(C.wood, -0.2); g.fillRect(sx - 24, 172, 48, 6);
      for (const s of [-1, 1]) { g.fillStyle = C.stud; ell(g, sx + s * 10, 175, 2.6, 2.6); g.fill(); }
    }
    // centre door — open onto the warm hall
    const dw = 32, dT = 182;
    g.fillStyle = '#2e2a26'; g.fillRect(cx - dw - 4, dT - 6, dw * 2 + 8, wB - dT + 6);
    g.fillStyle = rg(g, cx, wB - 18, 2, 46, [[0, shade(C.inner, 0.1)], [0.35, shade(C.inner, -0.35)], [1, '#140a08']], cx, wB - 10);
    g.fillRect(cx - dw, dT, dw * 2, wB - dT);
    // altar silhouette & candles (no deity image — presence felt only)
    g.fillStyle = 'rgba(30,12,8,0.75)'; g.fillRect(cx - 18, wB - 26, 36, 14);
    g.fillStyle = 'rgba(30,12,8,0.5)'; g.fillRect(cx - 12, wB - 46, 24, 20);
    g.fillStyle = '#ffe0a0'; for (const s of [-1, 1]) { g.fillRect(cx + s * 13 - 1, wB - 32, 2, 5); }
    g.fillStyle = 'rgba(255,230,190,0.12)'; ell(g, cx, wB - 50, 14, 22); g.fill();
    // door leaves folded open
    for (const s of [-1, 1]) {
      const x = s < 0 ? cx - dw : cx + dw - 9;
      g.fillStyle = shade(C.door, -0.15); g.fillRect(x, dT, 9, wB - dT);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, dT, 1, wB - dT);
      if (C.center === 'pearl') for (let r = 0; r < 6; r++) { g.fillStyle = C.stud; ell(g, x + 4.5, dT + 6 + r * 9, 1.3, 1.3); g.fill(); }
    }
    g.fillStyle = '#6a625a'; g.fillRect(cx - dw - 2, wB - 5, dw * 2 + 4, 5);
    g.fillStyle = shade(C.wood, -0.25); g.fillRect(cx - dw - 4, dT - 8, dw * 2 + 8, 7);
    for (const s of [-1, 1]) { g.fillStyle = C.stud; ell(g, cx + s * 14, dT - 4.5, 3, 3); g.fill(); g.strokeStyle = shade(C.stud, -0.4); g.lineWidth = 0.8; g.stroke(); }
    faceAO(g, 6, wT, W - 12, wB - wT, { top: 0.6, th: 18, bot: 0.2 });
    // beam band (彩繪) & brackets
    g.fillStyle = C.beam[0]; g.fillRect(2, wT - 8, W - 4, 11);
    g.fillStyle = C.beam[2]; g.fillRect(2, wT + 1, W - 4, 3);
    for (let x = 8; x < W - 8; x += 22) {
      g.fillStyle = C.beam[1]; rr(g, x, wT - 6, 12, 6, 2); g.fill();
      g.fillStyle = rgba(C.beam[1], 0.6); g.fillRect(x + 14, wT - 4, 6, 2);
    }
    // columns
    const colX = [18, cx - 46, cx + 46, W - 18];
    colX.forEach((x, i) => {
      const dragonCol = i === 1 || i === 2, w = dragonCol ? 11 : 9;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w / 2, wT, 4, wB - wT);
      g.fillStyle = lg(g, x - w / 2, 0, x + w / 2, 0, [[0, shade(C.col, 0.25)], [0.4, C.col], [1, shade(C.col, -0.35)]]);
      g.fillRect(x - w / 2, wT, w, wB - wT);
      if (dragonCol) {
        g.save(); g.beginPath(); g.rect(x - w / 2, wT, w, wB - wT); g.clip();
        for (let y = wT + 6; y < wB - 8; y += 16) {
          g.strokeStyle = shade(C.col, -0.45); g.lineWidth = 3.2;
          g.beginPath(); g.moveTo(x - w / 2 - 1, y); g.bezierCurveTo(x - 2, y + 4, x + 2, y + 8, x + w / 2 + 1, y + 12); g.stroke();
          g.strokeStyle = shade(C.col, 0.3); g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(x - w / 2 - 1, y - 1); g.bezierCurveTo(x - 2, y + 3, x + 2, y + 7, x + w / 2 + 1, y + 11); g.stroke();
        }
        g.restore();
      }
      g.fillStyle = shade(C.stone, -0.15); g.fillRect(x - w / 2 - 3, wB - 7, w + 6, 7);
      g.fillStyle = shade(C.stone, 0.1); g.fillRect(x - w / 2 - 3, wB - 7, w + 6, 1.5);
      g.fillStyle = shade(C.stone, -0.1); g.fillRect(x - w / 2 - 2, wT - 3, w + 4, 4);
    });
    // platform 台基 & steps
    g.fillStyle = lg(g, 0, wB, 0, H, [[0, shade(C.stone, 0.12)], [1, shade(C.stone, -0.25)]]); g.fillRect(-2, wB, W + 4, H - wB);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-2, wB, W + 4, 1.5);
    for (let x = 10; x < W; x += 30) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, wB + 2, 1, H - wB - 2); }
    // ---- side roofs (lower)
    const sideRoof = (x0, x1) => {
      curvedRoof(g, { ex0: x0, ex1: x1, eY: wT - 6, rx0: x0 + 10, rx1: x1 - 10, rY: 72, lift: 9, base: C.roof, pitch: 6.5, rng, corner: 0.18 });
      ridge(g, x0 + 14, x1 - 14, 72, { th: 6, col: C.ridge, tail: 16, lift: 3, deco: C.deco });
    };
    sideRoof(-12, cx - 40);
    sideRoof(cx + 40, W + 12);
    // ---- centre raised roof (三川脊)
    const ex0 = cx - 78, ex1 = cx + 78;
    // brackets under the raised eave
    g.fillStyle = shade(C.wood, -0.1); g.fillRect(ex0 + 14, wT - 22, ex1 - ex0 - 28, 16);
    for (let x = ex0 + 18; x < ex1 - 18; x += 12) { g.fillStyle = C.beam[1]; g.fillRect(x, wT - 20, 7, 4); g.fillStyle = C.beam[0]; g.fillRect(x + 1, wT - 15, 5, 7); }
    vPlaque(g, cx, wT - 6, 22, 38, o.text || C.text, { bg: C.pBg, fg: C.pFg, frame: C.center === 'pearl' ? '#e2b04a' : '#a8884a' });
    curvedRoof(g, { ex0, ex1, eY: wT - 20, rx0: ex0 + 14, rx1: ex1 - 14, rY: 40, lift: 13, base: C.roof, pitch: 6.5, rng, tipCol: C.deco[0] });
    ridge(g, ex0 + 18, ex1 - 18, 40, { th: 8, col: C.ridge, tail: 22, lift: 5, deco: C.deco });
    if (C.center === 'pearl') flamingPearl(g, cx, 28, 4.6); else gourd(g, cx, 34, 1.15, '#9a8450');
    for (const s of [-1, 1]) dragon(g, cx + s * 52, 34, -s, 1.05, C.dragon, C.dragon2);
    // lanterns flanking the plaque
    for (const s of [-1, 1]) lantern(g, cx + s * 30, wT - 6, 8.5, { col: C.lantern, ch: C.center === 'pearl' ? '媽' : '城', chCol: '#2a0e08' });
  }
  for (const id of ['mazu_temple', 'city_god_temple']) {
    building(id, {
      w: 6, h: 4, doorMin: 1, margin: [30, 70, 34, 14],
      key: (o) => o.text || '',
      // the centre doorway straddles the two middle columns: either door value opens both
      solidAt(o, dx, dy) {
        const w = o.w || 6, h = o.h || 4;
        if (dy !== h - 1) return true;
        const d = doorOf(o, { w: 6, doorMin: 1 }), c0 = floor(w / 2) - 1, c1 = floor(w / 2);
        if (d === c0 || d === c1) return !(dx === c0 || dx === c1);
        return dx !== d;
      },
      paint: (g, W, H, o, d, rng) => paintTemple(g, W, H, o, d, rng, TEMPLE[id]),
      lights: (o, W, H) => [
        { dx: W / 2 - 30, dy: 150, r: 90, color: '#ff8a40', flicker: 0.3 },
        { dx: W / 2 + 30, dy: 150, r: 90, color: '#ff8a40', flicker: 0.3 },
        { dx: W / 2, dy: H - 30, r: 70, color: id === 'mazu_temple' ? '#ffb060' : '#e08040', flicker: 0.4 },
      ],
    });
  }

  // =============================================================================================
  // 神轎 palanquin (anim sway)
  // =============================================================================================
  function palanquinSprite() {
    return spr('palanquin_body', 124, 196, 62, 166, (g) => {
      g.scale(1.12, 1.12);
      const red = '#b52a22', gold = '#e2b04a', gdk = '#9a6a1e';
      // carrying poles (front–back, on both sides)
      // poles run front–back at seat height, so in 3/4 they read as rails receding behind the chair
      for (const s of [-1, 1]) {
        const x = s * 37;
        g.fillStyle = lg(g, 0, -66, 0, 24, [[0, '#5a1210'], [0.45, '#a8281e'], [1, '#d8483a']]);
        P(g, [x - 2, -66, x + 2, -66, x + 3.2, 24, x - 3.2, 24]); g.fill();
        g.fillStyle = 'rgba(255,220,200,0.3)'; g.fillRect(x - 2, -60, 1, 82);
        g.fillStyle = gold; g.fillRect(x - 2.5, -69, 5, 4); g.fillRect(x - 3.8, 22, 7.6, 5);
      }
      g.fillStyle = '#6a1612'; g.fillRect(-39, -66, 78, 3);
      // seat base
      g.fillStyle = lg(g, -30, 0, 30, 0, [[0, '#d24434'], [0.5, red], [1, '#701812']]); g.fillRect(-30, -38, 60, 36);
      for (let i = 0; i < 3; i++) {
        const x = -27 + i * 18.6;
        g.fillStyle = gdk; g.fillRect(x, -34, 16, 22); g.fillStyle = gold; g.fillRect(x + 1, -33, 14, 20);
        g.fillStyle = '#b8822a'; for (let k = 0; k < 3; k++) { ell(g, x + 8, -28 + k * 6, 4 - k * 0.6, 2); g.fill(); }
      }
      g.fillStyle = gold; g.fillRect(-32, -40, 64, 4); g.fillRect(-32, -4, 64, 4);
      g.fillStyle = gdk; for (let x = -30; x < 30; x += 4) { P(g, [x, 0, x + 4, 0, x + 2, 5]); g.fill(); }
      // cabin
      g.fillStyle = lg(g, -26, 0, 26, 0, [[0, '#cf3e30'], [1, '#741a14']]); g.fillRect(-26, -84, 52, 44);
      g.fillStyle = '#e8c860'; g.fillRect(-18, -80, 36, 40);
      g.fillStyle = lg(g, 0, -80, 0, -40, [[0, '#f4d870'], [1, '#c89a34']]); g.fillRect(-17, -79, 34, 38);
      g.strokeStyle = 'rgba(150,90,20,0.6)'; g.lineWidth = 0.8;
      for (let x = -14; x <= 14; x += 4) { g.beginPath(); g.moveTo(x, -79); g.quadraticCurveTo(x + 1, -60, x, -41); g.stroke(); }
      g.fillStyle = '#c8302a'; g.fillRect(-17, -79, 34, 6);
      flamingPearl(g, 0, -58, 3.4);
      for (const s of [-1, 1]) {
        g.fillStyle = lg(g, s * 22 - 3, 0, s * 22 + 3, 0, [[0, '#ffe08a'], [1, '#a8741e']]); g.fillRect(s * 22 - 3, -86, 6, 48);
        g.strokeStyle = '#9a5a10'; g.lineWidth = 1; for (let y = -84; y < -40; y += 5) { g.beginPath(); g.moveTo(s * 22 - 3, y); g.lineTo(s * 22 + 3, y + 3); g.stroke(); }
      }
      // roof (two tiers)
      const roofC = '#c8902e';
      curvedRoof(g, { ex0: -40, ex1: 40, eY: -84, rx0: -24, rx1: 24, rY: -100, lift: 9, base: roofC, pitch: 4.5, corner: 0.28 });
      g.fillStyle = red; g.fillRect(-16, -110, 32, 10);
      g.fillStyle = gold; g.fillRect(-17, -101, 34, 2);
      curvedRoof(g, { ex0: -26, ex1: 26, eY: -108, rx0: -12, rx1: 12, rY: -122, lift: 7, base: roofC, pitch: 4.5, corner: 0.3 });
      g.fillStyle = '#d24434'; ell(g, 0, -124, 7, 3); g.fill();
      gourd(g, 0, -124, 1.0, '#f0c450');
      // tassels at the corners
      for (const s of [-1, 1]) {
        g.strokeStyle = '#d8352a'; g.lineWidth = 1.4;
        for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(s * 38, -90); g.lineTo(s * 38 + k, -78); g.stroke(); }
        g.fillStyle = gold; ell(g, s * 38, -91, 2, 2); g.fill();
      }
      // front crossbar
      g.fillStyle = lg(g, 0, 10, 0, 16, [[0, '#d8483a'], [1, '#7a1612']]); g.fillRect(-40, 14, 80, 5);
    });
  }
  G.Objects.define('palanquin', {
    w: 2, h: 2, solid: true, anim: true,
    draw(ctx, px, py, o, t) {
      const s = palanquinSprite(), bx = px + 64, by = py + 100;
      const ph = o.still ? 0 : t * 2.4 + (o.x || 0) * 0.7;
      const sway = o.still ? 0 : sin(ph) * 0.035, bob = o.still ? 0 : -abs(sin(ph)) * 2.2;
      ctx.save();
      ctx.fillStyle = 'rgba(18,12,24,0.28)';
      ctx.beginPath(); ctx.ellipse(bx + 4, py + 112, 52, 14, 0, 0, TAU); ctx.fill();
      ctx.translate(bx, by + bob); ctx.rotate(sway);
      ctx.drawImage(s, -s.ax, -s.ay, s.lw, s.lh);
      ctx.restore();
    },
  });

  // =============================================================================================
  // kuba — Tsou men's house: raised floor on posts, open sides, thick thatched roof, central hearth
  // =============================================================================================
  building('kuba', {
    w: 4, h: 3, doorDefault: () => 1, margin: [26, 70, 30, 12],
    paint(g, W, H, o, d, rng) {
      const wood = '#6a4a32', thatch = '#a88e5a', fl = H - 44;
      baseShadow(g, W, H, 0.3);
      // under-floor shade & back posts
      g.fillStyle = lg(g, 0, fl, 0, H, [[0, 'rgba(20,14,10,0.75)'], [1, 'rgba(30,24,16,0.35)']]); g.fillRect(4, fl, W - 8, H - fl);
      for (let x = 30; x < W; x += 50) { g.fillStyle = '#3a2a1c'; g.fillRect(x, fl, 5, H - fl - 10); }
      // interior under the roof (open-sided)
      const inT = 84;
      g.fillStyle = lg(g, 0, inT, 0, fl, [[0, '#120c08'], [1, '#2e2016']]); g.fillRect(4, inT, W - 8, fl - inT);
      g.fillStyle = rg(g, W / 2, fl - 6, 2, 70, [[0, 'rgba(255,160,70,0.85)'], [0.25, 'rgba(220,110,40,0.45)'], [1, 'rgba(120,50,20,0)']]);
      g.fillRect(4, inT, W - 8, fl - inT);
      // hearth
      g.fillStyle = '#3a2a20'; ell(g, W / 2, fl - 6, 16, 4); g.fill();
      g.fillStyle = '#ffcf6a'; P(g, [W / 2 - 6, fl - 7, W / 2, fl - 20, W / 2 + 6, fl - 7]); g.fill();
      g.fillStyle = '#fff2c0'; P(g, [W / 2 - 2.5, fl - 7, W / 2, fl - 14, W / 2 + 2.5, fl - 7]); g.fill();
      // inner posts & low benches
      for (const x of [40, W - 44]) { g.fillStyle = '#2a1c12'; g.fillRect(x - 15, fl - 12, 30, 5); }
      // floor (planks)
      g.fillStyle = '#7d5a3a'; g.fillRect(-2, fl - 6, W + 4, 6);
      woodPlanks(g, -2, fl, W + 4, 8, '#6a4a2e', rng, true, 10);
      g.fillStyle = 'rgba(255,230,190,0.18)'; g.fillRect(-2, fl - 6, W + 4, 1.2);
      // front posts
      const posts = [6, W * 0.25, W * 0.5, W * 0.75, W - 6];
      for (const x of posts) {
        g.fillStyle = lg(g, x - 4, 0, x + 4, 0, [[0, '#8a6444'], [1, '#3e2a1a']]); g.fillRect(x - 4, inT + 4, 8, H - inT - 4);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 6, H - 3, 12, 3);
      }
      faceAO(g, 4, inT, W - 8, fl - inT, { top: 0.7, th: 22, bot: 0 });
      // ---- thatched roof: big rounded hood
      const eY = inT + 12, top = -48, cx = W / 2;
      const shape = (g2) => {
        g2.beginPath();
        g2.moveTo(-20, eY);
        g2.bezierCurveTo(-18, eY - 50, 6, top + 14, cx - 70, top + 4);
        g2.quadraticCurveTo(cx, top - 8, cx + 70, top + 4);
        g2.bezierCurveTo(W - 6, top + 14, W + 18, eY - 50, W + 20, eY);
        g2.quadraticCurveTo(cx, eY + 10, -20, eY);
        g2.closePath();
      };
      g.save(); shape(g); g.clip();
      g.fillStyle = lg(g, 0, top, 0, eY, [[0, shade(thatch, 0.12)], [0.6, thatch], [1, shade(thatch, -0.25)]]);
      g.fillRect(-24, top - 10, W + 48, eY - top + 20);
      // side shading (light from the left)
      g.fillStyle = lg(g, -20, 0, W + 20, 0, [[0, 'rgba(255,240,200,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(30,20,10,0.3)']]);
      g.fillRect(-24, top - 10, W + 48, eY - top + 20);
      // straw strokes in courses
      for (let row = 0; row < 14; row++) {
        const y0 = top + 4 + row * ((eY - top) / 13);
        for (let i = 0; i < 90; i++) {
          const x = -22 + rng() * (W + 44), len = 7 + rng() * 9, ang = (x - cx) / W * 0.6;
          g.strokeStyle = rng() < 0.5 ? rgba(shade(thatch, 0.3), 0.55) : rgba(shade(thatch, -0.4), 0.45);
          g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(x, y0 + rng() * 6); g.lineTo(x + sin(ang) * len, y0 + rng() * 6 + cos(ang) * len); g.stroke();
        }
        g.fillStyle = 'rgba(40,28,10,0.12)'; g.fillRect(-24, y0 + 9, W + 48, 1.5);
      }
      g.restore();
      // thick fringe at the eave
      g.save();
      for (let x = -18; x < W + 18; x += 1.6) {
        const y = eY + (abs(x - cx) / (cx + 20)) ** 2 * -2 + 4 + sin(x * 0.7) * 1.2;
        g.strokeStyle = rng() < 0.5 ? '#7a6436' : '#5a4626'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, y - 8); g.lineTo(x + (rng() - 0.5) * 1.5, y + rng() * 3); g.stroke();
      }
      g.restore();
      shape(g); g.strokeStyle = 'rgba(70,52,24,0.7)'; g.lineWidth = 1.5; g.stroke();
      // ridge roll with bindings
      g.fillStyle = lg(g, 0, top - 8, 0, top + 6, [[0, '#c4a86c'], [1, '#7a6236']]);
      rr(g, cx - 72, top - 7, 144, 12, 6); g.fill();
      g.strokeStyle = '#5a4424'; g.lineWidth = 1; g.stroke();
      for (let x = cx - 64; x < cx + 66; x += 16) { g.strokeStyle = '#4a3a1c'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top - 7); g.lineTo(x + 2, top + 5); g.stroke(); }
      // fiteu (sacred 金草 / Dendrobium) growing on the ridge
      for (const x of [cx - 40, cx + 4, cx + 46]) {
        g.strokeStyle = '#4f7a2e'; g.lineWidth = 1.2;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x, top - 5); g.quadraticCurveTo(x + k * 2, top - 12, x + k * 4, top - 16 + abs(k)); g.stroke(); }
        g.fillStyle = '#f2d24a';
        for (let k = -2; k <= 2; k++) { ell(g, x + k * 4, top - 16 + abs(k), 1.8, 1.4); g.fill(); }
      }
      // log ladder up to the floor at the door column
      const lx = d * T + 32;
      g.fillStyle = 'rgba(0,0,0,0.3)'; P(g, [lx - 6, H, lx + 14, H, lx + 10, fl, lx - 6, fl]); g.fill();
      g.fillStyle = lg(g, lx - 9, 0, lx + 9, 0, [[0, '#a07850'], [1, '#5a3c24']]);
      P(g, [lx - 9, H + 2, lx + 9, H + 2, lx + 7, fl - 4, lx - 7, fl - 4]); g.fill();
      g.strokeStyle = '#3a2614'; g.lineWidth = 1.2; g.stroke();
      for (let y = H - 8; y > fl; y -= 9) { g.fillStyle = '#3a2614'; g.fillRect(lx - 7, y, 14, 2.5); g.fillStyle = 'rgba(255,230,190,0.25)'; g.fillRect(lx - 7, y + 2.5, 14, 1); }
    },
    lights: (o, W, H) => [{ dx: W / 2, dy: H - 60, r: 110, color: '#ff9440', flicker: 0.55 }],
  });

  // =============================================================================================
  // bunun_house — stacked slate walls, heavy slate-slab roof, timber lintel
  // =============================================================================================
  building('bunun_house', {
    w: 4, h: 3, doorDefault: () => 1, margin: [16, 34, 22, 12],
    paint(g, W, H, o, d, rng) {
      const slate = '#6d747a', wT = H - 62;
      baseShadow(g, W, H, 0.34);
      slateCourses(g, 0, wT, W, H - wT, slate, rng);
      // corner reinforcement with bigger stones
      for (const x of [0, W - 14]) slateCourses(g, x, wT, 14, H - wT, shade(slate, 0.05), rng, { min: 6, var: 5 });
      // door with heavy timber lintel
      const dx = d * T + 32;
      g.fillStyle = '#16100c'; g.fillRect(dx - 15, H - 44, 30, 44);
      g.fillStyle = rg(g, dx, H - 6, 0, 30, [[0, 'rgba(255,140,60,0.5)'], [1, 'rgba(255,140,60,0)']]); g.fillRect(dx - 15, H - 44, 30, 44);
      for (const s of [-1, 1]) { g.fillStyle = lg(g, dx + s * 17 - 3, 0, dx + s * 17 + 3, 0, [[0, '#7a5a3c'], [1, '#3e2a1a']]); g.fillRect(dx + s * 17 - 3, H - 46, 6, 46); }
      g.fillStyle = lg(g, 0, H - 54, 0, H - 44, [[0, '#8a6644'], [1, '#4a3220']]); g.fillRect(dx - 30, H - 54, 60, 9);
      g.strokeStyle = '#2a1c10'; g.lineWidth = 1; g.strokeRect(dx - 30, H - 54, 60, 9);
      g.strokeStyle = 'rgba(30,20,10,0.5)'; for (let x = dx - 26; x < dx + 28; x += 7) { g.beginPath(); g.moveTo(x, H - 53); g.lineTo(x + 3, H - 46); g.stroke(); }
      // small windows
      for (const wx of [W * 0.15, W * 0.85]) {
        if (abs(wx - dx) < 40) continue;
        g.fillStyle = '#3e2a1a'; g.fillRect(wx - 10, H - 44, 20, 16);
        g.fillStyle = '#120c08'; g.fillRect(wx - 7, H - 41, 14, 10);
      }
      // eave beam
      g.fillStyle = lg(g, 0, wT - 4, 0, wT + 6, [[0, '#7a5a3a'], [1, '#3a2818']]); g.fillRect(-4, wT - 2, W + 8, 7);
      faceAO(g, 0, wT, W, H - wT, { top: 0.6, th: 20, bot: 0.3 });
      // ---- slate slab roof
      const eY = wT + 4, rY = -12;
      const roofPath = (g2) => P(g2, [-10, eY, W + 10, eY, W + 4, rY, -4, rY]);
      g.save(); roofPath(g); g.clip();
      g.fillStyle = '#2c3034'; g.fillRect(-12, rY - 2, W + 24, eY - rY + 4);
      let row = 0;
      for (let y = rY - 4; y < eY + 4; y += 13, row++) {
        let x = -14 - rng() * 18;
        while (x < W + 14) {
          const sw = 22 + rng() * 18, sh = 15 + rng() * 4;
          let c = shade(slate, (rng() - 0.5) * 0.3 + (y - rY) / (eY - rY) * -0.12);
          if (rng() < 0.25) c = mix(c, '#7a6a58', 0.4);
          const sk = (rng() - 0.5) * 3;
          g.fillStyle = 'rgba(10,10,14,0.55)'; P(g, [x + 1, y + 2, x + sw + 1, y + 2 + sk, x + sw + 1, y + sh + 2, x + 1, y + sh + 2]); g.fill();
          g.fillStyle = lg(g, x, y, x + sw * 0.6, y + sh, [[0, shade(c, 0.18)], [1, shade(c, -0.08)]]);
          P(g, [x, y, x + sw - 1, y + sk, x + sw - 2, y + sh, x + 1, y + sh - sk * 0.3]); g.fill();
          g.strokeStyle = rgba('#ffffff', 0.18); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + 1, y + 0.6); g.lineTo(x + sw - 2, y + sk + 0.6); g.stroke();
          if (rng() < 0.35) { g.fillStyle = rgba(pick(rng, ['#9aa04a', '#c8c070', '#7a9a5a']), 0.5); ell(g, x + rng() * sw, y + rng() * sh, 2 + rng() * 3, 1.4 + rng() * 2); g.fill(); }
          x += sw - 1;
        }
      }
      g.fillStyle = lg(g, -10, 0, W + 10, 0, [[0, 'rgba(255,240,220,0.06)'], [1, 'rgba(0,0,10,0.18)']]); g.fillRect(-12, rY, W + 24, eY - rY);
      g.restore();
      // slab edge thickness along the eave
      g.fillStyle = '#3a3e42'; g.fillRect(-10, eY, W + 20, 4);
      for (let x = -10; x < W + 10; x += 24 + (x % 7)) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, eY, 1, 4); }
      // ridge: long capstones
      for (let x = -4; x < W + 2; x += 30) {
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 1, rY - 2, 30, 8);
        g.fillStyle = lg(g, 0, rY - 6, 0, rY + 4, [[0, '#8a9196'], [1, '#4a5056']]); g.fillRect(x, rY - 6, 29, 9);
      }
      roofPath(g); g.strokeStyle = '#25282c'; g.lineWidth = 1.4; g.stroke();
    },
    lights: (o, W, H, d) => [{ dx: d * T + 32, dy: H - 14, r: 60, color: '#ff8a3a', flicker: 0.45 }],
  });

  // =============================================================================================
  // millet_rack — wooden frame hung with bundles of drying millet
  // =============================================================================================
  building('millet_rack', {
    w: 2, h: 1, door: false, margin: [8, 70, 12, 6],
    paint(g, W, H, o, d, rng) {
      ellShadow(g, W / 2 + 6, H - 10, W * 0.52, 12, 0.35);
      const post = (x) => { g.fillStyle = lg(g, x - 4, 0, x + 4, 0, [[0, '#8a6444'], [1, '#3e2a1a']]); g.fillRect(x - 4, -56, 8, H - 6 + 56); };
      post(10); post(W - 10);
      const beam = (y) => { g.fillStyle = lg(g, 0, y - 3, 0, y + 3, [[0, '#9a7650'], [1, '#4a321e']]); g.fillRect(2, y - 3, W - 4, 6); g.strokeStyle = '#2e1e12'; g.lineWidth = 0.8; g.strokeRect(2, y - 3, W - 4, 6); };
      const bundle = (x, y, len, tone) => {
        g.strokeStyle = '#8a7a3a'; g.lineWidth = 1;
        for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 0.8, y); g.lineTo(x + k * 1.2, y + 6); g.stroke(); }
        g.fillStyle = '#c23a2a'; g.fillRect(x - 3, y + 4, 6, 2);
        for (let k = 0; k < 6; k++) {
          const ox = (k - 2.5) * 1.6, cy = y + 7 + len / 2;
          const col = shade(tone, (rng() - 0.5) * 0.25);
          g.fillStyle = shade(col, -0.35); ell(g, x + ox + 0.6, cy + 0.8, 2.8, len / 2); g.fill();
          g.fillStyle = rg(g, x + ox - 1, cy - len * 0.2, 0, len * 0.6, [[0, shade(col, 0.35)], [1, col]]); ell(g, x + ox, cy, 2.6, len / 2); g.fill();
        }
        g.fillStyle = 'rgba(255,240,180,0.5)';
        for (let k = 0; k < 14; k++) g.fillRect(x - 5 + rng() * 10, y + 8 + rng() * len, 0.9, 0.9);
      };
      beam(-50);
      for (let i = 0; i < 6; i++) bundle(20 + i * 17.6, -48, 22 + rng() * 6, pick(rng, ['#d8a838', '#e0b84a', '#c88a2a', '#b85a2a']));
      beam(-6);
      for (let i = 0; i < 6; i++) bundle(20 + i * 17.6, -4, 20 + rng() * 6, pick(rng, ['#d8a838', '#e0b84a', '#c88a2a', '#d0a040']));
    },
  });

  // =============================================================================================
  // tao_house — Tao semi-sunken main house (vahey) in a cobble-walled pit; low thatched roof
  // =============================================================================================
  building('tao_house', {
    w: 4, h: 3, doorDefault: () => 1, margin: [10, 16, 14, 10],
    paint(g, W, H, o, d, rng) {
      const cob = ['#8a8d8e', '#9a9690', '#767a7e', '#a8a49c', '#6e7276'];
      const rim = 14, fr = H - 24;
      // pit floor
      g.fillStyle = '#5a564e'; g.fillRect(rim, rim, W - 2 * rim, fr - rim);
      cobbles(g, rim, 128, W - 2 * rim, fr - 128, ['#8a867e', '#7a766e', '#96928a'], rng, 13, { flat: true });
      g.fillStyle = lg(g, 0, 128, 0, 150, [[0, 'rgba(10,10,10,0.45)'], [1, 'rgba(10,10,10,0)']]); g.fillRect(rim, 128, W - 2 * rim, 22);
      // back retaining wall (faces the viewer)
      cobbles(g, rim, rim, W - 2 * rim, 112, cob, rng, 11);
      g.fillStyle = lg(g, 0, rim, 0, 126, [[0, 'rgba(0,0,0,0.1)'], [1, 'rgba(0,0,0,0.45)']]); g.fillRect(rim, rim, W - 2 * rim, 112);
      // house front wall (wooden planks, small doorways)
      const hx0 = 40, hx1 = W - 40, hT = 96, hB = 128;
      woodPlanks(g, hx0, hT, hx1 - hx0, hB - hT, '#6a4a32', rng, true, 7);
      const nd = 3;
      for (let i = 0; i < nd; i++) {
        const x = hx0 + (hx1 - hx0) * (i + 0.5) / nd;
        g.fillStyle = '#3a2618'; g.fillRect(x - 10, hT + 6, 20, hB - hT - 6);
        g.fillStyle = '#0e0a08'; g.fillRect(x - 8, hT + 8, 16, hB - hT - 8);
      }
      g.fillStyle = '#4a3220'; g.fillRect(hx0 - 2, hB - 3, hx1 - hx0 + 4, 3);
      faceAO(g, hx0, hT, hx1 - hx0, hB - hT, { top: 0.7, th: 14, bot: 0.2 });
      // low thatched roof (ridge just above ground level)
      const eY = hT + 6, rY = 4, th = '#b3a074';
      const roof = (g2) => {
        g2.beginPath(); g2.moveTo(hx0 - 18, eY);
        g2.quadraticCurveTo(W / 2, eY + 6, hx1 + 18, eY);
        g2.quadraticCurveTo(hx1 + 6, rY + 30, hx1 - 14, rY);
        g2.lineTo(hx0 + 14, rY);
        g2.quadraticCurveTo(hx0 - 6, rY + 30, hx0 - 18, eY);
        g2.closePath();
      };
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.save(); g.translate(4, 4); roof(g); g.fill(); g.restore();
      g.save(); roof(g); g.clip();
      g.fillStyle = lg(g, 0, rY, 0, eY, [[0, shade(th, 0.12)], [1, shade(th, -0.22)]]); g.fillRect(0, rY - 4, W, eY - rY + 12);
      const courses = 9;
      for (let row = 0; row < courses; row++) {
        const y0 = rY + row * (eY - rY) / courses;
        for (let i = 0; i < 110; i++) {
          const x = hx0 - 20 + rng() * (hx1 - hx0 + 40), y = y0 + rng() * 5, len = 6 + rng() * 6;
          g.strokeStyle = rng() < 0.5 ? rgba(shade(th, 0.35), 0.55) : rgba(shade(th, -0.45), 0.45); g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - W / 2) * 0.015, y + len); g.stroke();
        }
        g.fillStyle = 'rgba(50,36,14,0.16)'; g.fillRect(0, y0 + (eY - rY) / courses - 2, W, 1.6);
      }
      g.fillStyle = lg(g, hx0, 0, hx1, 0, [[0, 'rgba(255,240,200,0.1)'], [1, 'rgba(20,10,0,0.2)']]); g.fillRect(0, rY, W, eY - rY + 8);
      g.restore();
      // ragged eave fringe
      for (let x = hx0 - 16; x < hx1 + 16; x += 1.5) {
        const y = eY + 3 - (abs(x - W / 2) / (W / 2)) ** 2 * 2;
        g.strokeStyle = rng() < 0.5 ? '#7a6a44' : '#5a4a2c'; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + (rng() - 0.5) * 1.4, y + rng() * 2.5); g.stroke();
      }
      roof(g); g.strokeStyle = 'rgba(70,56,30,0.7)'; g.lineWidth = 1.2; g.stroke();
      // ridge cap & horizontal binding rods holding the thatch down against typhoon winds
      g.fillStyle = lg(g, 0, rY - 4, 0, rY + 4, [[0, '#8a6a46'], [1, '#4a3420']]); rr(g, hx0 + 10, rY - 3, hx1 - hx0 - 20, 7, 3); g.fill();
      for (const f of [0.38, 0.7]) {
        const y = lerp(rY, eY, f);
        g.strokeStyle = 'rgba(60,44,24,0.75)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(hx0 + 2 - f * 14, y); g.quadraticCurveTo(W / 2, y + 2, hx1 - 2 + f * 14, y); g.stroke();
        for (let x = hx0 + 12; x < hx1 - 6; x += 18) { g.strokeStyle = 'rgba(40,30,14,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + 1, y + 2.5); g.stroke(); }
      }
      // rims (ground-level top of the stone retaining walls)
      const rimPal = ['#a8a8a2', '#9c9a94', '#b6b4ac', '#8e9294'];
      cobbles(g, 0, -4, W, rim + 4, rimPal, rng, 10, { flat: true });
      cobbles(g, 0, 0, rim, H, rimPal, rng, 10, { flat: true });
      cobbles(g, W - rim, 0, rim, H, rimPal, rng, 10, { flat: true });
      cobbles(g, 0, fr, W, H - fr, rimPal, rng, 10, { flat: true });
      // inner edge shadow
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(rim, rim, 4, fr - rim); g.fillRect(rim, fr - 3, W - 2 * rim, 3);
      // stone steps down at the door column
      const sx = d * T + 10, sw = 44;
      for (let i = 0; i < 4; i++) {
        const y = fr + 12 - i * 11;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(sx, y + 6, sw, 3);
        g.fillStyle = lg(g, 0, y - 2, 0, y + 7, [[0, '#b8b4aa'], [1, '#8a867c']]); rr(g, sx, y - 2, sw, 9, 3); g.fill();
      }
      // backrest stone & a scatter of pebbles
      g.fillStyle = '#8a8e90'; rr(g, W - 46, fr - 30, 10, 26, 3); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(W - 45, fr - 29, 2, 22);
      g.fillStyle = 'rgba(18,12,24,0.25)'; g.fillRect(W - 4, 8, 10, H - 4); g.fillRect(6, H - 2, W, 6);
    },
  });

  // =============================================================================================
  // tatala — Tao plank boat (red / white / black; boat-eye rosettes at both ends)
  // =============================================================================================
  function tatalaSprite() {
    return spr('tatala', 170, 110, 85, 78, (g) => {
      // origin = centre of the hull's ground line
      const L = 66, red = '#c0302a', blk = '#1c1a1a', wht = '#f4efe2';
      const top = (x) => -20 + (x / L) ** 2 * -10 + ((abs(x) > L - 14) ? -((abs(x) - (L - 14)) ** 1.6) : 0);
      // inner hull (seen from above)
      g.fillStyle = '#5a3a24';
      g.beginPath(); g.moveTo(-L + 10, top(-L + 10) - 2);
      g.quadraticCurveTo(0, -36, L - 10, top(L - 10) - 2);
      g.quadraticCurveTo(0, -18, -L + 10, top(-L + 10) - 2); g.fill();
      g.fillStyle = '#7a5434'; for (let x = -40; x <= 40; x += 20) g.fillRect(x - 1.5, -30, 3, 10);
      // hull side
      const hull = (g2) => {
        g2.beginPath();
        g2.moveTo(-L - 4, -58);
        g2.quadraticCurveTo(-L + 2, -30, -L + 14, top(-L + 14));
        g2.quadraticCurveTo(0, -12, L - 14, top(L - 14));
        g2.quadraticCurveTo(L - 2, -30, L + 4, -58);
        g2.quadraticCurveTo(L + 6, -40, L - 6, -10);
        g2.quadraticCurveTo(0, 6, -L + 6, -10);
        g2.quadraticCurveTo(-L - 6, -40, -L - 4, -58);
        g2.closePath();
      };
      g.fillStyle = 'rgba(18,12,24,0.3)'; ell(g, 4, 0, L + 6, 7); g.fill();
      hull(g); g.fillStyle = wht; g.fill();
      g.save(); hull(g); g.clip();
      // plank seams
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = 'rgba(80,60,40,0.35)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(-L - 4, -18 + k * 5 - 18); g.quadraticCurveTo(0, -4 + k * 4 - 6, L + 4, -18 + k * 5 - 18); g.stroke();
      }
      // gunwale band: red & black sawtooth
      g.fillStyle = blk; g.beginPath(); g.moveTo(-L - 6, -60); g.quadraticCurveTo(0, -30, L + 6, -60); g.lineTo(L + 6, -54); g.quadraticCurveTo(0, -24, -L - 6, -54); g.fill();
      for (let x = -L + 10; x < L - 10; x += 6) {
        const y = top(x) + 4;
        g.fillStyle = red; P(g, [x, y, x + 3, y + 5, x + 6, y]); g.fill();
        g.fillStyle = blk; P(g, [x + 3, y + 5, x + 6, y, x + 9, y + 5]); g.fill();
      }
      // mid zigzag line
      g.strokeStyle = blk; g.lineWidth = 1.2; g.beginPath();
      for (let x = -L + 16; x < L - 16; x += 4) { const y = -9 + (x / L) ** 2 * -8 + ((x / 4) % 2 ? -1.8 : 1.8); if (x === -L + 16) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
      g.strokeStyle = red; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-L + 10, -4); g.quadraticCurveTo(0, 4, L - 10, -4); g.stroke();
      // stylised human-figure band between the eyes (mangamaog), kept simple
      for (let x = -18; x <= 18; x += 12) {
        g.strokeStyle = blk; g.lineWidth = 1.1;
        g.beginPath(); g.arc(x, -16, 1.5, 0, TAU); g.moveTo(x, -14.5); g.lineTo(x, -9); g.moveTo(x - 3.5, -15); g.lineTo(x, -12.5); g.lineTo(x + 3.5, -15);
        g.moveTo(x - 3, -6); g.lineTo(x, -9); g.lineTo(x + 3, -6); g.stroke();
      }
      g.restore();
      // boat eyes (concentric rosette with rays)
      for (const s of [-1, 1]) {
        const ex = s * (L - 24), ey = -15;
        g.fillStyle = blk; ell(g, ex, ey, 8.5, 8.5); g.fill();
        g.fillStyle = red;
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; P(g, [ex + cos(a - 0.2) * 5.6, ey + sin(a - 0.2) * 5.6, ex + cos(a) * 8.3, ey + sin(a) * 8.3, ex + cos(a + 0.2) * 5.6, ey + sin(a + 0.2) * 5.6]); g.fill(); }
        g.fillStyle = wht; ell(g, ex, ey, 5, 5); g.fill();
        g.strokeStyle = red; g.lineWidth = 1.2; ell(g, ex, ey, 3.3, 3.3); g.stroke();
        g.fillStyle = blk; ell(g, ex, ey, 1.6, 1.6); g.fill();
      }
      hull(g); g.strokeStyle = '#3a2a22'; g.lineWidth = 1.4; g.stroke();
      // prow & stern posts with feather tufts
      for (const s of [-1, 1]) {
        const x = s * (L + 4), y = -58;
        g.strokeStyle = '#2a1c14'; g.lineWidth = 1;
        for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * (2 + k), y - 6 - k, x + s * (5 + k * 1.6), y - 9 + k * 1.4); g.stroke(); }
        g.fillStyle = '#e8e2d4'; ell(g, x, y, 2, 2); g.fill();
      }
    });
  }
  G.Objects.define('tatala', {
    w: 2, h: 1, solid: true, anim: false,
    draw(ctx, px, py, o, t) {
      const s = tatalaSprite();
      let x = px + 64, y = py + 56;
      if (o.water) {
        y += sin(t * 1.6 + (o.x || 0)) * 1.6;
        ctx.save(); ctx.translate(x, y); ctx.rotate(sin(t * 1.2 + (o.y || 0)) * 0.02);
        ctx.drawImage(s, -s.ax, -s.ay, s.lw, s.lh);
        ctx.restore();
        ctx.strokeStyle = 'rgba(230,245,255,0.45)'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.ellipse(px + 64, py + 54, 66 + sin(t * 2) * 2, 5, 0, 0.1, PI - 0.1); ctx.stroke();
      } else put(ctx, s, x, y);
    },
  });
  G.Objects.defs.tatala.anim = true; // bobs when o.water

  // =============================================================================================
  // 王船 wang_boat — ornate junk; on water (bobbing) or on a beach cradle
  // =============================================================================================
  const WB = { L: 384, gun: (x) => {
    const u = x / 384;
    return 40 + 105 * u * (1 - u) - 6 * u * u - (u < 0.2 ? ((0.2 - u) / 0.2) ** 1.5 * 30 : 0) - (u > 0.86 ? ((u - 0.86) / 0.14) ** 1.5 * 10 : 0);
  } };
  function wangBoatSprite(water) {
    return spr('wang_boat:' + (water ? 'w' : 'c'), 470, 520, 40, 330, (g) => {
      const L = WB.L, gun = WB.gun, rng = rngFor('wang');
      const keel = (x) => { const u = x / L; return 176 - 30 * (u - 0.5) * (u - 0.5) * 4 * 0.9 + (u > 0.9 ? -(u - 0.9) * 200 : 0) + (u < 0.06 ? -(0.06 - u) * 240 : 0); };
      const deckBack = (x) => gun(x) - 52;
      if (!water) {
        // cradle on the beach
        ellShadow(g, L / 2 + 10, 190, L * 0.55, 16, 0.4);
        for (const x of [70, 170, 270, 330]) {
          g.fillStyle = '#5a4030'; P(g, [x - 16, 192, x + 16, 192, x + 10, keel(x) - 2, x - 10, keel(x) - 2]); g.fill();
          g.strokeStyle = '#33241a'; g.lineWidth = 1.2; g.stroke();
          g.strokeStyle = '#7a5a40'; g.beginPath(); g.moveTo(x - 13, 190); g.lineTo(x + 8, keel(x)); g.moveTo(x + 13, 190); g.lineTo(x - 8, keel(x)); g.stroke();
        }
      }
      // deck (seen from above) between far and near gunwale
      g.beginPath(); g.moveTo(0, deckBack(0));
      for (let x = 0; x <= L; x += 8) g.lineTo(x, deckBack(x));
      for (let x = L; x >= 0; x -= 8) g.lineTo(x, gun(x));
      g.closePath();
      g.fillStyle = lg(g, 0, 0, 0, 140, [[0, '#a8804e'], [1, '#c89a62']]); g.fill();
      g.save(); g.clip();
      for (let k = 0; k < 9; k++) { g.strokeStyle = 'rgba(70,45,20,0.3)'; g.lineWidth = 1; g.beginPath(); for (let x = 0; x <= L; x += 8) { const y = lerp(deckBack(x), gun(x), k / 9); if (!x) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
      g.restore();
      // far bulwark inner face (red)
      g.beginPath(); for (let x = 0; x <= L; x += 8) { if (!x) g.moveTo(x, deckBack(x) - 10); else g.lineTo(x, deckBack(x) - 10); }
      for (let x = L; x >= 0; x -= 8) g.lineTo(x, deckBack(x) + 3);
      g.closePath(); g.fillStyle = '#9a2a20'; g.fill(); g.strokeStyle = '#5a1410'; g.lineWidth = 1; g.stroke();
      g.strokeStyle = '#e2b04a'; g.lineWidth = 1.6; g.beginPath(); for (let x = 0; x <= L; x += 8) { if (!x) g.moveTo(x, deckBack(x) - 10); else g.lineTo(x, deckBack(x) - 10); } g.stroke();
      // masts
      const mast = (x, h, w) => {
        const y0 = lerp(deckBack(x), gun(x), 0.5);
        g.fillStyle = lg(g, x - w / 2, 0, x + w / 2, 0, [[0, '#9a7048'], [1, '#4a3018']]); g.fillRect(x - w / 2, y0 - h, w, h);
        g.fillStyle = '#c9a24a'; g.fillRect(x - w / 2 - 1, y0 - h - 3, w + 2, 4);
        return y0;
      };
      // junk batten sails (behind masts' fore side)
      const sail = (x, yTop, yBot, wAft, wFore, col) => {
        const pts = [x + wFore, yTop + 8, x - wAft * 0.85, yTop, x - wAft, yBot - 6, x + wFore * 0.8, yBot];
        g.fillStyle = 'rgba(20,12,8,0.25)'; P(g, pts.map((v, i) => v + (i % 2 ? 6 : 6))); g.fill();
        g.save(); P(g, pts); g.clip();
        g.fillStyle = lg(g, x - wAft, 0, x + wFore, 0, [[0, shade(col, -0.12)], [0.6, col], [1, shade(col, 0.1)]]); g.fillRect(x - wAft - 4, yTop - 4, wAft + wFore + 8, yBot - yTop + 8);
        const n = 8;
        for (let i = 1; i < n; i++) {
          const y = lerp(yTop, yBot, i / n);
          g.fillStyle = 'rgba(60,40,20,0.12)'; g.fillRect(x - wAft - 4, y - 7, wAft + wFore + 8, 6);
          g.strokeStyle = '#5a3a20'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x - wAft - 4, y + 2); g.quadraticCurveTo(x - wAft * 0.3, y - 3, x + wFore + 4, y); g.stroke();
        }
        g.restore();
        P(g, pts); g.strokeStyle = '#a8302a'; g.lineWidth = 2.2; g.stroke();
      };
      const mY1 = mast(214, 300, 7), mY2 = mast(312, 220, 6), mY3 = mast(118, 190, 5);
      sail(214, mY1 - 286, mY1 - 70, 92, 26, '#efe4c8');
      sail(312, mY2 - 208, mY2 - 66, 64, 20, '#efe4c8');
      sail(118, mY3 - 178, mY3 - 74, 52, 16, '#efe4c8');
      for (const [x, y, h] of [[214, mY1, 300], [312, mY2, 220], [118, mY3, 190]]) {
        g.fillStyle = lg(g, x - 3, 0, x + 3, 0, [[0, '#a07850'], [1, '#4a3018']]); g.fillRect(x - 3, y - h, 6, h);
      }
      // rigging
      g.strokeStyle = 'rgba(40,28,18,0.55)'; g.lineWidth = 0.8;
      for (const [x, y, h] of [[214, mY1, 300], [312, mY2, 220]]) { g.beginPath(); g.moveTo(x, y - h + 4); g.lineTo(L - 4, gun(L - 4) - 4); g.moveTo(x, y - h + 4); g.lineTo(30, deckBack(30)); g.stroke(); }
      // stern cabin (王府)
      const cx0 = 14, cx1 = 92, cB = lerp(deckBack(50), gun(50), 0.55), cT = cB - 46;
      g.fillStyle = '#7a1e18'; g.fillRect(cx0, cT, cx1 - cx0, cB - cT);
      for (let i = 0; i < 3; i++) {
        const x = cx0 + 6 + i * 25;
        g.fillStyle = '#2a120c'; g.fillRect(x, cT + 10, 18, cB - cT - 14);
        g.strokeStyle = '#c9a24a'; g.lineWidth = 0.8; g.strokeRect(x + 2, cT + 12, 14, cB - cT - 18);
        g.beginPath(); g.moveTo(x + 9, cT + 12); g.lineTo(x + 9, cB - 6); g.stroke();
      }
      for (const x of [cx0, cx0 + 26, cx0 + 52, cx1 - 2]) { g.fillStyle = '#c8302a'; g.fillRect(x - 1, cT, 4, cB - cT); }
      faceAO(g, cx0, cT, cx1 - cx0, cB - cT, { top: 0.5, th: 10, bot: 0.1 });
      curvedRoof(g, { ex0: cx0 - 12, ex1: cx1 + 12, eY: cT + 4, rx0: cx0, rx1: cx1, rY: cT - 22, lift: 8, base: '#3a7a5a', pitch: 5, rng, tipCol: '#e2b04a' });
      ridge(g, cx0 + 2, cx1 - 2, cT - 22, { th: 5, col: '#b23a2a', tail: 12, lift: 2, deco: ['#e2b04a', '#3a9a78'] });
      gourd(g, (cx0 + cx1) / 2, cT - 25, 0.8, '#e8be52');
      lantern(g, cx0 + 4, cT + 2, 6, { col: '#d8352a' });
      lantern(g, cx1 - 4, cT + 2, 6, { col: '#d8352a' });
      // banner pole with 代天巡狩
      const bx = 34, by = lerp(deckBack(bx), gun(bx), 0.3);
      g.fillStyle = '#5a3a20'; g.fillRect(bx - 2, by - 250, 4, 250 - (by - cT) + 4);
      g.fillStyle = '#e2b04a'; ell(g, bx, by - 252, 3.4, 3.4); g.fill();
      const fx = bx + 2, fy = by - 238, fw = 30, fh = 104;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(fx + 3, fy + 3, fw, fh);
      g.fillStyle = '#c8302a'; g.fillRect(fx, fy, fw, fh);
      for (let y = fy; y < fy + fh; y += 6) { g.fillStyle = '#7a1410'; P(g, [fx + fw, y, fx + fw + 4, y + 3, fx + fw, y + 6]); g.fill(); }
      g.fillStyle = lg(g, fx, 0, fx + fw, 0, [[0, '#f8dc6a'], [1, '#e0b43a']]); g.fillRect(fx + 4, fy + 4, fw - 8, fh - 8);
      g.fillStyle = '#2a1208'; g.font = F(17, true); g.textAlign = 'center'; g.textBaseline = 'middle';
      [...'代天巡狩'].forEach((c, i) => g.fillText(c, fx + fw / 2, fy + 16 + i * 24));
      // ---- near hull side
      const hull = (g2) => {
        g2.beginPath(); g2.moveTo(-6, gun(0) - 26);
        for (let x = 0; x <= L; x += 6) g2.lineTo(x, gun(x));
        g2.lineTo(L + 8, gun(L) - 14);
        g2.quadraticCurveTo(L + 2, 120, L - 18, keel(L - 18));
        for (let x = L - 18; x >= 18; x -= 6) g2.lineTo(x, keel(x));
        g2.quadraticCurveTo(0, 150, -6, gun(0) - 26);
        g2.closePath();
      };
      hull(g); g.fillStyle = '#1e1a1a'; g.fill();
      g.save(); hull(g); g.clip();
      const band = (o0, o1, col) => {
        g.beginPath(); for (let x = -10; x <= L + 10; x += 6) { const y = gun(clamp(x, 0, L)) + o0; if (x === -10) g.moveTo(x, y - 30); else g.lineTo(x, y); }
        for (let x = L + 10; x >= -10; x -= 6) g.lineTo(x, gun(clamp(x, 0, L)) + o1);
        g.closePath(); g.fillStyle = col; g.fill();
      };
      band(-40, 12, '#b42c24');
      band(12, 15, '#e2b04a');
      band(15, 38, '#2c7a68');
      band(38, 41, '#e2b04a');
      band(41, 60, '#8a2a20');
      // painted waves & clouds on the teal band
      for (let x = 30; x < L - 40; x += 22) {
        const y = gun(x) + 26;
        g.strokeStyle = '#e8f0e0'; g.lineWidth = 1.3;
        g.beginPath(); g.arc(x, y + 3, 5, PI, TAU); g.arc(x + 8, y + 3, 3, PI, TAU * 0.98); g.stroke();
        g.strokeStyle = '#e2b04a'; g.lineWidth = 1; g.beginPath(); g.arc(x + 11, y - 3, 2.5, 0, TAU); g.stroke();
      }
      // red band: gold scrolls
      for (let x = 20; x < L - 20; x += 16) { const y = gun(x) + 4; g.strokeStyle = '#f0c75a'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 2.8, 0.3, TAU - 0.6); g.stroke(); }
      // hull planks & shading
      for (let k = 0; k < 6; k++) { g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8; g.beginPath(); for (let x = 0; x <= L; x += 6) { const y = gun(x) + 62 + k * 10; if (!x) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
      g.fillStyle = lg(g, 0, 60, 0, 190, [[0, 'rgba(255,255,255,0.06)'], [1, 'rgba(0,0,0,0.35)']]); g.fillRect(-10, 0, L + 20, 200);
      g.restore();
      hull(g); g.strokeStyle = '#120c0c'; g.lineWidth = 1.6; g.stroke();
      // gunwale rail
      g.strokeStyle = '#e2b04a'; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= L; x += 6) { if (!x) g.moveTo(x, gun(x)); else g.lineTo(x, gun(x)); } g.stroke();
      // bow eye 龍目
      const ex = L - 34, ey = gun(L - 34) + 22;
      g.fillStyle = '#b42c24'; ell(g, ex, ey, 15, 11); g.fill();
      g.fillStyle = '#f6f0e0'; ell(g, ex, ey, 12, 8.4); g.fill();
      g.fillStyle = '#121010'; ell(g, ex + 2, ey, 5.4, 5.4); g.fill();
      g.fillStyle = '#ffffff'; ell(g, ex + 0.5, ey - 2, 1.6, 1.6); g.fill();
      g.strokeStyle = '#121010'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(ex - 14, ey - 10); g.quadraticCurveTo(ex, ey - 17, ex + 15, ey - 9); g.stroke();
      // stern transom panel
      // waterline cut for afloat version
      if (water) {
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = lg(g, 0, 150, 0, 172, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,1)']]);
        g.fillRect(-40, 150, L + 80, 60);
        g.globalCompositeOperation = 'source-over';
      }
    });
  }
  const FIVE = ['#2f8a5a', '#d2352a', '#f0c23a', '#f2efe6', '#2a2a2a'];
  function pennant(ctx, x, y, len, wid, col, t, ph, dir = 1) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, y);
    const n = 6;
    for (let i = 1; i <= n; i++) { const u = i / n; ctx.lineTo(x + dir * len * u, y + sin(t * 6 + ph - u * 3) * 2.2 * u + wid * 0.5 * u * 0); }
    for (let i = n; i >= 0; i--) { const u = i / n; ctx.lineTo(x + dir * len * u, y + wid * (1 - u) + sin(t * 6 + ph - u * 3) * 2.2 * u); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6; ctx.stroke();
  }
  G.Objects.define('wang_boat', {
    w: 6, h: 3, solid: true, anim: true,
    draw(ctx, px, py, o, t) {
      const water = !!o.water;
      const s = wangBoatSprite(water);
      const bob = water ? sin(t * 1.3 + (o.x || 0)) * 2 : 0;
      const ox = px, oy = py + (water ? 8 : 0) + bob;
      put(ctx, s, ox, oy);
      // mast-top streamers & gunwale 令旗 (five directions colours)
      const gun = WB.gun;
      pennant(ctx, ox + 214, oy + lerp(gun(214) - 52, gun(214), 0.5) - 302, 46, 7, '#d2352a', t, 0, -1);
      pennant(ctx, ox + 312, oy + lerp(gun(312) - 52, gun(312), 0.5) - 222, 34, 6, '#f0c23a', t, 1.3, -1);
      pennant(ctx, ox + 118, oy + lerp(gun(118) - 52, gun(118), 0.5) - 192, 30, 6, '#2f8a5a', t, 2.1, -1);
      for (let i = 0; i < 8; i++) {
        const x = 120 + i * 30, y = gun(x);
        ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(ox + x, oy + y + 2); ctx.lineTo(ox + x, oy + y - 22); ctx.stroke();
        pennant(ctx, ox + x, oy + y - 22, 13, 9, FIVE[i % 5], t, i * 0.9, -1);
      }
      if (water) {
        const wy = py + 8 + 166 + bob * 0.3;
        ctx.strokeStyle = 'rgba(235,248,255,0.55)'; ctx.lineWidth = 1.6;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          for (let x = 10; x <= WB.L - 10; x += 8) { const y = wy + k * 5 + sin(x * 0.08 + t * 2 + k) * 1.2; if (x === 10) ctx.moveTo(px + x - k * 8, y); else ctx.lineTo(px + x - k * 8, y); }
          ctx.globalAlpha = 0.7 - k * 0.22; ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
    },
    lights: (o) => {
      const gun = WB.gun, cB = lerp(gun(50) - 52, gun(50), 0.55), y = cB - 46 + 14 + (o.water ? 8 : 0);
      return [{ dx: 18, dy: y, r: 80, color: '#ff9a50', flicker: 0.35 }, { dx: 88, dy: y, r: 80, color: '#ff9a50', flicker: 0.35 }];
    },
  });

  // =============================================================================================
  // 孤棚 guzhao — 12 greased poles, platform, 13 offering towers (孤棧) topped with 順風旗
  // =============================================================================================
  const GZ = { P: 240, deck: 70 };
  building('guzhao', {
    w: 4, h: 3, door: false, margin: [30, 470, 34, 14],
    paint(g, W, H, o, d, rng) {
      const Pp = GZ.P, cx = W / 2;
      const rowsY = [26, 100, 176];
      const d1 = rowsY[2] - Pp, d0 = d1 - GZ.deck;
      ellShadow(g, W / 2 + 12, H - 6, W * 0.62, 26, 0.35);
      // 12 greased poles (孤柱), back → front; rear rows slightly converge for depth
      rowsY.forEach((gy, r) => {
        const k = 1 - (2 - r) * 0.05;
        for (const x0 of [16, 90, 166, 240]) {
          const x = cx + (x0 * W / 256 - cx) * k, dim = (2 - r) * 0.14, w = 12 - (2 - r) * 1.5;
          g.fillStyle = 'rgba(0,0,0,0.3)'; ell(g, x + 3, gy + 2, w, 4); g.fill();
          g.fillStyle = '#8a857a'; rr(g, x - w * 0.7, gy - 6, w * 1.4, 8, 2); g.fill();
          g.fillStyle = lg(g, x - w / 2, 0, x + w / 2, 0, [[0, shade('#5a4030', 0.2 - dim)], [0.3, shade('#2e1e14', -dim)], [1, shade('#0e0805', -dim)]]);
          g.fillRect(x - w / 2, d1 + 6, w, gy - d1 - 8);
          g.fillStyle = `rgba(255,236,200,${0.4 - dim * 1.5})`; g.fillRect(x - w / 2 + 2, d1 + 8, 1.6, gy - d1 - 14);
          for (let q = 0; q < 7; q++) { const y = d1 + 10 + rng() * (gy - d1 - 30); g.fillStyle = `rgba(255,240,210,${0.3 - dim})`; g.fillRect(x - w / 2 + 1.5, y, 2.4, 6 + rng() * 16); }
          // drips of grease
          g.fillStyle = 'rgba(20,12,6,0.6)'; for (let q = 0; q < 3; q++) ell(g, x + (rng() - 0.5) * w, gy - 4 - rng() * 30, 1.2, 2.4), g.fill();
        }
      });
      // platform (overhanging edge 倒爬) — top drawn foreshortened
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(-10, d1 + 8, W + 20, 18);
      g.fillStyle = lg(g, 0, d0, 0, d1, [[0, '#6e5034'], [1, '#a07a50']]); g.fillRect(-16, d0, W + 32, d1 - d0);
      for (let y = d0; y < d1; y += 6) { g.fillStyle = 'rgba(40,24,10,0.25)'; g.fillRect(-16, y, W + 32, 1); }
      for (let x = -16; x < W + 16; x += 34) { g.fillStyle = 'rgba(40,24,10,0.2)'; g.fillRect(x, d0, 1, d1 - d0); }
      g.fillStyle = '#4a3220'; g.fillRect(-18, d1, W + 36, 12);
      g.fillStyle = '#c8302a'; g.fillRect(-18, d1 + 3, W + 36, 6);
      for (let x = -18; x < W + 18; x += 8) { g.fillStyle = '#e2b04a'; P(g, [x, d1 + 9, x + 8, d1 + 9, x + 4, d1 + 14]); g.fill(); }
      // ---- 13 孤棧: conical bamboo frames hung with offerings, each topped by a 順風旗
      const rows = [
        { y: d0 + 14, xs: [0.1, 0.3, 0.5, 0.7, 0.9], h: 150 },
        { y: d0 + 38, xs: [0.2, 0.4, 0.6, 0.8], h: 168 },
        { y: d1 - 4, xs: [0.12, 0.37, 0.63, 0.88], h: 140 },
      ];
      const offerings = ['#e8d8b0', '#d2352a', '#f0c23a', '#f2efe6', '#8a5a30', '#e07a2a', '#3a8a5a', '#f2a0a8', '#c8a060'];
      rows.forEach((row, ri) => {
        row.xs.forEach((fx, i) => {
          const x = fx * W, base = row.y, big = ri === 1 && (i === 1 || i === 2);
          const h = row.h + (big ? 30 : 0) + rng() * 10, bw = 42, tw = 5;
          const dim = (2 - ri) * 0.1;
          g.fillStyle = 'rgba(0,0,0,0.35)'; ell(g, x + 4, base + 1, bw * 0.6, 4.5); g.fill();
          // red cloth skirt at the base
          g.fillStyle = shade('#b8281e', -dim); P(g, [x - bw / 2 - 2, base, x + bw / 2 + 2, base, x + bw / 2 - 2, base - 12, x - bw / 2 + 2, base - 12]); g.fill();
          const prof = (u) => lerp(bw, tw, u ** 0.85) / 2;
          const rings = 22;
          for (let k = 0; k < rings; k++) {
            const u = k / rings, y = base - 10 - u * (h - 22), w = prof(u);
            const n = max(2, round(w / 2.6));
            for (let j = 0; j < n; j++) {
              const xx = x - w + (j + 0.5) * (2 * w / n);
              const c = shade(pick(rng, offerings), (rng() - 0.5) * 0.15 - dim - abs(xx - x) / (w + 1) * 0.25);
              const pw = 2 * w / n + 0.6;
              g.fillStyle = shade(c, -0.45); rr(g, xx - pw / 2, y - 6.6, pw, 7.4, 1.4); g.fill();
              g.fillStyle = c; rr(g, xx - pw / 2 + 0.3, y - 7, pw - 0.6, 6.4, 1.4); g.fill();
              if (rng() < 0.3) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(xx - pw / 2 + 1, y - 6.4, 1, 3); }
            }
          }
          // bamboo ribs of the frame
          g.strokeStyle = rgba('#d8c080', 0.55); g.lineWidth = 0.9;
          for (const s of [-1, -0.4, 0.4, 1]) { g.beginPath(); g.moveTo(x + s * bw / 2, base - 10); g.quadraticCurveTo(x + s * bw * 0.3, base - h * 0.5, x + s * tw / 2, base - h + 12); g.stroke(); }
          // light/shade across the cone
          g.save(); g.beginPath(); g.moveTo(x - bw / 2, base - 8); g.quadraticCurveTo(x - bw * 0.3, base - h * 0.5, x, base - h + 6); g.quadraticCurveTo(x + bw * 0.3, base - h * 0.5, x + bw / 2, base - 8); g.closePath(); g.clip();
          g.fillStyle = lg(g, x - bw / 2, 0, x + bw / 2, 0, [[0, 'rgba(255,240,210,0.12)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(20,8,4,0.35)']]); g.fillRect(x - bw, base - h, bw * 2, h);
          g.restore();
          // flag pole + 順風旗
          const top = base - h;
          g.strokeStyle = '#c4aa6a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, top + 14); g.lineTo(x, top - 18); g.stroke();
          const fc = big ? '#d2352a' : pick(rng, ['#d2352a', '#f0c23a', '#2f8a5a', '#d2352a', '#f2efe6']);
          g.fillStyle = fc; P(g, [x + 1, top - 18, x + (big ? 19 : 15), top - 12, x + 1, top - 6]); g.fill();
          g.strokeStyle = shade(fc, -0.5); g.lineWidth = 0.7; g.stroke();
          g.fillStyle = '#e2b04a'; ell(g, x, top - 19, 1.8, 1.8); g.fill();
        });
      });
      // lanterns along the platform edge
      for (let i = 0; i < 6; i++) lantern(g, -10 + (W + 20) * (i + 0.5) / 6, d1 + 12, 6.5, { col: '#d8352a', cord: 4 });
    },
    lights: (o, W) => {
      const y = 176 - GZ.P + 30;
      return [0.5, 2.5, 4.5].map((i) => ({ dx: -10 + (W + 20) * (i + 0.5) / 6, dy: y, r: 120, color: '#ff9040', flicker: 0.4 }));
    },
  });

  // =============================================================================================
  // 恆春古城 fort_gate — stone & brick gate wall, arched passage, small gate tower
  // =============================================================================================
  building('fort_gate', {
    w: 3, h: 2, doorDefault: (w) => floor(w / 2), margin: [10, 80, 16, 10],
    key: (o) => o.text || '',
    solidAt: (o, dx) => dx !== doorOf(o, { w: 3, doorDefault: (w) => floor(w / 2) }),
    paint(g, W, H, o, d, rng) {
      const Fh = 100, ft = H - Fh, top = ft - 70;
      baseShadow(g, W, H, 0.38, 90);
      // walkway on top (foreshortened)
      g.fillStyle = lg(g, 0, top, 0, ft, [[0, '#7e7666'], [1, '#a29a88']]); g.fillRect(0, top + 6, W, ft - top);
      g.save(); g.beginPath(); g.rect(0, top + 6, W, ft - top); g.clip();
      for (let y = top + 6; y < ft; y += 7) for (let x = ((y / 7 | 0) % 2) * 10; x < W; x += 20) { g.fillStyle = shade('#988f7c', (rng() - 0.5) * 0.15); g.fillRect(x + 0.5, y + 0.5, 19, 6); }
      for (let i = 0; i < 8; i++) grassTuft(g, rng() * W, top + 12 + rng() * (ft - top - 12), 0.8, pick(rng, ['#6a8a3a', '#7a9a48', '#5a7a32']));
      g.fillStyle = lg(g, 0, top + 6, 0, top + 16, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(0, top + 6, W, 10);
      g.restore();
      // back parapet
      bricks(g, 0, top - 4, W, 12, '#8a6a5a', rng, { bw: 10, bh: 4 });
      g.fillStyle = '#a89a86'; g.fillRect(0, top - 6, W, 3);
      // gate tower (城樓) above the passage
      const tcx = d * T + 32, tx0 = tcx - 46, tx1 = tcx + 46, tB = ft - 14, tT = tB - 40;
      g.fillStyle = '#c7bfae'; g.fillRect(tx0 - 6, tB - 2, tx1 - tx0 + 12, 6);
      g.fillStyle = '#5a2a20'; g.fillRect(tx0, tT, tx1 - tx0, tB - tT);
      for (let i = 0; i < 3; i++) {
        const x = tx0 + 5 + i * 28;
        g.fillStyle = '#2a140e'; g.fillRect(x + 2, tT + 8, 22, tB - tT - 10);
        g.strokeStyle = '#9a5a3a'; g.lineWidth = 0.8;
        for (let yy = tT + 11; yy < tB - 3; yy += 5) { g.beginPath(); g.moveTo(x + 3, yy); g.lineTo(x + 23, yy); g.stroke(); }
      }
      for (const x of [tx0, tx0 + 31, tx0 + 61, tx1 - 3]) { g.fillStyle = lg(g, x - 1, 0, x + 4, 0, [[0, '#d8483a'], [1, '#7a1a12']]); g.fillRect(x - 1, tT, 5, tB - tT); }
      faceAO(g, tx0, tT, tx1 - tx0, tB - tT, { top: 0.6, th: 12, bot: 0.1 });
      curvedRoof(g, { ex0: tx0 - 16, ex1: tx1 + 16, eY: tT + 6, rx0: tx0 + 4, rx1: tx1 - 4, rY: tT - 26, lift: 10, base: '#5c5a58', pitch: 6, rng });
      ridge(g, tx0 + 6, tx1 - 6, tT - 26, { th: 6, col: '#6a6662', tail: 14, lift: 3, fork: false });
      // ---- front face: rubble-stone base, brick upper
      cobbles(g, 0, ft + 44, W, Fh - 44, ['#b8ae98', '#a49a86', '#c4baa4', '#968c78'], rng, 13);
      bricks(g, 0, ft, W, 46, '#8e5e4c', rng, { bw: 12, bh: 5, v: 0.14 });
      g.fillStyle = '#b2a690'; g.fillRect(0, ft + 43, W, 3);
      // crenellations (雉堞)
      for (let x = 0; x < W; x += 24) {
        bricks(g, x, ft - 14, 15, 15, '#946452', rng, { bw: 8, bh: 4 });
        g.fillStyle = '#b8aa94'; g.fillRect(x - 0.5, ft - 17, 16, 3.5);
        g.fillStyle = '#2a1e18'; g.fillRect(x + 6, ft - 8, 3, 5);
      }
      g.fillStyle = '#b8aa94'; g.fillRect(0, ft - 1, W, 3);
      // arch passage
      const aw = 23, spring = H - 44;
      g.fillStyle = '#d2c8b2';
      g.beginPath(); g.moveTo(tcx - aw - 7, H); g.lineTo(tcx - aw - 7, spring); g.arc(tcx, spring, aw + 7, PI, TAU); g.lineTo(tcx + aw + 7, H); g.closePath(); g.fill();
      for (let k = 0; k <= 10; k++) {
        const a = PI + k / 10 * PI;
        g.strokeStyle = 'rgba(90,70,50,0.55)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(tcx + cos(a) * aw, spring + sin(a) * aw); g.lineTo(tcx + cos(a) * (aw + 7), spring + sin(a) * (aw + 7)); g.stroke();
      }
      g.beginPath(); g.moveTo(tcx - aw, H); g.lineTo(tcx - aw, spring); g.arc(tcx, spring, aw, PI, TAU); g.lineTo(tcx + aw, H); g.closePath();
      g.fillStyle = lg(g, 0, spring - aw, 0, H, [[0, '#0e0a08'], [1, '#2a2018']]); g.fill();
      // light at the far end of the tunnel
      g.fillStyle = 'rgba(220,210,170,0.35)';
      g.beginPath(); g.moveTo(tcx - 13, H - 16); g.lineTo(tcx - 13, spring + 4); g.arc(tcx, spring + 4, 13, PI, TAU); g.lineTo(tcx + 13, H - 16); g.closePath(); g.fill();
      g.fillStyle = 'rgba(200,190,150,0.25)'; P(g, [tcx - 13, H - 16, tcx + 13, H - 16, tcx + aw, H, tcx - aw, H]); g.fill();
      // plaque
      hPlaque(g, tcx, ft + 14, 40, 15, o.text || '南門', { bg: '#d8d0bc', fg: '#3a2a20', frame: '#8a7a64' });
      // weathering & plants
      g.save(); g.beginPath(); g.rect(0, ft, W, Fh); g.clip();
      for (let i = 0; i < 10; i++) { const x = rng() * W; g.fillStyle = lg(g, 0, ft, 0, ft + 40, [[0, 'rgba(30,24,16,0.3)'], [1, 'rgba(30,24,16,0)']]); g.fillRect(x, ft, 2 + rng() * 5, 26 + rng() * 30); }
      g.restore();
      for (let i = 0; i < 5; i++) grassTuft(g, rng() * W, ft - 14, 1, '#6a8a3a');
      faceAO(g, 0, ft, W, Fh, { top: 0.15, th: 6, bot: 0.35 });
    },
  });

  // =============================================================================================
  // 石滬 stone_weir — curved dry-stone wall in the shallows (w/h overrides). v1 = 雙心 double heart
  // =============================================================================================
  function weirPath(W, H, v) {
    const pts = [];
    if ((v | 0) === 1) {
      const heart = (cx, cy, s) => {
        for (let i = 0; i <= 80; i++) {
          const a = i / 80 * TAU;
          pts.push([cx + 16 * sin(a) ** 3 * s, cy - (13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a)) * s]);
        }
        pts.push(null);
      };
      const s = min(W / 36, H / 58);
      heart(W / 2, H * 0.36, s * 0.9);
      heart(W / 2, H * 0.68, s * 1.05);
    } else {
      const cx = W / 2, cy = H - 8, rx = W / 2 - 14, ry = H - 22;
      for (let i = 0; i <= 90; i++) { const a = PI + i / 90 * PI; pts.push([cx + cos(a) * rx, cy + sin(a) * ry]); }
      pts.push(null);
    }
    // resample by arc length
    const out = []; let prev = null, acc = 0;
    for (const p of pts) {
      if (!p) { prev = null; continue; }
      if (!prev) { out.push(p); prev = p; acc = 0; continue; }
      const dd = hypot(p[0] - prev[0], p[1] - prev[1]);
      acc += dd;
      if (acc >= 5) { out.push(p); acc = 0; }
      prev = p;
    }
    return out;
  }
  const WEIR_SOLID = new Map();
  building('stone_weir', {
    w: 5, h: 3, door: false, margin: [14, 14, 14, 14], anim: true,
    solidAt(o, dx, dy) {
      const w = o.w || 5, h = o.h || 3, key = w + 'x' + h + ':' + (o.v | 0);
      let set = WEIR_SOLID.get(key);
      if (!set) {
        set = new Set();
        for (const [x, y] of weirPath(w * T, h * T, o.v)) set.add(floor(clamp(x, 0, w * T - 1) / T) + ',' + floor(clamp(y, 0, h * T - 1) / T));
        WEIR_SOLID.set(key, set);
      }
      return set.has(dx + ',' + dy);
    },
    paint(g, W, H, o, d, rng) {
      const pts = weirPath(W, H, o.v);
      // dark submerged footing & foam halo
      for (const [x, y] of pts) { g.fillStyle = 'rgba(10,30,40,0.18)'; ell(g, x + 2, y + 3, 11, 8); g.fill(); }
      for (const [x, y] of pts) { g.fillStyle = 'rgba(235,250,255,0.08)'; ell(g, x, y + 1, 12, 8); g.fill(); }
      const stones = [];
      for (const [x, y] of pts) for (let k = 0; k < 2; k++) stones.push([x + (rng() - 0.5) * 9, y + (rng() - 0.5) * 6, 4 + rng() * 3.4, rng()]);
      stones.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r, c] of stones) {
        const col = shade(c < 0.6 ? '#4a4642' : c < 0.85 ? '#5e5850' : '#6e6a5e', (rng() - 0.5) * 0.2);
        g.fillStyle = 'rgba(0,10,20,0.4)'; ell(g, x + 1, y + 1.6, r, r * 0.7); g.fill();
        g.fillStyle = rg(g, x - r * 0.4, y - r * 0.5, 0, r * 1.4, [[0, shade(col, 0.35)], [0.5, col], [1, shade(col, -0.35)]]);
        ell(g, x, y, r, r * 0.72); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, x - r * 0.35, y - r * 0.35, r * 0.3, r * 0.15); g.fill();
        if (rng() < 0.3) { g.fillStyle = 'rgba(230,225,200,0.6)'; g.fillRect(x + (rng() - 0.5) * r, y + (rng() - 0.3) * r * 0.5, 1, 1); }
      }
      // wet water-line at the base
      g.strokeStyle = 'rgba(220,245,255,0.3)'; g.lineWidth = 1.2;
      for (const [x, y] of pts) { if (rng() < 0.5) { g.beginPath(); g.moveTo(x - 4, y + 5); g.lineTo(x + 3, y + 5.5); g.stroke(); } }
    },
    live(ctx, px, py, o, t, W, H) {
      const key = 'wp' + W + 'x' + H + (o.v | 0);
      let pts = WEIR_SOLID.get(key);
      if (!pts) { pts = weirPath(W, H, o.v); WEIR_SOLID.set(key, pts); }
      ctx.fillStyle = '#eaf8ff';
      for (let i = 0; i < pts.length; i += 3) {
        const a = sin(t * 1.7 + i * 0.73) * 0.5 + sin(t * 0.9 + i * 0.31) * 0.5;
        if (a < 0.45) continue;
        ctx.globalAlpha = (a - 0.45) * 1.3;
        const [x, y] = pts[i];
        ctx.fillRect(px + x - 3, py + y + 4.5, 6, 1.2);
      }
      ctx.globalAlpha = 1;
    },
  });

  // =============================================================================================
  // basalt — columnar basalt cluster (hexagonal prisms)
  // =============================================================================================
  building('basalt', {
    w: 2, h: 2, door: false, margin: [16, 110, 20, 10],
    paint(g, W, H, o, d, rng) {
      ellShadow(g, W / 2 + 8, H - 18, W * 0.56, H * 0.3, 0.38);
      const r = 12.5, dx = r * sqrt(3), dy = r * 1.5 * 0.55;
      const cols = [];
      for (let row = 0, y = 30; y < H - 6; row++, y += dy) {
        for (let x = 10 + (row % 2) * dx / 2; x < W - 8; x += dx) {
          const nx = (x - W / 2) / (W * 0.5), ny = (y - H * 0.58) / (H * 0.46);
          const dist = nx * nx + ny * ny;
          if (dist > 1 || rng() < 0.08) continue;
          const h = 14 + (1 - dist) * 74 * (0.55 + rng() * 0.55) + (y < H * 0.5 ? 10 : 0);
          cols.push({ x: x + (rng() - 0.5) * 2, y, h, c: shade('#4a4744', (rng() - 0.5) * 0.18) });
        }
      }
      cols.sort((a, b) => a.y - b.y);
      const hex = (cx, cy, k) => [cx + cos(k * PI / 3) * r, cy + sin(k * PI / 3) * r * 0.55];
      for (const c of cols) {
        const top = c.y - c.h;
        // three visible side faces: k=0..3 (right, front-right, front-left, left)
        const faces = [[0, 1, -0.32], [1, 2, -0.12], [2, 3, 0.1]];
        for (const [a, b, sh] of faces) {
          const [x0, y0] = hex(c.x, top, a), [x1, y1] = hex(c.x, top, b);
          const col = shade(c.c, sh);
          g.fillStyle = lg(g, 0, top, 0, c.y + 6, [[0, shade(col, 0.08)], [1, shade(col, -0.25)]]);
          P(g, [x0, y0, x1, y1, x1, y1 + c.h, x0, y0 + c.h]); g.fill();
          g.strokeStyle = shade(c.c, -0.55); g.lineWidth = 0.9; g.stroke();
          // cross joints
          for (let yy = top + 12 + rng() * 10; yy < c.y - 4; yy += 16 + rng() * 14) {
            g.strokeStyle = 'rgba(20,18,16,0.55)'; g.lineWidth = 0.8;
            g.beginPath(); g.moveTo(x0, y0 - top + yy); g.lineTo(x1, y1 - top + yy + (rng() - 0.5) * 2); g.stroke();
          }
        }
        // top face
        const tp = []; for (let k = 0; k < 6; k++) tp.push(...hex(c.x, top, k));
        g.fillStyle = rg(g, c.x - 4, top - 3, 0, r * 1.4, [[0, shade(c.c, 0.32)], [1, shade(c.c, 0.08)]]);
        P(g, tp); g.fill(); g.strokeStyle = shade(c.c, -0.5); g.lineWidth = 0.9; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(...hex(c.x, top, 3)); g.lineTo(...hex(c.x, top, 4)); g.lineTo(...hex(c.x, top, 5)); g.stroke();
        if (rng() < 0.55) { g.fillStyle = rgba(pick(rng, ['#a8a85a', '#c8b86a', '#7a8a4a', '#d8d0a0']), 0.55); ell(g, c.x + (rng() - 0.5) * 8, top + (rng() - 0.5) * 3, 2 + rng() * 3, 1.2 + rng() * 1.5); g.fill(); }
      }
      for (let i = 0; i < 6; i++) grassTuft(g, 10 + rng() * (W - 20), H - 10 - rng() * 30, 0.8, '#6a7a3a');
    },
  });

  // =============================================================================================
  // 蜂炮 firecracker_tower — 炮城 rack of bottle-rockets; sparks fly when lit
  // =============================================================================================
  building('firecracker_tower', {
    w: 2, h: 1, door: false, margin: [10, 130, 12, 8], key: (o) => o.text || '',
    paint(g, W, H, o, d, rng) {
      ellShadow(g, W / 2 + 6, H - 8, W * 0.5, 12, 0.4);
      // cart base & wheels
      g.fillStyle = '#4a3220'; g.fillRect(6, H - 26, W - 12, 8);
      for (const x of [20, W - 20]) {
        g.fillStyle = '#2a1c12'; ell(g, x, H - 12, 11, 11); g.fill();
        g.strokeStyle = '#7a5a3a'; g.lineWidth = 2; ell(g, x, H - 12, 9, 9); g.stroke();
        for (let k = 0; k < 6; k++) { const a = k / 6 * PI; g.beginPath(); g.moveTo(x - cos(a) * 9, H - 12 - sin(a) * 9); g.lineTo(x + cos(a) * 9, H - 12 + sin(a) * 9); g.stroke(); }
      }
      // cabinet
      const x0 = 10, x1 = W - 10, y0 = -86, y1 = H - 26;
      g.fillStyle = '#5a3a24'; g.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 3);
      g.fillStyle = '#2a1a12'; g.fillRect(x0 + 3, y0 + 3, x1 - x0 - 6, y1 - y0 - 6);
      // rocket grid (蜂巢)
      for (let y = y0 + 8; y < y1 - 4; y += 6.4) for (let x = x0 + 7 + ((y / 6.4 | 0) % 2) * 3; x < x1 - 4; x += 6.4) {
        g.fillStyle = '#c8302a'; ell(g, x, y, 2.6, 2.6); g.fill();
        g.fillStyle = '#f2e8d0'; ell(g, x - 0.3, y - 0.3, 1.4, 1.4); g.fill();
        g.fillStyle = '#3a1410'; ell(g, x, y, 0.6, 0.6); g.fill();
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + 3, y0 + 3, x1 - x0 - 6, 6);
      // red paper frame strips with gold
      for (const x of [x0 - 4, x1 - 2]) { g.fillStyle = '#d23a2c'; g.fillRect(x, y0 - 4, 6, y1 - y0 + 4); g.fillStyle = '#f0c75a'; g.fillRect(x + 2.4, y0, 1.2, y1 - y0 - 4); }
      // top canopy & sign
      g.fillStyle = '#d23a2c'; P(g, [x0 - 10, y0 - 2, x1 + 10, y0 - 2, x1, y0 - 16, x0, y0 - 16]); g.fill();
      for (let x = x0 - 10; x < x1 + 10; x += 6) { g.fillStyle = '#f0c75a'; P(g, [x, y0 - 2, x + 6, y0 - 2, x + 3, y0 + 3]); g.fill(); }
      hPlaque(g, W / 2, y0 - 26, 52, 18, o.text || '炮城', { bg: '#d23a2c', fg: '#f8e08a', frame: '#e2b04a' });
      faceAO(g, x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 3, { top: 0.4, th: 10, bot: 0.25 });
    },
    live(ctx, px, py, o, t, W, H) {
      if (o.lit === false) return;
      const x0 = px + 14, y0 = py - 80, gw = W - 28, gh = 100;
      const N = 30, seed = (o.x || 0) * 13 + (o.y || 0) * 7;
      ctx.save();
      for (let i = 0; i < N; i++) {
        const h1 = U.hash(i, 1, seed), h2 = U.hash(i, 2, seed), h3 = U.hash(i, 3, seed);
        const per = 0.7 + h1 * 0.7, ph = ((t + h2 * 9) / per) % 1;
        const ox = x0 + h1 * gw, oy = y0 + h2 * gh;
        const a = U.hash(i, 6, seed) * TAU;
        const dist = ph * (80 + h3 * 110), dxv = cos(a), dyv = sin(a) * 0.55 + 0.15;
        const x = ox + dxv * dist, y = oy + dyv * dist - ph * ph * 10;
        const al = 1 - ph;
        ctx.strokeStyle = `rgba(255,${190 + floor(h1 * 60)},110,${al * 0.85})`; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(x - dxv * 20, y - dyv * 20); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = `rgba(255,250,220,${al})`; ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        if (i % 3 === 0) glow(ctx, x, y, 10, '#ffb040', al * 0.6);
      }
      // muzzle flashes on the face
      for (let i = 0; i < 6; i++) {
        const k = floor(t * 14) + i * 17;
        const fx = x0 + U.hash(k, 4, seed) * gw, fy = y0 + U.hash(k, 5, seed) * gh;
        glow(ctx, fx, fy, 16, '#ffd070', 0.8);
      }
      // smoke
      for (let i = 0; i < 6; i++) {
        const ph = ((t * 0.35 + i / 6) % 1);
        ctx.fillStyle = `rgba(200,195,190,${(1 - ph) * 0.18})`;
        ell(ctx, px + W / 2 + sin(i * 2.1 + t) * 20, py - 100 - ph * 70, 14 + ph * 26, 10 + ph * 16); ctx.fill();
      }
      ctx.restore();
    },
    lights: (o, W) => (o.lit === false ? [] : [{ dx: W / 2, dy: -30, r: 170, color: '#ffb050', flicker: 0.9 }]),
  });

  // =============================================================================================
  // 七娘媽亭 qixi_pavilion — three-tier paper pavilion on an offering table (做十六歲)
  // =============================================================================================
  building('qixi_pavilion', {
    w: 2, h: 2, door: false, margin: [8, 80, 12, 8], anim: true,
    paint(g, W, H, o, d, rng) {
      const cx = W / 2;
      ellShadow(g, cx + 6, H - 8, W * 0.52, 14, 0.38);
      // table
      const tT = 52, tF = 78, tB = H - 6;
      g.fillStyle = lg(g, 0, tT, 0, tF, [[0, '#8a4a2a'], [1, '#6a3420']]); g.fillRect(6, tT, W - 12, tF - tT);
      g.fillStyle = 'rgba(255,230,200,0.2)'; g.fillRect(6, tT, W - 12, 1.5);
      // 桌裙 front cloth
      g.fillStyle = lg(g, 0, tF, 0, tB, [[0, '#d23a2c'], [1, '#9a2018']]); g.fillRect(4, tF, W - 8, tB - tF);
      g.fillStyle = '#f0c75a'; g.fillRect(4, tF, W - 8, 4);
      g.strokeStyle = '#f0c75a'; g.lineWidth = 1; g.strokeRect(14, tF + 9, W - 28, tB - tF - 16);
      g.beginPath(); g.arc(cx, tF + (tB - tF) / 2 + 1, 9, 0, TAU); g.stroke();
      g.beginPath(); g.arc(cx, tF + (tB - tF) / 2 + 1, 5, 0, TAU); g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 14, tF + 21); g.quadraticCurveTo(cx + s * 28, tF + 12, cx + s * 40, tF + 22); g.stroke(); }
      for (let x = 4; x < W - 4; x += 6) { g.fillStyle = '#f0c75a'; P(g, [x, tB, x + 6, tB, x + 3, tB + 3]); g.fill(); }
      // offerings on the table
      for (const s of [-1, 1]) {
        g.fillStyle = '#e8e0d0'; ell(g, cx + s * 40, tT + 16, 9, 3.5); g.fill();
        for (let k = 0; k < 3; k++) { g.fillStyle = '#f08a2a'; ell(g, cx + s * 40 + (k - 1) * 4.5, tT + 12, 2.6, 2.4); g.fill(); }
        g.fillStyle = '#c8302a'; g.fillRect(cx + s * 52 - 1.6, tT + 4, 3.2, 12);
        g.fillStyle = '#e2b04a'; g.fillRect(cx + s * 52 - 3, tT + 15, 6, 2);
      }
      // pavilion tiers
      const tier = (x0, x1, yB, yT, wallCols, roofCol, roofW, roofH) => {
        g.fillStyle = shade(wallCols[0], -0.3); g.fillRect(x0, yT, x1 - x0, yB - yT);
        const n = 3, bw = (x1 - x0) / n;
        for (let i = 0; i < n; i++) {
          const x = x0 + i * bw;
          g.fillStyle = wallCols[i % wallCols.length]; g.fillRect(x + 2, yT + 2, bw - 4, yB - yT - 4);
          g.strokeStyle = '#f0c75a'; g.lineWidth = 0.8; g.strokeRect(x + 4, yT + 4, bw - 8, yB - yT - 8);
          g.fillStyle = 'rgba(255,255,255,0.35)'; ell(g, x + bw / 2, yT + (yB - yT) / 2, 2.6, 2.6); g.fill();
        }
        for (let i = 0; i <= n; i++) { g.fillStyle = '#2f9a6e'; g.fillRect(x0 + i * bw - 1.5, yT, 3, yB - yT); }
        g.fillStyle = '#f0c75a'; g.fillRect(x0 - 2, yB - 2, x1 - x0 + 4, 3);
        const ex0 = (x0 + x1) / 2 - roofW / 2, ex1 = (x0 + x1) / 2 + roofW / 2;
        curvedRoof(g, { ex0, ex1, eY: yT + 4, rx0: x0 + 6, rx1: x1 - 6, rY: yT - roofH, lift: 7, base: roofCol, pitch: 4, corner: 0.3, tipCol: '#f0c75a' });
        // paper tassels
        for (const x of [ex0 + 1, ex1 - 1]) { g.strokeStyle = '#f29ab0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, yT - 2); g.lineTo(x, yT + 8); g.stroke(); g.fillStyle = '#f0c75a'; ell(g, x, yT - 2, 1.6, 1.6); g.fill(); }
      };
      tier(30, W - 30, tT + 10, 18, ['#d8384a', '#3a78c0', '#d8384a'], '#2f8a6a', 84, 12);
      tier(40, W - 40, 6, -22, ['#f2c23a', '#e05a8a', '#f2c23a'], '#c8302a', 66, 10);
      tier(48, W - 48, -32, -56, ['#3a9a78', '#f29ab0', '#3a9a78'], '#3a78c0', 50, 9);
      // pointed top & finial
      g.fillStyle = '#e8384a'; P(g, [cx - 12, -64, cx + 12, -64, cx, -78]); g.fill();
      g.strokeStyle = '#8a1a20'; g.lineWidth = 1; g.stroke();
      gourd(g, cx, -78, 0.9, '#f0c75a');
    },
    live(ctx, px, py, o, t, W) {
      for (const s of [-1, 1]) flame(ctx, px + W / 2 + s * 52, py + 56, 1, t, s * 3 + (o.x || 0));
    },
    lights: (o, W) => [{ dx: W / 2 - 52, dy: 50, r: 60, color: '#ffb060', flicker: 0.6 }, { dx: W / 2 + 52, dy: 50, r: 60, color: '#ffb060', flicker: 0.6 }],
  });

  // =============================================================================================
  // 進香旗 pilgrim_flag — triangular serrated-border flag on a pole; flutters
  // =============================================================================================
  function flagSprite(text, col) {
    return spr('pflag:' + text + col, 70, 80, 0, 0, (g) => {
      const fw = 62, fh = 74;
      const tri = (g2, inset) => P(g2, [inset, inset * 1.4, fw - inset * 2.2, fh / 2, inset, fh - inset * 1.4]);
      // serrated (犬牙) border
      g.fillStyle = '#c8302a';
      const n = 12;
      g.beginPath(); g.moveTo(0, 0);
      for (let i = 0; i < n; i++) { const u0 = i / n, u1 = (i + 0.5) / n, u2 = (i + 1) / n; g.lineTo(lerp(0, fw, u1) + 2.5, lerp(0, fh / 2, u1) - 3.5); g.lineTo(lerp(0, fw, u2), lerp(0, fh / 2, u2)); void u0; }
      for (let i = 0; i < n; i++) { const u1 = (i + 0.5) / n, u2 = (i + 1) / n; g.lineTo(lerp(fw, 0, u1) + 2.5, lerp(fh / 2, fh, u1) + 3.5); g.lineTo(lerp(fw, 0, u2), lerp(fh / 2, fh, u2)); }
      g.closePath(); g.fill();
      g.strokeStyle = '#7a1410'; g.lineWidth = 0.8; g.stroke();
      tri(g, 6); g.fillStyle = lg(g, 0, 0, fw, 0, [[0, shade(col, 0.15)], [1, shade(col, -0.1)]]); g.fill();
      tri(g, 8); g.strokeStyle = '#c8302a'; g.lineWidth = 0.8; g.stroke();
      const chars = [...text]; const fs = min(14, 44 / chars.length);
      g.fillStyle = '#1a1a1a'; g.font = F(fs, true); g.textAlign = 'center'; g.textBaseline = 'middle';
      chars.forEach((c, i) => g.fillText(c, 17, fh / 2 + (i - (chars.length - 1) / 2) * (fs + 1)));
      // shading toward the hoist
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = lg(g, 0, 0, fw, 0, [[0, 'rgba(0,0,0,0.18)'], [0.25, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.1)']]); g.fillRect(0, 0, fw + 4, fh + 4);
      g.globalCompositeOperation = 'source-over';
    });
  }
  function flagPoleSprite() {
    return spr('pflag_pole', 40, 190, 20, 176, (g) => {
      ellShadow(g, 4, 2, 16, 5, 0.38);
      g.fillStyle = '#7a7268'; rr(g, -9, -8, 18, 10, 2); g.fill();
      g.fillStyle = '#9a9288'; rr(g, -9, -10, 18, 4, 2); g.fill();
      g.fillStyle = lg(g, -2, 0, 2, 0, [[0, '#d8483a'], [1, '#7a1612']]); g.fillRect(-2, -168, 4, 160);
      g.fillStyle = '#e2b04a'; P(g, [-3, -168, 3, -168, 0, -176]); g.fill();
      g.fillRect(-3, -168, 6, 2);
      // bell and incense pouch (香火袋)
      g.strokeStyle = '#c8302a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-1, -164); g.lineTo(-6, -150); g.moveTo(-1, -164); g.lineTo(-9, -142); g.stroke();
      g.fillStyle = '#e2b04a'; ell(g, -6, -148, 2.4, 2.6); g.fill();
      g.fillStyle = '#d23a2c'; rr(g, -13, -144, 8, 10, 2); g.fill(); g.fillStyle = '#f0c75a'; g.fillRect(-11, -140, 4, 1.2);
    });
  }
  G.Objects.define('pilgrim_flag', {
    w: 1, h: 1, solid: true, anim: true,
    draw(ctx, px, py, o, t) {
      const pole = flagPoleSprite(), fl = flagSprite(o.text || '進香', o.color || '#f1c232');
      const bx = px + 32, by = py + 52;
      put(ctx, pole, bx, by);
      const fx = bx + 2, fy = by - 162, N = 14, sw = fl.lw / N, ph = t * 4.2 + (o.x || 0);
      for (let i = 0; i < N; i++) {
        const u = i / N, off = sin(ph - u * 4) * 3.4 * u, sq = 1 - 0.06 * u * (1 + sin(ph - u * 4));
        const srcX = i * sw * G.S;
        ctx.drawImage(fl, srcX, 0, sw * G.S + 0.5, fl.height, fx + i * sw * sq, fy + off, sw + 0.4, fl.lh);
      }
    },
  });

  // =============================================================================================
  // rainbow_arch — faint spirit rainbow bridge (over:true, non-solid, anim)
  // =============================================================================================
  const RB = ['#ff5a5a', '#ff9a40', '#ffe060', '#6ee07a', '#5ab0ff', '#6a6aff', '#c070ff'];
  building('rainbow_arch', {
    w: 6, h: 2, door: false, solid: false, over: true, anim: true, margin: [20, 300, 20, 20],
    solidAt: () => false,
    paint(g, W, H) {
      const cx = W / 2, cy = H - 6, rx = W / 2 - 8, ry = min(W * 0.46, 300);
      const band = 24 / RB.length;
      g.globalCompositeOperation = 'lighter';
      // soft outer halo
      for (let k = 0; k < 4; k++) {
        g.strokeStyle = `rgba(200,220,255,${0.05})`; g.lineWidth = 34 + k * 10;
        g.beginPath(); g.ellipse(cx, cy, rx - 12, ry - 12, 0, PI, TAU); g.stroke();
      }
      RB.forEach((c, i) => {
        g.strokeStyle = rgba(c, 0.32); g.lineWidth = band + 2;
        const rr2 = i * band;
        g.beginPath(); g.ellipse(cx, cy, rx - rr2, ry - rr2, 0, PI, TAU); g.stroke();
      });
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(cx, cy, rx - 12, ry - 12, 0, PI, TAU); g.stroke();
      // misty feet
      for (const x of [cx - rx + 12, cx + rx - 12]) {
        g.fillStyle = rg(g, x, cy - 4, 0, 46, [[0, 'rgba(220,235,255,0.35)'], [1, 'rgba(220,235,255,0)']]);
        g.fillRect(x - 46, cy - 50, 92, 70);
      }
      g.globalCompositeOperation = 'source-over';
    },
    blit(ctx, s, px, py, o, t) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * (0.72 + 0.22 * sin(t * 1.1 + (o.x || 0)));
      put(ctx, s, px, py);
      ctx.globalAlpha = a;
    },
    live(ctx, px, py, o, t, W, H) {
      const cx = px + W / 2, cy = py + H - 6, rx = W / 2 - 20, ry = min(W * 0.46, 300) - 12;
      // light pulses walking across, and twinkles
      for (let k = 0; k < 3; k++) {
        const u = ((t * 0.12 + k / 3) % 1), a = PI + u * PI;
        glow(ctx, cx + cos(a) * rx, cy + sin(a) * ry, 26, '#e8f0ff', 0.45 * sin(u * PI));
      }
      for (let i = 0; i < 14; i++) {
        const u = U.hash(i, 9, 3), a = PI + u * PI, off = (U.hash(i, 8, 3) - 0.5) * 26;
        const tw = sin(t * (1.5 + U.hash(i, 7, 3) * 2) + i * 2.3);
        if (tw < 0.3) continue;
        const x = cx + cos(a) * (rx + off), y = cy + sin(a) * (ry + off) - ((t * 6 + i * 10) % 20);
        glow(ctx, x, y, 6, '#ffffff', (tw - 0.3) * 0.9);
      }
    },
    lights: (o, W, H) => [{ dx: 30, dy: H - 10, r: 60, color: '#b8d0ff', flicker: 0.2 }, { dx: W - 30, dy: H - 10, r: 60, color: '#e0b8ff', flicker: 0.2 }],
  });
})();

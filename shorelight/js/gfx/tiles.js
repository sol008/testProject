// 彼岸燈 — terrain tiles. Registers into G.Tiles (see docs/CONTRACTS.md "Tiles").
//
// HOW IT WORKS
//  * Every ground terrain owns a seamless, tileable texture (256 or 384 logical px square, i.e. 4x4 or
//    6x6 cells) painted once into an offscreen canvas. A cell samples the 64x64 window that matches its
//    world position, so textures flow continuously across cells — there is no visible 64px grid.
//    Per-cell decorations (tufts, pebbles, flowers, puddles…) are picked with G.U.hash(cx, cy) to break
//    the texture period.
//  * Autotiling: a cell looks at its 8 neighbours. "Soft" terrains with a higher rank (grass > path >
//    dirt > sand …) spill into lower-ranked neighbours with an irregular wavy fringe, drop shadow and
//    overlapping grass tufts. Water cells draw shorelines (land fringe, foam, a dark bank lip on their
//    north edge), blend into other water types, and animate (scrolling wave/sparkle layers).
//    Wall-type cells draw a 3/4 front face when the cell to the south is not the same wall id,
//    otherwise a top/ceiling texture; floors under a wall get an ambient-occlusion shadow.
//  * Performance: neighbour-dependent overlays are composed once into 64x64 canvases (LRU cache keyed
//    by id + neighbour ids + texture phase). Per frame a static cell costs 1–3 drawImage calls; water
//    and psychedelic cells add 2–3 scrolled/cross-faded layer blits.
//
// NOTES FOR MAP AUTHORS
//  * Walls (cliff, cave_wall, wall_*, hedge, void): author them 2 cells thick. The upper cell renders the
//    top/ceiling texture, the bottom cell (south neighbour differs) renders a front face with a 14px top
//    cap. A 1-cell wall works too (just cap + face). Taller stacks show more top surface, not a taller face.
//  * stairs run north–south (walk up = north); a stair column gets stone side curbs where the west/east
//    neighbour is not stairs. bridge_h spans east–west, bridge_v north–south; the water under a bridge is
//    taken from the neighbouring water cells.
//  * dock / deck: when water lies south of them, the water cell draws the wooden front beam and posts.
//  * rail connects to orthogonal rail neighbours (straight, curve or cross).
//  * lantern_bridge planks connect to neighbouring lantern_bridge cells and to any walkable land;
//    everything else in that cell is black sea.
//  * Solid: all water except `shallow` and `marsh` (wadeable), `field_rice` (paddy), every wall, black_sea.
'use strict';
(() => {
  const U = G.U;
  const T = 64, CAP = 14, TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, abs = Math.abs;
  const mod = (a, n) => ((a % n) + n) % n;
  const strHash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const hsl = (h, s, l, a = 1) => `hsla(${mod(h, 360).toFixed(1)},${s}%,${l}%,${a})`;
  const rgba = U.rgba, shade = U.shade, mix = U.mix;

  // ------------------------------------------------------------------------------------------------
  // caches (rebuilt when the backing-store scale changes)
  let SC = 0;
  const TEX = new Map();     // permanent: textures, strips, sprites
  const OVL = new Map();     // LRU: neighbour-dependent composites
  const OVL_MAX = 900;
  const NONE = { none: true };
  function sync() {
    if (SC !== G.S) { SC = G.S; TEX.clear(); OVL.clear(); }
  }
  function canvas(w, h, paint) {
    const c = U.makeCanvas(w, h);
    c.sc = SC;
    if (paint) paint(c.getContext('2d'));
    return c;
  }
  // seamless square texture with a 64px wrap margin so any 64x64 window (any offset) is in-bounds
  function tex(key, size, paint) {
    let c = TEX.get(key);
    if (c) return c;
    const a = U.makeCanvas(size, size);
    paint(a.getContext('2d'), U.seeded(strHash(key) || 7), size);
    c = U.makeCanvas(size + T, size + T);
    const g = c.getContext('2d');
    for (const ox of [0, size]) for (const oy of [0, size]) g.drawImage(a, ox, oy, size, size);
    c.ts = size; c.n = size / T; c.sc = SC;
    TEX.set(key, c);
    return c;
  }
  // horizontally seamless strip (wall faces)
  function strip(key, size, h, paint) {
    let c = TEX.get(key);
    if (c) return c;
    const a = U.makeCanvas(size, h);
    paint(a.getContext('2d'), U.seeded(strHash(key) || 7), size, h);
    c = U.makeCanvas(size + T, h);
    const g = c.getContext('2d');
    g.drawImage(a, 0, 0, size, h); g.drawImage(a, size, 0, size, h);
    c.ts = size; c.n = size / T; c.sc = SC;
    TEX.set(key, c);
    return c;
  }
  function sprite(key, w, h, paint) {
    let c = TEX.get(key);
    if (c) return c;
    c = canvas(w, h);
    paint(c.getContext('2d'), U.seeded(strHash(key) || 7));
    TEX.set(key, c);
    return c;
  }
  function ovl(key, build) {
    let c = OVL.get(key);
    if (c !== undefined) {
      OVL.delete(key); OVL.set(key, c);
      return c === NONE ? null : c;
    }
    c = build(U.seeded(strHash(key) || 7)) || NONE;
    OVL.set(key, c);
    if (OVL.size > OVL_MAX) OVL.delete(OVL.keys().next().value);
    return c === NONE ? null : c;
  }
  function blit(ctx, c, sx, sy, dx, dy, w, h) {
    const s = c.sc;
    ctx.drawImage(c, sx * s, sy * s, w * s, h * s, dx, dy, w, h);
  }
  // content bounding box of a 64x64 overlay canvas (one-time readback) → later blits copy only that rect
  let RB = null, RBX = null;
  function bbox(c) {
    const w = c.width, h = c.height;
    let d;
    try {
      if (!RB) { RB = document.createElement('canvas'); RBX = RB.getContext('2d', { willReadFrequently: true }); }
      if (RB.width !== w || RB.height !== h) { RB.width = w; RB.height = h; } else RBX.clearRect(0, 0, w, h);
      RBX.drawImage(c, 0, 0);
      d = RBX.getImageData(0, 0, w, h).data;
    } catch (e) { return [0, 0, T, T]; }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const k = c.sc || 1;
    const bx = Math.floor(x0 / k), by = Math.floor(y0 / k);
    return [bx, by, min(T, Math.ceil((x1 + 1) / k)) - bx, min(T, Math.ceil((y1 + 1) / k)) - by];
  }
  function drawBox(ctx, c, b, px, py) {
    const k = c.sc;
    ctx.drawImage(c, b[0] * k, b[1] * k, b[2] * k, b[3] * k, px + b[0], py + b[1], b[2], b[3]);
  }
  // draw the cell's window of a texture (+1px overlap right/bottom hides half-pixel seams)
  // scroll offsets are snapped to whole device pixels: unfiltered copies are much cheaper than resampling
  const snap = (v) => Math.round(v * SC) / SC;
  function blitCell(ctx, c, cx, cy, px, py, ox, oy) {
    let sx = mod(cx, c.n) * T, sy = mod(cy, c.n) * T;
    if (ox) sx = mod(sx + snap(ox), c.ts);
    if (oy) sy = mod(sy + snap(oy), c.ts);
    blit(ctx, c, sx, sy, px, py, T + 1, T + 1);
  }
  function layer(ctx, c, cx, cy, px, py, ox, oy, a, op) {
    if (a <= 0.01) return;
    const ga = ctx.globalAlpha, go = ctx.globalCompositeOperation;
    ctx.globalAlpha = ga * min(1, a);
    if (op) ctx.globalCompositeOperation = op;
    const sx = mod(mod(cx, c.n) * T + snap(ox || 0), c.ts), sy = mod(mod(cy, c.n) * T + snap(oy || 0), c.ts);
    blit(ctx, c, sx, sy, px, py, T, T);
    ctx.globalAlpha = ga;
    if (op) ctx.globalCompositeOperation = go;
  }

  // ------------------------------------------------------------------------------------------------
  // painting primitives (used while building textures — never per frame)
  function wrap(s, x, y, r, f) {
    for (let dx = -s; dx <= s; dx += s) {
      const X = x + dx;
      if (X < -r || X > s + r) continue;
      for (let dy = -s; dy <= s; dy += s) {
        const Y = y + dy;
        if (Y < -r || Y > s + r) continue;
        f(X, Y);
      }
    }
  }
  function wrapX(s, x, r, f) {
    for (let dx = -s; dx <= s; dx += s) { const X = x + dx; if (X >= -r && X <= s + r) f(X); }
  }
  const lerp = U.lerp;
  const pick = (r, a) => a[(r() * a.length) | 0];
  function blob(g, x, y, r, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(col, a));
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  function mottle(g, r, s, cols, n, r0, r1, a0, a1, sy = 1) {
    for (let i = 0; i < n; i++) {
      const x = r() * s, y = r() * s, rad = lerp(r0, r1, r()), col = pick(r, cols), a = lerp(a0, a1, r());
      wrap(s, x, y, rad, (X, Y) => {
        if (sy === 1) blob(g, X, Y, rad, col, a);
        else { g.save(); g.translate(X, Y); g.scale(1, sy); blob(g, 0, 0, rad, col, a); g.restore(); }
      });
    }
  }
  function grains(g, r, s, n, cols, a, sz = 1) {
    for (const col of cols) {
      g.fillStyle = rgba(col, a);
      for (let i = 0; i < n / cols.length; i++) g.fillRect(r() * s, r() * s, sz * (0.6 + r() * 0.8), sz * (0.6 + r() * 0.8));
    }
  }
  function blades(g, r, s, n, col, a, l0, l1, lw = 1.3, lean = 0.45) {
    g.strokeStyle = rgba(col, a); g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x = r() * s, y = r() * s, len = lerp(l0, l1, r());
      const ang = -PI / 2 + (r() - 0.5) * lean * 2;
      const tx = cos(ang) * len, ty = sin(ang) * len, bend = (r() - 0.5) * 3;
      wrap(s, x, y, len + 2, (X, Y) => {
        g.moveTo(X, Y); g.quadraticCurveTo(X + tx * 0.4 + bend, Y + ty * 0.55, X + tx, Y + ty);
      });
    }
    g.stroke();
  }
  function pebble(g, x, y, rx, ry, col, rot = 0, sh = 0.3) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = `rgba(20,14,8,${sh})`;
    g.beginPath(); g.ellipse(rx * 0.22, ry * 0.5, rx * 1.02, ry * 0.9, 0, 0, TAU); g.fill();
    const gr = g.createLinearGradient(-rx, -ry, rx * 0.6, ry);
    gr.addColorStop(0, shade(col, 0.28)); gr.addColorStop(1, shade(col, -0.28));
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba(shade(col, -0.5), 0.55); g.lineWidth = 0.8; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.beginPath(); g.ellipse(-rx * 0.32, -ry * 0.38, rx * 0.38, ry * 0.26, -0.3, 0, TAU); g.fill();
    g.restore();
  }
  function crack(g, r, x, y, len, col, a, w = 1) {
    g.strokeStyle = rgba(col, a); g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y);
    let ang = r() * TAU;
    for (let i = 0; i < len; i++) {
      ang += (r() - 0.5) * 1.1;
      x += cos(ang) * 4; y += sin(ang) * 4;
      g.lineTo(x, y);
      if (r() < 0.15) { const bx = x + cos(ang + 1.2) * 5, by = y + sin(ang + 1.2) * 5; g.moveTo(bx, by); g.lineTo(x, y); }
    }
    g.stroke();
  }
  function roundPoly(p, pts) {
    const n = pts.length;
    const m = (i) => { const a = pts[i % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    let s = m(n - 1);
    p.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const q = m(i); p.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
    p.closePath();
  }
  function roundPolyF(p, pts, f) {
    const n = pts.length, L = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let i = 0; i < n; i++) {
      const c = pts[i], a = L(c, pts[(i - 1 + n) % n], f), b = L(c, pts[(i + 1) % n], f);
      if (i) p.lineTo(a[0], a[1]); else p.moveTo(a[0], a[1]);
      p.quadraticCurveTo(c[0], c[1], b[0], b[1]);
    }
    p.closePath();
  }
  // rows of irregular rectangular slabs (九份 street stones, slate plazas)
  function paintSlabRows(o) {
    return (g, r, s) => {
      g.fillStyle = o.grout; g.fillRect(0, 0, s, s);
      if (o.moss) mottle(g, r, s, o.moss, 80, 3, 9, 0.5, 0.9);
      const nr = o.rows, rh = s / nr;
      for (let j = 0; j < nr; j++) {
        const y = j * rh;
        let acc = 0;
        const x0 = r() * s;
        while (acc < s - 1) {
          let w = lerp(o.min, o.max, r());
          if (acc + w > s - o.min * 0.7) w = s - acc;
          const X0 = x0 + acc, J = o.jit, gp = o.gap;
          const pts = [
            [X0 + gp + r() * J, y + gp + r() * J], [X0 + w - gp - r() * J, y + gp + r() * J],
            [X0 + w - gp - r() * J, y + rh - gp - r() * J], [X0 + gp + r() * J, y + rh - gp - r() * J],
          ];
          const col = pick(r, o.cols), sheen = o.sheen && r() < o.sheen;
          wrapX(s, X0 + w / 2, w, (X) => {
            const sh = pts.map((q) => [q[0] + X - (X0 + w / 2), q[1]]);
            slab(g, r, sh, col, { round: o.round, sh: 0.45, rimA: 0.26, rimD: 0.28, tex: (gg, a0, b0, a1, b1) => {
              speckIn(r, o.speckN || 20, o.speck, 0.35)(gg, a0, b0, a1, b1);
              if (o.layers) for (let k = 0; k < 2; k++) { const yy = lerp(b0, b1, r()); gg.strokeStyle = 'rgba(255,255,255,0.09)'; gg.lineWidth = 1; gg.beginPath(); gg.moveTo(a0, yy); gg.lineTo(a1, yy + (r() - 0.5) * 3); gg.stroke(); }
              if (r() < 0.12) crack(gg, r, lerp(a0, a1, r()), lerp(b0, b1, r()), 3, '#222', 0.35, 0.7);
              if (sheen) {
                const gr = gg.createLinearGradient(a0, b0, a1, b1);
                gr.addColorStop(0, 'rgba(220,235,255,0)'); gr.addColorStop(0.45, 'rgba(220,235,255,0.2)'); gr.addColorStop(0.7, 'rgba(220,235,255,0)');
                gg.fillStyle = gr; gg.fillRect(a0, b0, a1 - a0, b1 - b0);
              }
            } });
          });
          acc += w;
        }
      }
      if (o.after) o.after(g, r, s);
    };
  }
  function inset(pts, d) {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0]; cy += p[1]; }
    cx /= pts.length; cy /= pts.length;
    return pts.map((p) => {
      const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1;
      const k = max(0.2, (l - d) / l);
      return [cx + dx * k, cy + dy * k];
    });
  }
  // a lit stone / slab polygon with bevel rims
  function slab(g, r, pts, col, o = {}) {
    const p = new Path2D();
    if (o.sharp) { p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.closePath(); } else if (o.round) roundPolyF(p, pts, o.round); else roundPoly(p, pts);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const q of pts) { x0 = min(x0, q[0]); y0 = min(y0, q[1]); x1 = max(x1, q[0]); y1 = max(y1, q[1]); }
    g.save(); g.translate(0.8, 1.4); g.fillStyle = `rgba(10,10,14,${o.sh == null ? 0.35 : o.sh})`; g.fill(p); g.restore();
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, shade(col, o.hi == null ? 0.12 : o.hi)); gr.addColorStop(1, shade(col, o.lo == null ? -0.14 : o.lo));
    g.fillStyle = gr; g.fill(p);
    g.save(); g.clip(p);
    if (o.tex) o.tex(g, x0, y0, x1, y1);
    g.save(); g.translate(1.4, 1.4); g.strokeStyle = rgba('#ffffff', o.rimA == null ? 0.22 : o.rimA); g.lineWidth = 1.6; g.stroke(p); g.restore();
    g.save(); g.translate(-1.2, -1.2); g.strokeStyle = rgba('#000000', o.rimD == null ? 0.22 : o.rimD); g.lineWidth = 1.6; g.stroke(p); g.restore();
    g.restore();
    g.strokeStyle = rgba(shade(col, -0.55), o.outA == null ? 0.45 : o.outA); g.lineWidth = 0.9; g.stroke(p);
    return p;
  }
  function speckIn(r, n, cols, a) {
    return (g, x0, y0, x1, y1) => {
      for (const col of cols) {
        g.fillStyle = rgba(col, a);
        for (let i = 0; i < n; i++) g.fillRect(lerp(x0, x1, r()), lerp(y0, y1, r()), 1 + r(), 1 + r());
      }
    };
  }
  function star4(g, x, y, s, col, a) {
    blob(g, x, y, s * 2.4, col, a * 0.35);
    g.fillStyle = rgba(col, a);
    g.beginPath();
    g.moveTo(x, y - s * 1.6); g.quadraticCurveTo(x, y, x + s * 1.6, y); g.quadraticCurveTo(x, y, x, y + s * 1.6);
    g.quadraticCurveTo(x, y, x - s * 1.6, y); g.quadraticCurveTo(x, y, x, y - s * 1.6); g.fill();
  }
  function tuft(g, r, x, y, cols, sc = 1) {
    g.fillStyle = 'rgba(15,30,10,0.22)';
    g.beginPath(); g.ellipse(x + 1, y + 1, 4.5 * sc, 1.8 * sc, 0, 0, TAU); g.fill();
    const n = 5 + ((r() * 4) | 0);
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const col = cols[min(cols.length - 1, (i / n * cols.length) | 0)];
      const ang = -PI / 2 + (r() - 0.5) * 1.5, len = (5 + r() * 6) * sc;
      const bx = x + (r() - 0.5) * 5 * sc;
      g.strokeStyle = col; g.lineWidth = 1.4 * sc;
      g.beginPath(); g.moveTo(bx, y);
      g.quadraticCurveTo(bx + cos(ang) * len * 0.3, y + sin(ang) * len * 0.6, bx + cos(ang) * len, y + sin(ang) * len);
      g.stroke();
    }
  }
  function flower5(g, x, y, rad, col, center) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.arc(x + 0.8, y + 1.2, rad * 1.1, 0, TAU); g.fill();
    g.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = k * TAU / 5 - PI / 2;
      g.beginPath(); g.arc(x + cos(a) * rad * 0.6, y + sin(a) * rad * 0.6, rad * 0.5, 0, TAU); g.fill();
    }
    g.fillStyle = center || '#ffd34d';
    g.beginPath(); g.arc(x, y, rad * 0.32, 0, TAU); g.fill();
  }
  // grid of planks/bricks along rows; f(x, y, w, h, row) called (with x-wrap) for each piece
  function rows(g, r, s, rh, minW, maxW, f) {
    const nr = Math.round(s / rh);
    for (let j = 0; j < nr; j++) {
      const y = j * rh;
      let x = r() * s;
      const start = x;
      let acc = 0;
      while (acc < s - 1) {
        let w = lerp(minW, maxW, r());
        if (acc + w > s - minW * 0.6) w = s - acc;
        const xx = start + acc;
        wrapX(s, xx, w, (X) => f(X, y, w, rh, j));
        acc += w;
      }
    }
  }

  // ------------------------------------------------------------------------------------------------
  // terrain definitions
  const D = {};
  const WATERS = new Set(['water', 'deepwater', 'shallow', 'lake', 'river', 'marsh', 'black_sea']);
  const OVER_WATER = new Set(['bridge_h', 'bridge_v', 'lantern_bridge']);  // drawn with water under them
  const STRUCT = new Set(['dock', 'deck']);
  const isWaterish = (id) => WATERS.has(id) || OVER_WATER.has(id);
  const isFace = (id) => { const d = D[id]; return !!(d && d.face); };
  // does terrain B spill a soft fringe into a cell of terrain d? (soft over hard always, soft over soft by rank)
  const spills = (B, d) => !!(B && B.soft && B.kind === 'ground' && d.receive && B !== d && (!d.soft || B.rank > d.rank));

  const NB = new Array(8);
  const DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]; // N NE E SE S SW W NW
  function readNb(nb) {
    for (let i = 0; i < 8; i++) NB[i] = nb(DIRS[i][0], DIRS[i][1]);
    return NB;
  }
  function allSame(n, id) {
    for (let i = 0; i < 8; i++) if (n[i] !== id) return false;
    return true;
  }

  // ---- fringe geometry: union of wavy strips along sides + corner discs ------------------------------
  function sideXY(side, u, v) {
    switch (side) {
      case 0: return [u, v];
      case 2: return [T - v, u];
      case 4: return [T - u, T - v];
      default: return [v, T - u];
    }
  }
  const CORNER = { 1: [T, 0], 3: [T, T], 5: [0, T], 7: [0, 0] };
  function fringeShape(bits, Dp, amp, r, foamOff) {
    const path = new Path2D(), edge = new Path2D(), pts = [], foams = [];
    const N = 16;
    for (const s of [0, 2, 4, 6]) {
      if (!bits[s]) continue;
      const k1 = 1 + ((r() * 3) | 0), k2 = 4 + ((r() * 4) | 0);
      const a1 = amp * (0.45 + 0.55 * r()) * (r() < 0.5 ? -1 : 1), a2 = amp * 0.4 * (r() - 0.5) * 2;
      const dv = (u) => max(2, Dp + a1 * sin(PI * u * k1 / T) + a2 * sin(PI * u * k2 / T));
      let q = sideXY(s, 0, 0); path.moveTo(q[0], q[1]);
      q = sideXY(s, T, 0); path.lineTo(q[0], q[1]);
      for (let i = N; i >= 0; i--) { const u = i * T / N; q = sideXY(s, u, dv(u)); path.lineTo(q[0], q[1]); }
      path.closePath();
      for (let i = 0; i <= N; i++) {
        const u = i * T / N; q = sideXY(s, u, dv(u));
        if (i) edge.lineTo(q[0], q[1]); else edge.moveTo(q[0], q[1]);
        pts.push({ x: q[0], y: q[1], s, u });
      }
      if (foamOff) {
        const fo = foamOff(s), line = [];
        for (let i = 0; i <= N; i++) { const u = i * T / N; line.push(sideXY(s, u, dv(u) + fo)); }
        foams.push({ line, s });
      }
    }
    for (const c of [1, 3, 5, 7]) {
      const a = (c + 7) % 8, b = (c + 1) % 8;
      const [x, y] = CORNER[c];
      if (bits[a] && bits[b]) {           // concave inner corner: round it off
        const rr = Dp * 1.9;
        path.moveTo(x + rr, y); path.arc(x, y, rr, 0, TAU);
      } else if (bits[c] && !bits[a] && !bits[b]) {   // diagonal only: corner disc
        const rr = Dp + 1;
        path.moveTo(x + rr, y); path.arc(x, y, rr, 0, TAU);
        edge.moveTo(x + rr, y); edge.arc(x, y, rr, 0, TAU);
        for (let k = 0; k <= 4; k++) {
          const ang = Math.atan2(T / 2 - y, T / 2 - x) + (k - 2) * 0.38;
          pts.push({ x: x + cos(ang) * rr, y: y + sin(ang) * rr, s: c });
        }
        if (foamOff) {
          const fo = foamOff(c === 1 || c === 7 ? 0 : 4) * 0.6 + 1, line = [];
          const a0 = Math.atan2(T / 2 - y, T / 2 - x);
          for (let k = -6; k <= 6; k++) { const ang = a0 + k * 0.14; line.push([x + cos(ang) * (rr + fo), y + sin(ang) * (rr + fo)]); }
          foams.push({ line, s: c });
        }
      }
    }
    return { path, edge, pts, foams };
  }
  function strokeLine(g, line) {
    g.beginPath();
    g.moveTo(line[0][0], line[0][1]);
    for (let i = 1; i < line.length; i++) g.lineTo(line[i][0], line[i][1]);
    g.stroke();
  }
  // draw neighbour terrain B spilling into this cell
  function drawFringe(g, r, B, bits, cx, cy, foamOff) {
    const sf = B.soft;
    const fs = fringeShape(bits, sf.D, sf.amp, r, foamOff);
    // soft drop shadow + darker rim (light from top-left)
    g.save();
    g.shadowColor = 'rgba(10,14,6,0.45)'; g.shadowBlur = 4 * SC; g.shadowOffsetX = 1 * SC; g.shadowOffsetY = 2 * SC;
    g.fillStyle = sf.edge || '#333'; g.fill(fs.path);
    g.restore();
    g.strokeStyle = rgba(sf.edge || '#333', 0.7); g.lineWidth = 2.5; g.stroke(fs.edge);
    g.save(); g.clip(fs.path);
    const tx = B.tx();
    blit(g, tx, mod(cx, tx.n) * T, mod(cy, tx.n) * T, 0, 0, T, T);
    g.restore();
    if (sf.tuft) {
      for (const p of fs.pts) {
        if (r() < sf.tuftP) sf.tuft(g, r, p.x + (r() - 0.5) * 3, p.y + (p.s === 0 ? 1.5 : p.s === 4 ? 2.5 : 1.5));
      }
    }
    return fs;
  }

  // ---- ambient occlusion from walls, ledge into void ----------------------------------------------------
  function drawAO(g, n) {
    let gr;
    if (isFace(n[0])) {
      gr = g.createLinearGradient(0, 0, 0, 26);
      gr.addColorStop(0, 'rgba(8,6,16,0.62)'); gr.addColorStop(0.3, 'rgba(8,6,16,0.32)'); gr.addColorStop(1, 'rgba(8,6,16,0)');
      g.fillStyle = gr; g.fillRect(0, 0, T, 26);
    } else {
      if (isFace(n[7])) { gr = g.createRadialGradient(0, 0, 0, 0, 0, 16); gr.addColorStop(0, 'rgba(8,6,16,0.4)'); gr.addColorStop(1, 'rgba(8,6,16,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 16); }
      if (isFace(n[1])) { gr = g.createRadialGradient(T, 0, 0, T, 0, 14); gr.addColorStop(0, 'rgba(8,6,16,0.3)'); gr.addColorStop(1, 'rgba(8,6,16,0)'); g.fillStyle = gr; g.fillRect(T - 14, 0, 14, 14); }
    }
    if (isFace(n[6])) {
      gr = g.createLinearGradient(0, 0, 16, 0);
      gr.addColorStop(0, 'rgba(8,6,16,0.5)'); gr.addColorStop(1, 'rgba(8,6,16,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 16, T);
    }
    if (isFace(n[2])) {
      gr = g.createLinearGradient(T, 0, T - 9, 0);
      gr.addColorStop(0, 'rgba(8,6,16,0.25)'); gr.addColorStop(1, 'rgba(8,6,16,0)');
      g.fillStyle = gr; g.fillRect(T - 9, 0, 9, T);
    }
  }
  function drawVoidLedge(g, d, n) {
    if (n[4] !== 'void') return;
    const c = d.ledge || '#3a3530';
    const gr = g.createLinearGradient(0, T - 9, 0, T);
    gr.addColorStop(0, shade(c, 0.1)); gr.addColorStop(1, shade(c, -0.6));
    g.fillStyle = gr; g.fillRect(0, T - 8, T, 8);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, T - 8, T, 1.2);
  }
  function drawCurbs(g, d, n) {
    for (const s of [0, 2, 4, 6]) {
      const id = n[s];
      if (id === d.id || isFace(id) || isWaterish(id) || id === 'void') continue;
      const B = D[id];
      if (spills(B, d)) continue;
      if (B && d.curbGroup && B.curbGroup === d.curbGroup) continue;
      g.save();
      g.translate(T / 2, T / 2); g.rotate((s / 2) * PI / 2); g.translate(-T / 2, -T / 2);
      g.fillStyle = 'rgba(15,12,10,0.35)'; g.fillRect(0, 0, T, 1.6);
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, 1.6, T, 1.2);
      g.restore();
    }
  }

  // ---- generic ground cell -------------------------------------------------------------------------------
  function groundOverlay(d, n, cx, cy) {
    const fr = [];
    if (d.receive) {
      for (let i = 0; i < 8; i++) {
        const B = D[n[i]];
        if (spills(B, d) && fr.indexOf(B) < 0) fr.push(B);
      }
      fr.sort((a, b) => a.rank - b.rank);
    }
    const key = 'G' + d.id + '|' + n.join(',') + (fr.length || d.edgeVar ? '|' + mod(cx, 6) + ',' + mod(cy, 6) : '');
    return ovl(key, (r) => canvas(T, T, (g) => {
      if (d.curb) drawCurbs(g, d, n);
      if (d.edges) d.edges(g, n, r, cx, cy);
      for (const B of fr) {
        const bits = n.map((id) => id === B.id);
        drawFringe(g, r, B, bits, cx, cy);
      }
      drawVoidLedge(g, d, n);
      drawAO(g, n);
    }));
  }
  function decoFor(d, cx, cy) {
    const dc = d.deco;
    if (U.hash(cx, cy, d.seed) >= dc.p) return null;
    const v = (U.hash(cx, cy, d.seed + 11) * dc.n) | 0;
    const c = sprite('D' + d.id + v, T, T, (g, r) => dc.paint(g, r, v));
    if (c.box === undefined) c.box = bbox(c);
    return c.box ? c : null;
  }
  function drawGround(d, ctx, px, py, nb, cx, cy, t) {
    sync();
    const n = readNb(nb);
    if (d.base) d.base(ctx, px, py, cx, cy, t, n);
    else blitCell(ctx, d.tx(), cx, cy, px, py);
    if (d.deco) { const s = decoFor(d, cx, cy); if (s) drawBox(ctx, s, s.box, px, py); }
    if (d.layers) d.layers(ctx, px, py, cx, cy, t, n);
    if (!allSame(n, d.id) || d.always) {
      const o = groundOverlay(d, n, cx, cy);
      if (o) ctx.drawImage(o, px, py, T, T);
    }
    if (d.live) d.live(ctx, px, py, cx, cy, t, n);
  }

  // ---- smooth (bilinear) blends driven by the 4 cell corners -------------------------------------------------
  // weight of a corner = share of the 4 cells around it (self excluded) that pass test → continuous across cells
  function cornerW(n, test) {
    const f = (a, b, c) => ((test(n[a]) ? 1 : 0) + (test(n[b]) ? 1 : 0) + (test(n[c]) ? 1 : 0)) / 4;
    return [f(7, 0, 6), f(0, 1, 2), f(2, 3, 4), f(4, 5, 6)];   // NW NE SE SW
  }
  const BL = document.createElement('canvas');
  BL.width = 2; BL.height = 2;
  const BLX = BL.getContext('2d');
  function bilerp(g, w, col, amax) {
    if (w[0] + w[1] + w[2] + w[3] <= 0) return;
    const [r, gg, b] = U.hex2rgb(col);
    const im = BLX.createImageData(2, 2), v = [w[0], w[1], w[3], w[2]];
    for (let i = 0; i < 4; i++) { im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = Math.round(v[i] * amax * 255); }
    BLX.putImageData(im, 0, 0);
    // full 2x2 source stretched so that pixel centres land exactly on the cell corners → bilinear ramp
    g.save(); g.imageSmoothingEnabled = true;
    g.drawImage(BL, 0, 0, 2, 2, -T / 2, -T / 2, T * 2, T * 2);
    g.restore();
  }

  // ---- water ---------------------------------------------------------------------------------------------
  const LIP_SOFT = ['#5a4631', '#271f17'];
  function waterOverlay(d, n, cx, cy) {
    const key = 'W' + d.id + '|' + n.join(',') + '|' + mod(cx, 6) + ',' + mod(cy, 6);
    return ovl(key, (r) => {
      const st = canvas(T, T), g = st.getContext('2d');
      const foams = [], ghost = d.id === 'black_sea';
      let any = false;
      // blend smoothly into neighbouring water of another kind (bilinear over cell corners)
      const others = [];
      for (let i = 0; i < 8; i++) if (WATERS.has(n[i]) && n[i] !== d.id && others.indexOf(n[i]) < 0) others.push(n[i]);
      others.sort((a, b) => D[a].rank - D[b].rank);
      for (const id of others) {
        const B = D[id];
        if (B.rank === d.rank || !B.tx) bilerp(g, cornerW(n, (x) => x === id), B.col, 1.0);
        else if (B.rank > d.rank) {
          // feathered organic fringe of the shallower water (opaque at the shared edge, fading inward)
          const bits = n.map((x) => x === id), seed = strHash(key + id) || 3;
          for (const [dd, a] of [[26, 0.14], [21, 0.18], [16, 0.24], [12, 0.32], [8, 0.45], [4, 1]]) {
            const fs = fringeShape(bits, dd, 6, U.seeded(seed), null);
            g.save(); g.globalAlpha = a; g.clip(fs.path);
            blit(g, B.tx(), mod(cx, B.tx().n) * T, mod(cy, B.tx().n) * T, 0, 0, T, T);
            g.restore();
          }
        }
        any = true;
      }
      const landSide = (id) => !isWaterish(id);
      const landBits = n.map(landSide);
      if (landBits.some((b) => b)) {
        any = true;
        // shallow tint toward land
        if (!ghost && d.foam !== false) bilerp(g, cornerW(n, landSide), d.shore || '#8fd6c8', 0.75);
        // soft land fringes (grass, sand, dirt…) with bank lip on the north side
        const softs = [];
        for (let i = 0; i < 8; i++) { const B = D[n[i]]; if (B && B.soft && B.kind === 'ground' && softs.indexOf(B) < 0) softs.push(B); }
        softs.sort((a, b) => a.rank - b.rank);
        for (const B of softs) {
          const bits = n.map((id) => id === B.id);
          const LIP = 7;
          const fs = fringeShape(bits, B.soft.D * 0.85, B.soft.amp, r, (s) => (s === 0 ? LIP + 1.5 : 1.5));
          // bank lip band (dark earth face) under the north fringe
          if (bits[0]) {
            const lip = B.lip || LIP_SOFT;
            const nl = fs.foams.find((f) => f.s === 0);
            if (nl) {
              const p = new Path2D();
              const L = nl.line;
              p.moveTo(L[0][0], L[0][1] - LIP - 1.5);
              for (const q of L) p.lineTo(q[0], q[1] - LIP - 2);
              for (let i = L.length - 1; i >= 0; i--) p.lineTo(L[i][0], L[i][1] - 1);
              p.closePath();
              const gr = g.createLinearGradient(0, 0, 0, B.soft.D + LIP + 6);
              gr.addColorStop(0, lip[0]); gr.addColorStop(1, lip[1]);
              g.fillStyle = gr; g.fill(p);
              g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.stroke(p);
            }
          }
          g.save();
          g.shadowColor = 'rgba(5,10,20,0.45)'; g.shadowBlur = 3 * SC; g.shadowOffsetY = 1.5 * SC;
          g.fillStyle = B.soft.edge || '#333'; g.fill(fs.path);
          g.restore();
          g.strokeStyle = rgba(B.soft.edge || '#333', 0.7); g.lineWidth = 2.2; g.stroke(fs.edge);
          g.save(); g.clip(fs.path);
          const tx = B.tx();
          blit(g, tx, mod(cx, tx.n) * T, mod(cy, tx.n) * T, 0, 0, T, T);
          if (B.wetEdge) { g.strokeStyle = rgba(B.wetEdge, 0.55); g.lineWidth = 5; g.stroke(fs.edge); }
          g.restore();
          if (B.soft.tuft) for (const p of fs.pts) if (r() < B.soft.tuftP * 0.8) B.soft.tuft(g, r, p.x, p.y + 1.5);
          for (const f of fs.foams) foams.push(f.line);
        }
        // hard land / walls / docks: straight edges
        for (const s of [0, 2, 4, 6]) {
          const id = n[s];
          if (!landBits[s]) continue;
          const B = D[id];
          if (B && B.soft && B.kind === 'ground') continue;
          g.save(); g.translate(T / 2, T / 2); g.rotate((s / 2) * PI / 2); g.translate(-T / 2, -T / 2);
          let fo = 2;
          if (STRUCT.has(id)) {
            // wooden front beam of a dock/deck + posts, deep shadow
            const gr = g.createLinearGradient(0, 0, 0, 22);
            gr.addColorStop(0, 'rgba(4,12,22,0.6)'); gr.addColorStop(1, 'rgba(4,12,22,0)');
            g.fillStyle = gr; g.fillRect(0, 0, T, 22);
            if (s === 0) {
              g.fillStyle = '#4a3624'; g.fillRect(0, 0, T, 6);
              g.fillStyle = '#6e5238'; g.fillRect(0, 0, T, 1.6);
              g.fillStyle = '#2a1e14'; g.fillRect(0, 5, T, 1.2);
              for (const x of [10, 44]) {
                g.fillStyle = '#3a2a1c'; g.fillRect(x, 6, 7, 10);
                g.fillStyle = '#58412b'; g.fillRect(x, 6, 2, 10);
                g.strokeStyle = 'rgba(220,240,255,0.35)'; g.lineWidth = 1;
                g.beginPath(); g.ellipse(x + 3.5, 16.5, 7, 2, 0, 0, TAU); g.stroke();
              }
            }
            fo = 0;
          } else if (isFace(id) || id === 'void') {
            const gr = g.createLinearGradient(0, 0, 0, 16);
            gr.addColorStop(0, 'rgba(4,8,16,0.55)'); gr.addColorStop(1, 'rgba(4,8,16,0)');
            g.fillStyle = gr; g.fillRect(0, 0, T, 16);
          } else {
            const lip = (B && B.lip) || ['#6d6a64', '#33312e'];
            if (s === 0) {
              const gr = g.createLinearGradient(0, 0, 0, 8);
              gr.addColorStop(0, lip[0]); gr.addColorStop(1, lip[1]);
              g.fillStyle = gr; g.fillRect(0, 0, T, 8);
              g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, T, 1);
              fo = 9.5;
            } else {
              g.fillStyle = rgba(lip[1], 0.6); g.fillRect(0, 0, T, 2);
            }
          }
          g.restore();
          if (fo) {
            const line = [];
            for (let i = 0; i <= 8; i++) line.push(sideXY(s, i * 8, fo + (i % 2 ? 0.6 : -0.4)));
            foams.push(line);
          }
        }
      }
      if (!any) return null;
      let foam = null, foam2 = null;
      if (foams.length && d.foam !== false) {
        const fc = ghost ? 'rgba(170,190,255,0.45)' : 'rgba(240,252,255,0.85)';
        foam = canvas(T, T, (f) => {
          f.lineCap = 'round'; f.lineJoin = 'round';
          f.strokeStyle = ghost ? 'rgba(150,170,255,0.18)' : 'rgba(220,245,255,0.3)'; f.lineWidth = 5;
          for (const L of foams) strokeLine(f, L);
          f.strokeStyle = fc; f.lineWidth = 1.8;
          for (const L of foams) strokeLine(f, L);
          f.fillStyle = fc;
          for (const L of foams) for (let i = 1; i < L.length - 1; i += 2) if (r() < 0.6) { f.beginPath(); f.arc(L[i][0] + (r() - 0.5) * 3, L[i][1] + (r() - 0.5) * 3, 0.8 + r() * 1.2, 0, TAU); f.fill(); }
        });
        foam2 = canvas(T, T, (f) => {
          f.lineCap = 'round';
          f.strokeStyle = ghost ? 'rgba(170,190,255,0.3)' : 'rgba(235,250,255,0.55)'; f.lineWidth = 1.3;
          f.setLineDash([5, 4, 2, 6]);
          for (const L of foams) {
            // offset outward (toward the cell centre) by ~4px
            const off = L.map((q) => { const dx = T / 2 - q[0], dy = T / 2 - q[1], l = Math.hypot(dx, dy) || 1; return [q[0] + dx / l * 4.5, q[1] + dy / l * 4.5]; });
            strokeLine(f, off);
          }
        });
      }
      return { st, foam, foam2, fb: foam ? bbox(foam) : null, fb2: foam2 ? bbox(foam2) : null };
    });
  }
  function drawWater(d, ctx, px, py, nb, cx, cy, t) {
    sync();
    const n = readNb(nb);
    d.waterBase(ctx, px, py, cx, cy, t, n);
    if (!allSame(n, d.id)) {
      const o = waterOverlay(d, n, cx, cy);
      if (o) {
        ctx.drawImage(o.st, px, py, T, T);
        if (o.fb) {
          const ga = ctx.globalAlpha;
          const ph = t * 1.7 + (cx + cy) * 0.35;
          ctx.globalAlpha = ga * (0.55 + 0.45 * sin(ph));
          drawBox(ctx, o.foam, o.fb, px, py);
          const a2 = 0.5 + 0.5 * sin(ph - 1.9);
          if (a2 > 0.04 && o.fb2) { ctx.globalAlpha = ga * a2; drawBox(ctx, o.foam2, o.fb2, px, py); }
          ctx.globalAlpha = ga;
        }
      }
    }
    if (d.live) d.live(ctx, px, py, cx, cy, t, n);
  }

  // ---- walls ---------------------------------------------------------------------------------------------
  function wallRims(g, d, n, top) {
    const id = d.id, rc = d.rim || ['#b9a88a', '#2a2220'], rw = d.rimW || 3;
    const open = (i) => n[i] !== id;
    // N edge (top cell only, or cap if wall above differs)
    if (open(0) && d.rimN !== false) {
      g.fillStyle = rc[1]; g.fillRect(0, 0, T, 1.2);
      g.fillStyle = rc[0]; g.fillRect(0, 1.2, T, rw);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 1.2, T, 1);
    }
    const h = top ? T : CAP;
    if (open(6)) {
      g.fillStyle = rc[1]; g.fillRect(0, 0, 1.2, h);
      g.fillStyle = rc[0]; g.fillRect(1.2, 0, rw, h);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(1.2, 0, 1, h);
    }
    if (open(2)) {
      g.fillStyle = rc[1]; g.fillRect(T - 1.2, 0, 1.2, h);
      g.fillStyle = shade(rc[0], -0.25); g.fillRect(T - 1.2 - rw, 0, rw, h);
    }
    if (top) {
      // inner notches where only the diagonal is open
      if (!open(0) && !open(6) && open(7) && d.rimN !== false) { g.fillStyle = rc[0]; g.fillRect(0, 0, rw + 1.2, rw + 1.2); }
      if (!open(0) && !open(2) && open(1) && d.rimN !== false) { g.fillStyle = shade(rc[0], -0.25); g.fillRect(T - rw - 1.2, 0, rw + 1.2, rw + 1.2); }
    }
  }
  function drawWall(d, ctx, px, py, nb, cx, cy, t) {
    sync();
    const n = readNb(nb);
    const id = d.id;
    if (n[4] === id) {
      // top / ceiling cell
      blitCell(ctx, d.topTex(), cx, cy, px, py);
      if (n[0] !== id || n[2] !== id || n[6] !== id || n[1] !== id || n[7] !== id) {
        const key = 'T' + id + (n[0] === id ? 1 : 0) + (n[2] === id ? 1 : 0) + (n[6] === id ? 1 : 0) + (n[1] === id ? 1 : 0) + (n[7] === id ? 1 : 0);
        const o = ovl(key, () => canvas(T, T, (g) => wallRims(g, d, n, true)));
        if (o) ctx.drawImage(o, px, py, T, T);
      }
    } else {
      const fs = d.faceTex();
      const tp = d.topTex();
      const key = 'F' + id + '|' + mod(cx, fs.n) + ',' + mod(cx, tp.n) + ',' + mod(cy, tp.n) + '|' + (n[0] === id ? 1 : 0) + (n[2] === id ? 1 : 0) + (n[6] === id ? 1 : 0) + '|' + (isFace(n[4]) || n[4] === 'void' ? 1 : 0);
      const o = ovl(key, (r) => canvas(T, T, (g) => {
        blit(g, fs, mod(cx, fs.n) * T, 0, 0, CAP, T, T - CAP);
        blit(g, tp, mod(cx, tp.n) * T, mod(cy, tp.n) * T, 0, 0, T, CAP);
        if (d.faceExtra) d.faceExtra(g, r, n, cx, cy);
        // front edge of the top surface
        const rc = d.rim || ['#b9a88a', '#2a2220'];
        g.fillStyle = rc[0]; g.fillRect(0, CAP - 2.5, T, 2.5);
        g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(0, CAP - 2.5, T, 1);
        g.fillStyle = rc[1]; g.fillRect(0, CAP, T, 1.2);
        let gr = g.createLinearGradient(0, CAP, 0, CAP + 9);
        gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, CAP + 1, T, 9);
        // ground contact
        gr = g.createLinearGradient(0, T - 10, 0, T);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.38)');
        g.fillStyle = gr; g.fillRect(0, T - 10, T, 10);
        // open ends: side shading
        if (n[6] !== id) {
          gr = g.createLinearGradient(0, 0, 10, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(0, CAP, 10, T - CAP);
          g.fillStyle = rgba(rc[1], 0.9); g.fillRect(0, CAP, 1.4, T - CAP);
        }
        if (n[2] !== id) {
          gr = g.createLinearGradient(T, 0, T - 12, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(T - 12, CAP, 12, T - CAP);
          g.fillStyle = rgba(rc[1], 0.9); g.fillRect(T - 1.4, CAP, 1.4, T - CAP);
        }
        wallRims(g, d, n, false);
      }));
      if (o) ctx.drawImage(o, px, py, T, T);
    }
    if (d.live) d.live(ctx, px, py, cx, cy, t, n);
  }

  // ------------------------------------------------------------------------------------------------
  // definition helper
  let seedCounter = 1;
  function def(id, o) {
    const d = Object.assign({ id, kind: 'ground', rank: 0, receive: false, seed: seedCounter++ * 97 }, o);
    if (o.paint) d.tx = () => tex(id, o.size || 256, o.paint);
    D[id] = d;
    let draw;
    if (d.kind === 'wall') draw = (ctx, px, py, nb, cx, cy, t) => drawWall(d, ctx, px, py, nb, cx, cy, t);
    else if (d.kind === 'water') draw = (ctx, px, py, nb, cx, cy, t) => drawWater(d, ctx, px, py, nb, cx, cy, t);
    else draw = (ctx, px, py, nb, cx, cy, t) => drawGround(d, ctx, px, py, nb, cx, cy, t);
    G.Tiles.define(id, { solid: !!d.solid, wall: !!d.wall, water: !!d.water, anim: !!d.anim, draw });
    return d;
  }

  // =================================================================================================
  // NATURAL GROUND
  const GRASS = { base: '#4f8a3c', dark: '#335f2a', mid: '#5f9a44', light: '#86b85a', tip: '#b2d47a', warm: '#7a8d36' };
  const GRASS_D = { base: '#355e35', dark: '#203f26', mid: '#41703c', light: '#5b8c4a', tip: '#80ab5f', warm: '#4c5f30' };
  function paintGrass(pal, extra) {
    return (g, r, s) => {
      g.fillStyle = pal.base; g.fillRect(0, 0, s, s);
      mottle(g, r, s, [pal.dark, pal.light, pal.warm, pal.dark, pal.mid], 80, 16, 56, 0.12, 0.32);
      const A = s * s;
      blades(g, r, s, A / 46, pal.dark, 0.7, 4, 8, 1.4);
      blades(g, r, s, A / 60, pal.mid, 0.75, 4, 8, 1.3);
      blades(g, r, s, A / 95, pal.light, 0.8, 3, 7, 1.2);
      blades(g, r, s, A / 420, pal.tip, 0.85, 3, 5, 1.1);
      grains(g, r, s, A / 220, [pal.dark], 0.3, 1.4);
      if (extra) extra(g, r, s);
    };
  }
  const tuftOf = (pal) => (g, r, x, y) => tuft(g, r, x, y, [pal.dark, pal.mid, pal.light, pal.tip]);
  function grassDeco(pal, flowers) {
    return {
      p: 0.5, n: 12,
      paint(g, r, v) {
        const kind = v % 6;
        const x = 14 + r() * 36, y = 16 + r() * 36;
        if (kind === 0 || kind === 3) { tuft(g, r, x, y, [pal.dark, pal.mid, pal.light, pal.tip], 1.2); tuft(g, r, x + 7 + r() * 4, y + 3, [pal.dark, pal.mid, pal.light], 0.9); }
        else if (kind === 1) {
          for (let i = 0; i < 3 + (r() * 3 | 0); i++) flower5(g, x + (r() - 0.5) * 18, y + (r() - 0.5) * 14, 2 + r() * 1.2, pick(r, flowers), '#f6d24a');
          tuft(g, r, x, y + 6, [pal.dark, pal.mid, pal.light], 0.8);
        } else if (kind === 2) {
          // clover patch
          for (let i = 0; i < 7; i++) {
            const a = x + (r() - 0.5) * 16, b = y + (r() - 0.5) * 12;
            g.fillStyle = rgba(pal.light, 0.9);
            for (let k = 0; k < 3; k++) { const an = k * TAU / 3 - PI / 2; g.beginPath(); g.arc(a + cos(an) * 1.8, b + sin(an) * 1.8, 1.7, 0, TAU); g.fill(); }
          }
        } else if (kind === 4) {
          pebble(g, x, y, 4 + r() * 2.5, 3 + r() * 1.5, '#8d8a80');
          tuft(g, r, x - 5, y + 3, [pal.dark, pal.mid, pal.light], 0.8);
        } else {
          // tiny mushrooms / fallen leaves
          for (let i = 0; i < 2; i++) {
            const a = x + i * 6, b = y + (r() - 0.5) * 4;
            g.fillStyle = '#e8dcc6'; g.fillRect(a - 0.8, b - 3, 1.6, 4);
            g.fillStyle = i ? '#c8553a' : '#b9874f'; g.beginPath(); g.ellipse(a, b - 3, 3, 2, 0, PI, TAU); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(a - 1, b - 4.2, 0.9, 0.9);
          }
          tuft(g, r, x + 4, y + 2, [pal.dark, pal.mid, pal.light], 0.8);
        }
      },
    };
  }
  def('grass', {
    size: 384, rank: 70, receive: true, paint: paintGrass(GRASS), lip: LIP_SOFT, ledge: '#5c4630',
    soft: { D: 9, amp: 5, edge: '#2f4a22', tuft: tuftOf(GRASS), tuftP: 0.5 },
    deco: grassDeco(GRASS, ['#ffffff', '#f7e3f0', '#ffe27a', '#c9b6ff']),
  });
  def('grass_dark', {
    size: 384, rank: 80, receive: true, ledge: '#4a3a28',
    paint: paintGrass(GRASS_D, (g, r, s) => {
      // fern fronds
      for (let i = 0; i < 14; i++) {
        const x = r() * s, y = r() * s, ang = r() * TAU;
        wrap(s, x, y, 16, (X, Y) => {
          g.strokeStyle = rgba('#5d8f4c', 0.55); g.lineWidth = 1.1;
          g.beginPath(); g.moveTo(X, Y); g.lineTo(X + cos(ang) * 14, Y + sin(ang) * 14); g.stroke();
          for (let k = 1; k < 7; k++) {
            const bx = X + cos(ang) * k * 2, by = Y + sin(ang) * k * 2, l = 6 - k * 0.7;
            g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + cos(ang + 1.1) * l, by + sin(ang + 1.1) * l);
            g.moveTo(bx, by); g.lineTo(bx + cos(ang - 1.1) * l, by + sin(ang - 1.1) * l); g.stroke();
          }
        });
      }
    }),
    soft: { D: 9, amp: 5, edge: '#1c3018', tuft: tuftOf(GRASS_D), tuftP: 0.5 },
    deco: grassDeco(GRASS_D, ['#e9e4ff', '#b8d8ff', '#fff3c4']),
  });
  const FLOW = { base: '#5a9442', dark: '#3a6a2c', mid: '#68a24a', light: '#8fc25e', tip: '#bcdc84', warm: '#86993c' };
  def('flowers_ground', {
    size: 384, rank: 75, receive: true, ledge: '#5c4630',
    paint: paintGrass(FLOW, (g, r, s) => {
      const cols = ['#ffffff', '#ffd5e8', '#ff9cc2', '#ffe066', '#c6a8ff', '#ffb36b', '#9fd3ff'];
      for (let i = 0; i < 260; i++) {
        const x = r() * s, y = r() * s, col = pick(r, cols), rad = 1.8 + r() * 1.6;
        wrap(s, x, y, 6, (X, Y) => flower5(g, X, Y, rad, col, col === '#ffe066' ? '#e08a2a' : '#f6d24a'));
      }
    }),
    soft: { D: 9, amp: 5, edge: '#2f4a22', tuft: tuftOf(FLOW), tuftP: 0.5 },
    deco: grassDeco(FLOW, ['#ffffff', '#ff9cc2', '#ffe066']),
  });

  const pebbleField = (cols, n, r0, r1) => (g, r, s) => {
    for (let i = 0; i < n; i++) {
      const x = r() * s, y = r() * s, rx = lerp(r0, r1, r()), ry = rx * (0.6 + r() * 0.3), col = pick(r, cols), rot = (r() - 0.5) * 0.8;
      wrap(s, x, y, rx + 2, (X, Y) => pebble(g, X, Y, rx, ry, col, rot, 0.25));
    }
  };
  const DIRT = { base: '#7b5b3e', dark: '#553e2a', light: '#9c7a57', warm: '#8c6239' };
  def('dirt', {
    size: 384, rank: 30, receive: true, lip: ['#5a4430', '#2a2018'], ledge: '#5a4430',
    paint: (g, r, s) => {
      g.fillStyle = DIRT.base; g.fillRect(0, 0, s, s);
      mottle(g, r, s, [DIRT.dark, DIRT.light, DIRT.warm, '#6a5a40'], 90, 10, 46, 0.18, 0.4);
      grains(g, r, s, 2600, ['#4a3423', '#b0906c', '#6b4d33'], 0.55, 1.4);
      for (let i = 0; i < 18; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 40, (X, Y) => crack(g, r, X, Y, 6 + (r() * 6 | 0), '#3e2b1c', 0.35, 1)); }
      pebbleField(['#8f8478', '#a39a8c', '#7a6e62', '#9b8466'], 70, 1.6, 3.6)(g, r, s);
    },
    soft: { D: 8, amp: 5, edge: '#4a3624', tuft: (g, r, x, y) => { if (r() < 0.5) pebble(g, x, y, 1.8 + r() * 1.5, 1.4 + r(), '#958a7c'); }, tuftP: 0.3 },
    deco: {
      p: 0.35, n: 8,
      paint(g, r, v) {
        const x = 16 + r() * 32, y = 16 + r() * 32;
        if (v % 3 === 0) { pebble(g, x, y, 5 + r() * 3, 3.5 + r() * 2, '#8d8578'); pebble(g, x + 8, y + 4, 3, 2.2, '#a19a8e'); }
        else if (v % 3 === 1) {
          g.strokeStyle = '#4b3420'; g.lineWidth = 1.6; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x - 9, y + 2); g.quadraticCurveTo(x, y - 2, x + 10, y + 1); g.moveTo(x + 2, y - 0.5); g.lineTo(x + 6, y - 5); g.stroke();
          g.strokeStyle = 'rgba(255,230,190,0.3)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - 9, y + 1.4); g.quadraticCurveTo(x, y - 2.6, x + 10, y + 0.4); g.stroke();
        } else {
          for (let i = 0; i < 3; i++) {
            const a = x + (r() - 0.5) * 20, b = y + (r() - 0.5) * 16, rot = r() * TAU;
            g.save(); g.translate(a, b); g.rotate(rot);
            g.fillStyle = pick(r, ['#b5762f', '#9a5a26', '#c8913f']); g.beginPath(); g.ellipse(0, 0, 4, 2, 0, 0, TAU); g.fill();
            g.strokeStyle = 'rgba(60,30,10,0.5)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-4, 0); g.lineTo(4, 0); g.stroke();
            g.restore();
          }
        }
      },
    },
  });
  const PATH = { base: '#a7895f', dark: '#86694a', light: '#c3a77c', warm: '#b08a55' };
  def('path', {
    size: 384, rank: 40, receive: true, lip: ['#6e5638', '#2e2418'], ledge: '#6e5638',
    paint: (g, r, s) => {
      g.fillStyle = PATH.base; g.fillRect(0, 0, s, s);
      mottle(g, r, s, [PATH.dark, PATH.light, PATH.warm, PATH.light], 90, 12, 50, 0.16, 0.36);
      grains(g, r, s, 3000, ['#7a5f42', '#d2bb94', '#937452'], 0.5, 1.3);
      pebbleField(['#a0968a', '#b9ad9a', '#8b8073', '#c6b79c'], 55, 1.4, 3.2)(g, r, s);
      for (let i = 0; i < 8; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 30, (X, Y) => crack(g, r, X, Y, 5, '#6d5236', 0.25)); }
    },
    soft: { D: 7, amp: 4, edge: '#7a5e40', tuft: (g, r, x, y) => { if (r() < 0.4) pebble(g, x, y, 1.6 + r(), 1.2 + r() * 0.8, '#ab9f8f'); }, tuftP: 0.3 },
    deco: {
      p: 0.3, n: 8,
      paint(g, r, v) {
        const x = 16 + r() * 32, y = 16 + r() * 32;
        if (v % 2) { for (let i = 0; i < 4; i++) pebble(g, x + (r() - 0.5) * 22, y + (r() - 0.5) * 16, 2 + r() * 2, 1.5 + r() * 1.4, pick(r, ['#9c9284', '#b5a996', '#8a7e70'])); }
        else {
          // flat embedded stone
          const pts = []; for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + r() * 0.4; pts.push([x + cos(a) * (7 + r() * 3), y + sin(a) * (5 + r() * 2)]); }
          slab(g, r, pts, '#a59c8e', { sh: 0.2 });
        }
      },
    },
  });
  const SAND = { base: '#dcc390', dark: '#c3a670', light: '#efdcb0' };
  def('sand', {
    size: 384, rank: 20, receive: true, lip: ['#b39a6b', '#7a6646'], wetEdge: '#a88f62', ledge: '#b39a6b',
    paint: (g, r, s) => {
      g.fillStyle = SAND.base; g.fillRect(0, 0, s, s);
      mottle(g, r, s, [SAND.dark, SAND.light, '#e6c98a', '#cdb486'], 80, 14, 60, 0.2, 0.42);
      // wind ripples (seamless: integer frequency in x)
      for (let i = 0; i < 26; i++) {
        const y0 = r() * s, k = 1 + (r() * 3 | 0), A = 3 + r() * 5, ph = r() * TAU, k2 = 4 + (r() * 3 | 0);
        const x0 = r() * s, len = 40 + r() * 90;
        for (const [col, dy, a] of [['#f6e7c2', 0, 0.55], ['#b49762', 1.6, 0.35]]) {
          g.strokeStyle = rgba(col, a); g.lineWidth = 1.2;
          wrap(s, x0 + len / 2, y0, len, (X, Y) => {
            g.beginPath();
            for (let x = 0; x <= len; x += 3) {
              const wx = X - len / 2 + x;
              const yy = Y + dy + A * sin((wx / s) * TAU * k + ph) + 1.2 * sin((wx / s) * TAU * k2);
              if (x) g.lineTo(wx, yy); else g.moveTo(wx, yy);
            }
            g.stroke();
          });
        }
      }
      grains(g, r, s, 3200, ['#b59a68', '#fff3d6', '#a88c5c', '#e9d2a0'], 0.55, 1.1);
      for (let i = 0; i < 14; i++) {
        const x = r() * s, y = r() * s;
        wrap(s, x, y, 4, (X, Y) => { g.fillStyle = pick(r, ['#f3e8e0', '#e7c4b8', '#d6cfc0']); g.beginPath(); g.ellipse(X, Y, 1.6, 1.1, r(), 0, TAU); g.fill(); });
      }
    },
    soft: { D: 8, amp: 4, edge: '#b19866', tuft: null, tuftP: 0 },
    deco: {
      p: 0.28, n: 9,
      paint(g, r, v) {
        const x = 16 + r() * 32, y = 16 + r() * 32;
        const k = v % 3;
        if (k === 0) {
          // scallop shell
          g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 1.2);
          g.fillStyle = 'rgba(80,60,30,0.25)'; g.beginPath(); g.ellipse(1, 2, 5, 3, 0, 0, TAU); g.fill();
          const gr = g.createLinearGradient(0, -5, 0, 4); gr.addColorStop(0, '#fff4ea'); gr.addColorStop(1, '#e0a98f');
          g.fillStyle = gr; g.beginPath(); g.moveTo(0, 3); g.arc(0, 3, 6, PI * 1.15, PI * 1.85); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(170,100,80,0.6)'; g.lineWidth = 0.6;
          for (let a = -2; a <= 2; a++) { g.beginPath(); g.moveTo(0, 3); g.lineTo(a * 2.2, -2.4); g.stroke(); }
          g.restore();
        } else if (k === 1) {
          // starfish
          g.save(); g.translate(x, y); g.rotate(r() * TAU);
          g.fillStyle = 'rgba(80,50,20,0.25)';
          const star = (ox, oy, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * PI / 5, rr = i % 2 ? 2 : 6; g.lineTo(ox + cos(a) * rr, oy + sin(a) * rr); } g.closePath(); g.fill(); };
          star(1, 1.5, 'rgba(80,50,20,0.25)'); star(0, 0, '#e07a4a');
          g.fillStyle = 'rgba(255,220,180,0.7)'; for (let i = 0; i < 5; i++) { const a = i * 2 * PI / 5; g.fillRect(cos(a) * 3, sin(a) * 3, 1, 1); }
          g.restore();
        } else {
          // seaweed / driftwood
          g.strokeStyle = '#4f5e2c'; g.lineWidth = 1.6; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x - 10, y); g.bezierCurveTo(x - 4, y - 6, x + 2, y + 5, x + 10, y - 2); g.stroke();
          g.strokeStyle = '#6f7d3a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 6, y + 2); g.bezierCurveTo(x - 1, y - 2, x + 3, y + 6, x + 8, y + 3); g.stroke();
        }
      },
    },
    edges(g, n) {
      // wet sand darkening toward water (smooth across cells)
      bilerp(g, cornerW(n, (id) => WATERS.has(id) && id !== 'black_sea'), '#7a6038', 0.75);
    },
  });

  // ---- stone & paved ----------------------------------------------------------------------------------
  def('stone', {
    size: 256, rank: 35, receive: true, curb: true, lip: ['#6f7275', '#2f3134'], ledge: '#5f6266', curbGroup: 'stone',
    paint: paintSlabRows({ rows: 8, min: 30, max: 62, jit: 2.2, gap: 1.5, round: 0.22, grout: '#383d3a', moss: ['#4d6e36', '#5f7d3c', '#2f3a2c'], cols: ['#878c90', '#7b8187', '#918f88', '#767c7f', '#9a978f', '#83888a', '#8c8a84'], speck: ['#5d6064', '#b9bcbf'], sheen: 0.3 }),
    deco: {
      p: 0.18, n: 6,
      paint(g, r, v) {
        const x = 18 + r() * 28, y = 18 + r() * 28;
        if (v % 3 === 0) {
          // rain puddle reflecting lantern light
          g.save(); g.translate(x, y);
          const gr = g.createRadialGradient(-2, -1, 1, 0, 0, 11);
          gr.addColorStop(0, 'rgba(150,170,195,0.55)'); gr.addColorStop(0.7, 'rgba(70,85,105,0.5)'); gr.addColorStop(1, 'rgba(60,70,90,0)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 12, 6, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,170,120,0.35)'; g.beginPath(); g.ellipse(3, -1, 3, 1.2, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(230,240,255,0.35)'; g.lineWidth = 0.8; g.beginPath(); g.ellipse(-1, 0, 8, 3.5, 0, PI * 1.1, PI * 1.6); g.stroke();
          g.restore();
        } else if (v % 3 === 1) {
          tuft(g, r, x, y, ['#2f4a22', '#4b7a34', '#6a9a46'], 0.7);
        } else {
          g.save(); g.translate(x, y); g.rotate(r() * TAU);
          g.fillStyle = '#c7752f'; g.beginPath(); g.ellipse(0, 0, 4.5, 2.4, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(90,40,10,0.6)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-4.5, 0); g.lineTo(4.5, 0); g.stroke();
          g.restore();
        }
      },
    },
  });
  // stairs: 3 steps per cell running north–south (up = north), stone side curbs
  def('stairs', {
    size: 256, rank: 35, curb: false, lip: ['#73767a', '#2f3134'], ledge: '#5f6266',
    paint: (g, r, s) => {
      g.fillStyle = '#2e3234'; g.fillRect(0, 0, s, s);
      const cols = ['#8c9094', '#83878b', '#95938c', '#7c8185', '#9a988f', '#878a85'];
      const SH = s / 12, TR = SH - 7.5;
      for (let j = 0; j < 12; j++) {
        const y = j * SH;
        let acc = 0;
        const x0 = r() * s;
        while (acc < s - 1) {
          let w = 34 + r() * 40;
          if (acc + w > s - 24) w = s - acc;
          const col = pick(r, cols);
          wrapX(s, x0 + acc + w / 2, w, (Xc) => {
            const X = Xc - w / 2;
            // tread: back slightly darker, front nose catches light
            const gr = g.createLinearGradient(0, y, 0, y + TR);
            gr.addColorStop(0, shade(col, -0.12)); gr.addColorStop(1, shade(col, 0.1));
            g.fillStyle = gr; g.fillRect(X + 0.7, y + 0.5, w - 1.4, TR);
            speckIn(r, 16, ['#5d6064', '#c4c6c8'], 0.35)(g, X + 1, y + 1, X + w - 1, y + TR - 1);
            g.fillStyle = 'rgba(255,255,255,0.38)'; g.fillRect(X + 0.7, y + TR - 1.6, w - 1.4, 1.6);
            // riser (front face of the step above the next tread)
            const g2 = g.createLinearGradient(0, y + TR, 0, y + SH);
            g2.addColorStop(0, shade(col, -0.42)); g2.addColorStop(1, shade(col, -0.62));
            g.fillStyle = g2; g.fillRect(X + 0.7, y + TR, w - 1.4, SH - TR);
            g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(X + w - 1, y + 0.5, 0.9, SH);
            if (r() < 0.3) crack(g, r, X + w * r(), y + 3, 2, '#2a2c2e', 0.4, 0.7);
          });
          acc += w;
        }
        for (let k = 0; k < 3; k++) { const mx = r() * s; wrap(s, mx, y + SH - 1, 6, (X, Y) => blob(g, X, Y, 2.5 + r() * 3, '#5a7e3a', 0.6)); }
      }
      mottle(g, r, s, ['#ffffff'], 10, 20, 40, 0.04, 0.08);
    },
    edges(g, n, r) {
      const id = 'stairs';
      const curb = (left) => {
        g.save();
        if (!left) { g.translate(T, 0); g.scale(-1, 1); }
        // shadow cast on the steps
        const gs = g.createLinearGradient(10, 0, 18, 0);
        gs.addColorStop(0, left ? 'rgba(0,0,0,0.42)' : 'rgba(0,0,0,0.25)'); gs.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gs; g.fillRect(10, 0, 8, T);
        // inner face of the curb
        g.fillStyle = left ? '#6b6e70' : '#5e6163'; g.fillRect(8, 0, 3, T);
        // top of the curb, one block per step
        for (let k = 0; k < 3; k++) {
          const y = k * T / 3, col = pick(r, ['#a4a59e', '#9a9c98', '#adaba2']);
          const gr = g.createLinearGradient(0, 0, 9, 0);
          gr.addColorStop(0, shade(col, left ? 0.12 : -0.05)); gr.addColorStop(1, shade(col, -0.12));
          g.fillStyle = gr; g.fillRect(0, y, 8.5, T / 3);
          g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(0, y, 8.5, 1);
          g.fillStyle = 'rgba(30,30,30,0.5)'; g.fillRect(0, y + T / 3 - 1, 8.5, 1);
        }
        g.fillStyle = 'rgba(20,20,20,0.6)'; g.fillRect(0, 0, 1, T);
        g.restore();
      };
      if (n[6] !== id) curb(true);
      if (n[2] !== id) curb(false);
      if (n[4] !== id) {
        const gr = g.createLinearGradient(0, T - 6, 0, T);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
        g.fillStyle = gr; g.fillRect(0, T - 6, T, 6);
      }
    },
  });
  def('brick', {
    size: 256, rank: 34, receive: true, curb: true, lip: ['#8a4a36', '#3a2018'], ledge: '#7a3e2c',
    paint: (g, r, s) => {
      g.fillStyle = '#c9b49a'; g.fillRect(0, 0, s, s);
      grains(g, r, s, 800, ['#a8977e', '#e0d2bc'], 0.6, 1.2);
      const cols = ['#b4553c', '#a84a34', '#bf6246', '#9c4430', '#b85a3e', '#a95238', '#c46a4c'];
      const brick = (x, y, w, h) => {
        const col = r() < 0.06 ? '#7e3628' : pick(r, cols);
        slab(g, r, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col, { sharp: true, sh: 0.3, tex: speckIn(r, 8, ['#6b2e20', '#e09a7e'], 0.4), rimA: 0.2 });
      };
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const x = i * 32, y = j * 32;
        if ((i + j) % 2 === 0) { brick(x + 1.2, y + 1.2, 29.6, 13.6); brick(x + 1.2, y + 17.2, 29.6, 13.6); }
        else { brick(x + 1.2, y + 1.2, 13.6, 29.6); brick(x + 17.2, y + 1.2, 13.6, 29.6); }
      }
      mottle(g, r, s, ['#3b2a20', '#e6c7a0'], 20, 20, 50, 0.05, 0.12);
    },
    deco: {
      p: 0.12, n: 4,
      paint(g, r) { tuft(g, r, 20 + r() * 24, 20 + r() * 24, ['#3b5a2a', '#58823c', '#79a352'], 0.6); },
    },
  });
  def('slate', {
    size: 256, rank: 34, receive: true, curb: true, lip: ['#5f6468', '#2a2d30'], ledge: '#55595c',
    paint: paintSlabRows({ rows: 8, min: 18, max: 72, jit: 5, gap: 1.4, round: 0.14, grout: '#2c3032', layers: true, speckN: 14, cols: ['#6f757a', '#646b70', '#7b7d7c', '#6c6862', '#5f676c', '#787b80', '#6a645c'], speck: ['#3c4044', '#9aa0a4'] }),
  });
  function veins(g, r, s, n, o) {
    for (let i = 0; i < n; i++) {
      let x = r() * s, y = r() * s, a = o.dir + (r() - 0.5) * 0.7;
      const pts = [[x, y]];
      for (let k = 0; k < o.len; k++) { a += (r() - 0.5) * 0.35; x += cos(a) * 6; y += sin(a) * 6; pts.push([x, y]); }
      const branches = [];
      for (let k = 0; k < 3; k++) {
        const st = pts[(r() * pts.length) | 0];
        let bx = st[0], by = st[1], ba = a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6);
        const bp = [[bx, by]];
        for (let q = 0; q < 6 + r() * 8; q++) { ba += (r() - 0.5) * 0.6; bx += cos(ba) * 4; by += sin(ba) * 4; bp.push([bx, by]); }
        branches.push(bp);
      }
      const col = pick(r, o.cols), w0 = o.w0 * (0.6 + r() * 0.8);
      const mid = pts[pts.length >> 1];
      wrap(s, mid[0], mid[1], s, (X, Y) => {
        const ox = X - mid[0], oy = Y - mid[1];
        const path = (P) => { g.beginPath(); P.forEach((q, k) => (k ? g.lineTo(q[0] + ox, q[1] + oy) : g.moveTo(q[0] + ox, q[1] + oy))); g.stroke(); };
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.strokeStyle = rgba(col, 0.06); g.lineWidth = w0 * 9; path(pts);
        g.strokeStyle = rgba(col, 0.13); g.lineWidth = w0 * 3.5; path(pts);
        g.strokeStyle = rgba(col, 0.5); g.lineWidth = w0; path(pts);
        g.strokeStyle = rgba(col, 0.3); g.lineWidth = w0 * 0.5; for (const bp of branches) path(bp);
      });
    }
  }
  def('marble', {
    size: 384, rank: 34, receive: true, curb: true, lip: ['#cfcac0', '#7c786f'], ledge: '#bdb8ae',
    paint: (g, r, s) => {
      g.fillStyle = '#ebe8e1'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#d6d2c9', '#f8f6f2', '#cbd3d5', '#e0dbcf', '#dfe6e6'], 70, 30, 95, 0.25, 0.5);
      // foliation: broad soft grey bands running diagonally (seamless: line family y = x*k + c)
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const c = r() * s, w = 6 + r() * 26, col = pick(r, ['#b9b8b2', '#a9b0b3', '#c8c2b6', '#9ea5a8']), a = 0.12 + r() * 0.16, amp = 4 + r() * 10, ph = r() * TAU;
        for (const dy of [-s, 0, s]) {
          g.strokeStyle = rgba(col, a); g.lineWidth = w;
          g.beginPath();
          for (let x = -10; x <= s + 10; x += 8) { const y = c + dy - x * 0.5 + amp * sin((x / s) * TAU * 2 + ph); if (x > -10) g.lineTo(x, y); else g.moveTo(x, y); }
          g.stroke();
          g.strokeStyle = rgba(shade(col, -0.25), a * 1.4); g.lineWidth = 0.8;
          g.beginPath();
          for (let x = -10; x <= s + 10; x += 8) { const y = c + dy - x * 0.5 + amp * sin((x / s) * TAU * 2 + ph) + w * 0.3; if (x > -10) g.lineTo(x, y); else g.moveTo(x, y); }
          g.stroke();
        }
      }
      g.restore();
      veins(g, r, s, 7, { dir: -0.55, len: 55, cols: ['#7d8287', '#8e8e8a', '#6f7d84'], w0: 1.3 });
      veins(g, r, s, 10, { dir: -0.4, len: 22, cols: ['#a6a49d', '#9aa4a8'], w0: 0.8 });
      // large irregular slab joints (bevelled)
      const n = 3, cw = s / n, J = [];
      for (let i = 0; i < n * n; i++) J.push([(r() - 0.5) * 30, (r() - 0.5) * 30]);
      const P = (i, j) => { const q = J[mod(j, n) * n + mod(i, n)]; return [i * cw + q[0], j * cw + q[1]]; };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        for (const [p0, p1] of [[P(i, j), P(i + 1, j)], [P(i, j), P(i, j + 1)]]) {
          wrap(s, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, cw, (X, Y) => {
            const ox = X - (p0[0] + p1[0]) / 2, oy = Y - (p0[1] + p1[1]) / 2;
            g.strokeStyle = 'rgba(100,95,85,0.28)'; g.lineWidth = 1;
            g.beginPath(); g.moveTo(p0[0] + ox, p0[1] + oy); g.lineTo(p1[0] + ox, p1[1] + oy); g.stroke();
            g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.9;
            g.beginPath(); g.moveTo(p0[0] + ox + 1, p0[1] + oy + 1); g.lineTo(p1[0] + ox + 1, p1[1] + oy + 1); g.stroke();
          });
        }
      }
      // polish
      for (let i = 0; i < 6; i++) {
        const x = r() * s, y = r() * s;
        wrap(s, x, y, 60, (X, Y) => { g.save(); g.translate(X, Y); g.rotate(-0.7); blob(g, 0, 0, 40, '#ffffff', 0.12); g.restore(); });
      }
    },
  });
  // hex column tops
  function paintHex(o) {
    return (g, r, s) => {
      g.fillStyle = o.grout; g.fillRect(0, 0, s, s);
      const cols = s / 32, rowsN = Math.round(s / 25.6), cw = 32, rh = s / rowsN;
      const hr = rh * 0.68;
      for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
        const x = i * cw + (j % 2) * cw / 2, y = j * rh;
        const col = pick(r, o.cols), raise = r();
        const pts = [];
        for (let k = 0; k < 6; k++) { const a = PI / 6 + k * PI / 3; pts.push([cos(a) * (cw / 2 - o.gap) / cos(PI / 6), sin(a) * hr]); }
        wrap(s, x, y, 26, (X, Y) => {
          const sh = pts.map((q) => [q[0] * 0.98 + X + (r() - 0.5) * 1.2, q[1] * 0.98 + Y + (r() - 0.5) * 1.2]);
          slab(g, r, sh, shade(col, (raise - 0.5) * 0.18), { sharp: true, sh: 0.55, rimA: 0.28, rimD: 0.35, tex: (gg, x0, y0, x1, y1) => {
            speckIn(r, 14, o.speck, 0.35)(gg, x0, y0, x1, y1);
            if (r() < 0.3) crack(gg, r, lerp(x0, x1, r()), lerp(y0, y1, r()), 3, '#111', 0.4, 0.8);
            if (o.lichen && r() < 0.25) blob(gg, lerp(x0, x1, r()), lerp(y0, y1, r()), 4, pick(r, o.lichen), 0.6);
          } });
        });
      }
    };
  }
  def('basalt_floor', {
    size: 256, rank: 34, receive: true, curb: true, lip: ['#3b3e42', '#141618'], ledge: '#2e3134',
    paint: paintHex({ grout: '#16181b', gap: 1.2, cols: ['#45494e', '#3e4247', '#4b4f52', '#393d41', '#50534f'], speck: ['#202326', '#7c8288'], lichen: ['#b8b46a', '#8ea06a', '#d2c590'] }),
  });
  def('snow_rock', {
    size: 384, rank: 36, receive: true, curb: false, lip: ['#8d939b', '#3c4148'], ledge: '#7b8189',
    paint: (g, r, s) => {
      g.fillStyle = '#7f858c'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#6a7078', '#959ba2', '#73787d', '#8b8f8f', '#5d636b'], 90, 14, 50, 0.25, 0.5);
      // rock plates
      for (let i = 0; i < 46; i++) {
        const x = r() * s, y = r() * s, rad = 10 + r() * 16, np = 6 + (r() * 3 | 0), pts = [];
        for (let k = 0; k < np; k++) { const a = k * TAU / np + r() * 0.5; pts.push([cos(a) * rad * (0.7 + r() * 0.4), sin(a) * rad * (0.55 + r() * 0.3)]); }
        const col = pick(r, ['#8a9098', '#7b8189', '#949aa0', '#6f757d']);
        wrap(s, x, y, rad + 3, (X, Y) => slab(g, r, pts.map((q) => [q[0] + X, q[1] + Y]), col, { sh: 0.4, tex: speckIn(r, 16, ['#4e545b', '#c2c7cc'], 0.35) }));
      }
      for (let i = 0; i < 18; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 30, (X, Y) => crack(g, r, X, Y, 6, '#3a3f46', 0.5)); }
      // snow drifts: soft rounded mounds, blue shadow lower-right, bright lit top-left
      for (let i = 0; i < 26; i++) {
        const x = r() * s, y = r() * s, rad = 8 + r() * 16, parts = [];
        for (let k = 0; k < 5; k++) parts.push([(r() - 0.5) * rad * 1.6, (r() - 0.5) * rad * 0.6, rad * (0.45 + r() * 0.4)]);
        wrap(s, x, y, rad * 2, (X, Y) => {
          for (const [dx, dy, rr] of parts) { g.fillStyle = 'rgba(90,110,150,0.22)'; g.beginPath(); g.ellipse(X + dx + 2, Y + dy + 2.5, rr * 1.15, rr * 0.62, 0, 0, TAU); g.fill(); }
          for (const [dx, dy, rr] of parts) {
            const gr = g.createRadialGradient(X + dx - rr * 0.4, Y + dy - rr * 0.35, 0, X + dx, Y + dy, rr * 1.15);
            gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#eef3fa'); gr.addColorStop(1, 'rgba(205,218,236,0.9)');
            g.fillStyle = gr; g.beginPath(); g.ellipse(X + dx, Y + dy, rr * 1.15, rr * 0.6, 0, 0, TAU); g.fill();
          }
        });
      }
      // thin frost dusting
      mottle(g, r, s, ['#eef4ff'], 40, 6, 18, 0.15, 0.35);
      grains(g, r, s, 500, ['#ffffff', '#dfe8ff'], 0.8, 1.1);   // frost glints
    },
    deco: {
      p: 0.25, n: 6,
      paint(g, r) {
        const x = 18 + r() * 28, y = 18 + r() * 28;
        pebble(g, x, y, 6 + r() * 3, 4 + r() * 2, '#868c94');
        g.fillStyle = '#f4f8ff'; g.beginPath(); g.ellipse(x - 1, y - 3, 5, 2, 0, 0, TAU); g.fill();
        tuft(g, r, x + 7, y + 3, ['#5a6a4a', '#8a9a6a', '#b8c49a'], 0.6);
      },
    },
  });
  def('coral', {
    size: 384, rank: 25, receive: true, lip: ['#3d3633', '#161210'], ledge: '#3a3330',
    soft: { D: 7, amp: 5, edge: '#1e1a18', tuft: (g, r, x, y) => { if (r() < 0.6) pebble(g, x, y, 2 + r() * 2, 1.6 + r(), '#4a423e', 0, 0.35); }, tuftP: 0.5 },
    paint: (g, r, s) => {
      g.fillStyle = '#3d3734'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#2a2523', '#544a45', '#4a3f3a', '#5c5450'], 90, 10, 40, 0.3, 0.6);
      // porous volcanic boulders
      for (let i = 0; i < 40; i++) {
        const x = r() * s, y = r() * s, rad = 8 + r() * 14, np = 7, pts = [];
        for (let k = 0; k < np; k++) { const a = k * TAU / np + r() * 0.4; pts.push([cos(a) * rad * (0.7 + r() * 0.4), sin(a) * rad * (0.6 + r() * 0.3)]); }
        const col = pick(r, ['#4a423e', '#3f3835', '#544a44', '#5a4f48']);
        wrap(s, x, y, rad + 3, (X, Y) => slab(g, r, pts.map((q) => [q[0] + X, q[1] + Y]), col, { sh: 0.5, rimA: 0.15, tex: (gg, x0, y0, x1, y1) => {
          for (let k = 0; k < 14; k++) {
            const hx = lerp(x0, x1, r()), hy = lerp(y0, y1, r()), hr = 0.8 + r() * 1.6;
            gg.fillStyle = 'rgba(10,8,8,0.7)'; gg.beginPath(); gg.arc(hx, hy, hr, 0, TAU); gg.fill();
            gg.fillStyle = 'rgba(255,230,210,0.18)'; gg.beginPath(); gg.arc(hx + 0.4, hy + 0.6, hr, 0.2, PI - 0.2); gg.fill();
          }
        } }));
      }
      // tide pools
      for (let i = 0; i < 7; i++) {
        const x = r() * s, y = r() * s, rx = 8 + r() * 10, ry = rx * 0.55;
        wrap(s, x, y, rx + 3, (X, Y) => {
          g.fillStyle = '#1a1412'; g.beginPath(); g.ellipse(X, Y, rx + 1.5, ry + 1.5, 0, 0, TAU); g.fill();
          const gr = g.createLinearGradient(X, Y - ry, X, Y + ry);
          gr.addColorStop(0, '#1d4f60'); gr.addColorStop(1, '#4aa0a6');
          g.fillStyle = gr; g.beginPath(); g.ellipse(X, Y, rx, ry, 0, 0, TAU); g.fill();
          g.strokeStyle = 'rgba(220,250,255,0.6)'; g.lineWidth = 1; g.beginPath(); g.ellipse(X - 1, Y - 1, rx * 0.6, ry * 0.4, 0, PI * 1.1, PI * 1.6); g.stroke();
        });
      }
      // coral fragments + barnacles
      const cc = ['#f2a1a0', '#f4ece0', '#f0b878', '#e47f8e', '#fff4ea'];
      for (let i = 0; i < 60; i++) {
        const x = r() * s, y = r() * s, col = pick(r, cc);
        wrap(s, x, y, 8, (X, Y) => {
          g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2.6; g.lineCap = 'round';
          const br = [];
          for (let k = 0; k < 3; k++) { const a = -PI / 2 + (k - 1) * 0.7 + (r() - 0.5) * 0.4, l = 3 + r() * 4; br.push([X + cos(a) * l, Y + sin(a) * l]); }
          g.beginPath(); for (const b of br) { g.moveTo(X + 0.6, Y + 1); g.lineTo(b[0] + 0.6, b[1] + 1); } g.stroke();
          g.strokeStyle = col; g.lineWidth = 1.8;
          g.beginPath(); for (const b of br) { g.moveTo(X, Y); g.lineTo(b[0], b[1]); } g.stroke();
          g.fillStyle = shade(col, 0.4); for (const b of br) { g.beginPath(); g.arc(b[0], b[1], 1, 0, TAU); g.fill(); }
        });
      }
      g.strokeStyle = 'rgba(235,230,215,0.65)'; g.lineWidth = 0.8;
      for (let i = 0; i < 90; i++) { const x = r() * s, y = r() * s; g.beginPath(); g.arc(x, y, 0.9 + r() * 0.8, 0, TAU); g.stroke(); }
    },
  });
  def('cave', {
    size: 384, rank: 22, receive: true, lip: ['#3a3430', '#141110'], ledge: '#3a3430',
    paint: (g, r, s) => {
      g.fillStyle = '#423b36'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#2c2622', '#564c44', '#3a332f', '#4f4a46'], 100, 12, 50, 0.3, 0.55);
      grains(g, r, s, 2600, ['#2a2420', '#6b625a', '#5a5048'], 0.6, 1.3);
      pebbleField(['#5e5650', '#6c645c', '#4f4843', '#7a7067'], 90, 1.5, 4.2)(g, r, s);
      for (let i = 0; i < 26; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 40, (X, Y) => crack(g, r, X, Y, 7, '#1d1916', 0.55, 1.1)); }
      // damp patches with glints
      for (let i = 0; i < 12; i++) {
        const x = r() * s, y = r() * s;
        wrap(s, x, y, 20, (X, Y) => { blob(g, X, Y, 14 + r() * 8, '#1e2a30', 0.45); for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(200,220,255,0.6)'; g.fillRect(X + (r() - 0.5) * 14, Y + (r() - 0.5) * 8, 1, 1); } });
      }
    },
    deco: {
      p: 0.25, n: 6,
      paint(g, r, v) {
        const x = 18 + r() * 28, y = 18 + r() * 28;
        if (v % 3 === 0) {
          // small crystal cluster
          for (let k = 0; k < 3; k++) {
            const a = -PI / 2 + (k - 1) * 0.5, l = 6 + r() * 5, bx = x + (k - 1) * 3;
            g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(bx + 2, y + 1, 3, 1.4, 0, 0, TAU); g.fill();
            g.fillStyle = k === 1 ? '#8fe0ff' : '#5fb7e0';
            g.beginPath(); g.moveTo(bx - 1.6, y); g.lineTo(bx + cos(a) * l, y + sin(a) * l); g.lineTo(bx + 1.6, y); g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(bx - 0.8, y - 1); g.lineTo(bx + cos(a) * l * 0.85, y + sin(a) * l * 0.85); g.lineTo(bx, y - 1); g.fill();
          }
        } else pebble(g, x, y, 6 + r() * 4, 4 + r() * 2, '#5a524c');
      },
    },
  });
  def('farmland', {
    size: 256, rank: 28, receive: true, lip: ['#5a4030', '#22180f'], ledge: '#5a4030',
    paint: (g, r, s) => {
      g.fillStyle = '#5c4029'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#4a3220', '#6e4e33', '#3d2a1b'], 40, 14, 40, 0.3, 0.5);
      for (let j = 0; j < s / 16; j++) {
        const y = j * 16;
        // ridge
        const gr = g.createLinearGradient(0, y, 0, y + 16);
        gr.addColorStop(0, 'rgba(40,26,14,0.55)'); gr.addColorStop(0.25, 'rgba(140,104,70,0.55)'); gr.addColorStop(0.55, 'rgba(110,80,52,0.3)'); gr.addColorStop(1, 'rgba(30,20,10,0.6)');
        g.fillStyle = gr; g.fillRect(0, y, s, 16);
        // clods
        for (let k = 0; k < 30; k++) pebble(g, r() * s, y + 5 + r() * 4, 1.2 + r() * 1.4, 1 + r(), '#7a5a3e', 0, 0.2);
        // sprouts
        if (j % 2 === 0) {
          for (let x = 4 + r() * 6; x < s; x += 9 + r() * 5) {
            const sx = x, sy = y + 7;
            g.strokeStyle = '#3f6b2a'; g.lineWidth = 1.3; g.lineCap = 'round';
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy - 3); g.stroke();
            g.fillStyle = '#7cb84a';
            g.beginPath(); g.ellipse(sx - 2, sy - 4, 2.2, 1.1, -0.5, 0, TAU); g.fill();
            g.beginPath(); g.ellipse(sx + 2, sy - 4.4, 2.2, 1.1, 0.5, 0, TAU); g.fill();
          }
        }
      }
    },
  });

  // ---- interior & built floors ------------------------------------------------------------------------
  function paintPlanks(o) {
    return (g, r, s) => {
      g.fillStyle = o.gap; g.fillRect(0, 0, s, s);
      if (o.vertical) { g.save(); g.translate(s, 0); g.rotate(PI / 2); }
      rows(g, r, s, o.rh, o.min, o.max, (x, y, w, h) => {
        const col = pick(r, o.cols);
        const gr = g.createLinearGradient(0, y, 0, y + h);
        gr.addColorStop(0, shade(col, 0.1)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.12));
        g.fillStyle = gr; g.fillRect(x + 0.6, y + 0.8, w - 1.2, h - 1.8);
        // grain
        g.save(); g.beginPath(); g.rect(x + 0.6, y + 0.8, w - 1.2, h - 1.8); g.clip();
        for (let k = 0; k < o.grain; k++) {
          const yy = y + 2 + r() * (h - 4), a = r() * 0.4;
          g.strokeStyle = r() < 0.5 ? rgba(shade(col, -0.35), 0.35 + a) : rgba(shade(col, 0.25), 0.25);
          g.lineWidth = 0.6 + r() * 0.5;
          g.beginPath(); g.moveTo(x, yy);
          const ph = r() * TAU, amp = 0.4 + r() * 1.2;
          for (let xx = 0; xx <= w; xx += 6) g.lineTo(x + xx, yy + sin(xx * 0.07 + ph) * amp);
          g.stroke();
        }
        if (r() < o.knot) {
          const kx = x + 6 + r() * (w - 12), ky = y + h / 2;
          g.strokeStyle = rgba(shade(col, -0.45), 0.6); g.lineWidth = 0.8;
          g.beginPath(); g.ellipse(kx, ky, 3.2, 1.6, 0, 0, TAU); g.stroke();
          g.fillStyle = rgba(shade(col, -0.5), 0.6); g.beginPath(); g.ellipse(kx, ky, 1.4, 0.8, 0, 0, TAU); g.fill();
        }
        g.restore();
        g.fillStyle = 'rgba(255,240,210,0.22)'; g.fillRect(x + 0.6, y + 0.8, w - 1.2, 1);
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x + w - 1.4, y + 0.8, 0.8, h - 1.8);
        if (o.nails) {
          g.fillStyle = 'rgba(30,20,12,0.75)';
          for (const ex of [x + 3, x + w - 4]) { g.beginPath(); g.arc(ex, y + h * 0.3, 0.8, 0, TAU); g.arc(ex, y + h * 0.7, 0.8, 0, TAU); g.fill(); }
        }
      });
      if (o.vertical) g.restore();
      if (o.wear) mottle(g, r, s, o.wear, 30, 20, 60, 0.06, 0.14);
    };
  }
  def('wood', {
    size: 256, rank: 10, curb: true, curbGroup: 'in', ledge: '#4a3020',
    paint: paintPlanks({ rh: 16, min: 56, max: 150, gap: '#2a1a10', cols: ['#8e5c36', '#9a6640', '#86552f', '#a06b44', '#94603a'], grain: 6, knot: 0.25, nails: true, wear: ['#000000', '#ffe0b0'] }),
  });
  def('tile_floor', {
    size: 256, rank: 10, curb: true, curbGroup: 'in', ledge: '#6a6050',
    paint: (g, r, s) => {
      g.fillStyle = '#6d6455'; g.fillRect(0, 0, s, s);
      const cols = ['#b5a88f', '#ab9e85', '#bdb198', '#a69a82', '#b1a48a'];
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const x = i * 32, y = j * 32;
        slab(g, r, [[x + 1.2, y + 1.2], [x + 30.8, y + 1.2], [x + 30.8, y + 30.8], [x + 1.2, y + 30.8]], pick(r, cols), { sharp: true, sh: 0.3, tex: (gg, x0, y0, x1, y1) => {
          speckIn(r, 18, ['#7d725f', '#e0d6c2'], 0.35)(gg, x0, y0, x1, y1);
          if (r() < 0.15) crack(gg, r, lerp(x0, x1, r()), lerp(y0, y1, r()), 3, '#5a5040', 0.5, 0.7);
        } });
      }
      mottle(g, r, s, ['#3a3028', '#fff4dc'], 16, 30, 60, 0.05, 0.1);
    },
  });
  def('temple_floor', {
    size: 256, rank: 10, curb: true, curbGroup: 'in', ledge: '#3a3c38',
    paint: (g, r, s) => {
      g.fillStyle = '#2b2d2a'; g.fillRect(0, 0, s, s);
      const cols = ['#5d625c', '#575c57', '#636760', '#535852'];
      for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) {
        const x = i * 64 + (j % 2) * 32, y = j * 32;
        wrapX(s, x, 64, (X) => {
          slab(g, r, [[X + 1, y + 1], [X + 63, y + 1], [X + 63, y + 31], [X + 1, y + 31]], pick(r, cols), { sharp: true, sh: 0.25, rimA: 0.16, tex: (gg, x0, y0, x1, y1) => {
            speckIn(r, 60, ['#33362f', '#8d918a', '#454a44'], 0.45)(gg, x0, y0, x1, y1);
            // polish streak
            const gr = gg.createLinearGradient(x0, y0, x1, y1);
            const p = 0.3 + r() * 0.4;
            gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(p, 'rgba(230,240,255,0.12)'); gr.addColorStop(min(1, p + 0.15), 'rgba(255,255,255,0)');
            gg.fillStyle = gr; gg.fillRect(x0, y0, x1 - x0, y1 - y0);
          } });
        });
      }
    },
    deco: {
      p: 0.08, n: 3,
      paint(g, r) {
        // engraved lotus medallion
        const x = 32, y = 32;
        g.strokeStyle = 'rgba(25,25,22,0.55)'; g.lineWidth = 1.2;
        for (let k = 0; k < 8; k++) {
          const a = k * TAU / 8;
          g.beginPath(); g.ellipse(x + cos(a) * 7, y + sin(a) * 5, 6, 2.6, a, 0, TAU); g.stroke();
        }
        g.beginPath(); g.ellipse(x, y, 4, 3, 0, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.8;
        for (let k = 0; k < 8; k++) { const a = k * TAU / 8; g.beginPath(); g.ellipse(x + cos(a) * 7 + 0.8, y + sin(a) * 5 + 0.8, 6, 2.6, a, PI, TAU); g.stroke(); }
        void r;
      },
    },
  });
  def('red_carpet', {
    size: 256, rank: 12, curb: false, ledge: '#5a1418',
    paint: (g, r, s) => {
      g.fillStyle = '#8c1d23'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#6e1219', '#a52a2e', '#7a1a20'], 40, 20, 60, 0.2, 0.4);
      // woven pile
      for (let y = 0; y < s; y += 2) { g.fillStyle = y % 4 ? 'rgba(0,0,0,0.07)' : 'rgba(255,200,180,0.05)'; g.fillRect(0, y, s, 1); }
      grains(g, r, s, 1500, ['#5a0e14', '#c44a48'], 0.4, 1);
      // 祥雲 cloud-scroll motif on a 64 lattice, offset by half a cell
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const x = i * 64 + 32, y = j * 64 + 32;
        g.strokeStyle = 'rgba(70,8,14,0.55)'; g.lineWidth = 2.2; g.lineCap = 'round';
        for (const sx of [-1, 1]) {
          g.beginPath(); g.arc(x + sx * 7, y, 5, 0, TAU * 0.8 * (sx > 0 ? 1 : -1), sx < 0); g.stroke();
          g.beginPath(); g.arc(x + sx * 13, y + 3, 3, PI, TAU); g.stroke();
        }
        g.strokeStyle = 'rgba(214,170,80,0.35)'; g.lineWidth = 0.9;
        g.beginPath(); g.arc(x, y - 1, 2.2, 0, TAU); g.stroke();
        for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; g.fillStyle = 'rgba(214,170,80,0.35)'; g.fillRect(x + cos(a) * 32 - 1, y + sin(a) * 32 - 1, 2, 2); }
      }
    },
    edges(g, n) {
      // gold-trimmed border where the carpet ends
      for (const s of [0, 2, 4, 6]) {
        if (n[s] === 'red_carpet') continue;
        g.save(); g.translate(T / 2, T / 2); g.rotate((s / 2) * PI / 2); g.translate(-T / 2, -T / 2);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, T, 1.5);
        g.fillStyle = '#5e0f15'; g.fillRect(0, 1.5, T, 8);
        g.fillStyle = '#d6a94a'; g.fillRect(0, 2.5, T, 1.2); g.fillRect(0, 8, T, 1.2);
        g.fillStyle = 'rgba(255,240,190,0.5)'; g.fillRect(0, 2.5, T, 0.5);
        g.fillStyle = '#c9963c';
        for (let x = 4; x < T; x += 8) { g.beginPath(); g.moveTo(x, 4.2); g.lineTo(x + 2.2, 5.8); g.lineTo(x, 7.4); g.lineTo(x - 2.2, 5.8); g.closePath(); g.fill(); }
        g.restore();
      }
    },
  });
  def('mat', {
    size: 256, rank: 10, curb: false, ledge: '#6a5030',
    paint: (g, r, s) => {
      g.fillStyle = '#8a6c3a'; g.fillRect(0, 0, s, s);
      const cols = ['#c9a466', '#bf9a5a', '#d2ae70', '#b8924f'];
      for (let j = 0; j < s / 8; j++) for (let i = 0; i < s / 8; i++) {
        const x = i * 8, y = j * 8, hz = (i + j) % 2 === 0, col = pick(r, cols);
        const gr = hz ? g.createLinearGradient(0, y, 0, y + 8) : g.createLinearGradient(x, 0, x + 8, 0);
        gr.addColorStop(0, shade(col, 0.15)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.3));
        g.fillStyle = gr;
        g.beginPath(); g.roundRect(x + 0.5, y + 0.5, 7, 7, 2); g.fill();
        g.strokeStyle = 'rgba(90,60,25,0.35)'; g.lineWidth = 0.5;
        g.beginPath();
        for (let k = 2; k < 8; k += 2) { if (hz) { g.moveTo(x + 1, y + k); g.lineTo(x + 7, y + k); } else { g.moveTo(x + k, y + 1); g.lineTo(x + k, y + 7); } }
        g.stroke();
      }
      mottle(g, r, s, ['#5a3a18', '#fff0c8'], 20, 20, 60, 0.05, 0.12);
    },
    edges(g, n) {
      for (const s of [0, 2, 4, 6]) {
        if (n[s] === 'mat') continue;
        g.save(); g.translate(T / 2, T / 2); g.rotate((s / 2) * PI / 2); g.translate(-T / 2, -T / 2);
        g.fillStyle = '#4a3420'; g.fillRect(0, 0, T, 4);
        g.fillStyle = 'rgba(255,220,160,0.25)'; g.fillRect(0, 0.5, T, 0.8);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 4, T, 1);
        g.restore();
      }
    },
  });
  def('dock', {
    size: 256, rank: 10, curb: false, ledge: '#4a3624',
    paint: paintPlanks({ vertical: true, rh: 16, min: 70, max: 190, gap: '#0f1a22', cols: ['#8b7358', '#7f6a52', '#968066', '#776350'], grain: 5, knot: 0.3, nails: true, wear: ['#2a3a3a', '#d8d0c0'] }),
  });
  def('deck', {
    size: 256, rank: 10, curb: false, ledge: '#5a3a20',
    paint: paintPlanks({ rh: 14.2222, min: 80, max: 200, gap: '#1c120a', cols: ['#a0703f', '#9a6a3a', '#a87a48', '#8f6234', '#a57444'], grain: 5, knot: 0.15, nails: true, wear: ['#3a2a1a', '#ffe8c0'] }),
  });

  // rail (mine floor + track autoconnect)
  def('rail', {
    size: 384, rank: 22, base: null, ledge: '#3a3430',
    paint: (g, r, s) => D.cave.paint ? D.cave.paint(g, r, s) : 0,
    always: true,
    edges(g, n) {
      const is = (i) => n[i] === 'rail';
      const N = is(0), E = is(2), S = is(4), W = is(6);
      const k = (N ? 1 : 0) + (E ? 1 : 0) + (S ? 1 : 0) + (W ? 1 : 0);
      const sleeperCol = '#5a4028';
      const sleeper = (x, y, ang) => {
        g.save(); g.translate(x, y); g.rotate(ang);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-16, -2, 34, 6.5);
        g.fillStyle = sleeperCol; g.fillRect(-17, -3, 34, 6);
        g.fillStyle = 'rgba(255,220,170,0.22)'; g.fillRect(-17, -3, 34, 1.2);
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-17, 2, 34, 1);
        g.restore();
      };
      const railStroke = (fn) => {
        g.lineCap = 'butt';
        g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3.6; g.save(); g.translate(0.8, 1.2); fn(); g.restore();
        g.strokeStyle = '#5d5f63'; g.lineWidth = 3.2; fn();
        g.strokeStyle = '#b8bcc2'; g.lineWidth = 1.1; g.save(); g.translate(-0.6, -0.6); fn(); g.restore();
      };
      const straightV = () => {
        for (let y = 5; y < T; y += 11) sleeper(32, y, 0);
        railStroke(() => { g.beginPath(); g.moveTo(22, 0); g.lineTo(22, T); g.moveTo(42, 0); g.lineTo(42, T); g.stroke(); });
      };
      const straightH = () => {
        for (let x = 5; x < T; x += 11) sleeper(x, 32, PI / 2);
        railStroke(() => { g.beginPath(); g.moveTo(0, 22); g.lineTo(T, 22); g.moveTo(0, 42); g.lineTo(T, 42); g.stroke(); });
      };
      const curve = (ccx, ccy, a0, a1) => {
        for (let i = 0; i < 6; i++) { const a = a0 + (a1 - a0) * (i + 0.5) / 6; sleeper(ccx + cos(a) * 32, ccy + sin(a) * 32, a); }
        railStroke(() => { g.beginPath(); g.arc(ccx, ccy, 22, a0, a1, a1 < a0); g.moveTo(ccx + cos(a0) * 42, ccy + sin(a0) * 42); g.arc(ccx, ccy, 42, a0, a1, a1 < a0); g.stroke(); });
      };
      if (k === 2 && (N || S) && (E || W)) {
        if (N && E) curve(T, 0, PI / 2, PI);
        else if (N && W) curve(0, 0, 0, PI / 2);
        else if (S && E) curve(T, T, PI, PI * 1.5);
        else curve(0, T, PI * 1.5, TAU);
      } else if ((N || S) && !(E || W)) straightV();
      else if ((E || W) && !(N || S)) straightH();
      else if (k === 0) straightH();
      else { straightH(); straightV(); }
    },
  });
  D.rail.paint = null;
  D.rail.tx = () => D.cave.tx();

  // =================================================================================================
  // WATER
  function waterTex(key, size, o) {
    return () => tex(key, size, (g, r, s) => {
      g.fillStyle = o.base; g.fillRect(0, 0, s, s);
      mottle(g, r, s, o.mott, o.mn || 70, 24, 80, 0.25, 0.55, o.sy || 1);
      if (o.extra) o.extra(g, r, s);
    });
  }
  function hlTex(key, size, o) {
    return () => tex(key, size, (g, r, s) => {
      g.lineCap = 'round';
      for (let i = 0; i < o.n; i++) {
        const x = r() * s, y = r() * s, rad = lerp(o.r0, o.r1, r());
        wrap(s, x, y, rad * 2, (X, Y) => {
          if (o.trough) { g.strokeStyle = rgba(o.trough, 0.22); g.lineWidth = 2; g.beginPath(); g.ellipse(X, Y + 2.2, rad, rad * 0.35, 0, PI * 0.15, PI * 0.85); g.stroke(); }
          g.strokeStyle = rgba(o.col, o.a * (0.5 + r() * 0.5)); g.lineWidth = o.lw || 1.4;
          g.beginPath(); g.ellipse(X, Y, rad, rad * 0.35, 0, PI * 1.15, PI * 1.85); g.stroke();
        });
      }
      for (let i = 0; i < (o.sparkle || 0); i++) {
        const x = r() * s, y = r() * s, z = 0.8 + r() * 1.3;
        wrap(s, x, y, 6, (X, Y) => star4(g, X, Y, z, '#ffffff', 0.85));
      }
      if (o.streak) {
        for (let i = 0; i < o.streak; i++) {
          const x = r() * s, y = r() * s, l = 8 + r() * 26;
          wrap(s, x, y, l, (X, Y) => {
            g.strokeStyle = rgba(o.col, 0.15 + r() * 0.3); g.lineWidth = 1 + r();
            g.beginPath(); g.moveTo(X, Y); g.quadraticCurveTo(X + l / 2, Y + (r() - 0.5) * 3, X + l, Y); g.stroke();
          });
        }
      }
    });
  }
  // the same seamless texture rotated by 90° (for north–south river flow)
  function rotTex(key, srcFn) {
    return () => {
      let c = TEX.get(key);
      if (c) return c;
      const src = srcFn(), s = src.ts;
      const tile = U.makeCanvas(s, s), tg = tile.getContext('2d');
      tg.translate(s / 2, s / 2); tg.rotate(PI / 2); tg.translate(-s / 2, -s / 2);
      tg.drawImage(src, 0, 0, s * src.sc, s * src.sc, 0, 0, s, s);
      c = U.makeCanvas(s + T, s + T);
      const g = c.getContext('2d');
      for (const ox of [0, s]) for (const oy of [0, s]) g.drawImage(tile, ox, oy, s, s);
      c.ts = s; c.n = s / T; c.sc = SC;
      TEX.set(key, c);
      return c;
    };
  }
  function paintCaustic(g, r, s, k) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    const n = Math.round(s / 32), cw = s / n, J = [];
    for (let i = 0; i < n * n; i++) J.push([(r() - 0.5) * cw * 0.8, (r() - 0.5) * cw * 0.8]);
    const P = (i, j) => { const q = J[mod(j, n) * n + mod(i, n)]; return [i * cw + q[0], j * cw + q[1]]; };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1);
      for (const [p, q] of [[a, b], [a, c]]) {
        wrap(s, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, cw * 1.5, (X, Y) => {
          const ox = X - (p[0] + q[0]) / 2, oy = Y - (p[1] + q[1]) / 2;
          const mx = (p[0] + q[0]) / 2 + ox + (r() - 0.5) * 12, my = (p[1] + q[1]) / 2 + oy + (r() - 0.5) * 12;
          g.strokeStyle = `rgba(200,255,250,${0.08 * k})`; g.lineWidth = 5;
          g.beginPath(); g.moveTo(p[0] + ox, p[1] + oy); g.quadraticCurveTo(mx, my, q[0] + ox, q[1] + oy); g.stroke();
          g.strokeStyle = `rgba(230,255,250,${0.3 * k})`; g.lineWidth = 1;
          g.beginPath(); g.moveTo(p[0] + ox, p[1] + oy); g.quadraticCurveTo(mx, my, q[0] + ox, q[1] + oy); g.stroke();
        });
      }
    }
  }
  function water(id, o) {
    const d = def(id, Object.assign({ kind: 'water', water: true, solid: true, anim: true, rank: 0 }, o));
    return d;
  }
  // sea family (water / deepwater / shallow) share one highlight layer & scroll so they flow into each other
  const seaHl = hlTex('sea_hl', 256, { n: 95, r0: 5, r1: 16, col: '#d4f2ff', a: 0.55, trough: '#0e3a58', sparkle: 18 });
  const seaLayer = (ctx, cx, cy, px, py, t, a) => layer(ctx, seaHl(), cx, cy, px, py, t * 7 + sin(t * 0.7) * 6, t * 2.5 + cos(t * 0.9) * 4, a);
  const seaBase = waterTex('sea_base', 384, { base: '#286a8a', mott: ['#1d5676', '#357f9c', '#2b7390', '#1a4d6a', '#3a8aa2'] });
  water('water', {
    col: '#286a8a', shore: '#8fe0d6', rank: 2, tx: seaBase,
    waterBase(ctx, px, py, cx, cy, t) {
      blitCell(ctx, seaBase(), cx, cy, px, py);
      seaLayer(ctx, cx, cy, px, py, t, 1);
    },
  });
  const deepBase = waterTex('deep_base', 384, { base: '#173f60', mott: ['#0f2c48', '#1d4b6c', '#122f4e', '#21557a'] });
  water('deepwater', {
    col: '#173f60', shore: '#4a8ab0', rank: 1, tx: deepBase,
    waterBase(ctx, px, py, cx, cy, t) {
      blitCell(ctx, deepBase(), cx, cy, px, py);
      seaLayer(ctx, cx, cy, px, py, t, 0.8);
    },
  });
  const shallowBase = waterTex('shallow_base', 384, {
    base: '#4aa6aa', mott: ['#5fbdb6', '#3d9298', '#6cc4b8', '#7fc8b0'],
    extra: (g, r, s) => {
      // sandy bottom ripples, pebbles and caustic light seen through the water
      for (let i = 0; i < 30; i++) {
        const y0 = r() * s, ph = r() * TAU, k = 1 + (r() * 3 | 0);
        g.strokeStyle = 'rgba(190,235,210,0.25)'; g.lineWidth = 2;
        wrap(s, s / 2, y0, s, (X, Y) => { g.beginPath(); for (let x = 0; x <= s; x += 4) { const yy = Y + 3 * sin((x / s) * TAU * k + ph); if (x) g.lineTo(X - s / 2 + x, yy); else g.moveTo(X - s / 2 + x, yy); } g.stroke(); });
      }
      for (let i = 0; i < 40; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 6, (X, Y) => blob(g, X, Y, 3 + r() * 3, pick(r, ['#2f7a7a', '#7aa890', '#3e8a80']), 0.6)); }
      paintCaustic(g, r, s, 1);
    },
  });
  water('shallow', {
    col: '#4aa6aa', shore: '#bff0dc', solid: false, rank: 3, tx: shallowBase,
    waterBase(ctx, px, py, cx, cy, t) {
      blitCell(ctx, shallowBase(), cx, cy, px, py);
      seaLayer(ctx, cx, cy, px, py, t, 0.85);
    },
  });
  const lakeBase = waterTex('lake_base', 384, { base: '#3a767c', mott: ['#2f6670', '#4a8a88', '#2a5a64', '#56948c', '#3f7f90'] });
  const lakeHl = hlTex('lake_hl', 256, { n: 55, r0: 7, r1: 17, col: '#e0f4f0', a: 0.42, trough: '#1a4048', sparkle: 12 });
  water('lake', {
    col: '#3a767c', shore: '#9ad8c8', rank: 2, tx: lakeBase,
    waterBase(ctx, px, py, cx, cy, t) {
      blitCell(ctx, lakeBase(), cx, cy, px, py);
      layer(ctx, lakeHl(), cx, cy, px, py, t * 3 + sin(t * 0.5) * 5, t * 1.2 + cos(t * 0.7) * 3, 0.9);
    },
  });
  const riverBase = waterTex('river_base', 384, { base: '#377c8e', mott: ['#2c6a7e', '#4a90a0', '#2a6276', '#55a0a8'], sy: 0.35, mn: 110 });
  const riverHl = hlTex('river_hl', 256, { n: 22, r0: 6, r1: 12, col: '#e4f8ff', a: 0.35, sparkle: 10, streak: 120 });
  const riverBaseV = rotTex('river_base_v', riverBase), riverHlV = rotTex('river_hl_v', riverHl);
  water('river', {
    col: '#377c8e', shore: '#9fe0d4',
    waterBase(ctx, px, py, cx, cy, t, n) {
      const v = (n[0] === 'river' || n[4] === 'river' || OVER_WATER.has(n[0]) || OVER_WATER.has(n[4])) && !(n[2] === 'river' || n[6] === 'river');
      if (v) {
        blitCell(ctx, riverBaseV(), cx, cy, px, py, sin(t * 0.4) * 3, -t * 14);
        layer(ctx, riverHlV(), cx, cy, px, py, sin(t * 0.7) * 2, -t * 30, 1);
      } else {
        blitCell(ctx, riverBase(), cx, cy, px, py, -t * 14, sin(t * 0.4) * 3);
        layer(ctx, riverHl(), cx, cy, px, py, -t * 30, sin(t * 0.7) * 2, 1);
      }
    },
  });
  const marshBase = waterTex('marsh_base', 384, {
    base: '#46553a', mott: ['#3a4a2e', '#56653f', '#2c3a28', '#5f6a3a', '#4a4a30'],
    extra: (g, r, s) => {
      grains(g, r, s, 1400, ['#7a8a40', '#a0aa58', '#2a3420'], 0.5, 1.4);
      for (let i = 0; i < 26; i++) {
        const x = r() * s, y = r() * s, rad = 4 + r() * 6, a0 = r() * TAU;
        wrap(s, x, y, rad + 2, (X, Y) => {
          g.fillStyle = 'rgba(10,20,10,0.35)'; g.beginPath(); g.ellipse(X + 1, Y + 1.5, rad, rad * 0.6, 0, 0, TAU); g.fill();
          g.fillStyle = pick(r, ['#5e8a3a', '#6e9a44', '#4f7a34']);
          g.beginPath(); g.moveTo(X, Y); g.ellipse(X, Y, rad, rad * 0.6, 0, a0 + 0.35, a0 + TAU - 0.05); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(200,230,150,0.45)'; g.lineWidth = 0.7; g.beginPath(); g.ellipse(X, Y, rad * 0.7, rad * 0.4, 0, PI * 1.1, PI * 1.6); g.stroke();
          if (r() < 0.2) { flower5(g, X + 1, Y - 1, 2.4, '#fbe8f0', '#f2c84a'); }
        });
      }
    },
  });
  const marshHl = hlTex('marsh_hl', 256, { n: 18, r0: 6, r1: 12, col: '#d8e8c8', a: 0.25, sparkle: 3 });
  water('marsh', {
    col: '#46553a', shore: '#7a8a5a', solid: false, foam: false,
    waterBase(ctx, px, py, cx, cy, t) {
      blitCell(ctx, marshBase(), cx, cy, px, py);
      layer(ctx, marshHl(), cx, cy, px, py, t * 1.5, t * 0.8, 0.8);
    },
    live(ctx, px, py, cx, cy, t) {
      // reeds sway
      if (U.hash(cx, cy, 51) > 0.4) return;
      // reeds sway: 4 pre-baked lean frames, picked by phase (no per-frame transforms)
      const v = (U.hash(cx, cy, 52) * 3) | 0;
      const f = Math.round((sin(t * 1.3 + cx * 0.7) * 0.5 + 0.5) * 3);
      const rs = sprite('reeds' + v + '_' + f, T, T, (g) => {
        const r = U.seeded(700 + v), lean = (f / 3 - 0.5) * 4;
        for (let i = 0; i < 9; i++) {
          const x = 16 + r() * 32, y = 30 + r() * 26, h = 14 + r() * 16, tip = (r() - 0.5) * 5;
          g.strokeStyle = pick(r, ['#6f7a3a', '#8a9448', '#5a6a32']); g.lineWidth = 1.4; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 1 + lean * 0.4, y - h * 0.5, x + tip + lean, y - h); g.stroke();
          if (r() < 0.4) { g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(x + lean * 0.8, y - h * 0.8, 1.6, 4, 0, 0, TAU); g.fill(); }
        }
      });
      if (rs.box === undefined) rs.box = bbox(rs);
      if (rs.box) drawBox(ctx, rs, rs.box, px, py);
    },
  });
  const bsBase = waterTex('bs_base', 384, {
    base: '#070a14', mott: ['#0d1430', '#120c22', '#0a1a26', '#161a3a', '#05060c'],
    extra: (g, r, s) => {
      for (let i = 0; i < 110; i++) {
        const x = r() * s, y = r() * s, rad = 8 + r() * 20;
        wrap(s, x, y, rad, (X, Y) => {
          g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.ellipse(X, Y + 2, rad, rad * 0.3, 0, PI * 0.15, PI * 0.85); g.stroke();
          g.strokeStyle = `rgba(90,110,190,${0.12 + r() * 0.16})`; g.lineWidth = 1.1; g.beginPath(); g.ellipse(X, Y, rad, rad * 0.3, 0, PI * 1.1, PI * 1.9); g.stroke();
        });
      }
    },
  });
  const souls = () => tex('souls', 384, (g, r, s) => {
    for (let i = 0; i < 16; i++) {
      const x = r() * s, y = r() * s, warm = r() < 0.7;
      const col = warm ? pick(r, ['#ffb35a', '#ffd27a', '#ff9a4a']) : pick(r, ['#8fd8ff', '#c8b0ff']);
      wrap(s, x, y, 26, (X, Y) => {
        blob(g, X, Y, 22, col, 0.18);
        blob(g, X, Y, 8, col, 0.5);
        g.fillStyle = '#fff8e8'; g.beginPath(); g.arc(X, Y, 1.4, 0, TAU); g.fill();
        // reflection streak
        g.fillStyle = rgba(col, 0.25); g.fillRect(X - 0.6, Y + 4, 1.2, 10);
      });
    }
  });
  function blackSeaBase(ctx, px, py, cx, cy, t) {
    blitCell(ctx, bsBase(), cx, cy, px, py, t * 2.5 + sin(t * 0.5) * 4, t * 0.8);
    layer(ctx, souls(), cx, cy, px, py, t * 2.2, -t * 1.4, 0.75 + 0.25 * sin(t * 0.9), 'lighter');
  }
  water('black_sea', {
    col: '#070a14', wall: true, waterBase: blackSeaBase,
  });

  // ---- bridges ------------------------------------------------------------------------------------------
  function waterUnder(a, b) {
    for (const id of [a, b]) if (WATERS.has(id)) return id;
    for (const id of [a, b]) if (D[id] && D[id].under) return D[id].under;
    if (a === 'void' || b === 'void') return 'void';
    return 'river';
  }
  function drawUnder(wid, ctx, px, py, cx, cy, t, n) {
    if (wid === 'void') { ctx.fillStyle = '#05060a'; ctx.fillRect(px, py, T, T); return; }
    D[wid].waterBase(ctx, px, py, cx, cy, t, n);
  }
  const plankCols = ['#8a6a48', '#7d5f40', '#95744f', '#86664a', '#7a5a3c'];
  // deck drawn in a local frame where the bridge runs along +x; bridge_v uses a transpose
  // (local north → screen west, local south → screen east). o: { nOpen, sOpen, aOpen (start end), bOpen }
  function bridgeDeck(g, r, horiz, o) {
    g.save();
    if (!horiz) g.transform(0, 1, 1, 0, 0, 0);
    const top = o.nOpen ? 9 : 0, bot = o.sOpen ? 51 : T;
    if (o.sOpen) {
      const gr = g.createLinearGradient(0, 52, 0, 64);
      gr.addColorStop(0, 'rgba(0,10,20,0.55)'); gr.addColorStop(1, 'rgba(0,10,20,0)');
      g.fillStyle = gr; g.fillRect(0, 52, T, 12);
    }
    for (let x = 0; x < T; x += 8) {
      const col = pick(r, plankCols), j = (r() - 0.5) * 1.5;
      const g2 = g.createLinearGradient(x, 0, x + 8, 0);
      g2.addColorStop(0, shade(col, 0.12)); g2.addColorStop(1, shade(col, -0.15));
      g.fillStyle = g2; g.fillRect(x + 0.5, top + j * (o.nOpen ? 1 : 0), 7.2, bot - top);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + 7.5, top, 0.6, bot - top);
      g.strokeStyle = rgba(shade(col, -0.4), 0.4); g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(x + 3 + r() * 2, top + 2); g.lineTo(x + 3 + r() * 2, bot - 3); g.stroke();
      g.fillStyle = 'rgba(30,20,10,0.7)';
      if (o.nOpen) g.fillRect(x + 3.4, top + 4, 1.1, 1.1);
      if (o.sOpen) g.fillRect(x + 3.4, bot - 5, 1.1, 1.1);
    }
    if (o.nOpen) { g.fillStyle = '#4a3220'; g.fillRect(0, 7, T, 4); }
    if (o.sOpen) {
      g.fillStyle = '#5e4129'; g.fillRect(0, 49, T, 4);
      g.fillStyle = '#3a2616'; g.fillRect(0, 53, T, 3.5);
      g.fillStyle = 'rgba(255,220,170,0.25)'; g.fillRect(0, 49, T, 1);
    }
    const rail = (y0) => {
      for (const x of [10, 42]) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 1.5, y0 + 2, 5, 12);
        g.fillStyle = '#6e2a1e'; g.fillRect(x, y0, 5, 12);
        g.fillStyle = '#a3402c'; g.fillRect(x, y0, 1.6, 12);
        g.fillStyle = '#c9a44a'; g.fillRect(x - 0.5, y0 - 1.5, 6, 2);
      }
      g.fillStyle = '#7e3222'; g.fillRect(0, y0 + 1, T, 3);
      g.fillStyle = 'rgba(255,200,160,0.35)'; g.fillRect(0, y0 + 1, T, 0.9);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y0 + 4, T, 1);
    };
    if (o.nOpen) rail(-1);
    if (o.sOpen) rail(40);
    // end posts where the bridge meets land
    for (const [open, x] of [[o.aOpen, 0], [o.bOpen, T - 7]]) {
      if (!open) continue;
      const ys = [];
      if (o.nOpen) ys.push(-3);
      if (o.sOpen) ys.push(38);
      for (const y0 of ys) {
        g.fillStyle = '#5a2016'; g.fillRect(x, y0, 7, 16);
        g.fillStyle = '#a3402c'; g.fillRect(x, y0, 2, 16);
        g.fillStyle = '#d8b25a'; g.beginPath(); g.arc(x + 3.5, y0 - 1, 3.4, 0, TAU); g.fill();
      }
    }
    g.restore();
  }
  for (const [id, horiz] of [['bridge_h', true], ['bridge_v', false]]) {
    def(id, {
      anim: true, rank: 10,
      base(ctx, px, py, cx, cy, t, n) {
        const wid = horiz ? waterUnder(n[0], n[4]) : waterUnder(n[6], n[2]);
        drawUnder(wid, ctx, px, py, cx, cy, t, n);
        const o = horiz
          ? { nOpen: n[0] !== id, sOpen: n[4] !== id, aOpen: n[6] !== id, bOpen: n[2] !== id }
          : { nOpen: n[6] !== id, sOpen: n[2] !== id, aOpen: n[0] !== id, bOpen: n[4] !== id };
        const key = 'B' + id + (o.nOpen ? 1 : 0) + (o.sOpen ? 1 : 0) + (o.aOpen ? 1 : 0) + (o.bOpen ? 1 : 0) + mod(horiz ? cx : cy, 4);
        const c = ovl(key, (r) => canvas(T, T, (g) => bridgeDeck(g, r, horiz, o)));
        ctx.drawImage(c, px, py, T, T);
      },
    });
  }

  // =================================================================================================
  // DREAM / SPIRIT / PSYCHEDELIC FLOORS
  function moteTex(key, cols, n, r0, r1) {
    return () => tex(key, 256, (g, r, s) => {
      for (let i = 0; i < n; i++) {
        const x = r() * s, y = r() * s, rad = lerp(r0, r1, r()), col = pick(r, cols);
        wrap(s, x, y, rad * 3, (X, Y) => { blob(g, X, Y, rad * 3, col, 0.25); blob(g, X, Y, rad, col, 0.8); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(X, Y, rad * 0.35, 0, TAU); g.fill(); });
      }
    });
  }
  // small drifting light motes drawn live (cheaper than a full-cell layer). Each mote loops inside its cell.
  function moteSprite(col) {
    return sprite('mote' + col, 16, 16, (g) => { blob(g, 8, 8, 8, col, 0.45); blob(g, 8, 8, 3, col, 0.9); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(8, 8, 1, 0, TAU); g.fill(); });
  }
  function liveMotes(ctx, px, py, cx, cy, t, o) {
    const go = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < o.n; k++) {
      const h = U.hash(cx, cy, o.seed + k);
      if (h > o.p) continue;
      const ph = U.hash(cx, cy, o.seed + 31 + k);
      const life = (t * o.speed + ph * 7) % 1;               // 0..1 loop
      const x = 10 + ph * 44 + sin(t * 0.9 + ph * 9) * 4;
      const y = 58 - life * o.rise - (1 - ph) * 8;
      ctx.globalAlpha = ga * sin(life * PI) * o.a;
      ctx.drawImage(moteSprite(o.cols[(ph * o.cols.length) | 0]), px + x - 8 * o.sz, py + y - 8 * o.sz, 16 * o.sz, 16 * o.sz);
    }
    ctx.globalCompositeOperation = go; ctx.globalAlpha = ga;
  }
  // lily field: 彼岸花 (red spider lily) ground
  function spiderLily(g, r, x, y, sc) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.fillStyle = 'rgba(20,0,0,0.3)'; g.beginPath(); g.ellipse(1.5, 4, 8, 3, 0, 0, TAU); g.fill();
    g.strokeStyle = '#2e4a22'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0.5, 6); g.stroke();
    const n = 6, rot = r() * TAU;
    g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const a = rot + k * TAU / n, l = 6.5 + r() * 2;
      const ex = cos(a) * l, ey = sin(a) * l * 0.75 - 1.5;
      g.strokeStyle = '#8e1424'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(cos(a) * l * 0.6, sin(a) * l * 0.45 - 4, ex, ey); g.stroke();
      g.strokeStyle = '#e02a3c'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(cos(a) * l * 0.6, sin(a) * l * 0.45 - 4, ex, ey); g.stroke();
      // curled tip
      g.strokeStyle = '#ff6a72'; g.lineWidth = 0.9;
      g.beginPath(); g.arc(ex - cos(a) * 1.2, ey - 1, 1.3, a - PI, a); g.stroke();
    }
    // long stamens
    g.strokeStyle = 'rgba(255,90,100,0.9)'; g.lineWidth = 0.6;
    for (let k = 0; k < 7; k++) {
      const a = rot + k * TAU / 7 + 0.2, l = 11 + r() * 4;
      const ex = cos(a) * l, ey = sin(a) * l * 0.7 - 6;
      g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(cos(a) * l * 0.4, -9, ex, ey); g.stroke();
      g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(ex, ey, 0.8, 0, TAU); g.fill();
    }
    g.fillStyle = '#ff8a8a'; g.beginPath(); g.arc(0, -1, 1.4, 0, TAU); g.fill();
    g.restore();
  }
  const LILY = { base: '#2f2a22', dark: '#1e1c16', mid: '#3a3a26', light: '#4e4e2e', tip: '#6a5a34', warm: '#4a2a22' };
  def('lily_field', {
    size: 384, rank: 60, receive: true, anim: true, ledge: '#3a2a20', lip: ['#3a2a20', '#140c08'],
    paint: (g, r, s) => {
      paintGrass(LILY)(g, r, s);
      mottle(g, r, s, ['#5a1a1e', '#2a0e10'], 40, 20, 50, 0.15, 0.3);
      // fallen petals
      for (let i = 0; i < 160; i++) { const x = r() * s, y = r() * s; g.fillStyle = pick(r, ['#b0182a', '#d8283a', '#7a1020']); g.save(); g.translate(x, y); g.rotate(r() * TAU); g.fillRect(-2, -0.5, 4, 1.1); g.restore(); }
      const pts = [];
      for (let i = 0; i < 70; i++) pts.push([r() * s, r() * s, 0.85 + r() * 0.45]);
      pts.sort((a, b) => a[1] - b[1]);
      for (const p of pts) wrap(s, p[0], p[1], 20, (X, Y) => spiderLily(g, r, X, Y, p[2]));
    },
    soft: { D: 9, amp: 5, edge: '#1a1410', tuft: (g, r, x, y) => { if (r() < 0.35) spiderLily(g, r, x, y + 2, 0.7); else tuft(g, r, x, y, [LILY.dark, LILY.mid, LILY.light], 0.8); }, tuftP: 0.35 },
    live(ctx, px, py, cx, cy, t) {
      liveMotes(ctx, px, py, cx, cy, t, { n: 2, p: 0.3, seed: 401, speed: 0.12, rise: 44, a: 0.8, sz: 0.7, cols: ['#ff5a5a', '#ffb070', '#ff7a8a'] });
    },
  });
  // bioluminescent moss: stippled moss cushions; a glow layer (same patch layout) pulses
  const MOSS = (() => {
    const r = U.seeded(9137), out = [];
    for (let i = 0; i < 60; i++) out.push([r() * 384, r() * 384, 7 + r() * 15, r()]);
    return out;
  })();
  def('moss_glow', {
    size: 384, rank: 62, receive: true, anim: true, ledge: '#1a2420',
    paint: (g, r, s) => {
      g.fillStyle = '#141c19'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#0a100e', '#1e2c26', '#18262a', '#262618'], 90, 14, 50, 0.3, 0.6);
      grains(g, r, s, 1400, ['#2a3a2a', '#0a0e0c', '#3a3a2a'], 0.6, 1.3);
      for (const [x, y, rad, k] of MOSS) {
        const pal = k < 0.5 ? ['#244a3a', '#2f5e48', '#3b7456', '#58a070'] : ['#2a4a2a', '#3a6234', '#4e7e3e', '#78a858'];
        wrap(s, x, y, rad + 3, (X, Y) => {
          blob(g, X + 2, Y + 3, rad * 1.1, '#000000', 0.45);
          for (let q = 0; q < rad * rad * 1.6; q++) {
            const a = r() * TAU, d = Math.sqrt(r()) * rad, dx = cos(a) * d, dy = sin(a) * d * 0.7;
            const lit = (-dx - dy) / rad;   // top-left lighter
            g.fillStyle = pal[U.clamp(Math.round(1.5 + lit * 1.4 + (r() - 0.5)), 0, 3)];
            g.beginPath(); g.arc(X + dx, Y + dy, 0.7 + r() * 0.9, 0, TAU); g.fill();
          }
        });
      }
    },
    soft: { D: 8, amp: 5, edge: '#0c1210', tuft: (g, r, x, y) => tuft(g, r, x, y, ['#284a40', '#3b6a4a', '#5fd8a8'], 0.8), tuftP: 0.4 },
    layers(ctx, px, py, cx, cy, t) {
      const A = tex('moss_glow_l', 384, (g, r, s) => {
        for (const [x, y, rad, k] of MOSS) {
          const col = k < 0.5 ? '#5affd0' : '#b4ff6a';
          wrap(s, x, y, rad * 2, (X, Y) => {
            blob(g, X, Y, rad * 1.5, col, 0.1);
            for (let q = 0; q < rad * 1.4; q++) {
              const a = r() * TAU, d = Math.sqrt(r()) * rad, x2 = X + cos(a) * d, y2 = Y + sin(a) * d * 0.7;
              blob(g, x2, y2, 2.6, col, 0.45);
              g.fillStyle = '#f0fff8'; g.beginPath(); g.arc(x2, y2, 0.6 + r() * 0.5, 0, TAU); g.fill();
            }
          });
        }
      });
      layer(ctx, A, cx, cy, px, py, 0, 0, 0.3 + 0.7 * (0.5 + 0.5 * sin(t * 1.5)), 'lighter');
    },
    live(ctx, px, py, cx, cy, t) {
      liveMotes(ctx, px, py, cx, cy, t, { n: 2, p: 0.45, seed: 501, speed: 0.1, rise: 40, a: 0.9, sz: 0.55, cols: ['#9affe0', '#d8ff9a'] });
    },
  });
  // spirit floor: dark indigo with luminous flowing veins
  const spiritVeins = () => tex('spirit_veins', 256, (g, r, s) => {
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 9; i++) {
      let x = r() * s, y = r() * s, a = r() * TAU;
      const pts = [];
      for (let k = 0; k < 26; k++) { a += (r() - 0.5) * 0.28; x += cos(a) * 9; y += sin(a) * 9; pts.push([x, y]); }
      const mid = pts[13];
      const col = pick(r, [[150, 235, 255], [200, 180, 255], [170, 255, 230]]);
      wrap(s, mid[0], mid[1], 240, (X, Y) => {
        const ox = X - mid[0], oy = Y - mid[1];
        for (const [w, a2] of [[10, 0.05], [4, 0.14], [1.2, 0.75]]) {
          g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a2})`; g.lineWidth = w;
          g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
          for (let k = 1; k < pts.length - 1; k++) {
            const mx = (pts[k][0] + pts[k + 1][0]) / 2 + ox, my = (pts[k][1] + pts[k + 1][1]) / 2 + oy;
            g.quadraticCurveTo(pts[k][0] + ox, pts[k][1] + oy, mx, my);
          }
          g.stroke();
        }
      });
    }
  });
  def('spirit_floor', {
    size: 256, rank: 10, anim: true, ledge: '#2a3a6a',
    paint: (g, r, s) => {
      g.fillStyle = '#16203e'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#1d3460', '#26406e', '#13304a', '#2a2a5a', '#0e1830'], 70, 20, 70, 0.3, 0.6);
      // translucent rounded flagstones of light
      const n = 4, cw = s / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const x = i * cw + (j % 2) * cw / 2, y = j * cw;
        wrap(s, x + cw / 2, y + cw / 2, cw, (X, Y) => {
          g.strokeStyle = 'rgba(140,220,255,0.18)'; g.lineWidth = 1.2;
          g.beginPath(); g.roundRect(X - cw / 2 + 3, Y - cw / 2 + 3, cw - 6, cw - 6, 14); g.stroke();
          const gr = g.createRadialGradient(X - 10, Y - 10, 2, X, Y, cw * 0.6);
          gr.addColorStop(0, 'rgba(160,220,255,0.12)'); gr.addColorStop(1, 'rgba(160,220,255,0)');
          g.fillStyle = gr; g.beginPath(); g.roundRect(X - cw / 2 + 3, Y - cw / 2 + 3, cw - 6, cw - 6, 14); g.fill();
        });
      }
      for (let i = 0; i < 70; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 4, (X, Y) => star4(g, X, Y, 0.6 + r() * 0.8, '#d8f4ff', 0.6)); }
    },
    layers(ctx, px, py, cx, cy, t) {
      layer(ctx, spiritVeins(), cx, cy, px, py, sin(t * 0.3) * 6, cos(t * 0.25) * 6, 0.55 + 0.35 * sin(t * 1.2), 'lighter');
    },
    live(ctx, px, py, cx, cy, t) {
      liveMotes(ctx, px, py, cx, cy, t, { n: 2, p: 0.35, seed: 601, speed: 0.13, rise: 46, a: 0.9, sz: 0.6, cols: ['#9fe8ff', '#d8c8ff', '#ffffff'] });
    },
  });
  // cloud floor (dream)
  def('cloud', {
    size: 256, rank: 10, anim: true, ledge: '#9a90c0',
    paint: (g, r, s) => {
      g.fillStyle = '#d6d0ea'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#c4bce0', '#f0ecfa', '#e8d8e8', '#cfd8f0'], 40, 30, 70, 0.3, 0.6);
      const puffs = [];
      for (let i = 0; i < 150; i++) puffs.push([r() * s, r() * s, 9 + r() * 16]);
      puffs.sort((a, b) => a[1] - b[1]);
      for (const [x, y, rad] of puffs) {
        wrap(s, x, y, rad + 4, (X, Y) => {
          g.fillStyle = 'rgba(120,100,170,0.18)'; g.beginPath(); g.ellipse(X + 2, Y + 4, rad, rad * 0.75, 0, 0, TAU); g.fill();
          const gr = g.createRadialGradient(X - rad * 0.35, Y - rad * 0.4, rad * 0.1, X, Y, rad);
          gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#f1edf9'); gr.addColorStop(1, '#c9c0e2');
          g.fillStyle = gr; g.beginPath(); g.ellipse(X, Y, rad, rad * 0.78, 0, 0, TAU); g.fill();
        });
      }
      for (let i = 0; i < 40; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 4, (X, Y) => star4(g, X, Y, 0.6 + r() * 0.6, '#ffe6a8', 0.7)); }
    },
    layers(ctx, px, py, cx, cy, t) {
      layer(ctx, moteTex('cloud_wisp', ['#ffffff', '#fff2fa'], 9, 5, 9)(), cx, cy, px, py, t * 6, sin(t * 0.4) * 6, 0.45);
    },
  });
  // vision: serpent diamond lattice, hue-cycling via cross-faded frames, breathing line overlay
  const VK = 8;
  // luminous Shipibo-like linework on a dark ground: nested serpent diamonds, scale bands, eye dots
  function visionFrame(k) {
    return tex('vision' + k, 256, (g, r, s) => {
      const h0 = k * 360 / VK;
      const bg = g.createLinearGradient(0, 0, s, s);
      bg.addColorStop(0, hsl(h0 + 250, 60, 9)); bg.addColorStop(0.5, hsl(h0 + 290, 60, 12)); bg.addColorStop(1, hsl(h0 + 250, 60, 9));
      g.fillStyle = bg; g.fillRect(0, 0, s, s);
      const dia = (x, y, rr) => { g.beginPath(); g.moveTo(x, y - rr); g.lineTo(x + rr, y); g.lineTo(x, y + rr); g.lineTo(x - rr, y); g.closePath(); };
      const glowStroke = (col, w) => {
        g.strokeStyle = col.replace(/[\d.]+\)$/, '0.18)'); g.lineWidth = w * 4; g.stroke();
        g.strokeStyle = col; g.lineWidth = w; g.stroke();
      };
      const centres = [];
      for (let j = -1; j <= 4; j++) for (let i = -1; i <= 4; i++) { centres.push([i * 64, j * 64, 0]); centres.push([i * 64 + 32, j * 64 + 32, 1]); }
      for (const [x, y, set] of centres) {
        // body of the serpent diamond
        const gr = g.createRadialGradient(x, y, 2, x, y, 32);
        gr.addColorStop(0, hsl(h0 + (set ? 160 : 20), 80, set ? 26 : 20)); gr.addColorStop(1, hsl(h0 + (set ? 200 : 300), 70, 8));
        dia(x, y, 30); g.fillStyle = gr; g.fill();
        for (let L = 0; L < 4; L++) {
          dia(x, y, 27 - L * 6.5);
          glowStroke(hsl(h0 + (set ? 140 : 0) + L * 28, 95, 62 + L * 6, 0.9), L === 0 ? 1.6 : 1.1);
        }
        // eye
        dia(x, y, 4.5); g.fillStyle = hsl(h0 + (set ? 60 : 200), 100, 75); g.fill();
        g.fillStyle = hsl(h0 + 20, 80, 10); g.beginPath(); g.ellipse(x, y, 1, 3, 0, 0, TAU); g.fill();
      }
      // serpent scale bands along the seams
      for (let j = -1; j <= 8; j++) for (let i = -1; i <= 8; i++) {
        const x = i * 32 + 16, y = j * 32;
        g.strokeStyle = hsl(h0 + 90, 90, 70, 0.45); g.lineWidth = 0.9;
        g.beginPath(); g.arc(x, y + 16, 4, PI * 1.1, PI * 1.9); g.stroke();
      }
      // two cloud-serpents winding diagonally across the lattice (seamless: integer periods)
      for (const [off, hue] of [[0, 40], [128, 200]]) {
        const P = (u) => [u, mod(u + off + 22 * sin((u / s) * TAU * 2), s)];
        for (const [w, a, l] of [[16, 0.25, 30], [11, 0.9, 40], [7, 0.9, 60]]) {
          g.strokeStyle = hsl(h0 + hue, 90, l, a); g.lineWidth = w; g.lineCap = 'round';
          for (const dy of [-s, 0, s]) {
            g.beginPath();
            for (let u = -8; u <= s + 8; u += 4) { const q = P(u); const yy = u + off + 22 * sin((u / s) * TAU * 2) + dy; if (u > -8) g.lineTo(q[0], yy); else g.moveTo(q[0], yy); }
            g.stroke();
          }
        }
        // scales
        for (let u = 0; u < s; u += 9) {
          const yy = u + off + 22 * sin((u / s) * TAU * 2);
          for (const dy of [-s, 0, s]) {
            g.fillStyle = hsl(h0 + hue + 180, 95, 75, 0.85);
            g.beginPath(); g.moveTo(u, yy + dy - 3); g.lineTo(u + 3, yy + dy); g.lineTo(u, yy + dy + 3); g.lineTo(u - 3, yy + dy); g.closePath(); g.fill();
          }
        }
      }
      // dots on lattice vertices
      for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
        const x = i * 32, y = j * 32 + (i % 2 ? 0 : 0);
        g.fillStyle = hsl(h0 + 40 + (i + j) * 20, 100, 85); g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
      }
      void r;
    });
  }
  // breathing overlay: soft concentric diamond pulses at a coarser lattice
  const visionLines = () => tex('vision_lines', 256, (g, r, s) => {
    g.lineCap = 'round';
    for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
      for (const [x, y] of [[i * 128, j * 128], [i * 128 + 64, j * 128 + 64]]) {
        for (let L = 1; L <= 5; L++) {
          const rr = L * 12;
          g.beginPath(); g.moveTo(x, y - rr); g.lineTo(x + rr, y); g.lineTo(x, y + rr); g.lineTo(x - rr, y); g.closePath();
          g.strokeStyle = `rgba(255,245,220,${0.06 + 0.05 * (L % 2)})`; g.lineWidth = 5; g.stroke();
          g.strokeStyle = `rgba(255,250,235,${0.22 + 0.1 * (L % 2)})`; g.lineWidth = 0.9; g.stroke();
        }
        blob(g, x, y, 16, '#fff2d0', 0.35);
      }
    }
    void r;
  });
  // hold each frame for half its interval, then blend to the next (≈1.5 blits per cell on average)
  function crossfade(ctx, frames, cx, cy, px, py, f) {
    const K = frames.length, i = Math.floor(f) % K, fr = U.ease.inOutQuad(U.clamp((f - Math.floor(f) - 0.5) * 2, 0, 1));
    blitCell(ctx, frames[i](), cx, cy, px, py);
    if (fr > 0.02) {
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * fr;
      blitCell(ctx, frames[(i + 1) % K](), cx, cy, px, py);
      ctx.globalAlpha = ga;
    }
  }
  const visionFrames = [];
  for (let k = 0; k < VK; k++) visionFrames.push(() => visionFrame(k));
  def('vision', {
    anim: true, rank: 10, ledge: '#3a1a5a',
    base(ctx, px, py, cx, cy, t) {
      crossfade(ctx, visionFrames, cx, cy, px, py, t * 0.7);
      layer(ctx, visionLines(), cx, cy, px, py, sin(t * 0.5) * 10, cos(t * 0.4) * 10, 0.4 + 0.4 * sin(t * 1.3), 'lighter');
    },
  });
  // breath (一息界): kaleidoscope jewel mandalas
  function mandala(g, x, y, R, h0, rot, sym) {
    for (let k = 0; k < sym; k++) {
      g.save(); g.translate(x, y); g.rotate(rot + k * TAU / sym);
      const w = PI / sym;
      // outer petal facet
      let gr = g.createLinearGradient(0, 0, R, 0);
      gr.addColorStop(0, hsl(h0 + k % 2 * 40, 90, 70)); gr.addColorStop(1, hsl(h0 + 120, 85, 30));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(R * 0.35, 0); g.lineTo(R * 0.7, -R * sin(w) * 0.7); g.lineTo(R, 0); g.lineTo(R * 0.7, R * sin(w) * 0.7); g.closePath(); g.fill();
      g.strokeStyle = hsl(h0 + 50, 100, 85, 0.8); g.lineWidth = 0.8; g.stroke();
      // inner jewel
      gr = g.createLinearGradient(0, -R * 0.2, R * 0.4, R * 0.2);
      gr.addColorStop(0, hsl(h0 + 200, 100, 80)); gr.addColorStop(1, hsl(h0 + 260, 90, 35));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(R * 0.08, 0); g.lineTo(R * 0.25, -R * 0.12); g.lineTo(R * 0.4, 0); g.lineTo(R * 0.25, R * 0.12); g.closePath(); g.fill();
      g.fillStyle = hsl(h0 + 300, 100, 90, 0.9); g.beginPath(); g.arc(R * 0.62, 0, R * 0.04, 0, TAU); g.fill();
      g.restore();
    }
    g.strokeStyle = hsl(h0 + 40, 100, 80, 0.7); g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, R * 0.36, 0, TAU); g.stroke();
    g.beginPath(); g.arc(x, y, R * 0.98, 0, TAU); g.stroke();
    const gr = g.createRadialGradient(x, y, 0, x, y, R * 0.12);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, hsl(h0 + 180, 100, 60));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R * 0.1, 0, TAU); g.fill();
  }
  const BK = 8;
  function breathFrame(k) {
    return tex('breath' + k, 256, (g, r, s) => {
      const h0 = k * 360 / BK;
      const bg = g.createLinearGradient(0, 0, s, s);
      bg.addColorStop(0, hsl(h0 + 230, 70, 14)); bg.addColorStop(1, hsl(h0 + 290, 70, 18));
      g.fillStyle = bg; g.fillRect(0, 0, s, s);
      // secondary mandalas at lattice corners (wrapped), primary at centres
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) mandala(g, i * 128, j * 128, 40, h0 + 140, -k * (PI / 6) / BK, 8);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) mandala(g, i * 128 + 64, j * 128 + 64, 62, h0, k * (PI / 6) / BK, 12);
      // gold filigree diamonds between
      g.strokeStyle = hsl(h0 + 45, 90, 70, 0.55); g.lineWidth = 1;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        for (const [x, y] of [[i * 128 + 64, j * 128], [i * 128, j * 128 + 64]]) {
          wrap(s, x, y, 20, (X, Y) => { g.beginPath(); g.moveTo(X, Y - 14); g.lineTo(X + 9, Y); g.lineTo(X, Y + 14); g.lineTo(X - 9, Y); g.closePath(); g.stroke(); blob(g, X, Y, 6, '#ffffff', 0.5); });
        }
      }
      void r;
    });
  }
  const breathFrames = [];
  for (let k = 0; k < BK; k++) breathFrames.push(() => breathFrame(k));
  const breathGlow = () => tex('breath_glow', 256, (g, r, s) => {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) blob(g, i * 128 + 64, j * 128 + 64, 40, '#fff6d8', 0.55);
    for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) blob(g, i * 128, j * 128, 24, '#d8f0ff', 0.5);
    for (let i = 0; i < 50; i++) { const x = r() * s, y = r() * s; wrap(s, x, y, 5, (X, Y) => star4(g, X, Y, 0.8 + r(), '#ffffff', 0.9)); }
  });
  def('breath', {
    anim: true, rank: 10, ledge: '#4a2a7a',
    base(ctx, px, py, cx, cy, t) {
      crossfade(ctx, breathFrames, cx, cy, px, py, t * 1.4);
      layer(ctx, breathGlow(), cx, cy, px, py, 0, 0, 0.3 + 0.35 * (0.5 + 0.5 * sin(t * 1.1)), 'lighter');
    },
  });
  // lantern bridge: rough planks over the black sea, small floating lanterns
  const lanternSprite = () => sprite('lantern_small', 28, 40, (g) => {
    blob(g, 14, 16, 14, '#ffb050', 0.35);
    g.fillStyle = 'rgba(255,170,80,0.25)'; g.fillRect(12.5, 26, 3, 12);
    const gr = g.createRadialGradient(12, 13, 1, 14, 16, 7);
    gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.5, '#ff9a48'); gr.addColorStop(1, '#c2361e');
    g.fillStyle = gr; g.beginPath(); g.ellipse(14, 16, 5.5, 7, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,20,10,0.6)'; g.lineWidth = 0.6;
    for (const dx of [-2.5, 0, 2.5]) { g.beginPath(); g.ellipse(14, 16, Math.abs(dx) + 0.5, 7, 0, 0, TAU); g.stroke(); }
    g.fillStyle = '#3a2216'; g.fillRect(11, 8.2, 6, 1.6); g.fillRect(11, 22.4, 6, 1.6);
  });
  def('lantern_bridge', {
    anim: true, rank: 10,
    base(ctx, px, py, cx, cy, t, n) {
      blackSeaBase(ctx, px, py, cx, cy, t);
      // arms toward neighbouring lantern_bridge cells; a bridge end also reaches onto the land opposite it
      const land = (i) => !WATERS.has(n[i]) && !isFace(n[i]) && n[i] !== 'void' && n[i] !== 'lantern_bridge';
      const bits = [0, 2, 4, 6].map((i) => n[i] === 'lantern_bridge');
      const cnt = bits.filter((b) => b).length;
      if (cnt === 1) { const k = bits.indexOf(true), o = (k + 2) % 4; if (land(o * 2)) bits[o] = true; }
      else if (cnt === 0) { for (let k = 0; k < 4; k++) bits[k] = land(k * 2); }
      if (!bits.some((b) => b)) bits[1] = bits[3] = true;
      const key = 'LB' + bits.map((b) => (b ? 1 : 0)).join('') + mod(cx * 3 + cy, 4);
      const o = ovl(key, (r) => canvas(T, T, (g) => {
        const board = (x, y, w, h, vert) => {
          const col = pick(r, ['#5a4636', '#4e3c2e', '#64503c', '#463428']);
          g.save(); g.translate(x + w / 2, y + h / 2); g.rotate((r() - 0.5) * 0.08);
          g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-w / 2 + 1.5, -h / 2 + 2.5, w, h);
          const gr = vert ? g.createLinearGradient(-w / 2, 0, w / 2, 0) : g.createLinearGradient(0, -h / 2, 0, h / 2);
          gr.addColorStop(0, shade(col, 0.18)); gr.addColorStop(1, shade(col, -0.25));
          g.fillStyle = gr; g.fillRect(-w / 2, -h / 2, w, h);
          g.strokeStyle = 'rgba(20,10,5,0.5)'; g.lineWidth = 0.6;
          g.beginPath(); if (vert) { g.moveTo(-1, -h / 2 + 2); g.lineTo(-1, h / 2 - 2); } else { g.moveTo(-w / 2 + 2, 0); g.lineTo(w / 2 - 2, 0); } g.stroke();
          g.restore();
        };
        const W0 = 18, W1 = 46;
        // vertical arms (boards laid horizontally)
        for (let y = 0; y < T; y += 7) {
          const inN = y < W0 && bits[0], inS = y >= W1 - 4 && bits[2], mid = y >= W0 - 6 && y < W1;
          if (inN || inS || mid) board(W0 - 1 + (r() - 0.5) * 2, y, W1 - W0 + 2 + (r() - 0.5) * 3, 6, false);
        }
        // horizontal arms (boards laid vertically)
        for (let x = 0; x < T; x += 7) {
          const inW = x < W0 && bits[3], inE = x >= W1 - 4 && bits[1];
          if (inW || inE) board(x, W0 - 1 + (r() - 0.5) * 2, 6, W1 - W0 + 2 + (r() - 0.5) * 3, true);
        }
        // rope rails with little posts
        g.strokeStyle = 'rgba(200,170,120,0.55)'; g.lineWidth = 1;
        const post = (x, y) => { g.fillStyle = '#2a1c12'; g.fillRect(x - 1.5, y - 7, 3, 8); g.fillStyle = '#6a5038'; g.fillRect(x - 1.5, y - 7, 1, 8); };
        if (bits[0] || bits[2]) {
          for (const x of [W0 - 2, W1 + 2]) {
            g.beginPath(); g.moveTo(x, bits[0] ? 0 : W0); g.quadraticCurveTo(x, 32, x, bits[2] ? T : W1); g.stroke();
          }
        }
        if (bits[0] && bits[2] && !bits[1] && !bits[3]) { post(W0 - 2, 34); post(W1 + 2, 34); }
        if (bits[1] && bits[3] && !bits[0] && !bits[2]) { post(32, W0 - 1); post(32, W1 + 3); }
      }));
      ctx.drawImage(o, px, py, T, T);
    },
    live(ctx, px, py, cx, cy, t) {
      const h = U.hash(cx, cy, 77);
      if (h > 0.6) return;
      const corner = [[9, 10], [55, 12], [10, 54], [54, 55]][(U.hash(cx, cy, 78) * 4) | 0];
      const bob = sin(t * 1.6 + h * 20) * 2;
      const s = lanternSprite();
      ctx.drawImage(s, px + corner[0] - 14, py + corner[1] - 20 + bob, 28, 40);
    },
  });

  // field_rice: flooded paddy with seedling rows, sky reflection shimmer, earthen ridges (田埂) at borders
  const paintRiceSeed = (g, r, s) => {
    for (let j = 0; j < s / 16; j++) for (let i = 0; i < s / 16; i++) {
      const x = i * 16 + 8 + (r() - 0.5) * 2, y = j * 16 + 10 + (r() - 0.5) * 2;
      g.fillStyle = 'rgba(30,50,40,0.25)'; g.beginPath(); g.ellipse(x + 1, y + 1, 4, 1.4, 0, 0, TAU); g.fill();
      // reflection
      g.strokeStyle = 'rgba(60,100,60,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + 1, y + 6); g.stroke();
      const nb = 6 + (r() * 3 | 0);
      g.lineCap = 'round';
      for (let k = 0; k < nb; k++) {
        const a = -PI / 2 + (k / (nb - 1) - 0.5) * 1.5 + (r() - 0.5) * 0.2, l = 6 + r() * 4;
        g.strokeStyle = pick(r, ['#4f8a34', '#6aa844', '#86c25a', '#3e7a2c']); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + cos(a) * l * 0.3, y + sin(a) * l * 0.7, x + cos(a) * l, y + sin(a) * l); g.stroke();
      }
    }
  };
  const riceShimmer = hlTex('rice_hl', 256, { n: 0, r0: 1, r1: 2, col: '#ffffff', a: 0.5, sparkle: 10, streak: 40 });
  def('field_rice', {
    size: 256, rank: 26, solid: true, anim: true, receive: false, ledge: '#6a5a3a', lip: ['#7a6040', '#2e2418'],
    paint: (g, r, s) => {
      const gr = g.createLinearGradient(0, 0, s, s);
      gr.addColorStop(0, '#a8c6cc'); gr.addColorStop(0.5, '#93b4bc'); gr.addColorStop(1, '#a3bfc2');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#c2dade', '#7f9fa6', '#8a8a6a', '#b4cfd0'], 50, 20, 60, 0.25, 0.45);
      grains(g, r, s, 500, ['#6a6a50', '#ffffff'], 0.3, 1.2);
      paintRiceSeed(g, r, s);
    },
    layers(ctx, px, py, cx, cy, t) {
      layer(ctx, riceShimmer(), cx, cy, px, py, t * 6, sin(t * 0.5) * 4, 0.5 + 0.2 * sin(t * 0.9));
    },
    always: false,
    edges(g, n, r) {
      // earthen ridges along borders with other terrain
      for (const s of [0, 2, 4, 6]) {
        if (n[s] === 'field_rice') continue;
        g.save(); g.translate(T / 2, T / 2); g.rotate((s / 2) * PI / 2); g.translate(-T / 2, -T / 2);
        const gr = g.createLinearGradient(0, 0, 0, 10);
        gr.addColorStop(0, '#8a7048'); gr.addColorStop(0.6, '#6e5634'); gr.addColorStop(1, '#4a3a22');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(T, 0);
        for (let x = T; x >= 0; x -= 8) g.lineTo(x, 8 + sin(x * 0.3 + s) * 1.2);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(20,30,30,0.35)'; g.fillRect(0, 8.5, T, 2.5);
        for (let x = 4; x < T; x += 7 + r() * 6) tuft(g, r, x, 6 + r() * 2, ['#3f6b2d', '#5f9a44', '#8dbb5a'], 0.55);
        g.restore();
      }
    },
  });

  // =================================================================================================
  // WALLS
  function wall(id, o) {
    const d = def(id, Object.assign({ kind: 'wall', wall: true, solid: true, face: true }, o));
    d.topTex = () => tex(id + '_top', o.topSize || 256, o.paintTop);
    d.faceTex = () => strip(id + '_face', o.faceSize || 256, T - CAP, o.paintFace);
    return d;
  }
  // strata rock face
  function rockFace(o) {
    return (g, r, s, h) => {
      g.fillStyle = o.base; g.fillRect(0, 0, s, h);
      // horizontal strata bands
      let y = 0;
      while (y < h) {
        const bh = 6 + r() * 10, col = pick(r, o.cols);
        g.fillStyle = col; g.fillRect(0, y, s, bh);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, y, s, 1.2);
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + bh - 1.2, s, 1.2);
        y += bh;
      }
      // blocky boulders with lit tops
      for (let i = 0; i < o.n; i++) {
        const x = r() * s, yy = r() * h, w = 10 + r() * 22, hh = 8 + r() * 14, col = pick(r, o.cols);
        wrapX(s, x, w, (X) => {
          const pts = [[X - w / 2, yy - hh / 2 + r() * 3], [X + w / 2 - r() * 3, yy - hh / 2], [X + w / 2, yy + hh / 2], [X - w / 2 + r() * 3, yy + hh / 2]];
          slab(g, r, pts, col, { sh: 0.45, hi: 0.2, lo: -0.3, rimA: 0.3, tex: speckIn(r, 10, o.speck, 0.4) });
        });
      }
      for (let i = 0; i < o.cracks; i++) {
        const x = r() * s;
        wrapX(s, x, 10, (X) => { g.strokeStyle = 'rgba(10,8,6,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X, 0); let yy = 0, xx = X; while (yy < h) { yy += 4 + r() * 6; xx += (r() - 0.5) * 5; g.lineTo(xx, yy); } g.stroke(); });
      }
      // vertical darkening toward the base
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,240,220,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
    };
  }
  // natural rock: overlapping irregular, vertically elongated facets (back to front), ledges and fissures
  function rockFacets(o) {
    return (g, r, s, h) => {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, o.gap[0]); bg.addColorStop(1, o.gap[1]);
      g.fillStyle = bg; g.fillRect(0, 0, s, h);
      const list = [];
      for (let i = 0; i < o.n; i++) list.push([r() * s, -6 + r() * (h + 4), lerp(o.w0, o.w1, r()), lerp(o.h0, o.h1, r()), pick(r, o.cols)]);
      list.sort((a, b) => a[1] - b[1]);
      for (const [x, y, w, hh, col] of list) {
        const np = 5 + ((r() * 2) | 0), pts = [];
        for (let k = 0; k < np; k++) {
          const a = -PI / 2 + k * TAU / np + (r() - 0.5) * 0.5;
          pts.push([cos(a) * w * (0.75 + r() * 0.35), sin(a) * hh * (0.75 + r() * 0.3)]);
        }
        const tilt = (r() - 0.5) * 0.25;
        wrapX(s, x, w + 2, (X) => {
          const sh = pts.map((q) => [X + q[0] + q[1] * tilt, y + q[1]]);
          slab(g, r, sh, col, { round: 0.22, sh: 0.55, hi: 0.22, lo: -0.38, rimA: 0.34, rimD: 0.45, outA: 0.6, tex: (gg, a0, b0, a1, b1) => {
            // lit upper facet
            const tg = gg.createLinearGradient(0, b0, 0, b0 + (b1 - b0) * 0.35);
            tg.addColorStop(0, rgba(shade(col, 0.45), 0.55)); tg.addColorStop(1, rgba(shade(col, 0.45), 0));
            gg.fillStyle = tg; gg.fillRect(a0, b0, a1 - a0, (b1 - b0) * 0.35);
            speckIn(r, 18, o.speck, 0.4)(gg, a0, b0, a1, b1);
            if (r() < 0.5) { gg.strokeStyle = 'rgba(0,0,0,0.4)'; gg.lineWidth = 0.9; gg.beginPath(); const c0 = lerp(a0, a1, 0.3 + r() * 0.4); gg.moveTo(c0, b0); gg.lineTo(c0 + (r() - 0.5) * 5, lerp(b0, b1, 0.5)); gg.lineTo(c0 + (r() - 0.5) * 8, b1); gg.stroke(); }
          } });
        });
      }
      if (o.moss) for (let i = 0; i < 22; i++) { const x = r() * s, yy = r() * h; wrapX(s, x, 6, (X) => blob(g, X, yy, 2 + r() * 3, pick(r, o.moss), 0.75)); }
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,240,220,0.08)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,6,4,0.45)');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
    };
  }
  wall('cliff', {
    rim: ['#a39a86', '#2a241c'], rimN: false,
    topSize: 384,
    paintTop: (g, r, s) => paintGrass(GRASS)(g, r, s),
    paintFace: rockFacets({ gap: ['#4a4036', '#241c14'], n: 64, w0: 11, w1: 21, h0: 11, h1: 22, cols: ['#7a6c5a', '#6e6252', '#837562', '#6a5e4e', '#8a7c68', '#75706a', '#5f5548'], speck: ['#3a3228', '#c0b098'], moss: ['#4f6e34', '#3e5a2c'] }),
    faceExtra(g, r) {
      // grass overhanging the lip, a few hanging vines
      for (let x = 1; x < T; x += 3 + r() * 4) {
        g.strokeStyle = pick(r, ['#335f2a', '#4f8a3c', '#6aa04a', '#86b85a']); g.lineWidth = 1.5; g.lineCap = 'round';
        const l = 3 + r() * 7;
        g.beginPath(); g.moveTo(x, CAP - 4); g.quadraticCurveTo(x + 1.5, CAP + l * 0.4, x + (r() - 0.5) * 3, CAP + l); g.stroke();
      }
      if (r() < 0.55) {
        const x = 8 + r() * 48, l = 18 + r() * 26;
        g.strokeStyle = '#2f5a24'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x, CAP); g.bezierCurveTo(x + 4, CAP + l * 0.3, x - 4, CAP + l * 0.7, x + 1, CAP + l); g.stroke();
        for (let k = 0; k < 7; k++) {
          const yy = CAP + 3 + k * l / 7;
          g.fillStyle = k % 2 ? '#5a9a3a' : '#467e30';
          g.beginPath(); g.ellipse(x + (k % 2 ? 2.6 : -2.6), yy, 2.4, 1.3, k % 2 ? 0.6 : -0.6, 0, TAU); g.fill();
        }
      }
    },
  });
  D.cliff.topTex = () => D.grass.tx();
  wall('cave_wall', {
    rim: ['#5a524a', '#120e0c'],
    paintTop: (g, r, s) => {
      g.fillStyle = '#211d1a'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#141110', '#2e2925', '#1a1614', '#33302c'], 80, 10, 40, 0.4, 0.7);
      for (let i = 0; i < 50; i++) {
        const x = r() * s, y = r() * s, rad = 5 + r() * 12;
        wrap(s, x, y, rad, (X, Y) => { const gr = g.createRadialGradient(X - rad * 0.4, Y - rad * 0.4, 0, X, Y, rad); gr.addColorStop(0, 'rgba(90,80,70,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(X, Y, rad, 0, TAU); g.fill(); });
      }
    },
    paintFace: (g, r, s, h) => {
      g.fillStyle = '#3a332e'; g.fillRect(0, 0, s, h);
      for (let i = 0; i < 70; i++) {
        const x = r() * s, y = r() * h, rad = 6 + r() * 12;
        const col = pick(r, ['#4a423b', '#3f3832', '#554c44', '#36302b']);
        wrapX(s, x, rad + 2, (X) => {
          const pts = []; for (let k = 0; k < 7; k++) { const a = k * TAU / 7 + r() * 0.5; pts.push([X + cos(a) * rad, y + sin(a) * rad * 0.85]); }
          slab(g, r, pts, col, { sh: 0.5, hi: 0.22, lo: -0.35, rimA: 0.25, rimD: 0.35, tex: speckIn(r, 8, ['#1e1a17', '#8a8070'], 0.4) });
        });
      }
      // mineral glints & damp streaks
      for (let i = 0; i < 26; i++) { g.fillStyle = pick(r, ['rgba(160,220,255,0.8)', 'rgba(255,220,140,0.7)']); g.fillRect(r() * s, r() * h, 1.2, 1.2); }
      for (let i = 0; i < 10; i++) { const x = r() * s; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(20,30,40,0)'); gr.addColorStop(1, 'rgba(20,30,40,0.4)'); g.fillStyle = gr; g.fillRect(x, 0, 2 + r() * 3, h); }
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, s, h);
    },
  });
  const ceilTop = (base, cols, trim) => (g, r, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    mottle(g, r, s, cols, 40, 20, 60, 0.3, 0.5);
    // subtle beam pattern
    for (let y = 0; y < s; y += 32) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, s, 1.5); g.fillStyle = rgba(trim, 0.08); g.fillRect(0, y + 1.5, s, 1); }
    for (let i = 0; i < 40; i++) { const y = r() * s; g.strokeStyle = 'rgba(255,230,200,0.04)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (r() - 0.5) * 3); g.stroke(); }
  };
  wall('wall_plaster', {
    rim: ['#8a6440', '#1e140c'], rimW: 3.5,
    paintTop: ceilTop('#33271f', ['#2a1f18', '#3d2f25'], '#ffcc99'),
    paintFace: (g, r, s, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#ece3d2'); gr.addColorStop(1, '#d6cab4');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
      mottle(g, r, s, ['#c8b89c', '#f6f0e4', '#b8a888'], 30, 6, 22, 0.15, 0.3, 0.6);
      grains(g, r, s, 600, ['#a89878', '#ffffff'], 0.35, 1);
      // water stains & hairline cracks
      for (let i = 0; i < 5; i++) { const x = r() * s; const sg = g.createLinearGradient(0, h * 0.4, 0, h); sg.addColorStop(0, 'rgba(150,130,90,0)'); sg.addColorStop(1, 'rgba(150,130,90,0.25)'); g.fillStyle = sg; g.fillRect(x, h * 0.4, 6 + r() * 10, h * 0.6); }
      for (let i = 0; i < 4; i++) crack(g, r, r() * s, 6 + r() * (h - 16), 4, '#8a7a60', 0.45, 0.7);
      // lintel beam & wooden skirting
      g.fillStyle = '#6a4a30'; g.fillRect(0, 0, s, 5);
      g.fillStyle = '#8a6440'; g.fillRect(0, 0, s, 1.4);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 5, s, 2);
      g.fillStyle = '#5a3c26'; g.fillRect(0, h - 8, s, 8);
      g.fillStyle = '#7e5638'; g.fillRect(0, h - 8, s, 1.4);
      // timber posts every 2 cells
      for (let x = 0; x < s; x += 128) {
        wrapX(s, x, 8, (X) => {
          const pg = g.createLinearGradient(X - 4, 0, X + 4, 0);
          pg.addColorStop(0, '#8a6440'); pg.addColorStop(1, '#4e3420');
          g.fillStyle = pg; g.fillRect(X - 4, 0, 8, h);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X + 4, 0, 2, h);
        });
      }
    },
  });
  function brickFace(o) {
    return (g, r, s, h) => {
      g.fillStyle = o.mortar; g.fillRect(0, 0, s, h);
      const rh = o.rh, top = o.top || 0;
      for (let j = 0; j * rh + top < h - (o.base || 0); j++) {
        const y = top + j * rh, off = (j % 2) * o.bw / 2;
        for (let x = -o.bw + off; x < s + o.bw; x += o.bw) {
          const col = r() < 0.06 ? shade(pick(r, o.cols), -0.3) : pick(r, o.cols);
          const xx = mod(x, s);
          wrapX(s, xx, o.bw, (X) => slab(g, r, [[X + 0.8, y + 0.8], [X + o.bw - 0.8, y + 0.8], [X + o.bw - 0.8, y + rh - 0.8], [X + 0.8, y + rh - 0.8]], col, { sharp: true, sh: 0.25, rimA: 0.22, tex: speckIn(r, 5, o.speck, 0.4) }));
        }
      }
      if (o.base) {
        // granite plinth
        const y = h - o.base;
        for (let x = 0; x < s; x += 32) {
          wrapX(s, x, 32, (X) => slab(g, r, [[X + 0.8, y + 0.8], [X + 31.2, y + 0.8], [X + 31.2, h], [X + 0.8, h]], pick(r, ['#8a8a84', '#7e7f7a', '#94928a']), { sharp: true, sh: 0.2, tex: speckIn(r, 14, ['#555', '#ccc'], 0.4) }));
        }
      }
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,230,200,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
    };
  }
  wall('wall_brick', {
    rim: ['#7d8a80', '#1e2220'], rimW: 3.5,
    paintTop: (g, r, s) => {
      // coping of grey-green roof tiles seen from above
      g.fillStyle = '#4a524c'; g.fillRect(0, 0, s, s);
      for (let j = 0; j < s / 8; j++) for (let i = 0; i < s / 16; i++) {
        const x = i * 16 + (j % 2) * 8, y = j * 8;
        wrapX(s, x, 16, (X) => {
          const gr = g.createLinearGradient(0, y, 0, y + 8);
          gr.addColorStop(0, '#6e7a70'); gr.addColorStop(1, '#3e4640');
          g.fillStyle = gr; g.beginPath(); g.ellipse(X + 8, y + 4, 7.5, 4.2, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.ellipse(X + 6, y + 2.5, 4, 1.4, 0, 0, TAU); g.fill();
        });
      }
      mottle(g, r, s, ['#2a302a', '#8a9a8a'], 20, 20, 60, 0.1, 0.2);
    },
    paintFace: brickFace({ mortar: '#cbbaa2', rh: 8, bw: 24, cols: ['#b4553c', '#a84a34', '#bf6246', '#9c4430', '#c46a4c'], speck: ['#6b2e20', '#e09a7e'], base: 10 }),
  });
  wall('wall_wood', {
    rim: ['#7a5636', '#160e08'], rimW: 3.5,
    paintTop: ceilTop('#2e221a', ['#241a14', '#3a2b20'], '#ffcc99'),
    paintFace: (g, r, s, h) => {
      g.fillStyle = '#2a1a10'; g.fillRect(0, 0, s, h);
      for (let x = 0; x < s; x += 12.8) {
        const col = pick(r, ['#7a5434', '#6e4a2e', '#845c3a', '#6a4428']);
        const gr = g.createLinearGradient(x, 0, x + 12.8, 0);
        gr.addColorStop(0, shade(col, 0.15)); gr.addColorStop(1, shade(col, -0.2));
        g.fillStyle = gr; g.fillRect(x + 0.6, 0, 11.6, h);
        g.strokeStyle = rgba(shade(col, -0.4), 0.45); g.lineWidth = 0.6;
        for (let k = 0; k < 3; k++) { const xx = x + 2 + r() * 9; g.beginPath(); g.moveTo(xx, 0); for (let y = 0; y <= h; y += 6) g.lineTo(xx + sin(y * 0.1 + k) * 0.8, y); g.stroke(); }
        if (r() < 0.3) { g.strokeStyle = rgba(shade(col, -0.5), 0.6); g.beginPath(); g.ellipse(x + 6, 10 + r() * (h - 20), 1.6, 3, 0, 0, TAU); g.stroke(); }
      }
      for (const y of [8, h - 12]) {
        g.fillStyle = '#5a3c24'; g.fillRect(0, y, s, 5);
        g.fillStyle = 'rgba(255,220,170,0.25)'; g.fillRect(0, y, s, 1);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 5, s, 1.5);
      }
    },
  });
  wall('wall_temple', {
    rim: ['#c9a04a', '#2a0a08'], rimW: 3.5,
    paintTop: (g, r, s) => {
      g.fillStyle = '#3a1614'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#2a0e0c', '#4a1c18'], 40, 20, 50, 0.3, 0.5);
      g.strokeStyle = 'rgba(214,170,80,0.12)'; g.lineWidth = 1;
      for (let y = 16; y < s; y += 32) for (let x = 16; x < s; x += 32) { g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke(); }
    },
    paintFace: (g, r, s, h) => {
      // painted frieze band, red lacquer panels with gold frames, dark stone base
      const fz = 10;
      const fg = g.createLinearGradient(0, 0, 0, fz);
      fg.addColorStop(0, '#2e6a6a'); fg.addColorStop(1, '#1e4a52');
      g.fillStyle = fg; g.fillRect(0, 0, s, fz);
      for (let x = 0; x < s; x += 16) {
        g.strokeStyle = '#d8b25a'; g.lineWidth = 1;
        g.beginPath(); g.arc(x + 8, fz / 2, 3, 0, TAU); g.stroke();
        g.fillStyle = '#e8d8a8'; g.beginPath(); g.arc(x + 8, fz / 2, 1, 0, TAU); g.fill();
        g.strokeStyle = '#3a8a7a'; g.beginPath(); g.moveTo(x, fz / 2); g.lineTo(x + 4, fz / 2); g.stroke();
      }
      g.fillStyle = '#c9a04a'; g.fillRect(0, fz, s, 1.5);
      const py0 = fz + 1.5, ph = h - py0 - 9;
      const lg = g.createLinearGradient(0, py0, 0, py0 + ph);
      lg.addColorStop(0, '#a62c22'); lg.addColorStop(1, '#7e1c16');
      g.fillStyle = lg; g.fillRect(0, py0, s, ph);
      for (let x = 0; x < s; x += 32) {
        g.strokeStyle = '#d8b25a'; g.lineWidth = 1.2;
        g.strokeRect(x + 4, py0 + 3.5, 24, ph - 7);
        g.strokeStyle = 'rgba(255,220,150,0.35)'; g.lineWidth = 0.7;
        g.strokeRect(x + 6.5, py0 + 6, 19, ph - 12);
        // little gold medallion
        g.fillStyle = 'rgba(216,178,90,0.85)'; g.beginPath(); g.arc(x + 16, py0 + ph / 2, 2.4, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,200,170,0.12)'; g.fillRect(0, py0, s, 2);
      // stone base
      g.fillStyle = '#4a4a46'; g.fillRect(0, h - 9, s, 9);
      g.fillStyle = '#6a6a64'; g.fillRect(0, h - 9, s, 1.5);
      for (let x = 0; x < s; x += 32) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, h - 9, 1, 9); }
    },
  });
  // hedge
  function leaves(g, r, s, h, n, cols, lit) {
    for (let i = 0; i < n; i++) {
      const x = r() * s, y = r() * h, col = pick(r, cols), a = r() * TAU, l = 3 + r() * 3;
      wrap(s, x, y, 8, (X, Y) => {
        if (h !== s && (Y < -6 || Y > h + 6)) return;
        g.fillStyle = col;
        g.beginPath(); g.ellipse(X, Y, l, l * 0.55, a, 0, TAU); g.fill();
        if (lit && r() < 0.5) { g.fillStyle = 'rgba(255,255,200,0.25)'; g.beginPath(); g.ellipse(X - 0.8, Y - 0.8, l * 0.5, l * 0.25, a, 0, TAU); g.fill(); }
      });
    }
  }
  function clumps(g, r, s, h, n, rad0, rad1, cols, wrapY) {
    const list = [];
    for (let i = 0; i < n; i++) list.push([r() * s, r() * h, lerp(rad0, rad1, r()), pick(r, cols)]);
    list.sort((a, b) => a[1] - b[1]);
    for (const [x, y, rad, col] of list) {
      const f = (X, Y) => {
        g.fillStyle = 'rgba(0,15,0,0.35)'; g.beginPath(); g.arc(X + 2, Y + 3, rad, 0, TAU); g.fill();
        const gr = g.createRadialGradient(X - rad * 0.4, Y - rad * 0.45, rad * 0.1, X, Y, rad);
        gr.addColorStop(0, shade(col, 0.3)); gr.addColorStop(0.6, col); gr.addColorStop(1, shade(col, -0.35));
        g.fillStyle = gr; g.beginPath(); g.arc(X, Y, rad, 0, TAU); g.fill();
      };
      if (wrapY) wrap(s, x, y, rad + 3, f); else wrapX(s, x, rad + 3, (X) => f(X, y));
    }
  }
  wall('hedge', {
    rim: ['#86bc5a', '#14280e'],
    paintTop: (g, r, s) => {
      g.fillStyle = '#244a1e'; g.fillRect(0, 0, s, s);
      clumps(g, r, s, s, 140, 9, 16, ['#3a6e2e', '#447a34', '#3e7430', '#4f8a3a'], true);
      leaves(g, r, s, s, 1700, ['#2e5a26', '#3e7030', '#4f8a3a', '#62a046', '#3a6a2c'], true);
      leaves(g, r, s, s, 450, ['#7ab452', '#8cc25e', '#9fd06a'], true);
    },
    paintFace: (g, r, s, h) => {
      g.fillStyle = '#16301a'; g.fillRect(0, 0, s, h);
      clumps(g, r, s, h, 70, 8, 14, ['#2c5a26', '#336a2c', '#2a5224', '#3c7030'], false);
      leaves(g, r, s, h, 1100, ['#244a1e', '#2e5a26', '#3a6a2c', '#457a34'], true);
      leaves(g, r, s, h * 0.45, 260, ['#5a9040', '#6aa04a'], true);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,10,0,0.1)'); gr.addColorStop(1, 'rgba(0,10,0,0.55)');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
      for (let i = 0; i < 7; i++) { const x = r() * s, y = 6 + r() * (h - 18); flower5(g, x, y, 1.6, pick(r, ['#ffffff', '#ffd0e0']), '#ffe070'); }
    },
  });
  wall('void', {
    rim: ['#1a1c28', '#000000'], rimW: 1,
    paintTop: (g, r, s) => {
      g.fillStyle = '#05060a'; g.fillRect(0, 0, s, s);
      mottle(g, r, s, ['#0c0e1a', '#000000', '#0a0814'], 30, 30, 80, 0.4, 0.7);
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(150,170,255,${0.1 + r() * 0.25})`; g.fillRect(r() * s, r() * s, 1, 1); }
    },
    paintFace: (g, r, s, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#0a0c16'); gr.addColorStop(1, '#020205');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
      void r;
    },
    faceExtra() {},
  });
  wall('wall_slate', {
    rim: ['#8a8e90', '#1a1c1e'],
    paintTop: (g, r, s) => {
      g.fillStyle = '#2a2d30'; g.fillRect(0, 0, s, s);
      const cols = ['#5d6266', '#555a5e', '#666a6a', '#5a5650'];
      rows(g, r, s, 21.3333, 24, 56, (x, y, w, h) => {
        const j = 3;
        slab(g, r, [[x + 1 + r() * j, y + 1], [x + w - 1 - r() * j, y + 1 + r() * j], [x + w - 1, y + h - 1 - r() * j], [x + 1, y + h - 1]], pick(r, cols), { round: 0.12, sh: 0.5, tex: speckIn(r, 10, ['#33373a', '#9aa0a4'], 0.3) });
      });
    },
    paintFace: (g, r, s, h) => {
      g.fillStyle = '#1e2022'; g.fillRect(0, 0, s, h);
      // thin stacked slabs, irregular lengths
      let y = 0;
      while (y < h) {
        const th = 3.5 + r() * 4;
        let x = r() * s, acc = 0;
        const x0 = x;
        while (acc < s) {
          const w = 14 + r() * 36, col = pick(r, ['#6a6e72', '#5e6266', '#74746e', '#585c60', '#6e665c']);
          wrapX(s, x0 + acc, w, (X) => {
            const gr = g.createLinearGradient(0, y, 0, y + th);
            gr.addColorStop(0, shade(col, 0.25)); gr.addColorStop(0.4, col); gr.addColorStop(1, shade(col, -0.35));
            g.fillStyle = gr;
            g.beginPath(); g.moveTo(X + 1, y + 0.6 + r()); g.lineTo(X + w - 1, y + 0.6 + r()); g.lineTo(X + w - 1.5 - r() * 2, y + th); g.lineTo(X + 1.5 + r() * 2, y + th); g.closePath(); g.fill();
          });
          acc += w;
        }
        y += th;
      }
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
    },
  });
  wall('wall_basalt', {
    rim: ['#6a6e72', '#0a0b0c'],
    paintTop: paintHex({ grout: '#0c0d0e', gap: 1.2, cols: ['#3a3d41', '#34373b', '#404346', '#2e3134'], speck: ['#18191b', '#6c7176'], lichen: ['#8a9a6a'] }),
    paintFace: (g, r, s, h) => {
      g.fillStyle = '#121315'; g.fillRect(0, 0, s, h);
      // vertical hexagonal columns: each column shows two lit/shaded facets
      let x = 0;
      while (x < s) {
        const w = 10 + r() * 8, col = pick(r, ['#3e4246', '#373a3e', '#44474a', '#323538']);
        const top = r() * 4;
        wrapX(s, x, w, (X) => {
          g.fillStyle = shade(col, 0.25); g.fillRect(X + 0.6, top, w * 0.45, h - top);
          g.fillStyle = shade(col, -0.25); g.fillRect(X + 0.6 + w * 0.45, top, w * 0.55 - 1.2, h - top);
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(X + 0.6, top, 1, h - top);
          g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(X + w - 0.8, top, 0.8, h - top);
          // horizontal joints
          for (let y = top + 8 + r() * 10; y < h - 2; y += 10 + r() * 14) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(X + 0.6, y, w - 1.2, 1); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(X + 0.6, y + 1, w - 1.2, 0.8); }
          for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(160,170,180,0.25)'; g.fillRect(X + r() * w, top + r() * (h - top), 1, 1); }
        });
        x += w;
      }
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = gr; g.fillRect(0, 0, s, h);
    },
  });

  // ------------------------------------------------------------------------------------------------
  // small public helpers (optional for the engine)
  G.Tiles.ids = () => Object.keys(D);
  // pre-build textures for a list of terrain ids (e.g. on map load) to avoid first-frame hitches
  G.Tiles.warm = (ids) => {
    sync();
    for (const id of ids) {
      const d = D[id];
      if (!d) continue;
      try {
        if (d.tx) d.tx();
        if (d.topTex) { d.topTex(); d.faceTex(); }
      } catch (e) { /* ignore */ }
    }
  };
})();

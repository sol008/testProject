// 彼岸燈 — 3D creatures, team B (G.Mon3D): folklore spirits, sea horrors and 一息界 visions, incl. the major bosses
// 鯤 kun, 黑潮・無相 wuxiang, 峽谷巨像 gorge_colossus, 潮病海蛇 tide_serpent, 蛟 jiao, 林投姐 linto_jie, 心魔 inner_demon.
// Contract: docs/CONTRACTS_3D.md (G.Mon3D: same instance interface as characters; clips idle/move/attack/cast/hurt/die/special/enter).
//
// How a creature is made (everything procedural, no asset files):
//  • Rig — a THREE.Bone hierarchy authored in model space (rest rotations = identity). Every part is skinned to it:
//    rigid parts get weight 1 on one bone, swept tubes (serpents, tails, tentacles, sleeves) get smooth 2-bone weights.
//  • One SkinnedMesh per material class, sharing one Skeleton → ≤ 8 draw calls per creature:
//      body  toon + fresnel rim (G.R3M.toon) + inverted-hull outline (G.R3M.outline)
//      cut   alpha-tested double-sided toon cards (fronds, petals, rags, fins, sails)
//      glow  HDR emissive (eyes, lanterns, cracks) → bloom
//      ghost translucent fresnel spectre with drifting noise
//      psy   一息界 iridescent kaleidoscope / Kali-fractal skin
//      water translucent scrolling water
//    plus up to two particle systems (additive sparks/souls, soft fog puffs).
//  • Painted textures — one shared 2048² detail atlas (8×8 cells: scales, fur, cloth, stone, marble, faces, talismans…),
//    tinted per vertex; a shader tiles any cell with fract()+textureGrad so all parts share one material.
//  • Animation — procedural layered clips (idle/move base layer + cross-faded one-shots with anticipation →
//    action → follow-through), VRM-style spring bones (hair, sleeves, tails, ribbons, fins, strings), look-at,
//    hit flash, dissolve-out on death / dissolve-in on enter, and boss phase transformations (setPhase): phase-only
//    parts hang on bones kept at scale 0 until the phase grows them in.
// Extras beyond the contract: inst.setPhase(n) (bosses; also opts.phase), inst.mapScale, G.Mon3D.B (toolkit, for tests).
'use strict';
G.Mon3D = G.Mon3D || {
  defs: {},
  define(id, b) { this.defs[id] = b; },
  has(id) { return !!this.defs[id]; },
  create(id, opts) { return this.defs[id](opts || {}); },
};
(() => {
  const TAU = Math.PI * 2, PI = Math.PI;
  const { sin, cos, abs, min, max, sqrt, atan2, floor, pow } = Math;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  // smooth keyframes: keys(u, [t0, v0, t1, v1, …]) eased between keys, clamped at the ends
  function keys(u, k) {
    if (u <= k[0]) return k[1];
    for (let i = 2; i < k.length; i += 2) {
      if (u <= k[i]) { const t = (u - k[i - 2]) / (k[i] - k[i - 2]); return lerp(k[i - 1], k[i + 1], t * t * (3 - 2 * t)); }
    }
    return k[k.length - 1];
  }
  // rise a→b, hold, fall c→d
  const pulse = (u, a, b, c, d) => sm(a, b, u) * (1 - sm(c, d, u));
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hstr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  // 3D value noise for geometry displacement (deterministic)
  function h3(x, y, z) { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, z) {
    const xi = floor(x), yi = floor(y), zi = floor(z);
    let xf = x - xi, yf = y - yi, zf = z - zi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf),
      l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  }
  const fbm = (x, y, z) => vnoise(x, y, z) * 0.55 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.15;
  const now = () => (G.time != null ? G.time : performance.now() / 1000);

  // =============================================================================================== atlas
  // 10×10 cells (painted at 256 px, stored at 204 px in a 2048² atlas). Tiling cells are painted seamlessly; decal cells (faces, emblems) are used with 0..1 UVs.
  const CELLS = [
    'plain', 'scale', 'bigscale', 'fur', 'cloth', 'stone', 'marble', 'wood',
    'metal', 'wing', 'lamellar', 'skin', 'frond', 'paper', 'weed', 'water',
    'hair', 'belly', 'diamond', 'eye', 'opera', 'lintoface', 'lilyface', 'jewelface',
    'fringe', 'talisman', 'spots', 'reticulate', 'emberspot', 'yong', 'sail', 'feather',
    'flame', 'soul', 'lily', 'leaf', 'cloud', 'rune', 'crack', 'barnacle',
    'ghostface', 'plagueface', 'pirateface', 'ghoulface', 'drownface', 'maw', 'greedface', 'cliffface',
    'eyeball', 'grad', 'bark', 'rope', 'glass', 'tile', 'brick', 'mandala',
    'windmask', 'stars', 'blank', 'ring', 'streak', 'dots', 'mouthO', 'bearface',
    'fin', 'lantern', 'lattice', 'kelp', 'smoke', 'petal', 'shard', 'web', 'gold', 'bandage',
    'brocade', 'pandan', 'robe', 'qilin', 'mirror', 'bubble', 'sand', 'drip', 'heart', 'seal',
    'iris2', 'vein', 'coral', 'mask_g', 'zigzag', 'moss', 'lacquer', 'string', 'wave', 'blankA',
  ];
  const NC = 10; // cells per row
  const CI = {}; CELLS.forEach((n, i) => { CI[n] = i; });
  const AT = 2048, CS = 256, CP = 204; // painters draw at CS, cells are stored at CP px
  let atlasTex = null;

  function cellCanvas() { const c = document.createElement('canvas'); c.width = c.height = CS; return c; }
  // draw fn at the 9 wrap offsets → seamless tile
  function wrap(g, fn) { for (let ox = -CS; ox <= CS; ox += CS) for (let oy = -CS; oy <= CS; oy += CS) { g.save(); g.translate(ox, oy); fn(); g.restore(); } }
  const grey = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
  function mottle(g, r, base, amp, n, rad) {
    g.fillStyle = grey(base); g.fillRect(0, 0, CS, CS);
    for (let i = 0; i < n; i++) {
      const x = r() * CS, y = r() * CS, rr = rad * (0.4 + r()), v = base + (r() - 0.5) * 2 * amp;
      wrap(g, () => { const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, grey(v, 0.35)); gr.addColorStop(1, grey(v, 0)); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); });
    }
  }
  function speck(g, r, n, lo, hi, a, s = 1.5) { for (let i = 0; i < n; i++) { g.fillStyle = grey(lo + r() * (hi - lo), a); g.fillRect(r() * CS, r() * CS, s * (0.5 + r()), s * (0.5 + r())); } }
  function face(g, skin, fn) { g.fillStyle = skin; g.fillRect(0, 0, CS, CS); fn(); }
  function eyeAlmond(g, x, y, w, h, iris, closed, lid = '#201018') {
    g.save();
    if (closed) { g.strokeStyle = lid; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - w, y - 2); g.quadraticCurveTo(x, y + h * 0.9, x + w, y - 2); g.stroke(); g.restore(); return; }
    g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - h * 1.3, x + w, y); g.quadraticCurveTo(x, y + h * 0.9, x - w, y); g.closePath();
    g.fillStyle = '#f4efe6'; g.fill(); g.clip();
    const gr = g.createRadialGradient(x, y, 0, x, y, h * 1.1); gr.addColorStop(0, iris[0]); gr.addColorStop(0.7, iris[1]); gr.addColorStop(1, '#100808');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, h * 1.05, 0, TAU); g.fill();
    g.fillStyle = '#080406'; g.beginPath(); g.arc(x, y, h * 0.42, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x - h * 0.35, y - h * 0.4, h * 0.22, 0, TAU); g.fill();
    g.restore();
    g.strokeStyle = lid; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x - w - 2, y + 1); g.quadraticCurveTo(x, y - h * 1.35, x + w + 2, y - 1); g.stroke();
  }
  const PAINT = {
    plain(g, r) { mottle(g, r, 228, 22, 60, 40); speck(g, r, 400, 180, 255, 0.15); },
    scale(g, r) {
      g.fillStyle = grey(200); g.fillRect(0, 0, CS, CS);
      const s = 32;
      for (let row = -1; row <= CS / (s * 0.5) + 1; row++) for (let col = -1; col <= CS / s + 1; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0), y = row * s * 0.5;
        const gr = g.createRadialGradient(x, y - s * 0.25, 2, x, y, s * 0.62);
        gr.addColorStop(0, grey(255)); gr.addColorStop(0.75, grey(215)); gr.addColorStop(1, grey(120));
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, s * 0.56, 0, PI); g.closePath(); g.fill();
        g.strokeStyle = grey(90, 0.7); g.lineWidth = 2; g.beginPath(); g.arc(x, y, s * 0.56, 0.1, PI - 0.1); g.stroke();
      }
    },
    bigscale(g, r) {
      g.fillStyle = grey(190); g.fillRect(0, 0, CS, CS);
      const s = 64;
      for (let row = -1; row <= CS / (s * 0.55) + 1; row++) for (let col = -1; col <= CS / s + 1; col++) {
        const x = col * s + (row % 2 ? s / 2 : 0), y = row * s * 0.55;
        const gr = g.createLinearGradient(x, y - s * 0.2, x, y + s * 0.55);
        gr.addColorStop(0, grey(255)); gr.addColorStop(0.6, grey(222)); gr.addColorStop(1, grey(150));
        g.fillStyle = gr; g.beginPath(); g.moveTo(x - s * 0.52, y); g.quadraticCurveTo(x - s * 0.5, y + s * 0.5, x, y + s * 0.62); g.quadraticCurveTo(x + s * 0.5, y + s * 0.5, x + s * 0.52, y); g.closePath(); g.fill();
        g.strokeStyle = grey(70, 0.8); g.lineWidth = 3; g.stroke();
        g.strokeStyle = grey(255, 0.5); g.lineWidth = 2; g.beginPath(); g.moveTo(x - s * 0.3, y + s * 0.12); g.quadraticCurveTo(x, y + s * 0.3, x + s * 0.3, y + s * 0.12); g.stroke();
      }
    },
    fur(g, r) {
      mottle(g, r, 200, 25, 30, 50);
      g.lineCap = 'round';
      for (let i = 0; i < 1600; i++) {
        const x = r() * CS, y = r() * CS, l = 8 + r() * 14, v = 150 + r() * 105;
        wrap(g, () => { g.strokeStyle = grey(v, 0.55); g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y + l * 0.5, x + (r() - 0.5) * 5, y + l); g.stroke(); });
      }
    },
    cloth(g, r) {
      g.fillStyle = grey(222); g.fillRect(0, 0, CS, CS);
      for (let x = 0; x < CS; x += 4) { g.fillStyle = grey(200, 0.5); g.fillRect(x, 0, 1, CS); }
      for (let y = 0; y < CS; y += 4) { g.fillStyle = grey(245, 0.5); g.fillRect(0, y, CS, 1); }
      for (let i = 0; i < 7; i++) {
        const x = (i / 7) * CS + r() * 12;
        const gr = g.createLinearGradient(x - 16, 0, x + 16, 0);
        gr.addColorStop(0, grey(255, 0)); gr.addColorStop(0.5, grey(150, 0.35)); gr.addColorStop(1, grey(255, 0));
        g.fillStyle = gr; g.fillRect(x - 16, 0, 32, CS);
      }
      speck(g, r, 300, 150, 255, 0.12);
    },
    stone(g, r) {
      mottle(g, r, 205, 30, 70, 36); speck(g, r, 1600, 110, 255, 0.35, 2);
      g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        let x = r() * CS, y = r() * CS; const pts = [[x, y]];
        for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.3) * 40; pts.push([x, y]); }
        wrap(g, () => { g.strokeStyle = grey(80, 0.7); g.lineWidth = 1.5 + r(); g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); });
      }
    },
    marble(g, r) {
      mottle(g, r, 238, 14, 50, 50);
      for (let i = 0; i < 14; i++) {
        let x = r() * CS, y = r() * CS, a = r() * TAU; const pts = [[x, y]];
        for (let k = 0; k < 24; k++) { a += (r() - 0.5) * 0.7; x += cos(a) * 9; y += sin(a) * 9; pts.push([x, y]); }
        const v = 110 + r() * 80, w = 0.6 + r() * 2.2;
        wrap(g, () => { g.strokeStyle = grey(v, 0.55); g.lineWidth = w; g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); });
      }
    },
    wood(g, r) {
      g.fillStyle = grey(205); g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 46; i++) {
        const x0 = (i / 46) * CS, v = 150 + r() * 90, ph = r() * TAU;
        g.strokeStyle = grey(v, 0.6); g.lineWidth = 1 + r() * 2.5; g.beginPath();
        for (let y = 0; y <= CS; y += 8) { const x = x0 + sin(y / CS * TAU * 2 + ph) * 4; y ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
      for (let i = 0; i < 2; i++) { const x = 40 + r() * 170, y = 40 + r() * 170; g.strokeStyle = grey(110, 0.6); g.lineWidth = 2; for (let k = 1; k < 5; k++) { g.beginPath(); g.ellipse(x, y, k * 3, k * 7, 0, 0, TAU); g.stroke(); } }
    },
    metal(g, r) {
      mottle(g, r, 215, 25, 60, 30);
      for (let i = 0; i < 260; i++) { const x = r() * CS, y = r() * CS, rr = 3 + r() * 6; wrap(g, () => { const gr = g.createRadialGradient(x - 1, y - 1, 0, x, y, rr); gr.addColorStop(0, grey(255, 0.4)); gr.addColorStop(1, grey(140, 0)); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }); }
      for (let i = 0; i < 40; i++) { const x = r() * CS, y = r() * CS, l = 10 + r() * 30, a = r() * PI; wrap(g, () => { g.strokeStyle = grey(250, 0.3); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cos(a) * l, y + sin(a) * l); g.stroke(); }); }
      for (let i = 0; i < 12; i++) { const x = r() * CS, y = r() * CS, rr = 10 + r() * 25; wrap(g, () => { const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(120,190,170,0.35)'); gr.addColorStop(1, 'rgba(120,190,170,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }); }
    },
    wing(g, r) {
      // moth wing: powder gradient, radiating veins and a scalloped margin band (u → along wing, v → across)
      const gr = g.createLinearGradient(0, 0, 0, CS); gr.addColorStop(0, grey(150)); gr.addColorStop(0.55, grey(225)); gr.addColorStop(1, grey(180));
      g.fillStyle = gr; g.fillRect(0, 0, CS, CS);
      speck(g, r, 2500, 120, 255, 0.25, 1.4);
      g.strokeStyle = grey(70, 0.75); g.lineWidth = 2.5;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, CS * 0.5); g.quadraticCurveTo(CS * 0.4, CS * (0.5 + (i - 4) * 0.06), CS, CS * (i + 0.5) / 9); g.stroke(); }
      g.fillStyle = grey(90, 0.6);
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(CS - 10, (i + 0.5) * CS / 12, 10, 0, TAU); g.fill(); }
    },
    lamellar(g, r) {
      g.fillStyle = grey(120); g.fillRect(0, 0, CS, CS);
      const w = 32, h = 42;
      for (let row = 0; row < CS / h + 1; row++) for (let col = 0; col < CS / w + 1; col++) {
        const x = col * w + (row % 2 ? w / 2 : 0) - w / 2, y = row * h - 6;
        const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, grey(255)); gr.addColorStop(1, grey(170));
        g.fillStyle = gr; g.beginPath(); g.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 7); g.fill();
        g.strokeStyle = grey(60, 0.8); g.lineWidth = 1.5; g.stroke();
        g.fillStyle = grey(80); g.beginPath(); g.arc(x + w / 2, y + 9, 2.2, 0, TAU); g.fill();
      }
    },
    skin(g, r) {
      mottle(g, r, 225, 18, 80, 30);
      for (let i = 0; i < 70; i++) { const x = r() * CS, y = r() * CS, l = 10 + r() * 20; wrap(g, () => { g.strokeStyle = grey(165, 0.3); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + (r() - 0.5) * 6, x + l, y + (r() - 0.5) * 4); g.stroke(); }); }
      speck(g, r, 500, 170, 250, 0.15);
    },
    frond(g, r) {
      // pandanus (林投) leaf card: long blade with midrib and serrated edges, alpha outside
      g.clearRect(0, 0, CS, CS);
      g.beginPath(); g.moveTo(CS * 0.5, 0);
      for (let y = 0; y <= CS; y += 8) { const w = (1 - pow(y / CS, 1.5)) * 0.4 * CS + 4; g.lineTo(CS * 0.5 + w + (y % 16 ? 0 : 5), CS - y); }
      for (let y = CS; y >= 0; y -= 8) { const w = (1 - pow(y / CS, 1.5)) * 0.4 * CS + 4; g.lineTo(CS * 0.5 - w - (y % 16 ? 0 : 5), CS - y); }
      g.closePath();
      const gr = g.createLinearGradient(CS * 0.35, 0, CS * 0.65, 0); gr.addColorStop(0, grey(170)); gr.addColorStop(0.5, grey(255)); gr.addColorStop(1, grey(160));
      g.fillStyle = gr; g.fill();
      g.strokeStyle = grey(120, 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(CS * 0.5, 0); g.lineTo(CS * 0.5, CS); g.stroke();
    },
    paper(g, r) { mottle(g, r, 238, 10, 40, 40); for (let i = 0; i < 500; i++) { const x = r() * CS, y = r() * CS, l = 4 + r() * 10, a = r() * PI; g.strokeStyle = grey(200, 0.3); g.lineWidth = 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cos(a) * l, y + sin(a) * l); g.stroke(); } },
    weed(g, r) {
      g.clearRect(0, 0, CS, CS);
      for (let i = 0; i < 5; i++) {
        const x0 = 30 + i * 48, ph = r() * TAU;
        g.beginPath();
        for (let y = 0; y <= CS; y += 8) g.lineTo(x0 + sin(y / 40 + ph) * 10 - 8, y);
        for (let y = CS; y >= 0; y -= 8) g.lineTo(x0 + sin(y / 40 + ph) * 10 + 8 - (CS - y) / CS * 6, y);
        g.closePath(); g.fillStyle = grey(190 + r() * 60); g.fill();
      }
    },
    water(g, r) {
      g.fillStyle = grey(170); g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 26; i++) {
        let x = r() * CS, y = r() * CS; const pts = [];
        for (let k = 0; k < 7; k++) { pts.push([x, y]); x += 12 + r() * 14; y += (r() - 0.5) * 16; }
        const v = 225 + r() * 30;
        wrap(g, () => { g.strokeStyle = grey(v, 0.8); g.lineWidth = 2 + r() * 3; g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); });
      }
    },
    hair(g, r) {
      g.fillStyle = grey(150); g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 260; i++) { const x = r() * CS, v = 90 + r() * 165, w = 0.8 + r() * 2.5, ph = r() * TAU; wrap(g, () => { g.strokeStyle = grey(v, 0.55); g.lineWidth = w; g.beginPath(); for (let y = 0; y <= CS; y += 16) { const xx = x + sin(y / CS * TAU + ph) * 3; y ? g.lineTo(xx, y) : g.moveTo(xx, y); } g.stroke(); }); }
    },
    belly(g, r) {
      g.fillStyle = grey(235); g.fillRect(0, 0, CS, CS);
      for (let y = 0; y < CS; y += 32) { const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, grey(255)); gr.addColorStop(0.8, grey(225)); gr.addColorStop(1, grey(150)); g.fillStyle = gr; g.fillRect(0, y, CS, 32); }
    },
    diamond(g, r) {
      // 百步蛇 dorsal pattern: brown triangles/diamonds on cream (coloured cell)
      g.fillStyle = '#efe4c8'; g.fillRect(0, 0, CS, CS);
      speck(g, r, 600, 160, 230, 0.15);
      const dd = (cx, cy, s, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath(); g.fill(); };
      for (let k = -1; k <= 1; k++) {
        const cy = CS * 0.5 + k * CS;
        dd(CS * 0.5, cy, 92, '#5a3a22'); dd(CS * 0.5, cy, 70, '#efe4c8'); dd(CS * 0.5, cy, 48, '#7b5233');
        for (const sx of [0, CS]) { g.fillStyle = '#4a2e1a'; g.beginPath(); g.moveTo(sx, cy - 40); g.lineTo(sx + (sx ? -34 : 34), cy); g.lineTo(sx, cy + 40); g.fill(); }
      }
    },
    eye(g) { g.fillStyle = '#f6f1d0'; g.fillRect(0, 0, CS, CS); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 120); gr.addColorStop(0, '#fff6a0'); gr.addColorStop(0.6, '#f0b020'); gr.addColorStop(0.95, '#7a3a08'); gr.addColorStop(1, '#2a1004'); g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 118, 0, TAU); g.fill(); g.fillStyle = '#080404'; g.beginPath(); g.ellipse(128, 128, 22, 96, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(90, 80, 18, 0, TAU); g.fill(); },
    opera(g) {
      // 傀儡戲 red-face general (紅臉 = loyal & brave): red base, black sweeping brows, white-rimmed eyes, gold forehead
      face(g, '#c8302a', () => {
        const gr = g.createRadialGradient(128, 120, 20, 128, 140, 150); gr.addColorStop(0, '#e2483a'); gr.addColorStop(1, '#8a1812'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS);
        g.fillStyle = '#f2c84a'; g.beginPath(); g.moveTo(128, 30); g.lineTo(148, 70); g.lineTo(128, 96); g.lineTo(108, 70); g.closePath(); g.fill();
        g.fillStyle = '#121010';
        for (const s of [-1, 1]) {
          g.beginPath(); g.moveTo(128 + s * 18, 104); g.quadraticCurveTo(128 + s * 60, 70, 128 + s * 112, 92); g.quadraticCurveTo(128 + s * 64, 92, 128 + s * 18, 116); g.fill();
          g.fillStyle = '#fbf3e4'; g.beginPath(); g.ellipse(128 + s * 50, 128, 26, 12, s * -0.15, 0, TAU); g.fill();
          g.fillStyle = '#121010'; g.beginPath(); g.arc(128 + s * 46, 128, 8, 0, TAU); g.fill();
          g.strokeStyle = '#121010'; g.lineWidth = 4; g.beginPath(); g.ellipse(128 + s * 50, 128, 28, 14, s * -0.15, 0, TAU); g.stroke();
        }
        g.fillStyle = '#121010'; g.beginPath(); g.moveTo(108, 196); g.quadraticCurveTo(128, 186, 148, 196); g.quadraticCurveTo(128, 214, 108, 196); g.fill();
        g.strokeStyle = '#121010'; g.lineWidth = 3; g.beginPath(); g.moveTo(118, 150); g.lineTo(114, 172); g.lineTo(126, 176); g.stroke();
      });
    },
    lintoface(g) {
      face(g, '#e8e6e2', () => {
        const gr = g.createRadialGradient(128, 130, 10, 128, 130, 150); gr.addColorStop(0, '#f6f5f2'); gr.addColorStop(1, '#e8e6e2'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS);
        for (const s of [-1, 1]) {
          g.strokeStyle = '#2a2230'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(128 + s * 22, 96); g.quadraticCurveTo(128 + s * 50, 84, 128 + s * 76, 100); g.stroke();
          eyeAlmond(g, 128 + s * 46, 126, 24, 9, ['#4a5060', '#1a1c24'], false, '#1a141c');
          g.fillStyle = 'rgba(120,130,160,0.35)'; g.beginPath(); g.ellipse(128 + s * 46, 146, 22, 8, 0, 0, TAU); g.fill();
        }
        g.fillStyle = '#8a2a36'; g.beginPath(); g.moveTo(112, 196); g.quadraticCurveTo(128, 188, 144, 196); g.quadraticCurveTo(128, 206, 112, 196); g.fill();
        g.strokeStyle = 'rgba(140,140,150,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(126, 150); g.quadraticCurveTo(122, 170, 130, 174); g.stroke();
        g.strokeStyle = 'rgba(150,220,255,0.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(170, 140); g.lineTo(166, 190); g.stroke();
      });
    },
    lilyface(g) {
      face(g, '#f6f0ea', () => {
        g.fillStyle = 'rgba(230,120,120,0.35)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 56, 160, 24, 14, 0, 0, TAU); g.fill(); }
        g.strokeStyle = '#c0182a'; g.lineWidth = 5; g.lineCap = 'round';
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 24, 128); g.quadraticCurveTo(128 + s * 46, 140, 128 + s * 70, 124); g.stroke(); }
        g.fillStyle = '#c0182a'; g.beginPath(); g.ellipse(128, 196, 10, 6, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(128, 50); g.lineTo(136, 76); g.lineTo(128, 92); g.lineTo(120, 76); g.fill();
      });
    },
    jewelface(g) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, CS, CS);
      for (const s of [-1, 1]) {
        g.fillStyle = '#10141c'; g.beginPath(); g.ellipse(128 + s * 44, 120, 22, 30, 0, 0, TAU); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128 + s * 44 - 7, 108, 9, 0, TAU); g.fill(); g.beginPath(); g.arc(128 + s * 44 + 8, 132, 4, 0, TAU); g.fill();
      }
      g.strokeStyle = '#10141c'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(108, 172); g.quadraticCurveTo(128, 190, 148, 172); g.stroke();
      g.fillStyle = 'rgba(255,120,160,0.5)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 74, 162, 18, 10, 0, 0, TAU); g.fill(); }
    },
    fringe(g, r) {
      // torn rag hem: alpha strips (u across, v down; ragged at v=1)
      g.clearRect(0, 0, CS, CS);
      g.fillStyle = grey(225); g.beginPath(); g.moveTo(0, 0); g.lineTo(CS, 0);
      for (let x = CS; x >= 0; x -= 8) g.lineTo(x, CS * (0.55 + r() * 0.45) - (x % 32 < 8 ? 40 * r() : 0));
      g.closePath(); g.fill();
      for (let i = 0; i < 30; i++) { g.fillStyle = grey(150 + r() * 80, 0.3); g.fillRect(r() * CS, 0, 2, CS); }
      for (let i = 0; i < 8; i++) { g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.ellipse(r() * CS, CS * (0.2 + r() * 0.5), 4 + r() * 8, 6 + r() * 14, 0, 0, TAU); g.fill(); g.restore(); }
    },
    talisman(g) {
      // 符 paper: yellow with red cinnabar strokes
      g.fillStyle = '#e8c860'; g.fillRect(0, 0, CS, CS);
      g.strokeStyle = '#b01818'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeRect(22, 14, 212, 228);
      g.beginPath(); g.moveTo(128, 34); g.lineTo(128, 70); g.moveTo(80, 52); g.lineTo(176, 52);
      g.moveTo(90, 90); g.quadraticCurveTo(128, 76, 166, 92); g.moveTo(128, 90); g.lineTo(128, 220);
      g.moveTo(84, 130); g.lineTo(172, 124); g.moveTo(96, 160); g.quadraticCurveTo(128, 190, 160, 158); g.moveTo(90, 206); g.lineTo(166, 196);
      g.stroke();
      g.fillStyle = 'rgba(150,100,40,0.3)'; for (let i = 0; i < 20; i++) g.fillRect(Math.random() * CS, Math.random() * CS, 6, 6);
    },
    spots(g, r) { g.fillStyle = grey(225); g.fillRect(0, 0, CS, CS); for (let i = 0; i < 26; i++) { const x = r() * CS, y = r() * CS, rr = 6 + r() * 16; wrap(g, () => { g.fillStyle = grey(110, 0.7); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.fillStyle = grey(70, 0.6); g.beginPath(); g.arc(x, y, rr * 0.5, 0, TAU); g.fill(); }); } },
    reticulate(g, r) {
      g.fillStyle = grey(120); g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 110; i++) { const x = r() * CS, y = r() * CS, rr = 7 + r() * 10; wrap(g, () => { g.fillStyle = grey(235); g.beginPath(); g.ellipse(x, y, rr, rr * (0.7 + r() * 0.5), r() * PI, 0, TAU); g.fill(); }); }
    },
    emberspot(g) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, CS, CS);
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 120); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.35, '#ffb030'); gr.addColorStop(0.7, '#e05010'); gr.addColorStop(0.85, '#301008'); gr.addColorStop(1, '#ffffff');
      g.fillStyle = gr; g.beginPath(); g.ellipse(128, 128, 120, 96, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,40,10,0.7)'; g.lineWidth = 4; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(40, 128 + i * 26); g.quadraticCurveTo(128, 128 + i * 34, 216, 128 + i * 26); g.stroke(); }
    },
    yong(g) {
      // Qing soldier chest roundel with 勇 ("brave")
      g.fillStyle = '#3a4a6a'; g.fillRect(0, 0, CS, CS);
      g.fillStyle = '#e8dcc0'; g.beginPath(); g.arc(128, 128, 96, 0, TAU); g.fill();
      g.strokeStyle = '#8a2a1a'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 96, 0, TAU); g.stroke();
      g.fillStyle = '#7a1a10'; g.font = 'bold 130px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('勇', 128, 136);
    },
    sail(g, r) {
      // junk sail: bamboo battens + patched panels, holes (alpha)
      g.fillStyle = grey(215); g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 14; i++) { g.fillStyle = grey(170 + r() * 70, 0.45); g.fillRect(r() * CS, r() * CS, 30 + r() * 50, 20 + r() * 30); }
      for (let y = 0; y < CS; y += 42) { g.fillStyle = grey(90); g.fillRect(0, y, CS, 6); }
      g.save(); g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(r() * CS, r() * CS, 6 + r() * 16, 4 + r() * 10, r() * PI, 0, TAU); g.fill(); }
      g.restore();
    },
    feather(g) { g.clearRect(0, 0, CS, CS); g.fillStyle = grey(235); g.beginPath(); g.moveTo(128, 0); g.quadraticCurveTo(220, 120, 128, 256); g.quadraticCurveTo(36, 120, 128, 0); g.fill(); g.strokeStyle = grey(140); g.lineWidth = 3; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke(); for (let y = 20; y < 240; y += 10) { g.strokeStyle = grey(180, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(128, y); g.lineTo(60 + y * 0.1, y - 24); g.moveTo(128, y); g.lineTo(196 - y * 0.1, y - 24); g.stroke(); } },
    flame(g) {
      g.clearRect(0, 0, CS, CS);
      const gr = g.createRadialGradient(128, 190, 4, 128, 170, 120); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(128, 6); g.bezierCurveTo(176, 90, 220, 150, 196, 206); g.quadraticCurveTo(128, 270, 60, 206); g.bezierCurveTo(36, 150, 80, 90, 128, 6); g.fill();
    },
    soul(g) {
      // wailing soul: white wisp with dark eye holes & mouth (used on ghosts/tide faces)
      g.clearRect(0, 0, CS, CS);
      const gr = g.createRadialGradient(128, 110, 10, 128, 130, 120); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(128, 10); g.bezierCurveTo(220, 20, 230, 150, 190, 230); g.quadraticCurveTo(128, 200, 70, 236); g.bezierCurveTo(26, 150, 36, 20, 128, 10); g.fill();
      g.fillStyle = 'rgba(20,30,50,1)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 34, 100, 16, 22, 0, 0, TAU); g.fill(); }
      g.beginPath(); g.ellipse(128, 160, 16, 26, 0, 0, TAU); g.fill();
    },
    lily(g) {
      // red spider lily (彼岸花) head: six recurved strap petals + long stamens (white = tinted by vertex colour)
      g.clearRect(0, 0, CS, CS);
      g.translate(128, 128);
      for (let i = 0; i < 6; i++) {
        g.save(); g.rotate(i / 6 * TAU + 0.2);
        g.fillStyle = grey(255); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(16, -30, 30, -70, 6, -96); g.quadraticCurveTo(-4, -80, 10, -70); g.bezierCurveTo(4, -40, -10, -20, 0, 0); g.fill();
        g.strokeStyle = grey(190); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(10, -30, 20, -60, 6, -90); g.stroke();
        g.restore();
        g.save(); g.rotate(i / 6 * TAU + 0.7);
        g.strokeStyle = grey(240); g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(30, -60, 10, -122); g.stroke();
        g.fillStyle = 'rgba(255,220,120,1)'; g.beginPath(); g.arc(10, -122, 4, 0, TAU); g.fill();
        g.restore();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
    },
    leaf(g) { g.clearRect(0, 0, CS, CS); g.fillStyle = grey(225); g.beginPath(); g.moveTo(128, 0); g.quadraticCurveTo(230, 128, 128, 256); g.quadraticCurveTo(26, 128, 128, 0); g.fill(); g.strokeStyle = grey(150); g.lineWidth = 3; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.stroke(); for (let y = 30; y < 230; y += 26) { g.lineWidth = 1.5; g.beginPath(); g.moveTo(128, y + 10); g.lineTo(80, y - 14); g.moveTo(128, y + 10); g.lineTo(176, y - 14); g.stroke(); } },
    cloud(g) { g.clearRect(0, 0, CS, CS); for (const [x, y, rr] of [[90, 150, 70], [160, 140, 76], [128, 100, 70], [60, 180, 50], [200, 180, 50]]) { const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); } },
    rune(g, r) {
      g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS);
      g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(128, 128, 100, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 84, 0, TAU); g.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.save(); g.translate(128 + cos(a) * 64, 128 + sin(a) * 64); g.rotate(a); g.beginPath(); g.moveTo(-8, -8); g.lineTo(8, 0); g.lineTo(-8, 8); g.moveTo(0, -10); g.lineTo(0, 10); g.stroke(); g.restore(); }
      g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * TAU; i ? g.lineTo(128 + cos(a) * 44, 128 + sin(a) * 44) : g.moveTo(128 + cos(a) * 44, 128 + sin(a) * 44); } g.stroke();
    },
    crack(g, r) {
      g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 8; i++) {
        let x = r() * CS, y = r() * CS; const pts = [[x, y]];
        for (let k = 0; k < 9; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; pts.push([x, y]); }
        wrap(g, () => { g.strokeStyle = '#fff'; g.lineWidth = 2 + r() * 3; g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); });
      }
    },
    barnacle(g, r) {
      g.fillStyle = grey(170); g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 60; i++) { const x = r() * CS, y = r() * CS, rr = 5 + r() * 12; wrap(g, () => { g.fillStyle = grey(235); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.fillStyle = grey(60); g.beginPath(); g.arc(x, y, rr * 0.4, 0, TAU); g.fill(); g.strokeStyle = grey(140); g.lineWidth = 1; g.beginPath(); g.arc(x, y, rr * 0.75, 0, TAU); g.stroke(); }); }
    },
    ghostface(g) {
      face(g, '#e4ecf0', () => {
        for (const s of [-1, 1]) { const gr = g.createRadialGradient(128 + s * 40, 120, 2, 128 + s * 40, 120, 22); gr.addColorStop(0, '#141820'); gr.addColorStop(0.6, '#3a4250'); gr.addColorStop(1, 'rgba(160,180,200,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(128 + s * 40, 120, 22, 18, 0, 0, TAU); g.fill(); g.fillStyle = '#c8e8ff'; g.beginPath(); g.arc(128 + s * 40, 121, 4, 0, TAU); g.fill(); }
        g.fillStyle = '#20242e'; g.beginPath(); g.ellipse(128, 190, 7, 9, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(80,90,110,0.45)'; g.lineWidth = 3; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 60, 150); g.quadraticCurveTo(128 + s * 50, 180, 128 + s * 30, 196); g.stroke(); }
      });
    },
    plagueface(g) {
      face(g, '#b8c4a0', () => {
        mottleColor(g, 'rgba(90,120,60,0.25)');
        for (const s of [-1, 1]) { g.fillStyle = '#2a2a18'; g.beginPath(); g.ellipse(128 + s * 40, 120, 20, 14, 0, 0, TAU); g.fill(); g.fillStyle = '#e8f080'; g.beginPath(); g.arc(128 + s * 40, 120, 6, 0, TAU); g.fill(); }
        g.strokeStyle = '#3a3020'; g.lineWidth = 5; g.beginPath(); g.moveTo(100, 192); g.quadraticCurveTo(128, 178, 156, 196); g.stroke();
        g.strokeStyle = 'rgba(60,70,40,0.6)'; g.lineWidth = 2; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 20, 140); g.lineTo(128 + s * 64, 150); g.stroke(); }
      });
    },
    pirateface(g) {
      face(g, '#7ab8b0', () => {
        for (const s of [-1, 1]) { g.fillStyle = '#10201e'; g.beginPath(); g.ellipse(128 + s * 40, 116, 22, 20, 0, 0, TAU); g.fill(); g.fillStyle = '#b8fff0'; g.beginPath(); g.arc(128 + s * 40, 118, 6, 0, TAU); g.fill(); }
        g.fillStyle = '#10201e'; g.beginPath(); g.moveTo(120, 150); g.lineTo(136, 150); g.lineTo(128, 166); g.fill();
        g.fillStyle = '#e8f0e0'; for (let i = 0; i < 6; i++) g.fillRect(96 + i * 11, 190, 8, 14);
        g.strokeStyle = '#10201e'; g.lineWidth = 3; g.strokeRect(94, 188, 68, 18);
      });
    },
    ghoulface(g) {
      face(g, '#9aa888', () => {
        for (const s of [-1, 1]) { g.fillStyle = '#1a1a10'; g.beginPath(); g.ellipse(128 + s * 38, 112, 18, 22, 0, 0, TAU); g.fill(); g.fillStyle = '#f0f070'; g.beginPath(); g.arc(128 + s * 38, 114, 7, 0, TAU); g.fill(); }
        g.fillStyle = '#1a1a10'; g.beginPath(); g.ellipse(128, 194, 40, 16, 0, 0, TAU); g.fill();
        g.fillStyle = '#e0dcc0'; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(94 + i * 10, 182); g.lineTo(99 + i * 10, 196); g.lineTo(104 + i * 10, 182); g.fill(); }
      });
    },
    drownface(g) {
      face(g, '#8aa4a8', () => {
        g.fillStyle = '#1a2224'; g.beginPath(); g.ellipse(88, 118, 30, 18, -0.2, 0, TAU); g.fill(); g.fillRect(40, 110, 176, 6);
        g.fillStyle = '#f0f0d0'; g.beginPath(); g.arc(168, 118, 12, 0, TAU); g.fill(); g.fillStyle = '#202020'; g.beginPath(); g.arc(168, 118, 4, 0, TAU); g.fill();
        g.strokeStyle = '#2a3236'; g.lineWidth = 4; g.beginPath(); g.moveTo(104, 192); g.lineTo(152, 188); g.stroke();
        g.fillStyle = 'rgba(60,110,70,0.4)'; g.beginPath(); g.ellipse(70, 200, 30, 20, 0, 0, TAU); g.fill();
      });
    },
    maw(g) {
      // open fanged maw (inside of mouth): dark throat, gums, white teeth top and bottom
      const gr = g.createRadialGradient(128, 128, 10, 128, 128, 140); gr.addColorStop(0, '#100408'); gr.addColorStop(0.6, '#5a1420'); gr.addColorStop(1, '#a03040');
      g.fillStyle = gr; g.fillRect(0, 0, CS, CS);
      g.fillStyle = '#f2ead8';
      for (let i = 0; i < 9; i++) { const x = 8 + i * 30; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 13, 70 - (i % 2) * 20); g.lineTo(x + 26, 0); g.fill(); g.beginPath(); g.moveTo(x + 14, 256); g.lineTo(x + 27, 196 + (i % 2) * 18); g.lineTo(x + 40, 256); g.fill(); }
    },
    greedface(g) {
      face(g, '#c4b0dc', () => {
        for (const s of [-1, 1]) { g.fillStyle = '#2a1a30'; g.beginPath(); g.ellipse(128 + s * 44, 112, 22, 10, s * 0.25, 0, TAU); g.fill(); g.fillStyle = '#ffd040'; g.beginPath(); g.arc(128 + s * 44, 112, 6, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(255,110,140,0.45)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(128 + s * 76, 146, 20, 11, 0, 0, TAU); g.fill(); }
        g.strokeStyle = '#2a1a30'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(84, 168); g.quadraticCurveTo(128, 204, 176, 160); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(150, 178); g.lineTo(158, 192); g.lineTo(164, 174); g.fill();
      });
    },
    cliffface(g, r) {
      PAINT.marble(g, r);
      g.strokeStyle = 'rgba(40,60,70,0.85)'; g.lineWidth = 7; g.lineCap = 'round';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 18, 112); g.lineTo(128 + s * 70, 106); g.stroke(); }
      g.beginPath(); g.moveTo(96, 176); g.lineTo(110, 168); g.lineTo(128, 178); g.lineTo(146, 168); g.lineTo(160, 176); g.stroke();
    },
    eyeball(g) {
      // 百眼 eye: rainbow iris, used by the psy/glow materials
      g.fillStyle = '#fbf6ee'; g.fillRect(0, 0, CS, CS);
      for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; g.strokeStyle = `hsl(${i * 10},90%,55%)`; g.lineWidth = 9; g.beginPath(); g.moveTo(128 + cos(a) * 30, 128 + sin(a) * 30); g.lineTo(128 + cos(a) * 92, 128 + sin(a) * 92); g.stroke(); }
      g.strokeStyle = '#1a0a20'; g.lineWidth = 8; g.beginPath(); g.arc(128, 128, 94, 0, TAU); g.stroke();
      g.fillStyle = '#05030a'; g.beginPath(); g.arc(128, 128, 36, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(104, 100, 14, 0, TAU); g.fill();
    },
    grad(g) { const gr = g.createLinearGradient(0, 0, 0, CS); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#000000'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); },
    bark(g, r) { g.fillStyle = grey(170); g.fillRect(0, 0, CS, CS); for (let i = 0; i < 70; i++) { const x = r() * CS, w = 4 + r() * 10, v = 120 + r() * 120; wrap(g, () => { g.fillStyle = grey(v, 0.6); g.beginPath(); g.ellipse(x, r() * CS, w, 30 + r() * 50, 0, 0, TAU); g.fill(); }); } for (let y = 0; y < CS; y += 22) { g.fillStyle = grey(90, 0.5); g.fillRect(0, y + r() * 6, CS, 3); } },
    rope(g) { g.fillStyle = grey(200); g.fillRect(0, 0, CS, CS); for (let i = -8; i < 16; i++) { g.strokeStyle = grey(110, 0.8); g.lineWidth = 6; g.beginPath(); g.moveTo(i * 24, 0); g.lineTo(i * 24 + 128, CS); g.stroke(); } },
    glass(g) {
      g.fillStyle = grey(240); g.fillRect(0, 0, CS, CS);
      g.fillStyle = grey(70); for (let x = 0; x < CS; x += 64) g.fillRect(x, 0, 8, CS); g.fillRect(0, 0, CS, 10); g.fillRect(0, CS - 10, CS, 10); g.fillRect(0, CS / 2 - 4, CS, 8);
      g.fillStyle = 'rgba(255,255,255,0.5)'; for (let x = 12; x < CS; x += 64) g.fillRect(x + 6, 14, 6, CS / 2 - 24);
    },
    tile(g) { g.fillStyle = grey(150); g.fillRect(0, 0, CS, CS); for (let x = 0; x < CS; x += 32) { const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, grey(120)); gr.addColorStop(0.5, grey(240)); gr.addColorStop(1, grey(120)); g.fillStyle = gr; g.fillRect(x + 2, 0, 28, CS); } for (let y = 0; y < CS; y += 64) { g.fillStyle = grey(80, 0.6); g.fillRect(0, y, CS, 4); } },
    brick(g, r) { g.fillStyle = grey(140); g.fillRect(0, 0, CS, CS); for (let row = 0; row < 8; row++) for (let c = -1; c < 5; c++) { const x = c * 64 + (row % 2) * 32, y = row * 32; g.fillStyle = grey(200 + r() * 50); g.fillRect(x + 2, y + 2, 60, 28); } },
    mandala(g) {
      g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS); g.translate(128, 128);
      for (let ring = 5; ring >= 1; ring--) {
        const n = ring * 4 + 4;
        for (let i = 0; i < n; i++) { g.save(); g.rotate(i / n * TAU); g.fillStyle = `hsl(${(ring * 70 + i * 360 / n) % 360},95%,${45 + ring * 5}%)`; g.beginPath(); g.ellipse(0, -ring * 22, 7 + ring, 16, 0, 0, TAU); g.fill(); g.restore(); }
      }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill();
      g.setTransform(1, 0, 0, 1, 0, 0);
    },
    windmask(g) {
      // 風魔 bone mask: pale skull-like face, hollow glowing sockets
      face(g, '#dfe4ea', () => {
        g.fillStyle = '#141824'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(128 + s * 14, 100); g.quadraticCurveTo(128 + s * 50, 80, 128 + s * 80, 110); g.quadraticCurveTo(128 + s * 52, 140, 128 + s * 14, 120); g.fill(); }
        g.fillStyle = '#9ae8ff'; for (const s of [-1, 1]) { g.beginPath(); g.arc(128 + s * 46, 108, 8, 0, TAU); g.fill(); }
        g.strokeStyle = '#8890a0'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(80 + i * 30, 40); g.quadraticCurveTo(70 + i * 34, 64, 90 + i * 28, 80); g.stroke(); }
        g.fillStyle = '#141824'; g.beginPath(); g.moveTo(120, 140); g.lineTo(136, 140); g.lineTo(128, 160); g.fill();
      });
    },
    stars(g, r) { g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS); for (let i = 0; i < 90; i++) { const x = r() * CS, y = r() * CS, s = 1 + r() * 3; g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); } },
    blank(g) { g.fillStyle = '#fff'; g.fillRect(0, 0, CS, CS); },
    ring(g) { g.clearRect(0, 0, CS, CS); g.strokeStyle = '#fff'; for (let i = 0; i < 3; i++) { g.lineWidth = 10 - i * 3; g.globalAlpha = 1 - i * 0.3; g.beginPath(); g.arc(128, 128, 110 - i * 26, 0, TAU); g.stroke(); } g.globalAlpha = 1; },
    streak(g, r) { g.clearRect(0, 0, CS, CS); for (let i = 0; i < 26; i++) { const y = r() * CS, x = r() * CS * 0.5, l = 60 + r() * 140; const gr = g.createLinearGradient(x, 0, x + l, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.strokeStyle = gr; g.lineWidth = 2 + r() * 4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 10, x + l, y); g.stroke(); } },
    dots(g, r) { g.fillStyle = grey(235); g.fillRect(0, 0, CS, CS); for (let i = 0; i < 40; i++) { const x = r() * CS, y = r() * CS, rr = 3 + r() * 7; wrap(g, () => { g.fillStyle = grey(255); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill(); g.fillStyle = grey(140, 0.6); g.beginPath(); g.arc(x, y, rr * 0.4, 0, TAU); g.fill(); }); } },
    mouthO(g) { g.fillStyle = '#fff'; g.fillRect(0, 0, CS, CS); g.fillStyle = '#100810'; g.beginPath(); g.ellipse(128, 128, 70, 96, 0, 0, TAU); g.fill(); g.fillStyle = '#3a1020'; g.beginPath(); g.ellipse(128, 160, 40, 40, 0, 0, TAU); g.fill(); },
    bearface(g) {
      // Formosan black bear muzzle: tan snout, dark nose
      g.fillStyle = '#8a6a4a'; g.fillRect(0, 0, CS, CS);
      const gr = g.createRadialGradient(128, 110, 10, 128, 128, 130); gr.addColorStop(0, '#b8946a'); gr.addColorStop(1, '#5a4030'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS);
      g.fillStyle = '#1a1210'; g.beginPath(); g.ellipse(128, 80, 46, 30, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(116, 70, 12, 6, 0, 0, TAU); g.fill();
      g.strokeStyle = '#1a1210'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 110); g.lineTo(128, 160); g.quadraticCurveTo(100, 190, 80, 170); g.moveTo(128, 160); g.quadraticCurveTo(156, 190, 176, 170); g.stroke();
    },
    fin(g) {
      // fan membrane with rays; scalloped free edge (alpha), u across, v from base (bottom) to tip (top)
      g.clearRect(0, 0, CS, CS);
      g.beginPath(); g.moveTo(10, CS);
      const n = 7;
      for (let i = 0; i <= n; i++) { const x = 10 + i * (CS - 20) / n, y = 20 + abs(sin(i * 1.3)) * 30 + (i === 0 || i === n ? 60 : 0); g.lineTo(x, y); if (i < n) g.quadraticCurveTo(x + (CS - 20) / n / 2, y + 50, x + (CS - 20) / n, 20 + abs(sin((i + 1) * 1.3)) * 30); }
      g.lineTo(CS - 10, CS); g.closePath();
      const gr = g.createLinearGradient(0, CS, 0, 0); gr.addColorStop(0, grey(150)); gr.addColorStop(1, grey(255)); g.fillStyle = gr; g.fill();
      g.strokeStyle = grey(80, 0.8); g.lineWidth = 4;
      for (let i = 0; i <= n; i++) { const x = 10 + i * (CS - 20) / n; g.beginPath(); g.moveTo(CS / 2 + (x - CS / 2) * 0.4, CS); g.lineTo(x, 30 + abs(sin(i * 1.3)) * 30); g.stroke(); }
    },
    lantern(g) {
      // paper lantern skin (lit from inside): warm paper, vertical ribs, red bands
      g.fillStyle = '#fff0d0'; g.fillRect(0, 0, CS, CS);
      for (let x = 0; x < CS; x += 32) { g.fillStyle = 'rgba(150,90,40,0.35)'; g.fillRect(x, 0, 3, CS); }
      g.fillStyle = '#c03020'; g.fillRect(0, 0, CS, 18); g.fillRect(0, CS - 18, CS, 18);
    },
    lattice(g) { g.fillStyle = grey(235); g.fillRect(0, 0, CS, CS); g.strokeStyle = grey(70); g.lineWidth = 10; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, CS); g.moveTo(0, i * 64); g.lineTo(CS, i * 64); g.stroke(); } g.lineWidth = 4; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(32 + i * 64, 32 + j * 64, 14, 0, TAU); g.stroke(); } },
    kelp(g, r) { g.clearRect(0, 0, CS, CS); for (let i = 0; i < 3; i++) { const x0 = 50 + i * 75; g.beginPath(); for (let y = CS; y >= 0; y -= 8) g.lineTo(x0 + sin(y / 30 + i) * 14 - 14 * (y / CS), y); for (let y = 0; y <= CS; y += 8) g.lineTo(x0 + sin(y / 30 + i) * 14 + 14 * (y / CS) + 4, y); g.closePath(); g.fillStyle = grey(200 + r() * 50); g.fill(); } },
    smoke(g) { g.clearRect(0, 0, CS, CS); for (let i = 0; i < 9; i++) { const x = 60 + Math.random() * 136, y = 60 + Math.random() * 136, rr = 40 + Math.random() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); } },
    petal(g) { g.clearRect(0, 0, CS, CS); const gr = g.createLinearGradient(0, CS, 0, 0); gr.addColorStop(0, grey(170)); gr.addColorStop(1, grey(255)); g.fillStyle = gr; g.beginPath(); g.moveTo(128, CS); g.bezierCurveTo(30, 180, 40, 40, 128, 4); g.bezierCurveTo(216, 40, 226, 180, 128, CS); g.fill(); g.strokeStyle = grey(150, 0.6); g.lineWidth = 2; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(128, CS); g.quadraticCurveTo(128 + i * 30, 120, 128 + i * 20, 20); g.stroke(); } },
    shard(g) { g.fillStyle = grey(235); g.fillRect(0, 0, CS, CS); g.strokeStyle = grey(255); g.lineWidth = 3; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(Math.random() * CS, Math.random() * CS); g.lineTo(Math.random() * CS, Math.random() * CS); g.stroke(); } const gr = g.createLinearGradient(0, 0, CS, CS); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.4)'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); },
    web(g) { g.clearRect(0, 0, CS, CS); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + cos(a) * 128, 128 + sin(a) * 128); g.stroke(); } for (let r = 16; r < 128; r += 16) { g.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU; g.lineTo(128 + cos(a) * r, 128 + sin(a) * r); } g.stroke(); } },
    gold(g, r) { mottle(g, r, 220, 30, 40, 30); for (let i = 0; i < 40; i++) { const x = r() * CS, y = r() * CS; wrap(g, () => { g.strokeStyle = grey(255, 0.6); g.lineWidth = 2; g.beginPath(); g.arc(x, y, 8, 0, PI); g.stroke(); }); } },
    bandage(g, r) { g.fillStyle = grey(230); g.fillRect(0, 0, CS, CS); for (let y = 0; y < CS; y += 28) { g.fillStyle = grey(190, 0.7); g.fillRect(0, y, CS, 3); g.fillStyle = grey(250, 0.6); g.fillRect(0, y + 4, CS, 6); } speck(g, r, 400, 120, 200, 0.2); },
    brocade(g) {
      // embroidered silk (puppet costume): cloud scrolls and coin motifs, coloured gold on white (tinted per part)
      g.fillStyle = grey(225); g.fillRect(0, 0, CS, CS);
      g.strokeStyle = 'rgba(250,210,90,1)'; g.lineWidth = 5;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 64 + (j % 2) * 32, y = j * 64; g.beginPath(); g.arc(x + 16, y + 24, 12, PI, TAU * 0.9); g.arc(x + 34, y + 24, 9, PI, TAU * 0.9); g.stroke(); }
      g.fillStyle = 'rgba(250,210,90,1)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * 64 + 48 - (j % 2) * 32, j * 64 + 52, 5, 0, TAU); g.fill(); }
    },
    pandan(g, r) { g.fillStyle = grey(200); g.fillRect(0, 0, CS, CS); for (let x = 0; x < CS; x += 16) { g.fillStyle = grey(150 + r() * 80, 0.6); g.fillRect(x, 0, 6, CS); } },
    robe(g, r) { PAINT.cloth(g, r); g.strokeStyle = grey(170, 0.4); g.lineWidth = 3; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(i * 30 + 10, 0); g.quadraticCurveTo(i * 30 + 25, CS / 2, i * 30 + 5, CS); g.stroke(); } },
    qilin(g) { g.fillStyle = '#d8b040'; g.fillRect(0, 0, CS, CS); g.strokeStyle = '#7a4a10'; g.lineWidth = 6; g.strokeRect(20, 20, 216, 216); g.beginPath(); g.arc(128, 128, 70, 0, TAU); g.stroke(); g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.moveTo(128, 128); g.lineTo(128 + cos(a) * 70, 128 + sin(a) * 70); } g.stroke(); },
    mirror(g) { const gr = g.createLinearGradient(0, 0, CS, CS); gr.addColorStop(0, '#fff'); gr.addColorStop(0.45, '#9aa4b8'); gr.addColorStop(0.55, '#e8ecf4'); gr.addColorStop(1, '#6a7488'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); },
    bubble(g) { g.clearRect(0, 0, CS, CS); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6; g.beginPath(); g.arc(128, 128, 110, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(90, 80, 26, 14, -0.6, 0, TAU); g.fill(); },
    sand(g, r) { mottle(g, r, 215, 20, 50, 30); speck(g, r, 3000, 140, 255, 0.4, 1.6); for (let i = 0; i < 8; i++) { const y = r() * CS; g.strokeStyle = grey(180, 0.4); g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= CS; x += 16) g.lineTo(x, y + sin(x / 30 + i) * 6); g.stroke(); } },
    drip(g) { g.clearRect(0, 0, CS, CS); g.fillStyle = grey(255); g.fillRect(0, 0, CS, 50); for (let i = 0; i < 9; i++) { const x = 14 + i * 28, l = 60 + ((i * 53) % 150); g.beginPath(); g.moveTo(x - 10, 40); g.lineTo(x - 5, l); g.arc(x, l, 6, PI, 0, true); g.lineTo(x + 10, 40); g.fill(); } },
    heart(g) { g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#ffd0a0'); gr.addColorStop(1, 'rgba(255,120,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); },
    seal(g) { g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, CS, CS); g.strokeStyle = '#a01818'; g.lineWidth = 12; g.strokeRect(30, 30, 196, 196); g.fillStyle = '#a01818'; g.font = 'bold 120px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('封', 128, 136); },
    iris2(g) { g.fillStyle = '#f4f0ff'; g.fillRect(0, 0, CS, CS); const gr = g.createRadialGradient(128, 128, 10, 128, 128, 100); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, '#80f0ff'); gr.addColorStop(0.75, '#2050c0'); gr.addColorStop(1, '#0a0a30'); g.fillStyle = gr; g.beginPath(); g.arc(128, 128, 100, 0, TAU); g.fill(); g.fillStyle = '#05040a'; g.beginPath(); g.arc(128, 128, 30, 0, TAU); g.fill(); },
    vein(g, r) { g.fillStyle = '#000'; g.fillRect(0, 0, CS, CS); for (let i = 0; i < 6; i++) { let x = r() * CS, y = 0; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 12; k++) { x += (r() - 0.5) * 30; y += 22; g.lineTo(x, y); } g.stroke(); } },
    coral(g, r) { mottle(g, r, 210, 30, 50, 20); for (let i = 0; i < 300; i++) { const x = r() * CS, y = r() * CS; wrap(g, () => { g.fillStyle = grey(120, 0.5); g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); }); } },
    mask_g(g) { face(g, '#e8e4dc', () => { for (const s of [-1, 1]) { g.fillStyle = '#101018'; g.beginPath(); g.ellipse(128 + s * 42, 118, 16, 8, s * 0.2, 0, TAU); g.fill(); } g.strokeStyle = '#601018'; g.lineWidth = 4; g.beginPath(); g.moveTo(108, 190); g.quadraticCurveTo(128, 196, 148, 190); g.stroke(); }); },
    zigzag(g) { g.fillStyle = grey(230); g.fillRect(0, 0, CS, CS); g.strokeStyle = grey(90); g.lineWidth = 12; for (let y = 32; y < CS; y += 64) { g.beginPath(); for (let x = 0; x <= CS; x += 32) g.lineTo(x, y + ((x / 32) % 2 ? 20 : -20)); g.stroke(); } },
    moss(g, r) { mottle(g, r, 200, 40, 90, 20); for (let i = 0; i < 1500; i++) { g.fillStyle = grey(150 + r() * 100, 0.5); g.beginPath(); g.arc(r() * CS, r() * CS, 1 + r() * 2.5, 0, TAU); g.fill(); } },
    lacquer(g, r) { mottle(g, r, 235, 15, 30, 60); const gr = g.createLinearGradient(0, 0, 0, CS); gr.addColorStop(0, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.4, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); },
    string(g) { g.fillStyle = grey(240); g.fillRect(0, 0, CS, CS); for (let x = 0; x < CS; x += 8) { g.fillStyle = grey(200); g.fillRect(x, 0, 2, CS); } },
    wave(g) { g.fillStyle = grey(200); g.fillRect(0, 0, CS, CS); g.strokeStyle = grey(255); g.lineWidth = 6; for (let y = 0; y < CS + 32; y += 32) { g.beginPath(); for (let x = 0; x <= CS; x += 8) g.lineTo(x, y + sin(x / CS * TAU * 2) * 10); g.stroke(); } },
    blankA(g) { g.clearRect(0, 0, CS, CS); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS); },
  };
  function mottleColor(g, c) { for (let i = 0; i < 30; i++) { g.fillStyle = c; g.beginPath(); g.arc(Math.random() * CS, Math.random() * CS, 10 + Math.random() * 30, 0, TAU); g.fill(); } }

  function atlas() {
    if (atlasTex) return atlasTex;
    const c = document.createElement('canvas'); c.width = c.height = AT;
    const g = c.getContext('2d');
    CELLS.forEach((name, i) => {
      const cc = cellCanvas(), cg = cc.getContext('2d');
      cg.fillStyle = '#fff'; cg.fillRect(0, 0, CS, CS);
      try { (PAINT[name] || PAINT.blank)(cg, rng(hstr(name)), name); } catch (e) { console.warn('mon3d-b atlas', name, e); }
      g.drawImage(cc, (i % NC) * CP, floor(i / NC) * CP, CP, CP);
    });
    atlasTex = G.R3M.canvasTex(c, {});
    atlasTex.flipY = false; // cell (0,0) = top-left; UVs below use v down
    atlasTex.shared = true;
    atlasTex.needsUpdate = true;
    return atlasTex;
  }
  // cell rect in atlas UV space: [u0, v0, size]
  const cellRect = (name) => { const i = CI[name] != null ? CI[name] : 0; return [(i % NC) * CP / AT, floor(i / NC) * CP / AT, CP / AT]; };

  // =============================================================================================== shaders
  const UT = { value: 0 }; // shared clock
  const UPX = { value: 720 }; // drawing-buffer height for particle sizing
  const GLSL_NOISE = `
    float mbH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float mbN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(mbH(i), mbH(i + vec3(1,0,0)), f.x), mix(mbH(i + vec3(0,1,0)), mbH(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(mbH(i + vec3(0,0,1)), mbH(i + vec3(1,0,1)), f.x), mix(mbH(i + vec3(0,1,1)), mbH(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float mbF(vec3 p){ return mbN(p) * 0.55 + mbN(p * 2.07) * 0.3 + mbN(p * 4.13) * 0.15; }
    vec3 mbHue(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
    vec3 mbPsy(vec3 p, float fr, float t, vec4 P){
      vec3 q = p * P.x;
      float a = atan(q.y, q.x + 1e-4), r = length(q.xy);
      float seg = 6.28318 / P.y; a = abs(mod(a + t * 0.12, seg) - seg * 0.5);
      vec2 k = vec2(cos(a), sin(a)) * r + vec2(0.0, q.z * 0.35);
      float f = 0.0;
      for (int i = 0; i < 5; i++) { k = abs(k) / max(dot(k, k), 0.06) - vec2(0.72 + 0.06 * sin(t * 0.37), 0.58); f += exp(-abs(length(k) - 0.45) * 5.0); }
      float band = f * 0.22 + fr * 0.9 + r * 0.25 - t * P.z;
      vec3 col = 0.5 + 0.5 * cos(6.28318 * (band + vec3(0.0, 0.33, 0.67)));
      return col * (0.55 + 0.25 * f) + fr * fr * vec3(1.0, 0.9, 1.0) * 0.8;
    }`;
  // common vertex/fragment injection: atlas cell tiling, object-space position, view normal, dissolve
  function injectCommon(sh, U) {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aCell; varying vec3 vCell; varying vec3 vObj; varying vec3 vVN; varying vec3 vVP;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvCell = aCell; vObj = position;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vVP = -mvPosition.xyz;
        #if defined( USE_SKINNING ) || defined( USE_ENVMAP )
          vVN = normalize(normalMatrix * objectNormal);
        #else
          vVN = normalize(normalMatrix * normal);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCell; varying vec3 vObj; varying vec3 vVN; varying vec3 vVP;
        uniform float uTime, uFlash, uDiss, uOpac, uGlow, uHue, uScroll, uClipY, uIri; uniform vec3 uEdge; uniform vec4 uPsy;
        ${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 mbU = vMapUv + vec2(0.0, uScroll * uTime);
          vec2 mbC = vCell.xy + (0.02 + 0.96 * fract(mbU)) * vCell.z;
          vec4 sampledDiffuseColor = textureGrad(map, mbC, dFdx(mbU) * vCell.z * 0.96, dFdy(mbU) * vCell.z * 0.96);
          diffuseColor *= sampledDiffuseColor;
          float mbTexL = dot(sampledDiffuseColor.rgb, vec3(0.333));
        #else
          float mbTexL = 1.0;
        #endif`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vObj.y < uClipY) discard;
        float mbD = mbF(vObj * 2.6 + vec3(0.0, uTime * 0.05, 0.0));
        if (uDiss > 0.001 && mbD < uDiss * 1.08 - 0.04) discard;
        float mbEdge = uDiss > 0.001 ? 1.0 - smoothstep(0.0, 0.07, mbD - (uDiss * 1.08 - 0.04)) : 0.0;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mbHue(diffuseColor.rgb, uHue); diffuseColor.a *= uOpac;');
  }
  function makeU() {
    const T = THREE;
    return {
      uTime: UT, uFlash: { value: 0 }, uDiss: { value: 0 }, uOpac: { value: 1 }, uGlow: { value: 1 }, uHue: { value: 0 },
      uScroll: { value: 0 }, uClipY: { value: -100 }, uIri: { value: 0 }, uEdge: { value: new T.Color(1.6, 0.9, 0.4) }, uPsy: { value: new T.Vector4(1.6, 6, 0.08, 1) },
    };
  }
  // per-instance material set (shared U → one uniform write per frame drives every material)
  function makeMats(U, o) {
    const T = THREE, R = G.R3M, tex = atlas();
    const mats = {};
    const body = R.toon({ color: 0xffffff, map: tex, rim: o.rim != null ? o.rim : 0.3, rimColor: o.rimColor || 0xfff0e0, bands: 3 });
    body.vertexColors = true;
    const prevB = body.onBeforeCompile;
    body.onBeforeCompile = function (sh, r) {
      if (prevB) prevB.call(this, sh, r);
      injectCommon(sh, U);
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uFlash * vec3(1.0, 0.92, 0.85) + mbEdge * uEdge * 3.0;
        if (uIri > 0.0) { vec3 n = normalize(vVN); float fr = 1.0 - abs(dot(n, normalize(vVP)));
          vec3 film = 0.5 + 0.5 * cos(6.28318 * (fr * 1.3 + vObj.y * 0.18 + vObj.x * 0.1 - uTime * 0.06 + vec3(0.0, 0.33, 0.67)));
          totalEmissiveRadiance += film * uIri * uGlow * (smoothstep(0.82, 1.0, mbTexL) * 0.7 + fr * fr * 0.9); }`);
    };
    body.customProgramCacheKey = () => 'mbB';
    mats.body = body;
    const cut = R.toon({ color: 0xffffff, map: tex, rim: 0.25, side: T.DoubleSide, alphaTest: 0.45 });
    cut.vertexColors = true;
    const prevC = cut.onBeforeCompile;
    cut.onBeforeCompile = function (sh, r) {
      if (prevC) prevC.call(this, sh, r);
      injectCommon(sh, U);
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uFlash * vec3(1.0, 0.92, 0.85) + mbEdge * uEdge * 3.0;`);
    };
    cut.customProgramCacheKey = () => 'mbC';
    mats.cut = cut;
    // glow: HDR emissive with flicker; ghost: translucent fresnel; psy: kaleidoscope fractal; water: scrolling translucent
    const basic = (key, params, frag) => {
      const m = new T.MeshBasicMaterial(Object.assign({ color: 0xffffff, map: tex, vertexColors: true }, params));
      m.onBeforeCompile = (sh) => {
        injectCommon(sh, U);
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', frag + '\n#include <opaque_fragment>');
      };
      m.customProgramCacheKey = () => 'mb' + key;
      return m;
    };
    mats.glow = basic('G', { toneMapped: true }, `
      outgoingLight *= uGlow * (2.2 + 0.25 * sin(uTime * 9.0 + vObj.y * 7.0 + vObj.x * 3.0)) ;
      outgoingLight += mbEdge * uEdge * 2.0;`);
    mats.ghost = basic('H', { transparent: true, depthWrite: false, side: T.DoubleSide }, `
      { vec3 n = normalize(vVN); if (!gl_FrontFacing) n = -n;
        float fr = 1.0 - abs(dot(n, normalize(vVP)));
        float nz = mbF(vObj * 2.2 + vec3(0.0, -uTime * 0.7, uTime * 0.13));
        outgoingLight = outgoingLight * (0.75 + 0.6 * fr) * uGlow + fr * fr * diffuseColor.rgb * 0.8;
        diffuseColor.a *= (0.22 + 0.85 * pow(fr, 1.4)) * (0.55 + 0.7 * nz); }`);
    mats.psy = basic('P', {}, `
      { vec3 n = normalize(vVN); float fr = 1.0 - abs(dot(n, normalize(vVP)));
        vec3 pc = mbPsy(vObj, fr, uTime, uPsy);
        outgoingLight = mix(outgoingLight, pc * outgoingLight * 1.8 + pc * 0.25, 0.85) * uPsy.w * uGlow + mbEdge * uEdge * 2.0; }`);
    mats.soft = basic('S', { transparent: true, depthWrite: false, side: T.DoubleSide }, `outgoingLight *= uGlow;`);
    mats.add = basic('A', { transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }, `outgoingLight *= uGlow * 1.6 * (0.85 + 0.15 * sin(uTime * 11.0 + vObj.y * 9.0));`);
    mats.water = basic('W', { transparent: true, depthWrite: false, side: T.DoubleSide }, `
      { vec3 n = normalize(vVN); if (!gl_FrontFacing) n = -n; float fr = 1.0 - abs(dot(n, normalize(vVP)));
        float lt = 0.55 + 0.45 * max(0.0, n.y);
        outgoingLight = outgoingLight * lt + fr * fr * vec3(0.55, 0.85, 1.0) * 0.6;
        diffuseColor.a *= 0.3 + 0.5 * fr; }`);
    return mats;
  }

  // particles: one Points per blend mode, motion computed in the vertex shader from per-particle seeds
  function particleMat(U, additive) {
    const T = THREE;
    return new T.ShaderMaterial({
      uniforms: { uTime: UT, uPx: UPX, uOpac: U.uOpac, uGlow: U.uGlow, uK: { value: additive ? 2.2 : 1 } },
      vertexShader: `
        attribute vec4 aSeed; attribute vec4 aPar; attribute vec3 color;
        uniform float uTime, uPx, uGlow; varying vec3 vC; varying float vA;
        void main(){
          float s = aSeed.x, mode = aSeed.y, spd = aSeed.w, tt = uTime * spd + s * 37.0;
          float life = fract(tt * 0.2 + s);
          vec3 p = position; float a = 1.0;
          if (mode < 0.5) { p += vec3(sin(s * 40.0 + uTime * 1.3) * aPar.y, life * aPar.x, cos(s * 31.0 + uTime * 1.1) * aPar.y); a = sin(life * 3.14159); }
          else if (mode < 1.5) { float an = uTime * spd + s * 6.28318; p += vec3(cos(an) * aPar.x, sin(uTime * spd * 1.7 + s * 9.0) * aPar.y, sin(an) * aPar.x * aPar.z); a = 0.65 + 0.35 * sin(uTime * 4.0 + s * 20.0); }
          else if (mode < 2.5) { p += vec3(sin(s * 17.0) * aPar.y * life, -life * aPar.x, cos(s * 13.0) * aPar.y * life); a = 1.0 - life; }
          else if (mode < 3.5) { float an = s * 6.28318 + uTime * spd * 3.0 + life * 4.0; float r = aPar.x * (0.25 + life * aPar.z); p += vec3(cos(an) * r, life * aPar.y, sin(an) * r); a = sin(life * 3.14159); }
          else { p += aPar.x * vec3(sin(uTime * spd + s * 11.0), sin(uTime * spd * 0.7 + s * 7.0) * aPar.y, cos(uTime * spd * 0.9 + s * 5.0)); a = 0.6 + 0.4 * sin(uTime * 3.0 + s * 20.0); }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSeed.z * uPx * 0.5 * projectionMatrix[1][1] / max(0.2, -mv.z) * (0.55 + 0.45 * a);
          vC = color * (mode > 4.5 ? 1.0 : uGlow); vA = a;
        }`,
      fragmentShader: `
        uniform float uOpac, uK; varying vec3 vC; varying float vA;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
          float f = pow(1.0 - r, 1.6) * (uK < 1.5 ? 0.45 : 1.0); gl_FragColor = vec4(vC * uK, f * vA * uOpac);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
    });
  }

  // =============================================================================================== geometry
  const GEO = {};
  function idx(g) {
    if (!g.index) { const n = g.attributes.position.count, a = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new THREE.BufferAttribute(a, 1)); }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  }
  GEO.sph = (rx, ry = rx, rz = rx, ws = 18, hs = 12, o = {}) => idx(new THREE.SphereGeometry(1, ws, hs, o.p0 || 0, o.pl || TAU, o.t0 || 0, o.tl || PI)).scale(rx, ry, rz);
  GEO.cyl = (rt, rb, h, seg = 14, hs = 1, open = false) => idx(new THREE.CylinderGeometry(rt, rb, h, seg, hs, open));
  GEO.cone = (r, h, seg = 12) => idx(new THREE.ConeGeometry(r, h, seg));
  GEO.box = (w, h, d, r = 0) => (r > 0 ? idx(new THREE.RoundedBoxGeometry(w, h, d, 2, r)) : idx(new THREE.BoxGeometry(w, h, d)));
  GEO.tor = (R, r, rs = 8, ts = 24, arc = TAU) => idx(new THREE.TorusGeometry(R, r, rs, ts, arc));
  GEO.plane = (w, h, ws = 1, hs = 1) => idx(new THREE.PlaneGeometry(w, h, ws, hs));
  GEO.ico = (r, d = 1) => { const g = idx(new THREE.IcosahedronGeometry(r, d)); return g; };
  GEO.oct = (r) => idx(new THREE.OctahedronGeometry(r, 0));
  GEO.lathe = (pts, seg = 16) => idx(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg));
  GEO.capsule = (r, l, cs = 6, rs = 12) => idx(new THREE.CapsuleGeometry(r, l, cs, rs));
  // extruded 2D shape (pts in xy), depth along z centred
  GEO.ext = (pts, depth, bevel = 0.02) => {
    const s = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    // normalise extrude UVs (world-sized) into 0..1 over the shape bbox
    g.computeBoundingBox(); const bb = g.boundingBox, uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x + 1e-6), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y + 1e-6));
    return idx(g);
  };
  // sweep a profile along a polyline (pts: Vector3/arrays); r: number|fn(u)→radius; ell: [sx, sy] cross-section scale;
  // returns geometry plus per-vertex u (along) stored in uv.y
  GEO.sweep = (pts, r, o = {}) => {
    const T = THREE, V = T.Vector3;
    const P = pts.map((p) => (p.isVector3 ? p.clone() : new V(p[0], p[1], p[2])));
    const curve = new T.CatmullRomCurve3(P, false, 'centripetal');
    const n = o.n || max(8, P.length * 5), sides = o.sides || 10;
    const rf = typeof r === 'function' ? r : () => r;
    const ell = o.ell || [1, 1];
    const pos = [], nor = [], uvs = [], ind = [];
    const frames = curve.computeFrenetFrames(n, false);
    // parallel-transport: replace frenet normals with a stable up-based frame
    let prevN = null;
    for (let i = 0; i <= n; i++) {
      const u = i / n, c = curve.getPointAt(u), t = frames.tangents[i];
      let N;
      if (!prevN) { N = new V(0, 1, 0); if (abs(N.dot(t)) > 0.9) N.set(1, 0, 0); N.sub(t.clone().multiplyScalar(N.dot(t))).normalize(); }
      else { N = prevN.clone().sub(t.clone().multiplyScalar(prevN.dot(t))).normalize(); }
      if (o.up) { const up = new V(...o.up); up.sub(t.clone().multiplyScalar(up.dot(t))); if (up.length() > 0.35) N = up.normalize(); }
      prevN = N;
      const B = new V().crossVectors(t, N).normalize();
      const rad = rf(u);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * TAU - PI / 2, ca = cos(a) * ell[0], sa = sin(a) * ell[1];
        const nn = new V().addScaledVector(N, sa / ell[1] * ell[0]).addScaledVector(B, ca / ell[0] * ell[1]).normalize();
        pos.push(c.x + (N.x * sa + B.x * ca) * rad, c.y + (N.y * sa + B.y * ca) * rad, c.z + (N.z * sa + B.z * ca) * rad);
        nor.push(nn.x, nn.y, nn.z);
        uvs.push(j / sides, u);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < sides; j++) {
      const a = i * (sides + 1) + j, b = a + sides + 1;
      ind.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // caps
    if (o.cap !== false) for (const end of [0, n]) {
      const c = curve.getPointAt(end / n), t = frames.tangents[end].clone().multiplyScalar(end ? 1 : -1);
      const ci = pos.length / 3; pos.push(c.x + t.x * rf(end / n) * 0.3, c.y + t.y * rf(end / n) * 0.3, c.z + t.z * rf(end / n) * 0.3); nor.push(t.x, t.y, t.z); uvs.push(0.5, end / n);
      for (let j = 0; j < sides; j++) { const a = end * (sides + 1) + j; if (end) ind.push(a + 1, a, ci); else ind.push(a, a + 1, ci); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.setIndex(ind);
    if (o.smooth !== false) g.computeVertexNormals();
    return g;
  };
  // card: plane facing +z, origin at bottom-centre (for leaves, petals, flames, rags)
  GEO.card = (w, h, ws = 1, hs = 4) => { const g = GEO.plane(w, h, ws, hs); g.translate(0, h / 2, 0); return g; };
  // deform helpers
  GEO.warp = (g, fn) => { const p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; };
  GEO.lumpy = (g, amp, freq = 2, seed = 1) => GEO.warp(g, (v) => { const n = fbm(v.x * freq + seed, v.y * freq, v.z * freq) - 0.5; const l = v.length() || 1; v.multiplyScalar(1 + (n * amp) / l); });
  GEO.faceted = (g) => { const ng = g.toNonIndexed(); ng.computeVertexNormals(); return idx(ng); };

  // =============================================================================================== rig builder
  class Rig {
    constructor(id) {
      this.id = id;
      this.bones = []; this.B = {};
      this.parts = {}; // mat → [geometries]
      this.springs = []; this.lightSpec = []; this.fxSpec = []; this.phaseBones = [];
      this.r = rng(hstr(id));
      this.H = 2;
      this.bone('root', null, [0, 0, 0]);
    }
    bone(name, parent = 'root', pos = [0, 0, 0]) {
      const b = { name, parent: parent && this.B[parent] ? parent : (name === 'root' ? null : 'root'), pos: new THREE.Vector3(...pos), i: this.bones.length };
      this.bones.push(b); this.B[name] = b;
      return name;
    }
    has(n) { return !!this.B[n]; }
    // chain of bones through points (first point = first bone head)
    chain(prefix, parent, pts) { return pts.map((p, i) => this.bone(prefix + i, i ? prefix + (i - 1) : parent, p)); }
    // phase-only bone: kept at scale 0 until inst phase ≥ ph (grows in with overshoot)
    phaseBone(name, parent, pos, ph) { this.bone(name, parent, pos); this.phaseBones.push({ name, ph }); return name; }
    // ---- add a part. o: { b: bone | w: [[bone, w], …] | skin(p) → [[bone, w], …], m: mat, c: colour spec, cell, rep: [su, sv],
    //                      at, rot, s (number|[x,y,z]), uvp: 'x'|'y'|'z' planar projection (decals) }
    add(geo, o = {}) {
      const T = THREE;
      const g = geo.index ? geo : idx(geo);
      const m = new T.Matrix4().compose(new T.Vector3(...(o.at || [0, 0, 0])), new T.Quaternion().setFromEuler(new T.Euler(...(o.rot || [0, 0, 0]), o.ord || 'YXZ')),
        Array.isArray(o.s) ? new T.Vector3(...o.s) : new T.Vector3(o.s || 1, o.s || 1, o.s || 1));
      // planar decal UVs from local geometry before transform
      if (o.uvp) {
        g.computeBoundingBox(); const bb = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
        const ax = o.uvp === 'x' ? [2, 1] : o.uvp === 'y' ? [0, 2] : [0, 1];
        const mn = [bb.min.x, bb.min.y, bb.min.z], mx = [bb.max.x, bb.max.y, bb.max.z];
        for (let i = 0; i < p.count; i++) {
          const c = [p.getX(i), p.getY(i), p.getZ(i)];
          let u = (c[ax[0]] - mn[ax[0]]) / (mx[ax[0]] - mn[ax[0]] + 1e-6), v = 1 - (c[ax[1]] - mn[ax[1]]) / (mx[ax[1]] - mn[ax[1]] + 1e-6);
          if (o.uvp === 'x') u = 1 - u;
          uv.setXY(i, clamp(u, 0.003, 0.997), clamp(v, 0.003, 0.997));
        }
      } else if (o.decal) {
        const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, clamp(uv.getX(i), 0.003, 0.997), clamp(1 - uv.getY(i), 0.003, 0.997));
      }
      g.computeBoundingBox(); const lb = g.boundingBox.clone();
      g.applyMatrix4(m);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3), cell = new Float32Array(n * 3), si = new Float32Array(n * 4), sw = new Float32Array(n * 4);
      const rect = cellRect(o.cell || 'plain'), rep = o.rep || [1, 1];
      const uv = g.attributes.uv, p = g.attributes.position;
      const c = new T.Color(), c2 = new T.Color(), v = new T.Vector3();
      const cs = o.c != null ? o.c : 0xffffff;
      const pre = g.clone(); pre.applyMatrix4(new T.Matrix4().copy(m).invert()); // local positions for gradients
      const lp = pre.attributes.position;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(p, i);
        if (typeof cs === 'function') { const r = cs(v, uv.getX(i), uv.getY(i), lp.getY(i)); c.set(r); }
        else if (Array.isArray(cs)) { const t = (lp.getY(i) - lb.min.y) / (lb.max.y - lb.min.y + 1e-6); c.set(cs[0]); c2.set(cs[1]); c.lerp(c2, sm(0, 1, t)); }
        else c.set(cs);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        cell[i * 3] = rect[0]; cell[i * 3 + 1] = rect[1]; cell[i * 3 + 2] = rect[2];
        if (!o.uvp && !o.decal) uv.setXY(i, uv.getX(i) * rep[0], uv.getY(i) * rep[1]);
        let ws;
        if (o.skin) ws = o.skin(v);
        else if (o.w) ws = o.w;
        else ws = [[o.b || 'root', 1]];
        let tot = 0;
        for (let k = 0; k < 4; k++) { const e = ws[k]; if (!e) { si[i * 4 + k] = 0; sw[i * 4 + k] = 0; continue; } const b = this.B[e[0]]; si[i * 4 + k] = b ? b.i : 0; sw[i * 4 + k] = e[1]; tot += e[1]; }
        if (tot > 0) for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot; else sw[i * 4] = 1;
      }
      pre.dispose();
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      g.setAttribute('aCell', new T.BufferAttribute(cell, 3));
      g.setAttribute('skinIndex', new T.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
      const key = o.m || 'body';
      (this.parts[key] || (this.parts[key] = [])).push(g);
      return g;
    }
    // swept tube skinned smoothly along a bone chain. o: { r, sides, ell, ext: [pre, post] extension, c, cell, rep, m, n }
    tube(names, o = {}) {
      const T = THREE;
      const P = names.map((nm) => this.B[nm].pos.clone());
      const ext = o.ext || [0, 0];
      if (ext[0]) P.unshift(P[0].clone().addScaledVector(P[0].clone().sub(P[1]).normalize(), ext[0]));
      if (ext[1]) { const L = P.length; P.push(P[L - 1].clone().addScaledVector(P[L - 1].clone().sub(P[L - 2]).normalize(), ext[1])); }
      const g = GEO.sweep(P, o.r != null ? o.r : 0.1, { sides: o.sides || 10, ell: o.ell, n: o.n || (names.length + 1) * 5, cap: o.cap, up: o.up });
      if (o.warp) GEO.warp(g, o.warp);
      if (o.tile) {
        // square texels: repeats along = length / circumference × repeats around
        let len = 0; for (let i = 1; i < P.length; i++) len += P[i].distanceTo(P[i - 1]);
        let rm = 0; for (let i = 0; i <= 20; i++) rm = max(rm, typeof o.r === 'function' ? o.r(i / 20) : o.r);
        o = Object.assign({}, o, { rep: [o.tile, len / (TAU * rm) * o.tile] });
      }
      // weights: project each vertex's ring centre onto the bone polyline
      const bp = names.map((nm) => this.B[nm].pos);
      const cum = [0]; for (let i = 1; i < bp.length; i++) cum.push(cum[i - 1] + bp[i].distanceTo(bp[i - 1]));
      const v = new T.Vector3(), q = new T.Vector3();
      const skin = (pt) => {
        // nearest segment
        let best = 1e9, bi = 0, bt = 0;
        for (let i = 0; i < bp.length - 1; i++) {
          const a = bp[i], b = bp[i + 1]; q.subVectors(b, a); const L2 = q.lengthSq() || 1e-6;
          const t = clamp(v.subVectors(pt, a).dot(q) / L2, -0.5, 1.5); const d = v.copy(a).addScaledVector(q, clamp(t)).distanceToSquared(pt);
          if (d < best) { best = d; bi = i; bt = t; }
        }
        if (bp.length === 1) return [[names[0], 1]];
        if (bt >= 1 && bi === bp.length - 2) return [[names[bi + 1], 1]];
        if (bt <= 0 && bi === 0) return [[names[0], 1]];
        const t = clamp(bt);
        const wNext = 0.5 * sm(0.5, 1.0, t), wPrev = bi > 0 ? 0.5 * (1 - sm(0.0, 0.5, t)) : 0;
        const out = [[names[bi], 1 - wNext - wPrev]];
        if (wNext > 0) out.push([names[bi + 1], wNext]);
        if (wPrev > 0) out.push([names[bi - 1], wPrev]);
        return out;
      };
      return this.add(g, Object.assign({}, o, { skin, at: null, rot: null, s: null }));
    }
    spring(names, o = {}) { this.springs.push(Object.assign({ names, k: 0.35, drag: 0.25, g: 0.0, tail: null }, o)); }
    light(o) { this.lightSpec.push(o); }
    // particles. o: { mode: 'rise'|'orbit'|'fall'|'swirl'|'wander', n, at: [x,y,z], box: [sx,sy,sz], col: hex|[hex…], size, speed, p: [a,b,c], blend: 'add'|'normal', b: bone }
    fx(o) { this.fxSpec.push(o); }
    // colour helpers
    static mix(a, b, t) { return new THREE.Color(a).lerp(new THREE.Color(b), t); }
  }

  // AO + bake: darken toward the ground and toward the inside of the silhouette (cheap, painterly)
  function bakeAO(g, H, amt) {
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = lerp(1 - amt, 1, sm(0, H * 0.3, y));
      c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
    }
  }

  // template = built once per id (geometry shared by all instances)
  const TPL = {};
  function template(id) {
    if (TPL[id]) return TPL[id];
    const def = DEFS[id];
    const R = new Rig(id);
    R.H = def.h;
    def.build(R);
    const geos = {};
    let tris = 0;
    for (const k of Object.keys(R.parts)) {
      const list = R.parts[k];
      const merged = THREE.BufferGeometryUtils.mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!merged) { console.error('mon3d-b merge failed', id, k); continue; }
      if (k === 'body' || k === 'cut') bakeAO(merged, def.h, def.ao != null ? def.ao : 0.35);
      // sanitise: degenerate triangles give zero/NaN normals, which turn into NaN pixels that bloom across the screen
      const nr = merged.attributes.normal, ps = merged.attributes.position;
      let bad = 0;
      for (let i = 0; i < nr.count; i++) {
        const x = nr.getX(i), y = nr.getY(i), z = nr.getZ(i), l = Math.hypot(x, y, z);
        if (!(l > 1e-6)) { nr.setXYZ(i, 0, 1, 0); bad++; } else if (abs(l - 1) > 1e-3) nr.setXYZ(i, x / l, y / l, z / l);
        if (!isFinite(ps.getX(i) + ps.getY(i) + ps.getZ(i))) { ps.setXYZ(i, 0, 0, 0); bad++; }
      }
      if (bad && G.debug) console.warn('mon3d-b', id, k, 'fixed', bad, 'degenerate verts');
      merged.computeBoundingSphere();
      geos[k] = merged;
      tris += merged.index.count / 3;
    }
    // particles
    const fx = { add: null, normal: null };
    const groups = { add: [], normal: [] };
    for (const f of R.fxSpec) groups[f.blend === 'normal' ? 'normal' : 'add'].push(f);
    for (const bl of ['add', 'normal']) {
      const list = groups[bl]; if (!list.length) continue;
      const pos = [], seed = [], par = [], col = [];
      const r = rng(hstr(id + bl));
      const MODES = { rise: 0, orbit: 1, fall: 2, swirl: 3, wander: 4, still: 5 };
      for (const f of list) {
        const cols = (Array.isArray(f.col) ? f.col : [f.col || 0xffffff]).map((h) => new THREE.Color(h));
        const box = f.box || [0.3, 0.3, 0.3], at = f.at || [0, 1, 0], p = f.p || [1, 0.2, 1];
        for (let i = 0; i < (f.n || 20); i++) {
          pos.push(at[0] + (r() - 0.5) * box[0], at[1] + (r() - 0.5) * box[1], at[2] + (r() - 0.5) * box[2]);
          seed.push(r(), MODES[f.mode || 'rise'], (f.size || 0.12) * (0.6 + r() * 0.8), (f.speed || 1) * (0.7 + r() * 0.6));
          par.push(p[0] * (0.7 + r() * 0.6), p[1], p[2], 0);
          const c = cols[floor(r() * cols.length)]; col.push(c.r, c.g, c.b);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
      g.setAttribute('aPar', new THREE.Float32BufferAttribute(par, 4));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, def.h / 2, 0), def.h * 1.5);
      fx[bl] = g;
    }
    TPL[id] = { R, geos, fx, tris, bones: R.bones, springs: R.springs, lights: R.lightSpec, phaseBones: R.phaseBones };
    return TPL[id];
  }

  // =============================================================================================== runtime
  const ALIAS = { ko: 'die', skill: 'special', attack2: 'attack', ready: 'idle', victory: 'special', run: 'move', walk: 'move', guard: 'hurt', dodge: 'hurt', revive: 'enter', item: 'cast', spawn: 'enter', death: 'die' };
  const DUR = { attack: 1.0, cast: 1.3, hurt: 0.5, die: 1.8, special: 1.8, enter: 1.4, react: 0.6 };
  const HOLD = { die: true };

  // pose accumulator
  class Pose {
    constructor(n) { this.a = new Float32Array(n * 9); this.n = n; }
    clear() { this.a.fill(0); }
  }
  // generic clips (act on 'body' plus common limb names when present)
  const GEN = {
    idle(k) { k.p('body', 0, sin(k.t * 2.1) * 0.02 * k.h, 0); k.s('body', sin(k.t * 2.1) * 0.012); },
    move(k) { const c = k.t * 7; k.p('body', 0, abs(sin(c)) * 0.04 * k.h, 0); k.r('body', 0.08, 0, sin(c) * 0.05); },
    attack(k) {
      const u = k.u;
      const back = pulse(u, 0.0, 0.3, 0.3, 0.42), hit = pulse(u, 0.32, 0.42, 0.62, 0.95);
      k.r('body', -0.28 * back + 0.32 * hit, 0, 0); k.p('body', 0, 0.05 * back * k.h, (-0.12 * back + 0.45 * hit) * k.h * 0.5);
      k.r('armR', -1.6 * back + 0.9 * hit, 0, 0); k.r('armL', -0.5 * back + 0.4 * hit, 0, 0);
      k.fx.glow += 0.5 * hit;
    },
    cast(k) {
      const u = k.u, up = pulse(u, 0.05, 0.4, 0.75, 1.0);
      k.p('body', 0, 0.12 * up * k.h, 0); k.r('body', -0.15 * up, sin(k.t * 3) * 0.1 * up, 0);
      k.r('armL', -2.2 * up, 0, 0.4 * up); k.r('armR', -2.2 * up, 0, -0.4 * up);
      k.fx.glow += 1.4 * up; k.fx.psy += 0.8 * up;
    },
    hurt(k) {
      const u = k.u, h = pulse(u, 0, 0.08, 0.2, 1.0);
      k.r('body', -0.32 * h, 0, sin(k.ct * 50) * 0.04 * h); k.p('body', sin(k.ct * 60) * 0.03 * h * k.h, 0, -0.18 * h * k.h * 0.5);
      k.r('head', -0.3 * h, 0, 0.1 * h);
      k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.35, u)) * 1.2);
    },
    die(k) {
      const u = k.u, st = sm(0, 0.25, u), fall = sm(0.2, 0.7, u);
      k.r('body', -0.25 * st + 0.5 * fall, 0, 0.25 * fall); k.p('body', 0, -0.3 * fall * k.h, -0.15 * st * k.h);
      k.r('head', 0.4 * fall, 0, 0); k.r('armL', 0.4 * fall, 0, 0.3 * fall); k.r('armR', 0.4 * fall, 0, -0.3 * fall);
      k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.15, u)) * 0.8);
      k.fx.diss = max(k.fx.diss, sm(0.35, 1.0, u));
    },
    special(k) {
      const u = k.u, up = pulse(u, 0.05, 0.35, 0.7, 1.0), spin = sm(0.25, 0.75, u);
      k.p('body', 0, 0.25 * up * k.h, 0); k.r('body', 0, spin * TAU, 0); k.s('body', 0.12 * pulse(u, 0.35, 0.5, 0.55, 0.8));
      k.r('armL', -1.5 * up, 0, 0.8 * up); k.r('armR', -1.5 * up, 0, -0.8 * up);
      k.fx.glow += 2.0 * up; k.fx.psy += 1.2 * up;
    },
    enter(k) {
      const u = k.u, rise = sm(0, 0.7, u);
      k.p('body', 0, (-0.5 + 0.5 * rise) * k.h * 0.4, 0); k.s('body', -0.5 * (1 - rise));
      k.fx.diss = max(k.fx.diss, 1 - sm(0.0, 0.8, u)); k.fx.glow += 1.2 * pulse(u, 0.4, 0.7, 0.8, 1);
    },
    react(k) { const h = pulse(k.u, 0, 0.15, 0.3, 0.8); k.p('body', 0, 0.12 * h * k.h * 0.4, 0); k.s('body', 0.05 * h); },
  };

  let _v, _v2, _v3, _q, _q2;
  function tmp() { if (!_v) { _v = new THREE.Vector3(); _v2 = new THREE.Vector3(); _v3 = new THREE.Vector3(); _q = new THREE.Quaternion(); _q2 = new THREE.Quaternion(); } }

  class MonB {
    constructor(id, opts) {
      const T = THREE;
      tmp();
      const def = DEFS[id], tpl = template(id);
      this.id = id; this.def = def; this.tpl = tpl; this.opts = opts;
      this.context = opts.context || 'battle';
      this.root = new T.Group(); this.root.name = 'mon3d:' + id;
      this.rig = new T.Group(); this.root.add(this.rig);
      this.height = def.h;
      this.yaw = 0; this.speed = 0; this.mv = 0; this.t = 0; this.phase = opts.phase || 1; this.phaseT = {};
      this.r = rng(hstr(id) ^ ((Math.random() * 1e9) | 0));
      this.rnd = [this.r(), this.r(), this.r(), this.r()];
      // bones
      this.bones = tpl.bones.map((b) => { const bn = new T.Bone(); bn.name = b.name; return bn; });
      this.B = {};
      tpl.bones.forEach((b, i) => {
        const bn = this.bones[i]; this.B[b.name] = bn;
        if (b.parent) { const p = tpl.R.B[b.parent]; bn.position.copy(b.pos).sub(p.pos); this.bones[p.i].add(bn); }
        else { bn.position.copy(b.pos); this.rig.add(bn); }
      });
      this.rest = this.bones.map((b) => b.position.clone());
      this.rig.updateMatrixWorld(true);
      this.skeleton = new T.Skeleton(this.bones);
      // materials & meshes
      this.U = makeU();
      this.U.uHue.value = [0, 0.6, -0.9][opts.variant || 0] || 0;
      if (def.psy) this.U.uPsy.value.set(...def.psy);
      if (def.edge) this.U.uEdge.value.set(...def.edge);
      if (def.clipY != null) this.U.uClipY.value = def.clipY;
      if (def.iri) this.U.uIri.value = def.iri;
      if (def.scroll) this.U.uScroll.value = def.scroll;
      this.mats = makeMats(this.U, def);
      this.meshes = {};
      const order = ['body', 'cut', 'glow', 'psy', 'ghost', 'water', 'soft', 'add'];
      for (const k of order) {
        const g = tpl.geos[k]; if (!g) continue;
        const m = new T.SkinnedMesh(g, this.mats[k]);
        m.bind(this.skeleton);
        m.frustumCulled = false;
        m.castShadow = (k === 'body' || (k === 'psy' && def.psyShadow !== false)) && def.shadow !== false;
        m.receiveShadow = k === 'body' || k === 'cut';
        if (k === 'ghost' || k === 'water' || k === 'soft' || k === 'add') m.renderOrder = 2;
        this.rig.add(m); this.meshes[k] = m;
        if (k === 'body' && def.outline !== 0) {
          const ol = G.R3M.outline(m, { width: def.outline || 0.003, color: def.olColor || 0x1a1014 });
          const om = ol.material, prev = om.onBeforeCompile, U = this.U;
          om.onBeforeCompile = (sh, r) => {
            if (prev) prev(sh, r);
            sh.uniforms.uDiss = U.uDiss; sh.uniforms.uOpac = U.uOpac; sh.uniforms.uTime = UT; sh.uniforms.uClipY = U.uClipY;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDiss, uOpac, uTime, uClipY;${GLSL_NOISE}`)
              .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
                if (vObj.y < uClipY) discard;
                if (uDiss > 0.001 && mbF(vObj * 2.6 + vec3(0.0, uTime * 0.05, 0.0)) < uDiss * 1.08 + 0.02) discard;`)
              .replace('#include <opaque_fragment>', 'diffuseColor.a *= uOpac;\n#include <opaque_fragment>');
          };
          om.customProgramCacheKey = () => 'mbO';
          om.transparent = false;
          ol.frustumCulled = false;
          this.rig.add(ol); this.meshes.outline = ol;
        }
      }
      // particles
      this.pmats = [];
      for (const bl of ['add', 'normal']) {
        const g = tpl.fx[bl]; if (!g) continue;
        const pm = particleMat(this.U, bl === 'add'); this.pmats.push(pm);
        const pts = new T.Points(g, pm); pts.frustumCulled = false; pts.renderOrder = 3;
        this.rig.add(pts); this.meshes['fx_' + bl] = pts;
      }
      // springs
      this.springs = tpl.springs.map((s) => ({ spec: s, joints: s.names.map((n) => ({ bone: this.B[n] })), init: false }));
      this.pose = new Pose(this.bones.length);
      this.clip = null; this.prev = null;
      this.fx = { flash: 0, glow: 0, diss: 0, psy: 0 };
      this.look = null; this.lookYaw = 0; this.lookPitch = 0;
      this.opacity = 1;
      this.mapScale = 1;
      if (this.context === 'map') {
        const target = def.boss ? 2.4 : 1.55;
        this.mapScale = min(1, target / def.h);
        this.root.scale.setScalar(this.mapScale);
        this.height = def.h * this.mapScale;
      }
      if (opts.phase) this.setPhase(opts.phase, true);
      this.state = {}; // free per-creature runtime state
      if (def.init) def.init(this);
      this.update(0);
    }
    // ---- interface
    setFacing(yaw) { this.yaw = yaw; }
    setMove(speed) { this.speed = speed; }
    play(name, o = {}) {
      if (!name) { if (this.clip && this.clip.name !== 'die') { this.prev = this.clip; this.prev.fadeOut = true; this.clip = null; } return; }
      name = ALIAS[name] || name;
      if (name === 'idle' || name === 'move') { this.play(null); return; }
      if (name.startsWith('phase')) { this.setPhase(parseInt(name.slice(5), 10) || 2); return; }
      const dur = (this.def.dur && this.def.dur[name]) || DUR[name] || 1.2;
      if (this.clip) { this.prev = this.clip; this.prev.fadeOut = true; }
      this.clip = { name, t: 0, dur, loop: !!o.loop, onDone: o.onDone, w: this.prev ? 0 : 1, hold: HOLD[name] && !o.loop };
      if (name === 'enter') this.clip.w = 1;
    }
    emote(k) { if (!this.clip) { this.clip = { name: 'react', t: 0, dur: 0.6, w: 0, loop: false }; } if (k === '💢') this.fx.flash = 0.4; }
    setExpression(name) { this.expr = name; }
    lookAt(v) { this.look = v ? v.clone() : null; }
    setOpacity(a, ghost) { this.opacity = a * (ghost ? 0.7 : 1); }
    setPhase(n, instant) {
      if (n === this.phase && !instant) return;
      this.phase = n; this.phaseStart = this.t;
      if (!instant) { this.fx.flash = 1.2; if (!this.clip || this.clip.name !== 'die') this.play('special'); }
      if (this.def.onPhase) this.def.onPhase(this, n, instant);
      if (instant) for (const pb of this.tpl.phaseBones) this.phaseT[pb.name] = n >= pb.ph ? 1 : 0;
    }
    bone(name) { const map = { hips: 'body', spine: 'body', chest: 'chest', neck: 'neck', head: 'head', handL: 'handL', handR: 'handR', footL: 'footL', footR: 'footR' }; return this.B[name] || this.B[map[name]] || this.B.head || this.B.body || this.B.root; }
    lights() {
      const out = [];
      this.rig.updateMatrixWorld(true);
      for (const l of this.tpl.lights) {
        const b = this.B[l.b || 'root']; if (!b) continue;
        if (l.ph && this.phase < l.ph) continue;
        const p = new THREE.Vector3(...(l.at || [0, 0, 0])); const bp = this.tpl.R.B[l.b || 'root'].pos;
        p.sub(bp); b.localToWorld(p);
        out.push({ x: p.x, y: p.y, z: p.z, color: l.color, i: (l.i || 1) * (1 + this.fx.glow * 0.3) * (1 - this.U.uDiss.value), r: l.r || 4, flicker: l.flicker || 0.1 });
      }
      return out;
    }
    dispose() {
      for (const k in this.mats) this.mats[k].dispose();
      for (const m of this.pmats) m.dispose();
      if (this.meshes.outline) this.meshes.outline.material.dispose();
      this.skeleton.dispose();
      if (this.root.parent) this.root.parent.remove(this.root);
    }
    // ---- frame
    update(dt, camYaw, camera) {
      dt = min(dt || 0, 0.1);
      this.t += dt;
      UT.value = now();
      if (G.R3 && G.R3.renderer) { const r = G.R3.renderer; UPX.value = r.domElement.height || 720; }
      // locomotion blend
      const tgt = this.speed > 0.15 ? 1 : 0;
      this.mv += (tgt - this.mv) * min(1, dt * 8);
      // clip timing & fades
      const fade = 0.14;
      const c = this.clip;
      if (c) {
        c.t += dt;
        c.w = min(1, c.w + dt / fade);
        if (c.t >= c.dur) {
          if (c.loop) c.t -= c.dur;
          else if (c.hold) c.t = c.dur;
          else { const cb = c.onDone; this.prev = c; c.fadeOut = true; this.clip = null; if (cb) cb(); }
        }
      }
      if (this.prev) { this.prev.w -= dt / (this.prev.name === 'enter' ? 0.05 : 0.22); if (this.prev.w <= 0) this.prev = null; }
      // phase growth
      for (const pb of this.tpl.phaseBones) {
        const on = this.phase >= pb.ph ? 1 : 0;
        let v = this.phaseT[pb.name] != null ? this.phaseT[pb.name] : on;
        v += (on - v) * min(1, dt * 2.2) + (on > v ? dt * 0.3 : -dt * 0.3);
        v = clamp(v); this.phaseT[pb.name] = v;
      }
      // pose
      const P = this.pose; P.clear();
      const fx = this.fx; fx.flash = max(0, fx.flash - dt * 3); fx.glow = 0; fx.diss = 0; fx.psy = 0;
      const k = this.kit || (this.kit = this.makeKit());
      k.t = this.t; k.dt = dt; k.h = this.def.h; k.mv = this.mv; k.sp = this.speed; k.ph = this.phase; k.fx = fx;
      const def = this.def;
      const clipW = (this.clip ? this.clip.w : 0) + (this.prev ? max(0, this.prev.w) : 0);
      const baseW = 1 - min(1, clipW) * (def.override != null ? def.override : 0.55);
      // base layer
      k.w = baseW * (1 - this.mv); k.ct = this.t; k.u = 0; (def.idle || GEN.idle)(k);
      if (this.mv > 0.01) { k.w = baseW * this.mv; (def.move || GEN.move)(k); }
      const runClip = (cl, w) => {
        if (!cl || w <= 0) return;
        k.w = w; k.ct = cl.t; k.u = clamp(cl.t / cl.dur); k.clip = cl.name;
        const f = (def.clips && def.clips[cl.name]) || GEN[cl.name];
        if (f) f(k, GEN);
      };
      if (this.prev) runClip(this.prev, max(0, this.prev.w));
      if (this.clip) runClip(this.clip, this.clip.w);
      k.clip = null;
      if (def.always) { k.w = 1; k.ct = this.t; def.always(k, this); }
      // apply
      const a = P.a;
      for (let i = 0; i < this.bones.length; i++) {
        const b = this.bones[i], o = i * 9;
        b.position.set(this.rest[i].x + a[o + 3], this.rest[i].y + a[o + 4], this.rest[i].z + a[o + 5]);
        b.rotation.set(a[o], a[o + 1], a[o + 2], 'YXZ');
        b.scale.set(1 + a[o + 6], 1 + a[o + 7], 1 + a[o + 8]);
      }
      for (const pb of this.tpl.phaseBones) {
        const v = this.phaseT[pb.name], b = this.B[pb.name];
        const s = v <= 0.001 ? 1e-4 : v * (1 + 0.25 * sin(v * PI));
        b.scale.multiplyScalar(s);
      }
      // look-at (head yaw/pitch in root space)
      if (this.look && this.B.head) {
        this.root.updateMatrixWorld(true);
        const lp = this.root.worldToLocal(_v.copy(this.look));
        const hp = this.tpl.R.B.head.pos;
        const ty = clamp(atan2(lp.x - hp.x, lp.z - hp.z), -0.7, 0.7), tp = clamp(-atan2(lp.y - hp.y, Math.hypot(lp.x - hp.x, lp.z - hp.z)), -0.4, 0.4);
        this.lookYaw += (ty - this.lookYaw) * min(1, dt * 5); this.lookPitch += (tp - this.lookPitch) * min(1, dt * 5);
      } else { this.lookYaw *= 1 - min(1, dt * 3); this.lookPitch *= 1 - min(1, dt * 3); }
      if (this.B.head && (abs(this.lookYaw) > 1e-3 || abs(this.lookPitch) > 1e-3)) { this.B.head.rotation.y += this.lookYaw; this.B.head.rotation.x += this.lookPitch; }
      // facing
      this.root.rotation.y = this.yaw;
      this.root.updateMatrixWorld(true);
      // springs
      this.stepSprings(dt);
      // material uniforms
      const U = this.U;
      U.uFlash.value = fx.flash;
      U.uDiss.value = clamp(fx.diss);
      U.uGlow.value = (def.glowBase || 1) * (1 + fx.glow) * (this.phase > 1 ? (def.phaseGlow || 1.25) : 1);
      U.uPsy.value.w = (def.psy ? def.psy[3] : 1) * (1 + fx.psy * 0.6);
      const op = this.opacity * (1 - (fx.diss >= 0.999 ? 1 : 0));
      U.uOpac.value = op;
      const tr = op < 0.99;
      for (const kk of ['body', 'cut']) { const m = this.mats[kk]; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } }
      if (this.meshes.outline) this.meshes.outline.visible = op > 0.6;
      if (def.tick) def.tick(this, dt);
    }
    makeKit() {
      const self = this, P = this.pose.a, B = this.tpl.R.B;
      const k = {
        t: 0, dt: 0, ct: 0, u: 0, w: 1, h: 1, mv: 0, sp: 0, ph: 1, fx: this.fx, rnd: this.rnd, inst: this,
        r(b, x, y = 0, z = 0) { const bb = B[b]; if (!bb) return; const o = bb.i * 9, w = k.w; P[o] += x * w; P[o + 1] += y * w; P[o + 2] += z * w; },
        p(b, x, y = 0, z = 0) { const bb = B[b]; if (!bb) return; const o = bb.i * 9 + 3, w = k.w; P[o] += x * w; P[o + 1] += y * w; P[o + 2] += z * w; },
        s(b, x, y, z) { const bb = B[b]; if (!bb) return; const o = bb.i * 9 + 6, w = k.w; if (y == null) { y = x; z = x; } P[o] += x * w; P[o + 1] += y * w; P[o + 2] += z * w; },
        // travelling wave down a chain: rotation axis ax ('x'|'y'|'z'), amplitude, wavelength (bones), speed, phase offset
        wave(names, ax, amp, wl, spd, ph = 0, ampFn) {
          for (let i = 0; i < names.length; i++) {
            const v = sin(k.t * spd - i / wl * TAU + ph) * amp * (ampFn ? ampFn(i / max(1, names.length - 1)) : 1);
            if (ax === 'x') k.r(names[i], v); else if (ax === 'y') k.r(names[i], 0, v); else k.r(names[i], 0, 0, v);
          }
        },
        gen(name) { GEN[name](k); },
        phaseT(name) { return self.phaseT[name] || 0; },
      };
      return k;
    }
    stepSprings(dt) {
      if (!this.springs.length) return;
      // teleports (spawn placement, scene changes) would fling the chains: reset when the root jumps
      const rp = _v.setFromMatrixPosition(this.root.matrixWorld);
      if (this.lastRootPos && rp.distanceTo(this.lastRootPos) > 0.6 * max(1, this.def.h / 3)) for (const s of this.springs) s.init = false;
      this.lastRootPos = (this.lastRootPos || new THREE.Vector3()).copy(rp);
      const step = 1 / 60;
      this.sAcc = (this.sAcc || 0) + dt;
      let n = 0;
      // keep at least one evaluation each frame so springs follow the pose even at dt=0
      const steps = max(1, min(4, floor(this.sAcc / step)));
      this.sAcc = max(0, this.sAcc - steps * step);
      for (const s of this.springs) {
        const sp = s.spec, js = s.joints;
        for (let i = 0; i < js.length; i++) {
          const j = js[i];
          if (!j.tailLocal) {
            // tail = next joint's rest head, else an explicit tail, else continue the bone's own direction
            const next = js[i + 1] ? js[i + 1].bone : null;
            j.tailLocal = next ? this.rest[this.bones.indexOf(next)].clone()
              : sp.tail ? new THREE.Vector3(...sp.tail) : this.rest[this.bones.indexOf(j.bone)].clone();
          }
        }
        for (let st = 0; st < steps; st++) {
          for (let i = 0; i < js.length; i++) {
            const j = js[i], b = j.bone;
            b.parent.updateWorldMatrix(true, false);
            b.updateMatrixWorld(true);
            const head = _v.setFromMatrixPosition(b.matrixWorld);
            const restTail = _v2.copy(j.tailLocal).applyMatrix4(b.matrixWorld);
            if (!j.cur || !s.init) { j.cur = restTail.clone(); j.prev = restTail.clone(); }
            const vel = _v3.subVectors(j.cur, j.prev).multiplyScalar(1 - sp.drag);
            const next = j.cur.clone().add(vel).addScaledVector(_v2.clone().sub(j.cur), sp.k);
            next.y -= (sp.g || 0) * step;
            if (sp.wind) next.x += sin(this.t * 1.7 + i) * sp.wind * step;
            // length constraint
            const wl = restTail.distanceTo(head) || 1e-6;
            const dir = next.sub(head); const L = dir.length() || 1e-6; dir.multiplyScalar(wl / L);
            const nt = head.clone().add(dir);
            j.prev.copy(j.cur); j.cur.copy(nt);
            // rotate bone so restTail → nt
            const from = _v2.sub(head).normalize(), to = dir.normalize();
            const dq = _q.setFromUnitVectors(from, to);
            const pw = b.parent.getWorldQuaternion(_q2);
            const pwi = pw.clone().invert();
            // local' = pwi * dq * pw * local
            b.quaternion.premultiply(pwi.multiply(dq).multiply(pw));
            b.updateMatrixWorld(true);
          }
          s.init = true;
        }
        n++;
      }
      return n;
    }
  }

  // =============================================================================================== registry glue
  const DEFS = {};
  function defB(id, def) {
    DEFS[id] = def;
    G.Mon3D.define(id, (opts) => new MonB(id, opts || {}));
  }
  G.Mon3D.B = { DEFS, TPL, template, atlas, GEO, Rig, keys, pulse, sm, clamp, lerp, CELLS, MonB };

  // shorthand used by the creature builds below
  const C = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
  void C; void keys; void pulse; void pow; void sqrt;

  // ----------------------------------------------------------------------------------------- build helpers
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // face/decal shell: front slice of an ellipsoid with planar-z UVs (cell painted as a face)
  function faceShell(R, cell, at, rx, ry, rz, o = {}) {
    const g = GEO.sph(rx, ry, rz, 20, 14, { p0: PI / 2 - (o.wide || 1.1), pl: (o.wide || 1.1) * 2, t0: o.t0 || 0.35, tl: o.tl || 2.2 });
    // SphereGeometry phi starts at -x going toward +z… rotate so the slice faces +z
    return R.add(g, Object.assign({ cell, uvp: 'z', at, c: o.c || 0xffffff }, o));
  }
  // pair of eyes as glowing ellipsoids
  function eyes(R, b, at, sep, r, col, o = {}) {
    for (const s of [-1, 1]) R.add(GEO.sph(r, r * (o.sy || 0.8), r * 0.5, 10, 8), { b, m: o.m || 'glow', c: col, cell: o.cell || 'blank', at: [at[0] + s * sep, at[1], at[2]], rot: [0, s * (o.yaw || 0.25), s * (o.roll || 0)] });
  }
  // glowing line along points (cracks, veins, runes)
  function glowLine(R, pts, r, col, o = {}) { return R.add(GEO.sweep(pts, r, { sides: 5, n: o.n || pts.length * 4 }), Object.assign({ m: 'glow', c: col, cell: 'blank' }, o)); }
  // points on an ellipsoid surface (for cracks/veins that hug a body)
  function onEll(c, r, a, h) { return [c[0] + cos(a) * r[0] * sqrt(1 - h * h), c[1] + h * r[1], c[2] + sin(a) * r[2] * sqrt(1 - h * h)]; }
  // skin weights blending two bones by height
  const byY = (a, b, y0, y1) => (p) => { const t = sm(y0, y1, p.y); return [[a, 1 - t], [b, t]]; };
  const byZ = (a, b, z0, z1) => (p) => { const t = sm(z0, z1, p.z); return [[a, 1 - t], [b, t]]; };

  /* CREATURES */
  // ============================================================================ humanoid toolkit
  // biped(R, p): standard bones body/chest/neck/head, arm*/fore*/hand*, leg*/shin*/foot* (L = −x, R = +x). Faces +z.
  function biped(R, p) {
    const hip = p.hip, cz = p.cz || 0;
    R.bone('body', 'root', [0, hip, 0]);
    R.bone('chest', 'body', [0, p.chest, cz]);
    R.bone('neck', 'chest', [0, p.neck, cz + (p.nz || 0)]);
    R.bone('head', 'neck', [0, p.head, cz + (p.hz || 0.02)]);
    for (const s of [-1, 1]) {
      const L = s < 0 ? 'L' : 'R', sw = p.sw, out = p.armOut != null ? p.armOut : 0.06, al = p.arm;
      R.bone('arm' + L, 'chest', [s * sw, p.sy, cz]);
      R.bone('fore' + L, 'arm' + L, [s * (sw + out), p.sy - al * 0.48, cz + 0.02]);
      R.bone('hand' + L, 'fore' + L, [s * (sw + out * 1.3), p.sy - al * 0.94, cz + 0.07]);
      if (p.legs !== false) {
        const hw = p.hw;
        R.bone('leg' + L, 'body', [s * hw, hip - 0.04, 0]);
        R.bone('shin' + L, 'leg' + L, [s * hw * 1.02, hip * 0.52, 0.04]);
        R.bone('foot' + L, 'shin' + L, [s * hw, 0.08, 0]);
      }
    }
  }
  const sideL = (s) => (s < 0 ? 'L' : 'R');
  // limbs as swept tubes over the arm/leg chains
  function limbs(R, o) {
    for (const s of [-1, 1]) {
      const L = sideL(s);
      if (o.arm) R.tube(['arm' + L, 'fore' + L, 'hand' + L], Object.assign({ sides: 10, ext: [0.03, 0.02] }, o.arm));
      if (o.leg && R.has('leg' + L)) R.tube(['leg' + L, 'shin' + L, 'foot' + L], Object.assign({ sides: 10, ext: [0.04, 0] }, o.leg));
    }
  }
  // hanging cloth (skirt / robe / coat-tails): lathe from waist to hem, skinned to n spring chains (2 bones each).
  // o: { y0, y1, r0, r1, n, c, cell, rep, m, z (centre z), from: [a0, a1] angular range (default full), flare, sides, k, drag, g, parent }
  function skirt(R, o) {
    const n = o.n || 8, y0 = o.y0, y1 = o.y1, pz = o.z || 0, px = o.x || 0, par = o.parent || 'body', pre = o.name || 'sk';
    const a0 = o.from ? o.from[0] : 0, a1 = o.from ? o.from[1] : TAU, full = !o.from;
    const chains = [];
    for (let i = 0; i < n; i++) {
      const a = full ? (i / n) * TAU : lerp(a0, a1, n > 1 ? i / (n - 1) : 0.5);
      const ym = lerp(y0, y1, 0.45);
      const rm = lerp(o.r0, o.r1, 0.45);
      const b0 = R.bone(pre + i + 'a', par, [px + sin(a) * o.r0 * 0.9, y0 - 0.02, pz + cos(a) * o.r0 * 0.9]);
      const b1 = R.bone(pre + i + 'b', b0, [px + sin(a) * rm, ym, pz + cos(a) * rm]);
      chains.push({ a, b0, b1 });
      R.spring([b0, b1], { k: o.k || 0.22, drag: o.drag || 0.2, g: o.g != null ? o.g : 0.3, tail: [sin(a) * (o.r1 - rm), y1 - ym, cos(a) * (o.r1 - rm)] });
    }
    const sides = o.sides || n * 4, hs = o.hs || 8;
    const g = new THREE.CylinderGeometry(1, 1, 1, sides, hs, true, full ? 0 : a0, full ? TAU : a1 - a0);
    GEO.warp(g, (v) => {
      const t = 0.5 - v.y; // 0 top → 1 bottom
      const r = lerp(o.r0, o.r1, o.flare ? o.flare(t) : t);
      const wav = o.wave ? 1 + sin(atan2(v.x, v.z) * o.wave) * 0.04 * t : 1;
      v.x *= r * wav; v.z *= r * wav; v.y = lerp(y0, y1, t);
      v.x += px; v.z += pz;
    });
    idx(g);
    const skin = (pt) => {
      const t = clamp((y0 - pt.y) / (y0 - y1));
      let a = atan2(pt.x - px, pt.z - pz); if (a < 0) a += TAU;
      // two nearest chains by angle
      let j0 = 0, j1 = 0, f = 0;
      if (full) { const fi = a / TAU * n; j0 = floor(fi) % n; j1 = (j0 + 1) % n; f = fi - floor(fi); }
      else { let aa = a; if (aa > a1 + 0.5) aa -= TAU; const fi = clamp((aa - a0) / (a1 - a0)) * (n - 1); j0 = min(n - 1, floor(fi)); j1 = min(n - 1, j0 + 1); f = fi - j0; }
      const A = chains[j0], B = chains[j1];
      const wTop = 1 - sm(0, 0.25, t), w1 = sm(0.35, 0.75, t), w0 = (1 - wTop) * (1 - w1);
      const out = [];
      if (wTop > 0.001) out.push([par, wTop]);
      if (w0 > 0.001) { out.push([A.b0, w0 * (1 - f)]); out.push([B.b0, w0 * f]); }
      if (w1 > 0.001) { out.push([A.b1, w1 * (1 - f)]); out.push([B.b1, w1 * f]); }
      out.sort((x, y) => y[1] - x[1]);
      return out.slice(0, 4);
    };
    R.add(g, { skin, c: o.c, cell: o.cell || 'cloth', rep: o.rep || [4, 2], m: o.m || 'body' });
    return chains;
  }
  // hair strand / ribbon / tassel: chain through pts (first = root on parent), flattened tube, spring
  function strand(R, name, parent, pts, o = {}) {
    const ch = R.chain(name, parent, pts);
    R.tube(ch, { r: o.r || ((u) => 0.05 * (1 - u * 0.7)), ell: o.ell || [1, 0.4], sides: o.sides || 6, c: o.c, cell: o.cell || 'hair', rep: o.rep || [1, 2], m: o.m, ext: [0, o.tip || 0.08], up: o.up });
    R.spring(ch.slice(0, ch.length), { k: o.k || 0.16, drag: o.drag || 0.15, g: o.g != null ? o.g : 0.5, tail: o.tail });
    return ch;
  }
  // humanoid motion library (s = side sign)
  const HUM = {
    idle(k, o = {}) {
      const b = sin(k.t * 1.7), sw = sin(k.t * 0.55);
      k.p('body', sw * 0.015, b * 0.012, 0); k.r('body', 0, sw * 0.05, sw * 0.02);
      k.r('chest', 0.03 + b * 0.015, -sw * 0.03, 0); k.s('chest', b * 0.012);
      k.r('head', sin(k.t * 0.8) * 0.04, sin(k.t * 0.37) * 0.15, 0);
      for (const s of [-1, 1]) {
        const L = sideL(s);
        k.r('arm' + L, 0.05 + b * 0.03, 0, s * (o.armOut || 0.08)); k.r('fore' + L, -(o.elbow || 0.2), 0, 0);
        k.r('leg' + L, -0.03, 0, 0); k.r('shin' + L, 0.06, 0, 0);
      }
    },
    walk(k, o = {}) {
      const c = k.t * (o.rate || 7), st = o.stride || 0.5;
      k.p('body', 0, abs(sin(c)) * 0.05 * (o.bob || 1), 0); k.r('body', 0.06, sin(c) * 0.12, 0); k.r('chest', 0.04, -sin(c) * 0.16, 0);
      for (const s of [-1, 1]) {
        const L = sideL(s), ph = c + (s < 0 ? 0 : PI);
        k.r('leg' + L, sin(ph) * st, 0, 0); k.r('shin' + L, max(0, -cos(ph)) * st * 1.4 + 0.05, 0, 0); k.r('foot' + L, -sin(ph) * 0.2, 0, 0);
        k.r('arm' + L, -sin(ph) * st * 0.8, 0, s * 0.08); k.r('fore' + L, -0.3 - max(0, -sin(ph)) * 0.3, 0, 0);
      }
    },
    // overhead weapon chop with the right arm: anticipation (raise, coil), strike, follow-through, recover
    chop(k, o = {}) {
      const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.42), hit = pulse(u, 0.36, 0.46, 0.62, 0.95);
      k.r('body', -0.15 * back + 0.25 * hit, 0.35 * back - 0.25 * hit, 0); k.p('body', 0, -0.03 * hit, 0.35 * hit * (o.lunge || 1));
      k.r('chest', -0.15 * back + 0.25 * hit, 0.3 * back - 0.4 * hit, 0);
      k.r('armR', -2.8 * back + 0.3 * hit, 0, 0.3 * back); k.r('foreR', -0.9 * back - 0.1 * hit, 0, 0); k.r('handR', -0.5 * back + 0.6 * hit, 0, 0);
      k.r('armL', -0.6 * back + 0.3 * hit, 0, -0.3 * back); k.r('foreL', -0.6 * back);
      k.r('legL', -0.45 * hit); k.r('shinL', 0.45 * hit); k.r('legR', 0.35 * hit); k.r('shinR', 0.2 * hit);
      k.fx.glow += 0.6 * hit;
    },
    // forward thrust (spear/halberd/claws) with both arms
    thrust(k) {
      const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.42), hit = pulse(u, 0.36, 0.45, 0.62, 0.95);
      k.r('body', 0.3 * hit - 0.15 * back, -0.4 * back + 0.3 * hit, 0); k.p('body', 0, 0, 0.45 * hit - 0.1 * back);
      k.r('armR', -0.3 * back - 1.4 * hit, 0, 0.2 * back); k.r('foreR', -1.6 * back + 0.2 * hit); k.r('armL', -0.9 * hit - 0.3 * back); k.r('foreL', -0.8 * back - 0.5 * hit);
      k.r('legL', -0.5 * hit); k.r('shinL', 0.5 * hit); k.r('legR', 0.4 * hit);
    },
    cast(k, o = {}) {
      const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1), wind = pulse(u, 0, 0.12, 0.12, 0.3);
      k.r('body', -0.05 * up + 0.1 * wind, 0, 0); k.p('body', 0, 0.06 * up + (o.float || 0) * up, 0);
      k.r('chest', -0.2 * up); k.r('head', -0.25 * up);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -1.9 * up + 0.3 * wind, 0, s * 0.6 * up); k.r('fore' + L, -0.5 * up); k.r('hand' + L, -0.4 * up); }
      k.fx.glow += 1.6 * up; k.fx.psy += up;
    },
    hurt(k) {
      const u = k.u, h = pulse(u, 0, 0.07, 0.18, 1);
      k.r('body', -0.25 * h, 0.1 * h, 0); k.p('body', 0, -0.03 * h, -0.2 * h);
      k.r('chest', -0.25 * h); k.r('head', -0.4 * h, 0, 0.15 * h);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -0.5 * h, 0, s * 0.5 * h); k.r('fore' + L, -0.6 * h); }
      k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.35, u)) * 1.2);
    },
    die(k, o = {}) {
      const u = k.u, st = sm(0, 0.2, u), fall = sm(0.2, 0.65, u);
      k.r('body', -0.2 * st - (o.back ? 1.2 : -0.9) * fall * 0.0, 0, 0);
      k.p('body', 0, -k.h * 0.32 * fall, -0.25 * st);
      k.r('body', 0.6 * fall, 0, 0.15 * fall); k.r('chest', 0.3 * fall); k.r('head', 0.5 * fall - 0.3 * st);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, 0.3 * fall - 0.6 * st, 0, s * 0.3 * fall); k.r('fore' + L, -0.4 * fall); k.r('leg' + L, -1.3 * fall); k.r('shin' + L, 1.9 * fall); k.r('foot' + L, -0.5 * fall); }
      k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.15, u)) * 0.8); k.fx.diss = max(k.fx.diss, sm(0.4, 1, u));
    },
    special(k) {
      // leap & cleave: crouch, jump spin, crash down
      const u = k.u, cr = pulse(u, 0, 0.18, 0.18, 0.3), air = pulse(u, 0.25, 0.4, 0.55, 0.68), land = pulse(u, 0.62, 0.7, 0.8, 1);
      k.p('body', 0, -0.25 * cr + 0.9 * air - 0.2 * land, 0.5 * air + 0.6 * land); k.r('body', 0.2 * cr - 0.2 * air + 0.4 * land, air * TAU * 0.5 * 0, 0);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('leg' + L, -0.9 * cr - 0.6 * air - 0.6 * land); k.r('shin' + L, 1.4 * cr + 1.0 * air + 0.8 * land); }
      k.r('armR', -2.9 * air + 0.4 * land, 0, 0); k.r('armL', -2.4 * air + 0.2 * land); k.r('foreR', -0.5 * air);
      k.fx.glow += 2.0 * (air + land); k.fx.flash = max(k.fx.flash, 0.5 * pulse(u, 0.66, 0.7, 0.72, 0.85));
    },
    enter(k) {
      const u = k.u, rise = sm(0, 0.75, u);
      k.p('body', 0, -0.6 * (1 - rise), 0); k.r('body', 0.6 * (1 - rise), 0, 0); k.r('head', 0.5 * (1 - sm(0.5, 0.9, u)));
      k.fx.diss = max(k.fx.diss, 1 - sm(0, 0.75, u)); k.fx.glow += 1.5 * pulse(u, 0.5, 0.75, 0.8, 1);
    },
  };
  const humClips = (extra = {}) => Object.assign({ attack: (k) => HUM.chop(k), cast: (k) => HUM.cast(k), hurt: (k) => HUM.hurt(k), die: (k) => HUM.die(k), special: (k) => HUM.special(k), enter: (k) => HUM.enter(k) }, extra);
  // simple torso: tapered ellipsoid lathe from hips to shoulders, skinned body→chest
  function torso(R, o) {
    const pts = [];
    const n = 12;
    for (let i = 0; i <= n; i++) { const t = i / n; const r = o.r(t); pts.push([max(0.001, r), lerp(o.y0, o.y1, t)]); }
    const g = GEO.lathe(pts, o.seg || 18);
    if (o.depth) GEO.warp(g, (v) => { v.z *= o.depth; v.z += o.z || 0; });
    return R.add(g, { skin: byY('body', 'chest', lerp(o.y0, o.y1, 0.3), lerp(o.y0, o.y1, 0.75)), c: o.c, cell: o.cell || 'cloth', rep: o.rep || [3, 2], m: o.m });
  }
  // string between two bones (marionette strings, chains): thin tube; top verts follow `a`, bottom verts follow `b`
  function tether(R, a, b, pa, pb, r, o = {}) {
    const g = GEO.sweep([pa, [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2], pb], r, { sides: 4, n: 6, cap: false });
    const A = new THREE.Vector3(...pa), B = new THREE.Vector3(...pb), L = A.distanceTo(B);
    R.add(g, Object.assign({ c: 0xe8e0d0, cell: 'blank', skin: (p) => { const t = clamp(p.distanceTo(A) / L); return [[a, 1 - t], [b, t]]; } }, o));
  }

  // ============================================================================ 傀儡 marionette
  // A 傀儡戲 string-puppet general come loose of its theatre: red loyal-face mask, gilt armour, 靠旗 flags, strings to a control bar.
  defB('marionette', {
    h: 2.6, outline: 0.003, rim: 0.3,
    build(R) {
      biped(R, { hip: 0.78, chest: 1.12, neck: 1.33, head: 1.48, sw: 0.2, sy: 1.26, arm: 0.5, hw: 0.1, armOut: 0.05 });
      R.bone('bar', 'root', [0, 2.45, 0.05]);
      R.bone('sword', 'handR', [0.3, 0.8, 0.2]);
      const RED = 0xb8282a, GOLD = 0xe0b040, BLUE = 0x2a4a9a, WOOD = 0xc89a64;
      // wooden body under the costume, jointed limbs (visible pegs)
      torso(R, { y0: 0.72, y1: 1.3, r: (t) => 0.19 + 0.05 * sin(t * PI) - 0.07 * sm(0.8, 1, t), depth: 0.7, c: RED, cell: 'brocade', rep: [3, 1.5] });
      R.add(GEO.box(0.38, 0.3, 0.2, 0.04), { b: 'chest', c: GOLD, cell: 'lamellar', rep: [2, 1.5], at: [0, 1.08, 0.06] });
      R.add(GEO.sph(0.08, 0.08, 0.03, 12, 8), { b: 'chest', c: 0xffffff, cell: 'opera', uvp: 'z', at: [0, 1.1, 0.17] });
      R.add(GEO.tor(0.2, 0.025, 6, 20), { b: 'body', c: GOLD, cell: 'metal', at: [0, 0.8, 0], rot: [PI / 2, 0, 0], s: [1, 0.75, 1] });
      skirt(R, { y0: 0.82, y1: 0.42, r0: 0.21, r1: 0.3, n: 6, c: RED, cell: 'brocade', rep: [3, 1], k: 0.25, wave: 6 });
      skirt(R, { name: 'ap', y0: 0.8, y1: 0.36, r0: 0.08, r1: 0.12, from: [-0.5, 0.5], n: 2, z: 0.17, c: GOLD, cell: 'qilin', rep: [1, 1], k: 0.2 });
      limbs(R, { arm: { r: (u) => 0.06 - u * 0.012, c: RED, cell: 'brocade', rep: [2, 2] }, leg: { r: (u) => 0.07 - u * 0.02, c: 0xf4f0e8, cell: 'cloth', rep: [2, 2] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.sph(0.1, 0.07, 0.1, 10, 8), { b: 'arm' + L, c: GOLD, cell: 'lamellar', at: [s * 0.23, 1.26, 0] });
        R.add(GEO.sph(0.05, 0.05, 0.05, 8, 6), { b: 'hand' + L, c: 0xf2d0b0, cell: 'skin', at: [s * 0.27, 0.8, 0.08] });
        R.add(GEO.box(0.12, 0.08, 0.22, 0.03), { b: 'foot' + L, c: 0x1a1a1a, cell: 'cloth', at: [s * 0.1, 0.05, 0.05] });
        R.add(GEO.box(0.13, 0.03, 0.24, 0.01), { b: 'foot' + L, c: 0xf0f0f0, cell: 'plain', at: [s * 0.1, 0.015, 0.05] });
        R.add(GEO.sph(0.035, 0.035, 0.035, 8, 6), { b: 'fore' + L, c: WOOD, cell: 'wood', at: [s * 0.25, 1.02, 0.02] });
        R.add(GEO.sph(0.035, 0.035, 0.035, 8, 6), { b: 'shin' + L, c: WOOD, cell: 'wood', at: [s * 0.1, 0.4, 0.07] });
      }
      // head: carved wooden head with painted red-face, black beard, helmet with pom-poms and pheasant feathers
      R.add(GEO.sph(0.13, 0.15, 0.13, 16, 12), { b: 'head', c: 0xc8302a, cell: 'skin', at: [0, 1.48, 0.02] });
      faceShell(R, 'opera', [0, 1.47, 0.025], 0.135, 0.155, 0.135, { b: 'head', wide: 1.0, t0: 0.6, tl: 1.7 });
      strand(R, 'beard', 'head', [[0, 1.38, 0.13], [0, 1.25, 0.15], [0, 1.1, 0.13]], { r: (u) => 0.05 * (1 - u * 0.6), ell: [1, 0.35], c: 0x101010, k: 0.3, g: 0.6 });
      R.add(GEO.cyl(0.14, 0.15, 0.1, 16), { b: 'head', c: GOLD, cell: 'gold', at: [0, 1.6, 0] });
      R.add(GEO.cone(0.12, 0.14, 12), { b: 'head', c: GOLD, cell: 'gold', at: [0, 1.71, 0] });
      for (let i = 0; i < 5; i++) R.add(GEO.sph(0.035, 0.035, 0.035, 8, 6), { b: 'head', c: 0xe02030, cell: 'plain', at: [cos(i * 0.6 - 1.2) * 0.15, 1.64, sin(i * 0.6 - 1.2) * 0.15 + 0.02] });
      R.add(GEO.sph(0.05, 0.05, 0.05, 8, 6), { b: 'head', c: 0xe02030, cell: 'plain', at: [0, 1.8, 0] });
      for (const s of [-1, 1]) strand(R, 'plume' + sideL(s), 'head', [[s * 0.05, 1.76, -0.02], [s * 0.16, 1.98, -0.1], [s * 0.3, 2.08, -0.16], [s * 0.42, 2.02, -0.2]], { r: (u) => 0.016 * (1 - u * 0.5), ell: [1, 1], c: 0xf0c060, cell: 'feather', k: 0.25, g: 0.2 });
      // 靠旗: four triangular back flags on poles (spring-swayed)
      for (let i = 0; i < 4; i++) {
        const a = (i - 1.5) * 0.35, base = [sin(a) * 0.12, 1.25, -0.15];
        const top = [sin(a) * 0.55, 1.95 + abs(i - 1.5) * -0.05, -0.32];
        const pole = R.chain('flag' + i, 'chest', [base, [(base[0] + top[0]) / 2, (base[1] + top[1]) / 2, (base[2] + top[2]) / 2], top]);
        R.tube(pole, { r: 0.012, sides: 5, c: 0x2a2a2a, cell: 'wood', ext: [0, 0.05] });
        R.spring(pole.slice(1), { k: 0.3, drag: 0.2, g: 0.05, tail: [top[0] - (base[0] + top[0]) / 2, top[1] - (base[1] + top[1]) / 2, top[2] - (base[2] + top[2]) / 2] });
        const fl = GEO.ext([[0, 0], [0.26, -0.04], [0, -0.42]], 0.01, 0);
        R.add(fl, { b: pole[1], m: 'cut', c: [BLUE, 0x3a6ad0], cell: 'brocade', at: [top[0] * 0.98, top[1] - 0.02, top[2]], rot: [0, (i < 2 ? -1 : 1) * 0.4 + PI * (i < 2 ? 1 : 0), 0] });
      }
      // sword (dao) in the right hand
      R.add(GEO.ext([[0, 0], [0.04, 0.02], [0.05, 0.75], [0.0, 0.85], [-0.02, 0.78], [-0.015, 0.02]], 0.012, 0.004), { b: 'sword', c: 0xd8dce4, cell: 'metal', at: [0.29, 0.8, 0.2], rot: [1.2, 0, 0] });
      R.add(GEO.box(0.16, 0.03, 0.05, 0.01), { b: 'sword', c: GOLD, cell: 'gold', at: [0.29, 0.8, 0.2], rot: [1.2, 0, 0] });
      // control bar (wooden cross) with strings to head, hands, knees
      R.add(GEO.box(0.7, 0.05, 0.06, 0.015), { b: 'bar', c: WOOD, cell: 'wood', at: [0, 2.45, 0.05] });
      R.add(GEO.box(0.06, 0.05, 0.5, 0.015), { b: 'bar', c: WOOD, cell: 'wood', at: [0, 2.45, 0.05] });
      tether(R, 'bar', 'head', [0, 2.43, 0.05], [0, 1.78, 0.0], 0.004, { m: 'glow', c: 0x807860 });
      tether(R, 'bar', 'handL', [-0.33, 2.43, 0.05], [-0.27, 0.82, 0.08], 0.004, { m: 'glow', c: 0x807860 });
      tether(R, 'bar', 'handR', [0.33, 2.43, 0.05], [0.27, 0.82, 0.08], 0.004, { m: 'glow', c: 0x807860 });
      tether(R, 'bar', 'shinL', [-0.05, 2.43, 0.28], [-0.1, 0.45, 0.06], 0.004, { m: 'glow', c: 0x807860 });
      tether(R, 'bar', 'shinR', [0.05, 2.43, 0.28], [0.1, 0.45, 0.06], 0.004, { m: 'glow', c: 0x807860 });
      tether(R, 'bar', 'chest', [0, 2.43, -0.2], [0, 1.25, -0.1], 0.004, { m: 'glow', c: 0x807860 });
      R.fx({ mode: 'rise', n: 12, at: [0, 0.3, 0], box: [0.8, 0.2, 0.6], col: [0xffd080], size: 0.04, speed: 0.6, p: [1.2, 0.1, 1] });
    },
    // puppet motion: the bar leads, the body dangles; stiff jointed snaps instead of smooth arcs
    idle(k) {
      const t = k.t, sn = (x) => Math.round(x * 4) / 4; // quantised "string tug"
      k.p('bar', sin(t * 0.9) * 0.05, sin(t * 1.3) * 0.03, 0); k.r('bar', 0, 0, sin(t * 0.9) * 0.08);
      k.p('body', sin(t * 0.9 - 0.4) * 0.04, 0.03 + abs(sin(t * 1.3 - 0.3)) * 0.04, 0); k.r('body', 0, sin(t * 0.5) * 0.2, sin(t * 0.9 - 0.5) * 0.06);
      k.r('head', 0.05 * sn(sin(t * 0.7)), 0.3 * sn(sin(t * 0.45)), 0.1 * sn(sin(t * 0.6)));
      k.r('armR', -0.25 + 0.1 * sin(t * 1.3), 0, 0.35); k.r('foreR', -0.6); k.r('handR', 0.6); k.r('armL', -0.2 + 0.15 * sn(sin(t * 0.8)), 0, -0.25); k.r('foreL', -0.5);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('leg' + L, 0.1 * sin(t * 0.9 + s), 0, s * 0.05); k.r('shin' + L, 0.15 + 0.1 * sin(t * 0.9 + s)); k.r('foot' + L, 0.3); }
    },
    move(k) {
      // the puppeteer's high-stepping walk: bar bobs, knees lifted by strings
      const c = k.t * 6;
      k.p('bar', 0, abs(sin(c)) * 0.08, 0); k.p('body', 0, 0.05 + abs(sin(c)) * 0.12, 0); k.r('body', 0, sin(c) * 0.15, 0);
      for (const s of [-1, 1]) { const L = sideL(s), ph = c + (s < 0 ? 0 : PI); k.r('leg' + L, -max(0, sin(ph)) * 1.1, 0, 0); k.r('shin' + L, max(0, sin(ph)) * 1.4, 0, 0); k.r('foot' + L, 0.3); k.r('arm' + L, -sin(ph) * 0.5, 0, s * 0.2); }
      k.r('foreR', -0.8);
    },
    clips: {
      attack(k) {
        // jerk up on the strings, spin the blade, slash down
        const u = k.u, lift = pulse(u, 0, 0.25, 0.3, 0.42), hit = pulse(u, 0.38, 0.46, 0.6, 0.95);
        k.p('bar', 0, 0.3 * lift - 0.1 * hit, 0.3 * hit); k.p('body', 0, 0.35 * lift - 0.05 * hit, 0.5 * hit);
        k.r('body', -0.2 * lift + 0.3 * hit, 0.6 * lift - 0.4 * hit, 0);
        k.r('armR', -3.0 * lift + 0.5 * hit, 0, 0.4 * lift); k.r('foreR', -0.3 * lift); k.r('handR', -0.8 * lift + 1.2 * hit);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('leg' + L, -0.6 * lift + 0.3 * hit * s); k.r('shin' + L, 1.0 * lift); }
        k.fx.glow += hit;
      },
      cast(k) {
        // strings blaze: the general strikes an opera pose (亮相), flags snap
        const u = k.u, up = pulse(u, 0.05, 0.3, 0.75, 1);
        k.p('bar', 0, 0.15 * up, 0); k.p('body', 0, 0.2 * up, 0);
        k.r('armL', -1.6 * up, 0, -1.1 * up); k.r('foreL', -1.2 * up); k.r('armR', -2.6 * up, 0, 0.4 * up); k.r('head', -0.2 * up, -0.5 * up, 0);
        k.r('legL', -1.0 * up); k.r('shinL', 1.3 * up);
        k.fx.glow += 3 * up;
      },
      hurt: (k) => { HUM.hurt(k); k.p('bar', 0, 0.1 * pulse(k.u, 0, 0.1, 0.2, 0.6), 0); },
      die(k) {
        // strings cut: the puppet collapses in a heap, bar drifts away
        const u = k.u, cut = sm(0.1, 0.18, u), drop = sm(0.15, 0.45, u);
        k.p('bar', 0, 0.8 * sm(0.1, 1, u), 0); k.r('bar', 0, 0, 0.6 * sm(0.1, 1, u));
        k.p('body', 0, -0.45 * drop, 0); k.r('body', 0.2 * drop, 0, 0.5 * drop); k.r('head', 0.8 * drop, 0, 0.5 * drop);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, 0.4 * drop, 0, s * 1.0 * drop); k.r('leg' + L, -1.5 * drop, 0, s * 0.6 * drop); k.r('shin' + L, 1.0 * drop); }
        k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.15, u))); k.fx.diss = max(k.fx.diss, sm(0.55, 1, u)); void cut;
      },
      special: (k) => HUM.special(k), enter: (k) => HUM.enter(k),
    },
  });

  // ============================================================================ 溺屍兵 drowned_soldier
  // A Qing brave (勇) who drowned crossing the Black Ditch: bloated blue skin, straw hat, rusted dao, seaweed, dripping water.
  defB('drowned_soldier', {
    h: 2.5, outline: 0.003, rim: 0.35, rimColor: 0xa0e0ff,
    build(R) {
      biped(R, { hip: 1.0, chest: 1.45, neck: 1.75, head: 1.95, sw: 0.27, sy: 1.66, arm: 0.72, hw: 0.13, armOut: 0.08, cz: 0.04, hz: 0.06 });
      R.bone('blade', 'handR', [0.38, 0.95, 0.13]);
      const SKIN = 0x8aa4a8, TUNIC = 0x2e3e5e, TRIM = 0x9a2a1a;
      torso(R, { y0: 0.95, y1: 1.72, r: (t) => 0.27 + 0.05 * sin(t * PI) - 0.1 * sm(0.75, 1, t), depth: 0.75, c: TUNIC, cell: 'cloth', rep: [3, 2] });
      R.add(GEO.sph(0.17, 0.17, 0.03, 16, 10), { b: 'chest', c: 0xffffff, cell: 'yong', uvp: 'z', at: [0, 1.42, 0.24] });
      R.add(GEO.tor(0.27, 0.035, 6, 20), { b: 'body', c: TRIM, cell: 'cloth', at: [0, 1.0, 0.0], rot: [PI / 2, 0, 0], s: [1, 0.76, 1] });
      skirt(R, { y0: 1.02, y1: 0.55, r0: 0.28, r1: 0.36, n: 6, c: TUNIC, cell: 'cloth', k: 0.18, wave: 5 });
      skirt(R, { name: 'rag', y0: 0.62, y1: 0.42, r0: 0.355, r1: 0.37, n: 6, c: TRIM, cell: 'fringe', m: 'cut', rep: [5, 1], k: 0.15 });
      limbs(R, { arm: { r: (u) => 0.085 - u * 0.015, c: TUNIC, cell: 'cloth', rep: [2, 2] }, leg: { r: (u) => 0.09 - u * 0.025, c: 0xd0c8b0, cell: 'bandage', rep: [2, 4] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.lumpy(GEO.sph(0.075, 0.09, 0.06, 10, 8), 0.05, 6), { b: 'hand' + L, c: SKIN, cell: 'skin', at: [s * 0.37, 0.95, 0.12] });
        R.add(GEO.box(0.13, 0.08, 0.26, 0.03), { b: 'foot' + L, c: 0x1a1a1a, cell: 'cloth', at: [s * 0.13, 0.05, 0.05] });
      }
      // bloated drowned head, one eye clouded, glowing pupil; conical straw hat with red tassel
      R.add(GEO.lumpy(GEO.sph(0.2, 0.22, 0.19, 16, 12), 0.05, 4, 2), { b: 'head', c: SKIN, cell: 'skin', at: [0, 1.96, 0.06] });
      faceShell(R, 'drownface', [0, 1.95, 0.065], 0.205, 0.225, 0.195, { b: 'head', wide: 0.95, t0: 0.6, tl: 1.75 });
      R.add(GEO.sph(0.03, 0.03, 0.02, 8, 6), { b: 'head', m: 'glow', c: 0x9ae0d0, cell: 'blank', at: [0.07, 1.99, 0.25] });
      R.add(GEO.cone(0.4, 0.2, 20), { b: 'head', c: 0xc8a868, cell: 'pandan', rep: [6, 1], at: [0, 2.2, 0.04], rot: [0.12, 0, 0.08] });
      R.add(GEO.sph(0.04, 0.04, 0.04, 8, 6), { b: 'head', c: 0xc02020, cell: 'plain', at: [0.02, 2.31, 0.06] });
      strand(R, 'queue', 'head', [[0, 1.9, -0.15], [0, 1.65, -0.24], [0.02, 1.4, -0.27], [0.03, 1.15, -0.27]], { r: (u) => 0.035 * (1 - u * 0.5), ell: [1, 1], c: 0x141414, k: 0.15, g: 0.6 });
      // seaweed draped over shoulders, dripping
      for (const s of [-1, 1]) strand(R, 'weed' + sideL(s), 'chest', [[s * 0.2, 1.72, 0.05], [s * 0.3, 1.55, 0.2], [s * 0.32, 1.3, 0.24], [s * 0.3, 1.08, 0.22]], { r: (u) => 0.05, ell: [1, 0.25], c: 0x3a6a2a, cell: 'kelp', m: 'cut', k: 0.2, g: 0.6 });
      // rusted dao
      R.add(GEO.ext([[0, 0], [0.05, 0.02], [0.07, 0.62], [0.02, 0.72], [-0.02, 0.6], [-0.02, 0.02]], 0.012, 0.004), { b: 'blade', c: 0x8a7060, cell: 'metal', at: [0.38, 0.92, 0.15], rot: [1.35, 0, 0.1] });
      R.add(GEO.cyl(0.02, 0.02, 0.16, 6), { b: 'blade', c: 0x3a2a1a, cell: 'wood', at: [0.38, 0.95, 0.13], rot: [1.35, 0, 0] });
      R.fx({ mode: 'fall', n: 26, at: [0, 1.4, 0.05], box: [0.7, 1.2, 0.5], col: [0x9ad8f0], size: 0.035, speed: 1.4, p: [1.3, 0.05, 1] });
    },
    idle(k) { HUM.idle(k, { elbow: 0.35 }); k.r('head', 0.15, 0, 0.18 + sin(k.t * 0.6) * 0.05); k.r('chest', 0.12); },
    move(k) { HUM.walk(k, { rate: 5, stride: 0.35, bob: 0.6 }); k.r('head', 0.1, 0, 0.2 + sin(k.t * 5) * 0.1); },
    clips: humClips(),
  });

  // ============================================================================ 海盜鬼 pirate_ghost
  defB('pirate_ghost', {
    h: 2.7, outline: 0.003, rim: 0.5, rimColor: 0x80ffe0,
    build(R) {
      biped(R, { hip: 1.02, chest: 1.5, neck: 1.8, head: 2.0, sw: 0.28, sy: 1.7, arm: 0.74, hw: 0.14, armOut: 0.07, cz: 0.03 });
      R.bone('blade', 'handR', [0.4, 0.97, 0.12]);
      const SKIN = 0x7ab8b0, COAT = 0x2a3448, SASH = 0xb02a28;
      torso(R, { y0: 0.98, y1: 1.78, r: (t) => 0.27 + 0.04 * sin(t * PI) - 0.1 * sm(0.75, 1, t), depth: 0.75, c: COAT, cell: 'cloth', rep: [3, 2] });
      R.add(GEO.tor(0.27, 0.06, 8, 20), { b: 'body', c: SASH, cell: 'cloth', at: [0, 1.05, 0], rot: [PI / 2, 0, 0], s: [1, 0.78, 1] });
      strand(R, 'sash', 'body', [[0.18, 1.02, 0.14], [0.22, 0.85, 0.18], [0.24, 0.66, 0.2]], { r: 0.06, ell: [1, 0.2], c: SASH, cell: 'cloth', k: 0.2 });
      skirt(R, { name: 'coat', y0: 1.05, y1: 0.45, r0: 0.28, r1: 0.36, n: 6, from: [0.9, TAU - 0.9], c: COAT, cell: 'cloth', k: 0.2, wave: 4 });
      limbs(R, { arm: { r: (u) => 0.085 - u * 0.02, c: COAT, cell: 'cloth', rep: [2, 2] }, leg: { r: (u) => 0.1 - u * 0.03, c: 0x1e2430, cell: 'cloth', rep: [2, 3] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.sph(0.07, 0.08, 0.06, 10, 8), { b: 'hand' + L, c: SKIN, cell: 'skin', at: [s * 0.39, 0.97, 0.12] });
        R.add(GEO.cyl(0.11, 0.1, 0.28, 10), { b: 'shin' + L, c: 0x2a1e18, cell: 'skin', at: [s * 0.14, 0.2, 0.02] });
        R.add(GEO.box(0.14, 0.08, 0.28, 0.03), { b: 'foot' + L, c: 0x2a1e18, cell: 'skin', at: [s * 0.14, 0.04, 0.06] });
      }
      R.add(GEO.sph(0.19, 0.21, 0.19, 16, 12), { b: 'head', c: SKIN, cell: 'skin', at: [0, 2.0, 0.04] });
      faceShell(R, 'pirateface', [0, 1.99, 0.045], 0.195, 0.215, 0.195, { b: 'head', wide: 0.95, t0: 0.6, tl: 1.75 });
      R.add(GEO.sph(0.205, 0.12, 0.205, 16, 8, { tl: PI / 2 }), { b: 'head', c: SASH, cell: 'cloth', at: [0, 2.06, 0.03] });
      for (const s of [-1, 1]) R.add(GEO.sph(0.03, 0.03, 0.02, 8, 6), { b: 'head', m: 'glow', c: 0x9affe8, cell: 'blank', at: [s * 0.075, 2.02, 0.22] });
      strand(R, 'scarf', 'head', [[0.0, 2.06, -0.18], [0.06, 1.92, -0.3], [0.1, 1.72, -0.36]], { r: 0.05, ell: [1, 0.2], c: SASH, cell: 'cloth', k: 0.18 });
      for (let i = 0; i < 4; i++) strand(R, 'hair' + i, 'head', [[(i - 1.5) * 0.1, 1.98, -0.12], [(i - 1.5) * 0.13, 1.75, -0.2], [(i - 1.5) * 0.15, 1.5, -0.22]], { r: 0.045, c: 0x101418, k: 0.15 });
      // tattered junk sail worn as a cloak (spring hem)
      skirt(R, { name: 'sail', y0: 1.75, y1: 0.55, r0: 0.3, r1: 0.55, n: 4, from: [PI - 1.0, PI + 1.0], parent: 'chest', c: 0xb0603a, cell: 'sail', m: 'cut', rep: [2, 2], k: 0.12, g: 0.5 });
      // cutlass with spectral edge, lantern at the hip
      R.add(GEO.ext([[0, 0], [0.05, 0.02], [0.08, 0.7], [0.0, 0.85], [-0.02, 0.65], [-0.02, 0.02]], 0.012, 0.004), { b: 'blade', c: 0xd8e4e0, cell: 'metal', at: [0.4, 0.95, 0.15], rot: [1.25, 0, 0.1] });
      R.add(GEO.ext([[0.05, 0.05], [0.08, 0.7], [0.0, 0.85]], 0.004, 0), { b: 'blade', m: 'glow', c: 0x40ffd0, cell: 'blank', at: [0.4, 0.95, 0.15], rot: [1.25, 0, 0.1], s: [1.1, 1, 1] });
      R.add(GEO.tor(0.08, 0.012, 6, 14, PI * 1.2), { b: 'blade', c: 0xc0a040, cell: 'gold', at: [0.4, 0.95, 0.15], rot: [1.25, 0, 1.6] });
      R.bone('lamp', 'body', [-0.32, 0.88, 0.1]);
      R.add(GEO.cyl(0.06, 0.07, 0.15, 8), { b: 'lamp', m: 'glow', c: 0x40ffc0, cell: 'glass', at: [-0.32, 0.86, 0.1] });
      R.add(GEO.cone(0.08, 0.06, 8), { b: 'lamp', c: 0x3a3020, cell: 'metal', at: [-0.32, 0.97, 0.1] });
      R.fx({ mode: 'rise', n: 24, at: [0, 0.6, 0], box: [0.9, 0.9, 0.6], col: [0x40ffc0, 0x9affe8], size: 0.05, speed: 0.8, p: [1.4, 0.2, 1] });
      R.light({ b: 'lamp', at: [-0.32, 0.86, 0.1], color: '#40ffc0', i: 0.7, r: 3, flicker: 0.2 });
    },
    idle(k) { HUM.idle(k, { elbow: 0.4 }); k.r('armR', -0.3); k.r('foreR', -0.5); k.r('body', 0, 0.15, 0); },
    move(k) { HUM.walk(k, { rate: 6.5, stride: 0.45 }); },
    clips: humClips(),
  });

  // place items along a bone chain: fn(i, mid, tangent, side, up, radius) → part opts (or null); skinned to the segment
  function along(R, order, rf, from, to, step, fn) {
    const P = order.map((n) => R.B[n].pos), N = P.length;
    for (let f = from; f < to; f += step) {
      const i = min(N - 2, floor(f * (N - 1))), t = f * (N - 1) - i;
      const a = P[i], b = P[i + 1], m = a.clone().lerp(b, t);
      const d = b.clone().sub(a).normalize();
      let side = new THREE.Vector3(0, 1, 0).cross(d); if (side.length() < 0.2) side.set(1, 0, 0); side.normalize();
      const up = d.clone().cross(side).normalize();
      const o = fn(f, m, d, side, up, rf(f));
      if (!o) continue;
      const g = o.geo; delete o.geo;
      R.add(g, Object.assign({ w: [[order[i], 1 - t * 0.5], [order[i + 1], t * 0.5]] }, o));
    }
  }
  // orientation (euler YXZ) that points local +y along dir
  function yAlong(d) { const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); return [e.x, e.y, e.z]; }

  // ============================================================================ 蛟 jiao
  // A jade water-dragon that never finished its cultivation, woken in the lake: rises from mist, whiskers trailing, pearl in claw.
  const JIAO = {};
  defB('jiao', {
    h: 3.7, outline: 0.003, rim: 0.4, rimColor: 0xb0fff0, clipY: -0.04, wide: 1.3, scroll: -0.08,
    build(R) {
      const JADE = 0x2f9a78, JADE2 = 0x5ad0a0, BELLY = 0xf2e4b8;
      const c = snake(R, {
        tail: [[1.35, -0.3, -1.25], [1.15, 0.55, -1.35], [0.6, 0.85, -1.3], [0.05, 0.4, -1.05], [-0.25, -0.3, -0.6]],
        base: [-0.25, -0.15, 0.0],
        neck: [[0.0, 0.7, 0.25], [0.32, 1.45, 0.2], [0.25, 2.2, -0.05], [-0.1, 2.8, 0.05]],
        head: [-0.05, 3.1, 0.4],
        r: (u) => 0.03 + 0.3 * sm(0, 0.4, u) * (1 - 0.25 * sm(0.6, 0.95, u)) + 0.02 * sm(0.95, 1, u),
        c: (v, uu) => { const b = sm(0.25, 0.6, cos(TAU * uu)); return b > 0.5 ? BELLY : Rig.mix(JADE, JADE2, 0.3 + 0.4 * sin(v.y * 3)); },
        cell: 'bigscale', rep: [4, 26],
      });
      Object.assign(JIAO, c);
      // long dragon head: upturned snout, brow ridges, horn nubs, cheek frills, whiskers
      snakeHead(R, [-0.05, 3.12, 0.48], { len: 0.85, w: 0.5, hgt: 0.36, col: JADE, belly: BELLY, eye: 0xc0a040, cell: 'bigscale', snout: 0.25, upturn: 0.05, tongue: false });
      for (const s of [-1, 1]) {
        R.add(GEO.cone(0.06, 0.32, 8), { b: 'head', c: 0xe8d8a0, cell: 'stone', at: [s * 0.14, 3.38, 0.25], rot: [-1.0, 0, s * -0.35] });
        R.add(GEO.card(0.5, 0.42, 1, 3), { m: 'cut', b: 'head', c: 0x3fb890, cell: 'frond', decal: true, at: [s * 0.24, 3.1, 0.25], rot: [-1.2, s * 1.3, 0], s: [1.6, 1, 1] });
        R.add(GEO.card(0.5, 0.42, 1, 3), { m: 'cut', b: 'head', c: 0x2a9a78, cell: 'frond', decal: true, at: [s * 0.2, 3.0, 0.12], rot: [-1.6, s * 1.5, 0], s: [1.4, 1.2, 1] });
        // whiskers: spring chains trailing from the snout
        const w = R.chain('wh' + (s < 0 ? 'L' : 'R'), 'head', [[s * 0.16, 3.08, 0.86], [s * 0.42, 3.02, 0.92], [s * 0.7, 2.86, 0.82], [s * 0.92, 2.62, 0.62], [s * 1.04, 2.38, 0.4]]);
        R.tube(w, { r: (u) => 0.022 * (1 - u * 0.7), sides: 5, c: 0xe8d090, cell: 'plain', n: 20 });
        R.spring(w.slice(0, 4), { k: 0.18, drag: 0.12, g: 0.4, tail: [s * 0.12, -0.24, -0.22] });
      }
      // dorsal spines along the back
      const rf = (u) => 0.03 + 0.3 * sm(0, 0.4, u);
      along(R, c.order, rf, 0.08, 0.96, 0.035, (u, m, d, side, up, r) => ({ geo: GEO.cone(0.05 + r * 0.18, 0.12 + r * 0.6, 6), c: 0x1f6a58, cell: 'stone', at: [m.x + up.x * r * 0.95, m.y + up.y * r * 0.95, m.z + up.z * r * 0.95], rot: yAlong(up.clone().addScaledVector(d, -0.6)) }));
      // forelegs with a glowing pearl
      for (const s of [-1, 1]) {
        const L = s < 0 ? 'L' : 'R';
        R.bone('arm' + L, 'n1', [s * 0.25 + 0.3, 1.5, 0.3]);
        R.bone('fore' + L, 'arm' + L, [s * 0.45 + 0.3, 1.25, 0.55]);
        R.bone('hand' + L, 'fore' + L, [s * 0.32 + 0.3, 1.32, 0.8]);
        R.tube(['arm' + L, 'fore' + L, 'hand' + L], { r: (u) => 0.1 - u * 0.04, sides: 8, c: JADE, cell: 'bigscale', rep: [2, 3] });
        for (let i = 0; i < 3; i++) R.add(GEO.cone(0.025, 0.14, 5), { b: 'hand' + L, c: 0xf0e0b0, at: [s * 0.32 + 0.3 + (i - 1) * 0.06, 1.3, 0.9], rot: [1.9, 0, (i - 1) * 0.3] });
      }
      R.bone('pearl', 'handR', [0.3, 1.42, 0.92]);
      R.add(GEO.sph(0.13, 0.13, 0.13, 16, 12), { m: 'glow', b: 'pearl', c: 0xb8fff4, cell: 'blank', at: [0.3, 1.42, 0.92] });
      // tail fin (fan) at the tip
      R.add(GEO.card(0.9, 0.8, 1, 3), { m: 'cut', b: 't4', c: 0x48c09a, cell: 'fin', decal: true, at: [1.4, -0.05, -1.25], rot: [0, 0.6, -0.35] });
      waterDisk(R, 2.3, [0, 0.02, -0.4], 0x2f7a88);
      R.fx({ mode: 'wander', n: 18, at: [0, 0.3, -0.4], box: [3.4, 0.4, 2.6], col: [0xe8f4f4, 0xcfe8ec], size: 0.9, speed: 0.25, p: [0.5, 0.3, 1], blend: 'normal' });
      R.fx({ mode: 'orbit', n: 22, at: [0.3, 1.45, 0.92], box: [0.05, 0.05, 0.05], col: [0xb8fff4, 0x80e0ff], size: 0.05, speed: 2.2, p: [0.25, 0.1, 1] });
      R.fx({ mode: 'fall', n: 30, at: [0, 2.0, 0.1], box: [1.2, 2.4, 1.2], col: [0x9ae8ff], size: 0.04, speed: 1.2, p: [1.8, 0.1, 1] });
      R.light({ b: 'pearl', at: [0.3, 1.42, 0.92], color: '#b8fff4', i: 1.2, r: 4, flicker: 0.05 });
    },
    idle(k) {
      SERP.idle(k, JIAO, 0.8);
      k.wave(JIAO.tail, 'x', 0.05, 5, 0.9);
      for (const s of ['L', 'R']) { k.r('arm' + s, sin(k.t * 1.4 + (s === 'L' ? 0 : 1)) * 0.15, 0, 0); k.r('fore' + s, -0.3 + sin(k.t * 1.4) * 0.1, 0, 0); }
      k.p('body', 0, sin(k.t * 0.9) * 0.06, 0);
    },
    move(k) { SERP.move(k, JIAO); },
    clips: serpentClips(() => JIAO, {
      cast(k) {
        // raise the pearl: neck rears, pearl lifts and flares, rain spirals
        SERP.cast(k, JIAO);
        const up = pulse(k.u, 0.05, 0.35, 0.75, 1);
        k.r('armR', -1.4 * up, 0, 0.3 * up); k.r('foreR', -0.4 * up); k.p('pearl', 0, 0.25 * up, 0); k.s('pearl', 0.6 * up);
      },
      special(k) {
        // tidal coil: whole body winds, head circles, everything flares
        const u = k.u, up = pulse(u, 0.05, 0.3, 0.75, 1);
        k.wave(JIAO.neck, 'z', 0.25 * up, 2, 9); k.wave(JIAO.tail, 'y', 0.3 * up, 2, 9);
        k.r('head', -0.3 * up, sin(u * TAU * 2) * 0.6 * up, 0); k.r('jaw', 0.8 * up); k.p('body', 0, 0.4 * up, 0);
        k.fx.glow += 2 * up;
      },
    }),
  });

  // ============================================================================ 雲蛇 baibu
  // Vast benevolent cloud-serpent, a spirit guide: cream body with the ancestral diamond/triangle pattern, resting on clouds.
  const BAIBU = {};
  defB('baibu', {
    h: 3.6, outline: 0.003, rim: 0.6, rimColor: 0x9ad8ff, wide: 1.7, glowBase: 1,
    build(R) {
      const c = snake(R, {
        tail: [[2.5, 0.55, -0.5], [1.9, 0.75, 0.25], [1.1, 0.62, 0.65], [0.3, 0.55, 0.3], [-0.4, 0.62, -0.45], [-1.2, 0.8, -0.65]],
        base: [-1.85, 0.95, -0.1],
        neck: [[-1.85, 1.65, 0.25], [-1.45, 2.4, 0.35], [-1.0, 2.95, 0.45]],
        head: [-0.6, 3.2, 0.75],
        r: (u) => 0.02 + 0.28 * sm(0, 0.45, u) * (1 - 0.35 * sm(0.75, 0.95, u)) + 0.03 * sm(0.95, 1, u),
        c: (v, uu) => (cos(TAU * uu) > 0.45 ? 0xfff2dc : 0xffffff), cell: 'diamond', tile: 1,
      });
      Object.assign(BAIBU, c);
      // triangular head with the upturned snout of the hundred-pacer
      snakeHead(R, [-0.55, 3.22, 0.82], { len: 0.75, w: 0.6, hgt: 0.32, col: 0xe8dcbc, belly: 0xfff2dc, eye: 0xd8b060, cell: 'plain', snout: 0.6, upturn: 0.22, fangs: true });
      R.add(GEO.cone(0.12, 0.2, 3), { b: 'head', c: 0x5a3a22, cell: 'plain', at: [-0.55, 3.38, 0.72], rot: [-1.45, PI, 0], s: [1.6, 1, 0.4] });
      // the cloud bank it rests on
      for (const [x, z, sz] of [[2.3, -0.4, 0.75], [1.6, 0.35, 0.85], [0.7, 0.7, 0.8], [-0.2, 0.15, 0.85], [-0.9, -0.55, 0.8], [-1.75, -0.15, 0.95], [0.3, -0.6, 0.6]]) cloud(R, [x, 0.35 * sz, z], sz);
      R.fx({ mode: 'wander', n: 22, at: [0.3, 0.45, 0], box: [5, 0.6, 2.2], col: [0xffffff, 0xe6eefa], size: 1.1, speed: 0.2, p: [0.6, 0.2, 1], blend: 'normal' });
      R.fx({ mode: 'rise', n: 26, at: [0, 1.2, 0], box: [4.5, 1.8, 1.6], col: [0xffd27a, 0xfff2c0], size: 0.06, speed: 0.6, p: [1.2, 0.15, 1] });
    },
    idle(k) {
      // slow, dignified: a breath that travels down the body, head regarding the party
      k.wave(BAIBU.tail, 'x', 0.04, 3, 0.8, 0, (u) => u); k.wave(BAIBU.tail, 'y', 0.05, 4, 0.6);
      k.wave(BAIBU.neck, 'z', 0.04, 3, 0.7); k.r('head', 0.05 + sin(k.t * 0.5) * 0.06, sin(k.t * 0.35) * 0.2, 0);
      k.p('body', 0, sin(k.t * 0.7) * 0.05, 0);
      const fl = pulse((k.t * 0.4) % 1, 0, 0.05, 0.1, 0.16); k.s('tongue', -1 + fl * 1.2, 0, -1 + fl * 1.2);
    },
    move(k) { SERP.move(k, BAIBU); },
    clips: serpentClips(() => BAIBU, {
      special(k) {
        const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1);
        k.wave(BAIBU.tail, 'y', 0.2 * up, 2, 4); k.r('n0', -0.3 * up); k.r('head', -0.5 * up, 0, 0); k.r('jaw', 0.5 * up);
        k.fx.glow += 2.5 * up;
      },
    }),
  });

  // ============================================================================ 海鰻精 moray
  const MORAY = {};
  defB('moray', {
    h: 2.4, outline: 0.003, rim: 0.4, rimColor: 0xe0ffb0, clipY: -0.03, scroll: -0.1,
    build(R) {
      // S-curve rearing out of a dark hole in the water, mouth agape
      const c = snake(R, {
        tail: [[-0.1, -0.9, -0.5], [0.0, -0.45, -0.3]],
        base: [0.05, 0.0, -0.15],
        neck: [[0.15, 0.55, -0.32], [0.1, 1.1, -0.3], [-0.05, 1.55, -0.08], [0.0, 1.82, 0.28]],
        head: [0.02, 1.9, 0.6],
        r: (u) => 0.21 - 0.05 * sm(0.75, 1, u),
        c: (v, uu) => Rig.mix(0x7a8a28, 0xd0c870, sm(0.3, 0.8, cos(TAU * uu))), cell: 'reticulate', tile: 2,
      });
      Object.assign(MORAY, c);
      const hx = 0.02, hy = 1.92, hz = 0.66;
      R.bone('jaw', 'head', [hx, hy - 0.05, hz - 0.12]);
      const skull = GEO.lumpy(GEO.sph(0.2, 0.16, 0.42, 18, 12), 0.03, 4);
      GEO.warp(skull, (v) => { if (v.y < -0.02) v.y = -0.02 + (v.y + 0.02) * 0.3; v.y += max(0, -v.z) * 0.15; });
      R.add(skull, { b: 'head', c: 0x7a8a28, cell: 'reticulate', rep: [2, 2], at: [hx, hy + 0.05, hz + 0.06] });
      const jaw = GEO.sph(0.18, 0.1, 0.4, 14, 8); GEO.warp(jaw, (v) => { if (v.y > 0.01) v.y = 0.01 + (v.y - 0.01) * 0.2; });
      R.add(jaw, { b: 'jaw', c: 0xc8c070, cell: 'reticulate', at: [hx, hy - 0.06, hz + 0.05] });
      // throat/gums inside the gape
      R.add(GEO.sph(0.15, 0.06, 0.34, 12, 6), { b: 'head', c: 0x9a2a3a, cell: 'skin', at: [hx, hy + 0.0, hz + 0.04] });
      R.add(GEO.sph(0.15, 0.05, 0.34, 12, 6), { b: 'jaw', c: 0x7a1a2a, cell: 'skin', at: [hx, hy - 0.04, hz + 0.04] });
      for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
        R.add(GEO.cone(0.022, 0.085 - i * 0.006, 5), { b: 'head', c: 0xf4f0dc, at: [hx + s * (0.14 - i * 0.01), hy - 0.02, hz + 0.38 - i * 0.07], rot: [PI, 0, 0] });
        R.add(GEO.cone(0.02, 0.075 - i * 0.006, 5), { b: 'jaw', c: 0xf4f0dc, at: [hx + s * (0.13 - i * 0.01), hy - 0.03, hz + 0.36 - i * 0.07] });
      }
      R.add(GEO.cone(0.03, 0.12, 5), { b: 'head', c: 0xf4f0dc, at: [hx, hy - 0.02, hz + 0.43], rot: [PI, 0, 0] });
      for (const s of [-1, 1]) R.add(GEO.cyl(0.015, 0.02, 0.08, 6), { b: 'head', c: 0x5a6a18, at: [hx + s * 0.06, hy + 0.12, hz + 0.44], rot: [-0.6, 0, 0] });
      eyes(R, 'head', [hx, hy + 0.15, hz + 0.24], 0.12, 0.045, 0xb0b050, { yaw: 1.1, cell: 'eye' });
      // continuous dorsal fin along the back and down over the neck
      along(R, c.order, () => 0.21, 0.32, 0.93, 0.05, (u, m, d, side, up) => ({ geo: GEO.card(0.2, 0.13, 1, 1), m: 'cut', c: 0x5a6a1a, cell: 'fin', decal: true,
        at: [m.x - d.x * 0.05, m.y - d.y * 0.05, m.z - d.z * 0.05].map((x, i) => x + [up.x, up.y, up.z][i] * 0.17),
        rot: (() => { const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d.clone().negate(), up, side)), 'YXZ'); return [e.x, e.y, e.z]; })() }));
      waterDisk(R, 1.25, [0.05, 0.02, -0.1], 0x245a6a);
      R.add(GEO.cyl(0.3, 0.3, 0.02, 20), { m: 'glow', c: 0x0a1a20, cell: 'blank', at: [0.05, 0.0, -0.15] });
      R.fx({ mode: 'rise', n: 16, at: [0, 0.2, 0], box: [0.8, 0.2, 0.8], col: [0xc0f0ff], size: 0.06, speed: 0.6, p: [1.6, 0.1, 1] });
    },
    idle(k) { SERP.idle(k, MORAY, 1.4); k.r('jaw', 0.32 + 0.15 * sin(k.t * 2.4)); },
    move(k) { SERP.move(k, MORAY); },
    clips: serpentClips(() => MORAY),
  });

  // ============================================================================ 潮病海蛇 tide_serpent (boss)
  // A colossal sea serpent swimming the Kuroshio, scales seeping black tide-sickness. It wrecked the canoes because it hurts.
  // Phase 2: the sickness erupts — black thorns split through the scales and the glowing spots turn violet.
  const TIDE = {};
  defB('tide_serpent', {
    h: 5.6, boss: true, outline: 0.003, rim: 0.45, rimColor: 0xa0fff0, clipY: -0.05, wide: 1.4, scroll: -0.06, edge: [0.5, 1.6, 1.4], phaseGlow: 1.6,
    build(R) {
      const SEA = 0x1f5f66, SEA2 = 0x3a8a88, BELLY = 0xb8d8c8;
      const c = snake(R, {
        tail: [[2.6, -0.6, -2.4], [2.4, 0.9, -2.5], [1.9, 1.5, -2.4], [1.3, 0.9, -2.2], [1.0, -0.8, -2.0], [0.2, -0.8, -1.8], [-0.4, 0.9, -1.8], [-1.1, 1.8, -1.6], [-1.8, 1.0, -1.2], [-2.0, -0.6, -0.8]],
        base: [-1.4, -0.7, 0.0],
        neck: [[-0.6, 0.6, 0.15], [-0.1, 1.8, 0.0], [0.2, 3.0, -0.25], [0.05, 4.0, -0.15], [-0.25, 4.7, 0.2]],
        head: [-0.2, 5.0, 0.75],
        r: (u) => 0.06 + 0.42 * sm(0, 0.4, u) * (1 - 0.2 * sm(0.7, 0.95, u)) + 0.05 * sm(0.95, 1, u),
        c: (v, uu) => {
          const b = sm(0.3, 0.7, cos(TAU * uu));
          const sick = sm(0.55, 0.75, fbm(v.x * 1.3, v.y * 1.3, v.z * 1.3));
          return Rig.mix(Rig.mix(SEA, SEA2, 0.5 + 0.5 * sin(v.y * 2 + v.x)), BELLY, b).lerp(new THREE.Color(0x0a0c14), sick * 0.85);
        },
        cell: 'scale', rep: [5, 40], sides: 16,
      });
      Object.assign(TIDE, c);
      // head: wide toothed sea-serpent skull, cheek fins, barnacle crown
      const hx = -0.2, hy = 5.02, hz = 0.85;
      snakeHead(R, [hx, hy, hz], { len: 1.15, w: 0.8, hgt: 0.55, col: SEA, belly: BELLY, eye: 0xd0ff90, cell: 'scale', snout: 0.3, tongue: false });
      R.add(GEO.sph(0.32, 0.12, 0.5, 14, 8), { b: 'jaw', c: 0xffffff, cell: 'maw', uvp: 'y', at: [hx, hy - 0.12, hz + 0.15] });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) R.add(GEO.cone(0.035, 0.16, 5), { b: 'head', c: 0xf0ecd8, at: [hx + s * (0.3 - i * 0.03), hy - 0.18, hz + 0.45 - i * 0.12], rot: [PI, 0, 0] });
        R.add(GEO.card(0.9, 0.8, 1, 3), { m: 'cut', b: 'head', c: 0x3ab0a8, cell: 'fin', decal: true, at: [hx + s * 0.35, hy + 0.05, hz - 0.35], rot: [-1.3, s * 1.2, 0], s: [1.3, 1, 1] });
        R.add(GEO.card(0.7, 0.6, 1, 3), { m: 'cut', b: 'head', c: 0x2a8a88, cell: 'fin', decal: true, at: [hx + s * 0.3, hy - 0.15, hz - 0.45], rot: [-1.8, s * 1.4, 0], s: [1.3, 1, 1] });
      }
      for (const [bx, bz, br] of [[0.12, -0.1, 0.09], [-0.1, -0.25, 0.07], [0.02, -0.4, 0.06]]) R.add(GEO.lumpy(GEO.cyl(br * 0.6, br, br * 0.8, 8), 0.05, 8), { b: 'head', c: 0xd8d4c4, cell: 'barnacle', at: [hx + bx, hy + 0.24, hz + bz] });
      // dorsal sail along the neck, barnacle patches, glowing spots
      const rf = (u) => 0.06 + 0.42 * sm(0, 0.4, u);
      along(R, c.order, rf, 0.52, 0.95, 0.03, (u, m, d, side, up, r) => ({ geo: GEO.card(0.42, 0.55 + 0.25 * sin(u * 40), 1, 2), m: 'cut', c: 0x2f9a98, cell: 'fin', decal: true, at: [m.x + up.x * r * 0.7, m.y + up.y * r * 0.7, m.z + up.z * r * 0.7], rot: (() => { const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(d.clone().negate(), up, side)), 'YXZ'); return [e.x, e.y, e.z]; })() }));
      along(R, c.order, rf, 0.05, 0.95, 0.022, (u, m, d, side, up, r) => {
        const a = R.r() * TAU, n = up.clone().multiplyScalar(cos(a)).addScaledVector(side, sin(a));
        if (n.y < -0.4) return null;
        return { geo: GEO.sph(0.035 + r * 0.06, 0.03 + r * 0.06, 0.035 + r * 0.06, 8, 6), m: 'glow', c: 0x6af0c0, cell: 'blank', at: [m.x + n.x * r * 0.97, m.y + n.y * r * 0.97, m.z + n.z * r * 0.97] };
      });
      along(R, c.order, rf, 0.1, 0.9, 0.07, (u, m, d, side, up, r) => ({ geo: GEO.lumpy(GEO.sph(r * 0.4, r * 0.18, r * 0.4, 8, 6), 0.03, 6), c: 0xc8c4b0, cell: 'barnacle', at: [m.x + up.x * r * 0.9 + side.x * r * 0.3, m.y + up.y * r * 0.9, m.z + up.z * r * 0.9 + side.z * r * 0.3] }));
      // phase 2: black thorns erupt along the spine (grown in by phase bones)
      const thorns = c.order.slice(3, c.order.length - 2);
      thorns.forEach((bn, i) => {
        if (i % 2) return;
        const pb = R.phaseBone('thorn' + i, bn, R.B[bn].pos.toArray(), 2);
        const m = R.B[bn].pos, r = rf(i / thorns.length * 0.8 + 0.2);
        for (let j = 0; j < 3; j++) {
          const a = (j - 1) * 0.9, dir = new THREE.Vector3(sin(a) * 0.8, cos(a), 0.2).normalize();
          R.add(GEO.cone(0.08, 0.6 + R.r() * 0.4, 6), { b: pb, c: 0x0c0a14, cell: 'stone', at: [m.x + dir.x * r, m.y + dir.y * r + 0.25, m.z + dir.z * r], rot: yAlong(dir) });
          R.add(GEO.cone(0.03, 0.45, 5), { m: 'glow', b: pb, c: 0x9a40ff, cell: 'blank', at: [m.x + dir.x * r * 1.05, m.y + dir.y * r + 0.22, m.z + dir.z * r * 1.05], rot: yAlong(dir) });
        }
      });
      waterDisk(R, 3.6, [0, 0.02, -1.0], 0x1a4a5a);
      R.fx({ mode: 'fall', n: 40, at: [0, 3.0, -0.5], box: [3.5, 3.5, 3.0], col: [0x0a0a14, 0x1a1028], size: 0.08, speed: 0.8, p: [2.5, 0.1, 1], blend: 'normal' });
      R.fx({ mode: 'rise', n: 40, at: [0, 0.2, -1.0], box: [5, 0.3, 4], col: [0xb0f0ff, 0x6af0c0], size: 0.07, speed: 0.6, p: [2.2, 0.2, 1] });
      R.fx({ mode: 'wander', n: 16, at: [0, 0.35, -1.0], box: [6, 0.4, 5], col: [0xd8eef0], size: 1.4, speed: 0.2, p: [0.6, 0.2, 1], blend: 'normal' });
      R.light({ b: 'head', at: [hx, hy + 0.2, hz + 0.3], color: '#6af0c0', i: 1.2, r: 6 });
    },
    idle(k) {
      SERP.idle(k, TIDE, 0.7);
      k.wave(TIDE.tail, 'x', 0.06, 4, 0.9, 0, (u) => u);
      k.r('jaw', 0.1 + 0.08 * sin(k.t * 1.3));
      // pain: occasional shudder
      const sh = pulse((k.t * 0.23) % 1, 0.0, 0.03, 0.08, 0.14); k.wave(TIDE.neck, 'z', 0.06 * sh, 1, 40);
    },
    move(k) { SERP.move(k, TIDE); },
    clips: serpentClips(() => TIDE, {
      special(k) {
        // tidal slam: rears to full height, crashes down onto the party
        const u = k.u, up = pulse(u, 0.05, 0.4, 0.4, 0.55), down = pulse(u, 0.45, 0.58, 0.7, 1);
        TIDE.neck.forEach((b, i) => k.r(b, -0.18 * up + 0.32 * down * (0.4 + i / 5), 0, 0));
        k.r('head', -0.5 * up + 0.3 * down); k.r('jaw', 1.0 * up); k.p('body', 0, 0.4 * up, 0.6 * down);
        k.fx.glow += 2.5 * up + 1.5 * down; k.fx.flash = max(k.fx.flash, 0.5 * pulse(u, 0.55, 0.58, 0.62, 0.75));
      },
    }),
  });

  // ============================================================================ serpent family helpers
  // snake(R, { tail: [tip … next-to-base], base, neck: [after base …], head, r(u) (u: 0 tail tip → 1 head), c(v,u,w), cell, rep, sides, m })
  // bones: 'body' at base; tail chain 't0…' runs base→tip; neck chain 'n0…' runs base→head; 'head' at the end.
  function snake(R, o) {
    R.bone('body', 'root', o.base);
    const tailPts = o.tail.slice().reverse(); // base-side first
    const tail = tailPts.map((p, i) => R.bone('t' + i, i ? 't' + (i - 1) : 'body', p));
    const neck = o.neck.map((p, i) => R.bone('n' + i, i ? 'n' + (i - 1) : 'body', p));
    R.bone('head', neck.length ? neck[neck.length - 1] : 'body', o.head);
    const order = tail.slice().reverse().concat(['body'], neck, ['head']);
    R.tube(order, { r: o.r, sides: o.sides || 14, c: o.c, cell: o.cell || 'scale', rep: o.rep || [2, 30], tile: o.tile, m: o.m, ext: [0.12, 0], n: order.length * 6, up: [0, 1, 0] });
    return { tail, neck, order };
  }
  // generic serpent head: skull + jaw, eyes, nostrils, fangs, forked tongue. o: { len, w, hgt, col, belly, eye, cell, snout }
  function snakeHead(R, at, o) {
    const [x, y, z] = at, L = o.len, W = o.w, Hh = o.hgt || W * 0.72;
    R.bone('jaw', 'head', [x, y - Hh * 0.2, z - L * 0.25]);
    const skull = GEO.sph(W * 0.5, Hh * 0.5, L * 0.55, 18, 12);
    GEO.warp(skull, (v) => { const f = (v.z / (L * 0.55) + 1) / 2; v.x *= 1 - f * (o.snout || 0.35); v.y *= 1 - f * 0.25; if (v.y < 0) v.y *= 0.55; v.y += f * f * (o.upturn || 0) * L; });
    R.add(skull, { b: 'head', c: o.col, cell: o.cell || 'scale', rep: [2, 2], at: [x, y, z] });
    const jaw = GEO.sph(W * 0.42, Hh * 0.22, L * 0.5, 14, 8);
    GEO.warp(jaw, (v) => { const f = (v.z / (L * 0.5) + 1) / 2; v.x *= 1 - f * 0.4; });
    R.add(jaw, { b: 'jaw', c: o.belly || o.col, cell: 'belly', at: [x, y - Hh * 0.3, z + L * 0.02] });
    R.add(GEO.sph(W * 0.36, Hh * 0.1, L * 0.42, 12, 6), { b: 'jaw', c: 0x5a1a28, cell: 'skin', at: [x, y - Hh * 0.2, z + L * 0.05] });
    // brow ridges over set-in, slit-pupil eyes
    for (const s of [-1, 1]) R.add(GEO.sph(W * 0.16, W * 0.07, L * 0.2, 10, 6), { b: 'head', c: o.col, cell: o.cell || 'scale', at: [x + s * W * 0.3, y + Hh * 0.36, z + L * 0.1], rot: [0, s * 0.35, s * -0.3] });
    eyes(R, 'head', [x, y + Hh * 0.2, z + L * 0.12], W * 0.37, W * 0.11, o.eye || 0x9a9050, { yaw: 1.0, sy: 0.75, cell: o.eyeCell || 'eye', m: o.eyeM || 'glow' });
    for (const s of [-1, 1]) {
      R.add(GEO.sph(W * 0.03, W * 0.02, W * 0.03, 6, 4), { b: 'head', c: 0x101010, at: [x + s * W * 0.1, y + Hh * 0.12 + (o.upturn || 0) * L * 0.8, z + L * 0.46] });
      if (o.fangs !== false) R.add(GEO.cone(W * 0.035, Hh * 0.35, 6), { b: 'head', c: 0xf4eedc, at: [x + s * W * 0.16, y - Hh * 0.26, z + L * 0.32], rot: [PI, 0, 0] });
    }
    if (o.tongue !== false) {
      R.bone('tongue', 'jaw', [x, y - Hh * 0.22, z + L * 0.3]);
      for (const s of [-1, 1]) R.add(GEO.sweep([[x, y - Hh * 0.22, z + L * 0.3], [x, y - Hh * 0.22, z + L * 0.62], [x + s * W * 0.07, y - Hh * 0.2, z + L * 0.78]], W * 0.022, { sides: 4 }), { b: 'tongue', c: 0xd03050, cell: 'skin' });
    }
  }
  // serpent motion library
  const SERP = {
    idle(k, c, amp = 1) {
      k.wave(c.neck, 'z', 0.05 * amp, 4, 1.3); k.wave(c.neck, 'x', 0.04 * amp, 5, 0.9, 1);
      k.wave(c.tail, 'y', 0.06 * amp, 4, 1.1, 0, (u) => u);
      k.r('head', sin(k.t * 0.9) * 0.1, sin(k.t * 0.6) * 0.25 * amp, 0); k.r('jaw', 0.03 + 0.03 * sin(k.t * 2));
      const fl = pulse((k.t * 0.7) % 1, 0, 0.05, 0.12, 0.2); k.s('tongue', -1 + fl * 1.2, 0, -1 + fl * 1.2); k.r('tongue', sin(k.t * 40) * 0.2 * fl);
      k.s('body', sin(k.t * 1.5) * 0.02);
    },
    move(k, c) { k.wave(c.tail, 'y', 0.22, 3, 6, 0, (u) => 0.3 + u); k.wave(c.neck, 'z', 0.08, 3, 6, PI); k.r('head', 0, -sin(k.t * 6) * 0.15, 0); k.s('tongue', -0.9, 0, -0.9); },
    attack(k, c, s = 1) {
      // coil back → strike → hold → recoil
      const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.34, 0.44, 0.58, 0.95), n = c.neck.length;
      c.neck.forEach((b, i) => { const f = (i + 1) / n; k.r(b, (-0.35 * back + 0.42 * hit) * s * (0.4 + f), 0, 0); });
      k.p('body', 0, 0, (0.3 * hit - 0.1 * back) * s); k.r('head', 0.3 * back - 0.25 * hit, 0, 0);
      k.r('jaw', 0.9 * pulse(u, 0.25, 0.38, 0.5, 0.7)); k.s('tongue', -0.95, 0, -0.95);
      k.wave(c.tail, 'y', 0.15 * hit, 3, 12);
    },
    cast(k, c) {
      const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1);
      c.neck.forEach((b, i) => k.r(b, -0.12 * up, 0, sin(k.ct * 5 + i) * 0.04 * up));
      k.r('head', -0.45 * up, 0, 0); k.r('jaw', 0.7 * up); k.p('body', 0, 0.1 * up, 0);
      k.fx.glow += 1.8 * up; k.fx.psy += up;
    },
    hurt(k, c) { const h = pulse(k.u, 0, 0.08, 0.2, 1); c.neck.forEach((b) => k.r(b, -0.12 * h, 0, sin(k.ct * 50) * 0.05 * h)); k.r('head', -0.4 * h); k.r('jaw', 0.5 * h); k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.35, k.u)) * 1.2); },
    die(k, c) {
      const u = k.u, fall = sm(0.15, 0.75, u);
      c.neck.forEach((b, i) => k.r(b, 0.25 * fall + sin(k.ct * 30) * 0.03 * (1 - fall), 0, 0.12 * fall * (i % 2 ? 1 : -1)));
      k.r('head', 0.5 * fall); k.r('jaw', 0.6 * sm(0, 0.2, u));
      k.wave(c.tail, 'y', 0.2 * (1 - fall), 2, 20);
      k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.15, u)) * 0.8); k.fx.diss = max(k.fx.diss, sm(0.4, 1, u));
    },
  };
  function serpentClips(get, extra = {}) {
    return Object.assign({
      attack: (k) => SERP.attack(k, get()), cast: (k) => SERP.cast(k, get()), hurt: (k) => SERP.hurt(k, get()), die: (k) => SERP.die(k, get()),
    }, extra);
  }
  // stylised 3D cloud: a cluster of soft lumps, flat-ish underside, white top → blue-grey belly (no outline)
  function cloud(R, at, sz, o = {}) {
    const r = R.r;
    const n = o.n || 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r(), d = (i ? 0.55 : 0) * sz * (0.6 + r() * 0.5);
      const rr = sz * (i ? 0.38 + r() * 0.22 : 0.6);
      const g = GEO.lumpy(GEO.sph(rr * 1.15, rr * 0.8, rr, 14, 10), 0.08, 2.5, i + at[0]);
      GEO.warp(g, (v) => { if (v.y < 0) v.y *= 0.4; });
      R.add(g, { m: o.m || 'cut', b: o.b || 'root', cell: 'plain', at: [at[0] + cos(a) * d, at[1] + (i ? r() * 0.2 * sz : 0.1 * sz), at[2] + sin(a) * d * 0.7],
        c: (v) => Rig.mix(o.lo || 0xb8c4dc, o.hi || 0xffffff, sm(at[1] - sz * 0.2, at[1] + sz * 0.45, v.y)) });
    }
  }
  // water ripple disk (sea creatures surfacing)
  function waterDisk(R, r, at = [0, 0.02, 0], col = 0x2a6a80) {
    const g = idx(new THREE.RingGeometry(r * 0.15, r, 40, 3));
    g.rotateX(-PI / 2);
    // radial UVs (u around, v outward) so the scrolling ripple cell reads as rings
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); uv.setXY(i, (atan2(z, x) / TAU + 1) % 1 * 6, Math.hypot(x, z) / r * 3); }
    R.add(g, { m: 'water', c: (v) => Rig.mix(col, 0x9ad8e8, sm(0.85, 1.0, Math.hypot(v.x - at[0], v.z - at[2]) / r)), cell: 'water', at, rep: [1, 1] });
  }

  // ============================================================================ 蛇影 serpent_shade
  // The shadow left behind where the cloud serpent passed (一息界): an oil-dark snake whose scales breathe in rainbow.
  const SHADE = {};
  defB('serpent_shade', {
    h: 2.3, outline: 0.003, rim: 0.5, rimColor: 0xc0a0ff, psy: [2.2, 6, 0.12, 0.9], wide: 1.3, iri: 0.4,
    build(R) {
      const c = snake(R, {
        tail: [[1.0, 0.1, -0.35], [0.75, 0.13, -0.8], [0.15, 0.15, -1.0], [-0.5, 0.16, -0.8], [-0.85, 0.17, -0.2], [-0.62, 0.18, 0.38]],
        base: [-0.05, 0.2, 0.55],
        neck: [[0.4, 0.5, 0.42], [0.42, 0.95, 0.15], [0.1, 1.38, 0.0], [-0.12, 1.75, 0.12]],
        head: [-0.02, 1.98, 0.38],
        r: (u) => 0.008 + 0.16 * sm(0, 0.35, u) * (1 - 0.3 * sm(0.75, 0.95, u)) + 0.04 * sm(0.93, 1, u),
        c: (v, uu) => Rig.mix(0x2c2440, 0x7a68a0, sm(0.3, 0.75, cos(TAU * uu))), cell: 'scale', rep: [3, 30],
      });
      Object.assign(SHADE, c);
      snakeHead(R, [-0.02, 1.99, 0.44], { len: 0.55, w: 0.4, col: 0x30284a, belly: 0x6a5a8a, eye: 0x9ab850, cell: 'scale', snout: 0.45 });
      R.fx({ mode: 'wander', n: 30, at: [0, 0.9, 0], box: [2, 1.6, 2], col: [0xb080ff, 0x60e0ff, 0xff80d0], size: 0.05, speed: 0.6, p: [0.3, 1, 1] });
    },
    idle: (k) => SERP.idle(k, SHADE), move: (k) => SERP.move(k, SHADE),
    clips: serpentClips(() => SHADE, {
      special(k) { // shadow coil: whole body ripples with light, head sweeps round
        const u = k.u, up = pulse(u, 0.05, 0.3, 0.75, 1);
        k.wave(SHADE.tail, 'y', 0.3 * up, 3, 10); k.wave(SHADE.neck, 'z', 0.2 * up, 2, 8); k.r('head', 0, sin(u * TAU) * 0.8 * up, 0); k.r('jaw', 0.8 * up);
        k.fx.psy += 2.5 * up; k.fx.glow += up;
      },
    }),
  });

  // ============================================================================ 黑熊精 bear_spirit
  // Formosan black bear spirit: upright, heavy, white V on the chest; teal spirit-cracks glow through its fur.
  defB('bear_spirit', {
    h: 2.7, outline: 0.003, rim: 0.4, rimColor: 0x8ff0e0,
    build(R) {
      const FUR = 0x3c3846, FUR2 = 0x5a5464, TEAL = 0x3ff0d0;
      R.bone('body', 'root', [0, 1.05, 0]);
      R.bone('chest', 'body', [0, 1.6, 0.05]);
      R.bone('neck', 'chest', [0, 2.0, 0.18]);
      R.bone('head', 'neck', [0, 2.18, 0.3]);
      R.bone('jaw', 'head', [0, 2.08, 0.55]);
      for (const s of [-1, 1]) {
        const L = s < 0 ? 'L' : 'R';
        R.bone('arm' + L, 'chest', [s * 0.5, 1.85, 0.08]);
        R.bone('fore' + L, 'arm' + L, [s * 0.68, 1.35, 0.2]);
        R.bone('hand' + L, 'fore' + L, [s * 0.72, 0.95, 0.38]);
        R.bone('leg' + L, 'body', [s * 0.32, 0.95, 0]);
        R.bone('shin' + L, 'leg' + L, [s * 0.36, 0.5, 0.08]);
        R.bone('foot' + L, 'shin' + L, [s * 0.36, 0.12, 0.05]);
      }
      // torso: one lumpy mass skinned hips→chest
      // the white V (Formosan black bear's moon mark) is painted per-vertex onto a finely tessellated torso
      const torso = GEO.lumpy(GEO.sph(0.62, 0.78, 0.52, 40, 32), 0.07, 2.2, 3);
      const cF = new THREE.Color(FUR), cF2 = new THREE.Color(FUR2), cV = new THREE.Color(0xf2ead4), tc = new THREE.Color();
      const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)); return Math.hypot(px - ax - dx * t, py - ay - dy * t); };
      R.add(torso, {
        skin: byY('body', 'chest', 1.1, 1.75), cell: 'fur', rep: [3, 3], at: [0, 1.4, 0],
        c: (v) => {
          tc.copy(cF).lerp(cF2, sm(0.7, 2.0, v.y));
          if (v.z > 0.15) { const d = min(segD(v.x, v.y, -0.44, 1.98, 0, 1.6), segD(v.x, v.y, 0.44, 1.98, 0, 1.6)); const wv = 0.075 + (v.y - 1.6) * 0.06; tc.lerp(cV, 1 - sm(wv - 0.015, wv + 0.015, d)); }
          return tc;
        },
      });
      // belly fluff lighter
      R.add(GEO.sph(0.45, 0.55, 0.3, 16, 12), { skin: byY('body', 'chest', 1.0, 1.6), c: 0x2e2a30, cell: 'fur', rep: [2, 2], at: [0, 1.2, 0.26] });
      // head
      R.add(GEO.lumpy(GEO.sph(0.36, 0.33, 0.34, 18, 14), 0.04, 3, 7), { b: 'head', c: FUR, cell: 'fur', rep: [2, 2], at: [0, 2.3, 0.32] });
      R.add(GEO.sph(0.2, 0.15, 0.22, 14, 10), { b: 'head', c: 0x8a6a4a, cell: 'bearface', uvp: 'z', at: [0, 2.2, 0.6] });
      R.add(GEO.sph(0.07, 0.05, 0.05, 8, 6), { b: 'head', c: 0x141010, cell: 'plain', at: [0, 2.26, 0.8] });
      R.add(GEO.sph(0.17, 0.07, 0.17, 12, 8), { b: 'jaw', c: 0x6a5040, cell: 'skin', at: [0, 2.07, 0.6] });
      for (const s of [-1, 1]) {
        R.add(GEO.sph(0.12, 0.12, 0.07, 12, 8), { b: 'head', c: FUR, cell: 'fur', at: [s * 0.27, 2.58, 0.25], rot: [0, 0, s * -0.3] });
        R.add(GEO.sph(0.07, 0.07, 0.03, 10, 6), { b: 'head', c: 0x5a4048, cell: 'skin', at: [s * 0.27, 2.58, 0.29], rot: [0, 0, s * -0.3] });
      }
      eyes(R, 'head', [0, 2.37, 0.6], 0.14, 0.045, TEAL, { yaw: 0.35 });
      // limbs
      for (const s of [-1, 1]) {
        const L = s < 0 ? 'L' : 'R';
        R.tube(['arm' + L, 'fore' + L, 'hand' + L], { r: (u) => 0.22 - u * 0.07, sides: 12, c: FUR, cell: 'fur', rep: [2, 3] });
        R.add(GEO.sph(0.2, 0.15, 0.2, 12, 10), { b: 'hand' + L, c: FUR, cell: 'fur', at: [s * 0.74, 0.86, 0.42] });
        for (let i = 0; i < 4; i++) R.add(GEO.cone(0.03, 0.17, 6), { b: 'hand' + L, c: 0xeee6d0, cell: 'plain', at: [s * (0.66 + i * 0.05), 0.76, 0.54 + (i % 2) * 0.03], rot: [2.4, 0, s * 0.2] });
        R.tube(['leg' + L, 'shin' + L, 'foot' + L], { r: (u) => 0.27 - u * 0.08, sides: 12, c: FUR, cell: 'fur', rep: [2, 3] });
        R.add(GEO.sph(0.22, 0.12, 0.32, 12, 10), { b: 'foot' + L, c: FUR, cell: 'fur', at: [s * 0.37, 0.1, 0.16] });
        for (let i = 0; i < 4; i++) R.add(GEO.cone(0.025, 0.1, 5), { b: 'foot' + L, c: 0xeee6d0, cell: 'plain', at: [s * (0.27 + i * 0.065), 0.06, 0.46], rot: [1.75, 0, 0] });
      }
      // spirit cracks over the torso and arms
      const rr = R.r;
      for (let k = 0; k < 7; k++) {
        let a = PI * 0.15 + rr() * PI * 1.8, h = -0.6 + rr() * 1.0; const pts = [];
        for (let i = 0; i < 6; i++) { pts.push(onEll([0, 1.4, 0], [0.69, 0.85, 0.58], a, clamp(h, -0.9, 0.9))); a += (rr() - 0.5) * 0.5; h += 0.14 + rr() * 0.08; }
        glowLine(R, pts, 0.011, 0x2ab8a0, { skin: byY('body', 'chest', 1.1, 1.75) });
      }
      R.fx({ mode: 'rise', n: 26, at: [0, 1.3, 0], box: [1.4, 1.6, 0.9], col: [TEAL, 0x9ffff0], size: 0.06, speed: 0.8, p: [0.9, 0.1, 1] });
      R.light({ b: 'chest', at: [0, 1.6, 0.6], color: '#3ff0d0', i: 0.6, r: 3 });
    },
    idle(k) {
      const b = sin(k.t * 1.6);
      k.p('body', sin(k.t * 0.8) * 0.02, b * 0.015, 0); k.r('body', 0.05, sin(k.t * 0.8) * 0.06, sin(k.t * 0.8) * 0.03);
      k.s('chest', b * 0.02); k.r('head', 0.08 + sin(k.t * 0.9) * 0.05, sin(k.t * 0.5) * 0.25, 0);
      k.r('jaw', 0.06 + 0.04 * sin(k.t * 1.6));
      for (const s of [-1, 1]) { const L = s < 0 ? 'L' : 'R'; k.r('arm' + L, -0.15 + b * 0.04, 0, s * 0.12); k.r('fore' + L, -0.35, 0, 0); k.r('leg' + L, -0.08, 0, 0); k.r('shin' + L, 0.16, 0, 0); k.r('foot' + L, -0.08, 0, 0); }
    },
    move(k) {
      const c = k.t * 6;
      k.p('body', 0, abs(sin(c)) * 0.06, 0); k.r('body', 0.12, sin(c) * 0.1, sin(c) * 0.08);
      k.r('head', -0.05, -sin(c) * 0.08, 0);
      for (const s of [-1, 1]) {
        const L = s < 0 ? 'L' : 'R', ph = c + (s < 0 ? 0 : PI);
        k.r('leg' + L, sin(ph) * 0.5, 0, 0); k.r('shin' + L, max(0, -cos(ph)) * 0.6, 0, 0); k.r('foot' + L, -sin(ph) * 0.2, 0, 0);
        k.r('arm' + L, -sin(ph) * 0.4 - 0.2, 0, s * 0.15); k.r('fore' + L, -0.4, 0, 0);
      }
    },
    clips: {
      attack(k) {
        // right-paw haymaker: rear back (anticipation) → swipe across → follow through → recover
        const u = k.u, back = pulse(u, 0, 0.32, 0.32, 0.45), hit = pulse(u, 0.36, 0.48, 0.6, 0.95);
        k.r('body', -0.2 * back + 0.35 * hit, 0.5 * back - 0.6 * hit, 0); k.p('body', 0, 0.05 * back, 0.35 * hit);
        k.r('armR', -2.4 * back - 0.6 * hit, 0, -0.6 * back + 1.1 * hit); k.r('foreR', -0.8 * back, 0, 0);
        k.r('armL', 0.3 * back - 0.5 * hit, 0, 0.3 * back); k.r('head', -0.3 * back + 0.25 * hit, 0, 0); k.r('jaw', 0.5 * back + 0.3 * hit);
        k.r('legL', -0.3 * hit); k.r('legR', 0.3 * hit);
        k.fx.glow += hit;
      },
      cast(k) {
        // roar: rise on hind legs, arms wide, head thrown back, cracks blaze
        const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1);
        k.p('body', 0, 0.12 * up, -0.1 * up); k.r('body', -0.3 * up, 0, 0); k.r('head', -0.6 * up + sin(k.ct * 40) * 0.04 * up, 0, 0); k.r('jaw', 0.75 * up);
        k.r('armL', -1.2 * up, 0, -0.9 * up); k.r('armR', -1.2 * up, 0, 0.9 * up); k.r('foreL', -0.5 * up); k.r('foreR', -0.5 * up);
        k.fx.glow += 2.2 * up;
      },
      special(k) {
        // double-paw ground slam
        const u = k.u, up = pulse(u, 0.05, 0.4, 0.4, 0.52), down = pulse(u, 0.45, 0.55, 0.7, 1);
        k.p('body', 0, 0.25 * up - 0.35 * down, 0.3 * down); k.r('body', -0.35 * up + 0.7 * down, 0, 0);
        for (const s of [-1, 1]) { const L = s < 0 ? 'L' : 'R'; k.r('arm' + L, -2.9 * up - 1.1 * down, 0, 0); k.r('fore' + L, -0.3 * up, 0, 0); k.r('leg' + L, -0.6 * down); k.r('shin' + L, 0.9 * down); }
        k.r('head', -0.4 * up + 0.3 * down); k.r('jaw', 0.6 * up);
        k.fx.glow += 2.5 * down; k.fx.flash = max(k.fx.flash, 0.4 * pulse(u, 0.52, 0.55, 0.58, 0.7));
      },
    },
  });

  // ============================================================================ 石像衛 stone_guardian
  // Temple statue-guard of the 燈母 shrine: weathered granite, moss and ferns, a planted sword, eyes that wake teal.
  defB('stone_guardian', {
    h: 3.1, outline: 0.003, rim: 0.25, ao: 0.45,
    build(R) {
      biped(R, { hip: 1.1, chest: 1.65, neck: 2.05, head: 2.25, sw: 0.36, sy: 1.95, arm: 0.85, hw: 0.17, armOut: 0.1, cz: 0.02 });
      R.bone('sword', 'handR', [0.5, 1.12, 0.2]);
      const ST = 0x9a9a92, ST2 = 0xb8b8ae, MOSS = 0x5a7a3a;
      const moss = (base) => (v, u, w) => { const m = sm(0.58, 0.7, fbm(v.x * 2.5 + 3, v.y * 2.5, v.z * 2.5)); return Rig.mix(base, MOSS, m * 0.85); };
      // plinth
      R.add(GEO.lumpy(GEO.box(1.3, 0.3, 1.0, 0.04), 0.02, 3), { b: 'root', c: moss(0x8a8a82), cell: 'stone', rep: [2, 1], at: [0, 0.15, 0] });
      torso(R, { y0: 1.05, y1: 2.0, r: (t) => 0.32 + 0.08 * sin(t * PI) - 0.1 * sm(0.8, 1, t), depth: 0.7, c: moss(ST), cell: 'stone', rep: [3, 2], seg: 14 });
      R.add(GEO.lumpy(GEO.box(0.62, 0.52, 0.4, 0.06), 0.02, 4), { b: 'chest', c: moss(ST2), cell: 'lamellar', rep: [3, 2], at: [0, 1.6, 0.05] });
      R.add(GEO.sph(0.11, 0.11, 0.04, 12, 8), { b: 'chest', c: 0xffffff, cell: 'mask_g', uvp: 'z', at: [0, 1.38, 0.26] });
      skirt(R, { y0: 1.12, y1: 0.48, r0: 0.34, r1: 0.44, n: 6, c: moss(ST), cell: 'lamellar', rep: [5, 2], k: 0.9, drag: 0.5, g: 0 });
      limbs(R, { arm: { r: (u) => 0.12 - u * 0.02, c: moss(ST), cell: 'stone', rep: [2, 2] }, leg: { r: (u) => 0.13 - u * 0.03, c: moss(ST), cell: 'stone', rep: [2, 2] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.lumpy(GEO.sph(0.2, 0.15, 0.2, 12, 8), 0.06, 4), { b: 'arm' + L, c: moss(ST2), cell: 'lamellar', at: [s * 0.4, 1.95, 0] });
        R.add(GEO.lumpy(GEO.sph(0.1, 0.11, 0.09, 10, 8), 0.06, 5), { b: 'hand' + L, c: ST, cell: 'stone', at: [s * 0.49, 1.08, 0.18] });
        R.add(GEO.lumpy(GEO.box(0.2, 0.12, 0.32, 0.04), 0.03, 5), { b: 'foot' + L, c: ST, cell: 'stone', at: [s * 0.17, 0.36, 0.06] });
      }
      // helmet & face
      R.add(GEO.lumpy(GEO.sph(0.21, 0.24, 0.21, 14, 12), 0.04, 4), { b: 'head', c: ST, cell: 'stone', at: [0, 2.25, 0.04] });
      R.add(GEO.lumpy(GEO.sph(0.25, 0.2, 0.25, 14, 10, { tl: PI * 0.55 }), 0.03, 5), { b: 'head', c: moss(ST2), cell: 'lamellar', at: [0, 2.3, 0.02] });
      R.add(GEO.cyl(0.03, 0.05, 0.16, 8), { b: 'head', c: ST2, cell: 'stone', at: [0, 2.56, 0.0] });
      R.add(GEO.sph(0.05, 0.05, 0.05, 8, 6), { b: 'head', c: ST2, cell: 'stone', at: [0, 2.66, 0] });
      R.add(GEO.box(0.3, 0.05, 0.08, 0.02), { b: 'head', c: 0x5a5a56, cell: 'stone', at: [0, 2.28, 0.21] });
      for (const s of [-1, 1]) R.add(GEO.sph(0.045, 0.02, 0.02, 8, 6), { b: 'head', m: 'glow', c: 0x60fff0, cell: 'blank', at: [s * 0.08, 2.28, 0.24] });
      // planted sword
      R.add(GEO.ext([[-0.05, 0], [0.05, 0], [0.06, 1.0], [0, 1.12], [-0.06, 1.0]], 0.03, 0.01), { b: 'sword', c: moss(0xa0a29a), cell: 'stone', at: [0.5, 0.0, 0.32] });
      R.add(GEO.box(0.32, 0.06, 0.08, 0.02), { b: 'sword', c: ST2, cell: 'stone', at: [0.5, 1.12, 0.32] });
      R.add(GEO.cyl(0.035, 0.035, 0.3, 8), { b: 'sword', c: ST, cell: 'stone', at: [0.5, 1.15, 0.32] });
      // ferns & grass tufts in the moss
      const r = R.r;
      for (let i = 0; i < 9; i++) {
        const spots = [[0.3, 1.98, 0.1, 'armR'], [-0.35, 1.98, 0.05, 'armL'], [0.5, 0.32, 0.4, 'root'], [-0.5, 0.32, 0.35, 'root'], [-0.45, 0.32, -0.4, 'root'], [0.15, 2.47, -0.1, 'head'], [0.2, 1.15, 0.3, 'body'], [-0.3, 1.2, 0.2, 'body'], [0.45, 0.32, -0.35, 'root']];
        const [x, y, z, b] = spots[i];
        for (let j = 0; j < 4; j++) R.add(GEO.card(0.08, 0.22 + r() * 0.12, 1, 2), { m: 'cut', b, c: Rig.mix(0x4a7a2a, 0x8ab040, r()), cell: 'frond', decal: true, at: [x, y - 0.02, z], rot: [-0.3 - r() * 0.4, j * 1.6 + r(), 0] });
      }
      R.fx({ mode: 'wander', n: 10, at: [0, 1.6, 0.2], box: [1.2, 1.6, 0.6], col: [0x60fff0], size: 0.04, speed: 0.5, p: [0.2, 1, 1] });
      R.light({ b: 'head', at: [0, 2.28, 0.3], color: '#60fff0', i: 0.5, r: 2.5 });
    },
    idle(k) {
      // statues barely breathe: rare grinding head turns
      const tt = k.t * 0.25, step = Math.round(sin(tt) * 2) / 2;
      k.r('head', 0, step * 0.25, 0); k.r('chest', 0.02 * sin(k.t * 0.8)); k.r('armR', -0.15); k.r('foreR', -0.25); k.r('armL', 0.05, 0, -0.1); k.r('foreL', -0.15);
    },
    move(k) { HUM.walk(k, { rate: 4, stride: 0.3, bob: 0.4 }); },
    clips: humClips({
      attack(k) {
        // wrench the sword from the plinth and bring it down
        HUM.chop(k, { lunge: 0.6 });
        k.fx.flash = max(k.fx.flash, 0.3 * pulse(k.u, 0.44, 0.47, 0.5, 0.6));
      },
      enter(k) { HUM.enter(k); k.fx.glow += 2 * pulse(k.u, 0.6, 0.8, 0.9, 1); },
    }),
  });

  // ============================================================================ 冥燈護法 nether_guardian (boss)
  // Guardian of the 萬燈閣: black lacquered armour hung with soul-jars, halberd and a blue soul-lantern. It truly believes
  // it guards the dead. Phase 2: the jars crack — freed souls orbit it and its helm-flames roar.
  defB('nether_guardian', {
    h: 4.8, boss: true, outline: 0.003, rim: 0.4, rimColor: 0x80c0ff, phaseGlow: 1.5, edge: [0.4, 1.0, 2.4],
    build(R) {
      biped(R, { hip: 1.75, chest: 2.6, neck: 3.25, head: 3.5, sw: 0.58, sy: 3.05, arm: 1.3, hw: 0.28, armOut: 0.14, cz: 0.04 });
      R.bone('halberd', 'handR', [0.78, 1.8, 0.3]);
      R.bone('lchain', 'handL', [-0.78, 1.75, 0.25]);
      R.bone('lantern', 'lchain', [-0.8, 1.35, 0.3]);
      const ARM = 0x1e222c, ARM2 = 0x343a48, GOLD = 0xb89a50, BLUE = 0x5ab0ff;
      torso(R, { y0: 1.6, y1: 3.15, r: (t) => 0.5 + 0.12 * sin(t * PI) - 0.14 * sm(0.8, 1, t), depth: 0.72, c: ARM, cell: 'lamellar', rep: [4, 3] });
      // breastplate with a soul-eye boss, gold trim
      R.add(GEO.lumpy(GEO.box(0.95, 0.75, 0.5, 0.12), 0.01, 3), { b: 'chest', c: ARM2, cell: 'metal', at: [0, 2.65, 0.08] });
      R.add(GEO.tor(0.13, 0.03, 8, 18), { b: 'chest', c: GOLD, cell: 'gold', at: [0, 2.72, 0.35] });
      R.add(GEO.sph(0.1, 0.1, 0.05, 12, 8), { b: 'chest', m: 'glow', c: 0x6ac0ff, cell: 'iris2', uvp: 'z', at: [0, 2.72, 0.36] });
      R.add(GEO.tor(0.45, 0.04, 6, 24), { b: 'body', c: GOLD, cell: 'gold', at: [0, 1.75, 0], rot: [PI / 2, 0, 0], s: [1, 0.74, 1] });
      R.add(GEO.box(0.3, 0.3, 0.06, 0.03), { b: 'body', c: GOLD, cell: 'qilin', at: [0, 1.65, 0.36] });
      skirt(R, { y0: 1.8, y1: 0.75, r0: 0.48, r1: 0.62, n: 8, c: ARM, cell: 'lamellar', rep: [8, 3], k: 0.3, wave: 8 });
      // cape (back half) — deep violet-black with a ragged hem
      skirt(R, { name: 'cape', parent: 'chest', y0: 3.1, y1: 0.35, r0: 0.55, r1: 0.95, n: 5, from: [PI - 1.2, PI + 1.2], c: [0x0e0a16, 0x2a1e40], cell: 'fringe', m: 'cut', rep: [3, 1], k: 0.1, g: 0.6, wave: 6 });
      limbs(R, { arm: { r: (u) => 0.19 - u * 0.04, c: ARM, cell: 'lamellar', rep: [3, 3] }, leg: { r: (u) => 0.22 - u * 0.06, c: ARM, cell: 'lamellar', rep: [3, 3] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        // spiked pauldrons with soul-flame
        R.add(GEO.lumpy(GEO.sph(0.36, 0.22, 0.33, 14, 10, { tl: PI * 0.6 }), 0.02, 3), { b: 'arm' + L, c: ARM2, cell: 'metal', at: [s * 0.66, 3.08, 0] });
        R.add(GEO.tor(0.3, 0.03, 6, 18, PI), { b: 'arm' + L, c: GOLD, cell: 'gold', at: [s * 0.66, 3.03, 0], rot: [0, PI / 2, 0] });
        for (let i = 0; i < 3; i++) R.add(GEO.cone(0.06, 0.32, 6), { b: 'arm' + L, c: ARM2, cell: 'metal', at: [s * (0.62 + i * 0.08), 3.22 - i * 0.04, -0.12 + i * 0.12], rot: [0, 0, s * -0.5] });
        R.add(GEO.lumpy(GEO.sph(0.15, 0.17, 0.14, 10, 8), 0.04, 5), { b: 'hand' + L, c: ARM2, cell: 'metal', at: [s * 0.78, 1.8, 0.25] });
        R.add(GEO.box(0.28, 0.16, 0.48, 0.05), { b: 'foot' + L, c: ARM2, cell: 'metal', at: [s * 0.28, 0.09, 0.08] });
        R.add(GEO.lumpy(GEO.sph(0.2, 0.2, 0.2, 10, 8), 0.02, 4), { b: 'shin' + L, c: ARM2, cell: 'metal', at: [s * 0.29, 0.92, 0.12] });
        // hanging soul-jars at the belt
        for (let j = 0; j < 2; j++) {
          const jx = s * (0.3 + j * 0.2), jz = 0.38 - j * 0.12;
          R.add(GEO.lathe([[0.001, 0], [0.09, 0.02], [0.11, 0.12], [0.06, 0.22], [0.07, 0.26], [0.001, 0.27]], 10), { b: 'body', m: 'glow', c: 0x3a8ad0, cell: 'glass', at: [jx, 1.28, jz] });
          tether(R, 'body', 'body', [jx, 1.72, jz - 0.05], [jx, 1.55, jz], 0.01, { c: 0x6a6050 });
        }
      }
      // horned helm with visor; blue soul-fire crest (additive cards)
      R.add(GEO.lumpy(GEO.sph(0.34, 0.36, 0.34, 16, 12), 0.02, 3), { b: 'head', c: ARM2, cell: 'metal', at: [0, 3.5, 0.05] });
      R.add(GEO.box(0.48, 0.1, 0.14, 0.03), { b: 'head', c: 0x0a0a10, cell: 'plain', at: [0, 3.46, 0.33] });
      for (const s of [-1, 1]) {
        R.add(GEO.sph(0.07, 0.03, 0.03, 8, 6), { b: 'head', m: 'glow', c: 0x6ac8ff, cell: 'blank', at: [s * 0.12, 3.47, 0.4] });
        R.add(GEO.sweep([[s * 0.28, 3.65, 0.0], [s * 0.55, 3.85, -0.05], [s * 0.62, 4.15, -0.15], [s * 0.5, 4.4, -0.25]], (u) => 0.09 * (1 - u * 0.9), { sides: 8 }), { b: 'head', c: 0xd8ccb0, cell: 'stone' });
      }
      R.add(GEO.tor(0.34, 0.035, 6, 20, PI), { b: 'head', c: GOLD, cell: 'gold', at: [0, 3.55, 0.05], rot: [0, 0, 0] });
      for (let i = 0; i < 5; i++) R.add(GEO.card(0.28, 0.6 + (i % 2) * 0.25, 1, 2), { m: 'add', b: 'head', c: BLUE, cell: 'flame', decal: true, at: [(i - 2) * 0.09, 3.8, -0.02], rot: [0, (i - 2) * 0.6, (i - 2) * -0.15] });
      // halberd (戟): long shaft, crescent blade, spear point, red tassel
      R.add(GEO.cyl(0.035, 0.035, 4.2, 8), { b: 'halberd', c: 0x2a1a14, cell: 'wood', at: [0.78, 1.8, 0.3] });
      R.add(GEO.cone(0.08, 0.5, 6), { b: 'halberd', c: 0xc8d0d8, cell: 'metal', at: [0.78, 4.12, 0.3] });
      R.add(GEO.ext([[0, 0], [0.45, 0.15], [0.55, 0.45], [0.35, 0.3], [0.0, 0.25]], 0.025, 0.01), { b: 'halberd', c: 0xc8d0d8, cell: 'metal', at: [0.8, 3.45, 0.3] });
      R.add(GEO.ext([[0, 0], [0.45, 0.15], [0.55, 0.45], [0.35, 0.3], [0.0, 0.25]], 0.01, 0), { b: 'halberd', m: 'glow', c: 0x5ab0ff, cell: 'blank', at: [0.8, 3.45, 0.3], s: [1.04, 1.04, 1] });
      strand(R, 'tassel', 'halberd', [[0.78, 3.8, 0.3], [0.8, 3.55, 0.32], [0.82, 3.3, 0.33]], { r: 0.05, ell: [1, 1], c: 0xb01818, cell: 'hair', k: 0.2, g: 0.7 });
      // soul lantern on a chain (spring) in the left hand
      tether(R, 'handL', 'lantern', [-0.78, 1.72, 0.25], [-0.8, 1.38, 0.3], 0.012, { c: 0x6a6050 });
      R.spring(['lchain', 'lantern'], { k: 0.12, drag: 0.08, g: 0.8, tail: [0, -0.4, 0] });
      R.add(GEO.lathe([[0.001, 0.0], [0.18, 0.02], [0.2, 0.08], [0.2, 0.42], [0.16, 0.48], [0.001, 0.5]], 8), { b: 'lantern', m: 'glow', c: 0x4aa0ff, cell: 'lattice', rep: [4, 1], at: [-0.8, 0.88, 0.3] });
      R.add(GEO.cone(0.25, 0.16, 8), { b: 'lantern', c: ARM2, cell: 'metal', at: [-0.8, 1.42, 0.3] });
      R.add(GEO.cyl(0.2, 0.22, 0.05, 8), { b: 'lantern', c: ARM2, cell: 'metal', at: [-0.8, 0.86, 0.3] });
      // phase 2: soul-flames burst from the pauldrons, the jars' souls swirl
      for (const s of [-1, 1]) {
        const pb = R.phaseBone('pflame' + sideL(s), 'arm' + sideL(s), [s * 0.66, 3.2, 0], 2);
        for (let i = 0; i < 3; i++) R.add(GEO.card(0.35, 0.8, 1, 2), { m: 'add', b: pb, c: 0x6a8aff, cell: 'flame', decal: true, at: [s * 0.66, 3.15, 0], rot: [0, i * 1.05, s * 0.2] });
      }
      R.fx({ mode: 'orbit', n: 36, at: [0, 2.3, 0], box: [0.1, 1.6, 0.1], col: [0x8ad0ff, 0xc0e8ff, 0x5a80ff], size: 0.12, speed: 0.9, p: [1.3, 0.4, 1] });
      R.fx({ mode: 'rise', n: 26, at: [0, 3.9, -0.05], box: [0.4, 0.2, 0.3], col: [0x5ab0ff, 0xb0e0ff], size: 0.08, speed: 1.4, p: [0.9, 0.1, 1] });
      R.light({ b: 'lantern', at: [-0.8, 1.1, 0.3], color: '#5ab0ff', i: 1.6, r: 6, flicker: 0.15 });
      R.light({ b: 'head', at: [0, 3.9, 0], color: '#6a8aff', i: 0.8, r: 4, flicker: 0.3 });
    },
    idle(k) {
      HUM.idle(k, { elbow: 0.3, armOut: 0.15 });
      k.r('armR', -0.35, 0, 0.1); k.r('foreR', -0.65); k.r('armL', -0.25, 0, -0.1); k.r('foreL', -0.55);
      k.p('body', 0, -0.03, 0);
    },
    move(k) { HUM.walk(k, { rate: 4.5, stride: 0.35, bob: 0.5 }); k.r('foreR', -0.6); },
    clips: humClips({
      attack: (k) => { HUM.thrust(k); },
      cast(k) {
        // raise the soul-lantern high: chained souls stream out
        const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1);
        k.r('armL', -2.6 * up, 0, -0.2 * up); k.r('foreL', -0.2 * up); k.r('chest', -0.15 * up); k.r('head', -0.2 * up);
        k.r('armR', -0.5 * up); k.fx.glow += 2.5 * up;
      },
    }),
  });

  // ============================================================================ 心魔 inner_demon
  // Your own face and your worst words: a mirror-black doppelgänger veined with neon, a kaleidoscope halo behind its head,
  // glass shards orbiting. Its skin is a thin-film mirror that shifts hue as it moves.
  defB('inner_demon', {
    h: 2.6, outline: 0.003, rim: 0.7, rimColor: 0xff70e0, iri: 0.55, psy: [2.4, 8, 0.15, 1.1], edge: [1.6, 0.3, 1.4],
    build(R) {
      biped(R, { hip: 0.98, chest: 1.38, neck: 1.66, head: 1.84, sw: 0.22, sy: 1.58, arm: 0.66, hw: 0.11, armOut: 0.05, cz: 0.02 });
      R.bone('sword', 'handR', [0.3, 0.92, 0.12]);
      R.bone('halo', 'head', [0, 1.9, -0.25]);
      const INK = 0x14101e, INK2 = 0x2a1e3e, NEON = 0xff40c8, CY = 0x40e8ff;
      torso(R, { y0: 0.92, y1: 1.62, r: (t) => 0.2 + 0.04 * sin(t * PI) - 0.08 * sm(0.8, 1, t) - 0.03 * sm(0.3, 0.5, t) * (1 - sm(0.5, 0.7, t)), depth: 0.72, c: INK, cell: 'shard', rep: [3, 2] });
      skirt(R, { y0: 1.0, y1: 0.42, r0: 0.21, r1: 0.34, n: 6, c: [INK, INK2], cell: 'fringe', m: 'cut', rep: [4, 1], k: 0.15, wave: 7 });
      limbs(R, { arm: { r: (u) => 0.065 - u * 0.02, c: INK, cell: 'shard', rep: [2, 2] }, leg: { r: (u) => 0.085 - u * 0.03, c: INK, cell: 'shard', rep: [2, 2] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.sph(0.055, 0.07, 0.05, 10, 8), { b: 'hand' + L, c: INK, cell: 'shard', at: [s * 0.28, 0.93, 0.1] });
        R.add(GEO.box(0.1, 0.06, 0.24, 0.02), { b: 'foot' + L, c: INK, cell: 'shard', at: [s * 0.11, 0.04, 0.05] });
      }
      // head: smooth mask-like face (no features), two eye-slits, ponytail (spring) — your silhouette
      R.add(GEO.sph(0.15, 0.18, 0.16, 18, 14), { b: 'head', c: INK, cell: 'shard', at: [0, 1.85, 0.03] });
      for (const s of [-1, 1]) R.add(GEO.sph(0.045, 0.012, 0.02, 8, 6), { b: 'head', m: 'glow', c: s < 0 ? NEON : CY, cell: 'blank', at: [s * 0.06, 1.87, 0.18], rot: [0, s * 0.3, s * -0.2] });
      R.add(GEO.sph(0.16, 0.12, 0.17, 16, 8, { tl: PI / 2 }), { b: 'head', c: INK2, cell: 'hair', at: [0, 1.9, 0.02] });
      strand(R, 'tail', 'head', [[0, 1.98, -0.12], [0, 1.85, -0.26], [0.0, 1.6, -0.3], [0, 1.35, -0.28], [0, 1.15, -0.26]], { r: (u) => 0.06 * (1 - u * 0.7), ell: [1, 0.6], c: INK2, k: 0.12, g: 0.4 });
      // neon fracture veins over the body
      const r = R.r;
      for (let i = 0; i < 9; i++) {
        let a = r() * TAU, h = -0.8 + r() * 1.2; const pts = [];
        for (let j = 0; j < 5; j++) { pts.push(onEll([0, 1.28, 0.02], [0.235, 0.36, 0.175], a, clamp(h, -0.95, 0.95))); a += (r() - 0.5) * 0.9; h += 0.25 + r() * 0.15; }
        glowLine(R, pts, 0.007, i % 2 ? NEON : CY, { skin: byY('body', 'chest', 1.0, 1.5) });
      }
      // blade of violet light
      R.add(GEO.ext([[-0.025, 0], [0.025, 0], [0.03, 0.85], [0, 0.98], [-0.03, 0.85]], 0.012, 0.004), { b: 'sword', m: 'glow', c: 0xd060ff, cell: 'blank', at: [0.3, 0.92, 0.14], rot: [1.35, 0, 0] });
      R.add(GEO.box(0.14, 0.03, 0.04, 0.01), { b: 'sword', c: INK2, cell: 'metal', at: [0.3, 0.92, 0.14], rot: [1.35, 0, 0] });
      // kaleidoscope halo (psy) and orbiting mirror shards
      R.add(GEO.plane(0.84, 0.84), { b: 'halo', m: 'add', c: 0xb090ff, cell: 'mandala', decal: true, at: [0, 1.9, -0.25] });
      R.add(GEO.tor(0.44, 0.012, 6, 40), { b: 'halo', m: 'glow', c: 0xff80e0, cell: 'blank', at: [0, 1.9, -0.24] });
      R.bone('shards', 'body', [0, 1.3, 0]);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU, rr = 0.55 + (i % 2) * 0.15;
        R.add(GEO.oct(0.07 + r() * 0.05), { b: 'shards', m: 'psy', c: 0xb0a0e0, cell: 'blank', at: [cos(a) * rr, 1.1 + sin(i * 2.3) * 0.4, sin(a) * rr], s: [0.5, 1.6, 0.25], rot: [r(), r() * 3, r()] });
      }
      R.fx({ mode: 'rise', n: 22, at: [0, 0.5, 0], box: [0.6, 0.6, 0.6], col: [NEON, CY, 0xb070ff], size: 0.05, speed: 1, p: [1.6, 0.2, 1] });
    },
    always(k) { k.r('shards', 0, k.t * 0.6, 0); k.r('halo', 0, 0, k.t * 0.3); },
    idle(k) { HUM.idle(k, { elbow: 0.3 }); k.r('armR', -0.2, 0, 0.2); k.r('foreR', -0.4); k.r('head', 0.12, 0, 0.12 + 0.05 * sin(k.t * 0.7)); k.p('body', 0, 0.04 + 0.03 * sin(k.t * 1.2), 0); },
    move(k) { HUM.walk(k, { rate: 7, stride: 0.5 }); },
    clips: humClips({
      attack(k) {
        // mirror-step: a flicker forward and a rising cross-slash
        const u = k.u, blink = pulse(u, 0.25, 0.32, 0.35, 0.42), hit = pulse(u, 0.32, 0.42, 0.6, 0.95);
        HUM.chop(k);
        k.fx.diss = max(k.fx.diss, 0.55 * blink); k.fx.psy += 2 * hit;
      },
      special(k) {
        // shatter: the body splits into kaleidoscope shards and reforms
        const u = k.u, br = pulse(u, 0.2, 0.4, 0.6, 0.85);
        k.s('shards', 1.5 * br); k.r('shards', 0, u * 8, 0); k.s('halo', 1.2 * br); k.fx.diss = max(k.fx.diss, 0.7 * br); k.fx.psy += 3 * br; k.fx.glow += 2 * br;
        k.r('armR', -2.5 * br, 0, 0.6 * br); k.r('armL', -2.5 * br, 0, -0.6 * br);
      },
    }),
  });


  // ghost wisp tail: a lathe that narrows into a curling translucent tail, skinned to a spring chain
  function wispTail(R, o) {
    const pts = o.pts || [[0, o.y0, 0], [0.02, o.y0 - 0.3, -0.05], [0.06, o.y0 - 0.6, -0.15], [0.12, o.y0 - 0.85, -0.3]];
    const ch = R.chain(o.name || 'wisp', o.parent || 'body', pts);
    R.tube(ch, { r: (u) => o.r * (1 - u * 0.85), sides: 14, c: o.c, cell: o.cell || 'cloth', m: o.m || 'ghost', ext: [0, 0.15], ell: [1, 0.85] });
    R.spring(ch.slice(1), { k: 0.1, drag: 0.1, g: -0.1, wind: 0.6 });
    return ch;
  }
  // long sleeve (water-sleeve feel): tube over arm chain flaring past the hand, hem spring-weighted to the hand
  function sleeve(R, s, o) {
    const L = sideL(s);
    R.tube(['arm' + L, 'fore' + L, 'hand' + L], { r: (u) => o.r0 + (o.r1 * 0.7 - o.r0) * sm(0.3, 0.9, u), sides: 12, c: o.c, cell: o.cell || 'robe', rep: [2, 2], ext: [0.04, 0.0], m: o.m });
    R.add(GEO.sph(o.r0 * 1.35, o.r0 * 1.2, o.r0 * 1.3, 12, 8), { b: 'arm' + L, c: o.c, cell: o.cell || 'robe', at: R.B['arm' + L].pos.toArray(), m: o.m });
  }
  const GHOST = {
    idle(k, o = {}) { HUM.idle(k, o); k.p('body', 0, 0.08 + sin(k.t * 1.3) * 0.06, 0); k.r('body', 0.04 + sin(k.t * 0.9) * 0.03, 0, sin(k.t * 0.7) * 0.04); },
    move(k) { k.p('body', 0, 0.1 + sin(k.t * 3) * 0.05, 0); k.r('body', 0.25, 0, sin(k.t * 3) * 0.05); for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, 0.3, 0, s * 0.15); k.r('fore' + L, -0.2); } },
  };

  // ============================================================================ 孤魂 hungry_ghost (also 孤棚餓鬼 boss, variant 2 × 1.5)
  // An unworshipped wandering soul in a pale burial robe, needle-thin neck, tiny mouth, hands held out for offerings.
  defB('hungry_ghost', {
    h: 2.5, outline: 0.003, rim: 0.6, rimColor: 0xc0e8ff,
    build(R) {
      biped(R, { hip: 1.15, chest: 1.55, neck: 1.82, head: 2.08, sw: 0.2, sy: 1.72, arm: 0.66, hw: 0.1, armOut: 0.06, legs: false, nz: 0.06, hz: 0.1 });
      const ROBE = 0xe8ecef, SKIN = 0xd8e2ea;
      torso(R, { y0: 1.1, y1: 1.8, r: (t) => 0.2 + 0.02 * sin(t * PI) - 0.08 * sm(0.8, 1, t), depth: 0.8, c: ROBE, cell: 'robe', rep: [3, 2] });
      R.add(GEO.box(0.16, 0.4, 0.02, 0.01), { b: 'chest', c: 0xb8c4cc, cell: 'cloth', at: [0.05, 1.45, 0.18], rot: [0, 0, 0.12] });
      skirt(R, { y0: 1.15, y1: 0.4, r0: 0.21, r1: 0.3, n: 6, c: [0xc8d4dc, ROBE], cell: 'robe', rep: [3, 2], k: 0.12, g: 0.1, wave: 6 });
      skirt(R, { name: 'hem', y0: 0.44, y1: 0.12, r0: 0.3, r1: 0.26, n: 6, c: 0xd8e4ec, cell: 'fringe', m: 'ghost', rep: [5, 1], k: 0.08, g: -0.1 });
      for (const s of [-1, 1]) sleeve(R, s, { r0: 0.07, r1: 0.16, c: ROBE, ext: 0.12 });
      for (const s of [-1, 1]) { const L = sideL(s); R.add(GEO.sph(0.04, 0.06, 0.03, 8, 6), { b: 'hand' + L, c: SKIN, cell: 'skin', at: [s * 0.27, 0.98, 0.12] }); }
      // needle neck & head
      R.tube(['chest', 'neck', 'head'], { r: (u) => 0.035 + 0.03 * sm(0, 0.2, 1 - u), sides: 8, c: SKIN, cell: 'skin', ext: [0, 0] });
      R.add(GEO.sph(0.15, 0.18, 0.15, 16, 12), { b: 'head', c: SKIN, cell: 'skin', at: [0, 2.1, 0.1] });
      faceShell(R, 'ghostface', [0, 2.09, 0.105], 0.155, 0.185, 0.155, { b: 'head', wide: 0.95, t0: 0.6, tl: 1.75 });
      R.add(GEO.sph(0.155, 0.12, 0.16, 16, 8, { tl: PI / 2 }), { b: 'head', c: 0x101418, cell: 'hair', at: [0, 2.15, 0.08] });
      R.add(GEO.sph(0.08, 0.07, 0.08, 10, 8), { b: 'head', c: 0x101418, cell: 'hair', at: [0, 2.32, 0.02] });
      for (const s of [-1, 1]) strand(R, 'lock' + sideL(s), 'head', [[s * 0.12, 2.12, 0.08], [s * 0.15, 1.95, 0.08], [s * 0.15, 1.75, 0.05]], { r: 0.035, c: 0x101418, k: 0.2 });
      // 鬼火: blue will-o-wisps hovering by the hands
      for (const s of [-1, 1]) R.add(GEO.card(0.14, 0.24, 1, 1), { m: 'add', b: 'hand' + sideL(s), c: 0x60b0ff, cell: 'flame', decal: true, at: [s * 0.33, 1.05, 0.2], rot: [0, s * 0.4, 0] });
      R.fx({ mode: 'orbit', n: 10, at: [0, 1.3, 0], box: [0.1, 0.8, 0.1], col: [0x80c8ff, 0xc0e8ff], size: 0.09, speed: 0.8, p: [0.7, 0.3, 1] });
      R.fx({ mode: 'wander', n: 10, at: [0, 0.2, 0], box: [0.8, 0.2, 0.8], col: [0xe8f0f8], size: 0.5, speed: 0.4, p: [0.3, 0.2, 1], blend: 'normal' });
      R.light({ b: 'chest', at: [0, 1.3, 0.4], color: '#80c8ff', i: 0.6, r: 3, flicker: 0.3 });
    },
    idle(k) {
      GHOST.idle(k, { elbow: 0.4 });
      // begging: hands drift out, then fall
      const beg = 0.5 + 0.5 * sin(k.t * 0.6);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -0.6 - 0.3 * beg, 0, s * 0.05); k.r('fore' + L, -0.5 * beg); k.r('hand' + L, 0.4); }
      k.r('neck', 0.25 + 0.05 * sin(k.t * 0.8)); k.r('head', 0.1, sin(k.t * 0.4) * 0.3, 0.2 * sin(k.t * 0.3));
    },
    move: (k) => GHOST.move(k),
    clips: humClips({
      attack(k) {
        // lunging grab: neck stretches out, hands clutch
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.34, 0.44, 0.6, 0.95);
        k.p('body', 0, 0.1 * back, 0.5 * hit); k.r('body', -0.2 * back + 0.4 * hit);
        k.p('head', 0, 0, 0.25 * hit); k.p('neck', 0, 0, 0.1 * hit); k.r('neck', 0.5 * hit);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -0.4 * back - 1.4 * hit, 0, s * 0.3 * back); k.r('fore' + L, -0.2 * hit); }
      },
    }),
  });

  // ============================================================================ 瘟鬼 plague_ghost
  // Plague spirit: ragged grave-robe papered with talismans that failed, hair over its face, a gourd of pestilence, green miasma.
  defB('plague_ghost', {
    h: 2.5, outline: 0.003, rim: 0.4, rimColor: 0xc8f080,
    build(R) {
      biped(R, { hip: 1.08, chest: 1.45, neck: 1.72, head: 1.9, sw: 0.22, sy: 1.62, arm: 0.68, hw: 0.11, armOut: 0.07, legs: false, cz: 0.08, nz: 0.12, hz: 0.18 });
      R.bone('gourd', 'body', [0.25, 0.95, 0.12]);
      const ROBE = 0x8a9278, ROBE2 = 0x5a6248, SKIN = 0xb8c4a0;
      torso(R, { y0: 1.02, y1: 1.7, r: (t) => 0.22 + 0.03 * sin(t * PI) - 0.08 * sm(0.8, 1, t), depth: 0.8, c: ROBE, cell: 'robe', rep: [3, 2], z: 0.04 });
      skirt(R, { y0: 1.08, y1: 0.32, r0: 0.24, r1: 0.34, n: 7, c: [ROBE2, ROBE], cell: 'robe', rep: [3, 2], k: 0.12, wave: 7 });
      skirt(R, { name: 'rag', y0: 0.38, y1: 0.08, r0: 0.34, r1: 0.36, n: 7, c: ROBE2, cell: 'fringe', m: 'cut', rep: [6, 1], k: 0.1 });
      for (const s of [-1, 1]) sleeve(R, s, { r0: 0.07, r1: 0.13, c: ROBE, ext: 0.06 });
      for (const s of [-1, 1]) { const L = sideL(s); R.add(GEO.lumpy(GEO.sph(0.045, 0.07, 0.035, 8, 6), 0.1, 5), { b: 'hand' + L, c: SKIN, cell: 'skin', at: [s * 0.3, 0.9, 0.16] }); }
      // talismans stuck all over (each a little card that flutters with its bone)
      const tal = [[0.1, 1.45, 0.24, 'chest', 0.2], [-0.12, 1.2, 0.25, 'body', -0.25], [0.18, 0.75, 0.3, 'sk1a', 0.1], [-0.2, 0.62, 0.28, 'sk6a', -0.15], [0.0, 1.62, -0.2, 'chest', 3.1], [0.26, 1.3, -0.1, 'chest', 2.0]];
      for (const [x, y, z, b, a] of tal) R.add(GEO.card(0.11, 0.28, 1, 2), { m: 'cut', b, c: 0xffffff, cell: 'talisman', decal: true, at: [x, y - 0.14, z], rot: [0.1, a, a * 0.3] });
      // head hunched forward, hair curtain over the face
      R.add(GEO.sph(0.15, 0.18, 0.15, 14, 12), { b: 'head', c: SKIN, cell: 'skin', at: [0, 1.9, 0.18] });
      faceShell(R, 'plagueface', [0, 1.89, 0.185], 0.155, 0.185, 0.155, { b: 'head', wide: 0.9, t0: 0.6, tl: 1.75 });
      R.add(GEO.sph(0.165, 0.13, 0.17, 16, 8, { tl: PI / 2 }), { b: 'head', c: 0x101210, cell: 'hair', at: [0, 1.95, 0.16] });
      for (let i = 0; i < 7; i++) {
        const a = (i / 6 - 0.5) * 2.6, x = sin(a) * 0.15, z = 0.16 + cos(a) * 0.15;
        strand(R, 'h' + i, 'head', [[x, 2.0, z], [x * 1.15, 1.8, z + (abs(a) < 0.6 ? 0.05 : 0)], [x * 1.2, 1.55, z], [x * 1.2, 1.3, z - 0.04]], { r: (u) => 0.05 * (1 - u * 0.5), c: 0x101210, k: 0.12, g: 0.6 });
      }
      // gourd of pestilence
      R.add(GEO.lathe([[0.001, 0], [0.09, 0.03], [0.1, 0.1], [0.05, 0.17], [0.065, 0.23], [0.04, 0.29], [0.02, 0.33], [0.001, 0.34]], 12), { b: 'gourd', c: 0xb08a40, cell: 'lacquer', at: [0.25, 0.75, 0.12] });
      R.add(GEO.cyl(0.012, 0.012, 0.08, 5), { b: 'gourd', c: 0xb02020, cell: 'plain', at: [0.25, 1.1, 0.12] });
      R.fx({ mode: 'rise', n: 26, at: [0, 0.6, 0.05], box: [1.0, 0.6, 0.8], col: [0x8ab040, 0x6a9030, 0xa0c050], size: 0.35, speed: 0.35, p: [1.4, 0.3, 1], blend: 'normal' });
      R.fx({ mode: 'wander', n: 18, at: [0, 1.2, 0.1], box: [1.2, 1.4, 1.0], col: [0xd0ff60], size: 0.04, speed: 0.6, p: [0.3, 1, 1] });
    },
    idle(k) { GHOST.idle(k, { elbow: 0.5 }); k.r('chest', 0.25); k.r('head', 0.2, sin(k.t * 0.4) * 0.2, 0); k.r('armR', -0.2); k.r('foreR', -0.8); k.p('body', 0, -0.06, 0); },
    move: (k) => GHOST.move(k),
    clips: humClips({
      cast(k) { HUM.cast(k); k.r('gourd', -1.2 * pulse(k.u, 0.1, 0.35, 0.7, 1)); },
    }),
  });

  // ============================================================================ 無面鬼 faceless
  // A soul washed of every memory: tall, black-robed, its face a smooth blank egg. It wants a face — yours will do.
  defB('faceless', {
    h: 2.9, outline: 0.003, rim: 0.5, rimColor: 0xd8d0ff, psy: [3, 5, 0.1, 0.6],
    build(R) {
      biped(R, { hip: 1.35, chest: 1.85, neck: 2.2, head: 2.42, sw: 0.2, sy: 2.05, arm: 0.95, hw: 0.1, armOut: 0.04, legs: false });
      const ROBE = 0x14121c, PALE = 0xece8f0;
      torso(R, { y0: 1.3, y1: 2.14, r: (t) => 0.18 + 0.02 * sin(t * PI) - 0.06 * sm(0.8, 1, t), depth: 0.8, c: ROBE, cell: 'robe', rep: [3, 2] });
      skirt(R, { y0: 1.35, y1: 0.08, r0: 0.19, r1: 0.38, n: 8, c: [0x0a0a10, ROBE], cell: 'robe', rep: [4, 3], k: 0.1, g: 0.15, wave: 8, flare: (t) => t * t });
      skirt(R, { name: 'hem', y0: 0.16, y1: 0.0, r0: 0.37, r1: 0.42, n: 8, c: 0x1a1824, cell: 'fringe', m: 'cut', rep: [8, 1], k: 0.08 });
      for (const s of [-1, 1]) sleeve(R, s, { r0: 0.06, r1: 0.1, c: ROBE, ext: 0.02 });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        // long pale fingers
        for (let i = 0; i < 4; i++) R.add(GEO.cyl(0.008, 0.012, 0.22, 5), { b: 'hand' + L, c: PALE, cell: 'skin', at: [s * (0.26 + (i - 1.5) * 0.02), 1.06, 0.1 + (i - 1.5) * 0.01], rot: [0.2, 0, s * 0.1] });
        R.add(GEO.sph(0.035, 0.05, 0.025, 8, 6), { b: 'hand' + L, c: PALE, cell: 'skin', at: [s * 0.26, 1.15, 0.1] });
      }
      R.tube(['chest', 'neck', 'head'], { r: 0.045, sides: 8, c: PALE, cell: 'skin' });
      // the blank egg face
      R.add(GEO.sph(0.14, 0.19, 0.15, 20, 16), { b: 'head', c: PALE, cell: 'skin', at: [0, 2.45, 0.04] });
      faceShell(R, 'blank', [0, 2.44, 0.045], 0.146, 0.196, 0.156, { b: 'head', m: 'ghost', c: 0xb0a8e0, wide: 0.8, t0: 0.7, tl: 1.5 });
      R.add(GEO.sph(0.152, 0.16, 0.16, 16, 10, { tl: PI * 0.55 }), { b: 'head', c: 0x08080c, cell: 'hair', at: [0, 2.5, 0.0] });
      for (let i = 0; i < 6; i++) {
        const a = PI + (i / 5 - 0.5) * 2.2, x = sin(a) * 0.14, z = cos(a) * 0.14;
        strand(R, 'h' + i, 'head', [[x, 2.52, z], [x * 1.3, 2.3, z * 1.2], [x * 1.4, 1.95, z * 1.3], [x * 1.3, 1.6, z * 1.3]], { r: (u) => 0.055 * (1 - u * 0.5), c: 0x08080c, k: 0.1, g: 0.5 });
      }
      R.fx({ mode: 'wander', n: 14, at: [0, 0.1, 0], box: [1, 0.2, 1], col: [0x2a2838], size: 0.6, speed: 0.3, p: [0.3, 0.2, 1], blend: 'normal' });
      R.fx({ mode: 'rise', n: 14, at: [0, 2.3, 0.1], box: [0.3, 0.3, 0.3], col: [0xc0b0ff], size: 0.04, speed: 0.7, p: [0.6, 0.1, 1] });
    },
    idle(k) {
      GHOST.idle(k, { elbow: 0.15, armOut: 0.04 });
      // the head tilts too far, slowly, like it is studying you
      k.r('head', 0.1, 0, 0.45 * sin(k.t * 0.35)); k.r('neck', 0.1, 0, 0.15 * sin(k.t * 0.35));
      k.p('body', 0, -0.06, 0);
    },
    move: (k) => GHOST.move(k),
    clips: humClips({
      attack(k) {
        const u = k.u, hit = pulse(u, 0.3, 0.42, 0.6, 0.95);
        HUM.thrust(k); k.fx.psy += 3 * hit; k.r('head', 0, 0, 0.6 * hit);
      },
      special(k) { // face-steal: the blank face swirls with stolen faces
        const u = k.u, up = pulse(u, 0.05, 0.3, 0.75, 1);
        k.p('body', 0, 0.4 * up, 0); k.r('head', -0.3 * up); for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -1.8 * up, 0, s * 0.9 * up); }
        k.fx.psy += 5 * up;
      },
    }),
  });

  // ============================================================================ 山鬼 mountain_ghost
  // Hunched mountain ghoul: moss-hump back sprouting branches, long clawed arms, a walking stick of driftwood.
  defB('mountain_ghost', {
    h: 2.6, outline: 0.003, rim: 0.35, rimColor: 0xe0ffa0,
    build(R) {
      biped(R, { hip: 1.0, chest: 1.42, neck: 1.62, head: 1.68, sw: 0.26, sy: 1.5, arm: 0.95, hw: 0.14, armOut: 0.1, cz: 0.18, nz: 0.2, hz: 0.38 });
      R.bone('stick', 'handL', [-0.36, 0.6, 0.35]);
      const SKIN = 0x8a9878, MOSS = 0x4a7a2a;
      // hunched back: torso + big mossy hump
      torso(R, { y0: 0.95, y1: 1.6, r: (t) => 0.22 + 0.05 * sin(t * PI) - 0.06 * sm(0.8, 1, t), depth: 0.85, c: SKIN, cell: 'skin', rep: [3, 2], z: 0.1 });
      R.add(GEO.lumpy(GEO.sph(0.42, 0.45, 0.38, 18, 14), 0.12, 2.5, 4), { b: 'chest', c: (v) => Rig.mix(0x2e5a1e, 0x6a9a3a, fbm(v.x * 4, v.y * 4, v.z * 4)), cell: 'moss', rep: [3, 3], at: [0, 1.45, -0.12] });
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.18;
        R.add(GEO.sweep([[x, 1.75, -0.15], [x * 1.4, 2.0, -0.2], [x * 2.0 + 0.05, 2.2, -0.15], [x * 2.6, 2.38, -0.22]], (u) => 0.03 * (1 - u * 0.8), { sides: 5 }), { b: 'chest', c: 0x5a4a32, cell: 'bark' });
        R.add(GEO.sweep([[x * 1.4, 2.0, -0.2], [x * 1.4 + 0.12, 2.15, -0.1]], 0.015, { sides: 4 }), { b: 'chest', c: 0x5a4a32, cell: 'bark' });
        for (let j = 0; j < 3; j++) R.add(GEO.card(0.1, 0.12, 1, 1), { m: 'cut', b: 'chest', c: 0x6aa040, cell: 'leaf', decal: true, at: [x * 2.6 + (j - 1) * 0.05, 2.33, -0.22], rot: [0, j * 2, 0.3] });
      }
      R.add(GEO.cyl(0.24, 0.26, 0.2, 12), { b: 'body', c: 0x3a3a28, cell: 'cloth', at: [0, 0.92, 0.05] });
      limbs(R, { arm: { r: (u) => 0.07 - u * 0.02, c: SKIN, cell: 'skin', rep: [2, 3] }, leg: { r: (u) => 0.08 - u * 0.025, c: SKIN, cell: 'skin', rep: [2, 3] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.sph(0.07, 0.08, 0.07, 10, 8), { b: 'hand' + L, c: SKIN, cell: 'skin', at: [s * 0.4, 0.58, 0.28] });
        for (let i = 0; i < 4; i++) R.add(GEO.cone(0.012, 0.13, 5), { b: 'hand' + L, c: 0xe8e4c8, at: [s * (0.37 + i * 0.022), 0.5, 0.33], rot: [2.6, 0, 0] });
        R.add(GEO.box(0.13, 0.06, 0.26, 0.03), { b: 'foot' + L, c: SKIN, cell: 'skin', at: [s * 0.14, 0.04, 0.06] });
        R.add(GEO.lumpy(GEO.sph(0.1, 0.06, 0.08, 8, 6), 0.2, 6), { b: 'arm' + L, c: MOSS, cell: 'moss', at: [s * 0.28, 1.52, 0.1] });
      }
      R.add(GEO.sph(0.15, 0.16, 0.16, 14, 12), { b: 'head', c: SKIN, cell: 'skin', at: [0, 1.7, 0.42] });
      faceShell(R, 'ghoulface', [0, 1.69, 0.425], 0.155, 0.165, 0.165, { b: 'head', wide: 0.95, t0: 0.6, tl: 1.75 });
      for (const s of [-1, 1]) R.add(GEO.cone(0.04, 0.12, 6), { b: 'head', c: SKIN, cell: 'skin', at: [s * 0.15, 1.75, 0.38], rot: [0, 0, s * -1.3] });
      R.add(GEO.sweep([[-0.36, 0.0, 0.42], [-0.37, 0.5, 0.36], [-0.38, 1.0, 0.33], [-0.34, 1.15, 0.36]], 0.03, { sides: 6 }), { b: 'stick', c: 0x6a5a40, cell: 'bark' });
      R.fx({ mode: 'wander', n: 12, at: [0, 1.4, -0.1], box: [1, 1, 1], col: [0xc8ff70], size: 0.04, speed: 0.5, p: [0.3, 1, 1] });
    },
    idle(k) { HUM.idle(k, { elbow: 0.3 }); k.r('body', 0.15); k.r('head', -0.2 + sin(k.t * 0.5) * 0.08, sin(k.t * 0.3) * 0.3, 0); k.r('armL', -0.45); k.r('foreL', -0.3); k.r('legL', -0.2); k.r('legR', -0.2); k.r('shinL', 0.4); k.r('shinR', 0.4); k.p('body', 0, -0.06, 0); },
    move(k) { HUM.walk(k, { rate: 5, stride: 0.4, bob: 0.8 }); k.r('body', 0.2); k.r('armL', -0.5); },
    clips: humClips({ attack: (k) => { HUM.thrust(k); k.r('head', 0.3 * pulse(k.u, 0.3, 0.45, 0.6, 0.9)); } }),
  });

  // ============================================================================ 林投姐 linto_jie (boss)
  // Tainan legend: swindled of everything by a faithless lover, she hanged herself under a pandanus (林投) tree.
  // She doesn't want revenge — she wants someone to hear her out. A woman in white, hair to her knees, fog at her feet,
  // the pandanus behind her. Phase 2: grief breaks — her hair rises and spreads like a dark halo, the fronds thrash.
  defB('linto_jie', {
    h: 4.3, boss: true, outline: 0.003, rim: 0.55, rimColor: 0xc8e8ff, wide: 1.3, phaseGlow: 1.4,
    build(R) {
      biped(R, { hip: 1.2, chest: 1.62, neck: 1.9, head: 2.06, sw: 0.2, sy: 1.8, arm: 0.66, hw: 0.11, armOut: 0.05, legs: false, hz: 0.03 });
      const WHITE = 0xf2f2ee, BLUE = 0xc8d4e4, SKIN = 0xe8e6e2, HAIR = 0x0c0c12;
      // white Qing-era robe (大襟衫) with a pleated skirt (馬面裙) that dissolves into fog
      torso(R, { y0: 1.15, y1: 1.86, r: (t) => 0.18 + 0.03 * sin(t * PI) - 0.07 * sm(0.8, 1, t), depth: 0.78, c: WHITE, cell: 'robe', rep: [3, 2] });
      R.add(GEO.sweep([[0.0, 1.85, 0.15], [0.08, 1.7, 0.17], [0.14, 1.55, 0.16], [0.15, 1.4, 0.15]], 0.012, { sides: 4 }), { b: 'chest', c: 0x8a9ab0, cell: 'blank' });
      R.add(GEO.tor(0.19, 0.02, 6, 20), { b: 'body', c: BLUE, cell: 'cloth', at: [0, 1.2, 0], rot: [PI / 2, 0, 0], s: [1, 0.8, 1] });
      skirt(R, { y0: 1.22, y1: 0.18, r0: 0.2, r1: 0.42, n: 10, c: [BLUE, WHITE], cell: 'robe', rep: [10, 2], k: 0.1, g: 0.2, wave: 12, flare: (t) => t * (0.6 + 0.4 * t) });
      skirt(R, { name: 'hem', y0: 0.25, y1: 0.0, r0: 0.41, r1: 0.48, n: 10, c: 0xe0e8f0, cell: 'fringe', m: 'ghost', rep: [8, 1], k: 0.08, g: -0.05 });
      for (const s of [-1, 1]) sleeve(R, s, { r0: 0.06, r1: 0.14, c: WHITE, ext: 0.08 });
      for (const s of [-1, 1]) { const L = sideL(s); R.add(GEO.sph(0.035, 0.05, 0.025, 8, 6), { b: 'hand' + L, c: SKIN, cell: 'skin', at: [s * 0.26, 1.15, 0.12] }); }
      R.tube(['chest', 'neck', 'head'], { r: 0.04, sides: 8, c: SKIN, cell: 'skin' });
      R.add(GEO.sph(0.12, 0.15, 0.125, 18, 14), { b: 'head', c: SKIN, cell: 'skin', at: [0, 2.08, 0.04] });
      faceShell(R, 'lintoface', [0, 2.07, 0.045], 0.123, 0.153, 0.128, { b: 'head', wide: 0.95, t0: 0.6, tl: 1.75 });
      R.add(GEO.sph(0.13, 0.12, 0.135, 16, 8, { tl: PI * 0.5 }), { b: 'head', c: HAIR, cell: 'hair', at: [0, 2.12, 0.03] });
      for (let i = 0; i < 5; i++) R.add(GEO.sph(0.014, 0.01, 0.014, 6, 4), { b: 'head', c: 0xf8f8f0, cell: 'plain', at: [0.1 + cos(i * 1.26) * 0.02, 2.2 + sin(i * 1.26) * 0.02, 0.07] });
      // knee-length hair: a curtain of spring strands
      for (let i = 0; i < 9; i++) {
        const a = PI + (i / 8 - 0.5) * 2.8, x = sin(a) * 0.12, z = cos(a) * 0.12 + 0.02;
        strand(R, 'h' + i, 'head', [[x, 2.14, z], [x * 1.25, 1.9, z * 1.2 - 0.02], [x * 1.3, 1.5, z * 1.25 - 0.04], [x * 1.3, 1.1, z * 1.25 - 0.04], [x * 1.3, 0.75, z * 1.2 - 0.02]], { r: (u) => 0.06 * (1 - u * 0.4), c: HAIR, k: 0.1, g: 0.6 });
      }
      for (const s of [-1, 1]) strand(R, 'f' + sideL(s), 'head', [[s * 0.1, 2.1, 0.08], [s * 0.12, 1.85, 0.1], [s * 0.12, 1.55, 0.1]], { r: 0.035, c: HAIR, k: 0.15 });
      // phase 2: hair rises into a spreading dark halo
      const hp = R.phaseBone('hairhalo', 'head', [0, 2.12, -0.05], 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU, d = [cos(a), sin(a) * 0.8 + 0.3, -0.3];
        R.add(GEO.sweep([[0, 2.12, -0.05], [d[0] * 0.4, 2.12 + d[1] * 0.4, -0.15], [d[0] * 0.8 + sin(i) * 0.1, 2.12 + d[1] * 0.85, -0.3], [d[0] * 1.15, 2.12 + d[1] * 1.15 + 0.1, -0.35]], (u) => 0.05 * (1 - u * 0.8), { sides: 5, ell: [1, 0.4] }), { b: hp, c: HAIR, cell: 'hair' });
      }
      // the pandanus (林投): leaning trunk on prop roots, two crowns of serrated strap leaves, a pineapple-like fruit
      R.bone('tree', 'root', [0.55, 0.0, -0.75]);
      R.bone('crownA', 'tree', [0.15, 3.2, -0.95]);
      R.bone('crownB', 'tree', [1.25, 2.75, -0.7]);
      const BARK = 0x6a5a48;
      R.add(GEO.sweep([[0.55, 0.6, -0.75], [0.45, 1.6, -0.82], [0.25, 2.5, -0.9], [0.15, 3.2, -0.95]], (u) => 0.13 - u * 0.04, { sides: 9 }), { b: 'tree', c: BARK, cell: 'bark', rep: [2, 4] });
      R.add(GEO.sweep([[0.45, 1.8, -0.82], [0.8, 2.3, -0.78], [1.1, 2.6, -0.72], [1.25, 2.75, -0.7]], (u) => 0.08 - u * 0.03, { sides: 7 }), { b: 'tree', c: BARK, cell: 'bark', rep: [2, 3] });
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; R.add(GEO.sweep([[0.55 + cos(a) * 0.05, 0.7, -0.75 + sin(a) * 0.05], [0.55 + cos(a) * 0.25, 0.35, -0.75 + sin(a) * 0.25], [0.55 + cos(a) * 0.38, 0.0, -0.75 + sin(a) * 0.38]], 0.03, { sides: 5 }), { b: 'tree', c: BARK, cell: 'bark' }); }
      for (const [cb, cx, cy, cz, n] of [['crownA', 0.15, 3.2, -0.95, 14], ['crownB', 1.25, 2.75, -0.7, 11]]) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU * 1.618 * 3, el = -0.3 + (i % 3) * 0.35;
          R.add(GEO.card(0.3, 1.25 + (i % 4) * 0.12, 1, 6), { m: 'cut', b: cb, c: Rig.mix(0x2a5a2a, 0x6a9a48, (i % 5) / 4), cell: 'frond', decal: true, at: [cx, cy, cz], rot: [PI / 2 - 0.9 - el * 0.6, a, 0] });
        }
        R.add(GEO.lumpy(GEO.sph(0.13, 0.17, 0.13, 10, 8), 0.1, 8), { b: cb, c: 0xd8902a, cell: 'diamond', at: [cx + 0.08, cy - 0.2, cz + 0.1] });
      }
      // fog and falling tears
      R.fx({ mode: 'wander', n: 26, at: [0, 0.15, 0], box: [2.4, 0.3, 2.0], col: [0xe8eef4, 0xd8e2ee], size: 0.9, speed: 0.25, p: [0.5, 0.2, 1], blend: 'normal' });
      R.fx({ mode: 'fall', n: 12, at: [0.05, 2.0, 0.14], box: [0.15, 0.05, 0.05], col: [0x9ae0ff], size: 0.035, speed: 0.6, p: [1.7, 0.02, 1] });
      R.fx({ mode: 'orbit', n: 14, at: [0, 1.2, 0], box: [0.2, 1.4, 0.2], col: [0x80c0ff, 0xb0e0ff], size: 0.1, speed: 0.5, p: [1.0, 0.4, 1] });
      R.light({ b: 'chest', at: [0, 1.5, 0.6], color: '#a0d0ff', i: 0.6, r: 4, flicker: 0.2 });
    },
    idle(k) {
      GHOST.idle(k, { elbow: 0.3 });
      // grief: one hand at her chin, the other limp; head bowed, swaying
      k.r('armR', -1.1, 0, -0.35); k.r('foreR', -1.6); k.r('handR', 0.3);
      k.r('armL', 0.1, 0, -0.08); k.r('foreL', -0.2);
      k.r('head', 0.3 + 0.06 * sin(k.t * 0.5), 0.25, 0.15); k.r('neck', 0.1);
      k.p('body', 0, -0.06, 0);
      // the tree breathes in the wind
      k.r('crownA', sin(k.t * 0.8) * 0.06, 0, sin(k.t * 0.6) * 0.08); k.r('crownB', sin(k.t * 0.9 + 1) * 0.07, 0, sin(k.t * 0.7) * 0.09);
      if (k.ph > 1) { k.r('crownA', sin(k.t * 4) * 0.15, 0, sin(k.t * 3) * 0.2); k.r('crownB', sin(k.t * 4.5) * 0.15, 0, sin(k.t * 3.3) * 0.2); k.r('hairhalo', 0, 0, sin(k.t * 0.8) * 0.15); k.r('head', -0.3); }
    },
    move: (k) => GHOST.move(k),
    clips: humClips({
      attack(k) {
        // a lunge of sorrow: she rushes forward, hair whipping, sleeves lashing
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.34, 0.44, 0.6, 0.95);
        k.p('body', 0, 0.15 * back, 0.6 * hit - 0.15 * back); k.r('body', -0.25 * back + 0.35 * hit, 0.3 * hit, 0);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -0.6 * back - 1.6 * hit, 0, s * (0.8 * back - 0.2 * hit)); k.r('fore' + L, -0.3 * hit); }
        k.r('head', -0.4 * hit);
      },
      cast(k) { HUM.cast(k, { float: 0.3 }); k.r('head', -0.3 * pulse(k.u, 0.05, 0.35, 0.75, 1)); },
    }),
  });

  // marble/stone block: rounded box, chipped (faceted lumpy)
  const block = (w, h, d, r = 0.06, amp = 0.03, seed = 1) => GEO.faceted(GEO.lumpy(GEO.box(w, h, d, r), amp, 3, seed));
  const CONSTRUCT = {
    idle(k, o = {}) {
      const b = sin(k.t * 1.4);
      k.p('body', 0, b * 0.01, 0); k.r('body', 0, sin(k.t * 0.5) * 0.04, 0); k.r('chest', 0.02 * b, sin(k.t * 0.4) * 0.05, 0);
      k.r('head', 0, sin(k.t * 0.3) * 0.2, 0);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, 0.05 + b * 0.02, 0, s * (o.out || 0.1)); k.r('fore' + L, -(o.elbow || 0.25)); }
    },
  };

  // ============================================================================ 長明燈傀 lantern_golem
  // An ever-burning temple lantern (長明燈) that walked off its altar: bronze censer body, pagoda-roof head, chain arms.
  defB('lantern_golem', {
    h: 2.8, outline: 0.003, rim: 0.35, rimColor: 0xffe0a0,
    build(R) {
      biped(R, { hip: 0.7, chest: 1.25, neck: 1.75, head: 1.95, sw: 0.45, sy: 1.5, arm: 0.75, hw: 0.2, armOut: 0.08 });
      const BR = 0xb07a3a, BR2 = 0x8a5a2a, PAT = 0x5a9a80, FLAME = 0x60c8ff;
      const bronze = (v) => Rig.mix(BR, PAT, sm(0.55, 0.75, fbm(v.x * 3 + 7, v.y * 3, v.z * 3)) * 0.7);
      // censer body: lathe urn with relief bands, glass window ring with the flame inside
      R.add(GEO.lathe([[0.001, 0.62], [0.32, 0.64], [0.42, 0.75], [0.46, 0.95], [0.44, 1.15], [0.48, 1.25], [0.5, 1.3], [0.44, 1.38], [0.36, 1.6], [0.3, 1.66], [0.001, 1.68]], 20), { skin: byY('body', 'chest', 0.9, 1.3), c: bronze, cell: 'metal', rep: [4, 2] });
      R.add(GEO.cyl(0.47, 0.47, 0.08, 20, 1, true), { b: 'body', c: BR2, cell: 'qilin', rep: [8, 1], at: [0, 0.82, 0] });
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; R.add(GEO.box(0.16, 0.24, 0.02, 0.01), { b: 'chest', m: 'glow', c: FLAME, cell: 'glass', at: [sin(a) * 0.47, 1.08, cos(a) * 0.47], rot: [0, a, 0] }); }
      // legs: stubby bronze tripod feet (鼎-style)
      limbs(R, { leg: { r: (u) => 0.11 - u * 0.02, c: bronze, cell: 'metal', rep: [2, 2] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.lathe([[0.001, 0], [0.16, 0.0], [0.17, 0.06], [0.1, 0.16], [0.001, 0.18]], 10), { b: 'foot' + L, c: bronze, cell: 'metal', at: [s * 0.2, 0.0, 0.03] });
        // chain arms: links along the arm chain, with a little hanging lantern for a hand
        const a0 = R.B['arm' + L].pos, a1 = R.B['fore' + L].pos, a2 = R.B['hand' + L].pos;
        for (let i = 0; i < 9; i++) {
          const t = i / 8, p = t < 0.5 ? a0.clone().lerp(a1, t * 2) : a1.clone().lerp(a2, (t - 0.5) * 2), b = t < 0.5 ? 'arm' + L : 'fore' + L;
          R.add(GEO.tor(0.055, 0.016, 5, 10), { b, c: BR2, cell: 'metal', at: p.toArray(), rot: [0, (i % 2) * PI / 2, 0] });
        }
        R.add(GEO.lumpy(GEO.sph(0.16, 0.12, 0.14, 12, 8), 0.02, 3), { b: 'arm' + L, c: bronze, cell: 'metal', at: [s * 0.47, 1.5, 0] });
        R.add(GEO.lathe([[0.001, 0], [0.09, 0.02], [0.11, 0.1], [0.11, 0.2], [0.07, 0.24], [0.001, 0.25]], 8), { b: 'hand' + L, m: 'glow', c: FLAME, cell: 'lattice', rep: [3, 1], at: [s * 0.55, 0.58, 0.07] });
        R.add(GEO.cone(0.13, 0.08, 8), { b: 'hand' + L, c: BR2, cell: 'metal', at: [s * 0.55, 0.86, 0.07] });
      }
      // head: lantern chamber + two-tier pagoda roof with upturned eaves and finial
      R.add(GEO.cyl(0.08, 0.1, 0.12, 10), { b: 'neck', c: BR2, cell: 'metal', at: [0, 1.72, 0] });
      R.add(GEO.cyl(0.24, 0.26, 0.05, 8), { b: 'head', c: BR2, cell: 'metal', at: [0, 1.8, 0] });
      R.add(GEO.cyl(0.22, 0.22, 0.34, 8, 1, true), { b: 'head', m: 'glow', c: 0x8ad8ff, cell: 'glass', rep: [4, 1], at: [0, 2.0, 0] });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + PI / 8; R.add(GEO.box(0.03, 0.34, 0.03), { b: 'head', c: BR2, cell: 'metal', at: [sin(a) * 0.21, 1.83, cos(a) * 0.21] }); }
      for (let i = 0; i < 3; i++) R.add(GEO.card(0.16, 0.32, 1, 1), { m: 'add', b: 'head', c: FLAME, cell: 'flame', decal: true, at: [0, 1.86, 0], rot: [0, i * PI / 3, 0] });
      for (const s of [-1, 1]) R.add(GEO.sph(0.04, 0.03, 0.02, 8, 6), { b: 'head', m: 'glow', c: 0xe8ffff, cell: 'blank', at: [s * 0.08, 2.02, 0.2] });
      const roof = (y, r, h) => {
        const g = GEO.cone(r, h, 8);
        GEO.warp(g, (v) => { const rr = Math.hypot(v.x, v.z); v.y += sm(r * 0.6, r, rr) * 0.08; });
        R.add(g, { b: 'head', c: Rig.mix(BR2, PAT, 0.4), cell: 'tile', rep: [8, 1], at: [0, y, 0], rot: [0, PI / 8, 0] });
      };
      roof(2.3, 0.42, 0.22); roof(2.48, 0.28, 0.2);
      R.add(GEO.sph(0.05, 0.08, 0.05, 8, 6), { b: 'head', c: 0xd8a040, cell: 'gold', at: [0, 2.64, 0] });
      R.add(GEO.card(0.1, 0.18, 1, 1), { m: 'add', b: 'head', c: FLAME, cell: 'flame', decal: true, at: [0, 2.66, 0] });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + PI / 8; strand(R, 'bell' + i, 'head', [[sin(a) * 0.42, 2.36, cos(a) * 0.42], [sin(a) * 0.43, 2.26, cos(a) * 0.43]], { r: 0.008, ell: [1, 1], c: 0xc04020, cell: 'plain', k: 0.25, g: 0.6, tip: 0.04 }); }
      R.fx({ mode: 'rise', n: 22, at: [0, 2.0, 0], box: [0.3, 0.3, 0.3], col: [FLAME, 0xb0e8ff], size: 0.05, speed: 1.2, p: [0.8, 0.08, 1] });
      R.light({ b: 'chest', at: [0, 1.1, 0.5], color: '#60c8ff', i: 1.0, r: 4, flicker: 0.2 });
      R.light({ b: 'head', at: [0, 2.0, 0.2], color: '#8ad8ff', i: 0.8, r: 3, flicker: 0.25 });
    },
    idle(k) { CONSTRUCT.idle(k, { out: 0.18, elbow: 0.2 }); },
    move(k) { HUM.walk(k, { rate: 5, stride: 0.3, bob: 0.6 }); k.r('body', 0, 0, sin(k.t * 5) * 0.06); },
    clips: humClips({
      attack(k) {
        // swing a chain-lantern overhead like a flail
        const u = k.u, wind = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.36, 0.48, 0.6, 0.95);
        k.r('body', 0, 0.5 * wind - 0.6 * hit, 0); k.r('armR', -2.4 * wind - 0.8 * hit, 0, 1.2 * wind - 0.4 * hit); k.r('foreR', -0.4 * wind);
        k.p('body', 0, 0, 0.3 * hit); k.fx.glow += 1.5 * hit;
      },
      cast(k) { HUM.cast(k); k.r('head', -0.3 * pulse(k.u, 0.05, 0.35, 0.75, 1)); },
    }),
  });

  // ============================================================================ 燈塔守 tower_warden
  // Gatekeeper of each floor of the 彼岸燈塔: a walking lighthouse — lamp-room head with a sweeping beam, brick tower body,
  // brass limbs, one hand a boat-hook, the other a hand-lantern. It asks every climber why they came.
  defB('tower_warden', {
    h: 3.5, outline: 0.003, rim: 0.35,
    build(R) {
      biped(R, { hip: 1.15, chest: 1.9, neck: 2.5, head: 2.7, sw: 0.42, sy: 2.25, arm: 1.05, hw: 0.17, armOut: 0.1 });
      R.bone('beam', 'head', [0, 2.82, 0]);
      const WH = 0xf0ece0, RED = 0xb02a24, BRASS = 0xc89a40, DK = 0x2a2a30;
      // tower body: tapered cylinder with red band, door and a tiny window
      R.add(GEO.lathe([[0.001, 1.05], [0.36, 1.05], [0.34, 1.6], [0.31, 2.2], [0.3, 2.42], [0.001, 2.44]], 20), { skin: byY('body', 'chest', 1.4, 2.0), c: (v) => (v.y > 1.6 && v.y < 1.85 ? RED : WH), cell: 'brick', rep: [4, 3] });
      R.add(GEO.box(0.2, 0.32, 0.06, 0.03), { b: 'body', c: 0x5a3a20, cell: 'wood', at: [0, 1.25, 0.34] });
      R.add(GEO.sph(0.03, 0.03, 0.02, 6, 4), { b: 'body', c: BRASS, cell: 'gold', at: [0.06, 1.25, 0.38] });
      R.add(GEO.box(0.1, 0.12, 0.04, 0.02), { b: 'chest', m: 'glow', c: 0xffd070, cell: 'glass', at: [0, 2.05, 0.31] });
      R.add(GEO.cyl(0.42, 0.42, 0.06, 20), { b: 'chest', c: DK, cell: 'metal', at: [0, 2.42, 0] });
      // gallery railing
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; R.add(GEO.cyl(0.01, 0.01, 0.16, 4), { b: 'chest', c: DK, cell: 'metal', at: [sin(a) * 0.4, 2.53, cos(a) * 0.4] }); }
      R.add(GEO.tor(0.4, 0.012, 4, 24), { b: 'chest', c: DK, cell: 'metal', at: [0, 2.61, 0], rot: [PI / 2, 0, 0] });
      // lamp room head: glass drum with the light, dome roof, vane
      R.add(GEO.cyl(0.24, 0.24, 0.36, 10, 1, true), { b: 'head', m: 'glow', c: 0xfff0b0, cell: 'glass', rep: [5, 1], at: [0, 2.68, 0] });
      R.add(GEO.sph(0.13, 0.13, 0.13, 12, 8), { b: 'head', m: 'glow', c: 0xffffff, cell: 'blank', at: [0, 2.68, 0] });
      R.add(GEO.sph(0.27, 0.2, 0.27, 14, 8, { tl: PI / 2 }), { b: 'head', c: RED, cell: 'metal', at: [0, 2.86, 0] });
      R.add(GEO.cyl(0.015, 0.015, 0.25, 4), { b: 'head', c: DK, cell: 'metal', at: [0, 3.1, 0] });
      R.add(GEO.sph(0.04, 0.04, 0.04, 6, 4), { b: 'head', c: BRASS, cell: 'gold', at: [0, 3.24, 0] });
      // the sweeping beam: a long additive cone from the lamp
      const bg = GEO.cyl(0.06, 0.55, 3.2, 12, 1, true); bg.rotateX(-PI / 2); bg.translate(0, 0, 1.7);
      R.add(bg, { b: 'beam', m: 'add', c: 0x6a5a30, cell: 'blankA', at: [0, 2.68, 0] });
      // brass mechanical limbs with piston legs
      limbs(R, { arm: { r: (u) => 0.07 - u * 0.015, c: BRASS, cell: 'metal', rep: [2, 3] }, leg: { r: (u) => 0.09 - u * 0.02, c: BRASS, cell: 'metal', rep: [2, 3] } });
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(GEO.sph(0.12, 0.12, 0.12, 12, 8), { b: 'arm' + L, c: DK, cell: 'metal', at: [s * 0.44, 2.25, 0] });
        R.add(GEO.sph(0.08, 0.08, 0.08, 10, 6), { b: 'fore' + L, c: BRASS, cell: 'gold', at: R.B['fore' + L].pos.toArray() });
        R.add(GEO.sph(0.09, 0.09, 0.09, 10, 6), { b: 'shin' + L, c: BRASS, cell: 'gold', at: R.B['shin' + L].pos.toArray() });
        R.add(GEO.box(0.22, 0.1, 0.36, 0.03), { b: 'foot' + L, c: DK, cell: 'metal', at: [s * 0.17, 0.05, 0.06] });
      }
      // boat-hook right hand, hand-lantern left
      const hR = R.B.handR.pos;
      R.add(GEO.cyl(0.02, 0.02, 0.5, 6), { b: 'handR', c: DK, cell: 'metal', at: [hR.x, hR.y - 0.2, hR.z] });
      R.add(GEO.tor(0.1, 0.02, 6, 12, PI * 1.3), { b: 'handR', c: BRASS, cell: 'metal', at: [hR.x + 0.08, hR.y - 0.45, hR.z], rot: [0, PI / 2, PI * 0.9] });
      const hL = R.B.handL.pos;
      R.add(GEO.lathe([[0.001, 0], [0.08, 0.01], [0.09, 0.08], [0.09, 0.2], [0.06, 0.23], [0.001, 0.24]], 8), { b: 'handL', m: 'glow', c: 0xffd070, cell: 'lattice', rep: [3, 1], at: [hL.x, hL.y - 0.32, hL.z] });
      R.add(GEO.tor(0.06, 0.008, 4, 10, PI), { b: 'handL', c: DK, cell: 'metal', at: [hL.x, hL.y - 0.06, hL.z] });
      R.fx({ mode: 'wander', n: 14, at: [0, 2.7, 0], box: [0.6, 0.4, 0.6], col: [0xfff0b0], size: 0.04, speed: 0.6, p: [0.3, 1, 1] });
      R.light({ b: 'head', at: [0, 2.68, 0.3], color: '#fff0b0', i: 1.6, r: 7, flicker: 0.05 });
      R.light({ b: 'handL', at: [hL.x, hL.y - 0.22, hL.z], color: '#ffd070', i: 0.6, r: 3, flicker: 0.2 });
    },
    always(k) { k.r('beam', 0, k.t * 0.9, 0); },
    idle(k) { CONSTRUCT.idle(k, { out: 0.12, elbow: 0.35 }); },
    move(k) { HUM.walk(k, { rate: 4.5, stride: 0.35, bob: 0.5 }); },
    clips: humClips({
      attack: (k) => { HUM.thrust(k); },
      cast(k) {
        // the lamp flares: a blinding pulse, beam locks forward
        const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1);
        k.r('beam', 0, -k.t * 0.9 * up, 0); k.r('armL', -1.6 * up); k.r('chest', -0.15 * up); k.fx.glow += 3 * up; k.fx.flash = max(k.fx.flash, 0.4 * pulse(u, 0.3, 0.38, 0.42, 0.6));
      },
    }),
  });

  // ============================================================================ 斷崖石靈 cliff_spirit
  // A marble spirit of the 清水 cliffs: a floating boulder with a carved face and two hovering stone fists. The surf changed
  // its voice lately and the stones are uneasy.
  defB('cliff_spirit', {
    h: 2.5, outline: 0.003, rim: 0.4, rimColor: 0xa0fff0, ao: 0.2,
    build(R) {
      R.bone('body', 'root', [0, 1.35, 0]);
      R.bone('head', 'body', [0, 1.5, 0.1]);
      R.bone('handL', 'root', [-0.85, 1.2, 0.25]);
      R.bone('handR', 'root', [0.85, 1.2, 0.25]);
      R.bone('debris', 'root', [0, 1.0, 0]);
      const MB = 0xe8ecec, VEIN = 0x6ae8d8;
      const marble = (v) => Rig.mix(MB, 0xb8c4c8, sm(0.4, 0.8, fbm(v.x * 2, v.y * 2, v.z * 2)));
      R.add(block(1.0, 1.05, 0.85, 0.22, 0.06, 2), { b: 'body', c: marble, cell: 'marble', rep: [2, 2], at: [0, 1.35, 0] });
      R.add(GEO.sph(0.36, 0.34, 0.06, 14, 10), { b: 'head', c: 0xffffff, cell: 'cliffface', uvp: 'z', at: [0, 1.4, 0.42] });
      for (const s of [-1, 1]) R.add(GEO.box(0.16, 0.035, 0.02), { b: 'head', m: 'glow', c: VEIN, cell: 'blank', at: [s * 0.13, 1.52, 0.47], rot: [0, 0, s * -0.1] });
      R.add(GEO.lumpy(GEO.sph(0.32, 0.12, 0.3, 12, 8), 0.2, 4), { b: 'body', c: (v) => Rig.mix(0x3a6a2a, 0x7aa848, fbm(v.x * 6, v.y * 6, v.z * 6)), cell: 'moss', at: [0.05, 1.86, 0.0] });
      R.add(GEO.card(0.08, 0.2, 1, 1), { m: 'cut', b: 'body', c: 0x5a9a3a, cell: 'leaf', decal: true, at: [0.05, 1.93, 0.0], rot: [0, 0.3, 0.2] });
      // glowing fissures across the boulder
      const r = R.r;
      for (let i = 0; i < 6; i++) {
        let a = r() * TAU, h = -0.7 + r() * 0.8; const pts = [];
        for (let j = 0; j < 5; j++) { pts.push(onEll([0, 1.35, 0], [0.56, 0.58, 0.5], a, clamp(h, -0.9, 0.9))); a += (r() - 0.5) * 0.6; h += 0.2 + r() * 0.1; }
        glowLine(R, pts, 0.012, VEIN, { b: 'body' });
      }
      // stone fists
      for (const s of [-1, 1]) {
        const L = sideL(s);
        R.add(block(0.36, 0.4, 0.36, 0.08, 0.04, s + 5), { b: 'hand' + L, c: marble, cell: 'marble', at: [s * 0.85, 1.2, 0.25], rot: [0, s * 0.3, 0] });
        R.add(GEO.box(0.04, 0.2, 0.02), { b: 'hand' + L, m: 'glow', c: VEIN, cell: 'blank', at: [s * 0.85 + s * 0.05, 1.22, 0.44], rot: [0, 0, 0.3] });
      }
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; R.add(block(0.1 + r() * 0.08, 0.1 + r() * 0.08, 0.1, 0.02, 0.02, i), { b: 'debris', c: marble, cell: 'marble', at: [cos(a) * 0.75, 0.35 + r() * 0.25, sin(a) * 0.6], rot: [r() * 3, r() * 3, r() * 3] }); }
      R.fx({ mode: 'fall', n: 18, at: [0, 0.75, 0], box: [0.8, 0.2, 0.7], col: [0xd8e0e0], size: 0.05, speed: 0.6, p: [0.7, 0.2, 1] });
      R.fx({ mode: 'wander', n: 12, at: [0, 1.4, 0], box: [1.4, 1.2, 1.2], col: [VEIN], size: 0.04, speed: 0.6, p: [0.3, 1, 1] });
      R.light({ b: 'head', at: [0, 1.5, 0.7], color: '#6ae8d8', i: 0.5, r: 3 });
    },
    always(k) { k.r('debris', 0, k.t * 0.4, 0); },
    idle(k) {
      const b = sin(k.t * 1.2);
      k.p('body', 0, b * 0.08, 0); k.r('body', sin(k.t * 0.7) * 0.05, sin(k.t * 0.4) * 0.15, 0);
      k.p('handL', 0, sin(k.t * 1.2 + 1) * 0.1, 0); k.p('handR', 0, sin(k.t * 1.2 + 2) * 0.1, 0);
      k.r('handL', 0, sin(k.t * 0.8) * 0.3, 0); k.r('handR', 0, -sin(k.t * 0.8) * 0.3, 0);
      k.p('debris', 0, b * 0.05, 0);
    },
    move(k) { k.p('body', 0, 0.1 + sin(k.t * 4) * 0.05, 0); k.r('body', 0.2, 0, 0); k.p('handL', 0, 0, -0.2); k.p('handR', 0, 0, -0.2); },
    clips: {
      attack(k) {
        // pull back the right fist, rocket punch
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.34, 0.42, 0.6, 0.95);
        k.p('handR', 0.1 * back - 0.6 * hit, 0.2 * back, -0.4 * back + 1.4 * hit); k.r('handR', 0, 0, -3 * hit);
        k.r('body', -0.15 * back + 0.25 * hit, 0.3 * back - 0.3 * hit, 0); k.p('body', 0, 0, 0.2 * hit);
        k.fx.glow += hit;
      },
      cast(k) {
        const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1);
        k.p('handL', -0.2 * up, 0.8 * up, 0); k.p('handR', 0.2 * up, 0.8 * up, 0); k.p('body', 0, 0.2 * up, 0); k.s('debris', 0.6 * up); k.fx.glow += 2 * up;
      },
      hurt(k) { GEN.hurt(k); k.p('handL', 0, 0, -0.2 * pulse(k.u, 0, 0.1, 0.2, 0.8)); k.p('handR', 0, 0, -0.2 * pulse(k.u, 0, 0.1, 0.2, 0.8)); },
      die(k) {
        const u = k.u, f = sm(0.1, 0.5, u);
        k.p('body', 0, -1.0 * f, 0); k.r('body', 0.4 * f, 0, 0.3 * f); k.p('handL', -0.3 * f, -1.0 * f, 0); k.p('handR', 0.3 * f, -1.0 * f, 0); k.p('debris', 0, -0.8 * f, 0);
        k.fx.flash = max(k.fx.flash, 1 - sm(0, 0.15, u)); k.fx.diss = max(k.fx.diss, sm(0.45, 1, u));
      },
      special(k) {
        // both fists slam the ground, debris erupts
        const u = k.u, up = pulse(u, 0.05, 0.4, 0.4, 0.52), down = pulse(u, 0.45, 0.55, 0.7, 1);
        k.p('handL', 0.2 * up + 0.3 * down, 1.0 * up - 1.0 * down, 0.4 * down); k.p('handR', -0.2 * up - 0.3 * down, 1.0 * up - 1.0 * down, 0.4 * down);
        k.p('body', 0, 0.3 * up - 0.2 * down, 0); k.s('debris', 1.2 * down); k.fx.glow += 2 * down;
      },
      enter: (k) => GEN.enter(k),
    },
  });

  // ============================================================================ 峽谷巨像 gorge_colossus (boss)
  // A marble colossus of 太魯閣 gorge, eaten by tide-sickness: white marble plates veined with cyan, a cyan heart-core,
  // black sickness weeping from its seams; a small tree grows on its head. It no longer remembers what it guards.
  // Phase 2: the core cracks open — plates lift off and orbit, the black weeping turns to a torrent.
  defB('gorge_colossus', {
    h: 5.4, boss: true, outline: 0.003, rim: 0.4, rimColor: 0xa0f8ff, ao: 0.3, phaseGlow: 1.6, edge: [0.4, 1.8, 2.0],
    build(R) {
      biped(R, { hip: 2.0, chest: 3.0, neck: 3.9, head: 4.25, sw: 1.0, sy: 3.75, arm: 1.9, hw: 0.45, armOut: 0.15, cz: 0 });
      const MB = 0xeef0f0, GREY = 0xc0c6cc, CY = 0x50f0ff, SICK = 0x0a0812;
      const marble = (v) => { const n = fbm(v.x * 1.4, v.y * 1.4, v.z * 1.4); const sick = sm(0.6, 0.72, fbm(v.x * 2 + 9, v.y * 0.8, v.z * 2)) * sm(3.6, 2.0, v.y); return Rig.mix(Rig.mix(MB, GREY, sm(0.4, 0.75, n)), SICK, sick * 0.85); };
      // torso: chest block, belly block, pelvis
      R.add(block(2.0, 1.25, 1.2, 0.2, 0.05, 1), { b: 'chest', c: marble, cell: 'marble', rep: [3, 2], at: [0, 3.3, 0] });
      R.add(block(1.35, 0.7, 0.95, 0.15, 0.05, 2), { skin: byY('body', 'chest', 2.4, 2.9), c: marble, cell: 'marble', rep: [2, 1], at: [0, 2.55, 0] });
      R.add(block(1.3, 0.55, 0.9, 0.15, 0.04, 3), { b: 'body', c: marble, cell: 'marble', rep: [2, 1], at: [0, 1.95, 0] });
      // heart-core
      R.add(GEO.ico(0.28, 1), { b: 'chest', m: 'glow', c: CY, cell: 'blank', at: [0, 3.35, 0.58] });
      R.add(GEO.tor(0.34, 0.05, 6, 16), { b: 'chest', c: GREY, cell: 'marble', at: [0, 3.35, 0.58] });
      const r = R.r;
      for (let i = 0; i < 10; i++) {
        let x = (r() - 0.5) * 0.3, y = 3.35 + (r() - 0.5) * 0.3; const pts = [];
        const a = r() * TAU;
        for (let j = 0; j < 5; j++) { pts.push([x, y, 0.62 - j * 0.02]); x += cos(a) * 0.18 + (r() - 0.5) * 0.1; y += sin(a) * 0.15 + (r() - 0.5) * 0.1; }
        glowLine(R, pts, 0.018, CY, { b: 'chest' });
      }
      // sickness weeping from seams (black drip cards) 
      for (let i = 0; i < 8; i++) R.add(GEO.card(0.22, 0.4, 1, 2), { m: 'cut', b: i < 5 ? 'chest' : 'body', c: SICK, cell: 'drip', decal: true, at: [(r() - 0.5) * 1.6, i < 5 ? 2.75 : 1.75, 0.62], rot: [PI, 0, 0] });
      // arms: boulder shoulders, block upper/fore arms, huge fists
      for (const s of [-1, 1]) {
        const L = sideL(s), A = R.B['arm' + L].pos, F = R.B['fore' + L].pos, H = R.B['hand' + L].pos;
        R.add(block(0.75, 0.65, 0.75, 0.15, 0.05, s + 10), { b: 'arm' + L, c: marble, cell: 'marble', at: [A.x + s * 0.12, A.y + 0.05, 0] });
        R.add(block(0.48, 0.85, 0.5, 0.1, 0.04, s + 11), { b: 'arm' + L, c: marble, cell: 'marble', at: [(A.x + F.x) / 2, (A.y + F.y) / 2, 0] });
        R.add(block(0.5, 0.8, 0.52, 0.1, 0.04, s + 12), { b: 'fore' + L, c: marble, cell: 'marble', at: [(F.x + H.x) / 2, (F.y + H.y) / 2 + 0.05, 0.03] });
        R.add(block(0.62, 0.62, 0.6, 0.12, 0.05, s + 13), { b: 'hand' + L, c: marble, cell: 'marble', at: [H.x, H.y - 0.15, H.z] });
        glowLine(R, [[A.x, A.y - 0.2, 0.26], [(A.x + F.x) / 2 + s * 0.05, (A.y + F.y) / 2, 0.26], [F.x, F.y + 0.1, 0.27]], 0.015, CY, { b: 'arm' + L });
        // legs: pillar blocks and feet
        const Lg = R.B['leg' + L].pos, S = R.B['shin' + L].pos;
        R.add(block(0.6, 0.95, 0.62, 0.1, 0.04, s + 20), { b: 'leg' + L, c: marble, cell: 'marble', at: [Lg.x, (Lg.y + S.y) / 2, 0] });
        R.add(block(0.56, 0.95, 0.6, 0.1, 0.04, s + 21), { b: 'shin' + L, c: marble, cell: 'marble', at: [S.x, S.y * 0.5 + 0.1, 0.04] });
        R.add(block(0.7, 0.28, 0.9, 0.08, 0.03, s + 22), { b: 'foot' + L, c: marble, cell: 'marble', at: [S.x, 0.14, 0.12] });
      }
      // head: smaller block with visor slit eyes; a little tree on top
      R.add(block(0.75, 0.62, 0.68, 0.12, 0.04, 30), { b: 'head', c: marble, cell: 'marble', at: [0, 4.25, 0.05] });
      for (const s of [-1, 1]) R.add(GEO.box(0.16, 0.06, 0.04), { b: 'head', m: 'glow', c: CY, cell: 'blank', at: [s * 0.15, 4.3, 0.39] });
      R.add(GEO.lumpy(GEO.sph(0.32, 0.1, 0.3, 10, 6), 0.2, 5), { b: 'head', c: 0x4a7a2a, cell: 'moss', at: [0, 4.58, 0] });
      R.add(GEO.sweep([[0.05, 4.6, 0], [0.08, 4.85, -0.02], [0.02, 5.05, 0.03]], 0.035, { sides: 5 }), { b: 'head', c: 0x5a4a32, cell: 'bark' });
      for (let i = 0; i < 6; i++) R.add(GEO.card(0.16, 0.2, 1, 1), { m: 'cut', b: 'head', c: Rig.mix(0x3a7a2a, 0x7ab040, r()), cell: 'leaf', decal: true, at: [0.02 + (r() - 0.5) * 0.12, 4.95, (r() - 0.5) * 0.12], rot: [0.8, i * 1.1, 0] });
      // phase 2: marble plates break loose and orbit
      const pb = R.phaseBone('plates', 'chest', [0, 3.2, 0], 2);
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; R.add(block(0.4 + r() * 0.2, 0.3 + r() * 0.2, 0.12, 0.04, 0.02, i + 40), { b: pb, c: marble, cell: 'marble', at: [cos(a) * 1.7, 3.2 + sin(i * 1.7) * 0.6, sin(a) * 1.3], rot: [r(), a, r()] }); }
      R.add(GEO.ico(0.5, 1), { b: pb, m: 'add', c: 0x2a8090, cell: 'blankA', at: [0, 3.35, 0.6] });
      R.fx({ mode: 'fall', n: 40, at: [0, 2.6, 0.5], box: [1.6, 1.4, 0.4], col: [0x0a0812, 0x1a1028], size: 0.1, speed: 0.6, p: [2.4, 0.1, 1], blend: 'normal' });
      R.fx({ mode: 'orbit', n: 30, at: [0, 3.35, 0.6], box: [0.05, 0.05, 0.05], col: [CY, 0xc0ffff], size: 0.08, speed: 1.4, p: [0.55, 0.3, 1] });
      R.fx({ mode: 'fall', n: 20, at: [0, 0.6, 0], box: [2.4, 0.3, 1.6], col: [0xe0e4e8], size: 0.08, speed: 0.4, p: [0.5, 0.3, 1] });
      R.light({ b: 'chest', at: [0, 3.35, 1.0], color: '#50f0ff', i: 1.6, r: 7, flicker: 0.1 });
    },
    idle(k) {
      CONSTRUCT.idle(k, { out: 0.15, elbow: 0.25 });
      k.s('chest', sin(k.t * 1.1) * 0.012); k.r('head', 0.08, sin(k.t * 0.25) * 0.3, 0);
      if (k.ph > 1) { k.r('plates', 0, k.t * 0.5, sin(k.t * 0.8) * 0.1); k.p('plates', 0, sin(k.t * 1.3) * 0.1, 0); }
    },
    move(k) { HUM.walk(k, { rate: 3, stride: 0.3, bob: 0.5 }); },
    clips: humClips({
      attack(k) {
        // haymaker: wind the shoulder far back, the fist crashes through
        const u = k.u, back = pulse(u, 0, 0.35, 0.35, 0.45), hit = pulse(u, 0.4, 0.5, 0.65, 0.95);
        k.r('body', 0, 0.5 * back - 0.6 * hit, 0); k.r('chest', -0.1 * back + 0.25 * hit, 0.3 * back - 0.4 * hit, 0);
        k.r('armR', -0.6 * back - 1.5 * hit, 0, 0.6 * back - 0.2 * hit); k.r('foreR', -1.2 * back + 0.2 * hit);
        k.p('body', 0, -0.1 * hit, 0.5 * hit); k.r('legL', -0.4 * hit); k.r('shinL', 0.4 * hit);
        k.fx.glow += hit; k.fx.flash = max(k.fx.flash, 0.3 * pulse(u, 0.48, 0.5, 0.54, 0.65));
      },
      special(k) {
        // gorge-quake: both fists overhead, slam, the core blazes
        const u = k.u, up = pulse(u, 0.05, 0.45, 0.45, 0.55), down = pulse(u, 0.5, 0.58, 0.72, 1);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -2.9 * up - 0.8 * down, 0, s * 0.2 * up); k.r('fore' + L, -0.3 * up); k.r('leg' + L, -0.5 * down); k.r('shin' + L, 0.7 * down); }
        k.r('chest', -0.3 * up + 0.5 * down); k.p('body', 0, 0.1 * up - 0.4 * down, 0.3 * down);
        k.fx.glow += 3 * down + up; k.fx.flash = max(k.fx.flash, 0.6 * pulse(u, 0.56, 0.58, 0.62, 0.75));
      },
    }),
  });

  // ============================================================================ wind helpers
  // tornado funnel: translucent lathe + spiral streak bands, all on a spinning bone
  function funnel(R, bone, o) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([o.r0 + (o.r1 - o.r0) * pow(t, o.pow || 1.6), lerp(o.y0, o.y1, t)]); }
    R.add(GEO.lathe(pts, 20), { b: bone, m: 'ghost', c: o.c, cell: 'wave', rep: [3, 2], at: [0, 0, 0] });
    const n = o.bands || 3;
    for (let k = 0; k < n; k++) {
      const P = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * TAU * (o.turns || 2.2) + k * TAU / n, r = (o.r0 + (o.r1 - o.r0) * pow(t, o.pow || 1.6)) * 1.08; P.push([cos(a) * r, lerp(o.y0, o.y1, t), sin(a) * r]); }
      R.add(GEO.sweep(P, (u) => (o.bw || 0.03) * (0.4 + u), { sides: 4, ell: [1, 0.3], n: 60 }), { b: bone, m: o.bandM || 'soft', c: o.bandC || 0xffffff, cell: 'blankA', rep: [1, 1] });
    }
  }
  const WIND = {
    idle(k, o = {}) {
      const b = sin(k.t * 1.5);
      k.p('body', sin(k.t * 0.9) * 0.05, 0.05 + b * 0.05, 0); k.r('body', 0.05, sin(k.t * 0.6) * 0.1, sin(k.t * 0.9) * 0.05);
      k.r('chest', b * 0.03); k.r('head', sin(k.t * 0.7) * 0.05, sin(k.t * 0.4) * 0.2, 0);
      for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -0.2 + sin(k.t * 1.3 + s) * 0.12, 0, s * (o.out || 0.35)); k.r('fore' + L, -0.5 + sin(k.t * 1.5 + s) * 0.1); }
    },
  };

  // ============================================================================ 九降風精 wind_sprite
  // A sprite of the 九降風 (Hsinchu's ninth-month wind): a puff of cloud with a cross little face over a whirl of air and leaves.
  defB('wind_sprite', {
    h: 2.0, outline: 0.003, rim: 0.5, rimColor: 0xd0f0ff, shadow: true,
    build(R) {
      R.bone('body', 'root', [0, 0.9, 0]);
      R.bone('head', 'body', [0, 1.45, 0]);
      R.bone('spin', 'body', [0, 0.1, 0]);
      for (const s of [-1, 1]) R.bone('arm' + sideL(s), 'head', [s * 0.42, 1.3, 0]);
      // cloud head
      const g = GEO.lumpy(GEO.sph(0.48, 0.42, 0.42, 20, 16), 0.12, 2.6, 3);
      R.add(g, { b: 'head', c: (v) => Rig.mix(0xb8d4ec, 0xffffff, sm(1.2, 1.7, v.y)), cell: 'plain', at: [0, 1.48, 0] });
      for (const [x, y, z, r] of [[-0.35, 1.62, 0.05, 0.22], [0.33, 1.66, -0.05, 0.25], [0.0, 1.82, -0.05, 0.25], [-0.15, 1.3, 0.2, 0.18]]) R.add(GEO.lumpy(GEO.sph(r, r * 0.85, r, 12, 10), 0.1, 3, x * 9), { b: 'head', c: 0xf0f8ff, cell: 'plain', at: [x, y, z] });
      // face: big eyes, determined brows, little open mouth
      for (const s of [-1, 1]) {
        R.add(GEO.sph(0.07, 0.09, 0.03, 12, 8), { b: 'head', c: 0x1a2a40, cell: 'plain', at: [s * 0.14, 1.5, 0.42] });
        R.add(GEO.sph(0.022, 0.022, 0.01, 6, 4), { b: 'head', c: 0xffffff, cell: 'plain', at: [s * 0.14 - 0.02, 1.53, 0.45] });
        R.add(GEO.box(0.12, 0.022, 0.02, 0.008), { b: 'head', c: 0x1a2a40, cell: 'plain', at: [s * 0.15, 1.63, 0.41], rot: [0, 0, s * 0.35] });
      }
      R.add(GEO.sph(0.035, 0.045, 0.02, 8, 6), { b: 'head', c: 0x3a1a2a, cell: 'plain', at: [0, 1.38, 0.43] });
      // little cloud arms
      for (const s of [-1, 1]) R.add(GEO.lumpy(GEO.sph(0.12, 0.1, 0.1, 10, 8), 0.12, 4), { b: 'arm' + sideL(s), c: 0xf0f8ff, cell: 'plain', at: [s * 0.55, 1.25, 0.05] });
      // whirlwind body and a 注連-style rope charm
      funnel(R, 'spin', { y0: 0.1, y1: 1.2, r0: 0.05, r1: 0.42, c: 0xc8e4f8, bands: 3, turns: 2, bw: 0.025 });
      R.add(GEO.tor(0.3, 0.025, 6, 20), { b: 'body', c: 0xd8c090, cell: 'rope', at: [0, 1.05, 0], rot: [PI / 2, 0, 0] });
      R.add(GEO.card(0.08, 0.2, 1, 1), { m: 'cut', b: 'body', c: 0xffffff, cell: 'paper', decal: true, at: [0.22, 0.85, 0.22], rot: [0, 0.8, 0] });
      R.fx({ mode: 'swirl', n: 16, at: [0, 0.1, 0], box: [0.05, 0.05, 0.05], col: [0xc08040, 0x8a6a30, 0xa0b040], size: 0.09, speed: 0.6, p: [0.6, 1.3, 1.5], blend: 'normal' });
      R.fx({ mode: 'swirl', n: 20, at: [0, 0.1, 0], box: [0.05, 0.05, 0.05], col: [0xe0f4ff], size: 0.05, speed: 0.9, p: [0.5, 1.2, 1.6] });
    },
    always(k) { k.r('spin', 0, -k.t * 6, 0); },
    idle(k) { WIND.idle(k); k.r('arm' + 'L', 0, 0, sin(k.t * 2) * 0.2); k.r('armR', 0, 0, -sin(k.t * 2) * 0.2); },
    move(k) { k.p('body', 0, 0.1, 0); k.r('body', 0.3, 0, sin(k.t * 4) * 0.08); },
    clips: {
      attack(k) {
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.34, 0.44, 0.6, 0.95);
        k.p('body', 0, 0.1 * back, -0.2 * back + 0.7 * hit); k.r('body', -0.3 * back + 0.5 * hit); k.s('head', -0.1 * back + 0.12 * hit, 0.15 * back - 0.08 * hit, -0.1 * back + 0.12 * hit);
        k.fx.glow += hit;
      },
      cast(k) { const up = pulse(k.u, 0.05, 0.3, 0.75, 1); k.p('body', 0, 0.3 * up, 0); k.s('spin', 0.5 * up); k.r('armL', 0, 0, -0.8 * up); k.r('armR', 0, 0, 0.8 * up); k.fx.glow += up; },
      hurt: (k) => GEN.hurt(k), die: (k) => GEN.die(k), special: (k) => GEN.special(k), enter: (k) => GEN.enter(k),
    },
  });

  // ============================================================================ 風魔 wind_demon (boss)
  // A cracked ever-burning lantern in the 五指山 wind-cave swallowed too many lost souls, knotted with the 九降風 and became
  // the Wind Demon: a storm-skinned torso on a howling tornado, bone mask, the broken lantern burning in its chest.
  // Phase 2: the lantern bursts red, the tornado widens and the swallowed souls whirl out.
  defB('wind_demon', {
    h: 4.6, boss: true, outline: 0.003, rim: 0.5, rimColor: 0xb8e8ff, wide: 1.3, phaseGlow: 1.5,
    build(R) {
      biped(R, { hip: 2.0, chest: 2.75, neck: 3.4, head: 3.65, sw: 0.72, sy: 3.25, arm: 1.5, hw: 0.2, armOut: 0.25, legs: false, cz: 0.05 });
      R.bone('spin', 'body', [0, 0.0, 0]);
      const SK = 0x3e4a64, SK2 = 0x6a7a98, BONE = 0xdfe4ea, ICE = 0x9ae8ff;
      const storm = (v) => Rig.mix(SK, SK2, sm(0.4, 0.7, fbm(v.x * 2, v.y * 2, v.z * 2)));
      torso(R, { y0: 1.9, y1: 3.4, r: (t) => 0.55 + 0.25 * sm(0.2, 0.7, t) - 0.3 * sm(0.8, 1, t), depth: 0.75, c: storm, cell: 'streak' === 'x' ? 'skin' : 'skin', rep: [3, 2] });
      R.add(GEO.lumpy(GEO.sph(0.62, 0.42, 0.45, 18, 12), 0.08, 2.5), { b: 'chest', c: storm, cell: 'skin', rep: [3, 2], at: [0, 3.05, 0.0] });
      // broken lantern in the chest (red paper, split ribs, flame inside)
      R.add(GEO.lathe([[0.001, -0.22], [0.16, -0.2], [0.24, -0.08], [0.26, 0.05], [0.22, 0.18], [0.12, 0.24], [0.001, 0.25]], 12), { b: 'chest', m: 'glow', c: 0xff7040, cell: 'lantern', rep: [3, 1], at: [0, 2.75, 0.45] });
      R.add(GEO.tor(0.27, 0.025, 6, 16), { b: 'chest', c: 0x3a2a1a, cell: 'wood', at: [0, 2.75, 0.45], rot: [PI / 2, 0, 0] });
      glowLine(R, [[0.05, 2.98, 0.63], [0.0, 2.85, 0.68], [0.07, 2.72, 0.7], [0.0, 2.6, 0.67]], 0.02, 0x1a0a08, { m: 'body' });
      // bone mask with horns, ice-blue eyes, fanged maw
      R.add(GEO.lumpy(GEO.sph(0.38, 0.36, 0.36, 16, 12), 0.05, 3), { b: 'head', c: storm, cell: 'skin', at: [0, 3.65, 0.08] });
      faceShell(R, 'windmask', [0, 3.7, 0.1], 0.4, 0.33, 0.38, { b: 'head', c: BONE, wide: 1.1, t0: 0.3, tl: 1.4 });
      R.bone('jaw', 'head', [0, 3.5, 0.2]);
      R.add(GEO.sph(0.3, 0.12, 0.28, 14, 8), { b: 'jaw', c: BONE, cell: 'stone', at: [0, 3.38, 0.28] });
      R.add(GEO.sph(0.25, 0.1, 0.24, 12, 6), { b: 'jaw', c: 0xffffff, cell: 'maw', uvp: 'y', at: [0, 3.45, 0.3] });
      for (const s of [-1, 1]) {
        R.add(GEO.sph(0.06, 0.04, 0.03, 8, 6), { b: 'head', m: 'glow', c: ICE, cell: 'blank', at: [s * 0.15, 3.76, 0.43] });
        R.add(GEO.sweep([[s * 0.28, 3.88, -0.05], [s * 0.5, 4.1, -0.15], [s * 0.55, 4.35, -0.35], [s * 0.45, 4.5, -0.55]], (u) => 0.08 * (1 - u * 0.9), { sides: 8 }), { b: 'head', c: BONE, cell: 'stone' });
        for (let i = 0; i < 3; i++) R.add(GEO.cone(0.035, 0.14, 5), { b: 'jaw', c: 0xf4f0e0, at: [s * (0.08 + i * 0.07), 3.46, 0.48 - i * 0.05] });
      }
      // wild mane of wind streaks swept back (additive streak cards) — spring-lagged
      for (let i = 0; i < 5; i++) strand(R, 'mane' + i, 'head', [[(i - 2) * 0.15, 3.95, -0.1], [(i - 2) * 0.22, 4.0, -0.5], [(i - 2) * 0.3, 3.9, -0.95]], { r: 0.1, ell: [1, 0.2], c: 0x8aa8d0, cell: 'streak', m: 'soft', k: 0.08, g: -0.2, tip: 0.3 });
      // huge arms with claws
      limbs(R, { arm: { r: (u) => 0.24 - u * 0.08, c: storm, cell: 'skin', rep: [2, 3] } });
      for (const s of [-1, 1]) {
        const L = sideL(s), H = R.B['hand' + L].pos;
        R.add(GEO.lumpy(GEO.sph(0.38, 0.3, 0.34, 14, 10), 0.08, 3), { b: 'arm' + L, c: storm, cell: 'skin', at: [s * 0.8, 3.25, 0] });
        R.add(GEO.lumpy(GEO.sph(0.2, 0.22, 0.18, 10, 8), 0.06, 4), { b: 'hand' + L, c: storm, cell: 'skin', at: [H.x, H.y - 0.05, H.z] });
        for (let i = 0; i < 4; i++) R.add(GEO.sweep([[H.x + (i - 1.5) * 0.08 * s, H.y - 0.1, H.z + 0.08], [H.x + (i - 1.5) * 0.11 * s, H.y - 0.35, H.z + 0.2], [H.x + (i - 1.5) * 0.12 * s, H.y - 0.5, H.z + 0.12]], (u) => 0.035 * (1 - u * 0.9), { sides: 5 }), { b: 'hand' + L, c: BONE, cell: 'stone' });
        R.add(GEO.tor(0.18, 0.04, 6, 14), { b: 'fore' + L, c: 0xd8c090, cell: 'rope', at: R.B['fore' + L].pos.toArray(), rot: [PI / 2, 0, 0] });
      }
      // tornado lower body
      funnel(R, 'spin', { y0: 0.0, y1: 2.15, r0: 0.18, r1: 0.75, c: 0x8aa0c8, bands: 4, turns: 2.5, bw: 0.06, pow: 1.4 });
      const pb = R.phaseBone('wide', 'spin', [0, 0, 0], 2);
      funnel(R, pb, { y0: 0.0, y1: 1.6, r0: 0.6, r1: 1.4, c: 0x6a80b0, bands: 3, turns: 1.6, bw: 0.08, pow: 1 });
      R.fx({ mode: 'swirl', n: 40, at: [0, 0.05, 0], box: [0.1, 0.1, 0.1], col: [0xd8ecff, 0xa0c8f0], size: 0.08, speed: 0.6, p: [0.9, 2.2, 1.0] });
      R.fx({ mode: 'orbit', n: 16, at: [0, 2.6, 0], box: [0.1, 1.2, 0.1], col: [0xc0f0ff, 0xffffff], size: 0.16, speed: 0.7, p: [1.5, 0.5, 1] });
      R.fx({ mode: 'swirl', n: 24, at: [0, 0.05, 0], box: [0.1, 0.1, 0.1], col: [0x8a6a40, 0x6a5a30], size: 0.1, speed: 0.4, p: [1.0, 1.5, 1.2], blend: 'normal' });
      R.light({ b: 'chest', at: [0, 2.75, 0.8], color: '#ff8050', i: 1.3, r: 5, flicker: 0.35 });
    },
    always(k) { k.r('spin', 0, -k.t * 5, 0); },
    onPhase(inst, n) { inst.U.uHue.value = n > 1 ? -0.25 : 0; },
    idle(k) { WIND.idle(k, { out: 0.45 }); k.r('jaw', 0.15 + 0.1 * sin(k.t * 1.3)); k.r('head', -0.1); },
    move(k) { k.p('body', 0, 0.1, 0); k.r('body', 0.25, 0, sin(k.t * 3) * 0.06); },
    clips: humClips({
      attack(k) {
        // raking claw swipe
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.42), hit = pulse(u, 0.36, 0.46, 0.6, 0.95);
        k.r('body', 0, 0.5 * back - 0.6 * hit, 0); k.p('body', 0, 0, 0.6 * hit);
        k.r('armR', -1.4 * back - 0.6 * hit, 0, 1.0 * back - 0.6 * hit); k.r('foreR', -1.0 * back); k.r('jaw', 0.6 * hit);
        k.fx.glow += hit;
      },
      cast(k) { HUM.cast(k, { float: 0.2 }); k.r('jaw', 0.8 * pulse(k.u, 0.05, 0.35, 0.75, 1)); k.s('spin', 0.3 * pulse(k.u, 0.05, 0.35, 0.75, 1)); },
      special(k) {
        // tempest roar: rises, arms flung wide, tornado swells
        const u = k.u, up = pulse(u, 0.05, 0.3, 0.75, 1);
        k.p('body', 0, 0.5 * up, 0); k.r('chest', -0.3 * up); k.r('head', -0.4 * up); k.r('jaw', 1.0 * up);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -1.2 * up, 0, s * 1.2 * up); }
        k.s('spin', 0.5 * up); k.fx.glow += 2.5 * up;
      },
    }),
  });

  // ============================================================================ 落山風靈 fallwind (boss)
  // The 落山風 that roars down from the Central Range onto 恆春 every winter: a sand-gold beast rising from a whirl of dust,
  // a mane of wind-whipped grass, long claws. It means no harm — the tide-sickness made it forget when to stop.
  // Phase 2: the dust storm thickens; the mane flares and its eyes blaze.
  defB('fallwind', {
    h: 4.7, boss: true, outline: 0.003, rim: 0.45, rimColor: 0xffe8b0, wide: 1.3, phaseGlow: 1.5,
    build(R) {
      biped(R, { hip: 1.4, chest: 2.4, neck: 3.1, head: 3.25, sw: 0.62, sy: 2.85, arm: 1.75, hw: 0.2, armOut: 0.3, legs: false, cz: 0.25, nz: 0.35, hz: 0.75 });
      R.bone('spin', 'root', [0, 0, 0]);
      R.bone('jaw', 'head', [0, 3.15, 0.95]);
      const SAND = 0xd0a868, SAND2 = 0x9a7840, GOLD = 0xf0d090;
      const dune = (v) => Rig.mix(SAND2, SAND, sm(0.35, 0.7, fbm(v.x * 2.2, v.y * 2.2 - 3, v.z * 2.2)));
      // hunched body rising out of the dust, tapering into the vortex
      torso(R, { y0: 0.6, y1: 2.95, r: (t) => 0.75 - 0.25 * t + 0.25 * sm(0.4, 0.75, t) - 0.25 * sm(0.85, 1, t), depth: 0.85, c: dune, cell: 'sand', rep: [3, 3], z: 0.08 });
      R.add(GEO.lumpy(GEO.sph(0.75, 0.55, 0.6, 18, 12), 0.12, 2.2, 5), { b: 'chest', c: dune, cell: 'sand', rep: [3, 2], at: [0, 2.55, 0.0] });
      // long head: sloped skull, glowing slit eyes, fanged jaw
      const hd = GEO.lumpy(GEO.sph(0.36, 0.3, 0.55, 16, 12), 0.05, 3); GEO.warp(hd, (v) => { if (v.z > 0) v.y -= v.z * 0.25; });
      R.add(hd, { b: 'head', c: dune, cell: 'sand', at: [0, 3.3, 0.85] });
      R.add(GEO.sph(0.3, 0.12, 0.45, 14, 8), { b: 'jaw', c: dune, cell: 'sand', at: [0, 3.08, 0.98] });
      R.add(GEO.sph(0.26, 0.08, 0.4, 12, 6), { b: 'jaw', c: 0xffffff, cell: 'maw', uvp: 'y', at: [0, 3.14, 1.0] });
      for (const s of [-1, 1]) {
        R.add(GEO.sph(0.09, 0.035, 0.04, 8, 6), { b: 'head', m: 'glow', c: 0xfff0a0, cell: 'blank', at: [s * 0.17, 3.38, 1.18], rot: [0, s * 0.5, s * -0.2] });
        for (let i = 0; i < 4; i++) R.add(GEO.cone(0.03, 0.14, 5), { b: 'head', c: 0xf8f0d8, at: [s * (0.12 + i * 0.04), 3.12, 1.3 - i * 0.12], rot: [PI, 0, 0] });
      }
      // grass-blade mane flaring back (spring-lagged cards)
      for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 2.2;
        strand(R, 'mane' + i, 'head', [[sin(a) * 0.25, 3.45, 0.75], [sin(a) * 0.55, 3.75 + cos(a) * 0.2, 0.35], [sin(a) * 0.85, 3.9 + cos(a) * 0.25, -0.15]], { r: 0.12, ell: [1, 0.15], c: Rig.mix(0xb8a050, 0xe8d890, i / 8), cell: 'frond', m: 'cut', k: 0.1, g: 0.15, tip: 0.35, up: [0, 0, 1] });
      }
      // long arms with sickle claws
      limbs(R, { arm: { r: (u) => 0.22 - u * 0.08, c: dune, cell: 'sand', rep: [2, 4] } });
      for (const s of [-1, 1]) {
        const L = sideL(s), H = R.B['hand' + L].pos;
        R.add(GEO.lumpy(GEO.sph(0.32, 0.28, 0.3, 12, 8), 0.08, 3), { b: 'arm' + L, c: dune, cell: 'sand', at: [s * 0.68, 2.85, 0.25] });
        R.add(GEO.lumpy(GEO.sph(0.16, 0.18, 0.16, 10, 8), 0.06, 4), { b: 'hand' + L, c: dune, cell: 'sand', at: [H.x, H.y, H.z] });
        for (let i = 0; i < 3; i++) R.add(GEO.sweep([[H.x + (i - 1) * 0.1 * s, H.y - 0.08, H.z + 0.08], [H.x + (i - 1) * 0.12 * s, H.y - 0.45, H.z + 0.35], [H.x + (i - 1) * 0.1 * s, H.y - 0.55, H.z + 0.6]], (u) => 0.045 * (1 - u * 0.9), { sides: 5 }), { b: 'hand' + L, c: 0xf0e8d0, cell: 'stone' });
      }
      // dust vortex and pool
      funnel(R, 'spin', { y0: 0.02, y1: 1.3, r0: 1.4, r1: 0.7, c: 0xc8a868, bands: 4, turns: 1.4, bw: 0.07, pow: 1, bandC: 0xf0d8a0 });
      R.add(GEO.cyl(1.6, 1.8, 0.04, 28), { b: 'root', m: 'soft', c: 0x8a6a3a, cell: 'blankA', at: [0, 0.02, 0] });
      const pb = R.phaseBone('storm', 'spin', [0, 0, 0], 2);
      funnel(R, pb, { y0: 0.0, y1: 3.0, r0: 1.9, r1: 2.3, c: 0xb89860, bands: 5, turns: 1.2, bw: 0.1, pow: 1, bandC: 0xffe8b0 });
      R.fx({ mode: 'swirl', n: 50, at: [0, 0.05, 0], box: [0.2, 0.1, 0.2], col: [0xc8a060, 0xe0c080, 0x9a7840], size: 0.22, speed: 0.4, p: [1.6, 1.6, 0.8], blend: 'normal' });
      R.fx({ mode: 'swirl', n: 30, at: [0, 0.05, 0], box: [0.2, 0.1, 0.2], col: [0xfff0c0], size: 0.05, speed: 0.7, p: [1.3, 2.4, 1.0] });
      R.fx({ mode: 'wander', n: 10, at: [0, 3.6, 0.4], box: [1.6, 0.8, 1.2], col: [0xd8c070], size: 0.06, speed: 1.2, p: [0.6, 0.5, 1] });
    },
    always(k) { k.r('spin', 0, -k.t * 2.5, 0); },
    idle(k) {
      WIND.idle(k, { out: 0.5 }); k.r('body', 0.2); k.r('jaw', 0.2 + 0.15 * sin(k.t * 1.1)); k.r('head', 0.1, sin(k.t * 0.5) * 0.3, 0);
      k.r('armL', -0.5); k.r('armR', -0.5); k.r('foreL', -0.8); k.r('foreR', -0.8);
    },
    move(k) { k.p('body', 0, 0.1, 0.1); k.r('body', 0.4, 0, sin(k.t * 3) * 0.06); },
    clips: humClips({
      attack(k) {
        // double claw rake
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.42), hit = pulse(u, 0.36, 0.46, 0.62, 0.95);
        k.r('body', -0.2 * back + 0.5 * hit); k.p('body', 0, 0.2 * back, 0.6 * hit);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -2.2 * back + 0.2 * hit, 0, s * (0.8 * back - 0.4 * hit)); k.r('fore' + L, -0.4 * back); }
        k.r('jaw', 0.7 * hit); k.fx.glow += hit;
      },
      cast(k) { HUM.cast(k, { float: 0.3 }); k.r('jaw', 0.9 * pulse(k.u, 0.05, 0.35, 0.75, 1)); },
      special(k) {
        // downslope gale: rears back, then lunges with the whole storm
        const u = k.u, up = pulse(u, 0.05, 0.4, 0.4, 0.52), go = pulse(u, 0.45, 0.58, 0.72, 1);
        k.r('body', -0.5 * up + 0.7 * go); k.p('body', 0, 0.5 * up, 1.0 * go); k.r('jaw', 1.0 * up);
        for (const s of [-1, 1]) { const L = sideL(s); k.r('arm' + L, -2.6 * up, 0, s * 0.9 * up); }
        k.s('spin', 0.6 * go); k.fx.glow += 2 * (up + go);
      },
    }),
  });

  // ============================================================================ 霧精 fog_spirit
  // Mist of the 阿里山 sea of clouds that should have lifted at dawn — the tide's breath climbed the mountain and it can't.
  defB('fog_spirit', {
    h: 2.2, outline: 0, rim: 0.6, rimColor: 0xffffff, ao: 0.1,
    build(R) {
      R.bone('body', 'root', [0, 0.9, 0]);
      R.bone('head', 'body', [0, 1.45, 0]);
      for (const s of [-1, 1]) R.bone('arm' + sideL(s), 'body', [s * 0.45, 1.15, 0.05]);
      const W = 0xf4f8fc, B = 0xc8d4e4;
      // soft body of overlapping lumps (no outline, translucent rim): bright head, wispy lower body
      R.add(GEO.lumpy(GEO.sph(0.42, 0.45, 0.4, 20, 16), 0.1, 2.4, 2), { b: 'head', c: (v) => Rig.mix(B, W, sm(1.1, 1.6, v.y)), cell: 'plain', at: [0, 1.45, 0] });
      for (const [x, y, z, r] of [[-0.3, 1.2, 0.05, 0.3], [0.3, 1.18, -0.05, 0.3], [0, 1.05, 0.1, 0.32], [0.1, 1.72, -0.1, 0.25]]) R.add(GEO.lumpy(GEO.sph(r, r * 0.9, r, 12, 10), 0.12, 3, x * 7 + y), { b: y > 1.5 ? 'head' : 'body', c: W, cell: 'plain', at: [x, y, z] });
      for (const s of [-1, 1]) {
        R.add(GEO.sph(0.065, 0.085, 0.03, 12, 8), { b: 'head', c: 0x2a3a5a, cell: 'plain', at: [s * 0.13, 1.5, 0.4] });
        R.add(GEO.sph(0.022, 0.022, 0.01, 6, 4), { b: 'head', m: 'glow', c: 0xb0e0ff, cell: 'blank', at: [s * 0.13 - 0.015, 1.53, 0.43] });
        R.add(GEO.lumpy(GEO.sph(0.16, 0.13, 0.13, 10, 8), 0.15, 4), { b: 'arm' + sideL(s), c: W, cell: 'plain', at: [s * 0.55, 1.1, 0.08] });
      }
      R.add(GEO.sph(0.035, 0.045, 0.02, 8, 6), { b: 'head', c: 0x2a3a5a, cell: 'plain', at: [0, 1.37, 0.41] });
      // ghostly skirt of mist
      wispTail(R, { y0: 0.95, r: 0.42, c: 0xdce8f4, pts: [[0, 0.95, 0], [0.02, 0.65, -0.05], [0.08, 0.38, -0.15], [0.18, 0.15, -0.3]] });
      R.fx({ mode: 'wander', n: 26, at: [0, 0.6, 0], box: [1.6, 1.0, 1.2], col: [0xf0f6fc, 0xdce8f4], size: 0.7, speed: 0.3, p: [0.4, 0.3, 1], blend: 'normal' });
      R.fx({ mode: 'wander', n: 14, at: [0, 1.2, 0], box: [1.2, 1.2, 1.0], col: [0xc0e8ff], size: 0.04, speed: 0.6, p: [0.3, 1, 1] });
    },
    idle(k) {
      const b = sin(k.t * 1.2);
      k.p('body', sin(k.t * 0.7) * 0.06, 0.1 + b * 0.08, 0); k.s('head', b * 0.03, -b * 0.03, b * 0.03); k.s('body', -b * 0.03, b * 0.04, -b * 0.03);
      k.p('armL', 0, sin(k.t * 1.4) * 0.08, 0); k.p('armR', 0, sin(k.t * 1.4 + 1.5) * 0.08, 0);
    },
    move(k) { k.p('body', 0, 0.15, 0); k.r('body', 0.3, 0, 0); k.s('body', -0.05, 0.08, 0.1); },
    clips: {
      attack(k) {
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.34, 0.44, 0.6, 0.95);
        k.s('body', 0.15 * back - 0.1 * hit, -0.15 * back + 0.15 * hit, 0.2 * hit); k.p('body', 0, 0.05 * back, 0.7 * hit); k.p('armR', 0, 0.2 * back, 0.4 * hit);
      },
      cast(k) { const up = pulse(k.u, 0.05, 0.35, 0.75, 1); k.s('head', 0.15 * up); k.s('body', 0.25 * up); k.p('body', 0, 0.2 * up, 0); k.fx.glow += up; },
      hurt(k) { GEN.hurt(k); k.s('body', 0.1 * pulse(k.u, 0, 0.1, 0.2, 0.7), -0.1 * pulse(k.u, 0, 0.1, 0.2, 0.7), 0.1 * pulse(k.u, 0, 0.1, 0.2, 0.7)); },
      die(k) { const u = k.u; k.s('body', 0.6 * sm(0.1, 1, u), -0.4 * sm(0.1, 1, u), 0.6 * sm(0.1, 1, u)); k.p('body', 0, -0.3 * sm(0.2, 1, u), 0); k.fx.diss = max(k.fx.diss, sm(0.2, 1, u)); },
      special: (k) => GEN.special(k), enter: (k) => GEN.enter(k),
    },
  });

  // ============================================================================ 潮怨 tide_grudge
  // A cresting wave of the 逆潮, full of the grudges of the drowned — their wailing faces pressed into the water.
  defB('tide_grudge', {
    h: 2.8, outline: 0.003, rim: 0.6, rimColor: 0xc0f8ff, scroll: -0.25, ao: 0.25,
    build(R) {
      R.bone('body', 'root', [0, 0.1, 0]);
      const C = R.chain('w', 'body', [[0, 0.15, -0.95], [0, 0.95, -0.85], [0, 1.75, -0.55], [0, 2.35, -0.05], [0, 2.5, 0.45], [0, 2.2, 0.85], [0, 1.75, 0.8]]);
      R.spring(C.slice(4), { k: 0.2, drag: 0.15, g: 0.3 });
      const TEAL = 0x1e7a88, DEEP = 0x0e3a4a, FOAM = 0xf0fcff;
      // the wave sheet: a wide flattened sweep up the chain, tapering at both sides
      const sheet = (wd, th, cOff, m) => {
        R.tube(C, { r: (u) => th * (1.25 - 0.45 * u) * (1 - 0.5 * sm(0.8, 1, u)), ell: [1, wd / th], sides: 18, up: [1, 0, 0], ext: [0, 0.1], n: 60, m,
          warp: (v) => { const x = v.x / wd; v.y -= x * x * 0.7 * sm(0.3, 2.5, v.y); v.z -= x * x * 0.35 * sm(1.5, 2.5, v.y); },
          c: (v, uu, vv) => Rig.mix(DEEP, TEAL, sm(0.0, 2.2, v.y + cOff)).lerp(new THREE.Color(FOAM), sm(2.2, 2.6, v.y) * 0.8), cell: 'water', rep: [1, 3] });
      };
      sheet(1.0, 0.16, 0, 'body');
      // foam crest along the lip and spray clumps
      const r = R.r;
      for (let i = 0; i < 14; i++) {
        const x = (i / 13 - 0.5) * 1.9, xn = x / 1.0, b = i % 2 ? 'w4' : 'w3', base = R.B[b].pos;
        R.add(GEO.lumpy(GEO.sph(0.15 + r() * 0.08, 0.1, 0.15, 10, 8), 0.2, 4, i), { b, c: FOAM, cell: 'plain', at: [x * 0.92, base.y + 0.14 - xn * xn * 0.62, base.z + (b === 'w4' ? 0.05 : -0.05) - xn * xn * 0.3] });
      }
      // foam skirt at the base
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; R.add(GEO.lumpy(GEO.sph(0.25, 0.1, 0.22, 10, 6), 0.2, 4, i + 20), { b: 'body', c: Rig.mix(FOAM, 0xa8d8e8, r()), cell: 'plain', at: [cos(a) * 0.9, 0.08, -0.4 + sin(a) * 0.55] }); }
      // drowned faces pressed into the water (wailing)
      const faces = [[-0.45, 1.2, 'w1', 0.32], [0.3, 1.5, 'w2', 0.28], [-0.1, 0.65, 'w1', 0.26], [0.55, 0.85, 'w1', 0.22], [-0.55, 1.9, 'w2', 0.22]];
      faces.forEach(([x, y, b, sz], i) => {
        const fb = R.bone('face' + i, b, [x, y, R.B[b].pos.z + 0.2]);
        R.add(GEO.card(sz, sz * 1.25, 1, 1), { m: 'soft', b: fb, c: 0xd8f4ff, cell: 'soul', decal: true, at: [x, y - sz * 0.6, R.B[b].pos.z + 0.17 + (y - R.B[b].pos.y) * 0.15], rot: [-0.25, 0, 0] });
      });
      R.fx({ mode: 'fall', n: 30, at: [0, 2.4, 0.6], box: [1.8, 0.3, 0.4], col: [0xffffff, 0xc8f0ff], size: 0.06, speed: 1.0, p: [2.2, 0.3, 1] });
      R.fx({ mode: 'rise', n: 16, at: [0, 0.2, 0], box: [2, 0.3, 1.4], col: [0xffffff], size: 0.5, speed: 0.4, p: [0.6, 0.3, 1], blend: 'normal' });
      R.fx({ mode: 'wander', n: 10, at: [0, 1.3, 0], box: [1.6, 1.6, 0.8], col: [0x80e0ff], size: 0.05, speed: 0.6, p: [0.3, 1, 1] });
    },
    idle(k) {
      const b = sin(k.t * 1.3);
      k.r('w1', b * 0.03); k.r('w2', b * 0.05); k.r('w3', 0.04 + b * 0.06); k.r('w4', b * 0.08); k.s('body', 0, b * 0.02, 0);
      for (let i = 0; i < 5; i++) { const w = 0.5 + 0.5 * sin(k.t * 2.2 + i * 1.7); k.s('face' + i, 0.12 * w, 0.2 * w, 0); }
    },
    move(k) { k.r('w2', 0.1); k.r('w3', 0.15); k.p('body', 0, 0, sin(k.t * 3) * 0.05); },
    clips: {
      attack(k) {
        // the wave rears then crashes forward over the target
        const u = k.u, up = pulse(u, 0, 0.32, 0.32, 0.42), crash = pulse(u, 0.38, 0.52, 0.65, 0.95);
        k.r('w1', -0.15 * up + 0.2 * crash); k.r('w2', -0.15 * up + 0.35 * crash); k.r('w3', -0.2 * up + 0.5 * crash); k.r('w4', 0.6 * crash);
        k.p('body', 0, 0.2 * up, 0.6 * crash); k.s('body', 0.1 * up, 0.2 * up, 0);
        k.fx.flash = max(k.fx.flash, 0.3 * pulse(u, 0.5, 0.52, 0.55, 0.65));
      },
      cast(k) { const up = pulse(k.u, 0.05, 0.35, 0.75, 1); k.s('body', 0.1 * up, 0.25 * up, 0); for (let i = 0; i < 5; i++) k.s('face' + i, 0.5 * up); k.fx.glow += 1.5 * up; },
      hurt(k) { GEN.hurt(k); k.r('w3', -0.2 * pulse(k.u, 0, 0.1, 0.2, 0.8)); },
      die(k) { const u = k.u, f = sm(0.1, 0.8, u); k.s('body', 0.3 * f, -0.85 * f, 0.3 * f); k.r('w3', 0.6 * f); k.r('w4', 0.6 * f); k.fx.diss = max(k.fx.diss, sm(0.3, 1, u)); },
      special(k) { const u = k.u, up = pulse(u, 0.05, 0.3, 0.75, 1); k.s('body', 0.3 * up, 0.35 * up, 0); k.r('w3', 0.3 * up); for (let i = 0; i < 5; i++) k.s('face' + i, 0.8 * up); k.fx.glow += 2 * up; },
      enter: (k) => GEN.enter(k),
    },
  });

  // ============================================================================ 溺魂群 drowned_swarm
  // Souls drowned in the Black Ditch, circling in a whirlpool: a vortex of small wailing wisps around a dark eye of water.
  defB('drowned_swarm', {
    h: 2.6, outline: 0, rim: 0.6, rimColor: 0xc8f0ff, scroll: -0.2, wide: 1.2,
    build(R) {
      R.bone('body', 'root', [0, 0.1, 0]);
      const rings = [['ring0', 0.35, 0.95, 7], ['ring1', 0.6, 1.5, 9], ['ring2', 0.9, 2.05, 10], ['ring3', 0.6, 0.5, 6]];
      const r = R.r;
      for (const [rb, rad, y, n] of rings) {
        R.bone(rb, 'body', [0, y, 0]);
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + r() * 0.3, x = cos(a) * rad, z = sin(a) * rad, sz = 0.16 + r() * 0.1, yy = y + (r() - 0.5) * 0.25;
          // each soul: a teardrop head + trailing tail (ghost) and a face card
          const tail = [[x, yy, z]]; for (let j = 1; j < 4; j++) { const aa = a - j * 0.25; tail.push([cos(aa) * rad * (1 + j * 0.05), yy - j * 0.04, sin(aa) * rad * (1 + j * 0.05)]); }
          R.add(GEO.sweep(tail, (u) => sz * 0.55 * (1 - u * 0.9), { sides: 8, n: 10 }), { b: rb, m: 'ghost', c: 0xb8e8ff, cell: 'plain' });
          R.add(GEO.card(sz * 1.1, sz * 1.3, 1, 1), { m: 'soft', b: rb, c: 0xffffff, cell: 'soul', decal: true, at: [x, yy - sz * 0.6, z], rot: [0, -a + PI, 0] });
        }
      }
      // hands reaching out of the whirl
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + 0.5, x = cos(a) * 0.5, z = sin(a) * 0.5;
        const hb = R.chain('hand' + i, 'body', [[x * 0.6, 0.0, z * 0.6], [x, 0.45, z], [x * 1.3, 0.8, z * 1.3]]);
        R.tube(hb, { r: (u) => 0.05 * (1 - u * 0.4), sides: 6, m: 'ghost', c: 0x9ad0f0, cell: 'skin', ext: [0, 0.05] });
        R.add(GEO.sph(0.06, 0.08, 0.04, 8, 6), { b: hb[2], m: 'ghost', c: 0xc0e8ff, cell: 'skin', at: [x * 1.33, 0.86, z * 1.33] });
      }
      // dark whirlpool
      waterDisk(R, 1.5, [0, 0.02, 0], 0x0e2a3a);
      R.add(GEO.cyl(0.5, 0.5, 0.02, 24), { m: 'glow', c: 0x02060a, cell: 'blank', at: [0, 0.01, 0] });
      R.fx({ mode: 'swirl', n: 40, at: [0, 0.05, 0], box: [0.1, 0.1, 0.1], col: [0x9ae0ff, 0xd8f4ff], size: 0.06, speed: 0.5, p: [0.5, 2.3, 1.6] });
      R.fx({ mode: 'fall', n: 20, at: [0, 1.4, 0], box: [1.6, 1.4, 1.6], col: [0x9ad8f0], size: 0.04, speed: 1.0, p: [1.2, 0.05, 1] });
      R.light({ b: 'body', at: [0, 1.2, 0], color: '#9ae0ff', i: 0.7, r: 4, flicker: 0.2 });
    },
    always(k) { k.r('ring0', 0, k.t * 1.4, 0); k.r('ring1', 0, k.t * 1.0, 0); k.r('ring2', 0, k.t * 0.7, 0); k.r('ring3', 0, k.t * 1.8, 0); },
    idle(k) {
      for (let i = 0; i < 4; i++) { const ph = k.t * 1.5 + i * 1.6; k.r('hand' + i + '0', sin(ph) * 0.3, 0, cos(ph) * 0.3); k.r('hand' + i + '1', sin(ph + 1) * 0.3); }
      k.p('ring1', 0, sin(k.t * 1.3) * 0.08, 0); k.p('ring2', 0, sin(k.t * 1.1 + 1) * 0.1, 0);
    },
    move(k) { k.r('body', 0.15, 0, 0); },
    clips: {
      attack(k) { const u = k.u, hit = pulse(u, 0.3, 0.45, 0.6, 0.95); k.p('ring1', 0, 0, 0.8 * hit); k.p('ring2', 0, -0.2 * hit, 0.6 * hit); k.s('ring0', 0.3 * hit); for (let i = 0; i < 4; i++) k.r('hand' + i + '0', -0.8 * hit); },
      cast(k) { const up = pulse(k.u, 0.05, 0.35, 0.75, 1); k.s('ring1', 0.4 * up); k.s('ring2', 0.5 * up); k.p('ring2', 0, 0.3 * up, 0); k.fx.glow += 1.5 * up; },
      hurt: (k) => GEN.hurt(k),
      die(k) { const u = k.u, f = sm(0.1, 0.9, u); for (const rb of ['ring0', 'ring1', 'ring2', 'ring3']) k.s(rb, 0.8 * f); k.p('ring2', 0, 0.8 * f, 0); k.fx.diss = max(k.fx.diss, sm(0.2, 1, u)); },
      special(k) { const up = pulse(k.u, 0.05, 0.3, 0.75, 1); k.s('ring2', 0.8 * up); k.s('ring1', 0.6 * up); k.fx.glow += 2 * up; },
      enter: (k) => GEN.enter(k),
    },
  });

  // ============================================================================ 海妖 sea_monster
  // Driven up from the Kuroshio deep by the tide-sickness: a barnacled octopus whose spots glow sick green.
  // Its singing is beautiful because it learned it from the drowned.
  const OCTO = { arms: [] };
  defB('sea_monster', {
    h: 2.5, outline: 0.003, rim: 0.45, rimColor: 0xe0c0ff, clipY: -0.05, scroll: -0.1, wide: 1.3,
    build(R) {
      R.bone('body', 'root', [0, 0.7, 0]);
      R.bone('head', 'body', [0, 1.3, -0.05]);
      const PUR = 0x6a4a8a, PUR2 = 0x9a70b8, SUCK = 0xe8c8d8, SPOT = 0x8aff60;
      // mantle: tall bulb leaning back, barnacle crown, glowing spots
      const mantle = GEO.lumpy(GEO.sph(0.62, 0.8, 0.6, 22, 18), 0.05, 2.5, 4);
      GEO.warp(mantle, (v) => { v.z -= sm(0, 0.8, v.y) * 0.2; });
      R.add(mantle, { skin: byY('body', 'head', 0.9, 1.6), c: (v) => Rig.mix(PUR, PUR2, sm(0.5, 0.8, fbm(v.x * 3, v.y * 3, v.z * 3))), cell: 'skin', rep: [3, 3], at: [0, 1.45, -0.05] });
      const r = R.r;
      for (let i = 0; i < 16; i++) {
        const a = r() * TAU, h = -0.2 + r() * 0.9, p = onEll([0, 1.45, -0.05], [0.62, 0.8, 0.6], a, h);
        R.add(GEO.sph(0.04 + r() * 0.04, 0.04 + r() * 0.04, 0.02, 8, 6), { b: 'head', m: 'glow', c: SPOT, cell: 'blank', at: p, rot: [0, -a + PI / 2, 0] });
      }
      for (let i = 0; i < 10; i++) { const a = r() * TAU, p = onEll([0, 1.45, -0.05], [0.6, 0.78, 0.58], a, 0.55 + r() * 0.4); R.add(GEO.lumpy(GEO.cyl(0.05, 0.08, 0.08, 8), 0.05, 8, i), { b: 'head', c: 0xe0d8c8, cell: 'barnacle', at: p, rot: [r() * 0.5, 0, r() * 0.5] }); }
      // big yellow eyes with bar pupils, heavy lids
      for (const s of [-1, 1]) {
        R.add(GEO.sph(0.14, 0.13, 0.08, 14, 10), { b: 'body', c: 0xe8e060, cell: 'eye', at: [s * 0.3, 0.98, 0.45], rot: [0, s * 0.4, PI / 2] });
        R.add(GEO.sph(0.16, 0.08, 0.1, 12, 8, { tl: PI / 2 }), { b: 'body', c: PUR, cell: 'skin', at: [s * 0.3, 1.04, 0.43], rot: [0.3, s * 0.4, 0] });
      }
      R.add(GEO.lumpy(GEO.sph(0.5, 0.35, 0.45, 18, 12), 0.04, 3), { b: 'body', c: PUR, cell: 'skin', at: [0, 0.75, 0.05] });
      // eight arms: tapered tubes on 5-bone chains, suckers on the underside
      OCTO.arms = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + PI / 8, dx = sin(a), dz = cos(a), len = 1.5 + (i % 2) * 0.25;
        const pts = []; for (let j = 0; j < 6; j++) { const t = j / 5, rr = 0.35 + t * len, curl = t * t * 0.6; pts.push([dx * rr - dz * curl * 0.4, 0.45 - t * 0.5 + t * t * (i % 3 === 0 ? 0.9 : 0.2), dz * rr + dx * curl * 0.4]); }
        const ch = R.chain('a' + i + '_', 'body', pts);
        OCTO.arms.push(ch);
        R.tube(ch, { r: (u) => 0.13 * (1 - u * 0.85), sides: 10, up: [0, 1, 0], c: (v, uu) => (cos(TAU * uu) > 0.3 ? SUCK : PUR), cell: 'skin', rep: [2, 6], ext: [0, 0.2] });
        for (let j = 1; j < 9; j++) { const t = j / 10, P = ch.map((n) => R.B[n].pos), q = P[0].clone().lerp(P[5], t); q.y -= 0.12 * (1 - t * 0.8); R.add(GEO.cyl(0.03 * (1 - t * 0.6), 0.035 * (1 - t * 0.6), 0.02, 8), { b: ch[min(4, floor(t * 5))], c: SUCK, cell: 'plain', at: q.toArray() }); }
      }
      waterDisk(R, 1.9, [0, 0.02, 0], 0x1a3a4a);
      R.fx({ mode: 'rise', n: 20, at: [0, 0.4, 0], box: [2, 0.3, 2], col: [SPOT, 0xc0ff90], size: 0.05, speed: 0.6, p: [1.5, 0.2, 1] });
      R.fx({ mode: 'rise', n: 12, at: [0, 0.2, 0], box: [1.6, 0.2, 1.6], col: [0xd0f0ff], size: 0.08, speed: 0.5, p: [1.0, 0.1, 1] });
    },
    idle(k) {
      const b = sin(k.t * 1.1);
      k.p('body', 0, b * 0.06, 0); k.s('head', b * 0.04, -b * 0.03, b * 0.04); k.r('head', -0.1 + b * 0.05, 0, sin(k.t * 0.6) * 0.06);
      OCTO.arms.forEach((ch, i) => { k.wave(ch, 'x', 0.18, 4, 2.2, i * 0.8, (u) => 0.3 + u); k.wave(ch, 'y', 0.12, 3, 1.4, i * 1.3, (u) => u); });
    },
    move(k) { OCTO.arms.forEach((ch, i) => k.wave(ch, 'x', 0.35, 3, 6, i * 0.8)); k.p('body', 0, 0.15, 0); },
    clips: {
      attack(k) {
        // two front arms coil back and lash forward
        const u = k.u, back = pulse(u, 0, 0.3, 0.3, 0.4), hit = pulse(u, 0.34, 0.44, 0.6, 0.95);
        for (const i of [0, 7]) OCTO.arms[i].forEach((b, j) => k.r(b, (-0.6 * back + 0.5 * hit) * (j ? 1 : 0.5), 0, 0));
        k.r('body', -0.15 * back + 0.25 * hit); k.p('body', 0, 0.1 * back, 0.3 * hit);
      },
      cast(k) { const up = pulse(k.u, 0.05, 0.35, 0.75, 1); k.s('head', 0.15 * up); OCTO.arms.forEach((ch) => k.r(ch[0], -0.6 * up)); k.p('body', 0, 0.3 * up, 0); k.fx.glow += 2 * up; },
      hurt: (k) => GEN.hurt(k),
      die(k) { const u = k.u, f = sm(0.1, 0.8, u); k.p('body', 0, -1.0 * f, 0); OCTO.arms.forEach((ch) => k.r(ch[0], 0.5 * f)); k.fx.diss = max(k.fx.diss, sm(0.4, 1, u)); k.fx.flash = max(k.fx.flash, 1 - sm(0, 0.15, u)); },
      special(k) { const up = pulse(k.u, 0.05, 0.3, 0.75, 1); OCTO.arms.forEach((ch, i) => { k.r(ch[0], -1.0 * up); k.wave(ch, 'y', 0.4 * up, 2, 8, i); }); k.s('head', 0.2 * up); k.fx.glow += 2 * up; },
      enter: (k) => GEN.enter(k),
    },
  });

  // ============================================================================ 鯤 kun (boss)
  // 北冥有魚，其名為鯤 — when it swims the Black Ditch the whole sea's lights tilt. A whale the size of an island surfacing
  // from black water: barnacled hide, a line of soul-lanterns glowing along its flank, a golden eye that has seen every era.
  // Phase 2: the lanterns blaze, a starfield wakes on its skin and its mouth opens on a galaxy.
  const KUN = {};
  defB('kun', {
    h: 4.2, boss: true, outline: 0.003, rim: 0.5, rimColor: 0x9ad0ff, clipY: -0.02, scroll: -0.05, wide: 1.8, psy: [0.8, 6, 0.06, 1.3], phaseGlow: 1.6, edge: [0.6, 1.2, 2.2],
    build(R) {
      // spine runs head (+z, front) → tail (−z); the whale lies along z so it faces the party
      const sp = [[0, 1.2, 2.8], [0, 1.7, 1.6], [0, 1.85, 0.2], [0, 1.6, -1.3], [0, 1.1, -2.6], [0, 0.5, -3.6], [0, 0.4, -4.3]];
      R.bone('body', 'root', sp[2]);
      R.bone('s0', 'body', sp[1]); R.bone('head', 's0', sp[0]);
      R.bone('s2', 'body', sp[3]); R.bone('s3', 's2', sp[4]); R.bone('s4', 's3', sp[5]); R.bone('tail', 's4', sp[6]);
      R.bone('jaw', 'head', [0, 0.6, 2.4]);
      KUN.spine = ['s0', 'body', 's2', 's3', 's4', 'tail'];
      const SK = 0x3a5a84, SK2 = 0x6a8ab4, BELLY = 0xc8d4e0, LAMP = 0xffc860;
      const prof = (z) => { const t = (2.95 - z) / 7.4; return { w: 1.55 * sm(-0.02, 0.22, t) * (1 - 0.82 * sm(0.4, 1.0, t)), h: 1.25 * sm(-0.02, 0.2, t) * (1 - 0.75 * sm(0.45, 1.0, t)) }; };
      // body: lathe-like loft along z, skinned along the spine (weights by z)
      const g = new THREE.CylinderGeometry(1, 1, 1, 36, 40, false);
      g.rotateX(PI / 2);
      GEO.warp(g, (v) => {
        const z = lerp(-4.45, 2.95, v.z + 0.5), P = prof(z), ax = v.x, ay = v.y;
        const yc = keys(z, [-4.45, 0.45, -3.6, 0.5, -2.6, 1.1, -1.3, 1.55, 0.2, 1.6, 1.6, 1.4, 2.95, 0.95]);
        v.set(ax * P.w, yc + ay * P.h * (ay < 0 ? 0.85 : 1), z);
      });
      idx(g);
      const zs = [2.95, 1.6, 0.2, -1.3, -2.6, -3.6, -4.3], zb = ['head', 's0', 'body', 's2', 's3', 's4', 'tail'];
      const kunSkin = (p) => { for (let i = 0; i < zs.length - 1; i++) if (p.z <= zs[i] && p.z >= zs[i + 1]) { const t = (zs[i] - p.z) / (zs[i] - zs[i + 1]); return [[zb[i], 1 - t], [zb[i + 1], t]]; } return [[p.z > 0 ? 'head' : 'tail', 1]]; };
      R.add(g, { skin: kunSkin, c: (v) => { const n = fbm(v.x * 0.8, v.y * 0.8, v.z * 0.8); const belly = sm(0.9, 0.4, v.y - (keys(v.z, [-4.45, 0.45, -2.6, 1.1, 0.2, 1.6, 2.95, 0.95]) - 0.6)); return Rig.mix(Rig.mix(SK, SK2, sm(0.4, 0.75, n)), BELLY, belly * 0.0 + sm(0.2, -0.6, v.y - keys(v.z, [-4.45, 0.45, -2.6, 1.1, 0.2, 1.6, 2.95, 0.95])) * 0.8); }, cell: 'skin', rep: [6, 10] });
      // mouth line, golden eyes
      for (const s of [-1, 1]) {
        // mouth line traced on the hull, eye just above its corner
        const yc = (z) => keys(z, [-4.45, 0.45, -2.6, 1.1, -1.3, 1.55, 0.2, 1.6, 1.6, 1.4, 2.95, 0.95]);
        const ml = []; for (let i = 0; i <= 8; i++) { const z = lerp(2.9, 1.0, i / 8), P = prof(z), a = 2.0 - i * 0.02; ml.push([s * sin(a) * P.w * 1.01, yc(z) + cos(a) * P.h * 0.86, z]); }
        R.add(GEO.sweep(ml, 0.035, { sides: 4 }), { b: 'head', c: 0x0a0e18, cell: 'plain' });
        { const z = 1.3, P = prof(z), a = 1.35, ex = s * sin(a) * P.w, ey = yc(z) + cos(a) * P.h;
          R.add(GEO.sph(0.2, 0.16, 0.1, 14, 10), { b: 'head', m: 'glow', c: 0xa08020, cell: 'eye', at: [ex, ey, z], rot: [0, s * PI / 2, PI / 2] });
          R.add(GEO.tor(0.21, 0.045, 6, 16), { b: 'head', c: SK, cell: 'skin', at: [ex + s * 0.01, ey, z], rot: [0, s * PI / 2, 0] }); }
        // pectoral fins
        R.bone('fin' + sideL(s), 'body', [s * 1.3, 0.85, 0.6]);
        const fin = GEO.ext([[0, 0], [0.4, -0.15], [1.6, -0.6], [1.9, -0.75], [1.5, -0.35], [0.5, 0.15]], 0.06, 0.03);
        R.add(fin, { b: 'fin' + sideL(s), c: SK2, cell: 'skin', at: [s * 1.3, 0.85, 0.6], rot: [0.2, s < 0 ? PI : 0, s * -0.4], s: [1, 1, 1] });
      }
      // tail flukes: horizontal, swept, raised out of the water behind
      for (const sd of [-1, 1]) {
        const fl = GEO.ext([[0, 0], [0.5, -0.1], [1.3, -0.35], [1.7, -0.7], [1.25, -0.6], [0.45, -0.4], [0, -0.3]], 0.07, 0.03);
        R.add(fl, { b: 'tail', c: SK, cell: 'skin', at: [0, 0.45, -4.25], rot: [-PI / 2, 0, 0], s: [sd, 1, 1] });
      }
      // barnacle reefs on the back, the line of soul-lanterns along the flanks (and the starfield for phase 2)
      const r = R.r;
      for (let i = 0; i < 30; i++) {
        const z = 2.2 - r() * 6, P = prof(z), a = -0.4 + r() * 0.8, yc = keys(z, [-4.45, 0.45, -2.6, 1.1, -1.3, 1.55, 0.2, 1.6, 1.6, 1.4, 2.95, 0.95]);
        const p = [sin(a) * P.w * 0.98, yc + cos(a) * P.h * 0.98, z];
        R.add(GEO.lumpy(GEO.cyl(0.05 + r() * 0.06, 0.08 + r() * 0.08, 0.08, 8), 0.05, 8, i), { skin: kunSkin, c: 0xd8d4c8, cell: 'barnacle', at: p, rot: [0, 0, -a] });
      }
      for (let i = 0; i < 22; i++) {
        const s = i % 2 ? 1 : -1, z = 2.2 - (i / 22) * 5.6 + r() * 0.2, P = prof(z), a = s * (0.9 + r() * 0.5), yc = keys(z, [-4.45, 0.45, -2.6, 1.1, -1.3, 1.55, 0.2, 1.6, 1.6, 1.4, 2.95, 0.95]);
        const p = [sin(a) * P.w, yc + cos(a) * P.h, z];
        R.add(GEO.sph(0.07 + r() * 0.04, 0.07 + r() * 0.04, 0.04, 10, 8), { skin: kunSkin, m: 'glow', c: LAMP, cell: 'heart', at: p, rot: [0, a, 0] });
      }
      // phase 2: starfield skin overlay + galaxy maw
      const pb = R.phaseBone('stars', 'body', [0, 1.6, 0.2], 2);
      for (let i = 0; i < 60; i++) { const z = 2.4 - r() * 6.2, P = prof(z), a = (r() - 0.5) * 2.6, yc = keys(z, [-4.45, 0.45, -2.6, 1.1, -1.3, 1.55, 0.2, 1.6, 1.6, 1.4, 2.95, 0.95]); R.add(GEO.oct(0.03 + r() * 0.03), { b: pb, m: 'glow', c: Rig.mix(0xa0d8ff, 0xffffff, r()), cell: 'blank', at: [sin(a) * P.w * 1.01, yc + cos(a) * P.h * 1.01, z] }); }
      const maw = R.phaseBone('maw', 'jaw', [0, 0.85, 2.2], 2);
      R.add(GEO.sph(0.9, 0.3, 0.8, 18, 10), { b: maw, m: 'psy', c: 0x7060a0, cell: 'blank', at: [0, 0.88, 2.0] });
      // sea
      waterDisk(R, 4.8, [0, 0.02, -0.6], 0x0e2438);
      R.fx({ mode: 'rise', n: 30, at: [0, 1.3, -0.6], box: [3.5, 1.5, 7], col: [LAMP, 0xffe8a0], size: 0.1, speed: 0.3, p: [2.5, 0.4, 1] });
      R.fx({ mode: 'fall', n: 40, at: [0, 2.2, -0.6], box: [3, 0.5, 6], col: [0xd8f0ff], size: 0.06, speed: 1.0, p: [2.2, 0.2, 1] });
      R.fx({ mode: 'wander', n: 16, at: [0, 0.3, -0.6], box: [6, 0.4, 8], col: [0xe0f0f8], size: 1.4, speed: 0.2, p: [0.6, 0.2, 1], blend: 'normal' });
      R.light({ b: 'body', at: [0, 2.2, 0.2], color: '#ffc860', i: 1.2, r: 8, flicker: 0.1 });
    },
    idle(k) {
      // slow vast breathing; swells passing along the body; the tail lifts and settles
      const b = sin(k.t * 0.5);
      k.p('body', 0, b * 0.12, 0); k.r('body', b * 0.03, 0, sin(k.t * 0.3) * 0.02);
      k.wave(KUN.spine, 'x', 0.04, 5, 0.7, 0, (u) => 0.3 + u); k.r('s4', -0.25); k.r('tail', -0.35 + sin(k.t * 0.6) * 0.15);
      k.r('jaw', 0.02 + 0.02 * sin(k.t * 0.8)); k.r('finL', 0, 0, sin(k.t * 0.7) * 0.15); k.r('finR', 0, 0, -sin(k.t * 0.7) * 0.15);
      if (k.ph > 1) k.r('jaw', 0.15);
    },
    move(k) { k.wave(KUN.spine, 'y', 0.06, 4, 2); k.r('tail', sin(k.t * 2) * 0.3); },
    clips: {
      attack(k) {
        // breach-slam: rears the head out of the sea and crashes down
        const u = k.u, up = pulse(u, 0, 0.38, 0.38, 0.5), down = pulse(u, 0.45, 0.55, 0.68, 0.98);
        k.r('body', -0.25 * up + 0.12 * down); k.r('s0', -0.15 * up + 0.12 * down); k.p('body', 0, 0.8 * up - 0.3 * down, 0.5 * down);
        k.r('tail', 0.4 * up - 0.4 * down); k.r('jaw', 0.3 * up);
        k.fx.flash = max(k.fx.flash, 0.4 * pulse(u, 0.53, 0.55, 0.58, 0.7));
      },
      cast(k) {
        // the song: lanterns flare, the mouth opens, the sea tilts
        const u = k.u, up = pulse(u, 0.05, 0.35, 0.75, 1);
        k.r('jaw', 0.35 * up); k.r('body', -0.1 * up, 0, 0.08 * sin(k.ct * 2) * up); k.fx.glow += 2.5 * up; k.fx.psy += 2 * up;
      },
      hurt(k) { const h = pulse(k.u, 0, 0.08, 0.2, 1); k.r('body', -0.08 * h, 0, 0.05 * h); k.r('tail', 0.3 * h); k.fx.flash = max(k.fx.flash, (1 - sm(0, 0.35, k.u)) * 1.0); },
      die(k) { const u = k.u, f = sm(0.1, 0.9, u); k.p('body', 0, -1.6 * f, 0); k.r('body', 0.15 * f, 0, 0.3 * f); k.r('tail', 0.5 * f); k.fx.diss = max(k.fx.diss, sm(0.5, 1, u)); k.fx.glow += 2 * pulse(u, 0, 0.2, 0.3, 0.6); },
      special(k) {
        // swallowing tide: dives, then the vast mouth rises open beneath the party
        const u = k.u, dive = pulse(u, 0.05, 0.3, 0.35, 0.5), rise = pulse(u, 0.45, 0.6, 0.75, 1);
        k.p('body', 0, -1.2 * dive + 0.9 * rise, 0.8 * rise); k.r('body', 0.2 * dive - 0.4 * rise); k.r('jaw', 0.6 * rise); k.fx.psy += 3 * rise; k.fx.glow += 2 * rise;
      },
      enter(k) { const u = k.u, rise = sm(0, 0.8, u); k.p('body', 0, -2.0 * (1 - rise), -1.0 * (1 - rise)); k.r('body', -0.3 * (1 - rise)); k.fx.diss = max(k.fx.diss, 1 - sm(0, 0.5, u)); },
    },
  });
  /* END */
})();

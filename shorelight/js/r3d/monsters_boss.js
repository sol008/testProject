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
  // 8×8 cells of 256 px. Tiling cells are painted seamlessly; decal cells (faces, emblems) are used with 0..1 UVs.
  const CELLS = [
    'plain', 'scale', 'bigscale', 'fur', 'cloth', 'stone', 'marble', 'wood',
    'metal', 'wing', 'lamellar', 'skin', 'frond', 'paper', 'weed', 'water',
    'hair', 'belly', 'diamond', 'eye', 'opera', 'lintoface', 'lilyface', 'jewelface',
    'fringe', 'talisman', 'spots', 'reticulate', 'emberspot', 'yong', 'sail', 'feather',
    'flame', 'soul', 'lily', 'leaf', 'cloud', 'rune', 'crack', 'barnacle',
    'ghostface', 'plagueface', 'pirateface', 'ghoulface', 'drownface', 'maw', 'greedface', 'cliffface',
    'eyeball', 'grad', 'bark', 'rope', 'glass', 'tile', 'brick', 'mandala',
    'windmask', 'stars', 'blank', 'ring', 'streak', 'dots', 'mouthO', 'bearface',
  ];
  const CI = {}; CELLS.forEach((n, i) => { CI[n] = i; });
  const AT = 2048, CS = 256;
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
      for (let y = 0; y <= CS; y += 8) { const w = (1 - y / CS) * 0.12 * CS + 6; g.lineTo(CS * 0.5 + w + (y % 16 ? 0 : 5), CS - y); }
      for (let y = CS; y >= 0; y -= 8) { const w = (1 - y / CS) * 0.12 * CS + 6; g.lineTo(CS * 0.5 - w - (y % 16 ? 0 : 5), CS - y); }
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
        const gr = g.createRadialGradient(128, 130, 10, 128, 130, 140); gr.addColorStop(0, '#f2f1ee'); gr.addColorStop(1, '#b7bcc4'); g.fillStyle = gr; g.fillRect(0, 0, CS, CS);
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
        for (const s of [-1, 1]) { g.fillStyle = '#20242e'; g.beginPath(); g.ellipse(128 + s * 40, 118, 20, 26, 0, 0, TAU); g.fill(); g.fillStyle = '#c8e8ff'; g.beginPath(); g.arc(128 + s * 40, 122, 5, 0, TAU); g.fill(); }
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
      g.drawImage(cc, (i % 8) * CS, floor(i / 8) * CS);
    });
    atlasTex = G.R3M.canvasTex(c, {});
    atlasTex.flipY = false; // cell (0,0) = top-left; UVs below use v down
    atlasTex.shared = true;
    atlasTex.needsUpdate = true;
    return atlasTex;
  }
  // cell rect in atlas UV space: [u0, v0, size]
  const cellRect = (name) => { const i = CI[name] != null ? CI[name] : 0; return [(i % 8) / 8, floor(i / 8) / 8, 1 / 8]; };

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
        uniform float uTime, uFlash, uDiss, uOpac, uGlow, uHue, uScroll; uniform vec3 uEdge; uniform vec4 uPsy;
        ${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 mbU = vMapUv + vec2(0.0, uScroll * uTime);
          vec2 mbC = vCell.xy + (0.02 + 0.96 * fract(mbU)) * vCell.z;
          vec4 sampledDiffuseColor = textureGrad(map, mbC, dFdx(mbU) * vCell.z * 0.96, dFdy(mbU) * vCell.z * 0.96);
          diffuseColor *= sampledDiffuseColor;
        #endif`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float mbD = mbF(vObj * 2.6 + vec3(0.0, uTime * 0.05, 0.0));
        if (uDiss > 0.001 && mbD < uDiss * 1.08 - 0.04) discard;
        float mbEdge = uDiss > 0.001 ? 1.0 - smoothstep(0.0, 0.07, mbD - (uDiss * 1.08 - 0.04)) : 0.0;`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mbHue(diffuseColor.rgb, uHue); diffuseColor.a *= uOpac;');
  }
  function makeU() {
    const T = THREE;
    return {
      uTime: UT, uFlash: { value: 0 }, uDiss: { value: 0 }, uOpac: { value: 1 }, uGlow: { value: 1 }, uHue: { value: 0 },
      uScroll: { value: 0 }, uEdge: { value: new T.Color(1.6, 0.9, 0.4) }, uPsy: { value: new T.Vector4(1.6, 6, 0.08, 1) },
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
        totalEmissiveRadiance += uFlash * vec3(1.0, 0.92, 0.85) + mbEdge * uEdge * 3.0;`);
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
    mats.water = basic('W', { transparent: true, depthWrite: false, side: T.DoubleSide }, `
      { vec3 n = normalize(vVN); if (!gl_FrontFacing) n = -n; float fr = 1.0 - abs(dot(n, normalize(vVP)));
        float lt = 0.55 + 0.45 * max(0.0, n.y);
        outgoingLight = outgoingLight * lt + fr * fr * vec3(0.55, 0.85, 1.0) * 0.6;
        diffuseColor.a *= 0.55 + 0.45 * fr; }`);
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
          float f = pow(1.0 - r, 1.6); gl_FragColor = vec4(vC * uK, f * vA * uOpac);
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
      if (o.up) { const up = new V(...o.up); N = up.sub(t.clone().multiplyScalar(up.dot(t))).normalize(); }
      prevN = N;
      const B = new V().crossVectors(t, N).normalize();
      const rad = rf(u);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * TAU, ca = cos(a) * ell[0], sa = sin(a) * ell[1];
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
      for (let j = 0; j < sides; j++) { const a = end * (sides + 1) + j; if (end) ind.push(a, a + 1, ci); else ind.push(a + 1, a, ci); }
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
      this.mats = makeMats(this.U, def);
      this.meshes = {};
      const order = ['body', 'cut', 'glow', 'psy', 'ghost', 'water'];
      for (const k of order) {
        const g = tpl.geos[k]; if (!g) continue;
        const m = new T.SkinnedMesh(g, this.mats[k]);
        m.bind(this.skeleton);
        m.frustumCulled = false;
        m.castShadow = (k === 'body' || (k === 'psy' && def.psyShadow !== false)) && def.shadow !== false;
        m.receiveShadow = k === 'body' || k === 'cut';
        if (k === 'ghost' || k === 'water') m.renderOrder = 2;
        this.rig.add(m); this.meshes[k] = m;
        if (k === 'body' && def.outline !== 0) {
          const ol = G.R3M.outline(m, { width: def.outline || 0.008, color: def.olColor || 0x1a1014 });
          const om = ol.material, prev = om.onBeforeCompile, U = this.U;
          om.onBeforeCompile = (sh, r) => {
            if (prev) prev(sh, r);
            sh.uniforms.uDiss = U.uDiss; sh.uniforms.uOpac = U.uOpac; sh.uniforms.uTime = UT;
            sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
            sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vObj; uniform float uDiss, uOpac, uTime;${GLSL_NOISE}`)
              .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
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
  // ============================================================================ 黑熊精 bear_spirit
  // Formosan black bear spirit: upright, heavy, white V on the chest; teal spirit-cracks glow through its fur.
  defB('bear_spirit', {
    h: 2.7, outline: 0.006, rim: 0.4, rimColor: 0x8ff0e0,
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

})();

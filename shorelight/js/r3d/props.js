// Street & outdoor props (props team A): lanterns, market & street furniture, shrine / tomb pieces, puzzle props.
// Contract: docs/CONTRACTS_3D.md. Everything is procedural: code-built geometry + canvas-painted textures.
//
// How this file is organised
//  - 1 unit = 1 m; origin = footprint centre on the ground; +z = front (south). Every model is finished on all sides.
//  - Colour lives in vertex colours (tint × baked AO) on a small set of shared, textured materials, so a prop made of
//    wood + metal + cloth costs three draw calls after merging, whatever its individual colours are.
//  - Secondary motion runs in the vertex shader: `sway` (rigid pendulum about a per-part pivot: lanterns, tassels,
//    bells) and `wave` (cloth: flags, laundry, valances, capes). Phases come from per-vertex attributes plus the
//    instance's world position, so a whole string of lanterns is still one draw call and no two instances move alike.
//    Single moving parts (chest lid, sky / water lantern float) use plain CPU transforms on a named child.
//  - Flames / embers / steam / sparks are small additive ShaderMaterials driven by the shared uTime uniform.
//  - The 2D defs (G.Objects) stay the source of truth for footprint, variants (same hash as 2D), text and lit state.
'use strict';
(() => {
  const THREE = window.THREE;
  if (!THREE || !G.Models || !G.R3M) return;
  const R3M = G.R3M, Mo = G.Models;
  const PI = Math.PI, TAU = PI * 2;
  const { sin, cos, max, min, abs, round, floor } = Math;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const V2 = (x, y) => new THREE.Vector2(x, y);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const FAM = () => G.FONT_FAMILY || '"Kaiti TC","STKaiti","BiauKai","Noto Serif TC","Songti TC","WenQuanYi Zen Hei",serif';
  const KAI = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px ${FAM()}`;

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hashStr(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  // 2D layout of an object (variant, lit, text … exactly as the 2D art sees it)
  function lay(o) {
    const d = G.Objects.get(o.t);
    let L = null;
    try { L = d && d.layout ? d.layout(o) : null; } catch (e) { L = null; }
    return L || { w: o.w || (d ? d.w : 1), h: o.h || (d ? d.h : 1), v: o.v | 0, lit: o.lit !== false, text: o.text };
  }
  const chars = (s) => [...String(s == null ? '' : s)];

  // =================================================================================================
  // painted textures (cached by key in G.R3M.tex; colour textures are near-white so vertex tints colour them)
  // =================================================================================================
  // Unless stated otherwise a texture tile covers `tile` metres; geometry UVs are authored in metres.
  function TEX(key, w, h, paint, tile, opts) {
    const tx = R3M.tex('ps:' + key, w, h, paint, Object.assign({ wrap: true }, opts));
    if (tile) tx.repeat.set(1 / tile, 1 / (opts && opts.tileV || tile));
    return tx;
  }
  // draw at (x,y) and at wrapped copies so a texture tiles seamlessly
  function wrap(w, h, x, y, r, fn) {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const X = x + dx, Y = y + dy;
      if (X > -r && X < w + r && Y > -r && Y < h + r) fn(X, Y);
    }
  }
  function speckle(g, w, h, r, n, rgb, a0, a1, s0, s1) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(${rgb},${a0 + r() * (a1 - a0)})`;
      const s = s0 + r() * (s1 - s0);
      g.fillRect(r() * w, r() * h, s, s);
    }
  }
  function blotch(g, w, h, r, n, rgb, a, rad0, rad1) {
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h, rad = rad0 + r() * (rad1 - rad0), al = a * (0.4 + r() * 0.6);
      wrap(w, h, x, y, rad, (X, Y) => {
        const gr = g.createRadialGradient(X, Y, 0, X, Y, rad);
        gr.addColorStop(0, `rgba(${rgb},${al})`); gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
      });
    }
  }
  function grainLines(g, w, h, r, n, a0, a1, vertical = true) {
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const p0 = r() * (vertical ? w : h), amp = 1.5 + r() * 6, k = 1 + floor(r() * 3), ph = r() * TAU;
      g.strokeStyle = `rgba(86,56,32,${a0 + r() * (a1 - a0)})`; g.lineWidth = 0.5 + r() * 1.7;
      for (const d of [-(vertical ? w : h), 0, vertical ? w : h]) {
        g.beginPath();
        const L = vertical ? h : w;
        for (let s = 0; s <= L; s += 8) {
          const q = p0 + d + sin(s / L * TAU * k + ph) * amp;
          if (vertical) (s ? g.lineTo(q, s) : g.moveTo(q, s)); else (s ? g.lineTo(s, q) : g.moveTo(s, q));
        }
        g.stroke();
      }
    }
  }
  const TX = {
    // wood grain, grain along v. 512 px = 1 m
    wood: () => TEX('wood', 512, 512, (g, w, h) => {
      const r = rng(11);
      g.fillStyle = '#e2d4bf'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) {
        const x = r() * w, bw = 4 + r() * 34;
        g.fillStyle = r() < 0.55 ? `rgba(110,80,50,${0.05 + r() * 0.09})` : `rgba(255,246,228,${0.05 + r() * 0.08})`;
        wrap(w, h, x, 0, bw + 2, (X) => g.fillRect(X, 0, bw, h));
      }
      grainLines(g, w, h, r, 150, 0.07, 0.28);
      for (let i = 0; i < 4; i++) {
        const x = r() * w, y = r() * h;
        wrap(w, h, x, y, 60, (X, Y) => {
          for (let k = 7; k > 0; k--) { g.strokeStyle = `rgba(80,48,26,${0.1 + 0.05 * k / 7})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(X, Y, 2 + k * 3, 6 + k * 6.5, 0, 0, TAU); g.stroke(); }
          g.fillStyle = 'rgba(60,34,16,0.55)'; g.beginPath(); g.ellipse(X, Y, 3, 6, 0, 0, TAU); g.fill();
        });
      }
      speckle(g, w, h, r, 2600, '60,40,20', 0.03, 0.1, 1, 2);
    }, 1),
    // barrel staves: 16 staves round the circumference (native u), grain along v; tile = 1 m vertically
    staves: () => TEX('staves', 512, 256, (g, w, h) => {
      const r = rng(13);
      g.fillStyle = '#e2d4bf'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 16; k++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,86,52' : '255,240,220'},${0.06 + r() * 0.12})`; g.fillRect(k * w / 16, 0, w / 16, h); }
      grainLines(g, w, h, r, 120, 0.06, 0.22);
      for (let k = 0; k < 16; k++) { const x = k * w / 16; g.fillStyle = 'rgba(40,22,10,0.75)'; g.fillRect(x - 1, 0, 2.4, h); g.fillStyle = 'rgba(255,240,220,0.25)'; g.fillRect(x + 1.4, 0, 1.2, h); }
      speckle(g, w, h, r, 1200, '60,40,20', 0.03, 0.1, 1, 2);
    }, 0),
    // granite: speckles, soft weathering blotches, hairline cracks. 512 px = 1 m
    stone: () => TEX('stone', 512, 512, (g, w, h) => {
      const r = rng(21);
      g.fillStyle = '#d8d4ca'; g.fillRect(0, 0, w, h);
      blotch(g, w, h, r, 28, '70,66,58', 0.16, 30, 110);
      blotch(g, w, h, r, 18, '255,252,240', 0.14, 20, 80);
      blotch(g, w, h, r, 10, '96,110,70', 0.1, 20, 70); // lichen
      speckle(g, w, h, r, 9000, '52,50,46', 0.25, 0.6, 1, 2.2);
      speckle(g, w, h, r, 4000, '250,248,240', 0.25, 0.6, 1, 2);
      speckle(g, w, h, r, 1500, '150,110,80', 0.2, 0.4, 1, 2);
      g.strokeStyle = 'rgba(40,38,34,0.35)'; g.lineWidth = 0.8;
      for (let i = 0; i < 6; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += r() * 18; g.lineTo(x, y); } g.stroke(); }
    }, 1),
    // bronze / brass / iron: mottling, verdigris, scratches. 256 px = 0.5 m
    metal: () => TEX('metal', 256, 256, (g, w, h) => {
      const r = rng(31);
      g.fillStyle = '#ddd6c6'; g.fillRect(0, 0, w, h);
      blotch(g, w, h, r, 30, '70,60,44', 0.22, 10, 50);
      blotch(g, w, h, r, 14, '255,250,235', 0.2, 8, 30);
      blotch(g, w, h, r, 12, '80,150,120', 0.22, 6, 26);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 0.6;
      for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, a = r() * TAU, l = 4 + r() * 16; g.beginPath(); g.moveTo(x, y); g.lineTo(x + cos(a) * l, y + sin(a) * l); g.stroke(); }
      speckle(g, w, h, r, 1600, '40,34,24', 0.1, 0.3, 1, 1.6);
    }, 0.5),
    // plain-weave cloth with slubs. 256 px = 0.5 m
    cloth: () => TEX('cloth', 256, 256, (g, w, h) => {
      const r = rng(41);
      g.fillStyle = '#efe9de'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; g.fillRect(0, y, w, 1); }
      for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.06})`; g.fillRect(x, 0, 1, h); }
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(80,60,40,${0.05 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 8 + r() * 30, 1.2); }
      blotch(g, w, h, r, 10, '90,70,50', 0.07, 20, 60);
    }, 0.5),
    // lacquer: smooth, faint brush streaks and wear. 256 px = 1 m
    lacquer: () => TEX('lacquer', 256, 256, (g, w, h) => {
      const r = rng(51);
      g.fillStyle = '#ece6e0'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.025 + r() * 0.04})`; g.fillRect(0, r() * h, w, 1 + r() * 3); }
      blotch(g, w, h, r, 16, '255,245,230', 0.1, 10, 40);
      blotch(g, w, h, r, 12, '40,20,10', 0.12, 10, 40);
      speckle(g, w, h, r, 500, '30,20,10', 0.1, 0.3, 1, 1.5);
    }, 1),
    // bamboo: fibres along v, three nodes per metre (native u around, v in metres)
    bamboo: () => TEX('bamboo', 128, 512, (g, w, h) => {
      const r = rng(61);
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#d8d4b4'); gr.addColorStop(0.35, '#f4f2dc'); gr.addColorStop(0.7, '#e0dcbc'); gr.addColorStop(1, '#d8d4b4');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(90,90,40,${0.05 + r() * 0.1})`; g.fillRect(r() * w, 0, 0.8, h); }
      blotch(g, w, h, r, 14, '120,100,50', 0.12, 8, 30);
      for (let k = 0; k < 3; k++) {
        const y = (k + 0.5) * h / 3;
        g.fillStyle = 'rgba(70,64,26,0.65)'; g.fillRect(0, y - 3, w, 4);
        g.fillStyle = 'rgba(255,255,230,0.55)'; g.fillRect(0, y + 1, w, 2.5);
        g.fillStyle = 'rgba(70,64,26,0.25)'; g.fillRect(0, y - 12, w, 9);
      }
    }, 0, { tileV: 1 }),
    // basket weave (bamboo strips over-under). 256 px = 0.25 m
    weave: () => TEX('weave', 256, 256, (g, w, h) => {
      const r = rng(71);
      g.fillStyle = '#5a4428'; g.fillRect(0, 0, w, h);
      const s = 16;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
        const hor = ((x + y) / s) % 2 === 0;
        const gr = hor ? g.createLinearGradient(0, y, 0, y + s) : g.createLinearGradient(x, 0, x + s, 0);
        gr.addColorStop(0, '#b8a27a'); gr.addColorStop(0.5, '#f2e6c8'); gr.addColorStop(1, '#a08860');
        g.fillStyle = gr; g.fillRect(x + 0.8, y + 0.8, s - 1.6, s - 1.6);
        g.fillStyle = `rgba(80,60,30,${r() * 0.15})`; g.fillRect(x + 1, y + 1, s - 2, s - 2);
      }
    }, 0.25),
    // glazed stoneware: glossy drips down from the shoulder (native u, v 0..1 over the jar)
    ceramic: () => TEX('ceramic', 256, 256, (g, w, h) => {
      const r = rng(81);
      g.fillStyle = '#e8e2da'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(40,20,10,0.25)'); gr.addColorStop(0.45, 'rgba(40,20,10,0)'); gr.addColorStop(0.85, 'rgba(255,240,220,0)'); gr.addColorStop(1, 'rgba(255,236,210,0.35)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      blotch(g, w, h, r, 14, '255,240,220', 0.12, 10, 40);
      for (let i = 0; i < 16; i++) { const x = r() * w, l = h * (0.2 + r() * 0.35), ww = 4 + r() * 10; g.fillStyle = `rgba(30,14,6,${0.05 + r() * 0.07})`; wrap(w, h, x, 0, ww, (X) => { g.fillRect(X, 0, ww, l); g.beginPath(); g.arc(X + ww / 2, l, ww / 2, 0, PI); g.fill(); }); }
      g.fillStyle = 'rgba(255,240,220,0.5)'; g.fillRect(0, h * 0.86, w, 2);
      speckle(g, w, h, r, 900, '40,20,10', 0.1, 0.35, 1, 2);
    }, 0),
    // packed soil + grass (graves, mounds). 256 px = 1 m
    turf: () => TEX('turf', 256, 256, (g, w, h) => {
      const r = rng(91);
      g.fillStyle = '#8fa86a'; g.fillRect(0, 0, w, h);
      blotch(g, w, h, r, 20, '120,96,60', 0.35, 10, 40);
      blotch(g, w, h, r, 20, '60,90,40', 0.3, 10, 40);
      for (let i = 0; i < 2200; i++) { const x = r() * w, y = r() * h; g.strokeStyle = `rgba(${r() < 0.5 ? '40,70,30' : '200,220,140'},${0.25 + r() * 0.35})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 5); g.stroke(); }
    }, 1),
  };

  // --------------------------------------------------------------- calligraphy
  // Brush-ink text: ink bleed (blur), pressure double-strike, and dry-brush streaks erased on an offscreen layer.
  function ink(g, text, cx, cy, size, color, o = {}) {
    const cs = chars(text);
    if (!cs.length) return;
    const vertical = o.vertical !== false, step = size * (o.spacing || 1.06);
    const n = cs.length;
    const W = vertical ? size * 1.6 : size * (n + 0.6) * (o.spacing || 1.06), H = vertical ? size * (n + 0.6) * (o.spacing || 1.06) : size * 1.6;
    const c = document.createElement('canvas'); c.width = Math.ceil(W); c.height = Math.ceil(H);
    const t = c.getContext('2d'); const r = rng(hashStr(text) + (size | 0));
    t.font = KAI(size, o.bold !== false); t.textAlign = 'center'; t.textBaseline = 'middle';
    t.fillStyle = color; t.shadowColor = color; t.shadowBlur = size * 0.05;
    cs.forEach((ch, i) => {
      const x = vertical ? W / 2 : W / 2 + (i - (n - 1) / 2) * step, y = vertical ? H / 2 + (i - (n - 1) / 2) * step : H / 2;
      t.fillText(ch, x, y);
      t.globalAlpha = 0.4; t.fillText(ch, x + size * 0.015, y + size * 0.012); t.globalAlpha = 1;
    });
    t.shadowBlur = 0;
    if (o.dry !== false) { // dry-brush streaks
      t.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < n * 7; i++) {
        t.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.5})`; t.lineWidth = 0.6 + r() * size * 0.025;
        const x = r() * W, y = r() * H, a = (vertical ? -0.35 : 0.2) + (r() - 0.5) * 0.4, l = size * (0.15 + r() * 0.35);
        t.beginPath(); t.moveTo(x, y); t.lineTo(x + cos(a) * l, y + sin(a) * l); t.stroke();
      }
      t.globalCompositeOperation = 'source-over';
    }
    if (o.shadow) { g.save(); g.globalAlpha = 0.5; g.filter = 'blur(1px)'; g.drawImage(c, cx - W / 2 + size * 0.04, cy - H / 2 + size * 0.05); g.restore(); }
    g.drawImage(c, cx - W / 2, cy - H / 2);
  }
  // fit a vertical column of text into a box
  function inkFit(g, text, cx, cy, boxW, boxH, color, o = {}) {
    const n = max(1, chars(text).length);
    const size = min(boxW * 0.92, boxH / (n * (o.spacing || 1.06) + 0.1), o.max || 999);
    ink(g, text, cx, cy, size, color, o);
    return size;
  }

  // =================================================================================================
  // materials
  // =================================================================================================
  const MC = new Map();
  const cached = (key, make) => { if (!MC.has(key)) MC.set(key, make()); return MC.get(key); };
  const U = () => R3M.cutUniforms();
  function env(p) { return R3M.env(Object.assign({ color: 0xffffff, vertexColors: true }, p)); }

  // chain a shader patch after whatever onBeforeCompile the material already has (cutout)
  function patch(mat, tag, fn) {
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey;
    mat.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); fn(sh); };
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|' + tag; };
    return mat;
  }
  // emissive × vertex colour, so one glowing paper material serves every lantern colour
  function vcEmit(mat) {
    return patch(mat, 'vce', (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\n totalEmissiveRadiance *= vColor.rgb;\n#endif');
    });
  }
  const SWAY_GLSL = `
    uniform float uTime; attribute vec4 aSway;
    vec2 psRot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
    vec3 psSway(vec3 p, bool isNormal) {
      if (aSway.w < -0.5) return p;
      float ip = modelMatrix[3][0] * 0.91 + modelMatrix[3][2] * 1.37;
      float az = 0.085 * sin(uTime * 1.35 + aSway.w + ip) + 0.03 * sin(uTime * 2.9 + aSway.w * 2.3);
      float ax = 0.06 * sin(uTime * 1.07 + aSway.w * 1.7 + ip * 0.7);
      vec3 d = isNormal ? p : p - aSway.xyz;
      d.xy = psRot(d.xy, az); d.yz = psRot(d.yz, ax);
      return isNormal ? d : aSway.xyz + d;
    }`;
  // aWave = (weight 0..1, phase, amplitude m). Displacement along object-space z (all cloth is authored in x-y).
  const WAVE_GLSL = `
    uniform float uTime; attribute vec3 aWave;
    float psWaveArg(vec3 p) { float ip = modelMatrix[3][0] * 1.13 + modelMatrix[3][2] * 0.71; return uTime * 2.7 - aWave.x * 4.2 + aWave.y + ip + p.y * 0.9; }
    vec3 psWave(vec3 p) {
      float a = psWaveArg(p);
      float d = aWave.z * aWave.x * (sin(a) + 0.35 * sin(a * 2.3 + 1.7));
      return p + vec3(-abs(d) * 0.18, 0.0, d);
    }
    vec3 psWaveN(vec3 n, vec3 p) {
      float a = psWaveArg(p);
      float dd = aWave.z * (sin(a) - aWave.x * 4.2 * cos(a)) * 0.9;
      return normalize(n + vec3(-dd, 0.0, 0.0) * sign(n.z + 1e-4));
    }`;
  function animate(mat, kind) {
    if (!kind) return mat;
    return patch(mat, kind, (sh) => {
      sh.uniforms.uTime = U().uTime;
      if (kind === 'sway') {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SWAY_GLSL)
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = psSway(objectNormal, true);')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = psSway(transformed, false);');
      } else {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WAVE_GLSL)
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = psWaveN(objectNormal, position);')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = psWave(transformed);');
      }
    });
  }
  const anyKey = (k, anim) => k + (anim ? '|' + anim : '');
  // base library materials: wood, stone, metal, cloth, lacquer, bamboo, weave, ceramic, turf, plain, water
  const BASE = {
    wood: () => ({ map: TX.wood(), roughness: 0.82 }),
    staves: () => ({ map: TX.staves(), roughness: 0.8, side: THREE.DoubleSide }),
    stone: () => ({ map: TX.stone(), roughness: 0.93 }),
    metal: () => ({ map: TX.metal(), roughness: 0.42, metalness: 0.62 }),
    cloth: () => ({ map: TX.cloth(), roughness: 0.96, side: THREE.DoubleSide }),
    lacquer: () => ({ map: TX.lacquer(), roughness: 0.36 }),
    bamboo: () => ({ map: TX.bamboo(), roughness: 0.55 }),
    weave: () => ({ map: TX.weave(), roughness: 0.85, side: THREE.DoubleSide }),
    ceramic: () => ({ map: TX.ceramic(), roughness: 0.28, side: THREE.DoubleSide }),
    turf: () => ({ map: TX.turf(), roughness: 1 }),
    plain: () => ({ roughness: 0.55 }),
    water: () => ({ roughness: 0.06, metalness: 0.1 }),
  };
  function MAT(kind, anim) {
    return cached(anyKey(kind, anim), () => animate(env(BASE[kind]()), anim));
  }
  // emissive paper / glass (vertex colour tints both diffuse and glow). tex = texture or null; i = intensity
  function GLOW(key, tex, i, anim, extra) {
    return cached(anyKey('glow:' + key + ':' + i, anim), () => animate(vcEmit(env(Object.assign({
      map: tex || null, emissiveMap: tex || null, emissive: new THREE.Color('#ffd6a0'), emissiveIntensity: i, roughness: 0.7,
    }, extra || {}))), anim));
  }
  // textured (non-library) material, e.g. a signboard with its own calligraphy
  function TMAT(key, tex, p, anim) {
    return cached(anyKey('t:' + key, anim), () => animate(env(Object.assign({ map: tex, roughness: 0.8 }, p || {})), anim));
  }

  // ---------------------------------------------------------------- flames, embers, particles (additive shaders)
  const NOTONE = '';
  function flameMat(kind) {
    const P = { warm: ['#fff6d8', '#ffb43c', '#e8461a', 2.6], pale: ['#ffffff', '#ffe6a8', '#ffb060', 2.0], blue: ['#e8fbff', '#5ab8ff', '#2a50e0', 2.4], spirit: ['#f0fff8', '#7ff0c8', '#2a9a8a', 2.2] }[kind] || null;
    return cached('flame:' + kind, () => new THREE.ShaderMaterial({
      uniforms: { uTime: U().uTime, uC1: { value: new THREE.Color(P[0]) }, uC2: { value: new THREE.Color(P[1]) }, uC3: { value: new THREE.Color(P[2]) }, uI: { value: P[3] } },
      vertexShader: `
        uniform float uTime; varying float vH; varying float vF; varying float vSeed;
        void main() {
          vec3 p = position; float h = uv.y; vH = h;
          float seed = color.r * 37.0 + modelMatrix[3][0] * 3.1 + modelMatrix[3][2] * 1.7;
          vSeed = seed;
          float sp = 0.6 + color.g;
          float sx = sin(uTime * 9.0 * sp + seed + h * 4.0) * 0.05 + sin(uTime * 15.0 * sp + seed * 1.7 + h * 7.0) * 0.025;
          float sz = cos(uTime * 7.3 * sp + seed * 0.7 + h * 3.0) * 0.04;
          float tall = 0.82 + 0.18 * sin(uTime * 11.0 * sp + seed * 2.1) + 0.08 * sin(uTime * 23.0 + seed);
          p.y += (tall - 1.0) * h * color.b; p.x += sx * h * h * color.b * 2.2; p.z += sz * h * h * color.b * 2.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vec3 n = normalize(normalMatrix * normal);
          vF = abs(dot(n, normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uC1, uC2, uC3; uniform float uI; uniform float uTime; varying float vH; varying float vF; varying float vSeed;
        void main() {
          float core = smoothstep(0.35, 0.95, vF) * (1.0 - smoothstep(0.2, 0.75, vH));
          vec3 col = mix(uC3, uC2, smoothstep(0.0, 0.6, vF));
          col = mix(col, uC1, core);
          float flick = 0.85 + 0.15 * sin(uTime * 17.0 + vSeed);
          float a = pow(vF, 1.3) * (1.0 - smoothstep(0.5, 1.0, vH)) * smoothstep(0.0, 0.08, vH + 0.04);
          gl_FragColor = vec4(col * uI * flick * a, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
  }
  // particles (sparks / steam / motes): positions are computed in the shader from per-point seeds
  // attribute: position = emitter-local origin, color = (seed, speed, size)
  function partMat(kind) {
    const P = {
      sparks: { col: '#ffc46a', rise: 1.6, spread: 0.18, life: 1.4, size: 0.035, add: true, i: 2.5, curl: 0.4 },
      steam: { col: '#ffffff', rise: 0.55, spread: 0.12, life: 2.6, size: 0.32, add: false, i: 0.32, curl: 0.25 },
      motes: { col: '#bfeaff', rise: 0.0, spread: 0.12, life: 3.0, size: 0.03, add: true, i: 2.0, curl: 1.0 },
      wisps: { col: '#9ff0d0', rise: 0.25, spread: 0.3, life: 3.5, size: 0.05, add: true, i: 1.6, curl: 0.8 },
    }[kind];
    return cached('part:' + kind, () => new THREE.ShaderMaterial({
      uniforms: { uTime: U().uTime, uCol: { value: new THREE.Color(P.col) }, uRes: U().uResolution },
      defines: { RISE: P.rise.toFixed(3), SPREAD: P.spread.toFixed(3), LIFE: P.life.toFixed(3), SIZE: P.size.toFixed(3), INT: P.i.toFixed(3), CURL: P.curl.toFixed(3), ORBIT: kind === 'motes' ? 1 : 0, SOFT: P.add ? 0 : 1 },
      vertexShader: `
        uniform float uTime; uniform vec2 uRes; varying float vA;
        void main() {
          float seed = color.r * 91.0 + modelMatrix[3][0] * 2.3 + modelMatrix[3][2] * 1.9;
          float life = fract(uTime / (LIFE * (0.7 + color.g * 0.6)) + color.r * 13.7);
          vec3 p = position;
          #if ORBIT == 1
            float a = uTime * (0.8 + color.g) + seed;
            p += vec3(cos(a) * SPREAD, sin(uTime * 1.3 + seed) * 0.05, sin(a) * SPREAD * 0.8);
            vA = 0.6 + 0.4 * sin(uTime * 4.0 + seed);
          #else
            p.y += life * RISE;
            p.x += sin(seed * 3.1 + life * 6.0 * CURL) * SPREAD * (0.3 + life);
            p.z += cos(seed * 1.7 + life * 5.0 * CURL) * SPREAD * (0.3 + life);
            vA = sin(life * 3.14159) * (1.0 - life * 0.3);
          #endif
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float s = SIZE * (0.6 + color.b * 0.8);
          #if SOFT == 1
            s *= 0.5 + life;
          #endif
          gl_PointSize = s * uRes.y * 1.3 / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uCol; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
          float a = (1.0 - smoothstep(0.2, 1.0, r)) * vA;
          if (a < 0.003) discard;
          #if SOFT == 1
            gl_FragColor = vec4(uCol * INT, a * INT);
          #else
            gl_FragColor = vec4(uCol * INT * a, a);
          #endif
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      vertexColors: true, transparent: true, depthWrite: false, blending: P.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
  }
  function particles(kind, n, x, y, z, seed = 1) {
    const r = rng(seed * 977 + n);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = x + (r() - 0.5) * 0.06; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z + (r() - 0.5) * 0.06;
      col[i * 3] = r(); col[i * 3 + 1] = r(); col[i * 3 + 2] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.boundingSphere = new THREE.Sphere(V3(x, y + 0.5, z), 1.2);
    const pts = new THREE.Points(geo, partMat(kind));
    pts.frustumCulled = true; pts.castShadow = false; pts.receiveShadow = false; pts.renderOrder = 3;
    pts.userData.noMerge = true;
    return pts;
  }

  // =================================================================================================
  // geometry helpers (UVs in metres unless noted)
  // =================================================================================================
  // box projection UVs: each vertex uses the plane of its dominant normal axis; `grain` axis maps to v
  function projUV(geo, grain = 'y') {
    const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
    const gi = { x: 0, y: 1, z: 2 }[grain];
    for (let i = 0; i < p.count; i++) {
      const c = [p.getX(i), p.getY(i), p.getZ(i)], a = [abs(n.getX(i)), abs(n.getY(i)), abs(n.getZ(i))];
      const d = a[0] > a[1] && a[0] > a[2] ? 0 : a[1] > a[2] ? 1 : 2;
      let t = d === 0 ? [2, 1] : d === 1 ? [0, 2] : [0, 1];
      if (t[0] === gi) t = [t[1], t[0]];
      uv[i * 2] = c[t[0]]; uv[i * 2 + 1] = c[t[1]];
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }
  function scaleUV(geo, su, sv) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geo;
  }
  // remap the 6 faces of a BoxGeometry to cells of a horizontal texture atlas (cells: [px,nx,py,ny,pz,nz] → index)
  function atlasBox(geo, cells, n) {
    const uv = geo.attributes.uv;
    const per = uv.count / 6;
    for (let f = 0; f < 6; f++) for (let k = 0; k < per; k++) {
      const i = f * per + k;
      uv.setX(i, (cells[f] + uv.getX(i)) / n);
    }
    return geo;
  }
  const G3 = {
    box(w, h, d, grain) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return projUV(g, grain); },
    cbox(w, h, d, grain) { return projUV(new THREE.BoxGeometry(w, h, d), grain); }, // centred
    rbox(w, h, d, r, grain) { const g = new THREE.RoundedBoxGeometry(w, h, d, 1, min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); g.translate(0, h / 2, 0); return projUV(g, grain); },
    rbox2(w, h, d, r, grain) { const g = new THREE.RoundedBoxGeometry(w, h, d, 2, min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); g.translate(0, h / 2, 0); return projUV(g, grain); },
    cyl(rt, rb, h, seg = 12, open = false, uvMode) {
      const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(0, h / 2, 0);
      return uvMode === 'native' ? g : scaleUV(g, TAU * max(rt, rb), h);
    },
    // centred cylinder lying along x
    rod(r, len, seg = 8) { const g = new THREE.CylinderGeometry(r, r, len, seg, 1); g.rotateZ(PI / 2); return scaleUV(g, TAU * r, len); },
    sphere(r, ws = 12, hs = 8) { const g = new THREE.SphereGeometry(r, ws, hs); return scaleUV(g, TAU * r, PI * r); },
    lathe(pts, seg = 16, uvMode) {
      const v = pts.map((p) => V2(max(0, p[0]), p[1]));
      const g = new THREE.LatheGeometry(v, seg);
      if (uvMode === 'native') return g;
      let len = 0; for (let i = 1; i < v.length; i++) len += v[i].distanceTo(v[i - 1]);
      return scaleUV(g, TAU * max(...pts.map((p) => p[0])), len);
    },
    torus(R, r, rs = 6, ts = 16, arc = TAU) { const g = new THREE.TorusGeometry(R, r, rs, ts, arc); return scaleUV(g, TAU * R, TAU * r); },
    tube(points, r, seg = 16, rs = 5) { const c = new THREE.CatmullRomCurve3(points); const g = new THREE.TubeGeometry(c, seg, r, rs, false); return scaleUV(g, c.getLength(), TAU * r); },
    plane(w, h, sx = 1, sy = 1) { return new THREE.PlaneGeometry(w, h, sx, sy); },
    // ring-loft: rings[i] = array of [x,y,z]; equal counts; optional caps at the first/last ring. u = ring fraction, v = i fraction
    loft(rings, capStart, capEnd) {
      const N = rings.length, M = rings[0].length;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i < N; i++) for (let j = 0; j <= M; j++) { const p = rings[i][j % M]; pos.push(p[0], p[1], p[2]); uv.push(j / M, i / (N - 1)); }
      for (let i = 0; i < N - 1; i++) for (let j = 0; j < M; j++) {
        const a = i * (M + 1) + j, b = a + M + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
      const cap = (ring, flip) => {
        const c = [0, 0, 0]; for (const p of ring) for (let k = 0; k < 3; k++) c[k] += p[k] / M;
        const base = pos.length / 3; pos.push(c[0], c[1], c[2]); uv.push(0.5, 0.5);
        for (let j = 0; j < M; j++) { const p = ring[j]; pos.push(p[0], p[1], p[2]); uv.push(0.5 + 0.5 * cos(j / M * TAU), 0.5 + 0.5 * sin(j / M * TAU)); }
        for (let j = 0; j < M; j++) { const a = base + 1 + j, b = base + 1 + (j + 1) % M; flip ? idx.push(base, b, a) : idx.push(base, a, b); }
      };
      if (capStart) cap(rings[0], capStart === 'flip');
      if (capEnd) cap(rings[N - 1], capEnd !== 'flip');
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    },
    flat(g) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; },
  };
  // superellipse ring (rounded square): faces centred on ±x / ±z, starting at a corner so face centres sit at u = 1/8, 3/8 …
  function sqRing(hw, hd, y, M = 16, p = 5) {
    const out = [];
    for (let j = 0; j < M; j++) {
      const a = -PI / 4 + j / M * TAU; // start at the front-left corner; u grows toward +x
      const c = cos(a), s = sin(a);
      const k = 1 / Math.pow(Math.pow(abs(c), p) + Math.pow(abs(s), p), 1 / p);
      out.push([s * k * hw, y, c * k * hd]);
    }
    return out;
  }

  // =================================================================================================
  // mesh assembly, baked vertex colour (tint × AO), merge-by-material with animation attributes
  // =================================================================================================
  // o: p [x,y,z], r [rx,ry,rz], s scalar|[x,y,z], c tint, ao (multiplier), grad [bottom, top] (local gradient),
  //    sway [px,py,pz,phase] (pivot in model space), wave {axis:'x'|'y', from, to, amp, ph} (weight along axis), vc raw colour
  function mk(g, geo, mat, o = {}) {
    const m = new THREE.Mesh(geo, mat);
    if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
    if (o.r) m.rotation.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0, o.ro || 'XYZ');
    if (o.s != null) { if (Array.isArray(o.s)) m.scale.set(o.s[0], o.s[1], o.s[2]); else m.scale.setScalar(o.s); }
    const u = m.userData;
    u.tint = o.c; u.ao = o.ao; u.grad = o.grad; u.sway = o.sway; u.wave = o.wave; u.vc = o.vc; u.top = o.top; u.noAO = o.noAO;
    m.castShadow = o.cast !== false; m.receiveShadow = true;
    if (g) g.add(m);
    return m;
  }
  const _c = new THREE.Color(), _t = new THREE.Color(), _top = new THREE.Color();
  // bake(group, opts) → new Group of merged meshes. opts.ao: floor darkening (0..1), opts.aoH: height of the AO ramp,
  // opts.floor: y of the "ground" for the AO ramp (e.g. the bottom of a hanging part)
  function bake(group, opts = {}) {
    const aoK = opts.ao != null ? opts.ao : 0.42, aoH = opts.aoH || 0.45, fy = opts.floor || 0;
    group.updateMatrixWorld(true);
    const buckets = new Map();
    const keep = [];
    group.traverse((m) => {
      if (m.isPoints || (m.isMesh && m.userData.noMerge)) { keep.push(m); return; }
      if (!m.isMesh) return;
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      // local gradient (before transform)
      const ud = m.userData;
      let gy0 = 0, gy1 = 1;
      if (ud.grad) { g.computeBoundingBox(); gy0 = g.boundingBox.min.y; gy1 = g.boundingBox.max.y; }
      const ly = ud.grad ? Float32Array.from({ length: g.attributes.position.count }, (_, i) => g.attributes.position.getY(i)) : null;
      g.applyMatrix4(m.matrixWorld);
      const P = g.attributes.position, N = g.attributes.normal, n = P.count;
      const col = new Float32Array(n * 3);
      const old = g.attributes.color;
      _t.set(ud.tint || '#ffffff');
      if (ud.top) _top.set(ud.top[0]);
      for (let i = 0; i < n; i++) {
        if (ud.vc) { col[i * 3] = ud.vc[0]; col[i * 3 + 1] = ud.vc[1]; col[i * 3 + 2] = ud.vc[2]; continue; }
        _c.copy(_t);
        if (ud.top && N.getY(i) > 0.55) _c.lerp(_top, ud.top[1]);
        let f = ud.ao != null ? ud.ao : 1;
        if (!ud.noAO) {
          const y = P.getY(i) - fy;
          f *= 1 - aoK * (1 - sstep(0, aoH, y));
          if (N.getY(i) < -0.5) f *= 0.78;
        }
        if (ud.grad) f *= lerp(ud.grad[0], ud.grad[1], clamp((ly[i] - gy0) / max(1e-5, gy1 - gy0), 0, 1));
        if (old) _c.multiply(_c.clone().setRGB(old.getX(i), old.getY(i), old.getZ(i)));
        col[i * 3] = _c.r * f; col[i * 3 + 1] = _c.g * f; col[i * 3 + 2] = _c.b * f;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (ud.sway) {
        const a = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) a.set(ud.sway, i * 4);
        g.setAttribute('aSway', new THREE.BufferAttribute(a, 4));
      }
      if (ud.wave) {
        const w = ud.wave, ax = w.axis === 'x' ? 0 : w.axis === 'z' ? 2 : 1;
        const a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const c = ax === 0 ? P.getX(i) : ax === 1 ? P.getY(i) : P.getZ(i);
          const wt = Math.pow(clamp((c - w.from) / (w.to - w.from), 0, 1), w.pow || 1);
          a[i * 3] = wt; a[i * 3 + 1] = w.ph || 0; a[i * 3 + 2] = w.amp;
        }
        g.setAttribute('aWave', new THREE.BufferAttribute(a, 3));
      }
      const k = m.material.uuid; // one bucket per material (a non-casting sliver is not worth a draw call)
      if (!buckets.has(k)) buckets.set(k, { mat: m.material, cast: false, geos: [] });
      const bk = buckets.get(k); bk.cast = bk.cast || m.castShadow; bk.geos.push(g);
    });
    const out = new THREE.Group();
    for (const b of buckets.values()) {
      const need = (name, size, fill) => {
        if (!b.geos.some((g) => g.attributes[name])) return;
        for (const g of b.geos) if (!g.attributes[name]) {
          const a = new Float32Array(g.attributes.position.count * size);
          for (let i = 0; i < a.length; i += size) for (let k = 0; k < size; k++) a[i + k] = fill[k];
          g.setAttribute(name, new THREE.BufferAttribute(a, size));
        }
      };
      need('aSway', 4, [0, 0, 0, -1]); need('aWave', 3, [0, 0, 0]);
      const merged = THREE.BufferGeometryUtils.mergeGeometries(b.geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      if (merged.attributes.aSway || merged.attributes.aWave) merged.boundingSphere.radius += 0.3;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = true;
      if (b.mat.transparent) mesh.renderOrder = 2;
      if (b.mat.alphaTest > 0 && b.mat.map) mesh.customDepthMaterial = depthFor(b.mat);
      if (b.mat.isShaderMaterial) { mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = 3; }
      out.add(mesh);
    }
    for (const p of keep) { p.updateMatrixWorld(true); const c = p.clone(); c.matrixAutoUpdate = false; c.matrix.copy(p.matrixWorld); out.add(c); }
    return out;
  }
  function depthFor(mat) {
    return cached('depth:' + mat.uuid, () => new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: mat.alphaTest }));
  }
  // build helper: a named sub-assembly baked on its own (e.g. a chest lid, a floating lantern) and placed at a pivot
  function part(name, pivot, fill, opts) {
    const tmp = new THREE.Group();
    fill(tmp);
    const baked = bake(tmp, opts);
    const holder = new THREE.Group();
    holder.name = name;
    holder.position.set(pivot[0], pivot[1], pivot[2]);
    // geometry was authored in model space: shift it so the holder's origin is the pivot
    for (const c of baked.children) c.position.sub(holder.position);
    holder.add(baked);
    return holder;
  }
  // per-instance phase from the instance's placement (works for the viewer and for Map3D holders)
  function seedOf(node) {
    const p = node.parent ? node.parent.position : node.position;
    return (p.x * 12.9898 + p.z * 78.233) % TAU;
  }
  function tick(t) { const u = U().uTime; if (u.value !== t) u.value = t; }

  // =================================================================================================
  // shared sub-builders
  // =================================================================================================
  // ----- paper lantern 燈籠: ribbed oval body, lacquered caps with gold rims, knot + tassel, hanging cord
  const LANTERN_RIBS = 14;
  function lanternTex(glyph, rib = '#7a2a18') {
    return TEX('lantern:' + (glyph || '') + rib, 256, 256, (g, w, h) => {
      const r = rng(hashStr(glyph || 'x'));
      g.fillStyle = '#fff6ea'; g.fillRect(0, 0, w, h);
      // paper fibres + slight unevenness
      for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(150,90,60,${0.03 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 1 + r() * 6, 1); }
      // gradient: darker near the caps (the ribs gather there)
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(60,10,0,0.45)'); gr.addColorStop(0.18, 'rgba(60,10,0,0)'); gr.addColorStop(0.82, 'rgba(60,10,0,0)'); gr.addColorStop(1, 'rgba(60,10,0,0.45)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // horizontal bamboo ribs
      for (let k = 1; k < LANTERN_RIBS; k++) {
        const y = k / LANTERN_RIBS * h;
        g.fillStyle = rib; g.globalAlpha = 0.5; g.fillRect(0, y - 1, w, 2); g.globalAlpha = 0.25; g.fillStyle = '#fff'; g.fillRect(0, y + 1, w, 1); g.globalAlpha = 1;
      }
      // vertical paper seams
      for (let k = 0; k < 8; k++) { g.fillStyle = 'rgba(90,30,10,0.12)'; g.fillRect(k * w / 8, 0, 1.5, h); }
      if (glyph) for (const x of [0, w / 2, w]) ink(g, glyph, x, h * 0.52, h * 0.42, '#1a0a06', { dry: true });
    }, 0, { wrap: true });
  }
  // adds a lantern to group g. o: { x, y (centre), z, R, H, col, glyph, lit, pivot [x,y,z], ph, tassel }
  function addLantern(g, o) {
    const sway = o.static ? undefined : [o.pivot[0], o.pivot[1], o.pivot[2], o.ph || 0];
    const anim = o.static ? '' : 'sway';
    const R = o.R, H = o.H, x = o.x, y = o.y, z = o.z || 0;
    const pts = [];
    for (let j = 0; j <= 10; j++) { const a = -PI / 2 + PI * j / 10; pts.push([max(R * 0.5, cos(a) * R), sin(a) * H / 2]); }
    const lit = o.lit !== false;
    mk(g, G3.lathe(pts, LANTERN_RIBS, 'native'), GLOW('lantern:' + (o.glyph || ''), lanternTex(o.glyph), lit ? 1.7 : 0.05, anim),
      { p: [x, y, z], c: o.col || '#d42f25', sway, noAO: true, grad: [0.85, 1.05] });
    const plain = MAT('plain', anim);
    const cr = R * 0.52, ch = H * 0.1;
    for (const s of [1, -1]) {
      const cy = s > 0 ? y + H / 2 - 0.01 : y - H / 2 - ch + 0.01;
      mk(g, G3.cyl(cr, cr * 1.06, ch, 10), plain, { p: [x, cy, z], c: '#1e1612', sway, noAO: true });
      mk(g, G3.cyl(cr * 1.1, cr * 1.1, 0.012, 10, true), plain, { p: [x, s > 0 ? cy : cy + ch - 0.012, z], c: '#d6a43c', sway, noAO: true });
    }
    // hook cord up to the pivot
    const top = y + H / 2 + ch;
    if (o.pivot[1] > top) mk(g, G3.cyl(0.006, 0.006, o.pivot[1] - top, 4), plain, { p: [x, top, z], c: '#2a1a10', sway, noAO: true, cast: false });
    // knot + tassel 流蘇
    if (o.tassel !== false) {
      const by = y - H / 2 - ch;
      mk(g, G3.sphere(R * 0.13, 6, 4), plain, { p: [x, by - R * 0.1, z], c: '#e0b040', sway, noAO: true });
      const tl = H * 0.55;
      mk(g, G3.cyl(R * 0.05, R * 0.2, tl, 8, true), plain, { p: [x, by - R * 0.18 - tl, z], c: o.tasselCol || '#c8281e', sway, noAO: true, grad: [0.7, 1] });
    }
  }
  // ----- lacquered square paper lamp box (lamp_post) with text on its four panels
  function lampBoxTex(text) {
    return TEX('lampbox:' + text, 256, 256, (g, w, h) => {
      const r = rng(hashStr(text));
      g.fillStyle = '#fff3dc'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(160,110,60,${0.03 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 1 + r() * 5, 1); }
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.75);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(160,80,20,0.35)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(50,24,10,0.85)'; g.fillRect(0, h * 0.68, w, 5); g.fillRect(w / 2 - 2, 0, 4, h * 0.68);
      inkFit(g, text, w * 0.27, h * 0.34, w * 0.34, h * 0.56, 'rgba(60,18,8,0.92)');
      inkFit(g, text, w * 0.73, h * 0.34, w * 0.34, h * 0.56, 'rgba(60,18,8,0.92)');
    }, 0, { wrap: false });
  }

  // =================================================================================================
  // MODELS
  // =================================================================================================
  // G.Models.create() hands build() `v: 0` unless a `variants` count is declared, but 2D variants come from o.v or a
  // position hash, and props also read text / w / color …  key() is called with the real instance right before
  // build(), so the wrapper hands that instance to build().
  let lastO = null;
  const def = (id, d) => Mo.define(id, Object.assign({}, d, {
    key: (o) => { lastO = o; return d.key ? d.key(o) : ''; },
    build: (o, K) => d.build(lastO && lastO.t === o.t && lastO.x === o.x && lastO.y === o.y ? lastO : o, K),
  }));
  const k = (...a) => a.map((x) => (x == null ? '' : String(x))).join('|');
  const tagged = (root) => { root.userData.ps = 1; return root; };

  // ---------------------------------------------------------------- lantern_string
  const STRING_COLS = [['#d42f25'], ['#d42f25', '#e8a33a', '#f0e6cf', '#d42f25', '#c8542a'], ['#5fa8d8', '#8fd0f0']];
  const PENNANT = ['#e8a33a', '#3d8a7a', '#c9453a', '#f0e6cf'];
  const stringH = (L, o) => 2.05 + (o.lift != null ? o.lift : 46) * 0.024;
  def('lantern_string', {
    key: (o) => { const L = lay(o); return k(L.w, L.v, L.lit, o.lift, o.color, o.poles); },
    build(o) {
      const L = lay(o), W = L.w, g = new THREE.Group();
      const H = stringH(L, o), sag = 0.16 + W * 0.04;
      const x0 = -W / 2 + 0.06, x1 = W / 2 - 0.06;
      // slim bamboo poles with a lashed cross-arm at each end
      if (o.poles !== false) for (const x of [x0, x1]) {
        mk(g, G3.cyl(0.032, 0.038, H + 0.28, 7), MAT('bamboo'), { p: [x, 0, 0], c: '#b9b070' });
        mk(g, G3.cyl(0.05, 0.06, 0.08, 7), MAT('stone'), { p: [x, 0, 0], c: '#8a867c' });
        mk(g, G3.torus(0.04, 0.012, 4, 8), MAT('plain', 'sway'), { p: [x, H - 0.02, 0], r: [PI / 2, 0, 0], c: '#3a2a18' });
      }
      const yAt = (u) => H - sag * 4 * u * (1 - u);
      const xAt = (u) => lerp(x0, x1, u);
      const cps = []; for (let i = 0; i <= 12; i++) { const u = i / 12; cps.push(V3(xAt(u), yAt(u), 0)); }
      mk(g, G3.tube(cps, 0.009, 40, 4), MAT('plain', 'sway'), { c: '#2a1a12', cast: false });
      const n = L.pts ? L.pts.length : max(2, round(W * 64 / 44));
      const cols = STRING_COLS[clamp(L.v | 0, 0, 2)];
      const R = 0.135, Hh = 0.27, cord = 0.07;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, px = xAt(u), py = yAt(u);
        const col = o.color || (L.pts ? L.pts[i].col : cols[i % cols.length]);
        addLantern(g, { x: px, y: py - cord - Hh / 2 - 0.03, z: 0, R, H: Hh, col, lit: L.lit, pivot: [px, py, 0], ph: i * 0.83, tasselCol: col === '#d42f25' ? '#e8b23a' : '#c8281e' });
      }
      if (L.v === 1) { // triangular paper pennants between the lanterns
        const m = n * 3;
        for (let i = 0; i < m; i++) {
          const u = (i + 0.25) / m, px = xAt(u), py = yAt(u);
          const tri = new THREE.BufferGeometry();
          tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.07, 0, 0, 0.07, 0, 0, 0, -0.15, 0], 3));
          tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0.3, 1, 0.15, 0], 2));
          tri.computeVertexNormals();
          mk(g, tri, MAT('cloth', 'sway'), { p: [px, py - 0.005, 0], r: [0, (i % 2) * 0.4 - 0.2, 0], c: PENNANT[i % 4], sway: [px, py, 0, i * 1.9], cast: false });
        }
      }
      return tagged(bake(g, { ao: 0.25 }));
    },
    update(node, o, t) { tick(t); },
    lights(o) {
      const L = lay(o);
      if (!L.lit) return [];
      const H = stringH(L, o), W = L.w, sag = 0.16 + W * 0.04;
      const out = [], n = W >= 5 ? 2 : 1;
      for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; out.push({ x: lerp(-W / 2, W / 2, u), y: H - sag * 4 * u * (1 - u) - 0.35, z: 0, color: '#ff8a46', intensity: 1.1, distance: 2.6 + W * 0.4, flicker: 0.15 }); }
      return out;
    },
  });

  // ---------------------------------------------------------------- red_lantern (bamboo pole with arm, or o.hang from an eave)
  def('red_lantern', {
    key: (o) => { const L = lay(o); return k(L.hang, L.col, L.glyph, L.lit); },
    build(o) {
      const L = lay(o), g = new THREE.Group();
      const R = 0.21, H = 0.42;
      if (L.hang) {
        const py = 2.78;
        addLantern(g, { x: 0, y: py - 0.12 - H / 2 - 0.04, R, H, col: L.col, glyph: L.glyph, lit: L.lit, pivot: [0, py, 0], ph: 0.7 });
        mk(g, G3.cbox(0.1, 0.03, 0.1), MAT('plain', 'sway'), { p: [0, py + 0.015, 0], c: '#3a2416', cast: false });
      } else {
        const px = -0.22, top = 2.6;
        mk(g, G3.rbox(0.3, 0.22, 0.3, 0.03), MAT('stone'), { p: [px, 0, 0], c: '#a8a397', top: ['#7a8a5a', 0.25] });
        mk(g, G3.cyl(0.036, 0.042, top, 8), MAT('bamboo'), { p: [px, 0.1, 0], c: '#c2b46a' });
        // curved arm and lashing
        const ax = 0.2;
        mk(g, G3.tube([V3(px, top - 0.1, 0), V3(px + 0.12, top + 0.02, 0), V3(ax, top - 0.02, 0)], 0.017, 10, 5), MAT('bamboo'), { c: '#b2a45e' });
        mk(g, G3.torus(0.045, 0.01, 4, 10), MAT('plain', 'sway'), { p: [px, top - 0.12, 0], r: [PI / 2, 0, 0], c: '#2a1a10' });
        mk(g, G3.sphere(0.03, 8, 6), MAT('plain', 'sway'), { p: [px, top + 0.11, 0], c: '#d6a43c' });
        mk(g, G3.cyl(0.0, 0.03, 0.06, 8), MAT('plain', 'sway'), { p: [px, top + 0.12, 0], c: '#d6a43c' });
        const py = top - 0.04;
        addLantern(g, { x: ax, y: py - 0.1 - H / 2 - 0.04, R, H, col: L.col, glyph: L.glyph, lit: L.lit, pivot: [ax, py, 0], ph: 0.3 });
      }
      return tagged(bake(g, { ao: 0.35 }));
    },
    update(node, o, t) { tick(t); },
    lights(o) {
      const L = lay(o);
      if (!L.lit) return [];
      return [L.hang ? { x: 0, y: 2.4, z: 0, color: '#ff8040', intensity: 1.2, distance: 4, flicker: 0.2 } : { x: 0.2, y: 2.25, z: 0, color: '#ff8040', intensity: 1.2, distance: 4.2, flicker: 0.2 }];
    },
  });

  // ---------------------------------------------------------------- lamp_post 行燈 on a wooden post
  def('lamp_post', {
    key: (o) => { const L = lay(o); return k(L.lit, L.text); },
    build(o) {
      const L = lay(o), g = new THREE.Group();
      const text = String(L.text || '燈');
      mk(g, G3.rbox(0.38, 0.22, 0.38, 0.035), MAT('stone'), { c: '#aaa59a', top: ['#7a8a5a', 0.2] });
      mk(g, G3.rbox(0.3, 0.07, 0.3, 0.02), MAT('stone'), { p: [0, 0.22, 0], c: '#c2bdb0' });
      mk(g, G3.box(0.13, 1.66, 0.13), MAT('wood'), { p: [0, 0.29, 0], c: '#5a3c24' });
      for (const y of [0.29, 1.82]) mk(g, G3.box(0.16, 0.05, 0.16), MAT('wood'), { p: [0, y, 0], c: '#2e1e12' });
      // bracket arms under the box
      for (const s of [-1, 1]) mk(g, G3.box(0.05, 0.05, 0.3), MAT('wood'), { p: [0, 1.84, 0], r: [0, s * PI / 4, 0], c: '#2e1e12' });
      const by = 1.89, bh = 0.44, bw = 0.33;
      // paper panels (glow) + lacquered frame
      const box = new THREE.BoxGeometry(bw - 0.02, bh - 0.02, bw - 0.02); box.translate(0, bh / 2, 0);
      mk(g, box, GLOW('lampbox:' + text, lampBoxTex(text), L.lit ? 1.5 : 0.05), { p: [0, by + 0.01, 0], c: '#ffe2b0', noAO: true });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, G3.box(0.028, bh, 0.028), MAT('wood'), { p: [sx * bw / 2, by, sz * bw / 2], c: '#2a1a10' });
      for (const y of [by, by + bh - 0.025]) for (const r of [0, PI / 2]) for (const s of [-1, 1]) {
        mk(g, G3.box(bw + 0.03, 0.028, 0.024), MAT('wood'), { p: r ? [s * bw / 2, y, 0] : [0, y, s * bw / 2], r: [0, r, 0], c: '#2a1a10' });
      }
      mk(g, G3.box(bw + 0.08, 0.025, bw + 0.08), MAT('wood'), { p: [0, by - 0.02, 0], c: '#2a1a10' });
      // little hipped cap with a finial
      const roof = G3.flat(G3.lathe([[0, 0], [0.31, 0], [0.33, 0.025], [0.27, 0.05], [0.04, 0.17], [0, 0.18]], 4, 'native'));
      roof.rotateY(PI / 4); projUV(roof);
      mk(g, roof, MAT('wood'), { p: [0, by + bh, 0], c: '#2c2626' });
      mk(g, G3.sphere(0.035, 8, 6), MAT('wood'), { p: [0, by + bh + 0.2, 0], c: '#d8aa48' });
      return tagged(bake(g));
    },
    lights(o) { return lay(o).lit ? [{ x: 0, y: 2.1, z: 0, color: '#ffb45a', intensity: 1.15, distance: 5, flicker: 0.12 }] : []; },
  });

  // ---------------------------------------------------------------- stone_lantern 石燈籠
  def('stone_lantern', {
    key: (o) => k(lay(o).lit),
    build(o) {
      const L = lay(o), g = new THREE.Group(), S = MAT('stone');
      const st = (geo, p, c = '#bab5a8', extra) => mk(g, geo, S, Object.assign({ p, c, top: ['#6e7e4c', 0.3] }, extra));
      const oct = (rt, rb, h) => { const c = G3.cyl(rt, rb, h, 8); c.rotateY(PI / 8); return c; };
      st(G3.rbox(0.56, 0.1, 0.56, 0.03), [0, 0, 0], '#a29d90');
      st(oct(0.22, 0.26, 0.09), [0, 0.1, 0]);
      st(oct(0.17, 0.2, 0.05), [0, 0.19, 0]);
      st(oct(0.085, 0.095, 0.44), [0, 0.24, 0]);
      st(oct(0.11, 0.11, 0.035), [0, 0.43, 0], '#c4bfb2');
      st(oct(0.2, 0.12, 0.09), [0, 0.68, 0]);
      st(G3.rbox(0.38, 0.05, 0.38, 0.015), [0, 0.77, 0], '#c4bfb2');
      // fire chamber 火袋: corner posts, lintels, glowing paper core
      const cy = 0.82, ch = 0.27;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) st(G3.box(0.07, ch, 0.07), [sx * 0.13, cy, sz * 0.13]);
      st(G3.box(0.33, 0.04, 0.33), [0, cy + ch - 0.04, 0], '#b0ab9e');
      for (const r of [0, PI / 2]) st(G3.box(0.2, 0.035, 0.03), [0, cy + 0.09, 0], '#b0ab9e', { r: [0, r, 0] }); // window bars
      mk(g, G3.box(0.19, ch - 0.05, 0.19), GLOW('stonecore', null, L.lit ? 2.2 : 0.02), { p: [0, cy, 0], c: L.lit ? '#ffcc80' : '#2a2622', noAO: true });
      // roof 笠: square, concave hips, upturned corners; then the 宝珠 finial
      const roof = G3.flat(G3.lathe([[0, -0.01], [0.33, -0.01], [0.37, 0.03], [0.31, 0.055], [0.16, 0.12], [0.07, 0.17], [0, 0.18]], 4, 'native'));
      roof.rotateY(PI / 4); projUV(roof);
      st(roof, [0, cy + ch, 0], '#b4afa2');
      st(G3.cyl(0.05, 0.06, 0.04, 8), [0, cy + ch + 0.17, 0]);
      st(G3.lathe([[0, 0], [0.05, 0.01], [0.065, 0.05], [0.045, 0.09], [0.01, 0.13], [0, 0.14]], 10), [0, cy + ch + 0.2, 0], '#c4bfb2');
      return tagged(bake(g, { ao: 0.45 }));
    },
    lights(o) { return lay(o).lit ? [{ x: 0, y: 0.95, z: 0, color: '#ffc070', intensity: 0.9, distance: 3.5, flicker: 0.25 }] : []; },
  });

  // ---------------------------------------------------------------- sky_lantern 天燈 (Pingxi): four painted paper panels, rising
  const SKY_COLS = ['#d8432f', '#f2e6c8', '#e8b13a', '#e88a9a'];
  const SKY_WISH = ['心想事成', '闔家平安', '風調雨順', '學業進步', '身體健康', '萬事如意'];
  const skyAlt = (L) => 1.2 + (L.alt != null ? L.alt : 150) / 64 * 1.1;
  function skyTex(v, txt) {
    return TEX('sky:' + v + txt, 512, 256, (g, w, h) => {
      const r = rng(hashStr(txt) + v);
      for (let p = 0; p < 4; p++) {
        const x = p * w / 4, col = SKY_COLS[(v + p) % 4];
        g.fillStyle = col; g.fillRect(x, 0, w / 4, h);
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(60,20,10,0.35)'); gr.addColorStop(0.5, 'rgba(255,240,200,0.0)'); gr.addColorStop(1, 'rgba(255,250,220,0.5)');
        g.fillStyle = gr; g.fillRect(x, 0, w / 4, h);
        for (let i = 0; i < 250; i++) { g.fillStyle = `rgba(80,40,20,${0.03 + r() * 0.06})`; g.fillRect(x + r() * w / 4, r() * h, 1 + r() * 6, 1); }
        g.fillStyle = 'rgba(70,30,10,0.35)'; g.fillRect(x, 0, 2, h);
        const text = p === 0 ? txt : SKY_WISH[(hashStr(txt) + p * 2 + v) % SKY_WISH.length];
        const dark = (v + p) % 4 === 0 ? '#1e0a04' : '#2a1208';
        if (p === 0) inkFit(g, text, x + w / 8, h * 0.5, w / 4 * 0.6, h * 0.72, dark, { spacing: 1.08 });
        else {
          const cs = chars(text), half = Math.ceil(cs.length / 2);
          inkFit(g, cs.slice(0, half).join(''), x + w / 8 + 16, h * 0.5, 30, h * 0.66, dark, { spacing: 1.1 });
          inkFit(g, cs.slice(half).join(''), x + w / 8 - 16, h * 0.5, 30, h * 0.66, dark, { spacing: 1.1 });
        }
      }
    }, 0, { wrap: true });
  }
  def('sky_lantern', {
    key: (o) => { const L = lay(o); return k(L.v, L.txt, L.alt); },
    build(o) {
      const L = lay(o), root = new THREE.Group();
      const alt = skyAlt(L), Hs = 0.78;
      const lift = part('lift', [0, alt, 0], (g) => {
        const rings = [];
        for (let i = 0; i <= 8; i++) { const u = i / 8, hw = lerp(0.2, 0.29, Math.pow(u, 0.8)); rings.push(sqRing(hw, hw, alt + u * Hs, 16)); }
        // domed top
        for (let i = 1; i <= 3; i++) { const u = i / 3, hw = 0.29 * cos(u * PI / 2 * 0.92); rings.push(sqRing(hw, hw, alt + Hs + sin(u * PI / 2) * 0.09, 16)); }
        const body = G3.loft(rings, false, true);
        const uv = body.attributes.uv; // v over the panel height only
        for (let i = 0; i < uv.count; i++) uv.setY(i, clamp(uv.getY(i) * 11 / 8, 0, 1));
        mk(g, body, GLOW('sky:' + L.v + L.txt, skyTex(L.v, L.txt), 0.75, '', { side: THREE.DoubleSide }), { c: '#ffffff', noAO: true, grad: [1.3, 0.55] });
        // bamboo hoop, wire cross and the burning joss-paper wad
        for (const r of [0, PI / 2]) for (const s of [-1, 1]) mk(g, G3.rod(0.009, 0.42, 5), MAT('plain'), { p: r ? [s * 0.2, alt, 0] : [0, alt, s * 0.2], r: [0, r, 0], c: '#a89a5a', noAO: true });
        for (const r of [PI / 4, -PI / 4]) mk(g, G3.rod(0.003, 0.56, 3), MAT('plain'), { p: [0, alt, 0], r: [0, r, 0], c: '#3a3a3a', noAO: true, cast: false });
        mk(g, G3.cbox(0.07, 0.04, 0.07), GLOW('ember', null, 2.5), { p: [0, alt, 0], c: '#ff9a40', noAO: true });
        const fl = G3.lathe([[0, 0], [0.04, 0.03], [0.035, 0.08], [0.015, 0.14], [0, 0.18]], 8, 'native');
        mk(g, fl, flameMat('warm'), { p: [0, alt + 0.01, 0], vc: [0.3, 0.6, 0.18], cast: false });
      }, { ao: 0 });
      root.add(lift);
      return tagged(root);
    },
    update(node, o, t) {
      tick(t);
      const lf = node.getObjectByName('lift');
      if (!lf) return;
      const s = seedOf(node);
      if (lf.userData.y0 == null) lf.userData.y0 = lf.position.y;
      lf.position.y = lf.userData.y0 + sin(t * 0.9 + s) * 0.14;
      lf.position.x = sin(t * 0.5 + s * 2) * 0.08;
      lf.position.z = cos(t * 0.43 + s) * 0.05;
      lf.rotation.y = t * 0.12 + s;
      lf.rotation.z = sin(t * 0.7 + s) * 0.04;
    },
    lights(o) { const L = lay(o); return [{ x: 0, y: skyAlt(L) + 0.3, z: 0, color: '#ffb050', intensity: 1.1, distance: 5, flicker: 0.3 }]; },
  });

  // ---------------------------------------------------------------- water_lantern 水燈頭: paper house on a raft (中元 放水燈)
  // atlas cells: 0 front (door + surname plaque), 1 back (普渡), 2 left (慶讚), 3 right (中元), 4 plain
  function houseTex(col, txt) {
    return TEX('wlhouse:' + col + txt, 640, 128, (g, w, h) => {
      const r = rng(hashStr(txt + col));
      const cw = w / 5;
      for (let c = 0; c < 5; c++) {
        const x = c * cw;
        g.fillStyle = col; g.fillRect(x, 0, cw, h);
        for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,220,180,${0.03 + r() * 0.06})`; g.fillRect(x + r() * cw, r() * h, 1 + r() * 5, 1); }
        if (c === 4) continue;
        // gold border and corner fret
        g.strokeStyle = '#f2c450'; g.lineWidth = 4; g.strokeRect(x + 6, 6, cw - 12, h - 12);
        g.lineWidth = 1.5; g.strokeRect(x + 12, 12, cw - 24, h - 24);
        if (c === 0) {
          // glowing lattice door flanked by the family-name plaque (vertical)
          const dg = g.createRadialGradient(x + cw * 0.36, h * 0.55, 4, x + cw * 0.36, h * 0.55, 40);
          dg.addColorStop(0, '#fffbe8'); dg.addColorStop(1, '#ffc060');
          g.fillStyle = dg; g.fillRect(x + cw * 0.18, h * 0.26, cw * 0.36, h * 0.6);
          g.strokeStyle = 'rgba(120,40,10,0.85)'; g.lineWidth = 2;
          for (let k2 = 1; k2 < 4; k2++) { g.beginPath(); g.moveTo(x + cw * 0.18 + k2 * cw * 0.09, h * 0.26); g.lineTo(x + cw * 0.18 + k2 * cw * 0.09, h * 0.86); g.stroke(); }
          for (let k2 = 1; k2 < 5; k2++) { g.beginPath(); g.moveTo(x + cw * 0.18, h * 0.26 + k2 * h * 0.12); g.lineTo(x + cw * 0.54, h * 0.26 + k2 * h * 0.12); g.stroke(); }
          g.fillStyle = '#f4e2b0'; g.fillRect(x + cw * 0.62, h * 0.16, cw * 0.26, h * 0.72);
          g.strokeStyle = '#7a1a10'; g.lineWidth = 2; g.strokeRect(x + cw * 0.62, h * 0.16, cw * 0.26, h * 0.72);
          inkFit(g, txt, x + cw * 0.75, h * 0.52, cw * 0.24, h * 0.66, '#1a0806', { max: 52 });
        } else {
          const t2 = c === 1 ? '普渡' : c === 2 ? '慶讚' : '中元';
          const wg = g.createRadialGradient(x + cw / 2, h / 2, 2, x + cw / 2, h / 2, 34);
          wg.addColorStop(0, 'rgba(255,250,220,0.9)'); wg.addColorStop(1, 'rgba(255,190,90,0)');
          g.fillStyle = wg; g.fillRect(x, 0, cw, h);
          ink(g, t2, x + cw / 2, h / 2, 36, '#2a0c06', { vertical: false });
        }
      }
    }, 0, { wrap: false });
  }
  def('water_lantern', {
    key: (o) => { const L = lay(o); return k(L.col, L.txt); },
    build(o) {
      const L = lay(o), root = new THREE.Group();
      const fl = part('float', [0, 0, 0], (g) => {
        const W = MAT('wood');
        // bamboo-and-plank raft
        for (let i = -2; i <= 2; i++) mk(g, G3.box(0.64, 0.045, 0.092, 'x'), W, { p: [0, -0.01, i * 0.1], c: i % 2 ? '#a8824e' : '#987244', r: [0, 0, (i % 2) * 0.01] });
        for (const x of [-0.25, 0.25]) mk(g, G3.rod(0.022, 0.54, 6), W, { p: [x, 0.05, 0], r: [0, PI / 2, 0], c: '#b0a462' });
        // plinth, house body (glowing paper), corner posts, roof
        const P = MAT('plain');
        mk(g, G3.box(0.48, 0.04, 0.38), P, { p: [0, 0.07, 0], c: '#a8261c' });
        const hb = new THREE.BoxGeometry(0.4, 0.26, 0.3); hb.translate(0, 0.13, 0); atlasBox(hb, [3, 2, 4, 4, 0, 1], 5);
        mk(g, hb, GLOW('wlhouse:' + L.col + L.txt, houseTex(L.col, L.txt), 1.15), { p: [0, 0.11, 0], c: '#ffffff', noAO: true });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, G3.box(0.03, 0.28, 0.03), P, { p: [sx * 0.205, 0.1, sz * 0.155], c: '#e8b53a' });
        mk(g, G3.box(0.44, 0.025, 0.34), P, { p: [0, 0.37, 0], c: '#e8b53a' });
        // gable roof: two slabs + curved swallowtail ridge 燕尾 + pearl
        for (const s of [-1, 1]) mk(g, G3.cbox(0.56, 0.022, 0.24), P, { p: [0, 0.445, s * 0.095], r: [s * 0.5, 0, 0], c: '#f0b840' });
        mk(g, G3.tube([V3(-0.34, 0.56, 0), V3(-0.27, 0.52, 0), V3(0, 0.505, 0), V3(0.27, 0.52, 0), V3(0.34, 0.56, 0)], 0.018, 16, 5), P, { c: '#c9302a' });
        for (const s of [-1, 1]) mk(g, G3.cyl(0.0, 0.02, 0.07, 5), P, { p: [s * 0.35, 0.55, 0], r: [0, 0, -s * 0.9], c: '#c9302a' });
        mk(g, G3.sphere(0.03, 8, 6), GLOW('ember', null, 2.5), { p: [0, 0.55, 0], c: '#a08040', noAO: true });
        mk(g, G3.cbox(0.012, 0.03, 0.012), P, { p: [0, 0.52, 0], c: '#c9302a' });
        // candle glow visible through the door
        mk(g, G3.cbox(0.06, 0.08, 0.06), GLOW('ember', null, 2.5), { p: [0, 0.16, 0], c: '#ffd080', noAO: true });
      }, { ao: 0 });
      fl.scale.setScalar(1.2); // story prop: a touch larger than life so the surname plaque reads from the game camera
      root.add(fl);
      return tagged(root);
    },
    update(node, o, t) {
      const f = node.getObjectByName('float');
      if (!f) return;
      const s = seedOf(node);
      f.position.y = -0.035 + sin(t * 1.6 + s) * 0.022;
      f.rotation.z = 0.045 * sin(t * 1.1 + s * 1.3);
      f.rotation.x = 0.035 * sin(t * 0.9 + s * 0.7);
      f.rotation.y = 0.12 * sin(t * 0.21 + s);
    },
    lights() { return [{ x: 0, y: 0.35, z: 0.1, color: '#ffb060', intensity: 1.1, distance: 3.6, flicker: 0.35 }]; },
  });

  // =================================================================================================
  // market & street furniture
  // =================================================================================================
  // red ink stamp on a transparent canvas (crate stencils, sack prints)
  function stampTex(label, color = '#8a1e14') {
    return TEX('stamp:' + label + color, 128, 128, (g, w, h) => {
      ink(g, label, w / 2, h / 2, chars(label).length > 1 ? 52 : 86, color, { vertical: chars(label).length > 1 });
      // stencil gaps / worn print
      const r = rng(hashStr(label));
      g.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.5})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 1 + r() * 3); }
      g.globalCompositeOperation = 'source-over';
    }, 0, { wrap: false });
  }
  const STAMP = (label, color) => TMAT('stamp:' + label + (color || ''), stampTex(label, color), { alphaTest: 0.3, roughness: 0.9 });
  // flat decal plane facing +z, optionally bent round a cylinder of radius bend
  function decal(w, h, bend) {
    const p = new THREE.PlaneGeometry(w, h, bend ? 6 : 1, 1); p.translate(0, h / 2, 0);
    if (bend) { const a = p.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, -a.getX(i) * a.getX(i) / (2 * bend)); p.computeVertexNormals(); }
    return p;
  }

  // ---------------------------------------------------------------- barrel 木桶 (bamboo-hooped staves)
  const barrelR = (R, u) => R * (0.86 + 0.14 * sin(PI * u));
  function addBarrel(g, x, z, R, H, o = {}) {
    const pts = []; for (let j = 0; j <= 8; j++) pts.push([barrelR(R, j / 8), j / 8 * H]);
    mk(g, G3.lathe(pts, 16, 'native'), MAT('staves'), { p: [x, 0, z], c: o.col || '#8a5a32', r: [0, o.ry || 0, 0] });
    const rt = barrelR(R, 1) - 0.012;
    if (o.open) {
      mk(g, G3.cyl(rt, rt, 0.01, 16), MAT('water'), { p: [x, H - 0.08, z], c: '#1c3440', noAO: true });
      mk(g, G3.cyl(rt * 0.3, rt * 0.3, 0.004, 10), MAT('water'), { p: [x - rt * 0.3, H - 0.07, z + rt * 0.2], c: '#5a7a88', noAO: true });
    } else {
      mk(g, G3.cyl(rt, rt, 0.025, 16), MAT('wood'), { p: [x, H - 0.045, z], c: o.col || '#8a5a32' });
      for (const dz of [-rt / 3, rt / 3]) mk(g, G3.box(rt * 1.8, 0.004, 0.006), MAT('wood'), { p: [x, H - 0.02, z + dz], c: '#2a1608' });
    }
    for (const f of [0.14, 0.5, 0.86]) {
      if (f === 0.5 && H < 0.5) continue;
      mk(g, G3.torus(barrelR(R, f) + 0.004, 0.016, 4, 18), MAT('weave'), { p: [x, f * H, z], r: [PI / 2, 0, 0], c: '#b8a068' });
    }
  }
  def('barrel', {
    key: (o) => k(lay(o).v),
    build(o) {
      const v = lay(o).v, g = new THREE.Group();
      if (v === 0) addBarrel(g, 0, 0, 0.3, 0.72);
      else if (v === 1) { addBarrel(g, -0.1, -0.05, 0.28, 0.64, { open: true, col: '#7e5230' }); addBarrel(g, 0.27, 0.22, 0.16, 0.34, { col: '#9a6a3a', ry: 1 }); }
      else { addBarrel(g, 0.13, -0.17, 0.23, 0.56, { col: '#7a4e2c', ry: 0.5 }); addBarrel(g, -0.15, 0.17, 0.25, 0.6, { ry: 2 }); }
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- crate 木箱 (planks, battens, brace, nails, stencil)
  function addCrate(g, x, z, w, h, d, label, o = {}) {
    const sub = new THREE.Group(); sub.position.set(x, o.y || 0, z); sub.rotation.y = o.ry || 0; g.add(sub);
    const W = MAT('wood'), c = o.col || '#a07448', dark = '#5a3a1e', rows = 3, gap = 0.01;
    const rh = (h - 0.02) / rows;
    const r = rng(hashStr(label || 'c') + (w * 100 | 0));
    const tone = () => { const t = new THREE.Color(c); t.offsetHSL(0, 0, (r() - 0.5) * 0.08); return '#' + t.getHexString(); };
    for (let i = 0; i < rows; i++) {
      for (const s of [-1, 1]) {
        mk(sub, G3.box(w - 0.05, rh - gap, 0.02, 'x'), W, { p: [0, 0.01 + i * rh, s * (d / 2 - 0.01)], c: tone() });
        mk(sub, G3.box(0.02, rh - gap, d - 0.05, 'z'), W, { p: [s * (w / 2 - 0.01), 0.01 + i * rh, 0], c: tone() });
      }
    }
    for (let i = 0; i < 3; i++) mk(sub, G3.box(w - 0.02, 0.022, d / 3 - gap, 'x'), W, { p: [0, h - 0.022, (i - 1) * d / 3], c: tone() });
    // corner posts, horizontal battens, diagonal braces, nails
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(sub, G3.box(0.045, h, 0.045), W, { p: [sx * (w / 2 - 0.0225), 0, sz * (d / 2 - 0.0225)], c: dark });
    for (const s of [-1, 1]) for (const y of [0, h - 0.055]) mk(sub, G3.box(w - 0.09, 0.055, 0.02, 'x'), W, { p: [0, y, s * (d / 2 + 0.008)], c: '#7a5432' });
    const bl = Math.hypot(w - 0.12, h - 0.13), ba = Math.atan2(h - 0.13, w - 0.12);
    for (const s of [-1, 1]) mk(sub, G3.cbox(bl, 0.05, 0.018, 'x'), W, { p: [0, h / 2, s * (d / 2 + 0.01)], r: [0, 0, s * ba], c: '#7a5432' });
    for (const s of [-1, 1]) for (const sx of [-1, 1]) for (const y of [0.028, h - 0.028]) mk(sub, G3.cbox(0.012, 0.012, 0.006), W, { p: [sx * (w / 2 - 0.07), y, s * (d / 2 + 0.019)], c: '#1a1410', cast: false });
    if (label) for (const s of [1, -1]) mk(sub, decal(min(w, h) * 0.72, min(w, h) * 0.72), STAMP(label), { p: [0, h * 0.5 - min(w, h) * 0.36, s * (d / 2 + 0.0215)], r: [0, s > 0 ? 0 : PI, 0], cast: false });
  }
  function addSack(g, x, z, w, h, d, o = {}) {
    const sk = G3.sphere(1, 10, 6); sk.scale(w / 2, h / 2, d / 2); sk.translate(0, h / 2, 0);
    { const P = sk.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i) / h; const f = 1.12 - 0.12 * Math.pow(abs(y * 2 - 1), 3); P.setX(i, P.getX(i) * f); P.setZ(i, P.getZ(i) * f); } sk.computeVertexNormals(); }
    mk(g, sk, MAT('cloth'), { p: [x, o.y || 0, z], r: [0, o.ry || 0, o.rz || 0], c: o.col || '#d8c8a0' });
    // tied neck + red cord
    mk(g, G3.cyl(w * 0.12, w * 0.2, h * 0.22, 7), MAT('cloth'), { p: [x + (o.neck || 0), (o.y || 0) + h * 0.86, z], r: [0, 0, o.rz || 0], c: o.col || '#d8c8a0' });
    if (o.label) mk(g, decal(min(w, h) * 0.7, min(w, h) * 0.7, d * 0.6), STAMP(o.label), { p: [x, (o.y || 0) + h * 0.5 - min(w, h) * 0.35, z + d / 2 + 0.006], r: [0, 0, o.rz || 0], cast: false });
  }
  def('crate', {
    key: (o) => k(lay(o).v),
    build(o) {
      const v = lay(o).v, g = new THREE.Group();
      if (v === 0) addCrate(g, 0, 0, 0.68, 0.52, 0.6, '茶');
      else if (v === 1) { addCrate(g, 0, 0.04, 0.7, 0.46, 0.62, '米'); addCrate(g, -0.02, -0.02, 0.48, 0.32, 0.42, null, { y: 0.46, ry: 0.22, col: '#8a6440' }); }
      else { addCrate(g, -0.14, -0.02, 0.52, 0.42, 0.52, '鹽', { ry: -0.1 }); addSack(g, 0.27, 0.1, 0.32, 0.38, 0.28, { label: '米', rz: -0.08 }); }
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- jar 酒甕 / 醋 / 水缸
  function labelTex(ch) {
    return TEX('label:' + ch, 128, 128, (g, w, h) => {
      g.save(); g.translate(w / 2, h / 2); g.rotate(PI / 4);
      g.fillStyle = '#c8281e'; g.fillRect(-w * 0.34, -h * 0.34, w * 0.68, h * 0.68);
      g.strokeStyle = '#e8b04a'; g.lineWidth = 3; g.strokeRect(-w * 0.3, -h * 0.3, w * 0.6, h * 0.6);
      g.rotate(-PI / 4);
      ink(g, ch, 0, 2, 52, '#120402', { dry: false });
      g.restore();
    }, 0, { wrap: false });
  }
  function addJar(g, x, z, R, H, o = {}) {
    const pts = [[R * 0.52, 0], [R * 0.78, H * 0.06], [R * 0.97, H * 0.28], [R, H * 0.45], [R * 0.9, H * 0.66], [R * 0.62, H * 0.84], [R * 0.42, H * 0.92], [R * 0.47, H * 0.97], [R * 0.45, H], [R * 0.38, H * 0.99], [R * 0.37, H * 0.9]];
    mk(g, G3.lathe(pts, 18, 'native'), MAT('ceramic'), { p: [x, 0, z], c: o.col || '#6e3c1e', r: [0, o.ry || 0, 0] });
    if (o.cloth) {
      mk(g, G3.lathe([[R * 0.62, H * 0.86], [R * 0.56, H * 0.93], [R * 0.52, H * 1.0], [R * 0.4, H * 1.06], [R * 0.15, H * 1.1], [0, H * 1.11]], 12), MAT('cloth'), { p: [x, 0, z], c: '#c8342a' });
      mk(g, G3.torus(R * 0.47, 0.008, 4, 14), MAT('cloth'), { p: [x, H * 0.95, z], r: [PI / 2, 0, 0], c: '#e8c070' });
    } else mk(g, G3.cyl(R * 0.37, R * 0.37, 0.004, 12), MAT('ceramic'), { p: [x, H * 0.93, z], c: '#140a06', noAO: true });
    if (o.label) mk(g, decal(R * 0.9, R * 0.9, R), TMAT('label:' + o.label, labelTex(o.label), { alphaTest: 0.4, roughness: 0.75 }), { p: [x, H * 0.47 - R * 0.45, z + R + 0.004], cast: false });
  }
  def('jar', {
    key: (o) => k(lay(o).v),
    build(o) {
      const v = lay(o).v, g = new THREE.Group();
      if (v === 0) addJar(g, 0, 0, 0.3, 0.7, { cloth: true, label: '酒' });
      else if (v === 1) {
        addJar(g, 0.15, -0.18, 0.2, 0.46, { col: '#5a3a24', cloth: true });
        addJar(g, -0.13, 0.08, 0.25, 0.56, { label: '醋', col: '#7a4422' });
        addJar(g, 0.27, 0.26, 0.13, 0.28, { col: '#8a5a32' });
      } else {
        // wide open water vat 水缸 with a gourd ladle 水瓢
        const pts = [[0.3, 0], [0.37, 0.06], [0.43, 0.26], [0.45, 0.44], [0.47, 0.48], [0.45, 0.5], [0.41, 0.48], [0.4, 0.3], [0.36, 0.1]];
        mk(g, G3.lathe(pts, 22, 'native'), MAT('ceramic'), { c: '#6a5a4a' });
        mk(g, G3.cyl(0.405, 0.405, 0.006, 20), MAT('water'), { p: [0, 0.4, 0], c: '#1a3440', noAO: true });
        mk(g, G3.lathe([[0, -0.06], [0.04, -0.055], [0.07, -0.03], [0.075, 0], [0.068, 0.004], [0.06, -0.025], [0, -0.05]], 10), MAT('wood'), { p: [0.24, 0.5, 0.12], r: [0.35, 0, -0.25], c: '#a8804e' });
        mk(g, G3.rod(0.012, 0.5, 6), MAT('wood'), { p: [0.4, 0.55, -0.02], r: [0, 0.6, 0.35], c: '#8a6a42' });
      }
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- basket 竹籃 with goods (taro / fish / oranges / greens)
  function addBasket(g, x, z, R, H, kind, seed) {
    const r = rng(seed);
    mk(g, G3.lathe([[R * 0.62, 0.005], [R * 0.7, 0.012], [R * 0.9, H * 0.6], [R, H], [R * 0.96, H], [R * 0.85, H * 0.55], [R * 0.6, 0.02], [0, 0.02]], 16), MAT('weave'), { p: [x, 0, z], c: '#d0b07a' });
    mk(g, G3.torus(R, 0.014, 4, 18), MAT('weave'), { p: [x, H, z], r: [PI / 2, 0, 0], c: '#b8955a' });
    mk(g, G3.torus(R * 0.64, 0.012, 4, 14), MAT('weave'), { p: [x, 0.01, z], r: [PI / 2, 0, 0], c: '#8a6a3a' });
    const P = MAT('plain');
    const n = { 0: 11, 1: 8, 2: 13, 3: 22 }[kind];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * R * 0.72, px = x + cos(a) * d, pz = z + sin(a) * d;
      const py = H * 0.72 + (1 - d / R) * H * 0.45 + r() * 0.02;
      if (kind === 0) mk(g, G3.sphere(1, 7, 5), P, { p: [px, py, pz], s: [0.055, 0.045, 0.045], r: [0, r() * 3, r()], c: r() < 0.5 ? '#8a6a7a' : '#6a4a3e' });
      else if (kind === 1) {
        const ry = a + PI / 2 + (r() - 0.5);
        mk(g, G3.sphere(1, 8, 5), P, { p: [px, py, pz], s: [0.12, 0.028, 0.035], r: [0, ry, 0], c: r() < 0.5 ? '#b8c4cc' : '#9aa8b4' });
        mk(g, G3.cyl(0.0, 0.03, 0.06, 4), P, { p: [px + cos(ry) * 0.12, py, pz - sin(ry) * 0.12], r: [0, ry, PI / 2], c: '#7a8a96' });
      } else if (kind === 2) {
        mk(g, G3.sphere(0.042, 7, 5), P, { p: [px, py, pz], c: r() < 0.7 ? '#e8861e' : '#f0a030' });
        mk(g, G3.cbox(0.012, 0.012, 0.012), P, { p: [px, py + 0.042, pz], c: '#3a6a22', cast: false });
      } else mk(g, G3.sphere(1, 6, 4), P, { p: [px, py, pz], s: [0.06, 0.014, 0.028], r: [r() * 0.6, r() * TAU, r() * 0.4], c: r() < 0.5 ? '#4e7e34' : '#7aa850' });
    }
  }
  def('basket', {
    key: (o) => k(lay(o).v),
    build(o) {
      const v = lay(o).v, g = new THREE.Group();
      addBasket(g, 0.17, -0.2, 0.2, 0.2, v, 3 + v);
      addBasket(g, -0.1, 0.1, 0.27, 0.24, v, 7 + v);
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- cart 手推車 with rice sacks and a wine jar
  function addWheel(g, x, y, z) {
    const W = MAT('wood'), R = 0.34;
    mk(g, G3.torus(R - 0.02, 0.028, 4, 16), W, { p: [x, y, z], c: '#7a5434' });
    mk(g, G3.torus(R + 0.006, 0.014, 3, 16), W, { p: [x, y, z], c: '#2e2a28' }); // iron tyre
    mk(g, G3.cyl(0.06, 0.06, 0.1, 10), W, { p: [x, y, z - 0.05], r: [PI / 2, 0, 0], c: '#5a3a22' });
    for (let k2 = 0; k2 < 8; k2++) mk(g, G3.cbox(0.03, R * 0.95, 0.03), W, { p: [x + cos(k2 * PI / 4) * R * 0.48, y + sin(k2 * PI / 4) * R * 0.48, z], r: [0, 0, k2 * PI / 4 - PI / 2], c: '#6a4a2a' });
  }
  def('cart', {
    build() {
      const g = new THREE.Group(), W = MAT('wood');
      // bed: planks along x, side boards, end board
      const bx0 = -0.88, bx1 = 0.5, by = 0.42, bw = 0.7;
      for (let i = 0; i < 5; i++) mk(g, G3.box(bx1 - bx0, 0.035, bw / 5 - 0.008, 'x'), W, { p: [(bx0 + bx1) / 2, by, -bw / 2 + (i + 0.5) * bw / 5], c: i % 2 ? '#a37a4e' : '#94704a' });
      for (const s of [-1, 1]) {
        mk(g, G3.box(bx1 - bx0, 0.12, 0.03, 'x'), W, { p: [(bx0 + bx1) / 2, by + 0.035, s * (bw / 2 + 0.01)], c: '#6a4628' });
        mk(g, G3.box(1.62, 0.055, 0.055, 'x'), W, { p: [0.1, by - 0.055, s * 0.3], c: '#5a3a22' }); // shafts → handles
        mk(g, G3.rod(0.022, 0.28, 6), W, { p: [0.84, by - 0.03, s * 0.3], c: '#3a2416' });
        for (const x of [bx0 + 0.05, -0.2, bx1 - 0.05]) mk(g, G3.box(0.04, 0.16, 0.04), W, { p: [x, by + 0.03, s * (bw / 2 + 0.03)], c: '#5a3a22' });
        mk(g, G3.box(bx1 - bx0, 0.03, 0.03, 'x'), W, { p: [(bx0 + bx1) / 2, by + 0.18, s * (bw / 2 + 0.03)], c: '#6a4628' });
      }
      mk(g, G3.box(0.03, 0.18, bw + 0.06, 'z'), W, { p: [bx0 - 0.01, by + 0.03, 0], c: '#6a4628' });
      // axle, wheels, prop leg under the handles
      mk(g, G3.box(0.07, 0.07, 0.98, 'z'), W, { p: [-0.2, 0.31, 0], c: '#4a3020' });
      for (const s of [-1, 1]) addWheel(g, -0.2, 0.34, s * 0.46);
      for (const s of [-1, 1]) mk(g, G3.box(0.045, 0.37, 0.045), W, { p: [0.62, 0, s * 0.3], r: [0, 0, 0.08], c: '#4a3020' });
      // load
      addSack(g, -0.6, -0.14, 0.36, 0.3, 0.3, { y: by + 0.03, label: '米', rz: 0.05 });
      addSack(g, -0.25, -0.13, 0.36, 0.3, 0.3, { y: by + 0.03, label: '米', rz: -0.06 });
      addSack(g, -0.42, 0.04, 0.34, 0.27, 0.28, { y: by + 0.3, label: '米', rz: 0.1, col: '#e0d2ae' });
      addSack(g, -0.55, 0.18, 0.3, 0.26, 0.26, { y: by + 0.03, col: '#cbb890' });
      const jg = new THREE.Group(); jg.position.y = by + 0.03; g.add(jg); addJar(jg, 0.2, 0.12, 0.13, 0.32, { cloth: true });
      mk(g, G3.tube([V3(-0.05, by + 0.32, -0.36), V3(-0.3, by + 0.62, 0), V3(-0.55, by + 0.32, 0.36)], 0.008, 12, 4), MAT('cloth'), { c: '#c8b070', cast: false }); // lashing rope
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- stall 夜市攤 (awning, valance, counter banner, pot of 芋圓, lantern)
  const AWN = [['#c8342a', '#f0e6cf'], ['#2c3d6e', '#e8e0cc'], ['#3d7a5a', '#f0e6cf']];
  // atlas: v 0.5..1 awning stripes · v 0.375..0.5 scalloped valance · v 0..0.375 counter banner with text
  function stallTex(v, text) {
    const [c1, c2] = AWN[v];
    return TEX('stall:' + v + text, 512, 512, (g, w, h) => {
      const r = rng(hashStr(text) + v);
      g.clearRect(0, 0, w, h);
      const n = 12;
      for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * w / n, 0, w / n + 1, 256); }
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0.08)');
      g.fillStyle = gr; g.fillRect(0, 0, w, 256);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * w, r() * 256, 1 + r() * 8, 1); }
      // valance: scallops alternate colours, gold braid along the top
      const m = 16;
      for (let i = 0; i < m; i++) {
        g.fillStyle = i % 2 ? c2 : c1;
        g.beginPath(); g.moveTo(i * w / m, 256); g.lineTo((i + 1) * w / m, 256); g.lineTo((i + 1) * w / m, 290);
        g.quadraticCurveTo((i + 0.5) * w / m, 330, i * w / m, 290); g.closePath(); g.fill();
      }
      g.fillStyle = '#e8b53a'; g.fillRect(0, 256, w, 7); g.fillStyle = 'rgba(80,40,0,0.5)'; g.fillRect(0, 263, w, 2);
      // banner
      g.fillStyle = c2; g.fillRect(0, 320, w, 192);
      g.strokeStyle = c1; g.lineWidth = 10; g.strokeRect(10, 330, w - 20, 172);
      g.lineWidth = 3; g.strokeRect(24, 344, w - 48, 144);
      for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * w, 320 + r() * 192, 1 + r() * 8, 1); }
      const n2 = chars(text).length, size = min(118, (w - 80) / (n2 * 1.08));
      ink(g, text, w / 2, 416, size, c1 === '#f0e6cf' ? '#2a1a10' : c1, { vertical: false });
    }, 0, { wrap: false });
  }
  function regionUV(geo, v0, v1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0)); return geo; }
  def('stall', {
    key: (o) => { const L = lay(o); return k(L.v, L.text, L.lit); },
    build(o) {
      const L = lay(o), g = new THREE.Group(), W = MAT('wood'), B = MAT('bamboo'), PS = MAT('plain', 'sway');
      const text = String(L.text || '芋圓');
      const cloth = TMAT('stall:' + L.v + text, stallTex(L.v, text), { alphaTest: 0.5, roughness: 0.95, side: THREE.DoubleSide }, 'wave');
      // poles
      for (const sx of [-1, 1]) for (const [z, hh] of [[0.44, 2.06], [-0.44, 2.28]]) mk(g, G3.cyl(0.032, 0.036, hh, 7), B, { p: [sx * 0.93, 0, z], c: '#c2b46a' });
      for (const z of [0.44, -0.44]) mk(g, G3.rod(0.022, 1.96, 6), B, { p: [0, z > 0 ? 2.02 : 2.24, z], c: '#b0a45e' });
      // awning: sloping, slightly sagging cloth
      const aw = new THREE.PlaneGeometry(2.12, 1.2, 10, 4);
      const ap = aw.attributes.position;
      for (let i = 0; i < ap.count; i++) {
        const x = ap.getX(i), t = (ap.getY(i) + 0.6) / 1.2; // 0 back … 1 front
        ap.setXYZ(i, x, lerp(2.3, 2.03, t) - 0.035 * sin(PI * (x / 2.12 + 0.5)) * sin(PI * t), lerp(-0.52, 0.66, t));
      }
      aw.computeVertexNormals(); regionUV(aw, 0.5, 1);
      mk(g, aw, cloth, { noAO: true, c: '#ffffff' });
      // valance along the front edge (waves)
      const va = new THREE.PlaneGeometry(2.14, 0.2, 18, 2); va.translate(0, 1.93, 0.665); regionUV(va, 0.375, 0.5);
      mk(g, va, cloth, { noAO: true, c: '#ffffff', wave: { axis: 'y', from: 2.03, to: 1.83, amp: 0.035, ph: 0.5 } });
      // counter
      mk(g, G3.box(1.84, 0.74, 0.42, 'x'), W, { p: [0, 0.04, 0.22], c: '#6a4a2c' });
      for (let i = 0; i < 5; i++) mk(g, G3.box(1.86, 0.135, 0.02, 'x'), W, { p: [0, 0.06 + i * 0.145, 0.44], c: i % 2 ? '#7a5634' : '#6e4c2e' });
      mk(g, G3.box(1.98, 0.045, 0.52, 'x'), W, { p: [0, 0.78, 0.2], c: '#9a7048' });
      for (const sx of [-1, 1]) mk(g, G3.box(0.06, 0.04, 0.48), W, { p: [sx * 0.9, 0, 0.22], c: '#3a2616' });
      const bn = new THREE.PlaneGeometry(1.16, 0.43, 8, 2); bn.translate(0, 0.43, 0.457); regionUV(bn, 0, 0.375);
      mk(g, bn, cloth, { c: '#ffffff', wave: { axis: 'y', from: 0.64, to: 0.21, amp: 0.012, ph: 2 } });
      // pot of taro balls with ladle, bowl stacks, chopstick tube, cutting board
      const ty = 0.825;
      mk(g, G3.lathe([[0.17, 0], [0.2, 0.03], [0.205, 0.2], [0.215, 0.21], [0.19, 0.21], [0.18, 0.05], [0, 0.04]], 16), PS, { p: [-0.55, ty, 0.2], c: '#a8a8b0' });
      mk(g, G3.cyl(0.185, 0.185, 0.01, 16), PS, { p: [-0.55, ty + 0.17, 0.2], c: '#d8c49a', noAO: true });
      const r = rng(5);
      for (let i = 0; i < 14; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.15; mk(g, G3.sphere(0.018, 6, 4), PS, { p: [-0.55 + cos(a) * d, ty + 0.18, 0.2 + sin(a) * d], c: ['#b89aa8', '#e8c070', '#a0c080', '#e8e0d0'][i % 4], noAO: true }); }
      mk(g, G3.rod(0.008, 0.36, 5), PS, { p: [-0.48, ty + 0.27, 0.2], r: [0, 0.4, 0.75], c: '#5a3c24' });
      const bowl = () => G3.lathe([[0, 0], [0.035, 0], [0.06, 0.03], [0.075, 0.055], [0.07, 0.056], [0.055, 0.032], [0, 0.008]], 12);
      for (let i = 0; i < 4; i++) mk(g, bowl(), PS, { p: [0.0, ty + i * 0.022, 0.25], c: '#f2ede0' });
      mk(g, G3.torus(0.073, 0.004, 3, 14), PS, { p: [0.0, ty + 0.12, 0.25], r: [PI / 2, 0, 0], c: '#3a6aa0' });
      for (const [bx, bz] of [[0.3, 0.3], [0.48, 0.18]]) {
        mk(g, bowl(), PS, { p: [bx, ty, bz], c: '#f2ede0' });
        mk(g, G3.torus(0.073, 0.004, 3, 14), PS, { p: [bx, ty + 0.054, bz], r: [PI / 2, 0, 0], c: '#3a6aa0' });
        mk(g, G3.cyl(0.06, 0.06, 0.006, 10), PS, { p: [bx, ty + 0.042, bz], c: '#9a7aa0', noAO: true });
      }
      mk(g, G3.cyl(0.035, 0.035, 0.14, 8), B, { p: [0.72, ty, 0.3], c: '#b0a45e' });
      for (let i = 0; i < 6; i++) mk(g, G3.cyl(0.004, 0.004, 0.24, 3), W, { p: [0.71 + (i % 3) * 0.01, ty, 0.29 + floor(i / 3) * 0.012], r: [0.05 * (i - 3), 0, 0.04 * (i - 2)], c: '#c8a878', cast: false });
      mk(g, G3.box(0.36, 0.03, 0.24), W, { p: [0.62, ty, 0.08], r: [0, 0.2, 0], c: '#c49a68' });
      // stool behind
      mk(g, G3.cyl(0.14, 0.14, 0.04, 10), W, { p: [0.3, 0.42, -0.28], c: '#8a6440' });
      for (let i = 0; i < 4; i++) mk(g, G3.box(0.035, 0.42, 0.035), W, { p: [0.3 + cos(i * PI / 2 + 0.7) * 0.1, 0, -0.28 + sin(i * PI / 2 + 0.7) * 0.1], c: '#5a3c24' });
      // lantern under the front-right corner of the awning
      addLantern(g, { x: 0.78, y: 1.52, z: 0.6, R: 0.12, H: 0.24, col: '#d42f25', lit: L.lit, pivot: [0.78, 1.84, 0.6], ph: 1.3 });
      g.add(particles('steam', 7, -0.55, ty + 0.2, 0.2, 3));
      return tagged(bake(g));
    },
    update(node, o, t) { tick(t); },
    lights(o) { return lay(o).lit ? [{ x: 0.78, y: 1.5, z: 0.6, color: '#ff8a46', intensity: 1, distance: 3.6, flicker: 0.2 }, { x: -0.3, y: 1.7, z: 0.3, color: '#ffc890', intensity: 0.6, distance: 3, flicker: 0.05 }] : []; },
  });

  // ---------------------------------------------------------------- signboard 立牌 (brush calligraphy on both faces)
  function signTex(text, red) {
    return TEX('sign:' + text + (red ? 'r' : ''), 384, 512, (g, w, h) => {
      const r = rng(hashStr(text));
      const bg = red ? '#a3241e' : '#e8dcbc', fg = red ? '#ffe7b0' : '#1e140e';
      const cw = w * 2 / 3;
      g.fillStyle = bg; g.fillRect(0, 0, cw, h);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${red ? '40,0,0' : '120,90,50'},${0.04 + r() * 0.08})`; const x = r() * cw; g.fillRect(x, 0, 1 + r() * 3, h); }
      blotch(g, cw, h, r, 8, red ? '60,0,0' : '120,90,50', 0.12, 20, 70);
      g.strokeStyle = red ? 'rgba(255,220,150,0.6)' : 'rgba(80,40,20,0.5)'; g.lineWidth = 3; g.strokeRect(14, 14, cw - 28, h - 28);
      inkFit(g, text, cw / 2, h / 2, cw * 0.68, h * 0.86, fg, { spacing: 1.1, shadow: red });
      g.fillStyle = '#3a2418'; g.fillRect(cw, 0, w - cw, h); // edge cell
    }, 0, { wrap: false });
  }
  def('signboard', {
    key: (o) => { const L = lay(o); return k(L.text, o.v === 1); },
    build(o) {
      const L = lay(o), g = new THREE.Group(), W = MAT('wood');
      const text = String(L.text || '客棧'), n = max(1, chars(text).length), red = o.v === 1;
      const bh = max(0.62, n * 0.2 + 0.2), y0 = 0.72, bw = 0.34;
      for (const s of [-1, 1]) {
        mk(g, G3.rbox(0.13, 0.08, 0.13, 0.02), MAT('stone'), { p: [s * 0.21, 0, 0], c: '#8a857a' });
        mk(g, G3.box(0.07, y0 + bh + 0.1, 0.07), W, { p: [s * 0.21, 0.02, 0], c: '#4a3220' });
      }
      const board = new THREE.BoxGeometry(bw, bh, 0.045); board.translate(0, bh / 2, 0);
      { const uv = board.attributes.uv; for (let i = 0; i < uv.count; i++) { const f = floor(i / 4); if (f < 4) uv.setX(i, 2 / 3 + uv.getX(i) / 3); else uv.setX(i, uv.getX(i) * 2 / 3); } }
      mk(g, board, TMAT('sign:' + text + red, signTex(text, red), { roughness: 0.7 }), { p: [0, y0, 0] });
      for (const y of [y0 - 0.04, y0 + bh]) mk(g, G3.box(0.48, 0.045, 0.06, 'x'), W, { p: [0, y, 0], c: '#3a2418' });
      // little tiled cap 頂蓋
      for (const s of [-1, 1]) mk(g, G3.cbox(0.56, 0.025, 0.14, 'x'), W, { p: [0, y0 + bh + 0.115, s * 0.055], r: [s * 0.45, 0, 0], c: '#33343c' });
      mk(g, G3.rod(0.018, 0.6, 6), W, { p: [0, y0 + bh + 0.145, 0], c: '#22232a' });
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- fences (wood: posts + rails; bamboo: stakes + lashed rails)
  function fenceBuild(o, bamboo) {
    const L = lay(o), vert = L.h > 1 && L.w === 1, len = vert ? L.h : L.w;
    const g = new THREE.Group(), r = rng(len * 31 + (bamboo ? 7 : 3));
    if (!bamboo) {
      const W = MAT('wood'), n = max(2, round(len / 0.55) + 1);
      for (let i = 0; i < n; i++) {
        const x = lerp(-len / 2 + 0.07, len / 2 - 0.07, i / (n - 1)), hh = 0.72 + (r() - 0.5) * 0.06;
        const c = new THREE.Color('#7a6650').offsetHSL(0, (r() - 0.5) * 0.05, (r() - 0.5) * 0.06);
        mk(g, G3.box(0.085, hh, 0.085), W, { p: [x, 0, 0], r: [(r() - 0.5) * 0.04, 0, (r() - 0.5) * 0.05], c: '#' + c.getHexString() });
        const cap = new THREE.ConeGeometry(0.062, 0.06, 4); cap.rotateY(PI / 4); cap.translate(0, 0.03, 0); projUV(cap);
        mk(g, cap, W, { p: [x, hh, 0], c: '#8a7660' });
      }
      for (const y of [0.3, 0.56]) {
        mk(g, G3.box(len - 0.04, 0.07, 0.035, 'x'), W, { p: [0, y, 0.058], r: [0, 0, (r() - 0.5) * 0.02], c: '#8a7458' });
        for (let i = 0; i < n; i++) { const x = lerp(-len / 2 + 0.07, len / 2 - 0.07, i / (n - 1)); mk(g, G3.cbox(0.012, 0.012, 0.006), W, { p: [x, y + 0.035, 0.078], c: '#1a1410', cast: false }); }
      }
    } else {
      const B = MAT('bamboo'), n = max(3, floor(len / 0.105));
      for (let i = 0; i < n; i++) {
        const x = lerp(-len / 2 + 0.05, len / 2 - 0.05, i / (n - 1)), rad = 0.022 + r() * 0.01, hh = 0.74 + (i % 2) * 0.07 + r() * 0.08;
        const c = new THREE.Color('#b4b46a').lerp(new THREE.Color('#86964a'), r() * 0.7);
        mk(g, G3.cyl(rad, rad * 1.05, hh, 6), B, { p: [x, 0, (r() - 0.5) * 0.02], r: [0, r() * 3, (r() - 0.5) * 0.04], c: '#' + c.getHexString() });
      }
      for (const y of [0.3, 0.6]) {
        mk(g, G3.rod(0.02, len - 0.02, 6), B, { p: [0, y, 0.045], c: '#a8a05a' });
        for (let i = 1; i < n; i += 3) { const x = lerp(-len / 2 + 0.05, len / 2 - 0.05, i / (n - 1)); mk(g, G3.torus(0.028, 0.006, 3, 8), MAT('plain'), { p: [x, y, 0.03], r: [0, PI / 2, 0.6], c: '#8a7048', cast: false }); }
      }
    }
    if (vert) g.rotation.y = -PI / 2;
    const out = new THREE.Group(); out.add(g);
    return tagged(bake(out));
  }
  for (const [id, bam] of [['fence_wood', false], ['fence_bamboo', true]]) def(id, { key: (o) => { const L = lay(o); return k(L.w, L.h); }, build: (o) => fenceBuild(o, bam) });

  // ---------------------------------------------------------------- bench (v1 = granite slab)
  def('bench', {
    key: (o) => k(lay(o).w, o.v === 1),
    build(o) {
      const L = lay(o), W = L.w, g = new THREE.Group(), len = W - 0.12;
      const legs = [-(len / 2 - 0.16), len / 2 - 0.16]; if (W > 2) legs.push(0);
      if (o.v === 1) {
        const S = MAT('stone');
        mk(g, G3.rbox(len, 0.1, 0.4, 0.025, 'x'), S, { p: [0, 0.34, 0], c: '#c8c3b6', top: ['#7a8a5a', 0.15] });
        for (const x of legs) mk(g, G3.rbox(0.26, 0.35, 0.32, 0.03), S, { p: [x, 0, 0], c: '#a29d90' });
      } else {
        const Wd = MAT('wood');
        for (let i = 0; i < 3; i++) mk(g, G3.box(len, 0.035, 0.115, 'x'), Wd, { p: [0, 0.42, (i - 1) * 0.125], c: i % 2 ? '#a87a4e' : '#9a6e44' });
        for (const s of [-1, 1]) mk(g, G3.box(len - 0.1, 0.07, 0.025, 'x'), Wd, { p: [0, 0.35, s * 0.15], c: '#6a4628' });
        for (const x of legs) {
          for (const s of [-1, 1]) mk(g, G3.box(0.06, 0.42, 0.06), Wd, { p: [x, 0, s * 0.15], r: [-s * 0.08, 0, 0], c: '#5a3c24' });
          mk(g, G3.box(0.04, 0.05, 0.34, 'z'), Wd, { p: [x, 0.12, 0], c: '#4a3220' });
        }
        mk(g, G3.box(len - 0.3, 0.04, 0.04, 'x'), Wd, { p: [0, 0.12, 0], c: '#4a3220' });
      }
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- laundry 曬衣竿: bamboo pole on forked posts, waving clothes
  const CLOTHES = ['#2c3d6e', '#f0ece2', '#c8342a', '#d9a23a', '#6a8a9a', '#f0ece2'];
  // atlas cells: 0 大襟衫 side-fastened shirt · 1 trousers · 2 long cloth / towel (white, tinted per item)
  function laundryTex() {
    return TEX('laundry', 768, 256, (g, w, h) => {
      const r = rng(77);
      const shade = (x0) => { const gr = g.createLinearGradient(x0, 0, x0 + 256, 0); gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)'); return gr; };
      const fill = (x0, path) => {
        g.save(); path(); g.fillStyle = '#f4f1ea'; g.fill(); g.clip();
        g.fillStyle = shade(x0); g.fillRect(x0, 0, 256, h);
        for (let i = 0; i < 9; i++) { const x = x0 + 30 + r() * 196; g.fillStyle = `rgba(0,0,0,${0.06 + r() * 0.08})`; g.fillRect(x, 0, 3 + r() * 6, h); } // hanging folds
        for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(x0, y, 256, 1); }
        g.restore();
      };
      // shirt: sleeves out, curved 大襟 front opening with knot buttons
      fill(0, () => { g.beginPath(); g.moveTo(70, 6); g.lineTo(186, 6); g.lineTo(252, 26); g.lineTo(250, 92); g.lineTo(196, 86); g.lineTo(196, 250); g.lineTo(60, 250); g.lineTo(60, 86); g.lineTo(6, 92); g.lineTo(4, 26); g.closePath(); });
      g.strokeStyle = 'rgba(30,20,10,0.55)'; g.lineWidth = 4; g.beginPath(); g.moveTo(112, 8); g.quadraticCurveTo(160, 40, 168, 110); g.lineTo(168, 248); g.stroke();
      g.fillStyle = 'rgba(30,20,10,0.6)'; for (const [x, y] of [[132, 22], [156, 60], [168, 120], [168, 170]]) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(60, 86, 136, 4);
      // trousers: wide legs, folded waist band
      fill(256, () => { g.beginPath(); g.moveTo(256 + 58, 4); g.lineTo(256 + 198, 4); g.lineTo(256 + 214, 252); g.lineTo(256 + 140, 252); g.lineTo(256 + 128, 110); g.lineTo(256 + 116, 252); g.lineTo(256 + 42, 252); g.closePath(); });
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(256 + 58, 4, 140, 26);
      // long cloth with woven stripes near the ends
      fill(512, () => { g.beginPath(); g.rect(512 + 50, 2, 156, 252); });
      g.fillStyle = 'rgba(160,40,30,0.55)'; for (const y of [210, 226]) g.fillRect(512 + 50, y, 156, 6);
      g.fillStyle = 'rgba(255,255,255,0.4)'; for (let x = 512 + 52; x < 512 + 206; x += 6) g.fillRect(x, 248, 2, 8);
    }, 0, { wrap: false });
  }
  def('laundry', {
    key: (o) => k(lay(o).w),
    build(o) {
      const L = lay(o), Wd = L.w, g = new THREE.Group(), B = MAT('bamboo');
      const px = Wd / 2 - 0.12, py = 1.8;
      for (const s of [-1, 1]) {
        mk(g, G3.cyl(0.07, 0.09, 0.1, 8), MAT('stone'), { p: [s * px, 0, 0], c: '#8a857a' });
        mk(g, G3.cyl(0.03, 0.035, py - 0.04, 7), B, { p: [s * px, 0.02, 0], r: [0, 0, s * 0.02], c: '#c2b46a' });
        for (const f of [-1, 1]) mk(g, G3.cyl(0.018, 0.022, 0.22, 6), B, { p: [s * px, py - 0.12, 0], r: [f * 0.42, 0, 0], c: '#b8aa60' });
        mk(g, G3.torus(0.035, 0.008, 3, 8), B, { p: [s * px, py - 0.1, 0], r: [PI / 2, 0, 0], c: '#6a5030', cast: false });
      }
      mk(g, G3.rod(0.022, Wd - 0.05, 7), B, { p: [0, py, 0], c: '#b0a45e' });
      const n = max(2, floor((Wd * 64 - 24) / 24));
      const mat = TMAT('laundry', laundryTex(), { alphaTest: 0.5, roughness: 0.95, side: THREE.DoubleSide }, 'wave');
      const size = [[0.6, 0.56], [0.4, 0.72], [0.34, 0.7]];
      const r = rng(Wd * 13);
      for (let i = 0; i < n; i++) {
        const kind = i % 3, [w, h] = size[kind];
        const x = lerp(-px + 0.3, px - 0.3, n > 1 ? i / (n - 1) : 0.5);
        const pl = new THREE.PlaneGeometry(w, h, 4, 6); pl.translate(0, -h / 2, 0);
        const uv = pl.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, (kind + uv.getX(j)) / 3);
        const top = py - 0.01;
        mk(g, pl, mat, { p: [x, top, 0.005], r: [0, (r() - 0.5) * 0.3, 0], c: CLOTHES[(i * 2 + Wd) % CLOTHES.length], wave: { axis: 'y', from: top, to: top - h, amp: 0.07, ph: i * 1.3, pow: 1.3 } });
        for (const s of [-1, 1]) mk(g, G3.cbox(0.018, 0.05, 0.03), B, { p: [x + s * w * 0.32, top - 0.005, 0.02], c: '#a8865a', cast: false });
      }
      return tagged(bake(g));
    },
    update(node, o, t) { tick(t); },
  });

  // =================================================================================================
  // guardians, flags, tombs, fire
  // =================================================================================================
  // scaled sphere ("blob") — the sculpting primitive for carved figures
  const blob = (g, mat, p, s, c, o = {}) => mk(g, G3.sphere(1, o.ws || 8, o.hs || 5), mat, Object.assign({ p, s, c }, o));
  // ring of mane curls 鬃捲 around a head centre, in the x-y plane (facing +z)
  function curls(g, mat, cx, cy, cz, R, n, r, c, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * TAU;
      if (o.skipBottom && sin(a) < -0.55) continue;
      blob(g, mat, [cx + cos(a) * R, cy + sin(a) * R * (o.sy || 1), cz + (o.dz || 0)], [r, r, r * 0.8], c, { ws: 5, hs: 4 });
    }
  }

  // ---------------------------------------------------------------- statue_lion 石獅 (v0 male: paw on 繡球, mouth open; v1 female: cub, mouth closed)
  def('statue_lion', {
    key: (o) => k(lay(o).v, !!o.flip),
    build(o) {
      const v = lay(o).v, side = o.flip ? -1 : 1, g = new THREE.Group(), S = MAT('stone');
      const C = '#b6b2a5', L2 = '#c8c4b8', D = '#7e7a6e';
      // 須彌座 pedestal with a recessed carved panel
      mk(g, G3.rbox(0.66, 0.1, 0.54, 0.025), S, { c: '#a29d90' });
      mk(g, G3.rbox(0.52, 0.16, 0.42, 0.02), S, { p: [0, 0.1, 0], c: '#b0ab9e' });
      for (const s of [-1, 1]) mk(g, G3.box(0.36, 0.1, 0.012), S, { p: [0, 0.13, s * 0.212], c: '#8e897e', ao: 0.8 });
      for (const s of [-1, 1]) mk(g, G3.box(0.012, 0.1, 0.3), S, { p: [s * 0.262, 0.13, 0], c: '#8e897e', ao: 0.8 });
      mk(g, G3.rbox(0.62, 0.08, 0.52, 0.025), S, { p: [0, 0.26, 0], c: '#c2bdb0', top: ['#7a8a5a', 0.15] });
      const y0 = 0.34;
      // haunches, hind paws, torso, chest
      for (const s of [-1, 1]) { blob(g, S, [s * 0.13, y0 + 0.14, -0.08], [0.15, 0.15, 0.19], C); blob(g, S, [s * 0.15, y0 + 0.035, 0.06], [0.07, 0.045, 0.1], C); }
      blob(g, S, [0, y0 + 0.3, -0.03], [0.17, 0.26, 0.16], C, { r: [-0.25, 0, 0] });
      blob(g, S, [0, y0 + 0.36, 0.08], [0.15, 0.17, 0.12], L2);
      // front legs (one raised onto the ball / cub)
      for (const s of [-1, 1]) {
        const up = s === side;
        const top = V3(s * 0.1, y0 + 0.38, 0.1), foot = up ? V3(s * 0.13, y0 + (v === 0 ? 0.2 : 0.15), 0.22) : V3(s * 0.1, y0 + 0.04, 0.17);
        const len = top.distanceTo(foot), mid = top.clone().add(foot).multiplyScalar(0.5);
        const leg = G3.cyl(0.05, 0.058, len, 7); leg.translate(0, -len / 2, 0);
        const m = mk(g, leg, S, { p: [mid.x, mid.y, mid.z], c: C });
        m.quaternion.setFromUnitVectors(V3(0, 1, 0), top.clone().sub(foot).normalize());
        blob(g, S, [foot.x, foot.y, foot.z + 0.01], [0.065, 0.045, 0.08], L2);
        for (let t = -1; t <= 1; t++) blob(g, S, [foot.x + t * 0.03, foot.y - 0.005, foot.z + 0.08], [0.02, 0.02, 0.02], L2, { ws: 4, hs: 3 });
      }
      if (v === 0) { // embroidered ball 繡球 with ribbon
        blob(g, S, [side * 0.13, y0 + 0.09, 0.22], [0.09, 0.09, 0.09], L2, { ws: 10, hs: 7 });
        mk(g, G3.torus(0.09, 0.012, 4, 14), S, { p: [side * 0.13, y0 + 0.09, 0.22], r: [0.4, 0.6, 0], c: D });
        mk(g, G3.torus(0.09, 0.012, 4, 14), S, { p: [side * 0.13, y0 + 0.09, 0.22], r: [-0.4, -0.5, 1.2], c: D });
      } else { // cub playing under the paw
        blob(g, S, [side * 0.13, y0 + 0.06, 0.18], [0.07, 0.06, 0.09], L2);
        blob(g, S, [side * 0.1, y0 + 0.1, 0.27], [0.052, 0.05, 0.05], L2);
        curls(g, S, side * 0.1, y0 + 0.1, 0.25, 0.05, 6, 0.018, C);
      }
      // head, face, mane
      const hy = y0 + 0.6, hz = 0.07;
      curls(g, S, 0, hy + 0.01, hz - 0.06, 0.19, 14, 0.062, C);
      curls(g, S, 0, hy + 0.02, hz - 0.13, 0.08, 4, 0.065, C);
      blob(g, S, [0, hy, hz], [0.17, 0.16, 0.15], L2, { ws: 9, hs: 6 });
      mk(g, G3.rbox(0.17, 0.09, 0.1, 0.035), S, { p: [0, hy - 0.11, hz + 0.12], c: L2 });
      blob(g, S, [0, hy - 0.035, hz + 0.21], [0.045, 0.032, 0.03], C);
      for (const s of [-1, 1]) {
        blob(g, S, [s * 0.065, hy + 0.06, hz + 0.12], [0.042, 0.042, 0.035], '#dedad0', { ws: 7, hs: 5 });
        blob(g, S, [s * 0.065, hy + 0.06, hz + 0.152], [0.016, 0.016, 0.01], '#5e5a50', { ws: 5, hs: 3 });
        mk(g, G3.cbox(0.09, 0.028, 0.05), S, { p: [s * 0.068, hy + 0.105, hz + 0.125], r: [0, 0, s * 0.3], c: C });
        blob(g, S, [s * 0.15, hy + 0.12, hz - 0.02], [0.04, 0.03, 0.025], C, { ws: 6, hs: 4 });
      }
      if (v === 0) {
        blob(g, S, [0, hy - 0.165, hz + 0.15], [0.065, 0.035, 0.03], '#5a3a32', { ao: 0.75 });
        for (const s of [-1, 1]) mk(g, G3.cyl(0.0, 0.012, 0.03, 4), S, { p: [s * 0.04, hy - 0.135, hz + 0.17], r: [PI, 0, 0], c: '#e4e0d4' });
        blob(g, S, [0, hy - 0.2, hz + 0.12], [0.07, 0.025, 0.05], L2);
      } else blob(g, S, [0, hy - 0.155, hz + 0.13], [0.065, 0.016, 0.045], D);
      curls(g, S, 0, hy - 0.24, hz + 0.09, 0.05, 3, 0.032, C, { sy: 0.5 });
      // collar with bell, tail curls
      mk(g, G3.torus(0.13, 0.016, 3, 14), S, { p: [0, y0 + 0.45, 0.04], r: [PI / 2 - 0.35, 0, 0], c: D });
      blob(g, S, [0, y0 + 0.4, 0.17], [0.034, 0.034, 0.034], L2);
      for (let i = 0; i < 3; i++) blob(g, S, [0, y0 + 0.22 + i * 0.09, -0.19 - i * 0.015], [0.05, 0.045, 0.04], C, { ws: 7, hs: 5 });
      return tagged(bake(g, { ao: 0.4, aoH: 0.4 }));
    },
  });

  // ---------------------------------------------------------------- wind_lion 風獅爺 (Kinmen): standing, grinning, red cape
  def('wind_lion', {
    build() {
      const g = new THREE.Group(), S = MAT('stone'), C = '#c8b890', L2 = '#d6caa8';
      mk(g, G3.rbox(0.52, 0.14, 0.44, 0.03), S, { c: '#a8987a', top: ['#7a8a5a', 0.15] });
      mk(g, G3.rbox(0.42, 0.06, 0.36, 0.02), S, { p: [0, 0.14, 0], c: '#b8a888' });
      const y0 = 0.2;
      for (const s of [-1, 1]) {
        mk(g, G3.cyl(0.065, 0.075, 0.3, 9), S, { p: [s * 0.09, y0, 0], c: C });
        blob(g, S, [s * 0.09, y0 + 0.03, 0.06], [0.075, 0.045, 0.1], L2);
      }
      blob(g, S, [0, y0 + 0.5, 0], [0.18, 0.25, 0.15], C);
      blob(g, S, [0, y0 + 0.43, 0.1], [0.12, 0.14, 0.06], L2);
      for (const s of [-1, 1]) {
        const sh = V3(s * 0.16, y0 + 0.64, 0.02), hd = V3(s * 0.06, y0 + 0.44, 0.16);
        const len = sh.distanceTo(hd), mid = sh.clone().add(hd).multiplyScalar(0.5);
        const arm = G3.cyl(0.045, 0.05, len, 8); arm.translate(0, -len / 2, 0);
        mk(g, arm, S, { p: [mid.x, mid.y, mid.z], c: C }).quaternion.setFromUnitVectors(V3(0, 1, 0), sh.clone().sub(hd).normalize());
        blob(g, S, [hd.x, hd.y, hd.z], [0.048, 0.042, 0.045], L2);
      }
      const hy = y0 + 0.88, hz = 0.03;
      curls(g, S, 0, hy, hz - 0.05, 0.2, 14, 0.06, C);
      curls(g, S, 0, hy + 0.02, hz - 0.12, 0.11, 7, 0.06, C);
      blob(g, S, [0, hy, hz], [0.185, 0.17, 0.16], L2);
      for (const s of [-1, 1]) {
        blob(g, S, [s * 0.07, hy + 0.035, hz + 0.13], [0.046, 0.046, 0.035], '#f2ece0', { ws: 9, hs: 6 });
        blob(g, S, [s * 0.07, hy + 0.035, hz + 0.163], [0.02, 0.02, 0.01], '#2a2418', { ws: 6, hs: 4 });
        mk(g, G3.cbox(0.09, 0.025, 0.04), S, { p: [s * 0.07, hy + 0.09, hz + 0.135], r: [0, 0, s * 0.25], c: '#8a7a5a' });
      }
      blob(g, S, [0, hy - 0.03, hz + 0.17], [0.05, 0.035, 0.035], '#b8a47e');
      // wide grin: red mouth, white teeth
      mk(g, G3.rbox(0.18, 0.05, 0.05, 0.02), S, { p: [0, hy - 0.12, hz + 0.12], c: '#9a3428' });
      for (let i = -2; i <= 2; i++) mk(g, G3.cbox(0.022, 0.018, 0.02), S, { p: [i * 0.03, hy - 0.087, hz + 0.15], c: '#f2ece0' });
      // red cape 紅披風, tied at the throat
      const cape = new THREE.CylinderGeometry(0.15, 0.27, 0.6, 12, 6, true, PI / 2 + 0.25, PI - 0.5); cape.translate(0, -0.3, 0);
      mk(g, cape, MAT('cloth', 'wave'), { p: [0, y0 + 0.72, -0.01], c: '#c8322a', wave: { axis: 'y', from: y0 + 0.72, to: y0 + 0.12, amp: 0.05, ph: 0.8 } });
      blob(g, MAT('cloth', 'wave'), [0, y0 + 0.69, 0.13], [0.04, 0.035, 0.03], '#c8322a');
      for (const s of [-1, 1]) mk(g, G3.cbox(0.05, 0.13, 0.012), MAT('cloth', 'wave'), { p: [s * 0.03, y0 + 0.62, 0.15], r: [0.1, 0, s * 0.25], c: '#b02a22', wave: { axis: 'y', from: y0 + 0.69, to: y0 + 0.55, amp: 0.02, ph: 1.7 } });
      return tagged(bake(g, { ao: 0.4 }));
    },
    update(node, o, t) { tick(t); },
  });

  // ---------------------------------------------------------------- banner 旗: tall pole, crossbar, flag with flame-teeth edge 火焰邊
  function bannerTex(col, edge, txt) {
    return TEX('banner:' + col + edge + txt, 256, 768, (g, w, h) => {
      const r = rng(hashStr(txt + col));
      const bw = 200, bh = 700;
      g.clearRect(0, 0, w, h);
      g.fillStyle = edge;
      const n = 12; // free-side teeth
      g.beginPath(); g.moveTo(bw - 2, 0);
      for (let i = 0; i < n; i++) { g.lineTo(w - 4, (i + 0.5) * bh / n); g.lineTo(bw - 2, (i + 1) * bh / n); }
      g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, bh - 2); // bottom teeth
      for (let i = 0; i < 4; i++) { g.lineTo((i + 0.5) * bw / 4, h - 4); g.lineTo((i + 1) * bw / 4, bh - 2); }
      g.closePath(); g.fill();
      g.fillStyle = col; g.fillRect(0, 0, bw, bh);
      const gr = g.createLinearGradient(0, 0, bw, 0); gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
      g.fillStyle = gr; g.fillRect(0, 0, bw, bh);
      for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.07})`; g.fillRect(r() * bw, r() * bh, 1 + r() * 10, 1); }
      g.fillStyle = edge; g.fillRect(0, 0, 14, bh); g.fillRect(0, 0, bw, 10);
      for (let y = 30; y < bh; y += 60) { g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(7, y, 4, 0, TAU); g.fill(); } // pole rings
      inkFit(g, txt, bw / 2 + 6, bh / 2, bw * 0.72, bh * 0.8, '#fff0c0', { max: 150, shadow: true });
    }, 0, { wrap: false });
  }
  def('banner', {
    key: (o) => { const L = lay(o); return k(L.col, L.edge, L.txt); },
    build(o) {
      const L = lay(o), g = new THREE.Group(), W = MAT('wood'), px = -0.2;
      for (const s of [-1, 1]) mk(g, G3.rbox(0.07, 0.5, 0.22, 0.015), MAT('stone'), { p: [px + s * 0.075, 0, 0], c: '#a8a397', top: ['#7a8a5a', 0.2] });
      mk(g, G3.rod(0.016, 0.24, 6), W, { p: [px, 0.38, 0], r: [0, PI / 2, 0], c: '#3a2a1a' });
      mk(g, G3.cyl(0.035, 0.045, 2.78, 9), W, { p: [px, 0, 0], c: '#7a5434' });
      mk(g, G3.rod(0.02, 0.6, 6), W, { p: [px + 0.28, 2.56, 0], c: '#4a3020' });
      mk(g, G3.sphere(0.045, 9, 7), W, { p: [px, 2.84, 0], c: '#e0b048' });
      mk(g, G3.cyl(0.0, 0.03, 0.12, 6), W, { p: [px, 2.86, 0], c: '#e0b048' });
      const fw = 0.56, fh = 1.5;
      const pl = new THREE.PlaneGeometry(fw, fh, 8, 12); pl.translate(px + 0.035 + fw / 2, 2.54 - fh / 2, 0);
      mk(g, pl, TMAT('banner:' + L.col + L.edge + L.txt, bannerTex(L.col, L.edge, L.txt), { alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }, 'wave'),
        { wave: { axis: 'x', from: px + 0.035, to: px + 0.035 + fw, amp: 0.1, ph: 0.3 } });
      return tagged(bake(g));
    },
    update(node, o, t) { tick(t); },
  });

  // ---------------------------------------------------------------- pilgrim_flag 進香旗: red pole, triangular 令旗 with serrated border, bell and 香火袋
  function pflagTex(text, col) {
    return TEX('pflag:' + text + col, 256, 256, (g, w, h) => {
      const fw = w - 6, fh = h;
      const lerp2 = (a, b, t) => a + (b - a) * t;
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#c8302a';
      const n = 12;
      g.beginPath(); g.moveTo(0, 0);
      for (let i = 0; i < n; i++) { const u1 = (i + 0.5) / n, u2 = (i + 1) / n; g.lineTo(lerp2(0, fw, u1) + 8, lerp2(0, fh / 2, u1) - 12); g.lineTo(lerp2(0, fw, u2), lerp2(0, fh / 2, u2)); }
      for (let i = 0; i < n; i++) { const u1 = (i + 0.5) / n, u2 = (i + 1) / n; g.lineTo(lerp2(fw, 0, u1) + 8, lerp2(fh / 2, fh, u1) + 12); g.lineTo(lerp2(fw, 0, u2), lerp2(fh / 2, fh, u2)); }
      g.closePath(); g.fill();
      const tri = (ins) => { g.beginPath(); g.moveTo(ins, ins * 1.4); g.lineTo(fw - ins * 2.2, fh / 2); g.lineTo(ins, fh - ins * 1.4); g.closePath(); };
      tri(22); const gr = g.createLinearGradient(0, 0, fw, 0); gr.addColorStop(0, col); gr.addColorStop(1, new THREE.Color(col).multiplyScalar(0.85).getStyle()); g.fillStyle = gr; g.fill();
      tri(30); g.strokeStyle = '#c8302a'; g.lineWidth = 3; g.stroke();
      const cs = chars(text);
      inkFit(g, text, 62, fh / 2, 60, min(fh * 0.66, cs.length * 56), '#1a1a1a', { max: 56 });
    }, 0, { wrap: false });
  }
  def('pilgrim_flag', {
    key: (o) => k(o.text || '進香', o.color || '#f1c232'),
    build(o) {
      const text = String(o.text || '進香'), col = o.color || '#f1c232';
      const g = new THREE.Group(), px = -0.06, top = 2.62;
      mk(g, G3.rbox(0.26, 0.14, 0.26, 0.02), MAT('stone'), { p: [px, 0, 0], c: '#8a8278' });
      mk(g, G3.cyl(0.022, 0.028, top, 8), MAT('lacquer'), { p: [px, 0.1, 0], c: '#b8281e' });
      mk(g, G3.cyl(0.03, 0.03, 0.05, 8), MAT('metal'), { p: [px, top + 0.05, 0], c: '#e2b04a' });
      mk(g, G3.lathe([[0.0, 0], [0.035, 0.02], [0.03, 0.08], [0.0, 0.18]], 6), MAT('metal'), { p: [px, top + 0.1, 0], c: '#e2b04a' });
      const fw = 0.72, fh = 0.74;
      const pl = new THREE.PlaneGeometry(fw, fh, 8, 6); pl.translate(px + 0.025 + fw / 2, top - fh / 2, 0);
      mk(g, pl, TMAT('pflag:' + text + col, pflagTex(text, col), { alphaTest: 0.5, roughness: 0.9, side: THREE.DoubleSide }, 'wave'),
        { wave: { axis: 'x', from: px + 0.025, to: px + 0.025 + fw, amp: 0.08, ph: 1.1 } });
      // bell + incense pouch on a red cord (sway)
      const PS = MAT('plain', 'sway'), piv = [px - 0.02, top - 0.04, 0];
      mk(g, G3.cyl(0.004, 0.004, 0.2, 3), PS, { p: [px - 0.07, top - 0.24, 0], r: [0, 0, -0.25], c: '#c8302a', sway: [...piv, 0.5], cast: false });
      mk(g, G3.lathe([[0, 0], [0.03, 0.0], [0.028, 0.02], [0.02, 0.045], [0, 0.05]], 8), PS, { p: [px - 0.12, top - 0.3, 0], c: '#e2b04a', sway: [...piv, 0.5] });
      mk(g, G3.cyl(0.004, 0.004, 0.32, 3), PS, { p: [px - 0.02, top - 0.36, 0], r: [0, 0, 0.15], c: '#c8302a', sway: [...piv, 1.4], cast: false });
      mk(g, G3.rbox(0.075, 0.1, 0.03, 0.01), PS, { p: [px - 0.07, top - 0.46, 0], c: '#d23a2c', sway: [...piv, 1.4] });
      mk(g, G3.box(0.04, 0.012, 0.032), PS, { p: [px - 0.07, top - 0.4, 0], c: '#f0c75a', sway: [...piv, 1.4] });
      return tagged(bake(g));
    },
    update(node, o, t) { tick(t); },
  });

  // ---------------------------------------------------------------- grave 墓 (v0 Taiwanese horseshoe tomb, v1 weathered old stone, v2 wooden marker)
  function tombTex(kind) {
    return TEX('tomb:' + kind, 256, 384, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      if (kind === 0) {
        ink(g, '金浦', w / 2, 46, 40, '#a8261c', { vertical: false });
        inkFit(g, '顯考陳公之墓', w / 2, h * 0.58, 70, h * 0.66, '#a8261c', { spacing: 1.02 });
        inkFit(g, '民國', w * 0.18, h * 0.45, 26, 70, '#a8261c');
        inkFit(g, '孝男立', w * 0.82, h * 0.7, 26, 100, '#a8261c');
      } else if (kind === 1) {
        inkFit(g, '之墓', w / 2, h * 0.55, 80, h * 0.5, 'rgba(40,40,34,0.75)', { dry: true });
      } else inkFit(g, '故人之墓', w / 2, h * 0.5, 70, h * 0.84, 'rgba(20,12,8,0.85)');
    }, 0, { wrap: false });
  }
  function tuftTex() {
    return TEX('tuft', 128, 128, (g, w, h) => {
      const r = rng(5);
      for (let i = 0; i < 60; i++) {
        const x = 10 + r() * 108, l = 40 + r() * 80, bend = (r() - 0.5) * 40;
        g.strokeStyle = `rgb(${70 + r() * 60},${110 + r() * 60},${40 + r() * 30})`; g.lineWidth = 2 + r() * 3;
        g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + bend * 0.3, h - l * 0.6, x + bend, h - l); g.stroke();
      }
    }, 0, { wrap: false });
  }
  function tufts(g, pts, s = 1) {
    const mat = TMAT('tuft', tuftTex(), { alphaTest: 0.45, roughness: 1, side: THREE.DoubleSide });
    for (const [x, z, k2] of pts) for (const a of [0, PI / 2]) mk(g, decal(0.22 * s * (k2 || 1), 0.16 * s * (k2 || 1)), mat, { p: [x, 0, z], r: [0, a + x * 3, 0], c: '#ffffff', cast: false });
  }
  def('grave', {
    key: (o) => k(lay(o).v),
    build(o) {
      const v = lay(o).v, g = new THREE.Group(), S = MAT('stone'), T = MAT('turf');
      const text = (kind, w2, h2, p, extra) => mk(g, decal(w2, h2), TMAT('tomb:' + kind, tombTex(kind), { alphaTest: 0.35, roughness: 0.9 }), Object.assign({ p, cast: false }, extra));
      if (v === 0) {
        blob(g, T, [0, 0, -0.14], [0.4, 0.26, 0.32], '#8fa86a', { ws: 14, hs: 8 });
        // horseshoe 墓手 wall round the mound, arm posts at the front
        const n = 9;
        for (let i = 0; i < n; i++) {
          const a = lerp(-0.25, PI + 0.25, i / (n - 1)), x = cos(a) * 0.44, z = -0.12 - sin(a) * 0.36;
          mk(g, G3.rbox(0.15, 0.17, 0.1, 0.02), S, { p: [x, 0, z], r: [0, PI / 2 - a, 0], c: '#a8a498', top: ['#7a8a5a', 0.3] });
        }
        for (const s of [-1, 1]) { mk(g, G3.rbox(0.1, 0.26, 0.1, 0.02), S, { p: [s * 0.44, 0, 0.22], c: '#a8a498' }); blob(g, S, [s * 0.44, 0.28, 0.22], [0.045, 0.04, 0.045], '#bab6aa'); mk(g, G3.box(0.06, 0.12, 0.3), S, { p: [s * 0.44, 0, 0.06], c: '#9a968a' }); }
        // 墓碑 with arched top + red inscription
        mk(g, G3.box(0.32, 0.4, 0.07), S, { p: [0, 0, 0.05], c: '#c4bfb2' });
        const cap = new THREE.CylinderGeometry(0.16, 0.16, 0.07, 14, 1, false, -PI / 2, PI); cap.rotateX(PI / 2); projUV(cap);
        mk(g, cap, S, { p: [0, 0.4, 0.05], c: '#c4bfb2' });
        mk(g, G3.box(0.4, 0.06, 0.12), S, { p: [0, 0, 0.05], c: '#9a968a' });
        text(0, 0.26, 0.42, [0, 0.03, 0.087]);
        // altar slab 墓桌 with incense burner; 后土 tablet; joss paper 墓紙 held down by pebbles on the mound
        mk(g, G3.rbox(0.34, 0.05, 0.16, 0.012), S, { p: [0, 0.1, 0.27], c: '#b4b0a4' });
        for (const s of [-1, 1]) mk(g, G3.box(0.05, 0.1, 0.12), S, { p: [s * 0.12, 0, 0.27], c: '#9a968a' });
        mk(g, G3.cyl(0.04, 0.035, 0.05, 10), S, { p: [0, 0.15, 0.27], c: '#6a5a3a' });
        for (let i = -1; i <= 1; i++) mk(g, G3.cyl(0.003, 0.003, 0.13, 3), S, { p: [i * 0.012, 0.18, 0.27], r: [0, 0, i * 0.15], c: '#a8322a', cast: false });
        mk(g, G3.rbox(0.09, 0.16, 0.045, 0.012), S, { p: [-0.33, 0, 0.3], c: '#a8a498' });
        const r = rng(9);
        for (let i = 0; i < 6; i++) {
          const a = r() * TAU, d = r() * 0.22, x = cos(a) * d * 1.2, z = -0.16 + sin(a) * d;
          const y = 0.26 * Math.sqrt(max(0, 1 - (x / 0.4) ** 2 - ((z + 0.14) / 0.32) ** 2));
          mk(g, G3.cbox(0.08, 0.004, 0.1), S, { p: [x, y + 0.004, z], r: [-(z + 0.14) * 1.4, r() * 3, x * 1.2], c: i % 3 ? '#e0c050' : '#c83a2a', cast: false });
          blob(g, S, [x, y + 0.012, z], [0.018, 0.012, 0.016], '#8a867c', { ws: 5, hs: 4 });
        }
        tufts(g, [[-0.38, -0.42], [0.36, -0.4], [0.47, 0.32], [-0.46, 0.36], [0.2, 0.42, 0.7], [-0.15, -0.5, 0.8]]);
      } else if (v === 1) {
        blob(g, T, [0, 0, -0.08], [0.34, 0.12, 0.3], '#7f9a5e');
        const st = new THREE.Group(); st.position.set(0.02, 0, 0.08); st.rotation.set(-0.08, 0.15, -0.14); g.add(st);
        mk(st, G3.box(0.24, 0.42, 0.08), S, { c: '#9a9a8c', top: ['#5e7a3e', 0.5] });
        const cap = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12, 1, false, -PI / 2, PI); cap.rotateX(PI / 2); projUV(cap);
        mk(st, cap, S, { p: [0, 0.42, 0], c: '#9a9a8c', top: ['#5e7a3e', 0.6] });
        mk(st, decal(0.2, 0.36), TMAT('tomb:1', tombTex(1), { alphaTest: 0.35, roughness: 0.9 }), { p: [0, 0.04, 0.041], cast: false });
        mk(st, G3.cbox(0.006, 0.16, 0.004), S, { p: [0.05, 0.36, 0.042], r: [0, 0, 0.3], c: '#2a2a24', cast: false }); // crack
        for (let i = 0; i < 4; i++) blob(g, S, [-0.3 + i * 0.2, 0.01, 0.3 - (i % 2) * 0.55], [0.05, 0.03, 0.04], '#8a867c', { ws: 6, hs: 4 });
        tufts(g, [[-0.2, 0.25], [0.25, 0.3], [0.3, -0.2], [-0.32, -0.25], [0.0, 0.38, 0.8], [-0.12, -0.38], [0.16, 0.15, 0.6]], 1.1);
      } else {
        blob(g, T, [0, 0, -0.06], [0.3, 0.14, 0.26], '#8a7458');
        const W = MAT('wood');
        mk(g, G3.box(0.11, 0.62, 0.035), W, { p: [0, 0, 0.18], r: [0.04, 0, 0.03], c: '#9a8668' });
        const tip = new THREE.ConeGeometry(0.078, 0.07, 4); tip.rotateY(PI / 4); tip.scale(1, 1, 0.32); tip.translate(0, 0.035, 0); projUV(tip);
        mk(g, tip, W, { p: [0.018, 0.62, 0.205], r: [0.04, 0, 0.03], c: '#9a8668' });
        mk(g, decal(0.09, 0.42), TMAT('tomb:2', tombTex(2), { alphaTest: 0.35, roughness: 0.9 }), { p: [0.006, 0.14, 0.2], r: [0.04, 0, 0.03] });
        const r = rng(4);
        for (let i = 0; i < 5; i++) mk(g, G3.cbox(0.07, 0.003, 0.08), W, { p: [-0.3 + r() * 0.6, 0.004, 0.18 + r() * 0.25], r: [0, r() * 3, 0], c: '#e0c060', cast: false });
        for (const [x, z] of [[-0.2, 0.25], [0.25, 0.32]]) blob(g, W, [x, 0.01, z], [0.05, 0.035, 0.04], '#8a8478', { ws: 6, hs: 4 });
        tufts(g, [[-0.3, -0.25], [0.32, -0.2], [0.3, 0.38, 0.8], [-0.36, 0.36, 0.7]]);
      }
      return tagged(bake(g, { ao: 0.35 }));
    },
  });

  // ---------------------------------------------------------------- coffin 棺木 on trestles: lofted lacquer body, flared head board, 壽 medallion
  function shouTex() {
    return TEX('shou', 256, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#a8261c'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.45, 0, TAU); g.fill();
      g.strokeStyle = '#e8c060'; g.lineWidth = 8; g.stroke();
      g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, 0, TAU); g.stroke();
      ink(g, '壽', w / 2, h / 2 + 4, 140, '#f2cb68', { dry: false });
    }, 0, { wrap: false });
  }
  def('coffin', {
    build() {
      const g = new THREE.Group(), LQ = MAT('lacquer'), W = MAT('wood');
      // body: box section with crisp (doubled) corners, taller and wider toward the head (+x)
      const N = 10, x0 = -0.9, x1 = 0.84, by = 0.42;
      const hb = (u) => lerp(0.28, 0.38, u), hw = (u) => lerp(0.22, 0.29, u), lt = (u) => lerp(0.1, 0.17, Math.pow(u, 1.5));
      const bodySec = [[-1, 0], [-1, 0], [1, 0], [1, 0], [1.03, 1], [1.03, 1], [-1.03, 1], [-1.03, 1]];
      const lidSec = [[-1, 0], [-1, 0], [1, 0], [1, 0], [1, 0.42], [1, 0.42], [0.72, 0.84], [0.36, 0.97], [0, 1], [-0.36, 0.97], [-0.72, 0.84], [-1, 0.42], [-1, 0.42]];
      const rb = [], rl = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = lerp(x0, x1, u);
        rb.push(bodySec.map(([z, y]) => [x, by + y * hb(u), z * hw(u)]));
        const xl = lerp(x0 - 0.06, x1 + 0.1, u);
        rl.push(lidSec.map(([z, y]) => [xl, by + hb(u) + y * lt(u), z * (hw(u) + 0.035)]));
      }
      mk(g, G3.loft(rb, 'flip', true), LQ, { c: '#3a1410' });
      mk(g, G3.loft(rl, 'flip', true), LQ, { c: '#4a1a12' });
      // red band near the head, end boards (the head board flares up 翹頭), 壽 medallion
      const bu = 0.78, bx = lerp(x0, x1, bu);
      mk(g, G3.box(0.05, hb(bu) + 0.004, hw(bu) * 2 + 0.07), LQ, { p: [bx, by - 0.002, 0], c: '#a8261c' });
      mk(g, G3.rbox(0.05, hb(0) + lt(0) + 0.04, hw(0) * 2 + 0.08, 0.015), LQ, { p: [x0 - 0.03, by - 0.02, 0], c: '#2a0e0a' });
      const hbH = hb(1) + lt(1) + 0.07;
      const hd = G3.rbox(0.05, hbH, hw(1) * 2 + 0.07, 0.02);
      { const P = hd.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i) / hbH; P.setZ(i, P.getZ(i) * (0.94 + 0.12 * y)); } hd.computeVertexNormals(); }
      mk(g, hd, LQ, { p: [x1 + 0.09, by - 0.03, 0], c: '#2a0e0a' });
      mk(g, decal(0.26, 0.26), TMAT('shou', shouTex(), { alphaTest: 0.4, roughness: 0.4 }), { p: [x1 + 0.118, by + 0.12, 0], r: [0, PI / 2, 0], cast: false });
      // trestles 板凳
      for (const x of [-0.52, 0.52]) {
        mk(g, G3.box(0.1, 0.06, 0.66, 'z'), W, { p: [x, by - 0.06, 0], c: '#6a4a2c' });
        for (const s of [-1, 1]) for (const f of [-1, 1]) mk(g, G3.box(0.05, by - 0.02, 0.05), W, { p: [x + f * 0.03, 0, s * 0.26], r: [0, 0, -f * 0.12], c: '#4a3220' });
        mk(g, G3.box(0.04, 0.04, 0.5, 'z'), W, { p: [x, 0.14, 0], c: '#4a3220' });
      }
      return tagged(bake(g));
    },
  });

  // ---------------------------------------------------------------- bones (non-solid scatter)
  def('bones', {
    key: (o) => k(lay(o).v),
    build(o) {
      const v = lay(o).v, g = new THREE.Group(), P = MAT('plain'), B = '#e2dac4', r = rng(17 + v);
      const longBone = (x, z, len, a) => {
        const sub = new THREE.Group(); sub.position.set(x, 0.022, z); sub.rotation.y = a; g.add(sub);
        mk(sub, G3.rod(0.014, len, 6), P, { c: B });
        for (const s of [-1, 1]) for (const d of [-1, 1]) blob(sub, P, [s * len / 2, 0, d * 0.012], [0.022, 0.02, 0.02], B, { ws: 6, hs: 4 });
      };
      longBone(-0.2, 0.14, 0.32, 0.3 + v); longBone(0.14, 0.2, 0.26, -0.6); longBone(0.2, -0.1, 0.22, 1.2 + v);
      for (let i = 0; i < 4; i++) mk(g, G3.torus(0.09, 0.008, 3, 10, PI * 0.8), P, { p: [-0.28 + i * 0.05, 0.012, -0.08], r: [PI / 2, 0, 0.5 + r() * 0.3], c: '#d8d0b8' });
      // skull
      const sx = v ? 0.12 : -0.05, sz = v ? -0.06 : 0.0;
      const sk = new THREE.Group(); sk.position.set(sx, 0, sz); sk.rotation.set(0.25, v ? -0.7 : 0.4, 0.15); g.add(sk);
      blob(sk, P, [0, 0.07, 0], [0.07, 0.065, 0.085], '#efe8d4');
      mk(sk, G3.rbox(0.07, 0.04, 0.05, 0.012), P, { p: [0, 0.015, 0.06], c: B });
      for (const s of [-1, 1]) blob(sk, P, [s * 0.027, 0.07, 0.068], [0.02, 0.022, 0.012], '#2a2018');
      blob(sk, P, [0, 0.045, 0.082], [0.008, 0.012, 0.006], '#2a2018');
      return tagged(bake(g, { ao: 0.5, aoH: 0.1 }));
    },
  });

  // ---------------------------------------------------------------- firepit: stone ring, charred logs, ember bed, live flames + sparks
  const rock = (r, seed) => { const g = new THREE.IcosahedronGeometry(r, 0); const p = g.attributes.position, rr = rng(seed); for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + rr() * 0.35), p.getY(i) * (0.6 + rr() * 0.3), p.getZ(i) * (0.8 + rr() * 0.35)); const f = G3.flat(g); return projUV(f); };
  function addFlames(g, x, y, z, hs, kind = 'warm') {
    hs.forEach((h, i) => {
      const fl = G3.lathe([[0, 0], [h * 0.22, h * 0.12], [h * 0.2, h * 0.38], [h * 0.1, h * 0.72], [0, h]], 9, 'native');
      const a = i * 2.3;
      mk(g, fl, flameMat(kind), { p: [x + (i ? cos(a) * h * 0.18 : 0), y, z + (i ? sin(a) * h * 0.18 : 0)], vc: [i * 0.27 + 0.1, 0.4 + i * 0.13, h], cast: false });
    });
  }
  def('firepit', {
    build() {
      const g = new THREE.Group(), S = MAT('stone');
      for (let i = 0; i < 11; i++) { const a = i / 11 * TAU; mk(g, rock(0.09 + (i % 3) * 0.015, i + 3), S, { p: [cos(a) * 0.34, 0.04, sin(a) * 0.3], r: [0, a, 0], c: i % 2 ? '#8a867c' : '#77736a' }); }
      mk(g, G3.cyl(0.27, 0.29, 0.02, 14), S, { c: '#3a3430' });
      mk(g, G3.cyl(0.19, 0.21, 0.022, 12), GLOW('ember', null, 2.5), { p: [0, 0.01, 0], c: '#ff5a18', grad: [0.4, 1], noAO: true });
      for (let i = 0; i < 7; i++) { const a = i * 0.9; mk(g, rock(0.035, 40 + i), GLOW('ember', null, 2.5), { p: [cos(a) * 0.13, 0.03, sin(a) * 0.12], c: i % 2 ? '#a83a10' : '#2a0e04', noAO: true }); }
      const W = MAT('wood');
      for (let i = 0; i < 4; i++) {
        const a = i * PI / 2 + 0.4, sub = new THREE.Group(); sub.position.set(cos(a) * 0.13, 0.03, sin(a) * 0.13); sub.rotation.set(0, -a, 0); g.add(sub);
        const log = new THREE.Group(); log.rotation.z = 0.6; sub.add(log);
        mk(log, G3.cyl(0.04, 0.045, 0.34, 7), W, { p: [0, -0.06, 0], r: [0, 0, PI / 2], c: '#5a3a22' });
        mk(log, G3.cyl(0.04, 0.04, 0.06, 7), GLOW('ember', null, 2.5), { p: [-0.28, -0.06, 0], r: [0, 0, PI / 2], c: '#3a1206', noAO: true });
      }
      addFlames(g, 0, 0.03, 0, [0.52, 0.38, 0.34]);
      g.add(particles('sparks', 12, 0, 0.25, 0, 7));
      return tagged(bake(g));
    },
    update(node, o, t) { tick(t); },
    lights() { return [{ x: 0, y: 0.5, z: 0, color: '#ff9a40', intensity: 1.6, distance: 6, flicker: 0.6 }]; },
  });

  // ---------------------------------------------------------------- drum_rack 廟鼓 on a red lacquer stand
  function drumheadTex() {
    return TEX('drumhead', 256, 256, (g, w, h) => {
      const r = rng(23);
      const gr = g.createRadialGradient(w * 0.45, h * 0.42, 6, w / 2, h / 2, w / 2);
      gr.addColorStop(0, '#f6ecd2'); gr.addColorStop(0.75, '#dcc8a0'); gr.addColorStop(1, '#9a7a52');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      blotch(g, w, h, r, 12, '120,90,50', 0.12, 10, 40);
      g.strokeStyle = 'rgba(160,40,30,0.55)'; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, h / 2, w * 0.2, 0, TAU); g.stroke();
      ink(g, '鼓', w / 2, h / 2 + 3, 62, 'rgba(160,40,30,0.7)', { dry: true });
    }, 0, { wrap: false });
  }
  def('drum_rack', {
    build() {
      const g = new THREE.Group(), LQ = MAT('lacquer'), red = '#9a2a1e';
      const cy = 0.86, R = 0.33, Lz = 0.46;
      for (const s of [-1, 1]) {
        for (const f of [-1, 1]) mk(g, G3.box(0.06, 1.12, 0.06), LQ, { p: [s * 0.42, 0, f * 0.24], r: [-f * 0.17, 0, 0], c: red });
        mk(g, G3.box(0.07, 0.06, 0.5, 'z'), LQ, { p: [s * 0.42, 0.3, 0], c: red });
        mk(g, G3.box(0.08, 0.06, 0.22, 'z'), LQ, { p: [s * 0.42, 1.08, 0], c: '#7a1e14' });
        mk(g, G3.box(0.16, 0.05, 0.08), LQ, { p: [s * 0.33, cy - 0.05, 0], c: '#7a1e14' }); // cradle arms
      }
      for (const f of [-1, 1]) mk(g, G3.box(0.84, 0.05, 0.05, 'x'), LQ, { p: [0, 0.22, f * 0.2], c: '#7a1e14' });
      // drum: bulging barrel along z, hide heads, two rings of brass studs
      const pts = []; for (let j = 0; j <= 8; j++) { const u = j / 8; pts.push([R * (0.86 + 0.14 * sin(PI * u)), (u - 0.5) * Lz]); }
      const drum = G3.lathe(pts, 22); drum.rotateX(PI / 2);
      mk(g, drum, LQ, { p: [0, cy, 0], c: '#b03224' });
      for (const s of [-1, 1]) {
        const head = new THREE.CircleGeometry(R * 0.86, 24); if (s < 0) head.rotateY(PI);
        mk(g, head, TMAT('drumhead', drumheadTex(), { roughness: 0.8 }), { p: [0, cy, s * (Lz / 2 + 0.002)] });
        for (let i = 0; i < 22; i++) { const a = i / 22 * TAU; mk(g, G3.sphere(0.012, 5, 4), MAT('metal'), { p: [cos(a) * R * 0.875, cy + sin(a) * R * 0.875, s * (Lz / 2 - 0.03)], c: '#e8c060' }); }
        mk(g, G3.torus(R * 0.87, 0.01, 3, 24), MAT('metal'), { p: [0, cy, s * (Lz / 2 - 0.005)], c: '#8a6a2a' });
      }
      // two drumsticks resting in a holder
      for (const d of [-1, 1]) {
        mk(g, G3.cyl(0.014, 0.016, 0.42, 6), LQ, { p: [0.47 + d * 0.02, 0.32, 0.12], r: [0.25, 0, -0.18 + d * 0.06], c: '#8a6a42' });
        mk(g, G3.sphere(0.026, 7, 5), LQ, { p: [0.53 + d * 0.02, 0.73, 0.22], c: '#8a2a1e' });
      }
      return tagged(bake(g));
    },
  });

  // =================================================================================================
  // dungeon / shrine puzzle props (2D art lives in gfx/interior.js but these stand outdoors too)
  // =================================================================================================
  // ---------------------------------------------------------------- chest 寶箱: lacquered, domed lid on brass straps; o.open swings the lid back
  const CH = { w: 0.74, h: 0.4, d: 0.46, r: 0.23, open: -1.95 };
  def('chest', {
    key: (o) => (o.open ? 'open' : ''),
    build(o) {
      const g = new THREE.Group(), LQ = MAT('lacquer'), M = MAT('metal'), wood = '#7a3a20', brass = '#d4a548';
      const { w, h, d } = CH, t = 0.03;
      // body as five panels so the open chest has a real interior
      mk(g, G3.box(w, 0.04, d), LQ, { p: [0, 0.05, 0], c: wood });
      for (const s of [-1, 1]) { mk(g, G3.box(w, h - 0.05, t, 'x'), LQ, { p: [0, 0.05, s * (d / 2 - t / 2)], c: wood }); mk(g, G3.box(t, h - 0.05, d - 2 * t), LQ, { p: [s * (w / 2 - t / 2), 0.05, 0], c: wood }); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, G3.box(0.08, 0.06, 0.08), LQ, { p: [sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04)], c: '#4a2010' });
      mk(g, G3.box(w + 0.02, 0.03, d + 0.02), LQ, { p: [0, 0.05, 0], c: '#5a2614' });
      // brass straps, corner brackets, side ring handles, lock plate
      for (const x of [-0.22, 0.22]) for (const s of [-1, 1]) mk(g, G3.box(0.05, h - 0.03, 0.008), M, { p: [x, 0.05, s * (d / 2 + 0.004)], c: brass });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.06, h - 0.07]) mk(g, G3.box(0.07, 0.07, 0.07), M, { p: [sx * (w / 2 - 0.03), y, sz * (d / 2 - 0.03)], s: [1.05, 1, 1.05], c: '#b88a38' });
      for (const s of [-1, 1]) { mk(g, G3.torus(0.045, 0.008, 4, 12), M, { p: [s * (w / 2 + 0.012), 0.26, 0], r: [0, PI / 2, 0], c: brass }); mk(g, G3.cbox(0.012, 0.05, 0.05), M, { p: [s * (w / 2 + 0.004), 0.3, 0], c: brass }); }
      mk(g, G3.rbox(0.11, 0.12, 0.016, 0.02), M, { p: [0, h - 0.15, d / 2 + 0.008], c: brass });
      mk(g, G3.cbox(0.014, 0.04, 0.01), M, { p: [0, h - 0.09, d / 2 + 0.018], c: '#2a1806' });
      if (o.open) {
        // red silk lining and treasure: silver/gold 元寶 ingots, coins, pearls (faint glow)
        mk(g, G3.box(w - 2 * t, 0.005, d - 2 * t), MAT('cloth'), { p: [0, 0.09, 0], c: '#8a1a1e' });
        for (const s of [-1, 1]) mk(g, decal(w - 2 * t, h - 0.1), MAT('cloth'), { p: [0, 0.09, s * (d / 2 - t - 0.002)], r: [0, s > 0 ? PI : 0, 0], c: '#a8282c' });
        const r = rng(8), GL = GLOW('treasure', null, 0.55);
        for (let i = 0; i < 9; i++) {
          const x = (r() - 0.5) * 0.5, z = (r() - 0.5) * 0.26, y = 0.12 + r() * 0.12 + (0.25 - abs(x)) * 0.25;
          const ry = r() * PI;
          blob(g, GL, [x, y, z], [0.06, 0.03, 0.035], i % 3 ? '#f2c050' : '#d8dce0', { r: [0, ry, 0] });
          blob(g, GL, [x, y + 0.025, z], [0.025, 0.022, 0.022], i % 3 ? '#f8d070' : '#e8ecf0', { r: [0, ry, 0] });
        }
        for (let i = 0; i < 10; i++) mk(g, G3.cyl(0.025, 0.025, 0.006, 8), GL, { p: [(r() - 0.5) * 0.55, 0.12 + r() * 0.2, (r() - 0.5) * 0.3], r: [r() - 0.5, 0, r() - 0.5], c: '#e8b040' });
        for (let i = 0; i < 5; i++) blob(g, GL, [(r() - 0.5) * 0.4, 0.3 + r() * 0.05, (r() - 0.5) * 0.2], [0.018, 0.018, 0.018], '#f4f0ff', { ws: 6, hs: 4 });
      }
      // lid on a hinge at the back top edge
      const lid = part('lid', [0, h, -d / 2], (lg) => {
        mk(lg, G3.box(w + 0.02, 0.06, d + 0.02), LQ, { p: [0, h, 0], c: '#86422a' });
        const dome = new THREE.CylinderGeometry(CH.r, CH.r, w + 0.02, 18, 1, false, 0, PI); dome.rotateZ(PI / 2); dome.scale(1, 0.55, 1); projUV(dome, 'x');
        mk(lg, dome, LQ, { p: [0, h + 0.06, 0], c: '#8a462c' });
        for (const x of [-0.22, 0.22]) {
          const st = new THREE.CylinderGeometry(CH.r + 0.006, CH.r + 0.006, 0.05, 18, 1, true, 0, PI); st.rotateZ(PI / 2); st.scale(1, 0.55, 1);
          mk(lg, st, M, { p: [x, h + 0.06, 0], c: brass });
          for (const s of [-1, 1]) mk(lg, G3.box(0.05, 0.062, 0.008), M, { p: [x, h - 0.001, s * (d / 2 + 0.014)], c: brass });
        }
        mk(lg, G3.cbox(0.06, 0.07, 0.012), M, { p: [0, h + 0.02, d / 2 + 0.016], c: brass }); // hasp
        if (o.open) mk(lg, G3.box(w - 0.04, 0.005, d - 0.04), LQ, { p: [0, h - 0.004, 0], c: '#9a1c20' });
      });
      lid.rotation.x = o.open ? CH.open : 0;
      const out = bake(g);
      out.add(lid); // baked separately so it can swing on its hinge
      return tagged(out);
    },
    update(node, o, t) {
      const lid = node.getObjectByName('lid');
      if (!lid || !o) return;
      if (!o.open) { lid.rotation.x = 0; return; }
      if (node.userData.t0 == null) node.userData.t0 = t;
      const k2 = clamp((t - node.userData.t0) / 0.75, 0, 1);
      lid.rotation.x = CH.open * (1 - Math.pow(1 - k2, 3)) + (k2 >= 1 ? 0 : sin(k2 * PI) * -0.06);
    },
    lights(o) { return o.open ? [{ x: 0, y: 0.55, z: 0.1, color: '#ffd27a', intensity: 0.7, distance: 2.4, flicker: 0.05 }] : []; },
  });

  // ---------------------------------------------------------------- switch 八卦機關: octagonal stone pressure plate; o.on glows and sinks
  function baguaTex(glow) {
    return TEX('bagua:' + (glow ? 'g' : 'c'), 256, 256, (g, w, h) => {
      const r = rng(31), cx = w / 2, cy = h / 2;
      if (glow) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); } else {
        g.fillStyle = '#a7a39a'; g.fillRect(0, 0, w, h);
        speckle(g, w, h, r, 2200, '42,40,38', 0.2, 0.5, 1, 2); blotch(g, w, h, r, 10, '60,58,54', 0.18, 10, 50);
      }
      const ln = glow ? '#ffffff' : 'rgba(40,38,34,0.85)';
      g.strokeStyle = ln; g.lineWidth = glow ? 5 : 4;
      g.beginPath(); for (let k2 = 0; k2 <= 8; k2++) { const a = k2 / 8 * TAU + PI / 8; g.lineTo(cx + cos(a) * 118, cy + sin(a) * 118); } g.stroke();
      // eight trigrams 八卦
      for (let k2 = 0; k2 < 8; k2++) {
        const a = k2 / 8 * TAU;
        for (let j = 0; j < 3; j++) {
          const rr = 72 + j * 13, broken = ((k2 >> j) & 1) === 1;
          const px = cos(a) * rr, py = sin(a) * rr, tx = -sin(a) * 22, ty = cos(a) * 22;
          g.lineWidth = 7;
          if (broken) { g.beginPath(); g.moveTo(cx + px - tx, cy + py - ty); g.lineTo(cx + px - tx * 0.22, cy + py - ty * 0.22); g.moveTo(cx + px + tx * 0.22, cy + py + ty * 0.22); g.lineTo(cx + px + tx, cy + py + ty); g.stroke(); }
          else { g.beginPath(); g.moveTo(cx + px - tx, cy + py - ty); g.lineTo(cx + px + tx, cy + py + ty); g.stroke(); }
        }
      }
      // taiji 太極
      const R = 40;
      g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
      g.fillStyle = glow ? '#ffffff' : 'rgba(40,38,34,0.85)';
      g.beginPath(); g.arc(cx, cy, R, -PI / 2, PI / 2); g.arc(cx, cy + R / 2, R / 2, PI / 2, -PI / 2, true); g.arc(cx, cy - R / 2, R / 2, PI / 2, PI * 1.5, false); g.fill();
      g.beginPath(); g.arc(cx, cy - R / 2, R / 7, 0, TAU); g.fillStyle = glow ? '#000' : '#a7a39a'; g.fill();
      g.beginPath(); g.arc(cx, cy + R / 2, R / 7, 0, TAU); g.fillStyle = glow ? '#fff' : 'rgba(40,38,34,0.85)'; g.fill();
    }, 0, { wrap: false });
  }
  def('switch', {
    key: (o) => (o.on ? 'on' : ''),
    build(o) {
      const g = new THREE.Group(), S = MAT('stone'), on = !!o.on;
      const oct = (rt, rb, hh) => { const c = G3.cyl(rt, rb, hh, 8); c.rotateY(PI / 8); return c; };
      mk(g, oct(0.45, 0.47, 0.05), S, { c: '#7e7a72' });
      const py = on ? 0.035 : 0.065;
      mk(g, oct(0.39, 0.4, py), S, { p: [0, 0.03, 0], c: '#9a968c' });
      const face = new THREE.CircleGeometry(0.37, 8); face.rotateX(-PI / 2); face.rotateY(PI / 8);
      const mat = on ? cached('baguaOn', () => vcEmit(env({ map: baguaTex(false), emissiveMap: baguaTex(true), emissive: new THREE.Color('#6ff0c4'), emissiveIntensity: 1.6, roughness: 0.9 })))
        : TMAT('baguaOff', baguaTex(false), { roughness: 0.92 });
      mk(g, face, mat, { p: [0, 0.03 + py + 0.002, 0], c: '#ffffff', noAO: true });
      return tagged(bake(g, { ao: 0.2, aoH: 0.1 }));
    },
    lights(o) { return o.on ? [{ x: 0, y: 0.6, z: 0, color: '#7fe8c8', intensity: 0.7, distance: 3, flicker: 0.1 }] : []; },
  });

  // ---------------------------------------------------------------- brazier 火盆: bronze tripod bowl with coals, flames and sparks
  def('brazier', {
    build() {
      const g = new THREE.Group(), M = MAT('metal'), bronze = '#9a7440';
      mk(g, G3.lathe([[0, 0.5], [0.12, 0.505], [0.25, 0.56], [0.31, 0.65], [0.33, 0.72], [0.345, 0.74], [0.33, 0.745], [0.3, 0.68], [0.0, 0.65]], 18), M, { c: bronze });
      mk(g, G3.torus(0.34, 0.016, 4, 22), M, { p: [0, 0.742, 0], r: [PI / 2, 0, 0], c: '#d8b066' });
      mk(g, G3.torus(0.312, 0.012, 4, 22), M, { p: [0, 0.64, 0], r: [PI / 2, 0, 0], c: '#6a4a22' });
      for (let i = 0; i < 3; i++) {
        const a = i / 3 * TAU + PI / 2, c = cos(a), s = sin(a);
        mk(g, G3.tube([V3(c * 0.18, 0.54, s * 0.18), V3(c * 0.27, 0.36, s * 0.27), V3(c * 0.29, 0.14, s * 0.29), V3(c * 0.35, 0.04, s * 0.35)], 0.03, 10, 6), M, { c: '#7a5a30' });
        blob(g, M, [c * 0.37, 0.03, s * 0.37], [0.05, 0.03, 0.05], '#6a4a22');
      }
      for (const s of [-1, 1]) mk(g, G3.torus(0.05, 0.011, 4, 12), M, { p: [s * 0.36, 0.78, 0], r: [0, PI / 2, 0], c: '#c49a52' });
      for (let i = 0; i < 9; i++) { const a = i * 2.4, d2 = (i % 3) * 0.08; mk(g, rock(0.05, 60 + i), GLOW('ember', null, 2.5), { p: [cos(a) * d2, 0.69, sin(a) * d2], c: i % 2 ? '#b8401a' : '#3a1206', noAO: true }); }
      addFlames(g, 0, 0.7, 0, [0.48, 0.36, 0.32]);
      g.add(particles('sparks', 10, 0, 0.95, 0, 11));
      return tagged(bake(g));
    },
    update(node, o, t) { tick(t); },
    lights() { return [{ x: 0, y: 1.05, z: 0, color: '#ff9a40', intensity: 1.8, distance: 7, flicker: 0.3 }]; },
  });

  // ---------------------------------------------------------------- pillar 紅柱: red lacquer column on a lotus 柱珠, teal capital with gold studs
  def('pillar', {
    build() {
      const g = new THREE.Group(), S = MAT('stone'), LQ = MAT('lacquer'), M = MAT('metal');
      mk(g, G3.rbox(0.66, 0.06, 0.66, 0.02), S, { c: '#8e897e' });
      mk(g, G3.lathe([[0, 0.06], [0.3, 0.06], [0.32, 0.1], [0.33, 0.17], [0.3, 0.27], [0.25, 0.31], [0.23, 0.33], [0, 0.33]], 16), S, { c: '#b4afa4' });
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; blob(g, S, [cos(a) * 0.3, 0.2, sin(a) * 0.3], [0.05, 0.08, 0.03], '#c4bfb2', { r: [0, -a + PI / 2, 0] }); }
      mk(g, G3.cyl(0.19, 0.205, 2.78, 16), LQ, { p: [0, 0.32, 0], c: '#b5281e' });
      for (const y of [0.42, 2.92]) mk(g, G3.cyl(0.212, 0.212, 0.06, 16), M, { p: [0, y, 0], c: '#d9a441' });
      mk(g, G3.rbox(0.54, 0.16, 0.54, 0.02), LQ, { p: [0, 3.08, 0], c: '#2e5a5a' });
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const a = i * PI / 2, x = (j - 1) * 0.15;
        mk(g, G3.sphere(0.028, 7, 5), M, { p: [cos(a) * x + sin(a) * 0.272, 3.16, -sin(a) * x + cos(a) * 0.272], c: '#d9a441' });
      }
      mk(g, G3.rbox(0.44, 0.1, 0.44, 0.02), LQ, { p: [0, 3.24, 0], c: '#6a1410' });
      mk(g, G3.rbox(0.6, 0.06, 0.6, 0.02), LQ, { p: [0, 3.34, 0], c: '#1c3a3a' });
      return tagged(bake(g, { ao: 0.35, aoH: 0.6 }));
    },
  });

  // ---------------------------------------------------------------- eternal_lamp 長明燈: stone pillar, bronze lamp-house, pale undying flame
  def('eternal_lamp', {
    build() {
      const g = new THREE.Group(), S = MAT('stone'), M = MAT('metal');
      const oct = (rt, rb, hh) => { const c = G3.cyl(rt, rb, hh, 8); c.rotateY(PI / 8); return c; };
      mk(g, oct(0.3, 0.34, 0.12), S, { c: '#a8a398', top: ['#7a8a5a', 0.2] });
      mk(g, oct(0.22, 0.25, 0.07), S, { p: [0, 0.12, 0], c: '#b4afa4' });
      mk(g, oct(0.075, 0.085, 0.78), S, { p: [0, 0.19, 0], c: '#bab5a8' });
      for (const y of [0.42, 0.7]) mk(g, oct(0.1, 0.1, 0.04), S, { p: [0, y, 0], c: '#c4bfb2' });
      mk(g, G3.rbox(0.42, 0.07, 0.42, 0.015), S, { p: [0, 0.96, 0], c: '#c8c3b6' });
      const hy = 1.03, hh = 0.36, hw = 0.14;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(g, G3.box(0.03, hh, 0.03), M, { p: [sx * hw, hy, sz * hw], c: '#8a6a3a' });
      for (const y of [hy + 0.03, hy + hh - 0.06]) for (const r of [0, PI / 2]) for (const s of [-1, 1]) {
        mk(g, G3.box(2 * hw, 0.014, 0.012), M, { p: r ? [s * hw, y, 0] : [0, y, s * hw], r: [0, r, 0], c: '#6a4e24' });
        for (const t2 of [-0.5, 0, 0.5]) mk(g, G3.box(0.01, 0.06, 0.01), M, { p: r ? [s * hw, y - 0.045, t2 * hw] : [t2 * hw, y - 0.045, s * hw], c: '#6a4e24' });
      }
      mk(g, G3.box(0.34, 0.025, 0.34), M, { p: [0, hy, 0], c: '#8a6a3a' });
      mk(g, G3.lathe([[0, 0], [0.04, 0.0], [0.055, 0.03], [0.05, 0.035], [0, 0.025]], 10), M, { p: [0, hy + 0.025, 0], c: '#a8803a' });
      addFlames(g, 0, hy + 0.05, 0, [0.15], 'pale');
      const roof = G3.flat(G3.lathe([[0, -0.01], [0.26, -0.01], [0.3, 0.035], [0.25, 0.055], [0.12, 0.13], [0.05, 0.17], [0, 0.18]], 4, 'native'));
      roof.rotateY(PI / 4); projUV(roof);
      mk(g, roof, M, { p: [0, hy + hh, 0], c: '#5f9384' });
      mk(g, G3.sphere(0.035, 8, 6), M, { p: [0, hy + hh + 0.21, 0], c: '#e0b050' });
      return tagged(bake(g));
    },
    update(node, o, t) { tick(t); },
    lights() { return [{ x: 0, y: 1.2, z: 0, color: '#ffe2a8', intensity: 1, distance: 4.5, flicker: 0.06 }]; },
  });

  // ---------------------------------------------------------------- soul_jar 鎮魂罐: talisman-sealed glass jar with a trapped blue soul-light
  function talismanTex() {
    return TEX('talisman', 64, 256, (g, w, h) => {
      const r = rng(66);
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#f6dc6a'); gr.addColorStop(1, '#d4b040');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      speckle(g, w, h, r, 300, '120,80,20', 0.1, 0.3, 1, 2);
      ink(g, '敕令', w / 2, 46, 24, '#b8241c', { spacing: 1.05 });
      g.strokeStyle = '#b8241c'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(w / 2, 82); g.lineTo(w / 2, 240);
      for (let y = 100; y < 230; y += 26) { g.moveTo(w / 2 - 14, y); g.quadraticCurveTo(w / 2 + 18, y + 6, w / 2 - 12, y + 16); }
      g.stroke();
    }, 0, { wrap: false });
  }
  def('soul_jar', {
    build() {
      const g = new THREE.Group(), M = MAT('metal');
      mk(g, G3.lathe([[0, 0], [0.27, 0], [0.29, 0.03], [0.27, 0.07], [0.22, 0.08], [0, 0.08]], 16), MAT('wood'), { c: '#4a2c1a' });
      const prof = [[0.17, 0.08], [0.27, 0.16], [0.3, 0.28], [0.28, 0.4], [0.2, 0.5], [0.15, 0.55], [0.155, 0.6]];
      const glass = cached('glass', () => env({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide, cutout: false }));
      mk(g, G3.lathe(prof, 20, 'native'), glass, { c: '#d4f0ff', noAO: true, cast: false });
      mk(g, G3.lathe([[0, 0.6], [0.17, 0.6], [0.175, 0.64], [0.12, 0.665], [0.05, 0.68], [0.035, 0.71], [0.04, 0.73], [0, 0.735]], 14), M, { c: '#c69a52' });
      mk(g, G3.torus(0.158, 0.009, 4, 16), M, { p: [0, 0.56, 0], r: [PI / 2, 0, 0], c: '#a8221a' }); // red cord
      // talisman 符 sealing the lid: over the top and down the front, following the jar's profile
      const tl = new THREE.PlaneGeometry(0.075, 0.5, 1, 14), P = tl.attributes.position;
      const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const a = prof[i - 1], b = prof[i]; return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1])); } return 0.155; };
      for (let i = 0; i < P.count; i++) {
        const v = (P.getY(i) + 0.25) / 0.5; // 0 bottom … 1 top
        const y = lerp(0.3, 0.74, v);
        if (y > 0.6) { const u = (y - 0.6) / 0.14; P.setXYZ(i, P.getX(i), 0.6 + sin(u * PI / 2) * 0.13, cos(u * PI / 2) * 0.17 + 0.004); }
        else P.setXYZ(i, P.getX(i), y, rAt(y) + 0.006);
      }
      tl.computeVertexNormals();
      mk(g, tl, TMAT('talisman', talismanTex(), { roughness: 0.85, side: THREE.DoubleSide }), { c: '#ffffff', cast: false });
      addFlames(g, 0, 0.17, 0, [0.22, 0.15], 'blue');
      g.add(particles('motes', 9, 0, 0.32, 0, 13));
      return tagged(bake(g, { ao: 0.3 }));
    },
    update(node, o, t) { tick(t); },
    lights() { return [{ x: 0, y: 0.35, z: 0, color: '#5ab8ff', intensity: 1, distance: 3.6, flicker: 0.25 }]; },
  });

  // exported for the test harness / other teams
  G.Props3D = Object.assign(G.Props3D || {}, { street: true, bake, mk, G3, MAT, GLOW, TMAT, TEX, TX, ink, inkFit, addLantern, flameMat, particles, lay });
})();

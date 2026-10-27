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
      for (let i = 0; i < 40; i++) { const x = r() * w, l = h * (0.25 + r() * 0.5), ww = 2 + r() * 6; g.fillStyle = `rgba(30,14,6,${0.08 + r() * 0.14})`; wrap(w, h, x, 0, ww, (X) => { g.fillRect(X, 0, ww, l); g.beginPath(); g.arc(X + ww / 2, l, ww / 2, 0, PI); g.fill(); }); }
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
      const k = m.material.uuid + (m.castShadow ? 'c' : '');
      if (!buckets.has(k)) buckets.set(k, { mat: m.material, cast: m.castShadow, depth: m.userData.depth, geos: [] });
      buckets.get(k).geos.push(g);
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

  // exported for the test harness / other teams
  G.Props3D = Object.assign(G.Props3D || {}, { street: true, bake, mk, G3, MAT, GLOW, TMAT, TEX, TX, ink, inkFit, addLantern, flameMat, particles, lay });
})();

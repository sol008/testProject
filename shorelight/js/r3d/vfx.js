// 彼岸燈 — G.VFX3D: battle visual effects library (owner: battle team; contract: docs/CONTRACTS_3D.md).
//
//   const fx = G.VFX3D.create(view)   // view = G.Battle3D instance (scene, camera, pos(), unitView(), shake(), flash() …)
//   fx.play(fxId, user, targets, skill) -> seconds until the impact frame (BattleScene waits that long, then applies damage)
//   fx.cast(user, skill)  fx.hit(target, info)  fx.kill(unit)  fx.update(dt)  fx.dispose()
//
// Building blocks
//   • GPU particles: one InstancedBufferGeometry quad per particle, ring-buffered; motion (velocity, drag, gravity),
//     size/colour/alpha over life, spin and velocity-stretched sparks are evaluated in the vertex shader — the CPU only
//     writes a particle once, when it is born. Additive (glow, sparks, fire) and alpha (smoke, debris, leaves) pools.
//   • Shader meshes: sweeping slash crescents, shockwave rings, noise-displaced explosion orbs, scrolling energy
//     columns (pillars, beams, geysers, tornadoes), lightning ribbons, ground decals (scorch, cracks, magic circles).
//   • Props: rock spikes, falling spirit swords, talismans, paper lanterns, vines, the 糰子 summon.
//   • A pooled set of point lights for flashes, plus camera shake / screen flash / hit-stop through the view.
// Every fx id used in js/data/skills.js maps to an effect (see play()). Time runs at battle speed × hit-stop/slow-mo.
'use strict';
G.VFX3D = (() => {
  const V = {};
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = { out: (k) => 1 - (1 - k) * (1 - k), out3: (k) => 1 - Math.pow(1 - k, 3), in2: (k) => k * k, inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) };

  // ------------------------------------------------------------------------------------------ palettes
  // [core, mid, outer, smoke/dark]
  const PAL = {
    fire: ['#fff3c4', '#ffa23c', '#ff3c12', '#3a2420'],
    water: ['#f0fcff', '#74ccff', '#2a6ad8', '#a8d8f0'],
    wood: ['#f6ffd8', '#b4ff6a', '#3cae46', '#2a4a24'],
    thunder: ['#f4fbff', '#bfe4ff', '#7ab8ff', '#2a3a5a'],
    metal: ['#fffbea', '#ffdc7a', '#d0a038', '#5a4a30'],
    earth: ['#f4dcaa', '#c8904e', '#7a5430', '#4a3a2a'],
    wind: ['#f0fff8', '#a8f4dc', '#5cc4a8', '#c8f0e4'],
    dark: ['#ecd2ff', '#a45cff', '#4a1a8a', '#140a22'],
    ghost: ['#eef6ff', '#92c0ff', '#4664c8', '#1a2240'],
    lantern: ['#fff2c8', '#ffb456', '#ff7034', '#3a2418'],
    heal: ['#f4fff2', '#8cf29a', '#fff6c0', '#2a5a30'],
    holy: ['#fffef4', '#ffe9a8', '#ffc860', '#5a4a2a'],
    poison: ['#e8ffc8', '#9be86a', '#4a8a2a', '#2a3a18'],
    seal: ['#f4e0ff', '#d8a0ff', '#8a4ab8', '#2a1440'],
    sleep: ['#eef4ff', '#a8c8ff', '#6a8ad8', '#1a2440'],
    stun: ['#fffbe0', '#ffe86a', '#ffb02a', '#3a3010'],
    magic: ['#fffaf0', '#ffe0a0', '#ffc070', '#3a2a20'],
    trance: ['#ffe8fa', '#ff6ad5', '#7af0ff', '#2a1a3a'],
    neutral: ['#ffffff', '#fff0d0', '#ffd8a0', '#3a3028'],
  };
  V.PAL = PAL;
  const elemOf = (s, fallback) => (s && s.elem) || fallback || 'neutral';
  const palOf = (k) => PAL[k] || PAL.neutral;

  // ------------------------------------------------------------------------------------------ textures
  const CELL = { glow: 0, dot: 1, spark: 2, shard: 3, smoke: 4, leaf: 5, petal: 6, star: 7, ring: 8, drop: 9, ember: 10, rune: 11, note: 12, flame: 13, crystal: 14, bubble: 15 };
  function atlasTex() {
    return G.R3M.tex('vfx_atlas', 512, 512, (g) => {
      const S = 128;
      const cell = (i, fn) => { g.save(); g.translate((i % 4) * S, Math.floor(i / 4) * S); fn(S); g.restore(); };
      const radial = (cx, cy, r, stops) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [k, c] of stops) gr.addColorStop(k, c); return gr; };
      // 0 soft glow
      cell(0, (s) => { g.fillStyle = radial(s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, s, s); });
      // 1 hard dot with halo
      cell(1, (s) => { g.fillStyle = radial(s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, s, s); });
      // 2 spark streak (long along x)
      cell(2, (s) => {
        const gr = g.createLinearGradient(0, 0, s, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.92, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(s / 2, s / 2, s / 2, s * 0.09, 0, 0, TAU); g.fill();
      });
      // 3 shard
      cell(3, (s) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s * 0.5, s * 0.08); g.lineTo(s * 0.72, s * 0.62); g.lineTo(s * 0.46, s * 0.94); g.lineTo(s * 0.3, s * 0.5); g.closePath(); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.moveTo(s * 0.5, s * 0.08); g.lineTo(s * 0.46, s * 0.94); g.lineTo(s * 0.3, s * 0.5); g.closePath(); g.fill(); });
      // 4 smoke puff (lumpy)
      cell(4, (s) => {
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * TAU, r = s * (0.12 + 0.08 * Math.sin(i * 2.3)), cx = s / 2 + Math.cos(a) * s * 0.17, cy = s / 2 + Math.sin(a) * s * 0.17;
          g.fillStyle = radial(cx, cy, r * 1.8, [[0, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, s, s);
        }
        g.fillStyle = radial(s / 2, s / 2, s * 0.42, [[0, 'rgba(255,255,255,0.7)'], [0.6, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, s, s);
      });
      // 5 leaf
      cell(5, (s) => {
        g.translate(s / 2, s / 2); g.rotate(0.6);
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -s * 0.4); g.quadraticCurveTo(s * 0.26, -s * 0.05, 0, s * 0.4); g.quadraticCurveTo(-s * 0.26, -s * 0.05, 0, -s * 0.4); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -s * 0.36); g.lineTo(0, s * 0.4); g.stroke();
      });
      // 6 petal
      cell(6, (s) => { g.fillStyle = radial(s / 2, s * 0.6, s * 0.4, [[0, 'rgba(255,255,255,1)'], [0.8, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.moveTo(s / 2, s * 0.92); g.bezierCurveTo(s * 0.08, s * 0.55, s * 0.3, s * 0.1, s / 2, s * 0.24); g.bezierCurveTo(s * 0.7, s * 0.1, s * 0.92, s * 0.55, s / 2, s * 0.92); g.fill(); });
      // 7 star flare (4-point)
      cell(7, (s) => {
        g.fillStyle = radial(s / 2, s / 2, s * 0.22, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, s, s);
        for (const [w, h, a] of [[0.5, 0.035, 0], [0.035, 0.5, 0], [0.3, 0.02, Math.PI / 4], [0.3, 0.02, -Math.PI / 4]]) {
          g.save(); g.translate(s / 2, s / 2); g.rotate(a);
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, s * Math.max(w, h)); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, s * w, s * h, 0, 0, TAU); g.fill(); g.restore();
        }
      });
      // 8 ring
      cell(8, (s) => { g.fillStyle = radial(s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.8, 'rgba(255,255,255,1)'], [0.9, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, s, s); });
      // 9 droplet
      cell(9, (s) => { g.fillStyle = radial(s * 0.5, s * 0.62, s * 0.3, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.moveTo(s / 2, s * 0.12); g.quadraticCurveTo(s * 0.78, s * 0.6, s / 2, s * 0.88); g.quadraticCurveTo(s * 0.22, s * 0.6, s / 2, s * 0.12); g.fill(); });
      // 10 ember (tiny hot core)
      cell(10, (s) => { g.fillStyle = radial(s / 2, s / 2, s / 2, [[0, 'rgba(255,255,255,1)'], [0.1, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.3)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, s, s); });
      // 11 rune glyph (talisman script)
      cell(11, (s) => { g.fillStyle = '#fff'; g.font = `bold ${s * 0.7}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.fillText('敕', s / 2, s / 2 + 4); });
      // 12 music note
      cell(12, (s) => { g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8; g.beginPath(); g.ellipse(s * 0.38, s * 0.72, s * 0.15, s * 0.11, -0.4, 0, TAU); g.fill(); g.fillRect(s * 0.49, s * 0.18, s * 0.06, s * 0.56); g.beginPath(); g.moveTo(s * 0.55, s * 0.18); g.quadraticCurveTo(s * 0.8, s * 0.26, s * 0.74, s * 0.48); g.quadraticCurveTo(s * 0.7, s * 0.34, s * 0.55, s * 0.32); g.fill(); });
      // 13 flame tongue
      cell(13, (s) => { g.fillStyle = radial(s / 2, s * 0.66, s * 0.42, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.7)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.moveTo(s / 2, s * 0.05); g.bezierCurveTo(s * 0.66, s * 0.36, s * 0.86, s * 0.6, s * 0.72, s * 0.84); g.quadraticCurveTo(s / 2, s * 1.0, s * 0.28, s * 0.84); g.bezierCurveTo(s * 0.14, s * 0.6, s * 0.4, s * 0.4, s / 2, s * 0.05); g.fill(); });
      // 14 crystal (hexagon facet)
      cell(14, (s) => { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.lineTo(s / 2 + Math.cos(a) * s * 0.36, s / 2 + Math.sin(a) * s * 0.42); } g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 4; g.stroke(); g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(s / 2, s / 2); for (let i = 0; i < 3; i++) { const a = i / 6 * TAU; g.lineTo(s / 2 + Math.cos(a) * s * 0.36, s / 2 + Math.sin(a) * s * 0.42); } g.fill(); });
      // 15 bubble
      cell(15, (s) => { g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 5; g.beginPath(); g.arc(s / 2, s / 2, s * 0.36, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill(); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(s * 0.38, s * 0.36, s * 0.08, s * 0.05, -0.6, 0, TAU); g.fill(); });
    });
  }
  // tileable value-noise texture (for scrolling shaders)
  function noiseTex() {
    const t = G.R3M.tex('vfx_noise', 256, 256, (g, w, h) => {
      const img = g.createImageData(w, h);
      const grid = (n, s) => { const a = []; for (let i = 0; i < n * n; i++) a.push(G.U.hash(i % n, (i / n) | 0, s)); return a; };
      const oct = [[8, grid(8, 1), 0.5], [16, grid(16, 2), 0.28], [32, grid(32, 3), 0.15], [64, grid(64, 4), 0.07]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0;
        for (const [n, gr, amp] of oct) {
          const fx = x / w * n, fy = y / h * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const v00 = gr[(iy % n) * n + ix % n], v10 = gr[(iy % n) * n + (ix + 1) % n], v01 = gr[((iy + 1) % n) * n + ix % n], v11 = gr[((iy + 1) % n) * n + (ix + 1) % n];
          v += amp * ((v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy);
        }
        const i = (y * w + x) * 4; const b = clamp(v, 0, 1) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = b; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, { wrap: true, srgb: false });
    return t;
  }
  // magic circle (white on transparent; tinted by the material)
  const CIRCLE_GLYPH = { fire: '火', water: '水', wood: '木', metal: '金', earth: '土', wind: '風', dark: '冥', ghost: '魂', lantern: '燈', heal: '癒', holy: '光', seal: '封', magic: '靈', neutral: '靈', trance: '幻', poison: '毒', sleep: '眠', stun: '定', thunder: '雷' };
  function circleTex(kind) {
    return G.R3M.tex('vfx_circle_' + kind, 512, 512, (g, w) => {
      const c = w / 2;
      g.translate(c, c);
      g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 6;
      const ring = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
      ring(w * 0.48, 5); ring(w * 0.455, 2); ring(w * 0.34, 3); ring(w * 0.2, 2.5);
      for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, r0 = w * 0.455, r1 = w * (i % 6 ? 0.44 : 0.425); g.lineWidth = i % 6 ? 1.5 : 3; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
      // five-element / trigram glyphs around the band
      const glyphs = ['金', '木', '水', '火', '土', '☰', '☵', '☲'];
      g.font = `bold ${w * 0.055}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2; g.save(); g.rotate(a + Math.PI / 2); g.fillText(glyphs[i], 0, -w * 0.395); g.restore(); }
      // star polygon (five elements generating/overcoming)
      g.lineWidth = 3; g.beginPath();
      for (let i = 0; i <= 5; i++) { const a = (i * 2) / 5 * TAU - Math.PI / 2; const x = Math.cos(a) * w * 0.34, y = Math.sin(a) * w * 0.34; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.lineWidth = 2; g.beginPath();
      for (let i = 0; i <= 5; i++) { const a = i / 5 * TAU - Math.PI / 2; const x = Math.cos(a) * w * 0.34, y = Math.sin(a) * w * 0.34; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.stroke();
      g.font = `bold ${w * 0.14}px serif`; g.shadowBlur = 14;
      g.fillText(CIRCLE_GLYPH[kind] || '靈', 0, 4);
    });
  }
  function scorchTex() {
    return G.R3M.tex('vfx_scorch', 256, 256, (g, w) => {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU, r = Math.random() * w * 0.28, cx = w / 2 + Math.cos(a) * r, cy = w / 2 + Math.sin(a) * r, rr = w * (0.1 + Math.random() * 0.14);
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr); gr.addColorStop(0, 'rgba(20,14,10,0.5)'); gr.addColorStop(1, 'rgba(20,14,10,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
      }
      g.strokeStyle = 'rgba(10,8,6,0.55)';
      for (let i = 0; i < 14; i++) { let x = w / 2, y = w / 2, a = Math.random() * TAU; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { a += rnd(-0.6, 0.6); x += Math.cos(a) * w * 0.06; y += Math.sin(a) * w * 0.06; g.lineTo(x, y); } g.stroke(); }
    });
  }
  function crackTex() {
    return G.R3M.tex('vfx_crack', 512, 512, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w * 0.3); gr.addColorStop(0, 'rgba(30,20,12,0.55)'); gr.addColorStop(1, 'rgba(30,20,12,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      const crack = (x, y, a, len, lw, depth) => {
        g.lineWidth = lw; g.strokeStyle = 'rgba(16,10,6,0.9)'; g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 7; j++) { a += rnd(-0.5, 0.5); x += Math.cos(a) * len / 7; y += Math.sin(a) * len / 7; g.lineTo(x, y); if (depth < 2 && Math.random() < 0.25) { g.stroke(); crack(x, y, a + rnd(-1, 1), len * 0.5, lw * 0.6, depth + 1); g.beginPath(); g.moveTo(x, y); g.lineWidth = lw; } lw *= 0.86; }
        g.stroke();
      };
      for (let i = 0; i < 9; i++) crack(w / 2, w / 2, i / 9 * TAU + rnd(-0.2, 0.2), w * rnd(0.3, 0.46), 7, 0);
    });
  }
  function talismanTex() {
    return G.R3M.tex('vfx_talisman', 64, 160, (g, w, h) => {
      g.fillStyle = '#f2d36a'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(160,90,20,0.25)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      g.strokeStyle = '#b8241c'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#b8241c'; g.font = 'bold 30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('敕', w / 2, 30); g.fillText('令', w / 2, 66);
      g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 90); for (let i = 0; i < 5; i++) g.lineTo(w / 2 + (i % 2 ? 12 : -12), 96 + i * 11); g.stroke();
    });
  }

  // ------------------------------------------------------------------------------------------ shaders
  const NOISE_GLSL = `
    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
    float snoise(vec3 v){
      const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
      vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
      i=mod289(i);
      vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
      float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.0*floor(p*ns.z*ns.z);
      vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
      vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
      vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
      vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
      return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }`;
  const OUT_GLSL = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';

  const PARTICLE_VS = `
    uniform float uTime;
    attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iAcc; attribute vec4 iTime;
    attribute vec4 iCol0; attribute vec4 iCol1; attribute vec4 iMisc;
    varying vec2 vUv; varying vec4 vCol;
    void main(){
      float age = uTime - iTime.x; float k = age / iTime.y;
      if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
      float d = iAcc.w; float e = exp(-d * age);
      vec3 p = iPos + (d > 0.001 ? iVel * (1.0 - e) / d : iVel * age) + 0.5 * iAcc.xyz * age * age;
      vec3 vel = iVel * e + iAcc.xyz * age;
      float size = mix(iTime.z, iTime.w, k);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vec2 q;
      if (iMisc.z > 0.0) {
        vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
        float len = length(vv.xy);
        vec2 dir = len > 1e-4 ? vv.xy / len : vec2(1.0, 0.0);
        vec2 per = vec2(-dir.y, dir.x);
        q = dir * position.x * size * (1.0 + iMisc.z * len) + per * position.y * size * 0.32;
      } else {
        float r = iMisc.w + iMisc.y * age; float c = cos(r), s = sin(r);
        q = mat2(c, s, -s, c) * position.xy * size;
      }
      mv.xy += q;
      gl_Position = projectionMatrix * mv;
      float cell = iMisc.x;
      vUv = (vec2(mod(cell, 4.0), 3.0 - floor(cell / 4.0)) + uv) / 4.0;
      vCol = mix(iCol0, iCol1, k);
      vCol.a *= smoothstep(0.0, 0.07, k);
    }`;
  const PARTICLE_FS = `
    uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
    void main(){
      vec4 t = texture2D(uMap, vUv);
      gl_FragColor = vec4(vCol.rgb * t.rgb, vCol.a * t.a);
      if (gl_FragColor.a < 0.003) discard;
      ${OUT_GLSL}
    }`;

  class Particles {
    constructor(scene, cap, additive, map) {
      const T = THREE;
      this.cap = cap; this.head = 0; this.time = 0;
      const geo = new T.InstancedBufferGeometry();
      const base = new T.PlaneGeometry(1, 1);
      geo.index = base.index;
      geo.setAttribute('position', base.attributes.position);
      geo.setAttribute('uv', base.attributes.uv);
      const mk = (n) => { const a = new T.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(T.DynamicDrawUsage); return a; };
      this.a = { iPos: mk(3), iVel: mk(3), iAcc: mk(4), iTime: mk(4), iCol0: mk(4), iCol1: mk(4), iMisc: mk(4) };
      for (const k in this.a) geo.setAttribute(k, this.a[k]);
      // start everything dead
      for (let i = 0; i < cap; i++) { this.a.iTime.array[i * 4] = -1e6; this.a.iTime.array[i * 4 + 1] = 1; }
      geo.instanceCount = cap;
      this.uni = { uTime: { value: 0 }, uMap: { value: map } };
      const mat = new T.ShaderMaterial({
        uniforms: this.uni, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
        transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
      });
      this.mesh = new T.Mesh(geo, mat);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = additive ? 20 : 18;
      scene.add(this.mesh);
      this.lo = cap; this.hi = -1;
    }
    spawn(p, v, acc, drag, life, s0, s1, c0, c1, cell, spin, stretch, rot) {
      const i = this.head; this.head = (this.head + 1) % this.cap;
      const A = this.a;
      A.iPos.array.set([p.x, p.y, p.z], i * 3);
      A.iVel.array.set([v.x, v.y, v.z], i * 3);
      A.iAcc.array.set([acc.x, acc.y, acc.z, drag], i * 4);
      A.iTime.array.set([this.time, life, s0, s1], i * 4);
      A.iCol0.array.set(c0, i * 4);
      A.iCol1.array.set(c1, i * 4);
      A.iMisc.array.set([cell, spin, stretch, rot], i * 4);
      if (i < this.lo) this.lo = i;
      if (i > this.hi) this.hi = i;
    }
    update(dt) {
      this.time += dt;
      this.uni.uTime.value = this.time;
      if (this.hi >= this.lo) {
        for (const k in this.a) {
          const at = this.a[k];
          at.clearUpdateRanges();
          at.addUpdateRange(this.lo * at.itemSize, (this.hi - this.lo + 1) * at.itemSize);
          at.needsUpdate = true;
        }
      }
      this.lo = this.cap; this.hi = -1;
    }
    dispose() { this.mesh.parent && this.mesh.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
  }

  // slash crescent (uv.x along the arc, uv.y across); uProg sweeps the bright head along the arc
  const SLASH_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const SLASH_FS = `
    uniform vec3 uA, uB; uniform float uProg, uAlpha; varying vec2 vUv;
    void main(){
      float along = vUv.x;
      float tail = smoothstep(uProg - 0.75, uProg, along) * step(along, uProg + 0.02);
      float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
      float core = pow(max(across, 0.0), 5.0);
      vec3 c = mix(uB, uA, core) * (0.35 + 1.4 * pow(max(across, 0.0), 1.4));
      float a = tail * smoothstep(0.0, 0.25, across) * uAlpha;
      gl_FragColor = vec4(c * a, a);
      ${OUT_GLSL}
    }`;
  function slashGeometry(arc, r, thick, n = 40) {
    const T = THREE;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = -arc / 2 + arc * t;
      const w = thick * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.65) + 0.004;
      const r0 = r - w * 0.5, r1 = r + w * 0.5;
      pos.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
      uv.push(t, 0, t, 1);
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  // shockwave / soft disc: uR = ring radius (0..1 of the quad), uW width, uFill inner fill
  const RING_FS = `
    uniform vec3 uCol; uniform float uR, uW, uAlpha, uFill; varying vec2 vUv;
    void main(){
      float r = length(vUv - 0.5) * 2.0;
      float ring = exp(-pow((r - uR) / max(uW, 1e-3), 2.0));
      float fill = uFill * smoothstep(uR, uR * 0.2, r) * step(r, uR);
      float a = (ring + fill) * uAlpha * step(r, 1.0);
      gl_FragColor = vec4(uCol * a, a);
      ${OUT_GLSL}
    }`;

  // noise-displaced orb: explosions, fireballs, void spheres, water globes
  const ORB_VS = `
    uniform float uTime, uDisp, uFreq; varying vec3 vN; varying vec3 vV; varying float vNoise;
    ${NOISE_GLSL}
    void main(){
      float n = snoise(normal * uFreq + vec3(0.0, -uTime * 1.6, uTime * 0.7));
      n += 0.5 * snoise(normal * uFreq * 2.3 + vec3(uTime * 1.1));
      vNoise = n;
      vec3 p = position + normal * n * uDisp;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * normal); vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const ORB_FS = `
    uniform vec3 uA, uB, uC; uniform float uAlpha, uHeat, uDissolve, uRim, uDark;
    varying vec3 vN; varying vec3 vV; varying float vNoise;
    void main(){
      float fr = 1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
      float h = clamp(0.5 + 0.4 * vNoise + uHeat * (1.0 - fr) - 0.35 * fr, 0.0, 1.0);
      vec3 c = h > 0.5 ? mix(uB, uA, (h - 0.5) * 2.0) : mix(uC, uB, h * 2.0);
      float d = vNoise * 0.5 + 0.5;
      float keep = smoothstep(uDissolve - 0.08, uDissolve + 0.08, d);
      float a = uAlpha * keep * mix(1.0, smoothstep(0.0, 0.6, 1.0 - fr), uRim);
      c += uB * pow(fr, 3.0) * 1.5 * (1.0 - uDark);
      if (uDark > 0.5) { gl_FragColor = vec4(mix(uC, uB, pow(fr, 2.5)), a); }
      else gl_FragColor = vec4(c * a, a);
      ${OUT_GLSL}
    }`;

  // energy column (unit cylinder, origin at bottom): pillars, beams, geysers, tornadoes
  const COL_VS = `
    uniform float uTime, uTwist, uSpin, uR0, uR1, uWave;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      vUv = uv;
      vec3 p = position;
      float r = mix(uR0, uR1, uv.y) * (1.0 + uWave * sin(uv.y * 14.0 - uTime * 9.0) * 0.12);
      float a = uv.y * uTwist + uTime * uSpin;
      float c = cos(a), s = sin(a);
      p.xz = mat2(c, -s, s, c) * (p.xz * r);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * vec3(p.x, 0.0, p.z)); vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const COL_FS = `
    uniform sampler2D uNoise; uniform vec3 uA, uB; uniform float uTime, uAlpha, uScroll, uStreak, uTop;
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      float n = texture2D(uNoise, vec2(vUv.x * 2.0, vUv.y * 0.6 - uTime * uScroll)).r;
      float n2 = texture2D(uNoise, vec2(vUv.x * 4.0 + 0.3, vUv.y * 1.3 - uTime * uScroll * 1.7)).r;
      float st = mix(1.0, smoothstep(0.35, 0.85, n * 0.6 + n2 * 0.6), uStreak);
      float fr = abs(dot(normalize(vN), normalize(vV)));
      float edge = smoothstep(0.0, 0.55, fr);
      float vert = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, uTop, vUv.y);
      vec3 c = mix(uB, uA, st * edge);
      float a = uAlpha * st * vert * (0.25 + 0.75 * edge);
      gl_FragColor = vec4(c * a, a);
      ${OUT_GLSL}
    }`;

  // ------------------------------------------------------------------------------------------ system
  const _v = () => new THREE.Vector3();
  const col4 = (hex, a, k = 1) => { const c = new THREE.Color(hex); return [c.r * k, c.g * k, c.b * k, a]; };

  class System {
    constructor(view) {
      const T = THREE;
      this.view = view;
      this.scene = view.scene;
      this.lite = !!view.lite;
      this.atlas = atlasTex();
      this.noise = noiseTex();
      const capA = this.lite ? 3500 : 9000, capB = this.lite ? 1500 : 3500;
      this.add = new Particles(this.scene, capA, true, this.atlas);
      this.alpha = new Particles(this.scene, capB, false, this.atlas);
      this.items = [];   // { update(dt) -> bool, dispose() }
      this.timers = [];  // { t, fn }
      this.time = 0;
      this.status = new Map(); // unit -> { kind -> state }
      // pooled flash lights (fixed count: no shader recompiles)
      this.lights = [];
      for (let i = 0; i < 4; i++) {
        const l = new T.PointLight(0xffffff, 0, 8, 1.8);
        l.castShadow = false; l.userData = { t: 0, dur: 0, i0: 0 };
        this.scene.add(l); this.lights.push(l);
      }
      this.geo = {
        plane: new T.PlaneGeometry(1, 1),
        col: (() => { const g = new T.CylinderGeometry(1, 1, 1, 32, 24, true); g.translate(0, 0.5, 0); return g; })(),
        orb: new T.IcosahedronGeometry(1, this.lite ? 3 : 4),
      };
    }

    // one shared texture per atlas cell (sprites can't offset UVs per instance)
    cellTex(cell) {
      this._cells = this._cells || [];
      if (!this._cells[cell]) { const tx = this.atlas.clone(); tx.needsUpdate = true; tx.repeat.set(0.25, 0.25); tx.offset.set((cell % 4) * 0.25, (3 - Math.floor(cell / 4)) * 0.25); this._cells[cell] = tx; }
      return this._cells[cell];
    }

    // ---------------------------------------------------------------- scheduling
    later(t, fn) { if (t <= 0) fn(); else this.timers.push({ t: this.time + t, fn }); }
    track(item) { this.items.push(item); return item; }

    update(dt) {
      this.time += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.time) { const f = this.timers[i].fn; this.timers.splice(i, 1); try { f(); } catch (e) { G.warnOnce('vfx timer', e); } }
      for (let i = this.items.length - 1; i >= 0; i--) {
        let alive = false;
        try { alive = this.items[i].update(dt); } catch (e) { G.warnOnce('vfx item', e); }
        if (!alive) { const it = this.items[i]; this.items.splice(i, 1); try { it.dispose && it.dispose(); } catch (e) { /* ignore */ } }
      }
      for (const l of this.lights) {
        const u = l.userData;
        if (u.dur <= 0) { l.intensity = 0; continue; }
        u.t += dt;
        const k = u.t / u.dur;
        l.intensity = k >= 1 ? 0 : u.i0 * (1 - k) * (1 - k) * (u.flicker ? 0.75 + 0.25 * Math.sin(u.t * 40) : 1);
        if (k >= 1) u.dur = 0;
      }
      this.add.update(dt); this.alpha.update(dt);
      this.updateStatuses(dt);
    }

    // ---------------------------------------------------------------- particles
    // o: { pos, n, spread, disk, ring, speed:[a,b], dir, cone, up, gravity, drag, life:[a,b], size:[s0,s1], sizeJ,
    //      color0 (hex|[hex]), color1, a0, a1, k (intensity), spin, stretch, shape, alpha (normal blending), wind }
    emit(o) {
      const sys = o.alpha ? this.alpha : this.add;
      const n = Math.round((o.n || 10) * (this.lite ? 0.6 : 1));
      const p = _v(), v = _v(), acc = new THREE.Vector3(o.wind ? o.wind.x : 0, -(o.gravity || 0), o.wind ? o.wind.z : 0);
      const cells = Array.isArray(o.shape) ? o.shape : [o.shape != null ? (typeof o.shape === 'string' ? CELL[o.shape] : o.shape) : 0];
      const sp = o.speed || [1, 3], lf = o.life || [0.5, 1], sz = o.size || [0.3, 0.1];
      const c0s = Array.isArray(o.color0) ? o.color0 : [o.color0 || '#ffffff'];
      const c1s = o.color1 ? (Array.isArray(o.color1) ? o.color1 : [o.color1]) : null;
      const k = o.k != null ? o.k : (o.alpha ? 1 : 1.6);
      const dir = o.dir ? o.dir.clone().normalize() : null;
      for (let i = 0; i < n; i++) {
        p.copy(o.pos);
        if (o.disk) { const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * o.disk; p.x += Math.cos(a) * r; p.z += Math.sin(a) * r; }
        else if (o.ring) { const a = Math.random() * TAU; p.x += Math.cos(a) * o.ring; p.z += Math.sin(a) * o.ring; }
        else if (o.spread) { p.x += rnd(-1, 1) * o.spread; p.y += rnd(-1, 1) * o.spread * (o.flat ? 0.3 : 1); p.z += rnd(-1, 1) * o.spread; }
        if (o.box) { p.x += rnd(-o.box[0], o.box[0]); p.y += rnd(0, o.box[1]); p.z += rnd(-o.box[2], o.box[2]); }
        // direction
        if (dir) {
          const c = o.cone != null ? o.cone : 0.4;
          v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(Math.sin(c) * Math.random()).add(dir).normalize();
        } else if (o.radial && (o.disk || o.ring)) { v.set(p.x - o.pos.x, 0, p.z - o.pos.z).normalize(); v.y = o.up || 0; v.normalize(); }
        else { v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (v.lengthSq() < 1e-4) v.set(0, 1, 0); v.normalize(); if (o.up) { v.y = Math.abs(v.y) * o.up + (1 - o.up) * v.y; v.normalize(); } }
        if (o.inward) { v.copy(o.pos).sub(p).normalize(); }
        v.multiplyScalar(rnd(sp[0], sp[1]));
        const life = rnd(lf[0], lf[1]);
        const j = o.sizeJ != null ? rnd(1 - o.sizeJ, 1 + o.sizeJ) : rnd(0.7, 1.3);
        const c0 = col4(pick(c0s), o.a0 != null ? o.a0 : 1, k);
        const c1 = c1s ? col4(pick(c1s), o.a1 != null ? o.a1 : 0, k) : [c0[0], c0[1], c0[2], o.a1 != null ? o.a1 : 0];
        sys.spawn(p, v, acc, o.drag || 0, life, sz[0] * j, sz[1] * j, c0, c1, pick(cells), o.spin != null ? rnd(-o.spin, o.spin) : rnd(-2, 2), o.stretch || 0, rnd(0, TAU));
      }
    }
    // trail of particles along a moving point (call per frame)
    puff(pos, o) { this.emit(Object.assign({ pos, n: 2, speed: [0.05, 0.3], life: [0.25, 0.5] }, o)); }

    // ---------------------------------------------------------------- lights & screen
    light(pos, color, intensity = 6, dist = 8, dur = 0.5, flicker) {
      let best = this.lights[0];
      for (const l of this.lights) if (l.userData.dur <= 0) { best = l; break; } else if (l.userData.t / l.userData.dur > best.userData.t / best.userData.dur) best = l;
      best.position.copy(pos); best.color.set(color); best.distance = dist;
      best.userData.t = 0; best.userData.dur = dur; best.userData.i0 = intensity * (this.view.lightK || 1); best.userData.flicker = !!flicker;
    }
    shake(a, d) { if (this.view.shake) this.view.shake(a, d); }
    flash(c, a, d) { if (this.view.flash) this.view.flash(c, a, d); }

    // ---------------------------------------------------------------- mesh primitives
    slash(pos, o = {}) {
      const T = THREE, cam = this.view.camera;
      const arc = o.arc || 2.2, r = o.r || 0.9, thick = o.thick || 0.32, dur = o.dur || 0.28;
      const pal = o.pal || PAL.neutral;
      const mat = new T.ShaderMaterial({
        uniforms: { uA: { value: new T.Color(pal[0]).multiplyScalar(o.k || 2.2) }, uB: { value: new T.Color(pal[1]).multiplyScalar(o.k || 2.2) }, uProg: { value: 0 }, uAlpha: { value: 1 } },
        vertexShader: SLASH_VS, fragmentShader: SLASH_FS, transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      });
      const m = new T.Mesh(slashGeometry(arc, r, thick), mat);
      m.renderOrder = 30;
      m.position.copy(pos);
      // face the camera, then roll
      m.quaternion.copy(cam.quaternion);
      m.rotateZ(o.roll != null ? o.roll : rnd(-0.9, 0.9));
      if (o.tilt) m.rotateX(o.tilt);
      if (o.flip) m.scale.x = -1;
      this.scene.add(m);
      let t = 0;
      return this.track({
        update: (dt) => {
          t += dt; const k = t / dur;
          mat.uniforms.uProg.value = ease.out3(Math.min(1, k * 1.5)) * 1.2;
          mat.uniforms.uAlpha.value = k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4);
          const s = 1 + k * 0.18; m.scale.set((o.flip ? -1 : 1) * s, s, s);
          return k < 1;
        },
        dispose: () => { this.scene.remove(m); m.geometry.dispose(); mat.dispose(); },
      });
    }
    ring(pos, o = {}) {
      const T = THREE;
      const mat = new T.ShaderMaterial({
        uniforms: { uCol: { value: new T.Color(o.color || '#ffffff').multiplyScalar(o.k || 1.6) }, uR: { value: 0.1 }, uW: { value: o.w || 0.06 }, uAlpha: { value: 1 }, uFill: { value: o.fill || 0 } },
        vertexShader: SLASH_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
      });
      const m = new T.Mesh(this.geo.plane, mat);
      const R = o.r || 2;
      m.scale.set(R * 2, R * 2, 1);
      m.position.copy(pos);
      if (o.vertical) m.quaternion.copy(this.view.camera.quaternion);
      else { m.rotation.x = -Math.PI / 2; m.position.y = Math.max(m.position.y, 0.04); }
      m.renderOrder = 22;
      this.scene.add(m);
      let t = 0; const dur = o.dur || 0.5, r0 = o.r0 != null ? o.r0 : 0.1;
      return this.track({
        mesh: m,
        update: (dt) => {
          t += dt; const k = Math.min(1, t / dur);
          if (o.rise) m.position.y = pos.y + ease.out(k) * o.rise;
          mat.uniforms.uR.value = r0 + (0.92 - r0) * ease.out3(k);
          mat.uniforms.uAlpha.value = (1 - k) * (1 - k) * (o.a || 1);
          mat.uniforms.uW.value = (o.w || 0.06) * (1 + k * 1.5);
          return t < dur;
        },
        dispose: () => { this.scene.remove(m); mat.dispose(); },
      });
    }
    orb(pos, o = {}) {
      const T = THREE;
      const pal = o.pal || PAL.fire;
      const u = {
        uTime: { value: rnd(0, 10) }, uDisp: { value: o.disp != null ? o.disp : 0.28 }, uFreq: { value: o.freq || 1.6 },
        uA: { value: new T.Color(pal[0]).multiplyScalar(o.k || 2.4) }, uB: { value: new T.Color(pal[1]).multiplyScalar(o.k || 2.0) }, uC: { value: new T.Color(o.dark ? pal[3] : pal[2]).multiplyScalar(o.dark ? 1 : (o.k || 1.6)) },
        uAlpha: { value: 1 }, uHeat: { value: o.heat != null ? o.heat : 0.5 }, uDissolve: { value: 0 }, uRim: { value: o.rim || 0 }, uDark: { value: o.dark ? 1 : 0 },
      };
      const mat = new T.ShaderMaterial({ uniforms: u, vertexShader: ORB_VS, fragmentShader: ORB_FS, transparent: true, depthWrite: false, blending: o.dark ? T.NormalBlending : T.AdditiveBlending });
      const m = new T.Mesh(this.geo.orb, mat);
      m.position.copy(pos); m.renderOrder = o.dark ? 19 : 21;
      this.scene.add(m);
      let t = 0; const dur = o.dur || 0.6, r0 = o.r0 != null ? o.r0 : 0.2, r1 = o.r1 || 1.4;
      const it = {
        mesh: m, u,
        update: (dt) => {
          t += dt; const k = Math.min(1, t / dur);
          u.uTime.value += dt * (o.flow || 1);
          const s = o.implode ? r1 + (r0 - r1) * ease.in2(k) : r0 + (r1 - r0) * ease.out3(k);
          m.scale.setScalar(Math.max(0.01, s));
          if (o.follow) m.position.copy(o.follow());
          u.uDissolve.value = o.hold ? 0 : clamp((k - 0.35) / 0.65, 0, 1) * 1.05;
          u.uHeat.value = (o.heat != null ? o.heat : 0.5) * (1 - k * 0.8);
          u.uAlpha.value = o.hold ? 1 : 1 - Math.max(0, (k - 0.8) / 0.2);
          return o.hold ? !it.dead : t < dur;
        },
        dispose: () => { this.scene.remove(m); mat.dispose(); },
      };
      return this.track(it);
    }
    column(pos, o = {}) {
      const T = THREE;
      const pal = o.pal || PAL.holy;
      const u = {
        uTime: { value: rnd(0, 5) }, uTwist: { value: o.twist || 0 }, uSpin: { value: o.spin || 0 }, uR0: { value: o.r0 != null ? o.r0 : 0.6 }, uR1: { value: o.r1 != null ? o.r1 : 0.6 }, uWave: { value: o.wave || 0 },
        uNoise: { value: this.noise }, uA: { value: new T.Color(pal[0]).multiplyScalar(o.k || 2.2) }, uB: { value: new T.Color(pal[1]).multiplyScalar(o.k || 1.6) },
        uAlpha: { value: 0 }, uScroll: { value: o.scroll != null ? o.scroll : 1.2 }, uStreak: { value: o.streak != null ? o.streak : 0.8 }, uTop: { value: o.top != null ? o.top : 0.6 },
      };
      const mat = new T.ShaderMaterial({ uniforms: u, vertexShader: COL_VS, fragmentShader: COL_FS, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
      const m = new T.Mesh(this.geo.col, mat);
      m.position.copy(pos); m.renderOrder = 21;
      const H = o.h || 5;
      if (o.to) { // beam: orient +y toward the destination
        const d = o.to.clone().sub(pos); const len = d.length();
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
        o.h = len;
      }
      this.scene.add(m);
      let t = 0; const dur = o.dur || 0.8, grow = o.grow != null ? o.grow : 0.15;
      return this.track({
        mesh: m, u,
        update: (dt) => {
          t += dt; const k = Math.min(1, t / dur);
          u.uTime.value += dt;
          const gk = grow > 0 ? ease.out3(Math.min(1, t / (dur * grow))) : 1;
          m.scale.set(o.scale || 1, (o.h || H) * gk, o.scale || 1);
          u.uAlpha.value = (o.a || 1) * Math.min(1, t / 0.06) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
          if (o.shrink) { const s = 1 - ease.in2(Math.max(0, (k - 0.5) / 0.5)); u.uR0.value = (o.r0 != null ? o.r0 : 0.6) * s; u.uR1.value = (o.r1 != null ? o.r1 : 0.6) * s; }
          return t < dur;
        },
        dispose: () => { this.scene.remove(m); mat.dispose(); },
      });
    }
    decal(pos, tex, o = {}) {
      const T = THREE;
      const mat = new T.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        blending: o.add ? T.AdditiveBlending : T.NormalBlending, color: new T.Color(o.color || '#ffffff').multiplyScalar(o.k || 1), toneMapped: !o.add, fog: false, opacity: 0,
      });
      const m = new T.Mesh(this.geo.plane, mat);
      m.rotation.x = -Math.PI / 2; m.rotation.z = o.rot != null ? o.rot : rnd(0, TAU);
      m.position.set(pos.x, (o.y || 0.03) + Math.random() * 0.005, pos.z);
      const S = o.size || 2; m.scale.set(S, S, 1);
      m.renderOrder = o.add ? 15 : 2;
      this.scene.add(m);
      let t = 0; const dur = o.dur || 3, fin = o.fadeIn || 0.08;
      return this.track({
        mesh: m,
        update: (dt) => {
          t += dt;
          const a = Math.min(1, t / fin) * (t > dur * 0.6 ? Math.max(0, 1 - (t - dur * 0.6) / (dur * 0.4)) : 1);
          mat.opacity = a * (o.a || 1);
          if (o.spin) m.rotation.z += o.spin * dt;
          if (o.grow) { const s = S * (1 + o.grow * ease.out3(Math.min(1, t / dur))); m.scale.set(s, s, 1); }
          if (o.follow) { const f = o.follow(); m.position.x = f.x; m.position.z = f.z; }
          return t < dur;
        },
        dispose: () => { this.scene.remove(m); mat.dispose(); },
      });
    }
    circle(pos, kind, color, o = {}) {
      return this.decal(pos, circleTex(kind), Object.assign({ add: true, color, k: 2.2, size: 2.6, dur: 0.9, spin: 1.2, fadeIn: 0.15, y: 0.05 }, o));
    }
    flare(pos, color, o = {}) {
      const T = THREE;
      const mat = new T.SpriteMaterial({ map: this.atlas, color: new T.Color(color).multiplyScalar(o.k || 3), blending: T.AdditiveBlending, transparent: true, depthWrite: false, depthTest: !o.over, fog: false });
      mat.map = this.cellTex(o.shape != null ? CELL[o.shape] : CELL.star);
      const s = new T.Sprite(mat);
      s.position.copy(pos); s.renderOrder = 31;
      this.scene.add(s);
      let t = 0; const dur = o.dur || 0.3, S = o.size || 2;
      return this.track({
        update: (dt) => { t += dt; const k = t / dur; const sc = S * (o.shrink ? 1 - k * 0.7 : 0.5 + ease.out3(Math.min(1, k * 2.5)) * 0.7); s.scale.set(sc, sc, 1); mat.opacity = Math.max(0, 1 - k * k); mat.rotation = (o.rot || 0) + k * (o.spin || 0.6); return k < 1; },
        dispose: () => { this.scene.remove(s); mat.dispose(); },
      });
    }
    lightning(from, to, o = {}) {
      const T = THREE, cam = this.view.camera;
      const pal = o.pal || PAL.thunder;
      const mat = new T.MeshBasicMaterial({ color: new T.Color(pal[0]).multiplyScalar(o.k || 4), transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false, fog: false });
      const glowMat = new T.MeshBasicMaterial({ color: new T.Color(pal[2]).multiplyScalar(1.6), transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false, fog: false });
      const geo = new T.BufferGeometry(), gGeo = new T.BufferGeometry();
      const m = new T.Mesh(geo, mat), gm = new T.Mesh(gGeo, glowMat);
      m.renderOrder = 32; gm.renderOrder = 31; m.frustumCulled = false; gm.frustumCulled = false;
      this.scene.add(m, gm);
      const build = () => {
        // midpoint-displaced polyline + a few branches → camera-facing ribbons
        const pts = [from.clone(), to.clone()];
        let disp = from.distanceTo(to) * 0.18;
        for (let it = 0; it < 6; it++) {
          const out = [pts[0]];
          for (let i = 0; i < pts.length - 1; i++) {
            const mid = pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5);
            mid.x += rnd(-disp, disp); mid.z += rnd(-disp, disp); mid.y += rnd(-disp, disp) * 0.3;
            out.push(mid, pts[i + 1]);
          }
          pts.length = 0; pts.push(...out); disp *= 0.55;
        }
        const strands = [pts];
        for (let b = 0; b < (o.branches != null ? o.branches : 3); b++) {
          const i0 = 8 + ((Math.random() * (pts.length - 20)) | 0);
          const br = [pts[i0].clone()]; const dir = pts[Math.min(pts.length - 1, i0 + 6)].clone().sub(pts[i0]).normalize();
          dir.x += rnd(-0.8, 0.8); dir.z += rnd(-0.8, 0.8); dir.normalize();
          for (let j = 0; j < 8; j++) br.push(br[j].clone().addScaledVector(dir, 0.18).add(new T.Vector3(rnd(-0.1, 0.1), rnd(-0.1, 0.1), rnd(-0.1, 0.1))));
          strands.push(br);
        }
        const ribbon = (w) => {
          const P = [];
          const vd = new T.Vector3();
          for (const s of strands) {
            const ww = s === pts ? w : w * 0.5;
            for (let i = 0; i < s.length - 1; i++) {
              const a = s[i], b = s[i + 1];
              vd.copy(cam.position).sub(a);
              const side = b.clone().sub(a).cross(vd).normalize().multiplyScalar(ww * (1 - i / s.length * 0.5));
              P.push(a.x - side.x, a.y - side.y, a.z - side.z, a.x + side.x, a.y + side.y, a.z + side.z, b.x + side.x, b.y + side.y, b.z + side.z);
              P.push(a.x - side.x, a.y - side.y, a.z - side.z, b.x + side.x, b.y + side.y, b.z + side.z, b.x - side.x, b.y - side.y, b.z - side.z);
            }
          }
          return new T.Float32BufferAttribute(P, 3);
        };
        geo.setAttribute('position', ribbon(o.w || 0.045));
        gGeo.setAttribute('position', ribbon((o.w || 0.045) * 5));
      };
      build();
      let t = 0, rb = 0; const dur = o.dur || 0.3;
      return this.track({
        update: (dt) => {
          t += dt; rb += dt;
          if (rb > 0.05) { rb = 0; build(); }
          const a = Math.max(0, 1 - t / dur) * (0.6 + 0.4 * Math.random());
          mat.opacity = a; glowMat.opacity = a * 0.5;
          return t < dur;
        },
        dispose: () => { this.scene.remove(m, gm); geo.dispose(); gGeo.dispose(); mat.dispose(); glowMat.dispose(); },
      });
    }
    // generic animated object
    obj(o3d, update, dispose) {
      this.scene.add(o3d);
      let t = 0;
      return this.track({ update: (dt) => { t += dt; return update(t, dt); }, dispose: () => { this.scene.remove(o3d); if (dispose) dispose(); } });
    }
    projectile(from, to, o = {}) {
      const pal = o.pal || PAL.fire;
      const dur = o.dur || 0.35, arc = o.arc != null ? o.arc : 0.6;
      const T = THREE;
      const head = this.orb(from.clone(), { pal, r0: o.r || 0.28, r1: o.r || 0.28, dur: dur + 0.1, hold: true, disp: 0.18, freq: 2.4, heat: 0.9, k: 2.6, flow: 3 });
      const p = new T.Vector3();
      let t = 0;
      this.track({
        update: (dt) => {
          t += dt; const k = Math.min(1, t / dur);
          p.lerpVectors(from, to, ease.in2(k) * 0.3 + k * 0.7);
          p.y += Math.sin(k * Math.PI) * arc;
          head.mesh.position.copy(p);
          this.emit({ pos: p, n: o.trailN || 3, speed: [0.1, 0.6], life: [0.2, 0.45], size: [o.trail || 0.35, 0.05], color0: pal.slice(0, 3), shape: o.shape || 'glow', k: 2 });
          if (o.smoke) this.emit({ pos: p, n: 1, speed: [0.05, 0.3], life: [0.4, 0.8], size: [0.25, 0.6], color0: pal[3], a0: 0.35, alpha: true, shape: 'smoke', gravity: -0.6 });
          if (k >= 1) { head.dead = true; if (o.onHit) o.onHit(p.clone()); return false; }
          return true;
        },
      });
      return dur;
    }

    // ---------------------------------------------------------------- unit helpers
    P(u, where) { return this.view.pos(u, where || 'chest'); }
    UV(u) { return this.view.unitView ? this.view.unitView(u) : null; }
    glowUnit(u, color, amt, dur) { const uv = this.UV(u); if (uv && uv.glow) uv.glow(color, amt, dur); }
    sizeOf(u) { const uv = this.UV(u); return uv ? Math.max(0.6, uv.height / 1.7) : 1; }
    // direction from a toward b on the ground plane
    dirTo(a, b) { const d = this.P(b, 'feet').sub(this.P(a, 'feet')); d.y = 0; return d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector3(-1, 0, 0); }

    // ---------------------------------------------------------------- cast (charge-up under the caster)
    cast(u, s) {
      const kind = this.kindFor(s, null);
      const pal = palOf(kind);
      const feet = this.P(u, 'feet');
      this.circle(feet, CIRCLE_GLYPH[kind] ? kind : 'magic', pal[1], { size: 2.4 * this.sizeOf(u), dur: 1.0, grow: 0.15 });
      this.emit({ pos: feet, disk: 1.0, n: 26, speed: [0.4, 1.4], dir: new THREE.Vector3(0, 1, 0), cone: 0.15, life: [0.5, 0.9], size: [0.16, 0.02], color0: pal.slice(0, 2), shape: 'ember', drag: 0.6 });
      this.emit({ pos: this.P(u, 'chest'), ring: 1.2, n: 18, inward: true, speed: [1.6, 2.6], life: [0.35, 0.5], size: [0.12, 0.03], color0: pal[0], shape: 'spark', stretch: 0.25 });
      this.light(this.P(u, 'chest'), pal[1], 3.5, 6, 0.8);
      this.glowUnit(u, pal[1], 0.12, 0.5);
    }
    kindFor(s, id) {
      if (id) {
        const b = id.replace(/_big|_multi|_all/, '');
        if (PAL[b]) return b;
        if (b === 'song') return 'water';
        if (b === 'kaleido') return 'trance';
        if (b === 'revive') return 'holy';
        if (b === 'buff' || b === 'cure') return 'holy';
        if (b === 'debuff') return 'dark';
      }
      if (s) {
        if (s.type === 'heal' || s.type === 'revive') return s.elem === 'water' ? 'water' : 'heal';
        if (s.type === 'buff' || s.type === 'cure') return 'holy';
        if (s.type === 'debuff') return 'dark';
        if (s.elem) return s.elem === 'wood' ? 'wood' : s.elem;
      }
      return 'magic';
    }

    // ---------------------------------------------------------------- hit / kill
    hit(tg, o = {}) {
      const pos = this.P(tg, 'chest');
      const kind = o.elem || (o.attacker && o.attacker.side === 'enemy' ? 'dark' : 'neutral');
      const pal = palOf(kind === 'wood' ? 'wood' : kind);
      const sc = this.sizeOf(tg);
      const away = o.attacker ? this.dirTo(o.attacker, tg) : new THREE.Vector3(tg.side === 'party' ? 1 : -1, 0, 0);
      const dir = away.clone(); dir.y = 0.35;
      this.emit({ pos, n: o.crit ? 34 : 18, dir, cone: 0.9, speed: [3, 8], drag: 3.5, gravity: 4, life: [0.18, 0.4], size: [0.16, 0.02], color0: [pal[0], pal[1]], shape: 'spark', stretch: 0.14, k: 2.6 });
      this.emit({ pos, n: 6, speed: [0.2, 1], life: [0.12, 0.2], size: [0.9 * sc, 0.3], color0: pal[1], shape: 'glow', k: 1.4 });
      this.flare(pos, pal[0], { size: Math.min(3.4, (o.crit ? 2.4 : 1.4) * Math.sqrt(sc)), dur: o.crit ? 0.26 : 0.16, k: o.crit ? 3.2 : 2.2, rot: rnd(0, 1) });
      if (o.crit) {
        this.ring(pos, { vertical: true, r: 1.6 * sc, color: pal[1], dur: 0.32, w: 0.04, k: 2 });
        this.emit({ pos, n: 10, speed: [1, 3], drag: 2, life: [0.3, 0.5], size: [0.35, 0.05], color0: '#ffe9a0', shape: 'star', k: 2.4 });
      }
      if (o.weak) this.emit({ pos: pos.clone().add(new THREE.Vector3(0, 0.3, 0)), n: 8, speed: [0.5, 1.5], gravity: -1, life: [0.4, 0.6], size: [0.25, 0.05], color0: '#ffd84a', shape: 'star' });
      this.glowUnit(tg, pal[1], o.crit ? 0.8 : 0.5, 0.18);
    }
    heal(tg) {
      const pal = PAL.heal, feet = this.P(tg, 'feet');
      this.emit({ pos: feet, disk: 0.5, n: 14, dir: new THREE.Vector3(0, 1, 0), cone: 0.2, speed: [0.6, 1.6], life: [0.6, 1.1], size: [0.14, 0.02], color0: pal.slice(0, 3), shape: 'ember', drag: 0.5 });
    }
    kill(u) {
      const pos = this.P(u, 'chest'), feet = this.P(u, 'feet');
      const sc = this.sizeOf(u);
      const pal = u.side === 'enemy' ? PAL.ghost : PAL.neutral;
      if (u.side !== 'enemy') return;
      this.flare(pos, '#dfe8ff', { size: Math.min(3.2, 1.6 + sc * 0.6), dur: 0.3, k: 2 });
      this.ring(feet, { r: 2.2 * sc, color: pal[1], dur: 0.7, w: 0.05, k: 2 });
      this.emit({ pos, spread: 0.5 * sc, n: 50, up: 0.8, speed: [0.5, 2.5], drag: 1.2, gravity: -1.2, life: [0.8, 1.6], size: [0.18, 0.02], color0: ['#ffffff', pal[0], pal[1]], shape: ['ember', 'dot'], k: 2.2 });
      this.emit({ pos, spread: 0.4 * sc, n: 16, up: 0.6, speed: [0.3, 1.2], drag: 1, gravity: -0.5, life: [1, 1.8], size: [0.6 * sc, 1.4 * sc], color0: pal[3], a0: 0.25, alpha: true, shape: 'smoke' });
      this.light(pos, pal[1], 5, 7, 0.6);
      // the soul thread drifting up for a while as the body dissolves
      let t = 0;
      this.track({ update: (dt) => { t += dt; this.emit({ pos: this.P(u, 'chest'), spread: 0.35 * sc, n: 2, dir: new THREE.Vector3(0, 1, 0), cone: 0.3, speed: [0.6, 1.4], life: [0.6, 1], size: [0.12, 0.02], color0: pal.slice(0, 2), shape: 'ember' }); return t < 0.8; } });
    }

    // ---------------------------------------------------------------- play: fx id → effect (returns impact time)
    play(id, u, targets, s) {
      id = id || 'magic';
      targets = (targets || []).filter(Boolean);
      const base = id.replace(/_big|_multi|_all/, '');
      const big = /_big/.test(id) || id.startsWith('ultimate') || id === 'combo';
      const multi = /_multi/.test(id);
      try {
        if (id.startsWith('ultimate')) return this.ultimate(id, u, targets, s);
        switch (base) {
          case 'slash': case 'claw': case 'bite': case 'thrust': return this.melee(base, multi, u, targets, s);
          case 'heal': case 'revive': case 'buff': case 'cure': return this.support(base, u, targets, s, /_all/.test(id));
          case 'debuff': case 'poison': case 'sleep': case 'seal': case 'stun': return this.affliction(base, u, targets, s);
          case 'song': return this.song(u, targets, s);
          case 'kaleido': return this.kaleido(u, targets, s);
          case 'summon': return this.summon(u, targets, s);
          case 'beam': return this.beam(u, targets, s);
          case 'combo': return this.combo(u, targets, s);
          case 'fire': return this.fire(u, targets, s, big);
          case 'water': return this.water(u, targets, s, big);
          case 'wood': case 'thunder': return this.thunder(u, targets, s, big);
          case 'metal': return this.metal(u, targets, s, big);
          case 'earth': return this.earth(u, targets, s, big);
          case 'wind': return this.wind(u, targets, s, big);
          case 'dark': return this.dark(u, targets, s, big);
          case 'ghost': return this.ghost(u, targets, s, big);
          case 'lantern': return this.lantern(u, targets, s, big);
          default: return this.magic(u, targets, s, big, s && s.elem);
        }
      } catch (e) { G.warnOnce('vfx play ' + id, e); return 0.3; }
    }

    // ---------------------------------------------------------------- melee
    melee(kind, multi, u, targets, s) {
      const elem = s && s.elem;
      const pal = elem ? palOf(elem) : (u.side === 'enemy' ? ['#fff0e8', '#ff8a7a', '#c8382a', '#2a1010'] : ['#ffffff', '#ffe6b0', '#ffb860', '#3a2a20']);
      const T = 0.16;
      for (const tg of targets) {
        const c = this.P(tg, 'chest'), sc = this.sizeOf(tg);
        const side = u.side === 'party' ? 1 : -1;
        if (kind === 'claw') {
          for (let i = 0; i < 3; i++) this.later(i * 0.025, () => this.slash(c.clone().add(new THREE.Vector3(0, (i - 1) * 0.22 * sc, 0)), { pal, arc: 1.1, r: 0.9 * sc, thick: 0.12 * sc, dur: 0.22, roll: -1.1 + (i - 1) * 0.05, k: 2 }));
          if (multi) this.later(0.12, () => { for (let i = 0; i < 3; i++) this.slash(c.clone().add(new THREE.Vector3(0, (i - 1) * 0.2 * sc, 0)), { pal, arc: 1.1, r: 0.9 * sc, thick: 0.12 * sc, dur: 0.22, roll: 1.1, k: 2 }); });
        } else if (kind === 'bite') {
          this.slash(c.clone().add(new THREE.Vector3(0, 0.25 * sc, 0)), { pal, arc: 2.2, r: 0.55 * sc, thick: 0.16 * sc, roll: -Math.PI / 2, dur: 0.22 });
          this.slash(c.clone().add(new THREE.Vector3(0, -0.25 * sc, 0)), { pal, arc: 2.2, r: 0.55 * sc, thick: 0.16 * sc, roll: Math.PI / 2, dur: 0.22 });
        } else if (kind === 'thrust') {
          const d = this.dirTo(u, tg);
          this.emit({ pos: c.clone().addScaledVector(d, -1.2), n: 22, dir: d, cone: 0.05, speed: [10, 16], life: [0.1, 0.18], size: [0.22, 0.05], color0: pal.slice(0, 2), shape: 'spark', stretch: 0.25, k: 2.6 });
          this.ring(c.clone(), { vertical: true, r: 1.1 * sc, color: pal[1], dur: 0.3, w: 0.05 });
          // the spear's afterimage: a bright tapered lance driving through the target
          this.column(c.clone().addScaledVector(d, -1.8), { to: c.clone().addScaledVector(d, 0.6 * sc), pal, r0: 0.09, r1: 0.01, dur: 0.28, grow: 0.35, scroll: -6, streak: 0.3, k: 2.6 });
          this.flare(c, pal[0], { size: 1.2 * Math.sqrt(sc), dur: 0.2, k: 2.4 });
          this.later(T * 0.7, () => this.emit({ pos: c, n: 14, dir: d, cone: 0.5, speed: [3, 7], drag: 3, life: [0.2, 0.35], size: [0.14, 0.02], color0: pal[0], shape: 'spark', stretch: 0.2 }));
        } else {
          const n = multi ? 3 : 1;
          for (let i = 0; i < n; i++) this.later(i * 0.06, () => this.slash(c.clone().add(new THREE.Vector3(rnd(-0.1, 0.1), rnd(-0.15, 0.15), 0)), { pal, arc: 2.4, r: 1.0 * sc, thick: 0.34 * sc, roll: (side > 0 ? -0.6 : 0.6) + (i - 1) * 1.1 + rnd(-0.2, 0.2), flip: side < 0, dur: 0.24, k: elem ? 2.6 : 2.2 }));
        }
        if (elem === 'fire') this.later(T, () => this.emit({ pos: c, n: 16, speed: [0.5, 2], gravity: -2, drag: 1.5, life: [0.3, 0.6], size: [0.3, 0.05], color0: PAL.fire.slice(0, 3), shape: 'flame' }));
      }
      return multi ? 0.2 : T;
    }

    // ---------------------------------------------------------------- elements
    fire(u, targets, s, big) {
      const pal = PAL.fire;
      const from = this.P(u, 'hand');
      if (big) {
        // meteor: a burning star falls from the sky onto each target
        const T = 0.62;
        for (const tg of targets) {
          const to = this.P(tg, 'chest'); const feet = this.P(tg, 'feet'); const sc = this.sizeOf(tg);
          const start = to.clone().add(new THREE.Vector3(rnd(1.5, 3), 9, rnd(-1, 1)));
          this.circle(feet, 'fire', pal[1], { size: 3 * sc, dur: T + 0.6, spin: 2, k: 1.6 });
          this.projectile(start, to, { pal, dur: T, arc: 0, r: 0.55, trail: 0.8, trailN: 6, smoke: true });
          this.later(T, () => this.explode(to, pal, 1.6 * sc, true));
        }
        return T;
      }
      const T = 0.4;
      for (const tg of targets) {
        const to = this.P(tg, 'chest');
        this.projectile(from, to, { pal, dur: T, arc: 0.5, r: 0.26, smoke: true });
        this.later(T, () => this.explode(to, pal, 0.9 * this.sizeOf(tg), false));
      }
      return T;
    }
    explode(pos, pal, sc, big) {
      const feet = pos.clone(); feet.y = 0;
      this.orb(pos, { pal, r0: 0.2 * sc, r1: 1.1 * sc, dur: big ? 0.75 : 0.55, disp: 0.35, heat: 0.7 });
      this.flare(pos, pal[0], { size: 3.5 * sc, dur: 0.22, k: 3 });
      this.emit({ pos, n: big ? 60 : 30, speed: [2, 7], drag: 2.5, gravity: 3, life: [0.3, 0.8], size: [0.12, 0.02], color0: [pal[0], pal[1]], shape: 'ember', stretch: 0.08, k: 2.4 });
      this.emit({ pos, n: big ? 24 : 12, speed: [0.5, 2], drag: 1.5, gravity: -2.5, life: [0.4, 0.8], size: [0.5 * sc, 0.15], color0: pal.slice(1, 3), shape: 'flame', k: 1.8 });
      this.emit({ pos, n: big ? 16 : 8, spread: 0.3 * sc, speed: [0.3, 1.2], gravity: -0.8, drag: 0.8, life: [1, 1.8], size: [0.6 * sc, 1.6 * sc], color0: pal[3], a0: 0.4, alpha: true, shape: 'smoke' });
      this.ring(feet, { r: 2.4 * sc, color: pal[1], dur: 0.5, w: 0.05 });
      this.decal(feet, scorchTex(), { size: 2.4 * sc, dur: 4, a: 0.85 });
      this.light(pos, pal[1], big ? 12 : 7, big ? 12 : 8, big ? 0.8 : 0.5, true);
      this.shake(big ? 0.55 : 0.3, big ? 0.45 : 0.25);
      if (big) this.flash('#ffd8a0', 0.35, 0.3);
    }
    water(u, targets, s, big) {
      const pal = PAL.water;
      const T = big ? 0.55 : 0.42;
      for (const tg of targets) {
        const feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        this.ring(feet, { r: 1.2 * sc, color: pal[1], dur: T, w: 0.08, r0: 0.9, k: 1.2 }); // gathering ripple
        this.emit({ pos: feet, ring: 1.1 * sc, n: 16, inward: true, speed: [1.5, 2.5], life: [0.3, T], size: [0.12, 0.04], color0: pal[0], shape: 'drop', stretch: 0.2 });
        this.later(T, () => {
          // geyser
          this.column(feet, { pal, h: (big ? 4.5 : 3) * sc, r0: 0.5 * sc, r1: 0.25 * sc, dur: 0.7, grow: 0.25, scroll: -2.2, streak: 0.9, wave: 1, k: 1.6 });
          this.column(feet, { pal: [pal[0], pal[0]], h: (big ? 4 : 2.6) * sc, r0: 0.3 * sc, r1: 0.12 * sc, dur: 0.55, grow: 0.25, scroll: -3, streak: 0.6, k: 2 });
          this.emit({ pos: feet.clone().add(new THREE.Vector3(0, 0.2, 0)), disk: 0.4 * sc, n: big ? 70 : 40, up: 0.9, speed: [2, 6], gravity: 9, drag: 0.4, life: [0.5, 1.0], size: [0.12, 0.06], color0: [pal[0], pal[1]], shape: 'drop', stretch: 0.12, k: 1.6 });
          this.emit({ pos: feet, disk: 0.8 * sc, n: 14, up: 0.4, speed: [0.3, 1.2], life: [0.8, 1.4], size: [0.6 * sc, 1.5 * sc], color0: pal[3], a0: 0.3, alpha: true, shape: 'smoke', gravity: -0.4 });
          this.ring(feet, { r: 2.2 * sc, color: pal[1], dur: 0.6, w: 0.05 });
          this.ring(feet, { r: 3 * sc, color: pal[0], dur: 0.9, w: 0.03, k: 1 });
          this.light(feet.clone().add(new THREE.Vector3(0, 1.5, 0)), pal[1], 6, 8, 0.6);
          this.shake(big ? 0.4 : 0.2, 0.3);
        });
      }
      return T;
    }
    thunder(u, targets, s, big) {
      const pal = PAL.wood, thun = ['#f8fff0', '#d8ffb0', '#8cff6a', '#203a20'];
      const T = 0.32;
      if (this.view.dimSky) this.view.dimSky(0.6, 0.9);
      for (const tg of targets) {
        const feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        this.circle(feet, 'thunder', pal[1], { size: 2.2 * sc, dur: T + 0.4, k: 1.6 });
        const bolts = big ? 3 : 1;
        for (let b = 0; b < bolts; b++) this.later(T + b * 0.09, () => {
          const off = b ? new THREE.Vector3(rnd(-0.6, 0.6), 0, rnd(-0.6, 0.6)) : new THREE.Vector3();
          const top = feet.clone().add(off).add(new THREE.Vector3(rnd(-1.5, 1.5), 11, rnd(-1, 1)));
          this.lightning(top, feet.clone().add(off).add(new THREE.Vector3(0, 0.6, 0)), { pal: thun, dur: 0.28, w: 0.06 * (big ? 1.4 : 1) });
          this.flare(feet.clone().add(new THREE.Vector3(0, 0.8, 0)), thun[0], { size: 4 * sc, dur: 0.2, k: 3.5 });
          this.emit({ pos: feet.clone().add(new THREE.Vector3(0, 0.3, 0)), n: 40, up: 0.6, speed: [3, 9], drag: 3, gravity: 6, life: [0.2, 0.5], size: [0.1, 0.02], color0: thun.slice(0, 3), shape: 'spark', stretch: 0.18, k: 3 });
          this.ring(feet, { r: 2.2 * sc, color: thun[1], dur: 0.35, w: 0.04, k: 2.5 });
          this.decal(feet, scorchTex(), { size: 1.8 * sc, dur: 3.5, a: 0.7 });
          this.light(feet.clone().add(new THREE.Vector3(0, 2, 0)), thun[1], 16, 14, 0.25, true);
          this.flash('#efffe0', big ? 0.5 : 0.3, 0.18);
          this.shake(big ? 0.5 : 0.3, 0.25);
        });
        if (big) this.later(T + 0.15, () => this.vines(feet, sc));
      }
      return T;
    }
    vines(feet, sc) {
      const T = THREE;
      const mat = new T.MeshStandardMaterial({ color: 0x3d8a3a, roughness: 0.7, emissive: 0x1a4a12, emissiveIntensity: 0.6 });
      const group = new T.Group();
      const tubes = [];
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + rnd(-0.3, 0.3), r = rnd(0.6, 1.1) * sc;
        const p0 = new T.Vector3(Math.cos(a) * r, -0.2, Math.sin(a) * r);
        const p1 = new T.Vector3(Math.cos(a) * r * 0.8, 1.2 * sc, Math.sin(a) * r * 0.8);
        const p2 = new T.Vector3(Math.cos(a + 1.2) * r * 0.4, 2.0 * sc, Math.sin(a + 1.2) * r * 0.4);
        const p3 = new T.Vector3(Math.cos(a + 2.2) * r * 0.2, 2.4 * sc, Math.sin(a + 2.2) * r * 0.2);
        const geo = new T.TubeGeometry(new T.CubicBezierCurve3(p0, p1, p2, p3), 40, 0.07 * sc, 6, false);
        const m = new T.Mesh(geo, mat); m.castShadow = true;
        group.add(m); tubes.push(m);
      }
      group.position.copy(feet);
      this.emit({ pos: feet, disk: 1 * sc, n: 24, up: 0.9, speed: [1, 3], gravity: 2, drag: 1, life: [0.8, 1.4], size: [0.2, 0.15], color0: ['#8ad860', '#5ab04a', '#c8f080'], shape: 'leaf', alpha: true, spin: 6 });
      this.obj(group, (t) => {
        const grow = Math.min(1, t / 0.25);
        for (const m of tubes) { const n = m.geometry.index.count; m.geometry.setDrawRange(0, Math.floor(n * grow / 6) * 6); }
        if (t > 0.7) group.scale.setScalar(Math.max(0.01, 1 - (t - 0.7) / 0.3));
        return t < 1;
      }, () => { for (const m of tubes) m.geometry.dispose(); mat.dispose(); });
    }
    metal(u, targets, s, big) {
      const pal = PAL.metal;
      const T = big ? 0.55 : 0.45;
      for (const tg of targets) {
        const feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        const n = big ? 7 : 4;
        for (let i = 0; i < n; i++) {
          const delay = (i / n) * (T * 0.5);
          const a = (i / n) * TAU + rnd(-0.3, 0.3), r = i === 0 ? 0 : rnd(0.35, 0.9) * sc;
          const land = feet.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
          this.later(delay, () => this.sword(land, (big && i === 0 ? 2.2 : 1) * Math.max(1, sc * 0.8), T - delay, pal));
        }
        this.later(T, () => {
          const c = this.P(tg, 'chest');
          this.flare(c, pal[0], { size: 3 * sc, dur: 0.25, k: 3.5 });
          this.emit({ pos: c, n: 26, speed: [1, 4], drag: 2, life: [0.4, 0.8], size: [0.22, 0.04], color0: [pal[0], pal[1]], shape: ['star', 'crystal'], k: 2.4 });
          this.ring(feet, { r: 2 * sc, color: pal[1], dur: 0.4, w: 0.04, k: 2 });
          this.shake(big ? 0.45 : 0.25, 0.25);
          this.light(c, pal[1], 8, 8, 0.4);
        });
      }
      return T;
    }
    sword(land, scale, fall, pal) {
      const T = THREE;
      const g = new T.Group();
      const shape = new T.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.07, 0.12); shape.lineTo(0.06, 1.25); shape.lineTo(0, 1.38); shape.lineTo(-0.06, 1.25); shape.lineTo(-0.07, 0.12); shape.closePath();
      const bladeGeo = new T.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
      bladeGeo.translate(0, -1.38, -0.01);
      const mat = new T.MeshStandardMaterial({ color: 0xf6f0d8, metalness: 0.9, roughness: 0.2, emissive: new T.Color(pal[1]), emissiveIntensity: 1.4 });
      const goldMat = new T.MeshStandardMaterial({ color: 0xd8a83a, metalness: 0.8, roughness: 0.35, emissive: new T.Color(pal[2]), emissiveIntensity: 0.6 });
      const blade = new T.Mesh(bladeGeo, mat);
      const guard = new T.Mesh(new T.BoxGeometry(0.34, 0.05, 0.07), goldMat);
      const hilt = new T.Mesh(new T.CylinderGeometry(0.025, 0.025, 0.32, 6), goldMat); hilt.position.y = 0.18;
      g.add(blade, guard, hilt);
      g.scale.setScalar(scale);
      g.rotation.y = rnd(0, TAU); g.rotation.z = rnd(-0.12, 0.12);
      const start = land.clone().add(new T.Vector3(rnd(-0.5, 0.5), 7, rnd(-0.5, 0.5)));
      let landed = false;
      const pos = new T.Vector3();
      this.obj(g, (t) => {
        if (t < fall) {
          const k = ease.in2(t / fall);
          pos.lerpVectors(start, land.clone().add(new T.Vector3(0, 0.55 * scale, 0)), k);
          g.position.copy(pos);
          this.emit({ pos: pos.clone().add(new T.Vector3(0, 0.8 * scale, 0)), n: 1, speed: [0, 0.2], life: [0.2, 0.35], size: [0.3, 0.05], color0: pal[1], shape: 'glow', k: 1.6 });
        } else if (!landed) {
          landed = true;
          this.emit({ pos: land.clone().add(new T.Vector3(0, 0.1, 0)), n: 18, up: 0.7, speed: [2, 5], drag: 3, gravity: 6, life: [0.2, 0.45], size: [0.1, 0.02], color0: [pal[0], pal[1]], shape: 'spark', stretch: 0.15, k: 2.6 });
          this.decal(land, crackTex(), { size: 0.9 * scale, dur: 2.5, a: 0.6 });
        }
        const out = t - fall - 0.45;
        if (out > 0) { mat.emissiveIntensity = 1.4 + out * 8; g.scale.setScalar(scale * Math.max(0.01, 1 - out / 0.25)); }
        return t < fall + 0.7;
      }, () => { bladeGeo.dispose(); guard.geometry.dispose(); hilt.geometry.dispose(); mat.dispose(); goldMat.dispose(); });
    }
    earth(u, targets, s, big) {
      const pal = PAL.earth;
      const T = 0.38;
      for (const tg of targets) {
        const feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        this.emit({ pos: feet, disk: 1.0 * sc, n: 20, up: 0.9, speed: [0.3, 1], gravity: 3, life: [0.3, 0.5], size: [0.08, 0.04], color0: pal.slice(1, 3), shape: 'shard', alpha: true });
        this.later(T * 0.4, () => this.shake(0.12, T * 0.6));
        this.later(T, () => {
          this.decal(feet, crackTex(), { size: 3.4 * sc, dur: 4.5, a: 0.9 });
          this.spikes(feet, sc, big ? 9 : 5, big ? 1.6 : 1.1, pal);
          this.emit({ pos: feet.clone().add(new THREE.Vector3(0, 0.3, 0)), disk: 0.8 * sc, n: big ? 60 : 34, up: 0.85, speed: [3, 8], gravity: 14, drag: 0.6, life: [0.6, 1.1], size: [0.18, 0.12], color0: pal.slice(1, 4), shape: 'shard', alpha: true, spin: 10, k: 1 });
          this.emit({ pos: feet, disk: 1.2 * sc, n: 22, up: 0.3, speed: [0.6, 2], drag: 1.2, gravity: -0.3, life: [1, 1.8], size: [0.8 * sc, 2 * sc], color0: pal[0], a0: 0.35, alpha: true, shape: 'smoke' });
          this.ring(feet, { r: 3 * sc, color: pal[0], dur: 0.6, w: 0.05, k: 1.2 });
          this.shake(big ? 0.6 : 0.35, 0.35);
        });
      }
      return T;
    }
    spikes(feet, sc, n, h, pal) {
      const T = THREE;
      const mat = new T.MeshStandardMaterial({ color: new T.Color(pal[2]).lerp(new T.Color('#8a7a68'), 0.4), roughness: 0.95, flatShading: true });
      const g = new T.Group(); g.position.copy(feet);
      const sp = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rnd(-0.3, 0.3), r = (i === 0 ? 0.1 : rnd(0.3, 0.95)) * sc;
        const hh = h * sc * (i === 0 ? 1.4 : rnd(0.6, 1.1));
        const geo = new T.ConeGeometry(0.22 * sc * rnd(0.8, 1.3), hh, 5, 2);
        const p = geo.attributes.position;
        for (let j = 0; j < p.count; j++) { if (p.getY(j) < hh / 2 - 0.01) { p.setX(j, p.getX(j) * rnd(0.8, 1.25)); p.setZ(j, p.getZ(j) * rnd(0.8, 1.25)); } }
        geo.computeVertexNormals();
        geo.translate(0, hh / 2, 0);
        const m = new T.Mesh(geo, mat);
        m.position.set(Math.cos(a) * r, -hh, Math.sin(a) * r);
        m.rotation.set(Math.sin(a) * 0.35 * (r / sc), 0, -Math.cos(a) * 0.35 * (r / sc));
        m.castShadow = true; m.receiveShadow = true;
        g.add(m); sp.push({ m, hh, d: rnd(0, 0.06) });
      }
      this.obj(g, (t) => {
        for (const q of sp) {
          const k = clamp((t - q.d) / 0.12, 0, 1);
          let y = -q.hh * (1 - ease.out3(k)) + Math.sin(k * Math.PI) * 0.08;
          if (t > 0.9) y = -q.hh * ease.in2(Math.min(1, (t - 0.9) / 0.35));
          q.m.position.y = y;
        }
        return t < 1.3;
      }, () => { for (const q of sp) q.m.geometry.dispose(); mat.dispose(); });
    }
    wind(u, targets, s, big) {
      const pal = PAL.wind;
      const T = 0.4;
      for (const tg of targets) {
        const feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        this.column(feet, { pal, h: 3.4 * sc, r0: 0.35 * sc, r1: 1.2 * sc, twist: 7, spin: 9, dur: 0.9, grow: 0.3, scroll: 2.5, streak: 1, k: 1.3, a: 0.8 });
        this.column(feet, { pal: [pal[0], pal[1]], h: 2.8 * sc, r0: 0.25 * sc, r1: 0.8 * sc, twist: -5, spin: -12, dur: 0.8, grow: 0.3, scroll: 3, streak: 1, k: 1.2, a: 0.6 });
        let t = 0;
        this.track({ update: (dt) => { t += dt; const a = t * 14; this.emit({ pos: feet.clone().add(new THREE.Vector3(Math.cos(a) * 0.8 * sc, rnd(0.2, 2.5) * sc, Math.sin(a) * 0.8 * sc)), n: 2, dir: new THREE.Vector3(-Math.sin(a), 0.6, Math.cos(a)), cone: 0.2, speed: [3, 5], life: [0.25, 0.45], size: [0.2, 0.08], color0: ['#b8e888', '#88c860', pal[0]], shape: 'leaf', alpha: true, spin: 10 }); return t < 0.7; } });
        this.emit({ pos: feet.clone().add(new THREE.Vector3(0, 1, 0)), n: 24, speed: [3, 6], drag: 2, life: [0.2, 0.4], size: [0.16, 0.03], color0: pal[0], shape: 'spark', stretch: 0.3 });
        this.later(T, () => { this.ring(feet, { r: 2.4 * sc, color: pal[1], dur: 0.5, w: 0.05 }); this.shake(0.2, 0.25); });
      }
      return T;
    }
    dark(u, targets, s, big) {
      const pal = PAL.dark;
      const T = big ? 0.55 : 0.42;
      for (const tg of targets) {
        const c = this.P(tg, 'chest'), feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        this.decal(feet, circleTex('dark'), { add: false, color: '#2a0a4a', size: 2.6 * sc, dur: T + 0.8, spin: -1.5, a: 0.9, fadeIn: 0.1 });
        this.emit({ pos: c, spread: 1.4 * sc, n: 40, inward: true, speed: [2, 4], life: [0.3, T], size: [0.14, 0.03], color0: pal.slice(0, 3), shape: 'spark', stretch: 0.2 });
        this.orb(c, { pal, r0: 1.4 * sc, r1: 0.25 * sc, implode: true, dur: T, dark: true, disp: 0.3 });
        this.later(T, () => {
          this.orb(c, { pal, r0: 0.3 * sc, r1: 1.3 * sc, dur: 0.6, disp: 0.4, heat: 0.4, k: 1.8 });
          this.emit({ pos: c, n: 30, speed: [2, 6], drag: 2.5, life: [0.3, 0.7], size: [0.16, 0.02], color0: [pal[0], pal[1]], shape: 'ember', k: 2 });
          this.emit({ pos: c, n: 12, spread: 0.4, speed: [0.3, 1], gravity: -0.6, life: [0.8, 1.4], size: [0.6 * sc, 1.4 * sc], color0: pal[3], a0: 0.55, alpha: true, shape: 'smoke' });
          this.ring(feet, { r: 2.2 * sc, color: pal[1], dur: 0.5, w: 0.06 });
          this.light(c, pal[1], 6, 7, 0.5);
          this.shake(big ? 0.45 : 0.22, 0.3);
        });
      }
      return T;
    }
    ghost(u, targets, s, big) {
      const pal = PAL.ghost;
      const T = 0.48;
      const from = this.P(u, 'chest');
      for (const tg of targets) {
        const to = this.P(tg, 'chest'), sc = this.sizeOf(tg);
        for (let w = 0; w < (big ? 5 : 3); w++) {
          const ph = w / 3 * TAU, p = new THREE.Vector3();
          let t = 0;
          this.track({ update: (dt) => {
            t += dt; const k = Math.min(1, t / T);
            p.lerpVectors(from, to, ease.inOut(k));
            const sw = Math.sin(k * Math.PI) * 0.9;
            p.x += Math.cos(ph + k * 9) * sw * 0.6; p.y += Math.sin(ph + k * 9) * sw * 0.6 + Math.sin(k * Math.PI) * 0.6;
            this.emit({ pos: p, n: 2, speed: [0.05, 0.3], life: [0.3, 0.5], size: [0.45, 0.05], color0: pal.slice(0, 2), shape: 'glow', k: 1.8 });
            return k < 1;
          } });
        }
        this.later(T, () => {
          this.orb(to, { pal, r0: 0.3 * sc, r1: 1.1 * sc, dur: 0.5, disp: 0.45, heat: 0.4, k: 1.8, rim: 0.6 });
          this.emit({ pos: to, n: 24, up: 0.5, speed: [1, 3], drag: 1.5, gravity: -1.5, life: [0.6, 1.1], size: [0.3, 0.04], color0: pal.slice(0, 3), shape: 'glow', k: 1.8 });
          this.ring(this.P(tg, 'feet'), { r: 2 * sc, color: pal[1], dur: 0.5, w: 0.05 });
          this.light(to, pal[1], 5, 7, 0.45);
          this.shake(0.18, 0.2);
        });
      }
      return T;
    }
    lantern(u, targets, s, big) {
      const pal = PAL.lantern;
      const healing = s && (s.type === 'heal' || s.heal);
      const T = 0.55;
      for (const tg of targets) {
        const feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        for (let i = 0; i < (big ? 5 : 3); i++) {
          const a = i / 3 * TAU + rnd(0, 1);
          this.paperLantern(feet.clone().add(new THREE.Vector3(Math.cos(a) * 0.7 * sc, 0.2, Math.sin(a) * 0.7 * sc)), healing, T + 0.6, pal);
        }
        this.later(T, () => {
          const c = this.P(tg, 'chest');
          if (healing) { this.column(feet, { pal: ['#fff4d0', '#ffc070'], h: 3.5, r0: 0.7 * sc, r1: 0.5 * sc, dur: 0.8, k: 1.4, a: 0.7 }); this.heal(tg); }
          else this.explode(c, pal, 0.8 * sc, false);
          this.emit({ pos: c, n: 20, up: 0.7, speed: [0.5, 1.8], gravity: -1, drag: 1, life: [0.8, 1.3], size: [0.16, 0.03], color0: pal.slice(0, 3), shape: 'ember', k: 2 });
          this.light(c, pal[1], 6, 8, 0.8);
        });
      }
      return T;
    }
    paperLantern(pos, rise, dur, pal) {
      const T = THREE;
      const g = new T.Group();
      const body = new T.Mesh(new T.SphereGeometry(0.16, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(pal[1]).multiplyScalar(2.2), toneMapped: true }));
      body.scale.y = 1.25;
      const capMat = new T.MeshBasicMaterial({ color: 0x8a1a12 });
      const cap1 = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 0.05, 10), capMat); cap1.position.y = 0.2;
      const cap2 = cap1.clone(); cap2.position.y = -0.2;
      g.add(body, cap1, cap2);
      g.position.copy(pos);
      const ph = rnd(0, TAU);
      this.obj(g, (t) => {
        const k = t / dur;
        g.position.y = pos.y + ease.out(Math.min(1, k)) * 1.6 + 0.2;
        g.position.x = pos.x + Math.sin(t * 3 + ph) * 0.08;
        g.rotation.z = Math.sin(t * 2.5 + ph) * 0.15;
        g.scale.setScalar(Math.min(1, t * 6) * (k > 0.85 ? Math.max(0.01, 1 - (k - 0.85) / 0.15) : 1));
        if (Math.random() < 0.4) this.emit({ pos: g.position, n: 1, speed: [0.05, 0.25], gravity: -0.5, life: [0.4, 0.7], size: [0.08, 0.02], color0: pal[0], shape: 'ember' });
        return t < dur;
      }, () => { body.geometry.dispose(); body.material.dispose(); cap1.geometry.dispose(); capMat.dispose(); });
    }
    magic(u, targets, s, big, elem) {
      const pal = palOf(elem || 'magic');
      const T = 0.38;
      const from = this.P(u, 'hand');
      for (const tg of targets) {
        const to = this.P(tg, 'chest'), sc = this.sizeOf(tg);
        this.projectile(from, to, { pal, dur: T, arc: 0.8, r: 0.2, shape: 'star', trail: 0.3 });
        this.later(T, () => {
          this.orb(to, { pal, r0: 0.2 * sc, r1: (big ? 1.4 : 0.9) * sc, dur: 0.45, disp: 0.25, heat: 0.6, k: 2 });
          this.emit({ pos: to, n: 26, speed: [1.5, 4], drag: 2, life: [0.3, 0.7], size: [0.25, 0.04], color0: pal.slice(0, 3), shape: ['star', 'ember'], k: 2.2 });
          this.ring(this.P(tg, 'feet'), { r: 1.8 * sc, color: pal[1], dur: 0.45 });
          this.light(to, pal[1], 5, 7, 0.4);
          if (big) this.shake(0.3, 0.25);
        });
      }
      return T;
    }
    beam(u, targets, s) {
      const kind = this.kindFor(s, 'beam');
      const pal = palOf(kind === 'magic' ? 'holy' : kind);
      const from = this.P(u, 'hand');
      const T = 0.3;
      this.flare(from, pal[0], { size: 1.6, dur: T + 0.3, k: 3 });
      for (const tg of targets) {
        const to = this.P(tg, 'chest'), sc = this.sizeOf(tg);
        this.later(0.08, () => {
          this.column(from, { to, pal, r0: 0.16, r1: 0.22, dur: 0.55, grow: 0.25, scroll: -4, streak: 0.5, k: 2.4 });
          this.column(from, { to, pal: [pal[0], pal[0]], r0: 0.05, r1: 0.07, dur: 0.5, grow: 0.25, scroll: -6, streak: 0.2, k: 3.5 });
        });
        this.later(T, () => {
          this.flare(to, pal[0], { size: 2.4 * sc, dur: 0.3, k: 3 });
          this.emit({ pos: to, n: 30, speed: [2, 6], drag: 3, life: [0.2, 0.5], size: [0.14, 0.02], color0: pal.slice(0, 2), shape: 'spark', stretch: 0.15, k: 2.4 });
          this.light(to, pal[1], 6, 7, 0.45);
          this.shake(0.2, 0.2);
        });
      }
      return T;
    }

    // ---------------------------------------------------------------- support / afflictions
    support(kind, u, targets, s, all) {
      const k = kind === 'revive' ? 'holy' : kind === 'heal' ? (s && s.elem === 'water' ? 'water' : 'heal') : 'holy';
      const pal = kind === 'heal' && k === 'heal' ? PAL.heal : palOf(k);
      const T = 0.35;
      for (const tg of targets) {
        const feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        if (kind === 'heal') {
          this.circle(feet, 'heal', pal[1], { size: 2 * sc, dur: 1.2, k: 1.6, y: 0.04 });
          this.column(feet, { pal, h: 3.2 * sc, r0: 0.55 * sc, r1: 0.45 * sc, dur: 1.0, grow: 0.3, scroll: 0.9, streak: 0.7, k: 1.2, a: 0.7 });
          this.emit({ pos: feet, disk: 0.6 * sc, n: 30, dir: new THREE.Vector3(0, 1, 0), cone: 0.15, speed: [0.8, 2.2], drag: 0.6, life: [0.7, 1.2], size: [0.16, 0.03], color0: pal.slice(0, 3), shape: ['ember', 'leaf'], k: 2 });
          this.emit({ pos: this.P(tg, 'chest'), n: 6, speed: [0.3, 0.9], gravity: -0.6, life: [0.7, 1.1], size: [0.3, 0.1], color0: '#e8ffd8', shape: 'star', k: 2 });
          this.light(this.P(tg, 'chest'), pal[1], 4, 6, 0.9);
          this.glowUnit(tg, pal[1], 0.4, 0.6);
        } else if (kind === 'revive') {
          this.column(feet, { pal, h: 7, r0: 0.6 * sc, r1: 0.9 * sc, dur: 1.2, grow: 0.2, scroll: -1.2, k: 2.2 });
          this.circle(feet, 'holy', pal[1], { size: 3 * sc, dur: 1.4, k: 2 });
          this.emit({ pos: feet.clone().add(new THREE.Vector3(0, 4, 0)), disk: 0.8, n: 26, speed: [0.2, 0.6], gravity: 0.8, drag: 1.5, life: [1, 1.6], size: [0.28, 0.1], color0: ['#fffef0', '#ffe9a8'], shape: 'petal', spin: 4, k: 1.8 });
          this.flare(this.P(tg, 'chest'), '#ffffff', { size: 3, dur: 0.5, k: 3 });
          this.light(this.P(tg, 'chest'), pal[1], 8, 9, 1.2);
          this.flash('#fff8e0', 0.25, 0.35);
        } else if (kind === 'buff') {
          for (let i = 0; i < 3; i++) this.later(i * 0.12, () => this.risingRing(tg, pal[1], 0.7));
          this.emit({ pos: feet, disk: 0.5 * sc, n: 16, dir: new THREE.Vector3(0, 1, 0), cone: 0.1, speed: [1.5, 3], drag: 1.5, life: [0.5, 0.8], size: [0.2, 0.05], color0: pal.slice(0, 2), shape: 'spark', stretch: 0.2, k: 2 });
          this.glowUnit(tg, pal[1], 0.4, 0.5);
        } else { // cure
          this.emit({ pos: this.P(tg, 'chest'), spread: 0.5 * sc, n: 30, speed: [0.3, 1.2], gravity: -0.8, drag: 1, life: [0.6, 1], size: [0.2, 0.04], color0: ['#ffffff', '#e0f8ff', '#fff8d0'], shape: ['star', 'crystal'], k: 2 });
          this.ring(feet, { r: 1.8 * sc, color: '#e8f8ff', dur: 0.6, fill: 0.2 });
          this.glowUnit(tg, '#ffffff', 0.5, 0.4);
        }
      }
      return T;
    }
    risingRing(tg, color, dur) {
      const sc = this.sizeOf(tg), h = this.UV(tg) ? this.UV(tg).height : 1.7;
      this.ring(this.P(tg, 'feet').add(new THREE.Vector3(0, 0.05, 0)), { r: 0.75 * sc, r0: 0.85, color, dur, w: 0.05, k: 2, rise: h, a: 1 });
    }
    affliction(kind, u, targets, s) {
      const pal = kind === 'debuff' ? PAL.dark : palOf(kind);
      const T = 0.4;
      for (const tg of targets) {
        const c = this.P(tg, 'chest'), feet = this.P(tg, 'feet'), head = this.P(tg, 'head'), sc = this.sizeOf(tg);
        if (kind === 'debuff') {
          this.ring(head, { r: 0.8 * sc, r0: 0.9, color: pal[1], dur: 0.6, w: 0.05 });
          this.emit({ pos: head, disk: 0.5 * sc, n: 22, dir: new THREE.Vector3(0, -1, 0), cone: 0.1, speed: [1, 2.5], life: [0.5, 0.8], size: [0.2, 0.05], color0: pal.slice(0, 3), shape: 'spark', stretch: 0.2 });
          this.decal(feet, circleTex('dark'), { add: false, color: '#3a1a5a', size: 2.2 * sc, dur: 1.0, spin: -2, a: 0.8 });
        } else if (kind === 'poison') {
          this.emit({ pos: c, spread: 0.4 * sc, n: 16, speed: [0.3, 1], gravity: -0.4, drag: 0.6, life: [0.8, 1.4], size: [0.6 * sc, 1.3 * sc], color0: ['#6ab83a', '#4a8a2a'], a0: 0.5, alpha: true, shape: 'smoke' });
          this.emit({ pos: feet, disk: 0.6 * sc, n: 20, up: 1, speed: [0.4, 1.2], gravity: -0.5, life: [0.6, 1.2], size: [0.18, 0.1], color0: pal.slice(0, 2), shape: 'bubble', k: 1.4 });
        } else if (kind === 'sleep') {
          this.emit({ pos: head, spread: 0.3, n: 14, up: 1, speed: [0.3, 0.7], gravity: -0.4, life: [0.8, 1.3], size: [0.25, 0.1], color0: pal.slice(0, 2), shape: 'bubble', k: 1.4 });
          this.emit({ pos: c, spread: 0.6 * sc, n: 10, speed: [0.1, 0.4], life: [0.8, 1.4], size: [0.8 * sc, 1.6 * sc], color0: '#a8c8ff', a0: 0.25, alpha: true, shape: 'smoke' });
        } else if (kind === 'seal') {
          for (let i = 0; i < 4; i++) this.talismanFly(this.P(u, 'hand'), tg, i * 0.06, T);
        } else if (kind === 'stun') {
          this.flare(head, pal[0], { size: 2, dur: 0.3, k: 3 });
          this.emit({ pos: head, n: 12, speed: [1, 2.4], drag: 2, life: [0.4, 0.6], size: [0.3, 0.08], color0: pal.slice(0, 2), shape: 'star', k: 2.2 });
        }
        this.glowUnit(tg, pal[1], 0.4, 0.5);
      }
      return T;
    }
    talismanFly(from, tg, delay, T) {
      const THR = THREE;
      const mat = new THR.MeshBasicMaterial({ map: talismanTex(), side: THR.DoubleSide, transparent: true, alphaTest: 0.1 });
      const m = new THR.Mesh(this.geo.plane, mat); m.scale.set(0.22, 0.55, 1);
      const p = new THR.Vector3(); const ph = rnd(0, TAU);
      const startT = delay;
      this.obj(m, (t) => {
        const k = clamp((t - startT) / (T - startT), 0, 1);
        const to = this.P(tg, 'chest');
        p.lerpVectors(from, to, ease.inOut(k)); p.y += Math.sin(k * Math.PI) * 0.8 + Math.sin(t * 8 + ph) * 0.05;
        m.position.copy(p); m.rotation.set(Math.sin(t * 9 + ph) * 0.6, t * 6 + ph, Math.sin(t * 7) * 0.3);
        if (k >= 1 && t < T + 0.02) { this.flare(to, '#e0a0ff', { size: 1.2, dur: 0.25 }); this.emit({ pos: to, n: 8, speed: [0.5, 1.5], life: [0.3, 0.5], size: [0.2, 0.04], color0: PAL.seal.slice(0, 2), shape: 'rune' }); }
        mat.opacity = k >= 1 ? Math.max(0, 1 - (t - T) / 0.3) : 1;
        return t < T + 0.3;
      }, () => mat.dispose());
    }
    song(u, targets, s) {
      const pal = PAL.water;
      const T = 0.5;
      const from = this.P(u, 'head');
      this.ring(this.P(u, 'chest'), { vertical: true, r: 1.2, color: pal[1], dur: 0.6 });
      this.ring(this.P(u, 'chest'), { vertical: true, r: 2, color: pal[0], dur: 0.9, k: 1 });
      for (const tg of targets) {
        const to = this.P(tg, 'chest');
        for (let i = 0; i < 4; i++) {
          const p = new THREE.Vector3(); const ph = i * 1.7;
          let t = 0;
          this.track({ update: (dt) => { t += dt; const k = Math.min(1, t / T); p.lerpVectors(from, to, ease.inOut(k)); p.y += Math.sin(k * Math.PI) * 1.0 + Math.sin(k * 10 + ph) * 0.15; p.x += Math.cos(k * 10 + ph) * 0.15; this.emit({ pos: p, n: 1, speed: [0, 0.2], life: [0.3, 0.6], size: [0.3, 0.1], color0: pal.slice(0, 2), shape: 'note', k: 1.8, spin: 0.5 }); return k < 1; } });
        }
        this.later(T, () => this.emit({ pos: to, n: 12, up: 0.8, speed: [0.5, 1.4], gravity: -0.8, life: [0.6, 1], size: [0.32, 0.1], color0: ['#c8f0ff', '#ffffff'], shape: 'note', k: 2 }));
      }
      return T;
    }
    kaleido(u, targets, s) {
      const cols = ['#ff6ad5', '#7af0ff', '#b6ff6a', '#ffd06a', '#a08aff'];
      const T = 0.45;
      if (this.view.trance) this.view.trance(1.6);
      for (const tg of targets) {
        const c = this.P(tg, 'chest'), feet = this.P(tg, 'feet'), sc = this.sizeOf(tg);
        for (let i = 0; i < 3; i++) this.later(i * 0.1, () => this.decal(feet, circleTex('trance'), { add: true, color: cols[i], k: 2, size: (2 + i * 0.8) * sc, dur: 1.1, spin: (i % 2 ? -1 : 1) * 2.5 }));
        this.later(T, () => {
          this.emit({ pos: c, n: 50, speed: [2, 6], drag: 2, life: [0.4, 0.9], size: [0.26, 0.05], color0: cols, shape: ['shard', 'crystal', 'star'], spin: 8, k: 2.2 });
          this.ring(c, { vertical: true, r: 2.2 * sc, color: cols[0], dur: 0.5 });
          this.flash('#ffd0f8', 0.25, 0.3);
        });
      }
      return T;
    }
    summon(u, targets, s) {
      // the summoned cat is hurled at the target
      const T = 0.6;
      const tg = targets[0];
      if (!tg) return 0.4;
      const from = this.P(u, 'chest'), to = this.P(tg, 'chest');
      const sp = this.tuanziSprite(this.view.summonCat || 'yuyuan');
      const p = new THREE.Vector3();
      this.obj(sp.obj, (t) => {
        const k = Math.min(1, t / T);
        p.lerpVectors(from, to, k); p.y += Math.sin(k * Math.PI) * 2.2;
        sp.obj.position.copy(p);
        if (sp.spin) sp.spin(t * 14);
        if (Math.random() < 0.5) this.emit({ pos: p, n: 1, speed: [0, 0.3], life: [0.3, 0.5], size: [0.3, 0.1], color0: '#ffe6a8', shape: 'star', k: 1.6 });
        if (k >= 1) {
          this.flare(to, '#fff4d0', { size: 2.4, dur: 0.3, k: 3 });
          this.emit({ pos: to, n: 16, speed: [1, 2.5], drag: 1.5, life: [0.5, 0.9], size: [0.6, 1.2], color0: '#f0e8d8', a0: 0.5, alpha: true, shape: 'smoke' });
          this.emit({ pos: to, n: 14, speed: [1.5, 3.5], drag: 2, life: [0.4, 0.7], size: [0.3, 0.08], color0: ['#ffe6a8', '#ffffff'], shape: 'star', k: 2 });
          this.shake(0.25, 0.2);
          return false;
        }
        return true;
      }, sp.dispose);
      return T;
    }
    summonIntro(u, cat) {
      // the cat (芋圓 / 麻糬) pops out beside the caster with a puff
      const pos = this.P(u, 'feet').add(new THREE.Vector3(u.side === 'party' ? -0.9 : 0.9, 0, 0.4));
      const sp = this.tuanziSprite(cat || 'yuyuan');
      this.emit({ pos: pos.clone().add(new THREE.Vector3(0, 0.3, 0)), n: 18, speed: [0.6, 1.6], drag: 2, life: [0.5, 0.9], size: [0.5, 1], color0: '#f8f0e0', a0: 0.6, alpha: true, shape: 'smoke' });
      this.emit({ pos: pos.clone().add(new THREE.Vector3(0, 0.4, 0)), n: 10, speed: [1, 2], drag: 2, life: [0.4, 0.7], size: [0.25, 0.06], color0: '#ffe6a8', shape: 'star', k: 2 });
      this.obj(sp.obj, (t) => {
        sp.obj.position.copy(pos); sp.obj.position.y = Math.abs(Math.sin(t * 7)) * 0.35;
        const s = Math.min(1, t * 6) * (t > 0.75 ? Math.max(0.01, 1 - (t - 0.75) / 0.15) : 1);
        sp.obj.scale.setScalar(s * sp.base);
        return t < 0.9;
      }, sp.dispose);
    }
    tuanziSprite(id = 'yuyuan') {
      // Prefer a real 3D pet if the animals team provides one; otherwise a billboard of the 2D sprite.
      try {
        if (G.Char3D && G.Char3D.has && G.Char3D.has(id)) {
          const inst = G.Char3D.create(id, { context: 'battle' });
          if (inst) return { obj: inst.root, base: 1, spin: (a) => { inst.root.rotation.x = a; }, dispose: () => inst.dispose && inst.dispose() };
        }
      } catch (e) { G.warnOnce('tuanzi3d', e); }
      const T = THREE;
      const c = G.U.makeCanvas(160, 160, 1);
      try { if (G.Sprites && G.Sprites.has(id)) G.Sprites.drawChar(c.getContext('2d'), id, 'left', 0, 80, 130, { shadow: false }); } catch (e) { G.warnOnce('cat sprite ' + id, e); }
      const tex = G.R3M.canvasTex(c);
      const mat = new T.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.2 });
      const sp = new T.Sprite(mat); sp.scale.set(1.3, 1.3, 1); sp.center.set(0.5, 0.2);
      const g = new T.Group(); g.add(sp);
      return { obj: g, base: 1, spin: (a) => { mat.rotation = a; }, dispose: () => { tex.dispose(); mat.dispose(); } };
    }

    // ---------------------------------------------------------------- 合擊 combo finisher
    combo(u, targets, s) {
      const bs = this.view.bs;
      const ids = (s && s.combo) || [u.id];
      const members = bs ? ids.map((id) => bs.party.find((p) => p.id === id)).filter(Boolean) : [u];
      const T = 0.85;
      const elemCol = (m) => palOf((G.Data.chars[m.id] && G.Data.chars[m.id].elem) || 'magic');
      const pal = palOf((s && s.elem) || (members[0] && G.Data.chars[members[0].id] && G.Data.chars[members[0].id].elem) || 'holy');
      const cen = new THREE.Vector3();
      for (const tg of targets) cen.add(this.P(tg, 'feet'));
      cen.multiplyScalar(1 / Math.max(1, targets.length));
      const apex = cen.clone().add(new THREE.Vector3(0, 3.2, 0));
      if (this.view.dimSky) this.view.dimSky(0.7, 1.6);
      // each partner sends a spiralling stream of their element to the apex
      members.forEach((m, mi) => {
        const pc = elemCol(m); const from = this.P(m, 'chest'); const p = new THREE.Vector3();
        this.circle(this.P(m, 'feet'), (G.Data.chars[m.id] && G.Data.chars[m.id].elem) || 'magic', pc[1], { size: 2.4, dur: T + 0.3, k: 2 });
        let t = 0;
        this.track({ update: (dt) => {
          t += dt; const k = Math.min(1, t / (T * 0.8));
          for (let j = 0; j < 3; j++) {
            const kk = Math.max(0, k - j * 0.04);
            p.lerpVectors(from, apex, ease.inOut(kk));
            const r = Math.sin(kk * Math.PI) * 0.8; const a = kk * 12 + mi * Math.PI;
            p.x += Math.cos(a) * r; p.z += Math.sin(a) * r;
            this.emit({ pos: p, n: 2, speed: [0.05, 0.4], life: [0.3, 0.6], size: [0.4, 0.05], color0: pc.slice(0, 2), shape: 'glow', k: 2.2 });
          }
          return k < 1;
        } });
      });
      this.later(T * 0.8, () => { this.orb(apex, { pal, r0: 0.2, r1: 0.9, dur: T * 0.2 + 0.1, disp: 0.2, heat: 1, k: 3 }); this.flare(apex, '#ffffff', { size: 4, dur: 0.3, k: 4 }); });
      this.later(T, () => {
        this.flash('#fff6e0', 0.6, 0.4);
        this.column(cen, { pal, h: 10, r0: 2.2, r1: 1.4, dur: 1.0, grow: 0.12, scroll: -2, k: 2 });
        for (const tg of targets) this.explode(this.P(tg, 'chest'), pal, 1.2 * this.sizeOf(tg), true);
        this.ring(cen, { r: 7, color: pal[1], dur: 0.9, w: 0.04, k: 2 });
        this.ring(cen, { r: 4.5, color: '#ffffff', dur: 0.6, w: 0.03, k: 2 });
        this.shake(0.8, 0.6);
      });
      return T;
    }

    // ---------------------------------------------------------------- 劍意 ultimates
    ultimate(id, u, targets, s) {
      const who = id.replace('ultimate_', '').replace('ultimate', '') || (u && u.id) || '';
      const elem = (G.Data.chars[u.id] && G.Data.chars[u.id].elem) || (u.side === 'enemy' ? 'dark' : 'fire');
      if (this.view.dimSky) this.view.dimSky(0.75, 2.2);
      if (who === 'xinghe') return this.ultXinghe(u, targets);
      if (who === 'baizhi') return this.ultBaizhi(u, targets);
      if (who === 'hongying') return this.ultHongying(u, targets);
      if (who === 'yungui') return this.ultYungui(u, targets);
      if (who === 'chenbo') return this.ultChenbo(u, targets);
      // generic: the caster's element, writ large
      const r = this.play(elem + '_big', u, targets, s);
      this.later(r, () => { this.flash('#fff6e0', 0.4, 0.4); this.shake(0.7, 0.5); });
      return r;
    }
    groupCenter(targets) { const c = new THREE.Vector3(); for (const tg of targets) c.add(this.P(tg, 'feet')); return c.multiplyScalar(1 / Math.max(1, targets.length)); }
    // 萬燈・螢火燎天 — ten thousand fireflies swirl up from the blade and rain down as fire
    ultXinghe(u, targets) {
      const pal = PAL.fire, ff = ['#fff6b0', '#ffd860', '#ffa83a'];
      const T = 1.15;
      const cen = this.groupCenter(targets), from = this.P(u, 'chest');
      const sky = cen.clone().add(new THREE.Vector3(0.5, 6, 0));
      let t = 0;
      this.track({ update: (dt) => {
        t += dt;
        if (t < 0.6) { // fireflies rise from the swordsman in a spiral
          for (let i = 0; i < 6; i++) { const a = t * 10 + i; this.emit({ pos: from.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, rnd(-0.6, 0.4), Math.sin(a) * 0.6)), n: 1, dir: sky.clone().sub(from), cone: 0.5, speed: [5, 9], drag: 0.6, life: [0.6, 1], size: [0.14, 0.05], color0: ff, shape: 'ember', k: 3 }); }
        }
        return t < 0.6;
      } });
      this.later(0.45, () => { this.orb(sky, { pal, r0: 0.3, r1: 1.6, dur: 0.6, disp: 0.3, heat: 1, k: 2.6 }); this.flare(sky, ff[0], { size: 6, dur: 0.6, k: 3 }); this.light(sky, pal[1], 14, 18, 1.2, true); });
      // comets rain onto every target
      for (const tg of targets) {
        for (let i = 0; i < 5; i++) {
          const d = 0.62 + i * 0.09;
          this.later(d, () => {
            const to = this.P(tg, 'chest').add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.3, 0.3), rnd(-0.5, 0.5)));
            this.projectile(sky.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1))), to, { pal, dur: Math.max(0.12, T - d), arc: 0, r: 0.22, trail: 0.4, trailN: 4 });
          });
        }
      }
      this.later(T, () => {
        this.flash('#fff0c0', 0.7, 0.5);
        this.shake(0.9, 0.7);
        this.column(cen, { pal, h: 9, r0: 3, r1: 1.2, dur: 1.2, grow: 0.12, scroll: -2.5, k: 2.2, wave: 1 });
        for (const tg of targets) this.explode(this.P(tg, 'chest'), pal, 1.5 * this.sizeOf(tg), true);
        this.ring(cen, { r: 8, color: pal[1], dur: 1, w: 0.04, k: 2.2 });
        this.decal(cen, scorchTex(), { size: 9, dur: 5, a: 0.8 });
        let t2 = 0;
        this.track({ update: (dt) => { t2 += dt; this.emit({ pos: cen.clone().add(new THREE.Vector3(rnd(-4, 4), 0.1, rnd(-3, 3))), n: 3, dir: new THREE.Vector3(0, 1, 0), cone: 0.3, speed: [1, 3], drag: 0.5, life: [1, 2], size: [0.12, 0.03], color0: ff, shape: 'ember', k: 3 }); return t2 < 1.4; } });
      });
      return T;
    }
    // 彼岸・渡魂 — a moonlit lotus opens beneath the party; every soul is carried back
    ultBaizhi(u, targets) {
      const pal = PAL.water, holy = PAL.holy;
      const T = 1.1;
      const cen = this.groupCenter(targets);
      this.decal(cen, circleTex('water'), { add: true, color: pal[1], k: 2.2, size: 9, dur: 3.2, spin: 0.6, fadeIn: 0.4 });
      this.decal(cen, circleTex('holy'), { add: true, color: holy[1], k: 1.6, size: 5.5, dur: 3, spin: -1, fadeIn: 0.6 });
      for (let i = 0; i < 18; i++) {
        const a = i / 18 * TAU;
        this.later(i * 0.025, () => this.emit({ pos: cen.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0.05, Math.sin(a) * 3)), n: 4, dir: new THREE.Vector3(Math.cos(a) * 0.2, 1, Math.sin(a) * 0.2), cone: 0.1, speed: [0.6, 1.2], life: [1.4, 2.2], size: [0.35, 0.15], color0: ['#ffd0e8', '#fff4fa', '#a8d8ff'], shape: 'petal', spin: 3, drag: 0.4, k: 1.8 }));
      }
      this.later(0.5, () => this.column(cen.clone(), { pal: [holy[0], pal[1]], h: 14, r0: 3.4, r1: 2.6, dur: 1.8, grow: 0.25, scroll: -0.8, streak: 0.85, k: 0.9, a: 0.3 }));
      this.later(T, () => {
        this.flash('#e8f6ff', 0.55, 0.6);
        for (const tg of targets) {
          const feet = this.P(tg, 'feet');
          this.column(feet, { pal: [holy[0], pal[0]], h: 6, r0: 0.6, r1: 0.5, dur: 1.2, grow: 0.2, k: 1.2, a: 0.55 });
          this.emit({ pos: feet, disk: 0.6, n: 30, dir: new THREE.Vector3(0, 1, 0), cone: 0.2, speed: [1, 3], drag: 0.8, life: [0.8, 1.4], size: [0.2, 0.04], color0: [holy[0], pal[0], '#ffd0e8'], shape: ['ember', 'petal'], k: 2.2 });
          this.light(this.P(tg, 'chest'), pal[1], 5, 7, 1.4);
        }
        this.ring(cen, { r: 7, color: pal[0], dur: 1.2, w: 0.03, k: 2 });
      });
      return T;
    }
    // 紅纓破陣 — waves of crimson spear-shadows crash through the enemy line
    ultHongying(u, targets) {
      const red = ['#fff0e0', '#ff6a4a', '#c81a1a', '#2a0a0a'], gold = PAL.metal;
      const T = 1.0;
      const cen = this.groupCenter(targets);
      const dir = this.dirTo(u, targets[0] || u);
      for (let w = 0; w < 3; w++) {
        this.later(0.2 + w * 0.22, () => {
          for (let i = 0; i < 14; i++) {
            const lat = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(rnd(-3.5, 3.5));
            const start = cen.clone().addScaledVector(dir, -7).add(lat).add(new THREE.Vector3(0, rnd(0.4, 2.2), 0));
            this.emit({ pos: start, n: 1, dir, cone: 0.02, speed: [18, 24], life: [0.6, 0.7], size: [0.5, 0.35], color0: i % 3 ? red[1] : gold[1], shape: 'spark', stretch: 0.12, k: 3 });
          }
          this.ring(cen.clone().add(new THREE.Vector3(0, 1.2, 0)), { vertical: true, r: 3.5, color: red[1], dur: 0.35, w: 0.04, k: 2 });
          this.shake(0.3, 0.2);
          for (const tg of targets) this.slash(this.P(tg, 'chest'), { pal: red, arc: 2.6, r: 1.3 * this.sizeOf(tg), thick: 0.4, roll: rnd(-1.4, 1.4), dur: 0.28, k: 2.8 });
        });
      }
      this.later(T, () => {
        this.flash('#ffe0d0', 0.6, 0.4);
        this.shake(0.9, 0.6);
        for (const tg of targets) {
          const c = this.P(tg, 'chest');
          this.flare(c, red[0], { size: 4, dur: 0.35, k: 3.5 });
          this.emit({ pos: c, n: 40, speed: [3, 9], drag: 3, gravity: 4, life: [0.3, 0.7], size: [0.16, 0.02], color0: [red[0], red[1], gold[1]], shape: 'spark', stretch: 0.15, k: 3 });
          this.emit({ pos: c, n: 20, speed: [0.5, 2], gravity: 1, drag: 1, life: [0.8, 1.4], size: [0.3, 0.1], color0: ['#ff3a3a', '#c81a1a'], shape: 'petal', alpha: true, spin: 6 });
        }
        this.ring(cen, { r: 7, color: red[1], dur: 0.9, w: 0.05, k: 2.4 });
        this.light(cen.clone().add(new THREE.Vector3(0, 2, 0)), red[1], 14, 14, 0.8);
      });
      return T;
    }
    // 太極・萬符朝宗 — a blizzard of talismans, then the five elements in turn
    ultYungui(u, targets) {
      const T = 1.15;
      const cen = this.groupCenter(targets);
      this.decal(cen, circleTex('magic'), { add: true, color: '#f0e0a0', k: 2, size: 8, dur: 2.6, spin: 0.8, fadeIn: 0.3 });
      for (let i = 0; i < (this.lite ? 14 : 28); i++) {
        const a = rnd(0, TAU), r = rnd(1, 4.5);
        const from = cen.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(4, 7), Math.sin(a) * r));
        const tg = targets[i % Math.max(1, targets.length)];
        if (tg) this.later(i * 0.018, () => this.talismanFly(from, tg, 0, T - i * 0.018));
      }
      const order = ['wood', 'fire', 'earth', 'metal', 'water'];
      order.forEach((e, i) => this.later(T + i * 0.1, () => {
        const pal = palOf(e);
        for (const tg of targets) {
          const c = this.P(tg, 'chest');
          this.flare(c, pal[0], { size: 2.6, dur: 0.25, k: 3 });
          this.emit({ pos: c, n: 14, speed: [1.5, 4], drag: 2, life: [0.3, 0.6], size: [0.2, 0.04], color0: pal.slice(0, 2), shape: 'ember', k: 2.4 });
        }
        this.ring(cen, { r: 3 + i * 1.1, color: pal[1], dur: 0.6, w: 0.04, k: 2 });
        this.light(cen.clone().add(new THREE.Vector3(0, 2, 0)), pal[1], 10, 12, 0.3);
        this.shake(0.35, 0.18);
      }));
      this.later(T + 0.5, () => { this.flash('#fff8e0', 0.5, 0.4); this.column(cen, { pal: ['#fffaf0', '#ffe0a0'], h: 10, r0: 2.6, r1: 1.6, dur: 0.9, grow: 0.12, k: 2 }); });
      return T;
    }
    // 引魂 — a tide of blue soul lanterns sweeps through
    ultChenbo(u, targets) {
      const pal = PAL.ghost;
      const T = 1.0;
      const cen = this.groupCenter(targets);
      for (let i = 0; i < 14; i++) {
        const a = rnd(0, TAU), r = rnd(0.5, 3.5);
        this.later(i * 0.03, () => this.paperLantern(cen.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.1, Math.sin(a) * r)), true, 1.6, ['#eaf4ff', '#7ab4ff', '#3a64c8']));
      }
      this.later(T, () => {
        this.flash('#d8ecff', 0.5, 0.5); this.shake(0.7, 0.5);
        this.column(cen, { pal, h: 9, r0: 2.8, r1: 1.4, dur: 1.1, grow: 0.15, scroll: -1.6, k: 2 });
        for (const tg of targets) this.orb(this.P(tg, 'chest'), { pal, r0: 0.3, r1: 1.5 * this.sizeOf(tg), dur: 0.7, disp: 0.45, rim: 0.5, k: 2 });
        this.ring(cen, { r: 7, color: pal[1], dur: 1, w: 0.04, k: 2 });
      });
      return T;
    }

    // ---------------------------------------------------------------- persistent status visuals
    updateStatuses(dt) {
      const view = this.view; if (!view.units) return;
      this.stT = (this.stT || 0) + dt;
      const tick = (k, every) => (Math.floor(this.stT / every) !== Math.floor((this.stT - dt) / every));
      for (const [u, uv] of view.units) {
        if (u.dead || !uv.root.visible || u.alpha < 0.3) { this.clearStatus(u); continue; }
        const st = u.st || {};
        const rec = this.status.get(u) || {};
        this.status.set(u, rec);
        const head = this.P(u, 'head'), chest = this.P(u, 'chest'), feet = this.P(u, 'feet');
        const sc = this.sizeOf(u);
        if (st.poison && tick('p', 0.18)) this.emit({ pos: chest, spread: 0.3 * sc, n: 1, up: 1, speed: [0.3, 0.7], gravity: -0.6, life: [0.6, 1], size: [0.14, 0.06], color0: PAL.poison.slice(0, 2), shape: 'bubble', k: 1.3 });
        if (st.sleep && tick('s', 0.5)) this.emit({ pos: head.clone().add(new THREE.Vector3(0.2, 0.1, 0)), n: 1, dir: new THREE.Vector3(0.3, 1, 0), cone: 0.2, speed: [0.3, 0.5], life: [1.2, 1.6], size: [0.18, 0.34], color0: PAL.sleep[1], shape: 'bubble', k: 1.4, spin: 0.3 });
        if (st.trance && tick('t', 0.1)) { const a = this.stT * 4; this.emit({ pos: head.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, -0.1, Math.sin(a) * 0.5)), n: 1, speed: [0, 0.1], life: [0.5, 0.7], size: [0.14, 0.02], color0: pick(['#ff6ad5', '#7af0ff', '#b6ff6a', '#ffd06a']), shape: 'star', k: 2 }); }
        if (st.regen && tick('r', 0.3)) this.emit({ pos: feet, disk: 0.4 * sc, n: 1, dir: new THREE.Vector3(0, 1, 0), cone: 0.2, speed: [0.5, 1], life: [0.8, 1.2], size: [0.14, 0.04], color0: PAL.heal.slice(0, 2), shape: 'leaf', k: 1.6 });
        const ups = Object.keys(st).filter((k) => /Up$/.test(k)), downs = Object.keys(st).filter((k) => /Down$/.test(k));
        if (ups.length && tick('u', 0.45)) this.emit({ pos: feet, disk: 0.45 * sc, n: 1, dir: new THREE.Vector3(0, 1, 0), cone: 0.05, speed: [1.2, 1.8], life: [0.5, 0.7], size: [0.14, 0.03], color0: '#ffd870', shape: 'spark', stretch: 0.2, k: 1.6 });
        if (downs.length && tick('d', 0.5)) this.emit({ pos: head, disk: 0.4 * sc, n: 1, dir: new THREE.Vector3(0, -1, 0), cone: 0.05, speed: [0.8, 1.2], life: [0.6, 0.8], size: [0.13, 0.03], color0: '#a08aff', shape: 'spark', stretch: 0.2, k: 1.4 });
        // orbiting stars for stun; talisman for seal; bubble for shield
        this.statusObj(rec, 'stun', !!st.stun, () => this.makeOrbiters(u, 3, 'star', '#ffe86a'), (o) => { o.position.copy(head); o.rotation.y += dt * 4; });
        this.statusObj(rec, 'seal', !!st.seal, () => this.makeOrbiters(u, 2, 'rune', '#d8a0ff'), (o) => { o.position.copy(chest); o.rotation.y -= dt * 2; });
        this.statusObj(rec, 'shield', !!st.shield, () => this.makeShield(u), (o) => { o.position.copy(chest); o.material.uniforms.uTime.value += dt; });
        this.statusObj(rec, 'guard', !!st.guard, () => this.makeGuard(u), (o) => { o.position.copy(chest); o.quaternion.copy(view.camera.quaternion); o.material.opacity = 0.35 + 0.1 * Math.sin(this.stT * 6); });
      }
      for (const u of this.status.keys()) if (!view.units.has(u)) this.clearStatus(u);
    }
    statusObj(rec, key, on, make, upd) {
      if (on && !rec[key]) { rec[key] = make(); this.scene.add(rec[key]); }
      if (!on && rec[key]) { this.scene.remove(rec[key]); rec[key].traverse((n) => { if (n.material && !n.material.shared) n.material.dispose(); }); rec[key] = null; }
      if (rec[key]) upd(rec[key]);
    }
    clearStatus(u) {
      const rec = this.status.get(u); if (!rec) return;
      for (const k in rec) if (rec[k]) { this.scene.remove(rec[k]); rec[k].traverse((n) => { if (n.material && !n.material.shared) n.material.dispose(); }); }
      this.status.delete(u);
    }
    makeOrbiters(u, n, shape, color) {
      const T = THREE, g = new T.Group();
      const sc = this.sizeOf(u);
      for (let i = 0; i < n; i++) {
        const tx = this.cellTex(CELL[shape]);
        const m = new T.Sprite(new T.SpriteMaterial({ map: tx, color: new T.Color(color).multiplyScalar(2.2), blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
        const a = i / n * TAU; m.position.set(Math.cos(a) * 0.45 * sc, 0.1 * Math.sin(a * 2), Math.sin(a) * 0.45 * sc); m.scale.setScalar(0.3);
        g.add(m);
      }
      return g;
    }
    makeShield(u) {
      const T = THREE, sc = this.sizeOf(u);
      const mat = new T.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uCol: { value: new T.Color('#f0d070').multiplyScalar(1.4) } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
        fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
            vec2 h = vP.xy * 6.0; float hex = abs(sin(h.x * 2.0) * sin(h.y * 2.0 + uTime));
            float a = fr * 0.8 + smoothstep(0.92, 1.0, hex) * 0.12 + 0.03;
            gl_FragColor = vec4(uCol * a, a); ${OUT_GLSL} }`,
        transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      });
      const m = new T.Mesh(new T.SphereGeometry(0.85 * sc, 24, 16), mat);
      m.scale.y = 1.25; m.renderOrder = 23;
      return m;
    }
    makeGuard(u) {
      const T = THREE, sc = this.sizeOf(u);
      const m = new T.Mesh(new T.CircleGeometry(0.7 * sc, 6), new T.MeshBasicMaterial({ color: new T.Color('#bfd8ff').multiplyScalar(1.5), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      m.renderOrder = 23;
      return m;
    }

    dispose() {
      for (const it of this.items) { try { it.dispose && it.dispose(); } catch (e) { /* ignore */ } }
      this.items.length = 0; this.timers.length = 0;
      for (const u of [...this.status.keys()]) this.clearStatus(u);
      this.add.dispose(); this.alpha.dispose();
      for (const l of this.lights) this.scene.remove(l);
      for (const k in this.geo) this.geo[k].dispose();
      for (const tx of this._cells || []) if (tx) tx.dispose();
    }
  }

  V.System = System;
  V.create = (view) => new System(view);
  V.circleTex = circleTex;
  V.CELL = CELL;
  return V;
})();

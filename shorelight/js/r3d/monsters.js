// 彼岸燈 — 3D creatures, part A (G.Mon3D registry + creature kit + 26 folklore creatures).
// Contract: docs/CONTRACTS_3D.md ("G.Mon3D"). Monster team B (monsters_boss.js) registers into the same registry.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// REGISTRY (shared with monsters_boss.js — keep this exact shape)
//   G.Mon3D.defs[id] = builder
//   G.Mon3D.define(id, builder)
//   G.Mon3D.has(id) -> bool
//   G.Mon3D.create(id, opts) -> instance | null      opts: { context: 'battle'|'map'|'cutscene', variant: 0|1|2, phase: 1|2 }
//
//   builder: function (opts, K) -> instance          K = G.Mon3D.kit (optional helper kit, see below)
//            (an object { build(opts, K) } is accepted too)
//
// INSTANCE (same interface as G.Char3D instances)
//   root, height, radius, id, isMon3D
//   setFacing(yaw) setMove(speed) play(name|null, { loop, fade, onDone }) emote(k) setExpression(name)
//   lookAt(Vector3|null) setOpacity(a, ghost) setPhase(n) update(dt, camYaw, camera) lights() bone(name) dispose()
//   clips: idle move attack cast hurt die special enter (+ aliases: attack2/skill→special, ko→die, revive/ready→enter,
//   guard→hurt-lite, victory→cast, dodge→hurt, run/walk→move).
//
// KIT (G.Mon3D.kit.creature(spec) -> builder) — data-driven skinned creatures:
//   spec = {
//     h: 2D art height px (target height = h/64 × fill), fill (0.9), height: design height of the build (units),
//     pal, vars (same format as js/gfx/monsters.js palettes: hue-shift variants), boss,
//     slots: { name: paint(g, w, h, p, rnd) | { size: 1|2, paint, emit } }   painted atlas (1024², 256 px cells)
//     build(B, p, o)      B.bone(name, parent, [x,y,z])  B.ell / B.tube / B.lathe / B.geo / B.strip / B.eye  (see Builder)
//     clips: { idle(P, t, k, C), move, attack, cast, hurt, die, special, enter }   P.r/P.p/P.s/P.root/P.ch (pose layer)
//     dur: { attack: 1.0, … }, springs: [{ chain: [bones], k, d, g, max }], fx: { name: emitter }, lights(C), tick(C, dt)
//   }
// ─────────────────────────────────────────────────────────────────────────────────────────────────
'use strict';
(() => {
  const M3 = (G.Mon3D = G.Mon3D || { defs: {} });
  M3.defs = M3.defs || {};
  if (!M3.define) M3.define = function (id, builder) { this.defs[id] = builder; };
  if (!M3.has) M3.has = function (id) { return !!this.defs[id]; };
  if (!M3.create) {
    M3.create = function (id, opts) {
      const b = this.defs[id];
      if (!b) return null;
      opts = Object.assign({ context: 'battle', variant: 0 }, opts || {});
      try { return typeof b === 'function' ? b(opts, this.kit) : b.build(opts, this.kit); } catch (e) {
        (G.warnOnce || console.warn)('mon3d ' + id, e);
        return null;
      }
    };
  }

  const TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, sqrt = Math.sqrt;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const seg = (k, a, b) => clamp((k - a) / (b - a), 0, 1);
  const E = {
    inQ: (t) => t * t, outQ: (t) => 1 - (1 - t) * (1 - t), ioQ: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
    outC: (t) => 1 - (1 - t) ** 3, inC: (t) => t * t * t, outBack: (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
    outEl: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-9 * t) * sin((t * 9 - 0.75) * (TAU / 3)) + 1),
  };
  // attack envelope: wind-up (anticipation) → snap strike → hold → recover. returns { a, s }
  function atk(k, ka = 0.32, ks = 0.46, kr = 0.66) {
    let a = 0, s = 0;
    if (k < ka) a = E.outQ(k / ka);
    else if (k < ks) { const u = (k - ka) / (ks - ka); a = 1 - E.inQ(u); s = E.outC(u); }
    else if (k < kr) s = 1;
    else s = 1 - E.ioQ(seg(k, kr, 1));
    return { a, s };
  }
  const bump = (k, a, b) => (k <= a || k >= b ? 0 : sin(PI * (k - a) / (b - a)));

  // ------------------------------------------------------------------------------------------- colour
  function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb2hex(r, g, b) { return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = max(r, g, b), mn = min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
    return [h, s, l];
  }
  function hsl2hex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - abs(2 * l - 1)) * s, x = c * (1 - abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return rgb2hex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }
  function hueShift(hex, dh, smul = 1, dl = 0) { const [h, s, l] = rgb2hsl(...hex2rgb(hex)); return hsl2hex(h + dh, s * smul, l + dl); }
  function shade(hex, a) { const [r, g, b] = hex2rgb(hex); return a < 0 ? rgb2hex(r * (1 + a), g * (1 + a), b * (1 + a)) : rgb2hex(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a); }
  function mix(h1, h2, t) { const a = hex2rgb(h1), b = hex2rgb(h2); return rgb2hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)); }
  function rgba(hex, a) { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function palette(base, vars, v) {
    if (!v || !vars || !vars[v - 1]) return Object.assign({}, base);
    const sp = vars[v - 1], out = {};
    for (const k in base) {
      const val = base[k];
      out[k] = (typeof val !== 'string' || val[0] !== '#' || (sp.keep && sp.keep.includes(k))) ? val : hueShift(val, sp.h || 0, sp.s == null ? 1 : sp.s, sp.l || 0);
    }
    if (sp.set) Object.assign(out, sp.set);
    return out;
  }
  function rng(seed) { let a = (seed * 2654435761) >>> 0 || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ------------------------------------------------------------------------------------------- painting helpers
  // All take (g, w, h, …) and paint into the current slot (origin at slot top-left). v = 0 bottom … 1 top of a part.
  const Paint = {
    fill(g, w, h, c) { g.fillStyle = c; g.fillRect(0, 0, w, h); },
    vgrad(g, w, h, stops) { const gr = g.createLinearGradient(0, 0, 0, h); for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
    hgrad(g, w, h, stops) { const gr = g.createLinearGradient(0, 0, w, 0); for (let i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
    // blotchy mottling
    mottle(g, w, h, col, n, r0, r1, a, R) {
      for (let i = 0; i < n; i++) {
        const x = R() * w, y = R() * h, r = lerp(r0, r1, R());
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    },
    speck(g, w, h, col, n, s, a, R) { g.fillStyle = rgba(col, a); for (let i = 0; i < n; i++) { const r = s * (0.4 + R()); g.fillRect(R() * w, R() * h, r, r); } },
    // directional strokes (fur, grain, fibres)
    strokes(g, w, h, col, n, len, ang, lw, a, R, jit = 0.3) {
      g.strokeStyle = rgba(col, a); g.lineWidth = lw; g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const x = R() * w, y = R() * h, an = ang + (R() - 0.5) * jit, l = len * (0.5 + R());
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + cos(an) * l * 0.5 + (R() - 0.5) * 3, y + sin(an) * l * 0.5, x + cos(an) * l, y + sin(an) * l); g.stroke();
      }
    },
    weave(g, w, h, col, step, a) {
      g.strokeStyle = rgba(col, a); g.lineWidth = 1;
      for (let x = 0; x < w; x += step) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
      for (let y = 0; y < h; y += step) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    },
    // fish/snake scales
    scales(g, w, h, col, hi, sx, sy, a) {
      g.lineWidth = 1.2;
      for (let row = 0, y = 0; y < h + sy; y += sy, row++) for (let x = (row % 2) * sx / 2 - sx; x < w + sx; x += sx) {
        g.strokeStyle = rgba(col, a); g.beginPath(); g.arc(x, y, sx * 0.55, 0.15 * PI, 0.85 * PI); g.stroke();
        g.strokeStyle = rgba(hi, a * 0.6); g.beginPath(); g.arc(x, y - 1.5, sx * 0.45, 0.3 * PI, 0.7 * PI); g.stroke();
      }
    },
    // ragged dark band for hems
    hem(g, w, h, col, y, depth, R, a = 0.8) {
      g.fillStyle = rgba(col, a); g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) g.lineTo(x, y + R() * depth);
      g.lineTo(w, h); g.closePath(); g.fill();
    },
    // cracks (stone, porcelain, dry earth)
    cracks(g, w, h, col, n, len, lw, a, R) {
      g.strokeStyle = rgba(col, a); g.lineWidth = lw; g.lineJoin = 'round';
      for (let i = 0; i < n; i++) {
        let x = R() * w, y = R() * h, an = R() * TAU; g.beginPath(); g.moveTo(x, y);
        const k = 3 + (R() * 4 | 0);
        for (let j = 0; j < k; j++) { an += (R() - 0.5) * 1.4; x += cos(an) * len / k; y += sin(an) * len / k; g.lineTo(x, y); }
        g.stroke();
      }
    },
    // glowing iris eye filling the slot (for eye-ball parts; front = slot centre)
    eye(g, w, h, iris, pupil, white, slit = 0) {
      Paint.fill(g, w, h, white || iris);
      const cx = w / 2, cy = h / 2, r = w * 0.2;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, shade(iris, 0.5)); gr.addColorStop(0.7, iris); gr.addColorStop(1, shade(iris, -0.45));
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, r, r * 1.15, 0, 0, TAU); g.fill();
      g.fillStyle = pupil; g.beginPath();
      if (slit) g.ellipse(cx, cy, r * slit, r * 0.95, 0, 0, TAU); else g.arc(cx, cy, r * 0.42, 0, TAU);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(cx - r * 0.35, cy - r * 0.4, r * 0.2, 0, TAU); g.fill();
    },
  };

  // ------------------------------------------------------------------------------------------- shaders
  const NOISE_GLSL = `
    float m3h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float m3n(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(m3h(i), m3h(i + vec3(1,0,0)), f.x), mix(m3h(i + vec3(0,1,0)), m3h(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(m3h(i + vec3(0,0,1)), m3h(i + vec3(1,0,1)), f.x), mix(m3h(i + vec3(0,1,1)), m3h(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float m3f(vec3 p){ return 0.55 * m3n(p) + 0.3 * m3n(p * 2.1 + 3.7) + 0.15 * m3n(p * 4.3 + 7.1); }`;

  // Creature toon material: G.R3M.toon look (same ramp + fresnel rim) + per-instance dissolve, hit flash, ghost fresnel
  // translucency with drifting mist, emissive × vertex colour. U = shared per-instance uniforms.
  function monMat(U, o) {
    const T = THREE;
    const ghost = !!o.ghost;
    const mat = new T.MeshToonMaterial({
      color: 0xffffff, map: o.map || null, gradientMap: G.R3M.ramp(o.bands || 3),
      emissive: o.emap ? 0xffffff : 0x000000, emissiveMap: o.emap || null, emissiveIntensity: 1,
      vertexColors: true, transparent: ghost, depthWrite: !ghost, side: o.side != null ? o.side : T.FrontSide,
      alphaTest: ghost ? 0 : (o.alphaTest != null ? o.alphaTest : 0.5),
    });
    const L = { uGhostK: { value: ghost ? 1 : 0 }, uRim: { value: o.rim != null ? o.rim : 0.38 }, uRimColor: { value: new T.Color(o.rimColor || 0xfff2dc) } };
    mat.userData.L = L;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U, L);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvObjP = transformed;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vObjP;
          uniform float uRim, uDis, uFlash, uTime, uGhostK, uGhostBody, uH, uGlow, uAlpha;
          uniform vec3 uRimColor, uDisCol, uFlashCol, uGhostCol;
          ${NOISE_GLSL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float disN = m3f(vObjP * (5.0 / uH)) * 0.62 + (1.0 - clamp(vObjP.y / uH, 0.0, 1.0)) * 0.38;
          if (uDis > 0.001 && disN < uDis * 1.08) discard;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          #ifdef USE_COLOR
            totalEmissiveRadiance *= vColor.rgb;
          #endif
          totalEmissiveRadiance *= uGlow;`)
        .replace('#include <opaque_fragment>', `
          { vec3 nv = normalize(normal), vv = normalize(vViewPosition);
            float fr = 1.0 - clamp(abs(dot(nv, vv)), 0.0, 1.0);
            float rimK = smoothstep(0.62, 0.78, fr) * uRim;
            outgoingLight += uRimColor * rimK * (0.35 + 0.65 * clamp(dot(outgoingLight, vec3(0.333)), 0.0, 1.0));
            float gk = max(uGhostK, uGhostBody);
            if (gk > 0.0) {
              float mist = m3f(vObjP * (3.0 / uH) * vec3(1.0, 0.6, 1.0) + vec3(0.0, -uTime * 0.35, uTime * 0.1));
              float ga = (0.22 + 0.78 * pow(fr, 1.5)) * (0.65 + 0.7 * mist);
              diffuseColor.a *= mix(1.0, clamp(ga, 0.0, 1.0), gk);
              outgoingLight += uGhostCol * gk * (pow(fr, 2.0) * 0.9 + mist * 0.15);
            }
            float de = smoothstep(uDis * 1.08 + 0.07, uDis * 1.08, disN) * step(0.001, uDis);
            outgoingLight += uDisCol * de * 4.0;
            outgoingLight = mix(outgoingLight, uFlashCol * 1.6, uFlash * 0.7);
            diffuseColor.a *= uAlpha;
          }
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'mon3d' + (ghost ? 'g' : 'b');
    return mat;
  }
  // additive glow layer (flames, lantern cores, spirit fire) — unlit, HDR-bright → bloom
  function glowMat(U, map) {
    const T = THREE;
    const mat = new T.MeshBasicMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP;')
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\nvObjP = transformed;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vObjP; uniform float uTime, uGlow, uDis, uAlpha, uH;\n${NOISE_GLSL}`)
        .replace('#include <opaque_fragment>', `
          float fl = 0.75 + 0.5 * m3n(vObjP * (6.0 / uH) + vec3(0.0, -uTime * 2.2, 0.0));
          outgoingLight *= 1.35 * uGlow * fl;
          diffuseColor.a *= uAlpha * (1.0 - clamp(uDis * 1.6, 0.0, 1.0));
          #include <opaque_fragment>`);
    };
    mat.customProgramCacheKey = () => 'mon3dglow';
    return mat;
  }

  // ------------------------------------------------------------------------------------------- particles
  // One THREE.Points per creature; all emitters share it. Premultiplied blending lets additive (wisps, embers) and
  // alpha (paper ash, spores, drops) particles live in the same draw call.
  let spriteTex = null;
  function particleSprites() {
    if (spriteTex) return spriteTex;
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    // 0 soft glow
    let gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    // 1 paper scrap / ash flake (irregular quad, burnt edge)
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(64 + 14, 20); g.lineTo(64 + 46, 12); g.lineTo(64 + 52, 40); g.lineTo(64 + 22, 50); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(80,80,80,0.9)'; g.lineWidth = 3; g.stroke();
    // 2 droplet
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(128 + 32, 8); g.quadraticCurveTo(128 + 48, 38, 128 + 32, 54); g.quadraticCurveTo(128 + 16, 38, 128 + 32, 8); g.fill();
    // 3 four-point sparkle
    gr = g.createRadialGradient(224, 32, 0, 224, 32, 10); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(192, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.moveTo(224, 4); g.lineTo(227, 29); g.lineTo(252, 32); g.lineTo(227, 35); g.lineTo(224, 60); g.lineTo(221, 35); g.lineTo(196, 32); g.lineTo(221, 29); g.closePath(); g.fill();
    spriteTex = G.R3M.canvasTex(c); spriteTex.shared = true;
    return spriteTex;
  }
  function makePoints(n, U) {
    const T = THREE;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aCol', new T.BufferAttribute(new Float32Array(n * 4), 4)); // rgb, alpha
    geo.setAttribute('aSz', new T.BufferAttribute(new Float32Array(n * 3), 3)); // size, shape, additive(0/1)
    const mat = new T.ShaderMaterial({
      uniforms: { uTex: { value: particleSprites() }, uScale: { value: 360 }, uAlpha: U.uAlpha },
      vertexShader: `attribute vec4 aCol; attribute vec3 aSz; varying vec4 vCol; varying vec2 vSh; uniform float uScale;
        void main(){ vCol = aCol; vSh = aSz.yz; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSz.x * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uTex; uniform float uAlpha; varying vec4 vCol; varying vec2 vSh;
        void main(){ vec2 uv = vec2((gl_PointCoord.x + vSh.x) * 0.25, 1.0 - gl_PointCoord.y);
          float a = texture2D(uTex, uv).a * vCol.a * uAlpha; if (a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb * a, a * (1.0 - vSh.y)); }`,
      transparent: true, depthWrite: false, blending: T.CustomBlending,
      blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendEquation: T.AddEquation,
    });
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false; pts.renderOrder = 3;
    pts.onBeforeRender = (r, s, cam) => {
      const hgt = r.getDrawingBufferSize ? r.getDrawingBufferSize(_v2).y : 720;
      mat.uniforms.uScale.value = hgt * 0.5 * (cam.projectionMatrix ? cam.projectionMatrix.elements[5] : 1.8);
    };
    return pts;
  }
  let _v2 = null;

  // ------------------------------------------------------------------------------------------- builder (geometry + rig)
  // All positions are in model space (feet centre at origin, facing +z), in DESIGN units (spec.height).
  // weights `w`: 'bone' | [['a', .7], ['b', .3]] | (x, y, z) => [[bone, w], …]
  class Builder {
    constructor(atlas) {
      this.atlas = atlas;
      this.bones = []; this.byName = {};
      this.layers = { body: newLayer(), ghost: newLayer(), glow: newLayer() };
      this.outlineSkip = []; // [layer, startVertex, endVertex]
      this.bone('root', null, [0, 0, 0]);
    }
    bone(name, parent, at) {
      const b = new THREE.Bone(); b.name = name;
      const pb = parent ? this.byName[parent] : null;
      b.userData.abs = new THREE.Vector3(...at);
      if (pb) { b.position.copy(b.userData.abs).sub(pb.userData.abs); pb.add(b); } else b.position.copy(b.userData.abs);
      b.userData.rest = b.position.clone();
      this.byName[name] = b; this.bones.push(b);
      return b;
    }
    has(n) { return !!this.byName[n]; }
    at(n) { return this.byName[n].userData.abs.clone(); }
    bi(n) { const i = this.bones.indexOf(this.byName[n]); if (i < 0) throw new Error('mon3d: no bone ' + n); return i; }
    // ---- weight helpers
    // interpolate bones by a scalar key (e.g. y) through [[k0,'a'],[k1,'b'],…]
    keyW(keys, axis = 1) {
      return (x, y, z) => {
        const v = [x, y, z][axis];
        if (v <= keys[0][0]) return [[keys[0][1], 1]];
        for (let i = 0; i < keys.length - 1; i++) {
          if (v <= keys[i + 1][0]) { const t = sm(0, 1, (v - keys[i][0]) / (keys[i + 1][0] - keys[i][0])); return [[keys[i][1], 1 - t], [keys[i + 1][1], t]]; }
        }
        return [[keys[keys.length - 1][1], 1]];
      };
    }
    // ---- core: append a THREE.BufferGeometry
    // o: { w, slot, layer: 'body'|'ghost'|'glow', tint: '#hex', at:[x,y,z], rot:[x,y,z], scale:[x,y,z]|n, outline:false,
    //      ao: [y0,y1,dark] (darken toward feet), wv: per-vertex weights array, smooth:true, uvr:[u0,v0,u1,v1] sub-rect }
    geo(geo, o = {}) {
      const T = THREE;
      let g = geo;
      if (o.at || o.rot || o.scale) {
        const m = new T.Matrix4();
        const q = new T.Quaternion().setFromEuler(new T.Euler(...(o.rot || [0, 0, 0])));
        const s = o.scale == null ? new T.Vector3(1, 1, 1) : typeof o.scale === 'number' ? new T.Vector3(o.scale, o.scale, o.scale) : new T.Vector3(...o.scale);
        m.compose(new T.Vector3(...(o.at || [0, 0, 0])), q, s);
        g.applyMatrix4(m);
      }
      if (o.deform) {
        const p = g.attributes.position, v = new T.Vector3();
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); o.deform(v, i, g.attributes.uv ? g.attributes.uv.getY(i) : 0); p.setXYZ(i, v.x, v.y, v.z); }
        g.deleteAttribute('normal');
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      if (o.smooth !== false) smoothSeams(g);
      const L = this.layers[o.layer || 'body'];
      const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
      const base = L.pos.length / 3;
      const rect = this.atlas.rect(o.slot || 'white');
      const ur = o.uvr || [0, 0, 1, 1];
      const tint = new T.Color(o.tint || '#ffffff');
      const wf = o.w == null ? 'root' : o.w;
      const mapW = (x, y, z, i) => {
        if (o.wv) return o.wv[i];
        if (typeof wf === 'string') return [[wf, 1]];
        if (typeof wf === 'function') return wf(x, y, z);
        return wf;
      };
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        L.pos.push(x, y, z);
        L.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
        let u = uv ? uv.getX(i) : 0.5, v = uv ? uv.getY(i) : 0.5;
        if (o.uvMap) [u, v] = o.uvMap(x, y, z, u, v);
        u = lerp(ur[0], ur[2], u); v = lerp(ur[1], ur[3], v);
        L.uv.push(lerp(rect[0], rect[2], u), lerp(rect[1], rect[3], v));
        let k = 1;
        if (o.ao) k = lerp(o.ao[2] != null ? o.ao[2] : 0.55, 1, sm(o.ao[0], o.ao[1], y));
        if (o.shadeFn) k *= o.shadeFn(x, y, z);
        L.col.push(tint.r * k, tint.g * k, tint.b * k);
        const ws = mapW(x, y, z, i).filter((e) => e[1] > 0.001).sort((a, b) => b[1] - a[1]).slice(0, 4);
        let tot = 0; for (const e of ws) tot += e[1];
        for (let j = 0; j < 4; j++) {
          if (j < ws.length) { L.si.push(this.bi(ws[j][0])); L.sw.push(ws[j][1] / (tot || 1)); } else { L.si.push(0); L.sw.push(0); }
        }
      }
      const idx = g.index;
      if (idx) for (let i = 0; i < idx.count; i++) L.idx.push(base + idx.getX(i));
      else for (let i = 0; i < pos.count; i++) L.idx.push(base + i);
      if (o.outline === false && (o.layer || 'body') === 'body') this.outlineSkip.push([L.idx.length - (idx ? idx.count : pos.count), L.idx.length]);
      g.dispose();
      return this;
    }
    // ellipsoid, front (+z) at u = .5, v 0 bottom → 1 top
    ell(c, r, o = {}) {
      const T = THREE, ws = o.seg || 18, hs = o.rings || 12;
      const g = new T.SphereGeometry(1, ws, hs, -PI / 2 + (o.phi0 || 0), o.phiLen || TAU, o.th0 || 0, o.thLen || PI);
      // re-map: three's sphere has +z at u=.25 with phiStart 0; we started at -π/2 so +z lands at u=.5
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * r[0], p.getY(i) * r[1], p.getZ(i) * r[2]);
      g.deleteAttribute('normal');
      return this.geo(g, Object.assign({}, o, { at: [c[0] + (o.at ? o.at[0] : 0), c[1] + (o.at ? o.at[1] : 0), c[2] + (o.at ? o.at[2] : 0)] }));
    }
    // swept tube through pts (Catmull-Rom), radii per point or fn(u). o.bones: bone name per point (weights blend
    // along the path), o.flat: [sx, sy] ellipse cross-section, o.cap0/o.cap1: rounded caps, o.up: frame hint.
    tube(pts, radii, o = {}) {
      const T = THREE;
      const V = pts.map((p) => new T.Vector3(...p));
      const sub = o.sub || 4, segN = o.seg || 10;
      const P = [], R = [], U = [], Wt = [];
      const rad = (i) => (typeof radii === 'number' ? radii : Array.isArray(radii) ? radii[i] : null);
      const n = V.length;
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < (i === n - 2 ? sub + 1 : sub); j++) {
          const t = j / sub;
          const p0 = V[max(0, i - 1)], p1 = V[i], p2 = V[i + 1], p3 = V[min(n - 1, i + 2)];
          const t2 = t * t, t3 = t2 * t;
          const q = new T.Vector3();
          for (const ax of ['x', 'y', 'z']) q[ax] = 0.5 * (2 * p1[ax] + (-p0[ax] + p2[ax]) * t + (2 * p0[ax] - 5 * p1[ax] + 4 * p2[ax] - p3[ax]) * t2 + (-p0[ax] + 3 * p1[ax] - 3 * p2[ax] + p3[ax]) * t3);
          const u = (i + t) / (n - 1);
          P.push(q); U.push(u);
          R.push(typeof radii === 'function' ? radii(u) : lerp(rad(i), rad(i + 1), t));
          if (o.bones) Wt.push(jointW(o.bones, i, t, o.soft));
        }
      }
      // tangents & parallel-transport frames
      const N = P.length, Tn = [], Nn = [], Bn = [];
      for (let i = 0; i < N; i++) Tn.push(new T.Vector3().subVectors(P[min(N - 1, i + 1)], P[max(0, i - 1)]).normalize());
      let up = new T.Vector3(...(o.up || [0, 0, 1]));
      if (abs(up.dot(Tn[0])) > 0.95) up = new T.Vector3(1, 0, 0);
      let nn = new T.Vector3().crossVectors(Tn[0], up).normalize();
      for (let i = 0; i < N; i++) {
        if (i > 0) { const q = new T.Quaternion().setFromUnitVectors(Tn[i - 1], Tn[i]); nn = nn.clone().applyQuaternion(q); }
        Nn.push(nn.clone()); Bn.push(new T.Vector3().crossVectors(Tn[i], nn).normalize());
      }
      const fl = o.flat || [1, 1];
      const rings = []; // [centre, radiusScale, u, weights, axialOffset]
      const capN = 4;
      if (o.cap0) for (let c = capN; c >= 1; c--) { const a = (c / capN) * PI / 2; rings.push([0, cos(a), -sin(a) * R[0] * (o.cap0 === true ? 1 : o.cap0), 0]); }
      for (let i = 0; i < N; i++) rings.push([i, 1, 0, U[i]]);
      if (o.cap1) for (let c = 1; c <= capN; c++) { const a = (c / capN) * PI / 2; rings.push([N - 1, cos(a), sin(a) * R[N - 1] * (o.cap1 === true ? 1 : o.cap1), 1]); }
      const pos = [], uv = [], wv = [], idx = [];
      const tw = o.twist || 0;
      rings.forEach(([i, rs, off, u], ri) => {
        const c = P[i].clone().addScaledVector(Tn[i], off);
        const r = R[i] * rs;
        for (let s = 0; s <= segN; s++) {
          const a = (s / segN) * TAU + tw * U[i] + (o.a0 || 0);
          const d = new T.Vector3().addScaledVector(Nn[i], cos(a) * r * fl[0]).addScaledVector(Bn[i], sin(a) * r * fl[1]);
          if (o.wobble) d.multiplyScalar(1 + o.wobble(U[i], a));
          pos.push(c.x + d.x, c.y + d.y, c.z + d.z);
          uv.push(s / segN, o.vRange ? lerp(o.vRange[0], o.vRange[1], u) : u);
          wv.push(o.bones ? Wt[i] : null);
        }
        if (ri > 0) {
          const a0 = (ri - 1) * (segN + 1), b0 = ri * (segN + 1);
          for (let s = 0; s < segN; s++) idx.push(a0 + s, a0 + s + 1, b0 + s, a0 + s + 1, b0 + s + 1, b0 + s);
        }
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return this.geo(g, Object.assign({}, o, o.bones ? { wv } : {}));
    }
    // lathe around y through profile [[r, y], …] (bottom→top); o.at offsets; o.seg; o.flat [sx, sz]; o.wobble(y, a)
    lathe(profile, o = {}) {
      const T = THREE, segN = o.seg || 20;
      const pos = [], uv = [], idx = [];
      const fl = o.flat || [1, 1];
      const ys = profile.map((p) => p[1]); const y0 = min(...ys), y1 = max(...ys);
      profile.forEach(([r, y], i) => {
        for (let s = 0; s <= segN; s++) {
          const a = -PI / 2 + (s / segN) * TAU; // +z (front) at u = .5 ... a = π/2 → sin = 1 → z
          let rr = r; if (o.wobble) rr *= 1 + o.wobble(y, a, i);
          pos.push(-cos(a) * rr * fl[0], y, sin(a) * rr * fl[1]);
          uv.push(1 - s / segN, (y - y0) / ((y1 - y0) || 1));
        }
        if (i > 0) { const a0 = (i - 1) * (segN + 1), b0 = i * (segN + 1); for (let s = 0; s < segN; s++) idx.push(a0 + s, a0 + s + 1, b0 + s, a0 + s + 1, b0 + s + 1, b0 + s); }
      });
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return this.geo(g, o);
    }
    // flat ribbon through pts with widths, oriented by `side` vector ([x,y,z] across-direction) — paper strips, hair, rags.
    strip(pts, widths, o = {}) {
      const T = THREE;
      const n = pts.length, sub = o.sub || 3;
      const V = pts.map((p) => new T.Vector3(...p));
      const pos = [], uv = [], wv = [], idx = [];
      const side = new T.Vector3(...(o.side || [1, 0, 0])).normalize();
      let row = 0;
      for (let i = 0; i < n - 1; i++) {
        for (let j = 0; j < (i === n - 2 ? sub + 1 : sub); j++) {
          const t = j / sub, c = V[i].clone().lerp(V[i + 1], t);
          const w = lerp(typeof widths === 'number' ? widths : widths[i], typeof widths === 'number' ? widths : widths[i + 1], t) / 2;
          const u = (i + t) / (n - 1);
          let sd = side;
          if (o.sideFn) sd = new T.Vector3(...o.sideFn(u)).normalize();
          pos.push(c.x - sd.x * w, c.y - sd.y * w, c.z - sd.z * w, c.x + sd.x * w, c.y + sd.y * w, c.z + sd.z * w);
          uv.push(0, 1 - u, 1, 1 - u);
          const ww = o.bones ? jointW(o.bones, i, t, o.soft) : null;
          wv.push(ww, ww);
          if (row > 0) { const a = (row - 1) * 2, b = row * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
          row++;
        }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const oo = Object.assign({ outline: false, smooth: false }, o, o.bones ? { wv } : {});
      if (o.oneSided) return this.geo(g, oo);
      // back side: same verts, reversed winding & flipped normals (body material is front-sided)
      const bk = g.clone();
      const bi = []; for (let i = 0; i < idx.length; i += 3) bi.push(idx[i], idx[i + 2], idx[i + 1]);
      bk.setIndex(bi);
      const nn = bk.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
      this.geo(g, Object.assign({}, oo, o.at || o.rot ? {} : {}));
      return this.geo(bk, oo);
    }
    // membrane / cloth sheet between two polylines A and B (same point count) with bones per point on each side.
    // n = subdivisions across; weights blend from A's bones to B's. Two-sided. o.bulge(u, v) → offset along o.bulgeDir.
    sheet(A, Bp, bonesA, bonesB, o = {}) {
      const T = THREE, n = o.n || 4, m = A.length;
      const pos = [], uv = [], wv = [], idx = [];
      for (let i = 0; i < m; i++) for (let j = 0; j <= n; j++) {
        const v = j / n, a = A[i], b = Bp[i];
        let p = [lerp(a[0], b[0], v), lerp(a[1], b[1], v), lerp(a[2], b[2], v)];
        if (o.bulge) { const k = o.bulge(i / (m - 1), v), d = o.bulgeDir || [0, -1, 0]; p = [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]; }
        pos.push(...p); uv.push(v, 1 - i / (m - 1));
        const ba = bonesA[i], bb = bonesB[i];
        wv.push(ba === bb ? [[ba, 1]] : [[ba, 1 - v], [bb, v]]);
        if (i > 0 && j > 0) { const c = i * (n + 1) + j, pr = (i - 1) * (n + 1) + j; idx.push(pr - 1, c - 1, pr, pr, c - 1, c); }
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const bk = g.clone(); const bi = []; for (let i = 0; i < idx.length; i += 3) bi.push(idx[i], idx[i + 2], idx[i + 1]); bk.setIndex(bi);
      const nn = bk.attributes.normal; for (let i = 0; i < nn.count; i++) nn.setXYZ(i, -nn.getX(i), -nn.getY(i), -nn.getZ(i));
      const oo = Object.assign({ outline: false, smooth: false }, o, { wv });
      this.geo(g, oo);
      return this.geo(bk, oo);
    }
    // simple eye: flattened ellipsoid with its own bone (blink = scale y), painted with slot (iris centred)
    eye(name, parent, c, r, o = {}) {
      this.bone(name, parent, c);
      return this.ell(c, [r, r * (o.ry || 1), r * (o.rz || 0.5)], Object.assign({ w: name, slot: o.slot || 'eye', seg: 12, rings: 8, outline: false, rot: o.rot }, o));
    }
  }
  // skin weights along a chain: segment i belongs to bones[i]; joints (points) blend 50/50 with the previous bone.
  // soft (0..0.5) = blend zone width per side of the joint.
  function jointW(bones, i, t, soft = 0.3) {
    const a = bones[i], b = bones[i + 1] || a, pv = i > 0 ? bones[i - 1] : a;
    if (t < soft && pv !== a) { const k = 0.5 + 0.5 * sm(0, soft, t); return [[a, k], [pv, 1 - k]]; }
    if (t > 1 - soft && b !== a) { const k = 0.5 * sm(1 - soft, 1, t); return [[a, 1 - k], [b, k]]; }
    return [[a, 1]];
  }
  function newLayer() { return { pos: [], nrm: [], uv: [], col: [], si: [], sw: [], idx: [] }; }
  // average normals of coincident vertices (UV seams) so seams don't shade
  function smoothSeams(g) {
    const p = g.attributes.position, n = g.attributes.normal, map = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
      let e = map.get(k); if (!e) map.set(k, (e = [0, 0, 0, []]));
      e[0] += n.getX(i); e[1] += n.getY(i); e[2] += n.getZ(i); e[3].push(i);
    }
    for (const e of map.values()) {
      if (e[3].length < 2) continue;
      const l = Math.hypot(e[0], e[1], e[2]) || 1;
      for (const i of e[3]) n.setXYZ(i, e[0] / l, e[1] / l, e[2] / l);
    }
  }

  // ------------------------------------------------------------------------------------------- atlas
  const atlasCache = new Map();
  function makeAtlas(key, slots, p, seed) {
    if (atlasCache.has(key)) return atlasCache.get(key);
    const all = Object.assign({
      white: { size: 1, paint: (g, w, h) => { Paint.fill(g, w, h, '#ffffff'); } },
      lit: { size: 1, paint: (g, w, h) => Paint.fill(g, w, h, '#ffffff'), emit: (g, w, h) => Paint.fill(g, w, h, '#ffffff') },
      dark: { size: 1, paint: (g, w, h) => Paint.fill(g, w, h, '#1c1a1e') },
    }, slots);
    // slot size in 128 px units: 1 = 128, 2 = 256 (default), 4 = 512. Atlas grows 1024 → 2048 when full.
    const list = Object.keys(all).map((k) => [k, typeof all[k] === 'function' ? { paint: all[k] } : all[k]]);
    list.sort((a, b) => (b[1].size || 2) - (a[1].size || 2));
    let S = 1024, cells = null;
    for (; S <= 2048 && !cells; S *= 2) {
      const n = S / 128, grid = new Array(n * n).fill(false), out = [];
      let ok = true;
      for (const [k, s] of list) {
        const sz = s.size || 2;
        let placed = false;
        for (let cy = 0; cy <= n - sz && !placed; cy++) for (let cx = 0; cx <= n - sz && !placed; cx++) {
          let free = true;
          for (let y = 0; y < sz && free; y++) for (let x = 0; x < sz; x++) if (grid[(cy + y) * n + cx + x]) { free = false; break; }
          if (!free) continue;
          for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) grid[(cy + y) * n + cx + x] = true;
          out.push([k, s, cx * 128, cy * 128, sz * 128]); placed = true;
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) cells = out;
    }
    S /= 2;
    if (!cells) throw new Error('mon3d atlas full: ' + key);
    const rects = {};
    const c = document.createElement('canvas'); c.width = c.height = S;
    const e = document.createElement('canvas'); e.width = e.height = S;
    const g = c.getContext('2d'), ge = e.getContext('2d');
    ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
    let anyEmit = false;
    for (const [k, s, x, y, sz] of cells) {
      const R = rng(seed + x * 7 + y * 13 + 1);
      g.save(); g.beginPath(); g.rect(x, y, sz, sz); g.clip(); g.translate(x, y);
      g.lineJoin = 'round'; g.lineCap = 'round';
      s.paint(g, sz, sz, p, R);
      g.restore();
      if (s.emit) {
        anyEmit = true;
        const R2 = rng(seed + x * 7 + y * 13 + 1);
        ge.save(); ge.beginPath(); ge.rect(x, y, sz, sz); ge.clip(); ge.translate(x, y); s.emit(ge, sz, sz, p, R2); ge.restore();
      }
      const ins = 3 / S;
      rects[k] = [x / S + ins, 1 - (y + sz) / S + ins, (x + sz) / S - ins, 1 - y / S - ins];
    }
    const map = G.R3M.canvasTex(c); map.shared = true; map.flipY = true;
    const emap = anyEmit ? G.R3M.canvasTex(e) : null; if (emap) emap.shared = true;
    const atlas = { map, emap, rects, rect(k) { if (!this.rects[k]) throw new Error('mon3d slot ' + k); return this.rects[k]; } };
    atlasCache.set(key, atlas);
    return atlas;
  }

  // ------------------------------------------------------------------------------------------- pose layer
  class Pose {
    constructor(bones) { this.m = new Map(); for (const b of bones) this.m.set(b.name, { r: [0, 0, 0], p: [0, 0, 0], s: [0, 0, 0] }); this.root = [0, 0, 0, 0, 0, 0, 0]; this.chs = {}; this.w = 1; }
    reset() { for (const e of this.m.values()) { e.r[0] = e.r[1] = e.r[2] = 0; e.p[0] = e.p[1] = e.p[2] = 0; e.s[0] = e.s[1] = e.s[2] = 0; } this.root.fill(0); this.chs = {}; }
    r(n, x = 0, y = 0, z = 0) { const e = this.m.get(n); if (!e) return this; const w = this.w; e.r[0] += x * w; e.r[1] += y * w; e.r[2] += z * w; return this; }
    p(n, x = 0, y = 0, z = 0) { const e = this.m.get(n); if (!e) return this; const w = this.w; e.p[0] += x * w; e.p[1] += y * w; e.p[2] += z * w; return this; }
    s(n, x = 0, y = x, z = x) { const e = this.m.get(n); if (!e) return this; const w = this.w; e.s[0] += x * w; e.s[1] += y * w; e.s[2] += z * w; return this; }
    // whole-body offset (model group): position x,y,z, rotation x,y,z, uniform squash (y-scale − 1, volume kept)
    rootM(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sq = 0) { const w = this.w, R = this.root; R[0] += x * w; R[1] += y * w; R[2] += z * w; R[3] += rx * w; R[4] += ry * w; R[5] += rz * w; R[6] += sq * w; return this; }
    // scalar channels: glow, dissolve, alpha(−), ghost, flash, fx rates …
    ch(n, v) { this.chs[n] = (this.chs[n] || 0) + v * this.w; return this; }
  }

  // ------------------------------------------------------------------------------------------- creature instance
  const CLIP_ALIAS = { attack2: 'special', skill: 'special', ko: 'die', dead: 'die', revive: 'enter', ready: 'enter', victory: 'cast', dodge: 'hurt', guard: 'hurt', run: 'move', walk: 'move', item: 'cast' };
  const DEF_DUR = { attack: 1.05, cast: 1.5, hurt: 0.6, die: 1.8, special: 1.4, enter: 1.3 };

  class Creature {
    constructor(spec, opts, id) {
      const T = THREE;
      this.id = id; this.spec = spec; this.opts = opts; this.isMon3D = true;
      this.context = opts.context || 'battle';
      this.variant = opts.variant | 0;
      this.phaseN = opts.phase || 1;
      const p = (this.p = palette(spec.pal || {}, spec.vars, this.variant));
      this.seed = (hashStr(id) + this.variant * 101) | 0;
      const atlas = makeAtlas(id + '#' + this.variant, spec.slots || {}, p, this.seed);
      const B = new Builder(atlas);
      this.B = B;
      spec.build(B, p, this);
      // ---- scale: design height → target height (2D h/64 × fill)
      const md = G.Monsters && G.Monsters.get ? G.Monsters.get(id) : null;
      const h2d = spec.h || (md ? md.h : 160);
      this.height = (h2d / 64) * (spec.fill || 0.9);
      this.k = this.height / spec.height;
      this.radius = (spec.radius || 0.4) * this.k;
      // ---- uniforms (per instance)
      this.U = {
        uDis: { value: 0 }, uDisCol: { value: new T.Color(spec.disCol || p.magic || '#ffd890') }, uFlash: { value: 0 }, uFlashCol: { value: new T.Color('#ffffff') },
        uTime: { value: 0 }, uGhostBody: { value: 0 }, uGhostCol: { value: new T.Color(spec.ghostCol || '#9fe8ff') }, uH: { value: spec.height },
        uGlow: { value: 1 }, uAlpha: { value: 1 },
      };
      // ---- hierarchy: root (yaw) → model (scale, root motion) → bones + meshes
      this.root = new T.Group(); this.root.name = 'mon3d:' + id;
      this.model = new T.Group(); this.root.add(this.model);
      this.model.scale.setScalar(this.k);
      this.model.add(B.bones[0]);
      this.model.updateMatrixWorld(true);
      this.skeleton = new T.Skeleton(B.bones);
      this.meshes = [];
      const mk = (L, mat, nm) => {
        if (!L.idx.length) return null;
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(L.pos, 3));
        g.setAttribute('normal', new T.Float32BufferAttribute(L.nrm, 3));
        g.setAttribute('uv', new T.Float32BufferAttribute(L.uv, 2));
        g.setAttribute('color', new T.Float32BufferAttribute(L.col, 3));
        g.setAttribute('skinIndex', new T.Uint16BufferAttribute(L.si, 4));
        g.setAttribute('skinWeight', new T.Float32BufferAttribute(L.sw, 4));
        g.setIndex(L.idx);
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new T.SkinnedMesh(g, mat);
        m.name = nm; m.frustumCulled = false;
        this.model.add(m); m.bind(this.skeleton);
        this.meshes.push(m);
        return m;
      };
      const side = spec.double ? T.DoubleSide : T.FrontSide;
      this.matBody = monMat(this.U, { map: atlas.map, emap: atlas.emap, rim: spec.rim, rimColor: spec.rimColor, side, bands: spec.bands });
      this.body = mk(B.layers.body, this.matBody, 'body');
      if (this.body) { this.body.castShadow = true; this.body.receiveShadow = true; }
      if (B.layers.ghost.idx.length) {
        this.matGhost = monMat(this.U, { map: atlas.map, emap: atlas.emap, ghost: true, rim: 0, side: spec.ghostSide != null ? spec.ghostSide : T.FrontSide });
        this.ghost = mk(B.layers.ghost, this.matGhost, 'ghost');
        this.ghost.renderOrder = 2; this.ghost.castShadow = !!spec.ghostShadow;
      }
      if (B.layers.glow.idx.length) {
        this.matGlow = glowMat(this.U, atlas.emap || atlas.map);
        this.glow = mk(B.layers.glow, this.matGlow, 'glow');
        this.glow.renderOrder = 4; this.glow.castShadow = false;
      }
      // outline (inverted hull) over the solid body (cards excluded)
      if (this.body && spec.outline !== false) {
        let geo = this.body.geometry;
        if (B.outlineSkip.length) {
          geo = geo.clone();
          const idx = Array.from(geo.index.array), keep = [];
          const skip = B.outlineSkip;
          for (let i = 0; i < idx.length; i += 3) { if (!skip.some(([a, b]) => i >= a && i < b)) keep.push(idx[i], idx[i + 1], idx[i + 2]); }
          geo.setIndex(keep);
        }
        const tmp = new T.SkinnedMesh(geo, this.matBody); tmp.bind(this.skeleton, this.body.bindMatrix);
        this.outline = G.R3M.outline(tmp, { width: spec.outlineW != null ? spec.outlineW : 0.0032, color: spec.outlineCol || shade(p.line || '#2a2026', -0.35) });
        this.outline.frustumCulled = false; this.outline.name = 'outline';
        this.model.add(this.outline); this.outline.bind(this.skeleton, this.body.bindMatrix);
        this.outlineGeo = geo !== this.body.geometry ? geo : null;
      }
      // blob shadow
      const sh = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: G.R3M.blobTex(), transparent: true, depthWrite: false, opacity: 0.9 }));
      sh.rotation.x = -PI / 2; sh.position.y = 0.012; sh.renderOrder = 1;
      const sr = (spec.shadow || 0.45) * this.k * 2.2; sh.scale.set(sr * (spec.shadowX || 1), sr * (spec.shadowZ || 0.8), 1);
      sh.castShadow = false; sh.receiveShadow = false;
      this.shadow = sh; this.root.add(sh);
      // particles
      this.emitters = [];
      if (spec.fx) {
        let n = 0;
        for (const k in spec.fx) { const e = Object.assign({ name: k, n: 24, rate: 0 }, spec.fx[k]); e.acc = 0; e.R = rng(this.seed + n + 7); this.emitters.push(e); n += e.n; }
        this.pN = n;
        this.pts = makePoints(n, this.U);
        this.pState = new Float32Array(n * 12); // x y z vx vy vz age life size0 emitterIdx rnd alive
        this.model.add(this.pts); // model space (scaled with the creature)
        let o = 0; for (const e of this.emitters) { e.off = o; o += e.n; }
      }
      // pose / anim state
      this.pose = new Pose(B.bones);
      this.t = 0; this.yaw = 0; this.yawT = 0; this.faced = false; this.speed = 0; this.moveW = 0; this.movePh = 0;
      this.layers = []; // { name, t, dur, loop, w, fade, out, onDone, done }
      this.springs = (spec.springs || []).map((s) => this.initSpring(s));
      this.flash = 0; this.opacity = 1; this.ghostMode = false; this.look = null; this.lookV = [0, 0];
      this.expression = 'neutral'; this.emoteK = null; this.emoteT = 0;
      this.blink = 0; this.nextBlink = 2 + (this.seed % 100) / 50;
      this.state = {}; // creature scratch
      if (spec.init) spec.init(this);
      this.setPhase(this.phaseN);
      if (opts.context === 'battle' && opts.enter) this.play('enter');
    }
    // ---------------------------------------------------------------- interface
    setFacing(yaw) { this.yawT = yaw; if (!this.faced) { this.yaw = yaw; this.faced = true; this.root.rotation.y = yaw; } }
    setMove(s) { this.speed = s || 0; }
    play(name, o = {}) {
      if (!name) { for (const L of this.layers) L.out = true; return; }
      let n = this.spec.clips && this.spec.clips[name] ? name : CLIP_ALIAS[name] || name;
      if (n === 'idle') { for (const L of this.layers) L.out = true; return; }
      if (n === 'move') { this.speed = max(this.speed, 2.5); for (const L of this.layers) L.out = true; return; }
      const fn = this.clipFn(n);
      if (!fn) { if (o.onDone) o.onDone(); return; }
      for (const L of this.layers) L.out = true;
      const dur = (this.spec.dur && this.spec.dur[n]) || DEF_DUR[n] || 1.2;
      this.layers.push({ name: n, alias: name, t: 0, dur, loop: !!o.loop, w: 0, fade: o.fade != null ? o.fade : (n === 'hurt' ? 0.05 : 0.12), out: false, onDone: o.onDone, done: false, hold: n === 'die', ev: 0 });
      if (n === 'hurt') this.flash = 1;
    }
    emote(k) { this.emoteK = k; this.emoteT = 0; }
    setExpression(e) { this.expression = e || 'neutral'; }
    lookAt(v) { this.look = v ? v.clone() : null; }
    setOpacity(a, ghost) { this.opacity = a; this.ghostMode = !!ghost; }
    setPhase(n) {
      this.phaseN = n || 1;
      if (this.spec.phase) this.spec.phase(this, this.phaseN);
    }
    bone(n) {
      const B = this.B.byName;
      const alias = { hips: ['hips', 'pelvis', 'body', 'root'], spine: ['spine', 'chest', 'body'], chest: ['chest', 'spine', 'body'], neck: ['neck', 'head'], head: ['head', 'body', 'chest'], handL: ['handL', 'armL2', 'clawL'], handR: ['handR', 'armR2', 'clawR'], footL: ['footL', 'legL2', 'root'], footR: ['footR', 'legR2', 'root'] }[n] || [n];
      for (const a of alias) if (B[a]) return B[a];
      return B.root;
    }
    lights() {
      if (!this.spec.lights) return [];
      this.root.updateMatrixWorld(true);
      const out = [];
      for (const L of this.spec.lights(this)) {
        const v = new THREE.Vector3(...(L.at || [0, 0, 0]));
        (L.bone ? this.B.byName[L.bone] : this.model).localToWorld(v);
        out.push({ x: v.x, y: v.y, z: v.z, color: L.color, i: (L.i || 1) * this.opacity * (1 - this.U.uDis.value), r: (L.r || 3) * this.k * 1.5, flicker: L.flicker || 0 });
      }
      return out;
    }
    dispose() {
      for (const m of this.meshes) m.geometry.dispose();
      if (this.outlineGeo) this.outlineGeo.dispose();
      for (const m of [this.matBody, this.matGhost, this.matGlow]) if (m) m.dispose();
      if (this.outline) this.outline.material.dispose();
      this.shadow.geometry.dispose(); this.shadow.material.dispose();
      if (this.pts) { this.pts.geometry.dispose(); this.pts.material.dispose(); }
      if (this.root.parent) this.root.parent.remove(this.root);
    }
    // ---------------------------------------------------------------- clips
    clipFn(n) {
      const c = this.spec.clips || {};
      if (c[n]) return c[n];
      return GEN[n] || null;
    }
    // ---------------------------------------------------------------- per frame
    update(dt, camYaw = 0, camera = null) {
      dt = clamp(dt || 0, 0, 0.1);
      const spec = this.spec;
      this.t += dt;
      this.U.uTime.value = this.t;
      // facing (smooth, shortest arc)
      let dy = this.yawT - this.yaw; dy = Math.atan2(sin(dy), cos(dy));
      this.yaw += dy * min(1, dt * 10);
      this.root.rotation.y = this.yaw;
      // locomotion weight
      const mv = clamp(this.speed / 3, 0, 1);
      this.moveW += (mv - this.moveW) * min(1, dt * 6);
      this.movePh += dt * (0.6 + this.speed * 0.32) * (spec.cadence || 1);
      // one-shot layers
      let over = 0;
      for (const L of this.layers) {
        L.t += dt;
        const k = L.t / L.dur;
        if (k >= 1 && !L.loop && !L.done) {
          L.done = true;
          if (L.onDone) { const f = L.onDone; L.onDone = null; f(); }
          if (!L.hold) L.out = true;
        }
        if (L.out) L.w = max(0, L.w - dt / max(0.05, L.fade * 1.5)); else L.w = min(1, L.w + dt / max(0.02, L.fade));
        over = max(over, L.w);
      }
      this.layers = this.layers.filter((L) => !(L.out && L.w <= 0));
      // ---- pose
      const P = this.pose; P.reset();
      const baseW = 1 - over * (spec.overlayReplace != null ? spec.overlayReplace : 0.8);
      const idle = this.clipFn('idle'), move = this.clipFn('move');
      P.w = baseW * (1 - this.moveW); if (P.w > 0.001 && idle) idle(P, this.t, 0, this);
      P.w = baseW * this.moveW; if (P.w > 0.001 && move) move(P, this.movePh, 0, this);
      for (const L of this.layers) {
        P.w = L.w; if (P.w <= 0.001) continue;
        const fn = this.clipFn(L.name);
        const k = L.loop ? (L.t / L.dur) % 1 : min(1, L.t / L.dur);
        fn(P, L.t, k, this);
      }
      // blink & emote
      this.nextBlink -= dt;
      if (this.nextBlink < 0) { this.blink = 0.16; this.nextBlink = 2.2 + ((this.t * 977) % 3); }
      this.blink = max(0, this.blink - dt);
      const bl = this.blink > 0 ? sin((this.blink / 0.16) * PI) : 0;
      P.w = 1;
      if (bl > 0) for (const e of ['eyeL', 'eyeR', 'eye']) P.s(e, 0, -0.9 * bl, 0);
      if (this.emoteK) {
        this.emoteT += dt; const ek = this.emoteT / 0.6;
        if (ek >= 1) this.emoteK = null; else P.rootM(0, bump(ek, 0, 1) * 0.12 * this.spec.height, 0, 0, 0, 0, -0.05 * bump(ek, 0, 0.3));
      }
      // ---- apply
      for (const b of this.B.bones) {
        const e = P.m.get(b.name), r = b.userData.rest;
        b.position.set(r.x + e.p[0], r.y + e.p[1], r.z + e.p[2]);
        b.rotation.set(e.r[0], e.r[1], e.r[2]);
        b.scale.set(1 + e.s[0], 1 + e.s[1], 1 + e.s[2]);
      }
      const R = P.root, k = this.k;
      this.model.position.set(R[0] * k, R[1] * k, R[2] * k);
      this.model.rotation.set(R[3], R[4], R[5]);
      const sq = R[6];
      this.model.scale.set(k * (1 - sq * 0.5), k * (1 + sq), k * (1 - sq * 0.5));
      // look-at (head)
      const head = this.B.byName.head;
      if (head) {
        let ty = 0, tx = 0;
        if (this.look) {
          this.root.updateMatrixWorld(true);
          const lp = this.root.worldToLocal(this.look.clone());
          ty = clamp(Math.atan2(lp.x, lp.z), -0.7, 0.7); tx = clamp(-Math.atan2(lp.y - this.height * 0.85, Math.hypot(lp.x, lp.z)), -0.35, 0.35);
        }
        this.lookV[0] += (ty - this.lookV[0]) * min(1, dt * 6); this.lookV[1] += (tx - this.lookV[1]) * min(1, dt * 6);
        head.rotation.y += this.lookV[0]; head.rotation.x += this.lookV[1];
      }
      if (spec.tick) spec.tick(this, dt, P);
      this.root.updateMatrixWorld(true);
      // springs (fixed 60 Hz substeps)
      if (this.springs.length) {
        this.springAcc = (this.springAcc || 0) + dt;
        let n = 0;
        while (this.springAcc >= 1 / 60 && n < 4) { this.springAcc -= 1 / 60; n++; }
        if (n === 0 && dt > 0) n = 0;
        for (const s of this.springs) this.stepSpring(s, n, 1 / 60);
        if (this.springAcc > 1 / 60) this.springAcc = 0;
      }
      // ---- channels → uniforms
      const ch = P.chs;
      this.flash = max(0, this.flash - dt * 5);
      const U = this.U;
      U.uFlash.value = this.flash * this.flash * 0.8 + (ch.flash || 0);
      U.uDis.value = clamp(ch.dissolve || 0, 0, 1);
      U.uGlow.value = max(0, (this.glowBase || 1) + (ch.glow || 0));
      U.uAlpha.value = clamp(this.opacity * (1 - (ch.fade || 0)), 0, 1);
      U.uGhostBody.value = this.ghostMode ? 1 : clamp(ch.ghost || 0, 0, 1);
      const trans = U.uAlpha.value < 0.995 || U.uGhostBody.value > 0;
      if (this.matBody.transparent !== trans) { this.matBody.transparent = trans; this.matBody.depthWrite = !trans; this.matBody.needsUpdate = true; }
      if (this.outline) this.outline.visible = U.uDis.value < 0.02 && U.uAlpha.value > 0.98 && U.uGhostBody.value < 0.5;
      if (this.body) this.body.castShadow = spec.cast !== false && U.uDis.value < 0.4 && U.uAlpha.value > 0.5;
      // blob shadow: shrink with lift
      const lift = max(0, this.model.position.y / max(0.3, this.height));
      this.shadow.material.opacity = 0.9 * U.uAlpha.value * (1 - U.uDis.value) * clamp(1 - lift * 0.8, 0.25, 1) * (spec.shadowA || 1);
      // particles
      if (this.pts) this.stepFx(dt, ch);
    }
    // ---------------------------------------------------------------- springs
    // chain bones are rotated so their child (or tip) follows a damped point mass (verlet-ish, world space)
    initSpring(s) {
      const T = THREE;
      const nodes = s.chain.map((n, i) => {
        const b = this.B.byName[n];
        const nx = s.chain[i + 1] ? this.B.byName[s.chain[i + 1]] : null;
        const tipL = nx ? nx.userData.rest.clone() : new T.Vector3(...(s.tip || [0, -0.2, 0]));
        return { b, tipL, p: new T.Vector3(), v: new T.Vector3(), init: false };
      });
      return { nodes, k: s.k || 90, d: s.d || 9, g: s.g != null ? s.g : 2, max: s.max || 1.2, wind: s.wind || 0 };
    }
    stepSpring(s, n, h) {
      const T = THREE;
      const O = _a, Tp = _b, q = _q, pq = _q2;
      const gk = this.k;
      for (const nd of s.nodes) {
        const b = nd.b;
        b.updateMatrixWorld(true);
        O.setFromMatrixPosition(b.matrixWorld);
        Tp.copy(nd.tipL).applyMatrix4(b.matrixWorld);
        const L = _c.subVectors(Tp, O).length();
        if (!nd.init || nd.p.distanceTo(Tp) > L * 4 + 1) { nd.p.copy(Tp); nd.v.set(0, 0, 0); nd.init = true; }
        for (let i = 0; i < n; i++) {
          // acceleration toward the animated target, damping, gravity, gentle wind
          _d.subVectors(Tp, nd.p).multiplyScalar(s.k);
          _d.addScaledVector(nd.v, -s.d);
          _d.y -= s.g * gk;
          if (s.wind) { _d.x += sin(this.t * 1.7 + nd.tipL.y * 9) * s.wind * gk; _d.z += cos(this.t * 1.3 + nd.tipL.x * 7) * s.wind * gk * 0.6; }
          nd.v.addScaledVector(_d, h);
          nd.p.addScaledVector(nd.v, h);
          // keep length
          _c.subVectors(nd.p, O); const l = _c.length() || 1e-6; nd.p.copy(O).addScaledVector(_c, L / l);
        }
        // rotate bone: animated dir → simulated dir (limited)
        const a = _c.subVectors(Tp, O).normalize(), d = _e.subVectors(nd.p, O).normalize();
        let ang = Math.acos(clamp(a.dot(d), -1, 1));
        if (ang < 1e-4) continue;
        q.setFromUnitVectors(a, d);
        if (ang > s.max) q.slerp(_qi, 1 - s.max / ang);
        // world delta → local: local' = parentWorld⁻¹ · q · boneWorld
        b.parent.getWorldQuaternion(pq);
        b.getWorldQuaternion(_q3);
        _q3.premultiply(q).premultiply(pq.invert());
        b.quaternion.copy(_q3);
        b.updateMatrixWorld(true);
      }
    }
    // ---------------------------------------------------------------- particles
    stepFx(dt, ch) {
      const S = this.pState, pos = this.pts.geometry.attributes.position.array, col = this.pts.geometry.attributes.aCol.array, sz = this.pts.geometry.attributes.aSz.array;
      const k = this.k;
      this.model.updateMatrixWorld(true);
      const inv = _m.copy(this.model.matrixWorld).invert();
      for (let ei = 0; ei < this.emitters.length; ei++) {
        const e = this.emitters[ei];
        const rate = (e.rate + (ch['fx_' + e.name] || 0) * (e.burstRate || e.rate * 3 + 20)) * (this.fxMul && this.fxMul[e.name] != null ? this.fxMul[e.name] : 1);
        e.acc += rate * dt;
        if (e.burst) { e.acc += e.burst; e.burst = 0; }
        let spawn = Math.floor(e.acc); e.acc -= spawn;
        for (let i = e.off; i < e.off + e.n; i++) {
          const o = i * 12;
          if (S[o + 11] > 0) {
            S[o + 6] += dt;
            const life = S[o + 7];
            if (S[o + 6] >= life) { S[o + 11] = 0; continue; }
            const g = e.g || 0, dr = e.drag || 0;
            S[o + 4] -= g * dt;
            const f = Math.exp(-dr * dt); S[o + 3] *= f; S[o + 4] *= f; S[o + 5] *= f;
            if (e.swirl) { const a = S[o + 6] * e.swirl + S[o + 10] * TAU; S[o + 3] += cos(a) * e.swirlA * dt; S[o + 5] += sin(a) * e.swirlA * dt; }
            S[o] += S[o + 3] * dt; S[o + 1] += S[o + 4] * dt; S[o + 2] += S[o + 5] * dt;
            if (e.floor != null && S[o + 1] < e.floor) { S[o + 1] = e.floor; S[o + 4] = 0; S[o + 3] *= 0.5; S[o + 5] *= 0.5; }
          } else if (spawn > 0) {
            spawn--;
            const R = e.R;
            let x = e.at ? e.at[0] : 0, y = e.at ? e.at[1] : 0, z = e.at ? e.at[2] : 0;
            if (e.bone) {
              const b = this.B.byName[e.bone];
              _a.set(x, y, z).applyMatrix4(b.matrixWorld).applyMatrix4(inv); x = _a.x; y = _a.y; z = _a.z;
            }
            const bx = e.box || [0.1, 0.1, 0.1];
            if (e.ring) { const a = R() * TAU, rr = e.ring * (0.6 + 0.4 * R()); x += cos(a) * rr; z += sin(a) * rr; y += (R() - 0.5) * bx[1]; }
            else { x += (R() - 0.5) * bx[0]; y += (R() - 0.5) * bx[1]; z += (R() - 0.5) * bx[2]; }
            const v = e.vel || [0, 0.5, 0], vr = e.velR || [0.2, 0.2, 0.2];
            S[o] = x; S[o + 1] = y; S[o + 2] = z;
            S[o + 3] = v[0] + (R() - 0.5) * 2 * vr[0]; S[o + 4] = v[1] + (R() - 0.5) * 2 * vr[1]; S[o + 5] = v[2] + (R() - 0.5) * 2 * vr[2];
            if (e.radial) { const dx = x - (e.at ? e.at[0] : 0), dz = z - (e.at ? e.at[2] : 0), l = Math.hypot(dx, dz) || 1; S[o + 3] += dx / l * e.radial; S[o + 5] += dz / l * e.radial; }
            S[o + 6] = 0; S[o + 7] = lerp((e.life || [1, 2])[0], (e.life || [1, 2])[1], R());
            S[o + 8] = lerp((e.size || [0.1, 0.2])[0], (e.size || [0.1, 0.2])[1], R());
            S[o + 9] = ei; S[o + 10] = R(); S[o + 11] = 1;
          }
          // write attributes
          const alive = S[o + 11] > 0;
          pos[i * 3] = S[o]; pos[i * 3 + 1] = S[o + 1]; pos[i * 3 + 2] = S[o + 2];
          if (!alive) { col[i * 4 + 3] = 0; sz[i * 3] = 0; continue; }
          const u = S[o + 6] / S[o + 7];
          const fade = (e.fadeIn ? min(1, u / e.fadeIn) : min(1, u * 8)) * (1 - sm(e.fadeOut || 0.6, 1, u));
          const c = e._c || (e._c = (Array.isArray(e.color) ? e.color : [e.color || '#ffffff', e.color || '#ffffff']).map((h) => new THREE.Color(h)));
          const cc = _col.copy(c[0]).lerp(c[1], u);
          const twk = e.twinkle ? 0.6 + 0.4 * sin(this.t * e.twinkle + S[o + 10] * 30) : 1;
          col[i * 4] = cc.r; col[i * 4 + 1] = cc.g; col[i * 4 + 2] = cc.b; col[i * 4 + 3] = (e.alpha || 1) * fade * twk;
          sz[i * 3] = S[o + 8] * k * (1 + (e.grow || 0) * u); sz[i * 3 + 1] = e.shape || 0; sz[i * 3 + 2] = e.add === false ? 0 : 1;
        }
      }
      const g = this.pts.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSz.needsUpdate = true;
    }
    burst(name, n) { const e = this.emitters.find((x) => x.name === name); if (e) e.burst = (e.burst || 0) + n; }
  }
  let _a, _b, _c, _d, _e, _q, _q2, _q3, _qi, _m, _col;
  function initTemps() {
    if (_a) return;
    const T = THREE;
    _a = new T.Vector3(); _b = new T.Vector3(); _c = new T.Vector3(); _d = new T.Vector3(); _e = new T.Vector3();
    _q = new T.Quaternion(); _q2 = new T.Quaternion(); _q3 = new T.Quaternion(); _qi = new T.Quaternion(); _m = new T.Matrix4(); _col = new T.Color(); _v2 = new T.Vector2();
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ------------------------------------------------------------------------------------------- generic clips
  // Fallbacks used when a creature doesn't author its own. Creature clips usually call these for shared parts
  // (dissolve on death, materialise on enter) and add anatomy-specific motion on top.
  const GEN = {
    idle(P, t, k, C) { const H = C.spec.height; P.rootM(0, sin(t * 2) * 0.01 * H, 0); P.r('spine', sin(t * 1.6) * 0.03); P.r('head', 0, sin(t * 0.7) * 0.08); },
    move(P, ph, k, C) { const H = C.spec.height; P.rootM(0, abs(sin(ph * PI)) * 0.04 * H, 0, 0.08); },
    attack(P, t, k, C) { const H = C.spec.height, A = atk(k); P.rootM(0, 0, (-0.08 * A.a + 0.35 * A.s) * H, (-0.12 * A.a + 0.18 * A.s)); P.r('spine', -0.2 * A.a + 0.3 * A.s); },
    special(P, t, k, C) { GEN.attack(P, t, k, C); P.ch('glow', bump(k, 0.3, 0.8) * 1.5); },
    cast(P, t, k, C) { const H = C.spec.height, u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k)); P.rootM(0, 0.08 * H * u + sin(t * 6) * 0.01 * H * u, 0, -0.05 * u); P.ch('glow', u * 1.2); P.ch('fx_cast', u); },
    hurt(P, t, k, C) { const H = C.spec.height, u = (1 - E.outQ(k)) * min(1, k * 14); P.rootM(sin(t * 60) * 0.01 * H * u, 0, -0.12 * H * u, -0.22 * u, 0, 0, -0.06 * u); P.r('spine', -0.25 * u); P.r('head', -0.3 * u); },
    die(P, t, k, C) {
      const H = C.spec.height, u = E.ioQ(seg(k, 0, 0.45));
      P.rootM(0, 0, -0.1 * H * u, -0.35 * u, 0, 0.12 * u, -0.15 * u); P.r('spine', -0.3 * u); P.r('head', 0.4 * u);
      P.ch('dissolve', E.inQ(seg(k, 0.3, 1))); P.ch('fx_death', bump(k, 0.3, 0.95) * 2); P.ch('fade', seg(k, 0.85, 1));
    },
    enter(P, t, k, C) { const H = C.spec.height, u = 1 - E.outC(seg(k, 0, 0.8)); P.rootM(0, -0.0 * H * u, 0, 0, 0, 0, -0.2 * u * (1 - u)); P.ch('dissolve', 1 - E.outQ(seg(k, 0, 0.75))); P.ch('glow', bump(k, 0.2, 0.9)); },
  };

  // ------------------------------------------------------------------------------------------- kit export
  M3.kit = {
    creature(spec) { return (opts, K, id) => { initTemps(); return new Creature(spec, opts || {}, spec.id || id); }; },
    Creature, Builder, Paint, GEN, E, atk, bump, seg, sm, clamp, lerp, palette, hueShift, shade, mix, rgba, rng,
  };
  // define a kit creature (id-bound)
  function defC(id, spec) { spec.id = id; M3.define(id, M3.kit.creature(spec)); }
  M3._defC = defC;
})();

// =====================================================================================================
// Creatures (team A). Design units: each build is authored at a natural size (spec.height) and scaled to the
// battle size (2D art h px / 64 × fill). Facing +z. Left = +x.
// =====================================================================================================
(() => {
  const K = G.Mon3D.kit, defC = G.Mon3D._defC;
  const { Paint, GEN, E, atk, bump, seg, sm, clamp, lerp, shade, mix, rgba } = K;
  const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
  const v3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const SIDES = [[1, 'L'], [-1, 'R']];

  // ---------------------------------------------------------------- humanoid rig
  // o: { hip, chest, neck, head, shY, sh, up, fore, arm1:[dir L], arm2:[dir L], lx, knee, foot, noLegs }
  function humanRig(B, o) {
    B.bone('hips', 'root', [0, o.hip, 0]);
    B.bone('spine', 'hips', [0, lerp(o.hip, o.chest, 0.45), o.spineZ || 0]);
    B.bone('chest', 'spine', [0, o.chest, o.chestZ || 0]);
    B.bone('neck', 'chest', [0, o.neck, o.neckZ || 0]);
    B.bone('head', 'neck', [0, o.head, o.headZ || 0]);
    const J = {};
    for (const [s, S] of SIDES) {
      const m = (d) => [d[0] * s, d[1], d[2]];
      const sh = [o.sh * s, o.shY, o.shZ || 0];
      const el = v3(sh, nrm(m(o.arm1)), o.up);
      const hd = v3(el, nrm(m(o.arm2)), o.fore);
      B.bone('sh' + S, 'chest', sh); B.bone('arm' + S, 'sh' + S, el); B.bone('hand' + S, 'arm' + S, hd);
      J['sh' + S] = sh; J['el' + S] = el; J['hand' + S] = hd;
      if (!o.noLegs) {
        const hp = [o.lx * s, o.hip - 0.04, 0], kn = [o.lx * s * (o.kneeX || 1), o.knee, o.kneeZ || 0.02], ft = [o.lx * s * (o.footX || 1), o.foot || 0.07, 0];
        B.bone('leg' + S, 'hips', hp); B.bone('knee' + S, 'leg' + S, kn); B.bone('foot' + S, 'knee' + S, ft);
        J['hip' + S] = hp; J['knee' + S] = kn; J['foot' + S] = ft;
      }
    }
    return J;
  }
  // limb tube along shoulder → elbow → wrist
  function limb(B, a, b, c, r, bones, o = {}) { return B.tube([a, b, c], r, Object.assign({ bones, seg: 10, sub: 4, cap0: true, cap1: true }, o)); }
  // clawed hand: palm + n fingers (curl) with long nails; dir = forward dir of the hand (L side), s = side sign
  function claw(B, S, s, at, dir, o = {}) {
    const d = nrm([dir[0] * s, dir[1], dir[2]]);
    const sz = o.size || 0.06, n = o.n || 4;
    // side vector perpendicular to dir (roughly horizontal)
    let side = nrm([d[2], 0, -d[0]]); if (Math.hypot(d[2], d[0]) < 0.2) side = [1, 0, 0];
    const upv = nrm([side[1] * d[2] - side[2] * d[1], side[2] * d[0] - side[0] * d[2], side[0] * d[1] - side[1] * d[0]]);
    const palm = v3(at, d, sz * 0.7);
    B.ell(palm, [sz * 0.75, sz * 0.75, sz * 0.75], { w: 'hand' + S, slot: o.slot || 'skin', seg: 10, rings: 7, scale: [1, 0.55, 1] , tint: o.tint});
    for (let i = 0; i < n; i++) {
      const f = (i / (n - 1) - 0.5) * 2;
      const base = v3(v3(palm, side, f * sz * 0.55), d, sz * 0.5);
      const curl = o.curl != null ? o.curl : 0.5;
      const p1 = v3(base, d, sz * 0.7);
      const p2 = v3(v3(p1, d, sz * 0.55), upv, -sz * 0.45 * curl);
      B.tube([base, p1, p2], [sz * 0.17, sz * 0.15, sz * 0.12], { w: 'hand' + S, slot: o.slot || 'skin', seg: 6, sub: 2, cap0: true, tint: o.tint });
      if (o.nail !== false) {
        const p3 = v3(v3(p2, d, sz * (o.nailLen || 0.6)), upv, -sz * 0.4 * curl);
        B.tube([p2, p3], [sz * 0.1, 0.002], { w: 'hand' + S, slot: o.nailSlot || 'dark', seg: 5, sub: 1, tint: o.nailTint });
      }
    }
    // thumb
    const tb = v3(v3(palm, side, -sz * 0.75 * (s > 0 ? 1 : 1)), d, sz * 0.1);
    B.tube([tb, v3(v3(tb, d, sz * 0.5), side, -sz * 0.3)], [sz * 0.17, sz * 0.12], { w: 'hand' + S, slot: o.slot || 'skin', seg: 6, sub: 2, cap1: true, tint: o.tint });
  }
  // standard humanoid idle helpers
  function breathe(P, t, amt = 1) { P.r('chest', sin(t * 1.7) * 0.025 * amt).r('spine', sin(t * 1.7 + 0.6) * 0.012 * amt).s('chest', sin(t * 1.7) * 0.012 * amt, sin(t * 1.7) * 0.01 * amt, sin(t * 1.7) * 0.015 * amt); }

  // ---------------------------------------------------------------- face painting helpers
  // slot coordinates for a head ellipsoid: u (0..1, 0.5 front) → x, v (0 bottom … 1 top) → y
  const FX = (w, u) => u * w, FY = (h, v) => (1 - v) * h;

  // =====================================================================================================
  // 殭屍 jiangshi — Qing official's corpse: navy court robe with 補子 badge, official's hat with red tassel and
  // finial, yellow 符 talisman on the forehead (spring paper), stiff outstretched arms, queue braid, hopping.
  defC('jiangshi', {
    height: 1.95, fill: 0.93, radius: 0.35, shadow: 0.36, rimColor: '#c8ffd0',
    pal: { skin: '#9fb89a', skinD: '#5d7a62', robe: '#1f2a52', robeD: '#0e1430', robeL: '#3a4a86', trim: '#d9b45a', hat: '#2a2a2e', tassel: '#c8242c', talis: '#f2d36a', ink: '#b3121c', eye: '#f4ffb0', line: '#121520', magic: '#9cff7a' },
    vars: [{ h: 115, s: 0.9, keep: ['talis', 'ink', 'eye', 'trim'] }, { h: 50, s: 1.2, l: 0.02, keep: ['talis', 'ink', 'eye'] }],
    slots: {
      skin(g, w, h, p, R) { Paint.fill(g, w, h, p.skin); Paint.mottle(g, w, h, p.skinD, 40, 8, 30, 0.35, R); Paint.mottle(g, w, h, '#c9d8b4', 20, 6, 20, 0.25, R); Paint.strokes(g, w, h, shade(p.skinD, -0.2), 30, 30, PI / 2, 1, 0.25, R, 1.5); },
      face: { size: 4, paint(g, w, h, p, R) {
        Paint.fill(g, w, h, p.skin); Paint.mottle(g, w, h, p.skinD, 70, 10, 40, 0.3, R); Paint.mottle(g, w, h, '#d6e2c2', 30, 10, 30, 0.25, R);
        // sunken sockets
        for (const s of [-1, 1]) {
          const x = FX(w, 0.5 + s * 0.062), y = FY(h, 0.56);
          const gr = g.createRadialGradient(x, y, 2, x, y, 34); gr.addColorStop(0, 'rgba(20,30,25,0.95)'); gr.addColorStop(0.55, 'rgba(40,60,45,0.6)'); gr.addColorStop(1, 'rgba(40,60,45,0)');
          g.fillStyle = gr; g.fillRect(x - 40, y - 40, 80, 80);
          g.fillStyle = '#0c120e'; g.beginPath(); g.ellipse(x, y, 14, 8, s * 0.15, 0, TAU); g.fill();
          g.fillStyle = p.eye; g.beginPath(); g.arc(x + s * 1, y, 3.2, 0, TAU); g.fill();
          // heavy brow
          g.strokeStyle = 'rgba(30,40,32,0.8)'; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 18 * s, y - 16); g.quadraticCurveTo(x, y - 24, x + 18 * s, y - 13); g.stroke();
        }
        // nose shadow & grim mouth with fangs
        const mx = FX(w, 0.5), my = FY(h, 0.4);
        g.fillStyle = 'rgba(40,60,45,0.5)'; g.beginPath(); g.ellipse(mx, FY(h, 0.48), 5, 9, 0, 0, TAU); g.fill();
        g.fillStyle = '#2a0f12'; g.beginPath(); g.moveTo(mx - 24, my); g.quadraticCurveTo(mx, my + 10, mx + 24, my); g.quadraticCurveTo(mx, my + 3, mx - 24, my); g.fill();
        g.fillStyle = '#f2ecd8'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(mx + s * 13, my + 1); g.lineTo(mx + s * 9, my + 1); g.lineTo(mx + s * 11, my + 13); g.closePath(); g.fill(); }
        // cheek hollows / decay veins
        Paint.cracks(g, w, h, '#4c6a50', 10, 40, 1.2, 0.35, R);
      }, emit(g, w, h, p) {
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.062), y = FY(h, 0.56); const gr = g.createRadialGradient(x, y, 0, x, y, 9); gr.addColorStop(0, p.eye); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 10, y - 10, 20, 20); }
      } },
      robe(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.robeL, 0.5, p.robe, 1, p.robeD]);
        Paint.weave(g, w, h, '#000', 4, 0.08);
        // cloud-scroll damask
        g.strokeStyle = rgba(p.robeL, 0.45); g.lineWidth = 1.5;
        for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h; g.beginPath(); g.arc(x, y, 6, 0, PI * 1.5); g.arc(x + 8, y - 2, 4, PI, PI * 2.6); g.stroke(); }
        Paint.mottle(g, w, h, '#000', 14, 10, 40, 0.18, R);
      },
      robeTop(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.robeD, 0.4, p.robe, 1, p.robeL]); Paint.weave(g, w, h, '#000', 4, 0.08);
        // 補子 square badge at front centre (u .5, v .45)
        const cx = w * 0.5, cy = h * 0.55, s = w * 0.15;
        g.fillStyle = p.trim; g.fillRect(cx - s - 4, cy - s - 4, s * 2 + 8, s * 2 + 8);
        g.fillStyle = '#1a1730'; g.fillRect(cx - s, cy - s, s * 2, s * 2);
        g.strokeStyle = p.trim; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, s * 0.62, 0, TAU); g.stroke();
        g.fillStyle = '#f2f0e6'; g.beginPath(); g.arc(cx - 4, cy - 2, s * 0.35, PI * 0.2, PI * 1.6); g.quadraticCurveTo(cx + 10, cy + 10, cx + 12, cy - 6); g.fill(); // crane-ish
        g.fillStyle = p.tassel; g.beginPath(); g.arc(cx + 5, cy - 9, 3, 0, TAU); g.fill();
        // collar band & bead necklace (朝珠)
        g.fillStyle = p.robeD; g.fillRect(0, 0, w, h * 0.1);
        g.fillStyle = p.trim; g.fillRect(0, h * 0.1, w, 3);
        for (let i = 0; i < 18; i++) { const a = i / 17; const x = lerp(w * 0.36, w * 0.64, a), y = h * 0.12 + sin(a * PI) * h * 0.3; g.fillStyle = i % 6 === 0 ? '#c8242c' : '#c9a35a'; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
      },
      hem(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.robe, 0.6, mix(p.robe, p.robeL, 0.25), 1, p.robeD]); Paint.weave(g, w, h, '#000', 4, 0.08);
        g.strokeStyle = rgba(p.robeL, 0.4); g.lineWidth = 1.5;
        for (let i = 0; i < 18; i++) { const x = R() * w, y = R() * h * 0.6; g.beginPath(); g.arc(x, y, 6, 0, PI * 1.5); g.arc(x + 8, y - 2, 4, PI, PI * 2.6); g.stroke(); }
        // 海水江崖 wave hem (v 0..0.25)
        const y0 = h * 0.72;
        for (let k = 0; k < 5; k++) { g.strokeStyle = k % 2 ? p.trim : '#5aa0b8'; g.lineWidth = 3; g.beginPath(); for (let x = 0; x <= w; x += 4) g.lineTo(x, y0 + k * 11 + sin(x * 0.12 + k) * 4); g.stroke(); }
        g.fillStyle = p.trim; g.fillRect(0, h - 10, w, 6);
      },
      cuff(g, w, h, p) { Paint.fill(g, w, h, p.robe); g.fillStyle = p.trim; g.fillRect(0, 0, w, h * 0.12); g.fillRect(0, h * 0.2, w, 4); g.fillStyle = p.robeD; g.fillRect(0, h * 0.75, w, h * 0.25); },
      hat(g, w, h, p, R) { Paint.fill(g, w, h, p.hat); Paint.strokes(g, w, h, '#555', 120, 14, PI / 2, 1, 0.3, R); },
      tassel(g, w, h, p, R) { Paint.fill(g, w, h, p.tassel); Paint.strokes(g, w, h, shade(p.tassel, -0.4), 200, 60, PI / 2, 1.5, 0.6, R, 0.1); Paint.strokes(g, w, h, shade(p.tassel, 0.3), 80, 50, PI / 2, 1, 0.5, R, 0.1); },
      talis(g, w, h, p, R) {
        Paint.fill(g, w, h, p.talis); Paint.mottle(g, w, h, '#b88a2a', 20, 6, 24, 0.25, R);
        g.strokeStyle = p.ink; g.lineWidth = 7; g.lineCap = 'round';
        // stylised 敕令 talisman strokes
        const cx = w / 2;
        g.beginPath(); g.moveTo(cx - 40, 30); g.lineTo(cx + 40, 30); g.moveTo(cx, 18); g.lineTo(cx, 70); g.moveTo(cx - 30, 55); g.lineTo(cx + 30, 55); g.stroke();
        g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 34, 95); g.lineTo(cx + 34, 95); g.moveTo(cx - 25, 110); g.quadraticCurveTo(cx, 130, cx + 25, 110); g.stroke();
        g.beginPath(); for (let y = 140; y < 230; y += 12) { g.lineTo(cx + (y % 24 ? 22 : -22), y); } g.stroke();
        g.fillStyle = p.ink; g.fillRect(cx - 18, 236, 36, 14);
        g.strokeStyle = 'rgba(120,60,10,0.6)'; g.lineWidth = 3; g.strokeRect(6, 4, w - 12, h - 8);
      },
      boot(g, w, h, p) { Paint.fill(g, w, h, '#151515'); g.fillStyle = '#e8e2d2'; g.fillRect(0, h * 0.85, w, h * 0.15); },
      hair(g, w, h, p, R) { Paint.fill(g, w, h, '#16161a'); Paint.strokes(g, w, h, '#3a3a44', 120, 30, PI / 2, 1.2, 0.6, R, 0.2); },
      nail: (g, w, h) => Paint.vgrad(g, w, h, [0, '#3a3020', 1, '#a89870']),
      plume(g, w, h, p, R) {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#2c6a4a'; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.45, h * 0.48, 0, 0, TAU); g.fill();
        Paint.strokes(g, w, h, '#7ac8a0', 90, 40, PI / 2, 1.5, 0.6, R, 0.6);
        const cx = w / 2, cy = h * 0.72; // eye of the feather
        g.fillStyle = '#d9b45a'; g.beginPath(); g.ellipse(cx, cy, 34, 40, 0, 0, TAU); g.fill();
        g.fillStyle = '#1e5a8a'; g.beginPath(); g.ellipse(cx, cy, 24, 29, 0, 0, TAU); g.fill();
        g.fillStyle = '#101830'; g.beginPath(); g.ellipse(cx, cy + 3, 12, 15, 0, 0, TAU); g.fill();
      },
    },
    build(B, p) {
      const J = humanRig(B, { hip: 0.98, chest: 1.36, neck: 1.52, head: 1.58, shY: 1.44, sh: 0.2, up: 0.3, fore: 0.27, arm1: [0.12, 0.05, 1], arm2: [0, 0.02, 1], lx: 0.1, knee: 0.52 });
      B.bone('hat', 'head', [0, 1.86, -0.01]);
      B.bone('tal0', 'hat', [0, 1.8, 0.15]); B.bone('tal1', 'tal0', [0, 1.69, 0.17]); B.bone('tal2', 'tal1', [0, 1.57, 0.175]);
      B.bone('tas0', 'hat', [0, 1.95, 0]);
      B.bone('q0', 'head', [0, 1.66, -0.13]); B.bone('q1', 'q0', [0, 1.46, -0.17]); B.bone('q2', 'q1', [0, 1.25, -0.18]);
      B.bone('skirtF', 'hips', [0, 0.8, 0.12]); B.bone('skirtB', 'hips', [0, 0.8, -0.12]);
      // head + neck
      B.ell([0, 1.72, 0.01], [0.115, 0.14, 0.125], { w: 'head', slot: 'face', seg: 24, rings: 16 });
      B.tube([[0, 1.5, 0], [0, 1.62, 0.01]], 0.055, { w: 'neck', slot: 'skin', seg: 10 });
      // ears
      for (const s of [-1, 1]) B.ell([s * 0.115, 1.71, 0], [0.02, 0.035, 0.02], { w: 'head', slot: 'skin' });
      // hat: up-turned brim + crown + red tassel cone + finial
      B.lathe([[0.0, 1.81], [0.17, 1.79], [0.19, 1.83], [0.175, 1.88], [0.13, 1.86]], { w: 'hat', slot: 'hat', seg: 24 });
      B.lathe([[0.135, 1.82], [0.13, 1.9], [0.1, 1.95], [0.04, 1.98], [0.001, 1.985]], { w: 'hat', slot: 'tassel', seg: 24 });
      B.ell([0, 2.0, 0], [0.026, 0.03, 0.026], { w: 'hat', slot: 'lit', tint: '#e05050' });
      B.tube([[0, 1.98, 0], [0, 2.03, 0]], [0.01, 0.006], { w: 'hat', slot: 'hat', seg: 6 });
      // peacock feather plume (花翎) trailing back
      B.strip([[0, 1.9, -0.1], [0, 1.86, -0.24], [0, 1.78, -0.34]], [0.05, 0.07, 0.04], { w: 'hat', slot: 'plume', side: [1, 0, 0] });
      // talisman (spring)
      B.strip([[0, 1.82, 0.15], [0, 1.69, 0.165], [0, 1.57, 0.17], [0, 1.47, 0.165]], 0.1, { bones: ['tal0', 'tal1', 'tal2', 'tal2'], slot: 'talis', side: [1, 0, 0], sub: 3 });
      // queue braid
      B.tube([[0, 1.68, -0.12], [0, 1.46, -0.17], [0, 1.25, -0.18], [0, 1.12, -0.17]], [0.03, 0.026, 0.02, 0.008], { bones: ['q0', 'q1', 'q2', 'q2'], slot: 'hair', seg: 6, twist: 30 });
      // torso
      B.lathe([[0.17, 0.95], [0.2, 1.1], [0.22, 1.3], [0.215, 1.42], [0.15, 1.5], [0.06, 1.53]], { w: B.keyW([[1.0, 'hips'], [1.2, 'spine'], [1.35, 'chest']]), slot: 'robeTop', seg: 22, flat: [1, 0.78] });
      // long robe skirt: flared, front/back panels on skirt bones (cloth springs), legs drive the sides
      B.lathe([[0.27, 0.07], [0.255, 0.3], [0.23, 0.6], [0.2, 0.88], [0.175, 1.0]], {
        slot: 'hem', seg: 24, flat: [1, 0.85], ao: [0, 0.4, 0.75],
        w: (x, y, z) => {
          const hy = sm(0.6, 1.0, y); const side = x > 0 ? 'L' : 'R';
          const lw = (1 - hy) * min(1, abs(x) / 0.12) * 0.6;
          const fw = (1 - hy) * max(0, z) / 0.25 * 0.8, bw = (1 - hy) * max(0, -z) / 0.25 * 0.8;
          return [['hips', hy + 0.15], ['knee' + side, lw], ['skirtF', fw], ['skirtB', bw]];
        },
      });
      // boots peeking out
      for (const [s, S] of SIDES) B.ell([s * 0.1, 0.06, 0.05], [0.07, 0.06, 0.12], { w: 'foot' + S, slot: 'boot', th0: 0, thLen: PI * 0.55 });
      // arms with wide sleeves + cuffs, gnarled hands
      for (const [s, S] of SIDES) {
        limb(B, J['sh' + S], J['el' + S], J['hand' + S], (u) => 0.075 + u * 0.04, ['sh' + S, 'arm' + S, 'hand' + S], { slot: 'robe', cap1: false });
        B.tube([v3(J['hand' + S], [0, 0, -0.08]), v3(J['hand' + S], [0, 0, -0.01])], [0.11, 0.115], { w: 'arm' + S, slot: 'cuff', seg: 14, cap1: 0.25 });
        B.tube([v3(J['hand' + S], [0, 0, -0.04]), v3(J['hand' + S], [0, -0.005, 0.04])], [0.04, 0.035], { w: 'hand' + S, slot: 'skin', seg: 8 });
        claw(B, S, s, v3(J['hand' + S], [0, -0.01, 0.03]), [0, -0.25, 1], { size: 0.055, curl: 0.35, nailLen: 0.9, nailSlot: 'nail' });
      }
    },
    slotsExtra: null,
    springs: [
      { chain: ['tal0', 'tal1', 'tal2'], tip: [0, -0.1, 0], k: 90, d: 7, g: 1.2, wind: 1.2, max: 0.6 },
      { chain: ['q0', 'q1', 'q2'], tip: [0, -0.13, 0.01], k: 60, d: 7, g: 3, max: 0.9 },
      { chain: ['skirtF'], tip: [0, -0.6, 0.1], k: 120, d: 10, g: 0.5, max: 0.4 },
      { chain: ['skirtB'], tip: [0, -0.6, -0.1], k: 120, d: 10, g: 0.5, max: 0.4 },
    ],
    fx: {
      miasma: { n: 16, rate: 5, at: [0, 0.1, 0], box: [0.6, 0.1, 0.5], vel: [0, 0.15, 0], velR: [0.08, 0.05, 0.08], life: [1.5, 2.6], size: [0.25, 0.4], grow: 1.2, color: ['#7dd88a', '#2e5a40'], alpha: 0.25, add: false },
      cast: { n: 40, rate: 0, burstRate: 40, bone: 'head', at: [0, 0.07, 0.12], vel: [0, 0.05, 0.9], velR: [0.15, 0.12, 0.2], life: [0.8, 1.4], size: [0.12, 0.25], grow: 2.5, color: ['#c8ff9a', '#3a7a40'], alpha: 0.55, add: false, drag: 1.2 },
      death: { n: 40, rate: 0, burstRate: 30, at: [0, 1.0, 0], box: [0.5, 1.6, 0.4], vel: [0, 0.6, 0], velR: [0.3, 0.3, 0.3], life: [1, 1.8], size: [0.05, 0.1], color: ['#fff2a0', '#6aff8a'], twinkle: 9, shape: 3 },
      ash: { n: 24, rate: 0, burstRate: 18, at: [0, 1.65, 0.15], box: [0.1, 0.3, 0.05], vel: [0, 0.4, 0.2], velR: [0.4, 0.3, 0.3], life: [1.2, 2], size: [0.06, 0.09], color: ['#f2d36a', '#4a3a2a'], add: false, shape: 1, g: -0.2, swirl: 4, swirlA: 0.8 },
    },
    slotsPlume: true,
    clips: {
      idle(P, t, k, C) {
        breathe(P, t, 0.4);
        // stiff, corpse-like: occasional neck twitch, slight teeter on the heels
        const tw = Math.pow(max(0, sin(t * 0.9)), 30);
        P.r('head', 0.05 + tw * 0.15, sin(t * 0.37) * 0.1, tw * 0.2).r('neck', 0, 0, -tw * 0.1);
        P.rootM(0, 0, 0, sin(t * 1.1) * 0.025, 0, sin(t * 0.8) * 0.015);
        for (const [s, S] of SIDES) P.r('sh' + S, sin(t * 1.3 + s) * 0.03, 0, 0).r('hand' + S, sin(t * 2.1 + s) * 0.06, 0, 0);
        P.r('handL', 0, 0, 0);
      },
      // hop: crouch-anticipate → spring up (stretched) → land squash; feet together, arms rigid
      move(P, ph, k, C) {
        const u = ph % 1, H = 1.95;
        const air = sm(0.15, 0.3, u) * (1 - sm(0.75, 0.9, u));
        const y = sin(seg(u, 0.2, 0.85) * PI) * 0.22 * H;
        const crouch = bump(u, 0, 0.22) + bump(u, 0.82, 1.0) * 0.7;
        P.rootM(0, y - crouch * 0.03 * H, 0, 0.06 * air - 0.04 * crouch, 0, 0, 0.07 * air - 0.09 * crouch);
        for (const [s, S] of SIDES) { P.r('leg' + S, -0.25 * crouch, 0, 0).r('knee' + S, 0.5 * crouch, 0, 0).r('foot' + S, -0.25 * crouch + 0.3 * air, 0, 0); P.r('sh' + S, -0.08 * air + 0.06 * crouch, 0, 0); }
        P.r('head', -0.06 * air + 0.08 * crouch);
      },
      // lunge-hop at the target, arms stabbing forward, nails rake down
      attack(P, t, k, C) {
        const A = atk(k, 0.3, 0.45, 0.68), H = 1.95;
        const air = bump(k, 0.28, 0.52);
        P.rootM(0, air * 0.16 * H - A.a * 0.04 * H, (0.26 * A.s - 0.05 * A.a) * H, 0.2 * A.s - 0.08 * A.a, 0, 0, -0.12 * A.a + 0.08 * air);
        for (const [s, S] of SIDES) {
          P.r('sh' + S, -0.5 * A.a + 0.35 * A.s, 0, 0).r('arm' + S, 0, 0, 0).r('hand' + S, 0.5 * A.a - 0.4 * A.s, 0, 0);
          P.r('leg' + S, -0.35 * A.a, 0, 0).r('knee' + S, 0.7 * A.a, 0, 0);
        }
        P.r('head', -0.2 * A.a + 0.25 * A.s).r('chest', 0.1 * A.s);
      },
      // corpse breath: rear back, swell, exhale green miasma
      cast(P, t, k, C) {
        const inh = sm(0, 0.35, k) * (1 - sm(0.4, 0.5, k)), ex = sm(0.38, 0.5, k) * (1 - sm(0.85, 1, k));
        P.r('chest', -0.25 * inh + 0.2 * ex).r('head', -0.45 * inh + 0.3 * ex).s('chest', 0.08 * inh, 0.05 * inh, 0.1 * inh);
        P.rootM(0, 0, 0, -0.08 * inh + 0.06 * ex);
        P.ch('fx_cast', ex); P.ch('glow', ex * 1.5);
        for (const [s, S] of SIDES) P.r('sh' + S, -0.25 * inh, 0, 0);
      },
      // double hop slam with shockwave
      special(P, t, k, C) {
        const H = 1.95; const h1 = bump(k, 0.05, 0.35), h2 = bump(k, 0.4, 0.75);
        const land = bump(k, 0.72, 0.85);
        P.rootM(0, (h1 * 0.25 + h2 * 0.45) * H - land * 0.06 * H, (0.15 * sm(0, 0.35, k) + 0.25 * sm(0.4, 0.75, k)) * H * (1 - sm(0.85, 1, k)), 0.15 * h2, 0, 0, 0.1 * (h1 + h2) - 0.15 * land);
        for (const [s, S] of SIDES) P.r('sh' + S, -0.3 * h2 + 0.3 * land, 0, 0).r('knee' + S, 0.6 * land, 0, 0).r('leg' + S, -0.3 * land, 0, 0);
        P.ch('fx_miasma', land * 6); P.ch('glow', land * 2);
      },
      hurt(P, t, k, C) { GEN.hurt(P, t, k, C); const u = (1 - E.outQ(k)) * min(1, k * 14); P.r('head', -0.4 * u, 0, 0.3 * u); P.ch('fx_ash', u * 2); },
      // topples backwards stiff as a plank, talisman burns away
      die(P, t, k, C) {
        const u = E.inQ(seg(k, 0.05, 0.5)), H = 1.95, bounce = bump(k, 0.5, 0.6) * 0.05;
        P.rootM(0, bounce * H, -0.25 * H * u, -1.45 * u + bounce, 0, 0.08 * u);
        P.r('head', 0.3 * seg(k, 0.5, 0.7));
        P.ch('fx_ash', bump(k, 0, 0.4) * 3);
        P.ch('dissolve', E.inQ(seg(k, 0.55, 1))); P.ch('fx_death', bump(k, 0.55, 1) * 2);
      },
      // rises from lying stiffly (classic plank rise), dust of miasma
      enter(P, t, k, C) {
        const u = 1 - E.outBack(seg(k, 0.1, 0.7)), H = 1.95;
        P.rootM(0, 0, -0.2 * H * u, -1.5 * clamp(u, 0, 1.2), 0, 0);
        P.ch('dissolve', 1 - sm(0, 0.25, k)); P.ch('fx_miasma', bump(k, 0, 0.6) * 5);
      },
    },
    dur: { attack: 1.0, cast: 1.6, special: 1.5, die: 2.0, enter: 1.4 },
    cadence: 0.55,
  });
  K.H = { humanRig, limb, claw, breathe, FX, FY, v3, nrm, SIDES };
})();

// ----------------------------------------------------------------------------------------------------- batch: shore & mine spirits
(() => {
  const K = G.Mon3D.kit, defC = G.Mon3D._defC;
  const { Paint, GEN, E, atk, bump, seg, sm, clamp, lerp, shade, mix, rgba } = K;
  const { humanRig, limb, claw, breathe, FX, FY, v3, nrm, SIDES } = K.H;
  const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;

  // ===================================================================================================
  // 海霧魂 sea_wisp — a sea-mist soul that hasn't remembered its name: translucent teardrop of mist with a curling
  // tail, a pale glowing core and a faint, sad face; motes orbit it. Dream tutorial enemy — gentle, eerie-beautiful.
  defC('sea_wisp', {
    height: 1.5, fill: 0.95, radius: 0.4, shadow: 0.42, shadowA: 0.55, outline: false, cast: false, ghostCol: '#bff8ff',
    pal: { body: '#a8eef2', deep: '#2c7e9c', core: '#f2ffff', eye: '#0d2f45', glow: '#6fe6ff', line: '#3d9fb8', magic: '#7ff0ff' },
    vars: [{ h: 55, s: 1.1 }, { h: -165, s: 1.3, l: -0.03 }],
    slots: {
      mist(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.core, 0.5, p.body, 1, p.deep]); Paint.mottle(g, w, h, p.core, 30, 10, 40, 0.4, R); Paint.mottle(g, w, h, p.deep, 20, 10, 40, 0.3, R);
        g.strokeStyle = rgba(p.core, 0.5); g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); const y = R() * h; for (let x = 0; x <= w; x += 8) g.lineTo(x, y + sin(x * 0.05 + i) * 10); g.stroke(); } },
      eye(g, w, h, p) { Paint.fill(g, w, h, p.eye); g.fillStyle = rgba(p.core, 0.95); g.beginPath(); g.arc(w * 0.42, h * 0.38, w * 0.08, 0, TAU); g.fill(); },
      core: { size: 1, paint: (g, w, h, p) => Paint.fill(g, w, h, p.core), emit: (g, w, h, p) => Paint.fill(g, w, h, shade(p.glow, -0.55)) },
    },
    build(B, p) {
      B.bone('body', 'root', [0, 0.95, 0]);
      B.bone('head', 'body', [0, 1.15, 0.05]);
      B.bone('t0', 'body', [0, 0.72, -0.08]); B.bone('t1', 't0', [0, 0.5, -0.3]); B.bone('t2', 't1', [0, 0.42, -0.58]); B.bone('t3', 't2', [0, 0.55, -0.8]);
      // translucent shell: teardrop lathe with tail drawn back
      const prof = []; for (let i = 0; i <= 14; i++) { const u = i / 14; const y = lerp(0.58, 1.52, u); const r = sin(Math.pow(u, 0.75) * PI) * 0.42 * (0.55 + 0.45 * u) + 0.02; prof.push([r, y]); }
      B.lathe(prof, { layer: 'ghost', slot: 'mist', seg: 26, w: B.keyW([[0.7, 't0'], [0.95, 'body'], [1.2, 'head']]), deform: (v) => { const d = sm(1.0, 0.58, v.y); v.z -= d * d * 0.35; } });
      // tail (ghost) — curls up behind like a wave crest
      B.tube([[0, 0.72, -0.05], [0, 0.5, -0.3], [0, 0.42, -0.58], [0, 0.55, -0.8], [0, 0.72, -0.86]], [0.3, 0.2, 0.13, 0.07, 0.015], { layer: 'ghost', slot: 'mist', bones: ['t0', 't1', 't2', 't3', 't3'], seg: 14, sub: 4 });
      // inner core (opaque, softly emissive) gives the shell depth
            B.ell([0, 1.0, 0], [0.3, 0.36, 0.27], { w: 'body', slot: 'core', layer: 'glow', seg: 14, rings: 10, tint: '#14282c' });
      // faint face (opaque dark eyes + mouth inside the shell front)
      for (const [s, S] of SIDES) B.eye('eye' + S, 'head', [s * 0.11, 1.2, 0.34], 0.036, { ry: 1.45, rz: 0.3, rot: [0, s * 0.3, 0] });
      B.ell([0, 1.06, 0.37], [0.024, 0.034, 0.012], { w: 'head', slot: 'eye', outline: false });
    },
    springs: [{ chain: ['t0', 't1', 't2', 't3'], tip: [0, 0.17, -0.06], k: 40, d: 5, g: 0, wind: 2.5, max: 0.8 }],
    fx: {
      motes: { n: 14, rate: 5, at: [0, 1.05, 0], ring: 0.75, box: [0, 0.6, 0], vel: [0, 0.12, 0], velR: [0.05, 0.08, 0.05], life: [1.6, 2.8], size: [0.07, 0.12], color: ['#e8ffff', '#6fe6ff'], swirl: 1.5, swirlA: 0.6, twinkle: 7 },
      mist: { n: 14, rate: 4, bone: 't3', box: [0.2, 0.15, 0.2], vel: [0, 0.08, -0.2], velR: [0.1, 0.05, 0.1], life: [1.5, 2.5], size: [0.3, 0.45], grow: 1.5, color: ['#bff8ff', '#3d9fb8'], alpha: 0.22, add: false },
      cast: { n: 30, rate: 0, burstRate: 30, at: [0, 1.0, 0], ring: 0.9, box: [0, 1.0, 0], vel: [0, 0.6, 0], velR: [0.1, 0.2, 0.1], life: [0.8, 1.3], size: [0.06, 0.12], color: ['#ffffff', '#7ff0ff'], swirl: 3, swirlA: 2, shape: 3 },
      death: { n: 40, rate: 0, burstRate: 40, at: [0, 1.0, 0], box: [0.6, 0.8, 0.5], vel: [0, 0.5, 0], velR: [0.4, 0.3, 0.4], life: [1, 2], size: [0.2, 0.4], grow: 1.5, color: ['#e8ffff', '#3d9fb8'], alpha: 0.35, add: false, drag: 1.5 },
    },
    lights: () => [{ bone: 'body', at: [0, 0.1, 0], color: '#7fe8ff', i: 0.9, r: 3, flicker: 0.05 }],
    clips: {
      idle(P, t) {
        P.rootM(0, sin(t * 1.8) * 0.06, 0, sin(t * 1.1) * 0.04, sin(t * 0.5) * 0.15, sin(t * 1.3) * 0.05, sin(t * 2.3) * 0.03);
        P.r('head', sin(t * 0.9) * 0.08, sin(t * 0.6) * 0.15).s('body', sin(t * 2.3) * 0.03, -sin(t * 2.3) * 0.03);
        P.r('t1', 0, sin(t * 1.6) * 0.3).r('t2', 0, sin(t * 1.6 - 0.8) * 0.35).r('t3', sin(t * 1.3) * 0.2, sin(t * 1.6 - 1.6) * 0.4);
      },
      move(P, ph) { P.rootM(0, 0.1 + sin(ph * TAU) * 0.05, 0, 0.25, 0, 0, 0.05); P.s('body', -0.05, 0.08, 0.05); P.r('t1', -0.3).r('t2', -0.2); },
      // drift back, then a quick lunging touch that stretches toward the target
      attack(P, t, k) {
        const A = atk(k, 0.35, 0.48, 0.65);
        P.rootM(0, 0.05 * A.a, -0.15 * A.a + 0.55 * A.s, -0.15 * A.a + 0.35 * A.s);
        P.s('body', 0.08 * A.a - 0.1 * A.s, -0.08 * A.a + 0.2 * A.s, -0.1 * A.s + 0.25 * A.s);
        P.r('t0', 0.3 * A.s).r('t1', 0.4 * A.s);
        P.ch('glow', A.s * 0.8);
      },
      // mist veil: swell, spin motes, brighten
      cast(P, t, k) {
        const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k));
        P.rootM(0, 0.15 * u, 0, 0, t * 3 * u, 0); P.s('body', 0.15 * u, 0.1 * u, 0.15 * u);
        P.ch('glow', 1.5 * u); P.ch('fx_cast', u); P.ch('fx_mist', u * 2);
      },
      special(P, t, k, C) { this.attack(P, t, k, C); P.ch('fx_cast', bump(k, 0.4, 0.8)); },
      hurt(P, t, k) { const u = (1 - E.outQ(k)) * min(1, k * 14); P.rootM(sin(t * 50) * 0.03 * u, 0, -0.2 * u, -0.3 * u); P.s('body', 0.15 * u, -0.2 * u, 0.15 * u); P.s('eyeL', 0, -0.6 * u).s('eyeR', 0, -0.6 * u); },
      die(P, t, k) { const u = E.ioQ(seg(k, 0, 0.6)); P.rootM(0, 0.3 * u, 0, 0, u * 2, 0); P.s('body', 0.3 * u, 0.2 * u, 0.3 * u); P.ch('fade', E.inQ(seg(k, 0.2, 0.9))); P.ch('dissolve', E.inQ(seg(k, 0.15, 0.85))); P.ch('fx_death', bump(k, 0, 0.6) * 2); },
      enter(P, t, k) { const u = 1 - E.outC(seg(k, 0, 0.8)); P.rootM(0, -0.3 * u, 0, 0, u * 2, 0); P.s('body', -0.5 * u, 0.4 * u, -0.5 * u); P.ch('fade', u); P.ch('fx_mist', bump(k, 0, 0.7) * 3); },
    },
    dur: { attack: 1.1, cast: 1.6, die: 1.8 },
    shadowZ: 1,
  });

  // ===================================================================================================
  // 水鬼 water_ghost — drowned man seeking a 替身: hunched, ragged sea-soaked robe, seaweed hair hanging over the face
  // (spring strands), pale-green clammy skin, long reaching arm with webbed claws, constant dripping; stands in a
  // puddle that ripples.
  defC('water_ghost', {
    height: 1.75, fill: 0.9, radius: 0.35, shadow: 0.4, rimColor: '#b8fff0', ghostCol: '#8ff0e0',
    pal: { skin: '#a7d3c6', skinD: '#5f9a93', skinL: '#e2f6ee', robe: '#2f5157', robeD: '#16282f', robeL: '#5d8a88', hair: '#1d3d2c', hairL: '#4f8a55', eye: '#e9ffd2', water: '#7fd7d9', line: '#173339', magic: '#62e0d6' },
    vars: [{ h: 40, s: 1.1 }, { h: -150, s: 1.15, l: -0.04, keep: ['eye'] }],
    slots: {
      skin(g, w, h, p, R) { Paint.fill(g, w, h, p.skin); Paint.mottle(g, w, h, p.skinD, 50, 6, 26, 0.35, R); Paint.mottle(g, w, h, p.skinL, 20, 6, 20, 0.3, R); Paint.cracks(g, w, h, shade(p.skinD, -0.2), 14, 50, 1, 0.35, R); },
      face: { size: 4, paint(g, w, h, p, R) {
        Paint.fill(g, w, h, p.skin); Paint.mottle(g, w, h, p.skinD, 70, 8, 40, 0.3, R); Paint.mottle(g, w, h, p.skinL, 30, 8, 30, 0.3, R);
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.065), y = FY(h, 0.55);
          const gr = g.createRadialGradient(x, y, 2, x, y, 36); gr.addColorStop(0, 'rgba(10,30,30,0.95)'); gr.addColorStop(1, 'rgba(10,30,30,0)'); g.fillStyle = gr; g.fillRect(x - 40, y - 40, 80, 80);
          g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 9, 6, 0, 0, TAU); g.fill(); g.fillStyle = '#0a1a14'; g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.fill(); }
        const mx = FX(w, 0.5), my = FY(h, 0.38);
        g.fillStyle = '#0c1e1e'; g.beginPath(); g.ellipse(mx, my, 20, 12, 0, 0, TAU); g.fill(); // gaping mouth
        g.fillStyle = '#d8e8d8'; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(mx + i * 5 - 2, my - 10); g.lineTo(mx + i * 5 + 2, my - 10); g.lineTo(mx + i * 5, my - 4); g.fill(); }
        Paint.strokes(g, w, h, p.skinD, 40, 30, PI / 2, 1, 0.3, R);
      }, emit(g, w, h, p) { for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.065), y = FY(h, 0.55); const gr = g.createRadialGradient(x, y, 0, x, y, 12); gr.addColorStop(0, p.eye); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 12, y - 12, 24, 24); } } },
      robe(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.robeL, 0.6, p.robe, 1, p.robeD]); Paint.weave(g, w, h, '#000', 5, 0.1);
        Paint.mottle(g, w, h, p.robeD, 30, 10, 40, 0.4, R); Paint.mottle(g, w, h, '#a8d0a0', 12, 4, 14, 0.3, R); // barnacle / salt stains
        Paint.strokes(g, w, h, p.robeD, 40, 50, PI / 2, 2, 0.35, R, 0.2); // wet streaks
        g.clearRect(0, h - 4, w, 4); Paint.hem(g, w, h, '#000', h * 0.92, 18, R, 1); g.globalCompositeOperation = 'destination-out'; Paint.hem(g, w, h, '#000', h * 0.94, 20, R, 1); g.globalCompositeOperation = 'source-over';
      },
      rag(g, w, h, p, R) { g.clearRect(0, 0, w, h); g.fillStyle = p.robe; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); for (let x = w; x >= 0; x -= 10) g.lineTo(x, h * (0.7 + R() * 0.3)); g.closePath(); g.fill(); Paint.strokes(g, w, h, p.robeD, 30, 60, PI / 2, 2, 0.5, R, 0.1); },
      weed(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.hair, 1, shade(p.hair, -0.3)]); g.globalCompositeOperation = 'destination-out'; for (let x = 0; x < w; x += 18) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 9, h * (0.75 + R() * 0.2)); g.lineTo(x + 18, h); g.fill(); } g.globalCompositeOperation = 'source-over'; for (let i = 0; i < 9; i++) { const x0 = (i + 0.5) * w / 9; g.strokeStyle = i % 3 ? p.hair : p.hairL; g.lineWidth = 8 + R() * 6; g.beginPath(); g.moveTo(x0, 0); for (let y = 0; y <= h; y += 16) g.lineTo(x0 + sin(y * 0.05 + i) * 6, y); g.stroke(); }
        Paint.strokes(g, w, h, p.hairL, 60, 20, PI / 2, 1, 0.6, R, 0.2); },
      puddle(g, w, h, p) { g.clearRect(0, 0, w, h); const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, rgba(p.robeD, 0.85)); gr.addColorStop(0.75, rgba(p.robeD, 0.6)); gr.addColorStop(1, rgba(p.robeD, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = rgba(p.water, 0.8); g.lineWidth = 3; for (const r of [0.22, 0.34, 0.44]) { g.beginPath(); g.arc(w / 2, h / 2, w * r, 0, TAU); g.stroke(); } },
      nail: (g, w, h) => Paint.vgrad(g, w, h, [0, '#20302c', 1, '#90a890']),
    },
    build(B, p) {
      const J = humanRig(B, { hip: 0.92, chest: 1.28, neck: 1.42, head: 1.47, headZ: 0.1, neckZ: 0.06, chestZ: 0.02, shY: 1.34, sh: 0.19, up: 0.3, fore: 0.3, arm1: [0.12, -0.45, 1], arm2: [0.02, -0.3, 1], lx: 0.1, knee: 0.5 });
      // hair strands (spring chains) — two over the face, three down the back
      const hairs = [[-0.07, 0.11, 0.02], [0.08, 0.11, -0.02], [-0.1, -0.02, -0.1], [0.1, -0.02, -0.1], [0, 0.02, -0.12]];
      hairs.forEach((hv, i) => { const b0 = [hv[0], 1.66, 0.12 + hv[2]]; B.bone('h' + i + 'a', 'head', b0); B.bone('h' + i + 'b', 'h' + i + 'a', [hv[0] * 1.3, 1.45, 0.12 + hv[2] + hv[1] * 0.6]); B.bone('h' + i + 'c', 'h' + i + 'b', [hv[0] * 1.4, 1.22, 0.12 + hv[2] + hv[1] * 0.7]); });
      B.bone('ragF', 'hips', [0, 0.55, 0.15]); B.bone('ragB', 'hips', [0, 0.55, -0.15]);
      // head
      B.ell([0, 1.58, 0.12], [0.11, 0.135, 0.12], { w: 'head', slot: 'face', seg: 22, rings: 14 });
      B.ell([0, 1.62, 0.09], [0.125, 0.12, 0.13], { w: 'head', slot: 'weed', th0: 0, thLen: PI * 0.55, seg: 18, rings: 8, outline: false });
      B.tube([[0, 1.36, 0.02], [0, 1.5, 0.1]], 0.05, { w: 'neck', slot: 'skin', seg: 8 });
      hairs.forEach((hv, i) => {
        const pa = [hv[0], 1.66, 0.12 + hv[2]], pb = [hv[0] * 1.3, 1.45, 0.12 + hv[2] + hv[1] * 0.6], pc = [hv[0] * 1.4, 1.22, 0.12 + hv[2] + hv[1] * 0.7], pd = [hv[0] * 1.4, 1.02, 0.12 + hv[2] + hv[1] * 0.75];
        B.strip([pa, pb, pc, pd], [0.09, 0.08, 0.06, 0.03], { bones: ['h' + i + 'a', 'h' + i + 'b', 'h' + i + 'c', 'h' + i + 'c'], slot: 'weed', side: [1, 0, hv[1] > 0.05 ? 0 : 0.3] });
      });
      // hunched torso + robe
      B.lathe([[0.16, 0.9], [0.19, 1.05], [0.21, 1.22], [0.2, 1.34], [0.13, 1.42], [0.05, 1.45]], { w: B.keyW([[0.95, 'hips'], [1.12, 'spine'], [1.28, 'chest']]), slot: 'robe', seg: 20, flat: [1, 0.8], deform: (v) => { v.z += sm(1.0, 1.4, v.y) * 0.06; } });
      B.lathe([[0.27, 0.05], [0.25, 0.3], [0.22, 0.6], [0.18, 0.95]], { slot: 'robe', seg: 22, flat: [1, 0.85], ao: [0, 0.5, 0.7],
        w: (x, y, z) => { const hy = sm(0.55, 0.95, y), S = x > 0 ? 'L' : 'R'; return [['hips', hy + 0.1], ['knee' + S, (1 - hy) * min(1, abs(x) / 0.12) * 0.6], ['ragF', (1 - hy) * max(0, z) / 0.22], ['ragB', (1 - hy) * max(0, -z) / 0.22]]; } });
      // tattered rag panels
      for (const [x, z, b] of [[0.0, 0.2, 'ragF'], [0.14, 0.13, 'ragF'], [-0.12, -0.18, 'ragB'], [0.1, -0.2, 'ragB']]) B.strip([[x, 0.4, z], [x * 1.1, 0.15, z * 1.15], [x * 1.15, -0.02, z * 1.2]], [0.12, 0.11, 0.08], { bones: [b, b, b], slot: 'rag', side: [abs(z) > 0.15 ? 1 : 0.4, 0, abs(z) > 0.15 ? 0 : -0.9] });
      // bare feet
      for (const [s, S] of SIDES) B.ell([s * 0.1, 0.04, 0.06], [0.05, 0.035, 0.1], { w: 'foot' + S, slot: 'skin' });
      // arms: torn sleeve to elbow, bony forearm, webbed claws
      for (const [s, S] of SIDES) {
        limb(B, J['sh' + S], J['el' + S], v3(J['el' + S], nrm([0.05 * s, -0.1, 1]), 0.06), [0.07, 0.075, 0.085], ['sh' + S, 'arm' + S, 'arm' + S], { slot: 'robe', cap1: false });
        limb(B, J['el' + S], v3(J['el' + S], v3([0, 0, 0], nrm([0.05 * s, -0.1, 1]), 0.14), 1), J['hand' + S], [0.045, 0.04, 0.032], ['arm' + S, 'arm' + S, 'hand' + S], { slot: 'skin' });
        claw(B, S, s, J['hand' + S], [0.05, -0.15, 1], { size: 0.06, curl: 0.7, nailLen: 0.8, nailSlot: 'nail' });
      }
      // puddle (ghost layer disc, flat)
      const pd = new THREE.CircleGeometry(0.55, 28); pd.rotateX(-PI / 2);
      B.geo(pd, { at: [0, 0.015, 0.05], slot: 'puddle', layer: 'ghost', w: 'root', smooth: false });
    },
    springs: [0, 1, 2, 3, 4].map((i) => ({ chain: ['h' + i + 'a', 'h' + i + 'b', 'h' + i + 'c'], tip: [0, -0.2, 0.02], k: 70, d: 7, g: 3, max: 0.8 }))
      .concat([{ chain: ['ragF'], tip: [0, -0.5, 0.05], k: 90, d: 8, g: 1, max: 0.5 }, { chain: ['ragB'], tip: [0, -0.5, -0.05], k: 90, d: 8, g: 1, max: 0.5 }]),
    fx: {
      drips: { n: 24, rate: 9, at: [0, 1.0, 0.1], box: [0.5, 0.8, 0.35], vel: [0, -0.2, 0], velR: [0.02, 0.1, 0.02], g: 6, life: [0.4, 0.7], size: [0.035, 0.05], color: ['#c8ffff', '#7fd7d9'], shape: 2, alpha: 0.8, floor: 0.02 },
      ripple: { n: 6, rate: 1.5, at: [0, 0.03, 0.05], box: [0.6, 0, 0.5], vel: [0, 0, 0], velR: [0, 0, 0], life: [1, 1.4], size: [0.15, 0.2], grow: 4, color: '#9ff0f0', alpha: 0.35 },
      cast: { n: 30, rate: 0, burstRate: 40, at: [0, 0.1, 0.4], box: [0.9, 0.1, 0.6], vel: [0, 1.6, 0], velR: [0.3, 0.5, 0.3], g: 4, life: [0.6, 1.0], size: [0.05, 0.09], color: ['#e0ffff', '#4ab0c8'], shape: 2 },
      death: { n: 40, rate: 0, burstRate: 40, at: [0, 0.8, 0], box: [0.5, 1.4, 0.4], vel: [0, -0.3, 0], velR: [0.2, 0.3, 0.2], g: 3, life: [0.6, 1.2], size: [0.04, 0.07], color: ['#e0ffff', '#4ab0c8'], shape: 2, floor: 0.02 },
    },
    clips: {
      idle(P, t) {
        breathe(P, t, 1.2);
        P.r('spine', 0.18 + sin(t * 0.8) * 0.03).r('chest', 0.12).r('head', -0.15 + sin(t * 0.6) * 0.06, sin(t * 0.45) * 0.2, sin(t * 0.7) * 0.05);
        P.rootM(0, 0, 0, 0, 0, sin(t * 1.1) * 0.03);
        P.r('shL', sin(t * 1.4) * 0.08, 0, sin(t * 0.9) * 0.05).r('armL', sin(t * 1.9) * 0.1).r('handL', sin(t * 2.6) * 0.15);
        P.r('shR', -0.1 + sin(t * 1.2 + 1) * 0.05).r('armR', sin(t * 1.5) * 0.08).r('handR', sin(t * 2.2) * 0.12);
      },
      // shambling, dragging gait
      move(P, ph) {
        const a = sin(ph * TAU);
        for (const [s, S] of SIDES) { P.r('leg' + S, -0.35 * a * s).r('knee' + S, max(0, 0.6 * a * s)); P.r('sh' + S, 0.15 * a * s); }
        P.rootM(0, abs(cos(ph * TAU)) * 0.02, 0, 0.12, 0, a * 0.06); P.r('spine', 0.08).r('head', 0, 0, -a * 0.08);
      },
      // grab-and-drag (抓交替): lean back, lunge with both claws, pull back toward the water
      attack(P, t, k) {
        const A = atk(k, 0.3, 0.44, 0.64), pull = bump(k, 0.55, 0.9);
        P.rootM(0, 0, (-0.06 * A.a + 0.32 * A.s - 0.1 * pull), -0.1 * A.a + 0.25 * A.s);
        for (const [s, S] of SIDES) P.r('sh' + S, -0.9 * A.a + 0.7 * A.s + 0.3 * pull, 0, s * 0.2 * A.a).r('arm' + S, -0.4 * A.a + 0.1 * A.s).r('hand' + S, 0.6 * A.s);
        P.r('head', -0.2 * A.a + 0.3 * A.s).r('chest', -0.15 * A.a + 0.2 * A.s);
      },
      // tide call: arms raised, water fountains up from the puddle
      cast(P, t, k) {
        const u = sm(0, 0.35, k) * (1 - sm(0.85, 1, k));
        for (const [s, S] of SIDES) P.r('sh' + S, -1.4 * u, 0, s * 0.4 * u).r('hand' + S, sin(t * 8 + s) * 0.3 * u);
        P.r('head', -0.4 * u).r('chest', -0.2 * u); P.rootM(0, 0.05 * u);
        P.ch('fx_cast', u); P.ch('fx_ripple', u * 3); P.ch('glow', u);
      },
      special(P, t, k, C) { this.attack(P, t, k, C); P.ch('fx_cast', bump(k, 0.4, 0.8)); },
      hurt(P, t, k, C) { GEN.hurt(P, t, k, C); P.ch('fx_drips', (1 - k) * 4); },
      // collapses into a puddle of sea water
      die(P, t, k) {
        const u = E.inQ(seg(k, 0, 0.6));
        P.rootM(0, -0.45 * u, -0.1 * u, 0.25 * u, 0, 0.1 * u, -0.35 * u); P.r('head', 0.4 * u);
        for (const [s, S] of SIDES) P.r('sh' + S, 0.5 * u);
        P.ch('dissolve', E.inQ(seg(k, 0.2, 1))); P.ch('fx_death', bump(k, 0.1, 0.8) * 2);
      },
      // rises out of the water
      enter(P, t, k) { const u = 1 - E.outC(seg(k, 0, 0.8)); P.rootM(0, -1.2 * u, 0, 0.3 * u); P.ch('fx_cast', bump(k, 0, 0.6)); P.ch('fx_ripple', bump(k, 0, 0.8) * 4); },
    },
    dur: { attack: 1.1, cast: 1.5, die: 1.8, enter: 1.4 },
    cadence: 0.8,
  });

  // ===================================================================================================
  // 鬼燈籠 ghost_lantern — a forgotten eave lantern possessed by a stranger's blue flame: torn red paper on bamboo ribs,
  // glowing slit eyes and a jagged grin cut in the paper, a long licking tongue, tassel swinging below.
  defC('ghost_lantern', {
    height: 1.75, fill: 0.92, radius: 0.35, shadow: 0.35, shadowA: 0.6, rimColor: '#ffd0a0',
    pal: { paper: '#d8402e', paperD: '#7e1820', paperL: '#ffb07a', cap: '#2a1a1c', capL: '#6a4a3e', rib: '#8a2a22', fire: '#4fb8ff', fireIn: '#e4f8ff', tongue: '#e0566e', tongueD: '#8a1f3a', tassel: '#e8b04a', line: '#5a1016', magic: '#5fc4ff' },
    vars: [{ h: -95, s: 0.9, keep: ['tongue', 'tongueD'] }, { h: 32, s: 1.1, l: -0.02, keep: ['tongue', 'tongueD'] }],
    slots: {
      paper: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.paperD, 0.25, p.paper, 0.5, mix(p.paper, p.paperL, 0.3), 0.75, p.paper, 1, p.paperD]);
        Paint.strokes(g, w, h, shade(p.paper, -0.25), 160, 40, PI / 2, 1, 0.25, R, 0.2); // fibres
        g.strokeStyle = rgba(p.rib, 0.85); g.lineWidth = 5; for (let i = 1; i < 9; i++) { const y = (i / 9) * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        Paint.mottle(g, w, h, p.paperD, 26, 10, 40, 0.35, R);
        // face cut into the front (u .5)
        const ex = (u) => FX(w, u), ey = (v) => FY(h, v);
        g.fillStyle = '#140608';
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(ex(0.5 + s * 0.035), ey(0.62)); g.quadraticCurveTo(ex(0.5 + s * 0.08), ey(0.68), ex(0.5 + s * 0.12), ey(0.6)); g.quadraticCurveTo(ex(0.5 + s * 0.08), ey(0.59), ex(0.5 + s * 0.035), ey(0.62)); g.fill(); }
        g.beginPath(); g.moveTo(ex(0.39), ey(0.44));
        for (let i = 0; i <= 12; i++) { const u = lerp(0.39, 0.61, i / 12); g.lineTo(ex(u), ey(i % 2 ? 0.4 : 0.455)); }
        g.lineTo(ex(0.61), ey(0.44)); g.quadraticCurveTo(ex(0.5), ey(0.25), ex(0.39), ey(0.44)); g.fill();
        g.fillStyle = '#f4ecd8'; for (let i = 0; i < 6; i++) { const u = lerp(0.41, 0.59, i / 5); g.beginPath(); g.moveTo(ex(u - 0.012), ey(0.43)); g.lineTo(ex(u + 0.012), ey(0.43)); g.lineTo(ex(u), ey(0.39)); g.fill(); }
        // torn holes (back)
        g.fillStyle = '#140608'; for (const [u, v, r] of [[0.12, 0.6, 14], [0.86, 0.35, 18], [0.95, 0.68, 10]]) { g.beginPath(); for (let a = 0; a < TAU; a += 0.7) g.lineTo(ex(u) + cos(a) * r * (0.6 + R() * 0.6), ey(v) + sin(a) * r * (0.6 + R() * 0.6)); g.fill(); }
      }, emit(g, w, h, p, R) {
        // inner light through the paper (brighter mid-band), eyes/mouth blaze with the flame colour
        Paint.vgrad(g, w, h, [0, '#000000', 0.5, shade(p.paperL, -0.72), 1, '#000000']);
        g.fillStyle = 'rgba(0,0,0,0.6)'; for (let i = 1; i < 9; i++) g.fillRect(0, (i / 9) * h - 3, w, 6);
        const ex = (u) => FX(w, u), ey = (v) => FY(h, v);
        g.fillStyle = p.fireIn;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(ex(0.5 + s * 0.035), ey(0.62)); g.quadraticCurveTo(ex(0.5 + s * 0.08), ey(0.68), ex(0.5 + s * 0.12), ey(0.6)); g.quadraticCurveTo(ex(0.5 + s * 0.08), ey(0.59), ex(0.5 + s * 0.035), ey(0.62)); g.fill(); }
        g.fillStyle = p.fire; g.beginPath(); g.moveTo(ex(0.39), ey(0.44)); g.quadraticCurveTo(ex(0.5), ey(0.25), ex(0.61), ey(0.44)); g.fill();
        for (const [u, v, r] of [[0.12, 0.6, 14], [0.86, 0.35, 18], [0.95, 0.68, 10]]) { g.beginPath(); g.arc(ex(u), ey(v), r, 0, TAU); g.fill(); }
      } },
      cap(g, w, h, p, R) { Paint.fill(g, w, h, p.cap); Paint.strokes(g, w, h, p.capL, 60, 30, 0, 2, 0.4, R, 0.1); g.fillStyle = p.tassel; g.fillRect(0, h * 0.45, w, 6); },
      tongue(g, w, h, p) { Paint.hgrad(g, w, h, [0, p.tongueD, 0.5, p.tongue, 1, p.tongueD]); g.strokeStyle = rgba(p.tongueD, 0.8); g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); },
      tassel(g, w, h, p, R) { g.clearRect(0, 0, w, h); g.fillStyle = p.tassel; g.fillRect(0, 0, w, h * 0.2); for (let x = 2; x < w; x += 7) { g.fillStyle = R() > 0.5 ? p.tassel : shade(p.tassel, -0.3); g.fillRect(x, h * 0.2, 4, h * (0.65 + R() * 0.35)); } },
      flame: { size: 2, paint: (g, w, h, p) => Paint.fill(g, w, h, p.fire), emit(g, w, h, p) { Paint.vgrad(g, w, h, [0, '#000000', 0.35, shade(p.fire, -0.45), 0.8, shade(p.fire, -0.2), 1, shade(p.fireIn, -0.3)]); } },
    },
    build(B, p) {
      B.bone('body', 'root', [0, 0.95, 0]);
      B.bone('top', 'body', [0, 1.38, 0]);
      B.bone('f0', 'top', [0, 1.45, 0]); B.bone('f1', 'f0', [0, 1.6, 0]); B.bone('f2', 'f1', [0, 1.75, 0]);
      B.bone('jaw', 'body', [0, 0.82, 0.3]);
      B.bone('tg0', 'jaw', [0, 0.8, 0.34]); B.bone('tg1', 'tg0', [0.03, 0.62, 0.42]); B.bone('tg2', 'tg1', [0.08, 0.45, 0.42]); B.bone('tg3', 'tg2', [0.1, 0.32, 0.36]);
      B.bone('tas0', 'body', [0, 0.42, 0]); B.bone('tas1', 'tas0', [0, 0.25, 0]);
      for (const [s, S] of SIDES) B.bone('eye' + S, 'body', [s * 0.12, 1.0, 0.3]);
      // lantern body: ovoid paper with slight per-rib bulges (lathe wobble)
      const prof = []; for (let i = 0; i <= 18; i++) { const u = i / 18; prof.push([0.06 + sin(u * PI) * 0.31 + abs(sin(u * PI * 9)) * 0.012, lerp(0.48, 1.36, u)]); }
      B.lathe(prof, { w: B.keyW([[0.6, 'tas0'], [0.75, 'body']]), slot: 'paper', seg: 28 });
      // top and bottom lacquered caps
      B.lathe([[0.17, 1.33], [0.19, 1.37], [0.18, 1.42], [0.1, 1.44], [0.03, 1.46]], { w: 'top', slot: 'cap', seg: 20 });
      B.lathe([[0.03, 0.42], [0.12, 0.44], [0.18, 0.47], [0.19, 0.51], [0.15, 0.53]], { w: 'body', slot: 'cap', seg: 20 });
      // hanging hook
      B.geo(new THREE.TorusGeometry(0.05, 0.012, 6, 14, PI * 1.4), { at: [0, 1.5, 0], rot: [0, PI / 2, -0.2], w: 'top', slot: 'cap' });
      // flame (glow layer) — stacked teardrops on the flame chain
      B.tube([[0, 1.43, 0], [0, 1.56, 0], [0, 1.7, 0], [0, 1.86, 0]], [0.1, 0.11, 0.07, 0.005], { layer: 'glow', slot: 'flame', bones: ['f0', 'f1', 'f2', 'f2'], seg: 12, cap0: true });
      B.tube([[0, 1.43, 0], [0, 1.53, 0], [0, 1.64, 0]], [0.06, 0.06, 0.005], { layer: 'glow', slot: 'flame', bones: ['f0', 'f1', 'f1'], seg: 10, cap0: true, tint: '#c0e8ff' });
      // tongue (spring)
      B.tube([[0, 0.82, 0.3], [0.03, 0.62, 0.4], [0.08, 0.45, 0.4], [0.1, 0.32, 0.34], [0.09, 0.24, 0.3]], [0.07, 0.065, 0.055, 0.045, 0.02], { bones: ['tg0', 'tg1', 'tg2', 'tg3', 'tg3'], slot: 'tongue', seg: 10, flat: [1, 0.4], up: [1, 0, 0], cap1: true });
      // tassel
      B.tube([[0, 0.43, 0], [0, 0.37, 0]], [0.025, 0.035], { w: 'tas0', slot: 'cap', seg: 8 });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * PI; B.strip([[0, 0.38, 0], [0, 0.25, 0], [0, 0.1, 0]], [0.09, 0.1, 0.11], { bones: ['tas0', 'tas1', 'tas1'], slot: 'tassel', side: [cos(a), 0, sin(a)] }); }
    },
    springs: [
      { chain: ['tg0', 'tg1', 'tg2', 'tg3'], tip: [-0.01, -0.08, -0.04], k: 55, d: 6, g: 3, max: 0.9 },
      { chain: ['tas0', 'tas1'], tip: [0, -0.15, 0], k: 60, d: 6, g: 4, max: 0.8 },
    ],
    fx: {
      embers: { n: 16, rate: 7, bone: 'f1', box: [0.12, 0.1, 0.12], vel: [0, 0.7, 0], velR: [0.2, 0.2, 0.2], life: [0.6, 1.2], size: [0.04, 0.08], color: ['#e4f8ff', '#4fb8ff'], swirl: 6, swirlA: 1, twinkle: 12 },
      cast: { n: 36, rate: 0, burstRate: 40, at: [0, 0.95, 0], ring: 0.6, box: [0, 0.8, 0], vel: [0, 0.8, 0], velR: [0.1, 0.3, 0.1], life: [0.6, 1.1], size: [0.08, 0.16], color: ['#e4f8ff', '#3a6aff'], swirl: 4, swirlA: 2 },
      death: { n: 40, rate: 0, burstRate: 40, at: [0, 0.95, 0], box: [0.5, 0.8, 0.5], vel: [0, 0.9, 0], velR: [0.4, 0.4, 0.4], life: [0.8, 1.6], size: [0.05, 0.08], color: ['#ffd0a0', '#4a1a14'], add: false, shape: 1, swirl: 3, swirlA: 1 },
    },
    lights: (C) => [{ bone: 'body', at: [0, 0.05, 0], color: '#ff9a5a', i: 1.2, r: 3, flicker: 0.15 }, { bone: 'f1', color: C.p.fire, i: 1.4, r: 3.5, flicker: 0.3 }],
    tick(C, dt) { const b = C.B.byName; const t = C.t; b.f1.rotation.z += sin(t * 9) * 0.12; b.f2.rotation.z += sin(t * 13 + 1) * 0.2; b.f1.scale.multiplyScalar(1 + sin(t * 11) * 0.06); C.glowBase = 1 + sin(t * 7) * 0.08 + sin(t * 17) * 0.05; },
    clips: {
      idle(P, t) {
        P.rootM(0, 0.12 + sin(t * 1.6) * 0.06, 0, sin(t * 1.3) * 0.08, sin(t * 0.4) * 0.2, sin(t * 1.0) * 0.1);
        P.r('jaw', 0.06 + sin(t * 2.4) * 0.05).r('tg1', sin(t * 3) * 0.2, 0, sin(t * 2) * 0.3).r('tg2', sin(t * 3 - 1) * 0.3);
      },
      move(P, ph) { P.rootM(0, 0.15 + abs(sin(ph * PI)) * 0.08, 0, 0.18, 0, sin(ph * TAU) * 0.08); },
      // swings back on its hook, then lashes with the tongue
      attack(P, t, k) {
        const A = atk(k, 0.3, 0.42, 0.62);
        P.rootM(0, 0.12, -0.1 * A.a + 0.3 * A.s, -0.35 * A.a + 0.4 * A.s);
        P.r('jaw', 0.15 * A.a + 0.25 * A.s).r('tg0', -0.4 * A.a - 1.1 * A.s).r('tg1', -0.6 * A.s).r('tg2', -0.4 * A.s);
        P.ch('glow', 0.6 * A.s);
      },
      // ghost flame: the flame flares huge, paper glows white-hot
      cast(P, t, k) {
        const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k));
        P.rootM(0, 0.2 * u + 0.12, 0, -0.1 * u, t * 2 * u); P.s('f0', 0.6 * u, 1.2 * u, 0.6 * u).s('f1', 0.3 * u, 0.6 * u, 0.3 * u);
        P.s('body', 0.06 * u * sin(t * 20), 0); P.ch('glow', 1.8 * u); P.ch('fx_cast', u); P.ch('fx_embers', u * 4);
      },
      // lantern glare: eyes blaze, paper bulges
      special(P, t, k) {
        const u = bump(k, 0.15, 0.85);
        P.rootM(0, 0.12, 0.1 * u, -0.15 * u); P.s('body', 0.12 * u, 0.06 * u, 0.12 * u); P.ch('glow', 2.5 * u); P.ch('flash', 0.2 * bump(k, 0.4, 0.55));
      },
      hurt(P, t, k, C) { const u = (1 - E.outQ(k)) * min(1, k * 14); P.rootM(0, 0.12, -0.15 * u, -0.5 * u, 0, sin(t * 40) * 0.2 * u); P.ch('glow', -0.6 * u); P.ch('fx_embers', u * 3); },
      // flame gutters; the lantern falls and burns away
      die(P, t, k) {
        const fall = E.inQ(seg(k, 0, 0.35));
        P.rootM(0, -0.4 * fall, 0, 0.6 * fall, 0, 0.9 * fall);
        P.s('f0', -0.8 * seg(k, 0, 0.3)); P.ch('glow', -0.8 * seg(k, 0, 0.3));
        P.ch('dissolve', E.inQ(seg(k, 0.3, 1))); P.ch('fx_death', bump(k, 0.3, 0.9) * 2);
      },
      enter(P, t, k) { const u = 1 - E.outBack(seg(k, 0, 0.8)); P.rootM(0, 1.0 * u + 0.12, 0, 0, 0, 0.3 * u); P.s('f0', -0.9 * (1 - seg(k, 0.4, 0.8))); P.ch('glow', bump(k, 0.5, 1) * 1.5); },
    },
    dur: { attack: 1.0, cast: 1.5, special: 1.2, die: 1.6, enter: 1.2 },
  });

  // ===================================================================================================
  // 礦工魂 miner_ghost — a miner buried in the 九份 collapse, still tapping at the rock: brass helmet with a lamp,
  // towel round the neck, pickaxe on the shoulder; legs are gone — the body thins into a mine-dust wisp.
  defC('miner_ghost', {
    height: 1.8, fill: 0.9, radius: 0.33, shadow: 0.35, shadowA: 0.6, ghostCol: '#a8fff4', rimColor: '#c8fff4',
    pal: { skin: '#9fd0c8', skinD: '#4f8a88', skinL: '#dcf6ee', shirt: '#4a6a78', shirtD: '#203844', shirtL: '#86a8b2', pants: '#3a4e5e', helm: '#b89a4a', helmD: '#5e4a20', helmL: '#f0dc96', towel: '#e8eee4', lamp: '#ffd27a', wood: '#8a6a48', iron: '#9aa6ae', eye: '#bffcff', mist: '#7fd4d0', line: '#16303a', magic: '#9ff0e8' },
    vars: [{ h: 70, s: 1.0, keep: ['lamp', 'helm', 'helmD', 'helmL', 'wood', 'iron'] }, { h: -150, s: 1.1, keep: ['lamp', 'helm', 'helmD', 'helmL', 'wood', 'iron'] }],
    slots: {
      skin(g, w, h, p, R) { Paint.fill(g, w, h, p.skin); Paint.mottle(g, w, h, p.skinD, 40, 6, 24, 0.35, R); Paint.speck(g, w, h, '#203030', 80, 2, 0.4, R); },
      face: { size: 4, paint(g, w, h, p, R) {
        Paint.fill(g, w, h, p.skin); Paint.mottle(g, w, h, p.skinD, 50, 8, 40, 0.3, R); Paint.speck(g, w, h, '#1a2a2a', 300, 3, 0.35, R); // coal dust
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.062), y = FY(h, 0.54); g.fillStyle = 'rgba(20,40,40,0.8)'; g.beginPath(); g.ellipse(x, y, 16, 11, 0, 0, TAU); g.fill(); g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 7, 5, 0, 0, TAU); g.fill(); }
        const mx = FX(w, 0.5), my = FY(h, 0.39);
        g.strokeStyle = '#1a2a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(mx - 16, my + 3); g.quadraticCurveTo(mx, my - 3, mx + 16, my + 3); g.stroke(); // tired mouth
        g.strokeStyle = 'rgba(30,60,60,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(mx - 40, FY(h, 0.6)); g.lineTo(mx - 12, FY(h, 0.615)); g.moveTo(mx + 40, FY(h, 0.6)); g.lineTo(mx + 12, FY(h, 0.615)); g.stroke();
        // stubble
        Paint.speck(g, w, h, '#3a5a5a', 0, 2, 0.5, R); g.fillStyle = 'rgba(40,70,70,0.5)'; for (let i = 0; i < 160; i++) { const a = R() * PI, r = 30 + R() * 30; g.fillRect(mx + cos(a) * r * 1.3, my + sin(a) * r * 0.6, 2, 2); }
      }, emit(g, w, h, p) { for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.062), y = FY(h, 0.54); const gr = g.createRadialGradient(x, y, 0, x, y, 10); gr.addColorStop(0, p.eye); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 10, y - 10, 20, 20); } } },
      shirt(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.shirtL, 0.5, p.shirt, 1, p.shirtD]); Paint.weave(g, w, h, '#000', 3, 0.12); Paint.mottle(g, w, h, '#101a1a', 30, 8, 30, 0.35, R); // patches
        g.fillStyle = shade(p.shirt, -0.2); g.fillRect(w * 0.15, h * 0.3, 40, 34); g.strokeStyle = p.shirtL; g.setLineDash([4, 4]); g.strokeRect(w * 0.15, h * 0.3, 40, 34); g.setLineDash([]);
        g.fillStyle = '#3a2a1a'; g.fillRect(0, h * 0.86, w, h * 0.08); g.fillStyle = p.iron; g.fillRect(w * 0.48, h * 0.86, 16, h * 0.08); },
      helm(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.helmD, 0.6, p.helm, 1, p.helmL]); Paint.mottle(g, w, h, p.helmD, 20, 6, 20, 0.4, R); Paint.cracks(g, w, h, p.helmD, 6, 40, 1.2, 0.5, R); },
      towel(g, w, h, p, R) { Paint.fill(g, w, h, p.towel); Paint.mottle(g, w, h, '#8a9088', 20, 6, 30, 0.35, R); g.strokeStyle = '#4a7aa8'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, h * 0.2); g.lineTo(w, h * 0.2); g.moveTo(0, h * 0.8); g.lineTo(w, h * 0.8); g.stroke(); },
      wood(g, w, h, p, R) { Paint.fill(g, w, h, p.wood); Paint.strokes(g, w, h, shade(p.wood, -0.35), 60, 80, PI / 2, 1.5, 0.5, R, 0.05); },
      iron(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, shade(p.iron, 0.4), 0.5, p.iron, 1, shade(p.iron, -0.5)]); Paint.mottle(g, w, h, '#7a4a2a', 18, 6, 22, 0.45, R); },
      lampg: { size: 1, paint: (g, w, h, p) => Paint.fill(g, w, h, p.lamp), emit: (g, w, h, p) => Paint.fill(g, w, h, p.lamp) },
      beam: { size: 1, paint: (g, w, h) => Paint.fill(g, w, h, '#000'), emit(g, w, h, p) { Paint.vgrad(g, w, h, [0, shade(p.lamp, -0.78), 0.3, shade(p.lamp, -0.9), 1, '#000000']); } },
      wisp(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.mist, 1, p.pants]); Paint.mottle(g, w, h, '#e8ffff', 20, 8, 30, 0.3, R); },
    },
    build(B, p) {
      const J = humanRig(B, { hip: 0.85, chest: 1.22, neck: 1.38, head: 1.44, headZ: 0.03, shY: 1.3, sh: 0.2, up: 0.28, fore: 0.26, arm1: [0.25, -1, 0.15], arm2: [0.05, -0.5, 1], lx: 0.1, knee: 0.5, noLegs: true });
      // right arm raised gripping the pick on the shoulder
      B.byName.armR.position.set(-0.08, -0.05, 0.22); B.byName.armR.userData.rest = B.byName.armR.position.clone(); B.byName.armR.userData.abs = new THREE.Vector3(-0.28, 1.25, 0.22);
      B.byName.handR.position.set(0.12, 0.18, 0.05); B.byName.handR.userData.rest = B.byName.handR.position.clone(); B.byName.handR.userData.abs = new THREE.Vector3(-0.16, 1.43, 0.27);
      J.elR = [-0.28, 1.25, 0.22]; J.handR = [-0.16, 1.43, 0.27];
      B.bone('pick', 'handR', [-0.16, 1.43, 0.27]);
      B.bone('w0', 'hips', [0, 0.7, -0.02]); B.bone('w1', 'w0', [0, 0.45, -0.1]); B.bone('w2', 'w1', [0, 0.22, -0.22]); B.bone('w3', 'w2', [0, 0.08, -0.36]);
      B.bone('tw0', 'chest', [-0.12, 1.36, 0.1]); B.bone('tw1', 'tw0', [-0.15, 1.2, 0.14]);
      // head & helmet (with brim and lamp)
      B.ell([0, 1.55, 0.03], [0.105, 0.13, 0.115], { w: 'head', slot: 'face', seg: 22, rings: 14 });
      B.tube([[0, 1.34, 0], [0, 1.46, 0.02]], 0.05, { w: 'neck', slot: 'skin', seg: 8 });
      B.ell([0, 1.6, 0.02], [0.13, 0.11, 0.14], { w: 'head', slot: 'helm', th0: 0, thLen: PI * 0.5, seg: 20, rings: 8 });
      B.lathe([[0.13, 1.6], [0.17, 1.6], [0.175, 1.615], [0.13, 1.62]], { w: 'head', slot: 'helm', seg: 20, at: [0, 0, 0.02], flat: [1, 1.1] });
      B.tube([[0, 1.66, 0.14], [0, 1.66, 0.19]], [0.04, 0.045], { w: 'head', slot: 'iron', seg: 10, cap0: true });
      B.ell([0, 1.66, 0.195], [0.036, 0.036, 0.012], { w: 'head', slot: 'lampg', seg: 10, rings: 6 });
      // lamp beam (additive cone)
      const cone = new THREE.ConeGeometry(0.35, 1.3, 16, 1, true); cone.translate(0, -0.65, 0); cone.rotateX(-PI / 2 - 0.25);
      B.geo(cone, { at: [0, 1.66, 0.2], w: 'head', slot: 'beam', layer: 'glow', smooth: false });
      // torso: shirt with belt; towel round the neck
      B.lathe([[0.14, 0.72], [0.18, 0.88], [0.2, 1.05], [0.21, 1.22], [0.17, 1.32], [0.06, 1.37]], { w: B.keyW([[0.8, 'hips'], [1.0, 'spine'], [1.2, 'chest']]), slot: 'shirt', seg: 20, flat: [1, 0.75] });
      B.tube([[0.12, 1.33, 0.07], [0, 1.35, 0.12], [-0.12, 1.33, 0.07], [-0.13, 1.33, -0.07], [0, 1.35, -0.11], [0.12, 1.33, -0.07], [0.12, 1.33, 0.07]], 0.035, { w: 'chest', slot: 'towel', seg: 8, sub: 3 });
      B.strip([[-0.12, 1.36, 0.1], [-0.15, 1.2, 0.14], [-0.15, 1.08, 0.15]], 0.08, { bones: ['tw0', 'tw1', 'tw1'], slot: 'towel', side: [1, 0, -0.2] });
      // ghost tail where the legs should be
      B.tube([[0, 0.78, 0], [0, 0.45, -0.1], [0, 0.22, -0.22], [0, 0.08, -0.36], [0, 0.06, -0.5]], [0.2, 0.17, 0.12, 0.06, 0.01], { layer: 'ghost', slot: 'wisp', bones: ['hips', 'w1', 'w2', 'w3', 'w3'], seg: 16, sub: 4 });
      // arms
      for (const [s, S] of SIDES) {
        limb(B, J['sh' + S], J['el' + S], J['hand' + S], [0.07, 0.06, 0.045], ['sh' + S, 'arm' + S, 'hand' + S], { slot: 'shirt' });
        B.ell(v3(J['hand' + S], [0, 0, 0.02]), [0.045, 0.05, 0.045], { w: 'hand' + S, slot: 'skin' });
      }
      // pickaxe: shaft from the hand up behind the shoulder, iron head
      const hR = J.handR, top = [-0.05, 1.82, -0.22], bot = [-0.22, 1.2, 0.5];
      B.tube([bot, top], 0.022, { w: 'pick', slot: 'wood', seg: 8, cap0: true, cap1: true });
      B.tube([[0.12, 1.76, -0.3], [-0.05, 1.86, -0.22], [-0.24, 1.82, -0.18], [-0.38, 1.66, -0.15]], [0.008, 0.035, 0.03, 0.004], { w: 'pick', slot: 'iron', seg: 8, sub: 3, flat: [1, 0.6] });
      void hR;
    },
    springs: [{ chain: ['w0', 'w1', 'w2', 'w3'], tip: [0, 0, -0.14], k: 40, d: 5, g: 0.3, wind: 1.5, max: 0.7 }, { chain: ['tw0', 'tw1'], tip: [0, -0.12, 0], k: 70, d: 7, g: 3, max: 0.7 }],
    fx: {
      dust: { n: 16, rate: 6, bone: 'w3', box: [0.25, 0.15, 0.25], vel: [0, 0.15, -0.1], velR: [0.1, 0.06, 0.1], life: [1.2, 2.2], size: [0.18, 0.3], grow: 1.5, color: ['#c8fff4', '#4f8a88'], alpha: 0.25, add: false },
      sparks: { n: 20, rate: 0, burstRate: 60, bone: 'pick', at: [-0.24, 0.35, -0.4], box: [0.05, 0.05, 0.05], vel: [0, 0.8, 0.6], velR: [0.8, 0.6, 0.8], g: 6, life: [0.25, 0.5], size: [0.03, 0.05], color: ['#fff2c0', '#ff8a2a'], shape: 3 },
      cast: { n: 30, rate: 0, burstRate: 30, at: [0, 1.0, 0], box: [0.8, 1.2, 0.6], vel: [0, 0.3, 0], velR: [0.2, 0.2, 0.2], life: [1, 1.6], size: [0.2, 0.35], grow: 1.3, color: ['#c8fff4', '#16303a'], alpha: 0.3, add: false },
      death: { n: 36, rate: 0, burstRate: 30, at: [0, 1.0, 0], box: [0.4, 1.0, 0.3], vel: [0, 0.6, 0], velR: [0.2, 0.2, 0.2], life: [1, 1.8], size: [0.05, 0.09], color: ['#fff2c0', '#7fd4d0'], twinkle: 8, shape: 3 },
    },
    lights: (C) => [{ bone: 'head', at: [0, 0.12, 0.7], color: C.p.lamp, i: 0.9, r: 4, flicker: 0.1 }],
    clips: {
      idle(P, t) {
        breathe(P, t, 1.4); // heavy sighing
        P.rootM(0, 0.08 + sin(t * 1.4) * 0.04, 0, sin(t * 0.9) * 0.03, 0, sin(t * 0.7) * 0.04);
        P.r('head', 0.12 + sin(t * 0.5) * 0.05, sin(t * 0.3) * 0.12).r('spine', 0.08);
        P.r('shL', sin(t * 1.2) * 0.06).r('armL', sin(t * 1.5) * 0.08);
      },
      move(P, ph) { P.rootM(0, 0.12 + sin(ph * TAU) * 0.04, 0, 0.18); P.r('w1', -0.2).r('w2', -0.2); },
      // overhead pickaxe strike
      attack(P, t, k) {
        const A = atk(k, 0.38, 0.5, 0.66);
        P.rootM(0, 0.08, 0.25 * A.s, -0.15 * A.a + 0.25 * A.s);
        P.r('shR', -1.1 * A.a + 1.4 * A.s, 0, -0.3 * A.a).r('armR', -0.5 * A.a + 0.3 * A.s).r('handR', -0.4 * A.a + 1.2 * A.s);
        P.r('shL', -1.2 * A.a + 1.0 * A.s, 0, 0.4 * A.a).r('armL', -0.6 * A.a);
        P.r('chest', -0.25 * A.a + 0.35 * A.s).r('head', -0.15 * A.a + 0.2 * A.s);
        P.ch('fx_sparks', bump(k, 0.46, 0.56) * 4);
      },
      // miner's sigh: slumps, a cold cloud of coal-dust despair rolls out
      cast(P, t, k) { const u = sm(0, 0.35, k) * (1 - sm(0.85, 1, k)); P.r('chest', 0.3 * u).r('head', 0.4 * u).s('chest', -0.06 * u * sin(t * 3)); P.rootM(0, 0.08 - 0.05 * u); P.ch('fx_cast', u); P.ch('fx_dust', u * 4); P.ch('glow', u); },
      hurt(P, t, k, C) { GEN.hurt(P, t, k, C); },
      die(P, t, k, C) { GEN.die(P, t, k, C); P.r('shR', 0.6 * seg(k, 0, 0.4)); },
      enter(P, t, k) { const u = 1 - E.outC(seg(k, 0, 0.8)); P.rootM(0, -0.8 * u + 0.08, 0, 0.3 * u); P.ch('fade', u); P.ch('fx_dust', bump(k, 0, 0.8) * 4); },
    },
    dur: { attack: 1.15, cast: 1.6 },
    shadowZ: 1,
  });
})();

// ----------------------------------------------------------------------------------------------------- batch: mine, shore & mist forest
(() => {
  const K = G.Mon3D.kit, defC = G.Mon3D._defC;
  const { Paint, GEN, E, atk, bump, seg, sm, clamp, lerp, shade, mix, rgba } = K;
  const { humanRig, limb, claw, breathe, FX, FY, v3, nrm, SIDES } = K.H;
  const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
  const furSlot = (base, dark, light) => (g, w, h, p, R) => { Paint.fill(g, w, h, p[base]); Paint.mottle(g, w, h, p[dark], 30, 8, 30, 0.35, R); Paint.strokes(g, w, h, p[dark], 260, 10, PI / 2, 1.4, 0.45, R, 0.6); Paint.strokes(g, w, h, p[light], 140, 8, PI / 2, 1, 0.35, R, 0.6); };

  // ===================================================================================================
  // 礦坑蝙蝠 mine_bat — gold-dust cave bat with glowing amber eyes and teal ore crystals grown along its spine;
  // membranous wings on real finger bones, scalloped trailing edge, constant hover-flap.
  defC('mine_bat', {
    height: 1.5, fill: 0.92, radius: 0.5, shadow: 0.5, shadowA: 0.6, rimColor: '#ffd8e8',
    pal: { fur: '#5a4652', furD: '#2a1e28', furL: '#9a7e86', wing: '#4a3046', wingD: '#1e1222', wingL: '#a0708a', bone: '#c8a8a8', eye: '#ffb43a', crystal: '#62f0d8', crystalD: '#1e7a7e', line: '#1a0e18', magic: '#7af5df' },
    vars: [{ h: 160, s: 1.2, keep: ['eye'] }, { h: -40, s: 1.4, l: -0.03, set: { eye: '#ff4a3a' } }],
    slots: {
      fur: furSlot('fur', 'furD', 'furL'),
      wing(g, w, h, p, R) {
        Paint.hgrad(g, w, h, [0, p.wingD, 0.5, p.wing, 1, p.wingD]); Paint.mottle(g, w, h, p.wingL, 18, 10, 40, 0.25, R);
        // veins
        g.strokeStyle = rgba(p.wingL, 0.45); g.lineWidth = 1.5; for (let i = 0; i < 7; i++) { g.beginPath(); let x = R() * w, y = 0; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 30; y += h / 6; g.lineTo(x, y); } g.stroke(); }
        // scalloped trailing edge (v 0 = canvas bottom)
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
        g.beginPath(); g.ellipse(w / 2, h + 4, w * 0.48, h * 0.18, 0, 0, TAU); g.fill();
        for (const x of [w * 0.15, w * 0.85]) { g.beginPath(); g.arc(x, h * 0.98, 8 + R() * 6, 0, TAU); g.fill(); } // tears
        g.globalCompositeOperation = 'source-over';
      },
      bone(g, w, h, p) { Paint.vgrad(g, w, h, [0, p.bone, 1, p.wingD]); },
      inner(g, w, h, p, R) { Paint.fill(g, w, h, mix(p.wingL, '#e89aa8', 0.5)); Paint.strokes(g, w, h, p.wing, 30, 30, PI / 2, 1, 0.4, R); },
      eye: { size: 1, paint: (g, w, h, p) => Paint.eye(g, w, h, p.eye, '#1a0800', p.eye), emit: (g, w, h, p) => Paint.eye(g, w, h, shade(p.eye, -0.2), '#000', shade(p.eye, -0.4)) },
      crystal: { size: 1, paint: (g, w, h, p) => Paint.hgrad(g, w, h, [0, p.crystalD, 0.4, p.crystal, 0.6, '#e8fffa', 1, p.crystalD]), emit: (g, w, h, p) => Paint.hgrad(g, w, h, [0, '#000', 0.5, shade(p.crystal, -0.3), 1, '#000']) },
      fang: (g, w, h) => Paint.fill(g, w, h, '#f4ecdc'),
    },
    build(B, p) {
      B.bone('body', 'root', [0, 1.0, 0]);
      B.bone('head', 'body', [0, 1.18, 0.14]);
      B.bone('jaw', 'head', [0, 1.13, 0.22]);
      for (const [s, S] of SIDES) {
        B.bone('ear' + S, 'head', [s * 0.08, 1.3, 0.1]);
        const sh = [s * 0.13, 1.1, 0], el = [s * 0.42, 1.24, -0.03], wr = [s * 0.68, 1.12, 0.0];
        const t1 = [s * 1.1, 1.3, 0.02], t2 = [s * 1.05, 0.92, -0.04], t3 = [s * 0.74, 0.74, -0.05];
        B.bone('w0' + S, 'body', sh); B.bone('w1' + S, 'w0' + S, el); B.bone('w2' + S, 'w1' + S, wr);
        B.bone('f1' + S, 'w2' + S, v3(wr, [t1[0] - wr[0], t1[1] - wr[1], t1[2] - wr[2]], 0.5)); B.bone('f2' + S, 'w2' + S, v3(wr, [t2[0] - wr[0], t2[1] - wr[1], t2[2] - wr[2]], 0.5)); B.bone('f3' + S, 'w2' + S, v3(wr, [t3[0] - wr[0], t3[1] - wr[1], t3[2] - wr[2]], 0.5));
        B.bone('leg' + S, 'body', [s * 0.07, 0.86, -0.04]);
        // wing bones (arm + three fingers)
        B.tube([sh, el, wr], [0.03, 0.022, 0.018], { bones: ['w0' + S, 'w1' + S, 'w2' + S], slot: 'bone', seg: 6 });
        const mids = [t1, t2, t3].map((t) => v3(wr, [t[0] - wr[0], t[1] - wr[1], t[2] - wr[2]], 0.5));
        [t1, t2, t3].forEach((t, i) => B.tube([wr, mids[i], t], [0.016, 0.012, 0.004], { bones: ['w2' + S, 'f' + (i + 1) + S, 'f' + (i + 1) + S], slot: 'bone', seg: 5 }));
        // thumb claw
        B.tube([wr, v3(wr, [s * 0.02, 0.08, 0.05])], [0.014, 0.002], { w: 'w2' + S, slot: 'bone', seg: 5 });
        // membrane panels between fingers, and from the last finger back to the body
        const bul = (u, v) => sin(PI * v) * sin(PI * u) * 0.04;
        B.sheet([wr, mids[0], t1], [wr, mids[1], t2], ['w2' + S, 'f1' + S, 'f1' + S], ['w2' + S, 'f2' + S, 'f2' + S], { slot: 'wing', n: 4, bulge: bul });
        B.sheet([wr, mids[1], t2], [wr, mids[2], t3], ['w2' + S, 'f2' + S, 'f2' + S], ['w2' + S, 'f3' + S, 'f3' + S], { slot: 'wing', n: 4, bulge: bul });
        B.sheet([el, wr, t3], [[s * 0.15, 1.04, -0.02], [s * 0.14, 0.92, -0.04], [s * 0.1, 0.82, -0.05]], ['w1' + S, 'w2' + S, 'f3' + S], ['w0' + S, 'body', 'body'], { slot: 'wing', n: 4, bulge: bul });
        B.sheet([sh, el, wr], [[s * 0.15, 1.04, -0.02], [s * 0.15, 1.04, -0.02], el], ['w0' + S, 'w1' + S, 'w2' + S], ['w0' + S, 'w0' + S, 'w1' + S], { slot: 'wing', n: 2 });
        // ears
        B.geo(new THREE.ConeGeometry(0.06, 0.2, 7, 1), { at: [s * 0.085, 1.37, 0.09], rot: [-0.1, 0, -s * 0.35], scale: [1, 1, 0.45], w: 'ear' + S, slot: 'fur' });
        B.geo(new THREE.ConeGeometry(0.04, 0.15, 6, 1), { at: [s * 0.088, 1.365, 0.11], rot: [-0.1, 0, -s * 0.35], scale: [1, 1, 0.3], w: 'ear' + S, slot: 'inner', outline: false });
        // feet
        B.tube([[s * 0.07, 0.86, -0.04], [s * 0.08, 0.76, -0.02], [s * 0.08, 0.72, 0.02]], [0.022, 0.014, 0.006], { bones: ['leg' + S, 'leg' + S, 'leg' + S], slot: 'bone', seg: 5 });
        B.eye('eye' + S, 'head', [s * 0.075, 1.24, 0.28], 0.036, { ry: 0.85, rz: 0.6 });
        B.geo(new THREE.ConeGeometry(0.012, 0.05, 5), { at: [s * 0.025, 1.13, 0.31], rot: [PI, 0, 0], w: 'jaw', slot: 'fang', outline: false });
      }
      // body + head
      B.ell([0, 0.97, -0.01], [0.21, 0.25, 0.2], { w: 'body', slot: 'fur', seg: 18, rings: 12 });
      B.ell([0, 1.21, 0.15], [0.16, 0.14, 0.15], { w: 'head', slot: 'fur', seg: 16, rings: 12 });
      B.ell([0, 1.16, 0.29], [0.065, 0.05, 0.06], { w: 'head', slot: 'inner', seg: 10, rings: 7 });
      B.ell([0, 1.12, 0.24], [0.05, 0.02, 0.05], { w: 'jaw', slot: 'inner', seg: 8, rings: 5 });
      // ore crystals along the spine
      const cr = [[0.1, 1.16, -0.1, 0.07, 0.38, -0.25, -0.35], [0.17, 1.1, -0.08, 0.055, 0.28, -0.2, -0.95], [0.04, 1.18, -0.12, 0.05, 0.26, -0.35, 0.1], [-0.08, 1.1, -0.14, 0.05, 0.22, -0.5, 0.6], [0.12, 1.0, -0.16, 0.05, 0.2, -0.7, -0.6], [-0.02, 0.98, -0.18, 0.045, 0.18, -0.9, 0.2]];
      for (const [x, y, z, r, l, rx, rz] of cr) { const c = new THREE.ConeGeometry(r, l, 5, 1); c.translate(0, l / 2, 0); B.geo(c, { at: [x, y, z], rot: [rx, 0, rz], w: 'body', slot: 'crystal', smooth: false }); }
    },
    springs: SIDES.map(([s, S]) => ({ chain: ['ear' + S], tip: [0, 0.12, 0], k: 120, d: 8, g: 0, max: 0.3 })),
    fx: {
      dust: { n: 20, rate: 8, at: [0, 0.9, -0.05], box: [1.6, 0.4, 0.4], vel: [0, -0.3, 0], velR: [0.2, 0.1, 0.2], life: [0.8, 1.6], size: [0.025, 0.045], color: ['#ffe28a', '#c08a2a'], shape: 3, twinkle: 10 },
      cast: { n: 30, rate: 0, burstRate: 40, at: [0, 1.1, 0.4], box: [0.3, 0.3, 0.3], vel: [0, 0.2, 1.2], velR: [0.8, 0.5, 0.4], life: [0.6, 1.2], size: [0.1, 0.16], color: ['#2a1e28', '#100810'], add: false, shape: 1, swirl: 8, swirlA: 2.5 },
      death: { n: 30, rate: 0, burstRate: 30, at: [0, 0.5, 0], box: [0.6, 0.5, 0.4], vel: [0, 0.6, 0], velR: [0.4, 0.3, 0.4], life: [0.8, 1.5], size: [0.05, 0.08], color: ['#7af5df', '#ffe28a'], shape: 3, twinkle: 8 },
    },
    lights: (C) => [{ bone: 'body', at: [0, 0.15, -0.15], color: C.p.crystal, i: 0.7, r: 2.5, flicker: 0.05 }],
    // hover flap shared by idle/move/cast
    clips: {
      idle(P, t, k, C) {
        const f = t * 3.2 * TAU / 3.2 * 1.6; const a = sin(f), up = cos(f);
        for (const [s, S] of SIDES) {
          P.r('w0' + S, 0, 0, s * (0.75 * a - 0.1)).r('w1' + S, 0, 0, s * 0.35 * a).r('w2' + S, 0, s * 0.25 * max(0, -a), s * 0.3 * a);
          P.r('f1' + S, 0, 0, s * 0.15 * a).r('f3' + S, 0, 0, -s * 0.15 * a).r('leg' + S, 0.3 + 0.2 * up);
        }
        P.rootM(0, 0.08 - 0.06 * a, 0, 0.1 + 0.05 * up); P.r('head', -0.1 * a + sin(t * 0.7) * 0.1, sin(t * 0.5) * 0.25);
      },
      move(P, ph, k, C) { this.idle(P, ph * 1.3, k, C); P.rootM(0, 0.05, 0, 0.35); },
      // swoop: rise & wings back, dive-bite, pull up
      attack(P, t, k, C) {
        const A = atk(k, 0.3, 0.45, 0.62);
        this.idle(P, t * 1.4, k, C);
        for (const [s, S] of SIDES) P.r('w0' + S, 0, -s * 0.6 * A.s, s * 0.8 * A.a - s * 0.3 * A.s);
        P.rootM(0, 0.25 * A.a - 0.35 * A.s, 0.45 * A.s, -0.2 * A.a + 0.6 * A.s); P.r('jaw', 0.6 * A.s + 0.2 * A.a).r('head', 0.3 * A.s);
      },
      // screech → bat swarm
      cast(P, t, k, C) { const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k)); this.idle(P, t * 1.8, k, C); P.r('head', -0.6 * u).r('jaw', 0.7 * u); P.rootM(0, 0.15 * u, -0.1 * u, -0.3 * u); P.ch('fx_cast', u); P.ch('glow', u * 1.5); },
      hurt(P, t, k, C) { const u = (1 - E.outQ(k)) * min(1, k * 14); this.idle(P, t, k, C); P.rootM(0, -0.1 * u, -0.2 * u, -0.6 * u, 0, sin(t * 40) * 0.3 * u); for (const [s, S] of SIDES) P.r('w0' + S, 0, 0, s * 0.8 * u); },
      // wings fold, it tumbles to the ground
      die(P, t, k) {
        const u = E.inQ(seg(k, 0, 0.4));
        for (const [s, S] of SIDES) P.r('w0' + S, 0, -s * 1.2 * u, -s * 0.9 * u).r('w1' + S, 0, s * 1.5 * u, 0).r('w2' + S, 0, -s * 1.0 * u, 0);
        P.rootM(0, -0.9 * u, 0, 0.6 * u, 0, 1.5 * u); P.ch('dissolve', E.inQ(seg(k, 0.45, 1))); P.ch('fx_death', bump(k, 0.4, 1) * 2);
      },
      enter(P, t, k, C) { this.idle(P, t * 1.5, k, C); const u = 1 - E.outC(seg(k, 0, 0.8)); P.rootM(0, 1.2 * u, -0.5 * u, 0.3 * u); P.ch('fade', u * 0.8); },
    },
    dur: { attack: 0.95, cast: 1.4 },
    shadowZ: 0.6, shadowX: 1.6,
  });

  // ===================================================================================================
  // 沙蟹精 sand_crab — a giant 八斗子 reef crab crusted with barnacles; one oversized crusher claw, stalked eyes,
  // eight articulated legs; scuttles sideways. Steals offerings on 中元 nights.
  defC('sand_crab', {
    height: 1.05, fill: 0.92, radius: 0.6, shadow: 0.6, rimColor: '#ffe6c8', shadowX: 1.5,
    pal: { shell: '#d98a4a', shellD: '#7a3a1e', shellL: '#ffd29a', spot: '#b4482a', belly: '#f0dcb8', leg: '#c8743e', eye: '#ffe86a', claw: '#e2904e', clawTip: '#3a1a14', line: '#4a2012', sand: '#e6cf9a', magic: '#ffd27a' },
    vars: [{ h: 175, s: 0.9, keep: ['sand', 'eye'] }, { h: -28, s: 1.25, l: -0.08, keep: ['sand'], set: { eye: '#9affd8' } }],
    slots: {
      shell: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.shellL, 0.5, p.shell, 1, p.shellD]);
        Paint.mottle(g, w, h, p.spot, 40, 8, 30, 0.45, R); Paint.mottle(g, w, h, p.shellL, 30, 5, 18, 0.35, R);
        Paint.speck(g, w, h, p.shellD, 500, 3, 0.4, R);
        // carapace grooves
        g.strokeStyle = rgba(p.shellD, 0.7); g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.3, h * 0.35); g.quadraticCurveTo(w * 0.5, h * 0.5, w * 0.7, h * 0.35); g.moveTo(w * 0.5, h * 0.42); g.lineTo(w * 0.5, h * 0.15); g.stroke();
      } },
      leg(g, w, h, p, R) { Paint.hgrad(g, w, h, [0, p.shellD, 0.5, p.leg, 1, p.shellD]); Paint.speck(g, w, h, p.spot, 120, 3, 0.5, R); for (let y = 0; y < h; y += 22) { g.fillStyle = rgba(p.shellD, 0.5); g.fillRect(0, y, w, 3); } },
      claw(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.clawTip, 0.25, p.claw, 0.7, p.shellL, 1, p.claw]); Paint.speck(g, w, h, p.spot, 200, 4, 0.5, R); Paint.mottle(g, w, h, p.shellD, 10, 8, 20, 0.3, R); },
      tip(g, w, h, p) { Paint.vgrad(g, w, h, [0, p.clawTip, 1, p.claw]); },
      belly(g, w, h, p, R) { Paint.fill(g, w, h, p.belly); Paint.strokes(g, w, h, shade(p.belly, -0.25), 30, 60, 0, 2, 0.5, R, 0.1); },
      barnacle(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, '#5a5048', 0.4, '#d8d0c0', 1, '#f6f0e6']); Paint.strokes(g, w, h, '#8a8070', 40, 40, PI / 2, 2, 0.6, R, 0.05); },
      eye: { size: 1, paint: (g, w, h, p) => Paint.eye(g, w, h, p.eye, '#120800', '#1a0e0a'), emit: (g, w, h, p) => Paint.eye(g, w, h, shade(p.eye, -0.4), '#000', '#000') },
    },
    build(B, p) {
      B.bone('body', 'root', [0, 0.52, 0]);
      B.bone('mouth', 'body', [0, 0.5, 0.33]);
      // shell: flattened, wider than long, front edge lobed
      B.ell([0, 0.56, 0], [0.5, 0.2, 0.36], { w: 'body', slot: 'shell', seg: 28, rings: 14, deform: (v) => { if (v.z > 0.15) v.y -= (v.z - 0.15) * 0.25; v.y += sin(Math.atan2(v.x, v.z) * 7) * 0.008; } });
      B.ell([0, 0.47, 0.02], [0.42, 0.11, 0.3], { w: 'body', slot: 'belly', seg: 20, rings: 8, th0: PI * 0.5, thLen: PI * 0.5 });
      // barnacles
      const R = K.rng(7);
      for (let i = 0; i < 9; i++) { const a = R() * TAU, r = 0.1 + R() * 0.3; const x = cos(a) * r, z = sin(a) * r * 0.7; const y = 0.56 + 0.2 * Math.sqrt(max(0, 1 - (x / 0.5) ** 2 - (z / 0.36) ** 2)); const c = new THREE.CylinderGeometry(0.02 + R() * 0.015, 0.035 + R() * 0.02, 0.04 + R() * 0.03, 7, 1, true); B.geo(c, { at: [x, y + 0.01, z], rot: [z * 0.8, 0, -x * 0.8], w: 'body', slot: 'barnacle' }); }
      // eye stalks (spring)
      for (const [s, S] of SIDES) {
        B.bone('stalk' + S, 'body', [s * 0.09, 0.66, 0.3]); B.bone('eye' + S, 'stalk' + S, [s * 0.11, 0.84, 0.33]);
        B.tube([[s * 0.09, 0.66, 0.3], [s * 0.11, 0.84, 0.33]], [0.025, 0.02], { bones: ['stalk' + S, 'eye' + S], slot: 'leg', seg: 6 });
        B.ell([s * 0.11, 0.87, 0.34], [0.04, 0.045, 0.04], { w: 'eye' + S, slot: 'eye', rot: [0, s * 0.3, 0] });
      }
      // legs: 4 per side
      for (const [s, S] of SIDES) for (let i = 0; i < 4; i++) {
        const z = 0.16 - i * 0.13, ang = (i - 1.5) * 0.25;
        const hp = [s * 0.4, 0.5, z], kn = [s * 0.6, 0.66, z - ang * 0.3], ft = [s * 0.74, 0.02, z - ang * 0.5];
        const n = 'lg' + S + i;
        B.bone(n + 'a', 'body', hp); B.bone(n + 'b', n + 'a', kn); B.bone(n + 'c', n + 'b', ft);
        B.tube([hp, kn, v3(kn, [ft[0] - kn[0], ft[1] - kn[1], ft[2] - kn[2]], 0.55), ft], [0.06, 0.055, 0.04, 0.008], { bones: [n + 'a', n + 'b', n + 'b', n + 'c'], slot: 'leg', seg: 7, flat: [1, 0.7] });
      }
      // claws: right one oversized (crusher)
      for (const [s, S] of SIDES) {
        const big = s < 0 ? 1.6 : 1.0;
        const sh = [s * 0.32, 0.52, 0.3], el = [s * 0.5, 0.58, 0.5], wr = [s * 0.42, 0.62, 0.72];
        B.bone('arm' + S, 'body', sh); B.bone('fore' + S, 'arm' + S, el); B.bone('claw' + S, 'fore' + S, wr);
        const tipP = v3(wr, [-s * 0.08, 0.02, 0.28], big);
        B.bone('pin' + S, 'claw' + S, v3(wr, [-s * 0.02, -0.04, 0.1], big));
        B.tube([sh, el, wr], [0.05 * big, 0.055 * big, 0.06 * big], { bones: ['arm' + S, 'fore' + S, 'claw' + S], slot: 'leg', seg: 8 });
        // propodus (fixed finger) + palm
        B.ell(v3(wr, [0, 0, 0.06], big), [0.1 * big, 0.08 * big, 0.12 * big], { w: 'claw' + S, slot: 'claw', seg: 12, rings: 8 });
        B.tube([v3(wr, [0, 0.02, 0.14], big), v3(wr, [-s * 0.04, 0.03, 0.24], big), tipP], [0.05 * big, 0.035 * big, 0.006], { w: 'claw' + S, slot: 'tip', seg: 7, flat: [1, 0.7] });
        // dactyl (moving finger)
        const pb = v3(wr, [-s * 0.02, -0.04, 0.1], big);
        B.tube([pb, v3(pb, [-s * 0.03, -0.03, 0.12], big), v3(pb, [-s * 0.07, 0.0, 0.2], big)], [0.04 * big, 0.03 * big, 0.005], { w: 'pin' + S, slot: 'tip', seg: 7, flat: [1, 0.7] });
      }
    },
    springs: SIDES.map(([s, S]) => ({ chain: ['stalk' + S], tip: [s * 0.02, 0.18, 0.03], k: 80, d: 6, g: 0, max: 0.5 })),
    fx: {
      bubble: { n: 14, rate: 2, bone: 'mouth', box: [0.1, 0.05, 0.05], vel: [0, 0.25, 0.15], velR: [0.1, 0.05, 0.1], life: [0.8, 1.5], size: [0.04, 0.08], color: ['#ffffff', '#bff0ff'], alpha: 0.55, swirl: 5, swirlA: 0.4, add: false },
      cast: { n: 40, rate: 0, burstRate: 50, bone: 'mouth', box: [0.15, 0.1, 0.1], vel: [0, 0.3, 1.2], velR: [0.4, 0.3, 0.3], life: [0.8, 1.5], size: [0.08, 0.16], color: ['#ffffff', '#9fe8ff'], alpha: 0.6, swirl: 4, swirlA: 1, add: false },
      sand: { n: 24, rate: 0, burstRate: 40, at: [0, 0.03, 0], box: [1.6, 0.05, 0.8], vel: [0, 0.5, 0], velR: [0.4, 0.3, 0.4], g: 3, life: [0.5, 0.9], size: [0.06, 0.1], color: ['#e6cf9a', '#a08a5a'], add: false, shape: 1 },
      death: { n: 30, rate: 0, burstRate: 30, at: [0, 0.5, 0], box: [0.8, 0.4, 0.6], vel: [0, 0.6, 0], velR: [0.3, 0.3, 0.3], life: [0.8, 1.5], size: [0.06, 0.1], color: ['#ffffff', '#bff0ff'], alpha: 0.6, add: false },
    },
    clips: {
      idle(P, t) {
        P.rootM(0, sin(t * 2) * 0.01, 0, sin(t * 1.1) * 0.02, sin(t * 0.4) * 0.08, sin(t * 1.3) * 0.02);
        for (const [s, S] of SIDES) {
          P.r('arm' + S, sin(t * 1.4 + s) * 0.06, 0, 0).r('pin' + S, 0, 0, s * (0.2 + 0.2 * max(0, sin(t * (s > 0 ? 2.2 : 1.7))))); // claw clicks
          P.r('stalk' + S, sin(t * 1.9 + s * 2) * 0.12, 0, s * sin(t * 0.7) * 0.1);
          for (let i = 0; i < 4; i++) P.r('lg' + S + i + 'a', 0, 0, s * sin(t * 2.5 + i * 1.3 + s) * 0.04);
        }
        P.ch('fx_bubble', 0);
      },
      // sideways scuttle: alternating tetrapod gait
      move(P, ph) {
        for (const [s, S] of SIDES) for (let i = 0; i < 4; i++) {
          const q = ph * TAU + (i % 2 ? PI : 0) + (s > 0 ? 0 : PI);
          P.r('lg' + S + i + 'a', 0, sin(q) * 0.25, s * max(0, cos(q)) * 0.35).r('lg' + S + i + 'b', 0, 0, -s * max(0, cos(q)) * 0.25);
        }
        P.rootM(sin(ph * TAU) * 0.03, abs(sin(ph * TAU * 2)) * 0.02, 0, 0, 0, sin(ph * TAU) * 0.05);
      },
      // big crusher claw: raise, snap down, pinch
      attack(P, t, k) {
        const A = atk(k, 0.33, 0.47, 0.66), snap = seg(k, 0.4, 0.5) * (1 - seg(k, 0.7, 0.9));
        P.r('armR', -0.9 * A.a + 0.4 * A.s, 0.5 * A.a, 0).r('foreR', -0.5 * A.a + 0.3 * A.s).r('clawR', -0.4 * A.a + 0.5 * A.s).r('pinR', 0, 0, -0.55 * A.a + 0.6 * snap);
        P.r('armL', -0.3 * A.a, -0.3 * A.a, 0);
        P.rootM(0, 0.04 * A.a, 0.15 * A.s, -0.12 * A.a + 0.15 * A.s, 0.2 * A.a - 0.2 * A.s, 0);
        for (const [s, S] of SIDES) for (let i = 0; i < 4; i++) P.r('lg' + S + i + 'b', 0, 0, -s * 0.15 * A.a);
      },
      // bubble blast from the mouth
      cast(P, t, k) { const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k)); P.rootM(0, 0.06 * u, 0, -0.2 * u); for (const [s, S] of SIDES) P.r('arm' + S, -0.6 * u, s * 0.4 * u, 0).r('pin' + S, 0, 0, -s * 0.4 * u * (0.5 + 0.5 * sin(t * 18))); P.ch('fx_cast', u); },
      // double pinch + sand kick
      special(P, t, k) {
        const a1 = bump(k, 0.1, 0.45), a2 = bump(k, 0.4, 0.8);
        P.r('armR', -0.6 * a1 + 0.4 * a2).r('pinR', 0, 0, 0.5 * a1).r('armL', -0.6 * a2).r('pinL', 0, 0, -0.5 * a2);
        P.rootM(0, 0, 0.2 * (a1 + a2), 0.1 * (a1 + a2)); P.ch('fx_sand', bump(k, 0.4, 0.6) * 3);
      },
      hurt(P, t, k) { const u = (1 - E.outQ(k)) * min(1, k * 14); P.rootM(sin(t * 50) * 0.02 * u, 0.05 * u, -0.12 * u, -0.25 * u); for (const [s, S] of SIDES) P.r('arm' + S, -0.4 * u, s * 0.5 * u, 0).r('stalk' + S, -0.4 * u); },
      // flips onto its back, legs curl
      die(P, t, k) {
        const u = E.ioQ(seg(k, 0, 0.45));
        P.rootM(0, 0.35 * bump(k, 0, 0.5) + 0.28 * u, 0, 0, 0, PI * u);
        for (const [s, S] of SIDES) for (let i = 0; i < 4; i++) P.r('lg' + S + i + 'a', 0, 0, s * 0.6 * seg(k, 0.4, 0.6) + s * sin(t * 25 + i) * 0.15 * bump(k, 0.4, 0.8)).r('lg' + S + i + 'b', 0, 0, -s * 0.9 * seg(k, 0.4, 0.6));
        P.ch('dissolve', E.inQ(seg(k, 0.55, 1))); P.ch('fx_death', bump(k, 0.5, 1) * 2);
      },
      // bursts out of the sand
      enter(P, t, k) { const u = 1 - E.outBack(seg(k, 0.1, 0.8)); P.rootM(0, -0.5 * clamp(u, 0, 1.2), 0, 0.3 * u); P.ch('fx_sand', bump(k, 0, 0.5) * 3); },
    },
    dur: { attack: 1.05, special: 1.3, die: 1.7, enter: 1.2 },
    cadence: 1.4,
  });

  // ===================================================================================================
  // 魔神仔 mosina — the little red-faced mountain imp that leads hikers astray: oversized grinning head with sly
  // amber eyes, pointed ears, twig-thin dark limbs with long fingers, a cape-skirt of leaves, sprigs on the crown.
  defC('mosina', {
    height: 1.3, fill: 0.92, radius: 0.3, shadow: 0.32, rimColor: '#ffe0a0',
    pal: { face: '#d24a3a', faceD: '#7e1e1e', faceL: '#ff9a7a', limb: '#7a3a2a', limbD: '#3a1610', leaf: '#4f8a3a', leafD: '#1f4020', leafL: '#a4d06a', leaf2: '#8a7a32', eye: '#fff07a', teeth: '#f6eedc', line: '#2a0e0a', magic: '#b4f07a' },
    vars: [{ h: 40, s: 0.9, keep: ['eye', 'teeth'] }, { h: -60, s: 1.1, l: -0.05, keep: ['teeth', 'face', 'faceD', 'faceL'], set: { eye: '#9af0ff' } }],
    slots: {
      face: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.faceL, 0.5, p.face, 1, p.faceD]); Paint.mottle(g, w, h, p.faceD, 50, 8, 30, 0.35, R); Paint.speck(g, w, h, p.faceD, 200, 2, 0.4, R);
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.07), y = FY(h, 0.58);
          g.fillStyle = p.faceD; g.beginPath(); g.ellipse(x, y, 22, 17, s * 0.4, 0, TAU); g.fill();
          g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 17, 12, s * 0.4, 0, TAU); g.fill();
          g.fillStyle = '#1a0800'; g.beginPath(); g.ellipse(x + s * 3, y, 4, 9, 0, 0, TAU); g.fill();
          g.strokeStyle = p.line; g.lineWidth = 5; g.beginPath(); g.moveTo(x - s * 24, y - 14); g.lineTo(x + s * 18, y - 24); g.stroke(); } // sly brows
        const mx = FX(w, 0.5), my = FY(h, 0.4);
        g.fillStyle = '#2a0808'; g.beginPath(); g.moveTo(mx - 62, my - 12); g.quadraticCurveTo(mx, my + 48, mx + 62, my - 12); g.quadraticCurveTo(mx, my + 12, mx - 62, my - 12); g.fill();
        g.fillStyle = p.teeth; for (let i = -5; i <= 5; i++) { const x = mx + i * 10; g.beginPath(); g.moveTo(x - 5, my + 2 - abs(i) * 1.4); g.lineTo(x + 5, my + 2 - abs(i) * 1.4); g.lineTo(x, my + 14 - abs(i) * 1.5); g.fill(); }
        g.fillStyle = p.faceD; g.beginPath(); g.ellipse(mx, FY(h, 0.49), 8, 6, 0, 0, TAU); g.fill(); // nostrils
      }, emit(g, w, h, p) { for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.07), y = FY(h, 0.58); g.fillStyle = shade(p.eye, -0.45); g.beginPath(); g.ellipse(x, y, 16, 11, s * 0.4, 0, TAU); g.fill(); } } },
      limb(g, w, h, p, R) { Paint.fill(g, w, h, p.limb); Paint.strokes(g, w, h, p.limbD, 80, 40, PI / 2, 2, 0.5, R, 0.1); Paint.mottle(g, w, h, p.limbD, 10, 6, 20, 0.4, R); },
      leaf(g, w, h, p, R) {
        g.clearRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, p.leafD); gr.addColorStop(0.5, p.leaf); gr.addColorStop(1, p.leafD);
        g.fillStyle = gr; g.beginPath(); g.moveTo(w / 2, 0); g.bezierCurveTo(w * 1.05, h * 0.25, w * 0.95, h * 0.75, w / 2, h); g.bezierCurveTo(w * 0.05, h * 0.75, -w * 0.05, h * 0.25, w / 2, 0); g.fill();
        g.strokeStyle = p.leafL; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
        g.lineWidth = 1.5; for (let y = 20; y < h - 10; y += 22) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w * 0.15, y + 18); g.moveTo(w / 2, y); g.lineTo(w * 0.85, y + 18); g.stroke(); }
        Paint.mottle(g, w, h, p.leaf2, 6, 6, 18, 0.5, R);
      },
      leafy(g, w, h, p, R) { Paint.fill(g, w, h, p.leafD); for (let i = 0; i < 60; i++) { const x = R() * w, y = R() * h; g.fillStyle = [p.leaf, p.leafL, p.leaf2, p.leafD][i % 4]; g.beginPath(); g.ellipse(x, y, 10, 22, R() * PI, 0, TAU); g.fill(); } },
      ear(g, w, h, p) { Paint.vgrad(g, w, h, [0, p.faceD, 1, p.face]); },
      nail: (g, w, h, p) => Paint.fill(g, w, h, p.limbD),
    },
    build(B, p) {
      const J = humanRig(B, { hip: 0.62, chest: 0.82, neck: 0.92, head: 0.96, headZ: 0.03, shY: 0.86, sh: 0.11, up: 0.3, fore: 0.3, arm1: [0.6, -1, 0.1], arm2: [0.3, -0.5, 1], lx: 0.09, knee: 0.32, kneeZ: 0.08, kneeX: 1.4 });
      for (const [s, S] of SIDES) B.bone('ear' + S, 'head', [s * 0.2, 1.14, 0]);
      const sprig = [[0, 1.38, -0.02, 0], [0.08, 1.35, -0.06, 0.5], [-0.08, 1.35, -0.05, -0.5]];
      sprig.forEach(([x, y, z, a], i) => { B.bone('sp' + i, 'head', [x * 0.6, 1.3, z]); B.bone('sq' + i, 'sp' + i, [x, y + 0.1, z]); });
      // big head
      B.ell([0, 1.12, 0.04], [0.2, 0.19, 0.18], { w: 'head', slot: 'face', seg: 24, rings: 16, deform: (v) => { v.x *= 1 + max(0, (v.y - 1.0)) * 0.6; } });
      for (const [s, S] of SIDES) B.geo(new THREE.ConeGeometry(0.06, 0.24, 7), { at: [s * 0.26, 1.16, 0], rot: [0, 0, -s * 1.2], scale: [1, 1, 0.5], w: 'ear' + S, slot: 'ear' });
      // leafy crown + sprigs
      B.ell([0, 1.25, -0.0], [0.17, 0.08, 0.15], { w: 'head', slot: 'leafy', th0: 0, thLen: PI * 0.5, seg: 14, rings: 6 });
      sprig.forEach(([x, y, z, a], i) => { B.tube([[x * 0.6, 1.28, z], [x, y + 0.1, z]], [0.012, 0.006], { bones: ['sp' + i, 'sq' + i], slot: 'limb', seg: 5 }); B.strip([[x, y + 0.08, z], [x * 1.4, y + 0.22, z]], 0.1, { bones: ['sq' + i, 'sq' + i], slot: 'leaf', side: [cos(a), 0, sin(a)] }); });
      // torso (thin) + neck
      B.tube([[0, 0.55, 0], [0, 0.72, 0.01], [0, 0.88, 0.02], [0, 0.98, 0.03]], [0.08, 0.09, 0.075, 0.04], { bones: ['hips', 'spine', 'chest', 'neck'], slot: 'limb', seg: 10 });
      // leaf cape-skirt: rings of leaf cards
      const rng = K.rng(3);
      for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + ring * 0.3, r = 0.09 + ring * 0.02, y0 = 0.9 - ring * 0.16;
        const top = [sin(a) * r, y0, cos(a) * r], bot = [sin(a) * (r + 0.12), y0 - 0.2 - rng() * 0.05, cos(a) * (r + 0.12)];
        B.strip([top, bot], 0.13, { bones: [ring ? 'hips' : 'chest', ring ? 'hips' : 'spine'], slot: 'leaf', side: [cos(a), 0, -sin(a)] });
      }
      // limbs: twig-thin with knobby joints, long fingers
      for (const [s, S] of SIDES) {
        limb(B, J['sh' + S], J['el' + S], J['hand' + S], [0.03, 0.025, 0.02], ['sh' + S, 'arm' + S, 'hand' + S], { slot: 'limb' });
        B.ell(J['el' + S], [0.03, 0.03, 0.03], { w: 'arm' + S, slot: 'limb' });
        claw(B, S, s, J['hand' + S], [0.15, -0.7, 0.6], { size: 0.05, n: 3, curl: 0.6, slot: 'limb', nailSlot: 'nail', nailLen: 0.5 });
        limb(B, J['hip' + S], J['knee' + S], J['foot' + S], [0.035, 0.03, 0.025], ['leg' + S, 'knee' + S, 'foot' + S], { slot: 'limb' });
        B.ell(J['knee' + S], [0.035, 0.035, 0.035], { w: 'knee' + S, slot: 'limb' });
        B.ell(v3(J['foot' + S], [0, -0.03, 0.06]), [0.045, 0.03, 0.1], { w: 'foot' + S, slot: 'limb' });
      }
    },
    springs: [0, 1, 2].map((i) => ({ chain: ['sp' + i, 'sq' + i], tip: [0, 0.14, 0], k: 90, d: 6, g: -1, max: 0.6 })).concat(SIDES.map(([s, S]) => ({ chain: ['ear' + S], tip: [s * 0.2, 0, 0], k: 140, d: 9, g: 0, max: 0.3 }))),
    fx: {
      leaves: { n: 10, rate: 1.5, at: [0, 0.6, 0], box: [0.5, 0.4, 0.4], vel: [0, -0.1, 0], velR: [0.2, 0.1, 0.2], g: 0.6, life: [1.2, 2.2], size: [0.06, 0.1], color: ['#a4d06a', '#4f8a3a'], add: false, shape: 1, swirl: 4, swirlA: 0.8 },
      cast: { n: 40, rate: 0, burstRate: 50, at: [0, 0.6, 0], ring: 0.5, box: [0, 0.6, 0], vel: [0, 0.8, 0], velR: [0.2, 0.3, 0.2], life: [0.8, 1.4], size: [0.07, 0.12], color: ['#b4f07a', '#4f8a3a'], add: false, shape: 1, swirl: 7, swirlA: 3 },
      giggle: { n: 16, rate: 0, burstRate: 20, bone: 'head', at: [0, 0.1, 0.2], box: [0.3, 0.2, 0.1], vel: [0, 0.4, 0.2], velR: [0.3, 0.2, 0.2], life: [0.5, 0.9], size: [0.05, 0.08], color: ['#fff07a', '#ffb03a'], shape: 3, twinkle: 12 },
      death: { n: 36, rate: 0, burstRate: 40, at: [0, 0.7, 0], box: [0.5, 0.9, 0.4], vel: [0, 0.3, 0], velR: [0.5, 0.4, 0.5], g: 0.5, life: [1, 1.8], size: [0.07, 0.11], color: ['#a4d06a', '#8a7a32'], add: false, shape: 1, swirl: 5, swirlA: 1.5 },
    },
    clips: {
      // mischievous: bouncing on the balls of its feet, head tilting, fingers twiddling
      idle(P, t) {
        const b = abs(sin(t * 3.2));
        P.rootM(0, b * 0.025, 0, 0.05, sin(t * 0.6) * 0.2, sin(t * 1.6) * 0.06);
        P.r('head', sin(t * 1.1) * 0.08, sin(t * 0.8) * 0.25, sin(t * 1.6) * 0.15);
        for (const [s, S] of SIDES) { P.r('knee' + S, 0.25 + b * 0.15).r('leg' + S, -0.15 - b * 0.07).r('foot' + S, -0.1); P.r('sh' + S, -0.2 + sin(t * 2.6 + s) * 0.15, 0, s * 0.1).r('arm' + S, -0.3).r('hand' + S, sin(t * 5 + s) * 0.3); }
      },
      // skipping hop
      move(P, ph) {
        const u = ph % 1, air = sin(u * PI);
        P.rootM(0, air * 0.12, 0, 0.15, 0, sin(ph * PI) * 0.1);
        for (const [s, S] of SIDES) { const q = sin(ph * TAU + (s > 0 ? 0 : PI)); P.r('leg' + S, -0.6 * q).r('knee' + S, 0.4 + 0.4 * max(0, -q)); P.r('sh' + S, 0.5 * q, 0, s * 0.3); }
      },
      // pounce & claw rake
      attack(P, t, k) {
        const A = atk(k, 0.3, 0.44, 0.62);
        P.rootM(0, 0.15 * bump(k, 0.3, 0.55), -0.05 * A.a + 0.35 * A.s, -0.2 * A.a + 0.35 * A.s);
        P.r('shR', -1.8 * A.a + 1.2 * A.s, 0, -0.4 * A.a).r('armR', -0.6 * A.a).r('handR', 0.6 * A.s);
        P.r('shL', -0.8 * A.a + 0.6 * A.s, 0, 0.5 * A.a);
        for (const [s, S] of SIDES) P.r('knee' + S, 0.7 * A.a).r('leg' + S, -0.4 * A.a);
        P.r('head', -0.2 * A.a + 0.2 * A.s);
      },
      // 牽人 trick: spins and giggles, leaves whirl
      cast(P, t, k) { const u = sm(0, 0.25, k) * (1 - sm(0.85, 1, k)); P.rootM(0, 0.05 * u, 0, 0, E.ioQ(seg(k, 0.1, 0.8)) * TAU, 0); for (const [s, S] of SIDES) P.r('sh' + S, -0.5 * u, 0, s * 1.2 * u); P.r('head', -0.3 * u); P.ch('fx_cast', u); P.ch('fx_giggle', bump(k, 0.6, 0.9) * 2); },
      // "feast" offering: crouches, offers cupped hands (mud & grasshoppers), cackles
      special(P, t, k) { const u = bump(k, 0.1, 0.9); P.rootM(0, -0.05 * u, 0.1 * u, 0.2 * u); for (const [s, S] of SIDES) P.r('sh' + S, -1.2 * u, 0, -s * 0.2 * u).r('arm' + S, -0.5 * u).r('knee' + S, 0.6 * u).r('leg' + S, -0.4 * u); P.r('head', -0.2 * u, 0, sin(t * 12) * 0.1 * u); P.ch('fx_giggle', u); },
      hurt(P, t, k, C) { GEN.hurt(P, t, k, C); const u = (1 - E.outQ(k)) * min(1, k * 14); P.s('head', 0.08 * u, -0.08 * u, 0.08 * u); },
      die(P, t, k, C) { const u = E.ioQ(seg(k, 0, 0.4)); P.rootM(0, 0, 0, 0, u * 4, 0, -0.4 * u); P.ch('dissolve', E.inQ(seg(k, 0.25, 0.9))); P.ch('fx_death', bump(k, 0.2, 0.9) * 2); },
      // drops in from the canopy
      enter(P, t, k) { const u = 1 - E.outC(seg(k, 0, 0.6)); const land = bump(k, 0.55, 0.8); P.rootM(0, 1.4 * u * u, 0, 0, 0, 0, -0.15 * land); for (const [s, S] of SIDES) P.r('knee' + S, 0.8 * land).r('leg' + S, -0.4 * land); P.ch('fx_leaves', bump(k, 0, 0.6) * 4); },
    },
    dur: { attack: 0.9, cast: 1.4, special: 1.5, enter: 1.1 },
    cadence: 1.3,
  });

  // ===================================================================================================
  // 蕈精 mushroom_imp — a moon-soaked mist-forest mushroom that waddles: psychedelic glowing cap (spots slowly
  // cycle colour), pink gills, shy face on the stem, stubby arms; little glowing mushrooms sprout around its feet.
  defC('mushroom_imp', {
    height: 1.2, fill: 0.92, radius: 0.4, shadow: 0.42, rimColor: '#fff0ff',
    pal: { stem: '#efe2c8', stemD: '#a8906e', stemL: '#fffaf0', gill: '#f6c6e6', eye: '#1a1030', line: '#3a2440', magic: '#ff8ae8', base: '#ff3fa8' },
    vars: [{ set: { base: '#3fe0ff', magic: '#7affd8' } }, { set: { base: '#ffd23f', magic: '#ffb04a', stem: '#d8c8f0', stemD: '#7a64a0', stemL: '#f4ecff' } }],
    slots: {
      cap: { size: 4, paint(g, w, h, p, R) {
        // rainbow psychedelic dome: base hue bands + spots
        const hues = [0, -25, 30, 0, 190, -60, 0];
        const gr = g.createLinearGradient(0, 0, 0, h); hues.forEach((hh, i) => gr.addColorStop(i / (hues.length - 1), K.hueShift(p.base, hh, 1, -0.05)));
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h * 0.85, r = 8 + R() * 14; g.fillStyle = rgba('#fffaf0', 0.8); g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.fill(); g.fillStyle = K.hueShift(p.base, R() * 360, 1, 0.15); g.beginPath(); g.ellipse(x, y, r * 0.65, r * 0.5, 0, 0, TAU); g.fill(); }
        g.fillStyle = shade(p.base, -0.4); g.fillRect(0, h * 0.95, w, h * 0.05);
      }, emit(g, w, h, p, R) {
        Paint.fill(g, w, h, shade(p.base, -0.7));
        for (let i = 0; i < 26; i++) { const x = R() * w, y = R() * h * 0.85, r = 8 + R() * 14; R(); g.fillStyle = shade(K.hueShift(p.base, R() * 360, 1, 0.1), -0.25); g.beginPath(); g.ellipse(x, y, r * 0.65, r * 0.5, 0, 0, TAU); g.fill(); }
      } },
      gill(g, w, h, p) { Paint.fill(g, w, h, p.gill); g.strokeStyle = shade(p.gill, -0.3); g.lineWidth = 2; for (let x = 0; x < w; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } },
      face: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.stemL, 0.6, p.stem, 1, p.stemD]); Paint.strokes(g, w, h, p.stemD, 80, 40, PI / 2, 1.5, 0.3, R, 0.1);
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.085), y = FY(h, 0.6);
          g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 30, 38, 0, 0, TAU); g.fill();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - 9, y - 13, 12, 0, TAU); g.fill(); g.beginPath(); g.arc(x + 9, y + 12, 6, 0, TAU); g.fill();
          g.fillStyle = rgba(p.magic, 0.55); g.beginPath(); g.ellipse(x + s * 22, y + 30, 16, 9, 0, 0, TAU); g.fill(); } // blush
        const mx = FX(w, 0.5), my = FY(h, 0.47); g.strokeStyle = p.eye; g.lineWidth = 4; g.beginPath(); g.arc(mx, my - 6, 9, 0.2 * PI, 0.8 * PI); g.stroke();
      } },
      stem(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.stemL, 1, p.stemD]); Paint.strokes(g, w, h, p.stemD, 60, 30, PI / 2, 1.2, 0.3, R, 0.1); },
      baby: { size: 1, paint: (g, w, h, p) => Paint.vgrad(g, w, h, [0, K.hueShift(p.base, 180), 1, p.base]), emit: (g, w, h, p) => Paint.vgrad(g, w, h, [0, shade(K.hueShift(p.base, 180), -0.3), 1, shade(p.base, -0.4)]) },
    },
    build(B, p) {
      B.bone('hips', 'root', [0, 0.25, 0]); B.bone('body', 'hips', [0, 0.45, 0]); B.bone('head', 'body', [0, 0.7, 0]);
      B.bone('cap', 'head', [0, 0.82, 0]);
      for (const [s, S] of SIDES) { B.bone('arm' + S, 'body', [s * 0.21, 0.48, 0.03]); B.bone('hand' + S, 'arm' + S, [s * 0.34, 0.36, 0.08]); B.bone('foot' + S, 'hips', [s * 0.12, 0.06, 0.04]); }
      // stem body (face on the front)
      B.lathe([[0.22, 0.04], [0.26, 0.12], [0.26, 0.3], [0.23, 0.5], [0.19, 0.68], [0.16, 0.8]], { w: B.keyW([[0.15, 'hips'], [0.45, 'body'], [0.72, 'head']]), slot: 'face', seg: 24, uvMap: (x, y, z, u, v) => [u, lerp(0.1, 0.95, v)] });
      // cap: dome with rolled rim, gills underneath
      const capP = []; for (let i = 0; i <= 12; i++) { const a = (i / 12) * PI / 2; capP.push([cos(a) * 0.52 + (i < 2 ? 0.02 : 0), 0.78 + sin(a) * 0.36]); }
      capP.unshift([0.5, 0.74]);
      B.lathe(capP, { w: 'cap', slot: 'cap', seg: 30, wobble: (y, a) => sin(a * 5) * 0.02 * sm(0.9, 0.78, y) });
      B.lathe([[0.17, 0.8], [0.35, 0.77], [0.5, 0.74]], { w: 'cap', slot: 'gill', seg: 30 });
      // stubby arms, feet
      for (const [s, S] of SIDES) {
        B.tube([[s * 0.2, 0.5, 0.03], [s * 0.3, 0.42, 0.06], [s * 0.34, 0.36, 0.08]], [0.05, 0.045, 0.04], { bones: ['arm' + S, 'arm' + S, 'hand' + S], slot: 'stem', seg: 8, cap1: true });
        B.ell([s * 0.13, 0.05, 0.08], [0.09, 0.05, 0.11], { w: 'foot' + S, slot: 'stem' });
      }
      // baby glowing mushrooms around the feet (on root)
      for (const [x, z, sc] of [[0.42, 0.2, 1], [-0.45, 0.1, 0.8], [0.3, -0.3, 0.7], [-0.25, 0.38, 0.6]]) {
        B.tube([[x, 0, z], [x, 0.1 * sc, z]], [0.02 * sc, 0.015 * sc], { w: 'root', slot: 'stem', seg: 6 });
        B.ell([x, 0.1 * sc, z], [0.06 * sc, 0.045 * sc, 0.06 * sc], { w: 'root', slot: 'baby', th0: 0, thLen: PI * 0.55, seg: 10, rings: 5 });
      }
    },
    fx: {
      spores: { n: 30, rate: 10, at: [0, 0.75, 0], ring: 0.5, box: [0, 0.1, 0], vel: [0, -0.05, 0], velR: [0.1, 0.06, 0.1], life: [1.5, 3], size: [0.035, 0.06], color: ['#ffffff', '#ff8ae8'], swirl: 2, swirlA: 0.3, twinkle: 6 },
      cast: { n: 50, rate: 0, burstRate: 60, at: [0, 1.0, 0], box: [0.5, 0.2, 0.5], vel: [0, 0.4, 0.4], velR: [0.6, 0.3, 0.6], life: [1.2, 2], size: [0.06, 0.12], color: ['#ff8ae8', '#7affd8'], swirl: 3, swirlA: 1.2, twinkle: 5, drag: 0.8 },
      death: { n: 40, rate: 0, burstRate: 40, at: [0, 0.8, 0], box: [0.8, 0.4, 0.8], vel: [0, 0.2, 0], velR: [0.4, 0.3, 0.4], life: [1.2, 2.2], size: [0.05, 0.09], color: ['#ffffff', '#ff8ae8'], twinkle: 8 },
    },
    lights: (C) => [{ bone: 'cap', at: [0, 0.1, 0], color: C.p.base, i: 0.8, r: 3, flicker: 0.05 }],
    tick(C) { C.glowBase = 1 + 0.35 * sin(C.t * 1.7) + 0.15 * sin(C.t * 4.3); },
    clips: {
      idle(P, t) {
        const b = sin(t * 2.2);
        P.s('body', 0.03 * b, -0.04 * b, 0.03 * b).r('cap', sin(t * 1.1) * 0.06, sin(t * 0.4) * 0.2, sin(t * 1.4) * 0.05).r('head', 0, 0, sin(t * 0.9) * 0.08);
        for (const [s, S] of SIDES) P.r('arm' + S, sin(t * 1.8 + s) * 0.15, 0, s * 0.1 * b);
      },
      // waddle: side-to-side rocking
      move(P, ph) { const a = sin(ph * TAU); P.rootM(0, abs(a) * 0.03, 0, 0, 0, a * 0.12); P.r('cap', 0, 0, -a * 0.1); for (const [s, S] of SIDES) { P.p('foot' + S, 0, max(0, a * s) * 0.05, 0); P.r('arm' + S, 0.4 * a * s); } },
      // head-butt with the cap (bonk)
      attack(P, t, k) { const A = atk(k, 0.35, 0.48, 0.66); P.rootM(0, 0.12 * bump(k, 0.3, 0.55), 0.3 * A.s, -0.3 * A.a + 0.55 * A.s, 0, 0, 0.12 * A.a - 0.1 * A.s); P.r('cap', 0.3 * A.s); for (const [s, S] of SIDES) P.r('arm' + S, 0.6 * A.a, 0, s * 0.6 * A.a); },
      // spore puff: squash down, cap pumps, cloud
      cast(P, t, k) { const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k)), pump = max(0, sin(t * 14)) * u; P.rootM(0, 0, 0, 0, 0, 0, -0.12 * pump); P.s('cap', 0.12 * pump, -0.1 * pump, 0.12 * pump); for (const [s, S] of SIDES) P.r('arm' + S, -1.2 * u); P.ch('fx_cast', u); P.ch('glow', u * 1.2); },
      special(P, t, k, C) { this.cast(P, t, k, C); P.ch('fx_spores', bump(k, 0.2, 0.9) * 5); },
      hurt(P, t, k) { const u = (1 - E.outQ(k)) * min(1, k * 14); P.rootM(0, 0, -0.1 * u, -0.3 * u, 0, 0, -0.15 * u); P.r('cap', -0.3 * u); },
      die(P, t, k) { const u = E.ioQ(seg(k, 0, 0.5)); P.rootM(0, 0, 0, 0, 0, 0, -0.5 * u); P.r('cap', 0.3 * u, 0, 0.4 * u); P.ch('dissolve', E.inQ(seg(k, 0.3, 1))); P.ch('fx_death', bump(k, 0.2, 0.9) * 2); P.ch('glow', -0.8 * u); },
      // pops up out of the ground
      enter(P, t, k) { const u = 1 - E.outBack(seg(k, 0, 0.8)); P.rootM(0, -0.6 * clamp(u, 0, 1.3), 0, 0, 0, 0, 0.3 * u); P.ch('fx_spores', bump(k, 0.4, 1) * 4); },
    },
    dur: { attack: 0.95, cast: 1.5 },
    cadence: 1.2,
  });
})();

// ----------------------------------------------------------------------------------------------------- batch: forest beasts & stone
(() => {
  const K = G.Mon3D.kit, defC = G.Mon3D._defC;
  const { Paint, GEN, E, atk, bump, seg, sm, clamp, lerp, shade, mix, rgba } = K;
  const { humanRig, limb, claw, breathe, FX, FY, v3, nrm, SIDES } = K.H;
  const TAU = Math.PI * 2, PI = Math.PI, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
  const furSlot = (base, dark, light, n = 260) => (g, w, h, p, R) => { Paint.fill(g, w, h, p[base]); Paint.mottle(g, w, h, p[dark], 30, 8, 30, 0.35, R); Paint.strokes(g, w, h, p[dark], n, 12, PI / 2, 1.4, 0.45, R, 0.6); Paint.strokes(g, w, h, p[light], n / 2, 9, PI / 2, 1, 0.35, R, 0.6); };
  // bamboo culm: v runs along the culm, nodes every 1/n
  const caneSlot = (n) => (g, w, h, p, R) => {
    Paint.hgrad(g, w, h, [0, p.caneD, 0.35, p.cane, 0.55, p.caneL, 0.8, p.cane, 1, p.caneD]);
    Paint.strokes(g, w, h, p.caneD, 50, 60, PI / 2, 1, 0.25, R, 0.02);
    for (let i = 0; i <= n; i++) { const y = (i / n) * h; g.fillStyle = p.node; g.fillRect(0, y - 4, w, 8); g.fillStyle = rgba(p.caneL, 0.7); g.fillRect(0, y + 4, w, 2); }
    Paint.mottle(g, w, h, '#e8f0b0', 8, 6, 16, 0.25, R);
  };

  // ===================================================================================================
  // 竹精 bamboo_spirit — a century-old bamboo grove gone sentient: a bundle of culms lashed with rope for a torso,
  // a cut-culm head with carved glowing eyes, jointed cane limbs, leaf-frond hands; leaves whisper and fall.
  defC('bamboo_spirit', {
    height: 2.0, fill: 0.93, radius: 0.32, shadow: 0.34, rimColor: '#f0ffd0',
    pal: { cane: '#8cc04a', caneD: '#3e6a24', caneL: '#d8f09a', node: '#5a8a2e', leaf: '#5aa63e', leafD: '#22501c', leafL: '#b0e07a', rope: '#c8a464', eye: '#d6ff8a', hollow: '#1a2a10', line: '#1e3812', magic: '#c8ff8a' },
    vars: [{ h: -50, s: 0.8, l: 0.02, keep: ['rope'], set: { eye: '#ffe08a' } }, { h: 150, s: 0.7, l: -0.05, keep: ['rope'], set: { eye: '#ff8ae0' } }],
    slots: {
      cane: caneSlot(3), cane1: caneSlot(1),
      head: { size: 4, paint(g, w, h, p, R) {
        caneSlot(2)(g, w, h, p, R);
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.08), y = FY(h, 0.6); g.fillStyle = p.hollow; g.beginPath(); g.ellipse(x, y, 20, 14, s * -0.2, 0, TAU); g.fill(); g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 11, 8, 0, 0, TAU); g.fill(); }
        const mx = FX(w, 0.5), my = FY(h, 0.36); g.fillStyle = p.hollow; g.beginPath(); g.ellipse(mx, my, 26, 9, 0, 0, TAU); g.fill();
      }, emit(g, w, h, p) { for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.08), y = FY(h, 0.6); const gr = g.createRadialGradient(x, y, 0, x, y, 14); gr.addColorStop(0, p.eye); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(x - 14, y - 14, 28, 28); } } },
      hollow(g, w, h, p) { Paint.fill(g, w, h, p.hollow); g.strokeStyle = p.caneL; g.lineWidth = 10; g.strokeRect(0, 0, w, h); },
      rope(g, w, h, p, R) { Paint.fill(g, w, h, p.rope); g.strokeStyle = shade(p.rope, -0.4); g.lineWidth = 3; for (let x = -h; x < w; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h * 0.5, h); g.stroke(); } },
      leaf(g, w, h, p, R) {
        g.clearRect(0, 0, w, h);
        for (let i = 0; i < 3; i++) { const cx = w * (0.25 + i * 0.25); const gr = g.createLinearGradient(cx - 20, 0, cx + 20, 0); gr.addColorStop(0, p.leafD); gr.addColorStop(0.5, i === 1 ? p.leafL : p.leaf); gr.addColorStop(1, p.leafD);
          g.fillStyle = gr; g.beginPath(); g.moveTo(cx, 0); g.quadraticCurveTo(cx + 34, h * 0.4, cx, h); g.quadraticCurveTo(cx - 34, h * 0.4, cx, 0); g.fill(); g.strokeStyle = rgba(p.leafL, 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(cx, 0); g.lineTo(cx, h); g.stroke(); }
      },
    },
    build(B, p) {
      const J = humanRig(B, { hip: 0.95, chest: 1.38, neck: 1.5, head: 1.55, shY: 1.42, sh: 0.2, up: 0.3, fore: 0.3, arm1: [0.5, -1, 0.1], arm2: [0.2, -0.6, 0.8], lx: 0.09, knee: 0.5 });
      // head: thick cut culm, slanted open top
      B.tube([[0, 1.52, 0], [0, 1.78, 0], [0, 1.95, 0]], [0.13, 0.13, 0.13], { w: 'head', slot: 'head', seg: 20, cap0: true });
      const top = new THREE.CircleGeometry(0.125, 20); top.rotateX(-PI / 2 + 0.35);
      B.geo(top, { at: [0, 1.94, 0], w: 'head', slot: 'hollow' });
      for (let i = 0; i < 3; i++) { const a = -0.6 + i * 0.6; B.bone('lf' + i, 'head', [sin(a) * 0.12, 1.92, -0.06]); B.strip([[sin(a) * 0.12, 1.92, -0.06], [sin(a) * 0.25, 2.12, -0.1]], 0.2, { bones: ['lf' + i, 'lf' + i], slot: 'leaf', side: [cos(a), 0, 0.3] }); }
      // torso: bundle of 5 culms lashed with rope
      const R = K.rng(5);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU, r = 0.1; B.tube([[sin(a) * r, 0.88 - R() * 0.06, cos(a) * r * 0.8], [sin(a) * r * 1.1, 1.2, cos(a) * r * 0.85], [sin(a) * r, 1.45 + R() * 0.06, cos(a) * r * 0.8]], 0.075, { bones: ['hips', 'spine', 'chest'], slot: 'cane', seg: 10, cap0: true, cap1: 0.3 }); }
      for (const y of [1.0, 1.32]) B.tube([[0.2, y, 0], [0, y, 0.18], [-0.2, y, 0], [0, y, -0.18], [0.2, y, 0]], 0.025, { w: y < 1.1 ? 'hips' : 'chest', slot: 'rope', seg: 6, sub: 3, flat: [1, 1] });
      // shoulder yoke culm
      B.tube([[-0.24, 1.42, 0], [0.24, 1.42, 0]], 0.055, { bones: ['shR', 'shL'], slot: 'cane1', seg: 8, cap0: true, cap1: true });
      // limbs: canes with node knobs; leaf-frond hands
      for (const [s, S] of SIDES) {
        limb(B, J['sh' + S], J['el' + S], J['hand' + S], [0.045, 0.04, 0.035], ['sh' + S, 'arm' + S, 'hand' + S], { slot: 'cane' });
        B.ell(J['el' + S], [0.05, 0.035, 0.05], { w: 'arm' + S, slot: 'cane1' });
        B.bone('fr' + S, 'hand' + S, v3(J['hand' + S], [0, -0.02, 0.02]));
        for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.6; B.strip([v3(J['hand' + S], [0, 0, 0]), v3(J['hand' + S], [s * sin(a) * 0.12 + s * 0.04, -0.2, cos(a) * 0.06 + 0.04])], 0.12, { bones: ['fr' + S, 'fr' + S], slot: 'leaf', side: [cos(a), 0, -s * sin(a)] }); }
        limb(B, J['hip' + S], J['knee' + S], J['foot' + S], [0.06, 0.055, 0.05], ['leg' + S, 'knee' + S, 'foot' + S], { slot: 'cane' });
        B.ell(J['knee' + S], [0.065, 0.045, 0.065], { w: 'knee' + S, slot: 'cane1' });
        // root-feet
        for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.7; B.tube([[s * 0.09, 0.08, 0], [s * 0.09 + sin(a) * 0.14, 0.01, cos(a) * 0.14]], [0.025, 0.008], { w: 'foot' + S, slot: 'cane1', seg: 5 }); }
      }
    },
    springs: [0, 1, 2].map((i) => ({ chain: ['lf' + i], tip: [0, 0.2, -0.04], k: 70, d: 5, g: 1, wind: 3, max: 0.6 })).concat(SIDES.map(([s, S]) => ({ chain: ['fr' + S], tip: [0, -0.2, 0.04], k: 60, d: 5, g: 2, wind: 2, max: 0.7 }))),
    fx: {
      leaves: { n: 12, rate: 2, at: [0, 1.6, 0], box: [0.6, 0.6, 0.4], vel: [0.1, -0.1, 0], velR: [0.2, 0.1, 0.2], g: 0.4, life: [1.5, 2.6], size: [0.07, 0.11], color: ['#b0e07a', '#5aa63e'], add: false, shape: 1, swirl: 4, swirlA: 0.8 },
      spikes: { n: 30, rate: 0, burstRate: 60, at: [0, 0.05, 0.8], box: [1.2, 0.05, 0.6], vel: [0, 1.6, 0], velR: [0.2, 0.4, 0.2], g: 4, life: [0.4, 0.7], size: [0.08, 0.14], color: ['#d8f09a', '#3e6a24'], add: false, shape: 1 },
      cast: { n: 40, rate: 0, burstRate: 50, at: [0, 1.0, 0], ring: 0.6, box: [0, 1.2, 0], vel: [0, 0.4, 0], velR: [0.2, 0.3, 0.2], life: [1, 1.6], size: [0.07, 0.12], color: ['#c8ff8a', '#3e6a24'], add: false, shape: 1, swirl: 6, swirlA: 2.5 },
      death: { n: 40, rate: 0, burstRate: 40, at: [0, 1.0, 0], box: [0.5, 1.6, 0.4], vel: [0, 0.2, 0], velR: [0.5, 0.3, 0.5], g: 0.5, life: [1.2, 2], size: [0.08, 0.12], color: ['#b0e07a', '#8a7a32'], add: false, shape: 1, swirl: 5, swirlA: 1.5 },
    },
    clips: {
      // creaking sway like a culm in wind
      idle(P, t) {
        P.rootM(0, 0, 0, sin(t * 0.9) * 0.03, 0, sin(t * 0.7) * 0.04);
        P.r('spine', 0, 0, sin(t * 0.7 + 0.5) * 0.04).r('chest', 0, sin(t * 0.5) * 0.06, sin(t * 0.7 + 1) * 0.04).r('head', sin(t * 0.8) * 0.05, sin(t * 0.4) * 0.2, sin(t * 0.7 + 1.5) * 0.05);
        for (const [s, S] of SIDES) P.r('sh' + S, sin(t * 0.9 + s) * 0.08, 0, s * sin(t * 0.7) * 0.05).r('hand' + S, sin(t * 1.3 + s) * 0.15);
      },
      move(P, ph) { const a = sin(ph * TAU); for (const [s, S] of SIDES) { P.r('leg' + S, -0.35 * a * s).r('knee' + S, max(0, 0.6 * a * s)).r('sh' + S, 0.25 * a * s); } P.rootM(0, abs(cos(ph * TAU)) * 0.03, 0, 0.05, 0, a * 0.05); },
      // whip-slash with the cane arm, bamboo spikes erupt from the ground
      attack(P, t, k) {
        const A = atk(k, 0.32, 0.45, 0.65);
        P.r('shR', -1.6 * A.a + 1.0 * A.s, 0, -0.6 * A.a + 0.3 * A.s).r('armR', -0.4 * A.a + 0.3 * A.s).r('handR', 0.4 * A.s);
        P.r('chest', -0.1 * A.a + 0.2 * A.s, 0.3 * A.a - 0.4 * A.s).r('spine', 0, 0.2 * A.a - 0.2 * A.s);
        P.rootM(0, 0, 0.15 * A.s, 0.12 * A.s); P.ch('fx_spikes', bump(k, 0.44, 0.6) * 3);
      },
      // 沙沙 rustle: shivers, leaves whirl
      cast(P, t, k) { const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k)); P.rootM(sin(t * 30) * 0.01 * u, 0.04 * u, 0, sin(t * 25) * 0.02 * u); for (const [s, S] of SIDES) P.r('sh' + S, -1.0 * u, 0, s * 0.8 * u).r('hand' + S, sin(t * 20 + s) * 0.3 * u); P.r('head', -0.2 * u); P.ch('fx_cast', u); P.ch('glow', u); },
      hurt(P, t, k, C) { GEN.hurt(P, t, k, C); P.ch('fx_leaves', (1 - k) * 6); },
      // splits and topples like a felled culm
      die(P, t, k) { const u = E.inQ(seg(k, 0, 0.55)); P.rootM(0, 0, 0, -0.2 * u, 0, 1.4 * u); P.r('head', 0, 0, 0.5 * u).r('shL', 0, 0, 0.5 * u); P.ch('dissolve', E.inQ(seg(k, 0.45, 1))); P.ch('fx_death', bump(k, 0.4, 1) * 2); },
      // grows up from the ground
      enter(P, t, k) { const u = 1 - E.outC(seg(k, 0, 0.85)); P.rootM(0, 0, 0, 0, 0, 0, -0.9 * u); P.ch('fx_leaves', bump(k, 0.3, 1) * 5); },
    },
    dur: { attack: 1.05, cast: 1.5, die: 1.8, enter: 1.3 },
    overlayReplace: 0.7,
  });

  // ===================================================================================================
  // 青竹絲 bamboo_viper — the 赤尾青竹絲 green pit viper: luminous green scales, white lateral stripe, red tail tip,
  // golden slit eyes; coiled with the head raised, it sways, flicks its tongue and strikes.
  const VIPER_N = 14;
  defC('bamboo_viper', {
    height: 1.0, fill: 0.92, radius: 0.5, shadow: 0.6, rimColor: '#e8ffb0', shadowX: 1.3,
    pal: { body: '#5fd23a', bodyD: '#1f7a2a', bodyL: '#d8ff9a', belly: '#e8f8a0', stripe: '#ffffff', tail: '#e8402e', eye: '#ffd23a', tongue: '#e0344a', line: '#0e3a14', magic: '#a8ff6a' },
    vars: [{ h: -60, s: 1.1, keep: ['tail', 'tongue', 'stripe'], set: { eye: '#ff6a3a' } }, { h: 150, s: 0.9, l: -0.05, keep: ['tongue', 'stripe'], set: { tail: '#ffd23a' } }],
    slots: {
      // u around the body (0.5 = top/back at a0 offset), v along: tail (0) → head (1)
      scale: { size: 4, paint(g, w, h, p, R) {
        Paint.hgrad(g, w, h, [0, p.belly, 0.18, p.belly, 0.24, p.stripe, 0.27, p.bodyD, 0.5, p.body, 0.73, p.bodyD, 0.76, p.stripe, 0.82, p.belly, 1, p.belly]);
        Paint.scales(g, w, h, p.bodyD, p.bodyL, 14, 9, 0.5);
        g.fillStyle = rgba(p.belly, 0.6); for (let y = 0; y < h; y += 10) { g.fillRect(0, y, w * 0.17, 2); g.fillRect(w * 0.83, y, w * 0.17, 2); }
        // red tail tip (bottom of canvas = v 0 = tail)
        const gr = g.createLinearGradient(0, h, 0, h * 0.8); gr.addColorStop(0, p.tail); gr.addColorStop(0.6, p.tail); gr.addColorStop(1, rgba(p.tail, 0)); g.fillStyle = gr; g.fillRect(0, h * 0.8, w, h * 0.2);
      } },
      head(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.bodyL, 0.5, p.body, 1, p.bodyD]); Paint.scales(g, w, h, p.bodyD, p.bodyL, 18, 12, 0.45); },
      belly(g, w, h, p) { Paint.fill(g, w, h, p.belly); },
      eye: { size: 1, paint: (g, w, h, p) => Paint.eye(g, w, h, p.eye, '#100800', p.eye, 0.18), emit: (g, w, h, p) => Paint.eye(g, w, h, shade(p.eye, -0.5), '#000', shade(p.eye, -0.5), 0.18) },
      tongue(g, w, h, p) { Paint.fill(g, w, h, p.tongue); },
    },
    build(B, p) {
      // path: coil (tail tip inside) → rising neck → head
      const pts = [];
      for (let i = 0; i < 9; i++) { const u = i / 8, a = -1.2 + u * TAU * 1.05, r = lerp(0.12, 0.42, u); pts.push([cos(a) * r, 0.07 + u * 0.04, sin(a) * r - 0.05]); }
      pts.push([0.15, 0.2, 0.3], [0.05, 0.42, 0.24], [0, 0.62, 0.2], [0, 0.76, 0.26], [0, 0.82, 0.36]);
      const names = [];
      pts.forEach((pt, i) => { const n = 's' + i; B.bone(n, i ? 's' + (i - 1) : 'root', pt); names.push(n); });
      B.bone('head', names[names.length - 1], [0, 0.82, 0.36]); B.bone('jaw', 'head', [0, 0.8, 0.4]);
      B.bone('tg0', 'head', [0, 0.8, 0.5]); B.bone('tg1', 'tg0', [0, 0.8, 0.6]);
      const rad = (u) => 0.012 + 0.07 * sm(0, 0.35, u) * (1 - 0.25 * sm(0.8, 1, u));
      B.tube(pts, rad, { bones: names, slot: 'scale', seg: 12, sub: 4, cap0: true, a0: PI / 2, up: [0, 1, 0], flat: [1, 0.85] });
      // head: wedge (pit viper triangle)
      B.ell([0, 0.83, 0.42], [0.075, 0.045, 0.1], { w: 'head', slot: 'head', seg: 14, rings: 10, deform: (v) => { const k = (v.z - 0.42) / 0.1; v.x *= 1 + max(0, -k) * 0.45; } });
      B.ell([0, 0.81, 0.43], [0.06, 0.02, 0.085], { w: 'jaw', slot: 'belly', seg: 12, rings: 6 });
      for (const [s, S] of SIDES) { B.eye('eye' + S, 'head', [s * 0.06, 0.85, 0.44], 0.018, { rz: 0.9 }); B.ell([s * 0.06, 0.865, 0.44], [0.022, 0.008, 0.022], { w: 'head', slot: 'head' }); }
      // forked tongue
      for (const s of [-1, 1]) B.tube([[0, 0.8, 0.5], [0, 0.8, 0.58], [s * 0.02, 0.8, 0.64]], [0.006, 0.005, 0.002], { bones: ['tg0', 'tg1', 'tg1'], slot: 'tongue', seg: 4, outline: false });
      this._n = names.length;
    },
    fx: {
      cast: { n: 30, rate: 0, burstRate: 40, bone: 'head', at: [0, 0, 0.1], box: [0.1, 0.1, 0.1], vel: [0, 0.2, 0.8], velR: [0.3, 0.2, 0.3], life: [0.6, 1.1], size: [0.08, 0.14], grow: 1.5, color: ['#c8ff7a', '#3a7a20'], alpha: 0.5, add: false },
      death: { n: 30, rate: 0, burstRate: 30, at: [0, 0.2, 0], box: [0.8, 0.2, 0.8], vel: [0, 0.5, 0], velR: [0.3, 0.3, 0.3], life: [0.8, 1.5], size: [0.05, 0.08], color: ['#d8ff9a', '#5fd23a'], twinkle: 8, shape: 3 },
    },
    tick(C) { C.state.tongue = (C.state.tongue || 0); },
    clips: {
      // travelling S-wave down the neck, coils breathe, tongue flicks
      idle(P, t) {
        for (let i = 0; i < VIPER_N; i++) { const w = i / VIPER_N; P.r('s' + i, 0, sin(t * 2 - i * 0.6) * 0.06 * w, sin(t * 1.4 - i * 0.5) * 0.04 * w); }
        P.r('s10', sin(t * 1.3) * 0.08, sin(t * 0.9) * 0.15).r('head', sin(t * 1.7) * 0.1, sin(t * 1.1) * 0.2);
        const fl = max(0, sin(t * 5)) * (sin(t * 0.9) > 0.3 ? 1 : 0);
        P.p('tg0', 0, 0, -0.08 + 0.08 * fl).s('tg0', -0.9 + 0.9 * fl).r('tg1', sin(t * 40) * 0.4 * fl);
      },
      // slither: big lateral waves through the whole body
      move(P, ph) { for (let i = 0; i < VIPER_N; i++) P.r('s' + i, 0, sin(ph * TAU - i * 0.8) * 0.18, 0); P.rootM(0, 0, 0, 0, 0, 0); },
      // coil back (S-loaded neck), strike forward, fangs open
      attack(P, t, k) {
        const A = atk(k, 0.38, 0.47, 0.6);
        P.r('s9', -0.3 * A.a + 0.4 * A.s).r('s10', 0.4 * A.a - 0.3 * A.s).r('s11', -0.5 * A.a + 0.2 * A.s).r('s12', 0.4 * A.a + 0.2 * A.s).r('s13', 0.2 * A.a + 0.1 * A.s);
        P.p('s11', 0, 0, 0.25 * A.s).p('s12', 0, -0.05 * A.s, 0.2 * A.s);
        P.r('jaw', 0.9 * A.s + 0.3 * A.a).r('head', -0.2 * A.a + 0.3 * A.s);
        P.rootM(0, 0, 0.1 * A.s);
      },
      // venom spray hiss
      cast(P, t, k) { const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k)); P.r('s12', -0.3 * u).r('head', -0.3 * u).r('jaw', 0.8 * u); P.ch('fx_cast', u); },
      special(P, t, k, C) { this.attack(P, t, k, C); },
      hurt(P, t, k) { const u = (1 - E.outQ(k)) * min(1, k * 14); P.r('s11', -0.4 * u).r('s12', -0.3 * u, 0.4 * u * sin(t * 30)).r('head', 0, 0.5 * u); },
      // collapses and uncoils
      die(P, t, k) { const u = E.ioQ(seg(k, 0, 0.5)); P.r('s9', 0.5 * u).r('s10', 0.6 * u).r('s11', 0.5 * u).r('s12', 0.3 * u).r('head', 0, 0, 1.2 * u); for (let i = 0; i < 9; i++) P.r('s' + i, 0, -0.06 * u, 0); P.ch('dissolve', E.inQ(seg(k, 0.4, 1))); P.ch('fx_death', bump(k, 0.4, 1) * 2); },
      // drops down out of the bamboo, then rears up
      enter(P, t, k) { const u = 1 - E.outBack(seg(k, 0, 0.8)); P.r('s10', 0.8 * u).r('s11', 0.6 * u).r('s12', 0.5 * u); P.rootM(0, 0, 0, 0, 0, 0, -0.3 * clamp(u, 0, 1)); P.ch('dissolve', 1 - sm(0, 0.3, k)); },
    },
    dur: { attack: 0.8, cast: 1.2 },
    cadence: 1.4,
  });

  // ===================================================================================================
  // 山豬精 boar_demon — a tusked mountain boar spirit: hulking shoulders, a bristle crest along the spine, scarred hide
  // with glowing ember cracks, burning eyes; charges like a landslide.
  defC('boar_demon', {
    height: 1.35, fill: 0.93, radius: 0.8, shadow: 0.75, shadowX: 1.6, rimColor: '#ffd0a0',
    pal: { fur: '#5a4234', furD: '#24160e', furL: '#9a7a5e', mane: '#2e1c14', snout: '#c89482', snoutD: '#7a4a40', tusk: '#f4ead2', hoof: '#2a2020', eye: '#ff5a2a', ember: '#ff8a3a', line: '#1a0c06', magic: '#ff9a4a' },
    vars: [{ h: 0, s: 0.4, l: 0.08, keep: ['tusk', 'eye', 'ember'], set: { ember: '#8ae0ff', eye: '#8ae0ff', magic: '#8ae0ff' } }, { h: -20, s: 1.6, l: -0.04, keep: ['tusk'], set: { eye: '#ffe23a', ember: '#ffd23a' } }],
    slots: {
      hide: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.furD, 0.4, p.fur, 1, p.furL]);
        Paint.strokes(g, w, h, p.furD, 900, 18, PI / 2 + 0.4, 1.6, 0.5, R, 0.4); Paint.strokes(g, w, h, p.furL, 300, 12, PI / 2 + 0.4, 1, 0.35, R, 0.4);
        Paint.cracks(g, w, h, shade(p.ember, -0.2), 8, 120, 5, 0.9, K.rng(41));
      }, emit(g, w, h, p) { Paint.cracks(g, w, h, p.ember, 8, 120, 5, 0.9, K.rng(41)); } },
      mane(g, w, h, p, R) { g.clearRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { g.strokeStyle = R() > 0.5 ? p.mane : p.furD; g.lineWidth = 7; g.beginPath(); g.moveTo(x, h); g.lineTo(x + (R() - 0.5) * 10, h * (0.05 + R() * 0.3)); g.stroke(); } },
      snout(g, w, h, p) { Paint.fill(g, w, h, p.snout); const cx = w / 2, cy = h / 2; g.fillStyle = p.snoutD; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 22, cy, 12, 18, 0, 0, TAU); g.fill(); } },
      tusk(g, w, h, p) { Paint.vgrad(g, w, h, [0, '#ffffff', 0.6, p.tusk, 1, shade(p.tusk, -0.4)]); },
      hoof(g, w, h, p) { Paint.fill(g, w, h, p.hoof); },
      eye: { size: 1, paint: (g, w, h, p) => Paint.eye(g, w, h, p.eye, '#200400', '#200400'), emit: (g, w, h, p) => Paint.eye(g, w, h, p.eye, '#000', '#000') },
    },
    build(B, p) {
      B.bone('body', 'root', [0, 0.78, -0.1]);
      B.bone('chest', 'body', [0, 0.84, 0.3]);
      B.bone('neck', 'chest', [0, 0.82, 0.5]);
      B.bone('head', 'neck', [0, 0.72, 0.68]);
      B.bone('jaw', 'head', [0, 0.6, 0.8]);
      B.bone('tail0', 'body', [0, 0.82, -0.62]); B.bone('tail1', 'tail0', [0, 0.7, -0.68]);
      for (const [s, S] of SIDES) B.bone('ear' + S, 'head', [s * 0.13, 0.9, 0.62]);
      // barrel body: hulking shoulders taper to the rump
      B.ell([0, 0.78, -0.05], [0.36, 0.38, 0.65], { w: B.keyW([[-0.4, 'body'], [0.25, 'chest']], 2), slot: 'hide', seg: 26, rings: 16, deform: (v) => { const k = (v.z + 0.05) / 0.65; v.y += max(0, k) * 0.12 * sm(0.6, 1.1, v.y); v.x *= 1 + max(0, k) * 0.12; } });
      // head: wedge skull to a flat snout disk
      B.tube([[0, 0.82, 0.48], [0, 0.74, 0.7], [0, 0.66, 0.92]], [0.24, 0.17, 0.1], { bones: ['neck', 'head', 'head'], slot: 'hide', seg: 16, flat: [1, 0.95] });
      B.ell([0, 0.65, 0.96], [0.1, 0.085, 0.04], { w: 'head', slot: 'snout', seg: 14, rings: 8 });
      B.ell([0, 0.58, 0.82], [0.1, 0.04, 0.12], { w: 'jaw', slot: 'hide', seg: 10, rings: 6 });
      for (const [s, S] of SIDES) {
        B.tube([[s * 0.07, 0.6, 0.86], [s * 0.13, 0.66, 0.92], [s * 0.15, 0.78, 0.88]], [0.025, 0.02, 0.004], { w: 'jaw', slot: 'tusk', seg: 7 });
        B.eye('eye' + S, 'head', [s * 0.12, 0.8, 0.74], 0.028, { rz: 0.6, rot: [0, s * 0.6, 0] });
        B.geo(new THREE.ConeGeometry(0.07, 0.16, 6), { at: [s * 0.15, 0.92, 0.62], rot: [-0.6, 0, -s * 0.6], scale: [1, 1, 0.5], w: 'ear' + S, slot: 'hide' });
      }
      // bristle crest along the spine (cards)
      for (let i = 0; i < 9; i++) { const z = lerp(0.55, -0.45, i / 8); const y = 0.8 + 0.38 * Math.sqrt(max(0, 1 - ((z + 0.05) / 0.68) ** 2)) + (z > 0 ? 0.08 : 0); B.strip([[0, y - 0.04, z], [0, y + 0.16 - i * 0.008, z - 0.06]], 0.2, { w: z > 0.2 ? 'chest' : 'body', slot: 'mane', side: [0, 0, 1] }); }
      // legs (stocky): hip/shoulder → knee → hoof
      for (const [s, S] of SIDES) for (const [n, z, par] of [['F', 0.32, 'chest'], ['B', -0.42, 'body']]) {
        const hp = [s * 0.22, 0.7, z], kn = [s * 0.23, 0.36, z + (n === 'F' ? 0.03 : -0.05)], ft = [s * 0.22, 0.06, z + 0.02];
        B.bone('leg' + n + S, par, hp); B.bone('knee' + n + S, 'leg' + n + S, kn); B.bone('foot' + n + S, 'knee' + n + S, ft);
        B.tube([hp, kn, ft], [0.13, 0.07, 0.055], { bones: ['leg' + n + S, 'knee' + n + S, 'foot' + n + S], slot: 'hide', seg: 10 });
        B.tube([v3(ft, [0, 0.02, 0]), v3(ft, [0, -0.06, 0.03])], [0.06, 0.07], { w: 'foot' + n + S, slot: 'hoof', seg: 8, cap1: 0.3 });
      }
      B.tube([[0, 0.82, -0.62], [0, 0.7, -0.68], [0, 0.6, -0.66]], [0.03, 0.02, 0.01], { bones: ['tail0', 'tail1', 'tail1'], slot: 'hide', seg: 6 });
    },
    springs: [{ chain: ['tail0', 'tail1'], tip: [0, -0.1, 0.02], k: 50, d: 5, g: 3, max: 1 }].concat(SIDES.map(([s, S]) => ({ chain: ['ear' + S], tip: [s * 0.04, 0.1, -0.06], k: 120, d: 8, g: 0, max: 0.4 }))),
    fx: {
      embers: { n: 16, rate: 5, at: [0, 0.9, 0], box: [0.6, 0.5, 1.0], vel: [0, 0.4, 0], velR: [0.1, 0.2, 0.1], life: [0.8, 1.6], size: [0.03, 0.06], color: ['#ffe0a0', '#ff5a2a'], twinkle: 9, shape: 3 },
      snort: { n: 20, rate: 0, burstRate: 30, bone: 'head', at: [0, -0.07, 0.3], box: [0.05, 0.05, 0.05], vel: [0, 0.1, 0.5], velR: [0.25, 0.1, 0.2], life: [0.5, 1], size: [0.1, 0.18], grow: 2, color: ['#ffffff', '#a89888'], alpha: 0.4, add: false },
      dust: { n: 30, rate: 0, burstRate: 40, at: [0, 0.05, -0.2], box: [0.8, 0.05, 1.2], vel: [0, 0.4, -0.4], velR: [0.3, 0.2, 0.3], life: [0.6, 1.2], size: [0.2, 0.35], grow: 1.5, color: ['#c8b090', '#6a5a40'], alpha: 0.4, add: false },
      cast: { n: 30, rate: 0, burstRate: 40, at: [0, 0.9, 0], box: [0.8, 0.6, 1.2], vel: [0, 0.8, 0], velR: [0.3, 0.3, 0.3], life: [0.6, 1.2], size: [0.04, 0.08], color: ['#ffe0a0', '#ff5a2a'], twinkle: 9, shape: 3 },
      death: { n: 30, rate: 0, burstRate: 30, at: [0, 0.6, 0], box: [0.8, 0.6, 1.2], vel: [0, 0.6, 0], velR: [0.3, 0.3, 0.3], life: [0.8, 1.6], size: [0.05, 0.09], color: ['#ffe0a0', '#ff5a2a'], twinkle: 8, shape: 3 },
    },
    tick(C) { C.glowBase = 1 + 0.3 * sin(C.t * 2.1); },
    clips: {
      idle(P, t) {
        const br = sin(t * 1.6);
        P.s('body', 0.015 * br, 0.02 * br, 0).r('neck', sin(t * 0.7) * 0.05 + 0.05, sin(t * 0.4) * 0.15).r('head', sin(t * 1.9) * 0.05).r('jaw', max(0, sin(t * 3)) * 0.05);
        // pawing the ground with one forefoot every few seconds
        const paw = max(0, sin(t * 1.2)) ** 6;
        P.r('legFR', -0.4 * paw).r('kneeFR', 0.8 * paw).r('footFR', -0.3 * paw);
        P.ch('fx_snort', max(0, sin(t * 0.8)) ** 20 * 3);
      },
      // gallop
      move(P, ph) {
        const a = ph * TAU;
        for (const [s, S] of SIDES) { const o = s > 0 ? 0 : 0.6; P.r('legF' + S, 0.5 * sin(a + o)).r('kneeF' + S, max(0, -0.8 * sin(a + o + 1))); P.r('legB' + S, 0.5 * sin(a + PI + o)).r('kneeB' + S, max(0, 0.7 * sin(a + PI + o + 1))); }
        P.rootM(0, abs(sin(a)) * 0.06, 0, sin(a) * 0.06); P.r('neck', -sin(a) * 0.08);
      },
      // head-down charge with a tusk hook at the end
      attack(P, t, k) {
        const A = atk(k, 0.35, 0.5, 0.66), hook = bump(k, 0.46, 0.66);
        P.rootM(0, 0, -0.15 * A.a + 0.6 * A.s, 0.1 * A.a - 0.05 * A.s);
        P.r('neck', 0.3 * A.a + 0.2 * A.s - 0.5 * hook).r('head', 0.2 * A.a - 0.5 * hook);
        for (const [s, S] of SIDES) { P.r('legF' + S, 0.3 * A.a - 0.4 * A.s).r('legB' + S, -0.4 * A.a + 0.4 * A.s).r('kneeB' + S, 0.5 * A.a); }
        P.ch('fx_dust', bump(k, 0.3, 0.6) * 3); P.ch('fx_snort', A.a * 2);
      },
      // war cry: rears, embers flare
      cast(P, t, k) { const u = sm(0, 0.3, k) * (1 - sm(0.85, 1, k)); P.rootM(0, 0.1 * u, -0.1 * u, -0.45 * u); P.r('neck', -0.4 * u).r('jaw', 0.5 * u); for (const [s, S] of SIDES) P.r('legF' + S, -0.8 * u).r('kneeF' + S, 1.0 * u); P.ch('glow', 2 * u); P.ch('fx_cast', u); },
      special(P, t, k, C) { this.attack(P, t, k, C); P.ch('glow', bump(k, 0.3, 0.8) * 2); },
      hurt(P, t, k, C) { GEN.hurt(P, t, k, C); P.ch('fx_snort', (1 - k) * 3); },
      // keels over onto its side
      die(P, t, k) { const u = E.ioQ(seg(k, 0, 0.5)); P.rootM(0, 0.1 * bump(k, 0, 0.3), 0, 0, 0, 1.45 * u); for (const [s, S] of SIDES) { P.r('legF' + S, 0.3 * u).r('legB' + S, -0.3 * u); } P.r('jaw', 0.4 * u); P.ch('dissolve', E.inQ(seg(k, 0.5, 1))); P.ch('fx_death', bump(k, 0.45, 1) * 2); P.ch('glow', -0.9 * u); },
      enter(P, t, k) { const u = 1 - E.outC(seg(k, 0, 0.7)); P.rootM(0, 0, -1.5 * u, 0.05); P.ch('fx_dust', bump(k, 0, 0.8) * 3); },
    },
    dur: { attack: 1.15, cast: 1.4, enter: 1.1 },
    cadence: 1.2,
  });

  // ===================================================================================================
  // Monkeys share an anatomy: 獼猴精 macaque_demon (grey-brown fur, pink face, stolen peach, talisman scrap on the back)
  // and 石猴 stone_monkey (andesite body with glowing magma cracks and moss, squatting on a carved plinth).
  function monkeyBuild(B, p, stone) {
    const J = humanRig(B, { hip: 0.62, chest: 0.98, neck: 1.1, head: 1.16, headZ: 0.08, chestZ: 0.04, neckZ: 0.06, shY: 1.0, sh: 0.2, up: 0.3, fore: 0.3, arm1: [0.3, -1, 0.2], arm2: [0.05, -0.6, 1], lx: 0.12, knee: 0.4, kneeZ: 0.16, kneeX: 1.3 });
    const base = stone ? 0.18 : 0;
    if (stone) { for (const b of B.bones) if (b.name !== 'root') { b.userData.abs.y += base; } B.byName.hips.position.y += base; B.byName.hips.userData.rest.y += base; for (const k in J) J[k][1] += base; }
    const sl = stone ? 'stone' : 'fur';
    const tl = [[0, 0.62, -0.18], [0, 0.45, -0.4], [0, 0.55, -0.62], [0, 0.82, -0.66], [0, 0.98, -0.55]].map((q) => [q[0], q[1] + base, q[2]]);
    tl.forEach((q, i) => B.bone('tl' + i, i ? 'tl' + (i - 1) : 'hips', q));
    B.tube(tl, [0.06, 0.05, 0.04, 0.035, 0.02], { bones: ['tl0', 'tl1', 'tl2', 'tl3', 'tl4'], slot: sl, seg: 8, cap1: true });
    // body: pot-bellied, hunched
    B.ell([0, 0.8 + base, 0], [0.22, 0.28, 0.21], { w: B.keyW([[0.65 + base, 'hips'], [0.85 + base, 'spine'], [1.0 + base, 'chest']]), slot: sl, seg: 20, rings: 14, deform: (v) => { v.z += sm(0.85 + base, 1.1 + base, v.y) * 0.05; } });
    // head: round skull, flat face disc, muzzle
    B.ell([0, 1.24 + base, 0.1], [0.15, 0.15, 0.14], { w: 'head', slot: stone ? 'stone' : 'fur', seg: 20, rings: 14 });
    B.ell([0, 1.22 + base, 0.2], [0.11, 0.12, 0.06], { w: 'head', slot: 'face', seg: 18, rings: 12 });
    B.ell([0, 1.16 + base, 0.25], [0.06, 0.045, 0.045], { w: 'head', slot: stone ? 'stone' : 'faceP', seg: 10, rings: 8 });
    for (const [s, S] of SIDES) {
      B.ell([s * 0.15, 1.25 + base, 0.08], [0.035, 0.045, 0.02], { w: 'head', slot: stone ? 'stone' : 'faceP', rot: [0, s * 0.5, 0] });
      limb(B, J['sh' + S], J['el' + S], J['hand' + S], [0.07, 0.055, 0.045], ['sh' + S, 'arm' + S, 'hand' + S], { slot: sl });
      claw(B, S, s, J['hand' + S], [0.05, -0.6, 1], { size: 0.06, n: 4, curl: 0.8, slot: stone ? 'stone' : 'hand', nail: false });
      limb(B, J['hip' + S], J['knee' + S], J['foot' + S], [0.09, 0.07, 0.05], ['leg' + S, 'knee' + S, 'foot' + S], { slot: sl });
      B.ell(v3(J['foot' + S], [0, -0.02, 0.07]), [0.06, 0.035, 0.11], { w: 'foot' + S, slot: stone ? 'stone' : 'hand' });
    }
    return J;
  }
  const monkeyClips = (stone) => ({
    idle(P, t) {
      breathe(P, t, 1.2);
      const scratch = max(0, sin(t * 0.7)) ** 8;
      P.r('head', sin(t * 0.9) * 0.1 + 0.05, sin(t * (stone ? 0.3 : 1.3)) * (stone ? 0.15 : 0.35), sin(t * 0.6) * 0.1);
      for (const [s, S] of SIDES) P.r('knee' + S, 0.25).r('leg' + S, -0.12);
      if (!stone) P.r('shL', -1.4 * scratch, 0, 0.6 * scratch).r('armL', -1.4 * scratch).r('handL', sin(t * 20) * 0.3 * scratch);
      P.r('shR', -0.2 + sin(t * 1.1) * 0.05).r('armR', -0.6);
      P.rootM(0, abs(sin(t * (stone ? 1 : 2.4))) * 0.01, 0, 0.08, 0, sin(t * 0.8) * 0.03);
      for (let i = 1; i < 5; i++) P.r('tl' + i, sin(t * 1.5 - i * 0.6) * 0.15, sin(t * 1.1 - i * 0.5) * 0.2);
    },
    // loping knuckle-walk
    move(P, ph) { const a = ph * TAU; for (const [s, S] of SIDES) { const o = s > 0 ? 0 : PI; P.r('leg' + S, -0.5 * sin(a + o)).r('knee' + S, 0.4 + 0.4 * max(0, sin(a + o + 1))).r('sh' + S, -0.8 + 0.5 * sin(a + o + PI)); } P.rootM(0, abs(sin(a)) * 0.04, 0, 0.45); P.r('head', -0.4); },
    // leap and swipe (macaque) / overhead stone fist (stone)
    attack(P, t, k) {
      const A = atk(k, 0.32, 0.46, 0.64), air = bump(k, 0.3, 0.55);
      P.rootM(0, air * (stone ? 0.1 : 0.3), -0.05 * A.a + 0.4 * A.s, -0.15 * A.a + 0.3 * A.s);
      P.r('shR', -2.4 * A.a + 1.4 * A.s, 0, -0.3 * A.a).r('armR', -0.6 * A.a + 0.3 * A.s).r('handR', 0.5 * A.s);
      P.r('shL', -1.0 * A.a + 0.4 * A.s, 0, 0.4 * A.a);
      for (const [s, S] of SIDES) P.r('knee' + S, 0.8 * A.a).r('leg' + S, -0.5 * A.a);
      P.r('head', -0.25 * A.a + 0.2 * A.s);
      P.ch('fx_hit', bump(k, 0.45, 0.55) * 4);
    },
    // throw: wind up the right arm, hurl
    cast(P, t, k) { const A = atk(k, 0.4, 0.55, 0.7); P.r('shR', -2.6 * A.a + 1.0 * A.s, 0, -0.5 * A.a).r('armR', -0.9 * A.a).r('chest', 0, 0.4 * A.a - 0.4 * A.s); P.r('head', 0, 0.2 * A.a); P.ch('glow', A.s); P.ch('fx_throw', bump(k, 0.5, 0.6) * 4); },
    // taunt: jumps up and down, slaps chest, tail whips
    special(P, t, k) { const u = bump(k, 0.05, 0.95), j = abs(sin(t * 9)); P.rootM(0, j * 0.12 * u, 0, 0, sin(t * 4.5) * 0.4 * u); for (const [s, S] of SIDES) P.r('sh' + S, -1.6 * u * (0.6 + 0.4 * sin(t * 18 + s)), 0, s * 0.3 * u); P.r('head', -0.3 * u).r('tl3', sin(t * 12) * 0.6 * u); P.ch('fx_cast', u); },
    hurt(P, t, k, C) { GEN.hurt(P, t, k, C); P.ch('fx_hit', (1 - k) * 2); },
    die(P, t, k, C) {
      if (stone) { const u = E.inQ(seg(k, 0, 0.3)); P.rootM(0, 0, 0, 0.2 * u); P.ch('flash', 0.3 * bump(k, 0.1, 0.3)); P.ch('dissolve', E.inQ(seg(k, 0.25, 1))); P.ch('fx_death', bump(k, 0.2, 0.9) * 3); P.ch('glow', 2 * bump(k, 0, 0.4)); return; }
      GEN.die(P, t, k, C);
    },
    enter(P, t, k) { const u = 1 - E.outC(seg(k, 0, 0.6)), land = bump(k, 0.55, 0.85); P.rootM(0, 1.5 * u * u, 0, 0, 0, 0, -0.15 * land); for (const [s, S] of SIDES) P.r('knee' + S, 0.9 * land).r('leg' + S, -0.5 * land); },
  });

  defC('macaque_demon', {
    height: 1.42, fill: 0.92, radius: 0.33, shadow: 0.36, rimColor: '#fff0d8',
    pal: { fur: '#7a7058', furD: '#3a3428', furL: '#b8ae90', face: '#d8a088', faceD: '#9a6050', faceL: '#f6ccb4', hand: '#5a4a40', eye: '#ffb02a', peach: '#ff9a7a', leafc: '#5aa04a', line: '#1e1a12', talis: '#f0d24a', ink: '#c0281a', magic: '#ffc24a' },
    vars: [{ h: 190, s: 0.6, l: -0.04, keep: ['face', 'faceD', 'faceL', 'peach', 'leafc', 'talis', 'ink'], set: { eye: '#8af0ff' } }, { h: -30, s: 1.8, l: -0.06, keep: ['face', 'faceD', 'faceL', 'peach', 'leafc', 'talis', 'ink'], set: { eye: '#ff3a3a' } }],
    slots: {
      fur: furSlot('fur', 'furD', 'furL'),
      face: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.faceL, 0.5, p.face, 1, p.faceD]); Paint.mottle(g, w, h, p.faceD, 30, 8, 30, 0.3, R);
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.1), y = FY(h, 0.6); g.fillStyle = p.faceD; g.beginPath(); g.ellipse(x, y, 34, 26, 0, 0, TAU); g.fill(); g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 20, 17, 0, 0, TAU); g.fill(); g.fillStyle = '#1a0800'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 6, y - 6, 4, 0, TAU); g.fill(); }
        g.strokeStyle = p.faceD; g.lineWidth = 8; g.beginPath(); g.moveTo(FX(w, 0.38), FY(h, 0.73)); g.quadraticCurveTo(FX(w, 0.5), FY(h, 0.69), FX(w, 0.62), FY(h, 0.73)); g.stroke(); // brow ridge
      }, emit(g, w, h, p) { for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.1), y = FY(h, 0.6); g.fillStyle = shade(p.eye, -0.55); g.beginPath(); g.ellipse(x, y, 20, 17, 0, 0, TAU); g.fill(); } } },
      faceP(g, w, h, p) { Paint.fill(g, w, h, p.face); g.fillStyle = p.faceD; g.beginPath(); g.ellipse(w * 0.44, h * 0.45, 8, 6, 0, 0, TAU); g.ellipse(w * 0.56, h * 0.45, 8, 6, 0, 0, TAU); g.fill(); g.strokeStyle = '#4a2018'; g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.3, h * 0.7); g.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.7, h * 0.7); g.stroke(); },
      hand(g, w, h, p) { Paint.fill(g, w, h, p.hand); },
      peach(g, w, h, p) { Paint.vgrad(g, w, h, [0, '#fff0c0', 0.5, p.peach, 1, shade(p.peach, -0.35)]); },
      leafc(g, w, h, p) { Paint.fill(g, w, h, p.leafc); },
      talis(g, w, h, p) { Paint.fill(g, w, h, p.talis); g.strokeStyle = p.ink; g.lineWidth = 7; g.beginPath(); g.moveTo(w * 0.3, h * 0.2); g.lineTo(w * 0.7, h * 0.2); g.moveTo(w / 2, h * 0.1); g.lineTo(w / 2, h * 0.85); g.moveTo(w * 0.3, h * 0.5); g.lineTo(w * 0.7, h * 0.45); g.stroke(); },
    },
    build(B, p) {
      const J = monkeyBuild(B, p, false);
      // stolen peach in the right hand
      B.ell(v3(J.handR, [0, -0.06, 0.08]), [0.07, 0.075, 0.07], { w: 'handR', slot: 'peach', seg: 12, rings: 9 });
      B.geo(new THREE.ConeGeometry(0.03, 0.07, 4), { at: v3(J.handR, [0.02, 0.02, 0.1]), rot: [0.4, 0, -0.8], scale: [1, 1, 0.3], w: 'handR', slot: 'leafc' });
      // talisman scrap stuck between the shoulder blades (spring)
      B.bone('tal', 'chest', [0.06, 1.02, -0.2]);
      B.strip([[0.06, 1.04, -0.2], [0.07, 0.88, -0.22]], 0.1, { bones: ['tal', 'tal'], slot: 'talis', side: [1, 0, 0.2] });
      // ruff of lighter fur on the cheeks
      for (const s of [-1, 1]) B.ell([s * 0.1, 1.18, 0.12], [0.06, 0.08, 0.06], { w: 'head', slot: 'fur', tint: '#d0c8b0' });
    },
    springs: [{ chain: ['tl1', 'tl2', 'tl3'], tip: [0, 0.16, 0.1], k: 45, d: 5, g: 1, max: 0.8 }, { chain: ['tal'], tip: [0, -0.16, 0], k: 70, d: 6, g: 2, wind: 1.5, max: 0.6 }],
    fx: {
      hit: { n: 16, rate: 0, burstRate: 30, bone: 'handR', box: [0.1, 0.1, 0.1], vel: [0, 0.5, 0.6], velR: [0.5, 0.5, 0.5], g: 2, life: [0.3, 0.6], size: [0.04, 0.07], color: ['#ffffff', '#ffc24a'], shape: 3 },
      throw: { n: 12, rate: 0, burstRate: 30, bone: 'handR', box: [0.05, 0.05, 0.05], vel: [0, 1, 2], velR: [0.3, 0.3, 0.3], g: 4, life: [0.5, 0.8], size: [0.08, 0.12], color: ['#ff9a7a', '#c84a2a'], add: false, shape: 0 },
      cast: { n: 20, rate: 0, burstRate: 30, bone: 'head', at: [0, 0.2, 0], box: [0.3, 0.1, 0.3], vel: [0, 0.6, 0], velR: [0.4, 0.2, 0.4], life: [0.4, 0.8], size: [0.05, 0.08], color: ['#ffe28a', '#ffc24a'], shape: 3, twinkle: 12 },
      death: { n: 30, rate: 0, burstRate: 30, at: [0, 0.8, 0], box: [0.5, 0.9, 0.4], vel: [0, 0.6, 0], velR: [0.3, 0.3, 0.3], life: [0.8, 1.5], size: [0.05, 0.08], color: ['#ffe28a', '#b8ae90'], twinkle: 8, shape: 3 },
    },
    clips: monkeyClips(false),
    dur: { attack: 0.9, cast: 1.1, special: 1.5, enter: 1.0 },
    cadence: 1.2,
  });

  defC('stone_monkey', {
    height: 1.42, fill: 0.92, radius: 0.36, shadow: 0.4, rimColor: '#ffe8c8', bands: 3,
    pal: { stone: '#8a8a84', stoneD: '#3e3e3c', stoneL: '#d0cec2', moss: '#5a8a3a', mossL: '#9ac45a', crack: '#ff8a2a', eye: '#ffb03a', line: '#1e1e1c', magic: '#ffa23a' },
    vars: [{ h: 30, s: 2.5, l: -0.05, keep: ['moss', 'mossL'], set: { crack: '#7af0ff', eye: '#7af0ff', magic: '#7af0ff' } }, { h: 0, s: 1, l: -0.18, set: { crack: '#c86aff', eye: '#e8aaff', magic: '#c86aff', moss: '#3a3a5a', mossL: '#6a6a9a' } }],
    slots: {
      stone: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.stoneL, 0.5, p.stone, 1, p.stoneD]); Paint.speck(g, w, h, p.stoneD, 1400, 3, 0.4, R); Paint.speck(g, w, h, p.stoneL, 800, 2, 0.5, R);
        Paint.mottle(g, w, h, p.moss, 14, 10, 40, 0.65, R); Paint.mottle(g, w, h, p.mossL, 10, 6, 20, 0.5, R);
        Paint.cracks(g, w, h, shade(p.crack, -0.3), 12, 140, 4, 0.95, K.rng(43));
      }, emit(g, w, h, p) { Paint.cracks(g, w, h, p.crack, 12, 140, 4, 0.95, K.rng(43)); } },
      face: { size: 4, paint(g, w, h, p, R) {
        Paint.vgrad(g, w, h, [0, p.stoneL, 0.5, p.stone, 1, p.stoneD]); Paint.speck(g, w, h, p.stoneD, 1000, 3, 0.4, R);
        for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.1), y = FY(h, 0.6); g.fillStyle = p.stoneD; g.beginPath(); g.ellipse(x, y, 30, 24, 0, 0, TAU); g.fill(); g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 16, 12, 0, 0, TAU); g.fill(); }
        Paint.cracks(g, w, h, shade(p.crack, -0.3), 4, 100, 3, 0.9, K.rng(44));
      }, emit(g, w, h, p, R) { Paint.cracks(g, w, h, p.crack, 4, 100, 3, 0.9, K.rng(44)); for (const s of [-1, 1]) { const x = FX(w, 0.5 + s * 0.1), y = FY(h, 0.6); g.fillStyle = p.eye; g.beginPath(); g.ellipse(x, y, 16, 12, 0, 0, TAU); g.fill(); } } },
      plinth(g, w, h, p, R) { Paint.vgrad(g, w, h, [0, p.stoneL, 1, p.stoneD]); Paint.speck(g, w, h, p.stoneD, 600, 3, 0.4, R); g.strokeStyle = rgba(p.stoneD, 0.8); g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20); g.strokeRect(24, 24, w - 48, h - 48); Paint.mottle(g, w, h, p.moss, 6, 10, 30, 0.6, R); },
    },
    build(B, p) {
      monkeyBuild(B, p, true);
      // carved plinth (static, on root)
      B.geo(new THREE.BoxGeometry(0.75, 0.18, 0.6, 1, 1, 1), { at: [0, 0.09, 0], w: 'root', slot: 'plinth', smooth: false });
      B.geo(new THREE.BoxGeometry(0.82, 0.04, 0.66), { at: [0, 0.02, 0], w: 'root', slot: 'plinth', smooth: false });
    },
    // the crack network glows — emissive painted to match the albedo cracks (same RNG sequence)
    init(C) { },
    springs: [],
    fx: {
      hit: { n: 20, rate: 0, burstRate: 40, bone: 'handR', box: [0.1, 0.1, 0.1], vel: [0, 0.6, 0.5], velR: [0.6, 0.5, 0.6], g: 5, life: [0.3, 0.7], size: [0.05, 0.09], color: ['#c8c4b8', '#5e5e58'], add: false, shape: 1 },
      throw: { n: 12, rate: 0, burstRate: 30, bone: 'handR', box: [0.05, 0.05, 0.05], vel: [0, 1, 2], velR: [0.3, 0.3, 0.3], g: 4, life: [0.5, 0.8], size: [0.1, 0.14], color: ['#8a8a84', '#3e3e3c'], add: false, shape: 1 },
      cast: { n: 30, rate: 0, burstRate: 40, at: [0, 0.8, 0], box: [0.5, 0.9, 0.4], vel: [0, 0.6, 0], velR: [0.2, 0.3, 0.2], life: [0.5, 1], size: [0.03, 0.06], color: ['#ffe0a0', '#ff8a2a'], shape: 3, twinkle: 10 },
      death: { n: 40, rate: 0, burstRate: 50, at: [0, 0.9, 0], box: [0.5, 0.9, 0.4], vel: [0, 0.8, 0], velR: [0.6, 0.4, 0.6], g: 4, life: [0.6, 1.2], size: [0.08, 0.14], color: ['#a8a8a0', '#3e3e3c'], add: false, shape: 1 },
      embers: { n: 10, rate: 3, at: [0, 0.9, 0], box: [0.4, 0.7, 0.3], vel: [0, 0.3, 0], velR: [0.05, 0.1, 0.05], life: [0.8, 1.4], size: [0.025, 0.045], color: ['#ffe0a0', '#ff8a2a'], shape: 3, twinkle: 10 },
    },
    tick(C) { C.glowBase = 0.8 + 0.4 * (0.5 + 0.5 * sin(C.t * 2.2)); },
    clips: monkeyClips(true),
    dur: { attack: 1.0, cast: 1.2, special: 1.4, die: 1.6, enter: 1.0 },
    cadence: 0.9,
  });
})();

// 彼岸燈 Shorelight — 3D nature: trees, plants, rocks, spirit flora, waterfalls, cloud seas, grass carpet + shared wind.
// Contract: docs/CONTRACTS_3D.md. Everything is procedural: geometry built in code, textures painted on canvases.
//
// Exports
//   G.Wind3D   = { windify(mat, opts), update(dt), tick(t), uniforms }   shared foliage wind (vertex-shader sway)
//   G.Nature3D = { scatterGrass(view) -> handle, update(view, dt), tex, mats }
//   G.Models.define(...) for every nature object type in js/gfx/nature.js (same footprints / solid cells).
//
// Conventions
//  * A model is built once per variant (o.v % variants) and cloned; per-instance colour variation and wind phase come
//    from the instance's world position (hashed in the shader), so clones never look identical.
//  * Foliage = alpha-tested painted leaf-cluster cards whose normals are bent toward the canopy's (and the cluster's)
//    sphere normal → soft, volumetric, "Ghibli" shading. Back-lit translucency + wrap lighting fake subsurface.
//  * Wind: all materials of one plant share a bend profile (height-based), so trunk, branches and leaves move together;
//    leaves add a high-frequency flutter. Vertex attributes other than position/normal/uv/color are dropped by
//    K.merge, so the profile is computed from object-space height (uWH) and distance from the trunk axis.
'use strict';
(() => {
  if (!window.THREE || !G.Models) return;
  const T = THREE;
  const { sin, cos, abs, min, max, floor, sqrt, PI, atan2, pow } = Math;
  const TAU = PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const V3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);

  // seeded RNG (mulberry32)
  function RNG(seed) {
    let a = (seed * 2654435761) >>> 0;
    const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.range = (a0, b0) => a0 + (b0 - a0) * r();
    r.pm = (k) => (r() - 0.5) * 2 * k;
    r.int = (n) => floor(r() * n);
    r.pick = (arr) => arr[floor(r() * arr.length)];
    return r;
  }
  // cheap 2D value noise (for textures)
  function vnoise(seed) {
    const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    return (x, y) => {
      const xi = floor(x), yi = floor(y), xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
    };
  }
  function fbm(n, x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; a *= 0.5; f *= 2; } return s / (1 - pow(0.5, oct)); }
  const hex = (c) => '#' + new T.Color(c).getHexString();
  // sRGB components 0..1 of a colour (THREE.Color stores linear values, canvases want sRGB)
  function srgb(c) { const k = new T.Color(c); const o = {}; k.getRGB(o, T.SRGBColorSpace); return o; }
  function rgba(c, a) { const k = srgb(c); return `rgba(${(k.r * 255) | 0},${(k.g * 255) | 0},${(k.b * 255) | 0},${a})`; }
  function mixc(a, b, t) { return '#' + new T.Color(a).lerp(new T.Color(b), t).getHexString(); }
  function shadec(c, k) { const x = new T.Color(c); if (k > 0) x.lerp(new T.Color(1, 1, 1), k); else x.multiplyScalar(1 + k); return '#' + x.getHexString(); }

  // =====================================================================================================
  // WIND — shared vertex-shader sway
  // =====================================================================================================
  const Wind = {
    uniforms: {
      uWT: { value: 0 }, // wind time (s)
      uWDir: { value: new T.Vector3(1, 0, 0.35).normalize() }, // world-space wind direction
      uWGust: { value: 0 }, // slow global gust envelope (−0.3..1)
      uWAmp: { value: 1 }, // global strength multiplier (weather can raise it)
    },
    time: 0, driven: -1e9,
  };
  // the lead (or Env3D) calls this once per frame
  Wind.update = function (dt) {
    Wind.driven = performance.now();
    Wind.advance(dt);
  };
  Wind.advance = function (dt) {
    Wind.time += Math.min(dt, 0.1);
    const t = Wind.time;
    Wind.uniforms.uWT.value = t;
    // gusts: sum of slow sines, biased positive (wind blows mostly one way)
    Wind.uniforms.uWGust.value = 0.35 + 0.35 * sin(t * 0.23) + 0.2 * sin(t * 0.61 + 1.3) + 0.1 * sin(t * 1.7 + 0.4);
  };
  // fallback from model update(): follow the view's clock when nobody drives the wind
  let lastTick = -1;
  Wind.tick = function (t) {
    if (performance.now() - Wind.driven < 400) return;
    if (t === lastTick) return;
    const dt = lastTick < 0 ? 0 : t - lastTick;
    lastTick = t;
    if (dt < 0 || dt > 1) { Wind.time = t; Wind.advance(0); } else Wind.advance(dt);
  };

  // Inject wind + per-instance colour variation + foliage translucency into a built-in lit material.
  // opts: { strength (m of tip sway at full gust), height (m: height where the bend reaches 1), flex (exponent, 1.5..3),
  //         flutter (m: leaf jitter amplitude), radial (extra bend for parts far from the trunk axis, per m),
  //         var: [r,g,b] colour variation amplitude per instance (multiplicative), trans: 0..1 translucency/wrap,
  //         transColor, grass: bool (instanced blades: whole height bends, bend uses instance origin),
  //         hang: y (hanging parts: bend grows downward from y), pulse: 0..1 (emissive breathing), pulseSpeed,
  //         hue: radians (emissive hue swing), hueRate (rad/s continuous hue cycling), vglow: k (vertex colour → emissive),
  //         irid: k (view-angle rainbow fresnel, psychedelic spirit materials) }
  Wind.windify = function (mat, opts = {}) {
    if (mat.userData.wind) { Object.assign(mat.userData.wind, opts); return mat; }
    const o = Object.assign({ strength: 0.12, height: 4, flex: 2, flutter: 0, radial: 0, var: [0.08, 0.08, 0.05], trans: 0, transColor: 0xd8ff8a, hang: 0, pulse: 0, pulseSpeed: 1.6, hue: 0, hueRate: 0, vglow: 0, irid: 0, billow: 0 }, opts);
    mat.userData.wind = o;
    const U = {
      uWS: { value: o.strength }, uWH: { value: o.height }, uWFx: { value: o.flex }, uWFl: { value: o.flutter }, uWRad: { value: o.radial },
      uVar: { value: new T.Vector3(o.var[0], o.var[1], o.var[2]) }, uTrans: { value: o.trans }, uTransCol: { value: new T.Color(o.transColor) },
      uWHang: { value: o.hang }, uGlow: { value: new T.Vector4(o.pulse, o.pulseSpeed, o.hue, o.hueRate) }, uVGlow: { value: o.vglow }, uIrid: { value: o.irid }, uBillow: { value: o.billow },
    };
    const fx = o.pulse || o.hue || o.hueRate || o.vglow || o.irid;
    mat.userData.windU = U;
    const prev = mat.onBeforeCompile;
    const inst = !!o.grass;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, Wind.uniforms, U, inst ? Nature.grassU : {});
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uWT, uWGust, uWAmp, uWS, uWH, uWFx, uWFl, uWRad, uWHang, uBillow; uniform vec3 uWDir;
          ${inst ? 'uniform vec3 uPlayer; uniform float uGrassFar; uniform vec3 uCamPos;' : ''}
          varying float vNVar; varying float vNH;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            mat4 wm = modelMatrix;
            #ifdef USE_INSTANCING
              wm = modelMatrix * instanceMatrix;
            #endif
            vec3 org = (wm * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
            float ph = dot(org.xz, vec2(0.371, 0.613));
            vNVar = fract(sin(dot(org.xz, vec2(12.9898, 78.233))) * 43758.5453);
            float hy = uWHang > 0.0 ? max(uWHang - transformed.y, 0.0) : max(transformed.y, 0.0);
            vNH = hy / uWH;
            float h = clamp(hy / uWH, 0.0, 1.6);
            float bend = pow(h, uWFx) + uWRad * length(transformed.xz) * h;
            float t = uWT;
            // travelling gust wave across the world + per-plant phase
            float wave = sin(t * 1.05 + ph + dot(org.xz, uWDir.xz) * 0.35) * 0.55 + sin(t * 2.27 + ph * 1.7) * 0.22 + sin(t * 0.43 + ph * 0.5) * 0.23;
            float sway = (uWGust * 0.65 + 0.35) * (0.45 + wave) * uWAmp;
            vec3 wd = transpose(mat3(wm)) * uWDir;
            wd.y = 0.0; float wl = length(wd); wd = wl > 1e-4 ? wd / wl : vec3(1.0, 0.0, 0.0);
            vec3 side = vec3(-wd.z, 0.0, wd.x);
            vec3 disp = (wd * sway + side * sin(t * 1.63 + ph * 2.1) * 0.25) * bend * uWS;
            ${inst ? `
            // grass: bend away from the player, fade out with distance
            vec3 wp = (wm * vec4(transformed, 1.0)).xyz;
            vec2 pd = wp.xz - uPlayer.xz; float pl = length(pd);
            float pk = (1.0 - smoothstep(0.15, 0.85, pl)) * h;
            disp.xz += (transpose(mat3(wm)) * vec3(pd.x, 0.0, pd.y)).xz / max(pl, 0.05) * pk * 0.32;
            disp.y -= pk * 0.18;
            float cd = length(org - uCamPos);
            float fade = 1.0 - smoothstep(uGrassFar * 0.78, uGrassFar, cd);
            transformed.y *= fade;
            ` : ''}
            // flutter: leaves jitter along their normal, phase by position
            float fl = sin(t * 7.3 + dot(transformed, vec3(3.1, 2.3, 4.7)) + ph * 3.0) * sin(t * 2.9 + transformed.y * 1.7 + ph);
            disp += objectNormal * fl * uWFl * clamp(h * 1.5, 0.0, 1.0) * (0.5 + 0.7 * uWGust) * uWAmp;
            // billow (clouds): slow swelling along the normal
            disp += objectNormal * uBillow * (sin(t * 0.55 + dot(transformed, vec3(1.3, 0.9, 1.1)) + ph) * 0.6 + sin(t * 0.31 + dot(transformed, vec3(-0.7, 1.7, 0.4))) * 0.4);
            // keep branch length roughly constant: dip a little when bent
            disp.y -= dot(disp.xz, disp.xz) * 0.35 / max(hy, 0.6);
            transformed += disp;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uVar; uniform float uTrans; uniform vec3 uTransCol; varying float vNVar; varying float vNH;
          ${fx ? `uniform float uWT, uVGlow, uIrid; uniform vec4 uGlow;
          vec3 natHue(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca); }` : ''}`)
        // two-sided cards keep their authored (bent) normals on the back face too — no dark backsides
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          #if defined( DOUBLE_SIDED ) && !defined( FLAT_SHADED )
            normal = normalize( vNormal );
          #endif`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          { float k = vNVar * 2.0 - 1.0; float k2 = fract(vNVar * 7.13) * 2.0 - 1.0;
            diffuseColor.rgb *= 1.0 + vec3(uVar.x * k + uVar.z * k2, uVar.y * k, uVar.z * k - uVar.x * k2 * 0.5); }`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          #if NUM_DIR_LIGHTS > 0
          if (uTrans > 0.0) {
            vec3 Ld = directionalLights[0].direction; vec3 Vd = normalize(vViewPosition);
            float ndl = dot(normal, Ld);
            float wrap = clamp((ndl + 0.65) / 1.65, 0.0, 1.0) - clamp(ndl, 0.0, 1.0);
            float back = pow(clamp(dot(-Vd, Ld), 0.0, 1.0), 3.0) * 0.8 + 0.2 * clamp(-ndl, 0.0, 1.0);
            reflectedLight.directDiffuse += directionalLights[0].color * diffuseColor.rgb * uTrans * (wrap * 0.45 + back * uTransCol * 0.9);
          }
          #endif`);
      if (fx) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float ph = vNVar * 6.2832;
            #ifdef USE_COLOR
              totalEmissiveRadiance += vColor.rgb * uVGlow;
            #endif
            totalEmissiveRadiance *= 1.0 + uGlow.x * sin(uWT * uGlow.y + ph);
            float ha = uGlow.z * sin(uWT * 0.7 + ph) + uGlow.w * uWT + ph * step(0.001, uGlow.w);
            totalEmissiveRadiance = max(natHue(totalEmissiveRadiance, ha), 0.0);
            if (uIrid > 0.0) {
              float fr = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
              vec3 rb = 0.5 + 0.5 * cos(6.2832 * (fr * 1.4 + uWT * 0.12 + vNVar + vec3(0.0, 0.33, 0.67)));
              totalEmissiveRadiance += rb * pow(fr, 1.6) * uIrid;
            }
          }`);
    };
    // instancing-aware (wm = modelMatrix × instanceMatrix above): G.Batch3D may instance these materials
    if (G.R3M.markInstSafe) G.R3M.markInstSafe(mat, prev);
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|wind' + (inst ? 'G' : '') + (fx ? 'F' : ''); };
    mat.needsUpdate = true;
    return mat;
  };
  G.Wind3D = Wind;

  const Nature = {
    grassU: { uPlayer: { value: new T.Vector3(-999, 0, -999) }, uGrassFar: { value: 26 }, uCamPos: { value: new T.Vector3() } },
  };
  G.Nature3D = Nature;

  // =====================================================================================================
  // TEXTURES (canvas-painted, cached)
  // =====================================================================================================
  const tex = (key, w, h, paint, opts) => G.R3M.tex('nat_' + key, w, h, paint, opts);
  // wrap-aware drawing: call fn(dx) for dx in {−w, 0, w} so strokes tile horizontally
  const wrapX = (w, fn) => { fn(-w); fn(0); fn(w); };

  // ---- bark: vertical furrows / plates / rings; tiles in u (around) and v (along). ~1 m per 512 px vertically
  function barkTex(key, P) {
    return tex('bark_' + key, 256, 512, (g, w, h) => {
      const r = RNG(P.seed || 7), n = vnoise(P.seed || 7);
      g.fillStyle = P.mid; g.fillRect(0, 0, w, h);
      // low-frequency tone
      const img = g.getImageData(0, 0, w, h), d = img.data;
      const cA = srgb(P.dark), cB = srgb(P.light);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // periodic in x: sample noise on a circle-ish (x wraps every w)
        const u = x / w;
        const f = fbm(n, u * 8 + (P.furrow ? 0 : 0), y / h * (P.vfreq || 3), 3) * 0.6 + fbm(n, (u * 8 + 3.3) % 8 + 40, y / h * 22, 2) * 0.4;
        const k = clamp(f * 1.35 - 0.2, 0, 1);
        const i = (y * w + x) * 4;
        d[i] = (cA.r + (cB.r - cA.r) * k) * 255; d[i + 1] = (cA.g + (cB.g - cA.g) * k) * 255; d[i + 2] = (cA.b + (cB.b - cA.b) * k) * 255; d[i + 3] = 255;
      }
      // fix seam of fbm at x wrap: blend the last 16 columns toward the first
      for (let y = 0; y < h; y++) for (let x = 0; x < 16; x++) {
        const a = (y * w + (w - 16 + x)) * 4, b = (y * w + x) * 4, t = (x + 1) / 17;
        for (let c = 0; c < 3; c++) d[a + c] = d[a + c] * (1 - t) + d[b + c] * t;
      }
      g.putImageData(img, 0, 0);
      g.lineCap = 'round';
      const style = P.style || 'furrow';
      if (style === 'furrow' || style === 'fibre') {
        // long vertical furrows (camphor, cypress fibre strips)
        const N = style === 'fibre' ? 70 : 38;
        for (let i = 0; i < N; i++) {
          const x0 = r() * w, y0 = r() * h, L = (style === 'fibre' ? 120 : 50) + r() * 220, wd = (style === 'fibre' ? 1.5 : 2.5) + r() * 3;
          const col = r() < 0.75 ? rgba(P.line, 0.55 + r() * 0.3) : rgba(P.hi, 0.35);
          wrapX(w, (dx) => {
            for (const oy of [-h, 0, h]) {
              g.strokeStyle = col; g.lineWidth = wd; g.beginPath();
              let x = x0 + dx, y = y0 + oy; g.moveTo(x, y);
              for (let s = 0; s < 8; s++) { x += r.pm(3); y += L / 8; g.lineTo(x, y); }
              g.stroke();
            }
          });
        }
        // highlights on ridges
        for (let i = 0; i < 60; i++) {
          const x0 = r() * w, y0 = r() * h, L = 20 + r() * 60;
          wrapX(w, (dx) => { g.strokeStyle = rgba(P.hi, 0.22); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0 + dx + 3, y0); g.lineTo(x0 + dx + 3 + r.pm(2), y0 + L); g.stroke(); });
        }
      }
      if (style === 'plates') {
        // pine: irregular plates separated by dark fissures
        for (let i = 0; i < 90; i++) {
          const cx = r() * w, cy = r() * h, pw = 18 + r() * 30, ph = 26 + r() * 50;
          wrapX(w, (dx) => {
            for (const oy of [-h, 0, h]) {
              g.fillStyle = rgba(r() < 0.5 ? P.light : P.hi, 0.35 + r() * 0.3);
              g.strokeStyle = rgba(P.line, 0.85); g.lineWidth = 2.5;
              g.beginPath();
              for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; const px = cx + dx + cos(a) * pw / 2 * (0.8 + r() * 0.3), py = cy + oy + sin(a) * ph / 2 * (0.8 + r() * 0.3); k ? g.lineTo(px, py) : g.moveTo(px, py); }
              g.closePath(); g.fill(); g.stroke();
            }
          });
        }
      }
      if (style === 'smooth' || style === 'lenticel') {
        // cherry / smooth grey: horizontal lenticels
        for (let i = 0; i < (style === 'lenticel' ? 160 : 50); i++) {
          const x0 = r() * w, y0 = r() * h, L = 6 + r() * 18;
          wrapX(w, (dx) => { g.strokeStyle = rgba(r() < 0.7 ? P.line : P.hi, 0.5); g.lineWidth = 1.5 + r() * 1.5; g.beginPath(); g.moveTo(x0 + dx, y0); g.lineTo(x0 + dx + L, y0 + r.pm(1)); g.stroke(); });
        }
      }
      if (style === 'rings') {
        // palm / tree fern: leaf scars as rings
        for (let y = 0; y < h; y += 20 + r() * 10) {
          g.fillStyle = rgba(P.line, 0.6); g.fillRect(0, y, w, 3 + r() * 2);
          g.fillStyle = rgba(P.hi, 0.35); g.fillRect(0, y + 4, w, 2);
          for (let i = 0; i < 10; i++) { const x0 = r() * w; g.fillStyle = rgba(P.dark, 0.5); g.fillRect(x0, y + 5, 6 + r() * 14, 6 + r() * 6); }
        }
      }
      if (style === 'fern') {
        // tree fern trunk: fibrous roots mat + diamond leaf-base scars
        for (let y = 0; y < h + 40; y += 34) for (let x = 0; x < w + 40; x += 40) {
          const ox = x + ((y / 34) % 2) * 20, oy = y;
          g.fillStyle = rgba(P.light, 0.55); g.beginPath(); g.ellipse(ox % w, oy % h, 9, 13, 0, 0, TAU); g.fill();
          g.fillStyle = rgba(P.line, 0.8); g.beginPath(); g.ellipse(ox % w, oy % h + 2, 4, 6, 0, 0, TAU); g.fill();
        }
        for (let i = 0; i < 300; i++) { const x0 = r() * w, y0 = r() * h; g.strokeStyle = rgba(P.line, 0.5); g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + r.pm(4), y0 + 6 + r() * 10); g.stroke(); }
      }
      // moss patches (bottom-heavy is done by vertex colour; here generic)
      if (P.moss) for (let i = 0; i < 26; i++) {
        const x0 = r() * w, y0 = r() * h, R0 = 6 + r() * 22;
        wrapX(w, (dx) => {
          const gr = g.createRadialGradient(x0 + dx, y0, 0, x0 + dx, y0, R0);
          gr.addColorStop(0, rgba(P.moss, 0.55)); gr.addColorStop(1, rgba(P.moss, 0));
          g.fillStyle = gr; g.fillRect(x0 + dx - R0, y0 - R0, R0 * 2, R0 * 2);
        });
      }
    }, { wrap: true });
  }

  // ---- leaf-cluster atlas: 2×2 cells, each an irregular round clump of painted leaves (alpha cut-out)
  // P: { dark, mid, light, hi, shape: 'oval'|'palmate'|'needle'|'blossom'|'scale'|'small', n, L, W, seed, blossom?: {...} }
  function leafAtlas(key, P) {
    return tex('leaf_' + key, 512, 512, (g) => {
      const r = RNG(P.seed || 11);
      for (let cell = 0; cell < 4; cell++) {
        const ox = (cell % 2) * 256 + 128, oy = floor(cell / 2) * 256 + 128;
        g.save(); g.translate(ox, oy);
        g.beginPath(); g.rect(-127, -127, 254, 254); g.clip();
        const n = P.n || 60;
        const RR = P.R || 92;
        // solid inner mass with a scalloped edge so clumps read as dense foliage, not confetti
        if (P.mass !== false) {
          const bumps = 9 + r.int(4), ph = r() * TAU;
          g.beginPath();
          for (let i = 0; i <= 64; i++) {
            const a = i / 64 * TAU;
            const rr = RR * (P.massR || 0.72) * (1 + 0.12 * sin(a * bumps + ph) + r.pm(0.04));
            const x = cos(a) * rr, y = sin(a) * rr;
            i ? g.lineTo(x, y) : g.moveTo(x, y);
          }
          const mg = g.createLinearGradient(-RR * 0.5, -RR * 0.7, RR * 0.5, RR * 0.7);
          mg.addColorStop(0, P.mid); mg.addColorStop(0.6, P.dark); mg.addColorStop(1, shadec(P.dark, -0.3));
          g.fillStyle = mg; g.fill();
        }
        // back → front: dark leaves first, lit last; leaves placed in a disc, pointing outward
        const leaves = [];
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, d = pow(r(), 0.5) * RR;
          const x = cos(a) * d, y = sin(a) * d;
          const z = r() * 0.5 + (1 - d / RR) * 0.25 - (y - x * 0.4) / (RR * 2.2) + 0.1; // upper-left & centre = lit/front
          leaves.push({ x, y, a: a + r.pm(0.7), z, s: 0.8 + r() * 0.45 });
        }
        leaves.sort((p, q) => p.z - q.z);
        for (const L of leaves) drawLeaf(g, P, L, r);
        g.restore();
      }
    });
  }
  function drawLeaf(g, P, L, r) {
    const lit = clamp(L.z, 0, 1);
    const cols = [P.dark, P.mid, P.light, P.hi];
    const ci = clamp(floor(lit * 3.2 + r.pm(0.6)), 0, 3);
    const base = cols[ci], tip = cols[min(3, ci + 1)];
    g.save(); g.translate(L.x, L.y); g.rotate(L.a + PI / 2); g.scale(L.s, L.s);
    const len = P.L || 26, wid = P.W || 10;
    const sh = P.shape || 'oval';
    if (sh === 'needle') {
      // pine needle tuft: fan of thin strokes
      g.lineCap = 'round';
      const k = 13;
      for (let i = 0; i < k; i++) {
        const a = (i / (k - 1) - 0.5) * 1.5;
        g.strokeStyle = i % 3 === 0 ? tip : base; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(0, 6); g.quadraticCurveTo(sin(a) * len * 0.5, -len * 0.4, sin(a) * len, -len * cos(a) * 0.9); g.stroke();
      }
      g.restore(); return;
    }
    if (sh === 'scale') {
      // cypress / juniper: flat fern-like spray of scale leaves
      g.fillStyle = base; g.strokeStyle = P.dark;
      for (let i = 0; i < 6; i++) {
        const y = -i * len * 0.16, w0 = wid * (1 - i / 7);
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * w0 * 0.5, y, w0 * 0.55, len * 0.12, s * 0.5, 0, TAU); g.fill(); }
      }
      g.fillStyle = tip; g.beginPath(); g.ellipse(0, -len * 0.45, wid * 0.35, len * 0.5, 0, 0, TAU); g.fill();
      g.restore(); return;
    }
    if (sh === 'blossom') {
      // sakura: 5-petal flowers in small clumps with a few leaves
      if (r() < (P.leafy || 0.18)) {
        g.fillStyle = r() < 0.5 ? P.leaf || '#5d8a3a' : P.leaf2 || '#86a84a';
        leafPath(g, len * 0.9, wid * 0.9); g.fill();
      } else {
        const pc = [P.dark, P.mid, P.light, P.hi][ci];
        for (let k = 0; k < 5; k++) {
          g.save(); g.rotate(k / 5 * TAU);
          g.fillStyle = pc; g.beginPath(); g.ellipse(0, -wid * 0.55, wid * 0.42, wid * 0.62, 0, 0, TAU); g.fill();
          g.restore();
        }
        g.fillStyle = P.eye || '#c03a6a'; g.beginPath(); g.arc(0, 0, wid * 0.22, 0, TAU); g.fill();
      }
      g.restore(); return;
    }
    if (sh === 'palmate') {
      // maple / sweetgum: 5-lobed star leaf
      g.beginPath();
      const lobes = 5, R = len * 0.55;
      for (let i = 0; i <= lobes * 2; i++) {
        const a = -PI / 2 + (i / (lobes * 2)) * TAU * 0.86 - TAU * 0.43 + PI / 2;
        const rr = i % 2 === 0 ? R : R * 0.42;
        const px = cos(a - PI / 2) * rr, py = sin(a - PI / 2) * rr;
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = base; g.fill();
      g.strokeStyle = rgba(P.dark, 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(0, R * 0.2);
      for (const a of [-1.2, -0.6, 0, 0.6, 1.2]) { g.moveTo(0, R * 0.2); g.lineTo(sin(a) * R * 0.8, -cos(a) * R * 0.8); }
      g.stroke();
      g.restore(); return;
    }
    // oval / small (camphor, banyan, bush)
    const grd = g.createLinearGradient(-wid, 0, wid, 0);
    grd.addColorStop(0, tip); grd.addColorStop(0.55, base); grd.addColorStop(1, shadec(base, -0.25));
    g.fillStyle = grd;
    leafPath(g, len, wid); g.fill();
    g.strokeStyle = rgba(P.dark, 0.55); g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, 2); g.lineTo(0, -len * 0.85); g.stroke();
    if (lit > 0.6 && P.gloss !== false) { g.strokeStyle = rgba(P.hi, 0.6); g.lineWidth = 1.4; g.beginPath(); g.moveTo(-wid * 0.25, -len * 0.25); g.quadraticCurveTo(-wid * 0.35, -len * 0.55, -wid * 0.1, -len * 0.8); g.stroke(); }
    g.restore();
  }
  function leafPath(g, len, wid) {
    g.beginPath(); g.moveTo(0, 4);
    g.quadraticCurveTo(wid, -len * 0.25, 0, -len);
    g.quadraticCurveTo(-wid, -len * 0.25, 0, 4);
  }

  // ---- soft ground decal under trees: dark contact blob + leaf litter / roots tint
  function decalTex(key, P) {
    return tex('decal_' + key, 256, 256, (g, w) => {
      const r = RNG(P.seed || 5);
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, rgba(P.core || '#1a1a10', 0.55)); gr.addColorStop(0.45, rgba(P.core || '#1a1a10', 0.32)); gr.addColorStop(1, rgba(P.core || '#1a1a10', 0));
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      if (P.litter) for (let i = 0; i < (P.nLitter || 160); i++) {
        const a = r() * TAU, d = pow(r(), 0.7) * w * 0.42;
        const x = w / 2 + cos(a) * d, y = w / 2 + sin(a) * d;
        g.fillStyle = rgba(r.pick(P.litter), 0.55 + r() * 0.4 * (1 - d / w * 2));
        g.save(); g.translate(x, y); g.rotate(r() * TAU);
        g.beginPath(); g.ellipse(0, 0, P.litterSize || 3, (P.litterSize || 3) * 0.55, 0, 0, TAU); g.fill();
        g.restore();
      }
    });
  }

  // =====================================================================================================
  // MATERIALS (cached per key)
  // =====================================================================================================
  const matCache = new Map();
  function cmat(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
  Nature.mats = matCache;
  // bark/wood (wind-bent with its plant): key must be unique per wind profile
  function barkMat(key, P, wind) {
    return cmat('bark_' + key, () => {
      const m = G.R3M.env({ map: barkTex(P.tex || key, P), color: 0xffffff, vertexColors: true, roughness: 0.92 });
      if (wind) Wind.windify(m, Object.assign({ var: [0.06, 0.05, 0.04] }, wind));
      return m;
    });
  }
  function leafMat(key, atlas, wind, o = {}) {
    return cmat('leaf_' + key, () => {
      const m = G.R3M.env(Object.assign({ map: atlas, color: 0xffffff, vertexColors: true, alphaTest: 0.42, side: T.DoubleSide, roughness: 0.78, metalness: 0 }, o.params || {}));
      Wind.windify(m, Object.assign({ trans: 0.55, flutter: 0.03, var: [0.1, 0.09, 0.06] }, wind));
      m.userData.foliage = true;
      return m;
    });
  }
  function decalMat(key, P) {
    return cmat('decal_' + key, () => {
      const m = G.R3M.env({ map: decalTex(key, P), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      return m;
    });
  }
  function decal(key, P, radius, y = 0.012) {
    const geo = new T.CircleGeometry(radius, 20);
    geo.rotateX(-PI / 2); geo.translate(0, y, 0);
    const m = new T.Mesh(geo, decalMat(key, P));
    m.castShadow = false; m.receiveShadow = true; m.renderOrder = 1;
    return m;
  }

  // =====================================================================================================
  // GEOMETRY BUILDERS
  // =====================================================================================================
  // Mesh accumulator: push triangles with position/normal/uv/color; build() → BufferGeometry (indexed)
  class Acc {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
    get count() { return this.p.length / 3; }
    v(x, y, z, nx, ny, nz, u, w, r = 1, gg = 1, b = 1) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w); this.c.push(r, gg, b); return this.count - 1; }
    tri(a, b, c) { this.i.push(a, b, c); }
    quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
    build() {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
      g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.i);
      g.computeBoundingSphere();
      return g;
    }
  }

  // Tube along a polyline with per-point radius (trunks, limbs, roots, stems). Parallel-transport frames.
  // o: { seg, texW (m of bark per u-repeat), texH (m per v-repeat), ao(p) -> [r,g,b] or number,
  //      flute: { n, amp, h } (buttress lobes fading by height h), lump (radius noise), cap: bool, v0 }
  function tube(acc, pts, rads, o = {}) {
    const seg = o.seg || 8, n = pts.length;
    if (n < 2) return;
    const texW = o.texW || 0.6, texH = o.texH || 1.2;
    const r0 = rads[0];
    const uRep = Math.max(1, Math.round(TAU * r0 / texW));
    const tng = [], nor = [], bin = [];
    for (let i = 0; i < n; i++) {
      const a = pts[max(0, i - 1)], b = pts[min(n - 1, i + 1)];
      tng.push(b.clone().sub(a).normalize());
    }
    let nr = Math.abs(tng[0].y) < 0.9 ? V3(0, 1, 0).cross(tng[0]).normalize() : V3(1, 0, 0).cross(tng[0]).normalize();
    for (let i = 0; i < n; i++) {
      nr = nr.clone().sub(tng[i].clone().multiplyScalar(nr.dot(tng[i]))).normalize();
      nor.push(nr); bin.push(tng[i].clone().cross(nr).normalize());
    }
    let len = o.v0 || 0;
    const base = acc.count;
    const lumpN = o.lump ? vnoise(o.lumpSeed || 3) : null;
    for (let i = 0; i < n; i++) {
      if (i > 0) len += pts[i].distanceTo(pts[i - 1]);
      const p = pts[i];
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * TAU;
        const ca = cos(a), sa = sin(a);
        let rr = rads[i];
        if (o.flute) { const f = o.flute; const k = clamp(1 - (p.y - (f.y0 || 0)) / f.h, 0, 1); rr *= 1 + f.amp * k * k * (0.5 + 0.5 * cos(a * f.n + (f.ph || 0))); }
        if (lumpN) rr *= 1 + (lumpN(j / seg * 6, len * 3) - 0.5) * o.lump;
        const dx = nor[i].x * ca + bin[i].x * sa, dy = nor[i].y * ca + bin[i].y * sa, dz = nor[i].z * ca + bin[i].z * sa;
        let c = o.ao ? o.ao(p, i / (n - 1)) : 1;
        if (typeof c === 'number') c = [c, c, c];
        acc.v(p.x + dx * rr, p.y + dy * rr, p.z + dz * rr, dx, dy, dz, j / seg * uRep, len / texH, c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * (seg + 1) + j, b = a + seg + 1;
      acc.quad(a, b, b + 1, a + 1);
    }
    if (o.cap) {
      const p = pts[n - 1], c = acc.v(p.x, p.y, p.z, tng[n - 1].x, tng[n - 1].y, tng[n - 1].z, 0.5, len / texH + 0.1);
      const last = base + (n - 1) * (seg + 1);
      for (let j = 0; j < seg; j++) acc.tri(last + j, last + j + 1, c);
    }
  }

  // bark AO: darker near the ground (soil-tinted) + optional moss tint low on the trunk
  function barkAO(soil = [0.55, 0.5, 0.42], h0 = 0.6, moss) {
    return (p) => {
      const k = sstep(-0.1, h0, p.y);
      let c = [lerp(soil[0], 1, k), lerp(soil[1], 1, k), lerp(soil[2], 1, k)];
      if (moss) { const m = (1 - sstep(0, moss.h, p.y)) * moss.k; c = [lerp(c[0], moss.c[0], m), lerp(c[1], moss.c[1], m), lerp(c[2], moss.c[2], m)]; }
      return c;
    };
  }

  // Curved limb polyline: start, direction, length; bends toward `pull` (e.g. up) and wiggles.
  function limbPts(r, p0, dir, len, steps, o = {}) {
    const pts = [p0.clone()];
    const d = dir.clone().normalize();
    const seg = len / steps;
    let p = p0.clone();
    for (let i = 0; i < steps; i++) {
      if (o.pull) d.addScaledVector(o.pull, o.pullK || 0.1).normalize();
      if (o.wiggle) d.add(V3(r.pm(o.wiggle), r.pm(o.wiggle) * 0.5, r.pm(o.wiggle))).normalize();
      p = p.clone().addScaledVector(d, seg);
      pts.push(p);
    }
    return pts;
  }
  const taperR = (n, r0, r1, pw = 1) => Array.from({ length: n }, (_, i) => lerp(r0, r1, pow(i / (n - 1), pw)));

  // Foliage clump of crossed cards around `c` (radius rc). Normals bend toward the canopy sphere (C, R) and clump.
  // o: { cards, size, cells (atlas cells to use), ao(p)->k, tint:[r,g,b], C (canopy centre), Rn (canopy radii V3),
  //      sphere (0..1 weight of canopy normal), up (bias of card facing upward), flat (cards more horizontal) }
  const _q = new T.Quaternion(), _e = new T.Euler();
  function clump(acc, r, c, rc, o = {}) {
    const n = o.cards || 8;
    const C = o.C || c, Rn = o.Rn || V3(rc, rc, rc);
    for (let k = 0; k < n; k++) {
      const off = V3(r.pm(1), r.pm(1), r.pm(1)).multiplyScalar(rc * (o.spread || 0.45));
      const p = c.clone().add(off);
      const s = (o.size || rc * 1.25) * (0.8 + r() * 0.4);
      // card orientation: random, biased so the card faces outward/up
      const out = p.clone().sub(C).divide(Rn).normalize();
      const face = V3(r.pm(1), r.pm(1) + (o.up || 0.3), r.pm(1)).normalize().lerp(out, o.outward || 0.35).normalize();
      if (o.flat) face.lerp(V3(0, 1, 0), o.flat).normalize();
      _q.setFromUnitVectors(V3(0, 0, 1), face);
      const spin = r() * TAU;
      const ax = V3(cos(spin), sin(spin), 0).applyQuaternion(_q), ay = V3(-sin(spin), cos(spin), 0).applyQuaternion(_q);
      const cell = o.cells ? r.pick(o.cells) : r.int(4);
      const u0 = (cell % 2) * 0.5, v0 = 1 - floor(cell / 2) * 0.5 - 0.5;
      const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
      const idx = [];
      for (const [sx, sy, cu, cv] of corners) {
        const q = p.clone().addScaledVector(ax, sx * s * 0.5).addScaledVector(ay, sy * s * 0.5);
        // bent normal: canopy sphere + clump sphere + card face
        const nC = q.clone().sub(C).divide(Rn).normalize();
        const nK = q.clone().sub(c).normalize();
        const w = o.sphere != null ? o.sphere : 0.7;
        const wk = o.clumpN != null ? o.clumpN : 0.45;
        const nn = nC.multiplyScalar(w).add(nK.multiplyScalar(wk)).add(face.clone().multiplyScalar(max(0, 0.7 - w))).normalize();
        // AO: inner/lower parts darker
        const dIn = q.clone().sub(C).divide(Rn).length();
        const up = sstep(-0.7, 0.7, nC.y);
        const ao = o.ao ? o.ao(q, dIn) : lerp(0.38, 1, sstep(0.2, 1.0, dIn)) * lerp(0.6, 1, up);
        // stylised temperature split: cool undersides, warm sunlit tops
        const tint = o.tint || [1, 1, 1];
        const tr = lerp(0.88, 1.04, up), tg = lerp(0.96, 1.02, up), tb = lerp(1.1, 0.9, up);
        idx.push(acc.v(q.x, q.y, q.z, nn.x, nn.y, nn.z, u0 + cu * 0.5, v0 + cv * 0.5, ao * tint[0] * tr, ao * tint[1] * tg, ao * tint[2] * tb));
      }
      acc.quad(idx[0], idx[1], idx[2], idx[3]);
    }
  }

  // Sample cluster centres on/in an ellipsoidal canopy envelope (biased to the outer shell; flattened bottom).
  function canopyPoints(r, C, R, n, o = {}) {
    const pts = [];
    let guard = 0;
    const minD = o.minD || 0.32 * min(R.x, R.z);
    while (pts.length < n && guard++ < n * 60) {
      const u = r() * 2 - 1, a = r() * TAU, s = sqrt(1 - u * u);
      const d = lerp(o.inner || 0.55, 1, pow(r(), 0.6));
      const p = V3(cos(a) * s * d, u * d, sin(a) * s * d);
      if (p.y < -(o.bottom != null ? o.bottom : 0.55)) continue;
      const q = V3(C.x + p.x * R.x, C.y + p.y * R.y, C.z + p.z * R.z);
      if (o.shape && !o.shape(q, p)) continue;
      if (pts.some((x) => x.distanceTo(q) < minD) && guard < n * 40) continue;
      pts.push(q);
    }
    return pts;
  }

  function meshOf(acc, mat, opts = {}) {
    const m = new T.Mesh(acc.build(), mat);
    m.castShadow = opts.cast !== false; m.receiveShadow = opts.receive !== false;
    if (opts.name) m.name = opts.name;
    return m;
  }

  // =====================================================================================================
  // BROADLEAF TREES — camphor 樟樹, maple 楓香, sakura 山櫻 (1×1)
  // =====================================================================================================
  // trunk + main limbs from fork → canopy clusters; twigs from limbs to every cluster; root flare into the ground.
  function broadleaf(o, K, cfg) {
    const v = o.v || 0;
    const r = RNG(cfg.seed + v * 977);
    const H = cfg.H * (1 + r.pm(0.06));
    const bark = new Acc(), leaf = new Acc();
    const wind = { height: H, strength: cfg.sway || 0.16, flex: 2.2 };
    const bmat = barkMat(cfg.id, cfg.bark, wind);
    const lmat = leafMat(cfg.id + v, leafAtlas(cfg.id + v, cfg.leaf(v)), Object.assign({}, wind, { flutter: cfg.flutter || 0.035 }), cfg.leafMatO);
    const lean = V3(r.pm(0.12), 0, r.pm(0.12));
    // trunk
    const forkY = cfg.forkY * H;
    const tpts = limbPts(r, V3(0, -0.15, 0), V3(lean.x, 1, lean.z), forkY + 0.15, 7, { wiggle: 0.05 });
    const ao = barkAO([0.6, 0.55, 0.45], 0.7, cfg.moss);
    tube(bark, tpts, taperR(tpts.length, cfg.r0, cfg.r0 * 0.72, 0.7), { seg: 10, ao, flute: { n: 5, amp: 0.45, h: 0.55, ph: r() * 6 }, lump: 0.12, texW: 0.5 });
    // roots: surface roots spreading and diving into the soil
    const nRoots = cfg.roots || 5;
    for (let i = 0; i < nRoots; i++) {
      const a = (i / nRoots) * TAU + r.pm(0.4);
      const d = V3(cos(a), -0.05, sin(a));
      const p0 = V3(cos(a) * cfg.r0 * 0.5, 0.18, sin(a) * cfg.r0 * 0.5);
      const pts = limbPts(r, p0, d.clone().add(V3(0, -0.45, 0)), cfg.r0 * 2.6 + r() * 0.3, 5, { pull: V3(0, -1, 0), pullK: 0.12, wiggle: 0.15 });
      tube(bark, pts, taperR(pts.length, cfg.r0 * 0.38, 0.02, 0.8), { seg: 6, ao, texW: 0.4 });
    }
    // canopy envelope
    const C = V3(lean.x * forkY, cfg.cy * H, lean.z * forkY);
    const R = V3(cfg.rx * (1 + r.pm(0.08)), cfg.ry * H, cfg.rx * (1 + r.pm(0.08)));
    const top = tpts[tpts.length - 1];
    // main limbs
    const limbs = [];
    const nL = cfg.limbs || 4;
    for (let i = 0; i < nL; i++) {
      const a = (i / nL) * TAU + r.pm(0.5);
      const tgt = V3(C.x + cos(a) * R.x * 0.62, C.y + r.range(-0.1, 0.35) * R.y, C.z + sin(a) * R.z * 0.62);
      const p0 = top.clone().add(V3(0, r.pm(0.15) - i * 0.06, 0));
      const dir = tgt.clone().sub(p0);
      const pts = limbPts(r, p0, dir, dir.length(), 6, { wiggle: 0.12, pull: V3(0, 1, 0), pullK: cfg.upPull != null ? cfg.upPull : 0.05 });
      limbs.push(pts);
      tube(bark, pts, taperR(pts.length, cfg.r0 * 0.55, cfg.r0 * 0.16, 0.8), { seg: 7, ao, texW: 0.35 });
    }
    // leader (continues the trunk up the middle)
    {
      const p0 = top.clone(), tgt = C.clone().add(V3(r.pm(0.2), R.y * 0.55, r.pm(0.2)));
      const pts = limbPts(r, p0, tgt.clone().sub(p0), tgt.distanceTo(p0), 5, { wiggle: 0.1 });
      limbs.push(pts);
      tube(bark, pts, taperR(pts.length, cfg.r0 * 0.5, cfg.r0 * 0.12, 0.8), { seg: 6, ao, texW: 0.35 });
    }
    // clusters + twigs
    const cps = canopyPoints(r, C, R, cfg.clusters || 26, { bottom: cfg.bottom != null ? cfg.bottom : 0.5, inner: 0.5 });
    const rc = cfg.rc || 0.62;
    const tintSet = cfg.tints || [[1, 1, 1]];
    for (const c of cps) {
      // nearest limb point → twig
      let best = null, bd = 1e9;
      for (const L of limbs) for (let i = 2; i < L.length; i++) { const d = L[i].distanceTo(c); if (d < bd) { bd = d; best = L[i]; } }
      if (best && bd > 0.25) {
        const pts = limbPts(r, best, c.clone().sub(best), bd * 0.85, 3, { wiggle: 0.15 });
        tube(bark, pts, taperR(pts.length, cfg.r0 * 0.14, 0.012, 1), { seg: 4, ao, texW: 0.2 });
      }
      const tint = r.pick(tintSet);
      clump(leaf, r, c, rc * (0.85 + r() * 0.3), { cards: cfg.cards || 9, C, Rn: R, tint, sphere: 0.55, clumpN: 0.5, outward: 0.45, up: 0.35 });
    }
    // inner filler cards (deep shade so the canopy reads solid)
    const inner = canopyPoints(r, C, R.clone().multiplyScalar(0.6), cfg.inner || 6, { bottom: 0.3, inner: 0.0, minD: 0.3 });
    for (const c of inner) clump(leaf, r, c, rc * 1.1, { cards: 5, C, Rn: R, sphere: 0.85 });
    const g = K.group(meshOf(bark, bmat), meshOf(leaf, lmat));
    if (cfg.extra) cfg.extra(g, r, { C, R, H, wind, leaf, K });
    const out = K.merge(g);
    out.add(decal(cfg.id, cfg.decal, max(R.x, R.z) * 1.05));
    return out;
  }
  // Per-instance yaw (set once, on the first update) for footprints that are rotation-symmetric, so repeated
  // trees / plants / rocks never read as clones. Skipped when the map sets o.rot3d itself.
  function spin(node, o) {
    if (node.userData.natSpun || o.rot3d) return;
    node.userData.natSpun = true;
    const h = Math.sin((o.x || 0) * 127.1 + (o.y || 0) * 311.7) * 43758.5453;
    node.rotation.y = (h - Math.floor(h)) * TAU;
  }
  Nature.spin = spin;
  // batch: true + pose: update() only ticks the shared wind clock and applies spin() once, so G.Batch3D may draw
  // these as instances with the pose baked in (js/r3d/batch.js)
  const BATCH = { batch: true, pose: spin };
  function defTree(id, def) {
    G.Models.define(id, Object.assign({
      variants: 3,
      occluder: true,
      update(node, o, t) { Wind.tick(t); spin(node, o); },
      ...BATCH,
    }, def));
  }

  const BARKS = {
    camphor: { seed: 21, style: 'furrow', dark: '#4e3c2c', mid: '#6e5842', light: '#937a5e', hi: '#bea684', line: '#241a12', moss: '#5f7a34', vfreq: 2 },
    grey: { seed: 23, style: 'smooth', dark: '#625d54', mid: '#857f72', light: '#a8a090', hi: '#cfc6b2', line: '#3a362e', moss: '#6a8a3a' },
    cherry: { seed: 25, style: 'lenticel', dark: '#55302a', mid: '#764438', light: '#98604e', hi: '#c08a74', line: '#2c1612', vfreq: 1.5 },
  };

  defTree('tree_camphor', {
    build: (o, K) => broadleaf(o, K, {
      id: 'tree_camphor', seed: 101, H: 4.4, forkY: 0.36, r0: 0.21, cy: 0.66, rx: 1.5, ry: 0.36, limbs: 4, clusters: 17, rc: 0.74, cards: 15,
      bark: BARKS.camphor, moss: { h: 0.9, k: 0.35, c: [0.55, 0.7, 0.35] },
      leaf: (v) => [
        { seed: 31, shape: 'oval', n: 90, L: 34, W: 13, dark: '#2c5527', mid: '#4a8634', light: '#78b443', hi: '#c6e57d' },
        { seed: 32, shape: 'oval', n: 90, L: 34, W: 13, dark: '#2a5530', mid: '#3f7f46', light: '#6aac54', hi: '#b2dc80' },
        { seed: 33, shape: 'oval', n: 90, L: 34, W: 13, dark: '#3a5a22', mid: '#5c8c2e', light: '#8eb840', hi: '#d4e47a' },
      ][v],
      // young red-bronze camphor flush on a few clumps
      tints: [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1.08, 1.04, 0.9], [1.12, 0.92, 0.8]],
      decal: { seed: 3, core: '#16200e', litter: ['#5a6a2a', '#7a7a34', '#8a5a2a'], nLitter: 120 },
    }),
  });
  defTree('tree_maple', {
    build: (o, K) => broadleaf(o, K, {
      id: 'tree_maple', seed: 202, H: 3.9, forkY: 0.34, r0: 0.15, cy: 0.66, rx: 1.3, ry: 0.36, limbs: 4, clusters: 26, rc: 0.48, cards: 10, upPull: 0.08,
      bark: BARKS.grey, sway: 0.18,
      leaf: (v) => [
        { seed: 41, shape: 'palmate', n: 70, L: 40, dark: '#7c1a1a', mid: '#b5322a', light: '#df5e30', hi: '#ffb15a' },
        { seed: 42, shape: 'palmate', n: 70, L: 40, dark: '#8a4a12', mid: '#c27a1c', light: '#e6aa30', hi: '#ffe07a' },
        { seed: 43, shape: 'palmate', n: 70, L: 40, dark: '#4c5420', mid: '#8a7a26', light: '#c9802e', hi: '#f2b25a' },
      ][v],
      tints: [[1, 1, 1], [1, 0.92, 0.9], [1.05, 1.05, 1]],
      leafMatO: { params: { roughness: 0.7 } },
      decal: { seed: 4, core: '#2a160c', litter: ['#b5322a', '#df5e30', '#e6aa30', '#8a2a1a'], nLitter: 260, litterSize: 4 },
    }),
  });
  defTree('tree_sakura', {
    build: (o, K) => broadleaf(o, K, {
      id: 'tree_sakura', seed: 303, H: 3.7, forkY: 0.3, r0: 0.15, cy: 0.64, rx: 1.45, ry: 0.32, limbs: 5, clusters: 28, rc: 0.47, cards: 10, upPull: 0.0, bottom: 0.4,
      bark: BARKS.cherry, sway: 0.15,
      leaf: (v) => [
        { seed: 51, shape: 'blossom', n: 80, W: 13, L: 22, dark: '#c94a7f', mid: '#ec7fa8', light: '#ffb2cc', hi: '#ffe0ec', eye: '#b02a5a', leafy: 0.1 },
        { seed: 52, shape: 'blossom', n: 80, W: 13, L: 22, dark: '#d0507a', mid: '#f08aaa', light: '#ffc0d4', hi: '#fff0f4', eye: '#c03a6a', leafy: 0.2 },
        { seed: 53, shape: 'blossom', n: 80, W: 13, L: 22, dark: '#a8306a', mid: '#d4508a', light: '#f080b0', hi: '#ffc0dc', eye: '#902050', leafy: 0.06 },
      ][v],
      leafMatO: { params: { roughness: 0.65 } },
      decal: { seed: 6, core: '#2a1018', litter: ['#ffb2cc', '#ffd0e0', '#ec7fa8'], nLitter: 300, litterSize: 3.2 },
    }),
  });

  // =====================================================================================================
  // shared: recursive branching (dead tree, snags, banyan limbs)
  // =====================================================================================================
  // o: { segLen, wiggle, pull, pullK, taper, depth, kids(depth) -> n, spread (rad), lenK, radK, seg, ao, texW, minR }
  function branchRec(acc, r, p0, dir, len, rad, depth, o, tips) {
    const steps = max(2, Math.round(len / (o.segLen || 0.35)));
    const pts = limbPts(r, p0, dir, len, steps, { wiggle: o.wiggle || 0.12, pull: o.pull, pullK: o.pullK || 0 });
    const rads = taperR(pts.length, rad, rad * (o.taper || 0.55), 1);
    tube(acc, pts, rads, { seg: max(3, (o.seg || 8) - depth * 2), ao: o.ao, texW: o.texW || 0.4, cap: depth >= (o.depth || 3) });
    const end = pts[pts.length - 1], edir = end.clone().sub(pts[pts.length - 2]).normalize();
    if (depth >= (o.depth || 3) || rad < (o.minR || 0.012)) { tips.push({ p: end, dir: edir, depth }); return; }
    const n = o.kids ? o.kids(depth, r) : 2 + r.int(2);
    for (let k = 0; k < n; k++) {
      const f = k === n - 1 ? 1 : lerp(0.35, 0.9, (k + r()) / n);
      const idx = clamp(Math.round(f * (pts.length - 1)), 1, pts.length - 1);
      const p = pts[idx];
      const d = k === n - 1 ? edir.clone() : pts[idx].clone().sub(pts[idx - 1]).normalize();
      // rotate away from the parent by `spread` around a random perpendicular axis
      const ax = V3(r.pm(1), r.pm(1), r.pm(1)).cross(d).normalize();
      d.applyAxisAngle(ax, (o.spread || 0.6) * (k === n - 1 ? 0.4 : 1) * (0.7 + r() * 0.6));
      if (o.up) d.y += o.up;
      d.normalize();
      branchRec(acc, r, p, d, len * (o.lenK || 0.7) * (0.8 + r() * 0.4), rads[idx] * (o.radK || 0.75), depth + 1, o, tips);
    }
  }

  const BARKS2 = {
    pine: { seed: 27, style: 'plates', dark: '#5a2e1e', mid: '#7e4630', light: '#a2654a', hi: '#c98c6a', line: '#2a120a', vfreq: 2 },
    dead: { seed: 29, style: 'fibre', dark: '#77737a', mid: '#99959c', light: '#bdb9c0', hi: '#e2dee4', line: '#45424a', vfreq: 1 },
    cypress: { seed: 31, style: 'fibre', dark: '#6a2e1c', mid: '#8e4428', light: '#b0603c', hi: '#d68a5e', line: '#381608', vfreq: 1, moss: '#56743a' },
    snag: { seed: 33, style: 'fibre', dark: '#8a8790', mid: '#aeabb4', light: '#cfccd4', hi: '#f0eef4', line: '#55525a', vfreq: 1 },
    juniper: { seed: 35, style: 'fibre', dark: '#5a4840', mid: '#7a6558', light: '#a99383', hi: '#d8cabd', line: '#2e221c', vfreq: 1.2 },
    banyan: { seed: 37, style: 'smooth', dark: '#5a5448', mid: '#7a7262', light: '#9c947f', hi: '#c4bca4', line: '#2e2a22', moss: '#5a7a34' },
  };

  // =====================================================================================================
  // tree_pine 台灣二葉松 — straight red-plated trunk, tiered cloud-pads of needles (niwaki-like silhouette)
  // =====================================================================================================
  defTree('tree_pine', {
    build(o, K) {
      const v = o.v || 0, r = RNG(400 + v * 131);
      const H = 5.4 * (1 + r.pm(0.06));
      const wind = { height: H, strength: 0.12, flex: 2.4 };
      const bmat = barkMat('tree_pine', BARKS2.pine, wind);
      const P = [
        { seed: 61, shape: 'needle', n: 110, L: 40, dark: '#173a2f', mid: '#255443', light: '#3f7b5b', hi: '#8cc094', massR: 0.5 },
        { seed: 62, shape: 'needle', n: 110, L: 40, dark: '#1c3c22', mid: '#2e5a32', light: '#4f8448', hi: '#9cc884', massR: 0.5 },
        { seed: 63, shape: 'needle', n: 110, L: 40, dark: '#163638', mid: '#24504e', light: '#3c766a', hi: '#84b8a6', massR: 0.5 },
      ][v];
      const lmat = leafMat('tree_pine' + v, leafAtlas('tree_pine' + v, P), Object.assign({}, wind, { flutter: 0.02, trans: 0.35 }));
      const bark = new Acc(), leaf = new Acc();
      const ao = barkAO([0.6, 0.55, 0.45], 0.6);
      const bend = V3(r.pm(0.3), 0, r.pm(0.3));
      const trunk = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; trunk.push(V3(bend.x * sin(t * PI * 0.9) * 0.8, -0.15 + t * (H - 0.4), bend.z * sin(t * PI * 0.9) * 0.8)); }
      tube(bark, trunk, taperR(trunk.length, 0.2, 0.04, 0.9), { seg: 9, ao, flute: { n: 4, amp: 0.3, h: 0.4 }, texW: 0.45, lump: 0.08 });
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + r.pm(0.5);
        const pts = limbPts(r, V3(cos(a) * 0.08, 0.15, sin(a) * 0.08), V3(cos(a), -0.6, sin(a)), 0.55, 4, { pull: V3(0, -1, 0), pullK: 0.1 });
        tube(bark, pts, taperR(pts.length, 0.09, 0.015), { seg: 5, ao });
      }
      const trunkAt = (y) => { const t = clamp((y + 0.15) / (H - 0.4), 0, 1); return V3(bend.x * sin(t * PI * 0.9) * 0.8, y, bend.z * sin(t * PI * 0.9) * 0.8); };
      // tiers of branches ending in cloud pads
      const tiers = 6;
      let az = r() * TAU;
      for (let i = 0; i < tiers; i++) {
        const f = i / (tiers - 1);
        const y = lerp(H * 0.42, H - 0.8, f) + r.pm(0.1);
        const nb = i < 2 ? 2 : 1;
        for (let b = 0; b < nb; b++) {
          az += 2.4 + r.pm(0.3);
          const L = lerp(1.6, 0.6, f) * (0.8 + r() * 0.35);
          const p0 = trunkAt(y);
          const d = V3(cos(az), 0.12 + r() * 0.15, sin(az));
          const pts = limbPts(r, p0, d, L, 5, { wiggle: 0.18, pull: V3(0, 1, 0), pullK: 0.05 });
          tube(bark, pts, taperR(pts.length, lerp(0.08, 0.04, f), 0.015), { seg: 5, ao, texW: 0.3 });
          // pad: flat wide clump over the branch tip (+ a smaller one mid-branch)
          const tip = pts[pts.length - 1];
          const padR = lerp(0.82, 0.48, f) * (0.85 + r() * 0.3);
          for (const [pp, k] of [[tip, 1]]) {
            const c = pp.clone().add(V3(0, 0.1, 0));
            const Rn = V3(padR * k * 1.2, padR * k * 0.4, padR * k * 1.2);
            clump(leaf, r, c, padR * k, { cards: 11, C: c.clone().add(V3(0, -0.25, 0)), Rn, sphere: 0.75, clumpN: 0.2, flat: 0.7, spread: 0.55, size: padR * k * 1.3 });
          }
        }
      }
      // crown tuft
      const topP = trunkAt(H - 0.45);
      clump(leaf, r, topP.clone().add(V3(0, 0.25, 0)), 0.55, { cards: 9, C: topP, Rn: V3(0.6, 0.45, 0.6), sphere: 0.7, flat: 0.3 });
      const g = K.group(meshOf(bark, bmat), meshOf(leaf, lmat));
      const out = K.merge(g);
      out.add(decal('tree_pine', { seed: 7, core: '#1a1408', litter: ['#8a5a32', '#6a4a2a', '#a0703a'], nLitter: 140, litterSize: 4 }, 1.7));
      return out;
    },
  });

  // =====================================================================================================
  // tree_dead — bare gnarled silver-grey tree (no foliage; a few strands of hanging old-man's-beard lichen)
  // =====================================================================================================
  defTree('tree_dead', {
    build(o, K) {
      const v = o.v || 0, r = RNG(500 + v * 77);
      const H = 3.6 * (1 + r.pm(0.1));
      const wind = { height: H, strength: 0.04, flex: 2 };
      const bmat = barkMat('tree_dead', BARKS2.dead, wind);
      const bark = new Acc(), tips = [];
      const ao = barkAO([0.55, 0.52, 0.5], 0.5);
      const lean = V3(r.pm(0.35), 1, r.pm(0.35)).normalize();
      // trunk with a twist; splits into 2–3 gnarled leaders
      const tpts = limbPts(r, V3(0, -0.15, 0), lean, H * 0.42, 6, { wiggle: 0.12 });
      tube(bark, tpts, taperR(tpts.length, 0.2, 0.13), { seg: 9, ao, flute: { n: 3, amp: 0.4, h: 0.6 }, lump: 0.25, lumpSeed: 9 + v, texW: 0.5 });
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + r.pm(0.6);
        const pts = limbPts(r, V3(cos(a) * 0.08, 0.15, sin(a) * 0.08), V3(cos(a), -0.5, sin(a)), 0.7, 4, { pull: V3(0, -1, 0), pullK: 0.12, wiggle: 0.2 });
        tube(bark, pts, taperR(pts.length, 0.1, 0.015), { seg: 5, ao });
      }
      const top = tpts[tpts.length - 1];
      const nL = 2 + (v % 2);
      for (let i = 0; i < nL; i++) {
        const a = i / nL * TAU + r.pm(0.5);
        const d = V3(cos(a) * 0.7, 1, sin(a) * 0.7).normalize();
        branchRec(bark, r, top, d, H * 0.38, 0.11, 0, {
          segLen: 0.22, wiggle: 0.28, taper: 0.6, depth: 3, spread: 0.75, lenK: 0.66, radK: 0.72, seg: 7, ao, up: 0.05, minR: 0.01,
          kids: (dpt) => (dpt < 1 ? 3 : 2),
        }, tips);
      }
      // a broken limb stub
      const sp = tpts[3];
      tube(bark, limbPts(r, sp, V3(r.pm(1), 0.3, r.pm(1)), 0.45, 3, {}), [0.08, 0.07, 0.06, 0.05], { seg: 6, ao, cap: true });
      const g = K.group(meshOf(bark, bmat));
      // hanging lichen strands (松蘿) on some tips — thin pale-green ribbons
      const lich = new Acc();
      for (const t of tips) if (r() < 0.35) for (let k = 0; k < 3; k++) {
        const L = 0.2 + r() * 0.35, p = t.p.clone().add(V3(r.pm(0.06), -0.02, r.pm(0.06))), a0 = r() * PI;
        const ex = cos(a0) * 0.012, ez = sin(a0) * 0.012;
        const a = lich.v(p.x - ex, p.y, p.z - ez, 0, 0, 1, 0, 1), b = lich.v(p.x + ex, p.y, p.z + ez, 0, 0, 1, 1, 1);
        const c2 = lich.v(p.x + r.pm(0.04), p.y - L, p.z + r.pm(0.04), 0, 0, 1, 0.5, 0);
        lich.tri(a, c2, b);
      }
      if (lich.i.length) g.add(meshOf(lich, cmat('lichen', () => Wind.windify(G.R3M.env({ color: 0xa8b890, side: T.DoubleSide, roughness: 1 }), { height: H, strength: 0.06, flutter: 0.05 }))));
      const out = K.merge(g);
      out.add(decal('tree_dead', { seed: 9, core: '#1c1a16', litter: ['#6c6870', '#8a8676', '#5a5040'], nLitter: 60, litterSize: 5 }, 1.2));
      return out;
    },
  });

  // =====================================================================================================
  // tree_cypress 紅檜 (2×2) — giant buttressed red trunk, layered sprays, a silver lightning snag above the crown
  // =====================================================================================================
  defTree('tree_cypress', {
    build(o, K) {
      const v = o.v || 0, r = RNG(600 + v * 59);
      const H = 9.0 * (1 + r.pm(0.05));
      const wind = { height: H, strength: 0.14, flex: 2.6 };
      const bmat = barkMat('tree_cypress', BARKS2.cypress, wind);
      const smat = barkMat('tree_cypress_snag', BARKS2.snag, wind);
      const P = [
        { seed: 71, shape: 'scale', n: 46, L: 46, W: 18, dark: '#173a32', mid: '#26584a', light: '#3d7c63', hi: '#86c09a', massR: 0.6 },
        { seed: 72, shape: 'scale', n: 46, L: 46, W: 18, dark: '#1a3a2a', mid: '#2a5a3e', light: '#447e52', hi: '#8cc08a', massR: 0.6 },
        { seed: 73, shape: 'scale', n: 46, L: 46, W: 18, dark: '#163634', mid: '#245452', light: '#3a7870', hi: '#7cb4a8', massR: 0.6 },
      ][v];
      const lmat = leafMat('tree_cypress' + v, leafAtlas('tree_cypress' + v, P), Object.assign({}, wind, { flutter: 0.025, trans: 0.4 }));
      const bark = new Acc(), snag = new Acc(), leaf = new Acc();
      const ao = barkAO([0.55, 0.5, 0.42], 1.4, { h: 2.2, k: 0.5, c: [0.55, 0.72, 0.4] });
      // massive fluted trunk
      const tpts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; tpts.push(V3(sin(t * 2.2 + v) * 0.12, -0.3 + t * (H - 1.2), cos(t * 1.7 + v) * 0.1)); }
      const rads = tpts.map((p, i) => { const t = i / 12; return lerp(0.62, 0.2, pow(t, 0.9)) + 0.35 * pow(1 - t, 6); });
      tube(bark, tpts, rads, { seg: 16, ao, flute: { n: 7, amp: 0.55, h: 2.4, ph: v }, lump: 0.1, texW: 0.55, texH: 1.6 });
      // buttress roots
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + v + r.pm(0.2);
        const p0 = V3(cos(a) * 0.5, 0.9, sin(a) * 0.5);
        const pts = limbPts(r, p0, V3(cos(a), -0.9, sin(a)), 1.5 + r() * 0.4, 5, { pull: V3(0, -1, 0), pullK: 0.08, wiggle: 0.12 });
        tube(bark, pts, taperR(pts.length, 0.3, 0.03, 0.8), { seg: 6, ao, texW: 0.4 });
      }
      const trunkAt = (y) => { const t = clamp((y + 0.3) / (H - 1.2), 0, 1); return V3(sin(t * 2.2 + v) * 0.12, y, cos(t * 1.7 + v) * 0.1); };
      // limbs: thick, near-horizontal, upturned ends carrying flat spray layers
      const nL = 17;
      let az = r() * TAU;
      for (let i = 0; i < nL; i++) {
        const f = i / (nL - 1);
        const y = lerp(H * 0.4, H - 1.1, f);
        az += 2.39 + r.pm(0.4);
        const L = lerp(3.0, 1.1, f) * (0.8 + r() * 0.4);
        const p0 = trunkAt(y);
        const pts = limbPts(r, p0, V3(cos(az), 0.25, sin(az)), L, 6, { wiggle: 0.2, pull: V3(0, 1, 0), pullK: 0.06 });
        tube(bark, pts, taperR(pts.length, lerp(0.17, 0.08, f), 0.02), { seg: 6, ao, texW: 0.35 });
        const tip = pts[pts.length - 1];
        const padR = lerp(1.25, 0.8, f) * (0.85 + r() * 0.3);
        for (const [pp, k] of [[tip, 1], [pts[3], 0.7]]) {
          const c = pp.clone().add(V3(0, 0.15, 0));
          clump(leaf, r, c, padR * k, { cards: k === 1 ? 14 : 8, C: c.clone().add(V3(0, -0.2, 0)), Rn: V3(padR * k * 1.15, padR * k * 0.5, padR * k * 1.15), sphere: 0.7, clumpN: 0.2, flat: 0.5, spread: 0.6, size: padR * k * 1.25 });
        }
      }
      // silver snag: the old lightning-struck leader, rising bare above the crown
      const sTop = trunkAt(H - 1.25);
      const tips = [];
      branchRec(snag, r, sTop, V3(r.pm(0.15), 1, r.pm(0.15)).normalize(), 1.9, 0.14, 0, { segLen: 0.3, wiggle: 0.14, taper: 0.5, depth: 2, spread: 0.9, lenK: 0.45, radK: 0.6, seg: 7, kids: () => 2, ao: () => 1 }, tips);
      // ferns at the foot (re-using the spray atlas as low fronds)
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU, d = 0.9 + r() * 0.5;
        const c = V3(cos(a) * d, 0.25, sin(a) * d);
        clump(leaf, r, c, 0.35, { cards: 4, C: c.clone().add(V3(0, -0.3, 0)), Rn: V3(0.4, 0.3, 0.4), flat: 0.4, sphere: 0.6, tint: [0.95, 1.1, 0.85] });
      }
      const g = K.group(meshOf(bark, bmat), meshOf(snag, smat), meshOf(leaf, lmat));
      const out = K.merge(g);
      out.add(decal('tree_cypress', { seed: 11, core: '#141a0c', litter: ['#5a3a20', '#7a5030', '#4a6a2a', '#3a5a2a'], nLitter: 220, litterSize: 5 }, 2.4));
      return out;
    },
  });

  // =====================================================================================================
  // tree_banyan 榕樹 (3×3) — fused, twisting trunks; vast low dome; curtains of aerial roots; prop-root pillars
  // footprint solid cells: centre + the whole south row (2D solidAt 000/010/111). The north row stays walkable.
  // =====================================================================================================
  defTree('tree_banyan', {
    build(o, K) {
      const v = o.v || 0, r = RNG(700 + v * 41);
      const H = 6.3 * (1 + r.pm(0.05));
      const wind = { height: H, strength: 0.1, flex: 2.4, radial: 0.04 };
      const bmat = barkMat('tree_banyan', BARKS2.banyan, wind);
      const P = [
        { seed: 81, shape: 'oval', n: 110, L: 24, W: 11, dark: '#1a4029', mid: '#2c6037', light: '#4d8c43', hi: '#9cc86a' },
        { seed: 82, shape: 'oval', n: 110, L: 24, W: 11, dark: '#1c4422', mid: '#306432', light: '#56903e', hi: '#a8cc6c' },
        { seed: 83, shape: 'oval', n: 110, L: 24, W: 11, dark: '#183c2e', mid: '#285a42', light: '#46845a', hi: '#90c08a' },
      ][v];
      const lmat = leafMat('tree_banyan' + v, leafAtlas('tree_banyan' + v, P), Object.assign({}, wind, { flutter: 0.03, trans: 0.5 }));
      const bark = new Acc(), leaf = new Acc();
      const ao = barkAO([0.55, 0.52, 0.42], 1.0, { h: 1.2, k: 0.35, c: [0.6, 0.72, 0.42] });
      // fused trunk: 5 strands twisting around each other
      const ns = 5, trunkTop = 2.6;
      const crown = [];
      for (let s = 0; s < ns; s++) {
        const a0 = s / ns * TAU, pts = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, a = a0 + t * 1.6, rad = lerp(0.42, 0.22, t);
          pts.push(V3(cos(a) * rad, -0.2 + t * (trunkTop + 0.2), sin(a) * rad - 0.05));
        }
        tube(bark, pts, taperR(pts.length, 0.34, 0.2, 0.7), { seg: 8, ao, lump: 0.15, lumpSeed: s, texW: 0.45 });
        crown.push(pts[pts.length - 1]);
      }
      // root flare
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU + r.pm(0.3);
        const pts = limbPts(r, V3(cos(a) * 0.45, 0.5, sin(a) * 0.45), V3(cos(a), -0.8, sin(a)), 1.2 + r() * 0.5, 5, { pull: V3(0, -1, 0), pullK: 0.1, wiggle: 0.18 });
        tube(bark, pts, taperR(pts.length, 0.22, 0.03), { seg: 6, ao });
      }
      // canopy dome
      const C = V3(0, H * 0.7, 0.1), R = V3(3.5, 1.35, 3.2);
      // big horizontal limbs spreading toward the dome rim
      const limbs = [];
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU + r.pm(0.3);
        const p0 = crown[i % ns];
        const tgt = V3(C.x + cos(a) * R.x * 0.85, C.y - 0.4 + r.pm(0.3), C.z + sin(a) * R.z * 0.85);
        const pts = limbPts(r, p0, tgt.clone().sub(p0), tgt.distanceTo(p0), 7, { wiggle: 0.15, pull: V3(0, 1, 0), pullK: 0.02 });
        limbs.push(pts);
        tube(bark, pts, taperR(pts.length, 0.22, 0.05, 0.8), { seg: 7, ao, texW: 0.4 });
      }
      // clusters
      const cps = canopyPoints(r, C, R, 38, { bottom: 0.45, inner: 0.55, minD: 0.85 });
      for (const c of cps) {
        let best = null, bd = 1e9;
        for (const L of limbs) for (let i = 2; i < L.length; i++) { const d = L[i].distanceTo(c); if (d < bd) { bd = d; best = L[i]; } }
        if (best && bd > 0.3) { const pts = limbPts(r, best, c.clone().sub(best), bd * 0.85, 3, { wiggle: 0.15 }); tube(bark, pts, taperR(pts.length, 0.05, 0.012), { seg: 4, ao }); }
        clump(leaf, r, c, 0.95 * (0.85 + r() * 0.3), { cards: 13, C, Rn: R, sphere: 0.55, clumpN: 0.5, outward: 0.45, up: 0.35, tint: r.pick([[1, 1, 1], [1, 1, 1], [1.05, 1.05, 0.9], [0.92, 0.98, 1.0]]) });
      }
      for (const c of canopyPoints(r, C, R.clone().multiplyScalar(0.6), 8, { bottom: 0.3, inner: 0, minD: 0.5 })) clump(leaf, r, c, 1.1, { cards: 5, C, Rn: R, sphere: 0.85 });
      // aerial roots: strands dropping from the limbs; some reach the soil and thicken into pillar roots
      const pillars = [V3(-1.0, 0, 1.05), V3(1.05, 0, 1.0), V3(0.05, 0, 1.25)];
      for (const pl of pillars) {
        let best = null, bd = 1e9;
        for (const L of limbs) for (let i = 2; i < L.length; i++) { const d = abs(L[i].x - pl.x) + abs(L[i].z - pl.z); if (d < bd) { bd = d; best = L[i]; } }
        const top = best.clone(); const pts = [];
        for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V3(lerp(top.x, pl.x, sstep(0, 0.6, t)) + sin(t * 9) * 0.04, lerp(top.y, -0.15, t), lerp(top.z, pl.z, sstep(0, 0.6, t)) + cos(t * 7) * 0.04)); }
        tube(bark, pts, pts.map((_, i) => lerp(0.07, 0.17, pow(i / 8, 2))), { seg: 7, ao, lump: 0.2 });
        // bundle of thin strands twisting around each pillar
        for (let k = 0; k < 3; k++) {
          const ph = k / 3 * TAU, sp = [];
          for (let i = 0; i <= 8; i++) { const t = i / 8; const p = pts[i]; sp.push(V3(p.x + cos(ph + t * 5) * 0.12, p.y, p.z + sin(ph + t * 5) * 0.12)); }
          tube(bark, sp, sp.map(() => 0.025), { seg: 4, ao });
        }
      }
      for (const L of limbs) for (let i = 2; i < L.length; i++) {
        if (r() < 0.55) continue;
        const p = L[i];
        const n = 2 + r.int(3);
        const reachAll = r() < 0.18;
        for (let k = 0; k < n; k++) {
          const q = p.clone().add(V3(r.pm(0.18), -0.05, r.pm(0.18)));
          const reach = reachAll && k < 2;
          const L2 = reach ? q.y + 0.1 : (q.y - 0.4) * (0.25 + r() * 0.55);
          const pts = [], sw = r.pm(0.12), ph = r() * 6;
          for (let s2 = 0; s2 <= 6; s2++) { const t = s2 / 6; pts.push(V3(q.x + sin(t * 3 + ph) * 0.04 + sw * t * t, q.y - L2 * t, q.z + cos(t * 2.5 + ph) * 0.04 + sw * 0.5 * t * t)); }
          tube(bark, pts, taperR(pts.length, reach ? 0.035 : 0.02, reach ? 0.045 : 0.004), { seg: reach ? 5 : 3, ao });
        }
      }
      const g = K.group(meshOf(bark, bmat), meshOf(leaf, lmat));
      const out = K.merge(g);
      out.add(decal('tree_banyan', { seed: 13, core: '#141a0c', litter: ['#6a6a2a', '#8a7a34', '#4a5a24', '#9a6a2a'], nLitter: 260, litterSize: 4 }, 3.4));
      return out;
    },
  });

  // =====================================================================================================
  // tree_cedar_snow 玉山圓柏 — wind-bent, twisted juniper; flattened layers swept leeward, capped with snow
  // =====================================================================================================
  defTree('tree_cedar_snow', {
    build(o, K) {
      const v = o.v || 0, r = RNG(800 + v * 23);
      const H = 3.4 * (1 + r.pm(0.08));
      const wind = { height: H, strength: 0.06, flex: 2 };
      const bmat = barkMat('tree_cedar_snow', BARKS2.juniper, wind);
      const P = [
        { seed: 91, shape: 'scale', n: 50, L: 40, W: 16, dark: '#1d3d3e', mid: '#2e5a55', light: '#4b7f73', hi: '#9ac4b0', massR: 0.62 },
        { seed: 92, shape: 'scale', n: 50, L: 40, W: 16, dark: '#22403a', mid: '#335e50', light: '#52826a', hi: '#a0c8a8', massR: 0.62 },
        { seed: 93, shape: 'scale', n: 50, L: 40, W: 16, dark: '#1c3844', mid: '#2c5460', light: '#4a7a84', hi: '#98c0c8', massR: 0.62 },
      ][v];
      const lmat = leafMat('tree_cedar_snow' + v, leafAtlas('tree_cedar_snow' + v, P), Object.assign({}, wind, { flutter: 0.012, trans: 0.3 }));
      const snowAtlas = leafAtlas('snow', { seed: 99, shape: 'oval', n: 40, L: 40, W: 22, R: 84, massR: 0.8, gloss: false, dark: '#b8c6dc', mid: '#dce6f4', light: '#f2f6ff', hi: '#ffffff' });
      const snowM = cmat('snow_cap', () => Wind.windify(G.R3M.env({ map: snowAtlas, alphaTest: 0.45, side: T.DoubleSide, roughness: 0.6, vertexColors: true }), Object.assign({}, wind, { var: [0.02, 0.02, 0.02] })));
      const bark = new Acc(), leaf = new Acc(), snow = new Acc();
      const ao = barkAO([0.7, 0.7, 0.72], 0.4);
      const lee = V3(1, 0, 0.25).normalize(); // prevailing wind bends the tree east
      // twisted, bent trunk
      const tpts = [];
      for (let i = 0; i <= 9; i++) { const t = i / 9; tpts.push(V3(lee.x * pow(t, 1.6) * H * 0.4 + sin(t * 5) * 0.06, -0.15 + t * H * 0.78, lee.z * pow(t, 1.6) * H * 0.4 + cos(t * 4) * 0.05)); }
      tube(bark, tpts, taperR(tpts.length, 0.2, 0.06, 0.8), { seg: 9, ao, lump: 0.3, lumpSeed: 4 + v, flute: { n: 3, amp: 0.4, h: 0.8 }, texW: 0.35 });
      // a bleached dead limb pointing upwind
      branchRec(bark, r, tpts[4], V3(-1, 0.6, -0.2).normalize(), 0.9, 0.06, 0, { segLen: 0.18, wiggle: 0.3, depth: 1, spread: 0.7, lenK: 0.6, radK: 0.6, seg: 5, kids: () => 2, ao }, []);
      // layered pads: flattened, elongated leeward
      const layers = 5;
      for (let i = 0; i < layers; i++) {
        const f = i / (layers - 1);
        const base = tpts[clamp(Math.round(lerp(3, 9, f)), 0, 9)];
        const L = lerp(1.1, 0.5, f);
        const c = base.clone().add(lee.clone().multiplyScalar(L * 0.5)).add(V3(r.pm(0.15), 0.1, r.pm(0.15)));
        const pts = limbPts(r, base, lee.clone().add(V3(r.pm(0.4), 0.15, r.pm(0.4))), L, 3, { wiggle: 0.2 });
        tube(bark, pts, taperR(pts.length, 0.05, 0.015), { seg: 4, ao });
        const Rn = V3(L * 0.95, 0.32, L * 0.7);
        clump(leaf, r, c, L * 0.65, { cards: 12, C: c.clone().add(V3(0, -0.1, 0)), Rn, sphere: 0.7, clumpN: 0.15, flat: 0.6, spread: 0.8, size: L * 0.9 });
        // snow: flat clumps of painted snow cards resting on the pad's upper surface
        clump(snow, r, c.clone().add(V3(-L * 0.08, Rn.y * 0.55, 0)), L * 0.5, { cards: 7, C: c.clone().add(V3(0, -0.3, 0)), Rn, sphere: 0.85, clumpN: 0.1, flat: 0.92, spread: 0.7, size: L * 0.75, tint: [0.96, 0.98, 1.04] });
      }
      const g = K.group(meshOf(bark, bmat), meshOf(leaf, lmat), meshOf(snow, snowM));
      const out = K.merge(g);
      out.add(decal('tree_cedar_snow', { seed: 15, core: '#eef3fb' }, 1.6));
      return out;
    },
  });

  // =====================================================================================================
  // RIBBONS (fronds, blades, big leaves) + their painted textures
  // =====================================================================================================
  // Strip along pts with half-widths `w[i]`; a V-fold lifts the edges (o.fold, relative to width). The strip's
  // side vector is perpendicular to the tangent and to `o.up` (default world up). uv: u 0..1 across, v along [v0,v1];
  // u range [u0,u1] selects an atlas column. o.ao(p, t) → vertex colour.
  function ribbon(acc, pts, w, o = {}) {
    const n = pts.length, up = o.up || V3(0, 1, 0);
    const u0 = o.u0 || 0, u1 = o.u1 != null ? o.u1 : 1, v0 = o.v0 || 0, v1 = o.v1 != null ? o.v1 : 1;
    const base = acc.count;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const tg = pts[min(n - 1, i + 1)].clone().sub(pts[max(0, i - 1)]).normalize();
      let sd = tg.clone().cross(up);
      if (sd.lengthSq() < 1e-6) sd = V3(1, 0, 0);
      sd.normalize();
      if (o.twist) sd.applyAxisAngle(tg, o.twist * t);
      const nm = sd.clone().cross(tg).normalize(); // plane normal (faces up-ish)
      if (nm.y < 0 && !o.keepSide) nm.negate();
      const fold = (o.fold || 0) * w[i];
      const c = o.ao ? o.ao(pts[i], t) : [1, 1, 1];
      const cc = typeof c === 'number' ? [c, c, c] : c;
      const p = pts[i], v = lerp(v0, v1, t);
      const L = p.clone().addScaledVector(sd, -w[i]).addScaledVector(nm, fold);
      const R = p.clone().addScaledVector(sd, w[i]).addScaledVector(nm, fold);
      const nL = nm.clone().addScaledVector(sd, -0.35 * Math.sign(fold || 0)).normalize(), nR = nm.clone().addScaledVector(sd, 0.35 * Math.sign(fold || 0)).normalize();
      acc.v(L.x, L.y, L.z, nL.x, nL.y, nL.z, u0, v, cc[0], cc[1], cc[2]);
      acc.v(p.x, p.y, p.z, nm.x, nm.y, nm.z, (u0 + u1) / 2, v, cc[0], cc[1], cc[2]);
      acc.v(R.x, R.y, R.z, nR.x, nR.y, nR.z, u1, v, cc[0], cc[1], cc[2]);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 3, b = a + 3;
      acc.quad(a, b, b + 1, a + 1); acc.quad(a + 1, b + 1, b + 2, a + 2);
    }
  }
  // Arching frond/leaf spine: from p0 heading `dir` (unit), length L; gravity bends it down progressively.
  function archPts(p0, dir, L, n, droop, o = {}) {
    const pts = [p0.clone()];
    const d = dir.clone().normalize();
    let p = p0.clone();
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      d.y -= droop * (o.lin ? 1 : t) * 2 / n; d.normalize();
      p = p.clone().addScaledVector(d, L / (n - 1));
      pts.push(p);
    }
    return pts;
  }

  // pinnate fronds: atlas of `cols` vertical fronds (each column = one frond, base at v=0, tip at v=1)
  // P: { cols, leaflet (len px), dark, mid, light, hi, rachis, seed, bipinnate, droopy }
  function frondTex(key, P) {
    return tex('frond_' + key, 512, 512, (g, w, h) => {
      const r = RNG(P.seed || 3);
      const cols = P.cols || 4, cw = w / cols;
      for (let c = 0; c < cols; c++) {
        const cx = c * cw + cw / 2;
        g.save(); g.beginPath(); g.rect(c * cw, 0, cw, h); g.clip();
        // canvas y=0 is the texture's top (v=1 → tip)
        const n = P.n || 34;
        for (let side of [-1, 1]) for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n; // 0 base → 1 tip
          const y = h * (1 - t) - 4;
          const env = sin(clamp(t * 1.15, 0, 1) * PI) * 0.85 + 0.15;
          const len = (cw / 2 - 3) * env * (0.85 + r() * 0.15) * (P.lenK || 1);
          const ang = (P.angle || 0.55) + r.pm(0.08);
          const ex = cx + side * len * cos(ang * 0.4), ey = y - len * sin(ang) * 0.9;
          const lw = (P.leafW || 5) * (0.6 + env * 0.5);
          const col = r() < 0.3 ? P.light : r() < 0.6 ? P.mid : P.dark;
          if (P.bipinnate) {
            // fern pinna: a small comb of pinnules
            g.strokeStyle = P.rachis; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx, y); g.lineTo(ex, ey); g.stroke();
            const k = 7;
            for (let j = 1; j <= k; j++) {
              const f = j / (k + 1), px = cx + (ex - cx) * f, py = y + (ey - y) * f, pl = lw * 1.4 * (1 - f * 0.6);
              g.fillStyle = col;
              for (const s2 of [-1, 1]) { g.beginPath(); g.ellipse(px + s2 * 0.5, py + s2 * pl * 0.55 - pl * 0.3, pl * 0.32, pl * 0.75, side * 0.9 + s2 * 0.3, 0, TAU); g.fill(); }
            }
            continue;
          }
          const grd = g.createLinearGradient(cx, y, ex, ey);
          grd.addColorStop(0, P.dark); grd.addColorStop(0.5, col); grd.addColorStop(1, P.light);
          g.fillStyle = grd; g.beginPath();
          g.moveTo(cx, y + lw * 0.3);
          g.quadraticCurveTo((cx + ex) / 2, (y + ey) / 2 + lw * (P.droopy ? 1.6 : 0.7), ex, ey + (P.droopy ? lw * 1.5 : 0));
          g.quadraticCurveTo((cx + ex) / 2, (y + ey) / 2 - lw * 0.6, cx, y - lw * 0.5);
          g.fill();
          g.strokeStyle = rgba(P.hi, 0.45); g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo((cx + ex) / 2, (y + ey) / 2 + lw * 0.1, ex, ey); g.stroke();
        }
        // rachis
        g.strokeStyle = P.rachis; g.lineWidth = 4; g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, 6); g.stroke();
        g.strokeStyle = rgba(P.hi, 0.5); g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx - 1, h); g.lineTo(cx - 1, 10); g.stroke();
        g.restore();
      }
    });
  }
  // broad blades (banana / pandanus / lily leaves): atlas of `cols` vertical blades
  // P: { cols, shape: 'banana'|'strap'|'grass', dark, mid, light, hi, rib, tear, serr, seed }
  function bladeTex(key, P) {
    return tex('blade_' + key, 512, 512, (g, w, h) => {
      const r = RNG(P.seed || 5);
      const cols = P.cols || 2, cw = w / cols;
      for (let c = 0; c < cols; c++) {
        const cx = c * cw + cw / 2, hw = cw / 2 - 2;
        g.save(); g.beginPath(); g.rect(c * cw, 0, cw, h); g.clip();
        const widthAt = (t) => P.shape === 'banana' ? hw * (0.15 + 0.85 * pow(sin(clamp(t * 1.05, 0, 1) * PI), 0.45)) * (t > 0.92 ? (1 - t) / 0.08 : 1)
          : P.shape === 'strap' ? hw * (0.75 - 0.6 * pow(t, 2)) : hw * (1 - t) * 0.9;
        const path = new Path2D();
        path.moveTo(cx, h);
        for (let i = 0; i <= 64; i++) { const t = i / 64; path.lineTo(cx - widthAt(t), h * (1 - t)); }
        for (let i = 64; i >= 0; i--) { const t = i / 64; path.lineTo(cx + widthAt(t), h * (1 - t)); }
        path.closePath();
        const grd = g.createLinearGradient(cx - hw, 0, cx + hw, 0);
        grd.addColorStop(0, P.light); grd.addColorStop(0.45, P.mid); grd.addColorStop(0.55, P.mid); grd.addColorStop(1, P.dark);
        g.fillStyle = grd; g.fill(path);
        g.save(); g.clip(path);
        // length-wise tone (paler base, darker tip) + veins
        const vg = g.createLinearGradient(0, h, 0, 0);
        vg.addColorStop(0, rgba(P.hi, 0.25)); vg.addColorStop(0.6, rgba(P.mid, 0)); vg.addColorStop(1, rgba(P.dark, 0.3));
        g.fillStyle = vg; g.fillRect(c * cw, 0, cw, h);
        if (P.shape === 'banana') {
          g.strokeStyle = rgba(P.dark, 0.35); g.lineWidth = 1;
          for (let y = h; y > 0; y -= 7) { g.beginPath(); g.moveTo(cx, y); g.lineTo(cx - hw, y - hw * 0.5); g.moveTo(cx, y); g.lineTo(cx + hw, y - hw * 0.5); g.stroke(); }
          // brown dried edges
          g.strokeStyle = rgba('#8a7a3a', 0.6); g.lineWidth = 3; g.stroke(path);
        } else {
          g.strokeStyle = rgba(P.hi, 0.25); g.lineWidth = 1;
          for (const k of [-0.5, 0.5]) { g.beginPath(); g.moveTo(cx + k * hw * 0.6, h); g.lineTo(cx + k * hw * 0.1, 0); g.stroke(); }
        }
        g.restore();
        // midrib
        g.strokeStyle = P.rib || P.light; g.lineWidth = P.shape === 'banana' ? 6 : 2.5; g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, 8); g.stroke();
        // tears (banana): cut slits from the edge toward the midrib
        if (P.tear) {
          g.globalCompositeOperation = 'destination-out';
          for (let i = 0; i < P.tear; i++) {
            const t = 0.15 + r() * 0.75, y = h * (1 - t), side = r() < 0.5 ? -1 : 1, depth = widthAt(t) * (0.5 + r() * 0.45);
            g.lineWidth = 2 + r() * 2; g.beginPath(); g.moveTo(cx + side * (widthAt(t) + 4), y + 5); g.lineTo(cx + side * (widthAt(t) - depth), y - depth * 0.45); g.stroke();
          }
          g.globalCompositeOperation = 'source-over';
        }
        // serration (pandanus): tiny spines along the edges
        if (P.serr) {
          g.fillStyle = P.serr;
          for (let i = 2; i < 60; i++) { const t = i / 64, y = h * (1 - t), wd = widthAt(t); for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * wd, y); g.lineTo(cx + s * (wd + 4), y - 5); g.lineTo(cx + s * (wd - 1), y - 4); g.fill(); } }
        }
        g.restore();
      }
    });
  }
  const frondMat = (key, texture, wind, o = {}) => leafMat(key, texture, Object.assign({ trans: 0.55, flutter: 0.04 }, wind), o);
  // colour-only (untextured, vertex-coloured) wind material for stems / small parts
  const plainMat = (key, color, wind, params = {}) => cmat('plain_' + key, () => {
    const m = G.R3M.env(Object.assign({ color: new T.Color(color), vertexColors: true, roughness: 0.75 }, params));
    if (wind) Wind.windify(m, Object.assign({ var: [0.05, 0.05, 0.04] }, wind));
    return m;
  });
  // vertex-coloured sphere/ellipsoid into an Acc (fruits, buds, nuts)
  function blob(acc, c, rx, ry, rz, col, o = {}) {
    const sg = new T.SphereGeometry(1, o.ws || 8, o.hs || 6);
    const P = sg.attributes.position, N = sg.attributes.normal, b = acc.count;
    for (let k = 0; k < P.count; k++) {
      const ny = N.getY(k);
      const sh = o.shade ? lerp(0.65, 1.05, ny * 0.5 + 0.5) : 1;
      acc.v(c.x + P.getX(k) * rx, c.y + P.getY(k) * ry, c.z + P.getZ(k) * rz, N.getX(k), ny, N.getZ(k), sg.attributes.uv.getX(k), sg.attributes.uv.getY(k), col[0] * sh, col[1] * sh, col[2] * sh);
    }
    const ix = sg.index.array;
    for (let k = 0; k < ix.length; k += 3) acc.tri(b + ix[k], b + ix[k + 1], b + ix[k + 2]);
  }
  const col3 = (c) => { const k = new T.Color(c); return [k.r, k.g, k.b]; }; // linear (vertex colours are linear)

  const BARKS3 = {
    palm: { seed: 41, style: 'rings', dark: '#6a6050', mid: '#8a7e68', light: '#aa9e84', hi: '#cfc4a6', line: '#3a3226' },
    betel: { seed: 43, style: 'rings', dark: '#7a7a6c', mid: '#9a9a8a', light: '#b8b8a6', hi: '#dcdccc', line: '#4a4a3e' },
    fern: { seed: 45, style: 'fern', dark: '#3a2a1c', mid: '#55402a', light: '#7a5e3c', hi: '#a68a60', line: '#1e140c' },
    banana: { seed: 47, style: 'fibre', dark: '#5a6a2a', mid: '#7a8a3a', light: '#9cac52', hi: '#c4cc7a', line: '#4a3a1a', vfreq: 1 },
    pandanus: { seed: 49, style: 'rings', dark: '#5a4a3a', mid: '#7a6450', light: '#9a8268', hi: '#c0a888', line: '#2e241a' },
  };

  // =====================================================================================================
  // PALMS & CO.
  // =====================================================================================================
  // generic crown of pinnate fronds at `top`
  function frondCrown(acc, r, top, n, L, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r.pm(0.25);
      const lift = o.lift != null ? o.lift : 0.5;
      const el = lerp(lift + 0.5, lift - 0.3, (i % 3) / 2) + r.pm(0.15); // some fronds up, some flat, some drooping
      const dir = V3(cos(a), el, sin(a)).normalize();
      const len = L * (0.85 + r() * 0.3);
      const pts = archPts(top, dir, len, 9, o.droop != null ? o.droop : 1.1);
      const ws = pts.map((_, k) => { const t = k / 8; return (o.W || 0.4) * (t < 0.08 ? 0.3 : 1) * (1 - t * 0.35); });
      const col = r.int(o.cols || 4), cw = 1 / (o.cols || 4);
      ribbon(acc, pts, ws, { fold: o.fold != null ? o.fold : 0.45, u0: col * cw, u1: (col + 1) * cw, twist: r.pm(0.5), ao: (p, t) => lerp(0.7, 1.05, t) });
    }
  }

  defTree('tree_betel', {
    build(o, K) {
      const v = o.v || 0, r = RNG(900 + v * 17);
      const H = 6.0 * (1 + r.pm(0.06));
      const wind = { height: H, strength: 0.28, flex: 2.2, radial: 0.08 };
      const bmat = barkMat('tree_betel', BARKS3.betel, wind);
      const fmat = frondMat('tree_betel', frondTex('betel', { seed: 7, cols: 4, n: 30, leafW: 6, angle: 0.75, dark: '#2a5a1e', mid: '#4a8a2a', light: '#7ab83c', hi: '#c8e88a', rachis: '#8aa040', droopy: true }), Object.assign({}, wind, { flutter: 0.05 }));
      const misc = plainMat('betel_misc' + v, 0xffffff, wind);
      const bark = new Acc(), fr = new Acc(), mc = new Acc();
      const bend = V3(r.pm(0.5), 0, r.pm(0.5));
      const tp = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; tp.push(V3(bend.x * t * t, -0.1 + t * (H - 1.1), bend.z * t * t)); }
      tube(bark, tp, taperR(tp.length, 0.11, 0.085), { seg: 8, ao: barkAO([0.6, 0.58, 0.5], 0.5), texW: 0.5, texH: 0.9 });
      // smooth green crownshaft
      const top = tp[tp.length - 1];
      const cs = [top, top.clone().add(V3(0, 0.5, 0)), top.clone().add(V3(0, 0.95, 0))];
      tube(mc, cs, [0.1, 0.11, 0.08], { seg: 8, ao: (p, t) => col3('#6a9a3a').map((x) => x * lerp(0.8, 1.1, t)) });
      // nut clusters (green → orange)
      const nutC = [col3('#5a8a2a'), col3('#c87a1a'), col3('#7a9a2a')][v];
      for (let k = 0; k < 2; k++) {
        const a = r() * TAU, c = top.clone().add(V3(cos(a) * 0.14, 0.05, sin(a) * 0.14));
        for (let j = 0; j < 14; j++) blob(mc, c.clone().add(V3(r.pm(0.1), -r() * 0.25, r.pm(0.1))), 0.035, 0.045, 0.035, nutC, { ws: 6, hs: 4, shade: true });
      }
      frondCrown(fr, r, cs[2], 11, 2.1, { W: 0.4, droop: 1.1, lift: 0.5 });
      const g = K.group(meshOf(bark, bmat), meshOf(mc, misc), meshOf(fr, fmat));
      const out = K.merge(g);
      out.add(decal('tree_betel', { seed: 17, core: '#1a1a10' }, 0.9));
      return out;
    },
  });

  defTree('coconut_palm', {
    build(o, K) {
      const v = o.v || 0, r = RNG(950 + v * 29);
      const H = 5.6 * (1 + r.pm(0.06));
      const wind = { height: H, strength: 0.26, flex: 2.2, radial: 0.07 };
      const bmat = barkMat('coconut_palm', BARKS3.palm, wind);
      const fmat = frondMat('coconut_palm', frondTex('coconut', { seed: 9, cols: 4, n: 36, leafW: 5, angle: 0.4, lenK: 1, dark: '#3a6a22', mid: '#5a9230', light: '#8ab846', hi: '#d4ea94', rachis: '#b0a050', droopy: true }), Object.assign({}, wind, { flutter: 0.05 }));
      const misc = plainMat('coco_misc', 0xffffff, wind, { roughness: 0.6 });
      const bark = new Acc(), fr = new Acc(), mc = new Acc();
      // the classic seaward lean with an upward recurve
      const a0 = [0.6, -2.2, 2.6][v] + r.pm(0.3), lean = V3(cos(a0), 0, sin(a0));
      const tp = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; const off = (sin(t * PI * 0.85) * 0.9 + t * 0.6) * 1.0; tp.push(V3(lean.x * off, -0.15 + t * (H - 0.9), lean.z * off)); }
      tube(bark, tp, tp.map((_, i) => { const t = i / 12; return 0.17 - t * 0.05 + 0.1 * pow(1 - t, 8); }), { seg: 10, ao: barkAO([0.6, 0.55, 0.45], 0.5), texW: 0.5, texH: 0.7 });
      const top = tp[tp.length - 1];
      // leaf-base boots + coconuts
      blob(mc, top.clone().add(V3(0, 0.05, 0)), 0.2, 0.22, 0.2, col3('#7a6a40'), { shade: true });
      const cc = [col3('#5a7a22'), col3('#8a6a2a'), col3('#6a8a2a')][v];
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + r.pm(0.3); blob(mc, top.clone().add(V3(cos(a) * 0.2, -0.12 - r() * 0.12, sin(a) * 0.2)), 0.12, 0.13, 0.12, cc, { ws: 8, hs: 6, shade: true }); }
      frondCrown(fr, r, top.clone().add(V3(0, 0.15, 0)), 14, 2.7, { W: 0.5, droop: 1.6, lift: 0.4, fold: 0.5 });
      // a couple of dead hanging fronds
      for (let k = 0; k < 2; k++) {
        const a = r() * TAU, pts = archPts(top, V3(cos(a), -0.6, sin(a)), 1.6, 6, 0.6);
        ribbon(fr, pts, pts.map(() => 0.2), { fold: 0.8, u0: 0, u1: 0.25, ao: () => [1.1, 0.75, 0.4] });
      }
      const g = K.group(meshOf(bark, bmat), meshOf(mc, misc), meshOf(fr, fmat));
      const out = K.merge(g);
      out.add(decal('coconut_palm', { seed: 19, core: '#2a2414' }, 1.3));
      return out;
    },
  });

  defTree('tree_banana', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1000 + v * 31);
      const H = 3.0 * (1 + r.pm(0.08));
      const wind = { height: H, strength: 0.18, flex: 1.8, radial: 0.12 };
      const smat = barkMat('tree_banana', BARKS3.banana, wind);
      const lmat = frondMat('tree_banana', bladeTex('banana', { seed: 11, cols: 2, shape: 'banana', tear: 16, dark: '#2e6a1e', mid: '#4a9a2a', light: '#7ac442', hi: '#c8ec8a', rib: '#c8d888' }), Object.assign({}, wind, { flutter: 0.06, trans: 0.7 }));
      const misc = plainMat('banana_misc', 0xffffff, wind, { roughness: 0.55 });
      const st = new Acc(), lf = new Acc(), mc = new Acc();
      const stems = 2 + (v === 1 ? 1 : 0);
      for (let s = 0; s < stems; s++) {
        const a = s / stems * TAU + r.pm(0.4), d = s === 0 ? 0 : 0.35;
        const base = V3(cos(a) * d, -0.1, sin(a) * d);
        const h = (s === 0 ? H * 0.62 : H * 0.42) * (0.9 + r() * 0.2);
        const pts = limbPts(r, base, V3(cos(a) * 0.08, 1, sin(a) * 0.08), h, 5, { wiggle: 0.03 });
        tube(st, pts, taperR(pts.length, s === 0 ? 0.13 : 0.09, s === 0 ? 0.08 : 0.06), { seg: 9, ao: barkAO([0.6, 0.55, 0.45], 0.4), texW: 0.4 });
        const top = pts[pts.length - 1];
        const nl = s === 0 ? 7 : 5;
        for (let i = 0; i < nl; i++) {
          const az = i / nl * TAU + r.pm(0.3);
          const el = i === 0 ? 1.6 : lerp(0.9, -0.1, r());
          const L = (s === 0 ? 1.9 : 1.4) * (0.8 + r() * 0.3);
          const ls = archPts(top, V3(cos(az), el, sin(az)), L, 8, 1.1);
          // petiole first ~25%, then the blade
          const ws = ls.map((_, k) => (k < 2 ? 0.05 : 0.32 * (s === 0 ? 1 : 0.8)));
          ribbon(lf, ls, ws, { fold: 0.25, u0: (i % 2) * 0.5, u1: (i % 2) * 0.5 + 0.5, twist: r.pm(0.6), ao: (p, t) => lerp(0.75, 1.05, t) });
        }
        // inflorescence on the main stem: hanging stalk, a hand of green bananas, purple bud
        if (s === 0 && v !== 2) {
          const hp = archPts(top, V3(0.5, 0.2, 0.3), 0.9, 6, 2.2, { lin: true });
          tube(mc, hp, taperR(hp.length, 0.03, 0.025), { seg: 5, ao: () => col3('#6a8a3a') });
          const end = hp[hp.length - 1];
          blob(mc, end.clone().add(V3(0, -0.12, 0)), 0.08, 0.17, 0.08, col3('#6a2050'), { shade: true });
          for (let k = 0; k < 14; k++) {
            const t = 0.25 + (k / 14) * 0.5, p = hp[Math.round(t * (hp.length - 1))], a = k * 2.4;
            blob(mc, p.clone().add(V3(cos(a) * 0.08, 0.04, sin(a) * 0.08)), 0.025, 0.09, 0.025, col3('#8ab83a'), { ws: 5, hs: 4, shade: true });
          }
        }
      }
      const g = K.group(meshOf(st, smat), meshOf(lf, lmat));
      if (mc.i.length) g.add(meshOf(mc, misc));
      const out = K.merge(g);
      out.add(decal('tree_banana', { seed: 21, core: '#1a1c0e', litter: ['#8a7a3a', '#6a6a2a'], nLitter: 40, litterSize: 8 }, 1.2));
      return out;
    },
  });

  defTree('tree_fern', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1100 + v * 37);
      const H = 3.4 * (1 + r.pm(0.08));
      const wind = { height: H, strength: 0.14, flex: 2, radial: 0.1 };
      const bmat = barkMat('tree_fern', BARKS3.fern, wind);
      const fmat = frondMat('tree_fern', frondTex('treefern', { seed: 13, cols: 4, n: 26, leafW: 7, angle: 0.25, bipinnate: true, dark: '#2a5a22', mid: '#3e7e2e', light: '#62a640', hi: '#b8e07a', rachis: '#7a6a3a' }), Object.assign({}, wind, { flutter: 0.04, trans: 0.65 }));
      const misc = plainMat('fern_misc', 0xffffff, wind);
      const bark = new Acc(), fr = new Acc(), mc = new Acc();
      const lean = V3(r.pm(0.3), 0, r.pm(0.3));
      const tp = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; tp.push(V3(lean.x * t * t + sin(t * 4) * 0.04, -0.1 + t * (H - 0.6), lean.z * t * t)); }
      tube(bark, tp, tp.map((_, i) => 0.13 + 0.07 * pow(1 - i / 8, 3) + (i === 8 ? 0.03 : 0)), { seg: 9, ao: barkAO([0.6, 0.55, 0.45], 0.5), texW: 0.4, texH: 0.8, lump: 0.1 });
      const top = tp[tp.length - 1];
      // skirt of old brown fronds hanging under the crown
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU + r.pm(0.3), pts = archPts(top.clone().add(V3(0, -0.05, 0)), V3(cos(a) * 0.4, -1, sin(a) * 0.4), 0.9, 5, 0.2);
        ribbon(fr, pts, pts.map((_, k) => 0.15 * (1 - k / 6)), { fold: 0.6, u0: 0.25 * (i % 4), u1: 0.25 * (i % 4) + 0.25, ao: () => [0.9, 0.6, 0.3] });
      }
      // crown of great arching fronds (筆筒樹 fronds can reach 2–3 m)
      frondCrown(fr, r, top.clone().add(V3(0, 0.08, 0)), 12, 2.3, { W: 0.5, droop: 1.4, lift: 0.7, fold: 0.15 });
      // fiddleheads: coiled croziers rising in the centre
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * TAU + 0.3, pts = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14;
          if (t < 0.55) pts.push(top.clone().add(V3(cos(a) * t * 0.25, t * 0.55, sin(a) * t * 0.25)));
          else { const u = (t - 0.55) / 0.45, ang = u * PI * 1.6, rr = 0.07 * (1 - u * 0.6); const c0 = top.clone().add(V3(cos(a) * 0.15, 0.3, sin(a) * 0.15)); pts.push(c0.add(V3(cos(a) * sin(ang) * rr, cos(ang) * rr, sin(a) * sin(ang) * rr))); }
        }
        tube(mc, pts, taperR(pts.length, 0.025, 0.012), { seg: 5, ao: () => col3('#b0a060') });
      }
      const g = K.group(meshOf(bark, bmat), meshOf(fr, fmat), meshOf(mc, misc));
      const out = K.merge(g);
      out.add(decal('tree_fern', { seed: 23, core: '#141a0c' }, 1.2));
      return out;
    },
  });

  // 林投 Pandanus — stilt-rooted, forking trunk; spiral tufts of long serrated straps; orange pineapple-like fruit.
  defTree('pandanus', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1200 + v * 43);
      const H = 2.8 * (1 + r.pm(0.08));
      const wind = { height: H, strength: 0.14, flex: 1.8, radial: 0.1 };
      const bmat = barkMat('pandanus', BARKS3.pandanus, wind);
      const lmat = frondMat('pandanus', bladeTex('pandanus', { seed: 15, cols: 4, shape: 'strap', dark: '#2e5a3a', mid: '#4a7e4a', light: '#78a65a', hi: '#c0d890', serr: '#c8c070' }), Object.assign({}, wind, { flutter: 0.04, trans: 0.4 }));
      const misc = plainMat('pandanus_misc', 0xffffff, wind, { roughness: 0.55 });
      const bark = new Acc(), lf = new Acc(), mc = new Acc();
      const ao = barkAO([0.6, 0.55, 0.45], 0.4);
      const t0 = V3(r.pm(0.1), 0.7, r.pm(0.1));
      tube(bark, limbPts(r, V3(0, 0.25, 0), V3(0, 1, 0), 0.5, 2, {}), [0.12, 0.12, 0.11], { seg: 8, ao });
      // stilt roots fanning from the lower trunk
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + r.pm(0.3), p0 = V3(cos(a) * 0.05, 0.55 + r() * 0.35, sin(a) * 0.05);
        const pts = []; const e = V3(cos(a) * (0.45 + r() * 0.2), -0.1, sin(a) * (0.45 + r() * 0.2));
        for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(V3(lerp(p0.x, e.x, t), lerp(p0.y, e.y, pow(t, 0.8)) + sin(t * PI) * 0.08, lerp(p0.z, e.z, t))); }
        tube(bark, pts, taperR(pts.length, 0.045, 0.035), { seg: 5, ao, texW: 0.2 });
      }
      // forking branches → tufts
      const tips = [];
      const nB = 2 + (v % 2);
      for (let b = 0; b < nB; b++) {
        const a = b / nB * TAU + r.pm(0.4);
        const pts = limbPts(r, t0, V3(cos(a) * 0.7, 1, sin(a) * 0.7), H * 0.55, 5, { wiggle: 0.15, pull: V3(0, 1, 0), pullK: 0.05 });
        tube(bark, pts, taperR(pts.length, 0.09, 0.05), { seg: 7, ao, texW: 0.3 });
        tips.push(pts[pts.length - 1]);
        if (b === 0) { const p2 = pts[2], q = limbPts(r, p2, V3(-cos(a), 0.9, -sin(a)), H * 0.3, 3, { wiggle: 0.15 }); tube(bark, q, taperR(q.length, 0.05, 0.035), { seg: 6, ao }); tips.push(q[q.length - 1]); }
      }
      for (const tp of tips) {
        // spiral rosette of long, keeled, drooping straps
        const n = 20;
        for (let i = 0; i < n; i++) {
          const a = i * 2.4, el = lerp(1.5, -0.2, (i % 5) / 4) + r.pm(0.2);
          const L = 1.1 + r() * 0.35;
          const pts = archPts(tp, V3(cos(a), el, sin(a)), L, 7, 1.0 + r() * 0.5);
          ribbon(lf, pts, pts.map((_, k) => 0.075 * (1 - k / 9)), { fold: 0.6, u0: (i % 4) * 0.25, u1: (i % 4) * 0.25 + 0.25, twist: r.pm(0.6), ao: (p, t) => lerp(0.7, 1.05, t) });
        }
      }
      // fruit: an orange, segmented syncarp hanging under one tuft
      if (v !== 1) {
        const f = tips[0].clone().add(V3(0.08, -0.32, 0.05));
        tube(mc, [tips[0], f.clone().add(V3(0, 0.15, 0))], [0.02, 0.02], { seg: 4, ao: () => col3('#6a6a3a') });
        const cA = col3(v === 0 ? '#e0701a' : '#c8a02a'), cB = col3(v === 0 ? '#f0a030' : '#a8b03a');
        for (let k = 0; k < 40; k++) {
          const u = k / 40, a = k * 2.399, y = lerp(0.14, -0.14, u), rr = sqrt(max(0, 1 - pow(y / 0.17, 2))) * 0.13;
          blob(mc, f.clone().add(V3(cos(a) * rr, y, sin(a) * rr)), 0.035, 0.035, 0.035, k % 3 ? cA : cB, { ws: 5, hs: 4, shade: true });
        }
      }
      const g = K.group(meshOf(bark, bmat), meshOf(lf, lmat));
      if (mc.i.length) g.add(meshOf(mc, misc));
      const out = K.merge(g);
      out.add(decal('pandanus', { seed: 25, core: '#1e1a10', litter: ['#8a7a4a', '#a89a64'], nLitter: 30, litterSize: 9 }, 1.1));
      return out;
    },
  });

  // =====================================================================================================
  // bamboo — dense clump of culms that lean out and arch; feathery leaf sprays; strong sway
  // =====================================================================================================
  function culmTex() {
    return tex('culm', 128, 512, (g, w, h) => {
      const r = RNG(77);
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#9ac25a'); gr.addColorStop(0.5, '#6e9e3a'); gr.addColorStop(1, '#9ac25a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { g.strokeStyle = rgba(r() < 0.5 ? '#c8e08a' : '#4a7a2a', 0.25); g.lineWidth = 1 + r() * 2; const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      // node ring (one per texture repeat) with a pale waxy band below it
      g.fillStyle = 'rgba(230,236,200,0.55)'; g.fillRect(0, h - 40, w, 26);
      g.fillStyle = '#3e5a22'; g.fillRect(0, h - 14, w, 7);
      g.fillStyle = '#c8d890'; g.fillRect(0, h - 7, w, 3);
      for (let i = 0; i < 8; i++) { g.fillStyle = rgba('#5a4a2a', 0.3); g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 6, 8 + r() * 20, 0, 0, TAU); g.fill(); }
    }, { wrap: true });
  }
  G.Models.define('bamboo', {
    variants: 3,
    update(node, o, t) { Wind.tick(t); spin(node, o); },
    ...BATCH,
    build(o, K) {
      const v = o.v || 0, r = RNG(1300 + v * 53);
      const H = 5.0 * (1 + r.pm(0.08));
      const wind = { height: H, strength: 0.45, flex: 2.0, radial: 0.05 };
      const cmatl = cmat('bamboo_culm', () => Wind.windify(G.R3M.env({ map: culmTex(), color: 0xffffff, vertexColors: true, roughness: 0.45 }), Object.assign({ var: [0.08, 0.05, 0.08] }, wind)));
      const lmat = leafMat('bamboo' + v, leafAtlas('bamboo', { seed: 79, shape: 'oval', n: 95, L: 56, W: 8, R: 92, mass: false, gloss: false, dark: '#3a6a22', mid: '#5a8e2e', light: '#86b844', hi: '#c8e88a' }), Object.assign({}, wind, { flutter: 0.05, trans: 0.65 }));
      const cu = new Acc(), lf = new Acc();
      const n = 9 + r.int(5);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.32;
        const base = V3(cos(a) * d, -0.1, sin(a) * d);
        const h = H * (0.65 + r() * 0.4);
        const out = 0.08 + d * 0.5 + r() * 0.08;
        const pts = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(V3(base.x + cos(a) * out * h * t * t, -0.1 + h * t - out * 0.4 * h * t * t * t, base.z + sin(a) * out * h * t * t)); }
        const rad = 0.045 + r() * 0.025;
        tube(cu, pts, taperR(pts.length, rad, rad * 0.35), { seg: 6, texW: 0.3, texH: 0.42 + r() * 0.08, ao: (p) => { const k = sstep(0, 1.5, p.y); return [lerp(0.55, 1, k), lerp(0.55, 1, k), lerp(0.5, 1, k)]; } });
        // leaf sprays along the upper culm (pointing outward / drooping)
        for (let k = 6; k <= 10; k++) {
          if (r() < 0.35) continue;
          const p = pts[k];
          const c = p.clone().add(V3(cos(a + r.pm(1.5)) * 0.22, -0.08, sin(a + r.pm(1.5)) * 0.22));
          clump(lf, r, c, 0.34 + r() * 0.12, { cards: 5, C: V3(0, H * 0.7, 0), Rn: V3(1.6, H * 0.4, 1.6), sphere: 0.4, clumpN: 0.4, up: -0.2, spread: 0.6 });
        }
      }
      // culm sheaths & fallen leaves around the base
      const g = K.group(meshOf(cu, cmatl), meshOf(lf, lmat));
      const outM = K.merge(g);
      outM.add(decal('bamboo', { seed: 27, core: '#1e1c0e', litter: ['#a89a5a', '#8a7a3a', '#c4b070'], nLitter: 200, litterSize: 6 }, 1.0));
      return outM;
    },
  });

  // =====================================================================================================
  // SMALL PLANTS (cheap: ≤ 1.5k tris, 1–3 materials, vertex-coloured blades, instancing-friendly)
  // =====================================================================================================
  // Tapered curved blade: base point, azimuth `a`, height h, lean (0..1+), width w, segments n, colours (linear rgb)
  function blade(acc, base, a, h, lean, w, n, cBase, cTip, o = {}) {
    const dx = cos(a), dz = sin(a), sx = -dz, sz = dx;
    const b0 = acc.count;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = lean * h * t * t; // quadratic arch
      const y = h * t - lean * lean * h * t * t * t * 0.35;
      const p = V3(base.x + dx * off, base.y + y, base.z + dz * off);
      const ww = w * (o.taper === false ? 1 : (1 - t * 0.92)) * (o.wide ? sin(clamp(t * 0.9 + 0.1, 0, 1) * PI) : 1);
      const c = [lerp(cBase[0], cTip[0], t), lerp(cBase[1], cTip[1], t), lerp(cBase[2], cTip[2], t)];
      // normal: mostly up/out so blades light like a soft mass (no black backsides)
      const nx = dx * 0.35, ny = 0.9, nz = dz * 0.35;
      acc.v(p.x - sx * ww, p.y, p.z - sz * ww, nx, ny, nz, 0, t, c[0], c[1], c[2]);
      acc.v(p.x + sx * ww, p.y, p.z + sz * ww, nx, ny, nz, 1, t, c[0], c[1], c[2]);
    }
    for (let i = 0; i < n; i++) { const a0 = b0 + i * 2; acc.quad(a0, a0 + 2, a0 + 3, a0 + 1); }
    // tip position (for heads)
    const off = lean * h, y = h - lean * lean * h * 0.35;
    return V3(base.x + dx * off, base.y + y, base.z + dz * off);
  }
  const grassMat = (key, wind, params = {}) => cmat('grass_' + key, () => {
    const m = G.R3M.env(Object.assign({ color: 0xffffff, vertexColors: true, side: T.DoubleSide, roughness: 0.85 }, params));
    Wind.windify(m, Object.assign({ var: [0.12, 0.1, 0.06], trans: 0.4, flutter: 0.01 }, wind));
    return m;
  });
  // feathery plumes (silvergrass, reeds) / grain heads atlas: 4 vertical columns
  function plumeTex(key, P) {
    return tex('plume_' + key, 256, 256, (g, w, h) => {
      const r = RNG(P.seed || 21);
      for (let c = 0; c < 4; c++) {
        const cx = c * 64 + 32;
        g.save(); g.beginPath(); g.rect(c * 64, 0, 64, h); g.clip();
        g.strokeStyle = P.stem; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, h); g.lineTo(cx, 8); g.stroke();
        for (let i = 0; i < (P.n || 160); i++) {
          const t = r(), y = h * (1 - t * 0.95), side = r() < 0.5 ? -1 : 1;
          const L = (P.spread || 22) * sin(clamp(t * 1.1, 0, 1) * PI) * (0.5 + r() * 0.6);
          g.strokeStyle = rgba(r.pick(P.cols), 0.5 + r() * 0.5); g.lineWidth = P.lw || 1.3;
          g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + side * L * 0.5, y - 4, cx + side * L, y + (P.droop || 6)); g.stroke();
        }
        g.restore();
      }
    });
  }
  // a camera-independent plume: two crossed cards along a (possibly arched) spine
  function plume(acc, pts, w, col, o = {}) {
    const c = col || 0;
    for (const rot of [0, PI / 2]) {
      const up = V3(cos(rot + (o.rot || 0)), 0.0001, sin(rot + (o.rot || 0)));
      ribbon(acc, pts, pts.map((_, i) => w * (o.taper ? 1 - i / pts.length * 0.5 : 1)), { up, u0: c * 0.25, u1: c * 0.25 + 0.25, keepSide: true, ao: o.ao });
    }
  }
  function defPlant(id, def) {
    G.Models.define(id, Object.assign({ variants: 3, occluder: false, update(node, o, t) { Wind.tick(t); spin(node, o); }, ...BATCH }, def));
  }
  const C = (hexs) => col3(hexs);

  // ---- tallgrass ---------------------------------------------------------------------------------
  defPlant('tallgrass', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1400 + v * 7);
      const m = grassMat('tall', { height: 0.9, strength: 0.18, flex: 1.6, flutter: 0.015 });
      const acc = new Acc();
      const pal = [[C('#2e5a1c'), C('#9ccc4a')], [C('#3a5a1a'), C('#c8c860')], [C('#2a4e22'), C('#7ab84a')]][v];
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.4;
        const base = V3(cos(a) * d, 0, sin(a) * d);
        const h = 0.45 + r() * 0.5 * (1 - d * 1.2);
        const tip = pal[1].map((x) => x * (0.85 + r() * 0.3));
        blade(acc, base, a + r.pm(0.8), h, 0.25 + r() * 0.45, 0.028 + r() * 0.014, 4, pal[0], tip);
      }
      return K.merge(K.group(meshOf(acc, m, { cast: true })));
    },
  });

  // ---- reeds 蘆葦: tall blades + buff flower panicles ---------------------------------------------
  defPlant('reeds', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1450 + v * 7);
      const wind = { height: 1.9, strength: 0.3, flex: 1.7, flutter: 0.02 };
      const m = grassMat('reeds', wind);
      const pm = cmat('plume_reeds', () => Wind.windify(G.R3M.env({ map: plumeTex('reeds', { seed: 23, cols: ['#b89a6a', '#d8c098', '#8a6a4a', '#e8d8b8'], stem: '#8a7a5a', n: 180, spread: 20, droop: 10 }), alphaTest: 0.35, side: T.DoubleSide, vertexColors: true, roughness: 0.9 }), Object.assign({ var: [0.08, 0.06, 0.04], trans: 0.6 }, wind)));
      const acc = new Acc(), pl = new Acc();
      for (let i = 0; i < 34; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.36, base = V3(cos(a) * d, 0, sin(a) * d);
        blade(acc, base, a + r.pm(1), 0.8 + r() * 0.8, 0.3 + r() * 0.4, 0.03, 4, C('#3a5a24'), C(r() < 0.3 ? '#b8b070' : '#8ab048'));
      }
      for (let i = 0; i < 7; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.25, base = V3(cos(a) * d, 0, sin(a) * d), h = 1.5 + r() * 0.45;
        const tip = blade(acc, base, a, h, 0.08, 0.012, 3, C('#5a6a34'), C('#a09060'), { taper: false });
        const pts = archPts(tip.clone().add(V3(0, -0.36, 0)), V3(cos(a) * 0.3, 1, sin(a) * 0.3), 0.42, 4, 0.25);
        plume(pl, pts, 0.09, r.int(4), { rot: r() * PI });
      }
      return K.merge(K.group(meshOf(acc, m), meshOf(pl, pm)));
    },
  });

  // ---- silvergrass 芒草: arching fountain of blades + silky silver plumes ---------------------------
  defPlant('silvergrass', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1500 + v * 7);
      const wind = { height: 1.5, strength: 0.32, flex: 1.6, flutter: 0.025 };
      const m = grassMat('silver', wind);
      const plumeCols = [['#f4f0ec', '#e0d8d0', '#c8b8b0', '#ffffff'], ['#f0e4e0', '#d8c0c0', '#c0a0a8', '#fff4f4'], ['#f8f4e8', '#e8dcc0', '#d0c098', '#ffffff']][v];
      const pm = cmat('plume_silver' + v, () => Wind.windify(G.R3M.env({ map: plumeTex('silver' + v, { seed: 25 + v, cols: plumeCols, stem: '#b0a890', n: 260, spread: 26, droop: 14, lw: 1.1 }), alphaTest: 0.3, side: T.DoubleSide, vertexColors: true, roughness: 0.7 }), Object.assign({ var: [0.05, 0.05, 0.05], trans: 0.9, transColor: 0xfff4e0 }, wind)));
      const acc = new Acc(), pl = new Acc();
      for (let i = 0; i < 44; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.22, base = V3(cos(a) * d, 0, sin(a) * d);
        blade(acc, base, a + r.pm(0.4), 0.7 + r() * 0.45, 0.6 + r() * 0.5, 0.022, 5, C('#3a5a2a'), C(r() < 0.25 ? '#c8c088' : '#8ab062'));
      }
      for (let i = 0; i < 8; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.15, base = V3(cos(a) * d, 0, sin(a) * d), h = 1.1 + r() * 0.4;
        const tip = blade(acc, base, a, h, 0.12, 0.01, 3, C('#6a7a4a'), C('#b8b090'), { taper: false });
        const pts = archPts(tip.clone().add(V3(0, -0.02, 0)), V3(cos(a) * 0.6, 1, sin(a) * 0.6), 0.48, 5, 0.9);
        plume(pl, pts, 0.11, r.int(4), { rot: a, taper: true });
      }
      return K.merge(K.group(meshOf(acc, m), meshOf(pl, pm)));
    },
  });

  // ---- rice_stalks: 3×3 hills of rice (young green → heading → golden, drooping grain) -------------
  defPlant('rice_stalks', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1550 + v * 7);
      const wind = { height: 0.9, strength: 0.14, flex: 1.6, flutter: 0.012 };
      const m = grassMat('rice', wind);
      const acc = new Acc();
      const pal = [[C('#2e6a1e'), C('#8ad04a')], [C('#3a6a1e'), C('#b8d048')], [C('#7a7a2a'), C('#e8c858')]][v];
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
        const c0 = V3(gx * 0.3 + r.pm(0.03), 0, gz * 0.3 + r.pm(0.03));
        for (let i = 0; i < 13; i++) {
          const a = r() * TAU, base = c0.clone().add(V3(r.pm(0.03), 0, r.pm(0.03)));
          const tip = blade(acc, base, a, 0.55 + r() * 0.3, 0.2 + r() * 0.3, 0.018, 3, pal[0], pal[1]);
          if (v > 0 && i % 3 === 0) {
            // grain head: a drooping string of grains
            const pts = archPts(tip, V3(cos(a) * 0.5, 0.4, sin(a) * 0.5), 0.2, 4, v === 2 ? 2.2 : 1.2, { lin: true });
            ribbon(acc, pts, pts.map(() => 0.018), { ao: () => (v === 2 ? C('#f0c850') : C('#c8d060')), fold: 0.5 });
          }
        }
      }
      return K.merge(K.group(meshOf(acc, m)));
    },
  });

  // ---- millet 小米: broad-leafed stalks with heavy, nodding golden panicles --------------------------
  defPlant('millet', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1600 + v * 7);
      const wind = { height: 1.3, strength: 0.18, flex: 1.6, flutter: 0.015 };
      const m = grassMat('millet', wind);
      const acc = new Acc();
      const head = [C('#d8a030'), C('#e8c050'), C('#c87a28')][v];
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.28, base = V3(cos(a) * d, 0, sin(a) * d), h = 0.95 + r() * 0.35;
        const tip = blade(acc, base, a, h, 0.12, 0.012, 4, C('#4a6a2a'), C('#8a9a4a'), { taper: false });
        for (let k = 0; k < 4; k++) blade(acc, base.clone().add(V3(0, 0.15 + k * 0.2, 0)), a + k * 2.1, 0.45 + r() * 0.2, 0.9, 0.035, 4, C('#3a6a24'), C('#a0b850'), { wide: true });
        // panicle: chunky foxtail made of overlapping grain lumps along a nodding arc
        const pts = archPts(tip, V3(cos(a) * 0.5, 0.6, sin(a) * 0.5), 0.38, 10, 2.6, { lin: true });
        const hc = head.map((x) => x * (0.85 + r() * 0.25));
        tube(acc, pts, pts.map((_, k) => { const t = k / (pts.length - 1); return 0.008 + 0.04 * sin(clamp(t * 1.05 + 0.1, 0, 1) * PI); }), { seg: 6, lump: 0.55, lumpSeed: i + v * 7, cap: true, ao: (p, t) => [hc[0] * lerp(0.7, 1.1, t), hc[1] * lerp(0.7, 1.1, t), hc[2] * lerp(0.7, 1.05, t)] });
      }
      return K.merge(K.group(meshOf(acc, m)));
    },
  });

  // ---- flowers: grass tuft + wildflowers (v0 咸豐草 & 野牡丹, v1 台灣百合 trumpets, v2 marigold-gold) ----
  function flowerTex() {
    return tex('flowers', 256, 256, (g) => {
      // 4 cells: bidens (white rays, yellow disc), melastoma (purple), gold, pink
      const cells = [
        { petals: 6, pc: '#fbfaf4', ps: '#d8d4c4', eye: '#e8b820', pw: 0.34, pl: 0.8 },
        { petals: 5, pc: '#b860d0', ps: '#7a2a9a', eye: '#f0d040', pw: 0.5, pl: 0.85 },
        { petals: 12, pc: '#ffb020', ps: '#e07010', eye: '#a85010', pw: 0.24, pl: 0.82 },
        { petals: 5, pc: '#ff8ab0', ps: '#d04a7a', eye: '#ffe080', pw: 0.48, pl: 0.8 },
      ];
      cells.forEach((c, i) => {
        const ox = (i % 2) * 128 + 64, oy = floor(i / 2) * 128 + 64;
        g.save(); g.translate(ox, oy);
        for (let k = 0; k < c.petals; k++) {
          g.save(); g.rotate(k / c.petals * TAU);
          const gr = g.createLinearGradient(0, 0, 0, -58 * c.pl);
          gr.addColorStop(0, c.ps); gr.addColorStop(0.5, c.pc); gr.addColorStop(1, c.pc);
          g.fillStyle = gr; g.beginPath(); g.ellipse(0, -30 * c.pl, 60 * c.pw * 0.5, 30 * c.pl, 0, 0, TAU); g.fill();
          g.restore();
        }
        g.fillStyle = c.eye; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(-3, -3, 4, 0, TAU); g.fill();
        g.restore();
      });
    });
  }
  // flower head: a small upward-tilted disc card (+ a backing card so it reads from the side)
  function flowerHead(acc, p, size, cell, tiltDir, col = [1, 1, 1]) {
    const face = V3(tiltDir.x * 0.45, 1, tiltDir.z * 0.45).normalize();
    _q.setFromUnitVectors(V3(0, 0, 1), face);
    const ax = V3(1, 0, 0).applyQuaternion(_q), ay = V3(0, 1, 0).applyQuaternion(_q);
    const u0 = (cell % 2) * 0.5, v0 = 0.5 - floor(cell / 2) * 0.5;
    const id = [];
    for (const [sx, sy, cu, cv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      const q = p.clone().addScaledVector(ax, sx * size).addScaledVector(ay, sy * size);
      id.push(acc.v(q.x, q.y, q.z, face.x, face.y, face.z, u0 + cu * 0.5, v0 + cv * 0.5, col[0], col[1], col[2]));
    }
    acc.quad(id[0], id[1], id[2], id[3]);
  }
  // trumpet (Taiwan lily / spider-lily-free): lathe flare, white with green throat
  function trumpet(acc, p, dir, L, R, cThroat, cMouth) {
    const d = dir.clone().normalize();
    let nr = abs(d.y) < 0.9 ? V3(0, 1, 0).cross(d).normalize() : V3(1, 0, 0).cross(d).normalize();
    const bn = d.clone().cross(nr).normalize();
    const seg = 10, rings = 5, b = acc.count;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, rr = lerp(R * 0.12, R, pow(t, 2.2)) * (t === 1 ? 1.15 : 1);
      const c = [lerp(cThroat[0], cMouth[0], t), lerp(cThroat[1], cMouth[1], t), lerp(cThroat[2], cMouth[2], t)];
      for (let j = 0; j <= seg; j++) {
        const a = j / seg * TAU, ca = cos(a), sa = sin(a);
        const lobe = 1 + 0.18 * cos(a * 3) * t;
        const q = p.clone().addScaledVector(d, L * t - (t > 0.85 ? (t - 0.85) * L * 0.6 : 0)).addScaledVector(nr, ca * rr * lobe).addScaledVector(bn, sa * rr * lobe);
        const nn = nr.clone().multiplyScalar(ca).addScaledVector(bn, sa).addScaledVector(d, -0.4).normalize();
        acc.v(q.x, q.y, q.z, nn.x, nn.y, nn.z, j / seg, t, c[0], c[1], c[2]);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = b + i * (seg + 1) + j, c2 = a + seg + 1; acc.quad(a, c2, c2 + 1, a + 1); }
  }
  defPlant('flowers', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1650 + v * 7);
      const wind = { height: 0.6, strength: 0.12, flex: 1.5, flutter: 0.012 };
      const gm = grassMat('flowers', wind);
      const fm = cmat('flowerheads', () => Wind.windify(G.R3M.env({ map: flowerTex(), alphaTest: 0.4, side: T.DoubleSide, vertexColors: true, roughness: 0.6 }), Object.assign({ var: [0.06, 0.06, 0.06], trans: 0.5, transColor: 0xffffff }, wind)));
      const lm = plainMat('lilyflower', 0xffffff, wind, { side: T.DoubleSide, roughness: 0.5 });
      const acc = new Acc(), fl = new Acc(), lil = new Acc();
      for (let i = 0; i < 24; i++) {
        const a = r() * TAU, d = sqrt(r()) * 0.36;
        blade(acc, V3(cos(a) * d, 0, sin(a) * d), a + r.pm(0.8), 0.2 + r() * 0.25, 0.4 + r() * 0.4, 0.022, 3, C('#2e5a1c'), C('#8ac44a'));
      }
      if (v === 1) {
        // 台灣百合: tall stems with narrow leaves, nodding white trumpets with a purple-brown flush
        for (let i = 0; i < 4; i++) {
          const a = r() * TAU, d = sqrt(r()) * 0.25, base = V3(cos(a) * d, 0, sin(a) * d), h = 0.65 + r() * 0.3;
          const tip = blade(acc, base, a, h, 0.12, 0.008, 3, C('#3d6e26'), C('#5a8a32'), { taper: false });
          for (let k = 0; k < 5; k++) blade(acc, base.clone().add(V3(0, 0.1 + k * 0.1, 0)), a + k * 2.3, 0.18, 1.0, 0.01, 2, C('#3d6e26'), C('#6a9a3a'));
          const n = 1 + (i % 2);
          for (let k = 0; k < n; k++) { const az = a + k * 2.4; trumpet(lil, tip, V3(cos(az), -0.15, sin(az)), 0.2, 0.075, C('#8aa060'), C('#fffaf0')); }
        }
      } else {
        const cells = v === 0 ? [0, 0, 1] : [2, 2, 0, 3];
        for (let i = 0; i < 16; i++) {
          const a = r() * TAU, d = sqrt(r()) * 0.36, base = V3(cos(a) * d, 0, sin(a) * d);
          const tip = blade(acc, base, a, 0.25 + r() * 0.25, 0.15, 0.006, 2, C('#3d6e26'), C('#5a8a32'), { taper: false });
          flowerHead(fl, tip, 0.035 + r() * 0.02, r.pick(cells), V3(cos(a), 0, sin(a)));
        }
      }
      const g = K.group(meshOf(acc, gm));
      if (fl.i.length) g.add(meshOf(fl, fm, { cast: false }));
      if (lil.i.length) g.add(meshOf(lil, lm));
      return K.merge(g);
    },
  });

  // ---- lily: 彼岸花 red spider lily (v0, v1 — the game's namesake flower) / 台灣百合 (v2) --------------
  defPlant('lily', {
    build(o, K) {
      const v = o.v || 0, r = RNG(1700 + v * 7);
      const wind = { height: 0.6, strength: 0.1, flex: 1.5, flutter: 0.01 };
      const gm = grassMat('lilystem', wind);
      const pm = plainMat('spiderlily' + v, 0xffffff, wind, { side: T.DoubleSide, roughness: 0.45, emissive: new T.Color(v === 2 ? 0x000000 : 0x5a0606) });
      const acc = new Acc(), pet = new Acc();
      if (v === 2) {
        for (let i = 0; i < 3; i++) {
          const a = i / 3 * TAU + r.pm(0.4), d = 0.12 + r() * 0.1, base = V3(cos(a) * d, 0, sin(a) * d), h = 0.75 + r() * 0.25;
          const tip = blade(acc, base, a, h, 0.1, 0.008, 3, C('#3d6e26'), C('#5a8a32'), { taper: false });
          for (let k = 0; k < 6; k++) blade(acc, base.clone().add(V3(0, 0.08 + k * 0.1, 0)), a + k * 2.3, 0.2, 1.0, 0.009, 2, C('#3d6e26'), C('#6a9a3a'));
          for (let k = 0; k < 2; k++) { const az = a + k * 2.6; trumpet(pet, tip, V3(cos(az), -0.1, sin(az)), 0.22, 0.08, C('#8aa060'), C('#fffaf2')); }
        }
      } else {
        // bare stems (leaves appear after flowering), each topped by an umbel of recurved red petals + long stamens
        const red = v === 0 ? C('#d81818') : C('#e83a28'), deep = C('#7a0a0a');
        for (let i = 0; i < 4; i++) {
          const a = r() * TAU, d = sqrt(r()) * 0.3, base = V3(cos(a) * d, 0, sin(a) * d), h = 0.45 + r() * 0.22;
          const tip = blade(acc, base, a, h, 0.06, 0.008, 3, C('#4a7a2a'), C('#6a9a3a'), { taper: false });
          for (let f = 0; f < 4; f++) {
            const fa = f / 4 * TAU + r.pm(0.3), fd = V3(cos(fa), 0.55, sin(fa)).normalize();
            const c0 = tip.clone().addScaledVector(fd, 0.03);
            const e1 = V3(0, 1, 0).cross(fd).normalize(), e2 = fd.clone().cross(e1).normalize();
            for (let k = 0; k < 6; k++) {
              // narrow wavy petal flaring out around the flower axis and curling back
              const pa = k / 6 * TAU, pd = fd.clone().multiplyScalar(0.35).addScaledVector(e1, cos(pa)).addScaledVector(e2, sin(pa)).normalize();
              const pts = archPts(c0, pd, 0.085, 4, 1.6, { lin: true });
              ribbon(pet, pts, [0.004, 0.009, 0.008, 0.003], { twist: 0.8, ao: (p, t) => [lerp(deep[0], red[0], t + 0.4), lerp(deep[1], red[1], t), lerp(deep[2], red[2], t)] });
            }
            // stamens: long filaments sweeping forward and up beyond the petals
            for (let k = 0; k < 2; k++) {
              const sd = fd.clone().addScaledVector(e1, r.pm(0.5)).addScaledVector(e2, 0.3 + r() * 0.4).normalize(), pts = archPts(c0, sd, 0.15, 3, -0.8);
              ribbon(pet, pts, [0.0018, 0.0018, 0.003], { ao: () => red });
            }
          }
        }
      }
      return K.merge(K.group(meshOf(acc, gm), meshOf(pet, pm)));
    },
  });

  // ---- bush: low dome of foliage clumps on short woody stems (v1 杜鵑 azalea in bloom) ---------------
  defPlant('bush', {
    occluder: false,
    build(o, K) {
      const v = o.v || 0, r = RNG(1750 + v * 13);
      const wind = { height: 1.1, strength: 0.06, flex: 1.6 };
      const P = [
        { seed: 101, shape: 'oval', n: 90, L: 26, W: 11, dark: '#1f4a2a', mid: '#336c36', light: '#559845', hi: '#a8d470' },
        { seed: 102, shape: 'blossom', n: 90, L: 24, W: 15, leafy: 0.45, leaf: '#3a6a2a', leaf2: '#5a8a3a', dark: '#c83a6a', mid: '#e8608a', light: '#ff90b0', hi: '#ffd0e0', eye: '#a02050' },
        { seed: 103, shape: 'oval', n: 90, L: 24, W: 10, dark: '#18402a', mid: '#2a5e3c', light: '#468a52', hi: '#94c488' },
      ][v];
      const lmat = leafMat('bush' + v, leafAtlas('bush' + v, P), Object.assign({}, wind, { flutter: 0.02 }));
      const bmat = barkMat('bush', BARKS.grey, wind);
      const lf = new Acc(), st = new Acc();
      const Cn = V3(0, 0.55, 0), R = V3(0.62, 0.48, 0.58);
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const pts = limbPts(r, V3(0, 0, 0), V3(cos(a) * 0.6, 1, sin(a) * 0.6), 0.6, 3, { wiggle: 0.2 }); tube(st, pts, taperR(pts.length, 0.03, 0.01), { seg: 4 }); }
      for (const c of canopyPoints(r, Cn, R, 9, { bottom: 0.8, inner: 0.4, minD: 0.25 })) clump(lf, r, c, 0.36, { cards: 8, C: Cn, Rn: R, sphere: 0.55, clumpN: 0.5, outward: 0.5 });
      const out = K.merge(K.group(meshOf(st, bmat), meshOf(lf, lmat)));
      out.add(decal('bush', { seed: 29, core: '#141a0c' }, 0.75));
      return out;
    },
  });

  // =====================================================================================================
  // ROCKS — noise-displaced faceted boulders with box-projected painted stone, moss on top faces
  // =====================================================================================================
  function stoneTex(key, P) {
    return tex('stone_' + key, 512, 512, (g, w, h) => {
      const r = RNG(P.seed || 1), n = vnoise(P.seed || 1);
      const img = g.createImageData(w, h), d = img.data;
      const a = srgb(P.dark), b = srgb(P.light), vc = P.vein ? srgb(P.vein) : null;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        // tileable: blend 4 noise samples
        const u = x / w, v = y / h;
        const s = (fx, fy) => fbm(n, fx * 6, fy * 6, 4);
        let f = s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
        f = clamp((f - 0.5) * (P.contrast || 1.6) + 0.5, 0, 1);
        let R = a.r + (b.r - a.r) * f, Gc = a.g + (b.g - a.g) * f, B = a.b + (b.b - a.b) * f;
        if (P.speckle) { const sp = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000; if (sp < P.speckle) { const k = sp < P.speckle / 2 ? 0.55 : 1.35; R *= k; Gc *= k; B *= k; } }
        if (vc) {
          const vv = abs(sin((u * 3 + v * 5 + fbm(n, u * 4 + 9, v * 4 + 9, 3) * 2.2) * PI * 2));
          const vk = pow(1 - vv, 18) * 0.9;
          R = lerp(R, vc.r, vk); Gc = lerp(Gc, vc.g, vk); B = lerp(B, vc.b, vk);
        }
        const i = (y * w + x) * 4; d[i] = clamp(R, 0, 1) * 255; d[i + 1] = clamp(Gc, 0, 1) * 255; d[i + 2] = clamp(B, 0, 1) * 255; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      // cracks
      for (let i = 0; i < (P.cracks || 10); i++) {
        let x = r() * w, y = r() * h;
        g.strokeStyle = rgba(P.crack || '#1a1814', 0.45 + r() * 0.3); g.lineWidth = 1 + r() * 1.5;
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += r.pm(22); y += r.pm(22); g.lineTo(x, y); }
        g.stroke();
      }
      if (P.pits) for (let i = 0; i < P.pits; i++) { g.fillStyle = rgba(P.crack || '#111', 0.5); g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.5, 0, TAU); g.fill(); }
    }, { wrap: true });
  }
  const ROCK = {
    granite: { seed: 3, dark: '#6a645a', light: '#aea696', speckle: 0.04, cracks: 7, contrast: 1.2, crack: '#3a342c' },
    marble: { seed: 5, dark: '#c8c8c4', light: '#f4f4f0', vein: '#6a6a70', cracks: 3, contrast: 0.9, crack: '#8a8a90' },
    basalt: { seed: 7, dark: '#38383a', light: '#6c6a68', pits: 260, cracks: 6, contrast: 1.2, crack: '#0a0a0a' },
    wood: null,
  };
  function rockMat(kind) {
    return cmat('rock_' + kind, () => G.R3M.env({ map: stoneTex(kind, ROCK[kind]), vertexColors: true, roughness: kind === 'marble' ? 0.45 : 0.9, flatShading: false }));
  }
  // Boulder geometry: icosphere displaced by 3D noise, flattened base, faceted normals, box-projected uvs.
  // o: { r: [rx, ry, rz], detail, noise, facet (0 smooth .. 1 faceted), moss: {k, col}, seed, sink }
  const Simplex = T.SimplexNoise ? new T.SimplexNoise() : null;
  function n3(x, y, z) { return Simplex ? Simplex.noise3d(x, y, z) : (sin(x * 1.7 + y * 2.3) * cos(z * 1.9 - x) * 0.5); }
  function boulder(acc, c, o) {
    const g = new T.IcosahedronGeometry(1, o.detail || 2);
    const P = g.attributes.position;
    const seed = o.seed || 0, nk = o.noise || 0.25;
    const pos = [];
    for (let i = 0; i < P.count; i++) {
      let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const d = 1 + n3(x * 1.3 + seed, y * 1.3, z * 1.3) * nk + n3(x * 3.1, y * 3.1 + seed, z * 3.1) * nk * 0.35;
      x *= d * o.r[0]; y *= d * o.r[1]; z *= d * o.r[2];
      // chisel: quantise toward a few planes for stylised facets
      if (o.flatTop && y > o.r[1] * 0.55) y = o.r[1] * 0.55 + (y - o.r[1] * 0.55) * 0.25;
      if (y < -o.r[1] * (o.base || 0.35)) y = -o.r[1] * (o.base || 0.35) - (y + o.r[1] * (o.base || 0.35)) * 0.15;
      pos.push(V3(x, y, z));
    }
    const ix = g.index ? g.index.array : [...Array(P.count).keys()];
    // smooth normals per vertex (for blending with facets)
    const sm = pos.map(() => V3());
    for (let k = 0; k < ix.length; k += 3) {
      const a = pos[ix[k]], b = pos[ix[k + 1]], cc = pos[ix[k + 2]];
      const fn = b.clone().sub(a).cross(cc.clone().sub(a));
      sm[ix[k]].add(fn); sm[ix[k + 1]].add(fn); sm[ix[k + 2]].add(fn);
    }
    sm.forEach((v) => v.normalize());
    const facet = o.facet != null ? o.facet : 0.6;
    const yMin = -o.r[1] * (o.base || 0.35);
    for (let k = 0; k < ix.length; k += 3) {
      const vs = [pos[ix[k]], pos[ix[k + 1]], pos[ix[k + 2]]];
      const fn = vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).normalize();
      const ax = abs(fn.x) > abs(fn.y) ? (abs(fn.x) > abs(fn.z) ? 0 : 2) : (abs(fn.y) > abs(fn.z) ? 1 : 2);
      const ts = o.texScale || 0.8;
      const b0 = acc.count;
      for (let j = 0; j < 3; j++) {
        const p = vs[j], nn = sm[ix[k + j]].clone().lerp(fn, facet).normalize();
        const u = ax === 0 ? p.z : p.x, v = ax === 1 ? p.z : p.y;
        // AO toward the ground, moss on upward faces, tint
        const up = nn.y;
        const ao = lerp(0.55, 1, sstep(yMin, yMin + o.r[1] * 0.6, p.y));
        let col = o.tint ? o.tint.slice() : [1, 1, 1];
        if (o.moss) { const mk = sstep(0.45, 0.85, up + n3(p.x * 2 + seed, p.y * 2, p.z * 2) * 0.25) * o.moss.k; col = col.map((x2, i2) => lerp(x2, o.moss.col[i2], mk)); }
        acc.v(c.x + p.x, c.y + p.y, c.z + p.z, nn.x, nn.y, nn.z, u / ts + seed, v / ts, col[0] * ao, col[1] * ao, col[2] * ao);
      }
      acc.tri(b0, b0 + 1, b0 + 2);
    }
    g.dispose();
  }
  const MOSS = { k: 0.85, col: [0.32, 0.5, 0.18] };
  function defRock(id, def) { G.Models.define(id, Object.assign({ variants: 3, occluder: false, update(node, o) { spin(node, o); }, ...BATCH }, def)); }
  const rockDecal = (key, rad) => decal('rock_' + key, { seed: 31, core: '#141410' }, rad);

  defRock('rock_small', {
    build(o, K) {
      const v = o.v || 0, r = RNG(2000 + v * 11), acc = new Acc();
      boulder(acc, V3(0, 0.18, 0), { r: [0.42, 0.34, 0.36], seed: v * 7.1, noise: 0.28, moss: v === 1 ? MOSS : { k: 0.35, col: MOSS.col } });
      if (v !== 2) boulder(acc, V3(0.28, 0.06, 0.2), { r: [0.16, 0.12, 0.14], seed: v * 3 + 1, noise: 0.3, detail: 1 });
      const out = K.merge(K.group(meshOf(acc, rockMat('granite'))));
      out.add(rockDecal('small', 0.65));
      return out;
    },
  });
  defRock('rock_big', {
    occluder: true,
    build(o, K) {
      const v = o.v || 0, acc = new Acc();
      boulder(acc, V3(-0.05, 0.55, -0.05), { r: [0.98, 0.95, 0.85], seed: 10 + v * 5.3, noise: 0.3, detail: 3, moss: MOSS, facet: 0.7 });
      boulder(acc, V3(0.62, 0.25, 0.5), { r: [0.42, 0.36, 0.38], seed: 20 + v, noise: 0.3, moss: { k: 0.5, col: MOSS.col } });
      if (v !== 1) boulder(acc, V3(-0.7, 0.15, 0.6), { r: [0.28, 0.22, 0.26], seed: 30 + v, noise: 0.3, detail: 1 });
      const out = K.merge(K.group(meshOf(acc, rockMat('granite'))));
      out.add(rockDecal('big', 1.4));
      return out;
    },
  });
  defRock('rock_marble', {
    build(o, K) {
      const v = o.v || 0, acc = new Acc();
      // water-polished Taroko marble: smooth rounded forms, white with grey veins
      boulder(acc, V3(0, 0.2, 0), { r: [0.44, 0.36, 0.38], seed: 40 + v * 3, noise: 0.18, facet: 0.15, texScale: 1.4, tint: [1, 1, 1.02] });
      if (v === 2) boulder(acc, V3(-0.25, 0.08, 0.22), { r: [0.18, 0.14, 0.15], seed: 44, noise: 0.15, facet: 0.1, detail: 1 });
      const out = K.merge(K.group(meshOf(acc, rockMat('marble'))));
      out.add(rockDecal('marble', 0.6));
      return out;
    },
  });

  // ---- columnar basalt (澎湖): packed hexagonal prisms ---------------------------------------------
  function hexColumns(acc, cells, o) {
    for (const c of cells) {
      const g = new T.CylinderGeometry(c.r, c.r * 1.02, c.h, 6, 1);
      g.rotateY(PI / 6 + (o.rot || 0));
      const P = g.attributes.position, N = g.attributes.normal, ix = g.index.array;
      for (let k = 0; k < ix.length; k += 3) {
        const b0 = acc.count;
        const vs = [0, 1, 2].map((j) => V3(P.getX(ix[k + j]), P.getY(ix[k + j]) + c.h / 2, P.getZ(ix[k + j])));
        const fn = vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).normalize();
        for (const p of vs) {
          // tilted tops (weathered), lighter top faces, darker toward the ground
          let y = p.y;
          if (y > c.h - 0.001) y += (p.x * c.tx + p.z * c.tz);
          const top = fn.y > 0.5;
          const ao = top ? 1.25 : lerp(0.5, 1, sstep(0, c.h, y));
          const u = top ? p.x : (abs(fn.x) > abs(fn.z) ? p.z : p.x), v = top ? p.z : y;
          acc.v(c.x + p.x, y - 0.05, c.z + p.z, fn.x, fn.y, fn.z, u + c.x * 3, v, ao, ao, ao * 1.02);
        }
        acc.tri(b0, b0 + 1, b0 + 2);
      }
      g.dispose();
    }
  }
  function hexCells(r, n, R, hMin, hMax, rad) {
    const cells = [], dx = rad * sqrt(3) * 1.0;
    for (let q = -n; q <= n; q++) for (let s2 = -n; s2 <= n; s2++) {
      const x = (q + s2 * 0.5) * dx, z = s2 * rad * 1.5;
      const d = Math.hypot(x / R[0], z / R[1]);
      if (d > 1) continue;
      cells.push({ x, z, r: rad * 0.97, h: lerp(hMax, hMin, sstep(0, 1, d + r.pm(0.25))), tx: r.pm(0.15), tz: r.pm(0.15) });
    }
    return cells;
  }
  defRock('rock_basalt', {
    build(o, K) {
      const v = o.v || 0, r = RNG(2100 + v * 13), acc = new Acc();
      hexColumns(acc, hexCells(r, 2, [0.42, 0.38], 0.25, 0.9 + v * 0.15, 0.13), { rot: v * 0.3 });
      const out = K.merge(K.group(meshOf(acc, rockMat('basalt'))));
      out.add(rockDecal('basalt', 0.6));
      return out;
    },
  });
  defRock('basalt', {
    occluder: true,
    build(o, K) {
      const v = o.v || 0, r = RNG(2200 + v * 17), acc = new Acc();
      // stepped palisade, tallest at the back (north) so the cluster reads from the game camera
      const cells = hexCells(r, 5, [0.95, 0.92], 0.3, 2.2, 0.17);
      for (const c of cells) c.h = clamp(c.h * lerp(1.15, 0.65, (c.z + 0.9) / 1.8) + r.pm(0.15), 0.2, 2.6);
      hexColumns(acc, cells, { rot: 0 });
      const out = K.merge(K.group(meshOf(acc, rockMat('basalt'))));
      out.add(rockDecal('basalt2', 1.3));
      return out;
    },
  });

  // =====================================================================================================
  // WOOD — stump, log, driftwood
  // =====================================================================================================
  function ringTex(key, P) {
    return tex('rings_' + key, 256, 256, (g, w) => {
      const r = RNG(P.seed || 3);
      g.fillStyle = P.outer; g.fillRect(0, 0, w, w);
      for (let i = 30; i > 0; i--) {
        const rr = (i / 30) * w * 0.47;
        g.fillStyle = i % 2 ? P.a : P.b; g.beginPath();
        for (let k = 0; k <= 48; k++) { const a = k / 48 * TAU; const q = rr * (1 + r.pm(0.015)); k ? g.lineTo(w / 2 + cos(a) * q, w / 2 + sin(a) * q) : g.moveTo(w / 2 + cos(a) * q, w / 2 + sin(a) * q); }
        g.fill();
      }
      g.strokeStyle = rgba(P.crack, 0.7); g.lineWidth = 2.5;
      for (let i = 0; i < 4; i++) { const a = r() * TAU; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + cos(a) * w * 0.42, w / 2 + sin(a) * w * 0.42); g.stroke(); }
      g.strokeStyle = P.outer; g.lineWidth = 12; g.beginPath(); g.arc(w / 2, w / 2, w * 0.47, 0, TAU); g.stroke();
    });
  }
  function capDisc(acc, c, nrm, rad, seg = 14, lumpy = 0.05, rr = RNG(1)) {
    const n = nrm.clone().normalize();
    const t1 = abs(n.y) < 0.9 ? V3(0, 1, 0).cross(n).normalize() : V3(1, 0, 0).cross(n).normalize();
    const t2 = n.clone().cross(t1);
    const ci = acc.v(c.x, c.y, c.z, n.x, n.y, n.z, 0.5, 0.5);
    const b0 = acc.count;
    for (let k = 0; k <= seg; k++) {
      const a = k / seg * TAU, q = rad * (1 + rr.pm(lumpy));
      const p = c.clone().addScaledVector(t1, cos(a) * q).addScaledVector(t2, sin(a) * q);
      acc.v(p.x, p.y, p.z, n.x, n.y, n.z, 0.5 + cos(a) * 0.48, 0.5 + sin(a) * 0.48);
    }
    for (let k = 0; k < seg; k++) acc.tri(ci, b0 + k, b0 + k + 1);
  }
  const ringMat = (key, P) => cmat('ring_' + key, () => G.R3M.env({ map: ringTex(key, P), roughness: 0.9, vertexColors: true }));
  const BARKS4 = {
    stump: { seed: 51, style: 'furrow', dark: '#4e3a2a', mid: '#6e543c', light: '#8e7254', hi: '#b89a74', line: '#22160c', moss: '#5a7a30' },
    drift: { seed: 53, style: 'fibre', dark: '#9a948a', mid: '#bab4a8', light: '#d8d2c6', hi: '#f2eee6', line: '#6a645a', vfreq: 0.8 },
  };
  G.Models.define('stump', {
    variants: 3,
    update(node, o) { spin(node, o); },
    ...BATCH,
    build(o, K) {
      const v = o.v || 0, r = RNG(2300 + v * 7);
      const bark = new Acc(), top = new Acc(), mc = new Acc();
      const ao = barkAO([0.55, 0.5, 0.42], 0.3, { h: 0.35, k: 0.55, c: [0.5, 0.7, 0.35] });
      const h = 0.42 + r() * 0.2, R0 = 0.3;
      const pts = [V3(0, -0.1, 0), V3(0, h * 0.5, 0), V3(0, h, 0)];
      tube(bark, pts, [R0 * 1.25, R0 * 1.02, R0], { seg: 14, ao, flute: { n: 5, amp: 0.3, h: 0.3, y0: -0.1 }, lump: 0.08 });
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r.pm(0.3); const rp = limbPts(r, V3(cos(a) * 0.2, 0.15, sin(a) * 0.2), V3(cos(a), -0.6, sin(a)), 0.55, 4, { pull: V3(0, -1, 0), pullK: 0.12 }); tube(bark, rp, taperR(rp.length, 0.11, 0.02), { seg: 6, ao }); }
      // saw-cut top (slightly tilted) with a broken splinter edge
      capDisc(top, V3(0, h + 0.005, 0), V3(r.pm(0.08), 1, r.pm(0.08)), R0 * 0.98, 16, 0.02, r);
      for (let k = 0; k < 4; k++) { const a = r() * TAU; const p = V3(cos(a) * R0 * 0.85, h, sin(a) * R0 * 0.85); tube(bark, [p, p.clone().add(V3(r.pm(0.03), 0.08 + r() * 0.1, r.pm(0.03)))], [0.04, 0.005], { seg: 3, ao }); }
      // shelf fungi / little mushrooms
      if (v !== 1) for (let k = 0; k < 3; k++) { const a = 0.6 + k * 0.5 + v; blob(mc, V3(cos(a) * R0 * 1.05, h * 0.35 + k * 0.08, sin(a) * R0 * 1.05), 0.09, 0.025, 0.09, col3(v === 0 ? '#c89a5a' : '#e8d8c0'), { shade: true }); }
      else for (let k = 0; k < 4; k++) { const p = V3(0.35 + r.pm(0.1), 0, 0.15 + r.pm(0.2)); tube(mc, [p, p.clone().add(V3(0, 0.08, 0))], [0.012, 0.01], { seg: 4, ao: () => col3('#e8e0d0') }); blob(mc, p.clone().add(V3(0, 0.09, 0)), 0.035, 0.022, 0.035, col3('#c84a2a'), { shade: true }); }
      const g = K.group(meshOf(bark, barkMat('stump', BARKS4.stump)), meshOf(top, ringMat('stump', { outer: '#5a4030', a: '#c8a070', b: '#b08858', crack: '#3a2414' })), meshOf(mc, plainMat('stump_misc', 0xffffff, null)));
      const out = K.merge(g);
      out.add(decal('stump', { seed: 33, core: '#141a0c', litter: ['#8a6a3a', '#a08050'], nLitter: 50, litterSize: 4 }, 0.75));
      return out;
    },
  });
  G.Models.define('log', {
    variants: 3,
    build(o, K) {
      const v = o.v || 0, r = RNG(2400 + v * 7);
      const bark = new Acc(), ends = new Acc(), mc = new Acc();
      const R0 = 0.27 + r() * 0.05, L = 1.75;
      const pts = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V3(-L / 2 + L * t, R0 * 0.85 + sin(t * 3 + v) * 0.03, sin(t * 2.2 + v) * 0.06)); }
      // moss along the top: vertex tint where the surface faces up (tube ao receives the point only → use height)
      const ao = (p) => { const k = sstep(R0 * 0.8, R0 * 1.6, p.y); return [lerp(0.7, 0.55, k), lerp(0.66, 0.8, k), lerp(0.58, 0.4, k)]; };
      tube(bark, pts, taperR(pts.length, R0, R0 * 0.88), { seg: 12, ao: (p) => [0.85, 0.82, 0.78], lump: 0.12, texW: 0.5 });
      // moss mantle: a half-tube slightly bigger along the top
      const mossM = cmat('moss_mantle', () => G.R3M.env({ map: leafAtlas('moss', { seed: 111, shape: 'oval', n: 140, L: 12, W: 7, R: 100, massR: 0.85, gloss: false, dark: '#2e4a1a', mid: '#4a6e22', light: '#6e9a34', hi: '#a8c860' }), alphaTest: 0.45, vertexColors: true, roughness: 1 }));
      const moss = new Acc();
      for (let i = 0; i < 7; i++) {
        const p = pts[1 + (i % 7)].clone().add(V3(r.pm(0.1), R0 * 0.75, r.pm(0.08)));
        clump(moss, r, p, 0.22, { cards: 4, C: p.clone().add(V3(0, -0.3, 0)), Rn: V3(0.3, 0.2, 0.3), flat: 0.85, sphere: 0.8, size: 0.32 });
      }
      capDisc(ends, pts[0], V3(-1, 0, 0), R0 * 0.97, 14, 0.03, r);
      capDisc(ends, pts[8], V3(1, 0, 0), R0 * 0.86, 14, 0.03, r);
      // broken branch stubs
      for (let k = 0; k < 2; k++) { const p = pts[2 + k * 4]; const s2 = limbPts(r, p, V3(r.pm(0.4), 0.8, k ? 1 : -1), 0.35, 2, {}); tube(bark, s2, [0.07, 0.06, 0.05], { seg: 6, cap: true }); }
      // a few mushrooms (v2: little ferns instead)
      for (let k = 0; k < 3; k++) { const p = V3(r.pm(0.6), 0.02, R0 * 0.9 + 0.05); blob(mc, p.clone().add(V3(0, 0.07, 0)), 0.04, 0.025, 0.04, col3(v === 2 ? '#d8a050' : '#b8603a'), { shade: true }); tube(mc, [p, p.clone().add(V3(0, 0.07, 0))], [0.01, 0.01], { seg: 4, ao: () => col3('#e8dcc8') }); }
      const g = K.group(meshOf(bark, barkMat('log', Object.assign({ tex: 'stump' }, BARKS4.stump))), meshOf(ends, ringMat('log', { outer: '#4a3424', a: '#b89060', b: '#9c7448', crack: '#2a1a0c' })), meshOf(moss, mossM), meshOf(mc, plainMat('log_misc', 0xffffff, null)));
      const out = K.merge(g);
      out.add(decal('log', { seed: 35, core: '#141a0c' }, 1.1));
      return out;
    },
  });
  G.Models.define('driftwood', {
    variants: 3,
    build(o, K) {
      const v = o.v || 0, r = RNG(2500 + v * 7);
      const bark = new Acc();
      const ao = (p) => { const k = sstep(0, 0.25, p.y); return [lerp(0.6, 1, k), lerp(0.58, 1, k), lerp(0.55, 1, k)]; };
      const L = 1.85, pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(V3(-L / 2 + L * t, 0.13 + sin(t * 5 + v) * 0.04, sin(t * 4 + v * 2) * 0.12)); }
      tube(bark, pts, pts.map((_, i) => lerp(0.17, 0.07, i / 10) * (1 + 0.25 * sin(i * 1.7))), { seg: 9, ao, lump: 0.3, lumpSeed: 7 + v, texW: 0.4, cap: true });
      // bleached root plate at one end + crooked branch arms
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; const rp = limbPts(r, pts[0], V3(-0.4, cos(a), sin(a)), 0.3 + r() * 0.25, 3, { wiggle: 0.4 }); tube(bark, rp, taperR(rp.length, 0.06, 0.015), { seg: 5, ao, cap: true }); }
      for (let k = 0; k < 2; k++) { const p = pts[4 + k * 3]; const b2 = limbPts(r, p, V3(0.6, 0.5, k ? 1 : -1), 0.5, 3, { wiggle: 0.3 }); tube(bark, b2, taperR(b2.length, 0.05, 0.015), { seg: 5, ao, cap: true }); }
      const out = K.merge(K.group(meshOf(bark, barkMat('driftwood', BARKS4.drift))));
      out.add(decal('driftwood', { seed: 37, core: '#3a3020' }, 1.0));
      return out;
    },
  });

  // =====================================================================================================
  // WATER PLANTS — lotus (on water), seaweed (washed-up kelp)
  // =====================================================================================================
  function padTex() {
    return tex('lotuspad', 256, 256, (g, w) => {
      const r = RNG(41);
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#9ac860'); gr.addColorStop(0.5, '#5a9a3a'); gr.addColorStop(1, '#3a7a2a');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(200,236,150,0.55)'; g.lineWidth = 2;
      for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; g.beginPath(); g.moveTo(w / 2, w / 2); g.quadraticCurveTo(w / 2 + cos(a + 0.1) * w * 0.25, w / 2 + sin(a + 0.1) * w * 0.25, w / 2 + cos(a) * w * 0.5, w / 2 + sin(a) * w * 0.5); g.stroke(); }
      for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(r() * w, r() * w, 2 + r() * 8, 0, TAU); g.fill(); }
      g.fillStyle = '#c8e090'; g.beginPath(); g.arc(w / 2, w / 2, 6, 0, TAU); g.fill();
    });
  }
  // cupped disc with a notch, rim slightly upturned
  function pad(acc, c, R, rot, o = {}) {
    const seg = 18, rings = 3, b0 = acc.count, notch = 0.22;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      for (let k = 0; k <= seg; k++) {
        const a = rot + notch / 2 + k / seg * (TAU - notch);
        const rr = R * t * (1 + 0.03 * sin(a * 5));
        const y = (o.cup || 0.04) * t * t + (o.lift || 0);
        acc.v(c.x + cos(a) * rr, c.y + y, c.z + sin(a) * rr, -cos(a) * t * 0.15, 1, -sin(a) * t * 0.15, 0.5 + cos(a - rot) * t * 0.5, 0.5 + sin(a - rot) * t * 0.5);
      }
    }
    for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) { const a = b0 + i * (seg + 1) + k, b = a + seg + 1; acc.quad(a, b, b + 1, a + 1); }
  }
  G.Models.define('lotus', {
    variants: 3,
    occluder: false,
    update(node, o, t) { Wind.tick(t); spin(node, o); },
    ...BATCH,
    build(o, K) {
      const v = o.v || 0, r = RNG(2600 + v * 7);
      const wind = { height: 0.8, strength: 0.04, flex: 1.5 };
      const pm = cmat('lotus_pad', () => Wind.windify(G.R3M.env({ map: padTex(), side: T.DoubleSide, roughness: 0.35, vertexColors: true }), Object.assign({ var: [0.06, 0.06, 0.04] }, wind)));
      const fm = plainMat('lotus_flower', 0xffffff, wind, { side: T.DoubleSide, roughness: 0.5, emissive: new T.Color(0x200810) });
      const pads = new Acc(), fl = new Acc();
      const WY = -0.06; // water surface
      const n = 5 + r.int(3);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + r.pm(0.4), d = 0.12 + r() * 0.3;
        const raised = i < 2 && v !== 2;
        pad(pads, V3(cos(a) * d, raised ? 0.25 + r() * 0.2 : WY, sin(a) * d), 0.16 + r() * 0.1, r() * TAU, { cup: raised ? 0.07 : 0.02 });
        if (raised) tube(fl, [V3(cos(a) * d, WY - 0.1, sin(a) * d), V3(cos(a) * d, 0.24, sin(a) * d)], [0.012, 0.01], { seg: 4, ao: () => col3('#5a8a3a') });
      }
      // flowers: cupped pink petals around a yellow seed pod; v2 just buds
      const nf = v === 2 ? 0 : 1 + (v === 1 ? 1 : 0);
      const pink = col3('#ff9ac0'), deep = col3('#d8487a'), white = col3('#fff4f8');
      for (let f = 0; f < nf; f++) {
        const c = V3(r.pm(0.15), 0.32 + f * 0.1, r.pm(0.15));
        tube(fl, [V3(c.x, WY - 0.1, c.z), c.clone()], [0.012, 0.01], { seg: 4, ao: () => col3('#5a8a3a') });
        for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 8; k++) {
          const a = k / 8 * TAU + ring * 0.4, op = ring ? 0.55 : 0.9;
          const pts = archPts(c, V3(cos(a) * op, 1.2 - ring * 0.3, sin(a) * op), 0.14 - ring * 0.025, 4, -0.25, { lin: true });
          ribbon(fl, pts, [0.02, 0.045, 0.04, 0.012], { fold: -0.35, up: V3(cos(a), 0, sin(a)), ao: (p, t) => [lerp(white[0], lerp(pink[0], deep[0], t), t + 0.2), lerp(white[1], lerp(pink[1], deep[1], t), t + 0.2), lerp(white[2], lerp(pink[2], deep[2], t), t + 0.2)] });
        }
        blob(fl, c.clone().add(V3(0, 0.05, 0)), 0.035, 0.025, 0.035, col3('#e8d040'), { shade: true });
      }
      for (let b = 0; b < (v === 2 ? 3 : 1); b++) {
        const c = V3(r.pm(0.25), 0.3 + r() * 0.15, r.pm(0.25));
        tube(fl, [V3(c.x, WY - 0.1, c.z), c.clone()], [0.01, 0.009], { seg: 4, ao: () => col3('#5a8a3a') });
        blob(fl, c.clone().add(V3(0, 0.06, 0)), 0.04, 0.08, 0.04, col3('#f088aa'), { shade: true });
      }
      return K.merge(K.group(meshOf(pads, pm, { cast: false }), meshOf(fl, fm)));
    },
  });
  G.Models.define('seaweed', {
    variants: 3,
    occluder: false,
    build(o, K) {
      const v = o.v || 0, r = RNG(2700 + v * 7);
      const m = plainMat('kelp', 0xffffff, null, { roughness: 0.5, side: T.DoubleSide, envMapIntensity: 0.25 });
      const acc = new Acc();
      const cA = col3(['#5a4a1a', '#3e5222', '#6a4a1e'][v]), cB = col3(['#a08a34', '#7a9a3a', '#b08838'][v]);
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU, p0 = V3(r.pm(0.3), 0.015, r.pm(0.3)), pts = [];
        let p = p0.clone(), d = V3(cos(a), 0, sin(a));
        for (let k = 0; k < 9; k++) { pts.push(p.clone()); d.applyAxisAngle(V3(0, 1, 0), r.pm(0.7)); p = p.clone().addScaledVector(d, 0.09); p.y = 0.012 + k * 0.001 + i * 0.002; }
        ribbon(acc, pts, pts.map((_, k) => 0.025 + 0.02 * sin(k / 8 * PI)), { ao: (q, t) => [lerp(cA[0], cB[0], t), lerp(cA[1], cB[1], t), lerp(cA[2], cB[2], t)], twist: 0.3 });
        for (let k = 2; k < 8; k += 3) blob(acc, pts[k].clone().add(V3(0, 0.012, 0)), 0.018, 0.012, 0.018, cB, { ws: 6, hs: 4, shade: true });
      }
      return K.merge(K.group(meshOf(acc, m, { cast: false })));
    },
  });

  // =====================================================================================================
  // SPIRIT FLORA — bioluminescent fungi, crystals, sacred geometry, jewel flowers, glowing vines
  // =====================================================================================================
  // GPU-animated floating motes (spores, sparkles, mist): no per-frame CPU work. Add AFTER K.merge (not a mesh).
  // o: { n, r (radius), h (height), y0, color, size (px at 10 m), speed, swirl, seed, blend }
  function motes(o) {
    const r = RNG(o.seed || 1), n = o.n || 24;
    const pos = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = r() * TAU, d = sqrt(r()) * o.r; pos[i * 3] = cos(a) * d; pos[i * 3 + 1] = (o.y0 || 0) + r() * o.h; pos[i * 3 + 2] = sin(a) * d; sd[i] = r(); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('seed', new T.BufferAttribute(sd, 1));
    g.boundingSphere = new T.Sphere(V3(0, (o.y0 || 0) + o.h / 2, 0), o.r + o.h);
    const key = 'motes_' + [o.color, o.size, o.speed, o.swirl, o.h, o.y0, o.blend, o.mist ? 1 : 0].join('_');
    const m = cmat(key, () => new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: o.blend === 'normal' ? T.NormalBlending : T.AdditiveBlending, fog: false,
      uniforms: { uWT: Wind.uniforms.uWT, uCol: { value: new T.Color(o.color || '#aef') }, uSize: { value: o.size || 6 }, uSpeed: { value: o.speed || 0.15 }, uH: { value: o.h }, uY0: { value: o.y0 || 0 }, uSwirl: { value: o.swirl || 0.3 }, uTex: { value: G.R3M.glowTex() } },
      vertexShader: `attribute float seed; uniform float uWT, uSize, uSpeed, uH, uY0, uSwirl; varying float vA;
        void main(){
          vec3 p = position; float t = uWT * uSpeed + seed * 7.0;
          float y = mod(p.y - uY0 + t * uH * 0.25, uH); p.y = uY0 + y;
          p.x += sin(uWT * 0.7 + seed * 20.0) * uSwirl; p.z += cos(uWT * 0.6 + seed * 13.0) * uSwirl;
          float life = y / uH; vA = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.7, 1.0, life)) * (0.6 + 0.4 * sin(uWT * 3.0 + seed * 40.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * ${o.mist ? '(1.0 + life * 2.5)' : '1.0'} * 10.0 / max(-mv.z, 0.5);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uCol; uniform sampler2D uTex; varying float vA;
        void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uCol * t.rgb, t.a * vA); }`,
    }));
    const pts = new T.Points(g, m);
    pts.frustumCulled = true; pts.renderOrder = 5; pts.castShadow = false;
    return pts;
  }
  // a soft additive glow card (fake volumetric halo), faces up-ish; added after merge
  function halo(rad, color, y, k = 0.6) {
    const m = cmat('halo_' + color + k, () => new T.MeshBasicMaterial({ map: G.R3M.glowTex(), color: new T.Color(color).multiplyScalar(k), transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    const g = new T.PlaneGeometry(rad * 2, rad * 2); g.rotateX(-PI / 2);
    const h = new T.Mesh(g, m); h.position.y = y; h.renderOrder = 4; h.castShadow = false; h.receiveShadow = false;
    return h;
  }
  // glowing spirit material: lit surface + emissive (map or vertex colours), pulsing / hue-swinging per instance
  function glowMat(key, o) {
    return cmat('glow_' + key, () => {
      const m = G.R3M.env(Object.assign({ color: 0xffffff, vertexColors: true, roughness: 0.5, emissive: 0x000000, emissiveIntensity: 1 }, o.params || {}));
      Wind.windify(m, Object.assign({ height: 1, strength: 0, var: [0.04, 0.04, 0.04] }, o.fx || {}));
      return m;
    });
  }
  // mushroom cap texture: radial-ish (lathe u around, v along profile 0 = rim underside … 1 = top centre)
  function capTex(key, P) {
    return tex('cap_' + key, 256, 256, (g, w, h) => {
      const r = RNG(P.seed || 9);
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, P.gill); gr.addColorStop(0.32, P.gill); gr.addColorStop(0.36, P.rim); gr.addColorStop(0.5, P.a); gr.addColorStop(1, P.b);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // gill lines on the underside band
      g.strokeStyle = rgba(P.gillLine, 0.6); g.lineWidth = 1.5;
      for (let x = 0; x < w; x += 6) { g.beginPath(); g.moveTo(x, h); g.lineTo(x, h * 0.68); g.stroke(); }
      // glowing spots on the dome
      for (let i = 0; i < (P.spots || 18); i++) {
        const x = r() * w, y = r() * h * 0.5, R0 = 4 + r() * 9;
        for (const dx of [-w, 0, w]) { const s2 = g.createRadialGradient(x + dx, y, 0, x + dx, y, R0); s2.addColorStop(0, P.spot); s2.addColorStop(0.6, P.spot); s2.addColorStop(1, rgba(P.spot, 0)); g.fillStyle = s2; g.beginPath(); g.ellipse(x + dx, y, R0, R0 * 0.7, 0, 0, TAU); g.fill(); }
      }
    }, { wrap: true });
  }
  // cap: lathe dome with an in-curled rim and a gill underside → one draw call, emissive map = colour map
  function capGeo(R, H, o = {}) {
    const pts = [];
    const steps = 8;
    // underside: from stem to rim (v 0 → 0.34)
    pts.push(new T.Vector2(R * 0.18, -H * 0.05));
    pts.push(new T.Vector2(R * 0.6, -H * 0.12));
    pts.push(new T.Vector2(R * 0.97, -H * 0.06));
    // rim lip
    pts.push(new T.Vector2(R * 1.02, H * 0.03));
    // dome
    for (let i = 1; i <= steps; i++) { const a = i / steps * PI / 2; pts.push(new T.Vector2(cos(a) * R * (1 - 0.02 * i), sin(a) * H * (o.flat ? 0.7 : 1) + H * 0.03)); }
    const g = new T.LatheGeometry(pts, o.seg || 14);
    return g;
  }
  function addGeo(acc, geo, mtx, col) {
    geo = geo.index ? geo : geo;
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, b0 = acc.count;
    const nm = new T.Matrix3().getNormalMatrix(mtx), v = V3(), n = V3();
    for (let i = 0; i < P.count; i++) {
      v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(mtx);
      n.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
      const c = typeof col === 'function' ? col(P.getY(i), i) : col || [1, 1, 1];
      acc.v(v.x, v.y, v.z, n.x, n.y, n.z, UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0, c[0], c[1], c[2]);
    }
    if (geo.index) { const ix = geo.index.array; for (let k = 0; k < ix.length; k += 3) acc.tri(b0 + ix[k], b0 + ix[k + 1], b0 + ix[k + 2]); }
    else for (let k = 0; k < P.count; k += 3) acc.tri(b0 + k, b0 + k + 1, b0 + k + 2);
    geo.dispose();
  }
  const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new T.Matrix4().compose(V3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), V3(s, s, s));

  const SHROOM = [
    { a: '#1fd8c0', b: '#7affe8', rim: '#e8fff8', gill: '#0e6a7a', gillLine: '#c0fff0', spot: '#f0ffb0', light: '#6affd8', stem: '#cfeff0' },
    { a: '#8a3ae8', b: '#d08aff', rim: '#ffe0ff', gill: '#3a1a8a', gillLine: '#ff9af0', spot: '#7affe8', light: '#c07bff', stem: '#e8dcff' },
    { a: '#e83aa0', b: '#ff9ad0', rim: '#fff0c0', gill: '#7a1a5a', gillLine: '#ffd060', spot: '#a0f0ff', light: '#ff7ad0', stem: '#ffe0f0' },
  ];
  function shroomMats(v) {
    const P = SHROOM[v];
    const ct = capTex('shroom' + v, Object.assign({ seed: 61 + v }, P));
    const cap = cmat('shroomcap' + v, () => {
      const m = G.R3M.env({ map: ct, emissiveMap: ct, color: 0xd8d8d8, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.35, vertexColors: true });
      return Wind.windify(m, { height: 1.2, strength: 0.02, pulse: 0.35, pulseSpeed: 1.3, hue: 0.45, var: [0.03, 0.03, 0.03] });
    });
    const stem = glowMat('shroomstem' + v, { params: { color: new T.Color(P.stem), roughness: 0.6, emissive: new T.Color(P.light), emissiveIntensity: 0.12 }, fx: { height: 1.2, strength: 0.02, pulse: 0.3, vglow: 0.0 } });
    return { cap, stem, P };
  }
  function mushroomInto(capAcc, stemAcc, r, base, h, R, lean) {
    const top = base.clone().add(V3(lean.x * h, h, lean.z * h));
    const sp = [];
    for (let i = 0; i <= 5; i++) { const t = i / 5; sp.push(V3(lerp(base.x, top.x, t * t), base.y + h * t, lerp(base.z, top.z, t * t))); }
    tube(stemAcc, sp, sp.map((_, i) => lerp(R * 0.26, R * 0.17, i / 5) * (i === 0 ? 1.35 : 1)), { seg: 8, ao: (p, t) => [lerp(0.7, 1, t), lerp(0.7, 1, t), lerp(0.75, 1, t)] });
    // ring (annulus) on taller stems
    addGeo(capAcc, capGeo(R, R * 0.62, { seg: 14 }), M4(top.x, top.y, top.z, lean.z * 0.6, r() * TAU, -lean.x * 0.6));
  }
  G.Models.define('mushroom_glow', {
    variants: 3,
    occluder: false,
    update(node, o, t) { Wind.tick(t); spin(node, o); },
    ...BATCH,
    lights(o) { return [{ x: 0, y: 0.45, z: 0.1, color: SHROOM[(o.v || 0) % 3].light, intensity: 1.3, distance: 3.2, flicker: 0.15 }]; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3100 + v * 11);
      const { cap, stem, P } = shroomMats(v);
      const ca = new Acc(), st = new Acc();
      const n = 4 + v;
      for (let i = 0; i < n; i++) {
        const big = i === 0;
        const a = r() * TAU, d = big ? 0.06 : 0.12 + r() * 0.25;
        const h = big ? 0.68 : 0.18 + r() * 0.28, R = big ? 0.3 : 0.08 + r() * 0.08;
        mushroomInto(ca, st, r, V3(cos(a) * d, -0.02, sin(a) * d), h, R, V3(r.pm(0.25), 0, r.pm(0.25)));
      }
      // mossy mound
      const mound = new Acc();
      boulder(mound, V3(0, -0.03, 0), { r: [0.4, 0.09, 0.36], base: 0.6, seed: 70 + v, noise: 0.35, detail: 2, facet: 0.1, tint: [0.35, 0.6, 0.42] });
      const out = K.merge(K.group(meshOf(ca, cap), meshOf(st, stem), meshOf(mound, glowMat('moss_glow', { params: { color: 0x3a6a3a, roughness: 1, emissive: 0x062a1e, emissiveIntensity: 0.6 }, fx: { pulse: 0.2 } }))));
      out.add(motes({ n: 18, r: 0.45, h: 1.3, y0: 0.15, color: P.light, size: 5, speed: 0.12, swirl: 0.12, seed: 5 + v }));
      out.add(halo(0.9, P.light, 0.03, 0.35));
      return out;
    },
  });
  // mushroom_harvest: a pickable clump (2D twin in js/gfx/nature.js). Two states, toggled per frame from o.picked
  // (bool or live getter, G.Objects.flag): 'ready' = the mushroom_glow clump with brighter, faster-pulsing caps,
  // golden twinkling motes and a warm halo; 'picked' = cut stubs and a few pale buds on a plain, unlit mound.
  function harvestMats(v) {
    const P = SHROOM[v];
    const ct = capTex('shroom' + v, Object.assign({ seed: 61 + v }, P));
    const cap = cmat('harvcap' + v, () => {
      const m = G.R3M.env({ map: ct, emissiveMap: ct, color: 0xe8e8e8, emissive: 0xffffff, emissiveIntensity: 1.05, roughness: 0.3, vertexColors: true });
      return Wind.windify(m, { height: 1.2, strength: 0.02, pulse: 0.6, pulseSpeed: 2.4, hue: 0.45, var: [0.03, 0.03, 0.03] });
    });
    const bud = glowMat('harvbud', { params: { color: new T.Color('#9a90a8'), roughness: 0.7, emissive: new T.Color('#5a6a78'), emissiveIntensity: 0.18 }, fx: { pulse: 0.15 } });
    const moss = glowMat('harvmoss', { params: { color: new T.Color('#24402c'), roughness: 1, emissive: 0x000000, emissiveIntensity: 0 } });
    return { cap, bud, moss, P };
  }
  G.Models.define('mushroom_harvest', {
    variants: 3,
    occluder: false,
    update(node, o, t) {
      Wind.tick(t); spin(node, o);
      const picked = G.Objects.flag(o, 'picked'), ud = node.userData;
      if (ud.picked === picked) return;
      ud.picked = picked;
      node.traverse((n) => { if (n.userData.harv) n.visible = n.userData.harv === (picked ? 'picked' : 'ready'); });
    },
    // picked: no light at all (Map3D gives every light a halo sprite, which would read as still glowing)
    lights(o) { return G.Objects.flag(o, 'picked') ? [] : [{ x: 0, y: 0.55, z: 0.1, color: '#e8c878', intensity: 1.1, distance: 3.2, flicker: 0.25 }]; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3100 + v * 11);
      const { cap, stem, P } = shroomMats(v);
      const hm = harvestMats(v);
      // ready: the same clump layout as mushroom_glow
      const ca = new Acc(), st = new Acc();
      const n = 4 + v, cut = [];
      for (let i = 0; i < n; i++) {
        const big = i === 0;
        const a = r() * TAU, d = big ? 0.06 : 0.12 + r() * 0.25;
        const h = big ? 0.68 : 0.18 + r() * 0.28, R = big ? 0.3 : 0.08 + r() * 0.08;
        const base = V3(cos(a) * d, -0.02, sin(a) * d);
        cut.push([base, R]);
        mushroomInto(ca, st, r, base, h, R, V3(r.pm(0.25), 0, r.pm(0.25)));
      }
      const ready = K.merge(K.group(meshOf(ca, hm.cap), meshOf(st, stem)));
      ready.add(motes({ n: 18, r: 0.45, h: 1.3, y0: 0.15, color: P.light, size: 5, speed: 0.12, swirl: 0.12, seed: 5 + v }));
      ready.add(motes({ n: 12, r: 0.4, h: 1.6, y0: 0.25, color: '#ffe9a0', size: 8, speed: 0.16, swirl: 0.18, seed: 21 + v }));
      ready.add(halo(0.95, '#ffe0a0', 0.03, 0.18));
      ready.userData.harv = 'ready';
      // picked: stubs where the stems were cut + small pale buds
      const sa = new Acc(), ba = new Acc(), bs = new Acc();
      for (const [b, R] of cut.slice(0, 3)) tube(sa, [b, b.clone().add(V3(0, 0.05, 0))], [R * 0.3, R * 0.27], { seg: 8, ao: () => [0.9, 0.9, 0.95] });
      for (let i = 0; i < 4; i++) { const a = i * 1.7 + r() * 0.6, d = 0.1 + r() * 0.2; mushroomInto(ba, bs, r, V3(cos(a) * d, -0.02, sin(a) * d), 0.06 + r() * 0.06, 0.04 + r() * 0.025, V3(r.pm(0.2), 0, r.pm(0.2))); }
      // the mossy mound: glowing under a ready clump, plain and dark once picked
      const mound = new Acc();
      boulder(mound, V3(0, -0.03, 0), { r: [0.4, 0.09, 0.36], base: 0.6, seed: 70 + v, noise: 0.35, detail: 2, facet: 0.1, tint: [0.35, 0.6, 0.42] });
      const picked = K.merge(K.group(meshOf(ba, hm.bud), meshOf(bs, hm.bud), meshOf(sa, stem), meshOf(mound, hm.moss)));
      picked.userData.harv = 'picked';
      picked.visible = false;
      ready.add(K.merge(K.group(meshOf(mound, glowMat('moss_glow', { params: { color: 0x3a6a3a, roughness: 1, emissive: 0x062a1e, emissiveIntensity: 0.6 }, fx: { pulse: 0.2 } })))));
      return K.group(ready, picked);
    },
  });
  // mushroom_giant (2×2): solid south row = stem; the vast cap shelters the walkable north row
  G.Models.define('mushroom_giant', {
    variants: 3,
    occluder: true,
    update(node, o, t) { Wind.tick(t); },
    batch: true,
    lights(o) { const c = ['#5ff0ff', '#b88aff', '#ff7ad0'][(o.v || 0) % 3]; return [{ x: 0, y: 3.0, z: 0, color: c, intensity: 1.6, distance: 7, flicker: 0.1 }, { x: 0, y: 0.6, z: 0.6, color: '#d8c8ff', intensity: 0.8, distance: 3, flicker: 0.05 }]; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3200 + v * 11);
      const { cap, stem, P } = shroomMats(v);
      const ca = new Acc(), st = new Acc();
      // great stem rising from the south row, leaning north so the cap centres over the footprint
      const base = V3(0, -0.05, 0.55), H = 3.1, R = 1.45;
      const top = V3(0, H, -0.05);
      const sp = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; sp.push(V3(sin(t * 3 + v) * 0.08, lerp(base.y, top.y, t), lerp(base.z, top.z, sstep(0, 1, t)))); }
      tube(st, sp, sp.map((_, i) => { const t = i / 8; return 0.32 - t * 0.08 + 0.25 * pow(1 - t, 5); }), { seg: 14, flute: { n: 6, amp: 0.25, h: 0.8, y0: -0.05 }, lump: 0.08, ao: (p) => { const k = sstep(0, 1.4, p.y); return [lerp(0.6, 1, k), lerp(0.62, 1, k), lerp(0.7, 1, k)]; } });
      // skirt (annulus) hanging under the cap
      const sk = new T.CylinderGeometry(0.33, 0.55, 0.35, 14, 1, true);
      addGeo(st, sk, M4(top.x, top.y - 0.55, top.z));
      addGeo(ca, capGeo(R, R * 0.55, { seg: 20 }), M4(top.x, top.y, top.z, 0.05, v, 0));
      // glowing drips hanging from the rim
      for (let k = 0; k < 14; k++) {
        const a = k / 14 * TAU + r.pm(0.2), p = top.clone().add(V3(cos(a) * R * 0.95, -0.05, sin(a) * R * 0.95));
        const L = 0.15 + r() * 0.45;
        tube(ca, [p, p.clone().add(V3(0, -L * 0.6, 0)), p.clone().add(V3(0, -L, 0))], [0.02, 0.012, 0.004], { seg: 4, ao: () => [1.2, 1.2, 1.2] });
      }
      // a few small companions at the foot
      for (let i = 0; i < 4; i++) { const a = 0.3 + i * 1.5, d = 0.55 + r() * 0.3; mushroomInto(ca, st, r, V3(cos(a) * d, -0.02, 0.4 + sin(a) * d * 0.6), 0.2 + r() * 0.3, 0.09 + r() * 0.08, V3(r.pm(0.3), 0, r.pm(0.3))); }
      const out = K.merge(K.group(meshOf(ca, cap), meshOf(st, stem)));
      out.add(motes({ n: 40, r: 1.4, h: 3.2, y0: 0.2, color: P.light, size: 6, speed: 0.08, swirl: 0.25, seed: 9 + v }));
      out.add(halo(2.2, P.light, 0.03, 0.3));
      return out;
    },
  });

  // ---- crystal: faceted prisms bursting from a dark rock matrix --------------------------------------
  const CRY = [
    { body: '#3ad0ff', tip: '#e8ffff', glow: '#7ff4ff' },
    { body: '#9a5aff', tip: '#ffe0ff', glow: '#c79cff' },
    { body: '#ffa040', tip: '#fff4c0', glow: '#ffc27a' },
  ];
  function prism(acc, base, dir, L, w, sides, cBase, cTip, r) {
    const d = dir.clone().normalize();
    let nr = abs(d.y) < 0.9 ? V3(0, 1, 0).cross(d).normalize() : V3(1, 0, 0).cross(d).normalize();
    const bn = d.clone().cross(nr);
    const sh = 0.72 + r() * 0.12; // shoulder
    const ring = (t, s) => { const out = []; for (let k = 0; k < sides; k++) { const a = k / sides * TAU + 0.3; out.push(base.clone().addScaledVector(d, L * t).addScaledVector(nr, cos(a) * w * s).addScaledVector(bn, sin(a) * w * s)); } return out; };
    const r0 = ring(-0.1, 0.9), r1 = ring(sh, 1), tip = base.clone().addScaledVector(d, L);
    const face = (a, b, c, ca, cb, cc) => {
      const fn = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      const i0 = acc.v(a.x, a.y, a.z, fn.x, fn.y, fn.z, 0, 0, ...ca), i1 = acc.v(b.x, b.y, b.z, fn.x, fn.y, fn.z, 1, 0, ...cb), i2 = acc.v(c.x, c.y, c.z, fn.x, fn.y, fn.z, 1, 1, ...cc);
      acc.tri(i0, i1, i2);
    };
    const mid = cBase.map((x, i) => lerp(x, cTip[i], 0.55));
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      face(r0[k], r0[k2], r1[k2], cBase, cBase, mid); face(r0[k], r1[k2], r1[k], cBase, mid, mid);
      face(r1[k], r1[k2], tip, mid, mid, cTip);
    }
  }
  G.Models.define('crystal', {
    variants: 3,
    occluder: false,
    update(node, o, t) { Wind.tick(t); spin(node, o); },
    ...BATCH,
    lights(o) { return [{ x: 0, y: 0.7, z: 0.1, color: CRY[(o.v || 0) % 3].glow, intensity: 1.3, distance: 3.6, flicker: 0.08 }]; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3300 + v * 13), C0 = CRY[v];
      const m = glowMat('crystal' + v, { params: { color: 0xffffff, roughness: 0.15, metalness: 0.1, flatShading: true }, fx: { vglow: 0.7, pulse: 0.3, pulseSpeed: 1.1, irid: 0.45, hue: 0.25 } });
      const acc = new Acc();
      const cb = col3(C0.body).map((x) => x * 0.25), ct = col3(C0.body).map((x, i) => lerp(x, col3(C0.tip)[i], 0.35));
      for (let i = 0; i < 7; i++) {
        const big = i === 2;
        const a = (i - 3) * 0.32 + r.pm(0.2), az = r() * TAU;
        const dir = V3(sin(a) * cos(az) * 1.2, 1, sin(a) * sin(az) * 1.2);
        const bx = V3((i - 3) * 0.07 + r.pm(0.05), 0.05, r.pm(0.12));
        prism(acc, bx, dir, big ? 1.15 : 0.35 + r() * 0.45, big ? 0.13 : 0.05 + r() * 0.05, 6, cb, ct, r);
      }
      const rock = new Acc();
      boulder(rock, V3(0, 0.02, 0), { r: [0.42, 0.18, 0.36], seed: 80 + v, noise: 0.3, detail: 1, facet: 0.8, tint: [0.45, 0.42, 0.55] });
      const out = K.merge(K.group(meshOf(acc, m), meshOf(rock, rockMat('basalt'))));
      out.add(motes({ n: 12, r: 0.45, h: 1.4, y0: 0.2, color: C0.glow, size: 4, speed: 0.1, swirl: 0.1, seed: 13 + v }));
      out.add(halo(0.8, C0.glow, 0.03, 0.4));
      return out;
    },
  });

  // ---- geometry_pillar: rune-carved octagonal plinth; nested sacred solids float and counter-rotate above it
  function runeTex() {
    return tex('runes', 512, 128, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const r = RNG(91);
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const x0 = i * 32 + 6;
        g.beginPath();
        for (let k = 0; k < 4; k++) { const x = x0 + r() * 20, y = 30 + r() * 68; k ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
        g.beginPath(); g.arc(x0 + 10, 64, 4 + r() * 5, 0, TAU); g.stroke();
      }
      g.fillStyle = '#fff'; g.fillRect(0, 8, w, 3); g.fillRect(0, h - 11, w, 3);
    }, { wrap: true });
  }
  function edgeTubes(acc, geo, mtx, rad, col) {
    const eg = new T.EdgesGeometry(geo, 1);
    const P = eg.attributes.position;
    for (let i = 0; i < P.count; i += 2) {
      const a = V3(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(mtx), b = V3(P.getX(i + 1), P.getY(i + 1), P.getZ(i + 1)).applyMatrix4(mtx);
      tube(acc, [a, b], [rad, rad], { seg: 4, ao: () => col });
    }
    for (let i = 0; i < P.count; i++) blob(acc, V3(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(mtx), rad * 2.2, rad * 2.2, rad * 2.2, col, { ws: 6, hs: 4 });
    eg.dispose(); geo.dispose();
  }
  G.Models.define('geometry_pillar', {
    variants: 3,
    noClone: false,
    update(node, o, t) {
      Wind.tick(t);
      const g1 = node.getObjectByName('geoA'), g2 = node.getObjectByName('geoB');
      const ph = ((o.x || 0) * 1.7 + (o.y || 0) * 2.3) % 6;
      if (g1) { g1.rotation.set(t * 0.31 + ph, t * 0.5, t * 0.17); g1.position.y = 1.85 + sin(t * 1.1 + ph) * 0.06; }
      if (g2) { g2.rotation.set(-t * 0.23, -t * 0.7 + ph, t * 0.29); g2.position.y = 1.85 + sin(t * 1.1 + ph) * 0.06; }
    },
    lights(o) { return [{ x: 0, y: 1.9, z: 0, color: '#c8a0ff', intensity: 1.4, distance: 5, flicker: 0.1 }]; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3400 + v * 7);
      const stoneM = cmat('pillar_stone', () => { const m = G.R3M.env({ map: stoneTex('granite', ROCK.granite), color: 0x8a82a8, vertexColors: true, roughness: 0.8, emissiveMap: runeTex(), emissive: 0xffffff, emissiveIntensity: 1.6 }); return Wind.windify(m, { strength: 0, pulse: 0.5, pulseSpeed: 2.2, hueRate: 0.7 }); });
      const st = new Acc();
      // tiers: octagonal prisms; only the middle band's uv hits the rune strip (others map to its black area)
      const tiers = [[0.42, 0, 0.22], [0.34, 0.22, 0.32], [0.27, 0.54, 0.36]];
      tiers.forEach(([w, y, h], i) => {
        const g = new T.CylinderGeometry(w * 0.92, w, h, 8, 1);
        const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2, i === 1 ? 0.1 + uv.getY(k) * 0.8 : 0.0 + uv.getY(k) * 0.02 + 0.002);
        addGeo(st, g, M4(0, y + h / 2, 0, 0, PI / 8), (yy) => [lerp(0.7, 1, (yy + h / 2) / h), lerp(0.7, 1, (yy + h / 2) / h), lerp(0.75, 1, (yy + h / 2) / h)]);
      });
      // capstone dish
      addGeo(st, new T.CylinderGeometry(0.32, 0.22, 0.08, 8, 1), M4(0, 0.94, 0, 0, PI / 8), [1, 1, 1]);
      const out = K.merge(K.group(meshOf(st, stoneM)));
      // floating geometry (separate animated children)
      const gm = glowMat('sacred' + v, { params: { color: 0x221a33, roughness: 0.2, metalness: 0.4 }, fx: { vglow: 1.6, hueRate: 0.6, irid: 0.6, pulse: 0.3 } });
      const cA = [col3('#c8a0ff'), col3('#7affe8'), col3('#ffd070')][v], cB = [col3('#7affe8'), col3('#ff9af0'), col3('#c8a0ff')][v];
      const aAcc = new Acc(), bAcc = new Acc();
      const outer = [new T.IcosahedronGeometry(0.4, 0), new T.DodecahedronGeometry(0.38, 0), new T.OctahedronGeometry(0.42, 0)][v];
      edgeTubes(aAcc, outer, new T.Matrix4(), 0.012, cA);
      // star tetrahedron (merkaba) inside
      const tet = new T.TetrahedronGeometry(0.24, 0);
      edgeTubes(bAcc, tet, new T.Matrix4(), 0.01, cB);
      edgeTubes(bAcc, new T.TetrahedronGeometry(0.24, 0), new T.Matrix4().makeRotationX(PI), 0.01, cB);
      blob(bAcc, V3(0, 0, 0), 0.07, 0.07, 0.07, [3, 3, 3], { ws: 10, hs: 8 });
      const A = meshOf(aAcc, gm, { cast: false, name: 'geoA' }), B = meshOf(bAcc, gm, { cast: false, name: 'geoB' });
      A.position.y = B.position.y = 1.85;
      out.add(A, B);
      // light column (additive gradient cylinder)
      const colM = cmat('lightcol', () => new T.MeshBasicMaterial({ map: tex('lightcol', 8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), color: new T.Color('#b890ff').multiplyScalar(0.28), transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
      const colG = new T.CylinderGeometry(0.22, 0.3, 2.4, 16, 1, true); colG.translate(0, 0.98 + 1.2, 0);
      const col = new T.Mesh(colG, colM); col.renderOrder = 4; col.castShadow = false;
      out.add(col);
      out.add(motes({ n: 26, r: 0.5, h: 2.2, y0: 0.9, color: '#d0b0ff', size: 4, speed: 0.12, swirl: 0.15, seed: 21 + v }));
      return out;
    },
  });

  // ---- jewel_flower: crystalline stem + faceted gem bloom that slowly turns, hue-cycling ----------------
  G.Models.define('jewel_flower', {
    variants: 3,
    occluder: false,
    update(node, o, t) {
      Wind.tick(t); spin(node, o);
      const b = node.getObjectByName('bloom');
      if (b) { const ph = ((o.x || 0) * 3.1 + (o.y || 0) * 1.3) % 6; b.rotation.y = t * 0.35 + ph; b.position.y = b.userData.y0 + sin(t * 1.5 + ph) * 0.03; }
    },
    lights(o) { return [{ x: 0, y: 0.8, z: 0, color: '#ffd0ff', intensity: 1, distance: 2.6, flicker: 0.12 }]; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3500 + v * 7);
      const wind = { height: 0.9, strength: 0.05, flex: 1.5 };
      const sm = glowMat('jewelstem', { params: { color: 0x2a8a7a, roughness: 0.25, metalness: 0.2, emissive: 0x0a4a40, emissiveIntensity: 1 }, fx: Object.assign({ irid: 0.35, pulse: 0.2 }, wind) });
      const st = new Acc();
      const sp = [V3(0, -0.02, 0), V3(-0.05, 0.3, 0.02), V3(-0.02, 0.55, 0), V3(0, 0.72, 0)];
      tube(st, sp, [0.025, 0.02, 0.018, 0.015], { seg: 6, ao: () => [1, 1, 1] });
      for (const s of [-1, 1]) { const pts = archPts(V3(0, 0.14, 0), V3(s, 0.5, 0.2 * s), 0.3, 5, 0.6); ribbon(st, pts, [0.01, 0.05, 0.06, 0.04, 0.005], { fold: 0.4, ao: () => [0.6, 1.2, 1] }); }
      const out = K.merge(K.group(meshOf(st, sm)));
      const gm = glowMat('jewel' + v, { params: { color: 0xffffff, roughness: 0.1, metalness: 0.3, flatShading: true }, fx: { vglow: 0.9, hueRate: 0.8, irid: 0.6, pulse: 0.2 } });
      const bl = new Acc();
      const pc = [col3('#ff40c0'), col3('#30c8ff'), col3('#ffb020')][v], pt = pc.map((x) => x * 1.6 + 0.15);
      for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU + ring * 0.45, op = ring ? 0.45 : 0.85;
        prism(bl, V3(0, 0, 0), V3(cos(a) * op, 1 - ring * 0.2, sin(a) * op), 0.27 - ring * 0.07, 0.045, 4, pc.map((x) => x * 0.35), pt, r);
      }
      prism(bl, V3(0, -0.02, 0), V3(0, 1, 0), 0.12, 0.03, 5, [1.5, 1.4, 0.6], [2, 2, 1.5], r);
      const B = meshOf(bl, gm, { cast: false, name: 'bloom' });
      B.position.y = B.userData.y0 = 0.74;
      out.add(B);
      out.add(motes({ n: 10, r: 0.3, h: 1.0, y0: 0.4, color: '#ffd0ff', size: 4, speed: 0.15, swirl: 0.12, seed: 31 + v }));
      out.add(halo(0.6, '#ff9af0', 0.03, 0.3));
      return out;
    },
  });

  // ---- vine_curtain (w×1, walk-through): mossy bough at the top, vines hanging, heart leaves; v1/v2 glowing bulbs
  G.Models.define('vine_curtain', {
    variants: 3,
    key: (o) => String(o.w || 1),
    update(node, o, t) { Wind.tick(t); },
    batch: true,
    lights(o) { const v = (o.v || 0) % 3; return v ? [{ x: 0, y: 1.3, z: 0.1, color: v === 1 ? '#7affe0' : '#ff9af0', intensity: 1, distance: 2.4 + (o.w || 1) * 0.6, flicker: 0.1 }] : []; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3600 + v * 7), W = o.w || 1;
      const TOP = 2.9;
      const wind = { height: 2.6, strength: 0.22, flex: 1.6, hang: TOP, flutter: 0.03 };
      const vm = grassMat('vines', wind);
      const lm = leafMat('vine_leaf', leafAtlas('heartleaf', { seed: 121, shape: 'oval', n: 26, L: 34, W: 20, R: 80, mass: false, dark: '#1e4a1e', mid: '#2e6a2a', light: '#4e9a3a', hi: '#a8d870' }), Object.assign({}, wind, { trans: 0.6 }));
      const bm = barkMat('vine_bough', BARKS.camphor);
      const vines = new Acc(), leaves = new Acc(), bough = new Acc(), bulbs = new Acc();
      // bough spanning the width (slightly beyond), mossy
      const bp = [];
      for (let i = 0; i <= 6; i++) { const t = i / 6; bp.push(V3(-W / 2 - 0.2 + (W + 0.4) * t, TOP + sin(t * PI) * 0.12 + r.pm(0.03), -0.25 + sin(t * 5) * 0.05)); }
      tube(bough, bp, bp.map(() => 0.1 + r() * 0.02), { seg: 7, lump: 0.15, ao: () => [0.8, 0.95, 0.7] });
      const n = Math.round(9 * W);
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (i + 0.5) / n * W + r.pm(0.05), z = -0.25 + r.pm(0.15);
        const L = 1.6 + r() * 1.0;
        const pts = [];
        for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(V3(x + sin(t * 4 + i) * 0.06, TOP - L * t, z + cos(t * 3 + i) * 0.05 + t * 0.15)); }
        // vine: thin twisted ribbon pair
        for (const rot of [0, PI / 2]) ribbon(vines, pts, pts.map(() => 0.012), { up: V3(cos(rot), 0, sin(rot)), keepSide: true, ao: (p, t) => [lerp(0.22, 0.3, t), lerp(0.4, 0.55, t), lerp(0.12, 0.18, t)] });
        for (let k = 1; k <= 8; k++) {
          if (r() < 0.25) continue;
          const p = pts[k];
          clump(leaves, r, p.clone().add(V3(r.pm(0.05), 0, 0.03)), 0.13, { cards: 2, C: p.clone().add(V3(0, 0, -0.3)), Rn: V3(0.3, 0.3, 0.3), sphere: 0.4, size: 0.26, spread: 0.3 });
        }
        if (v && r() < 0.55) {
          const p = pts[8];
          blob(bulbs, p.clone().add(V3(0, -0.04, 0)), 0.035, 0.05, 0.035, v === 1 ? col3('#7affe0') : col3('#ff9af0'), { ws: 8, hs: 6 });
        }
      }
      // moss tufts on the bough
      for (let i = 0; i < 4 * W; i++) { const p = bp[1 + r.int(5)]; clump(leaves, r, p.clone().add(V3(r.pm(0.2), 0.1, 0)), 0.12, { cards: 2, C: p, Rn: V3(0.2, 0.2, 0.2), flat: 0.5, sphere: 0.6, tint: [0.8, 1, 0.7] }); }
      const g = K.group(meshOf(bough, bm), meshOf(vines, vm, { cast: true }), meshOf(leaves, lm));
      if (bulbs.i.length) g.add(meshOf(bulbs, glowMat('vinebulb' + v, { params: { color: 0xffffff, roughness: 0.3 }, fx: Object.assign({ vglow: 2.2, pulse: 0.45, pulseSpeed: 2.0 }, wind) }), { cast: false }));
      const out = K.merge(g);
      if (v) out.add(motes({ n: 10 * W, r: 0.5 * W, h: 2.0, y0: 0.3, color: v === 1 ? '#7affe0' : '#ff9af0', size: 3.5, speed: 0.06, swirl: 0.15, seed: 41 + v }));
      return out;
    },
  });

  // =====================================================================================================
  // cliff_waterfall (2×3, solid) — stacked rock strata, water sheet falling into a plunge pool, mist & foam
  // footprint: x −1..1, z −1.5..1.5; the cliff stands on the north rows, the pool fills the south row.
  // =====================================================================================================
  function streakTex() {
    return tex('waterstreak', 128, 256, (g, w, h) => {
      const r = RNG(131);
      g.fillStyle = 'rgba(150,200,230,0.55)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const x = r() * w, y = r() * h, L = 30 + r() * 140, wd = 1 + r() * 4;
        g.strokeStyle = r() < 0.6 ? `rgba(255,255,255,${0.35 + r() * 0.5})` : `rgba(90,150,200,${0.3 + r() * 0.3})`;
        g.lineWidth = wd;
        for (const dy of [-h, 0, h]) for (const dx of [-w, 0, w]) { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + r.pm(1), y + dy + L); g.stroke(); }
      }
    }, { wrap: true });
  }
  // scrolling-uv water material (v flows toward +v at `flow` repeats/s); emissive keeps falling water bright
  function flowMat(key, map, flow, params = {}) {
    return cmat('flow_' + key, () => {
      const m = G.R3M.env(Object.assign({ map, transparent: true, depthWrite: false, roughness: 0.15, metalness: 0, color: 0xffffff, emissive: 0x6aa8c8, emissiveIntensity: 0.35, side: T.DoubleSide, vertexColors: true }, params));
      const U = { uFlow: { value: flow } };
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = function (sh, rr) {
        if (prev) prev.call(this, sh, rr);
        Object.assign(sh.uniforms, U, { uWT: Wind.uniforms.uWT });
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uWT, uFlow;')
          .replace('#include <map_fragment>', `#ifdef USE_MAP
            vec2 fuv = vMapUv - vec2(0.0, uWT * uFlow);
            vec4 sampledDiffuseColor = texture2D(map, fuv) * 0.6 + texture2D(map, fuv * vec2(1.7, 0.8) - vec2(0.31, uWT * uFlow * 0.4)) * 0.4;
            diffuseColor *= sampledDiffuseColor;
          #endif`);
      };
      const pk = m.customProgramCacheKey;
      m.customProgramCacheKey = function () { return (pk ? pk.call(this) : '') + '|flow'; };
      return m;
    });
  }
  function foamTex() {
    return tex('foamring', 256, 256, (g, w) => {
      const r = RNG(133);
      for (let i = 0; i < 260; i++) {
        const a = r() * TAU, d = w * (0.18 + r() * 0.3);
        g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`;
        g.beginPath(); g.ellipse(w / 2 + cos(a) * d, w / 2 + sin(a) * d, 3 + r() * 9, 2 + r() * 5, a, 0, TAU); g.fill();
      }
    });
  }
  G.Models.define('cliff_waterfall', {
    variants: 3,
    occluder: true,
    update(node, o, t) {
      Wind.tick(t);
      const f = node.getObjectByName('foam'); if (f) f.rotation.y = t * 0.25;
      const f2 = node.getObjectByName('foam2'); if (f2) f2.rotation.y = -t * 0.18;
    },
    lights(o) { return [{ x: 0, y: 0.4, z: 0.9, color: '#a8e0ff', intensity: 0.6, distance: 3.5, flicker: 0.05 }]; },
    build(o, K) {
      const v = o.v || 0, r = RNG(3700 + v * 5);
      const rock = new Acc(), green = new Acc();
      const tint = [[0.9, 0.9, 0.92], [0.98, 0.92, 0.84], [0.82, 0.92, 0.9]][v];
      const TOPY = 4.0, FACEZ = 0.05;
      // strata: rows of chunky boulders forming the cliff body (darker & wetter low down)
      for (let row = 0; row < 5; row++) {
        const y = 0.35 + row * 0.82;
        let x = -1.25 + r() * 0.15;
        while (x < 1.25) {
          const bw = 0.42 + r() * 0.25;
          const k = row / 4;
          const zf = FACEZ - 0.35 + r.pm(0.12) - row * 0.03;
          boulder(rock, V3(x + bw / 2, y, zf - 0.55), { r: [bw * 0.62, 0.5 + r() * 0.1, 1.0], seed: row * 13 + x * 7 + v * 31, noise: 0.22, detail: 2, facet: 0.75, base: 0.9, tint: tint.map((c) => c * lerp(0.7, 1, k)), moss: { k: lerp(0.9, 0.6, k), col: [0.28, 0.48, 0.2] } });
          x += bw * 0.9;
        }
      }
      // plunge-pool rim stones
      for (let i = 0; i < 9; i++) {
        const a = PI * (i / 8), p = V3(cos(a) * 0.95, 0.05, 0.75 + sin(a) * 0.65);
        boulder(rock, p, { r: [0.22 + r() * 0.1, 0.16, 0.2], seed: 200 + i + v * 9, noise: 0.3, detail: 1, facet: 0.7, moss: MOSS });
      }
      // top: mossy crown + grassy clumps
      const lm = leafMat('falltop' + v, leafAtlas('bush0', { seed: 101, shape: 'oval', n: 90, L: 26, W: 11, dark: '#1f4a2a', mid: '#336c36', light: '#559845', hi: '#a8d470' }), { height: 5, strength: 0.05, flex: 2 });
      for (let i = 0; i < 9; i++) {
        const c = V3(r.pm(1.1), TOPY + 0.15, -0.8 + r.pm(0.55));
        if (abs(c.x) < 0.3 && c.z > -0.6) c.x += c.x < 0 ? -0.35 : 0.35;
        clump(green, r, c, 0.3 + r() * 0.15, { cards: 6, C: c.clone().add(V3(0, -0.3, 0)), Rn: V3(0.4, 0.3, 0.4), sphere: 0.6, flat: 0.3 });
      }
      // ferns tucked into ledges
      for (let i = 0; i < 6; i++) { const c = V3(r.pm(1.05), 0.9 + r() * 2.6, FACEZ - 0.1); if (abs(c.x) < 0.45) continue; clump(green, r, c, 0.2, { cards: 4, C: c.clone().add(V3(0, 0, -0.3)), Rn: V3(0.3, 0.3, 0.3), sphere: 0.5 }); }
      // water: a stream on top, the falling sheet (two layers at different speeds), pool surface
      const st = streakTex();
      const fallA = flowMat('fallA', st, 1.25), fallB = flowMat('fallB', st, 0.8, { opacity: 0.7, emissiveIntensity: 0.5 });
      const sheet = new Acc(), sheet2 = new Acc();
      const fpts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10; fpts.push(V3(0, lerp(TOPY + 0.05, 0.06, t), lerp(-0.85, FACEZ + 0.32, sstep(0, 0.25, t)) + t * 0.15)); }
      ribbon(sheet, fpts, fpts.map((_, i) => 0.3 + i * 0.012), { up: V3(0, 0, 1), keepSide: true, v0: 0, v1: 2.4, ao: (p, t) => [lerp(1.2, 0.95, t), lerp(1.2, 1, t), lerp(1.2, 1.05, t)] });
      ribbon(sheet2, fpts.map((p) => p.clone().add(V3(0, 0, 0.05))), fpts.map((_, i) => 0.22 + i * 0.015), { up: V3(0, 0, 1), keepSide: true, u0: 0.2, u1: 0.8, v0: 0, v1: 1.6 });
      const stream = [];
      for (let i = 0; i <= 4; i++) stream.push(V3(sin(i) * 0.05, TOPY + 0.07, lerp(-1.5, -0.85, i / 4)));
      ribbon(sheet, stream, stream.map(() => 0.28), { v0: -1, v1: 0 });
      const poolM = cmat('pool', () => G.R3M.env({ color: 0x2a6a7a, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, depthWrite: false, envMapIntensity: 1.2, cutout: false }));
      const pg = new T.CircleGeometry(0.95, 24); pg.rotateX(-PI / 2); pg.scale(1, 1, 0.75); pg.translate(0, 0.07, 0.78);
      const g = K.group(meshOf(rock, rockMat('granite')), meshOf(green, lm));
      const out = K.merge(g);
      const pool = new T.Mesh(pg, poolM); pool.receiveShadow = true; pool.castShadow = false; pool.renderOrder = 2;
      const sA = meshOf(sheet, fallA, { cast: false }), sB = meshOf(sheet2, fallB, { cast: false });
      sA.renderOrder = 3; sB.renderOrder = 3;
      out.add(pool, sA, sB);
      // spinning foam rings where the water lands
      const fm = cmat('foam', () => new T.MeshBasicMaterial({ map: foamTex(), transparent: true, depthWrite: false, opacity: 0.85 }));
      for (const [nm, s2] of [['foam', 1], ['foam2', 0.65]]) {
        const fg = new T.CircleGeometry(0.55 * s2, 20); fg.rotateX(-PI / 2);
        const f = new T.Mesh(fg, fm); f.name = nm; f.position.set(0, 0.09 + s2 * 0.01, FACEZ + 0.5); f.renderOrder = 3; f.castShadow = false;
        out.add(f);
      }
      out.add(motes({ n: 26, r: 0.45, h: 1.6, y0: 0, color: '#eaf6ff', size: 18, speed: 0.12, swirl: 0.2, seed: 51 + v, blend: 'normal', mist: true }).translateZ(FACEZ + 0.45));
      return out;
    },
  });

  // =====================================================================================================
  // sea_of_clouds 雲海 (4×2, walk-through visual) — billowing puffs with warm tops, cool undersides + drifting mist
  // =====================================================================================================
  G.Models.define('sea_of_clouds', {
    variants: 3,
    occluder: false,
    key: (o) => (o.w || 4) + 'x' + (o.h || 2),
    update(node, o, t) { Wind.tick(t); },
    build(o, K) {
      const v = o.v || 0, r = RNG(3800 + v * 9);
      const W = o.w || 4, D = o.h || 2;
      const m = cmat('cloud' + v, () => {
        const mm = G.R3M.env({ color: 0xffffff, vertexColors: true, roughness: 1, cutout: false });
        return Wind.windify(mm, { height: 2, strength: 0.0, billow: 0.07, vglow: 0.1, var: [0.03, 0.03, 0.03], trans: 0.5, transColor: 0xfff0e0 });
      });
      const acc = new Acc();
      const warm = [[0.95, 0.9, 0.84], [0.95, 0.84, 0.8], [0.92, 0.92, 0.95]][v], cool = [[0.45, 0.5, 0.72], [0.52, 0.46, 0.7], [0.48, 0.56, 0.7]][v];
      const n = Math.round(W * D * 3.4);
      for (let i = 0; i < n; i++) {
        const x = r.pm(W / 2 - 0.3), z = r.pm(D / 2 - 0.25);
        const edge = max(abs(x) / (W / 2), abs(z) / (D / 2));
        const R0 = (0.42 + r() * 0.42) * (1 - edge * 0.35);
        const y = 0.15 + r() * 0.45 * (1 - edge) + R0 * 0.25;
        const g = new T.IcosahedronGeometry(1, 2), P = g.attributes.position, N = g.attributes.normal;
        const b0 = acc.count;
        for (let k = 0; k < P.count; k++) {
          let px = P.getX(k), py = P.getY(k), pz = P.getZ(k);
          const bump = 1 + n3(px * 1.6 + i, py * 1.6, pz * 1.6) * 0.12;
          py = py < -0.2 ? -0.2 + (py + 0.2) * 0.3 : py; // flat-ish underside
          const ny = N.getY(k);
          const u = sstep(-0.6, 0.8, ny);
          const c = [lerp(cool[0], warm[0], u), lerp(cool[1], warm[1], u), lerp(cool[2], warm[2], u)];
          acc.v(x + px * R0 * 1.25 * bump, y + py * R0 * 0.8 * bump, z + pz * R0 * bump, N.getX(k), ny, N.getZ(k), 0, 0, c[0], c[1], c[2]);
        }
        const ix = g.index ? g.index.array : [...Array(P.count).keys()];
        for (let k = 0; k < ix.length; k += 3) acc.tri(b0 + ix[k], b0 + ix[k + 1], b0 + ix[k + 2]);
        g.dispose();
      }
      const out = K.merge(K.group(meshOf(acc, m, { cast: false })));
      out.add(motes({ n: Math.round(W * D * 3), r: max(W, D) * 0.5, h: 0.9, y0: 0.2, color: '#ffffff', size: 40, speed: 0.03, swirl: 0.5, seed: 61 + v, blend: 'normal', mist: true }));
      return out;
    },
  });

  // =====================================================================================================
  // GRASS CARPET — instanced blade clumps over grass tiles of a map view (with wind, player push, distance fade)
  // =====================================================================================================
  const GRASS_TILES = { grass: [1, 1, 1], grass_dark: [0.72, 0.85, 0.75], flowers_ground: [1.05, 1.02, 0.9] };
  function grassClumpGeo(r, nBlades, h0) {
    const acc = new Acc();
    for (let i = 0; i < nBlades; i++) {
      const a = r() * TAU, d = r() * 0.08;
      blade(acc, V3(cos(a) * d, -0.02, sin(a) * d), a + r.pm(1), h0 * (0.6 + r() * 0.6), 0.2 + r() * 0.45, 0.034, 2, C('#4a8a2e'), C(r() < 0.3 ? '#c8e07a' : '#9ad25a'));
    }
    return acc.build();
  }
  Nature.scatterGrass = function (view) {
    const q = G.settings.quality || 'high';
    if (q === 'low' || (G.R3 && G.R3.lite && !Nature.forceGrass)) return null;
    const ms = view.ms, Wm = ms.w, Hm = ms.h;
    const per = q === 'ultra' ? 22 : q === 'medium' ? 8 : 14; // clumps per tile
    // tiles blocked by solid objects
    const blocked = new Uint8Array(Wm * Hm);
    for (const o of ms.objects || []) {
      const d = G.Objects.get(o.t); if (!d) continue;
      const w = o.w || d.w, h = o.h || d.h;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const solid = d.solidAt ? d.solidAt(o, dx, dy) : d.solid;
        if (solid || d.w > 1) { const x = o.x + dx, y = o.y + dy; if (x >= 0 && y >= 0 && x < Wm && y < Hm) blocked[y * Wm + x] = 1; }
      }
    }
    const isG = (x, y) => x >= 0 && y >= 0 && x < Wm && y < Hm && GRASS_TILES[ms.terrain[y * Wm + x]];
    const r = RNG(ms.def && ms.def.id ? ms.def.id.length * 977 : 7);
    const geo = grassClumpGeo(RNG(5), 8, 0.3);
    const mat = cmat('grass_carpet', () => {
      const m = G.R3M.env({ color: 0xffffff, vertexColors: true, side: T.DoubleSide, roughness: 0.9, cutout: false });
      return Wind.windify(m, { grass: true, height: 0.3, strength: 0.08, flex: 1.5, flutter: 0.006, trans: 0.45, var: [0.1, 0.08, 0.05] });
    });
    const flowerGeo = (() => { const a = new Acc(); const rr = RNG(9); for (let i = 0; i < 3; i++) { const p = V3(rr.pm(0.06), 0.16 + rr() * 0.08, rr.pm(0.06)); flowerHead(a, p, 0.03, rr.int(4), V3(rr.pm(1), 0, rr.pm(1))); } return a.build(); })();
    const fmat = cmat('grass_flowers', () => Wind.windify(G.R3M.env({ map: flowerTex(), alphaTest: 0.4, side: T.DoubleSide, vertexColors: true, roughness: 0.6, cutout: false }), { grass: true, height: 0.25, strength: 0.06, flex: 1.2 }));
    const group = new T.Group(); group.name = 'grassCarpet';
    const CHK = 8, m4 = new T.Matrix4(), qt = new T.Quaternion(), sc = V3(), ps = V3(), col = new T.Color();
    const chunks = [];
    for (let cy = 0; cy < Hm; cy += CHK) for (let cx = 0; cx < Wm; cx += CHK) {
      const mats = [], cols = [], fl = [];
      for (let y = cy; y < min(Hm, cy + CHK); y++) for (let x = cx; x < min(Wm, cx + CHK); x++) {
        const tint = isG(x, y);
        if (!tint || blocked[y * Wm + x]) continue;
        // keep a little margin from non-grass neighbours (paths, water banks) so blades don't poke into them
        const edgeN = !isG(x - 1, y) || !isG(x + 1, y) || !isG(x, y - 1) || !isG(x, y + 1);
        const n = edgeN ? floor(per * 0.45) : per;
        for (let k = 0; k < n; k++) {
          const px = x + (edgeN ? 0.2 + r() * 0.6 : r()), pz = y + (edgeN ? 0.2 + r() * 0.6 : r());
          qt.setFromAxisAngle(V3(0, 1, 0), r() * TAU);
          const s2 = 0.75 + r() * 0.5;
          sc.set(s2, s2 * (0.8 + r() * 0.5), s2);
          mats.push(m4.compose(ps.set(px, 0, pz), qt, sc).clone());
          cols.push(col.setRGB(tint[0] * (0.85 + r() * 0.3), tint[1] * (0.85 + r() * 0.3), tint[2] * (0.9 + r() * 0.2)).clone());
          if (ms.terrain[y * Wm + x] === 'flowers_ground' && r() < 0.35) fl.push(m4.clone());
        }
      }
      if (!mats.length) continue;
      const im = new T.InstancedMesh(geo, mat, mats.length);
      mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cols[i]); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = false; im.receiveShadow = true;
      im.userData.centre = V3(cx + CHK / 2, 0, cy + CHK / 2);
      group.add(im); chunks.push(im);
      if (fl.length) {
        const fm = new T.InstancedMesh(flowerGeo, fmat, fl.length);
        fl.forEach((mm, i) => fm.setMatrixAt(i, mm));
        fm.instanceMatrix.needsUpdate = true; fm.computeBoundingSphere();
        fm.castShadow = false; fm.userData.centre = im.userData.centre;
        group.add(fm); chunks.push(fm);
      }
    }
    // keep shared uniforms fresh even if nobody calls Nature.update (any visible chunk triggers it)
    const U = Nature.grassU;
    const sync = (renderer, scene, camera) => { U.uCamPos.value.copy(camera.position); const P = ms.player; if (P) U.uPlayer.value.set(P.px / G.TILE, 0, (P.py + 8) / G.TILE); };
    for (const c of chunks) c.onBeforeRender = sync;
    U.uGrassFar.value = q === 'ultra' ? 34 : 26;
    view.scene.add(group);
    const handle = {
      group, chunks,
      update(v2) {
        const cam = (v2 || view).camera; if (!cam) return;
        const far = U.uGrassFar.value + CHK;
        const tgt = (v2 || view).camTarget || cam.position;
        for (const c of chunks) c.visible = Math.hypot(c.userData.centre.x - tgt.x, c.userData.centre.z - tgt.z) < far;
      },
      dispose() { view.scene.remove(group); for (const c of chunks) c.dispose(); },
    };
    Nature._grass = handle;
    return handle;
  };
  // optional per-frame hook (wind + grass culling) for the lead / Env3D
  Nature.update = function (view, dt) {
    Wind.update(dt);
    if (Nature._grass && Nature._grass.group.parent === view.scene) Nature._grass.update(view);
  };
})();

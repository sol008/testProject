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
    time: 0, driven: 0,
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
  //         transColor, grass: bool (instanced blades: whole height bends, bend uses instance origin) }
  Wind.windify = function (mat, opts = {}) {
    if (mat.userData.wind) { Object.assign(mat.userData.wind, opts); return mat; }
    const o = Object.assign({ strength: 0.12, height: 4, flex: 2, flutter: 0, radial: 0, var: [0.08, 0.08, 0.05], trans: 0, transColor: 0xd8ff8a, push: 0 }, opts);
    mat.userData.wind = o;
    const U = {
      uWS: { value: o.strength }, uWH: { value: o.height }, uWFx: { value: o.flex }, uWFl: { value: o.flutter }, uWRad: { value: o.radial },
      uVar: { value: new T.Vector3(o.var[0], o.var[1], o.var[2]) }, uTrans: { value: o.trans }, uTransCol: { value: new T.Color(o.transColor) },
    };
    mat.userData.windU = U;
    const prev = mat.onBeforeCompile;
    const inst = !!o.grass;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, Wind.uniforms, U, inst ? Nature.grassU : {});
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uWT, uWGust, uWAmp, uWS, uWH, uWFx, uWFl, uWRad; uniform vec3 uWDir;
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
            float hy = max(transformed.y, 0.0);
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
            // keep branch length roughly constant: dip a little when bent
            disp.y -= dot(disp.xz, disp.xz) * 0.35 / max(hy, 0.6);
            transformed += disp;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uVar; uniform float uTrans; uniform vec3 uTransCol; varying float vNVar; varying float vNH;`)
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
    };
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|wind' + (inst ? 'G' : ''); };
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
      const k = 9;
      for (let i = 0; i < k; i++) {
        const a = (i / (k - 1) - 0.5) * 1.3;
        g.strokeStyle = i % 3 === 0 ? tip : base; g.lineWidth = 2.6;
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
  function defTree(id, def) {
    G.Models.define(id, Object.assign({
      variants: 3,
      occluder: true,
      update(node, o, t) { Wind.tick(t); },
    }, def));
  }

  const BARKS = {
    camphor: { seed: 21, style: 'furrow', dark: '#4e3c2c', mid: '#6e5842', light: '#937a5e', hi: '#bea684', line: '#241a12', moss: '#5f7a34', vfreq: 2 },
    grey: { seed: 23, style: 'smooth', dark: '#625d54', mid: '#857f72', light: '#a8a090', hi: '#cfc6b2', line: '#3a362e', moss: '#6a8a3a' },
    cherry: { seed: 25, style: 'lenticel', dark: '#55302a', mid: '#764438', light: '#98604e', hi: '#c08a74', line: '#2c1612', vfreq: 1.5 },
  };

  defTree('tree_camphor', {
    build: (o, K) => broadleaf(o, K, {
      id: 'tree_camphor', seed: 101, H: 5.2, forkY: 0.36, r0: 0.24, cy: 0.66, rx: 1.75, ry: 0.36, limbs: 4, clusters: 17, rc: 0.85, cards: 15,
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
      id: 'tree_maple', seed: 202, H: 4.5, forkY: 0.34, r0: 0.17, cy: 0.66, rx: 1.45, ry: 0.36, limbs: 4, clusters: 28, rc: 0.52, cards: 10, upPull: 0.08,
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
      id: 'tree_sakura', seed: 303, H: 4.2, forkY: 0.3, r0: 0.16, cy: 0.64, rx: 1.6, ry: 0.32, limbs: 5, clusters: 30, rc: 0.5, cards: 10, upPull: 0.0, bottom: 0.4,
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
})();

// Shared 3D materials: toon ramps, stylised-PBR environment materials, inverted-hull outlines,
// canvas textures, and the screen-space "see-through" cutout that keeps the player visible behind walls.
'use strict';
G.R3M = (() => {
  const M = {};
  const T = () => window.THREE;

  // ---------------------------------------------------------------- shared uniforms
  // Updated once per frame by the active view (see Map3D.updateCutout).
  M.cut = null;
  M.cutUniforms = function () {
    if (M.cut) return M.cut;
    const THREE = T();
    M.cut = {
      uCutOn: { value: 0 },
      uCutCenter: { value: new THREE.Vector2(0.5, 0.5) }, // screen uv of the protected point (player chest)
      uCutDepth: { value: 10 }, // view-space depth of that point
      uCutRadius: { value: 0.12 }, // radius in screen-height units
      uResolution: { value: new THREE.Vector2(1280, 720) },
      uTime: { value: 0 },
      uCutFoliage: { value: 2.6 }, // radius multiplier for foliage materials (mat.userData.foliage): canopy fade
    };
    return M.cut;
  };

  // Patch a built-in material so fragments in front of the player, inside a screen-space circle around
  // him, dissolve with an ordered dither (industry-standard occluder cutout; depth/shadow passes unaffected).
  // Foliage (mat.userData.foliage, set by nature.js leaf materials — read at compile time, so it may be set after
  // this call) uses a larger hole (uCutFoliage × radius) so closed canopies of dense forests don't hide the player.
  M.addCutout = function (mat) {
    if (mat.userData.cutout) return mat;
    const U = M.cutUniforms();
    mat.userData.cutout = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, U);
      const self = this && this.isMaterial ? this : mat;
      sh.uniforms.uCutIsFol = { value: self.userData.foliage ? 1 : 0 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vCutZ;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCutZ = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vCutZ; uniform float uCutOn, uCutDepth, uCutRadius, uCutFoliage, uCutIsFol; uniform vec2 uCutCenter, uResolution;
          float cutBayer(vec2 p){ vec2 q = mod(floor(p), 4.0); int i = int(q.x + q.y * 4.0);
            float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
            for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0; return 0.5; }`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (uCutOn > 0.5 && vCutZ < uCutDepth - 0.75) {
            vec2 suv = gl_FragCoord.xy / uResolution;
            vec2 d = (suv - uCutCenter) * vec2(uResolution.x / uResolution.y, 1.0);
            float r = length(d) / (uCutRadius * mix(1.0, uCutFoliage, uCutIsFol));
            // walls/props: 12 % dither residue in the core; foliage: clear core + half-dissolved ring (canopy fade)
            float keep = uCutIsFol > 0.5 ? 0.5 * smoothstep(0.3, 0.6, r) + 0.5 * smoothstep(0.78, 1.0, r) : 0.12 + 0.88 * smoothstep(0.55, 1.0, r);
            if (r < 1.0 && cutBayer(gl_FragCoord.xy) > keep) discard;
          }`);
    };
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|cut'; };
    return mat;
  };

  // ---------------------------------------------------------------- textures
  const texCache = new Map();
  // canvas → texture (colour textures are sRGB). opts: { repeat:[x,y], wrap:true, nearest, srgb:false, anisotropy }
  M.canvasTex = function (canvas, opts = {}) {
    const THREE = T();
    const tx = new THREE.CanvasTexture(canvas);
    tx.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    if (opts.wrap || opts.repeat) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; }
    if (opts.repeat) tx.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (opts.nearest) { tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false; }
    tx.anisotropy = opts.anisotropy || (G.R3.renderer ? Math.min(8, G.R3.renderer.capabilities.getMaxAnisotropy()) : 1);
    tx.needsUpdate = true;
    return tx;
  };
  // cached procedural texture: key → paint(ctx, w, h) once
  M.tex = function (key, w, h, paint, opts) {
    if (texCache.has(key)) return texCache.get(key);
    const c = G.U.makeCanvas(w, h, 1);
    paint(c.getContext('2d'), w, h);
    const tx = M.canvasTex(c, opts);
    tx.shared = true;
    texCache.set(key, tx);
    return tx;
  };

  // soft radial glow (for light halos, particles, lantern bloom cards)
  M.glowTex = function () {
    return M.tex('glow', 128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
  };
  // soft blob shadow (cheap contact shadow under characters, complements shadow maps)
  M.blobTex = function () {
    return M.tex('blob', 64, 64, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    });
  };

  // ---------------------------------------------------------------- toon
  const ramps = {};
  // N-band light ramp for MeshToonMaterial. soft=true gives slightly feathered band edges.
  M.ramp = function (bands = 3, soft = true) {
    const key = bands + (soft ? 's' : 'h');
    if (ramps[key]) return ramps[key];
    const THREE = T();
    const n = 64, data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      let v;
      if (bands === 2) v = soft ? 0.42 + 0.58 * smooth(0.46, 0.54, x) : (x < 0.5 ? 0.42 : 1);
      else v = soft ? 0.32 + 0.33 * smooth(0.28, 0.36, x) + 0.35 * smooth(0.62, 0.7, x) : (x < 0.33 ? 0.32 : x < 0.66 ? 0.65 : 1);
      const b = Math.round(v * 255);
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
    }
    const tx = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
    tx.magFilter = THREE.LinearFilter; tx.minFilter = THREE.LinearFilter; tx.generateMipmaps = false;
    tx.needsUpdate = true; tx.shared = true;
    ramps[key] = tx;
    return tx;
  };
  function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // Toon material with fresnel rim light. opts: { color, map, emissive, emissiveIntensity, rim (0..1), rimColor, bands,
  // transparent, opacity, side, alphaTest }
  M.toon = function (opts = {}) {
    const THREE = T();
    const mat = new THREE.MeshToonMaterial({
      color: opts.color != null ? opts.color : 0xffffff, map: opts.map || null, gradientMap: M.ramp(opts.bands || 3),
      emissive: opts.emissive != null ? opts.emissive : 0x000000, emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 1,
      transparent: !!opts.transparent, opacity: opts.opacity != null ? opts.opacity : 1, side: opts.side || THREE.FrontSide,
      alphaTest: opts.alphaTest || 0,
    });
    const rim = opts.rim != null ? opts.rim : 0.35;
    if (rim > 0) {
      const rc = new THREE.Color(opts.rimColor || 0xfff2dc);
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uRim = { value: rim }; sh.uniforms.uRimColor = { value: rc };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor;')
          .replace('#include <opaque_fragment>', `
            { float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
              float rimK = smoothstep(0.62, 0.78, fr) * uRim;
              outgoingLight += uRimColor * rimK * (0.35 + 0.65 * clamp(dot(outgoingLight, vec3(0.333)), 0.0, 1.0)); }
            #include <opaque_fragment>`);
      };
      mat.customProgramCacheKey = () => 'toonrim';
    }
    return mat;
  };

  // Inverted-hull outline. Returns a mesh to add as a child of `mesh` (shares geometry; works for SkinnedMesh too).
  M.outline = function (mesh, opts = {}) {
    const THREE = T();
    const mat = new THREE.MeshBasicMaterial({ color: opts.color != null ? opts.color : 0x1a1210, side: THREE.BackSide });
    const w = opts.width != null ? opts.width : 0.012;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uOW = { value: w };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uOW;')
        // expand along the normal in view space, scaled with distance so the line keeps a stable screen width
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec3 on = normalize(normalMatrix * objectNormal);
          float dz = max(0.5, -mvPosition.z) * 0.08;
          mvPosition.xyz += on * uOW * dz * 12.0;
          gl_Position = projectionMatrix * mvPosition;`);
    };
    mat.customProgramCacheKey = () => 'outline';
    let o;
    if (mesh.isSkinnedMesh) {
      o = new THREE.SkinnedMesh(mesh.geometry, mat);
      o.bind(mesh.skeleton, mesh.bindMatrix);
    } else o = new THREE.Mesh(mesh.geometry, mat);
    o.castShadow = false; o.receiveShadow = false;
    o.userData.outline = true;
    o.renderOrder = -1;
    return o;
  };

  // Stylised environment material (lit, shadows, cutout-able). opts: MeshStandardMaterial params + cutout:boolean
  M.env = function (opts = {}) {
    const THREE = T();
    const p = Object.assign({ roughness: 0.85, metalness: 0 }, opts);
    const cut = p.cutout !== false; delete p.cutout;
    const mat = new THREE.MeshStandardMaterial(p);
    if (cut) M.addCutout(mat);
    return mat;
  };

  M.dispose = function () {
    for (const tx of texCache.values()) tx.dispose();
    texCache.clear();
  };
  return M;
})();

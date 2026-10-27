// 3D rendering core: WebGL canvas under the 2D UI canvas, post-processing chain, quality settings.
// World units: 1 unit = 1 map tile (≈1 m). +x east, +z south, +y up. Tile (cx, cy) centre = (cx + 0.5, 0, cy + 0.5).
'use strict';
G.R3 = (() => {
  const R = {};
  let renderer = null, composer = null, renderPass = null, bloomPass = null, gradePass = null, smaaPass = null, gtaoPass = null;
  let canvas3 = null;
  R.ok = false;
  R.view = null; // current view: { scene, camera, update(dt), onRender? }

  R.supported = function () {
    try {
      const c = document.createElement('canvas');
      return !!(window.THREE && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  };
  R.enabled = () => R.ok && G.settings.render3d !== false;

  // colour grading / vignette / psychedelic warp, applied before tone mapping output
  const GradeShader = {
    uniforms: {
      tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.35 }, warp: { value: 0 },
      hue: { value: 0 }, sat: { value: 1.05 }, lift: { value: new THREE_FALLBACK_V3() }, tint: { value: new THREE_FALLBACK_V3(1, 1, 1) },
      fade: { value: 0 }, fadeColor: { value: new THREE_FALLBACK_V3() }, aspect: { value: 16 / 9 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float time, vignette, warp, hue, sat, fade, aspect;
      uniform vec3 lift, tint, fadeColor; varying vec2 vUv;
      vec3 hueShift(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a); return c*ca + cross(k,c)*sin(a) + k*dot(k,c)*(1.0-ca); }
      void main(){
        vec2 uv = vUv;
        if (warp > 0.0) {
          vec2 p = uv - 0.5; float r = length(p * vec2(aspect, 1.0));
          uv += warp * 0.006 * vec2(sin(uv.y * 24.0 + time * 1.7), cos(uv.x * 20.0 + time * 1.3));
          uv += p * warp * 0.012 * sin(time * 0.9 + r * 6.0);
        }
        vec4 col = texture2D(tDiffuse, uv);
        if (warp > 0.0) {
          // chromatic split + slow hue breathing
          float s = warp * 0.004;
          col.r = texture2D(tDiffuse, uv + vec2(s, 0.0)).r;
          col.b = texture2D(tDiffuse, uv - vec2(s, 0.0)).b;
          col.rgb = mix(col.rgb, hueShift(col.rgb, time * 0.6 + length(uv - 0.5) * 4.0), warp * 0.45);
        }
        col.rgb = hueShift(col.rgb, hue);
        float l = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        col.rgb = mix(vec3(l), col.rgb, sat);
        col.rgb = col.rgb * tint + lift;
        vec2 q = (vUv - 0.5) * vec2(aspect, 1.0);
        col.rgb *= 1.0 - vignette * smoothstep(0.35, 1.05, length(q));
        col.rgb = mix(col.rgb, fadeColor, fade);
        gl_FragColor = col;
      }`,
  };
  function THREE_FALLBACK_V3(x = 0, y = 0, z = 0) { return window.THREE ? new THREE.Vector3(x, y, z) : { x, y, z }; }

  R.init = function () {
    if (!R.supported() || G.settings.render3d === false) { R.ok = false; return false; }
    const T = THREE;
    canvas3 = document.createElement('canvas');
    canvas3.id = 'game3d';
    const wrap = document.getElementById('wrap');
    wrap.insertBefore(canvas3, G.canvas);
    canvas3.style.position = 'absolute';
    G.canvas.style.position = 'absolute';
    G.canvas.style.background = 'transparent';
    renderer = new T.WebGLRenderer({ canvas: canvas3, antialias: false, powerPreference: 'high-performance', alpha: false });
    renderer.setPixelRatio(R.pixelRatio());
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    R.renderer = renderer;
    R.buildComposer();
    R.resize();
    window.addEventListener('resize', R.resize);
    R.ok = true;
    return true;
  };

  R.pixelRatio = function () {
    const q = G.settings.quality || 'high';
    const dpr = window.devicePixelRatio || 1;
    return q === 'low' ? 1 : Math.min(dpr, q === 'ultra' ? 2 : 1.5);
  };

  R.buildComposer = function () {
    const T = THREE;
    const q = G.settings.quality || 'high';
    const dummyScene = new T.Scene();
    const dummyCam = new T.PerspectiveCamera();
    composer = new T.EffectComposer(renderer);
    renderPass = new T.RenderPass(dummyScene, dummyCam);
    composer.addPass(renderPass);
    if (q === 'ultra' && T.GTAOPass) {
      gtaoPass = new T.GTAOPass(dummyScene, dummyCam, 1280, 720);
      gtaoPass.output = T.GTAOPass.OUTPUT.Default;
      composer.addPass(gtaoPass);
    }
    bloomPass = new T.UnrealBloomPass(new T.Vector2(1280, 720), 0.55, 0.6, 0.82);
    composer.addPass(bloomPass);
    gradePass = new T.ShaderPass(GradeShader);
    gradePass.uniforms.lift.value = new T.Vector3(0, 0, 0);
    gradePass.uniforms.tint.value = new T.Vector3(1, 1, 1);
    gradePass.uniforms.fadeColor.value = new T.Vector3(0, 0, 0);
    composer.addPass(gradePass);
    composer.addPass(new T.OutputPass());
    if (q !== 'low') { smaaPass = new T.SMAAPass(1280, 720); composer.addPass(smaaPass); }
    R.composer = composer; R.bloom = bloomPass; R.grade = gradePass;
  };

  R.resize = function () {
    if (!renderer) return;
    const fit = Math.min(window.innerWidth / G.W, window.innerHeight / G.H);
    const w = Math.floor(G.W * fit), h = Math.floor(G.H * fit);
    canvas3.style.width = w + 'px'; canvas3.style.height = h + 'px';
    renderer.setPixelRatio(R.pixelRatio());
    renderer.setSize(w, h, false);
    composer.setPixelRatio(R.pixelRatio());
    composer.setSize(w, h);
    if (R.view && R.view.camera) { R.view.camera.aspect = G.W / G.H; R.view.camera.updateProjectionMatrix(); }
  };

  R.setView = function (view) {
    R.view = view;
    if (!view) return;
    renderPass.scene = view.scene; renderPass.camera = view.camera;
    if (gtaoPass) { gtaoPass.scene = view.scene; gtaoPass.camera = view.camera; }
    view.camera.aspect = G.W / G.H;
    view.camera.updateProjectionMatrix();
  };

  // render the current view; call once per frame from the active scene's draw()
  R.render = function (dt) {
    if (!R.ok || !R.view) return;
    const v = R.view;
    const g = gradePass.uniforms;
    g.time.value = G.time;
    g.aspect.value = G.W / G.H;
    const pp = v.post || {};
    g.vignette.value = pp.vignette != null ? pp.vignette : 0.38;
    g.warp.value = (pp.warp || 0) * (G.settings.visualFx == null ? 1 : G.settings.visualFx);
    g.hue.value = pp.hue || 0;
    g.sat.value = pp.sat != null ? pp.sat : 1.06;
    g.fade.value = Math.min(1, G.Render.fade.a);
    const fc = new THREE.Color(G.Render.fade.color || '#000');
    g.fadeColor.value.set(fc.r, fc.g, fc.b);
    if (pp.tint) g.tint.value.set(pp.tint[0], pp.tint[1], pp.tint[2]); else g.tint.value.set(1, 1, 1);
    bloomPass.strength = pp.bloom != null ? pp.bloom : 0.55;
    bloomPass.threshold = pp.bloomThreshold != null ? pp.bloomThreshold : 0.82;
    renderer.toneMappingExposure = pp.exposure != null ? pp.exposure : 1.0;
    if (v.beforeRender) v.beforeRender(dt);
    composer.render(dt);
  };

  // world → 2D-canvas logical coordinates (for HUD prompts, emotes, damage numbers)
  R.project = function (camera, x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * G.W, y: (-v.y * 0.5 + 0.5) * G.H, visible: v.z < 1 };
  };

  R.dispose = function (obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'alphaMap', 'gradientMap']) if (m[k] && m[k].dispose && !m[k].shared) m[k].dispose();
          m.dispose();
        }
      }
    });
  };
  return R;
})();

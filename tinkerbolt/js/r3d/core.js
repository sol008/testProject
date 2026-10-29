'use strict';
// 3D layer: a WebGL canvas under the 2D canvas. Any failure → G.R3.ok = false and the game draws its 2D fallback.
// `?r3lite` (or headless tests) = half resolution, no shadows. The 2D game is complete without this file.
(function () {
  const G = window.G;
  const R3 = (G.R3 = G.R3 || {});
  R3.ok = false;
  R3.visible = false;
  R3.view = null;      // {scene, camera, update(dt)}
  R3.frames = 0;

  R3.wanted = function () {
    const set = G.Settings && G.Settings.get('render3d');
    if (set === 'off') return false;
    if (/[?&]r3=0\b/.test(location.search)) return false;
    return true;
  };

  R3.init = function () {
    R3.lite = /[?&]r3lite\b/.test(location.search);
    if (!window.THREE) { R3.why = 'no three.js'; return; }
    if (!R3.wanted()) { R3.why = 'off in settings'; return; }
    try {
      const c = document.createElement('canvas');
      c.id = 'r3';
      const gl = c.getContext('webgl2', { antialias: !R3.lite }) || c.getContext('webgl', { antialias: !R3.lite });
      if (!gl) { R3.why = 'no WebGL'; return; }
      R3.renderer = new THREE.WebGLRenderer({ canvas: c, context: gl, antialias: !R3.lite, alpha: false });
      R3.renderer.outputEncoding = THREE.sRGBEncoding;
      R3.renderer.shadowMap.enabled = !R3.lite;
      R3.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      R3.renderer.setClearColor(0xf6e7d4, 1);
      R3.canvas = c;
      const stage = document.getElementById('stage');
      stage.insertBefore(c, stage.firstChild);
      c.style.position = 'absolute';
      c.style.display = 'none';
      R3.ok = true;
      G.Render.resize();
    } catch (e) {
      G.warnOnce('r3 init', e);
      R3.ok = false;
      R3.why = 'init failed';
    }
  };

  R3.resize = function (cw, ch) {
    if (!R3.ok) return;
    const pr = Math.min(R3.lite ? 1 : 2, window.devicePixelRatio || 1) * (R3.lite ? 0.5 : 1);
    R3.renderer.setPixelRatio(pr);
    R3.renderer.setSize(cw, ch, false);
    R3.aspect = cw / ch;
    if (R3.view && R3.view.camera) { R3.view.camera.aspect = R3.aspect; R3.view.camera.updateProjectionMatrix(); }
  };

  R3.setView = function (v) {
    R3.view = v;
    if (v && v.camera) { v.camera.aspect = R3.aspect || G.W / G.H; v.camera.updateProjectionMatrix(); }
  };
  R3.enabled = () => R3.ok && R3.wanted();
  R3.show = function (on) {
    on = !!(on && R3.enabled() && R3.view);
    if (on !== R3.visible) { R3.visible = on; if (R3.canvas) R3.canvas.style.display = on ? 'block' : 'none'; }
  };
  R3.render = function (dt) {
    if (!R3.visible || !R3.view) return;
    try {
      if (R3.view.update) R3.view.update(dt);
      R3.renderer.render(R3.view.scene, R3.view.camera);
      R3.frames++;
    } catch (e) {
      G.warnOnce('r3 render', e);
      G.lastError = e;
      R3.ok = false;
      R3.show(false);
    }
  };
  // Settings toggle: turning 3D back on needs the renderer; create it lazily.
  R3.applySetting = function () {
    if (R3.wanted() && !R3.ok && !R3.renderer) { R3.init(); if (R3.ok && G.Shop3D) G.Shop3D.ensure(); }
    if (!R3.wanted()) R3.show(false);
  };
})();

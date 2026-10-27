// Boot & main loop
'use strict';
(function () {
  // Graceful stubs if optional modules failed to load
  if (!G.Music) G.Music = { play() {}, stop() {}, current: null, ids: () => [] };
  if (!G.Sprites) G.Sprites = null;
  if (!G.Portraits) G.Portraits = { draw() {}, has: () => false };
  if (!G.Backdrops) G.Backdrops = { draw(ctx) { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, G.W, G.H); }, has: () => false };

  let last = 0;
  let fpsAcc = 0, fpsN = 0;
  G.fps = 60;

  function frame(now) {
    requestAnimationFrame(frame);
    const dtRaw = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    const dt = Math.min(0.05, dtRaw);
    fpsAcc += dtRaw; fpsN++;
    if (fpsAcc > 1) { G.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    G.time += dt;
    try {
      G.Input.update(dt);
      G.Timers.update(dt);
      G.Tweens.update(dt);
      G.Render.updateFx(dt);
      G.UI.updateToasts(dt);
      G.Scenes.update(dt);
      if (G.state && G.inGame) G.state.playtime += dt;

      const ctx = G.ctx;
      G.Render.begin();
      // 3D scenes render to the WebGL canvas underneath; the 2D canvas then only carries UI / overlays
      const base = G.Scenes.base();
      const use3d = !!(G.R3 && G.R3.enabled() && base && (base.view3d || base.uses3d));
      if (G.R3) G.R3.show(use3d);
      if (use3d) ctx.clearRect(0, 0, G.W, G.H);
      else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H); }
      G.Scenes.draw(ctx);
      G.UI.drawToasts(ctx);
      G.Render.drawOverlays();
      if (G.debug) G.Render.text(ctx, G.fps + ' fps', 8, G.H - 26, { size: 14, color: '#8f8' });
    } catch (e) {
      console.error(e);
      G.lastError = e;
    }
    G.Input.endFrame();
  }

  async function boot() {
    G.Render.init();
    try { if (G.R3) G.R3.init(); } catch (e) { console.error('3D init failed, using 2D', e); if (G.R3) G.R3.ok = false; }
    const msg = document.getElementById('boot-msg');
    msg.textContent = '載入字型……';
    await G.loadFonts();
    msg.textContent = '準備中……';
    await G.U.sleepReal(50);
    document.getElementById('boot').classList.add('hide');
    G.Title.start();
    requestAnimationFrame(frame);
    if (G.debug) G.Debug && G.Debug.init();
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F11' || (e.code === 'Enter' && e.altKey) || (e.code === 'KeyF' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      G.Render.toggleFullscreen();
    }
  });

  window.addEventListener('load', boot);
})();

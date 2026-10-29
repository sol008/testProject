'use strict';
// Boot and main loop.
(function () {
  const G = window.G;
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = last ? (now - last) / 1000 : 0;
    last = now;
    const dt = Math.min(0.05, raw);
    try {
      G.step(dt, raw);
    } catch (e) { console.error(e); G.lastError = e; }
  }
  // One frame of game logic + drawing (tests may call this with a fixed dt).
  G.step = function (dt, raw) {
    G.time += dt;
    G.Tw.update(dt);
    G.FX.update(dt);
    G.Render.update(dt);
    G.Scenes.update(dt);
    G.PlayStats.tick(raw == null ? dt : raw);
    const base = G.Scenes.base();
    const use3d = !!(base && base.view3d && G.R3 && G.R3.enabled());
    G.R3.show(use3d);
    G.R3.render(dt);
    G.Render.begin(use3d && G.R3.visible);
    G.Scenes.draw(G.ctx);
    G.Render.drawOverlays(G.ctx);
  };

  async function loadFont() {
    if (!G.FONT_B64 || typeof FontFace === 'undefined') return;
    try {
      const bin = atob(G.FONT_B64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      const ff = new FontFace('Nunito', buf.buffer, { weight: '200 1000' });
      await Promise.race([ff.load(), new Promise((r) => setTimeout(r, 1500))]);
      document.fonts.add(ff);
    } catch (e) { G.warnOnce('font', e); }
  }

  window.addEventListener('load', async () => {
    G.Settings.load();
    G.Save.load();
    G.state.stats.sessions++;
    G.Save.save();
    G.Render.init();
    G.Input.init();
    try { G.R3.init(); } catch (e) { G.R3.ok = false; }
    await loadFont();
    G.Clay.clearCache();
    G.Scenes.reset(new G.TitleScene());
    if (G.debug) {
      const lv = G.Debug.param('level');
      if (lv) { G.Debug.levelStart(+lv); G.playLevel(+lv); }
      else if (G.Debug.param('home')) G.goHome();
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.state) G.Save.save(); });
    window.addEventListener('pagehide', () => G.Save.save());
    G.ready = true;
    requestAnimationFrame(frame);
  });
})();

'use strict';
// Title scene and the top-level navigation helpers (play a level, go home, resume a saved level).
(function () {
  const G = window.G;
  const R = G.Render, K = G.Clay, U = G.U;

  function TitleScene() { this.name = 'title'; this.opaque = true; this.t = 0; }
  G.TitleScene = TitleScene;
  TitleScene.prototype.input = function (ev) {
    if (ev.type !== 'up' && !(ev.type === 'key' && (ev.key === 'Enter' || ev.key === ' '))) return;
    if (this.t < 0.4) return;
    G.Audio.play('beep');
    if (!G.resumeSaved()) G.goHome();
  };
  TitleScene.prototype.update = function (dt) { this.t += dt; };
  TitleScene.prototype.draw = function (ctx) {
    const pal = G.CONFIG.palette;
    const g = ctx.createLinearGradient(0, 0, 0, G.H);
    g.addColorStop(0, '#fbe9d2');
    g.addColorStop(1, '#efcfa8');
    R.fill(ctx, g);
    for (let i = 0; i < 6; i++) {
      K.candy(ctx, i, null, 70 + i * 80, 120 + Math.sin(this.t * 1.5 + i) * 10, 54);
    }
    const pop = U.ease.outBack(Math.min(1, this.t / 0.6));
    R.text(ctx, 'Tinker', G.W / 2, 260, { size: 92 * pop, color: '#ff8c6b', stroke: '#fff8ee', strokeW: 14, weight: 900 });
    R.text(ctx, '& Bolt', G.W / 2, 350, { size: 76 * pop, color: '#5fae94', stroke: '#fff8ee', strokeW: 12, weight: 900 });
    R.text(ctx, G.CONFIG.subtitle, G.W / 2, 420, { size: 24, color: pal.inkSoft, weight: 800 });
    K.bolt(ctx, G.W / 2, 610, 230, { t: this.t, mood: 'happy' });
    for (let i = 0; i < 5; i++) K.screw(ctx, i, 90 + i * 90, 790 + Math.cos(this.t * 1.2 + i) * 6, 44);
    if (Math.sin(this.t * 4) > -0.4) R.text(ctx, G.state.inProgress ? 'Tap to continue level ' + G.state.inProgress.n : 'Tap to play', G.W / 2, 880, { size: 30, color: pal.ink, weight: 900 });
    R.text(ctx, 'v' + G.CONFIG.version, G.W - 16, G.H - 16, { size: 14, align: 'right', color: pal.inkSoft, weight: 700 });
  };

  G.sceneFor = function (n, resume) {
    const lv = G.Progress.level(n);
    return lv.mechanic === 'screws' ? new G.ScrewScene(n, resume) : new G.M3Scene(n, resume);
  };
  G.goHome = function () { G.Progress.clearProgress(); G.Scenes.reset(new G.HomeScene()); };
  // Start a level from scratch (needs a life).
  G.playLevel = function (n) {
    const P = G.Progress;
    if (!P.unlocked(n)) return false;
    if (!P.canPlay()) { G.Scenes.push(new G.NoLivesScene(() => G.playLevel(n))); return false; }
    P.clearProgress();
    G.Scenes.reset(new G.HomeScene());
    G.Scenes.push(G.sceneFor(n));
    return true;
  };
  // Resume the level saved in progress (no life needed: it was already started).
  G.resumeSaved = function () {
    const ip = G.state.inProgress;
    if (!ip || !G.Progress.level(ip.n)) return false;
    const lv = G.Progress.level(ip.n);
    const data = ip.data && ip.data.mech === lv.mechanic ? (lv.mechanic === 'screws' ? ip.data : ip.data.board) : null;
    if (!data) { G.Progress.clearProgress(); return false; }
    G.Scenes.reset(new G.HomeScene());
    G.Scenes.push(G.sceneFor(ip.n, data));
    return true;
  };
})();

'use strict';
// Home scene: the shop (3D view or 2D picture), lives/coins/stars, the next restoration, Play, level list, settings.
(function () {
  const G = window.G;
  const R = G.Render, K = G.Clay, UI = G.UI, U = G.U;
  const PAL = () => G.CONFIG.palette;
  const SHOP = { x: 20, y: 96, w: 500, h: 440 };

  function HomeScene() { this.name = 'home'; this.opaque = true; this.view3d = true; this.t = 0; }
  G.HomeScene = HomeScene;
  const S = HomeScene.prototype;

  S.enter = function () {
    this.ui = [];
    this.btnPlay = UI.button({ x: 90, y: 760, w: 360, h: 90, col: '#7cc6a4', size: 36, onTap: () => G.playLevel(G.Progress.current()) });
    this.btnRestore = UI.button({ x: 330, y: 640, w: 170, h: 64, col: '#f4a259', size: 24, onTap: () => this.restore() });
    this.btnLevels = UI.button({ x: 24, y: 872, w: 150, h: 60, label: 'Levels', col: '#6fa8dc', size: 22, onTap: () => G.Scenes.push(new LevelsScene()) });
    this.btnStats = UI.button({ x: 194, y: 872, w: 70, h: 60, icon: 'stats', col: '#fff3df', onTap: () => G.Scenes.push(new G.StatsScene()) });
    this.btnSettings = UI.button({ x: 446, y: 872, w: 70, h: 60, icon: 'settings', col: '#fff3df', onTap: () => G.Scenes.push(new G.SettingsScene()) });
    this.btnLives = UI.button({ x: 14, y: 22, w: 184, h: 52, col: 'rgba(0,0,0,0)', onTap: () => { if (!G.Progress.canPlay()) G.Scenes.push(new G.NoLivesScene()); } });
    this.btnLives.visible = true;
    this.ui = [this.btnPlay, this.btnRestore, this.btnLevels, this.btnStats, this.btnSettings];
    this.refresh();
    if (G.R3 && G.R3.ok && G.Shop3D) { const v = G.Shop3D.view(); if (v) G.R3.setView(v); }
    if (G.Shop3D) G.Shop3D.apply();
    G.Tw.wait(0.25).then(() => this.arrivalBeats());
  };
  S.resume = function () { this.refresh(); if (G.Shop3D) G.Shop3D.apply(); };

  S.refresh = function () {
    const P = G.Progress;
    const n = P.current();
    const next = P.nextTask();
    this.btnPlay.label = P.allDone() ? 'Replay a level' : 'Level ' + n;
    this.btnPlay.hard = P.isHard(n);
    this.btnPlay.enabled = P.unlocked(n);
    this.btnRestore.visible = !!next && P.chapterUnlocked(next.chapter);
    if (next) {
      this.btnRestore.label = 'Restore';
      this.btnRestore.enabled = P.canRestore(next.id);
      this.btnRestore.badge = this.btnRestore.enabled ? '!' : null;
    }
    // ch1 levels done but the sign isn't up yet: Play has nothing new to offer
    this.blockedByStars = !P.chapterUnlocked(P.chapterOf(Math.min(P.levelCount(), n + 1))) && P.rec(n).wins > 0;
  };

  // Story beats that play when the player arrives home (each once).
  S.arrivalBeats = async function () {
    if (G.Scenes.top() !== this) return;
    if (!G.Story.seen('intro')) await G.Story.play('intro');
    const daily = G.Progress.claimDaily();
    if (daily) await new Promise((res) => { const sc = new G.DailyScene(daily); const ex = sc.exit; sc.exit = function () { if (ex) ex.call(sc); res(); }; G.Scenes.push(sc); });
    if (G.Progress.isRestored('hang_sign') && !G.Story.seen('ch2_intro') && G.Progress.allWon(1)) await G.Story.play('ch2_intro');
    this.refresh();
  };

  S.restore = async function () {
    const P = G.Progress, t = P.nextTask();
    if (!t || !P.restore(t.id)) { G.Audio.play('bad'); return; }
    G.Audio.play('restore');
    G.Haptics.buzz('win');
    if (G.R3 && G.R3.visible) G.Shop3D.pop(t.look); else G.Shop2D.pop(t.look);
    if (G.Shop3D) G.Shop3D.apply();
    G.FX.burst(SHOP.x + SHOP.w / 2, SHOP.y + SHOP.h / 2, ['#ffc85a', '#fff', '#7cc6a4'], 40, { speed: 340, kind: 'star', r: 9 });
    this.refresh();
    await G.Tw.wait(0.8);
    await G.Story.play('r_' + t.id);
    if (t.id === 'hang_sign') { await G.Story.play('ch1_end'); if (G.Progress.allWon(1)) await G.Story.play('ch2_intro'); }
    if (P.finished()) { await G.Story.play('ending'); G.Scenes.push(new G.CreditsScene()); }
    this.refresh();
  };

  S.input = function (ev) {
    if (UI.handle(this.ui, ev)) return;
    if (ev.type === 'up' && ev.x < 200 && ev.y < 80 && !G.Progress.canPlay()) G.Scenes.push(new G.NoLivesScene());
  };
  S.update = function (dt) {
    this.t += dt;
    this.dt = dt;
    UI.update(this.ui, dt);
    if ((this.t % 1) < dt) this.refresh();
  };

  S.draw = function (ctx) {
    const pal = PAL(), P = G.Progress;
    const use3d = G.R3 && G.R3.visible;
    if (!use3d) {
      R.fill(ctx, pal.bg);
      R.panel(ctx, SHOP.x - 6, SHOP.y - 6, SHOP.w + 12, SHOP.h + 12, { fill: '#b98a6a', r: 30, lift: 8 });
      G.Shop2D.draw(ctx, SHOP.x, SHOP.y, SHOP.w, SHOP.h, this.t, this.dt || 0);
    } else {
      // 3D draws the shop behind us; paint the lower UI area so it reads on top
      const g = ctx.createLinearGradient(0, 540, 0, 600);
      g.addColorStop(0, 'rgba(246,231,212,0)');
      g.addColorStop(1, 'rgba(246,231,212,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 540, G.W, 60);
      R.fill(ctx, 'rgba(246,231,212,1)', -R.padY, 0);
      R.fill(ctx, pal.bg, 600);
    }
    // top bar
    UI.livesPill(ctx, 106, 48);
    R.panel(ctx, 214, 24, 150, 48, { r: 24, fill: '#fff3df', lift: 4 });
    K.icon(ctx, 'coin', 240, 48, 34);
    R.text(ctx, String(G.state.coins), 300, 49, { size: 24, weight: 900 });
    R.panel(ctx, 378, 24, 146, 48, { r: 24, fill: '#fff3df', lift: 4 });
    K.icon(ctx, 'star', 404, 47, 36);
    R.text(ctx, String(P.stars()), 462, 49, { size: 24, weight: 900 });
    // chapter + restoration card
    const next = P.nextTask();
    const ch = next ? next.chapter : 2;
    const tasks = P.tasksFor(ch);
    const done = tasks.filter((t) => P.isRestored(t.id)).length;
    R.panel(ctx, 20, 560, 500, 166, { r: 26 });
    R.text(ctx, 'Chapter ' + ch + ': ' + G.CONFIG.chapters[ch].title, 40, 590, { size: 22, align: 'left', weight: 900, maxW: 330 });
    for (let k = 0; k < tasks.length; k++) {
      ctx.fillStyle = k < done ? '#7cc6a4' : 'rgba(122,92,74,0.2)';
      R.rr(ctx, 40 + k * 46, 610, 40, 12, 6); ctx.fill();
    }
    if (next && P.chapterUnlocked(next.chapter)) {
      if (!P.finaleBlocked(next.id)) K.icon(ctx, 'star', 52, 692, 30);
      R.text(ctx, next.name, 40, 656, { size: 22, align: 'left', weight: 800, maxW: 280 });
      if (P.finaleBlocked(next.id)) R.text(ctx, 'Win every chapter ' + next.chapter + ' level first', 40, 693, { size: 18, align: 'left', weight: 800, color: pal.inkSoft, maxW: 280 });
      else R.text(ctx, next.cost + ' needed', 74, 693, { size: 19, align: 'left', weight: 800, color: P.stars() >= next.cost ? '#4f9d69' : pal.inkSoft });
    } else if (!next) {
      R.text(ctx, 'The shop is open again!', 40, 670, { size: 24, align: 'left', weight: 900, color: '#4f9d69' });
    } else {
      R.text(ctx, 'Finish chapter 1 to open the workbench.', 40, 670, { size: 19, align: 'left', weight: 800, color: pal.inkSoft });
    }
    if (G.state.streak > 0) {
      R.panel(ctx, 340, 586, 160, 36, { r: 18, fill: '#ffe2d6', lift: 2 });
      R.text(ctx, 'Win streak ' + G.state.streak, 420, 605, { size: 18, weight: 900, color: '#e2574c' });
    }
    if (this.blockedByStars) R.text(ctx, 'Earn stars (replay levels) to restore the shop!', G.W / 2, 745, { size: 17, weight: 800, color: '#c0392b' });
    UI.draw(ctx, this.ui);
    if (this.btnPlay.hard && this.btnPlay.visible) UI.hardBadge(ctx, this.btnPlay.x + this.btnPlay.w - 20, this.btnPlay.y + 4);
    G.FX.draw(ctx);
  };

  // ---- level list (replay for stars) ----
  const LevelsScene = G.inheritOverlay(function () {
    G.Overlay.call(this, 'levels');
    this.ui = [UI.button({ x: 170, y: 846, w: 200, h: 64, label: 'Close', col: '#7cc6a4', onTap: () => G.Scenes.pop() })];
    const P = G.Progress;
    for (let n = 1; n <= P.levelCount(); n++) {
      const col = (n - 1) % 5, row = Math.floor((n - 1) / 5);
      const b = UI.button({ x: 50 + col * 90, y: 170 + row * 108, w: 80, h: 80, label: String(n), size: 28, col: P.unlocked(n) ? (P.isHard(n) ? '#e2574c' : '#f4a259') : '#d8c8b6',
        onTap: () => { if (P.unlocked(n)) G.playLevel(n); } });
      b.n = n;
      b.enabled = P.unlocked(n);
      this.ui.push(b);
    }
  });
  LevelsScene.prototype.draw = function (ctx) {
    UI.modal(ctx, 500, 830, { y: 90, title: 'Levels' });
    UI.draw(ctx, this.ui);
    for (const b of this.ui) {
      if (!b.n) continue;
      const r = G.Progress.rec(b.n);
      for (let k = 0; k < 3; k++) K.icon(ctx, k < r.best ? 'star' : 'starOff', b.x + 16 + k * 24, b.y + 92, 22);
    }
    R.text(ctx, 'Candy and screw levels take turns · red = hard', G.W / 2, 140, { size: 16, color: PAL().inkSoft, weight: 800 });
  };
  G.LevelsScene = LevelsScene;

  // ---- credits ----
  const CreditsScene = G.inheritOverlay(function () {
    G.Overlay.call(this, 'credits');
    this.ui = [UI.button({ x: 170, y: 800, w: 200, h: 64, label: 'Back', col: '#7cc6a4', onTap: () => G.Scenes.pop() })];
    G.FX.confetti(80);
  });
  CreditsScene.prototype.draw = function (ctx) {
    UI.modal(ctx, 460, 700, { y: 140, title: 'Tinker & Bolt' });
    K.bolt(ctx, G.W / 2, 330, 160, { t: this.t, mood: 'happy' });
    const lines = ['A cozy toy-shop puzzle', '', 'Made with game-forge', 'Font: Nunito (SIL OFL)', '3D: three.js (MIT)', '', 'Every level is checked by a solver.', 'Thanks for playing!'];
    lines.forEach((l, i) => R.text(ctx, l, G.W / 2, 460 + i * 36, { size: 21, weight: i === 0 ? 900 : 700, color: PAL().inkSoft }));
    UI.draw(ctx, this.ui);
    G.FX.draw(ctx);
  };
  G.CreditsScene = CreditsScene;
})();

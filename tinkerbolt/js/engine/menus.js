'use strict';
// Overlay scenes: pause, buy booster, level result, gift box, settings, play stats, confirm.
(function () {
  const G = window.G;
  const R = G.Render, K = G.Clay, UI = G.UI, U = G.U;
  const PAL = () => G.CONFIG.palette;

  function Overlay(name) { this.name = name; this.opaque = false; this.t = 0; this.ui = []; }
  Overlay.prototype.input = function (ev) { UI.handle(this.ui, ev); };
  Overlay.prototype.update = function (dt) { this.t += dt; UI.update(this.ui, dt); };
  Overlay.prototype.pop = function () { return G.U.ease.outBack(Math.min(1, this.t / 0.3)); };
  function inherit(C) { C.prototype = Object.create(Overlay.prototype); C.prototype.constructor = C; return C; }

  // ---- pause ----
  const PauseScene = inherit(function (opts) {
    Overlay.call(this, 'pause');
    this.ui = [
      UI.button({ x: 120, y: 400, w: 300, h: 72, label: 'Resume', col: '#7cc6a4', onTap: () => G.Scenes.pop() }),
      UI.button({ x: 120, y: 490, w: 300, h: 72, label: 'Restart', col: '#f4a259', onTap: () => { G.Progress.recordLoss(); opts.onRetry(); } }),
      UI.button({ x: 120, y: 580, w: 300, h: 72, label: 'Back to shop', col: '#6fa8dc', onTap: () => { G.Progress.recordLoss(); opts.onQuit(); } }),
    ];
  });
  PauseScene.prototype.draw = function (ctx) {
    UI.modal(ctx, 380, 380, { y: 300, title: 'Paused' });
    R.text(ctx, 'Restarting or leaving costs a life', G.W / 2, 372, { size: 17, color: PAL().inkSoft, weight: 700 });
    R.text(ctx, 'and ends your win streak.', G.W / 2, 392, { size: 17, color: PAL().inkSoft, weight: 700 });
    UI.draw(ctx, this.ui);
  };
  G.PauseScene = PauseScene;

  // ---- buy a booster ----
  const BuyScene = inherit(function (id, done) {
    Overlay.call(this, 'buy');
    this.id = id;
    const b = G.CONFIG.boosters[id];
    this.b = b;
    const can = G.state.coins >= b.price;
    this.ui = [
      UI.button({ x: 110, y: 560, w: 320, h: 72, label: 'Buy for ' + b.price, icon: 'coin', col: can ? '#7cc6a4' : '#c9b8a4', enabled: can,
        onTap: () => { if (G.Progress.buy(id)) { G.Audio.play('coin'); G.Scenes.pop(); if (done) done(); } } }),
      UI.button({ x: 170, y: 650, w: 200, h: 60, label: 'Not now', col: '#d8c8b6', text: PAL().ink, size: 22, onTap: () => G.Scenes.pop() }),
    ];
  });
  BuyScene.prototype.draw = function (ctx) {
    const lv = G.Scenes.stack.find((s) => s.level);
    const ch = lv ? lv.level.chapter : 1;
    UI.modal(ctx, 420, 470, { y: 270, title: this.b.name });
    K.icon(ctx, this.id, G.W / 2, 400, 110);
    R.text(ctx, this.b.desc[ch] || this.b.desc[1] || this.b.desc[2], G.W / 2, 486, { size: 21, maxW: 380, weight: 800 });
    K.icon(ctx, 'coin', G.W / 2 - 50, 524, 30);
    R.text(ctx, 'You have ' + G.state.coins, G.W / 2 + 10, 525, { size: 20, color: PAL().inkSoft, weight: 800 });
    UI.draw(ctx, this.ui);
  };
  G.BuyScene = BuyScene;

  // ---- level result ----
  const ResultScene = inherit(function (o) {
    Overlay.call(this, o.won ? 'result_win' : 'result_lose');
    this.o = o;
    this.starT = 0;
    const next = o.n + 1;
    if (o.won) {
      const canNext = G.Progress.unlocked(next);
      this.ui = [
        UI.button({ x: 90, y: 650, w: 360, h: 78, label: canNext ? G.CONFIG.text.next : G.CONFIG.text.home, col: '#7cc6a4', size: 30,
          onTap: () => (canNext ? G.playLevel(next) : G.goHome()) }),
        UI.button({ x: 90, y: 744, w: 170, h: 64, label: 'Shop', col: '#6fa8dc', size: 24, onTap: () => G.goHome() }),
        UI.button({ x: 280, y: 744, w: 170, h: 64, label: 'Replay', col: '#f4a259', size: 24, onTap: () => G.playLevel(o.n) }),
      ];
    } else {
      this.recorded = false;
      const lose = () => { if (!this.recorded && o.onLose) o.onLose(); this.recorded = true; };
      this.ui = [
        UI.button({ x: 90, y: 626, w: 360, h: 78, label: G.CONFIG.text.retry, col: '#f4a259', size: 30, onTap: () => { lose(); o.onRetry(); } }),
        UI.button({ x: 90, y: 720, w: 360, h: 64, label: 'Back to shop', col: '#6fa8dc', size: 24, onTap: () => { lose(); G.goHome(); } }),
      ];
      if (o.offer) {
        const have = G.state.boosters[o.offer.id] || 0;
        this.ui.unshift(UI.button({ x: 90, y: 536, w: 360, h: 72, label: (have > 0 ? 'Use ' : 'Buy ') + o.offer.label + (have > 0 ? ' (' + have + ')' : ' · ' + G.CONFIG.boosters[o.offer.id].price),
          icon: o.offer.id, col: '#a98bd6', size: 24,
          onTap: () => {
            if (!(G.state.boosters[o.offer.id] > 0) && !G.Progress.buy(o.offer.id)) { G.Audio.play('bad'); return; }
            if (o.offer.onUse()) G.Scenes.pop();
          } }));
      }
    }
  });
  ResultScene.prototype.update = function (dt) {
    Overlay.prototype.update.call(this, dt);
    if (this.o.won) {
      const before = Math.floor(this.starT / 0.35);
      this.starT += dt;
      const after = Math.floor(this.starT / 0.35);
      if (after > before && after <= this.o.stars) { G.Audio.play('star', after - 1); G.Haptics.buzz('pop'); G.FX.burst(G.W / 2 + (after - 2) * 110, 360, ['#ffc85a', '#fff'], 14, { speed: 220, kind: 'star' }); }
      if (this.o.reward && !this.rewardShown && this.starT > 1.6) { this.rewardShown = true; G.Scenes.push(new RewardScene(this.o.reward)); }
    }
  };
  ResultScene.prototype.draw = function (ctx) {
    const o = this.o, pal = PAL();
    if (o.won) {
      UI.modal(ctx, 440, 640, { y: 190, title: o.n === G.Progress.levelCount() ? 'Last level done!' : 'Level ' + o.n + ' cleared!' });
      for (let k = 0; k < 3; k++) {
        const on = k < o.stars && this.starT > (k + 1) * 0.35;
        const sz = on ? 96 * Math.min(1, 0.6 + (this.starT - (k + 1) * 0.35) * 2) : 80;
        K.icon(ctx, on ? 'star' : 'starOff', G.W / 2 + (k - 1) * 110, 350 - (k === 1 ? 18 : 0), sz);
      }
      if (o.score) R.text(ctx, 'Score ' + o.score, G.W / 2, 440, { size: 26, weight: 900 });
      if (o.peak != null) R.text(ctx, 'Tray peak ' + o.peak + ' · best possible ' + (G.Progress.level(o.n).optPeak), G.W / 2, 440, { size: 21, weight: 800, color: pal.inkSoft });
      K.icon(ctx, 'coin', G.W / 2 - 46, 494, 40);
      R.text(ctx, '+' + o.coins, G.W / 2 + 12, 496, { size: 32, weight: 900 });
      if (o.newStars > 0) R.text(ctx, '+' + o.newStars + ' new star' + (o.newStars > 1 ? 's' : '') + ' for the shop', G.W / 2, 545, { size: 20, weight: 800, color: '#4f9d69' });
      if (G.state.streak > 0) R.text(ctx, 'Win streak ' + G.state.streak, G.W / 2, 590, { size: 20, weight: 900, color: '#e2574c' });
    } else {
      UI.modal(ctx, 440, 600, { y: 220, title: o.reason });
      K.bolt(ctx, G.W / 2, 352, 110, { t: this.t, mood: 'sad' });
      R.text(ctx, G.Progress.unlimitedMs() > 0 ? 'Unlimited lives: no life lost!' : 'This costs 1 life' + (G.state.streak > 0 ? ' and ends your streak of ' + G.state.streak : '') + '.', G.W / 2, 438, { size: 19, color: pal.inkSoft, weight: 800, maxW: 400 });
      G.UI.livesPill(ctx, G.W / 2, 488);
    }
    UI.draw(ctx, this.ui);
    G.FX.draw(ctx);
  };
  G.ResultScene = ResultScene;

  // ---- gift box (win streak) ----
  const RewardScene = inherit(function (reward) {
    Overlay.call(this, 'reward');
    this.r = reward;
    this.opened = false;
    this.ui = [UI.button({ x: 140, y: 690, w: 260, h: 72, label: 'Open!', col: '#e2574c', onTap: () => this.open() })];
  });
  RewardScene.prototype.open = function () {
    if (this.opened) { G.Scenes.pop(); return; }
    this.opened = true;
    this.ot = 0;
    G.Audio.play('restore');
    G.Haptics.buzz('win');
    G.FX.confetti(50);
    G.FX.burst(G.W / 2, 470, ['#ffc85a', '#fff', '#ef6f6c'], 30, { speed: 300, kind: 'star', r: 8 });
    this.ui[0].label = 'Great!';
    this.ui[0].col = '#7cc6a4';
  };
  RewardScene.prototype.draw = function (ctx) {
    UI.modal(ctx, 440, 520, { y: 290, title: this.r.size === 'big' ? 'Big gift box!' : 'Gift box!', dim: 0.55 });
    R.text(ctx, 'For ' + G.state.streak + ' wins in a row', G.W / 2, 385, { size: 20, color: PAL().inkSoft, weight: 800 });
    if (!this.opened) {
      const wob = Math.sin(this.t * 12) * 0.08 * (Math.sin(this.t * 2) > 0 ? 1 : 0.2);
      ctx.save(); ctx.translate(G.W / 2, 500); ctx.rotate(wob); K.icon(ctx, 'gift', 0, 0, this.r.size === 'big' ? 190 : 150); ctx.restore();
    } else {
      let x = this.r.coins && this.r.booster ? G.W / 2 - 80 : G.W / 2;
      if (this.r.coins) { K.icon(ctx, 'coin', x, 480, 90); R.text(ctx, '+' + this.r.coins, x, 560, { size: 34, weight: 900 }); x += 160; }
      if (this.r.booster) { K.icon(ctx, this.r.booster, x, 480, 90); R.text(ctx, '+1 ' + G.CONFIG.boosters[this.r.booster].name, x, 560, { size: 24, weight: 900, maxW: 170 }); }
    }
    UI.draw(ctx, this.ui);
    G.FX.draw(ctx);
  };
  G.RewardScene = RewardScene;

  // ---- confirm ----
  const ConfirmScene = inherit(function (text, onYes) {
    Overlay.call(this, 'confirm');
    this.text = text;
    this.ui = [
      UI.button({ x: 100, y: 540, w: 160, h: 66, label: 'Yes', col: '#e2574c', onTap: () => { G.Scenes.pop(); onYes(); } }),
      UI.button({ x: 280, y: 540, w: 160, h: 66, label: 'No', col: '#7cc6a4', onTap: () => G.Scenes.pop() }),
    ];
  });
  ConfirmScene.prototype.draw = function (ctx) {
    UI.modal(ctx, 420, 280, { y: 360 });
    R.wrap(ctx, this.text, G.W / 2, 400, 360, { size: 24, align: 'center', weight: 800 });
    UI.draw(ctx, this.ui);
  };
  G.ConfirmScene = ConfirmScene;

  // ---- settings ----
  const SettingsScene = inherit(function () {
    Overlay.call(this, 'settings');
    const St = G.Settings;
    const x = 320;
    this.ui = [
      UI.toggle({ x, y: 250, value: St.get('sfxOn'), onChange: (v) => { St.set('sfxOn', v); if (v) G.Audio.play('pop', 3); } }),
      UI.slider({ x: 150, y: 306, w: 290, value: St.get('sfxVol'), onChange: (v) => St.set('sfxVol', v), onDone: () => G.Audio.play('pop', 4) }),
      UI.toggle({ x, y: 390, value: St.get('vibeOn'), onChange: (v) => { St.set('vibeOn', v); G.Haptics.buzz('special'); } }),
      UI.toggle({ x, y: 450, value: St.get('vibeStrong'), onChange: (v) => { St.set('vibeStrong', v); G.Haptics.buzz('special'); } }),
      UI.toggle({ x, y: 530, value: St.get('reduceFx'), onChange: (v) => St.set('reduceFx', v) }),
      UI.toggle({ x, y: 590, value: St.get('render3d') !== 'off', onChange: (v) => { St.set('render3d', v ? 'auto' : 'off'); if (G.R3) G.R3.applySetting(); } }),
      UI.button({ x: 90, y: 660, w: 170, h: 58, label: 'Play stats', col: '#6fa8dc', size: 21, onTap: () => G.Scenes.push(new StatsScene()) }),
      UI.button({ x: 280, y: 660, w: 170, h: 58, label: 'Reset game', col: '#e2574c', size: 21,
        onTap: () => G.Scenes.push(new ConfirmScene('Erase all progress and start over?', () => { G.Save.reset(); G.Scenes.reset(new G.TitleScene()); })) }),
      UI.button({ x: 170, y: 740, w: 200, h: 64, label: 'Done', col: '#7cc6a4', onTap: () => G.Scenes.pop() }),
    ];
    this.ui[1].enabled = St.get('sfxOn');
    this.ui[3].enabled = St.get('vibeOn');
  });
  SettingsScene.prototype.update = function (dt) {
    Overlay.prototype.update.call(this, dt);
    this.ui[1].enabled = G.Settings.get('sfxOn');
    this.ui[3].enabled = G.Settings.get('vibeOn');
  };
  SettingsScene.prototype.draw = function (ctx) {
    const pal = PAL();
    UI.modal(ctx, 460, 660, { y: 170, title: 'Settings' });
    const L = (t, y, sub) => { R.text(ctx, t, 70, y, { size: 22, align: 'left', weight: 900 }); if (sub) R.text(ctx, sub, 70, y + 22, { size: 14, align: 'left', color: pal.inkSoft, weight: 700 }); };
    L('Sound effects', 273);
    R.text(ctx, 'Volume', 70, 329, { size: 16, align: 'left', color: pal.inkSoft, weight: 800 });
    L('Vibration', 413);
    L('Strong vibration', 473, this.ui[3].enabled ? null : 'turn vibration on first');
    L('Reduce effects', 545, 'no flashes, no shaking');
    L('3D shop view', 605, G.R3 && G.R3.ok === false ? 'not available on this device' : 'off = 2D picture');
    R.text(ctx, 'There is no music in this game, by design.', G.W / 2, 822 - 10, { size: 13, color: pal.inkSoft, weight: 700 });
    UI.draw(ctx, this.ui);
  };
  G.SettingsScene = SettingsScene;

  // ---- play stats ----
  const StatsScene = inherit(function () {
    Overlay.call(this, 'stats');
    this.copied = 0;
    this.ui = [
      UI.button({ x: 90, y: 770, w: 200, h: 62, label: 'Copy report', col: '#6fa8dc', size: 22, onTap: () => this.copy() }),
      UI.button({ x: 310, y: 770, w: 140, h: 62, label: 'Done', col: '#7cc6a4', size: 22, onTap: () => G.Scenes.pop() }),
    ];
  });
  StatsScene.prototype.copy = function () {
    const text = G.PlayStats.report();
    G.lastReport = text;
    const done = () => { this.copied = 2; };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
      else { fallbackCopy(text); done(); }
    } catch (e) { fallbackCopy(text); done(); }
  };
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    } catch (e) { /* nothing else to try */ }
  }
  StatsScene.prototype.update = function (dt) { Overlay.prototype.update.call(this, dt); this.copied = Math.max(0, this.copied - dt); };
  StatsScene.prototype.draw = function (ctx) {
    const pal = PAL(), st = G.state, s = st.stats, P = G.Progress;
    UI.modal(ctx, 480, 760, { y: 110, title: 'Play stats' });
    const rows = [
      ['Play time', Math.round(s.playSec / 60) + ' min'],
      ['Stars', P.totalStars() + ' / ' + P.levelCount() * 3],
      ['Coins earned', String(s.coinsEarned)],
      ['Wins / losses', s.wins + ' / ' + s.losses],
      ['Win streak', st.streak + ' (best ' + st.bestStreak + ')'],
      ['Restorations', st.restored.length + ' / ' + G.Data.restorations.length],
    ];
    rows.forEach(([a, b], i) => {
      R.text(ctx, a, 70, 200 + i * 38, { size: 20, align: 'left', weight: 800, color: pal.inkSoft });
      R.text(ctx, b, G.W - 70, 200 + i * 38, { size: 20, align: 'right', weight: 900 });
    });
    // per-level grid
    R.text(ctx, 'Best stars per level', G.W / 2, 445, { size: 18, weight: 900, color: pal.inkSoft });
    for (let n = 1; n <= P.levelCount(); n++) {
      const col = (n - 1) % 6, row = Math.floor((n - 1) / 6);
      const x = 80 + col * 76, y = 485 + row * 54;
      const r = P.rec(n);
      ctx.fillStyle = r.wins ? '#fff3df' : 'rgba(122,92,74,0.12)';
      R.rr(ctx, x - 32, y - 22, 64, 46, 12); ctx.fill();
      R.text(ctx, String(n), x, y - 8, { size: 14, weight: 900, color: P.isHard(n) ? '#e2574c' : pal.inkSoft });
      R.text(ctx, r.wins ? '★'.repeat(r.best) : r.attempts ? r.attempts + 'x' : '–', x, y + 11, { size: 15, weight: 900, color: '#e0a020' });
    }
    if (this.copied > 0) R.text(ctx, 'Copied! Paste it to the developer.', G.W / 2, 750, { size: 17, color: '#4f9d69', weight: 900 });
    UI.draw(ctx, this.ui);
  };
  G.StatsScene = StatsScene;
  // ---- lives (v3) ----
  UI.livesPill = function (ctx, x, y) {
    const P = G.Progress, inf = P.unlimitedMs();
    R.panel(ctx, x - 92, y - 24, 184, 48, { r: 24, fill: '#fff3df', lift: 4 });
    drawHeart(ctx, x - 64, y, 34, inf > 0);
    if (inf > 0) R.text(ctx, '∞ ' + P.fmtMs(inf), x + 14, y + 1, { size: 21, weight: 900, color: '#e2574c' });
    else {
      const n = P.lives();
      R.text(ctx, String(n), x - 64, y + 1, { size: 18, weight: 900, color: '#fff' });
      R.text(ctx, n >= G.CONFIG.lives.max ? 'Full' : P.fmtMs(P.nextLifeMs()), x + 14, y + 1, { size: 21, weight: 900, color: G.CONFIG.palette.ink });
    }
  };
  function drawHeart(ctx, x, y, s, gold) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = gold ? '#ffb030' : '#ef5f6a';
    ctx.beginPath();
    ctx.moveTo(0, s * 0.35);
    ctx.bezierCurveTo(-s * 0.6, -s * 0.05, -s * 0.35, -s * 0.55, 0, -s * 0.22);
    ctx.bezierCurveTo(s * 0.35, -s * 0.55, s * 0.6, -s * 0.05, 0, s * 0.35);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(-s * 0.18, -s * 0.18, s * 0.09, s * 0.06, -0.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  UI.heart = drawHeart;

  const NoLivesScene = inherit(function (onReady) {
    Overlay.call(this, 'nolives');
    this.onReady = onReady;
    const price = G.CONFIG.lives.refillPrice;
    this.ui = [
      UI.button({ x: 100, y: 600, w: 340, h: 74, label: 'Refill for ' + price, icon: 'coin', col: '#7cc6a4',
        onTap: () => { if (G.Progress.refillLives()) { G.Audio.play('restore'); G.Scenes.pop(); if (this.onReady) this.onReady(); } else G.Audio.play('bad'); } }),
      UI.button({ x: 170, y: 690, w: 200, h: 62, label: 'Wait', col: '#d8c8b6', text: PAL().ink, size: 22, onTap: () => G.Scenes.pop() }),
    ];
  });
  NoLivesScene.prototype.update = function (dt) {
    Overlay.prototype.update.call(this, dt);
    this.ui[0].enabled = G.state.coins >= G.CONFIG.lives.refillPrice;
    if (G.Progress.canPlay()) { G.Scenes.pop(); if (this.onReady) this.onReady(); }
  };
  NoLivesScene.prototype.draw = function (ctx) {
    UI.modal(ctx, 440, 520, { y: 260, title: 'Out of lives' });
    drawHeart(ctx, G.W / 2, 400, 120, false);
    R.text(ctx, '0', G.W / 2, 400, { size: 40, color: '#fff', weight: 900 });
    R.text(ctx, 'Next life in ' + G.Progress.fmtMs(G.Progress.nextLifeMs()), G.W / 2, 490, { size: 26, weight: 900 });
    R.text(ctx, 'Bolt is taking a little nap.', G.W / 2, 528, { size: 18, color: PAL().inkSoft, weight: 700 });
    R.text(ctx, 'You have ' + G.state.coins + ' coins', G.W / 2, 566, { size: 17, color: PAL().inkSoft, weight: 700 });
    UI.draw(ctx, this.ui);
  };
  G.NoLivesScene = NoLivesScene;

  const DailyScene = inherit(function (r) {
    Overlay.call(this, 'daily');
    this.r = r;
    this.ui = [UI.button({ x: 140, y: 720, w: 260, h: 72, label: 'Collect', col: '#7cc6a4', onTap: () => G.Scenes.pop() })];
    G.Audio.play('restore');
    G.FX.confetti(40);
  });
  DailyScene.prototype.draw = function (ctx) {
    const r = this.r, pal = PAL();
    UI.modal(ctx, 460, 600, { y: 220, title: 'Daily reward' });
    R.text(ctx, 'Day ' + r.day + ' of 7', G.W / 2, 312, { size: 20, color: pal.inkSoft, weight: 900 });
    for (let d = 0; d < 7; d++) {
      const x = G.W / 2 + (d - 3) * 58, y = 360;
      ctx.fillStyle = d < r.day ? '#ffc85a' : 'rgba(122,92,74,0.15)';
      R.rr(ctx, x - 24, y - 20, 48, 40, 10); ctx.fill();
      R.text(ctx, String(d + 1), x, y + 1, { size: 18, weight: 900, color: d < r.day ? '#fff' : pal.inkSoft });
    }
    drawHeart(ctx, G.W / 2, 470, 110, true);
    R.text(ctx, '∞', G.W / 2, 466, { size: 44, color: '#fff', weight: 900 });
    R.text(ctx, r.inf + ' min of unlimited lives', G.W / 2, 548, { size: 24, weight: 900 });
    let x = G.W / 2 - (r.coins && r.booster ? 70 : 0);
    if (r.coins) { K.icon(ctx, 'coin', x - 26, 620, 46); R.text(ctx, '+' + r.coins, x + 20, 621, { size: 26, weight: 900 }); x += 140; }
    if (r.booster) { K.icon(ctx, r.booster, x - 26, 620, 50); R.text(ctx, '+1', x + 20, 621, { size: 26, weight: 900 }); }
    UI.draw(ctx, this.ui);
    G.FX.draw(ctx);
  };
  G.DailyScene = DailyScene;

  G.Overlay = Overlay;
  G.inheritOverlay = inherit;
})();

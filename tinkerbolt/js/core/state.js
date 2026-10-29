'use strict';
// Settings (own key), the save (auto-saved on every change), progress rules and the play-stats ledger.
(function () {
  const G = window.G;
  const C = () => G.CONFIG;

  function store() { try { return window.localStorage; } catch (e) { return null; } }
  function read(k) { try { const s = store(); const v = s && s.getItem(G.key(k)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function write(k, v) {
    try { const s = store(); if (s) s.setItem(G.key(k), JSON.stringify(v)); return true; }
    catch (e) { G.warnOnce('save ' + k, e); return false; }
  }

  // ---- settings ----
  const DEFAULTS = { sfxOn: true, sfxVol: 0.7, vibeOn: true, vibeStrong: false, reduceFx: false, render3d: 'auto' };
  const S = (G.Settings = G.Settings || {});
  S.data = Object.assign({}, DEFAULTS);
  S.load = function () { S.data = Object.assign({}, DEFAULTS, read('settings') || {}); };
  S.get = (k) => S.data[k];
  S.set = function (k, v) {
    S.data[k] = v;
    write('settings', S.data);
    if (G.Audio) G.Audio.applySettings();
  };
  S.defaults = DEFAULTS;

  // ---- save ----
  const SAVE_V = 1;
  function fresh() {
    return {
      v: SAVE_V, coins: C().startCoins, boosters: Object.assign({}, C().startBoosters),
      levels: {}, restored: [], story: {}, streak: 0, bestStreak: 0, lastReward: null,
      lives: C().lives.max, livesAt: Date.now(), infUntil: 0, dailyDay: 0, lastLoginDay: null, inProgress: null,
      stats: { playSec: 0, coinsEarned: 0, starsEarned: 0, boostersUsed: {}, wins: 0, losses: 0, sessions: 0 },
      created: Date.now(),
    };
  }
  const Save = (G.Save = G.Save || {});
  Save.fresh = fresh;
  Save.load = function () {
    const d = read('save');
    G.state = d && d.v ? Save.migrate(d) : fresh();
    return G.state;
  };
  Save.migrate = function (d) {
    const f = fresh();
    for (const k of Object.keys(f)) if (d[k] === undefined) d[k] = f[k];
    for (const k of Object.keys(f.stats)) if (d.stats[k] === undefined) d.stats[k] = f.stats[k];
    for (const k of Object.keys(f.boosters)) if (d.boosters[k] === undefined) d.boosters[k] = 0;
    d.v = SAVE_V;
    return d;
  };
  Save.save = function () { return write('save', G.state); };
  Save.reset = function () { G.state = fresh(); Save.save(); };

  // ---- progress rules ----
  const P = (G.Progress = G.Progress || {});
  P.levelCount = () => G.Data.levels.length;
  P.level = (n) => G.Data.levels[n - 1];
  P.rec = (n) => G.state.levels[n] || { best: 0, attempts: 0, wins: 0, bestScore: 0 };
  P.totalStars = () => Object.values(G.state.levels).reduce((a, r) => a + (r.best || 0), 0);
  P.spentStars = () => G.state.restored.reduce((a, id) => a + (P.task(id) ? P.task(id).cost : 0), 0);
  P.stars = () => P.totalStars() - P.spentStars();
  P.task = (id) => G.Data.restorations.find((t) => t.id === id);
  P.isRestored = (id) => G.state.restored.indexOf(id) >= 0;
  P.chapterOf = (n) => (P.level(n) ? P.level(n).chapter : 0);
  P.chapterUnlocked = function (ch) {
    const need = C().chapters[ch] && C().chapters[ch].unlockedBy;
    return !need || P.isRestored(need);
  };
  P.unlocked = function (n) {
    if (n < 1 || n > P.levelCount()) return false;
    if (!P.chapterUnlocked(P.chapterOf(n))) return false;
    return n === 1 || P.rec(n - 1).wins > 0;
  };
  // The next level to play: first unwon unlocked level, else the last unlocked.
  P.current = function () {
    let last = 1;
    for (let n = 1; n <= P.levelCount(); n++) {
      if (!P.unlocked(n)) break;
      last = n;
      if (!P.rec(n).wins) return n;
    }
    return last;
  };
  P.allWon = (ch) => G.Data.levels.filter((l) => l.chapter === ch).every((l) => P.rec(l.n).wins > 0);
  P.tasksFor = (ch) => G.Data.restorations.filter((t) => t.chapter === ch);
  // A task is available once every earlier task of its chapter is done (they tell a story in order).
  P.nextTask = function () {
    for (const t of G.Data.restorations) if (!P.isRestored(t.id)) return t;
    return null;
  };
  // The last restoration of a chapter (sign, parade) also needs every level of that chapter won.
  P.isFinale = (id) => { const t = P.task(id); const list = t ? P.tasksFor(t.chapter) : []; return !!t && list[list.length - 1].id === id; };
  P.finaleBlocked = (id) => P.isFinale(id) && !P.allWon(P.task(id).chapter);
  P.canRestore = function (id) {
    const t = P.task(id), nt = P.nextTask();
    return !!(t && nt && nt.id === id && P.chapterUnlocked(t.chapter) && P.stars() >= t.cost && !P.finaleBlocked(id));
  };
  P.restore = function (id) {
    if (!P.canRestore(id)) return false;
    G.state.restored.push(id);
    Save.save();
    return true;
  };
  P.finished = () => G.Data.restorations.every((t) => P.isRestored(t.id));
  P.allDone = () => G.Data.levels.every((l) => P.rec(l.n).wins > 0);

  P.startAttempt = function (n) {
    const r = P.rec(n);
    r.attempts++;
    G.state.levels[n] = r;
    Save.save();
  };
  // Records a finished level. Returns {stars, newStars, coins}.
  P.recordWin = function (n, stars, score) {
    const r = P.rec(n);
    const before = r.best || 0;
    const firstWin = !r.wins;
    r.wins++;
    r.best = Math.max(before, stars);
    r.bestScore = Math.max(r.bestScore || 0, score || 0);
    G.state.levels[n] = r;
    const newStars = r.best - before;
    let coins = newStars * C().coinsPerNewStar;
    if (!firstWin) coins += C().coinsPerReplayWin;
    if (P.isHard(n)) coins *= C().hardCoinMul;
    G.state.coins += coins;
    G.state.stats.coinsEarned += coins;
    G.state.stats.starsEarned += newStars;
    G.state.stats.wins++;
    G.state.inProgress = null;
    const reward = P.streakStep(firstWin || newStars > 0);
    Save.save();
    return { stars, newStars, coins, firstWin, streak: G.state.streak, reward };
  };
  P.recordLoss = function () { G.state.stats.losses++; G.state.streak = 0; P.spendLife(); G.state.inProgress = null; Save.save(); };

  // ---- lives (v3). Real time, so lives refill while the game is closed. ----
  G.now = () => Date.now() + (G.timeOffset || 0);
  const regenMs = () => C().lives.regenMin * 60000;
  P.lives = function () {
    const st = G.state, max = C().lives.max, now = G.now();
    if (st.lives >= max) { st.lives = max; st.livesAt = now; return max; }
    const k = Math.floor((now - st.livesAt) / regenMs());
    if (k > 0) {
      st.lives = Math.min(max, st.lives + k);
      st.livesAt = st.lives >= max ? now : st.livesAt + k * regenMs();
      Save.save();
    }
    return st.lives;
  };
  P.unlimitedMs = () => Math.max(0, G.state.infUntil - G.now());
  P.canPlay = () => P.unlimitedMs() > 0 || P.lives() > 0;
  P.nextLifeMs = function () { const st = G.state; if (P.lives() >= C().lives.max) return 0; return Math.max(0, st.livesAt + regenMs() - G.now()); };
  P.spendLife = function () {
    if (P.unlimitedMs() > 0) return false;
    const st = G.state;
    P.lives();
    if (st.lives <= 0) return false;
    if (st.lives >= C().lives.max) st.livesAt = G.now();
    st.lives--;
    st.stats.livesLost = (st.stats.livesLost || 0) + 1;
    Save.save();
    return true;
  };
  P.refillLives = function () {
    const price = C().lives.refillPrice;
    if (G.state.coins < price) return false;
    G.state.coins -= price;
    G.state.lives = C().lives.max;
    G.state.livesAt = G.now();
    Save.save();
    return true;
  };
  P.fmtMs = function (ms) {
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    return h > 0 ? h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : m + ':' + String(s % 60).padStart(2, '0');
  };

  // ---- daily login reward (v3) ----
  P.dailyPending = () => G.state.lastLoginDay !== G.U.today();
  P.claimDaily = function () {
    if (!P.dailyPending()) return null;
    const table = C().daily;
    const day = G.state.dailyDay % table.length;
    const r = Object.assign({ day: day + 1 }, table[day]);
    G.state.lastLoginDay = G.U.today();
    G.state.dailyDay++;
    G.state.infUntil = Math.max(G.state.infUntil, G.now()) + r.inf * 60000;
    if (r.coins) { G.state.coins += r.coins; G.state.stats.coinsEarned += r.coins; }
    if (r.booster) G.state.boosters[r.booster] = (G.state.boosters[r.booster] || 0) + 1;
    Save.save();
    return r;
  };

  // ---- level in progress (v3): saved after every move, resumed on the next launch ----
  // A level's content signature: a saved board is only resumed if the level it was made from is unchanged.
  P.levelSig = function (n) {
    const l = P.level(n);
    if (!l) return '';
    const core = l.mechanic === 'screws' ? [l.plates, l.screws, l.boxes, l.tray] : [l.grid, l.goals, l.moves, l.colors, l.gears];
    return String(G.U.hash(JSON.stringify(core)));
  };
  P.saveProgress = function (n, data) { G.state.inProgress = { n, data, sig: P.levelSig(n), at: G.now() }; Save.save(); };
  P.clearProgress = function () { if (G.state.inProgress) { G.state.inProgress = null; Save.save(); } };

  P.buy = function (id) {
    const b = C().boosters[id];
    if (!b || G.state.coins < b.price) return false;
    G.state.coins -= b.price;
    G.state.boosters[id] = (G.state.boosters[id] || 0) + 1;
    Save.save();
    return true;
  };
  P.payCoins = function (n) {
    if (G.state.coins < n) return false;
    G.state.coins -= n;
    Save.save();
    return true;
  };
  P.useBooster = function (id) {
    if (!(G.state.boosters[id] > 0)) return false;
    G.state.boosters[id]--;
    G.state.stats.boostersUsed[id] = (G.state.stats.boostersUsed[id] || 0) + 1;
    Save.save();
    return true;
  };
  // Win streak: a first win or a star improvement adds 1; any loss resets it. Gift boxes at 3, then every 5.
  P.isHard = (n) => !!(P.level(n) && P.level(n).hard);
  P.streakStep = function (counts) {
    const cfg = C().streak;
    if (!counts) return null;
    G.state.streak++;
    G.state.bestStreak = Math.max(G.state.bestStreak, G.state.streak);
    const s = G.state.streak;
    let size = null;
    if (s === cfg.small) size = 'small';
    else if (s >= cfg.bigEvery && s % cfg.bigEvery === 0) size = 'big';
    if (!size) { Save.save(); return null; }
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const reward = { size, coins: 0, booster: null };
    const range = size === 'big' ? cfg.bigCoins : cfg.smallCoins;
    if (size === 'big' || Math.random() >= cfg.boosterChance) reward.coins = rnd(range[0], range[1]);
    if (size === 'big' || !reward.coins) {
      const ids = Object.keys(C().boosters);
      reward.booster = ids[Math.floor(Math.random() * ids.length)];
      G.state.boosters[reward.booster] = (G.state.boosters[reward.booster] || 0) + 1;
    }
    G.state.coins += reward.coins;
    G.state.stats.coinsEarned += reward.coins;
    G.state.lastReward = reward;
    Save.save();
    return reward;
  };
  P.streakBreak = function () { G.state.streak = 0; Save.save(); };

  // ---- play-stats clock: counts only while the tab is visible and the player touched it in the last 60 s ----
  const PS = (G.PlayStats = G.PlayStats || {});
  let acc = 0;
  PS.tick = function (rawDt) {
    if (!G.state) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (G.Input && G.Input.idleFor() > 60) return;
    G.state.stats.playSec += rawDt;
    acc += rawDt;
    if (acc > 15) { acc = 0; Save.save(); }
  };
  PS.report = function () {
    const st = G.state, s = st.stats;
    const lines = [];
    lines.push(C().title.en + ' v' + C().version + ' play report');
    lines.push('Play time: ' + Math.round(s.playSec / 60) + ' min · sessions ' + s.sessions);
    lines.push('Stars: ' + P.totalStars() + ' (spent ' + P.spentStars() + ') · coins ' + st.coins + ' (earned ' + s.coinsEarned + ')');
    lines.push('Wins ' + s.wins + ' · stuck/out of moves ' + s.losses + ' · restorations ' + st.restored.length + '/' + G.Data.restorations.length);
    lines.push('Lives ' + P.lives() + ' · lives lost ' + (s.livesLost || 0) + ' · daily rewards ' + st.dailyDay);
    lines.push('Streak now ' + st.streak + ' · best ' + st.bestStreak);
    lines.push('Boosters used: ' + (Object.entries(s.boostersUsed).map(([k, v]) => k + ' ' + v).join(', ') || 'none'));
    const per = [];
    for (let n = 1; n <= P.levelCount(); n++) {
      const r = st.levels[n];
      if (r) per.push(n + ':' + (r.best || 0) + '★/' + r.attempts + 'x');
    }
    lines.push('Levels (best★/attempts): ' + (per.join(' ') || 'none yet'));
    lines.push('Settings: ' + JSON.stringify(S.data));
    return lines.join('\n');
  };
})();

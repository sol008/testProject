// Play statistics: an accurate play clock, a per-chapter / per-activity / per-boss breakdown (G.state.stats),
// the 遊玩統計 page (G.StatsScene, opened from the pause menu) and a copy/download report for playtests.
//
// The clock (G.PlayStats.tick, called by main.js with the real, unclamped frame time) counts only while
//   - a game is running (G.inGame), the tab is visible and the window has focus, and nothing set G.PlayStats.paused;
//   - someone is at the keyboard: time since the last input is held as *pending* and only added to the totals when
//     the next input arrives. If no input comes for AFK_SEC (3 min) the pending time is dropped, i.e. the clock is
//     wound back to the last input, and nothing more counts until the player touches a key again.
// Frame gaps over MAX_GAP (tab suspended, machine asleep, debugger) are never counted.
//
// Activities: battle (a BattleScene / game-over screen is up), minigame, menu (pause menu, save/load, settings,
// shop, world map, this page), dialogue (a dialogue/choice/narration box is on top, or a script is running),
// otherwise exploration (free roaming on the map).
'use strict';
G.PlayStats = (() => {
  const P = {};
  const AFK_SEC = 180;
  const MAX_GAP = 2;
  const LEDGER_KEY = 'shorelight_playstats';
  const LEDGER_EVERY = 15;   // seconds between background ledger writes
  P.AFK_SEC = AFK_SEC;
  P.ACTS = G.STAT_ACTS;
  P.ACT_NAMES = { dialogue: '對話・劇情', battle: '戰鬥', explore: '探索', menu: '選單・商店', minigame: '小遊戲' };
  P.ACT_COLORS = { dialogue: ['#d6b0ff', '#8a5ad0'], battle: ['#ff9a7a', '#c8402a'], explore: ['#9be8a0', '#3a9a5a'], menu: ['#9ad0ff', '#3a6ad8'], minigame: ['#ffe08a', '#c8902a'] };

  // real clock in seconds (tests replace it)
  P.clock = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) / 1000;
  P.paused = false;            // set by anything that pauses the game; the clock stops while true

  let lastInput = P.clock();
  let afk = false;
  let hidden = typeof document !== 'undefined' && !!document.hidden;
  let blurred = false;
  const pend = new Map();      // 'chapter|activity|bossKey' -> seconds since the last input
  let pendT = 0;
  let pendOwner = null;        // the G.state the pending time belongs to
  let ledgerAt = 0;

  // ------------------------------------------------------------------ classification
  const MENU_SCENES = ['MenuScene', 'SaveScene', 'SettingsScene', 'ShopScene', 'WorldMapScene', 'StatsScene'];
  const TALK_SCENES = ['DialogScene', 'ChoiceScene', 'NarrateScene', 'BacklogScene'];
  P.activity = function () {
    let menu = false, mini = false;
    for (const s of G.Scenes.stack) {
      if (!s) continue;
      const k = s.statKind || '', n = G.Scenes.nameOf(s);
      if (k === 'battle' || (G.Battle && s instanceof G.Battle.Scene) || n === 'GameOverScene') return 'battle';
      if (k === 'minigame') mini = true;
      if (k === 'menu' || MENU_SCENES.includes(n)) menu = true;
    }
    if (mini) return 'minigame';
    if (menu) return 'menu';
    const top = G.Scenes.top();
    if (top && TALK_SCENES.includes(G.Scenes.nameOf(top))) return 'dialogue';
    if (G.Script && G.Script.busy()) return 'dialogue';
    return 'explore';
  };
  function battleScene() {
    const st = G.Scenes.stack;
    for (let i = st.length - 1; i >= 0; i--) if (G.Battle && st[i] instanceof G.Battle.Scene) return st[i];
    return null;
  }

  // why the clock is not running right now ('' = it is)
  P.stopReason = function () {
    if (!G.state || !G.inGame) return 'title';
    if (hidden) return 'hidden';
    if (blurred) return 'blur';
    if (P.paused) return 'paused';
    if (afk) return 'afk';
    return '';
  };

  // ------------------------------------------------------------------ clock
  P.tick = function (dtRaw) {
    const st = G.state;
    if (!st || !G.inGame) return;
    if (!st.stats) G.migrateStats(st);
    const now = P.clock();
    if (G.Input.anyHeld && G.Input.anyHeld()) P.input(now);
    if (now - lastInput > AFK_SEC) {
      if (!afk) goAfk();
      return;
    }
    if (hidden || blurred || P.paused) return;
    if (!(dtRaw > 0) || dtRaw > MAX_GAP) return;
    if (pendOwner !== st) { commit(); pendOwner = st; }
    const act = P.activity();
    const sc = act === 'battle' ? battleScene() : null;
    const key = (st.chapter | 0) + '|' + act + '|' + ((sc && sc._statBoss) || '');
    pend.set(key, (pend.get(key) || 0) + dtRaw);
    pendT += dtRaw;
    if (now - ledgerAt > LEDGER_EVERY) P.saveLedger();
  };

  // no input for AFK_SEC: wind the clock back to the last input
  function goAfk() {
    afk = true;
    if (pendT > 0 && pendOwner && pendOwner.stats) {
      pendOwner.stats.afk.count++;
      pendOwner.stats.afk.lost += pendT;
    }
    pend.clear(); pendT = 0;
  }

  // fold pending time into the owning state's totals
  function commit() {
    const st = pendOwner;
    if (st && pendT > 0) {
      if (!st.stats) G.migrateStats(st);
      for (const [key, v] of pend) {
        const [ch, act, boss] = key.split('|');
        const c = G.statChapter(st.stats, ch);
        c.time += v;
        c.act[act] = (c.act[act] || 0) + v;
        if (boss && st.stats.bosses[boss]) st.stats.bosses[boss].time += v;
        st.playtime = (st.playtime || 0) + v;
      }
    }
    pend.clear(); pendT = 0;
  }
  P.commit = function () { if (!afk) commit(); };

  // called by G.Input on every key / click / mouse move / pad press
  P.input = function (now) {
    now = now == null ? P.clock() : now;
    if (afk || now - lastInput > AFK_SEC) { if (!afk) goAfk(); afk = false; }
    else commit();
    lastInput = now;
  };

  // total play time including the not-yet-committed part (what the HUD shows)
  P.total = function () {
    const st = G.state;
    if (!st) return 0;
    return (st.playtime || 0) + (pendOwner === st && !afk ? pendT : 0);
  };
  P.status = () => ({ reason: P.stopReason(), pending: pendT, idle: P.clock() - lastInput, afk, hidden, blurred, total: P.total() });

  // window / tab events
  P.setHidden = function (v) {
    if (v === hidden) return;
    if (v) { P.commit(); P.saveLedger(true); } else lastInput = P.clock(), afk = false;
    hidden = v;
  };
  P.setBlurred = function (v) {
    if (v === blurred) return;
    if (v) P.commit(); else lastInput = P.clock(), afk = false;
    blurred = v;
  };
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => P.setHidden(!!document.hidden));
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('blur', () => P.setBlurred(true));
    window.addEventListener('focus', () => P.setBlurred(false));
    window.addEventListener('pagehide', () => { P.commit(); P.saveLedger(true); });
  }

  // ------------------------------------------------------------------ battles
  function bossInfo(sc) {
    const tr = sc.troop || {};
    const ids = tr.enemies || [];
    const bossId = ids.find((id) => G.Data.enemies[id] && G.Data.enemies[id].boss);
    if (!tr.boss && !bossId) return null;
    const key = typeof sc.troopId === 'string' ? sc.troopId : 'x:' + ids.join('+');
    return { key, enemy: bossId || ids[0] || null };
  }
  P.battleStart = function (sc) {
    const st = G.state;
    if (!st) return;
    if (!st.stats) G.migrateStats(st);
    P.commit();
    const ch = st.chapter | 0;
    sc._statCh = ch;
    G.statChapter(st.stats, ch).battles++;
    const b = bossInfo(sc);
    if (b) {
      const rec = st.stats.bosses[b.key] || (st.stats.bosses[b.key] = { enemy: b.enemy, ch, attempts: 0, wins: 0, losses: 0, retries: 0, time: 0, firstWin: 0 });
      rec.attempts++;
      sc._statBoss = b.key;
    }
  };
  P.battleEnd = function (sc, r) {
    const st = G.state;
    if (!st || !st.stats || sc._statEnded) return;
    sc._statEnded = true;
    P.commit();
    const c = G.statChapter(st.stats, sc._statCh != null ? sc._statCh : st.chapter);
    const b = sc._statBoss && st.stats.bosses[sc._statBoss];
    if (r === 'win') { c.wins++; if (b) { b.wins++; if (!b.firstWin) b.firstWin = b.attempts; } }
    else if (r === 'flee') c.flees++;
    else if (r === 'lose') {
      c.losses++;
      if (!(sc.o && sc.o.loseOk)) c.gameOvers++;
      if (b) b.losses++;
    }
  };
  // 重新挑戰 on the game-over screen: the state goes back to before the fight, the statistics do not
  P.retry = function (troopId, keep) {
    const st = G.state;
    if (!st || !keep) return;
    st.stats = keep.stats;
    st.playtime = keep.playtime;
    G.statChapter(st.stats, st.chapter).retries++;
    if (typeof troopId === 'string' && st.stats.bosses[troopId]) st.stats.bosses[troopId].retries++;
  };
  // snapshot of what the retry must keep (taken before the state is replaced)
  P.keep = function () { P.commit(); return G.state ? { stats: G.state.stats, playtime: G.state.playtime } : null; };

  // ------------------------------------------------------------------ persistence beyond the save slots
  // A small ledger in localStorage keeps the latest statistics of each playthrough (runId), so time played after
  // the last save survives quitting the browser, and loading an older save of the same run does not erase it.
  function ledgerRead() {
    try { const o = JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
  }
  P.saveLedger = function (force) {
    const st = G.state;
    ledgerAt = P.clock();
    if (!st || !st.stats || !G.inGame) return;
    if (!force && !(st.playtime > 0)) return;
    try {
      const L = ledgerRead();
      const cur = L[st.stats.runId];
      if (cur && cur.playtime > st.playtime + 1) return; // an older save of this run is loaded and behind: keep the best
      L[st.stats.runId] = { playtime: st.playtime, stats: st.stats, at: Date.now() };
      const ids = Object.keys(L).sort((a, b) => (L[b].at || 0) - (L[a].at || 0));
      for (const id of ids.slice(6)) delete L[id];
      localStorage.setItem(LEDGER_KEY, JSON.stringify(L));
    } catch (e) { /* storage full / blocked: the saves still carry the stats */ }
  };
  // G.Save.read: `st` is the state about to be loaded. Keep the more complete statistics of the same playthrough.
  P.adoptLoaded = function (st) {
    P.commit();
    pend.clear(); pendT = 0; pendOwner = null;
    lastInput = P.clock(); afk = false;
    const run = st.stats && st.stats.runId;
    if (!run) return st;
    let best = null;
    if (G.state && G.state.stats && G.state.stats.runId === run) best = { playtime: G.state.playtime || 0, stats: G.state.stats };
    const L = ledgerRead()[run];
    if (L && L.stats && (!best || L.playtime > best.playtime)) best = L;
    if (best && best.playtime > (st.playtime || 0) + 1) {
      const carried = G.migrateStats({ stats: JSON.parse(JSON.stringify(best.stats)), playtime: best.playtime });
      st.stats = carried.stats;
      st.playtime = best.playtime;
    }
    return st;
  };

  // ------------------------------------------------------------------ summaries
  P.summary = function (stats, playtime) {
    stats = stats || (G.state && G.state.stats) || G.newStats();
    const total = playtime != null ? playtime : P.total();
    const s = { total, legacy: stats.legacy || 0, act: {}, battles: 0, wins: 0, losses: 0, gameOvers: 0, flees: 0, retries: 0, chapters: [], bosses: [], afk: stats.afk || { count: 0, lost: 0 } };
    for (const a of P.ACTS) s.act[a] = 0;
    const pendCh = {};
    // include pending time so the page agrees with the HUD clock
    if (pendOwner === G.state && !afk && G.state && stats === G.state.stats) {
      for (const [key, v] of pend) {
        const [ch, act] = key.split('|');
        pendCh[ch] = pendCh[ch] || { time: 0, act: {} };
        pendCh[ch].time += v; pendCh[ch].act[act] = (pendCh[ch].act[act] || 0) + v;
      }
    }
    const chs = new Set(Object.keys(stats.chapters || {}).concat(Object.keys(pendCh)));
    for (const k of Array.from(chs).sort((a, b) => a - b)) {
      const c = Object.assign({ time: 0, act: {}, battles: 0, wins: 0, losses: 0, gameOvers: 0, flees: 0, retries: 0 }, stats.chapters[k]);
      const pc = pendCh[k] || { time: 0, act: {} };
      const row = { ch: +k, time: c.time + pc.time, battles: c.battles, wins: c.wins, losses: c.losses, gameOvers: c.gameOvers, flees: c.flees, retries: c.retries, act: {} };
      for (const a of P.ACTS) { row.act[a] = (c.act[a] || 0) + (pc.act[a] || 0); s.act[a] += row.act[a]; }
      for (const n of ['battles', 'wins', 'losses', 'gameOvers', 'flees', 'retries']) s[n] += row[n];
      if (row.time > 0.5 || row.battles) s.chapters.push(row);
    }
    // the boss currently being fought also gets its pending seconds
    const sc = battleScene();
    const live = sc && sc._statBoss && stats === (G.state && G.state.stats) ? sc._statBoss : null;
    let livePend = 0;
    if (live) for (const [key, v] of pend) if (key.endsWith('|' + live)) livePend += v;
    for (const k in stats.bosses || {}) {
      const b = stats.bosses[k];
      s.bosses.push({ key: k, enemy: b.enemy, ch: b.ch, attempts: b.attempts, wins: b.wins, losses: b.losses, retries: b.retries, time: b.time + (k === live ? livePend : 0), firstWin: b.firstWin });
    }
    s.bosses.sort((a, b) => a.ch - b.ch || 0);
    return s;
  };

  const fmt = (sec) => G.U.fmtTime(Math.max(0, sec || 0));
  P.fmt = fmt;
  P.chapterName = (ch) => (G.Chapters && G.Chapters[ch]) || ('#' + ch);
  P.bossName = (b) => {
    const d = b.enemy && G.Data.enemies[b.enemy];
    return d ? d.name : b.key;
  };

  // readable plain-text report (current language) + raw JSON for us
  P.report = function () {
    const T = G.T;
    const s = P.summary();
    const en = G.I18N.isEn();
    const actSum = P.ACTS.reduce((a, k) => a + s.act[k], 0);   // shares of tracked time, as on the page
    const pct = (v) => (actSum > 0 ? Math.round(v / actSum * 100) : 0) + '%';
    const pad = (str, n) => { str = String(str); let w = 0; for (const ch of str) w += /[　-￿]/.test(ch) ? 2 : 1; return str + ' '.repeat(Math.max(1, n - w)); };
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const L = [];
    L.push(T('彼岸燈') + ' — ' + T('遊玩統計') + '  (' + stamp + ')');
    L.push(T('總遊玩時間') + ': ' + fmt(s.total) + (s.legacy > 0 ? '  ' + T(`（含舊存檔時間 ${fmt(s.legacy)}）`) : ''));
    L.push(T(`戰鬥 ${s.battles}　勝利 ${s.wins}　全滅 ${s.gameOvers}　重新挑戰 ${s.retries}　逃跑 ${s.flees}`));
    if (s.afk.count) L.push(T(`離開座位 ${s.afk.count} 次，已扣除 ${fmt(s.afk.lost)}`));
    L.push('');
    L.push('[' + T('活動分佈') + ']');
    for (const a of P.ACTS) L.push('  ' + pad(T(P.ACT_NAMES[a]), 20) + pad(fmt(s.act[a]), 10) + pct(s.act[a]));
    L.push('');
    L.push('[' + T('各章節') + ']');
    for (const c of s.chapters) {
      L.push('  ' + T(P.chapterName(c.ch)));
      L.push('    ' + T(`用時 ${fmt(c.time)}　戰鬥 ${c.battles}（勝 ${c.wins}）　全滅 ${c.gameOvers}　重新挑戰 ${c.retries}`));
      L.push('    ' + P.ACTS.map((a) => T(P.ACT_NAMES[a]) + ' ' + fmt(c.act[a])).join(en ? ' · ' : '・'));
    }
    if (s.legacy > 0) L.push('  ' + T('舊存檔（未分類）') + '  ' + fmt(s.legacy));
    if (!s.chapters.length && !(s.legacy > 0)) L.push('  ' + T('（尚無紀錄）'));
    L.push('');
    L.push('[' + T('頭目戰') + ']');
    for (const b of s.bosses) {
      L.push('  ' + pad(T(P.bossName(b)), 22) + T(`挑戰 ${b.attempts}　擊敗 ${b.wins}　用時 ${fmt(b.time)}`) + (b.firstWin ? '  ' + T(`（第 ${b.firstWin} 次擊敗）`) : ''));
    }
    if (!s.bosses.length) L.push('  ' + T('（尚無紀錄）'));
    L.push('');
    L.push('--- raw ---');
    L.push(JSON.stringify({ v: 1, at: d.toISOString(), lang: G.settings.lang, difficulty: G.settings.difficulty, chapter: G.state.chapter, playtime: Math.round(s.total), stats: G.state.stats }));
    return L.join('\n');
  };

  // copy the report: async clipboard → execCommand('copy') → download a .txt file. Resolves 'clipboard' | 'download' | 'fail'.
  P.exportReport = function (text) {
    text = text || P.report();
    const legacyCopy = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        if (G.canvas && G.canvas.focus) G.canvas.focus();
        return !!ok;
      } catch (e) { return false; }
    };
    const download = () => {
      try {
        const d = new Date();
        const name = `shorelight-playstats-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.txt`;
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        P.lastDownload = name;
        return 'download';
      } catch (e) { return 'fail'; }
    };
    P.lastReport = text;
    const viaLegacy = () => (legacyCopy() ? 'clipboard' : download());
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => 'clipboard', viaLegacy);
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(viaLegacy());
  };

  return P;
})();

// ------------------------------------------------------------------ 遊玩統計 page
G.StatsScene = class StatsScene {
  constructor() {
    this.t = 0;
    this.opaque = true;       // a page of its own: the pause menu underneath must not show through
    this.statKind = 'menu';
    this.bossTop = 0;
    this.msg = null;
    this.busy = false;
  }
  update(dt) {
    this.t += dt;
    if (this.msg) { this.msg.t += dt; if (this.msg.t > 4) this.msg = null; }
    const I = G.Input;
    const n = this.nBoss || 0, rows = this.bossRows || 1;
    if (I.repeat('down') && this.bossTop + rows < n) { this.bossTop++; G.Audio.sfx('cursor'); }
    if (I.repeat('up') && this.bossTop > 0) { this.bossTop--; G.Audio.sfx('cursor'); }
    if (I.pressed('ok') && !this.busy) {
      this.busy = true;
      G.Audio.sfx('ok');
      G.PlayStats.exportReport().then((r) => {
        this.busy = false;
        this.msg = { t: 0, ok: r !== 'fail', text: r === 'clipboard' ? '報告已複製到剪貼簿，可直接貼上。' : r === 'download' ? '無法使用剪貼簿，報告已另存為文字檔。' : '匯出失敗。' };
      });
    }
    if (I.pressed('cancel') || I.pressed('menu')) { G.Audio.sfx('cancel'); G.Scenes.pop(this); }
  }
  draw(ctx) {
    const R = G.Render, UI = G.UI, PS = G.PlayStats;
    const s = PS.summary();
    const fmt = PS.fmt;
    ctx.save();
    const bg = ctx.createLinearGradient(0, 0, 0, G.H);
    bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#05070e');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, G.W, G.H);
    const X0 = 50, X1 = G.W - 50;
    // ---- header: title, total
    R.textClip(ctx, '遊玩統計', X0 + 10, 26, 420, { size: 34, color: '#fff0d0' });
    const tot = fmt(s.total);
    ctx.font = G.font(40);
    const tw = ctx.measureText(tot).width;
    R.text(ctx, tot, X1 - 10, 20, { size: 40, align: 'right', color: '#ffd97a', glow: 'rgba(255,190,90,0.45)', glowBlur: 10 });
    R.textClip(ctx, '總遊玩時間', X1 - 26 - tw, 36, 300, { size: 19, align: 'right', color: '#c9b893' });
    R.textClip(ctx, '只計算實際遊玩：切換視窗、暫停或閒置超過三分鐘的時間不計入。', X0 + 10, 70, X1 - X0 - 20, { size: 15, color: '#8a8270' });

    // ---- activity split
    const ay = 98, ah = 104;
    UI.panel(ctx, X0, ay, X1 - X0, ah, { ornament: false });
    R.textClip(ctx, '活動分佈', X0 + 20, ay + 12, 200, { size: 18, color: '#c9b893' });
    const bx = X0 + 230, bw = X1 - bx - 20, by = ay + 14, bh = 20;
    const sum = PS.ACTS.reduce((a, k) => a + s.act[k], 0);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, bh / 2); ctx.clip();
    let cx = bx;
    for (const k of PS.ACTS) {
      if (!(sum > 0) || !s.act[k]) continue;
      const w = bw * s.act[k] / sum;
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, PS.ACT_COLORS[k][0]); g.addColorStop(1, PS.ACT_COLORS[k][1]);
      ctx.fillStyle = g; ctx.fillRect(cx, by, w + 0.5, bh);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx + w - 1, by, 1, bh);
      cx += w;
    }
    ctx.restore();
    // legend: 5 equal cells — swatch + name, then time and share underneath
    const lw = (X1 - X0 - 40) / PS.ACTS.length;
    PS.ACTS.forEach((k, i) => {
      const lx = X0 + 20 + i * lw, ly = ay + 46;
      ctx.fillStyle = PS.ACT_COLORS[k][0];
      ctx.beginPath(); ctx.roundRect(lx, ly + 3, 14, 14, 3); ctx.fill();
      const pct = sum > 0 ? Math.round(s.act[k] / sum * 100) : 0;
      R.textClip(ctx, PS.ACT_NAMES[k], lx + 22, ly, lw - 34, { size: 17, minSize: 13, color: '#e8dcc0' });
      R.text(ctx, fmt(s.act[k]), lx + 22, ly + 25, { size: 17, color: '#ffe8b0' });
      R.text(ctx, pct + '%', lx + lw - 16, ly + 25, { size: 17, align: 'right', color: '#c9b893' });
    });

    // ---- per chapter
    const py = 222, ph = 416;
    const cw = 640;
    UI.panel(ctx, X0, py, cw, ph, { title: '各章節' });
    const cols = { name: X0 + 22, time: X0 + 418, battles: X0 + 516, go: X0 + cw - 22 };
    const hy = py + 40;
    R.textClip(ctx, '章節', cols.name, hy, 200, { size: 16, color: '#9c947f' });
    R.textClip(ctx, '用時', cols.time, hy, 90, { size: 16, align: 'right', color: '#9c947f' });
    R.textClip(ctx, '戰鬥次數', cols.battles, hy, 86, { size: 16, align: 'right', color: '#9c947f' });
    R.textClip(ctx, '全滅', cols.go, hy, 96, { size: 16, align: 'right', color: '#9c947f' });
    ctx.fillStyle = 'rgba(240,210,140,0.25)'; ctx.fillRect(X0 + 16, hy + 24, cw - 32, 1);
    const rows = s.chapters.map((c) => ({ name: PS.chapterName(c.ch), time: c.time, battles: c.battles, go: c.gameOvers, cur: G.state && c.ch === (G.state.chapter | 0) }));
    if (s.legacy > 0) rows.push({ name: '舊存檔（未分類）', time: s.legacy, battles: null, go: null, dim: true });
    const RH = 25;
    const maxRows = Math.floor((py + ph - 14 - (hy + 32)) / RH);
    rows.slice(0, maxRows).forEach((r, i) => {
      const y = hy + 32 + i * RH;
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(X0 + 14, y - 3, cw - 28, RH); }
      const col = r.dim ? '#9c947f' : r.cur ? '#fff0d0' : '#e8dcc0';
      R.textClip(ctx, r.name, cols.name, y, cols.time - 100 - cols.name, { size: 17, minSize: 13, color: col });
      R.text(ctx, fmt(r.time), cols.time, y, { size: 17, align: 'right', color: r.dim ? '#9c947f' : '#ffe8b0' });
      if (r.battles != null) R.text(ctx, String(r.battles), cols.battles, y, { size: 17, align: 'right', color: col });
      if (r.go != null) R.text(ctx, String(r.go), cols.go, y, { size: 17, align: 'right', color: r.go ? '#ff9a8a' : col });
    });
    if (!rows.length) R.textClip(ctx, '（尚無紀錄）', cols.name, hy + 34, cw - 44, { size: 17, color: '#8a8270' });

    // ---- bosses
    const bx0 = X0 + cw + 20, bw0 = X1 - bx0;
    UI.panel(ctx, bx0, py, bw0, ph, { title: '頭目戰' });
    const bc = { name: bx0 + 22, tries: bx0 + 330, wins: bx0 + 410, time: bx0 + bw0 - 22 };
    R.textClip(ctx, '頭目', bc.name, hy, 200, { size: 16, color: '#9c947f' });
    R.textClip(ctx, '挑戰', bc.tries, hy, 76, { size: 16, align: 'right', color: '#9c947f' });
    R.textClip(ctx, '擊敗', bc.wins, hy, 70, { size: 16, align: 'right', color: '#9c947f' });
    R.textClip(ctx, '用時', bc.time, hy, 90, { size: 16, align: 'right', color: '#9c947f' });
    ctx.fillStyle = 'rgba(240,210,140,0.25)'; ctx.fillRect(bx0 + 16, hy + 24, bw0 - 32, 1);
    this.nBoss = s.bosses.length; this.bossRows = maxRows;
    if (this.bossTop > Math.max(0, s.bosses.length - maxRows)) this.bossTop = Math.max(0, s.bosses.length - maxRows);
    s.bosses.slice(this.bossTop, this.bossTop + maxRows).forEach((b, i) => {
      const y = hy + 32 + i * RH;
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fillRect(bx0 + 14, y - 3, bw0 - 28, RH); }
      const beaten = b.wins > 0;
      R.textClip(ctx, PS.bossName(b), bc.name, y, bc.tries - 70 - bc.name, { size: 17, minSize: 13, color: beaten ? '#e8dcc0' : '#ffc8b8' });
      R.text(ctx, String(b.attempts), bc.tries, y, { size: 17, align: 'right', color: '#e8dcc0' });
      R.text(ctx, beaten ? '✓' : '—', bc.wins - 14, y, { size: 17, align: 'right', color: beaten ? '#9be8a0' : '#8a8270' });
      R.text(ctx, fmt(b.time), bc.time, y, { size: 17, align: 'right', color: '#ffe8b0' });
    });
    if (!s.bosses.length) R.textClip(ctx, '（尚無紀錄）', bc.name, hy + 34, bw0 - 44, { size: 17, color: '#8a8270' });
    if (this.bossTop > 0) UI.arrow(ctx, bx0 + bw0 / 2, hy + 28, -1, this.t);
    if (this.bossTop + maxRows < s.bosses.length) UI.arrow(ctx, bx0 + bw0 / 2, py + ph - 8, 1, this.t);

    // ---- totals line
    const parts = [G.T(`戰鬥 ${s.battles}　勝利 ${s.wins}　全滅 ${s.gameOvers}　重新挑戰 ${s.retries}　逃跑 ${s.flees}`)];
    if (s.afk.count) parts.push(G.T(`離開座位 ${s.afk.count} 次，已扣除 ${fmt(s.afk.lost)}`));
    R.textClip(ctx, parts.join(G.I18N.isEn() ? '   ·   ' : '　｜　'), X0 + 10, py + ph + 12, X1 - X0 - 20, { size: 17, color: '#c9b893' });
    // ---- status / hints
    if (this.msg) {
      const a = Math.min(1, (4 - this.msg.t) * 2);
      R.textClip(ctx, this.msg.text, X0 + 10, G.H - 34, 640, { size: 17, color: this.msg.ok ? '#9be8a0' : '#ff9a8a', alpha: Math.max(0, a) });
    }
    UI.hints(ctx, s.bosses.length > maxRows ? [['Z', '複製報告'], ['↑↓', '捲動'], ['X', '返回']] : [['Z', '複製報告'], ['X', '返回']]);
    ctx.restore();
  }
};

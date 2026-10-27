// Developer tools (enabled with ?debug in the URL). F2 opens the debug menu.
// URL params: ?debug&map=jiufen&x=10&y=10  |  ?debug&battle=troop_id  |  ?debug&lv=20
'use strict';
G.Debug = {
  init() {
    const q = new URLSearchParams(location.search);
    const map = q.get('map'), battle = q.get('battle'), startch = q.get('startch');
    if (startch != null) {
      // jump to the start of a chapter with a party matching the progression table
      setTimeout(() => {
        G.Audio.unlock();
        G.state = G.newState();
        G.inGame = true;
        const n = +startch;
        const prog = (G.Data.progression || []).find((p) => p.ch === n) || { lv: [1, 1], party: ['xinghe'] };
        const lv = +(q.get('lv') || prog.lv[0]);
        for (const id of prog.party) G.Party.join(id, lv);
        if (n >= 7) { G.Party.join('baizhi', lv); G.Party.leave('baizhi'); }
        G.state.gold = 300 * (n + 1);
        if (q.get('auto')) { G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; }
      if (q.get('autoplay')) G.Debug.setAutoplay(true);
        for (const f of (q.get('flags') || '').split(',').filter(Boolean)) G.state.flags[f] = true;
        G.Scenes.replace(new G.BlankScene());
        G.Script.run((S) => G.Story.next(S, n));
      }, 300);
      return;
    }
    if (!map && !battle) return;
    // skip title
    setTimeout(async () => {
      G.Audio.unlock();
      G.state = G.newState();
      G.inGame = true;
      const party = (q.get('party') || 'xinghe,baizhi,hongying,yungui').split(',');
      const lv = +(q.get('lv') || 10);
      for (const id of party) if (G.Data.chars && G.Data.chars[id]) G.Party.join(id, lv);
      G.state.gold = 5000;
      if (G.Data.items) for (const id of Object.keys(G.Data.items).slice(0, 12)) if (G.Data.items[id].type === 'use') G.Inv.add(id, 5);
      if (q.get('chapter')) G.state.chapter = +q.get('chapter');
      if (q.get('auto')) { G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; }
      if (q.get('autoplay')) G.Debug.setAutoplay(true);
      for (const f of (q.get('flags') || '').split(',').filter(Boolean)) G.state.flags[f] = true;
      const mid = map || Object.keys(G.Maps.defs)[0];
      const def = G.Maps.get(mid);
      const x = +(q.get('x') || (def && def.start ? def.start[0] : 5)), y = +(q.get('y') || (def && def.start ? def.start[1] : 5));
      G.Mapx.goto(mid, x, y, 'down');
      if (battle) G.Script.run(async (S) => { window.__battleResult = await S.battle(battle); });
    }, 300);
  },
  menu() {
    const maps = Object.keys(G.Maps.defs);
    G.Script.run(async (S) => {
      const c = await S.choice(['傳送地圖', '戰鬥測試', '全員升 5 級', '完全恢復', '獲得道具', '設定旗標', '靈視 60 秒', '取消'], { center: true, cancel: 7 });
      if (c === 0) {
        const page = maps.slice(0, 12);
        const i = await S.choice(page.concat(['取消']), { center: true, cancel: page.length });
        if (i < page.length) {
          const def = G.Maps.get(page[i]);
          await S.warp(page[i], def.start ? def.start[0] : 5, def.start ? def.start[1] : 5, 'down');
        }
      } else if (c === 1) {
        const tids = Object.keys(G.Data.troops || {});
        const id = prompt('troop id:\n' + tids.join(', '));
        if (id && G.Data.troops[id]) await S.battle(id);
      } else if (c === 2) {
        for (const m of G.Party.active()) for (let i = 0; i < 5; i++) G.Party.addExpTo(m, G.Party.expToNext(m.lv), []);
        G.Party.healAll();
      } else if (c === 3) G.Party.healAll();
      else if (c === 4) {
        const id = prompt('item id:');
        if (id && G.Data.items[id]) await S.give(id, 1);
      } else if (c === 5) {
        const f = prompt('flag:');
        if (f) S.flag(f);
      } else if (c === 6) S.vision(60);
    });
  },
};

// ---------------------------------------------------------------- test-bot helpers (used by tools/test)
// G.Debug.autoplay = true  → dialogue auto-advances, choices pick G.Debug.choices.shift() (index or substring,
// default 0), minigames succeed instantly, title cards / travel / 心燈 / shops skip, battles auto-fight at x3.
G.Debug.autoplay = false;
G.Debug.choices = [];
G.Debug.log = [];
G.Debug.setAutoplay = function (on) {
  G.Debug.autoplay = on;
  if (on) { G.settings.battleSpeed = 3; G.settings.textSpeed = 4; }
};
// run a map event by id (on the current map unless mapId given) and resolve when the script finishes
G.Debug.trigger = function (eventId, mapId) {
  const def = G.Maps.get(mapId || (G.mapScene && G.mapScene.def.id));
  const ev = def && (def.events || []).find((e) => e.id === eventId);
  if (!ev) return Promise.reject(new Error('no event ' + eventId));
  return G.Script.run(ev.run, ev);
};
// talk to an NPC by id on the current map
G.Debug.talk = function (npcId) {
  const m = G.mapScene;
  const n = m && m.npcs.find((x) => x.id === npcId);
  if (!n) return Promise.reject(new Error('no npc ' + npcId));
  const talk = n.talk || (n.def && n.def.talk);
  return G.Script.run(async (S) => { if (typeof talk === 'function') await talk(S, n); else await S.lines(talk, n); });
};
// teleport the player onto a cell and fire touch events / warps as if they had walked there. The player faces the
// direction of the step (dominant axis from the old cell; horizontal on a tie), so direction-gated warps (`dir`) and
// facing checks behave as after a real step; pass `dir` to force a facing (e.g. a long jump onto an 'up' warp).
G.Debug.stepOn = function (x, y, dir) {
  const m = G.mapScene, p = m.player;
  const dx = x - p.x, dy = y - p.y;
  if (!dir && (dx || dy)) dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  if (dir) { p.dir = dir; G.state.dir = dir; }
  p.setCell(x, y);
  p.onArrive = null;
  m.onPlayerArrive();
};
// an auto event on the current map whose conditions hold right now: MapScene.checkAuto starts it on the next update,
// so the map is not really idle yet (e.g. one auto event's script just ended and the next one is about to begin)
G.Debug.pendingAuto = function () {
  const m = G.mapScene;
  if (!m || !m.def || G.Scenes.top() !== m) return null;
  for (const e of m.def.events || []) if (e.trigger === 'auto' && m.eventOk(e)) return e;
  return null;
};
// idle right now: no script running, the map is the top scene, no fade, and no auto event about to fire
G.Debug.idleNow = function () {
  const top = G.Scenes.top();
  return !G.Script.busy() && !!top && top === G.mapScene && G.Render.fade.a < 0.05 && !G.Debug.pendingAuto();
};
// wait until the game is idle (see idleNow) and has STAYED idle across `frames` scene updates (default 2), so the gap
// between two chained scripts never reads as idle. Resolves true, 'gameover', or false on timeout.
// opts: { frames: 2 }. If the game loop is not advancing at all, ~1 s of uninterrupted idleness also counts.
G.Debug.idle = function (timeoutMs = 60000, opts = {}) {
  const need = opts.frames == null ? 2 : opts.frames;
  const t0 = Date.now();
  let since = null; // { frame, at } of the first observation in the current idle streak
  return new Promise((res) => {
    let iv = null;
    const check = () => {
      const top = G.Scenes.top();
      if (G.GameOverScene && top instanceof G.GameOverScene) { clearInterval(iv); res('gameover'); return true; }
      if (!G.Debug.idleNow()) since = null;
      else if (!since) since = { frame: G.Scenes.frame, at: Date.now() };
      const stable = !!since && (G.Scenes.frame - since.frame >= need || Date.now() - since.at >= 1000);
      if (stable || Date.now() - t0 > timeoutMs) { clearInterval(iv); res(stable); return true; }
      return false;
    };
    if (!check()) iv = setInterval(check, 25);
  });
};

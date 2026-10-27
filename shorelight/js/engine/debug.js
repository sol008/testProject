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
        for (const f of (q.get('flags') || '').split(',').filter(Boolean)) G.state.flags[f] = true;
        G.Scenes.replace({ opaque: true, update() {}, draw(ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H); } });
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

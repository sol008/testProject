// Story bootstrap & chapter chaining.
// Each chapter file (js/maps/chN_*.js) defines   G.Story.chN = async (S) => { ... }   which sets up and starts
// chapter N (title card, party changes, warp to its first map). The last event of chapter N calls
//   await G.Story.next(S, N + 1)
'use strict';
G.Story = G.Story || {};
G.Story.newGame = function () {
  G.Party.join('xinghe', 1);
  G.state.chapter = 0;
  G.state.gold = 0;
  if (G.Story.ch0) {
    // a neutral black base scene; the chapter function warps to the first map
    G.Scenes.replace(new G.BlankScene());
    G.Script.run((S) => G.Story.ch0(S));
    return;
  }
  const id = Object.keys(G.Maps.defs).find((k) => k !== 'sandbox') || 'sandbox';
  const d = G.Maps.get(id);
  G.Mapx.goto(id, (d.start || [5, 5])[0], (d.start || [5, 5])[1], 'down');
};

G.Story.next = async function (S, n) {
  G.state.chapter = n;
  const fn = G.Story['ch' + n];
  if (fn) { await fn(S); return; }
  await S.narrate(['（未完待續）', '下一章正在趕工中……'], { veil: 1 });
};

// make sure a member exists at a minimum level (used when someone rejoins after a long absence)
G.Story.ensureLevel = function (id, lv) {
  const m = G.state.members[id];
  if (!m) return;
  while (m.lv < lv) G.Party.addExpTo(m, G.Party.expToNext(m.lv) - m.exp, []);
  const st = G.Party.stats(id);
  m.hp = st.mhp; m.mp = st.mmp;
};

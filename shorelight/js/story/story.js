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

// ------------------------------------------------------------------------------------------ points of no return
// A transition that permanently closes content (chapter end, one-way voyage, a boss whose victory moves the story on)
// asks first when something is still open. Catalogue of every such point: docs/qa/points_of_no_return.md.
//
//   if (!(await S.pointOfNoReturn({
//     chapter: 5,                                      // for the debug log only
//     quests: ['q_fubo', 'q_halfwell'],                // side quests this transition closes
//     lanterns: { lantern_fubo: 'q_fubo', lantern_halfwell: 'q_halfwell' },   // 心燈 it closes → their quest
//     intro: [['蔡頭家', '客官要歇睏了？天就要光了。']],  // said before the warning, only when it is shown
//     back: 'D',                                       // the player steps this way when they choose to wait
//     event: ctx,                                      // a `once` event (the run's ctx) to re-arm when they wait
//   }))) return;
//
// quests:   named when started and not done. An entry may be { id, open: (st) => bool } to narrow "open" (e.g. only
//           while an ingredient is still missing). A quest flagged `lantern` in its data gets 「（心燈）」; override with
//           { id, lantern: (st) => bool } when an earlier choice already lost the lantern but the quest is still open.
// lanterns: { lanternId: questId | null | { quest, can } }. A 心燈 not lit yet whose quest was never started (and
//           whose `can()` holds — use it when the lantern is already out of reach) is counted, not named
//           (「這一帶還有 N 盞心燈未點亮」: a nudge without spoilers). A lantern whose quest has started is either
//           named through `quests` or still obtainable after this point; one whose quest ended without it was lost
//           to an earlier choice. Neither is counted.
// Returns true to go on — at once, without a prompt, when nothing is open — or false when the player waits.
// 「繼續」 is the first option, so the test autoplay (choices default to 0) carries on unless G.Debug.choices says not.
G.Story.openContent = function (o = {}) {
  const st = G.state;
  const QD = (G.Data && G.Data.quests) || {};
  const started = (id) => !!(id && st.quests[id]);
  const quests = [];
  for (const q of o.quests || []) {
    const id = typeof q === 'string' ? q : q.id;
    if (!started(id) || G.Quests.isDone(id)) continue;
    if (q.open && !q.open(st)) continue;
    const def = QD[id] || {};
    const lantern = q.lantern == null ? !!def.lantern : typeof q.lantern === 'function' ? !!q.lantern(st) : !!q.lantern;
    quests.push({ id, name: q.name || def.name || id, lantern });
  }
  const lanterns = [];
  for (const [lid, v] of Object.entries(o.lanterns || {})) {
    if (G.Lanterns.has(lid)) continue;
    const quest = v && typeof v === 'object' ? v.quest : v;
    const can = v && typeof v === 'object' && v.can;
    if (started(quest)) continue;
    if (can && !can(st)) continue;
    lanterns.push(lid);
  }
  return { quests, lanterns, any: quests.length + lanterns.length > 0 };
};

G.Story.pointOfNoReturn = async function (S, o = {}) {
  const open = G.Story.openContent(o);
  const log = (msg) => { if (G.Debug && G.Debug.log) G.Debug.log.push(`pointOfNoReturn ch${o.chapter != null ? o.chapter : G.state.chapter}: ${msg}`); };
  if (!open.any) { log('nothing open'); return true; }
  // the list is assembled from already-translated pieces, so the English line needs only the frame template
  const T = (s) => (G.I18N && G.I18N.t ? G.I18N.t(s) : s);
  const en = !!(G.I18N && G.I18N.isEn && G.I18N.isEn());
  const parts = open.quests.map((q) => T(q.name) + (q.lantern ? T('（心燈）') : ''));
  if (open.lanterns.length) parts.push(T(`這一帶還有 ${open.lanterns.length} 盞心燈未點亮`));
  log('open: ' + open.quests.map((q) => q.id).concat(open.lanterns).join(', '));
  if (o.intro) await S.lines(o.intro);
  const list = parts.join(en ? '; ' : '、');
  await S.say(o.who || '', `前方將無法回頭。尚有未完成的事：${list}。確定要繼續嗎？`);
  const c = await S.choice(['繼續', '再等等'], { cancel: 1 });
  if (c === 0) { log('continue'); return true; }
  log('wait');
  const m = G.mapScene;
  if (o.event && o.event.once && m && m.evKey) G.state.flags[m.evKey(o.event)] = false;
  if (o.back && m) await S.move('player', o.back);
  return false;
};
// event scripts call it as S.pointOfNoReturn({...})
if (G.Script && G.Script.S) G.Script.S.pointOfNoReturn = (o) => G.Story.pointOfNoReturn(G.Script.S, o);

// make sure a member exists at a minimum level (used when someone rejoins after a long absence)
G.Story.ensureLevel = function (id, lv) {
  const m = G.state.members[id];
  if (!m) return;
  while (m.lv < lv) G.Party.addExpTo(m, G.Party.expToNext(m.lv) - m.exp, []);
  const st = G.Party.stats(id);
  m.hp = st.mhp; m.mp = st.mmp;
};

#!/usr/bin/env node
// 第一章　九份燈火 — side quests and 心燈, played from the chapter start the way a player can (tools/test/sidequests/lib.js).
//
//   node tools/test/sidequests/ch1.side.js            # all runs, prints PASS/FAIL per quest, exit 1 on any failure
//   node tools/test/sidequests/ch1.side.js afternoon  # only runs whose name contains "afternoon"
//   node tools/test/sidequests/ch1.side.js --shots    # screenshots to tools/test/out/side_ch1/
//
// Run A "morning/afternoon" (?debug&startch=1): errands → 醒木失竊記 (P1: second teahouse visit, the cat chase, 阿水's
//   小魚乾, 阿炳伯) → mine → 工頭魂 → 阿土伯's request → the east branch of the cart puzzle → wind lamps → 懷錶 → out of
//   the mine → P3: 陳伯's hint, 阿土嬸 (心燈①) → 小金 / 阿旺 / 阿土嬸 / 小金's door (心燈②).
// Run B "next morning": the same chapter start, but both 心燈 are left alone until P5 (七月十五): 小金's quest is started in
//   P3 and left open, 陳伯's two-step departure warning, the whole night (雞籠, 八斗子, raid, bosses), then in P5 the
//   departure warning names the open quests (再等等 steps back), the 懷錶 is fetched from the mine and both 心燈 are lit,
//   and the departure goes through without a prompt.
// The test never writes a quest flag, item, stage or var. Help: battle bot on easy + level raises before bosses (logged).
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');
const { assert, waitMap, goTo, interact, talkTo, warpTo, actEvent, level } = L;

const SHOTS = process.argv.includes('--shots') ? path.join(L.ROOT, 'tools', 'test', 'out', 'side_ch1') : null;
const results = [];

// ------------------------------------------------------------------------------------------------ shared beats
async function morning(s, o = {}) {
  await waitMap(s, 'jiufen_shop_2f');
  await warpTo(s, 'jiufen_shop');                   // 1-2 errands start on arrival
  assert((await s.flags()).ch1_errands, '1-2 errands');
  await warpTo(s, 'jiufen');
  // 1-3a teahouse (delivery on entry), out, and back in: 黑糖 steals the 醒木 (醒木失竊記 start)
  await warpTo(s, 'jiufen_teahouse');
  assert((await s.flags()).ch1_err_tea, 'tea delivered');
  await warpTo(s, 'jiufen');
  if (o.xingmu) {
    await warpTo(s, 'jiufen_teahouse');
    assert(await s.stage('q_xingmu') === 0, '醒木失竊記 should start on the second teahouse visit (stage ' + await s.stage('q_xingmu') + ')');
    const obj = await s.ev(() => G.state.vars.objective);
    assert(/雜貨店/.test(obj), 'objective should point at the store roof: ' + obj);
    await warpTo(s, 'jiufen');
    // stage 0: the cat by the store (九份 NW)
    await talkTo(s, 'heitang', ['抓住牠']);
    assert(await s.stage('q_xingmu') === 1, 'cat chase ①');
    await talkTo(s, 'heitang');
    assert(await s.stage('q_xingmu') === 2, 'cat chase ②');
    const n0 = await L.logLen(s);
    await talkTo(s, 'heitang');                     // asleep on the 福德祠 steps, no fish yet
    const hint = await L.saidSince(s, n0);
    assert(/小魚乾/.test(hint), 'the sleeping cat should hint at 小魚乾: ' + hint);
    await talkTo(s, 'ashui');                       // 阿水 gives one for free (P1/P2)
    assert(await s.count('c1_dried_fish') === 1, '阿水 should give a 小魚乾');
    await talkTo(s, 'heitang', ['用小魚乾換']);
    assert(await s.count('c1_xingmu') === 1 && await s.stage('q_xingmu') === 3, '醒木 back');
    await warpTo(s, 'jiufen_teahouse');
    await talkTo(s, 'abing', ['閒聊']);
    const r = await s.ev(() => ({ done: G.Quests.isDone('q_xingmu'), fan: G.Inv.count('c1_fan_story'), tea: G.Inv.count('c1_oolong'), x: G.Inv.count('c1_xingmu') }));
    assert(r.done && r.fan === 1 && r.tea >= 2 && !r.x, '醒木失竊記 reward: ' + JSON.stringify(r));
    s.log.push('醒木失竊記 done in P1');
    await warpTo(s, 'jiufen');
  }
  // 1-3b store, 1-3c 福德祠
  await warpTo(s, 'jiufen_store');
  await talkTo(s, 'acai');
  assert((await s.flags()).ch1_err_oil, 'oil bought');
  await warpTo(s, 'jiufen');
  await actEvent(s, 'fude');
  assert((await s.flags()).ch1_err_fude, '福德祠');
  // 1-4 report → noon
  await warpTo(s, 'jiufen_shop');
  await talkTo(s, 'chenbo');
  await waitMap(s, 'jiufen');
  assert((await s.flags()).ch1_ahuang_lost, '1-4 阿黃 lost');
}

// into the mine, cart puzzle (main branch), 工頭魂. Ends in the gold-vein hall after the fight.
async function mineAndForeman(s) {
  await goTo(s, 35, 32);                            // the broken fence → 1-5
  await waitMap(s, 'mine_1');
  await actEvent(s, 'swA', [0]);                    // A: 南 → 東
  await actEvent(s, 'swB', [0]);                    // B: 東 → 北
  await actEvent(s, 'cart', [0]);
  assert((await s.flags()).ch1_cart_main, 'north rubble');
  await warpTo(s, 'mine_2', [27, 3]);
  await level(s, 4, '工頭魂 is balanced for a Lv3 player (docs/BALANCE.md); the bot gets one level of margin');
  const n0 = await L.logLen(s);
  await goTo(s, 17, 17, { through: true });         // into the hall → 1-7
  await s.idle();
  const f = await s.flags();
  assert(f.ch1_foreman && f.ch1_atu_met, '1-7 foreman: ' + JSON.stringify(f));
  return L.saidSince(s, n0);
}

// 心燈① part 1: back up to the cart, the east branch, the wind lamps, the watch. Ends back in 九份 (P3).
async function fetchWatch(s, o = {}) {
  if ((await s.map()) === 'mine_2') await warpTo(s, 'mine_1', [25, 3]);
  if ((await s.map()) === 'jiufen') { await goTo(s, 35, 30); await waitMap(s, 'mine_1'); }
  // B back to 東 (the chalk arrows show the state), push the cart again
  const swB = await s.ev(() => G.state.vars.swB);
  if (swB !== 'E') await actEvent(s, 'swB', [0]);
  if ((await s.ev(() => G.state.vars.swA)) !== 'E') await actEvent(s, 'swA', [0]);
  await actEvent(s, 'cart', [0]);
  assert((await s.flags()).ch1_cart_side, 'east rubble');
  await warpTo(s, 'mine_2', [37, 13]);
  assert(JSON.stringify(await s.pos()).startsWith('[3,'), 'west branch of the lower level');
  // walking into the wind: pushed back with a hint
  const n0 = await L.logLen(s);
  await goTo(s, 3, 18, { through: true, once: true });
  const back = await s.pos();
  assert(back[1] < 18, 'the wind should push 星河 back: ' + back);
  assert(/壁燈|牆上的燈/.test(await L.saidSince(s, n0)), 'wind hint line');
  // 一 → 丅 → 下 (正 stroke order, as 阿土伯 said)
  if (o.wrongFirst) {
    await actEvent(s, 'lamp_w3', ['點燈']);
    assert((await s.ev(() => (G.state.vars.windLit || []).length)) === 0, 'wrong order resets');
  }
  await actEvent(s, 'lamp_w1', ['點燈']); await actEvent(s, 'lamp_w2', ['點燈']); await actEvent(s, 'lamp_w3', ['點燈']);
  assert((await s.flags()).ch1_wind_done, 'wind stopped');
  // the cave-in room: the glint in the crack is tagged (hint) and lit
  await goTo(s, 3, 21);
  const tag = await s.ev(() => { const e = G.mapScene.def.events.find((x) => x.id === 'watch'); return { hint: typeof e.hint === 'function' ? e.hint(G.state) : !!e.hint, label: e.label, light: (G.Mapx.val(G.mapScene.def.lights) || []).some((l) => l.x === 3 && l.y === 23) }; });
  assert(tag.hint && tag.light, 'the watch spot should show a hint tag and a glint: ' + JSON.stringify(tag));
  await s.shot(SHOTS, 'watch_spot');
  await actEvent(s, 'lunchbox');
  await actEvent(s, 'watch');
  assert(await s.count('key_watch') === 1 && await s.stage('q_atu_watch') === 1, 'watch found');
  // back up the ladder and out through the mine entrance
  await warpTo(s, 'mine_1', [3, 3]);
  await warpTo(s, 'jiufen', [19, 39]);
}

async function deliverWatch(s, where) {
  if (where === 'house') {
    await warpTo(s, 'jiufen_atu_house');
    await talkTo(s, 'atusim_in');
  } else await talkTo(s, 'atusim');
  const r = await s.ev(() => ({ done: G.Quests.isDone('q_atu_watch'), l: !!G.state.lanterns.xd_atu_watch, sugar: G.Inv.count('c1_maltose'), watch: G.Inv.count('key_watch') }));
  assert(r.done && r.l && r.sugar === 5 && !r.watch, '心燈① 阿土伯的懷錶: ' + JSON.stringify(r));
  if (where === 'house') await warpTo(s, 'jiufen');
}

async function ahuang(s, where) {
  if ((await s.stage('q_ahuang')) < 0) {
    await talkTo(s, 'xiaojin');
    assert(await s.stage('q_ahuang') === 0, '阿黃回家 stage 0');
  }
  await talkTo(s, 'awang', ['阿黃是阿土伯的狗']);
  assert(await s.stage('q_ahuang') === 1, 'stage 1 (阿旺 wants a witness)');
  if (where === 'house') { await warpTo(s, 'jiufen_atu_house'); await talkTo(s, 'atusim_in'); await warpTo(s, 'jiufen'); }
  else await talkTo(s, 'atusim');
  assert(await s.stage('q_ahuang') === 2, 'stage 2 (阿土嬸 will vouch)');
  await goTo(s, 25, 8);                             // 小金's door
  await s.idle();
  const r = await s.ev(() => ({ done: G.Quests.isDone('q_ahuang'), l: !!G.state.lanterns.xd_ahuang, rock: G.Inv.count('c1_foolsgold'), map: G.mapScene.def.id }));
  assert(r.done && r.l && r.rock === 1 && r.map === 'jiufen', '心燈② 阿黃回家: ' + JSON.stringify(r));
}

// ------------------------------------------------------------------------------------------------ run A
async function runAfternoon(browser, open) {
  const s = await open('?debug&startch=1');
  await morning(s, { xingmu: true });
  const lines = await mineAndForeman(s);
  assert(/往東/.test(lines) && /正/.test(lines) && await s.stage('q_atu_watch') === 0, '阿土伯 asks for the watch and says where (stage ' + await s.stage('q_atu_watch') + ')');
  // talk to 阿土伯 again: he repeats the directions
  const n0 = await L.logLen(s);
  await talkTo(s, 'atu');
  assert(/往東/.test(await L.saidSince(s, n0)), '阿土伯 repeats the directions');
  await fetchWatch(s, { wrongFirst: true });
  assert((await s.flags()).ch1_mine_done, 'back in 九份: P3');
  // 陳伯 points at 小金 (first P3 talk)
  await warpTo(s, 'jiufen_shop');
  const n1 = await L.logLen(s);
  await talkTo(s, 'chenbo');
  const cbl = await L.saidSince(s, n1);
  assert(/小金|阿黃/.test(cbl), '陳伯 should mention 小金 / 阿黃 in the afternoon: ' + cbl);
  await warpTo(s, 'jiufen');
  await deliverWatch(s, 'house');
  await ahuang(s, 'house');
  const lan = await s.ev(() => Object.keys(G.state.lanterns));
  assert(lan.includes('xd_atu_watch') && lan.includes('xd_ahuang'), 'both 心燈: ' + lan);
  const log = await s.ev(() => ({ open: Object.entries(G.state.quests).filter(([k, q]) => !q.done && k !== 'q_ch1_main').map(([k]) => k) }));
  assert(!log.open.length, 'quest log should have no open side quests: ' + log.open);
  await s.shot(SHOTS, 'afternoon_done');
  return s;
}

// ------------------------------------------------------------------------------------------------ run B
// main-path beats between P3 and P5 use the chapter test's shortcuts (G.Debug.talk / stepOn on the scripted triggers):
// they are the critical path, not the side quests under test, and write no state themselves.
const dtalk = async (s, id, ch = []) => { await s.idle(); await L.calm(s); await s.ev(([id, ch]) => { G.Debug.choices = ch.slice(); return G.Debug.talk(id); }, [id, ch]); await s.idle(); };
const dstep = async (s, x, y, ch = [], ms) => { await s.idle(); await L.calm(s); await s.ev(([x, y, ch]) => { G.Debug.choices = ch.slice(); G.Debug.stepOn(x, y); }, [x, y, ch]); await s.page.waitForTimeout(150); await s.idle(ms); };
async function runNextMorning(browser, open) {
  const s = await open('?debug&startch=1');
  await morning(s);
  await mineAndForeman(s);
  await actEvent(s, 'cage', ['坐上去']);
  await waitMap(s, 'jiufen');
  assert((await s.flags()).ch1_mine_done, 'P3');
  await talkTo(s, 'xiaojin');                       // 阿黃回家 started, left open
  assert(await s.stage('q_ahuang') === 0, 'stage 0');
  // 陳伯: first talk (hint), then the two-step departure warning
  await warpTo(s, 'jiufen_shop');
  await talkTo(s, 'chenbo');
  const n0 = await L.logLen(s);
  await s.ev(() => { G.Debug.choices = ['出發去雞籠', '真的要出發了']; });
  await talkTo(s, 'chenbo', ['出發去雞籠', '真的要出發了']);
  await waitMap(s, 'keelung_fest');
  assert(/支線會暫停到明天早上/.test(await s.ev(() => G.Debug.log.filter((l) => l.startsWith('choice')).slice(-3).join('\n'))), 'the departure choice warns that side quests pause until morning');
  void n0;
  // 雞籠 → 八斗子 → 白芷 → the raid (critical path)
  await dtalk(s, 'moya', [0]);
  await dtalk(s, 'chenbo', [0]);
  await waitMap(s, 'badouzi');
  await dtalk(s, 'chenbo', [1]);
  await level(s, 4, 'ch1.test.js: Lv4 before the reef');
  await dstep(s, 36, 9);
  await dstep(s, 36, 6);
  await waitMap(s, 'jiufen');
  await dstep(s, 19, 24);
  await dstep(s, 19, 15);
  await level(s, 5, 'ch1.test.js: Lv5 before 墨鴉 / 水鬼王');
  await dstep(s, 19, 4, [0], 400000);
  await waitMap(s, 'jiufen_shop', 180000);
  assert((await s.flags()).ch1_morning_after, 'P5');
  await warpTo(s, 'jiufen');
  await warpTo(s, 'jiufen_yuyuan');
  await warpTo(s, 'jiufen');
  await warpTo(s, 'jiufen_teahouse');
  assert((await s.flags()).mochi_joined, 'cats');
  await warpTo(s, 'jiufen');
  // the departure warning names both open 心燈 quests; 再等等 steps back
  const d0 = await s.ev(() => G.Debug.log.length);
  await s.ev(() => { G.Debug.choices = ['再等等']; });
  await goTo(s, 19, 40, { through: true, once: true });
  await s.idle();
  const dl = await s.ev((n) => G.Debug.log.slice(n).join('\n'), d0);
  assert(/pointOfNoReturn ch1: open: q_atu_watch, q_ahuang/.test(dl) && /wait/.test(dl), 'departure warning: ' + dl);
  assert((await s.pos())[1] < 40 && !(await s.flags()).ch1_done, '再等等 keeps 星河 in 九份');
  // P5: the watch from the mine (阿土伯's directions are in the quest log), both 心燈 outside 阿土嬸's door
  await fetchWatch(s);
  await deliverWatch(s, 'outside');
  await talkTo(s, 'awang');                         // P5: the farewell gift comes first, the quest choice on the next talk
  assert(await s.count('jinchuang') >= 2 && await s.stage('q_ahuang') === 0, '阿旺\'s gift');
  await ahuang(s, 'outside');
  // nothing open now: the departure goes through without a prompt
  const d1 = await s.ev(() => G.Debug.log.length);
  await goTo(s, 19, 40, { through: true });
  await s.page.waitForFunction(() => G.state.chapter === 2 && G.state.flags.ch1_done, null, { timeout: 90000 });
  const dl2 = await s.ev((n) => G.Debug.log.slice(n).join('\n'), d1);
  assert(/pointOfNoReturn ch1: nothing open/.test(dl2), 'no warning when both 心燈 are lit: ' + dl2);
  return s;
}

(async () => {
  console.log('第一章　九份燈火 — side quests');
  const browser = await chromium.launch();
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const runs = [
    ['ch1 afternoon: 醒木失竊記 (P1) + 心燈① 阿土伯的懷錶 + 心燈② 阿黃回家 (P3)', runAfternoon],
    ['ch1 next morning: both 心燈 in P5 + departure warnings', runNextMorning],
  ];
  for (const [name, fn] of runs) if (!only.length || only.some((o) => name.includes(o))) await L.run(results, name, browser, fn);
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log('\n' + (fail.length ? `FAIL — ${fail.length}/${results.length}` : `PASS — ${results.length}/${results.length}`));
  process.exit(fail.length ? 1 : 0);
})();

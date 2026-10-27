#!/usr/bin/env node
// 第二章　霧林天燈 — side quests and 心燈, played from the chapter start the way a player can (tools/test/sidequests/lib.js).
//
//   node tools/test/sidequests/ch2.side.js            # both runs, PASS/FAIL per quest, exit 1 on any failure
//   node tools/test/sidequests/ch2.side.js forest     # only runs whose name contains "forest"
//   node tools/test/sidequests/ch2.side.js --shots    # screenshots to tools/test/out/side_ch2/
//
// Run A "forest rescue + letter on the lantern night": 阿竹 → maze → 霧林・南 with 靈視 worn off: the clue at the end of
//   the side path → eat a 七彩靈蕈 → 阿山 → 紅纓 → 平溪 reunion (心燈③) → inn (紅纓的廚房 starts, she says where the three
//   things are) → 周家 (寄到了的信 starts) → 阿全's hint → 阿蘭 → 老厝 → den (clue + tagged 擔子, letter) → cages → the
//   boss warning names 紅纓的廚房 (再等等 steps back, then 繼續) → the letter is read on 天燈之夜 (心燈④) → 八月初五: the
//   bundle back to 阿全 → 阿河 departure warning names 紅纓的廚房 → chapter 3.
// Run B "kitchen + home reunion + letter on 八月初五": 阿山 left in the forest; inn → back to 霧林・南 for the 山蘇 (tagged)
//   and 阿山 (靈視) → reunion at his door (心燈③) → 阿溪 + 翻石頭 (溪蝦) → 竹筍 → 月娘 cooks (紅纓的廚房 done) → den without
//   the 擔子 → boss (no warning: nothing open) → 八月初五: back into the den for the 擔子 → 周家 → dawn lantern (心燈④)
//   → 阿河 departs without a warning.
// The cats (麻糬, 芋圓) join in chapter 1; ?startch=2 alone does not carry them, so their flags are passed in the URL as
// ch2.test.js does. No quest flag, item, stage or var is ever written. Help: battle bot on easy + level raises (logged).
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');
const { assert, waitMap, goTo, interact, talkTo, warpTo, actEvent, level, ff, eatVision } = L;

const SHOTS = process.argv.includes('--shots') ? path.join(L.ROOT, 'tools', 'test', 'out', 'side_ch2') : null;
const results = [];
const START = '?debug&startch=2&flags=mochi_joined,yuyuan_joined';

async function forestToSouth(s, o = {}) {
  await waitMap(s, 'mistforest_n');
  const n0 = await L.logLen(s);
  await goTo(s, 12, 18, { through: true });       // 2-2 阿竹 in the clearing
  await s.idle();
  assert(await s.stage('q_woodcutter') === 0 && await s.count('c2_gong') === 1, '山中的呼喚 starts with the 銅鑼');
  assert(/敲鑼|喊/.test(await L.saidSince(s, n0)), '阿竹 says what to do');
  await warpTo(s, 'mist_loop');
  // the maze (main path, ch2.test.js): its loop-back exits are stepped on directly — walking over the other exits'
  // cells on the way would count extra loops
  const dstep = async (x, y) => { await s.idle(); await s.ev(([x, y]) => G.Debug.stepOn(x, y), [x, y]); await s.page.waitForTimeout(150); await s.idle(); };
  for (const [x, y] of [[23, 9], [0, 10], [11, 19]]) await dstep(x, y);
  await waitMap(s, 'mist_grove');
  await dstep(29, 14);
  await waitMap(s, 'mist_loop');
  for (const [x, y] of [[23, 9], [11, 19], [11, 19]]) await dstep(x, y);
  await dstep(0, 9);
  await waitMap(s, 'mistforest_s');
  assert(await s.count('lingxun') >= 1, 'some 七彩靈蕈 left from the grove: ' + await s.count('lingxun'));
}

// 阿山: from the 霧林・南 path, with 靈視 worn off — the clue at the dead end, then a mushroom
async function rescueAshan(s) {
  await ff(s, 400, 'G.state.vars.vision <= 0');
  assert((await s.ev(() => G.state.vars.vision || 0)) <= 0, '靈視 should have worn off');
  const n0 = await L.logLen(s);
  await goTo(s, 27, 6);                             // the side path east of the entrance ends at the odd trees
  await s.idle();
  const clue = await L.saidSince(s, n0);
  assert(/靈視/.test(clue) && /雞腿|嘻嘻/.test(clue), 'a clue at the illusion trees: ' + clue);
  await s.shot(SHOTS, 'ashan_clue');
  const n1 = await L.logLen(s);
  await interact(s, 28, 6);                         // the odd tree itself
  assert(/影子/.test(await L.saidSince(s, n1)), 'the illusion tree hints at its shadow');
  await eatVision(s);
  await s.page.waitForTimeout(200);
  assert(await s.ev(() => !G.mapScene.blocked(28, 6)), 'illusion trees gone with 靈視');
  await s.shot(SHOTS, 'ashan_vision');
  await goTo(s, 30, 6, { through: true });          // into the clearing → gong → 魔神仔頭
  await s.idle();
  assert((await s.flags()).ch2_woodcutter_found && await s.stage('q_woodcutter') === 1, '阿山 found (stage 1)');
  assert(await s.ev(() => !!G.mapScene.actor('ashan_f')), '阿山 follows the party');
}

async function duel(s) {
  await goTo(s, 19, 20, { through: true });
  await s.idle();
  const f = await s.flags();
  assert(f.ch2_duel && f.ch2_hongying_join, '紅纓 joined');
}

async function toInn(s) {
  await warpTo(s, 'pingxi');
  await s.idle();
  assert((await s.flags()).ch2_pingxi_arrive, '2-10');
  const n0 = await L.logLen(s);
  await warpTo(s, 'pingxi_inn');                    // 2-11 night → morning → 紅纓的廚房 starts
  await s.idle();
  assert((await s.flags()).ch2_morning && await s.stage('q_hy_kitchen') === 0, '紅纓的廚房 starts in the morning');
  const lines = await L.saidSince(s, n0);
  assert(/竹林/.test(lines) && /阿溪/.test(lines) && /霧林・南/.test(lines), '紅纓 says where the three things are: ' + lines.slice(-400));
  await warpTo(s, 'pingxi');
}

async function letterStart(s) {
  await warpTo(s, 'pingxi_oldhouse');
  await talkTo(s, 'zhou_bo_in').catch(async () => talkTo(s, await s.ev(() => G.mapScene.npcs.find((n) => n.visible && /周/.test(n.name || '')).id)));
  assert(await s.stage('q_letter') === 0, '寄到了的信 starts at 周家');
  await warpTo(s, 'pingxi');
  const n0 = await L.logLen(s);
  await talkTo(s, 'aquan');
  const l = await L.saidSince(s, n0);
  assert(/虎姑婆/.test(l) && /阿興/.test(l), '阿全 + 星河 point at the tiger\'s den: ' + l.slice(-300));
}

// 阿蘭's test, 老厝, into the den. Ends inside tiger_den.
async function toDen(s) {
  await warpTo(s, 'tiger_lair');
  await level(s, 9, 'ch2.test.js raises the party to Lv9 before the bamboo grove (虎姑婆 is balanced for it)');
  await goTo(s, 12, 19, { through: true }); // 阿蘭: 白芷伸手, 用熱油, 回家
  await s.ev(() => { G.Debug.choices = ['白芷伸手', '用熱油', '回家']; });
  await s.idle();
  assert((await s.flags()).ch2_alan_trust, '阿蘭 trusts the party');
  await warpTo(s, 'tiger_house');
  assert((await s.flags()).ch2_granny_house, '老厝');
  await warpTo(s, 'tiger_lair');
  await warpTo(s, 'tiger_den');
}
async function cages(s) {
  // the child in each cage is an NPC on the cage cell: talking to them opens the cage too (cage1 / cage2)
  await actEvent(s, 'cage1', [], { any: true });
  assert((await s.flags()).ch2_cage1, 'cage 1');
  if (!(await s.ev(() => G.mapScene.visionOn()))) await eatVision(s);   // the breathing wall (星河 says so when touched)
  await actEvent(s, 'cage2', [], { any: true });
  assert((await s.flags()).ch2_cage2, 'cage 2');
  assert(await s.ev(() => !G.mapScene.blocked(15, 11)), 'gate open after both cages');
}
async function boss(s, expectWarn) {
  const n0 = await s.ev(() => G.Debug.log.length);
  if (expectWarn) {
    await s.ev(() => { G.Debug.choices = ['再等等']; });
    await goTo(s, 15, 10, { through: true, once: true });
    await s.idle();
    const dl = await s.ev((n) => G.Debug.log.slice(n).join('\n'), n0);
    assert(/pointOfNoReturn ch2: open: q_hy_kitchen/.test(dl) && /pointOfNoReturn ch2: wait/.test(dl), 'the boss warning should name 紅纓的廚房: ' + dl);
    assert(!(await s.flags()).ch2_tiger_beaten && (await s.pos())[1] > 10, '再等等 steps back');
    await s.ev(() => { G.Debug.choices = ['繼續']; });
  }
  await goTo(s, 15, 10, { through: true });
  await s.page.waitForFunction(() => G.state.flags.ch2_dawn, null, { timeout: 400000 });
  await waitMap(s, 'pingxi');
  if (!expectWarn) {
    const dl = await s.ev((n) => G.Debug.log.slice(n).join('\n'), n0);
    assert(/pointOfNoReturn ch2: nothing open/.test(dl), 'no boss warning when nothing is open: ' + dl);
  }
}
async function depart(s, expect) {
  await warpTo(s, 'shifen_falls');
  const n0 = await s.ev(() => G.Debug.log.length);
  await s.ev(() => { G.Debug.choices = ['出發', '繼續']; });
  await talkTo(s, 'ahe', ['出發', '繼續']);
  await s.page.waitForFunction(() => G.state.chapter === 3 && G.state.flags.ch2_done, null, { timeout: 90000 });
  const dl = await s.ev((n) => G.Debug.log.slice(n).join('\n'), n0);
  if (expect) assert(expect.test(dl), 'departure warning: ' + dl);
  else assert(/pointOfNoReturn ch2: nothing open/.test(dl), 'no open side content at the departure: ' + dl);
}

// ------------------------------------------------------------------------------------------------ run A
async function runA(browser, open) {
  const s = await open(START);
  await forestToSouth(s);
  await rescueAshan(s);
  await duel(s);
  await toInn(s);                                    // the reunion ran on arrival (阿山 followed us)
  assert(await s.lantern('xd_woodcutter') && await s.stage('q_woodcutter') === 'done', '心燈③ 山中的呼喚 lit on arrival');
  assert(await s.count('c2_shansu') >= 2, '阿山\'s 山蘇');
  await letterStart(s);
  await toDen(s);
  const n0 = await L.logLen(s);
  await s.idle();
  // the den intro links the 擔子 (it ran on entry)
  const intro = await s.ev(() => window.__said.slice(-12).join('\n'));
  assert(/擔子/.test(intro), 'the den intro mentions the porter\'s load: ' + intro);
  void n0;
  const tag = await s.ev(() => { const e = G.mapScene.def.events.find((x) => x.id === 'bundle'); return !!(e && e.hint && G.mapScene.eventOk(e)); });
  assert(tag, 'the 擔子 has a hint tag');
  await actEvent(s, 'bundle');
  assert(await s.count('key_sonletter') === 1 && await s.stage('q_letter') === 1, 'letter found');
  await s.shot(SHOTS, 'den_bundle');
  await cages(s);
  await boss(s, true);                               // 紅纓的廚房 is open with no 溪蝦: warned
  assert(await s.lantern('xd_letter') && await s.stage('q_letter') === 'done', '心燈④ 寄到了的信 lit on 天燈之夜');
  await talkTo(s, 'aquan');
  assert(await s.count('c2_porter_sandals') === 1, '挑夫草鞋 for the bundle');
  await depart(s, /pointOfNoReturn ch2: open: q_hy_kitchen\n/);
  return s;
}

// ------------------------------------------------------------------------------------------------ run B
async function runB(browser, open) {
  const s = await open(START);
  await forestToSouth(s);
  await duel(s);                                     // leave 阿山 for now
  await toInn(s);
  assert(await s.stage('q_woodcutter') === 0, '阿山 still missing');
  // back to 霧林・南: the 山蘇 (tagged) and 阿山
  await warpTo(s, 'mistforest_s');
  await goTo(s, 4, 31);
  assert(await s.ev(() => { const e = G.mapScene.def.events.find((x) => x.id === 'shansu'); return e.hint(G.state); }), '山蘇 tagged');
  await actEvent(s, 'shansu');
  assert(await s.count('c2_shansu') === 1, '山蘇 picked');
  await rescueAshan(s);
  await warpTo(s, 'pingxi');                         // 阿山 follows: reunion at his door
  await s.idle();
  if (!(await s.lantern('xd_woodcutter'))) { await goTo(s, 41, 21); await s.idle(); }
  assert(await s.lantern('xd_woodcutter') && await s.stage('q_woodcutter') === 'done', '心燈③ at 阿山\'s house');
  // 溪蝦: 阿溪 first, then the stones (random: up to three tries, then 阿溪 shares)
  await talkTo(s, 'axi');
  await actEvent(s, 'shrimp', ['左邊', '中間', '右邊']);
  assert(await s.count('c2_shrimp') === 1, '溪蝦');
  await actEvent(s, 'shoot');
  assert(await s.count('c2_bamboo_shoot') === 1, '竹筍');
  await warpTo(s, 'pingxi_inn');
  await talkTo(s, 'yueniang');
  const r = await s.ev(() => ({ done: G.Quests.isDone('q_hy_kitchen'), c: G.Inv.count('c2_hy_charcoal'), soup: G.Inv.count('c2_shoot_soup') }));
  assert(r.done && r.c === 3 && r.soup === 2, '紅纓的廚房: ' + JSON.stringify(r));
  await warpTo(s, 'pingxi');
  await toDen(s);
  await cages(s);
  await boss(s, false);
  assert(!(await s.lantern('xd_letter')), 'no letter yet');
  // 八月初五: back to the den for the 擔子
  await warpTo(s, 'tiger_lair');
  await warpTo(s, 'tiger_den');
  await actEvent(s, 'bundle');
  assert(await s.count('key_sonletter') === 1, 'letter found after the boss');
  await warpTo(s, 'tiger_lair');
  await warpTo(s, 'pingxi');
  await warpTo(s, 'pingxi_oldhouse');
  const zid = await s.ev(() => G.mapScene.npcs.find((n) => n.visible && /周/.test(n.name || '')).id);
  await talkTo(s, zid);
  await s.idle();
  assert(await s.lantern('xd_letter') && await s.stage('q_letter') === 'done', '心燈④ at dawn');
  if ((await s.map()) !== 'pingxi') await warpTo(s, 'pingxi');
  await talkTo(s, 'aquan');
  assert(await s.count('c2_porter_sandals') === 1, '挑夫草鞋');
  await depart(s, null);
  return s;
}

(async () => {
  console.log('第二章　霧林天燈 — side quests');
  const browser = await chromium.launch();
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const runs = [
    ['ch2 A forest rescue: 心燈③ 山中的呼喚 (forest) + 心燈④ 寄到了的信 (lantern night) + warnings', runA],
    ['ch2 B kitchen: 紅纓的廚房 + 心燈③ (home reunion) + 心燈④ (八月初五 dawn)', runB],
  ];
  for (const [name, fn] of runs) if (!only.length || only.some((o) => name.includes(o))) await L.run(results, name, browser, fn);
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log('\n' + (fail.length ? `FAIL — ${fail.length}/${results.length}` : `PASS — ${results.length}/${results.length}`));
  process.exit(fail.length ? 1 : 0);
})();

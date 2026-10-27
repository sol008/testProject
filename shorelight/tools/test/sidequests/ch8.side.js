#!/usr/bin/env node
// Chapter 8 side quests & 心燈, played the way a player can (see lib.js): no quest flags/items/stages are set.
//   node tools/test/sidequests/ch8.side.js [--only pilgrims,oyster,warn] [--headed]
'use strict';
const { assert, runAll } = require('./lib68');

const tests = [];
const test = (id, name, fn, opts) => tests.push({ id, name, fn, opts });
const rect = (x, y, w, h) => { const o = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.push([x + i, y + j]); return o; };

// what a player owns by now (ch8 shop stock), as in tools/test/chapters/ch8.test.js
async function gear(s) {
  await s.ev(() => {
    const E = { xinghe: ['c8_liuguang', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_qingxin'], hongying: ['c8_jingtao', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_huzhao'], yungui: ['c8_leiyin', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_yeming'] };
    for (const id in E) for (const it of E[id]) { G.Inv.add(it, 1); G.Party.equip(id, G.Data.items[it].type, it); }
    G.Party.healAll();
  });
}
// P8-2 sluice (main story), solved as the guide says: south A (entrance) → courtyard → B → east C → courtyard A
async function sluice(s) {
  await s.act(18, 36, [], 'obj:switch');
  await s.walk([20, 27]);
  await s.ev(() => { G.mapScene.enemies = []; });
  await s.act(25, 18, [], 'obj:switch');
  await s.act(37, 10, [], 'obj:switch');
  await s.act(18, 28, [], 'obj:switch');
  const g = await s.ev(() => ['A', 'B', 'C'].map((k) => k + '=' + !!G.state.flags['ch8_gate_' + k]).join(' ') + ' @' + G.mapScene.player.x + ',' + G.mapScene.player.y);
  assert(await s.ev(() => G.state.flags.ch8_gate_C && !G.state.flags.ch8_gate_A), 'channel 3 dry (' + g + ')');
}
// main-story progress flags (not the side quests' own) for debug start points, as in ch8.test.js
const F_ANPING = 'mochi_joined,yuyuan_joined,ch8_start,ch8_no_boat,ch8_jiajiang_seen,ch8_dusk,ch8_qijia,ch8_zuanjiao,ch8_surge,ch8_river_intro,ch8_afu_shown,ch8_afu_found,' +
  'ch8_rescue_over,ch8_hundred_done,ch8_surge_end,ch8_dawn_done,ch8_clue_anping';
const AP = (x, y) => `?debug&map=anping&x=${x}&y=${y}&lv=28&party=xinghe,hongying,yungui&chapter=8&flags=${F_ANPING}`;

// ---------------------------------------------------------------- 北港的香客 (lantern_beigang_pilgrims)
test('pilgrims', '心燈「北港的香客」：北港 → 起駕 → 逆潮之夜 五名香客（潮位 8 以內）→ 百手 → 黎明廟埕', async (s) => {
  await s.open('?debug&startch=8');
  assert(await s.map() === 'beigang', 'chapter start in 北港');
  await gear(s);
  await s.talk('boatman');
  await s.walk(rect(9, 12, 38, 2), '(八家將)');
  assert(await s.flag('ch8_jiajiang_seen'), '8-1c');
  await s.talk('keeper', ['準備好了']);
  assert(await s.flag('ch8_qijia'), '8-2 起駕');
  await s.walk(rect(23, 24, 10, 5), '(surge)');
  assert(await s.map() === 'beigang_river' && await s.stage('q_ch8_pilgrims') === 0, 'river; quest started');
  // the river intro names the places; the player goes zone by zone, drinking 平安茶 at the procession in between
  const zones = { 1: rect(26, 2, 6, 8), 3: rect(33, 1, 10, 7), 4: rect(14, 18, 6, 4), 2: rect(6, 21, 7, 7) };
  for (const k of [1, 3, 4, 2]) {
    if (await s.flag('ch8_saved_' + k)) continue;
    await s.talk('rv_aunt');
    await s.walk(zones[k], '(pilgrim ' + k + ')');
    await s.idle();
    s.note(`after ${k}: saved ${await s.flag('ch8_saved')} tide ${await s.flag('ch8_tide')}`);
  }
  if (!await s.flag('ch8_saved_5') && await s.flag('ch8_afu_shown')) { await s.walk(rect(34, 29, 9, 4), '(阿福)'); await s.idle(); }
  assert(await s.flag('ch8_saved') === 5 && !await s.flag('ch8_tide_fail'), 'all five saved before the tide filled (tide ' + await s.flag('ch8_tide') + ')');
  assert(await s.stage('q_ch8_pilgrims') === 1, 'stage 1: back to the temple at dawn');
  await s.talk('rv_aunt');
  await s.walk(rect(42, 32, 6, 8), '(河口)');
  await s.until('G.mapScene.def.id === "beigang" && G.state.flags.ch8_dawn_done', 600);
  await s.idle();
  assert(await s.done('q_ch8_pilgrims') && await s.lit('lantern_beigang_pilgrims') && await s.item('c8_mazubing') === 5, 'quest done, 心燈 lit, 媽祖餅 ×5');
});

// ---------------------------------------------------------------- 蚵殼阿嬤 (lantern_oyster_grandma)
test('oyster', '心燈「蚵殼阿嬤」：安平海邊 阿嬤 →「您不傻」→ 舊城 → 觀潮台 → 黎明回海邊', async (s) => {
  await s.open(AP(41, 17));
  await gear(s);
  assert(await s.flag('ch8_anping'), '8-4 安平 intro');
  await s.talk('oyster', ['您不傻']);
  assert(await s.flag('ch8_sq_oyster') === 1 && await s.stage('q_ch8_oyster') === 0, 'stage 0: honest answer');
  await s.talk('disciple'); await s.talk('disciple');
  await s.talk('axing');
  assert(await s.flag('ch8_dusk_ap'), 'dusk');
  await s.choose(['入夜']);
  await s.walk([21, 2], '(舊城門)');
  await s.idle();
  assert(await s.map() === 'anping_fort', 'fort');
  // P8-2 sluice (main story), as a player: A → courtyard → B, C → close A
  await s.ev(() => { G.mapScene.enemies = []; });
  await sluice(s);
  for (const L of [36]) await s.ev((L) => { for (const m of G.Party.active()) while (m.lv < L) G.Party.addExpTo(m, G.Party.expToNext(m.lv) - m.exp, []); G.Party.healAll(); }, L); // as ch8.test.js: 洛青鋒 is tuned for a stronger party than the bot plays
  await s.exit('anping_tower');
  await s.until('G.mapScene.def.id === "anping" && G.state.flags.ch8_end', 900);
  await s.idle();
  assert(await s.stage('q_ch8_oyster') === 1, 'stage 1: 「回去看看阿嬤」');
  assert(/蚵殼阿嬤/.test(await s.ev(() => G.state.vars.objective || '')), 'dawn objective points at the grandma');
  await s.talk('oyster');
  assert(await s.done('q_ch8_oyster') && await s.lit('lantern_oyster_grandma') && await s.item('shimuyu') >= 5, 'quest done, 心燈 lit, 虱目魚粥');
});

// ---------------------------------------------------------------- warnings
test('warn', '蚵殼阿嬤：沒跟阿嬤說話就上觀潮台 → 1 盞心燈未點亮；黎明沒回去 → 陳伯出發前點名', async (s) => {
  await s.open(AP(41, 17));
  await gear(s);
  await s.talk('disciple'); await s.talk('disciple');
  await s.talk('axing');
  await s.choose(['入夜']);
  await s.walk([21, 2]);
  await s.idle();
  await s.ev(() => { G.mapScene.enemies = []; });
  await sluice(s);
  await s.choose(['再等等']);
  await s.exit('anping_tower');
  let log = await s.ev(() => G.Debug.log.filter((l) => /pointOfNoReturn/.test(l)).join(' | '));
  assert(/open: lantern_oyster_grandma/.test(log) && await s.map() === 'anping_fort', 'tower gate counts the unstarted 心燈; 再等等 stays');
  s.note(log);
  // back to 安平 by the courtyard's 潮信石 (channel 1 is flooded now) and start it: the grandma is still on the beach
  await s.act(15, 17, ['回到安平'], 'obj:crystal');
  assert(await s.map() === 'anping', '潮信石 → 安平');
  await s.talk('oyster', ['您不傻']);
  assert(await s.flag('ch8_sq_oyster') === 1, 'started at night');
  await s.ev(() => { G.mapScene.enemies = []; });
  await s.exit('anping_fort');
  await s.ev(() => { G.mapScene.enemies = []; for (const m of G.Party.active()) while (m.lv < 36) G.Party.addExpTo(m, G.Party.expToNext(m.lv) - m.exp, []); G.Party.healAll(); });
  await s.exit('anping_tower');
  await s.until('G.mapScene.def.id === "anping" && G.state.flags.ch8_end', 900);
  await s.idle();
  await s.ev(() => { G.Debug.log.length = 0; });
  await s.talk('chenbo_ap', ['出發', '再等等']);
  log = await s.ev(() => G.Debug.log.filter((l) => /pointOfNoReturn/.test(l)).join(' | '));
  s.note(log);
  assert(/open: q_ch8_oyster/.test(log) && await s.ev(() => G.state.chapter) === 8, '陳伯 names 蚵殼阿嬤; 再等等 stays');
});

module.exports = { tests };
if (require.main === module) runAll('ch8 side quests', tests);

#!/usr/bin/env node
// Chapter 7 side quests & 心燈, played the way a player can (see lib.js): no quest flags/items/stages are set.
//   node tools/test/sidequests/ch7.side.js [--only salt,pasuya,warn,mush,murals] [--headed]
'use strict';
const { assert, runAll } = require('./lib68');

const tests = [];
const test = (id, name, fn, opts) => tests.push({ id, name, fn, opts });

// chapter start → 甘蔗田 → 牛車 → 阿里山古道 (optionally buying salt from 老吳) → 黑熊 → 鄒族大社
async function toTribe(s, salt) {
  await s.open('?debug&startch=7&flags=yuyuan_joined,mochi_joined');
  assert(await s.map() === 'sugar_shrine', 'chapter start in the cane field');
  await s.talk('ss_abo', ['上車']);
  assert(await s.map() === 'alishan_trail', 'cart ride to 阿里山古道');
  if (salt) {
    await s.buy('laowu', { c7_salt: 1 }, ['看看貨']);
    assert(await s.stage('q_ch7_salt') === 0, '老吳的鹽 starts when the salt is bought');
  }
  const cells = [];
  for (let x = 18; x < 32; x++) cells.push([x, 12]);
  await s.walk(cells, '(black bear)');
  assert(await s.flag('ch7_bear_freed'), '黑熊 freed, Voyu met');
  await s.exit('tsou_hosa');
  assert(await s.flag('ch7_tsou_welcome'), 'tribe welcome');
}
async function night(s) {
  await s.exit('tsou_house');
  await s.talk('mother', ['在火塘邊休息']);
  assert(await s.flag('ch7_pasuya_told') && await s.flag('ch7_morning'), 'night by the hearth, morning');
  await s.exit('tsou_hosa');
}

// ---------------------------------------------------------------- 老吳的鹽 (no 心燈)
test('salt', '老吳的鹽：老吳提示 → 交易寮買粗鹽 → 部落小米架旁的婦人 → 愛玉凍 ×3', async (s) => {
  await toTribe(s, true);
  await s.talk('tw1');
  assert(await s.done('q_ch7_salt') && await s.item('c7_aiyudong') === 3 && !await s.item('c7_salt'), 'quest done, 愛玉凍 ×3, salt handed over');
});

// ---------------------------------------------------------------- 霧中的獵刀 (lantern_tsou_hunter)
test('pasuya', '心燈「霧中的獵刀」：火塘夜 → 早上 Voyu → 神木林倒木 → 霧谷三處微光 → 帶回給母親', async (s) => {
  await toTribe(s, false);
  await night(s);
  await s.talk('voyu');
  assert(await s.stage('q_ch7_pasuya') === 0, 'stage 0: Voyu asks');
  assert(/霧谷/.test(await s.ev(() => G.state.vars.objective || '')), 'objective points at the 霧谷');
  await s.exit('alishan_forest');
  s.note('倒木 clue: ' + JSON.stringify(await s.clue(6, 23, 2, 1)));
  await s.act(6, 23, [], 'event:log');
  assert(await s.flag('ch7_log_moved'), '紅纓 moves the log');
  await s.ev(() => { G.mapScene.enemies = []; });   // the valley's two roaming monsters are not part of the quest
  for (const [x, y, w] of [[10, 29, 1], [4, 32, 1], [10, 35, 2]]) {
    s.note(`微光 (${x},${y}) clue: ` + JSON.stringify(await s.clue(x, y, w, 1)) + ' light: ' + await s.ev(([x, y]) => (G.Mapx.val ? G.Mapx.val(G.mapScene.def.lights) : G.mapScene.def.lights) && true, [x, y]));
    await s.act(x, y, [], 'event:mark');
  }
  assert(await s.stage('q_ch7_pasuya') === 1 && await s.item('c7_key_cap') && await s.item('c7_key_knife'), 'stage 1: cap & knife found');
  await s.exit('tsou_hosa');
  await s.talk('voyu');
  await s.exit('tsou_house');
  await s.talk('mother');
  assert(await s.done('q_ch7_pasuya') && await s.lit('lantern_tsou_hunter') && await s.item('c7_hulu') === 1, 'quest done, 心燈 lit, 小葫蘆');
  assert(!/皮帽/.test(await s.ev(() => G.state.vars.objective || '')), 'objective moves on after the delivery');
});

// ---------------------------------------------------------------- the 玉山 upper gate warns about both
test('warn', '玉山山徑「繼續往上走」：未接 Voyu → 1 盞心燈未點亮；鹽沒送 → 點名老吳的鹽；再等等可以回頭', async (s) => {
  await toTribe(s, true);
  await night(s);
  await s.exit('alishan_forest');
  await s.ev(() => { G.mapScene.enemies = []; });
  await s.walk([[16, 13]]);
  assert(await s.flag('ch7_shenmu'), '神木');
  await s.walk([[39, 12]]);
  assert(await s.flag('ch7_seaofclouds'), '雲海');
  await s.exit('yushan_trail');
  assert(await s.map() === 'yushan_trail', 'on the 玉山 trail');
  await s.choose(['繼續往上走', '再等等']);
  await s.walk([[21, 27], [22, 27]]);
  const log = await s.ev(() => G.Debug.log.filter((l) => /pointOfNoReturn/.test(l)).join(' | '));
  s.note(log);
  assert(/open: q_ch7_salt, lantern_tsou_hunter/.test(log) && !await s.flag('ch7_upper'), 'prompt names 老吳的鹽 and counts the unstarted 心燈; 再等等 steps back');
});

// ---------------------------------------------------------------- 雲歸的蕈譜：雲芝 (q_tuanzi_mush, cross-chapter)
const F_CLOUD = 'yuyuan_joined,mochi_joined,ch7_intro,ch7_cart,ch7_rode,ch7_trader,ch7_bear_freed,ch7_voyu,ch7_tsou_welcome,ch7_tasan_told,ch7_pasuya_told,ch7_morning,' +
  'ch7_shenmu,ch7_seaofclouds,ch7_yushan_enter,ch7_upper,ch7_biung,ch7_bunun_shelter,ch7_pasibutbut_heard,ch7_flood_legend,ch7_bunun_farewell';
test('mush', '雲歸的蕈譜・雲芝：雲霧林 發光菇叢中的「調查」標籤', async (s) => {
  await s.open('?debug&map=cloud_forest&lv=25&chapter=7&flags=' + F_CLOUD);
  s.note('雲芝 clue: ' + JSON.stringify(await s.clue(8, 20)));
  assert((await s.clue(8, 20)).some((c) => /^hint:/.test(c)), '雲芝 has a hint tag');
  await s.ev(() => { G.mapScene.enemies = []; });
  await s.act(8, 20, [], 'event:yunzhi');
  assert(await s.flag('mush_ch7') && await s.item('mat_yunzhi') && await s.stage('q_tuanzi_mush') === 9, '雲芝 recorded');
});

// ---------------------------------------------------------------- 燈母祠的壁畫 (lantern_lamp_murals)
const F_SHRINE = F_CLOUD + ',ch7_tengpo_met,ch7_dieta,ch7_rite,ch7_vision_enter,ch7_trial_hongying,ch7_trial_yungui,ch7_xinhuo,ch7_dawn_after,ch7_thao_met,ch7_white_deer,ch7_lalu_respect,ch7_chuyin,ch7_jiao,ch7_shrine_revealed';
test('murals', '心燈「燈母祠的壁畫」：上殿三幅 → 五行燈 → 下殿三幅 → 巨門前的提醒', async (s) => {
  await s.open('?debug&map=lamp_shrine&lv=27&chapter=7&flags=' + F_SHRINE);
  await s.ev(() => { G.mapScene.enemies = []; });
  for (const [i, x] of [[1, 4], [2, 11], [3, 26]]) {
    s.note(`壁畫${i} clue: ` + JSON.stringify(await s.clue(x, 17, 2, 1)));
    await s.act(x, 17, [], 'event:m' + i);
  }
  assert(await s.stage('q_ch7_murals') === 0, 'quest starts at the first mural');
  // 五行燈 (main-story puzzle, solved as a player would: the 春 inscription's order 木火土金水)
  for (const el of ['wood', 'fire', 'earth', 'metal', 'water']) {
    const p = await s.ev((el) => { const e = G.mapScene.def.events.find((x) => x.id === 'wx_' + el); return e && [e.x, e.y]; }, el);
    if (!p || await s.flag('ch7_lamp_puzzle')) break;
    await s.act(p[0], p[1], [], 'event:wx_' + el);
  }
  assert(await s.flag('ch7_lamp_puzzle'), '五行燈 solved');
  await s.exit('lamp_shrine_lower');
  await s.ev(() => { G.mapScene.enemies = []; });
  for (const [i, x] of [[4, 4], [5, 11]]) await s.act(x, 17, [], 'event:m' + i);
  // the big door: 雲歸's one-time hint + the point-of-no-return prompt while one mural is unread
  await s.exit('lamp_shrine_core');
  assert(await s.map() === 'lamp_shrine_lower' && await s.flag('ch7_mural_hint'), '雲歸: 「牆上還有畫沒看完」 (one time)');
  await s.choose(['推開巨門', '再等等']);
  await s.exit('lamp_shrine_core');
  const log = await s.ev(() => G.Debug.log.filter((l) => /pointOfNoReturn/.test(l)).join(' | '));
  s.note(log);
  assert(/open: q_ch7_murals/.test(log) && await s.map() === 'lamp_shrine_lower', 'prompt names 燈母祠的壁畫; 再等等 stays');
  await s.act(26, 17, [], 'event:m6');
  assert(await s.done('q_ch7_murals') && await s.lit('lantern_lamp_murals'), 'six murals read → 心燈 lit');
});

// ---------------------------------------------------------------- 3D spot check (visual-only clues)
const SHOTS = process.env.SHOTS || null;
test('3d_valley', '3D：霧谷的三處「微光」在 3D 檢視下也有光', async (s) => {
  await toTribe(s, false);
  assert(await s.ev(() => !!G.mapScene.view3d), '3D view active');
  await night(s);
  await s.talk('voyu');
  await s.exit('alishan_forest');
  await s.act(6, 23, [], 'event:log');
  await s.ev(() => { G.mapScene.enemies = []; });
  await s.walk([8, 28]);
  await s.ff(1);
  await s.shot(SHOTS, 'ch7_3d_valley');
  assert(await s.ev(() => { const L = G.mapScene.def.lights; const ls = typeof L === 'function' ? L(G.state) : L; return ls.filter((l) => l.color === '#cfe8ff').length === 3; }), 'three glimmer lights');
}, { render3d: true });
test('3d_yunzhi', '3D：雲芝的「調查」標籤', async (s) => {
  await s.open('?debug&map=cloud_forest&lv=25&chapter=7&flags=' + F_CLOUD);
  await s.ev(() => { G.mapScene.enemies = []; });
  await s.walk([[8, 21], [7, 20], [9, 20], [8, 19]], '(next to the 雲芝)');
  await s.ff(1);
  await s.shot(SHOTS, 'ch7_3d_yunzhi');
}, { render3d: true });

module.exports = { tests };
if (require.main === module) runAll('ch7 side quests', tests);

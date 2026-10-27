#!/usr/bin/env node
// Chapter 6 side quests & 心燈, played the way a player can (see lib.js): no quest flags/items/stages are set.
//   node tools/test/sidequests/ch6.side.js [--only ayi,linto,mush] [--headed]
'use strict';
const { assert, runAll } = require('./lib');

// the debug party starts in its starting gear: give it what a player would own by now (shop stock of ch5–6)
async function gear(s) {
  await s.ev(() => {
    const kit = { xinghe: ['sw_qixing', 'c6_brocade_m'], baizhi: ['fl_baiyu', 'c6_brocade_f'], hongying: ['sp_qilin', 'c6_brocade_f'], yungui: ['fn_qixing', 'c6_brocade_m'] };
    for (const id in kit) {
      if (!G.state.members[id]) continue;
      for (const it of kit[id].concat(['hd_yuguan', 'ft_lupi'])) { G.Inv.add(it, 1); G.Party.equip(id, G.Data.items[it].type, it); }
    }
    G.Inv.add('xumingsan', 6); G.Inv.add('huanhunxiang', 4); G.Party.healAll();
  });
}

const tests = [];
const test = (id, name, fn, opts) => tests.push({ id, name, fn, opts });

// ---------------------------------------------------------------- 轎夫與母親 (lantern_yanshui)
test('ayi', '心燈「轎夫與母親」：鹽水 阿義 → 蜂炮夜 → 大疫塚 → 神轎回駕', async (s) => {
  await s.open('?debug&startch=6');
  assert(await s.map() === 'yanshui', 'chapter start ends in 鹽水');
  await gear(s);
  // before the temple 阿義 only talks about the palanquin; the quest starts after 林伯's story
  await s.talk('ys_bearer');
  assert(await s.stage('q_yanshui_mother') < 0, 'quest not started before the temple');
  await s.exit('yanshui_temple');
  assert(await s.flag('ch6_yanshui'), '3-2 temple scene');
  await s.exit('yanshui');
  await s.talk('ys_bearer');
  assert(await s.flag('ch6_ayi_met') && await s.stage('q_yanshui_mother') === 0, 'stage 0: 阿義 met');
  await s.exit('yanshui_temple');
  await s.talk('ys_keeper', ['開始吧']);
  assert(await s.flag('ch6_beehive'), '蜂炮夜 finished');
  assert(await s.stage('q_yanshui_mother') === 1, 'stage 1 after the night (got ' + await s.stage('q_yanshui_mother') + ')');
  assert(!await s.ev(() => G.mapScene.npcs.some((n) => n.id === 'ys_bearer' && n.visible)), '阿義 left the main street');
  assert(/大疫塚/.test(await s.ev(() => G.state.vars.objective || '')), 'objective points at the 大疫塚');
  await s.talk('ys_ayi_mother');
  assert(await s.flag('ch6_ayi_mother') && await s.stage('q_yanshui_mother') === 2, 'stage 2: mother found');
  const r = await s.walk([21, 22], '(main street)');
  assert(r === 'event', 'stepping onto the main street starts 神轎回駕');
  assert(await s.done('q_yanshui_mother') && await s.lit('lantern_yanshui') && await s.item('c6_wumiao_charm') === 1, 'quest done, 心燈 lit, 武廟平安符');
  assert(await s.ev(() => G.state.lanterns && (Array.isArray(G.state.lanterns) ? G.state.lanterns.includes('lantern_yanshui') : !!G.state.lanterns.lantern_yanshui)), 'G.state.lanterns has lantern_yanshui');
});

test('ayi_warn', '轎夫與母親：錯過警告（未接就按「開始吧」、接了沒做完就睡覺）+ 林伯的提示', async (s) => {
  await s.open('?debug&startch=6');
  await s.exit('yanshui_temple');
  await s.talk('ys_keeper', ['開始吧', '再等等']);
  const log = await s.ev(() => G.Debug.log.join('\n'));
  assert(/pointOfNoReturn ch6: open: lantern_yanshui/.test(log) && !await s.flag('ch6_night'), 'unstarted: 「1 盞心燈未點亮」 prompt, 再等等 keeps the night from starting');
  s.note('log: ' + log.split('\n').filter((l) => /pointOfNoReturn/.test(l)).join(' | '));
  await s.exit('yanshui');
  await s.talk('ys_bearer');
  await s.exit('yanshui_temple');
  await s.talk('ys_keeper', ['開始吧']);
  await s.exit('yanshui_inn');
  await s.talk('ys_innkeeper', ['休息到天亮', '再等等']);
  const log2 = await s.ev(() => G.Debug.log.join('\n'));
  assert(/pointOfNoReturn ch6: open: q_yanshui_mother/.test(log2) && await s.map() === 'yanshui_inn', 'started: the inn names 轎夫與母親 and 再等等 stays in 鹽水');
});

// main-story progress flags (not the side quests' own) used as debug start points
const F_BEEHIVE = 'ch6_start,ch6_arrive_ys,ch6_yanshui,ch6_night,ch6_beehive';
const F_ROUZONG = F_BEEHIVE + ',ch6_fucheng,ch6_fc_arrive,ch6_moya,ch6_sixteen,ch6_rouzong';

// ---------------------------------------------------------------- 林投姐 (lantern_linto, main story)
test('linto', '心燈「林投姐」：鹽水客棧 → 府城 → 做十六歲 → 肉粽伯 → 林投林 → 林投姐', async (s) => {
  await s.open('?debug&map=yanshui_inn&lv=21&chapter=6&flags=' + F_BEEHIVE);
  await gear(s);
  await s.talk('ys_innkeeper', ['休息到天亮']);
  assert(await s.map() === 'fucheng' && await s.flag('ch6_fc_arrive'), 'arrived in 府城');
  await s.walk([6, 8]);
  assert(await s.flag('ch6_moya'), '墨鴉 scene');
  await s.exit('fc_qiniang');
  assert(await s.flag('ch6_sixteen') && await s.item('c6_zheng_zongzi') === 0, '做十六歲');
  await s.exit('fucheng');
  await s.walk([[19, 14], [20, 14], [21, 14], [22, 14], [23, 14], [19, 15], [20, 15], [21, 15], [22, 15], [23, 15]]);
  assert(await s.flag('ch6_rouzong') && await s.item('c6_zheng_zongzi') === 2, '肉粽伯 gives 鄭家肉粽 ×2');
  await s.exit('linto');
  assert(await s.map() === 'linto', 'entered 林投林');
  // the crying path: walk the shortest real path to the old pandanus (dead ends send the party back; retry)
  for (let i = 0; i < 6 && !await s.flag('ch6_linto_done'); i++) await s.walk([[14, 9], [15, 9]], '(old pandanus)');
  assert(await s.flag('ch6_linto_done'), '林投姐 resolved');
  assert(await s.lit('lantern_linto') && await s.item('c6_linto_comb') === 1 && !await s.item('c6_zheng_zongzi'), '心燈 lit, 木梳, 肉粽 given');
  s.note('傾聽 count ' + await s.ev(() => G.state.vars.ch6_listen || 0) + (await s.item('c6_zhaoniang_pin') ? ' → 昭娘的銀簪' : ' (no 銀簪: the bot does not 傾聽)'));
});

// ---------------------------------------------------------------- 雲歸的蕈譜：潮音蕈 (q_tuanzi_mush, cross-chapter, no 心燈)
test('mush', '雲歸的蕈譜・潮音蕈：林投林 濕沙（無靈蕈 → 府城藥鋪買 → 回來吃 → 記下）', async (s) => {
  await s.open('?debug&map=fucheng&x=3&y=40&lv=22&chapter=6&flags=' + F_ROUZONG);
  await gear(s);
  await s.ev(() => { G.state.vars.ch6_time = 1; G.Inv.remove ? G.Inv.remove('lingxun', 99) : (delete G.state.inv.lingxun); });
  await s.exit('linto');
  await s.ev(() => { G.mapScene.enemies = []; });   // the roaming monsters are not part of this quest
  let r = await s.walk([[22, 21], [23, 21], [22, 22], [23, 22]], '(wet sand)');
  assert(r === 'event' && !await s.flag('mush_ch6'), 'without 靈視 the patch speaks (潮聲) but nothing is found');
  await s.exit('fucheng');
  await s.exit('fc_herb');
  await s.buy('fc_doctor', { lingxun: 1 });
  await s.exit('fucheng');
  await s.exit('linto');
  await s.ev(() => { G.mapScene.enemies = []; });
  r = await s.walk([[22, 21], [23, 21], [22, 22], [23, 22]], '(wet sand)');
  assert(await s.flag('mush_ch6') && await s.ev(() => G.state.vars.tuanzi_mush === 1) && !await s.item('lingxun'), '潮音蕈 recorded (靈蕈 eaten on the spot)');
  assert(await s.stage('q_tuanzi_mush') === 9, 'quest log: waiting for the next one');
});

// ---------------------------------------------------------------- 3D spot check (visual-only clues)
const SHOTS = process.env.SHOTS || null;   // e.g. SHOTS=/tmp/shots node … --only 3d
test('3d', '3D：大疫塚的咳嗽婦人看得見、靈視下林投林濕沙上的潮音蕈會發光', async (s) => {
  await s.open('?debug&startch=6');
  await gear(s);
  await s.exit('yanshui_temple');
  await s.exit('yanshui');
  await s.talk('ys_bearer');
  await s.exit('yanshui_temple');
  await s.talk('ys_keeper', ['開始吧']);
  assert(await s.ev(() => !!G.mapScene.view3d), '3D view active');
  await s.walk([37, 31]);
  await s.ff(1);
  await s.shot(SHOTS, 'ch6_3d_mother');
  assert(await s.ev(() => { const n = G.mapScene.npcs.find((x) => x.id === 'ys_ayi_mother'); return n && n.visible && G.mapScene.npcActive(n); }), 'mother visible in 3D');
  await s.talk('ys_ayi_mother');
  assert(await s.flag('ch6_ayi_mother'), 'talked in 3D');
}, { render3d: true });
test('3d_mush', '3D：靈視下林投林的潮音蕈', async (s) => {
  await s.open('?debug&map=fucheng&x=3&y=40&lv=22&chapter=6&flags=' + F_ROUZONG);
  await s.ev(() => { G.state.vars.ch6_time = 1; });
  await s.exit('linto');
  await s.ev(() => { G.mapScene.enemies = []; if (!G.Inv.has('lingxun')) G.Inv.add('lingxun', 1); });
  await s.walk([21, 20]);
  await s.eatVision();
  await s.ff(1);
  assert(await s.ev(() => G.mapScene.objects.some((o) => o.t === 'mushroom_glow' && G.mapScene.objActive(o))), 'glow object active with 靈視');
  await s.shot(SHOTS, 'ch6_3d_mush');
}, { render3d: true });

module.exports = { tests, gear };
if (require.main === module) runAll('ch6 side quests', tests);

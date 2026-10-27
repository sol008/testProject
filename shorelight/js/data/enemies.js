// 彼岸燈 — enemies (G.Data.enemies), troops (G.Data.troops), encounter areas (G.Data.areas) and the
// level progression table (G.Data.progression).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// PROGRESSION (expected party level; balanced with tools/sim_battle.js — `node tools/sim_battle.js`)
//   ch  chapter          levels   party in battle (WRITERS_GUIDE)
//   0   序章 夢           1        星河 alone
//   1   九份燈火          1–5      星河 (舊金礦坑 alone) + 白芷
//   2   霧林天燈          5–9      星河 白芷 (+紅纓 after the duel, joins ~L5)
//   3   觀音艋舺          9–13     + 雲歸 (joins ~L10 after the 鬼面 raid)
//   4   竹塹風起          13–16    four
//   5   鹿港舊夢          16–19    four
//   6   府城長明          19–23    four (白芷 captured at the end)
//   7   雲山入夢          23–27    星河 紅纓 雲歸
//   8   逆潮              27–30    星河 紅纓 雲歸
//   9   王船南行          30–34    星河 紅纓 雲歸 (陳伯 = non-combat helmsman)
//   10  後山巡境          34–38    星河 紅纓 雲歸
//   11  黑水溝・彼岸      38–44    trio; 白芷 rejoins at the top of 彼岸燈塔 for 夜玄 / 黑潮・無相
// Exp/gold assume ~8–15 random fights per area (see G.Data.areas). Each active member receives the
// full troop exp (G.Party.gainExp), so troop exp ≈ expToNext(level) / ~8.
// Normal fights: ~2–4 rounds and mildly threatening. Bosses: ~6–12 rounds, need healing/strategy.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//
// Enemy fields (contract): name, art | sprite, lv, hp, mp, atk, def, mag, spd, luk, elem, weak?, resist?,
//   exp, gold, drops:[{item, rate}], skills:[{id, w, if?}], boss?, scale?, desc
// Extra fields used here (engine notes, all optional):
//   variant: 0|1|2      palette swap passed to G.Monsters.draw (o.variant) — stronger regional versions.
//   immune:[statusIds]  statuses that never land (bosses: sleep/stun/trance…).
//   weak/resist         override the 克 cycle for the listed elements (weak ×1.5, resist ×0.5);
//                       unlisted elements use the cycle.
//   endAt: 0.5          story battle: ends as a victory (no death anim) when HP ≤ endAt × max HP.
//   phases:[{at, phase, skills, text?, buffs?}]  when HP ≤ at × max HP: switch to `phase` (passed to the
//                       monster/sprite draw as o.phase), replace the skill list, show `text`, apply buffs.
//   skill `if`: 'hp<N' (own HP below N%), 'hp>N', 'ally_hurt' (an ally below 50%), 'turn>N', 'once'.
//   Humanoid bosses use `sprite` (G.Sprites.drawBattle, drawn with o.flip so they face right).
// Troops: { enemies, bg, bgm, boss?, flee? (default true for normal, false for boss) }.
// Areas (data for map writers / sim): { name, ch, lv:[lo,hi], troops:[ids], bosses:[ids], party:[ids] }.
'use strict';
G.Data = G.Data || {};

G.Data.progression = [
  { ch: 0, name: '序章 夢', lv: [1, 1], party: ['xinghe'] },
  { ch: 1, name: '九份燈火', lv: [1, 5], party: ['xinghe', 'baizhi'] },
  { ch: 2, name: '霧林天燈', lv: [5, 9], party: ['xinghe', 'baizhi', 'hongying'] },
  { ch: 3, name: '觀音艋舺', lv: [9, 13], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] },
  { ch: 4, name: '竹塹風起', lv: [13, 16], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] },
  { ch: 5, name: '鹿港舊夢', lv: [16, 19], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] },
  { ch: 6, name: '府城長明', lv: [19, 23], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] },
  { ch: 7, name: '雲山入夢', lv: [23, 27], party: ['xinghe', 'hongying', 'yungui'] },
  { ch: 8, name: '逆潮', lv: [27, 30], party: ['xinghe', 'hongying', 'yungui'] },
  { ch: 9, name: '王船南行', lv: [30, 34], party: ['xinghe', 'hongying', 'yungui'] },
  { ch: 10, name: '後山巡境', lv: [34, 38], party: ['xinghe', 'hongying', 'yungui'] },
  { ch: 11, name: '黑水溝・彼岸', lv: [38, 44], party: ['xinghe', 'hongying', 'yungui'] },
];

// ---- stat curve for a "standard" enemy of level L (multiplied per enemy by `m`) --------------------
G.Data.enemyCurve = function (L) {
  const pHP = 105 + 16 * (L - 1);            // expected party max HP at L (average member)
  const pDef = 11 + 3.5 * (L - 1);           // expected party DEF incl. gear
  const dPhys = (0.11 + 0.0012 * L) * pHP;   // standard hit ≈ 11% (L1) – 16% (L44) of a member's HP
  const dMag = Math.min((0.09 + 0.001 * L) * pHP, 120);
  // fights per level by chapter (more regions in a chapter → each fight worth less). Retuned with
  // tools/sim_economy.js (docs/BALANCE.md "Progression & economy") to the fights a player really meets: ch1, ch4, ch5
  // have few roaming enemies on the way (each worth more: 9→7.5, 12→10, 9→7.2); ch7, ch10, ch11 have many (each worth
  // less: 13→17.3, 15.3, 16.25 — that exp moved to the bosses, so a player who flees fights is not left levels behind)
  const FPL = [5, 7.5, 9, 10, 10, 7.2, 13, 17.3, 9, 13, 15.3, 16.25];
  let ch = 0;
  for (const p of G.Data.progression) if (L >= p.lv[0]) ch = p.ch;
  // party grows from 1–2 to 4 members across L4–L12: normal enemies get sturdier to match
  // (piecewise: 1.0 at L4 → 2.05 at L12 (four members) … 1.9 from L24 (trio while 白芷 is away))
  const PTS = [[4, 1.0], [12, 2.05], [22, 2.05], [24, 1.9], [50, 1.9]];
  let ramp = 1;
  for (let i = 0; i < PTS.length - 1; i++) {
    const [l0, r0] = PTS[i], [l1, r1] = PTS[i + 1];
    if (L >= l0 && L <= l1) ramp = r0 + (r1 - r0) * (L - l0) / (l1 - l0);
  }
  if (L > 50) ramp = 1.9;
  const hpRaw = 34 + 17 * L + 0.32 * L * L;
  return {
    hp: hpRaw * ramp,
    hpRaw,                                   // bosses scale from the raw curve (their m.hp is tuned per boss)
    mp: 10 + 3 * L,
    atk: dPhys * (50 + pDef) / 100,
    mag: dMag * (50 + 0.3 * pDef) / (100 - 0.7 * dMag),
    def: 4 + 1.15 * L,
    spd: 9 + 0.8 * L,
    luk: 3 + 0.3 * L,
    exp: (20 * Math.pow(L, 1.8) + 30) / (2.4 * FPL[ch]),
    gold: 4 + 2.4 * L + 0.05 * L * L,
  };
};

(function () {
  const C = G.Data.enemyCurve;
  const E = G.Data.enemies = {};
  const T = G.Data.troops = {};
  const A = G.Data.areas = {};

  // d: { name, art|sprite, lv, elem, m:{hp,atk,mag,def,spd,luk,exp,gold}, skills:[[id,w,if]], drops:[[item,rate]], ...rest }
  function def(id, d) {
    const c = C(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const bossK = d.boss ? 1 : 0;
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (bossK ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk),
      elem: d.elem || null,
      exp: Math.max(1, Math.round(c.exp * expM)), gold: Math.max(1, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: d.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })),
      desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt']) if (d[k] != null) e[k] = d[k];
    if (d.phases) e.phases = d.phases.map((p) => Object.assign({}, p, { skills: p.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })) }));
    E[id] = e;
  }
  // variant: same monster, later region, stronger palette-swap.
  function variant(id, baseId, v, lv, extra) {
    const b = BASE[baseId];
    def(id, Object.assign({}, b, { variant: v, lv }, extra || {}));
  }
  const BASE = {};
  function base(id, d) { BASE[id] = d; def(id, d); }

  function troop(id, enemies, bg, bgm, extra) { T[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle' }, extra || {}); }
  function boss(id, enemies, bg, bgm) { T[id] = { enemies, bg, bgm: bgm || 'boss', boss: true, flee: false }; }
  function area(id, d) { A[id] = d; }

  const BOSS_IMM = ['sleep', 'stun', 'trance'];

  // =================================================================================== 序章 夢境・燈橋
  base('sea_wisp', {
    name: '海霧魂', art: 'sea_wisp', lv: 1, elem: 'water', weak: ['fire'], m: { hp: 0.75, atk: 0.75 },
    skills: [['e_ghost_touch', 3], ['e_mist_veil', 1]], drops: [['yuyuan', 0.2]],
    desc: '黑色海面上升起的霧，隱約有一張臉。據說是還沒想起自己名字的魂，在燈橋邊徘徊。',
  });
  troop('dream_1', ['sea_wisp'], 'dream');
  troop('dream_2', ['sea_wisp', 'sea_wisp'], 'dream');
  troop('dream_3', ['sea_wisp', 'sea_wisp', 'sea_wisp'], 'dream');
  area('dream', { name: '夢境・燈橋', ch: 0, lv: [1, 1], troops: ['dream_1', 'dream_2', 'dream_3'], bosses: [], party: ['xinghe'] });

  // =================================================================================== 1 九份燈火
  base('mine_bat', {
    name: '礦坑蝙蝠', art: 'mine_bat', lv: 2, elem: 'earth', m: { hp: 0.65, atk: 0.62, spd: 1.3, def: 0.8 },
    skills: [['e_bite', 3], ['e_bat_swarm', 1]], drops: [['jiedu', 0.15]],
    desc: '舊金礦坑深處成群倒掛的蝙蝠。礦工說，牠們吃了太多黃金的灰，連眼睛都是金色的。',
  });
  base('miner_ghost', {
    name: '礦工魂', art: 'miner_ghost', lv: 3, elem: 'earth', weak: ['fire'], m: { hp: 0.95, atk: 0.75, spd: 0.85 },
    skills: [['e_pickaxe', 3], ['e_miner_sigh', 1]], drops: [['caozaiguo', 0.15], ['jinchuang', 0.15]],
    desc: '礦坑崩塌時沒能出來的礦工。還在黑暗裡一下一下地敲著岩壁，以為天就快亮了。',
  });
  troop('mine_1', ['mine_bat'], 'mine');
  troop('mine_2', ['mine_bat', 'mine_bat'], 'mine');
  troop('mine_3', ['miner_ghost'], 'mine');
  troop('mine_4', ['miner_ghost', 'mine_bat'], 'mine');
  troop('mine_5', ['mine_bat', 'mine_bat', 'mine_bat'], 'mine');
  area('mine', { name: '舊金礦坑', ch: 1, lv: [1, 3], troops: ['mine_1', 'mine_2', 'mine_3', 'mine_4', 'mine_5'], bosses: [], party: ['xinghe'] });

  base('sand_crab', {
    name: '沙蟹精', art: 'sand_crab', lv: 4, elem: 'water', weak: ['wood'], m: { hp: 1.0, atk: 0.95, def: 1.7, spd: 0.8 },
    skills: [['e_crab_pinch', 3], ['e_bubble', 1]], drops: [['jinchuang', 0.2]],
    desc: '八斗子礁岩間的大沙蟹，殼上長滿了藤壺。中元夜會爬上岸，偷吃普渡桌上的供品。',
  });
  base('water_ghost', {
    name: '水鬼', art: 'water_ghost', lv: 4, elem: 'water', weak: ['fire', 'earth'], m: { hp: 1.0, atk: 1.0 },
    skills: [['e_drown_pull', 2], ['e_ghost_touch', 2], ['e_claw', 2]], drops: [['jinchuang', 0.2], ['xiangbao', 0.08]],
    desc: '溺死在海裡的人，要找到一個替身才能離開——這叫「抓交替」。燈火不明的年頭，牠們會沿著石階爬上山城。',
  });
  base('ghost_lantern', {
    name: '鬼燈籠', art: 'ghost_lantern', lv: 4, elem: 'fire', weak: ['water'], m: { hp: 0.8, atk: 0.7, mag: 1.2, spd: 1.1 },
    skills: [['e_ghost_flame', 3], ['e_lantern_glare', 1]], drops: [['bianpao', 0.2]],
    desc: '被人遺忘在屋簷下的舊燈籠，紙破了、骨架還在，裡面點著一團不知道是誰的藍火。',
  });
  troop('shore_1', ['sand_crab'], 'shore');
  troop('shore_2', ['water_ghost', 'sand_crab'], 'shore');
  troop('shore_3', ['ghost_lantern', 'ghost_lantern'], 'shore');
  troop('shore_4', ['water_ghost', 'water_ghost'], 'shore');
  troop('shore_5', ['water_ghost', 'ghost_lantern', 'sand_crab'], 'shore');
  area('shore', { name: '八斗子海岸', ch: 1, lv: [3, 4], troops: ['shore_1', 'shore_2', 'shore_3', 'shore_4', 'shore_5'], bosses: [], party: ['xinghe', 'baizhi'] });

  troop('jiufen_1', ['water_ghost', 'water_ghost', 'water_ghost'], 'jiufen_night');
  troop('jiufen_2', ['water_ghost', 'ghost_lantern', 'ghost_lantern'], 'jiufen_night');
  troop('jiufen_3', ['ghost_lantern', 'ghost_lantern', 'ghost_lantern'], 'jiufen_night');
  troop('jiufen_4', ['water_ghost', 'water_ghost', 'ghost_lantern'], 'jiufen_night');

  def('moya', {
    name: '墨鴉', sprite: 'moya', lv: 5, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 7.5, atk: 2.15, mag: 2.33, def: 1.1, spd: 1.45, exp: 7, gold: 9 },
    skills: [['e_crow_feathers', 3], ['e_crow_hex', 2], ['e_crow_wind', 2], ['e_slash', 2], ['e_crow_smug', 1, 'hp<50']],
    drops: [['ac_xionghuang', 1]],
    desc: '長明宮的使者，披著烏鴉羽毛的黑斗篷。說話慢條斯理、自命不凡，非常在意自己的髮型。',
  });
  def('ghost_king', {
    name: '水鬼王', art: 'water_ghost_king', lv: 5, elem: 'water', weak: ['fire', 'earth'], boss: true, immune: BOSS_IMM,
    m: { hp: 7.5, atk: 2.15, mag: 2.23, def: 1.2, spd: 1.2, exp: 6, gold: 6 },
    skills: [['e_drown_pull', 3], ['e_ghostking_tide', 2], ['e_claw', 2], ['e_ghostking_call', 1, 'once']],
    drops: [['huanhunxiang', 1]],
    desc: '在黑水溝底下等了最久的那一個。牠身後拖著的，是所有被牠抓去當替身的人。',
  });
  boss('boss_moya', ['moya'], 'jiufen_night');
  boss('boss_ghost_king', ['ghost_king'], 'jiufen_night');
  area('jiufen', { name: '九份・中元夜', ch: 1, lv: [4, 5], troops: ['jiufen_1', 'jiufen_2', 'jiufen_3', 'jiufen_4'], bosses: ['boss_moya', 'boss_ghost_king'], party: ['xinghe', 'baizhi'] });

  // =================================================================================== 2 霧林天燈
  base('mosinzai', {
    name: '魔神仔', art: 'mosina', lv: 6, elem: 'wood', m: { hp: 0.9, atk: 0.9, spd: 1.35, luk: 2 },
    skills: [['e_mosin_trick', 2], ['e_mosin_feast', 2], ['e_claw', 2]], drops: [['mat_wuxun', 0.3], ['xiangbao', 0.1]],
    desc: '穿紅衣、個子矮小的山精，喜歡牽著旅人在山裡繞圈子，還會請你吃「大餐」——其實是泥巴和蚱蜢。',
  });
  base('mushroom_spirit', {
    name: '蕈精', art: 'mushroom_imp', lv: 6, elem: 'wood', weak: ['fire'], m: { hp: 1.05, atk: 0.8, mag: 1.1, def: 0.85, spd: 0.8 },
    skills: [['e_spore', 1], ['e_spore_poison', 2], ['e_hit', 2]], drops: [['lingxun', 0.08], ['mat_wuxun', 0.4]],
    desc: '霧林裡吸飽了月光的大蕈，會搖搖擺擺地走路。雲歸堅持牠們「只是有點害羞」。',
  });
  base('bamboo_spirit', {
    name: '竹精', art: 'bamboo_spirit', lv: 6, elem: 'wood', weak: ['fire'], m: { hp: 1.0, atk: 1.0, def: 1.35, spd: 0.9 },
    skills: [['e_bamboo_spike', 3], ['e_bamboo_rustle', 1]], drops: [['jinchuang', 0.2]],
    desc: '百年的老竹成了精，風吹過時沙沙作響，像是在說悄悄話。',
  });
  base('green_snake', {
    name: '青竹絲', art: 'bamboo_viper', lv: 5, elem: 'wood', m: { hp: 0.7, atk: 0.9, spd: 1.4 },
    skills: [['e_snake_bite', 3], ['e_bite', 1]], drops: [['jiedu', 0.3]],
    desc: '藏在竹葉間的翠綠毒蛇，尾巴尖是紅色的。山裡人說：看到竹子在動，先別伸手。',
  });
  base('macaque', {
    name: '獼猴精', art: 'macaque_demon', lv: 7, elem: 'earth', m: { hp: 0.85, atk: 0.95, spd: 1.5, luk: 2 },
    skills: [['e_monkey_throw', 2], ['e_monkey_taunt', 1], ['e_claw', 2]], drops: [['caozaiguo', 0.2]],
    desc: '成群結隊的台灣獼猴，修出了一點道行，也修出了更多壞心眼。專搶旅人的便當。',
  });
  base('boar_spirit', {
    name: '山豬精', art: 'boar_demon', lv: 8, elem: 'earth', m: { hp: 1.5, atk: 1.15, def: 1.1, spd: 0.8 },
    skills: [['e_boar_charge', 2], ['e_heavy', 1], ['e_hit', 2]], drops: [['jinchuang', 0.3], ['ar_leather', 0.05]],
    desc: '獠牙比柴刀還長的大山豬。一旦衝起來，連牠自己也停不下。',
  });
  troop('forest_1', ['mosinzai', 'mosinzai'], 'forest');
  troop('forest_2', ['mushroom_spirit', 'green_snake'], 'forest');
  troop('forest_3', ['bamboo_spirit', 'green_snake', 'green_snake'], 'forest');
  troop('forest_4', ['mosinzai', 'mushroom_spirit', 'bamboo_spirit'], 'forest');
  troop('forest_5', ['mushroom_spirit', 'mushroom_spirit', 'mushroom_spirit'], 'mushroom');

  def('duel_hongying', {
    name: '洛紅纓', sprite: 'hongying', lv: 4, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 11.5, atk: 1.73, def: 1.1, spd: 1.35, exp: 5, gold: 0 },
    skills: [['e_hy_dian', 3], ['e_hy_sweep', 2], ['e_slash', 2], ['e_hy_taunt', 1, 'hp<50']],
    drops: [],
    desc: '鹿港洛家槍的傳人。以為星河就是「鬼面」的同夥。她出手時其實留了三分力——只是嘴上不承認。',
  });
  boss('boss_hongying', ['duel_hongying'], 'forest', 'boss');
  area('forest', { name: '霧林', ch: 2, lv: [5, 7], troops: ['forest_1', 'forest_2', 'forest_3', 'forest_4', 'forest_5'], bosses: ['boss_hongying'], party: ['xinghe', 'baizhi'] });

  troop('lair_1', ['boar_spirit'], 'forest');
  troop('lair_2', ['macaque', 'macaque'], 'forest');
  troop('lair_3', ['green_snake', 'macaque', 'boar_spirit'], 'forest');
  troop('lair_4', ['mosinzai', 'mosinzai', 'macaque'], 'forest');
  def('tiger_granny', {
    name: '虎姑婆', art: 'tiger_granny', lv: 9, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 16, atk: 2.64, mag: 2.34, def: 1.15, spd: 1.35, exp: 7, gold: 20.2 },
    skills: [['e_tiger_claw', 3], ['e_tiger_pounce', 2], ['e_tiger_lullaby', 1], ['e_tiger_snack', 1, 'hp<50']],
    drops: [['ac_huzhao', 1]],
    desc: '專挑大人不在家的夜晚，扮成阿婆來敲門的老虎精。半夜在被窩裡喀啦喀啦嚼的，她說是「花生」。',
  });
  boss('boss_tiger', ['tiger_granny'], 'forest');
  area('lair', { name: '虎姑婆洞', ch: 2, lv: [7, 8], troops: ['lair_1', 'lair_2', 'lair_3', 'lair_4'], bosses: ['boss_tiger'], party: ['xinghe', 'baizhi', 'hongying'] });

  troop('pingxi_1', ['boar_spirit', 'boar_spirit'], 'pingxi');
  troop('pingxi_2', ['macaque', 'bamboo_spirit', 'green_snake'], 'pingxi');
  troop('pingxi_3', ['mushroom_spirit', 'mosinzai', 'boar_spirit'], 'pingxi');
  area('pingxi', { name: '平溪・十分', ch: 2, lv: [8, 9], troops: ['pingxi_1', 'pingxi_2', 'pingxi_3'], bosses: [], party: ['xinghe', 'baizhi', 'hongying'] });

  // =================================================================================== 3 觀音艋舺
  base('yin_soldier', {
    name: '陰兵', art: 'yin_soldier', lv: 10, elem: 'metal', weak: ['fire'], m: { hp: 1.05, atk: 1.0, def: 1.25, spd: 0.9 },
    skills: [['e_yin_spear', 3], ['e_yin_march', 1]], drops: [['jinchuang', 0.25], ['fu_zhenxie', 0.06]],
    desc: '陰間的兵，本該隨著城隍出巡。燈火搖晃之後，有一隊走錯了路，一直在河口來回行軍。',
  });
  base('river_wraith', {
    name: '河伯怨靈', art: 'river_wraith', lv: 10, elem: 'water', weak: ['fire', 'earth'], m: { hp: 0.95, atk: 0.8, mag: 1.2 },
    skills: [['e_river_wail', 2], ['e_river_drag', 2], ['e_ghost_touch', 1]], drops: [['xiangbao', 0.15]],
    desc: '淡水河口沉船的怨氣聚成的靈。水退的時候，河底會傳來敲船板的聲音。',
  });
  base('rat_spirit', {
    name: '鼠精', art: 'rat_demon', lv: 9, elem: 'water', m: { hp: 0.7, atk: 0.85, spd: 1.35, luk: 2 },
    skills: [['e_rat_gnaw', 3], ['e_rat_swarm', 1]], drops: [['jiedu', 0.25], ['yuyuan', 0.15]],
    desc: '港口倉庫裡偷吃米糧長大的老鼠，越吃越胖、越活越精。子鼠屬水。',
  });
  variant('water_ghost_v1', 'water_ghost', 1, 10);
  troop('tamsui_1', ['river_wraith', 'rat_spirit'], 'tamsui');
  troop('tamsui_2', ['yin_soldier', 'yin_soldier'], 'tamsui');
  troop('tamsui_3', ['rat_spirit', 'rat_spirit', 'rat_spirit'], 'tamsui');
  troop('tamsui_4', ['water_ghost_v1', 'river_wraith'], 'tamsui');
  troop('tamsui_5', ['yin_soldier', 'river_wraith', 'rat_spirit'], 'tamsui');
  area('tamsui', { name: '淡水', ch: 3, lv: [9, 10], troops: ['tamsui_1', 'tamsui_2', 'tamsui_3', 'tamsui_4', 'tamsui_5'], bosses: [], party: ['xinghe', 'baizhi', 'hongying'] });

  base('stone_monkey', {
    name: '石猴', art: 'stone_monkey', lv: 11, elem: 'earth', m: { hp: 1.2, atk: 1.05, def: 1.45, spd: 1.0 },
    skills: [['e_stone_fist', 3], ['e_monkey_throw', 1]], drops: [['jinchuang', 0.25]],
    desc: '觀音山石頭裡蹦出來的猴子，皮膚是安山岩。喜歡蹲在廟埕的石獅子旁邊假裝自己也是石雕。',
  });
  variant('bamboo_spirit_v1', 'bamboo_spirit', 1, 11);
  troop('guanyin_1', ['stone_monkey', 'stone_monkey'], 'mountain');
  troop('guanyin_2', ['stone_monkey', 'yin_soldier'], 'mountain');
  troop('guanyin_3', ['bamboo_spirit_v1', 'rat_spirit', 'rat_spirit'], 'mountain');
  troop('guanyin_4', ['yin_soldier', 'yin_soldier', 'yin_soldier'], 'temple');
  def('qingfeng_mask', {
    name: '鬼面', sprite: 'qingfeng_mask', lv: 11, elem: 'metal', boss: true, immune: BOSS_IMM, endAt: 0.5,
    m: { hp: 41, atk: 2.23, mag: 1.91, def: 1.2, spd: 1.5, exp: 7, gold: 6 },
    skills: [['e_qf_sword', 3], ['e_qf_luojia', 2], ['e_qf_crescent', 2], ['e_qf_shadow', 1, 'hp<75']],
    drops: [],
    desc: '戴著鬼面具的劍客，夜襲太虛觀。他的劍路——紅纓一眼就認得出來。',
  });
  boss('boss_qingfeng_mask', ['qingfeng_mask'], 'temple');
  area('guanyin', { name: '觀音山・太虛觀', ch: 3, lv: [10, 11], troops: ['guanyin_1', 'guanyin_2', 'guanyin_3', 'guanyin_4'], bosses: ['boss_qingfeng_mask'], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  base('paper_man', {
    name: '紙紮人', art: 'paper_effigy', lv: 12, elem: 'wood', weak: ['fire'], m: { hp: 0.9, atk: 1.0, def: 0.8, spd: 1.1 },
    skills: [['e_paper_cut', 3], ['e_paper_stare', 1]], drops: [['bianpao', 0.2], ['jinchuang', 0.2]],
    desc: '燒給往生者的紙紮童僕。畫上眼睛的那一刻就該燒掉——這一批，沒有燒。',
  });
  variant('rat_spirit_v1', 'rat_spirit', 1, 12);
  variant('river_wraith_v1', 'river_wraith', 1, 12);
  variant('yin_soldier_v1', 'yin_soldier', 1, 13);
  def('chair_spirit', {
    name: '椅仔姑', art: 'chair_spirit', lv: 13, elem: 'water', boss: true, immune: ['sleep', 'trance'],
    m: { hp: 13, atk: 2.01, mag: 2.91, def: 1.0, spd: 1.2, exp: 4, gold: 3 },
    skills: [['e_chair_sway', 2], ['e_chair_tears', 3], ['e_ghost_touch', 2]], drops: [['ac_tongling', 1]],
    desc: '附在竹椅上的小女孩的魂。從前被虐待、早早死去，只想有人陪她玩。不是惡靈——只是太寂寞了。',
  });
  troop('banka_1', ['paper_man', 'paper_man'], 'city');
  troop('banka_2', ['rat_spirit_v1', 'rat_spirit_v1', 'rat_spirit_v1'], 'city');
  troop('banka_3', ['paper_man', 'river_wraith_v1'], 'city');
  troop('banka_4', ['yin_soldier_v1', 'paper_man', 'rat_spirit_v1'], 'city');
  boss('boss_chair', ['chair_spirit', 'paper_man'], 'city', 'tension');
  area('banka', { name: '艋舺', ch: 3, lv: [11, 13], troops: ['banka_1', 'banka_2', 'banka_3', 'banka_4'], bosses: ['boss_chair'], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  // =================================================================================== 4 竹塹風起
  base('wind_sprite', {
    name: '九降風精', art: 'wind_sprite', lv: 14, elem: 'wood', m: { hp: 0.85, atk: 0.85, mag: 1.15, spd: 1.45 },
    skills: [['e_wind_blade', 3], ['e_wind_howl', 1]], drops: [['shibing', 0.2]],
    desc: '秋冬從北方吹來的九降風，本該把米粉和柿餅吹得又乾又甜。今年的風，夾著溺死者的哭聲。',
  });
  variant('rat_spirit_v2', 'rat_spirit', 2, 14);
  variant('paper_man_v1', 'paper_man', 1, 14);
  troop('zhuqian_1', ['wind_sprite', 'wind_sprite'], 'city');
  troop('zhuqian_2', ['rat_spirit_v2', 'rat_spirit_v2', 'wind_sprite'], 'city');
  troop('zhuqian_3', ['paper_man_v1', 'paper_man_v1', 'rat_spirit_v2'], 'temple');
  troop('zhuqian_4', ['wind_sprite', 'wind_sprite', 'wind_sprite'], 'city');
  area('zhuqian', { name: '竹塹城', ch: 4, lv: [13, 14], troops: ['zhuqian_1', 'zhuqian_2', 'zhuqian_3', 'zhuqian_4'], bosses: [], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  base('mountain_ghost', {
    name: '山鬼', art: 'mountain_ghost', lv: 15, elem: 'earth', m: { hp: 1.3, atk: 1.1, def: 1.1, spd: 0.95 },
    skills: [['e_mountain_rock', 3], ['e_mountain_mimic', 1], ['e_claw', 1]], drops: [['bantiao', 0.2], ['xiancao', 0.1]],
    desc: '獨腳的山中精怪，會學人說話。在山路上聽見同伴喊你的名字時，先確認他是不是真的在你身後。',
  });
  variant('mine_bat_v1', 'mine_bat', 1, 14);
  variant('boar_spirit_v1', 'boar_spirit', 1, 15);
  troop('hakka_1', ['mountain_ghost', 'mountain_ghost'], 'hakka');
  troop('hakka_2', ['mine_bat_v1', 'mine_bat_v1', 'mine_bat_v1'], 'hakka');
  troop('hakka_3', ['boar_spirit_v1', 'mountain_ghost'], 'hakka');
  troop('hakka_4', ['mountain_ghost', 'mine_bat_v1', 'wind_sprite'], 'hakka');
  area('hakka', { name: '客家庄', ch: 4, lv: [14, 15], troops: ['hakka_1', 'hakka_2', 'hakka_3', 'hakka_4'], bosses: [], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  variant('wind_sprite_v1', 'wind_sprite', 1, 16);
  variant('mountain_ghost_v1', 'mountain_ghost', 1, 16);
  variant('mine_bat_v2', 'mine_bat', 2, 15);
  troop('windcave_1', ['wind_sprite_v1', 'wind_sprite_v1'], 'windcave');
  troop('windcave_2', ['mine_bat_v2', 'mine_bat_v2', 'mine_bat_v2'], 'windcave');
  troop('windcave_3', ['mountain_ghost_v1', 'wind_sprite_v1'], 'windcave');
  troop('windcave_4', ['mountain_ghost_v1', 'mine_bat_v2', 'mine_bat_v2'], 'windcave');
  troop('windcave_5', ['wind_sprite_v1', 'wind_sprite_v1', 'wind_sprite_v1'], 'windcave');
  def('wind_demon', {
    name: '風魔', art: 'wind_demon', lv: 17, elem: 'wood', boss: true, immune: BOSS_IMM,
    m: { hp: 14, atk: 2.84, mag: 2.72, def: 1.15, spd: 1.45, exp: 7, gold: 8 },
    skills: [['e_wd_vortex', 3], ['e_wd_gust', 3], ['e_wd_rot', 1], ['e_wind_blade', 2], ['e_wd_inhale', 1, 'hp<40']],
    drops: [['ac_yingshi', 1]],
    desc: '五指山風穴裡一盞裂開的長明燈，吸進了太多迷路的魂，和九降風纏在一起，成了風魔。',
  });
  boss('boss_wind_demon', ['wind_demon'], 'windcave');
  area('windcave', { name: '五指山風穴', ch: 4, lv: [15, 16], troops: ['windcave_1', 'windcave_2', 'windcave_3', 'windcave_4', 'windcave_5'], bosses: ['boss_wind_demon'], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  // =================================================================================== 5 鹿港舊夢
  base('jiangshi', {
    name: '殭屍', art: 'jiangshi', lv: 17, elem: 'earth', weak: ['wood', 'fire'], m: { hp: 1.35, atk: 1.1, def: 1.2, spd: 0.75 },
    skills: [['e_js_hop', 3], ['e_js_breath', 1]], drops: [['jinchuang', 0.3], ['niushebing', 0.1]],
    desc: '屍身不腐、一跳一跳走路的殭屍。怕桃木、怕糯米、怕雞叫——更怕有人記得牠生前的名字。',
  });
  base('hanged_ghost', {
    name: '吊死鬼', art: 'hanged_ghost', lv: 17, elem: 'metal', weak: ['fire'], m: { hp: 0.95, atk: 0.9, mag: 1.15, spd: 1.05 },
    skills: [['e_hang_rope', 3], ['e_hang_sigh', 1]], drops: [['xiangbao', 0.2]],
    desc: '懸在樑上、吐著長舌的鬼。會在你耳邊嘆氣，勸你也把繩子套上——千萬別聽。',
  });
  base('paper_servant', {
    name: '紙人', art: 'paper_servant', lv: 16, elem: 'wood', weak: ['fire'], m: { hp: 0.7, atk: 0.9, def: 0.7, spd: 1.35 },
    skills: [['e_paper_cut', 3], ['e_paper_stare', 1]], drops: [['bianpao', 0.2], ['niushebing', 0.1]],
    desc: '剪紙剪出來的小人，蓋著一枚紅印。風一吹就飄，飄進誰家，誰家就少一個人。',
  });
  troop('lukang_1', ['paper_servant', 'paper_servant', 'paper_servant'], 'city');
  troop('lukang_2', ['jiangshi', 'paper_servant'], 'city');
  troop('lukang_3', ['hanged_ghost', 'hanged_ghost'], 'city');
  troop('lukang_4', ['jiangshi', 'hanged_ghost'], 'city');
  area('lukang', { name: '鹿港・九曲巷', ch: 5, lv: [16, 17], troops: ['lukang_1', 'lukang_2', 'lukang_3', 'lukang_4'], bosses: [], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  base('skeleton_general', {
    name: '骷髏將', art: 'bone_general', lv: 19, elem: 'metal', weak: ['fire'], m: { hp: 1.45, atk: 1.15, def: 1.45, spd: 0.9 },
    skills: [['e_skel_slash', 3], ['e_guard', 1], ['e_heavy', 1]], drops: [['xumingsan', 0.15], ['ar_brocade', 0.04]],
    desc: '穿著鏽甲的骷髏武將，還在守一扇早就沒人進出的門。他守的是誰？他自己也忘了。',
  });
  base('grudge_maid', {
    name: '怨婢', art: 'grudge_maid', lv: 18, elem: 'water', m: { hp: 0.95, atk: 0.85, mag: 1.3, spd: 1.1 },
    skills: [['e_maid_wail', 2], ['e_maid_tea', 1], ['e_ghost_touch', 2]], drops: [['xiangbao', 0.2], ['niushebing', 0.15]],
    desc: '大宅裡的婢女，那一夜也沒能逃出去。她還端著茶在走廊上走，一聲聲喊著「小姐」。',
  });
  variant('jiangshi_v1', 'jiangshi', 1, 18);
  variant('hanged_ghost_v1', 'hanged_ghost', 1, 18);
  troop('luo_1', ['jiangshi_v1', 'jiangshi_v1'], 'mansion');
  troop('luo_2', ['grudge_maid', 'hanged_ghost_v1'], 'mansion');
  troop('luo_3', ['skeleton_general', 'grudge_maid'], 'mansion');
  troop('luo_4', ['skeleton_general', 'hanged_ghost_v1'], 'mansion');
  troop('luo_5', ['grudge_maid', 'grudge_maid', 'jiangshi_v1'], 'mansion');
  def('grudge_feast', {
    name: '怨宴', art: 'grudge_feast', lv: 20, elem: 'earth', boss: true, immune: BOSS_IMM,
    m: { hp: 13, atk: 2.04, mag: 2.13, def: 1.15, spd: 1.35, exp: 7, gold: 8 },
    skills: [['e_feast_poison', 3], ['e_feast_toast', 1], ['e_feast_flip', 2], ['e_js_hop', 2], ['e_feast_serve', 1, 'once']],
    drops: [['ac_rongye', 1]],
    desc: '洛家中元夜那一桌沒吃完的宴席。滿桌的怨氣成了形，還在等主人回來入座。',
  });
  boss('boss_feast', ['grudge_feast'], 'mansion');
  area('luomansion', { name: '洛家古厝', ch: 5, lv: [17, 19], troops: ['luo_1', 'luo_2', 'luo_3', 'luo_4', 'luo_5'], bosses: ['boss_feast'], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  // =================================================================================== 6 府城長明
  base('marionette', {
    name: '傀儡', art: 'marionette', lv: 20, elem: 'wood', weak: ['fire'], m: { hp: 1.0, atk: 1.0, def: 1.1, spd: 1.15 },
    skills: [['e_puppet_dance', 3], ['e_puppet_string', 1]], drops: [['wanguo', 0.15]],
    desc: '長明宮用來辦事的提線傀儡。線的另一頭不知道連到哪裡，有時候線斷了，它還在動。',
  });
  base('plague_ghost', {
    name: '瘟鬼', art: 'plague_ghost', lv: 21, elem: 'earth', weak: ['fire'], m: { hp: 1.05, atk: 0.9, mag: 1.15, def: 1.0 },
    skills: [['e_plague_miasma', 2], ['e_plague_touch', 3]], drops: [['xiancao', 0.2], ['fengpao', 0.05]],
    desc: '瘟疫留下的陰影。鹽水人放蜂炮、迎關帝，就是為了把它們驅散；今年的炮聲裡，它們又回來了。',
  });
  troop('tainan_1', ['marionette', 'marionette'], 'tainan');
  troop('tainan_2', ['plague_ghost', 'marionette'], 'tainan');
  troop('tainan_3', ['marionette', 'marionette', 'marionette'], 'tainan');
  area('tainan', { name: '府城', ch: 6, lv: [19, 20], troops: ['tainan_1', 'tainan_2', 'tainan_3'], bosses: [], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  troop('yanshui_1', ['plague_ghost', 'plague_ghost'], 'procession');
  troop('yanshui_2', ['plague_ghost', 'plague_ghost', 'plague_ghost'], 'procession');
  troop('yanshui_3', ['plague_ghost', 'marionette'], 'procession');
  area('yanshui', { name: '鹽水', ch: 6, lv: [20, 21], troops: ['yanshui_1', 'yanshui_2', 'yanshui_3'], bosses: [], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  variant('hanged_ghost_v2', 'hanged_ghost', 2, 21);
  variant('sand_crab_v1', 'sand_crab', 1, 21);
  variant('water_ghost_v2', 'water_ghost', 2, 22);
  troop('linto_1', ['hanged_ghost_v2', 'hanged_ghost_v2'], 'linto');
  troop('linto_2', ['sand_crab_v1', 'water_ghost_v2'], 'linto');
  troop('linto_3', ['water_ghost_v2', 'water_ghost_v2', 'hanged_ghost_v2'], 'linto');
  troop('linto_4', ['sand_crab_v1', 'sand_crab_v1', 'plague_ghost'], 'linto');
  def('linto_jie', {
    name: '林投姐', art: 'linto_jie', lv: 22, elem: 'water', boss: true, immune: BOSS_IMM,
    m: { hp: 13, atk: 2.15, mag: 2.42, def: 1.1, spd: 1.35, exp: 7, gold: 6 },
    skills: [['e_linto_weep', 2], ['e_linto_thorns', 3], ['e_linto_grudge', 2], ['e_linto_coin', 1]],
    drops: [['ac_jinqian', 1]],
    desc: '被負心人騙光家產、在林投樹下自盡的女人。她要的不是報仇——是有人聽她把話說完。',
  });
  boss('boss_linto', ['linto_jie'], 'linto', 'sad');
  area('linto', { name: '林投林', ch: 6, lv: [21, 22], troops: ['linto_1', 'linto_2', 'linto_3', 'linto_4'], bosses: ['boss_linto'], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  base('temple_guard', {
    name: '長明宮衛', sprite: 'temple_guard', lv: 23, elem: 'metal', m: { hp: 1.2, atk: 1.1, mag: 1.0, def: 1.3, spd: 1.0 },
    skills: [['e_guard_halberd', 3], ['e_guard_lamp', 2], ['e_guard', 1]], drops: [['wanguo', 0.2], ['fu_dingshen', 0.1]],
    desc: '長明宮的守衛，手持長戟和長明燈。他們真心相信自己在守護亡者——這正是最可怕的地方。',
  });
  base('lantern_golem', {
    name: '長明燈傀', art: 'lantern_golem', lv: 23, elem: 'fire', weak: ['water'], m: { hp: 1.5, atk: 1.15, mag: 1.15, def: 1.3, spd: 0.75 },
    skills: [['e_golem_beam', 2], ['e_golem_smash', 2], ['e_hit', 1]], drops: [['fenglisu', 0.2]],
    desc: '用長明燈座拼成的巨大傀儡，胸口的燈芯是一個被封住的魂。打碎它，那個魂就能走了。',
  });
  variant('marionette_v1', 'marionette', 1, 22);
  troop('palace_1', ['temple_guard', 'temple_guard'], 'palace', 'stealth');
  troop('palace_2', ['marionette_v1', 'marionette_v1', 'temple_guard'], 'palace', 'stealth');
  troop('palace_3', ['lantern_golem'], 'palace', 'stealth');
  troop('palace_4', ['lantern_golem', 'marionette_v1'], 'palace', 'stealth');
  def('nether_guardian', {
    name: '冥燈護法', art: 'nether_guardian', lv: 24, elem: 'fire', weak: ['water'], boss: true, immune: BOSS_IMM,
    m: { hp: 13, atk: 2.13, mag: 2.21, def: 1.2, spd: 1.4, exp: 7, gold: 8 },
    skills: [['e_ng_soul', 3], ['e_ng_chain', 3], ['e_ng_hush', 1], ['e_golem_beam', 1], ['e_ng_ward', 1, 'hp<50']],
    drops: [['ac_yeming', 1]],
    desc: '萬燈閣的守護者，身上掛滿了封著魂魄的燈罐。每一盞燈裡，都有人在敲著玻璃。',
  });
  boss('boss_nether', ['nether_guardian'], 'palace');
  area('palace', { name: '長明宮', ch: 6, lv: [22, 23], troops: ['palace_1', 'palace_2', 'palace_3', 'palace_4'], bosses: ['boss_nether'], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });

  // =================================================================================== 7 雲山入夢
  base('fog_spirit', {
    name: '霧精', art: 'fog_spirit', lv: 24, elem: 'water', m: { hp: 0.9, atk: 0.8, mag: 1.2, spd: 1.2 },
    skills: [['e_fog_chill', 3], ['e_fog_veil', 1]], drops: [['aiyu', 0.15]],
    desc: '阿里山雲海裡走散的霧，本該在清晨散去。如今黑潮的氣息爬上了山，它們散不掉了。',
  });
  base('bear_spirit', {
    name: '黑熊精', art: 'bear_spirit', lv: 25, elem: 'earth', m: { hp: 1.6, atk: 1.2, def: 1.15, spd: 0.85 },
    skills: [['e_bear_swipe', 3], ['e_bear_roar', 1], ['e_claw', 1]], drops: [['xumingsan', 0.25]],
    desc: '胸前一道白色月牙的台灣黑熊，被潮病纏身而發狂。打倒牠不是為了殺牠——是把纏在牠身上的黑潮打散。',
  });
  variant('green_snake_v2', 'green_snake', 2, 23);
  troop('alishan_1', ['fog_spirit', 'fog_spirit'], 'alishan', 'battle2');
  troop('alishan_2', ['bear_spirit'], 'alishan', 'battle2');
  troop('alishan_3', ['green_snake_v2', 'green_snake_v2', 'fog_spirit'], 'alishan', 'battle2');
  troop('alishan_4', ['bear_spirit', 'green_snake_v2'], 'alishan', 'battle2');
  area('alishan', { name: '阿里山', ch: 7, lv: [23, 24], troops: ['alishan_1', 'alishan_2', 'alishan_3', 'alishan_4'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  variant('fog_spirit_v1', 'fog_spirit', 1, 25);
  variant('mountain_ghost_v2', 'mountain_ghost', 2, 25);
  variant('mushroom_spirit_v2', 'mushroom_spirit', 2, 25);
  troop('yushan_1', ['fog_spirit_v1', 'fog_spirit_v1'], 'yushan', 'battle2');
  troop('yushan_2', ['mountain_ghost_v2', 'fog_spirit_v1'], 'yushan', 'battle2');
  troop('yushan_3', ['bear_spirit', 'mountain_ghost_v2'], 'yushan', 'battle2');
  troop('yushan_4', ['mushroom_spirit_v2', 'mushroom_spirit_v2', 'fog_spirit_v1'], 'forest', 'battle2');
  area('yushan', { name: '玉山山徑・雲霧林', ch: 7, lv: [24, 25], troops: ['yushan_1', 'yushan_2', 'yushan_3', 'yushan_4'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  base('hundred_eye', {
    name: '百眼', art: 'hundred_eye', lv: 26, elem: 'fire', m: { hp: 1.1, atk: 0.8, mag: 1.25, def: 1.0, spd: 1.0 },
    skills: [['e_eye_beam', 3], ['e_eye_gaze', 1]], drops: [['aiyu', 0.2]],
    desc: '靈境裡長滿眼睛的東西。每一隻眼睛都在看你，每一隻看到的你都不太一樣。',
  });
  base('serpent_shade', {
    name: '蛇影', art: 'serpent_shade', lv: 26, elem: 'wood', m: { hp: 1.05, atk: 1.05, spd: 1.2 },
    skills: [['e_shade_coil', 3], ['e_shade_pattern', 1]], drops: [['jiedu', 0.3], ['xumingsan', 0.15]],
    desc: '雲蛇遊過之後留下的影子，鱗片上的紋路會呼吸。它不是敵人，只是你還沒準備好看懂它。',
  });
  base('inner_demon', {
    name: '心魔', art: 'inner_demon', lv: 26, elem: null, m: { hp: 1.3, atk: 1.15, mag: 1.15, def: 1.1, spd: 1.1 },
    skills: [['e_mirror_strike', 3], ['e_mirror_doubt', 1]], drops: [['xumingsan', 0.2]],
    desc: '長著你的臉，說著你最怕聽到的話。打倒它的方法，是承認它說的有一部分是真的。',
  });
  troop('vision_1', ['hundred_eye', 'serpent_shade'], 'vision', 'vision');
  troop('vision_2', ['serpent_shade', 'serpent_shade', 'hundred_eye'], 'vision', 'vision');
  troop('vision_3', ['inner_demon'], 'vision', 'vision');
  troop('vision_4', ['inner_demon', 'hundred_eye'], 'vision', 'vision');
  area('vision', { name: '靈境', ch: 7, lv: [25, 26], troops: ['vision_1', 'vision_2', 'vision_3', 'vision_4'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  base('jiao', {
    name: '蛟', art: 'jiao', lv: 27, elem: 'water', m: { hp: 1.35, atk: 1.1, mag: 1.1, def: 1.1, spd: 1.0 },
    skills: [['e_jiao_bite', 3], ['e_jiao_tide', 1]], drops: [['aiyu', 0.2], ['xumingsan', 0.15]],
    desc: '潭底修行未成的蛟，被湖霧下的異光驚醒。牠只是想回到深處繼續睡。',
  });
  base('stone_guardian', {
    name: '石像衛', art: 'stone_guardian', lv: 27, elem: 'earth', m: { hp: 1.4, atk: 1.1, def: 1.6, spd: 0.75 },
    skills: [['e_statue_smash', 3], ['e_guard', 1]], drops: [['fenglisu', 0.2], ['c7_mat_jingang', 0.3]], // 金剛石屑: ch7 燈母祠
    desc: '燈母祠的石像守衛，守了不知幾百年。它不認得你——但它記得上一個來的人，也有一點像你。',
  });
  base('lamp_moth', {
    name: '燈蛾', art: 'lamp_moth', lv: 26, elem: 'fire', weak: ['water'], m: { hp: 0.8, atk: 0.85, mag: 1.2, spd: 1.35 },
    skills: [['e_moth_flare', 3], ['e_moth_dust', 1]], drops: [['xiangbao', 0.25]],
    desc: '繞著燈母祠殘火飛舞的大蛾，翅膀上的粉是熄滅的燈灰。',
  });
  troop('shrine_1', ['jiao', 'lamp_moth'], 'sunmoon', 'battle2');
  troop('shrine_2', ['lamp_moth', 'lamp_moth', 'lamp_moth'], 'shrine', 'battle2');
  troop('shrine_3', ['stone_guardian', 'lamp_moth'], 'shrine', 'battle2');
  troop('shrine_4', ['stone_guardian', 'stone_guardian'], 'shrine', 'battle2');
  troop('shrine_5', ['jiao', 'jiao'], 'sunmoon', 'battle2');
  def('qingxu', {
    name: '清虛真人', sprite: 'qingxu', lv: 28, elem: 'wood', boss: true, immune: BOSS_IMM,
    m: { hp: 12, atk: 4.56, mag: 5.49, def: 1.2, spd: 1.4, exp: 7, gold: 6 },
    skills: [['e_qx_thunder', 3], ['e_qx_fire', 2], ['e_qx_water', 2], ['e_qx_metal', 2], ['e_qx_seal', 1], ['e_qx_drain', 2], ['e_qx_puppet', 1, 'hp<40']],
    drops: [['fn_yunhai', 1]],
    desc: '雲歸的師父，被封在燈母祠、身體被長明之力操縱。他的手偶爾會停下——那是他還在裡面抵抗。',
  });
  boss('boss_qingxu', ['qingxu'], 'shrine');
  area('shrine', { name: '日月潭・燈母祠', ch: 7, lv: [26, 27], troops: ['shrine_1', 'shrine_2', 'shrine_3', 'shrine_4', 'shrine_5'], bosses: ['boss_qingxu'], party: ['xinghe', 'hongying', 'yungui'] });

  // =================================================================================== 8 逆潮
  base('drowned_soldier', {
    name: '溺屍兵', art: 'drowned_soldier', lv: 28, elem: 'water', weak: ['fire', 'earth'], m: { hp: 1.15, atk: 1.05, def: 1.2, spd: 0.95 },
    skills: [['e_ds_spear', 3], ['e_ds_volley', 1]], drops: [['wanguo', 0.2], ['fu_wulei', 0.03]],
    desc: '逆潮把沉在海底的兵丁送回了岸上。他們排著隊往前走，像是終於接到了回家的命令。',
  });
  base('tide_grudge', {
    name: '潮怨', art: 'tide_grudge', lv: 28, elem: 'water', m: { hp: 1.0, atk: 0.85, mag: 1.3, spd: 1.1 },
    skills: [['e_tg_wave', 2], ['e_tg_curse', 2], ['e_ghost_touch', 1]], drops: [['fenglisu', 0.15]],
    desc: '倒流的潮水裡糾纏不散的怨念。它記得所有被大海拿走的東西，一樣都不肯放下。',
  });
  troop('beigang_1', ['drowned_soldier', 'drowned_soldier'], 'procession', 'battle2');
  troop('beigang_2', ['tide_grudge', 'water_ghost_v2', 'water_ghost_v2'], 'procession', 'battle2');
  troop('beigang_3', ['drowned_soldier', 'tide_grudge'], 'procession', 'battle2');
  troop('beigang_4', ['drowned_soldier', 'drowned_soldier', 'tide_grudge'], 'procession', 'battle2');
  area('beigang', { name: '北港・遶境夜', ch: 8, lv: [27, 28], troops: ['beigang_1', 'beigang_2', 'beigang_3', 'beigang_4'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  variant('drowned_soldier_v1', 'drowned_soldier', 1, 29);
  variant('tide_grudge_v1', 'tide_grudge', 1, 29);
  variant('yin_soldier_v2', 'yin_soldier', 2, 29);
  troop('anping_1', ['drowned_soldier_v1', 'drowned_soldier_v1'], 'chaos', 'battle2');
  troop('anping_2', ['tide_grudge_v1', 'yin_soldier_v2'], 'chaos', 'battle2');
  troop('anping_3', ['yin_soldier_v2', 'yin_soldier_v2', 'tide_grudge_v1'], 'chaos', 'battle2');
  troop('anping_4', ['drowned_soldier_v1', 'tide_grudge_v1', 'drowned_soldier_v1'], 'chaos', 'battle2');
  def('qingfeng', {
    name: '洛青鋒', sprite: 'qingfeng', lv: 31, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 10.5, atk: 1.99, mag: 1.71, def: 1.2, spd: 1.55, exp: 7, gold: 6 },
    skills: [['e_qf2_sword', 3], ['e_qf2_storm', 2], ['e_qf2_tide', 2], ['e_qf_crescent', 1], ['e_qf2_resolve', 1, 'hp<50']],
    drops: [],
    desc: '紅纓的哥哥，摘下面具的「鬼面」。他相信逆潮能讓爹娘回來——直到他看見回來的是什麼。',
  });
  boss('boss_qingfeng', ['qingfeng'], 'chaos', 'boss');
  area('anping', { name: '安平・觀潮台', ch: 8, lv: [28, 30], troops: ['anping_1', 'anping_2', 'anping_3', 'anping_4'], bosses: ['boss_qingfeng'], party: ['xinghe', 'hongying', 'yungui'] });

  // =================================================================================== 9 王船南行
  base('greed_ghost', {
    name: '貪鬼', art: 'greed_ghost', lv: 31, elem: 'metal', m: { hp: 1.1, atk: 1.0, mag: 1.0, spd: 1.0, gold: 3 },
    skills: [['e_greed_grab', 3], ['e_greed_coins', 2]], drops: [['wuyuzi', 0.15], ['ac_jinqian', 0.02], ['c9_mat_qiandai', 0.25]], // 錢袋: ch9 半屏山腹
    desc: '半屏山傳說裡那些「兩碗免錢」就吃了兩碗的人。貪心把山挖走了一半，也把他們的魂留在了山腳。',
  });
  base('moray', {
    name: '海鰻精', art: 'moray', lv: 31, elem: 'water', m: { hp: 1.05, atk: 1.1, spd: 1.15 },
    skills: [['e_moray_bite', 3], ['e_moray_coil', 1]], drops: [['wuyuzi', 0.15]],
    desc: '旗後外海礁石洞裡的大海鰻，一口利牙能咬斷船槳。',
  });
  variant('sand_crab_v2', 'sand_crab', 2, 30);
  troop('dagou_1', ['greed_ghost', 'greed_ghost'], 'south', 'battle2');
  troop('dagou_2', ['moray', 'sand_crab_v2'], 'south', 'battle2');
  troop('dagou_3', ['sand_crab_v2', 'sand_crab_v2', 'moray'], 'south', 'battle2');
  troop('dagou_4', ['greed_ghost', 'moray', 'greed_ghost'], 'south', 'battle2');
  area('dagou', { name: '打狗・旗後', ch: 9, lv: [30, 31], troops: ['dagou_1', 'dagou_2', 'dagou_3', 'dagou_4'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  variant('plague_ghost_v1', 'plague_ghost', 1, 32);
  variant('moray_v1', 'moray', 1, 32);
  troop('donggang_1', ['plague_ghost_v1', 'plague_ghost_v1'], 'south', 'battle2');
  troop('donggang_2', ['moray_v1', 'moray_v1'], 'south', 'battle2');
  troop('donggang_3', ['plague_ghost_v1', 'moray_v1', 'plague_ghost_v1'], 'wangboat', 'battle2');
  area('donggang', { name: '東港', ch: 9, lv: [31, 32], troops: ['donggang_1', 'donggang_2', 'donggang_3'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  variant('wind_sprite_v2', 'wind_sprite', 2, 33);
  variant('boar_spirit_v2', 'boar_spirit', 2, 33);
  troop('hengchun_1', ['wind_sprite_v2', 'wind_sprite_v2'], 'hengchun', 'battle2');
  troop('hengchun_2', ['boar_spirit_v2', 'wind_sprite_v2'], 'hengchun', 'battle2');
  troop('hengchun_3', ['wind_sprite_v2', 'wind_sprite_v2', 'wind_sprite_v2'], 'hengchun', 'battle2');
  troop('hengchun_4', ['boar_spirit_v2', 'boar_spirit_v2'], 'hengchun', 'battle2');
  def('fallwind', {
    name: '落山風靈', art: 'fallwind', lv: 34, elem: 'wood', boss: true, immune: BOSS_IMM,
    m: { hp: 12, atk: 2.44, mag: 2.44, def: 1.15, spd: 1.45, exp: 7, gold: 7 },
    skills: [['e_fw_gale', 3], ['e_fw_crush', 3], ['e_fw_sand', 1], ['e_wind_blade', 2], ['e_fw_calm', 1, 'hp<50']],
    drops: [['ft_talang', 1]],
    desc: '每年秋冬從中央山脈直撲恆春半島的落山風。風本無惡意——是潮病讓它忘了什麼時候該停。',
  });
  boss('boss_fallwind', ['fallwind'], 'hengchun');
  area('hengchun', { name: '恆春', ch: 9, lv: [32, 33], troops: ['hengchun_1', 'hengchun_2', 'hengchun_3', 'hengchun_4'], bosses: ['boss_fallwind'], party: ['xinghe', 'hongying', 'yungui'] });

  base('sea_monster', {
    name: '海妖', art: 'sea_monster', lv: 34, elem: 'water', m: { hp: 1.2, atk: 1.0, mag: 1.2, spd: 1.0 },
    skills: [['e_sea_tentacle', 3], ['e_sea_song', 1], ['e_ghost_touch', 1]], drops: [['yinghuaxia', 0.1], ['c9_mat_shanhusui', 0.3]], // 珊瑚碎: ch9 龍坑
    desc: '從黑潮深處被潮病逼上來的怪物。牠的歌聲很美，因為那是牠從溺水者那裡學來的。',
  });
  troop('cape_1', ['sea_monster'], 'cape', 'battle2');
  troop('cape_2', ['sea_monster', 'moray_v1'], 'cape', 'battle2');
  troop('cape_3', ['moray_v1', 'wind_sprite_v2', 'sand_crab_v2'], 'cape', 'battle2');
  troop('cape_4', ['wind_sprite_v2', 'sea_monster'], 'cape', 'battle2');
  area('cape', { name: '鵝鑾鼻', ch: 9, lv: [33, 34], troops: ['cape_1', 'cape_2', 'cape_3', 'cape_4'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  // =================================================================================== 10 後山巡境
  def('drowned_soul', {
    name: '溺魂', art: 'water_ghost', variant: 2, lv: 35, elem: 'water', weak: ['fire', 'earth'], m: { hp: 1.0, atk: 1.0, mag: 1.1 },
    skills: [['e_drown_pull', 2], ['e_ghost_touch', 2], ['e_claw', 1]], drops: [['feiyugan', 0.12]],
    desc: '黑潮沿岸被潮病喚醒的溺死者。他們的燈早該漂遠了，卻一次又一次被浪打回岸邊。',
  });
  variant('sea_monster_v1', 'sea_monster', 1, 35);
  variant('moray_v2', 'moray', 2, 34);
  troop('orchid_1', ['drowned_soul', 'drowned_soul'], 'orchid', 'battle2');
  troop('orchid_2', ['moray_v2', 'moray_v2'], 'orchid', 'battle2');
  troop('orchid_3', ['sea_monster_v1', 'drowned_soul'], 'orchid', 'battle2');
  troop('orchid_4', ['drowned_soul', 'drowned_soul', 'moray_v2'], 'orchid', 'battle2');
  def('tide_serpent', {
    name: '潮病海蛇', art: 'tide_serpent', lv: 36, elem: 'water', weak: ['earth', 'wood'], boss: true, immune: BOSS_IMM,
    m: { hp: 11.5, atk: 3.05, mag: 2.95, def: 1.15, spd: 1.95, exp: 23.2, gold: 25.8 }, // tools/sim_story.js: was hp 9 atk 2.1 mag 2.03 spd 1.35
    skills: [['e_ts_bite', 3], ['e_ts_wave', 3], ['e_ts_sick', 1], ['e_sea_tentacle', 1]],
    drops: [['hd_kunlin', 1]],
    desc: '隨黑潮洄游的巨大海蛇，鱗片下滲著黑色的潮病。牠撞壞了拼板舟，不是因為兇猛，是因為痛。',
  });
  boss('boss_tide_serpent', ['tide_serpent'], 'orchid');
  area('orchid', { name: '蘭嶼', ch: 10, lv: [34, 35], troops: ['orchid_1', 'orchid_2', 'orchid_3', 'orchid_4'], bosses: ['boss_tide_serpent'], party: ['xinghe', 'hongying', 'yungui'] });

  base('cliff_spirit', {
    name: '斷崖石靈', art: 'cliff_spirit', lv: 36, elem: 'earth', m: { hp: 1.4, atk: 1.1, def: 1.5, spd: 0.8 },
    skills: [['e_cliff_slide', 2], ['e_stone_fist', 3], ['e_cliff_shell', 1]], drops: [['mashu', 0.1]],
    desc: '清水斷崖的大理石有了靈。它們聽了幾萬年的海浪，最近浪的聲音變了，它們很不安。',
  });
  troop('taitung_1', ['drowned_soul', 'drowned_soul', 'drowned_soul'], 'eastcoast', 'battle2');
  troop('taitung_2', ['sea_monster_v1', 'cliff_spirit'], 'eastcoast', 'battle2');
  troop('taitung_3', ['cliff_spirit', 'drowned_soul'], 'eastcoast', 'battle2');
  area('taitung', { name: '台東海岸', ch: 10, lv: [35, 36], troops: ['taitung_1', 'taitung_2', 'taitung_3'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  variant('cliff_spirit_v1', 'cliff_spirit', 1, 37);
  variant('fog_spirit_v2', 'fog_spirit', 2, 37);
  troop('taroko_1', ['cliff_spirit_v1', 'fog_spirit_v2'], 'taroko', 'battle2');
  troop('taroko_2', ['fog_spirit_v2', 'fog_spirit_v2', 'fog_spirit_v2'], 'taroko', 'battle2');
  troop('taroko_3', ['cliff_spirit_v1', 'cliff_spirit_v1'], 'taroko', 'battle2');
  troop('taroko_4', ['cliff_spirit_v1', 'fog_spirit_v2', 'drowned_soul'], 'taroko', 'battle2');
  def('gorge_colossus', {
    name: '峽谷巨像', art: 'gorge_colossus', lv: 38, elem: 'earth', weak: ['wood'], boss: true, immune: BOSS_IMM,
    m: { hp: 8, atk: 2.15, mag: 1.65, def: 1.35, spd: 1.25, exp: 26.5, gold: 35.8 }, // tools/sim_story.js: was atk 3.04 mag 2.72 (its 濁流 nearly one-shot the party)
    skills: [['e_gc_smash', 3], ['e_gc_quake', 2], ['e_gc_river', 2], ['e_cliff_shell', 1, 'hp<50']],
    drops: [['ft_shunfeng', 1]],
    desc: '被潮病侵蝕的大理石巨像，立霧溪的碧水在它腳下變得混濁。它守著峽谷，卻已經不記得在守什麼。',
  });
  boss('boss_colossus', ['gorge_colossus'], 'taroko');
  area('taroko', { name: '太魯閣峽谷', ch: 10, lv: [36, 37], troops: ['taroko_1', 'taroko_2', 'taroko_3', 'taroko_4'], bosses: ['boss_colossus'], party: ['xinghe', 'hongying', 'yungui'] });

  base('hungry_ghost', {
    name: '孤魂', art: 'hungry_ghost', lv: 38, elem: null, weak: ['fire'], m: { hp: 1.0, atk: 1.0, mag: 1.05, spd: 1.1 },
    skills: [['e_hungry_grab', 3], ['e_hungry_wail', 1]], drops: [['mashu', 0.12], ['jiuzhuan', 0.03]],
    desc: '沒有人祭拜的孤魂，鬼月最後幾夜餓得最兇。頭城人搶孤，搶的不只是供品——也是把它們送走的福氣。',
  });
  variant('hungry_ghost_v1', 'hungry_ghost', 1, 38);
  troop('toucheng_1', ['hungry_ghost', 'hungry_ghost'], 'toucheng', 'toucheng');
  troop('toucheng_2', ['hungry_ghost', 'hungry_ghost', 'hungry_ghost_v1'], 'toucheng', 'toucheng');
  troop('toucheng_3', ['hungry_ghost_v1', 'drowned_soul'], 'toucheng', 'toucheng');
  def('hungry_ghost_lord', {
    name: '孤棚餓鬼', art: 'hungry_ghost', variant: 2, scale: 1.5, lv: 39, elem: null, weak: ['fire'], boss: true, immune: BOSS_IMM,
    m: { hp: 7.5, atk: 2.52, mag: 2.34, def: 1.1, spd: 1.3, exp: 5, gold: 5 },
    skills: [['e_hungry_grab', 3], ['e_hungry_wail', 2], ['e_heavy', 1]],
    drops: [['jiuzhuan', 1]],
    desc: '盤踞在孤棚頂上、搶光所有供品也吃不飽的大餓鬼。它餓的其實是被人記得。',
  });
  boss('boss_guzhao', ['hungry_ghost_lord', 'hungry_ghost', 'hungry_ghost'], 'toucheng', 'toucheng');
  area('toucheng', { name: '宜蘭・頭城', ch: 10, lv: [37, 38], troops: ['toucheng_1', 'toucheng_2', 'toucheng_3'], bosses: ['boss_guzhao'], party: ['xinghe', 'hongying', 'yungui'] });

  // =================================================================================== 11 黑水溝・彼岸
  base('pirate_ghost', {
    name: '海盜鬼', art: 'pirate_ghost', lv: 39, elem: 'metal', m: { hp: 1.1, atk: 1.1, mag: 1.0, def: 1.1, spd: 1.0 },
    skills: [['e_pirate_cutlass', 3], ['e_pirate_cannon', 1]], drops: [['heitanggao', 0.08], ['fu_taiji', 0.02]],
    desc: '在澎湖海域翻覆的海盜船上的亡魂，還在找當年埋在玄武岩縫裡的寶藏。',
  });
  variant('sea_monster_v2', 'sea_monster', 2, 39);
  troop('penghu_1', ['pirate_ghost', 'pirate_ghost'], 'penghu', 'penghu');
  troop('penghu_2', ['sea_monster_v2', 'pirate_ghost'], 'penghu', 'penghu');
  troop('penghu_3', ['pirate_ghost', 'pirate_ghost', 'drowned_soul'], 'penghu', 'penghu');
  area('penghu', { name: '澎湖', ch: 11, lv: [38, 39], troops: ['penghu_1', 'penghu_2', 'penghu_3'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  def('temple_guard_v1', Object.assign({}, BASE.temple_guard, { name: '玄武宮衛', lv: 40, desc: '玄武嶼長明宮的精銳守衛。他們手中的長明燈，燈芯是黑色的。' }));
  variant('lantern_golem_v1', 'lantern_golem', 1, 40);
  variant('marionette_v2', 'marionette', 2, 39);
  troop('xuanwu_1', ['temple_guard_v1', 'temple_guard_v1'], 'xuanwu', 'battle2');
  troop('xuanwu_2', ['lantern_golem_v1', 'marionette_v2'], 'xuanwu', 'battle2');
  troop('xuanwu_3', ['marionette_v2', 'marionette_v2', 'temple_guard_v1'], 'xuanwu', 'battle2');
  def('moya2', {
    name: '墨鴉', sprite: 'moya', lv: 41, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 12, atk: 2.33, mag: 2.44, def: 1.15, spd: 1.5, exp: 6, gold: 8 },
    skills: [['e_crow_feathers', 3], ['e_crow_hex', 2], ['e_crow_wind', 2], ['e_slash', 1], ['e_crow_smug', 1, 'hp<50']],
    drops: [['ac_lianhua', 1]],
    desc: '又是他。這次他沒整理髮型——他是真的怕了，但還是擋在夜玄的門前。',
  });
  boss('boss_moya2', ['moya2'], 'xuanwu');
  area('xuanwu', { name: '玄武嶼・長明宮', ch: 11, lv: [39, 40], troops: ['xuanwu_1', 'xuanwu_2', 'xuanwu_3'], bosses: ['boss_moya2'], party: ['xinghe', 'hongying', 'yungui'] });

  base('drowned_swarm', {
    name: '溺魂群', art: 'drowned_swarm', lv: 41, elem: 'water', weak: ['fire', 'earth'], m: { hp: 1.5, atk: 0.95, mag: 1.2, def: 0.9, spd: 0.9 },
    skills: [['e_swarm_drag', 2], ['e_rat_swarm', 1], ['e_ghost_touch', 2]], drops: [['heitanggao', 0.1]],
    desc: '黑水溝裡糾纏成一團的溺魂。「六死三留一回頭」——那六成，都在這裡。',
  });
  variant('tide_grudge_v2', 'tide_grudge', 2, 41);
  variant('drowned_soldier_v2', 'drowned_soldier', 2, 40);
  troop('blacktide_1', ['drowned_swarm'], 'sea', 'sea');
  troop('blacktide_2', ['tide_grudge_v2', 'drowned_soldier_v2'], 'sea', 'sea');
  troop('blacktide_3', ['drowned_soldier_v2', 'drowned_soldier_v2', 'tide_grudge_v2'], 'sea', 'sea');
  troop('blacktide_4', ['drowned_swarm', 'tide_grudge_v2'], 'sea', 'sea');
  def('kun', {
    name: '鯤', art: 'kun', lv: 42, elem: 'water', weak: ['earth'], boss: true, immune: BOSS_IMM,
    m: { hp: 8.5, atk: 2.62, mag: 2.54, def: 1.2, spd: 1.2, exp: 7, gold: 7 },
    skills: [['e_kun_swallow', 3], ['e_kun_spout', 3], ['e_swarm_drag', 1], ['e_kun_dive', 1, 'hp<50']],
    drops: [['huanhundan', 1]],
    desc: '北冥有魚，其名為鯤。牠游過黑水溝的時候，整片海的燈火都會跟著傾斜。',
  });
  boss('boss_kun', ['kun'], 'sea', 'boss');
  area('blacktide', { name: '黑水溝', ch: 11, lv: [40, 41], troops: ['blacktide_1', 'blacktide_2', 'blacktide_3', 'blacktide_4'], bosses: ['boss_kun'], party: ['xinghe', 'hongying', 'yungui'] });

  base('lily_demon', {
    name: '彼岸花妖', art: 'lily_demon', lv: 42, elem: 'fire', weak: ['water'], m: { hp: 1.05, atk: 0.95, mag: 1.25, spd: 1.1 },
    skills: [['e_lily_petal', 3], ['e_lily_bloom', 1]], drops: [['mat_huaxun', 0.2], ['heitanggao', 0.08]],
    desc: '花開不見葉，葉生不見花。彼岸花原上長出了腳的花，想把過路的魂留下來當葉子。',
  });
  base('faceless', {
    name: '無面鬼', art: 'faceless', lv: 42, elem: null, m: { hp: 1.15, atk: 1.05, mag: 1.15, spd: 1.05 },
    skills: [['e_faceless_steal', 2], ['e_claw', 2]], drops: [['huanhundan', 0.05]],
    desc: '被洗去了所有記憶、卻沒能投胎的魂，連臉都忘了。它想要一張臉，你的就很好。',
  });
  troop('farshore_1', ['lily_demon', 'lily_demon'], 'farshore', 'farshore');
  troop('farshore_2', ['faceless', 'lily_demon'], 'farshore', 'farshore');
  troop('farshore_3', ['faceless', 'faceless', 'lily_demon'], 'farshore', 'farshore');
  area('farshore', { name: '彼岸花原', ch: 11, lv: [41, 42], troops: ['farshore_1', 'farshore_2', 'farshore_3'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  base('tower_warden', {
    name: '燈塔守', art: 'tower_warden', lv: 43, elem: 'fire', m: { hp: 1.35, atk: 1.1, mag: 1.2, def: 1.25, spd: 0.95 },
    skills: [['e_warden_beam', 2], ['e_warden_key', 3]], drops: [['jiuzhuan', 0.1]],
    desc: '彼岸燈塔每一層的守門人。歷代燈靈留下的影子，靜靜地問每一個上樓的人：你為什麼而來？',
  });
  variant('faceless_v1', 'faceless', 1, 43);
  variant('inner_demon_v1', 'inner_demon', 1, 43, { name: '回聲', desc: '燈塔裡你自己的回聲。它記得你走過的每一步，也記得你差一點放棄的每一次。' });
  troop('tower_1', ['tower_warden'], 'lighthouse', 'lighthouse');
  troop('tower_2', ['faceless_v1', 'faceless_v1'], 'lighthouse', 'lighthouse');
  troop('tower_3', ['inner_demon_v1', 'tower_warden'], 'lighthouse', 'lighthouse');
  troop('tower_4', ['lily_demon', 'faceless_v1', 'lily_demon'], 'lighthouse', 'lighthouse');
  area('tower', { name: '彼岸燈塔', ch: 11, lv: [42, 43], troops: ['tower_1', 'tower_2', 'tower_3', 'tower_4'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] });

  def('jewel_child', {
    name: '萬象童子', art: 'jewel_child', lv: 43, elem: null, immune: ['poison', 'seal'], m: { hp: 0.9, atk: 0.6, mag: 0.9, def: 1.0, spd: 1.6, exp: 2, gold: 0.5 },
    skills: [['e_child_play', 3], ['e_child_riddle', 1], ['e_child_laugh', 1, 'ally_hurt']], drops: [['mat_huaxun', 0.5]],
    desc: '一息界裡用光和笑聲做成的孩子，每一秒都在變成別的東西。他們不是在戰鬥——是在玩。',
  });
  troop('breath_game', ['jewel_child', 'jewel_child', 'jewel_child'], 'breath', 'breath', { flee: true });

  def('yexuan', {
    name: '夜玄', sprite: 'yexuan', lv: 44, elem: 'water', boss: true, immune: BOSS_IMM,
    m: { hp: 14.5, atk: 2.21, mag: 2.28, def: 1.25, spd: 1.5, exp: 8, gold: 0 },
    skills: [['e_yx_lamp', 3], ['e_yx_oar', 3], ['e_yx_jar', 1], ['e_yx_reverse', 2]],
    phases: [
      { at: 0.5, phase: 2, text: '夜玄打開了懷中的罐子。「念兒……再等爹一下。」',
        buffs: [{ stat: 'mag', amt: 0.3, turns: 99 }],
        skills: [['e_yx_reverse', 3], ['e_yx_eternal', 2], ['e_yx_oar', 2], ['e_yx_jar', 1], ['e_yx_memory', 1, 'hp<30']] },
    ],
    drops: [],
    desc: '長明宮之主，玄冥法師。二十年前，他在黑水溝接住了女兒的魂燈，從此再也沒有放手。',
  });
  boss('boss_yexuan', ['yexuan'], 'farshore', 'villain');
  def('wuxiang', {
    name: '黑潮・無相', art: 'wuxiang', lv: 45, elem: 'water', boss: true, immune: BOSS_IMM.concat(['seal']),
    m: { hp: 15.5, atk: 2.31, mag: 2.39, def: 1.2, spd: 1.45, exp: 0, gold: 0 },
    skills: [['e_wx_tide', 3], ['e_wx_maw', 2], ['e_wx_forget', 1]],
    phases: [
      { at: 0.7, phase: 2, text: '黑潮張開了千萬張嘴——每一張都在喊著一個被遺忘的名字。',
        skills: [['e_wx_tide', 2], ['e_wx_maw', 3], ['e_wx_void', 2], ['e_wx_forget', 1]] },
      { at: 0.35, phase: 3, text: '沒有形狀的東西，開始變成你們每一個人最害怕失去的樣子。',
        buffs: [{ stat: 'atk', amt: 0.3, turns: 99 }],
        skills: [['e_wx_drown', 2], ['e_wx_void', 2], ['e_wx_maw', 2], ['e_wx_forget', 1]] },
    ],
    drops: [],
    desc: '逆潮喚醒的、所有被遺忘之物的集合。它沒有臉，因為它是所有人不願記得的那一面。',
  });
  boss('boss_wuxiang', ['wuxiang'], 'breath', 'final_boss');
  area('breath', { name: '一息界', ch: 11, lv: [43, 44], troops: ['breath_game'], bosses: ['boss_yexuan', 'boss_wuxiang'], party: ['xinghe', 'baizhi', 'hongying', 'yungui'] });
})();

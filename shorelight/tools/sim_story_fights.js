// 彼岸燈 — the boss / scripted fights of chapters 0–10 for tools/sim_story.js, with the party a normal player would
// really have there: level (G.Data.areas / progression table, cross-checked with `node tools/sim_battle.js --prog` and the
// screenplays), members, the best gear from the shops reachable before the fight, and a consumable kit bought there.
//
// Fight fields:
//   id, ch, file ('chN' — the chapter file whose scope evaluates `opts`), name, troop, opts (the exact expression the
//   chapter passes to S.battle, evaluated inside the chapter's IIFE), party, lv (number or {charId: lv}),
//   shops (item ids on sale before the fight: gear is picked from these + starting gear + gifts, consumables from these),
//   gifts {charId: [itemIds]}, gear {charId: {slot: itemId}} (fixed), withhold [itemIds], skills {charId: [story skills]},
//   flags / vars (G.state), inv {itemId: n} (extra), kit {heal:[best, second], mp, revive},
//   before: [{troop, opts, loseOk}] fights that precede it with no rest, pre(G) extra setup,
//   focus / avoid: enemy ids the player is told to hit first / leave alone, tactics(sc, u, h) → a command the on-screen
//   hint tells the player to use (or null), valueMod(sc, u, skill, target, value) → adjusted damage value,
//   scripted: true (story-fixed result or a no-penalty loss: reported, not tuned), loseOk: the story continues after a loss.
'use strict';

// ------------------------------------------------------------------------------------------------ shops, cumulative
const S1a = ['caozaiguo', 'jinchuang', 'jiedu', 'bianpao', 'c1_salt', 'c1_sweetpotato', 'c1_dried_fish', 'c1_oolong', 'ar_padded', 'hd_douli', 'ft_cloth',
  'xiangbao', 'c1_tea_egg', 'yuyuan', 'c1_yuyuan_ice'];
const S1 = S1a.concat(['c1_dingbian', 'c1_tempura', 'c1_shuideng', 'c1_xianghuo', 'pinganfu', 'c1_honggui']);
const S1end = S1.concat(['fl_bamboo']);
const S2a = S1end.concat(['c2_indigo_scarf', 'c2_indigo_robe', 'c2_tiandeng_charm']);
const S2 = S2a.concat(['c2_bento', 'c2_chicken_soup', 'huanhunxiang', 'c2_longan', 'sw_bronze', 'fl_qinglan', 'ar_leather', 'hd_toujin', 'ac_xionghuang']);
const S3a = S2.concat(['c3_fishball', 'c3_fishcrisp', 'c3_qingxinlu', 'lingxun', 'c3_redpaper', 'c3_bamboo', 'c3_candle']);
const S3 = S3a.concat(['c3_wanguo_lite', 'c3_wanguo', 'c3_wendan', 'c3_mooncake', 'mifentang', 'c3_herbtea', 'c3_ningshen',
  'sw_banka', 'sp_bintie', 'fl_zizhu', 'c3_fn_peach', 'c3_ar_shortcoat', 'c3_ar_embroidered', 'ft_muji']);
const S4 = S3.concat(['chaomifen', 'shibing', 'shibing_frost', 'sw_jiujiang', 'sp_zhujie', 'fn_zhugu', 'xumingsan', 'pinganfu', 'ac_bagua', 'ac_yingshi',
  'mijiu', 'bantiao', 'caibao', 'xiancao', 'ar_hakka', 'hd_huabu', 'leicha']);
const S5 = S4.concat(['c5_small_lantern', 'ezaijian', 'c5_mianxian', 'c5_ginger_tea', 'c5_zhenshi', 'fu_dingshen', 'niushebing',
  'sw_bailian', 'c5_sp_steel', 'fl_diaohua', 'fn_zhusha', 'ar_brocade', 'c5_hd_warmhat', 'ft_lupi']);
const S6 = S5.concat(['c6_bamboo_hat', 'c6_padded_coat', 'c6_wet_towel', 'fengpao', 'shimuyu', 'c6_zongzi', 'c6_herb_tea', 'wanguo', 'c6_salty_cake', 'fenglisu',
  'sw_qixing', 'sp_qilin', 'fl_baiyu', 'fn_qixing', 'ar_chain', 'c6_brocade_m', 'c6_brocade_f', 'hd_yuguan', 'c6_official_boots', 'ac_yeming',
  'c6_jinchuang2', 'c6_jinchuang3', 'c6_ningshen', 'c6_ningshen2', 'c6_revive_incense', 'c6_yuanxiao']);
const S7a = S6.concat(['c7_zhixue', 'c7_huiqi', 'c7_xingshen', 'c7_salt', 'c7_sw_chitong', 'sp_hanyu', 'fn_yunhai', 'c7_ar_lieren', 'c7_ft_shanxing']);
const S7b = S7a.concat(['c7_yunwu', 'c7_shanshen', 'c7_qingxintai', 'c7_tobacco', 'c7_ar_taiyi']);
const S7 = S7b.concat(['huanhundan', 'c7_qiliyu', 'c7_ac_huyuepei', 'c7_sw_chixia', 'sp_zhenchao', 'c7_fn_qinglan']);
const S8a = S7.concat(['c8_huashengtang', 'c8_jianpangui', 'c8_mayouji', 'c8_yaroujeng', 'aiyu', 'c8_liuguang', 'c8_jingtao', 'c8_leiyin', 'c8_jinxiang', 'c8_douli', 'c8_caoxie']);
const S8 = S8a.concat(['c8_xiajuan', 'c8_douhua', 'c8_jianshi', 'c8_haifeng']);
const S9a = S8.concat(['c9_xiancaodong', 'c9_aicao', 'c9_jiedusan', 'c9_qingxindan', 'c9_baicaogao', 'c9_lurongjiu']);
const S9b = S9a.concat(['c9_shuanggaorun', 'c9_qiyuwan', 'yinghuaxia', 'c9_quwenfu', 'sp_polang', 'c9_sw_tiegu', 'c9_ar_yulin', 'c9_ft_baotie']);
const S9 = S9b.concat(['c9_gangkoucha', 'c9_lvdousuan', 'c9_chayeguan', 'c9_feiyu', 'fn_haifeng', 'c9_hd_douli', 'c9_ar_niupi', 'ac_haixing', 'c9_sp_yueya', 'c9_biscuit', 'c9_dengyou', 'c9_match']);
const S10a = S9;
const S10b = S10a.concat(['c10_qiyuwan', 'c10_xiaomigao', 'c10_baicao', 'c10_fanshu', 'c10_sw_chaosheng', 'c10_sp_huilang', 'c10_ar_tengjia', 'c10_hd_lupi', 'c10_ft_lupi']);
const S10c = S10b.concat(['c10_quxiefu', 'mashu', 'c10_sp_huilan', 'c10_ar_shiwen', 'c10_hd_zhubian']);
const S10 = S10c.concat(['c10_gaozha', 'c10_mifengeng', 'c10_pudugao', 'c10_sw_lanyang', 'c10_fn_haishen', 'c10_ac_yujia', 'c10_ar_jiaosi', 'c10_hd_jiaosi', 'c10_ft_jiaosi']);
const SHOPS = { S1a, S1, S2a, S2, S3a, S3, S4, S5, S6, S7a, S7b, S7, S8a, S8, S9a, S9b, S9, S10b, S10c, S10 };

const XH = 'xinghe', BZ = 'baizhi', HY = 'hongying', YG = 'yungui';
const FOUR = [XH, BZ, HY, YG], TRIO = [XH, HY, YG];
const yinghuo = { [XH]: ['sw_yinghuo'] };
// story skills by chapter
const SK7 = { [HY]: ['hy_fangshou'], [YG]: ['yg_mankan'] };
const SK7x = { [XH]: ['xh_xinhuo_ran', 'xh_xinhuo_zhao', 'xh_xinhuo_bumie', 'xh_xinhuo_passive'], [HY]: ['hy_fangshou'], [YG]: ['yg_mankan'] };
const SK8 = { [XH]: SK7x[XH], [HY]: ['hy_fangshou'], [YG]: ['yg_mankan', 'yg_taixu'] };
const SK9 = { [XH]: SK7x[XH], [HY]: ['hy_fangshou', 'hy_luojia'], [YG]: ['yg_mankan', 'yg_taixu'] };
const AWAKE = { ch7_xinhuo: true, ch7_taixu: true };

// gear the chapter playthrough tests equip (tools/test/chapters/chN.test.js) — used by `sim_story.js --test`
const eq = (w, a, h, f, ac) => Object.fromEntries(Object.entries({ weapon: w, armor: a, head: h, feet: f, acc: ac }).filter(([, v]) => v));
const T4 = { [XH]: eq('sw_jiujiang', 'ar_hakka', 'hd_huabu', 'ft_muji'), [BZ]: eq('fl_shange', 'ar_hakka', 'hd_huabu', 'ft_muji'), [HY]: eq('sp_zhujie', 'ar_hakka', 'hd_huabu', 'ft_muji'), [YG]: eq('fn_zhugu', 'ar_hakka', 'hd_huabu', 'ft_muji') };
const T7 = { [XH]: eq('sw_qixing', 'ar_chain', 'hd_yuguan', 'ft_lupi'), [HY]: eq('sp_qilin', 'ar_chain', null, 'ft_lupi'), [YG]: eq('fn_qixing', 'ar_brocade', null, 'ft_lupi') };
const T8 = { [XH]: eq('c8_liuguang', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_qingxin'), [HY]: eq('c8_jingtao', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_huzhao'), [YG]: eq('c8_leiyin', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_yeming') };
const T5 = { [XH]: eq('sw_bailian', 'ar_brocade', 'c5_hd_warmhat', 'ft_lupi'), [BZ]: eq('fl_diaohua', 'ar_brocade', 'c5_hd_warmhat', 'ft_lupi'), [HY]: eq('c5_sp_steel', 'ar_brocade', 'c5_hd_warmhat', 'ft_lupi'), [YG]: eq('fn_zhusha', 'ar_brocade', 'c5_hd_warmhat', 'ft_lupi') };
const DBG = { jinchuang: 5, xumingsan: 5, jiuzhuan: 5, huanhunxiang: 5, huanhundan: 5, jiedu: 5, xiangbao: 5, pinganfu: 5, yuyuan: 5, caozaiguo: 5, mijiu: 5, mifentang: 5 }; // ?debug&map=… start
const K6 = { xumingsan: 6, huanhunxiang: 4 }, K7 = { xumingsan: 6, wanguo: 3, fenglisu: 3, huanhunxiang: 3, xiangbao: 3 };
const K9 = { shimuyu: 3, xumingsan: 5, huanhunxiang: 3, xiancao: 3 }, K10 = { wuyuzi: 5, yinghuaxia: 3, huanhunxiang: 5, jiuzhuan: 2, mijiu: 5, aiyu: 4 };
const T6 = { [XH]: eq('sw_qixing', 'c6_brocade_m', 'hd_yuguan', 'ft_lupi'), [BZ]: eq('fl_baiyu', 'c6_brocade_f', 'hd_yuguan', 'ft_lupi'), [HY]: eq('sp_qilin', 'c6_brocade_f', 'hd_yuguan', 'ft_lupi'), [YG]: eq('fn_qixing', 'c6_brocade_m', 'hd_yuguan', 'ft_lupi') };
const T10 = { [XH]: eq('c10_sw_lanyang', 'c10_ar_jiaosi', 'c10_hd_jiaosi', 'c10_ft_jiaosi'), [HY]: eq('c10_sp_huilan', 'c10_ar_jiaosi', 'c10_hd_jiaosi', 'c10_ft_jiaosi'), [YG]: eq('c10_fn_haishen', 'c10_ar_jiaosi', 'c10_hd_jiaosi', 'c10_ft_jiaosi') };

// a sensible player plays the hint the battle shows
const tWindDemon = (sc, u, h) => {
  if (u.id === BZ && h.usable.includes('bz_duhun') && sc.alive('enemy').some((e) => e.id === 'e_wind_drowned')) return h.cmdFor('bz_duhun');
  return null;
};
const tLinto = (sc, u, h) => {
  const st = sc.c6;
  if (st && st.window && !st.listened.has(u.id)) return { kind: 'defend' };
  if (st && st.window) return { kind: 'defend' };
  if (u.id === BZ && h.usable.includes('bz_duhun') && sc.alive('party').every((p) => p.hp > p.mhp * 0.5)) return h.cmdFor('bz_duhun');
  return null;
};
const tNether = (sc, u, h) => {
  const st = sc.c6;
  if (st && st.mark && !st.mark.guarded && !st.mark.u.dead) {
    if (st.mark.u === u && st.mark.n <= 1) return { kind: 'defend' };
    if (u.id === XH && h.usable.includes('xh_hudeng')) return h.cmdFor('xh_hudeng', st.mark.u);
    if (st.mark.u === u) return { kind: 'defend' };
  }
  if (u.id === BZ && h.usable.includes('bz_duhun') && sc.alive('enemy').some((e) => e.id.startsWith('c6_soul_jar_')) && sc.alive('party').every((p) => p.hp > p.mhp * 0.45)) return h.cmdFor('bz_duhun');
  return null;
};
const tMoray = (sc, u, h) => {
  const v = h.G.state.vars;
  if (u.id === XH && v.flame != null && v.flame <= 25 && h.usable.includes('c9_guard_lamp')) return h.cmdFor('c9_guard_lamp');
  return null;
};
const tSerpent = (sc, u) => {
  const boss = sc.enemies.find((e) => e.id === 'tide_serpent');
  if (boss && boss.submerged) {
    const m = sc.msg && sc.msg.text || '';
    if (m.includes(u.name)) return { kind: 'defend' };
  }
  return null;
};
const vColossus = (sc, u, s, t, v) => {
  const R = sc.c10;
  if (!R) return v;
  if (R.armor > 0 && !R.p3) v *= s.elem === 'wood' ? 1.6 : 0.6;
  else if (R.exposed > 0 || R.p3) v *= 1.3;
  if (s.elem === 'fire' && R.melt < 2) v *= 1.15;
  return v;
};
const tGuhun = (sc, u, h) => {
  const R = sc.c10;
  const boss = sc.enemies.find((e) => e.id === 'c10_guhun_horde' && !e.dead);
  if (!R || !boss || R.hunger <= 30) return null;
  const urgent = R.hunger >= 70 || boss.hp < boss.mhp * 0.55;
  if (!urgent) return null;
  if (u.id === YG && h.usable.includes('yg_pudu')) return h.cmdFor('yg_pudu');
  if (h.G.Inv.count('c10_pudu_offering') > 0) return h.item('c10_pudu_offering', boss);
  return null;
};

function FIGHTS() {
  return [
    // ============================================================== ch0 序章 (dream: a loss restarts the fight at full HP)
    { id: 'c0_big_wisp', test: { lv: 1 }, ch: 0, file: 'ch0', name: '大海霧魂 (0-6, optional)', troop: 't_c0_dream_3', opts: "{ loseOk: true, intro: (b) => setupBattle(b, {}) }",
      party: [XH], lv: 1, shops: [], kit: { heal: [0, 0], mp: 0, revive: 0 }, scripted: true },

    // ============================================================== ch1 九份燈火
    { id: 'c1_foreman', test: { lv: 3 }, ch: 1, file: 'ch1', name: '工頭魂・金貴仔 (1-7)', troop: 't_c1_foreman', opts: "{ intro: (b) => foremanIntro(b) }",
      party: [XH], lv: 3, shops: S1a, kit: { heal: [3, 3], mp: 0, revive: 0 } },
    { id: 'c1_shore_ghost', test: { lv: 4 }, ch: 1, file: 'ch1', name: '遲疑的水鬼 (1-13)', troop: 't_c1_shore_ghost', opts: "{ intro: (b) => hesitateIntro(b) }",
      party: [XH], lv: 4, shops: S1, kit: { heal: [3, 3], mp: 0, revive: 0 } },
    { id: 'c1_moya', test: { lv: 5 }, ch: 1, file: 'ch1', name: '墨鴉 (1-19, after the 1-18 fight)', troop: 't_c1_moya', opts: "{ intro: (b) => moyaIntro(b), rewards: true }",
      before: [{ troop: 'jiufen_1', opts: "noFlee('jiufen_1')" }],
      party: [XH, BZ], lv: 4, shops: S1, kit: { heal: [4, 3], mp: 2, revive: 0 } },
    { id: 'c1_ghost_king', test: { lv: 5 }, ch: 1, file: 'ch1', name: '水鬼王 + 陳伯 (1-20, right after 墨鴉)', troop: 't_c1_ghost_king',
      opts: "{ guests: ['chenbo'], intro: (b) => ghostKingIntro(b), onTurn: (b, u) => ghostKingTurn(b, u), rewards: true }",
      before: [{ troop: 'jiufen_1', opts: "noFlee('jiufen_1')" }, { troop: 't_c1_moya', opts: "{ intro: (b) => moyaIntro(b), rewards: true }", after: (G) => {
        const avg = Math.round(G.Party.active().reduce((a, m) => a + m.lv, 0) / G.Party.active().length);
        G.Party.create('chenbo', Math.max(8, avg + 6));
      } }],
      party: [XH, BZ], lv: 4, shops: S1, kit: { heal: [4, 3], mp: 2, revive: 0 } },

    // ============================================================== ch2 霧林天燈
    { id: 'c2_woodcutter', test: { lv: 6 }, ch: 2, file: 'ch2', name: '魔神仔頭 (2-7, loseOk)', troop: 't_c2_woodcutter', opts: "{ loseOk: true, onTurn: phantomTurn, intro: phantomTurn }",
      party: [XH, BZ], lv: 6, shops: S2a, gifts: yinghuo, loseOk: true },
    { id: 'c2_duel', test: { lv: 6 }, ch: 2, file: 'ch2', name: '洛紅纓 duel (2-8, loseOk)', troop: 'boss_hongying', opts: "{ loseOk: true, onTurn: duelTurn }",
      party: [XH, BZ], lv: 6, shops: S2a, gifts: yinghuo, loseOk: true },
    { id: 'c2_ambush', test: { lv: 6 }, ch: 2, file: 'ch2', name: '魔神仔 ambush (2-9, loseOk)', troop: 't_c2_ambush', opts: "{ loseOk: true }",
      party: [XH, BZ, HY], lv: 6, shops: S2a, gifts: yinghuo, loseOk: true },
    { id: 'c2_tiger', test: { lv: 9 }, ch: 2, file: 'ch2', name: '虎姑婆 (2-15)', troop: 't_c2_tiger', opts: "{ onTurn: oilTurn }",
      party: [XH, BZ, HY], lv: 8, shops: S2, gifts: yinghuo },

    // ============================================================== ch3 觀音艋舺
    { id: 'c3_monkeyking', test: { lv: 11 }, ch: 3, file: 'ch3', name: '石猴王 (3-5)', troop: 't_c3_monkeyking', opts: null,
      party: [XH, BZ, HY], lv: 10, shops: S3a, gifts: yinghuo },
    { id: 'c3_guimian', test: { lv: 11 }, ch: 3, file: 'ch3', name: '鬼面 raid (3-9, after the 陰兵 fight)', troop: 't_c3_guimian',
      opts: "(() => { let said75 = false; return { guests: ['yungui'], rewards: true, onTurn: async (b, u) => { const boss = b.enemies.find((e) => e.id === 'c3_guimian'); const hy = b.party.find((pp) => pp.id === 'hongying'); if (boss && u === boss && hy && !hy.dead) hy.st.guard = 1; if (boss && !said75 && boss.hp <= boss.mhp * 0.75) said75 = true; } }; })()",
      before: [{ troop: 't_c3_raid', opts: "{ guests: ['yungui'] }" }],
      party: [XH, BZ, HY], lv: 10, shops: S3a, gifts: yinghuo },
    { id: 'c3_theatre', test: { lv: 13, inv: DBG }, ch: 3, file: 'ch3', name: '戲棚 紙人 (3, 義子姑)', troop: 't_c3_theatre', opts: null,
      party: FOUR, lv: 12, shops: S3, gifts: yinghuo },
    { id: 'c3_river_boss', test: { lv: 13, inv: DBG }, ch: 3, file: 'ch3', name: '河伯怨靈 (4-2)', troop: 't_c3_river_boss',
      opts: "(() => { let warned = false; return { onTurn: async (b, u) => { if (!warned && b.rounds >= 3 && u.side === 'enemy' && u.id === 'c3_river_boss') { warned = true; u.st.stun = 1; } } }; })()",
      party: FOUR, lv: 13, shops: S3, gifts: yinghuo },
    { id: 'c3_feud', test: { lv: 13 }, ch: 3, file: 'ch3', name: '頂下郊 老鬼 (3 turns)', troop: 't_c3_feud', opts: "{ turnLimit: 3, turnLimitResult: 'win', loseOk: true, hpFloor: { c3_ghost_ashui: 0.001, c3_ghost_awang: 0.001 } }",
      party: FOUR, lv: 12, shops: S3, gifts: yinghuo, scripted: true },

    // ============================================================== ch4 竹塹風起
    { id: 'c4_coast_intro', test: { lv: 13, gear: T4 }, ch: 4, file: 'ch4', name: '九降風精 (4-1)', troop: 't4_coast_intro', opts: null, party: FOUR, lv: 13, shops: S3, gifts: yinghuo },
    { id: 'c4_racks', test: { lv: 15, gear: T4 }, ch: 4, file: 'ch4', name: '米粉架 ×3 (4-3, back to back)', troop: 't4_rack_3', opts: null,
      before: [{ troop: 't4_rack_1' }, { troop: 't4_rack_2' }], party: FOUR, lv: 14, shops: S4, gifts: yinghuo },
    { id: 'c4_ratking', test: { lv: 17, gear: T4 }, ch: 4, file: 'ch4', name: '柿鼠大王 (side quest)', troop: 't4_ratking', opts: null, party: FOUR, lv: 15, shops: S4, gifts: yinghuo },
    { id: 'c4_wind_demon', test: { lv: 17, gear: T4 }, ch: 4, file: 'ch4', name: '風魔 (4-15)', troop: 't4_boss_wind_demon', opts: null,
      party: FOUR, lv: 16, shops: S4, gifts: yinghuo, tactics: tWindDemon },

    // ============================================================== ch5 鹿港舊夢
    { id: 'c5_feast', test: { lv: 21, gear: T5 }, ch: 5, file: 'ch5', name: '怨宴 (3-12)', troop: 't_c5_feast', opts: "{ intro: feastIntro }", party: FOUR, lv: 19, shops: S5, gifts: yinghuo },

    // ============================================================== ch6 府城長明
    { id: 'c6_plague_mass', test: { lv: 19, gear: T6, inv: K6 }, ch: 6, file: 'ch6', name: '疫聚 (鹽水蜂炮)', troop: 't_c6_plague_mass',
      opts: "beehiveRules({ chance: 0.6, k: 15, forceAt: { id: 'c6_plague_mass', at: 0.3 } })", party: FOUR, lv: 21, shops: S6, gifts: yinghuo },
    { id: 'c6_linto', test: { lv: 21, gear: T6, inv: K6 }, ch: 6, file: 'ch6', name: '林投姐 (3-11)', troop: 't_c6_linto_boss', opts: 'lintoRules()',
      party: FOUR, lv: 22, shops: S6, gifts: yinghuo, tactics: tLinto },
    { id: 'c6_moya', test: { lv: 22, gear: T6, inv: K6 }, ch: 6, file: 'ch6', name: '墨鴉 (caught while sneaking)', troop: 't_c6_moya', opts: 'moyaRules()', party: FOUR, lv: 22, shops: S6, gifts: yinghuo },
    { id: 'c6_netherlamp', test: { lv: 23, gear: T6, inv: K6 }, ch: 6, file: 'ch6', name: '冥燈護法 (萬燈閣)', troop: 't_c6_netherlamp', opts: 'netherRules()',
      party: FOUR, lv: 23, shops: S6, gifts: yinghuo, tactics: tNether },
    { id: 'c6_yexuan', test: { lv: 23, gear: T6, inv: K6 }, ch: 6, file: 'ch6', name: '夜玄 (forced loss)', troop: 't_c6_yexuan_loss', opts: 'yexuanRules()',
      party: FOUR, lv: 23, shops: S6, gifts: yinghuo, scripted: true, winIf: (r) => r.result === 'lose' },

    // ============================================================== ch7 雲山入夢 (白芷 gone; 星河's flame drains until 心火)
    { id: 'c7_bear', test: { lv: 23, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '黑熊精 (alishan)', troop: 't_c7_bear', opts: '{}',
      party: TRIO, lv: 24, shops: S7a, gifts: yinghuo, flags: { ch7_flame: 72 }, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c7_mirror_qf', test: { lv: 24, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '心魔・鬼面 (紅纓 alone)', troop: 't_c7_mirror_qf', opts: '{ loseOk: true }',
      party: [HY], lv: 25, shops: S7b, flags: { ch7_flame: 60 }, scripted: true },
    { id: 'c7_mirror_yg', test: { lv: 24, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '心魔・雲歸', troop: 't_c7_mirror_yg', opts: '{}',
      party: TRIO, lv: 25, shops: S7b, gifts: yinghuo, skills: SK7, flags: { ch7_flame: 58 }, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c7_drown_shadow', test: { lv: 24, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '溺影 (puzzle penalty, loseOk)', troop: 't_c7_drown_shadow', opts: '{ loseOk: true }',
      party: TRIO, lv: 26, shops: S7b, gifts: yinghuo, skills: SK7, flags: { ch7_flame: 50 }, pre: (G) => G.__X.ch7.ev('C7.applyFlame()'), loseOk: true },
    { id: 'c7_shadow', test: { lv: 24, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '無光之影 (心火 awakens)', troop: 't_c7_shadow', opts: '{}',
      party: TRIO, lv: 26, shops: S7b, gifts: yinghuo, skills: SK7x, flags: { ch7_xinhuo: true },
      pre: (G) => { G.__X.ch7.ev('C7.applyFlame()'); const m = G.state.members.xinghe; const st = G.Party.stats('xinghe'); m.hp = st.mhp; m.mp = st.mmp; m.gauge = 50; } },
    { id: 'c7_jiao', test: { lv: 25, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '蛟 (日月潭)', troop: 't_c7_jiao', opts: '{}',
      party: TRIO, lv: 26, shops: S7b, gifts: { [XH]: ['sw_yinghuo', 'c7_ac_xinghuo'] }, skills: SK7x, flags: { ch7_xinhuo: true }, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c7_moths', test: { lv: 25, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '燈蛾 (puzzle penalty)', troop: 't_c7_moths', opts: '{}',
      party: TRIO, lv: 27, shops: S7, gifts: { [XH]: ['sw_yinghuo', 'c7_ac_xinghuo'] }, skills: SK7x, flags: { ch7_xinhuo: true }, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c7_qingxu', test: { lv: 25, gear: T7, inv: K7 }, ch: 7, file: 'ch7', name: '清虛真人 + 冥燈印 (燈母祠)', troop: 't_c7_qingxu', opts: '{}',
      party: TRIO, lv: 27, shops: S7, gifts: { [XH]: ['sw_yinghuo', 'c7_ac_xinghuo'] }, skills: SK7x, flags: { ch7_xinhuo: true },
      pre: (G) => G.__X.ch7.ev('C7.applyFlame()'), focus: ['c7_dark_seal'] },

    // ============================================================== ch8 逆潮
    { id: 'c8_street', test: { lv: 25, gear: T8 }, ch: 8, file: 'ch8', name: '北港 street (8-1)', troop: 't_c8_street', opts: '{}',
      party: TRIO, lv: 27, shops: S8a, gifts: yinghuo, skills: SK8, flags: AWAKE, pre: (G) => G.__X.ch7 && G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c8_rescue5', test: { lv: 28, gear: T8 }, ch: 8, file: 'ch8', name: '溪口 rescue 5 (8-3)', troop: 't_c8_p5', opts: '{}',
      party: TRIO, lv: 28, shops: S8a, gifts: yinghuo, skills: SK8, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c8_hundred', test: { lv: 31, gear: T8 }, ch: 8, file: 'ch8', name: '潮怨・百手 (8-4)', troop: 't_c8_hundred', opts: '{}',
      party: TRIO, lv: 28, shops: S8a, gifts: yinghuo, skills: SK8, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c8_guards', test: { lv: 29, gear: T8 }, ch: 8, file: 'ch8', name: '長明宮衛 (fort)', troop: 't_c8_guards', opts: '{}',
      party: TRIO, lv: 29, shops: S8, gifts: yinghuo, skills: SK8, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c8_qingfeng', test: { lv: 36, gear: T8 }, ch: 8, file: 'ch8', name: '洛青鋒 (8-6)', troop: 't_c8_qingfeng', opts: 'qfBattleOpts()',
      party: TRIO, lv: 29, shops: S8, gifts: yinghuo, skills: SK8, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()'), focus: ['c8_tide_wick'] },

    // ============================================================== ch9 王船南行
    { id: 'c9_beach', test: { lv: 30, gearMaxCh: 8, inv: K9 }, ch: 9, file: 'ch9', name: '旗後 night beach ×2', troop: 't_c9_beach_2', opts: '{}', before: [{ troop: 't_c9_beach_1' }],
      party: TRIO, lv: 30, shops: S9a, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c9_greed', test: { lv: 30, gearMaxCh: 8, inv: K9 }, ch: 9, file: 'ch9', name: '大肚貪鬼 (半屏山)', troop: 't_c9_greed_boss', opts: '{ intro: greedIntro([]) }',
      party: TRIO, lv: 31, shops: S9a, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c9_plague', test: { lv: 31, gearMaxCh: 8, inv: K9 }, ch: 9, file: 'ch9', name: '瘟鬼頭 (東港 船台)', troop: 't_c9_plague_boss', opts: '{ intro: plagueIntro() }',
      party: TRIO, lv: 32, shops: S9b, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c9_fallwind', test: { lv: 35, gearMaxCh: 8, inv: K9 }, ch: 9, file: 'ch9', name: '落山風靈 (龍磐)', troop: 't_c9_fallwind', opts: '{ intro: fallwindIntro() }',
      party: TRIO, lv: 33, shops: S9, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c9_moray', test: { lv: 34, gearMaxCh: 8, inv: K9 }, ch: 9, file: 'ch9', name: '潮病鰻王 (鵝鑾鼻)', troop: 't_c9_moray_king', opts: '{ intro: morayIntro() }',
      party: TRIO, lv: 34, shops: S9, gifts: yinghuo, skills: SK9, flags: AWAKE, vars: { flame: 60 }, pre: (G) => G.__X.ch7.ev('C7.applyFlame()'), tactics: tMoray },

    // ============================================================== ch10 後山巡境
    { id: 'c10_kaswal', test: { lv: 40, gear: T10, inv: K10 }, ch: 10, file: 'ch10', name: 'Kaswal reef fight', troop: 't_c10_reef_kaswal', opts: "{ mode: 'normal' }",
      party: TRIO, lv: 35, shops: S10a, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c10_serpent', test: { lv: 40, gear: T10, inv: K10 }, ch: 10, file: 'ch10', name: '潮病海蛇 (蘭嶼)', troop: 'boss_tide_serpent', opts: '{ intro: H.serpentRules }',
      party: TRIO, lv: 35, shops: S10a, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()'), tactics: tSerpent },
    { id: 'c10_coast', test: { lv: 40, gear: T10, inv: K10 }, ch: 10, file: 'ch10', name: '大潮怨 (海祭, after two fights)', troop: 't_c10_coast_boss', opts: '{}',
      before: [{ troop: 't_c10_coast_fix_a' }, { troop: 't_c10_coast_fix_b' }],
      party: TRIO, lv: 36, shops: S10b, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()') },
    { id: 'c10_colossus', test: { lv: 44, gear: T10, inv: K10 }, ch: 10, file: 'ch10', name: '太魯閣石巨靈', troop: 'boss_colossus', opts: '{ intro: H.colossusRules }',
      party: TRIO, lv: 37, shops: S10c, gifts: yinghuo, skills: SK9, flags: AWAKE, pre: (G) => G.__X.ch7.ev('C7.applyFlame()'), valueMod: vColossus },
    { id: 'c10_guhun', test: { lv: 40, gear: T10, inv: K10 }, ch: 10, file: 'ch10', name: '孤魂眾 (頭城 普渡)', troop: 't_c10_guhun', opts: '{ intro: H.guhunRules }',
      party: TRIO, lv: 38, shops: S10, gifts: yinghuo, skills: { [XH]: SK9[XH], [HY]: SK9[HY], [YG]: SK9[YG].concat(['yg_pudu']) }, flags: AWAKE,
      inv: { c10_pudu_offering: 6 }, pre: (G) => G.__X.ch7.ev('C7.applyFlame()'), tactics: tGuhun },
  ];
}

module.exports = { FIGHTS, SHOPS };

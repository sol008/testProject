// 彼岸燈 — playable characters (G.Data.chars)
//
// Read by js/core/state.js (G.Party):
//   stats at level L = base + growth * (L - 1), rounded, plus equipment `stats`.
//   learn: [{lv, skill}] are learned automatically on reaching lv (all entries with lv <= level are
//          known when the character joins). Entries with `story:true` are NOT auto-learned: the story
//          script grants them with G.Party.learnSkill(charId, skillId) when `flag` is set
//          (`ch` = chapter it happens in; for writers / tools/sim_battle.js only).
//   ultimate: skill used when the 劍意 gauge reaches 100 (costs the whole gauge, no MP).
//          A learned skill with `ultimate:true` (e.g. 紅纓's 洛家劍譜) is ALSO offered at 100 gauge.
//   equip: starting equipment item ids (js/data/items.js).
//   joinLv: suggested level for G.Party.join(id, lv) — scripts should pass max(joinLv, party average).
//
// Availability (STORY_BIBLE / WRITERS_GUIDE): 星河 & 白芷 from ch1 (星河 alone in the 序章 dream and the
// 舊金礦坑), 紅纓 joins after the ch2 duel (~L5), 雲歸 + 糰子 after the ch3 鬼面 raid (~L10).
// 白芷 is captured at the end of ch6 and rejoins at the top of 彼岸燈塔 (ch11) for 夜玄 / 黑潮・無相 —
// rejoin her at the party's level.
'use strict';
G.Data = G.Data || {};

G.Data.chars = {
  xinghe: {
    name: '沈星河', title: '燈籠舖學徒', elem: 'fire', weapon: 'sword',
    sprite: 'xinghe', portrait: 'xinghe', joinLv: 1,
    desc: '九份陳記燈籠舖的學徒。嘴上逞強、遇事先慌，關鍵時刻卻比誰都勇敢。劍法均衡，攻守皆宜。',
    base: { hp: 112, mp: 20, atk: 15, def: 10, mag: 11, spd: 12, luk: 8 },
    growth: { hp: 17, mp: 2.5, atk: 2.4, def: 1.6, mag: 1.9, spd: 0.85, luk: 0.5 },
    learn: [
      { lv: 1, skill: 'xh_yinghuo' },      // 螢火斬
      { lv: 3, skill: 'xh_hudeng' },       // 護燈訣
      { lv: 6, skill: 'xh_liuying' },      // 流螢亂舞
      { lv: 9, skill: 'xh_liaoyuan' },     // 燎原
      { lv: 12, skill: 'xh_jianqi' },      // 劍氣縱橫
      { lv: 15, skill: 'xh_xingzhui' },    // 星墜劍
      { lv: 18, skill: 'xh_dengguo' },     // 九份燈火
      { lv: 22, skill: 'xh_fentian' },     // 焚天劍氣
      { lv: 26, skill: 'xh_zhaohun' },     // 照魂
      { lv: 31, skill: 'xh_daoxuan' },     // 星河倒懸
      { lv: 36, skill: 'xh_longyin' },     // 赤焰龍吟
      { lv: 42, skill: 'xh_qianxing' },    // 劍落千星
      // 心火 — awakened in 靈境 (ch7)
      { lv: 0, skill: 'xh_xinhuo_ran', story: true, ch: 7, flag: 'ch7_xinhuo' },   // 心火・燃燈
      { lv: 0, skill: 'xh_xinhuo_zhao', story: true, ch: 7, flag: 'ch7_xinhuo' },  // 心火・照夜
      { lv: 0, skill: 'xh_xinhuo_bumie', story: true, ch: 7, flag: 'ch7_xinhuo' }, // 心火・不滅
    ],
    ultimate: 'u_xinghe',
    equip: { weapon: 'sw_bamboo', armor: 'ar_cloth', head: null, feet: 'ft_straw', acc: 'ac_redstring' },
  },

  baizhi: {
    name: '白芷', title: '海上來的少女', elem: 'water', weapon: 'flute',
    sprite: 'baizhi', portrait: 'baizhi', joinLv: 1,
    desc: '乘著水燈頭從海上漂來的少女。只記得一首「渡魂謠」，和一塊刻著名字的玉牌。以笛聲療傷、安魂。',
    base: { hp: 94, mp: 30, atk: 9, def: 8, mag: 15, spd: 13, luk: 10 },
    growth: { hp: 13.5, mp: 3.4, atk: 1.4, def: 1.4, mag: 2.6, spd: 0.9, luk: 0.6 },
    learn: [
      { lv: 1, skill: 'bz_qingxin' },      // 清心曲
      { lv: 1, skill: 'bz_shuiyue' },      // 水月
      { lv: 3, skill: 'bz_duhun' },        // 渡魂謠
      { lv: 5, skill: 'bz_jiee' },         // 解厄
      { lv: 8, skill: 'bz_chaosheng' },    // 潮生曲
      { lv: 11, skill: 'bz_huihun' },      // 回魂
      { lv: 14, skill: 'bz_yuewu' },       // 月霧護身曲
      { lv: 17, skill: 'bz_haichao' },     // 海潮
      { lv: 20, skill: 'bz_liufeng' },     // 流風曲
      { lv: 23, skill: 'bz_ganlin' },      // 甘霖
      { lv: 27, skill: 'bz_yingyue' },     // 映月
      { lv: 32, skill: 'bz_zhenhun' },     // 鎮魂曲
      { lv: 37, skill: 'bz_denghai' },     // 燈海
      { lv: 42, skill: 'bz_guichao' },     // 歸潮
    ],
    ultimate: 'u_baizhi',
    equip: { weapon: 'fl_jade', armor: 'ar_seafoam', head: 'hd_lanternpin', feet: 'ft_cloth', acc: null },
  },

  hongying: {
    name: '洛紅纓', title: '鹿港洛家槍', elem: 'metal', weapon: 'spear',
    sprite: 'hongying', portrait: 'hongying', joinLv: 5,
    desc: '鹿港洛家的繼承人，追查滅門仇人「鬼面」。嘴硬心軟，偷偷喜歡可愛的東西，廚藝是場災難。槍快力沉，不擅術法。',
    base: { hp: 120, mp: 12, atk: 18, def: 10, mag: 6, spd: 16, luk: 10 },
    growth: { hp: 18.5, mp: 1.7, atk: 2.9, def: 1.7, mag: 1.0, spd: 1.1, luk: 0.6 },
    learn: [
      { lv: 1, skill: 'hy_dian' },         // 紅纓點
      { lv: 1, skill: 'hy_hengsao' },      // 橫掃千軍
      { lv: 5, skill: 'hy_xushi' },        // 蓄勢
      { lv: 8, skill: 'hy_lianhuan' },     // 連環槍
      { lv: 11, skill: 'hy_pojia' },       // 破甲
      { lv: 14, skill: 'hy_lihua' },       // 梨花槍
      { lv: 18, skill: 'hy_huima' },       // 回馬槍
      { lv: 22, skill: 'hy_nuyan' },       // 怒焰紅纓
      { lv: 26, skill: 'hy_lukang' },      // 鹿港怒潮
      { lv: 31, skill: 'hy_tieqi' },       // 鐵騎破陣
      { lv: 36, skill: 'hy_luanhong' },    // 亂紅飛渡
      { lv: 42, skill: 'hy_qianjun' },     // 千軍辟易
      // 洛家劍譜 — 青鋒's last gift at 安平 觀潮台 (end of ch8). A second ultimate.
      { lv: 0, skill: 'hy_luojia', story: true, ch: 8, flag: 'ch8_jianpu' },
    ],
    ultimate: 'u_hongying',
    equip: { weapon: 'sp_hongying', armor: 'ar_crimson', head: 'hd_ribbon', feet: 'ft_boots', acc: 'ac_armguard' },
  },

  yungui: {
    name: '雲歸', title: '太虛觀道士', elem: 'wood', weapon: 'talisman',
    sprite: 'yungui', portrait: 'yungui', joinLv: 10,
    desc: '觀音山太虛觀的道士，愛喝米酒、愛讀禁書、更愛研究蘑菇。身邊總跟著一隻胖石虎「糰子」。符籙五行俱全，專攻弱點。',
    base: { hp: 96, mp: 28, atk: 10, def: 8, mag: 17, spd: 12, luk: 12 },
    growth: { hp: 14, mp: 3.6, atk: 1.6, def: 1.4, mag: 2.9, spd: 0.9, luk: 0.7 },
    learn: [
      { lv: 1, skill: 'yg_leifu' },        // 雷符 (木)
      { lv: 1, skill: 'yg_huofu' },        // 火符 (火)
      { lv: 1, skill: 'yg_shuifu' },       // 水符 (水)
      { lv: 1, skill: 'yg_jinfu' },        // 金符 (金)
      { lv: 4, skill: 'yg_tufu' },         // 土符 (土)
      { lv: 7, skill: 'yg_dingshen' },     // 定身符
      { lv: 10, skill: 'yg_tuanzi' },      // 召喚糰子
      { lv: 12, skill: 'yg_mihun' },       // 迷魂扇
      { lv: 14, skill: 'yg_wulei' },       // 五雷正法
      { lv: 16, skill: 'yg_huichun' },     // 回春符
      { lv: 19, skill: 'yg_fengyin' },     // 封印符
      { lv: 22, skill: 'yg_duxun' },       // 毒蕈粉
      { lv: 25, skill: 'yg_wuxing' },      // 五行大陣
      { lv: 29, skill: 'yg_tiangang' },    // 天罡破法
      { lv: 33, skill: 'yg_sanmei' },      // 三昧真火符
      { lv: 38, skill: 'yg_jiutian' },     // 九天雷罡
      { lv: 43, skill: 'yg_wanfa' },       // 萬法歸宗
      // 太虛神雷 — 清虛真人's last teaching at 燈母祠 (ch7)
      { lv: 0, skill: 'yg_taixu', story: true, ch: 7, flag: 'ch7_taixu' },
    ],
    ultimate: 'u_yungui',
    equip: { weapon: 'fn_taixu', armor: 'ar_taoist', head: 'hd_woodcrown', feet: 'ft_cloud', acc: 'ac_gourd' },
  },
};

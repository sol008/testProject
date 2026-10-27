// 《彼岸燈》 第六章　府城長明 — chapter 6. Screenplay: docs/story/ch6_tainan.md
//
// Maps:   yanshui_road (海線官道) · yanshui (鹽水・月津) · yanshui_temple (武廟) · yanshui_inn (客棧)
//         fucheng (府城) · fc_chikan (赤崁樓) · fc_mazu (大天后宮) · fc_confucius (孔廟) · fc_qiniang (七娘媽廟)
//         fc_zheng (鄭家) · fc_inn (府城客棧) · fc_shop (武館兵器鋪) · fc_herb (藥鋪)
//         linto (林投林) · palace_dock (S1 水門倉) · palace_hall (S2 迴廊) · palace_study (S3 經閣)
//         palace_lanterns (萬燈閣) · north_dunes (北郊沙丘) · sugarcane_night (甘蔗田・土地公廟, 夜)
// Flow:   G.Story.ch6 → 3-1 官道 → 鹽水 武廟 3-2 → 蜂炮夜 3-3 (三波 + 疫聚) → 客棧 3-4 → 府城 3-5 墨鴉
//         → 七娘媽廟 3-6 做十六歲 → 肉粽伯 3-7 → (月老 3-8 / 赤崁樓 3-9 燈謎 / 孔廟) → 林投林 3-10 / 3-11 林投姐
//         → 水門 3-12 → 潛行 S1–S3 → 經閣 3-13 → 萬燈閣 3-14 夜玄 + 冥燈護法 → 3-15 強制敗北, 白芷離隊
//         → 3-16 北郊沙丘 → 3-17 甘蔗田 → G.Story.next(S, 7)
// Flags:  ch6_start ch6_yanshui ch6_night ch6_beehive ch6_fucheng ch6_moya ch6_sixteen ch6_rouzong ch6_yuelao
//         ch6_chikan ch6_riddle_done ch6_linto_in ch6_linto_done ch6_infiltrate ch6_qingxu_letter ch6_yexuan_met
//         ch6_netherlamp ch6_captured ch6_ship lyric_ch6 ch6_done xinghe_gutter · side: ch6_ayi_met
//         ch6_ayi_mother ch6_yanshui_done ch6_listen3 mush_ch6 · stealth: ch6_s3_open ch6_moya_fled
//         vars: ch6_time (0 午 / 1 黃昏 / 2 夜), ch6_riddle_n, ch6_listen, ch6_linto_wrong, ch6_s1/2/3_spotted, tuanzi_mush
// Quests: q_ch6_main, q_yanshui_mother (心燈 lantern_yanshui), q_tuanzi_mush (cross-chapter) · 心燈 lantern_linto
// Data:   items c6_* · enemies c6_* · troops t_c6_* · skills c6_*
// Battle rules (via S.battle hooks): 蜂炮 volleys (鹽水), 林投姐「怨」+「傾聽」, 冥燈護法 soul-jar nodes + 燈印,
//         夜玄 scripted loss, 墨鴉 rematch. Stealth (palace S1–S3): map onUpdate — light/dark view, detection
//         meters, noise (running / creaky boards / fireworks mask), jars to hide in, 傀儡哨 with bells, 糰子 (Q key).
'use strict';
(() => {
  const U = G.U;
  const T = G.TILE;
  const auto = () => !!(G.Debug && G.Debug.autoplay);
  const dur = (sec) => (auto() ? Math.min(sec, 0.05) : sec);
  const MS = () => G.mapScene;
  const V = () => G.state.vars;
  const F = () => G.state.flags;

  // =================================================================================================== grid helper
  // Builds tile rows in code: g = grid(w, h, '.'); g.rect(x, y, w, h, '#'); g.rows() → string[]
  function grid(w, h, fill) {
    const r = [];
    for (let y = 0; y < h; y++) r.push(new Array(w).fill(fill));
    const g = {
      w, h, r,
      set(x, y, ch) { if (x >= 0 && y >= 0 && x < w && y < h) r[y][x] = ch; return g; },
      get(x, y) { return x >= 0 && y >= 0 && x < w && y < h ? r[y][x] : null; },
      rect(x, y, ww, hh, ch) { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) g.set(xx, yy, ch); return g; },
      frame(ch, top = 2) { g.rect(0, 0, w, top, ch); g.rect(0, 0, 1, h, ch); g.rect(w - 1, 0, 1, h, ch); g.rect(0, h - 1, w, 1, ch); return g; },
      rows() { return r.map((row) => row.join('')); },
    };
    return g;
  }
  G.Mapx.c6grid = grid;

  // =================================================================================================== items
  const I = G.Data.items;
  Object.assign(I, {
    c6_bamboo_hat: { name: '鹽水斗笠', desc: '鹽水人看蜂炮戴的大斗笠，竹篾編得密密實實。', type: 'head', price: 380, ch: 6, icon: 'hat', stats: { def: 11, spd: 1 } },
    c6_padded_coat: { name: '厚棉襖', desc: '蜂炮夜要穿的厚棉襖，火星打在身上也燒不穿。火屬性傷害減輕。', type: 'armor', price: 800, ch: 6, icon: 'armor', stats: { def: 24 }, resist: ['fire'] },
    c6_wet_towel: { name: '濕毛巾', desc: '包頭包脖子用的濕毛巾。蓋在傷口上，解除中毒並回復氣血 150。', type: 'use', price: 25, ch: 6, icon: 'herb', use: { target: 'ally', heal: 150, cure: ['poison'] } },
    c6_wumiao_charm: { name: '武廟平安符', desc: '鹽水武廟的平安符，背面蓋著「忠義」的印。戴著它，心裡就不怕。', type: 'acc', price: 0, ch: 6, icon: 'talisman', stats: { def: 10, hp: 40 }, immune: ['poison'] },
    c6_qiniang_rouge: { name: '七娘媽的胭脂', desc: '做十六歲供在七娘媽前的胭脂。戰鬥開始時持續回復。', type: 'acc', price: 0, ch: 6, icon: 'charm', stats: { mag: 10, luk: 10 }, special: ['autoRegen'] },
    c6_sesame_chicken: { name: '麻油雞', desc: '做十六歲的供品，鄭嫂燉的麻油雞。氣血全滿並提升攻擊。', type: 'use', price: 0, ch: 6, icon: 'food', use: { target: 'ally', heal: 9999, buffs: [{ stat: 'atk', amt: 0.3, turns: 2 }] } },
    c6_zheng_zongzi: { name: '鄭家肉粽', desc: '肉粽伯用竹葉繩綁好的兩粒肉粽。「若遇到伊，替我阿爸，送伊兩粒。」', type: 'key', price: 0, ch: 6, icon: 'food' },
    c6_zongzi: { name: '府城肉粽', desc: '竹葉包，花生、香菇、鹹蛋黃。回復氣血 450。', type: 'use', price: 140, ch: 6, icon: 'food', use: { target: 'ally', heal: 450 } },
    c6_salty_cake: { name: '鹹粿', desc: '在來米漿蒸成的鹹粿，煎得兩面金黃。回復氣血 280。', type: 'use', price: 80, ch: 6, icon: 'food', use: { target: 'ally', heal: 280 } },
    c6_yuanxiao: { name: '元宵', desc: '「湯圓是搓的，元宵是滾的！」全體回復兩成氣血。', type: 'use', price: 160, ch: 6, icon: 'food', use: { target: 'allies', healPct: 0.2 } },
    c6_red_thread: { name: '月老紅線', desc: '大天后宮月下老人前的一小段紅線。綁在手上，月老會記得。', type: 'acc', price: 0, ch: 6, icon: 'charm', who: ['xinghe'], stats: { luk: 20, spd: 3 } },
    c6_riddle_fan: { name: '燈謎紙扇', desc: '文昌閣前猜燈謎的獎品。扇面寫滿了謎底。', type: 'weapon', price: 0, ch: 6, icon: 'fan', who: ['yungui'], stats: { atk: 8, mag: 56, mp: 15 } },
    c6_wenchang_brush: { name: '文昌筆', desc: '文昌閣供過的一支筆。「十張口說的話，不如一顆心。」', type: 'acc', price: 0, ch: 6, icon: 'scroll', stats: { mag: 18, mp: 40 } },
    c6_linto_comb: { name: '林投姐的木梳', desc: '一把被海風吹得發白的木梳。她說，她終於可以把頭髮梳好了。', type: 'acc', price: 0, ch: 6, icon: 'hairpin', stats: { mag: 12, def: 4 }, immune: ['sleep'] },
    c6_zhaoniang_pin: { name: '昭娘的銀簪', desc: '「三十年，第一次有人聽我講完。」', type: 'head', price: 0, ch: 6, icon: 'hairpin', who: ['baizhi', 'hongying'], stats: { def: 12, mag: 8, spd: 5 } },
    c6_qingxu_letter: { name: '清虛真人的信', desc: '封面寫著「給不聽話的雲歸」。清虛真人往日月潭霧底下的燈母祠去了。', type: 'key', price: 0, ch: 6, icon: 'letter' },
    c6_tide_sword: { name: '海潮劍', desc: '林投林無名墳旁找到的劍，劍身上有潮水的紋。水屬性。', type: 'weapon', price: 0, ch: 6, icon: 'sword', who: ['xinghe'], elem: 'water', stats: { atk: 52 } },
    c6_revive_incense: { name: '回魂香', desc: '一整束的回魂香，煙會找到迷路的魂。復活一人並回復六成氣血。', type: 'use', price: 420, ch: 6, icon: 'incense', use: { target: 'deadAlly', revive: 0.6 } },
    c6_qingxu_gourd: { name: '清虛的舊葫蘆', desc: '清虛真人的舊葫蘆，裡面還剩一口酒。每回合回復真氣。', type: 'acc', price: 0, ch: 6, icon: 'wine', who: ['yungui'], stats: { mp: 60, mag: 4 }, special: ['mpRegen'] },
    c6_netherlamp_ward: { name: '冥燈護符', desc: '長明宮衛貼身帶的護符，冷冷的。戴著它，長明縛封不住你。', type: 'acc', price: 0, ch: 6, icon: 'talisman', stats: { def: 6, mag: 6 }, immune: ['seal'] },
    c6_palace_mail: { name: '長明宮衛甲', desc: '白底藍邊的宮衛甲。穿上它，在長明宮裡走路都比較理直氣壯。', type: 'armor', price: 0, ch: 6, icon: 'armor', stats: { def: 30 } },
    c6_nether_wick: { name: '冥燈殘芯', desc: '冥燈護法燒剩的燈芯，已經不冷了。心神不會被封住、也不會睡著。', type: 'acc', price: 0, ch: 6, icon: 'lantern', stats: { mag: 8 }, immune: ['seal', 'sleep'] },
    c6_crow_feather: { name: '黑鴉羽', desc: '墨鴉掉的羽毛，很新。他好像很在意。', type: 'acc', price: 0, ch: 6, icon: 'charm', stats: { spd: 12 } },
    c6_mugwort: { name: '艾草香囊', desc: '大疫塚旁拾到的艾草香囊。瘟氣不近身，免疫中毒。', type: 'acc', price: 0, ch: 6, icon: 'bag', stats: { def: 5, hp: 30 }, immune: ['poison'] },
    c6_chikan_amulet: { name: '赤崁紅磚護符', desc: '一小塊紅磚雕成的護符，磚是荷蘭時代的。火屬性傷害減輕。', type: 'acc', price: 0, ch: 6, icon: 'jade', stats: { def: 15 }, resist: ['fire'] },
    c6_inkstone: { name: '秀才的硯台', desc: '孔廟泮池橋下撿到的硯台。不是至聖先師的，是陳秀才掉的。可以賣錢。', type: 'material', price: 800, ch: 6, icon: 'gem' },
    c6_jinchuang2: { name: '大金創藥', desc: '府城藥鋪的大罐金創藥。回復氣血 300。', type: 'use', price: 90, ch: 6, icon: 'potion', use: { target: 'ally', heal: 300 } },
    c6_jinchuang3: { name: '特級金創藥', desc: '藥鋪老闆壓箱底的方子。回復氣血 900。', type: 'use', price: 280, ch: 6, icon: 'potion', use: { target: 'ally', heal: 900 } },
    c6_ningshen: { name: '凝神丹', desc: '寧心凝神的丹藥。回復真氣 60。', type: 'use', price: 90, ch: 6, icon: 'pill', use: { target: 'ally', mp: 60 } },
    c6_ningshen2: { name: '大凝神丹', desc: '上等的凝神丹。回復真氣 150。', type: 'use', price: 240, ch: 6, icon: 'pill', use: { target: 'ally', mp: 150 } },
    c6_herb_tea: { name: '青草茶', desc: '府城青草巷的青草茶，退火。解除中毒並回復氣血 100。', type: 'use', price: 30, ch: 6, icon: 'drink', use: { target: 'ally', heal: 100, cure: ['poison'] } },
    c6_brocade_m: { name: '錦袍', desc: '府城綢緞莊的錦袍，穿起來像個秀才。', type: 'armor', price: 820, ch: 6, icon: 'armor', who: ['xinghe', 'yungui'], stats: { def: 27, mag: 3 } },
    c6_brocade_f: { name: '錦褙子', desc: '繡著水紋的錦褙子，府城姑娘元宵夜穿的。', type: 'armor', price: 860, ch: 6, icon: 'armor', who: ['baizhi', 'hongying'], stats: { def: 25, mag: 8 } },
    c6_official_boots: { name: '官靴', desc: '黑緞面、白厚底的官靴。走起路來很有架勢。', type: 'feet', price: 440, ch: 6, icon: 'shoes', stats: { def: 9, spd: 5 } },
  });

  // =================================================================================================== skills
  const SK = G.Data.skills;
  Object.assign(SK, {
    // 疫聚
    c6_pm_cough: { name: '咳疫', desc: '上百張臉一起咳嗽。', mp: 0, type: 'mag', elem: 'earth', target: 'enemies', power: 0.7, status: { id: 'poison', chance: 0.4, turns: 3 }, fx: 'poison', sfx: 'poison' },
    c6_pm_fever: { name: '高燒', desc: '它把病燒到你身上。', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.4, fx: 'fire', sfx: 'fire' },
    c6_pm_drag: { name: '拖入', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'sleep', chance: 0.6, turns: 2 }, fx: 'sleep', sfx: 'ghost' },
    c6_pm_gather: { name: '聚眾', desc: '巷子裡又爬出了咳嗽的人影。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['plague_ghost'], fx: 'summon', sfx: 'ghost' },
    // 林投姐 / 林投刺精
    c6_lj_thorns: { name: '林投刺', desc: '', mp: 0, type: 'phys', elem: 'wood', target: 'enemies', power: 0.8, fx: 'wood', sfx: 'slash2' },
    c6_lj_hair: { name: '纏髮', desc: '濕冷的長髮纏住了喉嚨。', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'seal', chance: 0.7, turns: 2 }, fx: 'seal', sfx: 'ghost' },
    c6_lj_tears: { name: '黑淚', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.4, buffs: [{ stat: 'mag', amt: -0.3, turns: 3 }], fx: 'water', sfx: 'water' },
    c6_lj_call: { name: '呼喚林投', desc: '沙地裡的林投根動了起來。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['c6_pandanus'], fx: 'summon', sfx: 'earth' },
    c6_lj_lament: { name: '泣訴', desc: '林投姐不再攻擊，只是一直說、一直說……', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'ghost' },
    c6_pd_thorn: { name: '刺葉', desc: '', mp: 0, type: 'phys', elem: 'wood', target: 'enemy', power: 1.1, fx: 'slash', sfx: 'slash' },
    // 冥燈護法 / 魂罐
    c6_ng_chain: { name: '鎖魂鏈', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 1.5, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'seal', sfx: 'metal' },
    c6_ng_light: { name: '冷燈照', desc: '冷藍的光照在身上，像冬天的海水。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.9, fx: 'ghost', sfx: 'ghost' },
    c6_ng_bind: { name: '長明縛', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'seal', chance: 0.85, turns: 3 }, fx: 'seal', sfx: 'bell' },
    c6_ng_recast: { name: '重鑄', desc: '護法把自己的燈芯掰下一段，重新封住了空座。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'dark' },
    c6_ng_mark: { name: '燈印', desc: '冷燈的印記烙在身上——兩回合後會燒起來。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'debuff', sfx: 'dark' },
    c6_jar_hum: { name: '嗡鳴', desc: '罐子裡的光輕輕晃了一下。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'ghost' },
    // 夜玄（強制敗北）
    c6_yx_plea: { name: '請住手。', desc: '夜玄沒有出手，只是看著你們。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'bell' },
    c6_yx_bind: { name: '長明・縛', desc: '', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'seal', sfx: 'bell' },
    c6_yx_still: { name: '歸寂', desc: '', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'dark' },
    c6_yx_draw: { name: '抽燈', desc: '', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'lantern', sfx: 'dark' },
    // 墨鴉（再戰）
    c6_my_feathers: { name: '鴉羽亂舞', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemies', power: 0.7, hits: 3, fx: 'dark', sfx: 'slash2' },
    c6_my_wings: { name: '黑翼遮天', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'debuff', sfx: 'wind' },
    c6_my_peck: { name: '啄眼', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'sleep', chance: 0.6, turns: 2 }, fx: 'sleep', sfx: 'stab' },
    c6_my_pride: { name: '升官的氣勢', desc: '「本護法可是升了官的！」', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'buff' },
  });

  // =================================================================================================== enemies & troops
  const E = G.Data.enemies, TR = G.Data.troops;
  // same stat curve as js/data/enemies.js def()
  function defEnemy(id, d) {
    const c = G.Data.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: Math.max(0, Math.round(c.exp * expM)), gold: Math.max(0, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: d.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })),
      desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt']) if (d[k] != null) e[k] = d[k];
    if (d.phases) e.phases = d.phases.map((p) => Object.assign({}, p, p.skills ? { skills: p.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })) } : {}));
    E[id] = e;
  }
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  defEnemy('c6_plague_mass', {
    name: '疫聚', art: 'plague_ghost', variant: 2, scale: 1.8, lv: 21, elem: 'earth', weak: ['fire'], boss: true, immune: BOSS_IMM,
    m: { hp: 9.5, atk: 1.85, mag: 2.0, def: 1.1, spd: 0.95, exp: 5.5, gold: 5 },
    skills: [['c6_pm_cough', 3], ['c6_pm_fever', 2], ['c6_pm_drag', 2], ['c6_pm_gather', 1, 'hp<50']],
    phases: [{ at: 0.5, heal: 0.1, text: '灰霧裡又浮出了幾張臉——它在把整條街的哭聲吸回去。' }],
    drops: [['fengpao', 1]],
    desc: '八年前那場瘟死去的人，被長明燈聚成的一團灰霧。那不是一隻鬼，是一整年的哭。',
  });
  defEnemy('c6_pandanus', {
    name: '林投刺精', art: 'bamboo_spirit', variant: 1, lv: 22, elem: 'wood', weak: ['metal'], m: { hp: 0.8, atk: 1.0, def: 1.1, spd: 0.9, gold: 0 },
    skills: [['c6_pd_thorn', 3], ['e_linto_thorns', 1]], drops: [['c6_herb_tea', 0.2]],
    desc: '林投林裡長了刺的怨氣。葉緣像鋸子，碰一下就會流血。',
  });
  defEnemy('c6_linto', {
    name: '林投姐', art: 'linto_jie', scale: 1.15, lv: 22, elem: 'water', weak: ['earth'], boss: true, immune: BOSS_IMM.concat(['poison']),
    m: { hp: 12.5, atk: 2.0, mag: 2.3, def: 1.05, spd: 1.3, exp: 7, gold: 0 },
    skills: [['c6_lj_thorns', 3], ['c6_lj_hair', 2], ['c6_lj_tears', 2], ['c6_lj_call', 1]],
    desc: '府城最有名的女鬼。她要的不是報仇——是有人聽她把話說完。',
  });
  defEnemy('c6_netherlamp', {
    name: '冥燈護法', art: 'nether_guardian', lv: 24, elem: 'water', weak: ['earth'], resist: ['fire'], boss: true, immune: BOSS_IMM,
    m: { hp: 12.5, atk: 2.05, mag: 2.1, def: 1.15, spd: 1.3, exp: 7, gold: 8 },
    skills: [['c6_ng_chain', 3], ['c6_ng_light', 3], ['c6_ng_bind', 2]],
    phases: [
      { at: 0.5, phase: 2, lines: [['baizhi:sad', '……它也在哭。它說：「不要打了，我也是被綁著的。」']], msg: '燈籠頭裂開了一道縫，藍火往外噴！',
        skills: [['c6_ng_chain', 3], ['c6_ng_light', 3], ['c6_ng_bind', 1]] },
      { at: 0.2, phase: 3, text: '萬燈齊鳴——萬燈閣所有的罐子一起嗡嗡作響。', msg: '萬燈齊鳴！', buffs: [{ stat: 'spd', amt: 0.3, turns: 99 }],
        skills: [['c6_ng_chain', 3], ['c6_ng_light', 3], ['c6_ng_bind', 1]] },
    ],
    drops: [['c6_nether_wick', 1]],
    desc: '由長明燈柱拼成的鎧甲武者。沒有臉的燈籠頭裡，燒著一團疲憊的藍火。',
  });
  for (const [k, nm] of [['n', '魂罐・北'], ['e', '魂罐・東'], ['s', '魂罐・南'], ['w', '魂罐・西']]) {
    defEnemy('c6_soul_jar_' + k, {
      name: nm, art: 'ghost_lantern', variant: 2, scale: 0.85, lv: 24, elem: null, immune: ['sleep', 'stun', 'trance', 'poison', 'seal'],
      m: { hp: 0.6, atk: 0.1, mag: 0.1, def: 2.4, spd: 0.55, exp: 0.4, gold: 0 },
      skills: [['c6_jar_hum', 1]],
      desc: '封著一個魂的罐子。罐壁上貼著紅紙名條，字已經褪色了。',
    });
  }
  defEnemy('c6_yexuan', {
    name: '夜玄', sprite: 'yexuan', lv: 44, elem: 'water', boss: true, immune: ['sleep', 'stun', 'trance', 'poison', 'seal', 'atkDown', 'defDown', 'magDown', 'spdDown'],
    m: { hp: 1, atk: 2.5, mag: 2.5, def: 1, spd: 0.9, exp: 0, gold: 0 },
    skills: [['c6_yx_plea', 1]],
    desc: '長明宮之主。素黑長袍，鬢髮微霜。眼睛裡有一種很深、很靜的疲倦。',
  });
  E.c6_yexuan.hp = 999999; E.c6_yexuan.def = 999;
  defEnemy('c6_moya2', {
    name: '墨鴉', sprite: 'moya', lv: 23, elem: 'water', weak: ['earth'], boss: true, immune: BOSS_IMM,
    m: { hp: 7.0, atk: 1.8, mag: 1.9, def: 1.0, spd: 1.55, exp: 5, gold: 7 },
    skills: [['c6_my_feathers', 3], ['c6_my_wings', 2], ['c6_my_peck', 2], ['c6_my_pride', 1, 'hp<50']],
    phases: [{ at: 0.5, lines: [['moya:angry', '我的羽毛！我新長的羽毛！']] }],
    drops: [['c6_crow_feather', 1]],
    desc: '長明宮的「護法」。他堅持那是升官。頭頂少了一撮羽毛。',
  });

  const troop = (id, enemies, bg, bgm, extra) => { TR[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle2' }, extra || {}); };
  troop('t_c6_yanshui_1', ['plague_ghost', 'plague_ghost', 'plague_ghost'], 'procession', 'battle2', { flee: false });
  troop('t_c6_yanshui_2', ['plague_ghost', 'plague_ghost', 'lantern_golem'], 'procession', 'battle2', { flee: false });
  troop('t_c6_yanshui_3', ['plague_ghost', 'plague_ghost', 'plague_ghost', 'plague_ghost'], 'procession', 'battle2', { flee: false });
  troop('t_c6_plague_mass', ['c6_plague_mass', 'plague_ghost', 'plague_ghost'], 'procession', 'boss', { boss: true, flee: false });
  troop('t_c6_linto_a', ['c6_pandanus', 'c6_pandanus'], 'linto', 'battle2');
  troop('t_c6_linto_b', ['c6_pandanus', 'water_ghost_v2', 'water_ghost_v2'], 'linto', 'battle2');
  troop('t_c6_linto_c', ['hanged_ghost_v2', 'hanged_ghost_v2', 'c6_pandanus'], 'linto', 'battle2');
  troop('t_c6_linto_boss', ['c6_linto', 'c6_pandanus', 'c6_pandanus'], 'linto', 'sad', { boss: true, flee: false });
  troop('t_c6_guard_a', ['temple_guard', 'temple_guard', 'marionette_v1'], 'palace', 'battle2');
  troop('t_c6_guard_b', ['temple_guard', 'temple_guard', 'lantern_golem'], 'palace', 'battle2');
  troop('t_c6_moya', ['c6_moya2', 'temple_guard'], 'palace', 'boss', { boss: true, flee: false });
  troop('t_c6_netherlamp', ['c6_netherlamp', 'c6_soul_jar_n', 'c6_soul_jar_e', 'c6_soul_jar_s', 'c6_soul_jar_w'], 'palace', 'boss', { boss: true, flee: false });
  troop('t_c6_yexuan_loss', ['c6_yexuan'], 'palace', 'villain', { boss: true, flee: false });

  // =================================================================================================== quests
  const Q = G.Data.quests;
  Q.q_ch6_main = {
    name: '府城長明', main: true,
    desc: '南下鹽水與府城，尋找雲歸的師父清虛真人，查清長明宮的真相。',
    stages: [
      '在鹽水武廟打聽消息，今晚跟著關帝的神轎走。',
      '蜂炮夜結束了。到客棧休息，天亮往府城。',
      '前往府城西邊的長明宮。',
      '在府城打聽進入長明宮的方法。',
      '去五條港鄭家，找肉粽伯。',
      '黃昏後，穿過林投林，找到長明宮的水門。',
      '潛入長明宮，尋找清虛真人的下落。',
      '清虛真人往日月潭霧底下的燈母祠去了。萬燈閣在下面。',
      '白芷被帶走了。',
    ],
    doneText: '「此身化作燈一盞，照你回家莫照我。」',
  };
  Q.q_yanshui_mother = {
    name: '轎夫與母親', lantern: true,
    desc: '鹽水的轎夫阿義，八年前的瘟疫裡失去了母親。他今年第一次扛關帝的轎。',
    stages: ['阿義說，他要替母親還願。', '大疫塚上，有一個瘟鬼沒有跟著大家升天。', '讓她看看長大的兒子。'],
    doneText: '「阿母走了。這次有說再見喔。」',
  };
  Q.q_tuanzi_mush = Q.q_tuanzi_mush || {
    name: '糰子的蕈譜', lantern: false,
    desc: '雲歸的蕈譜上有七個空格。糰子負責……吃。',
    stages: ['蕈譜第一頁出現了七個空格。', '等待下一種靈蕈。'],
  };

  // =================================================================================================== battle rules
  // All rules attach through S.battle options (intro / onTurn / hpFloor / onFloor). A few rules need to see the exact
  // command a unit chose (防禦 = 傾聽, 渡魂謠 on a soul jar, 護燈訣 on a marked ally), so `intro` wraps that one
  // BattleScene instance's aiCommand / execute / damage / drawHud — nothing global is touched.
  const avgLv = () => { const a = G.Party.active(); return a.length ? Math.round(a.reduce((s, m) => s + m.lv, 0) / a.length) : 21; };
  const burstAt = (b, u, colors, o = {}) => b.fx.push(new G.FX.Burst(Object.assign({ x: u.x, y: u.y - b.unitH(u) * 0.5, n: 28, color: colors, speed: 260, life: 0.8, r: 4 }, o)));

  // ---- 蜂炮: at the start of every round a 炮城 may fire a volley into the enemy line (and, rarely, into you)
  function beehiveRules(o = {}) {
    const chance = o.chance || 0.4, k = o.k || 12;
    let lastRound = 0, forced = false;
    async function volley(b, caption) {
      const lv = avgLv();
      G.Audio.sfx('fire'); G.Audio.sfx('thunder', 0.1); G.Audio.sfx('crit', 0.25);
      G.Render.doFlash('#ffe2a0', 0.35, 0.55);
      b.shakeT = 0.5;
      b.say(caption || '炮城齊射！萬炮齊發！', caption ? 3.2 : 1.4);
      for (const e of b.alive('enemy')) {
        const em = b.elemFactor('fire', e);
        burstAt(b, e, ['#fff2b0', '#ffb040', '#ff6a2a'], { n: 36, speed: 360, shape: 'shard' });
        b.damage(e, Math.max(1, Math.round(lv * k * em * U.rand(0.92, 1.08))), { elem: 'fire', weak: em > 1.2, resist: em < 0.9, volley: true });
      }
      await b.wait(0.7);
      if (Math.random() < 0.1) {
        const p = U.pick(b.alive('party'));
        if (p) {
          b.damage(p, Math.max(1, lv * 4), { noGauge: true, volley: true });
          p.luk += 20;
          b.popText(p, '運勢↑', '#ffd84a', -70);
          b.say('被炸到了！——今年會很旺！', 1.8);
          await b.wait(0.6);
        }
      }
    }
    return {
      intro: async (b) => { b.say('蜂炮夜：炮城隨時會齊射！', 1.6); await b.wait(0.5); },
      onTurn: async (b) => {
        if (o.forceAt && !forced) {
          const boss = b.enemies.find((e) => e.id === o.forceAt.id && !e.dead);
          if (boss && boss.hp <= boss.mhp * o.forceAt.at) {
            forced = true;
            await volley(b, '整條街一起放炮的時候，就不會覺得只有自己一個人在怕了。');
            return;
          }
        }
        if (b.rounds < 1 || b.rounds === lastRound) return;
        lastRound = b.rounds;
        if (Math.random() < chance) await volley(b);
      },
    };
  }

  // ---- 林投姐: the HP bar is her 「怨」. Every third turn she 泣訴 (tells her story): until her next turn, every party
  // member who chooses 防禦 is 傾聽 (怨 −8%, her attack drops), while hurting her makes it worse (怨 +5%).
  // 白芷's 渡魂謠 always soothes (怨 −6%). At 30% the 「看她背後」 beat plays; at 0 the battle ends (she never dies).
  const LINTO_LINES = [
    '我把錢全都給他了……我以為……我以為……',
    '阿寶發燒的時候，我去求藥舖……沒錢……人家把門關上……',
    '我抱著阿寶，在海邊等船……等到他不哭了……我還在等……',
  ];
  function drawGrudge(ctx, t, b, she, st) {
    if (!she || she.dead) return;
    const bx = 40, by = 86, bw = 520, k = Math.max(0, she.hp / she.mhp);
    ctx.save();
    ctx.fillStyle = 'rgba(16,6,22,0.96)';
    ctx.fillRect(bx - 3, by - 3, bw + 6, 22);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#3a1050'); g.addColorStop(0.6, '#7a2a9a'); g.addColorStop(1, '#c070f0');
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw * k, 16);
    ctx.fillStyle = 'rgba(255,240,255,0.55)';
    ctx.fillRect(bx + bw * 0.3 - 1, by - 4, 2, 24);
    G.Render.text(ctx, '怨', bx + bw + 46, by - 10, { size: 30, bold: true, color: '#e8c0ff', glow: 'rgba(160,60,220,0.7)', glowBlur: 12 });
    G.Render.text(ctx, `${Math.ceil(k * 100)}%`, bx + bw - 6, by + 20, { size: 16, align: 'right', color: '#ead8ff' });
    if (st.window) G.Render.text(ctx, '她在訴說——選擇「防禦」靜靜傾聽', bx, by + 22, { size: 19, color: '#ffd0f0', alpha: 0.75 + 0.25 * Math.sin(t * 5) });
    ctx.restore();
  }
  function lintoRules() {
    const st = { turn: 0, window: false, listened: new Set(), lament: 0, listens: 0, turned: false, lamentNow: false };
    let she = null;
    const pct = (k) => Math.round(she.mhp * k);
    const soothe = (b, k, label, color) => {
      she.hp = Math.max(1, she.hp - pct(k));
      b.popText(she, label, color || '#d8b0ff', -30);
      if (she.hp <= 1) { b.result = 'win'; b.scriptedEnd = true; }
    };
    return {
      c6: st,
      rewards: true,
      bgmAfter: 'sad',
      hpFloor: { c6_linto: 0.0001 },
      onFloor: async (b, e) => {
        if (e.id !== 'c6_linto') return;
        b.say('她什麼都沒有了。', 3);
        await b.wait(1.2);
        b.result = 'win'; b.scriptedEnd = true;
      },
      intro: async (b) => {
        she = b.enemies.find((e) => e.id === 'c6_linto');
        b.c6 = st;
        const ai = b.aiCommand.bind(b), ex = b.execute.bind(b), dmg = b.damage.bind(b), hud = b.drawHud.bind(b);
        b.aiCommand = (e) => {
          if (e === she && st.lamentNow) return { kind: 'skill', skill: 'c6_lj_lament', targets: [she] };
          const cmd = ai(e);
          if (e === she && cmd.skill === 'c6_lj_call' && b.alive('enemy').filter((x) => x.id === 'c6_pandanus').length >= 2) {
            return { kind: 'skill', skill: 'c6_lj_thorns', targets: b.alive('party') };
          }
          return cmd;
        };
        b.execute = async (u, cmd) => {
          if (u === she && cmd.skill === 'c6_lj_lament') {
            st.lamentNow = false;
            const line = LINTO_LINES[st.lament % LINTO_LINES.length];
            st.lament++;
            b.banner('泣訴', '#e0b8ff');
            G.Audio.sfx('ghost');
            await b.say2('linto:cry', line);
            st.window = true;
            st.listened.clear();
            b.say('她在訴說。選擇「防禦」，靜靜聽她講完。', 2.6);
            await b.wait(0.5);
            return;
          }
          await ex(u, cmd);
          if (she.dead || b.result) return;
          if (u.side === 'party' && cmd.kind === 'defend' && st.window && !st.listened.has(u.id)) {
            st.listened.add(u.id);
            st.listens++;
            soothe(b, 0.08, '傾聽　怨↓');
            b.addStatus(she, 'atkDown', 2, true);
            burstAt(b, she, ['#f0d8ff', '#c8a0ff', '#ffffff'], { n: 18, speed: 90, gravity: -80 });
            G.Audio.sfx('heal');
          }
          if (u.id === 'baizhi' && cmd.skill === 'bz_duhun') soothe(b, 0.06, '渡魂謠　怨↓', '#a8e0ff');
        };
        b.damage = (tg, d, o = {}) => {
          if (tg === she && st.window && (o.attacker || o.elem !== undefined) && !o.volley) {
            she.hp = Math.min(she.mhp, she.hp + pct(0.05));
            she.flash = 0.6;
            b.popText(she, '被打斷了　怨↑', '#ff7ab0', -30);
            G.Audio.sfx('debuff');
            return;
          }
          dmg(tg, d, o);
        };
        b.drawHud = (ctx, t) => { hud(ctx, t); drawGrudge(ctx, t, b, she, st); };
        await b.say2('yungui:serious', '怨氣滿了！——別下重手！她不是惡鬼！');
      },
      onTurn: async (b, u) => {
        if (!she) return;
        if (u === she) {
          st.window = false;
          st.turn++;
          if (st.turn % 3 === 0) st.lamentNow = true;
          else if (st.turn % 3 === 2) { b.say('林投姐的肩膀在發抖……', 1.8); await b.wait(0.4); }
        }
        if (!st.turned && !she.dead && she.hp <= she.mhp * 0.3) {
          st.turned = true;
          G.Audio.sfx('sing');
          await b.say2('baizhi:serious', '（白芷吹起玉笛。渡魂謠的旋律，在林投林裡慢慢散開……）');
          await b.say2('xinghe:serious', '……白芷，看她背後。');
          await b.say2('', '老林投的氣根之間，一個小小的光點在閃。像一個蹲著的小孩。');
          await b.say2('baizhi:surprise', '……有人。');
          she.atk = Math.round(she.atk * 0.7);
          she.mag = Math.round(she.mag * 0.7);
          b.say('林投姐的怨氣弱了下來。', 1.6);
        }
      },
    };
  }

  // ---- 冥燈護法: four soul jars feed it (regen + DEF per living jar). Breaking a jar frees a soul and heals the
  // party 10%; 白芷's 渡魂謠 frees the weakest jar outright. 重鑄 re-seals an empty socket (twice). Phase 2: 燈印 marks a
  // member — two of its turns later it burns for a huge hit unless the target is guarding (×0.2) or 星河's 護燈訣
  // was cast on them (cancelled). Phase 3: 萬燈齊鳴 drains 5% MP per turn.
  function netherRules() {
    const st = { recasts: 0, mark: null };
    let boss = null, baseDef = 0;
    const jars = (b) => b.enemies.filter((e) => e.id.indexOf('c6_soul_jar_') === 0);
    function released(b, jar) {
      burstAt(b, jar, ['#c8e8ff', '#ffffff', '#8ab8ff'], { n: 40, speed: 120, gravity: -260, life: 1.4 });
      for (const p of b.alive('party')) { const h = Math.round(p.mhp * 0.1); b.healUnit(p, h); }
      G.Audio.sfx('lantern');
      b.say('封印鬆開了——一點魂光，溫柔地飛向萬燈閣的黑暗。', 2.2);
    }
    async function burnMark(b) {
      const m = st.mark;
      st.mark = null;
      const u = m.u;
      if (u.dead) return;
      b.banner('燈印・燃', '#8ab8ff');
      if (m.guarded) {
        b.popText(u, '護燈訣・抵銷', '#ffe08a', -40);
        burstAt(b, u, ['#ffe6a0', '#ffd060', '#ffffff'], { n: 30, speed: 160 });
        G.Audio.sfx('guard');
        await b.wait(0.6);
        return;
      }
      let dmg = 3.0 * boss.mag * 2 * 50 / (50 + (u.def * 0.3 + u.mag * 0.7));
      if (u.st.guard) { dmg *= 0.2; b.popText(u, '防禦！', '#d8d0b0', -40); }
      burstAt(b, u, ['#c8e8ff', '#6ab8ff', '#3a7ad8'], { n: 44, speed: 300 });
      G.Audio.sfx('dark');
      b.damage(u, Math.max(1, Math.round(dmg * U.rand(0.92, 1.08))), {});
      await b.wait(0.7);
    }
    return {
      c6: st,
      intro: async (b) => {
        boss = b.enemies.find((e) => e.id === 'c6_netherlamp');
        baseDef = boss.def;
        b.c6 = st;
        const kill = b.kill.bind(b), ai = b.aiCommand.bind(b), ex = b.execute.bind(b), hud = b.drawHud.bind(b);
        b.kill = (u) => { kill(u); if (u.id.indexOf('c6_soul_jar_') === 0) released(b, u); };
        b.aiCommand = (e) => {
          if (e === boss) {
            if (jars(b).some((j) => j.dead) && st.recasts < 2 && Math.random() < 0.3) return { kind: 'skill', skill: 'c6_ng_recast', targets: [boss] };
            if (boss.phase >= 2 && !st.mark && Math.random() < 0.45) return { kind: 'skill', skill: 'c6_ng_mark', targets: [boss] };
          }
          return ai(e);
        };
        b.execute = async (u, cmd) => {
          if (u === boss && cmd.skill === 'c6_ng_recast') {
            const j = jars(b).find((x) => x.dead);
            st.recasts++;
            b.banner('重鑄', '#ff9a8a');
            if (!j) return;
            boss.hp = Math.max(1, boss.hp - Math.round(boss.mhp * 0.1));
            j.dead = false; j.hp = Math.min(j.mhp, 600); j.st = {}; j.pose = 'idle'; j.wait = 60;
            b.tween(j, { alpha: 1 }, 0.5);
            burstAt(b, j, ['#6ab8ff', '#2a4a8a', '#c8e8ff'], { n: 26, speed: 140 });
            G.Audio.sfx('dark');
            b.say('護法掰下自己的燈芯，重新封住了空座。', 2);
            await b.wait(0.8);
            return;
          }
          if (u === boss && cmd.skill === 'c6_ng_mark') {
            const tg = U.pick(b.alive('party'));
            b.banner('燈印', '#8ab8ff');
            if (!tg) return;
            st.mark = { u: tg, n: 2, guarded: false };
            burstAt(b, tg, ['#8ab8ff', '#c8e8ff'], { n: 20, speed: 80 });
            b.popText(tg, '燈印', '#7ab8ff', -40);
            G.Audio.sfx('dark');
            b.say('冷燈的印記烙在身上——下一次會燒起來。（防禦、或用護燈訣護住他）', 2.8);
            await b.wait(0.8);
            return;
          }
          const duhun = u.id === 'baizhi' && cmd.skill === 'bz_duhun';
          const hudeng = u.side === 'party' && cmd.skill === 'xh_hudeng' && st.mark && (cmd.targets || []).includes(st.mark.u);
          await ex(u, cmd);
          if (hudeng && st.mark) { st.mark.guarded = true; b.popText(st.mark.u, '護燈', '#ffe08a', -60); }
          if (duhun) {
            const live = jars(b).filter((j) => !j.dead).sort((a, c) => a.hp - c.hp)[0];
            if (live) { b.popText(live, '渡魂', '#c8f0ff', -40); b.damage(live, live.hp, { c6: true }); }
          }
        };
        b.drawHud = (ctx, t) => {
          hud(ctx, t);
          if (st.mark && !st.mark.u.dead) {
            const i = b.party.indexOf(st.mark.u);
            const pw = G.W - 380, cw = pw / Math.max(1, b.party.length);
            const x = 360 + 12 + i * cw + cw / 2, y = G.H - 140;
            G.Render.text(ctx, st.mark.guarded ? '燈印（已護住）' : `燈印 ${st.mark.n}`, x, y, { size: 20, bold: true, align: 'center', color: st.mark.guarded ? '#ffe08a' : '#8ac8ff', stroke: '#081020', strokeW: 4 });
          }
          const live = jars(b).filter((j) => !j.dead).length;
          G.Render.text(ctx, `封住的魂罐：${live}`, 40, 116, { size: 17, color: '#a8c8f0' });
        };
        await b.say2('', '四只魂罐在護法身邊浮起。每一只罐子裡，都有人在敲著罐壁。');
      },
      onTurn: async (b, u) => {
        if (u !== boss || boss.dead) return;
        const live = jars(b).filter((j) => !j.dead).length;
        boss.def = Math.round(baseDef * (1 + 0.08 * live));
        if (live && boss.hp < boss.mhp) {
          b.healUnit(boss, Math.round(boss.mhp * 0.015 * live));
          b.popText(boss, '魂罐供燈', '#8ab8ff', -60);
          await b.wait(0.35);
        }
        if (st.mark) { st.mark.n--; if (st.mark.n <= 0) await burnMark(b); }
        if (boss.phase >= 3) {
          for (const p of b.alive('party')) p.mp = Math.max(0, p.mp - Math.round(p.mmp * 0.05));
          b.say('萬燈齊鳴——真氣一點一點被吸走……', 1.4);
          await b.wait(0.4);
        }
      },
    };
  }

  // ---- 夜玄 (forced loss): every hit lands as 「……」; his four actions are fixed; the 4th ends the battle.
  function yexuanRules() {
    let yx = null, step = 0, ultSaid = false;
    const ACTS = ['c6_yx_plea', 'c6_yx_bind', 'c6_yx_still', 'c6_yx_draw'];
    async function act(b, id) {
      const party = (pid) => b.party.find((p) => p.id === pid);
      b.banner(G.Data.skills[id].name, '#c8d8ff');
      if (id === 'c6_yx_plea') {
        await b.say2('yexuan:sad', '請住手。');
      } else if (id === 'c6_yx_bind') {
        G.Audio.sfx('bell');
        for (const p of b.alive('party')) { b.addStatus(p, 'seal', 3); burstAt(b, p, ['#c8b8ff', '#6a5ab8'], { n: 16, speed: 90 }); }
        await b.say2('yexuan:normal', '你們的法術，在這裡點不亮。');
      } else if (id === 'c6_yx_still') {
        await b.say2('yexuan:sad', '睡吧。不會痛的。');
        G.Audio.sfx('dark');
        for (const pid of ['hongying', 'yungui']) {
          const p = party(pid);
          if (p && !p.dead) { burstAt(b, p, ['#2a1a4a', '#6a3ab8', '#c08aff'], { n: 30, speed: 200 }); p.hp = 0; b.kill(p); }
        }
        await b.wait(0.8);
      } else {
        const xh = party('xinghe');
        G.Audio.sfx('dark');
        G.Render.doFlash('#ffd880', 0.5, 0.6);
        if (xh) { xh.hp = 1; xh.gauge = 0; xh.pose = 'hurt'; burstAt(b, xh, ['#ffe6a0', '#ffb050', '#ffffff'], { n: 40, speed: 120, gravity: -160 }); }
        await b.wait(0.9);
        b.result = 'lose';
      }
    }
    return {
      loseOk: true,
      bgmAfter: 'tension',
      intro: async (b) => {
        yx = b.enemies[0];
        const ex = b.execute.bind(b), dmg = b.damage.bind(b), hud = b.drawHud.bind(b);
        b.aiCommand = (e) => ({ kind: 'skill', skill: ACTS[Math.min(step++, ACTS.length - 1)], targets: [e] });
        b.execute = async (u, cmd) => {
          if (u === yx) { await act(b, cmd.skill); return; }
          await ex(u, cmd);
          if (cmd.kind === 'ultimate' && !ultSaid) { ultSaid = true; await b.say2('yexuan:think', '……陳渡的劍法。他教得很好。'); }
        };
        b.damage = (tg, d, o = {}) => {
          if (tg === yx) { tg.flash = 0.8; b.popText(tg, '……', '#d8e0f0'); G.Audio.sfx('guard'); return; }
          dmg(tg, d, o);
        };
        b.tryFlee = async () => { G.Audio.sfx('buzz'); b.say('逃不掉。', 1.4); await b.wait(0.8); };
        b.drawHud = (ctx, t) => {
          hud(ctx, t);
          ctx.save();
          ctx.fillStyle = 'rgba(6,8,16,0.96)';
          ctx.fillRect(37, 83, 526, 22);
          ctx.fillStyle = '#3a4a6a'; ctx.fillRect(40, 86, 520, 16);
          G.Render.text(ctx, '？？？', 548, 84, { size: 17, align: 'right', color: '#c8d0e8' });
          G.Render.text(ctx, 'Lv ？？', 40, 108, { size: 16, color: '#a8b0c8' });
          ctx.restore();
        };
      },
      onTurn: async (b) => { if (b.alive('party').every((p) => p.hp <= 1)) b.result = 'lose'; },
    };
  }

  function moyaRules() {
    return { intro: async (b) => { await b.say2('moya:smug', '又是你們！墨護法今天要一雪前恥！'); } };
  }
  G.Mapx.c6Rules = { beehive: beehiveRules, linto: lintoRules, nether: netherRules, yexuan: yexuanRules, moya: moyaRules };

  // =================================================================================================== stealth (長明宮 S1–S3)
  // Map def fields: guards (mapmech) + stealth: { area: 's1', creaky: [[x,y]...], puppets: [{id,x,y,dir}], fwPhase }.
  // The engine's instant guard catch is replaced (mapScene.invuln is held up) by detection meters:
  //   view 5 cells when the player stands in a lamp's light (2.5 cells of an eternal_lamp), 3 in the dark;
  //   meter +1.0/s lit, +0.5/s dark, ×2 within 2 cells; ≥0.35 → 起疑 (walk over, look around, walk back);
  //   1.0 → 警戒 (chase at 3 cells/s). Caught = alert & adjacent, or standing in a guard's face.
  // Noise: running (radius 3), creaky boards (2), 糰子 [Q] (4, guards only), wrong shelves in S3 (6).
  // Fireworks every 30 s mask all noise for 3 s. Jars: hide (unless an alert guard within 2 cells watches you).
  // 傀儡哨 puppets turn 90° every 3 s, ring a bell when they spot you (guards within 8 come to look);
  // 雲歸 can stick a 定身符 on one from behind (frozen 30 s).
  const Stealth = (() => {
    const CW = { up: 'right', right: 'down', down: 'left', left: 'up' };
    const CCW = { up: 'left', left: 'down', down: 'right', right: 'up' };
    const TZ_LINES = ['喵——不對，吾是石虎！', '吾什麼都沒吃！', '這個罐子自己倒的！', '咕嚕咕嚕——'];
    const MOYA_LINES = ['升官……我這叫升官……', '那隻貓……我記住了……', '法師說要溫柔……溫柔是什麼……'];
    const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
    const spottedKey = (c) => 'ch6_' + c.area + '_spotted';

    function init(ms) {
      const sd = ms.def.stealth;
      const c = ms.c6 = {
        area: sd.area, t: 0, fw: sd.fwPhase || 14, mask: 0, ripples: [], hide: null, bubbles: [], feathers: [],
        lastCell: [ms.player.x, ms.player.y], tz: null, tzCool: 0, runT: 0, moyaT: 3,
        lamps: ms.objects.filter((o) => o.t === 'eternal_lamp').map((o) => [o.x, o.y]),
        creaky: new Set((sd.creaky || []).map(([x, y]) => x + ',' + y)),
        puppets: (sd.puppets || []).map((p) => Object.assign({ turnT: 0, frozen: 0, meter: 0, cool: 0 }, p)),
      };
      for (const g of ms.npcs) if (g.guard && !g.c6) {
        g.def = Object.assign({}, g.def);
        g.c6 = { meter: 0, mode: g.def.sleeper ? 'sleep' : 'patrol', target: null, trail: [], timer: 0, lost: 0, look: 0, phase: null, seen: null, sees: false };
      }
      const hud = ms.drawHud;
      ms.drawHud = function (ctx, t) { hud.call(this, ctx, t); drawHud(ctx, t, this); };
      return c;
    }
    const lit = (c, x, y) => c.lamps.some(([lx, ly]) => dist(x, y, lx, ly) <= 2.5);
    function spotted(c) { V()[spottedKey(c)] = true; }
    function bubble(c, a, text, life = 2.6) { c.bubbles.push({ a, text, t: 0, life }); }

    function toSuspect(g, x, y) {
      const s = g.c6;
      if (s.mode !== 'suspect') { g.emote = { k: '?', t: 0, life: 1.2 }; s.timer = 1.0; s.phase = 'go'; }
      s.mode = 'suspect';
      s.target = [x, y];
      g.scripted = true;
      const dx = x - g.x, dy = y - g.y;
      if (dx || dy) g.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    function toAlert(ms, c, g) {
      const s = g.c6;
      s.mode = 'alert'; s.timer = 0.35; s.lost = 0;
      g.scripted = true;
      g.emote = { k: '!', t: 0, life: 1.4 };
      G.Audio.sfx('buzz');
      spotted(c);
      bubble(c, g, '什麼人！', 1.6);
    }
    function catchBy(ms, c, g) {
      if (ms.caught) return;
      spotted(c);
      if (c.hide) { c.hide = null; ms.player.visible = true; }
      ms.caught = true;
      ms.onCaught(g);
    }
    function noise(ms, c, x, y, r, kind) {
      if (c.mask > 0) return;
      c.ripples.push({ x, y, r, t: 0, kind });
      for (const g of ms.npcs) {
        if (!g.guard || !g.c6 || g.c6.mode === 'alert') continue;
        if (dist(g.x, g.y, x, y) > r) continue;
        if (g.c6.mode === 'sleep') bubble(c, g, '……嗯？', 1.4);
        toSuspect(g, x, y);
      }
    }
    // one greedy step toward (tx, ty); records the step for the walk back
    function stepToward(ms, g, tx, ty) {
      const dx = tx - g.x, dy = ty - g.y;
      if (!dx && !dy) return false;
      const opts = [];
      if (dx) opts.push([Math.sign(dx), 0]);
      if (dy) opts.push([0, Math.sign(dy)]);
      if (Math.abs(dy) > Math.abs(dx)) opts.reverse();
      for (const [sx, sy] of opts) {
        const nx = g.x + sx, ny = g.y + sy;
        if (ms.blocked(nx, ny, g)) continue;
        g.dir = sx > 0 ? 'right' : sx < 0 ? 'left' : sy > 0 ? 'down' : 'up';
        g.startMove(nx, ny);
        g.c6.trail.push(g.dir);
        return true;
      }
      const [sx, sy] = opts[0];
      g.dir = sx > 0 ? 'right' : sx < 0 ? 'left' : sy > 0 ? 'down' : 'up';
      return false;
    }
    function stepGuard(ms, c, g, dt) {
      const s = g.c6, p = ms.player;
      if (s.mode === 'patrol' || s.mode === 'sleep' || g.moving) return;
      if (s.timer > 0) { s.timer -= dt; return; }
      if (s.mode === 'alert') {
        g.speed = 3.0;
        if (s.lost > 3) { s.mode = 'suspect'; s.phase = 'look'; s.look = 0; s.target = s.seen; s.timer = 0.3; return; }
        const tgt = s.sees ? [p.x, p.y] : s.seen;
        if (!tgt || !stepToward(ms, g, tgt[0], tgt[1])) s.timer = 0.2;
        return;
      }
      if (s.mode === 'suspect') {
        g.speed = 1.2;
        if (s.phase === 'go') {
          const [tx, ty] = s.target;
          if (Math.abs(tx - g.x) + Math.abs(ty - g.y) <= 1 || !stepToward(ms, g, tx, ty)) { s.phase = 'look'; s.look = 0; s.timer = 0.4; }
          return;
        }
        s.look++;
        g.dir = s.look % 2 ? CW[g.dir] : CCW[CCW[g.dir]];
        s.timer = 1.0;
        if (s.look > 2) { s.mode = 'return'; s.timer = 0.6; }
        return;
      }
      if (s.mode === 'return') {
        g.speed = 1.6;
        if (!s.trail.length) {
          s.mode = g.def.sleeper ? 'sleep' : 'patrol';
          g.scripted = false;
          g.speed = g.def.speed || 1.8;
          s.meter = Math.min(s.meter, 0.15);
          if (g.def.sleeper) { g.dir = g.def.dir || 'down'; bubble(c, g, '……呼……', 1.8); }
          return;
        }
        const d = s.trail.pop(), back = U.opposite[d];
        const [dx, dy] = U.dirs[back];
        const nx = g.x + dx, ny = g.y + dy;
        if (ms.blocked(nx, ny, g)) { s.trail.push(d); s.timer = 0.4; return; }
        g.dir = back;
        g.startMove(nx, ny);
      }
    }

    function tuanzi(ms, c) {
      if (c.tz || c.hide) return;
      if (c.tzCool > 0) { G.UI.toast('糰子還在喘氣……再等一下。'); return; }
      const p = ms.player, [dx, dy] = U.dirs[p.dir];
      const path = [];
      let tx = p.x, ty = p.y;
      for (let i = 1; i <= 4; i++) {
        const nx = p.x + dx * i, ny = p.y + dy * i;
        if (nx < 0 || ny < 0 || nx >= ms.w || ny >= ms.h || ms.solid[ny * ms.w + nx]) break;
        tx = nx; ty = ny; path.push(p.dir);
      }
      if (!path.length) { G.UI.toast('前面沒有路，糰子跑不過去。'); return; }
      const a = new G.Mapx.Actor({ id: 'c6_tuanzi', sprite: 'tuanzi', x: p.x, y: p.y, dir: p.dir, speed: 6.5, def: {}, spawned: true, through: true });
      ms.npcs.push(a);
      for (const d of path) a.queue.push({ dir: d });
      c.tz = { a, phase: 'go', tx, ty, t: 0, back: path.map((d) => U.opposite[d]) };
      c.tzCool = 20;
    }
    function updateTz(ms, c, dt) {
      const z = c.tz;
      if (!z) return;
      z.t += dt;
      const idle = !z.a.moving && !z.a.queue.length;
      if (z.phase === 'go' && idle) {
        z.phase = 'noise'; z.t = 0;
        G.Audio.sfx('hit'); G.Audio.sfx('push', 0.12);
        const m = c.mask; c.mask = 0; noise(ms, c, z.tx, z.ty, 4, 'tuanzi'); c.mask = m;
        bubble(c, z.a, U.pick(TZ_LINES), 2.4);
      } else if (z.phase === 'noise' && z.t > 3) {
        z.phase = 'back';
        for (const d of z.back) z.a.queue.push({ dir: d });
      } else if (z.phase === 'back' && idle) {
        ms.npcs = ms.npcs.filter((n) => n !== z.a);
        c.tz = null;
      }
    }

    function update(dt, ms, busy) {
      if (!ms.def.stealth) return;
      const c = ms.c6 || init(ms);
      ms.invuln = Math.max(ms.invuln, 0.3);
      c.t += dt;
      c.ripples = c.ripples.filter((r) => (r.t += dt) < 1.3);
      c.bubbles = c.bubbles.filter((b) => (b.t += dt) < b.life);
      c.feathers = c.feathers.filter((f) => (f.t += dt) < 6);
      if (busy || ms.caught || G.Scenes.top() !== ms) return;
      // fireworks from the 千燈長明 ceremony at the front gate
      c.fw -= dt;
      if (c.fw <= 0) {
        c.fw = 30; c.mask = 3;
        G.Render.doFlash('#dfe8ff', 0.5, 0.42);
        G.Audio.sfx('thunder'); G.Audio.sfx('fire', 0.2);
      }
      if (c.mask > 0) c.mask = Math.max(0, c.mask - dt);
      const p = ms.player;
      const running = G.Input.held('run') !== !!G.settings.runDefault;
      if (c.hide && (p.x !== c.hide.x || p.y !== c.hide.y)) { c.hide = null; p.visible = true; G.Audio.sfx('push'); }
      if (p.moving && running && !c.hide) { c.runT -= dt; if (c.runT <= 0) { c.runT = 0.35; noise(ms, c, p.x, p.y, 3, 'run'); } } else c.runT = 0;
      if (p.x !== c.lastCell[0] || p.y !== c.lastCell[1]) {
        c.lastCell = [p.x, p.y];
        if (c.creaky.has(p.x + ',' + p.y) && !running) { G.Audio.sfx('step'); G.Audio.sfx('switch', 0.05); noise(ms, c, p.x, p.y, 2, 'creak'); }
      }
      if (G.Input.pressed('auto')) tuanzi(ms, c);
      if (c.tzCool > 0) c.tzCool -= dt;
      updateTz(ms, c, dt);
      const pLit = lit(c, p.x, p.y);
      // puppets
      for (const pu of c.puppets) {
        if (!ms.enemies.some((e) => e.id === pu.id)) continue;   // beaten in a fight → gone until the map reloads
        if (pu.frozen > 0) { pu.frozen -= dt; continue; }
        pu.turnT += dt;
        if (pu.turnT >= 3) { pu.turnT = 0; pu.dir = CW[pu.dir]; const e = ms.enemies.find((x) => x.id === pu.id); if (e) e.dir = pu.dir; }
        if (pu.cool > 0) { pu.cool -= dt; continue; }
        const sees = !c.hide && ms.guardSees({ x: pu.x, y: pu.y, dir: pu.dir, def: { view: 4 } }, p.x, p.y);
        if (sees) pu.meter += dt * (pLit ? 1 : 0.5) * (dist(pu.x, pu.y, p.x, p.y) <= 2 ? 2 : 1);
        else pu.meter = Math.max(0, pu.meter - 0.5 * dt);
        if (pu.meter >= 1) {
          pu.meter = 0; pu.cool = 4;
          spotted(c);
          G.Audio.sfx('bell'); G.Audio.sfx('bell', 0.25);
          c.bubbles.push({ x: pu.x, y: pu.y, text: '叮鈴鈴——', t: 0, life: 2 });
          for (const g of ms.npcs) if (g.guard && g.c6 && g.c6.mode !== 'alert' && dist(g.x, g.y, pu.x, pu.y) <= 8) toSuspect(g, pu.x, pu.y + 1);
        }
      }
      // guards
      for (const g of ms.npcs) {
        if (!g.guard || !g.c6) continue;
        const s = g.c6;
        g.def.view = s.mode === 'sleep' ? 0 : (g.def.fixedView || (pLit ? 5 : 3));
        if (s.mode === 'patrol' && g.pauseT > 0) {
          const n = g.def.path.length;
          const pf = g.def.pauseFaces ? g.def.pauseFaces[(g.wp - 1 + n) % n] : g.def.pauseFace;
          if (pf) g.dir = pf;
        }
        const d = dist(g.x, g.y, p.x, p.y);
        s.sees = !c.hide && s.mode !== 'sleep' && ms.guardSees(g, p.x, p.y);
        if (s.sees) { s.meter = Math.min(1, s.meter + dt * (pLit ? 1 : 0.5) * (d <= 2 ? 2 : 1)); s.lost = 0; s.seen = [p.x, p.y]; }
        else if (s.mode !== 'alert') s.meter = Math.max(0, s.meter - 0.5 * dt);
        else s.lost += dt;
        if (!c.hide && s.mode !== 'sleep') {
          const man = Math.abs(g.x - p.x) + Math.abs(g.y - p.y);
          const [fx, fy] = U.dirs[g.dir];
          if (man <= 1 && (s.mode === 'alert' || (g.x + fx === p.x && g.y + fy === p.y))) { catchBy(ms, c, g); return; }
        }
        if (s.meter >= 1 && s.mode !== 'alert') toAlert(ms, c, g);
        else if (s.meter >= 0.35 && (s.mode === 'patrol' || s.mode === 'return')) toSuspect(g, p.x, p.y);
        else if (s.sees && s.mode === 'suspect') s.target = [p.x, p.y];
        stepGuard(ms, c, g, dt);
        if (g.id === 'moya') {
          c.moyaT -= dt;
          if (c.moyaT <= 0) { c.moyaT = 6.5; bubble(c, g, U.pick(MOYA_LINES), 2.8); }
          if (g.moving && Math.random() < dt * 0.6) c.feathers.push({ x: g.px + U.rand(-10, 10), y: g.py - 6, r: U.rand(0, 6), t: 0 });
        }
      }
    }

    // ---- interactions (called from map objects / events)
    function hideIn(S, o) {
      const ms = MS(), c = ms.c6 || init(ms), p = ms.player;
      for (const g of ms.npcs) {
        if (g.guard && g.c6 && g.c6.mode === 'alert' && dist(g.x, g.y, p.x, p.y) <= 2 && ms.guardSees(g, p.x, p.y)) { catchBy(ms, c, g); return; }
      }
      c.hide = { x: o.x, y: o.y };
      p.setCell(o.x, o.y);
      p.visible = false;
      G.state.x = o.x; G.state.y = o.y;
      c.lastCell = [o.x, o.y];
      o.wob = 0.8;
      G.Audio.sfx('push');
      S.toast('躲進了大甕。（糰子先鑽了進去：「擠……」）按方向鍵出來。');
    }
    async function puppetCharm(S, pu) {
      const ms = MS(), c = ms.c6 || init(ms), p = ms.player;
      const st = c.puppets.find((x) => x.id === pu.id);
      if (!st) return;
      if (st.frozen > 0) { await S.say('yungui:smug', '貼好了。它現在連眼珠子都轉不動。'); return; }
      const [dx, dy] = U.dirs[st.dir];
      const behind = p.x === st.x - dx && p.y === st.y - dy;
      if (!behind) { await S.say('yungui:serious', '從正面或側面靠近，它會看見我們。繞到它背後再貼符。'); return; }
      await S.say('yungui:smug', '……定。');
      G.Audio.sfx('magic');
      st.frozen = 30;
      st.meter = 0;
      S.toast('雲歸在傀儡背上貼了一張定身符。（30 秒）');
    }
    async function onCaught(S, g) {
      const ms = MS(), d = ms.def;
      if (g.id === 'moya') {
        await S.say('moya:surprise', '……嗯？嗯嗯？——是你們！！');
        const r = await S.battle('t_c6_moya', moyaRules());
        if (r !== 'win') return;
        await S.say('moya:hurt', '……我、我只是戰略性撤退！');
        S.flag('ch6_moya_fled');
        const m = MS();
        if (m) { m.npcs = m.npcs.filter((n) => n.id !== 'moya'); m.caught = false; }
        S.toast('墨鴉逃走了。他大概不好意思叫人。');
        return;
      }
      const r = await S.battle(g.def.troop || 't_c6_guard_a', { mode: 'ambush' });
      if (r !== 'win' && r !== 'flee') return;
      V()['ch6_' + d.stealth.area + '_spotted'] = false;
      await S.warp(d.id, d.checkpoint[0], d.checkpoint[1], d.checkpoint[2] || 'up', { reload: true, noAutosave: true });
      S.toast('回到了檢查點。守衛們回到了原本的崗位。');
    }

    // ---- drawing
    function drawGround(ctx, t, ms) {
      const c = ms.c6;
      if (!c) return;
      // creaky boards
      for (const k of c.creaky) {
        const [x, y] = k.split(',').map(Number);
        ctx.fillStyle = 'rgba(60,36,20,0.55)';
        ctx.fillRect(x * T + 3, y * T + 3, T - 6, T - 6);
        ctx.strokeStyle = 'rgba(140,96,60,0.7)'; ctx.lineWidth = 2;
        for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x * T + 6, y * T + i * 16); ctx.lineTo(x * T + T - 6, y * T + i * 16 + (i % 2 ? 2 : -2)); ctx.stroke(); }
      }
      // hiding jars: a soft glow so they read as interactable
      for (const o of ms.objects) {
        if (o.t !== 'jar' || !o.interact) continue;
        const a = 0.22 + 0.12 * Math.sin(t * 2.5 + o.x);
        const g = ctx.createRadialGradient(o.x * T + 32, o.y * T + 44, 4, o.x * T + 32, o.y * T + 44, 46);
        g.addColorStop(0, `rgba(255,220,140,${a})`); g.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = g; ctx.fillRect(o.x * T - 16, o.y * T - 4, 96, 96);
      }
      // puppet vision cones (the puppets themselves are map enemies → proper 2D/3D rendering)
      for (const pu of c.puppets) {
        if (pu.frozen > 0 || !ms.enemies.some((e) => e.id === pu.id)) continue;
        const [dx, dy] = U.dirs[pu.dir];
        ctx.fillStyle = 'rgba(210,140,255,0.16)';
        for (let f = 1; f <= 4; f++) {
          const half = Math.floor((f + 1) / 2);
          for (let s = -half; s <= half; s++) {
            const cx = pu.x + dx * f + (dy !== 0 ? s : 0), cy = pu.y + dy * f + (dx !== 0 ? s : 0);
            if (cx < 0 || cy < 0 || cx >= ms.w || cy >= ms.h) continue;
            if (!ms.guardSeesCell(pu, cx, cy)) continue;
            ctx.fillRect(cx * T + 2, cy * T + 2, T - 4, T - 4);
          }
        }
      }
      // 墨鴉's feathers
      for (const f of c.feathers) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (6 - f.t) / 2) * 0.85;
        ctx.translate(f.x, f.y); ctx.rotate(f.r);
        ctx.fillStyle = '#1a1622';
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#4a3a5a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke();
        ctx.restore();
      }
    }
    function drawOver(ctx, t, ms) {
      const c = ms.c6;
      if (!c) return;
      for (const r of c.ripples) {
        const k = r.t / 1.3;
        ctx.save();
        ctx.strokeStyle = r.kind === 'tuanzi' ? `rgba(255,210,120,${1 - k})` : `rgba(255,140,120,${(1 - k) * 0.9})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.x * T + 32, r.y * T + 40, 12 + k * r.r * T, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }
    // screen positions (works for the 2D view and the 3D view): feet of an actor, or a point above a cell
    function scrActor(ms, a) {
      if (ms.view3d) { const s = ms.view3d.actorScreen(a); return { x: s.x, y: s.y + 112, vis: s.visible }; }
      return { x: a.px - ms.cam.x, y: a.py - ms.cam.y, vis: true };
    }
    function scrCell(ms, x, y, h) {
      if (ms.view3d) { const s = ms.view3d.toScreen(x + 0.5, h, y + 0.5); return { x: s.x, y: s.y, vis: s.visible }; }
      return { x: x * T + 32 - ms.cam.x, y: y * T + 48 - h * 64 - ms.cam.y, vis: true };
    }
    function meter(ctx, x, y, k, col) {
      ctx.fillStyle = 'rgba(10,10,20,0.75)'; ctx.fillRect(x - 24, y, 48, 7);
      ctx.fillStyle = col; ctx.fillRect(x - 23, y + 1, 46 * Math.min(1, k), 5);
    }
    function drawMarks(ctx, t, ms) {
      const c = ms.c6;
      for (const g of ms.npcs) {
        if (!g.guard || !g.c6 || !g.visible) continue;
        const s = g.c6, p = scrActor(ms, g);
        if (!p.vis) continue;
        const x = p.x, y = p.y - 122;
        if (s.mode === 'sleep') { G.Render.text(ctx, 'Zzz', x + 18, y + 6 + Math.sin(t * 2) * 3, { size: 20, bold: true, color: '#bcd0ff', stroke: '#10182a', strokeW: 3 }); continue; }
        if (s.meter > 0.02 || s.mode !== 'patrol') {
          const col = s.mode === 'alert' ? '#ff5a4a' : s.meter >= 0.35 ? '#ffc04a' : '#fff0c0';
          meter(ctx, x, y, s.meter, col);
          if (s.mode === 'alert' || s.mode === 'suspect') G.Render.text(ctx, s.mode === 'alert' ? '！' : '？', x, y - 34 + Math.sin(t * 8) * 2, { size: 28, bold: true, align: 'center', color: col, stroke: '#200', strokeW: 4 });
        }
      }
      for (const pu of c.puppets) {
        if (!ms.enemies.some((e) => e.id === pu.id)) continue;
        const p = scrCell(ms, pu.x, pu.y, 1.7);
        if (!p.vis) continue;
        if (pu.frozen > 0) {
          ctx.save(); ctx.fillStyle = '#f0d070'; ctx.fillRect(p.x - 8, p.y - 4, 16, 26);
          ctx.strokeStyle = '#a02a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + 18); ctx.moveTo(p.x - 5, p.y + 6); ctx.lineTo(p.x + 5, p.y + 6); ctx.stroke(); ctx.restore();
          G.Render.text(ctx, `${Math.ceil(pu.frozen)}`, p.x + 16, p.y - 6, { size: 16, color: '#ffe08a', stroke: '#201000', strokeW: 3 });
        } else if (pu.meter > 0.02) meter(ctx, p.x, p.y, pu.meter, '#e0a0ff');
      }
      for (const b of c.bubbles) {
        const p = b.a ? scrActor(ms, b.a) : scrCell(ms, b.x, b.y, -1.75);
        if (!p.vis) continue;
        const x = p.x, y = p.y - 140 - Math.min(1, b.t * 4) * 6;
        const a = Math.min(1, b.t * 5, (b.life - b.t) * 3);
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = G.font(17);
        const w = G.Render.measure(ctx, b.text) + 24;
        ctx.fillStyle = 'rgba(250,246,236,0.95)'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(x - w / 2, y - 14, w, 30, 10); ctx.fill(); ctx.stroke();
        G.Render.text(ctx, b.text, x, y - 10, { size: 17, align: 'center', color: '#2a1a10', shadow: false });
        ctx.restore();
      }
      if (c.hide) {
        const p = scrCell(ms, c.hide.x, c.hide.y, 1.1);
        if (p.vis) G.Render.text(ctx, '…', p.x + Math.sin(t * 9) * 1.5, p.y - 24, { size: 24, bold: true, align: 'center', color: '#fff0c0', stroke: '#201000', strokeW: 3 });
      }
      if (ms.def.extraHud) ms.def.extraHud(ctx, t, ms, scrCell);
    }
    function drawHud(ctx, t, ms) {
      const c = ms.c6;
      if (!c || G.Script.busy()) return;
      drawMarks(ctx, t, ms);
      const x = G.W - 228, y = 70;
      ctx.save();
      G.UI.plate(ctx, x, y, 204, 70, 0.6, 14);
      if (c.mask > 0) G.Render.text(ctx, '煙火聲蓋住了腳步聲！', x + 102, y + 10, { size: 17, align: 'center', color: '#ffe08a' });
      else G.Render.text(ctx, `下一發煙火：${Math.ceil(c.fw)} 秒`, x + 102, y + 10, { size: 17, align: 'center', color: '#dfe8ff' });
      G.Render.text(ctx, c.tzCool > 0 ? `糰子休息中：${Math.ceil(c.tzCool)}` : 'F：糰子搗蛋', x + 102, y + 38, { size: 16, align: 'center', color: c.tzCool > 0 ? '#a8a090' : '#ffd8a0' });
      ctx.restore();
    }
    return { update, drawGround, drawOver, onCaught, hideIn, puppetCharm, noise: (ms, x, y, r) => noise(ms, ms.c6 || init(ms), x, y, r, 'book'), init };
  })();
  G.Mapx.c6Stealth = Stealth;

  // =================================================================================================== shared bits
  const Sc = {};                       // story scenes (filled in below)
  const time = () => V().ch6_time || 0;
  const night = (st) => !!st.flags.ch6_night;
  const deco = (list) => list.map(([t, x, y, extra]) => Object.assign({ t, x, y }, extra || {}));
  // a plain interior room: walls 2 rows on top, 1 cell elsewhere, door gap in the bottom row
  function room(w, h, wall, floor, doorX, doorW = 2) {
    const g = grid(w, h, floor);
    g.rect(0, 0, w, 2, wall); g.rect(0, 0, 1, h, wall); g.rect(w - 1, 0, 1, h, wall); g.rect(0, h - 1, w, 1, wall);
    g.rect(doorX, h - 1, doorW, 1, floor);
    return g;
  }
  const shopkeeperTalk = (lines, goods, title) => async (S, n) => {
    await S.lines(lines, n);
    if (goods) await S.shop(goods, { title });
  };

  // =================================================================================================== 1-0 海線官道
  G.Maps.define('yanshui_road', (() => {
    const g = grid(24, 16, '.');
    g.rect(2, 2, 8, 12, 'p'); g.rect(14, 2, 8, 12, 'p');
    g.rect(2, 7, 8, 1, ':'); g.rect(14, 7, 8, 1, ':');
    g.rect(10, 0, 1, 16, '-');
    g.rect(11, 0, 2, 16, '=');
    return {
      name: '海線官道', subtitle: '正月十四・往南的路', place: 'yanshui',
      bgm: 'pingxi', start: [11, 2],
      light: { ambient: 0.12, color: '#3a2010', tint: 'rgba(255,170,90,0.10)' },
      particles: ['petals'],
      tiles: g.rows(),
      deco: [
        'B nn                 nB',
        'Bp                    B',
        'n                      ',
        'h                     h',
        '                       ',
        'p                     n',
        '                       ',
        'n             w        ',
        '                      p',
        'h                      ',
        '                      h',
        '                       ',
        'p                     n',
        'B                      ',
        'nB      w        w   pB',
        'BB                   BB',
      ],
      objects: deco([['shrine_small', 14, 0, { text: '福德正神' }], ['basket', 13, 4], ['bench', 13, 14]]),
      npcs: [
        { id: 'yr_farmer', sprite: 'villager_m2', name: '插秧的阿伯', x: 5, y: 7, dir: 'down', wander: 2,
          talk: ['正月就插秧？少年仔，這是南部，一年兩冬，早冬稻趁著天暖先插。', '你們往鹽水去？今暗是正月十四，鹽水要放蜂炮喔。衣服穿厚一點！'] },
        { id: 'yr_buffalo', sprite: 'buffalo', name: '水牛', x: 17, y: 7, dir: 'left', wander: 1, talk: ['（水牛慢慢嚼著草，尾巴甩了一下。）'] },
      ],
      events: [
        { id: 'intro', trigger: 'auto', if: (st) => !st.flags.ch6_start, run: (S) => Sc.intro(S) },
        { id: 'north', trigger: 'touch', x: 11, y: 0, w: 2, h: 1, run: async (S) => {
          await S.say('', '回頭是鹿港的方向。今天要趕到鹽水。');
          await S.move('player', 'D');
        } },
      ],
      warps: [{ x: 11, y: 15, w: 2, to: 'yanshui', tx: 15, ty: 1, tdir: 'down' }],
    };
  })());

  // =================================================================================================== 1-1 鹽水・月津
  const YS = { flashes: [], flashT: 0 };
  G.Maps.define('yanshui', (() => {
    const g = grid(44, 34, '.');
    g.rect(0, 0, 1, 34, 'h'); g.rect(43, 0, 1, 34, 'h'); g.rect(0, 0, 44, 1, 'h'); g.rect(0, 33, 44, 1, 'h');
    // 月津港: a half-silted crescent harbour on the west side
    for (let y = 7; y <= 31; y++) {
      const e = 1 + Math.round(5.5 * Math.sin(Math.PI * (y - 7) / 24));
      g.rect(1, y, e, 1, '~');
      if (e >= 1) g.set(e + 1, y, '-');
    }
    g.rect(3, 18, 7, 2, 'k');
    // streets & lanes
    g.rect(20, 7, 3, 27, '#');
    g.rect(13, 2, 17, 9, '%');
    g.rect(14, 0, 2, 2, '#');
    g.rect(8, 12, 33, 2, '#');
    for (const y of [17, 23, 29]) g.rect(8, y, y === 17 ? 35 : 28, 1, ':');
    g.rect(9, 13, 1, 19, ':'); g.rect(34, 13, 1, 17, ':');
    // 大疫塚
    g.rect(35, 21, 8, 11, ',');
    g.rect(20, 33, 3, 1, '#');
    return {
      name: '鹽水', subtitle: (st) => (st.flags.ch6_night ? '正月十四・蜂炮夜' : '月津港・正月十四黃昏'), place: 'yanshui',
      bgm: (st) => (st.flags.ch6_night ? (st.flags.ch6_beehive ? 'festival' : 'procession') : 'city'),
      start: [15, 2],
      light: (st) => (night(st) ? { ambient: 0.58, color: '#0a0c22', playerR: 260, glow: 0.3 } : { ambient: 0.3, color: '#3a1c10', glow: 0.3, tint: 'rgba(255,150,80,0.12)' }),
      particles: (st) => (night(st) ? ['embers', 'lanterns', { type: 'embers', density: 1.5 }] : ['lanterns']),
      lights: () => (YS.plague ? YS.flashes.concat([[14, 18], [27, 24], [33, 30], [37, 22]].map(([x, y]) => ({ x, y, r: 210, color: '#2a4aff', flicker: 0.5 }))) : YS.flashes),
      tiles: g.rows(),
      deco: [
        '',
        ' BB       t                             BB',
        ' b                                     c  ',
        '',
        '',
        '',
        '                                         u',
        '      e                                  ',
        '                                       u ',
        '',
        '       e                               u ',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '                                        d',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '                                    d    ',
        '',
        '',
        '  ee    g                         g   g  ',
        ' eee x   g    x               x    g     ',
      ],
      objects: (st) => deco([
        ['temple', 18, 2, { text: '武廟' }],
        ['house_minnan', 7, 3, { door: false }], ['house_minnan', 31, 3, { door: false }], ['shophouse', 36, 4, { door: false, v: 1 }],
        ['shophouse', 10, 14, { door: false, v: 0 }], ['shophouse', 15, 14, { door: false, v: 2 }],
        ['shophouse', 24, 14, { door: 1, text: '客棧', v: 3 }], ['shophouse', 29, 14, { door: false, v: 1 }], ['shophouse', 35, 14, { door: false, v: 0 }],
        ['house_minnan', 10, 20, { door: false, v: 1 }], ['shophouse', 15, 20, { door: false, v: 3 }],
        ['shophouse', 24, 20, { door: false, v: 2 }], ['house_minnan', 28, 20, { door: false }],
        ['shophouse', 10, 26, { door: false, v: 1 }], ['house_minnan', 14, 26, { door: false, v: 1 }],
        ['shophouse', 24, 26, { door: false, v: 0 }], ['shophouse', 28, 26, { door: false, v: 3 }],
        ['firecracker_tower', 18, 18, { lit: night(st) }], ['firecracker_tower', 23, 18, { lit: night(st) }],
        ['firecracker_tower', 18, 24, { lit: night(st) }], ['firecracker_tower', 23, 24, { lit: night(st) }],
        ['firecracker_tower', 18, 30, { lit: night(st) }], ['firecracker_tower', 23, 30, { lit: night(st) }],
        ['stall', 15, 11, { text: '斗笠', v: 1 }], ['stall', 25, 11, { text: '毛巾', v: 2 }], ['stall', 30, 11, { text: '元宵', v: 0 }],
        ['eternal_lamp', 14, 18], ['eternal_lamp', 27, 24], ['eternal_lamp', 33, 30], ['eternal_lamp', 37, 22],
        ['banner', 14, 8, { color: '#b8241c', text: '忠義' }], ['banner', 28, 8, { color: '#b8241c', text: '忠義' }],
        ['statue_lion', 17, 7], ['statue_lion', 25, 7, { flip: true }],
        ['lantern_string', 20, 9, { w: 3, v: 1 }], ['lantern_string', 20, 15, { w: 3, v: 1 }], ['lantern_string', 20, 21, { w: 3, v: 1 }], ['lantern_string', 20, 27, { w: 3, v: 1 }],
        ['lantern_string', 13, 12, { w: 6, v: 0 }], ['lantern_string', 24, 12, { w: 8, v: 0 }],
        ['boat_small', 2, 15], ['boat_small', 3, 22], ['dock_post', 9, 20], ['crate', 8, 16], ['barrel', 8, 21],
        ['grave', 36, 24], ['grave', 38, 24, { v: 1 }], ['grave', 40, 24], ['grave', 37, 27, { v: 2 }], ['grave', 39, 27], ['grave', 41, 27, { v: 1 }],
        ['well', 31, 18], ['laundry', 12, 24], ['cart', 26, 31], ['basket', 13, 31], ['barrel', 32, 25],
      ]),
      chests: [
        { id: 'c6_01', x: 3, y: 18, item: 'c6_jinchuang2', n: 3 },
        { id: 'c6_02', x: 41, y: 30, item: 'c6_mugwort' },
      ],
      npcs: [
        { id: 'ys_bearer', sprite: 'villager_m2', name: '阿義', x: 23, y: 8, dir: 'left', if: (st) => !st.flags.ch6_night, talk: (S, n) => Sc.ayiTalk(S, n) },
        { id: 'ys_helmet', sprite: 'old_m', name: '賣斗笠的阿伯', x: 17, y: 11, dir: 'down',
          talk: shopkeeperTalk(['外地來的？今暗要看炮，衣服穿厚，斗笠戴好，毛巾包頭，脖子也要包！', '炮城一點，萬炮齊發，像蜂仔出巢——所以叫蜂炮。被炸到的，說是炸掉一年的衰運。'],
            ['c6_bamboo_hat', 'c6_padded_coat', 'c6_wet_towel', 'fengpao', 'bianpao', 'xiancao'], '斗笠攤') },
        { id: 'ys_granny', sprite: 'old_f', name: '阿婆', x: 12, y: 18, dir: 'down', wander: 1, talk: async (S, n) => {
          if (S.has('ch6_beehive')) { await S.lines(['……你們有看到嗎？神轎自己轉過去了。', '八年了。今年，大疫塚那邊，終於安靜了。'], n); return; }
          await S.lines(['八年前那場瘟，每一家都在辦喪事。棺材店的棺材賣到沒有。', '那時候府城長明宮的法師也來了，免錢送藥、免錢送燈。', '……燈是冷的，藥是好的。'], n);
        } },
        { id: 'ys_child', sprite: 'child_m', name: '囝仔', x: 16, y: 9, dir: 'down', wander: 2, talk: async (S, n) => {
          if (S.has('ch6_beehive')) { await S.lines(['我有站最前面喔！我的斗笠被炸出一個洞！', '阿爸說，我今年一定會很旺！'], n); return; }
          await S.lines(['我阿爸說，炮響越大聲，瘟神越不敢來！我要站最前面！'], n);
          await S.say('hongying:serious', '你給我站後面。');
        } },
        { id: 'ys_towel', sprite: 'villager_f', name: '賣毛巾的阿姨', x: 27, y: 11, dir: 'down', talk: ['毛巾要先泡水，包頭包脖子，炮屑才不會鑽進去。', '你們那個道士朋友，看起來最需要包。'] },
        { id: 'ys_v1', sprite: 'villager_f2', name: '鹽水人', x: 26, y: 9, dir: 'left', wander: 2, talk: async (S, n) => {
          if (S.has('ch6_night')) await S.lines(['炮城一座比一座大！今年有一座聽說用了三萬支沖天炮！'], n);
          else await S.lines(['鹽水舊名叫「月津」——你看西邊那個港，彎彎的，像一彎新月。', '以前船很多，現在淤了。不過月亮還是一樣彎。'], n);
        } },
        { id: 'ys_v2', sprite: 'villager_m', name: '鹽水人', x: 22, y: 13, dir: 'down', wander: 2, talk: async (S, n) => {
          if (S.has('ch6_night')) await S.lines(['炮聲越響越好！整條街一起響，就什麼都不怕了！'], n);
          else await S.lines(['外地人？今暗看炮，記得跟著神轎走，不要站在炮城正前面——除非你想很旺。'], n);
        } },
        { id: 'ys_v3', sprite: 'child_f', name: '小女孩', x: 31, y: 13, dir: 'down', wander: 1, talk: ['阿嬤幫我把棉襖縫了三層！我現在像一粒粽子！'] },
        { id: 'ys_fisher', sprite: 'fisherman', name: '老漁夫', x: 8, y: 19, dir: 'left', talk: ['港淤了，大船進不來囉。以前月津港，帆比厝還多。', '月津、月津……月亮的渡口。名字是好名字。'] },
        { id: 'ys_crowd1', sprite: 'villager_m2', name: '扛炮城的人', x: 19, y: 16, dir: 'down', if: night, talk: ['讓讓讓！炮城要過了！'] },
        { id: 'ys_crowd2', sprite: 'pilgrim', name: '跟轎的香客', x: 24, y: 17, dir: 'left', if: night, talk: ['帝君保庇！帝君保庇！'] },
        { id: 'ys_crowd3', sprite: 'villager_f', name: '包著毛巾的阿姨', x: 19, y: 22, dir: 'right', if: night, talk: ['（她全身包得只剩兩隻眼睛，對你們比了一個讚。）'] },
        { id: 'ys_ayi_mother', sprite: 'ghost_f', name: '咳嗽的婦人', x: 38, y: 29, dir: 'down', ghost: true,
          if: (st) => st.flags.ch6_beehive && st.flags.ch6_ayi_met && !st.flags.ch6_ayi_mother, talk: (S, n) => Sc.ayiMother(S, n) },
      ],
      events: [
        { id: 'arrive', trigger: 'auto', if: (st) => st.flags.ch6_start && !st.flags.ch6_arrive_ys, run: (S) => Sc.yanshuiArrive(S) },
        { id: 'ayi_return', trigger: 'touch', x: 20, y: 18, w: 3, h: 10, if: (st) => st.flags.ch6_ayi_mother && !st.flags.ch6_yanshui_done, run: (S) => Sc.ayiReturn(S) },
        { id: 'south', trigger: 'touch', x: 20, y: 32, w: 3, h: 1, run: async (S) => {
          if (S.has('ch6_beehive')) await S.say('yungui:normal', '今晚先在客棧歇一晚。天一亮，往府城。');
          else await S.say('yungui:normal', '往南是府城。……不過，都到鹽水了，不看蜂炮再走？');
          await S.move('player', 'U');
        } },
        { id: 'north', trigger: 'touch', x: 14, y: 0, w: 2, h: 1, if: (st) => st.flags.ch6_night, run: async (S) => {
          await S.say('', '北邊的官道一片漆黑。今晚的熱鬧全在街上。');
          await S.move('player', 'D');
        } },
      ],
      warps: [
        { x: 21, y: 6, to: 'yanshui_temple', tx: 7, ty: 10, tdir: 'up', door: true },
        { x: 25, y: 16, to: 'yanshui_inn', tx: 6, ty: 8, tdir: 'up', door: true },
        { x: 14, y: 0, w: 2, to: 'yanshui_road', tx: 11, ty: 14, tdir: 'up', if: (st) => !st.flags.ch6_night },
      ],
      onUpdate: (dt, ms) => {
        if (!G.state.flags.ch6_night) { YS.flashes.length = 0; return; }
        YS.flashT -= dt;
        for (const f of YS.flashes) f.life -= dt;
        for (let i = YS.flashes.length - 1; i >= 0; i--) if (YS.flashes[i].life <= 0) YS.flashes.splice(i, 1);
        if (YS.flashT <= 0) {
          YS.flashT = U.rand(0.5, 1.5);
          const towers = ms.objects.filter((o) => o.t === 'firecracker_tower');
          const o = U.pick(towers);
          if (o) {
            YS.flashes.push({ x: o.x + U.rand(-1, 2), y: o.y - U.rand(0, 2), r: U.rand(160, 260), color: U.pick(['#fff4c0', '#ffd27a', '#ffe8a0']), flicker: 0.5, life: 0.25 });
            const p = ms.player;
            if (Math.hypot(o.x - p.x, o.y - p.y) < 10 && Math.random() < 0.5) G.Audio.sfx(Math.random() < 0.5 ? 'fire' : 'crit');
          }
        }
      },
      drawOver: (ctx, t, ms) => {
        if (YS.fog > 0) {
          // 疫聚: a coughing grey mist full of faces over the mound
          const cx = 38 * T + 32, cy = 26 * T;
          ctx.save();
          for (let i = 0; i < 14; i++) {
            const a = i * 2.4 + t * 0.3, r = 70 + (i % 5) * 26;
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.5 + Math.sin(t * 1.3 + i) * 8;
            const gr = ctx.createRadialGradient(x, y, 0, x, y, 120);
            gr.addColorStop(0, 'rgba(170,176,186,0.42)'); gr.addColorStop(1, 'rgba(120,126,136,0)');
            ctx.fillStyle = gr; ctx.fillRect(x - 120, y - 120, 240, 240);
          }
          for (let i = 0; i < 9; i++) {
            const x = cx + Math.cos(i * 1.7 + t * 0.4) * 120, y = cy - 40 + Math.sin(i * 2.3 + t * 0.5) * 60;
            ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2 + i);
            ctx.fillStyle = '#d8dce4';
            ctx.beginPath(); ctx.ellipse(x, y, 14, 18, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#2a2a34';
            ctx.beginPath(); ctx.arc(x - 5, y - 4, 2.5, 0, Math.PI * 2); ctx.arc(x + 5, y - 4, 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(x, y + 7, 3, 4 + Math.sin(t * 6 + i) * 2, 0, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
      },
    };
  })());

  // =================================================================================================== 1-2 鹽水武廟
  G.Maps.define('yanshui_temple', (() => {
    const g = room(16, 12, 'E', 'T', 7);
    return {
      name: '鹽水武廟', subtitle: '關聖帝君・忠義千秋', place: 'yanshui', bgm: 'temple', start: [7, 10],
      light: { ambient: 0.32, color: '#1a0a06', glow: 0.35 },
      particles: ['dust'],
      tiles: g.rows(),
      objects: (st) => deco([
        ['altar', 7, 2], ['incense_burner', 7, 4], ['mural', 2, 1, { v: 1 }], ['mural', 12, 1, { v: 2 }],
        ['pillar', 3, 3], ['pillar', 12, 3], ['pillar', 3, 8], ['pillar', 12, 8],
        ['brazier', 1, 2], ['brazier', 14, 2], ['banner', 5, 2, { color: '#b8241c', text: '忠義' }], ['banner', 10, 2, { color: '#b8241c', text: '千秋' }],
        ['drum_rack', 1, 6], ['bell', 14, 6], ['divination_blocks', 5, 4], ['fortune_sticks', 10, 4],
      ].concat(st.flags.ch6_night ? [] : [['palanquin', 9, 6, { still: true }]])),
      npcs: [
        { id: 'ys_keeper', sprite: 'temple_keeper', name: '林伯', x: 6, y: 5, dir: 'down', talk: (S, n) => Sc.keeperTalk(S, n) },
        { id: 'ys_b1', sprite: 'villager_m2', name: '轎夫', x: 12, y: 7, dir: 'left', if: (st) => !st.flags.ch6_night, talk: ['紅巾綁緊，等一下轎一起，就不能停了。'] },
        { id: 'ys_b2', sprite: 'villager_m', name: '轎夫', x: 8, y: 8, dir: 'right', if: (st) => !st.flags.ch6_night, talk: ['扛帝君的轎，肩膀會腫三天。值得啦。'] },
      ],
      events: [
        { id: 'story', trigger: 'auto', if: (st) => !st.flags.ch6_yanshui, run: (S) => Sc.temple(S) },
        { id: 'altar', trigger: 'action', x: 7, y: 2, w: 2, h: 1, label: '參拜', run: async (S) => {
          await S.say('', '神案上，關聖帝君的神像紅面長鬚，神威凜凜。香煙一縷一縷往上飄。');
          await S.say('xinghe:serious', '（……帝君，今晚請保佑鹽水。也保佑我們。）');
        } },
      ],
      warps: [{ x: 7, y: 11, w: 2, to: 'yanshui', tx: 21, ty: 7, tdir: 'down', door: true }],
    };
  })());

  // =================================================================================================== 鹽水客棧
  G.Maps.define('yanshui_inn', (() => {
    const g = room(14, 10, 'W', '_', 6);
    return {
      name: '鹽水客棧', place: 'yanshui', bgm: (st) => (st.flags.ch6_night ? 'festival' : 'city'), start: [6, 8],
      light: (st) => (st.flags.ch6_night ? { ambient: 0.4, color: '#100a14' } : { ambient: 0.15, color: '#2a1408' }),
      tiles: g.rows(),
      objects: deco([
        ['counter', 5, 4], ['shelf_lanterns', 8, 2], ['stairs_up', 11, 2], ['plant_pot', 1, 2, { v: 1 }],
        ['table', 2, 6], ['chair', 1, 6, { dir: 'right' }], ['table', 10, 6], ['chair', 11, 6, { dir: 'left' }],
        ['rug', 5, 6, { w: 3, h: 2 }], ['jar', 12, 8], ['barrel', 1, 8],
      ]),
      npcs: [
        { id: 'ys_innkeeper', sprite: 'shopkeeper_f', name: '客棧老闆娘', x: 6, y: 3, dir: 'down', talk: (S, n) => Sc.yanshuiInn(S, n) },
        { id: 'ys_guest', sprite: 'merchant', name: '住客', x: 10, y: 5, dir: 'down', talk: ['我從台南來做生意，每年元宵都住這。', '老闆娘說窗仔要關緊——去年有一支炮飛進來，把我的帽子燒了一個洞。'] },
      ],
      warps: [{ x: 6, y: 9, w: 2, to: 'yanshui', tx: 25, ty: 17, tdir: 'down', door: true }],
    };
  })());

  // =================================================================================================== 1-3 府城
  const FC_LIGHT = [
    { ambient: 0.04, color: '#1a1410' },
    { ambient: 0.32, color: '#3a1810', glow: 0.32, tint: 'rgba(255,140,70,0.13)' },
    { ambient: 0.52, color: '#0a1028', playerR: 240, glow: 0.3 },
  ];
  G.Maps.define('fucheng', (() => {
    const g = grid(60, 46, ':');
    g.rect(0, 0, 60, 1, 'h'); g.rect(0, 45, 60, 1, 'h');
    // 長明宮前埕 (NW)
    g.rect(0, 0, 14, 4, 'E'); g.rect(0, 4, 14, 14, '%');
    g.rect(14, 0, 1, 11, 'h');
    // 五條港
    g.rect(15, 0, 16, 3, '~');
    for (const cx of [15, 18, 21, 24, 27]) g.rect(cx, 3, 2, 5, '~');
    for (const dx of [17, 20, 23, 26]) g.rect(dx, 3, 1, 5, 'k');
    g.rect(29, 3, 2, 5, 'k'); g.rect(15, 8, 16, 2, 'k');
    // streets
    g.rect(31, 0, 2, 45, '#');
    g.rect(33, 1, 11, 7, '%');
    g.rect(42, 13, 10, 4, '%');
    g.rect(14, 17, 46, 2, '#');
    g.rect(14, 24, 46, 1, '=');
    // 孔廟 enclosure (SE)
    g.rect(42, 26, 18, 2, 'R'); g.rect(42, 26, 1, 19, 'R'); g.rect(43, 28, 17, 17, '.'); g.rect(50, 26, 2, 2, '%');
    g.rect(50, 28, 2, 6, '%');
    // 城西 grass and the 林投林 path
    g.rect(0, 19, 14, 26, '.'); g.rect(0, 40, 31, 2, ':');
    g.rect(44, 1, 16, 7, '.'); g.rect(43, 8, 8, 5, '.');
    return {
      name: '府城', subtitle: (st) => ['元宵・午後', '元宵・黃昏', '元宵夜・千燈長明'][st.vars.ch6_time || 0], place: 'tainan',
      bgm: (st) => ((st.vars.ch6_time || 0) >= 2 ? 'festival' : 'tainan'), start: [31, 1],
      light: (st) => FC_LIGHT[st.vars.ch6_time || 0],
      particles: (st) => [['motes'], ['lanterns'], ['lanterns', 'embers']][st.vars.ch6_time || 0],
      tiles: g.rows(),
      deco: [
        '',
        '                                              t   a    k   ',
        '                                         L   L        u   ',
        '                                                 c       t ',
        '                                                          ',
        '                                             u        a    ',
        '                                                           ',
        '                                               k        u  ',
        '                                                           ',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        ' x    u      ',
        '',
        '            g',
        '  x      ',
        '',
        '     g        ',
        '',
        '  e     ',
        '',
        ' g     e   ',
        '',
        '            e',
        '                                                           ',
        '    g   ',
        '                                                           ',
        '   e        ',
        '                                                       c   ',
        ' P          ',
        '   P    e   ',
        '  g     ',
        '',
        '',
        '',
        '    P   x  ',
        ' e   P      ',
        '  P     e  ',
      ],
      objects: (st) => {
        const tm = st.vars.ch6_time || 0;
        const list = [
          ['gate_city', 5, 2, { text: '長明' }], ['pavilion', 1, 7],
          ['eternal_lamp', 2, 5], ['eternal_lamp', 11, 5], ['eternal_lamp', 2, 14], ['eternal_lamp', 11, 14], ['eternal_lamp', 6, 16],
          ['eternal_lamp', 4, 20], ['eternal_lamp', 9, 26], ['eternal_lamp', 3, 33], ['eternal_lamp', 10, 37], ['eternal_lamp', 6, 43], ['eternal_lamp', 13, 30],
          ['lantern_string', 1, 4, { w: 12, v: 2 }], ['lantern_string', 4, 11, { w: 4, v: 2 }],
          ['boat_small', 15, 4], ['boat_small', 18, 6], ['boat_small', 21, 3], ['boat_small', 24, 5], ['boat_small', 27, 4],
          ['crate', 16, 8], ['barrel', 19, 8], ['crate', 25, 8], ['crate', 26, 8], ['barrel', 28, 8], ['dock_post', 17, 2], ['signboard', 30, 10, { text: '五條港' }],
          ['house_minnan', 16, 11], ['stall', 20, 14, { text: '肉粽', v: 0 }],
          ['house_minnan', 24, 11, { v: 1 }], ['signboard', 29, 12, { text: '七娘媽廟', v: 1 }], ['incense_burner', 29, 14],
          ['chikan_tower', 35, 2], ['stone_lantern', 34, 6], ['stone_lantern', 40, 6], ['signboard', 41, 4, { text: '赤崁樓' }],
          ['mazu_temple', 44, 9, { door: 2, text: '大天后宮' }], ['statue_lion', 44, 13], ['statue_lion', 49, 13, { flip: true }],
          ['tree_banyan', 36, 10], ['bench', 34, 13],
          ['stall', 34, 15, { text: '燈籠', v: 2 }],
          ['shophouse', 52, 14, { door: 1, text: '客棧', v: 3 }], ['shophouse', 56, 14, { door: 1, text: '藥鋪', v: 1 }],
          ['stall', 35, 19, { text: '虱目魚粥', v: 0 }], ['stall', 39, 19, { text: '碗粿', v: 1 }], ['stall', 43, 19, { text: '元宵', v: 2 }], ['stall', 47, 19, { text: '金紙', v: 0 }],
          ['shophouse', 34, 21, { door: 1, text: '武館', v: 2 }], ['shophouse', 39, 21, { door: false, text: '布莊', v: 0 }], ['house_minnan', 44, 21, { door: false }],
          ['shophouse', 50, 21, { door: false, v: 1 }], ['shophouse', 55, 21, { door: false, v: 3 }],
          ['house_minnan', 15, 21, { door: false, v: 1 }], ['shophouse', 21, 21, { door: false, v: 2 }], ['shophouse', 26, 21, { door: false, v: 0 }],
          ['house_minnan', 16, 27, { door: false }], ['shophouse', 23, 27, { door: false, v: 1 }], ['house_minnan', 15, 33, { door: false, v: 1 }],
          ['shophouse', 24, 33, { door: false, v: 3 }], ['well', 21, 31], ['laundry', 19, 37], ['basket', 27, 30], ['cart', 26, 38],
          ['paifang', 49, 25, { text: '全臺首學', v: 1 }], ['temple', 48, 35, { text: '大成殿' }], ['tree_banyan', 44, 29], ['tree_banyan', 55, 30],
          ['signboard', 12, 39, { text: '林投林' }],
          ['lantern_string', 31, 16, { w: 2, v: 1 }], ['lantern_string', 36, 17, { w: 8, v: 1 }], ['lantern_string', 46, 17, { w: 8, v: 1 }], ['lantern_string', 18, 17, { w: 10, v: 1 }],
          ['red_lantern', 23, 16, { hang: true }], ['red_lantern', 33, 16, { hang: true }],
        ];
        if (tm >= 1) list.push(['sky_lantern', 40, 9, { v: 1 }], ['sky_lantern', 20, 15], ['sky_lantern', 53, 11, { v: 2 }]);
        if (tm >= 2) list.push(['sky_lantern', 8, 9, { v: 2 }], ['sky_lantern', 44, 4], ['lantern_string', 1, 13, { w: 12, v: 2 }]);
        return deco(list);
      },
      pass: [{ x: 6, y: 2, h: 2, solid: true }],
      chests: [{ id: 'c6_03', x: 30, y: 8, item: 'c6_ningshen', n: 3, run: async (S) => { S.gold(800); } }],
      npcs: [
        { id: 'fc_guard', sprite: 'temple_guard', name: '長明宮守門衛', x: 6, y: 4, dir: 'down', fixedDir: true, talk: (S) => Sc.fcGuard(S) },
        { id: 'fc_guard2', sprite: 'temple_guard', name: '長明宮守門衛', x: 8, y: 4, dir: 'down', fixedDir: true, if: (st) => (st.vars.ch6_time || 0) >= 2, talk: ['大典進行中。閒雜人等，退後。'] },
        ...[
          ['我阿嬤去年過身，今年我要替她點一盞，她就不會孤單了。'],
          ['法師是活菩薩！我阿爸做噩夢做了十年，法師一來就好了！'],
          ['三兩銀……我做了半年才存到。可是值得。'],
          ['聽說今暗大典，法師會親手點那盞最大的燈。全府城都看得到！'],
          ['我排了兩天了。……你們插隊的話，我會生氣喔。'],
          ['阿弟走的時候才七歲。我怕我老了，就記不得他的臉了。'],
        ].map((talk, i) => ({
          id: 'fc_q' + (i + 1), sprite: ['villager_f', 'villager_m', 'old_f', 'villager_m2', 'villager_f2', 'old_m'][i], name: '排隊的人',
          x: 9, y: 6 + i, dir: 'up', if: (st) => (st.vars.ch6_time || 0) < 2, talk: async (S, n) => { await S.lines(talk, n); await Sc.queueBaizhi(S); },
        })),
        ...[[3, 12, 'villager_f'], [5, 13, 'child_m'], [10, 10, 'villager_m'], [12, 8, 'old_f'], [7, 11, 'villager_f2'], [4, 15, 'villager_m2']].map(([x, y, sp], i) => ({
          id: 'fc_n' + (i + 1), sprite: sp, name: '看大典的人', x, y, dir: 'up', if: (st) => (st.vars.ch6_time || 0) >= 2,
          talk: [['看！法師要點燈了！', '好亮……好冷的光。可是好亮。', '阿娘，那是阿公的燈嗎？', '法師說，點了燈的人，就永遠不會被忘記。', '……我總覺得那些燈在看我。', '大典完了要去吃元宵！'][i]],
        })),
        { id: 'fc_stage', sprite: 'yexuan', name: '台上的法師', x: 2, y: 9, dir: 'down', fixedDir: true, if: (st) => (st.vars.ch6_time || 0) >= 2,
          talk: ['（高台太遠，人群又太擠。只看得見一個素黑長袍的身影，舉著一盞冷藍的燈。）'] },
        { id: 'fc_dock', sprite: 'villager_m2', name: '五條港 大頭', x: 23, y: 9, dir: 'down', talk: (S, n) => Sc.dockTalk(S, n) },
        { id: 'fc_rouzong', sprite: 'old_m', name: '肉粽伯', x: 22, y: 14, dir: 'left', talk: (S, n) => Sc.rouzongTalk(S, n) },
        { id: 'fc_lantern', sprite: 'merchant', name: '燈籠攤', x: 36, y: 15, dir: 'down', talk: ['元宵燈籠！兔子燈、鯉魚燈、走馬燈！', '小姐要不要一盞？……啊，你們手上那盞兔子燈，是鹿港施師傅的手藝吧？好眼光。'] },
        { id: 'fc_fishporridge', sprite: 'shopkeeper_f', name: '粥攤阿姨', x: 37, y: 19, dir: 'down',
          talk: shopkeeperTalk(['府城人早上吃虱目魚粥，魚是台江魚塭養的，新鮮！', '下午也有喔，元宵嘛，整日都是早上。'], ['shimuyu', 'c6_zongzi', 'c6_herb_tea'], '虱目魚粥攤') },
        { id: 'fc_wanguo', sprite: 'villager_f2', name: '碗粿攤', x: 41, y: 19, dir: 'down',
          talk: shopkeeperTalk(['碗粿淋醬油膏，鹹粿煎兩面——府城的味道！'], ['wanguo', 'c6_salty_cake', 'fenglisu'], '碗粿攤') },
        { id: 'fc_yuanxiao', sprite: 'shopkeeper_f', name: '元宵攤', x: 45, y: 19, dir: 'down', talk: (S, n) => Sc.yuanxiaoTalk(S, n) },
        { id: 'fc_paper', sprite: 'merchant', name: '金紙店老闆', x: 49, y: 19, dir: 'down', talk: async (S, n) => {
          if (S.has('ch6_sixteen')) await S.lines(['那座備用的亭仔，有派上用場就好。七娘媽會歡喜的。'], n);
          else await S.lines(['七娘媽亭？阿進他們家訂的那座，今早剛糊好。', '我順手多糊了一座備用的。做十六歲，萬一有什麼差錯，可不能重來。'], n);
        } },
        { id: 'fc_kid', sprite: 'child_f', name: '提燈的小孩', x: 44, y: 16, dir: 'down', wander: 2, talk: async (S, n) => {
          if ((S.vars().ch6_time || 0) >= 1) await S.lines(['天暗了！可以點燈籠了！我的是鯉魚燈！'], n);
          else await S.lines(['阿爸說天暗了才可以點燈籠。天怎麼還不暗啦！'], n);
        } },
        { id: 'fc_v1', sprite: 'villager_f2', name: '府城人', x: 28, y: 18, dir: 'left', wander: 2, talk: ['「一府二鹿三艋舺」——府城是頭一個。我們府城人，講話都比較慢，因為什麼都不急。', '……除了吃。'] },
        { id: 'fc_v2', sprite: 'old_m', name: '阿伯', x: 17, y: 25, dir: 'down', wander: 2, talk: async (S, n) => {
          if (S.has('ch6_linto_in')) await S.lines(['西南邊的林投林？今暗……好像比較安靜。'], n);
          else await S.lines(['西南邊那片林投林，暗時莫去。', '海風吹過林投葉，聽起來像女人在哭。……有人說，那就是女人在哭。'], n);
        } },
        { id: 'fc_v3', sprite: 'scholar', name: '書生', x: 46, y: 25, dir: 'down', wander: 1, talk: ['孔廟裡有一塊匾，寫「全臺首學」。我每次經過都要停下來看一下，好像看了就會考上。', '……目前還沒考上。'] },
        { id: 'fc_v4', sprite: 'fisher_f', name: '補網的阿姨', x: 22, y: 10, dir: 'down', talk: ['五條港一條水道一個姓、一個郊。我們這條是鄭家的。', '鄭家阿進今天做十六歲喔，下午去七娘媽廟看熱鬧！'] },
      ],
      events: [
        { id: 'arrive', trigger: 'auto', if: (st) => st.flags.ch6_fucheng && !st.flags.ch6_fc_arrive, run: (S) => Sc.fuchengArrive(S) },
        { id: 'moya', trigger: 'touch', x: 1, y: 4, w: 13, h: 7, if: (st) => st.flags.ch6_fucheng && !st.flags.ch6_moya, run: (S) => Sc.moya(S) },
        { id: 'rouzong', trigger: 'touch', x: 19, y: 13, w: 5, h: 3, if: (st) => st.flags.ch6_sixteen && !st.flags.ch6_rouzong, run: (S) => Sc.rouzong(S) },
        { id: 'linto_block', trigger: 'touch', x: 2, y: 40, w: 1, h: 2, if: (st) => !st.flags.ch6_rouzong, run: async (S) => {
          await S.say('yungui:normal', '這條小路往西南的荒地去。……現在沒有理由去那邊。');
          await S.move('player', 'R');
        } },
        { id: 'north_gate', trigger: 'touch', x: 31, y: 0, w: 2, h: 1, run: async (S) => {
          await S.say('', '往北是回鹽水的官道。今天不回頭。');
          await S.move('player', 'D');
        } },
        { id: 'chikan_sign', trigger: 'action', x: 41, y: 4, label: '看', run: async (S) => { await S.say('', '「赤崁樓」——荷蘭人的普羅民遮城，上面蓋著海神廟與文昌閣。'); } },
      ],
      warps: [
        { x: 37, y: 5, to: 'fc_chikan', tx: 13, ty: 20, tdir: 'up', door: true },
        { x: 46, y: 12, w: 2, to: 'fc_mazu', tx: 11, ty: 16, tdir: 'up', door: true },
        { x: 18, y: 13, to: 'fc_zheng', tx: 6, ty: 8, tdir: 'up', door: true },
        { x: 26, y: 13, to: 'fc_qiniang', tx: 7, ty: 10, tdir: 'up', door: true },
        { x: 53, y: 16, to: 'fc_inn', tx: 6, ty: 8, tdir: 'up', door: true },
        { x: 57, y: 16, to: 'fc_herb', tx: 5, ty: 7, tdir: 'up', door: true },
        { x: 35, y: 23, to: 'fc_shop', tx: 5, ty: 7, tdir: 'up', door: true },
        { x: 50, y: 26, w: 2, to: 'fc_confucius', tx: 13, ty: 20, tdir: 'up' },
        { x: 0, y: 40, h: 2, to: 'linto', tx: 18, ty: 34, tdir: 'up', if: (st) => !!st.flags.ch6_rouzong },
      ],
    };
  })());

  // =================================================================================================== 1-4 赤崁樓
  G.Maps.define('fc_chikan', (() => {
    const g = grid(28, 22, '%');
    g.rect(0, 0, 28, 2, 'R'); g.rect(0, 0, 1, 22, 'R'); g.rect(27, 0, 1, 22, 'R'); g.rect(0, 21, 28, 1, 'R'); g.rect(13, 21, 2, 1, '%');
    for (const [x0, x1] of [[2, 4], [8, 10], [15, 17], [21, 23]]) g.rect(x0, 8, x1 - x0 + 1, 1, 'R');
    g.rect(1, 12, 4, 9, '.'); g.rect(23, 12, 4, 9, '.');
    return {
      name: '赤崁樓', subtitle: '普羅民遮城舊基・海神廟與文昌閣', place: 'tainan', bgm: 'tainan', start: [13, 20],
      light: (st) => ((st.vars.ch6_time || 0) >= 1 ? { ambient: 0.26, color: '#3a1408', tint: 'rgba(255,120,60,0.16)', glow: 0.3 } : { ambient: 0.04 }),
      particles: (st) => ((st.vars.ch6_time || 0) >= 1 ? ['lanterns'] : ['motes']),
      tiles: g.rows(),
      objects: deco([
        ['chikan_tower', 4, 3], ['chikan_tower', 17, 3, { v: 1 }], ['stone_lantern', 11, 4], ['stone_lantern', 14, 4],
        ['lantern_string', 15, 10, { w: 9, v: 1 }], ['signboard', 16, 11, { text: '燈謎' }], ['signboard', 23, 11, { text: '燈謎' }],
        ['tree_banyan', 1, 13], ['tree_banyan', 24, 13],
        ['grave', 7, 15, { v: 2 }], ['grave', 9, 15, { v: 2 }], ['grave', 11, 15, { v: 2 }], ['grave', 7, 17, { v: 2 }], ['grave', 9, 17, { v: 2 }], ['grave', 11, 17, { v: 2 }],
        ['flowers', 18, 16], ['flowers', 20, 18], ['bush', 16, 19], ['bush', 22, 19],
      ]),
      chests: [{ id: 'c6_05', x: 5, y: 19, item: 'c6_chikan_amulet' }],
      npcs: [
        { id: 'fc_riddle', sprite: 'storyteller', name: '燈謎攤 文伯', x: 19, y: 11, dir: 'down', talk: (S) => Sc.riddles(S) },
        { id: 'fc_ck_v1', sprite: 'villager_f', name: '遊客', x: 20, y: 16, dir: 'left', wander: 2, talk: ['底下那層紅磚，比我阿祖的阿祖還老。', '荷蘭人走了，磚還在。磚上面蓋了廟，廟裡拜海神。……府城就是這樣疊起來的。'] },
      ],
      events: [
        { id: 'story', trigger: 'auto', if: (st) => !st.flags.ch6_chikan, run: (S) => Sc.chikan(S) },
        { id: 'haishen', trigger: 'action', x: 6, y: 6, label: '看', run: async (S) => { await S.say('', '海神廟。供奉海神的小樓，簷角翹得高高的，像要飛向台江。'); } },
        { id: 'wenchang', trigger: 'action', x: 19, y: 6, label: '看', run: async (S) => { await S.say('', '文昌閣。讀書人在這裡拜文昌帝君，求考運。門口掛滿了燈謎。'); } },
        { id: 'bixi', trigger: 'action', x: 9, y: 15, label: '調查', run: async (S) => {
          await S.say('', '一塊石碑，底下馱著一隻像烏龜的石獸——贔屭。龍的九個兒子之一，力氣最大，喜歡背重物。');
          await S.say('baizhi:think', '牠背了這麼久，不會累嗎？');
          await S.say('yungui:smile', '所以大家都會摸摸牠的頭。摸一下，就是替牠分擔一點。');
          await S.say('', '白芷伸手，輕輕摸了摸贔屭的頭。');
        } },
      ],
      warps: [{ x: 13, y: 21, w: 2, to: 'fucheng', tx: 37, ty: 6, tdir: 'down' }],
    };
  })());

  // =================================================================================================== 1-5 大天后宮
  G.Maps.define('fc_mazu', (() => {
    const g = room(24, 18, 'E', 'T', 11);
    g.rect(16, 2, 1, 15, 'E'); g.rect(16, 7, 1, 2, 'T');
    return {
      name: '大天后宮', subtitle: '媽祖與月下老人', place: 'tainan', bgm: 'temple', start: [11, 16],
      light: { ambient: 0.32, color: '#1a0a06', glow: 0.35 },
      particles: ['dust'],
      tiles: g.rows(),
      objects: deco([
        ['altar', 11, 2], ['incense_burner', 11, 5], ['mural', 3, 1, { v: 3 }], ['mural', 13, 1, { v: 0 }],
        ['pillar', 6, 4], ['pillar', 14, 4], ['pillar', 6, 11], ['pillar', 14, 11],
        ['red_lantern', 8, 2, { hang: true }], ['red_lantern', 15, 2, { hang: true }], ['brazier', 1, 2], ['fortune_sticks', 9, 3], ['divination_blocks', 14, 3],
        ['altar', 19, 3], ['divination_blocks', 18, 5], ['table', 21, 5], ['red_lantern', 22, 2, { hang: true }], ['plant_pot', 17, 15, { v: 2 }],
      ]),
      npcs: [
        { id: 'fc_mazu_keeper', sprite: 'temple_keeper', name: '廟公', x: 20, y: 7, dir: 'left', talk: async (S, n) => {
          if (S.has('ch6_yuelao')) await S.lines(['紅線綁好了嗎？月老會記得的。', '……少年仔，心裡知道答案的事，要記得說出口。'], n);
          else await S.lines(['來拜月老的？月老牽紅線，有緣千里來相會。'], n);
        } },
        { id: 'fc_mz_v1', sprite: 'old_f', name: '拜拜的阿嬤', x: 8, y: 9, dir: 'up', wander: 1, talk: ['媽祖婆保庇討海人。我翁婿出海四十年，每次都是媽祖婆帶他回來的。', '……最後一次，也是。他是在厝裡睏著走的。'] },
        { id: 'fc_mz_v2', sprite: 'villager_f', name: '香客', x: 13, y: 13, dir: 'up', talk: ['大天后宮以前是王府喔。後來才改成拜媽祖。', '府城的東西，都是一層疊一層的。'] },
      ],
      events: [
        { id: 'yuelao', trigger: 'touch', x: 17, y: 7, w: 1, h: 2, if: (st) => !st.flags.ch6_yuelao, run: (S) => Sc.yuelao(S) },
        { id: 'altar', trigger: 'action', x: 11, y: 2, w: 2, h: 1, label: '參拜', run: async (S) => {
          await S.say('', '正殿的神案上香煙繚繞。媽祖的神像隱在帳幔後面，只看得見一盞長明的油燈。');
          await S.say('baizhi:think', '……這盞燈是暖的。');
        } },
      ],
      warps: [{ x: 11, y: 17, w: 2, to: 'fucheng', tx: 46, ty: 13, tdir: 'down', door: true }],
    };
  })());

  // =================================================================================================== 1-6 孔廟
  G.Maps.define('fc_confucius', (() => {
    const g = grid(28, 22, '.');
    g.rect(0, 0, 28, 2, 'R'); g.rect(0, 0, 1, 22, 'R'); g.rect(27, 0, 1, 22, 'R'); g.rect(0, 21, 28, 1, 'R'); g.rect(13, 21, 2, 1, '%');
    g.rect(13, 2, 2, 19, '%'); g.rect(2, 11, 24, 1, '%');
    g.rect(9, 15, 10, 1, 'l'); g.rect(8, 16, 12, 1, 'l'); g.rect(9, 17, 10, 1, 'l');
    g.rect(13, 15, 2, 3, 'B');
    return {
      name: '孔廟', subtitle: '全臺首學', place: 'tainan', bgm: 'tainan', start: [13, 20],
      light: (st) => ((st.vars.ch6_time || 0) >= 1 ? { ambient: 0.28, color: '#2a1410', tint: 'rgba(255,140,80,0.1)' } : { ambient: 0.1, color: '#101010' }),
      particles: ['leaves'],
      tiles: g.rows(),
      deco: ['', '', '                         a', '', '', '                          ', '  w', '', '', '', '', '', '', '', '', '', '', '', '   u                  u', '  u     g        g     u', ''],
      objects: deco([
        ['temple', 10, 2, { text: '大成殿' }], ['tree_banyan', 2, 3], ['tree_banyan', 22, 3],
        ['bell_tower', 3, 13], ['bell_tower', 22, 13], ['stone_lantern', 11, 8], ['stone_lantern', 16, 8], ['signboard', 11, 19, { text: '全臺首學' }],
      ]),
      pass: [{ x: 13, y: 6, solid: true }],
      npcs: [
        { id: 'fc_scholar', sprite: 'scholar', name: '陳秀才', x: 17, y: 9, dir: 'down', wander: 1, talk: (S, n) => Sc.scholarTalk(S, n) },
        { id: 'fc_cf_v1', sprite: 'villager_m', name: '府學生', x: 6, y: 10, dir: 'down', wander: 1, talk: ['噓——夫子廟裡要安靜。', '……你們剛剛走路很大聲。'] },
      ],
      events: [
        { id: 'hall', trigger: 'action', x: 13, y: 6, label: '看', run: async (S) => {
          await S.say('', '大成殿裡沒有神像，只有一塊塊木頭牌位，寫著至聖先師與歷代先賢的名字。');
          await S.say('', '殿裡很暗，很靜。只有名字。');
          await S.say('baizhi:think', '……只有名字，也是一種記得嗎？');
          await S.say('yungui:normal', '對讀書人來說，名字後面還有書。書還在，人就沒有完全走。');
        } },
        { id: 'inkstone', trigger: 'action', x: 12, y: 16, label: '調查', if: (st) => !st.flags.ch6_inkstone, run: async (S) => {
          S.flag('ch6_inkstone');
          await S.say('', '泮池的橋墩旁，水底下有一個方方的東西。撈起來——是一方硯台。');
          await S.say('xinghe:surprise', '至聖先師的硯台！？');
          await S.say('yungui:smug', '上面刻著「陳記・三十七次落第紀念」。……是那個秀才的。');
          await S.give('c6_inkstone');
        } },
      ],
      warps: [{ x: 13, y: 21, w: 2, to: 'fucheng', tx: 50, ty: 25, tdir: 'down' }],
    };
  })());

  // =================================================================================================== 1-7 七娘媽廟
  G.Maps.define('fc_qiniang', (() => {
    const g = grid(16, 12, '%');
    g.rect(0, 0, 16, 2, 'E'); g.rect(0, 0, 1, 12, 'R'); g.rect(15, 0, 1, 12, 'R'); g.rect(0, 11, 16, 1, 'R'); g.rect(7, 11, 2, 1, '%');
    return {
      name: '七娘媽廟', subtitle: '做十六歲', place: 'tainan', bgm: (st) => (st.flags.ch6_sixteen_rite ? 'pingxi' : 'love'), start: [7, 10],
      light: { ambient: 0.1, color: '#201010', tint: 'rgba(255,200,170,0.08)' },
      particles: ['petals'],
      tiles: g.rows(),
      objects: (st) => deco([
        ['house_minnan', 5, 2, { v: 1 }], ['signboard', 11, 3, { text: '七娘媽廟', v: 1 }], ['incense_burner', 3, 6],
        ['table', 10, 5, { w: 3 }], ['red_lantern', 4, 2, { hang: true }], ['red_lantern', 10, 2, { hang: true }],
        ['flowers', 1, 9], ['flowers', 14, 9], ['plant_pot', 1, 3, { v: 1 }], ['plant_pot', 14, 3, { v: 2 }],
      ].concat(st.flags.ch6_sixteen ? [] : [['qixi_pavilion', 7, 7]])),
      pass: [{ x: 7, y: 4, solid: true }],
      npcs: [
        { id: 'fc_qn_keeper', sprite: 'old_f', name: '廟婆', x: 4, y: 4, dir: 'down', talk: async (S, n) => {
          if (S.has('ch6_sixteen')) await S.lines(['姑娘，妳已經出婆姐間了。以後的路，自己走，也要讓人陪著走。'], n);
          else await S.lines(['今仔日下晡，鄭家的阿進要做十六歲。你們若無事，等一下來看熱鬧。'], n);
        } },
        { id: 'fc_zhengsao', sprite: 'villager_f', name: '鄭嫂', x: 6, y: 8, dir: 'right', if: (st) => !st.flags.ch6_sixteen, talk: ['阿進這囝仔，衣領又歪了……'] },
        { id: 'fc_ajin', sprite: 'villager_m', name: '阿進', x: 5, y: 9, dir: 'up', if: (st) => !st.flags.ch6_sixteen, talk: ['我、我很緊張……要鑽三次。阿母說不能跌倒。'] },
        { id: 'fc_zhengfa', sprite: 'villager_m2', name: '鄭阿爸', x: 10, y: 8, dir: 'left', if: (st) => !st.flags.ch6_sixteen, talk: ['我十六歲那年，也是在這裡鑽的。……一眨眼。'] },
      ],
      events: [
        { id: 'sixteen', trigger: 'auto', if: (st) => st.flags.ch6_moya && !st.flags.ch6_sixteen, run: (S) => Sc.sixteen(S) },
        { id: 'altar', trigger: 'action', x: 7, y: 4, label: '參拜', run: async (S) => {
          await S.say('', '小廟裡供著七尊小小的七娘媽神像。她們守著府城的囝仔，一直到十六歲。');
          if (S.has('ch6_sixteen')) await S.say('baizhi:smile', '（……謝謝妳們。我會好好長大。）');
        } },
      ],
      warps: [{ x: 7, y: 11, w: 2, to: 'fucheng', tx: 26, ty: 14, tdir: 'down' }],
    };
  })());

  // =================================================================================================== 1-8 鄭家
  G.Maps.define('fc_zheng', (() => {
    const g = room(14, 10, 'W', '_', 6);
    return {
      name: '鄭家', subtitle: '五條港碼頭工人的家', place: 'tainan', bgm: 'tainan', start: [6, 8],
      light: (st) => FC_LIGHT[Math.min(1, st.vars.ch6_time || 0)],
      tiles: g.rows(),
      objects: deco([
        ['altar', 6, 2], ['stove', 10, 2], ['bed_mat', 1, 3], ['bed_mat', 12, 3], ['table', 5, 5, { w: 2 }], ['chair', 4, 5, { dir: 'right' }],
        ['jar', 1, 7], ['basket', 12, 7], ['fishing_net', 9, 7],
      ]),
      npcs: [
        { id: 'fc_zs2', sprite: 'villager_f', name: '鄭嫂', x: 8, y: 5, dir: 'down', if: (st) => st.flags.ch6_sixteen, talk: (S, n) => Sc.zhengRest(S, n) },
        { id: 'fc_ajin2', sprite: 'villager_m', name: '阿進', x: 3, y: 6, dir: 'right', if: (st) => st.flags.ch6_sixteen, talk: async (S, n) => {
          await S.lines(['過幾日我就要上船了。去唐山學做生理。', '……我會回來的。我阿母說，十六歲的人，講話要算話。'], n);
          if (S.has('ch6_linto_done')) await S.say('xinghe:smile', '你一定會回來的。府城有人在等你。');
        } },
      ],
      warps: [{ x: 6, y: 9, w: 2, to: 'fucheng', tx: 18, ty: 14, tdir: 'down', door: true }],
    };
  })());

  // =================================================================================================== 府城 客棧 / 武館兵器鋪 / 藥鋪
  G.Maps.define('fc_inn', (() => {
    const g = room(14, 10, 'W', '_', 6);
    return {
      name: '府城客棧', place: 'tainan', bgm: 'tainan', start: [6, 8], light: { ambient: 0.12, color: '#2a1408' }, tiles: g.rows(),
      objects: deco([['counter', 5, 4], ['shelf_lanterns', 8, 2], ['stairs_up', 11, 2], ['table', 2, 6], ['chair', 1, 6, { dir: 'right' }], ['table', 10, 6], ['chair', 11, 6, { dir: 'left' }], ['plant_pot', 1, 2], ['rug', 5, 6, { w: 3, h: 2 }]]),
      npcs: [
        { id: 'fc_innkeeper', sprite: 'shopkeeper_f', name: '客棧老闆娘', x: 6, y: 3, dir: 'down', talk: async (S, n) => {
          await S.lines(['元宵暝，房間只剩最後幾間囉。一晚六十文。'], n);
          await S.inn(60, { who: '客棧老闆娘' });
        } },
        { id: 'fc_inn_v', sprite: 'pilgrim', name: '進香客', x: 10, y: 5, dir: 'down', talk: ['我從北港一路走來看府城的燈。', '長明宮的燈最亮……可是我不敢多看。看久了，心會冷。'] },
      ],
      warps: [{ x: 6, y: 9, w: 2, to: 'fucheng', tx: 53, ty: 17, tdir: 'down', door: true }],
    };
  })());
  G.Maps.define('fc_shop', (() => {
    const g = room(12, 9, 'W', '_', 5);
    return {
      name: '武館兵器鋪', place: 'tainan', bgm: 'tainan', start: [5, 7], light: { ambient: 0.12, color: '#2a1408' }, tiles: g.rows(),
      objects: deco([['counter', 5, 4], ['weapon_rack', 1, 2], ['weapon_rack', 8, 2], ['barrel', 1, 6], ['crate', 10, 6], ['brazier', 10, 2]]),
      npcs: [{ id: 'fc_smith', sprite: 'soldier', name: '武館 陳師傅', x: 6, y: 3, dir: 'down',
        talk: shopkeeperTalk(['府城武館，陳家兵器！', '刀槍劍戟、符扇玉簫，樣樣都有。……你們幾個，要去打大仗的樣子。'],
          ['sw_qixing', 'sp_qilin', 'fl_baiyu', 'fn_qixing', 'ar_chain', 'c6_brocade_m', 'c6_brocade_f', 'hd_yuguan', 'c6_official_boots', 'ac_yeming'], '武館兵器鋪') }],
      warps: [{ x: 5, y: 8, w: 2, to: 'fucheng', tx: 35, ty: 24, tdir: 'down', door: true }],
    };
  })());
  G.Maps.define('fc_herb', (() => {
    const g = room(12, 9, 'W', '_', 5);
    return {
      name: '府城藥鋪', place: 'tainan', bgm: 'tainan', start: [5, 7], light: { ambient: 0.12, color: '#2a1408' }, tiles: g.rows(),
      objects: deco([['counter', 5, 4], ['herbs_rack', 1, 2], ['herbs_rack', 2, 2], ['jar_row', 8, 2], ['cauldron', 10, 6], ['jar', 1, 6]]),
      npcs: [{ id: 'fc_doctor', sprite: 'doctor', name: '藥鋪老闆', x: 6, y: 3, dir: 'down',
        talk: shopkeeperTalk(['金創藥、凝神丹、回魂香，府城藥鋪，童叟無欺。', '這陣子西邊來看病的人變多了。都說睡不好，夢見有人在罐子裡叫他們的名字。'],
          ['jinchuang', 'c6_jinchuang2', 'c6_jinchuang3', 'c6_ningshen', 'c6_ningshen2', 'huanhunxiang', 'jiedu', 'xiangbao', 'c6_herb_tea', 'c6_revive_incense'], '府城藥鋪') }],
      warps: [{ x: 5, y: 8, w: 2, to: 'fucheng', tx: 57, ty: 17, tdir: 'down', door: true }],
    };
  })());

  // =================================================================================================== 1-9 林投林 (哭聲迷宮)
  // Three forks (A → B → C), each with three branches. The branch where the crying is clearest leads on
  // (A 右, B 左, C 中); the others end at a nameless grave and send you back to the fork's entrance.
  const LT = {
    entries: { A: [18, 32], B: [30, 26], C: [14, 16] },
    forks: {
      A: { good: [20.5, 29.5], bad: [[17, 29.5], [18.5, 28]] },
      B: { good: [29, 19.5], bad: [[30.5, 18], [32, 19.5]] },
      C: { good: [14.5, 10], bad: [[13, 11.5], [16, 11.5]] },
    },
    graves: [[7, 29], [18, 23], [30, 12], [38, 19], [4, 11], [26, 11]],
    ends: [[8, 29.5], [18.5, 24], [30.5, 13], [37, 19.5], [5, 11.5], [25, 11.5]],
    cryT: 2,
  };
  G.Maps.define('linto', (() => {
    const W = 40, H = 36;
    const g = grid(W, H, 'h');
    const open = [];
    for (let y = 0; y < H; y++) open.push(new Array(W).fill(false));
    const carve = (x, y, w, h, ch) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { g.set(xx, yy, ch); open[yy][xx] = true; } };
    carve(0, 0, W, 3, '~'); carve(0, 3, W, 1, '-');
    g.rect(32, 1, 8, 3, 'X'); carve(35, 2, 1, 2, 's');
    carve(2, 4, 36, 2, 's'); carve(6, 4, 11, 5, 's');
    carve(18, 31, 2, 5, ',');
    carve(8, 29, 12, 2, ','); carve(18, 24, 2, 5, ','); carve(20, 29, 12, 2, ','); carve(30, 21, 2, 8, ',');
    carve(30, 13, 2, 8, ','); carve(32, 19, 6, 2, ','); carve(35, 18, 1, 1, ','); carve(14, 19, 16, 2, ','); carve(14, 13, 2, 6, ',');
    carve(5, 11, 9, 2, ','); carve(14, 11, 2, 2, ','); carve(16, 11, 10, 2, ','); carve(14, 9, 2, 2, 's');
    carve(12, 32, 6, 2, ','); carve(22, 21, 2, 2, 'm');
    for (const [x, y] of LT.graves) { g.set(x, y, ','); open[y][x] = 'grave'; }
    for (const [x, y] of [[12, 31], [14, 31], [16, 31]]) { g.set(x, y, ','); open[y][x] = 'grave'; }
    // pandanus on every thicket cell that borders open ground (deeper thicket is drawn by the hedge tiles)
    const objs = [];
    for (let y = 4; y < H; y++) for (let x = 0; x < W; x++) {
      if (open[y][x] || g.get(x, y) === 'X') continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const r = open[y + dy] && open[y + dy][x + dx]; if (r === true) { near = true; break; } }
      if (near && ((x + y) % 2 === 0 || U.hash(x, y, 9) < 0.35)) { objs.push({ t: 'pandanus', x, y, v: Math.floor(U.hash(x, y, 31) * 3) }); g.set(x, y, ','); }
    }
    for (const [x, y] of LT.graves) objs.push({ t: 'grave', x, y, v: 0 });
    objs.push({ t: 'grave', x: 12, y: 31, v: 1 }, { t: 'grave', x: 14, y: 31 }, { t: 'grave', x: 16, y: 31, v: 1 });
    objs.push({ t: 'gate_city', x: 34, y: 2, text: '水門' });
    objs.push({ t: 'pandanus', x: 10, y: 4, v: 0 }, { t: 'pandanus', x: 11, y: 4, v: 2 }, { t: 'pandanus', x: 12, y: 4, v: 1 });
    for (const [x, y] of [[17, 4], [17, 5], [18, 4], [18, 5]]) objs.push({ t: 'pandanus', x, y, v: (x + y) % 3, if: (st) => !st.flags.ch6_linto_done });
    for (const [x, y] of [[3, 4], [5, 5], [24, 4], [29, 5], [33, 4]]) objs.push({ t: 'tallgrass', x, y });
    objs.push({ t: 'tree_dead', x: 2, y: 5 }, { t: 'reeds', x: 8, y: 4 }, { t: 'reeds', x: 26, y: 5 }, { t: 'rock_small', x: 37, y: 5 });
    objs.push({ t: 'mushroom_glow', x: 23, y: 22, spirit: true, solid: false, if: (st) => !st.flags.mush_ch6 });
    return {
      name: '林投林', subtitle: '台江舊海岸', place: 'tainan', bgm: (st) => (st.flags.ch6_linto_done ? 'night' : 'night'), start: [18, 34],
      light: (st) => (st.flags.ch6_linto_done ? { ambient: 0.66, color: '#060a1a', playerR: 230 } : { ambient: 0.45, color: '#0e0a1a', playerR: 230, tint: 'rgba(120,80,160,0.08)' }),
      particles: ['wind', 'mist', 'fireflies'],
      tiles: g.rows(),
      objects: objs,
      pass: [{ x: 10, y: 4, w: 3, h: 1, solid: true }],
      chests: [
        { id: 'c6_06', x: 35, y: 18, item: 'huanhundan', n: 2 },
        { id: 'c6_07', x: 12, y: 33, item: 'c6_tide_sword' },
      ],
      npcs: [
        { id: 'lj', sprite: 'linto', portrait: 'linto', name: '林投姐', x: 11, y: 6, dir: 'up', fixedDir: true, ghost: true, if: (st) => !st.flags.ch6_linto_done,
          talk: async (S) => { await S.say('linto:sad', '……船，還沒來。'); } },
      ],
      enemies: [
        { id: 'lt1', troop: 't_c6_linto_a', x: 25, y: 29, art: 'bamboo_spirit', variant: 1, radius: 2, chase: 3, lv: 21 },
        { id: 'lt2', troop: 'linto_3', x: 30, y: 23, art: 'water_ghost', variant: 2, radius: 2, chase: 3, lv: 21 },
        { id: 'lt3', troop: 't_c6_linto_b', x: 21, y: 19, art: 'bamboo_spirit', variant: 1, radius: 2, chase: 3, lv: 22 },
        { id: 'lt4', troop: 't_c6_linto_c', x: 20, y: 11, art: 'hanged_ghost', variant: 2, radius: 2, chase: 3, lv: 22 },
        { id: 'lt5', troop: 'linto_1', x: 11, y: 29, art: 'hanged_ghost', variant: 2, radius: 2, chase: 3, lv: 21 },
      ],
      events: [
        { id: 'enter', trigger: 'auto', if: (st) => !st.flags.ch6_linto_in, run: (S) => Sc.lintoEnter(S) },
        { id: 'deadA1', trigger: 'touch', x: 8, y: 29, h: 2, run: (S) => Sc.deadEnd(S, 'A') },
        { id: 'deadA2', trigger: 'touch', x: 18, y: 24, w: 2, run: (S) => Sc.deadEnd(S, 'A') },
        { id: 'deadB1', trigger: 'touch', x: 30, y: 13, w: 2, run: (S) => Sc.deadEnd(S, 'B') },
        { id: 'deadB2', trigger: 'touch', x: 37, y: 19, h: 2, run: (S) => Sc.deadEnd(S, 'B') },
        { id: 'deadC1', trigger: 'touch', x: 5, y: 11, h: 2, run: (S) => Sc.deadEnd(S, 'C') },
        { id: 'deadC2', trigger: 'touch', x: 25, y: 11, h: 2, run: (S) => Sc.deadEnd(S, 'C') },
        { id: 'boss', trigger: 'touch', x: 14, y: 9, w: 2, if: (st) => !st.flags.ch6_linto_done, run: (S) => Sc.lintoBoss(S) },
        { id: 'mush', trigger: 'touch', x: 22, y: 21, w: 2, h: 2, spirit: true, if: (st) => st.flags.mush_1 && !st.flags.mush_ch6, run: (S) => Sc.mushroom(S) },
        { id: 'gate', trigger: 'touch', x: 33, y: 4, w: 5, h: 2, if: (st) => st.flags.ch6_linto_done && !st.flags.ch6_infiltrate, run: (S) => Sc.waterGate(S) },
        { id: 'graves', trigger: 'action', x: 14, y: 31, label: '看', run: async (S) => {
          await S.say('', '三座沒有名字的墳。墳前插著幾根燒完的香，不知道是誰來拜的。');
          await S.say('baizhi:sad', '……他們都在等人來叫他們的名字。');
        } },
      ],
      warps: [
        { x: 18, y: 35, w: 2, to: 'fucheng', tx: 1, ty: 40, tdir: 'left' },
        { x: 35, y: 3, to: 'palace_dock', tx: 4, ty: 15, tdir: 'up', if: (st) => !!st.flags.ch6_infiltrate },
      ],
      onUpdate: (dt, ms, busy) => {
        if (busy) return;
        // deeper into the thicket (north) = darker
        if (!G.state.flags.ch6_linto_done) ms.lightCfg.ambient = 0.42 + 0.2 * U.clamp(1 - ms.player.y / 34, 0, 1);
        LT.cryT -= dt;
        if (LT.cryT <= 0 && !G.state.flags.ch6_linto_done) {
          LT.cryT = U.rand(3.5, 5.5);
          const p = ms.player;
          const near = Object.values(LT.forks).some((f) => Math.hypot(f.good[0] - p.x, f.good[1] - p.y) < 8);
          if (near) G.Audio.sfx('ghost');
        }
      },
      drawGround: (ctx, t, ms) => {
        // the old pandanus where 林投姐 stands — twice the size of the others
        const d = G.Objects.get('pandanus');
        if (d && !ms.view3d) {
          ctx.save();
          ctx.translate(11 * T + 32, 4 * T + 54); ctx.scale(2.1, 2.1); ctx.translate(-(11 * T + 32), -(4 * T + 54));
          ctx.globalAlpha = 0.95;
          d.draw(ctx, 11 * T, 4 * T, { t: 'pandanus', x: 11, y: 4, v: 2 }, t);
          ctx.restore();
        }
        if (G.state.flags.ch6_linto_done) return;
        // crying ripples (visual cue): bigger and denser toward the right branch
        for (const f of Object.values(LT.forks)) {
          const rings = [[f.good, 3, 1]].concat(f.bad.map((b) => [b, 1, 0.45]));
          for (const [[cx, cy], n, k] of rings) {
            for (let i = 0; i < n; i++) {
              const ph = ((t * 0.5 + i / n) % 1);
              ctx.strokeStyle = `rgba(150,190,255,${(1 - ph) * 0.45 * k})`;
              ctx.lineWidth = 2 + 2 * k;
              ctx.beginPath(); ctx.ellipse(cx * T + 32, cy * T + 40, 10 + ph * 70 * k, (10 + ph * 70 * k) * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
            }
          }
        }
        // a dried, bitten 肉粽 at every dead end
        for (const [x, y] of LT.ends) {
          const px = x * T + 32, py = y * T + 46;
          ctx.fillStyle = '#5a4a28'; ctx.beginPath(); ctx.moveTo(px - 10, py + 6); ctx.lineTo(px, py - 10); ctx.lineTo(px + 10, py + 6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#2a2414'; ctx.beginPath(); ctx.arc(px + 6, py - 2, 4, 0, Math.PI * 2); ctx.fill();
        }
      },
    };
  })());

  // =================================================================================================== 長明宮 S1 水門倉
  // 傀儡哨: a stationary map enemy drawn with the marionette art. It never moves or chases; bumping into it starts a
  // fight like any roaming enemy (and a beaten puppet is gone until the map reloads).
  const puppet = (id, x, y, dir) => ({ id, troop: 't_c6_guard_a', x, y, dir, art: 'marionette', variant: 1, radius: 0, chase: 0, lv: 40, speed: 0.01 });
  const jarHide = (x, y) => ({ t: 'jar', x, y, v: 1, label: '躲進大甕', interact: (S, o) => Stealth.hideIn(S, o) });
  const palaceLight = { ambient: 0.7, color: '#04081a', playerR: 150, glow: 0.35 };
  const stealthMap = (def) => Object.assign({
    bgm: 'stealth', noSave: true, light: palaceLight, particles: ['motes'],
    onUpdate: (dt, ms, busy) => Stealth.update(dt, ms, busy),
    drawGround: (ctx, t, ms) => { if (def.extraGround) def.extraGround(ctx, t, ms); Stealth.drawGround(ctx, t, ms); },
    drawOver: (ctx, t, ms) => { Stealth.drawOver(ctx, t, ms); if (def.extraOver) def.extraOver(ctx, t, ms); },
    onCaught: (S, g) => Stealth.onCaught(S, g),
    onEnter: async (S) => { S.hideFollowers(true); },
  }, def);

  G.Maps.define('palace_dock', (() => {
    const g = grid(30, 20, 't');
    g.rect(0, 0, 30, 2, 'E'); g.rect(0, 0, 1, 20, 'E'); g.rect(29, 0, 1, 20, 'E'); g.rect(0, 18, 30, 2, 'E');
    g.rect(15, 0, 1, 2, 't');
    g.rect(1, 12, 2, 7, '~'); g.rect(3, 12, 2, 6, 'k');
    return stealthMap({
      name: '長明宮・水門倉', subtitle: '潛行 S1', place: 'tainan', start: [4, 15],
      tiles: g.rows(),
      objects: deco([
        ...[[8, 6], [9, 6], [8, 7], [9, 7], [10, 11], [11, 11], [10, 12], [11, 12], [19, 4], [20, 4], [21, 4], [19, 5], [20, 5], [21, 5], [23, 14], [24, 14], [25, 14], [23, 15], [24, 15], [25, 15]].map(([x, y]) => ['crate', x, y, { v: (x + y) % 3 }]),
        ...[8, 9, 10, 11, 12, 13].map((x) => ['soul_jar', x, 2]), ...[16, 17, 18, 19, 20, 21].map((x) => ['soul_jar', x, 9]),
        ['eternal_lamp', 9, 9], ['eternal_lamp', 20, 11], ['eternal_lamp', 17, 3],
        ['stone_lantern', 5, 16], ['barrel', 2, 3], ['barrel', 27, 16], ['barrel', 27, 10], ['basket', 26, 5], ['dock_post', 5, 12],
      ]).concat([jarHide(4, 10), jarHide(14, 3), jarHide(22, 12)]),
      chests: [{ id: 'c6_08', x: 26, y: 2, item: 'c6_palace_mail', if: (st) => !st.vars.ch6_s1_spotted }],
      checkpoint: [4, 15, 'up'],
      guards: [
        { id: 'g1', sprite: 'temple_guard', path: [[6, 4], [6, 14], [12, 14], [12, 4]], speed: 1.6, pause: 1, troop: 't_c6_guard_a' },
        { id: 'g2', sprite: 'temple_guard', path: [[18, 7], [27, 7]], speed: 1.6, pause: 2, pauseFace: 'down', troop: 't_c6_guard_a' },
      ],
      stealth: { area: 's1', creaky: [[13, 5], [14, 5], [15, 5], [16, 5]], puppets: [{ id: 'p1', x: 15, y: 11, dir: 'up' }], fwPhase: 18 },
      enemies: [puppet('p1', 15, 11, 'up')],
      events: [
        { id: 'enter', trigger: 'auto', if: (st) => !st.flags.ch6_s1_tut, run: (S) => Sc.stealthTutorial(S) },
        { id: 'pu_p1', trigger: 'action', x: 15, y: 11, label: '貼符', run: (S) => Stealth.puppetCharm(S, { id: 'p1' }) },
        { id: 'cp', trigger: 'action', x: 5, y: 16, label: '看', run: (S) => Sc.checkpointLantern(S) },
      ],
      warps: [
        { x: 15, y: 1, to: 'palace_hall', tx: 4, ty: 26, tdir: 'up' },
        { x: 3, y: 17, to: 'linto', tx: 35, ty: 5, tdir: 'down' },
      ],
    });
  })());

  // =================================================================================================== 長明宮 S2 迴廊
  G.Maps.define('palace_hall', (() => {
    const g = grid(40, 30, 'E');
    g.rect(2, 2, 4, 26, 't'); g.rect(34, 2, 4, 26, 't'); g.rect(2, 2, 36, 4, 't'); g.rect(2, 24, 36, 4, 't');
    g.rect(8, 8, 24, 14, 'T');
    g.rect(6, 14, 2, 2, 't'); g.rect(32, 14, 2, 2, 't'); g.rect(19, 6, 2, 2, 't'); g.rect(19, 22, 2, 2, 't');
    g.rect(36, 0, 1, 2, 't');
    const lamps = [[14, 9], [18, 9], [22, 9], [26, 9], [30, 9], [10, 13], [14, 13], [22, 13], [26, 13], [30, 13], [10, 17], [14, 17], [18, 17], [22, 17], [26, 17], [10, 21], [14, 21], [22, 21], [26, 21]];
    return stealthMap({
      name: '長明宮・迴廊', subtitle: '潛行 S2', place: 'tainan', start: [4, 26],
      tiles: g.rows(),
      objects: deco([
        ['tree_banyan', 9, 9], ['tree_banyan', 28, 18],
        ...lamps.map(([x, y]) => ['eternal_lamp', x, y]),
        ['screen', 2, 10], ['screen', 2, 18], ['screen', 26, 4], ['screen', 36, 12],
        ['pillar', 5, 12], ['pillar', 5, 20], ['pillar', 34, 10], ['pillar', 34, 18], ['pillar', 12, 5], ['pillar', 30, 5], ['pillar', 14, 24], ['pillar', 26, 24],
        ['stone_lantern', 2, 26], ['soul_jar', 16, 2], ['soul_jar', 17, 2], ['soul_jar', 23, 2], ['soul_jar', 24, 2], ['mural', 8, 1, { v: 2 }], ['mural', 29, 1, { v: 4 }],
      ]).concat([jarHide(10, 26), jarHide(30, 26), jarHide(36, 8)]),
      hides: [{ x: 2, y: 11, w: 2 }, { x: 2, y: 19, w: 2 }, { x: 26, y: 5, w: 2 }, { x: 36, y: 13, w: 2 },
        { x: 12, y: 10, h: 2 }, { x: 10, y: 12, w: 2 }, { x: 27, y: 19, h: 2 }, { x: 28, y: 17, w: 2 }],
      chests: [
        { id: 'c6_11', x: 2, y: 20, item: 'c6_jinchuang2', n: 2, run: async (S) => { await S.give('huanhundan', 1); } },
        { id: 'c6_09', x: 37, y: 2, item: 'c6_netherlamp_ward', if: (st) => !st.vars.ch6_s2_spotted },
      ],
      checkpoint: [4, 26, 'up'],
      guards: [
        { id: 'g3', sprite: 'temple_guard', path: [[4, 6], [4, 21]], speed: 1.6, pause: 1.5, pauseFaces: ['up', 'down'], troop: 't_c6_guard_b' },
        { id: 'g4', sprite: 'temple_guard', path: [[6, 3], [20, 3], [33, 3], [20, 3]], speed: 1.6, pause: 1.2, pauseFaces: [null, 'down', null, 'down'], troop: 't_c6_guard_b' },
        { id: 'g5', sprite: 'temple_guard', path: [[35, 6], [35, 23]], speed: 1.6, pause: 1.5, troop: 't_c6_guard_b' },
        { id: 'moya', sprite: 'moya', path: [[9, 25], [33, 25]], speed: 1.2, pause: 1.5, fixedView: 5, troop: 't_c6_moya', if: (st) => !st.flags.ch6_moya_fled },
      ],
      stealth: { area: 's2', creaky: [[15, 3], [16, 3], [17, 3], [18, 3], [15, 4], [16, 4], [17, 4], [18, 4], [35, 15], [36, 15]],
        puppets: [{ id: 'p2', x: 5, y: 4, dir: 'down' }, { id: 'p3', x: 35, y: 26, dir: 'left' }], fwPhase: 10 },
      enemies: [puppet('p2', 5, 4, 'down'), puppet('p3', 35, 26, 'left')],
      events: [
        { id: 'enter', trigger: 'auto', if: (st) => !st.flags.ch6_s2_in, run: (S) => Sc.hallEnter(S) },
        { id: 'pu_p2', trigger: 'action', x: 5, y: 4, label: '貼符', run: (S) => Stealth.puppetCharm(S, { id: 'p2' }) },
        { id: 'pu_p3', trigger: 'action', x: 35, y: 26, label: '貼符', run: (S) => Stealth.puppetCharm(S, { id: 'p3' }) },
        { id: 'cp', trigger: 'action', x: 2, y: 26, label: '看', run: (S) => Sc.checkpointLantern(S) },
      ],
      warps: [
        { x: 36, y: 1, to: 'palace_study', tx: 12, ty: 16, tdir: 'up' },
        { x: 3, y: 27, to: 'palace_dock', tx: 15, ty: 2, tdir: 'down' },
      ],
    });
  })());

  // =================================================================================================== 長明宮 S3 經閣
  const SHELVES = [[2, 3, '一'], [2, 6, '念'], [2, 9, '清'], [2, 12, '靜'], [20, 3, '萬'], [20, 6, '緣'], [20, 9, '皆'], [20, 12, '歸']];
  G.Maps.define('palace_study', (() => {
    const g = room(24, 18, 'E', '_', 12, 1);
    return stealthMap({
      name: '長明宮・經閣', subtitle: '潛行 S3', place: 'tainan', start: [12, 16],
      tiles: g.rows(),
      objects: deco([
        ...SHELVES.map(([x, y]) => ['bookshelf', x, y]),
        ['table', 13, 8, { w: 2 }], ['paper_stack', 14, 7], ['eternal_lamp', 6, 15], ['eternal_lamp', 17, 15], ['stone_lantern', 10, 16],
        ['cabinet', 8, 2], ['cabinet', 16, 2], ['brazier', 1, 2], ['brazier', 22, 2], ['screen', 5, 2], ['screen', 18, 2], ['mural', 10, 1, { v: 1 }],
      ]).concat([jarHide(21, 15)]).concat([{ t: 'stairs_down', x: 12, y: 2, if: (st) => !!st.flags.ch6_qingxu_letter }]),
      chests: [{ id: 'c6_10', x: 2, y: 16, item: 'c6_qingxu_gourd', if: (st) => !st.vars.ch6_s3_spotted }],
      checkpoint: [12, 16, 'up'],
      guards: [{ id: 'g6', sprite: 'temple_guard', path: [[15, 8]], dir: 'left', sleeper: true, speed: 1.4, troop: 't_c6_guard_a' }],
      stealth: { area: 's3', creaky: [[11, 8], [12, 8], [11, 9], [12, 9], [11, 10], [12, 10]], puppets: [], fwPhase: 22 },
      events: [
        { id: 'enter', trigger: 'auto', if: (st) => !st.flags.ch6_s3_in, run: (S) => Sc.studyEnter(S) },
        ...SHELVES.map(([x, y, ch]) => ({ id: 'shelf_' + x + '_' + y, trigger: 'action', x, y, w: 2, label: '抽書', if: (st) => !st.flags.ch6_s3_open, run: (S) => Sc.shelf(S, ch, x, y) })),
        { id: 'note', trigger: 'action', x: 13, y: 8, w: 2, label: '調查', run: async (S) => {
          await S.say('', '桌上壓著一張字條，墨跡是清虛真人的筆跡：');
          await S.say('', '「先取師之字，後取徒之字。」');
          await S.say('yungui:think', '……老頭，連藏東西都要出題目。');
        } },
        { id: 'cp', trigger: 'action', x: 10, y: 16, label: '看', run: (S) => Sc.checkpointLantern(S) },
      ],
      warps: [
        { x: 12, y: 2, to: 'palace_lanterns', tx: 18, ty: 27, tdir: 'up', if: (st) => !!st.flags.ch6_qingxu_letter },
        { x: 12, y: 17, to: 'palace_hall', tx: 36, ty: 2, tdir: 'down' },
      ],
      extraGround: (ctx, t) => {
        if (!G.state.flags.ch6_s3_open) return;
        ctx.fillStyle = '#05060c'; ctx.fillRect(11 * T + 16, 1 * T + 6, T * 2 - 32, T - 10);
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 3; ctx.strokeRect(11 * T + 16, 1 * T + 6, T * 2 - 32, T - 10);
      },
      extraHud: (ctx, t, ms, scrCell) => {
        for (const [x, y, ch] of SHELVES) {
          const p = scrCell(ms, x + 0.5, y, 2.4);
          if (!p.vis) continue;
          ctx.fillStyle = 'rgba(70,44,22,0.95)'; ctx.fillRect(p.x - 16, p.y - 2, 32, 30);
          ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 16, p.y - 2, 32, 30);
          G.Render.text(ctx, ch, p.x, p.y + 1, { size: 22, bold: true, align: 'center', color: '#f6e2b0', shadow: false });
        }
      },
    });
  })());

  // =================================================================================================== 1-11 萬燈閣
  const LAN = { boost: 0, jars: null };
  G.Maps.define('palace_lanterns', (() => {
    const W = 36, H = 30, cx = 18, cy = 15;
    const g = grid(W, H, 'E');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - cx, y - cy) <= 13.2) g.set(x, y, 'T');
    g.rect(17, 27, 3, 3, 'T');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - cx, (y - 13) * 1.15) <= 2.2) g.set(x, y, '#');
    const objs = [];
    const seen = new Set();
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * 11.6), y = Math.round(cy + Math.sin(a) * 11.6);
      if (y >= 24 && Math.abs(x - cx) <= 2) continue;
      const k = x + ',' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      objs.push({ t: 'soul_jar', x, y, v: i % 4 });
    }
    for (const [x, y] of [[cx, 7], [26, 15], [cx, 21], [10, 15]]) objs.push({ t: 'jar', x, y, v: 2, light: { r: 140, color: '#6ab8ff', flicker: 0.3 } });
    objs.push({ t: 'soul_jar', x: cx, y: 13, v: 1 }, { t: 'lantern_frame', x: cx + 1, y: 13 });
    return {
      name: '萬燈閣', subtitle: '一萬三千七百盞', place: 'tainan', noSave: true,
      bgm: (st) => (st.flags.ch6_yexuan_met ? 'tension' : 'palace'), start: [18, 27],
      light: { ambient: 0.52, color: '#03081c', playerR: 160, glow: 0.45, tint: 'rgba(80,140,255,0.08)' },
      particles: ['motes'],
      tiles: g.rows(),
      objects: objs,
      chests: [{ id: 'c6_12', x: 16, y: 25, item: 'c6_revive_incense' }],
      events: [{ id: 'story', trigger: 'auto', if: (st) => !st.flags.ch6_yexuan_met, run: (S) => Sc.lanterns(S) }],
      drawGround: (ctx, t, ms) => {
        // the shelves rising into the dark: every wall cell holds rows of small breathing jars
        const x0 = Math.max(0, Math.floor(ms.cam.x / T) - 1), x1 = Math.min(W - 1, Math.floor((ms.cam.x + G.W) / T) + 1);
        const y0 = Math.max(0, Math.floor(ms.cam.y / T) - 1), y1 = Math.min(H - 1, Math.floor((ms.cam.y + G.H) / T) + 1);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (ms.terrainAt(x, y) !== 'wall_temple') continue;
          if (Math.hypot(x - cx, y - cy) > 17.5) continue;
          for (let j = 0; j < 3; j++) {
            const hx = U.hash(x, y, j + 3);
            const px = x * T + 10 + j * 20, py = y * T + 18 + (j % 2) * 24;
            const br = 0.35 + 0.25 * Math.sin(t * (0.8 + hx) + hx * 9) + LAN.boost * 0.5;
            ctx.fillStyle = 'rgba(30,40,60,0.9)';
            ctx.fillRect(px - 5, py - 7, 10, 14);
            ctx.fillStyle = `rgba(120,190,255,${U.clamp(br, 0, 1)})`;
            ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(200,40,30,0.85)'; ctx.fillRect(px - 2, py + 3, 4, 4);
          }
        }
      },
    };
  })());

  // =================================================================================================== 1-12 府城北郊海邊沙丘
  G.Maps.define('north_dunes', (() => {
    const g = grid(24, 14, 's');
    g.rect(0, 0, 24, 2, ','); g.rect(0, 10, 24, 1, '-'); g.rect(0, 11, 24, 3, '~');
    return {
      name: '府城北郊', subtitle: '正月十五・深夜', place: 'tainan', noSave: true, bgm: 'sad', start: [11, 6],
      light: { ambient: 0.7, color: '#04081a', playerR: 180 },
      particles: ['mist', 'wind'],
      tiles: g.rows(),
      deco: ['  P  g    x     g    P  ', ' g    x       g    x    ', '    g          g       ', '', '  g                  g  ', '', '', '         g        ', '', '  e    e      e     e   '],
      events: [{ id: 'story', trigger: 'auto', if: (st) => !st.flags.ch6_ship, run: (S) => Sc.ship(S) }],
    };
  })());

  // =================================================================================================== 甘蔗田・土地公廟 (夜) — 第七章 7-1 從同一座廟、破曉前接續
  G.Maps.define('sugarcane_night', (() => {
    const W = 22, H = 16;
    const g = grid(W, H, 'f');
    g.rect(10, 6, 2, 10, ':'); g.rect(7, 2, 8, 7, ':');
    const rows = [];
    for (let y = 0; y < H; y++) {
      let r = '';
      for (let x = 0; x < W; x++) {
        const open = g.get(x, y) === ':';
        const h = U.hash(x, y, 77);
        r += open ? ' ' : h < 0.55 ? 'B' : h < 0.9 ? 'x' : 'g';
      }
      rows.push(r);
    }
    return {
      name: '甘蔗田', subtitle: '土地公廟・天亮之前', place: 'tainan', noSave: true, bgm: 'sad', start: [10, 14],
      light: { ambient: 0.66, color: '#05080e', playerR: 170 },
      particles: ['fireflies'],
      tiles: g.rows(),
      deco: rows,
      objects: deco([['shrine_small', 10, 2, { text: '福德祠' }], ['incense_burner', 9, 4], ['basket', 13, 5, { v: 2 }]]),
      lights: [{ x: 10, y: 4, r: 110, color: '#ffb060', flicker: 0.4 }, { x: -2, y: 7, r: 200, color: '#ff8a3a', flicker: 0.6 }, { x: 24, y: 12, r: 200, color: '#ff8a3a', flicker: 0.6 }],
      events: [{ id: 'story', trigger: 'auto', if: (st) => !st.flags.ch6_done, run: (S) => Sc.canefield(S) }],
    };
  })());

  // =================================================================================================== story helpers
  const wait = (S, s) => S.wait(dur(s));
  const healPct = (k) => {
    for (const m of G.Party.active()) {
      if (m.hp <= 0) continue;
      const st = G.Party.stats(m.id);
      m.hp = Math.min(st.mhp, m.hp + Math.round(st.mhp * k));
      m.mp = Math.min(st.mmp, m.mp + Math.round(st.mmp * k * 0.5));
    }
  };
  // place the party (and 糰子) explicitly for a cutscene: [[id, x, y, dir], ...]
  function stage(S, list) {
    S.hideFollowers(false);
    for (const [id, x, y, dir] of list) { S.setPos(id, x, y, dir); const a = S.actor(id); if (a) { a.visible = true; a.alpha = 1; } }
  }
  const tw = (obj, props, sec, ease) => G.Tweens.to(obj, props, dur(sec), ease || 'inOutQuad');

  // moving scene objects (the 關帝 palanquin, the black ship). The 2D view draws float positions smoothly; the
  // 3D view rebuilds an object's node when its cell changes, so there it advances cell by cell.
  const Mover = {
    add(key, t, x, y, extra) {
      const ms = MS();
      ms.objects = ms.objects.filter((o) => o.key !== key);
      const o = Object.assign({ t, x, y, key, v: 0, solid: false, alpha: 1 }, extra || {});
      ms.objects.push(o);
      return o;
    },
    get(key) { const ms = MS(); return ms ? ms.objects.find((o) => o.key === key) : null; },
    remove(key) { const ms = MS(); if (ms) ms.objects = ms.objects.filter((o) => o.key !== key); },
    async slide(S, key, tx, ty, sec) {
      const o = Mover.get(key);
      if (!o) return;
      if (!MS().view3d) { await tw(o, { x: tx, y: ty }, sec, 'linear'); return; }
      o.x = Math.round(o.x); o.y = Math.round(o.y);
      const n = Math.max(1, Math.abs(tx - o.x) + Math.abs(ty - o.y));
      for (let i = 0; i < n; i++) {
        if (o.y !== ty) o.y += Math.sign(ty - o.y); else if (o.x !== tx) o.x += Math.sign(tx - o.x);
        await S.wait(dur(sec / n));
      }
    },
    // the palanquin "nods": a small dip (2D) / a bearer's cue and the creak of the poles (both views)
    async nod(S, key, times) {
      const o = Mover.get(key);
      for (let i = 0; i < times; i++) {
        S.sfx('guard');
        if (o && !MS().view3d) { const y0 = o.y; await tw(o, { y: y0 - 0.18 }, 0.22); await tw(o, { y: y0 }, 0.22); }
        else await S.wait(dur(0.44));
      }
    },
    async fade(S, key, sec) { const o = Mover.get(key); if (o) await tw(o, { alpha: 0 }, sec, 'linear'); Mover.remove(key); },
  };

  // =================================================================================================== 3-1 序：往南的路
  Sc.intro = async (S) => {
    S.flag('ch6_start');
    stage(S, [['player', 11, 1, 'down'], ['baizhi', 12, 1, 'down'], ['hongying', 11, 0, 'down'], ['yungui', 12, 0, 'down'], ['tuanzi', 13, 1, 'down']]);
    S.move('baizhi', 'DDD', { wait: false }); S.move('hongying', 'DDD', { wait: false }); S.move('yungui', 'DDD', { wait: false }); S.move('tuanzi', 'DDD', { wait: false });
    await S.move('player', 'DDD');
    await S.say('xinghe:smile', '過了鹿港，越走越暖了。');
    S.face('baizhi', 'up');
    await S.say('', '白芷伸出手，看陽光穿過指尖——指尖的邊緣，仍然微微透著光。');
    await S.say('baizhi:smile', '……嗯。好暖。');
    await S.say('xinghe:sad', '（……還是透明的。）');
    await S.move('hongying', 'R', { wait: true });
    S.face('hongying', 'baizhi'); S.face('baizhi', 'hongying');
    await S.say('hongying:normal', '拿著。');
    await S.say('baizhi:think', '這是什麼？');
    await S.say('hongying:shy', '手套。我、我縫的。……縫歪了。');
    S.emote('baizhi', '♥');
    await S.say('baizhi:smile', '……很暖。一大一小，像星河和我。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '為什麼是我比較大！？');
    await S.say('yungui:smug', '因為你的手比較笨。');
    S.emote('tuanzi', '?');
    await S.say('tuanzi:think', '前面有煙。好多煙。還有……很香的味道。');
    await S.say('yungui:normal', '鹽水。今天正月十四。');
    await S.say('yungui:smile', '你們運氣真好——或者真差。今晚鹽水要放蜂炮。');
    S.quest('q_ch6_main', 0);
    S.objective('前往鹽水');
    S.gather();
    await S.warp('yanshui', 15, 1, 'down', { fade: 0.6 });
  };

  Sc.yanshuiArrive = async (S) => {
    S.flag('ch6_arrive_ys');
    await S.say('tuanzi:surprise', '炸肉丸！炸湯圓！還有……火藥的味道！');
    await S.say('hongying:think', '整條街的人都在搬竹架子。那是什麼？');
    await S.say('yungui:normal', '炮城。今晚，它們會一座一座點起來。');
    await S.say('xinghe:think', '先去廟裡看看吧。鹽水人的大事，一定要先問過神明。');
    S.objective('到鹽水武廟打聽消息');
  };

  // =================================================================================================== 3-2 鹽水武廟：蜂炮的由來
  Sc.temple = async (S) => {
    S.flag('ch6_yanshui');
    stage(S, [['player', 7, 8, 'up'], ['baizhi', 8, 9, 'up'], ['hongying', 6, 9, 'up'], ['yungui', 7, 10, 'up'], ['tuanzi', 8, 10, 'up']]);
    S.face('ys_keeper', 'player');
    await S.say('', '武廟裡，關聖帝君紅面長鬚，神威凜凜。殿前停著神轎，轎夫們正在綁紅巾。');
    await S.say('林伯', '外地人？來看炮的？先來給帝君上一炷香。');
    await S.say('xinghe:think', '阿伯，為什麼鹽水元宵要放那麼多炮？');
    S.emote('ys_keeper', '…');
    await S.say('林伯', '……八年前，鹽水起了一場大瘟。');
    await S.say('林伯', '先是一家咳，然後一條街咳。發燒、吐、三天就走。走的人多到埋不完。');
    await S.say('林伯', '大家沒辦法了，來武廟跪著，求帝君出巡。');
    await S.say('林伯', '元宵那暝，帝君的轎從廟裡出去，一條街一條街走。');
    await S.say('林伯', '大家沿路放炮。放到天光。炮聲、硝煙，把瘟氣一路趕出去。');
    await S.say('林伯', '那年元宵以後，瘟就慢慢退了。從此每年元宵，都放。');
    await S.say('林伯', '年輕人炮越放越多，現在一暝放的，比當年一整個月還多。');
    await S.say('baizhi:think', '炮聲可以趕走生病嗎？');
    await S.say('林伯', '可以趕走的，是怕。');
    await S.say('林伯', '整條街一起放炮的時候，就不會覺得只有自己一個人在怕了。');
    await S.say('yungui:think', '……好答案。');
    await S.say('林伯', '不過今年……有點奇怪。大疫塚那邊，這幾暝都有人看到東西在走。');
    await S.say('林伯', '巷口那幾盞長明宮送的燈，一到暗時，就有咳嗽聲。');
    await S.say('hongying:serious', '又是長明燈。');
    S.quest('q_ch6_main', 0);
    S.objective('準備好了，就跟林伯說一聲（蜂炮夜）');
    S.toast('（可以先在街上逛逛、買斗笠和厚棉襖。）');
  };

  Sc.keeperTalk = async (S, n) => {
    if (S.has('ch6_beehive')) {
      await S.say('林伯', '今暗辛苦了。帝君出巡，不只是趕瘟……也是來接人的。');
      await S.say('林伯', '去客棧歇睏吧。明仔載的路，還長。');
      return;
    }
    await S.say('林伯', '關聖帝君，忠義千秋。鹽水人的命，是帝君救回來的。');
    if (!S.has('ch6_yanshui')) return;
    await S.say('林伯', '轎夫都準備好了。你們呢？');
    const c = await S.choice(['開始吧。（蜂炮夜）', '再等一下'], { cancel: 1 });
    if (c === 0) await Sc.beehive(S);
    else await S.say('林伯', '好。時辰到之前，記得衣服穿厚，斗笠戴好。');
  };

  // =================================================================================================== 支線 4-2：轎夫阿義與母親
  Sc.ayiTalk = async (S, n) => {
    if (!S.has('ch6_yanshui')) {
      await S.say('阿義', '我今年第一次扛帝君的轎！八年前我才十二歲，那場瘟……我能活下來，是帝君保庇。');
      return;
    }
    if (!S.has('ch6_ayi_met')) {
      S.flag('ch6_ayi_met');
      await S.say('阿義', '我今年第一次扛帝君的轎！');
      await S.say('阿義', '八年前，我阿母就是那場瘟走的。她走之前，叫我去武廟，跪著求帝君救鹽水。');
      await S.say('阿義', '我跪了一整暝。天光的時候回去……她已經……');
      await S.say('阿義', '所以我發誓，長大了，要替帝君扛轎。替阿母還願。');
      await S.say('xinghe:smile', '你阿母一定很驕傲。');
      await S.say('阿義', '……希望啦。');
      S.quest('q_yanshui_mother', 0);
      return;
    }
    await S.say('阿義', '等一下起轎，我在轎前右腳的位置。看到一個肩膀最紅的，就是我！');
  };

  Sc.ayiMother = async (S, n) => {
    S.face(n.id, 'player');
    await S.say('', '大疫塚。一個瘟鬼沒有跟著其他人升天，獨自站在墳間。是一個瘦小的中年婦人，一直在咳。');
    await S.say('阿義的阿母', '……咳、咳……阿義……阿義有沒有吃飽……');
    await S.say('baizhi:sad', '您是……阿義的母親？');
    await S.say('阿義的阿母', '那囝仔……我叫他去武廟跪……他回來的時候，我已經……我沒有跟他說再見……');
    await S.say('阿義的阿母', '他那麼瘦……我走了以後，誰煮飯給他吃……');
    await S.say('xinghe:smile', '阿姨，阿義現在很壯。今天還扛帝君的轎呢。');
    S.emote(n.id, '!');
    await S.say('阿義的阿母', '……扛轎？那個瘦猴？');
    await S.say('hongying:smile', '跟我來。神轎還沒回廟。');
    S.flag('ch6_ayi_mother');
    S.quest('q_yanshui_mother', 2);
    S.objective('到主街上等神轎回駕');
  };

  Sc.ayiReturn = async (S) => {
    await S.fadeOut(0.6);
    stage(S, [['player', 22, 21, 'right'], ['baizhi', 22, 22, 'right'], ['hongying', 23, 20, 'down'], ['yungui', 22, 20, 'right'], ['tuanzi', 23, 22, 'left']]);
    S.spawn({ id: 'ys_mom', sprite: 'ghost_f', x: 23, y: 24, dir: 'left', ghost: true });
    const bearers = [['bear_ayi', 19, 33], ['bear_b', 22, 33], ['bear_c', 19, 31], ['bear_d', 22, 31]];
    for (const [id, x, y] of bearers) S.spawn({ id, sprite: id === 'bear_ayi' ? 'villager_m2' : 'villager_m', x, y, dir: 'up' });
    Mover.add('c6_pal', 'palanquin', 20, 31);
    await S.camera(21, 25, 0.1);
    await S.fadeIn(0.6);
    S.bgm('procession');
    await S.say('', '鑼鼓聲從南邊回來了。神轎由南往北回駕。');
    for (const [id] of bearers) S.move(id, 'UUUUUUU', { speed: 1.6, wait: false });
    await Mover.slide(S, 'c6_pal', 20, 24, 4.3);
    await S.say('', '阿義在轎前右腳的位置，肩膀紅腫，咬著牙，笑著。');
    await S.say('', '阿義的母親站在路邊，看著他。');
    S.face('ys_mom', 'left');
    await S.say('阿義的阿母', '……長這麼大了……肩膀這麼寬了……');
    await S.say('轎夫', '咦……？轎……又重了……');
    S.emote('bear_b', '!');
    await Mover.nod(S, 'c6_pal', 1);
    S.sfx('gong');
    await wait(S, 0.6);
    S.emote('bear_ayi', '…');
    await S.say('', '阿義不知道為什麼，鼻頭一酸。他看向空無一人的路邊。');
    await S.say('阿義', '……阿母？');
    await S.say('阿義的阿母', '……有吃飽就好。');
    await S.say('阿義的阿母', '阿母走了。這次有說再見喔。');
    S.sfx('lantern');
    S.flash('#fff0c0', 0.5, 0.5);
    const mom = S.actor('ys_mom');
    if (mom) { tw(mom, { offsetY: -60 }, 1.4); await S.fadeActor('ys_mom', 0, dur(1.4)); }
    S.remove('ys_mom');
    await S.say('阿義', '（……不知為何淚流滿面。他用力扛起轎。）起轎——！');
    for (const [id] of bearers) S.move(id, 'UUUUUU', { speed: 2, wait: false });
    (async () => { await Mover.slide(S, 'c6_pal', 20, 18, 2.6); await Mover.fade(S, 'c6_pal', 0.6); })();
    await wait(S, 1.2);
    S.flag('ch6_yanshui_done');
    S.quest('q_yanshui_mother', 'done');
    await S.lantern('lantern_yanshui', '轎夫與母親');
    await S.give('c6_wumiao_charm');
    await S.fadeOut(0.5);
    for (const [id] of bearers) S.remove(id);
    Mover.remove('c6_pal');
    S.cameraFollow();
    S.gather();
    S.bgm('festival');
    await S.fadeIn(0.5);
    S.objective('到鹽水客棧休息，天亮往府城');
  };

  // =================================================================================================== 3-3 蜂炮夜
  const yanshuiWave = async (S, troop, ghosts, party, rules) => {
    for (const [i, [x, y]] of ghosts.entries()) S.spawn({ id: 'pg' + i, sprite: i % 2 ? 'ghost_f' : 'ghost_m', x, y, dir: party[3], ghost: true });
    S.setPos('player', party[0], party[1], party[3]);
    S.gather();
    await wait(S, 0.5);
    const r = await S.battle(troop, Object.assign({ bgmAfter: 'procession' }, rules || beehiveRules()));
    for (let i = 0; i < ghosts.length; i++) S.remove('pg' + i);
    return r;
  };
  Sc.beehive = async (S) => {
    await S.say('林伯', '……時辰到了。起轎！');
    await S.fadeOut(0.8);
    S.flag('ch6_night');
    await S.warp('yanshui', 23, 10, 'left', { fade: 0, noAutosave: true });
    stage(S, [['player', 23, 10, 'left'], ['baizhi', 24, 10, 'left'], ['hongying', 23, 11, 'left'], ['yungui', 24, 11, 'left'], ['tuanzi', 22, 11, 'left']]);
    const bearers = [['bear_ayi', 22, 7], ['bear_b', 19, 7], ['bear_c', 19, 9], ['bear_d', 22, 9]];
    for (const [id, x, y] of bearers) S.spawn({ id, sprite: id === 'bear_ayi' ? 'villager_m2' : 'villager_m', x, y, dir: 'down' });
    S.spawn({ id: 'crowd_hat', sprite: 'old_m', x: 25, y: 12, dir: 'left' });
    const pal = Mover.add('c6_pal', 'palanquin', 20, 5);
    pal.alpha = 0;
    S.bgm('procession');
    await S.camera(21, 10, 0.1);
    await S.fadeIn(0.8);
    S.sfx('gong');
    await S.say('', '夜。武廟前。鑼鼓、北管嗩吶齊響。');
    tw(pal, { alpha: 1 }, 0.6);
    await Mover.slide(S, 'c6_pal', 20, 7, 1.4);
    await S.say('', '神轎抬出廟門。人群裹著棉襖、戴著斗笠、毛巾包頭，像一群圓滾滾的粽子。');
    S.emote('tuanzi', '!');
    await S.say('tuanzi:surprise', '大家都變成吾的形狀了！');
    // the first 炮城
    S.sfx('fire'); S.sfx('thunder', 0.2); S.sfx('crit', 0.4);
    S.flash('#ffe6a0', 0.5, 0.8); S.shake(10, 0.8);
    S.particles(['embers', { type: 'embers', density: 2 }, 'sparkles']);
    await S.say('', '嘶——轟！第一座炮城點燃。成千上萬支沖天炮像蜂群一樣橫掃而出，砸在人群身上，火花四濺。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '哇啊啊啊！是朝人射的！？');
    await S.say('斗笠阿伯', '哈哈哈！就是要給它炸！炸越多越旺！');
    S.sfx('hit');
    await S.jump('yungui', 30);
    S.emote('yungui', '💢');
    await S.say('yungui:hurt', '——！');
    await S.say('yungui:serious', '……我收回「運氣真好」那句話。');
    await S.say('hongying:laugh', '哈哈哈哈！');
    await S.say('baizhi:laugh', '好亮！好吵！好像整條街都在笑！');
    // the lamps turn deep blue
    S.sfx('ghost'); S.sfx('dark', 0.3);
    S.flash('#3a5aff', 0.6, 0.5);
    YS.plague = true;
    await S.say('', '忽然，巷口的長明燈一齊轉成深藍。炮聲中，混進了咳嗽聲。');
    const ghostSpots = [[14, 17], [15, 18], [27, 23], [28, 24], [30, 29], [31, 28]];
    for (const [i, [x, y]] of ghostSpots.entries()) S.spawn({ id: 'pgx' + i, sprite: i % 2 ? 'ghost_f' : 'ghost_m', x, y, dir: 'up', ghost: true });
    await S.camera(21, 20, 1.0);
    await S.say('', '一隻、兩隻、十隻——灰白色的人影從巷子裡爬出來，咳著，伸著手。');
    S.cameraFollow();
    await wait(S, 0.4);
    await S.say('xinghe:serious', '瘟鬼！');
    await S.say('yungui:serious', '八年前那場瘟死去的人。被長明燈的冷光吸過來，又被炮聲嚇得四處亂竄。');
    await S.say('hongying:serious', '人群看不見它們。它們會撞進人群裡——');
    await S.say('baizhi:serious', '他們不是想害人。他們只是……好冷，好怕。');
    await S.say('xinghe:serious', '那就先把他們從人群旁邊引開！');
    for (let i = 0; i < ghostSpots.length; i++) S.remove('pgx' + i);
    S.objective('跟著神轎走，把瘟鬼從人群旁邊引開');
    // wave 1 — 小巷A口
    for (const [id] of bearers) S.move(id, 'DDDDDDD', { speed: 2.2, wait: false });
    await Mover.slide(S, 'c6_pal', 20, 14, 3.2);
    let r = await yanshuiWave(S, 't_c6_yanshui_1', [[15, 17], [16, 17], [14, 18]], [19, 17, 0, 'left']);
    if (r !== 'win') return;
    await S.say('斗笠阿伯', '少年仔！接著——濕毛巾！包頭包脖子！');
    healPct(0.3);
    // wave 2 — 小巷B口
    for (const [id] of bearers) S.move(id, 'DDDDDD', { speed: 2.2, wait: false });
    await Mover.slide(S, 'c6_pal', 20, 20, 2.8);
    r = await yanshuiWave(S, 't_c6_yanshui_2', [[26, 23], [27, 23], [28, 22]], [23, 23, 0, 'right']);
    if (r !== 'win') return;
    await S.say('hongying:serious', '還有！巷子裡還在爬出來！');
    healPct(0.3);
    // wave 3 — 小巷C口
    for (const [id] of bearers) S.move(id, 'DDDDDD', { speed: 2.2, wait: false });
    await Mover.slide(S, 'c6_pal', 20, 26, 2.8);
    r = await yanshuiWave(S, 't_c6_yanshui_3', [[26, 29], [27, 29], [28, 28], [29, 29]], [23, 29, 0, 'right']);
    if (r !== 'win') return;
    healPct(0.35);
    // 疫聚
    YS.fog = 1;
    S.sfx('dark'); S.sfx('ghost', 0.3);
    stage(S, [['player', 32, 29, 'right'], ['baizhi', 31, 28, 'right'], ['hongying', 31, 30, 'right'], ['yungui', 30, 29, 'right'], ['tuanzi', 30, 30, 'right']]);
    await S.camera(37, 27, 1.0);
    await S.say('', '大疫塚的方向，所有長明燈的藍光被一股力量吸走，匯成一團巨大的、咳嗽著的灰霧。');
    await S.say('', '上百張臉，在霧裡浮沉。');
    await S.say('yungui:serious', '它們被燈聚在一起了……那不是一隻鬼，是一整年的哭。');
    r = await S.battle('t_c6_plague_mass', Object.assign({ bgmAfter: 'procession' }, beehiveRules({ chance: 0.6, k: 15, forceAt: { id: 'c6_plague_mass', at: 0.3 } })));
    if (r !== 'win') return;
    YS.fog = 0;
    YS.dazed = true;
    const dazed = [[36, 26], [38, 26], [40, 28], [37, 29], [39, 30], [35, 28]];
    for (const [i, [x, y]] of dazed.entries()) S.spawn({ id: 'dz' + i, sprite: i % 2 ? 'ghost_f' : 'ghost_m', x, y, dir: 'left', ghost: true });
    await S.say('', '灰霧潰散了。但瘟鬼們沒有消失，只是茫然地站在原地。');
    // the palanquin turns into the junction by the mound
    for (const [id] of bearers) S.move(id, 'DDRRRRR', { speed: 2.2, wait: false });
    S.sfx('gong');
    await Mover.slide(S, 'c6_pal', 25, 27, 3.0);
    await S.say('', '鑼鼓聲逼近。關帝的神轎轉進大疫塚前的路口。轎夫們汗流浹背，炮火如雨。');
    await S.say('轎夫', '……轎……變重了。');
    S.emote('bear_b', '!'); S.emote('bear_c', '!');
    await Mover.nod(S, 'c6_pal', 3);
    await S.say('', '神轎微微轉向，朝著瘟鬼們的方向，輕輕點了三下。');
    S.sfx('gong');
    await wait(S, 0.8);
    S.sfx('fire'); S.sfx('thunder', 0.15); S.sfx('crit', 0.3); S.sfx('fire', 0.5);
    S.flash('#ffd060', 0.9, 0.85); S.shake(12, 1.2);
    S.particles(['sparkles', { type: 'embers', density: 3 }, 'lanterns']);
    await S.say('', '所有炮城在同一瞬間齊發。整片夜空，化成金色的雨。');
    for (let i = 0; i < dazed.length; i++) {
      const a = S.actor('dz' + i);
      if (a) { tw(a, { offsetY: -80 }, 1.8); S.fadeActor('dz' + i, 0, dur(1.8)); }
      S.sfx('lantern', 0.1 * i);
      await wait(S, 0.25);
    }
    await S.say('', '金色的火花落在瘟鬼身上。它們不再咳嗽，一個接一個抬起頭，化成一點點微光，跟著上升的火花飛向夜空。');
    await wait(S, 0.8);
    for (let i = 0; i < dazed.length; i++) S.remove('dz' + i);
    YS.plague = false; YS.dazed = false;
    await S.say('baizhi:surprise', '……他們不冷了。');
    await S.say('xinghe:think', '剛才……神轎自己轉過去的？');
    S.spawn({ id: 'keeper_s', sprite: 'temple_keeper', x: 28, y: 29, dir: 'left' });
    await S.move('keeper_s', 'LL');
    S.face('keeper_s', 'player');
    await S.say('林伯', '帝君出巡，不只是趕瘟。');
    await S.say('林伯', '也是來接那些走得太急、來不及說再見的人。');
    for (const [id] of bearers) S.move(id, 'DDDDD', { speed: 2, wait: false });
    (async () => { await Mover.slide(S, 'c6_pal', 21, 31, 3.2); await Mover.fade(S, 'c6_pal', 0.8); })();
    await S.say('', '關帝神轎繼續前行，消失在硝煙與炮火中。');
    S.bgm('festival', { fade: 2 });
    await wait(S, 1.2);
    for (const [id] of bearers) S.remove(id);
    S.remove('keeper_s'); S.remove('crowd_hat');
    Mover.remove('c6_pal');
    S.flag('ch6_beehive');
    S.quest('q_ch6_main', 1);
    S.cameraFollow();
    S.gather();
    S.particles(['embers', 'lanterns', { type: 'embers', density: 1.5 }]);
    if (S.has('ch6_ayi_met')) {
      await S.say('baizhi:think', '……大疫塚那邊，還有一個人沒有走。');
      if (G.Quests.stage('q_yanshui_mother') < 1) S.quest('q_yanshui_mother', 1);
    }
    S.objective('到鹽水客棧休息，天亮往府城');
  };

  Sc.yanshuiInn = async (S, n) => {
    if (S.has('ch6_beehive') && !S.has('ch6_fucheng')) {
      await S.say('客棧老闆娘', '今暗看炮辛苦了！房間留給你們了——今年元宵，算我請客。');
      if (S.has('ch6_ayi_met') && !S.has('ch6_yanshui_done')) await S.say('yungui:think', '……大疫塚那邊，好像還有放不下的人。要先去看看嗎？');
      const c = await S.choice(['休息到天亮（前往府城）', '再逛一下'], { cancel: 1 });
      if (c === 0) await Sc.toFucheng(S);
      return;
    }
    await S.say('客棧老闆娘', '今暗住我這，窗仔要關緊。炮會從窗仔飛進來。真的。');
    await S.inn(50, { who: '客棧老闆娘' });
  };

  // =================================================================================================== 3-4 前往府城
  Sc.toFucheng = async (S) => {
    await S.fadeOut(0.8);
    G.Music.stop(0.8);
    G.Party.healAll();
    S.sfx('heal');
    await wait(S, 1.0);
    await S.warp('yanshui', 25, 17, 'down', { fade: 0, noAutosave: true });
    S.light({ ambient: 0.08, color: '#2a2018', tint: 'rgba(255,220,180,0.08)' });
    S.particles(['motes']);
    stage(S, [['player', 25, 17, 'down'], ['baizhi', 26, 17, 'down'], ['hongying', 24, 18, 'right'], ['yungui', 27, 18, 'left'], ['tuanzi', 25, 18, 'up']]);
    S.bgm('pingxi');
    await S.fadeIn(0.8);
    await S.say('', '清晨。鹽水客棧門口。全身都是火藥味的四個人。');
    await S.say('hongying:normal', '我的頭髮……裡面還有炮屑。');
    await S.say('yungui:normal', '我的屁股……還在痛。');
    await S.say('baizhi:smile', '雲歸今年會很旺。');
    await S.say('yungui:sad', '……我寧願不旺。');
    await S.travel('yanshui', 'tainan', { label: '牛車往南，搖搖晃晃……' });
    S.flag('ch6_fucheng');
    V().ch6_time = 0;
    S.quest('q_ch6_main', 2);
    await S.warp('fucheng', 31, 1, 'down', { fade: 0.4 });
  };

  Sc.fuchengArrive = async (S) => {
    S.flag('ch6_fc_arrive');
    stage(S, [['player', 31, 2, 'down'], ['baizhi', 32, 2, 'down'], ['hongying', 31, 1, 'down'], ['yungui', 32, 1, 'down'], ['tuanzi', 32, 3, 'down']]);
    await S.say('', '遠方，一座古城的城牆在陽光裡浮現。');
    await S.say('xinghe:smile', '府城。一府二鹿三艋舺的「一」。');
    await S.say('hongying:serious', '師父——雲歸的師父，玄冥法師，還有我哥。都在這裡。');
    await S.say('yungui:serious', '……嗯。');
    await S.say('yungui:normal', '長明宮在城西。先去看看。');
    S.gather();
    S.objective('前往府城西邊的長明宮');
  };

  // =================================================================================================== 3-5 長明宮前埕・墨鴉
  Sc.queueBaizhi = async (S) => {
    if (S.has('ch6_queue_bz')) return;
    S.flag('ch6_queue_bz');
    await S.say('baizhi:sad', '……他們好愛那些人。');
  };
  Sc.fcGuard = async (S) => {
    if ((V().ch6_time || 0) >= 2) { await S.say('長明宮守門衛', '大典進行中。閒雜人等，退後。'); return; }
    if (S.has('ch6_moya')) { await S.say('長明宮守門衛', '……又是你們？走走走，墨護法交代過了！'); return; }
    await S.say('長明宮守門衛', '法師今日不見客。要點燈，去後面排隊。');
  };
  Sc.moya = async (S) => {
    S.flag('ch6_moya');
    const p = S.actor('player');
    const px = U.clamp(p.x, 3, 7), py = 6;
    stage(S, [['player', px, py + 1, 'up'], ['baizhi', px + 1, py + 2, 'up'], ['hongying', px - 1, py + 2, 'up'], ['yungui', px, py + 2, 'up'], ['tuanzi', px + 1, py + 1, 'up']]);
    S.bgm('palace', { fade: 1 });
    await S.say('', '長明宮前埕。數百人排成長龍，每人手裡捧著一盞未點的長明燈。山門藍白，門楣大匾「長明」。');
    await S.say('', '高台已經搭好，四周掛滿藍色燈籠。宮內傳來誦經與法器聲。');
    S.emote('baizhi', '💧');
    await S.say('baizhi:sad', '……好多。比艋舺多一百倍。');
    await S.say('xinghe:serious', '白芷？');
    await S.say('baizhi:sad', '牆的後面……有好多好多人在說話。他們在說自己的名字。一直說、一直說，怕自己忘記。');
    await S.walkTo('yungui', 6, 5);
    S.face('yungui', 'up');
    await S.say('yungui:normal', '這位大哥，請問——兩個月前，有沒有一個灰袍道士來過？');
    await S.say('長明宮守門衛', '法師今日不見客。要點燈，去後面排隊。');
    await S.say('yungui:smile', '我不點燈，我找人。他鬍子很長，講話很欠——');
    await S.move('fc_guard', 'L');
    S.spawn({ id: 'moya_s', sprite: 'moya', portrait: 'moya', x: 6, y: 3, dir: 'down' });
    await S.move('moya_s', 'D');
    await S.say('moya:smug', '喲喲喲——這不是九份的小鬼們嗎？');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '墨鴉！？');
    await S.say('moya:smug', '叫「墨護法」。我升官了。');
    await S.say('moya:smug', '託你們的福，九份那一戰之後，法師說我「需要多歷練」，就升了。');
    await S.say('hongying:think', '……那不是降職的說法嗎？');
    S.emote('moya_s', '💢');
    await S.say('moya:angry', '是升官！');
    S.face('moya_s', 'baizhi');
    await S.say('moya:smug', '而且還把燈靈大人送上門來——今天真是我的好日子！來人——');
    await S.walkTo('tuanzi', 6, 6);
    await S.jump('tuanzi', 40);
    S.sfx('slash');
    S.emote('moya_s', '!');
    await S.say('', '糰子跳起來，一口咬住墨鴉的羽毛斗篷。');
    await S.say('moya:surprise', '呀啊！什麼東西！？貓！？');
    S.sfx('slash2');
    await S.say('tuanzi:angry', '吾不是貓！');
    await S.say('', '糰子扯下了一大把黑羽毛。');
    await S.say('yungui:serious', '走！');
    S.sfx('flee');
    await S.fadeOut(0.5);
    await S.say('', '四人轉身鑽進排隊的人潮。守衛追來，被捧著長明燈的人群擋住，燈掉了一地，一片抗議聲。');
    await S.say('moya:angry', '給我抓——！不對，先把燈撿起來！那都是錢！——不是，是心意！');
    S.remove('moya_s');
    S.setPos('fc_guard', 6, 4, 'down');
    await S.warp('fucheng', 44, 6, 'down', { fade: 0, noAutosave: true });
    stage(S, [['player', 44, 6, 'down'], ['baizhi', 45, 6, 'left'], ['hongying', 43, 7, 'right'], ['yungui', 44, 7, 'up'], ['tuanzi', 45, 7, 'up']]);
    S.bgm('tainan');
    await S.fadeIn(0.5);
    await S.say('yungui:normal', '（喘氣）……正門是不用想了。');
    await S.say('hongying:serious', '墨鴉說「燈靈大人」。他們知道白芷是誰。');
    await S.say('xinghe:serious', '……今晚不管怎樣，都要進去。雲歸的師父可能就在裡面。');
    await S.say('yungui:think', '打聽一下。這種大廟，總有後門、側門、運貨的門。');
    await S.say('hongying:normal', '五條港那邊人多。剛才聽補網的阿姨說，七娘媽廟下午有人家在辦事——人多的地方，消息也多。');
    S.gather();
    S.quest('q_ch6_main', 3);
    S.objective('在府城打聽進入長明宮的方法（七娘媽廟、五條港）');
  };

  // =================================================================================================== 3-6 七娘媽廟：做十六歲
  function pavilion(on, y = 7) {
    const ms = MS();
    ms.objects = ms.objects.filter((o) => o.t !== 'qixi_pavilion');
    if (on) ms.objects.push({ t: 'qixi_pavilion', x: 7, y, key: 'qixi', v: 0, solid: false });
    ms.computeSolid();
    return ms.objects.find((o) => o.t === 'qixi_pavilion');
  }
  async function burnPavilion(S) {
    S.sfx('fire');
    S.flash('#ffb060', 0.5, 0.6);
    const ms = MS();
    const o = ms.objects.find((x) => x.t === 'qixi_pavilion');
    if (o) { await tw(o, { alpha: 0 }, 1.2, 'linear'); }
    pavilion(false);
    S.particles(['embers', 'lanterns', 'petals']);
    await wait(S, 0.6);
  }
  async function crawl(S, id, times, onPass) {
    for (let i = 0; i < times; i++) {
      await S.move(id, i % 2 ? 'LLLLL' : 'RRRRR', { speed: 2.4 });
      if (onPass) await onPass(i);
    }
  }
  Sc.sixteen = async (S) => {
    S.flag('ch6_sixteen_rite');
    S.bgm('love');
    stage(S, [['player', 10, 10, 'up'], ['baizhi', 11, 10, 'up'], ['hongying', 12, 10, 'up'], ['yungui', 13, 10, 'up'], ['tuanzi', 9, 10, 'up']]);
    S.setPos('fc_zhengsao', 4, 8, 'right'); S.setPos('fc_ajin', 5, 8, 'right'); S.setPos('fc_zhengfa', 11, 7, 'left'); S.setPos('fc_qn_keeper', 4, 4, 'down');
    pavilion(true);
    await S.say('', '七娘媽廟前庭。一家人圍著供桌：麻油雞、油飯、紅龜粿、七碗湯圓、胭脂花粉。中央是一座紙糊的七娘媽亭，五彩斑斕。');
    await S.say('', '一個瘦高的少年——阿進——穿著新衣，緊張地站著。母親鄭嫂在替他整理衣領。');
    S.emote('baizhi', '?');
    await S.say('baizhi:think', '……那是什麼？好漂亮的紙房子。');
    await S.say('廟婆', '七娘媽亭。今天鄭家的阿進，做十六歲。');
    await S.say('xinghe:surprise', '做十六歲？可是……不是七夕才做嗎？');
    await S.say('廟婆', '你這少年仔懂喔。做十六歲本來是七月初七，七娘媽生。');
    await S.move('fc_zhengsao', 'R');
    S.face('fc_zhengsao', 'player');
    await S.say('鄭嫂', '阿進過幾日就要上船，去唐山學做生理。七夕前回不來。');
    await S.say('鄭嫂', '我怕他過黑水溝……來這裡擲筊問七娘媽，可不可以提早做。');
    await S.say('廟婆', '三個聖筊。七娘媽准了。');
    await S.say('hongying:think', '為什麼一定要做？');
    await S.say('廟婆', '七娘媽是囝仔的保護神。從出世，到十六歲，囝仔都在七娘媽的照顧底下。');
    await S.say('廟婆', '滿十六，就要「出婆姐間」——離開七娘媽的手，自己去走人生的路。');
    await S.say('鄭嫂', '而且啊，我們五條港的囝仔，滿十六歲才領全份工錢。這一天，是當大人的第一天。');
    // the rite
    S.bgm('pingxi');
    S.setPos('fc_zhengsao', 6, 7, 'right'); S.setPos('fc_zhengfa', 9, 7, 'left'); S.setPos('fc_ajin', 4, 8, 'right');
    const pv = pavilion(true);
    await tw(pv, { y: 6.6 }, 0.8);
    await S.say('', '儀式開始。阿進的父母一左一右，高高舉起七娘媽亭。阿進彎著腰，從亭子底下鑽過去——');
    await crawl(S, 'fc_ajin', 3, async (i) => { S.sfx('chest'); await S.say('', ['一次。', '兩次。', '三次。'][i]); });
    S.emote('fc_zhengsao', '💧');
    await S.say('鄭嫂', '好、好……我的囝仔大人了……');
    S.emote('fc_ajin', '…');
    await S.say('阿進', '阿母，妳莫哭啦……很多人在看……');
    await burnPavilion(S);
    await S.say('', '他們把七娘媽亭連同金紙一起燒了。紙亭在火裡化成金色的灰，往天上飄。');
    await S.say('baizhi:think', '……');
    await S.move('baizhi', 'UL');
    S.face('baizhi', 'fc_zhengsao'); S.face('fc_zhengsao', 'baizhi');
    await S.say('baizhi:think', '鄭嫂嫂。我可以問一個問題嗎？');
    await S.say('鄭嫂', '妳問。');
    await S.say('baizhi:sad', '不知道自己幾歲的人……也可以轉大人嗎？');
    S.emote('player', '…'); S.emote('hongying', '…');
    await S.say('baizhi:sad', '我不記得我是什麼時候出生的。冬至的時候，我吃了一顆湯圓，星河說我一歲。');
    await S.say('baizhi:think', '一歲的人，可以做十六歲嗎？');
    await S.say('鄭嫂', '……');
    await S.say('鄭嫂', '（擦掉眼淚，握住白芷的手）姑娘，轉大人，不是數字。');
    await S.say('鄭嫂', '阿進他阿爸講，十六歲，就是開始能替別人扛東西的年紀。');
    await S.say('鄭嫂', '扛貨、扛家、扛別人的難過。');
    await S.say('baizhi:think', '替別人扛東西……');
    await S.say('baizhi:serious', '……那我想要。我想要替大家扛一點東西。');
    await S.say('鄭嫂', '妳這孩子。……還有一半，妳要記得。');
    await S.say('鄭嫂', '大人要替人扛，也要讓別人替妳扛。只會扛、不肯給人扛的，不是大人，是憨人。');
    await S.say('baizhi:think', '……讓別人替我扛。');
    await S.say('廟婆', '阿進的亭燒了，可是金紙店還有一座備用的。姑娘，要不要問問七娘媽？');
    await S.say('baizhi:surprise', '可以嗎？');
    await S.say('廟婆', '問了才知道。');
    await S.walkTo('baizhi', 7, 5);
    S.face('baizhi', 'up');
    await S.say('', '白芷跪在七娘媽前，雙手捧筊。');
    await S.say('baizhi:serious', '七娘媽……我是白芷。我不知道我幾歲，也不知道我從哪裡來。');
    await S.say('baizhi:serious', '可是我想長大。請問……可以嗎？');
    const jb = await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['sheng'], prompt: '白芷誠心默禱……按 Z 擲筊' });
    void jb;
    await S.say('廟婆', '聖筊。七娘媽說：好。');
    S.spawn({ id: 'paper_man', sprite: 'merchant', x: 7, y: 11, dir: 'up' });
    await S.move('paper_man', 'UU');
    await S.say('金紙店老闆', '來了來了！備用的亭仔！還好有多糊一座！');
    const pv2 = pavilion(true);
    pv2.alpha = 0; tw(pv2, { alpha: 1 }, 0.6);
    await S.move('paper_man', 'DD');
    S.remove('paper_man');
    await S.say('廟婆', '亭子要由家人舉。姑娘，妳的家人呢？');
    await S.say('baizhi:think', '我的家人……');
    S.setPos('fc_zhengsao', 3, 6, 'right'); S.setPos('fc_zhengfa', 12, 6, 'left'); S.setPos('fc_ajin', 12, 8, 'left');
    await S.walkTo('player', 6, 7, { yFirst: true });
    S.face('player', 'right');
    await S.say('xinghe:smile', '這裡。');
    await S.walkTo('hongying', 9, 7, { yFirst: true });
    S.face('hongying', 'left');
    await S.say('hongying:shy', '……這裡也是。');
    await S.walkTo('yungui', 8, 6, { yFirst: true });
    S.face('yungui', 'down');
    await S.say('yungui:smile', '道士也算家人吧。');
    await S.walkTo('tuanzi', 7, 8);
    await S.say('tuanzi:smile', '吾負責在底下等妳！');
    await S.walkTo('baizhi', 4, 8);
    S.face('baizhi', 'right');
    await tw(pv2, { y: 6.6 }, 0.8);
    await S.say('', '三人舉起七娘媽亭。白芷彎腰，從亭下鑽過去。');
    await crawl(S, 'baizhi', 3, async (i) => { S.emote('tuanzi', '♥'); S.sfx('chest'); await S.say('', ['一次。（糰子用頭頂了一下她的手。）', '兩次。（糰子又頂了一下。）', '三次。'][i]); });
    await burnPavilion(S);
    await S.say('', '燒亭。金色的灰往天上飄。白芷看著它。');
    await S.say('baizhi:smile', '……我出婆姐間了。');
    await S.say('baizhi:laugh', '星河，我一歲，也十六歲了。');
    await S.say('xinghe:laugh', '妳這樣算數，以後會很麻煩喔。');
    await S.say('baizhi:smile', '那你要陪我一起算。');
    await S.say('鄭嫂', '你們幾個，有去處嗎？元宵暗，府城到處都是人，客棧都滿了。');
    await S.say('鄭嫂', '我家在五條港，門口是我公公的肉粽攤。若無所在住，來我家擠一擠。');
    await S.give('c6_qiniang_rouge');
    await S.give('c6_sesame_chicken', 3);
    S.flag('ch6_sixteen');
    S.quest('q_ch6_main', 4);
    S.objective('去五條港鄭家，找肉粽伯');
    S.bgm('tainan');
    S.gather();
  };

  // =================================================================================================== 3-7 肉粽伯
  Sc.rouzongTalk = async (S, n) => {
    if (S.has('ch6_sixteen') && !S.has('ch6_rouzong')) { await Sc.rouzong(S); return; }
    if (S.has('ch6_linto_done')) {
      await S.say('肉粽伯', '……你們見到伊了？伊……走了？');
      await S.say('肉粽伯', '（眼眶紅了）好、好。我阿爸若知，一定很歡喜。');
      return;
    }
    if (S.has('ch6_rouzong')) await S.say('肉粽伯', '林投林在西南邊。暗時，小心。……肉粽帶著，餓了吃。');
    else await S.say('肉粽伯', '府城肉粽，竹葉包，花生、香菇、鹹蛋黃！');
    await S.shop(['c6_zongzi'], { title: '肉粽攤' });
  };
  Sc.rouzong = async (S) => {
    S.flag('ch6_rouzong');
    S.face('fc_rouzong', 'player');
    S.face('player', 'fc_rouzong');
    await S.say('肉粽伯', '哦，阿媳講的就是你們？來來來，吃肉粽！今暗元宵，我請客！');
    S.emote('tuanzi', '♥');
    await S.say('tuanzi:laugh', '肉粽！！');
    await S.say('', '糰子一口一個。');
    await S.say('yungui:normal', '阿伯，打聽個事。長明宮除了正門，還有別的路進去嗎？');
    S.emote('fc_rouzong', '…');
    await S.say('肉粽伯', '……你們要進長明宮？');
    await S.say('肉粽伯', '（壓低聲音）我暗時在西邊賣肉粽，賣了四十年。看過一些……不該看的東西。');
    await S.say('肉粽伯', '長明宮後面，靠台江舊海岸那邊，有一大片林投林。林投林盡頭，海邊有一個石頭砌的水門。');
    await S.say('肉粽伯', '每暝三更，黑色的船從海上來，一箱一箱的罐子，搬進水門裡。罐子在發藍光。');
    await S.say('肉粽伯', '兩個月前，有一個灰袍、長鬍子的道士，向我買了兩粒肉粽。');
    S.emote('yungui', '!');
    await S.say('yungui:surprise', '！');
    await S.say('肉粽伯', '他說：「阿伯，林投林怎麼走？」我跟他講，暗時莫去，林投林有鬼。');
    await S.say('肉粽伯', '他笑笑說：「我就是要去見鬼。」吃完肉粽，就往林投林去了。');
    await S.say('肉粽伯', '後來……再也沒看到他出來。');
    await S.say('yungui:serious', '（握緊摺扇）……那老頭，連吃東西都在留線索給我。');
    await S.say('hongying:think', '林投林有鬼？');
    await S.say('肉粽伯', '（嘆氣）你們聽過林投姐嗎？');
    await S.say('肉粽伯', '很久以前，府城有一個寡婦，叫李昭娘。翁婿死了，留給她一筆錢、一個囝仔。');
    await S.say('肉粽伯', '後來來了一個唐山的生理人，姓周。嘴很甜。說要娶她，說要拿她的錢去唐山做大生理。');
    await S.say('肉粽伯', '錢一到手，人就坐船走了。再也沒回來。後來才知道，他在唐山早就有家了。');
    await S.say('肉粽伯', '昭娘沒了錢，囝仔生病，沒錢醫……走了。');
    await S.say('肉粽伯', '她抱著囝仔，走到海邊的林投林，在一棵林投樹上……吊死了。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '……那個姓周的！');
    await S.say('肉粽伯', '後來，夜裡常有一個女人，來跟賣肉粽的買肉粽。付的是銅錢。');
    await S.say('肉粽伯', '天光以後打開錢筒——銅錢變成冥紙。');
    await S.say('肉粽伯', '……那個賣肉粽的，是我阿爸。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '！');
    await S.say('肉粽伯', '我阿爸說，那個女人每次都買兩粒。一粒自己的，一粒給囝仔的。');
    await S.say('肉粽伯', '他後來知道了，也照樣賣她。他說：「伊是可憐人，不是壞鬼。」');
    await S.say('肉粽伯', '現在，林投林裡暗時還聽得到她在哭。走進去的人，都會迷路。');
    S.face('baizhi', 'left');
    await S.say('baizhi:sad', '（看向西邊）……她現在也在哭。我聽得到。');
    await S.say('', '肉粽伯包了兩粒肉粽，用竹葉繩綁好，遞給白芷。');
    await S.say('肉粽伯', '……若遇到伊，替我阿爸，送伊兩粒。');
    await S.give('c6_zheng_zongzi', 2);
    await S.give('c6_zongzi', 5);
    V().ch6_time = 1;
    S.light(FC_LIGHT[1]);
    S.particles(['lanterns']);
    S.quest('q_ch6_main', 5);
    await S.say('yungui:normal', '天黑前還有一點時間。要逛元宵的話，現在逛。');
    await S.say('yungui:normal', '今晚進去之後……不知道還有沒有機會。');
    S.objective('黃昏後，穿過府城西南的林投林，找到長明宮的水門');
  };

  // =================================================================================================== 府城 NPC scripts
  Sc.dockTalk = async (S, n) => {
    await S.say('大頭', '五條港，五條水道，一條一個郊、一個姓在管。我們扛貨的，一天扛到腰斷。');
    await S.say('大頭', '囝仔來做工，只領半份工錢。滿十六歲，才算大人，領全份。');
    await S.say('大頭', '所以啊，府城人做十六歲做得特別認真——那是囝仔第一次被當成大人。');
    if (S.has('ch6_sixteen')) await S.say('大頭', '阿進那囝仔，今天正式是大人了。明天起，領全份！');
    else await S.say('大頭', '我表弟在艋舺也叫「大頭」。我們家的頭，都很大。');
  };
  Sc.yuanxiaoTalk = async (S, n) => {
    await S.say('元宵攤', '湯圓是搓的，元宵是滾的！不一樣喔！');
    if (!S.has('ch6_yuanxiao_bz')) {
      S.flag('ch6_yuanxiao_bz');
      await S.say('baizhi:think', '……吃了也會加一歲嗎？');
      await S.say('元宵攤', '這個不會啦！');
      await S.say('baizhi:sad', '……');
    }
    await S.shop(['c6_yuanxiao'], { title: '元宵攤' });
  };
  Sc.scholarTalk = async (S, n) => {
    await S.say('陳秀才', '全臺首學——台灣第一間學堂。讀書人到府城，第一件事就是來這裡拜至聖先師。');
    await S.say('陳秀才', '大成殿裡沒有神像，只有牌位。夫子說「敬鬼神而遠之」……我是很尊敬的，所以站遠一點。');
    if (S.has('ch6_scholar')) return;
    S.flag('ch6_scholar');
    await S.say('baizhi:think', '讀書是為了什麼？');
    await S.say('陳秀才', '為了……考試？');
    await S.say('yungui:smug', '我考過，沒中，所以去修道了。');
    S.emote('hongying', '!');
    await S.say('hongying:surprise', '你考過！？');
    await S.say('陳秀才', '……其實，是為了讓死去的人說過的話，不會被忘記吧。書就是這樣的東西。');
  };
  Sc.zhengRest = async (S, n) => {
    if (S.has('ch6_linto_done')) {
      await S.say('鄭嫂', '你們……是要去做什麼危險的事吧？我看得出來。阿進他阿爸出海前，也是這種臉。');
      await S.say('鄭嫂', '記得喔。要替人扛，也要讓人替你們扛。');
    } else {
      await S.say('鄭嫂', '來來來，坐。元宵暗，客棧都滿了，若無所在住，就在這擠一擠。');
    }
    const c = await S.choice(['休息一下（免費）', '不用了'], { cancel: 1 });
    if (c !== 0) return;
    await S.fadeOut(0.6);
    G.Party.healAll();
    S.sfx('heal');
    await wait(S, 0.8);
    await S.fadeIn(0.6);
    S.toast('在鄭家歇了一會兒，全員恢復了精神。', 'lantern');
  };

  // =================================================================================================== 3-8 大天后宮・月下老人
  Sc.yuelao = async (S) => {
    S.flag('ch6_yuelao');
    stage(S, [['player', 18, 7, 'right'], ['baizhi', 17, 8, 'right'], ['hongying', 18, 8, 'right'], ['yungui', 17, 7, 'right'], ['tuanzi', 19, 9, 'up']]);
    S.face('fc_mazu_keeper', 'player');
    await S.say('', '大天后宮側殿。月下老人白鬍子、手持紅線。供桌上，一束一束的紅線。');
    await S.say('廟公', '來拜月老的？月老牽紅線，有緣千里來相會。');
    await S.say('hongying:smug', '（推星河）去啊。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '去、去什麼！');
    await S.say('yungui:smug', '擲個筊嘛。問問看。');
    await S.say('baizhi:think', '問什麼？');
    await S.say('yungui:smile', '問他心裡想的那件事。');
    await S.walkTo('player', 19, 4, { yFirst: true });
    S.face('player', 'up');
    await S.say('', '星河一把抓過筊，跪下，閉上眼睛。嘴唇動了動，沒有出聲。');
    await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['xiao'], prompt: '星河閉上眼睛……按 Z 擲筊' });
    await S.say('', '兩面平的，都朝上——');
    await S.say('xinghe:surprise', '這、這是什麼？');
    await S.say('廟公', '笑筊。月老在笑。');
    await S.say('廟公', '意思是：你問的那件事，你自己心裡早就知道答案了。');
    S.emote('hongying', '♪'); S.emote('yungui', '♪'); S.emote('baizhi', '?');
    await S.say('', '紅纓噗哧一聲。雲歸別過臉偷笑。白芷歪著頭。');
    await S.say('baizhi:think', '星河，你問了什麼？');
    await S.say('xinghe:shy', '沒、沒什麼！……問明天會不會下雨！');
    await S.say('baizhi:smile', '那你心裡知道會不會下雨嗎？');
    await S.say('xinghe:shy', '……');
    await S.say('廟公', '（遞給星河一小段紅線）拿著。綁在手上，月老會記得。');
    await S.give('c6_red_thread');
    S.gather();
  };

  // =================================================================================================== 3-9 赤崁樓 + P1 燈謎
  Sc.chikan = async (S) => {
    S.flag('ch6_chikan');
    await S.say('yungui:normal', '赤崁樓。底下那層紅磚，是荷蘭人留下來的城，叫普羅民遮城。');
    await S.say('yungui:normal', '上面那兩座樓——海神廟、文昌閣——是後來咱們的人蓋的。');
    await S.say('xinghe:think', '紅毛人的城上面，蓋了咱們的廟？');
    await S.say('yungui:smile', '一層疊一層。府城就是這樣的地方。誰來過，都留下一點東西。');
    if (S.has('ch3_soldiers_done')) await S.say('baizhi:smile', '就像淡水的迪亞哥和彼得。');
    await S.say('hongying:normal', '文昌閣前面掛的是什麼？');
    await S.say('yungui:smug', '燈謎。元宵猜燈謎。……輪到讀書人出場了。');
  };
  const RIDDLES = [
    { q: '「一口咬掉牛尾巴」——打一字。', o: ['告', '牛', '吃'], a: 0 },
    { q: '「千里相逢」——打一字。', o: ['重', '逢', '里'], a: 0 },
    { q: '「人在草木間」——打一字。', o: ['休', '茶', '林'], a: 1 },
    { q: '「十張口，一顆心」——打一字。', o: ['思', '叶', '恩'], a: 0 },
    { q: '「半部春秋」——打一字。', o: ['秦', '春', '秋'], a: 0 },
  ];
  Sc.riddles = async (S) => {
    if (S.has('ch6_riddle_done')) {
      await S.say('文伯', '今年的燈謎都被你們猜完囉。');
      await S.say('文伯', '少年仔，十張口說的話，不如一顆心。記得。');
      return;
    }
    await S.say('文伯', '元宵猜燈謎！五題，每題三選一。答錯不罰，可是每題只能答一次。');
    const go = await S.choice(['來猜！', '先不要'], { cancel: 1 });
    if (go !== 0) return;
    let n = 0;
    for (let i = 0; i < RIDDLES.length; i++) {
      const R = RIDDLES[i];
      await S.say('yungui:smug', '這題簡單。');
      await S.say('文伯', R.q);
      const c = await S.choice(R.o);
      if (c === R.a) {
        n++;
        S.sfx('chest');
        await S.say('文伯', '答對了！');
        if (i === 2) await S.say('baizhi:smile', '人在草木之間……就是我們在霧林的時候。');
        if (i === 3) await S.say('文伯', '十張口說的話，不如一顆心。少年仔，記得。');
      } else {
        S.sfx('buzz');
        await S.say('文伯', '可惜！');
        if (i === 0) await S.say('yungui:normal', '……這題其實不簡單。');
      }
    }
    V().ch6_riddle_n = n;
    S.flag('ch6_riddle_done');
    await S.say('文伯', `五題答對 ${n} 題！`);
    if (n >= 3) {
      await S.say('文伯', '好！這把燈謎紙扇，送給你們。');
      await S.give('c6_riddle_fan');
    }
    if (n === 5) {
      await S.say('文伯', '全對！文昌帝君也要點頭——這支文昌筆，是今年的大獎。');
      await S.give('c6_wenchang_brush');
    }
    if (n < 3) await S.say('文伯', '明年再來！燈謎年年都有。');
  };

  // =================================================================================================== 3-10 林投林
  Sc.lintoEnter = async (S) => {
    S.flag('ch6_linto_in');
    S.bgm('night');
    await S.say('', '黃昏轉夜。林投的長葉像一把把鋸齒刀，在海風裡沙沙作響。');
    await S.say('hongying:serious', '小心葉子，邊緣都是刺。');
    await S.say('baizhi:sad', '她在哭。……從很多地方傳來。');
    await S.say('yungui:think', '哭聲會帶路，也會繞路。照著哭聲最清楚的方向走。');
    S.objective('循著最清楚的哭聲，穿過林投林');
  };
  const HINTS = { A: '……我聽得到，往右邊。', B: '……我聽得到，往左邊。', C: '……我聽得到，往前走，中間那條。' };
  Sc.deadEnd = async (S, region) => {
    await S.say('', '路的盡頭，是一座無名墳。墳前擺著一顆被咬了一口的肉粽——舊的，早就乾了。');
    await S.say('', '……又繞回來了。');
    V().ch6_linto_wrong = (V().ch6_linto_wrong || 0) + 1;
    const [x, y] = LT.entries[region];
    await S.warp('linto', x, y, 'up', { noAutosave: true });
    if (V().ch6_linto_wrong >= 3) {
      S.emote('baizhi', '!');
      await S.say('baizhi:serious', HINTS[region]);
    }
  };

  // =================================================================================================== 3-11 林投姐
  Sc.lintoBoss = async (S) => {
    S.bgm('sad', { fade: 1.5 });
    stage(S, [['player', 13, 8, 'up'], ['baizhi', 14, 8, 'up'], ['hongying', 12, 8, 'up'], ['yungui', 15, 8, 'up'], ['tuanzi', 13, 9, 'up']]);
    await S.camera(11, 6, 1.0);
    await S.say('', '林投林深處。一棵巨大的老林投，氣根垂入沙地。樹下站著一個女人：散髮，白衣，臉朝著海，一動不動。');
    await S.say('', '海面上什麼都沒有。她卻一直望著。');
    await S.say('linto:sad', '……船，還沒來。');
    await S.say('linto:sad', '他說，三個月就回來。三個月……三年……三十年……');
    await S.say('xinghe:sad', '昭娘姊……');
    S.face('lj', 'down');
    S.sfx('ghost');
    await wait(S, 0.6);
    await S.say('', '林投姐慢慢轉過頭。臉是蒼白的，眼睛是兩個深深的黑洞，眼淚是黑色的。');
    await S.say('linto:normal', '你們……是他派來的？他叫你們來接我？');
    await S.say('hongying:sad', '……不是。');
    S.shake(10, 0.8);
    S.flash('#4a2a6a', 0.5, 0.6);
    S.sfx('wind'); S.sfx('earth', 0.2);
    await S.say('linto:angry', '那就走開！！我要等他！我要等他回來，問他為什麼！！');
    await S.say('', '林投葉片暴長，四周的氣根捲起沙浪。');
    const rules = lintoRules();
    const r = await S.battle('t_c6_linto_boss', rules);
    if (r !== 'win') return;
    V().ch6_listen = rules.c6.listens;
    S.cameraFollow();
    await S.camera(11, 6, 0.1);
    S.bgm('sad');
    await S.say('', '林投葉片垂了下來。林投姐跪在沙上，還是望著海。');
    S.face('lj', 'up');
    await S.say('linto:cry', '他不會回來了……對不對……');
    await S.say('xinghe:serious', '……嗯。他不會回來了。');
    await S.say('linto:cry', '……那我等了這麼久……是在等什麼……');
    await S.walkTo('baizhi', 12, 6);
    S.face('baizhi', 'lj');
    await S.say('baizhi:serious', '昭娘姊姊。妳一直看著海。');
    await S.say('baizhi:serious', '可是，妳有沒有回頭看過？');
    await S.say('linto:surprise', '……回頭？');
    await S.say('baizhi:smile', '妳背後，有一個人，也等了妳好久好久。');
    await S.walkTo('player', 10, 6);
    S.face('player', 'lj');
    await S.say('xinghe:serious', '（握住林投姐冰冷的手）……昭娘姊，回頭看。');
    S.sfx('lantern');
    S.flash('#ffd890', 0.6, 0.6);
    await S.say('', '星河胸口的火光亮起，順著兩人的手，流進林投姐的身體。她緩緩轉過頭——');
    const abao = S.spawn({ id: 'abao', sprite: 'ghost_child', x: 11, y: 5, dir: 'down', ghost: false });
    abao.alpha = 0;
    abao.light = { r: 120, color: '#ffd090' };
    await S.fadeActor('abao', 1, dur(1.2));
    await S.say('', '老林投的根下，一個小男孩蹲在那裡，抱著膝蓋，小小的身體是一團溫暖的光。');
    await S.say('阿寶', '……阿母。');
    await S.say('linto:surprise', '……');
    await S.say('阿寶', '阿母，妳一直看海。我叫妳，妳都聽不到。');
    await S.say('阿寶', '我好餓。可是阿母在等人，我就不吵。');
    await S.say('linto:cry', '……阿寶……阿寶……！');
    S.setPos('lj', 11, 6, 'up');
    await S.say('', '她撲過去，把孩子緊緊抱進懷裡。黑色的眼淚，變成了透明的。');
    await S.say('linto:cry', '阿母憨……阿母好憨……等那個不會回來的人……把會等我的人……放在背後……');
    await S.say('linto:cry', '三十年……三十年你都在這裡……');
    await S.say('阿寶', '嗯。我有乖。');
    await S.say('baizhi:smile', '（從懷裡拿出鄭家肉粽）這是肉粽伯——賣肉粽阿伯的兒子——要給你們的。兩粒。');
    if (S.hasItem('c6_zheng_zongzi')) S.take('c6_zheng_zongzi', 2);
    await S.say('linto:surprise', '……那個賣肉粽的……');
    await S.say('linto:cry', '他每次都知道……銅錢會變冥紙……還是每次都賣我……還多塞一粒給阿寶……');
    await S.say('', '她解開竹葉。母子倆坐在林投樹下，一人一粒，安安靜靜地吃完。');
    await wait(S, 0.8);
    await S.say('阿寶', '好好吃。');
    await S.say('linto:smile', '……嗯。好好吃。');
    S.face('lj', 'right');
    await S.say('linto:serious', '（站起來，牽著阿寶，看向海邊的石門）你們……要進那間廟？');
    await S.say('linto:serious', '每暝三更，黑船從那個石門進去。罐子裡，是跟阿寶一樣的光。');
    await S.say('linto:sad', '有一個道士，兩個月前從這裡走進去。他經過的時候，跟我說：');
    await S.say('linto:normal', '「大姐，海上不會有船來了。回頭看看吧。」');
    S.emote('yungui', '!');
    await S.say('yungui:surprise', '……');
    await S.say('linto:sad', '我那時候……聽不進去。對不起。');
    await S.say('yungui:smile', '（聲音有點啞）……他就是那樣。講對的話，從來不挑時候。');
    S.flag('ch6_linto_done');
    S.refresh();
    S.sfx('wind');
    await S.camera(18, 5, 0.8);
    await S.say('', '她伸手撫過林投葉。一條小路在葉間分開，通往海邊的石門。');
    await S.say('linto:normal', '……去吧。');
    await S.camera(11, 6, 0.6);
    await S.say('linto:smile', '我要帶阿寶走了。這一次，往前看。');
    S.sfx('sing');
    S.flash('#fff0d0', 0.6, 0.5);
    for (const id of ['lj', 'abao']) { const a = S.actor(id); if (a) tw(a, { offsetY: -90 }, 2.2); S.fadeActor(id, 0, dur(2.2)); }
    await wait(S, 1.5);
    await S.say('', '母子化成兩點光，手牽著手，沒有往海上飄，而是往天上——然後，在白芷的歌聲裡，轉向遠方那盞看不見的燈。');
    S.remove('abao');
    S.remove('lj');
    await S.lantern('lantern_linto', '林投姐');
    await S.give('c6_linto_comb');
    if ((V().ch6_listen || 0) >= 3) {
      S.flag('ch6_listen3');
      await S.say('linto:smile', '（光裡傳來她的聲音）……你們聽我講完了。三十年，第一次有人聽我講完。');
      await S.give('c6_zhaoniang_pin');
    }
    V().ch6_time = 2;
    S.light({ ambient: 0.66, color: '#060a1a', playerR: 230 });
    S.cameraFollow();
    S.gather();
    S.bgm('night');
    S.objective('前往海邊的石砌水門');
  };

  // =================================================================================================== 4-3 糰子的蕈譜：潮音蕈
  Sc.mushroom = async (S) => {
    S.flag('mush_ch6');
    await S.say('', '沙裡冒出幾朵螺旋狀的蕈，蕈褶像海螺。靠近的時候，能聽見潮聲。');
    await S.say('yungui:serious', '潮音蕈。……糰子，這次真的讓我先——');
    S.sfx('hit');
    await S.jump('tuanzi', 26);
    await S.say('', '糰子吃了。');
    await S.say('yungui:normal', '……我已經不期待了。');
    S.vision(20);
    S.flash('#c8a0ff', 0.6, 0.5);
    await S.say('', '糰子的瞳孔變成了漩渦。四周的林投葉，像琴鍵一樣一片一片亮起來。');
    await S.say('tuanzi:serious', '吾聽見了。海在說話。');
    await S.say('tuanzi:serious', '海說：「每個人都在等船。」');
    await S.say('tuanzi:serious', '「可是船不是用等的。船是自己划的。」');
    await S.say('hongying:think', '……');
    await S.say('tuanzi:serious', '「如果沒有船，就自己變成船。」');
    await S.say('baizhi:think', '自己……變成船。');
    await S.say('tuanzi:serious', '然後海又說：「這隻石虎好可愛，應該多給牠吃點肉粽。」');
    await S.say('xinghe:laugh', '那是你自己說的吧！');
    await S.say('', '糰子倒下，打起了呼。');
    V().tuanzi_mush = (V().tuanzi_mush || 0) + 1;
    if (G.Quests.stage('q_tuanzi_mush') < 2) S.quest('q_tuanzi_mush', 2);
    S.toast('雲歸的蕈譜記下了一格：潮音蕈', 'scroll');
  };

  // =================================================================================================== 3-12 水門前
  Sc.waterGate = async (S) => {
    S.flag('ch6_infiltrate');
    stage(S, [['player', 35, 5, 'up'], ['baizhi', 34, 5, 'up'], ['hongying', 36, 5, 'up'], ['yungui', 33, 5, 'up'], ['tuanzi', 36, 4, 'up']]);
    await S.say('', '石砌水門。鐵柵半開，一條黑色的船剛卸完罐子離開。遠處，長明宮前門傳來鐘聲與人潮聲——元宵大典開始了。');
    S.sfx('thunder'); S.flash('#c8d8ff', 0.5, 0.6);
    await S.say('', '煙火在長明宮上空炸開。藍白色的。');
    await S.say('yungui:serious', '正門那邊在辦大典，守衛大半都去了前面。後面……還是有。');
    await S.say('yungui:serious', '聽好。被看見，就打；打完就躲。打太多次，整座宮都會醒。');
    await S.say('hongying:serious', '那就別被看見。');
    await S.say('tuanzi:serious', '吾……吾可以幫忙。吾很會讓人分心。');
    await S.say('xinghe:smile', '你只要不去偷吃供品就好。');
    await S.say('baizhi:serious', '（看著水門裡的藍光）……他們在叫。好多人在叫。');
    await S.say('xinghe:serious', '（握住她的手）我們進去。');
    S.quest('q_ch6_main', 6);
    S.objective('潛入長明宮');
    S.gather();
    await S.warp('palace_dock', 4, 15, 'up');
  };

  // =================================================================================================== 潛行 (S1–S3)
  Sc.stealthTutorial = async (S) => {
    S.flag('ch6_s1_tut');
    await S.say('', '倉庫裡排滿了貼著紅紙名條的罐子。守衛提著藍燈，一步一步地走。');
    await S.say('yungui:think', '……石燈上貼著一張太虛觀的符。');
    await S.say('yungui:smile', '……師父也是這樣溜進去的。');
    await S.narrate([
      '【潛行】只有隊長會在地圖上行動，同伴們躲在暗處跟著。',
      '守衛看得見前方的扇形。站在長明燈的光裡，會被看得很遠；在暗處，只看得到三格。',
      '被看見時，守衛頭上的量表會上升——過了一半，他會起疑走過來；滿了，就會衝過來。',
      '跑步（Shift）和深色的吱嘎木板會發出聲音。前門每三十秒放一次煙火，煙火聲會蓋住一切聲音。',
      '發光的大甕可以躲進去（Z）。按 F，糰子會衝出去搗蛋，把附近的守衛引開。',
      '傀儡哨會轉頭張望，看見人就搖鈴叫守衛。從它背後靠近，雲歸可以貼上定身符。',
      '被抓到就要戰鬥，打贏後回到入口的石燈重來。整區都沒被發現，出口附近會有一個寶箱。',
    ], { veil: 0.85 });
    S.objective('潛入長明宮深處（北邊的門）');
  };
  Sc.checkpointLantern = async (S) => {
    await S.say('', '石燈上貼著一張太虛觀的符。符紙已經褪色，字跡還很清楚。');
    await S.say('yungui:smile', '老頭兩個月前留的。……在這裡喘口氣吧。');
  };
  Sc.hallEnter = async (S) => {
    S.flag('ch6_s2_in');
    await S.say('', '迴廊圍著一座點滿長明燈的中庭，亮得像白天。');
    await S.say('yungui:serious', '中庭太亮了，走迴廊。……南邊那個披黑羽毛的，是墨鴉。');
    await S.say('hongying:smug', '頭頂少了一撮。');
  };
  Sc.studyEnter = async (S) => {
    S.flag('ch6_s3_in');
    await S.say('', '經閣。一排排書架上，掛著寫了字的木牌。一個守衛坐在桌邊打瞌睡。');
    await S.say('yungui:think', '一、念、清、靜……萬、緣、皆、歸。');
    await S.say('yungui:think', '一念清靜，萬緣皆歸……太虛觀鐘上的字。');
  };
  Sc.shelf = async (S, ch, x, y) => {
    const seq = V().ch6_s3_seq || '';
    if (ch === '清' && !seq) {
      V().ch6_s3_seq = '清';
      S.sfx('switch');
      await S.say('', '抽出「清」字架上的一本書。書架輕輕往下沉了一點。……喀。');
      return;
    }
    if (ch === '歸' && seq === '清') {
      V().ch6_s3_seq = '';
      S.sfx('switch'); S.sfx('push', 0.3);
      S.shake(4, 0.4);
      await Sc.letter(S);
      return;
    }
    V().ch6_s3_seq = '';
    V().ch6_s3_wrong = (V().ch6_s3_wrong || 0) + 1;
    S.sfx('push'); S.sfx('hit', 0.15);
    S.shake(5, 0.3);
    await S.say('', '書嘩啦啦掉了一地！');
    Stealth.noise(MS(), x, y + 1, 6);
    if (V().ch6_s3_wrong >= 2) await S.say('yungui:think', '「師之字」……師父的道號，第一個字。……「徒之字」是我。');
  };

  // =================================================================================================== 3-13 經閣：清虛真人的信
  Sc.letter = async (S) => {
    S.flag('ch6_s3_open');
    for (const g of MS().npcs) if (g.guard && g.c6 && g.c6.mode !== 'sleep') { g.c6.mode = 'return'; g.c6.meter = 0; }
    await S.say('', '北牆上的暗格打開了。裡面有一封信，信封上寫著：「給不聽話的雲歸」。');
    await S.walkTo('yungui', 12, 3);
    await S.say('yungui:laugh', '（笑出聲，又像要哭）……老頭。');
    await S.say('qingxu:smile', '「雲歸：若你找到這封信，表示你又不聽話了。很好。」');
    await S.say('qingxu:serious', '「長明宮的地底，有一座萬燈閣。鎖著一萬多個魂。」');
    await S.say('qingxu:serious', '「我與夜玄談過三夜。他不是惡人。他是一個父親。」');
    await S.say('qingxu:serious', '「這才是最難的地方。惡人可以斬，父親斬不得。」');
    await S.say('qingxu:serious', '「他要的是燈靈。燈靈若落入他手，黑水溝會倒流。」');
    await S.say('qingxu:normal', '「我往山裡去，到日月潭霧底下的燈母祠。燈母若還在，必有辦法。」');
    await S.say('qingxu:serious', '「若我沒回來——不准來找。這次是真的不准。」');
    await S.say('qingxu:smile', '「還有。你的名字，取自觀裡鐘上那句『萬緣皆歸』。」');
    await S.say('qingxu:sad', '「為師撿到你的時候，你哭得像沒有地方回去。」');
    await S.say('qingxu:smile', '「所以為師希望，你這一生，永遠都有地方可以回去。」');
    await S.say('qingxu:smile', '「太虛觀的屋頂，記得掃。」');
    await wait(S, 1.2);
    S.face('yungui', 'up');
    await S.say('yungui:cry', '（把信按在額頭上，背對眾人）……誰要掃屋頂啊。');
    await S.say('yungui:cry', '我都在上面躺著……躺著等你……');
    await S.say('', '紅纓把手放在他的背上。糰子爬上他的肩膀，用臉蹭他。');
    await wait(S, 0.8);
    S.face('yungui', 'down');
    await S.say('yungui:serious', '（深吸一口氣，把信收進懷裡。轉身時，又是那副懶洋洋的臉）……日月潭，燈母祠。記住了。');
    await S.say('yungui:normal', '走吧。萬燈閣在下面。');
    await S.give('c6_qingxu_letter');
    S.flag('ch6_qingxu_letter');
    S.refresh();
    S.quest('q_ch6_main', 7);
    S.objective('從經閣的暗門下到萬燈閣');
  };

  // =================================================================================================== 3-14 萬燈閣與夜玄 → 冥燈護法 → 3-15 強制敗北
  Sc.lanterns = async (S) => {
    S.flag('ch6_yexuan_met');
    S.hideFollowers(false);
    stage(S, [['player', 18, 27, 'up'], ['baizhi', 17, 27, 'up'], ['hongying', 19, 27, 'up'], ['yungui', 18, 28, 'up'], ['tuanzi', 17, 28, 'up']]);
    S.bgm('palace');
    S.move('baizhi', 'UUUU', { wait: false }); S.move('hongying', 'UUUU', { wait: false }); S.move('yungui', 'UUUU', { wait: false }); S.move('tuanzi', 'UUUU', { wait: false });
    await S.move('player', 'UUUU');
    await S.camera(18, 16, 1.2);
    await S.say('', '萬燈閣。巨大的圓形大廳，一層層木架往上延伸到看不見的黑暗。');
    await S.say('', '架上是數不清的罐子。每一個罐子裡都有一點藍光，在呼吸。');
    await S.say('', '罐子上貼著紅紙名條。「愛子 阿福 三歲」「先夫 陳水木」「阿嬤 林罔市」「小妹 春桃」……');
    S.sfx('ghost'); S.sfx('ghost', 0.6);
    await S.say('', '低語聲。千萬個聲音，各自喃喃著自己的名字。');
    S.emote('baizhi', '💧');
    await S.say('baizhi:cry', '（摀住耳朵，跪倒）……好多……好多人……他們在說自己的名字……他們好怕忘記……');
    await S.walkTo('player', 17, 22);
    S.face('player', 'baizhi');
    await S.say('xinghe:serious', '白芷！');
    await S.say('hongying:angry', '這就是長明燈……！把人塞進罐子裡！');
    await S.walkTo('yungui', 20, 22);
    S.face('yungui', 'right');
    await S.say('yungui:angry', '（甩出一張破法符，貼向最近的罐子）給我開——');
    S.sfx('magic'); S.flash('#ffffff', 0.3, 0.5); S.sfx('dark', 0.2);
    await S.say('', '符紙一碰到罐子，就燒成了灰。嗡——');
    await S.say('yungui:surprise', '……！封得這麼死……');
    // 夜玄
    const yx = S.spawn({ id: 'yexuan', sprite: 'yexuan', portrait: 'yexuan', x: 18, y: 15, dir: 'up' });
    void yx;
    await S.say('?', '請不要碰它們。');
    await S.camera(18, 14, 1.0);
    await S.say('', '一個溫和的聲音。大廳中央的石台邊，一個男人背對著他們，正用一根細長的燈籤，替一只罐子剪燈芯。');
    await S.say('?', '每一盞，都有人在等。');
    await wait(S, 0.8);
    S.face('yexuan', 'down');
    S.bgm('villain');
    await S.say('', '他把燈芯剪好，放下燈籤，轉身。素黑長袍，鬢髮微霜，面容清瘦而溫雅。眼睛裡，有一種很深、很靜的疲倦。');
    await S.say('yexuan:normal', '失禮了。我是長明宮的主人，夜玄。');
    await S.say('yexuan:smile', '（對星河微微點頭）你們是陳渡的孩子吧。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '……你認識陳伯？');
    await S.say('yexuan:smile', '我們曾一起划船。很久以前。他的脾氣……還是那麼差嗎？');
    await S.say('xinghe:angry', '……比你好多了。');
    await S.say('yexuan:smile', '那就好。');
    await S.move('yexuan', 'D');
    S.face('yexuan', 'baizhi');
    await S.say('', '他看向白芷。然後，在所有人錯愕的目光中，他雙手交疊，深深一揖到底。');
    await S.say('yexuan:serious', '燈靈大人。');
    await S.say('baizhi:surprise', '……');
    await S.say('yexuan:serious', '您受苦了。被拋上岸，被人追捕，被迫想起您本來不必想起的事。');
    await S.say('yexuan:serious', '墨鴉在九份對您無禮，是我管教不周。我向您賠罪。');
    await S.say('hongying:angry', '少假惺惺！你把這麼多魂關在這裡——！');
    await S.say('yexuan:think', '關？');
    await S.move('yexuan', 'L');
    S.face('yexuan', 'up');
    S.sfx('bell');
    await S.say('', '他從身邊的架上，取下一只罐子，念出名條上的字。');
    S.face('yexuan', 'right');
    await S.say('yexuan:normal', '「愛子阿福，三歲。母林氏敬奉。」');
    await S.say('yexuan:normal', '這不是我關的。是他母親抱來的。她在宮門口跪了三天，求我別讓阿福被忘記。');
    await S.say('', '他把罐子放回去，動作輕得像放下一個睡著的孩子。');
    await S.say('yexuan:serious', '這裡每一盞燈，都是有人跪著求來的。一萬三千七百盞。');
    await S.say('yexuan:serious', '一萬三千七百個「不要忘記他」。');
    await S.say('yexuan:serious', '你們說我是獄卒。那麼這一萬多個家人——也都是獄卒嗎？');
    await wait(S, 1.0);
    await S.say('xinghe:angry', '……可是他們好冷！');
    if (S.has('ch3_alian_done')) {
      await S.say('yexuan:think', '……艋舺北渡頭那盞燈，是你們熄的吧。');
      await S.say('yexuan:sad', '那個寡婦，現在每晚都對著河哭。從前，她至少還能對著燈說話。');
      await S.say('yexuan:sad', '你們給了她什麼？一句「放下」？');
      await S.say('xinghe:angry', '她自己熄的！是阿德大哥求她熄的！');
      await S.say('yexuan:sad', '是啊。人總是會被說服，去放棄自己最愛的東西。然後一輩子後悔。');
    }
    await S.say('yexuan:serious', '你們知道，過了黑水溝，會發生什麼嗎？');
    await S.say('yexuan:serious', '彼岸燈會把一個人洗乾淨。名字、臉、第一次喊娘的聲音、愛過的人——全部洗掉。');
    await S.say('yexuan:serious', '然後他投胎，變成某個陌生人家的孩子。不記得任何人。也沒有任何人，再被他記得。');
    await S.say('yexuan:serious', '世人稱之為慈悲。');
    await S.say('yexuan:sad', '我稱之為——第二次死亡。');
    await S.say('yexuan:sad', '人死一次，已經夠了。為什麼還要再死一次……死在所有人的記憶裡？');
    S.face('yexuan', 'hongying');
    await S.say('yexuan:normal', '洛姑娘。妳的爹娘已經過了海。');
    await S.say('yexuan:normal', '現在，他們是誰？在哪一戶人家的搖籃裡？他們記得妳嗎？');
    await S.say('hongying:surprise', '……');
    await S.say('yexuan:sad', '妳在鹿港替他們擺了碗筷。……可是那副碗筷，再也不會有人來用了。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '你——（握槍的手在抖）');
    S.face('yexuan', 'baizhi');
    await S.say('yexuan:serious', '燈靈大人。您洗過多少人？一千萬？一萬萬？');
    await S.say('yexuan:serious', '您記得任何一個嗎？');
    await S.say('baizhi:sad', '……');
    await S.say('baizhi:sad', '……我記得一個。');
    await S.say('baizhi:sad', '一個提著兔子燈的小女孩。她就快到了……有一隻手把她拉了回去。');
    await S.say('baizhi:sad', '她沒有來。');
    await wait(S, 0.8);
    await S.say('', '夜玄的表情，第一次裂開了一道縫。');
    if (S.has('ch5_rabbit')) {
      await S.say('', '他看見白芷腰間掛著的，那盞褪色的兔子燈。');
      await S.say('yexuan:surprise', '……那盞燈。');
      await S.say('yexuan:sad', '鹿港，施師傅的手藝……念念也有一盞。一模一樣。');
    }
    await S.move('yexuan', 'R');
    S.face('yexuan', 'up');
    await S.say('yexuan:sad', '（手放在那只繫著小鈴鐺的小罐上）那隻手，是我的。');
    await S.say('yexuan:sad', '二十年前，我們一家從唐山過海。船在黑水溝翻了。');
    await S.say('yexuan:sad', '我是引魂人。我在黑水裡，看見念念的燈，往您那裡漂。');
    await S.say('yexuan:sad', '我抓住了她。');
    S.face('yexuan', 'down');
    await S.say('yexuan:serious', '這二十年，我做錯了很多事。但抓住她——是我這輩子，唯一做對的一件。');
    await wait(S, 0.6);
    S.sfx('bell');
    await S.say('', '小罐上的鈴鐺，輕輕響了一聲。叮。');
    await S.say('baizhi:think', '……她在說話。');
    await S.say('baizhi:think', '可是太小聲了……我聽不清楚。');
    await S.say('yexuan:smile', '她在說她想我。她每天都這麼說。');
    await S.say('baizhi:sad', '……');
    await S.walkTo('player', 18, 21);
    S.face('player', 'up');
    await S.say('xinghe:serious', '（擋到白芷前面）……我不知道你說的對不對。');
    await S.say('xinghe:serious', '我沒有爹娘可以記得。我是被海送上岸的。');
    await S.say('xinghe:serious', '可是陳伯養了我十八年。哪天他走了，我也會活得像他教我的那樣。');
    await S.say('xinghe:serious', '我覺得……那才叫記得。');
    await S.say('hongying:serious', '竹塹的山上，有一個阿公跟我們說過——');
    await S.say('hongying:serious', '「把人關起來，那不叫記得。那叫捨不得。」');
    await S.say('hongying:serious', '（抬起槍）……我爹娘回來，如果不記得我——');
    await S.say('hongying:serious', '那不是我爹娘。那只是穿著他們衣服的海。');
    await S.say('yungui:serious', '何況，被記住的人——也需要能走。');
    await S.say('yexuan:think', '誰說要他們走？');
    await S.say('yexuan:serious', '我要讓他們回來。');
    S.sfx('dark'); S.sfx('bell', 0.3);
    S.flash('#6ab8ff', 0.8, 0.6);
    await tw(LAN, { boost: 1 }, 0.8);
    await S.say('', '他抬起手。萬燈閣所有的罐子，同時亮了一倍。');
    await S.say('yexuan:serious', '黑水溝倒流的那一天——海會把所有人送回岸上。帶著他們的記憶。');
    await S.say('yexuan:serious', '林氏會再抱到她的阿福。洛姑娘會再見到她的爹娘。');
    await S.say('yexuan:serious', '沒有人需要再被遺忘。');
    await S.say('yexuan:serious', '燈母造了一個世界。在這個世界裡，愛注定是暫時的。');
    await S.say('yexuan:serious', '我不是在對抗死亡。我是在對抗一條規矩——');
    await S.say('yexuan:serious', '它說：愛必須被忘記，生命才能繼續。');
    await S.say('yexuan:normal', '這叫「逆潮」。為此，我需要燈靈大人。');
    await S.say('xinghe:angry', '想都別想！');
    await S.say('yexuan:smile', '……陳渡把你教得很好。');
    await S.say('yexuan:sad', '可惜。好孩子，通常都很快就會失去一切。');
    await S.move('yexuan', 'U');
    S.sfx('earth'); S.shake(14, 1.2); S.flash('#3a6aff', 0.6, 0.6);
    await S.say('', '石台下方的地板裂開。四只巨大的魂罐升起，鎖鏈從天而降，纏成一個高大的人形——');
    await S.say('', '長明燈柱組成的鎧甲、沒有臉的燈籠頭、冷藍的燈火在胸腔裡燃燒。');
    await S.say('yexuan:normal', '我不想傷害你們。護法，請送客人出去。');
    await S.say('yexuan:normal', '溫柔一點。');
    S.move('yexuan', 'RRRRRRRRR', { wait: false });
    await S.fadeActor('yexuan', 0, dur(1.2));
    S.remove('yexuan');
    S.sfx('bell');
    await S.say('', '夜玄轉身，從側門離去。遠處傳來大典的鐘聲。');
    await tw(LAN, { boost: 0.3 }, 0.6);
    const r = await S.battle('t_c6_netherlamp', Object.assign({ bgmAfter: 'tension' }, netherRules()));
    if (r !== 'win') return;
    S.flag('ch6_netherlamp');
    await Sc.capture(S);
  };

  Sc.capture = async (S) => {
    S.bgm('tension');
    await S.say('', '冥燈護法的鎧甲一節一節崩落。燈籠頭裡的藍火飄了出來——是一個疲憊的老人的魂。');
    await S.say('疲憊的老人', '……謝謝。我……可以走了。');
    S.sfx('lantern');
    await S.say('', '四只魂罐的封印碎裂，四點光飛上萬燈閣的黑暗。眾人喘著氣。');
    // the side door again
    S.sfx('door');
    const foes = [['yexuan', 'yexuan', 30, 15], ['moya_c', 'moya', 30, 14], ['qingfeng', 'qingfeng', 30, 16], ['guard_c1', 'temple_guard', 31, 13], ['guard_c2', 'temple_guard', 31, 17], ['guard_c3', 'temple_guard', 31, 15]];
    for (const [id, sp, x, y] of foes) S.spawn({ id, sprite: sp, x, y, dir: 'left' });
    S.move('yexuan', 'LLLLLL', { wait: false }); S.move('moya_c', 'LLLLL', { wait: false }); S.move('qingfeng', 'LLLLL', { wait: false });
    S.move('guard_c1', 'LLLL', { wait: false }); S.move('guard_c2', 'LLLL', { wait: false });
    await S.move('guard_c3', 'LLLL');
    await S.say('', '側門再度打開。夜玄走了回來。身後跟著墨鴉（頭頂少一撮羽毛）、一排長明宮衛——');
    await S.say('', '還有一個沒戴面具、半張臉燒傷的劍客。');
    S.emote('hongying', '!');
    await S.say('hongying:surprise', '……哥。');
    await S.say('qingfeng:sad', '……');
    await S.say('yexuan:sad', '護法也撐不住。……燈靈大人身邊的人，果然都不簡單。');
    await S.say('yexuan:serious', '那就由我來吧。');
    await S.battle('t_c6_yexuan_loss', yexuanRules());
    S.bgm('tension');
    stage(S, [['player', 18, 18, 'up'], ['baizhi', 16, 20, 'up'], ['hongying', 19, 20, 'left'], ['yungui', 17, 21, 'up'], ['tuanzi', 20, 21, 'up']]);
    S.setPos('yexuan', 18, 16, 'down');
    await S.say('', '戰鬥結束了。紅纓、雲歸倒在地上。星河單膝跪地，劍插在地上撐著身體。');
    await S.say('xinghe:hurt', '……還……沒完……');
    await S.move('yexuan', 'D');
    await S.say('yexuan:think', '（低頭看他）……奇怪。');
    await S.say('yexuan:think', '從一開始我就覺得奇怪。你身上，沒有魂燈。');
    S.sfx('dark');
    S.flash('#ffd060', 0.6, 0.5);
    await S.say('', '他伸出手，懸在星河胸口。一縷金色的火，像被線牽著，從星河胸口被緩緩抽了出來。');
    tw(S.actor('player'), { alpha: 0.55 }, 1.2);
    await S.say('xinghe:hurt', '——啊……！');
    await S.say('', '星河的手指邊緣，開始變得透明。');
    await S.say('yexuan:surprise', '……這火的顏色。');
    S.face('yexuan', 'baizhi');
    await S.say('yexuan:think', '（轉頭看白芷）燈靈大人。這孩子身上的火……是您的吧。');
    await S.say('baizhi:surprise', '……我的？');
    await S.say('xinghe:hurt', '（耳邊嗡嗡作響，聽不清楚）……');
    await S.say('yexuan:serious', '您不記得了。……也好。');
    await S.say('yexuan:serious', '只要把這點火還給您……燈靈大人，就能完整一點。');
    S.sfx('dark'); S.shake(6, 1.0);
    await tw(S.actor('player'), { alpha: 0.3 }, 1.0);
    await S.say('', '金色的火被抽出得更多。星河的身體越來越透明。他倒下了。');
    await S.say('baizhi:cry', '住手！！');
    await S.walkTo('baizhi', 18, 19);
    S.face('baizhi', 'up');
    S.sfx('hit');
    await S.say('', '白芷衝了過去，張開雙臂擋在星河身前。玉笛掉在地上。');
    await S.say('baizhi:cry', '住手……求求你，住手……');
    await S.say('baizhi:serious', '我跟你走。');
    await S.say('yexuan:think', '（手停住）……燈靈大人，您確定？');
    await S.say('baizhi:serious', '我跟你走。不要拿走他的火。');
    await S.say('baizhi:serious', '不要碰他們任何一個人。');
    await S.say('yexuan:serious', '……好。我答應您。');
    S.sfx('lantern');
    await tw(S.actor('player'), { alpha: 0.75 }, 1.0);
    await S.say('', '他收回了手。金色的火流回星河胸口——但只回去了一半。');
    await S.say('xinghe:hurt', '（伸出手，抓住白芷的衣角）……白……芷……不要……');
    S.face('baizhi', 'player');
    await S.say('', '白芷跪下，捧住他的臉。');
    await S.say('baizhi:smile', '星河，你說過，燈籠飄走了，要追回來。這是基本功。');
    await S.say('baizhi:cry', '……那你要來追我喔。');
    await S.say('', '她把脖子上的玉牌解下，放進星河的手心。玉牌上刻著「白芷」。');
    if (!S.hasItem('key_jadetag')) await S.give('key_jadetag');
    else S.toast('星河握住了白芷的玉牌。', 'jade');
    await S.say('baizhi:smile', '我的名字，你先替我保管。');
    await S.say('baizhi:smile', '鄭嫂嫂說，大人要替人扛東西。……這次換我扛。');
    await S.say('xinghe:cry', '……還有……另一半……她說……要讓別人……替妳扛……');
    await S.say('baizhi:sad', '（微微一怔，然後笑了）……嗯。下次。下次換你。');
    if (S.has('ch5_rabbit')) {
      await S.say('', '白芷站起來，撿起地上的兔子燈，走向夜玄。');
      await S.say('baizhi:serious', '我要把這個，帶去給念念。');
      await S.say('yexuan:sad', '（看著兔子燈，很久）……謝謝您。');
    } else {
      await S.say('', '白芷站起來，走向夜玄。');
    }
    await S.move('baizhi', 'UU');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '（撐起上半身）哥！！你就這樣看著！？');
    await S.say('qingfeng:sad', '（別過臉）……她會被好好對待。我保證。');
    await S.say('hongying:cry', '你保證！？你連自己都保不住！！');
    await S.say('moya:smug', '法師，剩下這幾個怎麼處理？依我看，一併關進——');
    await S.say('yexuan:normal', '放他們——');
    await S.say('moya:smug', '（打斷，對衛兵揮手）——關進地牢！法師心太軟，這種事墨護法來就好！');
    S.move('guard_c1', 'LLD', { wait: false }); S.move('guard_c2', 'LLU', { wait: false });
    S.move('yexuan', 'RRR', { wait: false });
    await S.move('baizhi', 'RRR');
    await S.say('', '衛兵圍了上來。夜玄皺起眉，卻已經帶著白芷走向門口。');
    await S.say('yungui:serious', '（趴在地上，從懷裡摸出一張符。符紙是金色的，邊緣已經磨毛）');
    await S.say('yungui:serious', '師父說……這張符，只能在「一定得活下去」的時候用。');
    await S.say('yungui:serious', '……就是現在了。');
    S.sfx('magic');
    await S.say('', '雲歸咬破手指，在符上一抹。遁符爆出刺眼的白光。');
    await S.say('moya:surprise', '什——遁符！？攔住他們！');
    S.face('baizhi', 'left');
    await S.say('baizhi:smile', '（在門口回頭）……星河。');
    S.bgm(null);
    S.sfx('thunder');
    await S.flash('#ffffff', 1.4, 1);
    await S.fadeOut(0.4, '#ffffff');
    for (const [id] of foes) S.remove(id);
    S.flag('ch6_captured');
    S.leave('baizhi');
    S.quest('q_ch6_main', 8);
    await wait(S, 0.8);
    await S.warp('north_dunes', 11, 6, 'down', { fade: 0, noAutosave: true });
    await S.fadeIn(1.2);
  };

  // =================================================================================================== 3-16 海上的歌
  Sc.ship = async (S) => {
    S.flag('ch6_ship');
    stage(S, [['player', 11, 6, 'down'], ['hongying', 10, 5, 'down'], ['yungui', 13, 5, 'down'], ['tuanzi', 12, 6, 'left']]);
    S.actor('player').alpha = 0.8;
    await S.say('', '府城北郊的海邊沙丘。夜。三人一貓被遁符摔在沙上。星河昏迷不醒。');
    await S.say('hongying:hurt', '……這裡是……哪裡……');
    await S.say('yungui:hurt', '（咳血）府城北邊……三十里左右。遁符……就只能逃這麼遠。');
    await S.say('tuanzi:cry', '星河！星河醒醒！');
    Mover.add('c6_ship', 'boat_ferry', 26, 11, { light: { r: 260, color: '#5a9aff', flicker: 0.3 } });
    S.spawn({ id: 'bz_ship', sprite: 'baizhi', x: 28, y: 11, dir: 'up', ghost: true });
    S.move('bz_ship', 'LLLLLLL', { speed: 2, wait: false });
    await Mover.slide(S, 'c6_ship', 19, 11, 3.5);
    S.face('bz_ship', 'up');
    await S.say('', '遠方的海面上，一艘巨大的黑船從府城的方向駛出，船身掛滿冷藍色的燈籠，緩緩駛向外海。');
    await S.say('', '船尾，一個銀白長髮的身影站著，看向岸邊。');
    await S.say('hongying:cry', '白芷……');
    S.emote('player', '!');
    await S.say('', '星河睜開眼。看見了那艘船。他爬起來，踉蹌著衝進海裡。');
    await S.move('player', 'DDDD', { speed: 3 });
    await S.say('xinghe:cry', '白芷——！！');
    const p = S.actor('player');
    await S.move('player', 'D', { speed: 1.5 });
    if (p) tw(p, { offsetY: 18 }, 0.6);
    await S.say('', '浪打在他身上。他跌倒，又爬起來，海水淹到了腰。');
    await S.say('hongying:cry', '星河！回來！你追不上的！');
    await S.say('xinghe:cry', '白芷——！！！');
    S.bgm('sad');
    S.sfx('sing');
    await S.say('', '海上，船尾。一陣歌聲，順著海風飄了過來。是渡魂謠。');
    S.move('bz_ship', 'LLLLLLLLLLLLLLLLL', { speed: 1.9, wait: false });
    Mover.slide(S, 'c6_ship', 2, 11, 9);
    await S.say('白芷（歌聲）', '「燈一盞，渡一人，黑水茫茫莫回身……」');
    S.sfx('sing');
    await S.say('白芷（歌聲）', '「此身化作燈一盞，照你回家……莫照我……」');
    await wait(S, 2.5);
    S.fadeActor('bz_ship', 0, dur(2));
    await Mover.fade(S, 'c6_ship', 2);
    S.remove('bz_ship');
    await S.say('', '歌聲越來越遠。船越來越小，變成一點藍光，往西，往澎湖的方向，消失在海平線。');
    S.flag('lyric_ch6');
    S.toast('記下了渡魂謠的殘句：「此身化作燈一盞，照你回家莫照我。」', 'scroll');
    await S.say('', '星河跪在淺水裡。手裡，緊緊握著那塊玉牌。');
    await S.say('', '他看著自己的手——手指的邊緣，像薄紙燈罩一樣，透出微弱的、搖晃的光。那光在閃。一下亮，一下暗。');
    await S.walkTo('yungui', 11, 9);
    await S.say('yungui:serious', '（涉水把他拖回岸上）……他的火。只剩一半了。');
    await S.say('yungui:serious', '而且……離她越遠，燒得越弱。');
    await S.say('hongying:cry', '那怎麼辦！你不是什麼都懂嗎！想辦法啊！');
    await S.say('yungui:sad', '……我不懂。這個，書上沒寫。');
    await S.say('', '星河在沙灘上昏了過去。手裡，還握著那塊玉牌。');
    await S.fadeOut(1.2);
    if (p) { p.offsetY = 0; p.alpha = 1; }
    await S.warp('sugarcane_night', 10, 14, 'up', { fade: 0, noAutosave: true });
  };

  // =================================================================================================== 3-17 甘蔗田裡（章末）
  Sc.canefield = async (S) => {
    stage(S, [['player', 10, 14, 'up'], ['hongying', 10, 14, 'up'], ['yungui', 11, 15, 'up'], ['tuanzi', 10, 12, 'up']]);
    S.show('player', false);
    await S.fadeIn(1.0);
    await S.say('', '沙丘後方的小路。紅纓揹著星河，雲歸拄著摺扇走在後面，糰子在前面帶路。');
    await S.say('', '遠處有火把——長明宮的追兵，沿著海岸搜過來。');
    await S.say('yungui:serious', '往內陸走。海邊太空曠了，天亮前一定會被追上。');
    await S.say('hongying:serious', '（把星河往背上托高一點）……他好輕。');
    await S.say('hongying:sad', '這個笨蛋，平常吃那麼多，怎麼會這麼輕……');
    S.emote('tuanzi', '!');
    await S.say('tuanzi:serious', '（鼻子抽動）這邊！有甘蔗的味道！還有……香的味道！');
    S.move('tuanzi', 'UUUU', { wait: false });
    S.move('yungui', 'LUUUUU', { wait: false });
    await S.move('hongying', 'UUUUUU');
    await S.say('', '一大片甘蔗田。甘蔗比人還高，夜風吹過，沙沙作響。火把的光被擋在外面。');
    await S.say('', '田中央，一間小小的土地公廟。香爐裡，還插著一截沒燒完的香。');
    await S.say('yungui:normal', '……在這裡歇到天亮。土地公爺爺，借個地方。');
    S.setPos('player', 11, 5, 'down');
    S.show('player', true);
    S.actor('player').alpha = 0.85;
    S.setPos('hongying', 12, 6, 'left');
    await S.say('', '紅纓把星河放在廟前的稻草上。從懷裡摸出一個竹葉包——肉粽伯塞給他們的最後一粒肉粽，已經冷了。');
    await S.say('hongying:sad', '（剝開，撕一小塊，放到星河嘴邊）……吃一口。肉粽伯請客的。');
    await S.say('xinghe:hurt', '（沒有醒，嘴唇卻動了一下）……白……芷……');
    await S.say('hongying:cry', '……笨蛋。');
    S.setPos('yungui', 9, 5, 'right');
    await S.say('', '雲歸靠著廟柱坐下，看著手裡被燒得只剩半截的遁符灰，很久沒有說話。');
    await S.say('yungui:sad', '師父……您的符，我用掉了。');
    await S.say('yungui:sad', '……可是我沒能把人帶回來。');
    S.setPos('tuanzi', 11, 6, 'up');
    await S.say('', '糰子爬到星河的肚子上，把自己攤成一片，替他取暖。');
    await S.camera(11, 5, 1.2);
    await S.say('', '甘蔗田。土地公廟。一點微弱的、一閃一閃的金色火光。遠方的海上，那點藍光，已經看不見了。');
    await wait(S, 1.0);
    S.flag('ch6_done');
    S.flag('xinghe_gutter');
    S.quest('q_ch6_main', 'done');
    S.objective(null);
    await S.fadeOut(1.5);
    const mine = ['lantern_linto', 'lantern_yanshui'].filter((id) => G.Lanterns.has(id)).length;
    await S.narrate(['第六章　府城長明　完'], { veil: 1 });
    await S.narrate([`本章點亮的心燈：${mine} 盞`, `心燈總數：${G.Lanterns.count()} 盞`], { veil: 1 });
    await G.Story.next(S, 7);
  };

  // =================================================================================================== chapter entry
  G.Story.ch6 = async (S) => {
    S.chapter(6);
    for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) {
      if (!G.state.members[id]) G.Party.join(id, 19);
      else { if (!G.state.party.includes(id)) G.Party.join(id); G.Story.ensureLevel(id, 19); }
    }
    G.state.party = ['xinghe', 'baizhi', 'hongying', 'yungui'].concat(G.state.party.filter((id) => !['xinghe', 'baizhi', 'hongying', 'yungui'].includes(id)));
    V().ch6_time = 0;
    await S.titleCard(G.Chapters[6], '鹽水蜂炮・府城元宵');
    await S.travel('lukang', 'yanshui', { label: '沿著海線官道南下……' });
    await S.warp('yanshui_road', 11, 1, 'down', { fade: 0.5 });
  };
})();

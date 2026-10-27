// 第九章　王船南行 — 打狗（旗後・半屏山）→ 東港（東隆宮・王船廠）→ 恆春古城（龍磐風原）→ 鵝鑾鼻（燈塔・龍坑）
// Screenplay: docs/story/ch9_south.md.  Entry: G.Story.ch9(S).  Exit: G.Story.next(S, 10).
//
// Maps: qihou, qihou_temple, banping_foot, banping_cave, donggang, donglong_hall, wangchuan_yard,
//       wangboat_deck, hengchun, hengchun_wall, longpan, eluanbi, lighthouse_in, lighthouse_top, longkeng_caves
// 陳伯 is a non-combat guest: an NPC that follows the party on town maps (def.follow) and stands at the
//   helm of the 王船; he is never added to G.state.party.
// vars: days_to_gate (100 → …), xunjing (0 → 2), ch9_names (0–7), ch9_logs (0–3), flame (0–100, 龍坑),
//       ch9_port (where the 王船 is moored: 'qihou' | 'donggang' | 'nanwan' | 'eluanbi').
'use strict';
(function () {
  const D = G.Data;
  const st = () => G.state;
  const F = (k) => !!G.state.flags[k];
  const V = () => G.state.vars;
  const T = G.TILE || 64;

  // =====================================================================================================
  // tile-grid builder (maps are composed with rectangles instead of hand-typed 50-column strings)
  // =====================================================================================================
  function grid(w, h, fill) {
    const a = [];
    for (let y = 0; y < h; y++) a.push(new Array(w).fill(fill));
    const g = {
      w, h, a,
      set(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) a[y][x] = c; return g; },
      get(x, y) { return (x >= 0 && y >= 0 && x < w && y < h) ? a[y][x] : null; },
      rect(x, y, ww, hh, c) { for (let j = y; j < y + hh; j++) for (let i = x; i < x + ww; i++) g.set(i, j, c); return g; },
      frame(x, y, ww, hh, c) { g.rect(x, y, ww, 1, c); g.rect(x, y + hh - 1, ww, 1, c); g.rect(x, y, 1, hh, c); g.rect(x + ww - 1, y, 1, hh, c); return g; },
      // stamp a block of strings; '@' = keep what is there
      stamp(x, y, rows) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '@') g.set(x + i, y + j, r[i]); }); return g; },
      // put the same char at a list of [x,y]
      dots(list, c) { for (const [x, y] of list) g.set(x, y, c); return g; },
      // irregular shoreline helper: for each row y, fill from x0 to x1 (inclusive) with c
      span(y, x0, x1, c) { for (let i = x0; i <= x1; i++) g.set(i, y, c); return g; },
      rows() { return a.map((r) => r.join('')); },
    };
    return g;
  }

  // =====================================================================================================
  // DATA — items, skills, enemies, troops, quests (chapter-local, prefixed c9_ / t_c9_ / q_ch9_)
  // =====================================================================================================
  Object.assign(D.items, {
    // ---- consumables ----
    c9_xiancaodong: { name: '仙草凍', desc: '黑亮的仙草凍，淋上糖水，退火又提神。回復真氣 80。', type: 'use', price: 160, ch: 9, icon: 'drink', use: { target: 'ally', mp: 80 } },
    c9_aicao: { name: '艾草束', desc: '端午前後掛在門口的艾草。點燃可驅散瘴氣；戰鬥中使用，全體解除中毒。', type: 'use', price: 60, ch: 9, icon: 'herb', use: { target: 'allies', cure: ['poison'] } },
    c9_shuanggaorun: { name: '雙糕潤', desc: '東港的古早味，糯米與黑糖一層一層蒸。回復真氣 120。', type: 'use', price: 220, ch: 9, icon: 'food', use: { target: 'ally', mp: 120 } },
    c9_qiyuwan: { name: '旗魚丸湯', desc: '東港旗魚打成的魚丸，湯頭清甜。回復氣血 900。', type: 'use', price: 300, ch: 9, icon: 'food', use: { target: 'ally', heal: 900 } },
    c9_gangkoucha: { name: '港口茶', desc: '滿州山上的港口茶，苦苦的，回甘。解除一切異常。', type: 'use', price: 150, ch: 9, icon: 'drink', use: { target: 'ally', cure: ['poison', 'sleep', 'seal', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown'] } },
    c9_lvdousuan: { name: '綠豆蒜', desc: '恆春的甜湯，綠豆去殼煮得像蒜瓣。全體回復氣血 500。', type: 'use', price: 380, ch: 9, icon: 'food', use: { target: 'allies', heal: 500 } },
    c9_chayeguan: { name: '港口茶葉罐', desc: '一整罐港口茶葉，泡一壺大家分著喝。全體回復真氣 150（戰鬥外）。', type: 'use', price: 500, ch: 9, icon: 'drink', use: { target: 'allies', mp: 150, battle: false } },
    c9_feiyu: { name: '煙燻飛魚', desc: '恆春海邊煙燻的飛魚，越嚼越香。全體回復氣血 700。', type: 'use', price: 520, ch: 9, icon: 'food', use: { target: 'allies', heal: 700 } },
    c9_biscuit: { name: '船用硬餅乾', desc: '湯先生倉庫裡的 ship biscuit，硬得可以當磚頭。回復氣血 300。', type: 'use', price: 30, ch: 9, icon: 'food', use: { target: 'ally', heal: 300 } },
    c9_dengyou: { name: '燈油', desc: '燈塔用的燈油。聞起來很嗆，喝一小口卻意外提神。回復真氣 100。', type: 'use', price: 200, ch: 9, icon: 'potion', use: { target: 'ally', mp: 100 } },
    c9_match: { name: '防水火柴', desc: '洋人的防水火柴，一劃就著。對敵全體造成 260 點火屬性傷害。', type: 'use', price: 120, ch: 9, icon: 'bomb', use: { target: 'enemies', damage: 260, elem: 'fire', battle: true } },
    c9_quwenfu: { name: '驅瘟符', desc: '東港廟口求來的驅瘟符。對敵一體造成 900 點金屬性傷害，瘟鬼最怕。', type: 'use', price: 150, ch: 9, icon: 'talisman', use: { target: 'enemy', damage: 900, elem: 'metal', battle: true } },
    c9_tiedingfu: { name: '鐵釘符', desc: '用造王船剩下的鐵釘鎮著的符。對敵一體造成 700 點土屬性傷害。', type: 'use', price: 0, ch: 9, icon: 'talisman', use: { target: 'enemy', damage: 700, elem: 'earth', battle: true } },
    c9_jiedusan: { name: '解毒散', desc: '旗後藥鋪配的解毒散。解除中毒。', type: 'use', price: 50, ch: 9, icon: 'pill', use: { target: 'ally', cure: ['poison'] } },
    c9_qingxindan: { name: '清心丹', desc: '清心定神的藥丸。解除封印與睡眠。', type: 'use', price: 80, ch: 9, icon: 'pill', use: { target: 'ally', cure: ['seal', 'sleep'] } },
    c9_baicaogao: { name: '百草膏', desc: '上百種青草熬成的膏藥。解除一切異常。', type: 'use', price: 220, ch: 9, icon: 'herb', use: { target: 'ally', cure: ['poison', 'sleep', 'seal', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown'] } },
    c9_lurongjiu: { name: '鹿茸酒', desc: '泡著鹿茸的藥酒，一口下肚渾身是勁。攻擊提升三回合。', type: 'use', price: 300, ch: 9, icon: 'wine', use: { target: 'ally', buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }] } },
    c9_tangyuan: { name: '仙翁湯圓', desc: '仙翁找給你們的那碗湯圓。全體氣血與真氣全滿。', type: 'use', price: 0, ch: 9, icon: 'food', use: { target: 'allies', heal: 9999, mp: 999 } },
    // ---- weapons ----
    c9_sw_tiegu: { name: '鐵骨劍', desc: '東港鐵匠阿鐵用打王船鐵釘的好鐵鍛的劍。', type: 'weapon', price: 1700, ch: 9, icon: 'sword', who: ['xinghe'], stats: { atk: 70 } },
    c9_sw_xunhai: { name: '巡海劍', desc: '王船廠木料堆裡找到的古劍，劍鞘刻著海浪與「巡」字。火屬性。', type: 'weapon', price: 0, ch: 9, icon: 'sword', who: ['xinghe'], elem: 'fire', stats: { atk: 78, luk: 3 } },
    c9_sp_yueya: { name: '月牙槍', desc: '槍頭彎如新月，恆春武具行的鎮店之寶。', type: 'weapon', price: 2300, ch: 9, icon: 'spear', who: ['hongying'], stats: { atk: 79, spd: 3 } },
    c9_fn_chaoyin: { name: '潮音符', desc: '龍坑潮池礁台上找到的符冊，翻開時聽得見潮聲。水屬性。', type: 'weapon', price: 0, ch: 9, icon: 'talisman', who: ['yungui'], elem: 'water', stats: { atk: 10, mag: 84, mp: 24 } },
    // ---- armor / head / feet ----
    c9_ar_haoyi: { name: '巡境號衣', desc: '王船出巡的號衣。「出巡要穿號衣，千歲爺才認得是自己人。」免疫中毒。', type: 'armor', price: 0, ch: 9, icon: 'armor', stats: { def: 40 }, immune: ['poison'] },
    c9_ar_yulin: { name: '魚鱗甲', desc: '用大魚的鱗片一片一片綴成。', type: 'armor', price: 1400, ch: 9, icon: 'armor', stats: { def: 37 } },
    c9_ar_niupi: { name: '牛皮護心', desc: '恆春牛皮做的護心甲，落山風吹不透。', type: 'armor', price: 1550, ch: 9, icon: 'armor', stats: { def: 39, hp: 30 } },
    c9_ar_shanni: { name: '山泥甲', desc: '半屏山的山泥燒成的甲片，沉甸甸的。抗土屬性。', type: 'armor', price: 0, ch: 9, icon: 'armor', stats: { def: 40 }, resist: ['earth'] },
    c9_hd_douli: { name: '恆春斗笠', desc: '綁著布條的寬邊斗笠，落山風裡也不會被吹走。抗木屬性。', type: 'head', price: 800, ch: 9, icon: 'hat', stats: { def: 16 }, resist: ['wood'] },
    c9_hd_jinlv: { name: '金縷頭巾', desc: '金線織成的頭巾。貪鬼捨不得放手的寶貝。', type: 'head', price: 0, ch: 9, icon: 'hat', stats: { def: 15, mag: 8 } },
    c9_hd_fenggu: { name: '風骨簪', desc: '落山風靈散去後留下的一支簪子，輕得像風。', type: 'head', price: 0, ch: 9, icon: 'hairpin', stats: { def: 17, mag: 12, spd: 5 } },
    c9_ft_baotie: { name: '包鐵綁腿', desc: '小腿包著鐵片的綁腿，踢得動船纜。', type: 'feet', price: 760, ch: 9, icon: 'shoes', stats: { def: 13, spd: 5 } },
    // ---- accessories ----
    c9_ac_tongqian: { name: '仙翁的銅錢', desc: '被誠心花過一次的銅錢。「誠心花過的錢，很好用。」戰鬥獲得的銀兩增加。', type: 'acc', price: 0, ch: 9, icon: 'charm', stats: { luk: 12 }, special: ['goldUp'] },
    c9_ac_yueqin: { name: '月琴弦護符', desc: '阿順伯的一段舊琴弦。風再亂吹，撥一下，它就想起自己是風。抗木屬性，不會被風吹離。', type: 'acc', price: 0, ch: 9, icon: 'charm', stats: { spd: 4 }, resist: ['wood'] },
    c9_ac_telescope: { name: '湯姆的望遠鏡', desc: '燈塔守湯姆的黃銅望遠鏡。看得很遠，也看得很清楚。', type: 'acc', price: 0, ch: 9, icon: 'gem', stats: { luk: 10, spd: 6 } },
    c9_ac_jinzhi: { name: '金紙護符', desc: '金紙摺成的護符，瘟氣近不了身。免疫中毒。', type: 'acc', price: 0, ch: 9, icon: 'talisman', stats: { def: 8 }, immune: ['poison'] },
    c9_ac_tanlang: { name: '貪狼護符', desc: '貪心的人戴的護符。攻擊提升，防禦下降。', type: 'acc', price: 0, ch: 9, icon: 'charm', stats: { atk: 14, def: -6 } },
    c9_ac_lujiao: { name: '鹿角護腕', desc: '鹿角磨成的護腕，龍磐風吹沙底下撿到的。', type: 'acc', price: 0, ch: 9, icon: 'charm', stats: { atk: 8, spd: 4 } },
    // ---- materials ----
    c9_mat_banpingshi: { name: '半屏石', desc: '半屏山的石頭，灰白色，摸起來像一塊冷掉的湯圓。', type: 'material', price: 600, ch: 9, icon: 'gem' },
    c9_mat_fengshi: { name: '落山風石', desc: '被落山風磨得圓滑的咾咕石。', type: 'material', price: 400, ch: 9, icon: 'gem' },
    c9_mat_manlin: { name: '鰻王鱗', desc: '潮病鰻王剝落的銀藍色鱗片。', type: 'material', price: 800, ch: 9, icon: 'gem' },
    c9_mat_shanhusui: { name: '珊瑚碎', desc: '海妖身上掉下來的珊瑚碎片。', type: 'material', price: 200, ch: 9, icon: 'gem' },
    c9_mat_qiandai: { name: '錢袋', desc: '貪鬼緊抓不放的錢袋，裡面多半是泥巴。', type: 'material', price: 600, ch: 9, icon: 'bag' },
    // ---- key items ----
    c9_key_lingqi: { name: '千歲爺令旗', desc: '東隆宮廟公所賜，王船出巡的憑證。「令旗在，千歲爺就在。」', type: 'key', price: 0, ch: 9, icon: 'scroll' },
    c9_key_xunjing: { name: '巡境圖', desc: '台灣島的輪廓，標著六個巡境點：東港、鵝鑾鼻、蘭嶼、台東、太魯閣、頭城。點亮的地方會發光。', type: 'key', price: 0, ch: 9, icon: 'scroll' },
    c9_key_rudder: { name: '王船舵', desc: '比人還高的王船舵，杉木做的。', type: 'key', price: 0, ch: 9, icon: 'key' },
    c9_key_sail: { name: '王船帆', desc: '被綠火燒出幾個洞的王船帆。', type: 'key', price: 0, ch: 9, icon: 'scroll' },
    c9_key_eye: { name: '龍目', desc: '一對木刻的大眼睛，瞳仁望向前方。', type: 'key', price: 0, ch: 9, icon: 'gem' },
    c9_key_log: { name: '燈塔日誌殘頁', desc: '燈塔守湯姆的日誌，被風吹散的幾頁。', type: 'key', price: 0, ch: 9, icon: 'letter' },
    c9_key_lyric: { name: '渡魂謠殘篇・恆春', desc: '「燈一盞，渡一人。潮來莫回身。你若忘了我，我替你記；你若記得我，莫來尋。」', type: 'key', price: 0, ch: 9, icon: 'scroll' },
  });

  // ---- skills (enemy skills c9_es_*, one battle-only player command) ----
  Object.assign(D.skills, {
    c9_es_drag: { name: '拖拽', desc: '濕冷的手抓住腳踝往海裡拖。', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.2, status: { id: 'spdDown', chance: 0.3, turns: 3 }, fx: 'water', sfx: 'splash' },
    c9_es_wail: { name: '溺魂哀號', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.9, fx: 'water', sfx: 'ghost' },
    c9_es_mist: { name: '海霧', desc: '', mp: 0, type: 'debuff', elem: 'water', target: 'enemies', power: 0, status: { id: 'sleep', chance: 0.25, turns: 2 }, fx: 'sleep', sfx: 'wind' },
    c9_es_chill: { name: '寒潮', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemy', power: 1.3, fx: 'water', sfx: 'water' },
    c9_es_devour: { name: '吞食', desc: '大肚貪鬼張開大嘴，一口把東西吞了下去！', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'dark', sfx: 'ghost' },
    c9_es_belly: { name: '山腹', desc: '肚子裡的半座山壓了下來。', mp: 0, type: 'phys', elem: 'earth', target: 'enemies', power: 1.0, fx: 'earth_big', sfx: 'earth' },
    c9_es_gorge: { name: '狼吞虎嚥', desc: '', mp: 0, type: 'heal', elem: null, target: 'self', power: 1.0, fx: 'heal', sfx: 'hit' },
    c9_es_plague_breath: { name: '瘟息', desc: '綠火從咳嗽的嘴裡噴了出來。', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 0.95, status: { id: 'poison', chance: 0.6, turns: 3 }, fx: 'poison', sfx: 'poison' },
    c9_es_fever_touch: { name: '高燒之手', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemy', power: 1.55, status: { id: 'magDown', chance: 0.5, turns: 3 }, fx: 'dark', sfx: 'dark' },
    c9_es_summon_plague: { name: '咳出瘟鬼', desc: '一陣劇咳，又一隻瘟鬼滾了出來。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['plague_ghost_v1'], fx: 'summon', sfx: 'ghost' },
    c9_es_fever_fire: { name: '疫火', desc: '', mp: 0, type: 'mag', elem: 'fire', target: 'enemy', power: 1.2, status: { id: 'poison', chance: 0.3, turns: 3 }, fx: 'fire', sfx: 'fire' },
    c9_es_cough: { name: '群咳', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 2 }], fx: 'debuff', sfx: 'debuff' },
    c9_es_downslope: { name: '落山', desc: '整片山的風一口氣壓了下來！', mp: 0, type: 'phys', elem: 'wood', target: 'enemies', power: 1.7, delay: 1.2, fx: 'wind', sfx: 'wind' },
    c9_es_gust: { name: '陣風', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 1.0, fx: 'wind', sfx: 'wind' },
    c9_es_sandblast: { name: '風吹沙', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 1.45, status: { id: 'spdDown', chance: 0.5, turns: 3 }, fx: 'earth', sfx: 'wind' },
    c9_es_saltmist: { name: '鹽霧', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, status: { id: 'seal', chance: 0.25, turns: 2 }, fx: 'seal', sfx: 'wind' },
    c9_es_howl: { name: '呼嘯', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'mag', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'wind' },
    c9_es_namecall: { name: '喚名', desc: '風裡有人在喊一個名字。', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 0.8, status: { id: 'seal', chance: 0.2, turns: 2 }, fx: 'wind', sfx: 'ghost' },
    c9_es_lastwind: { name: '最後的風', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 1.3, fx: 'wind', sfx: 'wind' },
    c9_es_bite_big: { name: '鰻王噬', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.75, status: { id: 'poison', chance: 0.4, turns: 3 }, fx: 'bite', sfx: 'crit' },
    c9_es_tailsweep: { name: '甩尾', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 1.0, fx: 'water_big', sfx: 'splash' },
    c9_es_tailsweep2: { name: '甩尾連擊', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 0.6, hits: 2, fx: 'water_big', sfx: 'splash' },
    c9_es_snuff: { name: '撲火', desc: '鰻王撲向燈火，浪花劈頭蓋下！', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.95, fx: 'water_big', sfx: 'splash' },
    c9_es_tide_rise: { name: '漲潮', desc: '潮水湧進拱門，又一條海鰻被沖了進來。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['moray_v1'], fx: 'summon', sfx: 'splash' },
    c9_guard_lamp: { name: '護燈', desc: '用身體護住防風燈：本回合防禦，燈火 +15。（本戰限定）', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, status: { id: 'guard', chance: 1, turns: 1 }, fx: 'lantern', sfx: 'guard' },
  });

  // ---- enemies (same balancing curve as js/data/enemies.js) ----
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  function defE(id, d) {
    const c = D.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const sk = (list) => list.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w }));
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: Math.max(1, Math.round(c.exp * expM)), gold: Math.max(1, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: sk(d.skills), desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt']) if (d[k] != null) e[k] = d[k];
    if (d.phases) e.phases = d.phases.map((p) => Object.assign({}, p, p.skills ? { skills: sk(p.skills) } : {}));
    D.enemies[id] = e;
    return e;
  }
  defE('c9_drowned', {
    name: '溺魂', art: 'water_ghost', variant: 1, lv: 30, elem: 'water', weak: ['earth'], resist: ['water'], m: { hp: 0.95, atk: 0.95, mag: 0.9 },
    skills: [['c9_es_drag', 3], ['c9_es_wail', 2], ['e_claw', 1]], drops: [['shimuyu', 0.15]],
    desc: '從府城那邊的海被逆潮推到打狗來的溺死者。他們以為自己終於到家了。',
  });
  defE('c9_sea_wisp', {
    name: '海霧魂', art: 'sea_wisp', variant: 2, lv: 30, elem: 'water', weak: ['earth'], m: { hp: 0.7, atk: 0.7, mag: 1.1, spd: 1.3 },
    skills: [['c9_es_mist', 1], ['c9_es_chill', 3]], drops: [['c9_xiancaodong', 0.15]],
    desc: '夜裡海面上一點一點的藍火。靠近了，才看出是一張張濕淋淋的臉。',
  });
  defE('c9_greed_big', {
    name: '大肚貪鬼', art: 'greed_ghost', variant: 1, scale: 1.6, lv: 31, elem: 'earth', weak: ['wood'], resist: ['earth', 'water'], boss: true, immune: BOSS_IMM,
    m: { hp: 8, atk: 2.0, mag: 1.7, def: 1.15, spd: 1.0, luk: 2, exp: 5, gold: 8 },
    skills: [['c9_es_devour', 2], ['c9_es_belly', 3], ['e_greed_grab', 3], ['c9_es_gorge', 1, 'hp<60']],
    drops: [['c9_mat_banpingshi', 1]],
    desc: '白拿了幾百年的貪鬼，肚子裡隱約有半座山的輪廓。從來沒有吃飽過。',
  });
  defE('c9_plague_fire', {
    name: '瘟鬼・疫火', art: 'plague_ghost', variant: 2, lv: 32, elem: 'fire', weak: ['water'], m: { hp: 1.1, atk: 0.9, mag: 1.25, spd: 1.05 },
    skills: [['c9_es_fever_fire', 3], ['c9_es_cough', 1], ['e_plague_touch', 1]], drops: [['c9_baicaogao', 0.1]],
    desc: '燒著綠火的瘟鬼。牠走過的地方，人都在發燒。',
  });
  defE('c9_plague_chief', {
    name: '瘟鬼頭', art: 'plague_ghost', variant: 2, scale: 1.8, lv: 32, elem: 'wood', weak: ['metal', 'fire'], resist: ['water'], boss: true, immune: BOSS_IMM.concat(['poison']),
    m: { hp: 10, atk: 2.0, mag: 2.2, def: 1.15, spd: 1.2, exp: 7, gold: 6 },
    skills: [['c9_es_plague_breath', 3], ['c9_es_fever_touch', 3], ['c9_es_summon_plague', 2, 'ally_dead'], ['c9_es_cough', 1]],
    drops: [['c9_baicaogao', 1]],
    desc: '數十隻瘟鬼疊成的駝背身影。咳嗽聲像一整個村子在咳。',
  });
  const PUFFS = [['c9_puff_a', '風團・水生'], ['c9_puff_b', '風團・阿九'], ['c9_puff_c', '風團・順德']];
  for (const [pid, pname] of PUFFS) {
    defE(pid, {
      name: pname, art: 'wind_sprite', variant: 2, scale: 1.3, lv: 33, elem: 'wood', weak: ['metal'], resist: ['wood'], immune: BOSS_IMM,
      m: { hp: 1.0, atk: 1.0, mag: 1.15, spd: 1.35, exp: 0.6, gold: 0.4 },
      skills: [['c9_es_gust', 2], ['c9_es_namecall', 2]], drops: [],
      desc: '落山風靈散開成的風團，胸口纏著一個發光的名字。',
    });
  }
  defE('c9_fallwind', {
    name: '落山風靈', art: 'fallwind', lv: 33, elem: 'wood', weak: ['metal'], resist: ['wood', 'water'], boss: true, immune: BOSS_IMM,
    m: { hp: 9, atk: 2.3, mag: 2.3, def: 1.15, spd: 1.4, exp: 7, gold: 7 },
    skills: [['c9_es_gust', 3], ['c9_es_sandblast', 3], ['c9_es_saltmist', 1], ['c9_es_howl', 1]],
    phases: [{ at: 0.5, summon: ['c9_puff_a', 'c9_puff_b', 'c9_puff_c'], skills: [['c9_es_gust', 3], ['c9_es_sandblast', 3], ['c9_es_saltmist', 1], ['c9_es_howl', 1]] }],
    drops: [['c9_mat_fengshi', 1], ['c9_hd_fenggu', 1]],
    desc: '每年秋冬從山上直撲恆春半島的落山風。風本無惡意——它只是聽了太多溺死者喊回家。',
  });
  defE('c9_moray_king', {
    name: '潮病鰻王', art: 'moray', variant: 2, scale: 1.9, lv: 34, elem: 'water', weak: ['earth'], resist: ['water', 'fire'], boss: true, immune: BOSS_IMM.concat(['poison']),
    m: { hp: 8.5, atk: 1.95, mag: 1.8, def: 1.15, spd: 1.2, exp: 7, gold: 7 },
    skills: [['c9_es_bite_big', 3], ['c9_es_tailsweep', 2], ['c9_es_snuff', 2], ['c9_es_tide_rise', 1, 'ally_dead']],
    phases: [{ at: 0.4, phase: 2, text: '黑色的藤壺一片片剝落，鰻王的身體露出銀藍色——牠的動作反而更快了！',
      skills: [['c9_es_bite_big', 3], ['c9_es_tailsweep2', 2], ['c9_es_snuff', 2], ['c9_es_tide_rise', 1, 'ally_dead']] }],
    drops: [['c9_mat_manlin', 1]],
    desc: '比王船還長的海鰻，身上長滿黑色藤壺，眼睛混濁發白。牠不是兇，是病了。',
  });
  // 狼吞虎嚥 heals ~12% of the big greed ghost's max HP
  (function () { const e = D.enemies.c9_greed_big; D.skills.c9_es_gorge.power = Math.round((e.hp * 0.12) / (e.mag * 1.2 + 10) * 100) / 100; })();

  const troop = (id, enemies, bg, bgm, extra) => { D.troops[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle2' }, extra || {}); };
  troop('t_c9_beach_1', ['c9_drowned', 'c9_drowned', 'c9_sea_wisp'], 'south');
  troop('t_c9_beach_2', ['c9_drowned', 'moray', 'c9_drowned'], 'south');
  troop('t_c9_road_a', ['c9_drowned', 'c9_drowned', 'moray'], 'south');
  troop('t_c9_road_b', ['c9_sea_wisp', 'c9_sea_wisp', 'moray'], 'south');
  troop('t_c9_greed_a', ['greed_ghost', 'greed_ghost'], 'mine');
  troop('t_c9_greed_b', ['greed_ghost', 'greed_ghost', 'greed_ghost'], 'mine');
  troop('t_c9_greed_ambush', ['greed_ghost', 'greed_ghost', 'greed_ghost'], 'mine');
  troop('t_c9_greed_boss', ['c9_greed_big', 'greed_ghost', 'greed_ghost'], 'mine', 'boss', { boss: true, flee: false });
  troop('t_c9_plague_a', ['plague_ghost_v1', 'plague_ghost_v1', 'c9_plague_fire'], 'temple');
  troop('t_c9_plague_b', ['plague_ghost_v1', 'plague_ghost_v1', 'plague_ghost_v1'], 'temple');
  troop('t_c9_plague_eye', ['plague_ghost_v1', 'plague_ghost_v1'], 'temple');
  troop('t_c9_plague_boss', ['c9_plague_chief', 'plague_ghost_v1', 'plague_ghost_v1'], 'temple', 'boss', { boss: true, flee: false });
  troop('t_c9_wind_a', ['wind_sprite_v2', 'wind_sprite_v2', 'wind_sprite_v2'], 'hengchun');
  troop('t_c9_wind_b', ['wind_sprite_v2', 'wind_sprite_v2', 'c9_drowned'], 'hengchun');
  troop('t_c9_fallwind', ['c9_fallwind'], 'hengchun', 'boss', { boss: true, flee: false });
  troop('t_c9_cave_a', ['moray_v1', 'moray_v1', 'c9_drowned'], 'cape');
  troop('t_c9_cave_b', ['sea_monster', 'c9_drowned', 'c9_drowned'], 'cape');
  troop('t_c9_cave_c', ['sea_monster', 'sea_monster', 'moray_v1'], 'cape');
  troop('t_c9_moray_king', ['c9_moray_king', 'moray_v1'], 'sea', 'boss', { boss: true, flee: false });

  // encounter areas (for tools/sim_battle.js and other writers)
  Object.assign(D.areas || (D.areas = {}), {
    c9_qihou: { name: '旗後夜灘', ch: 9, lv: [30, 30], troops: ['t_c9_beach_1', 't_c9_beach_2', 't_c9_road_a', 't_c9_road_b'], bosses: [], party: ['xinghe', 'hongying', 'yungui'] },
    c9_banping: { name: '半屏山腹', ch: 9, lv: [30, 31], troops: ['t_c9_greed_a', 't_c9_greed_b'], bosses: ['t_c9_greed_boss'], party: ['xinghe', 'hongying', 'yungui'] },
    c9_yard: { name: '王船廠', ch: 9, lv: [31, 32], troops: ['t_c9_plague_a', 't_c9_plague_b', 't_c9_plague_eye'], bosses: ['t_c9_plague_boss'], party: ['xinghe', 'hongying', 'yungui'] },
    c9_longpan: { name: '龍磐風原', ch: 9, lv: [32, 33], troops: ['t_c9_wind_a', 't_c9_wind_b'], bosses: ['t_c9_fallwind'], party: ['xinghe', 'hongying', 'yungui'] },
    c9_longkeng: { name: '龍坑海蝕洞', ch: 9, lv: [33, 34], troops: ['t_c9_cave_a', 't_c9_cave_b', 't_c9_cave_c'], bosses: ['t_c9_moray_king'], party: ['xinghe', 'hongying', 'yungui'] },
  });

  // ---- quests ----
  D.quests = D.quests || {};
  Object.assign(D.quests, {
    q_ch9_main: { name: '王船南行', main: true, desc: '只有王船能渡黑水溝。向東港的千歲爺借船，先繞島巡境。',
      stages: ['到旗後天后宮打聽王船的消息。', '前往東港，向千歲爺請求借王船。', '夜裡到王船廠，取回舵、帆與龍目。', '王船出港。往南，前往鵝鑾鼻。', '到恆春古城，平息落山風。', '乘王船繞過南岬，前往鵝鑾鼻。', '穿過龍坑海蝕洞，把燈塔之火帶到王船。', '出航・往東，駛入黑潮。'] },
    q_ch9_banping: { name: '半屏山湯圓', lantern: true, desc: '旗後首富金萬伯為了「兩碗不用錢」的湯圓，去了半屏山就沒回來。',
      stages: ['坐渡船到哨船頭，去半屏山找金萬。', '進入半屏山腹，帶回金萬。', '回旗後金萬大厝。'] },
    q_ch9_names: { name: '被風偷走的七個名字', lantern: true, desc: '月琴伯阿順把出海沒回來的人編進歌裡。落山風把七個名字吹走了。',
      stages: ['前往龍磐，平息落山風。', '收集被風吹散的名字，回東門城牆。'] },
    q_ch9_lighthouse: { name: '燈塔守的家書', lantern: true, desc: '龍坑的側洞裡，散落著燈塔守湯姆的日誌殘頁。',
      stages: ['在龍坑的三個側洞找回燈塔日誌殘頁。', '把日誌殘頁交給燈室裡的湯先生。'] },
  });

  // =====================================================================================================
  // SHARED HELPERS
  // =====================================================================================================
  const U = G.U;
  const auto = () => !!(G.Debug && G.Debug.autoplay);
  // re-apply a map's (state-dependent) lighting / particles / music after a flag changed mid-map
  function relight(S, o = {}) {
    const m = G.mapScene;
    if (!m) return;
    m.lightCfg = Object.assign({}, G.Mapx.val(m.def.light) || { ambient: 0 });
    S.particles(G.Mapx.val(m.def.particles));
    if (o.bgm !== false) { const b = G.Mapx.val(m.def.bgm); if (b) S.bgm(b); }
  }
  // 距關鬼門 countdown
  function days(S, n) {
    const v = V();
    v.days_to_gate = Math.max(0, (v.days_to_gate == null ? 100 : v.days_to_gate) - n);
    S.sfx('bell');
    S.toast(`距關鬼門　${v.days_to_gate} 日`, 'lantern');
  }
  // names of the 七個名字 (flags ch9_name_1..7 → vars.ch9_names)
  const NAMES = ['陳水生', '黃阿九', '李順德', '王木', '潘金水', '林添福', '阿財仔'];
  function nameCount() { let n = 0; for (let i = 1; i <= 7; i++) if (F('ch9_name_' + i)) n++; V().ch9_names = n; return n; }
  async function gainName(S, i) {
    if (F('ch9_name_' + i)) return;
    S.flag('ch9_name_' + i);
    const n = nameCount();
    S.sfx('lantern');
    S.toast(`名字光：{y}${NAMES[i - 1]}{/}（${n} / 7）`, 'lantern');
    if (n === 7 && F('ch9_names_quest')) S.quest('q_ch9_names', 1);
  }
  function logCount() { let n = 0; for (let i = 1; i <= 3; i++) if (F('ch9_log_' + i)) n++; V().ch9_logs = n; return n; }

  // ---- 巡境圖 (island outline, six patrol points) --------------------------------------------------
  const XUNJING = [['donggang', '東港'], ['eluanbi', '鵝鑾鼻'], ['orchid', '蘭嶼'], ['taitung', '台東'], ['taroko', '太魯閣'], ['toucheng', '頭城']];
  class XunjingScene {
    constructor(newIdx) { this.t = 0; this.newIdx = newIdx; this.opaque = true; }
    update(dt) {
      this.t += dt;
      const done = auto() ? this.t > 0.1 : (this.t > 4.5 || (this.t > 1.5 && (G.Input.pressed('ok') || G.Input.clicked())));
      if (done && !this.closed) { this.closed = true; G.Scenes.pop(this); if (this.onDone) this.onDone(); }
    }
    draw(ctx) {
      const box = { x: 0, y: 0, w: G.W, h: G.H, ox: 300, oy: -10, s: 1 };
      G.World.drawMap(ctx, box, this.t, {});
      const sub = { x: box.ox, y: box.oy, s: 1 };
      const lit = V().xunjing || 0;
      XUNJING.forEach(([pid, label], i) => {
        const p = G.World.PLACES[pid];
        const [x, y] = G.World.proj(p[0], p[1], sub);
        const on = i < lit;
        const fresh = i === this.newIdx;
        const k = fresh ? Math.min(1, Math.max(0, (this.t - 0.6) / 0.8)) : on ? 1 : 0;
        ctx.save();
        if (k > 0) {
          const r = 26 + 10 * Math.sin(this.t * 4);
          const gr = ctx.createRadialGradient(x, y, 0, x, y, r * (fresh ? 1 + (1 - k) * 2 : 1));
          gr.addColorStop(0, `rgba(255,220,130,${0.9 * k})`); gr.addColorStop(1, 'rgba(255,160,60,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = k > 0.5 ? '#ffe7a0' : 'rgba(200,190,170,0.55)';
        ctx.strokeStyle = '#2a1408'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        G.Render.text(ctx, String(i + 1), x, y - 9, { size: 14, bold: true, align: 'center', color: '#3a2008', shadow: false });
        G.Render.text(ctx, label, x + 16, y - 30, { size: 20, color: k > 0.5 ? '#fff0c8' : '#9a9486', stroke: 'rgba(10,14,24,0.85)', strokeW: 3 });
        ctx.restore();
      });
      G.Render.text(ctx, '巡境圖', 60, 40, { size: 40, color: '#fff0d0', glow: 'rgba(255,170,90,0.6)', glowBlur: 14 });
      G.Render.text(ctx, `已巡 ${lit} / 6`, 64, 96, { size: 22, color: '#c9b893' });
    }
  }
  async function xunjingShow(S, idx) {
    V().xunjing = Math.max(V().xunjing || 0, idx + 1);
    S.sfx('bell');
    await S.scene(new XunjingScene(idx));
    S.toast(`巡境圖：{y}${XUNJING[idx][1]}{/} 亮起`, 'scroll');
  }

  // ---- 陳伯 as a guest follower (NPC, never in G.state.party) ----------------------------------------
  function chenboLine() {
    if (F('ch9_lighthouse_flame')) return ['chenbo:normal', '燈點了，這船才算醒。……星河，這燈是你們一路借來的，要記得還。'];
    if (F('ch9_keeper_met')) return ['chenbo:normal', '火要護好。燈塔的火分出來，就是你們的責任了。'];
    if (F('ch9_hengchun_done')) return ['chenbo:normal', '南岬的風讓路了。回船上，往鵝鑾鼻。'];
    if (F('ch9_fallwind_defeated')) return ['chenbo:smile', '風停了。……今晚城牆上，應該聽得很清楚。'];
    if (F('ch9_names_quest')) return ['chenbo:serious', '風的源頭在龍磐。出東門，往台地上走。'];
    if (F('ch9_cape_blocked')) return ['chenbo:serious', '這城裡的人，怕的不是風，是風裡的聲音。'];
    if (F('ch9_wangboat_launch')) return ['chenbo:normal', '三十年沒掌舵了。手生了，船倒是熟的——好船就是這樣，會教人。'];
    if (F('ch9_jiaobei_done')) return ['chenbo:serious', '王船廠今晚會鬧。艾草帶著，別逞強。'];
    if (F('ch9_donggang_arrive')) return ['chenbo:serious', '進廟之前，先拜天公爐。規矩不能亂。'];
    if (F('ch9_qihou_night_done')) return ['chenbo:normal', '沿沙洲往南，就是東港。路上的海，你們多看兩眼。'];
    if (F('ch9_qihou_temple')) return ['chenbo:sad', '晚上要去海邊吧。……我在附近看著。'];
    return ['chenbo:normal', '先到天后宮打聽消息。阿標那傢伙，應該還在。'];
  }
  function chenboNpc(mapId, start, cond) {
    return {
      id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', name: '陳伯', follow: true, through: true, dir: 'down',
      x: start[0], y: start[1], pos: (s) => (s.map === mapId ? [s.x, s.y] : start),
      if: cond || (() => true),
      talk: async (S) => { await S.lines([chenboLine()]); },
    };
  }
  function chenboFollow(m, dt, busy) {
    const c = m.npcs.find((n) => n.id === 'chenbo' && n.def && n.def.follow);
    if (!c) return;
    const tail = m.followers.length && !m.hideFollowers ? m.followers[m.followers.length - 1] : m.player;
    const tr = m._c9trail || (m._c9trail = []);
    const last = tr[tr.length - 1];
    if (!last || last[0] !== tail.x || last[1] !== tail.y) { tr.push([tail.x, tail.y]); if (tr.length > 8) tr.shift(); }
    if (busy || c.scripted || c.moving || c.queue.length) return;
    const d = Math.abs(c.x - tail.x) + Math.abs(c.y - tail.y);
    if (d > 5) { const p = tr.length > 1 ? tr[tr.length - 2] : [tail.x, tail.y]; c.setCell(p[0], p[1]); return; }
    if (d <= 1) return;
    const tgt = tr.length > 1 ? tr[tr.length - 2] : [tail.x, tail.y];
    let dx = Math.sign(tgt[0] - c.x), dy = Math.sign(tgt[1] - c.y);
    if (dx && dy) { if (Math.abs(tgt[0] - c.x) >= Math.abs(tgt[1] - c.y)) dy = 0; else dx = 0; }
    if (!dx && !dy) return;
    c.dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    c.speed = 6.9;
    c.startMove(c.x + dx, c.y + dy);
  }
  // compose a map's onUpdate: 陳伯 follows + optional extra mechanics
  const withFollow = (extra) => (dt, m, busy) => { chenboFollow(m, dt, busy); if (extra) extra(dt, m, busy); };

  // ---- small UI bits drawn in world space ---------------------------------------------------------
  function screenOrigin(ctx, m) { return [m.cam.x, m.cam.y]; }
  function glowDot(ctx, x, y, r, col, a) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, U.rgba(col, a)); gr.addColorStop(1, U.rgba(col, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  // floating golden-white "name light" / log sparkle at a cell
  function drawSpark(ctx, cx, cy, t, col = '#fff2c0') {
    const x = cx * T + T / 2, y = cy * T + T / 2 - 18 + Math.sin(t * 2.4 + cx) * 4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowDot(ctx, x, y, 26, col, 0.55 + 0.2 * Math.sin(t * 5 + cy));
    glowDot(ctx, x, y, 8, '#ffffff', 0.9);
    ctx.restore();
  }

  // ---- story party setup ------------------------------------------------------------------------------
  // Chapter 9 party: 星河・紅纓・雲歸 (+糰子). When started standalone (debug), give them the gear they
  // would have collected by the end of chapter 8.
  function prepareParty() {
    for (const id of ['xinghe', 'hongying', 'yungui']) {
      if (!G.state.members[id]) G.Party.create(id, 30);
      if (!G.state.party.includes(id)) G.state.party.push(id);
      G.Story.ensureLevel(id, 30);
    }
    G.Party.leave('baizhi');
    G.state.party = ['xinghe', 'hongying', 'yungui'].concat(G.state.party.filter((p) => !['xinghe', 'hongying', 'yungui'].includes(p)));
    if (!F('ch8_end')) {
      const best = (id, slot) => {
        let b = null;
        for (const [iid, it] of Object.entries(D.items)) {
          if (it.type !== slot || (it.ch || 0) > 8 || (it.who && !it.who.includes(id))) continue;
          const sc = (it.stats ? (it.stats.atk || 0) + (it.stats.def || 0) + (it.stats.mag || 0) : 0);
          if (!b || sc > b.sc) b = { iid, sc };
        }
        return b && b.iid;
      };
      for (const id of ['xinghe', 'hongying', 'yungui']) {
        const m = G.state.members[id];
        for (const slot of ['weapon', 'armor', 'head', 'feet']) { const it = best(id, slot); if (it) m.equip[slot] = it; }
        const st2 = G.Party.stats(id); m.hp = st2.mhp; m.mp = st2.mmp;
      }
      if (!G.Inv.has('key_jianpu')) G.Inv.add('key_jianpu', 1);
      if (!G.Inv.has('key_oar')) G.Inv.add('key_oar', 1);
      for (const [iid, n] of [['shimuyu', 3], ['xumingsan', 5], ['huanhunxiang', 3], ['xiancao', 3]]) if (G.Inv.count(iid) < n) G.Inv.add(iid, n - G.Inv.count(iid));
      if (G.state.gold < 3000) G.state.gold = 3000;
    }
  }

  // =====================================================================================================
  // BOSS BATTLE HOOKS (installed through S.battle(troop, { intro }) — they wrap the scene instance only)
  // =====================================================================================================
  // 大肚貪鬼: 吞食 steals a consumable each time; everything comes back when it falls.
  function greedIntro(stolen) {
    return async (sc) => {
      const exec = sc.execute.bind(sc);
      sc.execute = async (u, cmd) => {
        if (u.side === 'enemy' && cmd && cmd.skill === 'c9_es_devour') {
          await exec(u, cmd);
          const pool = G.Inv.list((it) => it.type === 'use');
          if (pool.length) {
            const id = U.pick(pool);
            G.Inv.remove(id, 1);
            stolen.push(id);
            sc.say(`${D.items[id].name}被吞掉了！`, 1.6);
          } else sc.say('什麼也沒吞到……大肚貪鬼更餓了。', 1.4);
          await sc.wait(0.9);
          return;
        }
        return exec(u, cmd);
      };
    };
  }

  // 瘟鬼頭: 躲在人群裡 (-40% damage while small ghosts live), 高燒 (P2), 艾草 silences 瘟息, 陳伯's 龍目 call.
  function plagueIntro() {
    return async (sc) => {
      const chief = sc.enemies.find((e) => e.id === 'c9_plague_chief');
      if (!chief) return;
      let p2 = false, critNext = false, noBreath = 0;
      const smalls = () => sc.enemies.filter((e) => !e.dead && e !== chief);
      const dmg = sc.damage.bind(sc);
      sc.damage = (tg, d, o = {}) => {
        if (tg === chief && smalls().length) d = Math.max(1, Math.round(d * 0.6));
        if (critNext && o.attacker && o.attacker.id === 'xinghe' && tg.side === 'enemy') {
          critNext = false;
          if (!o.crit) { d = Math.round(d * 1.5); o = Object.assign({}, o, { crit: true }); }
        }
        return dmg(tg, d, o);
      };
      const ai = sc.aiCommand.bind(sc);
      sc.aiCommand = (e) => {
        let cmd = ai(e);
        if (e === chief) {
          const tgt = () => [U.pick(sc.alive('party'))];
          if (cmd.skill === 'c9_es_plague_breath' && noBreath > 0) cmd = { kind: 'skill', skill: 'c9_es_fever_touch', targets: tgt() };
          else if (cmd.skill === 'c9_es_summon_plague' && smalls().length >= 2) cmd = { kind: 'skill', skill: 'c9_es_fever_touch', targets: tgt() };
          if (noBreath > 0) noBreath--;
        }
        return cmd;
      };
      const useItem = sc.useItem.bind(sc);
      sc.useItem = async (u, id, tgs) => {
        await useItem(u, id, tgs);
        if (id === 'c9_aicao' && !chief.dead) { noBreath = 1; sc.say('艾草的煙一熏，瘟鬼頭嗆得噴不出瘟息！', 1.6); await sc.wait(0.8); }
      };
      const phases = sc.checkPhases.bind(sc);
      sc.checkPhases = async () => {
        await phases();
        if (!p2 && !chief.dead && chief.hp <= chief.mhp * 0.5) {
          p2 = true;
          await G.Dialog.say('', '瘟鬼頭的身體燒得通紅——「高燒」！熱氣燒灼著整個船台。');
          await G.Dialog.say('chenbo:angry', '星河！龍目！');
          await G.Dialog.say('xinghe:serious', '……看見了！');
          G.Dialog.close();
          chief.def = Math.round(chief.def * 0.8);
          sc.addStatus(chief, 'defDown', 3);
          critNext = true;
          sc.say('龍目的光照在瘟鬼頭身上！', 1.6);
          await sc.wait(0.9);
        }
      };
      const startTurn = sc.startTurn.bind(sc);
      sc.startTurn = async (u) => {
        if (p2 && u === chief && !chief.dead) {
          for (const p of sc.alive('party')) {
            const d = Math.min(p.hp - 1, Math.max(1, Math.round(p.mhp * 0.03)));
            if (d > 0) dmg(p, d, { color: '#ff9a6a', noGauge: true });
          }
          sc.say('高燒的熱氣燒灼著每個人……', 1.0);
          await sc.wait(0.4);
        }
        return startTurn(u);
      };
    };
  }

  // 落山風靈: 風勢 gauge 0–3 → forced 落山 (吹離 unless guarding / 月琴弦護符); metal hits pierce the wind eye;
  // 70% 月琴聲 regen; 50% splits into three 風團 (each carries a name); P3 regroups at 50% HP, gauge cap 2.
  function fallwindIntro() {
    return async (sc) => {
      const boss = sc.enemies[0];
      const W = { v: 0, cap: 3, regen: false, split: false, rejoined: false, p3: false, blow: false, metal: false, cur: null };
      const puffIds = ['c9_puff_a', 'c9_puff_b', 'c9_puff_c'];
      const puffs = () => sc.enemies.filter((e) => puffIds.includes(e.id));
      const amulet = (u) => !!(u.m && Object.values(u.m.equip || {}).includes('c9_ac_yueqin'));
      const ai = sc.aiCommand.bind(sc);
      sc.aiCommand = (e) => {
        if (W.cap >= 3 && W.v >= 3) { W.blow = true; return { kind: 'skill', skill: 'c9_es_downslope', targets: sc.alive('party') }; }
        return ai(e);
      };
      const apply = sc.applyEffect.bind(sc);
      sc.applyEffect = (u, tg, s, hits) => {
        if (u.side === 'party' && tg.side === 'enemy' && !tg.dead && s && s.elem === 'metal' && (s.type === 'phys' || s.type === 'mag')) W.metal = true;
        return apply(u, tg, s, hits);
      };
      const dmg = sc.damage.bind(sc);
      sc.damage = (tg, d, o = {}) => {
        if (W.cur === 'c9_es_downslope' && tg.side === 'party' && W.regen && !W.split) d = Math.round(d * 1.15);
        return dmg(tg, d, o);
      };
      const exec = sc.execute.bind(sc);
      sc.execute = async (u, cmd) => {
        W.cur = cmd && cmd.skill;
        W.metal = false;
        await exec(u, cmd);
        W.cur = null;
        if (u.side === 'party' && W.metal && W.v > 0) { W.v--; sc.popText(u, '刺穿風眼！', '#fff0a0', -40); }
        if (u.side === 'enemy') {
          if (W.blow) {
            W.blow = false; W.v = 0;
            for (const p of sc.alive('party')) {
              if (p.st.guard || amulet(p)) { sc.popText(p, '穩住了！', '#d8f0ff', -40); continue; }
              p.wait += 150 * 40 / (p.spd + 40);
              sc.popText(p, '吹離！', '#c8f0ff', -40);
            }
            await sc.wait(0.5);
          } else {
            W.v = Math.min(W.cap, W.v + 1);
            if (W.v === 2 && W.cap >= 3) sc.say('雲歸：「它要吹了！伏低！」', 1.6);
          }
        }
      };
      const kill = sc.kill.bind(sc);
      sc.kill = (u) => {
        kill(u);
        const i = puffIds.indexOf(u.id);
        if (i >= 0) {
          G.state.flags['ch9_name_' + (i + 1)] = true;
          nameCount();
          sc.say(`名字浮現了——${NAMES[i]}`, 1.8);
        }
      };
      const ce = sc.checkEnd.bind(sc);
      sc.checkEnd = () => {
        if (W.split && !W.rejoined && !sc.result && puffs().length && puffs().every((p) => p.dead)) {
          W.rejoined = true; W.p3 = true;
          boss.dead = false; boss.alpha = 0.75; boss.hp = Math.round(boss.mhp * 0.5); boss.phase = 3; boss.st = {};
          boss.scale = (boss.scale || 1) * 0.85; boss.wait = 30;
          W.cap = 2; W.v = Math.min(W.v, 2);
          boss.d = Object.assign({}, boss.d, { skills: [{ id: 'c9_es_lastwind', w: 3 }, { id: 'c9_es_gust', w: 2 }, { id: 'c9_es_sandblast', w: 2 }] });
          sc.say('風團重新聚了起來——落山風靈又站了起來，卻透明了許多。', 2);
        }
        return ce();
      };
      const phases = sc.checkPhases.bind(sc);
      sc.checkPhases = async () => {
        if (!W.regen && !boss.dead && boss.hp <= boss.mhp * 0.7) {
          W.regen = true;
          await G.Dialog.say('', '遠方，細細的月琴聲穿過風傳了過來——「思啊想啊起——」');
          await G.Dialog.say('hongying:surprise', '是阿順伯！');
          await G.Dialog.say('xinghe:smile', '他說過，會一直彈。');
          G.Dialog.close();
          for (const p of sc.alive('party')) sc.addStatus(p, 'regen', 3);
          await sc.wait(0.5);
        }
        await phases();
        if (!W.split && puffs().length) {
          W.split = true;
          boss.dead = true; boss.st = {};
          sc.tween(boss, { alpha: 0 }, 0.6);
          await G.Dialog.say('', '落山風靈散成三團風團——每一團的胸口，都纏著一個發光的名字。');
          G.Dialog.close();
        }
        if (W.p3) {
          W.p3 = false;
          await G.Dialog.say('', '落山風靈：……回——家——……我……也要……回……');
          await G.Dialog.say('xinghe:serious', '你不用回家！你本來就是風——你的家是山跟海之間！');
          G.Dialog.close();
        }
      };
      const draw = sc.draw.bind(sc);
      sc.draw = (ctx) => {
        draw(ctx);
        if (sc.vic || sc.result) return;
        const x = G.W / 2 - 120, y = 92;
        ctx.save();
        G.UI.plate(ctx, x, y, 240, 44, 0.6, 20);
        G.Render.text(ctx, '風勢', x + 18, y + 9, { size: 20, color: '#d8f0ff' });
        for (let i = 0; i < 3; i++) {
          const on = i < W.v, capped = i >= W.cap;
          const cx = x + 98 + i * 44, cy = y + 22;
          ctx.globalAlpha = capped ? 0.25 : 1;
          ctx.strokeStyle = on ? (W.v >= 2 && W.cap >= 3 ? `rgba(255,${150 + 80 * Math.sin(sc.t * 12)},120,1)` : '#bff0ff') : 'rgba(200,220,240,0.35)';
          ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(cx, cy, 13, Math.PI * 0.9, Math.PI * 2.3); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx + 2, cy, 6, Math.PI * 1.1, Math.PI * 2.4); ctx.stroke();
        }
        ctx.restore();
      };
    };
  }

  // 潮病鰻王: 護火 (flame gauge carried in from the cave; 撲火 −10; 0 → darkness magDown), 護燈 command,
  // lighthouse beam stuns the king every 4 rounds; P2 (<40%) def −25%, spd +10.
  function morayIntro() {
    return async (sc) => {
      const king = sc.enemies.find((e) => e.id === 'c9_moray_king');
      const v = V();
      v.flame = Math.max(40, v.flame == null ? 100 : v.flame);
      const xh = sc.party.find((p) => p.id === 'xinghe');
      if (xh && !xh.m.skills.includes('c9_guard_lamp')) xh.m.skills.push('c9_guard_lamp');
      let p2 = false, dark = false;
      const setFlame = (n, u) => {
        const before = v.flame;
        v.flame = Math.max(0, Math.min(100, n));
        if (u && v.flame !== before) sc.popText(u, `燈火 ${v.flame > before ? '+' : ''}${v.flame - before}`, '#ffd27a', -60);
        if (v.flame <= 0 && !dark) { dark = true; sc.say('防風燈熄了——拱門下一片漆黑！', 1.8); }
        if (v.flame > 0 && dark) { dark = false; sc.say('燈火又亮了起來。', 1.2); }
      };
      const ai = sc.aiCommand.bind(sc);
      sc.aiCommand = (e) => {
        const cmd = ai(e);
        if (e === king && cmd.skill === 'c9_es_tide_rise' && sc.enemies.some((x) => x !== king && !x.dead)) {
          return { kind: 'skill', skill: p2 ? 'c9_es_tailsweep2' : 'c9_es_tailsweep', targets: sc.alive('party') };
        }
        return cmd;
      };
      const exec = sc.execute.bind(sc);
      sc.execute = async (u, cmd) => {
        await exec(u, cmd);
        if (cmd && cmd.skill === 'c9_guard_lamp') setFlame(v.flame + 15, u);
        if (u === king && cmd && cmd.skill === 'c9_es_snuff') setFlame(v.flame - 10, sc.alive('party')[0] || u);
        if (u === king && cmd && cmd.skill === 'c9_es_tide_rise') sc.addStatus(king, 'atkUp', 3);
      };
      const startTurn = sc.startTurn.bind(sc);
      sc.startTurn = async (u) => {
        if (u === sc.party[0] && sc.rounds > 1 && (sc.rounds - 1) % 4 === 0 && king && !king.dead) {
          sc.say('湯姆的聲音：「This way! 這邊！」燈塔的光束掃進了拱門！', 2);
          G.Render.doFlash('#fff6d8', 0.5, 0.6);
          sc.addStatus(king, 'stun', 1);
          await sc.wait(0.8);
        }
        if (u.side === 'party' && dark && !u.st.magDown) sc.addStatus(u, 'magDown', 2, true);
        return startTurn(u);
      };
      const phases = sc.checkPhases.bind(sc);
      sc.checkPhases = async () => {
        await phases();
        if (!p2 && king && king.phase === 2) { p2 = true; king.def = Math.round(king.def * 0.75); king.spd += 10; }
      };
      const draw = sc.draw.bind(sc);
      sc.draw = (ctx) => {
        draw(ctx);
        if (sc.vic || sc.result) return;
        const x = G.W / 2 - 130, y = 92;
        ctx.save();
        G.UI.plate(ctx, x, y, 260, 44, 0.6, 20);
        G.UI.lanternIcon(ctx, x + 24, y + 22, 9, sc.t);
        G.Render.text(ctx, '燈火', x + 42, y + 9, { size: 20, color: '#ffe0a0' });
        G.UI.bar(ctx, x + 96, y + 16, 140, 12, v.flame / 100, '#ffd27a', '#e07a2a');
        ctx.restore();
      };
    };
  }
  function removeGuardLamp() { const m = G.state.members.xinghe; if (m) m.skills = m.skills.filter((s) => s !== 'c9_guard_lamp'); }

  // =====================================================================================================
  // MAP 1 — qihou 旗後漁村（打狗）
  // =====================================================================================================
  const qhNight = (s) => !!s.flags.ch9_qihou_night && !s.flags.ch9_qihou_night_done;
  const QH = (() => {
    const g = grid(48, 36, '.');
    g.rect(0, 0, 48, 1, '~').rect(0, 0, 3, 36, '~').rect(41, 0, 7, 36, '~').rect(0, 34, 48, 2, '~');
    g.rect(3, 1, 7, 33, 's').rect(39, 1, 2, 33, 's').rect(10, 30, 29, 4, 's').rect(20, 34, 8, 2, 's');
    // 旗後山 (cliff), summit plateau, stone steps
    g.rect(12, 1, 22, 6, 'X').rect(17, 2, 11, 2, ',').rect(22, 4, 2, 3, 'H');
    g.set(12, 6, '.').set(33, 6, '.').set(12, 5, '.').set(33, 5, '.');
    // roads & lanes
    g.rect(10, 7, 29, 2, '=').rect(22, 7, 2, 1, '=');
    g.rect(16, 9, 2, 6, ':').rect(24, 9, 2, 6, ':');
    g.rect(36, 9, 2, 22, '=');
    g.rect(15, 15, 13, 6, '%');           // 廟埕
    g.rect(22, 21, 2, 15, '=');           // road south to the sandspit
    g.rect(19, 26, 17, 1, '=');
    g.rect(28, 21, 8, 1, '=');
    g.rect(10, 24, 9, 4, ':');            // 金萬大厝 courtyard
    // pier
    g.rect(39, 7, 7, 2, 'k');
    // shore details
    g.dots([[3, 1], [3, 2], [3, 33], [4, 33], [9, 33]], '-');
    return g.rows();
  })();
  const QH_DECO = (() => {
    const d = grid(48, 36, ' ');
    // beach & hill vegetation
    d.dots([[10, 2], [11, 4], [34, 2], [35, 4], [37, 3], [10, 5], [35, 6]], 't');
    d.dots([[17, 2], [27, 3], [18, 3]], 't');
    d.dots([[3, 27], [4, 27], [5, 28], [3, 28], [3, 30], [5, 30], [6, 31], [8, 32], [4, 31]], 'P');
    d.dots([[11, 13], [13, 13], [29, 12], [38, 4], [38, 2], [12, 29], [16, 29], [26, 29], [33, 28]], 'h');
    d.dots([[10, 15], [10, 17], [34, 28], [35, 29], [28, 31], [33, 31]], 'u');
    d.dots([[25, 31], [27, 31], [24, 32]], 'e');
    d.dots([[7, 21], [8, 22], [7, 24]], 'r');
    return d.rows();
  })();
  G.Maps.define('qihou', {
    name: '旗後', subtitle: '打狗港口的沙洲漁村', place: 'takao',
    bgm: (s) => (qhNight(s) ? 'night' : 'south'),
    start: [40, 8],
    light: (s) => (qhNight(s) ? { ambient: 0.55, color: '#0a1030', playerR: 230 } : { ambient: 0 }),
    particles: (s) => (qhNight(s) ? ['lanterns', 'embers'] : [{ type: 'wind', density: 0.5 }]),
    tiles: QH, deco: QH_DECO,
    objects: [
      { t: 'mazu_temple', x: 18, y: 11, door: 2, text: '旗後天后宮' },
      { t: 'incense_burner', x: 21, y: 17 },
      { t: 'statue_lion', x: 17, y: 15 }, { t: 'statue_lion', x: 24, y: 15, flip: true },
      { t: 'red_lantern', x: 15, y: 15 }, { t: 'red_lantern', x: 27, y: 15 },
      { t: 'lantern_string', x: 15, y: 14, w: 3 }, { t: 'lantern_string', x: 25, y: 14, w: 3 },
      { t: 'house_minnan', x: 11, y: 9, v: 0 }, { t: 'house_minnan', x: 27, y: 9, v: 1 },
      { t: 'drying_rack', x: 33, y: 10, v: 0 }, { t: 'barrel', x: 32, y: 10 },
      { t: 'stall', x: 30, y: 13, text: '鮮魚', counter: true }, { t: 'stall', x: 33, y: 13, text: '虱目魚' }, { t: 'stall', x: 30, y: 16, text: '魚乾' },
      { t: 'basket', x: 35, y: 13 }, { t: 'basket', x: 29, y: 17 }, { t: 'jar', x: 32, y: 17 },
      { t: 'shophouse', x: 30, y: 18, v: 0, text: '海口客棧' },
      { t: 'shophouse', x: 30, y: 22, v: 1, text: '雜貨' },
      { t: 'shophouse', x: 24, y: 22, v: 2, text: '藥鋪' },
      { t: 'house_minnan', x: 11, y: 21, w: 6, door: 3, v: 1, text: '金萬' },
      { t: 'fence_wood', x: 10, y: 27, w: 4 }, { t: 'fence_wood', x: 15, y: 27, w: 4 },
      { t: 'well', x: 12, y: 25, interact: async (S) => {
        if (F('ch9_banping_done')) await S.say('', '水窟仔的鎖拆了，井口擺著一支木勺。水是甜的。');
        else await S.say('', '一口加了蓋、上了大鎖的水窟仔。鎖頭擦得發亮。');
      }, label: '調查' },
      { t: 'well', x: 19, y: 22, interact: ['井水帶著海的鹹味。逆潮倒灌，旗後的井都鹹了。'], label: '調查' },
      { t: 'tree_banyan', x: 29, y: 27 },
      { t: 'bench', x: 26, y: 28 },
      // beach: boats, nets, drying fish
      { t: 'boat_small', x: 4, y: 4 }, { t: 'boat_small', x: 4, y: 6 }, { t: 'boat_small', x: 6, y: 2 },
      { t: 'fishing_net', x: 6, y: 10 }, { t: 'fishing_net', x: 6, y: 12 },
      { t: 'laundry', x: 3, y: 10 },
      { t: 'drying_rack', x: 7, y: 8, v: 0 },
      { t: 'barrel', x: 8, y: 5 }, { t: 'crate', x: 9, y: 5 },
      { t: 'firepit', x: 6, y: 16, if: (s) => qhNight(s) },
      { t: 'driftwood', x: 4, y: 22 }, { t: 'rock_small', x: 8, y: 26 },
      // pier & ferry
      { t: 'dock_post', x: 45, y: 6 }, { t: 'dock_post', x: 45, y: 9 }, { t: 'dock_post', x: 39, y: 9 },
      { t: 'boat_ferry', x: 43, y: 9, solid: false, z: -200, key: 'qh_ferry' },
      { t: 'wang_boat', x: 41, y: 12, water: true, solid: false, z: -200, if: (s) => !!s.flags.ch9_wangboat_launch && s.vars.ch9_port === 'qihou' },
      { t: 'crate', x: 38, y: 6 }, { t: 'barrel', x: 38, y: 5 },
      // hill
      { t: 'signboard', x: 19, y: 2, text: '旗後山', interact: ['「旗後山」。從山頂望下去，打狗港窄窄的一道口，兩邊山夾著。', '港內的水看起來平，一艘竹筏正慢慢渡過去。'], label: '眺望' },
      { t: 'stone_lantern', x: 21, y: 3 }, { t: 'stone_lantern', x: 24, y: 3 },
      { t: 'lamp_post', x: 19, y: 9 }, { t: 'lamp_post', x: 35, y: 9 },
      { t: 'red_lantern', x: 29, y: 18 }, { t: 'red_lantern', x: 35, y: 19 },
      { t: 'signboard', x: 21, y: 31, text: '往東港', interact: ['路牌：「沿沙洲往南──東港」。'], label: '看' },
    ],
    chests: [
      { id: 'qh_hill', x: 26, y: 2, item: 'c9_xiancaodong', n: 3 },
      { id: 'qh_pandanus', x: 4, y: 29, item: 'shimuyu', n: 2 },
      { id: 'qh_lane', x: 37, y: 31, gold: 600 },
    ],
    lights: (s) => (qhNight(s) ? [{ x: 21, y: 16, r: 220, color: '#ffb060', flicker: 0.2 }, { x: 31, y: 14, r: 150, color: '#ffb060' }, { x: 32, y: 20, r: 150, color: '#ffc070' }, { x: 13, y: 12, r: 120, color: '#ffb060' }] : []),
    npcs: [
      chenboNpc('qihou', [40, 8], (s) => !!s.flags.ch9_qihou_arrive && !qhNight(s)),
      { id: 'qh_boatman', sprite: 'boatman', name: '船夫阿水', x: 42, y: 7, dir: 'down', talk: async (S) => {
        if (F('ch9_banping_done')) await S.say('船夫阿水', '聽講金萬伯把水窟仔打開了？夭壽，太陽打西邊出來喔。');
        if (F('ch9_banping_open')) {
          await S.say('船夫阿水', '要去半屏山？坐我的竹筏到對面，再走一段就到。');
          const c = await S.choice(['到哨船頭（往半屏山）', '不用了'], { cancel: 1 });
          if (c === 0) { await ferryToBanping(S); return; }
          return;
        }
        await S.say('船夫阿水', '哨船頭到旗後，一趟兩文。港內水看起來平，底下流仔可急咧。');
        await S.say('船夫阿水', '打狗港口窄，兩邊山夾著，船要算準潮水才進得來。');
      } },
      { id: 'qh_netwoman', sprite: 'fisher_f', name: '阿蕊姨', x: 8, y: 11, dir: 'left', wander: 1, if: (s) => !qhNight(s), talk: async (S) => {
        if (F('ch9_qihou_night_done')) { await S.say('阿蕊姨', '昨晚那些……是溺死的人吼？唉，可憐。我燒了一點金紙給他們。'); return; }
        await S.say('阿蕊姨', '網破了要補，人心破了也要補。補網我會，補人心我就不會了。');
        await S.say('阿蕊姨', '最近晚上海面有藍色的火，一點一點往岸上走。我男人說是漁火，我看不是。');
      } },
      { id: 'qh_fisher_old', sprite: 'fisherman', name: '海龍伯', x: 7, y: 6, dir: 'down', if: (s) => !qhNight(s), talk: [
        '旗後人出海，看天、看雲、看水色。今年的水色不對，黑裡帶青，像死人臉。',
        '南邊的水是好的。黑潮那條，暖的、藍的，飛魚一群一群跟著來。',
        '同樣叫「黑」，西邊那條黑水溝收人命，東邊那條黑潮送魚來。海也有兩張臉啦。',
      ] },
      { id: 'qh_kid', sprite: 'child_m', name: '阿全', x: 26, y: 18, dir: 'left', wander: 2, if: (s) => !qhNight(s), talk: async (S) => {
        await S.say('阿全', '你的貓好胖！牠會游泳嗎？');
        await S.say('tuanzi:angry', '本大爺是石虎！石虎不游泳，石虎坐船！');
        await S.say('阿全', '阿嬤說晚上不能在海邊叫人家名字，會被聽到。');
      } },
      { id: 'qh_xiu', sprite: 'child_f', name: '阿秀', x: 15, y: 25, dir: 'down', if: (s) => !!s.flags.ch9_qihou_night_done && !s.flags.ch9_banping_reward, talk: async (S) => {
        if (F('ch9_banping_done')) { await S.say('阿秀', '阿公回來了！他在水窟仔那邊……'); return; }
        if (F('ch9_banping_open')) { await S.say('阿秀', '坐渡船到哨船頭，再往北走，就是半屏山。拜託你們……'); return; }
        await xiuScene(S);
      } },
      { id: 'qh_jinwan', sprite: 'merchant', name: '金萬伯', x: 13, y: 26, dir: 'up', if: (s) => !!s.flags.ch9_banping_done, talk: [
        '來來來，不用錢！……不對，這不是「不用錢」。是我請的。',
        '我拿了一輩子，從來沒有飽過。現在給出去，奇怪，倒是飽了。',
      ] },
      { id: 'qh_inn', sprite: 'shopkeeper_f', name: '老闆娘', x: 32, y: 21, dir: 'down', if: (s) => !qhNight(s), talk: async (S) => {
        await S.say('老闆娘', '住一晚八十文。今晚吃虱目魚粥，早上剛殺的，新鮮。');
        await S.inn(80, { who: '老闆娘' });
      } },
      { id: 'qh_shop1', sprite: 'merchant', name: '雜貨鋪頭家', x: 32, y: 25, dir: 'down', if: (s) => !qhNight(s), talk: async (S) => {
        await S.say('雜貨鋪頭家', '出海、趕路，要帶的都有。艾草束是端午前新割的。');
        await S.shop(['shimuyu', 'c9_xiancaodong', 'ezaijian', 'c9_aicao', 'huanhunxiang'], { title: '旗後雜貨' });
      } },
      { id: 'qh_shop2', sprite: 'doctor', name: '藥鋪先生', x: 26, y: 25, dir: 'down', if: (s) => !qhNight(s), talk: async (S) => {
        await S.say('藥鋪先生', '海邊濕氣重，解毒、清心的藥，帶一些在身上。');
        await S.shop(['c9_jiedusan', 'c9_qingxindan', 'c9_baicaogao', 'c9_lurongjiu'], { title: '旗後藥鋪' });
      } },
      { id: 'qh_vendor1', sprite: 'villager_m', name: '魚市攤販', x: 31, y: 12, dir: 'down', fixedDir: true, if: (s) => !qhNight(s), talk: ['虱目魚、肉魚、白帶魚！逆潮以後魚變少了，價錢歹勢喔，要漲一點。'] },
      { id: 'qh_vendor2', sprite: 'old_f', name: '魚乾阿婆', x: 34, y: 11, dir: 'down', if: (s) => !qhNight(s), talk: ['魚乾要曬三日日頭。今年的風一直怪怪的，曬不乾，臭臭的。'] },
      { id: 'qh_scholar', sprite: 'scholar', name: '落第秀才', x: 14, y: 8, dir: 'down', wander: 2, if: (s) => !qhNight(s), talk: [
        '打狗二字粗鄙！粗鄙！……不過聽說源自平埔語，意為竹林，倒也風雅。',
        '半屏山的故事你們聽過嗎？貪心不足蛇吞象，貪心不足人吞山。',
      ] },
    ],
    events: [
      // C9-03 夜灘
      { id: 'qh_nightbeach', trigger: 'touch', x: 3, y: 12, w: 7, h: 10, if: (s) => qhNight(s), run: async (S) => { await nightBeach(S); } },
      // 半屏山 reward when coming back
      { id: 'qh_banping_reward', trigger: 'auto', if: (s) => !!s.flags.ch9_banping_done && !s.flags.ch9_banping_reward, run: async (S) => { await banpingReward(S); } },
      // C9-04 沿海南行
      { id: 'qh_south', trigger: 'touch', x: 20, y: 35, w: 8, h: 1, run: async (S) => {
        if (!F('ch9_qihou_night_done')) {
          await S.say('chenbo:serious', '急什麼。王船的消息還沒打聽清楚，先在旗後落腳。');
          await S.move('player', 'U'); return;
        }
        await roadSouth(S);
      } },
      // board the 王船 when it is moored in 打狗港
      { id: 'qh_board', trigger: 'touch', x: 45, y: 7, w: 1, h: 2, if: (s) => !!s.flags.ch9_wangboat_launch && s.vars.ch9_port === 'qihou', run: async (S) => { await boardDeck(S); } },
    ],
    warps: [
      { x: 20, y: 14, w: 2, to: 'qihou_temple', tx: 7, ty: 9, tdir: 'up', door: true },
    ],
    onUpdate: withFollow(),
  });

  // ---- 旗後天后宮 interior ----
  G.Maps.define('qihou_temple', {
    name: '旗後天后宮', subtitle: '打狗最老的媽祖廟', place: 'takao', bgm: 'temple', start: [7, 9],
    light: { ambient: 0.18, color: '#2a1408' }, particles: ['motes'],
    tiles: (() => {
      const g = grid(16, 12, 'E');
      g.rect(1, 2, 14, 9, 'T').rect(7, 11, 2, 1, 'T');
      g.rect(6, 6, 4, 4, 'c');
      return g.rows();
    })(),
    objects: [
      { t: 'altar', x: 7, y: 2 }, { t: 'eternal_lamp', x: 5, y: 2 }, { t: 'eternal_lamp', x: 10, y: 2 },
      { t: 'banner', x: 4, y: 2, color: '#b0281e' }, { t: 'banner', x: 11, y: 2, color: '#b0281e' },
      { t: 'pillar', x: 2, y: 2 }, { t: 'pillar', x: 13, y: 2 }, { t: 'pillar', x: 2, y: 8 }, { t: 'pillar', x: 13, y: 8 },
      { t: 'incense_burner', x: 8, y: 4 },
      { t: 'fortune_sticks', x: 11, y: 4 }, { t: 'divination_blocks', x: 4, y: 4 },
      { t: 'mural', x: 2, y: 1, v: 3 }, { t: 'mural', x: 12, y: 1, v: 1 },
      { t: 'plant_pot', x: 1, y: 10, v: 1 }, { t: 'plant_pot', x: 14, y: 10, v: 2 },
    ],
    npcs: [
      chenboNpc('qihou_temple', [8, 9]),
      { id: 'qh_keeper', sprite: 'temple_keeper', name: '阿標伯', x: 11, y: 5, dir: 'left', talk: async (S) => {
        if (F('ch9_qihou_night_done')) await S.say('阿標伯', '昨晚海邊的事我聽講了。……多謝你們。');
        await S.say('阿標伯', '媽祖婆保佑討海人。你們要過黑水溝，路上記得心裡念祂。');
        await S.say('阿標伯', '這間廟是早年從唐山過來討海的人一磚一瓦蓋起來的，打狗這裡最老的。');
      } },
    ],
    events: [
      { id: 'qht_c902', trigger: 'auto', if: (s) => !!s.flags.ch9_qihou_arrive && !s.flags.ch9_qihou_temple, run: async (S) => { await qihouTemple(S); } },
      { id: 'qht_pray', trigger: 'action', x: 7, y: 3, w: 2, h: 1, label: '參拜', run: async (S) => {
        S.sfx('bell');
        await S.say('', '星河雙手合十。香煙繚繞，神龕裡的燭火輕輕搖晃。');
      } },
    ],
    warps: [
      { x: 7, y: 11, w: 2, to: 'qihou', tx: 20, ty: 15, tdir: 'down', door: true, run: async (S) => {
        if (F('ch9_qihou_temple') && !F('ch9_qihou_night')) {
          S.flag('ch9_qihou_night');
          await S.fadeOut(0.6);
          await S.narrate(['天色漸漸暗了。', '旗後的漁火，一盞一盞亮了起來。'], { veil: 1 });
        }
        return true;
      } },
    ],
    onUpdate: withFollow(),
  });

  // ---- 旗後 scripts -----------------------------------------------------------------------------------
  async function qihouTemple(S) {
    S.bgm('temple');
    S.hideFollowers(false);
    S.setPos('player', 7, 8, 'up'); S.setPos('hongying', 6, 8, 'up'); S.setPos('yungui', 9, 8, 'up'); S.setPos('tuanzi', 8, 9, 'up'); S.setPos('chenbo', 8, 8, 'up');
    await S.say('', '廟內香煙繚繞。一個老廟公正在擦拭供桌。');
    await S.say('阿標伯', '外地來的吼？先拜拜，媽祖婆會保佑你們平安。');
    S.sfx('bell');
    await S.say('', '眾人上香，合掌。糰子也學著合起兩隻前掌——結果往前一倒。');
    await S.jump('tuanzi', 12);
    await S.say('tuanzi:surprise', '喵！');
    await S.say('阿標伯', '哈哈，這隻貓仔有禮貌。');
    S.face('chenbo', 'qh_keeper');
    await S.say('chenbo:normal', '阿標，好久不見。');
    S.emote('qh_keeper', '!');
    await S.say('阿標伯', '……陳渡？！你這個老骨頭還沒死喔！二十年不見了！');
    await S.say('chenbo:smug', '還沒。閻羅王嫌我脾氣壞，不收。');
    await S.say('xinghe:surprise', '陳伯，你在這裡也有朋友？');
    await S.say('chenbo:normal', '以前跑水路的時候，常在旗後歇腳。');
    await S.say('阿標伯', '你們要找王船？哈，奇怪的事，今年剛好有。');
    await S.say('阿標伯', '今年不是迎王的年。可是東港的千歲爺，正月就降旨要提早造王船。');
    await S.say('阿標伯', '東港人擲筊問了好幾次，都是一樣的意思：快造，今年有用。');
    await S.say('yungui:think', '正月？逆潮是三月才起的。千歲爺……早就知道了。');
    await S.say('阿標伯', '神明看得比人遠。不過聽說王船廠最近不平靜，造船師傅一個一個病倒。');
    await S.say('阿標伯', '還有啊，這陣子旗後海邊，晚上會有藍色的火往岸上走。');
    await S.say('阿標伯', '你們今晚若住在旗後，晚上不要去海邊。');
    await S.say('hongying:serious', '……那我們今晚就去海邊。');
    S.emote('qh_keeper', '?');
    await S.say('阿標伯', '欸？');
    await S.say('xinghe:smile', '她的意思是，我們去把那些火送回去。阿伯放心。');
    S.flag('ch9_qihou_temple');
    S.quest('q_ch9_main', 0);
    S.objective('晚上到旗後西側沙灘看看');
  }

  async function nightBeach(S) {
    S.bgm('night');
    S.hideFollowers(false);
    S.setPos('player', 6, 15, 'left'); S.setPos('hongying', 6, 14, 'left'); S.setPos('yungui', 7, 15, 'left'); S.setPos('tuanzi', 7, 16, 'left');
    await S.camera(4, 15, 0.8);
    const ghosts = [[1, 13], [1, 15], [2, 17], [1, 18]];
    ghosts.forEach(([x, y], i) => S.spawn({ id: 'qh_drowned' + i, sprite: i % 2 ? 'ghost_f' : 'ghost_m', x, y, dir: 'right', ghost: true, light: { r: 90, color: '#6ab8ff' } }));
    await S.say('', '海面上，一點一點藍色的光像燈籠一樣，緩緩往岸上漂。浪退時，光變成一個個濕淋淋的人影。');
    for (let i = 0; i < ghosts.length; i++) S.move('qh_drowned' + i, 'R', { wait: false, speed: 1 });
    await S.wait(0.8);
    await S.say('tuanzi:cry', '喵嗚嗚嗚，又來了又來了！本大爺最怕濕的鬼！');
    await S.say('yungui:serious', '溺魂。從府城那邊的海，被逆潮推到這裡來的。');
    await S.say('xinghe:serious', '他們在找什麼？');
    await S.say('chenbo:sad', '找岸。他們以為自己終於到家了。');
    S.move('hongying', 'L', { wait: false });
    await S.wait(0.3);
    S.sfx('slash');
    await S.say('hongying:angry', '不要過來！……不要再有人被拉回來了！');
    let r = await S.battle('t_c9_beach_1', { bgmAfter: 'night' });
    if (r !== 'win') return;
    r = await S.battle('t_c9_beach_2', { bgmAfter: 'night' });
    if (r !== 'win') return;
    for (let i = 0; i < ghosts.length; i++) { S.fadeActor('qh_drowned' + i, 0, 1.0); }
    await S.say('', '溺魂消散成細小的藍光，飄回海面。');
    for (let i = 0; i < ghosts.length; i++) S.remove('qh_drowned' + i);
    // campfire talk
    await S.fadeOut(0.8);
    S.cameraFollow();
    S.setPos('player', 7, 16, 'left'); S.setPos('hongying', 5, 16, 'right');
    S.show('yungui', false); S.show('tuanzi', false);
    S.setPos('chenbo', 9, 13, 'left');
    await S.fadeIn(0.8);
    await S.say('', '沙灘上的篝火。陳伯與雲歸先回了客棧，糰子在雲歸懷裡睡著。只剩星河與紅纓。');
    await S.say('', '紅纓單手拿著劍譜，另一手持槍，一遍一遍練同一招，練到槍尖發抖。');
    for (let k = 0; k < 2; k++) { S.sfx('stab'); await S.jump('hongying', 10); await S.wait(0.3); }
    await S.say('xinghe:normal', '那是……洛家劍？用槍使？');
    await S.say('hongying:serious', '劍譜是哥哥的。我不會用劍。……所以我要用槍把它練出來。');
    await S.say('hongying:serious', '他寫的每一招，我都要會。一招都不能忘。');
    S.sfx('stab');
    await S.say('', '她又刺了一槍，膝蓋一軟，跪坐在沙上。');
    await S.say('hongying:sad', '星河。人死了，到了彼岸，是不是真的什麼都會忘記？');
    await S.say('hongying:cry', '哥哥他……會不會已經忘了我了？');
    await S.say('xinghe:sad', '……');
    const c = await S.choice(['「他不會忘。」', '「就算他忘了，妳也還記得。」']);
    if (c === 0) {
      await S.say('xinghe:serious', '他不會忘。他最後一刻擋在妳前面——那種事，忘不掉的。');
      await S.say('hongying:cry', '你又不知道……');
      await S.say('xinghe:smile', '嗯，我不知道。可是我賭他不會。我賭運很好的。');
      await S.say('hongying:sad', '……你上次跟雲歸賭，輸了三天的飯錢。');
      await S.say('xinghe:laugh', '那次不算！');
    } else {
      await S.say('xinghe:serious', '就算他忘了，妳也還記得。妳替他記著，他就還在。');
      await S.say('hongying:sad', '……替他記著。');
      await S.say('xinghe:normal', '嗯。就像這本劍譜。他把會的都寫下來給妳了。');
      await S.say('xinghe:normal', '他自己大概也知道，自己會忘吧。所以才寫下來。');
    }
    await S.camera(9, 13, 0.8);
    await S.say('', '遠處，陳伯站在沙丘上，背著手。他沒有走近。');
    await S.say('chenbo:sad', '（……「替他記著」嗎。玄啊，你也是這樣想的吧。）');
    await S.say('chenbo:sad', '（可是你記得太用力了。）');
    S.cameraFollow();
    await S.wait(0.4);
    await S.say('', '紅纓擦擦眼睛，站起來，把槍往沙裡一插。');
    await S.say('hongying:angry', '好！明天我煮早餐！');
    await S.say('xinghe:surprise', '欸？不、不用了吧——');
    if (V().ch9_comfort === 'talk') await S.say('hongying:smug', '你早上不是說胃太好？');
    else await S.say('hongying:smug', '誰叫你剛剛陪我。');
    S.bgm('south');
    await S.say('', '星河看著海，乾笑。');
    await S.fadeOut(1.0);
    await S.narrate(['隔天早上，星河吃了一碗「黑色的、會冒泡的粥」。'], { veil: 1 });
    S.flag('ch9_qihou_night_done');
    await S.warp('qihou', 33, 23, 'down', { fade: 0.01 });
    S.show('yungui', true); S.show('tuanzi', true);
    S.setPos('player', 33, 23, 'down'); S.setPos('hongying', 32, 23, 'right'); S.setPos('yungui', 34, 24, 'left'); S.setPos('tuanzi', 33, 24, 'up'); S.setPos('chenbo', 35, 23, 'left');
    S.emote('player', '💧');
    await S.say('', '客棧門口，星河趴在桌上，一動也不動。');
    await S.say('yungui:smug', '英勇。');
    await S.say('tuanzi:sad', '本大爺聞了一下就飽了。');
    days(S, 2);
    S.quest('q_ch9_main', 1);
    S.objective('沿沙洲往南，前往東港');
    relight(S);
  }

  async function roadSouth(S) {
    await S.say('', '旗後往南，沿著沙洲與海邊的小路，走兩天就到東港。');
    const c = await S.choice(['趕路', '沿路巡一巡（可能遇敵）'], { cancel: 0 });
    await S.travel('takao', 'donggang', { label: '旗後往南，沿著沙洲與海邊的小路，走了兩天。' });
    if (c === 1) {
      await S.say('', '沿著海岸巡了一趟，逆潮推上岸的東西果然不少。');
      if ((await S.battle('t_c9_road_a')) !== 'win') return;
      if ((await S.battle('t_c9_road_b')) !== 'win') return;
    }
    await S.warp('donggang', 16, 1, 'down');
  }

  // ---- 半屏山湯圓 (心燈 16) ----
  async function xiuScene(S) {
    S.emote('qh_xiu', '💧');
    await S.say('阿秀', '嗚……阿公不見了……');
    await S.say('hongying:surprise', '（蹲下）怎麼了？誰欺負妳？');
    await S.say('', '紅纓遞出一條手帕。手帕上繡著一隻歪掉的兔子。');
    await S.say('阿秀', '……這隻是豬嗎？');
    await S.say('hongying:shy', '是兔子！');
    S.emote('qh_xiu', '♪');
    await S.say('阿秀', '（破涕為笑）阿公是金萬。旗後最有錢的人。');
    await S.say('阿秀', '逆潮以後，旗後的井都鹹了，只有我們家的水窟仔是甜的。');
    await S.say('阿秀', '阿公把水窟仔鎖起來，一桶水賣十文。厝邊都罵他。');
    await S.say('阿秀', '我晚上偷偷開鎖分水給人，被阿公罵……');
    await S.say('阿秀', '前天，阿公聽說半屏山那個賣湯圓的又出現了，「兩碗不用錢」。');
    await S.say('阿秀', '阿公什麼都不付錢的。他坐轎子去了，到現在還沒回來。');
    await S.say('xinghe:normal', '半屏山？');
    await S.say('阿秀', '坐渡船到哨船頭，再往北走。');
    S.flag('ch9_banping_open');
    S.quest('q_ch9_banping', 0);
    S.toast('支線：到半屏山找金萬', 'scroll');
  }
  async function ferryToBanping(S) {
    await S.fadeOut(0.6);
    await S.narrate(['竹筏渡過打狗港，到了對岸的哨船頭。', '再往北走一段，路邊的山像被刀切掉了一半。'], { veil: 1 });
    await S.warp('banping_foot', 19, 27, 'up', { fade: 0.01 });
  }
  async function banpingReward(S) {
    S.setPos('player', 15, 26, 'up'); S.gather();
    S.setPos('chenbo', 17, 26, 'up');
    await S.say('', '金萬大厝院子裡，水窟仔的鎖被拆了。金萬親自拿著木勺，一勺一勺分水給排隊的厝邊。');
    const q = [[11, 26], [10, 26], [10, 25]];
    q.forEach(([x, y], i) => S.spawn({ id: 'qh_queue' + i, sprite: ['villager_f', 'old_m', 'villager_m2'][i], x, y, dir: 'right' }));
    S.setPos('qh_jinwan', 12, 26, 'left');
    await S.say('金萬伯', '來來來，不用錢！……不對，這不是「不用錢」。是我請的。');
    S.setPos('qh_xiu', 15, 24, 'down');
    await S.move('qh_xiu', 'D', { speed: 4 });
    S.emote('qh_xiu', '♥');
    await S.say('阿秀', '（衝過來抱住星河的腰）謝謝哥哥！謝謝姊姊！謝謝胖貓！');
    await S.say('tuanzi:angry', '本大爺是石——……算了，胖貓就胖貓。');
    S.face('qh_jinwan', 'player');
    await S.say('金萬伯', '少年仔，我欠你一文錢。（掏出一大袋）這是一千文。');
    await S.say('xinghe:surprise', '欸？這、這不只一文吧？');
    await S.say('金萬伯', '利息。……我請的。');
    S.gold(1000);
    for (let i = 0; i < q.length; i++) S.remove('qh_queue' + i);
    S.flag('ch9_banping_reward');
    S.quest('q_ch9_banping', 'done');
  }

  // =====================================================================================================
  // MAP 2 — banping_foot 半屏山下
  // =====================================================================================================
  function drawMonsterAt(ctx, art, cx, cy, t, o = {}) {
    if (!G.Monsters || !G.Monsters.get(art)) return;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(cx * T + T / 2, cy * T + T - 6 + Math.sin(t * 2) * 3);
    if (o.flip) ctx.scale(-1, 1);
    const s = o.scale || 0.5;
    ctx.scale(s, s);
    G.Monsters.draw(ctx, art, 0, 0, t, { state: 'idle', variant: o.variant || 0, phase: o.phase });
    ctx.restore();
  }
  G.Maps.define('banping_foot', {
    name: '半屏山下', subtitle: '被吃掉一半的山', place: 'takao', bgm: 'south', start: [19, 27],
    light: (s) => (s.flags.ch9_banping_done ? { ambient: 0.25, color: '#3a1a08' } : { ambient: 0 }),
    particles: ['leaves', { type: 'motes', density: 0.6 }],
    tiles: (() => {
      const g = grid(40, 30, '.');
      g.rect(0, 0, 40, 6, 'X');
      g.rect(19, 3, 2, 3, 'v');
      g.rect(1, 7, 9, 7, 'l');
      g.rect(19, 6, 2, 24, '=');
      g.rect(24, 14, 12, 6, 'f');
      g.rect(16, 12, 3, 1, '=').rect(21, 12, 6, 1, '=');
      g.rect(17, 28, 6, 2, '=');
      g.rect(7, 16, 12, 1, ':');
      g.dots([[1, 14], [9, 14], [10, 9], [10, 10]], ',');
      return g.rows();
    })(),
    deco: (() => {
      const d = grid(40, 30, ' ');
      d.dots([[0, 6], [11, 6], [37, 6], [38, 13], [1, 22], [2, 26], [38, 24], [36, 27]], 't');
      d.dots([[36, 8], [37, 9], [36, 10], [37, 11], [38, 8], [38, 10]], 'B');
      d.dots([[24, 8], [30, 9], [22, 22], [14, 24], [30, 24], [26, 26]], 'u');
      d.dots([[2, 14], [5, 14], [8, 14], [10, 12], [10, 13]], 'e');
      d.dots([[3, 9], [6, 10], [4, 12], [8, 8], [7, 12]], 'o');
      d.dots([[28, 7], [33, 7], [14, 20], [5, 24]], 'r');
      d.dots([[12, 18], [13, 19], [11, 20], [25, 22], [27, 23], [33, 21]], 'w');
      return d.rows();
    })(),
    objects: [
      { t: 'tree_banyan', x: 13, y: 8 },
      { t: 'stall', x: 16, y: 11, text: '湯圓', counter: true, light: { r: 120, color: '#ffd27a', flicker: 0.2 } },
      { t: 'cauldron', x: 18, y: 10 },
      { t: 'bench', x: 15, y: 14 },
      { t: 'drying_rack', x: 27, y: 10, v: 0 },
      { t: 'house_minnan', x: 2, y: 16, v: 0 },
      { t: 'rock_big', x: 9, y: 6 }, { t: 'rock_big', x: 30, y: 6 },
      { t: 'fence_wood', x: 24, y: 13, w: 5 }, { t: 'fence_wood', x: 31, y: 13, w: 5 },
      { t: 'basket', x: 29, y: 11 },
      { t: 'signboard', x: 21, y: 7, text: '半屏山', interact: ['山的南面，是一整片灰白色的陡直石壁——像被刀切掉了一半。', '石壁正中，有一道黑漆漆的裂縫。'], label: '看' },
    ],
    npcs: [
      chenboNpc('banping_foot', [19, 27]),
      { id: 'bp_peddler', sprite: 'old_m', name: '仙翁', x: 16, y: 10, dir: 'down', fixedDir: true, light: { r: 80, color: '#ffe7a0' }, talk: async (S) => { await peddlerTalk(S); } },
      { id: 'bp_ama', sprite: 'old_f', name: '曬菜阿嬤', x: 26, y: 11, dir: 'down', wander: 1, talk: [
        '半屏山的古早故事喔？以前有個賣湯圓的老人，喊說一碗一文錢、兩碗不用錢。',
        '大家都拿兩碗，越吃越多，吃到後來，山就少了一半。',
        '只有一個少年仔，乖乖拿出一文錢買一碗。後來老人就帶他走了，說他是有仙緣的人。',
        '那湯圓啊，是用山的土搓的。白拿的，就是拿山的肉。',
      ] },
      { id: 'bp_farmer', sprite: 'villager_m', name: '種田阿伯', x: 30, y: 17, dir: 'left', wander: 2, talk: [
        '昨天那個旗後的金萬，坐轎來的喔，衫褲都是綢的。一來就吃，吃了二十碗。',
        '吃完肚子大到走不動，自己爬進山壁裂縫裡去了。叫也叫不回來。',
      ] },
      { id: 'bp_kid', sprite: 'child_m', name: '牽牛囝仔', x: 9, y: 19, dir: 'right', talk: async (S) => {
        await S.say('牽牛囝仔', '我阿爸說，那個湯圓攤只有心不貪的人看得到。……我看得到喔！');
        if (F('ch9_banping_done')) await S.say('牽牛囝仔', '仙翁請我吃了一碗！他說是請客，不是白拿。');
        else await S.say('牽牛囝仔', '可是我沒錢。');
      } },
      { id: 'bp_buffalo', sprite: 'buffalo', name: '水牛', x: 10, y: 19, dir: 'left', wander: 1 },
    ],
    events: [
      { id: 'bp_crack_closed', trigger: 'touch', x: 19, y: 5, w: 2, h: 1, if: (s) => !s.flags.ch9_banping_cave_open, run: async (S) => {
        await S.say('', '石壁的裂縫很窄，裡面黑漆漆的，隱約傳來咀嚼的聲音……');
        await S.say('yungui:think', '先去問問山腳下的人吧。');
        await S.move('player', 'D');
      } },
      { id: 'bp_south', trigger: 'touch', x: 17, y: 29, w: 6, h: 1, run: async (S) => {
        await S.fadeOut(0.5);
        await S.narrate(['沿著小路走回哨船頭，再坐竹筏回旗後。'], { veil: 1 });
        await S.warp('qihou', 40, 8, 'left', { fade: 0.01 });
      } },
    ],
    warps: [
      { x: 19, y: 3, w: 2, to: 'banping_cave', tx: 19, ty: 37, tdir: 'up', if: (s) => !!s.flags.ch9_banping_cave_open },
    ],
    onUpdate: withFollow(),
  });

  async function peddlerTalk(S) {
    if (F('ch9_banping_done')) { await S.say('仙翁', '每隔幾十年擺一次攤。看看人有沒有變。……你們，沒變。'); return; }
    if (F('ch9_banping_cave_open')) { await S.say('仙翁', '姓金的在山肚子裡。去吧，他還在吃。'); return; }
    if (!F('ch9_banping_open')) { await S.say('仙翁', '湯圓——一碗一文錢，兩碗不用錢喔——'); return; }
    await S.say('', '大榕樹下，一個白鬍子老人顧著一口熱騰騰的鍋。攤子周圍有淡淡的金光。');
    await S.say('仙翁', '湯圓——一碗一文錢，兩碗不用錢喔——');
    await S.say('tuanzi:laugh', '兩碗不用錢！！本大爺要兩碗！不，四碗！不用錢的話，八碗！');
    await S.say('yungui:think', '……這攤子，跟傳說裡的一模一樣。');
    await S.say('仙翁', '少年仔，吃不吃？');
    const c = await S.choice(['付一文錢，買一碗', '拿兩碗（不用錢）', '不吃']);
    if (c === 0) {
      S.gold(-1);
      await S.say('', '星河把一文錢放在攤上。仙翁看了那枚銅錢一眼，笑了。');
      await S.say('仙翁', '這碗，算你們的。');
      await S.say('', '一碗熱湯圓，白白圓圓，湯是薑糖湯。星河吃了一口。');
      await S.say('xinghe:surprise', '……好甜。好好吃。');
      await S.say('tuanzi:cry', '本大爺的那碗呢？');
      await S.say('仙翁', '（再推一碗給糰子）這碗，我請的。');
      await S.say('tuanzi:surprise', '……請的？不是不用錢的？');
      await S.say('仙翁', '不一樣喔。不用錢，是你拿；我請，是我給。記住。');
      S.flag('ch9_tangyuan_paid');
    } else if (c === 1) {
      await S.say('', '糰子撲上去捧起兩碗。湯圓一入口——喀。');
      S.sfx('hit');
      await S.say('tuanzi:cry', '喵嗚！是、是土！是泥巴！！');
      await S.say('仙翁', '哈哈哈。不用錢的，本來就是山的。拿山的，就吃到山。');
      await S.say('yungui:smug', '傳說誠不我欺。');
      S.flag('ch9_tangyuan_free');
    } else {
      await S.say('仙翁', '不吃也好。不貪，也不欠。');
      S.flag('ch9_tangyuan_none');
    }
    await S.say('仙翁', '你們是來找那個姓金的吧？');
    await S.say('仙翁', '他吃了二十碗不用錢的。現在在山肚子裡，還在吃。停不下來。');
    await S.say('仙翁', '那些很久以前白拿的人，也都在裡面。吃了幾百年，沒有一個飽過。');
    await S.say('xinghe:think', '阿伯，你……是當年那個仙人？');
    await S.say('仙翁', '我？（笑）我是當年那個付了一文錢的少年仔啦。');
    await S.say('仙翁', '師父帶我走了，教我搓湯圓。師父早就不知道去哪了，我還在這裡賣。');
    await S.say('仙翁', '每隔幾十年擺一次攤。看看人有沒有變。');
    await S.say('hongying:serious', '……變了嗎？');
    S.face('bp_peddler', 'hongying');
    await S.say('仙翁', '（看了一眼紅纓）有的有，有的沒有。跟以前一樣。');
    S.flag('ch9_banping_cave_open');
    S.quest('q_ch9_banping', 1);
    S.toast('支線：進入半屏山腹，帶回金萬', 'scroll');
  }

  // =====================================================================================================
  // MAP 3 — banping_cave 半屏山腹「貪肚」
  // =====================================================================================================
  const BP_ROOMS = {
    w: { y: 10, xs: [5, 7, 9], loot: [{ item: 'c9_ac_tanlang' }, { item: 'huanhunxiang', n: 2 }, { gold: 1500 }] },
    m: { y: 19, xs: [15, 17, 23], loot: [{ item: 'c9_mat_banpingshi' }, { item: 'ezaijian', n: 3 }, { item: 'c9_ar_shanni' }] },
    e: { y: 10, xs: [30, 32, 34], loot: [{ item: 'c9_hd_jinlv' }, { item: 'c9_baicaogao', n: 2 }, { item: 'c9_xiancaodong', n: 5 }] },
  };
  const bpState = (s, r) => ((s.vars.ch9_rooms || {})[r]) || { state: 'none', took: -1 };
  function bpRoom(r) { const v = V(); v.ch9_rooms = v.ch9_rooms || {}; return v.ch9_rooms[r] || (v.ch9_rooms[r] = { state: 'none', took: -1 }); }
  const bpObj = (r, i) => G.mapScene && G.mapScene.objects.find((o) => o.key === `bpc_${r}${i}`);
  async function bpGive(S, loot) {
    if (loot.gold) S.gold(loot.gold);
    else await S.give(loot.item, loot.n || 1);
  }
  async function bpLose(S, loot) {
    if (loot.gold) { G.state.gold = Math.max(0, G.state.gold - loot.gold); await S.say('', `${loot.gold} 文錢化成了一把山泥。`); return; }
    const n = loot.n || 1;
    let left = n - Math.min(n, G.Inv.count(loot.item));
    G.Inv.remove(loot.item, Math.min(n, G.Inv.count(loot.item)));
    for (const m of Object.values(G.state.members)) for (const slot in m.equip) if (left > 0 && m.equip[slot] === loot.item) { m.equip[slot] = null; left--; }
    await S.say('', `${D.items[loot.item].name}化成了一把山泥。`);
  }
  async function bpOpen(S, r, i) {
    const R = bpRoom(r), def = BP_ROOMS[r];
    if (!F('ch9_bp_hint')) { S.flag('ch9_bp_hint'); await S.say('yungui:think', '白拿的東西，多拿一個，連前一個都會不見。……我猜。'); }
    if (R.state === 'none') {
      S.sfx('chest');
      const o = bpObj(r, i); if (o) o.open = true;
      R.state = 'one'; R.took = i;
      await bpGive(S, def.loot[i]);
      for (let k = 0; k < 3; k++) { const o2 = bpObj(r, k); if (o2 && k !== i) o2.light = { r: 90, color: '#ffd27a', flicker: 0.3 }; }
      await S.say('', '另外兩個寶箱發出了金光——「還有兩箱。再拿一個吧？反正不用錢。」');
      return;
    }
    await S.say('', '寶箱閃著金光。「再拿一個吧？反正不用錢。」');
    const c = await S.choice(['打開', '不要'], { cancel: 1 });
    if (c !== 0) {
      await S.say('', '你把手收了回來。金光暗了一點。');
      return;
    }
    S.sfx('dark');
    S.shake(6, 0.4);
    await S.say('', '寶箱的蓋子自己掀開——裡面伸出一隻沾滿泥巴的手！');
    const res = await S.battle('t_c9_greed_ambush', { mode: 'ambush', bgmAfter: 'mine' });
    if (res !== 'win') return;
    await bpLose(S, def.loot[R.took]);
    R.state = 'lost';
    for (let k = 0; k < 3; k++) { const o2 = bpObj(r, k); if (o2) o2.light = null; }
    await S.say('yungui:smug', '……我猜對了。');
    if (r === 'm') S.flag('ch9_bp_middoor');
  }
  async function bpPlate(S) {
    await S.say('', '一面山壁擋住了去路。山壁中間有一個空的石盤，石盤上刻著：「給出去，才過得去。」');
    const ids = G.Inv.list((it) => it.type !== 'key').slice(0, 7);
    if (!ids.length) {
      await S.say('', '石盤上，不知什麼時候出現了一碗湯圓。旁邊刻著小字：「沒有東西可給的人，給一句謝謝也行。」');
      const c = await S.choice(['「謝謝。」', '算了'], { cancel: 1 });
      if (c !== 0) return;
    } else {
      const c = await S.choice(ids.map((id) => D.items[id].name).concat(['算了']), { cancel: ids.length });
      if (c >= ids.length) return;
      const id = ids[c];
      G.Inv.remove(id, 1);
      await S.say('', `星河把${D.items[id].name}放上石盤。石盤上的東西一下子就不見了。`);
      if (D.items[id].icon === 'food' || D.items[id].icon === 'drink') await S.say('tuanzi:cry', '本大爺的……！');
    }
    S.sfx('earth'); S.shake(8, 0.6);
    await S.say('', '轟隆——山壁慢慢往兩邊讓開了。');
    S.flag('ch9_bp_gate');
  }

  G.Maps.define('banping_cave', {
    name: '半屏山腹', subtitle: '「貪肚」', place: 'takao', bgm: 'mine', start: [19, 37], noSave: false,
    light: { ambient: 0.6, color: '#140c04', playerR: 230, playerColor: '#ffd890' },
    particles: [{ type: 'motes', density: 1.2 }, { type: 'dust', density: 0.6 }],
    legend: { '$': 'dirt' },
    tiles: (() => {
      const g = grid(40, 40, 'C');
      g.rect(19, 34, 2, 6, 'v');
      g.rect(8, 27, 24, 8, 'v');
      g.rect(19, 24, 2, 3, 'v');
      g.rect(13, 17, 14, 7, 'v');
      g.rect(19, 8, 2, 9, '$');
      g.rect(3, 9, 10, 6, 'v').rect(13, 11, 6, 2, '$');
      g.rect(27, 9, 10, 6, 'v').rect(21, 11, 6, 2, '$');
      g.rect(17, 6, 6, 2, 'v');
      g.rect(4, 1, 32, 4, 'v').rect(19, 5, 2, 1, 'v');
      g.dots([[10, 29], [11, 30], [26, 31], [27, 30], [15, 33], [24, 28], [16, 21], [24, 22], [6, 12], [33, 13]], '$');
      return g.rows();
    })(),
    objects: (s) => {
      const out = [
        { t: 'signboard', x: 17, y: 28, text: '石刻', interact: ['石壁上刻著一行字：「一碗一文錢，兩碗不用錢。」', '字的下面，有很多很多手指抓過的痕跡。'], label: '看' },
        { t: 'pot', x: 10, y: 28 }, { t: 'pot', x: 12, y: 33 }, { t: 'jar', x: 28, y: 28 }, { t: 'jar', x: 30, y: 33 }, { t: 'pot', x: 25, y: 33 },
        { t: 'rock_big', x: 9, y: 31 }, { t: 'rock_small', x: 28, y: 31 }, { t: 'rock_small', x: 14, y: 30 },
        { t: 'pot', x: 14, y: 22 }, { t: 'jar', x: 25, y: 17 }, { t: 'pot', x: 3, y: 14 }, { t: 'jar', x: 36, y: 14 },
        { t: 'city_wall', x: 19, y: 16, w: 2, v: 0, tall: 70, if: (st) => !st.flags.ch9_bp_middoor && bpState(st, 'm').state === 'none',
          interact: async (S) => {
            await S.say('', '一道石門擋在路上。門上刻著：「拿了，門才開。」');
            const c = await S.choice(['不拿寶物，直接推門', '先看看寶箱'], { cancel: 1 });
            if (c === 0) { S.sfx('earth'); await S.say('', '石門晃了晃，慢慢沉進了地裡。'); S.flag('ch9_bp_middoor'); }
          }, label: '推門' },
        { t: 'mill_stone', x: 22, y: 6, interact: async (S) => { if (F('ch9_bp_gate')) await S.say('', '空的石盤。「給出去，才過得去。」'); else await bpPlate(S); }, label: '調查' },
        { t: 'rock_big', x: 19, y: 4, if: (st) => !st.flags.ch9_bp_gate },
        { t: 'table', x: 13, y: 2, w: 10 },
        { t: 'pot', x: 12, y: 1 }, { t: 'pot', x: 12, y: 2 }, { t: 'jar', x: 23, y: 1 }, { t: 'jar', x: 23, y: 2 },
        { t: 'pot', x: 6, y: 2 }, { t: 'pot', x: 8, y: 3 }, { t: 'jar', x: 28, y: 2 }, { t: 'pot', x: 31, y: 3 }, { t: 'jar', x: 33, y: 1 },
      ];
      for (const r of ['w', 'm', 'e']) {
        const R = bpState(s, r), def = BP_ROOMS[r];
        def.xs.forEach((x, i) => out.push({
          t: 'chest', x, y: def.y, key: `bpc_${r}${i}`, open: R.took === i,
          light: R.state === 'one' && R.took !== i ? { r: 90, color: '#ffd27a', flicker: 0.3 } : null,
          if: (st) => bpState(st, r).state !== 'lost',
        }));
      }
      return out;
    },
    lights: [
      { x: 9, y: 28, r: 120, color: '#e8b040', flicker: 0.2 }, { x: 30, y: 29, r: 120, color: '#e8b040', flicker: 0.2 },
      { x: 20, y: 20, r: 160, color: '#f0c050', flicker: 0.15 }, { x: 7, y: 11, r: 120, color: '#e8b040' }, { x: 32, y: 11, r: 120, color: '#e8b040' },
      { x: 20, y: 12, r: 110, color: '#d8a030' }, { x: 18, y: 2, r: 220, color: '#ffcf60', flicker: 0.2 },
    ],
    enemies: [
      { id: 'bpe1', troop: 't_c9_greed_a', x: 12, y: 30, art: 'greed_ghost', lv: 31, radius: 3 },
      { id: 'bpe2', troop: 't_c9_greed_b', x: 27, y: 32, art: 'greed_ghost', lv: 31, radius: 3 },
      { id: 'bpe3', troop: 't_c9_greed_a', x: 20, y: 12, art: 'greed_ghost', lv: 31, radius: 2 },
    ],
    events: (() => {
      const ev = [];
      for (const r of ['w', 'm', 'e']) {
        BP_ROOMS[r].xs.forEach((x, i) => ev.push({
          id: `bpc_${r}${i}`, trigger: 'action', x, y: BP_ROOMS[r].y, label: '開啟',
          if: (s) => { const R = bpState(s, r); return R.state !== 'lost' && R.took !== i; },
          run: async (S) => { await bpOpen(S, r, i); },
        }));
      }
      ev.push({ id: 'bp_boss', trigger: 'touch', x: 17, y: 3, w: 6, h: 2, if: (s) => !!s.flags.ch9_bp_gate && !s.flags.ch9_banping_done, run: async (S) => { await banpingBoss(S); } });
      return ev;
    })(),
    warps: [
      { x: 19, y: 39, w: 2, to: 'banping_foot', tx: 19, ty: 7, tdir: 'down' },
    ],
    drawOver: (ctx, t) => {
      const v = V();
      if (v.ch9_bpGhost) {
        drawMonsterAt(ctx, 'greed_ghost', 20, 1, t, { scale: 0.7, variant: 1, alpha: v.ch9_bpGhost });
      }
    },
  });

  async function banpingBoss(S) {
    S.bgm('tension');
    S.setPos('player', 19, 4, 'up'); S.gather();
    await S.camera(17, 2, 0.8);
    S.spawn({ id: 'bp_jinwan', sprite: 'merchant', x: 13, y: 3, dir: 'right' });
    await S.say('', '長桌上堆著吃不完的湯圓。金萬坐在桌首，綢緞衣服撐破了，肚子大得像石鼓。');
    await S.say('', '他的下半身已經變成灰白的石頭，跟山壁連在一起。他一手抓一顆湯圓，一直往嘴裡塞。');
    await S.say('金萬', '不用錢……不用錢的……多吃一顆是一顆……');
    await S.say('xinghe:surprise', '金萬伯！不要吃了！你的腳——');
    S.emote('bp_jinwan', '💢');
    await S.say('金萬', '你們是誰？要跟我搶？這些都是我的！不用錢的都是我的！');
    const gs = [[15, 3], [17, 1], [21, 3], [14, 1]];
    gs.forEach(([x, y], i) => { const a = S.spawn({ id: 'bp_g' + i, sprite: i % 2 ? 'ghost_f' : 'ghost_m', x, y, dir: 'down', ghost: true }); a.alpha = 0; S.fadeActor('bp_g' + i, 0.85, 0.6); });
    V().ch9_bpGhost = 0.01;
    await G.Tweens.to(V(), { ch9_bpGhost: 1 }, 0.8, 'linear');
    await S.say('', '桌子周圍，一圈灰色的人影抬起頭——每個都肚子圓鼓、四肢細瘦，嘴裡塞滿泥土。');
    await S.say('貪鬼們', '……不用錢……不用錢……餓……還是餓……');
    await S.say('大肚貪鬼', '我們白拿了幾百年……從來沒有飽過……');
    await S.say('大肚貪鬼', '新來的這個，也會一樣。');
    const stolen = [];
    const r = await S.battle('t_c9_greed_boss', { intro: greedIntro(stolen), bgmAfter: 'mine' });
    if (r !== 'win') return;
    if (stolen.length) {
      for (const id of stolen) G.Inv.add(id, 1);
      S.sfx('item');
      S.toast('被吞掉的道具都吐出來了', 'bag');
    }
    await S.give('c9_xiancaodong', 1);
    S.cameraFollow();
    await S.camera(17, 2, 0.4);
    await S.say('', '貪鬼們跌坐在地，大肚貪鬼喘著氣。');
    await S.say('金萬', '（發抖）我、我的腳……動不了……');
    await S.say('yungui:serious', '山不放你走。你拿了山多少，就被山抓多少。');
    await S.say('金萬', '那、那怎麼辦！我有錢！我回去拿錢給山！');
    await S.say('xinghe:normal', '金萬伯，你身上有錢嗎？');
    await S.say('金萬', '……沒有。我出門從來不帶錢。都是別人付。');
    await S.say('hongying:angry', '……你這個人！');
    const c = await S.choice(['給金萬一文錢', '告訴他「把水窟仔打開」']);
    if (c === 0) {
      S.gold(-1);
      await S.say('xinghe:normal', '拿去。一文錢。');
      await S.say('金萬', '……我金萬不欠人。');
      await S.say('xinghe:smile', '那你現在欠我一文了。回旗後再還我。');
      await S.say('金萬', '（瞪著那枚銅錢，手在抖）……');
    } else {
      await S.say('xinghe:serious', '你孫女每天晚上偷偷開你的鎖，分水給厝邊。');
      await S.say('xinghe:serious', '她被你罵了，還是繼續開。她在替你付錢啊。');
      await S.say('金萬', '……阿秀？');
    }
    S.bgm('sad');
    await S.say('金萬', '（突然哭了出來）我……我少年時是羅漢腳，從唐山一個人過來，一文錢也沒有。');
    await S.say('金萬', '餓過，渴過。所以我發誓，這輩子什麼都要拿，什麼都不給。');
    await S.say('金萬', '拿了一輩子……我從來都沒有飽過。');
    await S.say('', '他低頭看著手上的湯圓。慢慢地，把湯圓放回桌上。');
    await S.say('金萬', '……我不吃了。');
    S.sfx('earth');
    await S.say('', '石頭從他的腳上一片片剝落。');
    await S.say('', '山腹深處傳來一聲輕笑。仙翁提著鍋子，從山壁裡走了出來。');
    const old = S.spawn({ id: 'bp_old', sprite: 'old_m', x: 25, y: 1, dir: 'left', light: { r: 110, color: '#ffe7a0' } });
    old.alpha = 0; await S.fadeActor('bp_old', 1, 0.8);
    await S.move('bp_old', 'DDLLL');
    await S.say('仙翁', '姓金的，要不要買一碗？一碗一文錢。');
    if (c === 0) await S.say('金萬', '（緊握著星河給的那一文錢）……我買。');
    else await S.say('金萬', '（從懷裡摸出唯一一枚壓箱銅錢）……我買。');
    S.sfx('coin');
    await S.say('', '金萬把錢放進仙翁手裡。仙翁舀了一碗湯圓給他。他吃了一口，整個人愣住。');
    await S.say('金萬', '……飽了。');
    await S.say('金萬', '一碗而已……我怎麼……飽了……');
    await S.say('', '貪鬼們一個一個抬起頭，看著金萬，看著那口鍋。');
    await S.say('大肚貪鬼', '我們……也想要……可是我們沒有錢……');
    await S.say('仙翁', '今天不用錢。');
    await S.say('大肚貪鬼', '……不用錢？');
    await S.say('仙翁', '不是「不用錢」。是請客。我請你們。');
    await S.say('仙翁', '白拿的，吃不飽。人家請的，才吃得飽。');
    S.bgm('love');
    await S.say('', '仙翁一碗一碗舀給貪鬼。每個貪鬼吃完一碗，肚子就消下去，臉上露出很久很久沒有過的、安靜的表情——');
    for (let i = 0; i < gs.length; i++) { S.fadeActor('bp_g' + i, 0, 0.8); await S.wait(0.3); }
    await S.say('', '然後化成一點金光，散進山壁裡。山壁在金光中，彷彿長回了一點點。');
    await S.say('大肚貪鬼', '（最後一個）……好甜。……多謝。');
    await G.Tweens.to(V(), { ch9_bpGhost: 0 }, 1.0, 'linear');
    V().ch9_bpGhost = 0;
    for (let i = 0; i < gs.length; i++) S.remove('bp_g' + i);
    await S.lantern('xd_banpingshan', '半屏山湯圓');
    await S.say('仙翁', '（把那枚銅錢拋回給星河）這文錢，被誠心花過一次了。');
    await S.say('仙翁', '誠心花過的錢，很好用。帶著。');
    await S.give('c9_ac_tongqian', 1);
    if (F('ch9_tangyuan_paid')) {
      await S.say('仙翁', '上次你們付了錢，這碗是找你們的。');
      await S.give('c9_tangyuan', 1);
    }
    S.flag('ch9_banping_done');
    S.quest('q_ch9_banping', 2);
    await S.fadeOut(0.8);
    S.remove('bp_old'); S.remove('bp_jinwan');
    await S.narrate(['金萬扶著山壁，一步一步走出了山腹。', '回旗後的路上，他一句話也沒說。手裡一直握著那只空碗。'], { veil: 1 });
    await S.warp('qihou', 15, 26, 'up', { fade: 0.01 });
  }

  // =====================================================================================================
  // MAP 4 — donggang 東港
  // =====================================================================================================
  const dgNight = (s) => !!s.flags.ch9_jiaobei_done && !s.flags.ch9_shipyard_clear;
  const dgDusk = (s) => !!s.flags.ch9_donggang_arrive && !s.flags.ch9_jiaobei_done;
  G.Maps.define('donggang', {
    name: '東港', subtitle: '東隆宮與王船廠', place: 'donggang',
    bgm: (s) => (dgNight(s) ? 'night' : 'south'),
    start: [16, 1],
    light: (s) => (dgNight(s) ? { ambient: 0.6, color: '#0a0c24', playerR: 230 } : dgDusk(s) || !s.flags.ch9_donggang_arrive ? { ambient: 0.2, color: '#3a1a10' } : { ambient: 0 }),
    particles: (s) => (dgNight(s) ? ['lanterns', { type: 'wind', density: 0.4 }] : [{ type: 'wind', density: 0.5 }]),
    tiles: (() => {
      const g = grid(56, 42, '.');
      g.rect(0, 0, 5, 27, '~').rect(0, 27, 56, 15, '~').rect(0, 20, 56, 7, 's');
      g.rect(2, 3, 4, 1, 'k').rect(2, 7, 4, 1, 'k');
      g.rect(16, 0, 2, 20, '=').rect(6, 14, 48, 2, '=');
      g.rect(15, 6, 17, 6, 'T').rect(22, 12, 2, 2, '=');
      g.rect(40, 1, 14, 9, 'W').rect(46, 9, 2, 1, '_').rect(46, 10, 2, 4, '=');
      g.rect(26, 16, 2, 4, '=');
      g.rect(26, 26, 2, 2, 'k');
      g.rect(5, 1, 1, 13, ':');
      g.dots([[5, 20], [6, 21], [53, 21], [54, 22], [55, 20]], '-');
      return g.rows();
    })(),
    deco: (() => {
      const d = grid(56, 42, ' ');
      d.dots([[38, 1], [38, 2], [38, 3], [39, 5]], 'B');
      d.dots([[14, 4], [19, 18], [34, 21], [44, 22], [50, 23], [12, 23], [8, 24], [52, 13], [36, 12]], 'h');
      d.dots([[32, 6], [32, 9], [14, 7], [14, 10], [30, 12], [15, 12]], 'u');
      d.dots([[55, 5], [54, 7], [55, 9]], 't');
      return d.rows();
    })(),
    objects: [
      { t: 'temple', x: 20, y: 1, text: '東隆宮' },
      { t: 'incense_burner', x: 23, y: 8, interact: async (S) => { await tiangong(S); }, label: '上香' },
      { t: 'statue_lion', x: 21, y: 6 }, { t: 'statue_lion', x: 25, y: 6, flip: true },
      { t: 'paifang', x: 21, y: 12, v: 1, text: '東隆宮' },
      { t: 'lantern_string', x: 16, y: 6, w: 5 }, { t: 'lantern_string', x: 27, y: 6, w: 4 },
      { t: 'pilgrim_flag', x: 15, y: 6, text: '代天巡狩', color: '#d8382a' }, { t: 'pilgrim_flag', x: 31, y: 6, text: '代天巡狩', color: '#d8382a' },
      { t: 'red_lantern', x: 19, y: 11 }, { t: 'red_lantern', x: 28, y: 11 },
      { t: 'house_minnan', x: 6, y: 0, v: 0 }, { t: 'house_minnan', x: 10, y: 0, w: 5, v: 1 },
      { t: 'house_minnan', x: 33, y: 1, v: 0 },
      { t: 'stall', x: 7, y: 5, text: '魚市', counter: true }, { t: 'stall', x: 10, y: 5, text: '櫻花蝦' },
      { t: 'basket', x: 12, y: 6 }, { t: 'barrel', x: 6, y: 8 }, { t: 'crate', x: 6, y: 2 },
      { t: 'boat_small', x: 1, y: 5, water: true }, { t: 'boat_small', x: 2, y: 9 }, { t: 'boat_small', x: 1, y: 12 },
      { t: 'dock_post', x: 1, y: 3 }, { t: 'dock_post', x: 1, y: 7 },
      { t: 'shophouse', x: 6, y: 9, v: 2, text: '雙糕潤' },
      { t: 'shophouse', x: 10, y: 16, v: 1, text: '雜貨' },
      { t: 'house_minnan', x: 18, y: 16, v: 0 }, { t: 'house_minnan', x: 28, y: 16, v: 1 },
      { t: 'tree_banyan', x: 33, y: 16 },
      { t: 'shophouse', x: 40, y: 16, v: 0, text: '客棧' },
      { t: 'shophouse', x: 46, y: 16, v: 3, text: '鐵匠' },
      { t: 'signboard', x: 45, y: 10, text: '王船廠', interact: ['「王船廠」。木棚裡傳出敲木頭的聲音，夾著一陣一陣的咳嗽。'], label: '看' },
      { t: 'red_lantern', x: 48, y: 10 },
      { t: 'log', x: 51, y: 10 }, { t: 'crate', x: 50, y: 11 }, { t: 'log', x: 52, y: 12 },
      { t: 'lamp_post', x: 20, y: 13 }, { t: 'lamp_post', x: 37, y: 13 }, { t: 'lamp_post', x: 9, y: 13 },
      { t: 'wang_boat', x: 24, y: 28, water: true, solid: false, z: -200, key: 'dg_wangboat', if: (s) => !!s.flags.ch9_wangboat_launch && s.vars.ch9_port === 'donggang' },
      { t: 'dock_post', x: 25, y: 27 }, { t: 'dock_post', x: 28, y: 27 },
      { t: 'driftwood', x: 40, y: 24 }, { t: 'rock_small', x: 11, y: 25 },
    ],
    chests: [
      { id: 'dg_market', x: 3, y: 10, item: 'c9_shuanggaorun', n: 2 },
      { id: 'dg_yard', x: 53, y: 10, item: 'c9_tiedingfu', n: 1 },
      { id: 'dg_banyan', x: 36, y: 17, gold: 800 },
    ],
    lights: (s) => (dgNight(s) || dgDusk(s) ? [{ x: 23, y: 7, r: 260, color: '#ffb060', flicker: 0.25 }, { x: 46, y: 10, r: 120, color: '#9aff8a', flicker: 0.5 }, { x: 8, y: 12, r: 120, color: '#ffc070' }, { x: 41, y: 19, r: 120, color: '#ffc070' }] : []),
    npcs: [
      chenboNpc('donggang', [16, 1], (s) => !s.flags.ch9_shipyard_clear || !!s.flags.ch9_wangboat_launch),
      { id: 'dg_ashan', sprite: 'old_m', name: '阿杉師', pos: (s) => (s.flags.ch9_wangboat_launch ? [31, 22] : [45, 11]), x: 45, y: 11, dir: 'down',
        if: (s) => !s.flags.ch9_jiaobei_done || !!s.flags.ch9_wangboat_launch, talk: async (S) => {
          if (F('ch9_wangboat_launch')) {
            await S.say('阿杉師', '我造過的王船，都是一把火送走的。這是第一艘，我看著它自己走下海。');
            await S.say('阿杉師', '你們要好好待它。船有眼睛，它會記得誰對它好。');
            return;
          }
          await S.say('阿杉師', '咳……王船是用最好的杉木造的，龍骨一安，就不能隨便動。');
          await S.say('阿杉師', '今年不是迎王的年。千歲爺卻在正月就降旨，要我們提早造船。我造了四十年船，第一次。');
        } },
      { id: 'dg_cake', sprite: 'shopkeeper_f', name: '雙糕潤阿嬸', x: 9, y: 12, dir: 'down', talk: async (S) => {
        await S.say('雙糕潤阿嬸', '雙糕潤，東港的古早味！糯米、黑糖，一層一層蒸，像人生，有甜有軟。');
        await S.shop(['c9_shuanggaorun', 'shimuyu', 'c9_qiyuwan', 'yinghuaxia'], { title: '雙糕潤' });
      } },
      { id: 'dg_shop', sprite: 'merchant', name: '雜貨店頭家', x: 13, y: 19, dir: 'down', talk: async (S) => {
        await S.say('雜貨店頭家', '要去王船廠的話，驅瘟符多帶幾張。那裡最近不乾淨。');
        await S.shop(['shimuyu', 'c9_xiancaodong', 'ezaijian', 'c9_aicao', 'huanhunxiang', 'c9_quwenfu'], { title: '東港雜貨' });
      } },
      { id: 'dg_inn', sprite: 'merchant', name: '客棧掌櫃', x: 43, y: 19, dir: 'down', talk: async (S) => {
        await S.say('客棧掌櫃', '一晚九十文。迎王前後房間難訂，今年你們好運。');
        await S.inn(90, { who: '客棧掌櫃' });
      } },
      { id: 'dg_smith', sprite: 'villager_m', name: '鐵匠阿鐵', x: 49, y: 19, dir: 'down', talk: async (S) => {
        await S.say('鐵匠阿鐵', '造王船的鐵釘，都是我打的。順便打幾把槍給你們。');
        await S.shop(['sp_polang', 'c9_sw_tiegu', 'c9_ar_yulin', 'c9_ft_baotie'], { title: '阿鐵打鐵店' });
      } },
      { id: 'dg_pole', sprite: 'villager_m2', name: '阿海仔', x: 28, y: 9, dir: 'left', wander: 2, if: (s) => !dgNight(s), talk: async (S) => {
        if (F('ch9_wangboat_launch')) { await S.say('阿海仔', '我拉繩拉到手都起水泡了！值得！王船真的自己走下海！'); return; }
        await S.say('阿海仔', '三年一科迎王，我們轎班的都要練。今年提早，我腿都練粗了！');
      } },
      { id: 'dg_old_f', sprite: 'old_f', name: '拜拜阿嬤', x: 21, y: 9, dir: 'right', talk: async (S) => {
        await S.say('拜拜阿嬤', '少年仔，進廟先拜天公爐，再進去拜千歲爺。順序不要亂。');
        await S.say('拜拜阿嬤', '擲筊要先講清楚你是誰、住哪裡、要問什麼。神明很忙，你要說清楚。');
      } },
      { id: 'dg_fisher', sprite: 'fisherman', name: '黑面仔', x: 6, y: 6, dir: 'left', talk: async (S) => {
        await S.say('黑面仔', '最近南岬那邊過不去，落山風一直吹，吹到四月還不停。不正常。');
        await S.say('黑面仔', '以前一入三月就停了。現在風裡面還有人在哭的聲音。');
      } },
      { id: 'dg_child', sprite: 'child_f', name: '細妹', x: 19, y: 13, dir: 'down', wander: 1, if: (s) => !dgNight(s), talk: async (S) => {
        if (F('ch9_wangboat_launch')) { await S.say('細妹', '王船——要回來喔——我會一直等！'); return; }
        await S.say('細妹', '阿母說王船要出海了。我要把我的糖藏好，到時候添給王船！');
      } },
      { id: 'dg_tourist', sprite: 'pilgrim', name: '進香客', x: 29, y: 7, dir: 'down', wander: 1, if: (s) => !dgNight(s), talk: ['我從屏東城走了兩天來的。聽說今年王船提早造，大家都說，一定有大事。'] },
    ],
    events: [
      { id: 'dg_arrive', trigger: 'auto', if: (s) => !s.flags.ch9_donggang_arrive, run: async (S) => { await donggangArrive(S); } },
      { id: 'dg_launch', trigger: 'auto', if: (s) => !!s.flags.ch9_shipyard_clear && !s.flags.ch9_wangboat_launch, run: async (S) => { await wangboatLaunch(S); } },
      { id: 'dg_board', trigger: 'touch', x: 26, y: 27, w: 2, h: 1, if: (s) => !!s.flags.ch9_wangboat_launch && s.vars.ch9_port === 'donggang', run: async (S) => { await boardDeck(S); } },
      { id: 'dg_north', trigger: 'touch', x: 16, y: 0, w: 2, h: 1, run: async (S) => {
        if (F('ch9_wangboat_launch')) await S.say('chenbo:normal', '現在有船了，要回旗後就搭王船吧。');
        else await S.say('chenbo:serious', '往北是回旗後的路。我們的事在東港。');
        await S.move('player', 'D');
      } },
    ],
    warps: [
      { x: 23, y: 5, to: 'donglong_hall', tx: 9, ty: 11, tdir: 'up', door: true, run: async (S) => {
        if (F('ch9_donggang_arrive') && !F('ch9_tiangong_incense')) {
          S.face('dg_old_f', 'player');
          await S.say('拜拜阿嬤', '少年仔！進廟先拜天公爐，再進去拜千歲爺。順序不要亂。');
          await S.move('player', 'D');
          return false;
        }
        return true;
      } },
      { x: 46, y: 9, w: 2, to: 'wangchuan_yard', tx: 21, ty: 28, tdir: 'up', door: true, run: async (S) => {
        if (!F('ch9_jiaobei_done')) {
          await S.say('', '王船廠的大門關著。裡面傳出一陣一陣的咳嗽聲。');
          await S.say('阿杉師', '咳……外人不要進來，王船還沒造好。');
          await S.move('player', 'D');
          return false;
        }
        return true;
      } },
    ],
    onUpdate: withFollow(),
  });

  // ---- 東隆宮正殿 ----
  G.Maps.define('donglong_hall', {
    name: '東隆宮', subtitle: '千歲爺正殿', place: 'donggang', bgm: 'temple', start: [9, 11],
    light: { ambient: 0.15, color: '#2a1006' }, particles: [{ type: 'motes', density: 0.8 }],
    tiles: (() => {
      const g = grid(20, 14, 'E');
      g.rect(1, 2, 18, 11, 'T').rect(9, 13, 2, 1, 'T');
      g.rect(8, 6, 4, 5, 'c');
      return g.rows();
    })(),
    objects: [
      { t: 'altar', x: 5, y: 2 }, { t: 'altar', x: 9, y: 2 }, { t: 'altar', x: 13, y: 2 },
      { t: 'banner', x: 4, y: 2, color: '#b0281e' }, { t: 'banner', x: 8, y: 2, color: '#c8a030' }, { t: 'banner', x: 11, y: 2, color: '#c8a030' }, { t: 'banner', x: 15, y: 2, color: '#b0281e' },
      { t: 'pillar', x: 2, y: 2 }, { t: 'pillar', x: 17, y: 2 }, { t: 'pillar', x: 2, y: 10 }, { t: 'pillar', x: 17, y: 10 },
      { t: 'incense_burner', x: 9, y: 5 },
      { t: 'table', x: 12, y: 5 }, { t: 'divination_blocks', x: 12, y: 4 },
      { t: 'rug', x: 8, y: 7, w: 3, h: 2 },
      { t: 'eternal_lamp', x: 7, y: 2 }, { t: 'eternal_lamp', x: 12, y: 2 },
      { t: 'mural', x: 2, y: 1, v: 2 }, { t: 'mural', x: 16, y: 1, v: 4 },
      { t: 'drum', x: 3, y: 6 }, { t: 'bell', x: 16, y: 6 },
    ],
    npcs: [
      chenboNpc('donglong_hall', [10, 11]),
      { id: 'dg_keeper', sprite: 'temple_keeper', name: '添丁伯', x: 14, y: 5, dir: 'left', talk: async (S) => {
        if (!F('ch9_jiaobei_done')) { await S.say('添丁伯', '少年仔，要拜拜？先到前面，跪上拜墊。'); return; }
        await S.say('添丁伯', '拜拜不是做生意，是講心。你心誠，千歲爺就聽得到。');
        await S.say('添丁伯', '老一輩講，溫府千歲生前也在海上遇過大風浪，所以祂最懂海上人的苦。');
        await S.say('添丁伯', '王船出巡，船上載的是厄運、瘟疫、送不走的東西。你們這趟，是要把燈帶回來。');
      } },
    ],
    events: [
      { id: 'dl_c906', trigger: 'auto', if: (s) => !!s.flags.ch9_tiangong_incense && !s.flags.ch9_jiaobei_done, run: async (S) => { await jiaobeiScene(S); } },
      { id: 'dl_pray', trigger: 'action', x: 9, y: 4, w: 2, h: 1, label: '參拜', run: async (S) => {
        S.sfx('bell');
        await S.say('', '金漆神龕、紅色帳幔，燭火靜靜地燒著。星河合掌，深深一拜。');
      } },
    ],
    warps: [
      { x: 9, y: 13, w: 2, to: 'donggang', tx: 23, ty: 6, tdir: 'down', door: true, run: async (S) => {
        if (F('ch9_jiaobei_done') && !F('ch9_dg_nightfall')) {
          S.flag('ch9_dg_nightfall');
          await S.fadeOut(0.6);
          await S.narrate(['走出東隆宮，天已經黑了。', '王船廠那邊，綠色的火光一明一滅。'], { veil: 1 });
        }
        return true;
      } },
    ],
    onUpdate: withFollow(),
  });

  // ---- 東港 scripts ----
  async function donggangArrive(S) {
    S.flag('ch9_donggang_arrive');
    S.setPos('player', 16, 2, 'down'); S.gather(); S.setPos('chenbo', 17, 1, 'down');
    await S.move('player', 'DDD');
    await S.say('', '傍晚的東港，街上人來人往，比旗後熱鬧，但大家都神色匆匆。');
    await S.say('', '王船廠的方向，傳來咳嗽聲與敲木頭的聲音。');
    await S.say('tuanzi:laugh', '喵！有甜的味道！是糯米！是黑糖！');
    await S.say('yungui:normal', '雙糕潤。東港的古早點心。……我也想吃。');
    await S.say('hongying:surprise', '你也會想吃甜的？');
    await S.say('yungui:smug', '道士也是人。道士的胃，比道心誠實。');
    await S.say('chenbo:angry', '先拜拜，再吃！');
    await S.camera(23, 4, 1.2);
    await S.say('', '金色的牌樓、燕尾脊上的剪黏龍，廟前的天公爐香煙不斷。');
    await S.say('xinghe:surprise', '好氣派……');
    S.cameraFollow();
    await S.say('chenbo:serious', '進去之前聽好。不要大聲、不要亂摸、不要拿神明開玩笑。');
    await S.say('chenbo:serious', '——糰子，說你。');
    await S.say('tuanzi:shy', '本大爺很乖的……');
    S.quest('q_ch9_main', 1);
    S.objective('到東隆宮參拜，向千歲爺請求借王船');
  }
  async function tiangong(S) {
    if (F('ch9_tiangong_incense') || !F('ch9_donggang_arrive')) {
      await S.say('', '天公爐的香煙裊裊上升，飄向天空。');
      return;
    }
    S.sfx('bell');
    await S.say('', '星河點了三炷香，面向天空拜了三拜，把香插進天公爐。');
    await S.say('拜拜阿嬤', '這樣就對了。拜過天公，再進去拜千歲爺。');
    S.flag('ch9_tiangong_incense');
  }
  async function jiaobeiScene(S) {
    S.bgm('temple');
    S.setPos('player', 9, 9, 'up'); S.setPos('hongying', 8, 10, 'up'); S.setPos('yungui', 10, 10, 'up'); S.setPos('tuanzi', 9, 10, 'up'); S.setPos('chenbo', 11, 9, 'up');
    await S.say('', '殿內燭火搖曳。添丁伯在供桌旁整理香枝。');
    S.face('dg_keeper', 'player');
    await S.say('添丁伯', '少年仔，要拜拜？……喔，陳渡！你這陣子跑哪去？');
    await S.say('chenbo:normal', '添丁，我們來向千歲爺借一樣東西。');
    await S.say('添丁伯', '借什麼？');
    await S.say('xinghe:serious', '王船。');
    S.bgm(null, { fade: 1.5 });
    await S.say('', '添丁伯手上的香停住了。殿內很靜。');
    await S.say('添丁伯', '……王船不是借的東西。王船是千歲爺出巡坐的。');
    await S.say('添丁伯', '不過——今年正月起，千歲爺就一直要我們提早造船。');
    await S.say('添丁伯', '說不定，祂等的就是你們。去問吧，用筊。');
    S.bgm('temple');
    await S.move('dg_keeper', 'L');
    await S.say('', '添丁伯遞上一對筊杯。星河接過。');
    await S.say('xinghe:surprise', '這、這怎麼用？');
    await S.say('添丁伯', '雙手合起來捧著筊，先跟千歲爺稟報。你是誰、住哪裡、要問什麼。');
    await S.say('添丁伯', '說完，往前輕輕一擲。一平一凸是聖筊，是允了。');
    await S.say('添丁伯', '兩面平的是笑筊，千歲爺在笑，代表你問得不清楚。兩面凸的是陰筊，是不允。');
    await S.say('添丁伯', '大事要連續三個聖筊才算數。');
    await S.move('player', 'U');
    await S.say('', '星河跪上拜墊。');
    const c0 = await S.choice(['「千歲爺，借我王船！拜託！」', '先照廟公說的，好好稟報。']);
    if (c0 === 0) {
      await S.say('xinghe:serious', '千歲爺，借我王船！拜託！我要去救人！');
      await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['xiao'], prompt: '「千歲爺，借我王船！」——按 Z 擲筊' });
      await S.say('', '筊杯落地——兩面朝上，皆平。笑筊。');
      await S.say('添丁伯', '哈哈哈！千歲爺笑你啦！');
      await S.say('添丁伯', '你是誰、從哪來、救誰、去哪，一句都沒說。神明又不是賣船的。');
      await S.say('hongying:smug', '……笨蛋。');
      await S.say('xinghe:shy', '好啦好啦，重來。');
    }
    await S.camera(9, 6, 0.8);
    await S.say('', '星河重新合掌，捧筊至額前。');
    await S.say('xinghe:serious', '千歲爺在上。弟子沈星河，九份陳記燈籠舖的學徒。');
    await S.say('xinghe:think', '生辰……弟子不知道。');
    await S.say('xinghe:sad', '十八年前的中元夜，弟子躺在一盞水燈裡，從八斗子的海邊被撿回來。');
    await S.say('添丁伯', '（低聲）那就這樣講。千歲爺比你清楚。');
    await S.say('xinghe:serious', '有一個人，被帶到黑水溝的另一邊去了。她叫白芷。');
    await S.say('xinghe:serious', '弟子懇請千歲爺借王船，讓弟子渡過黑水溝，帶她回來。');
    await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['sheng'], prompt: '誠心稟報——按 Z 擲筊' });
    S.sfx('bell');
    await S.say('', '一平一凸。聖筊。');
    await S.say('hongying:surprise', '！');
    await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['sheng'], prompt: '第二擲——按 Z 擲筊' });
    await S.say('', '聖筊。');
    await S.say('tuanzi:surprise', '喵……！再一個！再一個！');
    await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['yin'], prompt: '第三擲——按 Z 擲筊' });
    S.bgm(null, { fade: 0.3 });
    S.sfx('push');
    await S.say('', '筊杯在地上轉了很久，停下——兩面皆凸。陰筊。');
    await S.wait(0.8);
    await S.say('', '殿內一片安靜。');
    S.bgm('temple');
    await S.say('hongying:angry', '為什麼！前面兩個都允了——');
    await S.say('chenbo:serious', '紅纓。');
    await S.say('hongying:sad', '……對不起。');
    await S.say('添丁伯', '不要急。不是不肯，是還有話沒問到。');
    await S.say('yungui:think', '神明不是當舖。借東西，有借東西的規矩。');
    await S.say('yungui:think', '千歲爺允了兩次——「借」是允的。不允的，是「現在就去」。');
    await S.say('添丁伯', '（點頭）千歲爺是代天巡狩。王船出海，向來不是只為一件事。');
    await S.say('xinghe:think', '……巡狩。巡。');
    let asked = false;
    for (;;) {
      const opts = asked ? ['「是要我們先做什麼事嗎？」'] : ['「是要我們先做什麼事嗎？」', '「是要我們添香油錢嗎？」'];
      const c = await S.choice(opts);
      if (c === 1) {
        await S.say('xinghe:normal', '千歲爺，是要弟子添香油錢嗎？');
        await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['yin'], prompt: '按 Z 擲筊' });
        await S.say('', '陰筊。');
        await S.say('添丁伯', '（苦笑）千歲爺不缺你這點錢啦。');
        asked = true;
        continue;
      }
      await S.say('xinghe:normal', '千歲爺，是要弟子們先替您做什麼事嗎？');
      await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['sheng'], prompt: '按 Z 擲筊' });
      S.sfx('bell');
      await S.say('', '聖筊。');
      break;
    }
    await S.say('添丁伯', '那就要一件一件問了。');
    await S.say('chenbo:think', '……王船出巡，是繞境。繞著境內走一圈，把厄運收上船。');
    await S.say('chenbo:serious', '星河，你問祂，是不是要王船先繞境。繞的不是東港，是——');
    await S.say('xinghe:surprise', '是整個島？');
    S.flash('#ffd890', 0.4, 0.35);
    await S.say('', '殿內的燭火，忽然齊齊一晃。');
    await S.say('xinghe:serious', '千歲爺。弟子再稟一次。');
    await S.say('xinghe:serious', '王船出海，先繞全島巡境——沿路收燈，幫被逆潮所害的人，');
    await S.say('xinghe:serious', '等繞完一圈，才渡黑水溝。千歲爺是不是這個意思？');
    await G.Mini.jiaobei({ title: '擲筊・三聖筊', throws: 3, results: ['sheng', 'sheng', 'sheng'], prompt: '「繞島巡境」——按 Z 擲筊' });
    S.sfx('bell'); S.sfx('wind');
    S.particles([{ type: 'motes', density: 1.6 }, { type: 'wind', density: 0.4 }]);
    await S.say('', '第三個聖筊落定時，殿外傳來一陣風，香爐的煙全往南邊海的方向流去。');
    S.sfx('wood');
    await S.say('', '王船廠的方向，傳來一聲悠長的木頭鳴響。');
    await S.say('添丁伯', '（深深一拜）……三聖筊。千歲爺允了。');
    await S.say('添丁伯', '「繞島巡境」。王船要先繞台灣一圈，才渡黑水溝。');
    await S.say('hongying:serious', '一圈……一百天之內？');
    await S.say('chenbo:normal', '王船走的不是人的水路。順著潮，夠的。');
    await S.say('yungui:smug', '而且南邊東邊的潮，是活的。順得很。');
    await S.say('xinghe:serious', '好！繞就繞！反正——');
    await S.say('xinghe:smile', '我本來就是從海上來的。繞自己的島一圈，也是應該的。');
    await S.say('', '眾人向神龕三拜。星河將筊杯雙手放回供桌。');
    await S.say('添丁伯', '這支令旗，你們帶著。王船出巡，令旗在，千歲爺就在。');
    await S.give('c9_key_lingqi', 1);
    await S.give('c9_key_xunjing', 1);
    await S.say('添丁伯', '不過……王船還沒造好。舵、帆、龍目都還沒上。');
    await S.say('添丁伯', '這陣子王船廠夜夜鬧，師傅一個一個病倒。你們今晚去看看。');
    S.particles([{ type: 'motes', density: 0.8 }]);
    S.flag('ch9_jiaobei_done'); S.flag('ch9_condition_xunjing');
    days(S, 1);
    S.quest('q_ch9_main', 2);
    S.objective('夜裡到王船廠');
    S.cameraFollow();
  }

  async function wangboatLaunch(S) {
    // morning after the shipyard night
    S.bgm('temple');
    S.light({ ambient: 0.1, color: '#ffd8a0' });
    S.particles([{ type: 'motes', density: 0.6 }]);
    const m = G.mapScene;
    const boat = { t: 'wang_boat', x: 43, y: 10, solid: false, z: -200, key: 'dg_launchboat' };
    m.objects.push(boat);
    S.setPos('player', 44, 14, 'up'); S.setPos('hongying', 43, 14, 'up'); S.setPos('yungui', 46, 14, 'up'); S.setPos('tuanzi', 45, 15, 'up'); S.setPos('chenbo', 47, 14, 'up');
    S.spawn({ id: 'dg_l_ashan', sprite: 'old_m', x: 42, y: 13, dir: 'up' });
    S.spawn({ id: 'dg_l_keeper', sprite: 'temple_keeper', x: 49, y: 13, dir: 'up' });
    S.spawn({ id: 'dg_l_app', sprite: 'villager_m2', x: 50, y: 12, dir: 'left' });
    await S.camera(46, 12, 0.6);
    await S.say('', '清晨。王船廠的大門敞開，阿杉師與學徒把舵、帆、龍目一一裝上。');
    await S.say('', '王船通身彩繪：船身綠紅相間，船頭兩側，是龍目的位置。');
    await S.say('阿杉師', '龍目，要請廟公來點。');
    await S.move('dg_l_keeper', 'LL');
    await S.say('', '添丁伯持著朱筆與鏡子，在船頭前唸誦。鏡子把晨光反射到龍目上，朱筆在瞳仁點下。');
    S.flash('#fff2c8', 0.5, 0.7);
    await S.say('添丁伯', '開光點睛——');
    S.sfx('wood'); S.shake(4, 0.6);
    await S.say('', '龍目一點，整艘船輕輕一震，像睡醒的人吸了一口氣。');
    await S.say('xinghe:surprise', '它……它動了。');
    await S.say('阿杉師', '船有眼睛，就認得路了。');
    // 添載
    const folk = [['dg_f1', 'shopkeeper_f', 36, 15], ['dg_f2', 'child_f', 37, 14], ['dg_f3', 'villager_m2', 38, 15], ['dg_f4', 'old_f', 36, 14], ['dg_f5', 'villager_m', 35, 15], ['dg_f6', 'fisher_f', 34, 14]];
    for (const [id, sp, x, y] of folk) S.spawn({ id, sprite: sp, x, y, dir: 'right' });
    for (const [id] of folk) S.move(id, 'RRR', { wait: false, speed: 2.4 });
    await S.say('', '街上的人陸續來了，每人手上捧著東西：米、鹽、柴、油、茶葉、糖、清水。');
    await S.say('添丁伯', '添載！王船出巡，大家把東西添上船，讓千歲爺和船上的人路上不缺。');
    await S.say('雙糕潤阿嬸', '雙糕潤，一籠。路上餓了吃。');
    await S.say('tuanzi:cry', '阿嬸妳是好人！');
    S.face('dg_f2', 'tuanzi');
    await S.say('細妹', '我把我的糖添給王船！……我可以先吃一顆嗎？');
    await S.say('hongying:shy', '（小聲）……好可愛。');
    await S.say('細妹', '（把糖放到糰子面前）給王船的貓仔吃。');
    await S.say('tuanzi:surprise', '本大爺是石虎！……謝謝。');
    await S.say('轎班少年', '師傅！這隻貓仔要不要也添上去？');
    S.emote('tuanzi', '💢');
    await S.say('tuanzi:angry', '本大爺不是添載品！');
    await S.say('yungui:smug', '可以考慮。');
    S.emote('dg_f3', '♪'); S.emote('hongying', '♪');
    // procession
    await S.camera(23, 8, 1.0);
    const pal = { t: 'palanquin', x: 22, y: 7, key: 'dg_palanquin' };
    m.objects.push(pal);
    const fc = { t: 'firecracker_tower', x: 17, y: 9, key: 'dg_fc1' }, fc2 = { t: 'firecracker_tower', x: 28, y: 9, key: 'dg_fc2' };
    m.objects.push(fc, fc2);
    S.spawn({ id: 'dg_bj1', sprite: 'bajiajiang', x: 20, y: 9, dir: 'down' }); S.spawn({ id: 'dg_bj2', sprite: 'bajiajiang', x: 25, y: 9, dir: 'down' });
    S.bgm('procession');
    S.particles(['embers', { type: 'petals', density: 0.8 }]);
    S.sfx('gong'); S.shake(3, 0.5);
    await S.say('', '神轎抬出廟門，轎班列隊，炮仗聲響起。');
    await S.wait(0.6);
    await S.camera(44, 12, 0.8);
    await S.say('添丁伯', '拉王船——！');
    const c = await S.choice(['一起拉繩', '在旁邊看']);
    if (c === 1) {
      await S.say('', '眾人站在路邊看。一個阿嬤把繩頭塞到星河手裡。');
      await S.say('拜拜阿嬤', '少年仔，這是你們要坐的船，要自己拉。');
    }
    await S.say('', '數十條粗繩繫在王船兩側的木架上。東港男女老少拉著繩子，王船在滾木上一寸一寸往海灘移動。');
    await S.say('hongying:laugh', '用力啊雲歸！你那根繩子是垂著的！');
    await S.say('yungui:smug', '我在用「意念」拉。');
    // pull the boat to the beach: road (43,10) → (38,13) → (24,21)
    S.hideFollowers(true); S.show('chenbo', false);
    S.cameraFollow('dg_l_app');
    S.setPos('dg_l_app', 43, 15, 'left');
    const pullers = ['player', 'dg_f1', 'dg_f3', 'dg_f5', 'dg_l_app'];
    S.setPos('player', 42, 15, 'left'); S.setPos('dg_f1', 41, 16, 'left'); S.setPos('dg_f3', 40, 15, 'left'); S.setPos('dg_f5', 39, 16, 'left');
    for (const id of pullers) S.move(id, [['left', 14], ['down', 5]], { wait: false, speed: 3.0 });
    S.sfx('push');
    await G.Tweens.to(boat, { x: 29, y: 12 }, 4.6, 'inOutQuad');
    await G.Tweens.to(boat, { y: 20, x: 25 }, 2.0, 'inOutQuad');
    await S.wait(0.3);
    for (const id of pullers) { const a = S.actor(id); if (a) a.queue = []; }
    S.cameraFollow('player');
    S.setPos('player', 23, 22, 'right'); S.setPos('dg_l_keeper', 22, 20, 'right'); S.setPos('dg_l_ashan', 22, 21, 'right');
    S.hideFollowers(false); S.show('chenbo', true);
    S.setPos('hongying', 22, 23, 'right'); S.setPos('yungui', 23, 24, 'right'); S.setPos('tuanzi', 24, 24, 'up'); S.setPos('chenbo', 21, 22, 'right');
    await S.camera(26, 22, 0.6);
    S.bgm('temple', { fade: 1 });
    await S.say('', '王船抵達海灘。浪一波一波打上船底。');
    await S.say('添丁伯', '（揮令旗，唸）開——水——路——');
    S.particles([]);
    await S.wait(0.5);
    S.sfx('wind');
    await S.say('', '海面平靜得出奇。忽然一陣風從東隆宮方向吹來，王船的帆一下子鼓滿——');
    await S.say('', '——但海邊的旗子、人的衣角，全都一動不動。');
    await S.say('阿杉師', '（喃喃）……沒有風，帆是滿的。');
    await S.say('添丁伯', '千歲爺上船了。');
    await S.say('chenbo:serious', '……上船吧。');
    await S.fadeOut(0.6);
    boat.water = true; boat.x = 24; boat.y = 23;
    S.setPos('player', 26, 24, 'right'); S.setPos('hongying', 27, 24, 'right'); S.setPos('yungui', 26, 25, 'right'); S.setPos('tuanzi', 27, 25, 'right'); S.setPos('chenbo', 24, 24, 'right');
    await S.fadeIn(0.6);
    await S.say('', '眾人登船。陳伯走到船尾，把手放在舵上，停了很久。');
    await S.say('chenbo:sad', '三十年沒掌過舵了。');
    await S.say('xinghe:normal', '陳伯？');
    await S.say('chenbo:smile', '……還記得。手還記得。');
    S.bgm('voyage');
    S.particles(['embers', { type: 'petals', density: 0.6 }]);
    S.sfx('gong');
    const riders = ['player', 'hongying', 'yungui', 'tuanzi', 'chenbo'];
    for (const id of riders) S.move(id, 'DDDDD', { wait: false, speed: 1.1, ghost: true });
    await G.Tweens.to(boat, { y: 28 }, 4.5, 'inOutQuad');
    for (const id of riders) { const a = S.actor(id); if (a) a.queue = []; }
    S.spawn({ id: 'dg_l_girl', sprite: 'child_f', x: 27, y: 25, dir: 'down' });
    await S.say('細妹', '（大喊）王船——要回來喔——');
    await S.say('hongying:smile', '……會回來的。');
    await S.camera(27, 32, 1.4);
    await S.say('', '王船駛離東港。帆上「代天巡狩」四個字，迎著朝陽。');
    await xunjingShow(S, 0);
    await S.say('添丁伯', '（遠遠地）出巡要穿號衣，千歲爺才認得是自己人——');
    await S.give('c9_ar_haoyi', 3);
    S.flag('ch9_wangboat_launch');
    V().ch9_port = 'donggang';
    V().ch9_deck_night = false;
    days(S, 2);
    for (const id of ['dg_l_ashan', 'dg_l_keeper', 'dg_l_app', 'dg_bj1', 'dg_bj2', 'dg_l_girl', ...folk.map((f) => f[0])]) S.remove(id);
    G.mapScene.objects = G.mapScene.objects.filter((o) => !['dg_launchboat', 'dg_palanquin', 'dg_fc1', 'dg_fc2'].includes(o.key));
    await S.warp('wangboat_deck', 12, 6, 'right');
    await deckFirst(S);
  }

  // =====================================================================================================
  // MAP 5 — wangchuan_yard 王船廠之夜（地城）
  // =====================================================================================================
  const YZ = {
    w: { x: 1, y: 8, w: 15, h: 12, flag: 'ch9_bz_w', bz: [14, 8], name: '木料場' },
    n: { x: 1, y: 2, w: 42, h: 4, flag: 'ch9_bz_n', bz: [37, 2], name: '帆布坊' },
    e: { x: 28, y: 8, w: 15, h: 12, flag: 'ch9_bz_e', bz: [41, 17], name: '彩繪間' },
    c: { x: 17, y: 8, w: 10, h: 12, flag: null, name: '船台' },
  };
  const yzClear = (s, k) => (k === 'c' ? !!(s.flags.ch9_bz_w && s.flags.ch9_bz_n && s.flags.ch9_bz_e) : !!s.flags[YZ[k].flag]) || !!s.flags.ch9_shipyard_clear;
  const yzAt = (x, y) => Object.keys(YZ).find((k) => { const z = YZ[k]; return x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h; });
  const CART_HOME = [7, 8, 7];
  const CART_Y = [10, 12, 14];
  const cartPos = (s) => (s.vars.ch9_carts || CART_HOME);
  const EYES = [
    { dir: '→', side: '左', text: '瞳仁朝著「船頭」的方向。板子角落用金漆寫著「左龍目」。' },
    { dir: '←', side: '', text: '瞳仁朝後看。眼神空空的，像在回頭找什麼。' },
    { dir: '↑', side: '', text: '瞳仁往上翻，只看得見天。' },
    { dir: '→', side: '右', text: '瞳仁朝著「船頭」的方向。板子角落用金漆寫著「右龍目」。' },
    { dir: '↓', side: '', text: '瞳仁往下看，像在看自己的腳。' },
    { dir: '→', side: '左', text: '瞳仁朝前，角落也寫著「左龍目」……靠近一看，眼白裡有細細的綠色血絲。' },
  ];
  const BOARD_TXT = ['壹', '貳', '參', '肆', '伍', '陸'];

  async function yardBrazier(S, k) {
    const z = YZ[k];
    if (F(z.flag)) { await S.say('', '艾草在火盆裡燒著，苦苦的煙把瘴氣都趕開了。'); return; }
    if (!S.hasItem('c9_aicao')) {
      await S.say('', '一座冷掉的火盆。要是有艾草……');
      await S.say('yungui:normal', '艾草用完了？工寮的學徒那裡還有。');
      return;
    }
    S.take('c9_aicao', 1);
    S.sfx('fire');
    S.flag(z.flag);
    relight(S, { bgm: false });
    await S.say('', `把艾草束丟進火盆。火一下子竄了起來，苦苦的煙往四周散開——${z.name}的瘴氣慢慢散去了。`);
    if (yzClear(st(), 'c')) { await S.say('', '三座火盆都點起來了。中央船台上的瘴氣，也跟著散了。'); }
  }
  async function pushCart(S, i) {
    const m = G.mapScene;
    const p = m.player;
    const o = m.objects.find((ob) => ob.key === 'cart' + i);
    if (!o) return;
    if (p.y !== o.y || (p.dir !== 'left' && p.dir !== 'right')) { await S.say('', '推車卡在鐵軌上，只能沿著鐵軌左右推。'); return; }
    const dx = p.dir === 'right' ? 1 : -1;
    const nx = dx > 0 ? o.x + 2 : o.x - 1;
    const ok = m.terrainAt(nx, o.y) === 'rail' && !m.solid[o.y * m.w + nx] && !(m.player.x === nx && m.player.y === o.y);
    if (!ok) { S.sfx('buzz'); await S.say('', '推不動了——再過去就是軌道盡頭，或是被別的東西擋住了。'); return; }
    o.x += dx;
    o.key = 'cart' + i;
    S.sfx('push');
    const v = V(); v.ch9_carts = cartPos(st()).slice(); v.ch9_carts[i] = o.x;
    m.computeSolid();
    const clear = v.ch9_carts.every((x) => x !== 8 && x + 1 !== 8);
    if (clear && !F('ch9_carts_clear')) { S.flag('ch9_carts_clear'); S.sfx('switch'); await S.say('', '三台推車都讓開了——中間那條通道，一路通到木料堆深處。'); }
  }
  async function eyeBoard(S, i) {
    const e = EYES[i];
    await S.say('', `第${BOARD_TXT[i]}面龍目板。${e.text}`);
    if (F('ch9_part_eye')) return;
    const c = await S.choice(['取下', '先不要'], { cancel: 1 });
    if (c !== 0) return;
    const v = V();
    const good = i === 0 || i === 3;
    if (!good) {
      S.sfx('dark'); S.shake(6, 0.4);
      await S.say('', '木板在手裡變得又濕又熱——板子化成了瘟鬼！');
      v.ch9_eyePick = null;
      const r = await S.battle('t_c9_plague_eye', { mode: 'ambush', bgmAfter: 'tension' });
      if (r === 'win') await S.say('', '瘟鬼散去，木板又掛回了牆上。好像什麼都沒發生過。');
      return;
    }
    if (v.ch9_eyePick == null || v.ch9_eyePick === i) {
      v.ch9_eyePick = i;
      S.sfx('item');
      await S.say('', '取下了一面龍目。龍目要成對……還要另一面。');
      return;
    }
    v.ch9_eyePick = null;
    await takeEye(S);
  }
  async function takeEye(S) {
    S.sfx('levelup');
    await S.say('', '一對木刻的大眼睛，眼白、黑瞳、金邊，瞳仁望向前方。');
    await S.say('xinghe:normal', '船的眼睛……原來船也要看得見路。');
    await S.give('c9_key_eye', 1);
    S.flag('ch9_part_eye');
    await yardPartsCheck(S);
  }
  async function yardPartsCheck(S) {
    if (F('ch9_part_rudder') && F('ch9_part_sail') && F('ch9_part_eye')) {
      S.sfx('ghost');
      await S.say('', '三件都找齊了。中央船台那邊，吹來一陣陰冷的風。');
      S.objective('回到中央船台');
    }
  }

  G.Maps.define('wangchuan_yard', {
    name: '王船廠', subtitle: '夜裡的船台', place: 'donggang', start: [21, 28],
    bgm: (s) => (s.flags.ch9_shipyard_clear ? 'south' : 'tension'),
    light: (s) => (s.flags.ch9_shipyard_clear ? { ambient: 0.35, color: '#1a1408' } : { ambient: 0.65, color: '#06100a', playerR: 220 }),
    particles: (s) => {
      const out = [];
      const miasma = ['w', 'n', 'e'].filter((k) => !yzClear(s, k)).length;
      if (miasma) out.push({ type: 'mist', color: '#8ad070', alpha: 0.12 + miasma * 0.05, density: 0.6 + miasma * 0.3 });
      if (s.flags.ch9_bz_w || s.flags.ch9_bz_n || s.flags.ch9_bz_e) out.push({ type: 'embers', density: 0.5 });
      return out;
    },
    tiles: (() => {
      const g = grid(44, 32, 'W');
      g.rect(1, 2, 42, 4, '_').rect(4, 6, 1, 2, '_').rect(39, 6, 1, 2, '_');
      g.rect(1, 8, 15, 12, '_').rect(17, 8, 10, 12, '_').rect(28, 8, 15, 12, '_');
      g.set(16, 9, '_').set(27, 9, '_');
      g.rect(21, 20, 2, 2, '_').rect(1, 22, 42, 8, '_').rect(21, 30, 2, 2, '_');
      g.rect(3, 10, 12, 1, '+').rect(3, 12, 12, 1, '+').rect(3, 14, 12, 1, '+');
      g.rect(3, 17, 12, 3, 'W');
      g.rect(18, 10, 8, 5, ':');
      return g.rows();
    })(),
    objects: (s) => {
      const cp = cartPos(s);
      const out = [
        // west: timber piles between the rails, store behind
        { t: 'log', x: 3, y: 11 }, { t: 'log', x: 5, y: 11 }, { t: 'crate', x: 7, y: 11 }, { t: 'crate', x: 9, y: 11 }, { t: 'log', x: 10, y: 11 }, { t: 'log', x: 12, y: 11 }, { t: 'barrel', x: 14, y: 11 },
        { t: 'crate', x: 3, y: 13 }, { t: 'log', x: 4, y: 13 }, { t: 'barrel', x: 6, y: 13 }, { t: 'crate', x: 7, y: 13 }, { t: 'log', x: 9, y: 13 }, { t: 'crate', x: 11, y: 13 }, { t: 'log', x: 12, y: 13 }, { t: 'crate', x: 14, y: 13 },
        { t: 'log', x: 3, y: 15 }, { t: 'log', x: 5, y: 15 }, { t: 'crate', x: 7, y: 15 }, { t: 'crate', x: 9, y: 15 }, { t: 'log', x: 10, y: 15 }, { t: 'log', x: 12, y: 15 }, { t: 'barrel', x: 14, y: 15 },
        { t: 'crate', x: 3, y: 16 }, { t: 'log', x: 4, y: 16 }, { t: 'barrel', x: 6, y: 16 }, { t: 'crate', x: 7, y: 16 }, { t: 'log', x: 9, y: 16 }, { t: 'crate', x: 11, y: 16 }, { t: 'log', x: 12, y: 16 }, { t: 'crate', x: 14, y: 16 },
        { t: 'crate', x: 5, y: 12 },
        { t: 'stump', x: 1, y: 15 }, { t: 'stump', x: 15, y: 19 }, { t: 'crate', x: 2, y: 18 },
        { t: 'signboard', x: 1, y: 9, text: '繩', label: '拉繩', interact: async (S) => {
          const c = await S.choice(['拉重置繩（推車回到原位）', '算了'], { cancel: 1 });
          if (c !== 0) return;
          V().ch9_carts = CART_HOME.slice();
          const m = G.mapScene;
          for (let i = 0; i < 3; i++) { const o = m.objects.find((ob) => ob.key === 'cart' + i); if (o) o.x = CART_HOME[i]; }
          m.computeSolid(); S.sfx('push');
          await S.say('', '嘎啦嘎啦——三台推車被繩子拉回了原位。');
        } },
        // north: sail loft
        { t: 'laundry', x: 6, y: 3 }, { t: 'laundry', x: 10, y: 3 }, { t: 'laundry', x: 14, y: 3 }, { t: 'laundry', x: 25, y: 3 }, { t: 'laundry', x: 29, y: 3 },
        { t: 'laundry', x: 33, y: 3, key: 'ysail', if: (st2) => !st2.flags.ch9_part_sail, label: '取下', interact: async (S) => { await takeSail(S); } },
        { t: 'loom', x: 20, y: 2 }, { t: 'loom_small', x: 22, y: 2 }, { t: 'basket', x: 18, y: 2 }, { t: 'fishing_net', x: 2, y: 2 },
        { t: 'crate', x: 40, y: 2 }, { t: 'crate', x: 42, y: 4 }, { t: 'barrel', x: 42, y: 3 },
        // east: painting room
        { t: 'signboard', x: 28, y: 11, text: '船頭', interact: ['牆上畫著一個大箭頭「→」，旁邊寫著「船頭」。龍目要朝這個方向看。'], label: '看' },
        { t: 'table', x: 30, y: 12, w: 2 }, { t: 'jar', x: 33, y: 12 }, { t: 'jar', x: 34, y: 12 }, { t: 'jar_row', x: 30, y: 17 },
        { t: 'screen', x: 36, y: 15 }, { t: 'paper_stack', x: 31, y: 14 }, { t: 'workbench', x: 39, y: 13 },
        // center slipway
        { t: 'wang_boat', x: 19, y: 11, if: (st2) => !st2.flags.ch9_shipyard_clear },
        { t: 'log', x: 18, y: 15 }, { t: 'log', x: 24, y: 15 }, { t: 'lantern_rack', x: 17, y: 18 },
        // entrance hall (工寮)
        { t: 'bed_mat', x: 5, y: 23 }, { t: 'bed_mat', x: 7, y: 23 }, { t: 'bed_mat', x: 9, y: 23 },
        { t: 'incense_burner', x: 3, y: 23 }, { t: 'workbench', x: 14, y: 23 }, { t: 'stove', x: 33, y: 22 }, { t: 'table', x: 30, y: 25 }, { t: 'chair', x: 29, y: 25 },
        { t: 'lantern_frame', x: 26, y: 23 }, { t: 'crate', x: 40, y: 23 }, { t: 'barrel', x: 41, y: 23 }, { t: 'log', x: 37, y: 28 },
        { t: 'red_lantern', x: 20, y: 22 }, { t: 'red_lantern', x: 23, y: 22 },
      ];
      CART_Y.forEach((y, i) => out.push({ t: 'log', x: cp[i], y, key: 'cart' + i, label: '推', interact: async (S) => { await pushCart(S, i); } }));
      BOARD_TXT.forEach((txt, i) => out.push({ t: 'signboard', x: 30 + i * 2, y: 8, text: txt, v: i === 5 ? 1 : 0, label: '查看', interact: async (S) => { await eyeBoard(S, i); } }));
      for (const k of ['w', 'n', 'e']) {
        const z = YZ[k];
        out.push({ t: s.flags[z.flag] ? 'brazier' : 'cauldron', x: z.bz[0], y: z.bz[1], label: s.flags[z.flag] ? '調查' : '點燃艾草', interact: async (S) => { await yardBrazier(S, k); } });
      }
      return out;
    },
    chests: [
      { id: 'wy_sword', x: 1, y: 19, item: 'c9_sw_xunhai' },
      { id: 'wy_loft', x: 41, y: 2, item: 'c9_aicao', n: 1, run: async (S) => { await S.give('shimuyu', 3); } },
      { id: 'wy_east', x: 42, y: 19, item: 'c9_ac_jinzhi' },
    ],
    lights: (s) => {
      const out = [{ x: 21, y: 24, r: 180, color: '#ffb060', flicker: 0.2 }, { x: 8, y: 23, r: 110, color: '#ffb060' }];
      if (!s.flags.ch9_shipyard_clear) out.push({ x: 21, y: 13, r: 180, color: '#7aff6a', flicker: 0.6 });
      out.push({ x: 8, y: 16, r: 70, color: '#ffd890' });
      return out;
    },
    npcs: [
      { id: 'wy_ashan', sprite: 'old_m', name: '阿杉師', x: 8, y: 24, dir: 'down', talk: async (S) => {
        if (F('ch9_shipyard_clear')) { await S.say('阿杉師', '……燒退了。天一亮，我們就把舵、帆、龍目裝上去。'); return; }
        await S.say('阿杉師', '龍目要成對……瞳仁朝前，看路，不往後看。別拿錯。');
        await S.say('阿杉師', '還有……帶著艾草去。點了艾草，瘴氣就散。');
      } },
      { id: 'wy_app', sprite: 'villager_m2', name: '學徒', x: 12, y: 25, dir: 'left', talk: async (S) => {
        if (F('ch9_shipyard_clear')) { await S.say('學徒', '師傅退燒了！你們是怎麼辦到的？'); return; }
        await S.say('學徒', '咳……師傅說，艾草要多少拿多少。');
        if (G.Inv.count('c9_aicao') < 3) { await S.give('c9_aicao', 3 - G.Inv.count('c9_aicao')); }
        else await S.say('學徒', '你們身上的還夠用。');
      } },
      { id: 'wy_app2', sprite: 'villager_m', name: '病倒的學徒', x: 5, y: 24, dir: 'down', talk: ['咳咳……綠色的火……從海那邊爬進來……', '牠們把舵拖去木料場，帆扯去帆布坊……'] },
    ],
    enemies: [
      { id: 'wye1', troop: 't_c9_plague_b', x: 2, y: 13, art: 'plague_ghost', variant: 1, lv: 32, radius: 1, if: (s) => !yzClear(s, 'w') },
      { id: 'wye2', troop: 't_c9_plague_a', x: 12, y: 4, art: 'plague_ghost', variant: 1, lv: 32, radius: 3 },
      { id: 'wye3', troop: 't_c9_plague_b', x: 28, y: 4, art: 'plague_ghost', variant: 1, lv: 32, radius: 3, if: (s) => !yzClear(s, 'n') },
      { id: 'wye4', troop: 't_c9_plague_a', x: 34, y: 16, art: 'plague_ghost', variant: 2, lv: 32, radius: 2 },
      { id: 'wye5', troop: 't_c9_plague_b', x: 38, y: 11, art: 'plague_ghost', variant: 1, lv: 32, radius: 2, if: (s) => !yzClear(s, 'e') },
      { id: 'wye6', troop: 't_c9_plague_a', x: 25, y: 18, art: 'plague_ghost', variant: 1, lv: 32, radius: 1, if: (s) => !yzClear(s, 'c') && !s.flags.ch9_shipyard_clear },
    ],
    events: [
      { id: 'wy_intro', trigger: 'auto', if: (s) => !s.flags.ch9_shipyard_enter, run: async (S) => { await yardIntro(S); } },
      { id: 'wy_rudder', trigger: 'action', x: 8, y: 16, label: '取舵', if: (s) => !s.flags.ch9_part_rudder, run: async (S) => {
        S.sfx('item');
        await S.say('', '木料堆深處，卡著一支巨大的舵。');
        await S.say('xinghe:surprise', '這舵……比我人還高！');
        await S.say('hongying:smug', '我扛。');
        await S.say('', '紅纓單手把舵扛上了肩。');
        await S.give('c9_key_rudder', 1);
        S.flag('ch9_part_rudder');
        await yardPartsCheck(S);
      } },
      { id: 'wy_boss', trigger: 'touch', x: 18, y: 16, w: 8, h: 2, if: (s) => !!(s.flags.ch9_part_rudder && s.flags.ch9_part_sail && s.flags.ch9_part_eye) && !s.flags.ch9_shipyard_clear, run: async (S) => { await yardBoss(S); } },
      { id: 'wy_center_hint', trigger: 'touch', x: 18, y: 16, w: 8, h: 2, once: true, if: (s) => !(s.flags.ch9_part_rudder && s.flags.ch9_part_sail && s.flags.ch9_part_eye), run: async (S) => {
        await S.say('', '船台上，未完成的王船靜靜地躺著。船身四周，綠色的鬼火團團轉。');
        await S.say('yungui:serious', '舵、帆、龍目還沒找回來。先別驚動牠們。');
      } },
    ],
    warps: [
      { x: 21, y: 31, w: 2, to: 'donggang', tx: 46, ty: 11, tdir: 'down' },
    ],
    drawGround: (ctx, t, m) => {
      const s = st();
      // miasma haze per zone
      for (const k of Object.keys(YZ)) {
        if (yzClear(s, k)) continue;
        const z = YZ[k];
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.05 * Math.sin(t * 1.3 + z.x);
        ctx.fillStyle = k === 'c' ? '#5a7a3a' : '#4a7a4a';
        ctx.fillRect(z.x * T, z.y * T, z.w * T, z.h * T);
        ctx.restore();
      }
      // the rudder in its nook
      if (!s.flags.ch9_part_rudder) {
        const x = 8 * T + 32, y = 16 * T + 40;
        ctx.save();
        ctx.fillStyle = '#7a4a26'; ctx.strokeStyle = '#3a2010'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 6, y - 60); ctx.lineTo(x + 6, y - 60); ctx.lineTo(x + 8, y - 10); ctx.lineTo(x + 26, y - 4); ctx.lineTo(x + 22, y + 18); ctx.lineTo(x - 22, y + 18); ctx.lineTo(x - 26, y - 4); ctx.lineTo(x - 8, y - 10); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#c8282a'; ctx.fillRect(x - 18, y + 2, 36, 5);
        ctx.restore();
        drawSpark(ctx, 8, 16, t, '#ffe7a0');
      }
      if (!s.flags.ch9_part_sail) drawSpark(ctx, 33, 3, t, '#ffe7a0');
    },
    drawOver: (ctx, t) => {
      const v = V();
      if (v.ch9_chiefShow) drawMonsterAt(ctx, 'plague_ghost', 21, 15, t, { scale: 0.85, variant: 2, alpha: v.ch9_chiefShow });
    },
    onUpdate: (dt, m, busy) => {
      if (busy) return;
      const s = st();
      if (s.flags.ch9_shipyard_clear) return;
      const z = yzAt(m.player.x, m.player.y);
      if (!z || yzClear(s, z)) { m._c9step = s.steps; return; }
      if (m._c9step == null) m._c9step = s.steps;
      if (s.steps - m._c9step >= 4) {
        m._c9step = s.steps;
        for (const mem of G.Party.active()) if (mem.hp > 1) mem.hp = Math.max(1, mem.hp - Math.max(1, Math.round(G.Party.stats(mem.id).mhp * 0.02)));
        G.Render.doFlash('#7ad08a', 0.3, 0.25);
        G.Audio.sfx('poison');
      }
    },
  });

  async function takeSail(S) {
    S.sfx('item');
    await S.say('', '晾著的帆布裡，有一面繡著「代天巡狩」的大帆。帆被瘟鬼的綠火燒出了幾個洞。');
    await S.say('yungui:think', '破了。……算了，補帆跟補道心一樣，有破洞才透氣。');
    await S.say('tuanzi:surprise', '這句話好像很有道理，又好像什麼都沒說。');
    await S.give('c9_key_sail', 1);
    S.flag('ch9_part_sail');
    await yardPartsCheck(S);
  }
  async function yardIntro(S) {
    S.flag('ch9_shipyard_enter');
    S.setPos('player', 12, 26, 'up'); S.gather();
    await S.say('', '工寮裡，阿杉師與兩名學徒躺在草蓆上，冒著冷汗。角落燃著殘香。');
    S.face('wy_ashan', 'player');
    await S.say('阿杉師', '咳……你們是廟公派來的？');
    await S.say('阿杉師', '每晚三更，就有東西從海那邊爬進來。綠色的火……咳……');
    await S.say('阿杉師', '牠們把舵拖去木料場，帆扯去帆布坊，龍目……藏在彩繪間。');
    await S.say('yungui:serious', '瘟鬼。王船是送瘟的船，牠們當然不想讓它造好。');
    await S.say('阿杉師', '龍目要成對……瞳仁朝前，看路，不往後看。別拿錯。');
    await S.say('阿杉師', '還有……帶著艾草去。點了艾草，瘴氣就散。');
    await S.give('c9_aicao', 3);
    await S.say('hongying:think', '艾草？端午掛在門口那個？');
    await S.say('yungui:normal', '端午前後，天熱，疫病多。艾草菖蒲驅瘴，是老祖宗的辦法。');
    await S.say('tuanzi:sad', '艾草很苦，本大爺不吃。');
    await S.say('yungui:smug', '沒人叫你吃。');
    S.objective('取回王船舵、王船帆、龍目');
  }
  async function yardBoss(S) {
    S.bgm('tension');
    await S.camera(21, 13, 0.8);
    V().ch9_chiefShow = 0.01;
    await G.Tweens.to(V(), { ch9_chiefShow: 1 }, 1.0, 'linear');
    S.sfx('ghost');
    await S.say('', '船台上，未完成的王船旁，綠火聚成一團。數十隻瘟鬼疊在一起，捏成一個駝背、臃腫的影子。');
    await S.say('', '咳嗽聲，像一整個村子在咳。');
    await S.say('瘟鬼頭', '咳咳咳……王船……造好了……我們就要被載走了……');
    await S.say('瘟鬼頭', '不要……我們不要走……這裡人多……好暖……');
    await S.say('yungui:angry', '暖？你們待的地方，人都在發燒！');
    await S.say('xinghe:serious', '王船造好，你們就該走了。這是千歲爺的意思。');
    const info = { ko: false };
    const r = await S.battle('t_c9_plague_boss', { intro: async (sc) => {
      await plagueIntro()(sc);
      const kill = sc.kill.bind(sc);
      sc.kill = (u) => { if (u.side === 'party') info.ko = true; return kill(u); };
    }, bgmAfter: 'tension' });
    if (r !== 'win') { V().ch9_chiefShow = 0; return; }
    S.cameraFollow();
    await S.camera(21, 13, 0.3);
    await G.Tweens.to(V(), { ch9_chiefShow: 0 }, 1.2, 'linear');
    V().ch9_chiefShow = 0;
    S.particles([{ type: 'mist', color: '#8ad070', alpha: 0.25 }]);
    await S.say('', '瘟鬼頭散開成綠色的煙霧。煙霧繞著王船轉了一圈，被吸進船艙裡——艙門自己「喀」一聲關上。');
    S.sfx('wood');
    await S.say('tuanzi:surprise', '牠們……自己上船了？');
    await S.say('chenbo:normal', '本來就是要載走的。王船出海，就把牠們一起帶出去，帶遠一點。');
    S.flag('ch9_shipyard_clear');
    relight(S);
    await S.camera(8, 24, 1.0);
    await S.say('', '工寮那邊，阿杉師咳完最後一聲，坐了起來。');
    S.setPos('wy_ashan', 8, 24, 'up');
    await S.jump('wy_ashan', 8);
    await S.say('阿杉師', '……燒退了。');
    if (!info.ko) {
      if (!G.state.opened['wangchuan_yard:wy_east'] && !S.hasItem('c9_ac_jinzhi')) { await S.say('', '船台上，留下了一張金紙摺成的護符。'); await S.give('c9_ac_jinzhi', 1); }
      else await S.give('c9_shuanggaorun', 3);
    }
    days(S, 1);
    S.cameraFollow();
    await S.fadeOut(1.0);
    await S.narrate(['那一夜，東港的人睡得特別沉。', '天亮的時候，王船廠的大門敞開了。'], { veil: 1 });
    S.quest('q_ch9_main', 3);
    await S.warp('donggang', 44, 14, 'up', { fade: 0.01 });
  }

  // =====================================================================================================
  // MAP 6 — wangboat_deck 王船甲板（移動樞紐）
  // =====================================================================================================
  const PORTS = {
    qihou: { name: '旗後（打狗）', place: 'takao' },
    donggang: { name: '東港', place: 'donggang' },
    nanwan: { name: '南灣（恆春）', place: 'hengchun' },
    eluanbi: { name: '鵝鑾鼻', place: 'eluanbi' },
  };
  async function boardDeck(S) {
    S.sfx('step');
    await S.warp('wangboat_deck', 12, 8, 'up');
  }
  async function disembark(S) {
    const port = V().ch9_port || 'donggang';
    if (port === 'qihou') await S.warp('qihou', 44, 8, 'left');
    else if (port === 'donggang') await S.warp('donggang', 26, 25, 'up');
    else if (port === 'nanwan') await S.warp('hengchun', 24, 39, 'up');
    else if (port === 'eluanbi') await S.warp('eluanbi', 4, 12, 'right');
  }
  async function sail(S, to) {
    const from = V().ch9_port || 'donggang';
    await S.say('chenbo:serious', '起錨——');
    await S.travel(PORTS[from].place, PORTS[to].place, { label: '王船順著潮水，帆是滿的。' });
    V().ch9_port = to;
    await S.warp('wangboat_deck', 12, 7, 'up');
    S.toast(`王船泊在${PORTS[to].name}`, 'lantern');
  }
  async function helmTalk(S) {
    await S.lines([chenboLine()]);
    const cur = V().ch9_port || 'donggang';
    const opts = [];
    for (const k of ['qihou', 'donggang']) if (k !== cur) opts.push({ label: PORTS[k].name, k });
    if (F('ch9_cape_blocked') && cur !== 'nanwan') opts.push({ label: PORTS.nanwan.name, k: 'nanwan' });
    if (!F('ch9_cape_blocked')) opts.push({ label: '往南（繞過南岬）', k: 'south' });
    if (F('ch9_hengchun_done') && cur !== 'eluanbi') opts.push({ label: PORTS.eluanbi.name, k: 'eluanbi' });
    if (F('ch9_lighthouse_flame')) opts.push({ label: '出航・往東', k: 'east' });
    opts.push({ label: '不出航', k: null });
    await S.say('chenbo:normal', '要去哪？');
    const c = await S.choice(opts.map((o) => o.label), { cancel: opts.length - 1 });
    const k = opts[c] && opts[c].k;
    if (!k) return;
    if (k === 'south') { await capeBlocked(S); return; }
    if (k === 'east') {
      const ok = await S.choice(['出航（之後將無法再回到南部海域）', '再等等'], { cancel: 1 });
      if (ok === 0) await chapterEnd(S);
      return;
    }
    await sail(S, k);
    if (k === 'eluanbi' && !F('ch9_keeper_met')) {
      await S.say('chenbo:normal', '船就泊在岬下的小灣。上岸吧，燈塔就在上面。');
      await disembark(S);
    }
  }
  async function deckRest(S) {
    await S.say('', '艙口底下是船艙。添載的米袋、柴火堆得整整齊齊，很好睡。');
    const c = await S.choice(['在船艙休息', '算了'], { cancel: 1 });
    if (c !== 0) return;
    await S.fadeOut(0.6);
    G.Party.healAll();
    S.sfx('heal');
    await S.wait(0.8);
    await S.fadeIn(0.6);
    S.toast('在船艙裡睡了一覺，全員完全恢復。', 'lantern');
  }
  const deckNight = (s) => !!s.vars.ch9_deck_night;
  G.Maps.define('wangboat_deck', {
    name: '王船', subtitle: '代天巡狩', place: null, bgm: 'voyage', start: [12, 6], autosave: true,
    light: (s) => (deckNight(s) ? { ambient: s.vars.ch9_deck_dawn ? 0.3 : 0.5, color: s.vars.ch9_deck_dawn ? '#3a2040' : '#0a1030', playerR: 200 } : { ambient: 0 }),
    particles: (s) => (deckNight(s) ? ['wind', 'lanterns'] : ['wind']),
    tiles: (() => {
      const g = grid(26, 12, '~');
      g.span(3, 4, 19, 'd').span(4, 3, 21, 'd').span(5, 3, 22, 'd').span(6, 3, 22, 'd').span(7, 3, 21, 'd').span(8, 4, 19, 'd');
      g.rect(12, 9, 1, 2, 'k');
      g.rect(0, 0, 26, 1, 'w').rect(0, 11, 26, 1, 'w');
      return g.rows();
    })(),
    objects: [
      { t: 'banner', x: 12, y: 4, color: '#d8a030', text: '代天巡狩' },
      { t: 'banner', x: 12, y: 7, color: '#b0281e', text: '巡' },
      { t: 'altar', x: 18, y: 4, interact: async (S) => { S.sfx('bell'); await S.say('', '船頭的神位。木製的神位上，插著千歲爺的令旗。'); await S.saveMenu(); }, label: '參拜・存檔' },
      { t: 'cauldron', x: 21, y: 5, if: (s) => !s.flags.ch9_lighthouse_flame, interact: ['船頭燈座。燈芯是乾的，還沒點過火。', '陳伯說，要一盞「替陌生人守過夜」的火。'], label: '調查' },
      { t: 'brazier', x: 21, y: 5, if: (s) => !!s.flags.ch9_lighthouse_flame, interact: ['船頭燈靜靜地燒著，金色的光照在海面上，海底的珊瑚、魚群都看得清清楚楚。'], label: '調查', light: { r: 260, color: '#ffd27a', flicker: 0.2 } },
      { t: 'stairs_down', x: 9, y: 6 },
      { t: 'crate', x: 7, y: 3, interact: [['tuanzi:smug', '本大爺檢查過了，船艙的米很香。鹽很鹹。柴不能吃。']], label: '調查' },
      { t: 'jar', x: 8, y: 3 }, { t: 'barrel', x: 15, y: 3 }, { t: 'crate', x: 16, y: 3 },
      { t: 'barrel', x: 6, y: 8 }, { t: 'jar', x: 15, y: 8 }, { t: 'basket', x: 16, y: 8 },
      { t: 'red_lantern', x: 5, y: 3, hang: true, light: { r: 120, color: '#ffb060', flicker: 0.2 } },
      { t: 'red_lantern', x: 19, y: 3, hang: true, light: { r: 120, color: '#ffb060', flicker: 0.2 } },
    ],
    npcs: [
      { id: 'chenbo', sprite: 'chenbo', portrait: 'chenbo', name: '陳伯', x: 4, y: 5, dir: 'right', fixedDir: true, talk: async (S) => { await helmTalk(S); } },
    ],
    events: [
      { id: 'deck_rest', trigger: 'action', x: 9, y: 6, label: '休息', run: async (S) => { await deckRest(S); } },
      { id: 'deck_off', trigger: 'touch', x: 12, y: 10, run: async (S) => {
        if (F('ch9_end')) return;
        await disembark(S);
      } },
    ],
    drawGround: (ctx, t) => {
      // wake & bow spray drifting past the hull
      ctx.save();
      ctx.strokeStyle = 'rgba(230,245,255,0.35)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        const y = (1.3 + (i % 7) * 1.4) * T + Math.sin(t + i) * 6;
        const x = ((i * 173 + t * 90) % (26 * T)) ;
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 2 + i);
        ctx.beginPath(); ctx.moveTo(26 * T - x, y); ctx.lineTo(26 * T - x + 46, y); ctx.stroke();
      }
      // tiller at the stern
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#6a3a1e'; ctx.strokeStyle = '#2a140a';
      ctx.beginPath(); ctx.roundRect(3 * T + 6, 5 * T + 24, T - 4, 12, 5); ctx.fill(); ctx.stroke();
      ctx.restore();
    },
    onEnter: async (S) => { S.visit(PORTS[V().ch9_port || 'donggang'].place); },
  });

  async function deckFirst(S) {
    S.setPos('player', 12, 6, 'left'); S.gather();
    S.face('chenbo', 'right');
    await S.say('', '王船乘著潮水往外海駛去。陳伯穩穩地握著舵。');
    await S.say('chenbo:serious', '別高興太早。王船醒了，可船頭燈還沒點。');
    await S.say('chenbo:serious', '沒有燈，這船在活人的海上走得了，到了死人的海，就是瞎子。');
    await S.say('xinghe:think', '要點什麼燈？');
    await S.say('chenbo:normal', '引魂人的老規矩——要用一盞「替陌生人守過夜」的火。');
    await S.say('chenbo:normal', '照過活人，也照過死人。不為自己，只為了讓別人回得了家的火。');
    await S.say('yungui:think', '替陌生人守夜……鵝鑾鼻。島最南端那座洋人蓋的燈塔。');
    await S.say('yungui:think', '聽說叫「東亞之光」。夜夜替不認識的船照路。');
    await S.say('chenbo:normal', '就是那裡。往南，繞過南岬。');
    S.objective('往南，前往鵝鑾鼻（和陳伯說話出航）');
  }

  // C9-09 南岬逆風・泊南灣
  async function capeBlocked(S) {
    await S.travel('donggang', 'hengchun', { label: '王船沿著海岸南下。天色晴朗，海水越來越藍。' });
    V().ch9_port = 'nanwan';
    await S.warp('wangboat_deck', 12, 6, 'right');
    S.setPos('player', 12, 6, 'right'); S.gather();
    S.light({ ambient: 0.35, color: '#1a1a2a' });
    S.bgm('wind');
    S.particles([{ type: 'wind', density: 2.5 }, 'leaves']);
    S.sfx('wind'); S.shake(10, 1.0);
    await S.say('', '接近南岬時，天空突然一暗。陸地方向，一道看不見的牆從山上壓下來——落山風。');
    await S.say('', '帆被反吹，王船倒退。');
    await S.say('chenbo:angry', '抓穩！');
    S.sfx('splash'); S.shake(12, 0.8);
    await S.say('', '震動。海浪拍上了甲板。');
    await S.say('tuanzi:cry', '喵嗚嗚嗚嗚！本大爺要飛走了！');
    await S.jump('tuanzi', 30);
    await S.say('', '紅纓一把抓住糰子的尾巴。');
    await S.say('hongying:serious', '風裡……有聲音。');
    S.sfx('ghost');
    await S.say('', '風聲中，隱約有人在喊——不是一個人，是很多人。喊的像是名字，但聽不清楚。');
    await S.say('xinghe:serious', '是人在叫名字……可是每個名字都被吹碎了。');
    await S.say('chenbo:serious', '落山風。三月以後該停的，現在四月底還在吹。');
    await S.say('chenbo:serious', '這樣過不了南岬。先轉進南灣避風，上岸去恆春問問。');
    S.flag('ch9_cape_blocked');
    days(S, 2);
    S.quest('q_ch9_main', 4);
    S.objective('到恆春古城打聽落山風的事');
    await S.fadeOut(0.6);
    await S.narrate(['王船轉向，泊入南灣。海面稍稍平靜了下來。'], { veil: 1 });
    await S.warp('hengchun', 24, 39, 'up', { fade: 0.01 });
  }

  // C9-16 繞過南岬（章末）
  async function chapterEnd(S) {
    V().ch9_deck_night = true; V().ch9_deck_dawn = true;
    await S.travel('eluanbi', 'taitung', { label: '黎明前，王船繞過南岬。' });
    await S.warp('wangboat_deck', 18, 6, 'right');
    S.setPos('player', 17, 6, 'right'); S.gather();
    S.setPos('hongying', 15, 7, 'right'); S.setPos('yungui', 14, 4, 'right'); S.setPos('tuanzi', 19, 7, 'right');
    S.bgm('voyage');
    await S.say('', '黎明前。王船的船頭燈在海上亮著，像一顆落在海面上的星。');
    await S.say('', '王船繞過南岬。陸地在左手邊慢慢轉向——從往南，轉成往東，再轉成往北。');
    await S.say('chenbo:normal', '過了南岬，就是後山的海了。');
    S.light({ ambient: 0.22, color: '#10204a' });
    await S.say('', '海水的顏色忽然變了：從灰綠，變成極深極透明的藍黑色。船底下，一股巨大的暖流推著王船往北。');
    await S.say('xinghe:surprise', '這水……是暖的。');
    await S.say('chenbo:smile', '黑潮。');
    await S.say('chenbo:normal', '西邊那條黑水溝，是收人的。這一條，是送東西來的。');
    await S.say('chenbo:normal', '魚、木頭、種子、遠方的消息。……還有人。');
    S.particles(['sparkles', 'wind']);
    S.sfx('splash');
    await S.say('', '一條銀色的東西從船頭飛過——一條飛魚，張著翅膀一樣的鰭，滑過浪尖。接著兩條、十條、一百條。');
    await S.jump('tuanzi', 26);
    await S.say('tuanzi:surprise', '喵！！魚會飛！！本大爺看到神蹟了！！');
    await S.say('hongying:laugh', '哈哈哈！糰子，你口水流到甲板上了！');
    await S.say('yungui:smile', '（靠著船舷，拿出酒葫蘆喝了一口）……這倒是頭一回，看海看得高興。');
    await S.move('player', 'RR');
    S.bgm('love');
    await S.say('', '星河走到船頭燈旁。燈火映在他臉上。');
    await S.say('xinghe:normal', '（白芷。我現在在妳來的那條潮上。）');
    await S.say('xinghe:normal', '（阿順伯說，十八年前，妳也是被這條潮送上岸的。）');
    await S.say('xinghe:smile', '（妳那時候，應該也覺得很暖吧。）');
    V().ch9_deck_night = false;
    S.light({ ambient: 0 });
    S.flash('#ffe8b0', 1.2, 0.6);
    S.bgm('voyage');
    await S.say('', '日出。金色的光鋪滿海面。王船乘著黑潮，往北。');
    await S.fadeOut(1.5);
    await S.narrate(['第九章　王船南行　完'], { veil: 1 });
    S.flag('ch9_end');
    S.quest('q_ch9_main', 'done');
    await G.Story.next(S, 10);
  }

  // @@MAPS@@
})();

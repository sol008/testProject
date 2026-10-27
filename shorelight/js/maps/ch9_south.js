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
    drops: [['c9_ac_jinzhi', 1]],
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

  // @@DATA_END@@
})();

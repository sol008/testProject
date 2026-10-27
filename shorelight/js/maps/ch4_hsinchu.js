// 第四章　竹塹風起 — maps, NPCs, cutscenes, side quests, puzzles and chapter data.
// Screenplay: docs/story/ch4_hsinchu.md (canon). Builder brief: docs/BUILDER_BRIEF.md.
//
// Maps: zhuqian_coast, zhuqian (+ citygod / inn / smith / pharmacy / mifen interiors), citygod_vision,
//       hakka_road, rat_den, hakka_village, hakka_liu, yimin_temple, wuzhi_trail, xiangtian,
//       xiangtian_festival (the 矮靈祭 night: witness-only, restricted, no BGM, no saving), xiangtian_house,
//       wind_cave_1..3.
// Quests: q_ch4_main, q_yimin (心燈 lantern_yimin), q_mifen (心燈 lantern_mifen_mother), q_persimmon, q_leicha,
//         q_shange_yungui, q_tuanzi_mush (cross-chapter, defined here only if chapter 3 did not).
// Chapter flow: G.Story.ch4 (from chapter 3's G.Story.next(S, 4) or ?debug&startch=4) … 4-18 → G.Story.next(S, 5).
//
// Engine notes (all local to this chapter, nothing in the engine is modified):
//  * Battles of troops 't4_*' get an intro hook (G.Battle.start wrapper) that implements the screenplay's special
//    rules: 渡魂謠 "releases" 溺風魂 (exp only, boss loses 4% HP), 風魔's forced 風歇 / 九降・亂流 rhythm, summon
//    limits, battle hints.
//  * Wind puzzles use the `winds` map mechanic (js/engine/mapmech.js); the chime / echo / sail-stone / blade
//    puzzles use events, flags, G.state.vars and drawGround/drawOver for their visual state.
'use strict';
(function () {
  const U = G.U;
  const T = G.TILE;
  const F = (k) => !!G.state.flags[k];
  const V = () => G.state.vars;
  const AUTOPLAY = () => !!(G.Debug && G.Debug.autoplay);

  // =====================================================================================================
  // Grid builder (tile rows are generated, not hand-typed)
  // =====================================================================================================
  class Grid {
    constructor(w, h, ch) { this.w = w; this.h = h; this.a = []; for (let y = 0; y < h; y++) this.a.push(new Array(w).fill(ch)); }
    set(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.a[y][x] = c; return this; }
    get(x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.a[y][x] : null; }
    rect(x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c); return this; }
    // axis-aligned polyline of width `wd` (top-left anchored)
    line(pts, c, wd = 1) {
      for (let k = 0; k < pts.length - 1; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
        this.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + wd, Math.abs(y1 - y0) + wd, c);
      }
      return this;
    }
    ellipse(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
      return this;
    }
    // replace chars in a rect (or the whole grid)
    swap(from, to, x = 0, y = 0, w = this.w, h = this.h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (from.includes(this.get(i, j))) this.set(i, j, to); return this; }
    rows() { return this.a.map((r) => r.join('')); }
  }
  // interior room: 2-row ceiling+wall face, 1-col side walls, bottom wall with a door gap
  function room(w, h, floor, wall, doorX) {
    const g = new Grid(w, h, floor);
    g.rect(0, 0, w, 2, wall).rect(0, 0, 1, h, wall).rect(w - 1, 0, 1, h, wall).rect(0, h - 1, w, 1, wall).set(doorX, h - 1, floor);
    return g;
  }
  const many = (t, cells, extra) => cells.map(([x, y]) => Object.assign({ t, x, y }, extra || {}));

  // =====================================================================================================
  // Data: items, skills, enemies, troops, quests
  // =====================================================================================================
  const D = G.Data;
  const addItem = (id, it) => { if (!D.items[id]) D.items[id] = Object.assign({ ch: 4 }, it); };
  addItem('chaomifen', { name: '炒米粉', desc: '竹塹米粉加上紅蔥、香菇、蝦米大火快炒，細細長長，長長久久。全體回復氣血 200。', type: 'use', price: 160, icon: 'food', use: { target: 'allies', heal: 200 } });
  addItem('caibao', { name: '菜包', desc: '又叫「豬籠粄」，包著菜脯、蝦米和豬肉。回復氣血 180、真氣 20。', type: 'use', price: 70, icon: 'food', use: { target: 'ally', heal: 180, mp: 20 } });
  addItem('shibing_frost', { name: '霜柿餅', desc: '表面結了一層白白的柿霜——那是柿子自己的糖。回復真氣 100。', type: 'use', price: 110, icon: 'food', use: { target: 'ally', mp: 100 } });
  addItem('leicha_ku', { name: '苦擂茶', desc: '擂得不太成功的擂茶，苦得人皺眉。回復真氣 30。', type: 'use', price: 0, icon: 'drink', use: { target: 'ally', mp: 30 } });
  addItem('leicha_hy', { name: '紅纓擂茶', desc: '滿妹婆說這不是茶，是武器。對敵全體造成 200 點土屬性傷害。', type: 'use', price: 0, icon: 'bomb', use: { target: 'enemies', damage: 200, elem: 'earth', battle: true } });
  addItem('xitang', { name: '喜糖', desc: '阿玉喜宴上的喜糖，甜到心裡。回復氣血 100，並持續回復三回合。', type: 'use', price: 0, icon: 'food', use: { target: 'ally', heal: 100, status: { id: 'regen', chance: 1, turns: 3 } } });
  addItem('ac_shishi', { name: '柿柿如意', desc: '用紅線綁著的小柿子木雕。「柿子就係『事』，掛一粒柿子，事事如意。」', type: 'acc', price: 0, icon: 'charm', stats: { luk: 10, hp: 20 } });
  addItem('ar_qiumei', { name: '秋妹的藍衫', desc: '袖口內側繡著四行山歌。衫係愛着个，毋係愛收个。', type: 'armor', price: 0, icon: 'armor', who: ['baizhi', 'hongying'], stats: { def: 22, mag: 6, hp: 30 }, resist: ['wood'] });
  addItem('hd_yingjing', { name: '硬頸頭帕', desc: '滿妹婆年輕時紮著上山做事的頭帕。硬頸，也愛曉得轉彎。', type: 'head', price: 0, icon: 'hat', who: ['hongying'], stats: { def: 10, atk: 4 }, immune: ['stun'] });
  addItem('ac_fenggu', { name: '風骨墜', desc: '風魔消散後留下的一枚透明墜子，握著時，耳邊有乾爽的風聲。', type: 'acc', price: 0, icon: 'gem', stats: { spd: 5 }, resist: ['wood'] });
  addItem('key_qiumei_shirt', { name: '秋妹的藍衫（袖口繡字）', desc: '洗得發白的舊藍衫。反摺的袖口內側，用白線細細繡著四行山歌。', type: 'key', price: 0, icon: 'armor' });
  addItem('key_qingxu_talisman', { name: '清虛的殘符', desc: '「鎮」字少了最後一筆。符還亮著。', type: 'key', price: 0, icon: 'talisman' });
  addItem('key_lamp_shard', { name: '長明燈碎片', desc: '刻著長明宮的燈紋，底部壓著半個模糊的店號印。', type: 'key', price: 0, icon: 'lantern' });
  addItem('key_stolen_shibing', { name: '失竊的柿餅', desc: '從柿鼠大王的王座底下搶回來的一大袋柿餅。', type: 'key', price: 0, icon: 'bag' });
  addItem('key_kite', { name: '小風的風箏', desc: '卡在大榕樹樹梢的風箏，線斷了半截。', type: 'key', price: 0, icon: 'misc' });
  addItem('mat_fengxu', { name: '風精絮', desc: '九降風精散去後留下的一團白絮，輕得像米粉屑。', type: 'material', price: 40, icon: 'misc' });
  addItem('mat_shanguimao', { name: '山鬼毛', desc: '山鬼身上掉下來的粗毛，帶著一股山泥味。', type: 'material', price: 60, icon: 'misc' });
  addItem('mat_tear', { name: '溺魂淚', desc: '一顆冰涼的水珠，裡面有人在小聲哭。', type: 'material', price: 80, icon: 'gem' });
  addItem('mat_ratking_tooth', { name: '鼠王金牙', desc: '柿鼠大王的大門牙，啃柿餅啃得金黃發亮。', type: 'material', price: 600, icon: 'gem' });
  // 生死簿殘頁 (exists in items.js): the description follows the chapter (screenplay 8-5)
  if (D.items.key_ledger && !Object.getOwnPropertyDescriptor(D.items.key_ledger, 'desc').get) {
    const base = D.items.key_ledger.desc;
    Object.defineProperty(D.items.key_ledger, 'desc', {
      enumerable: true, configurable: true,
      get() {
        const st = G.state || { flags: {} };
        if (st.flags.ch4_lamp_broken) return '所有的名字都回來了，一個一個，墨色飽滿。';
        if (st.flags.ch4_yimin_done) return '泛黃的紙頁上，名字大半淡得幾乎看不見。……紙頁最後一行，多了一個新寫上去的名字：鍾阿松。';
        if (st.flags.ch4_citygod_vision) return '泛黃的紙頁上寫滿名字。有一大半，墨跡淡得幾乎看不見，像被風吹走了。';
        return base;
      },
    });
  }

  const addSkill = (id, s) => { if (!D.skills[id]) D.skills[id] = s; };
  addSkill('e_gust_spin', { name: '捲風', desc: '旋風捲住了腳。', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }], fx: 'debuff', sfx: 'wind' });
  addSkill('e_wind_cyclone', { name: '旋風', desc: '', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 0.8, fx: 'wind', sfx: 'wind' });
  addSkill('e_persimmon_throw', { name: '擲爛柿', desc: '黏呼呼的爛柿子糊了一臉。', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 0.9, buffs: [{ stat: 'def', amt: -0.3, turns: 2 }], fx: 'bite', sfx: 'hit' });
  addSkill('e_ratking_belly', { name: '肚皮彈', desc: '圓滾滾的肚皮撞了過來。', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.6, delay: 1.15, fx: 'earth', sfx: 'crit' });
  addSkill('e_ratking_gorge', { name: '狂吃柿餅', desc: '柿鼠大王抱起柿餅狂啃——吱！', mp: 0, type: 'heal', elem: null, target: 'self', power: 7, fx: 'heal', sfx: 'hit' });
  addSkill('e_ratking_call', { name: '叫小弟', desc: '吱吱！小的們！', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['e_rat_persimmon'], fx: 'summon', sfx: 'ghost' });
  addSkill('e_mountain_stomp', { name: '跺地', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemies', power: 0.8, fx: 'earth', sfx: 'earth' });
  addSkill('e_drowned_cry', { name: '哭聲', desc: '風裡全是溺死者的哭聲。', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.7, fx: 'ghost', sfx: 'ghost' });
  addSkill('e_wd_headwind', { name: '逆風陣', desc: '風向一轉，迎面壓來。', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'spd', amt: -0.3, turns: 3 }, { stat: 'atk', amt: -0.3, turns: 3 }], fx: 'wind', sfx: 'wind' });
  addSkill('e_wd_lull', { name: '風歇', desc: '風勢忽然一歇——破綻！', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'def', amt: -0.3, turns: 2 }], fx: 'debuff', sfx: 'wind' });
  addSkill('e_wd_summon', { name: '萬聲呼喚', desc: '風裡的人，被叫出來了。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['e_wind_drowned', 'e_wind_drowned'], fx: 'summon', sfx: 'ghost' });
  addSkill('e_wd_wail', { name: '萬聲哭嚎', desc: '留下來……留下來……', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.9, status: { id: 'seal', chance: 0.2, turns: 2 }, fx: 'ghost', sfx: 'ghost' });
  addSkill('e_wd_storm', { name: '九降・亂流', desc: '整座風穴的風，同時撲了過來。', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 1.4, delay: 1.2, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], fx: 'wind', sfx: 'wind' });

  // enemies — same construction as js/data/enemies.js (level curve × multipliers)
  function edef(id, d) {
    if (D.enemies[id]) return;
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
      exp: Math.max(1, Math.round(c.exp * expM)), gold: Math.max(0, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })), skills: sk(d.skills), desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale']) if (d[k] != null) e[k] = d[k];
    if (d.phases) e.phases = d.phases.map((p) => Object.assign({}, p, { skills: sk(p.skills) }));
    D.enemies[id] = e;
  }
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  edef('e_wind_sprite_wail', {
    name: '哭風精', art: 'wind_sprite', variant: 1, lv: 15, elem: 'wood', m: { hp: 0.85, atk: 0.85, mag: 1.15, spd: 1.4 },
    skills: [['e_wind_blade', 2], ['e_wind_howl', 2], ['e_gust_spin', 1]], drops: [['mat_fengxu', 0.4], ['xiangbao', 0.1]],
    desc: '風裡的哭聲聚成了形。它一邊撲人，一邊喊著一個誰也聽不清的名字。',
  });
  edef('e_wind_sprite_storm', {
    name: '亂流精', art: 'wind_sprite', variant: 2, lv: 17, elem: 'wood', resist: ['water'], m: { hp: 0.9, atk: 0.9, mag: 1.2, spd: 1.45 },
    skills: [['e_wind_cyclone', 2], ['e_wind_blade', 2], ['e_gust_spin', 1]], drops: [['mat_fengxu', 0.5], ['xumingsan', 0.08]],
    desc: '風穴深處被燈火攪亂的氣流。它沒有方向，只是一直轉、一直轉。',
  });
  edef('e_rat_persimmon', {
    name: '柿鼠', art: 'rat_demon', variant: 1, lv: 14, elem: 'water', weak: ['earth'], m: { hp: 0.8, atk: 0.95, spd: 1.3, luk: 2 },
    skills: [['e_rat_gnaw', 3], ['e_persimmon_throw', 2], ['e_rat_swarm', 1]], drops: [['shibing', 0.25], ['jiedu', 0.15]],
    desc: '偷吃柿餅吃到毛都變成橘紅色的老鼠。身上有一股甜甜的柿子味。',
  });
  edef('e_rat_king', {
    name: '柿鼠大王', art: 'rat_demon', variant: 2, lv: 15, elem: 'water', weak: ['earth'], boss: true, immune: BOSS_IMM, scale: 1.6,
    m: { hp: 6.2, atk: 1.9, mag: 1.2, def: 1.2, spd: 1.0, exp: 5, gold: 6 },
    skills: [['e_ratking_belly', 3], ['e_rat_swarm', 2], ['e_ratking_call', 1], ['e_ratking_gorge', 2, 'hp<50']],
    drops: [['mat_ratking_tooth', 1], ['shibing', 1]],
    desc: '坐在柿餅王座上的大老鼠，圓得像一顆柿子。牠堅持那三百個柿餅是「冬糧」。',
  });
  edef('e_mountain_ghost_chief', {
    name: '山鬼頭目', art: 'mountain_ghost', variant: 1, lv: 16, elem: 'earth', weak: ['wood'], resist: ['water'], m: { hp: 1.45, atk: 1.2, def: 1.15, spd: 0.95 },
    skills: [['e_mountain_rock', 2], ['e_mountain_stomp', 2], ['e_mountain_mimic', 1], ['e_heavy', 1]], drops: [['mat_shanguimao', 0.5], ['xumingsan', 0.1]],
    desc: '五指山的山鬼裡年紀最大的一個。牠會學人說話，學得最像的是「救命」。',
  });
  edef('e_cave_bat', {
    name: '風穴蝙蝠', art: 'mine_bat', variant: 1, lv: 15, elem: 'wood', m: { hp: 0.65, atk: 0.68, spd: 1.35, def: 0.8 },
    skills: [['e_bat_swarm', 3], ['e_bite', 2], ['e_bat_screech', 1]], drops: [['xiangbao', 0.15]],
    desc: '倒掛在風穴岩壁上的灰白蝙蝠。風一吹，牠們就像一片片紙灰一樣飛起來。',
  });
  edef('e_wind_drowned', {
    name: '溺風魂', art: 'sea_wisp', variant: 2, lv: 16, elem: 'water', weak: ['earth'], resist: ['fire'], m: { hp: 0.9, atk: 0.8, mag: 1.2, gold: 0 },
    skills: [['e_drown_pull', 2], ['e_drowned_cry', 2], ['e_ghost_touch', 1]], drops: [['mat_tear', 0.3]],
    desc: '被風從海上捲來的溺死者的魂，衣角化成了風絲。它不想打——它只是很冷。（白芷的渡魂謠能送它走。）',
  });
  edef('e_wind_demon', {
    name: '風魔', art: 'wind_demon', lv: 18, elem: 'wood', weak: ['metal'], resist: ['wood'], boss: true, immune: BOSS_IMM,
    m: { hp: 15.5, atk: 2.7, mag: 2.6, def: 1.15, spd: 1.4, exp: 7, gold: 8 },
    skills: [['e_wd_gust', 3], ['e_wind_howl', 2], ['e_wd_headwind', 1]],
    phases: [
      {
        at: 0.6, phase: 2, msg: '風魔的身體裡浮出一張張臉！',
        lines: [['', '留下來……／好冷……／阿母……'], ['baizhi:serious', '它們不是要傷人……它們只是被關住了！'], ['baizhi:serious', '讓我來——用渡魂謠，送它們走！']],
        summon: ['e_wind_drowned', 'e_wind_drowned'],
        skills: [['e_wd_gust', 2], ['e_wd_wail', 2], ['e_wd_summon', 2], ['e_wd_rot', 1]],
      },
      {
        at: 0.3, phase: 3, msg: '風魔的胸口裂開，長明燈露了出來！',
        lines: [['', '風魔的胸口裂開，那盞龜裂的長明燈完全露了出來。燈罩上，貼著半張燒焦的黃符。'], ['yungui:surprise', '師父的封符……還在撐！'], ['hongying:serious', '燈芯露出來了——就是現在！'], ['xinghe:serious', '白芷，等一下交給妳了！'], ['baizhi:serious', '嗯！']],
        buffs: [{ stat: 'def', amt: -0.3, turns: 99 }],
        skills: [['e_wd_inhale', 2], ['e_wd_gust', 2], ['e_wd_vortex', 1]],
      },
    ],
    drops: [['ac_fenggu', 1]],
    desc: '一盞龜裂的長明燈綁住了九降風。它的臉是千百張臉疊在一起——它說的不是「還我」，是「放我走」。',
  });
  const troop = (id, enemies, bg, bgm, extra) => { if (!D.troops[id]) D.troops[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle' }, extra || {}); };
  troop('t4_coast_intro', ['wind_sprite', 'wind_sprite'], 'hakka', 'battle', { flee: false });
  troop('t4_coast_a', ['wind_sprite', 'wind_sprite'], 'hakka');
  troop('t4_coast_b', ['wind_sprite', 'rat_spirit'], 'hakka');
  troop('t4_coast_c', ['rat_spirit', 'rat_spirit', 'rat_spirit'], 'hakka');
  troop('t4_road_a', ['wind_sprite', 'e_rat_persimmon'], 'hakka');
  troop('t4_road_b', ['e_rat_persimmon', 'e_rat_persimmon'], 'hakka');
  troop('t4_road_c', ['mountain_ghost'], 'hakka');
  troop('t4_road_d', ['wind_sprite', 'wind_sprite', 'e_rat_persimmon'], 'hakka');
  troop('t4_den_a', ['e_rat_persimmon', 'e_rat_persimmon', 'e_rat_persimmon'], 'forest');
  troop('t4_den_b', ['e_rat_persimmon', 'e_rat_persimmon', 'rat_spirit'], 'forest');
  troop('t4_ratking', ['e_rat_king', 'e_rat_persimmon', 'e_rat_persimmon'], 'forest', 'boss', { boss: true, flee: false });
  troop('t4_rack_1', ['wind_sprite', 'wind_sprite', 'wind_sprite'], 'hakka', 'battle', { flee: false });
  troop('t4_rack_2', ['e_wind_sprite_wail', 'wind_sprite', 'wind_sprite'], 'hakka', 'battle', { flee: false });
  troop('t4_rack_3', ['e_wind_sprite_wail', 'e_wind_sprite_wail', 'wind_sprite'], 'hakka', 'battle', { flee: false });
  troop('t4_trail_a', ['mountain_ghost', 'e_wind_sprite_wail'], 'mountain');
  troop('t4_trail_b', ['mountain_ghost', 'mountain_ghost'], 'mountain');
  troop('t4_trail_c', ['e_wind_sprite_wail', 'e_wind_sprite_wail', 'e_cave_bat'], 'mountain');
  troop('t4_trail_d', ['e_mountain_ghost_chief', 'mountain_ghost'], 'mountain');
  troop('t4_cave_a', ['e_wind_sprite_wail', 'e_wind_sprite_wail', 'e_cave_bat'], 'windcave');
  troop('t4_cave_b', ['e_cave_bat', 'e_cave_bat', 'e_cave_bat'], 'windcave');
  troop('t4_cave_c', ['e_wind_drowned', 'e_wind_sprite_wail'], 'windcave');
  troop('t4_cave_d', ['e_mountain_ghost_chief', 'e_cave_bat'], 'windcave');
  troop('t4_cave2_a', ['e_wind_sprite_storm', 'e_wind_drowned'], 'windcave');
  troop('t4_cave2_b', ['e_wind_sprite_storm', 'e_wind_sprite_storm', 'e_cave_bat'], 'windcave');
  troop('t4_cave2_c', ['e_wind_drowned', 'e_wind_drowned', 'e_mountain_ghost_chief'], 'windcave');
  troop('t4_echo', ['e_wind_drowned', 'e_wind_drowned', 'e_wind_drowned'], 'windcave');
  troop('t4_boss_wind_demon', ['e_wind_demon'], 'windcave', 'boss', { boss: true, flee: false });

  const Q = D.quests;
  Q.q_ch4_main = {
    name: '竹塹風起', main: true, desc: '竹塹的九降風變了。風裡有人在哭，城隍爺的帳也對不起來。',
    stages: ['前往竹塹城內的都城隍廟。', '出東門迎曦門，經柿樹坪客家庄，前往五指山。', '登五指山，找到風穴。', '再上五指山，穿過風穴口。', '回竹塹，向城隍爺稟報。', '出南門歌薰門，前往鹿港。'],
    doneText: '九降風回來了。清虛真人往鹿港去了。',
  };
  Q.q_yimin = {
    name: '嶺上松', lantern: true, desc: '義民塚前，一個年輕人的魂每夜都在唱一首沒有人回的山歌。',
    stages: ['找出能回「九降風吹嶺上松」的人。', '去問柿樹坪的滿妹婆。', '去問義民廟的古伯。', '夜裡，帶滿妹婆去義民塚回歌。'],
    doneText: '鍾阿松想起了自己的名字。',
  };
  Q.q_mifen = {
    name: '九降風裡的阿母', lantern: true, desc: '阿順伯的米粉架上，風裡有個女人在叫他的小名。',
    stages: ['夜裡陪阿順伯顧米粉架。', '讓九降風變回來。', '風轉來了——夜裡再去米粉寮看看。', '阿玉的喜宴。'],
    doneText: '最後，是好風送伊。',
  };
  Q.q_persimmon = { name: '柿柿如意', desc: '彭阿伯的柿餅少了三百個，糰子嘴角卻是橘色的。', stages: ['在柿餅寮附近調查三處線索。', '鼠窩裡有誰在啃柿餅？', '把失竊的柿餅交還彭阿伯。'], doneText: '真正的賊是柿鼠大王。' };
  Q.q_leicha = { name: '擂茶課', desc: '滿妹婆說：擂茶愛擂，正有味。', stages: ['跟滿妹婆學擂茶。'], doneText: '硬頸，也愛曉得轉彎。' };
  Q.q_shange_yungui = { name: '山歌擂台・道士篇', desc: '阿福想跟在旁邊笑了半天的道士哥對山歌。', stages: ['在禾埕跟阿福對山歌。'], doneText: '道士哥的歌像在念經，毋過押得準。' };
  if (!Q.q_tuanzi_mush) Q.q_tuanzi_mush = { name: '糰子的蕈譜', desc: '雲歸的蕈譜上有七個空格。糰子負責……試吃。', stages: ['找到蕈譜上的蕈。', '等待下一種蕈。'] };

  // regional sprite variants requested by the screenplay (8-3) — built on existing specs
  if (G.Sprites && G.Sprites.define) {
    const has = (id) => G.Sprites.has && G.Sprites.has(id);
    if (!has('c4_saisiyat_m')) G.Sprites.define('c4_saisiyat_m', { base: 'saisiyat_elder', body: 'adult', eyeStyle: 'soft', mouth: 'smile', hair: { style: 'back', color: '#1e1a1c' }, held: null });
    if (!has('c4_saisiyat_f')) G.Sprites.define('c4_saisiyat_f', { base: 'saisiyat_elder', body: 'female', eyeStyle: 'soft', mouth: 'smile', hair: { style: 'part', color: '#1e1a1c', back: 'long', len: 0.3 }, held: null });
    if (!has('c4_asong')) G.Sprites.define('c4_asong', { base: 'hakka_m', hat: { type: 'band', color: '#e8e0cc' }, held: 'hoe', ghost: true });
    if (!has('c4_amu')) G.Sprites.define('c4_amu', { base: 'ghost_f', top: { color: '#6a7a8a' } });
    if (!has('c4_bride')) G.Sprites.define('c4_bride', { base: 'villager_f', top: { color: '#c8282a', trim: '#e8b84a' }, hair: { pins: [{ type: 'flower', color: '#e83a4a' }] } });
  }

  // =====================================================================================================
  // Battle hook for chapter-4 troops (special rules from screenplay 7-2 / 7-3 / 8-4)
  // =====================================================================================================
  const RELEASABLE = { e_wind_drowned: true };
  async function releaseSpirit(b, t) {
    t.d = Object.assign({}, t.d, { gold: 0, drops: [] });
    b.popText(t, '……謝謝。', '#ffe08a');
    b.say('溺風魂：「……謝謝。」', 1.6);
    b.fx.push(new G.FX.Burst({ x: t.x, y: t.y - 80, n: 36, color: ['#ffe8a0', '#ffd070', '#ffffff'], speed: 160, life: 1.4, gravity: -90 }));
    b.kill(t);
    await b.wait(0.6);
    const boss = b.enemies.find((x) => x.id === 'e_wind_demon' && !x.dead);
    if (boss) {
      b.damage(boss, Math.max(1, Math.round(boss.mhp * 0.04)), { color: '#ffe08a', noGauge: true });
      if (!b.c4FirstRelease) {
        b.c4FirstRelease = true;
        await G.Dialog.say('', '溺風魂：……謝謝。');
        await G.Dialog.say('baizhi:smile', '回家吧。');
        G.Dialog.close();
      }
      await b.wait(0.4);
    }
  }
  function c4BattleHook(b, tid) {
    if (tid === 't4_coast_intro') b.say('九降風精屬木。金克木——紅纓的槍、雲歸的金符特別有效。', 3.2);
    if (tid === 't4_cave_c' && !F('ch4_hint_drowned')) { G.state.flags.ch4_hint_drowned = true; b.say('白芷：「它好冷……也許不用打。」', 3.2); }
    const perf0 = b.performSkill.bind(b);
    b.performSkill = async function (u, s, targets, id) {
      if (u && u.side === 'party' && id === 'bz_duhun') {
        const rel = (targets || []).filter((t) => t && !t.dead && t.side === 'enemy' && RELEASABLE[t.id]);
        if (rel.length) {
          b.banner(s.name, '#ffe6a8');
          u.pose = 'cast'; u.poseT = 0;
          await b.playFx('song', u, rel, s);
          G.Audio.sfx('sing');
          for (const t of rel) await releaseSpirit(b, t);
          u.pose = 'idle';
          const rest = targets.filter((t) => !rel.includes(t) && !t.dead);
          if (rest.length) return perf0(u, s, rest, id);
          await b.wait(0.3);
          return undefined;
        }
      }
      return perf0(u, s, targets, id);
    };
    const ai0 = b.aiCommand.bind(b);
    const mk = (e, sid) => {
      const s = D.skills[sid];
      const foes = b.alive('party');
      const targets = s.target === 'self' ? [e] : s.target === 'enemies' ? foes : [U.pick(foes)];
      return { kind: 'skill', skill: sid, targets };
    };
    b.aiCommand = function (e) {
      const st = e.c4 || (e.c4 = { n: 0, hwCd: 0, sumCd: 0, lullAt: -1, gorge: 0 });
      st.n++;
      if (st.hwCd > 0) st.hwCd--;
      if (st.sumCd > 0) st.sumCd--;
      if (e.id === 'e_wind_demon') {
        if (!st.low && e.hp < e.mhp * 0.1) { st.low = true; b.say('風魔：「……放……我……走……」', 2.6); }
        if (st.lullAt > 0 && st.n >= st.lullAt) { st.lullAt = -1; b.say('風勢忽然一歇——破綻！', 2); return mk(e, 'e_wd_lull'); }
        if (e.phase >= 3) { st.p3 = (st.p3 || 0) + 1; if (st.p3 % 3 === 0) return mk(e, 'e_wd_storm'); }
        let c = ai0(e);
        if (c.skill === 'e_wd_headwind') {
          if (st.hwCd > 0) c = mk(e, 'e_wd_gust');
          else {
            st.hwCd = 4; st.lullAt = st.n + 3;
            if (!st.hwLine) { st.hwLine = true; b.say('雲歸：「逆風！先穩住，等風歇的時候再一口氣打！」', 3); }
          }
        }
        if (c.skill === 'e_wd_summon') {
          const n = b.enemies.filter((x) => !x.dead && x.id === 'e_wind_drowned').length;
          if (n >= 2 || st.sumCd > 0) c = mk(e, 'e_wd_gust'); else st.sumCd = 3;
        }
        return c;
      }
      if (e.id === 'e_rat_king') {
        let c = ai0(e);
        if (c.skill === 'e_ratking_gorge') { if (st.gorge >= 2) c = mk(e, 'e_ratking_belly'); else st.gorge++; }
        if (c.skill === 'e_ratking_call' && b.alive('enemy').length >= 3) c = mk(e, 'e_ratking_belly');
        return c;
      }
      return ai0(e);
    };
  }
  if (G.Battle && !G.Battle.c4Hooked) {
    G.Battle.c4Hooked = true;
    const start0 = G.Battle.start;
    G.Battle.start = function (troopId, o) {
      o = o || {};
      if (typeof troopId === 'string' && /^t4_/.test(troopId) && !o.c4) {
        const intro0 = o.intro;
        o = Object.assign({}, o, { c4: true, intro: async (b) => { c4BattleHook(b, troopId); if (intro0) await intro0(b); } });
      }
      return start0.call(this, troopId, o);
    };
  }

  if (G.Sprites && G.Sprites.define && !(G.Sprites.has && G.Sprites.has('c4_manmei'))) {
    G.Sprites.define('c4_manmei', { base: 'hakka_f', body: 'elderf', eyeStyle: 'line', hair: { style: 'back', color: '#b4b0aa', knot: 'bun' }, hat: null, held: 'cane' });
  }

  // =====================================================================================================
  // Shared script helpers
  // =====================================================================================================
  const broken = (st) => !!st.flags.ch4_lamp_broken;
  async function sayAll(S, who, lines) { for (const l of lines) await S.say(who, l); }
  async function savePrompt(S, text) {
    if (text) await S.say('', text);
    const c = await S.choice(['存檔', '離開'], { cancel: 1 });
    if (c === 0) await S.saveMenu();
  }
  // a save point as an inspectable prop
  const saveStone = (x, y, text, t = 'stone_lantern') => ({ t, x, y, label: '存檔', interact: async (S) => { await savePrompt(S, text); } });
  // push the player up to n cells in a direction (stops at walls); followers are gathered afterwards
  async function pushPlayer(S, dir, n) {
    const m = G.mapScene;
    const [dx, dy] = U.dirs[dir];
    let k = 0;
    while (k < n && !m.blocked(m.player.x + dx * (k + 1), m.player.y + dy * (k + 1), m.player)) k++;
    if (!k) return;
    const L = { up: 'U', down: 'D', left: 'L', right: 'R' }[dir];
    await S.move('player', L.repeat(k), { speed: 9, ghost: true });
    S.gather();
  }
  // step the player back one cell (used by "you can't go there" boundaries)
  async function stepBack(S) {
    const m = G.mapScene;
    const back = U.opposite[m.player.dir];
    S.face('player', back);
    await pushPlayer(S, back, 1);
  }
  async function rest(S, o = {}) {
    // o: { price, labels:[morning, night], who }
    const labels = o.labels || ['歇到天光', '歇到暗暝'];
    const opts = o.price ? labels.map((l) => l).concat(['不用了']) : labels.concat(['不用了']);
    if (o.price) await S.say(o.who || '', `住一晚 ${o.price} 文。`);
    const c = await S.choice(opts, { cancel: opts.length - 1 });
    if (c === opts.length - 1) return -1;
    if (o.price) {
      if (G.state.gold < o.price) { await S.say(o.who || '', '客官，您的盤纏好像不太夠呢……'); return -1; }
      G.state.gold -= o.price;
    }
    await S.fadeOut(0.8);
    G.Music.stop(0.6);
    G.Party.healAll();
    S.sfx('heal');
    await S.wait(1.0);
    G.state.flags.ch4_s5_tried = false;
    if (o.onRest) await o.onRest(c);
    return c;
  }
  async function jiaobei(S, results, prompt) {
    return G.Mini.jiaobei({ title: '擲筊', throws: results.length, results, prompt: prompt || '誠心默禱，按 Z 擲筊' });
  }

  // ----------------------------------------------------------------------- wind guard (逆風輸入無效)
  // While a wind zone is blowing, the player cannot step against it (but can move sideways); installed per map
  // instance from onEnter.
  function installWindGuard() {
    const m = G.mapScene;
    if (!m || m.c4WindGuard) return;
    m.c4WindGuard = true;
    const blocked0 = m.blocked.bind(m);
    m.blocked = function (x, y, self) {
      if (self && self === m.player && m.def.winds) {
        const p = m.player;
        for (const w of m.def.winds) {
          if (w.if && !w.if(G.state)) continue;
          if (!m.windActive(w)) continue;
          if (!(p.x >= w.x && p.x < w.x + (w.w || 1) && p.y >= w.y && p.y < w.y + (w.h || 1))) continue;
          const [dx, dy] = U.dirs[w.dir];
          if (x - p.x === -dx && y - p.y === -dy) return true;
        }
      }
      return blocked0(x, y, self);
    };
  }
  // set a map's wind clock so that the next gust starts after `calm` seconds
  function windCalm(w, calm) {
    const m = G.mapScene;
    if (!m) return;
    const per = w.period || 3, dur = w.dur == null ? 1.2 : w.dur;
    m.windT = ((per - calm - (w.phase || 0)) % per + per) % per;
    if (m.windT < dur) m.windT = dur;
  }

  // ----------------------------------------------------------------------- 山歌擂台 (screenplay 5-2)
  const TAG = { 妙: 15, 趣: 12, 平: 7, 衝: -5 };
  // round: { call, rhyme, opp, a:[[text, tag]], b:[[text, tag, rhymes, baizhiLabel]], whisper }
  const DUEL_MAIN = [
    {
      call: '♪ 哪來細妹恁大聲，一句喊來山都驚？', rhyme: '（韻腳：ㄥ）', opp: 80,
      a: [['本姑娘就是大聲', '衝'], ['你管我聲大聲細', '衝'], ['洛家槍下無廢話', '衝']],
      b: [['再唱一句就揍你', '衝', false], ['這要押什麼韻啦', '衝', false], ['啦啦啦啦啦啦啦', '衝', false]],
    },
    {
      call: '♪ 敢係月光跌落地，還係露水變人間？', rhyme: '（韻腳：ㄢ）', opp: 72,
      a: [['月光不會落凡塵', '平'], ['我是海上漂來燈', '妙'], ['你講話怎麼這麼甜', '趣']],
      b: [['照你歸路不孤單', '妙', true, '照你歸路不孤單　♪'], ['先吃粄條再來談', '趣', true, '先吃粄條再來談　♪'], ['我也不知我是誰', '平', false]],
    },
    {
      call: '♪ 山歌唱過千百首，問妹風從哪裡來？', rhyme: '（韻腳：ㄞ）', opp: 78,
      a: [['風從海上吹過來', '平'], ['風是人心嘆一聲', '妙'], ['風從阿哥嘴裡吹', '趣']],
      b: [['嘆完花就一朵開', '妙', true, '嘆完花就一朵開　♪'], ['吹得滿山柿子歪', '趣', true, '吹得滿山柿子歪　♪'], ['這題太難換一首', '平', false]],
    },
  ];
  const DUEL_YUNGUI = [
    {
      call: '♪ 道士哥哥葫蘆大，裝酒還係裝符咒？', rhyme: '（韻腳：ㄡ）', opp: 74, whisper: '禾稈堆輕輕抖了一下。「……押ㄡ……」',
      a: [['葫蘆裝酒也裝夢', '妙'], ['你管我裝什麼', '衝'], ['裡面當然是米酒', '平']],
      b: [['醉了伸手把月偷', '妙', true], ['喝完再來跟你鬥', '平', true], ['我先睡個午覺', '趣', false]],
    },
    {
      call: '♪ 講你道法恁高強，敢會唱歌喚太陽？', rhyme: '（韻腳：ㄤ）', opp: 80, whisper: '禾稈堆輕輕抖了一下。「……押ㄤ……」',
      a: [['喚得太陽喚月亮', '妙'], ['太陽每天自己起', '趣'], ['這題太難下一題', '平']],
      b: [['再喚糰子滾山崗', '趣', true], ['順便叫你去餵羊', '衝', true], ['明天再唱也無妨', '平', true]],
    },
    {
      call: '♪ 山歌唱到日落西，看你還有幾招奇？', rhyme: '（韻腳：ㄧ）', opp: 86, whisper: '禾稈堆輕輕抖了一下。「……押ㄧ……」',
      a: [['道法自然歌自起', '妙'], ['最後一招天機符', '趣'], ['我其實不太會唱', '平']],
      b: [['唱得你我笑嘻嘻', '妙', true], ['贏了今晚你請雞', '趣', true], ['輸了請你喝一杯', '趣', false]],
    },
  ];
  // one round; returns { score, ia, ib, caught }
  async function duelRound(S, r, singer, ctx) {
    const who = singer + ':serious';
    await S.say('阿福', r.call);
    await S.say('', r.rhyme);
    let ia = 0, ib = 0, cheat = false;
    if (singer === 'yungui') {
      const c = await S.choice(['自己想詞', '偷用應聲符（禾稈堆後面……）']);
      cheat = c === 1;
    }
    if (cheat) {
      ctx.sus = (ctx.sus || 0) + 1;
      ia = r.a.reduce((bi, o, i) => (TAG[o[1]] > TAG[r.a[bi][1]] ? i : bi), 0);
      ib = r.b.reduce((bi, o, i) => (TAG[o[1]] + (o[2] ? 30 : 0) > TAG[r.b[bi][1]] + (r.b[bi][2] ? 30 : 0) ? i : bi), 0);
      await S.say('', r.whisper);
      // suspicion is judged when the singing starts
      const caught = ctx.sus >= 3 || (ctx.sus === 2 && (ctx.rng ? ctx.rng() : Math.random()) < 0.5);
      if (caught) return { caught: true, score: 0 };
    } else {
      ia = await S.choice(r.a.map((o) => o[0]));
      ib = await S.choice(r.b.map((o) => (singer === 'baizhi' && o[3] ? o[3] : o[0])));
    }
    const A = r.a[ia], B = r.b[ib];
    // 唱：rhythm part (G.Mini.song) — 紅纓's track is far too fast, 白芷 hears the tune
    const won = await G.Mini.song({
      title: '山歌擂台', opponent: '阿福', rounds: 3,
      startLen: singer === 'hongying' ? 7 : singer === 'baizhi' ? 2 : cheat ? 2 : 3,
      hint: singer === 'hongying' ? '……節奏好快！' : '聽阿福唱一句，再用方向鍵把調子唱回去',
    });
    const beat = singer === 'hongying' ? 0 : Math.round(won / 3 * 42);
    await S.say(who, A[0]);
    await S.say(who, B[0]);
    let score = TAG[A[1]] + TAG[B[1]] + (B[2] ? 30 : 0) + beat;
    if (singer === 'hongying') score = 0;
    return { score, ia, ib, A, B, beat, caught: false };
  }
  async function crowdReact(S, res) {
    if (!res.B[2]) await S.say('庄民', '……押毋著韻喔。');
    const t = res.B[1];
    if (t === '妙') await S.say('庄民', '喔——！');
    else if (t === '趣') await S.say('庄民', '哈哈哈哈！');
    else if (t === '衝') await S.say('庄民', '噓——');
  }

  // ----------------------------------------------------------------------- 擂茶 (screenplay 5-3)
  // returns 'good' | 'ok' | 'fail'
  async function leichaGame(S, who) {
    const tray = ['茶葉', '白芝麻', '花生', '南瓜子', '米香', '辣椒', '鹹魚', '冰糖'];
    const picks = [];
    await S.say('', '托盤上擺著八樣料。挑選要放進擂缽的料（最多四樣）。');
    while (picks.length < 4) {
      const left = tray.filter((t) => !picks.includes(t));
      const opts = left.concat(['開始擂']);
      const c = await S.choice(opts);
      if (opts[c] === '開始擂') break;
      if (opts[c] === '米香') { await S.say('滿妹婆', '米香係最尾撒在頂高个！'); continue; }
      picks.push(opts[c]);
    }
    const weird = picks.some((p) => ['辣椒', '鹹魚', '冰糖'].includes(p));
    const step1 = ['茶葉', '白芝麻', '花生'].every((p) => picks.includes(p));
    const hong = who === 'hongying';
    const hits = await G.Mini.timing({ title: '擂茶', rounds: 5, speed: hong ? 1.9 : 1.1, zone: hong ? 0.15 : 0.2, hint: hong ? '慢一點……再慢一點！在綠色區按下 Z' : '在力道剛好的時候按下 Z，一圈一圈慢慢擂' });
    const step2 = hits >= 3;
    if (!step2) await S.say('滿妹婆', '哎喲，慢滴仔！');
    const water = await G.Mini.timing({ title: '沖熱水', rounds: 1, speed: 0.9, zone: 0.18, hint: '水位到七、八分滿時按下 Z' });
    const step3 = water >= 1;
    const miss = (step1 ? 0 : 1) + (step2 ? 0 : 1) + (step3 ? 0 : 1);
    if (weird || miss >= 2) return 'fail';
    return miss === 0 ? 'good' : 'ok';
  }

  // =====================================================================================================
  // 1-1 zhuqian_coast 竹塹北郊・米粉曬場
  // =====================================================================================================
  const RACK_X = [20, 25, 30, 35], RACK_Y = [8, 11, 14, 17, 20];
  const coastTiles = (() => {
    const g = new Grid(48, 34, '.');
    for (let y = 0; y < 34; y++) {
      const sea = 4 + Math.round(Math.sin(y * 0.45) * 1.2);
      g.rect(0, y, sea, 1, '~').rect(sea, y, 4, 1, 's');
      g.rect(sea + 4, y, 2 + Math.round(U.hash(1, y, 4) * 2), 1, ':');
    }
    g.rect(0, 0, 3, 34, 'w');
    g.rect(13, 0, 2, 31, '=');
    g.rect(18, 6, 23, 19, ':');
    g.rect(15, 6, 3, 1, '=').rect(36, 4, 1, 3, '=');
    g.rect(15, 24, 3, 1, '=');
    g.rect(41, 9, 5, 13, ',');
    g.rect(0, 32, 48, 2, ',');
    return g.rows();
  })();
  function coastObjects() {
    const o = [
      { t: 'house_minnan', x: 34, y: 2, text: '米粉' },
      { t: 'shrine_small', x: 15, y: 13, text: '土地公' },
      { t: 'city_wall', x: 6, y: 32, w: 6 }, { t: 'gate_city', x: 12, y: 31, text: '拱宸門' }, { t: 'city_wall', x: 15, y: 32, w: 33 },
      { t: 'driftwood', x: 7, y: 27 }, { t: 'boat_small', x: 2, y: 18 },
      { t: 'basket', x: 33, y: 5, v: 1 }, { t: 'barrel', x: 39, y: 5 }, { t: 'jar', x: 40, y: 4 },
      { t: 'signboard', x: 12, y: 2, text: '往艋舺' },
    ];
    for (const x of RACK_X) for (const y of RACK_Y) o.push({ t: 'drying_rack', x, y, v: 0 });
    for (let x = 18; x <= 40; x += 2) if (x !== 24 && x !== 30) o.push({ t: 'bamboo', x, y: 26 });
    for (let y = 2; y <= 22; y += 2) o.push({ t: 'bamboo', x: 46, y });
    for (const [x, y] of [[10, 2], [11, 8], [9, 12], [11, 16], [10, 23], [16, 3], [16, 9], [17, 19], [12, 27], [16, 28], [43, 28], [20, 29], [8, 30]]) o.push({ t: 'tallgrass', x, y });
    for (const [x, y] of [[10, 5], [9, 18], [11, 29], [42, 25], [44, 3]]) o.push({ t: 'silvergrass', x, y });
    for (const [x, y] of [[44, 12], [43, 20], [42, 30]]) o.push({ t: 'tree_pine', x, y });
    o.push({ t: 'table', x: 32, y: 7, w: 2, if: (st) => !!st.flags.ch4_wedding_now }, { t: 'table', x: 39, y: 7, w: 2, if: (st) => !!st.flags.ch4_wedding_now });
    o.push({ t: 'red_lantern', x: 35, y: 5, hang: true, if: (st) => !!st.flags.ch4_wedding_now }, { t: 'red_lantern', x: 38, y: 5, hang: true, if: (st) => !!st.flags.ch4_wedding_now });
    return o;
  }
  const coastLight = (st) => (st.flags.ch4_coast_night ? { ambient: 0.65, color: '#0a1030', playerR: 260 }
    : broken(st) ? { ambient: 0.1, color: '#1a2838' } : { ambient: 0.25, color: '#24323e' });
  const windyParticles = (st, extra) => (broken(st) ? [{ type: 'wind', density: 0.4 }].concat(extra || [])
    : [{ type: 'wind', density: 1.6 }, 'leaves', { type: 'motes', density: 0.5 }].concat(extra || []));

  async function scene401(S) {
    S.flag('ch4_start');
    await S.wait(0.4);
    await S.say('xinghe:surprise', '哇啊——這風！我的頭髮要被吹回九份了！');
    await S.say('yungui:smug', '竹風蘭雨。竹塹的風、蘭陽的雨，出了名的。');
    await S.say('yungui:normal', '每年九月起東北風，一路吹到過年，竹塹人叫它「九降風」。');
    await S.say('yungui:think', '師父在信裡說「竹塹風大，記得帶傘」……這種風，撐傘會被一起吹上天吧。');
    S.sfx('wind');
    await S.jump('tuanzi', 30);
    await S.say('', '糰子被吹得在地上翻了兩圈，一把抱住紅纓的小腿。');
    await S.say('tuanzi:cry', '救命——！本大仙要被吹去唐山了！');
    S.emote('hongying', '♪');
    await S.say('hongying:shy', '……抓、抓緊一點也沒關係。');
    await S.say('xinghe:smug', '紅纓，妳嘴角在笑喔。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '閉嘴，笨蛋！是風太大，臉被吹歪了！');
    S.sfx('wind');
    S.emote('baizhi', '…');
    await S.wait(0.6);
    await S.say('baizhi:think', '……星河。風裡，有人在說話。');
    await S.narrate(['「好冷……」', '「船……翻了……」', '「阿母——」'], { veil: 0.45 });
    await S.say('xinghe:surprise', '我也聽到了……那不只是風聲。');
    await S.say('yungui:serious', '不對。九降風是乾的、是乾淨的。竹塹人靠它曬米粉、曬柿餅。');
    await S.say('yungui:serious', '這陣風……又濕又鹹，聞起來像海底。');
    await S.camera(21, 10, 0.9);
    S.emote('ashun', '💢');
    await S.say('阿順伯', '夭壽喔！又酸了！這一架攏總臭酸去啦！');
    await S.say('', '米粉架上方，幾團半透明、帶著藍光的旋風撲了下來——九降風精。');
    S.cameraFollow();
    await S.move('player', 'DDDDDDRRRR');
    S.face('player', 'right');
    await S.say('hongying:serious', '有東西在啃那些米粉！');
    await S.say('xinghe:angry', '喂——那是人家的米粉！');
    await S.battle('t4_coast_intro');
    S.face('ashun', 'left');
    await S.say('', '阿順伯拄著晾米粉的竹竿喘氣。');
    await S.say('阿順伯', '多謝喔，少年仔。好佳哉有你們……不然今年連一斤米粉都交不出去。');
    await S.say('baizhi:think', '米粉……是那個細細白白、像頭髮一樣的東西嗎？');
    await S.say('阿順伯', '哈！是啦。在來米泡水、磨漿、壓乾、蒸熟，再擠成一絲一絲。');
    await S.say('阿順伯', '最後一步上要緊——三分日曬，七分風。竹塹米粉好吃，靠的就是九降風。');
    await S.say('阿順伯', '可是今年……中秋過後風就變了。風吹到哪，米粉就酸到哪。');
    await S.say('阿順伯', '暗時還會聽到有人在風裡哭。城裡的人說，城隍廟的大算盤，半暝自己在響。');
    await S.say('yungui:think', '城隍……');
    await S.say('yungui:serious', '師父每到一座城，必先去拜當地的城隍爺。他若經過竹塹，城隍廟一定知道。');
    await S.say('xinghe:smile', '那就先去城隍廟！阿伯，城門往哪走？');
    await S.say('阿順伯', '沿路往南，看到拱宸門就是北門。都城隍廟在城內正中央，香火上旺那間。');
    await S.say('阿順伯', '有閒來我的米粉寮坐坐，請你們食米粉湯。');
    await S.give('mifentang', 2);
    S.flag('ch4_arrive_zhuqian'); S.flag('ch4_mifen_met');
    S.quest('q_ch4_main', 0);
    S.objective('前往竹塹城內的都城隍廟');
  }

  // S2 九降風裡的阿母
  async function mifenPart1(S) {
    await S.say('阿順伯', '少年仔，拜託一件代誌……今暗陪我顧米粉架，好無？');
    await S.say('阿順伯', '這批米粉，是要給阮查某囝阿玉嫁娶用的。');
    const c = await S.choice(['好！', '等一下'], { cancel: 1 });
    if (c !== 0) { await S.say('阿順伯', '好，好。暗時我攏佇遮。'); return; }
    S.quest('q_mifen', 0);
    await S.fadeOut(0.8);
    S.flag('ch4_coast_night');
    await S.warp('zhuqian_coast', 23, 16, 'right', { fade: 0, reload: true });
    await S.fadeIn(0.8);
    await S.say('', '夜。月光下的米粉架，像一片銀色的網。');
    await S.say('阿順伯', '喜宴無炒米粉，就毋成喜宴。長長的米粉，就是長長久久。');
    await S.say('baizhi:think', '吃很長的東西，就會活很久嗎？');
    await S.say('xinghe:smile', '是祝福啦。');
    await S.say('baizhi:smile', '那我要吃很多很多。');
    S.sfx('wind');
    S.shake(4, 0.6);
    await S.narrate(['「阿順仔——轉來食飯喔——」'], { veil: 0.4 });
    S.emote('ashun', '!');
    await S.say('阿順伯', '……阿母？');
    await S.say('hongying:serious', '風精又來了！保護米粉架！');
    await S.battle('t4_rack_1', { bgmAfter: 'battle' });
    await S.say('', '第二波！風精從架子另一頭撲過來！');
    await S.battle('t4_rack_2', { bgmAfter: 'battle' });
    await S.say('', '最後一波——風裡的哭聲越來越近！');
    await S.battle('t4_rack_3', { bgmAfter: 'night' });
    await S.say('', '阿順伯坐在米粉架下。');
    await S.say('阿順伯', '歹勢……讓你們見笑了。');
    await S.say('阿順伯', '我六歲那年，跟阿爸阿母坐船過黑水溝。');
    await S.say('阿順伯', '船翻了。阿爸抱著我爬上一塊船板……阿母，就沒再浮起來。');
    await S.say('阿順伯', '人講「六死三留一回頭」。阮阿母，就是那「六死」裡面的一個。');
    await S.say('阿順伯', '這個月，風裡一直有人叫我的小名。我知影是伊。');
    await S.say('阿順伯', '可是那個聲……好冷。親像被什麼綁住了。');
    await S.say('baizhi:sad', '她被困在風裡了。');
    await S.say('xinghe:serious', '阿伯，我們會讓風變回來。到時候……她就能走了。');
    await S.say('阿順伯', '……拜託你們。');
    await S.give('mifentang', 3);
    await S.give('chaomifen', 2);
    S.flag('ch4_mifen_defend');
    S.quest('q_mifen', 1);
    await S.fadeOut(0.8);
    S.flag('ch4_coast_night', false);
    await S.warp('zhuqian_coast', 36, 7, 'up', { fade: 0, reload: true });
    await S.fadeIn(0.8);
  }
  async function mifenPart2(S) {
    if (!F('ch4_mifen_defend')) {
      // the lamp was broken before the night watch: the screenplay's second night only
      await S.say('阿順伯', '少年仔，拜託一件代誌……這批米粉，是要給阮查某囝阿玉嫁娶用的。');
      await S.say('阿順伯', '這個月，風裡一直有人叫我的小名。是阮阿母。……伊六十冬前，沉落黑水溝。');
      S.flag('ch4_mifen_defend');
    }
    await S.say('阿順伯', '風轉來了。少年仔……今暗，閣陪我一下好無？');
    const c = await S.choice(['今暗再來', '等一下'], { cancel: 1 });
    if (c !== 0) { await S.say('阿順伯', '好，暗時我攏佇遮。'); return; }
    S.quest('q_mifen', 2);
    await S.fadeOut(0.8);
    S.flag('ch4_coast_night');
    await S.warp('zhuqian_coast', 23, 16, 'right', { fade: 0, reload: true });
    await S.fadeIn(0.8);
    await S.say('', '夜。乾爽的九降風吹過，米粉在月光下白得發亮。');
    await S.say('阿順伯', '風轉來了。米粉也乾得真媠。');
    await S.say('阿順伯', '……可是阿母的聲，也無去了。我竟然……有一點寂寞。');
    await S.say('baizhi:think', '阿伯，她還沒走遠。');
    await S.say('baizhi:smile', '城隍爺那裡，正在幫大家報到。她經過這裡，是想再看你一眼。');
    S.sfx('sing');
    await S.wait(0.8);
    S.spawn({ id: 'amu', sprite: 'c4_amu', x: 27, y: 15, dir: 'left', ghost: true });
    const amu = S.actor('amu');
    if (amu) { amu.alpha = 0; await S.fadeActor('amu', 0.9, 1.2); }
    await S.say('阿母', '阿順仔。');
    await S.say('阿順伯', '……阿母……');
    await S.say('阿母', '你米粉曬甲足媠。阿母攏有看到。');
    await S.say('阿母', '彼陣風傷冷，阿母毋甘走……今仔日的風燒燒，阿母會使安心行矣。');
    await S.say('阿順伯', '阿母，我、我欲娶……毋是，是阿玉欲嫁矣！');
    await S.say('阿母', '憨囝。替阿母共阿玉講，恭喜。');
    await S.say('阿母', '阿母先行。你慢慢仔來，毋通赴。');
    await S.fadeActor('amu', 0, 1.4);
    S.remove('amu');
    await S.say('', '一點暖光升起，隨風往城隍廟的方向飄去。');
    await S.say('阿順伯', '……好佳哉。最後，是好風送伊。');
    await S.say('阿順伯', '阿玉的喜宴，你們一定要來！');
    S.flag('ch4_mifen_mother');
    S.quest('q_mifen', 3);
    await S.lantern('lantern_mifen_mother', '九降風裡的阿母');
    await S.fadeOut(0.8);
    S.flag('ch4_coast_night', false);
    await S.warp('zhuqian_coast', 36, 7, 'up', { fade: 0, reload: true });
    await S.fadeIn(0.8);
  }
  async function mifenWedding(S) {
    await S.say('阿順伯', '阿玉的喜宴，就在米粉寮頭前！來，入座！');
    await S.fadeOut(0.8);
    await S.narrate(['數日後'], { veil: 1 });
    S.flag('ch4_wedding_now');
    await S.warp('zhuqian_coast', 36, 8, 'up', { fade: 0, reload: true });
    await S.fadeIn(0.8);
    S.sfx('coin');
    await S.say('', '米粉寮前擺了桌，紅布、鞭炮、熱騰騰的炒米粉。');
    await S.say('阿玉', '我阿爸講，是你們讓風轉來的。多謝！');
    await S.say('baizhi:think', '長長的米粉……我吃了三碗，是不是可以活三倍久？');
    await S.say('yungui:smug', '會胖三倍。');
    await S.say('tuanzi:smile', '本大仙要活二十一倍久。');
    await S.say('hongying:laugh', '你會滾著走。');
    await S.say('阿順伯', '來來來，帶回去路上食！');
    await S.give('chaomifen', 5);
    await S.give('xitang', 3);
    S.gold(500);
    S.flag('ch4_mifen_wedding');
    S.quest('q_mifen', 'done');
    await S.fadeOut(0.6);
    S.flag('ch4_wedding_now', false);
    await S.warp('zhuqian_coast', 36, 7, 'down', { fade: 0, reload: true });
    await S.fadeIn(0.6);
  }

  G.Maps.define('zhuqian_coast', {
    name: '竹塹北郊', subtitle: '米粉曬場', place: 'hsinchu',
    bgm: (st) => (st.flags.ch4_coast_night ? 'night' : broken(st) ? 'city' : 'wind'),
    start: [13, 4],
    light: coastLight,
    particles: (st) => (st.flags.ch4_coast_night ? [{ type: 'wind', density: broken(st) ? 0.4 : 1.2 }, 'fireflies'] : windyParticles(st)),
    tiles: coastTiles,
    objects: coastObjects,
    onEnter: async () => { installWindGuard(); },
    chests: [
      { id: 'c4_01', x: 8, y: 4, item: 'jinchuang', n: 3 },
      { id: 'c4_02', x: 42, y: 16, gold: 200 },
      { id: 'c4_03', x: 6, y: 26, item: 'xiangbao', n: 2 },
    ],
    npcs: [
      {
        id: 'ashun', sprite: 'old_m', name: '阿順伯', x: 37, y: 6, dir: 'down',
        pos: (st) => (st.flags.ch4_coast_night ? [25, 16] : !st.flags.ch4_start ? [19, 9] : st.flags.ch4_wedding_now ? [37, 6] : [37, 6]),
        talk: async (S) => {
          if (F('ch4_mifen_wedding')) { await S.say('阿順伯', '這幾天的米粉，是我這輩子曬過上白的。'); return; }
          if (F('ch4_mifen_mother')) { await mifenWedding(S); return; }
          if (broken(G.state)) { await mifenPart2(S); return; }
          if (F('ch4_mifen_defend')) { await S.say('阿順伯', '今暗風擱來，我就坐在這裡等。……毋是等風精，是等那個聲。'); return; }
          if (F('ch4_citygod_vision')) { await mifenPart1(S); return; }
          await S.say('阿順伯', '米粉愛有好風。這陣風，無彩我一世人的手藝。');
          await S.say('阿順伯', '晚上莫在曬場睏，風裡有人在叫名。');
        },
      },
      { id: 'ayu', sprite: 'c4_bride', name: '阿玉', x: 38, y: 8, dir: 'up', if: (st) => !!st.flags.ch4_wedding_now, talk: ['我阿爸講，是你們讓風轉來的。多謝！'] },
      {
        id: 'awang', sprite: 'villager_m', name: '阿旺', x: 23, y: 12, dir: 'down', wander: 2, if: (st) => !st.flags.ch4_coast_night,
        talk: async (S) => {
          if (broken(G.state)) await S.say('阿旺', '哇，你聞！這才是九降風，乾到會咬人！');
          else await sayAll(S, '阿旺', ['擠米粉要力，曬米粉要天。今年天毋幫忙，風也毋幫忙。', '你看這架，黃黃臭酸，連狗都毋食。']);
        },
      },
      {
        id: 'achun', sprite: 'villager_f', name: '阿春', x: 33, y: 16, dir: 'left', wander: 2, if: (st) => !st.flags.ch4_coast_night,
        pos: (st) => (st.flags.ch4_wedding_now ? [34, 8] : [33, 16]),
        talk: async (S) => {
          if (broken(G.state)) await S.say('阿春', '白拋拋！今年過年有炒米粉了！');
          else await sayAll(S, '阿春', ['米粉一把一把攤在竹篩上，像在曬月光。', '今年攤上去，隔天就黃了。阿順伯半夜都睏袂去。']);
        },
      },
      {
        id: 'fisher', sprite: 'fisherman', name: '漁夫', x: 7, y: 20, dir: 'left', if: (st) => !st.flags.ch4_coast_night,
        talk: async (S) => {
          if (broken(G.state)) await S.say('漁夫', '今早出海，網底一尾一尾活跳跳。好佳哉，好佳哉。');
          else await sayAll(S, '漁夫', ['南寮的船攏無出海。網撒落去，撈起來的毋是魚，是哭聲。', '我阿公講，九降風起，魚就肥。今年……唉。']);
        },
      },
      {
        id: 'xiaofeng', sprite: 'child_m', name: '小風', x: 17, y: 25, dir: 'up', wander: 1, if: (st) => !st.flags.ch4_coast_night,
        talk: async (S) => {
          if (S.hasItem('key_kite')) {
            await S.say('小風', '我的風箏！是你幫我拿下來的喔？多謝！');
            S.take('key_kite');
            await S.say('小風', '這個給你。阿嬤說，迷路的時候點起來，魂就找得到回家的路。');
            await S.give('huanhunxiang', 1);
            S.flag('ch4_kite');
            return;
          }
          if (broken(G.state)) {
            await S.say('小風', '你看！今天的風會把風箏往天上推，不會往山裡拉了！');
            if (F('ch4_kite')) await S.say('小風', '是你幫我拿下來的喔？多謝！');
            return;
          }
          if (F('ch4_kite')) { await S.say('小風', '阿嬤講，風在拉風箏，是因為風也想要人陪。'); return; }
          await sayAll(S, '小風', ['我的風箏！風一吹，就往山那邊拉，線都扯斷了！', '阿嬤講，風在拉風箏，是因為風也想要人陪。']);
        },
      },
    ],
    enemies: [
      { id: 'cw1', troop: 't4_coast_a', x: 10, y: 9, art: 'wind_sprite', radius: 3, lv: 14, if: (st) => !broken(st) && !st.flags.ch4_coast_night },
      { id: 'cw2', troop: 't4_coast_b', x: 11, y: 21, art: 'wind_sprite', radius: 3, lv: 14, if: (st) => !broken(st) && !st.flags.ch4_coast_night },
      { id: 'cr1', troop: 't4_coast_c', x: 9, y: 14, art: 'rat_demon', radius: 2, lv: 12, if: (st) => !st.flags.ch4_coast_night },
    ],
    events: [
      { id: 'c4_401', trigger: 'auto', if: (st) => !st.flags.ch4_start, run: scene401 },
      { id: 'north_block', trigger: 'touch', x: 13, y: 1, w: 2, h: 1, run: async (S) => { await S.say('xinghe:think', '回頭路……還是先辦正事吧。'); await stepBack(S); } },
      {
        id: 'shrine', trigger: 'action', x: 15, y: 13, w: 2, h: 2, label: '參拜',
        run: async (S) => { await savePrompt(S, broken(G.state) ? '香煙直直往上，像在點頭。' : '小小的土地公祠。香爐裡的香，煙全往東邊歪。'); },
      },
    ],
    warps: [
      { x: 13, y: 32, to: 'zhuqian', tx: 27, ty: 2, tdir: 'down' },
      { x: 36, y: 4, to: 'zhuqian_mifen', tx: 8, ty: 8, tdir: 'up', door: true },
    ],
  });

  // ----------------------------------------------------------------------- 1-5 zhuqian_mifen 阿順伯米粉寮
  G.Maps.define('zhuqian_mifen', {
    name: '阿順伯米粉寮', subtitle: '竹塹北郊', place: 'hsinchu', bgm: (st) => (broken(st) ? 'city' : 'wind'),
    start: [8, 8], light: { ambient: 0.3, color: '#2a1a10' }, particles: [{ type: 'dust', density: 0.5 }],
    tiles: room(16, 10, '_', 'W', 8).rows(),
    objects: [
      { t: 'stove', x: 2, y: 2 }, { t: 'pot', x: 4, y: 2 }, { t: 'pot', x: 5, y: 2 }, { t: 'pot', x: 6, y: 2 },
      { t: 'workbench', x: 2, y: 5 }, { t: 'mill_stone', x: 5, y: 5 }, { t: 'jar_row', x: 1, y: 7, w: 2 },
      { t: 'drying_rack', x: 9, y: 4, v: 0 }, { t: 'drying_rack', x: 9, y: 6, v: 0 },
      {
        t: 'altar', x: 12, y: 2, label: '調查',
        interact: ['小小的神明桌。邊上一塊小小的木牌位，寫著「顯妣 林氏」。', '香爐裡插著三炷香。'],
      },
      { t: 'basket', x: 14, y: 5, v: 2 }, { t: 'bucket', x: 13, y: 7 },
    ],
    npcs: [
      {
        id: 'achun_in', sprite: 'villager_f', name: '阿春', x: 6, y: 6, dir: 'down', if: (st) => !!st.flags.ch4_mifen_mother,
        talk: ['阿順伯這幾日笑甲嘴攏合袂起來。', '阿玉的炒米粉，是我同阿順伯透早炒的！'],
      },
    ],
    warps: [{ x: 8, y: 9, to: 'zhuqian_coast', tx: 36, ty: 5, tdir: 'down', door: true }],
  });

  // =====================================================================================================
  // 1-2 zhuqian 竹塹城
  // =====================================================================================================
  const cityTiles = (() => {
    const g = new Grid(56, 44, ':');
    g.rect(0, 0, 56, 2, 'R').rect(0, 42, 56, 2, 'R').rect(0, 0, 1, 44, 'R').rect(55, 0, 1, 44, 'R');
    g.rect(26, 0, 3, 2, '=').rect(26, 42, 3, 2, '=').rect(0, 20, 1, 3, '=').rect(55, 20, 1, 3, '=');
    // yards & gardens
    g.rect(2, 3, 52, 4, ',').rect(2, 28, 16, 12, ',').rect(38, 30, 16, 10, ',').rect(2, 12, 10, 7, ',');
    // streets
    g.rect(26, 2, 3, 12, '=');
    g.line([[23, 13], [32, 13]], '=', 2);
    g.rect(23, 13, 2, 7, '=').rect(31, 13, 2, 7, '=');
    g.rect(1, 21, 54, 2, '=');
    g.rect(5, 10, 46, 1, '=');
    g.rect(26, 27, 3, 15, '=');
    g.rect(9, 33, 24, 1, '=').rect(12, 32, 1, 1, '=');
    g.rect(36, 34, 15, 1, '=');
    // plaza
    g.rect(19, 19, 19, 9, '%');
    return g.rows();
  })();
  const soulLamp = (x, y) => ({ t: 'soul_jar', x, y, if: (st) => !broken(st) });
  function cityObjects() {
    const o = [
      { t: 'gate_city', x: 26, y: 0, text: '拱宸門' }, { t: 'gate_city', x: 26, y: 42, text: '歌薰門' },
      { t: 'signboard', x: 54, y: 19, text: '迎曦門' }, { t: 'signboard', x: 1, y: 19, text: '挹爽門' },
      { t: 'city_god_temple', x: 25, y: 15, door: 2, text: '都城隍廟' },
      { t: 'shophouse', x: 8, y: 7, text: '竹風客棧' }, { t: 'shophouse', x: 38, y: 7, text: '打鐵舖', v: 2 }, { t: 'shophouse', x: 45, y: 7, text: '回春堂', v: 1 },
      { t: 'house_minnan', x: 10, y: 30, v: 1 }, { t: 'house_minnan', x: 17, y: 30, v: 0 },
      { t: 'house_minnan', x: 13, y: 12, v: 1 }, { t: 'shophouse', x: 40, y: 13, v: 3 },
      { t: 'shophouse', x: 36, y: 31, v: 0 }, { t: 'house_minnan', x: 43, y: 31, v: 1 }, { t: 'house_jiufen', x: 2, y: 13, v: 2 },
      soulLamp(17, 15), soulLamp(42, 16), soulLamp(19, 33), soulLamp(38, 34), soulLamp(46, 34), soulLamp(4, 16),
      { t: 'tree_banyan', x: 4, y: 23 },
      { t: 'stall', x: 20, y: 22, text: '米粉湯' }, { t: 'stall', x: 24, y: 24, text: '柿餅', v: 1 }, { t: 'stall', x: 33, y: 23, text: '長明燈', v: 2 },
      { t: 'soul_jar', x: 32, y: 23, if: (st) => !broken(st) }, { t: 'soul_jar', x: 35, y: 23, if: (st) => !broken(st) },
      { t: 'lantern_string', x: 19, y: 20, w: 8 }, { t: 'lantern_string', x: 29, y: 20, w: 8 },
      { t: 'incense_burner', x: 29, y: 20 }, { t: 'well', x: 32, y: 29 },
      { t: 'jar', x: 30, y: 11 }, { t: 'jar', x: 32, y: 11 }, { t: 'jar', x: 33, y: 12 },
      { t: 'crate', x: 51, y: 17 }, { t: 'crate', x: 53, y: 17 }, { t: 'crate', x: 51, y: 18 }, { t: 'barrel', x: 53, y: 18 },
      { t: 'basket', x: 23, y: 25, v: 1 }, { t: 'bench', x: 34, y: 26 },
      { t: 'stone_lantern', x: 24, y: 19 }, { t: 'stone_lantern', x: 31, y: 19 },
      { t: 'statue_lion', x: 25, y: 19 }, { t: 'statue_lion', x: 30, y: 19, flip: true },
    ];
    for (const [x, y] of [[3, 4], [8, 4], [16, 4], [36, 4], [44, 4], [51, 4], [3, 38], [7, 39], [15, 38], [41, 38], [50, 38], [52, 30], [2, 30], [34, 37]]) o.push({ t: 'tree_camphor', x, y });
    for (const [x, y] of [[20, 4], [32, 4], [12, 4], [48, 4], [5, 36], [12, 37], [45, 37], [40, 37]]) o.push({ t: 'flowers', x, y });
    for (const [x, y] of [[22, 5], [33, 5], [9, 26], [48, 27], [3, 27]]) o.push({ t: 'bush', x, y });
    return o;
  }
  async function scene402(S) {
    S.flag('ch4_enter_city');
    await S.wait(0.3);
    S.face('gate_n', 'player');
    await S.say('守城兵', '入城喔？風大，看好身上的東西。');
    await S.camera(27, 12, 1.2);
    await S.say('', '家家戶戶門口掛著小小的白燈，燈芯是淡藍色的火，在風裡一動也不動。');
    S.cameraFollow();
    await S.say('baizhi:think', '那些燈……風這麼大，火卻不會晃。而且是藍色的。');
    await S.say('yungui:serious', '府城長明宮的「長明燈」。聽說能擋鬼，最近賣到北部來了。');
    await S.say('xinghe:serious', '長明宮……九份那晚的墨鴉，就是長明宮的人。');
    await S.say('hongying:serious', '那還等什麼，把燈全砸了。');
    await S.say('yungui:normal', '然後被全城的人追著打？先弄清楚再說。');
  }
  async function scene403(S) {
    await S.say('溫先生', '諸位遠來辛苦。風大，請一盞長明燈回去吧，可保家宅平安。');
    await S.say('溫先生', '玄冥法師慈悲。他說：思念之人，不該被風吹散。');
    await S.say('溫先生', '燈裡收著的，是迷途的魂。我們替他們照路，讓他們不必再受風寒。');
    await S.say('baizhi:think', '……可是，被收起來的魂，要怎麼回家？');
    await S.say('溫先生', '家？姑娘，留在燈裡，就是家了。');
    await S.say('', '白芷不自覺地退了半步。星河擋到她前面。');
    const c = await S.choice(['一盞多少錢？', '我們不需要。']);
    if (c === 0) {
      await S.say('溫先生', '隨喜即可。');
      await S.say('xinghe:think', '……隨喜是多少？');
      await S.say('溫先生', '三百文。');
      await S.say('xinghe:smile', '那我不太喜。');
    } else await S.say('溫先生', '無妨。風會改變人的心意的。');
    await S.say('yungui:think', '那盞燈的火……一直朝東邊歪。像是被什麼東西拉著。');
    S.flag('ch4_changming_stall_seen');
  }
  async function scholarLecture(S) {
    await S.say('老秀才', '風好，讀書也好。你們要不要聽老夫講一段竹塹建城史？');
    const c = await S.choice(['好', '下次'], { cancel: 1 });
    if (c !== 0) { await S.say('老秀才', '唉，年輕人。'); return; }
    await S.fadeOut(0.6);
    await S.narrate(['一個時辰後'], { veil: 1 });
    await S.fadeIn(0.6);
    await S.say('老秀才', '……以上，是第一卷。');
    await S.say('', '糰子趴在地上打呼。');
    await S.say('xinghe:think', '（第一卷……？）');
    await S.say('老秀才', '肯聽完的年輕人，越來越少了。這支筆送你們。讀萬卷書，行萬里路。');
    await S.give('ac_maobi', 1);
    S.flag('ch4_scholar_gift');
  }
  async function scene418(S) {
    const c = await S.choice(['前往鹿港', '再等一下'], { cancel: 1 });
    if (c !== 0) return false;
    await S.fadeOut(0.6);
    S.bgm('pingxi');
    S.hideFollowers(true);
    await S.warp('zhuqian', 27, 38, 'down', { fade: 0 });
    S.spawn({ id: 'f_bz', sprite: 'baizhi', x: 27, y: 40, dir: 'down' });
    S.spawn({ id: 'f_yg', sprite: 'yungui', x: 26, y: 39, dir: 'down' });
    S.spawn({ id: 'f_tz', sprite: 'tuanzi', x: 28, y: 39, dir: 'down' });
    S.spawn({ id: 'f_hy', sprite: 'hongying', x: 27, y: 36, dir: 'down' });
    await S.fadeIn(0.8);
    await S.say('', '竹塹南門・歌薰門。九降風從背後吹來，乾爽而有力。');
    await S.say('xinghe:smile', '順風耶！');
    await S.say('yungui:normal', '九降風一路往南吹。我們算是被它送一程。');
    await S.say('tuanzi:smile', '本大仙……也被柿餅送一程……');
    await S.say('baizhi:smile', '風也會送人嗎？');
    await S.say('xinghe:smile', '會啊。好的風就會。');
    await S.say('', '紅纓走在最後面，一直沒說話。');
    S.face('player', 'up');
    await S.say('', '星河放慢腳步，走到她旁邊。');
    await S.say('xinghe:normal', '紅纓。');
    await S.say('hongying:serious', '……三年了。我沒有回過鹿港。');
    await S.say('hongying:sad', '夏爺爺說，只記得恨，人會被恨吃掉。');
    await S.say('hongying:sad', '我不知道……我是不是已經被吃掉一半了。');
    await S.say('xinghe:smile', '那剩下的一半，我們幫妳顧著。');
    await S.say('hongying:shy', '……笨蛋。');
    await S.say('baizhi:smile', '星河、紅纓，快一點！雲歸說前面有賣牛舌餅！');
    await S.say('yungui:smug', '我說的是「鹿港有」，不是「前面有」。');
    await S.say('baizhi:surprise', '……前面和鹿港，不一樣嗎？');
    S.move('f_bz', 'DD', { wait: false }); S.move('f_yg', 'DD', { wait: false }); S.move('f_tz', 'DD', { wait: false });
    S.move('f_hy', 'DD', { wait: false });
    await S.move('player', 'DD');
    await S.say('', '眾人笑著走遠。九降風吹過竹塹城頭，吹過一排排雪白的米粉架。');
    await S.fadeOut(1.2);
    await S.titleCard(G.Chapters[4], '完');
    S.flag('ch4_done');
    S.quest('q_ch4_main', 'done');
    S.hideFollowers(false);
    await S.travel('hsinchu', 'lukang', { label: '順著九降風，沿海線南下……' });
    await G.Story.next(S, 5);
    return false;
  }
  G.Maps.define('zhuqian', {
    name: '竹塹城', subtitle: (st) => (broken(st) ? '竹風蘭雨' : '風裡有人在哭'), place: 'hsinchu', bgm: 'city',
    start: [27, 3],
    light: (st) => (broken(st) ? { ambient: 0.1, color: '#1a2838' } : { ambient: 0.2, color: '#24323e' }),
    particles: (st) => windyParticles(st),
    tiles: cityTiles, objects: cityObjects,
    drawOver: (ctx, t) => {
      if (F('ch4_kite') || G.Inv.has('key_kite')) return;
      // 小風's kite caught in the banyan crown
      const x = 5.6 * T, y = 22.0 * T + Math.sin(t * 2.2) * 3;
      ctx.save();
      ctx.translate(x, y - 150); ctx.rotate(0.25 + Math.sin(t * 1.7) * 0.08);
      ctx.fillStyle = '#e8483a'; ctx.strokeStyle = '#5a1a12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(16, 0); ctx.lineTo(0, 26); ctx.lineTo(-16, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f6e6a0'; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 26); ctx.moveTo(-16, 0); ctx.lineTo(16, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,230,210,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 26); ctx.quadraticCurveTo(14, 50, 4, 74); ctx.stroke();
      ctx.restore();
    },
    onEnter: async () => { installWindGuard(); },
    chests: [
      { id: 'c4_04', x: 31, y: 12, item: 'xumingsan', n: 1 },
      { id: 'c4_05', x: 52, y: 18, item: 'jiedu', n: 3, run: async (S) => { S.gold(150); } },
    ],
    npcs: [
      {
        id: 'gate_n', sprite: 'soldier', name: '守城兵', x: 25, y: 3, dir: 'down',
        talk: async (S) => {
          if (broken(G.state)) await S.say('守城兵', '這幾日城門口沒有斗笠亂飛了，閒甲會發霉。');
          else await S.say('守城兵', '入城喔？風大，看好身上的東西。上禮拜有人斗笠被吹到城隍廟屋頂上。');
        },
      },
      {
        id: 'gate_e', sprite: 'soldier', name: '守城兵', x: 53, y: 19, dir: 'left',
        talk: async (S) => {
          if (F('ch4_citygod_vision')) await sayAll(S, '守城兵', ['城隍廟指你們來的？好，好。往東走，看到滿山柿子就到客家庄了。', '迎曦門，迎接日頭的門。竹塹第一道日光從這裡入城。']);
          else await S.say('守城兵', '東門外是往客家庄的山路。這陣風怪，無事莫出城。');
        },
      },
      {
        id: 'gate_s', sprite: 'soldier', name: '守城兵', x: 25, y: 40, dir: 'right',
        talk: async (S) => {
          if (F('ch4_citygod_balanced')) await S.say('守城兵', '要往南？一路順風啊——這下真的是順風了。');
          else await S.say('守城兵', '往南是中港、後龍，再過去就是鹿港。這陣風，商隊攏停了。等風好再走。');
        },
      },
      { id: 'gate_w', sprite: 'soldier', name: '守城兵', x: 2, y: 19, dir: 'right', talk: ['西門外是往南寮港的路。這陣子風大浪大，船攏無出海，去了也沒路用。'] },
      {
        id: 'achi_out', sprite: 'temple_keeper', name: '阿池伯', x: 22, y: 19, dir: 'down', wander: 1, if: (st) => !st.flags.ch4_citygod_visit,
        talk: ['香灰一直被吹往東邊，掃也掃袂完。', '來拜拜喔？入去內底，城隍爺在等。'],
      },
      {
        id: 'mother', sprite: 'villager_f2', name: '收驚的阿娘', x: 33, y: 20, dir: 'down',
        talk: async (S) => {
          if (broken(G.state)) await S.say('收驚的阿娘', '這幾暝睏甲足好，一覺到天光。');
          else await S.say('收驚的阿娘', '囝仔暝暝哭，講風裡有人叫伊。廟公幫伊收驚，拿伊的衫在香爐頂繞三圈……');
        },
      },
      {
        id: 'wen', sprite: 'scholar', name: '溫先生', x: 35, y: 22, dir: 'down', if: (st) => !broken(st),
        talk: async (S) => {
          if (!F('ch4_changming_stall_seen')) { await scene403(S); return; }
          await S.say('溫先生', '玄冥法師說：思念之人，不該被風吹散。');
        },
      },
      {
        id: 'agui', sprite: 'shopkeeper_f', name: '阿桂嫂', x: 22, y: 22, dir: 'left',
        talk: async (S) => {
          if (broken(G.state)) { await S.say('阿桂嫂', '炒米粉開賣囉！竹塹米粉，細細長長，越嚼越香！'); await S.shop(['mifentang', 'chaomifen'], { title: '米粉湯攤' }); }
          else { await S.say('阿桂嫂', '風不好，米粉少，炒米粉暫停。米粉湯照賣，貴一點，歹勢喔。'); await S.shop(['mifentang'], { title: '米粉湯攤' }); }
        },
      },
      {
        id: 'amei', sprite: 'hakka_f', name: '阿梅', x: 26, y: 24, dir: 'down',
        talk: async (S) => {
          if (broken(G.state)) { await S.say('阿梅', '霜長出來咧！白白一層，像落雪。這就係柿霜，柿子自家个糖。'); await S.shop(['shibing', 'shibing_frost'], { title: '柿餅攤' }); }
          else { await S.say('阿梅', '柿餅！柿樹坪來个！……今年个柿餅，霜都長毋出來，歹勢。'); await S.shop(['shibing'], { title: '柿餅攤' }); }
        },
      },
      {
        id: 'scholar_old', sprite: 'scholar', name: '老秀才', x: 12, y: 34, dir: 'up', pos: (st) => (broken(st) ? [30, 25] : [12, 34]),
        talk: async (S) => {
          if (broken(G.state) && !F('ch4_scholar_gift')) { await scholarLecture(S); return; }
          await S.say('老秀才', '「竹塹」二字，原本是道卡斯人竹塹社的社名，這座城就是借了這個名字。');
          await S.say('老秀才', '最早的城，是種了一圈刺竹圍起來的，後來才改成土城、磚城。');
          await S.say('老秀才', '老夫考了三十年秀才……喔，我是說，考了三十年舉人。');
          await S.say('tuanzi:think', '那就是沒考上嘛。');
          await S.say('老秀才', '……');
        },
      },
      { id: 'kid', sprite: 'child_f', name: '廟口囝仔', x: 23, y: 27, dir: 'up', wander: 2, talk: ['七爺好高，八爺好矮！阿嬤說看到七爺八爺要乖，不可以亂指。'] },
      { id: 'walker1', sprite: 'old_m', name: '阿伯', x: 9, y: 22, dir: 'down', wander: 3, talk: async (S) => { await S.say('阿伯', broken(G.state) ? '九降風轉來咧，竹塹的米粉又會香規條街。' : '這陣風，連城牆都在哭。'); } },
      { id: 'walker2', sprite: 'villager_f', name: '阿姊', x: 46, y: 22, dir: 'left', wander: 3, talk: async (S) => { await S.say('阿姊', broken(G.state) ? '門口那些藍燈，一暝之間全熄了。我早就覺得怪怪的。' : '長明燈一盞三百文？我阿母買了兩盞，講會保平安。'); } },
    ],
    events: [
      { id: 'c4_402', trigger: 'auto', if: (st) => !st.flags.ch4_enter_city, run: scene402 },
      {
        id: 'banyan', trigger: 'action', x: 4, y: 23, w: 3, h: 3, label: '調查',
        run: async (S) => {
          if (F('ch4_kite') || S.hasItem('key_kite')) { await S.say('', '大榕樹的氣根垂到地上，像老人家的鬍鬚。'); return; }
          await S.say('', '大榕樹的樹梢上，卡著一隻紅色的風箏。');
          await S.say('hongying:smug', '讓開。');
          S.sfx('slash');
          await S.say('', '紅纓用槍尖輕輕一挑，風箏飄了下來。');
          await S.give('key_kite', 1);
        },
      },
      {
        id: 'stall_empty', trigger: 'action', x: 33, y: 23, w: 2, h: 1, label: '調查', if: (st) => broken(st),
        run: async (S) => { await S.say('', '燈都熄了。賣燈的人，不知道什麼時候走的。'); },
      },
      { id: 'west_gate', trigger: 'touch', x: 0, y: 20, w: 1, h: 3, run: async (S) => { await S.say('守城兵', '西門外是往南寮港的路。這陣子風大浪大，船攏無出海，去了也沒路用。'); await stepBack(S); } },
    ],
    warps: [
      { x: 27, y: 0, to: 'zhuqian_coast', tx: 13, ty: 30, tdir: 'up' },
      { x: 27, y: 18, to: 'zhuqian_citygod', tx: 10, ty: 12, tdir: 'up', door: true },
      { x: 9, y: 9, to: 'zhuqian_inn', tx: 7, ty: 8, tdir: 'up', door: true },
      { x: 39, y: 9, to: 'zhuqian_smith', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 46, y: 9, to: 'zhuqian_pharmacy', tx: 6, ty: 7, tdir: 'up', door: true },
      {
        x: 55, y: 20, h: 3, to: 'hakka_road', tx: 1, ty: 20, tdir: 'right',
        run: async (S) => {
          if (F('ch4_citygod_vision')) return true;
          await S.say('守城兵', '東門外是往客家庄的山路。這陣風怪，無事莫出城。');
          await stepBack(S);
          return false;
        },
      },
      {
        x: 27, y: 43, to: 'zhuqian', tx: 27, ty: 40, tdir: 'up',
        run: async (S) => {
          if (!F('ch4_citygod_balanced')) {
            await S.say('守城兵', '往南是中港、後龍，再過去就是鹿港。這陣風，商隊攏停了。等風好再走。');
            await stepBack(S);
            return false;
          }
          const r = await scene418(S);
          if (r === false && !F('ch4_done')) await stepBack(S);
          return false;
        },
      },
    ],
  });

  // ----------------------------------------------------------------------- 1-5 small interiors
  G.Maps.define('zhuqian_inn', {
    name: '竹風客棧', subtitle: '竹塹城', place: 'hsinchu', bgm: 'city', start: [7, 8], light: { ambient: 0.25, color: '#2a1a10' },
    tiles: room(14, 10, '_', 'W', 7).rows(),
    objects: [
      { t: 'counter', x: 3, y: 3, w: 2 }, { t: 'shelf_lanterns', x: 2, y: 2, w: 2 }, { t: 'jar_row', x: 5, y: 2, w: 2 },
      { t: 'table', x: 8, y: 5 }, { t: 'chair', x: 7, y: 5, dir: 'right' }, { t: 'chair', x: 9, y: 5, dir: 'left' },
      { t: 'table', x: 4, y: 6 }, { t: 'chair', x: 3, y: 6, dir: 'right' }, { t: 'tea_set', x: 5, y: 6 },
      { t: 'stairs_up', x: 12, y: 2 }, { t: 'bed', x: 10, y: 2 }, { t: 'bed', x: 11, y: 6 }, { t: 'plant_pot', x: 1, y: 7, v: 1 },
    ],
    npcs: [{
      id: 'innkeeper', sprite: 'shopkeeper_f', name: '客棧掌櫃', x: 4, y: 2, dir: 'down',
      talk: async (S) => {
        await S.say('客棧掌櫃', '竹風蘭雨——竹塹的風，蘭陽的雨。客倌要歇到天光，還是歇到暗暝？');
        const r = await rest(S, { price: 30, who: '客棧掌櫃' });
        if (r >= 0) { await S.fadeIn(0.8); S.bgm('city'); G.UI.toast('好好休息了一晚，全員完全恢復。', { icon: 'lantern' }); }
      },
    }],
    warps: [{ x: 7, y: 9, to: 'zhuqian', tx: 9, ty: 10, tdir: 'down', door: true }],
  });
  G.Maps.define('zhuqian_smith', {
    name: '打鐵舖', subtitle: '竹塹城', place: 'hsinchu', bgm: 'city', start: [6, 7], light: { ambient: 0.35, color: '#2a140a' },
    tiles: room(12, 9, 't', 'R', 6).rows(),
    objects: [
      { t: 'stove', x: 2, y: 2 }, { t: 'weapon_rack', x: 7, y: 2 }, { t: 'cabinet', x: 10, y: 2 }, { t: 'workbench', x: 3, y: 4 },
      { t: 'crate', x: 9, y: 6 }, { t: 'barrel', x: 10, y: 6 }, { t: 'bucket', x: 1, y: 5 },
    ],
    lights: [{ x: 3, y: 2, r: 200, color: '#ff8a3a', flicker: 0.4 }],
    npcs: [{
      id: 'smith', sprite: 'villager_m2', name: '鐵牛師', x: 5, y: 4, dir: 'down',
      talk: async (S) => {
        if (broken(G.state)) await S.say('鐵牛師', '九降風一來，淬火特別利。來看劍！');
        else await S.say('鐵牛師', '竹塹？就是竹子圍起來的城啊！那個秀才講什麼道卡斯，我聽無啦。');
        await S.shop(['sw_jiujiang', 'sp_zhujie', 'fn_zhugu', 'hd_douli', 'ft_cloth', 'ft_muji'], { title: '打鐵舖' });
      },
    }],
    warps: [{ x: 6, y: 8, to: 'zhuqian', tx: 39, ty: 10, tdir: 'down', door: true }],
  });
  G.Maps.define('zhuqian_pharmacy', {
    name: '回春堂', subtitle: '竹塹城', place: 'hsinchu', bgm: 'city', start: [6, 7], light: { ambient: 0.25, color: '#1a1a10' },
    tiles: room(12, 9, '_', 'W', 6).rows(),
    objects: [
      { t: 'cabinet', x: 2, y: 2 }, { t: 'cabinet', x: 3, y: 2 }, { t: 'cabinet', x: 4, y: 2 }, { t: 'herbs_rack', x: 9, y: 2 },
      { t: 'counter', x: 5, y: 4, w: 3 }, { t: 'jar_row', x: 1, y: 6, w: 2 }, { t: 'jar', x: 10, y: 6 }, { t: 'plant_pot', x: 10, y: 4, v: 2 },
    ],
    npcs: [{
      id: 'doctor', sprite: 'doctor', name: '林掌櫃', x: 6, y: 3, dir: 'down',
      talk: async (S) => {
        if (broken(G.state)) await S.say('林掌櫃', '這幾日病人少了一半。好事，好事。');
        else await S.say('林掌櫃', '風邪入體。最近來看病的，個個說耳朵裡有人在哭。');
        await S.shop(['jinchuang', 'xumingsan', 'jiedu', 'xiangbao', 'huanhunxiang', 'pinganfu', 'lingxun', 'ac_bagua', 'ac_yingshi'], { title: '回春堂' });
      },
    }],
    warps: [{ x: 6, y: 8, to: 'zhuqian', tx: 46, ty: 10, tdir: 'down', door: true }],
  });

  // =====================================================================================================
  // 1-3 zhuqian_citygod 都城隍廟
  // =====================================================================================================
  const citygodTiles = (() => {
    const g = room(20, 14, 'T', 'E', 10);
    g.rect(1, 8, 6, 1, 'E').rect(14, 8, 5, 1, 'E');
    g.rect(8, 2, 4, 6, 'c');
    return g.rows();
  })();
  function drawAbacus(ctx, t) {
    // the great wooden abacus hanging over the inner doorway (y = 8, x 7..13)
    const x0 = 7.2 * T, x1 = 13.8 * T, y0 = 7.05 * T, y1 = 7.85 * T;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x0 + 6, y1 + 4, x1 - x0, 8);
    ctx.fillStyle = '#5a3418'; ctx.strokeStyle = '#2a160a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a200e'; ctx.fillRect(x0 + 10, y0 + 10, x1 - x0 - 20, y1 - y0 - 20);
    const rows = 13, beam = y0 + (y1 - y0) * 0.36;
    ctx.fillStyle = '#6a4020'; ctx.fillRect(x0 + 10, beam - 2, x1 - x0 - 20, 4);
    const settled = F('ch4_citygod_balanced');
    for (let i = 0; i < rows; i++) {
      const rx = x0 + 22 + i * ((x1 - x0 - 44) / (rows - 1));
      ctx.strokeStyle = '#a8865a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(rx, y0 + 10); ctx.lineTo(rx, y1 - 10); ctx.stroke();
      const jit = settled ? 0 : Math.sin(t * 3 + i * 1.7) * (i === rows - 1 ? 3 : 0.6);
      ctx.fillStyle = i === rows - 1 && !settled ? '#e8c890' : '#c89a5a';
      ctx.beginPath(); ctx.ellipse(rx, beam - 9 + jit, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(rx, beam + 9 + k * 6.5 + (k === 0 ? jit : 0), 7, 3.2, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  async function scene404(S) {
    S.flag('ch4_citygod_visit');
    await S.wait(0.3);
    await S.say('', '廟內香煙不往上飄，全部斜斜地朝東邊牆角流去。阿池伯拿著掃帚，追著被吹跑的香灰。');
    S.face('achi', 'player');
    await S.say('阿池伯', '來拜拜喔？先在門口那裡看一下——');
    await S.camera(10, 7, 0.8);
    await S.say('阿池伯', '人算不如天算。陽間的帳算得再精，善惡最後攏是城隍爺在算。');
    await S.say('xinghe:surprise', '好大的算盤……比我還高。');
    await S.say('tuanzi:think', '這算盤能算出本大仙一天吃幾顆飯糰嗎？');
    await S.say('yungui:smug', '算盤會爆。');
    S.cameraFollow();
    await S.say('阿池伯', '咱竹塹這尊是「都城隍」，是全台城隍裡位階上高的，管的範圍上闊。');
    await S.say('阿池伯', '……可是最近，連城隍爺的帳都對不起來啊。');
    await S.say('baizhi:think', '帳？神明也要記帳嗎？');
    await S.say('阿池伯', '人過身了，魂要先到城隍爺面前報到，查明一生善惡，才好往下走。');
    await S.say('阿池伯', '生死簿上寫著「該來」的名，魂卻沒到。一個、十個……愈來愈多。');
    await S.say('阿池伯', '大算盤半暝自己啪啪響，算來算去，就是差一截。');
    await S.say('阿池伯', '七爺八爺連續三暝托夢給我，攏是同一句：「簿上之名，有來無到。」');
    await S.camera(10, 4, 0.8);
    await S.say('', '殿內兩側，一高一矮兩尊神將像——高大白面的謝將軍，矮壯黑面的范將軍。');
    await S.say('xinghe:surprise', '是七爺八爺……');
    await S.say('baizhi:think', '一位好高，一位好矮。他們是一起的嗎？');
    await S.say('阿池伯', '是啊。他們生前是結拜兄弟，一位姓謝，一位姓范。');
    await S.say('阿池伯', '有一日兩人約在橋下相見，落起大雨。謝爺回去拿傘，范爺就在橋下等。');
    await S.say('阿池伯', '溪水一直漲，范爺為了守約，不肯走……就這樣被大水淹去。');
    await S.say('阿池伯', '謝爺拿傘轉來，找不到兄弟，傷心到在橋邊自盡。');
    await S.say('阿池伯', '城隍爺感念他們重情守信，收在身邊做將軍，替陰間緝拿、引路。');
    await S.say('baizhi:sad', '……水漲起來的時候，他一直在等。');
    await S.say('xinghe:think', '被等的那個人，回來看到……一定很捨不得吧。');
    await S.say('', '白芷看了星河一眼，沒有說話。');
    S.cameraFollow();
    await S.say('yungui:serious', '阿伯，最近可有一位白鬍子的老道長來過？太虛觀的，拿一支拂塵。');
    await S.say('阿池伯', '有、有！中秋後幾日，一位老道長，眉毛白、鬍鬚白，精神好得像少年家。');
    await S.say('阿池伯', '他在這裡擲筊問了半晌，連得三個聖筊，就說「貧道去去就回」，往東邊山裡去了。');
    await S.say('阿池伯', '……到今仔日，還沒轉來。');
    await S.say('yungui:think', '去去就回……那老頭每次這樣講，都要去很久。');
    S.emote('tuanzi', '💧');
    await S.say('tuanzi:sad', '……');
    await S.say('hongying:serious', '那我們也來問。直接問城隍爺，那些魂去了哪裡。');
    await S.say('阿池伯', '好，來，我教你們擲筊。');
    await S.say('阿池伯', '先上香。雙手捧筊，跟城隍爺報上名字、住哪裡，再把要問的代誌講清楚。');
    await S.say('阿池伯', '一平一凸，是「聖筊」，神明答應。兩面平的是「笑筊」——神明笑笑，是問得不清楚，或是答案你心裡早就知影。');
    await S.say('阿池伯', '兩面都凸的是「陰筊」，就是不行、不是。大事情，要連續三個聖筊才算數。');
    await S.say('', '星河上前，雙手捧著一對紅色的月牙形筊杯。');
    await S.say('xinghe:serious', '弟子沈星河，九份人。想請問城隍爺——');
    const Q1 = ['那些失蹤的魂，跟這陣怪風有關嗎？', '我們會不會發大財？', '白芷她……到底是誰？'];
    let left = Q1.slice();
    for (;;) {
      const c = await S.choice(left);
      const q = left[c];
      if (q === Q1[1]) {
        await jiaobei(S, ['xiao']);
        await S.say('阿池伯', '笑筊啦！城隍爺在笑你。這個時陣問這個？');
        await S.say('hongying:angry', '笨蛋！');
        await S.say('xinghe:shy', '我、我只是想先試試看手感嘛……');
      } else if (q === Q1[2]) {
        await jiaobei(S, ['xiao']);
        await S.say('', '筊杯在地上轉了好久，才停下——兩面平。');
        await S.say('阿池伯', '笑筊。……城隍爺的意思，這件事，時候到了，自然就知影。');
        await S.say('baizhi:think', '時候到了……？');
        await S.say('', '星河看了她一眼，握緊了手裡的筊杯。');
      } else {
        await jiaobei(S, ['sheng', 'sheng', 'sheng']);
        S.sfx('bell');
        await S.say('阿池伯', '三聖筊！');
        break;
      }
      left = left.filter((x) => x !== q);
    }
    await S.say('阿池伯', '再問——那些魂，往哪裡去了？');
    let left2 = ['往海上？', '在城裡？', '往東邊山裡？'];
    for (;;) {
      const c = await S.choice(left2);
      const q = left2[c];
      if (q === '往海上？') { await jiaobei(S, ['yin']); await S.say('阿池伯', '……不是海。'); }
      else if (q === '在城裡？') { await jiaobei(S, ['yin']); await S.say('阿池伯', '不是在城內。'); }
      else { await jiaobei(S, ['sheng', 'sheng', 'sheng']); S.sfx('bell'); break; }
      left2 = left2.filter((x) => x !== q);
    }
    S.flag('ch4_jiaobei_done');
    S.bgm(null);
    S.particles([]);
    await S.say('', '第三個聖筊落地的瞬間，殿內所有的香煙同時靜止。風聲消失。');
    await S.say('', '白光由城隍神龕的垂簾後漫出——');
    S.flash('#fff8e0', 0.8, 1);
    await S.fadeOut(0.9, '#fff8e8');
    await S.warp('citygod_vision', 8, 9, 'up', { fade: 0 });
    await S.fadeIn(1.2);
  }
  async function scene405(S) {
    await S.wait(0.6);
    await S.say('', '幽暗的殿堂，地面是微光的青石。正前方高處只有一片溫暖而看不清的光。');
    await S.say('', '左右兩道光柱中顯出身影：一位極高，白袍高帽，帽上寫「一見大吉」；一位矮壯，黑袍方帽，帽上寫「天下太平」。');
    await S.say('', '眾人不由自主地垂首。糰子縮到星河腳後，一動也不敢動。');
    await S.say('', '半空中浮著一本攤開的簿冊，一行行名字正在褪色，像被風吹散的墨。');
    await S.say('謝將軍', '陽世之人，莫驚。');
    await S.say('范將軍', '簿上之名，有來無到。');
    await S.say('謝將軍', '九降之風，本是乾穀、曬粉、養人之風。如今風中有燈，燈中有魂。');
    await S.say('范將軍', '魂隨風捲，入於東山。風穴之中，一盞長明，裂而不滅。');
    await S.say('xinghe:serious', '長明……是長明宮的燈！');
    await S.say('范將軍', '去。將他們帶來此處——不是燈裡。是此處。');
    await S.say('范將軍', '莫讓他們……在風裡等。');
    V().c4_page = 1;
    S.sfx('item');
    await S.say('', '簿冊中一頁輕輕脫落，飄到星河手中。');
    await S.say('', '范將軍的目光落在白芷身上，停了很久。');
    await S.say('范將軍', '……燈，亦有歸期。');
    await S.say('baizhi:surprise', '咦？');
    S.flash('#fff8e0', 1.0, 1);
    await S.fadeOut(1.0, '#fff8e8');
    V().c4_page = 0;
    await S.warp('zhuqian_citygod', 10, 10, 'up', { fade: 0 });
    S.flag('ch4_citygod_vision');
    S.bgm('temple');
    await S.fadeIn(1.0);
    await S.say('', '廟內。香煙重新筆直上升。阿池伯跌坐在地，手裡還捏著筊杯。');
    await S.say('阿池伯', '你、你們……剛才敢是……');
    await S.say('', '星河低頭——手裡多了一張泛黃的紙頁，上面寫滿名字，墨跡一個一個淡去。');
    await S.give('key_ledger', 1);
    await S.say('阿池伯', '這、這是……生死簿！城隍爺借給你們的？');
    await S.say('yungui:serious', '是「帳」。上面淡掉的名字，就是被風捲走的魂。');
    await S.say('xinghe:serious', '七爺八爺說，魂被風捲到東邊山裡，那裡有一個「風穴」。');
    await S.say('阿池伯', '東邊……五指山！五粒山頭並排，親像一隻手。冬天的風就是從那邊灌落來的。');
    await S.say('阿池伯', '要去五指山，得先經過山腳的客家庄——柿樹坪。那邊的人熟山路。');
    await S.say('阿池伯', '這個帶著。城隍爺保佑。');
    await S.give('pinganfu', 3);
    await S.say('阿池伯', '……少年仔，等你們轉來，再擲一次筊給城隍爺看。');
    await S.say('yungui:think', '師父也往東邊去了。');
    await S.say('baizhi:think', '燈，也有歸期……是什麼意思呢。');
    await S.say('xinghe:normal', '……大概是說，迷路的燈也能回家吧。');
    S.quest('q_ch4_main', 1);
    S.objective('出東門迎曦門，經柿樹坪前往五指山');
  }
  async function scene417(S) {
    await S.wait(0.3);
    await S.say('', '都城隍廟。香煙筆直上升。');
    S.face('achi', 'player');
    await S.say('阿池伯', '你們轉來了！昨暝……昨暝大算盤響了一整暝，響完，就對起來了！');
    await S.say('阿池伯', '今早七爺八爺擱托夢，只講兩個字——');
    await S.say('阿池伯', '「到了。」');
    await S.say('xinghe:smile', '……那就好。');
    await S.say('', '星河把生死簿殘頁雙手放回供桌上。紙頁上的名字整整齊齊，墨色飽滿。');
    if (F('ch4_yimin_done')) await S.say('', '最後一行，有一個剛寫上去的名字——「鍾阿松」。');
    S.take('key_ledger');
    await S.say('阿池伯', '來，擲一次筊給城隍爺看。');
    await S.say('xinghe:serious', '弟子沈星河，九份人。想跟城隍爺稟報——那些魂，都到了嗎？');
    await jiaobei(S, ['sheng', 'sheng', 'sheng']);
    S.sfx('bell');
    await S.say('阿池伯', '三聖筊！哈哈哈！');
    S.sfx('wind');
    await S.say('', '一陣風從廟門吹進來，輕輕拂過殿內——謝將軍像手中的扇面微微一動，范將軍帽緣的流蘇輕晃了一下。然後一切靜止。');
    await S.say('baizhi:smile', '……他們說，謝謝。');
    await S.say('yungui:smug', '妳怎麼知道？');
    await S.say('baizhi:smile', '風告訴我的。');
    await S.say('', '星河在范將軍像前站了一會兒。');
    await S.say('xinghe:think', '（橋下的水退了以後……那裡一定很安靜吧。）');
    await S.say('阿池伯', '對了——城內那些長明燈，昨暝一盞一盞全熄了。賣燈的人，也無看到影。');
    await S.say('阿池伯', '我把燈收來，請城隍爺處理。');
    await S.say('', '廟角堆著一籃熄滅的白燈。');
    await S.say('yungui:serious', '長明宮……玄冥法師。這筆帳，遲早要算。');
    S.flag('ch4_citygod_balanced');
    S.quest('q_ch4_main', 5);
    S.objective('出南門歌薰門，前往鹿港');
    await S.say('', '離開竹塹後，本地未完成的委託將無法再接。');
  }
  G.Maps.define('zhuqian_citygod', {
    name: '都城隍廟', subtitle: '竹塹城', place: 'hsinchu', bgm: 'temple', start: [10, 12],
    light: { ambient: 0.45, color: '#1a0e08' },
    particles: (st) => (broken(st) || st.flags.ch4_citygod_vision ? [{ type: 'dust', density: 0.4 }] : [{ type: 'wind', density: 0.3 }, { type: 'dust', density: 0.4 }]),
    tiles: citygodTiles,
    objects: [
      { t: 'screen', x: 9, y: 2 }, { t: 'altar', x: 9, y: 3 }, { t: 'brazier', x: 7, y: 3 }, { t: 'brazier', x: 12, y: 3 },
      { t: 'pillar', x: 3, y: 4 }, { t: 'signboard', x: 4, y: 4, text: '謝將軍' }, { t: 'pillar', x: 16, y: 4 }, { t: 'signboard', x: 15, y: 4, text: '范將軍', v: 1 },
      { t: 'pillar', x: 6, y: 6 }, { t: 'pillar', x: 13, y: 6 }, { t: 'divination_blocks', x: 14, y: 5 }, { t: 'fortune_sticks', x: 5, y: 5 },
      { t: 'incense_burner', x: 10, y: 10 }, { t: 'pillar', x: 4, y: 10 }, { t: 'pillar', x: 15, y: 10 },
      { t: 'shelf_lanterns', x: 1, y: 9, w: 2, v: 1 }, { t: 'jar_row', x: 17, y: 9, w: 2 },
      { t: 'basket', x: 18, y: 11, v: 3, if: (st) => !!st.flags.ch4_citygod_balanced },
    ],
    lights: [{ x: 10, y: 3, r: 220, color: '#ffb060', flicker: 0.3 }],
    drawOver: (ctx, t) => drawAbacus(ctx, t),
    npcs: [
      {
        id: 'achi', sprite: 'temple_keeper', name: '阿池伯', x: 8, y: 11, dir: 'right',
        talk: async (S) => {
          if (F('ch4_citygod_balanced')) { await S.say('阿池伯', '大算盤安靜了。我總算睏得著了。'); return; }
          await S.say('阿池伯', '五指山，記得喔。城隍爺保佑你們。');
          await S.say('阿池伯', '看到七爺八爺要恭敬，莫用手指，要用雙手合十。');
        },
      },
      {
        id: 'granny', sprite: 'old_f', name: '香客阿嬤', x: 12, y: 11, dir: 'up',
        talk: async (S) => {
          if (broken(G.state)) await sayAll(S, '香客阿嬤', ['轉來咧！我後生轉來咧！船被風吹去北邊，在雞籠避了幾日。', '城隍爺有保庇。']);
          else await sayAll(S, '香客阿嬤', ['我後生去南寮討海，七日無轉來……', '我來求城隍爺。簿上若無伊的名，就是還活著。']);
        },
      },
    ],
    events: [
      { id: 'c4_404', trigger: 'auto', if: (st) => !st.flags.ch4_citygod_visit, run: scene404 },
      { id: 'c4_417', trigger: 'auto', if: (st) => broken(st) && !st.flags.ch4_citygod_balanced, run: scene417 },
      {
        id: 'abacus', trigger: 'action', x: 7, y: 8, w: 7, h: 1, label: '調查',
        run: async (S) => {
          if (F('ch4_citygod_balanced')) await S.say('', '算珠排得整整齊齊。');
          else await S.say('', '「人算不如天算」。算珠上積著薄灰，最下排卻擦得發亮——像是半夜有人撥過。');
        },
      },
      {
        id: 'xie', trigger: 'action', x: 3, y: 4, w: 2, h: 1, label: '參拜',
        run: async (S) => {
          await S.say('', '謝將軍像。高大白面，白袍高帽，帽上寫著「一見大吉」，手中一把扇。');
          if (F('ch4_citygod_vision')) await S.say('', '星河雙手合十，恭恭敬敬地拜了一拜。');
        },
      },
      {
        id: 'fan', trigger: 'action', x: 15, y: 4, w: 2, h: 1, label: '參拜',
        run: async (S) => {
          await S.say('', '范將軍像。矮壯黑面，黑袍方帽，帽上寫著「天下太平」。');
          if (F('ch4_citygod_balanced')) await S.say('xinghe:think', '（橋下的水退了以後……那裡一定很安靜吧。）');
          else if (F('ch4_citygod_vision')) await S.say('xinghe:think', '（莫讓他們……在風裡等。）');
        },
      },
      { id: 'altar', trigger: 'action', x: 9, y: 3, w: 2, h: 1, label: '參拜', run: async (S) => { await savePrompt(S, '城隍爺的神龕隱在垂簾與燭光之後。香火很旺。'); } },
    ],
    warps: [{ x: 10, y: 13, to: 'zhuqian', tx: 27, ty: 19, tdir: 'down', door: true }],
  });

  // ----------------------------------------------------------------------- 1-4 citygod_vision 城隍幻境
  function drawVision(ctx, t) {
    const cx = 8 * T + T / 2;
    ctx.save();
    // the warm, unseeable light (no deity is depicted)
    let g = ctx.createRadialGradient(cx, 1.6 * T, 10, cx, 1.6 * T, 5.5 * T);
    g.addColorStop(0, 'rgba(255,236,190,0.95)'); g.addColorStop(0.35, 'rgba(255,210,140,0.45)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 6 * T, 0, 12 * T, 5 * T);
    const fig = (x, foot, h, w, body, glow, text) => {
      const gl = ctx.createLinearGradient(x, foot - h - 40, x, foot);
      gl.addColorStop(0, U.rgba(glow, 0)); gl.addColorStop(0.3, U.rgba(glow, 0.35)); gl.addColorStop(1, U.rgba(glow, 0.55));
      ctx.fillStyle = gl; ctx.fillRect(x - w * 0.9, foot - h - 60, w * 1.8, h + 60);
      const a = 0.82 + Math.sin(t * 1.3 + x) * 0.06;
      ctx.globalAlpha = a;
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.moveTo(x - w * 0.5, foot); ctx.quadraticCurveTo(x - w * 0.42, foot - h * 0.6, x - w * 0.22, foot - h * 0.78);
      ctx.lineTo(x + w * 0.22, foot - h * 0.78); ctx.quadraticCurveTo(x + w * 0.42, foot - h * 0.6, x + w * 0.5, foot); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, foot - h * 0.84, w * 0.16, w * 0.18, 0, 0, Math.PI * 2); ctx.fill();
      // hat with its inscription
      const hh = h * 0.2, hw = w * 0.34;
      ctx.fillRect(x - hw / 2, foot - h * 0.86 - hh, hw, hh);
      ctx.globalAlpha = 1;
      for (let i = 0; i < text.length; i++) G.Render.text(ctx, text[i], x, foot - h * 0.86 - hh + 2 + i * (hh / text.length), { size: Math.max(10, hh / text.length - 1), align: 'center', color: '#c8382a', shadow: false });
    };
    fig(5.5 * T, 7.6 * T, 4.4 * T, 1.7 * T, '#f2f0ea', '#ffffff', '一見大吉');
    fig(11.5 * T, 7.6 * T, 2.7 * T, 1.9 * T, '#22202a', '#6a6a90', '天下太平');
    // floating ledger with fading names
    const bx = cx, by = 5.2 * T + Math.sin(t * 1.4) * 6;
    ctx.fillStyle = 'rgba(255,240,200,0.18)'; ctx.beginPath(); ctx.ellipse(bx, by + 50, 90, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#efe2c0'; ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(bx - 70, by - 26); ctx.lineTo(bx, by - 20); ctx.lineTo(bx + 70, by - 26); ctx.lineTo(bx + 70, by + 26); ctx.lineTo(bx, by + 32); ctx.lineTo(bx - 70, by + 26); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 10; i++) {
      const lx = bx - 62 + i * 13 + (i >= 5 ? 6 : 0);
      ctx.strokeStyle = `rgba(30,20,10,${0.15 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.5 + i * 1.3))})`;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, by - 16); ctx.lineTo(lx, by + 20); ctx.stroke();
    }
    if (V().c4_page) {
      ctx.fillStyle = 'rgba(255,248,220,0.9)'; ctx.save(); ctx.translate(bx + 40, by + 70 + Math.sin(t * 3) * 10); ctx.rotate(Math.sin(t * 2) * 0.4);
      ctx.fillRect(-16, -20, 32, 40); ctx.restore();
    }
    ctx.restore();
  }
  G.Maps.define('citygod_vision', {
    name: '城隍幻境', subtitle: '簿上之名，有來無到', place: 'hsinchu', bgm: null, start: [8, 9], noSave: true, autosave: false,
    light: { ambient: 0.5, color: '#2a2010' }, particles: [{ type: 'motes', density: 0.8 }, 'sparkles'],
    tiles: (() => { const g = new Grid(16, 12, ' '); g.rect(2, 2, 12, 9, '*'); return g.rows(); })(),
    drawGround: (ctx, t) => drawVision(ctx, t),
    events: [{ id: 'c4_405', trigger: 'auto', if: (st) => !st.flags.ch4_citygod_vision, run: scene405 }],
    warps: [{ x: 8, y: 10, to: 'zhuqian_citygod', tx: 10, ty: 10, tdir: 'up', if: (st) => !!st.flags.ch4_citygod_vision }],
  });

  // =====================================================================================================
  // 1-6 hakka_road 往柿樹坪山路
  // =====================================================================================================
  const roadTiles = (() => {
    const g = new Grid(44, 40, '.');
    g.rect(1, 2, 15, 6, 'f').rect(1, 9, 9, 5, 'f').rect(2, 27, 14, 10, 'f').rect(21, 27, 20, 10, 'f').rect(21, 2, 5, 14, 'f');
    g.rect(0, 25, 17, 1, ',').rect(20, 25, 9, 1, ',');
    g.rect(18, 0, 2, 40, 'r');
    g.line([[0, 20], [16, 20], [16, 22], [30, 22], [30, 24], [42, 24]], '=', 2);
    g.rect(18, 22, 2, 2, 'b');
    g.rect(27, 3, 14, 12, ':');
    g.rect(33, 15, 2, 7, '=');
    g.rect(38, 16, 5, 6, ',');
    return g.rows();
  })();
  function roadObjects() {
    const o = [
      { t: 'tree_camphor', x: 11, y: 15 }, { t: 'shrine_small', x: 12, y: 17, text: '伯公' },
      { t: 'granary', x: 35, y: 4 },
      { t: 'drying_rack', x: 29, y: 6, v: 1 }, { t: 'drying_rack', x: 32, y: 6, v: 1 }, { t: 'drying_rack', x: 31, y: 8, v: 1 }, { t: 'drying_rack', x: 34, y: 8, v: 1 },
      { t: 'drying_rack', x: 29, y: 11, v: 1 }, { t: 'drying_rack', x: 33, y: 13, v: 1 }, { t: 'drying_rack', x: 37, y: 13, v: 1 }, { t: 'drying_rack', x: 36, y: 10, v: 1 },
      { t: 'rock_big', x: 42, y: 16 }, { t: 'basket', x: 38, y: 7, v: 1 },
      { t: 'signboard', x: 1, y: 18, text: '柿樹坪' }, { t: 'fence_bamboo', x: 21, y: 26, w: 7 },
    ];
    for (const [x, y] of [[28, 3], [31, 3], [39, 3], [27, 8], [27, 12], [39, 6], [40, 13], [31, 11], [38, 9], [35, 11]]) o.push({ t: 'tree_camphor', x, y, v: 3 });
    for (let y = 5; y <= 15; y++) for (const x of [41, 42, 43]) if (!(x === 41 && y === 10) && !(y >= 15 && x >= 42)) o.push({ t: 'bamboo', x, y });
    o.push({ t: 'bamboo', x: 40, y: 10 });
    for (const [x, y] of [[3, 3], [6, 4], [9, 3], [12, 5], [4, 10], [7, 11], [4, 29], [9, 31], [13, 33], [24, 29], [30, 31], [35, 34], [22, 6], [24, 11]]) o.push({ t: 'rice_stalks', x, y });
    for (const [x, y] of [[5, 19], [9, 22], [14, 18], [22, 20], [26, 21], [36, 26], [40, 23], [2, 23], [16, 26]]) o.push({ t: 'tallgrass', x, y });
    for (const [x, y] of [[8, 19], [24, 25], [12, 23]]) o.push({ t: 'flowers', x, y });
    for (const [x, y] of [[17, 2], [17, 13], [20, 18], [20, 30], [17, 36]]) o.push({ t: 'reeds', x, y });
    for (const [x, y] of [[1, 15], [10, 25], [42, 30], [42, 37], [27, 17], [24, 17]]) o.push({ t: 'tree_pine', x, y });
    return o;
  }
  async function scene406(S) {
    S.flag('ch4_road');
    await S.wait(0.3);
    await S.say('', '丘陵起伏，收割後的梯田一層層往上。山坡上一棵棵柿子樹掛滿了橘紅的果實。');
    await S.say('baizhi:surprise', '好多小太陽……掛在樹上。');
    await S.say('yungui:normal', '柿子。從竹塹往東的客家庄，家家戶戶都曬柿餅。');
    await S.say('tuanzi:smile', '柿餅！甜的！本大仙聞到了——');
    S.move('tuanzi', 'RRRRRR', { wait: false, speed: 7 });
    await S.say('hongying:surprise', '喂，別亂跑！');
    await S.say('xinghe:laugh', '他跑得比被風吹還快。');
    S.gather();
    S.sfx('wind');
    await S.say('', '遠處的柿子有一半發黑，掉在地上。風穿過枝葉，發出細細的哭聲。');
    await S.say('baizhi:sad', '……連柿子都在哭。');
  }
  async function persimmonClue(S, k) {
    G.state.flags['ch4_pc_' + k] = true;
    const n = [1, 2, 3].filter((i) => F('ch4_pc_' + i)).length;
    if (n === 3 && !F('ch4_persimmon_clues')) {
      S.flag('ch4_persimmon_clues');
      S.quest('q_persimmon', 1);
      S.sfx('switch');
      await S.say('yungui:serious', '齒痕、四爪腳印、一路的柿蒂……都往竹林底去了。');
      await S.say('hongying:serious', '竹林底那塊大石頭旁邊——有個洞！');
    }
  }
  G.Maps.define('hakka_road', {
    name: '往柿樹坪山路', subtitle: '柿子山路', place: 'hsinchu', bgm: 'hakka', start: [2, 20],
    light: (st) => (broken(st) ? { ambient: 0.05 } : { ambient: 0.15, color: '#2a2418' }),
    particles: (st) => (broken(st) ? ['leaves', { type: 'wind', density: 0.3 }] : ['leaves', { type: 'wind', density: 1 }, { type: 'motes', density: 0.3 }]),
    tiles: roadTiles, objects: roadObjects,
    drawGround: (ctx) => {
      if (!F('ch4_persimmon_clues')) return;
      const x = 41 * T + T / 2, y = 17 * T + T * 0.55;
      ctx.save();
      const g = ctx.createRadialGradient(x, y, 4, x, y, 30);
      g.addColorStop(0, '#060404'); g.addColorStop(0.7, '#1a120c'); g.addColorStop(1, 'rgba(40,30,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    chests: [
      { id: 'c4_07', x: 36, y: 18, item: 'shibing', n: 2 },
      { id: 'c4_08', x: 6, y: 31, item: 'bantiao', n: 2 },
      { id: 'c4_09', x: 17, y: 24, gold: 300 },
      { id: 'c4_11', x: 20, y: 5, item: 'xiangbao', n: 2 },
    ],
    npcs: [{
      id: 'peng', sprite: 'hakka_m', name: '彭阿伯', x: 32, y: 10, dir: 'down',
      talk: async (S) => {
        if (F('ch4_persimmon_done')) {
          if (broken(G.state) && !F('ch4_persimmon_frost')) {
            await S.say('彭阿伯', '霜出來咧！你看，白雪雪！');
            await S.give('shibing_frost', 3);
            S.flag('ch4_persimmon_frost');
            return;
          }
          if (broken(G.state)) { await S.say('彭阿伯', '霜出來咧！你看，白雪雪！'); return; }
          await sayAll(S, '彭阿伯', ['柿餅愛揀石柿，削皮、日曬、夜收，曬到軟，就用手捏。', '最尾，表面會出一層白霜——柿霜，係柿子自家个糖。', '這陣風毋著，霜就長毋出來。']);
          return;
        }
        if (S.hasItem('key_stolen_shibing')) {
          S.take('key_stolen_shibing');
          await S.say('彭阿伯', '好！三個就算請你食个！');
          await S.say('tuanzi:smile', '阿伯是好人！');
          await S.say('彭阿伯', '柿餅愛揀石柿，削皮、日曬、夜收，曬到軟，就用手捏。一日捏幾擺，捏到肉軟、形扁。');
          await S.say('彭阿伯', '最尾，表面會出一層白霜——柿霜，係柿子自家个糖。毋過這陣風毋著，霜就長毋出來。');
          await S.say('彭阿伯', '這個分你兜。');
          await S.say('baizhi:think', '柿柿如意……事事如意？');
          await S.say('彭阿伯', '著！柿子就係「事」，掛一粒柿子，事事如意。');
          await S.give('ac_shishi', 1);
          await S.give('shibing', 6);
          S.flag('ch4_persimmon_done');
          S.quest('q_persimmon', 'done');
          return;
        }
        if (G.Quests.stage('q_persimmon') >= 0) {
          if (F('ch4_persimmon_clues')) await S.say('彭阿伯', '竹林底有洞？去！抓到賊正講！');
          else await S.say('彭阿伯', '抓得到正講！竹床、寮仔肚、竹林邊，你兜看詳細滴仔。');
          return;
        }
        S.emote('peng', '💢');
        await S.say('彭阿伯', '哪位个貓仔！偷食𠊎个柿餅！');
        S.emote('tuanzi', '!');
        await S.say('tuanzi:surprise', '本、本大仙是石虎！而且只吃了……一、兩……三個。');
        await S.say('彭阿伯', '三個？𠊎這幾架少了三百個！');
        await S.say('hongying:think', '三百個？糰子的肚子裝不下……應該。');
        await S.say('yungui:smug', '阿伯，我們幫你抓真正的賊。抓到了，那三個就算了？');
        await S.say('彭阿伯', '……抓得到正講！');
        S.quest('q_persimmon', 0);
      },
    }],
    enemies: [
      { id: 'rw1', troop: 't4_road_a', x: 8, y: 12, art: 'wind_sprite', radius: 3, lv: 14, if: (st) => !broken(st) },
      { id: 'rw2', troop: 't4_road_d', x: 11, y: 33, art: 'wind_sprite', radius: 3, lv: 14, if: (st) => !broken(st) },
      { id: 'rr1', troop: 't4_road_b', x: 26, y: 31, art: 'rat_demon', variant: 1, radius: 3, lv: 14 },
      { id: 'rg1', troop: 't4_road_c', x: 23, y: 8, art: 'mountain_ghost', radius: 2, lv: 15, if: (st) => !broken(st) },
    ],
    events: [
      { id: 'c4_406', trigger: 'auto', if: (st) => !st.flags.ch4_road, run: scene406 },
      { id: 'bogong', trigger: 'action', x: 12, y: 17, w: 2, h: 2, label: '參拜', run: async (S) => { await savePrompt(S, '伯公——客家人這樣稱呼土地公。大樟樹下的小小伯公壇，擺著一碗清水、三顆柿子。'); } },
      {
        id: 'clue1', trigger: 'action', x: 31, y: 8, w: 2, h: 1, label: '調查', if: (st) => G.Quests.stage('q_persimmon') >= 0 && !st.flags.ch4_persimmon_done,
        run: async (S) => {
          await S.say('', '每一個被咬過的柿餅上，都有一排細細的齒痕。');
          await S.say('yungui:normal', '糰子是一口吞的，不會留這種齒痕。');
          await S.say('tuanzi:think', '……這算是在幫我說話嗎？');
          await persimmonClue(S, 1);
        },
      },
      {
        id: 'clue2', trigger: 'action', x: 36, y: 12, w: 1, h: 1, label: '調查', if: (st) => G.Quests.stage('q_persimmon') >= 0 && !st.flags.ch4_persimmon_done,
        run: async (S) => { await S.say('', '柿霜白粉上，一串小小的四爪腳印，往竹林去。'); await persimmonClue(S, 2); },
      },
      {
        id: 'clue3', trigger: 'action', x: 40, y: 10, w: 1, h: 1, label: '調查', if: (st) => G.Quests.stage('q_persimmon') >= 0 && !st.flags.ch4_persimmon_done,
        run: async (S) => {
          await S.say('', '沿路掉了好多柿蒂。');
          await S.say('baizhi:think', '像是有人一邊走一邊吃，還把蓋子丟掉。');
          await S.say('xinghe:laugh', '那叫蒂，不叫蓋子啦。');
          await persimmonClue(S, 3);
        },
      },
    ],
    warps: [
      { x: 0, y: 20, h: 2, to: 'zhuqian', tx: 54, ty: 21, tdir: 'left' },
      { x: 43, y: 24, h: 2, to: 'hakka_village', tx: 1, ty: 22, tdir: 'right' },
      { x: 41, y: 17, to: 'rat_den', tx: 10, ty: 14, tdir: 'up', if: (st) => !!st.flags.ch4_persimmon_clues },
    ],
  });

  // ----------------------------------------------------------------------- 1-7 rat_den 鼠窩
  G.Maps.define('rat_den', {
    name: '鼠窩', subtitle: '柿子山路', place: 'hsinchu', bgm: 'forest', start: [10, 14],
    light: { ambient: 0.6, color: '#0a0806', playerR: 230 }, particles: [{ type: 'dust', density: 0.6 }],
    tiles: (() => {
      const g = new Grid(20, 16, 'C');
      g.rect(9, 12, 3, 4, 'v').rect(6, 8, 9, 4, 'v').rect(5, 3, 2, 6, 'v').rect(7, 2, 11, 4, 'v');
      return g.rows();
    })(),
    objects: [
      { t: 'basket', x: 9, y: 2, v: 1 }, { t: 'basket', x: 11, y: 2, v: 1 }, { t: 'drying_rack', x: 13, y: 2, v: 1 },
      { t: 'bones', x: 12, y: 9 }, { t: 'rock_small', x: 7, y: 10 }, { t: 'rock_small', x: 14, y: 8 }, { t: 'stump', x: 17, y: 5 },
    ],
    lights: [{ x: 10, y: 9, r: 170, color: '#fff2d0', flicker: 0.05 }, { x: 12, y: 3, r: 160, color: '#fff2d0', flicker: 0.05 }],
    drawGround: (ctx, t) => {
      for (const [x, y] of [[8, 10], [12, 11], [6, 5], [10, 13], [15, 4], [8, 4]]) {
        ctx.fillStyle = '#d8762a'; ctx.beginPath(); ctx.ellipse(x * T + 20, y * T + 40, 9, 6, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a7a2a'; ctx.fillRect(x * T + 17, y * T + 32, 6, 3);
      }
      if (!F('ch4_ratking_beaten') && G.Monsters && G.Monsters.get('rat_demon')) {
        ctx.save(); ctx.translate(10.5 * T, 3.0 * T); ctx.scale(0.55, 0.55);
        G.Monsters.draw(ctx, 'rat_demon', 0, 0, t, { state: 'idle', variant: 2 });
        ctx.restore();
      }
    },
    chests: [{ id: 'c4_10', x: 16, y: 4, item: 'ac_tongling', if: (st) => !!st.flags.ch4_ratking_beaten, run: async (S) => { await S.give('xumingsan', 2); } }],
    enemies: [
      { id: 'den_a', troop: 't4_den_a', x: 10, y: 10, art: 'rat_demon', variant: 1, radius: 1, chase: 2, respawn: false, lv: 14 },
      { id: 'den_b', troop: 't4_den_b', x: 6, y: 6, art: 'rat_demon', variant: 1, radius: 1, chase: 2, respawn: false, lv: 14 },
    ],
    events: [{
      id: 'ratking', trigger: 'touch', x: 7, y: 2, w: 3, h: 4, if: (st) => !st.flags.ch4_ratking_beaten,
      run: async (S) => {
        await S.say('', '柿餅堆成的王座上，一隻圓滾滾的大鼠正抱著柿餅啃。');
        await S.say('柿鼠大王', '吱！這是本王的冬糧！');
        await S.say('tuanzi:surprise', '你、你也太胖了吧！');
        await S.say('柿鼠大王', '你也沒資格說本王！');
        await S.say('hongying:laugh', '……他說得對。');
        const r = await S.battle('t4_ratking');
        if (r !== 'win') return;
        S.flag('ch4_ratking_beaten');
        await S.say('', '王座底下，壓著一大袋還沒啃完的柿餅。');
        await S.give('key_stolen_shibing', 1);
        S.quest('q_persimmon', 2);
      },
    }],
    warps: [{ x: 10, y: 15, to: 'hakka_road', tx: 41, ty: 18, tdir: 'down' }],
  });

  // @@PART5@@
})();

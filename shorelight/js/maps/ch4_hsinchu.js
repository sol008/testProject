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
  addSkill('e_wd_storm', { name: '九降・亂流', desc: '整座風穴的風，同時撲了過來。', mp: 0, type: 'mag', elem: 'wood', target: 'enemies', power: 1.2, delay: 1.2, buffs: [{ stat: 'spd', amt: -0.3, turns: 2 }], fx: 'wind', sfx: 'wind' });

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
    name: '哭風精', art: 'wind_sprite', variant: 1, lv: 15, elem: 'wood', m: { hp: 1.05, atk: 1.0, mag: 1.3, spd: 1.4 },
    skills: [['e_wind_blade', 2], ['e_wind_howl', 2], ['e_gust_spin', 1]], drops: [['mat_fengxu', 0.4], ['xiangbao', 0.1]],
    desc: '風裡的哭聲聚成了形。它一邊撲人，一邊喊著一個誰也聽不清的名字。',
  });
  edef('e_wind_sprite_storm', {
    name: '亂流精', art: 'wind_sprite', variant: 2, lv: 17, elem: 'wood', resist: ['water'], m: { hp: 1.1, atk: 1.05, mag: 1.35, spd: 1.45 },
    skills: [['e_wind_cyclone', 2], ['e_wind_blade', 2], ['e_gust_spin', 1]], drops: [['mat_fengxu', 0.5], ['xumingsan', 0.08]],
    desc: '風穴深處被燈火攪亂的氣流。它沒有方向，只是一直轉、一直轉。',
  });
  edef('e_rat_persimmon', {
    name: '柿鼠', art: 'rat_demon', variant: 1, lv: 14, elem: 'water', weak: ['earth'], m: { hp: 1.0, atk: 1.1, spd: 1.3, luk: 2 },
    skills: [['e_rat_gnaw', 3], ['e_persimmon_throw', 2], ['e_rat_swarm', 1]], drops: [['shibing', 0.25], ['jiedu', 0.15]],
    desc: '偷吃柿餅吃到毛都變成橘紅色的老鼠。身上有一股甜甜的柿子味。',
  });
  edef('e_rat_king', {
    name: '柿鼠大王', art: 'rat_demon', variant: 2, lv: 15, elem: 'water', weak: ['earth'], boss: true, immune: BOSS_IMM, scale: 1.6,
    m: { hp: 16, atk: 4.2, mag: 2.2, def: 1.2, spd: 1.85, exp: 5, gold: 6 }, // sim_story: was hp 10 atk 2.3 mag 1.2 spd 1
    skills: [['e_ratking_belly', 3], ['e_rat_swarm', 2], ['e_ratking_call', 1], ['e_ratking_gorge', 2, 'hp<50']],
    drops: [['mat_ratking_tooth', 1], ['shibing', 1]],
    desc: '坐在柿餅王座上的大老鼠，圓得像一顆柿子。牠堅持那三百個柿餅是「冬糧」。',
  });
  edef('e_mountain_ghost_chief', {
    name: '山鬼頭目', art: 'mountain_ghost', variant: 1, lv: 16, elem: 'earth', weak: ['wood'], resist: ['water'], m: { hp: 1.7, atk: 1.35, def: 1.15, spd: 0.95 },
    skills: [['e_mountain_rock', 2], ['e_mountain_stomp', 2], ['e_mountain_mimic', 1], ['e_heavy', 1]], drops: [['mat_shanguimao', 0.5], ['xumingsan', 0.1]],
    desc: '五指山的山鬼裡年紀最大的一個。牠會學人說話，學得最像的是「救命」。',
  });
  edef('e_cave_bat', {
    name: '風穴蝙蝠', art: 'mine_bat', variant: 1, lv: 15, elem: 'wood', m: { hp: 0.8, atk: 0.8, spd: 1.35, def: 0.8 },
    skills: [['e_bat_swarm', 3], ['e_bite', 2], ['e_bat_screech', 1]], drops: [['xiangbao', 0.15]],
    desc: '倒掛在風穴岩壁上的灰白蝙蝠。風一吹，牠們就像一片片紙灰一樣飛起來。',
  });
  edef('e_wind_drowned', {
    name: '溺風魂', art: 'sea_wisp', variant: 2, lv: 16, elem: 'water', weak: ['earth'], resist: ['fire'], m: { hp: 1.1, atk: 0.9, mag: 1.35, gold: 0 },
    skills: [['e_drown_pull', 2], ['e_drowned_cry', 2], ['e_ghost_touch', 1]], drops: [['mat_tear', 0.3]],
    desc: '被風從海上捲來的溺死者的魂，衣角化成了風絲。它不想打——它只是很冷。（白芷的渡魂謠能送它走。）',
  });
  edef('e_wind_demon', {
    name: '風魔', art: 'wind_demon', lv: 18, elem: 'wood', weak: ['metal'], resist: ['wood'], boss: true, immune: BOSS_IMM,
    m: { hp: 16.5, atk: 2.35, mag: 2.3, def: 1.15, spd: 1.35, exp: 7, gold: 55.2 },
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
        skills: [['e_wd_inhale', 1], ['e_wd_gust', 2], ['e_wd_vortex', 1]],
      },
    ],
    drops: [['ac_fenggu', 1]],
    desc: '一盞龜裂的長明燈綁住了九降風。它的臉是千百張臉疊在一起——它說的不是「還我」，是「放我走」。',
  });
  const troop = (id, enemies, bg, bgm, extra) => { if (!D.troops[id]) D.troops[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle' }, extra || {}); };
  troop('t4_coast_intro', ['wind_sprite', 'wind_sprite'], 'hakka', 'battle', { flee: false });
  troop('t4_coast_a', ['wind_sprite', 'wind_sprite'], 'hakka');
  troop('t4_coast_b', ['wind_sprite', 'rat_spirit_v2'], 'hakka');
  troop('t4_coast_c', ['rat_spirit_v2', 'rat_spirit_v2', 'rat_spirit_v2'], 'hakka');
  troop('t4_road_a', ['wind_sprite', 'e_rat_persimmon'], 'hakka');
  troop('t4_road_b', ['e_rat_persimmon', 'e_rat_persimmon'], 'hakka');
  troop('t4_road_c', ['mountain_ghost'], 'hakka');
  troop('t4_road_d', ['wind_sprite', 'wind_sprite', 'e_rat_persimmon'], 'hakka');
  troop('t4_den_a', ['e_rat_persimmon', 'e_rat_persimmon', 'e_rat_persimmon'], 'forest');
  troop('t4_den_b', ['e_rat_persimmon', 'e_rat_persimmon', 'rat_spirit_v2'], 'forest');
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
  Q.q_persimmon = { name: '柿柿如意', desc: '彭阿伯的柿餅少了三百個，芋圓嘴角卻是橘色的。', stages: ['在柿餅寮附近調查三處線索。', '鼠窩裡有誰在啃柿餅？', '把失竊的柿餅交還彭阿伯。'], doneText: '真正的賊是柿鼠大王。' };
  Q.q_leicha = { name: '擂茶課', desc: '滿妹婆說：擂茶愛擂，正有味。', stages: ['跟滿妹婆學擂茶。'], doneText: '硬頸，也愛曉得轉彎。' };
  Q.q_shange_yungui = { name: '山歌擂台・道士篇', desc: '阿福想跟在旁邊笑了半天的道士哥對山歌。', stages: ['在禾埕跟阿福對山歌。'], doneText: '道士哥的歌像在念經，毋過押得準。' };
  if (!Q.q_tuanzi_mush) Q.q_tuanzi_mush = { name: '雲歸的蕈譜', desc: '雲歸的蕈譜上有七個空格。他負責……試吃，為了研究。', stages: ['找到蕈譜上的蕈。', '找到蕈譜上的蕈。', '等待下一種蕈。'] };

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

  // 賽夏 house (screenplay 8-3 asks for it; no existing building fits — slate houses / kuba belong to other peoples).
  // Bamboo-and-wood walls, a thatched gable roof, the floor slightly raised on short posts. 4x3, door column 1.
  if (G.Objects && !G.Objects.get('c4_saisiyat_house')) {
    const cache = {};
    const paint = (g, v) => {
      const rng = U.seeded(17 + v * 31);
      const W = 256;
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(W / 2, 186, 134, 14, 0, 0, Math.PI * 2); g.fill();
      for (const x of [18, 92, 164, 234]) { g.fillStyle = '#4e3622'; g.fillRect(x - 4, 146, 8, 40); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x - 4, 146, 2, 40); }
      g.fillStyle = '#3e2a18'; g.fillRect(6, 142, 244, 9);
      // bamboo / plank walls
      const wy0 = 64, wy1 = 144;
      let lg = g.createLinearGradient(0, wy0, 0, wy1); lg.addColorStop(0, '#9a7a48'); lg.addColorStop(1, '#c4a46a');
      g.fillStyle = lg; g.fillRect(12, wy0, 232, wy1 - wy0);
      for (let x = 14; x < 242; x += 8) {
        g.fillStyle = U.shade('#b8965c', (rng() - 0.5) * 0.25); g.fillRect(x, wy0, 6, wy1 - wy0);
        g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(x + 6, wy0, 2, wy1 - wy0);
        for (let y = wy0 + 10 + rng() * 10; y < wy1; y += 22 + rng() * 8) { g.fillStyle = 'rgba(70,50,25,0.5)'; g.fillRect(x, y, 6, 1.5); }
      }
      g.fillStyle = '#5a3c22'; g.fillRect(12, 92, 232, 4); g.fillRect(12, 126, 232, 4);
      // woven ramie / rattan panel
      g.save(); g.beginPath(); g.rect(150, 78, 74, 40); g.clip();
      g.fillStyle = '#c8aa72'; g.fillRect(150, 78, 74, 40);
      g.strokeStyle = 'rgba(110,80,40,0.7)'; g.lineWidth = 1.5;
      for (let k = -40; k < 120; k += 7) { g.beginPath(); g.moveTo(150 + k, 78); g.lineTo(150 + k + 40, 118); g.stroke(); g.beginPath(); g.moveTo(150 + k + 40, 78); g.lineTo(150 + k, 118); g.stroke(); }
      g.restore();
      g.strokeStyle = '#4e3622'; g.lineWidth = 3; g.strokeRect(150, 78, 74, 40);
      // doorway (column 1) with a notched log step
      g.fillStyle = '#16100a'; g.fillRect(78, 80, 38, 64);
      g.strokeStyle = '#4e3622'; g.lineWidth = 5; g.strokeRect(76, 78, 42, 66);
      g.fillStyle = 'rgba(255,200,120,0.10)'; g.fillRect(80, 120, 34, 24);
      g.save(); g.translate(97, 186); g.rotate(-0.08);
      g.fillStyle = '#6a4a2c'; g.fillRect(-7, -42, 14, 42);
      for (let y = -38; y < 0; y += 9) { g.fillStyle = '#2a1a0e'; g.fillRect(-7, y, 14, 2.5); }
      g.restore();
      // thatched gable roof
      const ridgeY = -52, eaveY = 84;
      g.beginPath(); g.moveTo(-10, eaveY); g.lineTo(40, ridgeY); g.lineTo(216, ridgeY); g.lineTo(266, eaveY); g.closePath();
      lg = g.createLinearGradient(0, ridgeY, 0, eaveY); lg.addColorStop(0, '#cdb072'); lg.addColorStop(0.6, '#a8864a'); lg.addColorStop(1, '#7a5a30');
      g.fillStyle = lg; g.fill();
      g.save(); g.clip();
      for (let i = 0; i < 520; i++) {
        const x = -10 + rng() * 276, y = ridgeY + rng() * (eaveY - ridgeY);
        g.strokeStyle = U.rgba(U.shade('#b8965a', (rng() - 0.5) * 0.6), 0.55); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - 128) * 0.04, y + 10 + rng() * 10); g.stroke();
      }
      for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(70,45,20,0.28)'; g.fillRect(-10, ridgeY + 30 + k * 30, 280, 3); }
      g.restore();
      g.strokeStyle = '#5a3e1e'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-10, eaveY); g.lineTo(40, ridgeY); g.lineTo(216, ridgeY); g.lineTo(266, eaveY); g.stroke();
      // ragged eave fringe
      g.fillStyle = '#7a5a30';
      for (let x = -10; x < 266; x += 5) { const h = 4 + rng() * 6; g.fillRect(x, eaveY - 1, 3, h); }
      // ridge cap with bindings
      g.fillStyle = '#5e4024'; g.fillRect(36, ridgeY - 8, 184, 10);
      for (let x = 44; x < 216; x += 22) { g.fillStyle = '#3a2614'; g.fillRect(x, ridgeY - 10, 4, 14); }
      // a bundle of 芒草 hung by the door, a basket
      g.strokeStyle = '#d8d0a0'; g.lineWidth = 1.4;
      for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(128, 90); g.quadraticCurveTo(128 + k * 2 - 6, 104, 124 + k * 3 - 8, 122); g.stroke(); }
      g.fillStyle = '#8a6a3a'; g.beginPath(); g.ellipse(214, 140, 14, 8, 0, 0, Math.PI * 2); g.fill();
    };
    G.Objects.define('c4_saisiyat_house', {
      w: 4, h: 3, solid: true,
      solidAt: (o, dx, dy) => !(dx === 1 && dy === 2),
      draw(ctx, px, py, o) {
        const v = (o.v | 0) % 3;
        let c = cache[v];
        if (!c) {
          c = cache[v] = U.makeCanvas(296, 312);
          const g = c.getContext('2d');
          g.translate(20, 120);
          paint(g, v);
        }
        ctx.drawImage(c, px - 20, py - 120, c.lw || 296, c.lh || 312);
      },
    });
  }
  // persimmon fruit hung on fallback trees (tree_camphor) — drawn over the crowns
  function drawPersimmons(ctx, trees, ripe, ms) {
    if (ms && ms.view3d && G.R3 && G.R3.enabled()) return; // 3D: real fruit in the crowns (persimmons3d)
    for (const [x, y] of trees) {
      const cx = x * T + T / 2, cy = (y + 1) * T - 150;
      for (let i = 0; i < 16; i++) {
        const a = U.hash(x, y + i, 11) * Math.PI * 2, r = Math.sqrt(U.hash(x + i, y, 12));
        const fx = cx + Math.cos(a) * r * 70, fy = cy + Math.sin(a) * r * 50;
        const bad = !ripe && U.hash(x, i, 13) < 0.45;
        ctx.fillStyle = bad ? '#4a2a1a' : '#f07a1a';
        ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = bad ? 'rgba(0,0,0,0.2)' : 'rgba(255,220,160,0.6)'; ctx.beginPath(); ctx.arc(fx - 2, fy - 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a5a1a'; ctx.fillRect(fx - 1, fy - 8, 3, 3);
      }
    }
  }
  // 3D field view (update3d): the same 16 fruit per tree on the camphor crown's outer shell (crown ≈ 2.9 m up)
  function persimmons3d(view, trees, ripe) {
    const T3 = window.THREE;
    let s = view.__pers;
    if (s && s.ripe === ripe) return;
    if (s) { view.scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.material.dispose(); }
    const mesh = new T3.InstancedMesh(new T3.SphereGeometry(0.085, 8, 6), new T3.MeshStandardMaterial({ roughness: 0.4 }), trees.length * 16);
    const m4 = new T3.Matrix4(), col = new T3.Color();
    let k = 0;
    for (const [x, y] of trees) {
      for (let i = 0; i < 16; i++) {
        const a = U.hash(x, y + i, 11) * Math.PI * 2, p = 0.35 + U.hash(x + i, y, 12) * 1.0;
        const bad = !ripe && U.hash(x, i, 13) < 0.45;
        m4.makeTranslation(x + 0.5 + Math.cos(a) * Math.sin(p) * 1.4, 2.9 + Math.cos(p) * 1.05, y + 0.5 + Math.sin(a) * Math.sin(p) * 1.4);
        mesh.setMatrixAt(k, m4);
        mesh.setColorAt(k, col.set(bad ? '#4a2a1a' : '#f07a1a'));
        k++;
      }
    }
    mesh.castShadow = true;
    view.scene.add(mesh);
    view.__pers = { mesh, ripe };
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
  async function stepBack(S, dir) {
    const m = G.mapScene;
    const back = dir || U.opposite[m.player.dir];
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

  // 逆風輸入無效: the engine's wind mechanic (js/engine/mapmech.js) blocks stepping straight against an active gust and
  // pushes the player between steps, so the per-map wind guard this chapter used to install is no longer needed.
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
      b: [['再喚芋圓滾山崗', '趣', true], ['順便叫你去餵羊', '衝', true], ['明天再唱也無妨', '平', true]],
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
      { t: 'city_wall', x: 6, y: 32, w: 6, v: 1 }, { t: 'gate_city', x: 12, y: 31, text: '拱宸門' }, { t: 'city_wall', x: 15, y: 32, w: 33, v: 1 },
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
    await S.jump('yuyuan', 30);
    S.emote('yuyuan', '💧');
    await S.say('', '芋圓被風吹得在地上翻了兩圈，毛全炸開，一把抱住紅纓的小腿，死都不放。');
    await S.say('', '麻糬倒是安安穩穩地趴在白芷腳邊，連鬍鬚都沒動一下。');
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
    await S.warp('zhuqian_coast', 36, 7, 'up', { fade: 0, reload: true });
    await S.fadeIn(0.8);
    S.sfx('coin');
    await S.say('', '米粉寮前擺了桌，紅布、鞭炮、熱騰騰的炒米粉。');
    await S.say('阿玉', '我阿爸講，是你們讓風轉來的。多謝！');
    await S.say('baizhi:think', '長長的米粉……我吃了三碗，是不是可以活三倍久？');
    await S.say('yungui:smug', '會胖三倍。');
    await S.say('', '芋圓面前疊著七個空碗。他還在舔第八個。');
    await S.say('hongying:laugh', '芋圓，你會滾著走。');
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
      { id: 'north_block', trigger: 'touch', x: 13, y: 1, w: 2, h: 1, run: async (S) => { await S.say('xinghe:think', '回頭路……還是先辦正事吧。'); await stepBack(S, 'down'); } },
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
    g.rect(26, 0, 3, 2, '#').rect(26, 42, 3, 2, '#').rect(0, 20, 1, 3, '#').rect(55, 20, 1, 3, '#');
    // gardens
    g.rect(1, 2, 54, 2, ',').rect(1, 39, 54, 3, ',').rect(1, 27, 3, 6, ',').rect(50, 27, 5, 6, ',');
    // main streets (stone) and lanes
    g.rect(2, 10, 52, 1, '=');
    g.rect(2, 33, 24, 1, '=').rect(29, 34, 25, 1, '=');
    g.rect(9, 11, 1, 10, '=').rect(44, 11, 1, 10, '=').rect(8, 23, 1, 10, '=').rect(45, 23, 1, 11, '=');
    g.rect(26, 2, 3, 12, '#');
    g.rect(23, 13, 10, 2, '#').rect(23, 13, 2, 7, '#').rect(31, 13, 2, 7, '#');
    g.rect(1, 21, 54, 2, '#');
    g.rect(26, 28, 3, 14, '#');
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
      // north row
      { t: 'house_minnan', x: 2, y: 4, v: 0 }, { t: 'shophouse', x: 8, y: 7, text: '竹風客棧' }, { t: 'house_minnan', x: 13, y: 5, v: 1 },
      { t: 'shophouse', x: 19, y: 6, text: '雜貨', v: 0 }, { t: 'house_minnan', x: 30, y: 5, v: 1 },
      { t: 'shophouse', x: 38, y: 7, text: '打鐵舖', v: 2 }, { t: 'shophouse', x: 45, y: 7, text: '回春堂', v: 1 }, { t: 'house_minnan', x: 49, y: 3, v: 0 },
      // middle
      { t: 'house_minnan', x: 2, y: 12, v: 1 }, { t: 'house_minnan', x: 13, y: 12, v: 0 }, { t: 'shophouse', x: 4, y: 16, text: '布莊', v: 3 },
      { t: 'house_minnan', x: 13, y: 16, v: 1 }, { t: 'shophouse', x: 39, y: 13, v: 3 }, { t: 'house_minnan', x: 46, y: 12, v: 1 },
      { t: 'shophouse', x: 35, y: 16, text: '茶行', v: 1 },
      // south
      { t: 'tree_banyan', x: 4, y: 23 }, { t: 'shophouse', x: 10, y: 24, text: '餅舖', v: 2 }, { t: 'house_minnan', x: 14, y: 24, v: 0 },
      { t: 'house_minnan', x: 10, y: 30, v: 1 }, { t: 'house_minnan', x: 17, y: 30, v: 0 },
      { t: 'house_minnan', x: 2, y: 35, v: 0 }, { t: 'shophouse', x: 11, y: 36, v: 0 }, { t: 'house_minnan', x: 18, y: 36, v: 1 },
      { t: 'house_minnan', x: 39, y: 24, v: 0 }, { t: 'shophouse', x: 47, y: 24, v: 3 },
      { t: 'shophouse', x: 33, y: 31, v: 0 }, { t: 'house_minnan', x: 39, y: 31, v: 1 },
      { t: 'shophouse', x: 31, y: 36, v: 2 }, { t: 'house_minnan', x: 38, y: 36, v: 0 }, { t: 'house_minnan', x: 47, y: 36, v: 1 },
      soulLamp(5, 7), soulLamp(16, 8), soulLamp(33, 8), soulLamp(5, 15), soulLamp(16, 15), soulLamp(49, 15), soulLamp(42, 27), soulLamp(16, 19), soulLamp(21, 39),
      // plaza
      { t: 'stall', x: 20, y: 22, text: '米粉湯' }, { t: 'stall', x: 24, y: 24, text: '柿餅', v: 1 }, { t: 'stall', x: 33, y: 23, text: '長明燈', v: 2 },
      { t: 'soul_jar', x: 32, y: 23, if: (st) => !broken(st) }, { t: 'soul_jar', x: 35, y: 23, if: (st) => !broken(st) },
      { t: 'lantern_string', x: 19, y: 20, w: 8 }, { t: 'lantern_string', x: 29, y: 20, w: 8 },
      { t: 'incense_burner', x: 29, y: 20 }, { t: 'well', x: 32, y: 29 },
      { t: 'basket', x: 23, y: 25, v: 1 }, { t: 'bench', x: 34, y: 26 }, { t: 'bench', x: 20, y: 26 },
      { t: 'stone_lantern', x: 24, y: 19 }, { t: 'stone_lantern', x: 31, y: 19 },
      { t: 'statue_lion', x: 25, y: 19 }, { t: 'statue_lion', x: 30, y: 19, flip: true },
      // alleys & props
      { t: 'jar', x: 30, y: 11 }, { t: 'jar', x: 32, y: 11 }, { t: 'jar', x: 33, y: 12 },
      { t: 'crate', x: 51, y: 17 }, { t: 'crate', x: 53, y: 17 }, { t: 'crate', x: 51, y: 18 }, { t: 'barrel', x: 53, y: 18 },
      { t: 'cart', x: 21, y: 11 }, { t: 'barrel', x: 23, y: 9 }, { t: 'laundry', x: 6, y: 8 }, { t: 'laundry', x: 50, y: 30 },
      { t: 'barrel', x: 37, y: 19 }, { t: 'basket', x: 14, y: 27, v: 2 }, { t: 'basket', x: 48, y: 27, v: 0 }, { t: 'jar', x: 13, y: 33 },
      { t: 'lamp_post', x: 25, y: 12 }, { t: 'lamp_post', x: 29, y: 12 }, { t: 'lamp_post', x: 25, y: 29 }, { t: 'lamp_post', x: 29, y: 29 },
      { t: 'lamp_post', x: 10, y: 20 }, { t: 'lamp_post', x: 43, y: 20 },
    ];
    for (const [x, y] of [[7, 2], [12, 2], [18, 2], [23, 2], [35, 2], [42, 2], [47, 2], [2, 40], [9, 40], [16, 40], [23, 40], [32, 40], [38, 40], [44, 40], [52, 40], [52, 28], [2, 28], [54, 4]]) o.push({ t: 'tree_camphor', x, y });
    for (const [x, y] of [[20, 3], [32, 3], [11, 3], [45, 3], [5, 40], [13, 41], [41, 41], [49, 41], [3, 30], [51, 31]]) o.push({ t: 'flowers', x, y });
    for (const [x, y] of [[22, 4], [36, 4], [3, 32], [53, 29], [24, 28], [30, 28], [11, 22], [42, 18]]) o.push({ t: 'bush', x, y });
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
    await S.say('', '雲歸靠著門柱睡著了。芋圓趴在地上打呼。');
    await S.say('xinghe:think', '（第一卷……？）');
    await S.say('老秀才', '肯聽完的年輕人，越來越少了。這支筆送你們。讀萬卷書，行萬里路。');
    await S.give('ac_maobi', 1);
    S.flag('ch4_scholar_gift');
  }
  async function scene418(S) {
    const c = await S.choice(['前往鹿港', '再等一下'], { cancel: 1 });
    if (c !== 0) return false;
    // point of no return: leaving 竹塹 ends chapter 4 (the caller steps the player back when they wait)
    if (!(await S.pointOfNoReturn({ chapter: 4,
      quests: ['q_yimin', 'q_mifen', 'q_persimmon', 'q_leicha', 'q_shange_yungui'],
      lanterns: { lantern_yimin: 'q_yimin', lantern_mifen_mother: 'q_mifen' } }))) return false;
    await S.fadeOut(0.6);
    S.bgm('pingxi');
    S.hideFollowers(true);
    await S.warp('zhuqian', 27, 38, 'down', { fade: 0 });
    S.spawn({ id: 'f_bz', sprite: 'baizhi', x: 27, y: 40, dir: 'down' });
    S.spawn({ id: 'f_yg', sprite: 'yungui', x: 26, y: 39, dir: 'down' });
    S.spawn({ id: 'f_yy', sprite: 'yuyuan', x: 28, y: 39, dir: 'down' });
    S.spawn({ id: 'f_mc', sprite: 'mochi', x: 26, y: 40, dir: 'down' });
    S.spawn({ id: 'f_hy', sprite: 'hongying', x: 27, y: 36, dir: 'down' });
    await S.fadeIn(0.8);
    await S.say('', '竹塹南門・歌薰門。九降風從背後吹來，乾爽而有力。');
    await S.say('xinghe:smile', '順風耶！');
    await S.say('yungui:normal', '九降風一路往南吹。我們算是被它送一程。');
    await S.say('', '芋圓嘴裡叼著半塊柿餅，一路小跑跟在後面。');
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
    S.move('f_bz', 'DD', { wait: false }); S.move('f_yg', 'DD', { wait: false }); S.move('f_yy', 'DD', { wait: false }); S.move('f_mc', 'DD', { wait: false });
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
          await S.say('yungui:smug', '那就是沒考上嘛。');
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
      { id: 'west_gate', trigger: 'touch', x: 0, y: 20, w: 1, h: 3, run: async (S) => { await S.say('守城兵', '西門外是往南寮港的路。這陣子風大浪大，船攏無出海，去了也沒路用。'); await stepBack(S, 'right'); } },
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
          await stepBack(S, 'left');
          return false;
        },
      },
      {
        x: 27, y: 43, to: 'zhuqian', tx: 27, ty: 40, tdir: 'up',
        run: async (S) => {
          if (!F('ch4_citygod_balanced')) {
            await S.say('守城兵', '往南是中港、後龍，再過去就是鹿港。這陣風，商隊攏停了。等風好再走。');
            await stepBack(S, 'up');
            return false;
          }
          const r = await scene418(S);
          if (r === false && !F('ch4_done')) await stepBack(S, 'up');
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
        await S.say('客棧掌櫃', '竹風蘭雨——竹塹的風，蘭陽的雨。客官要歇到天光，還是歇到暗暝？');
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
    await S.say('yungui:think', '這算盤能算出我一天喝幾口米酒嗎？');
    await S.say('hongying:smug', '算盤會爆。');
    S.cameraFollow();
    await S.say('阿池伯', '咱竹塹這尊是「都城隍」，是全台城隍裡位階上高的，管的範圍上闊。');
    await S.say('阿池伯', '……可是最近，連城隍爺的帳都對不起來啊。');
    await S.say('baizhi:think', '帳？神明也要記帳嗎？');
    await S.say('阿池伯', '人過身了，魂要先到城隍爺面前報到，查明一生善惡，才好往下走。');
    await S.say('阿池伯', '生死簿上寫著「該來」的名，魂卻沒到。一個、十個……愈來愈多。');
    await S.say('阿池伯', '大算盤半暝自己啪啪響，算來算去，就是差一截。');
    await S.say('阿池伯', '七爺八爺連續三暝託夢給我，攏是同一句：「簿上之名，有來無到。」');
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
    S.emote('mochi', '♥');
    await S.say('', '麻糬走過去，輕輕蹭了蹭雲歸的腳。');
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
    await S.say('', '眾人不由自主地垂首。芋圓縮到星河腳後，一動也不敢動；麻糬卻端端正正地坐著，望著那片光。');
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
    await S.warp('zhuqian_citygod', 10, 11, 'up', { fade: 0 });
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
    // clue for 心燈⑪: 阿順伯's night watch opens now, but nothing sent the player back to the north coast
    if (!F('ch4_mifen_defend')) await S.say('hongying:think', '……風裡有人叫名字，北郊米粉寮的阿順伯也說過。出東門前，回去看看他吧？');
    S.quest('q_ch4_main', 1);
    S.objective('出東門迎曦門，經柿樹坪前往五指山');
  }
  async function scene417(S) {
    await S.wait(0.3);
    await S.say('', '都城隍廟。香煙筆直上升。');
    S.face('achi', 'player');
    await S.say('阿池伯', '你們轉來了！昨暝……昨暝大算盤響了一整暝，響完，就對起來了！');
    await S.say('阿池伯', '今早七爺八爺擱託夢，只講兩個字——');
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
  // the two tall figures (七爺 / 八爺) drawn standing at (x, foot); shared by the 2D hook and the 3D cards
  function visionFig(ctx, t, x, foot, h, w, body, glow, text) {
      const gl = ctx.createRadialGradient(x, foot - h * 0.5, 10, x, foot - h * 0.5, h * 0.75);
      gl.addColorStop(0, U.rgba(glow, 0.5)); gl.addColorStop(0.6, U.rgba(glow, 0.18)); gl.addColorStop(1, U.rgba(glow, 0));
      ctx.fillStyle = gl; ctx.fillRect(x - h, foot - h * 1.3, h * 2, h * 1.6);
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
  }
  const VISION_FIGS = [[5.5, 4.4, 1.7, '#f2f0ea', '#ffffff', '一見大吉'], [11.5, 2.7, 1.9, '#22202a', '#6a6a90', '天下太平']];
  function drawVision(ctx, t, ms) {
    const cx = 8 * T + T / 2;
    const in3d = !!(ms && ms.view3d && G.R3 && G.R3.enabled()); // 3D: figures + ledger stand upright (vision3d)
    ctx.save();
    // the warm, unseeable light (no deity is depicted)
    let g = ctx.createRadialGradient(cx, 1.6 * T, 10, cx, 1.6 * T, 5.5 * T);
    g.addColorStop(0, 'rgba(255,236,190,0.95)'); g.addColorStop(0.35, 'rgba(255,210,140,0.45)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - 6 * T, 0, 12 * T, 5 * T);
    if (in3d) { ctx.restore(); return; }
    for (const [fx, h, w, body, glow, text] of VISION_FIGS) visionFig(ctx, t, fx * T, 7.6 * T, h * T, w * T, body, glow, text);
    drawLedger(ctx, t, cx, 5.2 * T + Math.sin(t * 1.4) * 6);
    ctx.restore();
  }
  // floating ledger with fading names
  function drawLedger(ctx, t, bx, by) {
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
  }
  // 3D field view (update3d): the figures as upright camera-facing cards, the ledger floating at chest height
  function vision3d(view) {
    const T3 = window.THREE;
    let s = view.__c4v;
    if (!s) {
      s = view.__c4v = { cards: [] };
      const card = (w, h, paint, x, y, z) => {
        const c = U.makeCanvas(w, h);
        paint(c.getContext('2d'));
        const m = new T3.Mesh(new T3.PlaneGeometry(w / T, h / T), new T3.MeshBasicMaterial({ map: G.R3M.canvasTex(c), transparent: true, depthWrite: false, side: T3.DoubleSide, fog: false }));
        m.position.set(x, y, z); m.renderOrder = 4;
        view.scene.add(m);
        s.cards.push(m);
        return m;
      };
      for (const [fx, h, w, body, glow, text] of VISION_FIGS) {
        const H = h * T;
        card(2 * H, 1.6 * H, (g) => visionFig(g, 0, H, 1.3 * H, H, w * T, body, glow, text), fx, 0.5 * h, 7.6);
      }
      s.ledger = card(220, 200, (g) => drawLedger(g, 0, 110, 70), 8.5, 1.5, 6.4);
    }
    for (const m of s.cards) m.rotation.y = view.yaw;
    s.ledger.position.y = 1.5 + Math.sin(view.t * 1.4) * 0.09;
  }
  G.Maps.define('citygod_vision', {
    name: '城隍幻境', subtitle: '簿上之名，有來無到', place: 'hsinchu', bgm: null, start: [8, 9], noSave: true, autosave: false,
    light: { ambient: 0.5, color: '#2a2010' }, particles: [{ type: 'motes', density: 0.8 }, 'sparkles'],
    tiles: (() => { const g = new Grid(16, 12, ' '); g.rect(2, 2, 12, 9, '*'); return g.rows(); })(),
    drawGround: (ctx, t, ms) => drawVision(ctx, t, ms),
    update3d: (view) => vision3d(view),
    events: [{ id: 'c4_405', trigger: 'auto', if: (st) => !st.flags.ch4_citygod_vision, run: scene405 }],
    warps: [{ x: 8, y: 10, to: 'zhuqian_citygod', tx: 10, ty: 11, tdir: 'up', if: (st) => !!st.flags.ch4_citygod_vision }],
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
  const ROAD_PERS = [[28, 3], [31, 3], [39, 3], [27, 8], [27, 12], [39, 6], [40, 13], [29, 13], [38, 9], [35, 11]];
  function roadObjects() {
    const o = [
      { t: 'tree_camphor', x: 11, y: 15 }, { t: 'shrine_small', x: 12, y: 17, text: '伯公' },
      { t: 'granary', x: 35, y: 4 },
      { t: 'drying_rack', x: 29, y: 6, v: 1 }, { t: 'drying_rack', x: 32, y: 6, v: 1 }, { t: 'drying_rack', x: 31, y: 8, v: 1 }, { t: 'drying_rack', x: 34, y: 8, v: 1 },
      { t: 'drying_rack', x: 29, y: 11, v: 1 }, { t: 'drying_rack', x: 33, y: 13, v: 1 }, { t: 'drying_rack', x: 37, y: 13, v: 1 }, { t: 'drying_rack', x: 36, y: 10, v: 1 },
      { t: 'rock_big', x: 42, y: 16 }, { t: 'basket', x: 38, y: 7, v: 1 },
      { t: 'signboard', x: 1, y: 18, text: '柿樹坪' }, { t: 'fence_bamboo', x: 21, y: 26, w: 7 },
    ];
    for (const [x, y] of ROAD_PERS) o.push({ t: 'tree_camphor', x, y, v: 3 });
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
    S.emote('yuyuan', '!');
    await S.say('', '芋圓的鼻子動了動——下一刻，他一溜煙衝向遠處的柿餅寮。');
    S.move('yuyuan', 'RRRRRR', { wait: false, speed: 7 });
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
    drawOver: (ctx, t, ms) => drawPersimmons(ctx, ROAD_PERS, broken(G.state), ms),
    update3d: (view) => persimmons3d(view, ROAD_PERS, broken(G.state)),
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
      { id: 'c4_09', x: 17, y: 24, gold: 800 },
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
          await S.say('', '芋圓蹭了蹭彭阿伯的褲腳，尾巴翹得高高的。');
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
        await S.say('', '芋圓舔了舔嘴角的橘色，一臉無辜。');
        await S.say('xinghe:shy', '他、他最多只吃了……一、兩……三個吧？');
        await S.say('彭阿伯', '三個？𠊎這幾架少了三百個！');
        await S.say('hongying:think', '三百個？芋圓的肚子裝不下……');
        await S.say('', '紅纓看了芋圓圓滾滾的肚子一眼。');
        await S.say('hongying:think', '……應該。');
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
        id: 'clue1', trigger: 'action', x: 31, y: 8, w: 2, h: 1, label: '調查', hint: (st) => !st.flags.ch4_pc_1, if: (st) => G.Quests.stage('q_persimmon') >= 0 && !st.flags.ch4_persimmon_done,
        run: async (S) => {
          await S.say('', '每一個被咬過的柿餅上，都有一排細細的齒痕。');
          await S.say('yungui:normal', '芋圓是一口吞的，不會留這種齒痕。');
          await S.say('', '芋圓瞇著眼看雲歸，像是在問：這算是在幫我說話嗎？');
          await persimmonClue(S, 1);
        },
      },
      {
        id: 'clue2', trigger: 'action', x: 36, y: 12, w: 1, h: 1, label: '調查', hint: (st) => !st.flags.ch4_pc_2, if: (st) => G.Quests.stage('q_persimmon') >= 0 && !st.flags.ch4_persimmon_done,
        run: async (S) => { await S.say('', '柿霜白粉上，一串小小的四爪腳印，往竹林去。'); await persimmonClue(S, 2); },
      },
      {
        id: 'clue3', trigger: 'action', x: 40, y: 10, w: 1, h: 1, label: '調查', hint: (st) => !st.flags.ch4_pc_3, if: (st) => G.Quests.stage('q_persimmon') >= 0 && !st.flags.ch4_persimmon_done,
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
      { t: 'basket', x: 12, y: 9, v: 1 }, { t: 'rock_small', x: 7, y: 10 }, { t: 'rock_small', x: 14, y: 8 }, { t: 'stump', x: 17, y: 5 },
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
        await S.say('xinghe:surprise', '你、你也太胖了吧！');
        await S.say('柿鼠大王', '你身後那隻灰貓也沒資格說本王！');
        S.emote('yuyuan', '💢');
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

  // =====================================================================================================
  // 1-8 hakka_village 柿樹坪客家庄
  // =====================================================================================================
  const night = (st) => !!st.flags.ch4_village_night;
  const villageTiles = (() => {
    const g = new Grid(52, 40, '.');
    g.rect(1, 1, 18, 5, 'f').rect(33, 1, 18, 6, 'f').rect(1, 30, 50, 9, 'f');
    g.rect(30, 34, 22, 1, 'r').rect(40, 34, 1, 1, 'B');
    g.rect(0, 22, 20, 2, '=');
    g.rect(19, 19, 14, 5, ':');
    g.rect(20, 13, 12, 6, '%').rect(21, 14, 10, 4, ':');
    g.rect(32, 20, 20, 2, '=');
    g.line([[28, 12], [28, 5], [24, 5], [24, 0]], '=');
    g.rect(7, 18, 1, 4, '=').rect(39, 17, 1, 3, '=');
    g.rect(44, 22, 1, 4, '=');
    g.rect(24, 24, 1, 6, ':').rect(10, 24, 1, 6, ':');
    return g.rows();
  })();
  function villageObjects() {
    const o = [
      { t: 'hakka_house', x: 21, y: 8, text: '彭城堂' },
      { t: 'shophouse', x: 5, y: 15, text: '徐記', v: 2 }, { t: 'shophouse', x: 38, y: 14, text: '藍衫', v: 1 },
      { t: 'stall', x: 12, y: 19, text: '粄條', v: 1 },
      { t: 'tree_camphor', x: 46, y: 23 }, { t: 'shrine_small', x: 44, y: 26, text: '伯公' },
      { t: 'stone_lantern', x: 34, y: 26 }, { t: 'well', x: 26, y: 24 },
      { t: 'bench', x: 22, y: 18 }, { t: 'bench', x: 27, y: 18 },
      { t: 'basket', x: 29, y: 14, v: 0 }, { t: 'basket', x: 30, y: 15, v: 2 }, { t: 'basket', x: 30, y: 16, v: 2 },
      { t: 'drying_rack', x: 21, y: 14, v: 1 }, { t: 'drying_rack', x: 33, y: 15, v: 1 }, { t: 'drying_rack', x: 33, y: 17, v: 1 },
      { t: 'drying_rack', x: 24, y: 14, v: 1, if: night }, { t: 'drying_rack', x: 26, y: 14, v: 1, if: night },
      { t: 'red_lantern', x: 22, y: 12, hang: true, if: night }, { t: 'red_lantern', x: 25, y: 12, hang: true, if: night },
      { t: 'signboard', x: 50, y: 18, text: '五指山' }, { t: 'signboard', x: 25, y: 1, text: '義民廟' },
      { t: 'cart', x: 16, y: 25 }, { t: 'barrel', x: 10, y: 17 }, { t: 'jar', x: 11, y: 17 }, { t: 'laundry', x: 35, y: 11 },
    ];
    for (const [x, y] of [[40, 3], [44, 5], [47, 3], [36, 8], [3, 8], [15, 8], [49, 10], [2, 26], [47, 28], [19, 27]]) o.push({ t: 'tree_camphor', x, y, v: 3 });
    for (const [x, y] of [[1, 12], [2, 12], [1, 13], [2, 14], [17, 10], [18, 11], [17, 12], [43, 11], [44, 12], [45, 11]]) o.push({ t: 'bamboo', x, y });
    for (const [x, y] of [[4, 2], [8, 3], [13, 2], [36, 3], [42, 2], [5, 32], [12, 35], [20, 31], [28, 33], [36, 36], [46, 31]]) o.push({ t: 'rice_stalks', x, y });
    for (const [x, y] of [[14, 15], [33, 24], [37, 23], [48, 24], [16, 21], [5, 25]]) o.push({ t: 'flowers', x, y });
    for (const [x, y] of [[2, 18], [16, 14], [30, 9], [49, 15], [38, 27]]) o.push({ t: 'bush', x, y });
    return o;
  }
  async function scene407(S) {
    S.flag('ch4_hakka_arrive');
    await S.titleCard('柿樹坪', '客家庄');
    await S.say('', '梯田間，一座座「ㄇ」字形的伙房，禾埕上曬滿了菜脯與柿子。');
    await S.fadeOut(0.5);
    await S.warp('hakka_village', 24, 20, 'up', { fade: 0 });
    S.setPos('afu', 27, 12, 'down'); S.setPos('atao', 33, 19, 'left');
    await S.fadeIn(0.5);
    await S.say('', '山坡上，一個後生仔的歌聲拉得又高又長。');
    await S.say('阿福', '♪ 山歌毋唱忘記多，大路毋行草成窠——');
    await S.say('', '對面坡上，一個細妹笑著回唱。');
    await S.say('阿桃', '♪ 阿哥唱歌恁大聲，驚走山頂一群鵝——');
    await S.say('xinghe:laugh', '哈哈，隔著山坡在吵架？');
    await S.say('yungui:normal', '這叫「對山歌」。客家人在山上做工，一唱一答——唱情、唱趣，也唱來鬥嘴。');
    await S.say('baizhi:think', '「山歌不唱忘記多」……不唱，就會忘記嗎？');
    await S.move('afu', 'DDDDD', { speed: 6 });
    await S.move('afu', 'LLL', { speed: 6 });
    await S.jump('afu', 30);
    S.face('afu', 'down');
    await S.say('阿福', '哦——外地來个細妹，揹恁長个槍，係來打虎个？');
    await S.say('hongying:angry', '關你什麼事。讓開，我們在趕路。');
    await S.say('阿福', '在柿樹坪，問話用講个，答話愛用唱个。');
    await S.say('阿福', '你若有本事，就用山歌回𠊎。');
    await S.say('hongying:angry', '……我為什麼要——');
    await S.move('atao', 'LLLLLLL', { speed: 6 });
    await S.say('阿桃', '阿福哥又在欺負人！細妹，莫驚，佢只會大聲。');
    await S.say('庄民', '有好戲看囉！');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '……誰怕誰！唱就唱！');
    await S.say('xinghe:surprise', '等等，紅纓，妳會唱歌？');
    await S.say('hongying:shy', '……不會。可是洛家人，沒有不戰而逃的。');
    await S.say('yungui:smug', '啊，硬頸。她跟這個庄頭挺合的。');
    await S.say('阿桃', '頭一局，算熱身！');
    await duelRound(S, DUEL_MAIN[0], 'hongying', {});
    await S.say('', '紅纓唱完。全場一片寂靜。一隻烏鴉嘎嘎飛過。');
    await S.say('', '然後，哄堂大笑。');
    await S.say('阿福', '哈哈哈哈！「再唱一句就揍你」——𠊎打山歌打二十年，頭一擺聽到恁直个！');
    await S.say('hongying:cry', '……笑、笑什麼笑！');
    await S.say('yungui:smug', '紅纓唱歌像在喊殺——');
    await S.say('hongying:angry', '雲歸！');
    await S.say('', '芋圓默默把耳朵壓平。');
    await S.say('baizhi:smile', '紅纓，換我試試，好嗎？');
    await S.say('hongying:surprise', '妳？');
    await S.say('baizhi:smile', '我想知道，用歌回答一個人，是什麼感覺。');
    await S.say('阿福', '好！換人唱，這場還沒完！');
    let win = false;
    for (;;) {
      let mine = 0, theirs = 0;
      for (const k of [1, 2]) {
        const r = DUEL_MAIN[k];
        const res = await duelRound(S, r, 'baizhi', {});
        if (k === 1 && res.ia === 1) {
          await S.say('', '觀眾忽然安靜了一瞬。阿福愣在原地，像是忘了下一句。');
          S.emote('afu', '…');
          await S.wait(0.6);
        }
        await crowdReact(S, res);
        mine += res.score; theirs += r.opp;
        await S.say('', `這一局，白芷 ${res.score} 分，阿福 ${r.opp} 分。`);
      }
      if (mine > theirs) { win = true; break; }
      await S.say('阿福', '哈！這局係𠊎贏！');
      // subtle hint: only a win earns 德興伯's 山歌竹笛 (giving up loses it for good)
      await S.say('庄民', '細妹，莫放棄！唱贏阿福个人，德興伯有好東西相送喔！');
      const c = await S.choice(['再唱一遍', '認輸']);
      if (c === 1) break;
    }
    if (win) {
      await S.say('', '最後一個音落下。風好像停了一瞬。');
      await S.say('庄民', '好！唱得好！');
      await S.say('庄民', '這細妹个聲，像山坑水！');
      await S.say('阿福', '……𠊎輸了。輸得心服口服。');
      await S.say('阿福', '細妹，你喊做麼个名？');
      await S.say('baizhi:smile', '白芷。');
      await S.say('阿福', '白芷……恁好聽个名。');
      S.emote('player', '💢');
      await S.say('xinghe:think', '……好了好了，比完了，散會散會。');
      await S.say('yungui:smug', '喔？');
      await S.say('hongying:smug', '喔～？');
      await S.say('xinghe:shy', '幹、幹嘛啦！');
      S.flag('ch4_shange_win');
    } else {
      await S.say('阿福', '歌係𠊎贏。毋過聲——係佢贏。細妹，你个聲，𠊎會記一世人。');
      S.emote('player', '💢');
      await S.say('xinghe:think', '……記一世人是什麼意思。');
      await S.say('yungui:smug', '就是一輩子的意思。');
      await S.say('xinghe:angry', '我知道！');
    }
    S.flag('ch4_shange_duel');
    await S.say('', '人群後方，一個穿著白底紅紋織衣的年輕人吹了聲口哨。');
    await S.move('acheng', 'DDD');
    await S.say('阿成', '唱得真好。比阿福好多了。');
    await S.say('阿福', '阿成！你係來賣苧麻線，還係來拆𠊎个台？');
    await S.say('阿成', '兩樣都做。我是向天湖那邊的賽夏人，來庄裡換鹽。');
    await S.say('阿成', '聽說你們要上五指山？');
    await S.say('xinghe:surprise', '你怎麼知道？');
    await S.say('阿成', '這個庄頭，一隻雞走失，半天全庄都知道。');
    await S.say('阿成', '這陣子的風不對。要上山，趁清早，中午前一定要下來。');
    await S.say('阿成', '中午過後，風穴會先「吸氣」，然後「吐氣」——人是站不住的。');
    await S.say('xinghe:smile', '知道了，謝啦！');
    await S.say('阿成', '……你這個「知道了」，聽起來不太知道。');
    S.spawn({ id: 'mm_s', sprite: 'c4_manmei', x: 23, y: 12, dir: 'down' });
    await S.move('mm_s', 'DDDDD', { speed: 1.6 });
    await S.say('滿妹婆', '吵麼个吵！嗓門大過雞嫲！');
    await S.say('阿福', '滿、滿妹婆……');
    await S.say('滿妹婆', '人客來到禾埕，毋請食茶，倒請人唱歌？𠊎兜劉家个面皮愛放哪？');
    await S.say('滿妹婆', '來來來，入來坐！食飽吂？還無？正好——擂茶、粄條、菜包，盡有！');
    await S.fadeOut(0.8);
    S.remove('mm_s');
    await S.warp('hakka_liu', 9, 8, 'up', { fade: 0 });
    S.spawn({ id: 'dx_s', sprite: 'hakka_m', x: 9, y: 10, dir: 'up' });
    S.show('dx_s', false);
    await S.fadeIn(0.8);
    await S.say('', '桌上擺滿客家菜。');
    await S.say('baizhi:surprise', '這個……像小豬的籠子。');
    await S.say('滿妹婆', '菜包，又喊「豬籠粄」。裡肚包菜脯、蝦米同豬肉。');
    await S.say('baizhi:smile', '……！好軟，好香。像咬到一朵雲，雲裡面有海的味道。');
    await S.say('滿妹婆', '哈哈！這細妹講話像唱歌。');
    await S.say('xinghe:smile', '粄條也好好吃！滑滑的，跟米粉不一樣。');
    await S.say('滿妹婆', '米粉係擠出來个，粄條係蒸好一大片再切个。');
    await S.say('', '紅纓默默扒飯，偶爾偷看大家一眼。滿妹婆夾了一大塊客家小炒放進她碗裡。');
    await S.say('滿妹婆', '唱歌輸，食飯毋使輸。');
    await S.say('hongying:shy', '……謝謝阿婆。');
    S.show('dx_s', true);
    await S.move('dx_s', 'U');
    await S.say('德興伯', '聽講係城隍廟指來个人客？');
    await S.say('德興伯', '這陣風，中秋後就毋著了。風從五指山落來，一路哭。');
    await S.say('德興伯', '奇怪个係，風吹過𠊎兜這條坑，就轉彎走了。老人家講，係義民爺在守。');
    await S.say('德興伯', '早幾個月，有幾個穿黑衫个人，扛一個大木箱上五指山。');
    await S.say('德興伯', '中秋後，又有一個白鬍鬚道長，一個人上山。之後，風就變了。');
    await S.say('yungui:serious', '師父……');
    await S.say('德興伯', '風穴在三指同四指中間。毋過這下風恁大，大人都毋敢上去。');
    await S.say('德興伯', '你兜今暗就歇在劉家。明朝透早，風較細，再上山。');
    await S.say('滿妹婆', '著！食飽，睡飽，正有力。');
    if (F('ch4_shange_win')) {
      await S.say('德興伯', '……還有，白芷細妹。這支笛，係𠊎老弟做个。佢講，山歌唱得好个人正配吹。');
      await S.give('fl_shange', 1);
    }
    // 4-08 伙房之夜
    await S.fadeOut(0.9);
    S.flag('ch4_village_night');
    S.flag('ch4_village_rest');
    await S.warp('hakka_village', 25, 16, 'down', { fade: 0, reload: true });
    S.bgm('night');
    await S.fadeIn(0.9);
    await S.say('', '夜。禾埕上，竹床排滿了削好皮的柿子。風在遠處嗚咽，禾埕裡卻出奇地安靜。');
    await S.say('baizhi:think', '星河，柿子要被風吹多久，才會變成柿餅？');
    await S.say('xinghe:normal', '滿妹婆說，要曬一個多月，還要一直用手捏。捏到最後，表面會長出一層白白的霜。');
    await S.say('baizhi:think', '被風吹很久、被人捏很多次……才會變甜。');
    await S.say('baizhi:smile', '那人也是嗎？被風吹很久，就會變甜？');
    await S.say('xinghe:laugh', '那紅纓大概要吹一百年吧。');
    await S.say('hongying:angry', '我聽到了喔，笨蛋！');
    S.sfx('push');
    await S.say('', '屋內傳來枕頭砸牆的聲音。白芷笑出聲來。星河也笑了。');
    S.move('yungui', 'DDD', { wait: false });
    await S.move('mochi', 'DD');
    await S.say('', '屋簷下，雲歸一個人坐著，葫蘆擱在膝上，沒有喝。麻糬在他身邊坐下，安靜地望著他。');
    await S.say('yungui:think', '……師父也在這種夜裡上山。一個人。');
    await S.say('yungui:normal', '那老頭，最討厭別人擔心他。所以我才不擔心。');
    await S.say('', '他把葫蘆塞上，又拔開，又塞上。');
    await S.say('', '芋圓走過來，把頭靠在他腿上。');
    await S.say('yungui:normal', '……你們也不擔心，對吧。');
    await S.wait(0.8);
    await S.say('', '遠處，北邊的山坡上，傳來一個男人的歌聲。很輕，像是隔了很多很多年。');
    await S.say('遠方的歌聲', '♪ 九降風吹嶺上松，阿妹門前柿曬紅——');
    await S.say('baizhi:surprise', '……有人在唱歌。');
    await S.say('xinghe:think', '這麼晚了……那邊是義民廟的方向。');
    S.sfx('wind');
    await S.say('', '歌聲停在半句。沒有人回唱。風又起了。');
    await S.say('baizhi:sad', '他在等人回答。');
    S.gather();
    S.toast('在劉家橫屋的床上休息，可以「睏到天光」（早上），或「睏到暗晡」（晚上）。', 'lantern');
  }
  async function scene416(S) {
    S.flag('ch4_dexing_thanks');
    await S.wait(0.3);
    await S.say('', '柿樹坪。天很藍。竹床上的柿子覆著一層薄薄的白霜。孩子們在禾埕上追著風跑。');
    await S.say('滿妹婆', '風轉來咧！你兜看，柿霜出來咧！');
    await S.say('德興伯', '承蒙你兜！柿樹坪全庄，欠你兜一個人情。');
    await S.give('caibao', 5);
    S.gold(600);
    await S.say('阿福', '白芷細妹！今暗擺酒，𠊎再唱一條給你聽——');
    await S.say('xinghe:angry', '不用了謝謝！');
    await S.say('hongying:laugh', '哈哈哈！');
    if (!F('ch4_yimin_done')) await S.say('baizhi:think', '……義民塚那位阿哥，還在等人回歌吧。');
    // clue for 紅纓's 擂茶 retry (伙房, at night, after the lamp): otherwise nothing brings the player back at night
    if (F('ch4_leicha_lesson') && !F('ch4_leicha_hongying')) await S.say('hongying:shy', '……今暗，我想去伙房，請滿妹婆再教我一次擂茶。');
  }
  // S5 山歌擂台・道士篇
  async function duelYungui(S) {
    await S.say('阿福', '道士哥，你在旁邊笑了恁久，敢係你也會兩句？');
    await S.say('yungui:smug', '略懂。');
    await S.say('xinghe:think', '雲歸，你什麼時候會唱山歌了？');
    await S.say('yungui:smug', '現在。');
    S.flag('yuyuan_hidden'); S.refresh();
    await S.say('', '雲歸朝禾稈堆後面使了個眼色。芋圓叼著一張黃符鑽了進去，一條毛茸茸的尾巴縮了進去。');
    S.quest('q_shange_yungui', 0);
    const ctx = { sus: 0 };
    let mine = 0, theirs = 0, caught = false;
    for (const r of DUEL_YUNGUI) {
      const res = await duelRound(S, r, 'yungui', ctx);
      if (res.caught) { caught = true; break; }
      await crowdReact(S, res);
      mine += res.score; theirs += r.opp;
      await S.say('', `這一局，雲歸 ${res.score} 分，阿福 ${r.opp} 分。`);
    }
    if (!caught && ctx.sus > 0 && mine >= 300) caught = true;
    S.flag('ch4_s5_tried');
    if (caught) {
      S.spawn({ id: 'yy_hay', sprite: 'yuyuan', x: 29, y: 16, dir: 'down' });
      await S.say('', '芋圓從禾稈堆裡探出頭，頭上插滿稻草，嘴裡叼著一張發光的黃符。');
      await S.say('應聲符', '下一句押「ㄧ」韻啦！');
      S.emote('yy_hay', '?');
      await S.say('', '芋圓眨了眨眼——全場的人都在看他。');
      await S.say('', '全場愣住。然後爆笑。');
      await S.say('阿福', '哈哈哈！道士哥，你這係打山歌，還係打猴戲？');
      await S.say('yungui:smug', '兵不厭詐。');
      await S.say('hongying:angry', '這是唱歌，不是打仗！');
      await S.say('庄民', '好笑！賞佢兩罐米酒！');
      if (!F('ch4_shange_yungui_caught')) await S.give('mijiu', 2);
      S.flag('ch4_shange_yungui_caught');
      S.remove('yy_hay');
    } else if (mine > theirs) {
      await S.say('阿福', '道士哥……你个歌，像在念經，毋過押得準！');
      if (!F('ch4_shange_yungui_win')) { await S.give('hd_huabu', 1); S.quest('q_shange_yungui', 'done'); }
      S.flag('ch4_shange_yungui_win');
    } else {
      await S.say('阿福', '唱得像念經。');
      await S.say('yungui:smug', '本來就是念經的。');
      if (!F('ch4_s5_lost_gift')) { await S.give('mijiu', 1); S.flag('ch4_s5_lost_gift'); }
    }
    S.flag('yuyuan_hidden', false); S.refresh();
  }
  G.Maps.define('hakka_village', {
    name: '柿樹坪', subtitle: '客家庄', place: 'hsinchu',
    bgm: (st) => (night(st) ? 'night' : 'hakka'), start: [2, 22],
    light: (st) => (night(st) ? { ambient: 0.6, color: '#0a1030', playerR: 240 } : broken(st) ? { ambient: 0.05 } : { ambient: 0.12, color: '#2a2418' }),
    particles: (st) => (night(st) ? ['fireflies', { type: 'wind', density: broken(st) ? 0.2 : 0.6 }] : broken(st) ? ['leaves'] : ['leaves', { type: 'wind', density: 0.8 }]),
    tiles: villageTiles, objects: villageObjects,
    drawOver: (ctx, t, ms) => drawPersimmons(ctx, [[40, 3], [44, 5], [47, 3], [49, 10]], broken(G.state), ms),
    update3d: (view) => persimmons3d(view, [[40, 3], [44, 5], [47, 3], [49, 10]], broken(G.state)),
    lights: (st) => (night(st) ? [{ x: 23, y: 11, r: 200, color: '#ff9a4a', flicker: 0.3 }, { x: 7, y: 17, r: 140, color: '#ffb060', flicker: 0.3 }, { x: 39, y: 16, r: 140, color: '#ffb060', flicker: 0.3 }] : []),
    npcs: [
      {
        id: 'manmei_v', sprite: 'c4_manmei', name: '滿妹婆', x: 23, y: 13, dir: 'down', if: (st) => !night(st) && !!st.flags.ch4_hakka_arrive,
        talk: async (S) => {
          if (broken(G.state)) { await S.say('滿妹婆', '風轉來咧！今年个柿餅，霜一定靚。'); return; }
          await sayAll(S, '滿妹婆', ['後生人莫恁懶，硬頸做人，正有飯食。', '這領藍衫？着四十年咧。藍衫愈洗愈靚。', '有事情，入來正廳講。']);
        },
      },
      {
        id: 'dexing', sprite: 'hakka_m', name: '德興伯', x: 32, y: 16, dir: 'left', pos: (st) => (night(st) ? [49, 22] : [32, 16]),
        talk: async (S) => {
          if (night(G.state)) { await S.say('德興伯', '暗晡上山？毋好。歇一暝，透早再走。'); return; }
          if (broken(G.state)) { await S.say('德興伯', '承蒙你兜！柿樹坪全庄，欠你兜一個人情。'); return; }
          if (F('ch4_wall_blown')) { await S.say('德興伯', '無死就好！𠊎兜還以為……唉，人轉來就好。'); return; }
          await S.say('德興伯', '五指山个風穴，在三指同四指中間。透早上山，中晝前下來。');
        },
      },
      {
        id: 'afu', sprite: 'hakka_m', name: '阿福', x: 26, y: 16, dir: 'down', 
        talk: async (S) => {
          if (F('ch4_yimin_met') && !F('ch4_yimin_shirt')) {
            await S.say('阿福', '「嶺上松」？這條毋係𠊎會个。老山歌哦……滿妹婆肚裡有幾百條老歌，去問佢。');
            if (G.Quests.stage('q_yimin') < 1) S.quest('q_yimin', 1);
            return;
          }
          if (!F('ch4_shange_duel')) { await S.say('阿福', '在柿樹坪，問話用講个，答話愛用唱个。'); return; }
          if (F('ch4_yimin_done')) await S.say('阿福', '滿妹婆教了𠊎一條老歌——「九降風吹嶺上松」。𠊎會一直唱下去，毋分佢斷。');
          else if (F('ch4_shange_win')) await S.say('阿福', '白芷細妹，若想學山歌，𠊎隨時教你！……星河哥，你个面做麼个恁黑？');
          else await S.say('阿福', '歌係𠊎贏，聲係佢贏。𠊎認。');
          if (F('ch4_s5_tried')) { await S.say('阿福', '道士哥，今日唱夠咧。歇一暝，明日再來！'); return; }
          const c = await S.choice(['跟阿福對山歌（雲歸）', '下次'], { cancel: 1 });
          if (c === 0) await duelYungui(S);
        },
      },
      {
        id: 'atao', sprite: 'hakka_f', name: '阿桃', x: 24, y: 16, dir: 'down',
        talk: async (S) => {
          if (F('ch4_yimin_met') && !F('ch4_yimin_shirt')) {
            await S.say('阿桃', '這種老調，只有滿妹婆那一輩會唱咧。');
            if (G.Quests.stage('q_yimin') < 1) S.quest('q_yimin', 1);
            return;
          }
          await S.say('阿桃', '客家山歌有「老山歌」、「山歌子」、「平板」……阿福哥只會大聲。');
          if (F('ch4_shange_duel')) await S.say('阿桃', '阿福哥輸了以後，在灶下偷偷練了一暗晡。');
          await S.say('阿桃', '𠊎兜同向天湖个賽夏人做鄰居做幾代人咧。阿成个阿公，同𠊎阿公以前係換工个朋友。');
        },
      },
      { id: 'xu', sprite: 'hakka_m', name: '徐頭家', x: 8, y: 18, dir: 'down', talk: async (S) => { await S.say('徐頭家', '鹽、糖、油、針線、菜包……徐記樣樣有。食飽吂？'); await S.shop(['jinchuang', 'xumingsan', 'jiedu', 'xiangbao', 'mijiu', 'bianpao', 'huanhunxiang'], { title: '徐記雜貨' }); } },
      {
        id: 'axiang', sprite: 'hakka_f', name: '阿香姐', x: 14, y: 19, dir: 'left',
        talk: async (S) => { await sayAll(S, '阿香姐', ['粄條係在來米漿蒸成一大片，再切條。炒、煮，都好食。', '菜包又喊「豬籠粄」，你看佢个形，像毋像細豬籠？']); await S.shop(['bantiao', 'caibao', 'xiancao', 'shibing'], { title: '粄條店' }); },
      },
      {
        id: 'zeng', sprite: 'hakka_f', name: '曾師傅', x: 40, y: 17, dir: 'down',
        talk: async (S) => { await S.say('曾師傅', '細妹，你這領藍衫着得好，袖口反摺得靚！'); await sayAll(S, '曾師傅', ['藍衫个藍，係大菁染出來个。耐髒、耐操，做事人着最好。', '大襟開在右片，一粒一粒布扣。毋使華麗，耐着就好。', '袖口反摺起來就係一圈花邊——好看，又方便做事。']); await S.shop(['ar_hakka', 'hd_huabu', 'ft_cloth'], { title: '藍衫裁縫' }); },
      },
      {
        id: 'kid_m', sprite: 'child_m', name: '細人仔', x: 29, y: 19, dir: 'left', wander: 2, if: (st) => !!st.flags.ch4_shange_duel && !night(st),
        talk: async (S, n) => {
          await S.say('細人仔', '大聲姊姊！大聲姊姊！');
          S.emote('hongying', '💢');
          await S.say('hongying:angry', '……誰是大聲姊姊！');
          await S.say('細人仔', '哇——大聲姊姊生氣了！');
          if (n) await pushNpc(S, n, 'right', 3);
        },
      },
      {
        id: 'kid_f', sprite: 'child_f', name: '細妹仔', x: 43, y: 28, dir: 'up',
        talk: async (S) => { await S.say('細妹仔', night(G.state) ? '暗晡義民塚那邊有人唱歌……阿婆講，莫去吵佢。' : '伯公愛拜喔，伯公保佑山路平安。'); },
      },
      {
        id: 'acheng', sprite: 'c4_saisiyat_m', name: '阿成', x: 31, y: 13, dir: 'down', if: (st) => !st.flags.ch4_xiangtian_arrive && !night(st),
        talk: async (S) => { await sayAll(S, '阿成', ['我是向天湖那邊的賽夏人。來換鹽，順便看阿福輸。', '這陣子的風不對。要上山，趁清早，中午前一定要下來。', '中午過後，風穴會先「吸氣」，然後「吐氣」——人是站不住的。']); },
      },
      { id: 'vf1', sprite: 'hakka_f', name: '庄裡的阿姆', x: 36, y: 24, dir: 'down', wander: 3, if: (st) => !night(st), talk: async (S) => { await S.say('庄裡的阿姆', broken(G.state) ? '這幾日風乾乾爽爽，菜脯曬得特別香。' : '今年个風，吹得菜脯都發霉咧。'); } },
      { id: 'hen1', sprite: 'chicken', x: 18, y: 20, dir: 'left', wander: 3, if: (st) => !night(st) },
      { id: 'hen2', sprite: 'chicken', x: 30, y: 21, dir: 'right', wander: 3, if: (st) => !night(st) },
      { id: 'dog', sprite: 'dog', x: 20, y: 12, dir: 'down', wander: 2, talk: async (S) => { S.emote('dog', '♥'); await S.say('', '黃狗搖著尾巴，在芋圓身上聞來聞去。芋圓的毛整個炸開了。'); } },
      { id: 'buffalo', sprite: 'buffalo', x: 14, y: 33, dir: 'left', wander: 1, talk: async (S) => { await S.say('', '水牛慢吞吞地嚼著稻草，看了你一眼。'); } },
      { id: 'vm1', sprite: 'hakka_m', name: '庄裡的阿叔', x: 12, y: 27, dir: 'down', wander: 3, if: (st) => !night(st), talk: ['梯田收冬咧，稻樁留在田肚，明年做肥。', '五指山？透早去，中晝前轉來，記得！'] },
    ],
    events: [
      { id: 'c4_407', trigger: 'auto', if: (st) => !st.flags.ch4_hakka_arrive, run: scene407 },
      { id: 'c4_416', trigger: 'auto', if: (st) => broken(st) && !st.flags.ch4_dexing_thanks && !night(st), run: scene416 },
      { id: 'bogong_v', trigger: 'action', x: 44, y: 26, w: 2, h: 2, label: '參拜', run: async (S) => { await savePrompt(S, '伯公壇。大樟樹的根盤在壇邊，像老人家的手。'); } },
      {
        id: 'jingzi', trigger: 'action', x: 34, y: 26, w: 1, h: 1, label: '調查',
        run: async (S) => { await S.say('', '敬字亭。寫過字的紙，客家人不隨便丟，要拿來這裡燒，表示敬重文字。'); await S.say('baizhi:think', '連寫過的字，都要好好送走呀。'); },
      },
    ],
    warps: [
      { x: 0, y: 22, h: 2, to: 'hakka_road', tx: 42, ty: 24, tdir: 'left' },
      { x: 24, y: 0, to: 'yimin_temple', tx: 15, ty: 22, tdir: 'up' },
      { x: 23, y: 11, to: 'hakka_liu', tx: 9, ty: 10, tdir: 'up', door: true },
      {
        x: 51, y: 20, h: 2, to: 'wuzhi_trail', tx: 1, ty: 47, tdir: 'right',
        run: async (S) => {
          if (night(G.state)) { await S.say('德興伯', '暗晡上山？毋好。'); await stepBack(S, 'left'); return false; }
          if (!F('ch4_morning')) { await S.say('德興伯', '這下風恁大。今暗就歇在劉家，明朝透早再上山。'); await stepBack(S, 'left'); return false; }
          return true;
        },
      },
    ],
  });
  async function pushNpc(S, n, dir, k) {
    const m = G.mapScene;
    const [dx, dy] = U.dirs[dir];
    let c = 0;
    while (c < k && !m.blocked(n.x + dx * (c + 1), n.y + dy * (c + 1), n)) c++;
    if (c) await S.move(n.id, { up: 'U', down: 'D', left: 'L', right: 'R' }[dir].repeat(c), { speed: 6 });
  }

  // ----------------------------------------------------------------------- 1-9 hakka_liu 劉家伙房
  async function scene408b(S) {
    S.flag('ch4_morning');
    S.flag('ch4_village_night', false);
    await S.say('', '清晨。山嵐未散。滿妹婆塞給每人一個熱騰騰的菜包。');
    await S.say('滿妹婆', '路上食。');
    await S.give('caibao', 4);
    await S.say('德興伯', '記得，中晝前下山。');
    await S.say('xinghe:smile', '知道了！');
    await S.say('hongying:smug', '……我怎麼覺得這句話很耳熟。');
    S.quest('q_ch4_main', 2);
    S.objective('登五指山，找到風穴');
  }
  async function leichaLesson(S) {
    await S.say('滿妹婆', '擂茶愛擂，正有味。來，𠊎教你兜。');
    await S.say('滿妹婆', '擂缽、擂棍。擂棍用芭樂樹，擂起來有一股清香。');
    S.quest('q_leicha', 0);
    await S.say('hongying:serious', '我來。');
    await S.say('xinghe:surprise', '等一下，紅纓，妳確定——');
    await S.say('hongying:angry', '不就是把東西磨碎嗎！我天天練槍，手勁最好！');
    await S.say('yungui:smug', '……各位，請找掩護。');
    await S.say('', '紅纓自動選料：茶葉、辣椒、鹹魚、冰糖。');
    await S.say('hongying:smug', '茶葉是綠的，辣椒是紅的，冰糖是白的——顏色很漂亮！');
    await S.say('滿妹婆', '鹹魚呢？');
    await S.say('hongying:think', '……有營養。');
    await S.say('', '紅纓猛擂。力道一路衝到頂。');
    await S.say('hongying:angry', '喝——！洛家槍法・擂！');
    S.sfx('shatter'); S.shake(6, 0.4);
    await S.say('', '「啪！」擂棍斷成兩截。一塊鹹魚飛起，落在芋圓頭上。');
    await S.say('', '芋圓僵住了。然後，他默默地把鹹魚吃了。');
    await S.say('', '滿妹婆嚐了一口。沉默。很長的沉默。');
    await S.say('滿妹婆', '……後生人。');
    await S.say('滿妹婆', '你這毋係擂茶。');
    await S.say('滿妹婆', '你這係武器。');
    await S.say('hongying:cry', '……！');
    await S.say('yungui:smug', '說得好，阿婆。可以裝起來，帶去打風魔。');
    await S.give('leicha_hy', 3);
    await S.say('滿妹婆', '毋過——擂棍會斷，表示你肯出力。手勁好，就係毋曉得收。');
    await S.say('滿妹婆', '硬頸係好事。硬頸，也愛曉得轉彎。');
    await S.say('滿妹婆', '來，換一個人。');
    const c = await S.choice(['星河來', '白芷來']);
    const who = c === 0 ? 'xinghe' : 'baizhi';
    const res = await leichaGame(S, who);
    if (res === 'fail') { await S.say('滿妹婆', '……苦。毋過，係你自家擂个。'); await S.give('leicha_ku', 2); }
    else {
      if (who === 'baizhi') await S.say('baizhi:smile', '好香……像把整座山的秋天，磨成一碗。');
      else { await S.say('xinghe:smile', '我果然是天才！'); await S.say('滿妹婆', '係擂缽好。'); }
      await S.give('leicha', res === 'good' ? 5 : 3);
    }
    S.flag('ch4_leicha_lesson');
    S.quest('q_leicha', 'done');
  }
  async function leichaHongying(S) {
    S.flag('ch4_leicha_hy_try');
    await S.say('', '紅纓自己走向滿妹婆。');
    await S.say('hongying:shy', '阿婆……可以再教我一次嗎？這次，我會慢一點。');
    await S.say('滿妹婆', '哈！好！');
    for (;;) {
      const res = await leichaGame(S, 'hongying');
      if (res === 'good' || res === 'ok') break;
      await S.say('滿妹婆', '再來！');
      const c = await S.choice(['再擂一次', '先歇一下'], { cancel: 1 });
      if (c === 1) return;
    }
    await S.say('滿妹婆', '好！有硬頸，也曉得轉彎！');
    await S.say('xinghe:surprise', '……可以喝耶！');
    await S.say('hongying:angry', '什麼叫「可以喝」！');
    await S.say('', '但她的嘴角翹了起來。');
    await S.say('滿妹婆', '這條頭帕分你。𠊎後生个時節，就係紮這條上山做事。');
    await S.give('hd_yingjing', 1);
    S.flag('ch4_leicha_hongying');
  }
  async function yiminShirt(S) {
    await S.say('xinghe:think', '阿婆，妳聽過這首歌嗎？「九降風吹嶺上松，阿妹門前柿曬紅……」');
    S.sfx('push');
    await S.say('', '滿妹婆的拐杖「咚」一聲落地。');
    await S.say('滿妹婆', '……你在哪位聽到這條歌？');
    await S.say('xinghe:serious', '義民塚。有一個……人，每暗都在那裡唱。');
    await S.say('滿妹婆', '𠊎个秋妹姑婆，以前一面捏柿餅，一面哼這條歌。');
    await S.say('滿妹婆', '每擺都只哼頭兩句，下背從來毋唱。問佢，佢就笑，講「等人回」。');
    await S.say('滿妹婆', '秋妹姑婆一世人無嫁。活到八十八，教全庄个細人仔唱山歌。');
    await S.say('滿妹婆', '佢過身个時節，𠊎正十二歲。佢个藍衫，𠊎留到今仔日。');
    await S.say('', '她打開衫櫃，捧出一件洗得發白的舊藍衫。');
    await S.say('滿妹婆', '……細妹，你身上着个，也係藍衫。');
    await S.say('baizhi:smile', '嗯。穿著它，好像能走很遠很遠的路。');
    await S.say('baizhi:think', '袖口……裡面有字。');
    await S.say('', '翻開反摺的袖口，內側用白線細細繡著四行字。');
    await S.say('', '柿霜白過幾十冬，竹床年年曬日紅；阿哥若係名字忘，阿妹聲聲喊阿松。');
    await S.say('xinghe:surprise', '阿松……！');
    await S.say('滿妹婆', '……原來佢一直在等人回歌。原來佢等个人，喊做阿松。');
    await S.say('滿妹婆', '去問義民廟个古伯。佢有名冊。');
    await S.give('key_qiumei_shirt', 1);
    S.flag('ch4_yimin_shirt');
    S.quest('q_yimin', 2);
  }
  async function yiminEscort(S) {
    await S.say('滿妹婆', '秋妹姑婆个歌，愛劉家人來唱。');
    await S.say('xinghe:smile', '阿婆，山路陡，我揹妳吧？');
    await S.say('滿妹婆', '免！𠊎還行得！');
    await S.fadeOut(0.6);
    await S.wait(0.4);
    await S.say('', '三步之後。');
    await S.say('滿妹婆', '……揹就揹。');
    S.flag('ch4_manmei_escort');
    await S.warp('yimin_temple', 15, 20, 'up', { fade: 0 });
    await S.fadeIn(0.6);
  }
  G.Maps.define('hakka_liu', {
    name: '劉家伙房', subtitle: '彭城堂', place: 'hsinchu', bgm: (st) => (night(st) ? 'night' : 'hakka'), start: [9, 10],
    light: (st) => (night(st) ? { ambient: 0.55, color: '#120a06', playerR: 200 } : { ambient: 0.2, color: '#20160c' }),
    tiles: room(18, 12, 't', 'P', 9).rows(),
    objects: [
      { t: 'altar', x: 8, y: 2 }, { t: 'brazier', x: 7, y: 2 }, { t: 'signboard', x: 10, y: 2, text: '彭城堂', v: 1 },
      { t: 'table', x: 7, y: 6, w: 4 }, { t: 'chair', x: 6, y: 6, dir: 'right' }, { t: 'chair', x: 11, y: 6, dir: 'left' },
      { t: 'table', x: 2, y: 6 }, { t: 'mill_stone', x: 3, y: 6 },
      { t: 'cabinet', x: 14, y: 2 }, { t: 'cabinet', x: 15, y: 2 },
      { t: 'bed', x: 13, y: 5 }, { t: 'bed', x: 15, y: 5 }, { t: 'bed', x: 13, y: 8 }, { t: 'bed', x: 15, y: 8 },
      { t: 'stove', x: 2, y: 9 }, { t: 'pot', x: 4, y: 9 }, { t: 'basket', x: 1, y: 3, v: 2 }, { t: 'bucket', x: 5, y: 10 },
    ],
    lights: (st) => (night(st) ? [{ x: 8, y: 3, r: 220, color: '#ffb060', flicker: 0.3 }, { x: 8, y: 6, r: 180, color: '#ffa040', flicker: 0.4 }] : []),
    npcs: [{
      id: 'manmei', sprite: 'c4_manmei', name: '滿妹婆', x: 5, y: 4, dir: 'down',
      talk: async (S) => {
        if (F('ch4_yimin_roll') && !F('ch4_yimin_done')) {
          if (night(G.state)) { await yiminEscort(S); return; }
          await S.say('滿妹婆', '古伯講做得試看？……暗晡正去。秋妹姑婆个歌，愛在暗晡唱。');
          return;
        }
        if (F('ch4_yimin_met') && !F('ch4_yimin_shirt')) { await yiminShirt(S); return; }
        if (F('ch4_village_rest') && !F('ch4_leicha_lesson')) { await leichaLesson(S); return; }
        if (F('ch4_leicha_lesson')) {
          await S.say('滿妹婆', broken(G.state) ? '風轉來咧！今年个柿餅，霜一定靚。' : '擂茶愛擂，正有味。要帶幾碗上路無？');
          await S.shop(['leicha'], { title: '劉家擂茶' });
          return;
        }
        await sayAll(S, '滿妹婆', ['後生人莫恁懶，硬頸做人，正有飯食。', '這領藍衫？着四十年咧。藍衫愈洗愈靚。']);
      },
    }],
    events: [
      { id: 'c4_hy_leicha', trigger: 'auto', if: (st) => !!st.flags.ch4_leicha_lesson && broken(st) && night(st) && !st.flags.ch4_leicha_hongying && !st.flags.ch4_leicha_hy_try, run: leichaHongying },
      {
        id: 'beds', trigger: 'action', x: 13, y: 5, w: 3, h: 5, label: '休息',
        run: async (S) => {
          await S.say('滿妹婆', '人客來到，哪有收錢个道理！');
          const c = await rest(S, { labels: ['睏到天光', '睏到暗晡'] });
          if (c < 0) return;
          let morning = false;
          if (c === 0) { if (F('ch4_village_rest') && !F('ch4_morning')) morning = true; S.flag('ch4_village_night', false); }
          else S.flag('ch4_village_night');
          if (!F('ch4_village_night')) S.flag('ch4_leicha_hy_try', false);
          await S.warp('hakka_liu', 14, 10, 'up', { fade: 0, reload: true });
          await S.fadeIn(0.8);
          G.UI.toast('好好休息了一晚，全員完全恢復。', { icon: 'lantern' });
          if (morning) await scene408b(S);
        },
      },
      {
        id: 'hy_retry', trigger: 'action', x: 3, y: 6, w: 1, h: 1, label: '擂茶', if: (st) => !!st.flags.ch4_leicha_hy_try && !st.flags.ch4_leicha_hongying,
        run: async (S) => { await leichaHongying(S); },
      },
    ],
    warps: [{ x: 9, y: 11, to: 'hakka_village', tx: 23, ty: 12, tdir: 'down', door: true }],
  });

  // =====================================================================================================
  // 1-10 yimin_temple 義民廟・義民塚
  // =====================================================================================================
  async function yiminStep1(S) {
    S.flag('ch4_yimin_met');
    await S.say('', '義民塚前，月光。一個年輕人的背影坐在塚邊，身形半透明，懷裡抱著一把舊鋤頭。頭上紮著布巾。');
    S.bgm(null);
    await S.say('阿松', '♪ 九降風吹嶺上松，阿妹門前柿曬紅；');
    await S.say('阿松', '♪ 等到柿霜白過雪，轉來同妹食一盅——');
    S.sfx('wind');
    await S.say('', '他停下來，像在等什麼。風聲。沒有人回答。');
    await S.say('xinghe:think', '……你在等人回歌嗎？');
    S.face('asong', 'player'); S.emote('asong', '!');
    await S.say('阿松', '你……看得到𠊎？');
    await S.say('阿松', '好久好久，無人同𠊎講話咧。');
    await S.say('baizhi:smile', '你唱得很好聽。那首歌，在等誰回答呢？');
    await S.say('阿松', '等……一個細妹。佢个聲，像山坑水。');
    await S.say('阿松', '毋過𠊎想毋起佢个名。也想毋起……𠊎自家个名。');
    await S.say('阿松', '𠊎只記得，那年庄頭著火，𠊎同兄弟們守在這條坑口。');
    await S.say('阿松', '𠊎同佢講——等柿霜白了，就轉來食佢擂个茶。');
    await S.say('阿松', '然後……就無然後咧。');
    await S.say('hongying:serious', '你一直守在這裡？');
    await S.say('阿松', '守慣咧。最近个風毋著，風裡有人在哭，一直要把人扯上山。');
    await S.say('阿松', '𠊎攔在坑口，毋分佢扯走柿樹坪个人。活个、死个，都毋分。');
    await S.say('yungui:think', '（原來風吹過這條坑會轉彎……是因為他。）');
    await S.say('阿松', '毋過，𠊎有滴仔累咧。');
    await S.say('阿松', '老人家講，若有人對得出這首歌个下句，𠊎就想得起來。');
    await S.say('xinghe:smile', '那我們幫你找！找那個會回歌的人。');
    await S.say('阿松', '……承蒙你，後生人。');
    S.quest('q_yimin', 0);
    S.bgm('night');
  }
  async function yiminStep5(S) {
    S.spawn({ id: 'mm_e', sprite: 'c4_manmei', x: G.mapScene.player.x + 1, y: G.mapScene.player.y, dir: 'up' });
    await S.say('', '義民塚前。阿松的身影坐在塚邊。');
    S.bgm(null);
    await S.say('滿妹婆', '……這位阿哥，你係毋係在等人回歌？');
    S.face('asong', 'mm_e');
    await S.say('阿松', '阿婆……你看得到𠊎？');
    await S.say('滿妹婆', '看毋到。毋過𠊎聽得到風。');
    await S.say('阿松', '♪ 九降風吹嶺上松，阿妹門前柿曬紅；等到柿霜白過雪，轉來同妹食一盅——');
    await S.say('', '滿妹婆深吸一口氣。蒼老的聲音，穩穩地接了下去。');
    await S.say('滿妹婆', '♪ 柿霜白過幾十冬，竹床年年曬日紅；');
    await S.say('滿妹婆', '♪ 阿哥若係名字忘，阿妹聲聲喊——阿松。');
    await S.wait(0.8);
    await S.say('', '風停了。整座山坳靜得只剩蟲聲。');
    await S.say('阿松', '……阿松。');
    await S.say('阿松', '鍾……阿松。𠊎係鍾阿松！');
    const a = S.actor('asong');
    if (a) a.light = { r: 160, color: '#ffe0a0' };
    await S.say('阿松', '秋妹……係秋妹个歌！秋妹呢？佢……');
    await S.say('滿妹婆', '秋妹姑婆，五十年前就過身咧。');
    await S.say('滿妹婆', '佢活到八十八，一世人無嫁，教全庄个細人仔唱山歌。到死，都硬頸。');
    await S.say('阿松', '……恁像佢。');
    await S.say('阿松', '佢一直替𠊎記住名，記到最尾一口氣。');
    S.spawn({ id: 'gu_e', sprite: 'temple_keeper', x: 15, y: 13, dir: 'up', light: { r: 140, color: '#ffb060' } });
    await S.move('gu_e', 'UU');
    await S.say('', '古伯提著燈籠、拿著筊杯和紅紙走上來。');
    await S.say('古伯', '義民爺在上，弟子古阿添，柿樹坪人。今有義民一位，姓鍾，名阿松……');
    await S.say('古伯', '請義民爺允准，添名入冊。');
    await jiaobei(S, ['sheng', 'sheng', 'sheng'], '古伯雙手捧筊——');
    S.sfx('bell');
    await S.say('古伯', '三聖筊。');
    await S.say('', '他在紅紙上一筆一筆寫下：鍾阿松。');
    await S.say('阿松', '有名咧。城隍爺个簿上，也尋得到𠊎咧。');
    if (broken(G.state)) await S.say('阿松', '風轉來咧。𠊎也好轉去咧。');
    else await S.say('阿松', '坑口个風，𠊎守到今暗。上背个風——就交分你兜咧。');
    await S.say('阿松', '後生人，承蒙你兜。……阿婆，承蒙你。');
    await S.say('', '他的身影化作一點溫暖的光，繞著滿妹婆轉了一圈，輕輕停在她手中的藍衫上——然後升上夜空，往西邊竹塹的方向飄去。');
    await S.fadeActor('asong', 0, 1.4);
    S.flag('ch4_yimin_done');
    S.flag('ch4_manmei_escort', false);
    await S.wait(0.6);
    await S.say('滿妹婆', '這領衫，你兜帶去。');
    await S.say('baizhi:surprise', '可是，這是秋妹姑婆的……');
    await S.say('滿妹婆', '衫係愛着个，毋係愛收个。收在櫃肚，佢就只係一領舊衫。');
    await S.say('滿妹婆', '着出去，行過幾多路，佢就還活著。');
    await S.say('baizhi:cry', '……我會好好穿著它。');
    S.take('key_qiumei_shirt');
    await S.give('ar_qiumei', 1);
    await S.say('', '古伯把寫壞的草稿紙，恭恭敬敬地拿到敬字亭燒了。');
    S.quest('q_yimin', 'done');
    S.bgm('night');
    await S.lantern('lantern_yimin', '嶺上松');
    S.remove('mm_e'); S.remove('gu_e');
  }
  G.Maps.define('yimin_temple', {
    name: '義民廟', subtitle: '褒忠義民廟・義民塚', place: 'hsinchu', bgm: (st) => (night(st) ? 'night' : 'temple'), start: [15, 22],
    light: (st) => (night(st) ? { ambient: 0.7, color: '#081030', playerR: 230 } : { ambient: 0.2, color: '#20201a' }),
    particles: (st) => (night(st) ? ['fireflies'] : ['leaves']),
    tiles: (() => {
      const g = new Grid(30, 24, '.');
      g.rect(14, 13, 2, 11, 'H').rect(9, 10, 12, 3, '#').rect(19, 3, 9, 7, ':').rect(15, 9, 1, 1, '#');
      g.rect(5, 9, 4, 3, '#');
      return g.rows();
    })(),
    objects: [
      { t: 'temple', x: 11, y: 5, text: '褒忠義民廟' }, { t: 'statue_lion', x: 12, y: 10 }, { t: 'statue_lion', x: 16, y: 10, flip: true },
      { t: 'incense_burner', x: 18, y: 11 }, { t: 'stone_lantern', x: 6, y: 10 }, { t: 'stone_lantern', x: 10, y: 12 }, { t: 'stone_lantern', x: 19, y: 12 },
      { t: 'tree_banyan', x: 24, y: 3 }, { t: 'grave', x: 22, y: 5, v: 2 }, { t: 'signboard', x: 21, y: 7, text: '義民塚' },
      { t: 'rock_small', x: 20, y: 9 }, { t: 'rock_small', x: 19, y: 6 }, { t: 'rock_small', x: 23, y: 8 },
      { t: 'tallgrass', x: 20, y: 4 }, { t: 'tallgrass', x: 24, y: 7 }, { t: 'tallgrass', x: 26, y: 8 }, { t: 'tallgrass', x: 19, y: 8 },
      { t: 'tree_pine', x: 2, y: 3 }, { t: 'tree_pine', x: 5, y: 2 }, { t: 'tree_pine', x: 27, y: 12 }, { t: 'tree_pine', x: 3, y: 16 },
      { t: 'tree_pine', x: 25, y: 18 }, { t: 'tree_camphor', x: 9, y: 2 }, { t: 'tree_camphor', x: 7, y: 18 }, { t: 'tree_camphor', x: 21, y: 16 },
      { t: 'bush', x: 12, y: 15 }, { t: 'bush', x: 17, y: 16 }, { t: 'flowers', x: 11, y: 18 }, { t: 'flowers', x: 18, y: 20 },
    ],
    npcs: [
      {
        id: 'gu', sprite: 'temple_keeper', name: '古伯', x: 13, y: 11, dir: 'down', if: (st) => !st.flags.ch4_manmei_escort,
        talk: async (S) => { await guTalk(S); },
      },
      {
        id: 'asong', sprite: 'c4_asong', name: '阿松', x: 21, y: 9, dir: 'down', ghost: true, if: (st) => night(st) && !st.flags.ch4_yimin_done,
        talk: async (S) => {
          if (!F('ch4_yimin_met')) { await S.say('阿松', '♪ 九降風吹嶺上松，阿妹門前柿曬紅——'); return; }
          await S.say('阿松', '老人家講，若有人對得出這首歌个下句，𠊎就想得起來。');
        },
      },
      {
        id: 'mm_wait', sprite: 'c4_manmei', name: '滿妹婆', x: 16, y: 20, dir: 'up', if: (st) => !!st.flags.ch4_manmei_escort,
        talk: ['義民塚，就在廟个東背。行，𠊎跟你兜。'],
      },
    ],
    events: [
      { id: 's1_step1', trigger: 'touch', x: 19, y: 10, w: 5, h: 2, if: (st) => night(st) && !st.flags.ch4_yimin_met, run: yiminStep1 },
      { id: 's1_step5', trigger: 'touch', x: 19, y: 10, w: 5, h: 2, if: (st) => night(st) && !!st.flags.ch4_manmei_escort && !st.flags.ch4_yimin_done, run: yiminStep5 },
      { id: 'temple_door', trigger: 'action', x: 14, y: 9, w: 1, h: 1, label: '參拜', run: async (S) => { await guTalk(S); } },
      { id: 'stele', trigger: 'action', x: 21, y: 7, w: 1, h: 1, label: '調查', run: async (S) => { await S.say('', '「義民塚」。石碑上的字被風雨磨得很淺，碑前有新鮮的香。'); } },
      { id: 'jingzi_y', trigger: 'action', x: 6, y: 10, w: 1, h: 1, label: '調查', run: async (S) => { await S.say('', '小小的敬字亭。亭口有一點餘燼，是燒過字紙留下的。'); } },
    ],
    warps: [{ x: 14, y: 23, w: 2, to: 'hakka_village', tx: 24, ty: 1, tdir: 'down' }],
  });
  async function guTalk(S) {
    if (F('ch4_yimin_shirt') && !F('ch4_yimin_roll')) {
      await S.say('古伯', '阿松？……有姓有名个，無一個喊阿松。');
      await S.say('古伯', '毋過，這裡寫：「無名義民十七位」。');
      await S.say('古伯', '當年太亂。好多後生人葬做一堆，連名都來毋掣寫。');
      await S.say('baizhi:think', '他自己也忘了。可是他說，只要有人回歌，他就會想起來。');
      await S.say('古伯', '該就試看。若真係義民爺个兄弟，𠊎來請示義民爺，看做得把佢个名添入名冊無。');
      S.flag('ch4_yimin_roll');
      S.quest('q_yimin', 3);
      return;
    }
    if (F('ch4_yimin_done')) { await S.say('古伯', '鍾阿松。𠊎已經恭恭敬敬寫入名冊咧。草稿紙，也拿去敬字亭燒了。'); return; }
    if (F('ch4_yimin_roll')) { await S.say('古伯', '暗晡帶滿妹婆來。𠊎會帶筊杯同紅紙上去。'); return; }
    await S.say('古伯', '這間義民廟，係從枋寮褒忠亭分香過來个。');
    await S.say('古伯', '枋寮个老人講，當年牛車載義民遺骨，走到那位，牛就毋行咧——大家講，係義民爺自家揀个所在。');
    await S.say('古伯', '柿樹坪个義民，就葬在後背个塚。那年庄頭遭了兵燹，後生人拿起鋤頭、拿起刀，守在坑口。');
    await S.say('古伯', '好多人，連名都無留下。名冊上，只寫「無名義民十七位」。');
  }

  // =====================================================================================================
  // 1-11 wuzhi_trail 五指山山徑
  // =====================================================================================================
  const TRAIL_PATH = [[0, 47], [8, 47], [8, 40], [24, 40], [24, 34], [10, 34], [10, 30], [30, 30], [30, 20], [16, 20], [16, 13], [26, 13], [26, 8], [19, 8], [19, 4]];
  const trailGrid = (() => {
    const g = new Grid(40, 52, 'X');
    g.line(TRAIL_PATH.map(([x, y]) => [Math.max(0, x - 1), y - 1]), ',', 4);
    g.line([[23, 39], [39, 39]], ',', 4);
    g.rect(18, 25, 8, 4, ',');            // pavilion clearing
    g.rect(3, 17, 6, 8, ',').rect(9, 22, 6, 2, ',');   // west ledge (C13)
    g.rect(29, 9, 3, 3, ',');             // C14 crevice
    g.rect(16, 4, 7, 5, ',');             // mouth plateau
    g.rect(18, 1, 3, 3, 'v');             // 風穴口
    g.line(TRAIL_PATH, '=', 2);
    g.line([[24, 40], [39, 40]], '=', 2);
    g.swap('=', 'H', 8, 41, 2, 6).swap('=', 'H', 30, 21, 2, 9).swap('=', 'H', 26, 9, 2, 4).swap('=', 'H', 19, 5, 2, 3);
    return g;
  })();
  function trailObjects() {
    const g = trailGrid;
    const o = [
      { t: 'pavilion', x: 20, y: 26 }, { t: 'rock_big', x: 6, y: 20 }, { t: 'signboard', x: 37, y: 38, text: '往向天湖' },
      { t: 'signboard', x: 21, y: 6, text: '風穴' },
    ];
    const near = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = g.get(x + dx, y + dy); if (c === '=' || c === 'H') return true; } return false; };
    const keep = new Set(['4,20', '23,28', '30,10', '35,42', '21,29', '22,28', '5,21', '4,21', '5,20', '8,22', '7,22', '6,22', '5,22', '4,22']);
    const kinds = ['bamboo', 'tree_fern', 'tree_camphor', 'bamboo', 'rock_small', 'tree_pine'];
    for (let y = 4; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== ',' || keep.has(x + ',' + y)) continue;
      if (x >= 18 && x <= 25 && y >= 25 && y <= 28) continue;
      if (x >= 16 && x <= 22 && y >= 4 && y <= 8) continue;
      if (x >= 3 && x <= 14 && y >= 17 && y <= 24) continue;
      if (x >= 29 && x <= 31 && y >= 9 && y <= 11) continue;
      const h = U.hash(x, y, 41);
      if (near(x, y)) { if (h < 0.18) o.push({ t: h < 0.09 ? 'tallgrass' : 'silvergrass', x, y }); continue; }
      if (h < 0.45) o.push({ t: kinds[Math.floor(U.hash(x, y, 42) * kinds.length)], x, y });
      else if (h < 0.6) o.push({ t: 'tallgrass', x, y });
    }
    for (const [x, y] of [[5, 18], [8, 19], [3, 23]]) o.push({ t: 'tree_fern', x, y });
    const forest = ['tree_pine', 'tree_camphor', 'bamboo', 'tree_fern', 'tree_pine', 'tree_cedar_snow'];
    for (let y = 4; y < g.h - 1; y++) for (let x = 0; x < g.w; x++) {
      if (g.get(x, y) !== 'X' || g.get(x, y + 1) !== 'X') continue;
      const h = U.hash(x, y, 77);
      if (h < 0.42) o.push({ t: forest[Math.floor(U.hash(x, y, 78) * 5)], x, y });
      else if (h < 0.5) o.push({ t: 'rock_small', x, y });
    }
    return o;
  }
  async function scene409(S) {
    S.bgm('wind');
    S.light({ ambient: 0.1 });
    await S.camera(19, 2, 1.0);
    await S.say('', '正午。五座山峰並列如掌。三指與四指之間，一道黑黝黝的裂口。風從裡面湧出，帶著無數藍色的光點。');
    await S.say('xinghe:serious', '那就是風穴……');
    await S.say('', '光點在風中翻滾。仔細看，每一顆都是一張模糊的臉。');
    S.cameraFollow();
    await S.say('baizhi:hurt', '……好多。好多人在喊。');
    await S.say('yungui:serious', '是魂。被風捲上山的魂。');
    await S.say('hongying:serious', '走，進去把那盞燈砸了！');
    await S.move('player', 'U');
    S.sfx('wind');
    await S.say('', '風穴深處傳來一聲巨大的「吸氣」。四周的草全倒向洞口。');
    await S.say('yungui:surprise', '等等，風向——');
    await S.say('xinghe:surprise', '……現在幾時了？');
    await S.say('hongying:surprise', '太陽在頭頂上——是中午啦！');
    await S.wait(1.0);
    S.shake(14, 1.4);
    S.sfx('wind'); S.sfx('ghost', 0.2);
    S.flash('#ffffff', 1.2, 1);
    await S.say('', '然後，洞口「吐氣」。狂風轟鳴，夾著千百人的哭喊。');
    await S.say('baizhi:cry', '啊——！');
    await S.say('', '白芷摀住耳朵跪倒。她的輪廓邊緣變得半透明，像被風吹薄的燭火。');
    await S.say('xinghe:surprise', '白芷！');
    await S.say('', '眾人被狂風捲起，沿著南坡一路滾落。');
    await S.fadeOut(1.2);
    S.bgm(null);
    await S.wait(0.8);
    await S.say('阿成', '……就說了，中午前要下來。');
    S.flag('ch4_wall_blown');
    S.visit('xiangtian');
    await S.warp('xiangtian_house', 7, 7, 'up', { fade: 0, stayDark: true });
  }
  async function scene413(S) {
    await S.say('', '風穴口。風依然狂暴，藍色光點亂竄。');
    await S.say('xinghe:serious', '白芷，跟緊我。');
    await S.move('player', 'U');
    S.sfx('wind');
    await S.say('', '星河走到最前面。狂風撲到他身前——風裡的光點遲疑了一下，向兩旁分開。');
    await S.say('yungui:surprise', '……風在躲你？');
    await S.say('xinghe:surprise', '我、我也不知道！');
    await S.say('yungui:think', '（聽說從九份那晚起就是這樣……鬼魂見到他，總要猶豫一下。）');
    S.bgm('duhun');
    await S.say('', '白芷站在星河背後，舉起玉笛。渡魂謠的旋律在風中響起——不是對抗，是回答。');
    await S.say('baizhi:normal', '我聽見你們了。');
    await S.say('baizhi:normal', '我不會把你們留下。我會帶你們回家。');
    await S.say('', '風牆緩緩裂開一道縫，剛好容一人通過。風聲裡，有人輕輕嘆了一口氣。');
    await S.say('hongying:serious', '走！');
    S.flag('ch4_wall_open');
    S.quest('q_ch4_main', 3);
    await S.warp('wind_cave_1', 20, 42, 'up');
  }
  G.Maps.define('wuzhi_trail', {
    name: '五指山山徑', subtitle: '往風穴', place: 'hsinchu', bgm: 'mountain', start: [1, 47],
    light: (st) => (broken(st) ? { ambient: 0.08 } : { ambient: 0.2, color: '#20283a' }),
    particles: (st) => (broken(st) ? ['leaves', { type: 'wind', density: 0.4 }] : [{ type: 'wind', density: 1.4 }, 'leaves', { type: 'motes', density: 0.6 }, { type: 'mist', density: 0.5 }]),
    tiles: trailGrid.rows(), objects: trailObjects,
    winds: [{ x: 0, y: 4, w: 40, h: 10, dir: 'down', period: 4.5, dur: 0.8, if: (st) => !broken(st) }],
    chests: [
      { id: 'c4_12', x: 23, y: 28, gold: 300, item: 'xumingsan', n: 2 },
      { id: 'c4_13', x: 4, y: 20, item: 'ac_bagua' },
      { id: 'c4_14', x: 30, y: 10, item: 'huanhunxiang', n: 2 },
      { id: 'c4_15', x: 35, y: 42, gold: 500, item: 'bianpao', n: 3 },
    ],
    enemies: [
      { id: 't1', troop: 't4_trail_a', x: 14, y: 40, art: 'mountain_ghost', radius: 3, lv: 15 },
      { id: 't2', troop: 't4_trail_b', x: 18, y: 34, art: 'mountain_ghost', radius: 3, lv: 15 },
      { id: 't3', troop: 't4_trail_c', x: 27, y: 30, art: 'wind_sprite', variant: 1, radius: 3, lv: 15, if: (st) => !broken(st) },
      { id: 't4', troop: 't4_trail_d', x: 22, y: 20, art: 'mountain_ghost', variant: 1, radius: 3, lv: 16 },
      { id: 't5', troop: 't4_trail_c', x: 21, y: 13, art: 'wind_sprite', variant: 1, radius: 3, lv: 15, if: (st) => !broken(st) },
    ],
    events: [
      { id: 'c4_409', trigger: 'touch', x: 18, y: 6, w: 4, h: 1, if: (st) => !!st.flags.ch4_morning && !st.flags.ch4_wall_blown, run: scene409 },
      { id: 'c4_413', trigger: 'touch', x: 18, y: 6, w: 4, h: 1, if: (st) => !!st.flags.ch4_trail_south_open && !st.flags.ch4_wall_open, run: scene413 },
      { id: 'pavilion', trigger: 'action', x: 20, y: 26, w: 3, h: 3, label: '歇腳', run: async (S) => { await savePrompt(S, '廢棄的歇腳亭。石凳上積著落葉，風從亭柱間呼呼穿過。'); } },
      {
        id: 'branch_sign', trigger: 'action', x: 37, y: 38, w: 1, h: 1, label: '調查',
        run: async (S) => {
          await S.say('', '路牌：「往向天湖」。');
          if (!F('ch4_xiangtian_arrive')) await S.say('xinghe:think', '那邊是賽夏人的部落吧。我們沒事，不要隨便闖進人家家裡。');
        },
      },
    ],
    warps: [
      { x: 0, y: 47, h: 2, to: 'hakka_village', tx: 50, ty: 20, tdir: 'left' },
      { x: 18, y: 1, w: 3, to: 'wind_cave_1', tx: 20, ty: 42, tdir: 'up', if: (st) => !!st.flags.ch4_wall_open },
      {
        x: 39, y: 40, h: 2, to: 'xiangtian', tx: 30, ty: 2, tdir: 'down',
        run: async (S) => {
          if (F('ch4_trail_south_open')) return true;
          await S.say('xinghe:think', '那邊是賽夏人的部落吧。我們沒事，不要隨便闖進人家家裡。');
          await stepBack(S, 'left');
          return false;
        },
      },
    ],
  });

  // =====================================================================================================
  // 1-12 xiangtian 向天湖・賽夏部落 (+ the festival night as its own restricted map)
  // =====================================================================================================
  const xiangtianGrid = (() => {
    const g = new Grid(46, 38, '.');
    g.rect(24, 4, 20, 14, ':');
    g.ellipse(14, 16, 8.6, 8.6, 'l');
    g.rect(30, 0, 1, 15, '=').rect(30, 14, 7, 1, '=').rect(33, 15, 1, 10, '=');
    g.rect(26, 25, 15, 11, ':');
    g.rect(23, 12, 2, 10, ',');
    return g;
  })();
  function xiangtianObjects(fest) {
    const o = [
      { t: 'c4_saisiyat_house', x: 32, y: 11, v: 0 }, { t: 'c4_saisiyat_house', x: 25, y: 5, v: 1 }, { t: 'c4_saisiyat_house', x: 38, y: 5, v: 2 },
      { t: 'c4_saisiyat_house', x: 40, y: 11, v: 1 }, { t: 'c4_saisiyat_house', x: 25, y: 11, v: 2 }, { t: 'c4_saisiyat_house', x: 41, y: 18, v: 0 },
      { t: 'granary', x: 35, y: 5 }, { t: 'granary', x: 21, y: 27 },
      { t: 'loom', x: 36, y: 13 }, { t: 'basket', x: 37, y: 12, v: 3 }, { t: 'jar', x: 29, y: 9 }, { t: 'basket', x: 28, y: 9, v: 1 },
      { t: 'firepit', x: 28, y: 27 }, { t: 'firepit', x: 39, y: 27 }, { t: 'firepit', x: 33, y: 34 },
    ];
    if (fest) o.push({ t: 'firepit', x: 33, y: 29 });
    else o.push({ t: 'log', x: 31, y: 26 }, { t: 'log', x: 35, y: 33 });
    for (const [x, y] of [[2, 2], [5, 1], [9, 2], [14, 3], [20, 2], [1, 8], [1, 14], [2, 22], [3, 29], [8, 32], [14, 34], [20, 33], [44, 2], [44, 9], [44, 24], [44, 31], [42, 35], [24, 35], [27, 2], [36, 1]]) o.push({ t: U.hash(x, y, 3) < 0.5 ? 'tree_camphor' : 'tree_pine', x, y });
    for (const [x, y] of [[8, 6], [21, 9], [6, 25], [23, 23], [11, 27], [17, 26]]) o.push({ t: 'reeds', x, y });
    for (const [x, y] of [[26, 19], [39, 21], [27, 23], [40, 24], [22, 6], [24, 30]]) o.push({ t: 'silvergrass', x, y });
    for (const [x, y] of [[42, 7], [43, 14], [3, 33], [18, 31]]) o.push({ t: 'bamboo', x, y });
    return o;
  }
  const fireLights = [{ x: 28, y: 27, r: 230, color: '#ff8a3a', flicker: 0.5 }, { x: 39, y: 27, r: 230, color: '#ff8a3a', flicker: 0.5 }, { x: 33, y: 34, r: 230, color: '#ff8a3a', flicker: 0.5 }];
  async function lakeMorning(S) {
    S.flag('ch4_pastaay_witnessed');
    S.flag('ch4_lake_morning');
    await S.warp('xiangtian', 25, 17, 'left', { fade: 0, reload: true });
    S.bgm('love', { fade: 2 });
    S.hideFollowers(true);
    S.spawn({ id: 'bz_lake', sprite: 'baizhi', x: 23, y: 16, dir: 'left' });
    await S.fadeIn(1.2);
    await S.say('', '清晨。湖面起霧。白芷一個人站在湖邊。');
    await S.move('player', 'LU');
    await S.say('xinghe:normal', '睡不著？');
    S.face('bz_lake', 'player');
    await S.say('baizhi:think', '嗯。我一直在想風穴裡的聲音。');
    await S.say('baizhi:think', '那時候我好害怕。以為他們想把我抓進去。');
    await S.say('baizhi:serious', '可是不是的。他們在喊，是因為被關住了……他們要的，不是被留下來。');
    await S.say('baizhi:serious', '是被聽見，被記住，然後……被放走。');
    await S.say('baizhi:smile', '星河，我想再去一次。這一次，我想回答他們。');
    await S.say('xinghe:smile', '好。這一次，我站在妳前面。');
    await S.say('baizhi:smile', '那我站在你後面唱歌。');
    S.spawn({ id: 'hy_lake', sprite: 'hongying', x: 28, y: 17, dir: 'left' });
    S.spawn({ id: 'yg_lake', sprite: 'yungui', x: 28, y: 16, dir: 'left' });
    S.spawn({ id: 'yy_lake', sprite: 'yuyuan', x: 29, y: 17, dir: 'left' });
    S.spawn({ id: 'mc_lake', sprite: 'mochi', x: 23, y: 17, dir: 'left' });
    S.move('hy_lake', 'LL', { wait: false }); await S.move('yg_lake', 'LL');
    await S.say('', '其他人走過來。紅纓的手腕上還綁著芒草結。');
    await S.say('yungui:normal', '決定了？');
    await S.say('hongying:serious', '早就該決定了。');
    S.spawn({ id: 'xia_lake', sprite: 'saisiyat_elder', x: 29, y: 15, dir: 'left' });
    S.spawn({ id: 'ac_lake', sprite: 'c4_saisiyat_m', x: 29, y: 14, dir: 'left' });
    await S.say('阿成', '走南邊那條稜線，風比較小。我帶你們到岔路口。');
    await S.say('夏阿公', '去吧，客人。');
    await S.say('夏阿公', '下次來，不用滾下山。走路來就好。');
    await S.say('xinghe:laugh', '一定！');
    S.face('bz_lake', 'xia_lake');
    await S.say('', '白芷向夏阿公深深鞠了一躬。');
    await S.say('baizhi:smile', '謝謝您。……謝謝您讓我聽。');
    await S.say('夏阿公', '是你自己聽見的。');
    S.flag('ch4_trail_south_open');
    S.flag('ch4_lake_morning', false);
    await S.fadeOut(0.9);
    for (const id of ['bz_lake', 'hy_lake', 'yg_lake', 'yy_lake', 'mc_lake', 'xia_lake', 'ac_lake']) S.remove(id);
    S.hideFollowers(false);
    await S.warp('wuzhi_trail', 37, 40, 'left', { fade: 0 });
    S.spawn({ id: 'ac_trail', sprite: 'c4_saisiyat_m', x: 38, y: 41, dir: 'left' });
    await S.fadeIn(0.9);
    await S.say('阿成', '從這裡上去。中午以前喔——這次是真的。');
    await S.move('ac_trail', 'R');
    await S.fadeActor('ac_trail', 0, 0.5);
    S.remove('ac_trail');
    S.quest('q_ch4_main', 3);
    S.objective('再上五指山，穿過風穴口');
  }
  async function xiaReady(S) {
    await S.say('夏阿公', '準備好了嗎？太陽下山，就要綁芒草了。');
    const c = await S.choice(['準備好了', '再等一下'], { cancel: 1 });
    if (c !== 0) { await S.say('夏阿公', '不急。客人在這裡，吃飽、睡飽、安安靜靜。'); return; }
    await S.fadeOut(1.0);
    await S.warp('xiangtian_festival', 33, 15, 'down', { fade: 0 });
    await S.fadeIn(1.0);
  }
  G.Maps.define('xiangtian', {
    name: '向天湖', subtitle: '賽夏・向天湖部落', place: 'xiangtian',
    bgm: (st) => (st.flags.ch4_lake_morning ? null : 'mountain'), start: [30, 2],
    light: (st) => (st.flags.ch4_lake_morning ? { ambient: 0.2, color: '#3a4a5a' } : { ambient: 0.08, color: '#203040' }),
    particles: (st) => (st.flags.ch4_lake_morning ? [{ type: 'mist', density: 2 }] : ['mist', 'leaves']),
    tiles: xiangtianGrid.rows(), objects: () => xiangtianObjects(false),
    npcs: [
      {
        id: 'xia', sprite: 'saisiyat_elder', name: '夏阿公', x: 34, y: 16, dir: 'down', if: (st) => !st.flags.ch4_lake_morning,
        talk: async (S) => {
          if (F('ch4_pastaay_witnessed')) { await sayAll(S, '夏阿公', ['祭典結束了。人回去種田，歌收起來，等兩年後再唱。', '你們的事也辦完了？好。放下，不是忘記。']); return; }
          await sayAll(S, '夏阿公', ['祭典的事，有朱家的長老在帶。我只是一個話多的老人。', '客人在這裡，吃飽、睡飽、安安靜靜。這樣就是幫忙了。', '我們的漢姓，很多是從天地萬物來的——日、風、夏、豆、樟……我家是夏。']);
          await xiaReady(S);
        },
      },
      {
        id: 'acheng_x', sprite: 'c4_saisiyat_m', name: '阿成', x: 31, y: 16, dir: 'down', if: (st) => !st.flags.ch4_lake_morning,
        talk: async (S) => {
          if (broken(G.state)) { await S.say('阿成', '下次來，走路來就好。用滾的太快了。'); return; }
          await sayAll(S, '阿成', ['你們四個加兩隻貓，從山上滾下來的樣子，我會記很久。', '祭典的這幾天，大家都很忙，也很開心。只是開心的方式，跟你們想的不太一樣。']);
        },
      },
      {
        id: 'daso', sprite: 'c4_saisiyat_f', name: '夏大嫂', x: 37, y: 14, dir: 'up', if: (st) => !st.flags.ch4_lake_morning,
        talk: async (S) => {
          if (broken(G.state)) { await S.say('夏大嫂', '下次來，我教那個姑娘織一條帶子。她的手很巧。'); return; }
          await S.say('夏大嫂', '苧麻要先剝、刮、曬，再捻成線，才能織布。一件衣服，要好幾個月。');
          if (!F('ch4_pastaay_witnessed')) await S.say('夏大嫂', '那個穿藍衫的姑娘，身體好冷。我煮了熱湯，你拿去給她。');
        },
      },
      { id: 'afu_x', sprite: 'hakka_m', name: '阿福', x: 36, y: 21, dir: 'down', if: (st) => !st.flags.ch4_pastaay_witnessed, talk: ['𠊎兜來作客。祭典个事，聽主人家个。'] },
      { id: 'atao_x', sprite: 'hakka_f', name: '阿桃', x: 37, y: 21, dir: 'down', if: (st) => !st.flags.ch4_pastaay_witnessed, talk: ['𠊎兜客家人來，也係綁芒草，安安靜靜看。'] },
      { id: 'p1', sprite: 'c4_saisiyat_m', name: '部落的人', x: 27, y: 15, dir: 'down', wander: 2, if: (st) => !st.flags.ch4_lake_morning, talk: async (S) => { await S.say('部落的人', broken(G.state) ? '吃飽了嗎？' : '客人好。'); } },
      { id: 'p2', sprite: 'c4_saisiyat_f', name: '部落的人', x: 39, y: 9, dir: 'left', wander: 2, if: (st) => !st.flags.ch4_lake_morning, talk: async (S) => { await S.say('部落的人', broken(G.state) ? '客人好。' : '吃飽了嗎？'); } },
      { id: 'p3', sprite: 'c4_saisiyat_m', name: '部落的人', x: 30, y: 27, dir: 'up', wander: 2, if: (st) => !st.flags.ch4_lake_morning, talk: async (S) => { await S.say('部落的人', broken(G.state) ? '湖邊的霧，今天特別好看。' : '芒草綁好了沒？'); } },
      { id: 'p4', sprite: 'c4_saisiyat_f', name: '部落的人', x: 36, y: 31, dir: 'left', wander: 2, if: (st) => !st.flags.ch4_lake_morning, talk: async (S) => { await S.say('部落的人', '客人好。'); } },
    ],
    events: [
      { id: 'wood', trigger: 'action', x: 31, y: 26, w: 1, h: 1, label: '調查', run: async (S) => { await S.say('', '一捆捆砍好的柴，整整齊齊地堆著。'); } },
    ],
    warps: [
      {
        x: 30, y: 0, to: 'wuzhi_trail', tx: 37, ty: 40, tdir: 'left',
        run: async (S) => {
          if (F('ch4_trail_south_open')) return true;
          await S.say('阿成', '那個姑娘還沒好，你們就別急著走了。');
          await stepBack(S, 'down');
          return false;
        },
      },
      { x: 33, y: 13, to: 'xiangtian_house', tx: 7, ty: 8, tdir: 'up', door: true },
    ],
  });

  // ----------------------------------------------------------------------- the festival night (4-11) — witness only
  const FEST_ALLOWED = [[28, 19, 11, 5], [32, 14, 3, 5]];
  const inFest = (x, y) => FEST_ALLOWED.some(([ax, ay, aw, ah]) => x >= ax && x < ax + aw && y >= ay && y < ay + ah);
  const festRing = (() => {
    const out = [], seen = {};
    for (const [ax, ay, aw, ah] of FEST_ALLOWED) for (let y = ay; y < ay + ah; y++) for (let x = ax; x < ax + aw; x++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (inFest(nx, ny) || seen[nx + ',' + ny]) continue;
        if (nx >= 32 && nx <= 35 && ny >= 11 && ny <= 13 && !(nx === 33 && ny === 13)) continue;
        seen[nx + ',' + ny] = 1;
        out.push([nx, ny]);
      }
    }
    return out;
  })();
  const DANCERS = 18;
  function festDancers() {
    const out = [];
    for (let i = 0; i < DANCERS; i++) {
      out.push({ id: 'dancer' + i, sprite: i % 2 ? 'c4_saisiyat_f' : 'c4_saisiyat_m', x: 33, y: 26, dir: 'down', through: true, fixedDir: true, if: (st) => !!st.flags.ch4_fest_night });
    }
    return out;
  }
  function moveDancers(m, t) {
    if (F('ch4_fest_night') && m.cam && !m.c4CamLock) { m.cam.tx = m.player.px - G.W / 2; m.cam.ty = m.player.py - G.H / 2 + 4 * T; }
    for (const a of m.npcs) {
      if (!a.id || a.id.indexOf('dancer') !== 0) continue;
      const i = +a.id.slice(6);
      const ang = i / DANCERS * Math.PI * 2 + t * 0.05;
      a.px = 33.5 * T + Math.cos(ang) * 4.2 * T;
      a.py = 29.6 * T + Math.sin(ang) * 2.5 * T;
      const vx = -Math.sin(ang), vy = Math.cos(ang);
      a.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');
      a.alpha = 0.85;
      a.walkInPlace = true;
      a.phase = t * 0.35 + i * 0.5;
    }
  }
  async function festBoundary(S) {
    await S.say('阿成', '那邊不要過去喔。');
    const m = G.mapScene, p = m.player;
    for (const [d, dx, dy] of [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]]) {
      if (inFest(p.x + dx, p.y + dy) && !m.blocked(p.x + dx, p.y + dy, p)) { S.face('player', d); await pushPlayer(S, d, 1); return; }
    }
    await stepBack(S);
  }
  async function scene411a(S) {
    S.flag('ch4_fest_tied');
    await S.wait(0.4);
    await S.say('', '黃昏。湖面映著晚霞。夏家門前，夏阿公手裡拿著一束芒草。');
    await S.say('夏阿公', '芒草，是保護。綁上它，是保護自己，也是告訴大家：我知道規矩，我是來作客的。');
    await S.say('', '他抽出一片芒草葉，對折、繞圈、打結，綁在星河的手腕上。');
    await S.say('xinghe:think', '呃……這樣對嗎？');
    await S.say('', '星河笨手笨腳地學著打結——打成了一團。');
    await S.say('夏阿公', '……像一團被貓抓過的線。');
    S.emote('fc_yy', '…');
    await S.say('', '他拆開，重新綁好。');
    await S.say('夏阿公', '慢一點。結要綁緊，心要放鬆。');
    await S.say('', '紅纓三兩下就綁好了，又緊又整齊。');
    await S.say('夏阿公', '這個姑娘綁得好。');
    await S.say('hongying:shy', '……槍纓天天要綁。');
    await S.say('', '雲歸把芒草往葫蘆上綁。');
    await S.say('夏阿公', '綁在身上。葫蘆不用保護。裡面的酒，倒是可以少喝一點。');
    await S.say('yungui:smug', '……今天被老人家教訓兩次了。');
    await S.say('', '白芷慢慢地、很仔細地綁好自己的。然後她看向腳邊的兩隻貓。');
    await S.say('baizhi:think', '夏爺爺，牠們也可以綁嗎？');
    await S.say('夏阿公', '可以。客人就是客人。');
    await S.say('', '麻糬的尾巴上，綁了一個小小的芒草結。她一本正經地坐好，一聲不吭。');
    await S.say('', '芋圓的繡球上也繫了一根。他看起來很不高興——但沒有拆掉。');
    S.emote('fc_hy', '♥');
    await S.say('hongying:shy', '（……好可愛。）');
    await S.fadeOut(1.2);
    S.flag('ch4_fest_night');
    S.light({ ambient: 0.75, color: '#05060e', playerR: 150 });
    S.particles(['embers']);
    S.refresh();
    for (const [id, x, y] of [['fc_hy', 29, 21], ['fc_yg', 30, 20], ['fc_yy', 30, 21], ['fc_bz', 36, 21], ['fc_mc', 37, 21], ['xia_f', 33, 21]]) S.setPos(id, x, y, 'down');
    S.setPos('player', 33, 19, 'down');
    await S.fadeIn(1.4);
    await S.say('', '天黑。湖邊的祭場燃起火光。');
    await S.say('', '遠遠地，人們手牽著手圍成大圈，隨著歌聲緩緩移動。腰間的臀鈴隨步伐沙沙作響，高高的肩旗在火光中閃爍。');
    await S.say('', '歌聲低沉而綿長，一句接著一句，像潮水，也像嘆息。');
    S.toast('此刻請靜靜地看、靜靜地聽。');
    await S.say('', '星河張口想說話，又閉上了。');
  }
  async function scene411b(S) {
    await S.say('', '夏阿公在他們身邊坐下，聲音壓得很低。');
    await S.say('夏阿公', '很久很久以前，河的對岸住著矮人。我們叫他們 ta\'ay。');
    await S.say('夏阿公', '他們個子小，本事很大。我們的祖先跟他們學種田的本事，也學唱歌。');
    await S.say('夏阿公', '後來，矮人做了讓我們的祖先忍不下去的事。');
    await S.say('夏阿公', '我們的祖先生氣了。也做了一件……收不回來的事。');
    await S.say('夏阿公', '矮人幾乎都死了。活下來的，把這些歌和祭儀教給我們，然後離開了。');
    await S.say('夏阿公', '從那時候起，每兩年，收成以後，我們就請他們回來。每十年，是大祭。');
    await S.say('夏阿公', '唱歌給他們聽，請他們吃、請他們喝，向他們道歉，也說說這兩年過得怎麼樣。');
    await S.say('夏阿公', '然後，再好好地送他們走。');
    await S.say('hongying:serious', '……那麼久以前的事，為什麼還要一直記著？');
    await S.say('hongying:sad', '一直記著，不會痛嗎？');
    await S.say('', '她的手指不自覺地握緊了槍桿。');
    await S.say('夏阿公', '會痛。');
    await S.say('夏阿公', '可是如果忘了，同樣的事，就會再發生一次。');
    await S.say('夏阿公', '如果只記得恨，人會被恨吃掉。');
    await S.say('夏阿公', '所以我們記得，是為了不要再犯。我們道歉，是為了讓記憶可以放下來，休息。');
    await S.say('yungui:serious', '……記住，然後送走。');
    await S.say('yungui:think', '有人把魂收在燈裡，說是為了不讓思念被風吹散。');
    await S.say('', '夏阿公看著火光，想了一下。');
    await S.say('夏阿公', '把人關起來，那不叫記得。');
    await S.say('夏阿公', '那叫捨不得。');
    await S.wait(0.8);
    await S.say('', '圈子裡，歌聲轉了一個調。不知為什麼，白芷的臉頰濕了。');
    await S.say('xinghe:surprise', '白芷？妳……');
    await S.say('baizhi:cry', '……奇怪。我不知道為什麼。');
    await S.say('baizhi:cry', '我聽不懂歌詞，可是眼淚……自己掉下來了。');
    await S.say('夏阿公', '有些歌，不是用耳朵聽的。');
    await S.say('baizhi:sad', '夏爺爺……我可以學一句嗎？只要一句就好。');
    await S.say('夏阿公', '這些歌，只在祭典裡唱。平常，連我們自己都不唱。');
    await S.say('baizhi:think', '……我明白了。那我只用心記住，不用嘴巴。');
    await S.say('', '夏阿公第一次轉過頭來看她，笑了。');
    await S.say('夏阿公', '這樣就很好。');
    await S.say('', '芋圓窩在紅纓腿上睡著了，繡球上的芒草結隨著呼吸輕輕晃動。紅纓一動也不敢動。');
    await S.say('', '火光。歌聲。湖面上的月亮，很圓。');
    await S.fadeOut(2.0);
    S.flag('ch4_fest_night', false);
    await S.wait(1.0);
    await lakeMorning(S);
  }
  G.Maps.define('xiangtian_festival', {
    name: '向天湖', subtitle: 'paSta\'ay', place: 'xiangtian', bgm: null, noSave: true, autosave: false, start: [33, 15],
    light: (st) => (st.flags.ch4_fest_night ? { ambient: 0.75, color: '#05060e', playerR: 150 } : { ambient: 0.35, color: '#3a1a10' }),
    particles: (st) => (st.flags.ch4_fest_night ? ['embers'] : ['mist']),
    tiles: xiangtianGrid.rows(), objects: () => xiangtianObjects(true),
    lights: (st) => (st.flags.ch4_fest_night ? fireLights.concat([{ x: 33, y: 29, r: 300, color: '#ff9a40', flicker: 0.5 }]) : []),
    onEnter: async () => {
      // the circle moves slowly every frame (an update hook, so it works for any renderer)
      const m = G.mapScene;
      if (!m || m.c4Fest) return;
      m.c4Fest = true;
      m.hideFollowers = true;
      const up0 = m.update.bind(m);
      m.update = function (dt) { up0(dt); moveDancers(m, m.t); };
    },
    npcs: [
      {
        id: 'xia_f', sprite: 'saisiyat_elder', name: '夏阿公', x: 33, y: 17, dir: 'up',
        talk: async (S) => {
          if (!F('ch4_fest_night')) { await S.say('夏阿公', '慢一點。結要綁緊，心要放鬆。'); return; }
          await scene411b(S);
        },
      },
      { id: 'fc_hy', sprite: 'hongying', name: '洛紅纓', x: 34, y: 16, dir: 'up', talk: async (S) => { await S.say('hongying:normal', '……我本來以為，祭典都是很熱鬧的。'); } },
      { id: 'fc_yg', sprite: 'yungui', name: '雲歸', x: 32, y: 16, dir: 'up', talk: async (S) => { await S.say('yungui:normal', '熱鬧的地方很多。安靜的才少見。'); } },
      { id: 'fc_yy', sprite: 'yuyuan', name: '芋圓', x: 34, y: 17, dir: 'up', talk: async (S) => { await S.say('', '芋圓一動也不動，繡球上的芒草結輕輕晃。'); } },
      { id: 'fc_mc', sprite: 'mochi', name: '麻糬', x: 31, y: 17, dir: 'up', talk: async (S) => { await S.say('', '麻糬端坐在白芷腳邊，火光映在她的眼睛裡。'); } },
      { id: 'fc_bz', sprite: 'baizhi', name: '白芷', x: 32, y: 17, dir: 'up', talk: async (S) => { await S.say('', '白芷只是看著火光，沒有說話。'); } },
      { id: 'acheng_f', sprite: 'c4_saisiyat_m', name: '阿成', x: 38, y: 19, dir: 'left', talk: ['祭場那邊，客人只要在這裡看就好。', '那邊不要過去喔。'] },
      {
        id: 'afu_f', sprite: 'hakka_m', name: '阿福', x: 37, y: 22, dir: 'down',
        talk: async (S) => { await S.say('阿福', '……這幾暝，𠊎毋唱山歌。'); await S.say('xinghe:surprise', '咦，你也會安靜？'); await S.say('阿福', '人家的祭典，愛尊重。'); },
      },
      { id: 'atao_f', sprite: 'hakka_f', name: '阿桃', x: 38, y: 22, dir: 'down', talk: ['𠊎兜客家人來，也係綁芒草，安安靜靜看。'] },
    ].concat(festDancers()),
    events: [{ id: 'c4_411a', trigger: 'auto', if: (st) => !st.flags.ch4_fest_tied, run: scene411a }]
      .concat(festRing.map(([x, y]) => ({ id: `fest_edge_${x}_${y}`, trigger: 'touch', x, y, run: festBoundary }))),
  });

  // ----------------------------------------------------------------------- 1-13 xiangtian_house 夏家
  async function scene410(S) {
    S.flag('ch4_xiangtian_arrive');
    S.hideFollowers(true);
    S.spawn({ id: 'bz_bed', sprite: 'baizhi', x: 11, y: 3, dir: 'down' });
    S.spawn({ id: 'hy_h', sprite: 'hongying', x: 4, y: 6, dir: 'right' });
    S.spawn({ id: 'yg_h', sprite: 'yungui', x: 4, y: 4, dir: 'right' });
    S.spawn({ id: 'yy_h', sprite: 'yuyuan', x: 5, y: 7, dir: 'up' });
    S.spawn({ id: 'mc_h', sprite: 'mochi', x: 10, y: 5, dir: 'up' });
    S.spawn({ id: 'ac_h', sprite: 'c4_saisiyat_m', x: 8, y: 7, dir: 'left' });
    S.bgm(null);
    await S.wait(0.6);
    await S.fadeIn(1.4);
    await S.say('', '竹子與木頭搭成的屋子，屋樑上掛著一捆捆苧麻。爐火劈啪作響。');
    await S.say('xinghe:hurt', '……嗚。這裡是……');
    S.face('player', 'ac_h');
    await S.say('阿成', '醒啦？這裡是向天湖，我家。');
    await S.say('阿成', '你們四個加一隻貓，從五指山南坡滾下來，剛好滾到我砍竹子的地方。');
    await S.say('xinghe:think', '我們明明一早就出發了……');
    await S.say('阿成', '你們在半山腰跟山鬼打了一個上午。我在對面山頭都聽得到。');
    S.emote('yy_h', '💢');
    await S.say('', '芋圓瞪著阿成。');
    await S.say('阿成', '……好，兩位貓大人。');
    await S.say('xinghe:surprise', '白芷呢？！');
    await S.say('阿成', '在裡面睡。我媽在照顧她。她身體……很冷，像冬天的湖水。');
    await S.walkTo('player', 10, 3);
    S.face('player', 'right');
    await S.say('', '白芷躺著，臉色蒼白；她放在被子外的手，指尖透著淡淡的光，幾乎看得見底下的竹蓆紋路。');
    S.bgm('mountain', { fade: 3 });
    await S.say('xinghe:sad', '……');
    await S.say('', '他握住她的手。光慢慢退去，指尖重新變得實在、溫暖。');
    await S.say('xinghe:think', '（剛才……是我看錯了嗎？）');
    S.spawn({ id: 'xia_h', sprite: 'saisiyat_elder', x: 7, y: 8, dir: 'up' });
    await S.move('xia_h', 'UU', { speed: 1.8 });
    await S.say('', '一位老人拄著木杖走進來，步伐很穩。他看了白芷一眼，又看了星河握著的手。');
    await S.say('夏阿公', '人沒事。身體冷，要多睡、喝熱湯，急不來的。');
    await S.say('夏阿公', '倒是你們幾個，摔得挺結實的。');
    await S.say('夏阿公', '我姓夏。這小子的阿公。');
    await S.say('yungui:normal', '多謝夏老先生收留。');
    await S.say('夏阿公', '不用謝。在山裡看到人倒在路邊，不撿回家，祖先會罵的。');
    await S.say('hongying:serious', '我們得盡快再上山——');
    await S.say('夏阿公', '那個風穴？這一個月的風，我們也覺得不對。');
    await S.say('夏阿公', '可是你們這樣衝上去，再滾下來一次，就不是摔青一塊這麼簡單了。');
    await S.say('夏阿公', '等那個姑娘醒來。');
    await S.fadeOut(1.0);
    await S.narrate(['數日後・十月'], { veil: 1 });
    S.remove('ac_h');
    await S.fadeIn(1.0);
    await S.say('', '白芷睜開眼睛。');
    await S.say('baizhi:normal', '……星河？');
    await S.say('xinghe:smile', '妳醒了！');
    await S.say('baizhi:sad', '風裡的那些人……我聽見他們了。好多好多，全都在喊，可是我不知道怎麼回答。');
    await S.say('baizhi:sad', '我好像……本來應該知道的。');
    await S.say('xinghe:serious', '沒關係。我們一起想。');
    S.spawn({ id: 'ac_h2', sprite: 'c4_saisiyat_m', x: 7, y: 8, dir: 'up' });
    await S.move('ac_h2', 'U');
    await S.say('阿成', '醒了就好。正好——再過兩天，是我們的 paSta\'ay，矮靈祭。');
    await S.say('阿成', '阿公說，你們如果願意，可以留下來，當客人。');
    await S.say('夏阿公', '是客人，就要守客人的規矩。');
    await S.say('夏阿公', '第一，身上要綁芒草。我們會教你們怎麼綁。');
    await S.say('夏阿公', '第二，不吵、不鬧、不罵人，不跟人爭東西。');
    await S.say('夏阿公', '第三，看、聽，就好。歌和舞是我們的，不是表演給人看的。不要亂學，不要亂碰。');
    await S.say('夏阿公', '做得到，就留下。做不到，我叫阿成送你們下山，不會怪你們。');
    await S.say('xinghe:serious', '我們做得到。');
    await S.say('hongying:serious', '……我會管好這個笨蛋。');
    await S.say('yungui:normal', '我會管好這兩隻貓。');
    await S.say('', '芋圓別過頭去。麻糬輕輕眨了眨眼，像是答應了。');
    await S.say('夏阿公', '很好。');
    // dinner
    await S.fadeOut(0.8);
    S.spawn({ id: 'daso_h', sprite: 'c4_saisiyat_f', x: 6, y: 5, dir: 'right' });
    await S.fadeIn(0.8);
    await S.say('', '晚飯。夏大嫂端出一鍋熱湯和糯米飯。阿成倒了一小杯小米酒，雙手遞給客人。');
    await S.say('夏大嫂', '吃吧，吃飽才會好。');
    await S.say('', '雲歸依禮雙手接過，輕抿一口。');
    await S.say('yungui:normal', '……好喝。');
    await S.say('夏阿公', '比你葫蘆裡的米酒好吧。');
    await S.say('yungui:smug', '……我不予置評。');
    await S.say('阿成', '那就是承認了。');
    await S.say('baizhi:smile', '好暖。暖到心裡面。');
    S.flag('ch4_pastaay_invited');
    await S.fadeOut(0.6);
    for (const id of ['bz_bed', 'hy_h', 'yg_h', 'yy_h', 'mc_h', 'xia_h', 'ac_h2', 'daso_h']) S.remove(id);
    S.hideFollowers(false);
    await S.warp('xiangtian_house', 7, 7, 'down', { fade: 0 });
    await S.fadeIn(0.6);
    S.objective('在向天湖作客（與夏阿公說話）');
  }
  G.Maps.define('xiangtian_house', {
    name: '夏家', subtitle: '向天湖', place: 'xiangtian', bgm: (st) => (st.flags.ch4_xiangtian_arrive ? 'mountain' : null), start: [7, 8],
    light: { ambient: 0.4, color: '#140a06' },
    tiles: room(14, 10, 'n', 'W', 7).rows(),
    objects: [
      { t: 'firepit', x: 7, y: 5 }, { t: 'loom', x: 2, y: 3 }, { t: 'basket', x: 3, y: 2, v: 3 }, { t: 'basket', x: 1, y: 6, v: 1 },
      { t: 'bed_mat', x: 11, y: 2 }, { t: 'bed_mat', x: 12, y: 2 }, { t: 'bed_mat', x: 12, y: 6 }, { t: 'jar', x: 1, y: 8 }, { t: 'jar', x: 12, y: 8 },
    ],
    lights: [{ x: 7, y: 5, r: 240, color: '#ff8a3a', flicker: 0.5 }],
    events: [
      { id: 'c4_410', trigger: 'auto', if: (st) => !!st.flags.ch4_wall_blown && !st.flags.ch4_xiangtian_arrive, run: scene410 },
      { id: 'beds_x', trigger: 'action', x: 11, y: 2, w: 2, h: 2, label: '休息', run: async (S) => { await S.say('xinghe:think', '祭典期間大家都很累，不打擾了。'); } },
    ],
    warps: [{ x: 7, y: 9, to: 'xiangtian', tx: 33, ty: 14, tdir: 'down', door: true }],
  });

  // =====================================================================================================
  // 1-14 wind_cave_1 五指山風穴・風道
  // =====================================================================================================
  const caveLight = (amb) => (st) => (broken(st) ? { ambient: 0.4, color: '#1a120a', playerR: 240 } : { ambient: amb, color: '#060a14', playerR: 230 });
  const caveParticles = (st) => (broken(st) ? [{ type: 'dust', density: 0.5 }] : [{ type: 'wind', density: 1.2 }, { type: 'motes', density: 0.9 }]);
  const STONE_HOME = [[5, 4], [7, 4]], VENTS_C = [[4, 5], [8, 5]];
  function drawVent(ctx, x, y, on, t) {
    const cx = x * T + T / 2, cy = y * T + T / 2;
    ctx.save();
    ctx.fillStyle = '#0c0e14'; ctx.beginPath(); ctx.ellipse(cx, cy, 24, 14, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#4a5260'; ctx.lineWidth = 2; ctx.stroke();
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 8, cy - 10); ctx.lineTo(cx + i * 8, cy + 10); ctx.stroke(); }
    if (on) {
      for (let k = 0; k < 6; k++) {
        const ph = (t * 1.6 + k / 6) % 1;
        ctx.strokeStyle = `rgba(210,235,255,${0.5 * (1 - ph)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - 16 + k * 6, cy - ph * 70); ctx.lineTo(cx - 16 + k * 6 + Math.sin(t * 6 + k) * 4, cy - ph * 70 - 18); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawUpdraft(ctx, x, y, t, h = 3) {
    const cx = x * T + T / 2, cy = y * T + T;
    ctx.save();
    const g = ctx.createLinearGradient(0, cy - h * T, 0, cy);
    g.addColorStop(0, 'rgba(200,235,255,0)'); g.addColorStop(1, 'rgba(200,235,255,0.45)');
    ctx.fillStyle = g; ctx.fillRect(cx - 26, cy - h * T, 52, h * T);
    for (let k = 0; k < 8; k++) {
      const ph = (t * 1.2 + k / 8) % 1;
      ctx.fillStyle = `rgba(235,248,255,${0.8 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(cx + Math.sin(t * 3 + k * 2) * 18, cy - ph * h * T, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function stonesOnVents() {
    const m = G.mapScene;
    const st = m.objects.filter((o) => o.c4stone);
    return VENTS_C.every(([vx, vy]) => st.some((o) => o.x === vx && o.y === vy));
  }
  function resetStones() {
    const m = G.mapScene;
    if (!m || F('ch4_cave_lift')) return false;
    let moved = false;
    m.objects.filter((o) => o.c4stone).forEach((o, i) => {
      if (o.x !== STONE_HOME[i][0] || o.y !== STONE_HOME[i][1]) moved = true;
      o.x = STONE_HOME[i][0]; o.y = STONE_HOME[i][1]; o.key = o.t + '@' + o.x + ',' + o.y;
    });
    m.computeSolid();
    return moved;
  }
  async function s6Mushroom(S) {
    S.emote('mochi', '!');
    await S.say('', '麻糬對著岩縫輕輕嗅了嗅，回頭看了白芷一眼。');
    await S.say('', '岩縫裡貼著一片片灰白色、薄如耳朵的石耳。風一吹，它們輕輕振動，發出極細的「叮——」聲。');
    await S.say('yungui:surprise', '風穴石耳！書上說只長在終年有風的岩壁——居然真的有！');
    await S.say('', '雲歸掏出蕈譜，畫完，又摘下一片。');
    await S.say('yungui:serious', '為了研究，必須親口嚐一片。');
    await S.say('hongying:smug', '你每次都這樣說。');
    S.vision(8);
    await S.say('', '雲歸的瞳孔變成彩色的漩渦。背景微微呼吸。');
    await S.say('yungui:serious', '……吾明白了。');
    await S.say('yungui:serious', '風，沒有形狀。所以它必須借別人的形狀，才能被看見。');
    await S.say('yungui:serious', '它借米粉的形狀、借柿子的形狀、借芒草的形狀……');
    await S.say('yungui:serious', '今天，它借了吾的形狀。……叮。');
    S.sfx('bell');
    await S.say('baizhi:surprise', '打嗝的聲音像風鈴！');
    await S.say('yungui:serious', '吾就是風。吾——……叮。……吾要睡了。');
    await S.say('', '雲歸往後一倒。芋圓趁機叼走了剩下的石耳。紅纓笑到蹲下。');
    await S.say('xinghe:think', '……蕈譜上寫，吃了會打嗝打出風鈴聲，連打三天。');
    await S.give('mat_fengxun', 1);
    V().tuanzi_mush = (V().tuanzi_mush || 0) + 1;
    S.flag('mush_ch4');
    S.quest('q_tuanzi_mush', 9);
  }
  G.Maps.define('wind_cave_1', {
    name: '五指山風穴', subtitle: '風道', place: 'hsinchu', bgm: (st) => (broken(st) ? 'mountain' : 'wind'), start: [20, 42],
    light: caveLight(0.6), particles: caveParticles,
    tiles: (() => {
      const g = new Grid(40, 44, 'C');
      g.rect(14, 36, 13, 7, 'v').rect(20, 43, 1, 1, 'v');
      g.rect(19, 14, 3, 22, 'v');
      for (const [x, y] of [[18, 31], [22, 27], [18, 23], [22, 19], [23, 19], [18, 15]]) g.set(x, y, 'v');
      g.rect(4, 8, 29, 6, 'v');
      g.rect(4, 3, 5, 4, 'v').set(6, 7, 'v').set(6, 2, 'v');
      g.rect(28, 1, 7, 7, 'v');
      g.set(35, 2, 'v').set(36, 2, 'v').set(36, 3, 'v');
      return g.rows();
    })(),
    objects: [
      { t: 'rock_small', x: 5, y: 4, push: true, c4stone: true, if: (st) => !st.flags.ch4_cave_lift },
      { t: 'rock_small', x: 7, y: 4, push: true, c4stone: true, if: (st) => !st.flags.ch4_cave_lift },
      { t: 'rock_small', x: 4, y: 5, if: (st) => !!st.flags.ch4_cave_lift }, { t: 'rock_small', x: 8, y: 5, if: (st) => !!st.flags.ch4_cave_lift },
      {
        t: 'bell', x: 5, y: 9, label: '敲響',
        interact: async (S) => {
          S.sfx('bell');
          if (resetStones()) await S.say('', '叮——。風聲一轉，兩顆風帆石被吹回了原位。');
          else await S.say('', '小小的風鈴，被風吹得叮叮作響。');
        },
      },
      saveStone(22, 38, '岩壁被風磨出一道道流線紋。風聲在這裡稍微小了一點。'),
      { t: 'rock_small', x: 35, y: 2, illusion: true },
      { t: 'rock_big', x: 15, y: 39 }, { t: 'rock_small', x: 25, y: 37 }, { t: 'rock_small', x: 14, y: 41 }, { t: 'bones', x: 24, y: 41 },
      { t: 'rock_small', x: 12, y: 9 }, { t: 'rock_big', x: 23, y: 9 }, { t: 'rock_small', x: 31, y: 12 }, { t: 'crystal', x: 30, y: 2 }, { t: 'crystal', x: 33, y: 1 },
    ],
    winds: [{ x: 19, y: 14, w: 3, h: 22, dir: 'down', period: 3.5, dur: 2.0, if: (st) => !broken(st) }],
    onPush: async (S) => {
      if (F('ch4_cave_lift') || !stonesOnVents()) return;
      S.flag('ch4_cave_lift');
      S.sfx('switch');
      await S.say('', '兩個漏風口都被風帆石蓋住了。風聲轉沉——北面的岩縫裡，升起一道上升氣流。');
    },
    drawGround: (ctx, t, m) => {
      const lift = F('ch4_cave_lift');
      for (const [vx, vy] of VENTS_C) {
        const covered = lift || m.objects.some((o) => o.c4stone && o.x === vx && o.y === vy);
        drawVent(ctx, vx, vy, !covered && !broken(G.state), t);
      }
      if (lift) drawUpdraft(ctx, 6, 2, t, 2.5);
      if (!broken(G.state)) for (const [x, y] of [[18, 31], [22, 27], [18, 23], [22, 19], [18, 15]]) {
        ctx.fillStyle = 'rgba(140,170,200,0.12)'; ctx.fillRect(x * T + 6, y * T + 6, T - 12, T - 12);
      }
    },
    chests: [
      { id: 'c4_16', x: 23, y: 19, item: 'xumingsan', n: 2 },
      { id: 'c4_17', x: 33, y: 6, item: 'ac_yingshi' },
      { id: 'c4_18', x: 10, y: 12, gold: 600, item: 'huanhunxiang', n: 2 },
      { id: 'c4_19', x: 36, y: 3, item: 'lingxun', spirit: true, run: async (S) => { S.gold(400); } },
    ],
    enemies: [
      { id: 'w1a', troop: 't4_cave_a', x: 14, y: 10, art: 'wind_sprite', variant: 1, radius: 3, lv: 15 },
      { id: 'w1b', troop: 't4_cave_b', x: 31, y: 4, art: 'mine_bat', variant: 1, radius: 2, lv: 15 },
      { id: 'w1c', troop: 't4_cave_c', x: 27, y: 11, art: 'sea_wisp', variant: 2, radius: 3, lv: 16, if: (st) => !broken(st) },
      { id: 'w1d', troop: 't4_cave_d', x: 8, y: 11, art: 'mountain_ghost', variant: 1, radius: 2, lv: 16, if: (st) => !broken(st) },
    ],
    events: [
      { id: 'cave_a_done', trigger: 'touch', x: 19, y: 13, w: 3, h: 1, if: (st) => !st.flags.ch4_cave_a, run: async (S) => { S.flag('ch4_cave_a'); S.sfx('switch'); await S.say('yungui:normal', '……過來了。這陣風，一陣一陣的，像在喘氣。'); } },
      { id: 'cave_intro', trigger: 'touch', x: 14, y: 36, w: 13, h: 1, once: true, run: async (S) => { await S.say('baizhi:think', '風一陣一陣的……風停的時候往前走，風來的時候躲進岩壁的凹洞裡。'); } },
      { id: 'room_leave', trigger: 'touch', x: 6, y: 8, w: 1, h: 1, if: (st) => !st.flags.ch4_cave_lift, run: async () => { resetStones(); } },
      {
        id: 'updraft', trigger: 'touch', x: 6, y: 2, w: 1, h: 1, if: (st) => !!st.flags.ch4_cave_lift,
        run: async (S) => {
          S.sfx('wind');
          await S.say('', '上升氣流把眾人整個「吐」了上去——');
          await S.warp('wind_cave_2', 22, 37, 'up', { color: '#e8f4ff' });
        },
      },
      // clue for the 靈視-only crevice (illusion rock at 35,2): 麻糬 notices it on entering the north-east chamber
      {
        id: 's6_clue', trigger: 'touch', x: 28, y: 7, w: 7, h: 1, once: true, if: (st) => !st.flags.mush_ch4,
        run: async (S) => {
          S.emote('mochi', '?');
          await S.say('', '（麻糬盯著東邊角落那塊石頭，鬍鬚一動一動。石頭後面，隱約有風「叮、叮」地響。）');
          await S.say('yungui:think', '……肉眼看是石頭。開了靈視，說不定就不是了。');
        },
      },
      { id: 's6', trigger: 'action', x: 37, y: 2, w: 1, h: 1, label: '調查', spirit: true, hint: true, if: (st) => !st.flags.mush_ch4, run: s6Mushroom },
    ],
    warps: [{ x: 20, y: 43, to: 'wuzhi_trail', tx: 19, ty: 4, tdir: 'down' }],
  });

  // =====================================================================================================
  // 1-15 wind_cave_2 風鈴廳／回音廊
  // =====================================================================================================
  const VENT_X = [16, 22, 28];
  const CHIMES = [ // [x, y, name, toggles]
    [15, 29, '竹鈴', [0, 1]], [19, 29, '銅鈴', [1, 2]], [25, 29, '貝鈴', [0, 2]], [29, 29, '石鈴', [1]],
  ];
  const vents = () => (F('ch4_cave_chimes') ? [0, 1, 0] : (V().c4_vents || [1, 0, 1]));
  async function ringChime(S, idx) {
    const [, , name, tog] = CHIMES[idx];
    S.sfx('bell');
    if (F('ch4_cave_chimes')) { await S.say('', `${name}輕輕響了一聲。風車穩穩地轉著。`); return; }
    const v = vents().slice();
    for (const k of tog) v[k] = v[k] ? 0 : 1;
    V().c4_vents = v;
    V().c4_flash = { t: G.time, which: tog };
    await S.wait(0.3);
    if (v[0] && v[1] && v[2]) {
      S.sfx('wind'); S.shake(10, 0.6);
      await S.say('', '三股風同時灌了進來！');
      await pushPlayer(S, 'down', 4);
      return;
    }
    if (!v[0] && v[1] && !v[2]) {
      S.flag('ch4_cave_chimes');
      S.sfx('switch');
      await S.wait(0.4);
      await S.say('', '只剩中間的風口開著。風直直地吹在大風車上——風車轉了起來。');
      S.sfx('push'); S.shake(6, 0.8);
      await S.say('', '東牆的石門緩緩升起。');
      S.refresh();
    }
  }
  const ECHO = [ // fork: room centre, tunnels [x, text, correct]
    { back: [36, 9], t: [[34, '留下來……陪我們……', false], [36, '別走……別忘了我……', false], [38, '……讓我回家。', true]] },
    { back: [24, 9], t: [[22, '我想……放手了。', true], [24, '把燈點著……永遠別熄……', false], [26, '抓緊……再抓緊一點……', false]] },
    { back: [12, 9], t: [[10, '誰都……不准走……', false], [12, '替我跟阿母說……我不怕了。', true], [14, '好冷……再靠近一點……', false]] },
  ];
  async function echoLoop(S, fork) {
    await S.fadeOut(0.6);
    await S.say('', '「留下來……」');
    const [bx, by] = ECHO[fork].back;
    await S.warp('wind_cave_2', bx, by, 'down', { fade: 0 });
    await S.fadeIn(0.6);
    if (Math.random() < 0.5) await S.battle('t4_echo');
  }
  function drawCave2(ctx, t, m) {
    const v = vents();
    const fl = V().c4_flash;
    const solved = F('ch4_cave_chimes');
    // vents on the north wall face + wind columns toward the wheel
    VENT_X.forEach((x, i) => {
      const cx = x * T + T / 2, cy = 18 * T + T * 0.55;
      const flash = fl && fl.which.includes(i) && G.time - fl.t < 0.6;
      ctx.save();
      ctx.fillStyle = flash ? '#3a4a6a' : '#0a0c12'; ctx.beginPath(); ctx.roundRect(cx - 26, cy - 18, 52, 32, 8); ctx.fill();
      ctx.strokeStyle = v[i] ? '#9ad0ff' : '#3a4250'; ctx.lineWidth = 3; ctx.stroke();
      if (v[i] && !broken(G.state)) {
        const tx = 22 * T + T / 2, ty = 25 * T + T / 2;
        for (let k = 0; k < 9; k++) {
          const ph = (t * (solved ? 1.2 : 1.8) + k / 9) % 1;
          const px = U.lerp(cx, tx, ph) + Math.sin(t * 7 + k) * (solved ? 3 : 10), py = U.lerp(cy + 20, ty, ph);
          ctx.strokeStyle = `rgba(210,235,255,${0.55 * (1 - ph)})`; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - (tx - cx) * 0.04, py - 16); ctx.stroke();
        }
      }
      ctx.restore();
    });
    for (const [x, y, name] of CHIMES) G.Render.text(ctx, name, x * T + T / 2, (y + 1) * T + 2, { size: 15, align: 'center', color: '#d8c8a0', alpha: 0.85 });
    // the great wind wheel
    const wx = 22 * T + T / 2, wy = 25 * T + T / 2;
    const ang = solved ? t * 2.2 : Math.sin(t * 9) * 0.12;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(wx, wy + 30, 64, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(wx, wy); ctx.rotate(ang);
    for (let k = 0; k < 6; k++) {
      ctx.rotate(Math.PI / 3);
      ctx.fillStyle = '#7a6a54'; ctx.strokeStyle = '#3a3024'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(58, -14); ctx.lineTo(58, 8); ctx.lineTo(6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawWhispers(ctx, t, m) {
    const p = m.player;
    ECHO.forEach((f) => {
      for (const [x, text, ok] of f.t) {
        if (Math.abs(p.x - x) > 2 || p.y < 5 || p.y > 10) continue;
        const a = 0.55 + 0.35 * Math.sin(t * 2 + x);
        G.Render.text(ctx, text, x * T + T / 2, 6.6 * T + Math.sin(t * 1.5 + x) * 4, { size: 16, align: 'center', color: ok ? '#ffe2a0' : '#a8d0ff', alpha: a, italic: true });
      }
    });
    // 清虛's half-burnt talisman on the wall
    if (!F('ch4_qingxu_talisman')) {
      const x = 4 * T + 16, y = 2 * T + 6;
      ctx.save();
      ctx.fillStyle = '#e8c860'; ctx.fillRect(x, y, 26, 46);
      ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.moveTo(x, y + 30); ctx.lineTo(x + 10, y + 40); ctx.lineTo(x + 20, y + 34); ctx.lineTo(x + 26, y + 46); ctx.lineTo(x, y + 46); ctx.fill();
      ctx.strokeStyle = `rgba(220,40,30,${0.6 + 0.3 * Math.sin(t * 3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 13, y + 6); ctx.lineTo(x + 13, y + 26); ctx.moveTo(x + 6, y + 12); ctx.lineTo(x + 20, y + 12); ctx.stroke();
      ctx.restore();
    }
  }
  async function scene414(S) {
    await S.camera(4, 3, 0.6);
    await S.say('', '岩壁上釘著一張燒了一半的黃符，硃砂字跡還在微微發光。');
    await S.say('yungui:surprise', '這字……是師父的筆跡！');
    await S.say('yungui:think', '「鎮」字少了最後一筆……他寫得很急。');
    await S.say('yungui:serious', '師父在這裡打過一場。');
    await S.say('hongying:serious', '那他人呢？');
    await S.say('yungui:think', '符還亮著。寫符的人，還活著。');
    await S.say('', '他小心地把殘符揭下，收進懷裡。');
    S.flag('ch4_qingxu_talisman');
    await S.give('key_qingxu_talisman', 1);
    S.cameraFollow();
    await S.say('yungui:smile', '老頭子，你最好給我活著。我還有一堆帳要跟你算。');
    await S.say('', '麻糬靠過去，蹭了蹭雲歸的手。');
    await S.say('yungui:normal', '沒事。走吧。');
  }
  G.Maps.define('wind_cave_2', {
    name: '五指山風穴', subtitle: '風鈴廳・回音廊', place: 'hsinchu', bgm: (st) => (broken(st) ? 'mountain' : 'wind'), start: [22, 37],
    light: caveLight(0.65), particles: caveParticles,
    tiles: (() => {
      const g = new Grid(44, 40, 'C');
      g.rect(18, 34, 9, 4, 'v').rect(21, 33, 3, 1, 'v');
      g.rect(12, 19, 20, 14, 'v');
      g.rect(9, 25, 2, 3, 'v').set(11, 26, 'v');
      g.set(32, 25, 'v').set(33, 25, 'v');
      g.rect(34, 11, 3, 21, 'v');
      g.rect(37, 30, 3, 1, 'v');
      g.rect(33, 8, 7, 3, 'v').rect(34, 4, 1, 4, 'v').rect(36, 4, 1, 4, 'v').rect(38, 2, 1, 6, 'v').rect(29, 2, 10, 1, 'v').rect(29, 2, 1, 8, 'v').set(28, 9, 'v');
      g.rect(21, 8, 7, 3, 'v').rect(22, 2, 1, 6, 'v').rect(24, 4, 1, 4, 'v').rect(26, 4, 1, 4, 'v').rect(17, 2, 6, 1, 'v').rect(17, 2, 1, 8, 'v').set(16, 9, 'v');
      g.rect(9, 8, 7, 3, 'v').rect(10, 4, 1, 4, 'v').rect(12, 2, 1, 6, 'v').rect(14, 4, 1, 4, 'v').rect(7, 2, 6, 1, 'v');
      g.rect(2, 3, 6, 7, 'v');
      return g.rows();
    })(),
    objects: [
      ...CHIMES.map(([x, y, name], i) => ({ t: 'bell', x, y, label: '敲響', interact: async (S) => { await ringChime(S, i); } })),
      {
        t: 'drum_rack', x: 22, y: 31, label: '敲鑼',
        interact: async (S) => {
          S.sfx('gong');
          if (F('ch4_cave_chimes')) { await S.say('', '鑼聲在風鈴廳裡迴盪。'); return; }
          V().c4_vents = [1, 0, 1];
          await S.say('', '咚——。鑼聲一響，三個風口回到了原來的樣子。');
        },
      },
      { t: 'mural', x: 13, y: 18, v: 3, label: '調查', interact: ['壁畫上刻著四行字：', '「北風三門，獨開其中；風車自轉，石門自通。」'] },
      { t: 'rock_big', x: 32, y: 24, if: (st) => !st.flags.ch4_cave_chimes },
      { t: 'stairs_down', x: 3, y: 6 }, saveStone(7, 6, '清虛的殘符旁，風聲忽然安靜了下來。'),
      { t: 'rock_small', x: 37, y: 30, illusion: true },
      { t: 'crystal', x: 12, y: 19 }, { t: 'crystal', x: 31, y: 20 }, { t: 'rock_small', x: 13, y: 31 }, { t: 'rock_small', x: 30, y: 31 },
      { t: 'rock_small', x: 18, y: 37 }, { t: 'bones', x: 25, y: 35 }, { t: 'crystal', x: 2, y: 9 },
    ],
    drawGround: (ctx, t, m) => drawCave2(ctx, t, m),
    drawOver: (ctx, t, m) => drawWhispers(ctx, t, m),
    chests: [
      { id: 'c4_20', x: 9, y: 26, item: 'xiancao', n: 3 },
      { id: 'c4_21', x: 26, y: 4, item: 'ft_lupi', run: async (S) => { await echoLoop(S, 1); } },
      { id: 'c4_22', x: 4, y: 8, gold: 600, item: 'xumingsan', n: 2, run: async (S) => { await S.give('xiangbao', 2); } },
      { id: 'c4_23', x: 39, y: 30, item: 'ac_jinqian', spirit: true },
    ],
    enemies: [
      { id: 'w2a', troop: 't4_cave2_a', x: 35, y: 20, art: 'wind_sprite', variant: 2, radius: 3, lv: 17 },
      { id: 'w2b', troop: 't4_cave2_b', x: 35, y: 14, art: 'wind_sprite', variant: 2, radius: 2, lv: 17, if: (st) => !broken(st) },
      { id: 'w2c', troop: 't4_cave2_c', x: 25, y: 36, art: 'sea_wisp', variant: 2, radius: 2, lv: 16, if: (st) => !broken(st) },
    ],
    events: [
      { id: 'hall_hint', trigger: 'touch', x: 21, y: 33, w: 3, h: 1, once: true, run: async (S) => { await S.say('baizhi:think', '兩邊的風在吵架。只留中間那一道，它就能好好地說話了。'); } },
      { id: 'echo_hint', trigger: 'touch', x: 34, y: 11, w: 3, h: 1, once: true, run: async (S) => { await S.say('baizhi:think', '想留下的聲音，是冷的。想離開的聲音……有一點暖。'); } },
      ...[[34, 4, 0], [36, 4, 0], [24, 4, 1], [10, 4, 2], [14, 4, 2]].map(([x, y, f]) => ({ id: `echo_${x}`, trigger: 'touch', x, y, run: async (S) => { await echoLoop(S, f); } })),
      { id: 'echo_done', trigger: 'touch', x: 7, y: 3, w: 1, h: 1, if: (st) => !st.flags.ch4_cave_echo, run: async (S) => { S.flag('ch4_cave_echo'); S.sfx('switch'); } },
      { id: 'c4_414', trigger: 'touch', x: 2, y: 4, w: 6, h: 2, if: (st) => !st.flags.ch4_qingxu_talisman, run: scene414 },
    ],
    warps: [{ x: 3, y: 6, to: 'wind_cave_3', tx: 15, ty: 27, tdir: 'up' }],
  });

  // =====================================================================================================
  // 1-16 wind_cave_3 燈室
  // =====================================================================================================
  const BLADES = [[20, 13], [15, 17], [10, 15]];   // [row, gap x]
  const CP = [[15, 25], [16, 18], [15, 13]];
  async function bladeHit(S) {
    S.flash('#ffffff', 0.35, 0.8);
    S.sfx('slash');
    for (const m of G.Party.active()) { const st = G.Party.stats(m.id); m.hp = Math.max(1, m.hp - Math.round(st.mhp * 0.05)); }
    S.toast('被風刃割傷了！');
    const [x, y] = CP[V().c4_cp || 0];
    await S.warp('wind_cave_3', x, y, 'up', { fade: 0.2 });
    const m = G.mapScene;
    if (m && m.def.winds) windCalm(m.def.winds[0], 1.2);
  }
  function drawCave3(ctx, t) {
    const off = broken(G.state);
    if (!off) {
      for (const [row, gap] of BLADES) {
        for (let x = 13; x <= 17; x++) {
          if (x === gap) continue;
          const px = x * T, py = row * T;
          ctx.save();
          ctx.fillStyle = 'rgba(230,245,255,0.12)'; ctx.fillRect(px, py + 18, T, 28);
          for (let k = 0; k < 3; k++) {
            const ph = (t * 3 + k / 3 + x * 0.17) % 1;
            ctx.strokeStyle = `rgba(245,252,255,${0.85 - ph * 0.6})`; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(px + ph * T - 20, py + 24 + k * 8); ctx.lineTo(px + ph * T + 16, py + 22 + k * 8); ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    // the ring of burnt talismans around the lamp
    const cx = 15 * T + T / 2, cy = 4 * T + T / 2;
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const x = cx + Math.cos(a) * 150, y = cy + Math.sin(a) * 92;
      ctx.fillStyle = i % 3 === 0 ? '#d8b850' : '#2a2018';
      ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillRect(-8, -12, 16, 24); ctx.restore();
    }
    if (!off) {
      for (let i = 0; i < 26; i++) {
        const a = i / 26 * Math.PI * 2 + t * (0.6 + (i % 3) * 0.2);
        const r = 70 + (i % 5) * 18 + Math.sin(t * 2 + i) * 8;
        ctx.fillStyle = `rgba(150,200,255,${0.5 + 0.3 * Math.sin(t * 4 + i)})`;
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy - 30 + Math.sin(a) * r * 0.55, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  async function scene415(S) {
    await S.say('', '圓形石室。中央石台上立著一盞一人高的長明燈。燈罩上一道大裂縫，藍火從裂縫裡狂亂地噴吐。');
    await S.camera(15, 4, 0.8);
    await S.say('', '燈的周圍，地上貼著一圈黃符，大半已燒成黑灰。千百個藍色光點繞著燈旋轉——被吸進去，又被吐出來。');
    await S.say('yungui:serious', '師父的符陣……他想封住這盞燈。燈裂了，卻沒有滅。');
    await S.say('yungui:think', '裂開的燈，關不住魂，也放不走魂。只能一直吸、一直吐——');
    await S.say('xinghe:serious', '所以竹塹的風才會變成這樣。');
    S.sfx('wind'); S.shake(8, 0.8);
    await S.say('', '風聲驟然收緊。燈前的氣流凝成一個巨大的身影：長袖翻飛如帆，臉是千百張臉疊在一起。');
    await S.say('風魔', '……還……我……');
    await S.say('風魔', '留……下……／冷……／阿母……／別……走……');
    S.cameraFollow();
    await S.say('baizhi:sad', '它原本……是九降風吧。是曬米粉、曬柿子的那陣風。');
    await S.say('baizhi:serious', '它被燈綁住了。');
    await S.say('hongying:serious', '那就把燈砸了，把它放出來！');
    const r = await S.battle('t4_boss_wind_demon', { bgmAfter: 'sad' });
    if (r !== 'win') return;
    S.flag('ch4_boss_wind_demon');
    S.sfx('shatter'); S.flash('#ffffff', 0.6, 1); S.shake(10, 0.8);
    S.flag('ch4_lamp_broken');
    S.refresh();
    S.light({ ambient: 0.4, color: '#1a120a' });
    S.particles([{ type: 'motes', density: 0.6 }, 'sparkles']);
    await S.say('', '長明燈上的裂縫一路蔓延——「啪」一聲，碎了。');
    await S.say('', '千百個藍色光點同時停在半空。');
    S.sfx('sing');
    await S.say('', '白芷走上前，吹起渡魂謠。光點一顆一顆轉為溫暖的金色，順著風穴往外飄——往西，往竹塹，往城隍廟的方向。');
    await S.say('baizhi:think', '去吧。城隍爺在等你們報到。');
    await S.say('', '星河懷裡的生死簿殘頁微微發燙。他打開來——淡掉的名字一個一個重新浮現，墨色飽滿。');
    await S.say('', '其中一顆光點在白芷面前停了一下，碰了碰她的額頭。');
    await S.say('baizhi:surprise', '……！');
    S.flash('#ffffff', 0.8, 0.6);
    await S.narrate(['一片無邊的黑色海面。無數燈火漂向遠方。', '她站在燈火的盡頭，向每一盞燈點頭。'], { veil: 0.85 });
    await S.say('baizhi:think', '我好像……做過這件事。很多、很多次。');
    await S.say('', '她的輪廓邊緣，又透明了一點。只有星河看見。');
    await S.say('xinghe:sad', '……');
    S.sfx('wind');
    await S.say('', '風魔消散的地方，一陣乾爽的風拂過——帶著稻草、柿子和陽光的味道。');
    await S.say('yungui:smile', '……這才是九降風。');
    await S.say('baizhi:smile', '聞起來像柿餅！');
    S.emote('yuyuan', '♥');
    await S.say('', '燈座下的石壁上，有人用劍尖刻了一行字。');
    await S.say('', '燈裂而魂未釋，吾力不逮。此燈底款，出自鹿港。吾往鹿港，追其源。——清虛');
    await S.say('yungui:think', '鹿港……');
    await S.say('', '紅纓的身子微微一僵。');
    await S.say('xinghe:think', '紅纓，鹿港不是妳……');
    await S.say('hongying:serious', '……我家。走吧。正好順路。');
    await S.say('', '燈座碎片中，有一片刻著長明宮的燈紋，底部壓著半個模糊的店號印。');
    await S.give('key_lamp_shard', 1);
    S.flag('ch4_qingxu_clue_lukang');
    S.quest('q_ch4_main', 4);
    if (G.Quests.stage('q_mifen') >= 0 && !F('ch4_mifen_mother')) S.quest('q_mifen', 2);
    S.objective('回竹塹，向城隍爺稟報');
    await S.fadeOut(1.0);
    await S.warp('wuzhi_trail', 19, 5, 'down', { fade: 0 });
    S.bgm('mountain');
    await S.fadeIn(1.0);
  }
  G.Maps.define('wind_cave_3', {
    name: '五指山風穴深處', subtitle: '燈室', place: 'hsinchu', bgm: (st) => (broken(st) ? 'sad' : 'wind'), start: [15, 27],
    light: (st) => (broken(st) ? { ambient: 0.4, color: '#1a120a', playerR: 240 } : { ambient: 0.7, color: '#040814', playerR: 220 }),
    particles: caveParticles,
    tiles: (() => {
      const g = new Grid(30, 30, 'C');
      g.rect(11, 26, 11, 3, 'v').rect(13, 9, 5, 17, 'v').rect(8, 2, 15, 7, 'v');
      return g.rows();
    })(),
    objects: [
      { t: 'eternal_lamp', x: 15, y: 4, cracked: true, if: (st) => !broken(st) }, { t: 'eternal_lamp', x: 15, y: 4, broken: true, lit: false, if: (st) => broken(st) },
      { t: 'stairs_up', x: 15, y: 28 }, saveStone(12, 27, '石階盡頭。往上吸的風，在這裡發出低低的嗚咽。'),
      { t: 'rock_small', x: 9, y: 3 }, { t: 'rock_small', x: 21, y: 7 }, { t: 'crystal', x: 8, y: 7 }, { t: 'crystal', x: 22, y: 2 }, { t: 'bones', x: 19, y: 3 },
    ],
    lights: (st) => (broken(st) ? [{ x: 15, y: 4, r: 260, color: '#ffc070', flicker: 0.2 }] : [{ x: 15, y: 4, r: 420, color: '#4a8aff', flicker: 0.6 }]),
    winds: [{ x: 13, y: 9, w: 5, h: 17, dir: 'up', period: 3.0, dur: 1.4, if: (st) => !broken(st) }],
    drawGround: (ctx, t) => drawCave3(ctx, t),
    chests: [{ id: 'c4_24', x: 20, y: 27, item: 'huanhunxiang', n: 1, run: async (S) => { await S.give('xumingsan', 2); } }],
    events: [
      { id: 'blade20', trigger: 'touch', x: 14, y: 20, w: 4, h: 1, if: (st) => !broken(st), run: bladeHit },
      { id: 'blade15', trigger: 'touch', x: 13, y: 15, w: 4, h: 1, if: (st) => !broken(st), run: bladeHit },
      { id: 'blade10a', trigger: 'touch', x: 13, y: 10, w: 2, h: 1, if: (st) => !broken(st), run: bladeHit },
      { id: 'blade10b', trigger: 'touch', x: 16, y: 10, w: 2, h: 1, if: (st) => !broken(st), run: bladeHit },
      { id: 'cp1', trigger: 'touch', x: 13, y: 19, w: 5, h: 1, if: (st) => !broken(st) && !(st.vars.c4_cp >= 1), run: async () => { V().c4_cp = 1; } },
      { id: 'cp2', trigger: 'touch', x: 13, y: 14, w: 5, h: 1, if: (st) => !broken(st) && !(st.vars.c4_cp >= 2), run: async () => { V().c4_cp = 2; } },
      { id: 'suction_hint', trigger: 'touch', x: 11, y: 26, w: 11, h: 1, once: true, run: async (S) => { await S.say('yungui:serious', '風往燈室裡吸……橫在路上的白線是風刃。對準缺口，讓風把我們拉過去。'); } },
      { id: 'c4_415', trigger: 'touch', x: 13, y: 9, w: 5, h: 1, if: (st) => !st.flags.ch4_boss_wind_demon, run: scene415 },
    ],
    warps: [{ x: 15, y: 28, to: 'wind_cave_2', tx: 4, ty: 6, tdir: 'right' }],
  });

  // =====================================================================================================
  // Chapter entry
  // =====================================================================================================
  G.Story.ch4 = async (S) => {
    S.chapter(4);
    // 雲歸的蕈譜 (q_tuanzi_mush): the quest log points at this chapter's 七仙蕈 (stage texts in ch3)
    { const q = G.state.quests.q_tuanzi_mush; if (q && !q.done && !G.state.flags.mush_ch4) q.stage = 3; }
    const lv = 13;
    for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) {
      if (!G.state.members[id]) G.Party.create(id, lv);
      else G.Story.ensureLevel(id, lv);
      if (!G.state.party.includes(id)) G.state.party.push(id);
    }
    // keep the canonical order (星河 leads)
    const ORDER = ['xinghe', 'baizhi', 'hongying', 'yungui'];
    const rank = (id) => (ORDER.includes(id) ? ORDER.indexOf(id) : 99);
    G.state.party.sort((a, b) => rank(a) - rank(b));
    // the two cats from 九份 follow the party (set in chapter 1; also set here for a standalone start)
    G.state.flags.mochi_joined = true; G.state.flags.yuyuan_joined = true;
    G.state.flags.mochi_hidden = false; G.state.flags.yuyuan_hidden = false;
    S.quest('q_ch4_main', 0);
    G.state.vars.objective = '前往竹塹城內的都城隍廟';
    await S.travel('bangka', 'hsinchu', { label: '沿著海線官道南下，往竹塹……' });
    await S.titleCard(G.Chapters[4], '九月下旬・竹塹北郊');
    await S.warp('zhuqian_coast', 13, 3, 'down', { fade: 0.6 });
  };
})();

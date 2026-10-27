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

  // @@PART3@@
})();

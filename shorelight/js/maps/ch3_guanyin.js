// 第三章　觀音艋舺 — 淡水（紅毛城）→ 八里渡口 → 觀音山道 → 太虛觀 → 艋舺（龍山寺・剝皮寮・舊渡頭）
// Screenplay: docs/story/ch3_guanyin_bangka.md
//
// Maps: tamsui, tamsui_inn, tamsui_fort, tamsui_fort_in, guanyin_trail, taixu, taixu_hall, taixu_room,
//       bangka, bangka_inn, bangka_armory, bangka_herb, bangka_alian, bangka_xing, bangka_longshan,
//       bangka_bopiliao, bangka_theatre, bangka_riverbank.
// State: vars.c3_ts ('dusk'|'night'|'morning'|'day') = time of day in 淡水; vars.ch3_day (0 十四黃昏/夜, 1 十五白天,
//        2 中秋夜) in 艋舺; vars.c3_taixu ('day'|'night') at 太虛觀; vars.c3_fog / c3_fog_miss = 迷霧步道 progress;
//        vars.tuanzi_mush = 七仙蕈 counter (cross-chapter).
// Quests: q_ch3_main, q_tamsui_soldiers, q_alian, q_xiaomei, q_feud, q_tuanzi_mush (cross-chapter).
// 心燈: lantern_tamsui_soldiers, lantern_alian, lantern_xiaomei, lantern_yizigu, lantern_feud.
'use strict';
(function () {
  const U = G.U;
  const T = G.TILE;
  const V = () => G.state.vars;
  const F = (k) => !!G.state.flags[k];
  const inParty = (id) => G.state.party.includes(id);
  const tsTime = (st) => (st || G.state).vars.c3_ts || 'dusk';
  const bkDay = (st) => (st || G.state).vars.ch3_day || 0;
  const bkNight = (st) => bkDay(st) !== 1;
  const txNight = (st) => (st || G.state).vars.c3_taixu === 'night';
  const vis = () => !!(G.mapScene && G.mapScene.visionOn());

  // ------------------------------------------------------------------ grid helpers (maps are built in code)
  function grid(w, h, ch) { const g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill(ch)); return g; }
  function fill(g, x, y, w, h, ch) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy] && xx >= 0 && xx < g[yy].length) g[yy][xx] = ch;
  }
  function set(g, x, y, ch) { if (g[y] && x >= 0 && x < g[y].length) g[y][x] = ch; }
  function rows(g) { return g.map((r) => r.join('')); }
  // interior room: 2-thick top wall, 1-thick side/bottom walls, door gaps in the bottom wall
  function room(w, h, floor, wall, doors) {
    const g = grid(w, h, floor);
    fill(g, 0, 0, w, 2, wall); fill(g, 0, 0, 1, h, wall); fill(g, w - 1, 0, 1, h, wall); fill(g, 0, h - 1, w, 1, wall);
    for (const dx of doors || []) g[h - 1][dx] = floor;
    return g;
  }
  // scatter deco chars deterministically over cells of a given terrain char
  function scatter(deco, tiles, terrain, chars, density, seed) {
    for (let y = 0; y < tiles.length; y++) for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] !== terrain || deco[y][x] !== ' ') continue;
      const h = U.hash(x, y, seed);
      if (h < density) deco[y][x] = chars[Math.floor(U.hash(y, x, seed + 1) * chars.length)];
    }
  }
  const avgLv = () => { const a = G.Party.active(); return a.length ? Math.round(a.reduce((s, m) => s + m.lv, 0) / a.length) : 9; };

  // ------------------------------------------------------------------ custom sprite variants (ghosts of this chapter)
  if (G.Sprites && G.Sprites.define) {
    G.Sprites.define('c3_ghost_diego', { base: 'ghost_m', body: 'tall', // 迪亞哥: tall bearded Spanish soldier ghost with an iron helmet
      face: { beard: 'full', beardColor: '#8a7a68' }, hat: { type: 'guard', color: '#8a96a4' },
      hair: { style: 'side', color: '#5a4a3a', back: 'short' },
      top: { color: '#9aa8b8', len: 0.5, closure: 'center', trim: '#6a7888', sleeve: 'long' }, armor: { color: '#a8b4c0', trim: '#6a7888' },
      bottom: { type: 'pants', color: '#6a7686' }, shoes: { type: 'boots', color: '#5a6676' } });
    G.Sprites.define('c3_ghost_peter', { base: 'ghost_m', body: 'adult', size: 0.88, // 彼得: skinny Dutch drummer boy
      hair: { style: 'messy', color: '#c8b07a', back: 'short' }, hat: { type: 'cap', color: '#5a6a8a' },
      top: { color: '#b8c4d8', len: 0.3, closure: 'center', trim: '#8090b0', sleeve: 'long' }, sash: { color: '#c8d0e0', w: 2 },
      bottom: { type: 'pants', color: '#6a7a96' }, shoes: { type: 'boots', color: '#4a5266' }, hip: ['pouch'] });
    G.Sprites.define('c3_ghost_ade', { base: 'ghost_m', // 阿德: drowned boatman, soaked, straw hat
      hat: { type: 'douli', color: '#a8b4b0' }, hair: { style: 'messy', color: '#2a3038' },
      top: { color: '#9aacb8', len: 0.22, closure: 'center', trim: '#6a7c88', sleeve: 'rolled' }, bottom: { type: 'shorts', color: '#6a7a88' } });
    G.Sprites.define('c3_ghost_ashui', { base: 'ghost_m', body: 'elder', // 阿水伯 (頂郊): burnt grey-blue shirt
      hair: { style: 'bald', color: '#9a9aa4' }, face: { beard: 'goatee', beardColor: '#c8ccd4' },
      top: { color: '#8a9ab8', len: 0.45, closure: 'side', trim: '#5a6a88', sleeve: 'long' }, bottom: { type: 'wide', color: '#6a7488' } });
    G.Sprites.define('c3_ghost_awang', { base: 'ghost_m', body: 'elder', // 阿旺伯 (下郊): greenish shirt, headband
      hair: { style: 'back', color: '#8a8a94' }, hat: { type: 'band', color: '#7a9a8a' }, face: { beard: 'mustache', beardColor: '#c0c4c8' },
      top: { color: '#9ab8a8', len: 0.45, closure: 'center', trim: '#5a7a6a', sleeve: 'rolled' }, bottom: { type: 'wide', color: '#6a8478' } });
    G.Sprites.define('c3_yizigu', { base: 'ghost_child', // 椅仔姑: little girl in old patched clothes
      hair: { style: 'center', color: '#2a2a36', back: 'lowtie', len: 0.25 },
      top: { color: '#c8b8c8', len: 0.55, closure: 'side', trim: '#988898', sleeve: 'long' }, bottom: { type: 'pants', color: '#9a8a9a' } });
    G.Sprites.define('c3_ghost_xiaomei', { base: 'ghost_child', // 小梅: two little braids
      hair: { style: 'center', color: '#2a2a36', knot: 'twin', tie: '#e8a8b8' },
      top: { color: '#e0c8d0', len: 0.4, closure: 'side', trim: '#b898a8', sleeve: 'short' }, bottom: { type: 'pants', color: '#b0a0b0' } });
  }
  const spr = (id, fb) => (G.Sprites && G.Sprites.has && G.Sprites.has(id) ? id : fb);

  // ------------------------------------------------------------------ items
  const I = G.Data.items;
  Object.assign(I, {
    c3_riceball: { name: '紅纓的飯糰', desc: '紅纓借客棧廚房做的飯糰。外面很硬，裡面也很硬。回復氣血 30。', type: 'use', price: 0, ch: 3, icon: 'food', use: { target: 'ally', heal: 30 } },
    c3_fishball: { name: '魚丸湯', desc: '淡水的魚丸，用鯊魚肉搥出來的，咬起來會跳。回復氣血 120。（戰鬥外使用）', type: 'use', price: 5, ch: 3, icon: 'food', use: { target: 'ally', heal: 120, field: true, battle: false } },
    c3_fishcrisp: { name: '魚酥', desc: '炸得金黃的魚酥，一袋分著吃。全體回復氣血 60。（戰鬥外使用）', type: 'use', price: 12, ch: 3, icon: 'food', use: { target: 'allies', heal: 60, field: true, battle: false } },
    c3_qingxinlu: { name: '清心露', desc: '薄荷與青草熬成的清露，喝了頭腦清涼。回復真氣 30。', type: 'use', price: 40, ch: 3, icon: 'drink', use: { target: 'ally', mp: 30 } },
    c3_ningshen: { name: '凝神丹', desc: '艋舺藥鋪的丸藥，安神定魄。回復真氣 60。', type: 'use', price: 80, ch: 3, icon: 'pill', use: { target: 'ally', mp: 60 } },
    c3_herbtea: { name: '青草茶', desc: '青草巷的退火茶，苦中帶甘。解除一切異常並回復氣血 50。', type: 'use', price: 25, ch: 3, icon: 'drink', use: { target: 'ally', heal: 50, cure: ['poison', 'sleep', 'seal', 'stun', 'trance'] } },
    c3_wanguo: { name: '碗粿', desc: '艋舺北渡頭阿蓮的碗粿，米香十足。回復氣血 150。', type: 'use', price: 6, ch: 3, icon: 'food', use: { target: 'ally', heal: 150, field: true, battle: false } },
    c3_wanguo_lite: { name: '阿蓮碗粿（少鹽）', desc: '阿蓮說，從今以後少放一點鹽。回復氣血 180。', type: 'use', price: 8, ch: 3, icon: 'food', use: { target: 'ally', heal: 180 } },
    c3_wendan: { name: '文旦', desc: '中秋吃文旦，團團圓圓。剝開分給大家。全體回復真氣 30。（戰鬥外使用）', type: 'use', price: 10, ch: 3, icon: 'food', use: { target: 'allies', mp: 30, field: true, battle: false } },
    c3_mooncake: { name: '月餅', desc: '艋舺餅店的月餅，餡料紮實。回復氣血 200。', type: 'use', price: 25, ch: 3, icon: 'food', use: { target: 'ally', heal: 200 } },
    c3_sameboat_wine: { name: '同船米酒', desc: '太虛觀自釀的米酒，兩個老鬼在神桌前對飲過的那一壺。全體回復四成氣血並提升攻擊。', type: 'use', price: 0, ch: 3, icon: 'wine', use: { target: 'allies', healPct: 0.4, buffs: [{ stat: 'atk', amt: 0.3, turns: 2 }], battle: true, field: false } },
    c3_redpaper: { name: '紅紙', desc: '糊燈籠用的紅紙。', type: 'material', price: 5, ch: 3, icon: 'scroll' },
    c3_bamboo: { name: '竹篾', desc: '削得又薄又韌的竹片，彎成燈籠骨。', type: 'material', price: 3, ch: 3, icon: 'vine' },
    c3_candle: { name: '蠟燭', desc: '一小截紅蠟燭。', type: 'material', price: 2, ch: 3, icon: 'lantern' },
    c3_whetstone: { name: '磨刀石', desc: '觀音山石磨成的磨刀石，又硬又細。採石工阿石送的。', type: 'material', price: 100, ch: 3, icon: 'gem' },
    c3_scallop: { name: '扇貝殼', desc: '一枚褪色的扇貝殼。紋路像一把攤開的扇。', type: 'key', price: 0, ch: 3, icon: 'gem' },
    c3_windmill: { name: '小風車', desc: '木頭刻的小風車，四片翅膀，風一吹就轉。', type: 'key', price: 0, ch: 3, icon: 'charm' },
    c3_lantern_base: { name: '水燈座', desc: '漁夫阿財給的舊水燈座。退潮的時候放出去，燈會走得最遠。', type: 'key', price: 0, ch: 3, icon: 'lantern' },
    c3_taixu_key: { name: '太虛觀鑰匙', desc: '雲歸房間裡那口箱子的鑰匙。', type: 'key', price: 0, ch: 3, icon: 'key' },
    c3_mush_book: { name: '雲歸蕈譜', desc: '雲歸的蕈菇筆記。第一頁畫著七個空格，標題是「七仙蕈」。', type: 'key', price: 0, ch: 3, icon: 'scroll' },
    c3_mask_shard: { name: '鬼面碎片', desc: '太虛觀鐘樓下撿到的面具碎片。內側有焦黑的痕跡，像被火燒過。', type: 'key', price: 0, ch: 3, icon: 'gem' },
    // equipment
    c3_old_helmet: { name: '舊鐵盔', desc: '紅毛城裡生鏽的鐵盔，不知道是哪一國的兵留下的。', type: 'head', price: 0, ch: 3, icon: 'hat', stats: { def: 6 } },
    c3_sw_guanyin: { name: '觀音山石劍', desc: '劍身嵌著觀音山石，沉而不鈍。土屬性。', type: 'weapon', price: 0, ch: 3, icon: 'sword', who: ['xinghe'], elem: 'earth', stats: { atk: 22, def: 2 } },
    c3_fn_thunderwood: { name: '雷擊木符扇', desc: '被雷劈過的棗木做的扇骨，夾著太虛觀的符。木屬性。', type: 'weapon', price: 0, ch: 3, icon: 'fan', who: ['yungui'], elem: 'wood', stats: { atk: 4, mag: 29 } },
    c3_fn_peach: { name: '桃木符扇', desc: '艋舺陳師傅削的桃木扇骨，辟邪。', type: 'weapon', price: 600, ch: 3, icon: 'fan', who: ['yungui'], stats: { atk: 5, mag: 30 } },
    c3_ar_shortcoat: { name: '艋舺短打', desc: '碼頭工人穿的粗布短打，耐磨又好活動。', type: 'armor', price: 520, ch: 3, icon: 'armor', who: ['xinghe', 'yungui'], stats: { def: 14 } },
    c3_ar_embroidered: { name: '繡花褙子', desc: '艋舺繡莊的褙子，袖口繡著小小的玉蘭花。', type: 'armor', price: 540, ch: 3, icon: 'armor', who: ['baizhi', 'hongying'], stats: { def: 13, mag: 3 } },
    c3_ar_water_gauze: { name: '水紋紗衣', desc: '翻覆的小船下找到的紗衣，水紋會隨光流動。減輕水屬性傷害。', type: 'armor', price: 0, ch: 3, icon: 'armor', who: ['baizhi'], stats: { def: 12, mag: 4 }, resist: ['water'] },
    c3_ft_cloudboots: { name: '雲紋道靴', desc: '太虛觀後院槐樹下埋著的道靴，鞋底繡著雲紋。', type: 'feet', price: 0, ch: 3, icon: 'shoes', stats: { def: 5, spd: 3 } },
    c3_hd_ade: { name: '阿德的斗笠', desc: '阿蓮家牆上的舊斗笠。阿德戴了十年。減輕水屬性傷害。', type: 'head', price: 0, ch: 3, icon: 'hat', stats: { def: 9 }, resist: ['water'] },
    c3_ac_foreign_button: { name: '異鄉的銅釦', desc: '迪亞哥留下的銅釦，上面刻著看不懂的字。免疫幻境。', type: 'acc', price: 0, ch: 3, icon: 'charm', stats: { spd: 5, luk: 5 }, immune: ['trance'] },
    c3_ac_monkey_stone: { name: '猴兒石符', desc: '石猴王化回石頭時留下的一小塊，摸起來溫溫的。減輕土屬性傷害。', type: 'acc', price: 0, ch: 3, icon: 'jade', stats: { def: 8 }, resist: ['earth'] },
    c3_ac_magnolia: { name: '玉蘭香囊', desc: '春婆縫的香囊，裝著曬乾的玉蘭花。戰鬥開始時持續回復。', type: 'acc', price: 0, ch: 3, icon: 'bag', stats: { mag: 6 }, special: ['autoRegen'] },
    c3_ac_rouge: { name: '胭脂', desc: '戲班的胭脂。洪班主說：「姑娘家，總要有一盒。」', type: 'acc', price: 0, ch: 3, icon: 'jade', who: ['baizhi', 'hongying'], stats: { luk: 10 } },
    c3_ac_cedar_guard: { name: '杉木護腕', desc: '福州杉削成的護腕，帶著淡淡的杉木香。', type: 'acc', price: 0, ch: 3, icon: 'charm', stats: { def: 4, hp: 40 } },
  });

  // ------------------------------------------------------------------ enemies & troops
  // c3enemy mirrors js/data/enemies.js def(): stats from G.Data.enemyCurve(lv) × multipliers.
  function c3enemy(id, d) {
    const c = G.Data.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: d.noExp ? 0 : Math.max(1, Math.round(c.exp * expM)), gold: d.noExp ? 0 : Math.max(1, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: d.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })),
      desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt']) if (d[k] != null) e[k] = d[k];
    G.Data.enemies[id] = e;
  }
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  G.Data.skills.c3_monkey_rocks = { name: '丟石頭', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemies', power: 0.6, fx: 'earth', sfx: 'earth' };
  G.Data.skills.c3_monkey_fist = { name: '猴拳', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.3, fx: 'earth', sfx: 'hit' };
  G.Data.skills.c3_monkey_incense = { name: '香火亂舞', desc: '頭上偷來的香燃了起來——「吱吱吱——！」', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'fire' };
  G.Data.skills.c3_wraith_wave = { name: '濁浪', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.9, fx: 'water_big', sfx: 'splash' };
  G.Data.skills.c3_wraith_bind = { name: '水草纏繞', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'seal', chance: 0.6, turns: 2 }, fx: 'seal', sfx: 'water' };
  G.Data.skills.c3_wraith_swallow = { name: '吞噬', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemy', power: 1.5, fx: 'bite', sfx: 'splash' };
  G.Data.skills.c3_wraith_call = { name: '呼喚水鬼', desc: '河底又爬出了東西。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['water_ghost_v1'], fx: 'summon', sfx: 'splash' };
  G.Data.skills.c3_old_slap = { name: '老拳', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemy', power: 0.4, fx: 'claw', sfx: 'hit' };
  G.Data.skills.c3_old_shout = { name: '「是你們先放火！」', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 2 }], fx: 'debuff', sfx: 'ghost' };

  c3enemy('c3_monkey_king', {
    name: '石猴王', art: 'stone_monkey', variant: 2, scale: 1.6, lv: 12, elem: 'earth', weak: ['wood'], boss: true, immune: BOSS_IMM,
    m: { hp: 8.2, atk: 1.45, def: 1.7, mag: 0.6, spd: 0.85, exp: 3.5, gold: 3 },
    skills: [['c3_monkey_rocks', 3], ['c3_monkey_fist', 3], ['c3_monkey_incense', 2, 'hp<50'], ['e_monkey_taunt', 1]],
    drops: [['jinchuang', 1]],
    desc: '一塊會站起來的觀音山巨石，石紋像皺巴巴的猴臉，頭頂插著一炷從土地公廟偷來的香。',
  });
  c3enemy('c3_mist_imp', {
    name: '霧精', art: 'mosina', variant: 1, lv: 11, elem: 'wood', m: { hp: 0.85, atk: 0.9, spd: 1.3, luk: 2 },
    skills: [['e_mosin_trick', 2], ['e_mist_veil', 2], ['e_claw', 2]], drops: [['xiangbao', 0.2]],
    desc: '觀音山迷霧步道裡的魔神仔。牽著人的手繞圈子，繞到天黑都走不出去。',
  });
  c3enemy('c3_river_boss', {
    name: '河伯怨靈', art: 'river_wraith', variant: 1, scale: 1.5, lv: 13, elem: 'water', weak: ['earth'], resist: ['fire'], boss: true, immune: BOSS_IMM,
    m: { hp: 10.5, atk: 1.5, mag: 1.7, def: 1.1, spd: 0.95, exp: 4, gold: 3.5 },
    skills: [['c3_wraith_wave', 3], ['c3_wraith_bind', 2], ['c3_wraith_swallow', 2], ['c3_wraith_call', 1]],
    drops: [['xiangbao', 1]],
    desc: '河底淤泥與水草纏成的巨大人形，臉是一團漩渦。身上掛著幾盞熄滅的漁燈。',
  });
  c3enemy('c3_ghost_ashui', {
    name: '阿水伯', sprite: spr('c3_ghost_ashui', 'ghost_m'), lv: 12, elem: 'water', m: { hp: 20, atk: 0.6, spd: 0.8 }, noExp: true, immune: BOSS_IMM,
    skills: [['c3_old_slap', 3], ['c3_old_shout', 1]], desc: '頂郊的老鬼。四十年來，只想知道是誰先放的火。',
  });
  c3enemy('c3_ghost_awang', {
    name: '阿旺伯', sprite: spr('c3_ghost_awang', 'ghost_m'), lv: 12, elem: 'water', m: { hp: 20, atk: 0.6, spd: 0.8 }, noExp: true, immune: BOSS_IMM,
    skills: [['c3_old_slap', 3], ['c3_old_shout', 1]], desc: '下郊的老鬼。脾氣跟阿水伯一樣硬。',
  });
  const TR = G.Data.troops;
  Object.assign(TR, {
    t_c3_trail_a: { enemies: ['rat_spirit', 'rat_spirit'], bg: 'mountain', bgm: 'battle' },
    t_c3_trail_b: { enemies: ['stone_monkey', 'rat_spirit'], bg: 'mountain', bgm: 'battle' },
    t_c3_trail_c: { enemies: ['stone_monkey', 'stone_monkey', 'rat_spirit'], bg: 'mountain', bgm: 'battle' },
    t_c3_trail_d: { enemies: ['c3_mist_imp', 'stone_monkey'], bg: 'forest', bgm: 'battle' },
    t_c3_trail_e: { enemies: ['c3_mist_imp', 'c3_mist_imp', 'rat_spirit'], bg: 'forest', bgm: 'battle' },
    t_c3_monkeyking: { enemies: ['c3_monkey_king', 'stone_monkey', 'stone_monkey'], bg: 'mountain', bgm: 'boss', boss: true, flee: false },
    t_c3_raid: { enemies: ['yin_soldier', 'yin_soldier', 'yin_soldier'], bg: 'temple', bgm: 'battle', flee: false },
    t_c3_guimian: { enemies: ['qingfeng_mask', 'yin_soldier', 'yin_soldier'], bg: 'temple', bgm: 'boss', boss: true, flee: false },
    t_c3_theatre: { enemies: ['paper_man', 'paper_man', 'paper_man', 'rat_spirit_v1'], bg: 'city', bgm: 'battle', flee: false },
    t_c3_river_a: { enemies: ['water_ghost_v1', 'water_ghost_v1', 'rat_spirit_v1'], bg: 'shore', bgm: 'battle' },
    t_c3_river_b: { enemies: ['river_wraith_v1', 'river_wraith_v1'], bg: 'shore', bgm: 'battle' },
    t_c3_river_boss: { enemies: ['c3_river_boss', 'water_ghost_v1', 'water_ghost_v1'], bg: 'shore', bgm: 'boss', boss: true, flee: false },
    t_c3_feud: { enemies: ['c3_ghost_ashui', 'c3_ghost_awang'], bg: 'city', bgm: 'battle', flee: false },
  });

  // ------------------------------------------------------------------ quests
  Object.assign(G.Data.quests, {
    q_ch3_main: { name: '觀音艋舺', main: true, desc: '陳伯要我們去觀音山太虛觀，找清虛真人。',
      stages: ['在淡水找客棧過夜，明早搭渡船過八里，上觀音山太虛觀。', '清晨到渡船頭，請阿海伯載我們過八里。', '穿過觀音山道，上山到太虛觀。',
        '前往艋舺龍山寺，向吳廟公打聽清虛真人的下落。', '戲棚後台，找洪班主。', '八月十五夜，戲班演出《山伯英台》。（在客棧休息即可推進到中秋夜）',
        '清虛真人沿海路南下，往竹塹。從艋舺南門出發。'],
      doneText: '清虛真人的信說：沿海路南下，先往竹塹。' },
    q_tamsui_soldiers: { name: '紅毛城的異鄉兵', lantern: true, desc: '紅毛城裡有兩個吵了兩百年的異鄉鬼魂。',
      stages: ['夜裡，紅毛城傳來鼓聲和爭吵聲。', '找到迪亞哥的扇貝殼、彼得的小風車。', '問問漁夫阿財：外國人的海在哪裡？', '帶著兩件信物和水燈座，夜裡回紅毛城。'],
      doneText: '兩盞水燈順著退潮，漂向夕陽。' },
    q_alian: { name: '阿蓮與阿德', lantern: true, desc: '北渡頭賣碗粿的阿蓮，夜夜夢見死去的翁婿喊冷。',
      stages: ['夜裡去北邊的舊渡頭看看。', '阿德被長明燈拴住了。回去找阿蓮。', '夜裡，陪阿蓮去舊渡頭。'], doneText: '阿蓮親手吹熄了長明燈。' },
    q_xiaomei: { name: '小梅與母親', lantern: true, desc: '龍山寺龍柱旁，有個小女孩的鬼魂在等阿母。',
      stages: ['找一位頭插玉蘭花、會唱搖囝仔歌的母親。', '請春婆一起去龍山寺。'], doneText: '小梅不等了。她先去那邊。' },
    q_feud: { name: '頂下郊的兩個老人', lantern: true, desc: '八甲庄廢墟裡，兩個老鬼吵了四十年。',
      stages: ['頂郊的阿水伯、下郊的阿旺伯。到底是誰先放火？（問問吳廟公、剝皮寮老茶店、土地公廟前的阿興）', '帶兩位阿伯去阿興家。'],
      doneText: '下輩子，他們要做同一條船的。' },
    q_tuanzi_mush: { name: '糰子的蕈譜', desc: '台灣頭到台灣尾，七個所在各長一種「七仙蕈」。七種都吃過的人，會看見世上所有的顏色。',
      stages: ['青草阿伯說，七仙蕈只在古書殘頁上見過。', '第一種「杉皮蕈」長在剝皮寮後面福州杉的老皮上，月光一照會發光。（夜裡，開啟靈視）', '蕈譜第一格：杉皮蕈。下一種七仙蕈，在更南邊的地方……'] },
  });

  // ------------------------------------------------------------------ shared scripted bits
  const LIGHT = {
    dusk: { ambient: 0.27, color: '#3a1606', tint: 'rgba(255,150,70,0.22)', playerR: 220 },
    night: { ambient: 0.56, color: '#060a1e', playerR: 230 },
    morning: { ambient: 0.1, color: '#2a3a5a', tint: 'rgba(210,225,255,0.12)' },
    day: { ambient: 0 },
  };
  async function sleepFade(S, sec = 1.0) { await S.fadeOut(0.8); G.Music.stop(0.8); await S.wait(sec); }
  // generic boat ride: travel animation (skipped in autoplay) then warp
  async function boat(S, from, to, label, map, x, y, dir) {
    await S.fadeOut(0.6);
    S.sfx('water');
    await S.travel(from, to, { label });
    await S.warp(map, x, y, dir, { fade: 0.4 });
  }
  function lanternSummary() {
    const ids = ['lantern_tamsui_soldiers', 'lantern_alian', 'lantern_xiaomei', 'lantern_yizigu', 'lantern_feud'];
    return ids.filter((id) => G.Lanterns.has(id)).length;
  }
  // 戲棚燈 mini-game: 6 cues (亮 ↑ / 暗 ↓ / 紅 →), 3 seconds each → number of hits
  class StageLights {
    constructor(res) {
      this.res = res; this.t = 0; this.i = 0; this.hits = 0; this.cueT = 0; this.flash = 0; this.msg = ''; this.done = false;
      this.cues = []; for (let k = 0; k < 6; k++) this.cues.push(['up', 'down', 'right'][Math.floor(Math.random() * 3)]);
      this.light = 'up';
    }
    update(dt) {
      this.t += dt; if (this.flash > 0) this.flash -= dt;
      if (this.done) { this.doneT += dt; if (this.doneT > 1.6 || (this.doneT > 0.5 && G.Input.pressed('ok'))) { G.Scenes.pop(this); this.res(this.hits); } return; }
      if (this.t < 1.2) return;
      this.cueT += dt;
      const want = this.cues[this.i];
      let got = null;
      for (const d of ['up', 'down', 'right', 'left']) if (G.Input.pressed(d)) got = d;
      if (got || this.cueT > 3) {
        const ok = got === want;
        if (ok) { this.hits++; this.light = want; G.Audio.sfx('item'); this.msg = '好！'; } else { G.Audio.sfx('buzz'); this.msg = got ? '錯了！' : '慢了……'; }
        this.flash = 0.6; this.i++; this.cueT = 0;
        if (this.i >= this.cues.length) { this.done = true; this.doneT = 0; }
      }
    }
    draw(ctx) {
      ctx.fillStyle = 'rgba(4,6,14,0.72)'; ctx.fillRect(0, 0, G.W, G.H);
      G.UI.panel(ctx, 240, 110, 800, 490, { title: '戲棚燈' });
      G.Render.text(ctx, '照著提示，在三秒內按下方向鍵：↑亮　↓暗　→紅', G.W / 2, 156, { size: 20, align: 'center', color: '#c9b893' });
      // stage
      const col = this.light === 'up' ? '#ffe2a0' : this.light === 'down' ? '#3a3050' : '#ff7a5a';
      const g = ctx.createRadialGradient(G.W / 2, 330, 10, G.W / 2, 330, 230);
      g.addColorStop(0, U.rgba(col, 0.85)); g.addColorStop(1, U.rgba(col, 0));
      ctx.fillStyle = g; ctx.fillRect(340, 200, 600, 250);
      ctx.fillStyle = '#5a2a1a'; ctx.fillRect(380, 410, 520, 18);
      ctx.fillStyle = '#c8402a'; ctx.fillRect(370, 200, 28, 228); ctx.fillRect(882, 200, 28, 228);
      if (this.done) {
        G.Render.text(ctx, `成功 ${this.hits} / 6`, G.W / 2, 470, { size: 34, align: 'center', color: '#ffd97a' });
      } else if (this.t >= 1.2) {
        const want = this.cues[this.i];
        const label = want === 'up' ? '下一段：亮（↑）' : want === 'down' ? '下一段：暗（↓）' : '下一段：紅（→）';
        G.Render.text(ctx, label, G.W / 2, 460, { size: 32, align: 'center', color: '#fff0d0' });
        const k = 1 - this.cueT / 3;
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(440, 520, 400, 12);
        ctx.fillStyle = '#ffd97a'; ctx.fillRect(440, 520, 400 * Math.max(0, k), 12);
      } else G.Render.text(ctx, '鑼鼓響起……', G.W / 2, 460, { size: 30, align: 'center', color: '#fff0d0' });
      if (this.flash > 0 && this.msg) G.Render.text(ctx, this.msg, G.W / 2, 240, { size: 40, align: 'center', color: '#fff0d0', alpha: Math.min(1, this.flash * 3) });
    }
  }
  function stageLights() {
    return new Promise((res) => {
      G.Dialog.close();
      if (G.Debug && G.Debug.autoplay) { setTimeout(() => res(6), 30); return; }
      G.Scenes.push(new StageLights(res));
    });
  }

  // =====================================================================================================
  // 淡水 tamsui (48×30)
  // =====================================================================================================
  const TS = (() => {
    const W = 48, H = 30;
    const g = grid(W, H, '.');
    fill(g, 0, 0, W, 2, 'X');                 // hill crest
    fill(g, 0, 2, 2, 9, 'X'); fill(g, W - 2, 2, 2, 4, 'X');
    fill(g, 2, 6, 20, 1, ':'); fill(g, 24, 6, 20, 1, ':');   // hill lane in front of the hill houses
    fill(g, 0, 11, W, 2, '#');                // main street
    fill(g, 0, 13, W, 1, '#');
    fill(g, 0, 14, W, 3, ':');                // market ground / waterfront
    fill(g, 13, 14, 8, 3, '#'); fill(g, 30, 14, 14, 2, '#');
    fill(g, 34, 9, 9, 2, '%');                // 福佑宮 front court
    fill(g, 0, 17, W, 2, 'k');                // waterfront dock
    fill(g, 0, 19, W, H - 19, '~');
    fill(g, 0, 24, W, H - 24, 'w');
    fill(g, 0, 13, 1, 6, '~');
    fill(g, 21, 19, 3, 3, 'k');               // ferry pier
    fill(g, 22, 0, 2, 11, 'H');               // stairs up to 紅毛城
    const deco = grid(W, H, ' ');
    // hill trees
    for (const [x, y, c] of [[3, 2, 't'], [8, 2, 'c'], [16, 2, 't'], [19, 3, 'u'], [26, 2, 'c'], [33, 2, 't'], [37, 3, 'u'], [43, 2, 'c'], [2, 7, 'u'], [20, 7, 'w'], [25, 7, 'w'], [33, 7, 'u'],
      [17, 4, 'w'], [9, 7, 'w'], [44, 7, 'u'], [45, 9, 'c'], [45, 10, 'u'], [1, 1, 't'], [12, 1, 't'], [30, 1, 'c'], [40, 1, 't'], [46, 1, 'c'], [6, 1, 'c'], [36, 1, 'c']]) deco[y][x] = c;
    return { W, H, tiles: rows(g), deco: deco.map((r) => r.join('')) };
  })();

  async function tsFerry(S) { // 3-3 渡船過八里
    await S.fadeOut(0.6);
    V().c3_ts = 'morning';
    S.light(LIGHT.morning); S.particles(['mist']);
    S.hideFollowers(true); S.show('player', false);
    S.setPos('player', 22, 20, 'down');
    G.mapScene.snapCamera();
    S.bgm('voyage');
    await S.fadeIn(0.8);
    await S.camera(22, 24, 1.2);
    await S.say('阿海伯', '你們看那山的稜線——額頭、鼻子、下巴，像不像一個人仰著頭躺著？');
    await S.say('baizhi:surprise', '啊……真的。她在睡覺。');
    await S.say('阿海伯', '是觀音菩薩在睡。淡水人看了幾百年，越看越像。');
    await S.say('xinghe:smile', '那我們這麼大聲上山，會不會吵醒她？');
    await S.say('阿海伯', '菩薩不怕吵，怕的是人心太吵。');
    await S.say('hongying:think', '……船頭那盞也是長明燈？');
    await S.say('阿海伯', '是啦，媳婦買的，講可以擋水鬼。我是不太信……可是也不敢拆。');
    await S.say('baizhi:sad', '（輕聲）裡面……有人在敲燈罩。很小聲。');
    S.flash('#7ab8ff', 0.5, 0.5); S.sfx('bell');
    await S.wait(0.4);
    await S.say('xinghe:surprise', '！');
    await S.say('阿海伯', '怎樣？暈船喔？');
    await S.say('xinghe:think', '……沒事。');
    S.flag('ch3_ferry');
    S.quest('q_ch3_main', 2);
    S.objective('穿過觀音山道，上山到太虛觀');
    S.show('player', true); S.hideFollowers(false); S.cameraFollow();
    await boat(S, 'tamsui', 'guanyin', '渡船橫過淡水河口，往八里……', 'guanyin_trail', 20, 52, 'up');
  }
  async function ferryMenu(S, here) {
    const opts = [], go = [];
    if (here !== 'tamsui') { opts.push('淡水'); go.push('tamsui'); }
    if (here !== 'bali') { opts.push('八里（觀音山）'); go.push('bali'); }
    if (F('ch3_yungui_join') && here !== 'bangka') { opts.push('艋舺'); go.push('bangka'); }
    opts.push('莫坐');
    const c = await S.choice(opts, { cancel: opts.length - 1 });
    const dest = go[c];
    if (!dest) return;
    const from = here === 'bali' ? 'guanyin' : here;
    if (dest === 'tamsui') { V().c3_ts = 'day'; await boat(S, from, 'tamsui', '渡船回到淡水……', 'tamsui', 22, 18, 'up'); }
    else if (dest === 'bali') await boat(S, from, 'guanyin', '渡船往八里渡口……', 'guanyin_trail', 20, 52, 'up');
    else {
      if (!F('ch3_bangka_arrive')) await S.say('阿海伯', '上溯艋舺，順風半日。艋舺人講話較大聲，莫驚。');
      await boat(S, from, 'bangka', '渡船逆著淡水河，上溯艋舺……', 'bangka', 7, 21, 'right');
    }
  }

  G.Maps.define('tamsui', {
    name: '淡水',
    subtitle: (st) => (tsTime(st) === 'night' ? '河口的夜' : tsTime(st) === 'morning' ? '清晨的渡船頭' : '淡水河口・夕照'),
    place: 'tamsui',
    bgm: (st) => (tsTime(st) === 'night' ? 'night' : 'jiufen'),
    start: [22, 12],
    light: (st) => LIGHT[tsTime(st)] || LIGHT.day,
    particles: (st) => (tsTime(st) === 'dusk' ? ['motes', 'lanterns'] : tsTime(st) === 'morning' ? ['mist'] : tsTime(st) === 'night' ? ['fireflies'] : ['leaves']),
    tiles: TS.tiles,
    deco: TS.deco,
    objects: [
      // hill houses
      { t: 'house_minnan', x: 3, y: 3, v: 0 }, { t: 'house_minnan', x: 10, y: 3, v: 1 },
      { t: 'house_minnan', x: 28, y: 3, v: 1 }, { t: 'house_minnan', x: 37, y: 3, v: 0, door: -1 },
      { t: 'laundry', x: 15, y: 4 }, { t: 'jar', x: 8, y: 5 }, { t: 'basket', x: 9, y: 5, v: 1 }, { t: 'well', x: 34, y: 5 },
      // north side of the main street
      { t: 'shophouse', x: 2, y: 8, v: 0, text: '布莊' }, { t: 'shophouse', x: 7, y: 8, v: 1, text: '茶行' },
      { t: 'shophouse', x: 12, y: 8, v: 2, text: '淡水客棧' }, { t: 'shophouse', x: 17, y: 8, v: 3, text: '藥材' },
      { t: 'shophouse', x: 25, y: 8, v: 1, text: '洋行' }, { t: 'shophouse', x: 29, y: 8, v: 0, text: '船頭行' },
      { t: 'mazu_temple', x: 36, y: 6, text: '福佑宮' },
      { t: 'incense_burner', x: 38, y: 10 },
      { t: 'stone_lantern', x: 35, y: 9 }, { t: 'stone_lantern', x: 42, y: 9 },
      { t: 'signboard', x: 24, y: 10, text: '紅毛城' },
      { t: 'red_lantern', x: 11, y: 10, hang: true }, { t: 'red_lantern', x: 16, y: 10, hang: true }, { t: 'red_lantern', x: 6, y: 10, hang: true },
      { t: 'red_lantern', x: 28, y: 10, hang: true }, { t: 'red_lantern', x: 33, y: 10, hang: true },
      { t: 'lantern_string', x: 3, y: 11, w: 5 }, { t: 'lantern_string', x: 12, y: 11, w: 6 }, { t: 'lantern_string', x: 26, y: 11, w: 6 }, { t: 'lantern_string', x: 36, y: 11, w: 6 },
      // waterfront: banyan, fish market, stalls
      { t: 'tree_banyan', x: 1, y: 13 },
      { t: 'stall', x: 5, y: 14, text: '魚市', counter: true }, { t: 'stall', x: 8, y: 14, text: '鮮魚', counter: true },
      { t: 'basket', x: 7, y: 15, v: 2 }, { t: 'barrel', x: 10, y: 14 }, { t: 'crate', x: 10, y: 16 }, { t: 'crate', x: 11, y: 16 }, { t: 'crate', x: 11, y: 15 },
      { t: 'stall', x: 34, y: 14, text: '魚丸', counter: true }, { t: 'stall', x: 39, y: 14, text: '雜貨', counter: true },
      { t: 'eternal_lamp', x: 17, y: 16 }, { t: 'eternal_lamp', x: 31, y: 16 },
      { t: 'laundry', x: 26, y: 14 }, { t: 'barrel', x: 29, y: 14 }, { t: 'jar', x: 43, y: 14 }, { t: 'crate', x: 44, y: 14 }, { t: 'basket', x: 45, y: 15 },
      { t: 'signboard', x: 20, y: 16, text: '渡船頭' }, { t: 'signboard', x: 15, y: 13, text: '淡水客棧', v: 1 },
      { t: 'bench', x: 13, y: 15 },
      { t: 'dock_post', x: 20, y: 19 }, { t: 'dock_post', x: 24, y: 21 }, { t: 'dock_post', x: 8, y: 18 }, { t: 'dock_post', x: 40, y: 18 },
      { t: 'boat_ferry', x: 24, y: 19 },
      { t: 'boat_small', x: 6, y: 20 }, { t: 'boat_small', x: 12, y: 21 }, { t: 'boat_small', x: 30, y: 20 }, { t: 'boat_small', x: 36, y: 21 }, { t: 'boat_small', x: 43, y: 20 },
      { t: 'water_lantern', x: 9, y: 23, if: (st) => tsTime(st) !== 'morning' }, { t: 'water_lantern', x: 33, y: 24, if: (st) => tsTime(st) !== 'morning' },
    ],
    chests: [{ id: 'c3_01', x: 12, y: 16, item: 'jinchuang', n: 2 }],
    npcs: [
      { id: 'ts_boatman', sprite: 'boatman', name: '阿海伯', x: 22, y: 20, dir: 'up',
        talk: async (S) => {
          if (!F('ch3_inn')) {
            await S.say('阿海伯', '欲過八里？今仔日免想啦。河口起浪，暗時河裡有「物件」拖船。');
            await S.say('阿海伯', '明仔早，潮水平，我才載恁過去。去觀音山喔？山頂那個道士，天天醉茫茫。');
            return;
          }
          if (tsTime() === 'night' || tsTime() === 'dusk') { await S.say('阿海伯', '天要暗了，暗時不開船。明仔早再來。'); return; }
          if (!F('ch3_ferry')) { await tsFerry(S); return; }
          await S.say('阿海伯', '欲去佗位？');
          await ferryMenu(S, 'tamsui');
        } },
      { id: 'ts_fishball', sprite: 'shopkeeper_f', name: '阿珠姨', x: 34, y: 13, dir: 'down',
        talk: async (S) => {
          await S.say('阿珠姨', '魚丸湯一碗五文！淡水的魚丸，是用鯊魚肉搥出來的，彈牙！');
          if (inParty('baizhi') && !F('ch3_fishball_bz')) {
            S.flag('ch3_fishball_bz');
            await S.say('baizhi:think', '它……在碗裡跳嗎？');
            await S.say('阿珠姨', '哈哈，是咬起來會跳！');
          }
          await S.shop(['c3_fishball', 'c3_fishcrisp'], { title: '阿珠姨魚丸' });
        } },
      { id: 'ts_general', sprite: 'merchant', name: '林頭家', x: 39, y: 13, dir: 'down',
        talk: async (S) => {
          await S.say('林頭家', '雜貨齊全！紅紙、竹篾、蠟燭，要糊燈籠也有。上山的話，金創藥多帶幾帖。');
          await S.shop(['jinchuang', 'c3_qingxinlu', 'jiedu', 'xiangbao', 'lingxun', 'c3_redpaper', 'c3_bamboo', 'c3_candle', 'c3_fishcrisp'], { title: '林記雜貨' });
        } },
      { id: 'ts_fisher', sprite: 'fisherman', name: '阿財', x: 7, y: 16, dir: 'up', wander: 1,
        talk: async (S) => {
          const q = G.Quests.stage('q_tamsui_soldiers');
          if (q >= 1 && !F('ch3_soldiers_done') && S.hasItem('c3_scallop') && S.hasItem('c3_windmill') && !S.hasItem('c3_lantern_base')) {
            const c = await S.choice(['問問阿財：外國人的海在哪裡？', '沒事'], { cancel: 1 });
            if (c === 0) {
              await S.say('阿財', '外國人的海？（笑）少年仔，海哪有分你的我的。');
              await S.say('阿財', '淡水河出去是海，海出去是大洋，大洋連著天下所有的岸。黑水溝也只是其中一段水。');
              await S.say('阿財', '退潮的時候，從河口放水燈，燈會順著潮水走得最遠。');
              await S.say('阿財', '遠到哪裡？我也不知道。我討海一輩子，還沒看過海的盡頭。');
              await S.say('xinghe:think', '海是同一片海……');
              await S.say('阿財', '欸，你要水燈的話，我這裡有舊的燈座，拿去。');
              await S.give('c3_lantern_base', 2);
              S.quest('q_tamsui_soldiers', 3);
              S.objective('帶著兩件信物和水燈座，夜裡回紅毛城');
              return;
            }
          }
          await S.say('阿財', '河口那邊，夕陽落海的時，整片水會變金色。外地人看到都講不出話。');
        } },
      { id: 'ts_temple', sprite: 'temple_keeper', name: '福佑宮廟公', x: 39, y: 10, dir: 'down',
        talk: async (S) => {
          await S.say('福佑宮廟公', '福佑宮拜的是媽祖。淡水人出海，攏先來這裡上香。');
          await S.say('福佑宮廟公', '海上起霧的時，有人講會看見一盞燈在前面帶路。老一輩講，那是媽祖的燈。');
          await S.say('福佑宮廟公', '最近啊，放出去的水燈，有幾盞自己漂回來。我做廟公四十年，第一次看到。');
        } },
      { id: 'ts_scholar', sprite: 'scholar', name: '方秀才', x: 25, y: 12, dir: 'down',
        talk: ['那座紅磚城？是很久以前西班牙人蓋的，後來荷蘭人打下來重修。', '荷蘭人頭髮紅，咱的人就叫伊「紅毛」，城就叫紅毛城。如今只剩空殼。',
          '聽講暗時城裡有人用番話吵架。我是讀書人，不信這些……但我暗時不去。'] },
      { id: 'ts_child', sprite: 'child_m', name: '阿狗仔', x: 4, y: 16, dir: 'down', wander: 1,
        talk: async (S, n) => {
          if (F('ch3_windmill_traded')) { await S.say('阿狗仔', '你看你看！我的燈籠會亮！晚上我要提著去福佑宮！'); return; }
          if (G.Quests.stage('q_tamsui_soldiers') < 1) { await S.say('阿狗仔', '我撿到一個寶貝！木頭做的，有四片翅膀，會轉！不給你看！'); return; }
          await S.say('阿狗仔', '不給你！這是我的寶貝！會轉！');
          await S.say('xinghe:smile', '這樣吧——哥哥是做燈籠的。我幫你做一盞燈，跟你換，好不好？');
          await S.say('阿狗仔', '燈籠？真的嗎？要會亮的喔！');
          const need = ['c3_redpaper', 'c3_bamboo', 'c3_candle'];
          if (!need.every((id) => S.hasItem(id))) {
            await S.say('xinghe:think', '要做燈籠，得先備好紅紙、竹篾、蠟燭。林頭家的雜貨攤應該都有。');
            S.objective('在林記雜貨買紅紙、竹篾、蠟燭');
            return;
          }
          const c = await S.choice(['開始糊燈籠', '等一下'], { cancel: 1 });
          if (c !== 0) return;
          for (;;) {
            const a = await G.Mini.timing({ title: '糊燈籠・彎框', hint: '把竹篾彎成圓框——在燈火進入金色區域時按下 Z', rounds: 1, zone: 0.2 });
            const b = await G.Mini.song({ title: '糊燈籠・糊紙', hint: '照著順序，把紅紙一面一面貼上去', rounds: 1, startLen: 4, opponent: '陳伯的手法' });
            const d = await G.Mini.timing({ title: '糊燈籠・點燭', hint: '燭芯對準了再點火', rounds: 1, zone: 0.18 });
            if (a >= 1 && b >= 1 && d >= 1) break;
            await S.say('xinghe:hurt', '唔……紙皺掉了。再來一次！');
            const r = await S.choice(['再試一次', '先休息一下'], { cancel: 1 });
            if (r !== 0) return;
          }
          for (const id of need) S.take(id, 1);
          await S.say('xinghe:smile', '陳伯教的，總算派上用場了。');
          await S.say('阿狗仔', '哇！會亮！給你！轉轉轉的東西給你！');
          S.flag('ch3_windmill_traded');
          await S.give('c3_windmill', 1);
          if (S.hasItem('c3_scallop')) { S.quest('q_tamsui_soldiers', 2); S.objective('問問漁夫阿財：外國人的海在哪裡？'); }
        } },
      { id: 'ts_sailor', sprite: 'sailor', name: '唐山水手', x: 13, y: 18, dir: 'down', wander: 2,
        talk: ['我從泉州過來，過黑水溝的時，船差點翻。六死三留一回頭啊。', '那時海上一盞燈都沒有。黑得像墨。我跪在甲板上，把會唸的神明都唸了一遍。'] },
      { id: 'ts_granny', sprite: 'old_f', name: '坡上阿嬤', x: 23, y: 4, dir: 'down',
        talk: ['囝仔，爬慢慢。這坡我爬七十年了，越爬越長。', '從這裡看過去，對岸那座山，像不像一個人躺著？那是觀音菩薩在睡。'] },
      { id: 'ts_lampseller', sprite: 'merchant', name: '長明宮燈販', x: 16, y: 16, dir: 'down',
        talk: async (S) => {
          await S.say('長明宮燈販', '府城長明宮的長明燈！玄冥法師親手加持，掛在船頭，水鬼不敢近！');
          await S.say('長明宮燈販', '一盞一兩銀。貴？命比較貴吧。');
          if (inParty('baizhi') && !F('ch3_ts_lamp_bz')) {
            S.flag('ch3_ts_lamp_bz');
            await S.say('baizhi:sad', '……這盞燈，好冷。');
            await S.say('xinghe:think', '燈哪有冷熱？');
            await S.say('baizhi:sad', '有的。');
          }
        } },
      // ambient townsfolk
      { id: 'ts_porter', sprite: 'villager_m2', name: '挑夫', x: 28, y: 16, dir: 'left', wander: 3, talk: ['嘿咻——讓讓！這擔是洋行的樟腦，要上船的！'] },
      { id: 'ts_washer', sprite: 'villager_f', name: '洗衫的阿嫂', x: 14, y: 5, dir: 'down', wander: 1, talk: ['今仔日日頭好，衫曬一下午就乾。', '你們是外地來的？晚上莫去紅毛城那邊，聽講會聽到鼓聲。'] },
      { id: 'ts_kid2', sprite: 'child_f', name: '綁辮子的囡仔', x: 30, y: 12, dir: 'left', wander: 3, talk: ['我阿爸去打魚了！等他回來，我要第一個看到他的船！'] },
      { id: 'ts_fisher_f', sprite: 'fisher_f', name: '補網的阿姨', x: 3, y: 17, dir: 'right', talk: ['網破了就補，補好了再出海。討海人，一世人都在補網。'] },
      { id: 'ts_monk', sprite: 'monk', name: '化緣的師父', x: 41, y: 12, dir: 'left', wander: 2, talk: ['阿彌陀佛。施主眉間有火，是心善之人。', '對岸觀音山，石頭都是好石頭。艋舺的寺廟，多用那裡的石材。'] },
      { id: 'ts_dog', sprite: 'dog', name: '小黃', x: 19, y: 14, dir: 'left', wander: 3, talk: ['汪！（牠聞了聞星河的手，搖起尾巴。）'] },
      { id: 'ts_cat', sprite: 'cat', name: '虎斑貓', x: 9, y: 17, dir: 'down', wander: 1, talk: ['喵。（牠盯著魚攤，一動也不動。）'] },
      { id: 'ts_chicken', sprite: 'chicken', name: '雞', x: 6, y: 6, dir: 'right', wander: 2, talk: ['咕咕。'] },
    ],
    events: [
      { id: 'ts_intro', trigger: 'auto', once: true, if: () => !F('ch3_start'), run: async (S) => {
        S.flag('ch3_start');
        V().c3_ts = 'dusk';
        S.light(LIGHT.dusk);
        await S.camera(4, 24, 0.1);
        await S.fadeIn(1.0);
        await S.camera(14, 18, 1.4);
        S.cameraFollow();
        await S.wait(0.4);
        await S.say('xinghe:laugh', '到了到了！淡水！聞到沒有？是魚丸的味道！');
        await S.say('hongying:normal', '是魚市的腥味，笨蛋。');
        S.face('baizhi', 'left');
        await S.say('baizhi:surprise', '太陽……掉進海裡了。');
        await S.say('baizhi:think', '它每天都這樣掉下去嗎？不會熄掉嗎？');
        await S.say('xinghe:smile', '明天早上它又會從另一邊爬起來。');
        await S.say('baizhi:smile', '那它很勇敢。');
        await S.camera(22, 25, 1.2);
        await S.say('hongying:serious', '對岸那座山，就是觀音山。陳伯要我們找的太虛觀，在山上。');
        await S.say('hongying:serious', '……傳聞鬼面最近也在那一帶出沒。');
        S.cameraFollow();
        await S.say('xinghe:think', '那就趕快搭船——');
        await S.walkTo('player', 22, 12);
        await S.move('player', 'DDDDDD');
        S.face('ts_boatman', 'player');
        await S.say('阿海伯', '今仔日免想啦！河口起浪，暗時河裡有物件在拖船。明仔早再來。');
        await S.say('xinghe:sad', '物件……是什麼物件？');
        await S.say('阿海伯', '你想知影，你自己暗時跳落去看。');
        await S.say('xinghe:surprise', '不、不用了！');
        S.face('baizhi', 'left');
        await S.say('baizhi:normal', '……那盞燈，好冷。');
        await S.say('xinghe:think', '燈哪有冷熱的？');
        await S.say('baizhi:sad', '有的。它在……抓著什麼。');
        S.flash('#6aa8ff', 0.4, 0.45); S.sfx('ghost');
        S.emote('hongying', '…');
        await S.wait(0.5);
        await S.say('hongying:serious', '先找客棧吧。天黑了，什麼都看不清。');
        S.flag('ch3_ts_lamp_bz');
        S.quest('q_ch3_main', 0);
        S.objective('到淡水客棧過夜，明早搭渡船過八里');
      } },
      { id: 'ts_east', trigger: 'touch', x: 47, y: 11, w: 1, h: 2, run: async (S) => {
        await S.say('xinghe:think', '回頭路，不急。');
        await S.move('player', 'L');
      } },
      { id: 'ts_mazu', trigger: 'action', x: 38, y: 9, w: 2, h: 1, label: '參拜', run: async (S) => {
        await S.say('', '福佑宮裡香煙繚繞，媽祖神龕前的燈火靜靜地亮著。');
        await S.say('', '星河雙手合十，拜了三拜。');
      } },
      { id: 'ts_view', trigger: 'action', x: 0, y: 13, w: 1, h: 6, label: '眺望', run: async (S) => {
        if (tsTime() === 'dusk') await S.say('', '淡水河口外，夕陽一寸一寸沉進海裡。整片水面金得發燙。');
        else if (tsTime() === 'night') await S.say('', '河口一片漆黑，只有遠處幾點漁火在晃。');
        else await S.say('', '河口外是一望無際的海。對岸的觀音山，靜靜地躺著。');
      } },
    ],
    warps: [
      { x: 22, y: 0, w: 2, to: 'tamsui_fort', tx: 11, ty: 16, tdir: 'up' },
      { x: 13, y: 10, to: 'tamsui_inn', tx: 6, ty: 8, tdir: 'up', door: true },
    ],
    drawGround: (ctx, t, m) => {
      // 觀音山 silhouette on the far shore + the setting sun over the river mouth
      const tm = tsTime();
      const y0 = 29.6 * T;
      ctx.save();
      if (tm === 'dusk') {
        const sx = 3 * T, sy = 23.2 * T;
        const g = ctx.createRadialGradient(sx, sy, 6, sx, sy, 260);
        g.addColorStop(0, 'rgba(255,220,140,0.95)'); g.addColorStop(0.15, 'rgba(255,160,70,0.7)'); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.fillRect(sx - 260, sy - 260, 520, 520);
        ctx.fillStyle = 'rgba(255,190,90,0.35)';
        for (let i = 0; i < 9; i++) { const w = 120 - i * 10 + Math.sin(t * 2 + i) * 8; ctx.fillRect(sx - w / 2 + 40, sy + 30 + i * 14, w, 4); }
      }
      // the sleeping-Guanyin ridge: forehead, nose, chin (far shore), fading into the water
      const pts = [[6, 29.9], [9, 28.4], [12, 27.5], [14.5, 26.9], [16, 27.1], [17.2, 26.3], [18.4, 26.5], [20.5, 25.9], [22.5, 26.3], [24.5, 26.2], [26.5, 26.9], [28.5, 26.8], [31, 27.6], [34, 27.9], [37.5, 28.8], [42, 29.9]];
      const top = 25.8 * T;
      const base = tm === 'night' ? '12,16,34' : tm === 'morning' ? '96,110,140' : tm === 'dusk' ? '74,36,70' : '58,86,92';
      const gr = ctx.createLinearGradient(0, top, 0, y0);
      gr.addColorStop(0, `rgba(${base},${tm === 'morning' ? 0.5 : 0.82})`); gr.addColorStop(0.7, `rgba(${base},0.35)`); gr.addColorStop(1, `rgba(${base},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(pts[0][0] * T, y0);
      for (const [x, y] of pts) ctx.lineTo(x * T, y * T);
      ctx.lineTo(42 * T, y0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = tm === 'dusk' ? 'rgba(255,170,100,0.55)' : tm === 'night' ? 'rgba(140,160,220,0.25)' : 'rgba(230,240,255,0.3)';
      ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * T, y * T) : ctx.moveTo(x * T, y * T))); ctx.stroke();
      ctx.restore();
    },
  });

  // ------------------------------------------------------------------ 淡水客棧 tamsui_inn (14×10)
  async function tsInnNight(S) { // 3-2 客棧夜話
    S.hideFollowers(false);
    S.setPos('player', 7, 5, 'right'); S.setPos('baizhi', 9, 5, 'left'); S.setPos('hongying', 8, 6, 'up');
    for (const f of G.mapScene.followers) f.scripted = true;
    S.light({ ambient: 0.42, color: '#0a0c20', tint: null }); S.bgm('night', { fade: 1 });
    await S.fadeIn(0.8);
    await S.say('hongying:smug', '我借了廚房。明天要爬山，我做了飯糰。');
    S.sfx('earth'); S.shake(3, 0.2);
    await S.say('', '（紅纓拿出三顆黑色的球體，放在桌上——咚。像石頭。）');
    await S.say('xinghe:surprise', '……這是飯糰還是觀音山石？');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '吃不吃！');
    await S.say('baizhi:think', '（拿起一顆，認真咬）……外面很硬，裡面也很硬。');
    await S.say('baizhi:smile', '很有誠意的飯糰。');
    await S.say('hongying:shy', '哼、哼！至少她懂得欣賞。');
    await S.say('xinghe:think', '（白芷，那不是稱讚……）');
    await S.give('c3_riceball', 3);
    S.sfx('gong'); await S.wait(0.3); S.sfx('gong', 0.35); S.sfx('gong', 0.55);
    S.emote('player', '!'); S.emote('baizhi', '?'); S.emote('hongying', '!');
    await S.wait(0.6);
    await S.say('', '（遠處隱約傳來鼓聲：咚、咚咚。）');
    await S.say('baizhi:think', '有人在打鼓。從山坡上面……那座紅色的城。');
    await S.say('baizhi:sad', '他在叫一個……很遠的地方。');
    S.flag('ch3_inn');
    S.quest('q_ch3_main', 1);
    let c = 1;
    if (!F('ch3_soldiers_done')) {
      await S.say('xinghe:normal', '……要去看看嗎？');
      c = await S.choice(['去紅毛城看看', '先睡覺']);
    }
    if (c === 0) {
      S.flag('ch3_night_free');
      V().c3_ts = 'night';
      S.objective('夜裡去紅毛城看看（回客棧找阿玉即可睡覺）');
      await S.warp('tamsui', 13, 11, 'down', { fade: 0.6 });
      return;
    }
    await S.fadeOut(0.8);
    V().c3_ts = 'morning';
    S.objective('清晨到渡船頭，請阿海伯載我們過八里');
    await S.warp('tamsui_inn', 6, 7, 'down', { fade: 0, reload: true });
    await S.fadeIn(0.8);
    G.UI.toast('天亮了。河面上飄著薄霧。', { icon: 'lantern' });
  }
  G.Maps.define('tamsui_inn', {
    name: '淡水客棧', subtitle: '河港的小客棧',
    bgm: (st) => (tsTime(st) === 'night' ? 'night' : 'jiufen'),
    start: [6, 8],
    light: { ambient: 0.15, color: '#1a1008' },
    tiles: rows(room(14, 10, '_', 'W', [6])),
    objects: [
      { t: 'counter', x: 2, y: 3 }, { t: 'shelf_lanterns', x: 1, y: 2, v: 1 }, { t: 'jar_row', x: 4, y: 2 },
      { t: 'table', x: 4, y: 5 }, { t: 'chair', x: 3, y: 5, dir: 'right' }, { t: 'table', x: 8, y: 5 }, { t: 'chair', x: 8, y: 4, dir: 'down' },
      { t: 'table', x: 4, y: 7 }, { t: 'chair', x: 5, y: 7, dir: 'left' }, { t: 'stairs_up', x: 7, y: 2 },
      { t: 'screen', x: 10, y: 3 }, { t: 'bed', x: 11, y: 5 }, { t: 'bed', x: 12, y: 5 }, { t: 'bed', x: 10, y: 6 },
      { t: 'red_lantern', x: 6, y: 2 }, { t: 'mural', x: 8, y: 1, v: 2 }, { t: 'plant_pot', x: 12, y: 8 }, { t: 'pot', x: 1, y: 8 },
    ],
    lights: [{ x: 6, y: 3, r: 200, color: '#ffb060', flicker: 0.2 }, { x: 4, y: 5, r: 140, color: '#ffc080', flicker: 0.25 }],
    npcs: [
      { id: 'ts_innkeeper', sprite: 'shopkeeper_f', name: '阿玉', x: 2, y: 2, dir: 'down',
        talk: async (S) => {
          await S.say('阿玉', '淡水暗時風大，窗仔要關好。若聽到城那邊有鼓聲……莫理伊。');
          const opts = ['住宿（30 文）'];
          const canNight = F('ch3_inn') && !F('ch3_soldiers_done') && G.Quests.stage('q_tamsui_soldiers') >= 0 && tsTime() !== 'night';
          if (canNight) opts.push('等到夜裡');
          opts.push('不用了');
          const c = await S.choice(opts, { cancel: opts.length - 1 });
          if (c === 0) {
            if (G.state.gold < 30) { await S.say('阿玉', '客官，您的盤纏好像不太夠呢……'); return; }
            G.state.gold -= 30;
            await sleepFade(S);
            G.Party.healAll(); S.sfx('heal');
            if (!F('ch3_inn')) { await tsInnNight(S); return; }
            V().c3_ts = 'morning';
            await S.warp('tamsui_inn', 6, 7, 'down', { fade: 0, reload: true });
            await S.fadeIn(0.8);
            G.UI.toast('好好休息了一晚，全員完全恢復。', { icon: 'lantern' });
            if (!F('ch3_ferry')) S.objective('清晨到渡船頭，請阿海伯載我們過八里');
          } else if (canNight && c === 1) {
            await S.fadeOut(0.8);
            V().c3_ts = 'night';
            await S.wait(0.6);
            await S.warp('tamsui_inn', 6, 7, 'down', { fade: 0, reload: true });
            await S.fadeIn(0.8);
            G.UI.toast('入夜了。山坡上隱約傳來鼓聲。', { icon: 'lantern' });
          }
        } },
      { id: 'ts_guest', sprite: 'villager_m', name: '住客', x: 5, y: 6, dir: 'up', talk: ['我是從艋舺來收樟腦的。艋舺那邊才叫熱鬧，一府二鹿三艋舺嘛。', '不過最近艋舺到處掛長明燈，看了心裡毛毛的。'] },
    ],
    warps: [{ x: 6, y: 9, to: 'tamsui', tx: 13, ty: 11, tdir: 'down', door: true }],
  });

  // ------------------------------------------------------------------ 紅毛城 tamsui_fort (24×18)
  const FORT = (() => {
    const W = 24, H = 18;
    const g = grid(W, H, '.');
    fill(g, 0, 0, W, 2, 'X'); fill(g, 0, 0, 2, H, 'X'); fill(g, W - 2, 0, 2, H, 'X'); fill(g, 0, H - 1, W, 1, 'X');
    fill(g, 11, 9, 2, 8, '='); fill(g, 11, H - 1, 2, 1, 'H');
    fill(g, 2, 9, 9, 1, ':');
    const d = grid(W, H, ' ');
    for (const [x, y, c] of [[3, 2, 't'], [20, 3, 't'], [20, 8, 'c'], [4, 13, 't'], [2, 4, 'g'], [3, 4, 'g'], [4, 5, 'g'], [3, 5, 'g'], [2, 6, 'g'], [3, 6, 'g'], [5, 6, 'g'],
      [16, 12, 'r'], [7, 14, 'g'], [8, 14, 'g'], [14, 14, 'g'], [15, 15, 'g'], [18, 13, 'u'], [6, 11, 'r'], [17, 5, 'g'], [18, 6, 'g'], [16, 3, 'g'], [9, 3, 'u'], [14, 3, 'u']]) d[y][x] = c;
    return { tiles: rows(g), deco: d.map((r) => r.join('')) };
  })();
  const fortNight = (st) => tsTime(st) === 'night';
  async function soldiersRelease(S) { // 4-1 step 4 → sunset on the river mouth
    await S.say('baizhi:smile', '我們找到了。也問到路了。');
    S.take('c3_scallop', 1);
    await S.say('迪亞哥', '（接過扇貝）……是它。我在加的斯的海邊撿的。我娘說，扇貝會帶迷路的人回家。');
    S.take('c3_windmill', 1);
    await S.say('彼得', '（抱住小風車）爹……');
    await S.say('xinghe:serious', '明天黃昏，退潮的時候，我們在河口放燈。你們跟燈走。');
    await S.say('迪亞哥', '跟這邊的燈走……會不會漂到別人的彼岸去？');
    await S.say('baizhi:think', '（閉上眼，像在聽很遠的聲音）……不會的。');
    await S.say('baizhi:smile', '燈會記得你們手裡握著什麼。你們握著家，燈就往家漂。');
    await S.fadeOut(1.0);
    V().c3_ts = 'dusk';
    await S.warp('tamsui', 3, 17, 'left', { fade: 0 });
    S.light(LIGHT.dusk); S.particles(['motes', 'lanterns']);
    S.bgm('sad', { fade: 1.5 });
    S.setPos('baizhi', 4, 17, 'left'); S.setPos('hongying', 5, 17, 'left');
    for (const f of G.mapScene.followers) f.scripted = true;
    S.spawn({ id: 'gh_diego', sprite: spr('c3_ghost_diego', 'ghost_m'), x: 2, y: 18, dir: 'left', ghost: true });
    S.spawn({ id: 'gh_peter', sprite: spr('c3_ghost_peter', 'ghost_m'), x: 3, y: 18, dir: 'left', ghost: true });
    await S.camera(2, 20, 0.1);
    await S.fadeIn(1.2);
    await S.say('', '黃昏。淡水河口，整片水面被夕陽染成金色。');
    const m = G.mapScene;
    const l1 = { t: 'water_lantern', x: 1, y: 19, key: 'c3wl1', v: 0 }, l2 = { t: 'water_lantern', x: 2, y: 19, key: 'c3wl2', v: 1 };
    m.objects.push(l1, l2);
    S.sfx('water');
    await S.say('', '（星河把扇貝與小風車放進兩盞水燈裡。）');
    await S.say('彼得', '喂，西班牙佬。');
    await S.say('迪亞哥', '幹嘛，荷蘭小鬼。');
    await S.say('彼得', '……這兩百年，謝謝你罵我。不然我會很寂寞。');
    await S.say('迪亞哥', '……在這裡，我們都只是兩個離家太遠的小子罷了。');
    S.sfx('sing');
    await S.say('', '（白芷吹起玉笛。兩盞燈離岸，順著退潮漂向夕陽。）');
    G.Tweens.to(l1, { x: -0.5, y: 24 }, 5, 'linear'); G.Tweens.to(l2, { x: 0.5, y: 25 }, 5.5, 'linear');
    S.move('gh_diego', 'DDD', { wait: false, speed: 1.2 }); S.move('gh_peter', 'DDD', { wait: false, speed: 1.2 });
    await S.camera(2, 23, 1.6);
    S.fadeActor('gh_diego', 0, 2.2); S.fadeActor('gh_peter', 0, 2.2);
    await S.wait(1.4);
    S.sfx('gong'); S.sfx('gong', 0.4); S.sfx('gong', 0.6);
    await S.say('', '（遠遠的，傳來最後一陣鼓聲：咚、咚咚——像在說「回家了」。）');
    await S.say('xinghe:smile', '……一路順風。');
    if (inParty('yungui')) await S.say('yungui:normal', '海是同一片海。……這句話，我記下了。');
    m.objects = m.objects.filter((o) => o !== l1 && o !== l2);
    S.remove('gh_diego'); S.remove('gh_peter');
    S.cameraFollow();
    S.flag('ch3_soldiers_done');
    S.quest('q_tamsui_soldiers', 'done');
    await S.lantern('lantern_tamsui_soldiers', '紅毛城的異鄉兵');
    await S.give('c3_ac_foreign_button', 1);
    S.objective(mainObj());
  }
  G.Maps.define('tamsui_fort', {
    name: '紅毛城', subtitle: (st) => (fortNight(st) ? '夜裡的紅磚古堡' : '山坡上的紅磚古堡'), place: 'tamsui',
    bgm: (st) => (fortNight(st) ? 'night' : 'jiufen'),
    start: [11, 15],
    light: (st) => (fortNight(st) ? { ambient: 0.6, color: '#060a1e', playerR: 220 } : tsTime(st) === 'dusk' ? { ambient: 0.3, color: '#3a1606', tint: 'rgba(255,150,70,0.2)' } : { ambient: 0.1, color: '#2a3a5a' }),
    particles: (st) => (fortNight(st) ? ['wind', 'motes'] : ['wind']),
    tiles: FORT.tiles, deco: FORT.deco,
    objects: [
      { t: 'red_fort', x: 10, y: 4 },
      { t: 'grave', x: 4, y: 3, v: 0 }, { t: 'grave', x: 6, y: 3, v: 1 },
      { t: 'fence_wood', x: 2, y: 8, w: 3 }, { t: 'rock_big', x: 18, y: 10 },
      { t: 'banner', x: 9, y: 8, color: '#8a2a2a' },
    ],
    lights: (st) => (fortNight(st) ? [{ x: 9, y: 10, r: 120, color: '#9ac8ff', flicker: 0.3 }, { x: 15, y: 10, r: 120, color: '#9ac8ff', flicker: 0.3 }] : []),
    npcs: [
      { id: 'gh_diego_f', sprite: spr('c3_ghost_diego', 'ghost_m'), name: '迪亞哥', x: 9, y: 10, dir: 'right', ghost: true,
        if: (st) => fortNight(st) && !st.flags.ch3_soldiers_done, talk: async (S) => fortGhostTalk(S) },
      { id: 'gh_peter_f', sprite: spr('c3_ghost_peter', 'ghost_m'), name: '彼得', x: 15, y: 10, dir: 'left', ghost: true,
        if: (st) => fortNight(st) && !st.flags.ch3_soldiers_done, talk: async (S) => fortGhostTalk(S) },
    ],
    events: [
      { id: 'fort_ghosts', trigger: 'auto', if: (st) => fortNight(st) && !st.flags.ch3_soldiers_met, run: async (S) => {
        S.flag('ch3_soldiers_met');
        await S.wait(0.3);
        S.sfx('gong'); S.sfx('gong', 0.35); S.sfx('gong', 0.55);
        await S.camera(12, 10, 0.8);
        await S.say('', '（紅毛城前，兩個半透明的鬼魂。一個高大、戴著鐵盔、蓄鬍；一個瘦小的少年，腰間掛著一面破鼓。）');
        await S.say('高大的鬼魂', '＃％＆！＊＠＃！');
        await S.say('少年鬼魂', '＠＠＃＄％！＆＆！');
        await S.say('xinghe:surprise', '鬼！而且是紅毛鬼！講什麼完全聽不懂！');
        await S.say('baizhi:think', '……我聽得懂。');
        await S.say('hongying:surprise', '妳聽得懂？！');
        await S.say('baizhi:think', '嗯。死去的人說的話……我好像都聽得懂。');
        S.emote('baizhi', '?');
        await S.wait(0.4);
        await S.say('迪亞哥', '是這邊！太陽落下的方向，就是家！');
        await S.say('彼得', '你每天都說是這邊！我們每天都走到海邊就走不下去了！');
        await S.say('迪亞哥', '那是因為你一直打鼓，把路吵亂了！');
        await S.say('彼得', '我不打鼓，我會忘記我是誰！');
        await S.say('baizhi:normal', '那個……兩位，晚安。');
        S.face('gh_diego_f', 'down'); S.face('gh_peter_f', 'down');
        S.emote('gh_diego_f', '!'); S.emote('gh_peter_f', '!');
        await S.say('迪亞哥', '……她聽得懂我們。');
        await S.say('彼得', '兩百年了，第一次有人聽得懂我們！');
        await S.say('迪亞哥', '我叫迪亞哥。從很遠很遠的西班牙，坐了一年的船來。');
        await S.say('迪亞哥', '我們在這山坡上蓋了這座城。我在城裡發燒，三天就死了。');
        await S.say('彼得', '我叫彼得。我是後來的，荷蘭人。我們把他們趕走，重修了城。');
        await S.say('彼得', '我十五歲，負責打鼓。我也是病死的。那年冬天，好多人都病死了。');
        await S.say('hongying:think', '……所以你們本來是敵人？');
        await S.say('迪亞哥', '活著的時候是。死了以後……這裡只有我們兩個聽得懂對方說話。');
        await S.say('彼得', '其實聽不太懂。但他會罵我，我也會罵他。罵了兩百年。');
        await S.say('迪亞哥', '這裡的人死了，會變成一盞燈，漂進海裡。我們看過很多次。');
        await S.say('迪亞哥', '可是我們的燈不漂。那片黑水，不是我們的海。');
        await S.say('彼得', '我們的海在哪裡？我們每天黃昏走到海邊，望著太陽落下去的地方……');
        await S.say('彼得', '……就再也走不動了。');
        await S.say('baizhi:sad', '你們想回家。');
        await S.say('迪亞哥', '至少，想回到自己的海。');
        if (inParty('yungui')) await S.say('yungui:think', '異鄉之魂，認不得歸路。……書上也提過這種事，可惜沒寫解法。');
        await S.say('xinghe:think', '有沒有什麼……能讓你們想起家的東西？');
        await S.say('迪亞哥', '我有一枚扇貝殼。是在家鄉的海灘撿的。我死的時候握在手裡……後來不見了。');
        await S.say('彼得', '我有一個小風車，木頭刻的。我爹刻給我的。前幾年被一隻……黑白的鳥叼走了。');
        await S.say('xinghe:smile', '交給我們。');
        S.cameraFollow();
        S.quest('q_tamsui_soldiers', 1);
        S.objective('找到迪亞哥的扇貝殼、彼得的小風車');
      } },
      { id: 'fort_scallop', trigger: 'action', x: 3, y: 5, label: '草叢', if: (st) => !st.inv.c3_scallop && !st.flags.ch3_soldiers_done, run: async (S) => {
        if (!vis()) {
          await S.say('', '草叢沙沙作響。');
          if (S.hasItem('lingxun') && G.Quests.stage('q_tamsui_soldiers') >= 1) {
            const c = await S.choice(['吃一朵七彩靈蕈，開啟靈視', '算了'], { cancel: 1 });
            if (c === 0) { S.take('lingxun', 1); S.vision(60); S.sfx('magic'); await S.say('', '眼前的顏色開始呼吸……草叢深處，有什麼在發著微光。'); }
          }
          return;
        }
        S.sfx('item');
        await S.give('c3_scallop', 1);
        await S.say('', '一枚褪色的扇貝殼。紋路像一把攤開的扇。');
        if (inParty('yungui')) await S.say('yungui:think', '這貝殼不是這附近的。紋路很細……很遠的海才長得出來。');
        if (S.hasItem('c3_windmill')) { S.quest('q_tamsui_soldiers', 2); S.objective('問問漁夫阿財：外國人的海在哪裡？'); }
      } },
      { id: 'fort_view', trigger: 'action', x: 1, y: 9, h: 3, label: '眺望', run: async (S) => {
        await S.say('', '從坡邊望出去，淡水河在腳下轉了一個彎，流進海裡。');
        await S.say('', '對岸觀音山的稜線，像一個仰躺著的人：額頭、鼻子、下巴。');
      } },
      { id: 'fort_graves', trigger: 'action', x: 4, y: 3, w: 3, h: 1, label: '調查', run: async (S) => {
        await S.say('', '兩座沒有字的舊墓。墓碑被海風磨得光滑，不知道葬的是誰。');
        if (!F('ch3_soldiers_done')) await S.say('baizhi:sad', '……他們離家，好遠。');
      } },
    ],
    warps: [
      { x: 11, y: 17, w: 2, to: 'tamsui', tx: 22, ty: 1, tdir: 'down' },
      { x: 12, y: 7, to: 'tamsui_fort_in', tx: 6, ty: 7, tdir: 'up', door: true },
    ],
    drawOver: (ctx, t, m) => {
      // scallop glint (only with 靈視)
      if (m.visionOn() && !G.state.inv.c3_scallop && !F('ch3_soldiers_done')) {
        const x = 3.5 * T, y = 5.6 * T, a = 0.55 + 0.35 * Math.sin(t * 4);
        const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
        g.addColorStop(0, `rgba(255,240,200,${a})`); g.addColorStop(1, 'rgba(255,220,160,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 30, y - 30, 60, 60);
      }
    },
  });
  async function fortGhostTalk(S) {
    if (F('ch3_soldiers_done')) return;
    if (S.hasItem('c3_scallop') && S.hasItem('c3_windmill') && S.hasItem('c3_lantern_base')) { await soldiersRelease(S); return; }
    await S.say('迪亞哥', '扇貝……我好像還聞得到家鄉的海。');
    await S.say('彼得', '風車被一隻黑白的鳥叼到山下去了。也許掉在哪個小孩的手裡……');
    if (S.hasItem('c3_scallop') && S.hasItem('c3_windmill')) await S.say('xinghe:think', '信物都找到了。可是……要往哪裡送他們？去問問討海的人吧。');
  }

  // ------------------------------------------------------------------ 紅毛城堡內 tamsui_fort_in (12×9)
  G.Maps.define('tamsui_fort_in', {
    name: '紅毛城・堡內', subtitle: '空蕩蕩的古堡', place: 'tamsui',
    bgm: (st) => (fortNight(st) ? 'night' : 'mine'),
    start: [6, 7],
    light: { ambient: 0.45, color: '#0a0a14', playerR: 200 },
    particles: ['dust'],
    tiles: (() => { const g = room(12, 9, 't', 'R', [6]); set(g, 3, 4, '#'); set(g, 8, 6, '#'); set(g, 4, 6, ':'); return rows(g); })(),
    objects: [
      { t: 'crate', x: 1, y: 2 }, { t: 'crate', x: 2, y: 2 }, { t: 'barrel', x: 1, y: 3 }, { t: 'barrel', x: 10, y: 6 },
      { t: 'crate', x: 10, y: 7 }, { t: 'bones', x: 4, y: 5 }, { t: 'weapon_rack', x: 6, y: 2 }, { t: 'brazier', x: 9, y: 2 },
    ],
    chests: [{ id: 'c3_02', x: 10, y: 3, gold: 120, item: 'c3_old_helmet' }],
    events: [
      { id: 'fortin_rack', trigger: 'action', x: 6, y: 2, w: 2, h: 1, run: async (S) => { await S.say('', '生鏽的兵器架。架子上刻著看不懂的字母。'); } },
      { id: 'fortin_wall', trigger: 'action', x: 3, y: 1, w: 3, h: 1, run: async (S) => {
        await S.say('', '牆上有一排刻痕，像是有人在數日子。刻到後來，越來越淺。');
      } },
    ],
    warps: [{ x: 6, y: 8, to: 'tamsui_fort', tx: 12, ty: 8, tdir: 'down', door: true }],
  });

  // @@END@@

  // =====================================================================================================
  // objectives & chapter entry
  // =====================================================================================================
  function mainObj() {
    if (F('ch3_letter')) return '從艋舺南門出發，沿海路往竹塹';
    if (F('ch3_theatre')) return bkDay() === 0 ? '在客棧休息，等到八月十五' : '天暗之後，找洪班主看戲';
    if (F('ch3_temple_met')) return '到龍山寺前的戲棚後台，找洪班主';
    if (F('ch3_yungui_join')) return '前往艋舺龍山寺，向吳廟公打聽清虛真人的下落';
    if (F('ch3_legend')) return '到太虛觀中庭找雲歸';
    if (F('ch3_ferry')) return '穿過觀音山道，上山到太虛觀';
    if (F('ch3_inn')) return '清晨到渡船頭，請阿海伯載我們過八里';
    return '到淡水客棧過夜，明早搭渡船過八里';
  }

  G.Story.ch3 = async (S) => {
    S.chapter(3);
    const st = G.state;
    // party: 星河・白芷・紅纓 (雲歸 + 糰子 join after the 鬼面 raid)
    if (!st.flags.ch3_yungui_join && st.party.includes('yungui')) { G.Party.leave('yungui'); delete st.members.yungui; }
    for (const id of ['xinghe', 'baizhi', 'hongying']) {
      if (!st.party.includes(id)) G.Party.join(id, Math.max(9, avgLv()));
      G.Story.ensureLevel(id, 9);
    }
    st.vars.c3_ts = 'dusk';
    st.vars.ch3_day = 0;
    st.vars.c3_fog = 0; st.vars.c3_fog_miss = 0;
    if (st.vars.tuanzi_mush == null) st.vars.tuanzi_mush = 0;
    G.Scenes.replace({ opaque: true, update() {}, draw(ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H); } });
    G.Render.fade.a = 0;
    await S.titleCard(G.Chapters[3], '淡水・觀音山・艋舺　八月初七');
    await S.travel('pingxi', 'tamsui', { label: '沿著基隆河谷順流而下，來到河口的淡水……' });
    await S.fadeOut(0.3);
    S.quest('q_ch3_main', 0);
    await S.warp('tamsui', 44, 12, 'left', { fade: 0, stayDark: true });
  };
})();

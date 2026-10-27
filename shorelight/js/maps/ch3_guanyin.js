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

  // @@END@@
})();

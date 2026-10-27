// 第三章　觀音艋舺 — 淡水（紅毛城）→ 八里渡口 → 觀音山道 → 太虛觀 → 艋舺（龍山寺・剝皮寮・舊渡頭）
// Screenplay: docs/story/ch3_guanyin_bangka.md
//
// Maps: tamsui, tamsui_inn, tamsui_fort, tamsui_fort_in, guanyin_trail, taixu, taixu_hall, taixu_room,
//       bangka, bangka_inn, bangka_armory, bangka_herb, bangka_alian, bangka_xing, bangka_longshan,
//       bangka_bopiliao, bangka_theatre, bangka_riverbank.
// State: vars.c3_ts ('dusk'|'night'|'morning'|'day') = time of day in 淡水; vars.ch3_day (0 十四黃昏/夜, 1 十五白天,
//        2 中秋夜) in 艋舺; vars.c3_taixu ('day'|'night') at 太虛觀; vars.c3_fog / c3_fog_miss = 迷霧步道 progress;
//        vars.tuanzi_mush = 七仙蕈 counter (cross-chapter id kept for compatibility; the quest is now 雲歸's).
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
  // Move an actor and wait for it. Engine note: S.move() on a party FOLLOWER never resolves (MapScene.updateFollowers
  // ignores updateMove()'s "arrived" result, so step.res is never called) — poll the queue instead.
  async function mv(S, id, path, o = {}) {
    const m = G.mapScene;
    const a = m && m.followers.find((f) => f.id === id);
    if (!a) return S.move(id, path, o);
    a.scripted = true;
    S.move(id, path, Object.assign({}, o, { wait: false }));
    for (let i = 0; i < 400 && (a.queue.length || a.moving); i++) await S.wait(0.05);
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
    c3_fn_peach: { name: '桃木符扇', desc: '艋舺陳師傅削的桃木扇骨，辟邪。', type: 'weapon', price: 450, ch: 3, icon: 'fan', who: ['yungui'], stats: { atk: 5, mag: 30 } },
    c3_ar_shortcoat: { name: '艋舺短打', desc: '碼頭工人穿的粗布短打，耐磨又好活動。', type: 'armor', price: 380, ch: 3, icon: 'armor', who: ['xinghe', 'yungui'], stats: { def: 14 } },
    c3_ar_embroidered: { name: '繡花褙子', desc: '艋舺繡莊的褙子，袖口繡著小小的玉蘭花。', type: 'armor', price: 400, ch: 3, icon: 'armor', who: ['baizhi', 'hongying'], stats: { def: 13, mag: 3 } },
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
    m: { hp: 6.6, atk: 1.3, def: 1.55, mag: 0.6, spd: 0.85, exp: 10.8, gold: 12.5 },
    skills: [['c3_monkey_rocks', 3], ['c3_monkey_fist', 3], ['c3_monkey_incense', 2, 'hp<50'], ['e_monkey_taunt', 1]],
    drops: [['jinchuang', 1]],
    desc: '一塊會站起來的觀音山巨石，石紋像皺巴巴的猴臉，頭頂插著一炷從土地公廟偷來的香。',
  });
  // 鬼面 at the 太虛觀 raid: a gentler copy of data's qingfeng_mask (two 陰兵 fight beside him; ends at 50% HP)
  c3enemy('c3_guimian', {
    name: '鬼面', sprite: 'qingfeng_mask', lv: 11, elem: 'metal', weak: ['fire'], resist: ['metal'], boss: true, immune: BOSS_IMM, endAt: 0.5,
    m: { hp: 30, atk: 1.62, mag: 1.5, def: 1.2, spd: 1.35, exp: 23.6, gold: 19.2 },
    skills: [['e_qf_sword', 3], ['e_qf_luojia', 2], ['e_qf_crescent', 1], ['e_qf_shadow', 2, 'hp<75']],
    desc: '戴著鬼面具的劍客，夜襲太虛觀。他的劍路——紅纓一眼就認得出來。',
  });
  c3enemy('c3_mist_imp', {
    name: '霧精', art: 'mosina', variant: 1, lv: 11, elem: 'wood', m: { hp: 0.85, atk: 0.9, spd: 1.3, luk: 2 },
    skills: [['e_mosin_trick', 2], ['e_mist_veil', 2], ['e_claw', 2]], drops: [['xiangbao', 0.2]],
    desc: '觀音山迷霧步道裡的魔神仔。牽著人的手繞圈子，繞到天黑都走不出去。',
  });
  c3enemy('c3_river_boss', {
    name: '河伯怨靈', art: 'river_wraith', variant: 1, scale: 1.5, lv: 13, elem: 'water', weak: ['earth'], resist: ['fire'], boss: true, immune: BOSS_IMM,
    m: { hp: 15.2, atk: 3.0, mag: 3.4, def: 1.1, spd: 1.9, exp: 4, gold: 18.3 }, // sim_story: was hp 10.5 atk 1.5 mag 1.7 spd 0.95
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
    t_c3_guimian: { enemies: ['c3_guimian', 'yin_soldier', 'yin_soldier'], bg: 'temple', bgm: 'boss', boss: true, flee: false },
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
    q_tuanzi_mush: { name: '雲歸的蕈譜', desc: '台灣頭到台灣尾，七個所在各長一種「七仙蕈」。七種都吃過的人，會看見世上所有的顏色。',
      // stage = where the next one grows: each chapter's opening points the log at its own 七仙蕈 (ch4 3, ch5 4, ch6 5,
      // ch7 6, ch9 7, ch11 8); a find sets 9 until the next chapter. The seven: ch3 剝皮寮 · ch4 五指山風穴 · ch5 洛家老宅 ·
      // ch6 林投林 · ch7 雲霧林 · ch9 龍坑 · ch11 澎湖 (玄武蕈 completes the quest when the other six are in the book).
      stages: ['青草阿伯說，七仙蕈只在古書殘頁上見過。', '第一種「杉皮蕈」長在剝皮寮後面福州杉的老皮上，月光一照會發光。（夜裡，開啟靈視）', '蕈譜第一格：杉皮蕈。下一種七仙蕈，在更南邊的地方……',
        '古書說，有一種石耳只長在終年有風的岩壁上，風一吹會「叮」地響。五指山風穴的深處……（開啟靈視）',
        '憶蕈長在有很多回憶的老房子裡。鹿港洛家老宅的榕樹氣根間，麻糬好像聞到了什麼。',
        '潮音蕈長在海邊的沙地上，靠近時聽得見潮聲。府城外的林投林……（開啟靈視）',
        '雲芝長在雲霧繚繞的森林裡，混在發光的菇叢之間，形狀像一朵小小的雲。',
        '台灣尾的龍坑，海水退去的珊瑚礁上，長著一種跟著潮汐開合的蕈。',
        '最後一種「玄武蕈」，長在澎湖六角形的玄武岩柱上。麻糬會先找到它。（開啟靈視）',
        '蕈譜又多了一格。下一種七仙蕈，在旅途更遠的地方……'] },
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
      await boat(S, from, 'bangka', '渡船逆著淡水河，上溯艋舺……', 'bangka', 7, 19, 'right');
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
            if (F('yuyuan_joined')) {
              S.emote('yuyuan', '♥');
              await S.say('', '（芋圓已經端坐在攤子前，目不轉睛地盯著鍋子。）');
              await S.say('阿珠姨', '這隻胖貓仔，眼神好像在講「一碗不夠」。');
            }
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
      { id: 'ts_washer', sprite: 'villager_f', name: '洗衫的阿嫂', x: 17, y: 5, dir: 'down', wander: 1, talk: ['今仔日日頭好，衫曬一下午就乾。', '你們是外地來的？晚上莫去紅毛城那邊，聽講會聽到鼓聲。'] },
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
        if (F('mochi_joined')) { S.emote('mochi', '!'); await S.say('', '（麻糬弓起背，對著燈柱低低地哈了一口氣。）'); }
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
      { t: 'counter', x: 2, y: 3 }, { t: 'shelf_lanterns', x: 4, y: 2, v: 1 },
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

  // =====================================================================================================
  // 觀音山道 guanyin_trail (40×56): 八里渡口 (south) → 山腳 → 採石場 → 迷霧步道 (5 forks) → 觀前石階 → 太虛觀
  // =====================================================================================================
  const FOG = { J: [27, 23, 19, 15, 11], X: { L: 13, M: 19, R: 25 }, ANS: ['L', 'R', 'R', 'M', 'L'] };
  const GY = (() => {
    const W = 40, H = 56;
    const g = grid(W, H, 'X');
    const d = grid(W, H, ' ');
    const walk = grid(W, H, 0);
    const open = (x, y, w, h, ch) => { fill(g, x, y, w, h, ch); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (walk[yy]) walk[yy][xx] = 1; };
    // 觀前石階 & 山門
    open(19, 0, 2, 7, 'H'); open(13, 7, 13, 1, ',');
    // fog forks
    for (const J of FOG.J) {
      open(13, J, 13, 1, ',');
      for (const x of [FOG.X.L, FOG.X.M, FOG.X.R]) open(x, J - 3, 1, 3, ',');
    }
    open(26, 19, 5, 1, ',');                          // F3 dead-end spur (chest c3_06)
    open(19, 28, 2, 2, '=');                          // fog entrance
    // quarry (y 30–44)
    open(4, 30, 32, 14, ':');
    fill(g, 4, 30, 9, 2, 'X'); fill(g, 27, 30, 9, 2, 'X');
    fill(g, 9, 34, 4, 3, 'X'); fill(g, 26, 37, 5, 3, 'X'); fill(g, 15, 40, 3, 2, 'X');
    fill(g, 4, 34, 3, 6, 'X'); open(4, 32, 2, 2, ':');  // ledge under the cliff (c3_05) reached by a detour
    fill(g, 14, 34, 3, 2, 'X'); fill(g, 23, 33, 2, 2, 'X');
    open(18, 44, 4, 2, '=');
    // 山腳 (y 46–52)
    open(3, 46, 34, 7, '.');
    fill(g, 18, 46, 4, 7, '=');
    fill(g, 22, 48, 6, 1, '=');
    open(3, 46, 6, 3, ',');
    // 八里渡口
    fill(g, 0, 53, W, 3, '~');
    open(19, 53, 3, 2, 'k');
    fill(g, 0, 52, W, 1, 'k'); for (let x = 0; x < W; x++) walk[52][x] = 1;
    fill(g, 0, 46, 3, 6, 'X'); fill(g, 37, 46, 3, 6, 'X');
    // vegetation on the cliffs of the fog & gate zones: tall trees only where their canopy cannot hide a path
    // (no walkable cell in the 3 columns × 2 rows above), low bushes elsewhere next to the paths
    const W2 = (x, y) => !!(walk[y] && walk[y][x]);
    for (let y = 1; y < 30; y++) for (let x = 0; x < W; x++) {
      if (walk[y][x]) continue;
      let canopyFree = true;
      for (let dy = 1; dy <= 3 && canopyFree; dy++) for (let dx = -1; dx <= 1; dx++) if (W2(x + dx, y - dy)) { canopyFree = false; break; }
      let adj = false;
      for (let dy = -1; dy <= 1 && !adj; dy++) for (let dx = -1; dx <= 1; dx++) if (W2(x + dx, y + dy)) { adj = true; break; }
      const h = U.hash(x, y, 31);
      if (canopyFree && h < 0.55) d[y][x] = 'tcBtck'[Math.floor(U.hash(y, x, 32) * 6)];
      else if (adj && h < 0.35) d[y][x] = 'u';
    }
    for (let y = 46; y < 52; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'X' && U.hash(x, y, 5) < 0.5) { g[y][x] = '.'; d[y][x] = 'tcfB'[Math.floor(U.hash(y, x, 6) * 4)]; }
    // foot-of-mountain greenery
    for (const [x, y, c] of [[4, 46, 'B'], [5, 46, 'B'], [6, 47, 'B'], [3, 48, 'B'], [7, 46, 'B'], [10, 47, 'c'], [12, 50, 'f'], [15, 46, 'c'], [25, 50, 'f'], [29, 46, 'c'],
      [32, 49, 'n'], [34, 47, 'c'], [10, 51, 'u'], [28, 51, 'u'], [14, 51, 'w'], [31, 51, 'w'], [8, 49, 'f'], [35, 50, 'u'], [23, 51, 'g'], [16, 49, 'g']]) d[y][x] = c;
    // quarry rocks
    for (const [x, y, c] of [[6, 41, 'r'], [8, 36, 'r'], [13, 42, 'r'], [24, 42, 'r'], [33, 33, 'r'], [31, 41, 'r'], [21, 38, 'r'], [7, 32, 'u'], [33, 36, 'r'], [11, 39, 'r'],
      [17, 37, 'r'], [19, 34, 'r'], [27, 35, 'r'], [13, 37, 'r'], [25, 39, 'r'], [5, 43, 'u'], [34, 43, 'u'], [8, 42, 'r'], [29, 38, 'r'], [20, 41, 'r']]) d[y][x] = c;
    return { W, H, tiles: rows(g), deco: d.map((r) => r.join('')) };
  })();
  const fogStage = (st) => (st || G.state).vars.c3_fog || 0;
  const FOG_PURR = {
    L: '（麻糬停下腳步，朝左邊的霧裡輕輕「喵」了一聲。霧的深處，有人在哼走調的小曲。）',
    M: '（麻糬停下腳步，朝正前方的霧裡輕輕「喵」了一聲。霧的深處，有人在哼走調的小曲。）',
    R: '（麻糬停下腳步，朝右邊的霧裡輕輕「喵」了一聲。霧的深處，有人在哼走調的小曲。）',
  };
  async function fogHint(S, k) {
    if ((V().c3_fog_miss || 0) >= 3 && k < 5) await S.say('', FOG_PURR[FOG.ANS[k]]);
  }
  async function fogGate(S, k, dir) {
    if (F('ch3_fog_done') || fogStage() !== k) return;
    if (FOG.ANS[k] !== dir) {
      V().c3_fog = 0; V().c3_fog_miss = (V().c3_fog_miss || 0) + 1;
      S.sfx('wind');
      await S.fadeOut(0.7, '#dfe6ee');
      await S.warp('guanyin_trail', 19, 28, 'up', { fade: 0 });
      await S.fadeIn(0.7);
      await S.say('', '……這棵樹，剛才好像見過。');
      await fogHint(S, 0);
      return;
    }
    V().c3_fog = k + 1;
    S.sfx('step');
    if (k < 4) { await fogHint(S, k + 1); return; }
    S.flag('ch3_fog_done');
    S.sfx('wind');
    S.particles(['leaves']);
    await S.say('', '一陣山風吹過。濃霧像被誰掀開的布幕，緩緩散去——');
    await S.say('', '石階就在眼前，一路往上，通到一座山門。');
    if (inParty('baizhi')) await S.say('baizhi:smile', '霧散了。好像有誰在前面帶路。');
    await S.say('hongying:think', '……路邊的點心碎屑，一路掉到山門口。');
  }
  const fogEvents = [];
  FOG.J.forEach((J, k) => {
    for (const dir of ['L', 'M', 'R']) {
      fogEvents.push({ id: `fog_${k}_${dir}`, trigger: 'touch', x: FOG.X[dir], y: J - 2, if: (st) => !st.flags.ch3_fog_done && fogStage(st) === k, run: (S) => fogGate(S, k, dir) });
    }
    const cx = FOG.X[FOG.ANS[k]];
    fogEvents.push({ id: `fog_crumb_${k}`, trigger: 'action', x: cx, y: J - 1, label: '調查', if: (st) => !st.flags.ch3_fog_done && fogStage(st) === k,
      run: async (S) => { await S.say('', k % 2 ? '地上散著被咬過的草仔粿碎屑。……碎屑，往這邊掉。' : '地上散著被咬過的米糕碎屑。……碎屑，往這邊掉。'); } });
  });

  async function monkeyKing(S) {
    S.flag('ch3_monkey_awake');
    S.sfx('earth'); S.shake(6, 0.6);
    await S.camera(22, 30, 0.6);
    await S.say('', '（一塊巨石轉過身來——長出了臉和手臂。頭頂插著一根被偷來的香。）');
    S.sfx('hit'); S.shake(4, 0.2);
    await S.say('石猴王', '吱——！');
    S.emote('player', '💢');
    await S.say('xinghe:hurt', '痛！牠還很準！');
    await S.say('baizhi:think', '牠的頭上……那是香嗎？牠在玩廟裡的東西。');
    await S.say('hongying:serious', '頑石成精，打碎了就安靜了。');
    S.cameraFollow();
    const r = await S.battle('t_c3_monkeyking');
    if (r !== 'win') return;
    S.flag('ch3_monkeyking');
    S.sfx('earth');
    await S.say('', '（石猴王化回一塊石頭。頭上的香，掉在地上。）');
    await S.say('baizhi:smile', '這塊石頭，以後也會被砌進哪座廟裡吧。');
    await S.say('xinghe:laugh', '到時候在廟裡乖一點啊，猴子。');
    await S.give('c3_ac_monkey_stone', 1);
  }

  G.Maps.define('guanyin_trail', {
    name: '觀音山道', subtitle: (st) => (st.flags.ch3_fog_done ? '雲霧散去的山路' : '往太虛觀的山路'), place: 'guanyin',
    bgm: 'forest',
    start: [20, 51],
    light: { ambient: 0.04, color: '#203040' },
    particles: ['leaves'],
    tiles: GY.tiles, deco: GY.deco,
    objects: [
      { t: 'paifang', x: 18, y: 3, v: 0, text: '太虛觀' },
      // 八里渡口 & 山腳
      { t: 'boat_ferry', x: 22, y: 53 }, { t: 'dock_post', x: 18, y: 53 }, { t: 'boat_small', x: 9, y: 54 },
      { t: 'shrine_small', x: 24, y: 46, text: '福德正神' }, { t: 'stone_lantern', x: 23, y: 47 }, { t: 'signboard', x: 17, y: 50, text: '觀音山' },
      { t: 'stump', x: 12, y: 48 }, { t: 'log', x: 13, y: 49 },
      // 採石場
      { t: 'cart', x: 23, y: 41 }, { t: 'crate', x: 25, y: 41 }, { t: 'crate', x: 33, y: 40 }, { t: 'barrel', x: 34, y: 40 },
      { t: 'rock_big', x: 7, y: 37 }, { t: 'rock_big', x: 30, y: 34 }, { t: 'rock_big', x: 11, y: 31 },
      { t: 'rock_big', x: 22, y: 29, if: (st) => !st.flags.ch3_monkey_awake || st.flags.ch3_monkeyking }, { t: 'basket', x: 20, y: 43, v: 3 },
    ],
    chests: [
      { id: 'c3_03', x: 4, y: 47, item: 'c3_qingxinlu', n: 2 },
      { id: 'c3_04', x: 34, y: 38, item: 'c3_sw_guanyin' },
      { id: 'c3_05', x: 4, y: 32, item: 'huanhundan' },
      { id: 'c3_06', x: 30, y: 19, item: 'lingxun' },
    ],
    npcs: [
      { id: 'gy_boatman', sprite: 'boatman', name: '阿海伯', x: 21, y: 53, dir: 'up',
        talk: async (S) => {
          if (!F('ch3_yungui_join')) { await S.say('阿海伯', '我在這裡等恁。上山小心，山頂的道士醉茫茫，石頭還會跑。'); }
          await S.say('阿海伯', '欲去佗位？');
          await ferryMenu(S, 'bali');
        } },
      { id: 'gy_woodcutter', sprite: 'woodcutter', name: '樵夫', x: 14, y: 47, dir: 'right', wander: 1,
        talk: ['上山喔？路邊土地公的供品，攏總被偷咬！一定是山頂那個醉茫茫的道士。', '伊講伊是「替土地公試味道」。你信不信？我不信。'] },
      { id: 'gy_quarryman', sprite: 'miner', name: '採石工阿石', x: 21, y: 44, dir: 'down',
        talk: async (S) => {
          if (F('ch3_monkeyking')) {
            if (!F('ch3_whetstone')) { S.flag('ch3_whetstone'); await S.say('阿石', '石頭不跑了！多謝！這塊磨刀石給你。'); await S.give('c3_whetstone', 1); return; }
            await S.say('阿石', '觀音山石，敲起來聲音清脆。好石頭，會唱歌。');
            return;
          }
          await S.say('阿石', '這裡的觀音山石，硬又耐，艋舺的廟、淡水的厝，很多是這裡的石頭砌的。');
          await S.say('阿石', '最近石頭自己會跑。真的！變成猴子，見人就丟石頭。');
        } },
    ],
    enemies: [
      { id: 'gy_r1', troop: 't_c3_trail_a', x: 9, y: 49, art: 'rat_demon', radius: 3, chase: 4, lv: 9 },
      { id: 'gy_r2', troop: 't_c3_trail_a', x: 31, y: 48, art: 'rat_demon', radius: 3, chase: 4, lv: 9 },
      { id: 'gy_m1', troop: 't_c3_trail_b', x: 12, y: 38, art: 'stone_monkey', radius: 3, chase: 4, lv: 11 },
      { id: 'gy_m2', troop: 't_c3_trail_c', x: 28, y: 33, art: 'stone_monkey', radius: 3, chase: 4, lv: 11 },
      { id: 'gy_m3', troop: 't_c3_trail_b', x: 30, y: 42, art: 'stone_monkey', radius: 2, chase: 4, lv: 11 },
      { id: 'gy_f1', troop: 't_c3_trail_d', x: 16, y: 23, art: 'mosina', variant: 1, radius: 2, chase: 3, lv: 11 },
      { id: 'gy_f2', troop: 't_c3_trail_e', x: 22, y: 15, art: 'mosina', variant: 1, radius: 2, chase: 3, lv: 11 },
    ],
    events: [
      { id: 'gy_tudi', trigger: 'touch', x: 22, y: 48, w: 6, h: 1, once: true, run: async (S) => {
        S.face('player', 'up');
        await S.say('', '（土地公廟的供桌上，紅龜粿缺了一大口。旁邊灑了幾滴酒，還有一串歪歪扭扭的草鞋印。）');
        await S.say('hongying:think', '……喝醉的人偷吃供品。什麼人這麼大膽。');
        if (F('yuyuan_joined')) {
          S.emote('yuyuan', '♥');
          await S.say('', '（芋圓蹲在供桌前，仰頭盯著剩下的紅龜粿，尾巴一甩一甩。）');
          await S.say('hongying:shy', '（小聲）……想吃又不敢吃的樣子，好、好可愛……');
          await S.say('xinghe:smug', '紅纓，妳臉紅了。');
          S.emote('hongying', '💢');
          await S.say('hongying:angry', '是爬山熱的！');
        }
        await S.say('baizhi:think', '土地公爺爺的點心被偷吃了。我們要不要補一點？');
        const c = await S.choice(['放一顆紅纓的飯糰上去', '雙手合十，說聲歹勢就走']);
        if (c === 0 && S.hasItem('c3_riceball')) {
          S.take('c3_riceball', 1);
          S.sfx('wind');
          await S.say('', '（一陣輕風，供桌上的香灰微微揚起。）');
          await S.say('', '香煙往山上飄去，像在指路。');
          S.flag('ch3_tudi_offer');
        } else {
          if (c === 0) await S.say('', '（紅纓的飯糰……已經吃完了。）');
          await S.say('baizhi:smile', '土地公爺爺，歹勢。');
          S.emote('player', '!');
          await S.say('xinghe:surprise', '（……講得好標準。）');
        }
      } },
      { id: 'gy_shrine', trigger: 'action', x: 24, y: 47, w: 2, h: 1, label: '參拜', run: async (S) => {
        await S.say('', '小小的土地公廟。香爐裡插著三炷香，香灰還是溫的。');
        if (F('ch3_tudi_offer')) await S.say('', '供桌上，紅纓的飯糰端端正正地擺著。');
      } },
      { id: 'gy_quarry_in', trigger: 'touch', x: 18, y: 43, w: 4, h: 1, once: true, run: async (S) => {
        await S.say('hongying:serious', '採石場。……地上有新鮮的碎石，像是被誰亂丟的。');
      } },
      { id: 'gy_king', trigger: 'touch', x: 13, y: 31, w: 14, h: 1, if: (st) => !st.flags.ch3_monkeyking, run: monkeyKing },
      { id: 'gy_fog_in', trigger: 'touch', x: 19, y: 29, w: 2, h: 1, once: true, run: async (S) => {
        S.sfx('wind');
        await S.say('', '（霧濃到看不見遠處。風聲裡，隱約有人在哼走調的小曲。）');
        if (F('mochi_joined')) { S.emote('mochi', '…'); await S.say('', '（麻糬抬起頭，鼻子朝霧裡嗅了嗅。）'); }
        await S.say('hongying:serious', '霧太濃了。路好像……一直在分岔。');
        await S.say('xinghe:think', '跟霧林那時候一樣。白芷，靈視？');
        await S.say('baizhi:smile', '嗯。');
        await S.give('lingxun', 2);
        S.toast('吃下「七彩靈蕈」可開啟靈視，看見隱藏的足跡。', 'mushroom');
        S.vision(45);
      } },
      ...fogEvents,
    ],
    warps: [
      { x: 19, y: 0, w: 2, to: 'taixu', tx: 13, ty: 19, tdir: 'up' },
    ],
    onUpdate: (dt, m) => {
      const y = m.player.y;
      const fog = !F('ch3_fog_done');
      const zone = y < 8 ? 'gate' : y < 30 ? (fog ? 'fog' : 'clear') : y < 46 ? 'quarry' : 'foot';
      const lc = m.lightCfg;
      const target = zone === 'fog' ? 0.34 : zone === 'gate' ? 0.14 : zone === 'clear' ? 0.1 : zone === 'quarry' ? 0.08 : 0.04;
      lc.ambient += (target - lc.ambient) * Math.min(1, dt * 1.5);
      lc.color = zone === 'fog' ? '#aab6c6' : '#203040';
      lc.playerR = zone === 'fog' ? 300 : 200;
      if (m._c3zone !== zone) {
        m._c3zone = zone;
        m.particles = new G.FX.Particles(zone === 'fog' ? ['mist', 'mist'] : zone === 'gate' ? ['mist'] : zone === 'quarry' ? ['dust'] : ['leaves'], m);
      }
    },
    drawGround: (ctx, t, m) => {
      // monkey king awake on its ledge
      if (F('ch3_monkey_awake') && !F('ch3_monkeyking') && G.Monsters) {
        ctx.save(); ctx.translate(23 * T, 31 * T - 6); ctx.scale(0.55, 0.55);
        try { G.Monsters.draw(ctx, 'stone_monkey', 0, 0, t, { state: 'idle', variant: 2 }); } catch (e) { G.warnOnce('c3 monkey', e); }
        ctx.restore();
      }
      if (F('ch3_fog_done')) return;
      const k = fogStage();
      if (k > 4) return;
      const J = FOG.J[k], cx = FOG.X[FOG.ANS[k]];
      if (m.visionOn()) {   // glowing footprints left in the mist (spirit trail only 靈視 reveals)
        for (let i = 0; i < 3; i++) {
          const px = cx * T + T / 2 + (i % 2 ? 10 : -10), py = (J - 1 - i) * T + T / 2 + 6;
          const a = 0.55 + 0.35 * Math.sin(t * 3 + i);
          ctx.fillStyle = `rgba(255,214,120,${a})`;
          ctx.beginPath(); ctx.ellipse(px, py, 8, 7, 0, 0, Math.PI * 2); ctx.fill();
          for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.arc(px - 9 + j * 6, py - 10 - (j % 3 === 0 ? 0 : 3), 3, 0, Math.PI * 2); ctx.fill(); }
        }
      } else {              // nibbled crumbs
        ctx.fillStyle = k % 2 ? '#5a7a3a' : '#e8e0d0';
        for (let i = 0; i < 6; i++) { const px = cx * T + 14 + U.hash(i, k, 3) * 36, py = (J - 1) * T + 30 + U.hash(k, i, 4) * 26; ctx.fillRect(px, py, 5, 4); }
      }
      if (k === 0 && F('ch3_tudi_offer')) {  // a thread of incense smoke drifting the right way
        ctx.strokeStyle = 'rgba(230,230,240,0.45)'; ctx.lineWidth = 3;
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) { const u = i / 20; const x = U.lerp(19.5, cx + 0.5, u) * T; const y = U.lerp(J + 0.6, J - 2, u) * T + Math.sin(t * 2 + u * 9) * 8; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
      }
    },
  });

  // =====================================================================================================
  // 太虛觀 taixu (28×22)
  // =====================================================================================================
  const TX = (() => {
    const W = 28, H = 22;
    const g = grid(W, H, 'T');
    fill(g, 0, 0, W, 2, 'E'); fill(g, 0, 0, 1, H, 'E'); fill(g, W - 1, 0, 1, H, 'E');
    fill(g, 0, 21, W, 1, 'E'); fill(g, 13, 21, 2, 1, 'H');
    fill(g, 1, 2, 8, 5, ','); fill(g, 18, 2, 9, 4, ',');   // back yard (mushroom beds) & east garden
    fill(g, 1, 10, 5, 10, '.'); fill(g, 22, 11, 5, 3, '.');
    const d = grid(W, H, ' ');
    for (const [x, y, c] of [[4, 4, 'm'], [6, 4, 'm'], [4, 5, 'm'], [6, 5, 'm'], [19, 3, 't'], [25, 2, 'c'], [23, 4, 'u'], [26, 5, 'u'], [2, 12, 'B'], [1, 15, 'B'], [3, 18, 'u'], [25, 12, 'w'], [23, 13, 'w'], [1, 19, 'u'], [26, 19, 'u'], [18, 5, 'w']]) d[y][x] = c;
    return { tiles: rows(g), deco: d.map((r) => r.join('')) };
  })();
  const ROOF_Y = -255;   // sprite offset so actors stand on the main hall's ridge (cutscenes)

  const pet = (id) => (G.mapScene && G.mapScene.followers.find((f) => f.id === id)) || null;
  async function yunguiIntro(S) { // 3-5
    S.flag('ch3_yungui_met');
    S.bgm(null);
    const yg = S.spawn({ id: 'c3_yg_roof', sprite: 'yungui', x: 14, y: 7, dir: 'down' }); yg.offsetY = ROOF_Y;
    await S.wait(0.3);
    await S.move('player', 'UUUUUU');
    await S.say('xinghe:normal', '有人嗎——？我們是九份陳記燈籠舖來的——');
    await S.wait(0.6);
    await S.say('', '（靜。只有……打呼聲。還有走調的小曲，從屋頂上飄下來。）');
    await S.camera(13, 9, 1.0);
    await S.say('', '（正殿屋脊上躺著一個道士：長髮半束、木簪、灰藍道袍，一手抱著酒葫蘆，一條腿垂在屋簷外晃。）');
    await S.say('', '（他肚子上擺著一盤紅龜粿。一塊已經被咬掉了一半。）');
    await S.say('baizhi:think', '他……睡著了，還在吃東西嗎？');
    const yy = pet('yuyuan');
    if (yy) {
      // 芋圓 smells the 紅龜粿, climbs the eaves and steals them
      yy.scripted = true;
      S.emote('yuyuan', '♥');
      await S.say('', '（芋圓的鼻子抽了兩下。下一刻，那團灰色的毛球已經順著廊柱爬上了屋簷。）');
      S.setPos('yuyuan', 13, 7, 'right'); yy.offsetY = 0;
      await G.Tweens.to(yy, { offsetY: ROOF_Y + 4 }, 0.7, 'outQuad');
      await S.say('xinghe:surprise', '芋圓！下來！那是人家的點心！');
      S.sfx('item');
      await S.say('', '（芋圓面無表情地叼走一塊紅龜粿。又一塊。道士沒有醒。）');
      S.emote('hongying', '♥');
      await S.say('hongying:shy', '（小聲）偷、偷吃的樣子……好可愛……');
      await S.say('xinghe:angry', '紅纓！現在不是可愛的時候！');
      S.face('yuyuan', 'down'); S.emote('yuyuan', '💧');
      await S.say('', '（芋圓低頭看了一眼地面。牠好像這才發現，屋頂很高。）');
      // panics, slides off the eaves and lands on 星河's face
      const p = S.actor('player');
      S.setPos('yuyuan', p.x, p.y, 'down'); yy.offsetY = ROOF_Y + 64 * 6;
      await G.Tweens.to(yy, { offsetY: -40 }, 0.45, 'inQuad');
      S.sfx('hit'); S.shake(5, 0.25);
      S.emote('player', '💧');
      await S.say('xinghe:hurt', '……好重……');
      await S.say('', '（芋圓趴在星河臉上，嘴裡還叼著半塊紅龜粿，一臉「不關我的事」。）');
      await S.say('hongying:shy', '（蹲下，把芋圓抱起來）好、好軟……沒事吧……');
      await S.say('xinghe:angry', '妳問的是牠還是我啊！');
      G.Tweens.to(yy, { offsetY: 0 }, 0.2, 'outQuad'); S.setPos('yuyuan', p.x + 1, p.y, 'left');
    } else {
      S.sfx('hit');
      await S.say('', '（一塊紅龜粿從屋簷滾了下來，正好砸在星河頭上。）');
      await S.say('xinghe:hurt', '……痛。');
    }
    await S.say('yungui:normal', '吵死了……');
    await S.say('yungui:normal', '今天的雲，像一朵還沒被吃掉的香菇。我正看得入神。');
    await S.say('baizhi:think', '你的眼睛是閉著的。');
    await S.say('yungui:smug', '心眼是開的。');
    if (yy) {
      await S.say('yungui:think', '……心眼還看到，我的紅龜粿少了三塊。');
      S.emote('yuyuan', '…');
      await S.say('', '（芋圓把最後一口吞下去，面不改色地看著遠方。）');
    }
    await S.say('xinghe:angry', '（爬起）這位道長！我們找清虛真人！是九份的陳渡陳伯叫我們來的！');
    await S.wait(0.5);
    await S.say('yungui:think', '……陳渡？那個脾氣比糞坑石頭還硬的燈籠匠？');
    await S.say('xinghe:surprise', '你認識陳伯？');
    await S.say('yungui:normal', '師父提過。說他是世上唯一一個罵人罵得比我師父還兇的人。');
    // the Taoist drifts down into the courtyard
    S.sfx('wind');
    S.setPos('c3_yg_roof', 14, 9, 'down'); yg.offsetY = ROOF_Y - 128;
    await G.Tweens.to(yg, { offsetY: 0 }, 0.9, 'inOutQuad');
    await S.say('hongying:surprise', '（好俊的輕功……）');
    await S.jump('c3_yg_roof', 6);
    await S.say('yungui:smile', '……酒還沒醒。剛剛那一下是運氣。');
    await S.say('yungui:normal', '貧道雲歸，太虛觀道士。');
    if (yy) {
      S.face('c3_yg_roof', 'yuyuan');
      await S.say('yungui:normal', '這隻貓，欠我三塊紅龜粿。記帳。');
      await S.say('xinghe:sad', '……我替牠還。');
    }
    await S.say('yungui:serious', '師父不在。三個月前下山了，沒說去哪裡，只留了一封信叫我不准跟。');
    await S.say('yungui:normal', '所以我很聽話，在屋頂上沒跟。');
    await S.say('baizhi:think', '你在屋頂上等他回來嗎？');
    await S.wait(0.4);
    await S.say('yungui:normal', '……屋頂上看得比較遠而已。');
    S.face('c3_yg_roof', 'baizhi');
    await S.wait(0.3);
    await S.say('yungui:serious', '姑娘。妳身上的光……不是人的光。');
    S.emote('mochi', '!');
    await S.say('hongying:angry', '你說什麼！');
    await S.say('yungui:smile', '別緊張。不是壞話。……跟我來。有面鏡子，很想見見妳。');
    S.bgm('temple');
    await S.move('c3_yg_roof', 'LUU');
    S.cameraFollow();
    await S.warp('taixu_hall', 7, 9, 'up');
  }

  async function roofTalk(S) { // 3-8 + 3-9
    await S.fadeOut(0.8);
    S.hideFollowers(true);
    S.remove('c3_yg_npc');
    const p = S.actor('player');
    S.setPos('player', 12, 7, 'right'); p.offsetY = ROOF_Y;
    const yg = S.spawn({ id: 'c3_yg_roof', sprite: 'yungui', x: 14, y: 7, dir: 'left' }); yg.offsetY = ROOF_Y;
    if (F('yuyuan_joined')) { const yy = S.spawn({ id: 'c3_yy_roof', sprite: 'yuyuan', x: 13, y: 7, dir: 'down' }); yy.offsetY = ROOF_Y + 4; }
    await S.camera(13, 6, 0.1);
    S.bgm('night', { fade: 1 });
    await S.fadeIn(1.0);
    await S.say('', F('yuyuan_joined') ? '（夜。月亮將圓。星河爬上了正殿的屋脊。芋圓不知道什麼時候也爬了上來，在兩人中間打呼。）' : '（夜。月亮將圓。星河爬上了正殿的屋脊。）');
    await S.say('yungui:normal', '爬得挺快。燈籠舖學徒都這麼會爬屋頂？');
    await S.say('xinghe:smile', '九份的屋頂一個接一個，小時候偷溜出去看戲，都是走屋頂。');
    await S.say('yungui:smile', '不錯。偷溜是修道的第一步。');
    await S.say('', '（沉默。雲海在月下翻湧。）');
    await S.say('xinghe:think', '你說「屋頂上看得比較遠」……其實是在等你師父吧。');
    await S.say('yungui:normal', '……你這人，看起來笨，偏偏挑最痛的地方戳。');
    await S.say('yungui:sad', '我七歲被丟在觀門口。師父撿了我，教我畫符，教我喝酒——好吧，喝酒是我偷學的。');
    await S.say('yungui:normal', '他那個人，什麼都一個人扛。寫信叫我不准跟，就是知道那邊很危險。');
    await S.say('yungui:sad', '我很聽話……聽話到每天在屋頂上，看山下有沒有人上來。');
    await S.say('xinghe:serious', '那就別聽話了。跟我們走。');
    await S.say('yungui:smug', '哦？你以為我會這麼容易被一個小鬼說動？');
    S.sfx('ghost');
    await S.wait(0.5);
    S.emote('c3_yy_roof', '!');
    await S.say('', F('yuyuan_joined') ? '（遠方。山門外的樹林，忽然一齊熄了蟲鳴。芋圓猛地抬頭，全身的毛炸成一顆球。）' : '（遠方。山門外的樹林，忽然一齊熄了蟲鳴。）');
    await S.say('yungui:serious', '……有東西。很多。冷的。');
    S.sfx('switch');
    await S.say('yungui:serious', '……說動的事，晚點再談。');
    S.flag('ch3_roof_talk');
    S.bgm('tension');
    // ---- 3-9 鬼面夜襲
    await S.fadeOut(0.5);
    p.offsetY = 0; S.remove('c3_yg_roof'); S.remove('c3_yy_roof');
    S.setPos('player', 13, 13, 'down'); S.hideFollowers(false); S.gather();
    S.setPos('hongying', 12, 14, 'down'); S.setPos('baizhi', 12, 12, 'down');
    for (const f of G.mapScene.followers) f.scripted = true;
    S.spawn({ id: 'c3_yg', sprite: 'yungui', x: 14, y: 13, dir: 'down' });
    for (let i = 0; i < 3; i++) S.spawn({ id: 'c3_yin' + i, sprite: 'soldier', x: 12 + i * 1, y: 20, dir: 'up', ghost: true });
    await S.camera(13, 15, 0.1);
    await S.fadeIn(0.6);
    S.sfx('ghost');
    await Promise.all([S.move('c3_yin0', 'UUUU'), S.move('c3_yin1', 'UUU'), S.move('c3_yin2', 'UUUU')]);
    await S.say('', '（山門外湧進一列鎧甲殘破的陰兵，眼眶裡燃著藍火。腰間都掛著小小的長明燈。）');
    await mv(S, 'hongying', 'DD');
    S.face('hongying', 'down');
    await S.say('hongying:serious', '陰兵……而且身上掛著長明燈。');
    await S.say('yungui:think', '用燈牽著亡兵走。好陰的手法。');
    S.sfx('thunder'); S.flash('#9ad8ff', 0.3, 0.6);
    await S.say('yungui:smug', '（從袖中甩出三張符，符紙在空中燃起青雷）敢踏太虛觀的地，得先問過我的酒。');
    await S.say('xinghe:surprise', '酒還能問的嗎！？');
    let r = await S.battle('t_c3_raid', { guests: ['yungui'], bgmAfter: 'tension' });
    for (let i = 0; i < 3; i++) S.remove('c3_yin' + i);
    await S.say('', '（陰兵化成了灰。下一刻，鐘樓上傳來一聲輕響。）');
    const gm = S.spawn({ id: 'c3_gm', sprite: 'qingfeng_mask', x: 22, y: 17, dir: 'left' }); gm.offsetY = -190;
    await S.camera(20, 15, 0.8);
    await S.say('', '（月光下，一個戴著猙獰鬼面具的劍客站在鐘樓頂。黑衣，背後披風破爛，手中一柄長劍。）');
    S.emote('hongying', '💢');
    S.bgm('boss');
    await S.say('hongying:angry', '——鬼面！！！');
    await S.say('hongying:angry', '三年！我找了你三年！洛家上下二十七口——今天你還來！');
    await S.say('qingfeng_mask:normal', '……');
    await S.say('qingfeng_mask:normal', '我不是來找妳的。（劍尖指向白芷）我是來接她的。');
    await S.say('xinghe:angry', '想都別想！');
    await S.say('qingfeng_mask:normal', '白芷姑娘。外面的海，一夜比一夜黑。妳聽得見的。');
    await S.say('baizhi:sad', '……');
    // 鬼面 never strikes 紅纓 with full force (his hits on her are halved — she may notice he is holding back)
    let said75 = false;
    r = await S.battle('t_c3_guimian', {
      guests: ['yungui'], rewards: true, bgmAfter: 'tension',
      onTurn: async (b, u) => {
        const boss = b.enemies.find((e) => e.id === 'c3_guimian');
        const hy = b.party.find((pp) => pp.id === 'hongying');
        if (boss && u === boss && hy && !hy.dead) hy.st.guard = 1;
        if (boss && !said75 && boss.hp <= boss.mhp * 0.75) {
          said75 = true;
          await b.say2('hongying:angry', '給我站好！讓我刺穿你！');
          await b.say2('qingfeng_mask:normal', '（只守不攻，擋開紅纓的槍）……');
          await b.say2('yungui:think', '（他在讓她。為什麼？）');
        }
      },
    });
    if (r !== 'win') return;
    S.cameraFollow();
    gm.offsetY = 0; S.setPos('c3_gm', 13, 16, 'up');
    S.setPos('hongying', 13, 15, 'down');
    await S.camera(13, 15, 0.2);
    S.sfx('slash'); await S.wait(0.2); S.sfx('metal'); S.flash('#fff', 0.25, 0.7); S.shake(6, 0.3);
    await S.say('', '（鬼面突然轉身背對紅纓——紅纓趁機猛刺——他卻在背轉的同時反手一劍，劍光從腋下回挑，正正架住紅纓的槍頭。）');
    await S.say('', '鏗！');
    await S.wait(0.6);
    await S.say('hongying:surprise', '……回馬槍。');
    await S.say('hongying:surprise', '背身誘敵、回手反挑……那是洛家槍的回馬槍！');
    await S.say('hongying:angry', '用劍使回馬槍——你從哪裡偷學的！！');
    await S.say('qingfeng_mask:normal', '……');
    await S.say('qingfeng_mask:normal', '（低聲）槍，握得太緊了。');
    await S.say('hongying:surprise', '（手猛地一顫，槍尖垂落半寸）……你說……什麼……');
    S.sfx('wind');
    await S.move('c3_gm', 'DD', { speed: 6 });
    S.face('c3_gm', 'baizhi');
    await S.say('qingfeng_mask:normal', '白芷姑娘，妳遲早要回去的。');
    S.face('c3_gm', 'player');
    await S.say('qingfeng_mask:normal', '在那之前——好好看著她。');
    await S.fadeActor('c3_gm', 0, 0.6);
    S.remove('c3_gm');
    S.bgm(null);
    await S.say('', '（他消失在雲霧裡。）');
    await S.say('xinghe:think', '……「好好看著她」？他到底站哪一邊……');
    await S.say('', '（紅纓跪了下去，槍桿撐地，指節發白。）');
    await S.say('hongying:cry', '「槍握太緊，就刺不遠」……那是……那是我哥說的話……');
    await S.say('baizhi:sad', '紅纓……');
    await S.say('hongying:angry', '（猛地站起，抹掉眼淚）一定是他殺了我哥之前……從我哥身上偷學的！劍譜也是他偷的！');
    await S.say('hongying:angry', '我會殺了他。一定。');
    await S.say('xinghe:sad', '……');
    await S.say('yungui:serious', '（收起摺扇）那人身上，有和那些陰兵一樣的燈味。長明宮的燈。');
    await S.say('yungui:serious', '師父去查長明宮，長明宮的人就來太虛觀找這位姑娘。');
    await S.say('yungui:normal', '……我這人最討厭巧合。');
    await S.move('c3_yg', 'RRRRUUU');
    S.show('c3_yg', false);
    await S.wait(1.0);
    S.show('c3_yg', true);
    await S.move('c3_yg', 'DDDLLLL');
    S.face('c3_yg', 'player');
    await S.say('', '（雲歸走了出來：腰掛葫蘆、手提摺扇，背上綁著一個比他還大的布包。）');
    await S.say('xinghe:surprise', '那、那包是什麼？');
    await S.say('yungui:smile', '我的蘑菇標本。還有一半是乾糧。另一半也是。');
    S.emote('yuyuan', '♥');
    await S.say('', F('yuyuan_joined') ? '（芋圓繞著布包聞了一圈，眼睛發亮。）' : '（布包裡飄出一股乾香菇的味道。）');
    await S.say('yungui:normal', '剛剛那件事，談好了。我跟你們走。');
    await S.say('yungui:smug', '不是被說動喔。是師父的信上寫「不准跟來」——沒寫「不准跟別人一起來」。');
    await S.say('hongying:normal', '……歪理。');
    await S.say('yungui:normal', '先去艋舺。龍山寺的吳廟公，是師父的老朋友。師父若有消息，一定會經過他。');
    S.remove('c3_yg');
    S.join('yungui');
    G.Story.ensureLevel('yungui', Math.max(11, avgLv()));
    S.flag('ch3_guimian_raid'); S.flag('ch3_yungui_join');
    await S.give('c3_taixu_key', 1);
    await S.give('c3_mush_book', 1);
    S.quest('q_ch3_main', 3);
    S.objective(mainObj());
    S.bgm('temple');
    S.cameraFollow();
  }

  G.Maps.define('taixu', {
    name: '太虛觀', subtitle: (st) => (txNight(st) ? '月下的道觀' : '觀音山頂・雲霧裡的道觀'), place: 'guanyin',
    bgm: (st) => (txNight(st) && !st.flags.ch3_yungui_join ? 'night' : 'temple'),
    start: [13, 19],
    light: (st) => (txNight(st) ? { ambient: 0.58, color: '#081028', tint: 'rgba(120,150,220,0.12)', playerR: 220 } : { ambient: 0.15, color: '#5a6a80', tint: 'rgba(220,230,255,0.1)' }),
    particles: (st) => (txNight(st) ? ['fireflies', 'motes'] : ['mist']),
    tiles: TX.tiles, deco: TX.deco,
    objects: [
      { t: 'temple', x: 10, y: 2, text: '太虛觀' },
      { t: 'stone_lantern', x: 11, y: 20 }, { t: 'stone_lantern', x: 16, y: 20 },
      { t: 'incense_burner', x: 13, y: 11 },
      { t: 'stone_lantern', x: 9, y: 9 }, { t: 'stone_lantern', x: 18, y: 9 }, { t: 'stone_lantern', x: 9, y: 16 }, { t: 'stone_lantern', x: 18, y: 16 },
      { t: 'bell_tower', x: 21, y: 15 },
      { t: 'house_minnan', x: 21, y: 7, v: 1 },
      { t: 'house_minnan', x: 2, y: 7, v: 0, door: -1 }, { t: 'pot', x: 3, y: 10 }, { t: 'stove', x: 4, y: 10 }, { t: 'jar', x: 6, y: 10 },
      { t: 'log', x: 2, y: 4 }, { t: 'log', x: 2, y: 5 }, { t: 'signboard', x: 7, y: 3, text: '閒人勿食' },
      { t: 'tree_maple', x: 2, y: 2 }, { t: 'stump', x: 8, y: 5 },
      { t: 'banner', x: 9, y: 6, color: '#3a5a8a', text: '道' }, { t: 'banner', x: 18, y: 6, color: '#3a5a8a', text: '德' },
      { t: 'drum_rack', x: 20, y: 12 }, { t: 'well', x: 6, y: 17 }, { t: 'plant_pot', x: 11, y: 7, v: 1 }, { t: 'plant_pot', x: 15, y: 7, v: 2 },
      { t: 'bench', x: 15, y: 18 }, { t: 'tree_pine', x: 3, y: 13 }, { t: 'tree_pine', x: 24, y: 18 },
    ],
    chests: [{ id: 'c3_07', x: 3, y: 3, item: 'c3_ft_cloudboots', spirit: true }],
    npcs: [
      { id: 'c3_yg_npc', sprite: 'yungui', name: '雲歸', x: 13, y: 9, dir: 'down', portrait: 'yungui',
        if: (st) => st.flags.ch3_legend && !st.flags.ch3_roof_talk,
        talk: async (S) => { await S.say('yungui:normal', '……今晚的月亮，差一點點就圓了。'); await roofTalk(S); } },
    ],
    events: [
      { id: 'tx_intro', trigger: 'auto', if: (st) => !st.flags.ch3_yungui_met, run: yunguiIntro },
      { id: 'tx_burner', trigger: 'action', x: 13, y: 11, label: '調查', run: async (S) => {
        if (F('ch3_yungui_join')) await S.say('', '香爐裡新插了三炷香。雲歸臨走前點的。');
        else await S.say('', '香灰是冷的。這裡已經好幾天沒人上香了。');
      } },
      { id: 'tx_sign', trigger: 'action', x: 7, y: 3, label: '調查', run: async (S) => { await S.say('', '「閒人勿食。師父尤其勿食。」……後面那句寫得特別大。'); } },
      { id: 'tx_bell', trigger: 'action', x: 21, y: 16, w: 2, h: 1, label: '調查', run: async (S) => { await S.say('', '鐘上刻著：「一念清靜，萬緣皆歸。」'); } },
      { id: 'tx_mush', trigger: 'action', x: 4, y: 4, w: 3, h: 2, label: '調查', self: true, run: async (S) => {
        if (F('ch3_yungui_join')) { await S.say('yungui:normal', '我數過了，少一朵。'); return; }
        await S.say('', '一排長在木頭上的蕈菇，發著淡淡的光。');
        const c = await S.choice(['偷吃一朵', '還是算了'], { cancel: 1 });
        if (c !== 0) return;
        S.flag('ch3_ate_mush');
        const m = G.state.members.xinghe; if (m) m.hp = Math.max(1, m.hp - 10);
        S.sfx('fire');
        await S.say('xinghe:surprise', '好辣！');
        S.vision(60);
        await S.say('', '（四周的顏色開始呼吸……後院的槐樹下，好像埋著什麼東西。）');
      } },
      { id: 'tx_shard', trigger: 'action', x: 20, y: 17, w: 3, h: 1, label: '調查', if: (st) => st.flags.ch3_guimian_raid && !st.flags.ch3_mask_shard, run: async (S) => {
        await S.say('', '地上有一枚碎掉的面具碎片，內側有焦黑的痕跡——像被火燒過。');
        S.flag('ch3_mask_shard');
        await S.give('c3_mask_shard', 1);
        if (inParty('hongying')) await S.say('hongying:serious', '……鬼面的面具。我收著。');
      } },
      { id: 'tx_gate_down', trigger: 'touch', x: 13, y: 21, w: 2, h: 1, run: async (S) => {
        if (F('ch3_yungui_join')) {
          await S.say('yungui:normal', '下山我知道一條近路，直接到八里渡口。');
          const c = await S.choice(['走近路下山', '走山道'], { cancel: 1 });
          if (c === 0) { await S.warp('guanyin_trail', 20, 52, 'down'); return; }
        }
        await S.warp('guanyin_trail', 19, 1, 'down');
      } },
    ],
    warps: [
      { x: 13, y: 6, to: 'taixu_hall', tx: 7, ty: 10, tdir: 'up', door: true },
      { x: 23, y: 9, to: 'taixu_room', tx: 6, ty: 7, tdir: 'up', door: true },
    ],
    drawOver: (ctx, t, m) => {
      if (!F('ch3_guimian_raid') || F('ch3_mask_shard')) return;
      const x = 21.5 * T, y = 17.6 * T, a = 0.4 + 0.3 * Math.sin(t * 3);
      ctx.fillStyle = `rgba(240,240,255,${a})`;
      ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x + 6, y - 6); ctx.lineTo(x + 10, y + 4); ctx.closePath(); ctx.fill();
    },
  });

  // ------------------------------------------------------------------ 太虛觀正殿 taixu_hall (16×12)
  G.Maps.define('taixu_hall', {
    name: '太虛觀・正殿', subtitle: '三清神案與照魂鏡', place: 'guanyin',
    bgm: 'temple', start: [7, 9],
    light: { ambient: 0.3, color: '#100c18' },
    particles: ['dust'],
    tiles: (() => { const g = room(16, 12, 'T', 'E', [7, 8]); fill(g, 7, 3, 2, 8, 'c'); return rows(g); })(),
    objects: [
      { t: 'altar', x: 7, y: 2 }, { t: 'brazier', x: 5, y: 2 }, { t: 'brazier', x: 10, y: 2 },
      { t: 'mural', x: 2, y: 1, v: 1 }, { t: 'mural', x: 12, y: 1, v: 1 },
      { t: 'pillar', x: 4, y: 4 }, { t: 'pillar', x: 11, y: 4 }, { t: 'pillar', x: 4, y: 8 }, { t: 'pillar', x: 11, y: 8 },
      { t: 'mirror_stand', x: 8, y: 4 },
      { t: 'red_lantern', x: 2, y: 2 }, { t: 'red_lantern', x: 13, y: 2 }, { t: 'bookshelf', x: 1, y: 6 }, { t: 'incense_burner', x: 13, y: 6 },
    ],
    lights: [{ x: 8, y: 4, r: 160, color: '#9ae8ff', flicker: 0.15 }],
    events: [
      { id: 'th_mirror', trigger: 'auto', if: (st) => st.flags.ch3_yungui_met && !st.flags.ch3_mirror, run: async (S) => { // 3-6
        S.spawn({ id: 'c3_yg', sprite: 'yungui', x: 10, y: 5, dir: 'left' });
        S.setPos('player', 7, 6, 'up'); S.setPos('baizhi', 8, 7, 'up'); S.setPos('hongying', 9, 6, 'up');
        for (const f of G.mapScene.followers) f.scripted = true;
        await S.camera(8, 6, 0.1);
        await S.say('', '（正殿。三清神案前香燭初點。中央一面古銅大鏡，鏡面霧濛濛的。）');
        await S.say('yungui:normal', '照魂鏡。太虛觀的鎮觀之寶。照的不是皮相，是魂。');
        await S.say('yungui:smug', '每個人的魂，在鏡子裡都是一盞燈。顏色、亮度，各不相同。');
        if (F('yuyuan_joined')) {
          S.emote('yuyuan', '?');
          await S.say('', '（芋圓搶先跳到鏡子前。鏡面上浮現出……一顆圓滾滾的肉包子。）');
          await S.say('yungui:normal', '……那是牠的肚子。鏡子也有照錯的時候。');
        }
        await mv(S, 'hongying', 'LU'); S.face('hongying', 'up');
        S.flash('#ff6a4a', 0.4, 0.4); S.sfx('fire');
        await S.say('', '（紅纓站到鏡前。鏡中浮現一盞紅色燈籠，火焰筆直、明亮，但燈罩上有一道焦痕。）');
        await S.say('yungui:think', '紅得很正。只是……燈罩燒過。妳失去過很重要的人。');
        await S.say('hongying:serious', '……不用你說。');
        await mv(S, 'hongying', 'DR');
        await S.move('player', 'RU'); S.face('player', 'up');
        S.flash('#ffb060', 0.3, 0.2);
        await S.say('', '（星河站上去。鏡中一片昏暗——沒有燈籠，只有胸口一點小小的火苗，像借來的螢火。）');
        await S.say('xinghe:think', '咦？我的燈呢？是不是鏡子壞了？');
        await S.say('yungui:serious', '……');
        await S.say('yungui:smile', '大概你魂太小，鏡子找不到。');
        await S.say('xinghe:angry', '喂！');
        S.face('c3_yg', 'down'); S.emote('c3_yg', '…');
        await S.wait(0.8);
        await S.move('player', 'DL');
        await mv(S, 'baizhi', 'UU'); S.face('baizhi', 'up');
        await S.wait(0.6);
        S.sfx('bell'); S.flash('#ffffff', 1.4, 1);
        S.bgm('sad', { fade: 0.5 });
        await S.say('', '（鏡面猛然亮起。鏡中不是燈籠——是一座高塔，塔頂一盞巨大的燈，燈下是無邊的黑海。）');
        await S.say('', '（無數小小的光點在海上漂向那盞燈。燈火的形狀，是一個長髮的少女。）');
        await S.say('baizhi:surprise', '……那是……我？');
        S.shake(3, 0.5);
        await S.move('player', 'R');
        await S.say('baizhi:hurt', '好亮……好多人……他們在……往我這裡漂……');
        S.sfx('sing');
        await S.say('baizhi:cry', '「莫問來時何處路……燈在彼岸為你亮……」');
        S.sfx('shatter'); S.shake(4, 0.2);
        await S.say('', '（鏡面「啪」地裂出一道細紋。光熄滅。白芷昏倒在星河懷裡。）');
        await S.say('xinghe:angry', '白芷！你對她做了什麼！');
        await S.say('yungui:serious', '我什麼都沒做。是鏡子照不下她。');
        S.flag('lyric_ch3'); S.flag('ch3_mirror');
        S.toast('渡魂謠殘句：「莫問來時何處路，燈在彼岸為你亮。」', 'scroll');
        await S.fadeOut(1.0);
        S.remove('c3_yg');
        await S.warp('taixu_room', 6, 6, 'up', { fade: 0, stayDark: true });
      } },
      { id: 'th_mirror_look', trigger: 'action', x: 8, y: 4, label: '照魂鏡', if: (st) => st.flags.ch3_mirror, run: async (S) => {
        await S.say('', '古銅大鏡。鏡面上有一道細細的裂紋。');
        await S.say('', '鏡中的自己，胸口亮著一點小小的火。');
      } },
      { id: 'th_altar', trigger: 'action', x: 7, y: 2, w: 2, h: 1, label: '參拜', run: async (S) => { await S.say('', '三清神案。香煙裊裊，燭火安靜地跳動。'); } },
    ],
    warps: [{ x: 7, y: 11, w: 2, to: 'taixu', tx: 13, ty: 7, tdir: 'down', door: true }],
  });

  // ------------------------------------------------------------------ 雲歸的房間 taixu_room (12×9)
  G.Maps.define('taixu_room', {
    name: '太虛觀・雲歸的房間', subtitle: '書、酒、還有蕈', place: 'guanyin',
    bgm: (st) => (txNight(st) ? 'night' : 'temple'), start: [6, 7],
    light: (st) => (txNight(st) ? { ambient: 0.45, color: '#0a0c1e' } : { ambient: 0.18, color: '#1a1410' }),
    tiles: rows(room(12, 9, '_', 'W', [6])),
    objects: [
      { t: 'bookshelf', x: 1, y: 2 }, { t: 'bookshelf', x: 3, y: 2 }, { t: 'bookshelf', x: 8, y: 2 },
      { t: 'bed_mat', x: 10, y: 3 }, { t: 'table', x: 5, y: 4 }, { t: 'chair', x: 5, y: 5, dir: 'up' },
      { t: 'jar_row', x: 1, y: 7, w: 2 }, { t: 'jar', x: 1, y: 5 }, { t: 'jar', x: 1, y: 4 }, { t: 'jar', x: 3, y: 7 }, { t: 'jar', x: 9, y: 7 },
      { t: 'basket', x: 8, y: 7, v: 1 }, { t: 'herbs_rack', x: 6, y: 2 }, { t: 'mural', x: 5, y: 1, v: 3 },
    ],
    chests: [{ id: 'c3_08', x: 10, y: 7, item: 'c3_fn_thunderwood', gold: 300, if: (st) => !!st.inv.c3_taixu_key || !!st.opened['taixu_room:c3_08'] }],
    lights: [{ x: 5, y: 4, r: 150, color: '#ffc080', flicker: 0.3 }],
    events: [
      { id: 'tr_legend', trigger: 'auto', if: (st) => st.flags.ch3_mirror && !st.flags.ch3_legend, run: async (S) => { // 3-7
        S.spawn({ id: 'c3_yg', sprite: 'yungui', x: 4, y: 3, dir: 'down' });
        S.setPos('baizhi', 10, 4, 'down'); S.setPos('player', 8, 5, 'left'); S.setPos('hongying', 6, 6, 'left');
        for (const f of G.mapScene.followers) f.scripted = true;
        await S.fadeIn(0.8);
        await S.say('', '（雲歸的房間。白芷在床上睡著。滿屋子的書與泡著蕈菇的罐子。）');
        await S.say('hongying:think', '……這些罐子裡泡的是什麼？');
        await S.say('yungui:smile', '我的研究。這罐是「鬼筆」，那罐是「竹蓀」，這罐……');
        await S.say('yungui:think', '這罐我也不知道是什麼。上個月吃了一片，看見我師父在跳舞。');
        await S.say('xinghe:surprise', '你、你亂吃蘑菇？！');
        await S.say('yungui:smug', '是嚴謹的親身試驗。前輩修士都是這樣悟道的。');
        await S.say('yungui:normal', '……雖然上次試驗完，我抱著香爐哭了一整晚，說香爐是我娘。');
        await S.say('hongying:think', '……這個人真的可靠嗎？');
        await S.say('', '（雲歸從書架抽出一卷殘破的書，封面寫著《內景圖說》。）');
        await S.say('yungui:serious', '這是禁書。師父不准我看。所以我看了很多遍。');
        await S.say('yungui:serious', '書上說：唐山與台灣之間，有一道黑水溝。人死了，魂化成一點燈火，順黑水漂走。');
        await S.say('yungui:serious', '漂到海的盡頭，有一座彼岸。彼岸上立著一盞燈，叫彼岸燈。');
        await S.say('yungui:serious', '燈光引魂過海。過了海的魂，洗去記憶，重新投胎。');
        await S.say('xinghe:think', '陳伯……也講過一樣的事。他說他是引魂人。');
        await S.say('yungui:think', '引魂人。書上也有。……還有一件。');
        await S.say('yungui:serious', '每隔幾代，那盞燈會暗下來。燈裡的靈——燈靈——會被拋上岸，變成人。');
        await S.say('yungui:serious', '燈靈若不回去，燈就滅了。魂過不了海，亡者堆在岸邊，變成厲鬼。');
        await S.say('', '（沉默。眾人看向床上的白芷。）');
        await S.say('hongying:angry', '……你是說，她是一盞燈？她明明會吃芋圓、會笑、會被我的飯糰噎到！');
        await S.say('yungui:normal', '我沒說什麼。鏡子說的。……而且書也可能是亂寫的。');
        await S.say('yungui:serious', '禁書嘛，一半是真，一半是寫書的人喝醉了。');
        await S.say('xinghe:serious', '……不管她是什麼。她是白芷。');
        await S.say('yungui:smile', '（看了星河一眼）嗯。這話說得不錯。');
        await S.say('', '（雲歸拿起書桌上一封信。信封寫著「雲歸親啟——不准跟來」。）');
        await S.say('yungui:normal', '師父三個月前留的。說要去查「長明宮」的燈。');
        await S.say('xinghe:surprise', '長明宮！在九份抓白芷的墨鴉，就是長明宮的人！');
        await S.say('yungui:serious', '……那他就不只是下山散步了。');
        await S.say('yungui:normal', '師父每月會託艋舺龍山寺的吳廟公捎信來。這個月……沒有。');
        S.flag('ch3_legend');
        V().c3_taixu = 'night';
        await S.fadeOut(0.8);
        S.remove('c3_yg');
        await S.say('', '——入夜。白芷醒了過來，說她只是有點累。');
        S.objective(mainObj());
        await S.warp('taixu_room', 6, 6, 'down', { fade: 0, reload: true });
        await S.fadeIn(0.8);
        if (inParty('baizhi')) await S.say('baizhi:smile', '我沒事了。……雲歸在中庭等我們嗎？');
      } },
      { id: 'tr_books', trigger: 'action', x: 1, y: 2, w: 4, h: 1, label: '調查', run: async (S) => {
        await S.say('', '書架上塞滿了丹經、符書和蕈菇圖譜。最裡面夾著一卷殘破的《內景圖說》。');
        if (F('ch3_legend')) await S.say('', '書頁邊緣有清虛真人的批註：「燈靈非器，乃心。」');
      } },
      { id: 'tr_letter', trigger: 'action', x: 5, y: 4, label: '調查', run: async (S) => {
        if (F('ch3_legend')) await S.say('', '「雲歸親啟——不准跟來」。信封空了。雲歸把信收進了懷裡。');
        else await S.say('', '書桌上壓著一封信。信封上寫著「雲歸親啟——不准跟來」。');
      } },
      { id: 'tr_jars', trigger: 'action', x: 1, y: 4, w: 1, h: 2, label: '調查', run: async (S) => { await S.say('', '罐子裡泡著奇形怪狀的蕈菇。標籤寫著：「鬼筆」「竹蓀」「？？？（勿再試）」。'); } },
    ],
    warps: [{ x: 6, y: 8, to: 'taixu', tx: 23, ty: 10, tdir: 'down', door: true }],
  });

  // =====================================================================================================
  // 艋舺 bangka (56×44)
  // =====================================================================================================
  const BK = (() => {
    const W = 56, H = 44;
    const g = grid(W, H, ':');
    fill(g, 0, 0, 5, H, 'r');                         // 淡水河
    fill(g, 5, 1, 2, 41, 'k');                        // riverside boardwalk
    fill(g, 2, 4, 3, 2, 'k'); fill(g, 2, 18, 3, 3, 'k'); fill(g, 2, 32, 3, 2, 'k');   // 北・中・南渡頭
    fill(g, 5, 0, W - 5, 1, 'h'); fill(g, 8, 0, 2, 1, '=');                            // north edge + road to 舊渡頭
    fill(g, 7, 5, 49, 2, '#');                        // 北街
    fill(g, 7, 10, 49, 2, '#');                       // 主街
    fill(g, 7, 15, 37, 2, '#');                       // 廟口街
    fill(g, 7, 19, 8, 2, '#');                        // road to 中渡頭
    fill(g, 14, 18, 30, 13, '%');                     // 龍山寺廟埕
    fill(g, 7, 31, 19, 11, '.'); fill(g, 29, 31, 27, 11, '.');
    fill(g, 26, 31, 3, 11, '=');                      // road to 南門
    fill(g, 7, 34, 19, 1, '='); fill(g, 29, 34, 15, 1, '=');
    fill(g, 44, 12, 12, 10, '.');                     // north-east green
    fill(g, 44, 22, 12, 14, ':');                     // 八甲庄 ruins
    for (const [x, y] of [[46, 24], [47, 24], [52, 26], [52, 27], [45, 31], [53, 33], [54, 33], [49, 34]]) set(g, x, y, 'R');
    fill(g, 5, 43, W - 5, 1, 'h'); fill(g, 27, 42, 1, 2, '=');
    fill(g, 36, 12, 2, 3, ':');                       // 青草巷
    const d = grid(W, H, ' ');
    for (const [x, y, c] of [[46, 23, 'd'], [50, 25, 'd'], [54, 29, 'd'], [47, 33, 'd'], [44, 27, 'g'], [45, 28, 'g'], [51, 31, 'g'], [52, 32, 'g'], [48, 26, 'r'], [53, 24, 'g'], [44, 34, 'g'],
      [46, 15, 'b'], [50, 13, 'c'], [53, 17, 'c'], [52, 20, 'u'], [45, 20, 'w'], [49, 19, 'w'], [53, 13, 'u'], [53, 2, 'c'], [54, 6, 'u'],
      [9, 37, 'c'], [21, 38, 'c'], [12, 40, 'u'], [33, 38, 'c'], [41, 40, 'c'], [48, 38, 'c'], [53, 36, 'u'], [18, 36, 'w'], [37, 36, 'w'], [23, 33, 'u'], [31, 40, 'w'], [52, 40, 'c']]) d[y][x] = c;
    return { W, H, tiles: rows(g), deco: d.map((r) => r.join('')) };
  })();
  const bkLight = (st) => {
    const dd = bkDay(st);
    if (dd === 1) return { ambient: 0.04, color: '#304050' };
    if (dd === 2) return { ambient: 0.48, color: '#0a0e26', tint: 'rgba(200,210,255,0.1)', playerR: 220 };
    return st.flags.ch3_theatre ? { ambient: 0.55, color: '#080c22', playerR: 220 } : { ambient: 0.3, color: '#3a1808', tint: 'rgba(255,150,80,0.2)', playerR: 200 };
  };
  const bkBgm = (st) => (bkDay(st) === 2 ? 'festival' : bkDay(st) === 0 && st.flags.ch3_theatre ? 'night' : 'city');
  const bkParticles = (st) => (bkDay(st) === 1 ? ['leaves'] : bkDay(st) === 2 ? ['lanterns', 'fireflies'] : st.flags.ch3_theatre ? ['fireflies'] : ['motes']);
  const festival = (st) => bkDay(st) === 2;

  async function bkArrive(S) { // 3-10
    S.flag('ch3_bangka_arrive');
    V().ch3_day = 0;
    S.light(bkLight(G.state));
    await S.camera(14, 14, 0.1);
    await S.fadeIn(0.8);
    S.sfx('gong');
    await S.camera(26, 14, 1.4);
    await S.say('', '（渡船轉入河灣。岸上舟楫如林，船頭行的旗子一面接一面。人聲、叫賣聲、鑼聲。）');
    S.cameraFollow();
    await S.say('xinghe:laugh', '哇——！比九份熱鬧十倍！');
    await S.say('yungui:normal', '一府二鹿三艋舺。你現在站在台灣第三熱鬧的地方。');
    await S.say('baizhi:surprise', '第三？那第一和第二，不就熱鬧到會吵架了？');
    if (F('yuyuan_joined')) { S.emote('yuyuan', '♥'); await S.say('', '（芋圓的鼻子抽個不停——碗粿、肉粥、月餅。牠已經在盤算先偷哪一攤了。）'); }
    await S.say('hongying:think', '（看著碼頭）……這裡的長明燈，好多。');
    S.sfx('ghost');
    await S.say('', '（碼頭邊、主街上、商家屋簷下，處處掛著冷藍色的長明燈。極輕微的嗡鳴，此起彼落。）');
    S.emote('baizhi', '💧');
    if (F('mochi_joined')) S.emote('mochi', '…');
    await S.say('baizhi:sad', '（摀住耳朵）……好多聲音。在燈裡面……');
    await S.say('xinghe:serious', '白芷？');
    await S.say('baizhi:smile', '沒事。只是……這裡好多人，被留下來了。');
    await S.say('yungui:serious', '先去龍山寺。');
    S.objective(mainObj());
  }

  async function bkShow(S) { // 3-13 中秋夜・廟埕演戲 → 3-14 清虛真人的信
    S.bgm('festival');
    S.hideFollowers(false);
    S.setPos('player', 37, 25, 'up'); S.setPos('baizhi', 35, 28, 'up'); S.setPos('hongying', 36, 24, 'left');
    S.setPos('yungui', 33, 24, 'right'); S.setPos('yuyuan', 34, 25, 'up'); S.setPos('mochi', 34, 28, 'up');
    for (const f of G.mapScene.followers) f.scripted = true;
    S.spawn({ id: 'c3_hong', sprite: 'merchant', x: 38, y: 26, dir: 'left' });
    S.spawn({ id: 'c3_xiulan', sprite: 'actress', x: 35, y: 23, dir: 'down' });
    for (const [i, [x, y, sp]] of [[33, 27, 'old_f'], [34, 28, 'villager_m'], [36, 29, 'villager_f2'], [33, 29, 'child_f'], [37, 28, 'old_m'], [32, 28, 'villager_f'], [38, 29, 'villager_m2'], [35, 30, 'child_m']].entries()) {
      S.spawn({ id: 'c3_crowd' + i, sprite: sp, x, y, dir: 'up' });
    }
    await S.camera(35, 25, 0.1);
    await S.fadeIn(1.0);
    await S.say('', '（中秋夜。大月亮掛在龍山寺屋脊上。廟埕人山人海，賣文旦、月餅的攤子一路排開。）');
    S.sfx('gong'); S.sfx('gong', 0.3); S.sfx('bell', 0.5);
    await S.say('', '（戲棚亮起。鑼鼓：咚咚鏘。）');
    await S.say('洪班主', '你們幾個聽好：星河管戲棚的燈！雲歸打鑼！紅纓——演一個家丁！');
    await S.say('hongying:surprise', '家丁！？我？！');
    await S.say('洪班主', '就站在那裡，拿著棍子，不要講話。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '我可是洛家槍的——');
    await S.say('洪班主', '不要講話！');
    if (F('yuyuan_joined')) {
      await S.say('洪班主', '那隻胖貓……當道具。演一顆石頭。');
      await S.say('xinghe:think', '芋圓才不會乖乖聽話——');
      S.emote('yuyuan', '…');
      await S.say('', '（芋圓在台角趴下，縮成一團，一動也不動。……演得比誰都像石頭。）');
    }
    await S.say('baizhi:think', '那我呢？');
    await S.say('洪班主', '姑娘妳就坐在台下看。……看戲的人也是戲的一部分。');
    const c = await S.choice(['操作戲棚燈（小遊戲）', '交給師傅們（略過）']);
    let hits = 0;
    if (c === 0) hits = await stageLights();
    if (c === 0 && hits >= 5) {
      await S.say('洪班主', '好！燈打得比我們老師傅還準！這是戲班的賞錢，還有這盒胭脂，給姑娘們。');
      S.gold(200); await S.give('c3_ac_rouge', 1);
    } else {
      await S.say('洪班主', '也算勉強啦。來，賞錢拿去。');
      S.gold(100);
    }
    if (F('ch3_yizigu_choice_b')) {
      await S.say('', '（台上，秀蘭扮的祝英台開口。那聲音清亮、稚嫩，卻一字一句準得驚人。）');
      S.sfx('sing');
      await S.say('椅仔姑（英台）', '「山伯哥，你送我送到十八里……」');
      await S.say('', '（台下的人聲漸漸靜了。阿婆們停下扇子。）');
      await S.say('baizhi:smile', '星河……她唱得好開心。');
      S.flash('#ffd8a0', 0.6, 0.25);
      await S.say('xinghe:smile', '（操作燈籠，台上光線轉暖）嗯。');
      S.sfx('gong');
      await S.say('yungui:normal', '（敲鑼，難得沒有說笑）……');
      await S.say('', '（紅纓站在台角當家丁，一動不動，眼眶卻紅了。）');
      S.sfx('gong'); S.sfx('gong', 0.25); S.sfx('bell', 0.5);
      await S.say('', '（戲到「樓台會」，英台唱完最後一句。滿場叫好。鑼鼓齊鳴。）');
      S.spawn({ id: 'c3_yzg', sprite: spr('c3_yizigu', 'ghost_child'), x: 35, y: 24, dir: 'down', ghost: true });
      S.actor('c3_yzg').alpha = 0;
      await S.fadeActor('c3_yzg', 0.85, 0.8);
      await S.say('', '（謝幕時，秀蘭的身體輕輕一晃。一個瘦小的影子從她身上浮起——只有隊伍看得見。）');
      await S.say('', '（一個穿著舊衣的小姑娘，站在戲台中央，對著月亮和滿場觀眾，深深一鞠躬。）');
      await S.jump('c3_yzg', 8);
      await S.say('椅仔姑', '我看過戲了。我還站在戲台上了。');
      await S.say('椅仔姑', '我不用再坐那張椅子了。');
      await S.say('椅仔姑', '謝謝姊姊。謝謝。');
      S.sfx('lantern');
      await S.fadeActor('c3_yzg', 0, 1.2);
      S.remove('c3_yzg');
      await S.say('', '（她化成一點小小的光，飄過月亮。秀蘭落下淚來，對著天空福了一福。）');
      await S.say('秀蘭', '……一路好走，小妹妹。下輩子，來我們戲班學戲。我不綁妳。');
      await S.lantern('lantern_yizigu', '椅仔姑與花旦');
      await S.say('baizhi:think', '星河，那個光……又進到你手裡了。');
      await S.say('xinghe:think', '嗯……溫溫的。');
    } else {
      await S.say('', '（秀蘭扮英台。唱得很好，台下叫好。）');
      S.sfx('gong'); S.sfx('gong', 0.3);
      await S.say('', '（謝幕時，白芷看著觀眾席最後一排——那裡有一張翻倒的竹椅。）');
      await S.say('baizhi:sad', '……她很想看的。');
      await S.say('yungui:normal', '……我知道。');
    }
    S.flag('ch3_show_done');
    // 3-14
    S.spawn({ id: 'c3_wu', sprite: 'temple_keeper', x: 34, y: 27, dir: 'up' });
    await S.move('c3_wu', 'U');
    await S.say('', '（散戲。吳廟公走上前，遞出一封信。）');
    await S.say('吳廟公', '雲歸，你師父的信。');
    await S.give('key_letter', 1, { silent: true });
    await S.say('', '（雲歸拆信。月光下，信紙上的字跡瀟灑而急促。）');
    await S.say('清虛真人（信）', '「雲歸：我知你必定會來。看過艋舺的燈了嗎？」');
    await S.say('清虛真人（信）', '「長明燈，不長明，是長囚。燈裡鎖著亡者，不讓他們過海。」');
    await S.say('清虛真人（信）', '「我沿海路南下，先往竹塹。城隍爺的簿子，近來算不攏了。」');
    await S.say('清虛真人（信）', '「我要一路查到府城。你若看了信還是要跟——」');
    await S.say('清虛真人（信）', '「記得帶傘，竹塹風大。」');
    await S.wait(0.6);
    await S.say('yungui:smile', '……這老頭。明明知道我會跟。');
    await S.say('yungui:sad', '（把信摺好，收進懷裡）……還交代我帶傘。');
    await S.say('xinghe:serious', '竹塹。那就往南。');
    await S.say('hongying:serious', '往南，也是往鹿港的方向。');
    await S.say('baizhi:think', '「長囚」……燈裡的人，好想出來。');
    if (F('ch3_alian_done')) await S.say('yungui:serious', '阿德就是被那種燈鎖著。我們親眼看見了。');
    await S.say('吳廟公', '南門出去，順著海線走，三四日就到竹塹。今暗先歇。');
    S.flag('ch3_letter');
    S.quest('q_ch3_main', 6);
    for (let i = 0; i < 8; i++) S.remove('c3_crowd' + i);
    S.remove('c3_hong'); S.remove('c3_xiulan'); S.remove('c3_wu');
    S.objective(mainObj());
    S.toast('南門已開放。也可以到龍山寺正殿前賞月。', 'lantern');
  }

  async function bkMoon(S) { // 3-15 月下
    S.flag('ch3_moon');
    await S.fadeOut(0.8);
    if (G.mapScene.def.id !== 'bangka') await S.warp('bangka', 27, 19, 'up', { fade: 0, stayDark: true });
    S.hideFollowers(true);
    const p = S.actor('player');
    S.setPos('player', 26, 18, 'right'); p.offsetY = ROOF_Y;
    const bz = S.spawn({ id: 'c3_bz', sprite: 'baizhi', x: 28, y: 18, dir: 'left' }); bz.offsetY = ROOF_Y;
    S.spawn({ id: 'c3_yg', sprite: 'yungui', x: 26, y: 21, dir: 'up' });
    if (F('yuyuan_joined')) S.spawn({ id: 'c3_yy', sprite: 'yuyuan', x: 27, y: 21, dir: 'up' });
    S.spawn({ id: 'c3_hy', sprite: 'hongying', x: 29, y: 21, dir: 'up' });
    await S.camera(27, 17, 0.1);
    S.bgm('love', { fade: 1.5 });
    await S.fadeIn(1.2);
    await S.say('', '（龍山寺屋脊上。這次是星河和白芷。月亮圓得像一面鏡子。）');
    await S.say('baizhi:smile', '星河，月亮好圓。');
    await S.say('xinghe:smile', '中秋嘛。今天的月亮最圓。');
    await S.say('baizhi:think', '為什麼最圓的月亮，要叫大家團圓？');
    await S.say('xinghe:think', '嗯……因為看到它圓圓的，就會想起不在身邊的人吧。');
    await S.say('baizhi:sad', '那……我也有不在身邊的人嗎？');
    await S.say('baizhi:sad', '照魂鏡裡，好多光在往我這裡漂。他們都在等我。');
    await S.say('xinghe:serious', '……');
    S.face('player', 'up');
    await S.say('xinghe:think', '（指著月亮——又急忙把手縮回來）');
    await S.say('baizhi:laugh', '星河，你會被割耳朵。');
    S.face('player', 'right');
    await S.say('xinghe:laugh', '剛剛那下不算！……我是想說——');
    await S.say('xinghe:serious', '不管鏡子照出什麼，現在妳在這裡，和我們一起看月亮。這個是真的。');
    await S.say('baizhi:smile', '……嗯。這個是真的。');
    if (F('ch3_alian_done') || F('ch3_yizigu_choice_b')) await S.say('', '（遠方河面上，幾點小小的光在月下漂向海口。）');
    else await S.say('', '（沉默。河面上的月影，一晃一晃。）');
    await S.say('baizhi:think', '星河，我們以後，也一起看下一次的月亮好不好？');
    await S.say('xinghe:smile', '好啊。下一次、下下一次，都一起看。');
    await S.move('c3_bz', 'L', { speed: 1.5 });
    S.emote('player', '♥');
    await S.say('', '（白芷微笑，靠在他肩上。星河僵住，耳朵紅了。下方傳來聲音——）');
    if (F('yuyuan_joined')) {
      S.emote('c3_yy', '!');
      await S.say('', '（下方，芋圓看見屋頂上的星河，張嘴就要「喵——」——）');
      await S.say('yungui:smug', '（一把摀住芋圓的嘴）噓。今晚沒有宵夜，不過可以看戲。');
    } else await S.say('yungui:smug', '（壓低聲音）噓。今晚沒有宵夜，不過可以看戲。');
    S.emote('c3_hy', '💢');
    await S.say('hongying:angry', '……你們兩個偷看什麼！（也在偷看）');
    await S.fadeOut(1.0);
    p.offsetY = 0;
    for (const id of ['c3_bz', 'c3_yg', 'c3_yy', 'c3_hy']) S.remove(id);
    S.hideFollowers(false);
    S.setPos('player', 27, 19, 'down'); S.gather();
    S.cameraFollow();
    S.bgm('festival');
    await S.fadeIn(0.8);
  }

  async function bkDepart(S) {
    if (!F('ch3_moon')) await bkMoon(S);
    await S.say('', '離開艋舺後，本地未完成的委託將無法再接。');
    const c = await S.choice(['出發，往竹塹', '再等一下'], { cancel: 1 });
    if (c !== 0) { await S.move('player', 'U'); return; }
    S.flag('ch3_done');
    S.quest('q_ch3_main', 'done');
    await S.fadeOut(1.2);
    G.Music.stop(1.2);
    const n = lanternSummary();
    await S.narrate(['第三章　觀音艋舺　完', `本章點亮的心燈：${n} 盞`], { veil: 1 });
    await G.Story.next(S, 4);
  }

  // ---- 支線 4-2 阿蓮與阿德
  async function alianTalk(S) {
    if (!F('ch3_alian_1')) {
      await S.say('alian:normal', '碗粿一碗六文……');
      await S.say('baizhi:think', '姊姊，妳好累的樣子。');
      await S.say('alian:sad', '……被看出來了。我翁婿阿德，去年颱風天在河裡翻船，沒回來。');
      await S.say('alian:sad', '我怕他變成孤魂野鬼，花了三兩銀，向長明宮請了一盞長明燈，掛在他出事的舊渡頭。');
      await S.say('alian:sad', '法師說，點著燈，他就永遠在我身邊，不會被忘記。');
      await S.say('alian:cry', '可是從那以後，我夜夜夢見他。他說他好冷。他說「阿蓮，放我走」……');
      await S.say('alian:cry', '是我做錯了什麼嗎？');
      if (inParty('yungui')) await S.say('yungui:serious', '……舊渡頭，在哪？');
      await S.say('alian:sad', '北邊……路的盡頭。白天什麼都看不到，暗時才……');
      S.flag('ch3_alian_1');
      S.quest('q_alian', 0);
      S.objective('夜裡去北邊的舊渡頭看看');
      return;
    }
    if (F('ch3_alian_2') && !F('ch3_alian_3')) {
      await S.say('alian:surprise', '你們……見到他了？');
      const c = await S.choice(['「他一直在河邊救人。他想走，是想好好地去等妳。」', '「燈裡有鎖魂符，妳不熄，我們幫妳熄。」']);
      if (c === 1) {
        await S.say('alian:angry', '那是我的燈！你們憑什麼！');
        S.sfx('door');
        await S.say('', '（阿蓮轉過身去，不再理人。）');
        S.emote('hongying', '💢');
        await S.say('hongying:angry', '（敲星河的頭）笨蛋，哪有人這樣講話的。');
        await S.say('xinghe:hurt', '痛……');
        return;
      }
      await S.say('alian:cry', '救人……那個傻瓜，死了還在救人……');
      await S.say('alian:sad', '可是熄了燈，他就真的走了。我會忘記他的。我會連他的聲音都忘記。');
      await S.say('baizhi:think', '阿蓮姊姊。妳記得他，是因為燈嗎？');
      await S.say('alian:surprise', '……');
      await S.say('baizhi:smile', '我什麼都記不得。可是我記得芋圓的味道、記得星河第一次跟我說話的聲音。');
      await S.say('baizhi:smile', '那些不是燈幫我記得的。是我自己。');
      await S.say('alian:cry', '……帶我去見他。');
      S.flag('ch3_alian_3');
      S.quest('q_alian', 2);
      if (bkDay() === 1) {
        await S.say('alian:sad', '天暗了，我在北邊路口等你們。');
        S.objective('夜裡，陪阿蓮去舊渡頭');
        return;
      }
      await S.fadeOut(0.8);
      await S.warp('bangka_riverbank', 6, 9, 'left', { fade: 0, stayDark: true });
      return;
    }
    if (F('ch3_alian_done')) {
      await S.say('alian:smile', '碗粿，我現在少放一點鹽了。你們吃吃看。');
      await S.shop(['c3_wanguo_lite'], { title: '阿蓮碗粿（少鹽）' });
      return;
    }
    await S.say('alian:normal', '碗粿一碗六文……北邊的舊渡頭，暗時才看得到。');
    await S.shop(['c3_wanguo'], { title: '阿蓮碗粿' });
  }

  // ---- 支線 4-4 頂下郊的兩個老人
  function feudCheck(S) {
    if (F('ch3_feud_clue') && F('ch3_feud_wu') && F('ch3_feud_tea') && G.Quests.stage('q_feud') < 1) { S.quest('q_feud', 1); S.objective('夜裡，帶兩位阿伯去阿興家'); }
  }
  async function feudTalk(S) {
    if (!F('ch3_feud_1')) {
      S.flag('ch3_feud_1');
      S.sfx('hit'); S.shake(3, 0.3);
      await S.say('', '（廢墟裡，兩個老鬼揪著對方的衣領，扭打成一團。附近的破瓦一片片飛起。）');
      await S.say('阿水伯', '是你們下郊的人先放火！');
      await S.say('阿旺伯', '放屁！是你們頂郊的人燒了八甲庄！我們整庄都燒光了！');
      await S.say('阿水伯', '那是你們先攻過來！');
      await S.say('阿旺伯', '是你們先搶碼頭！');
      await S.say('xinghe:surprise', '兩位阿伯！停、停一下！');
      await S.say('阿水伯', '少年仔閃開！這是頂郊和下郊的事！');
      await S.say('yungui:think', '頂郊是三邑人，拜龍山寺；下郊是同安人，住八甲庄。為了碼頭生意，械鬥了一場。');
      await S.say('yungui:normal', '輸的同安人，扛著城隍爺，搬到北邊的大稻埕去了。');
      await S.say('阿旺伯', '我們不是輸！是讓！');
      await S.say('阿水伯', '讓到大稻埕去，讓得真遠。');
      await S.say('阿旺伯', '你！');
      await S.say('hongying:think', '……四十年了，你們到底在吵什麼？');
      await S.say('阿水伯', '吵到底是誰先放的火！');
      await S.say('阿旺伯', '他承認了，我就去投胎！');
      await S.say('阿水伯', '他承認了，我也去！');
      await S.say('xinghe:sad', '（……那就是誰都不會走了。）');
      S.quest('q_feud', 0);
      return;
    }
    const ready = F('ch3_feud_clue') && F('ch3_feud_wu') && F('ch3_feud_tea');
    if (!ready) {
      await S.say('阿水伯', '是他先！');
      await S.say('阿旺伯', '是他先！');
      await S.say('xinghe:think', '（得先查清楚那一年的事……問問吳廟公、剝皮寮的老茶店、還有土地公廟前的阿興。）');
      return;
    }
    await S.say('xinghe:serious', '兩位阿伯，跟我們走一趟。有人每年中元都在拜你們。一起拜。');
    await S.say('阿水伯', '……拜我們？誰？');
    await S.fadeOut(0.8);
    await S.warp('bangka_xing', 6, 6, 'up', { fade: 0, stayDark: true });
    S.spawn({ id: 'c3_ashui', sprite: spr('c3_ghost_ashui', 'ghost_m'), x: 5, y: 7, dir: 'up', ghost: true });
    S.spawn({ id: 'c3_awang', sprite: spr('c3_ghost_awang', 'ghost_m'), x: 7, y: 7, dir: 'up', ghost: true });
    S.spawn({ id: 'c3_xing', sprite: 'child_m', x: 6, y: 3, dir: 'up' });
    await S.fadeIn(0.8);
    await S.say('', '（阿興正踮腳，給神桌上兩塊牌位各插一炷香。）');
    await S.say('阿興', '黃阿祖，林阿祖，吃飽未？吃飽了不要打架喔。');
    await S.say('', '（兩個老鬼呆站在門口。）');
    await S.say('阿水伯', '……黃。是我的姓。');
    await S.say('阿旺伯', '……林。是我的。');
    await S.say('阿水伯', '這囝仔……是我的曾孫？');
    await S.say('阿旺伯', '也是我的。');
    let fought = false;
    for (;;) {
      const opts = ['「你們吵了四十年，他只用一炷香，就把你們放在一起。」'];
      if (!fought) opts.push('「到底是誰先放的火？今天說清楚！」');
      opts.push('「算了，讓他們吵吧。」');
      const c = await S.choice(opts);
      const pick = opts[c];
      if (pick.startsWith('「算了')) {
        S.remove('c3_ashui'); S.remove('c3_awang'); S.remove('c3_xing');
        await S.say('', '（兩個老鬼互瞪一眼，一前一後飄回了八甲庄。）');
        return;
      }
      if (pick.startsWith('「到底')) {
        fought = true;
        await S.say('阿水伯', '對！今天說清楚！');
        await S.say('阿旺伯', '來啊！');
        await S.battle('t_c3_feud', { turnLimit: 3, turnLimitResult: 'win', loseOk: true, hpFloor: { c3_ghost_ashui: 0.001, c3_ghost_awang: 0.001 } });
        S.sfx('hit');
        await S.say('阿興', '（被打翻的香灰嚇哭）嗚哇——阿祖打架了——');
        await S.say('', '（兩個老鬼同時僵住。）');
        await S.say('hongying:angry', '……看看你們幹的好事。');
        continue;
      }
      break;
    }
    await S.wait(0.8);
    await S.say('阿水伯', '……我那暝，其實是去八甲庄救人的。我的好朋友住那邊。');
    await S.say('阿旺伯', '……你的好朋友？');
    await S.say('阿水伯', '一個同安人。跟我一起在碼頭扛米扛了十年。火燒起來，我衝進去找他。');
    await S.say('阿水伯', '屋頂塌下來，就……什麼都不知道了。');
    await S.say('阿旺伯', '……那暝，我也在找一個三邑人。在火裡。找到的時候，他被壓在樑下面。');
    await S.say('阿旺伯', '我去拉他。樑太重了。');
    await S.say('阿水伯', '……');
    await S.say('阿旺伯', '……');
    await S.say('阿水伯', '阿旺……是你？');
    await S.say('阿旺伯', '你這個死老水……四十年，你沒認出我？');
    await S.say('阿水伯', '你臉都燒成這樣，認個鬼啊！');
    await S.say('阿旺伯', '你自己還不是！');
    await S.say('', '（兩人抱頭痛哭，又笑。）');
    await S.say('yungui:smile', '（解下葫蘆）兩位，喝一杯？米酒。太虛觀自釀的。');
    await S.say('', '（三個人——兩鬼一道士——在神桌前對飲一杯。）');
    await S.say('阿旺伯', '下輩子，換你做下郊。');
    await S.say('阿水伯', '下輩子，我們做同一條船的。');
    S.sfx('lantern');
    await Promise.all([S.fadeActor('c3_ashui', 0, 1.2), S.fadeActor('c3_awang', 0, 1.2)]);
    S.remove('c3_ashui'); S.remove('c3_awang');
    await S.say('', '（兩人化成兩點光，並肩飄出門外，飄向河口。）');
    S.face('c3_xing', 'down');
    await S.say('阿興', '阿母！阿祖的香，燒得好旺喔！');
    S.remove('c3_xing');
    S.flag('ch3_feud_done');
    S.quest('q_feud', 'done');
    await S.lantern('lantern_feud', '頂下郊的兩個老人');
    if (F('ch3_xiaomei_done')) await S.say('baizhi:sad', '那一年，也是小梅走丟的那一年。……吵架的人，最後都在火裡找朋友。');
    await S.give('c3_sameboat_wine', 1);
  }

  G.Maps.define('bangka', {
    name: '艋舺', place: 'bangka',
    subtitle: (st) => (festival(st) ? '八月十五・中秋夜' : bkDay(st) === 1 ? '八月十五・一府二鹿三艋舺' : '八月十四・河港的黃昏'),
    bgm: bkBgm, start: [7, 19],
    light: bkLight, particles: bkParticles,
    tiles: BK.tiles, deco: BK.deco,
    objects: (st) => {
      const fest = festival(st);
      const o = [
        // row 1 (北街 north side)
        { t: 'shophouse', x: 9, y: 2, v: 0, text: '米行' }, { t: 'shophouse', x: 13, y: 2, v: 2, text: '布莊' }, { t: 'house_minnan', x: 18, y: 2, v: 0, door: -1 },
        { t: 'shophouse', x: 24, y: 2, v: 1, text: '餅店' }, { t: 'shophouse', x: 29, y: 2, v: 3, text: '金紙' }, { t: 'shophouse', x: 33, y: 2, v: 0, text: '茶行' },
        { t: 'house_minnan', x: 38, y: 2, v: 1, door: -1 }, { t: 'house_minnan', x: 44, y: 2, v: 0 }, { t: 'shrine_small', x: 50, y: 3, text: '福德正神' },
        // row 2 (主街 north side)
        { t: 'stall', x: 8, y: 7, text: '碗粿', counter: true }, { t: 'house_minnan', x: 10, y: 7, v: 1 },
        { t: 'shophouse', x: 16, y: 7, v: 1, text: '船頭行' }, { t: 'shophouse', x: 21, y: 7, v: 2, text: '客棧' }, { t: 'shophouse', x: 26, y: 7, v: 3, text: '香舖' },
        { t: 'shophouse', x: 31, y: 7, v: 0, text: '藥鋪' }, { t: 'shophouse', x: 36, y: 7, v: 1, text: '兵器' }, { t: 'house_minnan', x: 41, y: 7, v: 0, door: -1 },
        { t: 'shophouse', x: 47, y: 7, v: 2, text: '當舖' }, { t: 'banner', x: 15, y: 9, color: '#c8402a', text: '船' },
        // row 3 (廟口街 north side) & 青草巷
        { t: 'shophouse', x: 9, y: 12, v: 3, text: '糕餅' }, { t: 'shophouse', x: 13, y: 12, v: 0, text: '漆器' }, { t: 'house_minnan', x: 17, y: 12, v: 1, door: -1 },
        { t: 'shophouse', x: 32, y: 12, v: 2, text: '青草' }, { t: 'herbs_rack', x: 37, y: 12 }, { t: 'basket', x: 37, y: 13, v: 2 }, { t: 'basket', x: 37, y: 14, v: 1 },
        { t: 'shophouse', x: 38, y: 12, v: 1, text: '布行' }, { t: 'signboard', x: 35, y: 15, text: '青草巷' },
        // 龍山寺 & 廟埕
        { t: 'temple', x: 24, y: 13, text: '龍山寺' }, { t: 'statue_lion', x: 24, y: 18 }, { t: 'statue_lion', x: 30, y: 18, flip: true },
        { t: 'incense_burner', x: 27, y: 20 }, { t: 'stone_lantern', x: 22, y: 20 }, { t: 'stone_lantern', x: 32, y: 20 },
        { t: 'pavilion', x: 34, y: 21 }, { t: 'banner', x: 33, y: 21, color: '#d8402a', text: '戲' }, { t: 'banner', x: 37, y: 21, color: '#d8402a', text: '班' },
        { t: 'signboard', x: 38, y: 22, text: '後台', v: 1 },
        { t: 'stall', x: 16, y: 22, text: '文旦', counter: true }, { t: 'stall', x: 19, y: 22, text: '月餅', counter: true }, { t: 'stall', x: 16, y: 26, text: '米粉湯', counter: true },
        { t: 'stall', x: 10, y: 18, text: '長明燈', counter: true, v: 1 },
        { t: 'bench', x: 21, y: 28 }, { t: 'bench', x: 31, y: 28 }, { t: 'well', x: 41, y: 26 },
        // 長明燈 (cold blue) — far more than in 九份
        { t: 'eternal_lamp', x: 7, y: 3 }, { t: 'eternal_lamp', x: 7, y: 17 }, { t: 'eternal_lamp', x: 7, y: 31 }, { t: 'eternal_lamp', x: 13, y: 11 },
        { t: 'eternal_lamp', x: 44, y: 11 }, { t: 'eternal_lamp', x: 21, y: 18 }, { t: 'eternal_lamp', x: 33, y: 18 }, { t: 'eternal_lamp', x: 42, y: 29 }, { t: 'eternal_lamp', x: 25, y: 6 },
        // lanterns
        { t: 'lantern_string', x: 9, y: 10, w: 5, v: fest ? 1 : 0 }, { t: 'lantern_string', x: 17, y: 10, w: 5, v: fest ? 1 : 0 }, { t: 'lantern_string', x: 31, y: 10, w: 6, v: fest ? 1 : 0 },
        { t: 'lantern_string', x: 39, y: 10, w: 5, v: 2 }, { t: 'lantern_string', x: 12, y: 5, w: 5, v: 0 }, { t: 'lantern_string', x: 27, y: 5, w: 5, v: 2 },
        { t: 'lantern_string', x: 33, y: 20, w: 5, v: 1 }, { t: 'lantern_string', x: 15, y: 24, w: 6, v: fest ? 1 : 0 },
        { t: 'red_lantern', x: 15, y: 4, hang: true }, { t: 'red_lantern', x: 26, y: 4, hang: true }, { t: 'red_lantern', x: 17, y: 9, hang: true }, { t: 'red_lantern', x: 23, y: 9, hang: true },
        { t: 'red_lantern', x: 33, y: 9, hang: true }, { t: 'red_lantern', x: 38, y: 9, hang: true }, { t: 'red_lantern', x: 10, y: 14, hang: true }, { t: 'red_lantern', x: 34, y: 14, hang: true },
        // docks & river
        { t: 'boat_ferry', x: 0, y: 21 }, { t: 'boat_small', x: 0, y: 3 }, { t: 'boat_small', x: 2, y: 9 }, { t: 'boat_small', x: 0, y: 14 }, { t: 'boat_small', x: 2, y: 26 },
        { t: 'boat_small', x: 0, y: 29 }, { t: 'boat_small', x: 2, y: 37 },
        { t: 'dock_post', x: 2, y: 6 }, { t: 'dock_post', x: 2, y: 17 }, { t: 'dock_post', x: 2, y: 34 },
        { t: 'crate', x: 8, y: 32 }, { t: 'crate', x: 8, y: 33 }, { t: 'barrel', x: 9, y: 33 }, { t: 'crate', x: 7, y: 12 }, { t: 'barrel', x: 8, y: 13 }, { t: 'crate', x: 8, y: 25 },
        { t: 'barrel', x: 7, y: 26 }, { t: 'cart', x: 11, y: 16 }, { t: 'jar', x: 9, y: 9 }, { t: 'basket', x: 14, y: 9, v: 0 },
        { t: 'signboard', x: 7, y: 21, text: '中渡頭' }, { t: 'signboard', x: 7, y: 7, text: '北渡頭' }, { t: 'signboard', x: 7, y: 35, text: '南渡頭' },
        // south quarter & city wall
        { t: 'house_minnan', x: 9, y: 36, v: 1, door: -1 }, { t: 'house_minnan', x: 15, y: 36, v: 0, door: -1 }, { t: 'house_minnan', x: 31, y: 36, v: 0, door: -1 },
        { t: 'house_minnan', x: 38, y: 36, v: 1, door: -1 }, { t: 'laundry', x: 20, y: 36 }, { t: 'well', x: 23, y: 37 },
        { t: 'city_wall', x: 7, y: 42, w: 19, v: 1 }, { t: 'gate_city', x: 26, y: 42, text: '南門' }, { t: 'city_wall', x: 29, y: 42, w: 27, v: 1 },
        // 八甲庄 ruins
        { t: 'grave', x: 50, y: 30, v: 2 }, { t: 'bones', x: 48, y: 31 }, { t: 'stump', x: 51, y: 28 }, { t: 'rock_small', x: 45, y: 26 },
      ];
      if (fest) o.push({ t: 'sky_lantern', x: 20, y: 16 }, { t: 'sky_lantern', x: 33, y: 26 }, { t: 'sky_lantern', x: 40, y: 19 }, { t: 'sky_lantern', x: 12, y: 27 },
        { t: 'lantern_string', x: 23, y: 26, w: 6, v: 1 }, { t: 'lantern_string', x: 30, y: 30, w: 6, v: 1 });
      return o;
    },
    chests: [{ id: 'c3_09', x: 7, y: 33, item: 'jiedu', n: 3 }],
    npcs: [
      { id: 'bk_ferry', sprite: 'boatman', name: '阿海伯', x: 4, y: 19, dir: 'right', talk: async (S) => { await S.say('阿海伯', '欲去佗位？'); await ferryMenu(S, 'bangka'); } },
      { id: 'bk_alian', sprite: 'widow', portrait: 'alian', name: '阿蓮', x: 8, y: 6, dir: 'down', if: (st) => !(st.flags.ch3_alian_3 && !st.flags.ch3_alian_done), talk: alianTalk },
      { id: 'bk_alian_wait', sprite: 'widow', portrait: 'alian', name: '阿蓮', x: 10, y: 1, dir: 'down', if: (st) => st.flags.ch3_alian_3 && !st.flags.ch3_alian_done,
        talk: async (S) => {
          if (!bkNight()) { await S.say('alian:sad', '天暗了再去。……他只有暗時才出來。'); return; }
          await S.say('alian:serious', '……走吧。');
          await S.fadeOut(0.8);
          await S.warp('bangka_riverbank', 6, 9, 'left', { fade: 0, stayDark: true });
        } },
      { id: 'bk_lampseller', sprite: 'merchant', name: '阿標', x: 10, y: 17, dir: 'down',
        talk: async (S) => {
          if (F('ch3_alian_done')) { await S.say('阿標', '欸，你們是不是去動了北邊那盞燈？法師會知道的。'); return; }
          await S.say('阿標', '長明燈，保平安、鎮亡魂！艋舺家家戶戶都掛，你們外地來的也買一盞吧！');
          await S.say('阿標', '玄冥法師說了：亡者最怕被遺忘。點一盞長明燈，他們就永遠在你身邊。');
          if (inParty('yungui')) await S.say('yungui:think', '永遠在你身邊……這話怎麼聽，都像一句咒。');
        } },
      { id: 'bk_boatman2', sprite: 'villager_m', name: '船夫', x: 6, y: 9, dir: 'down', wander: 1,
        talk: async (S) => {
          if (F('ch3_alian_1') && !F('ch3_alian_done')) { await S.say('船夫', '舊渡頭暗時有人從水裡把落水的人推上岸。救了三四個了。不是人，是鬼。好鬼。'); return; }
          await S.say('船夫', '艋舺的船，一天進出上百艘。米、糖、樟腦出去；布、磚、杉木回來。');
        } },
      { id: 'bk_dockhand', sprite: 'villager_m2', name: '大頭', x: 18, y: 10, dir: 'down',
        talk: ['艋舺的船頭行，載米、載糖、載樟腦出去，載布、載磚、載杉木回來。', '剝皮寮知道吧？福州杉運來，就在那裡剝樹皮。所以叫剝皮寮——不是剝人皮啦！'] },
      { id: 'bk_scholar', sprite: 'scholar', name: '林夫子', x: 31, y: 25, dir: 'down',
        talk: async (S) => {
          await S.say('林夫子', '「艋舺」二字，原是凱達格蘭人的話，說的是獨木舟。');
          await S.say('林夫子', '從前他們划著獨木舟，來這河邊和人交易番薯。後來漢人的大船也來了，才有今日的熱鬧。');
          await S.say('林夫子', '「一府二鹿三艋舺」——府城第一，鹿港第二，就是咱艋舺第三。');
          if (F('ch3_feud_done')) await S.say('林夫子', '聽說八甲庄那邊，暗時不再吵了。四十年了啊。');
        } },
      { id: 'bk_wendan', sprite: 'villager_f2', name: '賣文旦的阿姐', x: 16, y: 21, dir: 'down',
        talk: async (S) => {
          await S.say('賣文旦的阿姐', '中秋吃文旦，團團圓圓！一顆十文。');
          if (inParty('baizhi') && !F('ch3_wendan_bz')) {
            S.flag('ch3_wendan_bz');
            await S.say('baizhi:think', '為什麼團圓要吃圓的東西？');
            await S.say('賣文旦的阿姐', '啊……因為……月娘也是圓的？');
          }
          await S.shop(['c3_wendan'], { title: '文旦攤' });
        } },
      { id: 'bk_mooncake', sprite: 'shopkeeper_f', name: '餅店頭家娘', x: 19, y: 21, dir: 'down',
        talk: async (S) => { await S.say('餅店頭家娘', '月餅！今年的綠豆椪，餡料包得滿滿！'); await S.shop(['c3_mooncake'], { title: '月餅攤' }); } },
      { id: 'bk_mifen', sprite: 'villager_m', name: '米粉湯阿伯', x: 16, y: 25, dir: 'down',
        talk: async (S) => { await S.say('米粉湯阿伯', '米粉湯配黑白切，艋舺人的早頓！暗頓也可以啦！'); await S.shop(['mifentang', 'c3_wanguo'], { title: '米粉湯攤' }); } },
      { id: 'bk_kid1', sprite: 'child_m', name: '囝仔', x: 22, y: 25, dir: 'down', wander: 2,
        talk: async (S) => {
          await S.say('囝仔', '月娘月娘，莫用手指伊，會被割耳朵！');
          if (F('ch3_kids_once') && !F('ch3_kids_twice') && inParty('baizhi')) {
            S.flag('ch3_kids_twice');
            await S.say('xinghe:normal', '……');
            await S.say('', '（星河偷偷把手放下。）');
            await S.say('baizhi:normal', '星河，你剛剛指了。');
            await S.say('xinghe:surprise', '我沒有！');
          }
          S.flag('ch3_kids_once');
        } },
      { id: 'bk_kid2', sprite: 'child_f', name: '囡仔', x: 24, y: 27, dir: 'left', wander: 2, talk: ['中秋暗時要關椅仔姑……阿母說今年不准玩了。', '戲棚那邊，聽講花旦姊姊生病了。'] },
      { id: 'bk_kid3', sprite: 'child_m', name: '囝仔', x: 20, y: 29, dir: 'up', wander: 2, talk: ['我們在玩「抓長明燈」！誰抓到燈誰當鬼！……咦，燈怎麼是冷的？'] },
      { id: 'bk_storyteller', sprite: 'storyteller', name: '講古仙', x: 25, y: 24, dir: 'down',
        talk: ['來來來，聽古！話說艋舺頭一回熱鬧起來，是因為河邊來了一艘獨木舟……', '頂郊、下郊拚那年，火燒了好幾暝。活著的人都和好了，死的人哪……', '欲聽下文？明仔暗擱來！'] },
      { id: 'bk_pilgrim', sprite: 'pilgrim', name: '香客', x: 23, y: 21, dir: 'up', talk: ['觀音媽很靈的。我每年中秋都從大稻埕走過來拜。'] },
      { id: 'bk_monk', sprite: 'monk', name: '雲遊僧', x: 29, y: 22, dir: 'down', wander: 1, talk: ['龍山寺的石材，多是對岸觀音山來的。觀音的石頭，供觀音。善哉。'] },
      { id: 'bk_fishwife', sprite: 'fisher_f', name: '賣魚的阿嫂', x: 8, y: 27, dir: 'right', wander: 1, talk: ['新店溪的魚，淡水河的蝦，攏總新鮮！', '暗時莫去北邊的舊渡頭，那裡有物件。'] },
      { id: 'bk_porter', sprite: 'villager_m2', name: '挑夫', x: 6, y: 13, dir: 'down', wander: 2, talk: ['嘿咻！這擔是杉木，要送去剝皮寮！'] },
      { id: 'bk_oldman', sprite: 'old_m', name: '下棋的阿伯', x: 12, y: 29, dir: 'right', talk: ['將軍！……欸，你們擋到我的光了。'] },
      { id: 'bk_oldwoman', sprite: 'old_f', name: '搖扇的阿婆', x: 30, y: 29, dir: 'up', talk: ['今年的戲，是《山伯英台》。老身看了五十年，每年都哭。'] },
      { id: 'bk_noble', sprite: 'noble_m', name: '郊商', x: 40, y: 11, dir: 'left', wander: 2, talk: ['我是頂郊的郊商。這幾年生意好做多了——吵吵鬧鬧的，誰都賺不到錢。'] },
      { id: 'bk_teagirl', sprite: 'tea_girl', name: '賣茶的姑娘', x: 34, y: 6, dir: 'down', talk: ['烏龍茶，來一杯！從石碇挑下來的！'] },
      { id: 'bk_watch', sprite: 'villager_m', name: '更夫', x: 28, y: 11, dir: 'left', wander: 3, light: { r: 120, color: '#ffb060' }, if: (st) => bkNight(st) && st.flags.ch3_theatre,
        talk: ['天乾物燥，小心火燭——', '這幾年暗時巡更，總覺得長明燈底下，有人在看我。'] },
      { id: 'bk_dog', sprite: 'dog', name: '阿黃', x: 20, y: 31, dir: 'left', wander: 3, talk: ['汪！'] },
      { id: 'bk_cat', sprite: 'cat', name: '貓', x: 8, y: 23, dir: 'down', wander: 1, talk: ['喵——（牠盯著芋圓，尾巴豎得筆直。芋圓連看都不看牠一眼。）'] },
      { id: 'bk_chicken', sprite: 'chicken', name: '雞', x: 14, y: 40, dir: 'right', wander: 2, talk: ['咕咕咕。'] },
      { id: 'bk_herbman', sprite: 'old_m', name: '青草阿伯', x: 36, y: 13, dir: 'down',
        talk: async (S) => {
          if (F('ch3_yungui_join') && !F('ch3_mush_start')) {
            S.flag('ch3_mush_start');
            await S.say('青草阿伯', '道長，你也是吃蕈的？那你聽過「七仙蕈」沒有？');
            await S.say('yungui:surprise', '（眼睛第一次完全睜開）……七仙蕈。只在古書殘頁上見過。');
            await S.say('青草阿伯', '台灣頭到台灣尾，七個所在，各長一種。七種都吃過的人——');
            await S.say('yungui:surprise', '會怎樣？會怎樣？');
            await S.say('青草阿伯', '會看見世上所有的顏色。……也有人說，從此不會再餓。');
            if (F('yuyuan_joined')) { S.emote('yuyuan', '!'); await S.say('', '（「不會再餓」四個字一出口，芋圓的耳朵豎了起來。）'); }
            await S.say('yungui:serious', '星河。我找到了我的道。');
            await S.say('xinghe:think', '你的道是吃。');
            await S.say('yungui:serious', '吃就是道。');
            await S.say('青草阿伯', '第一種，叫杉皮蕈，長在福州杉的老皮上。月光一照會發光。剝皮寮後面，杉木堆得像山。');
            S.quest('q_tuanzi_mush', 1);
            await S.say('', '（雲歸蕈譜的第一頁，出現了七個空格。）');
            return;
          }
          await S.say('青草阿伯', '青草茶，退火！你們這些少年人，火氣大。尤其你。');
          if (inParty('hongying') && !F('ch3_herb_hy')) { S.flag('ch3_herb_hy'); await S.say('hongying:angry', '誰火氣大！'); }
          await S.say('青草阿伯', '青草巷就在龍山寺邊仔。拜完觀音，順便喝一杯，身心都清。');
          await S.shop(['c3_herbtea', 'jinchuang', 'c3_qingxinlu', 'c3_ningshen', 'jiedu', 'huanhunxiang', 'lingxun'], { title: '青草巷' });
        } },
      { id: 'bk_xing', sprite: 'child_m', name: '阿興', x: 49, y: 5, dir: 'down', wander: 1,
        talk: async (S) => {
          if (F('ch3_feud_1') && !F('ch3_feud_done')) {
            await S.say('阿興', '我阿母說，中元要拜兩個阿祖。一個姓黃，一個姓林。');
            await S.say('xinghe:think', '兩個阿祖？');
            await S.say('阿興', '對啊，黃阿祖是阿母那邊的，林阿祖是阿爸那邊的。阿母說，以前兩邊的人會打架。');
            await S.say('阿興', '可是現在都在我們家的神桌上，一起吃拜拜。');
            S.flag('ch3_feud_xing');
            if (!F('ch3_feud_clue')) await S.say('xinghe:think', '（去阿興家問問他阿母吧。）');
            return;
          }
          await S.say('阿興', '土地公伯仔，保佑我考第一名！……還有保佑阿母的病快點好。');
        } },
      { id: 'bk_ashui', sprite: spr('c3_ghost_ashui', 'ghost_m'), name: '阿水伯', x: 47, y: 28, dir: 'right', ghost: true, if: (st) => bkNight(st) && !st.flags.ch3_feud_done && st.flags.ch3_bangka_arrive, talk: feudTalk },
      { id: 'bk_awang', sprite: spr('c3_ghost_awang', 'ghost_m'), name: '阿旺伯', x: 48, y: 28, dir: 'left', ghost: true, if: (st) => bkNight(st) && !st.flags.ch3_feud_done && st.flags.ch3_bangka_arrive, talk: feudTalk },
      // festival crowd (中秋夜)
      { id: 'bk_f1', sprite: 'villager_f', name: '看戲的阿嫂', x: 33, y: 26, dir: 'up', if: festival, talk: ['今年的英台，聲音好嫩！像十歲的囡仔！'] },
      { id: 'bk_f2', sprite: 'villager_m', name: '看戲的阿兄', x: 36, y: 27, dir: 'up', if: festival, talk: ['好！好！（拍手）'] },
      { id: 'bk_f3', sprite: 'old_f', name: '看戲的阿嬤', x: 38, y: 27, dir: 'up', if: festival, talk: ['山伯英台……唉，有情人哪。'] },
      { id: 'bk_f4', sprite: 'child_f', name: '提燈的囡仔', x: 28, y: 26, dir: 'down', wander: 2, if: festival, light: { r: 90, color: '#ffb060' }, talk: ['我的燈籠是兔子形的！'] },
      { id: 'bk_f5', sprite: 'villager_m2', name: '吃月餅的阿伯', x: 20, y: 24, dir: 'down', if: festival, talk: ['一口月餅一口茶，人生好命啊。'] },
      { id: 'bk_f6', sprite: 'villager_f2', name: '賞月的姑娘', x: 25, y: 29, dir: 'up', wander: 1, if: festival, talk: ['月娘好圓……我阿兄在唐山，不知道他看得到同一個月娘沒有。'] },
    ],
    events: [
      { id: 'bk_arrive', trigger: 'auto', if: (st) => !st.flags.ch3_bangka_arrive, run: bkArrive },
      { id: 'bk_north', trigger: 'touch', x: 8, y: 0, w: 2, h: 1, run: async (S) => {
        if (!F('ch3_alian_1')) { await S.say('', '北邊的小路通往舊渡頭。天色、人聲都遠了。……現在沒有理由去那裡。'); await S.move('player', 'D'); return; }
        if (!bkNight()) { await S.say('baizhi:think', '白天的舊渡頭……阿德不會出來。等天暗再去吧。'); await S.move('player', 'D'); return; }
        await S.warp('bangka_riverbank', 34, 7, 'left');
      } },
      { id: 'bk_south', trigger: 'touch', x: 27, y: 43, run: async (S) => {
        if (!F('ch3_letter')) { await S.say('', '南門外，是往竹塹的海線大路。……現在還不是出發的時候。'); await S.move('player', 'U'); return; }
        await bkDepart(S);
      } },
      { id: 'bk_backstage', trigger: 'touch', x: 38, y: 23, if: (st) => !st.flags.ch3_temple_met, run: async (S) => {
        await S.say('', '戲班的人在後台忙進忙出。「閒人勿進！」'); await S.move('player', 'D');
      } },
      { id: 'bk_show', trigger: 'auto', if: (st) => festival(st) && st.flags.ch3_theatre && !st.flags.ch3_show_done, run: bkShow },
      { id: 'bk_shrine', trigger: 'action', x: 50, y: 4, w: 2, h: 1, label: '參拜', run: async (S) => { await S.say('', '小小的土地公廟，香火很旺。供桌上擺著一盤月餅。'); } },
      { id: 'bk_lions', trigger: 'action', x: 24, y: 18, label: '調查', run: async (S) => { await S.say('', '龍山寺前的石獅，用的是觀音山石。摸起來冰冰涼涼的。'); } },
      { id: 'bk_burner', trigger: 'action', x: 27, y: 20, label: '調查', run: async (S) => { await S.say('', '天公爐裡香煙不斷。艋舺人來來去去，都會停下來拜一拜。'); } },
      { id: 'bk_ruins', trigger: 'action', x: 46, y: 24, w: 2, h: 1, label: '調查', run: async (S) => { await S.say('', '燒焦的紅磚牆。四十年前，八甲庄在一夜之間燒成了灰。'); } },
    ],
    warps: [
      { x: 12, y: 9, to: 'bangka_alian', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 22, y: 9, to: 'bangka_inn', tx: 6, ty: 8, tdir: 'up', door: true },
      { x: 32, y: 9, to: 'bangka_herb', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 37, y: 9, to: 'bangka_armory', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 46, y: 4, to: 'bangka_xing', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 27, y: 17, to: 'bangka_longshan', tx: 13, ty: 19, tdir: 'up', door: true },
      { x: 38, y: 23, to: 'bangka_theatre', tx: 9, ty: 10, tdir: 'up', door: true, if: (st) => !!st.flags.ch3_temple_met },
      { x: 55, y: 10, h: 2, to: 'bangka_bopiliao', tx: 1, ty: 9, tdir: 'right' },
    ],
    drawOver: (ctx, t, m) => {
      if (!festival(G.state)) return;
      // the full moon, fixed in the sky (screen space, top right)
      ctx.save(); ctx.translate(m.cam.x, m.cam.y);
      const x = G.W - 170, y = 120;
      const g = ctx.createRadialGradient(x, y, 20, x, y, 200);
      g.addColorStop(0, 'rgba(255,250,225,0.5)'); g.addColorStop(1, 'rgba(255,250,225,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 200, y - 200, 400, 400);
      ctx.fillStyle = 'rgba(255,248,220,0.95)';
      ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(220,210,180,0.35)';
      ctx.beginPath(); ctx.arc(x - 12, y - 8, 10, 0, Math.PI * 2); ctx.arc(x + 14, y + 10, 7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
  });

  // ------------------------------------------------------------------ 龍山寺 bangka_longshan (28×22)
  const lsLight = (st) => (bkDay(st) === 1 ? { ambient: 0.06, color: '#302830' } : bkDay(st) === 2 ? { ambient: 0.45, color: '#0a0c22', playerR: 210 } : { ambient: st.flags.ch3_theatre ? 0.5 : 0.25, color: '#2a1408', tint: 'rgba(255,160,90,0.15)', playerR: 200 });
  async function templeMeet(S) { // 3-11
    S.flag('ch3_temple_met');
    S.setPos('player', 13, 14, 'up'); S.setPos('yungui', 14, 13, 'up'); S.setPos('baizhi', 12, 15, 'up'); S.setPos('hongying', 14, 15, 'up'); S.setPos('yuyuan', 13, 15, 'up'); S.setPos('mochi', 12, 16, 'up');
    for (const f of G.mapScene.followers) f.scripted = true;
    S.setPos('bk_temple', 13, 11, 'down');
    await S.camera(13, 11, 0.6);
    await S.say('', '（龍山寺中庭。香煙裊裊。銅龍柱在夕光裡發亮。吳廟公在掃地。）');
    S.emote('bk_temple', '!');
    await S.say('吳廟公', '這不是雲歸嗎？你這囝仔，終於捨得下山了？');
    await S.say('yungui:smile', '吳伯。師父這個月的信？');
    await S.say('吳廟公', '……');
    await S.say('吳廟公', '有一封。半個月前，一個生面孔送來的。可是信封上寫——');
    await S.say('吳廟公', '「若雲歸來問，先讓他看看艋舺的燈。」');
    await S.say('yungui:think', '……看燈？');
    await S.say('吳廟公', '你師父那個人，講話從來不直接。總之，信我先替你收著。');
    await S.say('吳廟公', '而且……這幾天，艋舺不太平靜。');
    await S.say('吳廟公', '明暗是中秋，戲班要在廟埕演給觀音媽看。可是當家花旦秀蘭，昨暗忽然起肖。');
    await S.say('吳廟公', '坐在一張竹椅上，不吃不睡，用囝仔的聲音講話，敲著椅子……');
    await S.say('baizhi:think', '敲椅子？');
    await S.say('吳廟公', '還有北邊的阿蓮，夜夜夢見死去的翁婿喊冷；廟裡有個囝仔的哭聲，只有黃昏聽得到；');
    await S.say('吳廟公', '八甲庄那邊，兩個四十年前的老鬼，到今仔日還在相拍。');
    await S.say('xinghe:surprise', '四十年還在打？！');
    await S.say('吳廟公', '頂郊和下郊拚的那一年，死了很多人。活人都和好了，死人倒是還記著。');
    await S.say('yungui:serious', '師父要我「看看艋舺的燈」。……吳伯，戲班在哪？');
    await S.say('吳廟公', '你們肯幫忙？好！戲棚後台，找洪班主。戲演完，信就給你。');
    await S.say('yungui:smug', '老狐狸。');
    await S.say('吳廟公', '彼此彼此。');
    const c = await S.choice(['擲筊', '先不用']);
    if (c === 0) {
      await mv(S, 'yungui', 'UUUUU'); S.face('yungui', 'up');
      await S.say('yungui:serious', '（跪在觀音前，雙手捧筊）觀音媽在上。弟子雲歸，請問我師父清虛……還活著嗎？');
      await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['sheng'], prompt: '「我師父清虛……還活著嗎？」' });
      S.sfx('push');
      await S.say('吳廟公', '聖筊。觀音媽講：是。');
      await S.say('yungui:smile', '（鬆一口氣）……再請問。他……平安嗎？');
      await G.Mini.jiaobei({ title: '擲筊', throws: 1, results: ['yin'], prompt: '「他……平安嗎？」' });
      S.sfx('push'); S.sfx('wind', 0.3);
      await S.say('', '（靜默。香煙忽然往一邊斜去，然後又直了。）');
      await S.say('吳廟公', '……陰筊。');
      await S.say('baizhi:think', '陰筊是什麼？');
      await S.say('吳廟公', '一正一反是聖筊，表示同意；兩面都平的朝上是笑筊，神明笑而不答；兩面都凸是陰筊——不是。');
      await S.say('yungui:normal', '（站起，拍拍膝蓋）活著，就好。剩下的，我去把他帶回來就平安了。');
      await S.say('hongying:normal', '（拍他的背）嗯。');
      S.flag('ch3_jiaobei');
      await mv(S, 'yungui', 'DDDDD');
    }
    S.quest('q_ch3_main', 4);
    S.objective(mainObj());
    S.toast('艋舺有幾件放不下的事：阿蓮、廟裡的哭聲、八甲庄的老鬼。', 'scroll');
  }
  async function xiaomeiReunion(S) { // 4-3 step 3
    S.flag('ch3_chunpo_wait', false);
    const cp = S.spawn({ id: 'c3_chunpo', sprite: 'old_f', x: 12, y: 18, dir: 'up' }); void cp;
    S.setPos('player', 13, 18, 'up');
    await S.camera(11, 16, 0.4);
    await S.move('c3_chunpo', 'UU'); S.face('c3_chunpo', 'left');
    await S.say('小梅', '（看著春婆）……這個阿婆是誰？');
    await S.say('xinghe:surprise', '她是妳阿母啊！');
    await S.say('小梅', '才不是！阿母很年輕、很漂亮！這是老阿婆！');
    await S.say('hongying:sad', '……四十年了啊。');
    await S.say('baizhi:think', '（對春婆）婆婆，可以唱那首歌嗎？在這裡。');
    await S.say('春婆', '歌？……（閉上眼，輕聲唱）');
    S.sfx('sing');
    await S.say('春婆', '「嬰仔嬰嬰睏，一暝大一寸；嬰仔嬰嬰惜，一暝大一尺……」');
    await S.move('ls_xiaomei', 'R', { speed: 1.2 });
    await S.say('', '（小梅愣住了。慢慢走近，把臉埋進春婆的衣角——春婆看不見，只覺得衣角一沉。）');
    await S.say('小梅', '……是阿母的聲音。是阿母的味道。');
    await S.say('小梅', '阿母，妳變老了……妳等我等到變老了……');
    S.sfx('bell'); S.flash('#ffe0a0', 0.8, 0.4);
    await S.say('', '（正殿內，觀音前的油燈忽然亮了一倍。香煙緩緩飄下，在春婆與小梅之間繞了一圈。）');
    await S.say('', '（春婆睜開眼。在香煙裡，她看見了一個七歲的小女孩。）');
    await S.say('春婆', '……小梅？小梅！');
    await S.say('小梅', '阿母！我有乖乖等！');
    await S.say('春婆', '好、好……妳最乖了……是阿母太慢了……阿母買到糖了……');
    await S.say('', '（春婆從懷裡掏出一小塊用油紙包著的麥芽糖——她每天都帶著。）');
    await S.say('小梅', '（接過，糖在她手裡化成一點光）……甜的。');
    await S.say('小梅', '阿母，我不等了。我先去那邊。妳慢慢來，不用跑。');
    S.sfx('lantern');
    await S.move('ls_xiaomei', 'UUU', { speed: 1.2, wait: false });
    await S.fadeActor('ls_xiaomei', 0, 1.4);
    S.flag('ch3_xiaomei_done');
    S.remove('ls_xiaomei');
    await S.say('', '（小梅化成光，飄向正殿，消失在觀音前的燈火裡。）');
    S.face('c3_chunpo', 'up');
    await S.say('春婆', '（對著觀音，雙手合十，深深一拜）……多謝觀音媽。');
    S.quest('q_xiaomei', 'done');
    await S.lantern('lantern_xiaomei', '小梅與母親');
    await S.say('baizhi:think', '星河……剛才那盞燈，是自己亮起來的嗎？');
    if (G.mapScene.npcs.some((n) => n.id === 'bk_temple')) { S.emote('bk_temple', '♪'); await S.say('', '（吳廟公只是笑，繼續掃地。）'); }
    await S.give('c3_ac_magnolia', 1);
    await S.say('春婆', '這個香囊，給姑娘。……玉蘭花的味道，小梅最喜歡。');
    S.remove('c3_chunpo');
    S.cameraFollow();
  }
  G.Maps.define('bangka_longshan', {
    name: '艋舺龍山寺', subtitle: '觀音媽的廟', place: 'bangka',
    bgm: 'temple', start: [13, 19],
    light: lsLight,
    particles: (st) => (bkDay(st) === 2 ? ['lanterns'] : ['dust']),
    tiles: (() => {
      const g = grid(28, 22, 'T');
      fill(g, 0, 0, 28, 2, 'E'); fill(g, 0, 0, 1, 22, 'E'); fill(g, 27, 0, 1, 22, 'E'); fill(g, 0, 21, 28, 1, 'E'); fill(g, 13, 21, 2, 1, 'T');
      fill(g, 6, 10, 16, 9, '%'); fill(g, 12, 3, 4, 6, 'c');
      return rows(g);
    })(),
    objects: [
      { t: 'altar', x: 5, y: 2 }, { t: 'altar', x: 13, y: 2 }, { t: 'altar', x: 21, y: 2 },
      { t: 'mural', x: 2, y: 1, v: 0 }, { t: 'mural', x: 9, y: 1, v: 4 }, { t: 'mural', x: 17, y: 1, v: 4 }, { t: 'mural', x: 24, y: 1, v: 0 },
      { t: 'pillar', x: 4, y: 4 }, { t: 'pillar', x: 9, y: 4 }, { t: 'pillar', x: 18, y: 4 }, { t: 'pillar', x: 23, y: 4 },
      { t: 'altar', x: 13, y: 6 }, { t: 'brazier', x: 11, y: 6 }, { t: 'brazier', x: 16, y: 6 }, { t: 'red_lantern', x: 10, y: 5 }, { t: 'red_lantern', x: 17, y: 5 },
      { t: 'divination_blocks', x: 11, y: 8 }, { t: 'fortune_sticks', x: 16, y: 8 },
      { t: 'incense_burner', x: 13, y: 13 },
      { t: 'pillar', x: 9, y: 17 }, { t: 'pillar', x: 18, y: 17 },
      { t: 'stone_lantern', x: 3, y: 7 }, { t: 'stone_lantern', x: 3, y: 11 }, { t: 'stone_lantern', x: 3, y: 15 },
      { t: 'stone_lantern', x: 24, y: 7 }, { t: 'stone_lantern', x: 24, y: 11 }, { t: 'stone_lantern', x: 24, y: 15 },
      { t: 'plant_pot', x: 6, y: 19, v: 1 }, { t: 'plant_pot', x: 21, y: 19, v: 1 }, { t: 'bell', x: 2, y: 3 }, { t: 'drum', x: 25, y: 3 },
    ],
    lights: [{ x: 13, y: 13, r: 150, color: '#ffc080', flicker: 0.2 }, { x: 13, y: 7, r: 220, color: '#ffb060', flicker: 0.15 }],
    npcs: [
      { id: 'bk_temple', sprite: 'temple_keeper', name: '吳廟公', x: 12, y: 11, dir: 'down', wander: 1,
        talk: async (S) => {
          if (F('ch3_feud_1') && !F('ch3_feud_wu') && !F('ch3_feud_done')) {
            S.flag('ch3_feud_wu');
            await S.say('吳廟公', '誰先放火？（搖頭）那暝火是從好幾個所在一齊燒起來的。四十年來，沒人說得清。');
            feudCheck(S);
            return;
          }
          if (F('ch3_show_done')) { await S.say('吳廟公', '月娘真圓。你們這一趟，做了不少好事。'); return; }
          await S.say('吳廟公', '觀音媽慈悲，有事慢慢講。');
          if (F('ch3_temple_met') && !F('ch3_theatre')) await S.say('吳廟公', '戲棚就在廟埕東邊。後台找洪班主。');
        } },
      { id: 'ls_xiaomei', sprite: spr('c3_ghost_xiaomei', 'ghost_child'), name: '小梅', x: 10, y: 16, dir: 'down', ghost: true,
        if: (st) => bkNight(st) && st.flags.ch3_bangka_arrive && !st.flags.ch3_xiaomei_done,
        talk: async (S) => {
          if (!F('ch3_xiaomei_1')) {
            S.flag('ch3_xiaomei_1');
            await S.say('小梅', '嗚……阿母……');
            await S.say('xinghe:think', '小妹妹，妳怎麼了？');
            await S.say('小梅', '哥哥看得見我？……阿母叫我在這裡等她。她去買麥芽糖。');
            await S.say('小梅', '可是外面好吵，好多人在跑，有火……阿母一直沒有回來。');
            await S.say('小梅', '我等好久好久了。');
            if (inParty('yungui')) await S.say('yungui:serious', '（低聲）……外面有火、好多人在跑。是四十年前，頂下郊拚那一年。');
            await S.say('hongying:sad', '這孩子……在這裡等了四十年。');
            await S.say('baizhi:smile', '小梅，妳阿母長什麼樣子？');
            await S.say('小梅', '阿母好漂亮！頭髮上插一朵玉蘭花，香香的。');
            await S.say('小梅', '她睡覺前都唱：「嬰仔嬰嬰睏，一暝大一寸……」');
            S.quest('q_xiaomei', 0);
            S.objective('找一位頭插玉蘭花、會唱搖囝仔歌的母親');
            return;
          }
          await S.say('小梅', '阿母說，她很快就回來……');
        } },
    ],
    events: [
      { id: 'ls_meet', trigger: 'auto', if: (st) => st.flags.ch3_yungui_join && !st.flags.ch3_temple_met, run: templeMeet },
      { id: 'ls_reunion', trigger: 'auto', if: (st) => st.flags.ch3_chunpo_wait && bkNight(st) && !st.flags.ch3_xiaomei_done, run: xiaomeiReunion },
      { id: 'ls_dragon', trigger: 'action', x: 9, y: 17, label: '調查', run: async (S) => {
        await S.say('', '銅鑄的龍柱。一條龍盤著柱子往上游，鱗片被香客摸得發亮。');
        await S.say('', '龍山寺的匠人說，這是全台灣唯一的一對銅龍柱。');
      } },
      { id: 'ls_dragon2', trigger: 'action', x: 18, y: 17, label: '調查', run: async (S) => { await S.say('', '另一根銅龍柱。龍嘴裡含著一顆珠子，轉不動，卻像隨時會掉下來。'); } },
      { id: 'ls_mazu', trigger: 'action', x: 5, y: 2, w: 2, h: 1, label: '參拜', run: async (S) => { await S.say('', '後殿供奉著媽祖。討海人出海前，都會來這裡上一炷香。'); } },
      { id: 'ls_wenchang', trigger: 'action', x: 13, y: 2, w: 2, h: 1, label: '參拜', run: async (S) => { await S.say('', '後殿供奉著文昌帝君。供桌上擺著一排毛筆和蔥——「聰明」的意思。'); } },
      { id: 'ls_guan', trigger: 'action', x: 21, y: 2, w: 2, h: 1, label: '參拜', run: async (S) => { await S.say('', '後殿供奉著關聖帝君。燭火映著紅色的帳幔，莊嚴肅穆。'); } },
      { id: 'ls_guanyin', trigger: 'action', x: 13, y: 6, w: 2, h: 1, label: '參拜', run: async (S) => {
        await S.say('', '正殿供奉著觀音。神龕前的油燈，安安靜靜地亮著。');
        await S.say('', '星河雙手合十，拜了三拜。');
      } },
      { id: 'ls_burner', trigger: 'action', x: 13, y: 13, label: '調查', run: async (S) => { await S.say('', '中庭的大香爐。爐裡的香灰，是一年一年的心願堆起來的。'); } },
      { id: 'ls_moon', trigger: 'action', x: 13, y: 8, w: 2, h: 1, label: '賞月', if: (st) => st.flags.ch3_letter && !st.flags.ch3_moon, run: bkMoon },
    ],
    warps: [{ x: 13, y: 21, w: 2, to: 'bangka', tx: 27, ty: 18, tdir: 'down', door: true }],
  });

  // ------------------------------------------------------------------ 戲棚後台 bangka_theatre (18×12)
  async function yizigu(S) { // 3-12
    S.setPos('player', 9, 8, 'up'); S.setPos('baizhi', 8, 9, 'up'); S.setPos('hongying', 10, 9, 'up'); S.setPos('yungui', 7, 8, 'up'); S.setPos('yuyuan', 11, 8, 'up'); S.setPos('mochi', 7, 9, 'up');
    for (const f of G.mapScene.followers) f.scripted = true;
    await S.camera(9, 6, 0.4);
    await S.say('', '（後台。油燈晃。花旦秀蘭坐在一張竹椅上，濃妝未卸，身體筆直得不自然。手指一下一下敲著椅背。）');
    S.sfx('push'); await S.wait(0.4); S.sfx('push'); await S.wait(0.4); S.sfx('push');
    await S.say('', '叩、叩、叩。');
    await S.say('洪班主', '你們是廟公介紹來的？救命啊……明暗就要演了！');
    await S.say('秀蘭（椅仔姑）', '（少女的聲音）月娘還沒圓。還沒圓。還沒圓。');
    await S.say('xinghe:surprise', '……這聲音不是大人的。');
    await S.say('阿桃', '是、是我們害的……昨暗我們在後台玩「關椅仔姑」……');
    await S.say('阿杏', '就是把竹椅穿上衣服，兩個人扶著，唱歌請椅仔姑來坐，問她問題……');
    await S.say('阿杏', '以前都只是椅子會敲一下而已！可是昨暗，秀蘭姊姊剛好坐上那張椅子……');
    await S.say('yungui:think', '中秋前後請椅仔姑。囡仔的遊戲，民間很常見。');
    await S.say('baizhi:think', '椅仔姑是誰？');
    await S.say('洪班主', '傳說是一個小姑娘，被兄嫂苛待，常被綁在竹椅上，沒得吃……後來就餓死在椅子上。');
    await S.say('洪班主', '女孩子可憐她，中秋、元宵就請她出來，陪她說說話。');
    await S.say('hongying:sad', '……被綁在椅子上餓死。');
    await mv(S, 'baizhi', 'UU');
    await S.say('baizhi:sad', '（蹲下）妳好。我叫白芷。');
    await S.say('秀蘭（椅仔姑）', '（停止敲擊）……妳看得見我。');
    await S.say('baizhi:smile', '嗯。妳為什麼不回去呢？');
    await S.say('椅仔姑', '我在等月娘圓。月娘圓了，戲就開演了。');
    await S.say('椅仔姑', '我以前被綁在椅子上的時候，聽得到廟口的鑼鼓。咚咚鏘。好遠好遠。');
    await S.say('椅仔姑', '我一次都沒去看過。一次都沒有。');
    await S.say('椅仔姑', '現在我坐在戲台上了。我要唱英台。唱完我就走。');
    await S.wait(0.6);
    await S.say('洪班主', '可是……這是秀蘭的身體啊。她再不吃不睡，會出人命的。');
    await S.say('', '（雲歸摸出一張黃符。符上硃砂未乾。）');
    await S.say('yungui:serious', '封印符。貼上去，她會被請回去。秀蘭姑娘能醒過來。');
    await S.say('yungui:normal', '這是最安全的做法。……我不逼你們。');
    const c = await S.choice(['讓雲歸貼符，請她走', '問問秀蘭姑娘自己怎麼想']);
    if (c === 0) {
      await S.say('xinghe:sad', '……麻煩你了，雲歸。');
      S.sfx('thunder'); S.flash('#fff6c0', 0.4, 0.7);
      await S.say('椅仔姑', '我還沒——');
      S.sfx('hit');
      await S.say('', '（竹椅翻倒。秀蘭醒了過來，虛弱，但無恙。）');
      await S.say('秀蘭', '……我夢到一個小姑娘，一直在哭。');
      await S.say('baizhi:sad', '（看著空空的竹椅，什麼都沒說）');
      S.flag('ch3_yizigu_sealed');
    } else {
      await S.say('baizhi:serious', '讓我試試看。');
      S.sfx('sing');
      await S.say('', '（白芷取出玉笛，吹起渡魂謠的旋律，很輕很輕。）');
      await S.say('', '（秀蘭的身體微微一震。她的眼神裡，屬於大人的那一半浮了上來。）');
      await S.say('秀蘭', '（用自己的聲音，很吃力）……我……聽得見她……');
      await S.say('秀蘭', '她好小……好輕……像一隻貓縮在我胸口……');
      await S.say('xinghe:serious', '秀蘭姊，她想唱一齣戲就走。妳願意……借她一晚嗎？');
      await S.wait(0.8);
      await S.say('秀蘭', '……我十歲學戲，也是被人綁著練的。練不好，沒飯吃。');
      await S.say('秀蘭', '……唱吧，小妹妹。一齣就好。我陪妳唱。');
      await S.say('yungui:think', '（把符收回袖子）……真是的，比我還會胡來。');
      await S.say('洪班主', '欸欸欸？那、那戲怎麼辦？她會唱嗎？');
      await S.say('椅仔姑', '會！我聽了好多年！《山伯英台》，每一句我都會！');
      await S.say('洪班主', '……戲照演。但你們要幫我。我缺人手！');
      S.flag('ch3_yizigu_choice_b');
    }
    S.flag('ch3_effigy_awake');
    S.sfx('wind'); S.sfx('ghost', 0.3);
    await S.camera(14, 8, 0.6);
    await S.say('', '（角落的紙紮人，一個個轉過頭來。紙張沙沙作響。）');
    await S.say('洪班主', '隔、隔壁紙紮店寄放的……怎麼動起來了！');
    await S.say('yungui:serious', '椅仔姑一來，四周的遊魂也跟著醒了。附在紙人身上。');
    const r = await S.battle('t_c3_theatre');
    if (r !== 'win') return;
    S.flag('ch3_theatre');
    await S.say('洪班主', '唉，紙紮店明仔載要罵我了……');
    S.quest('q_ch3_main', 5);
    S.objective(mainObj());
    S.cameraFollow();
  }
  G.Maps.define('bangka_theatre', {
    name: '戲棚後台', subtitle: '中秋戲的後台', place: 'bangka',
    bgm: (st) => (festival(st) ? 'festival' : 'night'), start: [9, 10],
    light: { ambient: 0.35, color: '#120a10', playerR: 180 },
    tiles: rows(room(18, 12, '_', 'W', [9])),
    objects: [
      { t: 'screen', x: 2, y: 2 }, { t: 'screen', x: 5, y: 2 }, { t: 'screen', x: 12, y: 2 }, { t: 'cabinet', x: 15, y: 2 }, { t: 'lantern_rack', x: 8, y: 2 },
      { t: 'table', x: 2, y: 5 }, { t: 'chair', x: 2, y: 6, dir: 'up' }, { t: 'basket', x: 14, y: 6, v: 3 }, { t: 'basket', x: 15, y: 6, v: 1 },
      { t: 'chair', x: 9, y: 5, solid: false }, { t: 'red_lantern', x: 4, y: 4 }, { t: 'red_lantern', x: 13, y: 4 },
      { t: 'crate', x: 14, y: 8 }, { t: 'crate', x: 14, y: 9 }, { t: 'crate', x: 14, y: 10 }, { t: 'paper_stack', x: 1, y: 9 }, { t: 'drum', x: 1, y: 7 },
      { t: 'weapon_rack', x: 4, y: 9 },
    ],
    chests: [{ id: 'c3_13', x: 16, y: 4, item: 'c3_ac_rouge', if: (st) => !!st.flags.ch3_theatre }],
    lights: [{ x: 9, y: 4, r: 200, color: '#ffb060', flicker: 0.4 }, { x: 3, y: 5, r: 120, color: '#ffc080', flicker: 0.3 }],
    npcs: [
      { id: 'bk_troupe_head', sprite: 'merchant', name: '洪班主', x: 6, y: 6, dir: 'right',
        talk: async (S) => {
          if (F('ch3_show_done')) { await S.say('洪班主', '這一齣，是我做戲四十年來，唱得最好的一齣。多謝你們。'); return; }
          if (!F('ch3_theatre')) { await S.say('洪班主', '救命啊……明暗就要演了！'); return; }
          if (bkDay() === 0) { await S.say('洪班主', '明暗就開演。你們先去客棧歇一暝，養好精神！'); return; }
          if (bkDay() === 1) {
            await S.say('洪班主', '天暗就開演！你們準備好了沒？');
            const c = await S.choice(['等到天暗', '再等一下'], { cancel: 1 });
            if (c !== 0) return;
            await S.fadeOut(1.0);
            V().ch3_day = 2;
            await S.say('', '——八月十五，中秋夜。');
            await S.warp('bangka', 37, 25, 'up', { fade: 0, stayDark: true });
            return;
          }
          await S.say('洪班主', '開演囉！快去台前！');
        } },
      { id: 'bk_actress', sprite: 'actress', name: '秀蘭', x: 9, y: 5, dir: 'down',
        talk: async (S) => {
          if (!F('ch3_theatre')) { await S.say('秀蘭（椅仔姑）', '月娘還沒圓。還沒圓。'); return; }
          if (F('ch3_yizigu_choice_b') && !F('ch3_show_done')) { await S.say('椅仔姑', '姊姊說，明暗我可以唱英台！我好開心！'); await S.say('秀蘭', '（用自己的聲音）……小妹妹很乖。你們放心。'); return; }
          await S.say('秀蘭', '多謝你們。我……做了一個好長的夢。');
        } },
      { id: 'bk_atao', sprite: 'child_f', name: '阿桃', x: 12, y: 8, dir: 'left', talk: ['我們以後不敢亂請椅仔姑了……', '可是……椅仔姑好可憐喔。'] },
      { id: 'bk_axing', sprite: 'child_f', name: '阿杏', x: 11, y: 9, dir: 'up', talk: ['班主說，學戲要吃得苦。可是不能沒飯吃。'] },
    ],
    events: [
      { id: 'th_yizigu', trigger: 'auto', if: (st) => st.flags.ch3_temple_met && !st.flags.ch3_theatre, run: yizigu },
      { id: 'th_chest', trigger: 'action', x: 15, y: 2, label: '調查', run: async (S) => { await S.say('', '戲箱裡塞滿了戲服、頭飾和刀槍把子。'); } },
    ],
    warps: [{ x: 9, y: 11, to: 'bangka', tx: 38, ty: 24, tdir: 'down', door: true }],
    drawGround: (ctx, t, m) => {
      if (F('ch3_theatre') || !G.Monsters) return;
      const awake = F('ch3_effigy_awake');
      for (const [x, y, k] of [[15.5, 9.3, 0], [16.4, 8.6, 1], [16.2, 10.6, 2]]) {
        ctx.save(); ctx.translate(x * T, y * T); ctx.scale(awake && k === 1 ? -0.42 : 0.42, 0.42);
        try { G.Monsters.draw(ctx, 'paper_effigy', 0, 0, awake ? t : 0, { state: 'idle', variant: 0 }); } catch (e) { G.warnOnce('c3 effigy', e); }
        ctx.restore();
      }
    },
  });

  // ------------------------------------------------------------------ 剝皮寮 bangka_bopiliao (40×14)
  async function mushroomScene(S) { // 4-5 杉皮蕈
    await S.say('', '（一根老杉木的樹皮縫裡，長著一排小小的、發著月白色光的蕈。）');
    if (F('mochi_joined')) await S.say('', '（麻糬在杉木堆前停下來，對著樹皮縫嗅個不停。）');
    await S.say('yungui:smile', '……是真的。古書沒騙人。（掏出筆記本，認真畫下）');
    await S.say('yungui:serious', '畫好了。接下來是——嚴謹的親身試驗。');
    S.sfx('item');
    await S.say('xinghe:surprise', '等一下，你真的要吃——');
    await S.say('', '（雲歸已經吃掉了。）');
    S.vision(20);
    await S.say('yungui:think', '（眼神開始渙散，瞳孔像是浮著彩色的漩渦。四周微微呼吸。）');
    await S.say('yungui:serious', '……我明白了。');
    await S.say('yungui:serious', '杉木從福州漂過黑水溝來到這裡，被剝了皮，蓋成房子。');
    await S.say('yungui:serious', '皮被剝下來，堆在角落，長出了蕈。');
    await S.say('yungui:serious', '所以……被丟掉的東西，也會長出新的東西。');
    await S.say('baizhi:surprise', '……好像很有道理。');
    await S.say('yungui:serious', '而且我現在聽得見杉木在說話。它說：「好癢。」');
    await S.say('hongying:laugh', '（忍不住笑出聲）');
    await S.say('yungui:serious', '紅纓，妳的笑聲是粉紅色的。');
    await S.say('hongying:shy', '……！');
    if (F('yuyuan_joined')) {
      S.emote('yuyuan', '…');
      await S.say('', '（另一邊，芋圓叼走了剩下的半朵。吞下去之後，牠就一直盯著牆壁，一動也不動。）');
    }
    await S.say('', '（雲歸往後一倒，開始打呼。）');
    await S.say('xinghe:normal', '……一次只准吃一朵。不，一次都不准吃。');
    V().tuanzi_mush = (V().tuanzi_mush || 0) + 1;
    S.flag('mush_1');
    S.quest('q_tuanzi_mush', 2);
    S.toast('雲歸蕈譜第一格：杉皮蕈。', 'mushroom');
  }
  async function chunpoTalk(S) {
    if (!F('ch3_xiaomei_1') || F('ch3_xiaomei_done')) {
      await S.say('春婆', '玉蘭花，一串一文，香喔……');
      if (F('ch3_xiaomei_done')) await S.say('春婆', '（笑著）這兩天，睡得很好。夢裡有人跟我說「慢慢來」。');
      return;
    }
    if (F('ch3_chunpo_wait')) { await S.say('春婆', '黃昏我就去龍山寺上香。我們廟裡見。'); return; }
    await S.say('春婆', '玉蘭花，一串一文，香喔……');
    await S.say('baizhi:think', '婆婆，妳頭上也插著玉蘭花。');
    await S.say('春婆', '（笑）插了一輩子了。我女兒喜歡這個味道。');
    await S.say('xinghe:serious', '妳女兒……');
    await S.say('春婆', '四十年前，頂下郊相拚那年，死了。那暝火燒到龍山寺邊。');
    await S.say('春婆', '我叫她在廟裡等，我去買糖……回來，人就找不到了。');
    await S.say('春婆', '後來在灰裡……（搖頭）她才七歲。');
    await S.say('春婆', '我每日黃昏，都去龍山寺，求觀音媽，讓她投個好人家。');
    await S.say('春婆', '一暝大一寸……她要是還在，也當阿嬤了。');
    const c = await S.choice(['請春婆一起去龍山寺', '先不要'], { cancel: 1 });
    if (c !== 0) return;
    await S.say('春婆', '好啊，正好要去上香。');
    S.flag('ch3_chunpo_wait');
    S.quest('q_xiaomei', 1);
    if (!bkNight()) { await S.say('春婆', '不過我每日黃昏才去。等天暗一點，我們廟裡見。'); S.objective('天暗之後，到龍山寺與春婆會合'); return; }
    await S.fadeOut(0.8);
    await S.warp('bangka_longshan', 13, 18, 'up', { fade: 0, stayDark: true });
    await S.fadeIn(0.6);
  }
  G.Maps.define('bangka_bopiliao', {
    name: '剝皮寮', subtitle: '剝杉木皮的老街', place: 'bangka',
    bgm: bkBgm, start: [1, 9],
    light: bkLight, particles: (st) => (bkDay(st) === 2 ? ['lanterns', 'leaves'] : ['leaves']),
    tiles: (() => {
      const g = grid(40, 14, '#');
      fill(g, 0, 0, 40, 2, 'R'); fill(g, 0, 0, 1, 9, 'R'); fill(g, 39, 0, 1, 14, 'R'); fill(g, 0, 11, 1, 3, 'R'); fill(g, 0, 13, 40, 1, 'R');
      fill(g, 1, 2, 38, 4, ':'); fill(g, 15, 6, 2, 3, ':'); fill(g, 31, 6, 3, 3, ':');
      fill(g, 1, 11, 38, 2, '%');
      return rows(g);
    })(),
    objects: [
      { t: 'log', x: 2, y: 2 }, { t: 'log', x: 5, y: 3 }, { t: 'log', x: 9, y: 2 }, { t: 'log', x: 12, y: 3 }, { t: 'log', x: 18, y: 2 },
      { t: 'log', x: 21, y: 3 }, { t: 'log', x: 25, y: 2 }, { t: 'log', x: 28, y: 3 }, { t: 'log', x: 32, y: 2 }, { t: 'log', x: 36, y: 2 },
      { t: 'basket', x: 8, y: 4, v: 0 }, { t: 'basket', x: 15, y: 3, v: 0 }, { t: 'basket', x: 24, y: 4, v: 0 }, { t: 'crate', x: 30, y: 4 }, { t: 'crate', x: 17, y: 4 },
      { t: 'shophouse', x: 1, y: 6, v: 0, text: '杉行' }, { t: 'shophouse', x: 6, y: 6, v: 2, text: '紙紮' }, { t: 'shophouse', x: 10, y: 6, v: 1, text: '木器' },
      { t: 'shophouse', x: 17, y: 6, v: 3, text: '老茶店', door: -1 }, { t: 'shophouse', x: 22, y: 6, v: 0, text: '木屐' }, { t: 'shophouse', x: 27, y: 6, v: 2, text: '糕仔' },
      { t: 'shophouse', x: 34, y: 6, v: 1, text: '香燭' },
      { t: 'stall', x: 31, y: 8, text: '玉蘭花', counter: true },
      { t: 'bench', x: 18, y: 11 }, { t: 'tea_set', x: 20, y: 11 }, { t: 'paper_stack', x: 7, y: 11 }, { t: 'jar', x: 8, y: 11 }, { t: 'jar', x: 9, y: 11 },
      { t: 'laundry', x: 13, y: 4 }, { t: 'barrel', x: 26, y: 11 }, { t: 'basket', x: 33, y: 11, v: 2 }, { t: 'well', x: 37, y: 11 },
      { t: 'lantern_string', x: 3, y: 9, w: 6, v: (G.state && bkDay() === 2) ? 1 : 0 }, { t: 'lantern_string', x: 22, y: 9, w: 6, v: 0 },
      { t: 'eternal_lamp', x: 14, y: 11 }, { t: 'eternal_lamp', x: 29, y: 11 },
      { t: 'red_lantern', x: 2, y: 8, hang: true }, { t: 'red_lantern', x: 12, y: 8, hang: true }, { t: 'red_lantern', x: 24, y: 8, hang: true }, { t: 'red_lantern', x: 36, y: 8, hang: true },
      { t: 'mushroom_glow', x: 36, y: 3, spirit: true, if: (st) => bkNight(st) && !st.flags.mush_1 }, { t: 'mushroom_glow', x: 37, y: 3, spirit: true, if: (st) => bkNight(st) && !st.flags.mush_1 },
    ],
    chests: [{ id: 'c3_10', x: 38, y: 4, item: 'c3_ac_cedar_guard' }],
    npcs: [
      { id: 'bk_chunpo', sprite: 'old_f', name: '春婆', x: 32, y: 7, dir: 'down', if: (st) => !st.flags.ch3_chunpo_wait || st.flags.ch3_xiaomei_done || bkDay(st) === 1, talk: chunpoTalk },
      { id: 'bk_teaman', sprite: 'old_m', name: '老茶店頭家', x: 19, y: 10, dir: 'down',
        talk: async (S) => {
          if (F('ch3_feud_1') && !F('ch3_feud_done')) {
            S.flag('ch3_feud_tea');
            await S.say('老茶店頭家', '我那時十歲，躲在杉木堆後面。我只記得，兩邊的人都在哭。');
            feudCheck(S);
            return;
          }
          await S.say('老茶店頭家', '坐、坐！喝杯茶。剝皮寮的茶店，開了六十年了。');
          await S.say('老茶店頭家', '後面的杉木場，以前一車一車的福州杉運來，工人蹲在那裡剝樹皮，剝得滿街都是杉木香。');
        } },
      { id: 'bk_papershop', sprite: 'villager_f2', name: '紙紮店頭家娘', x: 8, y: 9, dir: 'down',
        talk: async (S) => {
          if (F('ch3_theatre')) { await S.say('紙紮店頭家娘', '洪班主跑來跟我賠不是，說寄放的紙人都破了……奇怪，好好的怎麼會破？'); return; }
          await S.say('紙紮店頭家娘', '紙厝、紙人、紙馬，燒去給那邊的人用。');
          await S.say('紙紮店頭家娘', '畫眼睛那一筆最要緊。畫了就要燒，不能放著——這是規矩。');
        } },
      { id: 'bk_lumber', sprite: 'woodcutter', name: '剝皮師傅', x: 20, y: 5, dir: 'down', wander: 2,
        talk: ['福州杉，直又香，蓋厝、做船都好用。', '樹皮剝下來就堆在那邊，暗時偶爾會發光，不知道是什麼。'] },
      { id: 'bk_bp_kid', sprite: 'child_m', name: '囝仔', x: 26, y: 10, dir: 'left', wander: 3, talk: ['我阿爸在杉木場剝樹皮！他手上都是杉木的味道！'] },
      { id: 'bk_bp_woman', sprite: 'villager_f', name: '曬衫的阿嫂', x: 12, y: 5, dir: 'down', talk: ['這條街以前叫「福皮寮」……後來大家講一講，就變「剝皮寮」了。'] },
      { id: 'bk_bp_cat', sprite: 'cat', name: '貓', x: 34, y: 4, dir: 'down', wander: 2, talk: ['喵。（牠在杉木堆上曬月光。）'] },
    ],
    events: [
      { id: 'bp_mush', trigger: 'action', x: 36, y: 2, w: 2, h: 1, label: '調查', if: (st) => G.Quests.stage('q_tuanzi_mush') >= 1 && !st.flags.mush_1, run: async (S) => {
        if (!bkNight()) { await S.say('', '老杉木的樹皮縫……白天什麼也看不出來。（青草阿伯說，月光一照會發光。）'); return; }
        if (!vis()) {
          await S.say('', '老杉木的樹皮縫裡，好像有什麼在微微發亮……看不清楚。');
          if (S.hasItem('lingxun')) {
            const c = await S.choice(['吃一朵七彩靈蕈，開啟靈視', '算了'], { cancel: 1 });
            if (c === 0) { S.take('lingxun', 1); S.vision(60); S.sfx('magic'); await mushroomScene(S); }
          }
          return;
        }
        await mushroomScene(S);
      } },
      { id: 'bp_teahouse', trigger: 'action', x: 18, y: 8, w: 2, h: 1, label: '調查', run: async (S) => { await S.say('', '老茶店的門半掩著。裡面飄出烏龍茶的香氣。'); } },
      { id: 'bp_paper', trigger: 'action', x: 7, y: 11, label: '調查', run: async (S) => { await S.say('', '一疊紙紮的金童玉女。眼睛還沒畫上。'); } },
    ],
    warps: [{ x: 0, y: 9, h: 2, to: 'bangka', tx: 54, ty: 10, tdir: 'left' }],
  });

  // ------------------------------------------------------------------ 舊渡頭・河岸夜路 bangka_riverbank (36×20)
  const RB = (() => {
    const W = 36, H = 20;
    const g = grid(W, H, '.');
    fill(g, 0, 0, W, 2, 'X');
    fill(g, 0, 12, W, 8, 'r'); fill(g, 0, 11, W, 1, '-'); fill(g, 0, 8, 1, 4, 'r');
    fill(g, 8, 6, 28, 2, ':'); fill(g, 5, 7, 4, 2, ':');
    fill(g, 10, 9, 8, 2, 'm'); fill(g, 22, 9, 9, 2, 'm');
    fill(g, 1, 8, 5, 2, 'k');                        // rotten dock
    fill(g, 13, 11, 3, 1, '-');
    const d = grid(W, H, ' ');
    for (const [x, y, c] of [[3, 2, 'n'], [7, 3, 'n'], [12, 2, 'c'], [16, 3, 'n'], [21, 2, 't'], [26, 3, 'n'], [31, 2, 'c'], [34, 4, 'u'], [2, 5, 'u'], [10, 4, 'u'],
      [19, 5, 'g'], [29, 5, 'g'], [11, 9, 'e'], [13, 10, 'e'], [16, 9, 'e'], [23, 10, 'e'], [25, 9, 'e'], [27, 10, 'e'], [29, 9, 'e'], [9, 10, 'e'], [19, 10, 'e'], [31, 10, 'e'],
      [6, 10, 'e'], [7, 10, 'e'], [33, 9, 'e'], [34, 10, 'e'], [20, 9, 'e'], [4, 4, 'g'], [14, 5, 'g'], [24, 4, 'u']]) d[y][x] = c;
    return { tiles: rows(g), deco: d.map((r) => r.join('')) };
  })();
  async function riverBoss(S) { // 4-2 step 2
    S.flag('ch3_river_seen');
    await S.camera(3, 9, 0.8);
    await S.say('', '（腐朽的棧橋盡頭，一盞冷藍色長明燈。燈下站著一個濕淋淋的男人鬼魂。）');
    await S.say('', '（他身上纏著一圈圈藍色光鏈，鏈子的另一頭，連進燈裡。）');
    S.sfx('splash');
    await S.say('', '（河裡浮出幾隻水鬼，朝岸邊爬來。男人鬼魂轉身擋住，被光鏈扯得踉蹌。）');
    S.face('rb_ade', 'down');
    await S.say('阿德', '退落去！這裡沒有替死鬼給你們抓！');
    await S.say('xinghe:surprise', '他……在擋水鬼！');
    S.flag('ch3_wraith_up'); S.sfx('splash'); S.shake(6, 0.6);
    await S.say('', '（一隻巨大的河伯怨靈從水底升起。）');
    S.cameraFollow();
    let warned = false;
    const r = await S.battle('t_c3_river_boss', {
      onTurn: async (b, u) => {
        if (!warned && b.rounds >= 3 && u.side === 'enemy' && u.id === 'c3_river_boss') {
          warned = true;
          await b.say2('阿德', '小心左邊！');
          u.st.stun = 1;
          b.say('阿德拉住了河伯怨靈！', 1.4);
        }
      },
    });
    S.flag('ch3_wraith_up', false);
    if (r !== 'win') return;
    S.flag('ch3_alian_2');
    await S.camera(3, 9, 0.5);
    await S.say('', '（阿德跪倒在棧橋上，光鏈勒得更緊。）');
    await S.say('阿德', '多謝……你們看得見我？');
    await S.say('baizhi:sad', '你是阿德大哥。阿蓮姊姊在等你。');
    await S.say('阿德', '……阿蓮。（看著燈）這盞燈是她買的吧。她總是這樣，什麼都想抓得緊緊的。');
    await S.say('阿德', '我被這燈拴住了。過不了海，又回不了家。只能在這裡，把落水的人推回岸上。');
    await S.say('阿德', '至少……不要再有人像我這樣。');
    await S.say('yungui:serious', '（端詳燈身）燈芯裡有符。鎖魂的符。不是驅鬼——是把鬼留住。');
    await S.say('yungui:angry', '師父說的「長囚」，就是這個。');
    await S.say('hongying:angry', '那我現在就把它砸了！');
    await S.say('yungui:serious', '不行。這燈是用她的心願點的。只有點燈的人親手熄，鎖鏈才會解開。硬砸，魂會跟著碎。');
    await S.say('阿德', '……拜託你們，跟阿蓮說。叫她放我走。');
    S.quest('q_alian', 1);
    S.objective('回去找北渡頭的阿蓮');
    S.cameraFollow();
  }
  async function alianRelease(S) { // 4-2 step 4
    S.spawn({ id: 'c3_alian', sprite: 'widow', x: 6, y: 8, dir: 'left' });
    S.setPos('player', 6, 9, 'left');
    await S.camera(4, 9, 0.1);
    await S.fadeIn(0.8);
    await S.move('c3_alian', 'L');
    await S.say('', '（阿蓮提著一碗碗粿走上棧橋。她看不見阿德。）');
    await S.say('alian:sad', '阿德……你在哪？');
    await S.say('xinghe:serious', '（伸出手）阿蓮姊，握著我的手。');
    S.flash('#ffb060', 0.5, 0.35); S.sfx('lantern');
    await S.say('', '（阿蓮握住星河的手。星河胸口亮起一點微弱的火光。下一刻，阿蓮的眼睛睜大——她看見了。）');
    await S.say('baizhi:think', '（星河的手……在發光？）');
    await S.say('alian:cry', '……阿德。你還是穿那件破衫。');
    await S.say('阿德', '妳還是做太鹹的碗粿。');
    await S.say('alian:laugh', '（哭著笑）嫌鹹你還每天吃兩碗！');
    await S.say('阿德', '阿蓮，燈熄了吧。我好冷。');
    await S.say('阿德', '不用每天替我掛燈。妳要好好吃飯、好好睡。有人對妳好，就嫁。');
    await S.say('alian:cry', '你說什麼憨話……');
    await S.say('阿德', '我不會忘記妳。過了海，洗了記憶，我也會記得——碗粿太鹹。');
    await S.say('', '（阿蓮把碗粿放在棧橋上。伸手，捧住長明燈。深吸一口氣。吹熄。）');
    S.flag('ch3_lamp_out'); S.sfx('wind');
    await S.wait(0.6);
    S.sfx('shatter');
    await S.say('', '（光鏈一節一節碎成螢火。阿德的身影變輕，化成一點溫暖的光，順著河往海口漂去。）');
    await S.fadeActor('rb_ade', 0, 1.5);
    await S.say('alian:cry', '阿德——！慢慢走！');
    await S.say('', '（遠方河面上，那點光閃了兩下，像在回頭。）');
    S.flag('ch3_alian_done');
    S.quest('q_alian', 'done');
    await S.lantern('lantern_alian', '阿蓮與阿德');
    await S.say('alian:smile', '（擦乾眼淚）……碗粿，我明天開始少放一點鹽。');
    await S.say('yungui:think', '（撿起熄滅的燈，翻看燈底）……燈底刻著「長明宮・玄」。');
    await S.say('yungui:serious', '這人，在全台灣賣這種燈。');
    await S.say('alian:smile', '這頂斗笠……是他的。你們戴著，走河邊比較不會濕。');
    await S.give('c3_hd_ade', 1);
    await S.give('c3_wanguo_lite', 5);
    S.remove('c3_alian');
    S.objective(mainObj());
  }
  G.Maps.define('bangka_riverbank', {
    name: '舊渡頭', subtitle: '河岸夜路', place: 'bangka',
    bgm: (st) => 'night', start: [34, 7],
    light: { ambient: 0.65, color: '#04081a', playerR: 230 },
    particles: ['fireflies', 'mist'],
    tiles: RB.tiles, deco: RB.deco,
    objects: [
      { t: 'eternal_lamp', x: 1, y: 8, if: (st) => !st.flags.ch3_lamp_out && !st.flags.ch3_alian_done },
      { t: 'dock_post', x: 1, y: 10 }, { t: 'dock_post', x: 5, y: 10 }, { t: 'boat_small', x: 14, y: 11 },
      { t: 'tree_banana', x: 6, y: 4 }, { t: 'tree_banana', x: 18, y: 3 }, { t: 'tree_banana', x: 28, y: 3 },
      { t: 'driftwood', x: 24, y: 11 }, { t: 'rock_small', x: 9, y: 11 }, { t: 'water_lantern', x: 20, y: 13, if: (st) => !!st.flags.ch3_alian_done },
    ],
    chests: [{ id: 'c3_11', x: 16, y: 11, item: 'c3_ar_water_gauze' }, { id: 'c3_12', x: 30, y: 10, item: 'jinchuang', n: 3, gold: 250 }],
    npcs: [
      { id: 'rb_ade', sprite: spr('c3_ghost_ade', 'ghost_m'), name: '阿德', x: 2, y: 9, dir: 'right', ghost: true, if: (st) => !st.flags.ch3_alian_done,
        talk: async (S) => {
          if (!F('ch3_alian_2')) return;
          await S.say('阿德', '……拜託你們，跟阿蓮說。叫她放我走。');
        } },
    ],
    enemies: [
      { id: 'rb_e1', troop: 't_c3_river_a', x: 26, y: 7, art: 'water_ghost', variant: 1, radius: 3, chase: 4, lv: 12 },
      { id: 'rb_e2', troop: 't_c3_river_b', x: 14, y: 8, art: 'river_wraith', variant: 1, radius: 2, chase: 3, lv: 12 },
      { id: 'rb_e3', troop: 't_c3_river_a', x: 21, y: 10, art: 'water_ghost', variant: 1, radius: 2, chase: 4, lv: 12 },
    ],
    events: [
      { id: 'rb_boss', trigger: 'touch', x: 7, y: 6, w: 1, h: 4, if: (st) => st.flags.ch3_alian_1 && !st.flags.ch3_alian_2, run: riverBoss },
      { id: 'rb_release', trigger: 'auto', if: (st) => st.flags.ch3_alian_3 && !st.flags.ch3_alian_done, run: alianRelease },
      { id: 'rb_boat', trigger: 'action', x: 14, y: 11, w: 2, h: 1, label: '調查', run: async (S) => { await S.say('', '翻覆的小船，船底長滿了青苔。船身上用紅漆寫著一個「德」字。'); } },
      { id: 'rb_lamp', trigger: 'action', x: 1, y: 8, label: '調查', if: (st) => !st.flags.ch3_alian_done, run: async (S) => {
        await S.say('', '冷藍色的長明燈。燈罩裡的火一動也不動，像是凍住了。');
        if (inParty('baizhi')) await S.say('baizhi:sad', '……它抓得好緊。');
      } },
    ],
    warps: [{ x: 35, y: 6, h: 2, to: 'bangka', tx: 9, ty: 1, tdir: 'down' }],
    drawGround: (ctx, t, m) => {
      // blue chains from the lamp to 阿德
      if (!F('ch3_alian_done') && !F('ch3_lamp_out')) {
        ctx.save();
        ctx.strokeStyle = `rgba(120,190,255,${0.5 + 0.2 * Math.sin(t * 3)})`; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
        for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(1.5 * T, 8.4 * T);
          ctx.quadraticCurveTo(2 * T, (9 + i * 0.2) * T + Math.sin(t * 2 + i) * 10, 2.5 * T, (9.3 + i * 0.15) * T);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (F('ch3_wraith_up') && G.Monsters) {
        ctx.save(); ctx.translate(4 * T, 13.6 * T); ctx.scale(0.75, 0.75);
        try { G.Monsters.draw(ctx, 'river_wraith', 0, 0, t, { state: 'idle', variant: 1 }); } catch (e) { G.warnOnce('c3 wraith', e); }
        ctx.restore();
      }
    },
  });

  // ------------------------------------------------------------------ small interiors
  G.Maps.define('bangka_inn', {
    name: '艋舺客棧', subtitle: '河港的老客棧', place: 'bangka',
    bgm: bkBgm, start: [6, 8],
    light: (st) => (bkDay(st) === 1 ? { ambient: 0.1, color: '#1a1008' } : { ambient: 0.3, color: '#100a08' }),
    tiles: rows(room(14, 10, '_', 'W', [6])),
    objects: [
      { t: 'counter', x: 2, y: 3 }, { t: 'shelf_lanterns', x: 4, y: 2 }, { t: 'stairs_up', x: 12, y: 2 }, { t: 'mural', x: 5, y: 1, v: 2 },
      { t: 'table', x: 6, y: 4 }, { t: 'chair', x: 5, y: 4, dir: 'right' }, { t: 'chair', x: 7, y: 4, dir: 'left' }, { t: 'table', x: 9, y: 6 }, { t: 'chair', x: 10, y: 6, dir: 'left' },
      { t: 'tea_set', x: 4, y: 7 }, { t: 'red_lantern', x: 8, y: 2 }, { t: 'plant_pot', x: 12, y: 8 }, { t: 'jar_row', x: 1, y: 7, w: 2 }, { t: 'screen', x: 10, y: 2 },
    ],
    lights: [{ x: 6, y: 4, r: 160, color: '#ffc080', flicker: 0.25 }],
    npcs: [
      { id: 'bk_innkeeper', sprite: 'old_m', name: '金水伯', x: 2, y: 2, dir: 'down',
        talk: async (S) => {
          if (!F('ch3_show_done')) await S.say('金水伯', '八月十五，戲棚要演《山伯英台》。可惜花旦病了，唉……');
          else await S.say('金水伯', '今年的戲，是我聽過最好的一年。');
          const c = await S.choice(['住宿（40 文）', '不用了'], { cancel: 1 });
          if (c !== 0) return;
          if (G.state.gold < 40) { await S.say('金水伯', '客官，您的盤纏好像不太夠呢……'); return; }
          G.state.gold -= 40;
          await sleepFade(S);
          G.Party.healAll(); S.sfx('heal');
          let msg = '好好休息了一晚，全員完全恢復。';
          if (F('ch3_theatre') && bkDay() === 0) { V().ch3_day = 1; msg = '八月十五。天亮了，艋舺的街上已經熱鬧起來。'; S.objective(mainObj()); }
          await S.warp('bangka_inn', 6, 7, 'down', { fade: 0, reload: true });
          await S.fadeIn(0.8);
          G.UI.toast(msg, { icon: 'lantern' });
        } },
      { id: 'bk_inn_guest', sprite: 'villager_m', name: '住客', x: 8, y: 6, dir: 'left', talk: ['我從府城來的。一府二鹿三艋舺——我三個都住過，還是府城的碗粿好吃。……噓，別跟阿蓮說。'] },
    ],
    warps: [{ x: 6, y: 9, to: 'bangka', tx: 22, ty: 10, tdir: 'down', door: true }],
  });
  G.Maps.define('bangka_armory', {
    name: '兵器鋪', subtitle: '陳師傅的打鐵鋪', place: 'bangka',
    bgm: bkBgm, start: [6, 7],
    light: { ambient: 0.2, color: '#140c08' },
    tiles: rows(room(12, 9, '_', 'W', [6])),
    objects: [
      { t: 'counter', x: 5, y: 3 }, { t: 'weapon_rack', x: 1, y: 2 }, { t: 'weapon_rack', x: 9, y: 2 }, { t: 'cabinet', x: 4, y: 2 }, { t: 'cabinet', x: 7, y: 2 },
      { t: 'brazier', x: 10, y: 5 }, { t: 'barrel', x: 1, y: 6 }, { t: 'crate', x: 1, y: 7 }, { t: 'bucket', x: 10, y: 7 },
    ],
    npcs: [
      { id: 'bk_smith', sprite: 'villager_m2', name: '陳師傅', x: 5, y: 2, dir: 'down',
        talk: async (S) => {
          await S.say('陳師傅', '頂港有名聲，下港有出名！艋舺陳師傅打的鐵，砍得斷觀音山石！');
          await S.shop(['sw_banka', 'sp_bintie', 'fl_zizhu', 'c3_fn_peach', 'c3_ar_shortcoat', 'c3_ar_embroidered', 'hd_douli', 'hd_toujin', 'ft_cloth', 'ft_muji'], { title: '陳師傅兵器鋪' });
        } },
    ],
    warps: [{ x: 6, y: 8, to: 'bangka', tx: 37, ty: 10, tdir: 'down', door: true }],
  });
  G.Maps.define('bangka_herb', {
    name: '藥鋪', subtitle: '青草巷口的藥鋪', place: 'bangka',
    bgm: bkBgm, start: [6, 7],
    light: { ambient: 0.18, color: '#101408' },
    tiles: rows(room(12, 9, '_', 'W', [6])),
    objects: [
      { t: 'counter', x: 5, y: 3 }, { t: 'cabinet', x: 1, y: 2 }, { t: 'cabinet', x: 2, y: 2 }, { t: 'herbs_rack', x: 8, y: 2 }, { t: 'herbs_rack', x: 9, y: 2 },
      { t: 'jar_row', x: 1, y: 6, w: 2 }, { t: 'jar', x: 10, y: 5 }, { t: 'basket', x: 10, y: 6, v: 2 }, { t: 'basket', x: 9, y: 7, v: 2 }, { t: 'cauldron', x: 3, y: 5 }, { t: 'mill_stone', x: 1, y: 4 },
    ],
    npcs: [
      { id: 'bk_herb_clerk', sprite: 'villager_f', name: '藥鋪學徒', x: 5, y: 2, dir: 'down',
        talk: async (S) => {
          await S.say('藥鋪學徒', '阿伯在外面的青草巷賣青草茶。藥材都在這裡，要什麼？');
          await S.shop(['c3_herbtea', 'jinchuang', 'c3_qingxinlu', 'c3_ningshen', 'jiedu', 'xiangbao', 'huanhunxiang', 'lingxun'], { title: '艋舺藥鋪' });
        } },
    ],
    warps: [{ x: 6, y: 8, to: 'bangka', tx: 32, ty: 10, tdir: 'down', door: true }],
  });
  G.Maps.define('bangka_alian', {
    name: '阿蓮家', subtitle: '北渡頭邊的小厝', place: 'bangka',
    bgm: (st) => 'sad', start: [6, 7],
    light: { ambient: 0.3, color: '#0c0c14' },
    tiles: rows(room(12, 9, '_', 'W', [6])),
    objects: [
      { t: 'altar', x: 5, y: 2 }, { t: 'table', x: 5, y: 4 }, { t: 'chair', x: 4, y: 4, dir: 'right' }, { t: 'stove', x: 1, y: 5 }, { t: 'pot', x: 1, y: 7 },
      { t: 'bed_mat', x: 10, y: 3 }, { t: 'basket', x: 9, y: 7, v: 1 }, { t: 'jar', x: 10, y: 7 }, { t: 'bucket', x: 3, y: 7 },
    ],
    events: [
      { id: 'al_altar', trigger: 'action', x: 5, y: 2, w: 2, h: 1, label: '調查', run: async (S) => {
        await S.say('', '小小的神桌上，立著一塊牌位：「先夫　阿德　之位」。');
        if (F('ch3_alian_done')) await S.say('', '牌位前多了一碗碗粿。看起來，鹽放得比較少了。');
      } },
      { id: 'al_hat', trigger: 'action', x: 8, y: 1, w: 2, h: 1, label: '調查', run: async (S) => {
        if (F('ch3_alian_done')) await S.say('', '牆上掛斗笠的釘子空了。');
        else await S.say('', '牆上掛著一頂舊斗笠，帽緣補了又補。');
      } },
    ],
    warps: [{ x: 6, y: 8, to: 'bangka', tx: 12, ty: 10, tdir: 'down', door: true }],
  });
  G.Maps.define('bangka_xing', {
    name: '阿興家', subtitle: '土地公廟旁的厝', place: 'bangka',
    bgm: bkBgm, start: [6, 7],
    light: { ambient: 0.25, color: '#100c0a' },
    tiles: rows(room(12, 9, '_', 'W', [6])),
    objects: [
      { t: 'altar', x: 5, y: 2 }, { t: 'table', x: 3, y: 5 }, { t: 'chair', x: 2, y: 5, dir: 'right' }, { t: 'bed', x: 10, y: 3 }, { t: 'stove', x: 1, y: 2 },
      { t: 'basket', x: 9, y: 7, v: 0 }, { t: 'plant_pot', x: 10, y: 6, v: 0 }, { t: 'loom_small', x: 8, y: 2 },
    ],
    npcs: [
      { id: 'bk_xingma', sprite: 'villager_f', name: '秀琴', x: 8, y: 5, dir: 'down',
        talk: async (S) => {
          if (F('ch3_feud_xing') && !F('ch3_feud_clue') && !F('ch3_feud_done')) {
            await S.say('秀琴', '我阿公是頂郊的黃家，我翁婿的阿公是下郊的林家。我們結婚的時，兩邊的長輩都反對。');
            await S.say('秀琴', '可是阿興出世以後，大家就不吵了。囝仔誰都愛。');
            await S.say('秀琴', '黃家的阿公叫阿水，林家的叫阿旺。兩個聽說都死在那一年。');
            S.emote('player', '!');
            await S.say('xinghe:surprise', '！');
            S.flag('ch3_feud_clue');
            feudCheck(S);
            return;
          }
          if (F('ch3_feud_done')) { await S.say('秀琴', '昨暗神桌上的香，燒得特別旺。阿興說，他看見兩個阿伯在笑。'); return; }
          await S.say('秀琴', '阿興又跑去土地公廟了。那囝仔，什麼都跟土地公講。');
        } },
    ],
    events: [
      { id: 'xg_altar', trigger: 'action', x: 5, y: 2, w: 2, h: 1, label: '調查', run: async (S) => {
        await S.say('', '神桌上，兩塊不同姓氏的神主牌並排著：「黃」與「林」。');
      } },
    ],
    warps: [{ x: 6, y: 8, to: 'bangka', tx: 46, ty: 5, tdir: 'down', door: true }],
  });

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
    // 平溪 / 霧林 side quests can only be finished there (紅纓's kitchen is opened by a main-story morning scene): one
    // left unfinished leaves the quest log with chapter 2
    for (const q of ['q_hy_kitchen', 'q_woodcutter', 'q_letter']) if (st.quests[q] && !st.quests[q].done) delete st.quests[q];
    // party: 星河・白芷・紅纓 (+ the pets 芋圓・麻糬 since ch1); 雲歸 joins alone after the 鬼面 raid
    if (!st.flags.ch3_yungui_join && st.party.includes('yungui')) { G.Party.leave('yungui'); delete st.members.yungui; }
    for (const id of ['xinghe', 'baizhi', 'hongying']) {
      if (!st.party.includes(id)) G.Party.join(id, Math.max(9, avgLv()));
      G.Story.ensureLevel(id, 9);
    }
    // 芋圓 & 麻糬 have travelled with the party since ch1 (set here too so the chapter works standalone)
    if (!st.flags.mochi_joined) st.flags.mochi_joined = true;
    if (!st.flags.yuyuan_joined) st.flags.yuyuan_joined = true;
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

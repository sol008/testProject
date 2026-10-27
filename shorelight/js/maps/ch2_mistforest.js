// 《彼岸燈》 第二章　霧林天燈 — chapter 2. Screenplay: docs/story/ch2_mistforest.md
//
// Maps:   mistforest_n (霧林・北), mist_loop (魔神仔的迷陣), mist_grove (七彩靈蕈林), mistforest_s (霧林・南),
//         pingxi (平溪), pingxi_inn (十分客棧), pingxi_tiandeng (吳家天燈舖), pingxi_oldhouse (周家), pingxi_store (阿貴商號),
//         tiger_lair (虎姑婆的竹林), tiger_house (山中老厝), tiger_den (虎姑婆的洞窟), shifen_falls (十分瀑布).
// Flow:   G.Story.ch2 → mistforest_n 2-1 intro → 2-2 阿竹 → mist_loop (loop ×3, 2-4) → mist_grove 2-5 first 靈視
//         → mist_loop 2-6 silver footprints (E,S,S,W) → mistforest_s (2-7 optional 阿山, 2-8 duel, 2-9 join)
//         → pingxi 2-10 → pingxi_inn 2-11 → (day: side quests) → tiger_lair 2-12 阿蘭 → tiger_house 2-13
//         → tiger_den 2-14 cages, 2-15 boss_tiger → pingxi 2-16 平安燈 → 2-17 typhoon → shifen_falls 2-18 → 阿河 2-19
//         → G.Story.next(S, 3).
// State:  vars.loopCount / loopStep (maze), vars.c2_psy (grove psychedelic ramp, scripted), vars.c2_q3 (天燈之夜 lighting),
//         vars.c2_gong (seconds the 銅鑼 keeps 魔神仔 away), vars.c2_ashan (阿山 follows the party).
// Pingxi time slots: Q1 抵達之夜 (ch2_pingxi_arrive && !ch2_morning), Q2 白天 (ch2_morning), Q3 天燈之夜 (ch2_tiger_beaten &&
//         !ch2_tiandeng_night), Q17 七月十七清晨 (ch2_tiandeng_night && !ch2_dawn), Q4 八月初五 (ch2_dawn).
// Quests: q_ch2_main (main), q_woodcutter (心燈 xd_woodcutter), q_letter (心燈 xd_letter), q_hy_kitchen.
// Data:   items c2_* · skills c2_e_split c2_e_granny_call c2_e_roar c2_e_crouch c2_e_rage · enemies c2_mosin_lead c2_mosin_phantom
//         · troops t_c2_woodcutter t_c2_woodcutter_v t_c2_ambush · tiger_granny phases · duel_hongying endAt/desc
//         · sprites c2_* · objects c2_footprint c2_redcloth c2_tongue c2_cage.
'use strict';
(function () {
  const U = G.U;
  const T = G.TILE;
  const V = () => G.state.vars;
  const F = (k) => !!G.state.flags[k];
  const auto = () => !!(G.Debug && G.Debug.autoplay);
  const dur = (s) => (auto() ? Math.min(s, 0.05) : s);   // cinematic timings collapse in test autoplay
  const MS = () => G.mapScene;
  const vis = () => !!(MS() && MS().visionOn());
  const fxK = () => (G.settings.visualFx == null ? 1 : G.settings.visualFx);
  const inParty = (id) => G.state.party.includes(id);
  const qStage = (id) => G.Quests.stage(id);
  const qDone = (id) => G.Quests.isDone(id);
  const qActive = (id) => qStage(id) >= 0 && !qDone(id);
  const avgLv = () => { const a = G.Party.active(); return a.length ? Math.round(a.reduce((s, m) => s + m.lv, 0) / a.length) : 5; };
  const JIUFEN = 'jiufen';   // chapter 1's town (another builder's file) — only used when it is loaded

  // ------------------------------------------------------------------ grid helpers (maps are built in code)
  function grid(w, h, ch) { const g = []; for (let y = 0; y < h; y++) g.push(new Array(w).fill(ch)); return g; }
  function fill(g, x, y, w, h, ch) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy] && xx >= 0 && xx < g[yy].length) g[yy][xx] = ch;
  }
  function rows(g) { return g.map((r) => r.join('')); }
  // interior room: 2-thick top wall, 1-thick side/bottom walls, door gaps in the bottom wall
  function room(w, h, floor, wall, doors) {
    const g = grid(w, h, floor);
    fill(g, 0, 0, w, 2, wall); fill(g, 0, 0, 1, h, wall); fill(g, w - 1, 0, 1, h, wall); fill(g, 0, h - 1, w, 1, wall);
    for (const dx of doors || []) g[h - 1][dx] = floor;
    return g;
  }
  // Forest builder: everything starts as deep canopy ('h' hedge). carve(open, keep) opens walkable cells;
  // afterwards the cells around the walkable ones become forest floor with trees — tall trees north of /
  // beside paths, only low undergrowth just south of them (so canopies never hide the party).
  function forest(W, H, carve, seed, tall, low) {
    const g = grid(W, H, 'h');
    const d = grid(W, H, ' ');
    const walk = grid(W, H, 0);
    const open = (x, y, w, h, ch) => { fill(g, x, y, w, h, ch); for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (walk[yy] && xx >= 0 && xx < W) walk[yy][xx] = 1; };
    const keep = (x, y, w, h, ch) => { fill(g, x, y, w, h, ch); };
    carve(open, keep, g, d);
    const isW = (x, y) => y >= 0 && y < H && x >= 0 && x < W && walk[y][x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y][x] !== 'h' || d[y][x] !== ' ') continue;
      let near = 9, below = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isW(x + dx, y + dy)) near = Math.min(near, Math.max(Math.abs(dx), Math.abs(dy)));
      for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) if (isW(x + dx, y - dy)) below = true;
      const h = U.hash(x, y, seed);
      if (near === 1) {
        g[y][x] = ',';
        d[y][x] = below ? low[Math.floor(h * low.length)] : tall[Math.floor(U.hash(y, x, seed + 3) * tall.length)];
      } else if (near === 2 && !below && h < 0.8) {
        g[y][x] = ',';
        d[y][x] = tall[Math.floor(U.hash(y, x, seed + 5) * tall.length)];
      }
    }
    return { g, d, walk };
  }
  // scatter decoration over walkable cells of a given terrain (non-blocking decor only)
  function sprinkle(F0, chars, density, seed, terr) {
    const { g, d } = F0;
    for (let y = 1; y < g.length - 1; y++) for (let x = 1; x < g[y].length - 1; x++) {
      if (d[y][x] !== ' ' || (terr && !terr.includes(g[y][x]))) continue;
      if (U.hash(x, y, seed) < density) d[y][x] = chars[Math.floor(U.hash(y, x, seed + 1) * chars.length)];
    }
  }
  const clearDeco = (F0, x, y, w = 1, h = 1) => fill(F0.d, x, y, w, h, ' ');

  // ================================================================================================= data
  const I = G.Data.items;
  Object.assign(I, {
    c2_longan: { name: '龍眼乾', desc: '山裡曬的龍眼乾，甜得黏牙。回復真氣 20。', type: 'use', price: 15, ch: 2, icon: 'food', use: { target: 'ally', mp: 20 } },
    c2_bento: { name: '山產便當', desc: '竹筍、山蘇、溪蝦，月娘的山產便當。回復氣血 200。', type: 'use', price: 50, ch: 2, icon: 'food', use: { target: 'ally', heal: 200 } },
    c2_chicken_soup: { name: '雞湯', desc: '十分客棧的雞湯，白芷的最愛之一。回復氣血 150、真氣 20。', type: 'use', price: 70, ch: 2, icon: 'drink', use: { target: 'ally', heal: 150, mp: 20 } },
    c2_hy_charcoal: { name: '紅纓特製山產炒（焦）', desc: '洛紅纓的心血結晶。外觀與口感都像炭。據說丟出去比吃下去有用。（戰鬥中對敵人造成 120 點火屬性傷害）', type: 'use', price: 0, ch: 2, icon: 'bomb', use: { target: 'enemy', damage: 120, elem: 'fire', battle: true, field: false } },
    c2_hongguigui: { name: '紅龜粿', desc: '本來要拜拜的紅龜粿，小春的阿嬤塞給你們路上吃。回復氣血 160。', type: 'use', price: 0, ch: 2, icon: 'food', use: { target: 'ally', heal: 160 } },
    c2_shoot_soup: { name: '竹筍溪蝦湯', desc: '月娘煮的湯。火是紅纓顧的。回復氣血 200、真氣 25。', type: 'use', price: 0, ch: 2, icon: 'drink', use: { target: 'ally', heal: 200, mp: 25 } },
    c2_bamboo_shoot: { name: '竹筍', desc: '剛冒出土的竹筍尖。', type: 'material', price: 20, ch: 2, icon: 'herb' },
    c2_shrimp: { name: '溪蝦', desc: '基隆河的溪蝦，還在竹簍裡跳。', type: 'material', price: 0, ch: 2, icon: 'food' },
    c2_shansu: { name: '山蘇', desc: '像鳥巢一樣捲起來的蕨葉，嫩芽可以炒。', type: 'material', price: 20, ch: 2, icon: 'herb' },
    c2_indigo_scarf: { name: '菁布頭巾', desc: '平溪大菁染的頭巾，藍得發黑。', type: 'head', price: 180, ch: 2, icon: 'hat', stats: { def: 6, mag: 1 } },
    c2_indigo_robe: { name: '菁染長衫', desc: '阿藍姐染的長衫，越洗越藍。', type: 'armor', price: 260, ch: 2, icon: 'armor', stats: { def: 10, mag: 3 } },
    c2_porter_sandals: { name: '挑夫草鞋', desc: '淡蘭古道挑夫的草鞋，走過幾百里山路。', type: 'feet', price: 0, ch: 2, icon: 'shoes', stats: { def: 3, spd: 3 } },
    c2_tiandeng_charm: { name: '天燈吊飾', desc: '小小的天燈吊飾。平溪人說，帶著它的人一定回得了家。', type: 'acc', price: 80, ch: 2, icon: 'lantern', stats: { mag: 3, luk: 2 } },
    c2_hunter_charm: { name: '獵人的護符', desc: '老獵人藏在倒木下的護符，綁著山豬牙與紅線。', type: 'acc', price: 0, ch: 2, icon: 'charm', stats: { spd: 3, luk: 3 } },
    c2_gong: { name: '銅鑼', desc: '阿竹的銅鑼。敲下去，連魔神仔都要摀耳朵。（在山林中使用：魔神仔會暫時逃開）', type: 'use', price: 0, ch: 2, icon: 'misc',
      use: { target: 'self', field: true, battle: false, fieldRun: async (S) => { await gongUse(S); } } },
    c2_porter_bundle: { name: '挑夫的擔子', desc: '阿福丟在山裡的擔子，裝著好多人的信。', type: 'key', price: 0, ch: 2, icon: 'bag' },
  });

  const SK = G.Data.skills;
  Object.assign(SK, {
    c2_e_split: { name: '分身', desc: '魔神仔頭嘻嘻一笑，霧裡又鑽出了兩個「自己」。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['c2_mosin_phantom', 'c2_mosin_phantom'], fx: 'summon', sfx: 'ghost' },
    c2_e_granny_call: { name: '乖孫，來', desc: '「乖孫，來姑婆這裡……」', mp: 0, type: 'debuff', elem: null, target: 'enemy', power: 0, status: { id: 'stun', chance: 0.5, turns: 1 }, fx: 'stun', sfx: 'ghost' },
    c2_e_roar: { name: '虎嘯', desc: '', mp: 0, type: 'debuff', elem: null, target: 'enemies', power: 0, buffs: [{ stat: 'atk', amt: -0.3, turns: 2 }], status: { id: 'stun', chance: 0.2, turns: 1 }, fx: 'debuff', sfx: 'dark' },
    c2_e_crouch: { name: '伏身', desc: '虎姑婆伏低了身子……（下一擊很危險！）', mp: 0, type: 'special', elem: null, target: 'self', power: 0, fx: 'buff', sfx: 'wind' },
    c2_e_rage: { name: '山君之怒', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'dark' },
  });

  // c2enemy mirrors js/data/enemies.js def(): stats from G.Data.enemyCurve(lv) × multipliers.
  function c2enemy(id, d) {
    const c = G.Data.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: d.hp != null ? d.hp : Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
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
  c2enemy('c2_mosin_lead', {
    name: '魔神仔頭', art: 'mosina', variant: 1, scale: 1.4, lv: 6, elem: 'wood', immune: BOSS_IMM, hp: 560,
    m: { hp: 3, atk: 1.15, def: 1.05, spd: 1.3, luk: 2, exp: 8.1, gold: 12.4 },
    skills: [['e_mosin_trick', 3], ['e_mosin_feast', 3], ['e_claw', 2], ['c2_e_split', 3, 'ally_dead']],
    drops: [['lingxun', 1], ['mat_wuxun', 0.5]],
    desc: '比其他魔神仔高一個頭，紅臉笑成一團，頭上綁滿紅布條。手上拎著一隻「雞腿」——靈視裡看得出是一把草。',
  });
  c2enemy('c2_mosin_phantom', {
    name: '魔神仔（幻影）', art: 'mosina', lv: 6, elem: 'wood', hp: 1, noExp: true, m: { atk: 0.75, def: 0.5, spd: 1.2 },
    skills: [['e_claw', 1]],
    desc: '霧做的魔神仔。被打到一下就散了——可是它會一直學你的動作。',
  });
  const TR = G.Data.troops;
  TR.t_c2_woodcutter = { enemies: ['c2_mosin_lead', 'c2_mosin_phantom', 'c2_mosin_phantom'], bg: 'forest', bgm: 'battle', flee: false };
  TR.t_c2_woodcutter_v = { enemies: ['c2_mosin_lead'], bg: 'forest', bgm: 'battle', flee: false };
  TR.t_c2_ambush = { enemies: ['mosinzai', 'mosinzai', 'mosinzai', 'mosinzai'], bg: 'forest', bgm: 'battle', flee: false };

  // 洛紅纓 (duel): the screenplay's misunderstanding is 「白芷是養魔神仔的妖女」; HP ≤ 35% ends the duel.
  if (G.Data.enemies.duel_hongying) {
    G.Data.enemies.duel_hongying.endAt = 0.35;
    G.Data.enemies.duel_hongying.desc = '鹿港洛家槍的傳人。把鬼火繞身的白芷當成了妖女。她出手時其實留了三分力——只是嘴上不承認。';
  }
  // 虎姑婆: three phases (老婦人 → 撐破衣衫的老虎精 → 山君之怒)
  if (G.Data.enemies.tiger_granny) {
    const tg = G.Data.enemies.tiger_granny;
    if (!tg.skills.some((s) => s.id === 'c2_e_granny_call')) tg.skills = tg.skills.concat([{ id: 'c2_e_granny_call', w: 2 }]);
    tg.phases = [
      { at: 0.6, phase: 2, text: '虎姑婆的衣衫撐破了——', msg: '虎姑婆露出了老虎精的真面目！',
        skills: [{ id: 'e_tiger_claw', w: 3 }, { id: 'c2_e_crouch', w: 1 }, { id: 'e_tiger_pounce', w: 2 }, { id: 'c2_e_roar', w: 2 }, { id: 'e_tiger_snack', w: 1, if: 'hp<50' }] },
      { at: 0.2, phase: 3, msg: '虎姑婆的毛髮豎了起來，眼睛轉紅了！', buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }],
        skills: [{ id: 'e_tiger_pounce', w: 3 }, { id: 'e_tiger_claw', w: 2 }, { id: 'c2_e_rage', w: 1, if: 'once' }] },
    ];
  }

  // ------------------------------------------------------------------ quests
  Object.assign(G.Data.quests, {
    q_ch2_main: { name: '霧林天燈', main: true, desc: '穿過霧林，到平溪；再順著基隆河，往淡水與觀音山。',
      stages: ['穿過霧林，前往平溪。', '用靈視找出魔神仔迷陣的出口。', '前往平溪。', '從東北邊的竹林上山，找出虎姑婆的窩。', '救出被虎姑婆擄走的孩子。', '到十分瀑布的碼頭，搭船往淡水。'] },
    q_woodcutter: { name: '山中的呼喚', lantern: true, desc: '平溪的樵夫阿山被魔神仔牽走了三天。他的兒子阿竹把銅鑼交給了我們。',
      stages: ['在霧林裡找到阿山。看到他，就敲鑼、喊他的名字。', '帶阿山回平溪，回到阿竹和阿山嫂身邊。'], doneText: '阿山回家了。阿竹的鑼，他聽到了。' },
    q_letter: { name: '寄到了的信', lantern: true, desc: '平溪周家的兒子阿興在船上做事。上個月，他的信沒有寄到。',
      stages: ['阿興的最後一封信不知道在哪裡。上個月有個挑夫的擔子丟在山裡……', '找到了阿興的信。念給周家兩老聽吧。', '周家兩老想放一盞寫著「阿興」的天燈。'], doneText: '信，寄到了。' },
    q_hy_kitchen: { name: '紅纓的廚房', desc: '紅纓要做「山產炒」報答平溪的人。缺三樣：竹筍、溪蝦、山蘇。',
      stages: ['找來竹筍、溪蝦、山蘇，再去找十分客棧的月娘。'], doneText: '火，顧得很好。' },
  });

  // ------------------------------------------------------------------ sprites for this chapter
  if (G.Sprites && G.Sprites.define) {
    G.Sprites.define('c2_azhu', { base: 'child_m', size: 1.08, // 阿竹: 14-year-old woodcutter's son
      hair: { style: 'messy', color: '#1a1614', back: 'short' },
      top: { color: '#6a86a2', len: 0.25, closure: 'cross', trim: '#3a5674', sleeve: 'rolled' }, bottom: { type: 'cropped', color: '#4a4a52' } });
    G.Sprites.define('c2_ashan', { base: 'woodcutter', face: { beard: 'whiskers', beardColor: '#2a2420' } });
    G.Sprites.define('c2_mosin', { base: 'child_m', size: 0.86, skin: '#cc4a36', eyes: '#ffe08a', eyeStyle: 'fierce', mouth: 'smirk', brows: 'fierce',
      hair: { style: 'wild', color: '#24120c', back: 'short' },
      top: { color: '#b8281e', len: 0.3, closure: 'cross', trim: '#6a140e', sleeve: 'short' }, bottom: { type: 'shorts', color: '#8a1e16' }, shoes: { type: 'bare' } });
    G.Sprites.define('c2_alan', { base: 'child_f', hair: { style: 'center', color: '#1e1a1c', knot: 'twin', tie: '#d8483a' },
      top: { color: '#d88a5a', len: 0.35, closure: 'side', trim: '#a8582e', sleeve: 'long' } });
    G.Sprites.define('c2_granny', { base: 'old_f', top: { color: '#7a5a86', len: 0.55, closure: 'side', trim: '#4a3456', sleeve: 'long', emb: '#e8c070' }, held: 'cane' });
    G.Sprites.define('c2_hunter_ghost', { base: 'hunter', ghost: true, face: { beard: 'long', beardColor: '#d8dce4' }, held: 'spear' });
    G.Sprites.define('c2_light_leopard', { kind: 'quad', species: 'leopardcat', size: 1.05, ghost: true, ghostTint: '#ffe39a' });
    G.Sprites.define('c2_light_muntjac', { kind: 'quad', species: 'dog', size: 0.9, ghost: true, ghostTint: '#b8ffd8',
      col: { base: '#9a6438', belly: '#d8b488', dark: '#4a2c16', nose: '#2a2020', eye: '#2a1a10', collar: '' } });
    G.Sprites.define('c2_light_magpie', { kind: 'bird', species: 'crow', size: 1.2, ghost: true, ghostTint: '#4a9cff' });
  }
  const spr = (id, fb) => (G.Sprites && G.Sprites.has && G.Sprites.has(id) ? id : fb);

  // ------------------------------------------------------------------ chapter props
  // silver child-sized footprints (maze, 靈視) / big tiger paw prints in the mud (o.kind 'tiger'); o.dir = walking direction
  G.Objects.define('c2_footprint', {
    w: 1, h: 1, solid: false, anim: true,
    draw(ctx, px, py, o, t) {
      const dir = o.dir || 'right';
      const ang = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
      ctx.save();
      ctx.translate(px + 32, py + 34);
      ctx.rotate(ang);
      if (o.kind === 'shoe') {
        ctx.rotate(0.6);
        ctx.fillStyle = '#5a3a5a'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a5a7a'; ctx.beginPath(); ctx.ellipse(-2, -1, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f0a0b0'; ctx.beginPath(); ctx.arc(5, -1, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe070'; ctx.beginPath(); ctx.arc(5, -1, 1, 0, Math.PI * 2); ctx.fill();
      } else if (o.kind === 'tiger') {
        ctx.fillStyle = 'rgba(52,34,20,0.55)';
        for (const [dx, dy] of [[-14, -9], [12, 9]]) {
          ctx.beginPath(); ctx.ellipse(dx, dy, 8, 9, 0, 0, Math.PI * 2); ctx.fill();
          for (const [tx, ty] of [[9, -7], [12, -1], [12, 5], [9, 11]]) { ctx.beginPath(); ctx.ellipse(dx + tx, dy + ty - 2, 3.2, 2.6, 0, 0, Math.PI * 2); ctx.fill(); }
        }
      } else {
        // the spirit prints are the only way out of the maze: they pulse but never drop below ~0.75, and they ignore
        // the engine's generic spirit flicker (globalAlpha down to 0.5), which on top of the pulse left them at ~0.15
        ctx.globalAlpha = o.alpha != null ? Math.min(1, o.alpha) : 1;
        const ph = (o.seq || 0) * 0.6;
        const a = Math.min(1, (0.85 + 0.15 * Math.sin(t * 2.4 - ph)) * (o.fade == null ? 1 : o.fade));
        ctx.scale(1.25, 1.25);
        ctx.shadowColor = '#dff4ff'; ctx.shadowBlur = 18;
        ctx.fillStyle = `rgba(228,242,255,${a.toFixed(3)})`;
        for (const [dx, dy] of [[-12, -7], [10, 7]]) {
          ctx.beginPath(); ctx.ellipse(dx, dy, 7.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.ellipse(dx + 9.5, dy, 3, 3.4, 0, 0, Math.PI * 2); ctx.fill();
          for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(dx + 13.5, dy - 3.6 + i * 2.4, 1.1, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      ctx.restore();
    },
    lights: (o) => (o.kind ? [] : [{ dx: 32, dy: 34, r: 60, color: '#cfe8ff', flicker: 0.3 }]),
  });
  // faded red cloth tied around a trunk (魔神仔's mark): place on the same cell as a tree, with z: 2
  G.Objects.define('c2_redcloth', {
    w: 1, h: 1, solid: false, anim: true,
    draw(ctx, px, py, o, t) {
      const x = px + 32, y = py + 8 - (o.lift || 0);
      const s = U.hash(o.x, o.y, 3) * 6;
      ctx.save();
      ctx.fillStyle = '#8a2a22';
      ctx.beginPath(); ctx.ellipse(x, y, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
      for (let k = 0; k < 2; k++) {
        const sw = Math.sin(t * 2.2 + s + k * 1.7) * 5;
        ctx.beginPath();
        ctx.moveTo(x + 4 + k * 2, y + 1);
        ctx.quadraticCurveTo(x + 14 + sw, y + 12, x + 10 + sw * 1.6 - k * 4, y + 26 - k * 5);
        ctx.lineTo(x + 6 + sw * 1.4 - k * 4, y + 25 - k * 5);
        ctx.quadraticCurveTo(x + 9 + sw * 0.6, y + 12, x + k * 2, y + 2);
        ctx.closePath();
        ctx.fillStyle = k ? '#a8382c' : '#c0483a'; ctx.fill();
      }
      ctx.restore();
    },
  });
  // 靈視: the red cloth seen as a forked, licking red tongue; o.len segments (reads vars.loopStep in the maze)
  G.Objects.define('c2_tongue', {
    w: 1, h: 1, solid: false, anim: true,
    draw(ctx, px, py, o, t) {
      const st = G.state;
      const len = o.maze ? (st.flags.ch2_maze_solved ? 0 : 4 - Math.min(4, st.vars.loopStep || 0)) : (o.len || 3);
      if (len <= 0) return;
      const x0 = px + 40, y0 = py - 34;
      ctx.save();
      ctx.lineCap = 'round';
      const pts = [];
      for (let i = 0; i <= len * 4; i++) {
        const k = i / 4;
        pts.push([x0 + k * 11 + Math.sin(t * 3 + k) * 4, y0 + k * 9 + Math.sin(t * 4.2 + k * 1.3) * 6]);
      }
      for (const [w, c] of [[11, 'rgba(120,10,20,0.5)'], [7, '#d0283a'], [3, '#ff7a8a']]) {
        ctx.strokeStyle = c; ctx.lineWidth = w;
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      }
      const [ex, ey] = pts[pts.length - 1];
      const fl = Math.sin(t * 9) * 3;
      ctx.strokeStyle = '#d0283a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + 9, ey + 2 + fl); ctx.moveTo(ex, ey); ctx.lineTo(ex + 4, ey + 10 - fl); ctx.stroke();
      ctx.restore();
    },
    lights: () => [{ dx: 60, dy: -10, r: 90, color: '#ff4060', flicker: 0.4 }],
  });
  // bamboo cage (虎姑婆's den). o.open → the door hangs open. Children stand on the cage cell (drawn behind the bars).
  G.Objects.define('c2_cage', {
    w: 1, h: 1, solid: true,
    draw(ctx, px, py, o) {
      const x = px + 4, y = py - 34, w = 56, h = 84;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(px + 32, py + 56, 32, 9, 0, 0, Math.PI * 2); ctx.fill();
      const bar = (bx, by0, by1, c) => { ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, by0); ctx.lineTo(bx, by1); ctx.stroke(); };
      // back bars
      for (let i = 0; i <= 6; i++) bar(x + 4 + i * 8, y + 8, y + h - 18, 'rgba(120,128,70,0.6)');
      // frame
      ctx.strokeStyle = '#6a7038'; ctx.lineWidth = 5;
      ctx.strokeRect(x, y + 4, w, h - 6);
      ctx.strokeStyle = '#a8a860'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 5, w - 2, h - 8);
      // front bars (door = middle three)
      const open = o.flag ? !!G.state.flags[o.flag] : !!o.open;
      for (let i = 0; i <= 6; i++) {
        if (open && i >= 2 && i <= 4) continue;
        bar(x + 4 + i * 8, y + 6, y + h - 4, i % 2 ? '#8a9048' : '#a4aa5a');
      }
      if (open) {
        ctx.save(); ctx.translate(x + 20, y + 6); ctx.transform(0.45, 0.25, 0, 1, 0, 0);
        for (let i = 0; i < 3; i++) bar(-i * 8, 0, h - 10, '#9aa052');
        ctx.restore();
      } else {
        ctx.strokeStyle = '#4a6a2a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 22, y + h / 2); ctx.lineTo(x + 34, y + h / 2 + 6); ctx.moveTo(x + 22, y + h / 2 + 6); ctx.lineTo(x + 34, y + h / 2); ctx.stroke();
      }
      // lashings
      ctx.fillStyle = '#5a3a20';
      for (const yy of [y + 6, y + h / 2, y + h - 6]) ctx.fillRect(x - 1, yy - 2, w + 2, 4);
      ctx.restore();
    },
  });

  // pale-blue will-o'-wisp (鬼火) that drifts around 白芷 (non-solid, fractional x/y allowed)
  G.Objects.define('c2_wisp', {
    w: 1, h: 1, solid: false, anim: true, over: true,
    draw(ctx, px, py, o, t) {
      const s = (o.seed || 0) * 1.7;
      const x = px + 32 + Math.sin(t * 1.3 + s) * 8, y = py - 30 + Math.sin(t * 2.1 + s) * 7;
      ctx.save();
      const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
      g.addColorStop(0, 'rgba(220,245,255,0.95)'); g.addColorStop(0.3, 'rgba(120,200,255,0.55)'); g.addColorStop(1, 'rgba(80,150,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(190,235,255,0.8)';
      ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.quadraticCurveTo(x + Math.sin(t * 6 + s) * 4, y - 22, x + 6, y + 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    },
    lights: () => [{ dx: 32, dy: -30, r: 80, color: '#8ad0ff', flicker: 0.3 }],
  });
  // 染坊 drying pole hung with deep-indigo cloth (2x1, ends solid)
  G.Objects.define('c2_indigo', {
    w: 2, h: 1, solidAt: (o, dx) => dx === 0 || dx === 1, anim: true,
    draw(ctx, px, py, o, t) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(px + 64, py + 56, 60, 8, 0, 0, Math.PI * 2); ctx.fill();
      for (const x of [px + 8, px + 120]) { ctx.fillStyle = '#7a5a34'; ctx.fillRect(x - 3, py - 70, 6, 126); }
      ctx.fillStyle = '#5a3e22'; ctx.fillRect(px + 4, py - 72, 120, 5);
      const cols = ['#1a2a5a', '#243a78', '#132048'];
      for (let i = 0; i < 3; i++) {
        const x0 = px + 16 + i * 34, sw = Math.sin(t * 1.6 + i + o.x) * 3;
        const g = ctx.createLinearGradient(x0, 0, x0 + 30, 0);
        g.addColorStop(0, U.shade(cols[i], -0.25)); g.addColorStop(0.5, cols[i]); g.addColorStop(1, U.shade(cols[i], -0.35));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x0, py - 68); ctx.lineTo(x0 + 30, py - 68); ctx.lineTo(x0 + 30 + sw, py + 10 + i * 6); ctx.lineTo(x0 + sw, py + 14 + i * 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(160,190,255,0.12)'; ctx.fillRect(x0 + 4, py - 64, 4, 70);
      }
      ctx.restore();
    },
  });

  // ------------------------------------------------------------------ tutorials (one-shot help panels)
  const TUT = {
    tut_flee: { title: '戰鬥說明', pages: [['{y}逃跑{/}：成功率取決於我方與敵方的速度。頭目戰無法逃跑。', '遇到打不過的敵人，不妨先繞路——地圖上的敵人都看得見。']] },
    tut_lingshi: { title: '靈視', pages: [
      ['{p}靈視{/}：吃下七彩靈蕈，會在一段時間內看見平常看不見的東西——隱藏的路、寶箱、迷路的魂，以及魔神仔幻術的真面目。',
        '在選單「{y}物品{/}」使用七彩靈蕈即可進入靈視。畫面四周呼吸的光暈，就是剩下的時間。'],
      ['戰鬥中使用七彩靈蕈，能讓一名夥伴進入「{p}幻境{/}」：爆擊與法術威力提升，但偶爾會恍神。',
        '靈蕈林的蕈菇會慢慢長回來。每次來，都能再採一些。']] },
    tut_hongying: { title: '新夥伴', pages: [['{r}洛紅纓{/}加入了隊伍！擅長槍術，攻擊高、速度快。', '霧林的妖物多是「{g}木{/}」屬性——{y}金剋木{/}，紅纓的槍正好剋它們。']] },
    tut_combo2: { title: '合擊', pages: [['新的合擊：星河＋紅纓「{y}火樹銀花{/}」。火與金的連擊，打在敵人身上特別痛。', '白芷＋紅纓也能使出「{b}月下紅纓{/}」。']] },
  };
  class TutorialScene {
    constructor(def, res) { this.def = def; this.res = res; this.page = 0; this.t = 0; this.a = 0; this.closing = false; G.Audio.sfx('item'); }
    update(dt) {
      this.t += dt;
      if (this.closing) { this.a -= dt * 5; if (this.a <= 0) { G.Scenes.pop(this); G.Input.clear(); this.res(); } return; }
      this.a = Math.min(1, this.a + dt * 5);
      if (auto()) { this.closing = true; return; }
      if (this.t > 0.45 && (G.Input.pressed('ok') || G.Input.clicked())) {
        G.Audio.sfx('ok');
        if (this.page < this.def.pages.length - 1) { this.page++; this.t = 0.15; } else this.closing = true;
      }
    }
    draw(ctx) {
      const a = Math.max(0, this.a);
      ctx.save();
      ctx.globalAlpha = a * 0.5; ctx.fillStyle = '#02040c'; ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = a;
      const page = this.def.pages[this.page];
      const w = 880, x = (G.W - w) / 2;
      ctx.font = G.font(25);
      const paras = page.map((l) => G.Render.wrap(ctx, l, w - 130));
      const nl = paras.reduce((s, l) => s + l.length, 0);
      const h = 96 + nl * 40 + (paras.length - 1) * 14 + 52;
      const y = (G.H - h) / 2 - 30 + (1 - a) * 14;
      G.UI.panel(ctx, x, y, w, h);
      G.UI.lanternIcon(ctx, x + 44, y + 40, 9, G.time);
      G.Render.text(ctx, this.def.title, x + 66, y + 22, { size: 28, color: G.UI.GOLD_L, glow: 'rgba(255,190,110,0.5)', glowBlur: 10 });
      if (this.def.pages.length > 1) G.Render.text(ctx, `${this.page + 1}／${this.def.pages.length}`, x + w - 34, y + 28, { size: 18, align: 'right', color: '#c9b893' });
      ctx.fillStyle = 'rgba(217,181,106,0.45)'; ctx.fillRect(x + 36, y + 70, w - 72, 1);
      let ly = y + 92;
      for (const lines of paras) {
        ctx.fillStyle = '#ffcf7a'; ctx.beginPath(); ctx.arc(x + 56, ly + 15, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = G.font(25); ctx.textBaseline = 'top';
        G.Render.drawLines(ctx, lines, x + 76, ly, 40, '#f3ead2');
        ly += lines.length * 40 + 14;
      }
      ctx.globalAlpha = a * (0.55 + 0.45 * Math.sin(G.time * 4));
      G.UI.hints(ctx, [['Z', this.page < this.def.pages.length - 1 ? '下一頁' : '知道了']], x + w - 30, y + h - 40);
      ctx.restore();
    }
  }
  function tutorial(id) {
    if (G.state.flags[id] || !TUT[id]) return Promise.resolve();
    G.state.flags[id] = true;
    G.Dialog.close();
    return new Promise((res) => G.Scenes.push(new TutorialScene(TUT[id], res)));
  }
  // first win in the forest → 逃跑 tutorial; first fight with 星河 & 紅纓 both Lv8+ → 合擊 tutorial
  async function afterFight(S) {
    if (!F('tut_flee')) await tutorial('tut_flee');
    await comboCheck();
  }
  async function comboCheck() {
    const m = G.state.members;
    if (!F('tut_combo2') && inParty('hongying') && m.xinghe && m.hongying && m.xinghe.lv >= 8 && m.hongying.lv >= 8) await tutorial('tut_combo2');
  }

  // ------------------------------------------------------------------ shared helpers
  // followers never resolve an awaited S.move (the engine only fires onArrive for the leader & NPCs): poll instead
  async function fmove(S, id, path) {
    const a = S.actor(id);
    if (!a) return;
    S.move(id, path, { wait: false });
    for (let i = 0; i < 400 && (a.queue.length || a.moving); i++) await S.wait(0.05);
  }
  async function fwalk(S, id, x, y) {
    const a = S.actor(id);
    if (!a) return;
    const dx = x - a.x, dy = y - a.y;
    await fmove(S, id, (dx > 0 ? 'R' : 'L').repeat(Math.abs(dx)) + (dy > 0 ? 'D' : 'U').repeat(Math.abs(dy)));
  }
  // the two silent cats (followers from ch1): a beat = an emote + one line of narration, only if the cat is with the party
  const hasPet = (id) => !!(MS() && !MS().hideFollowers && MS().followers.some((f) => f.id === id && f.visible));
  async function pet(S, id, emote, line) {
    if (!hasPet(id)) return;
    if (emote) S.emote(id, emote);
    if (line) await S.say('', line);
  }
  async function sayAll(S, who, lines) { for (const l of lines) await S.say(who, l); }
  async function savePrompt(S, text) {
    if (text) await S.say('', text);
    const c = await S.choice(['存檔', '離開'], { cancel: 1 });
    if (c === 0) await S.saveMenu();
  }
  const saveStone = (x, y, text) => ({ t: 'stone_lantern', x, y, label: '存檔', interact: async (S) => { await savePrompt(S, text); } });
  const forestWin = async (S) => { await afterFight(S); };
  // roaming enemy shorthand
  const foe = (id, troop, x, y, art, lv, extra) => Object.assign({ id, troop, x, y, art, lv, radius: 3, chase: 4, respawn: true, onWin: forestWin }, extra || {});

  // 阿山 follows the party (temporary escort, not a party member) — call from every forest map's onUpdate
  function escort(ms) {
    if (!V().c2_ashan) return;
    let a = ms.npcs.find((n) => n.id === 'ashan_f');
    const lead = ms.followers.length && !ms.hideFollowers ? ms.followers[ms.followers.length - 1] : ms.player;
    if (!a) {
      a = new G.Mapx.Actor({ id: 'ashan_f', sprite: spr('c2_ashan', 'woodcutter'), name: '阿山', x: lead.x, y: lead.y, dir: lead.dir, speed: 4.2, through: true, spawned: true, scripted: true, def: {} });
      ms.npcs.push(a);
      ms._esc = { x: lead.x, y: lead.y };
    }
    if (G.Script.busy() && a.scripted === 'hold') return;
    const e = ms._esc || (ms._esc = { x: lead.x, y: lead.y });
    if (lead.x !== e.x || lead.y !== e.y) {
      const tx = e.x, ty = e.y;
      e.x = lead.x; e.y = lead.y;
      if (Math.abs(tx - a.x) + Math.abs(ty - a.y) > 2) a.setCell(tx, ty);
      else if (tx !== a.x || ty !== a.y) {
        a.dir = tx > a.x ? 'right' : tx < a.x ? 'left' : ty > a.y ? 'down' : 'up';
        a.speed = lead.speed * ((G.Input.held('run') !== !!G.settings.runDefault) ? 1.65 : 1);
        a.startMove(tx, ty);
      }
    }
  }
  // the 銅鑼: 魔神仔-type roaming enemies run from the party for 30 s
  async function gongUse(S) {
    S.sfx('gong'); S.shake(3, 0.3);
    const forestMap = MS() && /^(mistforest|mist_|tiger_)/.test(MS().def.id);
    if (!forestMap) { await S.say('xinghe:think', '噹——！……這裡沒有魔神仔。路人都在看我。'); return; }
    V().c2_gong = 30;
    S.toast('噹——！魔神仔們摀著耳朵逃走了。', 'lantern');
  }
  const MOSIN_TROOPS = /^(forest_1|forest_4|lair_4)$/;
  function gongTick(ms, dt) {
    if (!(V().c2_gong > 0)) return;
    V().c2_gong = Math.max(0, V().c2_gong - dt);
    const p = ms.player;
    for (const e of ms.enemies) {
      if (!MOSIN_TROOPS.test(e.def.troop)) continue;
      e.stun = Math.max(e.stun, 0.15);
      if (e.moving) { e.updateMove(dt * 0.6); continue; }
      const dx = Math.sign(e.x - p.x) || (Math.random() < 0.5 ? 1 : -1), dy = Math.sign(e.y - p.y) || (Math.random() < 0.5 ? 1 : -1);
      if (Math.abs(e.x - p.x) + Math.abs(e.y - p.y) > 6) continue;
      for (const [sx, sy] of Math.random() < 0.5 ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]]) {
        if (!ms.blocked(e.x + sx, e.y + sy, e)) { e.dir = sx > 0 ? 'right' : sx < 0 ? 'left' : sy > 0 ? 'down' : 'up'; e.speed = 3.2; e.startMove(e.x + sx, e.y + sy); break; }
      }
    }
  }
  // 5.6: if 靈視 runs out while the party stands inside an illusion, push the leader to the nearest free cell
  function unstick(ms) {
    if (G.Script.busy() || ms.player.moving) return;
    const p = ms.player;
    if (!ms.solid[p.y * ms.w + p.x]) return;
    const illusionHere = ms.objects.some((o) => o.illusion && ms.objActive(o) && p.x >= o.x && p.x < o.x + (o.w || (G.Objects.get(o.t) || {}).w || 1) && p.y >= o.y && p.y < o.y + (o.h || (G.Objects.get(o.t) || {}).h || 1));
    if (!illusionHere) return;
    for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = p.x + dx, y = p.y + dy;
      if (x < 0 || y < 0 || x >= ms.w || y >= ms.h || ms.solid[y * ms.w + x]) continue;
      p.setCell(x, y); G.state.x = x; G.state.y = y;
      for (const f of ms.followers) f.setCell(x, y);
      G.UI.toast('幻象重新浮現，你被擠回了路上。');
      return;
    }
  }
  function forestTick(dt, ms) { escort(ms); gongTick(ms, dt); unstick(ms); }

  // =================================================================================================
  // 1.1 mistforest_n — 霧林・北
  // =================================================================================================
  const TALL = 'ccftBcfk';
  const LOW = 'uurusu';
  const MFN = (() => {
    const W = 40, H = 44;
    const R = forest(W, H, (open, keep) => {
      open(19, 0, 2, 2, '=');
      open(16, 2, 10, 3, ',');
      open(16, 5, 5, 2, ',');
      open(21, 5, 15, 2, '=');
      open(16, 7, 10, 1, ',');
      open(34, 7, 2, 1, '=');
      open(31, 8, 6, 4, ',');
      open(2, 5, 5, 4, ',');
      open(10, 8, 11, 2, '=');
      open(4, 9, 2, 1, '=');
      open(4, 10, 8, 2, '=');
      open(10, 12, 2, 6, '=');
      open(12, 13, 4, 3, ',');
      open(5, 15, 5, 3, ',');
      open(8, 18, 8, 6, ',');
      open(16, 22, 12, 2, '=');
      open(26, 16, 4, 6, ',');
      keep(0, 24, W, 2, 'r');
      open(10, 24, 2, 2, 'B'); open(26, 24, 2, 2, 'B');
      open(26, 26, 2, 6, '=');
      open(23, 27, 3, 3, ',');
      open(28, 30, 3, 2, '=');
      open(31, 27, 7, 6, ',');
      open(19, 32, 9, 1, '='); open(19, 33, 8, 1, '=');
      open(10, 26, 2, 2, '=');
      open(7, 28, 8, 5, ',');
      open(15, 31, 4, 2, '=');
      open(19, 34, 2, 10, '=');
      open(17, 37, 5, 3, ',');
    }, 11, TALL, LOW);
    // riverbanks: reeds & rocks instead of bare canopy
    for (let x = 0; x < W; x++) for (const y of [23, 26]) {
      if (R.g[y][x] === 'h') { R.g[y][x] = ','; R.d[y][x] = U.hash(x, y, 4) < 0.5 ? 'u' : 'r'; }
    }
    sprinkle(R, 'wggw', 0.12, 21, ',');
    sprinkle(R, 'r', 0.04, 22, '=');
    for (const [x, y, c] of [[3, 6, 's'], [6, 5, 'u'], [33, 11, 's'], [9, 22, 'R'], [14, 19, 's'], [27, 17, 'u'], [36, 28, 'R'], [32, 31, 's'],
      [8, 31, 'R'], [13, 29, 's'], [12, 14, 'u'], [5, 17, 'u'], [24, 29, 'r'], [17, 39, 'u']]) R.d[y][x] = c;
    clearDeco(R, 23, 3, 2, 2); clearDeco(R, 22, 4);
    return R;
  })();
  // red cloth marks on trunks beside the path (the tree is forced on that cell)
  const MFN_CLOTH = [[18, 8], [12, 12], [9, 13], [16, 21], [25, 26], [21, 34], [18, 41]];
  for (const [x, y] of MFN_CLOTH) { MFN.g[y][x] = ','; MFN.d[y][x] = 'c'; }

  async function hunterGhost(S) {
    if (F('ch2_hunter_ghost')) { await S.say('老獵人的魂', '等海那邊亮起來，我就走。你們……要讓它亮起來啊。'); return; }
    await S.say('老獵人的魂', '……喔？看得到我？');
    await S.say('', '（他看到星河腰間的引魂令，眼神變了。）');
    await S.say('老獵人的魂', '引魂令……好幾十年沒見過了。你是引魂人的徒弟？');
    await S.say('xinghe:think', '呃……算是吧？');
    await S.say('老獵人的魂', '那你聽好。這片山，以前沒有這麼吵。');
    await S.say('老獵人的魂', '魔神仔變多了，山豬變兇了，連老虎精都跑出來擄囝仔。');
    await S.say('老獵人的魂', '我在這座山走了六十年。山會吵，是因為……');
    await S.say('老獵人的魂', '海那邊的光，變弱了。死掉的東西走不了，就只好留在山裡。');
    if (inParty('baizhi')) await S.say('baizhi:sad', '……');
    await S.say('老獵人的魂', '我也是走不了的那一個。不過沒關係，我習慣了。');
    await S.say('老獵人的魂', '那邊那棵倒下的老樹下面，我藏了一些東西。拿去用吧。');
    S.flag('ch2_hunter_ghost');
    S.sfx('lantern');
    S.toast('東側空地的倒木下，浮現了一個寶箱。');
  }

  async function intro21(S) {
    S.flag('ch2_start');
    S.bgm('forest');
    await S.wait(dur(0.6));
    await S.say('', '（山路口。霧從樹林裡一團一團湧出來，把陽光濾成青綠色。）');
    await S.say('baizhi:think', '星河。陳伯說的「魔神仔」，是什麼？');
    await S.say('xinghe:think', '嗯……阿炳伯說，是住在山裡的小東西。矮矮的，紅臉，很愛惡作劇。');
    await S.say('xinghe:serious', '牠們會學人說話，學你認識的人叫你的名字。');
    await S.say('xinghe:serious', '你一回頭、一答應，就被牽走了。');
    await S.say('baizhi:think', '牽去哪裡？');
    await S.say('xinghe:think', '哪裡都有。有人在樹頂上被找到，有人在溪谷裡，有人在很遠很遠的山頭。');
    await S.say('xinghe:serious', '找到的時候，嘴巴裡塞滿了草跟泥巴。');
    await S.say('xinghe:serious', '可是他們會說：魔神仔請他們吃雞腿，好好吃。');
    await S.say('baizhi:surprise', '……雞腿是什麼？');
    await S.say('xinghe:laugh', '重點不是那個啦！');
    await S.move('player', 'DD');
    await S.say('', '（兩人往前走了幾步。身後的霧裡，傳來一個沙啞的聲音。）');
    S.sfx('ghost');
    await S.say('?', '……星河。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '陳伯？');
    S.face('player', 'up');
    await S.wait(dur(0.3));
    await pet(S, 'mochi', '!', '（麻糬全身的毛炸了起來，朝著霧裡低低地哈了一聲。）');
    await S.say('baizhi:normal', '星河，有人叫你。');
    S.face('baizhi', 'up');
    await S.say('', '（白芷已經轉過頭去了。）');
    S.face('player', 'down');
    await S.say('xinghe:surprise', '——不要回頭！');
    await S.say('', '（星河一把拉住白芷的手腕，把她轉回來。）');
    S.face('baizhi', 'down');
    S.sfx('ghost', 0.3);
    await S.say('', '（身後的霧裡，傳來一陣細細的、嘻嘻嘻的笑聲。然後，什麼都沒有了。）');
    await S.say('baizhi:surprise', '……那不是陳伯。');
    await S.say('xinghe:serious', '陳伯躺在床上，走兩步就喘。不可能追上來。');
    await S.say('xinghe:think', '……好險。');
    await S.say('baizhi:think', '星河。');
    await S.say('xinghe:think', '嗯？');
    await S.say('baizhi:think', '你的手，很熱。');
    await S.say('', '（星河低頭，發現自己還緊緊握著她的手腕。）');
    S.emote('player', '💧');
    await S.say('xinghe:shy', '啊、啊！抱歉！');
    await S.say('', '（星河放開手。白芷看著自己的手腕，歪了歪頭，好像不太明白他為什麼要道歉。）');
    S.emote('baizhi', '?');
    S.quest('q_ch2_main', 0);
    S.objective('穿過霧林，前往平溪');
  }

  async function azhu22(S) {
    S.flag('ch2_azhu_met');
    S.sfx('gong'); await S.wait(dur(0.4)); S.sfx('gong'); await S.wait(dur(0.4)); S.sfx('gong');
    await S.camera(12, 20, dur(0.8));
    await S.say('', '（「噹——噹——噹——」空地中央，一個少年用力敲著一面銅鑼。）');
    await S.say('阿竹', '阿爸——！阿山——！你聽到沒有——！');
    S.face('azhu_wood', 'up');
    S.emote('azhu_wood', '!');
    await S.jump('azhu_wood');
    await S.say('', '（少年轉過身，看到星河他們，嚇了一跳，舉起鑼槌當武器。）');
    await S.say('阿竹', '你、你們是人還是魔神仔！');
    await S.say('xinghe:normal', '人啦！九份來的！');
    await S.say('阿竹', '……魔神仔也會這麼說。');
    await S.say('baizhi:smile', '我們不會請你吃雞腿。');
    S.emote('azhu_wood', '…');
    await S.say('阿竹', '……');
    await S.say('阿竹', '……好，你們是人。魔神仔不會講這麼奇怪的話。');
    await S.say('xinghe:think', '你在找人？');
    await S.say('阿竹', '我阿爸。平溪的樵夫，叫阿山。三天前來這裡砍柴，就沒回來了。');
    await S.say('阿竹', '庄裡的人都說，是被魔神仔牽走了。');
    await S.say('阿竹', '老人說，要敲鑼、大聲喊名字，才能把人叫回來。');
    await S.say('阿竹', '可是我喊了三天，喉嚨都啞了……');
    await S.say('阿竹', '庄裡的大人都去找被虎姑婆擄走的囝仔了。沒人能來幫我。');
    await S.say('xinghe:surprise', '虎姑婆？');
    await S.say('阿竹', '平溪這半個月，不見了四個囝仔。大家說是虎姑婆。');
    await S.say('xinghe:serious', '……');
    const c = await S.choice(['我們幫你找。', '我們趕路……']);
    if (c === 1) {
      await S.say('baizhi:sad', '星河。他的聲音，啞掉了。');
      await S.say('xinghe:sad', '……我知道。好啦，我們會注意的。');
    }
    await S.say('阿竹', '真的？');
    await S.say('阿竹', '這個給你們。');
    await S.give('c2_gong', 1);
    await S.say('阿竹', '看到我阿爸，就敲鑼，喊他的名字。「阿山」。');
    await S.say('阿竹', '我……我要回平溪看我阿母了。她一個人在家，一直哭。');
    await S.say('阿竹', '拜託你們了！');
    S.cameraFollow();
    // he runs off north along the path
    const a = S.actor('azhu_wood');
    if (a) { a.through = true; a.speed = 5; }
    await S.move('azhu_wood', 'RRUUUUUUUU', { speed: 5 });
    await S.fadeActor('azhu_wood', 0, dur(0.4));
    S.remove('azhu_wood');
    S.quest('q_woodcutter', 0);
  }

  G.Maps.define('mistforest_n', {
    name: '霧林・北', subtitle: '九份南方，終年不散的霧',
    bgm: 'forest',
    start: [19, 2],
    light: { ambient: 0.35, color: '#0a2a24', playerR: 260, playerColor: '#d8ffe8' },
    particles: [{ type: 'mist', density: 1.6 }, 'leaves', { type: 'fireflies', density: 0.6 }],
    tiles: rows(MFN.g), deco: rows(MFN.d),
    objects: [
      { t: 'shrine_small', x: 23, y: 3, text: '福德正神', label: '調查',
        interact: async (S) => {
          await S.say('', '山路口的小小土地公廟。供桌上有人放了一顆橘子，還很新鮮。');
          if (!F('ch2_shrine_bow')) { S.flag('ch2_shrine_bow'); await S.say('xinghe:serious', '土地公伯仔，借過。保佑我們平安過山。'); }
        } },
      saveStone(22, 4, '山口的石燈籠。燈火在霧裡一明一暗。'),
      ...MFN_CLOTH.map(([x, y]) => ({ t: 'c2_redcloth', x, y, z: 2, label: '調查', interact: '樹枝上綁著一條褪色的紅布。打的結很奇怪，看了頭有點暈。' })),
      { t: 'log', x: 35, y: 32, label: '調查', interact: '一棵倒下的老樟樹。樹幹底下空空的，像是有人在這裡藏過東西。' },
      { t: 'log', x: 2, y: 8 }, { t: 'log', x: 12, y: 23 }, { t: 'log', x: 28, y: 20 },
      { t: 'rock_big', x: 33, y: 27 }, { t: 'stump', x: 17, y: 2 }, { t: 'rock_small', x: 25, y: 2 },
      { t: 'tree_fern', x: 16, y: 4 }, { t: 'tree_fern', x: 8, y: 18 }, { t: 'tree_fern', x: 37, y: 27 },
      { t: 'mushroom_glow', x: 36, y: 31 }, { t: 'mushroom_glow', x: 31, y: 32 }, { t: 'mushroom_glow', x: 7, y: 32 },
    ],
    chests: [
      { id: 'c2_n1', x: 34, y: 9, item: 'jinchuang', n: 2 },
      { id: 'c2_n2', x: 5, y: 7, item: 'lingxun', spirit: true, run: async (S) => { await S.give('c2_longan', 2); } },
      { id: 'c2_n3', x: 37, y: 32, item: 'c2_hunter_charm', spirit: true, if: (st) => !!st.flags.ch2_hunter_ghost },
    ],
    npcs: [
      { id: 'azhu_wood', sprite: spr('c2_azhu', 'child_m'), name: '阿竹', x: 12, y: 20, dir: 'down', if: (st) => !st.flags.ch2_azhu_met,
        talk: async (S) => { await azhu22(S); } },
      { id: 'hunter_ghost', sprite: spr('c2_hunter_ghost', 'ghost_m'), name: '老獵人的魂', x: 34, y: 30, dir: 'left', spirit: true, ghost: true,
        light: { r: 110, color: '#9ad8ff' }, talk: async (S) => { await hunterGhost(S); } },
    ],
    enemies: [
      foe('fn1', 'forest_1', 14, 14, 'mosina', 6),
      foe('fn2', 'forest_3', 6, 16, 'bamboo_spirit', 6),
      foe('fn3', 'lair_2', 28, 18, 'macaque_demon', 7),
      foe('fn4', 'forest_2', 24, 28, 'mushroom_imp', 6),
      foe('fn5', 'lair_1', 10, 30, 'boar_demon', 8),
      foe('fn6', 'forest_4', 20, 38, 'mosina', 6),
    ],
    events: [
      { id: 'intro', trigger: 'auto', if: (st) => !st.flags.ch2_start, run: intro21 },
      { id: 'azhu', trigger: 'touch', x: 8, y: 18, w: 8, h: 1, if: (st) => !st.flags.ch2_azhu_met, run: azhu22 },
      { id: 'north', trigger: 'touch', x: 19, y: 0, w: 2, h: 1, run: async (S) => {
        const jf = G.Maps.get(JIUFEN);
        if (jf && !F('ch2_done')) {
          const rowsJ = G.Mapx.val(jf.tiles);
          await S.warp(JIUFEN, 19, Math.max(1, rowsJ.length - 2), 'up');
          return;
        }
        await S.say('xinghe:think', '九份在北邊……陳伯說平溪在南邊。往前走吧。');
        await S.move('player', 'D');
      } },
    ],
    warps: [
      { x: 19, y: 43, w: 2, to: 'mist_loop', tx: 11, ty: 1, tdir: 'down' },
    ],
    onUpdate: (dt, ms) => forestTick(dt, ms),
  });

  // =================================================================================================
  // 1.2 mist_loop — 魔神仔的迷陣 (5.3)
  // =================================================================================================
  const MLP = (() => {
    const W = 24, H = 20;
    const R = forest(W, H, (open) => {
      open(11, 0, 2, 4, '=');
      open(5, 4, 14, 12, ',');
      open(0, 9, 5, 2, '='); open(19, 9, 5, 2, '=');
      open(11, 16, 2, 4, '=');
      open(1, 15, 4, 3, ',');
    }, 37, TALL, LOW);
    sprinkle(R, 'gw', 0.08, 41, ',');
    clearDeco(R, 1, 15, 4, 3);
    for (const [x, y, c] of [[2, 16, 'g'], [3, 17, 'g'], [1, 17, 'w'], [6, 5, 'u'], [17, 5, 's'], [6, 14, 'r'], [17, 13, 'u']]) R.d[y][x] = c;
    clearDeco(R, 11, 4, 2, 12); clearDeco(R, 5, 9, 14, 2); clearDeco(R, 10, 7, 3, 3);
    return R;
  })();
  // silver footprints for loopStep k, leading to the next correct exit (E, S, S, W).
  // Every step's trail runs from the clearing's centre (below the camphor) to that exit, and a spur joins it from
  // every place the party can arrive (north entrance, the three loop-back spots, the grove nook), so a trail is on
  // screen wherever the party stands. Paths are walked on the map grid (never through the tree or solid decor) and
  // the tall grass / flowers on print cells are cleared so nothing covers a print in 2D or 3D.
  const SEQ = ['E', 'S', 'S', 'W'];
  const EXIT_CELLS = { E: [[23, 9], [23, 10]], S: [[11, 19], [12, 19]], W: [[0, 9], [0, 10]] };
  const ARRIVE = { E: [1, 9, 'right'], W: [22, 9, 'left'], S: [11, 3, 'down'] };
  const PRINT_FROM = [[11, 1], [11, 3], [1, 9], [22, 9], [3, 15]];   // north entrance, loop-back spots, grove nook
  const HUB = [11, 10];
  function mazePrints() {
    const W = MLP.g[0].length, H = MLP.g.length;
    const open = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!MLP.walk[y][x] && !(x === 11 && y === 8) && ' gw'.includes(MLP.d[y][x]);
    const N4 = [[1, 0, 'right'], [-1, 0, 'left'], [0, 1, 'down'], [0, -1, 'up']];
    const field = (targets) => {   // BFS distance from a set of cells
      const d = new Map(), q = [];
      for (const [x, y] of targets) { d.set(x + ',' + y, 0); q.push([x, y]); }
      for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i], k = d.get(x + ',' + y);
        for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, kk = nx + ',' + ny; if (open(nx, ny) && !d.has(kk)) { d.set(kk, k + 1); q.push([nx, ny]); } }
      }
      return d;
    };
    // walk downhill on a distance field, keeping the heading while it still descends (straight runs, few turns)
    const walk = (d, from, stop) => {
      const path = [];
      let [x, y] = from, head = null;
      for (let n = 0; n < 200 && d.get(x + ',' + y) > 0 && !(stop && stop(x, y)); n++) {
        const k = d.get(x + ',' + y);
        const opts = N4.filter(([dx, dy]) => d.get((x + dx) + ',' + (y + dy)) === k - 1);
        const pick = opts.find((o) => o[2] === head) || opts[0];
        path.push([x, y, pick[2]]);
        x += pick[0]; y += pick[1]; head = pick[2];
      }
      path.push([x, y, head || 'down']);
      return path;
    };
    const out = [];
    SEQ.forEach((ex, k) => {
      const toExit = field(EXIT_CELLS[ex]);
      const prints = [];
      const near = (x, y) => prints.some((p) => Math.max(Math.abs(p[0] - x), Math.abs(p[1] - y)) <= 1);
      const lay = (path, i0) => { for (let i = i0; i < path.length; i += 2) if (!near(path[i][0], path[i][1])) prints.push(path[i]); };
      const trail = walk(toExit, HUB);
      lay(trail, 0);
      const onTrail = new Set(trail.map(([x, y]) => x + ',' + y));
      const toTrail = field(trail);
      for (const a of PRINT_FROM) {
        if (onTrail.has(a[0] + ',' + a[1])) continue;
        // a spur joins the trail where it meets it — or, when the exit is closer than the trail, runs straight out
        const spur = toExit.get(a[0] + ',' + a[1]) < toTrail.get(a[0] + ',' + a[1]) ? walk(toExit, a) : walk(toTrail, a);
        lay(spur.slice(0, -1), 1);
      }
      for (const [x, y, dir] of prints) {
        if ('gw'.includes(MLP.d[y][x])) MLP.d[y][x] = ' ';
        // live: loopStep changes while the map stays loaded (loopBack is a same-map warp, which keeps the object list)
        out.push({ t: 'c2_footprint', x, y, dir, seq: 40 - (toExit.get(x + ',' + y) || 0) / 2, spirit: true, step: k, live: true,
          if: (st) => !!st.flags.ch2_lingshi && !st.flags.ch2_maze_solved && (st.vars.loopStep || 0) === k });
      }
    });
    return out;
  }
  const printObjs = mazePrints();

  // music sinks a little further every loop (5.3: pitch drift → volume fallback)
  function loopMusic() {
    try {
      const bus = G.Audio.musicBus && G.Audio.musicBus();
      const ac = G.Audio.ctx;
      if (!bus || !ac) return;
      const k = MS() && MS().def.id === 'mist_loop' && !F('ch2_maze_solved') ? Math.max(0.55, 1 - 0.12 * (V().loopCount || 0)) : 1;
      bus.gain.setTargetAtTime(G.settings.music * k, ac.currentTime, 0.6);
    } catch (e) { /* audio not available */ }
  }
  async function loopBack(S, dir) {
    const [x, y, d] = ARRIVE[dir];
    await S.fadeOut(dur(0.5), '#dfe8e4');
    await S.warp('mist_loop', x, y, d, { fade: 0 });
    await S.wait(dur(0.3));
    loopMusic();
    await S.fadeIn(dur(0.6));
  }
  async function loopExit(S, dir) {
    const v = V();
    if (dir === 'N') { await S.warp('mistforest_n', 19, 42, 'up'); return; }
    if (F('ch2_maze_solved')) {
      if (dir === 'S') await S.warp('mistforest_s', 19, 1, 'down');
      else await loopBack(S, dir);
      return;
    }
    if (!F('ch2_lingshi')) {
      v.loopCount = (v.loopCount || 0) + 1;
      await loopBack(S, dir);
      if (v.loopCount === 1) {
        await S.say('', '（兩人又站在空地的入口。正中央，那棵綁紅布的老樟樹。）');
        await S.say('xinghe:think', '……這棵綁紅布的樟樹，剛剛是不是看過？');
        await S.say('baizhi:think', '看過。它的紅布，打的是同一個結。');
      } else if (v.loopCount === 2) {
        S.face('player', 'up');
        await S.say('xinghe:angry', '又是你！');
        await S.say('baizhi:smile', '你好。');
        await S.say('xinghe:angry', '不要跟它打招呼啦！');
      } else if (!F('ch2_grove_open')) await singingLight(S);
      else await S.say('baizhi:think', '……西南的蕨叢後面，那道光還在唱歌。');
      return;
    }
    // solving: the true path is east, south, south, west (SEQ)
    const k = v.loopStep || 0;
    if (SEQ[k] === dir) {
      v.loopStep = k + 1;
      S.sfx('bell');
      if (v.loopStep >= 4) { await mazeSolved(S); return; }
      await loopBack(S, dir);
      if (vis()) S.toast('銀色的腳印，又往前延伸了。');
      else if ((v.c2_wrong || 0) >= 3) S.toast(MOCHI_TOAST[SEQ[v.loopStep]]);   // 麻糬 keeps leading once she has started
    } else {
      v.loopStep = 0;
      v.c2_wrong = (v.c2_wrong || 0) + 1;
      await loopBack(S, dir);
      await S.say('xinghe:think', '……又回來了。腳印不是往這邊。');
      if (v.c2_wrong >= 3) await mazeHint(S, v.c2_wrong === 3);
    }
  }
  // safety net: after three wrong turns, 麻糬 (who smells spirit things, 靈視 or not) sniffs out the next exit.
  // Without the cat, 白芷 feels it. From then on every arrival in the clearing names the next exit.
  const MOCHI_HINT = {
    E: '（麻糬貼著地面嗅了嗅，朝東邊的路口跑了幾步，回頭「喵」了一聲。）',
    S: '（麻糬貼著地面嗅了嗅，朝南邊的路口跑了幾步，回頭「喵」了一聲。）',
    W: '（麻糬貼著地面嗅了嗅，朝西邊的路口跑了幾步，回頭「喵」了一聲。）',
  };
  const MOCHI_TOAST = { E: '麻糬朝東邊的路口喵了一聲。', S: '麻糬朝南邊的路口喵了一聲。', W: '麻糬朝西邊的路口喵了一聲。' };
  const BAIZHI_HINT = { E: '……東邊。那邊的霧，比較薄。', S: '……南邊。那邊的霧，比較薄。', W: '……西邊。那邊的霧，比較薄。' };
  async function mazeHint(S, first) {
    const next = SEQ[V().loopStep || 0];
    if (hasPet('mochi')) {
      if (!first) { S.toast(MOCHI_TOAST[next]); return; }
      await pet(S, 'mochi', '♪', MOCHI_HINT[next]);
      await S.say('xinghe:surprise', '麻糬聞得到那些腳印？……好，跟著麻糬走！');
    } else if (inParty('baizhi')) await S.say('baizhi:think', BAIZHI_HINT[next]);
    else S.toast(MOCHI_TOAST[next]);
  }
  // 靈視 running out inside the unsolved maze: say so, and point at the way to get it back
  async function sightLost(S) {
    await S.say('xinghe:surprise', '啊，腳印……不見了！');
    if (S.hasItem('lingxun')) await S.say('baizhi:think', '靈視退了。包袱裡還有七彩靈蕈，從「物品」再吃一朵吧。');
    else await S.say('baizhi:think', '靈蕈吃完了。西南蕨叢後面的蕈林，應該還採得到。');
  }
  function mazeTick(dt, ms) {
    forestTick(dt, ms);
    const v = V(), now = v.vision || 0, was = ms.c2vis == null ? now : ms.c2vis;
    ms.c2vis = now;
    if (!F('ch2_lingshi') || F('ch2_maze_solved')) return;
    if (was > 10 && now <= 10 && now > 0) G.UI.toast('靈視快要消退了。', { icon: 'mushroom' });
    if (was > 0 && now <= 0) v.c2_sightLost = true;   // in vars: survives a loop-back warp or a save before it is said
    if (now > 0) delete v.c2_sightLost;
    else if (v.c2_sightLost && !G.Script.busy() && G.Scenes.top() === ms) { delete v.c2_sightLost; G.Script.run(sightLost); }
  }
  async function singingLight(S) { // 2-4
    await S.say('xinghe:hurt', '……我們被魔神仔牽著走了。');
    await S.say('xinghe:hurt', '陳伯說得對。早知道就不要嘴硬說「有也沒關係」……');
    S.sfx('ghost'); S.sfx('ghost', 0.5);
    await S.say('', '（四周的霧裡，傳來嘻嘻嘻嘻的笑聲。很多個。忽遠忽近。）');
    S.face('baizhi', 'left');
    await S.say('', '（白芷忽然轉向西南。）');
    await S.say('baizhi:think', '……那邊。');
    await S.say('xinghe:think', '什麼？');
    await S.say('baizhi:think', '那邊有東西在唱歌。');
    S.flag('ch2_grove_glow');
    await S.camera(3, 16, dur(1.0));
    await S.say('', '（西南的蕨叢後面，霧裡透出一點光——紅的、綠的、藍的，一明一暗，像在呼吸。）');
    await S.say('', '（笑聲停了。好像連魔神仔都不敢靠近那道光。）');
    S.cameraFollow();
    await S.say('xinghe:surprise', '……那是什麼光？');
    await S.say('baizhi:smile', '不知道。可是，它不壞。');
    await S.say('', '（白芷撥開蕨葉，走了進去。）');
    S.flag('ch2_grove_open');
    S.refresh();
    await S.say('xinghe:surprise', '欸！等我！');
    await S.warp('mist_grove', 28, 14, 'left', { fade: 0.6 });
  }
  async function mazeSolved(S) { // 2-6 (解開時)
    S.flag('ch2_maze_solved');
    V().loopStep = 4;
    loopMusic();
    await S.fadeOut(dur(0.5), '#fff6e0');
    await S.warp('mistforest_s', 19, 1, 'down', { fade: 0 });
    S.light({ ambient: 0.4, color: '#1a2418' });
    await S.fadeIn(dur(0.8));
    await S.say('', '（這一次，眼前不是那片空地。霧散開了。前方是一條往下延伸的山徑，遠遠地，看得到黃昏的天空。）');
    await S.say('xinghe:laugh', '出來了！哈哈！魔神仔，你們輸了！');
    S.sfx('ghost');
    await S.say('', '（身後的林子裡，傳來一聲不甘心的「嘖」。）');
    await S.say('baizhi:smile', '牠們好像很不高興。');
    await S.say('xinghe:smug', '哼哼，誰叫牠們惹到九份第一的燈籠舖學徒。');
    S.quest('q_ch2_main', 2);
    S.objective('前往平溪');
  }

  G.Maps.define('mist_loop', {
    name: '魔神仔的迷陣', subtitle: (st) => (st.flags.ch2_maze_solved ? '霧散開了' : '四個方向，都回到這裡'),
    bgm: 'forest',
    start: [11, 6],
    light: (st) => (st.flags.ch2_maze_solved ? { ambient: 0.35, color: '#1a2a22' } : { ambient: 0.45, color: '#162420', playerR: 240, playerColor: '#e0f0e8' }),
    particles: (st) => (st.flags.ch2_maze_solved ? [{ type: 'mist', density: 0.8 }, 'leaves'] : [{ type: 'mist', density: 2.2 }]),
    tiles: rows(MLP.g), deco: rows(MLP.d),
    lights: (st) => (st.flags.ch2_grove_glow ? [{ x: 2, y: 16, r: 150, color: U.mix('#ff70b0', '#70e0ff', 0.5 + 0.5 * Math.sin(G.time * 0.9)), flicker: 0.2 }] : []),
    objects: [
      { t: 'tree_camphor', x: 11, y: 8, label: '調查', interact: async (S) => {
        await S.say('', '一棵很老的樟樹。樹枝上綁著一條紅布，打著一個奇怪的結。');
        if (vis() && !F('ch2_maze_solved')) await S.say('baizhi:think', '紅布在扭。它不想讓我們走。');
      } },
      { t: 'c2_redcloth', x: 11, y: 8, z: 2, lift: 30 },
      { t: 'c2_tongue', x: 11, y: 8, z: 3, maze: true, spirit: true },
      { t: 'bush', x: 4, y: 15, if: (st) => !st.flags.ch2_grove_open }, { t: 'bush', x: 4, y: 16, if: (st) => !st.flags.ch2_grove_open },
      { t: 'bush', x: 4, y: 17, if: (st) => !st.flags.ch2_grove_open },
      { t: 'tree_fern', x: 1, y: 14 }, { t: 'tree_fern', x: 0, y: 16 },
      ...printObjs,
    ],
    events: [
      { id: 'enter', trigger: 'auto', once: true, if: (st) => !st.flags.ch2_lingshi, run: async (S) => { // 2-3
        await S.say('', '（林中的空地。霧在四周圍成一圈白牆。正中央一棵老樟樹，樹枝上綁著一條紅布。）');
        await S.say('xinghe:think', '四個方向都有路……陳伯說平溪在南邊。');
        await S.say('baizhi:think', '那棵樹，在看我們。');
        await S.say('xinghe:surprise', '樹不會看人啦。');
        await S.say('baizhi:think', '……那條紅布，在看我們。');
        await S.say('xinghe:think', '……好，這個我沒辦法反駁。');
      } },
      { id: 'prints', trigger: 'auto', once: true, if: (st) => st.flags.ch2_lingshi && !st.flags.ch2_maze_solved && (st.vars.vision > 0), run: async (S) => { // 2-6
        S.sfx('lantern');
        await S.say('', '（空地上，在靈視的光裡，地面浮現出一串銀色的小腳印——光做的，一個一個，朝著出口走去。）');
        await S.say('xinghe:surprise', '有了！腳印！');
        await S.say('baizhi:think', '這些腳印……很小。像孩子的。');
        await S.say('xinghe:think', '……也許是以前，從這裡走出去的人留下的。');
        await pet(S, 'mochi', '♪', '（麻糬低頭聞了聞第一個腳印，尾巴豎得直直的，搶先走了出去。）');
    await S.say('xinghe:serious', '跟著走！');
        await S.say('', '（靈視中，樟樹上的紅布條像一條紅舌頭一樣，不甘心地扭了扭。）');
        S.quest('q_ch2_main', 1);
      } },
      { id: 'blind', trigger: 'auto', once: true, if: (st) => st.flags.ch2_lingshi && !st.flags.ch2_maze_solved && !(st.vars.vision > 0), run: async (S) => {
        await S.say('xinghe:think', '沒有靈視，我看不到那些腳印……');
        if (S.hasItem('lingxun')) await S.say('baizhi:think', '靈視退了。包袱裡還有七彩靈蕈，從「物品」再吃一朵吧。');
        else await S.say('baizhi:think', '靈蕈吃完了。西南蕨叢後面的蕈林，應該還採得到。');
      } },
      { id: 'exit_n', trigger: 'touch', x: 11, y: 0, w: 2, h: 1, run: (S) => loopExit(S, 'N') },
      { id: 'exit_s', trigger: 'touch', x: 11, y: 19, w: 2, h: 1, run: (S) => loopExit(S, 'S') },
      { id: 'exit_w', trigger: 'touch', x: 0, y: 9, w: 1, h: 2, run: (S) => loopExit(S, 'W') },
      { id: 'exit_e', trigger: 'touch', x: 23, y: 9, w: 1, h: 2, run: (S) => loopExit(S, 'E') },
    ],
    warps: [
      { x: 1, y: 15, h: 3, to: 'mist_grove', tx: 28, ty: 14, tdir: 'left', if: (st) => !!st.flags.ch2_grove_open },
    ],
    onEnter: async () => { loopMusic(); },
    onUpdate: (dt, ms) => mazeTick(dt, ms),
  });

  // =================================================================================================
  // 1.3 mist_grove — 七彩靈蕈林 (2-5 first 靈視)
  // =================================================================================================
  const MGR = (() => {
    const W = 30, H = 24;
    const R = forest(W, H, (open, keep) => {
      open(3, 3, 24, 18, 'g');
      open(27, 14, 3, 2, 'g');
      keep(12, 9, 6, 5, 'l');
    }, 53, 'ccffk', 'uuf');
    return R;
  })();
  const MUSH = [[4, 4], [9, 4], [20, 4], [25, 5], [10, 10], [20, 11], [4, 12], [25, 12], [19, 18], [24, 18], [5, 19], [12, 19], [16, 8], [7, 15], [22, 15]];
  const HARVEST = [[6, 6], [23, 8], [8, 18]];
  const HUES = ['#ff5a6a', '#ffa040', '#ffe060', '#70f080', '#60b8ff', '#7a70ff', '#d070ff'];
  const hueAt = (i, t) => { const p = (i + t * 0.35) % 7, a = Math.floor(p); return U.mix(HUES[a], HUES[(a + 1) % 7], p - a); };
  const groveFx = () => { const ms = MS(); if (!ms) return {}; if (!ms.c2fx) ms.c2fx = { line: 0, heart: 0, thread: 0, kaleido: 0, ripples: [], mushFlash: 0 }; return ms.c2fx; };

  function drawGrove(ctx, t, ms) {
    const fx = ms.c2fx;
    if (!fx) return;
    const k = fxK();
    ctx.save();
    // firefly line: from 星河's hand, out of the grove toward the maze (east exit)
    if (fx.line > 0) {
      const p = ms.player;
      const x0 = p.px + 14, y0 = p.py - 52, x1 = 29 * T + 32, y1 = 14 * T + 20;
      const n = 46;
      for (let i = 0; i < n * fx.line; i++) {
        const u = i / n;
        const x = U.lerp(x0, x1, u) + Math.sin(u * 9 + t * 1.3) * 26 * (1 - u * 0.3);
        const y = U.lerp(y0, y1, u) - Math.sin(u * Math.PI) * 90 + Math.cos(u * 7 + t) * 8;
        const a = (0.55 + 0.45 * Math.sin(t * 5 + i)) * Math.min(1, fx.line * 1.5);
        ctx.fillStyle = `rgba(220,255,140,${(a * 0.25).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(250,255,210,${a.toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }
    // the lamps in their chests and the red thread between them
    if (fx.heart > 0) {
      const b = ms.actor('baizhi'), p = ms.player;
      const pts = [];
      if (b) pts.push([b.px, b.py - 50, '#ffffff', 22, 1]);
      pts.push([p.px, p.py - 50, '#fff2d0', 10, 0.8]);
      for (const [x, y, c, r, w] of pts) {
        const fl = 1 + 0.15 * Math.sin(t * 6 + x);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4 * fl);
        g.addColorStop(0, U.rgba(c, 0.95 * fx.heart));
        g.addColorStop(0.35, U.rgba('#cfe8ff', 0.5 * fx.heart * w));
        g.addColorStop(1, U.rgba('#cfe8ff', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4 * fl, 0, Math.PI * 2); ctx.fill();
        // flame tongue
        ctx.fillStyle = U.rgba('#ffffff', 0.85 * fx.heart);
        ctx.beginPath(); ctx.moveTo(x - r * 0.35, y + r * 0.3); ctx.quadraticCurveTo(x, y - r * (1.1 + 0.2 * Math.sin(t * 8)), x + r * 0.35, y + r * 0.3); ctx.closePath(); ctx.fill();
      }
      if (fx.thread > 0 && b) {
        ctx.strokeStyle = `rgba(255,60,70,${(0.85 * fx.thread).toFixed(3)})`; ctx.lineWidth = 2;
        ctx.shadowColor = '#ff4050'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(b.px, b.py - 50);
        ctx.quadraticCurveTo((b.px + p.px) / 2, Math.min(b.py, p.py) - 20 + Math.sin(t * 3) * 6, p.px, p.py - 50); ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    // laughter as coloured ripples
    for (const r of fx.ripples) {
      const age = t - r.t0;
      if (age < 0 || age > 3) continue;
      ctx.strokeStyle = U.rgba(HUES[r.c % 7], Math.max(0, 0.6 * (1 - age / 3)) * k);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, 30 + age * 160, (30 + age * 160) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // the talking mushroom glints
    if (fx.mushFlash > 0) {
      const g = ctx.createRadialGradient(15 * T, 10 * T + 10, 0, 15 * T, 10 * T + 10, 150);
      g.addColorStop(0, `rgba(255,240,200,${(fx.mushFlash * 0.7).toFixed(3)})`); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.fillRect(15 * T - 150, 10 * T - 140, 300, 300);
    }
    ctx.restore();
    // canopy kaleidoscope (screen space, gentle; scaled by the photosensitivity setting)
    if (fx.kaleido > 0 && k > 0.05 && !ms.view3d) {   // screen-space: 2D renderer only
      ctx.save();
      ctx.setTransform(G.S, 0, 0, G.S, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      const a = fx.kaleido * 0.35 * k;
      ctx.translate(G.W / 2, G.H * 0.38);
      for (let ring = 0; ring < 4; ring++) {
        const n = 6 + ring * 3, R0 = 80 + ring * 70;
        ctx.save();
        ctx.rotate(t * (ring % 2 ? -0.08 : 0.06));
        for (let i = 0; i < n; i++) {
          ctx.rotate((Math.PI * 2) / n);
          ctx.fillStyle = U.rgba(hueAt(i + ring * 2, t), a * (0.7 - ring * 0.12));
          ctx.beginPath();
          ctx.ellipse(R0, 0, 34 + ring * 8, 12 + ring * 3, Math.sin(t * 0.4 + i) * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  async function tweenPsy(to, sec) {
    if (V().c2_psy == null) V().c2_psy = 0.15;
    await G.Tweens.to(V(), { c2_psy: to }, dur(sec), 'inOutQuad');
  }
  async function breathe(S, ms) {
    for (let i = 0; i < 3; i++) {
      await G.Tweens.to(ms.lightCfg, { ambient: 0.55 }, dur(1.1), 'inOutQuad');
      await G.Tweens.to(ms.lightCfg, { ambient: 0.72 }, dur(1.1), 'inOutQuad');
    }
  }
  async function grove25(S) {
    const ms = MS();
    const fx = groveFx();
    V().c2_psy = 0;
    S.bgm('mushroom', { fade: 3.0 });
    await S.wait(dur(0.8));
    await S.say('', '（霧在林緣停住，像一堵看不見的牆。牆內，是另一個世界。）');
    await S.camera(14, 11, dur(1.6));
    await S.say('', '（地上的苔蘚發著青綠色的微光。一叢叢蕈菇從樹根、倒木、石縫裡長出來——紅、橙、黃、綠、藍、靛、紫，一明，一暗，像在呼吸。）');
    await S.say('', '（正中央，一株巨大的蕈傘撐在小池塘上。池水倒映著所有的光。）');
    S.cameraFollow();
    await S.say('xinghe:surprise', '……哇。');
    await S.say('baizhi:surprise', '……');
    await S.say('baizhi:smile', '它們在呼吸。你聽。');
    await S.say('xinghe:think', '蘑菇不會呼吸……吧？');
    await S.wait(dur(1.2));
    await S.say('', '（光，一明，一暗。）');
    await S.say('xinghe:think', '……好吧。也許會。');
    // walk to the stele
    await S.move('player', 'LLLLLLLLLLUUUUUULLL');
    S.face('player', 'up');
    await S.camera(15, 8, dur(0.8));
    await S.say('', '（池邊一塊長滿青苔的石碑。星河走過去，撥開苔蘚。）');
    S.sfx('switch');
    await S.narrate(['此地有蕈，七色而光，名曰七彩靈蕈。', '非毒非藥。食半朵，可見陰陽之隔。', '心靜者見真，心亂者見魔。慎之。', '　　　　　　　　　太虛觀　清虛　題'], { veil: 0.86, color: '#d8f0c8' });
    await S.say('xinghe:surprise', '太虛觀……清虛！是陳伯要我們找的人！');
    await S.say('baizhi:think', '他來過這裡。');
    await S.say('xinghe:think', '「可見陰陽之隔」……意思是吃了，就看得到平常看不到的東西？');
    await S.say('xinghe:think', '說不定……就看得穿魔神仔的迷陣？');
    await S.say('baizhi:think', '「心靜者見真」。');
    await fmove(S, 'baizhi', 'R');
    S.face('baizhi', 'up');
    await S.say('', '（白芷蹲下，看著一朵藍紫色的小蕈。蕈傘下的光，一明一暗地照在她臉上。）');
    await S.say('baizhi:smile', '我想，我可以心靜。');
    await S.say('xinghe:surprise', '欸，等等，妳不要隨便吃路邊的——');
    await pet(S, 'yuyuan', '♪', '（芋圓已經張嘴湊向另一朵蕈。星河一把把牠抱開。）');
    S.face('baizhi', 'player');
    await S.say('baizhi:think', '你要吃嗎？');
    await S.say('xinghe:think', '我……我現在心很亂。');
    await S.say('baizhi:think', '為什麼？');
    S.emote('player', '💧');
    await S.say('xinghe:shy', '……沒、沒事。');
    await S.say('baizhi:smile', '那我們先坐下來。等你的心靜下來。');
    // sit by the pond on the old log
    S.hideFollowers(false);
    await S.move('player', 'L');
    await fmove(S, 'baizhi', 'LLL');
    for (const f of ms.followers) if (f.id !== 'baizhi') { f.setCell(16, 8); f.dir = 'down'; }
    S.face('player', 'down'); S.face('baizhi', 'down');
    await S.say('', '（兩人在池邊的倒木旁坐下。只有蟲鳴，和蕈菇呼吸的光。）');
    await pet(S, 'mochi', '♪', '（麻糬在白芷腳邊捲成一團，尾巴蓋住鼻子。芋圓趴在星河腿上，一臉不甘心。）');
    await S.say('', '（星河閉上眼睛，深深吸一口氣，慢慢吐出來。一次。兩次。三次。）');
    const pb = breathe(S, ms);
    await tweenPsy(0.25, 6.6);
    await pb;
    await S.say('xinghe:normal', '……好了。');
    await S.say('baizhi:smile', '半朵。石碑說的。');
    await S.say('', '（白芷把那朵小蕈輕輕分成兩半，一半遞給星河。）');
    await S.say('xinghe:think', '……要是我們變成蘑菇怎麼辦？');
    await S.say('baizhi:think', '那我們就一起呼吸。');
    await S.say('xinghe:laugh', '……妳講話真的很奇怪。');
    S.sfx('item');
    await S.say('', '（兩人吃下靈蕈。味道像雨後的泥土，又有一點點甜。）');
    await S.wait(dur(1.2));
    await S.say('', '（一開始，什麼都沒有發生。）');
    await S.say('xinghe:think', '……好像沒感覺耶。是不是——');
    // the vision opens
    S.sfx('magic');
    S.particles([{ type: 'fireflies', density: 3 }, { type: 'motes', density: 1.6 }, { type: 'sparkles', density: 0.6 }]);
    await S.say('', '（池水的倒影，先動了。）');
    await tweenPsy(1.0, 6);
    await S.say('', '（蕈菇的光開始跟著兩人的心跳一起呼吸。樹幹上的紋路像水波一樣緩緩流動。每一片葉子的邊緣，都鑲上了一圈虹彩。）');
    await S.say('', '（霧不再是霧了。它變成一條一條透明的河，在樹與樹之間，慢慢地流著光。）');
    await S.say('xinghe:surprise', '白芷……樹……樹在流動……');
    await S.say('baizhi:smile', '嗯。它們一直都在流。只是平常太慢，我們看不到。');
    await S.say('', '（地上的苔蘚亮起無數細細的光脈，像葉脈、像河流、像一張地圖——全部朝著同一個方向流去：森林的南方。）');
    V().c2_animals = true; S.refresh();
    for (const id of ['spirit_leopard', 'spirit_muntjac', 'spirit_magpie']) { const a = S.actor(id); if (a) { a.alpha = 0; G.Tweens.to(a, { alpha: 1 }, dur(1.5)); } }
    await S.wait(dur(1.2));
    await S.say('', '（光脈之中，浮現小小的、光做的動物。一隻石虎從倒木後探出頭；一隻山羌豎著耳朵；一隻台灣藍鵲拖著寶藍色的長尾巴，從他們頭頂滑過去。）');
    S.move('spirit_magpie', 'LLLLDD', { wait: false, speed: 3 });
    await S.say('xinghe:laugh', '是藍鵲！好漂亮……牠的尾巴好長……');
    await S.say('baizhi:smile', '它們是這座山的記憶。');
    await S.say('baizhi:think', '每一隻走過這裡的動物，都在這裡留下一點點光。');
    await pet(S, 'mochi', '♥', '（光做的石虎湊到麻糬面前，兩隻貓碰了碰鼻子。麻糬的鬍鬚上，沾了一點光。）');
    S.face('player', 'right');
    await S.say('', '（星河伸出手。一隻螢火蟲停在他的指尖——接著是兩隻、十隻、一百隻。）');
    await G.Tweens.to(fx, { line: 1 }, dur(3), 'inOutQuad');
    await S.say('', '（牠們排成一條發光的線，從他的指尖一路延伸進森林深處。）');
    await S.say('xinghe:surprise', '牠們在……指路？');
    S.face('player', 'left');
    await S.say('', '（星河轉頭看白芷——）');
    await G.Tweens.to(fx, { heart: 1 }, dur(1.6), 'inOutQuad');
    await S.say('', '（在靈視裡，白芷的輪廓是半透明的。她的身體裡，有一團安靜的、白色的火焰，正緩緩地燃燒。像一盞燈。）');
    await S.say('xinghe:surprise', '……');
    await S.say('', '（他眨了眨眼。火焰還在。）');
    S.face('baizhi', 'right');
    await S.say('baizhi:think', '星河？');
    await S.say('', '（白芷也看向他。她的眼睛慢慢睜大。）');
    await S.say('baizhi:surprise', '……星河，你的心口。');
    await S.say('xinghe:think', '我的心口？');
    await S.say('baizhi:surprise', '有一盞燈。小小的，在你的胸口裡面亮著。');
    await S.say('baizhi:think', '跟我的……顏色一樣。');
    S.face('player', 'down');
    await G.Tweens.to(fx, { thread: 1 }, dur(0.5));
    await S.say('', '（星河低頭。他看不見自己胸口裡有什麼。他只看見——白芷的火焰，和他胸口那一點微光之間，有一條細細的、紅色的線，輕輕地連在一起。）');
    await S.wait(dur(1.0));
    await G.Tweens.to(fx, { thread: 0 }, dur(0.4));
    await S.say('', '（紅線一閃，不見了。）');
    await S.say('xinghe:think', '……我們，是不是吃太多了。');
    await S.say('baizhi:laugh', '我們只吃了半朵。');
    const p = ms.player, b = ms.actor('baizhi');
    for (let i = 0; i < 4; i++) fx.ripples.push({ x: p.px, y: p.py - 30, t0: ms.t + i * 0.45, c: i * 2 });
    if (b) for (let i = 0; i < 3; i++) fx.ripples.push({ x: b.px, y: b.py - 30, t0: ms.t + 0.2 + i * 0.5, c: i * 2 + 1 });
    await S.say('', '（兩人一起笑出來。笑聲在林子裡變成彩色的漣漪，一圈一圈散開，撞到樹幹，又彈回來。）');
    G.Tweens.to(fx, { heart: 0.35 }, dur(1.2));
    await G.Tweens.to(fx, { kaleido: 1 }, dur(2.5), 'inOutQuad');
    await S.say('', '（他們躺在苔蘚上，看著頭頂的林冠。林冠的縫隙裡，天空變成了一面萬花筒——葉子的影子不停地分裂、旋轉、重組，像一朵開了又開的花。）');
    await S.say('xinghe:smile', '阿炳伯要是看到這個，可以講一百年。');
    await S.say('baizhi:smile', '那你就講給他聽。');
    await S.say('xinghe:smile', '他不會信的。');
    await S.say('baizhi:think', '信不信，不重要。');
    await S.say('baizhi:smile', '重要的是，有人願意講。');
    await G.Tweens.to(fx, { mushFlash: 1 }, dur(0.25));
    G.Tweens.to(fx, { mushFlash: 0 }, dur(1.2));
    await S.say('', '（旁邊一朵大蕈菇的光，忽然閃了一下。）');
    await S.say('蕈菇', '話說——');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '阿炳伯！？');
    await S.say('baizhi:think', '那是蘑菇。');
    await S.say('xinghe:think', '……我知道。');
    // the colours sink back
    G.Tweens.to(fx, { kaleido: 0, heart: 0 }, dur(4));
    await S.say('', '（慢慢地，光的呼吸變慢了。顏色一層一層沉回原處。）');
    await tweenPsy(0.35, 5);
    await S.say('', '（螢火蟲的線還在。它從池邊延伸出去，穿過蕨叢，指向迷陣的方向。）');
    await S.say('xinghe:normal', '……我好像，回來了一點。');
    await S.say('baizhi:smile', '可是你的眼睛，還看得到。');
    await S.say('xinghe:think', '嗯。那條螢火蟲的路……還在。');
    await S.say('xinghe:serious', '白芷，我知道怎麼走出去了。迷陣的地上——一定有真正的腳印。');
    await S.say('', '（星河蹲下，小心地採了幾朵靈蕈，用手帕包起來。）');
    await S.give('lingxun', 3);
    await S.say('xinghe:smile', '多帶幾朵。……我是說，以防萬一。');
    await S.say('baizhi:think', '以防萬一，再迷路一次？');
    await S.say('xinghe:laugh', '對對對，就是這樣！');
    S.vision(120);
    delete V().c2_psy;
    S.flag('ch2_lingshi');
    S.quest('q_ch2_main', 1);
    S.objective('用靈視找出迷陣的出口');
    S.gather();
    S.cameraFollow();   // release the stele framing (S.camera(15, 8) above) — the player walks off from here
    await tutorial('tut_lingshi');
    G.Tweens.to(fx, { line: 0 }, dur(6));
  }
  async function harvest(S, i) {
    const ms = MS();
    ms.c2picked = ms.c2picked || {};
    if (ms.c2picked[i]) { await S.say('', '蕈菇的光還很微弱。過一陣子再來吧。'); return; }
    ms.c2picked[i] = true;
    await S.say('', '一叢七彩靈蕈，一明一暗地呼吸著。');
    await S.give('lingxun', 1);
  }

  G.Maps.define('mist_grove', {
    name: '七彩靈蕈林', subtitle: '霧停住的地方',
    bgm: 'mushroom',
    start: [27, 14],
    light: { ambient: 0.7, color: '#07051a', playerR: 200, playerColor: '#e8d8ff', glow: 0.4 },
    particles: [{ type: 'fireflies', density: 2.2 }, { type: 'motes', density: 1.2 }],
    psychedelic: (st) => (st.vars.c2_psy != null ? st.vars.c2_psy : 0.15),
    tiles: rows(MGR.g), deco: rows(MGR.d),
    lights: () => MUSH.map(([x, y], i) => ({ x, y, r: 150, color: hueAt(i, G.time), flicker: 0.15 }))
      .concat([{ x: 14.5, y: 10, r: 300, color: hueAt(3, G.time * 0.6), flicker: 0.05 }], HARVEST.map(([x, y], i) => ({ x, y, r: 110, color: hueAt(i + 4, G.time), flicker: 0.2 }))),
    objects: [
      ...MUSH.map(([x, y]) => ({ t: 'mushroom_glow', x, y })),
      ...HARVEST.map(([x, y], i) => ({ t: 'mushroom_glow', x, y, v: i })),
      { t: 'mushroom_giant', x: 14, y: 10 },
      { t: 'grave', x: 15, y: 7, v: 1, label: '調查', interact: async (S) => {
        await S.narrate(['此地有蕈，七色而光，名曰七彩靈蕈。', '非毒非藥。食半朵，可見陰陽之隔。', '心靜者見真，心亂者見魔。慎之。', '　　　　　　　　　太虛觀　清虛　題'], { veil: 0.86, color: '#d8f0c8' });
      } },
      { t: 'log', x: 12, y: 7 }, { t: 'log', x: 20, y: 16 },
      { t: 'stump', x: 7, y: 9 }, { t: 'rock_big', x: 22, y: 5 }, { t: 'tree_fern', x: 4, y: 8 }, { t: 'tree_fern', x: 25, y: 9 },
      { t: 'vine_curtain', x: 5, y: 3 }, { t: 'vine_curtain', x: 11, y: 3 }, { t: 'vine_curtain', x: 18, y: 3 }, { t: 'vine_curtain', x: 24, y: 3 },
      { t: 'crystal', x: 3, y: 16 }, { t: 'lotus', x: 13, y: 12 }, { t: 'lotus', x: 16, y: 12 },
    ],
    npcs: [
      { id: 'spirit_leopard', sprite: spr('c2_light_leopard', 'cat'), name: '光做的石虎', x: 9, y: 14, dir: 'right', wander: 2, spirit: true, ghost: true,
        if: (st) => !!(st.flags.ch2_lingshi || st.vars.c2_animals), light: { r: 80, color: '#ffe8a0' },
        talk: ['（光做的石虎。牠看了你一眼，鑽進苔蘚裡不見了。）'] },
      { id: 'spirit_muntjac', sprite: spr('c2_light_muntjac', 'dog'), name: '光做的山羌', x: 21, y: 15, dir: 'left', wander: 2, spirit: true, ghost: true,
        if: (st) => !!(st.flags.ch2_lingshi || st.vars.c2_animals), light: { r: 80, color: '#b8ffd8' },
        talk: ['（光做的山羌，豎著耳朵聽你的呼吸。）'] },
      { id: 'spirit_magpie', sprite: spr('c2_light_magpie', 'crow'), name: '光做的藍鵲', x: 19, y: 6, dir: 'left', wander: 3, spirit: true, ghost: true,
        if: (st) => !!(st.flags.ch2_lingshi || st.vars.c2_animals), light: { r: 80, color: '#7ab8ff' },
        talk: ['（一隻藍鵲拖著寶藍色的長尾巴，從你頭頂滑過去。）'] },
    ],
    events: [
      { id: 'vision', trigger: 'auto', if: (st) => !st.flags.ch2_lingshi, run: grove25 },
      ...HARVEST.map(([x, y], i) => ({ id: 'harvest' + i, trigger: 'action', x, y, label: '採集', run: (S) => harvest(S, i) })),
    ],
    warps: [
      { x: 29, y: 14, h: 2, to: 'mist_loop', tx: 3, ty: 15, tdir: 'right' },
    ],
    drawOver: drawGrove,
    onUpdate: (dt, ms) => forestTick(dt, ms),
  });

  // =================================================================================================
  // 1.4 mistforest_s — 霧林・南
  // =================================================================================================
  const MFS = (() => {
    const W = 40, H = 44;
    const R = forest(W, H, (open) => {
      open(19, 0, 2, 10, '=');
      open(19, 6, 9, 2, '=');
      open(28, 5, 2, 3, ',');
      open(30, 3, 8, 7, ',');
      open(14, 10, 7, 1, '='); open(14, 11, 6, 1, '=');
      open(14, 12, 2, 7, '=');
      open(10, 12, 4, 1, ','); open(9, 12, 1, 1, ',');
      open(16, 13, 5, 3, ',');
      open(14, 19, 12, 9, ',');
      open(26, 24, 6, 2, '=');
      open(26, 19, 2, 2, ','); open(28, 16, 5, 5, ',');
      open(30, 26, 2, 8, '=');
      open(26, 29, 4, 3, ',');
      open(30, 34, 7, 2, '=');
      open(35, 36, 2, 2, '=');
      open(35, 38, 2, 1, ',');
      open(16, 36, 16, 2, '=');
      open(19, 38, 2, 6, '=');
      open(21, 39, 7, 3, ',');
      open(5, 26, 10, 2, '=');
      open(5, 28, 2, 2, '=');
      open(2, 30, 6, 4, ',');
      open(13, 31, 6, 3, ',');
      open(16, 34, 2, 2, '=');
    }, 71, TALL, LOW);
    sprinkle(R, 'wggw', 0.1, 73, ',');
    sprinkle(R, 'r', 0.04, 74, '=');
    for (const [x, y, c] of [[31, 8, 'u'], [37, 3, 's'], [15, 21, 's'], [24, 26, 'r'], [3, 31, 'u'], [7, 33, 'g'], [18, 31, 'u'], [22, 41, 's'], [32, 16, 'u'], [26, 31, 'r']]) R.d[y][x] = c;
    // the 樵夫's grove: a great camphor that 阿山 sits in
    clearDeco(R, 28, 5, 2, 3); clearDeco(R, 30, 3, 8, 7); clearDeco(R, 14, 19, 12, 9);
    R.d[4][35] = ' ';
    for (const [x, y, c] of [[31, 8, 'u'], [37, 3, 's'], [36, 9, 'w'], [32, 4, 'g'], [15, 21, 's'], [24, 26, 'r'], [16, 26, 'g']]) R.d[y][x] = c;
    return R;
  })();
  const MFS_CLOTH = [[18, 4], [21, 11], [13, 16], [29, 27], [21, 37]];
  for (const [x, y] of MFS_CLOTH) { MFS.g[y][x] = ','; MFS.d[y][x] = 'c'; }
  const ILLUSION = [[28, 5], [28, 6], [28, 7], [29, 5], [29, 6], [29, 7]];

  async function woodcutter27(S) {
    const ms = MS();
    await S.camera(35, 6, dur(1));
    await S.say('', '（林中的小空地。一棵大樟樹的高處枝椏上，坐著一個中年男人。他衣衫破爛，滿臉泥巴，正開心地啃著什麼。）');
    await S.say('', '（樹下，三個紅臉的矮小影子圍成一圈，拍手、跳舞、嘻嘻嘻地笑。）');
    S.sfx('ghost');
    await S.say('阿山', '好吃……好吃……雞腿……');
    await S.say('阿山', '這麼好吃的雞腿，我一世人沒吃過……');
    await S.say('', '（在靈視裡，看得一清二楚：他手上抓的，是一把蚱蜢和一團爛泥巴。）');
    await S.say('baizhi:think', '星河。那不是雞腿。');
    await S.say('xinghe:serious', '……我知道。');
    await pet(S, 'yuyuan', '♥', '（一聽到「雞腿」，芋圓的耳朵立刻轉了過來。）');
    await S.say('baizhi:think', '雞腿……原來是長那樣的嗎？');
    await S.say('xinghe:angry', '不是啦！真正的雞腿不是那樣啦！');
    await pet(S, 'yuyuan', '…', '（芋圓看清楚那是蚱蜢，默默把頭轉了回去。）');
    for (const id of ['mosin_a', 'mosin_b', 'mosin_c']) { S.face(id, 'left'); S.emote(id, '!'); }
    await S.say('', '（魔神仔們同時轉過頭來。三張紅臉，三排尖尖的小牙。）');
    await S.say('魔神仔', '……看到了？');
    await S.say('魔神仔', '看到了！');
    await S.say('魔神仔', '看到了看到了看到了！');
    await S.say('xinghe:serious', '阿竹說的——敲鑼！喊名字！');
    await S.say('', '（星河舉起銅鑼。）');
    await S.say('xinghe:angry', '阿——山——！');
    S.sfx('gong'); S.shake(5, 0.5); S.flash('#fff6d0', 0.3, 0.5);
    for (const id of ['mosin_a', 'mosin_b', 'mosin_c']) S.jump(id);
    await S.say('', '（「噹——！」鑼聲在林子裡炸開。魔神仔們抱著頭尖叫。樹上的阿山渾身一抖。）');
    await S.say('魔神仔', '吵死了吵死了！搶我們的客人！');
    S.cameraFollow();
    const troop = vis() ? 't_c2_woodcutter_v' : 't_c2_woodcutter';
    const r = await S.battle(troop, { loseOk: true, onTurn: phantomTurn, intro: phantomTurn });
    for (const id of ['mosin_a', 'mosin_b', 'mosin_c']) S.remove(id);
    if (r === 'lose') {
      for (const m of G.Party.active()) m.hp = Math.max(m.hp, Math.round(G.Party.stats(m.id).mhp * 0.25));
      await S.say('', '（魔神仔們也打累了，嘻嘻哈哈地鑽回霧裡。）');
    } else await S.say('', '（魔神仔們尖叫著四散，鑽進霧裡不見了。）');
    S.sfx('gong');
    await S.say('', '（星河再敲一次鑼。）');
    await S.say('xinghe:serious', '阿山伯！你兒子阿竹在等你回家！');
    await S.say('', '（樹上的阿山愣住了。他低頭看著手上——蚱蜢跳走了，泥巴從指縫間滑下去。）');
    await S.say('阿山', '……噗！呸！呸呸！');
    await S.say('阿山', '這、這是什麼！我在吃什麼！');
    await S.say('阿山', '我……我怎麼在樹上？');
    const a = S.actor('ashan');
    if (a) { await G.Tweens.to(a, { offsetY: 0 }, dur(0.6), 'inQuad'); S.sfx('hit'); S.shake(3, 0.2); }
    await S.say('', '（阿山手忙腳亂地爬下樹，一屁股坐在地上。）');
    await S.say('阿山', '我只記得……在砍柴，聽到我阿母在叫我……');
    await S.say('阿山', '可是我阿母，死了十年了啊……');
    if (inParty('baizhi')) await S.say('baizhi:sad', '……');
    await S.say('阿山', '我在這裡多久了？');
    await S.say('xinghe:normal', '三天。');
    await S.say('阿山', '三天！？');
    await S.say('阿山', '阿竹……我某……');
    await S.say('xinghe:smile', '走吧，阿山伯。我們送你回平溪。');
    await S.say('阿山', '……少年仔，多謝。真的多謝。');
    await S.say('阿山', '我現在看得到路了。這條山徑，我走了二十年。');
    S.flag('ch2_woodcutter_found');
    S.quest('q_woodcutter', 1);
    S.remove('ashan');
    V().c2_ashan = true;
    escort(ms);
    S.objective(F('ch2_hongying_join') ? '前往平溪' : '帶阿山回平溪');
    void ms;
  }
  // phantoms are half-transparent; the duel lines etc. live in their own hooks
  function phantomTurn(b) {
    for (const e of b.enemies) if (e.id === 'c2_mosin_phantom' && !e.dead) e.alpha = 0.55;
    return Promise.resolve();
  }

  async function duelTurn(b, u) {
    b.c2 = b.c2 || {};
    const hy = b.enemies[0];
    if (!hy) return;
    if (u === hy && !b.c2.open) { b.c2.open = true; b.say('洛紅纓：「妖女，受死！」', 1.4); await b.wait(0.6); return; }
    if (!b.c2.half && hy.hp < hy.mhp * 0.6) { b.c2.half = true; b.say('洛紅纓：「……有兩下子。」', 1.4); await b.wait(0.5); return; }
    const xh = b.party.find((p) => p.id === 'xinghe');
    if (u === hy && xh && !b.c2.guard && xh.st.guard) { b.c2.guard = true; b.say('洛紅纓：「……你這笨蛋，竟然護著她？」', 1.4); await b.wait(0.5); return; }
    if (u === hy && xh && !b.c2.first && xh.hp < xh.mhp) { b.c2.first = true; b.say('洛紅纓：「笨蛋！你被她迷住了！」', 1.4); await b.wait(0.5); }
  }

  async function duel28(S) {
    const ms = MS();
    S.flag('ch2_dusk');
    if (S.actor('ashan_f')) S.show('ashan_f', false);
    S.light({ ambient: 0.5, color: '#3a1a10', tint: 'rgba(255,140,60,0.10)' });
    S.particles([{ type: 'motes', density: 1 }, 'leaves']);
    await S.camera(20, 22, dur(1));
    await S.say('', '（林間空地。夕陽從樹縫斜照進來。地上散落著幾截斷掉的紅布條。）');
    await S.say('', '（一個紅衣少女背對著他們，槍尖拄地，大口喘氣。她腳邊，最後一隻魔神仔尖叫著化成一縷煙。）');
    S.sfx('ghost');
    await S.say('hongying:angry', '……哼。還敢來？');
    S.face('hongying_duel', 'up');
    await S.say('', '（她轉過身。高高的馬尾，長長的紅髮帶，手上一桿紅纓槍。）');
    // will-o'-wisps drift to 白芷
    const wisps = [];
    const b0 = S.actor('baizhi') || ms.player;
    for (let i = 0; i < 7; i++) {
      const w = { t: 'c2_wisp', x: 14 + i * 1.7, y: 19 + (i % 3), key: 'wisp' + i, seed: i, alpha: 0 };
      ms.objects.push(w); wisps.push(w);
      G.Tweens.to(w, { alpha: 0.85, x: b0.x + Math.cos(i) * 1.1, y: b0.y + Math.sin(i) * 0.6 - 0.6 }, dur(2.4 + i * 0.2), 'inOutQuad');
    }
    S.sfx('ghost', 0.4);
    await S.say('', '（這時，林子深處，一點、兩點、十點……淡藍色的鬼火飄了出來。）');
    await S.say('', '（它們沒有攻擊任何人，只是靜靜地，飄向白芷，繞著她打轉——像飛蛾圍著燈。）');
    await S.say('baizhi:surprise', '……你們好。');
    await S.say('xinghe:surprise', '白芷，妳、妳身邊……');
    S.emote('hongying_duel', '!');
    await S.say('hongying:surprise', '……');
    await S.say('hongying:angry', '鬼火繞身……臉白得像紙，身上一點熱氣都沒有……');
    await S.say('hongying:angry', '妖女！');
    await S.say('baizhi:think', '妖女……是在說我嗎？');
    await S.say('hongying:angry', '還裝傻！這片林子的魔神仔，就是妳在養的吧！');
    await S.say('xinghe:surprise', '欸欸欸！等一下！誤會！');
    await S.say('hongying:serious', '你——');
    await S.say('', '（紅纓打量了星河一眼：一臉傻氣，衣服被樹枝勾破，頭髮上還黏著一片蕈菇碎屑。）');
    await S.say('hongying:serious', '……被迷住了。看那張傻臉就知道。');
    await S.say('xinghe:angry', '誰的臉傻啊！');
    await S.say('hongying:serious', '別怕。我這就斬了她，救你出來。');
    await S.say('xinghe:angry', '我不需要被救！');
    await S.say('hongying:smug', '被迷住的人，都這麼說。');
    S.sfx('slash');
    await S.say('', '（紅纓一抖長槍。槍頭的紅纓在晚風裡甩開。）');
    await S.say('hongying:serious', '鹿港洛家槍，洛紅纓。');
    await S.say('hongying:serious', '妖女，接招！');
    await S.say('xinghe:serious', '……講不聽是不是。');
    await S.say('', '（星河拔出螢火，擋在白芷前面。）');
    await pet(S, 'yuyuan', '💢', '（芋圓擋到星河腳前，弓起背，把自己膨成一顆灰色的毛球。）');
    await S.say('xinghe:serious', '白芷，退後——');
    await S.say('baizhi:serious', '我要跟緊。');
    await S.say('xinghe:smile', '……我就知道。');
    S.cameraFollow();
    const r = await S.battle('boss_hongying', { loseOk: true, onTurn: duelTurn });
    for (const w of wisps) w.alpha = 0.5;
    if (r === 'lose') { // 結果 B
      for (const m of G.Party.active()) m.hp = Math.max(m.hp, Math.round(G.Party.stats(m.id).mhp * 0.25));
      await S.say('', '（星河倒在地上。紅纓的槍尖，停在他眼前一寸。）');
      await S.say('', '（白芷撐起身子，張開雙手，擋在星河前面。）');
      await S.say('baizhi:serious', '不可以。');
      await S.say('hongying:surprise', '……');
      await S.say('', '（紅纓的槍尖晃了一下。她左臂上的傷口裂開，血順著手腕滴下來。）');
      await S.say('hongying:hurt', '……嘖。');
    } else { // 結果 A
      await S.say('', '（紅纓單膝著地，槍尖抵著地面。她的左臂上有一道血痕——是剛才跟魔神仔打的時候留下的，現在又裂開了。）');
      await S.say('hongying:hurt', '……可惡……我還沒……');
    }
    // 共通
    const bz = S.actor('baizhi');
    if (bz) { await fwalk(S, 'baizhi', 20, 22); S.face('baizhi', 'down'); }
    await S.say('', '（白芷走向紅纓。）');
    await S.say('hongying:angry', '不准過來！');
    S.sfx('heal');
    await S.say('', '（白芷沒有停。她跪在紅纓身邊，把手輕輕放在那道傷口上，輕聲哼起一段旋律。淡淡的水光，從她指尖流進傷口。血止住了。）');
    S.flash('#bfe8ff', 0.4, 0.4);
    await S.say('hongying:surprise', '……');
    await S.say('baizhi:smile', '好了。');
    await S.say('baizhi:think', '妳的手在流血。流血會痛。');
    await S.say('baizhi:think', '我不喜歡別人痛。');
    await S.say('hongying:surprise', '……妳……');
    await S.say('hongying:think', '妖物……會幫敵人療傷？');
    await S.say('xinghe:smug', '我就說了吧。誤會。');
    await S.say('hongying:angry', '閉嘴，傻臉。');
    S.flag('ch2_duel');
    await backToBack29(S, wisps);
  }

  async function backToBack29(S, wisps) {
    const ms = MS();
    S.sfx('ghost'); S.sfx('ghost', 0.3); S.shake(3, 0.4);
    const imps = [[15, 20], [24, 20], [15, 26], [24, 26], [18, 19], [22, 27]];
    imps.forEach(([x, y], i) => S.spawn({ id: 'imp' + i, sprite: spr('c2_mosin', 'child_m'), x, y, dir: x < 20 ? 'right' : 'left', through: true }));
    await S.say('', '（林子四周響起尖笑。紅布條在樹梢間亂飛——十幾隻魔神仔，從四面八方圍了過來。）');
    await S.say('hongying:angry', '……還有？剛剛明明打完了！');
    await S.say('魔神仔', '打架打架！打累了！好吃！');
    await S.say('xinghe:serious', '先別管誤會了——背靠背！');
    await S.say('hongying:serious', '……哼。只此一次。');
    S.remove('hongying_duel');
    S.join('hongying', Math.max(5, avgLv()));
    S.flag('ch2_hongying_join');
    ms.refresh();
    await tutorial('tut_hongying');
    const r = await S.battle('t_c2_ambush', { loseOk: true });
    imps.forEach((p, i) => S.remove('imp' + i));
    for (const w of wisps || []) { const k = ms.objects.indexOf(w); if (k >= 0 && w.key !== 'wisp0' && w.key !== 'wisp1') ms.objects.splice(k, 1); }
    if (r === 'lose') for (const m of G.Party.active()) m.hp = Math.max(m.hp, Math.round(G.Party.stats(m.id).mhp * 0.25));
    S.gather();
    await S.say('', '（魔神仔們一鬨而散。）');
    await S.say('hongying:normal', '……');
    await S.say('hongying:shy', '……那個。');
    await S.say('hongying:shy', '剛剛……是我看錯了。');
    await S.say('xinghe:smug', '什麼？聽不到——');
    await S.say('hongying:angry', '我說我看錯了！笨蛋！');
    await S.say('', '（紅纓轉向白芷，聲音小得像蚊子叫。）');
    await S.say('hongying:shy', '……對不起。');
    await S.say('baizhi:smile', '沒關係。');
    await S.say('baizhi:think', '「笨蛋」，是星河的另一個名字嗎？');
    await S.say('hongying:laugh', '噗——對。從今天起就是。');
    await S.say('xinghe:angry', '才不是！');
    await S.say('xinghe:normal', '妳說妳是鹿港洛家的？跑這麼遠來霧林做什麼？');
    await S.say('hongying:serious', '平溪的庄頭出了賞金。有東西在擄小孩——一隻會變成老太婆的老虎。');
    await S.say('baizhi:think', '會變成老太婆的老虎……');
    await S.say('xinghe:surprise', '虎姑婆！？阿竹也說了……那不是阿嬤嚇小孩的故事嗎！');
    await S.say('hongying:serious', '已經不見四個小孩了。故事會擄人嗎？');
    await S.say('xinghe:serious', '……');
    await S.say('hongying:serious', '我追著牠的腳印進來，結果被魔神仔纏了一整天。');
    await S.say('hongying:think', '……而且，我在找一個人。');
    await S.say('xinghe:think', '誰？');
    await S.say('hongying:serious', '戴鬼面具的劍客。人稱「鬼面」。');
    await S.say('hongying:serious', '三年前的中元夜，鹿港洛家……一夜之間，全死了。');
    await S.say('hongying:serious', '只有我活下來。我最後看到的人，就是戴著鬼面的他。');
    await S.say('xinghe:sad', '……');
    await S.say('baizhi:sad', '……');
    await S.say('hongying:normal', '有人說，最近在北邊，觀音山一帶，看過他。');
    await S.say('xinghe:surprise', '觀音山？我們也要去觀音山！');
    await S.say('hongying:think', '……你們？去觀音山做什麼？');
    await S.say('xinghe:think', '呃……說來話長。');
    await S.say('baizhi:smile', '去找一個叫清虛真人的道士，問他我是誰。');
    await S.say('hongying:think', '……說得真短。');
    await S.say('hongying:serious', '虎姑婆的事還沒完。先去平溪。');
    await S.say('hongying:think', '之後……要是順路，跟你們走一段也不是不行。');
    await S.say('hongying:angry', '別誤會！只是怕你這笨蛋又被什麼東西迷住！');
    await S.say('xinghe:think', '……我到底什麼時候被迷住了。');
    await S.say('', '（白芷身邊還繞著一兩點鬼火。紅纓偷偷瞄了一眼，小聲說——）');
    await S.say('hongying:shy', '……其實，那些小火……有點可愛。');
    await S.say('xinghe:surprise', '妳說什麼？');
    await S.say('hongying:angry', '什麼都沒說！走了！');
    for (const w of wisps || []) G.Tweens.to(w, { alpha: 0 }, dur(2));
    if (S.actor('ashan_f')) S.show('ashan_f', true);
    S.objective('前往平溪');
  }

  G.Maps.define('mistforest_s', {
    name: '霧林・南', subtitle: (st) => (st.flags.ch2_dusk ? '黃昏的山林' : '往平溪的山徑'),
    bgm: 'forest',
    start: [19, 2],
    light: (st) => (st.flags.ch2_dusk ? { ambient: 0.5, color: '#3a1a10', tint: 'rgba(255,140,60,0.10)' } : { ambient: 0.4, color: '#1a2418' }),
    particles: (st) => (st.flags.ch2_dusk ? [{ type: 'motes', density: 1 }, 'leaves', { type: 'fireflies', density: 0.8 }] : [{ type: 'mist', density: 1.2 }, 'leaves', { type: 'fireflies', density: 0.5 }]),
    tiles: rows(MFS.g), deco: rows(MFS.d),
    objects: [
      saveStone(18, 2, '路旁的石燈籠。霧在這裡淡了一些。'),
      ...MFS_CLOTH.map(([x, y]) => ({ t: 'c2_redcloth', x, y, z: 2, label: '調查', interact: '樹枝上綁著一條褪色的紅布。打的結很奇怪，看了頭有點暈。' })),
      ...ILLUSION.map(([x, y]) => ({ t: 'tree_camphor', x, y, illusion: true, label: '調查', interact: async (S) => {
        await S.say('', '樹長得好密……可是有一點奇怪，這幾棵樹的影子，方向跟別的樹不一樣。');
        if (qActive('q_woodcutter') && !F('ch2_woodcutter_found')) await S.say('xinghe:think', '阿竹說他阿爸是在霧林不見的……這幾棵樹的影子怪怪的。用靈視看看？');
      } })),
      { t: 'tree_camphor', x: 35, y: 4, z: -16 },
      { t: 'c2_redcloth', x: 35, y: 4, z: 2 },
      { t: 'log', x: 32, y: 8 }, { t: 'rock_big', x: 23, y: 20 }, { t: 'stump', x: 16, y: 26 }, { t: 'log', x: 3, y: 30 },
      { t: 'tree_fern', x: 25, y: 27 }, { t: 'tree_fern', x: 14, y: 27 }, { t: 'mushroom_glow', x: 2, y: 33 }, { t: 'mushroom_glow', x: 27, y: 41 },
    ],
    chests: [
      { id: 'c2_s1', x: 9, y: 12, gold: 200, item: 'jiedu', n: 3 },
      { id: 'c2_s2', x: 26, y: 40, item: 'ac_xionghuang' },
      { id: 'c2_s3', x: 35, y: 38, item: 'huanhunxiang', spirit: true },
    ],
    npcs: [
      { id: 'ashan', sprite: spr('c2_ashan', 'woodcutter'), name: '阿山', x: 35, y: 5, dir: 'down', spirit: true, offsetY: -46, fixedDir: true,
        if: (st) => !st.flags.ch2_woodcutter_found, talk: ['（阿山坐在樹枝上，嘴裡塞滿了東西。）', '好吃……雞腿……'] },
      { id: 'mosin_a', sprite: spr('c2_mosin', 'child_m'), name: '魔神仔', x: 34, y: 7, dir: 'up', spirit: true, wander: 1, if: (st) => !st.flags.ch2_woodcutter_found, talk: ['嘻嘻嘻！'] },
      { id: 'mosin_b', sprite: spr('c2_mosin', 'child_m'), name: '魔神仔', x: 36, y: 7, dir: 'up', spirit: true, wander: 1, if: (st) => !st.flags.ch2_woodcutter_found, talk: ['嘻嘻嘻！'] },
      { id: 'mosin_c', sprite: spr('c2_mosin', 'child_m'), name: '魔神仔', x: 35, y: 8, dir: 'up', spirit: true, wander: 1, if: (st) => !st.flags.ch2_woodcutter_found, talk: ['嘻嘻嘻！'] },
      { id: 'hongying_duel', sprite: 'hongying', name: '紅衣少女', x: 20, y: 23, dir: 'down', fixedDir: true, if: (st) => !st.flags.ch2_hongying_join,
        talk: async (S) => { await S.say('hongying:angry', '……哼。還敢來？'); } },
    ],
    enemies: [
      foe('fs1', 'forest_1', 18, 14, 'mosina', 6),
      foe('fs2', 'lair_1', 30, 18, 'boar_demon', 8),
      foe('fs3', 'forest_3', 8, 26, 'bamboo_spirit', 6),
      foe('fs4', 'forest_5', 27, 30, 'mushroom_imp', 6),
      foe('fs5', 'lair_2', 16, 32, 'macaque_demon', 7),
      foe('fs6', 'forest_4', 24, 40, 'mosina', 6),
      foe('fs7', 'forest_1', 20, 22, 'mosina', 6, { if: (st) => !!st.flags.ch2_hongying_join }),
    ],
    events: [
      { id: 'woodcutter', trigger: 'touch', x: 30, y: 5, w: 1, h: 3, spirit: true, if: (st) => qStage('q_woodcutter') === 0 && !st.flags.ch2_woodcutter_found, run: woodcutter27 },
      { id: 'squeeze', trigger: 'action', x: 29, y: 5, w: 1, h: 3, label: '擠過去', if: (st) => !(st.vars.vision > 0), run: async (S) => {
        await S.say('', '（樹影晃了晃。星河硬是從枝葉之間擠了出去。）');
        await S.warp('mistforest_s', 27, 6, 'left');
      } },
      { id: 'duel', trigger: 'touch', x: 14, y: 20, w: 12, h: 1, once: true, if: (st) => !!st.flags.ch2_maze_solved && !st.flags.ch2_duel, run: duel28 },
      { id: 'shansu', trigger: 'action', x: 4, y: 32, label: '採集', run: async (S) => {
        await S.say('', '一叢山蘇，葉子像鳥巢一樣捲在一起。嫩芽可以吃。');
        if (qActive('q_hy_kitchen') && !S.hasItem('c2_shansu')) { await S.give('c2_shansu', 1); return; }
        if (!qActive('q_hy_kitchen')) await S.say('xinghe:think', '……現在摘了也不知道要拿來做什麼。');
      } },
    ],
    warps: [
      { x: 19, y: 0, w: 2, to: 'mist_loop', tx: 11, ty: 18, tdir: 'up' },
      { x: 19, y: 43, w: 2, to: 'pingxi', tx: 23, ty: 1, tdir: 'down',
        run: async (S) => {
          if (!F('ch2_duel')) { await S.say('xinghe:think', '前面的空地好像有人在打鬥……先去看看。'); await S.move('player', 'U'); return false; }
          return true;
        } },
    ],
    onUpdate: (dt, ms) => forestTick(dt, ms),
  });

  // =================================================================================================
  // 1.5 pingxi — 平溪
  // =================================================================================================
  // time slots: 1 抵達之夜 · 2 白天 · 3 天燈之夜 · 17 七月十七清晨 · 4 八月初五
  const PQ = (st) => { const f = (st || G.state).flags; return f.ch2_dawn ? 4 : f.ch2_tiandeng_night ? 17 : f.ch2_tiger_beaten ? 3 : f.ch2_morning ? 2 : 1; };
  const Q = (...list) => (st) => list.includes(PQ(st));
  const PX_LIGHT = {
    1: { ambient: 0.75, color: '#070b22', playerR: 230 },
    2: { ambient: 0.05, color: '#102030' },
    3: { ambient: 0.65, color: '#080a22', playerR: 220, glow: 0.35 },
    17: { ambient: 0.18, color: '#2a1408', tint: 'rgba(255,120,60,0.14)' },
    4: { ambient: 0.04, color: '#2a2010', tint: 'rgba(255,214,150,0.12)' },
  };
  const PX = (() => {
    const W = 48, H = 40;
    const g = grid(W, H, '.');
    const d = grid(W, H, ' ');
    fill(g, 22, 0, 3, 14, '=');
    fill(g, 45, 12, 3, 2, '=');
    fill(g, 2, 14, 44, 2, '#');
    fill(g, 22, 16, 2, 1, '#');
    fill(g, 18, 17, 11, 7, '#');
    fill(g, 10, 12, 1, 2, '='); fill(g, 31, 12, 1, 2, '='); fill(g, 37, 12, 1, 2, '='); fill(g, 4, 16, 1, 4, '=');
    fill(g, 41, 16, 1, 4, '=');
    fill(g, 20, 24, 2, 2, '='); fill(g, 38, 24, 2, 2, '=');
    fill(g, 0, 26, W, 3, 'r');
    fill(g, 20, 26, 2, 3, 'B'); fill(g, 38, 26, 2, 3, 'B');
    fill(g, 0, 29, W, 11, 'f');
    fill(g, 20, 29, 2, 11, '=');
    fill(g, 20, 33, 28, 2, '=');
    fill(g, 38, 29, 2, 4, '=');
    fill(g, 0, 25, 20, 1, ','); fill(g, 22, 25, 16, 1, ','); fill(g, 40, 25, 8, 1, ',');
    fill(g, 5, 30, 6, 5, '.'); fill(g, 27, 35, 6, 5, '.');
    // bamboo grove (NE): bamboo everywhere except a winding trail to the shoot (43,5) and the chest (46,2)
    for (let y = 1; y <= 8; y++) for (let x = 40; x <= 46; x++) d[y][x] = 'B';
    for (const [x, y] of [[43, 8], [43, 7], [43, 6], [42, 5], [44, 5], [45, 5], [44, 4], [45, 3], [46, 3], [46, 2]]) { d[y][x] = ' '; g[y][x] = ','; }
    d[5][43] = ' '; g[5][43] = ',';
    // hills behind the village & greenery
    for (const [x, y, c] of [[1, 1, 't'], [5, 1, 'c'], [9, 2, 't'], [13, 1, 'c'], [3, 4, 'u'], [12, 6, 'n'], [7, 6, 'p'], [29, 1, 't'], [33, 2, 'c'], [36, 1, 't'], [31, 5, 'u'],
      [35, 6, 'n'], [27, 7, 'u'], [15, 8, 'p'], [1, 9, 'c'], [2, 12, 'u'], [18, 9, 'w'], [26, 9, 'w'], [42, 10, 'u'], [46, 9, 'c'], [0, 18, 't'], [9, 17, 'n'], [15, 17, 'p'],
      [32, 18, 'u'], [36, 19, 'n'], [46, 18, 'c'], [30, 21, 'w'], [34, 22, 'p'], [45, 22, 'n'], [1, 22, 'u'], [8, 22, 'w'], [16, 23, 'u'],
      [2, 25, 'e'], [6, 25, 'e'], [13, 25, 'e'], [17, 25, 'r'], [25, 25, 'e'], [31, 25, 'e'], [35, 25, 'r'], [42, 25, 'e'], [46, 25, 'e']]) d[y][x] = c;
    // fields: 大菁 (tall grass) & rice
    for (let y = 29; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'f' && (x + y) % 3 === 0 && U.hash(x, y, 9) < 0.7) d[y][x] = 'g';
    for (const [x, y, c] of [[7, 30, 'n'], [10, 34, 'p'], [27, 39, 'n'], [32, 35, 'p'], [5, 34, 'u']]) d[y][x] = c;
    return { g, d };
  })();

  // Q1: torches of the search parties moving on the dark hills (drawOver)
  function drawPingxi(ctx, t, ms) {
    const q = PQ();
    if (q === 1) {
      ctx.save();
      for (let i = 0; i < 9; i++) {
        const baseX = (i < 5 ? 3 + i * 3.4 : 30 + (i - 5) * 4) * T, baseY = (1.2 + (i % 3) * 1.6) * T;
        const x = baseX + Math.sin(t * 0.12 + i * 2.3) * 90, y = baseY + Math.cos(t * 0.17 + i) * 26;
        const f = 0.75 + 0.25 * Math.sin(t * 11 + i * 3);
        const gr = ctx.createRadialGradient(x, y, 0, x, y, 34);
        gr.addColorStop(0, `rgba(255,190,90,${(0.85 * f).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 34, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (ms.c2sky) drawSkyExtras(ctx, t, ms);
  }
  // Q4: puddles on the paths after the typhoon
  function drawPuddles(ctx, t) {
    if (PQ() !== 4) return;
    ctx.save();
    for (const [x, y, w] of [[22.6, 4.5, 1.2], [23.4, 9.3, 0.9], [8.5, 14.6, 1.4], [27.2, 15.4, 1.1], [20.8, 21.2, 1.6], [25.5, 18.5, 1], [20.5, 31.5, 1], [30.5, 33.6, 1.3], [42.4, 34.2, 1.1]]) {
      const cx = x * T, cy = y * T;
      const g = ctx.createLinearGradient(cx, cy - 12, cx, cy + 12);
      g.addColorStop(0, 'rgba(190,215,240,0.55)'); g.addColorStop(1, 'rgba(120,150,190,0.45)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, cy, w * 30, w * 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,250,235,${(0.35 + 0.2 * Math.sin(t * 1.5 + x)).toFixed(3)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx - w * 6, cy - 3, w * 14, w * 4, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ 平溪 NPC talks
  async function liTalk(S) {
    const q = PQ();
    if (q === 1) { await S.say('李庄頭', '先去客棧歇著。天光了，我們再上山。'); return; }
    if (q === 2) {
      await S.say('李庄頭', '搜山的人說，東北邊的竹林裡，老虎腳印最多。');
      await S.say('李庄頭', '那片竹林頂上，有一間荒廢幾十年的老厝。以前住過一個老阿婆……');
      await S.say('李庄頭', '她死了以後，就沒人住了。……應該是沒人住了。');
      return;
    }
    await S.say('李庄頭', '平溪人不會忘記你們的。以後元宵，我們多放三盞燈。');
  }
  async function ashanSaoTalk(S) {
    if (qDone('q_woodcutter')) {
      await S.say('阿山嫂', '他回來到現在，睡了一天一夜，起來就喊肚子餓。');
      await S.say('阿山嫂', '說再也不要吃雞腿了。');
      return;
    }
    if (PQ() === 1) { await S.say('阿山嫂', '我尪……三天了……庄裡的人都去找囝仔，沒人能找他……'); return; }
    await S.say('阿山嫂', '阿竹說在霧林碰到你們。');
    await S.say('阿山嫂', '老人講，被魔神仔牽去的人，要敲鑼、大聲叫他的名字，才叫得回來。');
    await S.say('阿山嫂', '拜託……我尪叫阿山。');
  }
  async function azhuHomeTalk(S) {
    if (qDone('q_woodcutter')) { await S.say('阿竹', '那面銅鑼你們留著！就當作……謝禮。雖然很吵。'); return; }
    await S.say('阿竹', '天亮我還要再進去找。阿爸一定還在林子裡。');
  }
  async function achunTalk(S) {
    const q = PQ();
    if (q === 1) { await S.say('阿春嬸', '阿蘭……阿弟仔……兩個都被帶走了……'); await S.say('阿春嬸', '那天半夜，我聽到有人敲門，說是姑婆……我、我還以為是夢……'); return; }
    if (q === 2) { await S.say('阿春嬸', '阿蘭最勇敢了，從小聽阿嬤講虎姑婆的故事，一點都不怕。'); await S.say('阿春嬸', '可是阿弟仔才五歲……'); return; }
    await S.say('阿春嬸', '阿蘭說，她是用阿嬤故事裡的辦法打虎姑婆的。');
    await S.say('阿春嬸', '這個囝仔，以後誰娶得起喔！');
  }
  async function ashiTalk(S) {
    const q = PQ();
    if (q === 1) { await S.say('阿石伯', '天一亮我就上去！就算是虎王，我也要把我兒子搶回來！'); return; }
    if (q === 2) { await S.say('阿石伯', '洛姑娘說你們跟她一起去？……好。'); await S.say('阿石伯', '竹林裡的路，順著老虎腳印走。看到青竹絲，莫踩。'); return; }
    await S.say('阿石伯', '石頭……石頭跟我說，是你們打開竹籠的。');
    if (!F('ch2_ashi_gift')) {
      await S.say('阿石伯', '我是粗人，不會講話。這些拿去。');
      S.flag('ch2_ashi_gift');
      await S.give('jinchuang', 3);
    }
  }
  async function amaTalk(S) {
    if (PQ() !== 4) { await S.say('小春的阿嬤', '山神、土地公、天公伯……保佑我們小春……'); return; }
    await S.say('小春的阿嬤', '我去土地公廟還願了。風颱也沒把它吹倒，土地公有保庇。');
    if (!F('ch2_ama_gift')) {
      await S.say('小春的阿嬤', '這些紅龜粿，本來是要拜拜的，你們帶著路上吃。');
      S.flag('ch2_ama_gift');
      await S.give('c2_hongguigui', 3);
    }
  }
  async function alanjieTalk(S) {
    if (PQ() === 4) { await S.say('阿藍姐', '藍衫的姑娘，妳染的那條頭巾，顏色很正。下次來，阿姐再教妳染長衫。'); }
    else if (!F('ch2_indigo_talk')) {
      S.flag('ch2_indigo_talk');
      await S.say('阿藍姐', '這片藍，是用大菁染的。田裡那些綠綠的草，就是大菁。');
      await S.say('阿藍姐', '葉子泡在缸裡，泡出藍色的泥，再拿來染布。越染越深。');
      await S.say('阿藍姐', '上游那個小庄叫「菁桐坑」——因為那裡滿山的大菁跟油桐。');
      if (inParty('baizhi')) {
        await S.say('阿藍姐', '姑娘，妳身上那件藍衫，看起來也是大菁染的喔？');
        await S.say('baizhi:think', '……是嗎？我醒來的時候，就穿著了。');
        await S.say('阿藍姐', '那一定是從我們這邊挑過去賣的布！越洗越藍，看那個顏色就知道。');
      }
    } else await S.say('阿藍姐', '要不要看看阿姐染的布？越洗越藍喔。');
    await S.shop(['c2_indigo_scarf', 'c2_indigo_robe'], { title: '阿藍姐染坊' });
  }
  async function axiTalk(S) {
    if (PQ() === 4) { await S.say('阿溪', '石頭說他在竹籠裡一直哭！我要笑他一年！'); return; }
    if (qActive('q_hy_kitchen') && !S.hasItem('c2_shrimp')) {
      S.flag('ch2_shrimp_hint');
      await S.say('阿溪', '翻石頭！蝦子會跳出來！');
      await S.say('阿溪', '就在我旁邊那幾顆石頭底下。去翻翻看！');
      return;
    }
    await S.say('阿溪', '抓溪蝦喔！石頭翻起來，牠們就會跳！');
    await S.say('阿溪', '可是不要去深的地方，基隆河看起來淺，底下會吸人。');
  }
  async function shrimpSpot(S) {
    if (!qActive('q_hy_kitchen') || S.hasItem('c2_shrimp')) { await S.say('', '河邊的石頭，長滿了青苔。水底下有小小的影子一閃而過。'); return; }
    if (!F('ch2_shrimp_hint')) { await S.say('', '河邊的石頭底下，好像有東西在動。……阿溪應該知道怎麼抓。'); return; }
    const lucky = Math.floor(Math.random() * 3);
    for (let tries = 0; tries < 3; tries++) {
      const c = await S.choice(['左邊的石頭', '中間的石頭', '右邊的石頭']);
      S.sfx('splash');
      if (c === lucky) {
        await S.say('', '（石頭一翻——一隻溪蝦彈了出來！）');
        await S.give('c2_shrimp', 1);
        return;
      }
      await S.say('', tries < 2 ? '（石頭底下只有泥巴。）' : '（又是泥巴……）');
    }
    await S.say('阿溪', '哈哈，分你一點啦！');
    await S.give('c2_shrimp', 1);
  }
  async function shootSpot(S) {
    await S.say('', '地上冒出一支筍尖。');
    if (!qActive('q_hy_kitchen') || S.hasItem('c2_bamboo_shoot')) { if (!qActive('q_hy_kitchen')) await S.say('xinghe:think', '竹筍……現在挖了也沒地方煮。'); return; }
    await S.give('c2_bamboo_shoot', 1);
    if (!F('ch2_shoot_line')) { S.flag('ch2_shoot_line'); await S.say('xinghe:smile', '……陳伯要是知道我拿螢火挖竹筍，一定罵死我。'); }
  }
  async function aquanTalk(S) {
    if (S.hasItem('c2_porter_bundle')) {
      await S.say('阿全', '這、這是阿福的擔子！你們在哪裡找到的？');
      await S.say('xinghe:normal', '虎姑婆的洞裡。');
      await S.say('阿全', '哈！老虎也想看信嗎！');
      await S.say('阿全', '多謝！這些信，我會一封一封送到。這是挑夫的面子！');
      S.take('c2_porter_bundle', 1);
      await S.give('c2_porter_sandals', 1);
      S.gold(150);
      S.flag('ch2_bundle_returned');
      return;
    }
    if (PQ() === 4 || F('ch2_bundle_returned')) { await S.say('阿全', '信，我會一封一封送到。這是挑夫的面子！'); return; }
    await S.say('阿全', '我是挑夫，走淡蘭古道的。從淡水挑貨，經過平溪，一路挑到宜蘭。');
    await S.say('阿全', '信啦、布啦、鹽啦、藥材啦，什麼都挑。一個擔子幾十斤。');
    await S.say('阿全', '上個月，我的夥伴阿福在霧林被一隻大老虎追。');
    await S.say('阿全', '他把擔子丟了才逃回來。人沒事，可是嚇破膽，再也不敢走山路。');
    await S.say('阿全', '那個擔子裡，有好多人的信……');
    S.flag('ch2_bundle_hint');
  }
  async function searcherTalk(S) {
    const q = PQ();
    if (q === 1) { S.sfx('gong'); await S.say('搜山的人', '阿蘭——！石頭——！'); await S.say('搜山的人', '夜裡山上看不到路，天光再去！你們先歇！'); return; }
    if (q === 2) { await S.say('搜山的人', '洛姑娘說要帶你們上去？我們在這裡守著，有消息就敲鑼！'); return; }
    await S.say('搜山的人', '那暝看到天燈，我們在山上哭得像囝仔一樣！');
  }
  async function zhouOutsideTalk(S) {
    await S.say('周老嬸', '……阿興，燈點好了。');
    await S.say('xinghe:think', '阿嬸，這盞燈是……？');
    await S.say('周老伯', '給我們兒子的。天黑了，怕他回家看不到路。');
    await S.say('周老伯', '少年仔，夜深了，快去歇吧。');
  }

  // ------------------------------------------------------------------ 4.1 重逢 (阿山 follows the party into 平溪)
  async function reunion(S, atHome) {
    const ms = MS();
    let ax = 24, ay = 3, hx = 23, hy = 4;
    if (atHome) {
      await S.fadeOut(dur(0.4));
      S.setPos('player', 41, 22, 'right'); S.gather(); ms.snapCamera();
      ax = 43; ay = 21; hx = 42; hy = 22;
      S.remove('azhu_home');
      await S.fadeIn(dur(0.4));
    }
    const es = S.actor('ashan_f');
    if (es) { es.scripted = true; es.setCell(hx, hy); es.dir = 'right'; }
    V().c2_ashan = false;
    S.spawn({ id: 'azhu_r', sprite: spr('c2_azhu', 'child_m'), name: '阿竹', x: ax, y: ay, dir: 'down', light: { r: 90, color: '#ffb060' } });
    await S.camera(ax, ay, dur(0.6));
    await S.say('', '（路邊，一個少年提著燈籠坐著打瞌睡。）');
    await S.say('阿山', '……阿竹？');
    S.emote('azhu_r', '!'); await S.jump('azhu_r');
    await S.say('', '（少年驚醒。燈籠掉在地上。）');
    S.face('azhu_r', 'ashan_f');
    await S.say('阿竹', '……阿爸？');
    await S.say('阿竹', '阿爸——！');
    S.emote('azhu_r', '💧');
    await S.say('', '（阿竹撲進阿山懷裡。聽到聲音，阿山嫂從家裡跑了出來。）');
    S.spawn({ id: 'sao_r', sprite: 'villager_f', name: '阿山嫂', x: atHome ? 41 : 23, y: atHome ? 20 : 8, dir: atHome ? 'down' : 'up' });
    await S.move('sao_r', atHome ? 'R' : 'UUU');
    await S.say('阿山嫂', '你這個死人！三天！三天去哪裡了！');
    await S.say('阿山', '……去吃雞腿了。');
    S.emote('sao_r', '💢');
    await S.say('阿山嫂', '啥！？');
    await S.say('阿山', '哈……哈哈……我回來了。我回來了。');
    await S.say('阿竹', '哥哥、姊姊，謝謝你們！');
    await S.say('xinghe:smile', '阿竹的鑼，很有用喔。');
    if (inParty('baizhi')) await S.say('baizhi:smile', '他聽到了。你的鑼，還有他的名字。');
    await S.lantern('xd_woodcutter', '山中的呼喚');
    await S.say('阿山', '恩人，這些是我在山裡採的。不是雞腿，是真的。');
    await S.give('c2_shansu', 2);
    await S.give('jinchuang', 2);
    S.quest('q_woodcutter', 'done');
    S.cameraFollow();
    await S.fadeOut(dur(0.4));
    for (const id of ['azhu_r', 'sao_r', 'ashan_f']) S.remove(id);
    S.refresh();
    await S.fadeIn(dur(0.4));
  }

  // ------------------------------------------------------------------ 2-10 平溪之夜
  async function arrive210(S) {
    if (V().c2_ashan) await reunion(S, false);
    S.bgm('night');
    await S.say('', '（平溪，入夜。山谷裡零零星星的燈火。遠處的山上，傳來一聲一聲的鑼響，還有人在喊名字。）');
    S.sfx('gong');
    await S.say('山上的聲音', '阿蘭——！');
    S.sfx('gong', 0.3);
    await S.say('山上的聲音', '石頭——！小春——！');
    await S.say('baizhi:think', '他們在……叫名字。');
    await S.say('hongying:serious', '搜山的人。已經找了三天。');
    S.spawn({ id: 'li_r', sprite: 'old_m', name: '李庄頭', x: 23, y: 7, dir: 'up', light: { r: 110, color: '#ffb060' } });
    await S.move('li_r', 'UUU');
    await S.say('', '（一個拄著拐杖的老人迎上來。）');
    await S.say('李庄頭', '洛姑娘！妳回來了……有找到嗎？');
    await S.say('hongying:sad', '……還沒。被魔神仔絆住了。');
    await S.say('李庄頭', '唉……');
    await S.say('李庄頭', '這兩位是？');
    await S.say('xinghe:normal', '九份來的，沈星河。這位是白芷。');
    await S.say('李庄頭', '九份……路上辛苦了。我是平溪的庄頭，姓李。');
    await S.say('李庄頭', '平溪這半個月，不見了四個囝仔。');
    await S.say('李庄頭', '都是半夜。有人聽到敲門聲，一個老婦人的聲音說——');
    await S.say('李庄頭', '「乖孫，開門，姑婆來看你了。」');
    await S.say('baizhi:sad', '……');
    await S.say('李庄頭', '隔天早上，囝仔就不見了。門口有老虎的腳印。');
    await S.say('xinghe:serious', '虎姑婆……真的有。');
    await S.say('李庄頭', '庄裡的男人都上山去找了。敲鑼、喊名字，找了三天三夜。');
    await S.say('李庄頭', '找不到。山太大，霧太濃。');
    await S.say('李庄頭', '天燈舖的吳阿公，已經在紮天燈了。');
    await S.say('李庄頭', '我們平溪的規矩：囝仔找到了，就放天燈，叫山上的人回家。');
    await S.say('hongying:serious', '明天天一亮，我就上山。這次一定找到牠的窩。');
    await S.say('xinghe:serious', '我們也去。');
    await S.say('李庄頭', '……多謝。多謝你們。');
    await S.say('李庄頭', '今暝先去客棧歇著。月娘會照顧你們。');
    S.remove('li_r');
    S.flag('ch2_pingxi_arrive');
    S.refresh();
    S.objective('去十分客棧休息');
  }

  // ------------------------------------------------------------------ 吳阿公 & 紮天燈 (5.4)
  async function lanternQuiz(S) {
    const QS = [
      { q: '先做什麼？', opts: ['竹篾紮成圓口', '先寫願望', '先點火'],
        wrong: [null, ['吳阿公', '燈都還沒有，你要寫在空氣上喔？'], ['吳阿公', '你要燒我的店喔！']] },
      { q: '然後？', opts: ['糊上棉紙，做成燈身', '塗上桐油', '綁上鞭炮'],
        wrong: [null, ['吳阿公', '塗桐油是做雨傘啦。燈要透氣。'], ['吳阿公', '那是鹽水在玩的！']] },
      { q: '燈底下放什麼當燃料？', opts: ['沾了油的金紙', '木炭', '蠟燭'],
        wrong: [null, ['吳阿公', '木炭那麼重，燈飛得起來才怪。'], ['吳阿公', '蠟燭火太小，燈鼓不起來。']] },
    ];
    for (const qq of QS) {
      for (let tries = 0; ; tries++) {
        await S.say('吳阿公', qq.q);
        const c = await S.choice(qq.opts);
        if (c === 0 || tries >= 3) { S.sfx('ok'); break; }
        await S.say(qq.wrong[c][0], qq.wrong[c][1]);
      }
    }
    await S.say('吳阿公', '好手！陳渡教得不錯！');
    S.flag('ch2_tiandeng_quiz');
    await S.give('c2_tiandeng_charm', 1);
  }
  async function wuTalk(S) {
    const q = PQ();
    if (q === 1) { await S.say('吳阿公', '囝仔還沒回來。我一盞一盞紮，紮到他們回來為止。'); return; }
    if (q === 4) {
      await S.say('吳阿公', '你們要去淡水？那邊的人也放燈嗎？……不管放不放，記得平溪的燈。');
      await S.shop(['c2_tiandeng_charm'], { title: '吳家天燈舖' });
      return;
    }
    if (F('ch2_tiandeng_quiz')) { await S.say('吳阿公', '天燈的紙要選棉紙，薄、韌，火烤不會一下就破。'); return; }
    await S.say('吳阿公', '囝仔還沒找到，我先紮燈。找到了，馬上就放。');
    await S.say('吳阿公', '少年仔，你這雙手……做過燈？');
    await S.say('xinghe:smile', '九份陳記燈籠舖的學徒！');
    await S.say('吳阿公', '陳記！陳渡那個老古板的店？好，來幫我紮一盞！');
    await lanternQuiz(S);
    if (inParty('baizhi')) {
      await S.say('baizhi:think', '天燈為什麼會飛？');
      await S.say('吳阿公', '燈底下的火一燒，燈裡的空氣就變熱、變輕，燈就浮起來了。');
      await S.say('baizhi:think', '……就像人心裡有了火，也會變輕嗎？');
      await S.say('吳阿公', '……');
      await S.say('吳阿公', '這個姑娘，講話比我還像說書的！');
    }
    await S.say('xinghe:think', '阿公，天燈是怎麼來的？');
    await S.say('吳阿公', '等找到囝仔，我放燈的時候再講。現在講，不吉利。');
  }

  // ------------------------------------------------------------------ 4.2 寄到了的信
  async function zhouInsideTalk(S) {
    if (G.Lanterns.has('xd_letter')) {
      await S.say('周老嬸', '放天燈那暝之後，我夢到阿興了。他在船上，笑得跟小時候一樣。');
      await S.say('周老伯', '今暝開始，門口那盞燈……我們就不點了。');
      await S.say('周老伯', '不是忘了他。是讓他，不用再惦記著回家的路。');
      return;
    }
    if (S.hasItem('key_sonletter')) { await readLetter(S); if (PQ() === 4) await dawnLantern(S); return; }
    if (qStage('q_letter') < 0) {
      await S.say('周老嬸', '坐，坐。家裡沒什麼好招待的。');
      await S.say('xinghe:think', '阿嬸，門口那盞「興」字的燈……');
      await S.say('周老伯', '我們的兒子，阿興。兩年前去雞籠，在船上做事。');
      await S.say('周老伯', '每個月都會託淡蘭古道的挑夫，帶一封信回來。');
      await S.say('周老嬸', '我們不識字，都是請吳阿公念給我們聽。');
      await S.say('周老伯', '上個月……信沒來。');
      await S.say('周老伯', '然後雞籠的人帶話來，說阿興那艘船，過黑水溝的時候……沉了。');
      await S.say('周老嬸', '可是，沒看到人，就不算……');
      await S.say('周老嬸', '所以我每天暗時都點燈。怕他回來，看不到路。');
      if (inParty('baizhi')) await S.say('baizhi:sad', '……');
      await S.say('周老伯', '最後那封信，到底寫了什麼……我們到現在都不知道。');
      S.quest('q_letter', 0);
      if (F('ch2_bundle_hint')) await S.say('xinghe:think', '……阿全說，上個月有一個挑夫的擔子丟在山裡。難道……');
      return;
    }
    if (F('ch2_letter_read')) { await S.say('周老伯', '老伴。我們也放一盞燈。寫阿興的名字。'); return; }
    await S.say('周老嬸', '阿興的信，不知道寄到哪裡去了……');
  }
  async function readLetter(S) {
    await S.say('xinghe:serious', '周阿伯、周阿嬸。這個……是在虎姑婆的洞裡找到的。');
    await S.say('周老伯', '……這是……');
    await S.say('周老嬸', '阿興的字！是阿興的字！');
    await S.say('周老伯', '……少年仔。我們兩個老的，不識字。');
    await S.say('周老伯', '你……可以念給我們聽嗎？');
    await S.say('xinghe:serious', '……好。');
    await S.say('', '（星河打開信。字歪歪斜斜的，像是在搖晃的船上寫的。）');
    await S.narrate(['阿爸、阿母：', '我在雞籠一切都好。頭家人很好，船上的飯也吃得飽。', '下個月船要開去唐山，來回要半年。',
      '等我回來，要給阿母買一對金耳鉤，給阿爸買一頂新斗笠。', '阿爸的腰，記得貼膏藥。阿母的眼睛，暗時莫做針線。'], { veil: 0.9, color: '#f0e2c0' });
    await S.narrate(['人家說，黑水溝很兇。六個去，三個留，一個回頭。', '……若是我沒有回來，你們莫一直等我。', '要好好吃飯。', '　　　　　　　　　　不孝子　阿興'], { veil: 0.9, color: '#f0e2c0' });
    await S.say('', '（星河念完了。很久，沒有人說話。）');
    await S.say('周老嬸', '……這個憨囝仔……');
    await S.say('周老嬸', '自己都不知道漂到哪裡去了，還叫我們好好吃飯……');
    await S.say('周老伯', '……新斗笠。我那頂斗笠，破了好幾年，一直捨不得換……');
    await S.say('周老伯', '……原來，他在等著買給我。');
    if (inParty('baizhi')) await S.say('baizhi:sad', '……');
    await S.say('周老伯', '老伴。我們也放一盞燈。');
    await S.say('周老伯', '寫阿興的名字。告訴他——信，我們收到了。');
    await S.say('周老嬸', '……嗯。');
    S.take('key_sonletter', 1);
    S.flag('ch2_letter_read');
    S.quest('q_letter', 2);
  }
  async function axingVoice(S) {
    await S.say('?', '……阿爸，阿母。我收到了。');
    await S.say('?', '要好好吃飯喔。');
    if (inParty('baizhi')) await S.say('baizhi:surprise', '……');
  }
  async function dawnLantern(S) { // Q4 version of the 心燈 (read after the typhoon)
    await S.fadeOut(dur(0.4));
    if (MS().def.id !== 'pingxi') await S.warp('pingxi', 5, 21, 'up', { fade: 0 });
    else { S.setPos('player', 5, 21, 'up'); S.gather(); MS().snapCamera(); }
    S.spawn({ id: 'zb_d', sprite: 'old_m', name: '周老伯', x: 4, y: 20, dir: 'up' });
    S.spawn({ id: 'zs_d', sprite: 'old_f', name: '周老嬸', x: 6, y: 20, dir: 'up' });
    await S.fadeIn(dur(0.5));
    await S.say('', '（周家兩老在門口點起一盞天燈。晨光裡，那盞燈慢慢升起，往海的方向飄去。）');
    const ms = MS();
    skyInit(ms);
    const o = launchLantern(ms, 5, 19, { text: '阿興', v: 1, vy: 26, slow: true, toward: -1 });
    await S.camera(5, 15, dur(2));
    await S.wait(dur(1.5));
    await axingVoice(S);
    await S.lantern('xd_letter', '寄到了的信');
    if (inParty('baizhi')) {
      await S.say('baizhi:cry', '……星河。他說，他收到了。');
      await S.say('xinghe:surprise', '誰？');
      await S.say('baizhi:smile', '……阿興。');
    }
    S.quest('q_letter', 'done');
    void o;
    S.cameraFollow();
    S.remove('zb_d'); S.remove('zs_d');
  }

  // ------------------------------------------------------------------ rising sky lanterns (2-16)
  function skyInit(ms) { if (!ms.c2sky) ms.c2sky = { list: [], far: [] }; return ms.c2sky; }
  const WISH = ['平安', '團圓', '如意', '豐收', '健康', '歸來', '心願', '平溪'];
  function launchLantern(ms, x, y, o = {}) {
    const sky = skyInit(ms);
    const inst = { t: 'sky_lantern', x, y, alt: o.alt || 20, v: o.v != null ? o.v : Math.floor(Math.random() * 4), text: o.text || WISH[Math.floor(Math.random() * WISH.length)],
      key: 'sky' + sky.list.length + '_' + Math.random().toString(36).slice(2, 6), alpha: 1 };
    ms.objects.push(inst);
    sky.list.push({ o: inst, vy: o.vy || U.rand(38, 70), vx: (o.toward || 0) * 0.25 + U.rand(-0.06, 0.06), slow: !!o.slow, age: 0 });
    return inst;
  }
  function skyTick(dt, ms) {
    const sky = ms.c2sky;
    if (!sky) return;
    for (const s of sky.list) {
      s.age += dt;
      let vy = s.vy;
      if (s.slow) vy *= s.age > 3 && s.age < 5 ? 0.08 : 0.7;     // 周家的燈: pauses mid-air, as if waiting
      s.o.alt += vy * dt;
      s.o.x += s.vx * dt * (s.slow && s.age > 5 ? 3 : 1);
      if (s.o.alt > 900) s.o.alpha = Math.max(0, 1 - (s.o.alt - 900) / 700);
    }
    for (let i = sky.list.length - 1; i >= 0; i--) if (sky.list[i].o.alpha <= 0) {
      const k = ms.objects.indexOf(sky.list[i].o);
      if (k >= 0) ms.objects.splice(k, 1);
      sky.list.splice(i, 1);
    }
    // distant lanterns rising in screen space, becoming stars
    if (sky.farOn) {
      sky.spawnT = (sky.spawnT || 0) - dt;
      if (sky.spawnT <= 0 && sky.far.length < 160) { sky.spawnT = 0.05; sky.far.push({ x: U.rand(0, G.W), y: G.H + 20, vy: U.rand(18, 45), s: U.rand(0.35, 1), ph: U.rand(0, 7) }); }
    }
    for (const f of sky.far) { f.y -= f.vy * dt * (0.4 + f.s); f.x += Math.sin(f.ph + f.y * 0.01) * 4 * dt; }
    sky.far = sky.far.filter((f) => f.y > -30);
  }
  function drawSkyExtras(ctx, t, ms) {
    const sky = ms.c2sky;
    if (!sky.far.length || ms.view3d) return;   // screen-space: 2D renderer only
    ctx.save();
    ctx.setTransform(G.S, 0, 0, G.S, 0, 0);
    for (const f of sky.far) {
      const k = Math.max(0, Math.min(1, f.y / G.H));
      const r = 3 + 6 * f.s * k;
      const a = 0.5 + 0.4 * Math.sin(t * 3 + f.ph);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 3);
      g.addColorStop(0, `rgba(255,214,140,${(0.75 * a).toFixed(3)})`); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r * 3, 0, Math.PI * 2); ctx.fill();
      if (k > 0.2) { ctx.fillStyle = `rgba(255,236,190,${(0.85 * k).toFixed(3)})`; ctx.fillRect(f.x - r * 0.45, f.y - r * 0.7, r * 0.9, r * 1.2); }
      else { ctx.fillStyle = `rgba(255,250,230,${(0.9 * a).toFixed(3)})`; ctx.beginPath(); ctx.arc(f.x, f.y, 1.4, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  // close-up of a sky lantern's paper (for the two wishes): a full-screen card
  class LanternCloseup {
    constructor(lines, o, res) { this.lines = lines; this.o = o || {}; this.res = res; this.t = 0; this.a = 0; this.closing = false; }
    update(dt) {
      this.t += dt;
      if (this.closing) { this.a -= dt * 2.5; if (this.a <= 0) { G.Scenes.pop(this); G.Input.clear(); this.res(); } return; }
      this.a = Math.min(1, this.a + dt * 2);
      if (auto() || (this.t > 1.2 && (G.Input.pressed('ok') || G.Input.clicked())) || this.t > 9) this.closing = true;
    }
    draw(ctx) {
      const a = Math.max(0, this.a), t = this.t;
      ctx.save();
      ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, G.W, G.H);
      ctx.globalAlpha = a;
      const cx = G.W / 2, top = 90 - (1 - a) * 20, w = 420, h = 520;
      // warm paper with the flame glowing through it
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, '#f2e4c4'); g.addColorStop(0.7, '#ffe2a8'); g.addColorStop(1, '#ffc878');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx - w / 2, top + 20); ctx.quadraticCurveTo(cx, top - 10, cx + w / 2, top + 20);
      ctx.quadraticCurveTo(cx + w / 2 - 10, top + h * 0.6, cx + w / 2 - 30, top + h); ctx.lineTo(cx - w / 2 + 30, top + h);
      ctx.quadraticCurveTo(cx - w / 2 + 10, top + h * 0.6, cx - w / 2, top + 20); ctx.closePath(); ctx.fill();
      const fl = ctx.createRadialGradient(cx, top + h + 10, 10, cx, top + h - 60, 300);
      fl.addColorStop(0, `rgba(255,150,40,${(0.55 + 0.1 * Math.sin(t * 9)).toFixed(3)})`); fl.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.fillStyle = fl; ctx.fillRect(cx - w, top, w * 2, h + 40);
      ctx.strokeStyle = 'rgba(120,80,40,0.35)'; ctx.lineWidth = 1.2;
      for (const dx of [-120, 0, 120]) { ctx.beginPath(); ctx.moveTo(cx + dx, top + 10); ctx.lineTo(cx + dx * 0.9, top + h); ctx.stroke(); }
      // vertical brush text, right to left
      const cols = this.lines;
      const size = this.o.size || 46;
      cols.forEach((col, ci) => {
        const x = cx + ((cols.length - 1) / 2 - ci) * (size + 26);
        [...col].forEach((ch, i) => {
          const al = Math.max(0, Math.min(1, (t - 0.4 - (ci * col.length + i) * 0.12) * 3));
          G.Render.text(ctx, ch, x, top + 70 + i * (size + 6), { size, align: 'center', color: '#2a1a10', alpha: al * a, shadow: false });
        });
      });
      if (this.o.caption) G.Render.text(ctx, this.o.caption, cx, G.H - 70, { size: 20, align: 'center', color: '#c9b893', alpha: a });
      ctx.restore();
    }
  }
  const closeup = (lines, o) => { G.Dialog.close(); return new Promise((res) => G.Scenes.push(new LanternCloseup(lines, o, res))); };

  // ------------------------------------------------------------------ 2-16 平安燈
  async function night216(S) {
    const ms = MS();
    const st = G.state;
    S.bgm(null);
    S.light(PX_LIGHT[3]);
    skyInit(ms);
    S.setPos('player', 23, 12, 'down'); S.gather(); ms.snapCamera();
    const kids = [['k_alan', spr('c2_alan', 'child_f'), '阿蘭', 22, 11], ['k_adi', 'child_m', '阿弟仔', 24, 11], ['k_chun', 'child_f', '小春', 22, 10], ['k_shitou', 'child_m', '石頭', 24, 10]];
    for (const [id, sp, nm, x, y] of kids) S.spawn({ id, sprite: sp, name: nm, x, y, dir: 'down' });
    S.spawn({ id: 'n_searcher', sprite: 'villager_m', name: '搜山的人', x: 23, y: 18, dir: 'up', light: { r: 120, color: '#ffb060' } });
    await S.fadeIn(dur(0.8));
    await S.say('', '（平溪，夜。山路口。星河他們帶著四個孩子走下山。）');
    await S.move('player', 'DD');
    for (const [id] of kids) S.move(id, 'DD', { wait: false });
    S.emote('n_searcher', '!');
    await S.say('', '（廟埕上，守夜的人看到他們，愣了一下——然後大叫起來。）');
    S.sfx('gong'); S.sfx('gong', 0.25); S.sfx('gong', 0.5);
    await S.say('搜山的人', '回來了！囝仔回來了——！');
    // families rush out
    S.spawn({ id: 'n_achun', sprite: 'villager_f2', name: '阿春嬸', x: 19, y: 19, dir: 'up' });
    S.spawn({ id: 'n_ashi', sprite: 'hunter', name: '阿石伯', x: 27, y: 19, dir: 'up' });
    S.spawn({ id: 'n_ama', sprite: 'old_f', name: '小春的阿嬤', x: 21, y: 21, dir: 'up' });
    S.spawn({ id: 'n_li', sprite: 'old_m', name: '李庄頭', x: 25, y: 21, dir: 'up' });
    if (S.hasItem('key_sonletter')) {
      S.spawn({ id: 'n_zbo', sprite: 'old_m', name: '周老伯', x: 18, y: 18, dir: 'up' });
      S.spawn({ id: 'n_zshen', sprite: 'old_f', name: '周老嬸', x: 18, y: 19, dir: 'up' });
    }
    await S.camera(23, 16, dur(0.6));
    S.move('n_achun', 'RRUUU', { wait: false });
    S.move('n_ashi', 'LLLUUU', { wait: false });
    S.move('n_ama', 'UUUU', { wait: false });
    for (const [id] of kids) S.move(id, 'DD', { wait: false });
    await S.wait(dur(1.4));
    await S.say('', '（家家戶戶的門打開。阿春嬸、阿石伯、小春的阿嬤衝出來，把孩子緊緊抱住。哭聲、笑聲。）');
    await S.say('阿春嬸', '阿蘭！阿弟仔！');
    await S.say('阿石伯', '石頭……你這個……你這個……');
    await S.say('石頭', '我、我沒有哭……阿爸你才哭……');
    await S.say('小春的阿嬤', '小春啊……阿嬤的心肝……');
    await S.move('n_li', 'UU');
    await S.say('李庄頭', '……好。好。好。');
    if (S.hasItem('key_sonletter')) {
      await S.move('n_zbo', 'RRU'); await S.move('n_zshen', 'RR');
      await readLetter(S);
    }
    await S.say('李庄頭', '吳阿公！天燈！');
    S.spawn({ id: 'n_wu', sprite: 'old_m', name: '吳阿公', x: 23, y: 21, dir: 'up' });
    await S.say('吳阿公', '早就準備好了！');
    await S.move('n_wu', 'U');
    await S.say('', '（吳阿公捧出一盞大天燈。白色的棉紙上，四面寫著：「平安」、「歸來」、「合境平安」、「平溪」。）');
    await closeup(['平安', '歸來', '合境平安', '平溪'], { size: 40, caption: '吳阿公的大天燈' });
    await S.say('吳阿公', '山上的人，還不知道囝仔回來了。');
    await S.say('吳阿公', '平溪的老規矩——放天燈，給山上的人報平安。');
    S.face('n_wu', 'player');
    await S.say('', '（吳阿公看向星河。）');
    await S.say('吳阿公', '少年仔，你問過我天燈是怎麼來的。現在可以講了。');
    S.bgm('pingxi', { fade: 2 });
    await S.say('吳阿公', '很久很久以前，這座山谷常常有土匪來搶。');
    await S.say('吳阿公', '土匪一來，庄裡的人就揹著囝仔、扶著老人，逃進深山裡躲。');
    await S.say('吳阿公', '山裡沒有路，也沒有消息。躲的人不知道土匪走了沒，不敢回家。');
    await S.say('吳阿公', '留在庄裡顧家的人，等土匪走了，就紮一盞燈，點火，放上天。');
    await S.say('吳阿公', '山上的人一看到天上的燈，就知道——「平安了，可以回家了。」');
    await S.say('吳阿公', '所以天燈，我們平溪人也叫它「平安燈」。');
    await S.say('吳阿公', '也有人說是孔明發明的，叫孔明燈。孔明是孔明，我們是我們！');
    await S.say('吳阿公', '後來，大家就在元宵放天燈，在上面寫願望，求一年平安。');
    await S.say('吳阿公', '可是今暝不是元宵。今暝放的，是最早的那一種天燈。');
    await S.say('吳阿公', '叫山上的人——回家。');
    S.sfx('fire');
    launchLantern(ms, 23, 18, { text: '歸來', v: 1, vy: 30, alt: 24 });
    await S.say('', '（吳阿公點燃燈底那團沾了油的金紙。火光一亮，燈身慢慢鼓起來、變輕，從他的手裡浮起，升上夜空。）');
    await S.camera(23, 10, dur(3));
    await S.wait(dur(1.2));
    await S.say('', '（山上的鑼聲，停了。）');
    await S.wait(dur(1.0));
    S.sfx('gong'); S.sfx('gong', 0.15); S.sfx('gong', 0.3); S.sfx('gong', 0.45);
    await S.say('', '（然後，遠遠地，傳來一陣歡呼。鑼聲再度響起——這一次，敲得又快又急。是在回答。）');
    await S.say('baizhi:surprise', '……他們看到了。');
    await S.say('hongying:smile', '……嗯。');
    await S.camera(23, 17, dur(0.8));
    await S.say('李庄頭', '好！大家，放天燈！感謝山神、感謝土地公、感謝三位恩人！');
    // villagers bring lanterns
    const vill = [['n_v1', 'villager_m', 19, 22], ['n_v2', 'villager_f', 27, 22], ['n_v3', 'villager_m2', 17, 20], ['n_v4', 'villager_f2', 28, 18], ['n_v5', 'child_f', 20, 23], ['n_v6', 'old_m', 26, 23]];
    for (const [id, sp, x, y] of vill) S.spawn({ id, sprite: sp, name: '庄民', x, y, dir: 'up' });
    await S.say('', '（村民們捧出一盞盞天燈。吳阿公分給三人各一盞，還有毛筆和墨。）');
    await S.give('key_skylantern', 1);
    await S.say('吳阿公', '來，你們也寫。四面都可以寫，願望寫越多，天公伯越知道。');
    if (F('ch2_letter_read')) {
      S.spawn({ id: 'n_zbo2', sprite: 'old_m', name: '周老伯', x: 20, y: 18, dir: 'right' });
      if (!S.actor('n_zshen')) S.spawn({ id: 'n_zshen2', sprite: 'old_f', name: '周老嬸', x: 20, y: 19, dir: 'right' });
      await S.say('', '（周老伯和周老嬸也捧著一盞燈。周老伯一筆一筆、很慢地寫著——是吳阿公握著他的手教的——「阿興」。）');
    }
    if (inParty('hongying')) {
      await S.say('', '（紅纓寫得很快，寫完就把那一面轉過去。）');
      await S.say('xinghe:think', '寫什麼？');
      await S.say('hongying:angry', '不關你的事！');
      await S.say('', '（燈轉動時，露出一角：「爹、娘、哥哥……」）');
      await S.say('xinghe:sad', '……');
      await S.say('', '（另一面，寫著四個字：「找到鬼面」。再另一面，字寫得特別小——）');
      await S.say('xinghe:think', '……「想養一隻胖胖的貓」？');
      await pet(S, 'yuyuan', '?', '（芋圓慢慢轉過頭，盯著紅纓。）');
      await S.say('hongying:shy', '看什麼看！');
    }
    await S.say('', '（白芷拿著筆，看著空白的燈紙，很久。）');
    await S.say('baizhi:think', '我不知道要寫什麼。');
    await S.say('xinghe:smile', '寫妳最想要的。');
    await S.say('baizhi:think', '最想要的……');
    await S.say('', '（白芷一筆一筆寫得很慢，很認真。）');
    await closeup(['我想知道我是誰。'], { size: 48, caption: '白芷的天燈' });
    await S.say('xinghe:think', '……');
    S.face('player', 'up');
    await S.say('', '（星河背過身，用身體擋住，很快地在自己的燈上寫了一行字。）');
    await closeup(['希望她不要想起來就離開。'], { size: 44 });
    await S.say('', '（星河看著那行字，愣住了。）');
    await S.say('xinghe:think', '……我在寫什麼啊。');
    await S.say('', '（他伸手想把它塗掉。墨已經乾了。）');
    await S.say('', '（他嘆了口氣，在其他三面寫上：「陳伯長命百歲」、「變成劍仙」、「大家平安」。）');
    S.face('player', 'down');
    await S.say('吳阿公', '點火——！');
    // the release
    S.bgm('pingxi', { fade: 0.5 });
    S.sfx('fire');
    S.particles([{ type: 'embers', density: 1.5 }, { type: 'fireflies', density: 0.6 }]);
    const p = ms.player;
    launchLantern(ms, p.x + 0.2, p.y - 0.2, { text: '大家平安', v: 2, vy: 34 });
    const bz = ms.actor('baizhi'); if (bz) launchLantern(ms, bz.x, bz.y - 0.2, { text: '我是誰', v: 1, vy: 32 });
    const hy = ms.actor('hongying'); if (hy) launchLantern(ms, hy.x, hy.y - 0.2, { text: '找到鬼面', v: 0, vy: 36 });
    let zhouLantern = null;
    if (F('ch2_letter_read')) zhouLantern = launchLantern(ms, 20.4, 18, { text: '阿興', v: 1, vy: 30, slow: true, toward: -1 });
    for (let i = 0; i < 46; i++) {
      const x = U.rand(3, 45), y = U.rand(9, 31);
      setTimeout(() => { if (MS() === ms) launchLantern(ms, x, y, { alt: U.rand(10, 60) }); }, auto() ? 0 : i * 140);
    }
    ms.c2sky.farOn = true;
    await S.say('', '（數百盞天燈，一盞接一盞，從平溪的山谷裡升起。燈光照亮了山壁、竹林、溪水。）');
    await S.camera(23, 9, dur(5));
    await S.say('', '（它們越飛越高，越飛越小，最後混進星星裡，分不清哪些是燈，哪些是星。）');
    if (zhouLantern && !G.Lanterns.has('xd_letter')) {
      await S.camera(20, 14, dur(1.2));
      await S.say('', '（周家的那盞燈，飛得特別慢，特別穩。它在半空中停了一下，好像在等誰。）');
      S.emote('baizhi', '!');
      await S.say('', '（白芷忽然抬起頭。）');
      await S.say('?', '……阿爸，阿母。我收到了。');
      await S.say('?', '要好好吃飯喔。');
      await S.say('baizhi:surprise', '……');
      await S.say('', '（那盞燈，輕輕地，往海的方向飄去了。）');
      await S.lantern('xd_letter', '寄到了的信');
      S.quest('q_letter', 'done');
      await S.say('baizhi:cry', '……星河。他說，他收到了。');
      await S.say('xinghe:surprise', '誰？');
      await S.say('baizhi:smile', '……阿興。');
      await S.camera(23, 11, dur(1));
    }
    S.bgm('love', { fade: 3 });
    await S.say('baizhi:smile', '……好像倒過來的海。');
    await S.say('xinghe:think', '倒過來的海？');
    await S.say('baizhi:think', '八斗子那天晚上，海上全都是燈。');
    await S.say('baizhi:smile', '現在，天上全都是燈。');
    await S.say('baizhi:think', '海上的燈，是送人走的。天上的燈……是叫人回家的。');
    await S.say('xinghe:smile', '……嗯。');
    await S.say('baizhi:think', '星河，你寫了什麼？');
    await S.say('xinghe:surprise', '……秘、秘密。');
    await S.say('baizhi:smile', '我寫的是「我想知道我是誰」。');
    await S.say('xinghe:think', '……我知道。我看到了。');
    await S.say('baizhi:think', '你覺得，我會想起來嗎？');
    await S.say('xinghe:think', '……');
    await S.say('xinghe:smile', '會吧。一定會的。');
    await S.say('', '（他笑著說。可是他沒有看她，而是一直看著天上——那盞寫著秘密的燈，越飛越遠。）');
    if (inParty('hongying')) {
      await S.say('hongying:normal', '……喂，你們兩個。');
      await S.say('hongying:smug', '看天燈可以，不要看到忘記吃飯。月娘說今暝有雞湯。');
    }
    await S.say('baizhi:surprise', '雞湯！');
    await pet(S, 'yuyuan', '!', '（芋圓已經往客棧的方向跑了。）');
    await S.say('xinghe:laugh', '走走走！');
    S.take('key_skylantern', 1);
    S.flag('ch2_tiandeng_night');
    await S.fadeOut(dur(1.2));
    ms.c2sky.farOn = false;
    for (const id of ms.npcs.filter((n) => n.spawned).map((n) => n.id)) S.remove(id);
    S.healParty();
    S.cameraFollow();
  }

  // ------------------------------------------------------------------ 2-17 翌晨・風颱 → 八月初五
  async function typhoon217(S) {
    const ms = MS();
    S.bgm(null);
    if (ms.c2sky) { for (const s of ms.c2sky.list) { const k = ms.objects.indexOf(s.o); if (k >= 0) ms.objects.splice(k, 1); } ms.c2sky = null; }
    if (G.Render.fade.a < 0.5) await S.fadeOut(dur(0.4));
    S.light(PX_LIGHT[17]);
    S.particles(['leaves']);
    S.setPos('player', 23, 19, 'up'); S.gather(); ms.snapCamera();
    await S.titleCard('', '七月十七');
    S.spawn({ id: 't_li', sprite: 'old_m', name: '李庄頭', x: 23, y: 17, dir: 'down' });
    S.spawn({ id: 't_wu', sprite: 'old_m', name: '吳阿公', x: 25, y: 18, dir: 'left' });
    S.spawn({ id: 't_v1', sprite: 'villager_m', name: '庄民', x: 21, y: 17, dir: 'down' });
    S.spawn({ id: 't_v2', sprite: 'villager_f', name: '庄民', x: 20, y: 18, dir: 'right' });
    S.bgm('pingxi');
    await S.fadeIn(dur(0.8));
    await S.say('', '（清晨。廟埕上還留著昨夜的金紙灰。李庄頭帶著幾個庄民站在那裡。）');
    await S.say('李庄頭', '洛姑娘、星河、白芷姑娘。這是庄裡說好的賞金。');
    if (inParty('hongying')) {
      await S.say('hongying:normal', '……我不要。');
      await S.say('李庄頭', '欸？');
      await S.say('hongying:serious', '庄裡這幾天，為了找孩子，大家田也沒種，活也沒做。');
      await S.say('hongying:normal', '一半留給孩子們。另一半……給這兩個笨蛋當盤纏。他們窮。');
      await S.say('xinghe:angry', '我們哪裡窮了！');
      await S.say('baizhi:think', '我們很窮嗎？');
      await S.say('xinghe:sad', '……有一點。');
    }
    S.gold(400);
    await S.say('李庄頭', '……這個姑娘喔。');
    await S.say('李庄頭', '你們要去淡水？從十分瀑布下面坐船，順著基隆河一路下去……');
    S.sfx('wind'); S.shake(4, 0.8);
    S.particles([{ type: 'wind', density: 1.2 }, 'leaves']);
    await S.say('', '（一陣強風颳過廟埕，吹得天燈架嘎嘎作響。東邊天上的雲，紅得像火燒。）');
    S.face('t_wu', 'up');
    await S.say('吳阿公', '……庄頭，你看天。');
    await S.say('李庄頭', '火燒雲……風颱要來了。');
    await S.say('李庄頭', '風颱過後，基隆河的水會漲好幾天，船不能走。');
    await S.say('李庄頭', '你們就在平溪多住幾天吧。客棧的錢，庄裡出。');
    if (inParty('hongying')) await S.say('hongying:think', '……鬼面不會等人。');
    await S.say('baizhi:think', '可是，風也不會等人。');
    if (inParty('hongying')) await S.say('hongying:sad', '……說得也是。');
    await S.fadeOut(dur(0.8));
    for (const id of ['t_li', 't_wu', 't_v1', 't_v2']) S.remove(id);
    S.particles(['rain', 'wind']);
    S.sfx('wind');
    await S.narrate(['那年的第一個風颱，在七月十八的夜裡，撲上了北邊的山。', '平溪的竹林倒了一片，田埂沖垮了好幾段，基隆河漲成了黃色的大水。', '三個人在平溪，一住就是半個月。'], { veil: 1 });
    await S.narrate(['星河幫吳阿公修好了被吹破的天燈舖。', '紅纓跟著阿石伯上山巡獵，把魔神仔趕得遠遠的。', '白芷跟阿藍姐學染布。她說，要染一條藍色的頭巾，送給九份的陳伯。', '八月初五，河水退了。'], { veil: 1 });
    S.flag('ch2_dawn');
    S.healParty();
    S.light(PX_LIGHT[4]);
    S.particles(['motes', 'leaves']);
    S.refresh();
    await S.titleCard('', '八月初五');
    S.setPos('player', 23, 19, 'up'); S.gather(); ms.snapCamera();
    S.spawn({ id: 't_li2', sprite: 'old_m', name: '李庄頭', x: 23, y: 17, dir: 'down' });
    S.bgm('pingxi');
    await S.fadeIn(dur(1));
    await S.say('李庄頭', '河水退了。船伕阿河說，今天可以開船。');
    await S.say('李庄頭', '十分瀑布下面的碼頭。去跟大家說聲再見，再過去吧。');
    S.remove('t_li2');
    S.refresh();
    S.quest('q_ch2_main', 5);
    S.objective('跟平溪的大家道別，到十分瀑布搭船');
  }

  const kid = (id, sp, nm, x, y, lines) => ({ id, sprite: sp, name: nm, x, y, dir: 'down', wander: 1, if: Q(4), talk: lines });
  G.Maps.define('pingxi', {
    name: '平溪',
    subtitle: (st) => ({ 1: '基隆河上游・入夜', 2: '基隆河上游的山谷小庄', 3: '平安燈', 17: '火燒雲', 4: '風颱過後' })[PQ(st)],
    place: 'pingxi',
    bgm: (st) => ({ 1: 'night', 2: 'pingxi', 3: 'pingxi', 17: 'pingxi', 4: 'pingxi' })[PQ(st)],
    start: [23, 2],
    light: (st) => PX_LIGHT[PQ(st)],
    particles: (st) => ({ 1: [{ type: 'mist', density: 0.8 }, { type: 'fireflies', density: 0.6 }], 2: [{ type: 'mist', density: 0.4 }, 'leaves'], 3: ['embers'], 17: ['leaves'], 4: ['motes', 'leaves'] })[PQ(st)],
    tiles: rows(PX.g), deco: rows(PX.d),
    objects: [
      { t: 'house_minnan', x: 16, y: 3, v: 0, door: -1 },
      { t: 'shrine_small', x: 26, y: 3, text: '福德正神', label: '參拜', interact: async (S) => {
        if (PQ() === 4) await S.say('', '平溪的土地公廟。風颱過後，廟前多了好幾串還願的鞭炮屑。');
        else if (PQ() === 1) await S.say('', '小小的土地公廟。夜裡也有人來上香，香爐裡的香還亮著。');
        else await S.say('', '平溪的土地公廟。香爐裡插滿了香——這三天，全庄的人都來這裡求過。');
      } },
      { t: 'stone_lantern', x: 25, y: 4 },
      { t: 'house_minnan', x: 8, y: 9, v: 1 },
      { t: 'signboard', x: 13, y: 11, text: '天燈', v: 1 },
      { t: 'lantern_rack', x: 6, y: 11 },
      { t: 'shophouse', x: 30, y: 9, v: 2, text: '十分客棧' },
      { t: 'shophouse', x: 36, y: 9, v: 1, text: '阿貴商號' },
      { t: 'red_lantern', x: 29, y: 11, hang: true }, { t: 'red_lantern', x: 34, y: 11, hang: true }, { t: 'red_lantern', x: 40, y: 11, hang: true },
      { t: 'barrel', x: 35, y: 12 }, { t: 'crate', x: 40, y: 12 }, { t: 'basket', x: 41, y: 12, v: 2 },
      { t: 'house_jiufen', x: 3, y: 17, v: 1, text: '周' },
      { t: 'red_lantern', x: 6, y: 19, hang: true, text: '興', label: '調查', if: (st) => !(PQ(st) === 4 && G.Lanterns.has('xd_letter')),
        interact: '門口掛著一盞小燈籠。燈籠上寫著一個字：「興」。' },
      { t: 'red_lantern', x: 6, y: 19, hang: true, text: '興', lit: false, label: '調查', if: (st) => PQ(st) === 4 && G.Lanterns.has('xd_letter'),
        interact: '門口的小燈籠熄了。燈籠上寫著一個字：「興」。' },
      { t: 'house_jiufen', x: 40, y: 17, v: 2 },
      { t: 'fence_bamboo', x: 44, y: 18, w: 1, h: 2 }, { t: 'stump', x: 39, y: 20 }, { t: 'log', x: 44, y: 21 },
      saveStone(24, 16, '廟埕旁的石燈籠。'),
      { t: 'incense_burner', x: 23, y: 18, if: (st) => PQ(st) !== 3 },
      { t: 'lantern_rack', x: 23, y: 20, label: '調查', if: (st) => PQ(st) === 1 || PQ(st) === 2,
        interact: async (S) => { await S.say('', '竹架上掛著幾十盞天燈，白白的棉紙，竹篾紮的圓口。燈上還沒寫字。'); } },
      { t: 'statue_lion', x: 18, y: 17 }, { t: 'statue_lion', x: 28, y: 17, flip: true },
      { t: 'lantern_string', x: 18, y: 16, w: 4, v: 1 }, { t: 'lantern_string', x: 25, y: 16, w: 4, v: 1 },
      { t: 'bench', x: 19, y: 23 }, { t: 'bench', x: 26, y: 23 },
      // 染坊
      { t: 'c2_indigo', x: 11, y: 20 }, { t: 'c2_indigo', x: 14, y: 20 },
      ...[[11, 22], [12, 23], [15, 22], [16, 21]].map(([x, y]) => ({ t: 'jar', x, y, v: 2, label: '調查', interact: '缸裡是深得發黑的藍色染液，聞起來有一點酸。' })),
      { t: 'signboard', x: 10, y: 21, text: '染' },
      // 河邊・田裡
      { t: 'boat_small', x: 5, y: 27 }, { t: 'boat_small', x: 30, y: 26 },
      { t: 'house_jiufen', x: 6, y: 31, v: 3, door: -1 }, { t: 'house_jiufen', x: 28, y: 36, v: 0, door: -1 },
      { t: 'drying_rack', x: 11, y: 31 }, { t: 'well', x: 26, y: 37 }, { t: 'cart', x: 33, y: 37 },
      { t: 'signboard', x: 45, y: 32, text: '十分' }, { t: 'signboard', x: 42, y: 11, text: '竹林' },
    ],
    chests: [{ id: 'c2_p1', x: 46, y: 2, item: 'c2_longan', n: 3 }],
    npcs: [
      { id: 'lizhuang', sprite: 'old_m', name: '李庄頭', x: 22, y: 18, dir: 'down', if: (st) => !!st.flags.ch2_pingxi_arrive && Q(1, 2, 4)(st), talk: liTalk },
      { id: 'zhou_bo', sprite: 'old_m', name: '周老伯', x: 5, y: 20, dir: 'down', if: (st) => !!st.flags.ch2_pingxi_arrive && Q(1)(st), talk: zhouOutsideTalk },
      { id: 'zhou_shen', sprite: 'old_f', name: '周老嬸', x: 6, y: 20, dir: 'up', if: (st) => !!st.flags.ch2_pingxi_arrive && Q(1)(st), talk: zhouOutsideTalk },
      { id: 'ashan_sao', sprite: 'villager_f', name: '阿山嫂', x: 42, y: 20, dir: 'down', if: Q(1, 2, 4), talk: ashanSaoTalk },
      { id: 'azhu_home', sprite: spr('c2_azhu', 'child_m'), name: '阿竹', x: 43, y: 20, dir: 'down', if: (st) => !!st.flags.ch2_azhu_met && Q(1, 2, 4)(st) && !st.vars.c2_ashan, talk: azhuHomeTalk,
        light: { r: 80, color: '#ffb060' } },
      { id: 'ashan_home', sprite: spr('c2_ashan', 'woodcutter'), name: '阿山', x: 39, y: 21, dir: 'right', if: (st) => qDone('q_woodcutter') && Q(2, 4)(st),
        talk: ['恩人！……我現在看到雞腿，腳就會軟。', '那條山徑，我走了二十年。以後我一定綁一條藍布在樹上，比紅布好看。'] },
      { id: 'achun', sprite: 'villager_f2', name: '阿春嬸', x: 20, y: 22, dir: 'up', if: Q(1, 2, 4), talk: achunTalk },
      { id: 'ashi', sprite: 'hunter', name: '阿石伯', x: 44, y: 11, dir: 'down', if: Q(1, 2, 4), talk: ashiTalk },
      { id: 'xiaochun_ama', sprite: 'old_f', name: '小春的阿嬤', x: 26, y: 22, dir: 'up', if: Q(1, 2, 4), talk: amaTalk },
      { id: 'alan_jie', sprite: 'villager_f', name: '阿藍姐', x: 13, y: 21, dir: 'down', if: Q(2, 4), talk: alanjieTalk },
      { id: 'axi', sprite: 'child_m', name: '阿溪', x: 10, y: 25, dir: 'down', if: Q(2, 4), talk: axiTalk },
      { id: 'aquan', sprite: 'villager_m2', name: '挑夫阿全', x: 30, y: 16, dir: 'down', if: Q(2, 4), talk: aquanTalk },
      { id: 'searcher1', sprite: 'villager_m', name: '搜山的人', x: 46, y: 11, dir: 'left', if: Q(1, 2, 4), talk: searcherTalk, light: { r: 120, color: '#ffb060' } },
      { id: 'searcher2', sprite: 'villager_m2', name: '搜山的人', x: 46, y: 14, dir: 'left', if: Q(1, 2, 4), talk: searcherTalk },
      // Q4: the four children on the temple square
      kid('alan', spr('c2_alan', 'child_f'), '阿蘭', 19, 19, [['阿蘭', '我就說熱油有用吧！阿嬤的故事不會騙人！'], ['阿蘭', '藍衫姊姊，妳的手冰冰的。下次我請妳吃熱熱的湯圓。']]),
      kid('adi', 'child_m', '阿弟仔', 20, 19, async (S) => {
        await S.say('阿弟仔', '……紅色姊姊好兇。');
        if (inParty('hongying')) {
          await S.say('hongying:angry', '誰兇了！');
          await S.say('阿弟仔', '嗚哇——');
          await S.say('hongying:surprise', '欸、欸！不要哭！……給、給你糖！');
        }
      }),
      kid('xiaochun', 'child_f', '小春', 26, 20, async (S) => {
        await S.say('小春', '我在籠子裡的時候，有一隻小火飛進來陪我。');
        if (inParty('baizhi')) await S.say('baizhi:surprise', '小火？');
        await S.say('小春', '藍色的、暖暖的。跟姊姊身上的光一樣。');
      }),
      kid('shitou', 'child_m', '石頭', 27, 20, [['石頭', '我才沒有哭！是籠子裡灰塵太多！']]),
      // ambient life
      { id: 'px_farmer', sprite: 'villager_m', name: '種田的阿伯', x: 13, y: 36, dir: 'left', wander: 2, if: Q(2, 4),
        talk: ['大菁要趁露水還在的時候割。割下來泡在缸裡，就變成藍色的泥。', '我們平溪的布，挑到九份、挑到淡水，人家一看就知道：這是平溪藍。'] },
      { id: 'px_buffalo', sprite: 'buffalo', name: '水牛', x: 15, y: 37, dir: 'left', wander: 1, if: Q(2, 4), talk: ['哞——（水牛甩了甩尾巴，繼續嚼草。）'] },
      { id: 'px_dog', sprite: 'dog', name: '黃狗', x: 33, y: 15, dir: 'left', wander: 3, if: Q(2, 4), talk: ['汪！（黃狗搖著尾巴，跟著你走了兩步。）'] },
      { id: 'px_chicken1', sprite: 'chicken', name: '雞', x: 6, y: 23, dir: 'right', wander: 2, if: Q(2, 4), talk: ['咕咕。'] },
      { id: 'px_chicken2', sprite: 'chicken', name: '雞', x: 36, y: 21, dir: 'left', wander: 2, if: Q(2, 4), talk: ['咕咕咕。'] },
      { id: 'px_washer', sprite: 'villager_f2', name: '洗衫的阿嫂', x: 25, y: 25, dir: 'down', if: Q(2, 4),
        talk: ['基隆河的水，上游清、下游濁。我們平溪人，洗衫都在這一段。', '天燈放上去，有時候會掉在田裡。囝仔撿到了，比過年還歡喜。'] },
      { id: 'px_kid', sprite: 'child_f', name: '綁辮子的囡仔', x: 33, y: 19, dir: 'down', wander: 2, if: Q(4),
        talk: ['那暝的天燈好多好多！我數到一百就數不下去了！'] },
    ],
    events: [
      { id: 'arrive', trigger: 'auto', if: (st) => !!st.flags.ch2_hongying_join && !st.flags.ch2_pingxi_arrive, run: arrive210 },
      { id: 'reunion', trigger: 'auto', if: (st) => !!st.flags.ch2_pingxi_arrive && !!st.vars.c2_ashan && PQ(st) !== 3, run: (S) => reunion(S, true) },
      { id: 'night', trigger: 'auto', if: (st) => !!st.flags.ch2_tiger_beaten && !st.flags.ch2_tiandeng_night, run: night216 },
      { id: 'typhoon', trigger: 'auto', if: (st) => !!st.flags.ch2_tiandeng_night && !st.flags.ch2_dawn, run: typhoon217 },
      { id: 'shrimp', trigger: 'action', x: 7, y: 26, w: 2, h: 1, label: '翻石頭', if: Q(2), run: shrimpSpot },
      { id: 'shoot', trigger: 'action', x: 43, y: 5, label: '採集', run: shootSpot },
      { id: 'ashan_door', trigger: 'action', x: 41, y: 19, label: '敲門', run: async (S) => {
        await S.say('阿山嫂', qDone('q_woodcutter') ? '他在裡面睡得跟豬一樣。恩人不要進去，會被打呼聲嚇到。' : '家裡亂糟糟的，不好意思讓恩人進來。');
      } },
    ],
    warps: [
      { x: 22, y: 0, w: 3, to: 'mistforest_s', tx: 19, ty: 42, tdir: 'up' },
      { x: 10, y: 11, to: 'pingxi_tiandeng', tx: 7, ty: 8, tdir: 'up', door: true },
      { x: 31, y: 11, to: 'pingxi_inn', tx: 8, ty: 10, tdir: 'up', door: true },
      { x: 37, y: 11, to: 'pingxi_store', tx: 7, ty: 8, tdir: 'up', door: true },
      { x: 4, y: 19, to: 'pingxi_oldhouse', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 47, y: 12, h: 2, to: 'tiger_lair', tx: 1, ty: 30, tdir: 'right', run: async (S) => {
        if (PQ() === 1) {
          await S.say('搜山的人', '夜裡山上看不到路，天光再去！你們先歇！');
          await S.move('player', 'L');
          return false;
        }
        await comboCheck();
        return true;
      } },
      { x: 47, y: 33, h: 2, to: 'shifen_falls', tx: 1, ty: 13, tdir: 'right', run: async (S) => {
        if (!F('ch2_tiandeng_night')) {
          await S.say('xinghe:think', '十分瀑布……等孩子們找到再說。');
          await S.move('player', 'L');
          return false;
        }
        return true;
      } },
    ],
    drawGround: drawPuddles,
    drawOver: drawPingxi,
    onUpdate: (dt, ms) => { skyTick(dt, ms); escort(ms); },
  });

  // =================================================================================================
  // 1.6 pingxi_inn — 十分客棧
  // =================================================================================================
  const INN = (() => { const g = room(16, 12, '_', 'W', [8]); return rows(g); })();
  async function yueniangTalk(S) {
    const q = PQ();
    if (qActive('q_hy_kitchen') && S.hasItem('c2_bamboo_shoot') && S.hasItem('c2_shrimp') && S.hasItem('c2_shansu') && inParty('hongying')) { await cook(S); return; }
    if (q === 4) {
      await S.say('月娘', '那暝的天燈，是我活到現在看過最多的一次。');
      if (F('ch2_bundle_returned') && !F('ch2_yue_letter')) { S.flag('ch2_yue_letter'); await S.say('月娘', '阿全幫我帶來一封信……我妹妹生了！是個胖小子！'); }
    } else if (q === 2) await S.say('月娘', '三位恩人，今天也要上山嗎？吃飽再去，空肚子打不贏老虎。');
    else await S.say('月娘', '歡迎光臨十分客棧。');
    if (qActive('q_hy_kitchen')) {
      const have = ['c2_bamboo_shoot', 'c2_shrimp', 'c2_shansu'].filter((i) => S.hasItem(i)).length;
      await S.say('月娘', have ? '洛姑娘的料理……材料還沒齊喔。竹筍、溪蝦、山蘇。' : '洛姑娘說要做「山產炒」……竹筍、溪蝦、山蘇。……我先把鍋子藏好。');
    }
    const c = await S.choice(['住宿（30 文）', '買東西', '不用了'], { cancel: 2 });
    if (c === 0) {
      if (G.state.gold < 30) { await S.say('月娘', '客官，您的盤纏好像不太夠呢……'); return; }
      G.state.gold -= 30;
      await S.fadeOut(dur(0.8)); G.Music.stop(0.8); G.Party.healAll(); G.Audio.sfx('heal');
      await S.wait(dur(1.2)); await S.fadeIn(dur(0.8)); G.Music.play(G.Mapx.val(MS().def.bgm));
      S.toast('好好休息了一晚，全員完全恢復。', 'lantern');
    } else if (c === 1) await S.shop(['c2_bento', 'c2_chicken_soup', 'jinchuang', 'caozaiguo'], { title: '十分客棧' });
  }
  async function cook(S) { // 4.3 料理
    const ms = MS();
    await S.fadeOut(dur(0.5));
    S.setPos('player', 11, 3, 'right'); S.gather(); ms.snapCamera();
    const hy = S.actor('hongying');
    if (hy) { hy.scripted = true; hy.setCell(12, 3); hy.dir = 'up'; }
    const bz = S.actor('baizhi');
    if (bz) { bz.scripted = true; bz.setCell(10, 4); bz.dir = 'right'; }
    await S.fadeIn(dur(0.5));
    await S.say('', '（灶腳。紅纓捲起袖子，把竹筍、溪蝦、山蘇一股腦丟進鍋裡。）');
    await S.say('hongying:serious', '火要大！洛家的規矩：做什麼都要全力！');
    S.sfx('fire'); S.shake(4, 0.3); S.flash('#ff9a40', 0.4, 0.6);
    await S.say('', '（轟——！灶口噴出一團火。黑煙滾滾。）');
    await S.say('月娘', '我的灶——！');
    await S.fadeOut(dur(0.6));
    S.setPos('player', 8, 4, 'down'); if (hy) { hy.setCell(7, 4); hy.dir = 'down'; } if (bz) { bz.setCell(9, 4); bz.dir = 'down'; }
    S.spawn({ id: 'yue_c', sprite: 'shopkeeper_f', name: '月娘', x: 8, y: 7, dir: 'up' });
    ms.snapCamera();
    await S.fadeIn(dur(0.6));
    await S.say('', '（桌上擺著一盤……黑色的東西。）');
    await S.say('hongying:smug', '好了！洛家特製「山產炒」！');
    await S.say('xinghe:think', '……這是炭吧。');
    await S.say('hongying:angry', '是焦香！');
    await pet(S, 'yuyuan', '…', '（連芋圓都湊過去聞了一下，然後轉身，用後腿往盤子撥了撥土。）');
    await S.say('baizhi:think', '我吃吃看。');
    await S.say('xinghe:surprise', '白芷！不要勉強！');
    await S.say('', '（白芷夾起一塊，放進嘴裡，慢慢地嚼。嚼了很久。）');
    await S.say('baizhi:think', '……');
    await S.say('baizhi:think', '……原來，人間的食物，也可以是一種……修行。');
    await S.say('hongying:cry', '……你們不用勉強啦！');
    await S.say('', '（月娘噗哧一聲笑了出來。）');
    await S.say('月娘', '好啦，竹筍跟蝦子還有剩，我來煮一鍋湯。洛姑娘，妳幫我顧火。');
    await S.say('月娘', '……小火就好。');
    await S.say('hongying:shy', '……嗯。');
    await S.fadeOut(dur(0.6));
    await S.wait(dur(0.4));
    await S.fadeIn(dur(0.6));
    await S.say('', '（一鍋清甜的竹筍溪蝦湯。三人吃得乾乾淨淨。）');
    await S.say('hongying:shy', '……這個湯，也有我顧的火。');
    await S.say('baizhi:smile', '嗯。很好喝。');
    await S.say('xinghe:smile', '火顧得很好。');
    await S.say('hongying:angry', '……少、少囉嗦！');
    for (const i of ['c2_bamboo_shoot', 'c2_shrimp', 'c2_shansu']) S.take(i, 1);
    await S.give('c2_hy_charcoal', 3);
    await S.give('c2_shoot_soup', 2);
    S.quest('q_hy_kitchen', 'done');
    S.remove('yue_c');
    S.gather();
  }
  G.Maps.define('pingxi_inn', {
    name: '十分客棧', subtitle: '平溪',
    bgm: (st) => (PQ(st) === 1 ? 'night' : 'pingxi'),
    start: [8, 9],
    light: (st) => (PQ(st) === 1 ? { ambient: 0.55, color: '#0a0818', playerR: 200 } : { ambient: 0.12, color: '#1a1008' }),
    tiles: INN,
    objects: [
      { t: 'counter', x: 3, y: 3, w: 4 }, { t: 'shelf_lanterns', x: 2, y: 2 }, { t: 'cabinet', x: 7, y: 2 }, { t: 'jar_row', x: 1, y: 4 },
      { t: 'stove', x: 11, y: 2, label: '調查', interact: async (S) => { await S.say('', qDone('q_hy_kitchen') ? '灶口還有一圈燒焦的痕跡。' : '月娘的灶。鍋子還是黑的。'); } },
      { t: 'pot', x: 13, y: 2 }, { t: 'bucket', x: 14, y: 3 },
      { t: 'table', x: 7, y: 5, w: 2 }, { t: 'chair', x: 6, y: 5, dir: 'right' }, { t: 'chair', x: 9, y: 5, dir: 'left' },
      { t: 'screen', x: 1, y: 6 }, { t: 'screen', x: 3, y: 6 }, { t: 'screen', x: 11, y: 6 }, { t: 'screen', x: 13, y: 6 },
      { t: 'bed', x: 1, y: 8 }, { t: 'bed', x: 4, y: 8 }, { t: 'bed', x: 12, y: 8 }, { t: 'bed', x: 14, y: 8 },
      { t: 'rug', x: 7, y: 8, w: 3, h: 2 }, { t: 'plant_pot', x: 10, y: 10 }, { t: 'plant_pot', x: 6, y: 10, v: 1 },
    ],
    npcs: [
      { id: 'yueniang', sprite: 'shopkeeper_f', name: '月娘', x: 5, y: 2, dir: 'down', talk: yueniangTalk },
    ],
    events: [
      { id: 'night211', trigger: 'auto', if: (st) => !!st.flags.ch2_pingxi_arrive && !st.flags.ch2_morning, run: async (S) => { // 2-11
        const ms = MS();
        await S.say('月娘', '三位就是庄頭說的恩人吧？房間準備好了。');
        await S.say('月娘', '今暝不收錢。庄頭交代的。');
        if (inParty('hongying')) {
          await S.say('hongying:normal', '……那我去灶腳借一下，煮點東西給大家——');
          await S.say('月娘', '不、不用了！洛姑娘！灶腳……灶腳今暝在修！');
          await S.say('hongying:think', '……？');
          await S.say('xinghe:think', '（小聲）月娘，她……');
          await S.say('月娘', '（小聲）前天她煮了一鍋粥，我的鍋子到現在還是黑的。');
        }
        await S.fadeOut(dur(0.8));
        S.show('player', false); S.hideFollowers(true);
        S.spawn({ id: 'bz_n', sprite: 'baizhi', x: 13, y: 7, dir: 'up' });
        if (inParty('hongying')) S.spawn({ id: 'hy_n', sprite: 'hongying', x: 11, y: 9, dir: 'right' });
        S.light({ ambient: 0.7, color: '#060818' });
        await S.camera(12, 8, 0.01);
        await S.fadeIn(dur(0.8));
        await S.say('', '（東南的客房。白芷坐在窗邊，看著山上一點一點移動的火把。紅纓坐在床邊擦槍。）');
        if (inParty('hongying')) {
          await S.say('baizhi:think', '紅纓。');
          await S.say('hongying:normal', '……幹嘛。');
          S.face('bz_n', 'hy_n');
          await S.say('baizhi:think', '妳頭髮上那條紅色的帶子，很長。');
          await S.say('hongying:normal', '……是我娘的。');
          await S.say('hongying:sad', '她說，紅纓要綁高，人才會抬頭走路。');
          await S.say('baizhi:smile', '我也有紅色的繩子。');
          await S.say('', '（她摸了摸自己髮上的紅繩。）');
          await S.say('baizhi:think', '可是我不記得，是誰幫我綁的。');
          await S.say('hongying:think', '……');
          await S.say('hongying:normal', '那妳就當作，是一個很重要的人綁的。');
          await S.say('baizhi:smile', '……嗯。');
          await S.say('', '（門外傳來星河的聲音。）');
          await S.say('星河（門外）', '喂——明天要早起喔——');
          await S.say('hongying:angry', '知道啦，笨蛋！');
          await S.say('baizhi:smile', '知道啦，笨蛋。');
          await S.say('星河（門外）', '白芷！？');
          await S.say('', '（紅纓噗哧一聲笑出來，趕緊用被子摀住嘴。）');
        }
        await S.fadeOut(dur(1));
        S.remove('bz_n'); S.remove('hy_n');
        S.show('player', true); S.hideFollowers(false);
        S.cameraFollow();
        S.healParty();
        S.flag('ch2_morning');
        S.setPos('player', 8, 9, 'down'); S.gather(); ms.snapCamera();
        ms.lightCfg = G.Mapx.val(ms.def.light);
        S.bgm('pingxi');
        await S.titleCard('', '七月十六');
        await S.fadeIn(dur(0.8));
        S.quest('q_ch2_main', 3);
        S.objective('準備好後，從東北邊的竹林上山');
      } },
      { id: 'kitchen', trigger: 'auto', once: true, if: (st) => !!st.flags.ch2_morning && !st.flags.ch2_done && st.party.includes('hongying') && G.Quests.stage('q_hy_kitchen') < 0, run: async (S) => {
        await S.say('hongying:serious', '月娘。灶腳修好了沒？');
        await S.say('月娘', '……修、修好了。');
        await S.say('hongying:normal', '那今天換我煮。庄裡的人這麼照顧我，我要報答。');
        await S.say('月娘', '……');
        await S.say('xinghe:think', '（小聲）月娘，妳的鍋子……');
        await S.say('月娘', '（小聲）……我再買新的就是了。');
        await S.say('hongying:serious', '我要做「山產炒」。缺三樣：竹筍、溪蝦、山蘇。');
        await S.say('hongying:serious', '你們兩個，幫我找來。');
        await S.say('xinghe:think', '為什麼是我們……');
        await S.say('hongying:angry', '因為你們吃最多！');
        S.quest('q_hy_kitchen', 0);
      } },
    ],
    warps: [{ x: 8, y: 11, to: 'pingxi', tx: 31, ty: 12, tdir: 'down', door: true }],
  });

  // =================================================================================================
  // 1.7 pingxi_tiandeng — 吳家天燈舖
  // =================================================================================================
  G.Maps.define('pingxi_tiandeng', {
    name: '吳家天燈舖', subtitle: '平溪',
    bgm: (st) => (PQ(st) === 1 ? 'night' : 'pingxi'),
    start: [7, 7],
    light: (st) => (PQ(st) === 1 ? { ambient: 0.5, color: '#0a0818', playerR: 200 } : { ambient: 0.1, color: '#1a1008' }),
    tiles: rows(room(14, 10, '_', 'W', [7])),
    objects: [
      { t: 'table', x: 5, y: 4, w: 3, counter: true },
      { t: 'shelf_lanterns', x: 1, y: 2, v: 1 }, { t: 'shelf_lanterns', x: 10, y: 2, v: 2 },
      { t: 'paper_stack', x: 3, y: 2, label: '調查', interact: '很薄的棉紙，對著光看，可以看到裡面的纖維。' },
      { t: 'paper_stack', x: 8, y: 2, label: '調查', interact: '一疊金紙。吳阿公說，天燈底下的燃料，就是沾了油的金紙。' },
      { t: 'jar', x: 12, y: 4, label: '調查', interact: '一甕油。沾金紙用的。' },
      { t: 'lantern_frame', x: 1, y: 5 }, { t: 'lantern_frame', x: 2, y: 6 }, { t: 'lantern_frame', x: 11, y: 6 },
      { t: 'lantern_rack', x: 9, y: 7 }, { t: 'workbench', x: 1, y: 7 }, { t: 'bucket', x: 12, y: 7 },
      { t: 'sky_lantern', x: 3, y: 4, alt: 60, v: 1, text: '平安' }, { t: 'sky_lantern', x: 10, y: 5, alt: 70, v: 0, text: '如意' },
    ],
    npcs: [
      { id: 'wu', sprite: 'old_m', name: '吳阿公', x: 6, y: 3, dir: 'down', fixedDir: true, talk: wuTalk },
    ],
    warps: [{ x: 7, y: 9, to: 'pingxi', tx: 10, ty: 12, tdir: 'down', door: true }],
  });

  // =================================================================================================
  // 1.8 pingxi_oldhouse — 周家
  // =================================================================================================
  G.Maps.define('pingxi_oldhouse', {
    name: '周家', subtitle: '平溪',
    bgm: (st) => (PQ(st) === 1 ? 'night' : 'sad'),
    start: [6, 6],
    light: { ambient: 0.3, color: '#140c06', playerR: 200 },
    tiles: rows(room(12, 9, '_', 'W', [6])),
    objects: [
      { t: 'altar', x: 5, y: 2 }, { t: 'incense_burner', x: 7, y: 2 },
      { t: 'table', x: 4, y: 4 }, { t: 'chair', x: 3, y: 4, dir: 'right' },
      { t: 'chair', x: 9, y: 3, dir: 'down' }, { t: 'cabinet', x: 1, y: 2 }, { t: 'jar', x: 10, y: 6 }, { t: 'basket', x: 1, y: 6, v: 1 }, { t: 'bed_mat', x: 10, y: 2 },
    ],
    npcs: [
      { id: 'zhou_bo_in', sprite: 'old_m', name: '周老伯', x: 9, y: 4, dir: 'down', if: Q(2, 4), talk: zhouInsideTalk },
      { id: 'zhou_shen_in', sprite: 'old_f', name: '周老嬸', x: 5, y: 5, dir: 'down', if: Q(2, 4), talk: zhouInsideTalk },
    ],
    events: [
      { id: 'hat', trigger: 'action', x: 2, y: 1, label: '調查', run: async (S) => { await S.say('', '牆上掛著一頂舊得發黑的斗笠，邊緣都破了。'); } },
    ],
    warps: [{ x: 6, y: 8, to: 'pingxi', tx: 4, ty: 20, tdir: 'down', door: true }],
  });

  // =================================================================================================
  // 1.9 pingxi_store — 阿貴商號
  // =================================================================================================
  async function aguiTalk(S) {
    const q = PQ();
    if (q === 4) {
      await S.say('阿貴', '虎姑婆死了，庄裡又可以安心買東西了！');
      if (F('ch2_bundle_returned') && !F('ch2_agui_letter')) {
        S.flag('ch2_agui_letter');
        await S.say('阿貴', '阿全帶來我阿兄的信……他說去年借我的錢，要我還。');
        await S.say('阿貴', '這封信，寄丟了比較好……');
      }
    } else if (q === 2) {
      await S.say('阿貴', '上山打老虎？要帶什麼？皮甲、香囊、金創藥，攏有！');
      await S.say('阿貴', '青竹絲咬到要趕快吃解毒草，不然腳會腫得像芋頭。');
    } else await S.say('阿貴', '歡迎！今暝庄裡亂糟糟的，要什麼自己看。');
    const c = await S.choice(['雜貨', '武具', '不用了'], { cancel: 2 });
    if (c === 0) await S.shop(STORE_GOODS.filter((i) => G.Data.items[i]), { title: '阿貴商號・雜貨' });
    else if (c === 1) {
      if (!F('ch2_agui_arms')) {
        S.flag('ch2_agui_arms');
        await S.say('阿貴', '那把古劍，是庄裡老礦工家傳的。他孫子拿來寄賣。');
        await S.say('阿貴', '雄黃香囊也帶一個！山裡青竹絲多。');
      }
      await S.shop(['sw_bronze', 'fl_qinglan', 'ar_leather', 'hd_toujin', 'hd_douli', 'ac_xionghuang'], { title: '阿貴商號・武具' });
    }
  }
  const STORE_GOODS = ['caozaiguo', 'jinchuang', 'jiedu', 'xiangbao', 'huanhunxiang', 'bianpao', 'c1_salt', 'c2_longan'];
  G.Maps.define('pingxi_store', {
    name: '阿貴商號', subtitle: '平溪',
    bgm: (st) => (PQ(st) === 1 ? 'night' : 'pingxi'),
    start: [7, 7],
    light: (st) => (PQ(st) === 1 ? { ambient: 0.5, color: '#0a0818', playerR: 200 } : { ambient: 0.1, color: '#1a1008' }),
    tiles: rows(room(14, 10, '_', 'W', [7])),
    objects: [
      { t: 'counter', x: 4, y: 3, w: 6 },
      { t: 'barrel', x: 1, y: 3 }, { t: 'barrel', x: 1, y: 4 }, { t: 'basket', x: 2, y: 6, v: 0 }, { t: 'basket', x: 1, y: 7, v: 3 }, { t: 'jar', x: 3, y: 7 },
      { t: 'jar_row', x: 1, y: 2 }, { t: 'herbs_rack', x: 3, y: 2 },
      { t: 'weapon_rack', x: 10, y: 2 }, { t: 'cabinet', x: 12, y: 2 }, { t: 'weapon_rack', x: 11, y: 5 },
      { t: 'crate', x: 12, y: 7 }, { t: 'crate', x: 11, y: 7 },
    ],
    npcs: [{ id: 'agui', sprite: 'merchant', name: '阿貴', x: 7, y: 2, dir: 'down', talk: aguiTalk }],
    warps: [{ x: 7, y: 9, to: 'pingxi', tx: 37, ty: 12, tdir: 'down', door: true }],
  });

  // =================================================================================================
  // 1.10 tiger_lair — 虎姑婆的竹林
  // =================================================================================================
  const TLR = (() => {
    const W = 40, H = 40;
    const R = forest(W, H, (open, keep) => {
      keep(23, 0, 5, 4, 'C');
      open(24, 1, 3, 3, 'v');
      open(18, 4, 12, 8, ':');
      open(22, 12, 2, 2, '=');
      open(12, 14, 13, 1, '=');
      open(15, 15, 8, 1, '=');
      open(9, 15, 6, 5, ',');
      open(12, 20, 2, 4, '=');
      open(12, 24, 20, 2, '=');
      open(12, 26, 2, 4, '=');
      open(30, 26, 2, 6, '=');
      open(0, 30, 14, 2, '=');
      open(4, 32, 2, 6, '=');
      open(27, 32, 8, 5, ',');
    }, 91, 'BBBBcB', 'uBu');
    sprinkle(R, 'g', 0.06, 93, ',');
    for (const [x, y, c] of [[9, 15, 's'], [14, 18, 'u'], [28, 33, 'u'], [34, 36, 's'], [19, 11, 'u'], [29, 4, 'u']]) R.d[y][x] = c;
    clearDeco(R, 24, 4, 3, 1);
    return R;
  })();
  const PAWS = [[3, 30, 'right'], [6, 31, 'right'], [9, 30, 'right'], [12, 29, 'up'], [13, 27, 'up'], [12, 25, 'up'], [13, 22, 'up'], [12, 20, 'up'], [16, 14, 'right'], [20, 15, 'right'], [22, 13, 'up'], [23, 12, 'up']];
  async function alan212(S) { // 2-12 & 5.5
    const ms = MS();
    await S.say('', '（大樟樹下。地上有一圈被踩亂的竹葉和一隻小布鞋。）');
    await S.say('?', '不准過來！');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '樹上有人！');
    await S.camera(11, 15, dur(0.8));
    await S.say('', '（大樟樹的高處，一個十歲左右的女孩緊緊抱著樹幹，手上抓著一把毬果。）');
    await S.say('阿蘭', '你們是不是虎姑婆變的！');
    await S.say('xinghe:normal', '不是啦！我們是來救你們的！');
    await S.say('阿蘭', '虎姑婆也是這樣講的！');
    if (inParty('hongying')) await S.say('hongying:think', '……很有道理。');
    await S.say('xinghe:angry', '妳站哪邊的啊！');
    await S.say('阿蘭', '我要考你們！答錯了，就是虎姑婆！');
    let wrong = 0;
    const miss = async () => {
      wrong++;
      S.sfx('hit'); S.shake(3, 0.2); S.emote('player', '💢');
      await S.say('', '（啪！一顆毬果打在星河頭上。）');
      const m = G.state.members.xinghe; if (m) m.hp = Math.max(1, m.hp - 1);
      await S.say('xinghe:hurt', '好痛！');
      await S.say('阿蘭', '錯了！重來！');
      if (wrong === 3 && inParty('hongying')) await S.say('hongying:think', '……笨蛋，你是故意的吧。');
    };
    // 第一題
    await S.say('阿蘭', '伸手出來！虎姑婆的手有毛！');
    const who = ['星河伸手'].concat(inParty('hongying') ? ['紅纓伸手'] : [], inParty('baizhi') ? ['白芷伸手'] : []);
    const c1 = who[await S.choice(who)];
    if (c1 === '星河伸手') { await S.say('阿蘭', '……手好髒。可是沒有毛。'); await S.say('xinghe:sad', '剛剛挖過竹筍啦……'); }
    else if (c1 === '紅纓伸手') { await S.say('阿蘭', '好多繭……像我阿爸砍柴的手。'); await S.say('hongying:smug', '練槍練的。'); }
    else await S.say('阿蘭', '好白、好冰……虎姑婆的手是熱的。好，沒有毛。');
    // 第二題
    for (let tries = 0; ; tries++) {
      await S.say('阿蘭', '阿嬤的故事裡，姊姊最後是怎麼打敗虎姑婆的？');
      const opts = ['用熱油', '用劍'].concat(inParty('baizhi') ? ['用芋圓（白芷回答）'] : []);
      const c = await S.choice(opts);
      if (c === 0) { await S.say('阿蘭', '對！你們聽過阿嬤的故事！虎姑婆不會聽故事！'); break; }
      if (c === 2) {
        await S.say('阿蘭', '……芋圓？');
        await S.say('baizhi:smile', '芋圓很好吃。老虎吃了，會變好。');
        await S.say('阿蘭', '哈哈……虎姑婆才不會講這麼笨的話！');
        break;
      }
      await miss();
      if (tries >= 3) break;
    }
    // 第三題
    for (let tries = 0; ; tries++) {
      await S.say('阿蘭', '最後一題！你們要帶我去哪裡？');
      const c = await S.choice(['回家', '去姑婆家', '去吃好吃的']);
      if (c === 0 || tries >= 3) break;
      if (c === 2) await S.say('阿蘭', '虎姑婆也說要帶我去吃好吃的！');
      await miss();
    }
    // 通過
    const a = S.actor('alan_tree');
    if (a) { await G.Tweens.to(a, { offsetY: 0 }, dur(0.6), 'inQuad'); a.setCell(11, 17); a.dir = 'down'; }
    await S.say('', '（阿蘭從樹上滑下來，腳一軟，坐在地上，哇地哭了出來。）');
    await S.say('阿蘭', '我、我好怕……我在樹上待了兩天……');
    if (inParty('baizhi')) {
      await S.say('', '（白芷蹲下來，把她抱進懷裡。）');
      await S.say('baizhi:smile', '已經不用怕了。');
      await S.say('阿蘭', '姊姊……妳的手好冰喔……');
      await S.say('baizhi:think', '……對不起。');
      await S.say('阿蘭', '……可是好舒服。');
    }
    if (inParty('hongying')) await S.say('hongying:serious', '其他孩子呢？');
    await S.say('阿蘭', '上面有一間老厝。裡面有一個阿婆，她……她就是虎姑婆。');
    await S.say('阿蘭', '半夜她在吃東西，咔滋咔滋。我問她吃什麼，她說是花生。');
    await S.say('阿蘭', '我就想到阿嬤講的故事。我說我要去尿尿，就跑出來，爬到樹上。');
    await S.say('xinghe:surprise', '……跟故事裡一模一樣。');
    await S.say('阿蘭', '可是阿弟仔還在裡面！小春跟石頭也是！');
    await S.say('阿蘭', '厝的後面有一個山洞。她把大家關在那裡。');
    await S.say('阿蘭', '還有……灶腳有一大鍋油，一直在燒。');
    if (inParty('hongying')) {
      await S.say('hongying:serious', '……妳在這裡等著。我們去把他們帶回來。');
      await S.say('阿蘭', '我也要去！阿弟仔是我弟弟！');
      await S.say('hongying:angry', '不行！');
      await S.say('阿蘭', '……');
    }
    await S.say('xinghe:normal', '阿蘭，妳在這裡幫我們看著退路。很重要的任務。');
    await S.say('阿蘭', '……好。');
    S.face('alan_tree', 'up');
    await S.say('', '（阿蘭的眼睛，悄悄地瞄向山坡上的老厝。）');
    S.cameraFollow();
    S.flag('ch2_alan_trust');
    S.remove('alan_tree');
    S.refresh();
    S.objective('前往山坡上的老厝');
    void ms;
  }
  G.Maps.define('tiger_lair', {
    name: '虎姑婆的竹林', subtitle: (st) => (st.flags.ch2_tiger_beaten ? '風吹過竹林' : '竹林遮天'),
    place: 'pingxi',
    bgm: 'forest',
    start: [2, 30],
    light: { ambient: 0.3, color: '#0a2010' },
    particles: ['leaves', { type: 'mist', density: 0.6 }],
    tiles: rows(TLR.g), deco: rows(TLR.d),
    objects: [
      { t: 'house_minnan', x: 22, y: 5, v: 1, lit: false },
      { t: 'well', x: 20, y: 9, label: '調查', interact: '一口老井。井繩斷了，桶子掉在井底。' },
      { t: 'laundry', x: 26, y: 9 }, { t: 'jar', x: 19, y: 6 }, { t: 'basket', x: 28, y: 6, v: 1 }, { t: 'stump', x: 28, y: 10 },
      ...[[24, 3], [25, 3], [26, 3]].map(([x, y]) => ({ t: 'bamboo', x, y, if: (st) => !st.flags.ch2_granny_house })),
      ...PAWS.map(([x, y, dir]) => ({ t: 'c2_footprint', x, y, dir, kind: 'tiger', label: '調查', interact: '好大的腳印……比人的手掌還大。' })),
      { t: 'c2_footprint', x: 13, y: 24, kind: 'shoe', label: '調查', if: (st) => !st.flags.ch2_tiger_beaten, interact: async (S) => {
        await S.say('', '一隻小孩的布鞋，鞋面繡著一朵小花。');
        await S.say('xinghe:serious', '……是被拖過去的。');
      } },
      { t: 'tree_camphor', x: 11, y: 16, z: -16, label: '調查', interact: '一棵很高的大樟樹。樹皮上有小小的鞋印，一路往上。' },
      saveStone(8, 31, '竹林入口的石燈籠。竹葉沙沙作響。'),
      { t: 'rock_big', x: 32, y: 34 }, { t: 'log', x: 28, y: 35 },
    ],
    chests: [
      { id: 'c2_l1', x: 33, y: 33, item: 'xiangbao', n: 2 },
      { id: 'c2_l2', x: 4, y: 37, gold: 300 },
    ],
    npcs: [
      { id: 'alan_tree', sprite: spr('c2_alan', 'child_f'), name: '阿蘭', x: 11, y: 16, dir: 'down', offsetY: -64, fixedDir: true, if: (st) => !st.flags.ch2_alan_trust,
        talk: async (S) => { await S.say('阿蘭', '不准過來！'); } },
      { id: 'alan_wait', sprite: spr('c2_alan', 'child_f'), name: '阿蘭', x: 10, y: 18, dir: 'up', if: (st) => !!st.flags.ch2_alan_trust && !st.flags.ch2_granny_house,
        talk: ['我在這裡看著退路！……很重要的任務。', '（她的眼睛，一直瞄著山坡上的老厝。）'] },
    ],
    enemies: [
      foe('tl1', 'forest_3', 6, 30, 'bamboo_spirit', 6),
      foe('tl2', 'pingxi_2', 12, 22, 'macaque_demon', 8),
      foe('tl3', 'lair_2', 18, 14, 'macaque_demon', 7),
      foe('tl4', 'forest_3', 20, 24, 'bamboo_viper', 6),
      foe('tl5', 'pingxi_2', 30, 28, 'bamboo_spirit', 8),
      foe('tl6', 'pingxi_1', 19, 10, 'boar_demon', 8),
    ],
    events: [
      { id: 'alan', trigger: 'touch', x: 9, y: 19, w: 6, h: 1, once: true, run: alan212 },
      { id: 'shoot', trigger: 'action', x: 31, y: 35, label: '採集', run: shootSpot },
    ],
    warps: [
      { x: 0, y: 30, h: 2, to: 'pingxi', tx: 46, ty: 12, tdir: 'left' },
      { x: 24, y: 7, to: 'tiger_house', tx: 6, ty: 8, tdir: 'up', door: true, run: async (S) => {
        if (!F('ch2_alan_trust')) { await S.say('', '門從裡面閂住了。屋裡傳來「咔滋、咔滋」的聲音。'); await S.move('player', 'D'); return false; }
        return true;
      } },
      { x: 24, y: 1, w: 3, to: 'tiger_den', tx: 15, ty: 30, tdir: 'up', if: (st) => !!st.flags.ch2_granny_house },
    ],
    onUpdate: (dt, ms) => {
      forestTick(dt, ms);
      const near = ms.player.y <= 12;
      if (ms._near !== near) {
        ms._near = near;
        ms.lightCfg = Object.assign({}, ms.lightCfg, { ambient: near ? 0.45 : 0.3, color: near ? '#1a1410' : '#0a2010' });
        if (!G.Script.busy() && !F('ch2_tiger_beaten')) G.Music.play(near ? 'tension' : 'forest');
      }
    },
  });

  // =================================================================================================
  // 1.11 tiger_house — 山中老厝（內）
  // =================================================================================================
  async function granny213(S) {
    await S.wait(dur(0.6));
    await S.say('', '（昏暗的老厝。灶裡燒著火，大鍋裡的油冒著煙。一個瘦小的老婦人背對門口坐著，膝上蓋著花布，正「咔滋、咔滋」地嚼著什麼。）');
    await S.say('老婦人', '……唉喲，有人客。');
    await S.say('老婦人', '來，乖孫，進來坐。外口冷。');
    await S.say('xinghe:think', '阿……阿婆，妳一個人住在山裡？');
    await S.say('老婦人', '是啊。姑婆一個人，好寂寞喔。');
    await S.say('老婦人', '你們要不要吃花生？咔滋咔滋，很香喔。');
    if (inParty('baizhi')) {
      await S.say('baizhi:think', '……好啊。');
      if (inParty('hongying')) await S.say('hongying:surprise', '喂！');
      await S.say('', '（白芷接過一顆「花生」，放進嘴裡。）');
      await S.say('baizhi:think', '……');
      await S.say('baizhi:think', '這個花生，是石頭。');
    }
    await S.say('老婦人', '……');
    S.face('granny', 'down');
    await S.say('', '（老婦人慢慢轉過頭。皺紋深處的眼睛，是兩點黃色的光。）');
    await S.say('老婦人', '……真是沒禮貌的孩子。');
    const opts = ['阿婆，妳的手好多毛。', '阿婆，妳的眼睛好大。'];
    if (vis()) opts.push('阿婆，妳裙子下面……有尾巴。');
    const c = await S.choice(opts);
    if (c === 0) {
      await S.say('老婦人', '……那是因為姑婆老了，怕冷。');
      if (inParty('hongying')) await S.say('hongying:serious', '那牙齒呢？怎麼那麼尖？');
      await S.say('老婦人', '……那是為了……');
    } else if (c === 1) await S.say('老婦人', '……那是為了，看清楚你們呀，乖孫。');
    else await S.say('老婦人', '……！');
    S.sfx('hit'); S.shake(3, 0.2);
    await S.say('', '（花布底下，一條粗大的、黃黑相間的尾巴，「啪」地甩在地上。）');
    S.sfx('dark');
    await pet(S, 'yuyuan', '💧', '（芋圓一溜煙躲到星河背後，只露出一雙眼睛。）');
    await S.say('虎姑婆', '嘻嘻嘻嘻……被看到了。');
    await S.say('虎姑婆', '今暝吃不到乖孫……那就——先吃最小的那個！');
    S.sfx('crit'); S.shake(6, 0.4);
    await S.move('granny', 'RRRUU', { speed: 7 });
    S.sfx('shatter');
    S.flag('ch2_granny_house');
    S.remove('granny');
    S.refresh();
    await S.say('', '（虎姑婆一腳踢翻桌子，撞破後門，消失在竹林裡。）');
    if (inParty('hongying')) await S.say('hongying:angry', '別想逃！');
    S.quest('q_ch2_main', 4);
    S.objective('追進虎姑婆的洞窟');
  }
  G.Maps.define('tiger_house', {
    name: '山中老厝', subtitle: '竹林頂上的荒屋',
    bgm: (st) => (st.flags.ch2_granny_house ? 'tension' : null),
    start: [6, 8],
    light: { ambient: 0.6, color: '#0c0604', playerR: 150 },
    tiles: rows(room(14, 10, '_', 'W', [6])),
    objects: [
      { t: 'stove', x: 2, y: 2 },
      { t: 'pot', x: 4, y: 2, label: '調查', interact: '一大鍋熱油，還在冒煙。' },
      { t: 'door_frame', x: 12, y: 1 },
      { t: 'table', x: 8, y: 4, if: (st) => !st.flags.ch2_granny_house },
      { t: 'crate', x: 11, y: 2, if: (st) => !!st.flags.ch2_granny_house }, { t: 'table', x: 10, y: 5, if: (st) => !!st.flags.ch2_granny_house },
      { t: 'basket', x: 1, y: 7, v: 3, label: '調查', interact: '角落堆著一堆小鞋子。大的、小的，左腳的、右腳的。' },
      { t: 'cabinet', x: 1, y: 2 }, { t: 'jar', x: 12, y: 7 }, { t: 'chair', x: 7, y: 3, dir: 'down' }, { t: 'bed_mat', x: 10, y: 2 },
    ],
    npcs: [
      { id: 'granny', sprite: spr('c2_granny', 'old_f'), name: '老婦人', x: 6, y: 3, dir: 'up', fixedDir: true, if: (st) => !st.flags.ch2_granny_house,
        talk: async (S) => { await S.say('老婦人', '咔滋……咔滋……'); } },
    ],
    events: [
      { id: 'granny', trigger: 'auto', if: (st) => !!st.flags.ch2_alan_trust && !st.flags.ch2_granny_house, run: granny213 },
    ],
    warps: [{ x: 6, y: 9, to: 'tiger_lair', tx: 24, ty: 8, tdir: 'down', door: true }],
    onUpdate: (dt, ms) => { // the crunching in the dark
      if (F('ch2_granny_house')) return;
      ms._crunch = (ms._crunch || 0) - dt;
      if (ms._crunch <= 0) { ms._crunch = 1.6 + Math.random() * 1.2; G.Audio.sfx('step'); G.Audio.sfx('step', 0.18); }
    },
  });

  // =================================================================================================
  // 1.12 tiger_den — 虎姑婆的洞窟
  // =================================================================================================
  const DEN = [
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    'CCCCCCCCCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCCCCCCCCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCvvvvvvCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCvvvvvvCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCvvvvvvCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCvvvvvvCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCCCCvvCCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCCCCvvCCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCCCCvvCCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCCCCvvCCCvvvvvvvvvvvvvCCCCCCCCC',
    'CCCCCvvCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCvvCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCvvCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCvvvvvvCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCvvvvvvCCCCCCvvvvCCCCvvvvvvvvCC',
    'CCvvvvvvvvvvvvvvvvCCCCvvvvvvvvCC',
    'CCvvvvvvvvvvvvvvvvCCCCvvvvvvvvCC',
    'CCvvvvvvvvvvvvvvvvvvvvvvvvvvvvCC',
    'CCvvvvvvCCCCCCvvvvvvvvvvvvvvvvCC',
    'CCvvvvvvCCCCCCvvvvCCCCvvvvvvvvCC',
    'CCvvvvvvCCCCCCvvvvCCCCvvvvvvvvCC',
    'CCvvvvvvCCCCCCvvvvCCCCvvvvvvvvCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
    'CCCCCCCCCCCCCCvvvvCCCCCCCCCCCCCC',
  ];
  const bothCages = (st) => !!(st.flags.ch2_cage1 && st.flags.ch2_cage2);
  async function cageOpened(S) {
    if (!bothCages(G.state)) return;
    S.sfx('door'); S.shake(3, 0.4);
    S.refresh();
    await S.say('', '（洞窟深處傳來「喀啦」一聲。頭目間前的竹柵門，被一陣腥風吹開了。）');
    await S.say('虎姑婆', '嘻嘻嘻……來吧，乖孫……姑婆等你們好久了……');
    S.objective('救出阿弟仔');
  }
  async function cage1(S) {
    if (F('ch2_cage1')) return;
    await S.say('', '（竹籠裡，一個小女孩縮成一團。）');
    await S.say('小春', '……不要吃我……');
    if (inParty('baizhi')) await S.say('baizhi:smile', '我們不吃人。我們來帶妳回家。');
    S.sfx('slash');
    await S.say('', inParty('hongying') ? '（紅纓一槍挑斷綁住籠門的藤條。）' : '（星河一劍挑斷綁住籠門的藤條。）');
    S.flag('ch2_cage1');
    await S.say('小春', '……阿嬤……我要阿嬤……');
    await S.say(inParty('hongying') ? 'hongying:normal' : 'xinghe:normal', '沿著來的路往外走，阿蘭在外面的大樹下等。');
    await S.say('小春', '……嗯。');
    const a = S.actor('kid_chun');
    if (a) { a.through = true; await S.move('kid_chun', 'DRRRRRRRRR', { speed: 5 }); await S.fadeActor('kid_chun', 0, dur(0.3)); }
    S.remove('kid_chun');
    await cageOpened(S);
  }
  async function cage2(S) {
    if (F('ch2_cage2')) return;
    await S.say('', '（竹籠裡，一個男孩用手背猛擦眼睛。）');
    await S.say('石頭', '我、我沒有哭！');
    await S.say('xinghe:smile', '好，你沒有哭。');
    S.sfx('slash');
    await S.say('', inParty('hongying') ? '（紅纓挑斷藤條。）' : '（星河挑斷藤條。）');
    S.flag('ch2_cage2');
    await S.say('石頭', '阿弟仔被帶到最裡面了！虎姑婆說……要先吃他的手指頭……');
    if (inParty('hongying')) await S.say('hongying:angry', '……！');
    await S.say('石頭', '快去救他！');
    const a = S.actor('kid_shitou');
    if (a) { a.through = true; await S.move('kid_shitou', 'DLLLLLLLLL', { speed: 5 }); await S.fadeActor('kid_shitou', 0, dur(0.3)); }
    S.remove('kid_shitou');
    await cageOpened(S);
  }
  async function oilTurn(b) {
    const tg = b.enemies.find((e) => e.id === 'tiger_granny' && !e.dead);
    if (!tg || b.c2oil || tg.hp >= tg.mhp * 0.45) return;
    b.c2oil = true;
    await b.say2('阿蘭', '虎姑婆——！嘴巴張開！我丟雀仔給妳吃！');
    await b.say2('虎姑婆', '……雀仔？');
    b.say('虎姑婆忍不住張大了嘴——', 1.2);
    await b.wait(0.8);
    G.Audio.sfx('fire');
    b.shakeT = 0.7;
    G.Render.doFlash('#ffb050', 0.5, 0.6);
    await b.playFx('fire_big', b.party[0], [tg], { elem: 'fire' });
    b.damage(tg, Math.max(1, Math.min(tg.hp - 1, Math.round(tg.mhp * 0.09))), { elem: 'fire', weak: true, color: '#ffb050' });
    b.addStatus(tg, 'defDown', 3);
    b.addStatus(tg, 'stun', 1);
    await b.wait(0.7);
    await b.say2('阿蘭', '阿嬤的故事裡，就是這樣打虎姑婆的！');
    if (b.party.some((p) => p.id === 'hongying')) await b.say2('hongying:surprise', '……那孩子是怎麼把一整鍋油搬上來的！');
    await b.say2('xinghe:laugh', '別管了，上！');
  }
  async function boss215(S) {
    await S.camera(16, 5, dur(0.8));
    await S.say('', '（頭目間。正中央，虎姑婆仍是老婦人的模樣，坐在一張竹椅上。她身後的竹籠裡，一個五、六歲的小男孩哭得滿臉鼻涕。）');
    await S.say('阿弟仔', '阿姊……阿姊……');
    await S.say('虎姑婆', '乖孫，莫哭。姑婆只吃一根手指頭就好——');
    await S.say('虎姑婆', '咔滋、咔滋……');
    if (inParty('hongying')) await S.say('hongying:angry', '住手！');
    else await S.say('xinghe:angry', '住手！');
    S.face('tiger_npc', 'down');
    await S.say('虎姑婆', '嘻嘻……又是你們。');
    await S.say('虎姑婆', '你們知道嗎？這座山……越來越吵了。');
    await S.say('虎姑婆', '海那邊的光，越來越冷。死掉的東西，攏擠在山裡。');
    await S.say('虎姑婆', '姑婆好餓……好餓好餓好餓……');
    if (inParty('baizhi')) await S.say('baizhi:sad', '……妳也是，迷路了嗎？');
    await S.say('虎姑婆', '……');
    await S.say('虎姑婆', '閉嘴！');
    S.sfx('dark'); S.shake(6, 0.6);
    await S.say('', '（虎姑婆站起來。佝僂的身體一節一節拉長，花布衫撐破了。）');
    await S.say('xinghe:serious', inParty('hongying') ? '白芷、紅纓——上！' : '白芷——上！');
    S.cameraFollow();
    await S.battle('t_c2_tiger', { onTurn: oilTurn });
    S.remove('tiger_npc');
    await S.say('', '（虎姑婆倒在地上。她的身體一點一點縮小，變回一隻瘦得只剩皮包骨的老虎。）');
    await S.say('虎姑婆', '……好冷……');
    await S.say('虎姑婆', '以前……山裡很安靜……');
    await S.say('虎姑婆', '我只是……好餓……');
    S.sfx('wind');
    await S.say('', '（老虎的眼睛慢慢閉上。牠的身體化作一陣腥風，散進洞窟的黑暗裡。原地留下一枚發黃的虎爪。）');
    if (!S.hasItem('ac_huzhao')) await S.give('ac_huzhao', 1);
    if (inParty('baizhi')) await S.say('baizhi:sad', '……');
    if (inParty('hongying')) await S.say('hongying:serious', '……可憐，也不能吃小孩。');
    if (inParty('baizhi')) await S.say('baizhi:sad', '嗯。……可是，還是可憐。');
    S.flag('ch2_cage3');
    S.sfx('slash');
    const adi = S.actor('kid_adi');
    if (adi) { adi.through = true; await S.move('kid_adi', 'DDD'); }
    await S.say('', '（紅纓挑開最後一個竹籠。阿弟仔撲進最近的人懷裡——是紅纓。）');
    await S.say('阿弟仔', '嗚哇——！');
    if (inParty('hongying')) {
      await S.say('hongying:surprise', '欸、欸！不要哭！不要擦鼻涕在我身上！');
      await S.say('hongying:shy', '……好啦，好啦。不怕了。');
      await S.say('', '（紅纓僵硬地拍著阿弟仔的背。星河和白芷相視一笑。）');
    }
    S.spawn({ id: 'alan_den', sprite: spr('c2_alan', 'child_f'), name: '阿蘭', x: 16, y: 13, dir: 'up', through: true });
    await S.say('阿蘭', '阿弟仔——！');
    await S.move('alan_den', 'UUU', { speed: 5 });
    await S.say('', '（阿蘭衝進來，抱住弟弟。兩姊弟哭成一團。）');
    await S.say('xinghe:smile', '……好。回家吧。');
    S.flag('ch2_tiger_beaten');
    S.quest('q_ch2_main', 5);
    S.objective('帶孩子們回平溪');
    await S.fadeOut(dur(1));
    S.remove('alan_den'); S.remove('kid_adi');
    await S.warp('pingxi', 23, 12, 'down', { fade: 0, stayDark: true });
  }
  TR.t_c2_tiger = Object.assign({}, G.Data.troops.boss_tiger || { enemies: ['tiger_granny'], bgm: 'boss', boss: true, flee: false }, { bg: 'mine' });

  G.Maps.define('tiger_den', {
    name: '虎姑婆的洞窟', subtitle: '山腹裡的巢',
    bgm: (st) => (st.flags.ch2_tiger_beaten ? 'mine' : 'mine'),
    start: [15, 30],
    light: { ambient: 0.78, color: '#06040a', playerR: 260, playerColor: '#ffc890' },
    particles: ['motes', { type: 'mist', density: 0.5 }],
    tiles: DEN,
    objects: [
      { t: 'brazier', x: 14, y: 24 }, { t: 'brazier', x: 17, y: 24 }, { t: 'brazier', x: 14, y: 29 }, { t: 'brazier', x: 17, y: 29 },
      { t: 'brazier', x: 11, y: 2 }, { t: 'brazier', x: 21, y: 2 }, { t: 'brazier', x: 11, y: 9 }, { t: 'brazier', x: 21, y: 9 }, { t: 'brazier', x: 2, y: 3 }, { t: 'brazier', x: 3, y: 15 }, { t: 'brazier', x: 28, y: 16 },
      saveStone(16, 27, '洞裡的石燈籠——不知道是誰放的，火還亮著。'),
      // the porter's room
      { t: 'basket', x: 3, y: 4, v: 2, label: '調查', if: (st) => !st.flags.ch2_bundle_taken, interact: async (S) => { await bundle(S); } },
      { t: 'crate', x: 2, y: 3 }, { t: 'bones', x: 6, y: 6 }, { t: 'basket', x: 7, y: 3, v: 1 },
      // stolen goods (chicken & pig bones only)
      { t: 'crate', x: 2, y: 21 }, { t: 'crate', x: 3, y: 22 }, { t: 'basket', x: 7, y: 15, v: 0 }, { t: 'bones', x: 6, y: 21 }, { t: 'jar', x: 7, y: 22 },
      { t: 'bones', x: 12, y: 8 }, { t: 'basket', x: 21, y: 9, v: 3 }, { t: 'crate', x: 10, y: 9 }, { t: 'jar', x: 22, y: 7 }, { t: 'bones', x: 19, y: 3 },
      { t: 'crate', x: 29, y: 15 }, { t: 'barrel', x: 22, y: 22 }, { t: 'bones', x: 24, y: 17 },
      // cages
      { t: 'c2_cage', x: 4, y: 19, flag: 'ch2_cage1' }, { t: 'c2_cage', x: 27, y: 18, flag: 'ch2_cage2' }, { t: 'c2_cage', x: 16, y: 2, flag: 'ch2_cage3' },
      // the bamboo gate before the boss room
      { t: 'fence_bamboo', x: 14, y: 11, w: 4, if: (st) => !bothCages(st), label: '調查', interact: '竹子紮成的柵門，綁得死緊。深處傳來小孩的哭聲。' },
      { t: 'vine_curtain', x: 14, y: 10, if: (st) => !bothCages(st) }, { t: 'vine_curtain', x: 17, y: 10, if: (st) => !bothCages(st) },
      // the breathing wall (illusion)
      ...[[18, 18], [20, 18]].map(([x, y]) => ({ t: 'rock_big', x, y, illusion: true, label: '調查', interact: async (S) => {
        await S.say('', '岩壁。……可是摸起來，有一點溫溫的，好像在呼吸。');
        if (!F('ch2_wall_hint')) {
          S.flag('ch2_wall_hint');
          if (inParty('baizhi')) await S.say('baizhi:think', '這面牆在呼吸。牆，應該不會呼吸吧？');
          await S.say('xinghe:think', '……是魔神仔那種把戲。用靈視看看！');
        }
      } })),
    ],
    chests: [
      { id: 'c2_d1', x: 6, y: 4, item: 'jinchuang', n: 2 },
      { id: 'c2_d2', x: 28, y: 21, item: 'ar_leather', run: async (S) => { await S.give('huanhunxiang', 1); } },
    ],
    npcs: [
      { id: 'kid_chun', sprite: 'child_f', name: '小春', x: 4, y: 19, dir: 'down', if: (st) => !st.flags.ch2_cage1, talk: async (S) => { await cage1(S); } },
      { id: 'kid_shitou', sprite: 'child_m', name: '石頭', x: 27, y: 18, dir: 'down', if: (st) => !st.flags.ch2_cage2, talk: async (S) => { await cage2(S); } },
      { id: 'kid_adi', sprite: 'child_m', name: '阿弟仔', x: 16, y: 2, dir: 'down', if: (st) => !st.flags.ch2_tiger_beaten, talk: ['阿姊……阿姊……'] },
      { id: 'tiger_npc', sprite: spr('c2_granny', 'old_f'), name: '虎姑婆', x: 16, y: 6, dir: 'up', fixedDir: true, if: (st) => !st.flags.ch2_tiger_beaten && bothCages(st),
        talk: async (S) => { await S.say('虎姑婆', '嘻嘻嘻……乖孫，過來……'); } },
    ],
    enemies: [
      foe('td1', 'lair_1', 15, 20, 'boar_demon', 8),
      foe('td2', 'lair_4', 5, 20, 'mosina', 7),
      foe('td3', 'lair_3', 25, 20, 'macaque_demon', 8),
      foe('td4', 'lair_4', 5, 9, 'mosina', 7),
      foe('td5', 'lair_1', 15, 14, 'boar_demon', 8),
    ],
    events: [
      { id: 'enter', trigger: 'auto', once: true, run: async (S) => { // 2-14
        await S.say('', '（洞窟。腥臭的風。岩壁上掛著幾盞油燈，照出一堆堆搶來的東西：雞籠、鍋子、小鞋子。）');
        S.sfx('ghost');
        await S.say('', '（深處，傳來小孩的哭聲。）');
        if (inParty('hongying')) await S.say('hongying:serious', '……分頭找。不對，不能分頭。一起走。');
        await S.say('xinghe:serious', '聲音從兩邊都有。');
      } },
      { id: 'cage1', trigger: 'action', x: 4, y: 19, label: '打開竹籠', if: (st) => !st.flags.ch2_cage1, run: cage1 },
      { id: 'cage2', trigger: 'action', x: 27, y: 18, label: '打開竹籠', if: (st) => !st.flags.ch2_cage2, run: cage2 },
      { id: 'boss', trigger: 'touch', x: 14, y: 10, w: 4, h: 1, once: true, if: (st) => bothCages(st) && !st.flags.ch2_tiger_beaten, run: boss215 },
    ],
    warps: [{ x: 14, y: 31, w: 4, to: 'tiger_lair', tx: 25, ty: 2, tdir: 'down' }],
    onUpdate: (dt, ms) => forestTick(dt, ms),
  });
  async function bundle(S) { // 4.2 step 2
    await S.say('', '一副挑夫的擔子。扁擔斷了，兩個竹簍裡塞滿布包、藥材，和一疊用油紙包好的信。');
    await S.say('', '（星河翻了翻。其中一封，信封上寫著歪歪斜斜的字：「平溪　周家　阿爸阿母　親啟」。）');
    await S.say('xinghe:surprise', '……這是周阿伯家的信！');
    S.flag('ch2_bundle_taken');
    await S.give('key_sonletter', 1);
    await S.give('c2_porter_bundle', 1);
    S.quest('q_letter', 1);
  }

  // =================================================================================================
  // 1.13 shifen_falls — 十分瀑布 (2-18, 2-19)
  // =================================================================================================
  const SF = (() => {
    const W = 32, H = 28;
    const g = grid(W, H, '.');
    const d = grid(W, H, ' ');
    fill(g, 0, 0, W, 3, 'X');
    fill(g, 9, 3, 14, 7, 'l');
    fill(g, 14, 10, 4, 12, 'r');
    fill(g, 14, 18, 18, 4, 'r');
    fill(g, 0, 13, 24, 2, '=');
    fill(g, 14, 13, 4, 2, 'b');
    fill(g, 23, 15, 2, 3, '=');
    fill(g, 24, 18, 4, 4, 'k');
    fill(g, 23, 22, 6, 1, 'k');
    fill(g, 0, 23, W, 5, ',');
    for (const [x, y, c] of [[1, 4, 't'], [3, 3, 'c'], [6, 3, 'f'], [1, 8, 'u'], [3, 10, 'c'], [6, 9, 'w'], [25, 3, 'c'], [28, 4, 't'], [30, 3, 'f'], [26, 8, 'u'], [29, 10, 'c'],
      [24, 11, 'w'], [9, 11, 'e'], [13, 9, 'e'], [19, 11, 'e'], [2, 16, 'c'], [6, 17, 'u'], [10, 16, 'n'], [4, 20, 't'], [9, 21, 'c'], [12, 19, 'e'], [20, 16, 'u'],
      [28, 15, 'c'], [30, 13, 't'], [26, 13, 'u'], [1, 24, 't'], [5, 25, 'c'], [9, 24, 'u'], [13, 25, 't'], [17, 24, 'c'], [21, 26, 'u'], [25, 24, 'c'], [29, 25, 't'],
      [3, 26, 'c'], [11, 27, 't'], [19, 27, 'c'], [27, 27, 't'], [31, 23, 'u'], [0, 11, 'u'], [8, 18, 'w'], [3, 13, ' ']]) d[y][x] = c;
    return { g, d };
  })();
  function drawRainbow(ctx, t) {
    const cx = 15.8 * T, cy = 9.4 * T, R = 5.3 * T;
    const k = 0.75 + 0.25 * Math.sin(t * 0.7);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const cols = ['#ff4a4a', '#ff9a3a', '#ffe85a', '#5aff7a', '#4ab8ff', '#5a5aff', '#c05aff'];
    cols.forEach((c, i) => {
      ctx.strokeStyle = U.rgba(c, 0.16 * k);
      ctx.lineWidth = 12;
      ctx.beginPath(); ctx.arc(cx, cy, R - i * 11, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    });
    // spray at the foot of the falls
    for (let i = 0; i < 18; i++) {
      const x = (11 + (i * 0.56) % 10) * T + Math.sin(t * 1.3 + i) * 20, y = 3.3 * T + Math.sin(t * 2 + i * 1.7) * 14;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 70);
      gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(x - 70, y - 70, 140, 140);
    }
    ctx.restore();
  }
  async function falls218(S) {
    const ms = MS();
    S.sfx('water');
    await S.camera(15, 5, dur(1.4));
    await S.say('', '（十分瀑布。風颱過後，水比平常大了一倍。整條溪水在這裡往下一跳，摔成一片白色的簾子。轟隆隆的水聲。水霧裡，掛著一道彩虹。）');
    S.cameraFollow();
    await S.say('xinghe:surprise', '哇……好大！');
    if (inParty('hongying')) {
      await S.say('hongying:smug', '……水聲這麼大，連你的聲音都聽不到。很好。');
      await S.say('xinghe:angry', '喂！');
      const hy = S.actor('hongying');
      if (hy) { hy.scripted = true; hy.through = true; }
      S.move('hongying', 'RRRRRRRRRRRRRRRRRRRRRRDDDDDDD', { wait: false, speed: 4 });
    }
    await S.say('', '（紅纓自己走去碼頭找船伕。星河和白芷在大石頭上坐下，看著瀑布。）');
    await S.move('player', 'RRRRRRRRRRRU');
    S.face('player', 'up');
    const bz = S.actor('baizhi');
    if (bz) { await fwalk(S, 'baizhi', 11, 12); S.face('baizhi', 'up'); }
    await S.say('baizhi:think', '星河。彩虹是什麼做的？');
    await S.say('xinghe:think', '水……跟光吧。');
    await S.say('baizhi:smile', '水，跟光。');
    S.face('baizhi', 'right'); S.face('player', 'left');
    await S.say('baizhi:smile', '……就像你跟我。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '欸？');
    await S.say('baizhi:think', '我是水。你是火——');
    if (inParty('hongying')) {
      await S.say('hongying:serious', '火跟光不一樣吧。');
      await S.say('xinghe:surprise', '妳不是去碼頭了嗎！');
    }
    await S.say('baizhi:think', '……那就是，很像的東西。');
    S.emote('player', '💧');
    await S.say('xinghe:shy', '……');
    if (inParty('hongying')) {
      await S.say('hongying:smug', '笨蛋，臉紅了。');
      await S.say('xinghe:angry', '是瀑布的水噴到臉上啦！');
    }
    await S.say('', '（白芷笑了。水霧裡的彩虹，好像也跟著亮了一點。）');
    S.objective('到碼頭找船伕阿河');
    S.gather();
    void ms;
  }
  async function depart219(S) {
    await S.say('阿河', '三位，坐穩囉！這條是基隆河！');
    await S.say('阿河', '從平溪的山裡出發，彎彎曲曲，經過錫口、經過士林——');
    await S.say('阿河', '到關渡，跟淡水河碰頭，再一路流到淡水，出海。');
    await S.say('baizhi:smile', '水也在旅行。');
    await S.say('阿河', '是啊！水最會旅行了！');
    if (inParty('hongying')) await S.say('hongying:serious', '……觀音山，就在淡水的對岸。');
    await S.say('xinghe:serious', '清虛真人。還有……鬼面。');
    if (inParty('hongying')) await S.say('', '（紅纓沒有說話，只是握緊了槍。）');
    await S.fadeOut(dur(0.6));
    S.hideFollowers(true); S.show('player', false);
    const ms = MS();
    const boat = ms.objects.find((o) => o.t === 'boat_ferry');
    S.sfx('splash');
    await S.camera(28, 19, 0.01);
    await S.fadeIn(dur(0.6));
    await S.say('', '（船離開碼頭。瀑布的聲音，慢慢遠了。）');
    if (boat) await G.Tweens.to(boat, { x: boat.x + 4 }, dur(2.5), 'inOutQuad');
    await S.say('', '（基隆河在山谷間彎彎曲曲，像一條銀色的線，往西方延伸。）');
    await S.fadeOut(dur(1));
    await S.narrate(['基隆河從平溪的山裡出發，一路往西，流向淡水。', '河的盡頭，是海。海的對面，是觀音山。'], { veil: 1 });
    S.flag('ch2_done');
    S.quest('q_ch2_main', 'done');
    S.objective('');
    await S.titleCard('第二章　完');
    // chapter 3 opens with its own river journey on the world map when it has one; otherwise sail here
    if (!/travel\(\s*'pingxi'/.test(String(G.Story.ch3 || ''))) await S.travel('pingxi', 'tamsui', { label: '順著基隆河，往淡水……' });
    S.show('player', true); S.hideFollowers(false);
    await G.Story.next(S, 3);
  }
  G.Maps.define('shifen_falls', {
    name: '十分瀑布', subtitle: '水跟光',
    place: 'pingxi',
    bgm: 'pingxi',
    start: [2, 13],
    light: { ambient: 0, tint: 'rgba(255,236,200,0.08)' },
    particles: [{ type: 'mist', density: 2 }, 'motes'],
    tiles: rows(SF.g), deco: rows(SF.d),
    objects: [
      ...[11, 13, 15, 17, 19].map((x) => ({ t: 'cliff_waterfall', x, y: 0 })),
      { t: 'rock_big', x: 7, y: 5 }, { t: 'rock_big', x: 23, y: 6 }, { t: 'rock_big', x: 5, y: 8 }, { t: 'rock_big', x: 26, y: 9 },
      { t: 'rock_small', x: 11, y: 11, label: '調查', interact: '看瀑布的大石頭。被水霧打得濕濕亮亮的。' },
      saveStone(6, 12, '路邊的石燈籠。水霧把燈罩打濕了。'),
      { t: 'boat_ferry', x: 28, y: 19 }, { t: 'dock_post', x: 23, y: 21 }, { t: 'dock_post', x: 28, y: 22 },
      { t: 'signboard', x: 2, y: 12, text: '十分' }, { t: 'barrel', x: 25, y: 17 }, { t: 'crate', x: 26, y: 17 },
    ],
    npcs: [
      { id: 'ahe', sprite: 'boatman', name: '船伕阿河', x: 25, y: 21, dir: 'up', talk: async (S) => {
        await S.say('阿河', '要去淡水？上船吧——等你們準備好再叫我。');
        const c = await S.choice(['出發', '等一下'], { cancel: 1 });
        if (c === 0) await depart219(S);
      } },
    ],
    events: [
      { id: 'falls', trigger: 'auto', once: true, if: (st) => !!st.flags.ch2_dawn, run: falls218 },
    ],
    warps: [{ x: 0, y: 13, h: 2, to: 'pingxi', tx: 46, ty: 33, tdir: 'left' }],
    drawOver: drawRainbow,
  });

  // =================================================================================================
  // chapter entry
  // =================================================================================================
  G.Story.ch2 = async (S) => {
    S.chapter(2);
    const st = G.state;
    // 九份's side quests can only be finished in 九份 (a main-story scene opens 阿土伯's watch): one left unfinished
    // leaves the quest log with chapter 1 instead of staying open for the rest of the game
    for (const q of ['q_atu_watch', 'q_ahuang', 'q_xingmu']) if (st.quests[q] && !st.quests[q].done) delete st.quests[q];
    // 紅纓 joins after the duel (the debug chapter start puts her in the party — take her out again)
    if (!st.flags.ch2_hongying_join && st.party.includes('hongying')) { G.Party.leave('hongying'); delete st.members.hongying; }
    for (const id of ['xinghe', 'baizhi']) {
      if (!st.party.includes(id)) G.Party.join(id, Math.max(5, avgLv()));
      G.Story.ensureLevel(id, 5);
    }
    st.party.sort((a, b) => ['xinghe', 'baizhi', 'hongying'].indexOf(a) - ['xinghe', 'baizhi', 'hongying'].indexOf(b));
    st.vars.loopCount = 0; st.vars.loopStep = 0; st.vars.c2_ashan = false;
    G.Scenes.replace({ opaque: true, update() {}, draw(ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H); } });
    G.Render.fade.a = 0;
    await S.titleCard(G.Chapters[2], '七月十五・中元');
    await S.warp('mistforest_n', 19, 1, 'down', { fade: 0 });
  };
})();

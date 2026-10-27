// 第八章　逆潮 — 北港迎媽祖之夜（逆潮救援）→ 安平・熱蘭遮舊城・觀潮台（青鋒之死）。
// Screenplay: docs/story/ch8_tide.md
//
// Maps:   beigang (北港街, day → dusk → night → dawn), beigang_inn (進香客棧), beigang_river (北港溪口・逆潮之夜,
//         tide counter P8-1), anping (安平, day → dusk → night → dawn), anping_fort (熱蘭遮舊城・潮閘, sluice puzzle
//         P8-2), anping_tower (觀潮台, boss 洛青鋒 + 青鋒's death + 夜玄's voice).
// Entry:  G.Story.ch8(S)  (works standalone from ?debug&startch=8). Exit: G.Story.next(S, 9) from the 安平 east road.
//
// Religious staging (STORY_BIBLE cultural guide + screenplay §9): 媽祖 never appears or speaks; 八家將 and the
// 千里眼・順風耳 figures (sprites bajiajiang / qianliyan / shunfenger) are NPC actors only — they hold their
// ground in cutscenes and never enter a battle (no troop contains them, no battle backdrop shows them).
//
// P8-1 tide counter: flags.ch8_tide = min(8, G.state.battles − flags.ch8_tide_base) while the rescue phase runs
// (every finished battle — win or flee — raises it by one). Terrain is rebuilt from the tide level:
//   ≥3 riverside lanes (▒) become shallow water (player moves at 60% speed), ≥5 the south bridge floods,
//   ≥7 the lanes become river. At 8 (or when no un-rescued pilgrim can still be reached) the temple people
//   rescue the rest and the phase ends. 5 pilgrims saved before that → 心燈「北港的香客」.
// P8-2 sluice wheels A/B/C (flags ch8_gate_A/B/C): channel 1 dry ⇔ A open; channel 2 ⇔ B open;
//   channel 3 ⇔ C open and A closed.
'use strict';
(() => {
  const T = G.TILE;
  const U = G.U;
  const fl = () => G.state.flags;
  const MS = () => G.mapScene;

  // ================================================================================== generic helpers
  // character grid builder for tiles: rect / set / rows()
  function mk(w, h, fill) {
    const g = Array.from({ length: h }, () => Array(w).fill(fill));
    const api = {
      w, h, g,
      rect(x, y, rw, rh, ch) {
        for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) if (yy >= 0 && yy < h && xx >= 0 && xx < w) g[yy][xx] = ch;
        return api;
      },
      set(x, y, ch) { if (y >= 0 && y < h && x >= 0 && x < w) g[y][x] = ch; return api; },
      rows() { return g.map((r) => r.join('')); },
    };
    return api;
  }
  // rebuild a live map's terrain from its (state-dependent) tiles function
  function retile(m) {
    if (!m) return;
    const legend = Object.assign({}, G.Maps.LEGEND, m.def.legend || {});
    const rows = G.Mapx.val(m.def.tiles);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) m.terrain[y * m.w + x] = legend[(rows[y] || '')[x] || ' '] || 'grass';
    m.computeSolid();
  }
  // add / remove a runtime object on the live map (objects with `if` are only instantiated at load time)
  function addObj(m, o) {
    const inst = Object.assign({ v: 0 }, o);
    inst.key = inst.key || ('c8@' + inst.t + '@' + inst.x + ',' + inst.y + '@' + Math.random().toString(36).slice(2, 7));
    m.objects.push(inst);
    m.computeSolid();
    return inst;
  }
  function rmObj(m, inst) {
    if (!m || !inst) return;
    m.objects = m.objects.filter((o) => o !== inst);
    m.computeSolid();
  }
  // slow, deliberate camera move (S.camera is fixed-speed)
  async function pan(S, x, y, speed = 1.6, sec = 1.2) {
    const m = MS();
    m.cam.tx = x * T + T / 2 - G.W / 2; m.cam.ty = y * T + T / 2 - G.H / 2;
    m.cam.speed = speed;
    await S.wait(sec);
  }
  // move a party follower: map.js updateFollowers() never calls the step's onArrive, so an awaited S.move on a
  // follower never resolves — move without waiting and wait for the walk time instead
  async function moveF(S, id, path, speed = 2) {
    S.move(id, path, { wait: false, speed });
    await S.wait(path.length / speed + 0.15);
  }
  // narration lines in the dialogue box (stage directions the player should read)
  async function nar(S, lines) { for (const l of [].concat(lines)) await S.say('', l); }
  // inner voices: small text, no portrait
  function heart(S, who, text) { return S.say(who, text, { noPortrait: true, size: 23, color: '#d6e2ff' }); }
  // move an actor that stands on a solid cell to the nearest free cell
  function freeCell(m, x, y) {
    if (!m.blocked(x, y, null)) return [x, y];
    for (let r = 1; r < 12; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!m.blocked(x + dx, y + dy, null)) return [x + dx, y + dy];
      }
    }
    return [x, y];
  }
  // temporarily set an item's shop price (秀英姨's 恩人價)
  async function withPrice(id, price, fn) {
    const it = G.Data.items[id];
    const old = it.price;
    it.price = price;
    try { await fn(); } finally { it.price = old; }
  }
  // percussion & firecrackers (WebAudio; silently nothing when audio is locked)
  function drumRoll(beats = 8, gap = 0.2, vol = 0.45) {
    const A = G.Audio;
    if (!A || !A.ctx) return;
    let t = A.now + 0.05;
    for (let i = 0; i < beats; i++) { A.playNote('drum', t, i % 4 === 0 ? 45 : 52, 0.18, i % 4 === 0 ? vol : vol * 0.6, 0.15); t += gap; }
  }
  function firecrackers(S, n = 24, spread = 1.4) {
    for (let i = 0; i < n; i++) S.sfx(i % 5 === 0 ? 'crit' : 'hit', U.rand(0, spread));
  }
  // a new, simple pentatonic lullaby for erhu (written for this scene; not an existing song). Plays once.
  function lullaby() {
    const A = G.Audio;
    if (!A || !A.ctx) return 0;
    const beat = 0.62;
    const tune = [['e4', 1], ['g4', 1], ['a4', 2], ['g4', 1], ['e4', 1], ['d4', 2], ['e4', 1], ['d4', 1], ['c4', 2],
      ['d4', 1], ['e4', 1], ['g4', 1.5], ['e4', 0.5], ['d4', 1], ['c4', 1], ['a3', 1], ['c4', 3]];
    let t = A.now + 0.1;
    for (const [n, d] of tune) { A.playNote('erhu', t, A.noteToMidi(n), d * beat * 0.95, 0.32, 0.6); t += d * beat; }
    return t - A.now;
  }

  // ================================================================================== data: items
  const I = G.Data.items;
  Object.assign(I, {
    c8_jianpangui: { name: '煎盤粿', desc: '米漿蒸成粿，切塊煎得赤赤，淋上蒜蓉醬油膏。進香人跪轎腳前的力氣。回復氣血 450。', type: 'use', price: 130, ch: 8, icon: 'food', use: { target: 'ally', heal: 450 } },
    c8_huashengtang: { name: '花生糖', desc: '北港花生熬成的糖，進香客最愛買回去分厝邊。回復真氣 60。', type: 'use', price: 110, ch: 8, icon: 'food', use: { target: 'ally', mp: 60 } },
    c8_mayouji: { name: '麻油雞', desc: '北港古法麻油炒的雞，補身又暖胃。回復氣血 1000，並使攻擊提升三回合。', type: 'use', price: 380, ch: 8, icon: 'food', use: { target: 'ally', heal: 1000, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }] } },
    c8_yaroujeng: { name: '鴨肉羹', desc: '沒吃過北港的鴨肉羹，就不算來過北港。全體回復氣血 500。', type: 'use', price: 520, ch: 8, icon: 'food', use: { target: 'allies', heal: 500 } },
    c8_mazubing: { name: '媽祖餅', desc: '朝天宮廟方送的餅，過了香火。全體回復氣血 500，並解除一切異常。', type: 'use', price: 0, ch: 8, icon: 'food', use: { target: 'allies', heal: 500, cure: ['poison', 'sleep', 'seal', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown'] } },
    c8_xiajuan: { name: '安平蝦捲', desc: '鮮蝦用網紗油包起來，炸得金黃酥脆。全體回復氣血 600。', type: 'use', price: 600, ch: 8, icon: 'food', use: { target: 'allies', heal: 600 } },
    c8_douhua: { name: '豆花', desc: '老蔡的豆花，加花生、加粉圓。人心慌的時候吃一碗就定了。回復氣血 300 並解除一切異常。', type: 'use', price: 110, ch: 8, icon: 'drink', use: { target: 'ally', heal: 300, cure: ['poison', 'sleep', 'seal', 'stun', 'trance'] } },
    c8_xianghuo: { name: '北港香火袋', desc: '朝天宮廟公親手給的紅色香火袋，過了香火。防睡眠、封印。', type: 'acc', price: 0, ch: 8, icon: 'bag', stats: { luk: 8, def: 3 }, immune: ['sleep', 'seal'] },
    c8_jianshi: { name: '劍獅護符', desc: '安平人門楣上那隻咬著劍的獅子，刻成了小小的護符。防暈眩。', type: 'acc', price: 1500, ch: 8, icon: 'charm', stats: { def: 10, atk: 4 }, immune: ['stun'] },
    c8_chaoxin: { name: '潮心珠', desc: '潮怨・百手散去後留下的珠子，摸起來像一滴冷掉的眼淚。大幅減輕水屬性傷害。', type: 'acc', price: 0, ch: 8, icon: 'gem', stats: { mag: 6, def: 6 }, resist: ['water'] },
    c8_liuguang: { name: '流光劍', desc: '北港打鐵店的好劍，劍身映著燈火會流光。火屬性。', type: 'weapon', price: 1500, ch: 8, icon: 'sword', who: ['xinghe'], elem: 'fire', stats: { atk: 62, luk: 2 } },
    c8_jingtao: { name: '驚濤槍', desc: '槍身刻著浪紋，刺出時帶著潮聲。', type: 'weapon', price: 1600, ch: 8, icon: 'spear', who: ['hongying'], stats: { atk: 66, spd: 2 } },
    c8_leiyin: { name: '雷音扇', desc: '扇骨夾著雷符，一開扇就隱隱有雷聲。木屬性。', type: 'weapon', price: 1600, ch: 8, icon: 'fan', who: ['yungui'], elem: 'wood', stats: { atk: 9, mag: 72, mp: 20 } },
    c8_jinxiang: { name: '進香布衫', desc: '走過幾百里進香路的粗布衫，曬過日頭、淋過雨，水氣不沾。', type: 'armor', price: 1250, ch: 8, icon: 'armor', stats: { def: 36, luk: 2 }, resist: ['water'] },
    c8_haifeng: { name: '海風披風', desc: '安平討海人的披風，擋得住台江的海風。', type: 'armor', price: 1300, ch: 8, icon: 'armor', stats: { def: 37, spd: 4 } },
    c8_douli: { name: '進香斗笠', desc: '香客遮日頭的斗笠，邊上綁著紅布條。', type: 'head', price: 700, ch: 8, icon: 'hat', stats: { def: 16, spd: 4 } },
    c8_caoxie: { name: '綁紅線的草鞋', desc: '走進香路的草鞋，鞋帶綁著保平安的紅線。', type: 'feet', price: 700, ch: 8, icon: 'shoes', stats: { def: 12, spd: 7, luk: 4 } },
    c8_cm_note: { name: '長明宮手記', desc: '「引潮之法：東閘開，則北道通。唯南閘須閉——前路既開，退路自斷。」最後一行是另一個人的字：「退路，本來就不需要。」', type: 'key', price: 0, ch: 8, icon: 'scroll' },
  });

  // ================================================================================== data: skills
  Object.assign(G.Data.skills, {
    c8_e_cm_array: { name: '長明陣', desc: '', mp: 0, type: 'buff', elem: null, target: 'allies', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'buff' },
    c8_e_hands_drag: { name: '千手拖拽', desc: '', mp: 0, type: 'phys', elem: 'water', target: 'enemies', power: 0.7, status: { id: 'spdDown', chance: 0.35, turns: 3 }, fx: 'water', sfx: 'splash' },
    c8_e_grudge_tide: { name: '怨潮', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 1.0, fx: 'water_big', sfx: 'water' },
    c8_e_call_drowned: { name: '溺魂召喚', desc: '水裡又伸出了一隻手。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['water_ghost_v2'], fx: 'summon', sfx: 'splash' },
    c8_e_wick_feed: { name: '潮引', desc: '', mp: 0, type: 'buff', elem: null, target: 'allies', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 2 }], fx: 'buff', sfx: 'dark' },
    c8_e_wick_wave: { name: '逆浪', desc: '', mp: 0, type: 'mag', elem: 'water', target: 'enemies', power: 0.6, fx: 'water', sfx: 'splash' },
    c8_e_qf_qisha: { name: '鬼面七殺', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'random', power: 0.45, hits: 7, fx: 'slash_multi', sfx: 'slash2' },
    c8_e_qf_duanchao: { name: '洛家劍・斷潮', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemies', power: 0.9, fx: 'slash_multi', sfx: 'slash2' },
    c8_e_qf_lowtip: { name: '槍尖，太低了', desc: '', mp: 0, type: 'phys', elem: 'metal', target: 'enemy', power: 0.8, status: { id: 'defDown', chance: 0.8, turns: 3 }, fx: 'thrust', sfx: 'stab' },
    c8_e_qf_huilan: { name: '洛水迴瀾', desc: '', mp: 0, type: 'buff', elem: null, target: 'self', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 2 }, { stat: 'atk', amt: 0.3, turns: 2 }], fx: 'buff', sfx: 'guard' },
  });

  // ================================================================================== data: enemies & troops
  // same construction as js/data/enemies.js def(): stats from G.Data.enemyCurve(lv) × multipliers
  function edef(id, d) {
    const c = G.Data.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : (0.55 * m.hp + 0.25 * m.atk + 0.2) * (d.boss ? 0.9 : 1);
    const goldM = m.gold != null ? m.gold : expM;
    const e = {
      name: d.name, lv: d.lv,
      hp: Math.round((d.boss ? c.hpRaw : c.hp) * m.hp), mp: Math.round(c.mp * (d.boss ? 4 : 1)),
      atk: Math.round(c.atk * m.atk), def: Math.round(c.def * m.def), mag: Math.round(c.mag * m.mag),
      spd: Math.round(c.spd * m.spd), luk: Math.round(c.luk * m.luk), elem: d.elem || null,
      exp: Math.max(1, Math.round(c.exp * expM)), gold: Math.max(1, Math.round(c.gold * goldM)),
      drops: (d.drops || []).map(([item, rate]) => ({ item, rate })),
      skills: d.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })),
      desc: d.desc,
    };
    for (const k of ['art', 'sprite', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale', 'endAt', 'phases']) if (d[k] != null) e[k] = d[k];
    G.Data.enemies[id] = e;
  }
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  edef('c8_cm_guard', {
    name: '長明宮衛', sprite: 'temple_guard', lv: 28, elem: 'metal', m: { hp: 1.2, atk: 1.1, def: 1.3 },
    skills: [['e_guard_halberd', 3], ['e_guard_lamp', 2], ['c8_e_cm_array', 1, 'turn>1']], drops: [['aiyu', 0.25]],
    desc: '守在熱蘭遮舊城的長明宮衛。他們叫青鋒「少主」，相信自己正在替死者開一條回家的路。',
  });
  edef('c8_hundred_hands', {
    name: '潮怨・百手', art: 'tide_grudge', variant: 2, scale: 1.8, lv: 28, elem: 'water', resist: ['water'], boss: true, immune: BOSS_IMM,
    m: { hp: 11, atk: 3.6, mag: 3.8, def: 1.1, spd: 2.3, exp: 7, gold: 31.7 }, // sim_story: was atk 1.9 mag 2.0 spd 1.2
    skills: [['c8_e_hands_drag', 3], ['c8_e_grudge_tide', 2], ['e_tg_curse', 1], ['c8_e_call_drowned', 1, 'turn>2']],
    phases: [
      { at: 0.5, lines: [['潮怨・百手', '……有人……在點燈叫我們……說回來吧……回來吧……'], ['yungui:serious', '點燈叫它們？……長明宮！']] },
      { at: 0.3, buffs: [{ id: 'regen', turns: 3 }], text: '百手縮回漩渦裡，喃喃地說著「回家」——傷口慢慢合了起來。' },
    ],
    drops: [['c8_chaoxin', 1]],
    desc: '許多溺死者的怨念在河口的漩渦裡交纏成的人形。它們不是想害人，只是想回家。',
  });
  edef('c8_tide_wick', {
    name: '潮引燈芯', art: 'ghost_lantern', variant: 2, lv: 30, elem: 'water', weak: ['fire'], resist: ['water'],
    m: { hp: 1.3, atk: 0.4, mag: 0.95, def: 1.1, spd: 0.75, exp: 1.2, gold: 0.2 },
    skills: [['c8_e_wick_feed', 1], ['c8_e_wick_wave', 2]],
    desc: '逆潮燈分出來的燈芯，藍黑色的火焰把死者的力氣灌給青鋒。',
  });
  edef('c8_qingfeng', {
    name: '洛青鋒', sprite: 'qingfeng', lv: 30, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 10.4, atk: 2.25, mag: 2.15, def: 1.15, spd: 2.0, exp: 17.1, gold: 28.9 }, // sim_story: was hp 9 atk 1.6 mag 1.5 spd 1.4
    skills: [['e_qf2_sword', 3], ['c8_e_qf_qisha', 1], ['c8_e_qf_duanchao', 2], ['c8_e_qf_lowtip', 2], ['c8_e_qf_huilan', 1, 'turn>1'], ['e_qf2_tide', 1]],
    phases: [
      { at: 0.5, skills: [{ id: 'e_qf2_sword', w: 2 }, { id: 'c8_e_qf_qisha', w: 3 }, { id: 'c8_e_qf_duanchao', w: 2 }, { id: 'c8_e_qf_lowtip', w: 2 }, { id: 'c8_e_qf_huilan', w: 1 }] },
    ],
    desc: '紅纓的哥哥。站在逆潮燈前，劍光如水。他相信爹娘已經回來了。',
  });
  const TR = G.Data.troops;
  const troop = (id, enemies, bg, bgm, extra) => { TR[id] = Object.assign({ enemies, bg, bgm: bgm || 'battle2' }, extra || {}); };
  troop('t_c8_street', ['drowned_soldier', 'drowned_soldier', 'tide_grudge'], 'procession');
  troop('t_c8_p1', ['drowned_soldier', 'water_ghost_v2', 'water_ghost_v2'], 'chaos');
  troop('t_c8_p2', ['tide_grudge', 'drowned_soldier'], 'chaos');
  troop('t_c8_p3', ['drowned_soldier', 'drowned_soldier', 'tide_grudge'], 'chaos');
  troop('t_c8_p4', ['water_ghost_v2', 'water_ghost_v2', 'tide_grudge'], 'chaos');
  troop('t_c8_p5', ['drowned_soldier', 'drowned_soldier', 'tide_grudge', 'water_ghost_v2'], 'chaos');
  troop('t_c8_roam', ['drowned_soldier', 'water_ghost_v2'], 'chaos');
  troop('t_c8_hundred', ['c8_hundred_hands'], 'chaos', 'boss', { boss: true, flee: false });
  troop('t_c8_fort', ['drowned_soldier_v1', 'tide_grudge_v1'], 'chaos');
  troop('t_c8_fort2', ['c8_cm_guard', 'tide_grudge_v1', 'tide_grudge_v1'], 'chaos');
  troop('t_c8_guards', ['c8_cm_guard', 'c8_cm_guard', 'tide_grudge_v1'], 'chaos');
  troop('t_c8_qingfeng', ['c8_qingfeng', 'c8_tide_wick', 'c8_tide_wick'], 'chaos', 'boss', { boss: true, flee: false });
  G.Data.areas.c8_river = { name: '北港溪口・逆潮之夜', ch: 8, lv: [27, 28], troops: ['t_c8_p1', 't_c8_p2', 't_c8_p3', 't_c8_p4', 't_c8_p5', 't_c8_roam'], bosses: ['t_c8_hundred'], party: ['xinghe', 'hongying', 'yungui'] };
  G.Data.areas.c8_fort = { name: '熱蘭遮舊城・觀潮台', ch: 8, lv: [28, 29], troops: ['t_c8_fort', 't_c8_fort2', 't_c8_guards'], bosses: ['t_c8_qingfeng'], party: ['xinghe', 'hongying', 'yungui'] };

  // ================================================================================== quests
  G.Data.quests = G.Data.quests || {};
  Object.assign(G.Data.quests, {
    q_ch8_tide: { name: '逆潮', main: true, desc: '三月瘋媽祖。海第一次倒流的夜晚，死去的人會走上岸。', stages: ['到北港渡頭找船，看能不能直接出海去澎湖。', '參加朝天宮的起駕，跟著香客鑽轎腳。', '逆潮來了。救出困在北港溪邊的香客。', '溺死者說，安平的觀潮台上有人在點燈。', '在安平等到入夜，上北邊的熱蘭遮舊城。', '打開潮閘，登上觀潮台。', '陳伯來了。往南，去找一艘死人肯抬的船。'] },
    q_ch8_pilgrims: { name: '北港的香客', lantern: true, desc: '逆潮之夜，五名香客被困在北港溪邊。水是不等人的。', stages: ['在潮位漲滿之前，救出所有受困的香客。', '天亮了。回到朝天宮的廟埕。'] },
    q_ch8_oyster: { name: '蚵殼阿嬤', lantern: true, desc: '安平海邊剖蚵的阿嬤，十年前出海的丈夫自己走回來了，卻一口粥也不吃。', stages: ['阿嬤拜託你們：如果上面有什麼把他綁在這裡，就讓他走吧。', '觀潮台的燈熄了。回去看看阿嬤。'] },
  });

  // ================================================================================== shared state helpers
  const SAVED = (st) => st.flags.ch8_saved || 0;
  const TIDE = (st) => st.flags.ch8_tide || 0;
  const tideActive = (st) => !!st.flags.ch8_surge && !st.flags.ch8_rescue_over;
  const tideNow = (st) => Math.max(0, Math.min(8, (st.battles || 0) - (st.flags.ch8_tide_base || 0)));
  const bgDay = (st) => !st.flags.ch8_dusk;
  const bgNight = (st) => !!st.flags.ch8_dusk && !st.flags.ch8_surge_end;
  const bgDawn = (st) => !!st.flags.ch8_surge_end;

  // ================================================================================== 北港 beigang
  const BG_SHOP = ['xumingsan', 'wanguo', 'c8_jianpangui', 'c8_huashengtang', 'c8_mayouji', 'c8_yaroujeng', 'aiyu', 'huanhunxiang', 'huanhundan', 'xiangbao', 'xiancao'];
  const BG_SMITH = ['c8_liuguang', 'c8_jingtao', 'c8_leiyin', 'c8_jinxiang', 'c8_douli', 'c8_caoxie'];
  const panguiPrice = () => (fl().ch8_saved_4 ? 65 : 130);

  function beigangTiles() {
    const g = mk(56, 44, '.');
    g.rect(9, 2, 38, 12, '%');                 // 朝天宮廟埕
    g.rect(1, 14, 48, 27, '#');                // 街區
    g.rect(25, 14, 6, 30, '%');                // 主街（遶境路線）
    g.rect(49, 0, 3, 44, 's');                 // 河岸
    g.rect(49, 14, 3, 27, 'k');                // 渡頭木棧道
    g.rect(52, 0, 4, 44, 'r');                 // 北港溪
    g.rect(52, 18, 2, 1, 'k'); g.rect(52, 24, 2, 1, 'k'); g.rect(52, 30, 2, 2, 'k');
    return g.rows();
  }
  const pine = (x, y) => ({ t: 'tree_pine', x, y });
  const banyan = (x, y) => ({ t: 'tree_banyan', x, y });
  const BG_OBJECTS = [
    { t: 'mazu_temple', x: 25, y: 2, door: 2, text: '朝天宮' },
    { t: 'statue_lion', x: 24, y: 6 }, { t: 'statue_lion', x: 31, y: 6, flip: true },
    { t: 'incense_burner', x: 25, y: 8 }, { t: 'incense_burner', x: 30, y: 8 },
    { t: 'banner', x: 22, y: 3, color: '#c8282a', text: '天上聖母' }, { t: 'banner', x: 33, y: 3, color: '#c8282a', text: '合境平安' },
    { t: 'pilgrim_flag', x: 12, y: 3, text: '進香', color: '#f1c232' }, { t: 'pilgrim_flag', x: 14, y: 3, text: '北港', color: '#d8382a' },
    { t: 'pilgrim_flag', x: 41, y: 3, text: '進香', color: '#f1c232' }, { t: 'pilgrim_flag', x: 43, y: 3, text: '朝天', color: '#d8382a' },
    { t: 'pilgrim_flag', x: 18, y: 12, text: '進香', color: '#e8b030' }, { t: 'pilgrim_flag', x: 37, y: 12, text: '平安', color: '#d8382a' },
    // 八家將休息處
    { t: 'bench', x: 11, y: 6, w: 2 }, { t: 'bench', x: 10, y: 10, w: 2 }, { t: 'table', x: 16, y: 8 }, { t: 'table', x: 16, y: 11 },
    { t: 'drum_rack', x: 10, y: 12 }, { t: 'jar', x: 9, y: 5 }, { t: 'basket', x: 13, y: 12 }, { t: 'weapon_rack', x: 18, y: 6 },
    // 北管
    { t: 'drum', x: 21, y: 10 },
    // 神將歇駕
    { t: 'pavilion', x: 38, y: 5 }, { t: 'bench', x: 43, y: 9, w: 2 }, { t: 'jar', x: 45, y: 6 },
    // 街屋 row 1
    { t: 'shophouse', x: 3, y: 17, door: 1, text: '北港花生' }, { t: 'shophouse', x: 8, y: 17, door: 1, text: '麻油行' },
    { t: 'shophouse', x: 13, y: 17, door: 1, text: '香鋪' }, { t: 'house_minnan', x: 18, y: 17 },
    { t: 'stall', x: 23, y: 17, text: '香燭' }, { t: 'stall', x: 31, y: 17, text: '涼水' },
    { t: 'shophouse', x: 33, y: 17, door: 1, text: '打鐵' }, { t: 'shophouse', x: 38, y: 17, door: 1, text: '餅舖' }, { t: 'house_minnan', x: 42, y: 17 },
    // row 2
    { t: 'house_minnan', x: 3, y: 23 }, { t: 'shophouse', x: 9, y: 23, door: 1, text: '布莊' }, { t: 'shophouse', x: 14, y: 23, door: 1, text: '藥鋪' },
    { t: 'house_jiufen', x: 19, y: 23 }, { t: 'stall', x: 23, y: 23, text: '煎盤粿' }, { t: 'stall', x: 31, y: 23, text: '鴨肉羹' },
    { t: 'shophouse', x: 33, y: 23, door: 1, text: '茶行' }, { t: 'house_minnan', x: 38, y: 23 }, { t: 'shophouse', x: 43, y: 23, door: 1, text: '金紙' },
    // row 3
    { t: 'house_minnan', x: 3, y: 29 }, { t: 'house_jiufen', x: 9, y: 29 }, { t: 'shophouse', x: 14, y: 29, door: 1, text: '香燭' },
    { t: 'house_minnan', x: 18, y: 29 }, { t: 'stall', x: 23, y: 29, text: '糖葫蘆' }, { t: 'stall', x: 31, y: 29, text: '花生' },
    { t: 'house_minnan', x: 33, y: 29 }, { t: 'house_jiufen', x: 39, y: 29 }, { t: 'shophouse', x: 43, y: 29, door: 1, text: '米店' },
    // row 4
    { t: 'house_minnan', x: 3, y: 35 }, { t: 'signboard', x: 8, y: 37, text: '進香客棧', v: 1 },
    { t: 'house_jiufen', x: 10, y: 35 }, { t: 'house_minnan', x: 15, y: 35 },
    { t: 'house_minnan', x: 33, y: 35 }, { t: 'house_minnan', x: 38, y: 35 }, { t: 'house_jiufen', x: 43, y: 35 },
    // street lanterns
    { t: 'lantern_string', x: 25, y: 20, w: 6, v: 1 }, { t: 'lantern_string', x: 25, y: 26, w: 6, v: 1 },
    { t: 'lantern_string', x: 25, y: 32, w: 6, v: 1 }, { t: 'lantern_string', x: 25, y: 38, w: 6, v: 1 },
    { t: 'lantern_string', x: 9, y: 21, w: 5, v: 0 }, { t: 'lantern_string', x: 36, y: 21, w: 5, v: 0 },
    { t: 'lantern_string', x: 9, y: 33, w: 5, v: 0 }, { t: 'lantern_string', x: 36, y: 33, w: 5, v: 0 },
    { t: 'pilgrim_flag', x: 24, y: 20, text: '進香', color: '#f1c232' },
    { t: 'barrel', x: 23, y: 35 }, { t: 'jar', x: 24, y: 35 }, { t: 'cart', x: 46, y: 39 }, { t: 'well', x: 22, y: 41 },
    { t: 'fence_wood', x: 9, y: 41, w: 3 }, { t: 'basket', x: 2, y: 30 }, { t: 'jar', x: 47, y: 25 }, { t: 'crate', x: 48, y: 31 },
    // 渡頭
    { t: 'boat_small', x: 53, y: 20 }, { t: 'boat_small', x: 54, y: 27 }, { t: 'boat_ferry', x: 52, y: 33 },
    { t: 'dock_post', x: 51, y: 17 }, { t: 'dock_post', x: 51, y: 35 }, { t: 'barrel', x: 49, y: 21 }, { t: 'barrel', x: 49, y: 29 },
    { t: 'fishing_net', x: 49, y: 38 },
    {
      t: 'crate', x: 52, y: 30, label: '調查',
      interact: async (S) => {
        if (fl().ch8_crate) { await S.say('', '空木箱，只剩下花生殼的香味。'); return; }
        S.flag('ch8_crate');
        await S.say('', '渡頭邊的木箱裡，用紙包著幾塊花生糖。上面寫著：「給渡船的人，路上吃。」');
        await S.give('c8_huashengtang', 3);
      },
    },
    // trees
    pine(1, 0), pine(5, 1), pine(10, 0), pine(15, 0), pine(19, 1), pine(36, 1), pine(40, 0), pine(45, 1), pine(48, 3),
    banyan(1, 4), banyan(4, 9), banyan(46, 9), { t: 'bush', x: 7, y: 6 }, { t: 'bush', x: 47, y: 4 }, { t: 'flowers', x: 6, y: 3 },
    pine(2, 41), pine(13, 41), pine(17, 42), pine(34, 41), pine(38, 42), pine(42, 41), { t: 'bush', x: 20, y: 42 },
    { t: 'bush', x: 32, y: 42 }, { t: 'flowers', x: 23, y: 42 }, { t: 'flowers', x: 33, y: 41 },
    // night: 遶境
    { t: 'palanquin', x: 27, y: 37, still: true, if: (st) => !!st.flags.ch8_qijia && !st.flags.ch8_surge },
    { t: 'firecracker_tower', x: 22, y: 36, if: bgNight }, { t: 'firecracker_tower', x: 31, y: 36, if: bgNight },
    { t: 'firecracker_tower', x: 23, y: 41, if: bgNight },
  ];
  const BG_LIGHTS_NIGHT = [
    { x: 27, y: 6, r: 260, color: '#ffb060', flicker: 0.3 }, { x: 25, y: 8, r: 160, color: '#ff9a50', flicker: 0.4 }, { x: 30, y: 8, r: 160, color: '#ff9a50', flicker: 0.4 },
    { x: 27, y: 20, r: 240, color: '#ff7a40', flicker: 0.3 }, { x: 27, y: 26, r: 240, color: '#ff7a40', flicker: 0.3 }, { x: 27, y: 32, r: 260, color: '#ff8a40', flicker: 0.4 },
    { x: 27, y: 38, r: 260, color: '#ffb060', flicker: 0.4 }, { x: 11, y: 21, r: 200, color: '#ff8a40' }, { x: 38, y: 21, r: 200, color: '#ff8a40' },
    { x: 11, y: 33, r: 200, color: '#ff8a40' }, { x: 38, y: 33, r: 200, color: '#ff8a40' }, { x: 15, y: 9, r: 180, color: '#ffb060' },
    { x: 39, y: 9, r: 180, color: '#ffb060' }, { x: 50, y: 25, r: 160, color: '#ffcf8a' }, { x: 5, y: 38, r: 160, color: '#ffcf8a' },
  ];

  // ---------------------------------------------------------------- beigang NPC talks
  const say1 = (who, lines) => async (S) => { for (const l of lines) await (Array.isArray(l) ? S.say(l[0], l[1]) : S.say(who, l)); };
  const rot = (key, n) => { const v = (fl()[key] || 0) % n; G.state.flags[key] = v + 1; return v; };

  async function talkKeeper(S) {
    const f = fl();
    if (f.ch8_surge_end) {
      await S.say('添壽伯', '昨晚……我在廟裡七十年，第一次看到神轎自己停在河邊，抬轎的推都推不動。');
      await S.say('添壽伯', '那不是我們停的。是媽祖婆停的。祂在那裡，那些可憐的人就不敢再往前。');
      return;
    }
    if (f.ch8_no_boat && f.ch8_jiajiang_seen && !f.ch8_qijia) {
      await S.say('添壽伯', '少年仔，時辰快到了。起駕之後，神轎就要出廟門巡過整個北港。');
      const c = await S.choice(['我們準備好了', '再等一下'], { cancel: 1 });
      if (c !== 0) { await S.say('添壽伯', '好，好。要買香、買花生的，趁現在。日頭一落，就要起駕了。'); return; }
      await ev82(S);
      return;
    }
    const pool = [
      ['少年仔，來進香的？今年人特別多，三月瘋媽祖，一年比一年瘋。', '媽祖婆是海上人的母親。討海的、過海的，誰沒在浪頭上喊過一聲「媽祖婆」？'],
      ['起駕要看時辰。吉時一到，鞭炮一響，神轎就出廟門，一路巡過整個北港。', '遶境是媽祖出來看看祂的子民，看哪裡不平安，就把不乾淨的東西掃走。'],
      ['等一下神轎經過，你們可以去鑽轎腳。跪在路上，讓神轎從頭頂過去，媽祖就會保庇你。'],
    ];
    for (const l of pool[rot('ch8_keeper_n', 3)]) await S.say('添壽伯', l);
    if (!f.ch8_no_boat) await S.say('添壽伯', '要找船？渡頭在主街東邊，順著巷子走就到了。');
    else if (!f.ch8_jiajiang_seen) await S.say('添壽伯', '起駕前，去廟埕兩邊看看吧。八家將在開臉，神將也在歇駕。');
  }
  async function talkBjLead(S) {
    const f = fl();
    if (f.ch8_surge_end) {
      await S.say('八家將領班', '昨晚那些……是海裡上來的人。我們的陣沒有破。一步都沒有退。');
      await S.say('八家將領班', '那個打鼓的囝仔是我姪子。……謝謝你們。');
      return;
    }
    const pool = [
      ['我們是八家將。甘、柳、謝、范四位將爺，春、夏、秋、冬四位大神。', '開臉之後，我們就是將爺的人了。不隨便說話，不隨便笑，不隨便吃東西。'],
      ['出陣之前還要齋戒幾天。不是做戲，是要乾乾淨淨地替神明開路。', '我們走在神轎前面，踏步、擺陣，把路上不好的東西趕走。'],
      ['等一下我開了臉，你們跟我說話，我就不會回了。不是我不禮貌喔。'],
    ];
    for (const l of pool[rot('ch8_bjlead_n', 3)]) await S.say('八家將領班', l);
  }
  async function talkBjSilent(S) {
    await S.say('', '他看了你一眼，沒有說話。手中的刑具微微一動，又靜止了。');
  }
  async function talkBjYoung(S) {
    await S.say('', '畫臉的人一筆一筆地描著，紅、黑、白、金。被畫的少年閉著眼，一動不動。');
    await S.say('xinghe:think', '……他好像在慢慢變成另一個人。');
    await S.say('yungui:normal', '不是變成另一個人。是讓另一位，借他的身體走一段路。');
  }
  async function talkGiant(S, which) {
    const f = fl();
    if (f.ch8_giant_seen) {
      await S.say('', '兩尊神將原本是作亂的精怪，被媽祖收服，從此成為祂的左右護法。');
      await S.say('hongying:smile', '小時候我很怕祂們。哥哥說，祂們看得見、聽得見我偷吃糖。');
      return;
    }
    S.flag('ch8_giant_seen');
    if (which === 'qly') await S.say('', '綠面的神將，額上一隻手搭著涼棚，望向遠方。傳說祂能看見千里之外。');
    else await S.say('', '紅面的神將，一手攏在耳邊。傳說祂能聽見千里之外的聲音。');
  }
  async function talkBearer(S, i) {
    const f = fl();
    if (f.ch8_surge_end) {
      if (i === 0) await S.say('扛神將的阿伯', '昨晚我在千里眼裡面，從祂的眼睛縫看出去……海整片都在往回流。');
      else await S.say('扛神將的阿伯', '有個囝仔抱著我的腳在哭。我不能蹲下去抱他，神將不能隨便蹲。我就站著，一步都沒動。');
      return;
    }
    if (i === 0) await S.say('扛神將的阿伯', '我在裡面扛了十二年。大仙尪仔很重，可是扛起來就不覺得重了。');
    else await S.say('扛神將的少年', '走路要用肩膀扭，祂才會搖得威風。走到媽祖前面，要先拜三拜。');
  }
  async function talkAjin(S) {
    if (fl().ch8_surge_end) { await S.say('阿進', '那個打鼓的囝仔是我們團裡最小的。昨晚他一個人在河邊打了半個時辰。'); return; }
    if (rot('ch8_ajin_n', 2) === 0) await S.say('阿進', '北管要熱鬧！鑼鼓一響，嗩吶一吹，神明出門才有面子！');
    else await S.say('阿進', '北港的子弟，從小就是聽北管長大的。我阿公打鼓、我阿爸打鼓，我吹嗩吶，叛逆一下。');
  }
  async function talkAtian(S) {
    if (fl().ch8_surge_end) { await S.say('阿添', '我……我那時候好怕。可是我一停下來，那些人就會往前走。所以我不敢停。'); return; }
    drumRoll(6, 0.18, 0.35);
    await S.say('阿添', '我今年第一次跟陣！我負責小鼓！');
    await S.say('阿添', '師傅說，鼓聲是給神明開路的，也是給迷路的人聽的。');
  }
  async function talkPeanut(S) {
    await S.say('花生阿嬸', rot('ch8_peanut_n', 2) === 0 ? '北港的花生，粒粒飽！炒的、煮的、做糖的，都有。' : '進香客最愛買花生糖回去分厝邊。吃了媽祖保庇的糖，甜到心肝底。');
    await S.shop(['c8_huashengtang', 'c8_jianpangui', 'wanguo'], { title: '北港花生' });
  }
  async function talkSesame(S) {
    if (!fl().ch8_sesame_joke) {
      S.flag('ch8_sesame_joke');
      await S.say('麻油行老闆', '北港麻油，用古法炒的芝麻，一滴一滴榨出來。整條街都是香的。');
      await S.say('麻油行老闆', '做月子要麻油雞，冬天補身也要麻油雞。你們這個少年家，臉色可以補一下。');
      await S.say('xinghe:smile', '我已經好了啦！我現在有心火！');
      await S.say('麻油行老闆', '……心火？那更要吃，心火大要退火。');
      await S.say('xinghe:surprise', '不是那個心火！');
    } else await S.say('麻油行老闆', '北港麻油，用古法炒的芝麻，一滴一滴榨出來。整條街都是香的。');
    await S.shop(['c8_mayouji', 'c8_yaroujeng'], { title: '麻油行' });
  }
  async function talkIncenseShop(S) {
    await S.say('香鋪頭家', '香、金紙、藥材、乾糧，進香要用的這裡都有。走遠路的，多帶幾帖藥。');
    await withPrice('c8_jianpangui', panguiPrice(), () => S.shop(BG_SHOP, { title: '香鋪雜貨' }));
  }
  async function talkSmith(S) {
    await S.say('打鐵師傅', fl().ch8_surge_end ? '昨晚的事，我在店裡都聽到了。少年仔，傢伙要顧好，海還沒完全平靜。' : '進香的人多，路上不平靜，傢伙要帶好。北港打鐵，價錢公道。');
    await S.shop(BG_SMITH, { title: '北港打鐵店' });
  }
  async function talkXiuying(S) {
    const f = fl();
    if (f.ch8_surge_end && f.ch8_saved_4) {
      if (!f.ch8_xiuying_gift) {
        S.flag('ch8_xiuying_gift');
        await S.say('秀英姨', '你們是我的救命恩人！今天的煎盤粿，你們吃免錢！吃到飽！');
        await S.give('c8_jianpangui', 5);
        await S.say('秀英姨', '以後來我的攤子，一律半價！我秀英說話算話！');
      } else await S.say('秀英姨', '恩人來了！坐、坐！粿漿還是昨晚那一鍋，那隻胖貓坐在鍋蓋上守住的那一鍋喔！');
      await withPrice('c8_jianpangui', panguiPrice(), () => S.shop(['c8_jianpangui'], { title: '秀英的煎盤粿' }));
      return;
    }
    await S.say('秀英姨', rot('ch8_xy_n', 2) === 0 ? '煎盤粿喔！米漿蒸成粿，切塊下去煎，煎得赤赤，淋上蒜蓉醬油膏！' : '進香的人走一整天，吃一盤熱的，才有力氣跪轎腳。');
    await withPrice('c8_jianpangui', panguiPrice(), () => S.shop(['c8_jianpangui'], { title: '秀英的煎盤粿' }));
  }
  async function talkGrandma(S) {
    const f = fl();
    if (f.ch8_surge_end) {
      await S.say('進香的阿嬤', '少年仔……阿嬤沒什麼可以給你們。我每天都會替你們跟媽祖婆講一聲。');
      return;
    }
    const pool = [
      ['我從海線那邊一路走過來，走了好幾天。腳底都起泡了。'],
      ['我孫仔去年破病，差點救不回來。我跟媽祖婆許願，他好了，我就走路來進香。', '他好了！你看，那個在跑來跑去的就是他，叫阿福。皮得要命。'],
    ];
    for (const l of pool[rot('ch8_gm_n', 2)]) await S.say('進香的阿嬤', l);
    await S.say('進香的阿嬤', '阿福——！不要亂跑——！');
  }
  async function talkAfu(S) {
    if (fl().ch8_surge_end) { await S.say('阿福', '哥哥！千里眼的鬍子我摸到了！昨天晚上摸到的！'); return; }
    await S.say('阿福', '我要看千里眼！我要看順風耳！我要摸祂們的鬍子！');
    await S.say('阿福', '哇！好胖的貓！可以摸嗎？');
    S.emote('yuyuan', '…');
    await S.say('', '芋圓瞇起眼睛，慢慢地把肚子轉向阿福。……看來是允許了，三下。');
  }
  async function talkFlagman(S) {
    if (fl().ch8_surge_end) { await S.say('老阿伯', '旗沒有倒。……雖然我的腰快斷了。'); return; }
    await S.say('老阿伯', '我扛這支進香旗扛四十年了。旗不能倒，倒了，整團人的心就散了。');
  }
  async function talkHusband(S) {
    if (fl().ch8_surge_end) { await S.say('還願的丈夫', '我太太說，等孩子會走路了，要帶他來給你們看。'); return; }
    await S.say('還願的丈夫', '我們結婚三年都沒有孩子，去年來求，今年就有了！');
  }
  async function talkWife(S) {
    if (fl().ch8_surge_end) { await S.say('還願的妻子', '……孩子剛才踢了我一下。好像在說謝謝。'); return; }
    await S.say('還願的妻子', '所以今年來還願。走慢一點就好。');
  }
  async function talkBoatman(S) {
    const f = fl();
    if (f.ch8_surge_end) {
      await S.say('海生', '……我昨晚親眼看到了。我這輩子都不會再笑我阿公。');
      await S.say('海生', '去澎湖的船，至少等海正常了再說。要不然，就去南邊找……算了，我不說。');
      return;
    }
    if (!f.ch8_no_boat) { await ev81b(S); return; }
    await S.say('海生', '這幾個晚上，海很怪。潮水半夜會倒著流，連老船長都不敢出港。');
    await S.say('海生', '我阿公說，海倒著流，是海裡的人想回家了。');
  }
  const GOSSIP = [
    '聽說府城那邊，有人在海邊看到死去的親人走回來喔！',
    '長明宮的法師說，那是好事，是媽祖……不對，是天上要讓大家團圓。',
    '我才不信！我阿母說，死去的人回來，一定有不好的事。',
    '你們有沒有吃過北港的鴨肉羹？沒吃過，就不算來過北港！',
    '鑽轎腳要跪好，頭低下來，不要抬頭看轎子底。',
  ];
  const GOSSIP_AFTER = [
    '昨晚我躲在神轎後面，整夜都沒敢抬頭。天亮的時候，香煙又直直地往天上走了。',
    '聽說河邊有幾個少年家，一整晚跑來跑去救人。是你們喔？',
    '我回去要跟厝邊講：北港的媽祖，昨晚真的出門了。',
  ];
  const gossip = (i, who) => async (S) => {
    if (fl().ch8_surge_end) await S.say(who, GOSSIP_AFTER[i % GOSSIP_AFTER.length]);
    else await S.say(who, GOSSIP[i % GOSSIP.length]);
  };
  const notNight = (st) => !bgNight(st);
  const BG_NPCS = [
    { id: 'keeper', sprite: 'temple_keeper', name: '添壽伯', x: 29, y: 7, dir: 'down', if: notNight, talk: talkKeeper },
    { id: 'bj_lead', sprite: 'villager_m2', name: '八家將領班', x: 13, y: 9, dir: 'right', if: notNight, talk: talkBjLead },
    { id: 'bj_young', sprite: 'bajiajiang', name: '開臉的少年', x: 15, y: 8, dir: 'right', fixedDir: true, if: bgDay, talk: talkBjYoung },
    { id: 'bj_painter', sprite: 'villager_m', name: '畫臉師傅', x: 17, y: 8, dir: 'left', fixedDir: true, if: bgDay, talk: talkBjYoung },
    { id: 'bj_rest1', sprite: 'bajiajiang', name: '八家將', x: 12, y: 7, dir: 'down', if: bgDay, talk: talkBjSilent },
    { id: 'bj_rest2', sprite: 'bajiajiang', name: '八家將', x: 15, y: 11, dir: 'right', if: bgDay, talk: talkBjSilent },
    { id: 'qly', sprite: 'qianliyan', name: '千里眼', x: 37, y: 8, dir: 'down', fixedDir: true, if: notNight, talk: (S) => talkGiant(S, 'qly') },
    { id: 'sfe', sprite: 'shunfenger', name: '順風耳', x: 41, y: 8, dir: 'down', fixedDir: true, if: notNight, talk: (S) => talkGiant(S, 'sfe') },
    { id: 'bearer1', sprite: 'villager_m2', name: '扛神將的阿伯', x: 43, y: 8, dir: 'down', if: notNight, talk: (S) => talkBearer(S, 0) },
    { id: 'bearer2', sprite: 'villager_m2', name: '扛神將的少年', x: 44, y: 10, dir: 'left', if: notNight, talk: (S) => talkBearer(S, 1) },
    { id: 'ajin', sprite: 'villager_m', name: '阿進', x: 20, y: 9, dir: 'down', if: notNight, talk: talkAjin },
    { id: 'atian', sprite: 'child_m', name: '阿添', x: 22, y: 10, dir: 'left', if: notNight, talk: talkAtian },
    { id: 'gm', sprite: 'old_f', name: '進香的阿嬤', x: 29, y: 10, dir: 'down', if: notNight, talk: talkGrandma },
    { id: 'afu', sprite: 'child_m', name: '阿福', x: 32, y: 11, dir: 'down', wander: 2, if: bgDay, talk: talkAfu },
    { id: 'afu2', sprite: 'child_m', name: '阿福', x: 27, y: 11, dir: 'down', if: (st) => bgDawn(st) && !!st.flags.ch8_dawn_done, talk: talkAfu },
    { id: 'flagman', sprite: 'pilgrim', name: '老阿伯', x: 24, y: 21, dir: 'right', if: notNight, talk: talkFlagman },
    { id: 'husband', sprite: 'villager_m', name: '還願的丈夫', x: 21, y: 27, dir: 'right', if: notNight, talk: talkHusband },
    { id: 'wife', sprite: 'villager_f', name: '還願的妻子', x: 22, y: 27, dir: 'left', if: notNight, talk: talkWife },
    { id: 'peanut', sprite: 'shopkeeper_f', name: '花生阿嬸', x: 4, y: 19, dir: 'down', talk: talkPeanut },
    { id: 'sesame', sprite: 'merchant', name: '麻油行老闆', x: 9, y: 19, dir: 'down', talk: talkSesame },
    { id: 'incense', sprite: 'villager_m', name: '香鋪頭家', x: 14, y: 19, dir: 'down', talk: talkIncenseShop },
    { id: 'smith', sprite: 'villager_m2', name: '打鐵師傅', x: 34, y: 19, dir: 'down', talk: talkSmith },
    { id: 'xiuying', sprite: 'shopkeeper_f', name: '秀英姨', x: 24, y: 24, dir: 'right', if: notNight, talk: talkXiuying },
    { id: 'candle', sprite: 'old_m', name: '香燭攤阿伯', x: 24, y: 18, dir: 'right', talk: say1('香燭攤阿伯', ['要點的香，一把十支。拜完插好，不要亂丟火。']) },
    { id: 'tanghulu', sprite: 'villager_f', name: '糖葫蘆阿姐', x: 24, y: 30, dir: 'right', if: notNight, talk: say1('糖葫蘆阿姐', ['糖葫蘆！囝仔吃了不哭！大人吃了不累！']) },
    { id: 'water', sprite: 'villager_f2', name: '涼水攤阿姐', x: 31, y: 18, dir: 'left', talk: say1('涼水攤阿姐', ['青草茶、冬瓜茶，一碗退火！跪轎腳跪久了，喝一碗。']) },
    { id: 'boatman', sprite: 'boatman', name: '海生', x: 50, y: 25, dir: 'right', if: notNight, talk: talkBoatman },
    { id: 'g1', sprite: 'pilgrim', name: '香客', x: 27, y: 16, wander: 2, if: notNight, talk: gossip(0, '香客') },
    { id: 'g2', sprite: 'pilgrim', name: '香客', x: 12, y: 21, wander: 3, if: notNight, talk: gossip(1, '香客') },
    { id: 'g3', sprite: 'pilgrim', name: '香客', x: 40, y: 27, wander: 3, if: notNight, talk: gossip(2, '香客') },
    { id: 'g4', sprite: 'pilgrim', name: '香客', x: 20, y: 33, wander: 2, if: notNight, talk: gossip(3, '香客') },
    { id: 'g5', sprite: 'villager_f2', name: '香客阿桑', x: 36, y: 21, wander: 2, if: notNight, talk: gossip(4, '香客阿桑') },
    { id: 'g6', sprite: 'villager_f2', name: '香客阿桑', x: 28, y: 39, wander: 2, if: notNight, talk: gossip(5, '香客阿桑') },
    // night: the procession on the main street (they hold their ground; not talkative)
    { id: 'n_flag', sprite: 'pilgrim', name: '頭旗', x: 27, y: 30, dir: 'down', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: say1('頭旗', ['頭旗不能停，後面的人才知道往哪裡走。']) },
    { id: 'n_bj1', sprite: 'bajiajiang', name: '八家將', x: 26, y: 32, dir: 'down', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: talkBjSilent },
    { id: 'n_bj2', sprite: 'bajiajiang', name: '八家將', x: 29, y: 32, dir: 'down', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: talkBjSilent },
    { id: 'n_bj3', sprite: 'bajiajiang', name: '八家將', x: 26, y: 34, dir: 'down', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: talkBjSilent },
    { id: 'n_bj4', sprite: 'bajiajiang', name: '八家將', x: 29, y: 34, dir: 'down', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: talkBjSilent },
    { id: 'n_qly', sprite: 'qianliyan', name: '千里眼', x: 26, y: 36, dir: 'down', fixedDir: true, if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: (S) => talkGiant(S, 'qly') },
    { id: 'n_sfe', sprite: 'shunfenger', name: '順風耳', x: 29, y: 36, dir: 'down', fixedDir: true, if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: (S) => talkGiant(S, 'sfe') },
    { id: 'n_keeper', sprite: 'temple_keeper', name: '添壽伯', x: 26, y: 38, dir: 'up', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: say1('添壽伯', ['跟緊神轎。今晚……有點不一樣。']) },
    { id: 'n_atian', sprite: 'child_m', name: '阿添', x: 28, y: 31, dir: 'down', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: say1('阿添', ['咚、咚咚、咚——我、我在打鼓，不能講話啦！']) },
    { id: 'n_p1', sprite: 'pilgrim', name: '香客', x: 24, y: 32, dir: 'right', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: say1('香客', ['神轎要往河邊那頭繞過去。今年的鞭炮放得特別多。']) },
    { id: 'n_p2', sprite: 'villager_f2', name: '香客阿桑', x: 31, y: 33, dir: 'left', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: say1('香客阿桑', ['你們也鑽過轎腳了？那今年一定平安啦。']) },
    { id: 'n_p3', sprite: 'pilgrim', name: '香客', x: 24, y: 37, dir: 'right', if: (st) => bgNight(st) && !st.flags.ch8_surge, talk: say1('香客', ['……奇怪，河那邊怎麼這麼安靜。']) },
  ];

  // ---------------------------------------------------------------- 8-1 三月瘋媽祖
  async function ev81(S) {
    S.flag('ch8_start');
    S.quest('q_ch8_tide', 0);
    S.setPos('player', 27, 41, 'up');
    S.gather();
    await S.narrate(['三月十九日。北港。'], { veil: 1 });
    S.bgm('procession');
    firecrackers(S, 10, 2.5);
    await pan(S, 27, 10, 1.2, 1.6);
    await S.wait(0.6);
    await pan(S, 27, 36, 1.6, 1.4);
    S.cameraFollow();
    await S.move('player', 'UU');
    await S.say('xinghe:surprise', '哇——人好多！比九份中元還多！');
    await S.say('hongying:normal', '三月瘋媽祖。每年這時候，全島的香客都往這裡擠。');
    await S.say('yungui:smile', '好香……花生的味道……芝麻油的味道……還有……那邊是不是在炸什麼？');
    S.emote('yuyuan', '💧');
    await nar(S, '芋圓的鼻子一抽一抽，口水滴到了星河的鞋子上。');
    await S.say('xinghe:surprise', '喂！芋圓！那是我的鞋！');
    await S.say('yungui:smug', '牠的鼻子不夠用，肚子倒是一直都夠用。');
    await nar(S, '星河攤開手掌，看著掌心那團穩定的火。');
    await S.say('xinghe:think', '燈母說，海第一次倒流的時候，死去的人會走上岸。');
    await S.say('xinghe:serious', '這麼多人在這裡……');
    await S.say('yungui:serious', '先找船。如果能在潮水倒流之前出海，直接去澎湖——');
    await S.say('hongying:normal', '去渡頭問問看。');
    await nar(S, '紅纓看著遠處廟埕上的香煙，腳步慢了一下。');
    await S.say('hongying:sad', '……以前，每年三月，爹娘都會帶我們去鹿港天后宮。');
    await S.say('hongying:smile', '哥哥會把我扛在肩膀上，讓我看神轎。我每次都在他肩膀上睡著。');
    await S.say('xinghe:smile', '然後流口水在他頭上？');
    await S.say('hongying:angry', '……你怎麼知道？');
    await S.say('xinghe:laugh', '猜的！');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '……！');
    S.objective('到渡頭找船（主街東邊的巷子）');
  }
  async function ev81b(S) {
    await S.say('海生', '去澎湖？少年仔，你不要命了？');
    await S.say('海生', '這幾個晚上，海很怪。潮水半夜會倒著流，連老船長都不敢出港。');
    await S.say('yungui:serious', '倒著流……已經開始了？');
    await S.say('海生', '還沒有很大。可是一天比一天大。我阿公說，海倒著流，是海裡的人想回家了。');
    await S.say('xinghe:serious', '……');
    await S.say('海生', '等媽祖遶境完再說吧。媽祖出巡，海也要給面子。');
    S.flag('ch8_no_boat');
    S.objective(fl().ch8_jiajiang_seen ? '廟埕上似乎在準備起駕。找廟公說話。' : '廟埕上似乎在準備起駕。去看看吧。');
  }
  async function ev81c(S) {
    S.flag('ch8_jiajiang_seen');
    await pan(S, 15, 9, 2, 1.0);
    await nar(S, '廟埕西側，幾名少年正坐著讓人畫臉。紅、黑、白、金的油彩，一筆一筆地描。');
    S.emote('bj_lead', '♪');
    await nar(S, '八家將領班看見他們，抬手打了個招呼。');
    await S.say('八家將領班', '外地來的？要看我們開臉，站遠一點就好。');
    await S.say('八家將領班', '臉畫好以後，他們就不說話了。你們跟他們講話，他們不會回，不要見怪。');
    await S.say('xinghe:think', '為什麼不說話？');
    await S.say('八家將領班', '因為開了臉，就是替將爺走這一趟。人的話少說，將爺的事才做得好。');
    await S.say('八家將領班', '遶境的時候，我們走在神轎前面開路，壞東西要先過我們這關。');
    await S.say('yungui:normal', '失禮了。我們會注意。');
    await pan(S, 39, 8, 1.6, 1.4);
    await nar(S, '廟埕東側，兩尊巨大的神將靜靜「坐」在涼亭下：一尊綠面、手搭涼棚；一尊紅面、手攏耳朵。');
    S.emote('yuyuan', '!');
    await S.say('xinghe:surprise', '好、好大……');
    await nar(S, '芋圓仰頭盯著神將看了很久，然後默默地挺起胸，把繡球叼正。');
    await S.say('hongying:smile', '千里眼、順風耳。媽祖的左右護法。');
    await S.say('hongying:smile', '小時候我很怕祂們。哥哥騙我說，祂們看得見我偷吃糖、聽得見我偷罵他。');
    await S.say('xinghe:smile', '那不就是真的嗎？祂們是千里眼跟順風耳啊。');
    await S.say('hongying:surprise', '…………');
    await S.say('hongying:shy', '……我現在突然很想去跟祂們道歉。');
    S.cameraFollow();
    if (fl().ch8_no_boat) S.objective('廟埕上似乎在準備起駕。找廟公說話。');
  }

  // ---------------------------------------------------------------- 8-2 起駕・鑽轎腳
  async function ev82(S) {
    const m = MS();
    await S.fadeOut(0.8);
    S.flag('ch8_dusk');
    S.bgm(null);
    S.light({ ambient: 0.32, color: '#3a1830', playerR: 200 });
    S.particles(['motes', { type: 'mist', color: '#e8d0b8', alpha: 0.08 }]);
    S.setPos('player', 22, 12, 'right');
    S.setPos('hongying', 22, 13, 'right'); S.setPos('yungui', 21, 12, 'right'); S.setPos('yuyuan', 21, 13, 'right'); S.setPos('mochi', 20, 13, 'right');
    S.setPos('keeper', 28, 7, 'down');
    S.setPos('gm', 31, 11, 'up'); S.setPos('afu', 32, 11, 'up');
    for (const id of ['bj_young', 'bj_painter', 'bj_rest1', 'bj_rest2', 'qly', 'sfe', 'bearer1', 'bearer2']) S.show(id, false);
    const crowd = [[24, 12], [25, 13], [26, 12], [29, 12], [30, 13], [33, 12], [34, 13], [23, 10], [33, 10]];
    crowd.forEach(([x, y], i) => S.spawn({ id: 'c82_' + i, sprite: i % 3 === 2 ? 'villager_f2' : 'pilgrim', x, y, dir: 'up' }));
    await pan(S, 27, 9, 4, 0.2);
    await S.fadeIn(0.8);
    await nar(S, '黃昏。廟公站在廟門口，望著天色，手裡拿著一張紅紙。人群的低語漸漸靜了下來。');
    await S.say('添壽伯', '……時辰到了。');
    S.emote('keeper', '!');
    await S.wait(0.6);
    await S.say('添壽伯', '起——駕——！');
    firecrackers(S, 48, 2.4);
    S.sfx('gong');
    S.flash('#ff7040', 0.7, 0.75);
    S.shake(7, 1.4);
    S.particles(['embers', 'lanterns', { type: 'mist', color: '#f0f0f0', alpha: 0.22 }]);
    S.light({ ambient: 0.42, color: '#1a0c24', playerR: 180 });
    S.bgm('procession');
    await S.wait(1.4);
    await nar(S, '鞭炮齊響，整片廟埕被紅色的火光與白煙淹沒。鑼、鼓、嗩吶同時炸開。');
    // the procession leaves the temple
    const order = [['pc_flag', 'pilgrim', 27], ['pc_music', 'villager_m', 28], ['pc_bj1', 'bajiajiang', 27], ['pc_bj2', 'bajiajiang', 28],
      ['pc_bj3', 'bajiajiang', 27], ['pc_bj4', 'bajiajiang', 28], ['pc_qly', 'qianliyan', 27], ['pc_sfe', 'shunfenger', 28]];
    for (let i = 0; i < order.length; i++) {
      const [id, sprite, x] = order[i];
      S.spawn({ id, sprite, x, y: 5, dir: 'down' });
      S.move(id, 'D'.repeat(Math.max(3, 9 - (i >> 1) * 2)), { wait: false, speed: id === 'pc_qly' || id === 'pc_sfe' ? 1.4 : 1.9 });
      if (i % 2 === 1) await S.wait(0.9);
    }
    await nar(S, '頭旗先出廟門，接著是北管陣、八家將——已開臉，踏著沉穩的步伐，手持刑具，兩兩交錯。');
    await nar(S, '接著是千里眼、順風耳兩尊神將，搖著肩膀、甩著長袖，威風凜凜地走出來。');
    const pal = addObj(m, { t: 'palanquin', x: 27, y: 4, solid: false, alpha: 0 });
    G.Tweens.to(pal, { alpha: 1 }, 0.8, 'linear');
    await G.Tweens.to(pal, { y: 7 }, 2.6, 'inOutQuad');
    await nar(S, '最後，神轎出廟門。八名轎夫扛著，轎頂的流蘇在煙中晃動。人群同時彎腰合掌。');
    for (let i = 0; i < crowd.length; i++) S.emote('c82_' + i, '…', 2);
    await S.say('xinghe:surprise', '……');
    await S.say('yungui:normal', '（小聲）這不是戲。你看那些人的臉。');
    await nar(S, '人群中，有人在哭，有人在笑，有人在念念有詞。進香的阿嬤緊緊抓著阿福的手，合掌低頭。');
    await S.say('添壽伯', '要鑽轎腳的，跪到路邊來！');
    // --- 鑽轎腳 on the main street
    await S.fadeOut(0.8);
    for (const [id] of order) S.remove(id);
    for (let i = 0; i < crowd.length; i++) S.remove('c82_' + i);
    rmObj(m, pal);
    const kneel = [[25, 17], [25, 18], [25, 23], [25, 24], [25, 25], [25, 26], [30, 17], [30, 18], [30, 19], [30, 20], [30, 22], [30, 23], [30, 24]];
    kneel.forEach(([x, y], i) => S.spawn({ id: 'k82_' + i, sprite: ['pilgrim', 'villager_f2', 'old_m', 'villager_f'][i % 4], x, y, dir: x === 25 ? 'right' : 'left' }));
    S.setPos('player', 25, 20, 'right'); S.setPos('hongying', 25, 21, 'right'); S.setPos('yungui', 25, 19, 'right'); S.setPos('yuyuan', 25, 22, 'right'); S.setPos('mochi', 24, 22, 'right');
    S.setPos('keeper', 27, 21, 'left');
    S.show('gm', false); S.show('afu', false);
    await pan(S, 27, 20, 6, 0.3);
    await S.fadeIn(0.8);
    await nar(S, '主街兩側，香客們一個接一個跪下，排成長長的一列，額頭貼著地面。');
    await S.say('hongying:normal', '……我們也去吧。');
    await S.say('xinghe:think', '我可以嗎？我又不是這裡的人……');
    S.face('keeper', 'player');
    await S.say('添壽伯', '少年仔，媽祖婆不問你是哪裡的人。祂只看你有沒有誠心。');
    await S.say('添壽伯', '跪好，頭低下來，心裡想著你要求的事。神轎從頭頂過去，就好了。');
    await S.move('keeper', 'RR', { speed: 2.2 });
    S.face('keeper', 'left');
    await nar(S, '眾人跪入人龍中。芋圓也學著趴下——趴成一顆圓滾滾的球，屁股翹得老高。');
    await S.say('yungui:smug', '（小聲）芋圓，頭低下來，屁股放下去。');
    S.emote('yuyuan', '…');
    await nar(S, '芋圓看了雲歸一眼，一動也不動。……大概是在調整姿勢。');
    drumRoll(16, 0.24, 0.4);
    const pal2 = addObj(m, { t: 'palanquin', x: 24.5, y: 12, solid: false, over: true });
    await pan(S, 25, 16, 1.2, 0.8);
    await nar(S, '鑼鼓聲逼近。神轎的影子籠罩過來，從跪著的人龍上方緩緩經過。');
    const pass = G.Tweens.to(pal2, { y: 25 }, 10, 'linear');
    const cam = setInterval(() => { const mm = MS(); if (mm && mm === m) { mm.cam.tx = pal2.x * T + T - G.W / 2; mm.cam.ty = (pal2.y + 1) * T - G.H / 2; mm.cam.speed = 2; } }, 50);
    try {
      await heart(S, 'xinghe', '……媽祖婆，我不太會拜拜。可是如果您聽得見——');
      await heart(S, 'xinghe', '請讓白芷平安。請讓她，不要再一個人發光了。');
      await heart(S, 'hongying', '……讓哥哥回頭。不管他做了什麼。');
      await heart(S, 'hongying', '讓他回頭，讓我再見他一次就好。');
      await heart(S, 'yungui', '師父已經走了。我不求什麼了。');
      await heart(S, 'yungui', '……只求路上的那些人，都能像他一樣，走得安心。');
      await heart(S, '', '人龍旁邊，麻糬沒有低頭。她端正地坐著，望著海的方向，像在等一個人回來。');
      await pass;
    } finally { clearInterval(cam); }
    G.Tweens.to(pal2, { alpha: 0 }, 1.2, 'linear').then(() => rmObj(m, pal2));
    await nar(S, '神轎過去了。眾人抬起頭。');
    S.cameraFollow();
    S.sfx('wind');
    S.particles(['embers', 'wind', { type: 'mist', color: '#f0f0f0', alpha: 0.18 }]);
    await nar(S, '一陣風忽然從海的方向吹來，又迴轉——天公爐裡的香煙，全部斜斜地飄向西方，飄向海。');
    for (let i = 0; i < kneel.length; i += 2) S.emote('k82_' + i, '!');
    await nar(S, '人群一陣低聲驚呼。');
    await S.move('keeper', 'LL', { speed: 2.2 });
    S.face('keeper', 'player');
    await S.say('添壽伯', '……香煙往海邊去了。');
    await S.say('添壽伯', '媽祖婆今晚，要去海邊看看。');
    await nar(S, '廟公走過來，將小小的紅色香火袋放在眾人手裡。');
    await S.say('添壽伯', '拿著。這是過了香火的。今晚……說不定用得到。');
    await S.give('c8_xianghuo', 3);
    await nar(S, '廟公又拿了兩條紅線，把兩個小小的香火袋，綁在芋圓和麻糬的脖子上。芋圓的就掛在那顆繡球旁邊。');
    S.emote('yuyuan', '♪');
    await S.say('xinghe:smile', '……你看起來好得意。');
    await S.say('xinghe:serious', '謝謝阿伯。');
    S.flag('ch8_qijia'); S.flag('ch8_zuanjiao');
    S.quest('q_ch8_tide', 2);
    await S.fadeOut(0.8);
    for (let i = 0; i < kneel.length; i++) S.remove('k82_' + i);
    S.objective('跟上遶境隊伍（主街南段）');
    await S.warp('beigang', 27, 14, 'down', { reload: true, fade: 0.01 });
    await S.say('yungui:normal', '遶境隊伍往主街南邊去了。要買什麼、要休息，趁現在。');
  }

  // ---------------------------------------------------------------- 8-3a 潮來
  async function ev83a(S) {
    const m = MS();
    S.gather();
    await nar(S, '夜。遶境隊伍在主街上緩緩前進，鞭炮一陣接一陣。');
    firecrackers(S, 30, 2.0);
    await S.wait(1.4);
    S.bgm(null, { fade: 0.1 });
    await nar(S, '忽然，所有的鞭炮聲同時停了。不是熄了——是聲音被吞掉了。');
    S.sfx('splash'); S.sfx('water', 0.5); S.sfx('splash', 0.9);
    await nar(S, '東邊，北港溪的方向，傳來嘩啦啦的水聲。那聲音不對：是從下游往上游的方向。');
    await S.say('海生', '（遠處）溪……溪倒著流了！海水灌進來了——！');
    S.shake(12, 1.4);
    S.light({ ambient: 0.58, color: '#061430', playerR: 180 });
    S.particles(['motes', { type: 'mist', color: '#9ab8e0', alpha: 0.16 }]);
    await pan(S, 50, 26, 2.2, 1.4);
    const ghosts = [['gh1', 'ghost_m', 53, 22], ['gh2', 'fisherman', 53, 24], ['gh3', 'ghost_f', 52, 26], ['gh4', 'ghost_child', 53, 28], ['gh5', 'ghost_m', 52, 29]];
    for (const [id, sprite, x, y] of ghosts) { const a = S.spawn({ id, sprite, x, y, dir: 'left', ghost: true }); a.alpha = 0; G.Tweens.to(a, { alpha: 1 }, 1.2, 'linear'); }
    await nar(S, '北港溪的水面泛起藍黑色的光，水流逆轉，從河口往上游奔湧。水面上浮起一盞盞藍色的燈——方向是往岸上。');
    for (const [id] of ghosts) S.move(id, 'LL', { wait: false, speed: 1.2 });
    await nar(S, '燈下，有人影。濕透的人影，一個接一個，從水裡站起來，往岸上走。');
    await nar(S, '有人穿著很舊的唐山衫。有人是漁夫打扮。有人是孩子。他們的眼睛是空的，嘴裡吐著水。');
    await pan(S, 27, 29, 3, 0.9);
    await S.say('香客', '鬼……水鬼！是水鬼上岸了——！');
    for (const id of ['n_p1', 'n_p2', 'n_p3']) { S.emote(id, '!'); }
    S.move('n_p1', 'UUU', { wait: false, speed: 3.5 }); S.move('n_p2', 'UUU', { wait: false, speed: 3.5 }); S.move('n_p3', 'LL', { wait: false, speed: 3.5 });
    await nar(S, '人群尖叫，四散奔逃。');
    S.bgm('chaos');
    await S.say('yungui:serious', '來了。燈母說的，海第一次倒流——');
    await S.say('hongying:serious', '星河，保護香客！');
    await S.say('xinghe:serious', '嗯！');
    for (const id of ['n_bj1', 'n_bj2', 'n_bj3', 'n_bj4']) S.face(id, 'right');
    drumRoll(20, 0.2, 0.5);
    await nar(S, '隊伍前方，八家將的陣型沒有亂。他們站定，踏步，手中的刑具一齊舉起。');
    S.emote('n_atian', '💧');
    await nar(S, '北管的鼓聲重新響起——是小鼓手阿添，他咬著牙，繼續打。');
    S.face('n_qly', 'right'); S.face('n_sfe', 'right');
    await nar(S, '千里眼、順風耳兩尊神將，緩緩轉身，面向河的方向，一動不動地立在神轎前面。');
    // the drowned come up lane B and stop ten steps short
    for (const [id] of ghosts) { const a = m.actor(id); if (a) a.queue = []; }
    ghosts.forEach(([id], i) => S.setPos(id, 46 + (i % 2), 26 + (i % 3), 'left'));
    await pan(S, 38, 27, 2.4, 0.6);
    for (const [id] of ghosts) S.move(id, 'LLLLLL', { wait: false, speed: 1.3 });
    await S.wait(1.5);
    await nar(S, '第一批溺死者走到隊伍前十步，停住了。它們看著神轎，看著八家將，搖晃著，不再往前。');
    await pan(S, 27, 30, 3, 0.6);
    await S.say('添壽伯', '（大喊）大家不要亂！不要亂！媽祖在這裡！');
    await S.say('添壽伯', '往神轎後面躲！神轎在哪裡，哪裡就安全！');
    await S.say('yungui:surprise', '……它們不敢靠近神轎。');
    await S.say('yungui:serious', '可是兩邊——兩邊的巷子，還有河邊的人！');
    await S.say('xinghe:serious', '我們去！');
    S.cameraFollow();
    await S.battle('t_c8_street', { bgmAfter: 'chaos' });
    for (const [id] of ghosts) S.remove(id);
    S.setPos('player', 28, 28, 'down'); S.gather();
    S.face('n_bj2', 'up');
    await S.wait(0.5);
    await nar(S, '戰後。一名八家將——已開臉，不說話——轉頭看了星河一眼，用刑具指向東邊河岸，然後轉回去，繼續守陣。');
    S.face('n_bj2', 'right'); S.emote('n_bj2', '!');
    await S.wait(0.8);
    S.face('n_bj2', 'down');
    await S.say('hongying:serious', '他在告訴我們，河邊還有人。');
    S.spawn({ id: 'gm83', sprite: 'old_f', x: 30, y: 30, dir: 'up' });
    S.spawn({ id: 'gm83b', sprite: 'villager_f2', x: 31, y: 30, dir: 'up' });
    await S.move('n_keeper', 'UU', { speed: 3 });
    await S.say('添壽伯', '（追上來）少年仔！剛才有五、六個香客往河邊跑去了——還有那個阿福！');
    await S.say('進香的阿嬤', '（被人扶著）阿福……我的阿福……誰看到我的阿福……');
    await S.say('xinghe:serious', '阿嬤，我們去找。');
    await S.say('添壽伯', '少年仔，河邊的人，每一個都要找到喔。水是不等人的。');
    S.flag('ch8_surge');
    S.flag('ch8_tide_base', G.state.battles);
    S.flag('ch8_tide', 0); S.flag('ch8_saved', 0);
    S.quest('q_ch8_tide', 2);
    S.quest('q_ch8_pilgrims', 0);
    S.objective('救出受困在北港溪邊的香客');
    await S.warp('beigang_river', 9, 9, 'right');
  }

  // ---------------------------------------------------------------- 8-3d 黎明・阿福與阿嬤
  async function ev83d(S) {
    const f = fl();
    S.flag('ch8_dawn_done');
    const win = SAVED(G.state) >= 5 && !f.ch8_tide_fail;
    S.bgm('pingxi');
    S.setPos('gm', 28, 10, 'down');
    S.show('afu2', false);
    const saved = [['flagman', 24, 11], ['husband', 33, 11], ['wife', 34, 11], ['atian', 22, 10], ['xiuying', 31, 12]];
    for (const [id, x, y] of saved) S.setPos(id, x, y, 'down');
    S.setPos('player', 27, 16, 'up'); S.gather();
    S.setPos('hongying', 26, 16, 'up'); S.setPos('yungui', 28, 16, 'up'); S.setPos('yuyuan', 27, 17, 'up'); S.setPos('mochi', 26, 17, 'up');
    await pan(S, 27, 12, 6, 0.2);
    await nar(S, '黎明。廟埕上，香客們互相扶持，有人在哭，有人在笑。');
    let afu;
    if (win) {
      afu = S.spawn({ id: 'afu83', sprite: 'child_m', x: 27, y: 15, dir: 'up' });
      await nar(S, '星河牽著阿福走進廟埕。');
      S.move('afu83', 'UU', { wait: false, speed: 2 });
      await S.move('player', 'UU', { speed: 2 });
    } else {
      afu = S.spawn({ id: 'afu83', sprite: 'child_m', x: 31, y: 15, dir: 'up' });
      S.spawn({ id: 'bj83', sprite: 'bajiajiang', x: 32, y: 15, dir: 'up' });
      await nar(S, '一名八家將牽著阿福走進廟埕。他的油彩已經被海水沖花了。');
      S.move('afu83', 'UU', { wait: false, speed: 2 });
      await S.move('bj83', 'UU', { speed: 2 });
    }
    await S.say('進香的阿嬤', '……阿福？');
    await S.say('阿福', '阿嬤——！');
    await S.walkTo('afu83', 28, 11, { speed: 3.4 });
    S.face('afu83', 'up');
    await nar(S, '阿福衝過去，撲進阿嬤懷裡。阿嬤跪在地上，緊緊抱著他，全身都在發抖。');
    await S.say('進香的阿嬤', '你這個夭壽囝仔……叫你不要亂跑……叫你不要亂跑……');
    await S.say('進香的阿嬤', '阿嬤走了七天的路……就是為了你……你要是……');
    await S.say('阿福', '阿嬤……是千里眼救我的……祂一直站著……都沒有走……');
    await S.say('進香的阿嬤', '……媽祖婆……感謝媽祖婆……');
    if (win) {
      await nar(S, '阿嬤抬起頭，看見星河一行人。她放開阿福，朝著他們就要跪下。');
      await S.say('xinghe:surprise', '阿嬤，不要不要！');
      await S.move('player', 'U', { speed: 3 });
      await nar(S, '星河趕緊扶住她。');
      await S.say('進香的阿嬤', '少年仔……我這條老命不值錢，可是這個囝仔……');
      await S.say('xinghe:smile', '阿嬤，您走了七天的路來還願。媽祖婆一定都看到了。');
      await S.say('xinghe:smile', '我們只是剛好路過，幫忙抱一下而已。');
      await S.say('阿福', '哥哥！下次我也要幫你抱！');
      await S.say('xinghe:laugh', '好啊！等你長大，換你抱我！');
      for (const [id] of saved) S.emote(id, '♥');
      await nar(S, '廟埕四周，被救出的香客們——扛旗的老阿伯、年輕夫妻、打鼓的阿添、煎盤粿的秀英姨——都在。他們看著這一幕，有人擦眼淚，有人笑出聲。');
      await nar(S, '每一個人的胸口，都浮起一點小小的光。光點匯在一起，飄到星河的掌心，融進那團心火裡。');
      S.flag('ch8_heartlamp_pilgrims');
      S.quest('q_ch8_pilgrims', 'done');
      await S.lantern('lantern_beigang_pilgrims', '北港的香客');
      await S.say('秀英姨', '好了好了！大家都餓了吧！煎盤粿——免錢！');
      S.emote('yuyuan', '!');
      await S.say('yungui:surprise', '免錢？！');
      await S.say('xinghe:smile', '……芋圓，你剛才有守著那鍋粿漿。這是你應得的。');
      S.setPos('keeper', 29, 8, 'down');
      await S.say('添壽伯', '少年仔，這是廟裡的媽祖餅，過了香火的。路上帶著。');
      await S.give('c8_mazubing', 5);
    } else {
      await nar(S, '星河一行人站在廟埕邊，遠遠看著。');
      await S.say('hongying:sad', '……還好他沒事。');
      await S.say('xinghe:sad', '嗯。只是……我們晚了一步。');
      await S.say('yungui:normal', '人都活著。這比什麼都重要。走吧。');
      S.quest('q_ch8_pilgrims', 'done');
    }
    S.remove('afu83'); S.remove('bj83');
    S.objective('渡頭那邊好像有什麼。去看看。');
  }

  // ---------------------------------------------------------------- 8-3e 線索
  async function ev83e(S) {
    S.flag('ch8_clue_anping');
    S.bgm(null);
    S.spawn({ id: 'drowned83', sprite: 'ghost_m', x: 52, y: 24, dir: 'left', ghost: true });
    await pan(S, 51, 24, 2.4, 0.8);
    await nar(S, '河岸邊，退潮後的泥灘上，躺著一個還沒走回海裡的溺死者。他的身體已經半透明，嘴唇在動。');
    await S.say('xinghe:serious', '……他在說話。');
    await nar(S, '星河蹲下。雲歸從背後護著。');
    await S.say('溺死者', '……安平……');
    await S.say('溺死者', '觀潮台……燈……有人在點燈……叫我們回去……');
    await S.say('溺死者', '……一個年輕人……拿著劍……他說……爹……娘……');
    S.sfx('splash');
    await S.fadeActor('drowned83', 0, 1.4);
    S.remove('drowned83');
    await nar(S, '溺死者化成一灘海水，滲進泥裡。');
    await S.say('hongying:surprise', '………………');
    await S.say('hongying:serious', '……哥。');
    await S.say('yungui:serious', '安平。觀潮台在舊城的遺址上。');
    await S.say('xinghe:serious', '走。');
    S.cameraFollow();
    S.bgm('procession');
    S.quest('q_ch8_tide', 3);
    S.objective('整備好之後，從主街南邊出發，前往安平');
  }

  async function leaveBeigang(S) {
    const f = fl();
    if (!f.ch8_clue_anping) {
      await S.say('yungui:normal', f.ch8_qijia ? '香客們還在河邊……現在不能走。' : '還沒找到船呢。先去渡頭問問吧。');
      await S.move('player', 'U');
      return;
    }
    const c = await S.choice(['出發前往安平', '再整備一下'], { cancel: 1 });
    if (c !== 0) { await S.move('player', 'U'); return; }
    await S.say('hongying:serious', '……走吧。');
    await S.travel('beigang', 'tainan', { label: '沿著海線往南……' });
    await S.narrate(['兩日後。府城外，安平。'], { veil: 1 });
    S.quest('q_ch8_tide', 3);
    await S.warp('anping', 41, 17, 'left');
  }

  G.Maps.define('beigang', {
    name: '北港', subtitle: (st) => (bgNight(st) ? '迎媽祖・遶境之夜' : '朝天宮前的港街'),
    place: 'beigang',
    bgm: (st) => (bgNight(st) ? 'procession' : bgDawn(st) && !st.flags.ch8_clue_anping ? 'pingxi' : 'procession'),
    start: [27, 41],
    light: (st) => (bgNight(st) ? { ambient: 0.48, color: '#14081e', playerR: 190, glow: 0.3 }
      : bgDawn(st) && !st.flags.ch8_clue_anping ? { ambient: 0.18, color: '#2a2440', tint: 'rgba(255,190,140,0.12)' } : { ambient: 0.05, color: '#201010' }),
    particles: (st) => (bgNight(st) ? ['embers', 'lanterns', { type: 'mist', color: '#e8e8e8', alpha: 0.1 }]
      : bgDawn(st) ? ['motes', { type: 'mist', color: '#f0e0d0', alpha: 0.08 }] : ['motes', { type: 'petals', density: 0.4 }]),
    lights: (st) => (bgNight(st) ? BG_LIGHTS_NIGHT : []),
    tiles: beigangTiles,
    objects: BG_OBJECTS,
    pass: [{ x: 27, y: 5, w: 2, h: 1, solid: true }],
    chests: [
      { id: 'c8_bg_inn', x: 8, y: 40, gold: 1500, item: 'xumingsan', n: 3 },
      { id: 'c8_bg_alley', x: 2, y: 24, gold: 1500, item: 'c8_jinxiang' },
    ],
    npcs: BG_NPCS,
    warps: [
      { x: 5, y: 37, to: 'beigang_inn', tx: 7, ty: 10, tdir: 'up', door: true },
      { x: 49, y: 0, w: 3, h: 1, to: 'beigang_river', tx: 3, ty: 5, tdir: 'right', if: bgDawn },
    ],
    events: [
      { id: 'intro', trigger: 'auto', if: (st) => !st.flags.ch8_start, run: ev81 },
      { id: 'jiajiang', trigger: 'touch', x: 9, y: 12, w: 38, h: 2, if: (st) => !!st.flags.ch8_start && !st.flags.ch8_jiajiang_seen, run: ev81c },
      { id: 'surge', trigger: 'touch', x: 23, y: 24, w: 10, h: 5, if: (st) => !!st.flags.ch8_qijia && !st.flags.ch8_surge, run: ev83a },
      { id: 'dawn', trigger: 'auto', if: (st) => bgDawn(st) && !st.flags.ch8_dawn_done, run: ev83d },
      { id: 'clue', trigger: 'touch', x: 49, y: 22, w: 3, h: 5, if: (st) => !!st.flags.ch8_dawn_done && !st.flags.ch8_clue_anping, run: ev83e },
      { id: 'south_exit', trigger: 'touch', x: 25, y: 43, w: 6, h: 1, if: (st) => !!st.flags.ch8_start, run: leaveBeigang },
      {
        id: 'temple_door', trigger: 'action', x: 27, y: 5, w: 2, h: 1, label: '參拜',
        run: async (S) => {
          await S.say('', '朝天宮的正殿裡香煙繚繞，神龕前的燭火一盞接著一盞，看不清深處。');
          await S.say('', '香客們在殿前合掌，低聲說著自己的事。你也合起了雙手。');
          if (bgNight(G.state)) await S.say('', '殿裡空了一半——神轎已經出巡了。');
        },
      },
    ],
  });

  // ---------------------------------------------------------------- 進香客棧
  function innTiles() {
    const g = mk(16, 12, 'W');
    g.rect(1, 2, 14, 9, '_');
    g.rect(7, 11, 2, 1, '_');
    return g.rows();
  }
  G.Maps.define('beigang_inn', {
    name: '進香客棧', subtitle: '北港', place: 'beigang',
    bgm: 'procession',
    start: [7, 10],
    light: { ambient: 0.35, color: '#1a1008', playerR: 160 },
    lights: [{ x: 3, y: 3, r: 200, color: '#ffb060', flicker: 0.2 }, { x: 12, y: 3, r: 180, color: '#ff9040', flicker: 0.4 }, { x: 8, y: 8, r: 220, color: '#ffc880', flicker: 0.2 }],
    particles: ['dust'],
    tiles: innTiles,
    objects: [
      { t: 'counter', x: 2, y: 4, w: 3 }, { t: 'shelf_lanterns', x: 1, y: 2, w: 2 }, { t: 'stove', x: 12, y: 2 }, { t: 'pot', x: 14, y: 2 },
      { t: 'bed_mat', x: 6, y: 2 }, { t: 'bed_mat', x: 7, y: 2 }, { t: 'bed_mat', x: 8, y: 2 }, { t: 'bed_mat', x: 9, y: 2 },
      { t: 'bed_mat', x: 11, y: 6 }, { t: 'bed_mat', x: 12, y: 6 }, { t: 'bed_mat', x: 13, y: 6 }, { t: 'bed_mat', x: 14, y: 6 },
      { t: 'table', x: 3, y: 8 }, { t: 'chair', x: 2, y: 8 }, { t: 'chair', x: 4, y: 8 }, { t: 'basket', x: 1, y: 10 }, { t: 'jar', x: 14, y: 10 },
    ],
    npcs: [
      {
        id: 'innkeeper', sprite: 'shopkeeper_f', name: '客棧老闆娘', x: 3, y: 3, dir: 'down',
        talk: async (S) => {
          await S.say('客棧老闆娘', '客官，三月正旺，只剩柴房了，柴房也是房喔！');
          const ok = await S.inn(80, { who: '客棧老闆娘' });
          if (ok) await S.say('', '一行人擠在柴房裡過了一夜。芋圓睡在雲歸臉上。');
        },
      },
      { id: 'inn_p1', sprite: 'pilgrim', name: '香客', x: 7, y: 6, dir: 'down', talk: say1('香客', ['通鋪擠是擠，可是大家都是來拜媽祖的，擠一擠就是一家人。']) },
      { id: 'inn_p2', sprite: 'old_f', name: '香客阿嬤', x: 10, y: 9, dir: 'left', talk: say1('香客阿嬤', ['我膝蓋不好，跪轎腳要人扶。可是今年還是要跪，跪了心才安。']) },
      { id: 'inn_p3', sprite: 'villager_m', name: '香客', x: 12, y: 9, dir: 'up', wander: 1, talk: say1('香客', ['（打呼）……媽祖婆……再一碗鴨肉羹……']) },
    ],
    warps: [{ x: 7, y: 11, w: 2, h: 1, to: 'beigang', tx: 5, ty: 38, tdir: 'down', door: true }],
  });

  // ================================================================================== floating light orbs (shared)
  // m.c8orbs: [{x, y (px), vx, vy, r, color, life, t}] — drawn additively in drawOver, also emitted as lights
  function orb(m, x, y, o = {}) {
    m.c8orbs = m.c8orbs || [];
    const q = Object.assign({ x: x * T + T / 2, y: y * T + T / 2 - 30, vx: 0, vy: -12, r: 10, color: '#ffd890', life: 6, t: 0, lightR: 90 }, o);
    m.c8orbs.push(q);
    return q;
  }
  function drawOrbs(ctx, t, m) {
    if (!m.c8orbs || !m.c8orbs.length) return;
    const dt = 1 / 60;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const q of m.c8orbs) {
      q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt + Math.sin(q.t * 2 + q.x) * 0.15;
      const a = Math.min(1, q.t / 0.8, Math.max(0, (q.life - q.t) / 1.2));
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 3);
      g.addColorStop(0, U.rgba('#ffffff', 0.9 * a)); g.addColorStop(0.25, U.rgba(q.color, 0.8 * a)); g.addColorStop(1, U.rgba(q.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(q.x - q.r * 3, q.y - q.r * 3, q.r * 6, q.r * 6);
    }
    ctx.restore();
    m.c8orbs = m.c8orbs.filter((q) => q.t < q.life);
  }
  const orbLights = (m) => (m && m.c8orbs ? m.c8orbs.map((q) => ({ x: q.x / T - 0.5, y: q.y / T - 0.5, r: q.lightR, color: q.color, flicker: 0.1 })) : []);

  // ================================================================================== 北港溪口 beigang_river (P8-1)
  const LANE = (tide) => (tide >= 7 ? 'r' : tide >= 3 ? '-' : ':');
  function riverTiles(st) {
    const tide = st.flags.ch8_surge && !st.flags.ch8_surge_end ? TIDE(st) : 0;
    const g = mk(48, 40, '.');
    g.rect(0, 0, 14, 14, '#');                 // 街口・安全區
    g.rect(3, 14, 3, 21, '=');                 // 西岸路
    g.rect(3, 34, 38, 3, '=');                 // 南岸路
    g.rect(14, 3, 6, 2, '=');                  // 往北橋
    g.rect(6, 17, 8, 2, '=');                  // 往河岸小巷
    g.rect(31, 1, 13, 9, 's');                 // 沙洲
    g.rect(26, 3, 6, 2, '=');
    g.rect(28, 5, 2, 12, '=');
    g.rect(26, 16, 2, 2, '=');
    g.rect(30, 28, 18, 12, 's');               // 河口灘地
    g.rect(20, 0, 6, 28, 'r');                 // 北港溪（逆流）
    g.rect(20, 22, 28, 6, 'r');
    g.rect(44, 14, 4, 18, 'w');                // 出海口
    g.rect(36, 28, 6, 2, '-');                 // 河口淺灘
    g.rect(20, 3, 6, 2, 'b');                  // 北橋
    g.rect(20, 16, 6, 2, tide >= 5 ? 'r' : 'b');  // 南橋
    g.rect(14, 14, 6, 8, LANE(tide));          // ▒ 河岸小巷
    g.rect(10, 29, 9, 4, LANE(tide));          // ▒ 河彎小巷
    g.rect(30, 28, 2, 1, 'k');                 // 斷掉的碼頭
    return g.rows();
  }
  const RV_OBJECTS = [
    // 遶境隊伍（安全區）
    { t: 'palanquin', x: 2, y: 2, still: true }, { t: 'firecracker_tower', x: 1, y: 9 }, { t: 'firecracker_tower', x: 6, y: 0 },
    { t: 'pilgrim_flag', x: 1, y: 6, text: '進香', color: '#f1c232' }, { t: 'pilgrim_flag', x: 10, y: 0, text: '北港', color: '#d8382a' },
    { t: 'incense_burner', x: 13, y: 1 }, { t: 'incense_burner', x: 13, y: 4 }, { t: 'incense_burner', x: 13, y: 7 }, { t: 'incense_burner', x: 13, y: 10 },
    { t: 'pilgrim_flag', x: 13, y: 2, text: '香', color: '#e8b030' }, { t: 'pilgrim_flag', x: 13, y: 5, text: '平安', color: '#d8382a' },
    { t: 'pilgrim_flag', x: 13, y: 8, text: '香', color: '#e8b030' }, { t: 'pilgrim_flag', x: 13, y: 11, text: '平安', color: '#d8382a' },
    { t: 'lantern_string', x: 3, y: 5, w: 6, v: 1 }, { t: 'barrel', x: 0, y: 12 }, { t: 'basket', x: 12, y: 13 },
    // houses along the west bank
    { t: 'house_jiufen', x: 14, y: 9, lit: false }, { t: 'house_jiufen', x: 7, y: 14, lit: false }, { t: 'house_jiufen', x: 6, y: 29, lit: false },
    { t: 'cart', x: 8, y: 23 }, { t: 'stall', x: 16, y: 20, text: '煎盤粿' }, { t: 'boat_small', x: 14, y: 31 },
    { t: 'barrel', x: 15, y: 15 }, { t: 'jar', x: 18, y: 14 },
    // 沙洲
    { t: 'crate', x: 38, y: 5 }, { t: 'drum', x: 39, y: 4 }, { t: 'driftwood', x: 34, y: 8 }, { t: 'reeds', x: 32, y: 2 }, { t: 'reeds', x: 43, y: 7 },
    { t: 'rock_small', x: 42, y: 2 }, { t: 'reeds', x: 30, y: 9 },
    // NE block
    { t: 'tree_pine', x: 27, y: 9 }, { t: 'tree_pine', x: 31, y: 12 }, { t: 'tree_banyan', x: 36, y: 15 }, { t: 'bush', x: 41, y: 12 },
    { t: 'pilgrim_flag', x: 26, y: 6, text: '進香', color: '#f1c232', if: (st) => !st.flags.ch8_saved_1 },
    // 漁村
    { t: 'house_jiufen', x: 21, y: 30, lit: false }, { t: 'house_jiufen', x: 26, y: 30, lit: false }, { t: 'house_jiufen', x: 32, y: 37, lit: false },
    { t: 'house_jiufen', x: 37, y: 37, lit: false }, { t: 'fishing_net', x: 29, y: 33 }, { t: 'boat_small', x: 33, y: 31 }, { t: 'dock_post', x: 31, y: 28 },
    { t: 'barrel', x: 25, y: 33 }, { t: 'jar', x: 36, y: 33 },
    // trees & reeds on the west bank
    { t: 'tree_pine', x: 1, y: 16 }, { t: 'tree_pine', x: 1, y: 22 }, { t: 'tree_banyan', x: 0, y: 27 }, { t: 'tree_pine', x: 2, y: 38 },
    { t: 'reeds', x: 19, y: 12 }, { t: 'reeds', x: 19, y: 23 }, { t: 'reeds', x: 18, y: 27 }, { t: 'tallgrass', x: 11, y: 21 }, { t: 'tallgrass', x: 6, y: 31 },
    { t: 'reeds', x: 29, y: 28 }, { t: 'bush', x: 14, y: 38 }, { t: 'bush', x: 21, y: 38 }, { t: 'tree_pine', x: 27, y: 38 },
    { t: 'reeds', x: 19, y: 1 }, { t: 'reeds', x: 19, y: 7 }, { t: 'reeds', x: 26, y: 1 }, { t: 'reeds', x: 26, y: 8 }, { t: 'reeds', x: 26, y: 12 },
    { t: 'reeds', x: 27, y: 19 }, { t: 'reeds', x: 30, y: 21 }, { t: 'reeds', x: 36, y: 21 }, { t: 'reeds', x: 41, y: 20 }, { t: 'reeds', x: 22, y: 28 },
    { t: 'rock_small', x: 12, y: 24 }, { t: 'rock_small', x: 33, y: 18 }, { t: 'tallgrass', x: 9, y: 33 }, { t: 'tallgrass', x: 24, y: 29 },
    { t: 'driftwood', x: 40, y: 33 }, { t: 'seaweed', x: 43, y: 36 }, { t: 'seaweed', x: 38, y: 38 }, { t: 'rock_small', x: 46, y: 38 },
    { t: 'tree_pine', x: 10, y: 37 }, { t: 'tree_pine', x: 16, y: 6 }, { t: 'bush', x: 2, y: 19 },
  ];
  const RV_LIGHTS = [
    { x: 4, y: 3, r: 260, color: '#ffb060', flicker: 0.3 }, { x: 9, y: 6, r: 220, color: '#ff8a40', flicker: 0.4 }, { x: 13, y: 6, r: 200, color: '#ffcf8a', flicker: 0.3 },
    { x: 22, y: 6, r: 150, color: '#3a7aff', flicker: 0.2 }, { x: 23, y: 13, r: 150, color: '#3a7aff', flicker: 0.2 }, { x: 22, y: 20, r: 150, color: '#3a7aff', flicker: 0.2 },
    { x: 28, y: 25, r: 160, color: '#3a7aff', flicker: 0.2 }, { x: 36, y: 24, r: 160, color: '#3a7aff', flicker: 0.2 }, { x: 43, y: 25, r: 180, color: '#4a6aff', flicker: 0.2 },
    { x: 45, y: 34, r: 220, color: '#6a4aff', flicker: 0.3 },
  ];
  const PILGRIM_SAFE = { 1: [2, 12], 2: [4, 12], 3: [9, 8], 4: [10, 12], 5: [7, 12] };

  // ---------------------------------------------------------------- tide HUD & mechanics
  function drawTideGauge(ctx, t) {
    const st = G.state;
    const tide = TIDE(st), n = SAVED(st);
    const w = 236, h = 74, x = G.W - w - 24, y = 70;
    ctx.save();
    G.UI.plate(ctx, x, y, w, h, 0.62, 12);
    G.Render.text(ctx, '潮位', x + 14, y + 8, { size: 19, color: '#cfe0ff' });
    for (let i = 0; i < 8; i++) {
      const bx = x + 64 + i * 20, by = y + 12, filled = i < tide;
      const col = i < 3 ? '#4a9aff' : i < 5 ? '#6a7aff' : i < 7 ? '#c06aff' : '#ff5a6a';
      ctx.fillStyle = filled ? col : 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.roundRect(bx, by + (filled ? Math.sin(t * 3 + i) * 1.5 : 0), 15, 20, 4); ctx.fill();
    }
    G.Render.text(ctx, `已救出 ${n}／5`, x + 14, y + 42, { size: 18, color: '#ffe8b0' });
    ctx.restore();
  }
  function installRiver(m) {
    if (!m || m.def.id !== 'beigang_river' || m._c8river) return;
    m._c8river = true;
    const ob = m.blocked.bind(m);
    // the drowned never cross the incense line around the procession
    m.blocked = function (x, y, self) { if (self && this.enemies.includes(self) && x <= 13 && y <= 13) return true; return ob(x, y, self); };
    const p = m.player, um = p.updateMove.bind(p);
    p.updateMove = function (dt, mul = 1) { return um(dt, mul * (tideActive(G.state) && m.terrainAt(this.x, this.y) === 'shallow' ? 0.6 : 1)); };
    const dh = m.drawHud.bind(m);
    m.drawHud = function (ctx, t) { dh(ctx, t); if (tideActive(G.state)) drawTideGauge(ctx, t); };
  }
  function unsaved(st) { return [1, 2, 3, 4, 5].filter((i) => !st.flags['ch8_saved_' + i]); }
  // ④ (in the riverside lanes) is lost once the lanes become river; ⑤ always appears after three rescues
  function reachableLeft(st) { return unsaved(st).filter((i) => !(i === 4 && TIDE(st) >= 7)); }
  function setRescueObjective() {
    const n = SAVED(G.state);
    G.state.vars.objective = n >= 5 ? '前往河口' : `救出受困的香客（${n}／5）`;
  }
  async function tideTick(S) {
    const m = MS();
    const st = G.state;
    const before = TIDE(st);
    const now = tideNow(st);
    S.flag('ch8_tide', now);
    retile(m);
    for (const a of [m.player, ...m.followers]) { if (m.solid[a.y * m.w + a.x]) { const [x, y] = freeCell(m, a.x, a.y); a.setCell(x, y); } }
    for (const e of m.enemies) { if (m.solid[e.y * m.w + e.x]) { const [x, y] = freeCell(m, e.x, e.y); e.setCell(x, y); e.homeX = x; e.homeY = y; } }
    if (m.player.x !== st.x || m.player.y !== st.y) { st.x = m.player.x; st.y = m.player.y; }
    S.sfx('splash'); S.shake(4, 0.6);
    if (before < 3 && now >= 3) { S.toast('潮水漫進了河岸小巷，腳步變得沉重。', 'potion'); await S.say('yungui:serious', '水在漲……小巷裡已經淹到腳踝了。快一點！'); }
    if (before < 5 && now >= 5) { S.toast('南橋被潮水吞沒了！只能繞北橋過河。', 'potion'); await S.say('hongying:serious', '南橋沒了！要過河只能走北橋！'); }
    if (before < 7 && now >= 7) { S.toast('河岸小巷整片沒入了水中……', 'potion'); await S.say('xinghe:serious', '小巷全淹了……！'); }
    if (now > before && now < 8) S.toast(`潮位上升了（${now}／8）`, 'potion');
    await checkRescueEnd(S);
  }
  async function checkRescueEnd(S) {
    const st = G.state;
    if (st.flags.ch8_rescue_over) return;
    if (SAVED(st) >= 5) {
      S.flag('ch8_rescue_over');
      S.quest('q_ch8_pilgrims', 1);
      setRescueObjective();
      S.toast('所有受困的香客都救出來了！', 'lantern');
      await S.say('yungui:serious', '人都找到了。……可是河口那邊，水在打轉。');
      await S.say('xinghe:serious', '去河口。');
      MS().buildEnemies();
      return;
    }
    if (TIDE(st) >= 8 || !reachableLeft(st).length) await rescueFail(S);
  }
  async function rescueFail(S) {
    const m = MS();
    S.flag('ch8_tide_fail');
    S.flag('ch8_rescue_over');
    for (const i of unsaved(G.state)) S.flag('ch8_temple_saved_' + i);
    if (!fl().ch8_afu_found) S.flag('ch8_afu_by_temple');
    S.bgm('tension');
    S.shake(10, 1.6); S.sfx('splash'); S.sfx('water', 0.4);
    await nar(S, '潮水暴漲，整片河岸被淹沒。');
    await pan(S, 12, 8, 2, 0.6);
    const marchers = [['fm1', 'bajiajiang', 10, 4], ['fm2', 'bajiajiang', 10, 6], ['fm3', 'bajiajiang', 10, 8], ['fm4', 'bajiajiang', 10, 10], ['fm5', 'villager_m2', 9, 5], ['fm6', 'villager_m2', 9, 9], ['fm7', 'villager_m', 8, 7]];
    for (const [id, sprite, x, y] of marchers) S.spawn({ id, sprite, x, y, dir: 'right' });
    for (const [id] of marchers) S.move(id, 'RRRRRR', { wait: false, speed: 1.1 });
    drumRoll(16, 0.3, 0.4);
    await nar(S, '遠處，八家將的陣型整齊地往河岸推進，一步、一步。廟方的年輕人拉著繩子跟在後面，把困在水中的香客一個個拉回來。');
    await S.wait(1.2);
    S.cameraFollow();
    await S.say('yungui:serious', '……他們把剩下的人救回去了。');
    await S.say('xinghe:sad', '我們太慢了。');
    await S.say('hongying:serious', '至少人都活著。走，河口的那個東西還沒解決！');
    for (const [id] of marchers) S.remove(id);
    S.quest('q_ch8_pilgrims', 1);
    G.state.vars.objective = '前往河口';
    S.toast('目標：前往河口', 'lantern');
    m.buildEnemies();
    S.bgm('chaos');
  }
  // common epilogue of a rescue: the pilgrim walks back to the safe zone
  async function rescued(S, i, actorId) {
    const m = MS();
    if (actorId && m.actor(actorId)) await S.fadeActor(actorId, 0, 0.8);
    if (i === 1) S.flag('ch8_saved_1');
    else if (i === 2) S.flag('ch8_saved_2');
    else if (i === 3) S.flag('ch8_saved_3');
    else if (i === 4) S.flag('ch8_saved_4');
    else S.flag('ch8_saved_5');
    S.flag('ch8_saved', SAVED(G.state) + 1);
    if (i === 5) S.flag('ch8_afu_found');
    m.buildEnemies();
    setRescueObjective();
    S.toast(`香客平安撤回神轎後方（${SAVED(G.state)}／5）`, 'lantern');
    await checkRescueEnd(S);
  }

  // ---------------------------------------------------------------- the five pilgrims
  async function rescue1(S, viaBattle = true) {
    if (fl().ch8_saved_1) return;
    if (viaBattle) {
      await nar(S, '北橋頭，一個老人緊緊抱著進香旗，被濕透的人影團團圍住。');
      const r = await S.battle('t_c8_p1');
      if (r !== 'win') return;
    }
    await S.say('老阿伯', '旗……旗不能倒……');
    await S.say('hongying:serious', '阿伯，旗我來扛！你先走！');
    await S.say('老阿伯', '小姑娘，這支旗很重——');
    await nar(S, '紅纓單手把進香旗扛上肩，旗面在風中獵獵作響。');
    await S.say('老阿伯', '……好、好力！');
    await S.say('hongying:smile', '我家以前是開武館的。走吧！');
    await nar(S, '老阿伯往西北邊的神轎撤退。紅纓扛著旗，送他過了北橋。');
    await rescued(S, 1, 'rv_p1');
  }
  async function rescue2(S, viaBattle = true) {
    if (fl().ch8_saved_2) return;
    if (viaBattle) {
      await nar(S, '翻倒的牛車旁，一個年輕人拚命推著車身。溺死者正從水邊一個接一個爬上來。');
      const r = await S.battle('t_c8_p2');
      if (r !== 'win') return;
    }
    await S.say('還願的丈夫', '我太太……她有身孕……她的腳被車子壓住了！');
    await S.say('xinghe:serious', '雲歸！');
    await S.say('yungui:serious', '知道！——起！');
    S.sfx('earth'); S.shake(3, 0.4);
    await nar(S, '雲歸擲出一張土符，牛車被一股力量托起。星河扶出妻子。');
    await S.say('還願的妻子', '謝……謝謝……');
    await S.say('yungui:smile', '不用謝。等孩子生了，記得跟他說，有個很帥的道士幫過他。');
    await S.say('hongying:angry', '這種時候還耍嘴皮！');
    S.fadeActor('rv_p2b', 0, 0.8);
    await rescued(S, 2, 'rv_p2a');
  }
  async function rescue3(S, viaBattle = true) {
    if (fl().ch8_saved_3) return;
    if (viaBattle) {
      drumRoll(12, 0.2, 0.45);
      await nar(S, '沙洲中央，一個小男孩坐在翻倒的木箱上，閉著眼睛，雙手不停地打著鼓。溺死者圍成一圈，在三步之外搖晃著，不敢靠近。');
      await S.say('阿添', '不能停……師傅說……不能停……');
      await S.say('xinghe:surprise', '他一個人在這裡打了多久……？');
      let iv = null;
      let r;
      try {
        r = await S.battle('t_c8_p3', {
          intro: async (sc) => {
            for (const e of sc.enemies) e.spd = Math.round(e.spd * 0.9);
            sc.say('阿添的鼓聲沒有停——溺死者的動作慢了下來。', 1.8);
            drumRoll(8, 0.2, 0.35);
            iv = setInterval(() => drumRoll(8, 0.2, 0.3), 1700);
          },
        });
      } finally { if (iv) clearInterval(iv); }
      if (r !== 'win') return;
    }
    await nar(S, '星河蹲下，按住阿添的手。');
    await S.say('xinghe:smile', '可以停了。你很厲害。你打得很好。');
    await S.say('阿添', '……真、真的嗎？');
    await S.say('阿添', '我好怕……我的手好痛……可是我一停下來，它們就會往前走……');
    await S.say('xinghe:smile', '嗯。你剛才救了你自己。下次記得，也要讓別人來救你。');
    await S.say('yungui:smug', '要不要讓芋圓揹你？牠很壯。');
    await nar(S, '芋圓讓阿添趴到背上——然後慢慢地、平平地，被壓扁了。');
    await S.say('yungui:normal', '……星河，你揹。');
    await rescued(S, 3, 'rv_p3');
  }
  async function rescue4(S, viaBattle = true) {
    if (fl().ch8_saved_4) return;
    if (viaBattle) {
      await S.say('秀英姨', '救命啊——我的攤子——我的煎盤粿——');
      const r = await S.battle('t_c8_p4');
      if (r !== 'win') return;
    }
    await S.say('hongying:surprise', '阿姨！人比較重要！');
    await S.say('秀英姨', '我知道人比較重要！可是那一鍋粿漿是我昨晚泡到半夜的——');
    await S.say('yungui:smug', '……那就粿漿也一起救。芋圓，守著鍋子。');
    S.emote('yuyuan', '💢');
    await nar(S, '芋圓一屁股坐上鍋蓋，用「誰敢碰」的眼神瞪著水邊的溺死者。');
    await S.say('秀英姨', '那、那隻貓為什麼坐在我的鍋子上？！');
    await S.say('xinghe:smile', '阿姨，今晚奇怪的事情很多，這是最不奇怪的一件。');
    await rescued(S, 4, 'rv_p4');
  }
  // ⑤ appears after any three rescues (auto event)
  async function rescue5Scene(S) {
    S.flag('ch8_afu_shown');
    MS().refresh();
    await S.wait(0.3);
    await nar(S, '河口方向，傳來孩子的哭聲。');
    await S.say('xinghe:surprise', '——那邊！');
    await pan(S, 38, 29, 1.6, 1.6);
    await nar(S, '河口附近的灘地上，一尊巨大的身影立在逆流的水中——是千里眼神將。不知何時，祂從隊伍的另一端繞到了這裡，綠色的大臉迎著潮水。');
    await nar(S, '神將的腳邊，阿福緊緊抱著神將的腿，哭得滿臉鼻涕。溺死者在四周搖晃，卻不敢靠近神將一步。');
    await S.wait(1.0);
    await nar(S, '神將一動不動。');
    await S.say('hongying:surprise', '……千里眼。');
    await S.say('yungui:serious', '祂看見了。千里之外都看得見，何況一個迷路的孩子。');
    await S.say('xinghe:serious', '走——去接他！');
    await S.fadeOut(0.5);
    S.setPos('player', 38, 31, 'up'); S.gather();
    S.cameraFollow();
    MS().snapCamera();
    await S.fadeIn(0.5);
    const r = await S.battle('t_c8_p5');
    if (r !== 'win') { G.state.vars.objective = '阿福在河口！'; return; }
    await rescue5After(S);
  }
  async function rescue5After(S) {
    if (fl().ch8_saved_5) return;
    await nar(S, '星河把阿福抱起來。阿福死死抓著星河的衣服。');
    await S.say('阿福', '我、我在找阿嬤……水一直來……那些人一直走過來……');
    await S.say('阿福', '然後那個大大的綠色的神明就走過來了……祂一直站著……都沒有走……');
    await nar(S, '星河抬頭看向神將。神將綠色的臉在潮光中，望著海的方向。');
    await nar(S, '神將裡的人——扛神將的阿伯——的聲音，悶悶地從神將的胸口傳出來：');
    await S.say('扛神將的人', '……少年仔，囝仔交給你了。我不能蹲，祂不能蹲。');
    await S.say('扛神將的人', '我還要站在這裡。海還沒退。');
    await S.say('xinghe:serious', '……是。交給我。');
    S.face('player', 'up');
    await nar(S, '星河抱著阿福，向神將深深一鞠躬。');
    await rescued(S, 5, 'rv_p5');
  }

  // ---------------------------------------------------------------- 8-3c 潮怨・百手
  async function hundredScene(S) {
    if (fl().ch8_hundred_done) return;
    await pan(S, 44, 34, 1.6, 1.2);
    await nar(S, '河口。逆流的水在這裡匯成一個漩渦。漩渦中央，無數隻濕透的手從水裡伸出來，交纏、扭結，凝成一個巨大的人形。');
    await nar(S, '那是許多溺死者的怨念聚在一起的形狀。');
    await S.say('潮怨・百手', '……冷……好冷……');
    await S.say('潮怨・百手', '……讓我們上岸……讓我們回家……');
    await S.say('yungui:serious', '這麼多人……全擠在一起。它們不是想害人。它們只是……想回家。');
    await S.say('xinghe:serious', '我知道。可是你們回不去了。');
    await S.say('xinghe:sad', '你們的家，已經不在岸上了。在海的那一邊。');
    await S.say('xinghe:serious', '——我送你們過去！');
    S.cameraFollow();
    const r = await S.battle('t_c8_hundred', { bgmAfter: 'chaos' });
    if (r !== 'win') return;
    await hundredAfter(S);
  }
  async function hundredAfter(S) {
    const m = MS();
    if (fl().ch8_hundred_done) return;
    S.flag('ch8_hundred_done');
    m.enemies = m.enemies.filter((e) => e.def.troop !== 't_c8_hundred');
    S.sfx('splash');
    await nar(S, '百手散開，化成無數條水流，流回河裡。');
    S.setPos('player', 41, 34, 'right'); S.gather();
    S.setPos('hongying', 41, 35, 'right'); S.setPos('yungui', 40, 34, 'right'); S.setPos('yuyuan', 40, 35, 'right'); S.setPos('mochi', 39, 35, 'right');
    await nar(S, '這時，西北方傳來一陣騷動。眾人回頭。');
    S.face('player', 'left'); S.face('hongying', 'left'); S.face('yungui', 'left');
    // the procession arrives
    const pr = [['hb1', 'bajiajiang', 28, 34], ['hb2', 'bajiajiang', 28, 36], ['hb3', 'bajiajiang', 26, 34], ['hb4', 'bajiajiang', 26, 36],
      ['hq', 'qianliyan', 23, 34], ['hs', 'shunfenger', 23, 36], ['hk', 'temple_keeper', 21, 36], ['hc', 'villager_m2', 20, 34]];
    for (const [id, sprite, x, y] of pr) S.spawn({ id, sprite, x, y, dir: 'right' });
    const pal = addObj(m, { t: 'palanquin', x: 19, y: 34, solid: false });
    await pan(S, 32, 35, 1.4, 0.6);
    drumRoll(24, 0.32, 0.4);
    for (const [id] of pr) S.move(id, 'RRRRRR', { wait: false, speed: 1.2 });
    const palMove = G.Tweens.to(pal, { x: 25 }, 5, 'linear');
    await nar(S, '遶境隊伍來了。神轎在八家將的護衛下，一步一步地走到了河岸邊。千里眼、順風耳立在兩側。');
    await palMove;
    await S.say('添壽伯', '（跟在轎旁）停、停了！轎子自己停了！');
    await S.say('轎夫', '推不動……阿伯，推不動！轎子不肯走了！');
    await S.say('添壽伯', '……那就不要推。');
    await S.say('添壽伯', '媽祖婆要停在這裡。祂要在這裡看著海。');
    await nar(S, '神轎停在河岸邊，正對著河口。轎頂的流蘇在風中輕輕晃動。');
    S.bgm(null, { fade: 3 });
    await pan(S, 40, 26, 0.9, 1.5);
    await S.wait(1.2);
    await nar(S, '……');
    await nar(S, '逆流的河水，慢了下來。');
    await S.wait(1.0);
    await nar(S, '然後，靜止了。');
    await S.wait(1.0);
    G.Tweens.to(m.lightCfg, { ambient: 0.45 }, 6, 'linear');
    await nar(S, '然後——緩緩地，一寸一寸地，開始往海的方向流回去。');
    const drowned = [['dw1', 'ghost_m', 38, 31], ['dw2', 'ghost_f', 40, 31], ['dw3', 'fisherman', 36, 32], ['dw4', 'ghost_child', 42, 31], ['dw5', 'ghost_m', 34, 30]];
    for (const [id, sprite, x, y] of drowned) { const a = S.spawn({ id, sprite, x, y, dir: 'left', ghost: true }); a.alpha = 0; G.Tweens.to(a, { alpha: 0.9 }, 1, 'linear'); }
    await pan(S, 38, 30, 1.2, 1.0);
    await nar(S, '還留在岸上的溺死者，一個接一個轉過身，看著神轎的方向，搖晃著，往水裡走回去。');
    for (const [id] of drowned) S.move(id, 'UU', { wait: false, speed: 0.9 });
    await S.wait(1.4);
    for (const [id, , x] of drowned) { orb(m, x, 28, { vx: 14, vy: -18, life: 7, color: '#ffd890' }); S.fadeActor(id, 0, 1.4); }
    await nar(S, '有幾個在走進水裡之前，身上浮起一點小小的光，那光朝著大海，往外飄去。');
    await S.narrate(['方向是對的。'], { veil: 0.55 });
    for (const [id] of drowned) S.remove(id);
    S.cameraFollow();
    await S.say('xinghe:think', '……它們……往外走了。');
    await S.say('yungui:normal', '不是我們打退的。我們只是撐到了祂來。');
    await S.say('hongying:normal', '……嗯。');
    S.face('player', 'left'); S.face('hongying', 'left'); S.face('yungui', 'left'); S.face('yuyuan', 'left'); S.face('mochi', 'left');
    await nar(S, '紅纓雙手合十，對著神轎的方向，深深地拜了三拜。星河與雲歸跟著。芋圓也學著，把兩隻前爪併攏，低下了頭。');
    for (let k = 0; k < 3; k++) { S.emote('hongying', '…', 0.8); await S.wait(0.7); }
    G.Tweens.to(m.lightCfg, { ambient: 0.22 }, 3, 'linear');
    S.bgm('pingxi');
    await nar(S, '東方的天空，開始泛白。');
    S.flag('ch8_surge_end');
    S.quest('q_ch8_tide', 3);
    await S.fadeOut(1.2);
    for (const [id] of pr) S.remove(id);
    rmObj(m, pal);
    await S.warp('beigang', 27, 16, 'up', { fade: 0.01 });
  }

  // ---------------------------------------------------------------- river intro on arrival
  async function riverIntro(S) {
    S.flag('ch8_river_intro');
    setRescueObjective();
    await pan(S, 9, 6, 2, 0.6);
    await nar(S, '街口。遶境隊伍停在這裡，八家將列陣，千里眼與順風耳立在最前。一排香煙，像一條線，劃在街口與河岸之間。');
    await nar(S, '溺死者走到香煙線前，就搖晃著停住了。');
    S.cameraFollow();
    await S.say('yungui:serious', '水還在漲。每打一場，就耽擱一點時間——潮位會越來越高。');
    await S.say('hongying:serious', '能繞開的就繞開。先把人找回來！');
    await S.say('', '每經過一場戰鬥（勝利或逃跑），潮位就會上升一格。潮位漲滿之前，把五名香客都救出來。');
    await S.say('', '香客分別在：北橋頭、翻倒的牛車、沙洲、河岸小巷……還有一個孩子不知去向。');
  }

  const NOT_OVER = (st) => !st.flags.ch8_rescue_over;
  const safePos = (i) => (st) => PILGRIM_SAFE[i];
  const safeIf = (i) => (st) => !!st.flags['ch8_saved_' + i] || (!!st.flags.ch8_rescue_over && i !== 5) || (i === 5 && !!st.flags.ch8_afu_by_temple && !!st.flags.ch8_rescue_over);
  const inRiverNight = (st) => !!st.flags.ch8_surge && !st.flags.ch8_surge_end;
  G.Maps.define('beigang_river', {
    name: '北港溪口', subtitle: (st) => (inRiverNight(st) ? '逆潮之夜' : '退潮後的河口'),
    place: 'beigang', noSave: false,
    bgm: (st) => (inRiverNight(st) ? 'chaos' : 'sea'),
    start: [9, 9],
    light: (st) => (inRiverNight(st) ? { ambient: 0.7, color: '#04102a', playerR: 210, playerColor: '#ffd8a0', glow: 0.3 } : { ambient: 0.12, color: '#202838' }),
    particles: (st) => (inRiverNight(st) ? [{ type: 'rain', density: 0.4 }, { type: 'mist', color: '#8aa8d8', alpha: 0.14 }, 'motes', { type: 'embers', density: 0.4 }] : ['motes', { type: 'mist', color: '#e0e8f0', alpha: 0.1 }]),
    lights: (st) => (inRiverNight(st) ? RV_LIGHTS.concat(orbLights(MS())) : orbLights(MS())),
    drawOver: (ctx, t, m) => drawOrbs(ctx, t, m),
    tiles: riverTiles,
    objects: RV_OBJECTS,
    chests: [
      { id: 'c8_rv_village', x: 31, y: 32, gold: 2000, item: 'huanhundan' },
      { id: 'c8_rv_sandbar', x: 40, y: 8, item: 'c8_jingtao' },
    ],
    npcs: [
      // the procession (holds the street mouth; never fights)
      { id: 'rv_bj1', sprite: 'bajiajiang', name: '八家將', x: 6, y: 3, dir: 'right', fixedDir: true, if: inRiverNight, talk: talkBjSilent },
      { id: 'rv_bj2', sprite: 'bajiajiang', name: '八家將', x: 8, y: 3, dir: 'right', fixedDir: true, if: inRiverNight, talk: talkBjSilent },
      { id: 'rv_bj3', sprite: 'bajiajiang', name: '八家將', x: 6, y: 6, dir: 'right', fixedDir: true, if: inRiverNight, talk: talkBjSilent },
      { id: 'rv_bj4', sprite: 'bajiajiang', name: '八家將', x: 8, y: 6, dir: 'right', fixedDir: true, if: inRiverNight, talk: talkBjSilent },
      { id: 'rv_qly', sprite: 'qianliyan', name: '千里眼', x: 11, y: 3, dir: 'right', fixedDir: true, if: (st) => inRiverNight(st) && !st.flags.ch8_afu_shown, talk: (S) => talkGiant(S, 'qly') },
      { id: 'rv_sfe', sprite: 'shunfenger', name: '順風耳', x: 11, y: 6, dir: 'right', fixedDir: true, if: inRiverNight, talk: (S) => talkGiant(S, 'sfe') },
      { id: 'rv_music', sprite: 'villager_m', name: '阿進', x: 4, y: 7, dir: 'right', if: inRiverNight, talk: say1('阿進', ['鼓不能停！嗩吶不能停！我們在這裡吹，它們就過不來！']) },
      {
        id: 'rv_keeper', sprite: 'temple_keeper', name: '添壽伯', x: 9, y: 11, dir: 'right', if: inRiverNight,
        talk: async (S) => {
          const f = fl();
          if (f.ch8_rescue_over) { await S.say('添壽伯', '河口……河口那邊有東西。少年仔，小心。'); return; }
          await S.say('添壽伯', '少年仔，河邊的人，每一個都要找到喔。水是不等人的。');
          const left = unsaved(G.state).length;
          await S.say('添壽伯', left >= 4 ? '北橋頭、沙洲、河岸小巷、還有翻倒的牛車那邊……都有人沒回來。' : '還有人沒回來……快去！');
        },
      },
      {
        id: 'rv_aunt', sprite: 'villager_f2', name: '廟方的阿姨', x: 5, y: 11, dir: 'right', if: inRiverNight,
        talk: async (S) => {
          await S.say('廟方的阿姨', '來，喝一口平安茶。神轎在這裡，喘口氣再去。');
          S.healParty();
          S.toast('全員的氣血與真氣恢復了。', 'potion');
        },
      },
      { id: 'rv_gm', sprite: 'old_f', name: '進香的阿嬤', x: 7, y: 11, dir: 'right', if: (st) => inRiverNight(st) && !st.flags.ch8_saved_5 && !st.flags.ch8_afu_by_temple, talk: say1('進香的阿嬤', ['阿福……我的阿福……少年仔，拜託你們……']) },
      // trapped pilgrims
      { id: 'rv_p1', sprite: 'pilgrim', name: '老阿伯', x: 27, y: 6, dir: 'left', if: (st) => inRiverNight(st) && !st.flags.ch8_saved_1 && NOT_OVER(st), talk: say1('老阿伯', ['旗……旗不能倒……']) },
      { id: 'rv_p2a', sprite: 'villager_m', name: '還願的丈夫', x: 10, y: 24, dir: 'left', if: (st) => inRiverNight(st) && !st.flags.ch8_saved_2 && NOT_OVER(st), talk: say1('還願的丈夫', ['救命！車子……車子壓住她了！']) },
      { id: 'rv_p2b', sprite: 'villager_f', name: '還願的妻子', x: 8, y: 24, dir: 'up', if: (st) => inRiverNight(st) && !st.flags.ch8_saved_2 && NOT_OVER(st), talk: say1('還願的妻子', ['……好痛……孩子……']) },
      { id: 'rv_p3', sprite: 'child_m', name: '阿添', x: 38, y: 4, dir: 'down', if: (st) => inRiverNight(st) && !st.flags.ch8_saved_3 && NOT_OVER(st), talk: say1('阿添', ['不能停……師傅說……不能停……']) },
      { id: 'rv_p4', sprite: 'shopkeeper_f', name: '秀英姨', x: 18, y: 20, dir: 'left', if: (st) => inRiverNight(st) && !st.flags.ch8_saved_4 && NOT_OVER(st), talk: say1('秀英姨', ['救命啊——我的攤子——']) },
      { id: 'rv_p5', sprite: 'child_m', name: '阿福', x: 38, y: 28, dir: 'right', if: (st) => inRiverNight(st) && !!st.flags.ch8_afu_shown && !st.flags.ch8_saved_5 && NOT_OVER(st), talk: say1('阿福', ['嗚……阿嬤……']) },
      { id: 'rv_qly5', sprite: 'qianliyan', name: '千里眼', x: 39, y: 28, dir: 'down', fixedDir: true, if: (st) => inRiverNight(st) && !!st.flags.ch8_afu_shown, talk: say1('扛神將的人', ['……海還沒退。我還要站在這裡。']) },
      // rescued pilgrims in the safe zone
      { id: 'sv1', sprite: 'pilgrim', name: '老阿伯', pos: safePos(1), x: 2, y: 12, dir: 'right', if: (st) => inRiverNight(st) && safeIf(1)(st), talk: say1('老阿伯', ['旗沒有倒……旗沒有倒……']) },
      { id: 'sv2', sprite: 'villager_f', name: '還願的妻子', pos: safePos(2), x: 4, y: 12, dir: 'right', if: (st) => inRiverNight(st) && safeIf(2)(st), talk: say1('還願的妻子', ['我沒事了……孩子也沒事。謝謝你們。']) },
      { id: 'sv3', sprite: 'child_m', name: '阿添', pos: safePos(3), x: 9, y: 8, dir: 'right', if: (st) => inRiverNight(st) && safeIf(3)(st), talk: say1('阿添', ['我、我的手還在抖……可是我還可以打！']) },
      { id: 'sv4', sprite: 'shopkeeper_f', name: '秀英姨', pos: safePos(4), x: 10, y: 12, dir: 'right', if: (st) => inRiverNight(st) && safeIf(4)(st), talk: say1('秀英姨', ['粿漿救回來了！人也救回來了！今晚我秀英什麼都不怕了！']) },
      { id: 'sv5', sprite: 'child_m', name: '阿福', pos: safePos(5), x: 7, y: 12, dir: 'right', if: (st) => inRiverNight(st) && safeIf(5)(st), talk: say1('阿福', ['阿嬤，我不會再亂跑了……']) },
    ],
    enemies: [
      // visible guards around each pilgrim (they never move; touching them = that rescue fight)
      { id: 'gd1', troop: 't_c8_p1', x: 29, y: 7, art: 'drowned_soldier', chase: 0, radius: 0, respawn: false, lv: 28, if: (st) => inRiverNight(st) && !st.flags.ch8_saved_1 && NOT_OVER(st), onWin: (S) => rescue1(S, false) },
      { id: 'gd2', troop: 't_c8_p2', x: 7, y: 26, art: 'tide_grudge', chase: 0, radius: 0, respawn: false, lv: 28, if: (st) => inRiverNight(st) && !st.flags.ch8_saved_2 && NOT_OVER(st), onWin: (S) => rescue2(S, false) },
      { id: 'gd3a', troop: 't_c8_p3', x: 36, y: 4, art: 'drowned_soldier', chase: 0, radius: 0, respawn: false, lv: 28, if: (st) => inRiverNight(st) && !st.flags.ch8_saved_3 && NOT_OVER(st), onWin: (S) => rescue3(S, false) },
      { id: 'gd3b', troop: 't_c8_p3', x: 40, y: 6, art: 'tide_grudge', chase: 0, radius: 0, respawn: false, lv: 28, if: (st) => inRiverNight(st) && !st.flags.ch8_saved_3 && NOT_OVER(st), onWin: (S) => rescue3(S, false) },
      { id: 'gd4', troop: 't_c8_p4', x: 15, y: 19, art: 'water_ghost', variant: 2, chase: 0, radius: 0, respawn: false, lv: 28, if: (st) => inRiverNight(st) && !st.flags.ch8_saved_4 && NOT_OVER(st), onWin: (S) => rescue4(S, false) },
      { id: 'gd5a', troop: 't_c8_p5', x: 36, y: 30, art: 'drowned_soldier', chase: 0, radius: 0, respawn: false, lv: 28, if: (st) => inRiverNight(st) && !!st.flags.ch8_afu_shown && !st.flags.ch8_saved_5 && NOT_OVER(st), onWin: (S) => rescue5After(S) },
      { id: 'gd5b', troop: 't_c8_p5', x: 41, y: 31, art: 'water_ghost', variant: 2, chase: 0, radius: 0, respawn: false, lv: 28, if: (st) => inRiverNight(st) && !!st.flags.ch8_afu_shown && !st.flags.ch8_saved_5 && NOT_OVER(st), onWin: (S) => rescue5After(S) },
      // three roaming groups of the drowned (slowly approach the player)
      { id: 'rm1', troop: 't_c8_roam', x: 4, y: 28, art: 'drowned_soldier', chase: 5, radius: 3, speed: 2.7, respawn: false, lv: 27, if: (st) => inRiverNight(st) && NOT_OVER(st) },
      { id: 'rm2', troop: 't_c8_roam', x: 34, y: 13, art: 'drowned_soldier', chase: 5, radius: 3, speed: 2.7, respawn: false, lv: 27, if: (st) => inRiverNight(st) && NOT_OVER(st) },
      { id: 'rm3', troop: 't_c8_roam', x: 26, y: 35, art: 'water_ghost', variant: 2, chase: 5, radius: 3, speed: 2.7, respawn: false, lv: 27, if: (st) => inRiverNight(st) && NOT_OVER(st) },
      // 潮怨・百手 at the river mouth
      { id: 'hundred', troop: 't_c8_hundred', x: 45, y: 35, art: 'tide_grudge', variant: 2, mapScale: 0.85, chase: 0, radius: 0, respawn: false, if: (st) => inRiverNight(st) && !!st.flags.ch8_rescue_over && !st.flags.ch8_hundred_done, onWin: (S) => hundredAfter(S) },
    ],
    warps: [
      { x: 0, y: 3, w: 1, h: 6, to: 'beigang', tx: 50, ty: 1, tdir: 'down', if: (st) => !inRiverNight(st) },
    ],
    events: [
      { id: 'tide_tick', trigger: 'auto', if: (st) => tideActive(st) && tideNow(st) !== TIDE(st), run: tideTick },
      { id: 'tide_check', trigger: 'auto', if: (st) => tideActive(st) && (SAVED(st) >= 5 || TIDE(st) >= 8 || !reachableLeft(st).length), run: checkRescueEnd },
      { id: 'river_intro', trigger: 'auto', if: (st) => inRiverNight(st) && !st.flags.ch8_river_intro, run: riverIntro },
      { id: 'afu_appears', trigger: 'auto', if: (st) => tideActive(st) && SAVED(st) >= 3 && !st.flags.ch8_afu_shown && !st.flags.ch8_saved_5, run: rescue5Scene },
      { id: 'zone1', trigger: 'touch', x: 26, y: 2, w: 6, h: 8, if: (st) => tideActive(st) && !st.flags.ch8_saved_1, run: (S) => rescue1(S) },
      { id: 'zone2', trigger: 'touch', x: 6, y: 21, w: 7, h: 7, if: (st) => tideActive(st) && !st.flags.ch8_saved_2, run: (S) => rescue2(S) },
      { id: 'zone3', trigger: 'touch', x: 33, y: 1, w: 10, h: 7, if: (st) => tideActive(st) && !st.flags.ch8_saved_3, run: (S) => rescue3(S) },
      { id: 'zone4', trigger: 'touch', x: 14, y: 18, w: 6, h: 4, if: (st) => tideActive(st) && !st.flags.ch8_saved_4, run: (S) => rescue4(S) },
      {
        id: 'zone5', trigger: 'touch', x: 34, y: 29, w: 9, h: 4, if: (st) => tideActive(st) && !!st.flags.ch8_afu_shown && !st.flags.ch8_saved_5,
        run: async (S) => { const r = await S.battle('t_c8_p5'); if (r === 'win') await rescue5After(S); },
      },
      { id: 'hundred_zone', trigger: 'touch', x: 42, y: 32, w: 6, h: 8, if: (st) => inRiverNight(st) && !!st.flags.ch8_rescue_over && !st.flags.ch8_hundred_done, run: hundredScene },
      {
        id: 'west_edge', trigger: 'touch', x: 0, y: 0, w: 1, h: 14, if: inRiverNight,
        run: async (S) => { await S.say('yungui:normal', '街口擠滿了躲在神轎後面的香客。……現在不能回去。'); await S.move('player', 'R'); },
      },
    ],
    onEnter: async () => { installRiver(MS()); },
  });

  // ================================================================================== 安平 anping
  const AP_SHOP = ['c8_xiajuan', 'c8_douhua', 'shimuyu', 'xumingsan', 'aiyu', 'huanhundan', 'c8_jianshi', 'c8_haifeng'];
  const apDawn = (st) => !!st.flags.ch8_dawn;
  const apNight = (st) => !!st.flags.ch8_night_ap && !st.flags.ch8_dawn;
  const apDusk = (st) => !!st.flags.ch8_dusk_ap && !st.flags.ch8_night_ap;
  function anpingTiles() {
    const g = mk(44, 34, '#');
    g.rect(0, 0, 4, 34, '~');                  // 台江的海
    g.rect(4, 0, 5, 34, 's');                  // 沙灘
    g.rect(9, 0, 35, 1, '.');
    g.rect(9, 1, 35, 2, 'R');                  // 熱蘭遮舊城的紅磚城牆
    g.rect(20, 1, 3, 2, '#');                  // 城門洞
    g.rect(40, 3, 4, 11, '.'); g.rect(40, 21, 4, 13, '.');
    g.rect(38, 15, 6, 5, '=');                 // 往府城的路
    g.rect(9, 31, 31, 3, '.');
    return g.rows();
  }
  // houses: [x, y, isInn]; each door gets a 劍獅 plaque (signboard fallback for the screenplay's sword_lion)
  const AP_HOUSES = [[10, 5], [16, 5], [34, 5], [33, 12], [11, 19], [29, 19], [35, 19], [11, 26], [23, 26], [33, 26]];
  const AP_OBJECTS = [
    { t: 'gate_city', x: 20, y: 1, text: '熱蘭遮' },
    { t: 'tree_banyan', x: 11, y: 0 }, { t: 'tree_banyan', x: 30, y: 0 }, { t: 'tree_banyan', x: 38, y: 0 }, { t: 'vine_curtain', x: 16, y: 2 },
    { t: 'vine_curtain', x: 26, y: 2 },
    ...AP_HOUSES.map(([x, y]) => ({ t: 'house_minnan', x, y })),
    ...AP_HOUSES.map(([x, y], i) => ({ t: 'signboard', x: x + 3, y: y + 2, text: '劍獅', v: i % 2, solid: false, over: true })),
    { t: 'house_minnan', x: 15, y: 12 }, { t: 'signboard', x: 20, y: 14, text: '安平客棧', v: 1 },
    { t: 'shophouse', x: 19, y: 19, door: 1, text: '雜貨' },
    { t: 'shrine_small', x: 25, y: 9, text: '土地公' }, { t: 'incense_burner', x: 24, y: 11 },
    { t: 'stall', x: 23, y: 14, text: '蝦捲' }, { t: 'stall', x: 27, y: 14, text: '豆花' },
    // beach: 蚵殼堆, 晾網
    { t: 'rock_small', x: 6, y: 9 }, { t: 'rock_small', x: 7, y: 9 }, { t: 'rock_small', x: 6, y: 10 },
    { t: 'rock_small', x: 5, y: 24 }, { t: 'rock_small', x: 6, y: 24 }, { t: 'rock_small', x: 7, y: 25 }, { t: 'rock_small', x: 5, y: 21 },
    { t: 'laundry', x: 5, y: 15 }, { t: 'laundry', x: 5, y: 18 }, { t: 'fishing_net', x: 7, y: 29 }, { t: 'boat_small', x: 1, y: 6 },
    { t: 'basket', x: 8, y: 23 }, { t: 'jar', x: 8, y: 10 },
    // street life
    { t: 'well', x: 22, y: 23 }, { t: 'barrel', x: 28, y: 17 }, { t: 'jar', x: 9, y: 13 }, { t: 'plant_pot', x: 32, y: 15 },
    { t: 'lantern_string', x: 21, y: 16, w: 8, v: 0 }, { t: 'lamp_post', x: 37, y: 16 }, { t: 'lamp_post', x: 23, y: 4 },
    { t: 'tree_banyan', x: 40, y: 5 }, { t: 'tree_pine', x: 41, y: 24 }, { t: 'tree_pine', x: 40, y: 29 }, { t: 'bush', x: 42, y: 11 },
    { t: 'tree_pine', x: 12, y: 31 }, { t: 'tree_pine', x: 19, y: 32 }, { t: 'tree_pine', x: 30, y: 31 }, { t: 'bush', x: 36, y: 32 }, { t: 'flowers', x: 26, y: 31 },
  ];
  async function apIntro(S) {
    S.flag('ch8_anping');
    S.quest('q_ch8_tide', 4);
    S.gather();
    S.bgm('tainan');
    await pan(S, 20, 10, 1.6, 1.4);
    await nar(S, '安平的窄巷，家家戶戶的門楣上掛著咬著劍的獅子。');
    S.cameraFollow();
    await S.say('xinghe:surprise', '獅子！每一家都有獅子！嘴巴還咬著劍！');
    S.emote('yuyuan', '!');
    await nar(S, '芋圓在一面劍獅前停下來，端正地坐好，擺出一模一樣的兇臉。');
    await S.say('yungui:normal', '劍獅。安平人用來擋煞的。');
    await S.say('yungui:think', '不過……這幾天看起來，它們擋得很辛苦。');
    await nar(S, '街上異常安靜。幾個婦人提著竹籃，往北邊的舊城方向張望。一個穿長明宮服飾的弟子站在街口宣講。');
    await pan(S, 21, 17, 2, 0.8);
    await S.say('長明宮弟子', '各位鄉親，不要怕！走回來的人，是你們的親人啊！');
    await S.say('長明宮弟子', '玄冥法師說了，只要再等幾次潮水，他們的記憶就會回來！');
    await S.say('hongying:angry', '……');
    await S.say('yungui:normal', '（拉住她）洛姑娘，先忍著。現在打他，只會讓這裡的人更怕。');
    await S.say('hongying:serious', '……我知道。');
    await nar(S, '一位提著蝦捲的婦人經過，喃喃自語。');
    await S.say('等待的家屬', '今天他會吃嗎……他以前最愛吃蝦捲了……');
    await S.say('xinghe:sad', '……');
    S.cameraFollow();
    S.objective('打聽觀潮台的事。小廟的廟公也許知道怎麼上舊城。');
  }
  async function talkDisciple(S) {
    const f = fl();
    if (!f.ch8_disciple_1) {
      S.flag('ch8_disciple_1');
      await S.say('長明宮弟子', '各位鄉親，不要怕！走回來的人，是你們的親人啊！');
      await S.say('長明宮弟子', '玄冥法師說了，只要再等幾次潮水，他們的記憶就會一點一點回來。');
      await S.say('長明宮弟子', '長明燈照著他們，他們就不會再迷路。這是慈悲，是大慈悲！');
      await S.say('hongying:angry', '慈悲？');
      await S.say('yungui:normal', '洛姑娘，先忍著。現在打他，只會讓這裡的人更怕。');
      return;
    }
    if (!f.ch8_qf_rumor) S.flag('ch8_qf_rumor');
    await S.say('長明宮弟子', '……聽說，觀潮台上帶著那些人的，是法師身邊的年輕劍客。半張臉都是燒傷。');
    await S.say('hongying:serious', '…………');
  }
  async function talkAxing(S) {
    const f = fl();
    if (f.ch8_dawn) { await S.say('阿興伯', '洛家少爺的身體，先安放在我廟裡。我會每天替他上香，等你們回來接他。'); return; }
    const pool = [
      ['安平人討海，門口都掛劍獅。獅子咬著劍，壞東西就不敢進門。'],
      ['傳說很久以前，這裡駐紮的兵把盾牌掛在門口，盾牌上畫獅頭，插著劍。後來大家就學著掛。'],
      ['你看每家的劍獅都不一樣。有的笑、有的兇，劍有的咬在左邊，有的在右邊，都有講究。'],
    ];
    for (const l of pool[rot('ch8_axing_n', 3)]) await S.say('阿興伯', l);
    await S.say('阿興伯', '這幾天晚上，門口的劍獅……我看到它們在流汗。我活這麼久，第一次看到。');
    if (!f.ch8_gate_open) {
      await S.say('xinghe:serious', '阿伯，觀潮台要怎麼上去？');
      await S.say('阿興伯', '……北邊舊城的城門洞。長明宮的人白天在那裡拉繩子，晚上才帶著燈上去。');
      await S.say('阿興伯', '你們真要去，就等入夜吧。天一黑，他們全都上台去了，城門洞就沒人顧。');
      await S.say('阿興伯', '少年仔……上面那些人，如果真的是誰家的親人，就讓他們好好走。');
      S.flag('ch8_gate_open');
      S.flag('ch8_dusk_ap');
      S.quest('q_ch8_tide', 4);
      await S.wait(0.4);
      S.light({ ambient: 0.4, color: '#3a1a2a', playerR: 190 });
      S.particles(['motes', { type: 'mist', color: '#c8b8c8', alpha: 0.14 }]);
      S.bgm('tension');
      await nar(S, '日頭漸漸西斜。海霧開始上岸。');
      S.objective('入夜後到北邊的舊城遺址去（在客棧休息，或到城門洞前等候）');
    }
  }
  async function toNight(S) {
    await S.fadeOut(1.0);
    S.flag('ch8_night_ap');
    await S.warp('anping', 21, 5, 'up', { reload: true, fade: 0.01 });
  }
  async function gateTouch(S) {
    const f = fl();
    if (f.ch8_fort_enter) return;
    if (!f.ch8_gate_open) {
      await S.say('', '城門洞前拉著繩子，繩上掛著一排藍色的長明燈。燈下的石階被海水泡得發黑。');
      await S.say('yungui:think', '長明宮的人顧著這裡。……先打聽一下，什麼時候能上去。');
    } else if (!f.ch8_night_ap) {
      await S.say('', '繩子還在，可是守的人已經不見了。遠處，舊城的最高處隱約有光。');
      const c = await S.choice(['在這裡等到入夜', '先在附近準備'], { cancel: 1 });
      if (c === 0) { await toNight(S); return; }
    }
    await S.move('player', 'D');
  }
  async function ev84b(S) {
    S.flag('ch8_fort_enter');
    S.quest('q_ch8_tide', 5);
    S.gather();
    S.bgm('tension');
    await nar(S, '夜。海霧漫上岸。');
    await pan(S, 21, 0, 1.2, 1.4);
    S.flash('#2a4aff', 0.6, 0.35);
    await nar(S, '遠處，舊城的最高處，一點藍黑色的光亮起。');
    S.cameraFollow();
    await S.say('xinghe:serious', '那就是觀潮台。');
    await S.say('hongying:normal', '……');
    await S.say('xinghe:think', '紅纓。');
    await S.say('hongying:normal', '我沒事。');
    await S.say('hongying:serious', '在靈境裡，我看到一個畫面。黑色的雷，還有一個人擋在我前面。');
    await S.say('hongying:sad', '我一直告訴自己，那只是夢。');
    await S.say('yungui:serious', '…………');
    await S.say('xinghe:serious', '那就讓它只是夢。');
    await S.say('xinghe:serious', '這一次，我們三個都在。不會讓任何人擋在任何人前面。');
    await S.say('hongying:smile', '……笨蛋。你每次都說得這麼簡單。');
    await S.say('hongying:serious', '走吧。');
    S.objective('進入熱蘭遮舊城，登上觀潮台');
    await S.warp('anping_fort', 20, 41, 'up');
  }
  // ---------------------------------------------------------------- 蚵殼阿嬤 (optional 心燈)
  async function talkOyster(S) {
    const f = fl();
    if (f.ch8_dawn) {
      if (f.ch8_oyster_done) { await S.say('蚵殼阿嬤', '粥吃完了喔？乖。路上小心。'); return; }
      if (f.ch8_sq_oyster === 1) {
        S.flag('ch8_oyster_done');
        await nar(S, '蚵殼堆旁的石頭上，空無一人。石頭上，留著一小攤正在乾掉的海水。');
        await S.say('蚵殼阿嬤', '昨晚，他變成一點光，飛走了。');
        await S.say('蚵殼阿嬤', '飛走之前，他回頭看了我一眼。就一眼。');
        await S.say('蚵殼阿嬤', '……四十年。那一眼，就夠了。');
        await S.say('蚵殼阿嬤', '他往外飛的。往海的外面。……方向是對的，對不對？');
        await S.say('xinghe:smile', '嗯。方向是對的。');
        await S.say('蚵殼阿嬤', '那這鍋粥，你們幫我吃掉。他吃不到了，不要浪費。');
        await S.give('shimuyu', 5);
        S.flag('ch8_heartlamp_oyster');
        S.quest('q_ch8_oyster', 'done');
        await S.lantern('lantern_oyster_grandma', '蚵殼阿嬤');
        return;
      }
      if (f.ch8_sq_oyster === -1) {
        S.flag('ch8_oyster_done');
        await S.say('蚵殼阿嬤', '他走了。昨晚，變成光走的。');
        await S.say('蚵殼阿嬤', '我還煮了一鍋粥……說好要等他想起來的。');
        await S.say('蚵殼阿嬤', '……算了。走了也好。少年仔，粥你們拿去吃吧。');
        await S.give('shimuyu', 2);
        S.quest('q_ch8_oyster', 'done');
        return;
      }
      await S.say('蚵殼阿嬤', '昨晚好多光往海上飛……我尪也在裡面。我看到了。');
      return;
    }
    if (f.ch8_sq_oyster) {
      await S.say('蚵殼阿嬤', f.ch8_sq_oyster === 1 ? '舊城那邊……拜託你們了。' : '我明天再煮一鍋。他以前最愛吃我煮的粥。');
      return;
    }
    await S.say('蚵殼阿嬤', '蚵仔要一個一個剖。剖了五十年，閉著眼睛都會剖。');
    if (!f.ch8_anping) return;
    await S.say('蚵殼阿嬤', '少年仔，要買蚵仔嗎？……啊，你們不是來買蚵仔的。');
    await S.say('蚵殼阿嬤', '你們在看他。那是我尪。十年前出海，沒回來。');
    await S.say('蚵殼阿嬤', '三天前，他自己走回來了。坐在那顆石頭上，就沒動過。');
    await S.say('蚵殼阿嬤', '我每天煮虱目魚粥給他。他以前，一餐可以吃三碗。');
    await S.say('蚵殼阿嬤', '……他一口都沒吃。');
    await S.say('蚵殼阿嬤', '長明宮的人說，再等等，他就會想起來。');
    await S.say('蚵殼阿嬤', '可是你們說，我是不是傻？我覺得……他不是想回來。');
    await S.say('蚵殼阿嬤', '他只是……被人叫回來了。');
    const c = await S.choice(['「阿嬤，您不傻。」', '「他會想起來的。」']);
    S.quest('q_ch8_oyster', 0);
    if (c === 0) {
      await S.say('xinghe:sad', '阿嬤，您不傻。');
      await S.say('蚵殼阿嬤', '……嗯。我知道。我跟他過了四十年，他想不想，我看得出來。');
      await S.say('蚵殼阿嬤', '少年仔，你們要上去舊城那邊，對不對？');
      await S.say('蚵殼阿嬤', '如果……如果上面有什麼東西，把他綁在這裡……');
      await S.say('蚵殼阿嬤', '你們就幫我，讓他走吧。');
      S.flag('ch8_sq_oyster', 1);
    } else {
      await S.say('xinghe:normal', '他會想起來的。');
      await S.say('蚵殼阿嬤', '……是嗎。大家都這樣說。');
      await S.say('蚵殼阿嬤', '那我明天再煮一鍋。');
      S.flag('ch8_sq_oyster', -1);
    }
  }
  async function talkReturnedFisher(S) {
    await S.say('', '一個渾身濕透的老漁夫坐在石頭上。他一動不動地看著陸地上的某處。你叫他，他沒有回應。');
    await S.say('xinghe:think', '……他的身體在這裡。可是裡面，空空的。');
  }
  async function talkFamily(S, i) {
    if (fl().ch8_dawn) {
      await S.say('等待的家屬', i === 0 ? '……昨晚那些人都變成光，飛走了。我兒子也是。' : '我哭了一整夜。可是……我覺得他是往對的方向走了。');
      if (i === 0) await S.say('等待的家屬', '我哭了一整夜。可是……我覺得他是往對的方向走了。');
      return;
    }
    const pool = [
      '我兒子是去年出海沒回來的。昨晚……我好像在觀潮台上看到他了。',
      '他沒有看我。可是長明宮的人說，再等幾天，他就會認得我了。',
      '我每天晚上都去。帶著他最愛吃的蝦捲。他還沒吃。',
    ];
    await S.say('等待的家屬', pool[(i + rot('ch8_family_n', 3)) % 3]);
  }
  async function talkInnAp(S) {
    const f = fl();
    await S.say('安平客棧老闆', '這幾天晚上不要出門。……你們要出門？唉，那門我幫你們留著。');
    const ok = await S.inn(90, { who: '安平客棧老闆' });
    if (ok && f.ch8_gate_open && !f.ch8_night_ap && !f.ch8_fort_enter) {
      await S.say('', '醒來的時候，窗外已經全黑了。');
      await toNight(S);
    }
  }
  async function talkSnackShop(S, who) {
    if (who === 'amei') {
      await S.say('阿梅', fl().ch8_dawn ? '昨晚……大家都在海邊哭。今天我多炸一點，給大家吃。' : rot('ch8_amei_n', 2) === 0 ? '安平蝦捲！鮮蝦用網紗油包起來，炸得金黃酥脆！' : '這幾天生意好差。大家晚上都跑去觀潮台，等死去的人回來。');
    } else {
      await S.say('老蔡', rot('ch8_cai_n', 2) === 0 ? '豆花要吃熱的還是冷的？加花生還是粉圓？' : '人心慌的時候，吃一碗豆花，甜甜的，就會比較定。');
    }
    await S.shop(AP_SHOP, { title: '安平小吃與雜貨' });
  }
  async function departAnping(S) {
    const f = fl();
    if (!f.ch8_end) {
      await S.say('yungui:normal', '長明宮的人在府城到處搜查，現在進城太危險。');
      await S.move('player', 'L');
      return;
    }
    const c = await S.choice(['出發，往南', '再等一下'], { cancel: 1 });
    if (c !== 0) { await S.move('player', 'L'); return; }
    await S.say('chenbo:normal', '走吧。王船不會自己來找我們。');
    await S.say('hongying:normal', '……嗯。');
    S.quest('q_ch8_tide', 'done');
    await S.narrate(['第八章　逆潮　完'], { veil: 1 });
    await G.Story.next(S, 9);
  }

  // ---------------------------------------------------------------- 8-8 往外漂的燈
  async function ev88(S) {
    const m = MS();
    S.flag('ch8_end_start');
    S.bgm(null);
    S.hideFollowers(true);
    S.spawn({ id: 'hy88', sprite: 'hongying', x: 5, y: 14, dir: 'left' });
    S.spawn({ id: 'yg88', sprite: 'yungui', x: 6, y: 27, dir: 'left' });
    S.spawn({ id: 'yy88', sprite: 'yuyuan', x: 7, y: 27, dir: 'left' });
    S.spawn({ id: 'mc88', sprite: 'mochi', x: 4, y: 13, dir: 'left' });
    S.setPos('player', 12, 15, 'left');
    await pan(S, 8, 14, 6, 0.2);
    await nar(S, '黎明。安平的海灘。天空是灰白色的。');
    await nar(S, '青鋒的遺體已被安置在小廟裡。廟公・阿興伯在廟前點香。');
    await nar(S, '海灘上，紅纓抱著膝蓋坐著，看著海。她手裡握著那本劍譜。一整夜，她沒有說話。');
    await nar(S, '星河從小巷裡走出來，手裡拿著一盞剛糊好的紙燈籠——竹篾削得很薄，紙糊得很平。他走到紅纓旁邊，坐下。');
    await S.move('player', 'LLLLLL', { speed: 1.6 });
    S.face('player', 'left');
    await S.say('xinghe:normal', '……跟豆花攤的老蔡借了竹子，跟雜貨店買了紙。');
    await S.say('xinghe:smile', '糊得有點醜。陳伯看到大概會罵人。');
    await nar(S, '紅纓看著那盞燈籠。');
    await S.say('xinghe:normal', '現在不是中元，放水燈好像不太對。');
    await S.say('xinghe:serious', '可是我想……讓他知道，往外走是對的。');
    await nar(S, '星河把毛筆遞給紅纓。紅纓接過筆，手在抖。她在燈籠上寫下：洛青鋒。');
    await S.wait(1.0);
    await nar(S, '寫完，她停住了。然後，在旁邊，又寫了兩個字：爹。娘。');
    await S.say('hongying:sad', '…………');
    S.sfx('lantern');
    await nar(S, '星河點燃燈籠裡的蠟燭——用他掌心的心火。燈籠亮起暖黃色的光。');
    const lan = addObj(m, { t: 'water_lantern', x: 5, y: 14, text: '洛', alpha: 0, solid: false });
    await G.Tweens.to(lan, { alpha: 1 }, 0.8, 'linear');
    await nar(S, '紅纓雙手捧著燈籠，走進淺灘，彎腰，把它放在水面上。');
    S.move('hy88', 'L', { speed: 1.2 });
    await G.Tweens.to(lan, { x: 3 }, 1.6, 'inOutQuad');
    S.move('hy88', 'R', { speed: 1.2 });
    await nar(S, '燈籠漂了一會兒，原地打轉——然後，一道細細的浪退下去，帶著它，往外，往大海的方向，一點一點漂遠。');
    G.Tweens.to(lan, { x: -1.5 }, 9, 'linear').then(() => rmObj(m, lan));
    await S.wait(1.2);
    S.emote('mc88', '…', 2.4);
    await nar(S, '麻糬一直坐在水邊，看著那盞燈漂遠。燈光映在她的眼睛裡——就像那一年中元，她在八斗子的海邊，看著一盞水燈把白芷送上岸。');
    S.face('hy88', 'left');
    await S.say('hongying:sad', '……方向對了。');
    await S.say('xinghe:normal', '嗯。');
    await S.say('hongying:sad', '……星河。');
    await S.say('xinghe:normal', '嗯。');
    await S.say('hongying:cry', '他最後說，想人又不會死。');
    await S.say('hongying:cry', '……可是好痛。想他，好痛。');
    await S.say('xinghe:sad', '嗯。');
    await S.say('xinghe:sad', '會痛，是因為妳記得。');
    await S.say('xinghe:sad', '我們不要忘記他。我們痛著，記得他。');
    await nar(S, '紅纓把臉埋進膝蓋。星河沒有再說話，只是坐在她旁邊，看著那盞燈漂遠。');
    await pan(S, 7, 25, 1.4, 1.2);
    await nar(S, '遠處，雲歸站在沙灘的另一頭，抱著芋圓，沒有走過來。');
    S.emote('yy88', '?');
    await nar(S, '芋圓在他懷裡扭了一下，看著紅纓的方向。');
    await S.say('yungui:sad', '（小聲）等一下。讓她再坐一下。');
    await S.say('yungui:normal', '（小聲）……我在湖邊，也坐了很久。');
    await S.fadeOut(1.4);
    S.light({ ambient: 0.08, color: '#302828', tint: 'rgba(255,200,150,0.10)' });
    S.particles(['motes', { type: 'mist', color: '#f0e8e0', alpha: 0.08 }]);
    S.setPos('yg88', 7, 17, 'left'); S.setPos('yy88', 8, 17, 'left');
    await pan(S, 6, 15, 6, 0.2);
    await S.fadeIn(1.4);
    S.bgm('love');
    await nar(S, '稍晚，太陽升起。');
    const boat = addObj(m, { t: 'boat_small', x: -2, y: 16, solid: false });
    await nar(S, '海面上，一艘小船從晨霧中駛來。船頭站著一個佝僂的老人，手裡握著一支長長的木槳——槳身上刻著密密麻麻的符紋。');
    await G.Tweens.to(boat, { x: 1 }, 3, 'outQuad');
    await S.say('yungui:surprise', '……那是……');
    await S.say('xinghe:surprise', '陳伯！');
    S.spawn({ id: 'cb88', sprite: 'chenbo', x: 4, y: 16, dir: 'right' });
    S.sfx('splash');
    await nar(S, '小船靠岸。陳伯一瘸一拐地跳下船，差點摔倒，用引魂槳撐住。');
    await S.say('chenbo:angry', '夭壽，這把老骨頭……');
    S.face('cb88', 'player');
    await nar(S, '陳伯抬起頭，看見星河。他看了很久。看見星河掌心那團穩定的火光。');
    await S.say('chenbo:normal', '……臭小子。');
    await S.say('chenbo:normal', '臉色，比在九份的時候好。');
    await S.say('xinghe:cry', '老頭子……你的腳——');
    await S.say('chenbo:angry', '我的腳不關你的事！');
    await S.move('cb88', 'U', { speed: 1.2 });
    S.face('cb88', 'hy88');
    S.face('hy88', 'cb88');
    await nar(S, '陳伯走過星河身邊，走到紅纓面前。紅纓抬起頭，眼睛紅腫。');
    await nar(S, '陳伯什麼也沒說。他伸出粗糙的手，放在紅纓的頭頂上，輕輕地拍了兩下。');
    await S.say('hongying:cry', '……陳伯……');
    await S.say('chenbo:sad', '我在海上，看到那些往外漂的光了。');
    await S.say('chenbo:sad', '其中有三點，走得特別慢，像是在等誰。');
    await S.say('chenbo:normal', '……走得很好。妳哥哥，走得很好。');
    await nar(S, '紅纓哭出聲來。陳伯的手，一直沒有拿開。');
    await S.fadeOut(1.0);
    await S.wait(0.6);
    await S.fadeIn(1.0);
    await S.say('chenbo:serious', '我都聽說了。玄武嶼，鬼門關上的時候。');
    await S.say('yungui:serious', '我們得去澎湖。可是北港的船夫說，現在沒有船敢出海。');
    await S.say('chenbo:serious', '不是不敢。是過不去。');
    await S.say('chenbo:serious', '黑水溝已經不是活人的海了。潮在倒流，死人在上岸。');
    await S.say('chenbo:serious', '一般的船開出去，會被死人拖下去。');
    await S.say('xinghe:serious', '那要怎麼辦？');
    await S.say('chenbo:serious', '要一艘死人肯抬的船。');
    await S.say('chenbo:serious', '一艘死人不但不會拖它，還會替它拉縴、替它划槳的船。');
    await S.say('yungui:think', '死人肯抬的船……');
    await S.say('yungui:surprise', '……王船。');
    await S.say('chenbo:normal', '對。王船。');
    await S.say('chenbo:normal', '千歲爺巡海的船。好兄弟見了它，只會讓路，不會擋路。');
    await S.say('chenbo:serious', '往南走。打狗、東港。東港的千歲爺，有一艘。');
    await S.say('chenbo:serious', '借不借得到，就看你們的誠意，跟千歲爺的意思了。');
    await S.say('xinghe:serious', '……我們去借。');
    await S.say('chenbo:normal', '我跟你們一起去。王船要有人掌舵。整座島上，會在黑水上掌舵的人——');
    await S.say('chenbo:smug', '只剩我這個老頭子了。');
    await S.say('xinghe:smile', '……老頭子。');
    await S.say('chenbo:angry', '幹嘛。');
    await S.say('xinghe:smile', '藤婆說，你欠她一包菸草。五十年了。');
    await S.say('chenbo:surprise', '…………');
    await S.say('chenbo:angry', '那個老太婆還活著？！');
    await S.say('chenbo:angry', '……五十年前的菸草還記得……夭壽……');
    await S.say('yungui:smug', '她還說你以前很愛哭。');
    S.emote('cb88', '💢');
    await S.say('chenbo:angry', '💢 她亂講！');
    await nar(S, '紅纓「噗」地一聲笑了出來。只有一下。然後她低下頭，用手背擦了擦眼睛。');
    await S.say('hongying:smile', '……走吧。往南。');
    await S.narrate(['三個人、兩隻貓，與一個老船夫，站在安平的海灘上。', '身後是劍獅守著的家門；眼前是灰藍色的、往外流的海。'], { veil: 0.85 });
    S.flag('ch8_chenbo_arrive'); S.flag('ch8_wangchuan_hint'); S.flag('ch8_end');
    S.quest('q_ch8_tide', 6);
    await S.fadeOut(0.8);
    for (const id of ['hy88', 'yg88', 'yy88', 'mc88', 'cb88']) S.remove(id);
    rmObj(m, boat);
    S.hideFollowers(false);
    S.objective('與陳伯一起，從安平東邊的路往南出發');
    await S.warp('anping', 9, 16, 'right', { reload: true, fade: 0.01 });
    S.gather();
    await S.fadeIn(0.8);
  }

  G.Maps.define('anping', {
    name: '安平', subtitle: (st) => (apDawn(st) ? '往外漂的燈' : '劍獅守著的港街'),
    place: 'tainan',
    bgm: (st) => (st.flags.ch8_end ? 'love' : apDawn(st) ? null : apNight(st) || apDusk(st) ? 'tension' : 'tainan'),
    start: [41, 17],
    light: (st) => (st.flags.ch8_end ? { ambient: 0.08, color: '#302828', tint: 'rgba(255,200,150,0.10)' }
      : apDawn(st) ? { ambient: 0.22, color: '#28283a' } : apNight(st) ? { ambient: 0.65, color: '#061430', playerR: 200 }
        : apDusk(st) ? { ambient: 0.4, color: '#3a1a2a', playerR: 190 } : { ambient: 0.1, color: '#201818' }),
    particles: (st) => (apNight(st) ? [{ type: 'mist', color: '#9ab0d8', alpha: 0.18 }, 'motes'] : apDusk(st) ? ['motes', { type: 'mist', color: '#c8b8c8', alpha: 0.14 }] : ['motes', { type: 'mist', color: '#e8eef4', alpha: 0.06 }]),
    lights: (st) => ((apNight(st) || apDusk(st)) ? [{ x: 21, y: 1, r: 200, color: '#4a7aff', flicker: 0.3 }, { x: 18, y: 15, r: 180, color: '#ffb060' }, { x: 25, y: 15, r: 170, color: '#ffb060', flicker: 0.3 }, { x: 25, y: 10, r: 150, color: '#ffcf8a', flicker: 0.3 }] : []).concat(orbLights(MS())),
    drawOver: (ctx, t, m) => drawOrbs(ctx, t, m),
    tiles: anpingTiles,
    objects: AP_OBJECTS,
    chests: [
      { id: 'c8_ap_oyster', x: 6, y: 26, gold: 1000, item: 'shimuyu', n: 2 },
      { id: 'c8_ap_shrine', x: 26, y: 8, gold: 1000, item: 'c8_jianshi' },
    ],
    npcs: [
      { id: 'disciple', sprite: 'temple_guard', name: '長明宮弟子', x: 21, y: 17, dir: 'down', if: (st) => !apDawn(st), talk: talkDisciple },
      { id: 'axing', sprite: 'temple_keeper', name: '阿興伯', x: 27, y: 10, dir: 'down', talk: talkAxing },
      { id: 'amei', sprite: 'shopkeeper_f', name: '阿梅', x: 22, y: 14, dir: 'down', talk: (S) => talkSnackShop(S, 'amei') },
      { id: 'cai', sprite: 'old_m', name: '老蔡', x: 29, y: 14, dir: 'down', talk: (S) => talkSnackShop(S, 'cai') },
      { id: 'innkeeper_ap', sprite: 'merchant', name: '安平客棧老闆', x: 18, y: 15, dir: 'down', talk: talkInnAp },
      { id: 'oyster', sprite: 'fisher_f', name: '蚵殼阿嬤', x: 8, y: 21, dir: 'left', talk: talkOyster },
      { id: 'oyster_husband', sprite: 'fisherman', name: '老漁夫', x: 6, y: 21, dir: 'right', fixedDir: true, ghost: true, if: (st) => !st.flags.ch8_qingfeng_dead, talk: talkReturnedFisher },
      { id: 'family1', sprite: 'villager_f2', name: '等待的家屬', x: 24, y: 18, dir: 'up', talk: (S) => talkFamily(S, 0) },
      { id: 'family2', sprite: 'villager_m', name: '等待的家屬', x: 28, y: 23, dir: 'left', wander: 1, talk: (S) => talkFamily(S, 1) },
      { id: 'family3', sprite: 'widow', name: '等待的家屬', x: 17, y: 23, dir: 'up', talk: (S) => talkFamily(S, 2) },
      {
        id: 'child_ap', sprite: 'child_f', name: '安平的孩子', x: 31, y: 16, dir: 'down', wander: 1,
        talk: async (S) => {
          await S.say('安平的孩子', '我家的劍獅是笑的。阿公說，笑的劍獅比較厲害，因為它不怕。');
          if (fl().ch8_anping && !fl().ch8_dawn) await S.say('安平的孩子', '阿母叫我晚上不要出門。她說海會把人吃掉，又吐出來。');
        },
      },
      { id: 'chenbo_ap', sprite: 'chenbo', name: '陳伯', portrait: 'chenbo', x: 39, y: 17, dir: 'left', if: (st) => !!st.flags.ch8_end, talk: departAnping },
      { id: 'hy_shrine', sprite: 'villager_f', name: '上香的婦人', x: 23, y: 10, dir: 'right', if: apDawn, talk: say1('上香的婦人', ['廟裡躺著的那個少年，是你們的朋友吧？……阿興伯說，他是為了護著妹妹。']) },
    ],
    warps: [
      {
        x: 21, y: 1, to: 'anping_fort', tx: 20, ty: 41, tdir: 'up', if: (st) => !!st.flags.ch8_fort_enter && !st.flags.ch8_dawn,
        // coming back after using the courtyard's 潮信石 returns you to the courtyard (sluice states are kept)
        run: async (S) => { if (fl().ch8_crystal_return) { S.flag('ch8_crystal_return', false); await S.warp('anping_fort', 16, 18, 'down'); return false; } return true; },
      },
    ],
    events: [
      { id: 'intro', trigger: 'auto', if: (st) => !st.flags.ch8_anping, run: apIntro },
      { id: 'gate', trigger: 'touch', x: 21, y: 2, if: (st) => !st.flags.ch8_fort_enter, run: gateTouch },
      { id: 'night', trigger: 'auto', if: (st) => apNight(st) && !st.flags.ch8_fort_enter, run: ev84b },
      { id: 'dawn88', trigger: 'auto', if: (st) => apDawn(st) && !st.flags.ch8_end_start, run: ev88 },
      { id: 'east', trigger: 'touch', x: 43, y: 15, w: 1, h: 5, run: departAnping },
      {
        id: 'lions', trigger: 'action', x: 13, y: 7, label: '調查',
        run: async (S) => {
          await S.say('', '門楣上掛著一面木牌：獅子張著嘴，咬著一把劍。漆已經舊了，獅子的眼睛卻還很亮。');
          if (fl().ch8_anping && !apDawn(G.state)) await S.say('', '木牌的邊緣，凝著一層細細的水珠。');
        },
      },
    ],
  });

  // ================================================================================== 熱蘭遮舊城・潮閘 anping_fort (P8-2)
  const GA = (st) => !!st.flags.ch8_gate_A, GB = (st) => !!st.flags.ch8_gate_B, GC = (st) => !!st.flags.ch8_gate_C;
  const DRY1 = (st) => GA(st), DRY2 = (st) => GB(st), DRY3 = (st) => GC(st) && !GA(st);
  function fortTiles(st) {
    const g = mk(40, 44, 'w');                 // 被逆潮灌滿的舊城地基
    const rooms = [[10, 36, 20, 7], [10, 16, 20, 13], [4, 23, 6, 6], [33, 8, 6, 6], [35, 14, 4, 11], [15, 3, 11, 6]];
    for (const [x, y, w, h] of rooms) g.rect(x - 1, y - 2, w + 2, h + 3, 'R');   // 紅磚牆 (2 rows thick on top)
    g.rect(18, 29, 5, 7, 'R'); g.rect(30, 18, 5, 5, 'R'); g.rect(18, 8, 5, 8, 'R'); g.rect(18, 0, 5, 3, 'R');
    g.rect(10, 36, 20, 7, '#');                // 入口廣場
    g.rect(19, 43, 3, 1, '#');
    g.rect(10, 16, 20, 13, '%');               // 中庭
    g.rect(4, 23, 6, 6, '#');                  // 西側小室
    g.rect(33, 8, 6, 6, '#');                  // 東塔殘基
    g.rect(35, 14, 4, 11, '#');
    g.rect(15, 3, 11, 6, '#');                 // 石階前
    g.rect(19, 1, 3, 2, 'H');                  // 往觀潮台的石階
    // 水道 1 (south–north, x19..21 y29..35)
    if (DRY1(st)) g.rect(19, 29, 3, 7, ':'); else { g.rect(19, 29, 3, 7, 'r'); g.rect(19, 29, 3, 1, '-'); g.rect(19, 35, 3, 1, '-'); }
    // 水道 2 (west–east, x30..34 y19..21)
    if (DRY2(st)) g.rect(30, 19, 5, 3, ':'); else { g.rect(30, 19, 5, 3, 'r'); g.rect(30, 19, 1, 3, '-'); g.rect(34, 19, 1, 3, '-'); }
    // 水道 3 (south–north, x19..21 y9..15)
    if (DRY3(st)) g.rect(19, 9, 3, 7, ':'); else { g.rect(19, 9, 3, 7, 'r'); g.rect(19, 9, 3, 1, '-'); g.rect(19, 15, 3, 1, '-'); }
    return g.rows();
  }
  const blueLamp = (x, y) => ({ t: 'eternal_lamp', x, y, light: { r: 150, color: '#5a8aff', flicker: 0.2 } });
  async function wheel(S, w) {
    const on = !fl()['ch8_gate_' + w];
    if (w === 'A') S.flag('ch8_gate_A', on);
    else if (w === 'B') S.flag('ch8_gate_B', on);
    else S.flag('ch8_gate_C', on);
    const m = MS();
    for (const o of m.objects) if (o.wheel === w) o.on = on;
    S.sfx('switch'); S.sfx('push', 0.2); S.shake(3, 0.6);
    await S.wait(0.3);
    S.sfx('water', 0.1); S.sfx('splash', 0.5);
    retile(m);
    const names = { A: '南閘', B: '中閘', C: '東閘' };
    await S.say('', on ? `${names[w]}的齒輪嘎嘎地轉開了。遠處傳來水往下退的聲音。` : `${names[w]}的齒輪嘎嘎地轉回去了。水聲又湧了上來。`);
    const st = G.state;
    const report = [DRY1(st) ? '水道一：乾' : '水道一：淹水', DRY2(st) ? '水道二：乾' : '水道二：淹水', DRY3(st) ? '水道三：乾' : '水道三：淹水'];
    S.toast(report.join('　'), 'scroll');
  }
  const wheelObj = (w, x, y) => (st) => ({ t: 'switch', x, y, wheel: w, on: !!st.flags['ch8_gate_' + w], solid: true, label: '轉動水閘', interact: (S) => wheel(S, w) });
  async function tooDeep(S, dir) {
    await S.say('', '水太深了。');
    await S.move('player', dir);
  }
  async function fortIntro(S) {
    S.flag('ch8_fort_intro');
    S.gather();
    await pan(S, 20, 32, 1.4, 1.2);
    await nar(S, '紅磚的城牆殘基，被巨大的榕樹氣根纏繞。水從地底湧上來，淹沒了通道。');
    S.cameraFollow();
    await S.say('yungui:think', '紅毛人的舊城。幾百年前建的，後來只剩下這些牆。');
    await S.say('yungui:serious', '長明宮的人在這裡改了水道。他們讓潮水灌進來，引到觀潮台。');
    await S.say('xinghe:serious', '要上去，得先把水排掉。');
    S.objective('轉動水閘，排掉水道裡的水');
  }
  async function fortGuards(S) {
    S.flag('ch8_fort_guards');
    S.spawn({ id: 'fg1', sprite: 'temple_guard', x: 19, y: 22, dir: 'down' });
    S.spawn({ id: 'fg2', sprite: 'temple_guard', x: 22, y: 22, dir: 'down' });
    S.move('fg1', 'DD', { wait: false, speed: 2.4 });
    await S.move('fg2', 'DD', { speed: 2.4 });
    await S.say('長明宮衛', '什麼人？觀潮台是法師的聖地，閒人不得——');
    S.emote('fg1', '!');
    await S.say('長明宮衛', '……洛家的女人！少主有令，見到她，帶她上去！');
    await S.say('hongying:serious', '「少主」？');
    await S.say('長明宮衛', '青鋒少主說了，洛家的人都要回來團圓。妳也一樣！');
    await S.say('hongying:angry', '……那就帶我去見他。用打的。');
    await S.battle('t_c8_guards');
    S.remove('fg1'); S.remove('fg2');
  }
  async function readNotes(S) {
    await S.say('', '「引潮之法：東閘開，則北道通。唯南閘須閉——前路既開，退路自斷。」');
    await S.say('', '最後一行，是另一個人的字：「退路，本來就不需要。」');
    await S.say('yungui:think', '「前路既開，退路自斷」……要上去，得先把我們進來的路關掉。');
    await S.say('hongying:sad', '「退路，本來就不需要」……這是哥的字。');
    S.flag('ch8_notes_read');
  }
  async function tideStone(S, where) {
    await S.say('', '一塊被海水磨圓的石頭，表面浮著淡淡的潮紋——「潮信石」。');
    const c = await S.choice(['記錄旅程', '回到安平', '離開'], { cancel: 2 });
    if (c === 0) await S.saveMenu();
    else if (c === 1) {
      if (where === 'yard') S.flag('ch8_crystal_return', true);
      S.sfx('magic');
      await S.warp('anping', 21, 4, 'down');
    }
  }
  G.Maps.define('anping_fort', {
    name: '熱蘭遮舊城', subtitle: '潮閘',
    place: 'tainan',
    bgm: 'tension',
    start: [20, 41],
    light: { ambient: 0.7, color: '#040c20', playerR: 210 },
    particles: [{ type: 'mist', color: '#8aa0c8', alpha: 0.14 }, 'motes', { type: 'rain', density: 0.15 }],
    tiles: fortTiles,
    objects: (st) => [
      blueLamp(11, 37), blueLamp(28, 37), blueLamp(10, 16), blueLamp(29, 16), blueLamp(15, 3), blueLamp(25, 3), blueLamp(33, 8), blueLamp(38, 24), blueLamp(4, 23),
      wheelObj('A', 18, 36)(st), wheelObj('A', 18, 28)(st), wheelObj('B', 25, 18)(st), wheelObj('C', 37, 10)(st),
      { t: 'crystal', x: 12, y: 38, label: '調查', interact: (S) => tideStone(S, 'entry') },
      { t: 'crystal', x: 15, y: 17, label: '調查', interact: (S) => tideStone(S, 'yard') },
      { t: 'tree_banyan', x: 19, y: 19 }, { t: 'tree_banyan', x: 11, y: 20 }, { t: 'tree_banyan', x: 26, y: 24 },
      { t: 'vine_curtain', x: 13, y: 15 }, { t: 'vine_curtain', x: 24, y: 15 }, { t: 'vine_curtain', x: 34, y: 7 },
      { t: 'rock_big', x: 25, y: 39 }, { t: 'barrel', x: 28, y: 41 }, { t: 'barrel', x: 10, y: 41 }, { t: 'crate', x: 11, y: 42 },
      { t: 'rock_small', x: 16, y: 40 }, { t: 'crate', x: 4, y: 28 }, { t: 'barrel', x: 9, y: 23 }, { t: 'rock_big', x: 33, y: 12 },
      { t: 'jar', x: 38, y: 13 }, { t: 'bones', x: 23, y: 7 }, { t: 'rock_small', x: 16, y: 7 }, { t: 'barrel', x: 28, y: 27 },
    ],
    chests: [
      { id: 'c8_fort_p', x: 5, y: 25, item: 'huanhunxiang', n: 2 },
      { id: 'c8_fort_q', x: 36, y: 12, item: 'c8_leiyin' },
      { id: 'c8_fort_r', x: 20, y: 22, item: 'c8_cm_note', run: (S) => readNotes(S) },
    ],
    enemies: [
      { id: 'fe1', troop: 't_c8_fort', x: 24, y: 40, art: 'drowned_soldier', variant: 1, radius: 3, chase: 4, lv: 28 },
      { id: 'fe2', troop: 't_c8_fort2', x: 24, y: 25, sprite: 'temple_guard', radius: 3, chase: 4, lv: 28, if: (st) => !!st.flags.ch8_fort_guards },
      { id: 'fe3', troop: 't_c8_fort', x: 36, y: 18, art: 'tide_grudge', variant: 1, radius: 3, chase: 4, lv: 28 },
    ],
    warps: [
      { x: 19, y: 43, w: 3, h: 1, to: 'anping', tx: 21, ty: 4, tdir: 'down' },
      { x: 19, y: 1, w: 3, h: 1, to: 'anping_tower', tx: 12, ty: 18, tdir: 'up' },
    ],
    events: [
      { id: 'intro', trigger: 'auto', if: (st) => !st.flags.ch8_fort_intro, run: fortIntro },
      { id: 'guards', trigger: 'touch', x: 10, y: 27, w: 20, h: 2, if: (st) => !st.flags.ch8_fort_guards, run: fortGuards },
      { id: 'w1s', trigger: 'touch', x: 19, y: 35, w: 3, h: 1, if: (st) => !DRY1(st), run: (S) => tooDeep(S, 'D') },
      { id: 'w1n', trigger: 'touch', x: 19, y: 29, w: 3, h: 1, if: (st) => !DRY1(st), run: (S) => tooDeep(S, 'U') },
      { id: 'w2w', trigger: 'touch', x: 30, y: 19, w: 1, h: 3, if: (st) => !DRY2(st), run: (S) => tooDeep(S, 'L') },
      { id: 'w2e', trigger: 'touch', x: 34, y: 19, w: 1, h: 3, if: (st) => !DRY2(st), run: (S) => tooDeep(S, 'R') },
      { id: 'w3s', trigger: 'touch', x: 19, y: 15, w: 3, h: 1, if: (st) => !DRY3(st), run: (S) => tooDeep(S, 'D') },
      { id: 'w3n', trigger: 'touch', x: 19, y: 9, w: 3, h: 1, if: (st) => !DRY3(st), run: (S) => tooDeep(S, 'U') },
      {
        id: 'hint_c', trigger: 'touch', x: 33, y: 8, w: 6, h: 6, once: true, if: (st) => !st.flags.ch8_notes_read,
        run: async (S) => { await S.say('yungui:think', '這裡也有一座水閘。……各個水閘之間，好像是連在一起的。'); },
      },
    ],
  });

  // ================================================================================== 觀潮台 anping_tower
  function towerTiles() {
    const g = mk(24, 22, 'w');
    g.rect(3, 1, 18, 19, '#');
    g.rect(11, 20, 3, 2, 'H');
    return g.rows();
  }
  // 逆潮燈: the scaled-up 長明燈 with a blue-black flame and four light-chains into the sea (drawn under actors)
  function drawTideLamp(ctx, t, m) {
    const f = fl();
    const cx = 12 * T + T / 2, base = 5 * T - 4;
    const top = base - 250;
    if (!f.ch8_blast) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ends = [[1, 0.3], [22.8, 0.3], [0.3, 13], [23.7, 13]];
      for (const [ex, ey] of ends) {
        const x2 = ex * T, y2 = ey * T;
        for (let k = 0; k < 2; k++) {
          ctx.strokeStyle = k ? 'rgba(160,190,255,0.65)' : 'rgba(40,70,200,0.35)';
          ctx.lineWidth = k ? 2.5 : 10;
          ctx.beginPath(); ctx.moveTo(cx, top + 60);
          ctx.quadraticCurveTo((cx + x2) / 2, Math.max(top + 60, y2) + 70 + Math.sin(t * 1.3 + ex) * 12, x2, y2);
          ctx.stroke();
        }
        // pulses running toward the sea
        const ph = (t * 0.35 + ex * 0.13) % 1;
        const px = cx + (x2 - cx) * ph, py = (top + 60) + (y2 - top - 60) * ph + Math.sin(ph * Math.PI) * 70;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 18);
        g.addColorStop(0, 'rgba(190,210,255,0.9)'); g.addColorStop(1, 'rgba(60,90,255,0)');
        ctx.fillStyle = g; ctx.fillRect(px - 18, py - 18, 36, 36);
      }
      ctx.restore();
    }
    const d = G.Objects.get('eternal_lamp');
    ctx.save();
    if (f.ch8_blast) {
      // charred stump
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, base, 70, 18, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(cx - 40, 0, cx + 40, 0);
      g.addColorStop(0, '#3a3634'); g.addColorStop(0.5, '#5a5450'); g.addColorStop(1, '#221e1c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx - 52, base); ctx.lineTo(cx - 40, base - 70); ctx.lineTo(cx - 18, base - 96); ctx.lineTo(cx - 4, base - 78); ctx.lineTo(cx + 14, base - 110); ctx.lineTo(cx + 40, base - 64); ctx.lineTo(cx + 52, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#120e0c'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.translate(cx, base);
      ctx.scale(1.85, 1.85);
      if (d) d.draw(ctx, -T / 2, -T, { t: 'eternal_lamp', x: 12, y: 4, v: 0 }, t);
      ctx.restore();
      ctx.save();
      // the blue-black flame
      const fl2 = 1 + Math.sin(t * 7) * 0.06 + Math.sin(t * 11.3) * 0.04;
      const g = ctx.createRadialGradient(cx, top + 40, 4, cx, top + 30, 90 * fl2);
      g.addColorStop(0, 'rgba(230,240,255,0.95)'); g.addColorStop(0.25, 'rgba(70,110,255,0.85)'); g.addColorStop(0.6, 'rgba(20,20,70,0.6)'); g.addColorStop(1, 'rgba(0,0,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(cx, top + 30, 70 * fl2, 100 * fl2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  // transient effects: black lightning / heart-fire pillar / thunder
  function fx(m, kind, o = {}) { m.c8fx = m.c8fx || []; m.c8fx.push(Object.assign({ kind, t: 0, dur: 1.2 }, o)); }
  function drawTowerFx(ctx, t, m) {
    drawOrbs(ctx, t, m);
    if (!m.c8fx || !m.c8fx.length) return;
    const dt = 1 / 60;
    ctx.save();
    for (const e of m.c8fx) {
      e.t += dt;
      const a = Math.max(0, 1 - e.t / e.dur);
      if (e.kind === 'bolt') {
        const [x1, y1] = [e.x1 * T + T / 2, e.y1 * T], [x2, y2] = [e.x2 * T + T / 2, e.y2 * T];
        for (let k = 0; k < 2; k++) {
          ctx.strokeStyle = k ? `rgba(200,160,255,${a})` : `rgba(10,0,20,${a})`;
          ctx.lineWidth = k ? 2 : 9;
          ctx.beginPath(); ctx.moveTo(x1, y1);
          const n = 9;
          for (let i = 1; i < n; i++) ctx.lineTo(x1 + (x2 - x1) * i / n + U.hash(i, Math.floor(e.t * 20), 3) * 34 - 17, y1 + (y2 - y1) * i / n + U.hash(i, Math.floor(e.t * 20), 5) * 34 - 17);
          ctx.lineTo(x2, y2); ctx.stroke();
        }
      } else if (e.kind === 'pillar') {
        const x = e.x * T + T / 2;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
        g.addColorStop(0, 'rgba(255,120,40,0)'); g.addColorStop(0.5, `rgba(255,220,140,${0.85 * a})`); g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 60, e.y * T - 520, 120, 560);
        ctx.globalCompositeOperation = 'source-over';
      } else if (e.kind === 'thunder') {
        const x = e.x * T + T / 2;
        ctx.strokeStyle = `rgba(230,210,255,${a})`; ctx.lineWidth = 5; ctx.shadowColor = '#b080ff'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.moveTo(x + 30, e.y * T - 700);
        for (let i = 1; i <= 8; i++) ctx.lineTo(x + (U.hash(i, Math.floor(e.t * 15), 9) - 0.5) * 70, e.y * T - 700 + i * 85);
        ctx.stroke(); ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
    m.c8fx = m.c8fx.filter((e) => e.t < e.dur);
  }
  const RETURNED = [
    ['rt1', 'villager_m', 5, 7], ['rt2', 'villager_f', 7, 11], ['rt3', 'fisherman', 5, 14], ['rt4', 'old_m', 8, 16], ['rt5', 'sailor', 16, 16],
    ['rt6', 'villager_f2', 18, 12], ['rt7', 'child_m', 19, 8], ['rt8', 'old_f', 17, 5], ['rt9', 'villager_m2', 4, 17], ['rt10', 'ghost_m', 8, 5],
    ['rt11', 'fisherman', 19, 15], ['rt12', 'villager_f', 4, 4], ['rt13', 'sailor', 9, 13], ['rt14', 'child_f', 16, 9],
  ];
  function qfBattleOpts() {
    const said = {};
    const say = async (lines) => { for (const [w, txt] of lines) await G.Dialog.say(w, txt); G.Dialog.close(); };
    return {
      rewards: true, // he kneels instead of falling (a scripted end): the victory reward is still given
      intro: async (sc) => {
        await say([['hongying:serious', '……閉嘴。這次換我教你。']]);
        const qf = () => sc.enemies.find((e) => e.id === 'c8_qingfeng');
        const wicksAlive = () => sc.enemies.some((e) => e.id === 'c8_tide_wick' && !e.dead);
        // 青鋒 never dissolves: at 0 HP he kneels and the battle ends (→ 8-6b)
        const kill0 = sc.kill.bind(sc);
        sc.kill = (u) => {
          if (u.id === 'c8_qingfeng') { u.hp = 1; u.pose = 'hurt'; sc.result = 'win'; sc.scriptedEnd = true; return; }
          kill0(u);
          if (u.id === 'hongying' && !said.hyDown) said.hyDown = 'pending';
        };
        // 借潮 (2% / living wick each turn) and the hesitation below 25%
        const start0 = sc.startTurn.bind(sc);
        sc.startTurn = async (u) => {
          const skip = await start0(u);
          if (skip || u.dead || u.id !== 'c8_qingfeng') return skip;
          const n = sc.enemies.filter((e) => e.id === 'c8_tide_wick' && !e.dead).length;
          if (n && u.hp < u.mhp) { sc.healUnit(u, Math.round(u.mhp * 0.015 * n)); await sc.wait(0.3); }
          if (u.hp <= u.mhp * 0.25) {
            if (!said.hes) { said.hes = true; await say([['qingfeng:hurt', '……手腕……不要僵……']]); sc.popText(u, '猶豫', '#c8d8ff'); await sc.wait(0.5); return true; }
            if (Math.random() < 0.4) { sc.popText(u, '猶豫', '#c8d8ff'); await sc.wait(0.5); return true; }
          }
          return false;
        };
        // 紅纓's spear-tip is raised: her attacks on him always crit below 25%
        const perf0 = sc.performSkill.bind(sc);
        sc.performSkill = (u, s, targets, id) => {
          const q = qf();
          if (u.id === 'hongying' && q && targets.includes(q) && q.hp <= q.mhp * 0.25) s = Object.assign({}, s, { crit: 1 });
          return perf0(u, s, targets, id);
        };
        // 「槍尖，太低了」 targets 紅纓 first
        const ai0 = sc.aiCommand.bind(sc);
        sc.aiCommand = (e) => {
          const cmd = ai0(e);
          if (cmd && cmd.skill === 'c8_e_qf_lowtip') { const hy = sc.party.find((p) => p.id === 'hongying' && !p.dead); if (hy) cmd.targets = [hy]; }
          return cmd;
        };
        const ph0 = sc.checkPhases.bind(sc);
        sc.checkPhases = async () => {
          await ph0();
          const q = qf();
          if (!q || sc.result) return;
          if (!said.p70 && q.hp <= q.mhp * 0.7) { said.p70 = true; await say([['qingfeng:angry', '妳不知道我這三年是怎麼過的！'], ['hongying:cry', '我知道！我每天都在恨你！每天都在想你！']]); }
          if (!said.wicks && !wicksAlive()) { said.wicks = true; await say([['yungui:serious', '斷了！那盞燈沒辦法再把死人的力氣灌給他了！']]); }
          if (!said.p40 && q.hp <= q.mhp * 0.4 && wicksAlive()) { said.p40 = true; await say([['yungui:serious', '那兩盞燈芯在替他續命——先打燈芯！']]); }
          if (said.hyDown === 'pending') { said.hyDown = true; await say([['yungui:serious', '洛姑娘！起來——妳還沒說完！']]); }
        };
      },
    };
  }

  // ---------------------------------------------------------------- 8-6a 歸潮者
  async function ev86(S) {
    const m = MS();
    S.bgm(null);
    S.gather();
    S.setPos('player', 12, 18, 'up');
    await pan(S, 12, 14, 1.2, 1.4);
    await nar(S, '石階盡頭。夜。只有風聲與浪聲。');
    await pan(S, 12, 5, 0.9, 1.5);
    await nar(S, '觀潮台上，一座巨大的燈柱燃著藍黑色的火。四條光鏈從燈上延伸，沒入海中。');
    await pan(S, 12, 11, 1.0, 1.2);
    await nar(S, '平台上，站著數十個人。他們全身濕透，面朝陸地，一動不動，水從衣角一滴一滴落下。');
    await nar(S, '老漁夫、年輕的水手、穿唐山衫的男人、抱著膝的孩子……其中，一男一女穿著褪了色的綢衫——那衣服的樣式，紅纓認得。');
    S.cameraFollow();
    await S.move('player', 'UUUUUUUU', { speed: 1.6 });
    S.setPos('hongying', 13, 10, 'up'); S.setPos('yungui', 11, 11, 'up'); S.setPos('yuyuan', 12, 11, 'up'); S.setPos('mochi', 13, 11, 'up');
    await S.say('hongying:surprise', '………………');
    await pan(S, 12, 7, 1.4, 0.8);
    await nar(S, '燈柱前，一個穿黑衣的年輕人背對他們站著。他沒有戴面具。腰間佩著一把劍。');
    await S.say('hongying:normal', '……哥。');
    await S.wait(0.8);
    S.face('qf', 'down');
    await nar(S, '青鋒轉過身。右半邊臉是冷火燒過的疤。他比在鹿港時更瘦了，眼睛下面是很深的陰影——可是他的眼睛在發亮。那是一種讓人害怕的、充滿希望的光。');
    await S.say('qingfeng:smile', '紅纓。妳來了。');
    await S.say('qingfeng:smile', '妳看。');
    S.move('qf', 'L', { speed: 1.2 }); S.face('qf', 'right');
    await nar(S, '他側過身，讓出視線。那一男一女。');
    await S.say('qingfeng:smile', '爹。娘。');
    await S.say('qingfeng:smile', '他們回來了。三年了……他們回來了。');
    await nar(S, '紅纓的槍尖，垂到了地上。');
    await S.say('hongying:surprise', '……爹……娘……');
    await S.say('xinghe:serious', '青鋒，他們——');
    await S.say('qingfeng:serious', '我知道。他們還不太說話。');
    await S.say('qingfeng:smile', '法師說，記憶會慢慢回來。潮水每漲一次，就會多想起一點。');
    await S.say('qingfeng:smile', '等今年鬼月結束，潮水全部倒過來——他們就會全部想起來。');
    await S.say('qingfeng:smile', '到時候，我們就可以回鹿港。回家。四個人。');
    await nar(S, '紅纓一步一步走向那個穿綢衫的女人。她的手在發抖。');
    await moveF(S, 'hongying', 'UU', 0.9);
    await S.say('hongying:cry', '……娘。');
    S.face('mother', 'hongying');
    await nar(S, '那女人轉過頭。她的眼睛是灰色的，像起霧的玻璃。她看著紅纓，就像看著一根柱子。');
    S.face('mother', 'down');
    await nar(S, '然後她微微側身，避開了紅纓伸出的手，就像避開一個陌生人。');
    await S.wait(1.4);
    await S.say('hongying:cry', '……她不認得我。');
    await S.say('qingfeng:serious', '會認得的！只要再等——');
    await S.say('hongying:cry', '哥，你看清楚！她連躲都躲得像在躲陌生人！');
    await S.say('hongying:cry', '這不是娘！這只是……娘的樣子！');
    await S.say('qingfeng:angry', '住口！');
    S.sfx('metal'); S.flash('#c8e0ff', 0.3, 0.5);
    await nar(S, '青鋒拔劍。劍光如水。');
    await S.say('qingfeng:angry', '妳不懂。妳什麼都不懂。');
    await S.say('qingfeng:angry', '三年。妳恨了我三年，可是妳至少還有一個可以恨的人。');
    await S.say('qingfeng:angry', '我呢？我每天晚上閉上眼睛，都是那天晚上。都是我沒趕上的那一刻！');
    await S.say('qingfeng:serious', '……法師給了我一個機會。一個把那天晚上「改回來」的機會。');
    await S.say('qingfeng:serious', '誰都不准碰那盞燈。誰都不准。');
    await S.say('hongying:cry', '…………');
    await nar(S, '紅纓擦掉眼淚，重新舉起槍。槍尖對著哥哥。');
    await S.say('hongying:serious', '……那我就打醒你。');
    await S.say('hongying:serious', '像你以前打醒我那樣。');
    await S.say('qingfeng:sad', '…………');
    await S.say('qingfeng:serious', '槍尖，還是太低了。');
    const r = await S.battle('t_c8_qingfeng', Object.assign(qfBattleOpts(), { bgmAfter: 'tension' }));
    if (r !== 'win') return;
    // the fight's experience, given quietly (no fanfare over this scene)
    const tr = G.Data.troops.t_c8_qingfeng;
    G.Party.gainExp(tr.enemies.reduce((a, id) => a + (G.Data.enemies[id].exp || 0), 0));
    G.Party.healAll();
    S.flag('ch8_qf_beaten');
    await ev86b(S);
  }

  // ---------------------------------------------------------------- 8-6b 是誰家的孩子
  async function ev86b(S) {
    S.setPos('player', 12, 10, 'up'); S.setPos('hongying', 13, 9, 'up'); S.setPos('yungui', 11, 10, 'up'); S.setPos('yuyuan', 12, 11, 'up'); S.setPos('mochi', 13, 11, 'up');
    S.setPos('qf', 12, 8, 'down');
    S.cameraFollow();
    await pan(S, 12, 8, 6, 0.2);
    await nar(S, '青鋒單膝跪地，劍插在石板上。他喘著氣，嘴角流著血。');
    await S.say('qingfeng:hurt', '……妳的槍尖……抬起來了。');
    await S.say('hongying:sad', '……是你教的。');
    await nar(S, '青鋒撐著劍站起來。他沒有再看紅纓。他一步一步，走向那個穿綢衫的女人。');
    await S.move('qf', 'R', { speed: 0.8 });
    S.face('qf', 'right');
    await S.say('qingfeng:normal', '娘。');
    await S.wait(1.0);
    await nar(S, '女人沒有反應。');
    await S.say('qingfeng:smile', '娘，是我。青鋒。');
    S.face('mother', 'qf');
    await nar(S, '女人慢慢轉過頭。灰色的眼睛看著他。她的嘴唇動了動。');
    await S.say('洛母（歸潮者）', '……青鋒……');
    await nar(S, '青鋒的眼睛亮了。');
    await S.say('qingfeng:surprise', '娘——！');
    await S.say('洛母（歸潮者）', '……青鋒……');
    await S.wait(0.8);
    await S.say('洛母（歸潮者）', '……好聽的名字。');
    await S.say('洛母（歸潮者）', '是誰家的孩子呀？');
    S.bgm(null, { fade: 0.2 });
    await S.wait(1.5);
    await nar(S, '…………');
    await S.wait(1.2);
    await nar(S, '青鋒的笑容，還掛在臉上。只是一動也不動。');
    S.face('mother', 'down');
    await nar(S, '女人轉回頭，繼續看著陸地。然後，她開始哼歌。很輕、很慢的旋律，沒有歌詞。她的手在身前輕輕地、規律地拍著，像是懷裡抱著一個看不見的嬰兒。');
    const dur = lullaby();
    await S.wait(Math.min(1.5, dur || 0));
    await S.say('hongying:cry', '（很小聲）……那是……娘哄我們睡覺的時候……');
    await S.say('qingfeng:normal', '……我知道。');
    await S.say('qingfeng:normal', '她的手記得。她的嘴記得。');
    await S.say('qingfeng:sad', '……可是她不記得我。');
    await nar(S, '青鋒伸出手，想碰母親的手。停在半空中。慢慢收回來。');
    await S.wait(1.2);
    await S.say('qingfeng:sad', '原來是這樣。');
    await S.say('qingfeng:sad', '這不是娘。這只是娘留在海裡的……影子。');
    await S.say('qingfeng:sad', '我把影子撈上岸，給它穿上娘的衣服，叫它「娘」。');
    await S.say('qingfeng:cry', '……我到底在做什麼……');
    await S.say('xinghe:sad', '青鋒……');
    await S.say('qingfeng:serious', '法師沒有騙我。');
    await S.say('qingfeng:serious', '……他自己也相信。他比誰都相信。');
    await S.say('qingfeng:serious', '所以……這件事，要由我來結束。');
    await S.move('qf', 'LUU', { speed: 1.2 });
    S.face('qf', 'up');
    await nar(S, '青鋒轉身，拔起劍，走向逆潮燈。他舉起劍，對準連接海面的光鏈。');
    await S.say('qingfeng:serious', '這盞燈，是我親手點的。');
    S.flag('ch8_qf_understands');
    await ev86c(S);
  }

  // ---------------------------------------------------------------- 8-6c 黑雷
  async function ev86c(S) {
    const m = MS();
    S.sfx('dark'); S.shake(5, 0.8);
    S.light({ ambient: 0.8 });
    const yx = S.spawn({ id: 'yx', sprite: 'yexuan', x: 12, y: 4, dir: 'down', ghost: true });
    yx.alpha = 0;
    G.Tweens.to(yx, { alpha: 0.85 }, 1.4, 'linear');
    S.bgm('villain');
    await pan(S, 12, 6, 1.4, 1.0);
    await nar(S, '逆潮燈的火焰忽然暴漲。藍黑色的火在空中扭曲，凝成一個人形——一個穿著素白道袍、面容溫和的中年男人。他的身影是半透明的，像是從很遠的地方投射過來的。');
    await S.say('yexuan:normal', '……青鋒。');
    await S.say('qingfeng:surprise', '……法師。');
    await S.say('yexuan:normal', '放下劍。');
    await S.say('yexuan:sad', '你答應過我。我們要一起，把他們全部帶回來。');
    await S.say('qingfeng:sad', '法師……他們不記得我。');
    await S.say('yexuan:normal', '會記得的。');
    await S.say('yexuan:sad', '念兒……念兒也還不太記得我。可是她會的。只要潮水全部倒流——');
    await S.say('qingfeng:cry', '念兒也不記得你，對不對？');
    await S.wait(1.0);
    await nar(S, '夜玄的影子，沉默了。');
    await S.say('qingfeng:cry', '你每天晚上對著那個罐子說話。她從來沒有回答過你，對不對？');
    await S.say('yexuan:sad', '…………');
    await S.say('yexuan:normal', '……青鋒，放下劍。');
    // 紅纓 slips round the side of the lamp
    S.move('hongying', 'RUUUU', { speed: 1.4 });
    await nar(S, '趁著夜玄的影子與青鋒對峙，紅纓已經悄悄繞到燈柱側面。她咬著牙，舉槍刺向燈柱底座的光鏈。');
    await S.wait(0.6);
    S.setPos('hongying', 14, 5, 'left');
    await S.say('hongying:angry', '——斷！');
    await S.say('yexuan:surprise', '——別碰它！');
    S.sfx('thunder');
    S.flash('#ffffff', 0.5, 0.95);
    fx(m, 'bolt', { x1: 12, y1: 4, x2: 14, y2: 5, dur: 2.2 });
    await nar(S, '夜玄的影子本能地抬起手。一道黑色的雷光，從燈中射向紅纓。');
    await S.wait(0.8);
    await nar(S, '慢動作。紅纓轉頭，看見黑雷迎面而來。來不及閃。');
    await S.move('qf', 'RU', { speed: 5 });
    S.face('qf', 'left');
    await nar(S, '一個背影，擋在了她的面前。張開雙臂。');
    await S.wait(1.0);
    await nar(S, '——靈境中的畫面，分毫不差。');
    fx(m, 'bolt', { x1: 12, y1: 4, x2: 13, y2: 5, dur: 1.4 });
    S.sfx('thunder'); S.sfx('death', 0.2);
    S.flash('#ffffff', 0.6, 0.9); S.shake(10, 0.8);
    await S.wait(1.0);
    await nar(S, '黑雷貫穿了青鋒的胸口。');
    await S.wait(1.2);
    await S.say('hongying:surprise', '…………哥…………？');
    S.setPos('qf', 14, 6, 'up');
    S.setPos('hongying', 15, 6, 'left');
    await nar(S, '青鋒的身體晃了一下，向後倒去。紅纓丟下槍，接住他，兩人一起跪倒在石板上。');
    await S.say('yexuan:surprise', '……青……鋒……？');
    await nar(S, '夜玄的影子僵在空中，舉起的手在發抖。');
    await S.say('xinghe:angry', '——夜玄！！');
    S.sfx('fire'); S.sfx('ultimate', 0.1);
    fx(m, 'pillar', { x: 12, y: 10, dur: 2.4 });
    fx(m, 'pillar', { x: 12, y: 5, dur: 2.4 });
    S.flash('#ffd070', 0.7, 0.8);
    await nar(S, '星河的心火從全身爆發，化成一道金紅色的火柱，直衝燈柱。同時，雲歸雙手結印，紫白色的雷光從天而降。');
    await S.say('yungui:angry', '太虛——神雷！');
    fx(m, 'thunder', { x: 12, y: 4, dur: 1.4 });
    S.sfx('thunder'); S.sfx('shatter', 0.4);
    S.flash('#e0d0ff', 0.6, 0.95); S.shake(14, 1.2);
    S.flag('ch8_blast');
    await S.wait(1.0);
    await nar(S, '火與雷同時擊中逆潮燈。燈柱發出刺耳的碎裂聲，一道巨大的裂縫從底座延伸到頂端。四條光鏈同時斷裂。');
    await nar(S, '夜玄的影子劇烈地閃爍。他的目光沒有看星河，沒有看雲歸。他一直看著倒在紅纓懷裡的青鋒。');
    await S.say('yexuan:sad', '……我……不是……');
    await S.fadeActor('yx', 0, 1.6);
    S.remove('yx');
    await nar(S, '影子消散。');
    await ev86d(S);
  }

  // ---------------------------------------------------------------- 8-6d 洛家的兩個笨蛋 (slow; never rushed)
  async function ev86d(S) {
    const m = MS();
    S.bgm('sad', { fade: 3 });
    S.light({ ambient: 0.74, color: '#060a1a' });
    await pan(S, 14, 6, 0.7, 1.5);
    await nar(S, '觀潮台上，歸潮者們一個接一個停止了動作。光鏈斷了，他們身上的藍光開始一點一點地剝落。');
    await nar(S, '紅纓跪在地上，抱著青鋒。他的胸口有一個黑色的洞，邊緣在冒著冰冷的煙。海水從他的傷口滲出來。');
    await S.say('hongying:cry', '哥……哥……雲歸！雲歸，救他！');
    await moveF(S, 'yungui', 'RRRUUU', 3.2);
    S.setPos('yungui', 13, 7, 'right');
    await nar(S, '雲歸跑過來，跪下，手按在青鋒胸口。他的手在發抖。他看了一眼傷口，然後抬頭看紅纓。他什麼都沒說。');
    await S.wait(1.4);
    await S.say('hongying:cry', '……救他啊……你不是什麼符都會嗎……');
    await S.say('yungui:sad', '…………洛姑娘。');
    await S.wait(1.2);
    await nar(S, '紅纓明白了。她把青鋒抱得更緊。');
    await S.say('qingfeng:hurt', '……紅纓。');
    await S.say('hongying:cry', '我在。我在這裡。');
    await S.say('qingfeng:hurt', '……妳的槍……槍尖……');
    await S.say('hongying:cry', '閉嘴……你這種時候還要說槍尖……');
    await S.say('qingfeng:smile', '……妳看。');
    await S.say('qingfeng:smile', '這一次……我擋到了。');
    await S.say('hongying:cry', '…………');
    await S.say('qingfeng:sad', '那天晚上……我什麼都沒擋到。');
    await S.say('qingfeng:sad', '爹最後跟我說……「去找紅纓」。');
    await S.say('qingfeng:sad', '我卻戴上面具……跑了三年……');
    await S.say('qingfeng:smile', '……現在，找到了。');
    await S.say('qingfeng:sad', '我一直想……把爹娘拉回來，就好像……那天晚上，我擋住了。');
    await S.say('qingfeng:smile', '原來……不用拉回來。只要……擋這一次……就好了。');
    await S.say('hongying:cry', '誰要你擋！誰要你擋啊！你這個笨蛋……！');
    await S.say('qingfeng:smile', '……嗯。');
    await S.say('qingfeng:smile', '洛家……兩個笨蛋。');
    await S.wait(1.2);
    await nar(S, '青鋒的手顫抖著，伸進自己的衣襟，拿出一本被血和海水浸透的薄冊子。封面上的字已經模糊：洛家劍譜。');
    await S.say('qingfeng:normal', '……劍譜。娘教我的。');
    await S.say('qingfeng:normal', '槍，是爹教妳的。劍，是娘教我的。');
    await S.say('qingfeng:smile', '把它們……合起來。');
    await S.say('qingfeng:smile', '這樣……洛家……就還在。');
    await S.say('hongying:cry', '我不要劍譜……我要你……我只要你……');
    await S.say('qingfeng:smile', '……紅纓。今年冬至……');
    await S.say('hongying:cry', '……不要說……');
    await S.say('qingfeng:smile', '麵線……還是要煮。');
    await S.say('qingfeng:smile', '煮焦了……也沒關係。放在門檻上。');
    await S.say('hongying:cry', '你又要說好吃……每一年都說好吃……騙子……');
    await S.say('qingfeng:smile', '……沒騙妳。');
    await S.wait(1.0);
    await S.say('qingfeng:smile', '焦了。……但很好吃。');
    await S.wait(1.4);
    await nar(S, '紅纓說不出話。她從懷裡拿出那張摺得很舊的字條——「焦了。——但很好吃。」——緊緊攥在手心，哭得全身都在發抖。');
    await S.wait(1.2);
    // the parents' husks dissolve; two warm lights rise
    await pan(S, 13, 7, 0.6, 1.2);
    await nar(S, '平台上，那一男一女——青鋒與紅纓的父母——身上的藍光剝落殆盡。');
    S.sfx('splash');
    S.fadeActor('father', 0, 1.6); await S.fadeActor('mother', 0, 1.6);
    await nar(S, '他們的身體化成兩攤海水，嘩啦一聲落在石板上。');
    const o1 = orb(m, 10, 8, { vx: 0, vy: -10, life: 60, color: '#ffcf80', r: 12, lightR: 110 });
    const o2 = orb(m, 14, 8, { vx: 0, vy: -10, life: 60, color: '#ffcf80', r: 12, lightR: 110 });
    await S.wait(1.4);
    await nar(S, '兩點小小的、溫暖的光，從海水中浮起。不是藍色的。是像燈籠一樣的、暖黃色的光。');
    const qx = 14 * T + T / 2, qy = 6 * T - 40;
    G.Tweens.to(o1, { x: qx - 30, y: qy - 50, vy: 0 }, 2.4, 'inOutQuad');
    await G.Tweens.to(o2, { x: qx + 30, y: qy - 50, vy: 0 }, 2.4, 'inOutQuad');
    o1.vy = 0; o2.vy = 0;
    await nar(S, '那兩點光，飄到青鋒的上方，停住了。');
    await S.say('qingfeng:surprise', '……啊。');
    await S.say('qingfeng:smile', '……原來……他們在這裡。');
    await S.say('qingfeng:smile', '他們……一直在這裡……等我。');
    await S.say('qingfeng:smile', '洛青鋒……可以……跟著回家了。');
    const o3 = orb(m, 14, 6, { vx: 0, vy: -6, life: 60, color: '#ffe0a0', r: 12, lightR: 110 });
    await G.Tweens.to(o3, { y: qy - 70, vy: 0 }, 1.6, 'inOutQuad');
    o3.vy = 0;
    await nar(S, '青鋒的胸口，也浮起一點光。三點光，在紅纓的頭頂輕輕地繞了一圈。');
    const hx = 15 * T + T / 2, hy = 6 * T - 120;
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2;
      const o = [o1, o2, o3][k];
      G.Tweens.to(o, { x: hx + Math.cos(a0) * 46, y: hy + Math.sin(a0) * 18 }, 1.6, 'inOutQuad');
    }
    await S.wait(1.7);
    for (let k = 0; k < 3; k++) {
      const a0 = (k / 3) * Math.PI * 2 + Math.PI;
      G.Tweens.to([o1, o2, o3][k], { x: hx + Math.cos(a0) * 46, y: hy + Math.sin(a0) * 18 }, 1.6, 'inOutQuad');
    }
    await S.wait(1.7);
    await nar(S, '青鋒抬起手。指尖碰到紅纓馬尾上那條紅緞帶，把一縷被海風吹亂的頭髮，塞回緞帶裡。');
    await S.wait(1.0);
    await S.say('qingfeng:smile', '……風大。頭髮……綁好。');
    await S.wait(0.8);
    await S.say('qingfeng:smile', '想我的時候……');
    await S.wait(0.8);
    await S.say('qingfeng:smile', '……想就好。');
    await S.wait(1.0);
    await S.say('qingfeng:smile', '想人……又不會死。');
    await S.wait(1.5);
    await nar(S, '青鋒閉上了眼睛。手垂了下去。');
    await S.wait(1.5);
    await nar(S, '…………');
    // the three lights leave first, then all the returned follow — outward, toward the far shore
    for (const o of [o1, o2, o3]) { o.vx = -10 + Math.random() * 6; o.vy = -16; o.t = 0; o.life = 14; }
    await pan(S, 12, 4, 0.5, 1.5);
    await nar(S, '三點光，慢慢地飄離了觀潮台，飄向大海——往外，往彼岸的方向。');
    for (const [id, , x, y] of RETURNED) {
      S.fadeActor(id, 0, 2.4);
      orb(m, x, y, { vx: (x < 12 ? -1 : 1) * (6 + Math.random() * 10), vy: -18 - Math.random() * 10, life: 12, color: '#ffd890', r: 8, lightR: 70 });
      await S.wait(0.12);
    }
    await nar(S, '觀潮台上其他的歸潮者，也一個接一個化成海水，一點一點暖黃色的光從水中升起，跟在那三點光後面，飄向海面。');
    await nar(S, '上百點光，在夜色中，排成一條長長的、往外的路。');
    await S.narrate(['方向是對的。'], { veil: 0.45 });
    await pan(S, 14, 6, 0.6, 1.5);
    await nar(S, '紅纓沒有再哭出聲。她低下頭，把自己的額頭，輕輕貼在青鋒的額頭上——那是他們小時候的習慣。');
    await S.wait(1.5);
    await nar(S, '很久。');
    await S.wait(1.2);
    S.emote('yuyuan', '💧', 2.5);
    await nar(S, '星河站在幾步之外，拳頭握得發白，眼淚一直掉。雲歸背對著海，仰著頭。芋圓走到紅纓身邊趴下，用頭輕輕頂著她的手臂，一下、一下。');
    await S.wait(1.4);
    S.flag('ch8_qingfeng_dead');
    await S.fadeOut(2.4);
    await S.give('key_jianpu', 1, { silent: true });
    // 紅纓's second ultimate — no fanfare: the text appears quietly and quietly fades
    const sfx0 = G.Audio.sfx;
    G.Audio.sfx = () => {};
    try { S.learn('hongying', 'hy_luojia'); } finally { G.Audio.sfx = sfx0; }
    S.flag('ch8_jianpu');
    await S.narrate(['獲得「洛家劍譜」。', '紅纓的奧義，變成了『洛家劍譜』。'], { veil: 1, size: 26, color: '#d8d0c0' });
    await ev87(S);
  }

  // ---------------------------------------------------------------- 8-7 鬼門關上的時候
  async function ev87(S) {
    S.remove('qf');
    S.setPos('player', 12, 9, 'up'); S.setPos('hongying', 13, 8, 'up'); S.setPos('yungui', 11, 9, 'up'); S.setPos('yuyuan', 12, 10, 'up'); S.setPos('mochi', 13, 10, 'up');
    S.light({ ambient: 0.8, color: '#04060e' });
    S.particles(['wind', { type: 'mist', color: '#7088b0', alpha: 0.12 }]);
    await pan(S, 12, 6, 6, 0.2);
    await S.fadeIn(1.6);
    await nar(S, '仍是夜。逆潮燈只剩一截焦黑的殘柱。海面很黑。');
    S.bgm('villain');
    await nar(S, '海的那一邊，傳來一個聲音。不是透過燈，而是從海面本身傳來，溫和、清晰、有禮，彷彿說話的人就站在身旁。');
    const V = (txt) => S.say('yexuan', txt, { noPortrait: true, color: '#d8ccff' });
    await V('……青鋒是個好孩子。');
    await V('他在我那裡，每天晚上都練劍，練到天亮。我叫他休息。');
    await V('他說：「法師，我怕我一睡著，就又趕不上了。」');
    await S.wait(1.2);
    await nar(S, '沉默。');
    await V('我不會原諒自己。');
    await V('但我也不會停下。');
    await S.say('xinghe:angry', '你殺了他！你還要怎樣！');
    await V('星河。燈籠舖的孩子。');
    await V('你見過那些被遺忘的人嗎？我見過。我在海上，見過二十年。');
    await V('他們一個人漂在黑水上，連自己的名字都不記得了，連自己愛過誰都不記得了。');
    await V('你覺得那是慈悲。我覺得，那是世上最殘忍的事。');
    await V('今晚的潮，只是第一次。它還會再來，一次比一次大。');
    await V('當今年鬼月的最後一夜，鬼門關上的那一刻——');
    await V('黑水將永遠倒流。所有的死者，都會帶著記憶，回到這座島上。');
    await S.say('yungui:serious', '帶著記憶？剛才那些人，連自己的孩子都不認得！');
    await V('因為燈還不夠亮。因為燈靈還沒有全部交給我。');
    await S.say('xinghe:surprise', '……白芷！');
    await V('她在玄武嶼。澎湖海上，一座黑色的島。我的長明宮，真正的那一座。');
    await V('她很安全。她每天都在唱歌。');
    S.bgm('duhun', { fade: 1.5 });
    await nar(S, '海風中，極遠極遠的地方，傳來一段微弱的歌聲。渡魂謠。只有兩三句，就被浪聲吞沒了。');
    await S.wait(1.5);
    await S.say('xinghe:cry', '……白芷……');
    S.bgm('villain', { fade: 1.5 });
    await V('星河。你想見她，就來吧。');
    await V('我會等你。');
    await V('……就像二十年來，我等念兒一樣。');
    S.bgm(null, { fade: 2 });
    await nar(S, '聲音消失。海面恢復黑暗。只有浪聲。');
    S.flag('ch8_deadline');
    await S.wait(1.2);
    await S.fadeOut(1.8);
    S.flag('ch8_dawn');
    S.quest('q_ch8_tide', 6);
    if (fl().ch8_sq_oyster === 1) S.quest('q_ch8_oyster', 1);
    await S.warp('anping', 12, 15, 'left', { fade: 0.01 });
  }

  G.Maps.define('anping_tower', {
    name: '觀潮台', subtitle: '熱蘭遮舊城・最高處',
    place: 'tainan', noSave: true, autosave: false,
    bgm: null,
    start: [12, 18],
    light: (st) => ({ ambient: 0.75, color: '#040818', playerR: 170 }),
    lights: (st) => (st.flags.ch8_blast ? [] : [{ x: 12, y: 1, r: 520, color: '#3a5aff', flicker: 0.25 }, { x: 12, y: 4, r: 260, color: '#6a8aff', flicker: 0.2 }]).concat(orbLights(MS()))
      .concat((MS() && MS().c8fx && MS().c8fx.length) ? [{ x: 12, y: 5, r: 520, color: '#ffe0b0', flicker: 0.5 }] : []),
    particles: ['wind', { type: 'mist', color: '#7088b0', alpha: 0.16 }, 'motes'],
    tiles: towerTiles,
    pass: [{ x: 11, y: 2, w: 3, h: 3, solid: true }],
    drawGround: (ctx, t, m) => drawTideLamp(ctx, t, m),
    drawOver: (ctx, t, m) => drawTowerFx(ctx, t, m),
    objects: [
      { t: 'stone_lantern', x: 3, y: 1 }, { t: 'stone_lantern', x: 20, y: 1 }, { t: 'stone_lantern', x: 3, y: 19 }, { t: 'stone_lantern', x: 20, y: 19 },
      { t: 'rock_small', x: 4, y: 10 }, { t: 'rock_small', x: 20, y: 6 }, { t: 'bones', x: 18, y: 18 }, { t: 'rock_small', x: 6, y: 19 },
    ],
    npcs: [
      ...RETURNED.map(([id, sprite, x, y]) => ({ id, sprite, name: '歸潮者', x, y, dir: 'down', fixedDir: true, ghost: true, if: (st) => !st.flags.ch8_qingfeng_dead, talk: say1('', ['渾身濕透的人，面朝陸地，一動不動。你叫他，他沒有回應。']) })),
      { id: 'father', sprite: 'noble_m', name: '洛父（歸潮者）', x: 10, y: 8, dir: 'down', fixedDir: true, ghost: true, if: (st) => !st.flags.ch8_qingfeng_dead, talk: say1('', ['褪了色的綢衫。他的眼睛望著陸地，看不見眼前的人。']) },
      { id: 'mother', sprite: 'noble_f', name: '洛母（歸潮者）', x: 14, y: 8, dir: 'down', ghost: true, if: (st) => !st.flags.ch8_qingfeng_dead, talk: say1('', ['褪了色的綢衫。她的眼睛是灰色的，像起霧的玻璃。']) },
      { id: 'qf', sprite: 'qingfeng', name: '洛青鋒', portrait: 'qingfeng', x: 12, y: 6, dir: 'up', if: (st) => !st.flags.ch8_qingfeng_dead },
    ],
    warps: [{ x: 11, y: 21, w: 3, h: 1, to: 'anping_fort', tx: 20, ty: 4, tdir: 'down', if: (st) => !!st.flags.ch8_qingfeng_dead }],
    events: [
      { id: 'tower', trigger: 'auto', if: (st) => !st.flags.ch8_qf_beaten, run: ev86 },
      { id: 'tower_resume', trigger: 'auto', if: (st) => !!st.flags.ch8_qf_beaten && !st.flags.ch8_dawn, run: ev86b },
    ],
  });

  // ================================================================================== chapter entry
  G.Story.ch8 = async (S) => {
    S.chapter(8);
    // party: 星河、紅纓、雲歸 (+ the cats 芋圓 & 麻糬; 麻糬 only follows while 白芷 is in the party). 白芷 is away (taken to 玄武嶼 at the end of ch6).
    if (G.state.party.includes('baizhi')) S.leave('baizhi');
    // level floor = the progression table's ch8 start (G.Data.progression lv[0] = 27), like every other chapter entry
    const lv0 = ((G.Data.progression || []).find((p) => p.ch === 8) || { lv: [27] }).lv[0];
    for (const id of ['xinghe', 'hongying', 'yungui']) {
      if (!G.state.members[id]) G.Party.join(id, lv0);
      else if (!G.state.party.includes(id)) G.Party.join(id);
      G.Story.ensureLevel(id, lv0);
    }
    const order = ['xinghe', 'hongying', 'yungui'];
    G.state.party = order.concat(G.state.party.filter((p) => !order.includes(p)));
    G.state.flags.yuyuan_joined = true;
    G.state.flags.mochi_joined = true;
    G.state.vars.objective = '';
    await S.titleCard(G.Chapters[8], '三月・北港迎媽祖');
    await S.travel('sunmoon', 'beigang', { label: '下了山，沿著溪往海口去……' });
    await S.warp('beigang', 27, 41, 'up');
  };
})();

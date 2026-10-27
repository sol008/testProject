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
    m: { hp: 11, atk: 1.9, mag: 2.0, def: 1.1, spd: 1.2, exp: 7, gold: 6 },
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
    m: { hp: 1.9, atk: 0.4, mag: 1.1, def: 1.3, spd: 0.8, exp: 1.2, gold: 0.2 },
    skills: [['c8_e_wick_feed', 2], ['c8_e_wick_wave', 2]],
    desc: '逆潮燈分出來的燈芯，藍黑色的火焰把死者的力氣灌給青鋒。',
  });
  edef('c8_qingfeng', {
    name: '洛青鋒', sprite: 'qingfeng', lv: 30, elem: 'metal', boss: true, immune: BOSS_IMM,
    m: { hp: 10.5, atk: 1.95, mag: 1.7, def: 1.2, spd: 1.55, exp: 7, gold: 6 },
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

// @@CONTINUE@@
})();

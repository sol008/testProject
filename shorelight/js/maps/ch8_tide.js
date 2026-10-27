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

  // ================================================================================== 北港 beigang
  const BG_SHOP = ['xumingsan', 'wanguo', 'c8_jianpangui', 'c8_huashengtang', 'c8_mayouji', 'c8_yaroujeng', 'aiyu', 'huanhunxiang', 'huanhundan', 'xiangbao', 'xiancao'];
  const BG_SMITH = ['c8_liuguang', 'c8_jingtao', 'c8_leiyin', 'c8_jinxiang', 'c8_douli', 'c8_caoxie'];
  const panguiPrice = () => (fl().ch8_saved_4 ? 65 : 130);

  function beigangTiles() {
    const g = mk(56, 44, '.');
    g.rect(9, 2, 38, 12, '%');                 // 朝天宮廟埕
    g.rect(1, 14, 48, 27, '#');                // 街區
    g.rect(25, 41, 6, 3, '#');                 // 主街 → 南入口
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
      ['起駕要看時辰。吉時一到，鞭炮一響，神轎就出廟門，一路巡過整個北港。', '遶境是媽祖出來看看她的子民，看哪裡不平安，就把不乾淨的東西掃走。'],
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
      } else await S.say('秀英姨', '恩人來了！坐、坐！粿漿還是昨晚那一鍋，糰子救回來的那一鍋喔！');
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
    await S.say('tuanzi:smug', '本大爺允許你摸三下。');
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
    { id: 'afu2', sprite: 'child_m', name: '阿福', x: 28, y: 10, dir: 'down', if: (st) => bgDawn(st) && !!st.flags.ch8_dawn_done, talk: talkAfu },
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
    await S.say('tuanzi:surprise', '好香……花生的味道……芝麻油的味道……還有……還有……');
    await S.say('tuanzi:cry', '本大爺的鼻子不夠用了！');
    await S.say('yungui:smug', '你的肚子倒是一直都夠用。');
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
    await S.say('tuanzi:surprise', '好、好大……');
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
    S.setPos('hongying', 22, 13, 'right'); S.setPos('yungui', 21, 12, 'right'); S.setPos('tuanzi', 21, 13, 'right');
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
    S.setPos('player', 25, 20, 'right'); S.setPos('hongying', 25, 21, 'right'); S.setPos('yungui', 25, 19, 'right'); S.setPos('tuanzi', 25, 22, 'right');
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
    await nar(S, '眾人跪入人龍中。糰子也學著趴下，屁股翹得老高。');
    await S.say('yungui:smug', '（小聲）糰子，頭低下來，屁股放下去。');
    await S.say('tuanzi:shy', '（小聲）……本大爺在調整姿勢。');
    drumRoll(16, 0.24, 0.4);
    const pal2 = addObj(m, { t: 'palanquin', x: 24.5, y: 12, solid: false, over: true });
    await pan(S, 25, 16, 1.2, 0.8);
    await nar(S, '鑼鼓聲逼近。神轎的影子籠罩過來，從跪著的人龍上方緩緩經過。');
    const pass = G.Tweens.to(pal2, { y: 25 }, 14, 'linear');
    const cam = setInterval(() => { const mm = MS(); if (mm && mm === m) { mm.cam.tx = pal2.x * T + T - G.W / 2; mm.cam.ty = (pal2.y + 1) * T - G.H / 2; mm.cam.speed = 2; } }, 50);
    try {
      await heart(S, 'xinghe', '……媽祖婆，我不太會拜拜。可是如果您聽得見——');
      await heart(S, 'xinghe', '請讓白芷平安。請讓她，不要再一個人發光了。');
      await heart(S, 'hongying', '……讓哥哥回頭。不管他做了什麼。');
      await heart(S, 'hongying', '讓他回頭，讓我再見他一次就好。');
      await heart(S, 'yungui', '師父已經走了。我不求什麼了。');
      await heart(S, 'yungui', '……只求路上的那些人，都能像他一樣，走得安心。');
      await heart(S, 'tuanzi', '媽祖婆婆，本大爺想要很多很多芋圓……');
      await heart(S, 'tuanzi', '……不對。本大爺想要白芷姐姐回來，跟大家一起吃芋圓。');
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
    await nar(S, '糰子沒有地方掛——廟公另外拿了一條紅線，把一個香火袋綁在牠的脖子上。');
    await S.say('tuanzi:smile', '本大爺有護身符了！');
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
    S.setPos('hongying', 26, 16, 'up'); S.setPos('yungui', 28, 16, 'up'); S.setPos('tuanzi', 27, 17, 'up');
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
    S.setPos('afu83', afu.x, afu.y);
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
      await S.say('tuanzi:surprise', '免錢！！');
      await S.say('yungui:smug', '……糰子，你剛才好像有出力救粿漿。這是你應得的。');
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
      { id: 'c8_bg_inn', x: 8, y: 40, item: 'xumingsan', n: 3 },
      { id: 'c8_bg_alley', x: 2, y: 24, item: 'c8_jinxiang' },
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
      { t: 'altar', x: 6, y: 2, if: () => false },
    ],
    npcs: [
      {
        id: 'innkeeper', sprite: 'shopkeeper_f', name: '客棧老闆娘', x: 3, y: 3, dir: 'down',
        talk: async (S) => {
          await S.say('客棧老闆娘', '客官，三月正旺，只剩柴房了，柴房也是房喔！');
          const ok = await S.inn(80, { who: '客棧老闆娘' });
          if (ok) await S.say('', '一行人擠在柴房裡過了一夜。糰子睡在雲歸臉上。');
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
    S.flag('ch8_saved_' + i);
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
    await S.say('tuanzi:smile', '本大爺揹你！');
    await nar(S, '糰子讓阿添趴到背上，結果被壓扁。');
    await S.say('tuanzi:hurt', '……星河，你揹。');
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
    await S.say('yungui:smug', '……那就粿漿也一起救。糰子，抱鍋子。');
    await S.say('tuanzi:smile', '本大爺最會抱鍋子了！');
    await S.say('秀英姨', '那、那隻貓為什麼會說話？！');
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
    S.setPos('hongying', 41, 35, 'right'); S.setPos('yungui', 40, 34, 'right'); S.setPos('tuanzi', 40, 35, 'right');
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
    S.face('player', 'left'); S.face('hongying', 'left'); S.face('yungui', 'left'); S.face('tuanzi', 'left');
    await nar(S, '紅纓雙手合十，對著神轎的方向，深深地拜了三拜。星河與雲歸跟著。糰子也學著，把兩隻前爪合起來。');
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
      { id: 'c8_rv_village', x: 31, y: 32, item: 'huanhundan' },
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
      { id: 'rv_gm', sprite: 'old_f', name: '進香的阿嬤', x: 7, y: 11, dir: 'right', if: (st) => inRiverNight(st) && !st.flags.ch8_saved_5, talk: say1('進香的阿嬤', ['阿福……我的阿福……少年仔，拜託你們……']) },
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

// @@CONTINUE@@
})();

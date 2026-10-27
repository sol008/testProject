// 第五章　鹿港舊夢 — 鹿港街、天后宮、九曲巷（逆風・摸乳巷・半邊井）、施家燈籠舖、客棧、王家、兵器鋪、舊港墓仔埔、
// 洛家古厝（大門・一樓・二樓：記憶之門、公媽廳銅鏡謎題、頭目 怨宴、鬼面卸下面具）、冬至湯圓、除夕圍爐。
// Screenplay: docs/story/ch5_lukang.md
//
// Flags: ch5_start ch5_gate ch5_mazu ch5_jiaobei ch5_alley ch5_lamp ch5_rabbit ch5_memory_nian lyric_ch5 ch5_shard_traced
//        ch5_enter ch5_mem1 ch5_mem2 ch5_trunk ch5_mirrors ch5_lamp_seat ch5_boss ch5_unmask ch5_fubo_done ch5_noodles
//        ch5_rest ch5_done ch5_toys ch5_gate_open (隘門 opened at night) ch5_well_gong ch5_well_done mush_ch5
// Vars:  ch5_time (0 午後 1 黃昏 2 夜 3 冬至白天 4 除夕夜), c5_mem (memory-scene mode, 0 = off), c5_mir (mirror states),
//        c5_well {granny, niushe, watch}, tuanzi_mush (cross-chapter counter)
// Quests: q_ch5_main, q_fubo, q_halfwell, q_tuanzi_mush (cross-chapter)
// 心燈: lantern_fubo (#10), lantern_halfwell (#11)
'use strict';
(function () {
  const T = G.TILE;
  const U = G.U;
  const st = () => G.state;
  const time5 = (s) => ((s || G.state).vars.ch5_time || 0);
  const flag = (k) => !!G.state.flags[k];
  // cross-chapter ids (defined by other chapters; read through variables so missing ids never break this file)
  const SHARD_LAMP = 'key_lamp_shard';
  const SHARD_MASK = 'k_mask_shard';

  // ============================================================================================ DATA
  const D = G.Data;
  // ---- items --------------------------------------------------------------------------------------
  Object.assign(D.items, {
    c5_luo_lantern: { name: '洛家燈', desc: '施燈師紮的白燈籠，紅纓親手寫上歪歪斜斜的「洛」字。最後一筆，像一桿槍。', type: 'key', price: 0, ch: 5, icon: 'lantern' },
    c5_rabbit_lantern: { name: '兔子燈', desc: '一盞褪色的兔子燈，一隻耳朵垂下來。是照著一個叫「念念」的小女孩的燈做的。', type: 'key', price: 0, ch: 5, icon: 'lantern' },
    c5_qf_note: { name: '青鋒的字條', desc: '壓在空碗底下的字條。字跡端正、好看：「焦了。——但很好吃。」', type: 'key', price: 0, ch: 5, icon: 'letter' },
    c5_luo_key: { name: '洛家大門鑰匙', desc: '福伯顧了三年的大門鑰匙。銅已經被手磨得發亮。', type: 'key', price: 0, ch: 5, icon: 'key' },
    c5_wang_bucket: { name: '王字水桶', desc: '桶底烙著一個「王」字。三十年前，王家送給巷子裡的人救火用的。', type: 'key', price: 0, ch: 5, icon: 'misc' },
    c5_old_ledger: { name: '舊帳本', desc: '牛舌餅阿嬸的阿爸留下的帳本，一筆一筆記著跟王家賒的麵粉。', type: 'key', price: 0, ch: 5, icon: 'scroll' },
    c5_mianxian: { name: '麵線糊', desc: '鹿港街邊的麵線糊，熱呼呼一碗，風再大也不怕冷。回復氣血 180。', type: 'use', price: 50, ch: 5, icon: 'food', use: { target: 'ally', heal: 180 } },
    c5_ginger_tea: { name: '薑母茶', desc: '老薑熬得又辣又甜。回復氣血 80，並解除沉睡與定身。', type: 'use', price: 45, ch: 5, icon: 'drink', use: { target: 'ally', heal: 80, cure: ['sleep', 'stun'] } },
    c5_zhenshi: { name: '鎮屍符', desc: '鹿港道壇畫的鎮屍符，貼在額頭上就動不了。使敵方一體定身 2 回合（頭目幾乎無效）。', type: 'use', price: 120, ch: 5, icon: 'talisman', use: { target: 'enemy', status: { id: 'stun', chance: 1, turns: 2 }, battle: true, field: false } },
    c5_halfwell: { name: '半邊井水', desc: '牆裡一半、牆外一半，原來是同一口水。全體回復三成氣血與真氣。', type: 'use', price: 0, ch: 5, icon: 'drink', use: { target: 'allies', healPct: 0.3, mpPct: 0.3 } },
    c5_yarn_tiger: { name: '毛線石虎', desc: '青鋒在廟會買給紅纓的毛線石虎。她說醜死了，其實每天抱著睡。', type: 'acc', price: 0, ch: 5, icon: 'charm', who: ['hongying'], stats: { def: 8, luk: 6 } },
    c5_fubo_pipe: { name: '福伯的煙斗', desc: '福伯顧門時叼著的煙斗。拿在手裡，好像有人在背後替你顧著。', type: 'acc', price: 0, ch: 5, icon: 'misc', stats: { def: 12 }, immune: ['sleep', 'poison'] },
    c5_abacus: { name: '洛家算盤', desc: '洛家帳房的算盤，珠子打得很順手。戰鬥獲得的銀兩增加。', type: 'acc', price: 0, ch: 5, icon: 'misc', stats: { luk: 15 }, special: ['goldUp'] },
    c5_father_tassel: { name: '父親的槍纓', desc: '洛家家主槍上的紅纓。紅纓握著它，好像握著父親的手。', type: 'acc', price: 0, ch: 5, icon: 'charm', who: ['hongying'], stats: { atk: 12, spd: 2 }, special: ['critUp'] },
    c5_sw_youth: { name: '少年劍', desc: '青鋒少年時練的劍，劍身沒有一絲鏽。金屬性。', type: 'weapon', price: 0, ch: 5, icon: 'sword', who: ['xinghe'], stats: { atk: 42 }, elem: 'metal' },
    c5_coin_sword: { name: '鎮屍銅錢劍', desc: '用古銅錢串成的法劍，舊港墓仔埔的殭屍最怕它。', type: 'weapon', price: 0, ch: 5, icon: 'talisman', who: ['yungui'], stats: { atk: 8, mag: 45, mp: 10 } },
    c5_sp_steel: { name: '精鋼長槍', desc: '施鐵打的長槍，槍頭淬過三次火。', type: 'weapon', price: 760, ch: 5, icon: 'spear', who: ['hongying'], stats: { atk: 39, spd: 1 } },
    c5_hd_warmhat: { name: '暖帽', desc: '冬至前後風最大，出門記得戴帽。不容易被吹得昏昏欲睡。', type: 'head', price: 300, ch: 5, icon: 'hat', stats: { def: 10 }, immune: ['sleep'] },
    c5_old_coat: { name: '福伯的老棉襖', desc: '福伯穿了幾十年的棉襖，補丁比布還多，卻很暖。', type: 'armor', price: 0, ch: 5, icon: 'armor', stats: { def: 22, hp: 30 }, immune: ['sleep'] },
    c5_old_hairpin: { name: '紅纓的舊髮簪', desc: '紅纓小時候的髮簪，上面刻著一朵歪歪的梅花。', type: 'head', price: 0, ch: 5, icon: 'hairpin', who: ['hongying'], stats: { def: 11, spd: 5 } },
    c5_lukang_coat: { name: '鹿港風衣', desc: '九曲巷人冬天穿的厚風衣，迎著九降風也走得動。不會被減速。', type: 'armor', price: 0, ch: 5, icon: 'armor', stats: { def: 23 }, immune: ['spdDown'] },
    c5_small_lantern: { name: '小燈籠', desc: '燈籠攤賣的小燈籠，掛在腰上。暗處也不慌。', type: 'acc', price: 450, ch: 5, icon: 'lantern', stats: { luk: 5, def: 3, mp: 10 } },
    c5_feast_candle: { name: '怨宴燭台', desc: '怨宴背上的一支燭台。燭火已經從冷藍轉回了暖黃。', type: 'acc', price: 0, ch: 5, icon: 'misc', stats: { atk: 6, mag: 10 } },
  });

  // ---- enemy skills -----------------------------------------------------------------------------------
  Object.assign(D.skills, {
    c5_e_gulp: { name: '狼吞', desc: '', mp: 0, type: 'phys', elem: 'earth', target: 'enemy', power: 1.6, fx: 'claw', sfx: 'crit' },
    c5_e_shatter: { name: '杯盤狼藉', desc: '', mp: 0, type: 'phys', elem: null, target: 'enemies', power: 0.8, fx: 'slash_multi', sfx: 'shatter' },
    c5_e_wine: { name: '勸酒', desc: '「中元暝……來，喝一杯……」', mp: 0, type: 'mag', elem: null, target: 'enemy', power: 0.7, status: { id: 'sleep', chance: 0.4, turns: 2 }, fx: 'poison', sfx: 'poison' },
    c5_e_seat: { name: '入座', desc: '空著的椅子上，坐下了一個人影。', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['grudge_maid'], fx: 'summon', sfx: 'ghost' },
    c5_e_serve_pig: { name: '上菜・全豬', desc: '', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['c5_plate_pig'], fx: 'summon', sfx: 'ghost' },
    c5_e_serve_turtle: { name: '上菜・紅龜', desc: '', mp: 0, type: 'special', elem: null, target: 'self', power: 0, summon: ['c5_plate_turtle'], fx: 'summon', sfx: 'ghost' },
    c5_e_end: { name: '宴終', desc: '', mp: 0, type: 'mag', elem: 'earth', target: 'enemies', power: 1.3, fx: 'earth', sfx: 'earth' },
    c5_e_offer: { name: '供奉', desc: '', mp: 0, type: 'heal', elem: null, target: 'ally', power: 2.4, fx: 'heal', sfx: 'heal' },
    c5_e_longevity: { name: '添壽', desc: '', mp: 0, type: 'buff', elem: null, target: 'allies', power: 0, buffs: [{ stat: 'def', amt: 0.3, turns: 2 }], fx: 'buff', sfx: 'buff' },
  });

  // ---- enemies (same curve as js/data/enemies.js) --------------------------------------------------------
  function defEnemy(id, d) {
    const c = D.enemyCurve(d.lv);
    const m = Object.assign({ hp: 1, atk: 1, mag: 1, def: 1, spd: 1, luk: 1 }, d.m || {});
    const expM = m.exp != null ? m.exp : 0.55 * m.hp + 0.25 * m.atk + 0.2;
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
    for (const k of ['art', 'variant', 'weak', 'resist', 'immune', 'boss', 'scale']) if (d[k] != null) e[k] = d[k];
    if (d.phases) e.phases = d.phases.map((p) => Object.assign({}, p, { skills: p.skills.map(([sid, w, cond]) => (cond ? { id: sid, w, if: cond } : { id: sid, w })) }));
    D.enemies[id] = e;
  }
  const BOSS_IMM = ['sleep', 'stun', 'trance'];
  defEnemy('c5_feast', {
    name: '怨宴', art: 'grudge_feast', lv: 20, elem: 'earth', weak: ['wood'], resist: ['water'], boss: true, immune: BOSS_IMM,
    m: { hp: 10.5, atk: 2.0, mag: 2.05, def: 1.15, spd: 1.3, exp: 7, gold: 8 },
    skills: [['c5_e_gulp', 3], ['c5_e_shatter', 3], ['c5_e_wine', 2], ['c5_e_seat', 1, 'turn>2'],
      ['c5_e_serve_pig', 2, 'ally_dead'], ['c5_e_serve_turtle', 2, 'ally_dead']],
    phases: [{
      at: 0.5, phase: 2,
      lines: [['', '一陣冷風掃過大廳——所有的燭火，在同一瞬間熄滅了。'], ['怨宴', '天……暗了……宴……才……開始……']],
      msg: '燭火熄滅，四周一片漆黑！',
      skills: [['c5_e_gulp', 3], ['c5_e_shatter', 3], ['c5_e_wine', 2], ['c5_e_seat', 1],
        ['c5_e_serve_pig', 2, 'ally_dead'], ['c5_e_serve_turtle', 2, 'ally_dead'], ['c5_e_end', 3, 'hp<25']],
    }],
    drops: [['c5_feast_candle', 1]],
    desc: '洛家中元夜那一桌沒吃完的宴席。普渡長桌立了起來，長滿了嘴，還在等主人回來入座。',
  });
  defEnemy('c5_plate_pig', {
    name: '祭盤・全豬', art: 'boar_demon', variant: 1, lv: 19, elem: 'earth', weak: ['fire'], immune: ['sleep'], scale: 0.8,
    m: { hp: 1.0, atk: 0.75, mag: 1.25, def: 1.35, spd: 0.85, exp: 0.6, gold: 0.6 },
    skills: [['c5_e_offer', 3], ['attack', 1]],
    desc: '供桌上的全豬，豬頭的眼睛發著藍光。每隔一陣子就把自己「供奉」給怨宴。',
  });
  defEnemy('c5_plate_turtle', {
    name: '祭盤・紅龜', art: 'sand_crab', variant: 2, lv: 19, elem: 'earth', weak: ['fire'], immune: ['sleep'], scale: 0.85,
    m: { hp: 1.0, atk: 0.75, mag: 1.1, def: 1.45, spd: 0.85, exp: 0.6, gold: 0.6 },
    skills: [['c5_e_longevity', 3], ['attack', 1]],
    desc: '一盤紅龜粿，龜殼紋會呼吸。替宴席「添壽」，讓它更難被打散。',
  });

  // ---- troops -----------------------------------------------------------------------------------------------
  Object.assign(D.troops, {
    t_c5_feast: { enemies: ['c5_feast', 'c5_plate_pig', 'c5_plate_turtle'], bg: 'mansion', bgm: 'boss', boss: true, flee: false },
    t_c5_maid: { enemies: ['grudge_maid', 'grudge_maid'], bg: 'mansion', bgm: 'battle' },
    t_c5_shore_a: { enemies: ['jiangshi', 'jiangshi'], bg: 'shore', bgm: 'battle' },
    t_c5_shore_b: { enemies: ['jiangshi', 'hanged_ghost', 'hanged_ghost'], bg: 'shore', bgm: 'battle' },
  });

  // ---- quests -----------------------------------------------------------------------------------------------
  Object.assign(D.quests, {
    q_ch5_main: { name: '鹿港舊夢', desc: '跟著紅纓回到鹿港。洛家古厝的大門，三年沒有打開過。', main: true,
      stages: ['跟紅纓回洛家古厝。（鹿港南端）', '去天后宮打聽清虛真人。', '去九曲巷施家燈籠舖，取回清虛真人訂的燈。',
        '天黑了。提著洛家燈，回洛家古厝。', '探索洛家古厝。', '回大門，跟福伯說一聲。', '回客棧休息。'] },
    q_fubo: { name: '顧門的福伯', desc: '福伯在洛家大門顧了三年。他說，走之前好想吃一片牛舌餅。', lantern: true,
      stages: ['買一片牛舌餅給福伯。（不見天街的牛舌餅攤）', '把牛舌餅交給福伯。'] },
    q_halfwell: { name: '半邊井', desc: '九曲巷的半邊井，一半在王家牆內，一半在牆外。王少爺要把外面那半邊封起來。', lantern: true,
      stages: ['找王少爺談談半邊井。（九曲巷・王家側門）', '問問巷子裡的人：井邊阿婆、牛舌餅阿嬸、打更的阿福伯。', '等天黑，打更阿福伯要去敲鑼。'] },
  });
  if (!D.quests.q_tuanzi_mush) {
    D.quests.q_tuanzi_mush = { name: '糰子的蕈譜', desc: '雲歸想把臺灣的靈蕈畫成一本蕈譜。可是每一種，都先被糰子吃掉了。',
      stages: ['尋找靈蕈。', '蕈譜又多了一格。等待下一種。'] };
  }

  // ============================================================================================ HELPERS
  // tile grid builder (maps are painted with rects instead of hand-typed ASCII)
  function grid(w, h, fill) {
    const c = Array.from({ length: h }, () => Array(w).fill(fill));
    const g = {
      w, h, c,
      rect(x, y, ww, hh, ch) { for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + ww; xx++) if (yy >= 0 && yy < h && xx >= 0 && xx < w) c[yy][xx] = ch; return g; },
      set(x, y, ch) { if (y >= 0 && y < h && x >= 0 && x < w) c[y][x] = ch; return g; },
      rows() { return c.map((r) => r.join('')); },
    };
    return g;
  }
  // party helpers
  const PARTY = ['xinghe', 'baizhi', 'hongying', 'yungui', 'tuanzi'];
  function place(S, list) { for (const [id, x, y, d] of list) S.setPos(id, x, y, d); }
  function hasActor(id) { const m = G.mapScene; return !!(m && m.actor(id)); }

  // lighting per time of day (鹿港 outdoor maps)
  function townLight(s) {
    const t = time5(s);
    if (t === 1) return { ambient: 0.35, color: '#2a1408', playerR: 200, tint: 'rgba(255,150,80,0.10)' };
    if (t === 2) return { ambient: 0.62, color: '#060a20', playerR: 210 };
    if (t === 3) return { ambient: 0.08, color: '#101830', tint: 'rgba(200,220,255,0.06)' };
    if (t === 4) return { ambient: 0.55, color: '#0a0818', playerR: 220 };
    return { ambient: 0.15, color: '#3a2a10', tint: 'rgba(210,180,110,0.10)' };
  }
  function townBgm(s) { const t = time5(s); return t === 2 ? 'night' : t === 4 ? 'festival' : 'city'; }
  function setTime(S, n) {
    G.state.vars.ch5_time = n;
    const m = G.mapScene;
    if (m && m.def.c5town) { S.light(Object.assign({ tint: null }, townLight())); m.c5zone = null; }
  }
  function townParticles(s, covered) {
    const t = time5(s);
    if (t === 4) return ['embers', 'lanterns'];
    if (covered) return [{ type: 'dust', density: 0.4 }];
    if (t === 3) return [{ type: 'wind', density: 0.5 }];
    return [{ type: 'wind', density: 1.3 }, { type: 'dust', density: 1.2 }];
  }
  // screen-space HUD drawing from inside drawOver (which is in world space)
  function screenSpace(ctx, ms, fn) {
    ctx.save();
    ctx.translate(Math.round(ms.cam.x * 2) / 2, Math.round(ms.cam.y * 2) / 2);
    fn(ctx);
    ctx.restore();
  }

  // ============================================================================================ CHAPTER START
  G.Story.ch5 = async (S) => {
    S.chapter(5);
    const s = G.state;
    // party: 星河、白芷、紅纓、雲歸（＋糰子）
    const act = G.Party.active();
    const avg = act.length ? Math.round(act.reduce((a, m) => a + m.lv, 0) / act.length) : 16;
    const lv = Math.max(16, avg);
    for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) {
      if (!s.members[id]) G.Party.join(id, lv);
      else if (!s.party.includes(id)) G.Party.join(id);
      G.Story.ensureLevel(id, 16);
    }
    s.flags.tuanzi_hidden = false;
    s.vars.ch5_time = 0;
    s.vars.c5_mem = 0;
    await S.titleCard(G.Chapters[5], '鹿港・冬至前一日');
    await S.travel('hsinchu', 'lukang', { label: '沿著海線官道南下，東北季風一路推著背……' });
    S.quest('q_ch5_main', 0);
    S.objective('跟紅纓回洛家古厝（鹿港南端）');
    await S.warp('lukang', 48, 3, 'down', { fade: 0.6 });
  };

  // ============================================================================================ 鹿港街 lukang (56×42)
  const LK = (() => {
    const g = grid(56, 42, ':');
    g.rect(0, 0, 56, 2, 'R');            // north wall
    g.rect(48, 0, 2, 2, '=');            // 官道（來時路）
    g.rect(0, 40, 56, 2, 'R');           // south wall
    g.rect(26, 40, 4, 2, '#');           // south road → 洛家古厝
    g.rect(54, 0, 2, 42, 'R');           // east wall
    g.rect(54, 9, 2, 2, '%');            // 巷口 → 九曲巷
    // west harbour: silted port
    g.rect(0, 2, 2, 38, '~'); g.rect(2, 2, 1, 38, '-'); g.rect(3, 2, 4, 38, 'm'); g.rect(7, 2, 3, 38, 's');
    g.rect(0, 32, 10, 2, 's');           // sand path to 舊港
    // temple plaza
    g.rect(16, 2, 24, 9, '%');
    g.rect(26, 10, 4, 4, '#');           // street down to 不見天
    // 不見天街
    g.rect(10, 14, 34, 4, '#');
    // east square (客棧・藥鋪) and lane to 九曲巷
    g.rect(44, 8, 10, 16, '#'); g.rect(44, 9, 10, 2, '%');
    // south lane and road
    g.rect(10, 23, 36, 2, '#');
    g.rect(26, 18, 4, 22, '#');
    // little grass tufts in winter
    g.rect(12, 30, 3, 1, ','); g.rect(40, 36, 4, 2, ','); g.rect(46, 26, 6, 2, ',');
    g.rect(21, 30, 5, 3, '%');           // 公井 square
    return g.rows();
  })();
  const shop = (x, y, text, v) => ({ t: 'shophouse', x, y, text, v, door: 1 });
  const COVER = { x: 16, y: 14, w: 24, h: 4 };   // 不見天 covered street
  const inCover = (x, y) => x >= COVER.x && x < COVER.x + COVER.w && y >= COVER.y && y < COVER.y + COVER.h;

  G.Maps.define('lukang', {
    name: '鹿港',
    subtitle: (s) => (time5(s) === 4 ? '除夕' : time5(s) === 3 ? '冬至' : '一府二鹿三艋舺'),
    place: 'lukang',
    c5town: true,
    bgm: townBgm,
    start: [48, 3],
    light: (s) => townLight(s),
    particles: (s) => townParticles(s, false),
    tiles: LK,
    objects: [
      { t: 'mazu_temple', x: 25, y: 3, text: '天后宮' },
      { t: 'statue_lion', x: 24, y: 7 }, { t: 'statue_lion', x: 31, y: 7, flip: true },
      { t: 'incense_burner', x: 30, y: 8 },
      { t: 'stone_lantern', x: 22, y: 4 }, { t: 'stone_lantern', x: 33, y: 4 },
      { t: 'banner', x: 21, y: 6, color: '#c83a2a', text: '媽祖' }, { t: 'banner', x: 34, y: 6, color: '#c83a2a', text: '天后' },
      // 菜市
      { t: 'stall', x: 36, y: 3, text: '菜', v: 1 }, { t: 'stall', x: 36, y: 6, text: '魚', v: 2 },
      { t: 'basket', x: 38, y: 3 }, { t: 'basket', x: 38, y: 6 }, { t: 'crate', x: 39, y: 4 },
      // trees & yard west of the plaza
      { t: 'tree_camphor', x: 12, y: 3 }, { t: 'tree_dead', x: 14, y: 8 }, { t: 'tree_camphor', x: 42, y: 3 }, { t: 'tree_dead', x: 46, y: 5 },
      { t: 'signboard', x: 25, y: 9, text: '不見天' },
      // north shophouses of 不見天街
      shop(10, 11, '牛舌餅', 0), shop(14, 11, '麵線糊', 1), shop(18, 11, '燈籠', 2), shop(22, 11, '布行', 3),
      shop(30, 11, '金紙', 0), shop(34, 11, '兵器', 1), shop(38, 11, '雜貨', 2),
      // south shophouses (backs to the arcade)
      shop(12, 20, '餅舖', 3), shop(16, 20, '香舖', 0), shop(20, 20, '錫器', 1), shop(31, 20, '米行', 2), shop(35, 20, '木雕', 3), shop(39, 20, '當舖', 0),
      // stalls under the arcade
      { t: 'stall', x: 12, y: 18, text: '牛舌餅', counter: true, v: 0 }, { t: 'stall', x: 16, y: 18, text: '麵線糊', counter: true, v: 1 },
      { t: 'stall', x: 20, y: 18, text: '燈籠', v: 2 }, { t: 'lantern_rack', x: 22, y: 18 },
      { t: 'stall', x: 33, y: 18, text: '蚵仔煎', v: 3 }, { t: 'stall', x: 37, y: 18, text: '菜市', v: 1 },
      { t: 'lantern_string', x: 17, y: 14, w: 5, lift: 20 }, { t: 'lantern_string', x: 24, y: 14, w: 2, lift: 20 }, { t: 'lantern_string', x: 30, y: 14, w: 5, lift: 20 },
      { t: 'lantern_string', x: 17, y: 17, w: 5, lift: 10, v: 1 }, { t: 'lantern_string', x: 30, y: 17, w: 6, lift: 10, v: 1 },
      // east square
      { t: 'house_minnan', x: 47, y: 11, door: 2, v: 0 }, { t: 'signboard', x: 46, y: 13, text: '客棧' },
      shop(47, 17, '藥鋪', 1), { t: 'herbs_rack', x: 51, y: 19 },
      { t: 'signboard', x: 51, y: 8, text: '往九曲巷' }, { t: 'barrel', x: 45, y: 21 }, { t: 'crate', x: 52, y: 22 }, { t: 'cart', x: 44, y: 19 },
      { t: 'red_lantern', x: 46, y: 9, hang: true }, { t: 'red_lantern', x: 52, y: 11, hang: true },
      // harbour
      { t: 'boat_small', x: 3, y: 8 }, { t: 'boat_small', x: 4, y: 14 }, { t: 'boat_small', x: 3, y: 21 }, { t: 'boat_small', x: 4, y: 27 },
      { t: 'dock_post', x: 2, y: 11 }, { t: 'dock_post', x: 2, y: 18 }, { t: 'dock_post', x: 2, y: 25 },
      { t: 'fishing_net', x: 7, y: 25 }, { t: 'barrel', x: 8, y: 5 }, { t: 'crate', x: 9, y: 6 }, { t: 'barrel', x: 9, y: 29 },
      { t: 'reeds', x: 5, y: 4 }, { t: 'reeds', x: 6, y: 11 }, { t: 'reeds', x: 5, y: 19 }, { t: 'reeds', x: 6, y: 30 }, { t: 'reeds', x: 4, y: 36 },
      // residences
      { t: 'house_minnan', x: 11, y: 26, v: 0 }, { t: 'house_minnan', x: 17, y: 26, v: 1 },
      { t: 'house_minnan', x: 32, y: 26, v: 1 }, { t: 'house_minnan', x: 38, y: 26, v: 0 },
      { t: 'house_minnan', x: 11, y: 34, v: 1 }, { t: 'house_minnan', x: 17, y: 34, v: 0 },
      { t: 'house_minnan', x: 32, y: 34, v: 0 }, { t: 'house_minnan', x: 38, y: 34, v: 1 },
      { t: 'well', x: 23, y: 31 }, { t: 'bucket', x: 22, y: 32 }, { t: 'laundry', x: 13, y: 30 }, { t: 'laundry', x: 34, y: 31 },
      { t: 'tree_banyan', x: 46, y: 28 }, { t: 'bench', x: 46, y: 32 },
      { t: 'jar', x: 16, y: 29 }, { t: 'jar', x: 37, y: 29 }, { t: 'basket', x: 43, y: 34 }, { t: 'tree_dead', x: 50, y: 34 },
      { t: 'signboard', x: 30, y: 38, text: '洛家古厝' }, { t: 'tree_dead', x: 24, y: 38 }, { t: 'tree_dead', x: 31, y: 36 },
      // 除夕：家家戶戶點燈
      { t: 'lantern_string', x: 26, y: 24, w: 4, v: 1, if: (s) => time5(s) === 4 },
      { t: 'red_lantern', x: 13, y: 29, hang: true, if: (s) => time5(s) >= 2 }, { t: 'red_lantern', x: 34, y: 29, hang: true, if: (s) => time5(s) >= 2 },
    ],
    lights: (s) => (time5(s) >= 1 ? [
      { x: 27, y: 7, r: 150, color: '#ffb060', flicker: 0.2 }, { x: 13, y: 16, r: 120, color: '#ffa050', flicker: 0.3 },
      { x: 21, y: 16, r: 120, color: '#ffa050', flicker: 0.3 }, { x: 33, y: 16, r: 120, color: '#ffa050', flicker: 0.3 },
      { x: 38, y: 16, r: 120, color: '#ffa050', flicker: 0.3 }, { x: 49, y: 15, r: 120, color: '#ffb060', flicker: 0.2 },
      { x: 23, y: 31, r: 100, color: '#ffc080', flicker: 0.2 },
    ] : []),
    chests: [{ id: 'c5_01', x: 6, y: 14, item: 'xumingsan', n: 2 }],
    npcs: [
      { id: 'lk_niushe', sprite: 'shopkeeper_f', name: '牛舌餅阿嬸', x: 12, y: 17, dir: 'down', fixedDir: false, talk: (S, n) => niusheTalk(S, n) },
      { id: 'lk_mianxian', sprite: 'villager_m2', name: '麵線糊頭家', x: 17, y: 17, dir: 'down', if: (s) => time5(s) < 2,
        talk: ['麵線糊、麵線糊！熱呼呼一碗，配油蔥、配大腸！', '冬至前後風最大，吃一碗再走，身軀才會燒。'] },
      { id: 'lk_lantern_stall', sprite: 'merchant', name: '燈籠攤小販', x: 21, y: 17, dir: 'down', if: (s) => time5(s) < 3,
        talk: async (S) => {
          await S.say('燈籠攤小販', '鹿港的燈籠，全台灣都有名！師傅都在九曲巷裡面，施師傅的手最巧。');
          await S.say('燈籠攤小販', '九曲巷彎來彎去，是為了擋風。你走直的，會被風吹回來！');
          const c = await S.choice(['看看燈籠', '不用了'], { cancel: 1 });
          if (c === 0) await S.shop(['c5_small_lantern'], { title: '燈籠攤' });
        } },
      { id: 'lk_oyster', sprite: 'fisher_f', name: '蚵仔煎阿姨', x: 34, y: 17, dir: 'down', if: (s) => time5(s) < 2,
        talk: async (S) => {
          await S.say('蚵仔煎阿姨', '鹿港海口的蚵仔，粒粒飽滿！煎得外酥內嫩，淋上紅醬——');
          const c = await S.choice(['來一份', '下次吧'], { cancel: 1 });
          if (c === 0) await S.shop(['ezaijian', 'c5_mianxian'], { title: '蚵仔煎攤' });
        } },
      { id: 'lk_child', sprite: 'child_f', name: '阿圓', x: 25, y: 16, dir: 'down', wander: 2, if: (s) => time5(s) < 2,
        talk: async (S) => {
          await S.say('阿圓', '明天冬至！要搓湯圓！食圓仔加一歲！');
          if (hasActor('baizhi')) {
            await S.say('baizhi:think', '吃一顆就加一歲嗎？那吃兩顆呢？');
            await S.say('阿圓', '……加兩歲？');
            S.emote('baizhi', '!');
            await S.say('baizhi:surprise', '！');
          }
        } },
      { id: 'lk_scholar', sprite: 'scholar', name: '黃秀才', x: 21, y: 8, dir: 'right', if: (s) => time5(s) < 2,
        talk: async (S) => {
          await S.say('黃秀才', '天后宮的媽祖，是從湄洲祖廟渡海請來的。你們看媽祖的臉——');
          await S.say('黃秀才', '是黑的。幾百年的香火，把金面燻成了黑面。拜的人越多，臉越黑。');
          await S.say('黃秀才', '九曲巷又叫九彎十八拐。冬天九降風夾著沙，直巷子會被吹成風洞。拐了彎，風就散了。');
          await S.say('黃秀才', '巷口那些隘門，晚上關起來，盜賊也進不來。鹿港人是很精的。');
        } },
      { id: 'lk_fisher', sprite: 'fisherman', name: '阿海公', x: 8, y: 20, dir: 'left', wander: 1,
        talk: async (S) => {
          await S.say('阿海公', '以前鹿港港口，泉州蚶江的大船直直開進來。現在？你看，泥愈積愈高，船都擱淺了。');
          await S.say('阿海公', '鹿港要沒落了。不過啊，一府二鹿三艋舺，這句話還沒人敢改。');
          await S.say('阿海公', '討海人最怕起風暴。風最大的時候，桅杆頂會亮起一點紅光——那是媽祖的燈。看到了，就知道會平安。');
          if (time5() < 2) await S.say('阿海公', '南邊那片舊港仔，暗時才看得清楚。白天風太大，沙會吹進目睭。');
        } },
      { id: 'lk_gossip1', sprite: 'villager_f', name: '洗衣阿姨', x: 22, y: 30, dir: 'right', if: (s) => time5(s) < 2, talk: (S) => gossipTalk(S, 0) },
      { id: 'lk_gossip2', sprite: 'villager_f2', name: '洗衣阿姨', x: 24, y: 32, dir: 'left', if: (s) => time5(s) < 2, talk: (S) => gossipTalk(S, 1) },
      { id: 'lk_doctor', sprite: 'doctor', name: '藥鋪先生', x: 50, y: 20, dir: 'down',
        talk: async (S) => {
          await S.say('藥鋪先生', '冬天風邪入骨，最要緊是顧身體。要什麼藥材，儘管說。');
          await S.shop(['jinchuang', 'xumingsan', 'jiedu', 'xiangbao', 'huanhunxiang', 'xiancao', 'c5_ginger_tea', 'c5_zhenshi', 'fu_dingshen'], { title: '鹿港藥鋪' });
        } },
      { id: 'lk_pilgrim', sprite: 'pilgrim', name: '香客', x: 28, y: 9, dir: 'up', wander: 1, if: (s) => time5(s) < 2,
        talk: ['我從大甲走來的。進香要誠心，腳痠也不能喊。', '媽祖保庇，一路平安。'] },
      { id: 'lk_walker', sprite: 'villager_m', name: '路人', x: 31, y: 15, dir: 'left', wander: 3, if: (s) => time5(s) < 2,
        talk: ['外面風大得要命，走進不見天，風就停了。', '這條街的屋簷一間接一間，下雨也淋不到。你說古早人巧不巧？'] },
      { id: 'lk_old', sprite: 'old_f', name: '阿婆', x: 41, y: 31, dir: 'down', wander: 2,
        talk: async (S) => {
          if (flag('ch5_unmask')) { await S.say('阿婆', '洛家古厝昨暝好像比較安靜了……是不是有人去給他們上香了？'); return; }
          await S.say('阿婆', '南邊那間洛家古厝，暗時會聽到有人在裡面掃地。');
          await S.say('阿婆', '掃地的聲音很輕、很慢……像一個老人家。');
        } },
      { id: 'lk_sailor', sprite: 'sailor', name: '船工', x: 8, y: 9, dir: 'down', if: (s) => time5(s) < 2,
        talk: ['港道一年淤一尺，大船都改去別的港口了。', '我阿公說，以前這裡一暝到天光都有船在卸貨。'] },
    ],
    events: [
      { id: 'c5_arrive', trigger: 'auto', if: (s) => !s.flags.ch5_start, run: (S) => sceneArrive(S) },
      { id: 'c5_road_back', trigger: 'touch', x: 48, y: 1, w: 2, h: 1, run: async (S) => {
        await S.say('xinghe:think', '這是來時的官道……先把鹿港的事辦完吧。');
        await S.move('player', 'D');
      } },
      { id: 'c5_well_pub', trigger: 'action', x: 23, y: 31, label: '公井', run: async (S) => {
        await S.say('', '鹿港街上的公井。井水冰冷，映著灰黃的天。');
      } },
      { id: 'c5_temple_note', trigger: 'action', x: 27, y: 9, label: '看匾', run: async (S) => {
        await S.say('', '「天后宮」——鹿港人的媽祖廟。燕尾脊高高翹起，像要迎著風飛出去。');
      } },
    ],
    warps: [
      { x: 27, y: 6, w: 2, to: 'lukang_mazu', tx: 11, ty: 15, tdir: 'up', door: true },
      { x: 35, y: 13, to: 'lukang_shop', tx: 6, ty: 7, tdir: 'up', door: true },
      { x: 49, y: 13, to: 'lukang_inn', tx: 6, ty: 8, tdir: 'up', door: true },
      { x: 55, y: 9, h: 2, to: 'lukang_jiuqu', tx: 1, ty: 3, tdir: 'right' },
      { x: 26, y: 41, w: 4, to: 'luo_gate', tx: 9, ty: 12, tdir: 'up' },
      { x: 0, y: 32, h: 2, to: 'lukang_shore', tx: 34, ty: 12, tdir: 'left', run: async (S) => {
        if (time5() === 2) return true;
        await S.say('', '港邊風太大，沙吹得睜不開眼睛，什麼都看不清楚。');
        await S.move('player', 'R');
        return false;
      } },
    ],
    onUpdate(dt, ms) {
      // 不見天：走進長廊，風停、光線變暗
      const p = ms.player;
      const cov = inCover(p.x, p.y);
      if (ms.c5zone !== cov) {
        ms.c5zone = cov;
        ms.particles = new G.FX.Particles(townParticles(G.state, cov), ms);
      }
      const base = townLight().ambient;
      const target = cov ? Math.max(base, 0.35) : base;
      if (ms.lightCfg && !G.Script.busy()) ms.lightCfg.ambient += (target - ms.lightCfg.ambient) * Math.min(1, dt * 3);
    },
    drawOver(ctx, t, ms) {
      // 不見天：連成一片的屋簷（半透明，走進去時變淡）
      const p = ms.player;
      const inside = inCover(p.x, p.y);
      ms.c5coverA = (ms.c5coverA == null ? 1 : ms.c5coverA) + ((inside ? 0.22 : 0.9) - (ms.c5coverA == null ? 1 : ms.c5coverA)) * 0.12;
      const x0 = COVER.x * T, y0 = COVER.y * T - 30, w = COVER.w * T, h = COVER.h * T + 10;
      ctx.save();
      ctx.globalAlpha = ms.c5coverA;
      const gr = ctx.createLinearGradient(0, y0, 0, y0 + h);
      gr.addColorStop(0, '#3a1e14'); gr.addColorStop(0.15, '#6a3420'); gr.addColorStop(0.85, '#5a2a1a'); gr.addColorStop(1, '#2a140c');
      ctx.fillStyle = gr;
      ctx.fillRect(x0, y0, w, h);
      // roof tiles
      ctx.strokeStyle = 'rgba(30,12,6,0.55)'; ctx.lineWidth = 2;
      for (let x = x0 + 8; x < x0 + w; x += 16) { ctx.beginPath(); ctx.moveTo(x, y0 + 6); ctx.lineTo(x, y0 + h - 8); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,190,120,0.18)'; ctx.lineWidth = 1;
      for (let y = y0 + 20; y < y0 + h - 8; y += 22) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); }
      // eave beams & ridge
      ctx.fillStyle = '#2a1008'; ctx.fillRect(x0 - 6, y0 - 4, w + 12, 10); ctx.fillRect(x0 - 6, y0 + h - 8, w + 12, 10);
      ctx.fillStyle = '#b8382a'; ctx.fillRect(x0 - 6, y0 + h - 2, w + 12, 3);
      ctx.restore();
      if (ms.c5coverA < 0.6) {
        // seen from below: dark rafters only
        ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#1a0a04';
        for (let x = x0; x < x0 + w; x += T * 3) ctx.fillRect(x, y0, 6, h);
        ctx.restore();
      }
    },
  });

  // ---- 鹿港 NPC scripts ---------------------------------------------------------------------------------
  async function niusheTalk(S) {
    const s = G.state;
    const qWell = G.Quests.stage('q_halfwell');
    if (qWell === 1 && !G.Quests.isDone('q_halfwell') && !(s.vars.c5_well && s.vars.c5_well.niushe)) {
      await S.say('牛舌餅阿嬸', '王家？我阿爸開店的時候，麵粉是跟王家賒的。賒了三年，沒收過一文利息。');
      await S.say('牛舌餅阿嬸', '帳本還在。我阿爸說，這種帳不能丟，要記一輩子。');
      await S.give('c5_old_ledger');
      s.vars.c5_well = Object.assign({}, s.vars.c5_well, { niushe: true });
      await wellCheck(S);
      return;
    }
    if (G.Quests.stage('q_fubo') === 0 && !G.Quests.isDone('q_fubo')) {
      if (!S.hasItem('niushebing')) {
        await S.say('牛舌餅阿嬸', '要買給洛家的福伯？……那個老人家，以前每天來，買一片，藏在袖子裡帶回去。');
        await S.say('牛舌餅阿嬸', '這片阿嬸請。替我跟他說——今年的牛舌餅，跟以前一樣酥。');
        await S.give('niushebing');
        G.Quests.set('q_fubo', 1);
        S.objective('把牛舌餅交給福伯（洛家古厝大門）');
        return;
      }
    }
    if (!s.flags.ch5_niushe_talk) {
      s.flags.ch5_niushe_talk = true;
      await S.say('牛舌餅阿嬸', '鹿港牛舌餅，薄薄的、酥酥的，跟宜蘭那種厚的不一樣喔！');
      await S.say('牛舌餅阿嬸', '為什麼叫牛舌餅？你看它的形——長長扁扁，像不像牛的舌頭？');
      if (hasActor('tuanzi')) {
        await S.say('tuanzi:surprise', '牛的舌頭！？');
        await S.say('牛舌餅阿嬸', '是形狀啦！沒有牛！');
        await S.say('tuanzi:smile', '那吾放心了。吾要十片。');
      }
      if (hasActor('hongying')) {
        S.emote('hongying', '…');
        await S.say('hongying:sad', '……福伯以前，每次都偷買這個給我。藏在袖子裡，碎得一塌糊塗。');
      }
    } else {
      await S.say('牛舌餅阿嬸', time5() >= 2 ? '這麼晚了還沒睏？來，最後一爐，算你們便宜。' : '剛出爐的牛舌餅，燒燙燙喔！');
    }
    await S.shop(['niushebing', 'c5_mianxian', 'ezaijian'], { title: '牛舌餅攤' });
  }

  async function gossipTalk(S, who) {
    if (who === 0) {
      await S.say('洗衣阿姨', '洛家古厝喔？三年前中元暝，一家二十幾口……唉，莫講莫講。');
      await S.say('洗衣阿姨', '聽講是一個戴鬼面的劍客殺的。有人看見他拿著血劍，站在屍體中間。');
    } else {
      await S.say('洗衣阿姨', '可是我阿叔那暝也在場，伊講——那個鬼面，好像在對著空氣砍。砍得要死要活。');
      if (hasActor('hongying')) { S.emote('hongying', '?'); await S.say('hongying:serious', '……對著空氣砍？'); }
      await S.say('洗衣阿姨', '後來門就關了，貼了符，晚上會聽到有人在裡面掃地。');
    }
  }

  // ---- §3-1 序：風沙中的鹿港 ---------------------------------------------------------------------------------
  async function sceneArrive(S) {
    S.flag('ch5_start');
    G.state.vars.ch5_time = 0;
    S.hideFollowers(false);
    place(S, [['player', 48, 3, 'down'], ['baizhi', 47, 2, 'down'], ['hongying', 49, 2, 'down'], ['yungui', 48, 2, 'down'], ['tuanzi', 50, 3, 'down']]);
    S.shake(3, 0.6); S.sfx('wind');
    await S.wait(0.4);
    S.move('tuanzi', 'RR', { speed: 6, wait: false });
    await S.say('tuanzi:surprise', '吾——要——飛——走——了——');
    await S.walkTo('hongying', 51, 3);
    S.face('hongying', 'right');
    await S.jump('tuanzi');
    S.setPos('tuanzi', 50, 3, 'left');
    S.emote('hongying', '…');
    await S.say('', '（紅纓一把抓住糰子的尾巴，塞進懷裡。）');
    await S.say('tuanzi:smile', '……紅纓姐姐的懷裡好暖。');
    await S.say('yungui:normal', '冬天的鹿港，風是出了名的。竹塹有九降風，這裡也不遑多讓。');
    await S.say('xinghe:laugh', '我嘴巴裡都是沙了！');
    await S.say('baizhi:think', '星河，你在吃沙嗎？好吃嗎？');
    await S.say('xinghe:angry', '不是在吃！');
    await S.camera(27, 15, 1.4);
    await S.say('yungui:normal', '一府二鹿三艋舺——這是「二」。');
    await S.say('baizhi:smile', '比艋舺熱鬧嗎？');
    S.cameraFollow();
    await S.wait(0.6);
    S.face('player', 'right');
    await S.say('xinghe:smile', '紅纓，妳家這裡——');
    S.move('hongying', 'DDD', { wait: false });
    await S.wait(0.9);
    S.face('hongying', 'down');
    await S.say('', '（紅纓已經不在身邊。她站在幾步外，望著街的南端，一動不動。）');
    S.face('player', 'down');
    await S.say('xinghe:think', '……紅纓？');
    await S.say('hongying:normal', '三年了。');
    await S.say('hongying:normal', '那天晚上我從天后宮跑回家，就是走這條街。');
    S.face('hongying', 'up');
    await S.say('hongying:serious', '先回家。我要先回家看一眼。');
    await S.say('baizhi:sad', '紅纓……');
    S.face('yungui', 'right');
    await S.say('yungui:serious', '（低聲）師父的線索在這裡斷了。她家……可能也有關係。');
    S.gather();
    S.quest('q_ch5_main', 0);
    S.objective('跟紅纓回洛家古厝（鹿港南端）');
  }

  // ============================================================================================ 天后宮 lukang_mazu (24×18)
  const MZ = (() => {
    const g = grid(24, 18, 'T');
    g.rect(0, 0, 24, 2, 'E'); g.rect(0, 0, 1, 18, 'E'); g.rect(23, 0, 1, 18, 'E'); g.rect(0, 16, 24, 2, 'E');
    g.rect(11, 16, 2, 2, 'T');           // door
    g.rect(11, 4, 2, 12, 'c');           // red carpet aisle
    g.rect(1, 2, 22, 1, 'T');
    return g.rows();
  })();
  G.Maps.define('lukang_mazu', {
    name: '鹿港天后宮',
    subtitle: '湄洲渡海而來的媽祖',
    place: 'lukang',
    bgm: 'temple',
    start: [11, 14],
    light: { ambient: 0.3, color: '#1a0a06', playerR: 180 },
    particles: ['motes'],
    tiles: MZ,
    objects: [
      { t: 'altar', x: 11, y: 2 },
      { t: 'brazier', x: 8, y: 3 }, { t: 'brazier', x: 15, y: 3 },
      { t: 'mural', x: 3, y: 1, v: 2 }, { t: 'mural', x: 18, y: 1, v: 2 },
      { t: 'pillar', x: 7, y: 5 }, { t: 'pillar', x: 16, y: 5 }, { t: 'pillar', x: 7, y: 9 }, { t: 'pillar', x: 16, y: 9 },
      { t: 'pillar', x: 7, y: 13 }, { t: 'pillar', x: 16, y: 13 },
      { t: 'incense_burner', x: 13, y: 9 },
      { t: 'bell_tower', x: 2, y: 11 }, { t: 'drum', x: 20, y: 11 },
      { t: 'divination_blocks', x: 10, y: 4 }, { t: 'fortune_sticks', x: 13, y: 4 },
      { t: 'red_lantern', x: 6, y: 4, hang: true }, { t: 'red_lantern', x: 17, y: 4, hang: true },
      { t: 'red_lantern', x: 6, y: 12, hang: true }, { t: 'red_lantern', x: 17, y: 12, hang: true },
      { t: 'plant_pot', x: 1, y: 3, v: 1 }, { t: 'plant_pot', x: 22, y: 3, v: 2 },
      { t: 'bench', x: 3, y: 7 }, { t: 'bench', x: 19, y: 7 },
    ],
    npcs: [
      // 千里眼、順風耳：只作陳設
      { id: 'mz_qianliyan', sprite: 'qianliyan', x: 5, y: 3, dir: 'down', fixedDir: true },
      { id: 'mz_shunfenger', sprite: 'shunfenger', x: 18, y: 3, dir: 'down', fixedDir: true },
      { id: 'lk_mazu_keeper', sprite: 'temple_keeper', name: '許廟公', x: 14, y: 6, dir: 'left', talk: async (S) => {
        const t = time5();
        if (t === 4) await S.say('許廟公', '明年正月，媽祖也要過年。你們若在府城，記得去大天后宮上一炷香。');
        else if (flag('ch5_lamp')) await S.say('許廟公', '燈籠做好了？媽祖保庇，進去小心。');
        else if (flag('ch5_mazu')) await S.say('許廟公', '施師傅的燈籠舖在九曲巷裡面。巷子彎彎曲曲，要順著彎走，莫走直的。');
        else await S.say('許廟公', '入廟先拜媽祖，出海才會平安。');
      } },
      { id: 'mz_pilgrim', sprite: 'old_f', name: '老香客', x: 9, y: 8, dir: 'up', if: (s) => time5(s) < 2,
        talk: ['我年年都來替討海的囝仔上香。', '一人一炷香，媽祖就不孤單。'] },
    ],
    events: [
      { id: 'c5_mazu_scene', trigger: 'auto', if: (s) => s.flags.ch5_gate && !s.flags.ch5_mazu, run: (S) => sceneMazu(S) },
      { id: 'c5_mazu_altar', trigger: 'action', x: 11, y: 2, w: 2, h: 1, label: '參拜', run: async (S) => {
        await S.say('', '神龕前香煙繚繞，燭火靜靜地亮著。幾百年的香火，把神龕都燻得烏黑發亮。');
        await S.say('', '「黑面媽祖」——拜的人越多，就越黑。');
        if (hasActor('baizhi')) await S.say('baizhi:smile', '一人一炷香……我也想上一炷。');
      } },
      { id: 'c5_mazu_mural', trigger: 'action', x: 3, y: 1, w: 2, h: 1, label: '看壁畫', run: async (S) => {
        await S.say('', '壁畫上，一艘船在黑水溝的巨浪裡翻滾，桅杆頂上亮著一點小小的紅光。');
      } },
      { id: 'c5_mazu_mural2', trigger: 'action', x: 18, y: 1, w: 2, h: 1, label: '看壁畫', run: async (S) => {
        await S.say('', '壁畫上畫著渡海的人。他們抱著神像，一直唸、一直唸，望著遠方的一盞燈。');
      } },
    ],
    warps: [{ x: 11, y: 17, w: 2, to: 'lukang', tx: 27, ty: 7, tdir: 'down', door: true }],
  });

  // ---- §3-3 天后宮：媽祖的燈 --------------------------------------------------------------------------------
  async function sceneMazu(S) {
    S.flag('ch5_mazu');
    S.hideFollowers(false);
    place(S, [['player', 11, 11, 'up'], ['baizhi', 12, 11, 'up'], ['hongying', 11, 12, 'up'], ['yungui', 12, 12, 'up'], ['tuanzi', 10, 12, 'up']]);
    await S.camera(11, 6, 0.6);
    await S.move('player', 'UU');
    S.move('baizhi', 'UUU', { wait: false });
    await S.move('hongying', 'UU');
    S.move('yungui', 'UU', { wait: false });
    S.face('baizhi', 'up');
    await S.say('baizhi:think', '……她的臉是黑色的。');
    S.face('lk_mazu_keeper', 'left');
    await S.say('許廟公', '那是幾百年的香火燻的。黑面媽祖，是鹿港人最親的媽祖。');
    await S.say('許廟公', '我們的媽祖，是從湄洲祖廟，一路渡過黑水溝請來的。');
    await S.say('許廟公', '那時候的人，過海是拿命在賭。六死三留一回頭。');
    await S.say('許廟公', '船在黑水溝裡翻滾的時候，他們就抱著媽祖的神像，一直唸、一直唸。');
    await S.say('許廟公', '老一輩的討海人說，風暴最大的時候，桅杆頂上會亮起一點紅光。');
    await S.say('許廟公', '那是媽祖點的燈。看到那盞燈，就知道——有人在海上替你照路。');
    S.sfx('bell');
    await S.say('', '（殿內的燭火，在無風的殿中，輕輕朝白芷的方向傾了一下，又直了。）');
    await S.say('baizhi:sad', '……替人照路的燈。');
    await S.say('baizhi:think', '她……一定很累吧。每一個人都要照。');
    await S.say('許廟公', '（微笑）所以才要大家一起拜啊。一人一炷香，媽祖就不孤單。');
    await S.say('xinghe:think', '（一人一炷香……）');
    S.face('yungui', 'lk_mazu_keeper');
    await S.say('yungui:normal', '廟公，打聽個人。一個月前，有沒有一個灰袍道士在這裡借宿？鬍子很長，講話很欠揍。');
    S.emote('lk_mazu_keeper', '!');
    await S.say('許廟公', '清虛道長？有啊！他住了三暝。每暝都去洛家古厝門口站到天光。');
    await S.say('許廟公', '最後一暝，他在門上貼了一張符，回來說：「那屋裡有一場永遠吃不完的宴席。」');
    await S.say('許廟公', '他說，符只能封，不能解。要解，得有人進去。');
    await S.say('許廟公', '「要進那間厝，得提一盞燈——一盞愛過那間厝的人親手點的燈。」');
    await S.say('許廟公', '他去九曲巷的施師傅那裡訂了一盞燈，可是燈還沒做好，他就急著往府城去了。');
    await S.say('yungui:serious', '府城。');
    await S.say('許廟公', '他說要去看看那個「長明宮」。說那宮裡的燈，跟洛家門口那股冷風，是同一種味道。');
    S.emote('hongying', '!');
    await S.say('hongying:surprise', '長明宮……和我家？');
    await S.say('yungui:serious', '……鬼面身上也有長明宮的燈味。在觀音山的時候。');
    await S.say('hongying:angry', '（握緊槍）所以那天晚上……是長明宮——');
    S.face('player', 'hongying');
    await S.say('xinghe:serious', '紅纓。先進去。進去了，才知道那天晚上到底發生什麼。');
    await S.say('hongying:serious', '……嗯。');
    S.cameraFollow();
    S.emote('baizhi', '?');
    const c = await S.choice(['讓白芷擲筊', '離開'], { cancel: 1 });
    if (c === 0) {
      await S.say('baizhi:think', '廟公，我可以問媽祖一個問題嗎？');
      await S.say('許廟公', '當然。誠心問，媽祖會應。');
      await S.walkTo('baizhi', 12, 4, { yFirst: true });
      S.face('baizhi', 'up');
      await S.say('baizhi:serious', '（學著雲歸在龍山寺的樣子跪下，捧筊）媽祖婆婆。紅纓……回家以後，會好好的嗎？');
      await G.Mini.jiaobei({ throws: 3, results: ['sheng', 'sheng', 'sheng'], title: '擲筊' });
      S.sfx('bell');
      await S.say('許廟公', '三個聖筊……');
      S.emote('hongying', '💢');
      await S.say('hongying:shy', '……誰要妳問這個！');
      S.face('baizhi', 'hongying');
      await S.say('baizhi:smile', '媽祖說會的。三次。');
      S.face('hongying', 'left');
      await S.say('hongying:sad', '（別過臉，聲音很小）……謝謝。');
      S.flag('ch5_jiaobei');
    }
    S.gather();
    setTime(S, 1);
    S.quest('q_ch5_main', 2);
    S.objective('去九曲巷施家燈籠舖，取回清虛真人訂的燈');
    G.UI.toast('天色漸漸暗了下來……', { icon: 'lantern' });
  }

  // ============================================================================================ 兵器鋪 lukang_shop (12×9)
  G.Maps.define('lukang_shop', {
    name: '施家鐵舖',
    place: 'lukang',
    bgm: (s) => (time5(s) === 2 ? 'night' : 'city'),
    start: [6, 6],
    light: (s) => (time5(s) >= 2 ? { ambient: 0.45, color: '#120804', playerR: 180 } : { ambient: 0.12, color: '#120804' }),
    tiles: (() => { const g = grid(12, 9, '_'); g.rect(0, 0, 12, 2, 'W'); g.rect(0, 0, 1, 9, 'W'); g.rect(11, 0, 1, 9, 'W'); g.rect(0, 8, 12, 1, 'W'); g.rect(6, 8, 1, 1, '_'); return g.rows(); })(),
    objects: [
      { t: 'counter', x: 4, y: 4, w: 3 }, { t: 'weapon_rack', x: 1, y: 2 }, { t: 'weapon_rack', x: 8, y: 2 },
      { t: 'cauldron', x: 3, y: 2 }, { t: 'barrel', x: 10, y: 5 }, { t: 'crate', x: 1, y: 6 }, { t: 'bucket', x: 10, y: 7 },
      { t: 'brazier', x: 6, y: 2 },
    ],
    npcs: [{ id: 'lk_smith', sprite: 'merchant', name: '施鐵', x: 5, y: 3, dir: 'down', talk: async (S) => {
      await S.say('施鐵', '我阿兄做燈，我打鐵。施家一熱一冷，剛好。');
      if (flag('ch5_lamp')) await S.say('施鐵', '阿兄說他替洛家小姐紮了一盞燈？那盞燈，比我打的任何一把刀都利。');
      await S.shop(['sw_bailian', 'c5_sp_steel', 'fl_diaohua', 'fn_zhusha', 'ar_brocade', 'c5_hd_warmhat', 'ft_lupi'], { title: '施家鐵舖' });
    } }],
    warps: [{ x: 6, y: 8, to: 'lukang', tx: 35, ty: 14, tdir: 'down', door: true }],
  });

  // ============================================================================================ 客棧 lukang_inn (14×10)
  G.Maps.define('lukang_inn', {
    name: '鹿港客棧',
    place: 'lukang',
    bgm: (s) => (time5(s) === 3 ? 'jiufen' : time5(s) === 2 ? 'night' : 'city'),
    start: [6, 7],
    light: (s) => (time5(s) === 2 ? { ambient: 0.45, color: '#120804', playerR: 180 } : { ambient: 0.1, color: '#120804' }),
    tiles: (() => { const g = grid(14, 10, '_'); g.rect(0, 0, 14, 2, 'W'); g.rect(0, 0, 1, 10, 'W'); g.rect(13, 0, 1, 10, 'W'); g.rect(0, 9, 14, 1, 'W'); g.rect(6, 9, 1, 1, '_'); return g.rows(); })(),
    objects: [
      { t: 'counter', x: 1, y: 4, w: 3 }, { t: 'shelf_lanterns', x: 1, y: 2, v: 2 }, { t: 'jar_row', x: 4, y: 2, w: 2 },
      { t: 'table', x: 8, y: 4 }, { t: 'chair', x: 7, y: 4, dir: 'right' }, { t: 'chair', x: 9, y: 4, dir: 'left' },
      { t: 'table', x: 8, y: 7 }, { t: 'chair', x: 7, y: 7, dir: 'right' }, { t: 'chair', x: 9, y: 7, dir: 'left' },
      { t: 'table', x: 11, y: 5 }, { t: 'tea_set', x: 11, y: 2 }, { t: 'stairs_up', x: 12, y: 2 },
      { t: 'red_lantern', x: 6, y: 2, hang: true }, { t: 'plant_pot', x: 1, y: 8, v: 1 },
      { t: 'mural', x: 8, y: 1, v: 3 },
    ],
    npcs: [
      { id: 'lk_innkeeper', sprite: 'old_m', name: '蔡頭家', x: 3, y: 3, dir: 'down', if: (s) => !s.vars.c5_inn_scene, talk: async (S) => {
        await S.say('蔡頭家', '冬至前後，風最大。出門記得戴帽。');
        if (flag('ch5_unmask') && !flag('ch5_noodles')) { await innScene(S); return; }
        const ok = await S.inn(50, { who: '蔡頭家' });
        if (ok && !flag('ch5_mazu')) await S.say('蔡頭家', '一暝睏飽，明仔載才有力氣。');
      } },
      { id: 'lk_inn_guest', sprite: 'villager_m2', name: '住客', x: 9, y: 5, dir: 'left', if: (s) => time5(s) < 3, talk: ['我是從泉州來收貨的。蚶江的船現在都不太敢開進來了，港道淤得太厲害。', '以前啊，鹿港跟蚶江對渡，一個月好幾趟。'] },
    ],
    events: [
      { id: 'c5_inn_auto', trigger: 'auto', if: (s) => s.flags.ch5_fubo_done && !s.flags.ch5_noodles, run: (S) => innScene(S) },
    ],
    warps: [{ x: 6, y: 9, to: 'lukang', tx: 49, ty: 14, tdir: 'down', door: true }],
  });

  // ============================================================================================ 九曲巷 lukang_jiuqu (40×32)
  // Winding brick alleys. Straight alleys (直巷) are wind tunnels: every 2.5 s a gust from the north-east
  // pushes whoever stands in them two cells back (west / south). Bends (彎) and niches are wind shadows.
  const JQ = (() => {
    const g = grid(40, 32, 'R');
    const F = '%';
    g.rect(0, 3, 10, 2, F);                 // A: 巷口 (from 鹿港街)
    g.rect(4, 5, 1, 9, F);                  // 摸乳巷 (1 wide, 9 long)
    g.rect(1, 14, 11, 4, F);                // 曬衣 courtyard
    // ② 九拐的彎巷 (safe, long)
    g.rect(8, 5, 1, 2, F); g.rect(8, 7, 5, 1, F); g.rect(12, 7, 1, 3, F); g.rect(10, 9, 3, 1, F);
    g.rect(10, 9, 1, 3, F); g.rect(10, 11, 5, 1, F); g.rect(14, 11, 1, 3, F); g.rect(11, 13, 4, 1, F);
    // courtyard → 半邊井
    g.rect(12, 17, 3, 1, F);
    g.rect(14, 16, 10, 5, F);               // 半邊井 square (王家牆 above, rows 14–15)
    g.set(21, 15, F);                       // 王家側門
    g.rect(24, 18, 2, 1, F); g.rect(25, 18, 1, 5, F);
    g.rect(24, 23, 14, 6, F);               // 施家燈籠舖 front square
    g.rect(26, 20, 4, 3, F);                // (under the shop building)
    // ① 長直巷 (wind tunnel, west wind)
    g.rect(10, 3, 20, 1, F); g.rect(14, 2, 2, 1, F); g.rect(20, 4, 2, 1, F);
    g.rect(30, 2, 8, 3, F);                 // 土地公 square
    g.rect(33, 5, 1, 2, F);                 // passage under the gate tower
    g.rect(32, 7, 3, 2, F);                 // 隘門
    g.rect(33, 9, 1, 3, F); g.rect(28, 11, 6, 1, F); g.rect(28, 11, 1, 5, F); g.rect(28, 15, 5, 1, F); g.rect(32, 15, 1, 8, F);
    // dead-end straight alley (north wind) with a chest at its end
    g.rect(37, 11, 1, 12, F); g.set(36, 17, F);
    // a few plaster walls for variety
    g.rect(5, 6, 3, 6, 'P'); g.rect(16, 6, 8, 3, 'P'); g.rect(30, 12, 2, 3, 'P'); g.rect(34, 12, 2, 10, 'P');
    return g.rows();
  })();
  const JQ_WINDS = [
    { x: 10, y: 3, w: 4, h: 1, dir: 'left', period: 2.5, dur: 0.5 },
    { x: 16, y: 3, w: 4, h: 1, dir: 'left', period: 2.5, dur: 0.5 },
    { x: 22, y: 3, w: 4, h: 1, dir: 'left', period: 2.5, dur: 0.5 },
    { x: 37, y: 18, w: 1, h: 4, dir: 'down', period: 2.5, dur: 0.5 },
    { x: 37, y: 12, w: 1, h: 4, dir: 'down', period: 2.5, dur: 0.5 },
  ];
  const wellState = () => (G.state.vars.c5_well = G.state.vars.c5_well || {});
  const gateClosed = (s) => time5(s) === 2 && !s.flags.ch5_gate_open;

  G.Maps.define('lukang_jiuqu', {
    name: '九曲巷',
    subtitle: '九彎十八拐',
    place: 'lukang',
    bgm: (s) => (time5(s) === 2 ? 'night' : 'city'),
    start: [1, 3],
    light: (s) => townLight(s),
    particles: (s) => (time5(s) === 2 ? [{ type: 'wind', density: 0.5 }, 'mist'] : [{ type: 'wind', density: 0.7 }]),
    tiles: JQ,
    winds: JQ_WINDS,
    objects: [
      { t: 'red_lantern', x: 2, y: 3, hang: true }, { t: 'jar', x: 9, y: 4 },
      { t: 'laundry', x: 2, y: 14 }, { t: 'laundry', x: 7, y: 14 }, { t: 'jar', x: 1, y: 17 }, { t: 'jar', x: 2, y: 17 },
      { t: 'bench', x: 8, y: 17 }, { t: 'basket', x: 11, y: 15 }, { t: 'bucket', x: 6, y: 17 },
      // 半邊井：井口被王家的牆從中間穿過
      { t: 'well', x: 18, y: 15 }, { t: 'door_frame', x: 21, y: 15 },
      { t: 'crate', x: 20, y: 16 }, { t: 'crate', x: 16, y: 20 }, { t: 'jar', x: 23, y: 20 },
      { t: 'red_lantern', x: 15, y: 16, hang: true },
      // 土地公廟 square
      { t: 'shrine_small', x: 35, y: 2, text: '福德祠' }, { t: 'incense_burner', x: 34, y: 4 }, { t: 'stone_lantern', x: 31, y: 2 },
      { t: 'gate_city', x: 32, y: 7, text: '隘門' },
      // 施家燈籠舖
      { t: 'shophouse', x: 26, y: 20, text: '施家燈籠', v: 2, door: 1 },
      { t: 'lantern_rack', x: 24, y: 26 }, { t: 'red_lantern', x: 30, y: 23, hang: true },
      { t: 'house_minnan', x: 32, y: 25, door: 2, v: 1 }, { t: 'plant_pot', x: 31, y: 27, v: 2 },
      { t: 'basket', x: 24, y: 28 }, { t: 'jar', x: 25, y: 28 },
      { t: 'red_lantern', x: 12, y: 7, hang: true }, { t: 'red_lantern', x: 28, y: 13, hang: true },
      // 除夕 / night lanterns
      { t: 'red_lantern', x: 25, y: 19, hang: true, if: (s) => time5(s) >= 2 },
    ],
    lights: (s) => (time5(s) >= 1 ? [{ x: 27, y: 23, r: 150, color: '#ffb060', flicker: 0.25 }, { x: 34, y: 4, r: 110, color: '#ffa050', flicker: 0.3 },
      { x: 18, y: 17, r: 100, color: '#ffb070', flicker: 0.2 }] : []),
    chests: [
      { id: 'c5_02', x: 37, y: 11, item: 'c5_lukang_coat' },
      { id: 'c5_03', x: 33, y: 2, item: 'huanhunxiang', gold: 500 },
    ],
    npcs: [
      { id: 'lk_alley_lady', sprite: 'villager_f2', name: '阿桑', x: 5, y: 4, dir: 'left', talk: async (S) => {
        if (flag('ch5_alley')) { await S.say('阿桑', '摸乳巷又叫君子巷。男人遇到女人，要轉身面壁。記牢喔！'); return; }
        await S.say('阿桑', '欸，少年仔，要過摸乳巷？');
      } },
      { id: 'lk_granny_well', sprite: 'old_f', name: '井邊阿婆', x: 17, y: 17, dir: 'up', talk: (S) => grannyTalk(S) },
      { id: 'lk_mason', sprite: 'villager_m2', name: '泥水師傅', x: 19, y: 17, dir: 'up', if: (s) => !s.flags.ch5_well_done, talk: async (S) => {
        await S.say('泥水師傅', '阿婆，我也是拿人錢做事。王少爺說天光前要封好。');
        await S.say('泥水師傅', '唉，砌這個牆，我心肝也艱苦。我細漢也是喝這口井的水大漢的。');
      } },
      { id: 'lk_watchman', sprite: 'old_m', name: '打更阿福伯', pos: (s) => (gateClosed(s) ? [33, 8] : [32, 4]), x: 32, y: 4, dir: 'down', talk: (S) => watchmanTalk(S) },
      { id: 'lk_shrine_kid', sprite: 'child_m', name: '巷仔內的囝仔', x: 30, y: 25, dir: 'right', wander: 2, if: (s) => time5(s) < 2,
        talk: ['直直走會被風吹回來！要彎過去、彎過去！', '你看，風在直巷子裡最大，轉個彎就沒了。'] },
      { id: 'lk_auntie_home', sprite: 'villager_f', name: '阿婆家媳婦', x: 34, y: 28, dir: 'up', if: (s) => time5(s) < 2,
        talk: ['施師傅那間燈籠舖，四十年了。我嫁來的時候，他就在那裡糊燈。', '晚上隘門會關，要找打更的阿福伯開門。'] },
    ],
    enemies: [
      { id: 'jq_paper1', troop: 'lukang_1', x: 6, y: 16, art: 'paper_servant', radius: 3, chase: 3, if: (s) => time5(s) === 2 && !s.flags.ch5_unmask },
      { id: 'jq_paper2', troop: 'lukang_3', x: 30, y: 27, art: 'hanged_ghost', radius: 3, chase: 3, if: (s) => time5(s) === 2 && !s.flags.ch5_unmask },
    ],
    events: [
      { id: 'c5_alley', trigger: 'touch', x: 3, y: 3, w: 1, h: 2, if: (s) => !s.flags.ch5_alley, run: (S) => sceneAlley(S) },
      { id: 'c5_well_start', trigger: 'touch', x: 15, y: 16, w: 1, h: 5, if: (s) => s.flags.ch5_mazu && !G.state.quests.q_halfwell, run: (S) => wellStart(S) },
      { id: 'c5_well_night', trigger: 'auto', if: (s) => G.Quests.stage('q_halfwell') === 2 && !G.Quests.isDone('q_halfwell') && time5(s) === 2, run: (S) => wellNight(S) },
      { id: 'c5_well_look', trigger: 'action', x: 18, y: 15, label: '半邊井', run: async (S) => {
        await S.say('', '一口井，被王家的紅磚牆從中間穿過——一半在牆內，一半在牆外。');
        if (!flag('ch5_well_done')) await S.say('', '牆外這半邊的井欄上，已經擺了好幾塊磚頭。');
        else await S.say('', '井欄上的磚頭都拿掉了。井水映著兩邊的天。');
      } },
      { id: 'c5_shrine', trigger: 'action', x: 35, y: 3, w: 2, h: 1, label: '參拜', run: async (S) => {
        await S.say('', '巷子裡的土地公廟。香爐裡插著幾炷剛點的香。');
        if (hasActor('yungui')) await S.say('yungui:smile', '土地公顧巷子，打更的顧人。鹿港人兩邊都不放心，所以兩個都請了。');
      } },
    ],
    warps: [
      { x: 0, y: 3, h: 2, to: 'lukang', tx: 53, ty: 9, tdir: 'left' },
      { x: 27, y: 22, to: 'lukang_lantern', tx: 6, ty: 8, tdir: 'up', door: true },
      { x: 21, y: 15, to: 'lukang_wang', tx: 10, ty: 8, tdir: 'up', door: true, run: async (S) => {
        if (G.state.quests.q_halfwell || flag('ch5_well_done')) return true;
        await S.say('', '王家的側門關著。門內傳來算盤聲，劈哩啪啦。');
        await S.move('player', 'D');
        return false;
      } },
    ],
    onUpdate(dt, ms, busy) {
      // gust onset: shove a player who is pushing against the wind back two cells (input locked briefly)
      ms.c5w = ms.c5w || [];
      const p = ms.player;
      JQ_WINDS.forEach((w, i) => {
        const on = ms.windActive(w);
        const was = ms.c5w[i];
        ms.c5w[i] = on;
        if (!on || was || busy) return;
        if (!(p.x >= w.x && p.x < w.x + w.w && p.y >= w.y && p.y < w.y + w.h)) return;
        if (G.Debug && G.Debug.autoplay) return;
        G.Script.run(async (S) => {
          G.Audio.sfx('wind');
          const step = w.dir === 'left' ? 'L' : 'D';
          let n = 0;
          for (let k = 0; k < 2; k++) {
            const [dx, dy] = U.dirs[w.dir];
            if (ms.blocked(p.x + dx, p.y + dy, p)) break;
            n++;
            await S.move('player', step, { speed: 9 });
          }
          if (n) S.face('player', w.dir === 'left' ? 'right' : 'up');
          if (hasActor('tuanzi') && n) S.emote('tuanzi', '💧', 0.8);
        });
      });
    },
    drawOver(ctx, t, ms) {
      // 半邊井：王家的牆從井口中間穿過
      const wx = 18 * T, wy = 15 * T;
      ctx.save();
      const brick = ctx.createLinearGradient(0, wy - 10, 0, wy + 30);
      brick.addColorStop(0, '#b0503a'); brick.addColorStop(1, '#7a3020');
      ctx.fillStyle = brick;
      ctx.fillRect(wx + 26, wy - 30, 12, 72);
      ctx.strokeStyle = 'rgba(60,20,10,0.6)'; ctx.lineWidth = 1;
      for (let y = wy - 30; y < wy + 42; y += 8) { ctx.beginPath(); ctx.moveTo(wx + 26, y); ctx.lineTo(wx + 38, y); ctx.stroke(); }
      ctx.fillStyle = '#c8a890'; ctx.fillRect(wx + 24, wy - 34, 16, 5);
      // bricks laid on the outer half (until the quest is done)
      if (!flag('ch5_well_done')) {
        ctx.fillStyle = '#a84a34'; ctx.strokeStyle = '#5a2010';
        for (let k = 0; k < 3; k++) { ctx.fillRect(wx + 6 + k * 6, wy + 18 - k * 5, 16, 7); ctx.strokeRect(wx + 6 + k * 6, wy + 18 - k * 5, 16, 7); }
      }
      ctx.restore();
      // wind gauge (風勢) — counts down to the next gust
      const inZone = JQ_WINDS.some((w) => ms.player.x >= w.x - 3 && ms.player.x < w.x + w.w + 3 && ms.player.y >= w.y - 3 && ms.player.y < w.y + w.h + 3);
      if (!inZone || G.Script.busy()) return;
      screenSpace(ctx, ms, (c) => {
        const per = 2.5, ph = (ms.windT % per);
        const on = ph < 0.5;
        const left = on ? 0 : per - ph;
        const x = 34, y = G.H - 120;
        c.fillStyle = 'rgba(8,10,20,0.66)';
        c.beginPath(); c.roundRect(x, y, 196, 54, 14); c.fill();
        c.strokeStyle = on ? 'rgba(220,240,255,0.9)' : 'rgba(240,210,140,0.6)'; c.lineWidth = 1.5; c.stroke();
        G.Render.text(c, on ? '風勢　陣風！' : '風勢', x + 14, y + 8, { size: 20, color: on ? '#e8f4ff' : '#f0e0c0' });
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x + 14, y + 36, 168, 8);
        c.fillStyle = on ? '#bfe4ff' : '#ffcf6a';
        c.fillRect(x + 14, y + 36, 168 * (on ? 1 : 1 - left / (per - 0.5)), 8);
        // swirl icon
        c.strokeStyle = on ? '#e8f4ff' : '#c8b890'; c.lineWidth = 2;
        for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + 168, y + 18, 4 + k * 4, t * (on ? 9 : 2) + k, t * (on ? 9 : 2) + k + 3.6); c.stroke(); }
      });
    },
  });

  // ---- §3-4 九曲巷・摸乳巷 -------------------------------------------------------------------------------------
  async function sceneAlley(S) {
    S.flag('ch5_alley');
    S.hideFollowers(false);
    place(S, [['player', 3, 3, 'right'], ['baizhi', 2, 3, 'right'], ['hongying', 2, 4, 'right'], ['yungui', 1, 3, 'right'], ['tuanzi', 1, 4, 'right']]);
    S.face('lk_alley_lady', 'left');
    S.emote('lk_alley_lady', '!');
    await S.say('', '（一條窄到只容一人側身的巷子。巷口一位阿桑正在等。）');
    await S.say('阿桑', '欸，少年仔，你們要過摸乳巷？');
    S.emote('player', '?');
    await S.say('xinghe:surprise', '摸、摸什麼巷？');
    await S.say('阿桑', '摸乳巷！這麼窄，兩個人對面相遇，一不小心就……你知道的。');
    await S.say('阿桑', '所以也叫君子巷。規矩是：男人遇到女人，要轉身面壁，讓女人先過。');
    await S.say('yungui:smug', '好巷名。很有學問。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '哪裡有學問！');
    await S.say('tuanzi:smile', '吾先過！吾是石虎，不分男女！');
    await S.move('tuanzi', 'RRR', { speed: 6 });
    await S.move('tuanzi', 'DDDD', { speed: 6 });
    S.sfx('push'); S.shake(2, 0.3);
    S.emote('tuanzi', '…');
    await S.say('', '（糰子衝到巷子中間——卡住了。噗嘰。）');
    await S.say('tuanzi:cry', '卡、卡住了！前面過不去！後面也退不回來！');
    await S.say('yungui:normal', '這就是一路吃牛舌餅的報應。');
    await S.walkTo('player', 4, 4);
    S.face('player', 'down');
    await S.say('xinghe:laugh', '（推糰子的屁股）嗯——！不行，太緊了！');
    await S.say('hongying:think', '（從懷裡掏出一片牛舌餅）……我繞到另一頭去。');
    await S.fadeActor('hongying', 0, 0.4);
    S.setPos('hongying', 4, 15, 'up');
    await S.fadeActor('hongying', 1, 0.4);
    await S.say('hongying:normal', '……糰子，過來。');
    S.emote('tuanzi', '!');
    await S.say('tuanzi:surprise', '牛舌餅！');
    S.sfx('push');
    await S.move('tuanzi', 'DDDDD', { speed: 9 });
    S.setPos('tuanzi', 5, 15, 'left');
    await S.jump('tuanzi', 36);
    await S.say('阿桑', '哈哈哈！我在這巷子口住了五十年，第一次看到貓卡在裡面！');
    await S.say('tuanzi:angry', '吾不是貓！');
    // 星河 walks in; 白芷 comes from the other end
    await S.move('player', 'DDDD');
    S.setPos('baizhi', 4, 13, 'up');
    await S.move('baizhi', 'UUUU');
    await S.say('baizhi:smile', '星河！我從這邊繞過來了。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '等、等一下！規矩、規矩是——');
    S.face('player', 'left');
    await S.say('', '（星河急忙轉身，臉貼牆壁。）');
    S.face('baizhi', 'up');
    await S.say('baizhi:think', '（也轉身——轉向星河，面對面）是這樣嗎？面對面比較有禮貌吧？');
    S.face('player', 'down');
    S.emote('player', '💧');
    await S.wait(0.3);
    S.emote('player', '!');
    await S.say('xinghe:shy', '不是——是、是要面壁——');
    await S.say('baizhi:think', '為什麼要面壁？牆又不跟我們說話。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '（從巷口）笨蛋星河——！你給我轉過去！不對，白芷妳轉過去！不對——你們兩個都給我出來！！');
    S.setPos('yungui', 4, 4, 'down');
    await S.say('yungui:laugh', '（靠著牆笑到彎腰）好巷、好巷……');
    await S.fadeOut(0.5);
    place(S, [['player', 5, 15, 'right'], ['baizhi', 4, 15, 'right'], ['hongying', 6, 16, 'up'], ['yungui', 3, 15, 'right'], ['tuanzi', 5, 16, 'up']]);
    S.gather();
    await S.fadeIn(0.5);
    await S.say('hongying:angry', '……走了啦！燈籠舖在東邊。');
  }

  // ---- 半邊井 (q_halfwell) ----------------------------------------------------------------------------------------
  async function wellStart(S) {
    S.quest('q_halfwell', 0);
    S.face('lk_granny_well', 'right');
    S.face('lk_mason', 'left');
    await S.say('', '（半邊井。一口井，被王家的紅磚牆從中間穿過——一半在牆內，一半在牆外。泥水師傅正在牆外那半邊擺磚頭。）');
    await S.say('井邊阿婆', '師傅！你不能封！這口井我挑了六十年的水！');
    await S.say('泥水師傅', '阿婆，我也是拿人錢做事。王少爺說明天天光前要封好。');
    await S.say('baizhi:think', '為什麼一口井，一半在裡面、一半在外面？');
    S.face('lk_granny_well', 'left');
    await S.say('井邊阿婆', '這叫半邊井。王家的祖先挖的。那時候鹿港大旱，巷子裡的人沒水喝。');
    await S.say('井邊阿婆', '王老太爺說：井挖在我家，水是天給的，一半給外面的人用。');
    await S.say('井邊阿婆', '就這樣，牆從井中間砌過去。裡面的人用一半，外面的人用一半。');
    await S.say('yungui:smile', '好一個「一半」。');
    await S.say('hongying:think', '那為什麼現在要封？');
    await S.say('泥水師傅', '王少爺上個月一條船在黑水溝沉了，整船的貨。欠了一屁股債。');
    await S.say('泥水師傅', '他說，外面這半邊封了，井水就能挑去賣。');
    S.objective('找王少爺談談半邊井（王家側門）');
  }
  async function grannyTalk(S) {
    const w = wellState();
    const stg = G.Quests.stage('q_halfwell');
    if (flag('ch5_well_done')) { await S.say('井邊阿婆', '這口井，我還要再挑六十年。'); return; }
    if (stg === 1 && !w.granny) {
      await S.say('井邊阿婆', '王家的事？……三十年前，王家的店仔失火。');
      await S.say('井邊阿婆', '巷子裡的人排成一排，從這口井一桶一桶傳水，傳到天亮。把火滅了。');
      await S.say('井邊阿婆', '（笑）那時候少爺才剛出世，抱在他娘懷裡哭。他不記得了。');
      await S.say('井邊阿婆', '我這裡還有一個水桶，桶底烙著「王」字。是那時王家送給大家救火用的。');
      await S.give('c5_wang_bucket');
      w.granny = true;
      await wellCheck(S);
      return;
    }
    if (stg < 0) await S.say('井邊阿婆', '這口井，我挑了六十年的水。');
    else await S.say('井邊阿婆', '少爺不是壞囝仔……他只是太久沒抬頭看巷子了。');
  }
  async function watchmanTalk(S) {
    const s = G.state;
    const w = wellState();
    const stg = G.Quests.stage('q_halfwell');
    if (stg === 1 && !w.watch) {
      await S.say('打更阿福伯', '王家？哈，那年王家失火，我是第一個敲鑼的。');
      await S.say('打更阿福伯', '整條九曲巷的人都來了。誰家有桶拿桶，沒桶的拿鍋，拿碗。');
      await S.say('打更阿福伯', '（想了想）你說王少爺有難？……你等一下。我去敲鑼。');
      S.flag('ch5_well_gong');
      w.watch = true;
      await wellCheck(S);
      return;
    }
    if (gateClosed(s)) {
      await S.say('打更阿福伯', '隘門晚上二更就關。你們要進出，跟我講一聲。');
      const c = await S.choice(['麻煩開個門', '不用了'], { cancel: 1 });
      if (c === 0) {
        await S.say('打更阿福伯', '好啦好啦，少年人暗時還在走跳。小心風。');
        S.flag('ch5_gate_open');
        S.sfx('door');
        await S.move('lk_watchman', 'UUUU');
        S.setPos('lk_watchman', 32, 4, 'down');
      }
      return;
    }
    if (stg === 2 && !G.Quests.isDone('q_halfwell')) { await S.say('打更阿福伯', '等天暗了，我就去敲鑼。九曲巷的人，一聽到鑼聲就會出來。'); return; }
    await S.say('打更阿福伯', time5() === 2 ? '天乾物燥——小心火燭——' : '隘門晚上二更就關。你們要進出，跟我講一聲。');
  }
  async function wellCheck(S) {
    const w = wellState();
    if (w.granny && w.niushe && w.watch && G.Quests.stage('q_halfwell') === 1) {
      S.quest('q_halfwell', 2);
      if (time5() === 2) S.objective('回半邊井');
      else { await S.say('xinghe:think', '阿福伯說要等天暗了再敲鑼……晚一點再回半邊井看看吧。'); S.objective('天黑後，回九曲巷的半邊井'); }
    }
  }
  async function wellNight(S) {
    await S.fadeOut(0.6);
    await S.warp('lukang_jiuqu', 18, 19, 'up', { fade: 0 });
    S.hideFollowers(false);
    place(S, [['player', 18, 19, 'up'], ['baizhi', 17, 19, 'up'], ['hongying', 19, 19, 'up'], ['yungui', 16, 19, 'up'], ['tuanzi', 20, 19, 'up']]);
    S.setPos('lk_granny_well', 16, 17, 'right');
    S.setPos('lk_mason', 20, 17, 'left');
    await S.camera(18, 17, 0.1);
    await S.fadeIn(0.6);
    await S.say('', '（夜。半邊井外。九曲巷的鄰居一個接一個走出來，手裡提著東西——米袋、一串銅錢、一籃雞蛋、牛舌餅。）');
    const nb = [['wn_1', 'villager_m', 14, 18], ['wn_2', 'villager_f', 14, 19], ['wn_3', 'fisher_f', 22, 18], ['wn_4', 'villager_m2', 23, 19], ['wn_5', 'shopkeeper_f', 15, 20]];
    for (const [id, sp, x, y] of nb) S.spawn({ id, sprite: sp, x, y, dir: x < 18 ? 'right' : 'left' });
    S.spawn({ id: 'wn_watch', sprite: 'old_m', x: 22, y: 16, dir: 'left' });
    S.sfx('gong');
    await S.say('打更阿福伯', '（敲鑼）王家有難！九曲巷的，起會仔啦！');
    await S.say('xinghe:surprise', '會仔？');
    await S.say('yungui:normal', '標會。大家每個月出一點錢，湊成一筆，先給急用的人。以後再輪流還。');
    await S.say('yungui:smile', '鄉下人的錢莊。不收利息，只收人情。');
    S.spawn({ id: 'wn_wang', sprite: 'noble_m', x: 21, y: 15, dir: 'down' });
    S.sfx('door');
    await S.move('wn_wang', 'D');
    S.emote('wn_wang', '!');
    await S.say('王少爺', '你們……');
    await S.say('井邊阿婆', '（把王字水桶塞到他手裡）三十年前，王家的桶救了大家的厝。今天換大家的桶。');
    S.take('c5_wang_bucket');
    await S.say('牛舌餅阿嬸', '（遞上帳本）你阿公賒給我阿爸的麵粉，我一筆一筆都記著。這次我還。');
    S.take('c5_old_ledger');
    await S.say('王少爺', '……我……我還以為……');
    await S.say('王少爺', '我還以為一半給出去，就少了一半。');
    S.spawn({ id: 'wn_ghost', sprite: 'ghost_m', x: 17, y: 16, dir: 'down', ghost: true });
    G.mapScene.actor('wn_ghost').alpha = 0;
    await S.fadeActor('wn_ghost', 0.75, 1.0);
    S.face('baizhi', 'wn_ghost');
    await S.say('', '（白芷看見——井邊站著一個穿舊式長衫的老人鬼魂，拄著拐杖，看著這一切，笑得滿臉皺紋。）');
    await S.say('baizhi:smile', '（輕聲）……星河，井邊。');
    await S.say('xinghe:smile', '（……王老太爺。）');
    S.emote('wn_ghost', '♪');
    await S.say('', '（老人鬼魂對白芷點點頭，伸手拍了拍井欄，化成一點光，落進井水裡。）');
    S.sfx('splash');
    await S.fadeActor('wn_ghost', 0, 0.8);
    S.remove('wn_ghost');
    S.flag('ch5_well_done');
    await S.say('王少爺', '（把磚頭一塊一塊拿下來）師傅，工錢我照付。這口井，不封了。');
    await S.say('王少爺', '牆裡一半是王家的，牆外一半是大家的——');
    await S.say('王少爺', '原來，是同一口水。');
    await S.give('c5_halfwell', 3);
    S.gold(1500);
    S.quest('q_halfwell', 'done');
    await S.lantern('lantern_halfwell', '半邊井');
    await S.fadeOut(0.5);
    for (const id of ['wn_1', 'wn_2', 'wn_3', 'wn_4', 'wn_5', 'wn_watch', 'wn_wang']) S.remove(id);
    S.setPos('lk_granny_well', 17, 17, 'up');
    S.cameraFollow();
    S.gather();
    await S.fadeIn(0.5);
    restoreObjective(S);
  }
  // put the main objective back after a side quest
  function restoreObjective(S) {
    const s = G.state.flags;
    if (s.ch5_unmask && !s.ch5_fubo_done) S.objective('回大門，跟福伯說一聲');
    else if (s.ch5_fubo_done) S.objective('回客棧休息');
    else if (s.ch5_enter) S.objective('探索洛家古厝');
    else if (s.ch5_lamp) S.objective('提著洛家燈，回洛家古厝');
    else if (s.ch5_mazu) S.objective('去九曲巷施家燈籠舖，取回清虛真人訂的燈');
    else if (s.ch5_gate) S.objective('去天后宮打聽清虛真人');
    else S.objective('跟紅纓回洛家古厝（鹿港南端）');
  }

  // ============================================================================================ 施家燈籠舖 lukang_lantern (14×10)
  function drawRabbitLantern(ctx, x, y, t, a) {
    // a faded paper rabbit lantern (one ear drooping) hanging from a hook — x,y = cell top-left
    const cx = x + 32, cy = y - 6 + Math.sin(t * 1.3) * 1.5;
    ctx.save();
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, y - 52); ctx.lineTo(cx, cy - 18); ctx.stroke();
    const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 40);
    glow.addColorStop(0, 'rgba(255,220,150,0.35)'); glow.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = glow; ctx.fillRect(cx - 40, cy - 40, 80, 80);
    // body
    ctx.fillStyle = '#efe2c0'; ctx.strokeStyle = '#8a7050'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx, cy, 20, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // head
    ctx.beginPath(); ctx.ellipse(cx + 17, cy - 8, 9, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // ears: one up, one drooping
    ctx.beginPath(); ctx.ellipse(cx + 16, cy - 22, 3, 9, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + 26, cy - 12, 3, 8, 1.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // eye & red markings
    ctx.fillStyle = '#c83a2a';
    ctx.beginPath(); ctx.arc(cx + 20, cy - 9, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200,58,42,0.55)';
    ctx.beginPath(); ctx.ellipse(cx - 4, cy - 2, 7, 3, 0.3, 0, Math.PI * 2); ctx.fill();
    // wheels
    ctx.strokeStyle = '#6a5038'; ctx.lineWidth = 1.5;
    for (const wx of [cx - 10, cx + 10]) { ctx.beginPath(); ctx.arc(wx, cy + 16, 5, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  G.Maps.define('lukang_lantern', {
    name: '施家燈籠舖',
    subtitle: '九曲巷',
    place: 'lukang',
    bgm: 'pingxi',
    start: [6, 7],
    light: (s) => (time5(s) >= 1 ? { ambient: 0.32, color: '#1a0804', playerR: 180 } : { ambient: 0.15, color: '#1a0804' }),
    tiles: (() => { const g = grid(14, 10, '_'); g.rect(0, 0, 14, 2, 'W'); g.rect(0, 0, 1, 10, 'W'); g.rect(13, 0, 1, 10, 'W'); g.rect(0, 9, 14, 1, 'W'); g.rect(6, 9, 1, 1, '_'); return g.rows(); })(),
    objects: [
      { t: 'shelf_lanterns', x: 1, y: 2, v: 1 }, { t: 'shelf_lanterns', x: 3, y: 2, v: 3 }, { t: 'shelf_lanterns', x: 10, y: 2, v: 5 },
      { t: 'lantern_rack', x: 6, y: 2 }, { t: 'lantern_rack', x: 1, y: 6 },
      { t: 'workbench', x: 6, y: 4, counter: true }, { t: 'paper_stack', x: 8, y: 4 }, { t: 'lantern_frame', x: 9, y: 4 },
      { t: 'counter', x: 10, y: 6, w: 2 }, { t: 'jar', x: 1, y: 8 }, { t: 'basket', x: 11, y: 8 },
      { t: 'red_lantern', x: 2, y: 4, hang: true }, { t: 'red_lantern', x: 5, y: 3, hang: true }, { t: 'red_lantern', x: 9, y: 3, hang: true },
      { t: 'red_lantern', x: 4, y: 6, hang: true }, { t: 'red_lantern', x: 8, y: 7, hang: true },
    ],
    pass: [{ x: 12, y: 3, solid: true }],
    lights: [{ x: 6, y: 4, r: 160, color: '#ffb060', flicker: 0.25 }, { x: 12, y: 3, r: 90, color: '#ffe0a0', flicker: 0.15 }],
    npcs: [
      { id: 'lk_shi', sprite: 'old_m', name: '施燈師', x: 6, y: 3, dir: 'down', talk: async (S) => {
        if (flag('ch5_lamp')) await S.say('施燈師', '那盞洛家燈，提好。燈在，人就找得到路。');
        else await S.say('施燈師', '燈籠的骨架要正，紙要糊得緊，字要寫得有力。三樣缺一樣，燈就不亮。');
      } },
    ],
    events: [
      { id: 'c5_lamp_scene', trigger: 'auto', if: (s) => s.flags.ch5_mazu && !s.flags.ch5_lamp, run: (S) => sceneLantern(S) },
      { id: 'c5_rabbit_look', trigger: 'action', x: 12, y: 3, label: '兔子燈', if: (s) => !s.flags.ch5_rabbit, run: async (S) => {
        await S.say('', '角落掛著一盞褪色的兔子燈。紙已發黃，一隻耳朵垂下來。');
      } },
    ],
    drawOver(ctx, t) { if (!flag('ch5_rabbit')) drawRabbitLantern(ctx, 12 * T, 3 * T, t); },
    warps: [{ x: 6, y: 9, to: 'lukang_jiuqu', tx: 27, ty: 23, tdir: 'down', door: true }],
  });

  // ---- §3-5 施家燈籠舖：洛家燈 ★ --------------------------------------------------------------------------------
  async function sceneLantern(S) {
    S.hideFollowers(false);
    place(S, [['player', 6, 6, 'up'], ['baizhi', 8, 7, 'up'], ['hongying', 5, 6, 'up'], ['yungui', 7, 6, 'up'], ['tuanzi', 4, 7, 'up']]);
    S.face('lk_shi', 'down');
    await S.say('', '（燈籠舖。天花板掛滿紅燈籠，暖光像糖漿一樣。施燈師正在糊一盞燈，頭也不抬。）');
    await S.say('施燈師', '要買燈就自己挑，要訂燈下個月再來。');
    await S.say('yungui:normal', '老師傅，一個月前，一個姓清虛的道士訂了一盞燈。');
    S.emote('lk_shi', '…');
    await S.say('施燈師', '（抬頭，推了推眼鏡）……喔，那個長鬍子的。燈骨我紮好了，紙也糊好了。');
    await S.say('施燈師', '可是他說——燈上的字，要讓「那家的人」自己寫。他寫不得。');
    await S.say('', '（他從架上取下一盞未寫字的白燈籠，骨架方正，紙面潔淨。）');
    await S.say('施燈師', '他說要寫一個姓。哪一家？');
    await S.say('hongying:serious', '……洛。洛陽的洛。');
    S.emote('lk_shi', '!');
    await S.say('施燈師', '（手停住）洛家……妳是洛家的小姐？那個常常跑來店裡，把我的燈籠戳破的小丫頭？');
    await S.say('hongying:shy', '……我沒有常常。');
    await S.say('施燈師', '妳家的燈籠，四十年來都是我做的。過年的、上元的、娶媳婦的……普渡的。');
    await S.say('施燈師', '中元那晚以後，就再也沒人來訂了。（把毛筆遞給她）來，寫吧。');
    await S.say('', '（紅纓接過筆，手在發抖。墨滴在紙上暈開一小點。）');
    await S.say('hongying:sad', '……我寫字很醜。哥的字才好看。');
    S.face('player', 'hongying');
    await S.say('xinghe:serious', '（按住燈籠的另一邊）我幫妳扶著。妳寫，我來補骨。陳伯說，燈籠要兩個人做才穩。');
    await S.say('hongying:normal', '……嗯。');
    S.face('player', 'up'); S.face('hongying', 'up');
    await S.wait(0.6);
    await S.say('', '（她一筆一筆寫下「洛」。字歪歪斜斜，最後一筆卻拉得又長又有力，像一桿槍。）');
    await S.say('施燈師', '好字。有槍的味道。');
    S.sfx('lantern'); S.flash('#ffd890', 0.5, 0.5);
    await S.say('xinghe:smile', '（點上燭火。燈籠亮起，「洛」字在紅光裡透出來）……好了。');
    await S.give('c5_luo_lantern');
    S.flag('ch5_lamp');
    // 長明燈碎片（第四章）
    if (G.Inv.has(SHARD_LAMP) || flag('ch4_lamp_broken')) {
      await S.say('yungui:serious', '老師傅，再請教一件事。（取出竹塹風穴裡撿到的長明燈碎片）這個底款。');
      await S.say('施燈師', '（湊近，眼鏡推到額頭上）……半個字。左邊是個「方」，右邊糊掉了……');
      S.emote('lk_shi', '!');
      await S.say('施燈師', '……這是「施」。這是我的店號。');
      await S.say('施燈師', '去年，府城來了一個人，說廟裡要用燈，一口氣訂了三百副燈骨。錢給得很爽快。');
      await S.say('施燈師', '我還高興了好幾天……那個長鬍子道士拿著一模一樣的碎片來問我，我才知道。');
      await S.say('施燈師', '我做了一輩子的燈，是給人照路的。不是……不是給人關人的！');
      await S.say('施燈師', '（把洛家燈推到紅纓手裡）這盞，不收錢。……就當我替那三百副燈骨，還一點債。');
      await S.say('yungui:normal', '……師父來鹿港，就是為了追這個底款。');
      if (G.Inv.has(SHARD_LAMP)) G.Inv.remove(SHARD_LAMP, 1);
      S.flag('ch5_shard_traced');
    }
    // 兔子燈 → 白芷的記憶閃回
    S.face('baizhi', 'right');
    await S.walkTo('baizhi', 11, 4, { yFirst: true });
    S.face('baizhi', 'right');
    await S.say('', '（白芷的視線被角落一盞褪色的兔子燈吸住了。紙已發黃，一隻耳朵垂下來。）');
    await S.say('baizhi:think', '……這是什麼？');
    await S.say('施燈師', '兔子燈。元宵的時候給囝仔提的。這盞是舊的，不賣。');
    await S.say('施燈師', '二十幾年前，有兩個男人常來我這裡訂白燈——不是喜慶用的，說是在海上用的。');
    await S.say('施燈師', '一個脾氣很臭，叫陳渡。');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '陳伯？！');
    await S.say('施燈師', '另一個姓夜，斯斯文文的，講話很客氣。他帶過他女兒來。三四歲，叫念念。');
    await S.say('施燈師', '念念最愛我糊的兔子燈。這盞，就是照她那盞的樣子做的。');
    await S.say('施燈師', '後來聽說，他們一家從唐山搬過來的時候……船在黑水溝翻了。');
    await S.say('', '（白芷伸手，指尖碰到兔子燈。）');
    S.bgm(null);
    await S.wait(0.5);
    await nianFlashback(S);
    S.bgm('sad');
    await S.say('baizhi:cry', '……她沒有來。');
    await S.say('xinghe:surprise', '白芷！？');
    await S.say('baizhi:cry', '有一個小女孩……提著兔子燈……她就快到了……可是有人把她拉回去了……');
    await S.say('baizhi:cry', '她沒有來。我等了她好久……');
    S.emote('player', '…');
    await S.say('', '（白芷的手指邊緣，像燈罩一樣微微透出光。只有星河注意到。）');
    await S.say('xinghe:think', '（……她的手。）');
    await S.say('yungui:serious', '（按住白芷的肩）先坐下。照魂鏡之後，第二次了。');
    await S.say('施燈師', '姑娘……妳怎麼知道……念念的燈……');
    await S.say('baizhi:sad', '我不知道。我只是……記得。');
    S.flag('lyric_ch5');
    S.sfx('sing');
    G.UI.toast('想起了渡魂謠的殘句：「名也忘來鄉也忘，岸頭仍有一人等。」', { icon: 'scroll' });
    await S.wait(1.2);
    await S.say('施燈師', '這盞兔子燈……妳帶去吧。我留著它，也只是一直想起那個囝仔。');
    await S.give('c5_rabbit_lantern');
    S.flag('ch5_rabbit');
    S.flag('ch5_memory_nian');
    S.bgm('pingxi');
    S.gather();
    setTime(S, 2);
    S.quest('q_ch5_main', 3);
    S.objective('天黑了。提著洛家燈，回洛家古厝');
    G.UI.toast('天黑了……', { icon: 'lantern' });
  }
  // 記憶閃回（白芷視角）: black water, lights drifting, a small rabbit-shaped light pulled back
  async function nianFlashback(S) {
    S.sfx('dark');
    await new Promise((res) => {
      const sc = {
        opaque: true, t: 0,
        update(dt) { this.t += dt; if (this.t > 7.2 || (G.Debug && G.Debug.autoplay && this.t > 0.5)) { G.Scenes.pop(this); res(); } },
        draw(ctx) {
          const t = this.t;
          ctx.fillStyle = '#040608'; ctx.fillRect(0, 0, G.W, G.H);
          // water ripples (grey)
          ctx.strokeStyle = 'rgba(180,190,200,0.12)'; ctx.lineWidth = 2;
          for (let i = 0; i < 18; i++) {
            const y = 60 + i * 38 + Math.sin(t * 1.4 + i) * 6;
            ctx.beginPath();
            for (let x = 0; x <= G.W; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.02 + t * 2 + i) * 5);
            ctx.stroke();
          }
          // drifting lights towards the viewer
          for (let i = 0; i < 40; i++) {
            const a = (U.hash(i, 3, 9) * 6.28), r = ((t * 40 + U.hash(i, 1, 9) * 600) % 600);
            const x = G.W / 2 + Math.cos(a) * (620 - r), y = G.H / 2 + Math.sin(a) * (360 - r * 0.6);
            ctx.fillStyle = `rgba(220,230,240,${0.15 + 0.4 * (r / 600)})`;
            ctx.beginPath(); ctx.arc(x, y, 2 + r / 150, 0, 6.28); ctx.fill();
          }
          // the little rabbit light approaches, then is pulled up and away
          const k = Math.min(1, t / 3.5);
          const pull = Math.max(0, t - 4.2);
          const lx = G.W / 2 - 220 + k * 170, ly = G.H / 2 + 120 - k * 70 - pull * pull * 70;
          const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 46);
          g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(230,230,230,0.5)'); g.addColorStop(1, 'rgba(230,230,230,0)');
          ctx.fillStyle = g; ctx.fillRect(lx - 50, ly - 50, 100, 100);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.ellipse(lx, ly, 9, 6, 0, 0, 6.28); ctx.fill();
          ctx.beginPath(); ctx.ellipse(lx + 6, ly - 9, 2, 6, -0.2, 0, 6.28); ctx.fill();
          // her own reaching hand (from the right) and a man's hand from above
          ctx.strokeStyle = 'rgba(230,240,250,0.6)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(G.W + 20, G.H / 2 + 60); ctx.lineTo(G.W / 2 + 80 - k * 60, G.H / 2 + 40); ctx.stroke();
          if (t > 3.6) {
            ctx.strokeStyle = 'rgba(120,130,150,0.85)'; ctx.lineWidth = 14;
            ctx.beginPath(); ctx.moveTo(lx + 10, -40); ctx.lineTo(lx + 4, ly - 16); ctx.stroke();
          }
          if (t > 4.4 && t < 7) G.Render.text(ctx, '念念——！不要走！念念！', G.W / 2, G.H - 140, { size: 30, align: 'center', color: '#d8dce4' });
          // fade in/out
          const fa = t < 0.6 ? 1 - t / 0.6 : t > 6.4 ? (t - 6.4) / 0.8 : 0;
          if (fa > 0) { ctx.fillStyle = `rgba(0,0,0,${Math.min(1, fa)})`; ctx.fillRect(0, 0, G.W, G.H); }
        },
      };
      G.Dialog.close();
      G.Scenes.push(sc);
    });
  }

  // ============================================================================================ 王家 lukang_wang (14×10)
  G.Maps.define('lukang_wang', {
    name: '王家',
    subtitle: '九曲巷',
    place: 'lukang',
    bgm: (s) => (time5(s) === 2 ? 'night' : 'city'),
    start: [10, 7],
    light: (s) => (time5(s) >= 1 ? { ambient: 0.4, color: '#100804', playerR: 180 } : { ambient: 0.12, color: '#100804' }),
    tiles: (() => {
      const g = grid(14, 10, 't');
      g.rect(0, 0, 14, 2, 'R'); g.rect(0, 0, 1, 10, 'R'); g.rect(13, 0, 1, 10, 'R');
      g.rect(7, 6, 6, 3, '%');            // little inner yard
      g.rect(0, 9, 14, 1, 'R'); g.set(10, 9, '%');
      return g.rows();
    })(),
    objects: [
      { t: 'altar', x: 3, y: 2 }, { t: 'incense_burner', x: 5, y: 2 }, { t: 'cabinet', x: 1, y: 2 }, { t: 'bookshelf', x: 8, y: 2 },
      { t: 'table', x: 3, y: 5, w: 2 }, { t: 'chair', x: 2, y: 5, dir: 'right' }, { t: 'chair', x: 5, y: 5, dir: 'left' },
      { t: 'paper_stack', x: 4, y: 7 }, { t: 'well', x: 12, y: 7 }, { t: 'plant_pot', x: 7, y: 6, v: 1 },
      { t: 'red_lantern', x: 10, y: 2, hang: true },
    ],
    npcs: [{ id: 'lk_wang', sprite: 'noble_m', name: '王少爺', x: 4, y: 6, dir: 'down', if: (s) => !s.flags.ch5_well_done || true, talk: (S) => wangTalk(S) }],
    events: [
      { id: 'c5_wang_ledger', trigger: 'action', x: 3, y: 5, w: 2, h: 1, label: '帳本', run: async (S) => {
        await S.say('', '桌上攤著帳本。一行一行，全是紅字。');
        if (!flag('ch5_well_done')) await S.say('', '最後一頁寫著：「黑水溝，沉船一艘。船工撫恤……」後面的數字被墨水暈開了。');
      } },
      { id: 'c5_wang_well', trigger: 'action', x: 12, y: 7, label: '半邊井', run: async (S) => {
        await S.say('', '院子裡的半邊井，只有一半的井口——另一半在牆外，給巷子裡的人用。');
      } },
    ],
    drawOver(ctx) {
      // inner half of the 半邊井: the wall runs through the middle of the well
      const wx = 12 * T, wy = 7 * T;
      ctx.save();
      ctx.fillStyle = '#9a4430'; ctx.fillRect(wx + 40, wy - 30, 24, 72);
      ctx.strokeStyle = 'rgba(60,20,10,0.6)';
      for (let y = wy - 30; y < wy + 42; y += 8) { ctx.beginPath(); ctx.moveTo(wx + 40, y); ctx.lineTo(wx + 64, y); ctx.stroke(); }
      ctx.restore();
    },
    warps: [{ x: 10, y: 9, to: 'lukang_jiuqu', tx: 21, ty: 16, tdir: 'down', door: true }],
  });
  async function wangTalk(S) {
    const stg = G.Quests.stage('q_halfwell');
    if (flag('ch5_well_done')) {
      await S.say('王少爺', '我阿公以前常說：「水是天給的。」我現在才聽懂。');
      await S.say('王少爺', '會仔的錢，我一定會還。一筆一筆，像牛舌餅阿嬸那樣記著。');
      return;
    }
    if (stg === 0) {
      await S.say('王少爺', '又是來講井的？我已經聽夠了！');
      await S.say('王少爺', '你們知道我欠多少嗎？船沉了，船工的家屬要撫恤，債主天天上門。');
      await S.say('王少爺', '阿公那時候是有錢，才能大方。我現在連自己家都快保不住了！');
      await S.say('王少爺', '一口井的水錢……能撐一天是一天。');
      await S.say('xinghe:think', '……他也不是壞人。');
      await S.say('yungui:normal', '窮了，人就會把手握緊。很正常。');
      const c = await S.choice(['巷子裡的人，也許會想幫你。', '那封吧，跟我們無關。']);
      if (c === 1) {
        await S.say('baizhi:sad', '……井會難過的。');
        await S.say('', '（也許該再想想。）');
        return;
      }
      await S.say('王少爺', '幫我？他們連自己都顧不了！');
      S.quest('q_halfwell', 1);
      wellState();
      S.objective('問問巷子裡的人：井邊阿婆、牛舌餅阿嬸、打更阿福伯');
      return;
    }
    if (stg === 1) { await S.say('王少爺', '……你們還在問？問了也沒用啦。'); return; }
    await S.say('王少爺', '外面怎麼這麼吵……？');
  }

  // ============================================================================================ 舊港・墓仔埔 lukang_shore (36×24)
  const SH = (() => {
    const g = grid(36, 24, 'm');
    g.rect(0, 0, 36, 1, 'X');
    g.rect(0, 0, 4, 24, '~'); g.rect(4, 0, 3, 24, '-');
    g.rect(26, 0, 10, 24, 's');
    g.rect(8, 1, 22, 8, ':');                 // 墓仔埔
    g.rect(12, 10, 14, 2, 's'); g.rect(20, 12, 6, 6, 's');
    g.rect(0, 23, 36, 1, '~');
    g.rect(35, 0, 1, 24, 'R'); g.rect(35, 11, 1, 2, 's');
    return g.rows();
  })();
  G.Maps.define('lukang_shore', {
    name: '鹿港舊港',
    subtitle: '墓仔埔',
    place: 'lukang',
    bgm: 'night',
    start: [34, 12],
    light: { ambient: 0.7, color: '#060a1c', playerR: 220 },
    particles: ['mist', { type: 'wind', density: 0.6 }],
    tiles: SH,
    objects: [
      { t: 'grave', x: 10, y: 2, v: 0 }, { t: 'grave', x: 13, y: 2, v: 1 }, { t: 'grave', x: 16, y: 3, v: 2 }, { t: 'grave', x: 19, y: 2, v: 0 },
      { t: 'grave', x: 22, y: 3, v: 1 }, { t: 'grave', x: 25, y: 2, v: 2 }, { t: 'grave', x: 11, y: 5, v: 1 }, { t: 'grave', x: 14, y: 6, v: 0 },
      { t: 'grave', x: 18, y: 6, v: 2 }, { t: 'grave', x: 23, y: 6, v: 0 }, { t: 'grave', x: 27, y: 5, v: 1 }, { t: 'grave', x: 9, y: 7, v: 2 },
      { t: 'tree_dead', x: 8, y: 2 }, { t: 'tree_dead', x: 21, y: 4 }, { t: 'tree_dead', x: 28, y: 8 }, { t: 'tree_dead', x: 15, y: 9 },
      { t: 'bones', x: 17, y: 5 }, { t: 'stone_lantern', x: 29, y: 2 },
      { t: 'boat_small', x: 8, y: 15 }, { t: 'boat_small', x: 13, y: 19 }, { t: 'boat_small', x: 5, y: 9 },
      { t: 'reeds', x: 9, y: 13 }, { t: 'reeds', x: 11, y: 16 }, { t: 'reeds', x: 7, y: 20 }, { t: 'reeds', x: 18, y: 20 }, { t: 'reeds', x: 24, y: 19 },
      { t: 'reeds', x: 16, y: 14 }, { t: 'dock_post', x: 6, y: 12 }, { t: 'dock_post', x: 6, y: 17 }, { t: 'driftwood', x: 28, y: 18 },
    ],
    chests: [
      { id: 'c5_04', x: 26, y: 2, item: 'c5_coin_sword' },
      { id: 'c5_05', x: 10, y: 15, item: 'leicha', n: 3 },
    ],
    enemies: [
      { id: 'sh_js1', troop: 't_c5_shore_a', x: 15, y: 4, art: 'jiangshi', radius: 3, chase: 4 },
      { id: 'sh_js2', troop: 'lukang_4', x: 22, y: 8, art: 'jiangshi', radius: 3, chase: 4 },
      { id: 'sh_hg1', troop: 'lukang_3', x: 12, y: 13, art: 'hanged_ghost', radius: 3, chase: 3 },
      { id: 'sh_hg2', troop: 't_c5_shore_b', x: 20, y: 17, art: 'hanged_ghost', radius: 3, chase: 3 },
    ],
    events: [
      { id: 'c5_shore_in', trigger: 'auto', once: true, run: async (S) => {
        await S.say('', '淤積的舊港道。擱淺的舢舨半埋在泥裡，北邊是一片墓仔埔。');
        if (hasActor('yungui')) await S.say('yungui:serious', '……這裡的屍氣很重。小心會跳的東西。');
      } },
    ],
    warps: [{ x: 35, y: 11, h: 2, to: 'lukang', tx: 1, ty: 32, tdir: 'right' }],
  });

  // ============================================================================================ 洛家古厝・大門 luo_gate (20×14)
  const LG = (() => {
    const g = grid(20, 14, ':');
    g.rect(0, 0, 20, 6, 'R');                // tall red-brick enclosure wall of the mansion
    g.rect(8, 4, 3, 2, '%');                 // under the gate
    g.rect(8, 6, 4, 8, '%');                 // brick path
    g.rect(0, 6, 2, 8, 'R'); g.rect(18, 6, 2, 8, 'R');
    g.rect(2, 11, 3, 2, ','); g.rect(14, 9, 3, 3, ',');
    return g.rows();
  })();
  const gateLight = (s) => (s.flags.ch5_done ? { ambient: 0.05, color: '#203040' }
    : time5(s) === 3 ? { ambient: 0.2, color: '#203040' }
      : time5(s) >= 2 ? { ambient: 0.75, color: '#050818', playerR: s.flags.ch5_lamp ? 230 : 160, playerColor: '#ffb070' }
        : { ambient: 0.28, color: '#1a1a28', tint: 'rgba(160,170,190,0.12)' });
  G.Maps.define('luo_gate', {
    name: '洛家古厝',
    subtitle: '洛府・大門',
    place: 'lukang',
    bgm: (s) => (time5(s) === 3 ? 'sad' : 'mansion'),
    start: [9, 10],
    light: gateLight,
    particles: [{ type: 'wind', density: 0.7 }, 'leaves'],
    tiles: LG,
    objects: [
      { t: 'gate_city', x: 8, y: 4, text: '洛府', lit: false },
      { t: 'statue_lion', x: 7, y: 6 }, { t: 'statue_lion', x: 11, y: 6, flip: true },
      { t: 'well', x: 4, y: 8 }, { t: 'tree_dead', x: 2, y: 7 }, { t: 'tree_dead', x: 16, y: 7 }, { t: 'tree_dead', x: 15, y: 12 },
      { t: 'tallgrass', x: 3, y: 11 }, { t: 'tallgrass', x: 14, y: 10 }, { t: 'silvergrass', x: 5, y: 12 }, { t: 'silvergrass', x: 16, y: 10 },
      { t: 'lantern_string', x: 7, y: 6, w: 5, v: 2, lift: 120, if: (s) => !s.flags.ch5_rest },
      { t: 'lantern_string', x: 7, y: 6, w: 5, v: 0, lift: 120, if: (s) => !!s.flags.ch5_rest },
      { t: 'rock_small', x: 12, y: 11 }, { t: 'stump', x: 3, y: 9 },
      { t: 'pot', x: 10, y: 6, if: (s) => !!s.vars.c5_bowl },
    ],
    npcs: [
      { id: 'fubo', sprite: 'servant_old', name: '福伯', ghost: true, x: 9, y: 4, dir: 'down',
        pos: (s) => (s.flags.ch5_unmask ? [12, 7] : [9, 4]),
        if: (s) => !s.flags.ch5_fubo_done && (!s.flags.ch5_enter || s.flags.ch5_unmask) && s.flags.ch5_gate,
        talk: (S) => fuboTalk(S) },
    ],
    events: [
      { id: 'c5_gate_first', trigger: 'auto', if: (s) => !s.flags.ch5_gate, run: (S) => sceneGate(S) },
      { id: 'c5_gate_enter', trigger: 'auto', if: (s) => s.flags.ch5_lamp && !s.flags.ch5_enter, run: (S) => sceneEnter(S) },
      { id: 'c5_fubo_1', trigger: 'auto', if: (s) => s.flags.ch5_unmask && !s.quests.q_fubo, run: (S) => fuboStep1(S) },
      { id: 'c5_gate_well', trigger: 'action', x: 4, y: 8, label: '井', run: async (S) => {
        await S.say('', '門前的井早就乾了。井底只有落葉。');
      } },
      { id: 'c5_gate_lion', trigger: 'action', x: 7, y: 6, label: '石獅', run: async (S) => {
        await S.say('', '左邊的石獅缺了一隻耳朵。');
        if (hasActor('hongying')) await S.say('hongying:smile', '……是我七歲爬上去摔下來，撞斷的。');
      } },
    ],
    warps: [
      { x: 9, y: 5, to: 'luo_1f', tx: 19, ty: 26, tdir: 'up', door: true, run: async (S) => {
        if (flag('ch5_enter')) return true;
        await S.say('', '門被一股冷風推著，打不開。');
        await S.move('player', 'D');
        return false;
      } },
      { x: 8, y: 13, w: 4, to: 'lukang', tx: 27, ty: 39, tdir: 'down' },
    ],
    drawOver(ctx, t) {
      // 黃符 on the gate (burns away once the 洛家燈 arrives)
      if (flag('ch5_enter')) return;
      const x = 9 * T + 20, y = 4 * T + 20;
      ctx.save();
      ctx.fillStyle = '#e8c84a'; ctx.strokeStyle = '#8a6a1a'; ctx.lineWidth = 1;
      ctx.fillRect(x, y, 24, 54); ctx.strokeRect(x, y, 24, 54);
      ctx.strokeStyle = 'rgba(190,40,30,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 12, y + 6); ctx.lineTo(x + 12, y + 48); ctx.moveTo(x + 5, y + 16); ctx.lineTo(x + 19, y + 16);
      ctx.moveTo(x + 6, y + 28); ctx.quadraticCurveTo(x + 12, y + 22, x + 18, y + 30); ctx.moveTo(x + 6, y + 40); ctx.lineTo(x + 18, y + 38); ctx.stroke();
      // cold draught from the gap
      if (time5() >= 2 || !flag('ch5_gate')) {
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2);
        ctx.fillStyle = '#9ab8e8';
        ctx.beginPath(); ctx.ellipse(9 * T + 32, 5 * T + 40, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  });

  // ---- §3-2 洛家大門與福伯 -------------------------------------------------------------------------------------
  async function sceneGate(S) {
    S.flag('ch5_gate');
    S.hideFollowers(false);
    place(S, [['player', 9, 9, 'up'], ['hongying', 9, 8, 'up'], ['baizhi', 8, 9, 'up'], ['yungui', 10, 9, 'up'], ['tuanzi', 10, 10, 'up']]);
    await S.camera(9, 6, 0.6);
    await S.say('', '（洛家古厝大門。圍牆斑駁，白燈籠被風撕成碎條。門上一張黃符，硃砂褪了一半。）');
    await S.say('hongying:sad', '……');
    S.face('hongying', 'left');
    await S.say('hongying:sad', '門口的獅子，左邊那隻缺一隻耳朵。是我七歲爬上去摔下來，撞斷的。');
    await S.say('hongying:smile', '爹罰我跪了一個下午。哥偷偷拿牛舌餅給我吃……不對，是福伯拿的。哥只負責把風。');
    S.face('hongying', 'up');
    S.emote('yungui', '!');
    await S.say('yungui:surprise', '（盯著門上的符）……這是師父的符。');
    await S.say('xinghe:surprise', '清虛真人來過這裡？');
    await S.say('yungui:serious', '「鎮宅符」。把屋裡的東西封在裡面，不讓它出來。……符力快沒了。');
    await S.move('hongying', 'UU');
    S.sfx('wind'); S.shake(3, 0.4);
    await S.say('', '（紅纓伸手推門。門縫裡突然湧出一陣冷風。門後，一個佝僂的老人身影擋在那裡。）');
    S.emote('fubo', '!');
    await S.say('福伯', '莫入來！小姐，莫入來！');
    S.emote('hongying', '!');
    await S.say('hongying:surprise', '……福伯？');
    await S.say('福伯', '裡面有鬼！好多鬼！老爺叫我顧門！不能讓它們出去，不能讓妳入來！');
    await S.say('福伯', '小姐，妳去天后宮！去媽祖那裡！天光以前不要回來！');
    await S.say('hongying:cry', '福伯……已經……已經三年了……');
    await S.say('福伯', '三年？莫亂講，今暗是中元，酒席才剛擺好……');
    S.sfx('dark'); S.shake(6, 0.5); S.flash('#203050', 0.4, 0.6);
    await S.move('hongying', 'DD', { speed: 6 });
    S.face('hongying', 'up');
    S.sfx('door');
    await S.fadeActor('fubo', 0.25, 0.5);
    await S.say('', '（門內冷風驟強，黑霧從門縫湧出，紅纓被推退兩步。門「砰」地關上。）');
    await S.say('yungui:serious', '他還困在那一晚。而且這屋子裡的東西……比他看到的還多。');
    await S.say('yungui:think', '符是師父貼的。他一定知道怎麼進去。他在鹿港會落腳的地方——');
    await S.say('yungui:normal', '天后宮。道士借宿，十有八九在廟裡。');
    await S.say('hongying:serious', '（擦掉眼淚）……走。');
    await S.fadeActor('fubo', 1, 0.3);
    S.cameraFollow();
    S.gather();
    S.quest('q_ch5_main', 1);
    S.objective('去天后宮打聽清虛真人');
  }

  // ---- §3-6 進入古厝 -------------------------------------------------------------------------------------------
  async function sceneEnter(S) {
    S.hideFollowers(false);
    place(S, [['player', 9, 8, 'up'], ['hongying', 9, 7, 'up'], ['baizhi', 8, 8, 'up'], ['yungui', 10, 8, 'up'], ['tuanzi', 10, 9, 'up']]);
    await S.camera(9, 6, 0.4);
    await S.say('', '（夜。風停了。古厝大門前，連蟲鳴都沒有。紅纓提著洛家燈。）');
    S.sfx('fire'); S.flash('#ffb060', 0.5, 0.5);
    S.flag('ch5_enter');
    await S.say('', '（燈光照到大門。門上的符無聲地燃成灰。門內的冷風退了。）');
    await S.say('福伯', '（門縫後）……這盞燈……是施師傅的燈。上面寫著「洛」……');
    await S.say('福伯', '小姐……？妳怎麼回來了……');
    await S.say('hongying:serious', '福伯。我回來了。讓我進去。');
    await S.say('福伯', '不行……裡面……（聲音漸弱）老爺說……顧好門……');
    await S.say('hongying:sad', '福伯你一直顧著。顧得很好。現在換我進去，好不好？');
    await S.wait(0.8);
    S.sfx('door');
    await S.fadeActor('fubo', 0, 1.0);
    await S.say('', '（沉默。門「吱呀」一聲，開了一條縫。福伯的身影退到門房的陰影裡。）');
    await S.say('福伯', '……小姐，燈要提好。裡面的東西，怕光。');
    await S.say('yungui:serious', '進去之後，洛家燈不能離手。燈照不到的地方，有東西會抓人。');
    S.move('tuanzi', 'L', { wait: false });
    await S.say('tuanzi:surprise', '（躲到雲歸袖子裡）吾……吾在這裡幫你們把風。');
    S.face('hongying', 'right');
    await S.say('hongying:normal', '（抱起糰子）你跟我。我需要摸個軟的東西。');
    await S.say('tuanzi:sad', '……好吧。');
    S.quest('q_ch5_main', 4);
    S.objective('探索洛家古厝');
    await S.warp('luo_1f', 19, 26, 'up');
  }

  // ---- §4-1 福伯（心燈 #10） ---------------------------------------------------------------------------------------
  async function fuboStep1(S) {
    S.hideFollowers(false);
    const fb = G.mapScene.actor('fubo');
    if (fb) { fb.alpha = 1; S.setPos('fubo', 12, 7, 'left'); }
    place(S, [['player', 9, 9, 'up'], ['hongying', 11, 7, 'right'], ['baizhi', 8, 9, 'up'], ['yungui', 10, 9, 'up'], ['tuanzi', 10, 10, 'up']]);
    await S.camera(11, 7, 0.4);
    await S.say('', '（天快亮了。大門邊的門房裡，福伯的鬼魂還站在那裡，手撐著門閂。）');
    await S.say('福伯', '小姐……裡面……靜下來了？');
    await S.say('hongying:sad', '嗯。靜下來了。那些東西，都走了。');
    await S.say('福伯', '老爺呢？夫人呢？少爺呢？');
    await S.say('hongying:sad', '……');
    await S.say('hongying:serious', '爹和娘……走了。三年前就走了。');
    await S.say('hongying:serious', '哥……還活著。他只是迷路了。');
    await S.say('福伯', '（笑）少爺從細漢就愛迷路。去天后宮會走到港邊，去港邊會走到墓仔埔。');
    await S.say('福伯', '小姐，妳要去找他喔。妳若不找，他會一直迷路下去。');
    await S.say('hongying:cry', '……我會。');
    await S.say('福伯', '那……福伯可以休息了嗎？顧門顧得……腳好痠。');
    await S.say('福伯', '啊，在走之前……福伯好想吃一片牛舌餅。以前偷買給小姐，自己都沒吃過。');
    S.quest('q_fubo', 0);
    S.cameraFollow();
    S.gather();
    if (S.hasItem('niushebing')) { await S.say('hongying:think', '……身上剛好有一片。'); await fuboStep2(S); return; }
    S.objective('買一片牛舌餅給福伯（不見天街）');
  }
  async function fuboTalk(S) {
    if (G.Quests.isDone('q_fubo')) return;
    if (G.state.quests.q_fubo && S.hasItem('niushebing')) { await fuboStep2(S); return; }
    if (G.state.quests.q_fubo) { await S.say('福伯', '牛舌餅……要不見天街那攤的。薄薄的、酥酥的。'); return; }
    if (flag('ch5_enter')) { await S.say('福伯', '小姐，燈要提好……'); return; }
    await S.say('福伯', '莫入來……莫入來……');
  }
  async function fuboStep2(S) {
    S.take('niushebing', 1);
    S.hideFollowers(false);
    place(S, [['hongying', 11, 7, 'right'], ['player', 10, 8, 'up']]);
    await S.say('hongying:smile', '（把牛舌餅放在門檻上）……福伯。這次換我買給你。');
    await S.say('福伯', '（拿起來，咬一口。牛舌餅碎了一地）……碎得一塌糊塗。');
    await S.say('福伯', '（笑出聲）跟以前藏在袖子裡的一模一樣。');
    await S.say('福伯', '小姐，大門……天光以後，要記得開。洛家的門，不能一直關著。');
    await S.say('福伯', '有人來，才是家。');
    S.sfx('lantern');
    const fb = G.mapScene.actor('fubo');
    if (fb) fb.ghost = true;
    await S.fadeActor('fubo', 0.3, 0.8);
    await S.say('', '（福伯放開門閂。他的身影變成一點溫和的光，飄起，在紅纓頭上繞了一圈，往海的方向去了。）');
    S.flash('#fff0c0', 0.6, 0.5);
    S.remove('fubo');
    await S.say('hongying:cry', '……福伯，謝謝你。顧了三年。');
    S.flag('ch5_fubo_done');
    await S.give('c5_luo_key');
    await S.give('c5_fubo_pipe');
    S.quest('q_fubo', 'done');
    await S.lantern('lantern_fubo', '福伯');
    S.gather();
    S.quest('q_ch5_main', 6);
    S.objective('回客棧休息');
  }

  // @@C5-CONTINUE@@
})();

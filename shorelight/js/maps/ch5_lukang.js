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

  // @@C5-CONTINUE@@
})();

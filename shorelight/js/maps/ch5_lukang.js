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
  // S.move / S.walkTo that also work for party followers (the engine never resolves a follower's step
  // promises, so awaiting S.move on a follower would hang): followers are polled until they stop.
  async function mv(S, id, path, o = {}) {
    const m = G.mapScene;
    const a = m && m.actor(id);
    if (!a) return;
    const sp = a.speed;
    if (!m.followers.includes(a)) await S.move(id, path, o);
    else {
      S.move(id, path, Object.assign({}, o, { wait: false }));
      if (o.wait === false) return;
      for (let i = 0; i < 400 && (a.queue.length || a.moving); i++) await S.wait(0.05);
    }
    if (o.speed && o.wait !== false) a.speed = sp;
  }
  // followers back behind the leader, walking speeds restored
  function regroup(S) {
    S.gather();
    const m = G.mapScene;
    if (!m) return;
    m.player.speed = 4.2;
    for (const f of m.followers) f.speed = 4.2;
    m.hideFollowers = false;
  }
  function walk(S, id, x, y, o = {}) {
    const a = G.mapScene && G.mapScene.actor(id);
    if (!a) return Promise.resolve();
    const dx = x - a.x, dy = y - a.y;
    const h = (dx > 0 ? 'R' : 'L').repeat(Math.abs(dx)), v = (dy > 0 ? 'D' : 'U').repeat(Math.abs(dy));
    return mv(S, id, o.yFirst ? v + h : h + v, o);
  }

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
        await mv(S, 'player', 'D');
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
        await mv(S, 'player', 'R');
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
    await walk(S, 'hongying', 51, 3);
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
    regroup(S);
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
    await mv(S, 'player', 'UU');
    S.move('baizhi', 'UUU', { wait: false });
    await mv(S, 'hongying', 'UU');
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
      await walk(S, 'baizhi', 12, 4, { yFirst: true });
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
    regroup(S);
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
      { id: 'c5_inn_auto', trigger: 'auto', if: (s) => s.flags.ch5_fubo_done && !s.flags.ch5_noodles && !s.vars.c5_inn_scene && !(G.mapScene && G.mapScene.c5innAsked), run: (S) => innScene(S) },
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
      { id: 'lk_watchman', sprite: 'old_m', name: '打更阿福伯', pos: (s) => (gateClosed(s) ? [33, 8] : [31, 3]), x: 31, y: 3, dir: 'down', talk: (S) => watchmanTalk(S) },
      { id: 'lk_shrine_kid', sprite: 'child_m', name: '巷仔內的囝仔', x: 30, y: 25, dir: 'right', wander: 2, if: (s) => time5(s) < 2,
        talk: ['直直走會被風吹回來！要彎過去、彎過去！', '你看，風在直巷子裡最大，轉個彎就沒了。'] },
      { id: 'lk_auntie_home', sprite: 'villager_f', name: '阿婆家媳婦', x: 34, y: 28, dir: 'up', if: (s) => time5(s) < 2,
        talk: ['施師傅那間燈籠舖，四十年了。我嫁來的時候，他就在那裡糊燈。', '晚上隘門會關，要找打更的阿福伯開門。'] },
    ],
    enemies: [
      { id: 'jq_paper1', troop: 'lukang_1', x: 6, y: 16, art: 'paper_servant', radius: 3, chase: 3, if: (s) => time5(s) === 2 && !s.flags.ch5_unmask },
      { id: 'jq_paper2', troop: 'lukang_2', x: 30, y: 27, art: 'jiangshi', radius: 3, chase: 3, if: (s) => time5(s) === 2 && !s.flags.ch5_unmask },
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
        await mv(S, 'player', 'D');
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
            await mv(S, 'player', step, { speed: 9 });
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
    await mv(S, 'tuanzi', 'RRR', { speed: 6 });
    await mv(S, 'tuanzi', 'DDDD', { speed: 6 });
    S.sfx('push'); S.shake(2, 0.3);
    S.emote('tuanzi', '…');
    await S.say('', '（糰子衝到巷子中間——卡住了。噗嘰。）');
    await S.say('tuanzi:cry', '卡、卡住了！前面過不去！後面也退不回來！');
    await S.say('yungui:normal', '這就是一路吃牛舌餅的報應。');
    await walk(S, 'player', 4, 4);
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
    await mv(S, 'tuanzi', 'DDDDD', { speed: 9 });
    S.setPos('tuanzi', 5, 15, 'left');
    await S.jump('tuanzi', 36);
    await S.say('阿桑', '哈哈哈！我在這巷子口住了五十年，第一次看到貓卡在裡面！');
    await S.say('tuanzi:angry', '吾不是貓！');
    // 星河 walks in; 白芷 comes from the other end
    await mv(S, 'player', 'DDDD');
    S.setPos('baizhi', 4, 13, 'up');
    await mv(S, 'baizhi', 'UUUU');
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
    regroup(S);
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
        await mv(S, 'lk_watchman', 'UUUU');
        S.setPos('lk_watchman', 31, 3, 'down');
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
    await mv(S, 'wn_wang', 'D');
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
    regroup(S);
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
    await walk(S, 'baizhi', 11, 4, { yFirst: true });
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
    regroup(S);
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
    npcs: [{ id: 'lk_wang', sprite: 'noble_m', name: '王少爺', x: 4, y: 6, dir: 'down', talk: (S) => wangTalk(S) }],
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
      { id: 'sh_hg1', troop: 'lukang_3', x: 12, y: 13, art: 'paper_servant', radius: 3, chase: 3 },
      { id: 'sh_hg2', troop: 't_c5_shore_b', x: 20, y: 17, art: 'jiangshi', radius: 3, chase: 3 },
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
      { id: 'fubo', sprite: 'servant_old', name: '福伯', ghost: true, x: 9, y: 6, dir: 'down',
        pos: (s) => (s.flags.ch5_unmask ? [12, 7] : [9, 6]),
        if: (s) => !s.flags.ch5_fubo_done && !s.flags.ch5_rest && (!s.flags.ch5_enter || s.flags.ch5_unmask) && s.flags.ch5_gate,
        talk: (S) => fuboTalk(S) },
    ],
    events: [
      { id: 'c5_gate_first', trigger: 'auto', if: (s) => !s.flags.ch5_gate, run: (S) => sceneGate(S) },
      { id: 'c5_gate_enter', trigger: 'auto', if: (s) => s.flags.ch5_lamp && !s.flags.ch5_enter, run: (S) => sceneEnter(S) },
      { id: 'c5_fubo_1', trigger: 'auto', if: (s) => s.flags.ch5_unmask && !s.quests.q_fubo && !s.flags.ch5_rest, run: (S) => fuboStep1(S) },
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
        await mv(S, 'player', 'D');
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
    S.refresh();
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
    await mv(S, 'hongying', 'U');
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
    await mv(S, 'hongying', 'D', { speed: 6 });
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
    regroup(S);
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
    regroup(S);
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
    regroup(S);
    S.quest('q_ch5_main', 6);
    S.objective('回客棧休息');
  }

  // ============================================================================================ 洛家古厝・一樓 luo_1f (40×30)
  const L1 = (() => {
    const g = grid(40, 30, 'R');
    g.rect(2, 2, 36, 4, ':'); g.rect(15, 2, 6, 3, '%'); g.rect(30, 3, 6, 2, '%');       // 後院
    g.rect(2, 6, 36, 2, 'P'); g.rect(4, 6, 1, 2, '_'); g.rect(34, 6, 1, 2, '_');         // wall + back doors
    g.rect(2, 8, 7, 5, '_');                                                              // 下人房・福伯房
    g.rect(2, 13, 7, 2, 'P'); g.rect(5, 13, 1, 2, '_');
    g.rect(2, 15, 7, 7, 't');                                                             // 廚房
    g.rect(9, 8, 2, 15, 'P'); g.rect(9, 19, 2, 1, '%');
    g.rect(11, 8, 18, 6, 't'); g.rect(13, 9, 14, 4, 'c');                                 // 大廳
    g.rect(11, 14, 18, 2, 'P'); g.rect(19, 14, 2, 2, 't');                                // hall wall + door
    g.rect(11, 16, 18, 7, '%');                                                           // 練武場（天井）
    g.rect(29, 8, 2, 15, 'P'); g.rect(29, 21, 2, 1, '%');
    g.rect(31, 8, 7, 3, '_');                                                             // 樓梯間
    g.rect(31, 11, 7, 2, 'P'); g.rect(34, 11, 1, 2, '_');
    g.rect(31, 13, 7, 9, '_');                                                            // 帳房
    g.rect(11, 23, 18, 2, 'P'); g.rect(19, 23, 2, 2, '_');
    g.rect(11, 25, 18, 3, '_');                                                           // 門廳
    g.rect(19, 28, 2, 1, '_');                                                            // main door
    return g.rows();
  })();
  const MEM = (s) => (s || G.state).vars.c5_mem || 0;
  const NY = (s) => time5(s) === 4;                                    // 除夕 (cleaned house)
  const ruin = (s) => !MEM(s) && !NY(s);
  const luo1Light = (s) => (MEM(s) ? { ambient: 0, tint: 'rgba(255,200,120,0.2)', tintMode: 'source-over', player: false }
    : NY(s) ? { ambient: 0.5, color: '#120810', playerR: 200, tint: null, player: true }
      : s.flags.ch5_boss ? { ambient: 0.62, color: '#05060f', playerR: 230, playerColor: '#ffb070', tint: null, player: true }
        : { ambient: 0.86, color: '#03040c', playerR: s.flags.ch5_lamp ? 230 : 110, playerColor: '#ffb070', tint: null, player: true });
  const luoParticles = (s) => (NY(s) ? ['embers', 'lanterns'] : ['motes', { type: 'embers', density: 0.25 }]);
  const enemyOn = (s) => !s.flags.ch5_boss && !MEM(s) && !NY(s);
  const chairRow = [];
  for (let x = 14; x <= 25; x += 2) { chairRow.push({ t: 'chair', x, y: 10, dir: 'down' }); chairRow.push({ t: 'chair', x, y: 12, dir: 'up' }); }

  G.Maps.define('luo_1f', {
    name: '洛家古厝',
    subtitle: (s) => (NY(s) ? '除夕・圍爐' : '一樓'),
    place: 'lukang',
    noSave: false,
    bgm: (s) => (NY(s) ? 'festival' : 'mansion'),
    start: [19, 26],
    light: luo1Light,
    particles: luoParticles,
    tiles: L1,
    objects: [
      // 後院
      { t: 'tree_banyan', x: 8, y: 2 }, { t: 'well', x: 14, y: 3 }, { t: 'table', x: 18, y: 3 },
      { t: 'chair', x: 17, y: 3, dir: 'right' }, { t: 'chair', x: 19, y: 3, dir: 'left' },
      { t: 'mushroom_glow', x: 11, y: 4, spirit: true }, { t: 'stump', x: 23, y: 4 }, { t: 'tree_dead', x: 28, y: 2 },
      { t: 'jar', x: 36, y: 2 }, { t: 'rock_small', x: 31, y: 5 }, { t: 'tallgrass', x: 25, y: 5, if: ruin }, { t: 'tallgrass', x: 6, y: 5, if: ruin },
      // 下人房
      { t: 'bed_mat', x: 2, y: 8 }, { t: 'bed_mat', x: 4, y: 8 }, { t: 'bed_mat', x: 6, y: 8 },
      { t: 'table', x: 7, y: 11 }, { t: 'cabinet', x: 8, y: 8 }, { t: 'bucket', x: 2, y: 12 },
      // 廚房
      { t: 'stove', x: 3, y: 15 }, { t: 'pot', x: 5, y: 15 }, { t: 'jar_row', x: 7, y: 15 }, { t: 'table', x: 5, y: 18 },
      { t: 'jar', x: 2, y: 20 }, { t: 'jar', x: 3, y: 21 }, { t: 'broom', x: 2, y: 17 }, { t: 'bucket', x: 8, y: 21 },
      { t: 'herbs_rack', x: 8, y: 17 },
      // 大廳
      { t: 'altar', x: 19, y: 8 }, { t: 'pillar', x: 12, y: 8 }, { t: 'pillar', x: 27, y: 8 },
      { t: 'table', x: 14, y: 11, w: 12 }, { t: 'chair', x: 13, y: 11, dir: 'right' }, ...chairRow,
      { t: 'red_lantern', x: 15, y: 8, hang: true, if: (s) => !ruin(s) }, { t: 'red_lantern', x: 24, y: 8, hang: true, if: (s) => !ruin(s) },
      { t: 'lantern_string', x: 13, y: 9, w: 14, v: 1, lift: 40, if: NY },
      { t: 'door_frame', x: 19, y: 15, solid: true, if: (s) => !s.flags.ch5_mirrors },
      { t: 'door_frame', x: 20, y: 15, solid: true, if: (s) => !s.flags.ch5_mirrors },
      // 練武場
      { t: 'weapon_rack', x: 12, y: 16 }, { t: 'stump', x: 22, y: 19 },
      { t: 'tree_dead', x: 26, y: 17, if: ruin }, { t: 'tree_maple', x: 26, y: 17, if: (s) => !ruin(s) },
      { t: 'flowers', x: 12, y: 21, if: (s) => !ruin(s) }, { t: 'flowers', x: 27, y: 21, if: (s) => !ruin(s) },
      { t: 'bones', x: 16, y: 20, if: ruin }, { t: 'rock_small', x: 24, y: 22, if: ruin },
      { t: 'lantern_string', x: 12, y: 16, w: 16, v: 1, lift: 60, if: NY },
      // 樓梯間・帳房
      { t: 'stairs_up', x: 36, y: 8 }, { t: 'jar', x: 31, y: 8 },
      { t: 'bookshelf', x: 31, y: 13 }, { t: 'cabinet', x: 35, y: 13 }, { t: 'counter', x: 32, y: 16 },
      { t: 'table', x: 34, y: 19 }, { t: 'chair', x: 33, y: 19, dir: 'right' }, { t: 'paper_stack', x: 37, y: 20 },
      // 門廳
      { t: 'screen', x: 13, y: 25, alpha: 0.75, if: ruin }, { t: 'screen', x: 13, y: 25, if: (s) => !ruin(s) },
      { t: 'chair', x: 16, y: 26, dir: 'left', if: ruin }, { t: 'chair', x: 24, y: 25, dir: 'right', if: ruin },
      { t: 'plant_pot', x: 26, y: 25, v: 2, if: (s) => !ruin(s) }, { t: 'red_lantern', x: 18, y: 25, hang: true, if: NY },
      { t: 'red_lantern', x: 21, y: 25, hang: true, if: NY },
    ],
    chests: [
      { id: 'c5_06', x: 37, y: 14, item: 'c5_abacus' },
      { id: 'c5_07', x: 3, y: 11, item: 'niushebing', n: 3, run: async (S) => { await S.give('c5_old_coat'); } },
      { id: 'c5_08', x: 14, y: 16, item: 'sp_hutou', run: async (S) => {
        if (hasActor('hongying')) await S.say('hongying:sad', '……洛家的虎頭槍。爹說，等我出嫁那天才給我。');
      } },
    ],
    lights: (s) => {
      const out = [];
      if (s.flags.ch5_boss && !NY(s)) out.push({ x: 14, y: 11, r: 200, color: '#ffb060', flicker: 0.2 });
      if (NY(s)) for (const [x, y] of [[15, 9], [24, 9], [19, 11], [19, 18], [13, 18], [26, 18], [19, 26]]) out.push({ x, y, r: 190, color: '#ff9a50', flicker: 0.25 });
      if (s.flags.ch5_lamp && !s.flags.ch5_mem1 && !MEM(s)) out.push({ x: 29, y: 18, r: 70, color: '#ff4a3a', flicker: 0.4 });
      return out;
    },
    npcs: [],
    enemies: [
      { id: 'l1_js', troop: 'luo_1', x: 4, y: 19, art: 'jiangshi', variant: 1, radius: 2, chase: 3, if: enemyOn },
      { id: 'l1_hg', troop: 'luo_2', x: 4, y: 10, art: 'grudge_maid', radius: 2, chase: 3, if: enemyOn },
      { id: 'l1_sk', troop: 'luo_3', x: 26, y: 4, art: 'bone_general', radius: 3, chase: 3, if: enemyOn },
      { id: 'l1_md', troop: 'luo_5', x: 34, y: 17, art: 'grudge_maid', radius: 2, chase: 3, if: enemyOn },
      { id: 'l1_cy', troop: 'luo_4', x: 24, y: 21, art: 'bone_general', radius: 3, chase: 3, if: enemyOn },
    ],
    events: [
      { id: 'c5_l1_intro', trigger: 'auto', once: true, if: (s) => s.flags.ch5_enter && !s.flags.ch5_boss, run: async (S) => {
        await S.say('', '（門在身後輕輕闔上。洛家燈的光只照得到眼前幾步，再往外，是三年的黑。）');
        await S.say('hongying:serious', '……是門廳。往前是練武場，左邊廚房，右邊帳房。樓梯在東邊。');
        await S.say('yungui:serious', '燈照不到的地方，別待太久。');
      } },
      { id: 'c5_mem1', trigger: 'action', x: 29, y: 17, w: 1, h: 2, label: '月洞門', if: (s) => s.flags.ch5_enter && !s.flags.ch5_mem1, run: (S) => sceneMem1(S) },
      { id: 'c5_mem2', trigger: 'action', x: 3, y: 15, w: 2, h: 1, label: '大灶', if: (s) => s.flags.ch5_enter && !s.flags.ch5_mem2, run: (S) => sceneMem2(S) },
      { id: 'c5_hall_seal', trigger: 'action', x: 19, y: 15, w: 2, h: 1, label: '大廳', if: (s) => !s.flags.ch5_mirrors, run: async (S) => {
        await S.say('', '大廳的門前，黑色的怨氣像一堵牆。燈光照上去，被吞得一乾二淨。');
        if (hasActor('yungui')) await S.say('yungui:think', '……這股氣是從上面壓下來的。二樓的什麼地方，把這屋子的光都鎖住了。');
      } },
      { id: 'c5_mem3', trigger: 'touch', x: 19, y: 15, w: 2, h: 1, if: (s) => s.flags.ch5_mirrors && !s.flags.ch5_boss, run: (S) => sceneMem3(S) },
      { id: 'c5_mush', trigger: 'action', x: 11, y: 4, label: '憶蕈', spirit: true, if: (s) => s.flags.mush_1 && !s.flags.mush_ch5 && s.flags.ch5_enter, run: (S) => sceneMush(S) },
      { id: 'c5_mush_hint', trigger: 'action', x: 11, y: 4, label: '調查', if: (s) => s.flags.mush_1 && !s.flags.mush_ch5 && s.flags.ch5_enter, run: async (S) => {
        await S.say('', '老榕樹的氣根之間，好像有什麼東西在微微發光……用肉眼看不清楚。');
        if (hasActor('yungui')) await S.say('yungui:think', '……有蕈的氣味。要是能看見就好了。（需要靈視）');
      } },
      { id: 'c5_pipe', trigger: 'action', x: 7, y: 11, label: '調查', run: async (S) => {
        await S.say('', '福伯的房間。桌上擺著一支舊煙斗，和一個牛舌餅的空盒子。盒子擦得乾乾淨淨。');
        if (hasActor('hongying')) await S.say('hongying:sad', '……他把空盒子都留著。');
      } },
      { id: 'c5_altar1', trigger: 'action', x: 19, y: 8, w: 2, h: 1, label: '神案', run: async (S) => {
        if (NY()) { await S.say('', '神案上的香燭都換新了。紅纓擺了一盤柑仔。'); return; }
        await S.say('', '大廳的神案。香爐裡的香灰，結成了硬塊。');
      } },
      { id: 'c5_seat', trigger: 'action', x: 13, y: 11, label: '主位', if: (s) => s.flags.ch5_boss, run: async (S) => {
        await S.say('', '主位前的桌上，洛家燈靜靜地亮著。');
      } },
      { id: 'c5_ny', trigger: 'auto', if: (s) => NY(s) && !s.flags.ch5_done, run: (S) => sceneNewYear(S) },
    ],
    warps: [
      { x: 19, y: 28, w: 2, to: 'luo_gate', tx: 9, ty: 6, tdir: 'down', door: true, if: (s) => !NY(s) },
      { x: 36, y: 8, to: 'luo_2f', tx: 28, ty: 12, tdir: 'left', if: (s) => !NY(s) },
    ],
    onUpdate(dt, ms) {
      if (!ms.c5init) {
        ms.c5init = true;
        if (MEM()) { G.state.vars.c5_mem = 0; ms.lightCfg = luo1Light(G.state); }
      }
    },
    drawGround(ctx, t) {
      // 月洞門 on the east wall of the training yard (glows once the 洛家燈 is near)
      const cx = 29 * T + 6, cy = 17 * T + 30;
      ctx.save();
      ctx.lineWidth = 12; ctx.strokeStyle = '#6a5a4a';
      ctx.beginPath(); ctx.arc(cx, cy, 52, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = '#d8c8b0';
      ctx.beginPath(); ctx.arc(cx, cy, 46, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
      if (flag('ch5_lamp') && !flag('ch5_mem1')) {
        ctx.globalAlpha = 0.45 + 0.25 * Math.sin(t * 3);
        ctx.lineWidth = 5; ctx.strokeStyle = '#ff5a4a';
        ctx.beginPath(); ctx.arc(cx, cy, 49, -Math.PI / 2, Math.PI / 2, true); ctx.stroke();
      }
      ctx.restore();
    },
    drawOver(ctx, t, ms) {
      // black resentment sealing the hall
      if (!flag('ch5_mirrors')) {
        ctx.save();
        for (let i = 0; i < 9; i++) {
          const x = 19 * T + 64 + Math.sin(t * 0.8 + i * 1.7) * 60, y = 14 * T + 40 + Math.cos(t * 0.6 + i) * 30;
          const g = ctx.createRadialGradient(x, y, 4, x, y, 70);
          g.addColorStop(0, 'rgba(4,2,10,0.75)'); g.addColorStop(1, 'rgba(4,2,10,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 70, y - 70, 140, 140);
        }
        ctx.restore();
      }
      // the 洛家燈 left on the table before the main seat
      if (flag('ch5_boss') && !NY() && !MEM()) drawLuoLantern(ctx, 14 * T + 32, 11 * T - 6, t);
      // 除夕: round hotpot steam
      if (NY()) {
        ctx.save(); ctx.globalAlpha = 0.25;
        for (let i = 0; i < 4; i++) { const y = 11 * T - 20 - ((t * 30 + i * 18) % 70); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(19 * T + 36 + Math.sin(t * 2 + i) * 6, y, 8 + i, 0, 6.28); ctx.fill(); }
        ctx.restore();
      }
      // memory scenes: warm golden haze & vignette shimmer
      const m = MEM();
      if (m) {
        screenSpace(ctx, ms, (c) => {
          const g = c.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.3, G.W / 2, G.H / 2, G.W * 0.7);
          const col = m === 3 && ms.c5blue ? '60,120,200' : '255,200,120';
          g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${0.35 + 0.05 * Math.sin(t * 2)})`);
          c.fillStyle = g; c.fillRect(0, 0, G.W, G.H);
        });
      }
    },
  });
  function drawLuoLantern(ctx, x, y, t) {
    // the 洛家燈: white paper lantern with a red 「洛」
    ctx.save();
    const g = ctx.createRadialGradient(x, y - 18, 2, x, y - 18, 60);
    g.addColorStop(0, 'rgba(255,200,120,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 60, y - 78, 120, 120);
    ctx.fillStyle = '#3a2418'; ctx.fillRect(x - 10, y - 44, 20, 5); ctx.fillRect(x - 10, y + 2, 20, 5);
    ctx.fillStyle = '#f6ead0'; ctx.strokeStyle = '#a08060'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x, y - 19, 15, 21 + Math.sin(t * 3) * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,120,80,0.4)';
    for (const k of [-8, 0, 8]) { ctx.beginPath(); ctx.ellipse(x, y - 19, Math.abs(15 - Math.abs(k)), 21, 0, 0, Math.PI * 2); ctx.stroke(); }
    G.Render.text(ctx, '洛', x, y - 32, { size: 18, bold: true, align: 'center', color: '#c8282a', shadow: false });
    ctx.restore();
  }

  // ---- memory helpers ---------------------------------------------------------------------------------------------
  async function memoryIn(S, mode, cam, bgm) {
    await S.fadeOut(0.8);
    const ms = G.mapScene;
    G.state.vars.c5_mem = mode;
    ms.c5enemies = ms.enemies; ms.enemies = [];
    ms.c5blue = false;
    S.refresh();
    S.hideFollowers(true);
    S.show('player', false);
    S.light(luo1Light(G.state));
    S.particles(['petals']);
    S.bgm(bgm || 'pingxi');
    await S.camera(cam[0], cam[1], 0.05);
    await S.fadeIn(0.9);
  }
  async function memoryOut(S, ids, back) {
    await S.fadeOut(0.8);
    const ms = G.mapScene;
    for (const id of ids) S.remove(id);
    G.state.vars.c5_mem = 0;
    ms.c5blue = false;
    if (ms.c5enemies) { ms.enemies = ms.c5enemies; ms.c5enemies = null; }
    S.refresh();
    S.hideFollowers(false);
    S.show('player', true);
    S.light(luo1Light(G.state));
    S.particles(luoParticles(G.state));
    S.cameraFollow();
    if (back) place(S, back);
    S.bgm('mansion');
    await S.fadeIn(0.8);
  }

  // ---- §3-7 記憶之門①：練武場 --------------------------------------------------------------------------------
  async function sceneMem1(S) {
    S.flag('ch5_mem1');
    S.hideFollowers(false);
    place(S, [['player', 27, 18, 'right'], ['hongying', 28, 18, 'right'], ['baizhi', 27, 19, 'right'], ['yungui', 26, 17, 'right'], ['tuanzi', 26, 19, 'right']]);
    S.flash('#ff6a50', 0.5, 0.5); S.sfx('magic');
    await S.say('', '（洛家燈照到月洞門，門框泛起紅光。紅纓走過去，燈光一晃——）');
    await memoryIn(S, 1, [20, 18]);
    S.spawn({ id: 'm_hy', sprite: 'child_f', x: 21, y: 19, dir: 'right' });
    S.spawn({ id: 'm_qf', sprite: 'child_m', x: 17, y: 16, dir: 'down' });
    await S.say('', '（記憶。白天的練武場。陽光。兵器架完好。十歲的紅纓抓著一根比她還長的掃把，滿頭大汗。）');
    await S.jump('m_hy');
    await S.say('小紅纓', '嘿！哈！');
    S.sfx('miss');
    await S.say('', '（她戳向木樁——掃把滑掉了。）');
    await S.say('小青鋒', '（坐在欄杆上，咬著一根草，笑出聲）妳那是在掃地還是練槍？');
    S.face('m_hy', 'm_qf');
    S.emote('m_hy', '💢');
    await S.say('小紅纓', '你閉嘴！爹不教我，你也不教我，我只好自己練！');
    await S.say('小青鋒', '爹說女孩子不用學槍。');
    await S.say('小紅纓', '那為什麼你可以！你又不愛練槍，你喜歡劍！');
    await S.say('小青鋒', '……好吧。偷偷教妳。不准跟爹說。');
    await S.jump('m_qf', 18);
    await walk(S, 'm_qf', 20, 19, { yFirst: true });
    S.face('m_qf', 'right'); S.face('m_hy', 'right');
    await S.say('', '（他站到她背後，握住她的手。）');
    await S.say('小青鋒', '妳看，妳握得死緊。手指都白了。');
    await S.say('小青鋒', '槍握太緊，就刺不遠。');
    await S.say('小紅纓', '……為什麼？');
    await S.say('小青鋒', '因為槍要從手心滑出去。妳握那麼緊，它就只能待在妳手裡。');
    await S.say('小青鋒', '放鬆一點。讓它出去，再把它收回來。');
    await S.wait(0.4);
    S.sfx('stab'); S.shake(2, 0.2);
    await S.say('', '（小紅纓一刺——掃把滑出，戳中木樁正中。「咚」。）');
    S.emote('m_hy', '!');
    await S.say('小紅纓', '……！中了！');
    await S.say('小青鋒', '（笑）再教妳一招。洛家槍最難的——回馬槍。');
    await mv(S, 'm_qf', 'U');
    S.face('m_qf', 'left');
    await S.say('小青鋒', '背過身去，讓對方以為妳要逃，等他追上來——');
    S.face('m_qf', 'right'); S.sfx('slash');
    await S.jump('m_qf', 16);
    await S.say('', '（他轉身，回手一挑。）');
    S.emote('m_hy', '♥');
    await S.say('小紅纓', '好帥！');
    await S.say('小青鋒', '等我長大，我要把回馬槍改成劍招。用劍使回馬槍——天下只有我一個人會。');
    await S.say('小青鋒', '以後我用劍，妳用槍。洛家就有兩把武器了。');
    await memoryOut(S, ['m_hy', 'm_qf'], [['player', 27, 18, 'right'], ['hongying', 28, 18, 'left'], ['baizhi', 27, 19, 'right'], ['yungui', 26, 17, 'right'], ['tuanzi', 26, 19, 'right']]);
    await S.say('', '（光散。回到黑暗的練武場。）');
    await S.say('hongying:cry', '……');
    await S.say('hongying:cry', '「用劍使回馬槍，天下只有我一個人會」……');
    await S.say('hongying:surprise', '……天下只有他一個人會……');
    await S.say('xinghe:sad', '紅纓……觀音山那個鬼面——');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '不要說！！');
    await S.say('hongying:cry', '……不要說。拜託。');
    regroup(S);
    memoryHint(S);
  }

  // ---- §3-8 記憶之門②：廚房 ---------------------------------------------------------------------------------
  async function sceneMem2(S) {
    S.flag('ch5_mem2');
    S.hideFollowers(false);
    place(S, [['player', 4, 17, 'up'], ['hongying', 3, 16, 'up'], ['baizhi', 5, 17, 'up'], ['yungui', 6, 16, 'up'], ['tuanzi', 6, 17, 'up']]);
    S.flash('#ff6a50', 0.5, 0.5); S.sfx('magic');
    await memoryIn(S, 2, [5, 18]);
    S.particles(['petals', { type: 'ash', density: 0.6 }]);
    S.spawn({ id: 'm_hy', sprite: 'hongying', x: 4, y: 16, dir: 'up' });
    await S.say('', '（金色記憶。廚房。灶裡冒著黑煙。十四歲的紅纓手忙腳亂，鍋裡的麵線黏成一團黑炭。）');
    S.sfx('fire');
    S.emote('m_hy', '!');
    await S.say('hongying:surprise', '怎麼會這樣！福伯明明說麵線很好煮！');
    S.spawn({ id: 'm_fb', sprite: 'servant_old', x: 8, y: 19, dir: 'left' });
    await S.say('福伯', '（從門口探頭）小姐……麵線是用煮的……不是用炒的……');
    S.face('m_hy', 'm_fb');
    await S.say('hongying:angry', '炒的比較香！');
    await S.say('福伯', '……豬腳呢？');
    await S.say('hongying:think', '……豬腳？');
    S.spawn({ id: 'm_qf', sprite: 'qingfeng', x: 10, y: 19, dir: 'left' });
    await mv(S, 'm_fb', 'D');
    await walk(S, 'm_qf', 6, 18);
    S.face('m_qf', 'm_hy');
    await S.say('', '（十六歲的青鋒走進廚房，聞了一下。）');
    await S.say('qingfeng:surprise', '失火了嗎？');
    await S.say('hongying:cry', '……是你的生日麵線。冬至是你生日。我想煮給你吃……');
    await S.wait(0.5);
    await S.say('', '（青鋒看了看那鍋黑炭，又看了看妹妹哭花的臉。）');
    await S.say('', '（他拿起碗筷，盛了一大碗，坐下就吃。）');
    S.emote('m_hy', '!');
    await S.say('hongying:surprise', '你、你幹嘛！那個不能吃！');
    await S.say('qingfeng:think', '（嚼嚼）……嗯。有焦香。');
    await S.say('qingfeng:smile', '外面脆脆的，裡面……也脆脆的。很特別。');
    await S.say('hongying:cry', '騙人！');
    await S.say('qingfeng:laugh', '沒騙妳。這是我吃過最好吃的生日麵線。');
    await S.say('qingfeng:smile', '以後每年生日，都要吃妳煮的。說好了喔。');
    S.emote('m_fb', '💧');
    await S.say('', '（福伯在門外偷偷擦眼睛。）');
    await memoryOut(S, ['m_hy', 'm_fb', 'm_qf'], [['player', 4, 17, 'up'], ['hongying', 3, 16, 'down'], ['baizhi', 5, 17, 'left'], ['yungui', 6, 16, 'left'], ['tuanzi', 6, 17, 'left']]);
    await S.say('yungui:think', '……原來妳的廚藝，是從那時候開始的。');
    await S.say('hongying:sad', '……他每一碗都吃完。第二年那碗——我把鹽當成糖——他也吃完了。');
    await S.say('hongying:sad', '我後來一直練。一直練。想煮一碗不焦的給他吃。');
    await S.say('hongying:cry', '……可是他已經不在了啊。');
    await mv(S, 'baizhi', 'L');
    await S.say('', '（白芷握住紅纓的手。）');
    regroup(S);
    memoryHint(S);
  }
  function memoryHint(S) {
    const f = G.state.flags;
    if (f.ch5_mem1 && f.ch5_mem2 && !f.ch5_trunk) S.objective('上二樓看看（東邊的樓梯）');
    else if (f.ch5_mem1 && f.ch5_mem2 && f.ch5_trunk && !f.ch5_mirrors) S.objective('去二樓的公媽廳');
    else S.objective('探索洛家古厝');
  }

  // ---- 糰子的蕈譜：憶蕈 ----------------------------------------------------------------------------------------
  async function sceneMush(S) {
    S.hideFollowers(false);
    place(S, [['player', 12, 5, 'left'], ['yungui', 13, 5, 'left'], ['tuanzi', 11, 5, 'up'], ['hongying', 12, 4, 'left'], ['baizhi', 14, 4, 'left']]);
    await S.say('', '（老榕樹的氣根間，長著幾朵半透明、會隨著燈光改變顏色的小蕈。）');
    S.emote('yungui', '!');
    await S.say('yungui:surprise', '憶蕈……古書上說，長在有很多回憶的老房子裡。');
    await S.say('yungui:serious', '糰子，這次讓我先畫——');
    S.sfx('item');
    await S.say('', '（糰子已經吃了。）');
    S.emote('yungui', '💢');
    await S.say('yungui:angry', '💢💢');
    S.vision(20);
    await S.say('tuanzi:think', '（瞳孔變成彩色漩渦。四周的榕樹氣根像在呼吸。）');
    await S.say('tuanzi:serious', '……吾看見了。這棵樹，記得每一個在它下面乘涼的人。');
    await S.say('tuanzi:serious', '小時候的紅纓姐姐，在這裡偷吃福伯的牛舌餅。');
    S.emote('hongying', '!');
    await S.say('hongying:surprise', '……！');
    await S.say('tuanzi:serious', '青鋒哥哥爬到樹上，被他爹罵。');
    await S.say('tuanzi:serious', '樹記得。但是樹不難過。');
    await S.say('tuanzi:serious', '因為樹知道：記得，跟放不下，是兩件事。');
    await S.wait(0.6);
    await S.say('hongying:sad', '……臭糰子。吃個蘑菇講那麼有道理。');
    await S.say('tuanzi:serious', '而且吾看見雲歸小時候尿床。');
    await S.say('yungui:angry', '那是你自己編的！你又沒看過！');
    await S.say('', '（糰子倒下打呼。）');
    S.flag('mush_ch5');
    G.state.vars.tuanzi_mush = (G.state.vars.tuanzi_mush || 0) + 1;
    S.quest('q_tuanzi_mush', 1);
    G.UI.toast('蕈譜記下一格：{y}憶蕈{/}', { icon: 'mushroom' });
    regroup(S);
  }

  // ============================================================================================ 洛家古厝・二樓 luo_2f (32×22)
  const L2 = (() => {
    const g = grid(32, 22, 'R');
    g.rect(2, 2, 8, 7, '_');                       // 書房
    g.rect(12, 2, 9, 7, 't');                      // 公媽廳 (puzzle grid 9×7)
    g.rect(5, 9, 1, 2, '_'); g.rect(16, 9, 1, 2, 't');
    g.rect(2, 11, 28, 2, '_');                     // 迴廊
    g.rect(12, 13, 8, 8, ' ');                     // 天井上空
    g.rect(2, 15, 8, 5, '_'); g.rect(5, 13, 1, 2, '_');   // 紅纓的房間
    g.rect(22, 15, 8, 5, '_'); g.rect(26, 13, 1, 2, '_'); // 青鋒的房間
    return g.rows();
  })();
  // ---- P2 銅鏡與燈: grid (gx, gy) → map (12 + gx, 2 + gy) ----------------------------------------------------
  const P2 = {
    ox: 12, oy: 2, w: 9, h: 7, lamp: [1, 6], tablet: [4, 0],
    screens: [[1, 2], [3, 3], [5, 2], [7, 5]], pillars: [[0, 0], [8, 0], [0, 6], [8, 6]],
    mirrors: { m1: [1, 4, '\\'], m2: [6, 4, '\\'], m3: [6, 1, '/'], m4: [4, 1, '/'] },
  };
  function mirState() {
    const v = G.state.vars;
    if (!v.c5_mir) {
      v.c5_mir = {};
      for (const k in P2.mirrors) v.c5_mir[k] = { open: false, d: P2.mirrors[k][2] };
    }
    return v.c5_mir;
  }
  // trace the beam from the lamp seat; returns { pts:[[gx,gy]...], end:[gx,gy], hit, cells:Set('x,y') }
  function traceBeam() {
    if (!flag('ch5_lamp_seat') || flag('ch5_boss')) return null;
    const ms = mirState();
    const block = new Set([...P2.screens, ...P2.pillars].map(([x, y]) => x + ',' + y));
    const mir = {};
    for (const k in P2.mirrors) mir[P2.mirrors[k][0] + ',' + P2.mirrors[k][1]] = k;
    let [x, y] = P2.lamp;
    let dx = 0, dy = -1;
    const pts = [[x, y]];
    const cells = new Set([x + ',' + y]);
    let hit = false, end = null;
    for (let i = 0; i < 80; i++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= P2.w || ny >= P2.h) { end = [x + dx * 0.45, y + dy * 0.45]; break; }
      const key = nx + ',' + ny;
      if (nx === P2.tablet[0] && ny === P2.tablet[1]) { hit = true; end = [nx, ny + 0.2]; cells.add(key); break; }
      if (block.has(key)) { end = [x + dx * 0.55, y + dy * 0.55]; break; }
      x = nx; y = ny;
      cells.add(key);
      if (mir[key]) {
        const m = ms[mir[key]];
        if (!m.open) { end = [x - dx * 0.3, y - dy * 0.3]; break; }
        pts.push([x, y]);
        if (m.d === '/') { const t = dx; dx = -dy; dy = -t; } else { const t = dx; dx = dy; dy = t; }
      }
    }
    pts.push(end);
    return { pts, end, hit, cells };
  }
  const ready2f = (s) => s.flags.ch5_mem1 && s.flags.ch5_mem2 && s.flags.ch5_trunk;
  const luo2Light = (s) => (s.flags.ch5_boss ? { ambient: 0.62, color: '#05060f', playerR: 230, playerColor: '#ffb070' }
    : s.flags.ch5_mirrors ? { ambient: 0.75, color: '#05060f', playerR: 230, playerColor: '#ffb070' }
      : { ambient: 0.9, color: '#020309', playerR: 230, playerColor: '#ffb070' });

  G.Maps.define('luo_2f', {
    name: '洛家古厝',
    subtitle: '二樓',
    place: 'lukang',
    bgm: 'mansion',
    start: [28, 11],
    light: luo2Light,
    particles: ['motes'],
    tiles: L2,
    objects: [
      // 書房
      { t: 'bookshelf', x: 2, y: 2 }, { t: 'bookshelf', x: 4, y: 2 }, { t: 'table', x: 6, y: 5, w: 2 }, { t: 'chair', x: 6, y: 6, dir: 'up' },
      { t: 'screen', x: 2, y: 7 }, { t: 'plant_pot', x: 9, y: 2, v: 0 }, { t: 'paper_stack', x: 9, y: 6 },
      // 公媽廳
      { t: 'altar', x: 16, y: 2 },
      ...P2.pillars.map(([x, y]) => ({ t: 'pillar', x: P2.ox + x, y: P2.oy + y })),
      ...Object.keys(P2.mirrors).map((k) => ({ t: 'mirror_stand', x: P2.ox + P2.mirrors[k][0], y: P2.oy + P2.mirrors[k][1], key: 'c5' + k })),
      // 迴廊
      { t: 'fence_wood', x: 12, y: 13, w: 8 }, { t: 'red_lantern', x: 8, y: 11, hang: true, lit: false }, { t: 'jar', x: 2, y: 11 },
      // 紅纓的房間
      { t: 'bed', x: 2, y: 15 }, { t: 'cabinet', x: 4, y: 15 }, { t: 'basket', x: 7, y: 16, v: 2 }, { t: 'plant_pot', x: 8, y: 15, v: 1 },
      { t: 'rug', x: 4, y: 17, w: 3, h: 2 },
      // 青鋒的房間
      { t: 'bed', x: 29, y: 15 }, { t: 'bookshelf', x: 22, y: 15 }, { t: 'cabinet', x: 25, y: 15 }, { t: 'weapon_rack', x: 27, y: 15 },
      { t: 'table', x: 24, y: 18 }, { t: 'chair', x: 23, y: 18, dir: 'right' },
    ],
    pass: [
      ...P2.screens.map(([x, y]) => ({ x: P2.ox + x, y: P2.oy + y, solid: true })),
      { x: P2.ox + P2.lamp[0], y: P2.oy + P2.lamp[1], solid: true },
    ],
    chests: [
      { id: 'c5_09', x: 9, y: 15, item: 'c5_old_hairpin' },
      { id: 'c5_10', x: 8, y: 3, item: 'c5_father_tassel', if: (s) => !!s.flags.ch5_mirrors },
      { id: 'c5_11', x: 29, y: 17, item: 'c5_sw_youth', run: async (S) => {
        await S.say('', '劍的底下壓著一張字條：「給紅纓，等她學會回馬槍。」');
        if (hasActor('hongying')) await S.say('hongying:sad', '……誰要你的劍。笨蛋。');
      } },
    ],
    lights: (s) => {
      const out = [];
      const b = traceBeam();
      if (b) for (const k of b.cells) { const [x, y] = k.split(',').map(Number); out.push({ x: P2.ox + x, y: P2.oy + y, r: 80, color: '#ffb070', flicker: 0.1 }); }
      if (s.flags.ch5_lamp_seat && !s.flags.ch5_boss) out.push({ x: P2.ox + P2.lamp[0], y: P2.oy + P2.lamp[1], r: 120, color: '#ffb060', flicker: 0.2 });
      if (s.flags.ch5_mirrors) out.push({ x: 16, y: 3, r: 220, color: '#ffd090', flicker: 0.15 });
      return out;
    },
    enemies: [
      { id: 'l2_md1', troop: 't_c5_maid', x: 14, y: 5, art: 'grudge_maid', radius: 2, chase: 2, speed: 1.6, if: (s) => !s.flags.ch5_mirrors && !s.flags.ch5_boss },
      { id: 'l2_md2', troop: 't_c5_maid', x: 19, y: 5, art: 'grudge_maid', radius: 2, chase: 2, speed: 1.6, if: (s) => !s.flags.ch5_mirrors && !s.flags.ch5_boss },
      { id: 'l2_hg', troop: 'luo_2', x: 9, y: 12, art: 'grudge_maid', radius: 3, chase: 3, if: (s) => !s.flags.ch5_boss },
      { id: 'l2_js', troop: 'luo_1', x: 26, y: 18, art: 'jiangshi', variant: 1, radius: 2, chase: 3, if: (s) => !s.flags.ch5_boss },
    ],
    events: [
      { id: 'c5_hall_gate', trigger: 'touch', x: 16, y: 10, if: (s) => !ready2f(s), run: async (S) => {
        await S.say('', '公媽廳的門口，黑得像一口井。燈光伸進去，就斷了。');
        await S.say('yungui:serious', '……還不是時候。這屋子還有東西想讓紅纓看。樓下、房間，都再看看。');
        await mv(S, 'player', 'D');
      } },
      { id: 'c5_hall_intro', trigger: 'touch', x: 16, y: 8, if: (s) => ready2f(s) && !s.flags.ch5_hall_intro, run: (S) => sceneHallIntro(S) },
      { id: 'c5_lampseat', trigger: 'action', x: 13, y: 8, label: '燈座', if: (s) => !s.flags.ch5_mirrors, run: (S) => lampSeat(S) },
      { id: 'c5_m1', trigger: 'action', x: 13, y: 6, label: '銅鏡', if: (s) => s.flags.ch5_hall_intro && !s.flags.ch5_mirrors, run: (S) => mirrorUse(S, 'm1') },
      { id: 'c5_m2', trigger: 'action', x: 18, y: 6, label: '銅鏡', if: (s) => s.flags.ch5_hall_intro && !s.flags.ch5_mirrors, run: (S) => mirrorUse(S, 'm2') },
      { id: 'c5_m3', trigger: 'action', x: 18, y: 3, label: '銅鏡', if: (s) => s.flags.ch5_hall_intro && !s.flags.ch5_mirrors, run: (S) => mirrorUse(S, 'm3') },
      { id: 'c5_m4', trigger: 'action', x: 16, y: 3, label: '銅鏡', if: (s) => s.flags.ch5_hall_intro && !s.flags.ch5_mirrors, run: (S) => mirrorUse(S, 'm4') },
      { id: 'c5_tablets', trigger: 'action', x: 16, y: 2, w: 2, h: 1, label: '牌位', run: async (S) => {
        if (flag('ch5_mirrors')) await S.say('', '「洛門歷代祖先」。牌位前的香爐裡，插著三炷香。');
        else await S.say('', '黑暗深處，什麼都看不見。只感覺得到，那裡有很多雙眼睛在等。');
      } },
      { id: 'c5_trunk', trigger: 'action', x: 25, y: 15, label: '戲箱', if: (s) => !s.flags.ch5_trunk, run: (S) => sceneTrunk(S) },
      { id: 'c5_trunk2', trigger: 'action', x: 25, y: 15, label: '戲箱', if: (s) => !!s.flags.ch5_trunk, run: async (S) => {
        await S.say('', '一排面具：目連、觀音、牛頭、馬面……中間空了一格。');
      } },
      { id: 'c5_qf_books', trigger: 'action', x: 22, y: 15, w: 2, h: 1, label: '書架', run: async (S) => {
        await S.say('', '書架上是劍譜和戲本。《目連救母》翻開在某一頁，邊角被翻得起了毛。');
      } },
      { id: 'c5_qf_rack', trigger: 'action', x: 27, y: 15, w: 2, h: 1, label: '劍架', run: async (S) => {
        await S.say('', '劍架空著。');
      } },
      { id: 'c5_vanity', trigger: 'action', x: 4, y: 15, label: '梳妝台', run: async (S) => {
        await S.say('', '鏡子用白布蓋著。家裡有人過世，鏡子要蓋起來——怕亡魂在鏡子裡看見自己，迷了路。');
        if (hasActor('hongying')) await S.say('hongying:sad', '是鄰居幫忙蓋的吧。我那時……什麼都沒辦法做。');
      } },
      { id: 'c5_toys', trigger: 'action', x: 7, y: 16, label: '籃子', run: (S) => sceneToys(S) },
      { id: 'c5_study_box', trigger: 'action', x: 6, y: 5, w: 2, h: 1, label: '空匣', run: async (S) => {
        await S.say('', '父親的書桌上，放著一個打開的長木匣。匣子裡的絨布，壓著一桿槍譜的形狀——空的。');
        if (hasActor('hongying')) await S.say('hongying:think', '洛家槍譜……被誰拿走了？……哥的劍譜也一起不見了。');
      } },
    ],
    warps: [{ x: 29, y: 11, to: 'luo_1f', tx: 36, ty: 9, tdir: 'down' }],
    onUpdate(dt, ms) {
      // light is safe: 怨婢 standing in the beam freeze and cannot grab anyone
      const b = traceBeam();
      if (b) for (const e of ms.enemies) {
        const gx = e.x - P2.ox, gy = e.y - P2.oy;
        if (b.cells.has(gx + ',' + gy)) e.stun = Math.max(e.stun || 0, 0.25);
      }
      // in the pitch-black 公媽廳 the lamp only reaches three steps
      const p = ms.player;
      const inHall = p.x >= P2.ox && p.x < P2.ox + P2.w && p.y >= P2.oy && p.y < P2.oy + P2.h;
      if (ms.lightCfg) ms.lightCfg.playerR = inHall && !flag('ch5_mirrors') ? 150 : 230;
    },
    drawOver(ctx, t, ms) {
      const mir = mirState();
      // folding screens (屏風) — 1-cell puzzle obstacles
      for (const [gx, gy] of P2.screens) {
        const x = (P2.ox + gx) * T, y = (P2.oy + gy) * T;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 32, y + 58, 28, 6, 0, 0, 6.28); ctx.fill();
        for (let k = 0; k < 3; k++) {
          const px = x + 6 + k * 18, off = k % 2 ? 4 : 0;
          ctx.fillStyle = '#3a1a10'; ctx.fillRect(px, y - 34 + off, 17, 90);
          const gr = ctx.createLinearGradient(0, y - 30, 0, y + 50);
          gr.addColorStop(0, '#e8dcc0'); gr.addColorStop(1, '#c8b890');
          ctx.fillStyle = gr; ctx.fillRect(px + 2, y - 30 + off, 13, 78);
          ctx.strokeStyle = 'rgba(90,110,90,0.5)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(px + 3, y + 20 + off); ctx.quadraticCurveTo(px + 8, y - 4 + off, px + 14, y + 12 + off); ctx.stroke();
        }
        ctx.restore();
      }
      // lamp seat (燈座) and the 洛家燈 placed on it
      {
        const x = (P2.ox + P2.lamp[0]) * T, y = (P2.oy + P2.lamp[1]) * T;
        ctx.save();
        ctx.fillStyle = '#4a2a1a'; ctx.fillRect(x + 18, y + 20, 28, 34);
        ctx.fillStyle = '#6a3a22'; ctx.fillRect(x + 12, y + 14, 40, 8); ctx.fillRect(x + 14, y + 50, 36, 8);
        ctx.restore();
        if (flag('ch5_lamp_seat') && !flag('ch5_boss')) drawLuoLantern(ctx, x + 32, y + 14, t);
      }
      // mirror cloths and orientation marks
      for (const k in P2.mirrors) {
        const [gx, gy] = P2.mirrors[k];
        const x = (P2.ox + gx) * T + 32, y = (P2.oy + gy) * T - 10;
        ctx.save();
        if (!mir[k].open) {
          ctx.fillStyle = '#ece8e0'; ctx.strokeStyle = '#a8a090'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x - 6, y - 32); ctx.quadraticCurveTo(x, y - 38, x + 6, y - 32);
          ctx.lineTo(x + 26, y + 40); ctx.quadraticCurveTo(x, y + 48, x - 26, y + 40); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = 'rgba(150,140,120,0.5)';
          for (const o of [-12, 0, 12]) { ctx.beginPath(); ctx.moveTo(x + o * 0.3, y - 26); ctx.lineTo(x + o, y + 40); ctx.stroke(); }
        } else {
          const d = mir[k].d;
          ctx.strokeStyle = 'rgba(255,220,140,0.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
          ctx.beginPath();
          if (d === '/') { ctx.moveTo(x - 12, y + 12); ctx.lineTo(x + 12, y - 12); } else { ctx.moveTo(x - 12, y - 12); ctx.lineTo(x + 12, y + 12); }
          ctx.stroke();
        }
        ctx.restore();
      }
      // the beam
      const b = traceBeam();
      if (b) {
        const P = (q) => [(P2.ox + q[0]) * T + 32, (P2.oy + q[1]) * T + 22];
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [w, c] of [[16, 'rgba(255,120,60,0.18)'], [8, 'rgba(255,170,90,0.45)'], [3, 'rgba(255,240,200,0.95)']]) {
          ctx.lineWidth = w + Math.sin(t * 6) * (w > 10 ? 2 : 0.5);
          ctx.strokeStyle = c;
          ctx.beginPath();
          b.pts.forEach((q, i) => { const [x, y] = P(q); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y - 30); });
          ctx.stroke();
        }
        const [ex, ey] = P(b.end);
        const gr = ctx.createRadialGradient(ex, ey, 1, ex, ey, b.hit ? 46 : 22);
        gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.fillStyle = gr; ctx.fillRect(ex - 50, ey - 50, 100, 100);
        ctx.restore();
      }
      // pitch-black hall veil (before the ancestors see the light)
      if (!flag('ch5_mirrors')) {
        ctx.save();
        const p = ms.player;
        for (let gy = 0; gy < P2.h; gy++) for (let gx = 0; gx < P2.w; gx++) {
          if (b && b.cells.has(gx + ',' + gy)) continue;
          const d = Math.hypot(P2.ox + gx - p.x, P2.oy + gy - p.y);
          const a = Math.min(0.55, Math.max(0, (d - 1.5) * 0.25));
          if (a <= 0) continue;
          ctx.fillStyle = `rgba(0,0,4,${a})`;
          ctx.fillRect((P2.ox + gx) * T, (P2.oy + gy) * T - 40, T, T + 40);
        }
        ctx.restore();
      }
    },
  });

  // ---- §3-9 青鋒的房間：戲箱 -------------------------------------------------------------------------------
  async function sceneTrunk(S) {
    S.flag('ch5_trunk');
    S.hideFollowers(false);
    place(S, [['player', 25, 16, 'up'], ['hongying', 24, 16, 'up'], ['yungui', 23, 17, 'up'], ['baizhi', 26, 17, 'up'], ['tuanzi', 25, 17, 'up']]);
    await S.say('', '（青鋒的房間。劍架空著。書架上的戲本《目連救母》翻開在某一頁。）');
    await S.say('yungui:think', '目連救母。目連的母親墮入地獄，他下到地府去救她。……中元普渡常演這齣。');
    await S.say('hongying:normal', '那年普渡，爹請了戲班來家裡演這齣。戲班的戲箱寄在哥房裡。哥喜歡那些面具。');
    S.sfx('door');
    await S.say('', '（戲箱。一排面具：目連、觀音、牛頭、馬面……中間空了一格。空格的輪廓：一張猙獰的鬼王面。）');
    await S.say('hongying:think', '……少了一張。');
    if (flag('ch3_mask_shard') || G.Inv.has(SHARD_MASK)) {
      await S.say('', '（紅纓從懷裡拿出在觀音山撿到的碎片。白底、黑紋、一道紅。）');
      S.emote('hongying', '!');
      await S.say('hongying:surprise', '（把碎片放進空格旁比對）……花紋……一樣。');
      await S.say('hongying:surprise', '這是……戲箱裡的鬼王面……');
      await S.say('xinghe:serious', '紅纓……');
      await S.say('hongying:angry', '……他偷的！那晚他殺了人，從這裡偷了面具戴上！一定是這樣！');
      await S.say('yungui:sad', '……');
    } else {
      await S.say('hongying:think', '鬼王面……鬼面……（她搖搖頭）……不會的。不會的。');
    }
    regroup(S);
    memoryHint(S);
  }
  // ---- §3-10 紅纓的房間：一籃小玩偶 -----------------------------------------------------------------------------
  async function sceneToys(S) {
    if (flag('ch5_toys')) { await S.say('', '一籃小玩偶：布老虎、泥娃娃……那隻毛線石虎已經被紅纓收進懷裡了。'); return; }
    S.flag('ch5_toys');
    await S.say('', '（一籃小玩偶：布老虎、泥娃娃、一隻毛線石虎。）');
    await S.say('xinghe:surprise', '這一籃……全都是可愛的東西？');
    S.emote('hongying', '💢');
    await S.say('hongying:shy', '💢 不、不准看！');
    S.emote('tuanzi', '!');
    await S.say('tuanzi:surprise', '有一隻吾！毛線做的吾！');
    await S.say('hongying:shy', '……那是哥在廟會買給我的。說長得像山裡的石虎。');
    await S.say('hongying:sad', '我那時候說醜死了。……其實我每天抱著睡。');
    await S.give('c5_yarn_tiger');
  }

  // ---- §3-11 公媽廳：掀開白布 ＋ P2 ----------------------------------------------------------------------------
  async function sceneHallIntro(S) {
    S.flag('ch5_hall_intro');
    S.hideFollowers(false);
    place(S, [['player', 16, 8, 'up'], ['hongying', 15, 8, 'up'], ['yungui', 17, 8, 'up'], ['baizhi', 16, 9, 'up'], ['tuanzi', 16, 10, 'up']]);
    await S.say('', '（二樓公媽廳。洛家燈的光只照得到眼前三步。祖先牌位在黑暗深處，看不見。）');
    await S.say('yungui:serious', '這裡的黑，是有重量的。燈照不進去。');
    await S.say('xinghe:think', '那邊有個燈座。還有……四面鏡子？都蓋著布。');
    await S.say('hongying:sad', '嫁妝鏡台。娘的、奶奶的、曾祖母的……洛家的媳婦，每一代都帶一面鏡子嫁進來。');
    await S.say('hongying:sad', '喪事的時候，全都蓋起來了。');
    await S.say('yungui:think', '把燈放上燈座，用鏡子把光引到牌位前。祖先看見了光，這屋子的黑就散了。');
    await S.say('yungui:normal', '可是要先掀開白布。');
    await S.wait(0.8);
    await S.say('hongying:sad', '掀開白布……就是說，喪事辦完了。');
    await S.say('hongying:sad', '就是說，我承認他們都不在了。');
    await S.say('xinghe:serious', '紅纓，我們可以——');
    regroup(S);
    S.objective('把洛家燈放上燈座，用銅鏡把光引到牌位前');
  }
  async function lampSeat(S) {
    if (flag('ch5_lamp_seat')) {
      await S.say('', '燈座上，洛家燈靜靜地亮著，光直直往北照。');
      return;
    }
    await S.say('', '一座空的燈座。放燈的地方，正對著北邊。');
    const c = await S.choice(['把洛家燈放上去', '先不要'], { cancel: 1 });
    if (c !== 0) return;
    S.flag('ch5_lamp_seat');
    S.sfx('lantern');
    await S.say('', '（紅纓把洛家燈放上燈座。一道金紅色的光，筆直地往北射了出去。）');
    await checkMirrors(S);
  }
  async function mirrorUse(S, k) {
    const m = mirState()[k];
    if (!m.open) {
      const first = !Object.values(mirState()).some((x) => x.open);
      if (first) {
        await S.say('hongying:serious', '（走到鏡子前）三年了。');
        await S.say('hongying:serious', '該掀開了。');
      } else if (k === 'm2') await S.say('hongying:sad', '娘的鏡子。她每天早上在這裡梳頭，梳一百下。');
      else if (k === 'm3') await S.say('hongying:sad', '奶奶的。我小時候被它嚇過，以為裡面有另一個我。');
      else if (k === 'm4') await S.say('hongying:sad', '曾祖母的。……從唐山帶過來的。過黑水溝的時候，她一直抱在懷裡。');
      else await S.say('hongying:sad', '……爹說，這面是曾曾祖母的。');
      m.open = true;
      S.sfx('item');
      await S.say('', first ? '（她扯下白布。鏡子裡映出她自己——和身後的洛家燈。）' : '（白布滑落。銅鏡映出微弱的燈光。）');
    } else {
      const c = await S.choice(['轉動銅鏡', '不動它'], { cancel: 1 });
      if (c !== 0) return;
      m.d = m.d === '/' ? '\\' : '/';
      S.sfx('switch');
    }
    await checkMirrors(S);
  }
  async function checkMirrors(S) {
    const b = traceBeam();
    if (!b || !b.hit || flag('ch5_mirrors')) return;
    await S.wait(0.4);
    await sceneMirrorsDone(S);
  }
  async function sceneMirrorsDone(S) {
    S.flag('ch5_mirrors');
    S.hideFollowers(false);
    await S.camera(16, 4, 0.6);
    S.sfx('gong');
    S.flash('#ffe0a0', 0.8, 0.7);
    await S.say('', '（光束從燈座出發，經過四面鏡子，最後落在祖先牌位上。牌位一塊塊亮起：「洛門歷代祖先」。）');
    S.light(luo2Light(G.state));
    S.sfx('wind');
    await S.say('', '（一陣溫暖的風從牌位吹來，掠過紅纓的髮梢。整間屋子的黑霧像退潮一樣散去。）');
    S.sfx('bell');
    await S.say('baizhi:think', '……有人摸了紅纓的頭。');
    await S.say('hongying:cry', '……嗯。我感覺到了。');
    S.shake(3, 0.6); S.sfx('door');
    await S.say('', '（樓下傳來沉重的聲響——大廳的門，開了。隨之而來的，是杯盤碰撞的聲音、笑聲、勸酒聲……）');
    await S.say('yungui:serious', '宴席開始了。');
    G.mapScene.enemies = G.mapScene.enemies.filter((e) => !/^l2_md/.test(e.id));
    S.cameraFollow();
    regroup(S);
    S.objective('回一樓大廳');
  }

  // ---- 頭目 怨宴：special rules (installed through the battle's intro hook) ------------------------------------------
  //  · 上菜: every third turn of the feast (announced one turn earlier) a dish is served to a random member —
  //    冷飯 sleep / 苦酒 poison + magDown / 紙錢湯 MP −40 %. A defending member knocks the dish over.
  //  · phase 2 (≤ 50 %): all candles go out — party physical attacks miss 25 % more; any fire skill relights the
  //    candles for 3 feast turns. The first dish of phase 2 is always the burnt birthday noodles for 紅纓
  //    (劍意 +50, atkUp, cleanse). On the second feast turn of phase 2 福伯 calls out the weak spot behind the
  //    main seat: 紅纓's hits on the feast deal ×1.25.
  //  · ch5_jiaobei (三個聖筊): 紅纓 DEF +10 % in this battle.
  function feastIntro(sc) {
    const boss = sc.enemies.find((e) => e.id === 'c5_feast');
    if (!boss) return;
    const hy = sc.party.find((p) => p.id === 'hongying');
    if (hy && G.state.flags.ch5_jiaobei) hy.def = Math.round(hy.def * 1.1);
    const R = { n: 0, p2: 0, served: false, fubo: false, relight: 0 };
    const say = (who, text) => G.Dialog.say(who, text);
    const dark = () => boss.phase >= 2 && R.relight <= 0 && !boss.dead;
    const DISHES = [
      ['冷飯', (tg) => { if (!(tg.immune || []).includes('sleep')) sc.addStatus(tg, 'sleep', 2); else sc.popText(tg, '無效', '#aaaaaa'); }],
      ['苦酒', (tg) => { if (!(tg.immune || []).includes('poison')) sc.addStatus(tg, 'poison', 3); sc.addStatus(tg, 'magDown', 3); }],
      ['紙錢湯', (tg) => { const v = Math.round(tg.mp * 0.4); tg.mp -= v; sc.popText(tg, `-${v} MP`, '#8ac8ff', 20); }],
    ];
    async function serve() {
      const alive = sc.alive('party');
      if (!alive.length) return;
      sc.banner('上菜', '#ff9a8a');
      G.Audio.sfx('ghost');
      if (boss.phase >= 2 && !R.served && hy && !hy.dead) {
        R.served = true;
        await say('怨宴', '……壽……麵……');
        await say('', '（端給紅纓的，是一碗燒焦的豬腳麵線。）');
        await say('hongying:surprise', '……！');
        await say('hongying:angry', '……誰准你——拿我的麵線來嚇我！！');
        await say('hongying:serious', '那碗麵線，我哥吃完了！一根都沒剩！');
        G.Dialog.close();
        hy.gauge = Math.min(100, (hy.gauge || 0) + 50);
        for (const k of ['poison', 'seal', 'sleep', 'stun', 'trance', 'atkDown', 'defDown', 'magDown', 'spdDown']) delete hy.st[k];
        sc.addStatus(hy, 'atkUp', 3);
        await say('xinghe:laugh', '好！紅纓上啊！');
        G.Dialog.close();
        return;
      }
      const tg = U.pick(alive);
      await sc.wait(0.4);
      if (tg.st.guard) {
        G.Audio.sfx('shatter');
        sc.popText(tg, '打翻了！', '#f0e0b0');
        sc.say('端上來的菜，被擋下打翻了！', 1.4);
        await sc.wait(0.8);
        return;
      }
      const [name, fx] = U.pick(DISHES);
      sc.say(`怨宴端上了「${name}」。`, 1.6);
      fx(tg);
      await sc.wait(0.9);
    }
    const origStart = sc.startTurn.bind(sc);
    sc.startTurn = async (u) => {
      const skip = await origStart(u);
      if (u !== boss || boss.dead || sc.result) return skip;
      if (boss.phase >= 2) {
        R.p2++;
        if (R.relight > 0) { R.relight--; if (!R.relight) sc.say('燭火又熄了……', 1.2); }
        if (R.p2 === 2 && !R.fubo) {
          R.fubo = true;
          await say('福伯', '小姐！主位！那張椅子後面！');
          G.Dialog.close();
          sc.say('看穿了主位的弱點！紅纓的攻擊更有效了。', 1.8);
          await sc.wait(0.8);
        }
      }
      if (skip) return skip;
      R.n++;
      if (R.n % 3 === 2) { sc.banner('……上……菜……', '#ffb0a0'); sc.say('怨宴：……上……菜……（防禦可以擋下）', 1.8); await sc.wait(1.0); }
      else if (R.n % 3 === 0) { await serve(); return true; }
      return skip;
    };
    const origApply = sc.applyEffect.bind(sc);
    sc.applyEffect = (u, tg, s, hits) => {
      if (dark() && u.side === 'party' && tg.side === 'enemy' && s.type === 'phys' && Math.random() < 0.25) {
        sc.popText(tg, '看不清', '#9aa0c0'); G.Audio.sfx('miss');
        return;
      }
      const hp0 = tg.hp;
      origApply(u, tg, s, hits);
      if (u.side === 'party' && s.elem === 'fire' && boss.phase >= 2 && R.relight <= 0 && !boss.dead) {
        R.relight = 3;
        sc.say('火光重新點燃了燭台！黑暗散去了。', 1.6);
      }
      if (R.fubo && u.id === 'hongying' && tg === boss && !tg.dead && (s.type === 'phys' || s.type === 'mag')) {
        const extra = Math.round((hp0 - tg.hp) * 0.25);
        if (extra > 0) sc.damage(tg, extra, { color: '#ffb070', noGauge: true });
      }
    };
    const origUpd = sc.update.bind(sc);
    sc.update = (dt) => { origUpd(dt); if (dark() && !sc.result) sc.dim = Math.max(sc.dim || 0, 0.6); };
  }

  // ---- §3-12 記憶之門③：中元夜 ★ → 頭目 怨宴 ------------------------------------------------------------------
  async function sceneMem3(S) {
    S.hideFollowers(false);
    place(S, [['player', 19, 15, 'up'], ['hongying', 20, 15, 'up'], ['baizhi', 19, 16, 'up'], ['yungui', 20, 16, 'up'], ['tuanzi', 18, 16, 'up']]);
    S.flash('#ff6a50', 0.6, 0.6); S.sfx('magic');
    await memoryIn(S, 3, [19, 11], 'pingxi');
    S.spawn({ id: 'm_fa', sprite: 'noble_m', x: 17, y: 9, dir: 'down' });
    S.spawn({ id: 'm_mo', sprite: 'noble_f', x: 22, y: 9, dir: 'down' });
    S.spawn({ id: 'm_fb', sprite: 'servant_old', x: 13, y: 13, dir: 'right' });
    S.spawn({ id: 'm_hy', sprite: 'hongying', x: 19, y: 13, dir: 'up' });
    S.spawn({ id: 'm_qf', sprite: 'qingfeng', x: 24, y: 13, dir: 'left' });
    await S.say('', '（金色記憶。三年前，中元黃昏。大廳裡擺著普渡的長桌，全豬、紅龜粿、牲禮，戲台在院子裡搭著。）');
    S.move('m_fb', 'RRRR', { wait: false });
    await S.say('', '（洛父與洛母在主位旁指揮擺桌。福伯端著盤子跑來跑去。）');
    await S.say('洛父', '紅纓。這籃供品，拿去天后宮。在媽祖面前替咱家上香，天光前回來。');
    S.emote('m_hy', '💢');
    await S.say('hongying:angry', '為什麼是我！我想看戲！今晚演《目連救母》！');
    await S.say('洛母', '（微笑）戲年年都有。媽祖那邊，今年換妳去。妳是洛家的女兒，也該替家裡做點事了。');
    await S.say('hongying:angry', '哼！');
    S.face('m_hy', 'down');
    await mv(S, 'm_hy', 'DD');
    await walk(S, 'm_qf', 20, 15);
    S.face('m_qf', 'left');
    await S.say('', '（十七歲的青鋒追出門，手裡拿著一條長長的紅緞帶。）');
    await S.say('qingfeng:smile', '喂，臭丫頭。');
    S.face('m_hy', 'right');
    await S.say('hongying:angry', '幹嘛！');
    await S.say('qingfeng:smile', '（把紅緞帶綁上她的馬尾）去天后宮的路上風大。頭髮綁好，不然又被吹成鳥窩。');
    await S.say('hongying:shy', '……這紅色好俗。');
    await S.say('qingfeng:laugh', '配妳的紅纓槍剛好。快去快回，戲我替妳看，回來演給妳看。');
    await S.say('hongying:smile', '……演不好我就戳你。');
    S.face('m_hy', 'down');
    await mv(S, 'm_hy', 'DDDD', { speed: 4 });
    S.fadeActor('m_hy', 0, 0.6);
    S.face('m_qf', 'down');
    await S.say('', '（她提著籃子跑出去。青鋒站在門口，看著她的背影，笑。）');
    // 金色褪成冷藍
    S.bgm(null);
    await S.wait(0.6);
    const ms = G.mapScene;
    ms.c5blue = true;
    S.light({ tint: 'rgba(60,120,200,0.28)', tintMode: 'source-over' });
    S.particles(['motes', { type: 'mist', density: 0.8 }]);
    S.sfx('splash');
    await S.say('', '（記憶的金色開始褪色、發青。燈火一盞一盞轉成冷藍。）');
    S.sfx('dark'); S.shake(4, 0.8);
    await S.say('', '（海潮聲。遠方，八卦形的天空裂開。大廳的人們沒有察覺——桌下、樑上、窗縫裡，爬進無數藍色的手。）');
    const hands = [['m_g1', 'ghost_m', 12, 10], ['m_g2', 'ghost_f', 26, 10], ['m_g3', 'ghost_m', 14, 13], ['m_g4', 'ghost_f', 25, 13], ['m_g5', 'ghost_child', 11, 12], ['m_g6', 'ghost_m', 28, 12]];
    for (const [id, sp, x, y] of hands) { const a = S.spawn({ id, sprite: sp, x, y, dir: x < 19 ? 'right' : 'left', ghost: true }); a.alpha = 0; S.fadeActor(id, 0.8, 0.8); }
    S.bgm('tension');
    await S.wait(0.8);
    S.sfx('ghost'); S.flash('#203060', 0.5, 0.8); S.shake(8, 0.8);
    for (const [id] of hands) S.move(id, 'U', { wait: false });
    S.emote('m_fa', '!'); S.emote('m_mo', '!'); S.emote('m_qf', '!');
    await S.say('', '（畫面急速暗下。笑聲變成尖叫。）');
    // the real 紅纓 stands in the middle of the remembered hall
    for (const id of ['m_fa', 'm_mo', 'm_fb', 'm_qf', 'm_hy']) S.fadeActor(id, 0, 0.5);
    S.show('player', true); S.hideFollowers(false);
    place(S, [['player', 18, 14, 'up'], ['hongying', 19, 13, 'up'], ['baizhi', 17, 14, 'up'], ['yungui', 20, 14, 'up'], ['tuanzi', 21, 14, 'up']]);
    await S.say('hongying:cry', '（站在記憶的大廳中央）不要……不要再看了……');
    S.sfx('ghost'); S.shake(6, 0.6);
    await S.say('', '（冷藍色的影子聚攏到長桌上，杯盤、燭台、全豬、紅龜粿融成一體——一張巨大的、長滿嘴的宴桌立了起來。）');
    await S.say('怨宴', '入……座……');
    await S.say('怨宴', '入座……入座……宴席……還沒……吃完……');
    await S.say('yungui:serious', '那晚爬進來的東西，吃不完這場宴，就賴著不走了。');
    await S.say('hongying:angry', '（紅纓槍一振，紅緞帶在背後飛揚）……三年了。');
    await S.say('hongying:angry', '我家的桌子——輪不到你們坐！');
    await S.battle('t_c5_feast', { intro: feastIntro, bgmAfter: 'sad' });
    // after the battle
    for (const id of ['m_fa', 'm_mo', 'm_fb', 'm_qf', 'm_hy', ...hands.map((h) => h[0])]) S.remove(id);
    G.state.vars.c5_mem = 0;
    ms.c5blue = false;
    S.flag('ch5_boss');
    if (ms.c5enemies) ms.c5enemies = null;
    ms.enemies = [];
    S.refresh();
    S.light(luo1Light(G.state));
    S.particles(['motes']);
    S.bgm('sad');
    place(S, [['player', 18, 13, 'up'], ['hongying', 19, 13, 'up'], ['baizhi', 17, 13, 'up'], ['yungui', 20, 13, 'up'], ['tuanzi', 21, 13, 'up']]);
    await S.say('', '（宴桌崩塌，杯盤化成灰燼。冷藍色的影子尖叫著散去。大廳只剩一張張空椅子。）');
    await walk(S, 'hongying', 13, 12);
    S.face('hongying', 'up');
    await S.say('', '（紅纓走到主位前。椅子上積著三年的灰。）');
    await S.say('hongying:sad', '爹……娘……');
    S.sfx('lantern');
    await S.say('', '（她把洛家燈放在主位前的桌上。燈火靜靜地亮著。）');
    await S.say('hongying:sad', '我回家了。');
    await S.wait(0.8);
    await sceneUnmask(S);
  }

  // ---- §3-13 鬼面卸下面具 ★★ -----------------------------------------------------------------------------------
  async function sceneUnmask(S) {
    S.sfx('step');
    await S.say('', '（二樓傳來腳步聲。很輕。眾人抬頭——迴廊上，一個黑影走向公媽廳。）');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '……有人。');
    await S.fadeOut(0.5);
    await S.warp('luo_2f', 16, 8, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(false);
    S.bgm(null);
    place(S, [['player', 15, 8, 'up'], ['hongying', 16, 8, 'up'], ['baizhi', 14, 7, 'up'], ['yungui', 17, 8, 'up'], ['tuanzi', 16, 9, 'up']]);
    S.spawn({ id: 'qf', sprite: 'qingfeng_mask', x: 15, y: 3, dir: 'up' });
    await S.camera(16, 5, 0.05);
    await S.fadeIn(0.6);
    await S.say('', '（公媽廳裡，鬼面跪在祖先牌位前，正把三炷香插進香爐。香煙筆直。）');
    await S.say('qingfeng_mask', '……');
    await S.say('yungui:think', '（子時……已經過了。今天是——）');
    await S.say('baizhi:sad', '冬至。');
    await S.say('hongying:angry', '……你。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '你有什麼資格——在我家祖先面前上香！！');
    S.bgm('tension');
    S.move('qf', 'L', { speed: 5, wait: false });
    await mv(S, 'hongying', 'UULLU', { speed: 7 });
    S.face('hongying', 'up');
    S.face('qf', 'down');
    S.sfx('metal'); S.shake(4, 0.3); S.flash('#ffffff', 0.2, 0.4);
    await S.say('', '（紅纓衝上前，槍尖直刺。鬼面拔劍架住，退一步，卻不還手。）');
    await S.say('qingfeng_mask', '……');
    await S.say('hongying:angry', '拔劍啊！你在觀音山不是很會嗎！');
    for (let i = 0; i < 2; i++) { S.sfx('stab'); S.shake(3, 0.2); await S.wait(0.3); }
    await mv(S, 'qf', 'U', { speed: 5 });
    S.face('qf', 'down');
    await mv(S, 'hongying', 'U', { speed: 6 });
    S.face('hongying', 'up');
    await S.say('', '（紅纓連刺。鬼面一路退到牌位前，退無可退——）');
    S.face('hongying', 'down');
    await S.wait(0.4);
    await S.say('', '（紅纓突然背轉身。鬼面的劍下意識追上——）');
    S.face('hongying', 'up');
    S.sfx('crit'); S.flash('#ffffff', 0.35, 0.9); S.shake(8, 0.4);
    await S.say('', '（紅纓回手一挑。洛家回馬槍。槍尖擦過面具邊緣。——喀。）');
    S.bgm(null);
    S.sfx('shatter');
    await S.wait(1.0);
    const qa = G.mapScene.actor('qf');
    if (qa) qa.sprite = 'qingfeng';
    await S.say('', '（慢鏡頭。鬼王面具裂成兩半，落在地上。）');
    await S.say('', '（面具下，是一張年輕男人的臉。左半邊完好，眉目和紅纓有七分像；右半邊，從額頭到下顎，是一大片被冷火燒過的疤。）');
    await S.wait(0.8);
    await S.say('hongying:surprise', '……');
    await S.say('hongying:surprise', '……哥……？');
    await S.say('qingfeng:sad', '……槍，還是握得太緊。');
    await S.say('qingfeng:smile', '不過那一下回馬槍……比我教的時候好多了。');
    S.sfx('metal');
    await S.say('', '（紅纓的槍掉在地上。哐啷。）');
    await S.say('hongying:cry', '為什麼……為什麼……');
    await S.say('hongying:angry', '為什麼殺了爹娘！！為什麼殺了福伯！！你說啊——！！');
    await S.say('qingfeng:sad', '不是我。');
    await S.say('qingfeng:sad', '……妳剛剛，在大廳裡打的那個東西。就是它們。');
    S.bgm('sad');
    await S.say('qingfeng:sad', '那晚，妳走了以後。戲剛開鑼，海那邊的天就裂了。');
    await S.say('qingfeng:sad', '藍色的東西從牆縫、桌底、井裡爬上來。爹提槍去擋，娘把丫頭們推進廚房。');
    await S.say('qingfeng:sad', '福伯去顧大門。他說不能讓它們出去，街上還有人在看戲。');
    await S.say('qingfeng:sad', '我拿著劍，一直砍、一直砍。砍不完。它們穿過劍，穿過爹的槍，穿過所有人。');
    await S.say('qingfeng:sad', '爹死在我懷裡。最後一句話是：「去找紅纓。」');
    await S.say('hongying:cry', '……');
    await S.say('qingfeng:sad', '天亮以前，冷火燒到我臉上。我倒在大廳裡。');
    await S.say('qingfeng:sad', '街坊撞開門的時候——他們看不見那些東西。他們只看見滿地的人，和一個拿著血劍的我。');
    await S.say('baizhi:sad', '……他們看不見鬼。');
    await S.say('yungui:serious', '「對著空氣砍，砍得要死要活」……街上的人是這樣說的。');
    await S.say('qingfeng:sad', '他們喊殺人兇手。我跑了。抓了戲箱裡的鬼王面，戴上，就跑了。');
    await S.say('qingfeng:sad', '我不知道為什麼要戴。……大概是，不想讓任何人看見洛青鋒那個樣子。');
    await S.say('qingfeng:sad', '我跑到海邊，倒在沙灘上。有個人把我撿了回去。替我治傷。');
    await S.say('xinghe:serious', '……夜玄。');
    S.face('qf', 'player');
    await S.say('qingfeng:normal', '（看了星河一眼）玄冥法師。他救了我的命。');
    await S.say('qingfeng:normal', '他告訴我那晚的真相：海上那盞燈——彼岸燈——開始暗了。燈一暗，亡者過不了海，就變成那種東西。');
    await S.say('qingfeng:serious', '他也告訴我，他有辦法。');
    await S.say('qingfeng:serious', '「逆潮」。讓黑水溝倒流。所有被海帶走的人——帶著記憶，回來。');
    await S.say('qingfeng:serious', '爹、娘、福伯、廚房的阿香、阿珠……所有人。');
    await S.say('qingfeng:smile', '到那時候，我就把面具拿下來，回家。我們一家人，再坐在這張桌子吃一次飯。');
    await S.say('hongying:cry', '……');
    S.face('qf', 'baizhi');
    await S.say('qingfeng:serious', '（看向白芷）而要做到這件事，需要燈的力量。白芷姑娘，妳——');
    await mv(S, 'player', 'U', { speed: 6 });
    S.face('player', 'right');
    await S.say('xinghe:angry', '（擋在白芷前面）不准碰她。');
    await S.say('qingfeng:smile', '……你很好。觀音山那時我就這麼想。');
    S.face('qf', 'hongying');
    await S.say('hongying:cry', '……哥。');
    await S.say('hongying:sad', '回來的……還會是爹娘嗎？');
    await S.wait(1.0);
    await S.say('hongying:sad', '被海帶走、被洗掉記憶的人……再被拉回來……');
    await S.say('hongying:cry', '那還會是會罰我跪、會叫我去天后宮的爹嗎？還會是娘嗎？');
    await S.say('qingfeng:sad', '……');
    await S.say('qingfeng:sad', '法師說，會的。');
    await S.say('hongying:cry', '那你自己呢！你相信嗎！');
    await S.say('', '（青鋒沒有回答。他彎腰撿起裂成兩半的面具，看了一眼，收進懷裡。）');
    await S.say('qingfeng:normal', '洛青鋒三年前就死在這間屋子裡了。');
    await S.say('qingfeng:normal', '等爹娘回來，他才會跟著回來。');
    await S.say('hongying:angry', '你給我站住！跟我們走！你明明——你明明就——');
    await mv(S, 'qf', 'L', { speed: 5 });
    S.face('qf', 'left');
    S.sfx('wind');
    await S.say('', '（青鋒翻上窗台。冷風灌進來。）');
    S.face('qf', 'right');
    await S.say('qingfeng:sad', '紅纓。……紅緞帶，還綁著啊。');
    await S.say('', '（紅纓下意識摸了一下髮上的紅緞帶。）');
    await S.say('hongying:cry', '……');
    await S.say('hongying:angry', '——冬至是你生日！！');
    await S.say('hongying:cry', '麵線……我會煮！我練了三年！你給我回來吃！！');
    await S.wait(0.8);
    await S.say('', '（青鋒的背影停住了一下。）');
    await S.say('qingfeng:smile', '……別再煮焦了。');
    S.sfx('wind');
    await S.fadeActor('qf', 0, 0.8);
    S.remove('qf');
    await S.say('', '（他躍入夜色。消失。）');
    await mv(S, 'hongying', 'U');
    S.face('hongying', 'up');
    await S.say('', '（紅纓跪倒在祖先牌位前，抱著槍，放聲大哭。白芷抱住她。星河站在一旁，握緊了拳頭。雲歸背過身，看著窗外。）');
    S.setPos('baizhi', 13, 3, 'right');
    S.setPos('tuanzi', 14, 4, 'up');
    S.face('yungui', 'right');
    await S.say('tuanzi:sad', '（輕輕把頭靠在紅纓腿上）');
    await S.fadeOut(1.2);
    S.flag('ch5_unmask');
    S.quest('q_ch5_main', 5);
    G.UI.toast('鬼面是紅纓的哥哥，洛青鋒。他在玄冥法師（夜玄）身邊。', { icon: 'scroll' });
    S.cameraFollow();
    regroup(S);
    S.bgm('mansion');
    await S.fadeIn(1.0);
    S.objective('回大門，跟福伯說一聲');
  }

  // ---- §3-15 冬至：湯圓與麵線 ／ §3-16 白芷的手 ------------------------------------------------------------------
  async function innScene(S) {
    const ms = G.mapScene;
    if (G.state.vars.c5_inn_scene) return;
    const pend = [];
    if (!G.Quests.isDone('q_fubo')) pend.push('福伯');
    if (G.state.quests.q_halfwell && !G.Quests.isDone('q_halfwell')) pend.push('半邊井');
    if (pend.length) {
      await S.say('蔡頭家', '客官要歇睏了？天就要光了。');
      await S.say('', '（休息之後，故事會往前推進。還沒辦完的事，可能就來不及了。）');
      const c = await S.choice(['休息', '還有事要辦'], { cancel: 1 });
      if (c !== 0) { ms.c5innAsked = true; return; }
    }
    G.state.vars.c5_inn_scene = true;
    await S.fadeOut(0.8);
    setTime(S, 3);
    G.Party.healAll();
    S.refresh();
    S.hideFollowers(false);
    S.spawn({ id: 'in_ay', sprite: 'child_f', x: 8, y: 3, dir: 'down' });
    S.spawn({ id: 'in_boss', sprite: 'villager_f', x: 10, y: 3, dir: 'down' });
    place(S, [['player', 6, 5, 'right'], ['baizhi', 7, 5, 'up'], ['hongying', 9, 5, 'up'], ['yungui', 10, 5, 'up'], ['tuanzi', 8, 5, 'up']]);
    S.bgm('jiufen');
    await S.fadeIn(0.8);
    await S.say('', '（冬至清晨。客棧大廳。阿圓和老闆娘在搓湯圓，紅白兩色。）');
    await S.say('阿圓', '姊姊們一起搓！冬至搓湯圓，食圓仔加一歲！');
    S.emote('baizhi', '?');
    await S.say('baizhi:surprise', '（手裡捏著一顆歪掉的湯圓）真的嗎？吃一顆就加一歲？');
    await S.say('yungui:smug', '真的。所以妳吃一百顆，就一百歲了。');
    await S.say('baizhi:serious', '……');
    await S.say('', '（白芷開始一顆一顆吃。）');
    S.emote('player', '!');
    await S.say('xinghe:surprise', '白芷！雲歸是在開玩笑！');
    await S.say('baizhi:think', '可是……我不知道自己幾歲。如果不加，我就一直是零歲。');
    await S.wait(0.6);
    await S.say('', '（大家停下動作。）');
    await S.say('baizhi:sad', '星河說他十八。紅纓十九。雲歸二十四。糰子……');
    await S.say('tuanzi:smug', '吾三百歲。');
    await S.say('yungui:normal', '你三歲。');
    await S.say('baizhi:sad', '只有我，沒有數字。');
    await S.say('xinghe:think', '……那就從今天開始算吧。');
    await S.say('xinghe:smile', '今天吃一顆，妳就一歲。明年冬至再一顆，兩歲。我陪妳數。');
    await S.say('baizhi:smile', '……一歲。（吃下一顆）我一歲了。');
    await S.say('hongying:smile', '一歲的人吃那麼多湯圓會撐死的。');
    await S.say('baizhi:laugh', '那我只吃一顆。剩下的，給糰子。');
    await S.say('tuanzi:laugh', '吾三百零九十九歲了！');
    await S.say('yungui:normal', '數學也不對。');
    await mv(S, 'hongying', 'R');
    S.face('hongying', 'up');
    await S.say('hongying:serious', '老闆娘，借廚房。……還有，豬腳。');
    await mv(S, 'hongying', 'RR');
    await S.fadeActor('hongying', 0, 0.4);
    await S.wait(0.8);
    S.sfx('fire');
    await S.say('', '（片刻。廚房冒出黑煙。眾人沉默。）');
    await S.say('xinghe:think', '……要不要去幫忙？');
    await S.say('yungui:normal', '不要。這一碗，只能她自己煮。');
    await S.fadeActor('hongying', 1, 0.4);
    await mv(S, 'hongying', 'LL');
    await S.say('', '（紅纓端著一碗麵線走出來。豬腳燉得還行，麵線……邊緣是焦的。）');
    await S.say('hongying:sad', '……又焦了。練了三年，還是焦了。');
    await S.say('baizhi:smile', '很香喔。');
    await S.say('hongying:normal', '（裝進食盒）我去一下古厝。');
    await S.fadeOut(0.8);
    S.remove('in_ay'); S.remove('in_boss');
    // 紅纓 leaves the noodles at the gate
    G.state.vars.c5_bowl = true;
    await S.warp('luo_gate', 9, 7, 'up', { fade: 0, noAutosave: true });
    S.hideFollowers(true);
    S.show('player', false);
    S.spawn({ id: 'g_hy', sprite: 'hongying', x: 10, y: 7, dir: 'up' });
    S.light({ ambient: 0.25, color: '#203040', tint: null });
    await S.camera(9, 6, 0.05);
    await S.fadeIn(0.8);
    await S.say('', '（紅纓獨自走到洛家大門口，把碗放在門檻上，在旁邊插了一炷香。）');
    await S.wait(0.6);
    await S.fadeOut(1.0);
    S.remove('g_hy');
    await S.narrate(['隔天清晨。'], { veil: 1 });
    S.spawn({ id: 'g_hy', sprite: 'hongying', x: 10, y: 8, dir: 'up' });
    S.light({ ambient: 0.12, color: '#304050', tint: 'rgba(200,220,255,0.08)' });
    await S.fadeIn(0.8);
    await S.say('', '（洛家大門口。碗空了，筷子整齊地擺在碗上。碗底壓著一張摺好的紙條。）');
    await S.say('', '（紅纓打開紙條。字跡端正、好看。）');
    await S.say('紙條', '「焦了。」');
    await S.say('紙條', '「——但很好吃。」');
    await S.say('hongying:cry', '（把紙條貼在胸口）……笨蛋哥哥。');
    await S.say('hongying:laugh', '（哭著笑）……每一年都說好吃。騙子。');
    await S.give('c5_qf_note');
    S.flag('ch5_noodles');
    G.state.vars.c5_bowl = false;
    await S.fadeOut(0.8);
    S.remove('g_hy');
    // §3-16 時間跳躍：白芷的手
    await S.warp('lukang_inn', 11, 4, 'up', { fade: 0, noAutosave: true });
    S.show('player', true);
    S.hideFollowers(false);
    place(S, [['player', 10, 4, 'right'], ['baizhi', 11, 3, 'down'], ['yungui', 12, 4, 'left'], ['hongying', 10, 3, 'right'], ['tuanzi', 11, 4, 'up']]);
    S.bgm('love');
    await S.fadeIn(0.8);
    await S.say('', '（客棧房間。白芷坐在床邊，看著自己的手。指尖的邊緣，像薄紙燈罩一樣透出光。）');
    await S.say('xinghe:serious', '……白芷。');
    await S.say('baizhi:smile', '（把手藏到袖子裡）沒事。只是有點累。');
    await S.say('yungui:serious', '（替她把脈，眉頭緊皺）不是累。是「輕」。她的魂……變輕了。');
    await S.say('yungui:serious', '照魂鏡那次一點，兔子燈那次又一點。她每想起一件事，就——');
    await S.say('xinghe:angry', '那就不要再讓她想了！');
    await S.say('baizhi:sad', '星河……');
    await S.say('yungui:normal', '我說了不算，你說了也不算。記憶自己會回來。……但她現在需要休息。至少一兩個月。');
    await S.say('hongying:serious', '那就留在鹿港。洛家古厝……我會把它打掃乾淨。大家住我家。');
    await S.say('hongying:normal', '師父的事，過了年再南下。府城就在南邊，跑不掉。');
    await S.say('yungui:think', '……師父一個人在府城。');
    await S.say('yungui:smile', '不過他說過——「修道之人，最忌心急」。我就當他在罵我。');
    await S.say('xinghe:sad', '（握住白芷藏在袖子裡的手）……');
    await S.say('baizhi:smile', '星河的手好暖。');
    S.flag('ch5_rest');
    await S.fadeOut(1.0);
    await S.narrate(['那一年的除夕。'], { veil: 1 });
    G.state.vars.ch5_time = 4;
    await S.warp('luo_1f', 19, 13, 'up', { fade: 0 });
  }

  // ---- §3-17 除夕・圍爐 ★ ／ 初一清晨 -----------------------------------------------------------------------------
  async function sceneNewYear(S) {
    S.hideFollowers(false);
    const guests = [['ny_shi', 'old_m', 14, 9], ['ny_niushe', 'shopkeeper_f', 16, 9], ['ny_keeper', 'temple_keeper', 23, 9], ['ny_ayuan', 'child_f', 25, 9]];
    for (const [id, sp, x, y] of guests) S.spawn({ id, sprite: sp, x, y, dir: 'down' });
    place(S, [['player', 17, 13, 'up'], ['baizhi', 18, 13, 'up'], ['hongying', 20, 13, 'up'], ['yungui', 21, 13, 'up'], ['tuanzi', 19, 13, 'up']]);
    await S.camera(19, 11, 0.05);
    await S.fadeIn(0.8);
    await S.say('', '（洛家古厝大廳。蜘蛛網掃乾淨了，窗紙重糊，紅燈籠——施燈師做的——掛滿廊下。長桌上擺著一個圓爐火鍋。）');
    S.sfx('fire');
    await S.say('', '（遠處鞭炮聲。施燈師、許廟公、牛舌餅阿嬸、阿圓都來了。）');
    await S.say('施燈師', '洛家的燈，四十年來我都有做。今年也不能斷。');
    await S.say('牛舌餅阿嬸', '圍爐沒有甜點怎麼行！牛舌餅一盒！');
    await S.say('許廟公', '我帶了發粿。發粿發粿，明年發財。');
    await S.say('hongying:shy', '（端出一盤……黑色的東西）我、我炒的菜。');
    await S.wait(0.8);
    await S.say('', '（全場沉默。）');
    await S.say('xinghe:think', '……這是？');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '長年菜！');
    await S.say('yungui:smug', '長年菜是要吃得越久越好。這一盤，大概可以吃到明年。');
    S.emote('hongying', '💢');
    await S.say('hongying:angry', '💢💢');
    await S.say('baizhi:smile', '（夾一口，認真咀嚼）……外面很硬，裡面也很硬。');
    await S.say('baizhi:smile', '很長年。');
    S.emote('ny_ayuan', '♪'); S.emote('player', '♪');
    await S.say('', '（全桌大笑。紅纓也笑了。）');
    await S.say('yungui:normal', '（從懷裡拿出兩個紅包）來，壓歲錢。');
    S.emote('tuanzi', '!');
    await S.say('tuanzi:surprise', '吾有嗎！？');
    await S.say('yungui:normal', '一個給糰子。（遞）一個給白芷。');
    await S.say('baizhi:think', '為什麼給我？');
    await S.say('yungui:smile', '妳才一歲。一歲的囝仔，最該拿紅包。');
    await S.say('baizhi:smile', '（雙手接過）……這是我的第一個過年。');
    await S.say('baizhi:smile', '第一次有一個……「家」，可以回來圍爐。');
    await S.camera(13, 11, 0.8);
    await S.say('', '（紅纓看著滿桌的人。看著空著的主位——她在那裡也擺了碗筷。還有一副，在主位旁邊。）');
    await S.say('hongying:sad', '……爹、娘、福伯、哥。我也替你們擺了。');
    await S.say('hongying:smile', '今年，家裡很熱鬧喔。');
    S.sfx('wind');
    await S.wait(0.6);
    await S.say('', '（窗外風吹進來，燭火輕輕晃了一下。像有人點了頭。）');
    // 守歲
    await S.fadeOut(1.0);
    for (const [id] of guests) S.remove(id);
    S.hideFollowers(true);
    S.spawn({ id: 'ny_bz', sprite: 'baizhi', x: 20, y: 25, dir: 'down' });
    S.setPos('player', 19, 25, 'down');
    S.light({ ambient: 0.62, color: '#0a0818' });
    await S.camera(19, 26, 0.05);
    S.bgm('love');
    await S.fadeIn(1.0);
    await S.say('', '（守歲。夜深。大家在廳裡東倒西歪睡著。星河和白芷坐在門檻上看煙火。）');
    S.flash('#ff8a5a', 0.4, 0.35); S.sfx('fire');
    await S.say('xinghe:smile', '中秋那天說好的。下一次的月亮、下下一次……現在是第一次的過年。');
    await S.say('baizhi:smile', '嗯。一起數。');
    S.flash('#8ad0ff', 0.4, 0.3);
    await S.say('baizhi:think', '星河。我想起的事越多，我就越輕……如果有一天，我輕到飛走了——');
    S.face('player', 'ny_bz');
    await S.say('xinghe:serious', '那我就抓住妳。');
    S.face('ny_bz', 'player');
    await S.say('baizhi:surprise', '……');
    await S.say('xinghe:smile', '我是燈籠舖的學徒。燈籠飄走了，要追回來，這是基本功。');
    await S.say('baizhi:laugh', '……嗯。');
    S.flash('#ffd27a', 0.5, 0.35); S.sfx('fire');
    await S.fadeOut(1.2);
    S.remove('ny_bz');
    await S.narrate(['正月初一，清晨。'], { veil: 1 });
    // 初一：推開洛家大門
    S.hideFollowers(false);
    place(S, [['hongying', 19, 27, 'down'], ['player', 18, 26, 'down'], ['baizhi', 20, 26, 'down'], ['yungui', 17, 26, 'down'], ['tuanzi', 21, 26, 'down']]);
    S.light({ ambient: 0.3, color: '#203040', tint: null });
    await S.camera(19, 25, 0.05);
    S.bgm('pingxi');
    await S.fadeIn(1.0);
    await S.say('', '（洛家大門前。紅纓站在門內，雙手按在門上。三年來，這扇門沒有真正打開過。）');
    await S.say('hongying:serious', '洛家的大門——');
    S.sfx('door'); S.shake(3, 0.4);
    S.flash('#fff4d8', 0.9, 0.9);
    await S.fadeOut(0.4, '#fff4d8');
    await S.warp('luo_gate', 9, 6, 'down', { fade: 0, noAutosave: true });
    S.hideFollowers(false);
    place(S, [['hongying', 9, 6, 'down'], ['player', 8, 7, 'down'], ['baizhi', 10, 7, 'down'], ['yungui', 8, 8, 'down'], ['tuanzi', 10, 8, 'down']]);
    const crowd = [['nd_1', 'villager_m', 7, 11], ['nd_2', 'villager_f', 8, 12], ['nd_3', 'old_f', 11, 11], ['nd_4', 'child_m', 12, 12], ['nd_5', 'fisherman', 10, 12], ['nd_6', 'old_m', 6, 12], ['nd_7', 'shopkeeper_f', 13, 11]];
    for (const [id, sp, x, y] of crowd) S.spawn({ id, sprite: sp, x, y, dir: 'up' });
    S.light({ ambient: 0.04, color: '#ffffff', tint: 'rgba(255,230,190,0.12)' });
    await S.camera(9, 8, 0.05);
    await S.fadeIn(1.0);
    await S.say('', '（她用力一推。兩扇門大開。晨光湧進門廳。街坊站在外面，有人在鼓掌。）');
    for (const [id] of crowd) S.emote(id, '♪');
    S.sfx('coin');
    await S.say('hongying:smile', '開了。');
    await S.say('hongying:serious', '我會把洛家重建起來。等這一切結束以後。');
    await S.say('hongying:serious', '不過現在——府城。玄冥法師，長明宮。師父……雲歸的師父。還有我那個笨蛋哥哥。');
    await S.say('yungui:smile', '元宵前後到府城，正好看燈。');
    await S.say('xinghe:smile', '走吧！');
    await S.fadeOut(1.2);
    for (const [id] of crowd) S.remove(id);
    // chapter end
    S.flag('ch5_done');
    S.quest('q_ch5_main', 'done');
    S.objective('');
    await S.titleCard('第五章　鹿港舊夢　完', '一府二鹿三艋舺');
    const lit = ['lantern_fubo', 'lantern_halfwell'].filter((id) => G.Lanterns.has(id)).length;
    await S.narrate([`這一章，點亮了 ${lit} 盞心燈。`, `一路走來，心燈共有 ${G.Lanterns.count()} 盞。`], { veil: 1 });
    G.state.vars.ch5_time = 3;
    await G.Story.next(S, 6);
  }

  // @@C5-CONTINUE@@
})();

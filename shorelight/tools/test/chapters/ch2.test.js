#!/usr/bin/env node
// 第二章　霧林天燈 (chapter 2) — automated playthrough.
//
//   node tools/test/chapters/ch2.test.js            # headless, prints PASS/FAIL summary, exit 1 on failure
//   node tools/test/chapters/ch2.test.js --shots    # also save screenshots to tools/test/out/ch2/
//
// Tests
//   1. critical : ?debug&startch=2 with G.Debug.autoplay — every main beat 2-1 … 2-19 through G.Story.next(S, 3):
//                 霧林・北 → 魔神仔的迷陣 (3 loops) → 七彩靈蕈林 (first 靈視) → maze E,S,S,W → 救阿山 (心燈 xd_woodcutter)
//                 → 紅纓 duel & join → 平溪 → 客棧 → 阿蘭's test → 老厝 → 洞窟 (cages, 挑夫的擔子) → 虎姑婆
//                 → 平安燈 (信 read → 心燈 xd_letter) → 風颱 → 十分瀑布 → 阿河 → chapter 3.
//   2. maze     : wrong turns reset the footprints, the north exit always leads back, no-靈視 solving works.
//   3. sides    : 老獵人的魂 + spirit chest, 紅纓的廚房 (竹筍・溪蝦・山蘇 → cooking), 紮天燈 quiz, 阿全 & the bundle,
//                 Q4 letter reading (dawn lantern 心燈), Q4 gifts, 阿山 reunion at home (Q2), the 銅鑼, shops & inn.
// Other chapters' files are stubbed out (work in progress by other builders must not break this test);
// chapter 3 is loaded when it exists and parses, so the hand-off runs into the real chapter.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = process.argv.includes('--shots');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch2');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
const BAD_WARN = /unknown|missing|not found|no actor|not registered|undefined/i;

let ch3Ok = false;
const ch3File = path.join(ROOT, 'js', 'maps', 'ch3_guanyin.js');
if (fs.existsSync(ch3File)) {
  try { execFileSync(process.execPath, ['--check', ch3File], { stdio: 'pipe' }); ch3Ok = true; } catch (e) { ch3Ok = false; }
}
const STUB = ch3Ok ? /js\/maps\/ch([014-9]|1[01])_[a-z]+\.js$/ : /js\/maps\/ch([013-9]|1[01])_[a-z]+\.js$/;

const results = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };

async function session(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-TW', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  // the WebGL presentation layer is still in development: drive the 2D renderer (the game logic is identical)
  await page.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false, lang: 'zh' })); } catch (e) { /* ignore */ } });
  await page.route(STUB, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stubbed by ch2.test.js */' }));
  page.on('console', (m) => {
    const t = m.text();
    if (IGNORE.some((r) => r.test(t))) return;
    if (m.type() === 'error') errors.push('console.error: ' + t.slice(0, 600));
    else if (m.type() === 'warning' && BAD_WARN.test(t)) errors.push('console.warn: ' + t.slice(0, 600));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.message + ' ' + (e.stack || '')).slice(0, 600)));
  await page.goto(BASE + query);
  await page.waitForFunction(() => window.G && G.Debug && G.Scenes && G.Scenes.top(), null, { timeout: 30000 });
  const s = {
    page, errors,
    ev: (fn, arg) => page.evaluate(fn, arg),
    async idle(ms = 120000) {
      const ok = await page.evaluate((t) => G.Debug.idle(t), ms);
      assert(ok, 'timed out waiting for the map to become idle; map=' + (await page.evaluate(() => G.mapScene && G.mapScene.def.id)) + ' stack = ' + JSON.stringify(await page.evaluate(() => G.Scenes.stack.map((x) => (x.constructor && x.constructor.name) || '?'))));
    },
    async onMap(id, ms = 60000) {
      await page.waitForFunction((m) => G.mapScene && G.mapScene.def.id === m, id, { timeout: ms }).catch(() => {});
      const cur = await page.evaluate(() => G.mapScene && G.mapScene.def.id);
      assert(cur === id, `expected to be on ${id}, but on ${cur}`);
      await this.idle();
    },
    flags: () => page.evaluate(() => Object.assign({}, G.state.flags)),
    async shot(name) { if (SHOTS) await page.screenshot({ path: path.join(OUT, name + '.png') }); },
    async gameErrors() {
      const le = await page.evaluate(() => { const e = G.lastError; G.lastError = null; return e ? String(e.stack || e) : null; }).catch(() => null);
      if (le) errors.push('G.lastError: ' + le.slice(0, 600));
      const log = await page.evaluate(() => (G.Debug.log || []).filter((l) => /unknown/i.test(l))).catch(() => []);
      for (const l of log) errors.push('debug log: ' + l);
      return errors;
    },
    close: () => ctx.close(),
  };
  return s;
}
const step = (s, x, y, choices = []) => s.ev(([x, y, ch]) => { G.Debug.choices = ch.slice(); G.Debug.stepOn(x, y); G.mapScene.snapCamera(); }, [x, y, choices]);
const trig = (s, id, choices = []) => s.ev(([id, ch]) => { G.Debug.choices = ch.slice(); return G.Debug.trigger(id); }, [id, choices]);
const talk = (s, id, choices = []) => s.ev(([id, ch]) => { G.Debug.choices = ch.slice(); return G.Debug.talk(id); }, [id, choices]);
const interact = (s, key) => s.ev((key) => { const o = G.mapScene.objects.find((x) => x.key === key); if (!o) throw new Error('no object ' + key); return G.Script.run(async (S) => { if (typeof o.interact === 'function') await o.interact(S, o); else await S.lines(o.interact); }); }, key);
const warp = (s, map, x, y, dir = 'down') => s.ev(([m, x, y, d]) => G.Script.run((S) => S.warp(m, x, y, d)), [map, x, y, dir]);
const lantern = (s, id) => s.ev((id) => !!G.state.lanterns[id], id);
const quest = (s, id) => s.ev((id) => G.state.quests[id] || null, id);
const level = (s, lv) => s.ev((lv) => { for (const id of G.state.party) G.Story.ensureLevel(id, lv); G.Party.healAll(); }, lv);

async function run(name, browser, fn) {
  const t0 = Date.now();
  let s = null, status = 'PASS', msg = '';
  try {
    s = await fn(browser, (q) => session(browser, q).then((x) => (s = x)));
  } catch (e) { status = 'FAIL'; msg = e.message; }
  if (s) {
    const errs = await s.gameErrors();
    if (errs.length && status === 'PASS') { status = 'FAIL'; msg = errs.length + ' game error(s)'; }
    if (errs.length) msg += '\n      ' + [...new Set(errs)].slice(0, 8).join('\n      ');
    await s.close().catch(() => {});
  }
  results.push({ name, status, msg, sec: ((Date.now() - t0) / 1000).toFixed(1) });
  console.log(`  ${status === 'PASS' ? '✓' : '✗'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)${msg ? '  ' + msg : ''}`);
}

// ------------------------------------------------------------------------------------------------ 1. critical path
async function testCritical(browser, open) {
  const s = await open('?debug&startch=2&flags=mochi_joined,yuyuan_joined');
  await s.ev(() => G.Debug.setAutoplay(true));
  await s.onMap('mistforest_n');
  let f = await s.flags();
  const st0 = await s.ev(() => ({ ch: G.state.chapter, party: G.state.party.slice(), obj: G.state.vars.objective }));
  assert(st0.ch === 2 && f.ch2_start, '2-1 did not run: ' + JSON.stringify(st0));
  assert(st0.party.join() === 'xinghe,baizhi', '紅纓 must not be in the party before the duel: ' + st0.party);
  assert(st0.obj === '穿過霧林，前往平溪', 'objective: ' + st0.obj);
  await s.shot('01_mistforest_n');

  // 2-2 阿竹 (choose 「我們趕路……」 to exercise the branch — 白芷 talks him round)
  await step(s, 10, 18, [1]);
  await s.idle();
  f = await s.flags();
  assert(f.ch2_azhu_met, '2-2 flag');
  assert((await quest(s, 'q_woodcutter')).stage === 0 && await s.ev(() => G.Inv.count('c2_gong') === 1), '2-2 quest / 銅鑼');
  assert(!(await s.ev(() => G.mapScene.npcs.some((n) => n.id === 'azhu_wood'))), '阿竹 should have left');

  // 2-3 the maze: three loops → 2-4 → grove → 2-5
  await step(s, 19, 43);
  await s.onMap('mist_loop');
  await s.shot('02_mist_loop');
  for (const [x, y] of [[23, 9], [0, 10], [11, 19]]) { await step(s, x, y); await s.idle(); }
  await s.onMap('mist_grove');
  f = await s.flags();
  assert(f.ch2_grove_open && f.ch2_lingshi, '2-4/2-5 flags: ' + JSON.stringify(f));
  const g = await s.ev(() => ({ v: G.state.vars.vision, mush: G.Inv.count('lingxun'), psy: G.state.vars.c2_psy, obj: G.state.vars.objective }));
  assert(g.v > 60 && g.mush >= 3 && g.psy == null && g.obj === '用靈視找出迷陣的出口', '2-5 results: ' + JSON.stringify(g));
  assert(f.tut_lingshi, 'tut_lingshi');
  await s.shot('03_grove');

  // 2-6 the silver footprints: E, S, S, W
  await step(s, 29, 14);
  await s.onMap('mist_loop');
  assert((await s.flags()).ev_mist_loop_prints, '2-6 footprints scene');
  const prints = await s.ev(() => G.mapScene.objects.filter((o) => o.t === 'c2_footprint' && G.mapScene.objActive(o)).length);
  assert(prints > 4, 'footprints should be visible under 靈視 (' + prints + ')');
  await s.shot('04_footprints');
  for (const [x, y] of [[23, 9], [11, 19], [11, 19]]) { await step(s, x, y); await s.idle(); }
  await step(s, 0, 9);
  await s.onMap('mistforest_s');
  assert((await s.flags()).ch2_maze_solved, '2-6 solved');

  // 2-7 阿山 (with 靈視 → the phantom-less troop)
  await s.ev(() => G.Script.S.vision(60));
  await s.ev(() => G.Script.run((S) => S.warp('mistforest_s', 27, 6, 'right')));
  await s.idle();
  const passable = await s.ev(() => !G.mapScene.blocked(28, 6) && !G.mapScene.blocked(29, 6));
  assert(passable, 'the illusion trees should vanish under 靈視');
  await step(s, 30, 6);
  await s.idle();
  f = await s.flags();
  assert(f.ch2_woodcutter_found && (await quest(s, 'q_woodcutter')).stage === 1 && await s.ev(() => G.state.vars.c2_ashan === true), '2-7');
  assert(await s.ev(() => !!G.mapScene.actor('ashan_f')), '阿山 should follow the party');

  // 2-8 / 2-9 duel & join
  await s.ev(() => G.Script.run((S) => S.warp('mistforest_s', 15, 18, 'down')));
  await s.idle();
  await step(s, 15, 20);
  await s.idle();
  f = await s.flags();
  const p2 = await s.ev(() => ({ party: G.state.party.slice(), hy: G.state.members.hongying && G.state.members.hongying.lv }));
  assert(f.ch2_duel && f.ch2_hongying_join && f.tut_hongying, '2-8/2-9 flags');
  assert(p2.party.join() === 'xinghe,baizhi,hongying' && p2.hy >= 5, '紅纓 joined: ' + JSON.stringify(p2));
  await s.shot('05_after_duel');

  // 2-10 平溪 (阿山's reunion first) → 2-11 客棧
  await step(s, 19, 43);
  await s.onMap('pingxi');
  f = await s.flags();
  assert(f.ch2_pingxi_arrive, '2-10');
  assert(await lantern(s, 'xd_woodcutter') && (await quest(s, 'q_woodcutter')).done, '心燈 xd_woodcutter / q_woodcutter done');
  assert(await s.ev(() => !G.state.vars.c2_ashan && !G.mapScene.actor('ashan_f')), '阿山 went home');
  await s.shot('06_pingxi_night');
  await step(s, 47, 12);
  await s.idle();
  assert(await s.ev(() => G.mapScene.def.id === 'pingxi'), 'the NE exit must be blocked at night');
  await step(s, 31, 11);
  await s.onMap('pingxi_inn');
  f = await s.flags();
  assert(f.ch2_morning && (await quest(s, 'q_hy_kitchen')).stage === 0, '2-11 + kitchen quest start');
  assert(await s.ev(() => G.state.vars.objective === '準備好後，從東北邊的竹林上山'), '2-11 objective');
  await step(s, 8, 11);
  await s.onMap('pingxi');
  await s.shot('07_pingxi_day');
  await step(s, 47, 12);
  await s.onMap('tiger_lair');
  await level(s, 9);

  // 2-12 阿蘭's three questions (wrong answers first: 用劍, 去姑婆家, then right)
  await step(s, 12, 19, [0, 1, 0, 1, 0]);
  await s.idle();
  f = await s.flags();
  assert(f.ch2_alan_trust, '2-12');
  assert(await s.ev(() => G.state.members.xinghe.hp > 0), 'the pinecones must not kill 星河');
  await s.shot('08_tiger_lair');
  // 2-13 老厝
  await step(s, 24, 7);
  await s.onMap('tiger_house');
  f = await s.flags();
  assert(f.ch2_granny_house, '2-13');
  await s.shot('09_tiger_house');
  await step(s, 6, 9);
  await s.onMap('tiger_lair');
  await step(s, 25, 1);
  await s.onMap('tiger_den');
  assert((await s.flags()).ev_tiger_den_enter, '2-14 intro');
  // 挑夫的擔子 (4.2 step 2)
  await interact(s, 'basket@3,4');
  await s.idle();
  assert(await s.ev(() => G.Inv.count('key_sonletter') === 1 && G.Inv.count('c2_porter_bundle') === 1), 'bundle → letter');
  // cages (the 2nd is behind the breathing wall: needs 靈視)
  await trig(s, 'cage1'); await s.idle();
  assert(await s.ev(() => G.mapScene.blocked(14, 11)), 'gate closed with one cage open');
  await s.ev(() => G.Script.S.vision(60));
  assert(await s.ev(() => !G.mapScene.blocked(19, 18)), 'the breathing wall should vanish under 靈視');
  await trig(s, 'cage2'); await s.idle();
  assert(await s.ev(() => !G.mapScene.blocked(14, 11) && !G.mapScene.blocked(16, 11)), 'gate should open after both cages');
  await s.shot('10_tiger_den');
  // 2-15 boss → 2-16 平安燈 → 2-17 風颱 (all chained)
  await step(s, 15, 10);
  await s.page.waitForFunction(() => G.state.flags.ch2_dawn, null, { timeout: 240000 });
  await s.onMap('pingxi');
  f = await s.flags();
  assert(f.ch2_tiger_beaten && f.ch2_tiandeng_night && f.ch2_letter_read && f.ch2_dawn, '2-15..2-17 flags: ' + JSON.stringify(f));
  assert(await s.ev(() => G.Inv.count('ac_huzhao') >= 1 && !G.Inv.has('key_skylantern') && !G.Inv.has('key_sonletter')), 'items after 2-16');
  assert(await lantern(s, 'xd_letter') && (await quest(s, 'q_letter')).done, '心燈 xd_letter');
  assert(await s.ev(() => G.state.vars.objective === '跟平溪的大家道別，到十分瀑布搭船'), '2-17b objective');
  assert(await s.ev(() => ['alan', 'adi', 'xiaochun', 'shitou'].every((id) => G.mapScene.actor(id))), 'the four children on the square (Q4)');
  await s.shot('11_pingxi_q4');
  // 2-18 / 2-19
  await step(s, 47, 33);
  await s.onMap('shifen_falls');
  assert((await s.flags()).ev_shifen_falls_falls, '2-18');
  await s.shot('12_shifen');
  await s.ev(() => { G.Debug.choices = [0]; G.Debug.talk('ahe'); });
  await s.page.waitForFunction(() => G.state.chapter === 3 && G.state.flags.ch2_done, null, { timeout: 90000 });
  if (ch3Ok) await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'tamsui', null, { timeout: 60000 });
  await s.shot('13_chapter3');
  return s;
}

// ------------------------------------------------------------------------------------------------ 2. maze rules
async function testMaze(browser, open) {
  const s = await open('?debug&map=mist_loop&x=11&y=6&lv=6&party=xinghe,baizhi&flags=mochi_joined,yuyuan_joined,ch2_start,ch2_grove_open,ch2_lingshi&autoplay=1');
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'mist_loop', null, { timeout: 30000 });
  await s.idle();
  // no 靈視: wrong turn resets, the right order still works blind
  await step(s, 23, 9); await s.idle();
  assert(await s.ev(() => G.state.vars.loopStep === 1 && G.mapScene.player.x === 1), 'E is step 1 (arrives at the west side)');
  await step(s, 23, 9); await s.idle();
  assert(await s.ev(() => G.state.vars.loopStep === 0), 'a wrong turn resets the maze');
  await step(s, 11, 0);
  await s.onMap('mistforest_n');
  assert(await s.ev(() => G.mapScene.player.y === 42), 'north exit returns to 霧林・北');
  await step(s, 19, 43);
  await s.onMap('mist_loop');
  for (const [x, y] of [[23, 9], [11, 19], [11, 19], [0, 9]]) { await step(s, x, y); await s.idle(); }
  await s.onMap('mistforest_s');
  assert((await s.flags()).ch2_maze_solved, 'blind solve');
  // after solving: south leads on, east loops harmlessly
  await warp(s, 'mist_loop', 11, 6); await s.idle();
  await step(s, 23, 9); await s.idle();
  assert(await s.ev(() => G.mapScene.def.id === 'mist_loop'), 'east loops back after solving');
  await step(s, 11, 19);
  await s.onMap('mistforest_s');
  // vision ending on an illusion cell pushes the party out (5.6)
  await s.ev(() => G.Script.S.vision(0.3));
  await s.ev(() => { G.mapScene.player.setCell(28, 6); });
  await s.page.waitForTimeout(1500);
  assert(await s.ev(() => !G.mapScene.solid[G.mapScene.player.y * G.mapScene.w + G.mapScene.player.x]), 'unstick after 靈視 ends');
  return s;
}

// ------------------------------------------------------------------------------------------------ 3. side quests
async function testSides(browser, open) {
  const s = await open('?debug&map=mistforest_n&x=33&y=30&lv=7&party=xinghe,baizhi&flags=mochi_joined,yuyuan_joined,ch2_start,ch2_azhu_met&autoplay=1');
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'mistforest_n', null, { timeout: 30000 });
  await s.idle();
  // 老獵人的魂 (spirit) & his chest
  assert(!(await s.ev(() => { const n = G.mapScene.npcs.find((x) => x.id === 'hunter_ghost'); return n && G.mapScene.npcActive(n); })), 'the ghost is invisible without 靈視');
  await s.ev(() => G.Script.S.vision(60));
  await talk(s, 'hunter_ghost'); await s.idle();
  assert((await s.flags()).ch2_hunter_ghost, 'hunter ghost');
  assert(await s.ev(() => { const c = G.mapScene.objects.find((o) => o.chestKey === 'mistforest_n:c2_n3'); return c && G.mapScene.objActive(c); }), 'spirit chest appears');
  await s.ev(() => { const c = G.mapScene.objects.find((o) => o.chestKey === 'mistforest_n:c2_n3'); G.mapScene.openChest(c); });
  await s.idle();
  assert(await s.ev(() => G.Inv.count('c2_hunter_charm') === 1), 'hunter charm');
  // the 銅鑼 in the forest
  await s.ev(() => { G.Inv.add('c2_gong', 1); return G.Script.run(G.Data.items.c2_gong.use.fieldRun); });
  await s.idle();
  assert(await s.ev(() => G.state.vars.c2_gong > 20), 'gong timer');
  await s.page.waitForTimeout(600);

  // 阿山 reunion at home (rescued after arriving in 平溪)
  await s.ev(() => { Object.assign(G.state.flags, { ch2_hongying_join: true, ch2_pingxi_arrive: true, ch2_morning: true, ch2_woodcutter_found: true, ch2_maze_solved: true, ch2_duel: true });
    G.Party.join('hongying', 7); G.Quests.set('q_woodcutter', 1); G.state.vars.c2_ashan = true; });
  await warp(s, 'pingxi', 23, 2);
  await s.onMap('pingxi');
  assert(await lantern(s, 'xd_woodcutter') && (await quest(s, 'q_woodcutter')).done, 'reunion at home → 心燈');
  // talk to everyone in Q2
  for (const id of ['lizhuang', 'ashan_sao', 'azhu_home', 'ashan_home', 'achun', 'ashi', 'xiaochun_ama', 'alan_jie', 'searcher1', 'px_farmer', 'px_washer']) { await talk(s, id); await s.idle(); }
  // 紅纓的廚房: quest from the inn, then 竹筍 (pingxi bamboo), 溪蝦 (阿溪 + stones), 山蘇 (mistforest_s)
  await warp(s, 'pingxi_inn', 8, 10); await s.onMap('pingxi_inn');
  assert((await quest(s, 'q_hy_kitchen')).stage === 0, 'kitchen started');
  await warp(s, 'pingxi', 43, 6, 'up'); await s.onMap('pingxi');
  await trig(s, 'shoot'); await s.idle();
  await talk(s, 'axi'); await s.idle();
  assert((await s.flags()).ch2_shrimp_hint, '阿溪 hint');
  await trig(s, 'shrimp', [0, 1, 2]); await s.idle();
  await talk(s, 'aquan'); await s.idle();
  assert((await s.flags()).ch2_bundle_hint, 'bundle hint');
  await warp(s, 'mistforest_s', 4, 31); await s.onMap('mistforest_s');
  await trig(s, 'shansu'); await s.idle();
  assert(await s.ev(() => ['c2_bamboo_shoot', 'c2_shrimp', 'c2_shansu'].every((i) => G.Inv.has(i))), 'three ingredients');
  await warp(s, 'pingxi_inn', 8, 10); await s.onMap('pingxi_inn');
  await talk(s, 'yueniang'); await s.idle();
  assert((await quest(s, 'q_hy_kitchen')).done && await s.ev(() => G.Inv.count('c2_hy_charcoal') === 3 && G.Inv.count('c2_shoot_soup') === 2), 'cooking');
  await talk(s, 'yueniang', [0]); await s.idle();   // inn (paid rest)
  // 紮天燈 quiz (one wrong answer first)
  await warp(s, 'pingxi_tiandeng', 7, 8); await s.onMap('pingxi_tiandeng');
  await talk(s, 'wu', [2, 0, 0, 0]); await s.idle();
  assert((await s.flags()).ch2_tiandeng_quiz && await s.ev(() => G.Inv.count('c2_tiandeng_charm') === 1), 'quiz');
  // 周家 Q2: the quest starts (with the bundle hint line)
  await warp(s, 'pingxi_oldhouse', 6, 7); await s.onMap('pingxi_oldhouse');
  await talk(s, 'zhou_bo_in'); await s.idle();
  assert((await quest(s, 'q_letter')).stage === 0, 'q_letter 0');
  await warp(s, 'pingxi_store', 7, 8); await s.onMap('pingxi_store');
  await talk(s, 'agui', [0]); await s.idle(); await talk(s, 'agui', [1]); await s.idle();
  // Q4: the bundle back to 阿全; the letter read after the typhoon → dawn lantern
  await s.ev(() => { Object.assign(G.state.flags, { ch2_alan_trust: true, ch2_granny_house: true, ch2_cage1: true, ch2_cage2: true, ch2_tiger_beaten: true, ch2_tiandeng_night: true, ch2_dawn: true });
    G.Inv.add('key_sonletter', 1); G.Inv.add('c2_porter_bundle', 1); G.Quests.set('q_letter', 1); });
  await warp(s, 'pingxi', 30, 17, 'up'); await s.onMap('pingxi');
  await talk(s, 'aquan'); await s.idle();
  assert((await s.flags()).ch2_bundle_returned && await s.ev(() => G.Inv.count('c2_porter_sandals') === 1 && !G.Inv.has('c2_porter_bundle')), 'bundle returned');
  for (const id of ['ashi', 'xiaochun_ama']) { await talk(s, id); await s.idle(); }
  const fq = await s.flags();
  assert(fq.ch2_ashi_gift && fq.ch2_ama_gift && await s.ev(() => G.Inv.count('c2_hongguigui') === 3), 'Q4 gifts');
  for (const id of ['alan', 'adi', 'xiaochun', 'shitou', 'lizhuang', 'achun', 'axi', 'alan_jie', 'px_kid']) { await talk(s, id); await s.idle(); }
  await warp(s, 'pingxi_oldhouse', 6, 7); await s.onMap('pingxi_oldhouse');
  await talk(s, 'zhou_bo_in'); await s.idle();
  assert(await lantern(s, 'xd_letter') && (await quest(s, 'q_letter')).done && (await s.flags()).ch2_letter_read, 'Q4 letter → 心燈');
  await warp(s, 'pingxi_oldhouse', 6, 7); await s.onMap('pingxi_oldhouse');
  await talk(s, 'zhou_shen_in'); await s.idle();
  await warp(s, 'pingxi_inn', 8, 10); await s.onMap('pingxi_inn');
  await talk(s, 'yueniang', [2]); await s.idle();
  await warp(s, 'pingxi_tiandeng', 7, 8); await s.onMap('pingxi_tiandeng');
  await talk(s, 'wu'); await s.idle();
  await s.shot('20_sides_done');
  return s;
}

(async () => {
  const browser = await chromium.launch();
  console.log('ch2.test.js — 第二章　霧林天燈' + (ch3Ok ? ' (chapter 3 loaded)' : ''));
  const only = process.argv.filter((a) => /^--only=/.test(a)).map((a) => a.slice(7).split(',')).flat();
  const tests = [['critical path 2-1 … 2-19 → chapter 3', testCritical], ['maze rules (5.3 / 5.6)', testMaze], ['side quests & 心燈', testSides]];
  for (const [name, fn] of tests) if (!only.length || only.some((o) => name.includes(o))) await run(name, browser, fn);
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log(`\n${fail.length ? 'FAIL' : 'PASS'} — ${results.length - fail.length}/${results.length} passed`);
  process.exit(fail.length ? 1 : 0);
})();

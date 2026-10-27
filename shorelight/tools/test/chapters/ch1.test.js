#!/usr/bin/env node
// 第一章　九份燈火 (chapter 1) — automated playthrough.
//
//   node tools/test/chapters/ch1.test.js            # headless, prints PASS/FAIL summary, exit 1 on failure
//   node tools/test/chapters/ch1.test.js --shots    # also save screenshots to tools/test/out/ch1/
//
// Tests
//   1. critical : ?debug&startch=1 with G.Debug.autoplay — every main beat 1-1 … 1-24 through G.Story.next(S, 2)
//                 (errands, 阿黃, mine cart puzzle, 工頭魂, 雞籠, 墨鴉's stall, procession, 八斗子, 白芷, the night
//                 raid, 墨鴉 / 水鬼王 with 陳伯 as guest and 螢火 mid-fight, 引魂人, 芋圓, 麻糬＆芋圓, departure).
//   2. watch    : 心燈①「阿土伯的懷錶」— east branch of the cart puzzle, the wind-tunnel lamps (wrong order, then
//                 right), the watch, delivery to 阿土嬸 → xd_atu_watch.
//   3. ahuang   : 心燈②「阿黃回家」— 小金 / 阿旺 / 阿土嬸 / the mine mouth → xd_ahuang, 小金的金仔石.
//   4. xingmu   : 「醒木失竊記」— the cat chase, 阿水's 小魚乾, the 醒木 back to 阿炳伯 → 說書折扇.
//   5. townsfolk: every NPC of every map talked to in every phase (P1, P2, P3, P4-raid map, P5), every action event.
//   6. maps     : the raid map, mines and festival maps load and render (screenshots with --shots).
//   7. 3d       : (only with --3d) the WebGL field view (?r3lite) runs a raid cutscene through update3d.
// Functional tests run with the 2D renderer (localStorage render3d:false); only test 7 uses the 3D view.
// Debug aid: --from=raid starts the critical path at the night raid.
// Other chapters' files (2…11) are stubbed out so work in progress elsewhere cannot break this test.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = process.argv.includes('--shots');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch1');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
const BAD_WARN = /unknown|missing|not found|no actor|not registered|undefined|Script error/i;
const STUB = /js\/maps\/ch([2-9]|1[01])_[a-z]+\.js$/;
const results = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };

async function session(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-TW', deviceScaleFactor: 1 });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') }); // battle bot + easy: bosses are tuned for a player, not the auto-battle (docs/BALANCE.md)
  const page = await ctx.newPage();
  const errors = [];
  // functional tests run on the 2D renderer (the WebGL view is slow under SwiftShader); a separate test uses ?r3lite
  const use3d = /r3lite/.test(query);
  await page.addInitScript((d3) => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: d3, lang: 'zh' })); } catch (e) { /* ignore */ } }, use3d);
  await page.route(STUB, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stubbed by ch1.test.js */' }));
  page.on('console', (m) => {
    const t = m.text();
    if (IGNORE.some((r) => r.test(t))) return;
    if (m.type() === 'error') errors.push('console.error: ' + t.slice(0, 600));
    else if (m.type() === 'warning' && BAD_WARN.test(t)) errors.push('console.warn: ' + t.slice(0, 600));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.message + ' ' + (e.stack || '')).slice(0, 600)));
  await page.goto(BASE + query);
  await page.waitForFunction(() => window.G && G.Debug && G.Scenes && G.Scenes.top(), null, { timeout: use3d ? 240000 : 30000 });
  await page.evaluate(() => G.Debug.setAutoplay(true));
  const s = {
    page, errors,
    ev: (fn, arg) => page.evaluate(fn, arg),
    async idle(ms = 120000) {
      const ok = await page.evaluate((t) => G.Debug.idle(t), ms);
      assert(ok, 'timed out waiting for the map to become idle; ' + JSON.stringify(await page.evaluate(() => ({
        stack: G.Scenes.stack.map((x) => (x.constructor && x.constructor.name) || '?'), map: G.mapScene && G.mapScene.def.id,
        last: G.Dialog.log.slice(-3).map((l) => l.name + '：' + l.text), dbg: G.Debug.log.slice(-3) }))));
    },
    flags: () => page.evaluate(() => Object.assign({}, G.state.flags)),
    map: () => page.evaluate(() => G.mapScene && G.mapScene.def.id),
    async shot(name) { if (SHOTS) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, name + '.png') }); } },
    async gameErrors() {
      const le = await page.evaluate(() => { const e = G.lastError; G.lastError = null; return e ? String(e.stack || e) : null; }).catch(() => null);
      if (le) errors.push('G.lastError: ' + le.slice(0, 600));
      return errors;
    },
    close: () => ctx.close(),
  };
  return s;
}
async function waitMap(s, id, ms = 60000) {
  await s.page.waitForFunction((m) => G.mapScene && G.mapScene.def.id === m, id, { timeout: ms });
  await s.idle();
  await s.page.waitForTimeout(300);   // let the map's auto events start
  await s.idle();
}
// no roaming enemies get in the way of the scripted path
const calm = (s) => s.ev(() => { if (G.mapScene) G.mapScene.enemies = []; });
const step = async (s, x, y, choices = [], ms) => {
  await s.idle(); await calm(s);
  await s.ev(([x, y, ch]) => { G.Debug.choices = ch.slice(); G.Debug.stepOn(x, y); }, [x, y, choices]);
  await s.page.waitForTimeout(150);
  await s.idle(ms);
};
const act = async (s, id, choices = []) => {
  await s.idle(); await calm(s);
  await s.ev(([id, ch]) => { G.Debug.choices = ch.slice(); return G.Debug.trigger(id); }, [id, choices]);
  await s.idle();
};
const talk = async (s, id, choices = []) => {
  await s.idle(); await calm(s);
  await s.ev(([id, ch]) => { G.Debug.choices = ch.slice(); return G.Debug.talk(id); }, [id, choices]);
  await s.idle();
};
const warp = async (s, m, x, y, dir = 'down') => {
  await s.idle();
  await s.ev(([m, x, y, d]) => G.Script.run((S) => S.warp(m, x, y, d)), [m, x, y, dir]);
  await waitMap(s, m);
};
// one keyboard tap = one tile; waits until the step (and anything it triggered) is over
async function tap(s, key) {
  await s.idle();
  const before = await s.ev(() => { const p = G.mapScene.player; return [p.x, p.y, p.dir].join(); });
  await s.page.keyboard.down(key);
  await s.page.waitForFunction((b) => { const p = G.mapScene && G.mapScene.player; return !p || p.moving || [p.x, p.y, p.dir].join() !== b || G.Script.busy(); }, before, { timeout: 10000 });
  await s.page.keyboard.up(key);
  await s.page.waitForFunction(() => G.mapScene && !G.mapScene.player.moving, null, { timeout: 10000 });
  await s.page.waitForTimeout(60);
}
const level = (s, lv) => s.ev((lv) => { for (const id of G.state.party) G.Story.ensureLevel(id, lv); G.Party.healAll(); }, lv);
const hasItem = (s, id) => s.ev((id) => G.Inv.count(id), id);

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
  results.push({ name, status, msg });
  console.log(`  ${status === 'PASS' ? '✓' : '✗'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)${msg ? '  ' + msg : ''}`);
}

// ------------------------------------------------------------------------------------------------ 1. critical path
const FROM = (process.argv.find((a) => a.startsWith('--from=')) || '').slice(7);   // debugging aid: --from=raid
const RAID_FLAGS = 'ch1_start,ch1_errands,ch1_err_tea,ch1_err_oil,ch1_err_fude,ch1_ahuang_lost,ch1_mine_open,ch1_foreman,ch1_atu_met,ch1_mine_done,' +
  'ch1_depart_fest,ch1_keelung,ch1_moya_seen,ch1_fu_taken,ch1_procession,ch1_bd_in,ch1_release,ch1_lanterns_back,ch1_baizhi_found,ch1_home_night,ch1_baizhi_wake,ch1_baizhi_join,ch1_night_raid';
async function testCritical(browser, open) {
  if (FROM === 'raid') {
    const s = await open('?debug&map=jiufen&x=23&y=30&lv=4&party=xinghe,baizhi&chapter=1&flags=' + RAID_FLAGS);
    await waitMap(s, 'jiufen');
    await s.ev(() => { G.Inv.add('c1_changming_fu', 1); for (const id of ['tut_battle', 'tut_move', 'tut_talk']) G.state.flags[id] = true; });
    return critRaid(s);
  }
  const s = await open('?debug&startch=1');
  await waitMap(s, 'jiufen_shop_2f');
  let f = await s.flags();
  assert(f.ch1_start && f.tut_move && f.tut_talk, '1-1 flags: ' + JSON.stringify(f));
  let st = await s.ev(() => ({ ch: G.state.chapter, party: G.state.party.slice(), lv: G.state.members.xinghe.lv, bz: !!G.state.members.baizhi, obj: G.state.vars.objective }));
  assert(st.ch === 1 && st.party.join() === 'xinghe' && st.lv >= 2 && !st.bz, 'chapter start state: ' + JSON.stringify(st));
  assert(st.obj === '下樓找陳伯', 'objective ' + st.obj);
  await s.shot('01_attic');
  // real keyboard input: walk over, look at the little 水燈 (Z), then walk down the stairs
  await tap(s, 'ArrowRight');
  await tap(s, 'ArrowUp');
  assert(JSON.stringify(await s.ev(() => [G.mapScene.player.x, G.mapScene.player.y, G.mapScene.player.dir])) === '[6,4,"up"]', 'keyboard walk in the attic');
  await s.page.keyboard.press('z');
  await s.page.waitForTimeout(300);
  await s.idle();
  assert((await s.flags()).ch1_seen_lantern, 'Z on the little lantern');
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowDown']) await tap(s, k);
  // 1-2
  await waitMap(s, 'jiufen_shop');
  f = await s.flags();
  assert(f.ch1_errands, '1-2 errands');
  assert(await hasItem(s, 'c1_tea_lanterns') && await hasItem(s, 'c1_offering'), '1-2 items');
  await s.shot('02_shop');
  await step(s, 7, 11);
  await waitMap(s, 'jiufen');
  await s.shot('03_jiufen_P1');
  // 1-3a teahouse
  await step(s, 15, 23);
  await waitMap(s, 'jiufen_teahouse');
  assert((await s.flags()).ch1_err_tea && !(await hasItem(s, 'c1_tea_lanterns')), '1-3a');
  await s.shot('04_teahouse');
  await step(s, 10, 13); await waitMap(s, 'jiufen');
  // 1-3b store
  await step(s, 7, 11); await waitMap(s, 'jiufen_store');
  await talk(s, 'acai');
  f = await s.flags();
  assert(f.ch1_err_oil && f.tut_shop && await hasItem(s, 'c1_lamp_oil'), '1-3b');
  await step(s, 7, 9); await waitMap(s, 'jiufen');
  // 1-3c 福德祠
  await s.ev(() => { const p = G.mapScene.player; p.setCell(24, 37); p.dir = 'up'; G.mapScene.snapCamera(); });
  await act(s, 'fude');
  f = await s.flags();
  assert(f.ch1_err_fude && f.tut_menu && await hasItem(s, 'pinganfu'), '1-3c');
  assert(await s.ev(() => G.state.vars.objective) === '回燈籠舖向陳伯報告', 'errands objective');
  // 1-4
  await step(s, 23, 29); await waitMap(s, 'jiufen_shop');
  await talk(s, 'chenbo');
  await waitMap(s, 'jiufen');
  f = await s.flags();
  assert(f.ch1_ahuang_lost && await hasItem(s, 'c1_lantern'), '1-4');
  // 1-5
  await step(s, 34, 33);
  await waitMap(s, 'mine_1');
  f = await s.flags();
  assert(f.ch1_mine_open && f.tut_field_enemy, '1-5 / mine entry');
  await s.shot('05_mine1');
  // 1-6 cart puzzle: A=S first (bumps the buffer), then A=E,B=N (main), then B=E (side)
  await act(s, 'cart', [0]);
  assert(!(await s.flags()).ch1_cart_main, 'A=S must not clear anything');
  await act(s, 'swA', [0]);
  await act(s, 'swB', [0]);
  assert(await s.ev(() => G.state.vars.swA === 'E' && G.state.vars.swB === 'N'), 'switch state');
  await act(s, 'cart', [0]);
  assert((await s.flags()).ch1_cart_main, '1-6 main rubble');
  assert(await s.ev(() => !G.mapScene.blocked(27, 7) && !G.mapScene.blocked(27, 8)), 'rubble ① should be passable');
  const cartBack = await s.ev(() => { const o = G.mapScene.objects.find((x) => x.key === 'cart'); return [o.x, o.y]; });
  assert(cartBack[0] === 6 && cartBack[1] === 16, 'cart should roll home: ' + cartBack);
  // walk up the cleared corridor for real (path check)
  await s.ev(() => { G.mapScene.player.setCell(27, 15); });
  await s.ev(() => new Promise((res) => G.Script.run(async (S) => { await S.move('player', 'UUUUUUUUUUU'); res(); })));
  assert(await s.ev(() => G.mapScene.player.y) === 4, 'walk to the ladder chamber');
  await step(s, 27, 3);
  await waitMap(s, 'mine_2');
  // 1-7
  await level(s, 4); // 工頭魂 is tuned for a player at Lv3 (docs/BALANCE.md); the bot gets one level of margin
  await step(s, 24, 16, [0]);
  f = await s.flags();
  assert(f.ch1_foreman && f.ch1_atu_met && f.tut_element && await hasItem(s, 'c1_gold_dust') >= 3, '1-7: ' + JSON.stringify(f));
  assert(await s.ev(() => G.Quests.stage('q_atu_watch')) === 0, 'q_atu_watch stage 0');
  assert(await s.ev(() => G.mapScene.followers.some((x) => x.id === 'ahuang_f')), '阿黃 follows 星河');
  await s.shot('06_mine2_hall');
  // cage → 1-8
  await s.ev(() => { const p = G.mapScene.player; p.setCell(22, 26); });
  await act(s, 'cage', [0]);
  await waitMap(s, 'jiufen');
  f = await s.flags();
  assert(f.ch1_mine_done && !f.ch1_ahuang_follow, '1-8');
  await s.shot('07_jiufen_P3');
  // 1-9
  await step(s, 23, 29); await waitMap(s, 'jiufen_shop');
  await talk(s, 'chenbo');
  await talk(s, 'chenbo', [0, 0]);
  await waitMap(s, 'keelung_fest');
  f = await s.flags();
  assert(f.ch1_depart_fest && f.ch1_keelung, '1-9 / 1-10a');
  await s.shot('08_keelung');
  // 1-10b
  await talk(s, 'moya', [0]);
  f = await s.flags();
  assert(f.ch1_moya_seen && f.ch1_fu_taken && await hasItem(s, 'c1_changming_fu'), '1-10b');
  // 1-11
  await talk(s, 'chenbo', [0]);
  await waitMap(s, 'badouzi');
  f = await s.flags();
  assert(f.ch1_procession && f.ch1_bd_in, '1-11 / 1-12a');
  await s.shot('09_badouzi');
  // 1-12
  await talk(s, 'chenbo', [1]);
  f = await s.flags();
  assert(f.ch1_release && f.ch1_lanterns_back && (await s.ev(() => G.state.vars.ch1_lantern_text)) === 1, '1-12');
  await s.shot('10_badouzi_back');
  // 1-13
  await level(s, 4);
  await step(s, 36, 9);
  assert((await s.flags())['ev_badouzi_hesitant'], 'hesitant ghost');
  await step(s, 36, 6);
  await waitMap(s, 'jiufen');
  f = await s.flags();
  assert(f.ch1_baizhi_found && f.ch1_home_night && f.ch1_baizhi_wake && f.ch1_baizhi_join && f.ch1_night_raid && f.tut_party, '1-13…1-15: ' + JSON.stringify(f));
  st = await s.ev(() => ({ party: G.state.party.slice(), bz: G.state.members.baizhi.lv, xh: G.state.members.xinghe.lv }));
  assert(st.party.join() === 'xinghe,baizhi' && st.bz === st.xh, '白芷 joins at the party level: ' + JSON.stringify(st));
  await s.shot('11_jiufen_raid');
  return critRaid(s);
}
async function critRaid(s) {
  let f, st;
  // 1-16 / 1-17
  await step(s, 19, 24);
  await step(s, 19, 15);
  f = await s.flags();
  assert(f.ch1_salt && f.tut_battle_item && await hasItem(s, 'c1_salt') >= 1, '1-17');
  // 1-18 … 1-21
  await level(s, 5);
  await step(s, 19, 4, [0], 400000);   // 1-18 … 1-21: three battles incl. two bosses
  await waitMap(s, 'jiufen_shop', 180000);
  f = await s.flags();
  assert(f.ch1_xiaojin_saved && f.lyric_2 && f.ch1_moya_beaten && f.ch1_yinghuo && f.ch1_wgk_beaten && f.ch1_chenbo_hurt, '1-18…1-21: ' + JSON.stringify(f));
  st = await s.ev(() => ({ w: G.state.members.xinghe.equip.weapon, broken: G.Inv.count('c1_broken_sword'), bamboo: G.Inv.count('sw_bamboo'), cb: !!G.state.members.chenbo, guest: !!G.state.flags.tut_guest }));
  assert(st.w === 'sw_yinghuo' && st.broken === 1 && st.bamboo === 0 && !st.cb && st.guest, '螢火 / guest: ' + JSON.stringify(st));
  // 1-22 / 1-23a
  f = await s.flags();
  assert(f.ch1_reveal && f.ch1_fu_burned && f.ch1_morning_after && await hasItem(s, 'key_yinhunling') && !(await hasItem(s, 'c1_changming_fu')), '1-22: ' + JSON.stringify(f));
  await s.shot('12_morning');
  // 1-23b
  await step(s, 7, 11); await waitMap(s, 'jiufen');
  await s.shot('13_jiufen_P5');
  await step(s, 13, 11); await waitMap(s, 'jiufen_yuyuan');
  f = await s.flags();
  assert(f.ch1_yuyuan && await hasItem(s, 'yuyuan') >= 3, '1-23b');
  assert(await s.ev(() => G.state.vars.objective) === '去聽雨樓跟鄭頭家道別', 'objective after 芋圓');
  await step(s, 7, 9); await waitMap(s, 'jiufen');
  // the departure gate before the cats have joined
  await step(s, 19, 40);
  assert(!(await s.flags()).ch1_done && (await s.ev(() => G.mapScene.player.y)) === 39, 'departure must wait for the teahouse farewell');
  // 1-23d 麻糬 & 芋圓
  await step(s, 15, 23); await waitMap(s, 'jiufen_teahouse');
  f = await s.flags();
  assert(f.mochi_joined && f.yuyuan_joined, 'cats joined');
  assert(await s.ev(() => ['mochi', 'yuyuan'].every((id) => G.mapScene.followers.some((x) => x.id === id))), 'cats follow the party');
  await s.shot('14_cats');
  await step(s, 10, 13); await waitMap(s, 'jiufen');
  // 1-24
  await step(s, 19, 40);
  await s.page.waitForFunction(() => G.state.chapter === 2 && G.state.flags.ch1_done, null, { timeout: 60000 });
  st = await s.ev(() => ({ gold: G.state.gold, lv: G.state.members.xinghe.lv }));
  assert(st.lv >= 5, 'end level ' + st.lv);
  await s.shot('15_end');
  return s;
}

// ------------------------------------------------------------------------------------------------ 2. 阿土伯的懷錶
const P1F = 'ch1_start,ch1_errands,ch1_err_tea,ch1_err_oil,ch1_err_fude,ch1_ahuang_lost,ch1_mine_open';
async function testWatch(browser, open) {
  const s = await open(`?debug&map=mine_1&x=19&y=38&lv=4&party=xinghe&chapter=1&flags=${P1F}`);
  await waitMap(s, 'mine_1');
  await s.ev(() => { G.Inv.add('c1_lantern', 1); });
  await act(s, 'swA', [0]);               // A: S → E ; B stays E
  await act(s, 'cart', [0]);
  assert((await s.flags()).ch1_cart_side, 'side rubble');
  await s.ev(() => { G.mapScene.player.setCell(33, 16); });
  await s.ev(() => new Promise((res) => G.Script.run(async (S) => { await S.move('player', 'RRRRU'); res(); })));
  assert(await s.ev(() => G.mapScene.player.x === 37 && G.mapScene.player.y === 15), 'walk into the east room');
  await step(s, 37, 13);
  await waitMap(s, 'mine_2');
  // the wind pushes back
  await step(s, 3, 18);
  assert(await s.ev(() => G.mapScene.player.y) === 16, 'wind should push 星河 back');
  // wrong order twice, then 一 → 丅 → 下
  await act(s, 'lamp_w3', [0]);
  assert(await s.ev(() => (G.state.vars.windLit || []).length === 0 && G.state.vars.c1_wind_fail === 1), 'wrong lamp resets');
  await act(s, 'lamp_w1', [0]); await act(s, 'lamp_w3', [0]);
  assert(await s.ev(() => G.state.vars.c1_wind_fail === 2), 'second failure');
  await act(s, 'lamp_w1', [0]); await act(s, 'lamp_w2', [0]); await act(s, 'lamp_w3', [0]);
  assert((await s.flags()).ch1_wind_done, 'wind done');
  await s.shot('20_wind');
  await act(s, 'lunchbox');
  await act(s, 'watch');
  assert(await hasItem(s, 'key_watch') && (await s.ev(() => G.Quests.stage('q_atu_watch'))) === 1, 'watch found');
  // deliver in P3 (阿土嬸 at home)
  await s.ev(() => { Object.assign(G.state.flags, { ch1_foreman: true, ch1_atu_met: true, ch1_mine_done: true }); });
  await warp(s, 'jiufen_atu_house', 6, 7, 'up');
  await talk(s, 'atusim_in');
  const r = await s.ev(() => ({ done: G.Quests.isDone('q_atu_watch'), l: !!G.state.lanterns.xd_atu_watch, sugar: G.Inv.count('c1_maltose'), tut: !!G.state.flags.tut_xindeng }));
  assert(r.done && r.l && r.sugar === 5 && r.tut, '心燈① ' + JSON.stringify(r));
  await act(s, 'table');
  await s.shot('21_atu_house');
  return s;
}

// ------------------------------------------------------------------------------------------------ 3. 阿黃回家
async function testAhuang(browser, open) {
  const s = await open(`?debug&map=jiufen&x=26&y=10&lv=4&party=xinghe&chapter=1&flags=${P1F},ch1_foreman,ch1_atu_met,ch1_mine_done`);
  await waitMap(s, 'jiufen');
  await talk(s, 'xiaojin');
  assert(await s.ev(() => G.Quests.stage('q_ahuang')) === 0, 'stage 0');
  await talk(s, 'awang', [0]);
  assert(await s.ev(() => G.Quests.stage('q_ahuang')) === 1, 'stage 1');
  await warp(s, 'jiufen_atu_house', 6, 7, 'up');
  await talk(s, 'atusim_in');
  assert(await s.ev(() => G.Quests.stage('q_ahuang')) === 2, 'stage 2');
  await warp(s, 'jiufen', 22, 7, 'right');
  await step(s, 24, 7);
  const r = await s.ev(() => ({ done: G.Quests.isDone('q_ahuang'), l: !!G.state.lanterns.xd_ahuang, rock: G.Inv.count('c1_foolsgold') }));
  assert(r.done && r.l && r.rock === 1, '心燈② ' + JSON.stringify(r));
  await talk(s, 'xiaojin'); await talk(s, 'ahuang'); await talk(s, 'awang');
  return s;
}

// ------------------------------------------------------------------------------------------------ 4. 醒木失竊記
async function testXingmu(browser, open) {
  const s = await open(`?debug&map=jiufen&x=15&y=24&lv=3&party=xinghe&chapter=1&flags=ch1_start,ch1_errands,ch1_err_tea`);
  await waitMap(s, 'jiufen');
  await s.ev(() => { G.state.vars.c1_tea_entries = 0; });
  await step(s, 15, 23); await waitMap(s, 'jiufen_teahouse');
  assert(await s.ev(() => G.Quests.stage('q_xingmu')) === 0, 'theft');
  await step(s, 10, 13); await waitMap(s, 'jiufen');
  await talk(s, 'heitang', [0]);
  assert(await s.ev(() => G.Quests.stage('q_xingmu')) === 1 && await s.ev(() => { const c = G.mapScene.actor('heitang'); return c.x === 10 && c.y === 16; }), 'cat ②');
  await talk(s, 'heitang');
  assert(await s.ev(() => G.Quests.stage('q_xingmu')) === 2, 'cat ③');
  await talk(s, 'heitang');
  assert(!(await hasItem(s, 'c1_xingmu')), 'no fish, no 醒木');
  await talk(s, 'ashui');
  assert(await hasItem(s, 'c1_dried_fish'), '阿水 gives a fish');
  await talk(s, 'heitang', [0]);
  assert(await hasItem(s, 'c1_xingmu'), '醒木 back');
  await step(s, 15, 23); await waitMap(s, 'jiufen_teahouse');
  await talk(s, 'abing', [1]);
  const r = await s.ev(() => ({ done: G.Quests.isDone('q_xingmu'), fan: G.Inv.count('c1_fan_story'), tea: G.Inv.count('c1_oolong') }));
  assert(r.done && r.fan === 1 && r.tea >= 2, '醒木失竊記 ' + JSON.stringify(r));
  await talk(s, 'abing', [0, 3]);   // the bonus story is now on the list
  return s;
}

// ------------------------------------------------------------------------------------------------ 5. townsfolk in every phase
const PHASES = {
  P1: P1F.split(',').slice(0, 2).join(','),
  P2: P1F,
  P3: P1F + ',ch1_foreman,ch1_atu_met,ch1_mine_done',
  P5: P1F + ',ch1_foreman,ch1_atu_met,ch1_mine_done,ch1_depart_fest,ch1_keelung,ch1_procession,ch1_lanterns_back,ch1_baizhi_found,ch1_home_night,ch1_baizhi_wake,ch1_baizhi_join,ch1_night_raid,ch1_chenbo_hurt,ch1_reveal,ch1_morning_after,ch1_yuyuan',
};
const SKIP_TALK = { jiufen_shop: ['chenbo'], keelung_fest: ['chenbo', 'moya'], badouzi: ['chenbo'] };
async function talkAll(s, mapId) {
  const ids = await s.ev(() => G.mapScene.npcs.filter((n) => n.visible && !n.spawned && (n.talk || (n.def && n.def.talk))).map((n) => n.id));
  for (const id of ids) {
    if ((SKIP_TALK[mapId] || []).includes(id)) continue;
    await talk(s, id);
    await talk(s, id);
  }
  return ids.length;
}
async function actAll(s, skip = []) {
  const ids = await s.ev(() => (G.mapScene.def.events || []).filter((e) => e.trigger === 'action' && G.mapScene.eventOk(e)).map((e) => e.id));
  for (const id of ids) if (!skip.includes(id)) await act(s, id, [1, 1]);
}
async function testTownsfolk(browser, open) {
  let s = null;
  for (const [ph, flags] of Object.entries(PHASES)) {
    if (s) await s.close();
    s = await open(`?debug&map=jiufen&x=19&y=30&lv=5&party=${ph === 'P5' ? 'xinghe,baizhi' : 'xinghe'}&chapter=1&flags=${flags}`);
    await waitMap(s, 'jiufen');
    const n = await talkAll(s, 'jiufen');
    assert(n >= 14, `${ph}: only ${n} NPCs in 九份`);
    await actAll(s, ['fude', 'save']);
    await s.shot('30_jiufen_' + ph);
    for (const [m, x, y] of [['jiufen_teahouse', 10, 12], ['jiufen_yuyuan', 7, 8], ['jiufen_store', 7, 8], ['jiufen_clinic', 7, 8], ['jiufen_atu_house', 6, 7], ['jiufen_shop', 7, 10], ['jiufen_shop_2f', 9, 6]]) {
      await warp(s, m, x, y, 'up');
      await talkAll(s, m);
      await actAll(s, ['save']);
      if (ph === 'P1') await s.shot('31_' + m);
    }
    // the gold is never stolen by a test-bot shop visit, and nothing errored
    const e = await s.gameErrors();
    if (e.length) break;
  }
  // festival maps
  await s.close();
  s = await open(`?debug&map=keelung_fest&x=38&y=7&lv=4&party=xinghe&chapter=1&flags=${PHASES.P3},ch1_depart_fest,ch1_keelung`);
  await waitMap(s, 'keelung_fest');
  await talkAll(s, 'keelung_fest');
  await actAll(s, ['save']);
  await s.close();
  s = await open(`?debug&map=badouzi&x=23&y=28&lv=4&party=xinghe&chapter=1&flags=${PHASES.P3},ch1_depart_fest,ch1_keelung,ch1_procession,ch1_bd_in`);
  await waitMap(s, 'badouzi');
  await talkAll(s, 'badouzi');
  await step(s, 36, 12);
  assert(await s.ev(() => G.mapScene.player.y) === 15, 'the reef is closed before the lanterns return');
  await step(s, 23, 35);
  assert(await s.ev(() => G.mapScene.player.y) === 34, 'south exit blocked');
  return s;
}

// ------------------------------------------------------------------------------------------------ 6. every map renders; the raid map
async function testMaps(browser, open) {
  const s = await open(`?debug&map=jiufen&x=23&y=30&lv=5&party=xinghe,baizhi&chapter=1&flags=${PHASES.P5.replace(',ch1_chenbo_hurt,ch1_reveal,ch1_morning_after,ch1_yuyuan', '')}`);
  await waitMap(s, 'jiufen');
  assert(await s.ev(() => G.mapScene.enemies.length) === 5, 'raid enemies');
  assert(await s.ev(() => G.mapScene.npcs.filter((n) => !n.spawned).length) === 0, 'nobody outside during the raid');
  await s.shot('40_raid');
  // a roaming 水鬼 fight in the raid works
  await s.ev(() => { const e = G.mapScene.enemies[0]; G.mapScene.startBattle(e, 'normal'); });
  await s.idle();
  assert(await s.ev(() => G.mapScene.enemies.length) === 4, 'roaming fight resolved');
  // locked doors at night
  await step(s, 7, 11);
  assert((await s.map()) === 'jiufen' && (await s.ev(() => G.mapScene.player.y)) === 12, 'doors are barred during the raid');
  for (const [m, x, y] of [['mine_1', 19, 38], ['mine_2', 25, 4], ['keelung_fest', 38, 7], ['badouzi', 23, 30]]) {
    await warp(s, m, x, y, 'up');
    await s.shot('41_' + m);
  }
  return s;
}

// ------------------------------------------------------------------------------------------------ 7. 3D view smoke test
async function test3d(browser, open) {
  const s = await open(`?debug&map=jiufen&x=19&y=26&lv=5&party=xinghe,baizhi&chapter=1&r3lite&flags=${RAID_FLAGS}`);
  await waitMap(s, 'jiufen', 180000);
  assert(await s.ev(() => !!(G.mapScene.view3d && G.R3.enabled())), '3D view is active');
  await step(s, 19, 24);   // 鬼燈籠 apparitions → monster billboards in the 3D scene, then the fight
  assert((await s.flags())['ev_jiufen_raid_lanterns'], 'raid event ran in 3D');
  assert(await s.ev(() => !!(G.mapScene.view3d && G.mapScene.view3d._c1)), 'update3d hook built its objects');
  await s.shot('50_3d_raid');
  await warp(s, 'keelung_fest', 38, 7, 'left');
  await s.shot('51_3d_keelung');
  return s;
}

(async () => {
  console.log('第一章　九份燈火 — chapter 1 playthrough');
  const browser = await chromium.launch();
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const tests = [
    ['critical path 1-1 … 1-24 → chapter 2', testCritical],
    ['心燈① 阿土伯的懷錶 (cart east, wind lamps, delivery)', testWatch],
    ['心燈② 阿黃回家', testAhuang],
    ['醒木失竊記', testXingmu],
    ['townsfolk in every phase, festival maps', testTownsfolk],
    ['raid map, mines & festival maps render', testMaps],
    ['3D view (?r3lite): raid apparitions, festival', test3d],
  ];
  // the WebGL view is slow under SwiftShader: its smoke test only runs with --3d
  for (const [name, fn] of tests) {
    if (fn === test3d && !process.argv.includes('--3d')) continue;
    if (!only.length || only.some((o) => name.includes(o))) await run(name, browser, fn);
  }
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log('\n' + (fail.length ? `FAIL — ${fail.length}/${results.length} test(s) failed` : `PASS — ${results.length}/${results.length} tests`));
  process.exit(fail.length ? 1 : 0);
})();

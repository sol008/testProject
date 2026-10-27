#!/usr/bin/env node
// 序章　夢 (chapter 0) — automated playthrough.
//
//   node tools/test/chapters/ch0.test.js            # headless, prints PASS/FAIL summary, exit 1 on failure
//   node tools/test/chapters/ch0.test.js --shots    # also save screenshots to tools/test/out/ch0/
//
// Tests
//   1. title     : real New Game from the title screen (press a key, choose 新的旅程) reaches the prologue:
//                  narration → title card → dream map, 星河 at (10,42), wake-up scene, tutorials.
//   2. critical  : ?debug&startch=0 with G.Debug.autoplay, every main beat through to G.Story.next(S, 1).
//   3. extras    : all four drifting souls (first + repeat lines, the child's soul following), lamp refusal,
//                  the L1 gate, the dream menu block, the 對話 tutorial by proximity, decorative lamps.
//   4. wipeout   : a lost dream battle never shows Game Over — heal, back to the spot, fight again.
// Other chapters' files are stubbed out (work in progress by other builders must not break this test);
// chapter 1 is loaded when it exists and parses, so the hand-off runs into the real chapter.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const SHOTS = process.argv.includes('--shots');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch0');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
const BAD_WARN = /unknown|missing|not found|no actor|not registered|undefined/i;

// chapter 1 is kept if present and syntactically valid
let ch1Ok = false;
const ch1File = path.join(ROOT, 'js', 'maps', 'ch1_jiufen.js');
if (fs.existsSync(ch1File)) {
  try { execFileSync(process.execPath, ['--check', ch1File], { stdio: 'pipe' }); ch1Ok = true; } catch (e) { ch1Ok = false; }
}
const STUB = ch1Ok ? /js\/maps\/ch([2-9]|1[01])_[a-z]+\.js$/ : /js\/maps\/ch([1-9]|1[01])_[a-z]+\.js$/;

const results = [];
const assert = (c, msg) => { if (!c) throw new Error(msg); };

async function session(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-TW', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  await page.route(STUB, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stubbed by ch0.test.js */' }));
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
    async idle(ms = 90000) {
      const ok = await page.evaluate((t) => G.Debug.idle(t), ms);
      assert(ok, 'timed out waiting for the map to become idle; stack = ' + JSON.stringify(await page.evaluate(() => G.Scenes.stack.map((x) => (x.constructor && x.constructor.name) || '?'))));
    },
    flags: () => page.evaluate(() => Object.assign({}, G.state.flags)),
    async shot(name) { if (SHOTS) await page.screenshot({ path: path.join(OUT, name + '.png') }); },
    async gameErrors() {
      const le = await page.evaluate(() => { const e = G.lastError; G.lastError = null; return e ? String(e.stack || e) : null; }).catch(() => null);
      if (le) errors.push('G.lastError: ' + le.slice(0, 600));
      return errors;
    },
    close: () => ctx.close(),
  };
  return s;
}
// run an action event by id with the player standing on (x,y) facing dir
const act = (s, id, x, y, dir, choices = []) => s.ev(([id, x, y, dir, ch]) => {
  G.Debug.choices = ch.slice();
  const p = G.mapScene.player; p.setCell(x, y); p.dir = dir; G.mapScene.snapCamera();
  return G.Debug.trigger(id);
}, [id, x, y, dir, choices]);
const step = (s, x, y) => s.ev(([x, y]) => G.Debug.stepOn(x, y), [x, y]);

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

// ------------------------------------------------------------------------------------------------ 1. title → new game
async function testTitle(browser, open) {
  const s = await open('');
  await s.page.waitForFunction(() => G.Title && G.Scenes.top() && G.Scenes.top().stage === 'press', null, { timeout: 30000 });
  await s.shot('00_title');
  await s.page.keyboard.press('Enter');
  await s.page.waitForFunction(() => G.Scenes.top().stage === 'menu', null, { timeout: 5000 });
  await s.page.waitForTimeout(300);
  const item = await s.ev(() => { const t = G.Scenes.top(); return t.list.cur.label; });
  assert(item === '新的旅程', 'title menu cursor is on ' + item);
  await s.page.keyboard.press('Enter');
  // the opening narration over black
  await s.page.waitForFunction(() => G.Scenes.top() && G.Scenes.top().constructor.name === 'NarrateScene', null, { timeout: 15000 });
  const st0 = await s.ev(() => ({ ch: G.state.chapter, party: G.state.party.slice(), lv: G.state.members.xinghe && G.state.members.xinghe.lv, start: !!G.state.flags.ch0_start }));
  assert(st0.ch === 0 && st0.start && st0.party.join() === 'xinghe' && st0.lv === 1, 'new game state wrong: ' + JSON.stringify(st0));
  await s.page.waitForTimeout(3500);
  await s.shot('01_narration');
  // from here let the test bot drive
  await s.ev(() => G.Debug.setAutoplay(true));
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'dream', null, { timeout: 30000 });
  await s.idle();
  const st = await s.ev(() => ({ x: G.mapScene.player.x, y: G.mapScene.player.y, visible: G.mapScene.player.visible, f: G.state.flags, obj: G.state.vars.objective, top: G.Scenes.top() === G.mapScene }));
  assert(st.x === 10 && st.y === 42 && st.visible, 'player should stand at (10,42): ' + JSON.stringify(st));
  assert(st.f.ch0_awake && st.f.tut_move, 'wake-up scene / move tutorial did not run');
  assert(st.obj === '沿著燈橋往前走', 'objective: ' + st.obj);
  await s.ev(() => G.Debug.setAutoplay(false));
  await s.page.waitForTimeout(800);
  await s.shot('02_dream_start');
  // walk a few steps north with the keyboard
  await s.page.keyboard.down('ArrowUp'); await s.page.waitForTimeout(700); await s.page.keyboard.up('ArrowUp');
  await s.page.waitForTimeout(400);
  const y = await s.ev(() => G.mapScene.player.y);
  assert(y < 42, 'player could not walk north (y=' + y + ')');
  return s;
}

// ------------------------------------------------------------------------------------------------ 2. critical path
async function testCritical(browser, open) {
  const s = await open('?debug&startch=0');
  await s.ev(() => G.Debug.setAutoplay(true));
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'dream', null, { timeout: 30000 });
  await s.idle();
  let f = await s.flags();
  assert(f.ch0_start && f.ch0_awake && f.tut_move, '0-1/0-2 flags missing');
  await s.shot('10_awake');

  // 0-4 first lamp → battle dream_1 (tutorial) → won
  await act(s, 'lamp1', 11, 36, 'right', [0]);
  await s.idle();
  f = await s.flags();
  assert(f.ch0_lamp1 && f.ch0_battle1 && f.tut_battle, '0-4 flags: ' + JSON.stringify(f));
  const lit1 = await s.ev(() => G.mapScene.objects.find((o) => o.key === 'L1').lit);
  assert(lit1, 'L1 should be lit');
  const exp1 = await s.ev(() => G.state.members.xinghe.exp);
  assert(exp1 > 0, 'no exp after the first battle');

  // 0-5 broken bridge
  await step(s, 10, 33);
  await s.idle();
  assert(await s.ev(() => G.state.vars.objective === '點亮剩下的燈柱'), '0-5 objective not set');
  const solidGap = await s.ev(() => G.mapScene.blocked(10, 31));
  assert(solidGap, 'the gap must be impassable before the lamps are lit');
  await act(s, 'lamp2', 9, 33, 'left');
  await s.idle();
  assert((await s.flags()).ch0_lamp2, 'lamp2');
  await act(s, 'lamp3', 11, 33, 'right');
  await s.idle();
  f = await s.flags();
  assert(f.ch0_lamp3 && f.ch0_bridge && f.tut_target, '0-5 flags: ' + JSON.stringify(f));
  const bridge = await s.ev(() => [30, 31, 32].every((y) => [9, 10, 11].every((x) => G.mapScene.terrainAt(x, y) === 'lantern_bridge' && !G.mapScene.blocked(x, y))));
  assert(bridge, 'the bridge (9–11, 30–32) did not form');
  await s.shot('11_bridge');

  // walk over the new bridge for real (path check): from (10,33) north to (10,24)
  const walked = await s.ev(async () => {
    const S = G.Script.S;
    const p = G.mapScene.player; p.setCell(10, 33);
    await new Promise((res) => G.Script.run(async () => { await S.move('player', 'UUUUUUUUU'); res(); }));
    return [p.x, p.y];
  });
  assert(walked[1] === 24, 'could not walk across the rebuilt bridge: ' + walked);
  await s.idle();

  // 0-6 the mist rises → t_c0_dream_3 (charge / guard tutorial)
  await step(s, 10, 16);
  await s.idle();
  f = await s.flags();
  assert(f.ch0_battle3 && f.tut_guard_skill, '0-6 flags: ' + JSON.stringify(f));
  const lv = await s.ev(() => G.state.members.xinghe.lv);
  assert(lv >= 2, 'xinghe should reach Lv2 in the prologue (lv=' + lv + ')');
  const lamps = await s.ev(() => ['LW', 'LE'].every((k) => G.mapScene.objects.find((o) => o.key === k).lit));
  assert(lamps, 'the decorative lamps should be warm again after 0-6');
  await s.shot('12_after_mist');

  // 0-7 / 0-8 the girl, the fall, the hand-off to chapter 1
  await step(s, 10, 10);
  await s.page.waitForFunction(() => G.state.chapter === 1 && G.state.flags.ch0_done, null, { timeout: 90000 });
  f = await s.flags();
  assert(f.ch0_girl && f.lyric_1 && f.ch0_done, '0-7/0-8 flags: ' + JSON.stringify(f));
  // the exact last line of the prologue was spoken by ？？？
  const line = await s.ev(() => G.Dialog.log.find((l) => l.text === '星河……這一次，別再來找我了。'));
  assert(line && line.name === '？？？', 'the girl\'s line is missing or not attributed to ？？？: ' + JSON.stringify(line));
  // party healthy at the hand-off
  const hp = await s.ev(() => { const m = G.state.members.xinghe; return m.hp === G.Party.stats('xinghe').mhp; });
  assert(hp, 'party should be fully healed for chapter 1');
  // chapter 1 (if loaded) takes over; otherwise the placeholder narration finishes
  await s.page.waitForTimeout(1500);
  if (ch1Ok) {
    const ok = await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id !== 'dream', null, { timeout: 60000 }).then(() => true).catch(() => false);
    assert(ok, 'chapter 1 did not move the party off the dream map');
  }
  await s.shot('13_handoff');
  return s;
}

// ------------------------------------------------------------------------------------------------ 3. souls & extras
async function testExtras(browser, open) {
  const s = await open('?debug&map=dream&lv=1&party=xinghe&flags=ch0_awake');
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'dream', null, { timeout: 30000 });
  await s.ev(() => G.Debug.setAutoplay(true));
  await s.idle();
  // move tutorial when loading the map directly with ch0_awake: set manually to test the proximity tutorial
  await s.ev(() => { G.state.flags.tut_move = true; });
  // proximity → 對話／調查 tutorial (walk next to soul A)
  await s.ev(() => { G.mapScene.player.setCell(9, 39); G.mapScene.snapCamera(); });
  await s.ev(() => G.Script.run(async (S) => { await S.move('player', 'U'); }));
  await s.page.waitForFunction(() => G.state.flags.tut_talk, null, { timeout: 8000 });
  await s.idle();
  // the dream has no menu
  await s.ev(() => G.Debug.setAutoplay(false));
  await s.page.keyboard.press('c');
  await s.page.waitForTimeout(400);
  const menuOpen = await s.ev(() => G.Scenes.stack.some((x) => x.constructor.name === 'MenuScene'));
  assert(!menuOpen, 'menu opened in the dream');
  await s.page.keyboard.press('Escape');
  await s.page.waitForTimeout(400);
  assert(!(await s.ev(() => G.Scenes.stack.some((x) => x.constructor.name === 'MenuScene'))), 'menu opened with Esc in the dream');
  await s.ev(() => G.Debug.setAutoplay(true));
  // souls: first and repeat lines
  const logLen = () => s.ev(() => G.Dialog.log.length);
  for (const [id, x, y, dir, k] of [['soul_a', 9, 38, 'left', 'a'], ['soul_b', 6, 25, 'left', 'b'], ['soul_d', 11, 13, 'right', 'd']]) {
    const n0 = await logLen();
    await act(s, id, x, y, dir); await s.idle();
    const n1 = await logLen();
    await act(s, id, x, y, dir); await s.idle();
    const n2 = await logLen();
    assert((await s.flags())['ch0_soul_' + k], id + ' flag');
    assert(n1 - n0 >= 3 && n2 - n1 === 1, `${id}: first talk ${n1 - n0} lines, repeat ${n2 - n1} line(s)`);
  }
  // the child's soul: second talk → it follows 星河
  await act(s, 'soul_c', 14, 27, 'right'); await s.idle();
  await act(s, 'soul_c', 14, 27, 'right'); await s.idle();
  const fol = await s.ev(() => !!G.state.flags.ch0_soulc_follow);
  assert(fol, 'the child\'s soul should follow after the second talk');
  // refusing to light L1, then the gate keeps 星河 from passing it unlit
  await act(s, 'lamp1', 11, 36, 'right', [1]); await s.idle();
  assert(!(await s.flags()).ch0_lamp1, 'L1 must stay unlit after 不管它');
  await s.ev(() => { G.mapScene.player.setCell(10, 35); G.mapScene.snapCamera(); });
  await step(s, 10, 34); await s.idle();
  const py = await s.ev(() => G.mapScene.player.y);
  assert(py === 35, 'the unlit-lamp gate should send 星河 back to y=35 (y=' + py + ')');
  // decorative lamps
  const n3 = await logLen();
  await act(s, 'lamp_w', 9, 16, 'left'); await s.idle();
  assert((await logLen()) === n3 + 1, 'decorative lamp line');
  await s.shot('20_extras');
  return s;
}

// ------------------------------------------------------------------------------------------------ 4. dream wipe-out
async function testWipeout(browser, open) {
  const s = await open('?debug&map=dream&lv=1&party=xinghe&flags=ch0_awake,tut_move,tut_talk');
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'dream', null, { timeout: 30000 });
  await s.ev(() => G.Debug.setAutoplay(true));
  await s.idle();
  // the first battle "is lost"; the second (real) one is fought
  await s.ev(() => {
    window.__battles = [];
    const orig = G.Battle.start;
    G.Battle.start = (t, o) => {
      window.__battles.push(t.enemies ? t.enemies.join('+') : t);
      if (window.__battles.length === 1) { G.state.members.xinghe.hp = 1; return Promise.resolve('lose'); }
      return orig(t, o);
    };
  });
  await act(s, 'lamp1', 11, 36, 'right', [0]);
  await s.idle();
  const r = await s.ev(() => ({ b: window.__battles, f: G.state.flags, hurt: G.Dialog.log.some((l) => l.text === '……還不能在這裡倒下。'), go: G.Scenes.stack.some((x) => x.constructor.name === 'GameOverScene'), pos: [G.mapScene.player.x, G.mapScene.player.y] }));
  assert(r.b.length === 2, 'expected a retry battle, got ' + JSON.stringify(r.b));
  assert(r.hurt && !r.go, 'wipe-out should show 「……還不能在這裡倒下。」 and no Game Over');
  assert(r.f.ch0_battle1 && r.f.ch0_lamp1, 'story should continue after the retry');
  assert(r.pos[0] === 11 && r.pos[1] === 36, 'player should be back where the fight began: ' + r.pos);
  return s;
}

(async () => {
  console.log('序章　夢 — chapter 0 playthrough' + (ch1Ok ? ' (chapter 1 loaded for the hand-off)' : ' (chapter 1 not available: placeholder hand-off)'));
  const browser = await chromium.launch();
  await run('title → 新的旅程 → prologue opening', browser, testTitle);
  await run('critical path 0-1 … 0-8 → chapter 1', browser, testCritical);
  await run('souls, lamps, dream rules', browser, testExtras);
  await run('dream wipe-out retries (no Game Over)', browser, testWipeout);
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log('\n' + (fail.length ? `FAIL — ${fail.length}/${results.length} test(s) failed` : `PASS — ${results.length}/${results.length} tests`));
  process.exit(fail.length ? 1 : 0);
})();

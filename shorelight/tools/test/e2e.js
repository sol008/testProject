#!/usr/bin/env node
// Shorelight end-to-end suite (Playwright + Chromium against file://…/index.html).
//
//   node tools/test/e2e.js                       # everything
//   node tools/test/e2e.js --only boot,menu      # tests whose id contains one of the words
//   node tools/test/e2e.js --maps sandbox,jiufen # restrict the per-map sweep
//   node tools/test/e2e.js --troops 20           # only the first N troops in the battle sweep
//   node tools/test/e2e.js --workers 4           # parallel pages for map/battle sweeps (default 4)
//   node tools/test/e2e.js --no-sweep            # skip the per-map and per-troop sweeps
//   node tools/test/e2e.js --headed --shots      # visible browser / save PNGs to tools/test/out/
//
// Every test collects console errors, uncaught page errors, unhandled rejections and G.lastError.
// A test fails if its assertions fail OR the game logged an error while it ran.
// Results: console table + tools/test/out/e2e-report.json.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ROOT } = require('./load');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : def; };
const ONLY = opt('only', '') ? String(opt('only')).split(',') : null;
const MAPS = opt('maps', '') ? String(opt('maps')).split(',') : null;
const TROOP_LIMIT = +opt('troops', 0) || 0;
const WORKERS = Math.max(1, +opt('workers', 2) || 2);
const HEADED = argv.includes('--headed');
const SHOTS = argv.includes('--shots');
const NO_SWEEP = argv.includes('--no-sweep');
// 3D renderer (js/r3d, Three.js / WebGL #game3d canvas): headless Chromium only has SwiftShader software
// WebGL (measured ~20 s per frame on this box), so by default every test runs with settings.render3d=false
// (the 2D path, which the 3D view is layered over). --3d keeps the game's default (3D on) for all tests and
// enables the '3d' test; use it on a machine with a real GPU (add --headed).
const FORCE_3D = argv.includes('--3d');
const NO_3D = argv.includes('--no3d');
const TSCALE = Math.max(1, +opt('slow', 1) || 1); // --slow 3 multiplies every timeout (busy machines)
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'file://' + path.join(ROOT, 'index.html');
const SLOW_FRAME_MS = 16;

// ------------------------------------------------------------------ in-page driver (installed before any game script)
const INIT = () => {
  window.__qa = {
    errs: [],
    warns: [],
    note(kind, msg) { (kind === 'warn' ? this.warns : this.errs).push(String(msg).slice(0, 1500)); },
    // Fast-forward the game deterministically: replicate main.js's per-frame update with a fixed dt,
    // yielding to the event loop between steps so async scripts/battles progress. Draws every `drawEvery` steps.
    async ff(sec, o = {}) {
      const dt = o.dt || 0.05, steps = Math.ceil(sec / dt), drawEvery = o.drawEvery || 4;
      const until = o.until ? new Function('return (' + o.until + ')') : null;
      const ch = new MessageChannel();
      const yieldNow = () => new Promise((r) => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
      for (let i = 0; i < steps; i++) {
        try {
          G.time += dt;
          G.Input.update(dt); G.Timers.update(dt); G.Tweens.update(dt); G.Render.updateFx(dt); G.UI.updateToasts(dt);
          G.Scenes.update(dt);
          if (G.state && G.inGame) G.state.playtime += dt;
          if (i % drawEvery === 0) {
            const ctx = G.ctx;
            G.Render.begin(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H);
            G.Scenes.draw(ctx); G.UI.drawToasts(ctx); G.Render.drawOverlays();
          }
          G.Input.endFrame();
        } catch (e) {
          G.lastError = e;
          this.note('err', 'ff step: ' + (e && e.stack || e));
          if (this.errs.length > 50) return 'errors';
        }
        await yieldNow(); await null;
        if (until) { let v; try { v = until(); } catch (e) { v = false; } if (v) return true; }
      }
      return false;
    },
    top() {
      const t = G.Scenes.top();
      if (!t) return null;
      if (G.GameOverScene && t instanceof G.GameOverScene) return 'GameOverScene';
      if (G.ShopScene && t instanceof G.ShopScene) return 'ShopScene';
      if (G.Battle && t instanceof G.Battle.Scene) return 'BattleScene';
      return (t.constructor && t.constructor.name) || 'anonymous';
    },
    stack() { return G.Scenes.stack.map((s) => (s.constructor && s.constructor.name) || '?'); },
    canvasStats() {
      const c = G.canvas, x = c.getContext('2d');
      const w = c.width, h = c.height;
      const d = x.getImageData(0, 0, w, h).data;
      let nonBlack = 0, n = 0, sum = 0, sum2 = 0;
      for (let i = 0; i < d.length; i += 4 * 97) {
        const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        n++; sum += l; sum2 += l * l; if (l > 12) nonBlack++;
      }
      const mean = sum / n;
      return { nonBlack: nonBlack / n, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) };
    },
    // CPU cost of update+draw per frame (independent of vsync)
    frameCost(n = 40) {
      const ts = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        G.Scenes.update(1 / 60);
        G.Render.begin(); G.ctx.fillStyle = '#000'; G.ctx.fillRect(0, 0, G.W, G.H);
        G.Scenes.draw(G.ctx); G.Render.drawOverlays();
        ts.push(performance.now() - t0);
      }
      ts.sort((a, b) => a - b);
      return { avg: ts.reduce((a, b) => a + b, 0) / ts.length, p95: ts[Math.floor(ts.length * 0.95) - 1] || ts[ts.length - 1], first: null };
    },
    rafAvg(n = 60) {
      return new Promise((res) => {
        const ts = [];
        const f = (t) => { ts.push(t); if (ts.length > n) { const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b) => a - b); res({ avg: d.reduce((a, b) => a + b, 0) / d.length, max: d[d.length - 1] }); } else requestAnimationFrame(f); };
        requestAnimationFrame(f);
      });
    },
    numericSanity() {
      const bad = [];
      for (const id in G.state.members) {
        const m = G.state.members[id];
        for (const k of ['lv', 'exp', 'hp', 'mp', 'gauge']) if (typeof m[k] !== 'number' || !isFinite(m[k])) bad.push(`${id}.${k}=${m[k]}`);
        const st = G.Party.stats(id);
        if (m.hp > st.mhp) bad.push(`${id}.hp ${m.hp} > mhp ${st.mhp}`);
        if (m.hp < 0 || m.mp < 0) bad.push(`${id} negative hp/mp`);
      }
      if (!isFinite(G.state.gold) || G.state.gold < 0) bad.push('gold=' + G.state.gold);
      for (const k in G.state.inv) if (!(G.state.inv[k] > 0)) bad.push(`inv.${k}=${G.state.inv[k]}`);
      return bad;
    },
  };
  window.addEventListener('error', (e) => window.__qa.note('err', 'window.onerror: ' + (e.error && e.error.stack || e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__qa.note('err', 'unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)));
};

// ------------------------------------------------------------------ session
const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
class Session {
  constructor(browser) { this.browser = browser; this.errors = []; this.warnings = []; }
  async open(query = '', o = {}) {
    if (!this.ctx) {
      this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      await this.ctx.addInitScript(INIT);
      const off = NO_3D || !FORCE_3D;
      if (off) await this.ctx.addInitScript(() => { try { const k = 'shorelight_settings'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.render3d = false; localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } });
    }
    if (this.page) await this.page.close().catch(() => {});
    this.page = await this.ctx.newPage();
    this.page.on('console', (m) => {
      const t = m.text();
      if (IGNORE.some((r) => r.test(t))) return;
      if (m.type() === 'error') this.errors.push('console.error: ' + t.slice(0, 1500));
      else if (m.type() === 'warning') this.warnings.push(t.slice(0, 300));
    });
    this.page.on('pageerror', (e) => this.errors.push('pageerror: ' + (e.stack || e.message).slice(0, 1500)));
    await this.page.goto(BASE + query, { timeout: 120000 * TSCALE });
    await this.page.waitForFunction(() => window.G && G.Scenes && G.Scenes.top(), null, { timeout: (o.timeout || 60000) * TSCALE });
    // Autoplay/test hooks must never mask input bugs: every e2e test runs with them OFF.
    await this.page.evaluate(() => { if (G.Debug) { if (G.Debug.setAutoplay) G.Debug.setAutoplay(false); G.Debug.autoplay = false; } G.settings.autoAdvance = false; });
    if (o.waitMap) await this.page.waitForFunction(() => G.mapScene && G.mapScene.def && G.Scenes.has(G.mapScene), null, { timeout: (o.timeout || 60000) * TSCALE });
    return this.page;
  }
  async close() { if (this.ctx) await this.ctx.close().catch(() => {}); this.ctx = null; this.page = null; }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  async frames(n = 2) { await this.page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n); }
  async key(k, holdMs = 0) {
    if (holdMs) { await this.page.keyboard.down(k); await this.page.waitForTimeout(holdMs); await this.page.keyboard.up(k); }
    else await this.page.keyboard.press(k);
    await this.frames(2);
  }
  async keys(...ks) { for (const k of ks) await this.key(k); }
  top() { return this.ev(() => __qa.top()); }
  async waitTop(name, timeout = 8000 * TSCALE) {
    await this.page.waitForFunction((n) => __qa.top() === n, name, { timeout }).catch(async () => { throw new Error(`timed out waiting for top scene ${name}; stack = ${JSON.stringify(await this.ev(() => __qa.stack()))}`); });
  }
  ff(sec, o) { return this.page.evaluate(([s, oo]) => __qa.ff(s, oo), [sec, o || {}]); }
  // Run a script function body (string: async (S) => {...}) in the game's script runner, result stored on window.__qa.res
  async script(body) {
    await this.ev((b) => { window.__qa.res = undefined; window.__qa.done = false; G.Script.run(new Function('S', 'return (async () => { window.__qa.res = await (' + b + ')(S); window.__qa.done = true; })()')); }, body);
  }
  // Drive scripts to completion: auto-advance dialogue (held skip) and answer choices with `choice` index.
  async drive(maxSec = 60, choice = 0) {
    await this.ev(() => G.Input._hold('skip', true));
    let t = 0, quiet = 0;
    this.lastStuck = null;
    while (t < maxSec) {
      const st = await this.ev((c) => {
        const top = __qa.top();
        if (top === 'ChoiceScene') { const s = G.Scenes.top(); s.list.idx = Math.min(c, s.list.items.length - 1); G.Input._press('ok'); }
        if (top === 'BattleScene') { G.state.vars.autoBattle = true; G.Scenes.top().auto = true; }
        if (top === 'GameOverScene') return 'gameover';
        if (top === 'ShopScene') { const s = G.Scenes.top(); s.mode = 'menu'; s.menu.idx = 2; G.Input._press('ok'); }
        if (top === 'MenuScene' || top === 'SaveScene' || top === 'SettingsScene' || top === 'WorldMapScene') G.Input._press('cancel');
        else if (!['MapScene', 'DialogScene', 'ChoiceScene', 'BattleScene', 'ShopScene', 'NarrateScene', 'TravelScene', 'BacklogScene'].includes(top)) G.Input._press('ok'); // tutorials, title cards, minigames…
        return G.Script.busy() || top !== 'MapScene' ? 'busy' : 'idle';
      }, choice);
      if (st === 'idle') break;
      if (st === 'gameover') { await this.ev(() => G.Input._hold('skip', false)); return 'gameover'; }
      // soft-lock detector: a script is running but nothing is on screen to wait for (no dialogue, choice,
      // battle, fade, tween-driven overlay) and the camera/actors are idle for 15 game-seconds
      const silent = await this.ev(() => __qa.top() === 'MapScene' && G.Script.busy() && G.Render.fade.a < 0.99 &&
        !G.mapScene.player.moving && G.mapScene.followers.every((f) => !f.moving) && G.mapScene.npcs.every((n) => !n.moving));
      quiet = silent ? quiet + 0.5 : 0;
      if (quiet >= 15) {
        this.lastStuck = await this.ev(() => ({ queues: [G.mapScene.player, ...G.mapScene.followers, ...G.mapScene.npcs].filter((a) => a.queue.length || a.onArrive).map((a) => `${a.id}(queue ${a.queue.length}${a.onArrive ? ', awaiting arrival' : ''})`) }));
        await this.ev(() => G.Input._hold('skip', false));
        return 'stuck';
      }
      await this.ff(0.5);
      t += 0.5;
    }
    await this.ev(() => G.Input._hold('skip', false));
    return t >= maxSec ? 'timeout' : 'idle';
  }
  // Wait until no script is running (G.Script.busy() false) — real time, no input.
  async waitIdle(timeout = 10000) {
    await this.page.waitForFunction(() => !G.Script.busy(), null, { timeout }).catch(() => { throw new Error('script still busy after ' + timeout + 'ms'); });
  }
  // Press Z (real key events) while a dialogue box is open; returns the number of presses.
  async advanceDialogs(max = 200) {
    let n = 0;
    while (n < max && (await this.ev(() => G.Dialog.isOpen()))) { await this.key('z'); await this.frames(2); n++; }
    if (n >= max) throw new Error(`dialogue still open after ${max} Z presses (stuck line?)`);
    return n;
  }
  async drainGameErrors() {
    if (!this.page) return;
    const e = await this.page.evaluate(() => { const r = __qa.errs.slice(); __qa.errs.length = 0; const le = G && G.lastError; if (G) G.lastError = null; return { r, le: le ? String(le.stack || le) : null }; }).catch(() => ({ r: [], le: null }));
    this.errors.push(...e.r);
    if (e.le && !e.r.some((x) => x.includes(e.le.split('\n')[0]))) this.errors.push('G.lastError: ' + e.le.slice(0, 1500));
  }
  // Pixel statistics of what the player actually sees (screenshot → composited 2D UI canvas + #game3d WebGL canvas).
  async screenStats() {
    const png = await this.page.screenshot({ type: 'png' });
    return this.page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let nonBlack = 0, n = 0, sum = 0, sum2 = 0;
      for (let i = 0; i < d.length; i += 4 * 97) { const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; n++; sum += l; sum2 += l * l; if (l > 12) nonBlack++; }
      const mean = sum / n;
      const g3 = document.getElementById('game3d');
      return { nonBlack: nonBlack / n, mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), has3d: !!g3, show3d: !!(g3 && g3.style.display !== 'none' && g3.offsetWidth > 0) };
    }, png.toString('base64'));
  }
  async autoplayOff() { return this.ev(() => !(G.Debug && G.Debug.autoplay) && !G.settings.autoAdvance); }
  realErrors() { return this.errors.filter((e) => !BOOT_KEYS.has(firstLines(e, 1))); }
  async shot(name) { if (SHOTS && this.page) await this.page.screenshot({ path: path.join(OUT, name.replace(/[^\w.-]+/g, '_') + '.png') }); }
}

// ------------------------------------------------------------------ test registry & runner
const results = [];
const BOOT_KEYS = new Set();
const perf = [];
const tests = [];
const test = (id, name, fn, o = {}) => tests.push({ id, name, fn, o });
class Skip extends Error {}
const skip = (why) => { throw new Skip(why); };
const assert = (c, msg) => { if (!c) throw new Error(msg); };
const firstLines = (s, n = 3) => String(s).split('\n').slice(0, n).join(' | ');

async function runTest(browser, t) {
  const s = new Session(browser);
  s.no3d = !!t.o.no3d;
  const t0 = Date.now();
  let status = 'pass', msg = '';
  const warnings = [];
  try {
    await Promise.race([t.fn(s, (w) => warnings.push(w)), new Promise((_, rej) => setTimeout(() => rej(new Error(`test timeout ${(t.o.timeout || 120000) * TSCALE}ms`)), (t.o.timeout || 120000) * TSCALE))]);
  } catch (e) {
    if (e instanceof Skip) { status = 'skip'; msg = e.message; } else { status = 'fail'; msg = e.message; }
  }
  if (status === 'pass' && s.page && !(await s.autoplayOff().catch(() => true))) { status = 'fail'; msg = 'G.Debug.autoplay / settings.autoAdvance got switched on during the test (input path not exercised)'; }
  await s.drainGameErrors().catch(() => {});
  // errors that already happen on a plain boot (e.g. a content script with a syntax error) are reported
  // once by the boot test, not by every other test
  const errs = s.errors.filter((e) => !(t.o.allowErrors && t.o.allowErrors.some((r) => r.test(e))) && (t.id === 'boot' || !BOOT_KEYS.has(firstLines(e, 1))));
  if (errs.length && status !== 'skip') { if (status === 'pass') { status = 'fail'; msg = `${errs.length} game error(s) logged`; } }
  await s.close();
  const r = { id: t.id, name: t.name, status, msg, ms: Date.now() - t0, errors: dedupe(errs), warnings: warnings.concat(dedupe(s.warnings).slice(0, 10)) };
  results.push(r);
  printResult(r);
  return r;
}
function dedupe(list) {
  const m = new Map();
  for (const e of list) { const k = firstLines(e, 2); m.set(k, (m.get(k) || 0) + 1); }
  return [...m].map(([k, n]) => (n > 1 ? `${k}  (×${n})` : k));
}
const tty = process.stdout.isTTY;
const C = tty ? { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' } : { g: '', r: '', y: '', d: '', b: '', x: '' };
function printResult(r) {
  const icon = r.status === 'pass' ? `${C.g}✓${C.x}` : r.status === 'skip' ? `${C.y}-${C.x}` : `${C.r}✗${C.x}`;
  console.log(`  ${icon} ${r.name} ${C.d}${(r.ms / 1000).toFixed(1)}s${C.x}${r.msg ? `  ${r.status === 'fail' ? C.r : C.y}${r.msg}${C.x}` : ''}`);
  for (const e of r.errors.slice(0, 6)) console.log(`      ${C.r}${e.slice(0, 400)}${C.x}`);
  if (r.errors.length > 6) console.log(`      … ${r.errors.length - 6} more`);
  for (const w of r.warnings.slice(0, 4)) console.log(`      ${C.y}warn: ${String(w).slice(0, 300)}${C.x}`);
}

// ------------------------------------------------------------------ helpers
const DEBUG_Q = (map, extra = '') => `?debug&map=${encodeURIComponent(map)}${/[?&]lv=/.test(extra) ? '' : '&lv=50'}${extra}`;
async function gameInfo(browser) {
  const s = new Session(browser);
  await s.open('');
  const info = await s.ev(() => ({
    maps: Object.keys(G.Maps.defs), troops: Object.keys(G.Data.troops || {}), story: !!(G.Story && G.Story.newGame), storyCh0: !!(G.Story && G.Story.ch0),
    world: !!G.World, items: Object.keys(G.Data.items || {}),
    bossTroops: Object.keys(G.Data.troops || {}).filter((k) => G.Data.troops[k].boss || G.Data.troops[k].flee === false),
    normalTroops: Object.keys(G.Data.troops || {}).filter((k) => !G.Data.troops[k].boss && G.Data.troops[k].flee !== false),
  }));
  await s.drainGameErrors();
  info.bootErrors = s.errors.slice();
  await s.close();
  return info;
}
function homeMap(info) { return info.maps.includes('sandbox') ? 'sandbox' : info.maps[0]; }
async function openOnMap(s, info, extra) {
  const m = homeMap(info);
  if (!m) skip('no maps defined');
  await s.open(DEBUG_Q(m, extra), { waitMap: true });
  await s.ev(() => { G.Audio.unlock = () => {}; });
  return m;
}


// ================================================================== real-keyboard tests
// Pure page.keyboard input, G.Debug.autoplay OFF, settings.autoAdvance OFF, no held Ctrl-skip, no
// _press/_hold hooks. ff() is used only to let game time pass (it never injects input).
async function pressAndSettle(s, k, n = 3) { await s.page.keyboard.press(k); await s.frames(n); }
// one "observable" of the dialogue/scene state; used to prove a key press actually changed something
const DLG_STATE = () => {
  const t = G.Scenes.top();
  return JSON.stringify({ top: __qa.top(), log: G.Dialog.log.length, page: t && t.page, shown: t && Math.floor(t.shown || 0), done: !!(t && t.done), idx: t && t.list && t.list.idx, line: t && t.idx });
};
function defineKeyTests(info) {
  test('key-dialog', 'REAL KEYS: dialogue single & multi-page advance with Z/Space/Enter; choices with arrows, Enter and X', async (s, warn) => {
    await openOnMap(s, info);
    assert(await s.autoplayOff(), 'autoplay is on');
    await s.ev(() => { G.settings.textSpeed = 2; });
    await s.script(`async (S) => {
      await S.say('baizhi:smile', '短句。');
      await S.say('xinghe', ${JSON.stringify('這是一段很長很長的對白，用來測試對話框的分頁功能是否正常運作。'.repeat(12))});
      const c1 = await S.choice(['甲', '乙', '丙']);
      const c2 = await S.choice(['留下', '離開'], { cancel: 1 });
      await S.say('', '結束。');
      return [c1, c2];
    }`);
    await s.page.waitForFunction(() => __qa.top() === 'DialogScene' && G.Scenes.top().text === '短句。', null, { timeout: 3000 * TSCALE });
    // single-page line: first press completes the typewriter (or advances if already complete), at most 2 presses
    let presses = 0;
    while ((await s.ev(() => G.Dialog.log.length && G.Dialog.log[G.Dialog.log.length - 1].text)) === '短句。' && presses < 4) { await pressAndSettle(s, 'z', 4); presses++; }
    assert(presses <= 2, `single-page line needed ${presses} Z presses (Z not advancing dialogue?)`);
    // multi-page line
    await s.page.waitForFunction(() => __qa.top() === 'DialogScene' && (G.Scenes.top().text || '').length > 100, null, { timeout: 3000 * TSCALE });
    const pages = await s.ev(() => (G.Scenes.top().pages || [0]).length);
    if (pages < 2) warn('long line did not paginate (pages=' + pages + ') — multi-page path not exercised');
    const keysCycle = ['z', 'Space', 'Enter'];
    presses = 0;
    let lastPage = -1, pagesSeen = 0;
    while ((await s.top()) === 'DialogScene' && presses < pages * 2 + 6) {
      const before = await s.ev(DLG_STATE);
      await pressAndSettle(s, keysCycle[presses % 3], 4);
      presses++;
      const after = await s.ev(DLG_STATE);
      assert(before !== after, `key '${keysCycle[(presses - 1) % 3]}' changed nothing on the dialogue (state ${before})`);
      const pg = await s.ev(() => G.Scenes.top().page);
      if (pg !== lastPage) { pagesSeen++; lastPage = pg; }
    }
    assert((await s.top()) === 'ChoiceScene', `multi-page line not finished after ${presses} presses (top ${await s.top()})`);
    if (pages > 1) assert(pagesSeen >= pages, `saw ${pagesSeen} of ${pages} pages`);
    // choice 1: Down, Down, Up → index 1, confirm with Enter; X must NOT cancel (no cancel option)
    await pressAndSettle(s, 'ArrowDown'); await pressAndSettle(s, 'ArrowDown'); await pressAndSettle(s, 'ArrowUp');
    assert((await s.ev(() => G.Scenes.top().list.idx)) === 1, 'arrow keys did not move the choice cursor');
    await pressAndSettle(s, 'x');
    assert((await s.top()) === 'ChoiceScene', 'X closed a choice that has no cancel option');
    await pressAndSettle(s, 'Enter');
    // choice 2: X cancels → index 1
    await s.page.waitForFunction(() => __qa.top() === 'ChoiceScene' && G.Scenes.top().options.length === 2, null, { timeout: 3000 * TSCALE });
    await pressAndSettle(s, 'x');
    await s.page.waitForFunction(() => __qa.top() === 'DialogScene', null, { timeout: 3000 * TSCALE });
    for (let i = 0; i < 4 && !(await s.ev(() => window.__qa.done)); i++) await pressAndSettle(s, 'z', 5);
    await s.page.waitForFunction(() => window.__qa.done, null, { timeout: 3000 * TSCALE }).catch(() => { throw new Error('final line not dismissed by Z'); });
    const res = await s.ev(() => window.__qa.res);
    assert(JSON.stringify(res) === '[1,1]', 'choice results ' + JSON.stringify(res));
    assert(await s.autoplayOff(), 'autoplay switched on');
  });

  test('key-battle', 'REAL KEYS: battle commands — attack (target cycling), skill, cancel, defend, item, speed key, victory with Z', async (s) => {
    await openOnMap(s, info, '&lv=20');
    const troop = info.normalTroops.find((t) => true);
    if (!troop) skip('no normal troop');
    const item = await s.ev(() => Object.keys(G.Data.items).find((k) => { const it = G.Data.items[k]; return it.type === 'use' && it.use && it.use.heal && it.use.target === 'ally' && it.use.battle !== false; }));
    await s.ev((it) => {
      G.state.vars.autoBattle = false; G.settings.battleSpeed = 2; G.state.inv = {}; if (it) G.Inv.add(it, 3);
      window.__qa.cmds = [];
      const orig = G.Battle.Scene.prototype.execute;
      if (!orig.__qa) { G.Battle.Scene.prototype.execute = function (u, cmd) { if (u.side === 'party') window.__qa.cmds.push(cmd.kind + (cmd.skill ? ':' + cmd.skill : '') + (cmd.item ? ':' + cmd.item : '')); return orig.call(this, u, cmd); }; G.Battle.Scene.prototype.execute.__qa = true; }
    }, item);
    await s.script(`async (S) => S.battle(${JSON.stringify(troop)})`);
    await s.waitTop('BattleScene', 5000 * TSCALE);
    // keep the fight going long enough to try every command (test setup, not input)
    await s.ev(() => { for (const e of G.Scenes.top().enemies) { e.hp = e.mhp = 999999; } });
    const waitUi = async () => {
      const ok = await s.ff(30, { until: 'G.Scenes.top().ui && G.Scenes.top().ui.mode === "main"', drawEvery: 2 });
      assert(ok, 'command menu never appeared (auto-battle on? top=' + (await s.top()) + ')');
      await s.frames(2);
    };
    const selectMain = async (k) => {
      const idx = await s.ev((kk) => G.Scenes.top().ui.main.items.findIndex((i) => i.k === kk), k);
      if (idx < 0) return false;
      for (let g = 0; g < 12 && (await s.ev(() => G.Scenes.top().ui.main.idx)) !== idx; g++) await pressAndSettle(s, 'ArrowDown', 2);
      assert((await s.ev(() => G.Scenes.top().ui.main.idx)) === idx, 'could not reach command ' + k);
      return !(await s.ev(() => G.Scenes.top().ui.main.cur.disabled));
    };
    const nCmds = () => s.ev(() => window.__qa.cmds.length);
    // speed key E cycles battleSpeed and persists it
    const sp0 = await s.ev(() => G.settings.battleSpeed);
    await pressAndSettle(s, 'e');
    const sp1 = await s.ev(() => G.settings.battleSpeed);
    assert(sp1 !== sp0, 'E did not change battle speed');
    for (let g = 0; g < 4 && (await s.ev(() => G.settings.battleSpeed)) !== sp0; g++) await pressAndSettle(s, 'e');
    // 1) attack: Z → target mode → Right cycles target → Z
    await waitUi();
    assert(await selectMain('attack'), 'attack disabled');
    await pressAndSettle(s, 'z');
    assert((await s.ev(() => G.Scenes.top().ui && G.Scenes.top().ui.mode)) === 'target', 'Z on 攻擊 did not open targeting');
    const tg0 = await s.ev(() => G.Scenes.top().ui.tg.i);
    await pressAndSettle(s, 'ArrowRight');
    const nTg = await s.ev(() => G.Scenes.top().ui.tg.pool.length);
    if (nTg > 1) assert((await s.ev(() => G.Scenes.top().ui.tg.i)) !== tg0, 'Right did not cycle the target');
    let c0 = await nCmds();
    await pressAndSettle(s, 'z');
    await s.ff(0.2);
    assert((await nCmds()) === c0 + 1 && (await s.ev(() => window.__qa.cmds.slice(-1)[0])) === 'attack', 'attack not executed: ' + (await s.ev(() => window.__qa.cmds)));
    // 2) cancel path: 仙術 → X back to main; then 防禦
    await waitUi();
    if (await selectMain('skill')) {
      await pressAndSettle(s, 'z');
      assert((await s.ev(() => G.Scenes.top().ui.mode)) === 'list', '仙術 did not open the skill list');
      await pressAndSettle(s, 'x');
      assert((await s.ev(() => G.Scenes.top().ui.mode)) === 'main', 'X did not return from the skill list');
    }
    assert(await selectMain('defend'), 'defend disabled');
    c0 = await nCmds();
    await pressAndSettle(s, 'z');
    await s.ff(0.2);
    assert((await s.ev(() => window.__qa.cmds.slice(-1)[0])) === 'defend' && (await nCmds()) === c0 + 1, 'defend not executed');
    // 3) skill: first affordable skill, confirm target(s)
    let usedSkill = false;
    for (let turn = 0; turn < 4 && !usedSkill; turn++) {
      await waitUi();
      if (!(await selectMain('skill'))) { await selectMain('defend'); await pressAndSettle(s, 'z'); continue; }
      await pressAndSettle(s, 'z');
      const en = await s.ev(() => G.Scenes.top().ui.list.items.findIndex((i) => !i.disabled));
      if (en < 0) { await pressAndSettle(s, 'x'); await selectMain('defend'); await pressAndSettle(s, 'z'); continue; }
      for (let g = 0; g < 20 && (await s.ev(() => G.Scenes.top().ui.list.idx)) !== en; g++) await pressAndSettle(s, 'ArrowDown', 2);
      const mp0 = await s.ev(() => G.Scenes.top().ui.u.mp);
      const sid = await s.ev(() => G.Scenes.top().ui.list.cur.id);
      await pressAndSettle(s, 'z'); // → target mode
      assert((await s.ev(() => G.Scenes.top().ui && G.Scenes.top().ui.mode)) === 'target', 'choosing a skill did not open targeting');
      await pressAndSettle(s, 'z');
      await s.ff(0.2);
      assert((await s.ev(() => window.__qa.cmds.slice(-1)[0])) === 'skill:' + sid, 'skill not executed: ' + (await s.ev(() => window.__qa.cmds.slice(-1)[0])));
      const mpCost = await s.ev((id) => G.Data.skills[id].mp, sid);
      if (mpCost > 0) { await s.ff(1.5); const mp1 = await s.ev(() => { const sc = G.Scenes.top(); return Math.min(...sc.party.map((p) => p.mp)); }); void mp1; void mp0; }
      usedSkill = true;
    }
    assert(usedSkill, 'never managed to cast a skill with real keys');
    // 4) item
    if (item) {
      await waitUi();
      assert(await selectMain('item'), '道具 disabled although the bag has ' + item);
      const cnt0 = await s.ev((it) => G.Inv.count(it), item);
      await pressAndSettle(s, 'z');
      const ii = await s.ev((it) => G.Scenes.top().ui.list.items.findIndex((x) => x.id === it), item);
      for (let g = 0; g < 20 && (await s.ev(() => G.Scenes.top().ui.list.idx)) !== ii; g++) await pressAndSettle(s, 'ArrowDown', 2);
      await pressAndSettle(s, 'z'); await pressAndSettle(s, 'z');
      await s.ff(1.5);
      assert((await s.ev((it) => G.Inv.count(it), item)) === cnt0 - 1, 'item not consumed by the 道具 command');
      assert((await s.ev(() => window.__qa.cmds.some((c) => c.startsWith('item:')))), 'item command not executed');
    }
    // 5) finish: make enemies fragile, attack with Z Z until victory, dismiss victory screens with Z only
    await s.ev(() => { for (const e of G.Scenes.top().enemies) { e.hp = 1; e.mhp = Math.max(1, e.d.hp); } });
    for (let i = 0; i < 40 && !(await s.ev(() => window.__qa.done)); i++) {
      const st = await s.ev(() => { const sc = G.Scenes.stack.find((x) => x instanceof G.Battle.Scene); return sc ? { ui: !!(sc.ui && sc.ui.mode === 'main'), wait: !!sc.keyWait } : null; });
      if (!st) break;
      if (st.ui) { await selectMain('attack'); await pressAndSettle(s, 'z'); await pressAndSettle(s, 'z'); }
      else if (st.wait) { await s.ff(1.0); await pressAndSettle(s, 'z', 4); }
      else await s.ff(0.5);
    }
    await s.ff(3, { until: 'window.__qa.done' });
    assert((await s.ev(() => window.__qa.res)) === 'win', 'battle did not end in a win via keyboard (res ' + (await s.ev(() => window.__qa.res)) + ', top ' + (await s.top()) + ')');
    assert((await s.top()) === 'MapScene', 'not back on the map');
    assert(await s.autoplayOff(), 'autoplay switched on');
  }, { timeout: 150000 * TSCALE });

  test('key-newgame', 'REAL KEYS: title → 新的旅程 → play the opening with Z/Enter/arrows only until the player has control', async (s, warn) => {
    await s.open('');
    await s.waitTop('TitleScene', 15000 * TSCALE);
    await s.frames(10);
    if ((await s.ev(() => G.Scenes.top().stage)) !== 'menu') await pressAndSettle(s, 'Space');
    const idx = await s.ev(() => G.Scenes.top().list.items.findIndex((i) => i.k === 'new'));
    for (let g = 0; g < 10 && (await s.ev(() => G.Scenes.top().list.idx)) !== idx; g++) await pressAndSettle(s, 'ArrowDown');
    await pressAndSettle(s, 'Enter');
    await s.page.waitForFunction(() => G.inGame && G.state.party.length > 0, null, { timeout: 10000 * TSCALE }).catch(() => { throw new Error('new game did not start'); });
    assert(await s.autoplayOff(), 'autoplay on');
    let presses = 0, noChange = 0, quiet = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const st = await s.ev(() => ({ top: __qa.top(), busy: G.Script.busy(), fade: G.Render.fade.a, moving: !!(G.mapScene && (G.mapScene.player.moving || G.mapScene.followers.some((f) => f.moving) || G.mapScene.npcs.some((n) => n.moving))) }));
      if (st.top === 'MapScene' && !st.busy && st.fade < 0.05) break; // player has control
      if (st.top === 'GameOverScene') throw new Error('opening led to a game over');
      if (st.top === 'MapScene' || st.fade >= 0.99) {
        // cutscene in progress with nothing to press: let time pass; a long silence is a soft-lock
        quiet = st.top === 'MapScene' && !st.moving ? quiet + 1 : 0;
        if (quiet > 60) throw new Error('soft-lock in the opening: script busy, nothing on screen, for ~15s');
        await s.page.waitForTimeout(250);
        continue;
      }
      quiet = 0;
      const before = await s.ev(DLG_STATE);
      if (st.top === 'BattleScene') {
        const b = await s.ev(() => { const sc = G.Scenes.top(); return { ui: sc.ui && sc.ui.mode, wait: !!sc.keyWait }; });
        if (b.ui === 'main' || b.ui === 'target') await pressAndSettle(s, 'z');
        else if (b.wait) await pressAndSettle(s, 'z');
        else await s.page.waitForTimeout(150);
        continue;
      }
      await pressAndSettle(s, st.top === 'ChoiceScene' ? 'Enter' : 'z', 4);
      presses++;
      const after = await s.ev(DLG_STATE);
      if (st.top === 'DialogScene' && before === after) {
        if (++noChange >= 4) throw new Error(`Z pressed 4× on the dialogue with no effect (${after}) — real-key advance broken`);
      } else noChange = 0;
      if (presses > 600) break;
    }
    const fin = await s.ev(() => ({ top: __qa.top(), busy: G.Script.busy(), map: G.mapScene && G.mapScene.def.id, log: G.Dialog.log.length }));
    if (fin.busy || fin.top !== 'MapScene') warn(`opening still running after ${presses} presses / 150s (top=${fin.top}, map=${fin.map})`);
    assert(fin.log > 0, 'no dialogue was shown in the opening');
    assert(await s.autoplayOff(), 'autoplay switched on');
  }, { timeout: 200000 * TSCALE });
}

// ================================================================== tests
function defineTests(info) {
  defineKeyTests(info);
  test('3d', '3D renderer: #game3d WebGL canvas coexists with the 2D UI canvas; maps render; menu/dialog still work', async (s, warn) => {
    if (!FORCE_3D) skip('3D renderer disabled for headless runs (software WebGL); run with --3d [--headed] on a GPU machine');
    const maps = info.maps.filter((m) => m !== 'sandbox').slice(0, 3).concat(info.maps.includes('sandbox') ? ['sandbox'] : []);
    for (const m of maps) {
      await s.open(DEBUG_Q(m), { waitMap: true });
      const st = await s.ev(() => ({ r3: !!G.R3, supported: !!(G.R3 && G.R3.supported && G.R3.supported()), enabled: !!(G.R3 && G.R3.enabled && G.R3.enabled()), canvas3: !!document.getElementById('game3d') }));
      if (!st.r3) skip('G.R3 not present');
      if (!st.supported) { warn('WebGL/THREE not available headless — 3D path not exercised'); return; }
      await s.frames(20);
      const cs = await s.screenStats();
      assert(cs.std > 2, `${m}: screen is flat with 3D ${st.enabled ? 'on' : 'off'} (std ${cs.std.toFixed(1)}, #game3d ${cs.show3d ? 'visible' : cs.has3d ? 'hidden' : 'absent'})`);
      await s.shot('3d_' + m);
      await s.drainGameErrors();
      if (s.realErrors().length) throw new Error(`errors rendering ${m} with the 3D renderer`);
    }
    // UI over 3D: pause menu opens/closes with real keys
    await pressAndSettle(s, 'Escape', 4);
    await s.waitTop('MenuScene', 5000 * TSCALE);
    await pressAndSettle(s, 'x', 4);
    await s.waitTop('MapScene', 5000 * TSCALE);
  }, { timeout: 240000 * TSCALE });

  test('boot', 'boot: page loads, title scene renders, no errors', async (s) => {
    await s.open('');
    await s.waitTop('TitleScene', 15000 * TSCALE);
    await s.page.waitForFunction(() => document.getElementById('boot').classList.contains('hide'), null, { timeout: 15000 * TSCALE });
    await s.frames(60);
    const cs = await s.screenStats();
    assert(cs.std > 3 && cs.nonBlack > 0.05, `title canvas looks empty (std ${cs.std.toFixed(1)}, nonBlack ${(cs.nonBlack * 100).toFixed(1)}%)`);
    const missing = await s.ev(() => ['Render', 'Input', 'Audio', 'Music', 'Scenes', 'Dialog', 'Script', 'Maps', 'Battle', 'Title', 'MenuScene', 'SaveScene', 'ShopScene', 'World', 'Sprites', 'Portraits', 'Backdrops', 'Monsters', 'Tiles', 'Objects', 'FX'].filter((k) => !G[k]));
    assert(!missing.length, 'global modules missing at runtime: G.' + missing.join(', G.'));
    await s.shot('title');
  });

  test('key-title', 'title: any key → menu; settings open/change/persist; back', async (s) => {
    await s.open('');
    await s.waitTop('TitleScene', 15000 * TSCALE);
    await s.frames(10);
    await s.key('Space');
    await s.page.waitForFunction(() => G.Scenes.top().stage === 'menu', null, { timeout: 3000 * TSCALE }).catch(() => { throw new Error('title did not switch to menu after a key press'); });
    // navigate to 設定
    const idx = await s.ev(() => G.Scenes.top().list.items.findIndex((i) => i.k === 'settings'));
    assert(idx >= 0, 'no settings entry in title menu');
    for (let g = 0; g < 10 && (await s.ev(() => G.Scenes.top().list.idx)) !== idx; g++) await s.key('ArrowDown');
    await s.key('z');
    await s.waitTop('SettingsScene', 3000 * TSCALE);
    const before = await s.ev(() => JSON.stringify(G.settings));
    // walk every row and press right then left (exercises every enum/volume), except the fullscreen action
    const rows = await s.ev(() => G.Scenes.top().rows.map((r) => ({ k: r.k, type: r.type })));
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].type !== 'action') { await s.key('ArrowRight'); }
      if (i < rows.length - 1) await s.key('ArrowDown');
    }
    const after = await s.ev(() => JSON.parse(localStorage.getItem('shorelight_settings') || '{}'));
    assert(JSON.stringify(after) !== '{}', 'settings not persisted to localStorage');
    const changed = await s.ev((b) => { const o = JSON.parse(b); return Object.keys(G.settings).filter((k) => JSON.stringify(G.settings[k]) !== JSON.stringify(o[k])); }, before);
    assert(changed.length >= 5, 'expected several settings to change, changed: ' + changed.join(','));
    await s.key('Escape');
    await s.waitTop('TitleScene', 3000 * TSCALE);
    // reload: settings survive
    const ts = await s.ev(() => G.settings.textSpeed);
    await s.open('');
    assert((await s.ev(() => G.settings.textSpeed)) === ts, 'textSpeed not restored after reload');
  });

  test('newgame', 'title: 新的旅程 starts the game (G.Story.newGame)', async (s, warn) => {
    await s.open('');
    await s.waitTop('TitleScene', 15000 * TSCALE);
    await s.key('Space');
    const idx = await s.ev(() => G.Scenes.top().list.items.findIndex((i) => i.k === 'new'));
    for (let g = 0; g < 10 && (await s.ev(() => G.Scenes.top().list.idx)) !== idx; g++) await s.key('ArrowDown');
    await s.key('Enter');
    if (!info.story) warn('G.Story.newGame does not exist — title falls back to joining xinghe on the first map');
    await s.page.waitForFunction(() => G.inGame && G.state.party.length > 0, null, { timeout: 10000 * TSCALE }).catch(() => { throw new Error('new game did not start (G.inGame / party)'); });
    const r = await s.drive(40);
    const st = await s.ev(() => ({ top: __qa.top(), map: G.mapScene && G.mapScene.def.id, party: G.state.party, chapter: G.state.chapter, busy: G.Script.busy() }));
    if (r === 'timeout') warn(`opening script still running after 40s of auto-advance (top=${st.top})`);
    assert(st.party.includes('xinghe'), 'xinghe not in party after new game');
    await s.shot('newgame');
  }, { timeout: 120000 * TSCALE });

  test('key-move', 'map: arrow keys move the player and update G.state.x/y', async (s) => {
    await openOnMap(s, info);
    const dirs = await s.ev(() => {
      const m = G.mapScene, p = m.player;
      return Object.entries(G.U.dirs).filter(([, [dx, dy]]) => !m.blocked(p.x + dx, p.y + dy, p)).map(([d]) => d);
    });
    assert(dirs.length, 'player is boxed in at the start position');
    const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    const d = dirs[0];
    const p0 = await s.ev(() => [G.state.x, G.state.y]);
    await s.key(key[d], 180);
    await s.page.waitForFunction(() => !G.mapScene.player.moving, null, { timeout: 3000 * TSCALE });
    const p1 = await s.ev(() => [G.state.x, G.state.y, G.mapScene.player.x, G.mapScene.player.y, G.state.dir]);
    assert(p1[0] !== p0[0] || p1[1] !== p0[1], `player did not move ${d} from ${p0}`);
    assert(p1[0] === p1[2] && p1[1] === p1[3], 'G.state.x/y out of sync with the player actor');
    assert(p1[4] === d, 'facing not updated');
    // run: hold shift + move back
    await s.page.keyboard.down('Shift');
    await s.key(key[G_opp(d)], 150);
    await s.page.keyboard.up('Shift');
    await s.page.waitForFunction(() => !G.mapScene.player.moving, null, { timeout: 3000 * TSCALE });
    // collision: walking into a wall does not move
    const blocked = await s.ev(() => { const m = G.mapScene, p = m.player; const e = Object.entries(G.U.dirs).find(([, [dx, dy]]) => m.blocked(p.x + dx, p.y + dy, p)); return e ? e[0] : null; });
    if (blocked) {
      const b0 = await s.ev(() => [G.state.x, G.state.y]);
      await s.key(key[blocked], 200);
      await s.frames(20);
      const b1 = await s.ev(() => [G.state.x, G.state.y]);
      assert(b0[0] === b1[0] && b0[1] === b1[1], `walked through a blocked cell (${blocked})`);
    }
  });

  test('key-menu', 'pause menu: open with Esc, visit every panel, close', async (s) => {
    await openOnMap(s, info);
    await s.ev(() => {
      // content for every panel
      for (const id of Object.keys(G.Data.items).slice(0, 40)) G.Inv.add(id, 2);
      for (const id of Object.keys(G.Data.enemies || {}).slice(0, 8)) G.state.bestiary[id] = 1;
      const q = Object.keys(G.Data.quests || {});
      if (q.length) { G.Quests.set(q[0], 0); if (q[1]) G.Quests.done(q[1]); } else G.Quests.set('qa_test_quest', 0);
      G.Lanterns.add('qa_l1', '測試之燈'); G.state.vars.objective = '測試目標';
      G.state.members[G.state.party[1] || G.state.party[0]].hp = 1;
    });
    await s.key('Escape');
    await s.waitTop('MenuScene', 3000 * TSCALE);
    const items = await s.ev(() => G.Scenes.top().items.map((i) => ({ k: i.k, disabled: !!i.disabled })));
    const visited = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      for (let g = 0; g < 20 && (await s.ev(() => G.Scenes.top().list.idx)) !== i; g++) await s.key('ArrowDown');
      assert((await s.ev(() => G.Scenes.top().list.idx)) === i, 'could not move cursor to ' + it.k);
      if (it.disabled) continue;
      await s.key('z');
      const k = it.k;
      const subName = await s.ev(() => { const t = G.Scenes.top(); return t.sub ? t.sub.constructor.name : __qa.top(); });
      if (['skills', 'equip', 'status'].includes(k)) {
        assert(subName === 'MemberPicker', `${k}: expected member picker, got ${subName}`);
        await s.key('ArrowDown'); await s.key('ArrowUp');
        await s.key('z');
        const panel = await s.ev(() => G.Scenes.top().sub && G.Scenes.top().sub.constructor.name);
        assert(/Panel$/.test(panel || ''), `${k}: no panel after picking a member (${panel})`);
        if (k === 'equip') {
          await s.key('z'); // slot → item list
          await s.key('ArrowDown');
          await s.frames(4);
          await s.key('x');
          await s.key('ArrowDown'); await s.key('z'); await s.key('x');
        }
        if (k === 'status') { await s.key('ArrowRight'); await s.key('ArrowLeft'); }
        if (k === 'skills') { await s.key('ArrowDown'); await s.frames(3); }
        await s.key('x');
      } else if (k === 'items') {
        await s.key('ArrowDown'); await s.key('ArrowRight'); await s.frames(3); await s.key('ArrowRight'); await s.frames(3); await s.key('ArrowLeft'); await s.key('ArrowLeft');
        await s.key('x');
      } else if (k === 'party') {
        await s.key('z'); await s.key('ArrowDown'); await s.key('z'); // swap 1 and 2
        await s.key('z'); await s.key('ArrowUp'); await s.key('z'); // swap back
        await s.key('x');
      } else if (['quests', 'lanterns', 'bestiary'].includes(k)) {
        await s.key('ArrowDown'); await s.frames(3); await s.key('x');
      } else if (['world', 'save', 'load', 'settings'].includes(k)) {
        const top = await s.top();
        assert(top !== 'MenuScene', `${k}: no scene opened (top still MenuScene)`);
        await s.frames(6);
        await s.key('x');
      } else if (k === 'title') {
        assert((await s.top()) === 'ChoiceScene', 'title: expected confirmation choice');
        await s.key('x');
      } else {
        await s.frames(4); await s.key('x');
      }
      await s.frames(3);
      const st = await s.ev(() => ({ top: __qa.top(), sub: G.Scenes.top().sub ? G.Scenes.top().sub.constructor.name : null }));
      assert(st.top === 'MenuScene' && !st.sub, `after visiting '${k}' expected to be back on the menu, got top=${st.top} sub=${st.sub}`);
      await s.drainGameErrors();
      if (s.realErrors().length) throw new Error(`errors while visiting menu panel '${k}'`);
      visited.push(k);
    }
    await s.key('x');
    await s.waitTop('MapScene', 3000 * TSCALE);
    assert(visited.length >= 8, 'visited only ' + visited.join(','));
  }, { timeout: 120000 * TSCALE });

  test('key-saveload', 'save to slot 1 via menu, mutate, load it back, state matches', async (s) => {
    await openOnMap(s, info);
    await s.ev(() => { G.state.gold = 4321; G.state.flags.qa_saved = true; G.Inv.add(Object.keys(G.Data.items)[0], 3); });
    const goMenu = async (k) => {
      await s.key('Escape'); await s.waitTop('MenuScene', 3000 * TSCALE);
      const idx = await s.ev((kk) => G.Scenes.top().items.findIndex((i) => i.k === kk), k);
      assert(idx >= 0, 'menu has no ' + k);
      for (let g = 0; g < 20 && (await s.ev(() => G.Scenes.top().list.idx)) !== idx; g++) await s.key('ArrowDown');
      await s.key('z');
      await s.waitTop('SaveScene', 3000 * TSCALE);
    };
    await goMenu('save');
    assert((await s.ev(() => G.Scenes.top().slots[G.Scenes.top().idx])) === 1, 'save cursor not on slot 1');
    await s.key('z');
    await s.frames(3);
    const saved = await s.ev(() => { const d = JSON.parse(localStorage.getItem(G.Save.key(1)) || 'null'); return d && d.state; });
    assert(saved, 'slot 1 not written');
    assert(saved.gold === 4321 && saved.flags.qa_saved, 'saved state does not contain the current gold/flags');
    const meta = await s.ev(() => G.Save.meta(1));
    assert(meta && meta.party && meta.party.length, 'save meta missing party');
    await s.key('x'); await s.key('x');
    await s.waitTop('MapScene', 3000 * TSCALE);
    await s.ev(() => { G.state.gold = 1; G.state.flags.qa_saved = false; G.state.x += 0; });
    await goMenu('load');
    const want = await s.ev(() => G.Scenes.top().slots.indexOf(1));
    for (let g = 0; g < 12 && (await s.ev(() => G.Scenes.top().idx)) !== want; g++) await s.key((await s.ev(() => G.Scenes.top().idx)) < want ? 'ArrowDown' : 'ArrowUp');
    await s.key('z');
    await s.page.waitForFunction(() => __qa.top() === 'MapScene' && G.state.gold === 4321, null, { timeout: 5000 * TSCALE }).catch(() => { throw new Error('load did not restore gold / return to map'); });
    const now = await s.ev(() => G.state);
    const strip = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.playtime; return c; };
    const a = JSON.stringify(strip(saved)), b = JSON.stringify(strip(now));
    assert(a === b, 'loaded state differs from the saved state');
  });

  test('key-continue', 'menu 回標題 → title → 繼續旅程 resumes the latest save', async (s) => {
    const m = await openOnMap(s, info);
    await s.ev(() => { G.state.gold = 2468; G.Save.write(3, null); });
    await s.key('Escape'); await s.waitTop('MenuScene', 3000 * TSCALE);
    const idx = await s.ev(() => G.Scenes.top().items.findIndex((i) => i.k === 'title'));
    for (let g = 0; g < 20 && (await s.ev(() => G.Scenes.top().list.idx)) !== idx; g++) await s.key('ArrowDown');
    await s.key('z');
    assert((await s.top()) === 'ChoiceScene', 'no confirmation for 回標題');
    await s.key('z'); // 回到標題畫面
    await s.waitTop('TitleScene', 5000 * TSCALE);
    assert(!(await s.ev(() => G.inGame)), 'G.inGame still true on the title screen');
    // with a running AudioContext the title skips 'press any key' and opens the menu directly
    if ((await s.ev(() => G.Scenes.top().stage)) !== 'menu') await s.key('Space');
    await s.page.waitForFunction(() => G.Scenes.top().stage === 'menu', null, { timeout: 3000 * TSCALE });
    const cur = await s.ev(() => G.Scenes.top().list.cur.k);
    assert(cur === 'continue', `title cursor should default to 繼續旅程 when saves exist (on ${cur})`);
    await s.key('z');
    await s.page.waitForFunction(() => G.mapScene && G.Scenes.has(G.mapScene) && G.inGame, null, { timeout: 5000 * TSCALE }).catch(() => { throw new Error('continue did not load a map'); });
    const r = await s.ev(() => ({ gold: G.state.gold, map: G.mapScene.def.id }));
    assert(r.gold === 2468 && r.map === m, 'continue did not restore the latest save: ' + JSON.stringify(r));
  });

  test('key-dialog-script','dialogue: say/choice/narrate/lines advance with Z, choice index returned, backlog opens', async (s) => {
    await openOnMap(s, info);
    await s.script(`async (S) => {
      await S.say('baizhi:smile', '第一句。');
      await S.say('', '第二句，沒有說話者。');
      await S.lines(['甲', ['xinghe:think', '乙'], { who: 'hongying', text: '丙' }]);
      const c = await S.choice(['選項一', '選項二', '選項三']);
      await S.narrate(['旁白一', '旁白二']);
      return c;
    }`);
    await s.page.waitForFunction(() => G.Dialog.isOpen(), null, { timeout: 3000 * TSCALE });
    await s.frames(5);
    await s.key('l');
    assert((await s.top()) === 'BacklogScene', 'L did not open the backlog');
    await s.key('ArrowUp'); await s.key('x');
    assert((await s.top()) === 'DialogScene', 'backlog did not return to the dialogue');
    let presses = 0;
    while ((await s.top()) !== 'ChoiceScene' && presses < 30) { await s.key('z'); await s.frames(3); presses++; }
    assert((await s.top()) === 'ChoiceScene', 'choice did not appear after the 5 lines');
    assert(presses >= 5, `only ${presses} presses to get through 5 lines (lines skipped?)`);
    const seen = await s.ev(() => G.Dialog.log.slice(-5).map((l) => l.name + ':' + l.text));
    assert(seen.length === 5 && seen[0].endsWith('第一句。') && seen[4].endsWith('丙'), 'dialogue log order wrong: ' + seen.join(' / '));
    await s.key('ArrowDown');
    await s.key('z');
    await s.page.waitForFunction(() => __qa.top() === 'NarrateScene', null, { timeout: 3000 * TSCALE });
    for (let i = 0; i < 6 && (await s.ev(() => !window.__qa.done)); i++) { await s.ff(1.0); await s.key('z'); }
    await s.ff(1.5);
    assert(await s.ev(() => window.__qa.done), 'script did not finish');
    assert((await s.ev(() => window.__qa.res)) === 1, 'choice should return index 1');
    const log = await s.ev(() => G.Dialog.log.slice(-5).map((l) => l.text));
    assert(log.includes('丙'), 'backlog missing lines');
    assert((await s.top()) === 'MapScene' && !(await s.ev(() => G.Script.busy())), 'not back to idle map');
  });

  test('key-shop', 'shop: buy ×2 and sell ×1 update gold and inventory; leave resolves', async (s) => {
    await openOnMap(s, info);
    const goods = await s.ev(() => Object.keys(G.Data.items).filter((k) => G.Data.items[k].price > 0 && G.Data.items[k].type === 'use').slice(0, 6));
    assert(goods.length, 'no buyable items');
    await s.ev(() => { G.state.gold = 10000; G.state.inv = {}; });
    await s.script(`async (S) => { await S.shop(${JSON.stringify(goods)}, { title: 'QA' }); return 'closed'; }`);
    await s.waitTop('ShopScene', 3000 * TSCALE);
    const g0 = await s.ev(() => G.state.gold);
    const price = await s.ev((id) => G.Data.items[id].price, goods[0]);
    await s.key('z'); // 購買
    await s.key('z'); // first item → qty
    await s.key('ArrowRight'); // qty 2
    await s.key('z'); // buy
    const after = await s.ev((id) => ({ gold: G.state.gold, n: G.Inv.count(id) }), goods[0]);
    assert(after.n === 2, `bought count ${after.n}, expected 2`);
    assert(after.gold === g0 - price * 2, `gold ${after.gold}, expected ${g0 - price * 2}`);
    await s.key('x'); // back to menu
    await s.key('ArrowDown'); await s.key('z'); // 販賣
    await s.key('z'); await s.key('z'); // first sellable, qty 1, sell
    const sold = await s.ev((id) => ({ gold: G.state.gold, n: G.Inv.count(id) }), goods[0]);
    assert(sold.n === 1, `after selling count ${sold.n}, expected 1`);
    assert(sold.gold === after.gold + Math.floor(price / 2), `sell price wrong: gold ${sold.gold}`);
    await s.key('x');
    await s.key('ArrowDown'); // 離開
    await s.key('z');
    await s.ff(0.5);
    assert(await s.ev(() => window.__qa.done && window.__qa.res === 'closed'), 'S.shop promise did not resolve on 離開');
    // invalid ids are filtered rather than crashing
    await s.script(`async (S) => { await S.shop(['__no_such_item__', ${JSON.stringify(goods[0])}]); return 'ok'; }`);
    await s.waitTop('ShopScene', 3000 * TSCALE);
    assert((await s.ev(() => G.Scenes.top().goods.length)) === 1, 'unknown shop items should be filtered');
    await s.key('x');
    await s.ff(0.5);
  });

  test('inn', 'inn: pay, fade, heal party; refuse when poor', async (s) => {
    await openOnMap(s, info);
    await s.ev(() => { G.state.gold = 100; for (const id of G.state.party) G.state.members[id].hp = 1; });
    await s.script(`async (S) => S.inn(30)`);
    await s.page.waitForFunction(() => __qa.top() === 'ChoiceScene', null, { timeout: 3000 * TSCALE });
    await s.key('z');
    await s.ff(6, { until: 'window.__qa.done' });
    const r = await s.ev(() => ({ res: window.__qa.res, gold: G.state.gold, full: G.state.party.every((id) => G.state.members[id].hp === G.Party.stats(id).mhp), fade: G.Render.fade.a }));
    assert(r.res === true && r.gold === 70 && r.full, 'inn did not charge/heal: ' + JSON.stringify(r));
    assert(r.fade < 0.05, 'screen left faded out after inn');
    await s.ev(() => { G.state.gold = 5; });
    await s.script(`async (S) => S.inn(30)`);
    await s.page.waitForFunction(() => __qa.top() === 'ChoiceScene', null, { timeout: 3000 * TSCALE });
    await s.key('z');
    await s.drive(10);
    assert((await s.ev(() => window.__qa.res)) === false, 'inn should refuse when gold is insufficient');
  });

  test('key-flee', 'battle: flee succeeds from a normal troop; refused against a boss', async (s) => {
    await openOnMap(s, info);
    if (!info.normalTroops.length) skip('no normal troops');
    const troop = info.normalTroops[0];
    await s.ev(() => { G.state.vars.autoBattle = false; G.settings.battleSpeed = 3; });
    await s.script(`async (S) => S.battle(${JSON.stringify(troop)})`);
    await s.waitTop('BattleScene', 5000 * TSCALE);
    let res;
    for (let turn = 0; turn < 30; turn++) {
      await s.ff(20, { until: '(G.Scenes.top().ui && G.Scenes.top().ui.mode === "main") || window.__qa.done' });
      if (await s.ev(() => window.__qa.done)) break;
      const n = await s.ev(() => G.Scenes.top().ui.main.items.length);
      const fi = await s.ev(() => G.Scenes.top().ui.main.items.findIndex((i) => i.k === 'flee'));
      assert(fi >= 0, 'no 逃跑 command');
      for (let g = 0; g < n && (await s.ev(() => G.Scenes.top().ui && G.Scenes.top().ui.main.idx)) !== fi; g++) await s.key('ArrowUp');
      await s.key('z');
    }
    await s.ff(10, { until: 'window.__qa.done' });
    res = await s.ev(() => window.__qa.res);
    assert(res === 'flee', `expected flee result, got ${res}`);
    assert((await s.top()) === 'MapScene', 'not back on the map after fleeing');
    const bad = await s.ev(() => __qa.numericSanity()); assert(!bad.length, 'state corrupted: ' + bad.join(', '));
    // boss: flee refused
    if (!info.bossTroops.length) return;
    const boss = info.bossTroops[0];
    await s.script(`async (S) => S.battle(${JSON.stringify(boss)})`);
    await s.waitTop('BattleScene', 5000 * TSCALE);
    await s.ff(20, { until: 'G.Scenes.top().ui && G.Scenes.top().ui.mode === "main"' });
    await s.ev(() => G.Scenes.top().ui.done({ kind: 'flee' }));
    await s.ff(3);
    const r2 = await s.ev(() => ({ top: __qa.top(), result: G.Scenes.top().result || null }));
    assert(r2.top === 'BattleScene' && r2.result !== 'flee', 'fled from a boss battle');
  }, { timeout: 120000 * TSCALE });

  test('key-gameover', 'battle: defeat → GameOver scene → 重新挑戰 restores state and the retry can be won', async (s) => {
    await openOnMap(s, info);
    if (!info.troops.length) skip('no troops');
    const troop = info.normalTroops[0] || info.troops[0];
    const hpBefore = await s.ev(() => G.state.party.map((id) => G.state.members[id].hp));
    await s.ev(() => { G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; });
    await s.script(`async (S) => S.battle(${JSON.stringify(troop)})`);
    await s.waitTop('BattleScene', 5000 * TSCALE);
    await s.ff(0.05); // battle intro waits 0.9s/battleSpeed before the first turn — wipe the party before anyone acts
    await s.ev(() => { const sc = G.Scenes.top(); for (const p of sc.party) if (!p.dead) sc.damage(p, 1e7, {}); });
    const go = await s.ff(30, { until: '__qa.top() === "GameOverScene"' });
    assert(go, 'GameOverScene did not appear after the party was wiped (top=' + (await s.top()) + ')');
    await s.shot('gameover');
    const items = await s.ev(() => G.Scenes.top().list.items.map((i) => i.k));
    assert(items[0] === 'retry', 'first game-over option is not retry: ' + items.join(','));
    await s.ff(1.5);
    await s.key('z');
    await s.waitTop('BattleScene', 5000 * TSCALE);
    const hpRetry = await s.ev(() => G.state.party.map((id) => G.state.members[id].hp));
    assert(JSON.stringify(hpRetry) === JSON.stringify(hpBefore), 'retry did not restore the pre-battle party state');
    await s.ev(() => G.Input._hold('skip', true));
    await s.ff(400, { until: 'window.__qa.done' });
    await s.ev(() => G.Input._hold('skip', false));
    const r = await s.ev(() => ({ res: window.__qa.res, top: __qa.top() }));
    assert(r.res === 'win', `retry battle result ${r.res} (top ${r.top})`);
  }, { timeout: 150000 * TSCALE });

  test('world', 'world map: G.World.travel animation resolves; viewer opens/closes', async (s) => {
    await openOnMap(s, info);
    if (!info.world) throw new Error('G.World is undefined (js/engine/worldmap.js not loaded) — menu 地圖 and S.travel will crash');
    const places = await s.ev(() => Object.keys(G.World.PLACES));
    await s.script(`async (S) => { await S.travel(${JSON.stringify(places[0])}, ${JSON.stringify(places[2] || places[1])}); return 'arrived'; }`);
    await s.waitTop('TravelScene', 3000 * TSCALE);
    await s.shot('travel');
    await s.ff(8, { until: 'window.__qa.done' });
    assert(await s.ev(() => window.__qa.res === 'arrived'), 'travel did not resolve');
    assert(await s.ev((p) => G.World.visited(p), places[2] || places[1]), 'destination not marked visited');
    await s.ev(() => G.Scenes.push(new G.WorldMapScene()));
    await s.frames(5);
    await s.key('x');
    await s.waitTop('MapScene', 3000 * TSCALE);
  });

  test('warp', 'S.warp: same-map reposition, fade restored, autosave written', async (s) => {
    const m = await openOnMap(s, info);
    const target = await s.ev(() => { const ms = G.mapScene; for (let y = 0; y < ms.h; y++) for (let x = 0; x < ms.w; x++) if (!ms.solid[y * ms.w + x] && (x !== ms.player.x || y !== ms.player.y)) return [x, y]; return null; });
    assert(target, 'no free cell to warp to');
    await s.script(`async (S) => { await S.warp(${JSON.stringify(m)}, ${target[0]}, ${target[1]}, 'down'); return 1; }`);
    await s.ff(3, { until: 'window.__qa.done' });
    const r = await s.ev(() => ({ x: G.state.x, y: G.state.y, px: G.mapScene.player.x, fade: G.Render.fade.a, auto: G.Save.exists(0) }));
    assert(r.x === target[0] && r.y === target[1] && r.px === target[0], 'player not at warp target: ' + JSON.stringify(r));
    assert(r.fade < 0.05, 'screen still faded after warp');
    assert(r.auto, 'autosave (slot 0) not written after warp');
  });

  test('encounter', 'map: touching a roaming enemy starts a battle; winning removes it', async (s) => {
    await openOnMap(s, info);
    const e = await s.ev(() => { const en = G.mapScene.enemies[0]; return en ? { x: en.x, y: en.y, troop: en.def.troop } : null; });
    if (!e) skip('home map has no roaming enemies');
    await s.ev(() => { G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; const m = G.mapScene, en = m.enemies[0]; en.def.chase = 0; m.player.setCell(en.x, en.y); m.invuln = 0; });
    const started = await s.ff(3, { until: '__qa.top() === "BattleScene"' });
    assert(started, 'battle did not start on contact');
    await s.ev(() => G.Input._hold('skip', true));
    await s.ff(400, { until: '__qa.top() === "MapScene" && !G.Script.busy()' });
    await s.ev(() => G.Input._hold('skip', false));
    const n = await s.ev(() => G.mapScene.enemies.length);
    assert((await s.top()) === 'MapScene', 'did not return to map');
    assert(n === 0 || (await s.ev((t) => !G.mapScene.enemies.some((x) => x.def.troop === t && x.x === 0), e.troop)), 'defeated roaming enemy still on the map');
  }, { timeout: 120000 * TSCALE });
}

// ------------------------------------------------------------------ sweeps (parallel)
async function pool(items, n, fn) {
  const queue = items.slice();
  const run = async () => { while (queue.length) { const it = queue.shift(); await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

async function mapSweep(browser, info) {
  const maps = MAPS || info.maps;
  console.log(`\n${C.b}Map sweep${C.x} (${maps.length} maps, ?debug&map=<id>)`);
  await pool(maps, WORKERS, async (mid) => {
    await runTest(browser, {
      id: 'map:' + mid, name: `map ${mid}: loads, renders, NPC dialogue & events run`, o: { timeout: 900000, no3d: true },
      fn: async (s, warn) => {
        await s.open(DEBUG_Q(mid), { waitMap: true, timeout: 30000 });
        const id = await s.ev(() => G.mapScene.def.id);
        assert(id === mid, `debug map param ignored (on '${id}')`);
        await s.frames(30);
        const cs = await s.screenStats();
        assert(cs.std > 2, `map renders as a flat colour on screen (std ${cs.std.toFixed(1)}, mean ${cs.mean.toFixed(0)}, #game3d ${cs.has3d ? (cs.show3d ? 'visible' : 'hidden') : 'absent'})`);
        const raf = await s.ev(() => __qa.rafAvg(60));
        await s.ev(() => __qa.frameCost(30)); // warm caches (first-use pre-rendering)
        const cost = await s.ev(() => __qa.frameCost(40));
        perf.push({ map: mid, rafAvg: +raf.avg.toFixed(2), rafMax: +raf.max.toFixed(1), cpuAvg: +cost.avg.toFixed(2), cpuP95: +cost.p95.toFixed(2) });
        if (cost.avg > SLOW_FRAME_MS) warn(`slow: update+draw averages ${cost.avg.toFixed(1)}ms/frame (p95 ${cost.p95.toFixed(1)}ms) > ${SLOW_FRAME_MS}ms`);
        await s.shot('map_' + mid);
        await s.drainGameErrors();
        if (s.realErrors().length) throw new Error('errors while loading/rendering the map');
        // talk to every NPC (each in turn, from the current state)
        const auto = await s.drive(90);
        if (auto === 'stuck') throw new Error(`soft-lock: map-entry script busy with nothing on screen for 15s (actors: ${s.lastStuck.queues.join(', ') || 'none'})`);
        if (auto === 'timeout') warn('auto events on map entry did not finish within 90s of auto-advance');
        if (auto === 'gameover' || !(await s.ev((m) => G.mapScene && G.mapScene.def.id === m, mid))) { warn('map-entry script left the map; NPC checks use a fresh load'); await s.open(DEBUG_Q(mid), { waitMap: true }); }
        const npcs = await s.ev(() => G.mapScene.npcs.filter((n) => n.talk || (n.def && n.def.talk)).map((n) => n.id));
        await s.ev(() => { G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; });
        for (const nid of npcs) {
          await s.ev((n) => { const m = G.mapScene; const a = m.actor(n); if (!a) return; const p = m.player; m.interactTarget = { kind: 'npc', npc: a }; p.dir = 'down'; m.doInteract(); }, nid);
          const r = await s.drive(40);
          if (r === 'stuck') throw new Error(`soft-lock talking to npc '${nid}': script busy with nothing on screen for 15s (actors: ${s.lastStuck.queues.join(', ') || 'none'})`);
          if (r === 'timeout') warn(`npc ${nid}: talk script did not finish within 40s (top=${await s.top()})`);
          if (r === 'gameover') { warn(`npc ${nid}: talk led to a game over`); await s.open(DEBUG_Q(mid), { waitMap: true }); }
          if (!(await s.ev((m) => G.mapScene && G.mapScene.def.id === m, mid))) await s.open(DEBUG_Q(mid), { waitMap: true });
          await s.drainGameErrors();
          if (s.realErrors().length) throw new Error(`errors while talking to npc '${nid}'`);
        }
        // run every action/touch/auto event once on a fresh load
        const evs = await s.ev(() => (G.mapScene.def.events || []).map((e, i) => ({ i, trig: e.trigger, id: e.id || `${e.x},${e.y}` })));
        if (evs.length) await s.open(DEBUG_Q(mid), { waitMap: true });
        for (const ev of evs) {
          await s.ev((i) => { const m = G.mapScene; const e = m.def.events[i]; if (e && m.eventOk(e)) m.runEvent(e); }, ev.i);
          const r = await s.drive(60);
          if (r === 'stuck') throw new Error(`soft-lock in event '${ev.id}': script busy with nothing on screen for 15s (actors: ${s.lastStuck.queues.join(', ') || 'none'})`);
          if (r === 'timeout') warn(`event ${ev.id} (${ev.trig}): script did not finish within 60s (top=${await s.top()})`);
          if (r === 'gameover' || !(await s.ev((m) => G.mapScene && G.mapScene.def.id === m, mid).catch(() => false))) await s.open(DEBUG_Q(mid), { waitMap: true });
          await s.drainGameErrors();
          if (s.realErrors().length) throw new Error(`errors while running event '${ev.id}'`);
        }
        const bad = await s.ev(() => __qa.numericSanity());
        assert(!bad.length, 'state corrupted: ' + bad.join(', '));
      },
    });
  });
}

async function battleSweep(browser, info) {
  let troops = info.troops;
  if (TROOP_LIMIT) troops = troops.slice(0, TROOP_LIMIT);
  console.log(`\n${C.b}Battle sweep${C.x} (${troops.length} troops, auto-battle, party lv 50, battleSpeed 3)`);
  const chunks = [];
  const per = Math.ceil(troops.length / WORKERS);
  for (let i = 0; i < troops.length; i += per) chunks.push(troops.slice(i, i + per));
  const stats = [];
  const lost = [];
  await pool(chunks, WORKERS, async (chunk) => {
    const s = new Session(browser);
    s.no3d = true;
    const fresh = async () => {
      await openOnMap(s, info);
      await s.ev(() => {
        G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; G.Input._hold('skip', true);
        // give every member the strongest gear they can wear (debug party starts with chapter-1 equipment)
        const score = (it) => Object.values(it.stats || {}).reduce((a, v) => a + v, 0) + (it.price || 0) / 1000;
        for (const id of G.state.party) for (const slot of ['weapon', 'armor', 'head', 'feet', 'acc']) {
          const best = Object.keys(G.Data.items).filter((k) => G.Data.items[k].type === slot && G.Party.canEquip(id, k)).sort((a, b) => score(G.Data.items[b]) - score(G.Data.items[a]))[0];
          if (best) { G.Inv.add(best, 1); G.Party.equip(id, slot, best); }
        }
        G.Party.healAll();
      });
    };
    await fresh();
    for (const troop of chunk) {
      const t0 = Date.now();
      let status = 'pass', msg = '';
      s.errors = []; s.warnings = [];
      try {
        await s.ev(() => { G.Party.healAll(); for (const id of G.state.party) G.state.members[id].gauge = 0; });
        await s.script(`async (S) => S.battle(${JSON.stringify(troop)})`);
        const ok = await s.ff(900, { until: 'window.__qa.done || __qa.top() === "GameOverScene"', drawEvery: 5 });
        const r = await s.ev(() => {
          const sc = G.Scenes.stack.find((x) => G.Battle && x instanceof G.Battle.Scene);
          return { done: window.__qa.done, res: window.__qa.res, top: __qa.top(), busy: G.Script.busy(),
            enemies: sc ? sc.enemies.map((e) => `${e.id}:${e.hp}/${e.mhp}${e.dead ? '†' : ''}`) : null, party: sc ? sc.party.map((p) => `${p.id}:${p.hp}`) : null, playtime: G.state.playtime };
        });
        if (r.top === 'GameOverScene') {
          // a loss is a valid resolution; check the game-over screen is usable, then reload for the next troop
          const go = await s.ev(() => ({ items: G.Scenes.top().list.items.map((i) => i.k) }));
          if (!go.items.includes('retry')) { status = 'fail'; msg = 'GameOver without a retry option'; } else { msg = 'lose'; lost.push(troop); }
          await fresh();
        }
        else if (!ok || !r.done) { status = 'fail'; msg = `did not resolve within 900 game-seconds (top=${r.top}; enemies ${r.enemies}; party ${r.party})`; await fresh(); }
        else if (!['win', 'lose', 'flee'].includes(r.res)) { status = 'fail'; msg = 'unexpected result ' + r.res; }
        else {
          const after = await s.ev(() => ({ top: __qa.top(), bad: __qa.numericSanity(), fade: G.Render.fade.a }));
          if (after.top !== 'MapScene') { status = 'fail'; msg = 'not back on the map: ' + after.top; await fresh(); }
          else if (after.bad.length) { status = 'fail'; msg = 'state corrupted: ' + after.bad.join(', '); }
          else if (after.fade > 0.05) { status = 'fail'; msg = 'screen left faded out'; }
          else msg = r.res;
        }
      } catch (e) { status = 'fail'; msg = e.message; await fresh().catch(() => {}); }
      await s.drainGameErrors();
      if (s.realErrors().length && status === 'pass') { status = 'fail'; msg = `${s.realErrors().length} game error(s) logged`; }
      const r = { id: 'battle:' + troop, name: `battle ${troop}`, status, msg: status === 'pass' ? '' : msg, ms: Date.now() - t0, errors: dedupe(s.realErrors()), warnings: [] };
      results.push(r); stats.push({ troop, result: msg, ms: r.ms });
      if (status !== 'pass') printResult(r);
    }
    await s.close();
  });
  const bt = results.filter((r) => r.id.startsWith('battle:'));
  if (lost.length) console.log(`  ${C.y}balance note: a lv50 party with the best available gear LOST (auto-battle) to: ${lost.join(', ')}${C.x}`);
  console.log(`  ${C.g}${bt.filter((r) => r.status === 'pass').length} passed${C.x}, ${bt.filter((r) => r.status === 'fail').length ? C.r : ''}${bt.filter((r) => r.status === 'fail').length} failed${C.x}  ${C.d}(avg ${(bt.reduce((a, r) => a + r.ms, 0) / Math.max(1, bt.length) / 1000).toFixed(1)}s per battle)${C.x}`);
}

function G_opp(d) { return { up: 'down', down: 'up', left: 'right', right: 'left' }[d]; }

// ------------------------------------------------------------------ main
(async function main() {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: !HEADED });
  let info;
  try { info = await gameInfo(browser); } catch (e) { console.error('Could not boot the game at all:', e.message); await browser.close(); process.exit(2); }
  console.log(`${C.b}Shorelight e2e${C.x}  ${info.maps.length} maps, ${info.troops.length} troops, story:${info.story}, world:${info.world}`);
  if (info.bootErrors.length) { console.log(`${C.r}errors during plain boot:${C.x}`); for (const e of dedupe(info.bootErrors).slice(0, 8)) console.log('   ' + e.slice(0, 400)); }
  for (const e of info.bootErrors) BOOT_KEYS.add(firstLines(e, 1));
  defineTests(info);
  const sel = (id) => !ONLY || ONLY.some((o) => id.includes(o));
  console.log(`\n${C.b}Scenario tests${C.x}`);
  for (const t of tests) if (sel(t.id)) await runTest(browser, t);
  if (!NO_SWEEP) {
    if (sel('map')) await mapSweep(browser, info);
    if (sel('battle')) await battleSweep(browser, info);
  }
  await browser.close();
  // perf table
  if (perf.length) {
    console.log(`\n${C.b}Frame cost per map${C.x} (update+draw CPU ms after warm-up, headless Chromium software raster, ${WORKERS} parallel worker(s) — use --workers 1 for clean numbers; rAF interval)`);
    perf.sort((a, b) => b.cpuAvg - a.cpuAvg);
    for (const p of perf.slice(0, 25)) console.log(`  ${p.cpuAvg > SLOW_FRAME_MS ? C.y : ''}${p.map.padEnd(24)} cpu avg ${String(p.cpuAvg).padStart(6)}  p95 ${String(p.cpuP95).padStart(6)}   rAF ${String(p.rafAvg).padStart(6)} (max ${p.rafMax})${C.x}`);
  }
  const pass = results.filter((r) => r.status === 'pass').length, fail = results.filter((r) => r.status === 'fail').length, sk = results.filter((r) => r.status === 'skip').length;
  fs.writeFileSync(path.join(OUT, 'e2e-report.json'), JSON.stringify({ when: new Date().toISOString(), pass, fail, skip: sk, results, perf, bootErrors: info.bootErrors }, null, 1));
  console.log(`\n${fail ? C.r : C.g}${C.b}e2e: ${pass} passed, ${fail} failed, ${sk} skipped${C.x}  (${((Date.now() - t0) / 1000).toFixed(0)}s; report tools/test/out/e2e-report.json)`);
  process.exit(fail ? 1 : 0);
})();

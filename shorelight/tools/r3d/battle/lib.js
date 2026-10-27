// Shared Playwright helpers for the battle 3D tests (tools/r3d/battle/*.js).
// The game runs from file://…/index.html?debug&battle=<troop>; SwiftShader is slow, so everything waits on game state.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../../..');

async function open(opts = {}) {
  const q = ['debug', `battle=${opts.troop || 'shore_5'}`, `lv=${opts.lv || 20}`];
  if (opts.lite !== false) q.push('r3lite');
  if (opts.auto) q.push('auto=1');
  if (opts.party) q.push('party=' + opts.party);
  if (opts.extra) q.push(opts.extra);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)); if (opts.verbose && m.type() !== 'debug') console.log('[page]', m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + (e.stack || e.message).slice(0, 600)));
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?' + q.join('&'), { waitUntil: 'load', timeout: 180000 });
  return { browser, page, errors };
}
// wait until the battle scene with its 3D view is up
async function waitBattle(page, timeout = 300000) {
  await page.waitForFunction(() => window.G && G.Battle3D && G.Battle3D.current && G.Scenes.top() && G.Scenes.top().view3d, null, { timeout, polling: 200 });
}
const sc = (page, fn, arg) => page.evaluate(fn, arg);
async function until(page, fn, arg, timeout = 240000) { await page.waitForFunction(fn, arg, { timeout, polling: 60 }); }
// wait until `rt` (view real-time) has advanced by sec
async function hold(page, sec, timeout = 240000) {
  const t0 = await page.evaluate(() => G.Battle3D.current ? G.Battle3D.current.rt : 0);
  await until(page, (t) => !G.Battle3D.current || G.Battle3D.current.rt >= t, t0 + sec, timeout);
}
async function shot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, name + '.png');
  await page.screenshot({ path: f });
  console.log('shot', f);
  return f;
}
// issue a command for the party member whose CommandUI is open: {kind, skill?, targets:[indices into enemies|party]}
async function command(page, cmd) {
  await until(page, () => { const s = G.Scenes.top(); return s && s.ui && s.ui.mode === 'main'; });
  await page.evaluate((c) => {
    const s = G.Scenes.top(), u = s.ui.u;
    const pool = c.allies ? s.party : s.alive('enemy');
    const targets = c.all ? pool.filter((x) => !x.dead || c.allies) : (c.targets || [0]).map((i) => pool[i]).filter(Boolean);
    if (c.kind === 'ultimate') u.gauge = 100;
    const out = Object.assign({}, c, { targets });
    delete out.all; delete out.allies;
    s.ui.done(out);
  }, cmd);
}
module.exports = { open, waitBattle, sc, until, hold, shot, command, ROOT };
// wait for the next view event of kind k, scanning from a persistent cursor (events that fired while we were busy
// taking a screenshot are not missed); returns the event and moves the cursor past it
async function nextEvent(page, k, timeout = 240000, filter = null) {
  const h = await page.waitForFunction(([k, f]) => {
    const v = G.Battle3D.current; if (!v) return null;
    if (window.__evView !== v) { window.__evView = v; window.__evCur = 0; }
    const list = v.events;
    for (let i = window.__evCur; i < list.length; i++) {
      const x = list[i];
      if (x.k === k && (!f || Object.keys(f).every((q) => x[q] === f[q]))) { window.__evCur = i + 1; return x; }
    }
    return null;
  }, [k, filter], { timeout, polling: 30 });
  return h.jsonValue();
}
// skip everything logged so far
async function skipEvents(page) { await page.evaluate(() => { const v = G.Battle3D.current; window.__evView = v; window.__evCur = v ? v.events.length : 0; }); }
async function atRt(page, rt, timeout = 240000) { await until(page, (t) => !G.Battle3D.current || G.Battle3D.current.rt >= t, rt, timeout); }
// wait for the player's command menu (enemy turns in between run on their own)
async function waitCommand(page, timeout = 300000) { await until(page, () => { const s = G.Scenes.top(); return s && s.ui && s.ui.mode === 'main'; }, null, timeout); }
module.exports.nextEvent = nextEvent;
module.exports.skipEvents = skipEvents;
module.exports.atRt = atRt;
module.exports.waitCommand = waitCommand;

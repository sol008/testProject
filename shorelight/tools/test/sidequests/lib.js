// Shared driver for the side-quest playthroughs (tools/test/sidequests/chN.side.js).
//
// The point of these scripts is to play side quests the way a player can: no quest flags, items, stages or vars are
// ever written by the test. The only help is the one every chapter test uses: the shared battle bot on easy
// (tools/test/lib/battlebot.js), G.Debug.autoplay (dialogue advances, choices come from a queue) and, before a boss,
// raising the party to the level the boss was balanced for (logged).
//
// Movement: `goTo(s, x, y)` finds a path with a BFS over the real collision (G.mapScene.blocked) and walks it one tile
// at a time with G.Debug.stepOn, so every touch event / warp on the way fires exactly as for a walking player. Cells
// with warps or touch events are avoided unless they are the target. `interact(s, x, y)` walks next to a cell, faces
// it and presses the real Z key (MapScene.findInteract → the same NPC / event / object a player would hit).
// `talkTo(s, npcId)` does the same for an NPC wherever it stands now.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
const BAD_WARN = /unknown|missing|not found|no actor|not registered|undefined|Script error/i;

const assert = (c, msg) => { if (!c) throw new Error(msg); };

async function session(browser, query, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: 'zh-TW', deviceScaleFactor: 1 });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
  const page = await ctx.newPage();
  const errors = [];
  const use3d = /r3lite/.test(query);
  await page.addInitScript((d3) => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: d3, lang: 'zh' })); } catch (e) { /* ignore */ } }, use3d);
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
    page, errors, log: [],
    ev: (fn, arg) => page.evaluate(fn, arg),
    async idle(ms = 180000) {
      const ok = await page.evaluate((t) => G.Debug.idle(t), ms);
      if (ok === 'gameover') throw new Error('Game Over');
      assert(ok, 'timed out waiting for the map to become idle; ' + JSON.stringify(await page.evaluate(() => ({
        stack: G.Scenes.stack.map((x) => (x.constructor && x.constructor.name) || '?'), map: G.mapScene && G.mapScene.def.id,
        last: G.Dialog.log.slice(-3).map((l) => l.name + '：' + l.text), dbg: G.Debug.log.slice(-3) }))));
    },
    flags: () => page.evaluate(() => Object.assign({}, G.state.flags)),
    map: () => page.evaluate(() => G.mapScene && G.mapScene.def.id),
    pos: () => page.evaluate(() => [G.mapScene.player.x, G.mapScene.player.y]),
    stage: (q) => page.evaluate((q) => (G.Quests.isDone(q) ? 'done' : G.Quests.stage(q)), q),
    count: (id) => page.evaluate((id) => G.Inv.count(id), id),
    lantern: (id) => page.evaluate((id) => !!G.state.lanterns[id], id),
    async shot(dir, name) { if (dir) { fs.mkdirSync(dir, { recursive: true }); await page.waitForTimeout(250); await page.screenshot({ path: path.join(dir, name + '.png'), timeout: 180000 }); } },
    async gameErrors() {
      const le = await page.evaluate(() => { const e = G.lastError; G.lastError = null; return e ? String(e.stack || e) : null; }).catch(() => null);
      if (le) errors.push('G.lastError: ' + le.slice(0, 600));
      return errors;
    },
    close: () => ctx.close(),
  };
  if (opts.noEncounters !== false) await page.evaluate(() => { window.__calm = true; });
  return s;
}

// last N dialogue lines (for clue checks)
const said = (s, n = 400) => s.ev((n) => G.Dialog.log.slice(-n).map((l) => (l.name || '') + '：' + l.text).join('\n'), n);
// G.Dialog.log keeps the last 200 lines only: a wrapped push counts every line ever said (window.__said)
const hookLog = (s) => s.ev(() => {
  const log = G.Dialog.log;
  if (log.__hooked) return;
  log.__hooked = true; window.__said = [];
  const push = log.push;
  log.push = function (...a) { for (const l of a) window.__said.push((l.name || '') + '：' + l.text); return push.apply(this, a); };
});
const logLen = async (s) => { await hookLog(s); return s.ev(() => window.__said.length); };
const saidSince = async (s, n0) => { await hookLog(s); return s.ev((n0) => window.__said.slice(n0).join('\n'), n0); };

async function waitMap(s, id, ms = 90000) {
  await s.page.waitForFunction((m) => G.mapScene && G.mapScene.def.id === m, id, { timeout: ms });
  await s.idle();
  await s.page.waitForTimeout(250);
  await s.idle();
}
// roaming enemies are removed so that the walk is deterministic (they are not part of any side quest here)
const calm = (s) => s.ev(() => { if (G.mapScene && window.__calm) G.mapScene.enemies = G.mapScene.enemies.filter((e) => e.def && e.def.keep); });

// BFS from the player to `goal` (array of [x,y]) over the engine's collision; avoids warp / touch-event cells that are
// not goals. Returns the list of cells (excluding the start) or null.
function bfsInPage(goals, opts) {
  const m = G.mapScene, p = m.player;
  const key = (x, y) => y * m.w + x;
  const goalSet = new Set(goals.map(([x, y]) => key(x, y)));
  const avoid = new Set();
  if (!opts.through) {
    for (const w of m.def.warps || []) for (let dx = 0; dx < (w.w || 1); dx++) for (let dy = 0; dy < (w.h || 1); dy++) avoid.add(key(w.x + dx, w.y + dy));
    for (const e of m.def.events || []) {
      if (e.trigger !== 'touch' || !m.eventOk(e)) continue;
      for (let dx = 0; dx < (e.w || 1); dx++) for (let dy = 0; dy < (e.h || 1); dy++) avoid.add(key(e.x + dx, e.y + dy));
    }
  }
  const prev = new Map([[key(p.x, p.y), null]]);
  const q = [[p.x, p.y]];
  while (q.length) {
    const [x, y] = q.shift();
    if (goalSet.has(key(x, y)) && !(x === p.x && y === p.y)) {
      const out = []; let k = key(x, y);
      while (k !== key(p.x, p.y)) { out.unshift([k % m.w, Math.floor(k / m.w)]); k = prev.get(k); }
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (prev.has(k) || m.blocked(nx, ny, p)) continue;
      if (avoid.has(k) && !goalSet.has(k)) continue;
      prev.set(k, key(x, y));
      q.push([nx, ny]);
    }
  }
  return null;
}

// walk to (x,y). Returns true when the player stands there (or the map changed because the target was a warp).
async function goTo(s, x, y, o = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await s.idle(); await calm(s);
    const mapId = await s.map();
    const [px, py] = await s.pos();
    if (px === x && py === y) return true;
    const pathCells = await s.ev(([g, o, src]) => { const f = new Function('return ' + src)(); return f(g, o) || f(g, Object.assign({}, o, { through: true })); }, [[[x, y]], o, bfsInPage.toString()]);
    if (!pathCells) throw new Error(`no path to (${x},${y}) on ${mapId} from (${px},${py})`);
    let broke = false;
    for (const [cx, cy] of pathCells) {
      await s.ev(([cx, cy]) => G.Debug.stepOn(cx, cy), [cx, cy]);
      await s.page.waitForTimeout(20);
      const busy = await s.ev(() => G.Script.busy() || !G.Debug.idleNow());
      if (busy) await s.idle();
      if ((await s.map()) !== mapId) return true;
      const [nx, ny] = await s.pos();
      if (nx !== cx || ny !== cy) { broke = true; break; }   // pushed back / moved by a script
    }
    if (!broke) return true;
    if (o.once) return false;
  }
  return false;
}
// walk next to (x,y), face it, press Z
async function interact(s, x, y, choices = [], o = {}) {
  await s.idle(); await calm(s);
  // next to the cell, or two cells away across a shop counter (MapScene.findInteract talks across counters)
  const adj = [[x, y + 1, 'up'], [x - 1, y, 'right'], [x + 1, y, 'left'], [x, y - 1, 'down']];
  if (o.counter) adj.push([x, y + 2, 'up'], [x - 2, y, 'right'], [x + 2, y, 'left'], [x, y - 2, 'down']);
  const pathCells = await s.ev(([g, o, src]) => { const f = new Function('return ' + src)(); return f(g, o) || f(g, Object.assign({}, o, { through: true })); }, [adj.map(([a, b]) => [a, b]), o, bfsInPage.toString()]);
  const [px, py] = await s.pos();
  let stand = adj.find(([a, b]) => a === px && b === py);
  if (!stand) {
    if (!pathCells) throw new Error(`cannot reach a cell next to (${x},${y}) on ${await s.map()}`);
    const last = pathCells[pathCells.length - 1];
    await goTo(s, last[0], last[1], o);
    const [qx, qy] = await s.pos();
    stand = adj.find(([a, b]) => a === qx && b === qy);
    if (!stand) throw new Error(`walk to (${x},${y}) interrupted at (${qx},${qy})`);
  }
  await s.ev(([d, ch]) => { G.mapScene.player.dir = d; G.state.dir = d; G.Debug.choices = ch.slice(); }, [stand[2], choices]);
  await s.page.waitForTimeout(80);
  const target = await s.ev(() => { const it = G.mapScene.findInteract(); return it ? (it.kind + ':' + (it.npc ? it.npc.id : it.ev ? it.ev.id : it.obj ? it.obj.t : '')) : null; });
  if (!target) throw new Error(`nothing to interact with at (${x},${y}) on ${await s.map()}`);
  await s.page.keyboard.press('z');
  await s.page.waitForTimeout(150);
  await s.idle();
  return target;
}
async function talkTo(s, npcId, choices = []) {
  // wandering NPCs may step away while we walk up: re-target like a player would (a few tries)
  let last = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    await s.idle(); await calm(s);
    await s.page.waitForFunction((id) => { const n = G.mapScene.npcs.find((x) => x.id === id && x.visible); return !n || !n.moving; }, npcId, { timeout: 5000 }).catch(() => {});
    const p = await s.ev((id) => { const n = G.mapScene.npcs.find((x) => x.id === id && x.visible); return n ? [n.x, n.y] : null; }, npcId);
    if (!p) throw new Error(`NPC ${npcId} is not on ${await s.map()}`);
    try {
      let r;
      try { r = await interact(s, p[0], p[1], choices); } catch (e) { if (!/cannot reach/.test(e.message)) throw e; r = await interact(s, p[0], p[1], choices, { counter: true }); }
      if (r.startsWith('npc:' + npcId)) return;
      last = new Error(`talked to ${r} instead of ${npcId}`);
      if (!r.startsWith('npc:')) throw last;   // an event or object ran instead: a real problem
    } catch (e) {
      if (!/nothing to interact/.test(e.message)) throw e;
      last = e;
    }
  }
  throw last;
}
// walk onto the warp of the current map that leads to `toMap` (the first one, or the one nearest to `near`)
async function warpTo(s, toMap, near) {
  await s.idle();
  const cell = await s.ev(([to, near]) => {
    const p = G.mapScene.player;
    const ws = (G.mapScene.def.warps || []).filter((w) => w.to === to && (!w.if || w.if(G.state)));
    const ref = near || [p.x, p.y];
    ws.sort((a, b) => Math.abs(a.x - ref[0]) + Math.abs(a.y - ref[1]) - Math.abs(b.x - ref[0]) - Math.abs(b.y - ref[1]));
    return ws.length ? [ws[0].x, ws[0].y] : null;
  }, [toMap, near || null]);
  if (!cell) throw new Error(`no warp to ${toMap} on ${await s.map()}`);
  await goTo(s, cell[0], cell[1]);
  await waitMap(s, toMap);
}
// an action event by id: walk to it and press Z
async function actEvent(s, id, choices = [], o = {}) {
  const e = await s.ev((id) => { const e = (G.mapScene.def.events || []).find((x) => x.id === id); return e ? [e.x, e.y, e.w || 1, e.h || 1] : null; }, id);
  if (!e) throw new Error(`no event ${id} on ${await s.map()}`);
  const cells = o.at ? [o.at] : [];
  if (!o.at) for (let dy = 0; dy < e[3]; dy++) for (let dx = 0; dx < e[2]; dx++) cells.push([e[0] + dx, e[1] + dy]);
  let r = null, err = null;
  for (const [x, y] of cells) {
    try { r = await interact(s, x, y, choices, o); break; } catch (ex) { if (!/cannot reach/.test(ex.message)) throw ex; err = ex; }
  }
  if (!r) throw err;
  if (!o.any && r !== 'event:' + id) throw new Error(`pressed Z on ${r} instead of event ${id}`);
  return r;
}

// let game time pass while the player stands still (the same update calls as the main loop; e2e.js Session.ff)
const ff = (s, sec, until) => s.ev(async ([sec, until]) => {
  const dt = 0.05, stop = until ? new Function('return (' + until + ')') : null;
  for (let i = 0; i < sec / dt; i++) {
    G.time += dt; G.Input.update(dt); G.Timers.update(dt); G.Tweens.update(dt); G.Scenes.update(dt); G.Input.endFrame();
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
    if (stop && stop()) return true;
  }
  return false;
}, [sec, until || null]);
// eat an item from the 物品 menu: what MenuScene does for a `use.vision` item (js/engine/menu.js)
const eatVision = (s, id = 'lingxun') => s.ev((id) => {
  const it = G.Data.items[id];
  if (!G.Inv.has(id) || !it.use || !it.use.vision) throw new Error('cannot eat ' + id);
  G.Inv.remove(id, 1); G.Script.S.vision(Math.round(it.use.vision * 0.25));
}, id);
const level = (s, lv, why) => s.ev(([lv]) => { for (const id of G.state.party) G.Story.ensureLevel(id, lv); G.Party.healAll(); }, [lv]).then(() => s.log.push(`level ${lv}: ${why}`));

async function run(results, name, browser, fn) {
  const t0 = Date.now();
  let s = null, status = 'PASS', msg = '';
  try {
    s = await fn(browser, (q) => session(browser, q).then((x) => (s = x)));
  } catch (e) { status = 'FAIL'; msg = e.message; }
  if (s) {
    const errs = await s.gameErrors();
    if (errs.length && status === 'PASS') { status = 'FAIL'; msg = errs.length + ' game error(s)'; }
    if (errs.length) msg += '\n      ' + [...new Set(errs)].slice(0, 8).join('\n      ');
    for (const l of s.log) msg += '\n      · ' + l;
    await s.close().catch(() => {});
  }
  results.push({ name, status, msg });
  console.log(`${status} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)${msg ? '  ' + msg : ''}`);
}

module.exports = { ROOT, BASE, assert, ff, eatVision, session, waitMap, calm, goTo, interact, talkTo, warpTo, actEvent, level, run, said, logLen, saidSince };

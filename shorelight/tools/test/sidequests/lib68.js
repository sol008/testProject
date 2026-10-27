// Shared driver for the side-quest playthroughs (tools/test/sidequests/chN.side.js).
//
// The point of these scripts is to play each side quest the way a player can, so the helpers here do NOT set quest
// flags, items or stages. They only:
//   · walk: a breadth-first path over the real map collision (G.MapScene.blocked, warps avoided) must exist from where
//     the player stands; the player is then stepped along it cell by cell (G.Debug.stepOn), so touch events on the
//     way fire exactly as they would for a walking player, and walking stops as soon as a script starts;
//   · talk / act: walk next to the NPC / action spot, face it and press the action key through the engine's own
//     findInteract() + doInteract() — an NPC that is hidden, inactive (spirit without 靈視) or behind a wall fails;
//   · clue(): reports whether an action spot can be noticed (hint tag, an object on or next to it, an NPC there).
// Dialogue auto-advances (G.Debug.autoplay); choices are answered from G.Debug.choices (index or substring).
// Battles are fought by tools/test/lib/battlebot.js (the policy the bosses were balanced against).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');

const INIT = (render3d) => {
  try {
    const s = JSON.parse(localStorage.getItem('shorelight_settings') || '{}');
    s.lang = 'zh';
    s.render3d = !!render3d;
    localStorage.setItem('shorelight_settings', JSON.stringify(s));
  } catch (e) { /* ignore */ }
  window.__qa = {
    errs: [],
    async ff(sec) {
      const dt = 0.05, steps = Math.ceil(sec / dt);
      const ch = new MessageChannel();
      const y = () => new Promise((r) => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
      for (let i = 0; i < steps; i++) {
        try {
          G.time += dt;
          G.Input.update(dt); G.Timers.update(dt); G.Tweens.update(dt); G.Render.updateFx(dt); G.UI.updateToasts(dt);
          G.Scenes.update(dt);
          if (G.state && G.inGame) G.state.playtime += dt;
          if (i % 6 === 0) { G.Render.begin(); G.ctx.fillStyle = '#000'; G.ctx.fillRect(0, 0, G.W, G.H); G.Scenes.draw(G.ctx); G.UI.drawToasts(G.ctx); G.Render.drawOverlays(); }
          G.Input.endFrame();
        } catch (e) { G.lastError = e; this.errs.push('ff: ' + (e && e.stack || e)); if (this.errs.length > 40) return; }
        await y();
      }
    },
    idle() { const t = G.Scenes.top(); return !G.Script.busy() && t === G.mapScene && G.Render.fade.a < 0.05 && !(G.Debug.pendingAuto && G.Debug.pendingAuto()); },
    top() {
      const t = G.Scenes.top();
      if (!t) return null;
      if (G.GameOverScene && t instanceof G.GameOverScene) return 'GameOverScene';
      if (G.Battle && t instanceof G.Battle.Scene) return 'BattleScene';
      return (t.constructor && t.constructor.name) || 'anonymous';
    },
    warpCell(m, x, y) { return (m.def.warps || []).some((w) => (!w.if || w.if(G.state)) && x >= w.x && x < w.x + (w.w || 1) && y >= w.y && y < w.y + (w.h || 1)); },
    // shortest path (list of [x,y], excluding the start) from the player to any goal cell; null if none
    bfs(goals) {
      const m = G.mapScene, p = m.player, W = m.w, H = m.h;
      const key = (x, y) => y * W + x;
      const goal = new Set(goals.map(([x, y]) => key(x, y)));
      const prev = new Map([[key(p.x, p.y), -1]]);
      const q = [[p.x, p.y]];
      while (q.length) {
        const [x, y] = q.shift();
        const k = key(x, y);
        if (goal.has(k)) {
          const out = [];
          for (let c = k; c !== key(p.x, p.y); c = prev.get(c)) out.unshift([c % W, Math.floor(c / W)]);
          return out;
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, nk = key(nx, ny);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(nk)) continue;
          const isGoal = goal.has(nk);
          if (m.blocked(nx, ny, p) && !(isGoal && !m.solid[nk])) continue;
          if (!isGoal && this.warpCell(m, nx, ny)) continue;
          prev.set(nk, k);
          q.push([nx, ny]);
        }
      }
      return null;
    },
    // what would let a player notice this action spot
    clue(x, y, w = 1, h = 1) {
      const m = G.mapScene, out = [];
      for (const e of m.def.events || []) {
        if (e.trigger !== 'action' || !m.eventOk(e)) continue;
        if (x < e.x + (e.w || 1) && x + w > e.x && y < e.y + (e.h || 1) && y + h > e.y && e.hint && (typeof e.hint !== 'function' || e.hint(G.state))) out.push('hint:' + (e.label || ''));
      }
      for (const o of m.objects) {
        if (!m.objActive(o)) continue;
        const d = G.Objects.get(o.t), ow = o.w || (d ? d.w : 1), oh = o.h || (d ? d.h : 1);
        if (o.x <= x + w && o.x + ow >= x && o.y <= y + h && o.y + oh >= y) out.push('obj:' + o.t);
      }
      for (const n of m.npcs) if (n.visible && m.npcActive(n) && Math.abs(n.x - x) + Math.abs(n.y - y) <= 1) out.push('npc:' + n.id);
      return out;
    },
  };
  window.addEventListener('error', (e) => window.__qa.errs.push('onerror: ' + (e.error && e.error.stack || e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__qa.errs.push('unhandled: ' + (e.reason && e.reason.stack || e.reason)));
  const iv = setInterval(() => { if (window.G && G.Debug && G.Debug.setAutoplay) { G.Debug.setAutoplay(true); clearInterval(iv); } }, 2);
};

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/, /AudioContext/, /GL Driver Message/, /GPU stall/, /THREE\.WebGL/];

class Session {
  constructor(browser, opts = {}) { this.browser = browser; this.errors = []; this.notes = []; this.log = []; this.r3d = !!opts.render3d; }
  async open(query) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await this.ctx.addInitScript(INIT, this.r3d);
    await this.ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
    this.page = await this.ctx.newPage();
    this.page.setDefaultTimeout(900000);
    this.page.on('console', (m) => {
      const t = m.text();
      if (IGNORE.some((r) => r.test(t))) return;
      if (m.type() === 'error') this.errors.push('console.error: ' + t.slice(0, 500));
      else if (m.type() === 'warning' && /missing|\[shorelight\]/i.test(t)) this.errors.push('warning: ' + t.slice(0, 300));
    });
    this.page.on('pageerror', (e) => this.errors.push('pageerror: ' + (e.stack || e.message).slice(0, 600)));
    await this.page.goto(BASE + query + (this.r3d ? '&r3lite' : ''));
    await this.page.waitForFunction(() => window.G && G.Scenes && G.Scenes.top(), null, { timeout: 300000 });
    await this.until('G.mapScene && G.mapScene.def && G.Scenes.top() === G.mapScene', 600);
    await this.idle();
  }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  ff(sec) { return this.page.evaluate((s) => __qa.ff(s), sec); }
  async until(cond, maxSec = 120, step = 0.5) {
    const f = typeof cond === 'string' ? cond : `(${cond})()`;
    for (let t = 0; t <= maxSec; t += step) {
      const ok = await this.page.evaluate((c) => { try { return !!eval(c); } catch (e) { return false; } }, f);
      if (ok) return true;
      if (await this.ev(() => __qa.top()) === 'GameOverScene') throw new Error('Game Over while waiting for: ' + f);
      await this.ff(step);
    }
    throw new Error(`timeout (${maxSec}s game time) waiting for: ${f}; top=${await this.ev(() => __qa.top())} map=${await this.map()}`);
  }
  async idle(maxSec = 900) { await this.ff(0.3); await this.until('__qa.idle()', maxSec); }
  map() { return this.ev(() => G.mapScene && G.mapScene.def && G.mapScene.def.id); }
  pos() { return this.ev(() => [G.mapScene.player.x, G.mapScene.player.y]); }
  flag(k) { return this.ev((k) => G.state.flags[k], k); }
  stage(q) { return this.ev((q) => G.Quests.stage(q), q); }
  done(q) { return this.ev((q) => G.Quests.isDone(q), q); }
  lit(id) { return this.ev((id) => G.Lanterns.has(id), id); }
  item(id) { return this.ev((id) => G.state.inv[id] || 0, id); }
  note(s) { this.log.push(s); }
  choose(c) { return this.ev((c) => { G.Debug.choices = c || []; }, c); }
  // walk to (x,y) — or to one of `goals` — along a real path; stops early (and waits) if a script starts on the way
  async walk(goals, why = '') {
    if (!Array.isArray(goals[0])) goals = [goals];
    const m0 = await this.map();
    const p = await this.ev((g) => __qa.bfs(g), goals);
    if (!p) throw new Error(`no walkable path on ${m0} from ${JSON.stringify(await this.pos())} to ${JSON.stringify(goals)} ${why}`);
    for (const [x, y] of p) {
      const r = await this.ev(([x, y]) => { G.Debug.stepOn(x, y); return G.Script.busy() || G.Scenes.top() !== G.mapScene; }, [x, y]);
      if (r) { await this.idle(); return 'event'; }
    }
    await this.idle();
    return 'arrived';
  }
  // stand next to a cell, face it and press the action key (real findInteract → doInteract)
  async press(x, y, w = 1, h = 1, expect = null) {
    const adj = [];
    for (let i = 0; i < w; i++) { adj.push([x + i, y - 1, 'down'], [x + i, y + h, 'up']); }
    for (let j = 0; j < h; j++) { adj.push([x - 1, y + j, 'right'], [x + w, y + j, 'left']); }
    const ok = await this.ev((a) => a.filter(([ax, ay]) => !G.mapScene.blocked(ax, ay, G.mapScene.player) || (G.mapScene.player.x === ax && G.mapScene.player.y === ay)), adj);
    if (!ok.length) throw new Error(`no free cell next to (${x},${y}) on ${await this.map()}`);
    // a script on the way (a touch event, a battle) interrupts the walk; then carry on, like a player would
    for (let i = 0; i < 4; i++) {
      const here = await this.pos();
      if (ok.some(([ax, ay]) => ax === here[0] && ay === here[1])) break;
      await this.walk(ok.map(([ax, ay]) => [ax, ay]));
    }
    const [px, py] = await this.pos();
    const cell = ok.find(([ax, ay]) => ax === px && ay === py);
    const it = await this.ev((d) => { const m = G.mapScene; m.player.dir = d; G.state.dir = d; m.interactTarget = m.findInteract(); const t = m.interactTarget; if (!t) return null; m.doInteract(); return t.kind + ':' + (t.npc ? t.npc.id : t.ev ? t.ev.id : t.obj ? t.obj.t : ''); }, cell[2]);
    if (!it) throw new Error(`nothing to interact with at (${x},${y}) on ${await this.map()}`);
    if (expect && !it.includes(expect)) throw new Error(`pressed at (${x},${y}) and got ${it}, expected ${expect}`);
    await this.idle();
    return it;
  }
  // walk onto the (first active) warp of this map that leads to `to`
  async exit(to) {
    const cells = await this.ev((to) => { const out = []; for (const w of G.mapScene.def.warps || []) { if (w.to !== to || (w.if && !w.if(G.state))) continue; for (let i = 0; i < (w.w || 1); i++) for (let j = 0; j < (w.h || 1); j++) out.push([w.x + i, w.y + j]); } return out; }, to);
    if (!cells.length) throw new Error(`no warp to ${to} on ${await this.map()}`);
    await this.walk(cells, '(warp to ' + to + ')');
    await this.idle();
  }
  async talk(id, choices) {
    // wandering NPCs may step away while the party walks up: re-aim a few times, like a player would
    for (let i = 0; i < 6; i++) {
      const n = await this.ev((id) => { const n = G.mapScene.npcs.find((x) => x.id === id); return n && n.visible && G.mapScene.npcActive(n) ? [n.x, n.y] : null; }, id);
      if (!n) throw new Error(`NPC ${id} not present/visible on ${await this.map()}`);
      await this.choose(choices);
      try { return await this.press(n[0], n[1], 1, 1, 'npc:' + id); } catch (e) { if (i === 5 || !/nothing to interact|got /.test(e.message)) throw e; }
    }
  }
  // talk to a shopkeeper and buy (the test autoplay skips the shop screen, so the purchase is made here: the item
  // must be in that shop's stock and the party must afford it at the listed price)
  async buy(npcId, wants, choices) {
    await this.ev((w) => {
      const S = G.Script.S;
      if (!S.__qaShop) { S.__qaShop = S.shop; S.shop = function (goods, o) { window.__qa.lastShop = (goods || []).slice(); const want = window.__qa.want || {}; for (const id in want) { if (!(goods || []).includes(id)) continue; const cost = (G.Data.items[id].price || 0) * want[id]; if (G.state.gold >= cost) { G.state.gold -= cost; G.Inv.add(id, want[id]); window.__qa.bought = (window.__qa.bought || []).concat(id); } } window.__qa.want = null; return S.__qaShop.call(this, goods, o); }; }
      window.__qa.want = w; window.__qa.bought = [];
    }, wants);
    await this.talk(npcId, choices);
    const got = await this.ev(() => window.__qa.bought || []);
    for (const id in wants) if (!got.includes(id)) throw new Error(`could not buy ${id} from ${npcId} (stock: ${JSON.stringify(await this.ev(() => window.__qa.lastShop))})`);
  }
  // 物品 → a 靈視 item, exactly as the field menu does it (js/engine/menu.js)
  async eatVision(id = 'lingxun') {
    const ok = await this.ev((id) => { const it = G.Data.items[id]; if (!G.Inv.has(id) || !it.use || !it.use.vision) return false; G.Inv.remove(id, 1); G.Script.S.vision(Math.round(it.use.vision * 0.25)); return true; }, id);
    if (!ok) throw new Error('cannot use ' + id + ' from the menu');
  }
  async act(x, y, choices, expect) { await this.choose(choices); return this.press(x, y, 1, 1, expect); }
  clue(x, y, w, h) { return this.ev(([x, y, w, h]) => __qa.clue(x, y, w, h), [x, y, w || 1, h || 1]); }
  async drain() {
    const e = await this.page.evaluate(() => { const r = __qa.errs.slice(); __qa.errs.length = 0; const le = G && G.lastError; if (G) G.lastError = null; return { r, le: le ? String(le.stack || le) : null }; }).catch(() => ({ r: [], le: null }));
    this.errors.push(...e.r);
    if (e.le) this.errors.push('G.lastError: ' + e.le.slice(0, 600));
  }
  async shot(dir, name) { if (!dir) return; fs.mkdirSync(dir, { recursive: true }); await this.page.screenshot({ path: path.join(dir, name + '.png') }); }
  async close() { if (this.ctx) await this.ctx.close().catch(() => {}); }
}

const assert = (c, msg) => { if (!c) throw new Error('assert: ' + msg); };

// run a list of { id, name, fn(s) } tests; prints PASS/FAIL per quest; exit code 1 on any failure
async function runAll(label, tests) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--only');
  const only = i >= 0 ? argv[i + 1].split(',') : null;
  const browser = await chromium.launch({ headless: !argv.includes('--headed'), args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const res = [];
  for (const t of tests) {
    if (only && !only.some((w) => t.id.includes(w))) continue;
    const s = new Session(browser, t.opts);
    const t0 = Date.now();
    let status = 'PASS', msg = '';
    try { await t.fn(s); } catch (e) { status = 'FAIL'; msg = e.message; }
    await s.drain().catch(() => {});
    if (status === 'PASS' && s.errors.length) { status = 'FAIL'; msg = s.errors.length + ' game error(s)'; }
    await s.close();
    res.push({ id: t.id, status });
    console.log(`${status} [${t.id}] ${t.name}  (${((Date.now() - t0) / 1000).toFixed(0)}s)${msg ? '  — ' + msg : ''}`);
    for (const l of s.log) console.log('    · ' + l);
    for (const e of [...new Set(s.errors)].slice(0, 8)) console.log('    error: ' + e.split('\n').slice(0, 4).join(' | '));
  }
  await browser.close();
  const fail = res.filter((r) => r.status !== 'PASS');
  console.log(`\n${label}: ${res.length - fail.length}/${res.length} PASS${fail.length ? '  — FAIL: ' + fail.map((r) => r.id).join(', ') : ''}`);
  process.exit(fail.length ? 1 : 0);
}

module.exports = { Session, assert, runAll, ROOT };

#!/usr/bin/env node
// Chapter 10 side quests, played the player's way (Playwright + Chromium against file://…/index.html).
//
//   node tools/test/sidequests/ch10.side.js            # 2D renderer (fast)
//   node tools/test/sidequests/ch10.side.js --3d       # keep the WebGL renderer on (?r3lite; slow headless)
//   node tools/test/sidequests/ch10.side.js --shots    # screenshots of the clue spots → tools/test/out/ch10_side/
//   DUMP=1 node tools/test/sidequests/ch10.side.js     # print the collision map when a walk finds no route
//
// One continuous game from ?debug&startch=10 to chapter 11. The script never writes a quest's flags, items, vars or
// stages: it only walks (a BFS over the live collision map proves every destination is reachable, then the player is put
// there — G.Debug.stepOn for touch cells), faces things and presses Z (MapScene.findInteract + doInteract, exactly what
// the Z key does), talks to NPCs, picks choices (G.Debug.choices) and fights (shared battle bot, difficulty easy).
// Documented help, logged as [help]: the chapter test's level/gear assumption before the story bosses, heals.
//
// Quests: q_c10_tatala (心燈 xd_tao_tatala), q_c10_haiji (心燈 xd_amis_haiji), q_c10_race, q_c10_luohanjiao
// (心燈 xd_luohanjiao). For each: starts, every stage advances, completes, rewards, 心燈, quest log closes, the clue a
// player follows exists (NPC line / visible object / hint tag / quest-log text), and the points of no return warn.
// Prints `PASS <quest>` / `FAIL <quest> — reason`; exit 1 on any FAIL.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const argv = process.argv.slice(2);
const R3D = argv.includes('--3d');
const SHOTS = argv.includes('--shots');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch10_side');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /AudioContext was not allowed/, /willReadFrequently/];
const BAD_WARN = [/unknown song/i, /unknown item/i, /unknown troop/i, /no actor/i, /Unknown map/i, /Unknown enemy/i];

class Fail extends Error {}
const assert = (c, msg) => { if (!c) throw new Fail(msg); };
const log = (...a) => console.log(...a);

const QUESTS = {
  q_c10_tatala: '達悟家族的拼板舟',
  q_c10_haiji: '阿美族海祭',
  q_c10_race: '寶桑海灘賽跑',
  q_c10_luohanjiao: '羅漢腳阿義',
  optional: '其他選擇性內容（漂流木箱・寶箱）',
};
const status = {}; // id → { ok, msg }
const pass = (id) => { if (!status[id]) status[id] = { ok: true }; };
const fail = (id, msg) => { if (!status[id] || status[id].ok) status[id] = { ok: false, msg }; };
// a check whose failure does not stop the playthrough (clues, optional pickups, warnings): FAIL the quest, play on
async function soft(id, fn) {
  try { await fn(); } catch (e) { if (!(e instanceof Fail)) throw e; fail(id, e.message); log(`    ✗ ${id}: ${e.message} (playing on)`); }
}

// ------------------------------------------------------------------------------------------ in-page helpers
// installed once per document (the game never reloads the page)
function installHelpers() {
  if (window.SQ) return;
  window.__said = [];
  const say = G.Dialog.say.bind(G.Dialog);
  G.Dialog.say = (who, text, o) => { window.__said.push(String(who || '') + '|' + String(text)); return say(who, text, o); };
  const K = (x, y) => x + ',' + y;
  window.SQ = {
    // cells a player may stand on / walk through: not blocked, not a warp, not an active touch event
    walkable(x, y, allowTouch) {
      const ms = G.mapScene;
      if (ms.blocked(x, y, ms.player)) return false;
      for (const w of ms.def.warps || []) if ((!w.if || w.if(G.state)) && x >= w.x && x < w.x + (w.w || 1) && y >= w.y && y < w.y + (w.h || 1)) return false;
      if (!allowTouch) for (const e of ms.def.events || []) if (e.trigger === 'touch' && ms.eventOk(e) && x >= e.x && x < e.x + (e.w || 1) && y >= e.y && y < e.y + (e.h || 1)) return false;
      return true;
    },
    // BFS from the player to any goal cell (goal cells themselves may be warps / touch cells)
    path(goals) {
      const ms = G.mapScene, p = ms.player;
      const goal = new Set(goals.map(([x, y]) => K(x, y)));
      const prev = new Map([[K(p.x, p.y), null]]);
      const q = [[p.x, p.y]];
      while (q.length) {
        const [x, y] = q.shift();
        if (goal.has(K(x, y))) { const out = []; let k = K(x, y); while (k) { out.push(k); k = prev.get(k); } return out.reverse(); }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, nk = K(nx, ny);
          if (prev.has(nk) || nx < 0 || ny < 0 || nx >= ms.w || ny >= ms.h) continue;
          if (!goal.has(nk) && !SQ.walkable(nx, ny)) continue;
          if (goal.has(nk) && ms.blocked(nx, ny, p)) continue;
          prev.set(nk, K(x, y)); q.push([nx, ny]);
        }
      }
      return null;
    },
    cellsOf(t) {
      const ms = G.mapScene;
      const rect = (x, y, w, h) => { const o = []; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) o.push([xx, yy]); return o; };
      if (t.npc) { const n = ms.npcs.find((a) => a.id === t.npc && a.visible); return n ? [[n.x, n.y]] : null; }
      if (t.ev) { const e = (ms.def.events || []).find((a) => a.id === t.ev); return e && ms.eventOk(e) ? rect(e.x, e.y, e.w || 1, e.h || 1) : null; }
      const o = t.tag ? ms.objects.find((a) => a.tag === t.tag && ms.objActive(a)) : ms.objects.find((a) => a.t === 'chest' && a.chest && a.chest.id === t.chest);
      if (!o) return null;
      // MapScene.findInteract only reacts on an object's own o.w × o.h (not its art's footprint): use the same cells
      return o.t === 'chest' ? [[o.x, o.y]] : rect(o.x, o.y, o.w || 1, o.h || 1);
    },
    // walk up to the target, face it and press Z. Returns an error string or ''.
    act(t) {
      const ms = G.mapScene, p = ms.player;
      const cells = SQ.cellsOf(t);
      if (!cells) return 'target not present: ' + JSON.stringify(t);
      const tk = new Set(cells.map(([x, y]) => K(x, y)));
      const stands = [];
      for (const [x, y] of cells) for (const [dx, dy, dir] of [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']]) {
        const sx = x + dx, sy = y + dy;
        if (!tk.has(K(sx, sy)) && (SQ.walkable(sx, sy) || (sx === p.x && sy === p.y))) stands.push([sx, sy, dir]);
      }
      const route = SQ.path(stands.map(([x, y]) => [x, y]));
      if (!route) return 'no walkable route to ' + JSON.stringify(t) + ' from ' + p.x + ',' + p.y;
      const [sx, sy] = route[route.length - 1].split(',').map(Number);
      const st = stands.find(([x, y]) => x === sx && y === sy);
      p.setCell(sx, sy); p.dir = st[2]; G.state.dir = st[2];
      G.state.x = sx; G.state.y = sy;
      const it = ms.findInteract();
      const want = t.npc ? (it && it.kind === 'npc' && it.npc.id === t.npc) : t.ev ? (it && it.kind === 'event' && it.ev.id === t.ev)
        : t.tag ? (it && it.kind === 'obj' && it.obj.tag === t.tag) : (it && it.kind === 'chest' && it.obj.chest.id === t.chest);
      if (!want) return 'Z in front of ' + JSON.stringify(t) + ' finds ' + (it ? it.kind + ':' + ((it.npc && it.npc.id) || (it.ev && it.ev.id) || (it.obj && (it.obj.tag || it.obj.t))) : 'nothing');
      ms.interactTarget = it;
      ms.doInteract();
      return '';
    },
    // walk onto a cell; inside a touch event's rect, the first cell of that rect a player reaches is where it fires
    walk(x, y) {
      const ms = G.mapScene, goals = [[x, y]];
      for (const e of ms.def.events || []) {
        if (e.trigger !== 'touch' || !ms.eventOk(e) || !(x >= e.x && x < e.x + (e.w || 1) && y >= e.y && y < e.y + (e.h || 1))) continue;
        for (let yy = e.y; yy < e.y + (e.h || 1); yy++) for (let xx = e.x; xx < e.x + (e.w || 1); xx++) goals.push([xx, yy]);
      }
      const route = SQ.path(goals);
      if (!route) return 'no walkable route to ' + x + ',' + y + ' from ' + G.mapScene.player.x + ',' + G.mapScene.player.y + SQ.why();
      const [gx, gy] = route[route.length - 1].split(',').map(Number);
      G.Debug.stepOn(gx, gy);
      return '';
    },
    why() {
      const ms = G.mapScene, p = ms.player, out = [];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = p.x + dx, y = p.y + dy;
        const n = ms.npcs.find((a) => a.visible && a.x === x && a.y === y);
        out.push(x + ',' + y + ':' + (ms.solid[y * ms.w + x] ? 'solid' : n ? 'npc ' + n.id : SQ.walkable(x, y) ? 'ok' : 'warp/touch'));
      }
      if (window.__dump) { const rows = []; for (let y = 0; y < ms.h; y++) { let r = ''; for (let x = 0; x < ms.w; x++) r += ms.solid[y * ms.w + x] ? '#' : ms.npcs.some((a) => a.visible && a.x === x && a.y === y) ? 'n' : SQ.walkable(x, y) ? '.' : 't'; rows.push(r); } console.log(rows.join('\n')); }
      return ' [' + out.join(' ') + ']';
    },
    // something a player can see at / next to a cell: an object, an NPC, a hint tag or a map light
    visibleCue(x, y) {
      const ms = G.mapScene, out = [];
      for (const o of ms.objects) {
        if (!ms.objActive(o)) continue;
        const d = G.Objects.get(o.t) || {};
        if (x >= o.x - 1 && x < o.x + (o.w || d.w || 1) + 1 && y >= o.y - 1 && y < o.y + (o.h || d.h || 1) + 1) out.push('object ' + o.t);
      }
      for (const n of ms.npcs) if (n.visible && Math.abs(n.x - x) + Math.abs(n.y - y) <= 1) out.push('npc ' + n.id);
      for (const e of ms.def.events || []) if (e.trigger === 'action' && e.hint && ms.eventOk(e) && x >= e.x && x < e.x + (e.w || 1) && y >= e.y && y < e.y + (e.h || 1)) out.push('hint ' + e.label);
      const L = typeof ms.def.lights === 'function' ? ms.def.lights(G.state) : (ms.def.lights || []);
      for (const l of L) if (l.x === x && l.y === y) out.push('light');
      return out;
    },
  };
}

function api(page) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const A = {
    ev,
    async open(q) {
      await page.goto(BASE + q);
      await page.waitForFunction(() => window.G && G.Scenes && G.Scenes.top(), null, { timeout: 30000 });
      await ev(() => { G.Debug.setAutoplay(true); G.Debug.log.length = 0; });
      await ev(installHelpers);
      if (process.env.DUMP) await ev(() => { window.__dump = true; });
      // headless canvas drawing is slow: extra fixed logic steps between frames (as tools/test/chapters/ch10.test.js)
      await ev(() => {
        if (window.__turbo) return;
        window.__turbo = setInterval(() => {
          for (let i = 0; i < 3; i++) {
            try {
              const dt = 0.05;
              G.time += dt; G.Input.update(dt); G.Timers.update(dt); G.Tweens.update(dt); G.Render.updateFx(dt); G.UI.updateToasts(dt);
              G.Scenes.update(dt);
              if (G.state && G.inGame) G.state.playtime += dt;
              G.Input.endFrame();
            } catch (e) { G.lastError = e; console.error('turbo step: ' + (e && e.stack || e)); }
          }
        }, 12);
      });
    },
    async state() { return ev(() => ({ map: G.mapScene && G.mapScene.def.id, top: G.Scenes.top() && G.Scenes.top().constructor.name, busy: G.Script.busy(), log: G.Debug.log.slice(-6) })).catch(() => ({})); },
    async waitFor(expr, timeout = 90000, what) {
      try { await page.waitForFunction(expr, null, { timeout, polling: 100 }); }
      catch (e) { throw new Fail(`timeout waiting for ${what || expr} — ${JSON.stringify(await A.state())}`); }
    },
    async idle(timeout = 300000) {
      const t0 = Date.now();
      for (;;) {
        const ok = await ev(() => G.Debug.idle(2000));
        if (ok === 'gameover') throw new Fail('GAME OVER — ' + JSON.stringify(await A.state()));
        if (ok === true) { await page.waitForTimeout(300); if ((await ev(() => G.Debug.idle(50))) === true) return; }
        if (Date.now() - t0 > timeout) throw new Fail('soft-lock? never idle — ' + JSON.stringify(await A.state()));
      }
    },
    choices(list) { return ev((l) => { G.Debug.choices.length = 0; G.Debug.choices.push(...l); }, list); },
    async checkChoices() {
      const left = await ev(() => G.Debug.choices.slice());
      if (left.length) throw new Fail('scripted choices never offered: ' + JSON.stringify(left) + ' — log: ' + JSON.stringify(await ev(() => G.Debug.log.slice(-4))));
    },
    async act(t, ch = []) {
      await A.choices(ch);
      const err = await ev((tt) => SQ.act(tt), t);
      assert(!err, err);
      await page.waitForTimeout(100); await A.idle(); await A.checkChoices();
    },
    talk: (id, ch) => A.act({ npc: id }, ch),
    async walk(x, y, ch = []) {
      await A.choices(ch);
      const err = await ev(([a, b]) => SQ.walk(a, b), [x, y]);
      assert(!err, err);
      await page.waitForTimeout(150); await A.idle(); await A.checkChoices();
    },
    flag: (k) => ev((kk) => !!G.state.flags[kk], k),
    map: () => ev(() => G.mapScene && G.mapScene.def.id),
    count: (it) => ev((i) => G.Inv.count(i), it),
    lantern: (id) => ev((i) => !!G.state.lanterns[i], id),
    quest: (id) => ev((i) => G.state.quests[i] ? { stage: G.state.quests[i].stage, done: G.Quests.isDone(i) } : null, id),
    objective: () => ev(() => G.state.vars.objective || ''),
    said: () => ev(() => window.__said.splice(0)),
    pnr: () => ev(() => G.Debug.log.filter((l) => l.startsWith('pointOfNoReturn')).splice(0)),
    clearLog: () => ev(() => { G.Debug.log.length = 0; }),
    cue: (x, y) => ev(([a, b]) => SQ.visibleCue(a, b), [x, y]),
    async shot(name) { if (SHOTS) await page.screenshot({ path: path.join(OUT, name + '.png') }); },
    help(what, fn) { log('    [help] ' + what); return ev(fn); },
  };
  return A;
}

// quest stage assertion helper
async function stageIs(A, id, stage, what) {
  const q = await A.quest(id);
  assert(q, `${id} not started (${what})`);
  assert(q.stage === stage && !q.done, `${id} should be at stage ${stage} (${what}), is ${JSON.stringify(q)}`);
}
async function doneCheck(A, id, lantern) {
  const q = await A.quest(id);
  assert(q && q.done, `${id} quest log entry did not close: ${JSON.stringify(q)}`);
  if (lantern) assert(await A.lantern(lantern), `心燈 ${lantern} not lit`);
  const errs = await A.errs();
  assert(!errs.length, 'game errors: ' + errs.join(' | ').slice(0, 600));
}

// ------------------------------------------------------------------------------------------ the run
async function run(page) {
  const A = api(page);
  A.errs = async () => {
    const le = await A.ev(() => { const e = G.lastError; G.lastError = null; return e ? String(e.stack || e) : null; }).catch(() => null);
    const errs = page.__errs.splice(0);
    if (le) errs.push('G.lastError: ' + le.slice(0, 400));
    return errs;
  };
  await A.open('?debug&startch=10' + (R3D ? '&r3lite' : ''));
  await A.waitFor(() => G.mapScene && G.mapScene.def.id === 'wangboat_deck_east' && G.state.flags.ch10_start, 90000, 'C10-01 on the deck');
  await A.idle();
  await A.help('party Lv40 + chapter shop gear before the story bosses (same assumption as ch10.test.js)', () => {
    for (const id of G.state.party) G.Story.ensureLevel(id, 40);
    const g = { xinghe: 'c10_sw_lanyang', hongying: 'c10_sp_huilan', yungui: 'c10_fn_haishen' };
    for (const id in g) Object.assign(G.state.members[id].equip, { weapon: g[id], armor: 'c10_ar_jiaosi', head: 'c10_hd_jiaosi', feet: 'c10_ft_jiaosi' });
    G.Party.healAll();
  });
  for (const id of Object.keys(QUESTS)) assert(!(await A.quest(id)), id + ' started before its trigger');

  // ================================================================ 蘭嶼: 達悟家族的拼板舟
  const T = 'q_c10_tatala';
  try {
    assert((await A.objective()).includes('陳伯'), 'deck objective names 陳伯');
    await A.talk('chenbo', ['出航', '蘭嶼', '不停留']);
    assert((await A.map()) === 'orchid_shore' && await A.flag('ch10_orchid_arrive'), 'C10-02 on 蘭嶼');
    await stageIs(A, T, 0, 'after Syapen explains the rules');
    await soft(T, async () => assert((await A.objective()).includes('Sinan'), 'objective points at Sinan: ' + await A.objective()));
    // optional: the driftwood crate at the west end of the beach (白芷's 潮音笛)
    await soft('optional', async () => { await A.act({ tag: 'shore_w' }); assert((await A.count('fl_chaoyin')) === 1, '潮音笛 crate'); });
    await A.said();
    await A.talk('tao_sinan', ['抓住芋圓']);
    const s1 = await A.said();
    await soft(T, async () => assert(s1.some((l) => l.includes('規矩是大家一起守的')), 'trust hint before the fish-rack choice'));
    await stageIs(A, T, 1, 'Kaswal missing');
    await soft(T, async () => assert((await A.objective()).includes('礁盤'), 'objective points at the reef'));
    assert((await A.ev(() => G.state.vars.ch10_tao_trust)) === 1, 'fish rack +1 trust');
    await A.walk(43, 15);
    assert((await A.map()) === 'orchid_reef', 'reached the reef by the east path');
    // the tide: wait for low water if a channel is flooded (BFS fails on deep water)
    const reefAct = async (t) => {
      for (let i = 0; i < 4; i++) {
        const err = await A.ev((tt) => (SQ.cellsOf(tt) ? '' : 'gone'), t);
        if (err) return;
        const ok = await A.ev(() => !G.mapScene.c10high);
        if (ok) { try { await A.act(t); return; } catch (e) { if (!/no walkable route/.test(e.message)) throw e; } }
        await page.waitForTimeout(2500);
      }
      throw new Fail('reef target never reachable at low tide: ' + JSON.stringify(t));
    };
    for (const t of [{ tag: 'oar1' }, { tag: 'oar2' }, { tag: 'reef' }, { tag: 'reef_w' }]) {
      await soft(t.tag.startsWith('oar') ? T : 'optional', async () => {
        assert((await A.ev((tt) => !!SQ.cellsOf(tt), t)), 'reef object visible: ' + JSON.stringify(t));
        await reefAct(t);
      });
    }
    await soft(T, async () => assert((await A.count('c10_oar')) === 2, 'both oars picked up'));
    await soft('optional', async () => assert((await A.count('ar_heichao')) >= 1, '黑潮鱗甲 crate (reef west pocket)'));
    for (let i = 0; i < 6 && (await A.map()) === 'orchid_reef'; i++) {
      if (await A.ev(() => !G.mapScene.c10high)) { try { await A.walk(24, 23); break; } catch (e) { if (!/no walkable route/.test(e.message)) throw e; } }
      await page.waitForTimeout(2500);
    }
    assert(await A.flag('ch10_reef_done'), 'Kaswal rescued (C10-04)');
    assert((await A.count('c10_oar')) === 0 && (await A.count('c10_figurehead')) === 0, 'oars + figurehead handed back');
    await stageIs(A, T, 2, 'guard the boats at night');
    await soft(T, async () => assert((await A.objective()).includes('Syapen'), 'objective points at Syapen'));
    await A.help('heal before the 潮病海蛇', () => G.Party.healAll());
    await A.talk('tao_syapen', ['準備好了', '安靜地看']);
    await A.waitFor(() => G.state.flags.ch10_chuanyan, 300000, 'C10-05 / C10-06');
    await A.idle();
    const s2 = await A.said();
    await soft(T, async () => assert(s2.some((l) => l.includes('我們看著就好')), 'hint before the boat-repair choice'));
    const trust = await A.ev(() => G.state.vars.ch10_tao_trust);
    assert(trust >= 3, 'trust ≥ 3: ' + trust);
    assert((await A.count('key_boateye')) === 1 && (await A.count('feiyugan')) >= 5, '船眼護符 + 飛魚乾 ×5');
    await doneCheck(A, T, 'xd_tao_tatala');
    pass(T);
  } catch (e) { fail(T, e.message); throw e; }

  // ================================================================ 寶桑: race starts (played later, after a return voyage)
  const RC = 'q_c10_race';
  try {
    assert((await A.map()) === 'wangboat_deck_east', 'back on the deck after 蘭嶼');
    await A.talk('chenbo', ['出航', '寶桑', '不停留']);
    assert((await A.map()) === 'baosang' && await A.flag('ch10_taitung_arrive'), 'C10-07 寶桑');
    await stageIs(A, RC, 0, 'the 巴拉冠 youth offers a race');
    await soft('optional', async () => { await A.act({ chest: 'baosangA' }); assert((await A.count('shijia')) >= 3, '釋迦 chest in the NW field'); });
  } catch (e) { fail(RC, e.message); throw e; }

  // ================================================================ 台東: 阿美族海祭
  const HJ = 'q_c10_haiji';
  try {
    await A.walk(12, 0);
    assert((await A.map()) === 'amis_village' && await A.flag('ch10_amis_met'), 'C10-08 阿美族部落');
    await stageIs(A, HJ, 0, 'Kolas asks for the three spots');
    await soft(HJ, async () => assert((await A.objective()).includes('海岸'), 'objective points at the coast path'));
    await A.talk('am_kolas');
    await A.walk(36, 0);
    assert((await A.map()) === 'taitung_coast', 'coast at night');
    // every spot is marked before it is reached: a drowned soul standing there + the blue glow
    for (const [nm, x, y] of [['A', 20, 25], ['B', 30, 13], ['C', 14, 5]]) {
      await soft(HJ, async () => { const cue = await A.cue(x, y); assert(cue.includes('light'), `spot ${nm} has no visible marker: ${cue}`); });
    }
    await A.help('heal before the coast fights', () => G.Party.healAll());
    await A.walk(19, 24);
    assert(await A.flag('c10_fix_a'), 'river-mouth battle A');
    await soft(HJ, async () => assert((await A.cue(20, 25)).some((c) => c.startsWith('hint')), '招魂 spot A has a hint tag'));
    await A.shot('coast_ptA');
    await A.act({ ev: 'ptA' });
    await A.said();
    await A.walk(28, 12);
    assert(await A.flag('c10_fix_b'), 'reef-shore battle B');
    await soft(HJ, async () => assert((await A.said()).some((l) => l.includes('招魂點')), 'someone points at the 招魂 spot'));
    await soft(HJ, async () => assert((await A.cue(30, 13)).some((c) => c.startsWith('hint')), '招魂 spot B has a hint tag'));
    await A.act({ ev: 'ptB' });
    await A.help('heal before the 大潮怨', () => G.Party.healAll());
    await A.walk(20, 4);
    assert(await A.flag('c10_fix_c'), 'headland boss C');
    await soft(HJ, async () => assert((await A.cue(14, 5)).some((c) => c.startsWith('hint')), '招魂 spot C has a hint tag'));
    await A.act({ ev: 'ptC' });
    assert(await A.flag('ch10_coast_clear'), 'coast clear at dawn');
    await stageIs(A, HJ, 1, 'dawn: back to the village');
    // optional: the three coast chests
    await soft('optional', async () => {
      for (const c of ['coastC', 'coastB', 'coastA']) await A.act({ chest: c });
      assert((await A.count('c10_fn_jingge')) === 1 && (await A.count('c10_ac_coral')) === 1, 'coast chests (optional)');
    });
    await A.walk(22, 39);
    await A.waitFor(() => G.state.flags.ch10_haiji_witnessed, 180000, 'C10-10 海祭');
    await A.idle();
    assert((await A.count('c10_alifengfeng')) === 3, '阿里鳳鳳 ×3');
    assert((await A.count('c10_ac_kolas')) === 1, 'Kolas 的魚鉤 (same night)');
    await doneCheck(A, HJ, 'xd_amis_haiji');
    pass(HJ);
  } catch (e) { fail(HJ, e.message); throw e; }

  // ================================================================ 花蓮 (main path, as the chapter test drives it)
  await A.act({ ev: 'boat' }, ['回王船']);
  assert((await A.map()) === 'wangboat_deck_east', 'deck after 海祭');
  await A.talk('chenbo', ['出航', '洄瀾', '不停留']);
  assert((await A.map()) === 'huilan', '洄瀾');
  await soft('optional', async () => { await A.act({ chest: 'huilanA' }); assert((await A.count('fn_huanglong')) >= 1, '洄瀾 chest by the 福德廟'); });
  await A.walk(0, 3);
  assert((await A.map()) === 'truku_village' && await A.flag('ch10_truku_permission'), 'C10-12');
  await A.walk(39, 10);
  await A.act({ ev: 'dock' }, ['回王船']);
  await A.talk('chenbo', ['出航', '清水']);
  assert((await A.map()) === 'qingshui_cliffs', '清水斷崖');
  await A.walk(17, 16);
  assert(await A.flag('ch10_saved_watan'), 'saved Watan');
  // the rockfall ledge is a timing puzzle (tested in ch10.test.js): cross it in one go
  await A.ev(() => G.Debug.stepOn(31, 1));
  await A.idle();
  await A.walk(31, 0);
  assert((await A.map()) === 'taroko_gorge', 'gorge');
  for (const d of ['dam3', 'dam2', 'dam1']) await A.act({ ev: d }, ['用心火融開']);
  await A.talk('gz_muntjac', ['用心火融開鹽殼']);
  await A.walk(26, 18);
  await A.help('Lv44 for the 石巨靈 (same assumption as ch10.test.js)', () => { for (const id of G.state.party) G.Story.ensureLevel(id, 44); G.Party.healAll(); });
  await A.walk(22, 10);
  await A.waitFor(() => G.state.flags.ch10_rainbow_seen, 300000, 'C10-13/14');
  await A.idle();
  await A.walk(39, 10);
  await A.act({ ev: 'dock' }, ['回王船']);

  // ================================================================ leaving for 頭城 is one-way: the race must be offered
  try {
    await A.clearLog();
    let warned = false;
    await soft(RC, async () => {
      await A.talk('chenbo', ['出航', '頭城', '再等等']);
      warned = true;
      const p1 = await A.pnr();
      assert(p1.some((l) => l.includes('open: q_c10_race')), '頭城 departure warns about the open race: ' + JSON.stringify(p1));
    });
    assert(warned && (await A.map()) === 'wangboat_deck_east' && !(await A.flag('ch10_zhongyuan')), '頭城 departure did not wait (no warning, the race is lost): ' + await A.map());
    // sail back south (ports already visited stay open until 頭城) and race
    await A.talk('chenbo', ['出航', '寶桑', '不停留']);
    assert((await A.map()) === 'baosang', 'back in 寶桑');
    await soft(RC, async () => assert((await A.cue(30, 16)).includes('npc bs_runner'), 'the runner stands where the guide says'));
    await A.talk('bs_runner', ['比一圈']);
    assert(await A.flag('ch10_race_won'), 'race won');
    assert((await A.count('c10_ft_kuaitui')) === 1 && (await A.count('c10_beinanstone')) >= 2, 'race rewards');
    await doneCheck(A, RC, null);
    await A.act({ ev: 'dock' }, ['回王船']);
    pass(RC);
  } catch (e) { fail(RC, e.message); throw e; }

  // ================================================================ 頭城: 羅漢腳阿義
  const LH = 'q_c10_luohanjiao';
  try {
    await A.clearLog();
    await A.talk('chenbo', ['出航', '頭城', '不停留']);
    await soft(LH, async () => assert(!(await A.pnr()).some((l) => l.includes('open:')), 'nothing open → no warning at the 頭城 departure'));
    assert((await A.map()) === 'toucheng' && await A.flag('ch10_toucheng_arrive'), 'C10-17 頭城');
    assert(!(await A.quest(LH)), '阿義 not met yet');
    // 阿坤 「準備好了」 now: the unmet 阿義 is counted as an unlit 心燈
    await A.clearLog();
    await A.talk('tc_akun', ['準備好了', '再等等']);
    const p2 = await A.pnr();
    await soft(LH, async () => assert(p2.some((l) => l.includes('open: xd_luohanjiao')), '阿坤 warns about the unlit 心燈: ' + JSON.stringify(p2)));
    assert(!(await A.ev(() => G.state.vars.c10_tc_time)), '再等等 stays before 普渡');
    // clues: the 燈篙 (visible object) and the inn worker point at the night
    await A.said();
    await A.act({ ev: 'ayipole' });
    await A.talk('tc_inn', ['住宿']);
    const s3 = await A.said();
    await soft(LH, async () => assert(s3.some((l) => l.includes('晚上再來看看')), 'no daytime clue at the 燈篙 that something comes at night'));
    await soft(LH, async () => assert(s3.some((l) => l.includes('燈篙底下') && l.startsWith('客棧夥計')), 'no NPC clue that 阿義 appears at night (inn worker)'));
    assert((await A.ev(() => G.state.vars.c10_tc_time)) === 'eve', 'night after the inn');
    assert((await A.cue(8, 19)).includes('npc tc_ayi'), '阿義 stands under the 燈篙 at night');
    await A.shot('toucheng_ayi_night');
    await A.talk('tc_ayi');
    await stageIs(A, LH, 0, 'met 阿義');
    await soft(LH, async () => assert((await A.objective()).includes('陳伯'), 'objective: ask 陳伯'));
    await A.act({ ev: 'boat' }, ['划舢舨回王船']);
    assert((await A.map()) === 'wangboat_deck_east', 'deck');
    await A.talk('chenbo', ['請陳伯做燈籠']);
    assert((await A.count('c10_ayi_lantern')) === 1, '阿義的燈籠');
    await stageIs(A, LH, 1, 'lantern made');
    await soft(LH, async () => assert((await A.objective()).includes('燈篙'), 'objective should point at the 燈篙 once the lantern is made: ' + await A.objective()));
    await A.act({ ev: 'boat' }, ['乘舢舨上岸']);
    assert((await A.map()) === 'toucheng', 'back in 頭城');
    await A.act({ ev: 'ayipole' }, ['把燈籠掛上燈篙']);
    assert(await A.flag('ch10_ayi_lantern_ready') && (await A.count('c10_ayi_lantern')) === 0, 'lantern hung');
    await stageIs(A, LH, 2, 'wait for 普渡');
    await A.clearLog();
    await A.help('heal before the 孤魂眾', () => G.Party.healAll());
    await A.talk('tc_akun', ['準備好了']);
    await A.waitFor(() => G.state.chapter === 11 && G.state.flags.ch10_end, 400000, 'C10-18…20 → chapter 11');
    const p3 = await A.ev(() => G.Debug.log.filter((l) => l.startsWith('pointOfNoReturn')));
    await soft(LH, async () => assert(p3.some((l) => l.includes('nothing open')), 'with the lantern hung (finishes during 普渡) 阿坤 should not warn: ' + JSON.stringify(p3)));
    await doneCheck(A, LH, 'xd_luohanjiao');
    pass(LH);
  } catch (e) { fail(LH, e.message); throw e; }

  // every quest closed, no stray ch10 quest left open
  const open = await A.ev(() => G.Quests.active().filter((q) => q.startsWith('q_c10_')));
  assert(!open.length, 'ch10 quests still open at chapter 11: ' + open.join());
  log('    心燈:', await A.ev(() => Object.keys(G.state.lanterns).join(',')));
  pass('optional');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
  const settings = JSON.stringify({ render3d: R3D });
  await ctx.addInitScript((s) => { try { localStorage.setItem('shorelight_settings', s); } catch (e) { /* ignore */ } }, settings);
  const page = await ctx.newPage();
  page.__errs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (IGNORE.some((r) => r.test(t))) return;
    if (process.env.DUMP && m.type() === 'log') console.log(t);
    if (m.type() === 'error') page.__errs.push('console.error: ' + t.slice(0, 400));
    else if (m.type() === 'warning' && BAD_WARN.some((r) => r.test(t))) page.__errs.push('warning: ' + t.slice(0, 300));
  });
  page.on('pageerror', (e) => page.__errs.push('pageerror: ' + (e.stack || e.message).slice(0, 600)));
  const t0 = Date.now();
  let fatal = null;
  try { await run(page); } catch (e) { fatal = e instanceof Fail ? e.message : (e.stack || String(e)).slice(0, 800); }
  await browser.close();
  log('');
  for (const [id, name] of Object.entries(QUESTS)) {
    const s = status[id] || { ok: false, msg: 'not reached' + (fatal ? ' (run stopped: ' + fatal + ')' : '') };
    log(s.ok ? `PASS ${id} ${name}` : `FAIL ${id} ${name} — ${s.msg}`);
  }
  if (fatal && Object.values(status).every((s) => s.ok) && Object.keys(status).length === Object.keys(QUESTS).length) log(`FAIL run — ${fatal}`);
  log(`(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  const ok = !fatal && Object.keys(QUESTS).every((id) => status[id] && status[id].ok);
  process.exit(ok ? 0 : 1);
})();

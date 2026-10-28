#!/usr/bin/env node
// Chapter 11 side quests, played the PLAYER's way (walk, talk, look, choose, fight) — no quest flags / items / vars /
// stages are ever written by this script.
//
//   node tools/test/sidequests/ch11.side.js            # everything (≈ 15–25 min)
//   node tools/test/sidequests/ch11.side.js --shots    # also screenshots → tools/test/out/side_ch11/
//   node tools/test/sidequests/ch11.side.js --only mush|penghu|main|endings   # one part (main = penghu → finale)
//   node tools/test/sidequests/ch11.side.js --3d       # spot-check pass: 3D renderer (?r3lite) screenshots of the
//                                                      # 靈視 mushroom, 塔公塔婆, the memory lamps (slow: SwiftShader)
//
// Prints `PASS <quest>` / `FAIL <quest> — reason` per quest; exit 1 on any FAIL.
//
// How the player is simulated
//   · Walking: a BFS over the map's real collision (MapScene.blocked) from where the player stands, then one
//     G.Debug.stepOn per cell with a few frames in between, so touch events / warps fire exactly where a walking player
//     would set them off and the game loop runs between steps (the shy memory lamps hop away, NPCs wander). A target
//     with no path FAILS (unreachable content is a bug). Touch events / warps that are not the goal are routed around
//     when possible.
//   · Looking / talking: walk next to the thing, face it, and press Enter (the real keyboard): the game's own
//     findInteract() decides what answers (so 靈視-only events, event-vs-object priority etc. are what a player gets).
//   · 靈視: eats a 七彩靈蕈 from the bag exactly like the item menu does (G.Inv.remove + S.vision(steps/4)).
//   · Dialogue auto-advances (?autoplay=1); choices are queued in G.Debug.choices (default: the first option).
//   · Discoverability: for every required step the script asserts a clue the player can see — the quest-log stage text
//     that names the place, an NPC line, or a visible object/glow drawn at the spot.
//
// Documented help / carry-in (NOT quest state)
//   · Fights: the shared battle bot (tools/test/lib/battlebot.js) on 'easy' + levels / the 媽宮 smith's kit as in
//     tools/test/chapters/ch11.test.js (the autoplay AI is far weaker than a player), heals before bosses.
//   · Main-story progress the side quests sit behind (tower floors, puzzles, bosses) is driven like ch11.test.js
//     with the same walker (walk + Enter), never touching side-quest state; only the final step into the finale is a
//     stepOn (the ending runs to the title screen).
//   · 七仙蕈 carry-in: part `mush` first plays the six earlier pickups (ch3 剝皮寮 incl. the quest start from 青草阿伯,
//     ch4 風穴, ch5 洛家, ch6 林投林, ch7 雲霧林, ch9 龍坑) in ONE page on their own maps, with only the main-story flags
//     those maps need set (listed in MUSH_CHAIN). The flags / counter / quest stage THOSE PICKUPS wrote are then carried
//     into a fresh ?startch=11 game (applied right before G.Story.ch11 runs, like a save from chapter 10 would be).
//   · 心燈 carry-in for the endings: lanterns from chapters 1–10 are pre-seeded (G.Lanterns.add) — all 25 of them in the
//     main run (so every 無光之霧 / 全島的燈 callback is exercised); the ending replays reload the pre-finale save with
//     exactly 13 and exactly 14 lit.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'side_ch11');
const SHOTS = process.argv.includes('--shots');
const R3D = process.argv.includes('--3d');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : null; })();
fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
const RESULTS = [];
function result(name, ok, why) {
  RESULTS.push({ name, ok, why });
  console.log(ok ? `PASS ${name}` : `FAIL ${name} — ${why}`);
}
const notes = [];
function note(s) { notes.push(s); console.log('  · ' + s); }

// ------------------------------------------------------------------------------------------------ in-page helpers
// installed with addInitScript: BFS planner, a recorder for every dialogue line / toast / scene, and the carry-in hook
function pageHelpers() {
  window.__SQ = {
    said: [], toasts: [], scenes: [], carry: null,
    plan(tx, ty, o) {
      o = o || {};
      const m = G.mapScene, p = m.player, W = m.w, H = m.h;
      const key = (x, y) => y * W + x;
      const goals = new Set();
      const D4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      if (o.adj) {
        for (const [dx, dy] of D4) {
          const x = tx + dx, y = ty + dy;
          if ((x === p.x && y === p.y) || !m.blocked(x, y, p)) goals.add(key(x, y));
        }
      } else goals.add(key(tx, ty));
      const avoid = new Set();
      const addRect = (r) => { for (let y = r.y; y < r.y + (r.h || 1); y++) for (let x = r.x; x < r.x + (r.w || 1); x++) if (!goals.has(key(x, y))) avoid.add(key(x, y)); };
      for (const e of m.def.events || []) if (e.trigger === 'touch' && m.eventOk(e)) addRect(e);
      for (const w of m.def.warps || []) if (!w.if || w.if(G.state)) addRect(w);
      const never = new Set((o.avoid || []).map(([x, y]) => key(x, y)));
      for (const strict of [true, false]) {
        const prev = new Map([[key(p.x, p.y), -1]]);
        const q = [[p.x, p.y]];
        let found = goals.has(key(p.x, p.y)) ? key(p.x, p.y) : null;
        while (q.length && found == null) {
          const [x, y] = q.shift();
          for (const [dx, dy] of D4) {
            const nx = x + dx, ny = y + dy, k = key(nx, ny);
            if (prev.has(k) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (m.blocked(nx, ny, p) && !(o.force && goals.has(k))) continue;
            if ((strict && avoid.has(k)) || never.has(k)) continue;
            prev.set(k, key(x, y));
            if (goals.has(k)) { found = k; break; }
            q.push([nx, ny]);
          }
        }
        if (found != null) {
          const out = [];
          for (let k = found; k !== key(p.x, p.y) && k !== -1; k = prev.get(k)) out.push([k % W, Math.floor(k / W)]);
          return out.reverse();
        }
      }
      return null;
    },
    step(x, y) {
      const m = G.mapScene, p = m.player;
      if (G.Script.busy() || G.Scenes.top() !== m) return 'busy';
      if (Math.abs(p.x - x) + Math.abs(p.y - y) !== 1) return 'far';
      if (m.blocked(x, y, p)) return 'blocked';
      G.Debug.stepOn(x, y);
      return G.Script.busy() ? 'event' : 'ok';
    },
    face(tx, ty) {
      const p = G.mapScene.player;
      const dx = tx - p.x, dy = ty - p.y;
      const d = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      p.dir = d; G.state.dir = d;
      return d;
    },
    target() {
      const m = G.mapScene, it = m.findInteract();
      if (!it) return null;
      if (it.kind === 'npc') return { kind: 'npc', id: it.npc.id };
      if (it.kind === 'event') return { kind: 'event', id: it.ev.id, label: it.ev.label };
      if (it.kind === 'chest') return { kind: 'chest', id: it.obj.chestKey };
      if (it.kind === 'obj') return { kind: 'obj', id: it.obj.t + '@' + it.obj.x + ',' + it.obj.y };
      return { kind: it.kind };
    },
    // 七彩靈蕈 from the bag, exactly as the item menu (js/engine/menu.js) uses it
    eatLingxun() {
      if (!G.Inv.has('lingxun')) return false;
      G.Inv.remove('lingxun', 1);
      G.Script.S.vision(Math.round(G.Data.items.lingxun.use.vision * 0.25));
      return true;
    },
    pos() { const m = G.mapScene; return m ? { map: m.def.id, x: m.player.x, y: m.player.y } : null; },
  };
  const hook = () => {
    if (!window.G || !G.Dialog || !G.UI || !G.Scenes || !G.Story || !G.Story.next) return false;
    const say = G.Dialog.say.bind(G.Dialog);
    G.Dialog.say = (who, text, o) => { window.__SQ.said.push([who, String(text)]); return say(who, text, o); };
    const choice = G.Dialog.choice.bind(G.Dialog);
    G.Dialog.choice = (opts, o) => { window.__SQ.said.push(['<choice>', (opts || []).join(' / ')]); return choice(opts, o); };
    const toast = G.UI.toast.bind(G.UI);
    G.UI.toast = (t, o) => { window.__SQ.toasts.push(String(t)); return toast(t, o); };
    const push = G.Scenes.push.bind(G.Scenes);
    G.Scenes.push = (sc) => { window.__SQ.scenes.push({ name: sc && sc.constructor && sc.constructor.name, list: sc && Array.isArray(sc.list) ? sc.list.map((r) => r && r.text) : null }); return push(sc); };
    const next = G.Story.next;
    G.Story.next = async function (S, n) {
      // carry-in of earlier-chapter results (a chapter-10 save would hold exactly this)
      const c = window.__SQ.carry;
      if (n === 11 && c) {
        Object.assign(G.state.flags, c.flags || {});
        Object.assign(G.state.vars, c.vars || {});
        Object.assign(G.state.quests, JSON.parse(JSON.stringify(c.quests || {})));
        for (const [id, name] of c.lanterns || []) G.Lanterns.add(id, name);
      }
      return next.call(this, S, n);
    };
    return true;
  };
  const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 5);
}

// ------------------------------------------------------------------------------------------------ the driver
class Run {
  constructor(browser, label) { this.browser = browser; this.label = label; this.errors = []; this.shotN = 0; }
  async open(query, o = {}) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await this.ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
    await this.ctx.addInitScript((r3d) => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: r3d, lang: 'zh' })); } catch (e) { /* ignore */ } }, !!o.r3d);
    await this.ctx.addInitScript(pageHelpers);
    if (o.carry) await this.ctx.addInitScript((c) => { const iv = setInterval(() => { if (window.__SQ) { window.__SQ.carry = c; clearInterval(iv); } }, 1); }, o.carry);
    this.page = await this.ctx.newPage();
    const p = this.page;
    p.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' && !IGNORE.some((r) => r.test(t))) this.errors.push(t.slice(0, 600));
      if (m.type() === 'warning' && /^\[shorelight\]/.test(t)) this.errors.push('warn: ' + t.slice(0, 300));
    });
    p.on('pageerror', (e) => this.errors.push('pageerror: ' + (e.stack || e.message).slice(0, 800)));
    await p.goto(BASE + query + (o.r3d ? '&r3lite' : ''));
    await p.waitForFunction(() => window.G && G.Debug && G.Scenes && G.Scenes.top() && window.__SQ, null, { timeout: 30000 });
    await p.evaluate(() => { G.settings.battleSpeed = 8; G.settings.difficulty = 'easy'; });
  }
  async close() { if (this.ctx) await this.ctx.close(); this.ctx = null; }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  async idle(ms = 600000) {
    const r = await this.page.evaluate((t) => G.Debug.idle(t, { frames: 3 }), ms);
    if (r === 'gameover') throw new Error(`GAME OVER at ${await this.where()}`);
    if (!r) throw new Error(`not idle after ${ms / 1000}s: ${await this.where()}`);
  }
  async until(fn, arg, ms = 600000) { await this.page.waitForFunction(fn, arg, { timeout: ms, polling: 200 }); await this.idle(); }
  where() { return this.page.evaluate(() => `map=${G.mapScene && G.mapScene.def.id} @${G.mapScene && G.mapScene.player.x},${G.mapScene && G.mapScene.player.y} top=${G.Scenes.top() && G.Scenes.top().constructor.name} busy=${G.Script.busy()} fade=${G.Render.fade.a.toFixed(2)}`); }
  flag(k) { return this.ev((k) => !!G.state.flags[k], k); }
  map() { return this.ev(() => G.mapScene && G.mapScene.def.id); }
  pos() { return this.ev(() => window.__SQ.pos()); }
  async choices(list) { await this.ev((l) => { G.Debug.choices = l.slice(); }, list); }
  async clearSaid() { await this.ev(() => { window.__SQ.said.length = 0; window.__SQ.toasts.length = 0; window.__SQ.scenes.length = 0; }); }
  said() { return this.ev(() => window.__SQ.said.slice()); }
  // walk to (x,y) (or next to it with {adj:true}); resolves when there, or when the walk set off an event that moved the
  // player to another map (returns the map id). Throws when there is no path.
  async walk(x, y, o = {}) {
    const startMap = await this.map();
    for (let guard = 0; guard < 120; guard++) {
      const at = await this.pos();
      if (at.map !== startMap && !o.anyMap) return at.map;
      const done = o.adj ? Math.abs(at.x - x) + Math.abs(at.y - y) === 1 : (at.x === x && at.y === y);
      if (done) return at.map;
      let route = null;
      // a gust (ch4 風穴) or a wandering NPC can close the only way for a moment: wait and look again
      for (let tries = 0; tries < 12 && !route; tries++) {
        route = await this.ev(([x, y, o]) => window.__SQ.plan(x, y, o), [x, y, o]);
        if (!route) await this.page.waitForTimeout(500);
      }
      if (!route) throw new Error(`no path to ${x},${y}${o.adj ? ' (adjacent)' : ''} on ${at.map} from ${at.x},${at.y}`);
      let interrupted = false;
      for (const [nx, ny] of route) {
        const r = await this.ev(([a, b]) => window.__SQ.step(a, b), [nx, ny]);
        if (r === 'event') { await this.idle(); interrupted = true; break; }
        if (r !== 'ok') { await this.page.waitForTimeout(300); await this.idle(); interrupted = true; break; }
        await this.page.waitForTimeout(o.stepMs || 25);
      }
      if (!interrupted) await this.idle();
      else if (o.once) return this.map();               // an event answered: don't walk into it again
    }
    throw new Error(`walk to ${x},${y} did not arrive: ${await this.where()}`);
  }
  // stand next to (x,y), face it, check what the game would answer, press Enter
  async interact(x, y, expect, o = {}) {
    await this.walk(x, y, Object.assign({ adj: true }, o));
    await this.ev(([x, y]) => window.__SQ.face(x, y), [x, y]);
    await this.page.waitForTimeout(80);
    const tgt = await this.ev(() => window.__SQ.target());
    if (expect && (!tgt || (expect.kind && tgt.kind !== expect.kind) || (expect.id && tgt.id !== expect.id))) {
      throw new Error(`facing ${x},${y}: expected ${JSON.stringify(expect)}, the game offers ${JSON.stringify(tgt)}`);
    }
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(150);
    await this.idle();
    return tgt;
  }
  async talk(npcId, o = {}) {
    const n = await this.ev((id) => { const n = G.mapScene.npcs.find((x) => x.id === id && x.visible && G.mapScene.npcActive(x)); return n ? { x: n.x, y: n.y } : null; }, npcId);
    if (!n) throw new Error(`NPC ${npcId} not on ${await this.map()}`);
    return this.interact(n.x, n.y, { kind: 'npc', id: npcId }, o);
  }
  async trigger(id) { await this.ev((id) => G.Debug.trigger(id), id); await this.idle(); }
  // look at an action event the player's way: walk next to one of its cells, face it, press Enter
  async use(id, o = {}) {
    const cells = await this.ev((id) => {
      const e = (G.mapScene.def.events || []).find((x) => x.id === id);
      if (!e) return null;
      const out = [];
      for (let y = e.y; y < e.y + (e.h || 1); y++) for (let x = e.x; x < e.x + (e.w || 1); x++) if (window.__SQ.plan(x, y, { adj: true })) out.push([x, y]);
      return out;
    }, id);
    if (!cells) throw new Error(`no event ${id} on ${await this.map()}`);
    if (!cells.length) throw new Error(`event ${id} on ${await this.map()} cannot be reached`);
    return this.interact(cells[0][0], cells[0][1], { kind: 'event', id }, o);
  }
  async stepOn(x, y) { await this.ev(([x, y]) => G.Debug.stepOn(x, y), [x, y]); await this.page.waitForTimeout(120); await this.idle(); }
  async levelTo(lv) { await this.ev((lv) => { for (const id of ['xinghe', 'hongying', 'yungui', 'baizhi']) if (G.state.members[id]) G.Story.ensureLevel(id, lv); G.Party.healAll(); }, lv); }
  async heal() { await this.ev(() => G.Party.healAll()); }
  quest(id) { return this.ev((id) => { const q = G.state.quests[id]; const d = G.Data.quests[id]; return q ? { stage: q.stage, done: !!q.done, text: d && d.stages ? d.stages[q.stage] : null } : null; }, id); }
  async shot(name, force) {
    if (!SHOTS && !force) return;
    await this.page.waitForTimeout(300);
    await this.page.screenshot({ path: path.join(OUT, `${this.label}_${String(++this.shotN).padStart(2, '0')}_${name}.png`) });
  }
  async health() {
    const last = await this.ev(() => (G.lastError ? String(G.lastError.stack || G.lastError).slice(0, 500) : null));
    const errs = this.errors.slice().concat(last ? ['G.lastError: ' + last] : []);
    this.errors.length = 0;
    await this.ev(() => { G.lastError = null; });
    return errs;
  }
}

module.exports = { Run, pageHelpers, BASE, ROOT };

// ------------------------------------------------------------------------------------------------ part 1: 七仙蕈 chain
// The six earlier 七仙蕈, each picked the player's way on its own map, one page, one continuous G.state. `pre` = the
// main-story flags / vars that chapter's map expects at that point of the story (never a mushroom flag, the counter or
// the quest): they are what the player's own progress would have set.
const MUSH_CHAIN = [
  { ch: 3, flag: 'mush_1', name: '杉皮蕈', map: 'bangka_bopiliao', at: [36, 2], vision: 'offered', where: '艋舺・剝皮寮 杉木堆 (36–37,2), night' },
  { ch: 4, flag: 'mush_ch4', name: '風穴石耳', map: 'wind_cave_1', from: [20, 42], at: [37, 2], vision: 'eat', stand: [36, 2], where: '五指山風穴 深處 (37,2), behind the 靈視-only gap at 35,2' },
  { ch: 5, flag: 'mush_ch5', name: '憶蕈', map: 'luo_1f', from: [19, 26], at: [11, 4], pre: { flags: ['ch5_enter'] }, where: '鹿港・洛家老宅 榕樹氣根 (11,4)' },
  { ch: 6, flag: 'mush_ch6', name: '潮音蕈', map: 'linto', from: [18, 34], at: [22, 21], vision: 'eat', touch: true, where: '府城・林投林 (22–23,21–22), 靈視' },
  { ch: 7, flag: 'mush_ch7', name: '雲芝', map: 'cloud_forest', from: [20, 41], at: [8, 20], where: '雲霧林 發光菇叢 (8,20)' },
  { ch: 9, flag: 'mush_ch9', name: '潮汐蕈', map: 'longkeng_caves', from: [21, 3], at: [23, 19], where: '龍坑 珊瑚礁 (23,19–20)' },
];
async function partMush(browser) {
  const R = new Run(browser, 'mush');
  const carry = { flags: {}, vars: {}, quests: {} };
  const chain = [];
  try {
    // chapter 3, 艋舺 at night, 雲歸 in the party (ch3_yungui_join); 七彩靈蕈 bought at the 青草店 (a shop item, not quest state)
    await R.open('?debug&map=bangka&chapter=3&autoplay=1&party=xinghe,baizhi,hongying,yungui&lv=14&flags=ch3_yungui_join,yuyuan_joined,mochi_joined');
    await R.idle();
    await R.ev(() => { G.Inv.add('lingxun', 6); });
    // quest start: 青草阿伯 (on 艋舺's main street, a normal NPC with a name tag)
    await R.talk('bk_herbman');
    let q = await R.quest('q_tuanzi_mush');
    const startOk = q && q.stage === 1 && /剝皮寮/.test(q.text) && /靈視/.test(q.text);
    result('q_tuanzi_mush start (ch3 青草阿伯)', startOk, `quest after talking: ${JSON.stringify(q)}`);
    for (const m of MUSH_CHAIN) {
      const before = await R.ev(() => G.state.vars.tuanzi_mush || 0);
      let ok = false, why = '', clue = '';
      try {
        if (m.ch !== 3) {
          await R.ev(([m]) => {
            G.state.chapter = m.ch;
            for (const f of (m.pre && m.pre.flags) || []) G.state.flags[f] = true;
            G.state.vars.vision = 0;
          }, [m]);
          await R.ev(([id, x, y]) => G.Script.run((S) => S.warp(id, x, y, 'up')), [m.map, m.from[0], m.from[1]]);
          await R.idle();
        } else {
          await R.walk(55, 10);                                 // the east gate of 艋舺 → 剝皮寮
        }
        if ((await R.map()) !== m.map) throw new Error(`not on ${m.map}: ${await R.where()}`);
        // the quest log names the place (chapter starts point stage 3..7 at the chapter's mushroom; the ch3 pickup reads stage 1)
        const stageFor = { 3: 1, 4: 3, 5: 4, 6: 5, 7: 6, 9: 7 }[m.ch];
        clue = await R.ev((s) => G.Data.quests.q_tuanzi_mush.stages[s], stageFor);
        const visual = await R.ev(([x, y]) => G.mapScene.objects.filter((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1 && /mushroom/.test(o.t)).map((o) => o.t + (o.spirit ? '(靈視)' : '')), m.at);
        const ev = await R.ev(([x, y]) => (G.mapScene.def.events || []).filter((e) => x >= e.x && x < e.x + (e.w || 1) && y >= e.y && y < e.y + (e.h || 1)).map((e) => ({ id: e.id, spirit: !!e.spirit, hint: !!e.hint })), m.at);
        if (m.vision === 'eat') {
          // walk up first (靈視 only lasts ~75 s), then eat a 七彩靈蕈 like the item menu does
          if (m.stand) await R.walk(m.stand[0] - 2, m.stand[1]); else await R.walk(m.at[0], m.at[1], { adj: true });
          await R.ev(() => window.__SQ.eatLingxun());
        }
        await R.choices([0]);                                   // ch3: 「吃一朵七彩靈蕈，開啟靈視」
        if (m.touch) await R.walk(m.at[0], m.at[1]);
        else if (m.stand) { await R.walk(m.stand[0], m.stand[1]); await R.ev(([x, y]) => window.__SQ.face(x, y), m.at); await R.page.waitForTimeout(80); await R.page.keyboard.press('Enter'); await R.page.waitForTimeout(150); await R.idle(); }
        else await R.interact(m.at[0], m.at[1], { kind: 'event' });
        const after = await R.ev(([f]) => ({ flag: !!G.state.flags[f], n: G.state.vars.tuanzi_mush || 0, q: G.state.quests.q_tuanzi_mush }), [m.flag]);
        ok = after.flag && after.n === before + 1 && after.q && !after.q.done;
        why = `flag ${after.flag}, counter ${before}→${after.n}, quest ${JSON.stringify(after.q)}`;
        chain.push({ ch: m.ch, name: m.name, where: m.where, clue: `${clue}${visual.length ? ' · visual: ' + visual.join('/') : ' · NO visual object'}${ev.map((e) => (e.spirit ? ' · 靈視-only event' : '') + (e.hint ? ' · hint tag' : '')).join('')}`, ok });
      } catch (e) { why = String(e.message || e); chain.push({ ch: m.ch, name: m.name, where: m.where, clue, ok: false }); }
      const errs = await R.health();
      if (errs.length) { ok = false; why += ' · errors: ' + errs.join(' | '); }
      result(`七仙蕈 ch${m.ch} ${m.name} pickup`, ok, why);
    }
    const st = await R.ev(() => ({ flags: G.state.flags, vars: G.state.vars, quests: G.state.quests }));
    for (const k of Object.keys(st.flags)) if (/^mush_/.test(k)) carry.flags[k] = st.flags[k];
    carry.vars.tuanzi_mush = st.vars.tuanzi_mush;
    if (st.quests.q_tuanzi_mush) carry.quests.q_tuanzi_mush = st.quests.q_tuanzi_mush;
  } catch (e) {
    result('七仙蕈 chain', false, String(e.stack || e).slice(0, 600));
  } finally { await R.close(); }
  console.log('  七仙蕈 chain:\n' + chain.map((c) => `    ch${c.ch} ${c.name} @ ${c.where}: ${c.ok ? 'ok' : 'FAILED'} — clue: ${c.clue}`).join('\n'));
  console.log('  carry-in → ch11: ' + JSON.stringify(carry));
  return carry;
}

// ------------------------------------------------------------------------------------------------ source scans
// every 心燈 the game can light (S.lantern('id', 'name') across js/maps) and the ch11 callback tables (FOG / RISE)
function lanternSources() {
  const dir = path.join(ROOT, 'js', 'maps');
  const lit = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!/^ch\d+_.*\.js$/.test(f)) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/S\.lantern\(\s*'([a-z0-9_]+)'\s*,\s*'([^']+)'/g)) lit.set(m[1], { name: m[2], file: f });
  }
  const src = fs.readFileSync(path.join(dir, 'ch11_farshore.js'), 'utf8');
  const fog = [], rise = [];
  for (const m of src.matchAll(/^\s*\{ ids: \[([^\]]*)\].*?lines: \[\['([^']*)', '([^']*)'\]/gm)) fog.push({ ids: m[1].match(/[a-z0-9_]+/g), line: m[3] });
  for (const m of src.matchAll(/^\s*\{ place: '(\w+)', (?:always: true|ids: \[([^\]]*)\]), text: '([^']*)'(?:.*?voiceIf: \['([a-z0-9_]+)', \['[^']*', '([^']*)'\])?/gm)) {
    rise.push({ place: m[1], ids: m[2] ? m[2].match(/[a-z0-9_]+/g) : [], text: m[3], voiceIf: m[4] || null, voice: m[5] || null });
  }
  return { lit, fog, rise };
}

// the 媽宮 smith's kit (what ch11.test.js equips; a player buys it with the chapter's gold)
async function smithKit(R) {
  await R.ev(() => {
    const kit = { xinghe: ['c11_sw_xuanwu', 'c11_ar_coral'], hongying: ['c11_sp_jinggu', 'c11_ar_haiwen'], yungui: ['c11_fn_leishan', 'c11_ar_coral'] };
    for (const [id, items] of Object.entries(kit)) {
      for (const it of items.concat(['c11_hd_douli', 'c11_ft_bu', 'c11_ac_juhua'])) {
        const slot = G.Data.items[it].type;
        if (G.state.members[id].equip[slot] === it) continue;
        G.Inv.add(it, 1); G.Party.equip(id, slot, it);
      }
    }
    G.Party.healAll();
  });
}

// ------------------------------------------------------------------------------------------------ part 2: 第十一章
// One continuous ?startch=11 game. Order (a player's, with the detours that exercise the three points of no return):
//   天后宮 → start 海賊的寶藏 / 石滬的缺口 → 烏鬚船主 → 玄武嶼 → 鎖魂將 → helm 「出航」 (warning names what is open →
//   再等等) → back across the 石滬灘 to finish 石滬 / 寶藏 / 玄武蕈 → 出航 (no warning now) → 鯤 → 「無光之霧」 (warning:
//   溺魂暗流 not visited → 再等等) → 溺魂暗流 → 無光之霧 → 彼岸 (平安信) → tower → 5F: five memories, 千年燈塔守, stairs
//   (warning → 再等等) → sixth memory → 燈心之門 → finale (真結局) ; then the normal ending from the pre-finale save.
async function partMain(browser, carry) {
  const S = lanternSources();
  const earlier = [...S.lit.entries()].filter(([, v]) => v.file !== 'ch11_farshore.js' && v.file !== 'test.js').map(([id, v]) => [id, v.name]);
  const R = new Run(browser, 'A');
  let preFinale = null;
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { result(name, false, String(e.message || e).slice(0, 500) + ' @ ' + await R.where().catch(() => '?')); throw e; }
  };
  const errs = async (name) => { const e = await R.health(); if (e.length) result(name + ' (console)', false, e.join(' | ').slice(0, 600)); return !e.length; };
  try {
    await R.open('?debug&startch=11&autoplay=1', { carry: Object.assign({}, carry, { lanterns: earlier }) });
    await R.until(() => G.state.flags.ch11_magong && G.mapScene && G.mapScene.def.id === 'penghu_tianhou');
    note(`carried in: ${earlier.length} 心燈 from chapters 1–10, 七仙蕈 ${JSON.stringify(carry.flags)} counter ${carry.vars && carry.vars.tuanzi_mush}`);
    const q0 = await R.quest('q_tuanzi_mush');
    const mushLogOk = q0 && q0.stage === 8 && /澎湖/.test(q0.text) && /玄武岩柱/.test(q0.text);
    // ---------------------------------------------------------------- 天后宮 (main)
    await step('main: 拈香', async () => {
      await R.interact(11, 6, { kind: 'event', id: 'incense_sky' });
      await R.interact(8, 4, { kind: 'event', id: 'incense_in' });
      if (!(await R.flag('ch11_tianhou'))) throw new Error('ch11_tianhou not set');
      await R.walk(8, 13);                                        // out through the 三川門
    });
    // ---------------------------------------------------------------- 媽宮: start 寶藏 + 石滬, 許秀才
    let treasureStart, weirStart, weirHint;
    await step('q_ch11_treasure (start)', async () => {
      await R.clearSaid();
      await R.talk('ph_kid_zhu');
      const q = await R.quest('q_ch11_treasure');
      treasureStart = q && q.stage === 0 && /塔公/.test(q.text) && /東北/.test(q.text);
      if (!treasureStart) throw new Error('quest log after 阿珠: ' + JSON.stringify(q));
    });
    await step('q_penghu_weir (start)', async () => {
      await R.talk('ph_atian');
      const q = await R.quest('q_penghu_weir');
      weirStart = q && q.stage === 0 && /添家滬/.test(q.text);
      await R.clearSaid();
      await R.talk('ph_atian');                                   // asked again: where is it?
      weirHint = (await R.said()).some(([, t]) => /東北/.test(t));
      if (!weirStart || !weirHint) throw new Error(`quest ${JSON.stringify(q)}, 阿添伯 points NE: ${weirHint}`);
    });
    await R.talk('ph_xu'); await R.talk('ph_xu');
    // ---------------------------------------------------------------- 石滬灘 → 烏鬚船主 → 玄武嶼 → 鎖魂將 (main)
    await step('main: 烏鬚船主', async () => {
      await R.walk(25, 35);                                       // 南口 → 石滬灘
      if ((await R.map()) !== 'penghu_flats') throw new Error('not on the flats');
      await R.levelTo(41); await smithKit(R);
      await R.walk(20, 32);                                       // the wreck: 11-05
      if (!(await R.flag('ch11_captain'))) throw new Error('captain not beaten');
      await R.walk(7, 43);
      if ((await R.map()) !== 'xuanwu_shore') throw new Error('not on 玄武嶼');
    });
    await step('main: 玄武嶼', async () => {
      await R.levelTo(43);
      await R.walk(2, 18); await R.walk(20, 16);
      for (let i = 1; i <= 5; i++) { await R.choices([0]); await R.use('lamp' + i); }
      await R.walk(21, 2); await R.use('study'); await R.walk(2, 5);
      for (let i = 1; i <= 6; i++) await R.use('letter' + i);
      await R.walk(6, 8);                                         // out of the cell
      await R.choices([0]); await R.use('north');
      await R.heal(); await R.walk(21, 2);
      if (!(await R.flag('ch11_jailer')) || (await R.map()) !== 'wangboat_blacktide') throw new Error('鎖魂將 / back on the 王船');
    });
    await errs('penghu+xuanwu');
    // ---------------------------------------------------------------- point of no return #1: 出航 with 澎湖 still open
    let ponr1 = '';
    await step('point of no return: 出航', async () => {
      await R.clearSaid();
      await R.choices([0, '再等等']);
      await R.talk('chenbo');
      ponr1 = (await R.said()).map(([, t]) => t).find((t) => /前方將無法回頭/.test(t)) || '';
      const sailed = await R.flag('ch11_sail');
      if (!/石滬的缺口（心燈）/.test(ponr1) || !/海賊的寶藏/.test(ponr1) || !/雲歸的蕈譜/.test(ponr1) || sailed) throw new Error(`warning: 「${ponr1}」 sailed=${sailed}`);
    });
    result('point of no return: 出航 names 石滬・寶藏・蕈譜, 再等等 stays', true);
    // ---------------------------------------------------------------- back to 澎湖 on foot: 石滬 step 2
    await step('q_penghu_weir', async () => {
      await R.walk(27, 8);                                        // gangway → 玄武嶼
      await R.walk(9, 39);                                        // → 石滬灘
      if ((await R.map()) !== 'penghu_flats') throw new Error('not back on the flats');
      const vis = await R.ev(() => G.mapScene.objects.filter((o) => o.t === 'water_lantern' && o.x >= 38 && o.x <= 44 && G.mapScene.objActive(o)).length);
      if (!vis) throw new Error('no soul-lights drawn at the 添家滬');
      await R.walk(41, 7);                                        // into the weir's mouth → 11 阿湧
      let q = await R.quest('q_penghu_weir');
      if (!(await R.flag('ch11_weir_2')) || q.stage !== 1 || !/阿添伯/.test(q.text)) throw new Error('step 2: ' + JSON.stringify(q));
      await R.walk(27, 0);                                        // back to 媽宮
      await R.choices([1]); await R.talk('ph_atian');             // 「……那就算了。」
      if (await R.flag('ch11_weir_3')) throw new Error('refusing advanced the quest');
      await R.choices([0]); await R.talk('ph_atian');
      q = await R.quest('q_penghu_weir');
      if (!(await R.flag('ch11_weir_3')) || q.stage !== 2) throw new Error('step 3: ' + JSON.stringify(q));
    });
    // ---------------------------------------------------------------- 海賊的寶藏 (塔公 on the NE flats)
    await step('q_ch11_treasure', async () => {
      await R.clearSaid();
      await R.interact(46, 1, { kind: 'event', id: 'tower_po' });   // the short one first: 紅纓 says it's 塔婆
      const poHint = (await R.said()).some(([, t]) => /塔婆/.test(t) && /塔公/.test(t));
      await R.interact(43, 1, { kind: 'event', id: 'tower_gong' });
      const r = await R.ev(() => ({ done: G.Quests.isDone('q_ch11_treasure'), coin: G.Inv.has('c11_pirate_coin'), shell: G.Inv.count('c11_shell') }));
      if (!poHint || !r.done || !r.coin || r.shell < 10) throw new Error(`塔婆 hint ${poHint}, ${JSON.stringify(r)}`);
    });
    result('q_ch11_treasure 海賊的寶藏', true);
    // ---------------------------------------------------------------- 石滬 step 4 (阿添伯 follows)
    await step('q_penghu_weir', async () => {
      await R.walk(25, 35);
      const trail = await R.ev(() => !!G.mapScene.npcs.find((n) => n.id === 'ph_atian_f'));
      await R.walk(41, 9);                                        // 添家滬 → 11 兄弟
      const r = await R.ev(() => ({ lit: G.Lanterns.has('lantern_penghu_weir'), done: G.Quests.isDone('q_penghu_weir'), stone: G.Inv.has('c11_ac_weir_stone') }));
      if (!trail || !r.lit || !r.done || !r.stone) throw new Error(`阿添伯 trails ${trail}, ${JSON.stringify(r)}`);
    });
    result('q_penghu_weir 石滬的缺口 → 心燈 lantern_penghu_weir', true);
    // ---------------------------------------------------------------- 玄武蕈 + 七仙蕈 completion
    await step('q_tuanzi_mush', async () => {
      if (!mushLogOk) throw new Error('quest log at the start of ch11: ' + JSON.stringify(q0));
      await R.interact(7, 12, { kind: 'chest' });                 // the chest beside it: 七彩靈蕈 ×2
      if (!(await R.ev(() => G.Inv.has('lingxun')))) throw new Error('no 七彩靈蕈 from the chest');
      await R.clearSaid();
      await R.choices([0]);                                       // 「吃一朵七彩靈蕈，開啟靈視」
      await R.interact(8, 8, { kind: 'event', id: 'mush7' });     // the column, without 靈視
      const said = await R.said();
      const hinted = said.some(([, t]) => /麻糬坐在這根玄武岩柱前/.test(t));
      const glow = await R.ev(() => G.mapScene.objects.some((o) => o.t === 'mushroom_glow' && o.x === 9 && o.y === 8));
      const r = await R.ev(() => ({ f: !!G.state.flags.mush_7, n: G.state.vars.tuanzi_mush, done: G.Quests.isDone('q_tuanzi_mush'), bell: G.Inv.has('c11_ac_cosmic'), skill: G.state.members.yungui.skills.includes('c11_yg_cosmic') }));
      if (!hinted || !glow || !r.f || r.n !== 7 || !r.done || !r.bell || !r.skill) throw new Error(`hint ${hinted}, glow ${glow}, ${JSON.stringify(r)}`);
    });
    result('q_tuanzi_mush 雲歸的蕈譜 (玄武蕈, 7/7 → 七色蕈鈴 + 萬色符)', true);
    await errs('penghu side quests');
    // ---------------------------------------------------------------- 出航 (nothing open now) → 鯤
    await step('main: 出航', async () => {
      await R.walk(7, 43);                                        // → 玄武嶼
      await R.interact(30, 36, { kind: 'event', id: 'board' });
      await R.ev(() => { G.Debug.log.length = 0; });
      await R.choices([0]); await R.talk('chenbo');
      await R.until(() => G.state.flags.ch11_leg1);
      const log = await R.ev(() => G.Debug.log.filter((l) => /pointOfNoReturn/.test(l)));
      if (!log.some((l) => /nothing open/.test(l))) throw new Error('warning log: ' + JSON.stringify(log));
      await R.levelTo(46); await R.heal();
      await R.choices(['鯤之淵']); await R.talk('chenbo');
      if (!(await R.flag('ch11_kun'))) throw new Error('鯤 not beaten');
    });
    // ---------------------------------------------------------------- 唐山客: point of no return #2, then the detour
    await step('q_tangshan', async () => {
      await R.clearSaid();
      await R.choices(['無光之霧', '再等等']); await R.talk('chenbo');
      const w = (await R.said()).map(([, t]) => t).find((t) => /前方將無法回頭/.test(t)) || '';
      if (!/1 盞心燈未點亮/.test(w) || (await R.flag('ch11_fog'))) throw new Error(`無光之霧 warning 「${w}」, fog=${await R.flag('ch11_fog')}`);
      result('point of no return: 無光之霧 counts the 溺魂暗流 心燈, 再等等 stays', true);
      await R.clearSaid();
      await R.choices(['暗流', 0]); await R.talk('chenbo');
      // the clue: 陳伯's helm menu offers the detour once the 海圖 is in the bag (its description: 「一條有人在唱歌的暗流」)
      const menuLine = (await R.said()).some(([w2, t]) => w2 === '<choice>' && /暗流裡有人在唱歌/.test(t));
      const q = await R.quest('q_tangshan');
      if (!menuLine || !(await R.flag('ch11_tangshan_letter')) || !(await R.ev(() => G.Inv.has('c11_pingan_letter'))) || q.stage !== 1 || !/彼岸/.test(q.text)) throw new Error(`陳伯 hint ${menuLine}, quest ${JSON.stringify(q)}`);
      await R.ev(() => { G.Debug.log.length = 0; });
      await R.clearSaid();
      await R.choices(['無光之霧']); await R.talk('chenbo');
      await R.until(() => G.state.flags.ch11_farshore && G.mapScene.def.id === 'farshore_field');
    });
    const fogSaid = await R.said();
    await errs('voyage');
    // ---------------------------------------------------------------- 彼岸花原: 唐山阿婆
    await step('q_tangshan', async () => {
      const mom = await R.ev(() => !!G.mapScene.npcs.find((n) => n.id === 'fs_ts_mother' && n.visible));
      await R.walk(27, 12);                                       // up the glowing path: 蘇婉, then the 小渡口
      const r = await R.ev(() => ({ lit: G.Lanterns.has('lantern_tangshan'), done: G.Quests.isDone('q_tangshan'), coin: G.Inv.has('c11_ac_tangshan_coin'), letter: G.Inv.has('c11_pingan_letter') }));
      if (!mom || !r.lit || !r.done || !r.coin || r.letter) throw new Error(`阿婆 visible ${mom}, ${JSON.stringify(r)}`);
    });
    result('q_tangshan 唐山客的平安信 → 心燈 lantern_tangshan', true);
    // ---------------------------------------------------------------- 彼岸燈塔 1F–4F (main, as ch11.test.js)
    await step('main: tower', async () => {
      await R.levelTo(45);
      await R.walk(27, 2);
      if ((await R.map()) !== 'farshore_tower_1') throw new Error('not in the tower');
      const up = async (n) => { await R.walk(11, 3); if ((await R.map()) !== 'farshore_tower_' + n) throw new Error(`stairs up to ${n}F: ${await R.where()}`); };
      await R.use('echo'); await up(2);
      await R.use('echo');
      for (const id of ['wx_8', 'wx_16', 'wx_7', 'wx_15', 'wx_12']) await R.use(id);
      await up(3); await R.use('echo');
      await R.walk(11, 4);                                        // P3: across the sinking planks
      await up(4);
      await R.use('echo'); await up(5);
      await R.use('echo');
      if (!(await R.flag('ch11_tower_5'))) throw new Error('5F echo');
    });
    // ---------------------------------------------------------------- 她的記憶: walk to the drifting lamps
    await step('q_baizhi_memory', async () => {
      const q = await R.quest('q_baizhi_memory');
      if (!q || q.stage !== 0) throw new Error('not started by the 5F echo: ' + JSON.stringify(q));
      const lampsAt = () => R.ev(() => (G.mapScene._mem || []).filter((m) => !G.state.flags['ch11_mem_' + m.k]).map((m) => ({ k: m.k, at: m[m.at] })));
      const got = () => R.ev(() => [1, 2, 3, 4, 5, 6].filter((k) => G.state.flags['ch11_mem_' + k]).length);
      await R.page.waitForTimeout(300);
      // five of them before the guardian; the sixth after (it must still be there)
      for (let guard = 0; guard < 30 && (await got()) < 5; guard++) {
        const p = await R.pos(); const list = await lampsAt();
        if (!list.length) throw new Error('no memory lamps drawn on 5F');
        list.sort((a, b) => (Math.abs(a.at[0] - p.x) + Math.abs(a.at[1] - p.y)) - (Math.abs(b.at[0] - p.x) + Math.abs(b.at[1] - p.y)));
        const t = list.find((l) => l.k !== 1) || list[0];               // keep #1 (bottom-left) for after the boss
        await R.choices([0]);                                           // 「麻糬，去！」 when a shy lamp keeps hopping
        const one = list.find((l) => l.k === 1);
        await R.walk(t.at[0], t.at[1], { stepMs: 140, avoid: one && t.k !== 1 ? [one.at] : [] });
        await R.page.waitForTimeout(250); await R.idle();
      }
      if ((await got()) < 5) throw new Error('could not collect 5 memory lamps: ' + JSON.stringify(await lampsAt()));
      await R.heal();
      await R.walk(11, 6);                                              // 11-23 千年燈塔守
      if (!(await R.flag('ch11_warden'))) throw new Error('千年燈塔守 not beaten');
      // point of no return #3
      await R.clearSaid();
      await R.choices(['再等等']);
      await R.walk(11, 3, { once: true });
      const w = (await R.said()).map(([, t]) => t).find((t) => /前方將無法回頭/.test(t)) || '';
      if (!/她的記憶（心燈）/.test(w) || (await R.map()) !== 'farshore_tower_5') throw new Error(`stairs warning 「${w}」 map ${await R.map()}`);
      result('point of no return: 燈心之門 names 她的記憶, 再等等 stays on 5F', true);
      for (let guard = 0; guard < 10 && (await got()) < 6; guard++) {
        const list = await lampsAt();
        if (!list.length) break;
        await R.choices([0]);
        await R.walk(list[0].at[0], list[0].at[1], { stepMs: 140 });
        await R.page.waitForTimeout(250); await R.idle();
      }
      const r = await R.ev(() => ({ all: !!G.state.flags.ch11_mem_all, lit: G.Lanterns.has('lantern_baizhi_memory'), done: G.Quests.isDone('q_baizhi_memory'), lamp: G.Inv.has('c11_ac_memory_lamp') }));
      if (!r.all || !r.lit || !r.done || !r.lamp) throw new Error(JSON.stringify(r));
    });
    result('q_baizhi_memory 她的記憶 → 心燈 lantern_baizhi_memory', true);
    await errs('tower');
    // ---------------------------------------------------------------- 燈心之門 → 一息界 (main)
    await step('main: 一息界', async () => {
      await R.ev(() => { G.Debug.log.length = 0; });
      await R.walk(11, 3, { once: true });
      await R.until(() => G.mapScene.def.id === 'breath_realm' && G.state.flags.ch11_breath);
      await R.levelTo(46); await R.choices(['好，來玩']); await R.heal();
      await R.walk(19, 24); await R.walk(18, 10);
      for (const [x, y] of [[19, 8], [16, 3], [22, 6]]) {
        await R.ev(([x, y]) => { const o = G.mapScene.objects.find((ob) => ob.t === 'crystal' && ob.x === x && ob.y === y); return G.Script.run(async (S) => { await o.interact(S, o); }); }, [x, y]);
        await R.idle();
      }
      if (!(await R.flag('ch11_seat_lit'))) throw new Error('mandala');
      await R.levelTo(48);
      preFinale = await R.ev(() => JSON.stringify({ state: G.state, map: G.mapScene.def.id, x: G.mapScene.player.x, y: G.mapScene.player.y }));
    });
    await errs('breath');
    // ---------------------------------------------------------------- 真結局 + 心燈 callbacks
    const lit = await R.ev(() => Object.keys(G.state.lanterns));
    await R.clearSaid();
    await R.ev(() => G.Debug.stepOn(19, 6));
    await toTitle(R);
    const fin = await R.ev(() => ({ f: G.state.flags, n: G.Lanterns.count(), th: G.Lanterns.THRESHOLD }));
    const endSaid = await R.said();
    const scenes = await R.ev(() => window.__SQ.scenes.filter((s) => s.list));
    const islandTexts = (scenes.find((s) => s.name === 'IslandScene') || { list: [] }).list;
    const missFog = [], missRise = [];
    for (const id of lit) {
      if (id !== 'lantern_baizhi_memory') {                      // lit after the fog
        const f = S.fog.find((e) => e.ids.includes(id));
        if (!f || !fogSaid.some(([, t]) => t === f.line)) missFog.push(id);
      }
      const r = S.rise.find((e) => e.ids.includes(id) || e.voiceIf === id);
      if (!r || !islandTexts.includes(r.text)) missRise.push(id);
    }
    result(`endings: 真結局「千燈」 with ${fin.n} 心燈 (≥ ${fin.th})`, fin.n >= fin.th && !!fin.f.ending_true && !fin.f.ending_normal && !!fin.f.game_clear, JSON.stringify({ n: fin.n, true: fin.f.ending_true, normal: fin.f.ending_normal }));
    result(`endings: 無光之霧 callback for each of ${lit.length - 1} lanterns lit before the fog`, !missFog.length, 'missing: ' + missFog.join(', '));
    result(`endings: 全島的燈 (E-T1) entry for each of ${lit.length} lit lanterns`, !missRise.length && islandTexts.length > 0, `missing: ${missRise.join(', ')} (scene list ${islandTexts.length})`);
    result('endings: 湯先生 line (xd_lighthouse_home) in the true ending', !lit.includes('xd_lighthouse_home') || endSaid.some(([, t]) => /不用燒掉自己/.test(t)), 'not said');
    await errs('true ending');
  } catch (e) {
    if (!RESULTS.some((r) => !r.ok)) result('ch11 run', false, String(e.stack || e).slice(0, 600));
  } finally { await R.close(); }
  return preFinale;
}

// watch the ending to the title screen, holding the skip key through the credits
async function toTitle(R, ms = 25 * 60000) {
  const t0 = Date.now();
  let held = false;
  while (Date.now() - t0 < ms) {
    const top = await R.ev(() => { const t = G.Scenes.top(); return t && t.constructor ? t.constructor.name : ''; });
    if (top === 'CreditsScene' && !held) { await R.page.keyboard.down('ControlLeft'); held = true; }
    if (top !== 'CreditsScene' && held) { await R.page.keyboard.up('ControlLeft'); held = false; }
    if (/GameOver/.test(top)) throw new Error('GAME OVER during the finale: ' + await R.where());
    if (top === 'TitleScene') { if (held) await R.page.keyboard.up('ControlLeft'); return true; }
    await R.page.waitForTimeout(250);
  }
  throw new Error('never reached the title screen: ' + await R.where());
}

// ------------------------------------------------------------------------------------------------ part 3: 普通結局
// the pre-finale save of part 2, reloaded with exactly 13 心燈 (→ 彼岸) and exactly 14 (→ 千燈): the threshold boundary
async function partNormal(browser, snapJson, keep = 13, expect = 'normal') {
  const R = new Run(browser, 'B' + keep);
  const label = expect === 'true' ? '真結局「千燈」' : '普通結局「彼岸」';
  try {
    if (!snapJson) throw new Error('no pre-finale save from the main run');
    const snap = JSON.parse(snapJson);
    // this chapter's three + the earliest (keep − 3) carried ones: the threshold boundary
    const ids = Object.keys(snap.state.lanterns).sort((a, b) => (/^lantern_(penghu_weir|tangshan|baizhi_memory)$/.test(b) ? 1 : 0) - (/^lantern_(penghu_weir|tangshan|baizhi_memory)$/.test(a) ? 1 : 0));
    for (const id of ids.slice(keep)) delete snap.state.lanterns[id];
    await R.open('?debug&map=sandbox&x=5&y=5&autoplay=1');
    await R.idle();
    await R.ev((st) => { G.state = Object.assign(G.newState(), st); }, snap.state);
    await R.ev((s) => G.Script.run((S) => S.warp(s.map, s.x, s.y, 'up', { reload: true, fade: 0 })), snap);
    await R.idle();
    const n = await R.ev(() => G.Lanterns.count());
    await R.clearSaid();
    await R.ev(() => G.Debug.stepOn(19, 6));
    await toTitle(R);
    const f = await R.ev(() => G.state.flags);
    const scenes = await R.ev(() => window.__SQ.scenes.map((s) => s.name));
    const ok = n === keep && (expect === 'true' ? !!f.ending_true && !f.ending_normal : !!f.ending_normal && !f.ending_true) && !!f.game_clear;
    result(`endings: ${label} with exactly ${keep} 心燈 (threshold 14)`, ok, JSON.stringify({ n, normal: f.ending_normal, true: f.ending_true, scenes: scenes.slice(-6) }));
    const e = await R.health();
    result(`endings: ${label} (${keep}) console`, !e.length, e.join(' | ').slice(0, 600));
  } catch (e) {
    result(`endings: ${label} (${keep})`, false, String(e.stack || e).slice(0, 600));
  } finally { await R.close(); }
}

// --3d: renderer spot-check screenshots (visual only — these presets set map flags to frame the shot; no quest is played)
async function part3D(browser) {
  const shots = [
    { name: '3d_flats_mush_novision', q: '?debug&map=penghu_flats&x=9&y=10&chapter=11&autoplay=1&flags=ch11_flats', vision: false },
    { name: '3d_flats_mush_vision', q: '?debug&map=penghu_flats&x=9&y=10&chapter=11&autoplay=1&flags=ch11_flats', vision: true },
    { name: '3d_magong_towers', q: '?debug&map=penghu_magong&x=44&y=4&chapter=11&autoplay=1&flags=ch11_start,ch11_magong,ch11_tianhou' },
    { name: '3d_tower5_memories', q: '?debug&map=farshore_tower_5&x=11&y=13&chapter=11&autoplay=1&flags=ch11_tower_5' },
  ];
  for (const s of shots) {
    const R = new Run(browser, '3d');
    try {
      await R.open(s.q, { r3d: true });
      await R.idle();
      if (s.vision) await R.ev(() => G.Script.S.vision(60));
      await R.page.waitForTimeout(6000);
      await R.page.screenshot({ path: path.join(OUT, s.name + '.png') });
      const info = await R.ev(() => ({ r3d: !!(G.mapScene && G.mapScene.view3d), glow: G.mapScene.objects.filter((o) => o.t === 'mushroom_glow').map((o) => [o.x, o.y, G.mapScene.objActive(o)]) }));
      const e = await R.health();
      result(`3d spot-check ${s.name}`, info.r3d && !e.length, `3D view ${info.r3d}; ${e.join(' | ').slice(0, 300)}`);
      note(`${s.name}: ${JSON.stringify(info)} → ${path.join(OUT, s.name + '.png')}`);
    } catch (e) { result(`3d spot-check ${s.name}`, false, String(e.message || e)); } finally { await R.close(); }
  }
}

// static: every lantern the game can light has a 無光之霧 and a 全島的燈 callback
function staticCallbacks() {
  const S = lanternSources();
  const ids = [...S.lit.keys()].filter((id) => S.lit.get(id).file !== 'test.js');
  const noFog = ids.filter((id) => id !== 'lantern_baizhi_memory' && !S.fog.some((f) => f.ids.includes(id)));
  const noRise = ids.filter((id) => !S.rise.some((r) => r.ids.includes(id) || r.voiceIf === id));
  result(`endings: ${ids.length} lightable 心燈 (S.lantern in js/maps) all have FOG + RISE callbacks`, ids.length === 28 && !noFog.length && !noRise.length, `count ${ids.length}; no FOG: ${noFog.join(', ')}; no RISE: ${noRise.join(', ')}`);
}

// ------------------------------------------------------------------------------------------------ main
if (require.main === module && !process.argv.includes('--probe')) {
  (async () => {
    const t0 = Date.now();
    const browser = await chromium.launch(R3D ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
    try {
      if (R3D) { await part3D(browser); throw null; }
      staticCallbacks();
      let carry = null;
      if (!ONLY || ONLY === 'mush' || ONLY === 'main') carry = await partMush(browser);
      if (!ONLY || ONLY === 'main' || ONLY === 'endings') {
        const snap = await partMain(browser, carry || {});
        if (snap) fs.writeFileSync(path.join(OUT, 'prefinale.json'), snap);
        await partNormal(browser, snap, 13, 'normal');
        await partNormal(browser, snap, 14, 'true');
      }
    } catch (e) {
      if (e !== null) result('script', false, String(e.stack || e).slice(0, 800));
    } finally { await browser.close(); }
    const bad = RESULTS.filter((r) => !r.ok);
    console.log(`\nch11 side quests: ${bad.length ? 'FAIL' : 'PASS'} — ${RESULTS.length - bad.length}/${RESULTS.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    process.exit(bad.length ? 1 : 0);
  })();
}

// ------------------------------------------------------------------------------------------------ probe (dev)
if (require.main === module && process.argv.includes('--probe')) {
  (async () => {
    const browser = await chromium.launch();
    const R = new Run(browser, 'probe');
    const q = process.argv[process.argv.indexOf('--probe') + 1];
    await R.open(q);
    await R.page.waitForTimeout(1500);
    await R.idle();
    console.log(await R.where());
    const code = process.argv[process.argv.indexOf('--probe') + 2];
    if (code) console.log(JSON.stringify(await R.ev(new Function('return (async () => {' + code + '})()')), null, 0));
    console.log('errors', await R.health());
    await browser.close();
  })();
}

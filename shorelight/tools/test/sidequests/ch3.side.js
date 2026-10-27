#!/usr/bin/env node
// Chapter 3 《觀音艋舺》 side quests & 心燈, played the way a player would (Playwright + Chromium, file://index.html).
//
//   node tools/test/sidequests/ch3.side.js            # all sessions
//   node tools/test/sidequests/ch3.side.js full        # only sessions whose name contains a word
//   node tools/test/sidequests/ch3.side.js --shots     # screenshots to tools/test/out/ch3side/
//   node tools/test/sidequests/ch3.side.js -v          # print every passing check too
//
// Rules (docs/qa/sidequests_ch3-5.md): start from `?debug&startch=3`, then only do what a player can do —
//   · walk: `walk(x, y)` first proves the cell is reachable on foot from where the player stands (BFS over the real
//     MapScene collision), then steps on it (touch events / warps fire as after a real step);
//   · talk / investigate / open: `use(kind, id)` walks next to the NPC / action event / chest, faces it and presses
//     Z through the map's own findInteract() → doInteract(), so an unreachable or un-pressable target fails;
//   · shops: `buy(npc, item)` talks to the shopkeeper (the autoplay shop skips its UI), checks the item really is on
//     that shop's shelf and pays its price;
//   · never sets a quest's own flags, items or stages. Battles use the test battle bot (tools/test/lib/battlebot.js).
// Discoverability: each required step also checks that a clue was shown (an NPC line, quest-log text or a visible
// object) — see `clue()`.
// Prints PASS/FAIL per quest at the end; exit 1 on any failure, page/console error or G.lastError.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const VERBOSE = argv.includes('-v');
const ONLY = argv.filter((a) => !a.startsWith('-'));
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch3side');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /AudioContext/, /willReadFrequently/, /GPU stall/];
const ART_WARN = /\[shorelight\]|missing sprite|unknown song|unknown item|no actor/;

// per-quest verdicts: quest key → { checks, fails }
const QUESTS = {};
const QNAME = {
  soldiers: '紅毛城的異鄉兵 (q_tamsui_soldiers, 心燈)',
  soldiers_window: '紅毛城的異鄉兵 — first-night window (missable)',
  alian: '阿蓮與阿德 (q_alian, 心燈)',
  xiaomei: '小梅與母親 (q_xiaomei, 心燈)',
  feud: '頂下郊的兩個老人 (q_feud, 心燈)',
  yizigu: '椅仔姑與花旦 (lantern_yizigu, 心燈)',
  mush: '雲歸的蕈譜・杉皮蕈 (q_tuanzi_mush)',
  ponr: '南門 point of no return covers the open 艋舺 quests',
  main: 'main path (only as needed to reach the side content)',
};
let failures = 0;

class Run {
  constructor(name, browser) { this.name = name; this.browser = browser; this.errors = []; this.q = 'main'; }
  quest(k) { this.q = k; QUESTS[k] = QUESTS[k] || { checks: 0, fails: [] }; }
  check(cond, msg) {
    const Q = QUESTS[this.q] || (QUESTS[this.q] = { checks: 0, fails: [] });
    Q.checks++;
    if (!cond) { Q.fails.push(msg); console.log(`    ✗ [${this.q}] ${msg}`); } else if (VERBOSE) console.log(`    ✓ [${this.q}] ${msg}`);
    return !!cond;
  }
  async open(query) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await this.ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
    await this.ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false })); } catch (e) { /* ignore */ } });
    this.page = await this.ctx.newPage();
    this.page.on('console', (m) => {
      const t = m.text();
      if (IGNORE.some((r) => r.test(t))) return;
      if (m.type() === 'error') this.errors.push('console.error: ' + t.slice(0, 600));
      else if (m.type() === 'warning' && ART_WARN.test(t)) this.errors.push('warning: ' + t.slice(0, 300));
    });
    this.page.on('pageerror', (e) => this.errors.push('pageerror: ' + String(e.stack || e.message).slice(0, 800)));
    await this.page.goto(BASE + query);
    await this.page.waitForFunction(() => window.G && G.Debug && G.Scenes, null, { timeout: 30000 });
    await this.ev(() => {
      G.Debug.setAutoplay(true);
      // every dialogue line / choice / toast the player sees, for the clue checks
      window.__seen = [];
      const say = G.Dialog.say;
      G.Dialog.say = function (who, text, ...rest) { window.__seen.push(String(text || '')); return say.call(this, who, text, ...rest); };
      const toast = G.UI.toast;
      G.UI.toast = function (text, ...rest) { window.__seen.push(String(text || '')); return toast.call(this, text, ...rest); };
      const choice = G.Dialog.choice;
      G.Dialog.choice = function (opts, ...rest) { window.__seen.push('[choice] ' + (opts || []).join(' / ')); return choice.call(this, opts, ...rest); };
      window.__shop = [];
    });
  }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  async idle(timeout = 240000) {
    const t0 = Date.now();
    for (;;) {
      const ok = await this.ev((ms) => G.Debug.idle(ms), Math.max(1000, timeout - (Date.now() - t0)));
      if (ok === 'gameover') throw new Error('GAME OVER');
      if (!ok) throw new Error('timed out waiting for idle: ' + await this.ev(() => { const t = G.Scenes.top(); return JSON.stringify({ top: t && t.constructor && t.constructor.name, busy: G.Script.busy(), map: G.mapScene && G.mapScene.def.id, pos: G.mapScene && [G.mapScene.player.x, G.mapScene.player.y] }); }));
      await this.page.waitForTimeout(300);
      if (await this.ev(() => G.Debug.idleNow())) break;
      if (Date.now() - t0 > timeout) throw new Error('timed out (flapping idle)');
    }
  }
  choices(list) { return this.ev((l) => { G.Debug.choices = l.slice(); }, list); }
  // seen text since the last mark
  async mark() { this.seenAt = await this.ev(() => window.__seen.length); }
  async seen(re) { const lines = await this.ev((i) => window.__seen.slice(i), this.seenAt || 0); return lines.some((l) => re.test(l)); }
  async seenEver(re) { const lines = await this.ev(() => window.__seen); return lines.some((l) => re.test(l)); }
  // walk onto a cell: must be reachable on foot from the current cell (warps/touch events on the way are not crossed)
  async walk(x, y, dir) {
    const r = await this.ev(([tx, ty, d]) => {
      const m = G.mapScene, p = m.player;
      const W = m.w, seen = new Set([p.x + ',' + p.y]), q = [[p.x, p.y]];
      const warpAt = (x, y) => (m.def.warps || []).some((w) => x >= w.x && x < w.x + (w.w || 1) && y >= w.y && y < w.y + (w.h || 1) && (!w.if || w.if(G.state)));
      let ok = p.x === tx && p.y === ty;
      while (q.length && !ok) {
        const [cx, cy] = q.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
          if (seen.has(k)) continue;
          if (nx === tx && ny === ty) { ok = !m.solid[ny * W + nx] || warpAt(nx, ny); if (ok) break; continue; }
          seen.add(k);
          if (m.blocked(nx, ny, p) || warpAt(nx, ny)) continue;
          q.push([nx, ny]);
        }
      }
      if (!ok) return 'unreachable ' + m.def.id + ' ' + tx + ',' + ty + ' from ' + p.x + ',' + p.y;
      G.Debug.stepOn(tx, ty, d);
      return 'ok';
    }, [x, y, dir || null]);
    this.check(r === 'ok', `walk to ${x},${y}: ${r}`);
    await this.idle();
  }
  // walk next to a target and press Z at it: kind 'npc' | 'event' | 'chest'
  async use(kind, id) {
    const r = await this.ev(([kind, id]) => {
      const m = G.mapScene, p = m.player;
      let cells = [];
      if (kind === 'npc') {
        const n = m.npcs.find((x) => x.id === id && x.visible && m.npcActive(x));
        if (!n) return 'npc not present: ' + id;
        cells = [[n.x, n.y]];
        // counters: talk across
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cx = n.x + dx, cy = n.y + dy;
          if (m.objects.some((o) => m.objActive(o) && (o.t === 'counter' || o.counter) && cx >= o.x && cx < o.x + (o.w || 1) && cy >= o.y && cy < o.y + (o.h || 1))) cells.push([cx, cy, n.x, n.y]);
        }
      } else if (kind === 'event') {
        const e = (m.def.events || []).find((x) => x.id === id);
        if (!e) return 'no event ' + id;
        if (!m.eventOk(e)) return 'event not active: ' + id;
        for (let yy = e.y; yy < e.y + (e.h || 1); yy++) for (let xx = e.x; xx < e.x + (e.w || 1); xx++) cells.push([xx, yy]);
      } else {
        const o = m.objects.find((ob) => ob.t === 'chest' && ob.chest && ob.chest.id === id && m.objActive(ob));
        if (!o) return 'no chest ' + id;
        if (o.open) return 'chest already open ' + id;
        cells = [[o.x, o.y]];
      }
      // BFS from the player over walkable cells; stop at a cell adjacent to a target cell
      const W = m.w, start = [p.x, p.y], seen = new Set([start.join(',')]), q = [start];
      const warpAt = (x, y) => (m.def.warps || []).some((w) => x >= w.x && x < w.x + (w.w || 1) && y >= w.y && y < w.y + (w.h || 1) && (!w.if || w.if(G.state)));
      const touchAt = (x, y) => (m.def.events || []).some((e) => e.trigger === 'touch' && x >= e.x && x < e.x + (e.w || 1) && y >= e.y && y < e.y + (e.h || 1) && m.eventOk(e));
      const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
      while (q.length) {
        const [cx, cy] = q.shift();
        for (const c of cells) {
          for (const [d, [dx, dy]] of Object.entries(DIRS)) {
            if (cx + dx === c[0] && cy + dy === c[1]) {
              const ox = p.x, oy = p.y, od = p.dir;
              p.setCell(cx, cy); p.dir = d; G.state.dir = d;
              const it = m.findInteract();
              const hit = it && ((kind === 'npc' && it.kind === 'npc' && it.npc.id === id) || (kind === 'event' && it.kind === 'event' && it.ev.id === id) || (kind === 'chest' && it.kind === 'chest' && it.obj.chest.id === id));
              if (hit) { m.interactTarget = it; m.doInteract(); return 'ok'; }
              p.setCell(ox, oy); p.dir = od;
            }
          }
        }
        for (const [dx, dy] of Object.values(DIRS)) {
          const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
          if (seen.has(k)) continue;
          seen.add(k);
          if (m.blocked(nx, ny, p) || warpAt(nx, ny) || touchAt(nx, ny)) continue;
          q.push([nx, ny]);
        }
      }
      return 'cannot reach / press Z at ' + kind + ' ' + id + ' on ' + m.def.id + ' from ' + p.x + ',' + p.y;
    }, [kind, id]);
    this.check(r === 'ok', `use ${kind} ${id}: ${r}`);
    await this.idle();
    return r === 'ok';
  }
  talk(id) { return this.use('npc', id); }
  // buy from a shopkeeper: talk (the autoplay shop resolves at once), item must be in that shop's goods list
  async buy(npc, item, n = 1) {
    await this.ev(() => {
      if (window.__shopHooked) return;
      window.__shopHooked = true;
      const S = G.Script.S, sh = S.shop;
      S.shop = function (goods, o) { window.__shop = (goods || []).slice(); return sh.call(this, goods, o); };
    });
    await this.ev(() => { window.__shop = []; });
    await this.talk(npc);
    const r = await this.ev(([id, n]) => {
      if (!window.__shop.includes(id)) return 'not sold here (' + window.__shop.join(',') + ')';
      const price = (G.Data.items[id].price || 0) * n;
      if (G.state.gold < price) return 'not enough gold';
      G.state.gold -= price; G.Inv.add(id, n);
      return 'ok';
    }, [item, n]);
    this.check(r === 'ok', `buy ${item} ×${n} from ${npc}: ${r}`);
  }
  flag(k) { return this.ev((f) => !!G.state.flags[f], k); }
  map() { return this.ev(() => G.mapScene && G.mapScene.def.id); }
  item(id) { return this.ev((i) => G.Inv.count(i), id); }
  stage(q) { return this.ev((id) => G.Quests.stage(id), q); }
  done(q) { return this.ev((id) => G.Quests.isDone(id), q); }
  lantern(id) { return this.ev((l) => G.Lanterns.has(l), id); }
  // the quest log text the player can read right now (stage text of the current stage)
  logText(q) { return this.ev((id) => { const d = G.Data.quests[id]; const s = G.Quests.stage(id); return d && d.stages && s >= 0 ? (d.stages[s] || '') : ''; }, q); }
  async shot(name) { if (SHOTS) await this.page.screenshot({ path: path.join(OUT, `${this.name}_${name}.png`) }); }
  async finish() {
    const le = await this.ev(() => G.lastError && String(G.lastError.stack || G.lastError)).catch(() => null);
    if (le) this.errors.push('G.lastError: ' + le.slice(0, 800));
    const log = await this.ev(() => (G.Debug.log || []).filter((l) => /unknown/.test(l))).catch(() => []);
    for (const l of log) this.errors.push('debug log: ' + l);
    if (this.ctx) await this.ctx.close();
  }
}

async function session(name, browser, fn) {
  if (ONLY.length && !ONLY.some((w) => name.includes(w))) return;
  const r = new Run(name, browser);
  const t0 = Date.now();
  console.log(`\n▶ ${name}`);
  try { await fn(r); } catch (e) { r.check(false, 'exception: ' + (e && e.stack || e)); }
  await r.finish().catch(() => {});
  for (const e of r.errors) console.log('    ! ' + e);
  if (r.errors.length) { failures++; QUESTS['errors:' + name] = { checks: r.errors.length, fails: r.errors }; }
  console.log(`  session ${name}: ${((Date.now() - t0) / 1000).toFixed(0)}s, ${r.errors.length} page/console error(s)`);
}

// ------------------------------------------------------------------------------------------------ helpers
async function waitMap(r, id) { await r.page.waitForFunction((m) => G.mapScene && G.mapScene.def.id === m, id, { timeout: 90000 }); await r.idle(); }

// 淡水 first night → 紅毛城的異鄉兵, then the morning ferry and the main path up to 艋舺
async function soldiers(r) {
  r.quest('soldiers');
  await r.walk(13, 10);
  r.check(await r.map() === 'tamsui_inn', 'entered 淡水客棧');
  await r.mark();
  await r.choices([0, '去紅毛城看看']);
  await r.talk('ts_innkeeper');
  r.check(await r.seen(/只有今晚/), 'clue: 白芷 warns the drum only sounds tonight');
  r.check(await r.map() === 'tamsui' && await r.ev(() => G.state.vars.c3_ts) === 'night', 'night in 淡水');
  await r.walk(22, 0);
  r.check(await r.map() === 'tamsui_fort', 'up the stairs to 紅毛城');
  await r.idle();
  r.check(await r.stage('q_tamsui_soldiers') === 1, 'quest started (stage 1) by the fort cutscene');
  r.check(await r.seenEver(/西北角/) && await r.seenEver(/靈視/), 'clue: Diego says where the scallop is and that 靈視 is needed');
  const log1 = await r.logText('q_tamsui_soldiers');
  r.check(/草叢|墓/.test(log1) && /小孩|孩子|囝仔/.test(log1), 'clue: quest log says where to look for both keepsakes: ' + log1);
  await r.shot('fort_night');
  // the grass without 靈視: hint where to buy the mushroom (or offer to eat one)
  const hadMush = await r.item('lingxun');
  await r.mark();
  if (!hadMush) {
    await r.use('event', 'fort_scallop');
    r.check(await r.item('c3_scallop') === 0, 'scallop not visible without 靈視');
    r.check(await r.seen(/雜貨店/), 'clue: 白芷 says the 淡水 general store sells 七彩靈蕈');
    await r.walk(11, 17);
    await r.buy('ts_general', 'lingxun');
    await r.walk(22, 0);
  }
  await r.choices([0]);
  await r.use('event', 'fort_scallop');
  r.check(await r.item('c3_scallop') === 1, 'got 扇貝殼 (ate a 七彩靈蕈 at the grass)');
  // windmill: 阿狗仔 on the waterfront
  await r.walk(11, 17);
  await r.mark();
  await r.talk('ts_child');
  r.check(await r.seen(/林頭家/), 'clue: 星河 says the materials are at 林頭家');
  for (const id of ['c3_redpaper', 'c3_bamboo', 'c3_candle']) await r.buy('ts_general', id);
  await r.choices([0]);
  await r.talk('ts_child');
  r.check(await r.item('c3_windmill') === 1, 'traded a lantern for 小風車');
  r.check(await r.stage('q_tamsui_soldiers') === 2, 'stage 2 (ask a fisherman)');
  // sleep — the quest waits; next day 阿財, then 「等到夜裡」
  await r.walk(13, 10);
  await r.choices([0]);
  await r.talk('ts_innkeeper');
  r.check(await r.ev(() => G.state.vars.c3_ts) === 'morning', 'slept until morning');
  await r.walk(6, 9);
  r.check(/漁夫阿財|阿財/.test(await r.logText('q_tamsui_soldiers')), 'clue: quest log names 漁夫阿財');
  await r.choices([0]);
  await r.talk('ts_fisher');
  r.check(await r.item('c3_lantern_base') === 2, 'got 水燈座 ×2');
  r.check(await r.stage('q_tamsui_soldiers') === 3, 'stage 3 (back to the fort at night)');
  await r.walk(13, 10);
  await r.mark();
  await r.choices(['等到夜裡']);
  await r.talk('ts_innkeeper');
  r.check(await r.ev(() => G.state.vars.c3_ts) === 'night', 'inn offers 「等到夜裡」 while the quest is open');
  await r.walk(6, 9);
  await r.walk(22, 0);
  await r.talk('gh_diego_f');
  r.check(await r.flag('ch3_soldiers_done'), 'release scene played');
  r.check(await r.lantern('lantern_tamsui_soldiers'), '心燈 lantern_tamsui_soldiers lit');
  r.check(await r.done('q_tamsui_soldiers'), 'quest log entry closed');
  r.check(await r.item('c3_ac_foreign_button') === 1, 'reward 異鄉的銅釦');
  r.check(await r.item('c3_scallop') === 0 && await r.item('c3_windmill') === 0, 'keepsakes handed over');
}

async function mainToBangka(r) {
  r.quest('main');
  // the release ends at dusk: sleep, then the ferry
  await r.walk(13, 10);
  await r.choices([0]);
  await r.talk('ts_innkeeper');
  await r.walk(6, 9);
  await r.talk('ts_boatman');
  await waitMap(r, 'guanyin_trail');
  r.check(await r.flag('ch3_ferry'), 'ferry to 八里');
  await r.choices([0]);
  await r.walk(23, 48);
  await r.walk(19, 43);
  await r.walk(18, 31);
  r.check(await r.flag('ch3_monkeyking'), '石猴王 beaten');
  await r.walk(19, 29);
  const J = [27, 23, 19, 15, 11], X = { L: 13, M: 19, R: 25 }, ANS = ['L', 'R', 'R', 'M', 'L'];
  for (let k = 0; k < 5; k++) { await r.walk(X[ANS[k]], J[k] - 1); await r.walk(X[ANS[k]], J[k] - 2); }
  r.check(await r.flag('ch3_fog_done'), 'fog passed');
  await r.walk(19, 0);
  await waitMap(r, 'taixu_room');
  await r.walk(6, 8);
  await r.talk('c3_yg_npc');
  r.check(await r.flag('ch3_yungui_join'), '雲歸 joined');
  await r.choices([0]);
  await r.walk(13, 21);
  await waitMap(r, 'guanyin_trail');
  await r.choices(['艋舺']);
  await r.talk('gy_boatman');
  await waitMap(r, 'bangka');
  r.check(await r.flag('ch3_bangka_arrive'), 'arrived in 艋舺');
  // 3-11 龍山寺 (the toast lists the side quests)
  await r.mark();
  await r.choices([0]);
  await r.walk(27, 17);
  await waitMap(r, 'bangka_longshan');
  r.check(await r.flag('ch3_temple_met'), '3-11 龍山寺');
  r.check(await r.seen(/阿蓮.*哭聲.*八甲庄/), 'clue: toast lists 阿蓮 / 廟裡的哭聲 / 八甲庄的老鬼');
}

async function bangkaSide(r) {
  // ---- 小梅 (ghost by the dragon pillar, night) — started while we are in the temple
  r.quest('xiaomei');
  await r.mark();
  await r.talk('ls_xiaomei');
  r.check(await r.stage('q_xiaomei') === 0, 'q_xiaomei started');
  await r.mark();
  await r.talk('bk_temple');
  r.check(await r.seen(/剝皮寮/) && await r.seen(/春婆|玉蘭/), 'clue: 吳廟公 points to the 玉蘭花 seller in 剝皮寮');
  await r.walk(13, 21);
  // ---- 阿蓮與阿德
  r.quest('alian');
  await r.talk('bk_alian');
  r.check(await r.stage('q_alian') === 0, 'q_alian started');
  r.check(/北邊|舊渡頭/.test(await r.logText('q_alian')), 'clue: quest log says the old ferry landing is north');
  await r.walk(9, 0);
  r.check(await r.map() === 'bangka_riverbank', 'north road → 舊渡頭 at night');
  await r.walk(7, 7);
  r.check(await r.flag('ch3_alian_2'), '河伯怨靈 beaten, 阿德 freed to talk');
  r.check(await r.stage('q_alian') === 1, 'stage 1 (back to 阿蓮)');
  await r.use('chest', 'c3_11');
  await r.walk(35, 6);
  await r.choices([0]);
  await r.talk('bk_alian');
  await r.idle();
  r.check(await r.flag('ch3_alian_done'), '阿蓮 blows out the lamp');
  r.check(await r.lantern('lantern_alian'), '心燈 lantern_alian lit');
  r.check(await r.done('q_alian'), 'quest closed');
  r.check(await r.item('c3_hd_ade') === 1 && await r.item('c3_wanguo_lite') === 5, 'rewards 阿德的斗笠 + 碗粿 ×5');
  await r.walk(35, 6);
  await waitMap(r, 'bangka');
  // ---- 杉皮蕈: 青草阿伯
  r.quest('mush');
  await r.walk(36, 15);
  await r.talk('bk_herbman');
  r.check(await r.stage('q_tuanzi_mush') === 1, 'q_tuanzi_mush started');
  r.check(/剝皮寮/.test(await r.logText('q_tuanzi_mush')) && /靈視/.test(await r.logText('q_tuanzi_mush')), 'clue: quest log says 剝皮寮 + 夜裡 + 靈視');
  // ---- to 剝皮寮: 春婆 (小梅), 杉皮蕈
  r.quest('xiaomei');
  await r.walk(55, 10);
  await waitMap(r, 'bangka_bopiliao');
  await r.choices([0]);
  await r.talk('bk_chunpo');
  await r.idle();
  r.check(await r.flag('ch3_xiaomei_done'), 'reunion in 龍山寺');
  r.check(await r.lantern('lantern_xiaomei'), '心燈 lantern_xiaomei lit');
  r.check(await r.done('q_xiaomei'), 'quest closed');
  r.check(await r.item('c3_ac_magnolia') === 1, 'reward 玉蘭香囊');
  await r.walk(13, 21);
  await r.walk(55, 10);
  await waitMap(r, 'bangka_bopiliao');
  r.quest('mush');
  r.check(await r.item('lingxun') > 0, 'player has a 七彩靈蕈 (from the fog)');
  await r.choices([0]);
  await r.use('event', 'bp_mush');
  r.check(await r.flag('mush_1'), '杉皮蕈 found');
  r.check(await r.stage('q_tuanzi_mush') === 2, 'stage 2 (first page)');
  await r.use('chest', 'c3_10');
  // ---- 頂下郊
  r.quest('feud');
  await r.walk(0, 9);
  await waitMap(r, 'bangka');
  await r.talk('bk_ashui');
  r.check(await r.flag('ch3_feud_1'), 'met the two ghosts in 八甲庄');
  await r.mark();
  await r.talk('bk_awang');
  r.check(await r.seen(/吳廟公.*老茶店.*阿興/), 'clue: who to ask (吳廟公 / 老茶店 / 阿興)');
  await r.walk(27, 17);
  await r.talk('bk_temple');
  await r.walk(13, 21);
  await r.walk(55, 10);
  await r.talk('bk_teaman');
  await r.walk(0, 9);
  await r.talk('bk_xing');
  await r.walk(46, 4);
  await r.talk('bk_xingma');
  r.check(await r.flag('ch3_feud_wu') && await r.flag('ch3_feud_tea') && await r.flag('ch3_feud_clue'), 'three clues gathered');
  r.check(await r.stage('q_feud') === 1, 'stage 1 (take them to 阿興家)');
  await r.walk(6, 8);
  await r.choices([1, 0]);
  await r.talk('bk_ashui');
  await r.idle();
  r.check(await r.flag('ch3_feud_done'), 'reconciled');
  r.check(await r.lantern('lantern_feud'), '心燈 lantern_feud lit');
  r.check(await r.done('q_feud'), 'quest closed');
  r.check(await r.item('c3_sameboat_wine') === 1, 'reward 同船米酒');
  if (await r.map() === 'bangka_xing') await r.walk(6, 8);   // the scene ends inside 阿興家
  // ---- 椅仔姑 (choice B) → rest → 中秋 → the show
  r.quest('yizigu');
  await r.mark();
  await r.choices([1]);
  await r.walk(38, 23);
  await r.idle();
  r.check(await r.seen(/永遠看不到這齣戲/), 'clue: 白芷 hints that the talisman loses her the show');
  r.check(await r.flag('ch3_yizigu_choice_b') && await r.flag('ch3_theatre'), 'asked 秀蘭 (B) and beat the paper men');
  await r.use('chest', 'c3_13');
  await r.walk(9, 11);
  await r.walk(22, 9);
  await r.choices([0]);
  await r.talk('bk_innkeeper');
  r.check(await r.ev(() => G.state.vars.ch3_day) === 1, 'rested to 八月十五');
  await r.walk(6, 9);
  await r.walk(38, 23);
  await r.choices([0, 0]);
  await r.talk('bk_troupe_head');
  await r.idle();
  r.check(await r.flag('ch3_show_done'), 'the show played');
  r.check(await r.lantern('lantern_yizigu'), '心燈 lantern_yizigu lit');
  // ---- leave: nothing open → no prompt; chapter 4
  r.quest('ponr');
  await r.ev(() => { G.Debug.log.length = 0; });
  await r.choices([0, 0]);
  await r.ev(() => G.Debug.stepOn(27, 43));
  await r.page.waitForFunction(() => G.state.chapter === 4, null, { timeout: 240000 });
  r.check(!(await r.ev(() => G.Debug.log.some((l) => /pointOfNoReturn ch3: open/.test(l)))), 'no warning when every 艋舺 quest is done');
  r.check(await r.ev(() => ['lantern_tamsui_soldiers', 'lantern_alian', 'lantern_xiaomei', 'lantern_feud', 'lantern_yizigu'].every((id) => G.Lanterns.has(id))), 'all five ch3 心燈 lit');
}

// ------------------------------------------------------------------------------------------------ sessions
async function full(r) {
  await r.open('?debug&startch=3&lv=11');
  await waitMap(r, 'tamsui');
  await soldiers(r);
  await mainToBangka(r);
  await bangkaSide(r);
}

// 「先睡覺」 the first night: the soldiers' quest never starts, and nothing offers it later
async function missWindow(r) {
  r.quest('soldiers_window');
  await r.open('?debug&startch=3&lv=11');
  await waitMap(r, 'tamsui');
  await r.walk(13, 10);
  await r.mark();
  await r.choices([0, '先睡覺']);
  await r.talk('ts_innkeeper');
  r.check(await r.seen(/只有今晚/), 'the hint was shown before the choice');
  r.check(await r.ev(() => G.state.vars.c3_ts) === 'morning', 'slept until morning');
  r.check(await r.stage('q_tamsui_soldiers') < 0, 'quest never started');
  await r.mark();
  await r.choices([2]);
  await r.talk('ts_innkeeper');
  r.check(!(await r.seen(/等到夜裡/)), 'no 「等到夜裡」 option afterwards');
}

// 南門 with an open quest: the shared warning names it, 再等等 keeps the player in 艋舺
async function ponrOpen(r) {
  r.quest('ponr');
  await r.open('?debug&map=bangka&x=27&y=40&lv=13&chapter=3&party=xinghe,baizhi,hongying,yungui&flags=mochi_joined,yuyuan_joined,ch3_start,ch3_inn,ch3_ferry,ch3_fog_done,ch3_yungui_join,ch3_bangka_arrive,ch3_temple_met,ch3_theatre,ch3_show_done,ch3_letter,ch3_moon');
  await waitMap(r, 'bangka');
  await r.talk('bk_alian');
  r.check(await r.stage('q_alian') === 0, 'started 阿蓮與阿德');
  await r.ev(() => { G.Debug.log.length = 0; });
  await r.choices([0, '再等等']);
  await r.walk(27, 43);
  const log = await r.ev(() => G.Debug.log.filter((l) => /pointOfNoReturn/.test(l)).join(' | '));
  r.check(/q_alian/.test(log), 'warning names 阿蓮與阿德: ' + log);
  r.check(/lantern_xiaomei/.test(log) && /lantern_feud/.test(log), 'warning counts the never-started 心燈 (小梅, 頂下郊): ' + log);
  r.check(await r.ev(() => G.state.chapter) === 3 && await r.map() === 'bangka', '再等等 stays in 艋舺');
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  await session('full', browser, full);
  await session('window', browser, missWindow);
  await session('ponr', browser, ponrOpen);
  await browser.close();
  console.log('\n──────── ch3 side quests ────────');
  for (const [k, q] of Object.entries(QUESTS)) {
    const ok = !q.fails.length;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${QNAME[k] || k}  (${q.checks - q.fails.length}/${q.checks})`);
  }
  console.log(`${failures ? 'FAIL' : 'PASS'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(failures ? 1 : 0);
})();

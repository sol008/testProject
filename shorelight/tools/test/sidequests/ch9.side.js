#!/usr/bin/env node
// Chapter 9 《王船南行》 — side quests and 心燈, played the PLAYER's way from ?debug&startch=9 (Playwright + Chromium).
//
//   node tools/test/sidequests/ch9.side.js            # all quests, one continuous run (≈ 6–10 min)
//   node tools/test/sidequests/ch9.side.js --shots    # also save screenshots to tools/test/out/ch9side_*.png
//   node tools/test/sidequests/ch9.side.js --headed
//   node tools/test/sidequests/ch9.side.js --3d       # also spot-check the 龍坑 log pages / 潮汐蕈 / 沙溝 光 in 3D (?r3lite)
//
// Prints one line per quest — `PASS <quest>` / `FAIL <quest> — reason` — and exits 1 on any FAIL.
//   q_ch9_banping     半屏山湯圓 → 心燈 xd_banpingshan
//   q_ch9_names       被風偷走的七個名字 → 心燈 xd_yueqin_names (+ 歌詞殘篇・恆春)
//   q_ch9_lighthouse  燈塔守的家書 → 心燈 xd_lighthouse_home
//   mush_ch9          雲歸的蕈譜：潮汐蕈 (q_tuanzi_mush, cross-chapter; ch11 completes the quest)
//   ponr              出航・往東 point of no return warns about every open ch9 quest (incl. the 七仙蕈)
//   chapter           the run reaches chapter 10 with no page / console / script errors
//
// Rules this script keeps (the point of it): no quest flags, items, vars, stages or 心燈 are ever written. The player
// walks (G.Debug.stepOn, after a BFS over the live collision grid proves the cell can be walked to from where the
// player stands), talks and inspects with the REAL interaction code (stand next to it, face it, MapScene.doInteract —
// what the Z key does), picks choices (G.Debug.choices) and fights (battle bot, easy, as every chapter test does).
// Allowed help, the same as tools/test/chapters/ch9.test.js: party levels are caught up at the chapter test's segment
// boundaries (the run skips random encounters) and the party is healed before the 潮病鰻王.
// Discoverability is checked as well: each required spot must show something (an object, a light / sparkle, a hint
// tag, a visible NPC) AND some line or quest-log text must point there.
// The only preset state is in the separate `ponr` page that checks the 七仙蕈 warning line (q_tuanzi_mush cannot be
// started from a chapter-9 start; it begins in chapter 3).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'tools', 'test', 'out');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const HEADED = argv.includes('--headed');
const DO3D = argv.includes('--3d');
fs.mkdirSync(OUT, { recursive: true });
const URL0 = 'file://' + path.join(ROOT, 'index.html');

// ------------------------------------------------------------------------------------------------ results per quest
const QUESTS = {
  q_ch9_banping: '半屏山湯圓',
  q_ch9_names: '被風偷走的七個名字',
  q_ch9_lighthouse: '燈塔守的家書',
  mush_ch9: '雲歸的蕈譜：潮汐蕈',
  ponr: '出航・往東 warning',
  chapter: 'chapter 9 → 10, no errors',
};
const res = {};
for (const q of Object.keys(QUESTS)) res[q] = { checks: 0, fails: [], reached: false };
let cur = 'chapter';
function quest(q) { cur = q; res[q].reached = true; console.log(`\n== ${q} ${QUESTS[q]} ==`); }
function check(name, ok, info) {
  res[cur].checks++;
  if (!ok) res[cur].fails.push(name + (info != null ? ` (${String(info).slice(0, 200)})` : ''));
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${info != null && !ok ? '  — ' + String(info).slice(0, 300) : ''}`);
  return !!ok;
}

// ------------------------------------------------------------------------------------------------ page + errors
let page = null;
const errors = [];
const foreign = [];
const FOREIGN = /js\/(maps\/ch(?!9_)|i18n\/(?!en_ch9))/;   // other agents are editing other chapters right now
function installErrorHooks(p) {
  p.on('pageerror', (e) => {
    const msg = String((e && e.message) || e), st = String((e && e.stack) || '');
    if (FOREIGN.test(st) && !/ch9_south/.test(st)) { foreign.push('pageerror ' + msg); return; }
    errors.push('pageerror ' + msg + ' ' + st.split('\n').slice(0, 3).join(' | '));
  });
  p.on('console', (m) => {
    const text = m.text(), loc = (m.location && m.location().url) || '';
    if (m.type() === 'error') {
      if (/ERR_FILE_NOT_FOUND|Failed to load resource/.test(text)) return;
      if (FOREIGN.test(loc) && !/ch9_south/.test(text)) { foreign.push('console ' + text); return; }
      errors.push('console.error ' + text);
    } else if (m.type() === 'warning' && /missing|unknown|not registered|no actor|undefined/i.test(text)) errors.push('console.warn ' + text);
  });
}
async function newPage(browser, url, mode3d) {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'zh-TW' });
  installErrorHooks(page);
  await page.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
  await page.addInitScript((use3d) => {
    try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: !!use3d })); } catch (_) { /* file:// */ }
    if (!use3d) { const iv = setInterval(() => { if (window.G && G.settings) { G.settings.render3d = false; clearInterval(iv); } }, 1); }
    // every dialogue line and toast the player sees, for the clue checks
    window.__said = [];
    const iv2 = setInterval(() => {
      if (!(window.G && G.Dialog && G.UI && G.Dialog.say && G.UI.toast)) return;
      clearInterval(iv2);
      const say = G.Dialog.say.bind(G.Dialog);
      G.Dialog.say = (who, text, o) => { window.__said.push(String(who || '') + '｜' + String(text || '')); return say(who, text, o); };
      const toast = G.UI.toast.bind(G.UI);
      G.UI.toast = (text, o) => { window.__said.push('toast｜' + String(text || '')); return toast(text, o); };
    }, 1);
  }, !!mode3d);
  await page.goto(url);
  await page.waitForFunction(() => window.G && G.Debug && G.mapScene && G.mapScene.def && G.Debug.autoplay, null, { timeout: 30000 });
  await ev(() => { G.settings.battleSpeed = 6; });
}

// ------------------------------------------------------------------------------------------------ driving helpers
const ev = (fn, arg) => page.evaluate(fn, arg);
async function idleOnce(ms = 180000) {
  const r = await ev((t) => G.Debug.idle(t), ms);
  if (r === 'gameover') throw new Error('GAME OVER on map ' + (await mapId()));
  if (!r) throw new Error('game did not become idle (map ' + (await mapId()) + ')');
}
async function settle(ms) {
  for (let i = 0; i < 6; i++) {
    await idleOnce(ms);
    await page.waitForTimeout(300);
    if (await ev(() => G.Debug.idleNow())) return;
  }
  await idleOnce(ms);
}
const mapId = () => ev(() => (G.mapScene ? G.mapScene.def.id : null));
const flag = (k) => ev((k2) => !!G.state.flags[k2], k);
const vars = () => ev(() => JSON.parse(JSON.stringify(G.state.vars)));
const count = (id) => ev((i) => G.Inv.count(i), id);
const lantern = (id) => ev((i) => !!G.state.lanterns[i], id);
const qstage = (id) => ev((i) => G.Quests.stage(i), id);
const qdone = (id) => ev((i) => G.Quests.isDone(i), id);
const pos = () => ev(() => [G.mapScene.player.x, G.mapScene.player.y]);
async function choices(list) { await ev((l) => { G.Debug.choices = l.slice(); }, list); }
async function mark() { return ev(() => window.__said.length); }
async function saidSince(m, re) { return ev(([k, src]) => window.__said.slice(k).filter((l) => new RegExp(src).test(l)), [m, re.source]); }
async function shot(name) { if (!SHOTS) return; await page.waitForTimeout(300); await page.screenshot({ path: path.join(OUT, `ch9side_${name}.png`) }); }
async function expectMap(id, label) { const m = await mapId(); return check(label || `on map ${id}`, m === id, m); }
async function trigger(id) { await ev((i) => { G.Debug.trigger(i); }, id); await settle(); }

// BFS over the live collision grid from the player's cell. opts.adj: the target itself may be solid (an object / NPC
// to face) → returns a walkable 4-neighbour and the facing. opts.through: extra cells treated as walkable (tide channels
// at low tide). opts.avoid: cells a player would not step on (pits). Returns { ok, x, y, dir, len } or { ok: false }.
async function reach(x, y, opts = {}) {
  return ev(([tx, ty, o]) => {
    const m = G.mapScene, p = m.player, W = m.w, H = m.h;
    const thr = new Set(o.through || []), avoid = new Set(o.avoid || []);
    for (const e of m.def.events || []) if (e.trigger === 'touch' && /hole|fall|pit/.test(e.id || '') && m.eventOk(e)) avoid.add(e.x + ',' + e.y);
    const free = (cx, cy) => {
      const k = cx + ',' + cy;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H || avoid.has(k)) return false;
      if (thr.has(k)) return true;
      return !m.blocked(cx, cy, p);
    };
    const prev = new Map(); const q = [[p.x, p.y]]; prev.set(p.x + ',' + p.y, null);
    while (q.length) {
      const [cx, cy] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
        if (prev.has(k)) continue;
        if (!(nx === tx && ny === ty && !o.adj) && !free(nx, ny)) continue;
        if (nx === tx && ny === ty && !o.adj && !free(nx, ny) && !(m.def.warps || []).some((w) => nx >= w.x && nx < w.x + (w.w || 1) && ny >= w.y && ny < w.y + (w.h || 1))) continue;
        prev.set(k, cx + ',' + cy); q.push([nx, ny]);
      }
    }
    const len = (k) => { let n = 0; while (prev.get(k)) { k = prev.get(k); n++; } return n; };
    if (!o.adj) return prev.has(tx + ',' + ty) ? { ok: true, x: tx, y: ty, len: len(tx + ',' + ty) } : { ok: false };
    let best = null;
    for (const [dx, dy, dir] of [[0, 1, 'up'], [0, -1, 'down'], [1, 0, 'left'], [-1, 0, 'right']]) {
      const nx = tx + dx, ny = ty + dy, k = nx + ',' + ny;
      if (prev.has(k)) { const l = len(k); if (!best || l < best.len) best = { ok: true, x: nx, y: ny, dir, len: l }; }
    }
    return best || { ok: false };
  }, [x, y, opts]);
}
// walk to a cell: a path must exist, then the step onto it fires warps / touch events like a real step
async function walk(x, y, opts = {}) {
  const r = await reach(x, y, opts);
  if (!r.ok) { check(`can walk to ${x},${y} on ${await mapId()} from ${await pos()}`, false); throw new Error(`no path to ${x},${y}`); }
  await ev(([a, b, d]) => G.Debug.stepOn(a, b, d), [x, y, opts.dir || null]);
  await settle();
}
// stand next to a cell, face it and press Z (MapScene.findInteract / doInteract — the real interaction)
async function act(x, y, opts = {}) {
  const r = opts.from ? { ok: true, x: opts.from[0], y: opts.from[1], dir: opts.from[2] } : await reach(x, y, Object.assign({ adj: true }, opts));
  if (!r.ok) { check(`can reach ${x},${y} on ${await mapId()} to interact`, false); throw new Error(`cannot reach ${x},${y}`); }
  const kind = await ev(([a, b, d]) => {
    const m = G.mapScene, p = m.player;
    p.setCell(a, b); p.dir = d; G.state.x = a; G.state.y = b; G.state.dir = d;
    m.interactTarget = m.findInteract();
    const k = m.interactTarget ? m.interactTarget.kind + ':' + (m.interactTarget.ev ? m.interactTarget.ev.id : m.interactTarget.obj ? m.interactTarget.obj.t : m.interactTarget.npc ? m.interactTarget.npc.id : '') : null;
    m.doInteract();
    return k;
  }, [r.x, r.y, r.dir]);
  if (!kind) { check(`something to interact with at ${x},${y} on ${await mapId()}`, false); throw new Error(`nothing at ${x},${y}`); }
  await settle();
  return kind;
}
// walk up to an NPC (or across a counter) and talk to it with the Z key
async function talkTo(id) {
  const n = await ev((i) => { const n2 = G.mapScene.npcs.find((x) => x.id === i); return n2 ? { x: n2.x, y: n2.y, visible: n2.visible !== false } : null; }, id);
  if (!n) { check(`NPC ${id} is on ${await mapId()}`, false); throw new Error('no npc ' + id); }
  let r = await reach(n.x, n.y, { adj: true });
  if (!r.ok) {
    // talk across a counter: two cells away, a counter object in between
    for (const [dx, dy, dir] of [[0, 2, 'up'], [0, -2, 'down'], [2, 0, 'left'], [-2, 0, 'right']]) {
      const c = await reach(n.x + dx, n.y + dy);
      if (c.ok) { r = { ok: true, x: n.x + dx, y: n.y + dy, dir }; break; }
    }
  }
  if (!r.ok) { check(`can walk up to ${id}`, false); throw new Error('cannot reach npc ' + id); }
  const kind = await act(n.x, n.y, { from: [r.x, r.y, r.dir] });
  if (!/^npc:/.test(kind)) check(`talking to ${id} reaches the NPC`, false, kind);
}
async function levelTo(lv) { await ev((l) => { for (const m of G.Party.active()) while (m.lv < l) G.Party.addExpTo(m, G.Party.expToNext(m.lv), []); }, lv); }
// something a player can see on that cell: an active non-靈視 object, an NPC, a light, or a hint-tagged action event
async function visibleThing(x, y) {
  return ev(([a, b]) => {
    const m = G.mapScene, s = G.state;
    const o = m.objects.find((ob) => m.objActive(ob) && !ob.spirit && a >= ob.x && a < ob.x + (ob.w || 1) && b >= ob.y && b < ob.y + (ob.h || 1));
    if (o) return 'object ' + o.t;
    const n = m.npcs.find((nn) => nn.x === a && nn.y === b && nn.visible !== false && !nn.spirit);
    if (n) return 'npc ' + n.id;
    const L = typeof m.def.lights === 'function' ? m.def.lights(s) : (m.def.lights || []);
    if ((L || []).some((l) => Math.round(l.x) === a && Math.round(l.y) === b)) return 'light';
    const e = (m.def.events || []).find((ee) => ee.trigger === 'action' && ee.hint && m.eventOk(ee) && a >= ee.x && a < ee.x + (ee.w || 1) && b >= ee.y && b < ee.y + (ee.h || 1));
    if (e) return 'hint ' + e.label;
    return null;
  }, [x, y]);
}

// ================================================================================================ the run
async function mainRun(browser) {
  await newPage(browser, URL0 + '?debug&startch=9&autoplay=1');
  await choices(['跟紅纓說話']);
  await settle();
  quest('chapter');
  await expectMap('qihou', 'C9-01 arrives at 旗後');
  // C9-02 天后宮 → night → C9-03 夜灘 (story steps that unlock 阿秀)
  await walk(20, 14);
  await expectMap('qihou_temple');
  await walk(7, 11);
  await choices(['他不會忘']);
  await walk(5, 15);
  check('night beach done (ch9_qihou_night_done)', await flag('ch9_qihou_night_done'));

  // ============================================================== 半屏山湯圓
  quest('q_ch9_banping');
  let m0 = await mark();
  await talkTo('qh_kid');
  check('clue: 阿全 points at 阿秀 in the 金萬 courtyard', (await saidSince(m0, /阿秀.*院子/)).length > 0);
  check('阿秀 stands in the 金萬 courtyard', !!(await visibleThing(15, 25)));
  check('quest not in the log before talking to 阿秀', (await qstage('q_ch9_banping')) === -1);
  await talkTo('qh_xiu');
  check('阿秀 starts the quest (stage 0)', (await qstage('q_ch9_banping')) === 0 && (await flag('ch9_banping_open')));
  m0 = await mark();
  await choices(['到哨船頭']);
  await talkTo('qh_boatman');
  check('clue: the boatman offers the ferry to 半屏山', (await saidSince(m0, /半屏山/)).length > 0);
  await expectMap('banping_foot', 'ferry → 半屏山下');
  await shot('banping_foot');
  check('仙翁\'s 湯圓 stall is visible', (await visibleThing(16, 11)) === 'object stall');
  await choices(['付一文錢']);
  await talkTo('bp_peddler');
  check('仙翁 opens the cave (stage 1)', (await qstage('q_ch9_banping')) === 1 && (await flag('ch9_banping_cave_open')));
  await walk(19, 3);
  await expectMap('banping_cave', 'into 半屏山腹 through the crack');
  // the middle stone door: push it without taking anything
  check('stone door is drawn and inspectable', (await visibleThing(19, 16)) === 'object city_wall');
  await choices(['不拿寶物']);
  await act(19, 16);
  check('stone door opens (ch9_bp_middoor)', await flag('ch9_bp_middoor'));
  check('offering plate is drawn', (await visibleThing(22, 6)) === 'object mill_stone');
  await choices([0]);
  await act(22, 6);
  check('供盤門 opens (ch9_bp_gate)', await flag('ch9_bp_gate'));
  const gold0 = await ev(() => G.state.gold);
  await choices(['給金萬一文錢']);
  await walk(19, 4);
  check('大肚貪鬼 beaten (ch9_banping_done), stage 2', (await flag('ch9_banping_done')) && (await qstage('q_ch9_banping')) === 2);
  check('心燈 xd_banpingshan lit', await lantern('xd_banpingshan'));
  check('rewards: 仙翁的銅錢 + 仙翁湯圓 (paid a coin)', (await count('c9_ac_tongqian')) === 1 && (await count('c9_tangyuan')) === 1);
  await expectMap('qihou', 'back in 旗後');
  check('金萬 opens the 水窟仔 and pays 1000 文 (ch9_banping_reward)', (await flag('ch9_banping_reward')) && (await ev(() => G.state.gold)) >= gold0 - 2 + 1000);
  check('quest log entry closed (G.Quests.isDone)', await qdone('q_ch9_banping'));
  await shot('banping_done');

  // ============================================================== main path → 王船 (as ch9.test.js Part A)
  quest('chapter');
  await levelTo(31);
  await choices(['住宿']); await talkTo('qh_inn');
  await choices(['沿路巡一巡']);
  await walk(22, 35);
  await expectMap('donggang', '→ 東港');
  await act(23, 8);
  check('天公爐 incense', await flag('ch9_tiangong_incense'));
  await choices(['借我王船', '添香油錢', '先做什麼事']);
  await walk(23, 5);
  check('擲筊 done', await flag('ch9_jiaobei_done'));
  await walk(9, 13);
  await choices(['住宿']); await talkTo('dg_inn');
  await walk(46, 9);
  await expectMap('wangchuan_yard');
  for (const [x, y] of [[14, 8], [37, 2], [41, 17]]) await act(x, y);
  // 木料場推車 (the chapter test's push sequence, through the real interaction)
  for (const [fx, fy, d, x, y] of [[6, 10, 'right', 7, 10], [7, 10, 'right', 8, 10], [10, 12, 'left', 8, 12], [9, 12, 'left', 7, 12], [6, 14, 'right', 7, 14], [7, 14, 'right', 8, 14]]) {
    await act(x, y, { from: [fx, fy, d] });
  }
  check('carts cleared', await flag('ch9_carts_clear'));
  await act(8, 16, { from: [8, 15, 'down'] });
  await act(33, 3);
  await choices(['取下']); await act(30, 8);
  await choices(['取下']); await act(36, 8);
  check('three 王船 parts', (await flag('ch9_part_rudder')) && (await flag('ch9_part_sail')) && (await flag('ch9_part_eye')));
  await walk(21, 31);
  await choices(['住宿']); await talkTo('dg_inn');
  await walk(46, 9);
  await levelTo(32);
  await walk(20, 16);
  check('瘟鬼頭 → 王船 launched', (await flag('ch9_wangboat_launch')) && (await mapId()) === 'wangboat_deck');

  // ============================================================== 被風偷走的七個名字
  quest('q_ch9_names');
  await choices(['在船艙休息']); await act(9, 6);
  await choices(['往南']); await talkTo('chenbo');
  await expectMap('hengchun', 'C9-09 → 恆春');
  await talkTo('hc_widow');
  check('潘家阿嬸 (wind): cannot remember the name', (await flag('ch9_widow_talk')) && !(await flag('ch9_name_5')));
  check('old oar is drawn (signboard 槳)', (await visibleThing(34, 25)) === 'object signboard');
  await act(34, 25);
  check('oar unreadable while the wind blows', !(await flag('ch9_name_6')));
  await talkTo('hc_ashun');
  await walk(42, 4);
  await expectMap('hengchun_wall');
  check('C9-11 starts the quest (stage 0)', (await qstage('q_ch9_names')) === 0 && (await flag('ch9_names_quest')));
  await walk(1, 4);
  await choices(['住宿']); await talkTo('hc_inn');
  await walk(37, 1);
  await expectMap('longpan', 'east gate → 龍磐');
  await levelTo(33);
  await walk(20, 7);
  check('落山風靈 beaten: names ①–④, stage 1', (await flag('ch9_fallwind_defeated')) && (await vars()).ch9_names === 4 && (await qstage('q_ch9_names')) === 1);
  check('name ⑦ light across the sand gully (43,18)', !!(await visibleThing(43, 18)));
  await walk(3, 43);
  await expectMap('hengchun', 'back to 恆春');
  await act(34, 25);
  check('name ⑥ 林添福 from the oar', await flag('ch9_name_6'));
  // up the wall with 5 names: 思想起 with gaps — no 心燈 yet, but the 殘篇 and the string
  m0 = await mark();
  await walk(42, 4);
  check('first 思想起 with 5/7: no 心燈, quest still open', !(await lantern('xd_yueqin_names')) && !(await qdone('q_ch9_names')) && (await flag('ch9_hengchun_done')));
  check('歌詞殘篇・恆春 + 月琴弦護符', (await count('c9_key_lyric')) === 1 && (await count('c9_ac_yueqin')) === 1);
  check('clue: 阿順伯 points at 潘家阿嬸', (await saidSince(m0, /潘家的阿嬸/)).length > 0);
  check('clue: 阿順伯 points at the sand gully and the string', (await saidSince(m0, /沙溝.*琴弦/)).length > 0);
  check('no clue for names already found (the oar)', (await saidSince(m0, /舊槳/)).length === 0);
  await walk(1, 4);
  await talkTo('hc_widow');
  check('name ⑤ 潘金水 from 潘家阿嬸', await flag('ch9_name_5'));
  // ⑦: 龍磐's sand gully, called up with the 月琴弦 now the wind is gone
  await walk(37, 1);
  await expectMap('longpan');
  m0 = await mark();
  await walk(35, 18);
  await walk(36, 18);
  check('clue at the gully (calm, string in the bag): try the string', (await saidSince(m0, /琴弦/)).length > 0);
  check('撥弦 hint tag shows at the gully', (await visibleThing(37, 18)) === 'hint 撥弦');
  await shot('longpan_gully');
  let crossed = false;
  for (let attempt = 0; attempt < 3 && !crossed; attempt++) {
    if ((await pos()).join() !== '36,18') await walk(36, 18);
    await act(37, 18, { from: [36, 18, 'right'] });
    // step across as the sand runs uphill, one cell at a time, only onto sand
    for (let x = 37; x <= 43; x++) {
      let ok = false;
      for (let k = 0; k < 20 && !ok; k++) { ok = await ev(([a, b]) => !G.mapScene.blocked(a, b, G.mapScene.player), [x, 18]); if (!ok) await page.waitForTimeout(100); }
      if (!ok) break;
      await ev(([a, b]) => G.Debug.stepOn(a, b, 'right'), [x, 18]);
      await page.waitForTimeout(x === 43 ? 0 : 220);
      if ((await pos()).join() !== x + ',18') break;
    }
    await settle();
    crossed = await flag('ch9_name_7');
  }
  check('name ⑦ 阿財仔 across the sand bridge called by the string', crossed);
  check('all seven names (vars.ch9_names = 7)', (await vars()).ch9_names === 7, (await vars()).ch9_names);
  // no soft-lock: the calm-time bridge is gone by now, the party must not be left on the far strip
  await page.waitForTimeout(6500);
  await settle();
  check('not stranded across the gully after ⑦ (back on the west side)', (await pos())[0] <= 36, (await pos()).join());
  await walk(3, 43);
  await walk(42, 4);
  await talkTo('hcw_ashun');
  check('心燈 xd_yueqin_names lit', (await lantern('xd_yueqin_names')) && (await flag('ch9_yueqin_xindeng')));
  check('quest log entry closed', await qdone('q_ch9_names'));
  await shot('names_done');
  await walk(1, 4);
  await walk(24, 41);
  await expectMap('wangboat_deck', 'board at 南灣');

  // ============================================================== 燈塔守的家書 (2 pages before the boss, 1 after) + 潮汐蕈 after
  quest('q_ch9_lighthouse');
  await choices(['在船艙休息']); await act(9, 6);
  await choices(['鵝鑾鼻']);
  m0 = await mark();
  await talkTo('chenbo');
  await expectMap('eluanbi', '→ 鵝鑾鼻');
  check('clue: 湯姆 says his log pages blew into 龍坑\'s side caves', (await saidSince(m0, /日誌.*龍坑的側洞/)).length > 0);
  check('quest log opens with the clue (stage 0)', (await qstage('q_ch9_lighthouse')) === 0);
  await walk(34, 25);
  await expectMap('longkeng_caves');
  const tide = await ev(() => { const out = []; for (const e of [[21, 14], [21, 15], [21, 16], [21, 17], [21, 18], [18, 20], [17, 20], [16, 20], [15, 20], [14, 20], [13, 20], [21, 21], [21, 22], [21, 23], [21, 24], [24, 20], [25, 20], [26, 20], [27, 20], [28, 20], [29, 20], [34, 19], [35, 19]]) out.push(e.join(',')); return out; });
  await act(18, 3);
  for (const [x, y] of [[5, 5], [39, 18], [40, 30]]) check(`log page at ${x},${y} glimmers (paper + light)`, (await visibleThing(x, y)) === 'object paper_stack' && (await ev(([a, b]) => G.mapScene.def.lights(G.state).some((l) => l.x === a && l.y === b), [x, y])));
  check('潮汐蕈 is drawn on the coral (no 靈視 needed)', (await visibleThing(23, 19)) === 'object mushroom_glow');
  await shot('longkeng');
  for (const [x, y] of [[5, 5], [39, 18]]) await act(x, y, { through: tide });
  check('two pages picked up (stage stays 0)', (await vars()).ch9_logs === 2 && (await qstage('q_ch9_lighthouse')) === 0);
  await levelTo(34);
  await ev(() => G.Party.healAll());
  m0 = await mark();
  await walk(20, 38, { through: tide });
  check('潮病鰻王 → 船頭燈 lit', (await flag('ch9_cave_cleared')) && (await flag('ch9_lighthouse_flame')));
  check('reminder: pages can still be given to 湯先生', (await saidSince(m0, /還可以回鵝鑾鼻/)).length > 0);
  check('no 心燈 yet with 2/3 pages', !(await lantern('xd_lighthouse_home')));

  // the point of no return names what is still open, and 再等等 keeps the player in the south
  quest('ponr');
  await choices(['出航・往東', '出航（', '再等等']);
  m0 = await mark();
  await talkTo('chenbo');
  const plog = await ev(() => G.Debug.log.filter((l) => /pointOfNoReturn ch9/.test(l)));
  check('warning shown, naming only 燈塔守的家書 (banping / names done)', plog.some((l) => /open: q_ch9_lighthouse$/.test(l)), plog.join(' / '));
  check('warning text reached the player', (await saidSince(m0, /前方將無法回頭/)).length > 0);
  check('再等等 keeps the chapter open', !(await flag('ch9_end')) && (await mapId()) === 'wangboat_deck');

  quest('q_ch9_lighthouse');
  await walk(12, 10);
  await expectMap('eluanbi', 'disembark at 鵝鑾鼻');
  await walk(34, 25);
  await expectMap('longkeng_caves', 'back into 龍坑 after the boss');
  await act(40, 30);
  check('third page (after the boss) → stage 1', (await vars()).ch9_logs === 3 && (await qstage('q_ch9_lighthouse')) === 1);

  quest('mush_ch9');
  const mush0 = (await vars()).tuanzi_mush || 0;
  await act(23, 19);
  check('潮汐蕈 eaten (mush_ch9)', await flag('mush_ch9'));
  check('七仙蕈 counter +1 (vars.tuanzi_mush)', ((await vars()).tuanzi_mush || 0) === mush0 + 1, (await vars()).tuanzi_mush);
  check('蕈譜 quest log updated (q_tuanzi_mush stage 9)', (await qstage('q_tuanzi_mush')) === 9);
  check('海蕈 material given', (await count('mat_haixun')) === 1);

  quest('q_ch9_lighthouse');
  await walk(21, 0);
  await expectMap('eluanbi');
  await walk(22, 19);
  await walk(11, 3);
  await expectMap('lighthouse_top');
  await choices(['接你的班']);
  await talkTo('lt_tom');
  check('湯姆 goes home: 心燈 xd_lighthouse_home', (await lantern('xd_lighthouse_home')) && (await flag('ch9_keeper_home')));
  check('pages handed over, 湯姆的望遠鏡 given', (await count('c9_key_log')) === 0 && (await count('c9_ac_telescope')) === 1);
  check('quest log entry closed', await qdone('q_ch9_lighthouse'));
  await walk(1, 7);
  await walk(6, 11);
  await walk(2, 12);
  await expectMap('wangboat_deck', 'back on deck');

  // nothing open any more → the helm sails without a warning
  quest('ponr');
  await ev(() => { G.Debug.log.length = 0; });
  await choices(['出航・往東', '出航（']);
  await ev(() => { G.Debug.talk('chenbo'); });   // the last talk runs straight into chapter 10
  await page.waitForFunction(() => G.state.flags.ch9_end && G.state.chapter === 10, null, { timeout: 240000 });
  const plog2 = await ev(() => G.Debug.log.filter((l) => /pointOfNoReturn ch9/.test(l)));
  check('with everything done the warning is skipped', plog2.some((l) => /nothing open/.test(l)), plog2.join(' / '));
  quest('chapter');
  check('chapter 10 reached', (await ev(() => G.state.chapter)) === 10);
  check('three ch9 心燈', await ev(() => ['xd_banpingshan', 'xd_yueqin_names', 'xd_lighthouse_home'].every((k) => G.state.lanterns[k])));
  const le = await ev(() => (G.lastError ? String(G.lastError.stack || G.lastError) : null));
  check('no G.lastError', !le, le);
  await page.waitForTimeout(1500);
  await page.close();
}

// the 七仙蕈 line in the warning (q_tuanzi_mush is started in chapter 3, so this page presets that one quest only)
async function ponrMushroom(browser) {
  quest('ponr');
  const base = '?debug&autoplay=1&map=wangboat_deck&x=10&y=7&lv=34&party=xinghe,hongying,yungui&chapter=9&flags=mochi_joined,yuyuan_joined,ch9_wangboat_launch,ch9_cape_blocked,ch9_hengchun_done,ch9_keeper_met,ch9_cave_cleared,ch9_lighthouse_flame';
  for (const ate of [false, true]) {
    await newPage(browser, URL0 + base + (ate ? ',mush_ch9' : ''));
    await ev(() => { G.state.vars.ch9_port = 'eluanbi'; G.state.quests.q_tuanzi_mush = { stage: 7, done: false }; });
    await choices(['出航・往東', '出航（', '再等等']);
    await talkTo('chenbo');
    const named = await ev(() => G.Debug.log.some((l) => /pointOfNoReturn ch9: open: .*q_tuanzi_mush/.test(l)));
    check(ate ? 'warning drops 雲歸的蕈譜 once 潮汐蕈 is eaten' : 'warning names 雲歸的蕈譜 while 潮汐蕈 is missing', ate ? !named : named);
    await page.close();
  }
}

// 3D spot-check: the things a player must spot in the dark render in the 3D field view too
async function spot3d(browser) {
  quest('chapter');
  for (const [m, x, y, fl, name] of [['longkeng_caves', 21, 17, 'ch9_keeper_met', 'longkeng_mush'], ['longkeng_caves', 8, 6, 'ch9_keeper_met', 'longkeng_log1'], ['longpan', 35, 18, 'ch9_names_quest,ch9_fallwind_defeated', 'longpan_gully']]) {
    await newPage(browser, URL0 + `?debug&r3lite&autoplay=1&map=${m}&x=${x}&y=${y}&lv=34&party=xinghe,hongying,yungui&chapter=9&flags=mochi_joined,yuyuan_joined,${fl}`, true);
    await page.waitForTimeout(4000);
    check(`3D: ${name} builds (view3d) without errors`, await ev(() => !!(G.mapScene && G.mapScene.view3d) && !G.lastError));
    await page.screenshot({ path: path.join(OUT, `ch9side_3d_${name}.png`) });
    await page.close();
  }
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    await mainRun(browser);
  } catch (e) {
    check('run completed without exceptions', false, (e && e.stack || String(e)).split('\n').slice(0, 4).join(' | '));
    if (page) { try { await page.screenshot({ path: path.join(OUT, 'ch9side_FAIL.png') }); console.log((await ev(() => window.__said.slice(-12).join('\n')))); } catch (_) { /* ignore */ } }
  }
  try { await ponrMushroom(browser); } catch (e) { check('ponr page completed', false, e && e.message); }
  if (DO3D) { try { await spot3d(browser); } catch (e) { check('3D spot-check completed', false, e && e.message); } }
  await browser.close();
  cur = 'chapter';
  for (const e of errors) check('no page/console errors', false, e);
  if (foreign.length) console.log(`\n(ignored ${foreign.length} error(s) from other chapters' files, e.g. ${foreign[0]})`);
  console.log('');
  let bad = 0;
  for (const [q, label] of Object.entries(QUESTS)) {
    const r = res[q];
    if (!r.reached) { bad++; console.log(`FAIL ${q} ${label} — not reached`); continue; }
    if (r.fails.length) { bad++; console.log(`FAIL ${q} ${label} — ${r.fails.join('; ')}`); } else console.log(`PASS ${q} ${label} (${r.checks} checks)`);
  }
  console.log(`\n${bad ? 'FAIL' : 'PASS'}: ch9 side quests in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(bad ? 1 : 0);
})();

#!/usr/bin/env node
// Chapter 9 《王船南行》 automated playthrough (Playwright + Chromium against file://…/index.html).
//
//   node tools/test/chapters/ch9.test.js            # main story + side quests
//   node tools/test/chapters/ch9.test.js --shots    # also save screenshots to tools/test/out/ch9_*.png
//   node tools/test/chapters/ch9.test.js --headed
//   node tools/test/chapters/ch9.test.js --only A,B,sweep,3d   # run selected parts
//   node tools/test/chapters/ch9.test.js --only A --from yard  # Part A from a segment: start banping donggang yard hengchun eluanbi end
//   node tools/test/chapters/ch9.test.js --only A --to donggang  # stop after a segment
//
// Part A drives the critical path from ?debug&startch=9 to G.Story.next(S, 10) while doing every side quest
// (半屏山湯圓 心燈, 七個名字 心燈 + 歌詞殘篇, 燈塔守的家書 心燈) on the way.
// Part B replays the alternative branches from a debug map start: greedy treasure room, the partial
// 思想起 (fewer than 7 names) and completing it later, late delivery of the lighthouse log.
// Fails on page errors / console errors (ERR_FILE_NOT_FOUND and errors thrown by OTHER chapters' files that are
// still being written are reported but ignored), G.lastError, script errors and missing-art warnings.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'tools', 'test', 'out');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const HEADED = argv.includes('--headed');
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? String(argv[i + 1] || '').split(',') : null; })();
const want = (k) => !ONLY || ONLY.includes(k);
const FROM = (() => { const i = argv.indexOf('--from'); return i >= 0 ? argv[i + 1] : null; })();
const TO = (() => { const i = argv.indexOf('--to'); return i >= 0 ? argv[i + 1] : null; })();
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let page = null;
const errors = [];
const foreign = [];
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info: info == null ? '' : String(info) });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${info != null && !ok ? '  — ' + info : ''}`);
}

// errors thrown while LOADING other chapters' files (other builders are still writing them) are recorded by a
// window 'error' listener with their filename; those are reported but do not fail this chapter's test.
const FOREIGN = /js\/(maps\/ch(?!9_)|i18n\/)/;
function installErrorHooks(p) {
  p.on('pageerror', async (e) => {
    const msg = String((e && e.message) || e);
    const st = String((e && e.stack) || '');
    let files = [];
    try { files = await p.evaluate(() => (window.__c9err || []).map((x) => x.file + ' ' + x.msg)); } catch (_) { /* page closed */ }
    if (FOREIGN.test(st) || files.some((f) => FOREIGN.test(f) && f.includes(msg.slice(0, 40)))) { foreign.push('pageerror ' + msg); return; }
    errors.push({ kind: 'pageerror', msg: msg + ' ' + st.split('\n').slice(0, 3).join(' | ') });
  });
  p.on('console', (m) => {
    const text = m.text();
    const loc = (m.location && m.location().url) || '';
    if (m.type() === 'error') {
      if (/ERR_FILE_NOT_FOUND|Failed to load resource/.test(text)) return;
      if (/js\/(maps\/ch(?!9_)|i18n\/)/.test(loc) && !/ch9_south/.test(text)) { foreign.push('console ' + text); return; }
      errors.push({ kind: 'console.error', msg: text });
    } else if (m.type() === 'warning') {
      if (/missing|unknown|not registered|no actor|undefined/i.test(text)) errors.push({ kind: 'console.warn', msg: text });
    }
  });
}

const ev = (fn, arg) => page.evaluate(fn, arg);
async function idleOnce(ms = 180000) {
  const ok = await ev((t) => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const top = G.Scenes.top();
      if (top && G.GameOverScene && top instanceof G.GameOverScene) { clearInterval(iv); res('gameover'); return; }
      const idle = !G.Script.busy() && top === G.mapScene && G.Render.fade.a < 0.05;
      if (idle || Date.now() - t0 > t) { clearInterval(iv); res(idle); }
    }, 100);
  }), ms);
  if (ok === 'gameover') {
    if (process.env.C9_TRACE) console.log((await ev(() => (window.__c9trace || []).slice(-60).join('\n'))));
    throw new Error('GAME OVER on map ' + (await mapId()));
  }
  if (!ok) throw new Error('game did not become idle (map ' + (await mapId()) + ')');
}
// settle: idle, give auto events a few frames to start, idle again
async function settle(ms) {
  for (let i = 0; i < 6; i++) {
    await idleOnce(ms);
    await page.waitForTimeout(350);
    const busy = await ev(() => G.Script.busy() || G.Scenes.top() !== G.mapScene || G.Render.fade.a > 0.05);
    if (!busy) return;
  }
  await idleOnce(ms);
}
const mapId = () => ev(() => (G.mapScene ? G.mapScene.def.id : null));
const flag = (k) => ev((k2) => !!G.state.flags[k2], k);
const vars = () => ev(() => JSON.parse(JSON.stringify(G.state.vars)));
const count = (id) => ev((i) => G.Inv.count(i), id);
const lantern = (id) => ev((i) => !!G.state.lanterns[i], id);
async function choices(list) { await ev((l) => { G.Debug.choices = l.slice(); }, list); }
async function stepOn(x, y) { await ev(([a, b]) => G.Debug.stepOn(a, b), [x, y]); await settle(); }
async function talk(id) { await ev((i) => { G.Debug.talk(i); }, id); await settle(); }
async function trigger(id) { await ev((i) => { G.Debug.trigger(i); }, id); await settle(); }
async function interact(x, y) {
  const found = await ev(([a, b]) => {
    const o = G.mapScene.objects.find((ob) => ob.x === a && ob.y === b && ob.interact && G.mapScene.objActive(ob));
    if (!o) return false;
    G.Script.run(async (S) => { if (typeof o.interact === 'function') await o.interact(S, o); else await S.lines(o.interact); });
    return true;
  }, [x, y]);
  if (!found) throw new Error(`no interactable object at ${x},${y} on ${await mapId()}`);
  await settle();
}
async function face(x, y, dir) { await ev(([a, b, d]) => { const p = G.mapScene.player; p.setCell(a, b); p.dir = d; G.state.x = a; G.state.y = b; }, [x, y, dir]); }
async function shot(name) {
  if (!SHOTS) return;
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `ch9_${name}.png`) });
}
async function lastError() { return ev(() => (G.lastError ? String(G.lastError && G.lastError.stack || G.lastError) : null)); }
async function scriptLog() { return ev(() => (G.Debug.log || []).filter((l) => /SHOP: unknown/.test(l))); }
async function expectMap(id, label) { const m = await mapId(); check(label || `on map ${id}`, m === id, m); }

async function newPage(browser, url, initialChoices, mode3d) {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  installErrorHooks(page);
  await page.addInitScript((use3d) => {
    window.__c9err = [];
    window.addEventListener('error', (e) => { window.__c9err.push({ msg: String(e.message || ''), file: String(e.filename || '') }); }, true);
    // functional runs use the 2D field renderer (fast in headless Chromium); the 3D sweep uses ?r3lite
    window.__c9trace = [];
    setInterval(() => {
      const top = window.G && G.Scenes && G.Scenes.top();
      if (!top || !top.party || !top.enemies) return;
      const f = (u) => u.id + ':' + u.hp + '/' + u.mhp + (u.dead ? 'X' : '') + Object.keys(u.st || {}).join('+');
      const line = 'r' + top.rounds + ' ' + top.party.map(f).join(' ') + ' | ' + top.enemies.map(f).join(' ') + ' fl=' + G.state.vars.flame;
      if (window.__c9trace[window.__c9trace.length - 1] !== line) window.__c9trace.push(line);
    }, 300);
    if (!use3d) { const iv = setInterval(() => { if (window.G && G.settings) { G.settings.render3d = false; clearInterval(iv); } }, 1); }
  }, !!mode3d);
  if (initialChoices) {
    await page.addInitScript((list) => {
      const iv = setInterval(() => { if (window.G && G.Debug && G.Debug.choices) { G.Debug.choices = list.slice(); clearInterval(iv); } }, 5);
    }, initialChoices);
  }
  await page.goto(url);
  await page.waitForFunction(() => window.G && G.Debug && G.mapScene && G.mapScene.def && G.Debug.autoplay, null, { timeout: 30000 });
  await ev(() => { G.settings.battleSpeed = 6; });
}

// ============================================================================================ Part A
// Part A is split into segments that run in order in one page. `--from <segment>` starts at a later segment
// from a debug map load with the flags/vars of all earlier segments (re-run only the failing part).
const SEGMENTS = ['start', 'banping', 'donggang', 'yard', 'hengchun', 'eluanbi', 'end'];
const SF = {};
SF.banping = 'ch9_start,ch9_qihou_arrive,ch9_hongying_comfort,ch9_qihou_temple,ch9_qihou_night,ch9_qihou_night_done';
SF.donggang = SF.banping + ',ch9_banping_open,ch9_banping_cave_open,ch9_tangyuan_paid,ch9_bp_gate,ch9_banping_done,ch9_banping_reward';
SF.yard = SF.donggang + ',ch9_donggang_arrive,ch9_tiangong_incense,ch9_jiaobei_done,ch9_condition_xunjing,ch9_dg_nightfall';
SF.hengchun = SF.yard + ',ch9_shipyard_enter,ch9_bz_w,ch9_bz_n,ch9_bz_e,ch9_carts_clear,ch9_part_rudder,ch9_part_sail,ch9_part_eye,ch9_shipyard_clear,ch9_wangboat_launch';
SF.eluanbi = SF.hengchun + ',ch9_cape_blocked,ch9_hengchun_arrive,ch9_widow_talk,ch9_ashun_met,ch9_names_quest,ch9_hongying_song,ch9_name_1,ch9_name_2,ch9_name_3,ch9_name_4,ch9_name_5,ch9_name_6,ch9_name_7,ch9_fallwind_defeated,ch9_yueqin_xindeng,ch9_lyric_hengchun,ch9_hengchun_done';
SF.end = SF.eluanbi + ',ch9_keeper_met,ch9_lkbz_0,ch9_log_1,ch9_log_2,ch9_log_3,ch9_cave_cleared,ch9_lighthouse_flame,ch9_keeper_home';
const SEG_START = {
  banping: { map: 'qihou', x: 31, y: 21, lv: 30, vars: { days_to_gate: 98 } },
  donggang: { map: 'qihou', x: 22, y: 33, lv: 31, vars: { days_to_gate: 98 }, lanterns: ['xd_banpingshan'], quests: ['q_ch9_banping'] },
  yard: { map: 'donggang', x: 46, y: 11, lv: 31, vars: { days_to_gate: 97 }, lanterns: ['xd_banpingshan'], quests: ['q_ch9_banping'] },
  hengchun: { map: 'wangboat_deck', x: 12, y: 6, lv: 32, vars: { days_to_gate: 94, xunjing: 1, ch9_port: 'donggang' }, lanterns: ['xd_banpingshan'], quests: ['q_ch9_banping'] },
  eluanbi: { map: 'wangboat_deck', x: 12, y: 8, lv: 33, vars: { days_to_gate: 90, xunjing: 1, ch9_port: 'nanwan', ch9_names: 7 }, lanterns: ['xd_banpingshan', 'xd_yueqin_names'], quests: ['q_ch9_banping', 'q_ch9_names'] },
  end: { map: 'wangboat_deck', x: 12, y: 8, lv: 34, vars: { days_to_gate: 89, xunjing: 2, ch9_port: 'eluanbi', ch9_deck_night: true, ch9_names: 7, ch9_logs: 3 }, lanterns: ['xd_banpingshan', 'xd_yueqin_names', 'xd_lighthouse_home'], quests: ['q_ch9_banping', 'q_ch9_names', 'q_ch9_lighthouse'] },
};
let v = null;
async function openSegment(browser, sid) {
  if (sid === 'start') {
    await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + '?debug&startch=9&autoplay=1', ['跟紅纓說話']);
    return;
  }
  const S0 = SEG_START[sid];
  await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + `?debug&autoplay=1&map=${S0.map}&x=${S0.x}&y=${S0.y}&lv=${S0.lv}&party=xinghe,hongying,yungui&chapter=9&flags=mochi_joined,yuyuan_joined,${SF[sid]}`);
  await ev((o) => {
    Object.assign(G.state.vars, o.vars);
    for (const k of o.lanterns || []) G.state.lanterns[k] = { name: k, time: 0 };
    for (const q of o.quests || []) G.Quests.done(q);
    G.state.inv = {};
    for (const [i, n] of [['shimuyu', 3], ['xumingsan', 5], ['huanhunxiang', 3], ['xiancao', 3]]) G.Inv.add(i, n);
  }, S0);
  await gearUp();
  await settle();
}
// chapter-8 gear, as G.Story.ch9 gives a standalone start
async function gearUp() {
  await ev(() => {
    for (const id of ['xinghe', 'hongying', 'yungui']) {
      const m = G.state.members[id];
      for (const slot of ['weapon', 'armor', 'head', 'feet']) {
        let best = null;
        for (const [iid, it] of Object.entries(G.Data.items)) {
          if (it.type !== slot || (it.ch || 0) > 8 || (it.who && !it.who.includes(id))) continue;
          const sc = it.stats ? (it.stats.atk || 0) + (it.stats.def || 0) + (it.stats.mag || 0) : 0;
          if (!best || sc > best.sc) best = { iid, sc };
        }
        if (best) m.equip[slot] = best.iid;
      }
      const st2 = G.Party.stats(id); m.hp = st2.mhp; m.mp = st2.mmp;
    }
    G.mapScene.refresh();
  });
}

async function seg_start() {
  await settle();
  await expectMap('qihou', 'C9-01 arrives at 旗後');
  check('C9-01 flags (ch9_start, ch9_qihou_arrive, ch9_hongying_comfort)', (await flag('ch9_start')) && (await flag('ch9_qihou_arrive')) && (await flag('ch9_hongying_comfort')));
  v = await vars();
  check('vars.days_to_gate starts at 100', v.days_to_gate === 100, v.days_to_gate);
  check('party is 星河・紅纓・雲歸 (陳伯 is not a party member)', JSON.stringify(await ev(() => G.state.party)) === '["xinghe","hongying","yungui"]', JSON.stringify(await ev(() => G.state.party)));
  check('陳伯 follows as an NPC on 旗後', await ev(() => !!G.mapScene.npcs.find((n) => n.id === 'chenbo')));
  await shot('01_qihou');

  // C9-02 天后宮
  await stepOn(20, 14);
  check('C9-02 temple scene (ch9_qihou_temple)', await flag('ch9_qihou_temple'));
  await expectMap('qihou_temple');
  await shot('02_temple');
  await stepOn(7, 11);
  await expectMap('qihou', 'back on 旗後 at night');
  check('night falls after the temple (ch9_qihou_night)', await flag('ch9_qihou_night'));
  await shot('03_qihou_night');
  // C9-03 夜灘 (two battles + campfire talk)
  await choices(['他不會忘']);
  await stepOn(5, 15);
  check('C9-03 night beach done (ch9_qihou_night_done)', await flag('ch9_qihou_night_done'));
  v = await vars();
  check('days_to_gate −2 → 98', v.days_to_gate === 98, v.days_to_gate);
  await shot('04_morning');

}

async function seg_banping() {
  // ---- side quest: 半屏山湯圓 ----
  await talk('qh_xiu');
  check('半屏山 quest opens (ch9_banping_open)', await flag('ch9_banping_open'));
  await choices(['住宿']);
  await talk('qh_inn');
  await choices(['到哨船頭']);
  await talk('qh_boatman');
  await expectMap('banping_foot', 'ferry to 半屏山下');
  await shot('05_banping_foot');
  await choices(['付一文錢']);
  await talk('bp_peddler');
  check('仙翁: paid for one bowl (ch9_tangyuan_paid, ch9_banping_cave_open)', (await flag('ch9_tangyuan_paid')) && (await flag('ch9_banping_cave_open')));
  await stepOn(19, 3);
  await expectMap('banping_cave', 'enter 半屏山腹');
  await shot('06_banping_cave');
  // 只取其一: west room take one, decline the second
  await trigger('bpc_w1');
  check('west room: took one chest (還魂香 ×2)', (await count('huanhunxiang')) >= 2);
  await choices(['不要']);
  await trigger('bpc_w0');
  check('west room: declined the second chest', (await ev(() => G.state.vars.ch9_rooms.w.state)) === 'one');
  await trigger('bpc_m2');
  check('middle room: took 山泥甲, stone door opens', (await count('c9_ar_shanni')) === 1 && (await ev(() => G.state.vars.ch9_rooms.m.state === 'one')));
  // 供盤門
  await choices([0]);
  await interact(22, 6);
  check('供盤門 opened (ch9_bp_gate)', await flag('ch9_bp_gate'));
  await choices(['給金萬一文錢']);
  await stepOn(19, 4);
  check('大肚貪鬼 defeated, 心燈 半屏山湯圓', (await flag('ch9_banping_done')) && (await lantern('xd_banpingshan')));
  check('仙翁的銅錢 + 仙翁湯圓 (paid earlier)', (await count('c9_ac_tongqian')) === 1 && (await count('c9_tangyuan')) === 1);
  await expectMap('qihou', 'back to 旗後 with 金萬');
  check('金萬 opens the 水窟仔 (ch9_banping_reward)', await flag('ch9_banping_reward'));
  check('quest q_ch9_banping done', await ev(() => G.Quests.isDone('q_ch9_banping')));
  await shot('07_banping_reward');

}

async function seg_donggang() {
  // rest at the inn, then C9-04 沿海南行 → 東港 (with the two road battles)
  await choices(['住宿']);
  await talk('qh_inn');
  await choices(['沿路巡一巡']);
  await stepOn(22, 35);
  await expectMap('donggang', 'C9-04 → 東港');
  check('C9-05 arrival (ch9_donggang_arrive)', await flag('ch9_donggang_arrive'));
  await shot('08_donggang');
  // must offer incense at 天公爐 first
  await stepOn(23, 5);
  await expectMap('donggang', 'old woman stops the party before 天公爐');
  await interact(23, 8);
  check('天公爐 incense (ch9_tiangong_incense)', await flag('ch9_tiangong_incense'));
  // C9-06 擲筊 (urgent → 笑筊, 香油錢 → 陰筊, 先做什麼事 → 聖筊, 三聖筊)
  await choices(['借我王船', '添香油錢', '先做什麼事']);
  await stepOn(23, 5);
  await expectMap('donglong_hall');
  check('C9-06 三聖筊 (ch9_jiaobei_done, ch9_condition_xunjing)', (await flag('ch9_jiaobei_done')) && (await flag('ch9_condition_xunjing')));
  check('令旗 & 巡境圖 received', (await count('c9_key_lingqi')) === 1 && (await count('c9_key_xunjing')) === 1);
  const jb = await ev(() => G.Debug.log.filter((l) => /minigame Jiaobei/.test(l)).map((l) => l.replace(/.*-> /, '')));
  check('擲筊 results honour the screenplay (笑・聖・聖・陰・陰・聖・聖聖聖)', jb.join(' ') === '["xiao"] ["sheng"] ["sheng"] ["yin"] ["yin"] ["sheng"] ["sheng","sheng","sheng"]', jb.join(' '));
  v = await vars();
  check('days_to_gate −1 → 97', v.days_to_gate === 97, v.days_to_gate);
  await shot('09_hall');
  await stepOn(9, 13);
  await expectMap('donggang', 'night in 東港');
}

async function seg_yard() {
  // C9-07 王船廠 (rest first)
  await choices(['住宿']);
  await talk('dg_inn');
  await stepOn(46, 9);
  await expectMap('wangchuan_yard');
  check('C9-07 intro (ch9_shipyard_enter) and 艾草束 ×3', (await flag('ch9_shipyard_enter')) && (await count('c9_aicao')) >= 3);
  await shot('10_yard');
  for (const [x, y] of [[14, 8], [37, 2], [41, 17]]) await interact(x, y);
  check('three braziers lit (miasma cleared)', (await flag('ch9_bz_w')) && (await flag('ch9_bz_n')) && (await flag('ch9_bz_e')));
  // 木料場推車 puzzle
  await face(6, 10, 'right'); await interact(7, 10);
  await face(7, 10, 'right'); await interact(8, 10);
  await face(10, 12, 'left'); await interact(8, 12);
  await face(9, 12, 'left'); await interact(7, 12);
  await face(6, 14, 'right'); await interact(7, 14);
  await face(7, 14, 'right'); await interact(8, 14);
  check('rail carts pushed clear of the x=8 passage', await flag('ch9_carts_clear'), JSON.stringify((await vars()).ch9_carts));
  await face(8, 15, 'down');
  await trigger('wy_rudder');
  check('王船舵 (ch9_part_rudder)', (await flag('ch9_part_rudder')) && (await count('c9_key_rudder')) === 1);
  await interact(33, 3);
  check('王船帆 (ch9_part_sail)', await flag('ch9_part_sail'));
  // 龍目: one wrong board (battle), then ① + ④
  await choices(['取下']);
  await interact(32, 8);
  check('wrong 龍目 board turns into 瘟鬼 and resets', !(await flag('ch9_part_eye')));
  await choices(['取下']); await interact(30, 8);
  await choices(['取下']); await interact(36, 8);
  check('龍目 pair ①＋④ (ch9_part_eye)', (await flag('ch9_part_eye')) && (await count('c9_key_eye')) === 1);
  await shot('11_yard_parts');
  // C9-07b 瘟鬼頭 → C9-08 launch → deck (go back out and rest at the inn first, as a player would)
  await stepOn(21, 31);
  await choices(['住宿']);
  await talk('dg_inn');
  await stepOn(46, 9);
  console.log('       party levels: ' + (await ev(() => G.Party.active().map((m) => m.id + ' L' + m.lv).join(', '))));
  await stepOn(20, 16);
  check('C9-07b 瘟鬼頭 defeated (ch9_shipyard_clear)', await flag('ch9_shipyard_clear'));
  check('C9-08 王船出港 (ch9_wangboat_launch)', await flag('ch9_wangboat_launch'));
  await expectMap('wangboat_deck', 'on the 王船 deck after launch');
  v = await vars();
  check('巡境 ① 東港 (vars.xunjing = 1)', v.xunjing === 1, v.xunjing);
  check('days_to_gate → 94 after C9-07b(−1) & C9-08(−2)', v.days_to_gate === 94, v.days_to_gate);
  check('巡境號衣 ×3', (await count('c9_ar_haoyi')) === 3);
  check('陳伯 at the helm (NPC on deck, not in party)', await ev(() => !!G.mapScene.npcs.find((n) => n.id === 'chenbo') && !G.state.party.includes('chenbo')));
  await shot('12_deck');
}

async function seg_hengchun() {
  // deck rest & save point
  await choices(['在船艙休息']);
  await trigger('deck_rest');

  // C9-09 南岬逆風 → 恆春
  await choices(['往南']);
  await talk('chenbo');
  check('C9-09 cape blocked (ch9_cape_blocked)', await flag('ch9_cape_blocked'));
  await expectMap('hengchun', 'C9-09 → 恆春');
  check('C9-10 arrival (ch9_hengchun_arrive)', await flag('ch9_hengchun_arrive'));
  v = await vars();
  check('days_to_gate → 92', v.days_to_gate === 92, v.days_to_gate);
  await shot('13_hengchun');
  await talk('hc_widow');
  check('潘家阿嬸 talked to before the wind stops (ch9_widow_talk)', await flag('ch9_widow_talk'));
  await interact(34, 25);
  check('old oar unreadable while the wind blows', !(await flag('ch9_name_6')));
  await talk('hc_ashun');
  check('C9-10 阿順伯 (ch9_ashun_met)', await flag('ch9_ashun_met'));
  await stepOn(42, 4);
  await expectMap('hengchun_wall');
  check('C9-11 (ch9_names_quest, ch9_hongying_song)', (await flag('ch9_names_quest')) && (await flag('ch9_hongying_song')));
  await shot('14_wall_night');
  await stepOn(1, 4);
  await choices(['住宿']);
  await talk('hc_inn');
  await stepOn(37, 1);
  await expectMap('longpan', 'east gate → 龍磐');
  await shot('15_longpan');
  await stepOn(43, 18);
  check('名字光⑦ 阿財仔 (across the sand bridge)', await flag('ch9_name_7'));
  console.log('       party levels: ' + (await ev(() => G.Party.active().map((m) => m.id + ' L' + m.lv).join(', '))));
  await stepOn(20, 7);
  check('C9-12 落山風靈 defeated (ch9_fallwind_defeated)', await flag('ch9_fallwind_defeated'));
  v = await vars();
  check('names ①–④ from the battle + ⑦ → 5', v.ch9_names === 5, v.ch9_names);
  check('days_to_gate → 91', v.days_to_gate === 91, v.days_to_gate);
  await shot('16_longpan_calm');
  await stepOn(3, 43);
  await expectMap('hengchun', 'back to 恆春');
  await interact(34, 25);
  check('名字⑥ 林添福 from the oar', await flag('ch9_name_6'));
  await talk('hc_widow');
  check('名字⑤ 潘金水 from 潘家阿嬸', await flag('ch9_name_5'));
  check('all seven names (vars.ch9_names = 7)', (await vars()).ch9_names === 7, (await vars()).ch9_names);
  await stepOn(42, 4);
  check('C9-13 心燈 月琴伯的名字', (await lantern('xd_yueqin_names')) && (await flag('ch9_yueqin_xindeng')));
  check('歌詞殘篇・恆春 (ch9_lyric_hengchun + key item)', (await flag('ch9_lyric_hengchun')) && (await count('c9_key_lyric')) === 1);
  check('月琴弦護符 + ch9_hengchun_done', (await count('c9_ac_yueqin')) === 1 && (await flag('ch9_hengchun_done')));
  v = await vars();
  check('days_to_gate → 90', v.days_to_gate === 90, v.days_to_gate);
  await shot('17_wall_song');
  // wall chest (2000 文) now available
  const g0 = await ev(() => G.state.gold);
  await ev(() => { const o = G.mapScene.objects.find((ob) => ob.t === 'chest' && ob.chestKey === 'hengchun_wall:hcw_gold'); G.mapScene.openChest(o); });
  await settle();
  check('城牆頂 chest 2000 文', (await ev(() => G.state.gold)) === g0 + 2000);
  await stepOn(1, 4);
  await stepOn(24, 41);
  await expectMap('wangboat_deck', 'board at 南灣');

}

async function seg_eluanbi() {
  // C9-14 鵝鑾鼻 (rest in the ship's hold first)
  await choices(['在船艙休息']);
  await trigger('deck_rest');
  await choices(['鵝鑾鼻']);
  await talk('chenbo');
  await expectMap('eluanbi', 'sail to 鵝鑾鼻 and go ashore');
  check('C9-14 湯姆 (ch9_keeper_met + 燈塔之火)', (await flag('ch9_keeper_met')) && (await count('key_lighthouse')) === 1);
  await shot('18_eluanbi');
  await choices(['買東西']);
  await talk('el_tom');
  // lighthouse interior & lamp room
  await stepOn(22, 19);
  await expectMap('lighthouse_in');
  await shot('19_lighthouse_in');
  await stepOn(11, 3);
  await expectMap('lighthouse_top');
  await shot('20_lighthouse_top');
  await stepOn(1, 7);
  await stepOn(6, 11);
  await expectMap('eluanbi');
  // C9-15 龍坑
  await stepOn(34, 25);
  await expectMap('longkeng_caves');
  check('flame starts at 100', (await vars()).flame === 100, (await vars()).flame);
  await shot('21_longkeng');
  await interact(18, 3);
  check('first 咾咕石火盆 lit', await flag('ch9_lkbz_0'));
  for (const [x, y] of [[5, 5], [39, 18], [40, 30]]) await interact(x, y);
  check('three 燈塔日誌殘頁 (vars.ch9_logs = 3)', (await vars()).ch9_logs === 3 && (await count('c9_key_log')) === 3);
  console.log('       party levels: ' + (await ev(() => G.Party.active().map((m) => m.id + ' L' + m.lv).join(', '))));
  // a player would patch up with items after the cave fights and arrive at the area's top level (34);
  // the auto-battle AI never uses items and the run skips the cave's random encounters
  await ev(() => { for (const m of G.Party.active()) while (m.lv < 34) G.Party.addExpTo(m, G.Party.expToNext(m.lv), []); G.Party.healAll(); });
  await stepOn(20, 38);
  check('C9-15 潮病鰻王 (ch9_cave_cleared, ch9_lighthouse_flame)', (await flag('ch9_cave_cleared')) && (await flag('ch9_lighthouse_flame')));
  check('護燈 command removed after the battle', await ev(() => !G.state.members.xinghe.skills.includes('c9_guard_lamp')));
  v = await vars();
  check('巡境 ② 鵝鑾鼻 (vars.xunjing = 2)', v.xunjing === 2, v.xunjing);
  check('days_to_gate → 89', v.days_to_gate === 89, v.days_to_gate);
  check('燈塔之火 used up (became the 船頭燈)', (await count('key_lighthouse')) === 0);
  check('§4.3 心燈 燈塔守的家書 (logs delivered automatically)', (await lantern('xd_lighthouse_home')) && (await flag('ch9_keeper_home')) && (await count('c9_ac_telescope')) === 1);
  await expectMap('lighthouse_top', 'home-letter scene in the lamp room');
  await shot('22_keeper_home');
  // back to the ship
  await stepOn(1, 7);
  await stepOn(6, 11);
  await stepOn(2, 12);
  await expectMap('wangboat_deck', 'back on deck');
  await shot('23_deck_lamp');
  check('chapter objectives: quest q_ch9_lighthouse & q_ch9_names done', await ev(() => G.Quests.isDone('q_ch9_lighthouse') && G.Quests.isDone('q_ch9_names')));
}

async function seg_end() {
  // C9-16 → chapter 10
  await choices(['出航・往東', '出航（']);
  await ev(() => { G.Debug.talk('chenbo'); });
  await page.waitForFunction(() => G.state.flags.ch9_end && G.state.chapter === 10, null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  check('C9-16 ends the chapter (ch9_end, G.state.chapter === 10)', (await flag('ch9_end')) && (await ev(() => G.state.chapter)) === 10);
  check('three 心燈 this chapter', (await ev(() => ['xd_banpingshan', 'xd_yueqin_names', 'xd_lighthouse_home'].every((k) => G.state.lanterns[k]))));
  const le = await lastError();
  check('no G.lastError in part A', !le, le);
  const unk = await scriptLog();
  check('no unknown shop items', !unk.length, unk.join(', '));
}

async function partA(browser, from) {
  console.log(`\n== Part A: chapter 9 critical path${from && from !== 'start' ? ' from segment ' + from : ''} → chapter 10 ==`);
  const i0 = Math.max(0, SEGMENTS.indexOf(from || 'start'));
  await openSegment(browser, SEGMENTS[i0]);
  const i1 = TO && SEGMENTS.includes(TO) ? SEGMENTS.indexOf(TO) : SEGMENTS.length - 1;
  for (let i = i0; i <= i1; i++) {
    console.log(`  -- segment ${SEGMENTS[i]}`);
    const t0 = Date.now();
    // the run skips random encounters: catch up to the level a segment run starts at
    if (i > i0) await ev((lv) => { for (const m of G.Party.active()) while (m.lv < lv) G.Party.addExpTo(m, G.Party.expToNext(m.lv), []); }, SEG_START[SEGMENTS[i]].lv);
    await ({ start: seg_start, banping: seg_banping, donggang: seg_donggang, yard: seg_yard, hengchun: seg_hengchun, eluanbi: seg_eluanbi, end: seg_end })[SEGMENTS[i]]();
    console.log(`  -- segment ${SEGMENTS[i]} took ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await page.close();
}

// ============================================================================================ Part B
async function partB(browser) {
  console.log('\n== Part B: alternative branches ==');
  // greedy treasure room in 半屏山腹
  await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + '?debug&autoplay=1&map=banping_cave&x=31&y=12&lv=31&party=xinghe,hongying,yungui&chapter=9&flags=mochi_joined,yuyuan_joined,ch9_banping_open,ch9_banping_cave_open');
  await gearUp();
  await trigger('bpc_e0');
  check('east room: took 金縷頭巾', (await count('c9_hd_jinlv')) === 1);
  await choices(['打開']);
  await trigger('bpc_e1');
  check('greedy: second chest ambush → first item turns to mud, room lost', (await count('c9_hd_jinlv')) === 0 && (await ev(() => G.state.vars.ch9_rooms.e.state)) === 'lost');
  check('chests vanish after greed', await ev(() => !G.mapScene.objects.some((o) => o.key === 'bpc_e2' && G.mapScene.objActive(o))));
  // 供盤門 with an empty bag → "謝謝"
  await ev(() => { G.state.inv = {}; });
  await choices(['謝謝']);
  await interact(22, 6);
  check('供盤門 opens for a "謝謝" when the bag is empty', await flag('ch9_bp_gate'));
  await shot('B1_greed');
  await page.close();

  // partial 思想起 → collect the last names later → second wall scene gives the 心燈
  await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + '?debug&autoplay=1&map=hengchun&x=24&y=30&lv=33&party=xinghe,hongying,yungui&chapter=9' +
    '&flags=mochi_joined,yuyuan_joined,ch9_cape_blocked,ch9_hengchun_arrive,ch9_ashun_met,ch9_names_quest,ch9_fallwind_defeated,ch9_name_1,ch9_name_2,ch9_name_3,ch9_name_4');
  await stepOn(42, 4);
  check('C9-13 with 4 names: no 心燈 yet, chapter part done', (await flag('ch9_hengchun_done')) && !(await lantern('xd_yueqin_names')));
  check('歌詞殘篇 is still obtained', await flag('ch9_lyric_hengchun'));
  await stepOn(1, 4);
  await talk('hc_widow');
  check('widow found outside the south gate gives 潘金水', await flag('ch9_name_5'));
  await interact(34, 25);
  await ev(() => { G.state.flags.ch9_name_7 = true; });
  await stepOn(42, 4);
  await talk('hcw_ashun');
  check('later: 7 names → 心燈 月琴伯的名字', (await lantern('xd_yueqin_names')) && (await flag('ch9_yueqin_xindeng')));
  check('月牙槍 now sold at 恆春武具 (ch9_hengchun_done)', await flag('ch9_hengchun_done'));
  await page.close();

  // lighthouse logs delivered after the bow lamp is lit
  await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + '?debug&autoplay=1&map=lighthouse_top&x=2&y=7&lv=34&party=xinghe,hongying,yungui&chapter=9' +
    '&flags=mochi_joined,yuyuan_joined,ch9_keeper_met,ch9_cave_cleared,ch9_lighthouse_flame,ch9_log_1,ch9_log_2,ch9_log_3');
  await ev(() => { G.Inv.add('c9_key_log', 3); });
  await choices(['接你的班']);
  await talk('lt_tom');
  check('late delivery: 心燈 燈塔守的家書', (await lantern('xd_lighthouse_home')) && (await flag('ch9_keeper_home')));
  check('logs handed over', (await count('c9_key_log')) === 0);
  await page.close();

  // 王船 hub: sailing between ports, disembark, board
  await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + '?debug&autoplay=1&map=wangboat_deck&x=10&y=7&lv=33&party=xinghe,hongying,yungui&chapter=9' +
    '&flags=mochi_joined,yuyuan_joined,ch9_wangboat_launch,ch9_cape_blocked,ch9_hengchun_done,ch9_qihou_night_done,ch9_donggang_arrive,ch9_jiaobei_done,ch9_shipyard_clear');
  await ev(() => { G.state.vars.ch9_port = 'nanwan'; });
  await choices(['旗後']);
  await talk('chenbo');
  check('sail to 旗後', (await vars()).ch9_port === 'qihou');
  await stepOn(12, 10);
  await expectMap('qihou', 'disembark at 旗後 pier');
  await stepOn(45, 8);
  await expectMap('wangboat_deck', 'board at 旗後 pier');
  await choices(['東港']);
  await talk('chenbo');
  await stepOn(12, 10);
  await expectMap('donggang', 'disembark at 東港');
  await shot('B2_donggang_after');
  await stepOn(26, 27);
  await expectMap('wangboat_deck', 'board at 東港');
  const le = await lastError();
  check('no G.lastError in part B', !le, le);
  await page.close();
}

// ============================================================================================ map sweep
async function sweep(browser) {
  console.log('\n== Map sweep (load every chapter 9 map) ==');
  const maps = ['qihou', 'qihou_temple', 'banping_foot', 'banping_cave', 'donggang', 'donglong_hall', 'wangchuan_yard', 'wangboat_deck', 'hengchun', 'hengchun_wall', 'longpan', 'eluanbi', 'lighthouse_in', 'lighthouse_top', 'longkeng_caves'];
  for (const m of maps) {
    await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + `?debug&autoplay=1&map=${m}&lv=32&party=xinghe,hongying,yungui&chapter=9&flags=mochi_joined,yuyuan_joined,ch9_qihou_arrive,ch9_qihou_temple,ch9_donggang_arrive,ch9_shipyard_enter,ch9_cape_blocked,ch9_hengchun_arrive,ch9_keeper_met`);
    await page.waitForTimeout(1200);
    const ok = await ev((id) => G.mapScene && G.mapScene.def.id === id && !G.lastError, m);
    check(`map ${m} loads and renders`, ok);
    await shot('map_' + m);
    await page.close();
  }
}

// ============================================================================================ 3D sweep
async function sweep3d(browser) {
  console.log('\n== 3D sweep (?r3lite) ==');
  const maps = [['qihou', 24, 18], ['banping_cave', 20, 3, 'ch9_bp_gate'], ['donggang', 23, 10], ['wangchuan_yard', 20, 17], ['wangboat_deck', 12, 6], ['hengchun', 24, 20], ['longpan', 23, 9], ['eluanbi', 20, 14], ['longkeng_caves', 21, 13]];
  for (const [m, x, y, fl] of maps) {
    await newPage(browser, 'file://' + path.join(ROOT, 'index.html') + `?debug&r3lite&autoplay=1&map=${m}&x=${x}&y=${y}&lv=32&party=xinghe,hongying,yungui&chapter=9&flags=mochi_joined,yuyuan_joined,ch9_qihou_arrive,ch9_qihou_temple,ch9_donggang_arrive,ch9_shipyard_enter,ch9_cape_blocked,ch9_hengchun_arrive,ch9_keeper_met${fl ? ',' + fl : ''}`, null, true);
    await page.waitForTimeout(4000);
    const ok = await ev((id) => G.mapScene && G.mapScene.def.id === id && !G.lastError, m);
    check(`3D: map ${m} builds and renders`, ok, await lastError());
    await shot('3d_' + m);
    await page.close();
  }
}

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: !HEADED });
  try {
    if (want('A')) await partA(browser, FROM);
    if (want('B')) await partB(browser);
    if (want('sweep')) await sweep(browser);
    if (want('3d')) await sweep3d(browser);
  } catch (e) {
    check('test run completed without exceptions', false, e && e.stack || e);
    if (page) { try { await page.screenshot({ path: path.join(OUT, 'ch9_FAIL.png') }); } catch (_) { /* ignore */ } }
  }
  await browser.close();
  for (const e of errors) check(`no ${e.kind}`, false, e.msg);
  if (foreign.length) console.log(`\n(ignored ${foreign.length} error(s) thrown by other chapters' in-progress files, e.g. ${foreign[0]})`);
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${fails.length ? 'FAIL' : 'PASS'}: ch9 — ${results.length - fails.length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(fails.length ? 1 : 0);
})();

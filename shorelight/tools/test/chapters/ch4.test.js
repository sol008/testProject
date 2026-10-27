#!/usr/bin/env node
// Chapter 4 《竹塹風起》 automated playthrough (Playwright + Chromium against file://…/index.html).
//
//   node tools/test/chapters/ch4.test.js            # full run (critical path + side content)
//   node tools/test/chapters/ch4.test.js --shots    # also save screenshots to tools/test/out/ch4_*.png
//   node tools/test/chapters/ch4.test.js --headed
//   node tools/test/chapters/ch4.test.js --only main|side
//   node tools/test/chapters/ch4.test.js --3d       # keep the WebGL map renderer on (?r3lite)
//
// 1. Opens index.html?debug&startch=4 (standalone chapter start) with G.Debug autoplay on and drives the critical path
//    through every main event: 4-01 … 4-18 → G.Story.next(S, 5) (asserts ch4_done and G.state.chapter === 5).
//    Puzzles are solved through their real mechanics (stone pushes, chime state machine, echo loops, wind blades).
// 2. Separately exercises every side quest and 心燈 (S1–S6, kite, scholar, 柿鼠大王, 渡魂謠 release rule) and asserts
//    flags / lanterns / items.
// 3. Fails on page errors, console errors (ERR_FILE_NOT_FOUND and syntax errors inside OTHER chapters' files that
//    are being written in parallel are ignored), console warnings (missing art, unknown items, no actor…),
//    G.lastError and script errors. Anything logged after ch4_done (i.e. by chapter 5) is not chapter 4's.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'tools', 'test', 'out');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const HEADED = argv.includes('--headed');
const R3D = argv.includes('--3d');           // default: 2D renderer (fast & deterministic in headless Chromium)
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1] : null; })();
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let page;
let section = '';

function check(name, ok, detail) {
  results.push({ name: section + ' ' + name, ok: !!ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail !== undefined ? '  — ' + detail : ''}`);
}
const ev = (js, arg) => page.evaluate(js, arg);
async function idle(ms = 180000) {
  for (let k = 0; k < 2; k++) {
    const ok = await ev((t) => G.Debug.idle(t), ms);
    if (!ok) {
      const info = await ev(() => ({ map: G.mapScene && G.mapScene.def.id, top: G.Scenes.stack.map((s) => s.constructor && s.constructor.name), busy: G.Script.busy() }));
      throw new Error('timeout waiting for idle: ' + JSON.stringify(info));
    }
    const go = await ev(() => G.GameOverScene && G.Scenes.top() instanceof G.GameOverScene);
    if (go) throw new Error('GAME OVER');
    await page.waitForTimeout(250);
  }
}
const mapId = () => ev(() => G.mapScene && G.mapScene.def.id);
const flag = (k) => ev((k) => !!G.state.flags[k], k);
const count = (id) => ev((id) => G.Inv.count(id), id);
const pos = () => ev(() => [G.mapScene.player.x, G.mapScene.player.y]);
async function stepOn(x, y) { await ev(([x, y]) => G.Debug.stepOn(x, y), [x, y]); await page.waitForTimeout(120); await idle(); }
// scripts are raced against a timeout so a stuck script fails the test instead of hanging it
async function runScript(kind, id) {
  const r = await ev(([kind, id]) => Promise.race([G.Debug[kind](id).then(() => 'ok'), new Promise((res) => setTimeout(() => res('TIMEOUT'), 150000))]), [kind, id]);
  if (r !== 'ok') throw new Error(`${kind}(${id}) did not finish: ` + JSON.stringify(await ev(() => ({ map: G.mapScene.def.id, top: G.Scenes.stack.map((s) => s.constructor.name) }))));
  await idle();
}
async function trigger(id) { await runScript('trigger', id); }
async function talk(id) { await runScript('talk', id); }
async function choices(list) { await ev((l) => { G.Debug.choices = l.slice(); }, list); }
async function warp(map, x, y, dir = 'down') { await ev(([m, x, y, d]) => G.Script.run((S) => S.warp(m, x, y, d)), [map, x, y, dir]); await page.waitForTimeout(150); await idle(); }
async function interactObj(t, x, y) {
  const ok = await ev(([t, x, y]) => {
    const o = G.mapScene.objects.find((ob) => ob.t === t && ob.x === x && ob.y === y && ob.interact);
    if (!o) return false;
    G.Script.run(async (S) => { if (typeof o.interact === 'function') await o.interact(S, o); else await S.lines(o.interact); });
    return true;
  }, [t, x, y]);
  await page.waitForTimeout(100);
  await idle();
  return ok;
}
async function openChest(id) {
  const ok = await ev((id) => {
    const m = G.mapScene;
    const o = m.objects.find((ob) => ob.t === 'chest' && ob.chest && ob.chest.id === id && m.objActive(ob));
    if (!o || o.open) return false;
    m.openChest(o);
    return true;
  }, id);
  await page.waitForTimeout(100);
  await idle();
  return ok;
}
async function fightEnemy(id) {
  const ok = await ev((id) => {
    const m = G.mapScene;
    const e = m.enemies.find((x) => x.id === id);
    if (!e) return false;
    m.startBattle(e, 'normal');
    return true;
  }, id);
  await page.waitForTimeout(200);
  await idle();
  return ok;
}
// the gear a player buys in 竹塹 (打鐵舖 / 藍衫裁縫) — the test skips the shops, so equip it directly
async function equipCh4() {
  await ev(() => {
    const W = { xinghe: 'sw_jiujiang', baizhi: 'fl_shange', hongying: 'sp_zhujie', yungui: 'fn_zhugu' };
    for (const id in W) Object.assign(G.state.members[id].equip, { weapon: W[id], armor: 'ar_hakka', head: 'hd_huabu', feet: 'ft_muji' });
  });
}
async function levelTo(lv) { await ev((lv) => { for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) G.Story.ensureLevel(id, lv); }, lv); }
async function shot(name) {
  if (!SHOTS) return;
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `ch4_${name}.png`) });
}
async function expectMap(id, label) { const m = await mapId(); check(`${label || 'on map'} ${id}`, m === id, 'current map ' + m); }

async function openPage(browser, query) {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    window.__c4 = { log: [], winerr: [] };
    const done = () => !!(window.G && G.state && G.state.flags && G.state.flags.ch4_done);
    const loading = () => !(window.G && G.inGame);
    for (const k of ['error', 'warn']) {
      const orig = console[k];
      console[k] = function (...a) {
        window.__c4.log.push({ k, done: done(), msg: a.map((x) => (x && x.stack) ? x.stack : String(x)).join(' ').slice(0, 600) });
        return orig.apply(this, a);
      };
    }
    window.addEventListener('error', (e) => window.__c4.winerr.push({ msg: String(e.message), file: String(e.filename || ''), done: done(), loading: loading() }));
    window.addEventListener('unhandledrejection', (e) => window.__c4.winerr.push({ msg: 'unhandledrejection: ' + String(e.reason && e.reason.stack || e.reason), file: '', done: done() }));
  });
  // 3D renderer off unless --3d (as the lead asked: localStorage settings, or ?r3lite with --3d)
  if (!R3D) await page.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false, lang: 'zh' })); } catch (e) { /* ignore */ } });
  await page.goto('file://' + path.join(ROOT, 'index.html') + query + (R3D ? '&r3lite' : ''));
  await page.waitForFunction(() => window.G && G.Debug && G.Debug.setAutoplay, null, { timeout: 30000 });
  await ev((r3d) => { G.Debug.setAutoplay(true); G.settings.lang = 'zh'; if (!r3d) G.settings.render3d = false; }, R3D);
}
// collect problems that belong to chapter 4
async function problems() {
  const r = await ev(() => ({ log: window.__c4.log, winerr: window.__c4.winerr, last: G.lastError ? String(G.lastError.stack || G.lastError) : null }));
  const out = [];
  const otherChapter = (f) => /js\/maps\/ch(?!4_)\d+_\w+\.js/.test(f) || /js\/i18n\//.test(f);
  const myFileLoaded = await ev(() => typeof G.Story.ch4 === 'function' && !!G.Maps.get('wind_cave_3'));
  for (const e of r.winerr) {
    if (e.done) continue;
    if (otherChapter(e.file)) continue; // another chapter's file is still being written
    // file:// hides the origin of syntax errors thrown while the page loads ("Script error."); chapter 4's own
    // file is verified to have loaded completely, so such an error belongs to another file still being written
    if (e.loading && myFileLoaded && (/^Script error\.?$/.test(e.msg) || /Unexpected|SyntaxError|Invalid or unexpected/.test(e.msg))) continue;
    out.push(`window error: ${e.msg} @ ${e.file}`);
  }
  for (const l of r.log) {
    if (l.done) continue;
    if (/ERR_FILE_NOT_FOUND|Failed to load resource/.test(l.msg)) continue;
    out.push(`console.${l.k}: ${l.msg}`);
  }
  if (r.last) out.push('G.lastError: ' + r.last);
  return out;
}

// ============================================================================================================= main
async function mainPath(browser) {
  section = '[main]';
  console.log('\n== critical path ==');
  await openPage(browser, '?debug&startch=4&flags=mochi_joined,yuyuan_joined');
  await page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'zhuqian_coast' && G.state.flags.ch4_start, null, { timeout: 90000 });
  await idle();
  // 4-01
  check('chapter set to 4', (await ev(() => G.state.chapter)) === 4);
  check('party 星河 白芷 紅纓 雲歸', (await ev(() => G.state.party.slice(0, 4).join(','))) === 'xinghe,baizhi,hongying,yungui');
  check('cats 麻糬 & 芋圓 follow', await ev(() => ['mochi', 'yuyuan'].every((id) => G.mapScene.followers.some((f) => f.id === id))));
  check('no 糰子 anywhere', await ev(() => !G.mapScene.followers.some((f) => f.id === 'tuanzi')));
  check('levels ≥ 13', await ev(() => G.Party.active().every((m) => m.lv >= 13)));
  check('4-01 done (ch4_arrive_zhuqian, ch4_mifen_met)', (await flag('ch4_arrive_zhuqian')) && (await flag('ch4_mifen_met')));
  check('米粉湯 ×2', (await count('mifentang')) >= 2);
  check('q_ch4_main stage 0', (await ev(() => G.Quests.stage('q_ch4_main'))) === 0);
  check('visited 竹塹 on the world map', await ev(() => G.World.visited('hsinchu')));
  await equipCh4();
  await shot('01_coast');
  // the road north is closed
  await stepOn(13, 1);
  check('north road sends you back', (await pos())[1] > 1);
  for (const id of ['ashun', 'awang', 'achun', 'fisher', 'xiaofeng']) await talk(id);
  await choices(['離開']); await trigger('shrine');
  check('chest c4_01', await openChest('c4_01'));
  check('chest c4_02', await openChest('c4_02'));
  check('chest c4_03', await openChest('c4_03'));
  // 4-02
  await stepOn(13, 32);
  await expectMap('zhuqian', '4-02');
  check('ch4_enter_city', await flag('ch4_enter_city'));
  await shot('02_city');
  // east gate is closed before the vision
  await stepOn(55, 21);
  await expectMap('zhuqian', 'east gate closed before 城隍:');
  await stepOn(27, 43);
  await expectMap('zhuqian', 'south gate closed:');
  await stepOn(0, 21);
  await expectMap('zhuqian', 'west gate closed:');
  // 4-03 (optional)
  await choices(['多少錢']);
  await talk('wen');
  check('4-03 ch4_changming_stall_seen', await flag('ch4_changming_stall_seen'));
  for (const id of ['gate_n', 'gate_e', 'gate_s', 'gate_w', 'achi_out', 'mother', 'wen', 'agui', 'amei', 'scholar_old', 'kid', 'walker1', 'walker2']) await talk(id);
  check('chest c4_04', await openChest('c4_04'));
  check('chest c4_05 (+150 文)', await openChest('c4_05'));
  // interiors
  await stepOn(9, 9); await expectMap('zhuqian_inn'); await choices(['不用了']); await talk('innkeeper'); await stepOn(7, 9);
  await stepOn(39, 9); await expectMap('zhuqian_smith'); await talk('smith'); await stepOn(6, 8);
  await stepOn(46, 9); await expectMap('zhuqian_pharmacy'); await talk('doctor'); await stepOn(6, 8);
  await expectMap('zhuqian');
  // 4-04 → 4-05: wrong questions first (笑筊), then the right ones
  await choices(['發大財', '白芷', '失蹤', '海上', '城裡', '山裡']);
  await stepOn(27, 18);
  await expectMap('zhuqian_citygod', '4-04/4-05 back in');
  check('ch4_citygod_visit + ch4_jiaobei_done', (await flag('ch4_citygod_visit')) && (await flag('ch4_jiaobei_done')));
  check('4-05 ch4_citygod_vision', await flag('ch4_citygod_vision'));
  check('jiaobei used scripted results', await ev(() => G.Debug.log.filter((l) => l.startsWith('minigame Jiaobei')).length >= 5));
  check('生死簿殘頁 obtained', (await count('key_ledger')) === 1);
  check('平安符 ×3', (await count('pinganfu')) >= 3);
  check('q_ch4_main stage 1', (await ev(() => G.Quests.stage('q_ch4_main'))) === 1);
  check('ledger description follows the story', (await ev(() => G.Data.items.key_ledger.desc)).includes('淡得幾乎看不見'));
  for (const id of ['achi', 'granny']) await talk(id);
  for (const id of ['abacus', 'xie', 'fan']) await trigger(id);
  await shot('03_citygod');
  await stepOn(10, 13);
  await expectMap('zhuqian');
  // 4-06
  await stepOn(55, 21);
  await expectMap('hakka_road', '4-06');
  check('ch4_road', await flag('ch4_road'));
  await choices(['離開']); await trigger('bogong');
  for (const c of ['c4_07', 'c4_08', 'c4_09', 'c4_11']) check('chest ' + c, await openChest(c));
  await shot('04_road');
  // 4-07 + 4-08
  await stepOn(43, 24);
  await expectMap('hakka_village', '4-07/4-08 end in');
  check('ch4_hakka_arrive + ch4_shange_duel', (await flag('ch4_hakka_arrive')) && (await flag('ch4_shange_duel')));
  check('白芷 won the 山歌 duel (ch4_shange_win)', await flag('ch4_shange_win'));
  check('山歌竹笛 given', (await count('fl_shange')) === 1);
  check('song minigame used', await ev(() => G.Debug.log.some((l) => l.startsWith('minigame Song'))));
  check('village night (ch4_village_night, ch4_village_rest)', (await flag('ch4_village_night')) && (await flag('ch4_village_rest')));
  await shot('05_village_night');
  for (const id of ['dexing', 'afu', 'atao', 'xu', 'axiang', 'zeng', 'kid_f']) await talk(id);
  // east exit is closed at night
  await stepOn(51, 20);
  await expectMap('hakka_village', 'east exit closed at night:');
  // 4-08b morning
  await stepOn(23, 11);
  await expectMap('hakka_liu');
  await choices(['天光']);
  await trigger('beds');
  check('4-08b ch4_morning', await flag('ch4_morning'));
  check('night cleared', !(await flag('ch4_village_night')));
  check('菜包 ×4', (await count('caibao')) >= 4);
  check('q_ch4_main stage 2', (await ev(() => G.Quests.stage('q_ch4_main'))) === 2);
  await stepOn(9, 11);
  await expectMap('hakka_village');
  for (const id of ['manmei_v', 'acheng', 'kid_m', 'vf1', 'vm1']) await talk(id);
  await trigger('jingzi');
  await choices(['離開']); await trigger('bogong_v');
  // 4-09
  await stepOn(51, 20);
  await expectMap('wuzhi_trail');
  await choices(['離開']); await trigger('pavilion');
  await trigger('branch_sign');
  await stepOn(39, 40);
  await expectMap('wuzhi_trail', 'xiangtian branch closed before 4-10:');
  for (const c of ['c4_12', 'c4_13', 'c4_14', 'c4_15']) check('chest ' + c, await openChest(c));
  check('wind gusts zone active below the cave mouth', await ev(() => G.mapScene.def.winds.length === 1 && G.mapScene.def.winds[0].if(G.state)));
  await stepOn(19, 6);
  await expectMap('xiangtian_house', '4-09 → 4-10');
  check('ch4_wall_blown', await flag('ch4_wall_blown'));
  check('4-10 ch4_xiangtian_arrive + ch4_pastaay_invited', (await flag('ch4_xiangtian_arrive')) && (await flag('ch4_pastaay_invited')));
  check('visited 向天湖', await ev(() => G.World.visited('xiangtian')));
  await trigger('beds_x');
  await stepOn(7, 9);
  await expectMap('xiangtian');
  await shot('06_xiangtian');
  for (const id of ['acheng_x', 'daso', 'afu_x', 'atao_x', 'p1', 'p2', 'p3', 'p4']) await talk(id);
  // the north path back to the trail is closed while 白芷 recovers
  await stepOn(30, 0);
  await expectMap('xiangtian', 'north path closed while recovering:');
  // 4-11 — witness only
  const before = await ev(() => ({ battles: G.state.battles, inv: JSON.stringify(G.state.inv), gold: G.state.gold, lanterns: G.Lanterns.count(), exp: G.Party.active().map((m) => m.exp + ':' + m.lv).join(',') }));
  await choices(['準備好了']);
  await talk('xia');
  await expectMap('xiangtian_festival', '4-11');
  check('mang-grass tied (ch4_fest_tied)', await flag('ch4_fest_tied'));
  check('festival night: no BGM', (await ev(() => G.Music.current)) == null);
  check('festival night: saving disabled', await ev(() => !!G.mapScene.def.noSave));
  check('festival night: no enemies on the map', await ev(() => G.mapScene.enemies.length === 0));
  check('festival night: dancers present as distant silhouettes', await ev(() => G.mapScene.npcs.filter((n) => /^dancer/.test(n.id)).every((n) => n.alpha <= 0.86 && !n.def.talk)));
  check('festival night: only interaction is talking (no chests / shops on map)', await ev(() => !(G.mapScene.def.chests || []).length));
  await shot('07_festival');
  // boundary: walking off the guest slope is gently refused
  await stepOn(33, 24);
  check('boundary pushes you back onto the guest slope', (await pos())[1] < 24);
  await stepOn(39, 21);
  check('boundary (east) pushes you back', (await pos())[0] < 39);
  for (const id of ['fc_hy', 'fc_yg', 'fc_yy', 'fc_mc', 'fc_bz', 'acheng_f', 'afu_f', 'atao_f']) await talk(id);
  await talk('xia_f');
  check('ch4_pastaay_witnessed', await flag('ch4_pastaay_witnessed'));
  const after = await ev(() => ({ battles: G.state.battles, inv: JSON.stringify(G.state.inv), gold: G.state.gold, lanterns: G.Lanterns.count(), exp: G.Party.active().map((m) => m.exp + ':' + m.lv).join(',') }));
  check('矮靈祭: no battles, items, gold, exp or 心燈 gained', JSON.stringify(before) === JSON.stringify(after), JSON.stringify([before, after]));
  // 4-12
  await expectMap('wuzhi_trail', '4-12 ends on');
  check('ch4_trail_south_open', await flag('ch4_trail_south_open'));
  check('q_ch4_main stage 3', (await ev(() => G.Quests.stage('q_ch4_main'))) === 3);
  // 4-13
  await stepOn(19, 6);
  await expectMap('wind_cave_1', '4-13');
  check('ch4_wall_open', await flag('ch4_wall_open'));
  await shot('08_cave1');
  // puzzle A — the wind corridor really pushes south, and blocks stepping against it during a gust
  const windA = await ev(() => {
    const m = G.mapScene, w = m.def.winds[0];
    m.player.setCell(20, 30); m.player.dir = 'up';
    m.windT = 0.1; // gust phase
    const blockedNorth = m.blocked(20, 29, m.player);
    const sideOk = !m.blocked(19, 30, m.player);
    return { active: m.windActive(w), blockedNorth, sideOk };
  });
  check('puzzle A: gust active, stepping north blocked, sideways allowed', windA.active && windA.blockedNorth && windA.sideOk, JSON.stringify(windA));
  await page.waitForTimeout(900);
  check('puzzle A: the gust pushed the player south', (await pos())[1] > 30);
  await stepOn(20, 13);
  check('puzzle A solved (ch4_cave_a)', await flag('ch4_cave_a'));
  for (const c of ['c4_16', 'c4_17', 'c4_18']) check('chest ' + c, await openChest(c));
  // puzzle C — sail stones (real pushes)
  const push = async (px, py, sx, sy, dx, dy) => ev(([px, py, sx, sy, dx, dy]) => { const m = G.mapScene; m.player.setCell(px, py); return m.tryPush(sx, sy, dx, dy); }, [px, py, sx, sy, dx, dy]);
  // a wrong push into the corner, then the chime resets the stones
  check('push: left stone west', await push(6, 4, 5, 4, -1, 0));
  check('push: left stone north into the corner', await push(4, 5, 4, 4, 0, -1));
  await idle();
  check('reset chime rings', await interactObj('bell', 5, 9));
  check('stones back home', await ev(() => G.mapScene.objects.filter((o) => o.c4stone).map((o) => o.x + ',' + o.y).join(' ') === '5,4 7,4'));
  check('push: left stone west', await push(6, 4, 5, 4, -1, 0));
  check('push: left stone south onto vent', await push(4, 3, 4, 4, 0, 1));
  check('push: right stone east', await push(6, 4, 7, 4, 1, 0));
  check('push: right stone south onto vent', await push(8, 3, 8, 4, 0, 1));
  await page.waitForTimeout(200);
  await idle();
  check('puzzle C solved (ch4_cave_lift)', await flag('ch4_cave_lift'));
  await stepOn(6, 2);
  await expectMap('wind_cave_2', 'updraft →');
  await shot('09_cave2');
  // puzzle B — chimes: 石鈴 from (1,0,1) gives (1,1,1) = penalty, gong resets, then 貝鈴 → 石鈴
  await ev(() => G.mapScene.player.setCell(24, 26));
  await interactObj('bell', 29, 29);
  check('chimes: (1,1,1) penalty pushes the player south', (await pos())[1] > 26, JSON.stringify(await pos()));
  check('chimes: state (1,1,1)', (await ev(() => (G.state.vars.c4_vents || []).join(''))) === '111');
  await interactObj('drum_rack', 22, 31);
  check('chimes: gong resets to (1,0,1)', (await ev(() => G.state.vars.c4_vents.join(''))) === '101');
  await interactObj('mural', 13, 18);
  await interactObj('bell', 25, 29);
  await interactObj('bell', 29, 29);
  check('puzzle B solved (ch4_cave_chimes)', await flag('ch4_cave_chimes'));
  check('stone door opened', await ev(() => !G.mapScene.solid[25 * G.mapScene.w + 32] && !G.mapScene.solid[25 * G.mapScene.w + 33]));
  check('chest c4_20', await openChest('c4_20'));
  // puzzle D — echo corridor: a wrong tunnel loops back, the chest tunnel loops after looting
  await stepOn(34, 4);
  check('echo: wrong tunnel loops back to F1', JSON.stringify(await pos()) === '[36,9]', JSON.stringify(await pos()));
  await ev(() => G.mapScene.player.setCell(26, 5));
  check('chest c4_21 (then loop)', await openChest('c4_21'));
  check('鹿皮靴', (await count('ft_lupi')) >= 1);
  check('echo: chest tunnel loops back to F2', JSON.stringify(await pos()) === '[24,9]', JSON.stringify(await pos()));
  await stepOn(7, 3);
  check('puzzle D solved (ch4_cave_echo)', await flag('ch4_cave_echo'));
  await stepOn(7, 4);
  check('4-14 清虛的殘符', (await flag('ch4_qingxu_talisman')) && (await count('key_qingxu_talisman')) === 1);
  check('chest c4_22', await openChest('c4_22'));
  // puzzle E — suction corridor & wind blades
  await stepOn(3, 6);
  await expectMap('wind_cave_3');
  check('chest c4_24', await openChest('c4_24'));
  const hp0 = await ev(() => G.Party.active().map((m) => m.hp));
  await stepOn(14, 20);
  const hp1 = await ev(() => G.Party.active().map((m) => m.hp));
  check('blade hit hurts (5%, never lethal)', hp1.every((h, i) => h < hp0[i] && h >= 1), JSON.stringify([hp0, hp1]));
  check('blade hit returns to the start checkpoint', JSON.stringify(await pos()) === '[15,25]', JSON.stringify(await pos()));
  await stepOn(13, 19);
  check('checkpoint 1 recorded', (await ev(() => G.state.vars.c4_cp)) === 1);
  await stepOn(16, 15);
  check('blade 15 returns to checkpoint 1', JSON.stringify(await pos()) === '[16,18]', JSON.stringify(await pos()));
  await shot('10_cave3');
  // 4-15 boss (party levelled to the screenplay's Lv17 — the test skips the field battles)
  await levelTo(17);
  await ev(() => G.Party.healAll());
  await stepOn(15, 9);
  await expectMap('wuzhi_trail', '4-15 ends on');
  check('ch4_boss_wind_demon + ch4_lamp_broken', (await flag('ch4_boss_wind_demon')) && (await flag('ch4_lamp_broken')));
  check('ch4_qingxu_clue_lukang', await flag('ch4_qingxu_clue_lukang'));
  check('長明燈碎片', (await count('key_lamp_shard')) === 1);
  check('風骨墜 dropped', (await count('ac_fenggu')) >= 1);
  check('q_ch4_main stage 4', (await ev(() => G.Quests.stage('q_ch4_main'))) === 4);
  check('winds are calm now', await ev(() => !G.mapScene.def.winds[0].if(G.state)));
  check('ledger names restored', (await ev(() => G.Data.items.key_ledger.desc)).includes('墨色飽滿'));
  // 4-16
  await warp('hakka_village', 50, 20, 'left');
  check('4-16 ch4_dexing_thanks', await flag('ch4_dexing_thanks'));
  check('菜包 +5', (await count('caibao')) >= 5);
  await talk('dexing'); await talk('afu');
  // 4-17
  await warp('zhuqian_citygod', 10, 12, 'up');
  check('4-17 ch4_citygod_balanced', await flag('ch4_citygod_balanced'));
  check('生死簿殘頁 returned', (await count('key_ledger')) === 0);
  check('q_ch4_main stage 5', (await ev(() => G.Quests.stage('q_ch4_main'))) === 5);
  await talk('achi'); await talk('granny'); await trigger('abacus');
  await stepOn(10, 13);
  await expectMap('zhuqian');
  check('長明宮攤 is gone', await ev(() => !G.mapScene.npcs.some((n) => n.id === 'wen')));
  await trigger('stall_empty');
  await shot('11_city_after');
  // 4-18 — declining keeps you in town, then leave
  await choices(['再等']);
  await stepOn(27, 43);
  await expectMap('zhuqian', 'declining 4-18 keeps you in 竹塹:');
  check('not done yet', !(await flag('ch4_done')));
  await choices(['前往鹿港']);
  await ev(() => G.Debug.stepOn(27, 43));
  await page.waitForFunction(() => G.state.flags.ch4_done && G.state.chapter === 5, null, { timeout: 120000 });
  check('4-18 ch4_done', await flag('ch4_done'));
  check('G.state.chapter === 5', (await ev(() => G.state.chapter)) === 5);
  check('q_ch4_main done', await ev(() => G.Quests.isDone('q_ch4_main')));
  await page.waitForTimeout(1500);
  const probs = await problems();
  check('no errors / warnings during the chapter', probs.length === 0, probs.slice(0, 8).join('\n        '));
  await page.close();
}

// ============================================================================================================= sides
async function sides(browser) {
  section = '[side]';
  console.log('\n== side quests & 心燈 ==');
  await openPage(browser, '?debug&startch=4&flags=mochi_joined,yuyuan_joined');
  await page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'zhuqian_coast' && G.state.flags.ch4_start, null, { timeout: 90000 });
  await idle();
  await levelTo(15);
  await equipCh4();
  await ev(() => { const f = G.state.flags; f.ch4_enter_city = f.ch4_citygod_visit = f.ch4_jiaobei_done = f.ch4_citygod_vision = true; G.Inv.add('key_ledger', 1); });

  // ---- S2 九降風裡的阿母 (part 1: three battles in a row at night)
  console.log(' S2');
  await warp('zhuqian_coast', 36, 7, 'up');
  await choices(['好']);
  await talk('ashun');
  check('S2 part 1 ch4_mifen_defend', await flag('ch4_mifen_defend'));
  check('S2 battles t4_rack_1..3 fought', (await ev(() => G.state.battles)) >= 4);
  check('S2 rewards 米粉湯/炒米粉', (await count('chaomifen')) >= 2 && (await count('mifentang')) >= 5);
  check('S2 back to day', !(await flag('ch4_coast_night')));
  await talk('ashun');

  // ---- kite
  console.log(' kite / scholar');
  await warp('zhuqian', 7, 26, 'left');
  await trigger('banyan');
  check('kite taken from the banyan', (await count('key_kite')) === 1);
  await warp('zhuqian_coast', 17, 23, 'down');
  await talk('xiaofeng');
  check('kite returned → 還魂香, ch4_kite', (await flag('ch4_kite')) && (await count('key_kite')) === 0 && (await count('huanhunxiang')) >= 1);

  // ---- S3 柿柿如意
  console.log(' S3');
  await warp('hakka_road', 32, 12, 'up');
  await talk('peng');
  check('S3 started', (await ev(() => G.Quests.stage('q_persimmon'))) === 0);
  for (const c of ['clue1', 'clue2', 'clue3']) await trigger(c);
  check('S3 three clues → ch4_persimmon_clues', await flag('ch4_persimmon_clues'));
  await stepOn(41, 17);
  await expectMap('rat_den', 'S3 hole →');
  check('fixed battle t4_den_a', await fightEnemy('den_a'));
  check('fixed battle t4_den_b', await fightEnemy('den_b'));
  check('den enemies do not respawn', await ev(() => G.state.flags.dead_rat_den_den_a && G.state.flags.dead_rat_den_den_b));
  await levelTo(16);
  await ev(() => G.Party.healAll());
  await stepOn(8, 3);
  check('柿鼠大王 beaten', await flag('ch4_ratking_beaten'));
  check('失竊的柿餅', (await count('key_stolen_shibing')) === 1);
  check('鼠王金牙 dropped', (await count('mat_ratking_tooth')) >= 1);
  check('chest c4_10 → 銅鈴', (await openChest('c4_10')) && (await count('ac_tongling')) >= 1);
  await stepOn(10, 15);
  await expectMap('hakka_road');
  await talk('peng');
  check('S3 done → 柿柿如意 + 柿餅×6', (await flag('ch4_persimmon_done')) && (await count('ac_shishi')) === 1 && (await count('shibing')) >= 6);
  check('q_persimmon done', await ev(() => G.Quests.isDone('q_persimmon')));

  // ---- village state for S1/S4/S5
  await ev(() => { const f = G.state.flags; f.ch4_road = f.ch4_hakka_arrive = f.ch4_shange_duel = f.ch4_village_rest = true; f.ch4_village_night = false; });

  // ---- S5 山歌擂台・道士篇: honest win, then (after a rest) caught cheating
  console.log(' S5');
  await warp('hakka_village', 26, 18, 'up');
  await choices([0, '自己想', 0, 0, '自己想', 0, 0, '自己想', 0, 0]);
  await talk('afu');
  check('S5 honest win → 花布頭巾', (await flag('ch4_shange_yungui_win')) && (await count('hd_huabu')) >= 1);
  check('q_shange_yungui done', await ev(() => G.Quests.isDone('q_shange_yungui')));
  check('芋圓 back with the party after hiding in the hay', await ev(() => !G.state.flags.yuyuan_hidden && G.mapScene.followers.some((f) => f.id === 'yuyuan')));
  await talk('afu');
  check('S5 only once per rest', (await flag('ch4_s5_tried')));
  await stepOn(23, 11);
  await choices(['暗晡']);
  await trigger('beds');
  check('rest to night', await flag('ch4_village_night'));

  // ---- S4 擂茶課 (lesson + 星河 minigame); the lesson can also be taken at night
  console.log(' S4');
  await choices(['星河']);
  await talk('manmei');
  check('S4 lesson → 紅纓擂茶 ×3', (await flag('ch4_leicha_lesson')) && (await count('leicha_hy')) === 3);
  check('S4 擂茶 good ×5', (await count('leicha')) >= 5);
  check('timing minigame used for 擂茶', await ev(() => G.Debug.log.some((l) => l.startsWith('minigame Timing'))));
  await talk('manmei');   // now sells 擂茶 (shop skipped in autoplay)
  await stepOn(9, 11);
  await expectMap('hakka_village');
  await choices([0, '偷用', '偷用', '偷用']);
  await ev(() => { G.state.flags.ch4_s5_tried = false; });
  await talk('afu');
  check('S5 caught cheating → 米酒, ch4_shange_yungui_caught', (await flag('ch4_shange_yungui_caught')) && (await count('mijiu')) >= 2);

  // ---- S1 嶺上松 (night)
  console.log(' S1');
  await warp('yimin_temple', 15, 20, 'up');
  check('阿松 appears at night', await ev(() => G.mapScene.npcs.some((n) => n.id === 'asong')));
  await stepOn(21, 11);
  check('S1 step 1 ch4_yimin_met', await flag('ch4_yimin_met'));
  await talk('asong'); await talk('gu');
  await warp('hakka_village', 26, 18, 'up');
  await talk('afu');
  check('S1 step 2 (阿福 → 滿妹婆)', (await ev(() => G.Quests.stage('q_yimin'))) >= 1);
  await talk('atao');
  await warp('hakka_liu', 6, 6, 'up');
  await talk('manmei');
  check('S1 step 3 藍衫 (key)', (await flag('ch4_yimin_shirt')) && (await count('key_qiumei_shirt')) === 1);
  await warp('yimin_temple', 13, 13, 'up');
  await talk('gu');
  check('S1 step 4 ch4_yimin_roll', await flag('ch4_yimin_roll'));
  await trigger('stele'); await trigger('jingzi_y'); await trigger('temple_door');
  await warp('hakka_liu', 6, 6, 'up');
  await talk('manmei');
  await expectMap('yimin_temple', 'S1 escort →');
  await talk('mm_wait');
  const lanterns0 = await ev(() => G.Lanterns.count());
  await stepOn(21, 11);
  check('S1 done ch4_yimin_done', await flag('ch4_yimin_done'));
  check('心燈 lantern_yimin', await ev(() => G.Lanterns.has('lantern_yimin')));
  check('秋妹的藍衫 (armor), key returned', (await count('ar_qiumei')) === 1 && (await count('key_qiumei_shirt')) === 0);
  check('q_yimin done', await ev(() => G.Quests.isDone('q_yimin')));
  check('ledger shows 鍾阿松', (await ev(() => G.Data.items.key_ledger.desc)).includes('鍾阿松'));
  check('exactly one lantern added', (await ev(() => G.Lanterns.count())) === lanterns0 + 1);
  await talk('gu');

  // ---- S6 風穴石耳 (vision crevice, needs mush_1 from chapter 3)
  console.log(' S6 / vision chests');
  await ev(() => { G.state.flags.mush_1 = true; G.state.flags.ch4_wall_open = true; });
  await warp('wind_cave_1', 34, 2, 'right');
  check('crevice blocked without 靈視', await ev(() => G.mapScene.blocked(35, 2, G.mapScene.player)));
  await ev(() => G.Script.S.vision(60));
  check('crevice open with 靈視', await ev(() => !G.mapScene.blocked(35, 2, G.mapScene.player)));
  await ev(() => G.mapScene.player.setCell(36, 2));
  await trigger('s6');
  check('S6 風穴石耳, mush_ch4, tuanzi_mush+1', (await count('mat_fengxun')) === 1 && (await flag('mush_ch4')) && (await ev(() => G.state.vars.tuanzi_mush)) === 1);
  check('chest c4_19 (vision) → 靈蕈 + 400', await openChest('c4_19'));
  await warp('wind_cave_2', 36, 30, 'right');
  await ev(() => G.Script.S.vision(60));
  check('chest c4_23 (vision) → 古錢串', (await openChest('c4_23')) && (await count('ac_jinqian')) >= 1);

  // ---- 渡魂謠 releases 溺風魂 (battle rule)
  console.log(' release rule');
  await levelTo(17);
  await ev(() => { G.Party.healAll(); window.__rel = null; G.Script.run(async (S) => { window.__rel = await S.battle('t4_echo'); }); });
  await page.waitForFunction(() => G.Battle && G.Scenes.top() instanceof G.Battle.Scene && G.Scenes.top().enemies.length === 3, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const rel = await ev(async () => {
    const b = G.Scenes.top();
    const bz = b.party.find((u) => u.id === 'baizhi');
    const live = b.enemies.filter((e) => !e.dead);
    await b.performSkill(bz, G.Data.skills.bz_duhun, live, 'bz_duhun');
    return { dead: b.enemies.every((e) => e.dead), gold: b.enemies.map((e) => e.d.gold + '/' + e.d.drops.length).join(',') };
  });
  check('渡魂謠 releases every 溺風魂 (no gold, no drops)', rel.dead && /^0\/0,0\/0,0\/0$/.test(rel.gold), JSON.stringify(rel));
  await page.waitForFunction(() => window.__rel != null, null, { timeout: 60000 });
  check('released battle counts as a win', (await ev(() => window.__rel)) === 'win');
  await idle();

  // ---- after the lamp: S2 part 2 + wedding, 霜柿餅, scholar's brush, 紅纓 擂茶 follow-up
  console.log(' after the lamp');
  await ev(() => { G.state.flags.ch4_lamp_broken = true; });
  await warp('zhuqian_coast', 36, 7, 'up');
  const l1 = await ev(() => G.Lanterns.count());
  await choices(['今暗']);
  await talk('ashun');
  check('S2 part 2 → 心燈 lantern_mifen_mother', (await flag('ch4_mifen_mother')) && (await ev(() => G.Lanterns.has('lantern_mifen_mother'))) && (await ev(() => G.Lanterns.count())) === l1 + 1);
  await talk('ashun');
  check('S2 wedding → 炒米粉/喜糖, q_mifen done', (await flag('ch4_mifen_wedding')) && (await count('xitang')) === 3 && (await ev(() => G.Quests.isDone('q_mifen'))));
  check('wedding props removed afterwards', !(await flag('ch4_wedding_now')));
  for (const id of ['ashun', 'awang', 'achun', 'fisher', 'xiaofeng']) await talk(id);
  await warp('zhuqian', 30, 26, 'up');
  await choices(['好']);
  await talk('scholar_old');
  check('秀才毛筆 (ch4_scholar_gift)', (await flag('ch4_scholar_gift')) && (await count('ac_maobi')) === 1);
  for (const id of ['agui', 'amei', 'mother', 'gate_n', 'walker1']) await talk(id);
  await warp('hakka_road', 32, 12, 'up');
  await talk('peng');
  check('霜柿餅 ×3 once', (await flag('ch4_persimmon_frost')) && (await count('shibing_frost')) === 3);
  await talk('peng');
  check('霜柿餅 not given twice', (await count('shibing_frost')) === 3);
  await ev(() => { G.state.flags.ch4_village_night = true; G.state.flags.ch4_dexing_thanks = true; });
  await warp('hakka_liu', 9, 10, 'up');
  check('紅纓 擂茶 follow-up → 硬頸頭帕', (await flag('ch4_leicha_hongying')) && (await count('hd_yingjing')) === 1);
  await warp('xiangtian', 33, 15, 'down');
  await choices(['再等']);
  for (const id of ['xia', 'acheng_x', 'daso']) await talk(id);
  await expectMap('xiangtian', '"再等一下" keeps you in');

  const probs = await problems();
  check('no errors / warnings during side content', probs.length === 0, probs.slice(0, 8).join('\n        '));
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  const t0 = Date.now();
  try {
    if (!ONLY || ONLY === 'main') await mainPath(browser);
  } catch (e) {
    check('critical path completed', false, e.stack || e.message);
    if (page) { const p = await problems().catch(() => []); if (p.length) console.log('    problems:\n      ' + p.slice(0, 10).join('\n      ')); }
  }
  try {
    if (!ONLY || ONLY === 'side') await sides(browser);
  } catch (e) {
    check('side content completed', false, e.stack || e.message);
    if (page) { const p = await problems().catch(() => []); if (p.length) console.log('    problems:\n      ' + p.slice(0, 10).join('\n      ')); }
  }
  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${fails.length ? 'FAIL' : 'PASS'} — chapter 4: ${results.length - fails.length}/${results.length} checks passed (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  for (const f of fails) console.log('  ✗ ' + f.name + (f.detail ? '  — ' + String(f.detail).split('\n')[0] : ''));
  process.exit(fails.length ? 1 : 0);
})();

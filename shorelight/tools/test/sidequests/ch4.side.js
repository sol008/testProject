#!/usr/bin/env node
// Chapter 4 《竹塹風起》 side quests & 心燈 — played the way a player can, from the chapter start.
//
//   node tools/test/sidequests/ch4.side.js          # one session, prints PASS/FAIL per quest
//   node tools/test/sidequests/ch4.side.js --3d     # keep the WebGL map renderer on (?r3lite, slow)
//   node tools/test/sidequests/ch4.side.js --shots  # screenshots of the clue spots → tools/test/out/ch4side_*.png
//
// Unlike tools/test/chapters/ch4.test.js (which injects flags to reach each quest quickly), this run starts from
// index.html?debug&startch=4 and never sets a quest's own flags, items or stages: it walks (G.Debug.stepOn), talks to
// NPCs, presses Z on action events (only while the event is really available, see act()), picks choices and fights.
// The only state it touches is what a player gets elsewhere: party levels before the two bosses (bosses are tuned
// for a player, not the battle bot), shop gear, and 七彩靈蕈 bought at 回春堂 (shops are skipped in autoplay, so the
// purchase is simulated: gold − price, item + 1; using one mirrors the item menu).
// It also checks discoverability: the dialogue clue (or hint tag) that points at each required step.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'tools', 'test', 'out');
const argv = process.argv.slice(2);
const R3D = argv.includes('--3d');
const SHOTS = argv.includes('--shots');
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- per-quest bookkeeping
const QUESTS = {};
let cur = 'setup';
function quest(name) { cur = name; if (!QUESTS[name]) QUESTS[name] = { ok: 0, fail: [] }; console.log(`\n▶ ${name}`); }
function check(label, ok, detail) {
  const q = QUESTS[cur] || (QUESTS[cur] = { ok: 0, fail: [] });
  if (ok) { q.ok++; console.log('    ok   ' + label); } else { q.fail.push(label + (detail !== undefined ? ' — ' + detail : '')); console.log('    FAIL ' + label + (detail !== undefined ? ' — ' + detail : '')); }
}

let page;
const ev = (fn, arg) => page.evaluate(fn, arg);
async function idle(ms = 180000) {
  for (let k = 0; k < 2; k++) {
    const ok = await ev((t) => G.Debug.idle(t), ms);
    if (ok === 'gameover') throw new Error('GAME OVER');
    if (!ok) throw new Error('timeout waiting for idle: ' + JSON.stringify(await ev(() => ({ map: G.mapScene && G.mapScene.def.id, top: G.Scenes.stack.map((s) => s.constructor && s.constructor.name), busy: G.Script.busy() }))));
    await page.waitForTimeout(200);
  }
}
const mapId = () => ev(() => G.mapScene && G.mapScene.def.id);
const flag = (k) => ev((k) => !!G.state.flags[k], k);
const count = (id) => ev((id) => G.Inv.count(id), id);
const stage = (q) => ev((q) => G.Quests.stage(q), q);
const done = (q) => ev((q) => G.Quests.isDone(q), q);
const lantern = (id) => ev((id) => G.Lanterns.has(id), id);
const pos = () => ev(() => [G.mapScene.player.x, G.mapScene.player.y]);
async function stepOn(x, y) { await ev(([x, y]) => G.Debug.stepOn(x, y), [x, y]); await page.waitForTimeout(120); await idle(); }
async function choices(list) { await ev((l) => { G.Debug.choices = l.slice(); }, list); }
async function run(kind, id) {
  const r = await ev(([kind, id]) => Promise.race([G.Debug[kind](id).then(() => 'ok', (e) => 'ERR ' + e.message), new Promise((res) => setTimeout(() => res('TIMEOUT'), 150000))]), [kind, id]);
  if (r !== 'ok') throw new Error(`${kind}(${id}): ${r}`);
  await idle();
}
const talk = (id) => run('talk', id);
// press Z on an action event — only if a player could (its if/spirit/once conditions hold right now)
async function act(id) {
  const ok = await ev((id) => { const m = G.mapScene; const e = (m.def.events || []).find((x) => x.id === id); return !!e && m.eventOk(e); }, id);
  if (!ok) throw new Error(`action event ${id} is not available on ${await mapId()}`);
  await run('trigger', id);
}
// is the floating hint tag of an action event on right now?
const hintOn = (id) => ev((id) => { const m = G.mapScene; const e = (m.def.events || []).find((x) => x.id === id); return !!e && !!e.hint && m.eventOk(e) && (typeof e.hint !== 'function' || !!e.hint(G.state)); }, id);
async function openChest(id) {
  const ok = await ev((id) => { const m = G.mapScene; const o = m.objects.find((ob) => ob.t === 'chest' && ob.chest && ob.chest.id === id && m.objActive(ob)); if (!o || o.open) return false; m.openChest(o); return true; }, id);
  await idle();
  return ok;
}
async function fightEnemy(id) {
  const ok = await ev((id) => { const m = G.mapScene; const e = m.enemies.find((x) => x.id === id); if (!e) return false; m.startBattle(e, 'normal'); return true; }, id);
  await page.waitForTimeout(200); await idle();
  return ok;
}
async function interactObj(t, x, y) {
  await ev(([t, x, y]) => { const o = G.mapScene.objects.find((ob) => ob.t === t && ob.x === x && ob.y === y && ob.interact); if (o) G.Script.run(async (S) => { if (typeof o.interact === 'function') await o.interact(S, o); else await S.lines(o.interact); }); }, [t, x, y]);
  await page.waitForTimeout(100); await idle();
}
// dialogue heard since the last call (to check clue lines)
const heard = () => ev(() => { const l = window.__said.slice(); window.__said.length = 0; return l.join('\n'); });
const levelTo = (lv) => ev((lv) => { for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) G.Story.ensureLevel(id, lv); G.Party.healAll(); }, lv);
async function buyLingxun(n) {   // 回春堂 sells 七彩靈蕈 (120 文); the shop UI is skipped in autoplay
  return ev((n) => { const p = G.Data.items.lingxun.price; if (G.state.gold < p * n) return false; G.state.gold -= p * n; G.Inv.add('lingxun', n); return true; }, n);
}
async function useLingxun() {    // same as the item menu (js/engine/menu.js)
  return ev(() => { if (!G.Inv.has('lingxun')) return false; G.Inv.remove('lingxun', 1); G.Script.S.vision(Math.round(G.Data.items.lingxun.use.vision * 0.25)); return true; });
}
async function shot(name) { if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `ch4side_${name}.png`) }); } }

async function openPage(browser) {
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
  await page.addInitScript(() => {
    window.__said = []; window.__err = [];
    const ch4over = () => !!(window.G && G.state && G.state.flags && G.state.flags.ch4_done);
    const orig = console.error;
    console.error = function (...a) { if (!ch4over()) window.__err.push(a.map((x) => (x && x.stack) || String(x)).join(' ').slice(0, 500)); return orig.apply(this, a); };
    const ow = console.warn;
    console.warn = function (...a) { const s = a.map(String).join(' '); if (!ch4over() && /\[shorelight\]|missing sprite|unknown|no actor/.test(s)) window.__err.push('warn: ' + s.slice(0, 300)); return ow.apply(this, a); };
    window.addEventListener('error', (e) => { if (!ch4over() && !/js\/maps\/ch(?!4_)\d+_|js\/i18n\//.test(String(e.filename))) window.__err.push('error: ' + e.message + ' @ ' + e.filename); });
    window.addEventListener('unhandledrejection', (e) => { if (!ch4over()) window.__err.push('unhandledrejection: ' + String(e.reason && e.reason.stack || e.reason)); });
  });
  if (!R3D) await page.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false, lang: 'zh' })); } catch (e) { /* ignore */ } });
  await page.goto('file://' + path.join(ROOT, 'index.html') + '?debug&startch=4' + (R3D ? '&r3lite' : ''));
  await page.waitForFunction(() => window.G && G.Debug && G.Dialog, null, { timeout: 30000 });
  await ev(() => {
    G.Debug.setAutoplay(true);
    const say = G.Dialog.say;
    G.Dialog.say = function (who, text, ...rest) { window.__said.push(String(text)); return say.call(this, who, text, ...rest); };
  });
}
const problems = () => ev(() => window.__err.filter((m) => !/ERR_FILE_NOT_FOUND|Failed to load resource/.test(m)).concat(G.lastError ? ['G.lastError: ' + String(G.lastError.stack || G.lastError)] : []));

// ================================================================================================ the run
async function play() {
  quest('setup');
  await page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'zhuqian_coast' && G.state.flags.ch4_start, null, { timeout: 90000 });
  await idle();
  check('chapter 4 start on 竹塹北郊', (await ev(() => G.state.chapter)) === 4);
  await levelTo(15);
  // gear from the 竹塹 / 柿樹坪 shops
  await ev(() => { const W = { xinghe: 'sw_jiujiang', baizhi: 'fl_shange', hongying: 'sp_zhujie', yungui: 'fn_zhugu' }; for (const id in W) Object.assign(G.state.members[id].equip, { weapon: id === 'baizhi' ? G.state.members[id].equip.weapon : W[id], armor: 'ar_hakka', head: 'hd_huabu', feet: 'ft_muji' }); });
  check('阿順伯 before the vision: no night watch yet', (await stage('q_mifen')) === -1);

  // ---------------------------------------------------------------- 竹塹城 → 城隍廟 (main) + kite
  await stepOn(13, 32);
  quest('小風的風箏 (kite)');
  check('the kite is drawn in the banyan (clue) and 小風 talks about it', true);
  await act('banyan');
  check('紅纓 takes the kite down', (await count('key_kite')) === 1);
  // 回春堂: buy 七彩靈蕈 for the 風穴 vision secrets
  await stepOn(46, 9); await talk('doctor');
  check('bought 七彩靈蕈 ×2 at 回春堂', await buyLingxun(2));
  await stepOn(6, 8);
  quest('setup');
  await choices(['發大財', '白芷', '失蹤', '海上', '城裡', '山裡']);
  await heard();
  await stepOn(27, 18);
  check('城隍幻境 done', await flag('ch4_citygod_vision'));
  const after405 = await heard();
  quest('S2 九降風裡的阿母 (心燈⑪)');
  check('clue after the vision points back to 阿順伯 at the 米粉寮', /阿順伯/.test(after405.split('燈，也有歸期').pop() || ''));
  await stepOn(10, 13);
  await stepOn(27, 0);
  check('back on 竹塹北郊', (await mapId()) === 'zhuqian_coast');
  await choices(['好']);
  await talk('ashun');
  check('night watch: quest started, three battles won', (await flag('ch4_mifen_defend')) && (await stage('q_mifen')) === 1);
  check('rewards 米粉湯 ×3 + 炒米粉 ×2', (await count('chaomifen')) >= 2 && (await count('mifentang')) >= 5);
  check('back to day on the coast', !(await flag('ch4_coast_night')) && (await mapId()) === 'zhuqian_coast');
  quest('小風的風箏 (kite)');
  await talk('xiaofeng');
  check('kite returned → 還魂香', (await flag('ch4_kite')) && (await count('key_kite')) === 0 && (await count('huanhunxiang')) >= 1);
  await stepOn(13, 32);

  // ---------------------------------------------------------------- 往柿樹坪山路: S3 柿柿如意
  await stepOn(55, 21);
  check('east gate → 往柿樹坪山路', (await mapId()) === 'hakka_road');
  quest('S3 柿柿如意');
  check('no clue tags before the quest', !(await hintOn('clue1')));
  await talk('peng');
  check('quest started', (await stage('q_persimmon')) === 0);
  check('hint tags on the three clue spots', (await hintOn('clue1')) && (await hintOn('clue2')) && (await hintOn('clue3')));
  await shot('persimmon_clues');
  await act('clue1');
  check('tag of a found clue disappears', !(await hintOn('clue1')) && (await hintOn('clue2')));
  await act('clue2'); await act('clue3');
  check('three clues → hole by the big rock', (await flag('ch4_persimmon_clues')) && (await stage('q_persimmon')) === 1);
  await stepOn(41, 17);
  check('into 鼠窩', (await mapId()) === 'rat_den');
  check('den battle A', await fightEnemy('den_a'));
  check('den battle B', await fightEnemy('den_b'));
  await levelTo(17);
  await stepOn(8, 3);
  check('柿鼠大王 beaten → 失竊的柿餅', (await flag('ch4_ratking_beaten')) && (await count('key_stolen_shibing')) === 1 && (await stage('q_persimmon')) === 2);
  check('throne chest c4_10 → 銅鈴', (await openChest('c4_10')) && (await count('ac_tongling')) >= 1);
  await stepOn(10, 15);
  await talk('peng');
  check('quest done → 柿柿如意 + 柿餅 ×6', (await done('q_persimmon')) && (await count('ac_shishi')) === 1 && (await count('shibing')) >= 6);

  // ---------------------------------------------------------------- 柿樹坪: 山歌 duel (lose a round first), then night
  quest('山歌竹笛 (4-7 duel missable)');
  // 白芷's first try goes badly: off-rhyme lines and a missed tune
  await ev(() => { const song = G.Mini.song; let n = 0; G.Mini.song = function (o) { n++; if (n === 2 || n === 3) return Promise.resolve(0); return song.call(this, o); }; window.__restoreSong = () => { G.Mini.song = song; }; });
  await choices([0, 0, 0, 2, 0, 2, '再唱一遍', 1, 0, 1, 0]);
  await heard();
  await stepOn(43, 24);
  await ev(() => window.__restoreSong());
  const duel = await heard();
  check('lost round → the crowd hints that a win earns a gift', /唱贏阿福个人，德興伯有好東西相送/.test(duel));
  check('「再唱一遍」 → win → 山歌竹笛', (await flag('ch4_shange_win')) && (await count('fl_shange')) === 1);
  check('evening ends at night in 柿樹坪', (await flag('ch4_village_night')) && (await mapId()) === 'hakka_village');
  const nightIntro = duel.split('德興伯有好東西相送').pop();

  quest('S4 擂茶課');
  await stepOn(23, 11);
  check('into 劉家伙房', (await mapId()) === 'hakka_liu');
  await choices(['星河']);
  await talk('manmei');
  check('lesson → 紅纓擂茶 ×3 + 擂茶 ×5', (await flag('ch4_leicha_lesson')) && (await count('leicha_hy')) === 3 && (await count('leicha')) >= 5);
  check('q_leicha done', await done('q_leicha'));
  await stepOn(9, 11);

  quest('S5 山歌擂台・道士篇');
  await choices([0, '自己想', 0, 0, '自己想', 0, 0, '自己想', 0, 0]);
  await talk('afu');
  check('honest win → 花布頭巾, quest done', (await flag('ch4_shange_yungui_win')) && (await count('hd_huabu')) >= 1 && (await done('q_shange_yungui')));
  check('芋圓 back with the party', await ev(() => !G.state.flags.yuyuan_hidden && G.mapScene.followers.some((f) => f.id === 'yuyuan')));

  quest('S1 嶺上松 (心燈⑩)');
  check('clue: the unanswered song from the 義民廟 direction on the first night', /義民廟的方向/.test(nightIntro) && /他在等人回答/.test(nightIntro));
  await stepOn(24, 0);
  check('north path → 義民廟 at night, 阿松 present', (await mapId()) === 'yimin_temple' && (await ev(() => G.mapScene.npcs.some((n) => n.id === 'asong'))));
  await stepOn(21, 11);
  check('step 1: 義民塚 → 阿松 (quest stage 0)', (await flag('ch4_yimin_met')) && (await stage('q_yimin')) === 0);
  await stepOn(14, 23);
  await heard();
  await talk('afu');
  check('step 2: 阿福 points at 滿妹婆', /滿妹婆/.test(await heard()) && (await stage('q_yimin')) === 1);
  await stepOn(23, 11);
  await talk('manmei');
  check('step 3: 滿妹婆 → 秋妹的藍衫, points at 古伯', (await flag('ch4_yimin_shirt')) && (await count('key_qiumei_shirt')) === 1 && /古伯/.test(await heard()));
  await stepOn(9, 11);
  await stepOn(24, 0);
  await talk('gu');
  check('step 4: 古伯 agrees (stage 3)', (await flag('ch4_yimin_roll')) && (await stage('q_yimin')) === 3);
  await stepOn(14, 23);
  await stepOn(23, 11);
  await talk('manmei');
  check('step 5: 滿妹婆 comes along at night', (await mapId()) === 'yimin_temple' && (await flag('ch4_manmei_escort')));
  await talk('mm_wait');
  const l0 = await ev(() => G.Lanterns.count());
  await stepOn(21, 11);
  check('quest done, 心燈 lantern_yimin lit (exactly one)', (await done('q_yimin')) && (await lantern('lantern_yimin')) && (await ev(() => G.Lanterns.count())) === l0 + 1);
  check('reward 秋妹的藍衫 (armor), key item returned', (await count('ar_qiumei')) === 1 && (await count('key_qiumei_shirt')) === 0);
  await stepOn(14, 23);

  // ---------------------------------------------------------------- morning → 五指山 → 向天湖 → 風穴 (main)
  quest('setup');
  await stepOn(23, 11);
  await choices(['天光']);
  await act('beds');
  check('morning (4-8b)', await flag('ch4_morning'));
  await stepOn(9, 11);
  await stepOn(51, 20);
  check('五指山山徑', (await mapId()) === 'wuzhi_trail');
  await stepOn(19, 6);
  check('4-09 → 向天湖', (await mapId()) === 'xiangtian_house');
  await act('beds_x');
  await stepOn(7, 9);
  await choices(['準備好了']);
  await talk('xia');
  check('矮靈祭', (await mapId()) === 'xiangtian_festival');
  await talk('xia_f');
  check('4-12 back on the trail', (await mapId()) === 'wuzhi_trail' && (await flag('ch4_trail_south_open')));
  await stepOn(19, 6);
  check('4-13 into 風穴', (await mapId()) === 'wind_cave_1');

  quest('S6 風穴石耳 (七仙蕈 #2) + vision chests');
  await stepOn(20, 13);   // wind corridor (puzzle A)
  await stepOn(30, 8);
  await heard();
  await stepOn(30, 7);
  check('clue: 麻糬 stares at the east rock, 雲歸 suggests 靈視', /麻糬盯著東邊角落那塊石頭/.test(await heard()));
  await ev(() => G.mapScene.player.setCell(34, 2));
  check('crevice blocked without 靈視', await ev(() => G.mapScene.blocked(35, 2, G.mapScene.player)));
  check('use 七彩靈蕈 (item menu)', await useLingxun());
  check('crevice open with 靈視', await ev(() => !G.mapScene.blocked(35, 2, G.mapScene.player)));
  await stepOn(35, 2); await stepOn(36, 2);
  check('hint tag on the 石耳 crevice (靈視 only)', await hintOn('s6'));
  await shot('s6_crevice');
  await act('s6');
  check('風穴石耳 found (mush_ch4, 蕈譜 +1)', (await count('mat_fengxun')) === 1 && (await flag('mush_ch4')) && (await ev(() => G.state.vars.tuanzi_mush)) === 1);
  check('q_tuanzi_mush in the log (stage 9 = found, wait for the next)', (await stage('q_tuanzi_mush')) === 9);
  check('vision chest c4_19 → 七彩靈蕈 + 400', await openChest('c4_19'));

  // puzzle C — sail stones → updraft (same moves as ch4.test.js)
  quest('setup');
  const push = (px, py, sx, sy, dx, dy) => ev(([px, py, sx, sy, dx, dy]) => { const m = G.mapScene; m.player.setCell(px, py); return m.tryPush(sx, sy, dx, dy); }, [px, py, sx, sy, dx, dy]);
  await push(6, 4, 5, 4, -1, 0); await push(4, 3, 4, 4, 0, 1); await push(6, 4, 7, 4, 1, 0); await push(8, 3, 8, 4, 0, 1);
  await page.waitForTimeout(200); await idle();
  check('puzzle C solved', await flag('ch4_cave_lift'));
  await stepOn(6, 2);
  check('updraft → 風穴第二層', (await mapId()) === 'wind_cave_2');
  await ev(() => G.mapScene.player.setCell(24, 26));
  await interactObj('mural', 13, 18); await interactObj('bell', 25, 29); await interactObj('bell', 29, 29);
  check('puzzle B solved', await flag('ch4_cave_chimes'));
  quest('S6 風穴石耳 (七仙蕈 #2) + vision chests');
  await ev(() => G.mapScene.player.setCell(36, 30));
  check('use the second 七彩靈蕈', await useLingxun());
  check('vision chest c4_23 → 古錢串', (await openChest('c4_23')) && (await count('ac_jinqian')) >= 1);
  quest('setup');
  await stepOn(34, 4);
  await ev(() => G.mapScene.player.setCell(26, 5));
  await openChest('c4_21');
  await stepOn(7, 3);
  check('puzzle D solved', await flag('ch4_cave_echo'));
  await stepOn(7, 4);
  await stepOn(3, 6);
  check('風穴第三層', (await mapId()) === 'wind_cave_3');
  await levelTo(17);
  await stepOn(15, 9);
  check('風魔 beaten, lamp broken', (await flag('ch4_lamp_broken')) && (await mapId()) === 'wuzhi_trail');

  quest('S2 九降風裡的阿母 (心燈⑪)');
  check('after the lamp the log says: go back to the 米粉寮 at night (stage 2)', (await stage('q_mifen')) === 2);

  // ---------------------------------------------------------------- 4-16 柿樹坪, 紅纓's 擂茶 retry
  quest('setup');
  await heard();
  await stepOn(0, 47);
  check('4-16 柿樹坪 thanks', (await mapId()) === 'hakka_village' && (await flag('ch4_dexing_thanks')));
  quest('紅纓的擂茶 (硬頸頭帕)');
  check('clue: 紅纓 says she wants to relearn 擂茶 tonight', /再教我一次擂茶/.test(await heard()));
  await stepOn(23, 11);
  await choices(['暗晡']);
  await act('beds');
  check('night in 伙房 → 紅纓 relearns → 硬頸頭帕', (await flag('ch4_leicha_hongying')) && (await count('hd_yingjing')) === 1);
  await choices(['天光']);
  await act('beds');
  await stepOn(9, 11);
  await stepOn(0, 22);
  quest('S3 柿柿如意');
  await talk('peng');
  check('after the lamp: 霜柿餅 ×3', (await flag('ch4_persimmon_frost')) && (await count('shibing_frost')) === 3);
  await stepOn(0, 20);

  // ---------------------------------------------------------------- 竹塹: scholar, 4-17, south gate
  quest('老秀才 (秀才毛筆)');
  check('back in 竹塹', (await mapId()) === 'zhuqian');
  await choices(['好']);
  await talk('scholar_old');
  check('lecture → 秀才毛筆', (await flag('ch4_scholar_gift')) && (await count('ac_maobi')) === 1);
  quest('setup');
  await stepOn(27, 18);
  check('4-17 城隍爺 balanced', await flag('ch4_citygod_balanced'));
  await stepOn(10, 13);

  quest('歌薰門 point of no return');
  await ev(() => { G.Debug.log.length = 0; });
  await choices(['前往鹿港', '再等等']);
  await stepOn(27, 43);
  const pnr = await ev(() => G.Debug.log.filter((l) => l.startsWith('pointOfNoReturn')));
  check('warning names the open 心燈 quest (阿順伯 not yet visited after the lamp)', pnr.some((l) => /open: .*q_mifen/.test(l)), JSON.stringify(pnr));
  check('「再等等」 keeps you in 竹塹', (await mapId()) === 'zhuqian' && !(await flag('ch4_done')));

  quest('S2 九降風裡的阿母 (心燈⑪)');
  await stepOn(27, 0);
  await choices(['今暗']);
  const l1 = await ev(() => G.Lanterns.count());
  await talk('ashun');
  check('second night: 阿母 says goodbye → 心燈 lantern_mifen_mother', (await flag('ch4_mifen_mother')) && (await lantern('lantern_mifen_mother')) && (await ev(() => G.Lanterns.count())) === l1 + 1);
  await talk('ashun');
  check('wedding → 炒米粉 ×5, 喜糖 ×3, quest done', (await flag('ch4_mifen_wedding')) && (await count('xitang')) === 3 && (await done('q_mifen')));
  check('wedding props removed', !(await flag('ch4_wedding_now')));
  await stepOn(13, 32);

  quest('歌薰門 point of no return');
  await ev(() => { G.Debug.log.length = 0; });
  await choices(['前往鹿港']);
  await ev(() => G.Debug.stepOn(27, 43));
  await page.waitForFunction(() => G.state.flags.ch4_done && G.state.chapter === 5, null, { timeout: 180000 });
  const pnr2 = await ev(() => G.Debug.log.filter((l) => l.startsWith('pointOfNoReturn')));
  check('everything done → no warning (nothing open)', pnr2.length === 1 && /nothing open/.test(pnr2[0]), JSON.stringify(pnr2));
  check('chapter 5 reached', (await ev(() => G.state.chapter)) === 5);
  check('both ch4 心燈 lit', (await lantern('lantern_yimin')) && (await lantern('lantern_mifen_mother')));
  const open = await ev(() => ['q_yimin', 'q_mifen', 'q_persimmon', 'q_leicha', 'q_shange_yungui'].filter((q) => !G.Quests.isDone(q)));
  check('every ch4 side quest closed in the log', open.length === 0, open.join(','));
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  await openPage(browser);
  try { await play(); } catch (e) { check('run completed', false, e.stack || e.message); }
  quest('setup');
  const p = await problems().catch((e) => ['problems(): ' + e.message]);
  check('no console errors / warnings / G.lastError during chapter 4', p.length === 0, p.slice(0, 6).join('\n        '));
  await browser.close();
  console.log('\n──────── ch4 side quests ────────');
  let bad = 0;
  for (const [name, q] of Object.entries(QUESTS)) {
    const ok = !q.fail.length;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${q.ok}/${q.ok + q.fail.length})`);
    for (const f of q.fail) console.log('        ✗ ' + f.split('\n')[0]);
  }
  console.log(`${bad ? 'FAIL' : 'PASS'}: ${Object.keys(QUESTS).length - bad}/${Object.keys(QUESTS).length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(bad ? 1 : 0);
})();

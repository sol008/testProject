#!/usr/bin/env node
// Chapter 3 《觀音艋舺》 automated playthrough (Playwright + Chromium, file://index.html).
//
//   node tools/test/chapters/ch3.test.js            # all sessions
//   node tools/test/chapters/ch3.test.js main side   # only sessions whose name contains a word
//   node tools/test/chapters/ch3.test.js --shots     # also save screenshots to tools/test/out/ch3/
//
// Sessions:
//   main     — ?debug&startch=3 → every main beat through G.Story.next(S, 4) (淡水 → 觀音山 → 太虛觀 → 艋舺 → 中秋 → 南門)
//   soldiers — 4-1 紅毛城的異鄉兵 (night at the inn → fort → scallop/windmill/燈座 → sunset release)
//   bangka   — 4-2 阿蓮與阿德, 4-3 小梅與母親, 4-4 頂下郊, 4-5 糰子蕈譜, 椅仔姑 A branch, shops/inn
//   trail    — 迷霧步道 wrong turns / hints, 太虛觀 蕈床 & hidden chest, chests, 鬼面碎片
// Fails on page errors, console errors (ERR_FILE_NOT_FOUND ignored; errors raised by OTHER chapter files are
// reported but ignored), G.lastError, missing-art warnings, or any failed assertion.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const VERBOSE = argv.includes('-v');
const R3D = argv.includes('--3d');
const ONLY = argv.filter((a) => !a.startsWith('--'));
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch3');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /AudioContext/, /willReadFrequently/];
const FOREIGN = /js\/maps\/ch(?!3_)\d+_|ch(?:[0-24-9]|1[01])_[a-z]+\.js/;   // errors thrown by other chapters' files
const ART_WARN = /\[shorelight\]|missing sprite|unknown song|unknown item|no actor/;

let failures = 0;
const results = [];

class Run {
  constructor(name, browser) { this.name = name; this.browser = browser; this.errors = []; this.foreign = []; this.checks = 0; this.fails = []; }
  async open(query) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    // 2D renderer for speed in headless Chromium (the WebGL path runs at ~1 fps on software GL); --3d keeps it on
    if (!R3D) await this.ctx.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('shorelight_settings') || '{}'); s.render3d = false; localStorage.setItem('shorelight_settings', JSON.stringify(s)); } catch (e) { /* ignore */ } });
    this.page = await this.ctx.newPage();
    this.page.on('console', (m) => {
      const t = m.text();
      if (IGNORE.some((r) => r.test(t))) return;
      const loc = m.location && m.location();
      const where = (loc && loc.url) || '';
      if (m.type() === 'error') {
        if (FOREIGN.test(t) || (FOREIGN.test(where) && !/ch3_guanyin/.test(t))) this.foreign.push(t.slice(0, 300));
        else this.errors.push('console.error: ' + t.slice(0, 800));
      } else if (m.type() === 'warning' && ART_WARN.test(t)) this.errors.push('warning: ' + t.slice(0, 400));
    });
    this.page.on('pageerror', (e) => {
      const st = String(e.stack || e.message);
      if (FOREIGN.test(st) && !/ch3_guanyin/.test(st)) this.foreign.push('pageerror: ' + e.message);
      else if (/Unexpected end of input|Unexpected token|SyntaxError/.test(e.message) && !/ch3_guanyin/.test(st)) this.foreign.push('pageerror (other file still being written?): ' + e.message);
      else this.errors.push('pageerror: ' + st.slice(0, 800));
    });
    await this.page.goto(BASE + query + (R3D ? '&r3lite' : ''));
    await this.page.waitForFunction(() => window.G && G.Debug && G.Scenes, null, { timeout: 30000 });
    await this.ev(() => {
      G.Debug.setAutoplay(true);
      const say = G.Dialog.say;
      G.Dialog.say = function (who, ...rest) { if (/^tuanzi\b/.test(String(who || ''))) console.error('speaker tuanzi used (糰子 was cut)'); return say.call(this, who, ...rest); };
    });
  }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  check(cond, msg) { this.checks++; if (!cond) { this.fails.push(msg); console.log(`    ✗ ${msg}`); } else if (VERBOSE) console.log(`    ✓ ${msg}`); }
  async idle(timeout = 180000) {
    // idle = no script, map on top, no fade — and still idle 400 ms later (auto events start on the next frame)
    const t0 = Date.now();
    for (;;) {
      const ok = await this.ev((ms) => G.Debug.idle(ms), Math.max(1000, timeout - (Date.now() - t0)));
      if (!ok) throw new Error('timed out waiting for idle: ' + await this.ev(() => { const t = G.Scenes.top(); return JSON.stringify({ top: t && t.constructor && t.constructor.name, busy: G.Script.busy(), fade: G.Render.fade.a, map: G.mapScene && G.mapScene.def.id, pos: G.mapScene && [G.mapScene.player.x, G.mapScene.player.y], dialog: G.Dialog.isOpen && G.Dialog.isOpen(), stack: G.Scenes.stack.map((x) => x.constructor && x.constructor.name) }); }));
      await this.page.waitForTimeout(400);
      const again = await this.ev(() => !G.Script.busy() && G.Scenes.top() === G.mapScene && G.Render.fade.a < 0.05);
      if (again) break;
      if (Date.now() - t0 > timeout) throw new Error('timed out (flapping idle)');
    }
    const ge = await this.ev(() => { const g = G.mapScene && G.Scenes.stack.find((s) => s.constructor && s.constructor.name === 'GameOverScene'); return !!g; });
    if (ge) throw new Error('GAME OVER');
  }
  choices(list) { return this.ev((l) => { G.Debug.choices = l.slice(); }, list); }
  async step(x, y) { await this.ev(([a, b]) => G.Debug.stepOn(a, b), [x, y]); await this.idle(); }
  async talk(id) { await this.ev((n) => G.Debug.talk(n), id); await this.idle(); }
  async trig(id) { await this.ev((n) => G.Debug.trigger(n), id); await this.idle(); }
  async script(body) { await this.ev((b) => { G.Script.run(new Function('S', 'return (' + b + ')(S);')); }, body); await this.idle(); }
  async warp(map, x, y, dir = 'down') { await this.script(`async (S) => { await S.warp('${map}', ${x}, ${y}, '${dir}'); }`); }
  flag(k) { return this.ev((f) => !!G.state.flags[f], k); }
  async flags(list, label) { for (const k of list) this.check(await this.flag(k), `${label || ''} flag ${k}`); }
  map() { return this.ev(() => G.mapScene && G.mapScene.def.id); }
  lantern(id) { return this.ev((l) => G.Lanterns.has(l), id); }
  item(id) { return this.ev((i) => G.Inv.count(i), id); }
  async shot(name) { if (SHOTS) await this.page.screenshot({ path: path.join(OUT, `${this.name}_${name}.png`) }); }
  async openChest(id) {
    return this.ev((cid) => {
      const m = G.mapScene;
      const o = m.objects.find((ob) => ob.t === 'chest' && ob.chest && ob.chest.id === cid && m.objActive(ob));
      if (!o || o.open) return false;
      m.openChest(o);
      return true;
    }, id).then(async (ok) => { await this.idle(); return ok; });
  }
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
  try { await fn(r); } catch (e) { r.fails.push('exception: ' + (e && e.stack || e)); console.log('    ✗ ' + (e && e.message || e)); }
  await r.finish().catch(() => {});
  const ok = !r.fails.length && !r.errors.length;
  if (!ok) failures++;
  for (const e of r.errors) console.log('    ! ' + e);
  if (r.foreign.length) console.log(`    (ignored ${r.foreign.length} error(s) from other chapters' files, e.g. ${r.foreign[0].slice(0, 120)})`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${r.checks - r.fails.length}/${r.checks} checks, ${r.errors.length} error(s), ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  results.push({ name, ok, checks: r.checks, fails: r.fails, errors: r.errors });
}

// ------------------------------------------------------------------------------------------------ main path
async function mainPath(r) {
  await r.open('?debug&startch=3&lv=11');
  await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'tamsui', null, { timeout: 60000 });
  await r.idle();
  r.check(await r.ev(() => G.state.chapter) === 3, 'chapter is 3');
  r.check(await r.ev(() => G.state.party.join(',')) === 'xinghe,baizhi,hongying', 'party starts as 星河・白芷・紅纓');
  r.check(await r.ev(() => G.state.flags.mochi_joined && G.state.flags.yuyuan_joined), 'pets 芋圓・麻糬 with the party');
  await r.flags(['ch3_start'], '3-1');
  await r.shot('tamsui_dusk');
  // 3-2 inn night → sleep
  await r.step(13, 10);
  r.check(await r.map() === 'tamsui_inn', 'entered 淡水客棧');
  await r.choices([0, 1]);
  await r.talk('ts_innkeeper');
  await r.flags(['ch3_inn'], '3-2');
  r.check(await r.item('c3_riceball') === 3, 'got 紅纓的飯糰 ×3');
  r.check(await r.ev(() => G.state.vars.c3_ts) === 'morning', 'morning after sleeping');
  await r.step(6, 9);
  // 3-3 ferry
  await r.talk('ts_boatman');
  r.check(await r.map() === 'guanyin_trail', 'ferry to 八里 → 觀音山道');
  await r.flags(['ch3_ferry'], '3-3');
  // 3-4 土地公廟 (offer a rice ball), 石猴王, fog
  await r.choices([0]);
  await r.step(23, 48);
  await r.flags(['ch3_tudi_offer'], '土地公');
  await r.step(19, 43);
  await r.step(18, 31);
  await r.flags(['ch3_monkeyking'], '石猴王');
  r.check(await r.item('c3_ac_monkey_stone') === 1, 'got 猴兒石符');
  await r.step(19, 29);
  r.check(await r.item('lingxun') >= 2, 'got 七彩靈蕈 at the fog');
  await r.shot('fog');
  const J = [27, 23, 19, 15, 11], X = { L: 13, M: 19, R: 25 }, ANS = ['L', 'R', 'R', 'M', 'L'];
  for (let k = 0; k < 5; k++) {
    await r.step(X[ANS[k]], J[k] - 1);
    await r.step(X[ANS[k]], J[k] - 2);
    r.check(await r.ev(() => G.state.vars.c3_fog) === k + 1, `fog fork ${k + 1} passed`);
  }
  await r.flags(['ch3_fog_done'], 'P1');
  // 3-5 → 3-6 → 3-7
  await r.step(19, 0);
  await r.shot('taixu_legend');
  r.check(await r.map() === 'taixu_room', 'cutscenes 3-5..3-7 end in 雲歸的房間');
  await r.flags(['ch3_yungui_met', 'ch3_mirror', 'lyric_ch3', 'ch3_legend'], '3-5..3-7');
  await r.step(6, 8);
  r.check(await r.map() === 'taixu', 'back in the courtyard');
  // 3-8, 3-9
  await r.talk('c3_yg_npc');
  await r.flags(['ch3_roof_talk', 'ch3_guimian_raid', 'ch3_yungui_join'], '3-8/3-9');
  r.check(await r.ev(() => G.state.party.includes('yungui')), '雲歸 joined');
  r.check(await r.ev(() => ['yuyuan', 'mochi'].every((id) => G.mapScene.followers.some((f) => f.id === id))), '芋圓 & 麻糬 follow on the map');
  r.check(await r.ev(() => !G.mapScene.npcs.some((n) => n.sprite === 'tuanzi') && !G.mapScene.followers.some((f) => f.id === 'tuanzi')), 'no 糰子 anywhere');
  r.check(await r.ev(() => G.state.members.yungui.lv) >= 11, '雲歸 level ≥ 11');
  r.check(await r.item('c3_taixu_key') === 1 && await r.item('c3_mush_book') === 1, 'got 太虛觀鑰匙 & 雲歸蕈譜');
  await r.shot('taixu_after_raid');
  await mainBangka(r, false);
}
// second half of the main path (艋舺 → 南門). Standalone segment: `node ch3.test.js main-bangka`
async function mainBangka(r, standalone) {
  if (standalone) {
    await r.open('?debug&map=taixu&x=13&y=19&lv=12&chapter=3&party=xinghe,baizhi,hongying,yungui&flags=mochi_joined,yuyuan_joined,ch3_start,ch3_inn,ch3_ferry,ch3_fog_done,ch3_yungui_met,ch3_mirror,ch3_legend,ch3_roof_talk,ch3_guimian_raid,ch3_yungui_join');
    await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'taixu', null, { timeout: 60000 });
    await r.idle();
  }
  // down the mountain (shortcut) → ferry to 艋舺
  await r.choices([0]);
  await r.step(13, 21);
  r.check(await r.map() === 'guanyin_trail', 'shortcut to 八里渡口');
  await r.choices(['艋舺']);
  await r.talk('gy_boatman');
  r.check(await r.map() === 'bangka', 'ferry upstream to 艋舺');
  await r.flags(['ch3_bangka_arrive'], '3-10');
  await r.shot('bangka_arrive');
  // 3-11 龍山寺
  await r.choices([0]);
  await r.step(27, 17);
  await r.flags(['ch3_temple_met', 'ch3_jiaobei'], '3-11');
  await r.step(13, 21);
  // 3-12 戲棚後台 (choice B)
  await r.choices([1]);
  await r.step(38, 23);
  await r.flags(['ch3_yizigu_choice_b', 'ch3_theatre'], '3-12');
  r.check(await r.openChest('c3_13'), 'opened 戲箱 c3_13');
  await r.step(9, 11);
  // inn → 八月十五
  await r.step(22, 9);
  await r.choices([0]);
  await r.talk('bk_innkeeper');
  r.check(await r.ev(() => G.state.vars.ch3_day) === 1, 'ch3_day = 1 after resting');
  await r.step(6, 9);
  await r.step(38, 23);
  await r.choices([0, 0]);
  await r.talk('bk_troupe_head');
  await r.flags(['ch3_show_done', 'ch3_letter'], '3-13/3-14');
  r.check(await r.lantern('lantern_yizigu'), '心燈 lantern_yizigu');
  r.check(await r.ev(() => G.state.vars.ch3_day) === 2, '中秋夜');
  await r.shot('festival');
  // 3-15 + 南門
  await r.choices([0]);
  await r.ev(() => G.Debug.stepOn(27, 43));
  await r.page.waitForFunction(() => G.state.chapter === 4, null, { timeout: 180000 });
  await r.page.waitForTimeout(500);
  await r.flags(['ch3_moon', 'ch3_done'], '3-15/end');
  r.check(await r.ev(() => G.state.chapter) === 4, 'G.Story.next(S, 4) reached (chapter 4)');
  r.check(await r.ev(() => G.Quests.isDone('q_ch3_main')), 'q_ch3_main done');
}

// ------------------------------------------------------------------------------------------------ 4-1 soldiers
async function soldiers(r) {
  await r.open('?debug&startch=3&lv=11');
  await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'tamsui', null, { timeout: 60000 });
  await r.idle();
  await r.step(13, 10);
  await r.choices([0, 0]);                 // 住宿 → 去紅毛城看看
  await r.talk('ts_innkeeper');
  await r.flags(['ch3_inn', 'ch3_night_free'], '3-2 night');
  r.check(await r.ev(() => G.state.vars.c3_ts) === 'night' && await r.map() === 'tamsui', 'night in 淡水');
  await r.step(22, 0);
  r.check(await r.map() === 'tamsui_fort', 'up to 紅毛城');
  await r.flags(['ch3_soldiers_met'], '4-1 step 1');
  await r.shot('fort_night');
  // scallop: without 靈視 only rustling (decline the mushroom), with 靈視 it can be picked
  await r.choices([1]);
  await r.trig('fort_scallop');
  r.check(await r.item('c3_scallop') === 0, 'scallop hidden without 靈視');
  await r.ev(() => G.Script.S.vision(60));
  await r.trig('fort_scallop');
  r.check(await r.item('c3_scallop') === 1, 'got 扇貝殼 with 靈視');
  // windmill: needs materials
  await r.step(11, 17);
  await r.talk('ts_child');
  r.check(await r.item('c3_windmill') === 0, 'no windmill without materials');
  await r.ev(() => { for (const id of ['c3_redpaper', 'c3_bamboo', 'c3_candle']) G.Inv.add(id, 1); });
  await r.choices([0]);
  await r.talk('ts_child');
  r.check(await r.item('c3_windmill') === 1 && await r.item('c3_redpaper') === 0, '糊燈籠 → 小風車');
  await r.choices([0]);
  await r.talk('ts_fisher');
  r.check(await r.item('c3_lantern_base') === 2, 'got 水燈座 ×2');
  r.check(await r.ev(() => G.Quests.stage('q_tamsui_soldiers')) === 3, 'quest at stage 3');
  await r.step(22, 0);
  await r.talk('gh_diego_f');
  r.check(await r.map() === 'tamsui', 'sunset release on the river mouth');
  await r.flags(['ch3_soldiers_done'], '4-1');
  r.check(await r.lantern('lantern_tamsui_soldiers'), '心燈 lantern_tamsui_soldiers');
  r.check(await r.item('c3_ac_foreign_button') === 1, 'got 異鄉的銅釦');
  r.check(await r.ev(() => G.Quests.isDone('q_tamsui_soldiers')), 'q_tamsui_soldiers done');
  // fort interior chest
  await r.warp('tamsui_fort_in', 6, 7, 'up');
  r.check(await r.openChest('c3_02'), 'opened c3_02');
  await r.idle();
  r.check(await r.item('c3_old_helmet') === 1, 'got 舊鐵盔');
  // morning after: inn "等到夜裡" no longer offered once done; sleeping gives morning
  await r.warp('tamsui_inn', 6, 7, 'up');
  await r.choices([0]);
  await r.talk('ts_innkeeper');
  r.check(await r.ev(() => G.state.vars.c3_ts) === 'morning', 'slept until morning');
}

// ------------------------------------------------------------------------------------------------ 艋舺 side quests
async function bangkaSide(r) {
  await r.open('?debug&map=bangka&x=7&y=19&lv=13&chapter=3&party=xinghe,baizhi,hongying,yungui&flags=mochi_joined,yuyuan_joined,ch3_start,ch3_inn,ch3_ferry,ch3_yungui_join,ch3_bangka_arrive');
  await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'bangka', null, { timeout: 60000 });
  await r.ev(() => { G.state.vars.ch3_day = 0; });
  await r.idle();
  await r.shot('bangka_dusk');
  // ---- 4-2 阿蓮與阿德
  await r.talk('bk_alian');
  await r.flags(['ch3_alian_1'], '4-2 step 1');
  await r.step(9, 0);
  r.check(await r.map() === 'bangka_riverbank', 'north road → 舊渡頭 at night');
  await r.step(7, 7);
  await r.flags(['ch3_alian_2'], '4-2 step 2 (河伯怨靈)');
  r.check(await r.openChest('c3_11'), 'opened c3_11'); await r.idle();
  r.check(await r.openChest('c3_12'), 'opened c3_12'); await r.idle();
  r.check(await r.item('c3_ar_water_gauze') === 1, 'got 水紋紗衣');
  await r.step(35, 6);
  r.check(await r.map() === 'bangka', 'back to 艋舺');
  await r.choices([1]);
  await r.talk('bk_alian');
  r.check(!(await r.flag('ch3_alian_3')), 'wrong answer: 阿蓮 refuses');
  await r.choices([0]);
  await r.talk('bk_alian');
  await r.flags(['ch3_alian_3', 'ch3_alian_done'], '4-2 step 3/4');
  r.check(await r.lantern('lantern_alian'), '心燈 lantern_alian');
  r.check(await r.item('c3_hd_ade') === 1 && await r.item('c3_wanguo_lite') === 5, 'got 阿德的斗笠 & 碗粿 ×5');
  await r.shot('riverbank_after');
  // ---- 4-5 糰子蕈譜
  await r.warp('bangka', 36, 15, 'up');
  await r.talk('bk_herbman');
  r.check(await r.ev(() => G.Quests.stage('q_tuanzi_mush')) === 1, 'q_tuanzi_mush started (stage 1)');
  // ---- 4-3 小梅與母親
  await r.step(27, 17);
  r.check(await r.map() === 'bangka_longshan', 'in 龍山寺');
  await r.talk('ls_xiaomei');
  await r.flags(['ch3_xiaomei_1'], '4-3 step 1');
  await r.warp('bangka_bopiliao', 32, 9, 'up');
  await r.ev(() => G.Script.S.vision(60));
  await r.trig('bp_mush');
  await r.flags(['mush_1'], '杉皮蕈');
  r.check(await r.ev(() => G.state.vars.tuanzi_mush) === 1, 'tuanzi_mush = 1');
  r.check(await r.ev(() => G.Quests.stage('q_tuanzi_mush')) === 2, 'q_tuanzi_mush stage 2');
  r.check(await r.openChest('c3_10'), 'opened c3_10'); await r.idle();
  await r.choices([0]);
  await r.talk('bk_chunpo');
  await r.flags(['ch3_xiaomei_done'], '4-3');
  r.check(await r.lantern('lantern_xiaomei'), '心燈 lantern_xiaomei');
  r.check(await r.item('c3_ac_magnolia') === 1, 'got 玉蘭香囊');
  // ---- 4-4 頂下郊
  await r.warp('bangka', 47, 30, 'up');
  await r.talk('bk_ashui');
  await r.flags(['ch3_feud_1'], '4-4 step 1');
  await r.warp('bangka_longshan', 13, 12, 'up');
  await r.talk('bk_temple');
  await r.warp('bangka_bopiliao', 21, 10, 'up');
  await r.talk('bk_teaman');
  await r.warp('bangka', 49, 6, 'up');
  await r.talk('bk_xing');
  await r.step(46, 4);
  r.check(await r.map() === 'bangka_xing', 'in 阿興家');
  await r.talk('bk_xingma');
  await r.flags(['ch3_feud_wu', 'ch3_feud_tea', 'ch3_feud_xing', 'ch3_feud_clue'], '4-4 step 2');
  r.check(await r.ev(() => G.Quests.stage('q_feud')) === 1, 'q_feud stage 1');
  await r.warp('bangka', 47, 30, 'up');
  await r.choices([1, 0]);                 // fight first (3-turn battle), then reconcile
  await r.talk('bk_ashui');
  await r.flags(['ch3_feud_done'], '4-4');
  r.check(await r.lantern('lantern_feud'), '心燈 lantern_feud');
  r.check(await r.item('c3_sameboat_wine') === 1, 'got 同船米酒');
  // ---- 椅仔姑 A branch (seal) + the show A version
  await r.ev(() => { G.state.flags.ch3_temple_met = true; });
  await r.choices([0]);
  await r.warp('bangka_theatre', 9, 10, 'up');
  await r.flags(['ch3_yizigu_sealed', 'ch3_theatre'], '3-12 A');
  r.check(!(await r.flag('ch3_yizigu_choice_b')), 'A branch does not set choice_b');
  await r.ev(() => { G.state.vars.ch3_day = 2; });
  await r.choices([1]);                    // skip the light mini-game
  await r.warp('bangka', 37, 25, 'up');
  await r.flags(['ch3_show_done', 'ch3_letter'], '3-13 A');
  r.check(!(await r.lantern('lantern_yizigu')), 'no 椅仔姑 lantern on the A branch');
  // 3-15 from the temple (moon) instead of the gate
  await r.warp('bangka_longshan', 13, 9, 'up');
  await r.trig('ls_moon');
  await r.flags(['ch3_moon'], '3-15 via 龍山寺');
  r.check(await r.map() === 'bangka', 'moon scene ends on 艋舺');
  // chest + inn on 中秋夜 keeps the day
  await r.warp('bangka', 7, 34, 'up');
  r.check(await r.openChest('c3_09'), 'opened c3_09'); await r.idle();
  await r.warp('bangka_inn', 6, 7, 'up');
  await r.choices([0]);
  await r.talk('bk_innkeeper');
  r.check(await r.ev(() => G.state.vars.ch3_day) === 2, 'resting on 中秋夜 keeps ch3_day 2');
  r.check(await r.ev(() => ['lantern_alian', 'lantern_xiaomei', 'lantern_feud'].every((id) => G.Lanterns.has(id))), 'three 艋舺 lanterns');
}

// ------------------------------------------------------------------------------------------------ trail & 太虛觀 extras
async function trailExtras(r) {
  await r.open('?debug&map=guanyin_trail&x=20&y=51&lv=11&chapter=3&party=xinghe,baizhi,hongying&flags=mochi_joined,yuyuan_joined,ch3_start,ch3_inn,ch3_ferry');
  await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'guanyin_trail', null, { timeout: 60000 });
  await r.idle();
  await r.ev(() => G.Inv.add('c3_riceball', 1));
  await r.choices([1]);
  await r.step(23, 48);
  r.check(!(await r.flag('ch3_tudi_offer')), '合十 does not set ch3_tudi_offer');
  for (const id of ['c3_03', 'c3_04', 'c3_05']) {
    const pos = { c3_03: [5, 47], c3_04: [33, 38], c3_05: [5, 32] }[id];
    await r.warp('guanyin_trail', pos[0], pos[1]);
    r.check(await r.openChest(id), 'opened ' + id); await r.idle();
  }
  r.check(await r.item('c3_sw_guanyin') === 1, 'got 觀音山石劍');
  // fog: wrong turn resets, three misses → purring hint
  await r.ev(() => { G.state.flags.ch3_monkeyking = true; });
  await r.warp('guanyin_trail', 19, 29, 'up');
  await r.idle();
  await r.step(13, 26); await r.step(13, 25);               // F1 left = correct
  await r.step(13, 22); await r.step(13, 21);               // F2 left = wrong
  r.check(await r.ev(() => [G.state.vars.c3_fog, G.state.vars.c3_fog_miss, G.mapScene.player.x, G.mapScene.player.y].join(',')) === '0,1,19,28', 'wrong turn → back to F1');
  for (let i = 0; i < 2; i++) { await r.step(19, 26); await r.step(19, 25); }   // F1 middle = wrong ×2
  r.check(await r.ev(() => G.state.vars.c3_fog_miss) === 3, 'three misses counted');
  await r.ev(() => G.Debug.trigger('fog_crumb_0'));
  await r.idle();
  // F3 dead-end chest
  await r.ev(() => { G.state.vars.c3_fog = 2; });
  await r.warp('guanyin_trail', 29, 19);
  r.check(await r.openChest('c3_06'), 'opened c3_06 (F3 dead end)'); await r.idle();
  // 太虛觀 蕈床 → 幻境 → hidden chest
  await r.ev(() => { G.state.flags.ch3_yungui_met = true; G.state.flags.ch3_mirror = true; G.state.flags.ch3_legend = true; });
  await r.warp('taixu', 5, 6, 'up');
  await r.choices([0]);
  await r.ev(() => { G.mapScene.player.setCell(5, 6); G.mapScene.player.dir = 'up'; });
  await r.trig('tx_mush');
  await r.flags(['ch3_ate_mush'], 'P2');
  r.check(await r.ev(() => G.state.vars.vision > 0), '幻境 (靈視) active');
  r.check(await r.openChest('c3_07'), 'hidden chest c3_07 visible in 幻境'); await r.idle();
  r.check(await r.item('c3_ft_cloudboots') === 1, 'got 雲紋道靴');
  // after the raid: mask shard & locked chest
  await r.ev(() => { G.state.flags.ch3_guimian_raid = true; G.state.flags.ch3_yungui_join = true; G.state.flags.ch3_roof_talk = true; G.Party.join('yungui', 11); G.Inv.add('c3_taixu_key', 1); });
  await r.warp('taixu', 21, 18, 'up');
  await r.trig('tx_shard');
  await r.flags(['ch3_mask_shard'], '鬼面碎片');
  r.check(await r.item('c3_mask_shard') === 1, 'got 鬼面碎片');
  await r.warp('taixu_room', 6, 7, 'up');
  r.check(await r.openChest('c3_08'), 'opened c3_08 with 太虛觀鑰匙'); await r.idle();
  r.check(await r.item('c3_fn_thunderwood') === 1, 'got 雷擊木符扇');
  // ferry menu from 八里 after joining offers 艋舺 & 淡水
  await r.warp('guanyin_trail', 20, 52, 'up');
  await r.choices(['淡水']);
  await r.talk('gy_boatman');
  r.check(await r.map() === 'tamsui', 'ferry 八里 → 淡水');
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  await session('main', browser, mainPath);
  if (ONLY.some((w) => w === 'main-bangka')) await session('main-bangka', browser, (r) => mainBangka(r, true));
  await session('soldiers', browser, soldiers);
  await session('bangka-side', browser, bangkaSide);
  await session('trail-extras', browser, trailExtras);
  await browser.close();
  console.log('\n──────── ch3 summary ────────');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.checks - r.fails.length}/${r.checks})`);
  console.log(`${failures ? 'FAIL' : 'PASS'}: ${results.length - failures}/${results.length} sessions passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(failures ? 1 : 0);
})();

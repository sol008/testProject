#!/usr/bin/env node
// Chapter 10 《後山巡境》 automated playthrough (Playwright + Chromium against file://…/index.html).
//
//   node tools/test/chapters/ch10.test.js            # full run
//   node tools/test/chapters/ch10.test.js --shots    # also save screenshots to tools/test/out/ch10/
//   node tools/test/chapters/ch10.test.js --headed
//   node tools/test/chapters/ch10.test.js --realtime # no extra logic steps (slow headless)
//   node tools/test/chapters/ch10.test.js --from hualien   # main path from a later segment (orchid|taitung|hualien|toucheng); --to <segment> stops after it
//   node tools/test/chapters/ch10.test.js --only main      # only tests whose name contains the word
//   node tools/test/chapters/ch10.test.js --3d       # keep the WebGL renderer on (slow headless)
//
// 1. Main path from ?debug&startch=10 with G.Debug autoplay: every story beat of the screenplay up to the
//    chapter's final G.Story.next(S, 11) (asserts chapter 11 + ch10_end / ch10_done).
//    Side content is exercised inside the same run where the story places it (達悟 trust → 心燈 18,
//    海祭 → 心燈 19 + Kolas bonus, 寶桑 race, 羅漢腳阿義 → 心燈, the salt-dam flood/reset, the muntjac).
// 2. Mechanics checks in fresh pages: 界石 boundary (trust penalties, push back), reef tide wash, rockfall,
//    salt dam rules, every map loads, low-trust branch (no 心燈 18).
// Fails on page errors, console errors (except ERR_FILE_NOT_FOUND), G.lastError, unknown music/items/troops
// /actors warnings and wrong choice picks.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const HEADED = argv.includes('--headed');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch10');
if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /AudioContext was not allowed/, /willReadFrequently/];
const BAD_WARN = [/unknown song/i, /unknown item/i, /unknown troop/i, /no actor/i, /Unknown map/i, /Unknown enemy/i];
// other chapters are written in parallel: a syntax error in someone else's file must not fail ch10's run
// (reported as a warning instead)
const vm = require('vm');
const FOREIGN = [];
for (const f of fs.readdirSync(path.join(ROOT, 'js', 'maps'))) {
  if (!f.endsWith('.js') || f === 'ch10_east.js') continue;
  try { new vm.Script(fs.readFileSync(path.join(ROOT, 'js', 'maps', f), 'utf8'), { filename: f }); }
  catch (e) { FOREIGN.push(e.message); console.log(`warning: js/maps/${f} does not parse (${e.message}) — its load error is ignored`); }
}
const results = [];
let current = null;

function log(...a) { console.log(...a); }
class Fail extends Error {}
const assert = (c, msg) => { if (!c) throw new Fail(msg); };

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  // the WIP WebGL renderer is very slow under headless SwiftShader; the chapter logic is renderer-agnostic, so
  // run the 2D path unless --3d is given
  if (!argv.includes('--3d')) await ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false })); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  page.__errs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (IGNORE.some((r) => r.test(t))) return;
    if (m.type() === 'error') page.__errs.push('console.error: ' + t.slice(0, 600));
    else if (m.type() === 'warning' && BAD_WARN.some((r) => r.test(t))) page.__errs.push('warning: ' + t.slice(0, 300));
  });
  page.on('pageerror', (e) => { if (FOREIGN.includes(e.message)) return; page.__errs.push('pageerror: ' + (e.stack || e.message).slice(0, 800)); });
  return { ctx, page };
}

// ------------------------------------------------------------------ in-page helpers
function api(page) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const A = {
    ev,
    async open(q) {
      await page.goto(BASE + q);
      await page.waitForFunction(() => window.G && G.Scenes && G.Scenes.top(), null, { timeout: 30000 });
      await ev(() => { G.Debug.setAutoplay(true); G.Debug.log.length = 0; });
      // headless canvas drawing is slow (a few fps): advance the game logic with extra fixed steps between frames
      // (same update sequence as js/main.js / tools/test/e2e.js ff()); drawing still happens on rAF
      if (!argv.includes('--realtime')) await ev(() => {
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
    async waitFor(expr, timeout = 90000, what) {
      try { await page.waitForFunction(expr, null, { timeout, polling: 100 }); }
      catch (e) {
        const st = await ev(() => ({ map: G.mapScene && G.mapScene.def.id, top: G.Scenes.top() && G.Scenes.top().constructor.name, busy: G.Script.busy(), log: G.Debug.log.slice(-6) })).catch(() => ({}));
        throw new Fail(`timeout waiting for ${what || expr} — ${JSON.stringify(st)}`);
      }
    },
    async idle(timeout = 120000) {
      // two consecutive idle observations ~300ms apart (auto events may start right after a script ends)
      const t0 = Date.now();
      for (;;) {
        const ok = await ev(() => G.Debug.idle(2000));
        if (ok) { await page.waitForTimeout(350); if (await ev(() => G.Debug.idle(50))) return; }
        if (Date.now() - t0 > timeout) {
          const st = await ev(() => ({ map: G.mapScene && G.mapScene.def.id, top: G.Scenes.top() && G.Scenes.top().constructor.name, busy: G.Script.busy(), log: G.Debug.log.slice(-6) }));
          throw new Fail('timeout waiting for idle — ' + JSON.stringify(st));
        }
      }
    },
    choices(list) { return ev((l) => { G.Debug.choices.length = 0; G.Debug.choices.push(...l); }, list); },
    async talk(id, ch = []) { await A.choices(ch); await ev((i) => G.Debug.talk(i), id); await A.idle(); await A.checkChoices(); },
    async trigger(id, ch = []) { await A.choices(ch); await ev((i) => G.Debug.trigger(i), id); await A.idle(); await A.checkChoices(); },
    async step(x, y, ch = []) { await A.choices(ch); await ev(([a, b]) => G.Debug.stepOn(a, b), [x, y]); await page.waitForTimeout(150); await A.idle(); await A.checkChoices(); },
    async interact(tag, ch = []) {
      await A.choices(ch);
      await ev((t) => { const o = G.mapScene.objects.find((x) => x.tag === t); if (!o) throw new Error('no object ' + t); return G.Script.run((S) => o.interact(S, o)); }, tag);
      await A.idle(); await A.checkChoices();
    },
    async run(body, ch = []) { await A.choices(ch); await ev((b) => G.Script.run(new Function('S', 'return (async () => {' + b + '})()')), body); await A.idle(); await A.checkChoices(); },
    async checkChoices() {
      const left = await ev(() => G.Debug.choices.slice());
      if (left.length) throw new Fail('unused scripted choices: ' + JSON.stringify(left) + ' — last log: ' + JSON.stringify(await ev(() => G.Debug.log.slice(-4))));
      const bad = await ev(() => G.Debug.log.filter((l) => l.startsWith('SHOP: unknown')));
      if (bad.length) throw new Fail(bad.join('; '));
    },
    flag: (k) => ev((kk) => !!G.state.flags[kk], k),
    vars: () => ev(() => G.state.vars),
    map: () => ev(() => G.mapScene && G.mapScene.def.id),
    count: (it) => ev((i) => G.Inv.count(i), it),
    lantern: (id) => ev((i) => !!G.state.lanterns[i], id),
    async shot(name) { if (SHOTS) await page.screenshot({ path: path.join(OUT, name + '.png') }); },
    async errors() {
      const le = await ev(() => { const e = G.lastError; G.lastError = null; return e ? String(e.stack || e) : null; }).catch(() => null);
      const errs = page.__errs.splice(0);
      if (le) errs.push('G.lastError: ' + le.slice(0, 600));
      return errs;
    },
  };
  return A;
}

const SKIP = (() => { const i = argv.indexOf('--skip'); return i >= 0 ? argv[i + 1] : null; })();
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1] : null; })();
async function test(browser, name, fn) {
  if (ONLY && !name.includes(ONLY)) return;
  if (SKIP && name.includes(SKIP)) return;
  const { ctx, page } = await newPage(browser);
  const A = api(page);
  const t0 = Date.now();
  let status = 'PASS', msg = '';
  current = name;
  try { await fn(A, page); } catch (e) { status = 'FAIL'; msg = e instanceof Fail ? e.message : (e.stack || String(e)).slice(0, 900); }
  const errs = await A.errors();
  if (errs.length && status === 'PASS') { status = 'FAIL'; msg = errs.length + ' game error(s)'; }
  results.push({ name, status, msg, errs, s: ((Date.now() - t0) / 1000).toFixed(1) });
  log(`${status === 'PASS' ? '✓' : '✗'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)${msg ? '  — ' + msg : ''}`);
  for (const e of errs.slice(0, 8)) log('    ' + e.slice(0, 500));
  await ctx.close();
}

// ------------------------------------------------------------------ the main path
// --from <segment> starts the main path at a later segment with the story state of the previous ones preset
// (re-run only the failing part): orchid | taitung | hualien | toucheng
const SEGS = ['orchid', 'taitung', 'hualien', 'toucheng'];
const FROM = (() => { const i = argv.indexOf('--from'); return i >= 0 ? argv[i + 1] : 'orchid'; })();
const SEG = Math.max(0, SEGS.indexOf(FROM));
const TO = (() => { const i = argv.indexOf('--to'); return i >= 0 ? SEGS.indexOf(argv[i + 1]) : 3; })();
async function preset(A, seg) {
  await A.run(`
    const F = ['ch10_orchid_arrive', 'ch10_orchid_rules', 'ch10_reef_open', 'ch10_reef_done', 'ch10_serpent_defeated', 'ch10_chuanyan', 'ch10_tao_xindeng'];
    if (${seg} >= 2) F.push('ch10_taitung_arrive', 'ch10_race_won', 'ch10_amis_met', 'c10_fix_a', 'c10_fix_b', 'c10_fix_c', 'ch10_coast_a', 'ch10_coast_b', 'ch10_coast_c', 'ch10_coast_clear', 'ch10_haiji_witnessed');
    if (${seg} >= 3) F.push('ch10_hualien_arrive', 'ch10_gaya_heard', 'ch10_truku_permission', 'ch10_saved_watan', 'ch10_freed_muntjac', 'ch10_colossus_defeated', 'ch10_xinghe_turn', 'ch10_rainbow_seen');
    for (const f of F) S.flag(f);
    G.Lanterns.add('xd_tao_tatala', '達悟家族的拼板舟'); G.Inv.add('key_boateye', 1);
    if (${seg} >= 2) G.Lanterns.add('xd_amis_haiji', '阿美族海祭');
    const v = G.state.vars;
    v.xunjing = [0, 3, 4, 5][${seg}]; v.days_to_gate = [0, 76, 44, 25][${seg}];
    v.c10_place = ['', 'orchid', 'taitung', 'taroko'][${seg}]; v.c10_port = ['', 'orchid', 'amis', 'huilan'][${seg}];
    if (${seg} >= 3) v.c10_gorge = { d: [1, 1, 1], p: [0, 0, 0, 0] };
    await S.warp('wangboat_deck_east', 8, 6, 'right');
  `);
}

let segName = null, segStart = 0;
function segT(name) { const now = Date.now(); if (segName) log(`    segment ${segName}: ${((now - segStart) / 1000).toFixed(0)}s`); segName = name; segStart = now; }
async function mainPath(A) {
  await A.open('?debug&startch=10');
  await A.waitFor(() => G.mapScene && G.mapScene.def.id === 'wangboat_deck_east' && G.state.flags.ch10_start, 60000, 'C10-01 on the deck');
  await A.idle();
  assert((await A.ev(() => G.state.chapter)) === 10, 'chapter should be 10');
  assert(await A.flag('ch10_egg'), 'ch10_egg');
  assert((await A.vars()).days_to_gate === 85, 'days 85');
  const party = await A.ev(() => G.state.party.slice());
  assert(party.join() === 'xinghe,hongying,yungui', 'party is 星河/紅纓/雲歸: ' + party);
  assert((await A.ev(() => G.mapScene.followers.map((f) => f.id).join())).includes('yuyuan'), '芋圓 follows');
  // The in-game auto-battle AI is much weaker than a player (and than tools/sim_battle.js): random encounters are
  // skipped here, so give the party the chapter-end level and the chapter's shop gear before the story bosses.
  await A.ev(() => {
    for (const id of G.state.party) G.Story.ensureLevel(id, 40);
    const g = { xinghe: 'c10_sw_lanyang', hongying: 'c10_sp_huilan', yungui: 'c10_fn_haishen' };
    for (const id in g) Object.assign(G.state.members[id].equip, { weapon: g[id], armor: 'c10_ar_jiaosi', head: 'c10_hd_jiaosi', feet: 'c10_ft_jiaosi' });
    G.Party.healAll();
  });
  await A.shot('01_deck');

  // ---- 蘭嶼
  if (SEG <= 0 && TO >= 0) {
  segT('orchid');
  await A.talk('chenbo', ['出航', '蘭嶼', '不停留']);
  assert((await A.map()) === 'orchid_shore', 'landed on 蘭嶼');
  assert(await A.flag('ch10_orchid_arrive'), 'C10-02 done');
  assert((await A.vars()).days_to_gate === 82, 'days 82');
  await A.shot('02_orchid');
  await A.talk('tao_sinan', ['抓住芋圓']);
  assert(await A.flag('ch10_orchid_rules') && await A.flag('ch10_reef_open'), 'C10-03 done');
  await A.talk('tao_sinan');  // daily line after the rules
  await A.talk('tao_syapen'); await A.talk('tao_neighbor');
  await A.step(43, 15);
  assert((await A.map()) === 'orchid_reef', 'on the reef');
  await A.interact('oar1'); await A.interact('oar2'); await A.interact('reef');
  assert((await A.count('c10_oar')) === 2, 'two oars');
  assert((await A.count('c10_seasalt')) >= 2, 'reef crate opened');
  await A.shot('03_reef');
  await A.step(24, 23);
  assert(await A.flag('ch10_reef_done'), 'C10-04 done');
  assert((await A.map()) === 'orchid_shore', 'back on the shore');
  assert((await A.count('c10_oar')) === 0 && (await A.count('c10_figurehead')) === 0, 'oars & figurehead returned');
  await A.talk('tao_syapen', ['準備好了']);
  await A.waitFor(() => G.state.flags.ch10_chuanyan, 240000, 'C10-05/06');
  await A.idle();
  assert(await A.flag('ch10_serpent_defeated'), 'serpent defeated');
  assert(await A.count('key_boateye'), '船眼護符');
  assert(await A.lantern('xd_tao_tatala'), '心燈 18 (trust ≥ 3)');
  assert((await A.vars()).ch10_tao_trust >= 3, 'trust');
  assert((await A.vars()).xunjing === 3 && (await A.vars()).days_to_gate === 76, '巡境 3 / days 76');
  assert((await A.map()) === 'wangboat_deck_east', 'back on the deck');
  await A.shot('04_deck_eye');

  }

  // ---- 台東
  if (SEG <= 1 && TO >= 1) {
  segT('taitung');
  if (FROM === 'taitung') await preset(A, 1);
  await A.talk('chenbo', ['出航', '寶桑', '不停留']);
  assert((await A.map()) === 'baosang' && await A.flag('ch10_taitung_arrive'), 'C10-07 寶桑');
  assert((await A.vars()).days_to_gate === 50, 'days 50');
  await A.talk('bs_runner', ['比一圈']);
  assert(await A.flag('ch10_race_won') && (await A.count('c10_ft_kuaitui')) === 1, 'race won');
  await A.talk('bs_shop1'); await A.talk('bs_shop2'); await A.talk('bs_inn', ['住宿']);
  await A.shot('05_baosang');
  await A.step(12, 0);
  assert((await A.map()) === 'amis_village' && await A.flag('ch10_amis_met'), 'C10-08');
  await A.talk('am_panay'); await A.talk('am_youth'); await A.talk('am_kolas');
  await A.step(36, 0);
  assert((await A.map()) === 'taitung_coast', 'coast');
  await A.shot('06_coast');
  await A.step(19, 24);
  assert(await A.flag('c10_fix_a'), 'fixed battle A');
  await A.trigger('ptA');
  await A.step(28, 12);
  assert(await A.flag('c10_fix_b'), 'fixed battle B');
  await A.trigger('ptB');
  await A.step(20, 4);
  assert(await A.flag('c10_fix_c'), 'miniboss C');
  await A.trigger('ptC');
  assert(await A.flag('ch10_coast_clear'), 'coast clear');
  await A.step(22, 39);
  await A.waitFor(() => G.state.flags.ch10_haiji_witnessed, 120000, 'C10-10');
  await A.idle();
  assert(await A.lantern('xd_amis_haiji'), '心燈 19');
  assert((await A.count('c10_alifengfeng')) === 3, '阿里鳳鳳');
  assert((await A.count('c10_ac_kolas')) === 1, 'Kolas 的魚鉤 (same-night bonus)');
  assert((await A.vars()).xunjing === 4 && (await A.vars()).days_to_gate === 44, '巡境 4 / days 44');
  await A.shot('07_amis_after');

  }

  // ---- 花蓮
  if (SEG <= 2 && TO >= 2) {
  segT('hualien');
  if (FROM === 'hualien') await preset(A, 2);
  if ((await A.map()) !== 'wangboat_deck_east') await A.trigger('boat', ['回王船']);
  assert((await A.map()) === 'wangboat_deck_east', 'deck');
  await A.talk('chenbo', ['出航', '洄瀾', '不停留']);
  assert((await A.map()) === 'huilan' && await A.flag('ch10_hualien_arrive'), 'C10-11');
  assert((await A.vars()).days_to_gate === 29, 'days 29');
  await A.talk('hl_shop'); await A.talk('hl_arms'); await A.talk('hl_old');
  await A.step(0, 3);
  assert((await A.map()) === 'truku_village' && await A.flag('ch10_truku_permission'), 'C10-12');
  assert(await A.count('c10_permit'), '入山許可');
  await A.shot('08_truku');
  await A.talk('tk_iwan'); await A.talk('tk_child');
  await A.step(39, 10);
  assert((await A.map()) === 'huilan', 'back to 洄瀾');
  await A.trigger('dock', ['回王船']);
  await A.talk('chenbo', ['出航', '清水']); // same region as 洄瀾: no sea leg
  assert((await A.map()) === 'qingshui_cliffs', 'qingshui');
  await A.step(17, 16);
  assert(await A.flag('ch10_saved_watan'), 'saved Watan');
  await A.run(`await S.warp('qingshui_cliffs', 31, 2, 'up');`);
  await A.step(31, 0);
  assert((await A.map()) === 'taroko_gorge', 'gorge');
  await A.shot('09_gorge');
  // salt dams: wrong order floods & resets; then 3 → 2 → 1
  await A.trigger('dam1', ['用心火融開']);
  let gz = (await A.vars()).c10_gorge;
  assert(JSON.stringify(gz) === JSON.stringify({ d: [0, 0, 0], p: [1, 1, 1, 0] }), 'flood resets the dams: ' + JSON.stringify(gz));
  assert((await A.ev(() => [G.mapScene.player.x, G.mapScene.player.y].join())) === '17,41', 'washed back to the B entrance');
  await A.trigger('dam3', ['用心火融開']); await A.trigger('dam2', ['用心火融開']); await A.trigger('dam1', ['用心火融開']);
  gz = (await A.vars()).c10_gorge;
  assert(gz.d.join() === '1,1,1' && gz.p.join() === '0,0,0,0', 'all dams open: ' + JSON.stringify(gz));
  assert(await A.ev(() => !G.mapScene.solid[28 * G.mapScene.w + 25] && !G.mapScene.solid[24 * G.mapScene.w + 24]), 'ledges walkable');
  await A.interact('gz_b');
  assert((await A.count('c10_fn_yunjian')) === 1, 'pothole chest');
  await A.talk('gz_muntjac', ['用心火融開鹽殼']);
  assert(await A.flag('ch10_freed_muntjac'), 'muntjac freed');
  await A.interact('gz_c');
  await A.step(26, 18);
  // the auto-battle AI does not play the stone-armour gimmick well: extra levels for the colossus fight only
  await A.ev(() => { for (const id of G.state.party) G.Story.ensureLevel(id, 44); G.Party.healAll(); });
  await A.step(22, 10);
  await A.waitFor(() => G.state.flags.ch10_rainbow_seen, 240000, 'C10-13/14');
  await A.idle();
  assert(await A.flag('ch10_colossus_defeated') && await A.flag('ch10_xinghe_turn'), 'colossus / turn');
  assert((await A.count('c10_ac_iwan')) === 1, '依旺的織帶');
  assert((await A.vars()).xunjing === 5, '巡境 5');
  assert((await A.map()) === 'truku_village', 'in the village at dawn');
  await A.shot('10_truku_after');

  await A.step(39, 10);
  await A.trigger('dock', ['回王船']);
  }

  // ---- 頭城
  if (SEG <= 3 && TO >= 3) {
  segT('toucheng');
  if (FROM === 'toucheng') await preset(A, 3);
  await A.talk('chenbo', ['出航', '頭城', '不停留']);
  assert(await A.flag('ch10_zhongyuan') && await A.flag('ch10_birthday'), 'C10-15');
  assert((await A.count('c10_xinghe_lantern')) === 1, '星河的燈籠');
  assert((await A.map()) === 'toucheng' && await A.flag('ch10_toucheng_arrive') && await A.flag('ch10_qianggu_team'), 'C10-17');
  assert((await A.vars()).days_to_gate === 4, 'days 4');
  await A.shot('11_toucheng');
  await A.talk('tc_kavalan'); await A.talk('tc_food'); await A.talk('tc_taoist'); await A.talk('tc_shop'); await A.talk('tc_arms');
  await A.talk('tc_akun', ['練習']);
  // 羅漢腳阿義 (side quest): night at the inn → meet him → lantern from 陳伯 → hang it on the 燈篙
  await A.talk('tc_inn', ['住宿']);
  assert((await A.vars()).c10_tc_time === 'eve', 'evening');
  await A.talk('tc_ayi');
  assert(await A.flag('ch10_ayi_met'), 'met 阿義');
  await A.trigger('boat', ['回王船']);
  await A.talk('chenbo', ['燈籠']);
  assert((await A.count('c10_ayi_lantern')) === 1, '阿義的燈籠');
  await A.trigger('boat', ['上岸']);
  assert((await A.map()) === 'toucheng', 'back in 頭城');
  await A.trigger('ayipole', ['掛上']);
  assert(await A.flag('ch10_ayi_lantern_ready'), 'lantern hung');
  await A.talk('tc_akun', ['準備好了']);
  await A.waitFor(() => G.state.chapter === 11 && G.state.flags.ch10_end, 300000, 'C10-18…C10-20 → chapter 11');
  assert(await A.flag('ch10_pudu_defended') && await A.flag('ch10_shunfeng_flag') && await A.flag('ch10_qianggu_first'), 'pudu / flag / 頭旗');
  assert(await A.lantern('xd_luohanjiao'), '心燈 羅漢腳阿義');
  assert((await A.count('key_flag')) === 1 && (await A.count('c10_ac_touqi')) === 1, '順風旗 + 頭旗綵帶');
  assert((await A.count('c10_pudu_offering')) === 0, 'offerings removed after the fight');
  assert(await A.flag('ch10_done'), 'ch10_done (hand-off flag for ch11)');
  const v = await A.vars();
  assert(v.xunjing === 6 && v.days_to_gate === 0, '巡境 6 / days 0');
  assert(await A.ev(() => G.state.party.includes('yungui') && G.state.members.yungui.skills.includes('yg_pudu')), 'yg_pudu learned');
  const lv = await A.ev(() => G.state.party.map((id) => G.state.members[id].lv));
  log('    party levels at the end of ch10:', lv.join('/'), ' 心燈:', await A.ev(() => Object.keys(G.state.lanterns).join(',')));
  }
  segT(null);
}

// ------------------------------------------------------------------ mechanics in isolation
const MAPQ = (map, x, y, flags = '') => `?debug&map=${map}&x=${x}&y=${y}&lv=36&party=xinghe,hongying,yungui&chapter=10&flags=yuyuan_joined,mochi_joined${flags ? ',' + flags : ''}`;

async function boundary(A) {
  await A.open(MAPQ('orchid_shore', 15, 10, 'ch10_orchid_arrive'));
  await A.idle();
  for (let i = 0; i < 3; i++) await A.step(15, 8);
  const v = await A.vars();
  assert(v.ch10_line_tries === 3, 'line tries 3');
  assert(v.ch10_tao_trust === -2, 'trust −2 after 3 tries (first is free): ' + v.ch10_tao_trust);
  assert((await A.ev(() => G.mapScene.player.y)) === 9, 'pushed back onto the beach');
  assert(await A.ev(() => G.mapScene.solid[7 * G.mapScene.w + 15] === 1), 'village side is not walkable');
}

async function lowTrust(A) {
  // never caught 芋圓, crossed the stones twice, asked questions → no 心燈 18
  await A.open(MAPQ('orchid_shore', 15, 10, 'ch10_orchid_arrive,ch10_orchid_rules,ch10_reef_open,ch10_reef_done'));
  await A.idle();
  await A.ev(() => { G.state.vars.ch10_tao_trust = 1; G.state.vars.ch10_line_tries = 2; G.state.vars.c10_orchid_time = 'morning'; });
  const fish0 = await A.count('feiyugan');
  await A.run(`S.flag('ch10_serpent_defeated'); await S.warp('orchid_shore', 15, 18, 'up', { reload: true });`);
  await A.choices(['問']);
  await A.waitFor(() => G.state.flags.ch10_chuanyan, 120000, 'C10-06 (low trust)');
  await A.idle();
  assert(!(await A.lantern('xd_tao_tatala')), 'no 心燈 with trust < 3');
  assert((await A.count('feiyugan')) === fish0 + 2, '飛魚乾 ×2');
  assert(await A.flag('ch10_chuanyan') && await A.count('key_boateye'), '船眼護符 still given');
}

async function tide(A) {
  await A.open(MAPQ('orchid_reef', 17, 7, 'ch10_orchid_arrive,ch10_reef_open'));
  await A.idle();
  await A.ev(() => { G.mapScene.c10t = 13.9; });
  await A.waitFor(() => G.mapScene.player.y === 4 && !G.Script.busy(), 20000, 'tide wash back to channel start');
  assert((await A.ev(() => G.mapScene.terrainAt(17, 6))) === 'water', 'channel flooded at high tide');
  await A.ev(() => { G.mapScene.c10t = 23.95; });
  await A.waitFor(() => G.mapScene.terrainAt(17, 6) === 'shallow', 10000, 'low tide again');
}

async function rockfall(A) {
  await A.open(MAPQ('qingshui_cliffs', 20, 16, 'ch10_truku_permission,ev_qingshui_cliffs_qs_intro,ch10_saved_watan'));
  await A.idle();
  const hp0 = await A.ev(() => G.state.members.xinghe.hp);
  await A.ev(() => { G.mapScene.c10rf = 2.9; G.mapScene.player.setCell(20, 16); }); // line x=19..21 falls at t=3
  await A.waitFor(() => G.mapScene.player.x === 17 && !G.Script.busy(), 20000, 'pushed back to the zone start');
  assert((await A.ev(() => G.state.members.xinghe.hp)) < hp0, 'rock hit hurts');
  await A.ev(() => { G.mapScene.c10rf = 2.9; G.mapScene.player.setCell(21, 14); }); // in the alcove above line 19..21 — safe
  await A.ev(() => new Promise((r) => setTimeout(r, 800)));
  assert((await A.ev(() => G.mapScene.player.x)) === 21, 'alcove is safe');
}

async function allMaps(A) {
  const maps = ['wangboat_deck_east', 'orchid_shore', 'orchid_reef', 'baosang', 'amis_village', 'taitung_coast', 'huilan', 'truku_village', 'qingshui_cliffs', 'taroko_gorge', 'toucheng', 'c10_xuanwu_room'];
  const flags = 'ch10_start,ch10_orchid_arrive,ch10_taitung_arrive,ch10_amis_met,ch10_hualien_arrive,ch10_gaya_heard,ch10_truku_permission,ev_qingshui_cliffs_qs_intro,ev_taroko_gorge_gz_intro,ch10_toucheng_arrive,ch10_qianggu_team';
  for (const m of maps) {
    await A.open(MAPQ(m, 0, 0, flags).replace('&x=0&y=0', ''));
    await A.waitFor(`G.mapScene && G.mapScene.def.id === '${m}'`, 20000, 'map ' + m);
    await A.idle();
    await A.ev(() => new Promise((r) => setTimeout(r, 400)));
    await A.shot('map_' + m);
    const bad = await A.ev(() => {
      const ms = G.mapScene, out = [];
      for (const o of ms.objects) if (!G.Objects.get(o.t)) out.push('object ' + o.t);
      for (const n of ms.npcs) if (G.Sprites && !G.Sprites.has(n.sprite || n.id)) out.push('sprite ' + (n.sprite || n.id));
      return out;
    });
    assert(!bad.length, m + ': missing art ' + bad.join(', '));
  }
}

(async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  log('Chapter 10 《後山巡境》 playthrough test');
  await test(browser, 'all chapter maps load & draw', allMaps);
  await test(browser, '蘭嶼 界石 boundary (trust penalty, push back)', boundary);
  await test(browser, '礁盤 tide washes the player back', tide);
  await test(browser, '清水斷崖 rockfall & safe alcoves', rockfall);
  await test(browser, '達悟 low-trust branch (no 心燈)', lowTrust);
  await test(browser, 'main path: startch=10 → G.Story.next(S, 11)', mainPath);
  await browser.close();
  const fails = results.filter((r) => r.status !== 'PASS');
  log('');
  log(`ch10: ${results.length - fails.length}/${results.length} passed — ${fails.length ? 'FAIL' : 'PASS'}`);
  process.exit(fails.length ? 1 : 0);
})();

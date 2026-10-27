#!/usr/bin/env node
// Chapter 8 《逆潮》 automated playthrough (Playwright + Chromium, file://…/index.html).
//
//   node tools/test/chapters/ch8.test.js            # everything
//   node tools/test/chapters/ch8.test.js --only main # only tests whose id contains a word
//   node tools/test/chapters/ch8.test.js --shots     # also save screenshots to tools/test/out/ch8_*.png
//
// main      : ?debug&startch=8 → 北港 (8-1 … 8-2 起駕・鑽轎腳) → 8-3a 逆潮 → 北港溪口 rescue of all five pilgrims (P8-1)
//             → 潮怨・百手 → 黎明 (心燈 北港的香客) → 渡頭線索 → 安平 (蚵殼阿嬤 A) → 舊城 sluice puzzle (P8-2) → 觀潮台
//             (洛青鋒, 洛家劍譜) → 8-8 → G.Story.next(S, 9)
// tide      : tide counter terrain changes (3 / 5 / 7) and the failure branch at 8 (temple rescue, no 心燈)
// oyster_b  : 蚵殼阿嬤 option B (no 心燈)
// npcs      : talks to every NPC on every ch8 map in each phase (catches script errors), inn, shops, sluice 'too deep'
// Fails on page errors, console errors (ERR_FILE_NOT_FOUND ignored), G.lastError, or missing-art warnings.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../../..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'tools/test/out');
const argv = process.argv.slice(2);
const ONLY = argv.includes('--only') ? String(argv[argv.indexOf('--only') + 1]).split(',') : null;
const SHOTS = argv.includes('--shots');
// other chapters are written in parallel by other builders: by default their map files are stubbed out so a
// half-written neighbour cannot break this test (--all loads every chapter file as index.html lists them)
const ALL = argv.includes('--all');
fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
const ART_WARN = /unknown|missing|not registered|no actor|not found/i;

// fast-forward driver (same idea as tools/test/e2e.js): run the per-frame update with a fixed dt
const INIT = () => {
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
          if (i % 6 === 0) { G.Render.begin(); G.ctx.fillStyle = '#000'; G.ctx.fillRect(0, 0, G.W, G.H); G.Scenes.draw(G.ctx); G.UI.drawToasts(G.ctx); G.Render.drawOverlays(); }
          G.Input.endFrame();
        } catch (e) { G.lastError = e; this.errs.push('ff: ' + (e && e.stack || e)); return; }
        await y();
      }
    },
  };
  window.addEventListener('error', (e) => window.__qa && window.__qa.errs.push('onerror: ' + (e.error && e.error.stack || e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__qa && window.__qa.errs.push('unhandled: ' + (e.reason && e.reason.stack || e.reason)));
};

class Session {
  constructor(browser, name) { this.browser = browser; this.name = name; this.errors = []; this.notes = []; }
  async open(query) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await this.ctx.addInitScript(INIT);
    if (!ALL) await this.ctx.route(/js\/maps\/ch(?!8_)\d+_\w+\.js$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* other chapter stubbed for the ch8 test */' }));
    this.page = await this.ctx.newPage();
    this.page.on('console', (m) => {
      const t = m.text();
      if (IGNORE.some((r) => r.test(t))) return;
      if (m.type() === 'error') this.errors.push('console.error: ' + t.slice(0, 600));
      else if (m.type() === 'warning' && ART_WARN.test(t)) this.errors.push('warning: ' + t.slice(0, 300));
    });
    this.page.on('pageerror', (e) => this.errors.push('pageerror: ' + (e.stack || e.message).slice(0, 800)));
    await this.page.goto(BASE + query);
    await this.page.waitForFunction(() => window.G && G.Debug && G.Scenes, null, { timeout: 30000 });
    await this.ev(() => { G.Debug.setAutoplay(true); localStorage.clear(); });
  }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  ff(sec) { return this.page.evaluate((s) => __qa.ff(s), sec); }
  // drive the game until no script runs, the map is on top and the screen is not faded (or timeout)
  async idle(maxSec = 180) {
    const t0 = Date.now();
    for (;;) {
      const st = await this.ev(() => {
        const top = G.Scenes.top();
        if (G.GameOverScene && top instanceof G.GameOverScene) return 'gameover';
        return G.mapScene && !G.Script.busy() && top === G.mapScene && G.Render.fade.a < 0.05 ? 'idle' : 'busy';
      });
      if (st === 'gameover') throw new Error('GAME OVER on map ' + await this.ev(() => G.mapScene && G.mapScene.def.id));
      if (st === 'idle') {
        await this.ff(0.3); // let auto events start
        const again = await this.ev(() => !G.Script.busy() && G.Scenes.top() === G.mapScene);
        if (again) return;
      }
      if ((Date.now() - t0) / 1000 > maxSec) throw new Error('timeout waiting for idle; stack=' + await this.ev(() => G.Scenes.stack.map((s) => s.constructor && s.constructor.name).join('>')) + ' map=' + await this.ev(() => G.mapScene && G.mapScene.def.id));
      await this.ff(1.0);
    }
  }
  async choices(list) { await this.ev((l) => { G.Debug.choices = l.slice(); }, list); }
  async talk(id, choices) { if (choices) await this.choices(choices); await this.ev((i) => { G.Debug.talk(i); }, id); await this.idle(); }
  async trigger(id, choices) { if (choices) await this.choices(choices); await this.ev((i) => { G.Debug.trigger(i); }, id); await this.idle(); }
  async step(x, y, choices) { if (choices) await this.choices(choices); await this.ev(([a, b]) => G.Debug.stepOn(a, b), [x, y]); await this.idle(); }
  async run(body) { await this.ev((b) => { G.Script.run(new Function('S', 'return (async () => {' + b + '})()')); }, body); await this.idle(); }
  flag(k) { return this.ev((kk) => G.state.flags[kk], k); }
  map() { return this.ev(() => G.mapScene && G.mapScene.def.id); }
  // the debug chapter start gives starting gear only; give the party what a player would have bought by ch8
  async gear() {
    await this.ev(() => {
      const E = { xinghe: ['c8_liuguang', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_qingxin'], hongying: ['c8_jingtao', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_huzhao'], yungui: ['c8_leiyin', 'c8_jinxiang', 'hd_yunjin', 'ft_bangtui', 'ac_yeming'] };
      for (const id in E) for (const it of E[id]) { G.Inv.add(it, 1); G.Party.equip(id, G.Data.items[it].type, it); }
      G.Party.healAll();
    });
  }
  async boost(lv) { await this.ev((L) => { for (const m of G.Party.active()) while (m.lv < L) G.Party.addExpTo(m, G.Party.expToNext(m.lv) - m.exp, []); G.Party.healAll(); }, lv); }
  async shot(n) { if (SHOTS) await this.page.screenshot({ path: path.join(OUT, 'ch8_' + n + '.png') }); }
  async collect() {
    const e = await this.ev(() => { const r = __qa.errs.slice(); const le = G.lastError ? String(G.lastError.stack || G.lastError) : null; return { r, le }; }).catch(() => ({ r: [], le: null }));
    this.errors.push(...e.r);
    if (e.le) this.errors.push('G.lastError: ' + e.le.slice(0, 600));
  }
  async close() { await this.collect(); if (this.ctx) await this.ctx.close().catch(() => {}); }
}

const results = [];
const assert = (c, msg) => { if (!c) throw new Error('assert: ' + msg); };
const tests = [];
const test = (id, name, fn) => tests.push({ id, name, fn });

// ------------------------------------------------------------------------------------------ main path
test('main', 'critical path: startch=8 → G.Story.next(9)', async (s) => {
  await s.open('?debug&startch=8');
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'beigang', null, { timeout: 60000 });
  await s.idle();
  assert(await s.flag('ch8_start'), '8-1 intro ran');
  await s.gear();
  assert((await s.ev(() => G.state.party.slice(0, 3).join(','))) === 'xinghe,hongying,yungui', 'party = 星河 紅纓 雲歸');
  await s.shot('01_beigang');
  await s.talk('boatman');
  assert(await s.flag('ch8_no_boat'), '8-1b boatman');
  await s.step(27, 13);
  assert(await s.flag('ch8_jiajiang_seen'), '8-1c 八家將與神將');
  await s.talk('keeper', ['準備好了']);
  assert(await s.flag('ch8_qijia') && await s.flag('ch8_zuanjiao'), '8-2 起駕・鑽轎腳');
  assert((await s.ev(() => G.Inv.count('c8_xianghuo'))) === 3, '3 北港香火袋');
  await s.shot('02_night');
  await s.step(27, 25);
  assert((await s.map()) === 'beigang_river' && await s.flag('ch8_surge'), '8-3a → river');
  await s.idle();
  assert(await s.flag('ch8_river_intro'), 'river intro');
  await s.shot('03_river');
  // P8-1: rescue ①③④ (→ ⑤ appears & is rescued automatically) then ②
  for (const z of ['zone1', 'zone3', 'zone4']) { await s.talk('rv_aunt'); await s.trigger(z); }
  assert(await s.flag('ch8_afu_found'), '⑤ 阿福 found after three rescues');
  await s.talk('rv_aunt');
  await s.trigger('zone2');
  const tide = await s.flag('ch8_tide');
  assert((await s.flag('ch8_saved')) === 5 && tide <= 5 && !(await s.flag('ch8_tide_fail')), `all five saved before tide 8 (tide ${tide})`);
  assert(await s.flag('ch8_rescue_over'), 'rescue phase over');
  assert(await s.ev(() => G.mapScene.enemies.some((e) => e.def.troop === 't_c8_hundred')), '百手 appears at the mouth');
  await s.boost(31);
  await s.step(44, 34);
  assert(await s.flag('ch8_hundred_done') && await s.flag('ch8_surge_end'), '8-3c 百手 defeated, surge ended');
  assert((await s.map()) === 'beigang', 'back to 北港 at dawn');
  await s.idle();
  assert(await s.flag('ch8_dawn_done'), '8-3d dawn scene');
  assert(await s.ev(() => G.Lanterns.has('lantern_beigang_pilgrims')), '心燈 北港的香客');
  assert(await s.flag('ch8_heartlamp_pilgrims') && (await s.ev(() => G.Inv.count('c8_mazubing'))) === 5, 'pilgrim reward: 媽祖餅×5');
  assert(await s.ev(() => G.Inv.count('c8_chaoxin') === 1), '潮心珠 drop');
  await s.shot('04_dawn');
  await s.talk('xiuying');
  assert(await s.flag('ch8_xiuying_gift'), '秀英姨 gift');
  await s.step(50, 24);
  assert(await s.flag('ch8_clue_anping'), '8-3e clue');
  await s.step(27, 43, ['出發']);
  assert((await s.map()) === 'anping' && await s.flag('ch8_anping'), '→ 安平, 8-4');
  await s.shot('05_anping');
  await s.talk('oyster', [0]);
  assert((await s.flag('ch8_sq_oyster')) === 1, '蚵殼阿嬤 option A');
  await s.talk('disciple'); await s.talk('disciple');
  assert(await s.flag('ch8_qf_rumor'), 'rumor');
  await s.talk('axing');
  assert(await s.flag('ch8_gate_open') && await s.flag('ch8_dusk_ap'), 'gate open, dusk');
  await s.step(21, 2, ['入夜']);
  assert((await s.map()) === 'anping_fort' && await s.flag('ch8_fort_enter'), '8-4b → fort');
  await s.idle();
  // P8-2: open A → courtyard (guards) → notes → open B → east, open C → back, close A → channel 3 dry
  const wheel = (w) => s.run(`const o = G.mapScene.objects.find((x) => x.wheel === '${w}'); await o.interact(S, o);`);
  await wheel('A');
  assert(await s.ev(() => !G.mapScene.solid[32 * 40 + 20]), 'channel 1 dry after A');
  await s.step(20, 27);
  assert(await s.flag('ch8_fort_guards'), '8-5b guards');
  await s.run(`const o = G.mapScene.objects.find((x) => x.chest && x.chest.id === 'c8_fort_r'); G.mapScene.openChest(o);`);
  assert(await s.flag('ch8_notes_read') && await s.ev(() => G.Inv.count('c8_cm_note') === 1), '長明宮手記');
  await wheel('B'); await wheel('C');
  assert(await s.ev(() => G.mapScene.solid[12 * 40 + 20] === 1), 'channel 3 still wet while A is open');
  await wheel('A');
  assert(await s.ev(() => !G.mapScene.solid[12 * 40 + 20] && G.mapScene.solid[32 * 40 + 20] === 1), 'A closed: channel 3 dry, channel 1 flooded');
  await s.run(`const o = G.mapScene.objects.find((x) => x.chest && x.chest.id === 'c8_fort_q'); G.mapScene.openChest(o);`);
  await s.shot('06_fort');
  await s.boost(33);
  await s.step(20, 1);
  // 觀潮台: battle → 8-6b/c/d → 8-7 → 安平 dawn (8-8)
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'anping' && G.state.flags.ch8_dawn, null, { timeout: 400000 }).catch(() => {});
  await s.idle(400);
  assert(await s.flag('ch8_qingfeng_dead') && await s.flag('ch8_jianpu') && await s.flag('ch8_deadline'), '8-6 / 8-7 flags');
  assert(await s.ev(() => G.state.members.hongying.skills.includes('hy_luojia') && G.Inv.count('key_jianpu') === 1), '洛家劍譜 learned');
  assert(await s.flag('ch8_end') && await s.flag('ch8_chenbo_arrive') && await s.flag('ch8_wangchuan_hint'), '8-8 end flags');
  await s.shot('07_anping_dawn');
  await s.talk('oyster');
  assert(await s.ev(() => G.Lanterns.has('lantern_oyster_grandma')), '心燈 蚵殼阿嬤');
  await s.talk('chenbo_ap', ['出發']);
  await s.ff(3);
  assert((await s.ev(() => G.state.chapter)) === 9, 'chapter 9 reached via G.Story.next');
});

// ------------------------------------------------------------------------------------------ tide system & failure branch
test('tide', 'tide counter terrain (3/5/7) and failure at 8', async (s) => {
  await s.open('?debug&map=beigang_river&x=9&y=9&lv=28&party=xinghe,hongying,yungui&chapter=8&flags=ch8_start,ch8_dusk,ch8_qijia,ch8_surge,ch8_river_intro');
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'beigang_river', null, { timeout: 30000 });
  await s.ev(() => { G.state.flags.ch8_tide_base = 0; G.state.flags.ch8_tide = 0; G.state.flags.ch8_saved = 0; G.state.battles = 0; });
  await s.idle();
  const at = (x, y) => s.ev(([a, b]) => G.mapScene.terrainAt(a, b), [x, y]);
  assert((await at(15, 15)) === 'dirt' && (await at(22, 16)) === 'bridge_h', 'initial terrain');
  await s.ev(() => { G.state.battles = 3; }); await s.idle();
  assert((await s.flag('ch8_tide')) === 3 && (await at(15, 15)) === 'shallow', 'tide 3: lanes shallow');
  await s.ev(() => { G.state.battles = 5; }); await s.idle();
  assert((await at(22, 16)) === 'river' && await s.ev(() => G.mapScene.solid[16 * 48 + 22] === 1), 'tide 5: south bridge flooded');
  await s.ev(() => { G.Debug.stepOn(16, 16); }); await s.idle();
  await s.ev(() => { G.state.battles = 7; }); await s.idle();
  assert((await at(15, 15)) === 'river', 'tide 7: lanes are river');
  assert(await s.ev(() => !G.mapScene.solid[G.mapScene.player.y * 48 + G.mapScene.player.x]), 'player pushed out of the flooded lane');
  assert(!(await s.flag('ch8_rescue_over')), 'not over yet at 7 (others reachable)');
  await s.ev(() => { G.state.battles = 8; }); await s.idle();
  assert(await s.flag('ch8_tide_fail') && await s.flag('ch8_rescue_over') && await s.flag('ch8_afu_by_temple'), 'tide 8: temple rescues the rest');
  assert(await s.ev(() => G.mapScene.enemies.some((e) => e.def.troop === 't_c8_hundred')), 'boss appears after failure');
  await s.boost(31);
  await s.step(44, 34);
  assert((await s.map()) === 'beigang', 'to dawn');
  await s.idle();
  assert(await s.flag('ch8_dawn_done') && !(await s.ev(() => G.Lanterns.has('lantern_beigang_pilgrims'))), 'no 心燈 on failure');
});

// ------------------------------------------------------------------------------------------ oyster option B
test('oyster_b', '蚵殼阿嬤 option B gives no 心燈', async (s) => {
  await s.open('?debug&map=anping&x=9&y=21&lv=28&party=xinghe,hongying,yungui&chapter=8&flags=ch8_anping');
  await s.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'anping', null, { timeout: 30000 });
  await s.idle();
  await s.talk('oyster', [1]);
  assert((await s.flag('ch8_sq_oyster')) === -1, 'option B');
  await s.ev(() => { G.state.flags.ch8_dawn = true; G.state.flags.ch8_end_start = true; G.state.flags.ch8_end = true; G.state.flags.ch8_qingfeng_dead = true; });
  await s.talk('oyster');
  assert(await s.flag('ch8_oyster_done') && !(await s.ev(() => G.Lanterns.has('lantern_oyster_grandma'))), 'no lantern');
  assert(await s.ev(() => G.Inv.count('shimuyu') >= 2), '虱目魚粥 ×2');
});

// ------------------------------------------------------------------------------------------ every NPC, every phase
test('npcs', 'talk to every NPC on every map & phase; inn; sluice blocking; crystal', async (s) => {
  const phases = [
    ['beigang', 27, 30, 'ch8_start,ch8_jiajiang_seen'],
    ['beigang', 27, 22, 'ch8_start,ch8_jiajiang_seen,ch8_no_boat,ch8_dusk,ch8_qijia,ch8_zuanjiao'],
    ['beigang', 27, 16, 'ch8_start,ch8_jiajiang_seen,ch8_no_boat,ch8_dusk,ch8_qijia,ch8_zuanjiao,ch8_surge,ch8_surge_end,ch8_dawn_done,ch8_saved_4'],
    ['beigang_inn', 7, 9, 'ch8_start'],
    ['beigang_river', 9, 9, 'ch8_start,ch8_dusk,ch8_qijia,ch8_surge,ch8_river_intro'],
    ['beigang_river', 9, 9, 'ch8_start,ch8_dusk,ch8_qijia,ch8_surge,ch8_surge_end'],
    ['anping', 20, 16, 'ch8_anping'],
    ['anping', 20, 16, 'ch8_anping,ch8_fort_enter,ch8_dawn,ch8_end_start,ch8_end,ch8_qingfeng_dead'],
    ['anping_fort', 20, 40, 'ch8_fort_intro,ch8_fort_enter'],
  ];
  let first = true;
  for (const [map, x, y, flags] of phases) {
    if (!first) await s.close();
    first = false;
    await s.open(`?debug&map=${map}&x=${x}&y=${y}&lv=30&party=xinghe,hongying,yungui&chapter=8&flags=${flags}`);
    await s.page.waitForFunction((m) => G.mapScene && G.mapScene.def.id === m, map, { timeout: 30000 });
    await s.ev(() => { G.state.flags.ch8_tide_base = 0; G.state.battles = 0; G.state.flags.ch8_tide = 0; });
    await s.idle();
    const ids = await s.ev(() => G.mapScene.npcs.filter((n) => n.talk || (n.def && n.def.talk)).map((n) => n.id));
    for (const id of ids) {
      if (map === 'beigang' && id === 'keeper') continue;      // starts 8-2 (covered by main)
      if (map === 'anping' && id === 'chenbo_ap') continue;    // ends the chapter (covered by main)
      const cur = await s.map();
      if (cur !== map) break;
      await s.choices([1, 1, 1]);
      await s.ev((i) => G.Debug.talk(i).catch(() => {}), id);
      await s.idle();
    }
    if (map === 'anping_fort') {
      await s.step(20, 35);   // flooded channel 1 mouth → pushed back
      assert((await s.ev(() => G.state.y)) === 36, 'too deep: pushed back');
      await s.run(`const o = G.mapScene.objects.find((x) => x.t === 'crystal' && x.y === 38); G.Debug.choices = [1]; await o.interact(S, o);`);
      assert((await s.map()) === 'anping', 'tide stone → 安平');
    }
    if (map === 'beigang_inn') {
      await s.ev(() => { G.state.gold = 500; });
      await s.talk('innkeeper', [0]);
      assert((await s.ev(() => G.state.gold)) === 420, 'inn charged 80');
    }
    await s.shot('npcs_' + map + '_' + flags.split(',').length);
  }
});

// ------------------------------------------------------------------------------------------ runner
(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  for (const t of tests) {
    if (ONLY && !ONLY.some((w) => t.id.includes(w))) continue;
    const s = new Session(browser, t.id);
    const ts = Date.now();
    let status = 'PASS', msg = '';
    try { await t.fn(s); } catch (e) { status = 'FAIL'; msg = e.message; await s.shot('FAIL_' + t.id).catch(() => {}); }
    await s.close();
    if (status === 'PASS' && s.errors.length) { status = 'FAIL'; msg = `${s.errors.length} game error(s)`; }
    results.push({ id: t.id, status });
    console.log(`${status === 'PASS' ? '✓' : '✗'} [${t.id}] ${t.name}  ${((Date.now() - ts) / 1000).toFixed(1)}s${msg ? '  — ' + msg : ''}`);
    for (const e of [...new Set(s.errors)].slice(0, 8)) console.log('    ' + e.split('\n').slice(0, 3).join(' | '));
  }
  await browser.close();
  const fails = results.filter((r) => r.status !== 'PASS').length;
  console.log(`\nch8: ${fails ? 'FAIL' : 'PASS'} — ${results.length - fails}/${results.length} passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(fails ? 1 : 0);
})();

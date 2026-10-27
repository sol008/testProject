#!/usr/bin/env node
// Chapter 5 《鹿港舊夢》 side-quest playthroughs (Playwright + Chromium, file://index.html, 2D renderer).
//
//   node tools/test/sidequests/ch5.side.js              # all sessions
//   node tools/test/sidequests/ch5.side.js chain fubo   # only sessions whose name contains a word
//   node tools/test/sidequests/ch5.side.js -v           # print every passing check too
//
// The game is driven only the way a player can: walking (G.Debug.stepOn), talking (G.Debug.talk), facing an action
// spot and pressing Z (act()), choices, chests, battles (autoplay). The quests' own flags / items / stages are never set.
// Sessions that do not start at ?startch=5 load a debug map with MAIN-STORY flags only (to skip the 怨宴 boss).
//
// Sessions:
//   chain        — ?startch=5 → 半邊井 (心燈) the natural way → 洛家古厝 → 憶蕈 → 怨宴 → 福伯 (心燈, 牛舌餅 from the chest)
//                  → inn: nothing left open, no prompt → chapter 6
//   before-mazu  — 九曲巷 visited before 天后宮: the 半邊井 start strip is inert; talking to 井邊阿婆 later starts it
//   fubo-buy     — after the unmasking without a 牛舌餅: 福伯 asks → 牛舌餅阿嬸 gives one → 心燈. Then the inn warning
//                  names 雲歸的蕈譜 (憶蕈 still unpicked, ch3 carry-over) and counts the never-started 半邊井;
//                  「再等等」 holds; after 憶蕈 the warning only counts 半邊井; 「繼續」 → chapter 6
//   inn-skip-fubo — straight to the inn after the unmasking: warning counts 福伯 + 半邊井; going on loses 福伯 cleanly
// Prints PASS/FAIL per quest at the end; exit 1 on any failure.
'use strict';
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const argv = process.argv.slice(2);
const VERBOSE = argv.includes('-v');
const ONLY = argv.filter((a) => !a.startsWith('-'));

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /AudioContext/, /willReadFrequently/];
const FOREIGN = /js\/maps\/ch(?!5_)\d+_[a-z]+\.js/;
const ART_WARN = /\[shorelight\]|missing sprite|unknown song|unknown item|no actor/;
const CATS = 'mochi_joined,yuyuan_joined';
// main-story state right after the unmasking (no side-quest flags)
const POST_BOSS = [CATS, 'ch5_start', 'ch5_gate', 'ch5_mazu', 'ch5_alley', 'ch5_lamp', 'ch5_rabbit', 'ch5_enter', 'ch5_mem1', 'ch5_mem2',
  'ch5_trunk', 'ch5_hall_intro', 'ch5_lamp_seat', 'ch5_mirrors', 'ch5_boss', 'ch5_unmask', 'ev_luo_1f_c5_l1_intro', 'ev_luo_gate_c5_gate_enter'].join(',');

const quests = {};   // quest name → { ok, notes[] }
function q(name) { return (quests[name] = quests[name] || { ok: true, checks: 0, fails: [] }); }

class Run {
  constructor(name, browser) { this.name = name; this.browser = browser; this.errors = []; this.foreign = []; this.checks = 0; this.fails = []; this.quest = 'general'; }
  async open(query) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 } });
    await this.ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') });
    await this.ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false, lang: 'zh', music: 0, sfx: 0 })); } catch (e) { /* ignore */ } });
    this.page = await this.ctx.newPage();
    this.page.on('console', (m) => {
      const t = m.text();
      if (IGNORE.some((r) => r.test(t))) return;
      const where = (m.location && m.location() && m.location().url) || '';
      if (m.type() === 'error') { if (FOREIGN.test(t) || (FOREIGN.test(where) && !/ch5_lukang/.test(t))) this.foreign.push(t.slice(0, 200)); else this.errors.push('console.error: ' + t.slice(0, 600)); }
      else if (m.type() === 'warning' && ART_WARN.test(t)) this.errors.push('warning: ' + t.slice(0, 300));
    });
    this.page.on('pageerror', (e) => {
      const st = String(e.stack || e.message);
      if (FOREIGN.test(st) && !/ch5_lukang/.test(st)) this.foreign.push('pageerror: ' + e.message);
      else this.errors.push('pageerror: ' + st.slice(0, 600));
    });
    await this.page.goto(BASE + query);
    await this.page.waitForFunction(() => window.G && G.Debug && G.Scenes, null, { timeout: 30000 });
    await this.ev(() => { G.Debug.setAutoplay(true); G.settings.lang = 'zh'; });
  }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  for(name) { this.quest = name; q(name); }
  check(cond, msg) {
    this.checks++; const Q = q(this.quest); Q.checks++;
    if (!cond) { this.fails.push(msg); Q.ok = false; Q.fails.push(`[${this.name}] ${msg}`); console.log(`    ✗ ${msg}`); } else if (VERBOSE) console.log(`    ✓ ${msg}`);
  }
  async idle(timeout = 240000) {
    const t0 = Date.now();
    for (;;) {
      const ok = await this.ev((ms) => G.Debug.idle(ms), Math.max(1000, timeout - (Date.now() - t0)));
      if (ok === 'gameover') throw new Error('GAME OVER');
      if (!ok) throw new Error('timed out waiting for idle: ' + await this.ev(() => JSON.stringify({ busy: G.Script.busy(), map: G.mapScene && G.mapScene.def.id, stack: G.Scenes.stack.map((x) => x.constructor && x.constructor.name) })));
      await this.page.waitForTimeout(300);
      if (await this.ev(() => G.Debug.idleNow())) break;
      if (Date.now() - t0 > timeout) throw new Error('timed out (flapping idle)');
    }
  }
  choices(list) { return this.ev((l) => { G.Debug.choices = l.slice(); }, list); }
  async step(x, y) { await this.ev(([a, b]) => G.Debug.stepOn(a, b), [x, y]); await this.page.waitForTimeout(80); await this.idle(); }
  async talk(id) { await this.ev((n) => G.Debug.talk(n), id); await this.idle(); }
  // stand on (x, y) facing dir and press Z: proves the action spot is usable from a walkable cell
  async act(x, y, dir, evId) {
    const ok = await this.ev(([a, b, d, id]) => new Promise((res) => {
      const m = G.mapScene; m.player.setCell(a, b); m.player.dir = d; G.state.dir = d;
      setTimeout(() => {
        const it = m.interactTarget;
        if (!it || it.kind !== 'event' || it.ev.id !== id) { res(it ? it.kind + ':' + (it.ev && it.ev.id) : 'nothing'); return; }
        m.doInteract(); res(true);
      }, 120);
    }), [x, y, dir, evId]);
    await this.idle();
    return ok;
  }
  async openChest(id) {
    const ok = await this.ev((cid) => {
      const m = G.mapScene;
      const o = m.objects.find((ob) => ob.t === 'chest' && ob.chest && ob.chest.id === cid && m.objActive(ob));
      if (!o || o.open) return false;
      m.openChest(o); return true;
    }, id);
    await this.idle(); return ok;
  }
  flag(k) { return this.ev((f) => !!G.state.flags[f], k); }
  map() { return this.ev(() => G.mapScene && G.mapScene.def.id); }
  stage(id) { return this.ev((i) => G.Quests.stage(i), id); }
  done(id) { return this.ev((i) => G.Quests.isDone(i), id); }
  item(id) { return this.ev((i) => G.Inv.count(i), id); }
  lantern(id) { return this.ev((l) => G.Lanterns.has(l), id); }
  objective() { return this.ev(() => G.state.vars.objective || ''); }
  npc(id) { return this.ev((i) => !!G.mapScene.npcs.find((n) => n.id === i), id); }
  dlog() { return this.ev(() => (G.Debug.log || []).filter((l) => /pointOfNoReturn/.test(l))); }
  async finish() {
    const le = await this.ev(() => G.lastError && String(G.lastError.stack || G.lastError)).catch(() => null);
    if (le) this.errors.push('G.lastError: ' + le.slice(0, 600));
    if (this.ctx) await this.ctx.close();
  }
}

let failures = 0;
const sessions = [];
async function session(name, browser, fn) {
  if (ONLY.length && !ONLY.some((w) => name.includes(w))) return;
  const r = new Run(name, browser);
  const t0 = Date.now();
  console.log(`\n▶ ${name}`);
  try { await fn(r); } catch (e) { r.check(false, 'exception: ' + (e && e.message || e)); }
  await r.finish().catch(() => {});
  if (r.errors.length) { r.for('general'); r.check(false, `${r.errors.length} console/page error(s)`); }
  for (const e of r.errors) console.log('    ! ' + e);
  if (r.foreign.length) console.log(`    (ignored ${r.foreign.length} error(s) from other chapters' files)`);
  const ok = !r.fails.length;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}: ${r.checks - r.fails.length}/${r.checks} checks, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  sessions.push({ name, ok });
}

// ---- shared main-path segments (as a player would play them) ------------------------------------------------
async function toLukang(r) {
  await r.open('?debug&startch=5');
  await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'lukang', null, { timeout: 60000 });
  await r.idle();
}
async function gateAndMazu(r) {
  await r.step(27, 41);                 // 洛家大門 (first visit)
  await r.step(9, 13);
  await r.choices([0]);
  await r.step(27, 6);                  // 天后宮
  await r.step(11, 17);
}

// ------------------------------------------------------------------------------------------------ chain
async function chain(r) {
  await toLukang(r);
  await gateAndMazu(r);
  // ---- 半邊井
  r.for('半邊井');
  await r.step(55, 9);                  // 九曲巷
  await r.step(3, 3);                   // 摸乳巷 scene → the party lands in the 曬衣 courtyard
  r.check(await r.map() === 'lukang_jiuqu', 'in 九曲巷');
  for (const [x, y] of [[12, 17], [13, 17], [14, 17], [15, 17]]) await r.step(x, y);   // east, towards the lantern shop
  r.check(await r.stage('q_halfwell') === 0, 'walking east through the 半邊井 square starts the quest');
  r.check(/王少爺|王家側門/.test(await r.objective()), 'objective points at 王少爺 / 王家側門');
  await r.step(21, 16);
  await r.step(21, 15);                 // 王家側門
  r.check(await r.map() === 'lukang_wang', 'side door opens once the quest is known');
  await r.choices([1]);
  await r.talk('lk_wang');
  r.check(await r.stage('q_halfwell') === 0, 'answer 「那封吧」 does not advance (can retry)');
  await r.choices([0]);
  await r.talk('lk_wang');
  r.check(await r.stage('q_halfwell') === 1, '王少爺 → stage 1 (ask the neighbours)');
  const st1 = await r.ev(() => G.Data.quests.q_halfwell.stages[1]);
  r.check(/不見天/.test(st1) && /土地公/.test(st1), 'stage-1 log text says where the pastry auntie and the watchman are');
  await r.step(10, 9);
  await r.talk('lk_granny_well');
  r.check(await r.item('c5_wang_bucket') === 1, '井邊阿婆 → 王字水桶');
  await r.talk('lk_watchman');
  r.check(await r.flag('ch5_well_gong'), '打更阿福伯 will beat the gong');
  await r.step(0, 3);
  await r.talk('lk_niushe');
  r.check(await r.item('c5_old_ledger') === 1, '牛舌餅阿嬸 → 舊帳本');
  r.check(await r.stage('q_halfwell') === 2, 'stage 2: wait for night');
  r.check(/天黑/.test(await r.objective()), 'objective says to come back after dark');
  // main: 施家燈籠舖 → night
  await r.step(55, 9);
  await r.step(27, 22);
  r.check(await r.ev(() => G.state.vars.ch5_time) === 2, 'night falls after the lantern shop');
  await r.step(6, 9);                    // back out into 九曲巷 → the night scene runs on its own
  r.check(await r.done('q_halfwell'), 'q_halfwell done (log entry closed)');
  r.check(await r.lantern('lantern_halfwell'), '心燈 lantern_halfwell lit');
  r.check(await r.item('c5_halfwell') === 3, 'reward 半邊井水 ×3');
  r.check(await r.item('c5_wang_bucket') === 0 && await r.item('c5_old_ledger') === 0, 'bucket & ledger handed over');
  r.check(!(await r.npc('lk_mason')), 'the mason is gone, the well stays open');
  await r.step(0, 3);
  // ---- 洛家古厝 → 憶蕈
  r.for('憶蕈 (雲歸的蕈譜)');
  await r.step(27, 41);
  r.check(await r.map() === 'luo_1f', 'entered 洛家古厝');
  r.check(await r.ev(() => G.mapScene.objects.some((o) => o.t === 'mushroom_glow' && o.x === 11 && o.y === 4 && G.mapScene.objActive(o))), 'a glowing mushroom marks the spot in the 後院');
  r.check(await r.ev(() => { const e = G.mapScene.def.events.find((x) => x.id === 'c5_mush'); return !!(e && e.hint); }), '憶蕈 spot has a hint tag');
  r.check((await r.act(11, 5, 'up', 'c5_mush')) === true, 'face the mushroom from the south and press Z');
  r.check(await r.flag('mush_ch5'), '憶蕈 found (mush_ch5)');
  r.check(await r.ev(() => !!G.state.quests.q_tuanzi_mush && G.Quests.stage('q_tuanzi_mush') === 9), 'q_tuanzi_mush started/advanced (stage 9) even without ch3');
  r.check(await r.ev(() => G.state.vars.tuanzi_mush >= 1), 'tuanzi_mush counter +1');
  // ---- rest of the house (main story)
  r.for('福伯');
  await r.ev(() => G.Debug.trigger('c5_mem1')); await r.idle();
  await r.ev(() => G.Debug.trigger('c5_mem2')); await r.idle();
  r.check(await r.openChest('c5_07'), 'chest c5_07 in 福伯\'s room (牛舌餅 ×3)');
  await r.step(36, 8);
  await r.ev(() => G.Debug.trigger('c5_trunk')); await r.idle();
  await r.step(16, 8);
  await r.choices([0]); await r.ev(() => G.Debug.trigger('c5_lampseat')); await r.idle();
  await r.ev(() => { for (const e of G.mapScene.enemies) e.stun = 9999; });
  for (const m of ['c5_m1', 'c5_m2', 'c5_m3', 'c5_m4']) { await r.ev((id) => G.Debug.trigger(id), m); await r.idle(); }
  for (const m of ['c5_m1', 'c5_m2', 'c5_m3', 'c5_m4']) { await r.choices([0]); await r.ev((id) => G.Debug.trigger(id), m); await r.idle(); }
  r.check(await r.flag('ch5_mirrors'), '(main) mirror puzzle solved');
  // 怨宴 is tuned for 施家鐵舖 gear (docs/BALANCE.md); the test skips the shops, so equip it + level margin
  await r.ev(() => {
    const W = { xinghe: 'sw_bailian', baizhi: 'fl_diaohua', hongying: 'c5_sp_steel', yungui: 'fn_zhusha' };
    for (const id in W) Object.assign(G.state.members[id].equip, { weapon: W[id], armor: 'ar_brocade', head: 'c5_hd_warmhat', feet: 'ft_lupi' });
    for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) G.Story.ensureLevel(id, 21);
    G.Party.healAll();
  });
  await r.step(29, 11);
  await r.ev(() => G.Debug.stepOn(19, 15));
  await r.page.waitForTimeout(300);
  await r.idle(900000);
  r.check(await r.flag('ch5_unmask'), '(main) 怨宴 beaten, unmasked');
  r.check(/福伯/.test(await r.objective()), 'objective: back to the gate, tell 福伯');
  await r.step(29, 11);
  await r.step(19, 28);
  r.check(await r.map() === 'luo_gate', 'at the gate');
  r.check(await r.ev(() => !!G.state.quests.q_fubo), 'q_fubo started at the gate');
  r.check(await r.done('q_fubo'), 'q_fubo done (carried 牛舌餅 handed over at once)');
  r.check(await r.lantern('lantern_fubo'), '心燈 lantern_fubo lit');
  r.check(await r.item('c5_fubo_pipe') === 1, 'reward 福伯的煙斗');
  // ---- inn: everything done → no prompt → chapter 6
  r.for('inn (point of no return)');
  await r.step(9, 13);
  await r.ev(() => { G.Debug.log.length = 0; G.Debug.stepOn(49, 13); });
  await r.page.waitForFunction(() => (G.state.flags.ch5_done && G.state.chapter === 6) || G.lastError, null, { timeout: 400000 });
  await r.page.waitForTimeout(1000);
  const log = await r.dlog();
  r.check(log.some((l) => /nothing open/.test(l)), 'inn: nothing open → no warning (' + log.join(' | ') + ')');
  r.check(await r.ev(() => G.state.chapter) === 6, 'chapter 6 reached');
}

// ------------------------------------------------------------------------------------------------ before-mazu
async function beforeMazu(r) {
  r.for('半邊井');
  await toLukang(r);
  await r.step(55, 9);                  // straight to 九曲巷, before 天后宮
  await r.step(3, 3);
  for (const [x, y] of [[12, 17], [13, 17], [14, 17], [15, 17]]) await r.step(x, y);
  r.check(await r.stage('q_halfwell') < 0, 'no quest before 天后宮 (the mason only starts work that evening)');
  await r.step(0, 3);
  await gateAndMazu(r);
  await r.step(55, 9);
  // back in through the long straight alley: never crosses the start strip
  await r.step(10, 3); await r.step(31, 3);
  r.check(await r.stage('q_halfwell') < 0, 'long-alley route does not pass the start strip');
  // a player who notices the well later: talking to the granny (or the mason) starts it
  await r.ev(() => G.mapScene.player.setCell(17, 18));
  await r.talk('lk_granny_well');
  r.check(await r.stage('q_halfwell') === 0, 'talking to 井邊阿婆 starts 半邊井');
}

// ------------------------------------------------------------------------------------------------ fubo-buy + inn
async function fuboBuy(r) {
  r.for('福伯');
  await r.open(`?debug&map=lukang&x=27&y=39&lv=19&chapter=5&flags=${POST_BOSS}`);
  await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'lukang', null, { timeout: 60000 });
  // main-story state: night after the boss; ch3 carry-over: 杉皮蕈 found → the 蕈譜 points at this chapter's 憶蕈
  await r.ev(() => { G.state.vars.ch5_time = 2; G.Inv.remove('niushebing', 99); G.state.flags.mush_1 = true; G.Quests.set('q_tuanzi_mush', 4); });
  await r.idle();
  await r.step(27, 41);
  r.check(await r.stage('q_fubo') === 0 && !(await r.flag('ch5_fubo_done')), '福伯 asks for a 牛舌餅');
  r.check(/牛舌餅/.test(await r.objective()) && /不見天/.test(await r.objective()), 'objective names the 牛舌餅 and 不見天街');
  await r.talk('fubo');
  await r.step(9, 13);
  await r.talk('lk_niushe');
  r.check(await r.item('niushebing') === 1 && await r.stage('q_fubo') === 1, '牛舌餅阿嬸 gives one for 福伯 (stage 1)');
  await r.step(27, 41);
  await r.talk('fubo');
  r.check(await r.done('q_fubo') && await r.lantern('lantern_fubo'), 'q_fubo done, 心燈 lantern_fubo');
  r.check(await r.item('c5_fubo_pipe') === 1 && await r.item('c5_luo_key') === 1, 'rewards 福伯的煙斗 + 洛家大門鑰匙');
  // ---- inn warning
  r.for('inn (point of no return)');
  await r.step(9, 13);
  await r.ev(() => { G.Debug.log.length = 0; });
  await r.choices(['再等等']);
  await r.step(49, 13);
  let log = await r.dlog();
  r.check(log.some((l) => /q_tuanzi_mush/.test(l)), 'warning names 雲歸的蕈譜 while 憶蕈 is unpicked (' + log.join(' | ') + ')');
  r.check(log.some((l) => /lantern_halfwell/.test(l)), 'warning counts the never-started 半邊井 心燈');
  r.check(!(await r.flag('ch5_noodles')) && await r.map() === 'lukang_inn', '「再等等」 keeps the night going');
  r.for('憶蕈 (雲歸的蕈譜)');
  await r.step(6, 9);
  await r.step(27, 41);
  await r.step(9, 5);
  r.check(await r.map() === 'luo_1f', 'back inside 洛家古厝 after the boss');
  r.check((await r.act(11, 5, 'up', 'c5_mush')) === true, '憶蕈 can still be picked after the boss');
  r.check(await r.flag('mush_ch5') && await r.stage('q_tuanzi_mush') === 9, '憶蕈 → 蕈譜 stage 9');
  r.for('inn (point of no return)');
  await r.step(19, 28);
  await r.step(9, 13);
  await r.ev(() => { G.Debug.log.length = 0; G.Debug.choices = []; G.Debug.stepOn(49, 13); });
  await r.page.waitForFunction(() => (G.state.flags.ch5_done && G.state.chapter === 6) || G.lastError, null, { timeout: 400000 });
  log = await r.dlog();
  r.check(log.some((l) => /open: lantern_halfwell$/.test(l)) && log.some((l) => /continue/.test(l)), 'second warning: only 半邊井 counted, 「繼續」 goes on (' + log.join(' | ') + ')');
  r.check(await r.ev(() => G.state.chapter) === 6, 'chapter 6 reached');
}

// ------------------------------------------------------------------------------------------------ inn-skip-fubo
// a player who goes straight to the inn after the unmasking (never back to the gate): 蔡頭家 still lets them rest,
// so the warning must count 福伯's 心燈; going on anyway must not leave 福伯 standing in the 冬至 cutscene
async function innSkipFubo(r) {
  r.for('inn (point of no return)');
  await r.open(`?debug&map=lukang&x=49&y=14&lv=19&chapter=5&flags=${POST_BOSS},mush_ch5`);
  await r.page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'lukang', null, { timeout: 60000 });
  await r.ev(() => { G.state.vars.ch5_time = 2; });
  await r.idle();
  await r.step(49, 13);
  r.check(await r.map() === 'lukang_inn', 'in the inn');
  await r.ev(() => { G.Debug.log.length = 0; });
  await r.choices(['再等等']);
  await r.talk('lk_innkeeper');
  let log = await r.dlog();
  r.check(log.some((l) => /lantern_fubo/.test(l) && /lantern_halfwell/.test(l)), 'warning counts 福伯 and 半邊井 (' + log.join(' | ') + ')');
  r.check(!(await r.flag('ch5_noodles')), '「再等等」 holds');
  await r.ev(() => {
    window.__fuboSeen = false;
    window.__fuboIv = setInterval(() => { const m = G.mapScene; if (m && m.def.id === 'luo_gate' && m.npcs.some((n) => n.id === 'fubo')) window.__fuboSeen = true; }, 50);
  });
  await r.ev(() => { G.Debug.choices = []; G.Debug.talk('lk_innkeeper'); });
  await r.page.waitForFunction(() => (G.state.flags.ch5_done && G.state.chapter === 6) || G.lastError, null, { timeout: 400000 });
  r.check(await r.ev(() => G.state.chapter) === 6, '「繼續」 → chapter 6');
  r.check(!(await r.ev(() => window.__fuboSeen)), '福伯 does not appear at the gate during the 冬至 cutscene');
  r.check(!(await r.lantern('lantern_fubo')), '福伯\'s 心燈 lost (as warned)');
}

(async () => {
  const browser = await chromium.launch();
  const t0 = Date.now();
  await session('chain', browser, chain);
  await session('before-mazu', browser, beforeMazu);
  await session('fubo-buy', browser, fuboBuy);
  await session('inn-skip-fubo', browser, innSkipFubo);
  await browser.close();
  console.log('\n──────── ch5 side quests ────────');
  for (const [name, Q] of Object.entries(quests)) {
    if (!Q.checks) continue;
    console.log(`${Q.ok ? 'PASS' : 'FAIL'}  ${name}  (${Q.checks - Q.fails.length}/${Q.checks})`);
    for (const f of Q.fails) console.log('        ' + f);
  }
  console.log(`${failures ? 'FAIL' : 'PASS'}: ${sessions.length - failures}/${sessions.length} sessions in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(failures ? 1 : 0);
})();

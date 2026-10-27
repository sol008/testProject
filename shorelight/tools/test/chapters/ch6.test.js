#!/usr/bin/env node
// Chapter 6 《府城長明》 automated playthrough (Playwright + Chromium against file://…/index.html).
//
//   node tools/test/chapters/ch6.test.js                 # everything
//   node tools/test/chapters/ch6.test.js --only main,ayi # tests whose id contains one of the words
//   node tools/test/chapters/ch6.test.js --shots <dir>   # also write map screenshots (2D canvas) to <dir>
//   node tools/test/chapters/ch6.test.js --only main --from linto   # resume the critical path at a segment
//     segments: yanshui, fucheng, linto, stealth, finale
//   node tools/test/chapters/ch6.test.js --headed
//
// Story/side-quest tests run with the 2D renderer (deterministic & fast: game logic is fast-forwarded with a fixed
// dt, like tools/test/e2e.js); the `maps3d` test builds every chapter-6 map with the 3D view (?r3lite).
// A test fails on assertion errors, page errors, console errors (ERR_FILE_NOT_FOUND ignored), G.lastError, or
// missing-art warnings. Errors raised by OTHER chapter files that are still being written are reported as notes.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : d; };
const ONLY = opt('only', '') ? String(opt('only')).split(',') : null;
const SHOTS = opt('shots', '') || null;
const HEADED = argv.includes('--headed');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const MAPS = ['yanshui_road', 'yanshui', 'yanshui_temple', 'yanshui_inn', 'fucheng', 'fc_chikan', 'fc_mazu', 'fc_confucius', 'fc_qiniang', 'fc_zheng',
  'fc_inn', 'fc_shop', 'fc_herb', 'linto', 'palace_dock', 'palace_hall', 'palace_study', 'palace_lanterns', 'north_dunes', 'sugarcane_night'];
// flags that silence every auto/touch story event, used by the NPC sweep
const QUIET = 'ch6_start,ch6_arrive_ys,ch6_yanshui,ch6_night,ch6_beehive,ch6_fucheng,ch6_fc_arrive,ch6_moya,ch6_sixteen,ch6_rouzong,ch6_chikan,ch6_linto_in,ch6_yuelao,' +
  'ch6_s1_tut,ch6_s2_in,ch6_s3_in,ch6_yexuan_met,ch6_ship,ch6_done,ch6_infiltrate,ch6_queue_bz,ch6_yuanxiao_bz,ch6_scholar';

// ------------------------------------------------------------------ in-page helpers (installed before the game loads)
const INIT = () => {
  try {
    const q = location.search;
    const s = JSON.parse(localStorage.getItem('shorelight_settings') || '{}');
    s.lang = 'zh';
    if (/[?&]qa2d\b/.test(q)) s.render3d = false;
    localStorage.setItem('shorelight_settings', JSON.stringify(s));
  } catch (e) { /* ignore */ }
  window.__qa = {
    errs: [], warns: [],
    async ff(sec, o = {}) {
      const dt = o.dt || 0.05, steps = Math.ceil(sec / dt), drawEvery = o.drawEvery || 6;
      const ch = new MessageChannel();
      const yieldNow = () => new Promise((r) => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
      for (let i = 0; i < steps; i++) {
        try {
          G.time += dt;
          G.Input.update(dt); G.Timers.update(dt); G.Tweens.update(dt); G.Render.updateFx(dt); G.UI.updateToasts(dt);
          G.Scenes.update(dt);
          if (G.state && G.inGame) G.state.playtime += dt;
          if (i % drawEvery === 0) {
            const ctx = G.ctx;
            G.Render.begin(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H);
            G.Scenes.draw(ctx); G.UI.drawToasts(ctx); G.Render.drawOverlays();
          }
          G.Input.endFrame();
        } catch (e) { G.lastError = e; this.errs.push('ff step: ' + (e && e.stack || e)); if (this.errs.length > 40) return; }
        await yieldNow();
      }
    },
    idle() { const top = G.Scenes.top(); return !G.Script.busy() && top === G.mapScene && G.Render.fade.a < 0.05; },
    top() {
      const t = G.Scenes.top();
      if (!t) return null;
      if (G.GameOverScene && t instanceof G.GameOverScene) return 'GameOverScene';
      if (G.Battle && t instanceof G.Battle.Scene) return 'BattleScene';
      return (t.constructor && t.constructor.name) || 'anonymous';
    },
    grab() {
      const ctx = G.ctx; G.Render.begin(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, G.W, G.H);
      G.Scenes.draw(ctx); G.UI.drawToasts(ctx); G.Render.drawOverlays();
      return G.canvas.toDataURL('image/png');
    },
  };
  window.addEventListener('error', (e) => window.__qa.errs.push('window.onerror: ' + (e.error && e.error.stack || e.message) + ' @' + (e.filename || '')));
  window.addEventListener('unhandledrejection', (e) => window.__qa.errs.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)));
  const iv = setInterval(() => { if (window.G && G.Debug && G.Debug.setAutoplay) { G.Debug.setAutoplay(true); clearInterval(iv); } }, 2);
};

// errors from other chapter files that are still in progress are noted, not counted
const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/, /AudioContext/, /GL Driver Message/, /GPU stall/, /THREE\.WebGL/];
const FOREIGN = /js\/maps\/ch(?!6_)[0-9]+_\w+\.js|js\/i18n\//;

class Session {
  constructor(browser) { this.browser = browser; this.errors = []; this.notes = []; }
  async open(query, waitMap = true) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await this.ctx.addInitScript(INIT);
    await this.ctx.addInitScript({ path: path.join(ROOT, 'tools', 'test', 'lib', 'battlebot.js') }); // battle bot + easy: bosses are tuned for a player, not the auto-battle (docs/BALANCE.md)
    this.page = await this.ctx.newPage();
    this.page.setDefaultTimeout(600000);
    this.page.on('console', (m) => {
      const t = m.text();
      if (IGNORE.some((r) => r.test(t))) return;
      const loc = m.location && m.location();
      const where = loc && loc.url ? loc.url : '';
      if (m.type() === 'error') (FOREIGN.test(where) || FOREIGN.test(t) ? this.notes : this.errors).push('console.error: ' + t.slice(0, 600));
      else if (m.type() === 'warning' && /missing|\[shorelight\]/i.test(t)) (FOREIGN.test(t) ? this.notes : this.errors).push('warning: ' + t.slice(0, 400));
    });
    this.page.on('pageerror', (e) => {
      const st = (e.stack || e.message || '');
      (FOREIGN.test(st) || /Unexpected end of input|Unexpected token/.test(e.message) && !/ch6_tainan/.test(st) ? this.notes : this.errors).push('pageerror: ' + st.slice(0, 600));
    });
    await this.page.goto(BASE + query);
    await this.page.waitForFunction(() => window.G && G.Scenes && G.Scenes.top(), null, { timeout: 300000 });
    if (waitMap) { await this.until('G.mapScene && G.mapScene.def && G.Scenes.top() === G.mapScene', 120); await this.pets(); }
  }
  // the silent pets 芋圓 & 麻糬 have followed since chapter 1
  async pets() { await this.ev(() => { G.state.flags.mochi_joined = true; G.state.flags.yuyuan_joined = true; if (G.mapScene) G.mapScene.refresh(); }); }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  ff(sec) { return this.page.evaluate((s) => __qa.ff(s), sec); }
  async until(cond, maxSec = 120, step = 0.5) {
    const f = typeof cond === 'string' ? cond : `(${cond})()`;
    for (let t = 0; t <= maxSec; t += step) {
      const ok = await this.page.evaluate((c) => { try { return !!eval(c); } catch (e) { return false; } }, f);
      if (ok) return true;
      const top = await this.ev(() => __qa.top());
      if (top === 'GameOverScene') throw new Error('Game Over while waiting for: ' + f);
      await this.ff(step);
    }
    throw new Error(`timeout (${maxSec}s game time) waiting for: ${f}; top=${await this.ev(() => __qa.top())} map=${await this.ev(() => G.mapScene && G.mapScene.def.id)}`);
  }
  async idle(maxSec = 240) { await this.ff(0.3); await this.until('__qa.idle()', maxSec); }
  async step(x, y) { await this.ev(([x, y]) => G.Debug.stepOn(x, y), [x, y]); await this.idle(); }
  async talk(id, choices) { await this.ev(([id, c]) => { G.Debug.choices = c || []; G.Debug.talk(id); }, [id, choices]); await this.idle(); }
  async trigger(id) { await this.ev((id) => { G.Debug.trigger(id); }, id); await this.idle(); }
  async run(body) { await this.ev((b) => { G.Script.run(new Function('S', 'return (' + b + ')(S)')); }, body); await this.idle(); }
  map() { return this.ev(() => G.mapScene && G.mapScene.def.id); }
  flags(...ks) { return this.ev((ks) => ks.map((k) => !!G.state.flags[k]), ks); }
  async shot(name) {
    if (!SHOTS) return;
    const url = await this.ev(() => __qa.grab());
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
  }
  // make the stealth maps safe to walk through (critical path only — the stealth rules have their own tests)
  async noGuards() {
    await this.ev(() => {
      const m = G.mapScene;
      if (m.def.stealth && !m.c6) G.Mapx.c6Stealth.init(m);
      m.npcs = m.npcs.filter((n) => !n.guard);
      m.enemies = [];
    });
  }
  // the debug party starts in its starting gear; give it what a player would own by now (shop stock of ch5–6)
  async gear() {
    await this.ev(() => {
      const kit = { xinghe: ['sw_qixing', 'c6_brocade_m'], baizhi: ['fl_baiyu', 'c6_brocade_f'], hongying: ['sp_qilin', 'c6_brocade_f'], yungui: ['fn_qixing', 'c6_brocade_m'] };
      for (const id in kit) {
        if (!G.state.members[id]) continue;
        for (const it of kit[id].concat(['hd_yuguan', 'ft_lupi'])) { G.Inv.add(it, 1); G.Party.equip(id, G.Data.items[it].type, it); }
      }
      G.Inv.add('xumingsan', 6); G.Inv.add('huanhunxiang', 4); G.Party.healAll();
    });
  }
  async drain() {
    const e = await this.page.evaluate(() => { const r = __qa.errs.slice(); __qa.errs.length = 0; const le = G && G.lastError; if (G) G.lastError = null; return { r, le: le ? String(le.stack || le) : null }; }).catch(() => ({ r: [], le: null }));
    for (const x of e.r) (FOREIGN.test(x) && !/ch6_tainan/.test(x) ? this.notes : this.errors).push(x);
    if (e.le) (FOREIGN.test(e.le) && !/ch6_tainan/.test(e.le) ? this.notes : this.errors).push('G.lastError: ' + e.le.slice(0, 600));
  }
  async close() { if (this.ctx) await this.ctx.close().catch(() => {}); }
}

const assert = (c, msg) => { if (!c) throw new Error('assert: ' + msg); };
const tests = [];
const test = (id, name, fn) => tests.push({ id, name, fn });

// ------------------------------------------------------------------ the critical path (resumable segments)
// `--from <segment>` starts at that segment from a debug save-point (map + flags) and plays to the end;
// `--only main` with no --from plays everything from ?debug&startch=6.
const F_BEEHIVE = 'ch6_start,ch6_arrive_ys,ch6_yanshui,ch6_night,ch6_beehive';
const F_ROUZONG = F_BEEHIVE + ',ch6_fucheng,ch6_fc_arrive,ch6_moya,ch6_sixteen,ch6_rouzong';
const F_GATE = F_ROUZONG + ',ch6_linto_in,ch6_linto_done,ch6_infiltrate,ch6_s1_tut';
const F_LETTER = F_GATE + ',ch6_s2_in,ch6_s3_in,ch6_s3_open,ch6_qingxu_letter';
const SEGMENTS = [
  { id: 'yanshui', start: '?debug&qa2d&startch=6', vars: {}, run: async (s) => {
    await s.idle(120);
    assert(await s.map() === 'yanshui', 'intro ends in 鹽水 (map ' + await s.map() + ')');
    assert((await s.flags('ch6_start', 'ch6_arrive_ys')).every(Boolean), 'intro flags');
    assert(await s.ev(() => G.state.chapter === 6 && G.state.party.join(',') === 'xinghe,baizhi,hongying,yungui'), 'chapter 6 party');
    await s.shot('main_01_yanshui');
    await s.step(21, 6);
    assert(await s.map() === 'yanshui_temple' && (await s.flags('ch6_yanshui'))[0], '3-2 temple');
    await s.talk('ys_keeper', ['開始吧']);
    assert((await s.flags('ch6_night', 'ch6_beehive')).every(Boolean), '3-3 beehive night done');
    assert(await s.ev(() => G.state.inv.fengpao > 0), '疫聚 dropped 蜂炮');
    await s.shot('main_02_beehive_after');
    await s.run(`async (S) => { await S.warp('yanshui_inn', 6, 8, 'up'); }`);
  } },
  { id: 'fucheng', start: '?debug&qa2d&map=yanshui_inn&lv=21&chapter=6&flags=' + F_BEEHIVE, vars: {}, run: async (s) => {
    await s.talk('ys_innkeeper', ['休息到天亮']);
    assert(await s.map() === 'fucheng' && (await s.flags('ch6_fucheng', 'ch6_fc_arrive')).every(Boolean), '3-4 arrive 府城');
    await s.step(5, 10);
    assert((await s.flags('ch6_moya'))[0] && await s.map() === 'fucheng', '3-5 墨鴉');
    await s.shot('main_03_fucheng');
    await s.step(26, 13);
    assert(await s.map() === 'fc_qiniang' && (await s.flags('ch6_sixteen'))[0], '3-6 做十六歲');
    assert(await s.ev(() => G.state.inv.c6_qiniang_rouge === 1 && G.state.inv.c6_sesame_chicken === 3), '3-6 rewards');
    await s.run(`async (S) => { await S.warp('fucheng', 21, 16, 'up'); }`);
    await s.step(21, 15);
    assert((await s.flags('ch6_rouzong'))[0] && await s.ev(() => G.state.vars.ch6_time === 1 && G.state.inv.c6_zheng_zongzi === 2), '3-7 肉粽伯');
    await s.run(`async (S) => { await S.warp('fucheng', 2, 40, 'left'); }`);
  } },
  { id: 'linto', start: '?debug&qa2d&map=fucheng&x=2&y=40&lv=21&chapter=6&flags=' + F_ROUZONG, vars: { ch6_time: 1 }, items: { c6_zheng_zongzi: 2 }, run: async (s) => {
    await s.step(0, 40);
    assert(await s.map() === 'linto' && (await s.flags('ch6_linto_in'))[0], '3-10 enter 林投林');
    await s.shot('main_04_linto');
    await s.ev(() => { G.mapScene.enemies = []; });
    await s.step(8, 29);
    assert(await s.ev(() => G.state.vars.ch6_linto_wrong === 1 && G.mapScene.player.x === 18 && G.mapScene.player.y === 32), 'dead end sends back to A');
    // 3-11 林投姐 — the party 「傾聽」 (defends) whenever she tells her story
    await s.ev(() => {
      window.__listen = setInterval(() => {
        const b = G.Scenes.top();
        if (b instanceof G.Battle.Scene && b.c6 && b.c6.listened && !b.__qa) {
          b.__qa = true;
          const ac = b.autoCommand.bind(b);
          b.autoCommand = (u) => (b.c6.window && !b.c6.listened.has(u.id) ? { kind: 'defend' } : ac(u));
        }
      }, 20);
    });
    await s.step(14, 9);
    await s.ev(() => clearInterval(window.__listen));
    assert((await s.flags('ch6_linto_done'))[0], '3-11 林投姐 resolved');
    assert(await s.ev(() => G.Lanterns.has('lantern_linto') && G.state.inv.c6_linto_comb === 1 && !G.state.inv.c6_zheng_zongzi), 'lantern_linto + 木梳, 肉粽 given');
    assert(await s.ev(() => (G.state.vars.ch6_listen || 0) >= 3 && G.state.flags.ch6_listen3 && G.state.inv.c6_zhaoniang_pin === 1), '傾聽 ≥3 → 昭娘的銀簪 (listen=' + await s.ev(() => G.state.vars.ch6_listen) + ')');
    assert(await s.ev(() => G.state.vars.ch6_time === 2), 'night falls');
    await s.step(34, 4);
    assert(await s.map() === 'palace_dock' && (await s.flags('ch6_infiltrate', 'ch6_s1_tut')).every(Boolean), '3-12 water gate → S1');
  } },
  { id: 'stealth', start: '?debug&qa2d&map=palace_dock&lv=22&chapter=6&flags=' + F_GATE, vars: { ch6_time: 2 }, run: async (s) => {
    await s.shot('main_05_palace_dock');
    await s.noGuards();
    await s.step(15, 1);
    assert(await s.map() === 'palace_hall', 'S1 → S2');
    await s.noGuards();
    await s.step(36, 1);
    assert(await s.map() === 'palace_study', 'S2 → S3');
    await s.noGuards();
    await s.ev(() => { const m = G.mapScene; const o = m.objects.find((x) => x.chest && x.chest.id === 'c6_10'); m.openChest(o); });
    await s.idle();
    assert(await s.ev(() => G.state.inv.c6_qingxu_gourd === 1), 'S3 影行箱 (清虛的舊葫蘆)');
    await s.trigger('shelf_2_6');
    assert(await s.ev(() => G.state.vars.ch6_s3_wrong === 1), 'wrong shelf counted');
    await s.trigger('shelf_2_9');
    await s.trigger('shelf_20_12');
    assert((await s.flags('ch6_s3_open', 'ch6_qingxu_letter'))[0] && await s.ev(() => G.state.inv.c6_qingxu_letter === 1), '3-13 letter');
  } },
  { id: 'finale', start: '?debug&qa2d&map=palace_study&x=12&y=3&lv=23&chapter=6&flags=' + F_LETTER, vars: { ch6_time: 2 }, run: async (s) => {
    await s.noGuards();
    await s.step(12, 2);
    await s.until('G.state.chapter === 7 && G.state.flags.ch6_done', 900);
    const f = await s.flags('ch6_yexuan_met', 'ch6_netherlamp', 'ch6_captured', 'ch6_ship', 'lyric_ch6', 'ch6_done', 'xinghe_gutter');
    assert(f.every(Boolean), 'ending flags ' + JSON.stringify(f));
    assert(await s.ev(() => !G.state.party.includes('baizhi') && !!G.state.members.baizhi && G.state.inv.key_jadetag >= 1), '白芷 left the party; 玉牌 kept');
    assert(await s.ev(() => G.Quests.isDone('q_ch6_main')), 'main quest done');
    assert(await s.ev(() => G.state.inv.c6_nether_wick === 1), '冥燈護法 dropped 冥燈殘芯');
  } },
];
const FROM = opt('from', '') || null;
test('main', '主線：startch=6 → 鹽水 → 蜂炮夜 → 府城 → 做十六歲 → 林投姐 → 潛行 → 萬燈閣 → 夜玄 → 第七章' + (FROM ? `（從 ${FROM} 開始）` : ''), async (s) => {
  let i = FROM ? SEGMENTS.findIndex((g) => g.id === FROM) : 0;
  assert(i >= 0, 'unknown segment ' + FROM + ' (' + SEGMENTS.map((g) => g.id).join(', ') + ')');
  const seg = SEGMENTS[i];
  if (i === 0) {
    await s.open(seg.start, false);
    await s.until('G.mapScene && G.mapScene.def', 120);
    await s.pets();
  } else {
    await s.open(seg.start);
    await s.ev(([v, it]) => { Object.assign(G.state.vars, v); for (const k in it || {}) G.Inv.add(k, it[k]); }, [seg.vars, seg.items]);
  }
  await s.gear();
  for (; i < SEGMENTS.length; i++) {
    console.log('    · segment ' + SEGMENTS[i].id);
    await SEGMENTS[i].run(s);
  }
});

// ------------------------------------------------------------------ side quests & optional scenes
test('ayi', '支線：轎夫阿義與母親（心燈 lantern_yanshui）', async (s) => {
  await s.open('?debug&qa2d&map=yanshui&lv=21&chapter=6&flags=ch6_start,ch6_arrive_ys,ch6_yanshui');
  await s.talk('ys_bearer');
  assert((await s.flags('ch6_ayi_met'))[0] && await s.ev(() => G.Quests.stage('q_yanshui_mother') === 0), 'step 1');
  await s.ev(() => { G.state.flags.ch6_night = true; G.state.flags.ch6_beehive = true; G.Mapx.goto('yanshui', 37, 30, 'up'); });
  await s.idle();
  await s.talk('ys_ayi_mother');
  assert((await s.flags('ch6_ayi_mother'))[0], 'step 2');
  await s.step(21, 20);
  assert((await s.flags('ch6_yanshui_done'))[0] && await s.ev(() => G.Lanterns.has('lantern_yanshui') && G.state.inv.c6_wumiao_charm === 1 && G.Quests.isDone('q_yanshui_mother')), 'step 3 → 心燈');
});

test('mush', '支線：雲歸的蕈譜・潮音蕈', async (s) => {
  await s.open('?debug&qa2d&map=linto&lv=21&chapter=6&flags=ch6_linto_in,mush_1');
  await s.ev(() => { G.mapScene.enemies = []; G.Script.S.vision(30); });
  await s.step(22, 21);
  assert((await s.flags('mush_ch6'))[0] && await s.ev(() => G.state.vars.tuanzi_mush === 1), '潮音蕈 recorded');
});

test('riddles', 'P1 赤崁樓燈謎（全對）', async (s) => {
  await s.open('?debug&qa2d&map=fc_chikan&lv=21&chapter=6&flags=ch6_chikan');
  await s.talk('fc_riddle', ['來猜', '告', '重', '茶', '思', '秦']);
  assert(await s.ev(() => G.state.vars.ch6_riddle_n === 5 && G.state.inv.c6_riddle_fan === 1 && G.state.inv.c6_wenchang_brush === 1), '5/5 + prizes');
});

test('yuelao', '3-8 大天后宮・月老（笑筊）', async (s) => {
  await s.open('?debug&qa2d&map=fc_mazu&lv=21&chapter=6');
  await s.step(17, 7);
  assert((await s.flags('ch6_yuelao'))[0] && await s.ev(() => G.state.inv.c6_red_thread === 1), '月老紅線');
});

test('stealth', '潛行規則：光暗視野、量表、大甕、芋圓搗蛋、煙火、傀儡定身、被抓 → 檢查點', async (s) => {
  await s.open('?debug&qa2d&map=palace_dock&lv=22&chapter=6&flags=ch6_s1_tut,ch6_infiltrate');
  await s.gear();
  await s.ff(0.5);
  const st = await s.ev(() => { const m = G.mapScene; return { c: !!m.c6, guards: m.npcs.filter((n) => n.guard).length, puppets: m.c6 && m.c6.puppets.length }; });
  assert(st.c && st.guards === 2 && st.puppets === 1, 'stealth init ' + JSON.stringify(st));
  // jar: hide and come out
  await s.ev(() => { const m = G.mapScene; m.player.setCell(4, 11); m.player.dir = 'up'; m.interactTarget = m.findInteract(); m.doInteract(); });
  await s.idle();
  assert(await s.ev(() => !!G.mapScene.c6.hide && !G.mapScene.player.visible), 'hidden in the jar');
  // fireworks mask
  await s.ev(() => { G.mapScene.c6.fw = 0.05; });
  await s.ff(0.3);
  assert(await s.ev(() => G.mapScene.c6.mask > 0), 'fireworks mask noise');
  await s.ev(() => { G.mapScene.c6.mask = 0; G.mapScene.c6.fw = 30; G.mapScene.player.setCell(4, 12); G.mapScene.player.visible = true; });
  await s.ff(0.2);
  // 芋圓 (F): runs ahead and makes noise near guard g1
  await s.ev(() => { const m = G.mapScene; const g = m.npcs.find((n) => n.id === 'g1'); g.setCell(8, 12); g.scripted = true; m.player.setCell(5, 12); m.player.dir = 'right'; G.Input._press('auto'); });
  await s.ff(1.5);
  assert(await s.ev(() => { const g = G.mapScene.npcs.find((n) => n.id === 'g1'); return g.c6.mode === 'suspect' || g.c6.mode === 'return'; }), '芋圓 noise makes the guard suspicious');
  // light vs dark view length
  assert(await s.ev(() => { const m = G.mapScene; m.player.setCell(9, 10); m.update(0.016); const g = m.npcs.find((n) => n.id === 'g2'); return g.def.view === 5; }), 'lit → view 5');
  assert(await s.ev(() => { const m = G.mapScene; m.player.setCell(26, 16); m.update(0.016); const g = m.npcs.find((n) => n.id === 'g2'); return g.def.view === 3; }), 'dark → view 3');
  // puppet: 定身符 from behind
  await s.ev(() => { const m = G.mapScene; m.player.setCell(15, 12); m.player.dir = 'up'; m.c6.puppets[0].dir = 'up'; });
  await s.trigger('pu_p1');
  assert(await s.ev(() => G.mapScene.c6.puppets[0].frozen > 0), 'puppet frozen');
  // caught: stand in a guard's face → fight → back at the checkpoint, guards reset
  await s.ev(() => { const m = G.mapScene; const g = m.npcs.find((n) => n.id === 'g2'); g.c6.mode = 'patrol'; g.scripted = false; g.setCell(22, 7); g.dir = 'right'; g.pauseT = 5; m.player.setCell(23, 7); });
  await s.until('__qa.top() === "BattleScene"', 20, 0.25);
  await s.idle(300);
  assert(await s.ev(() => G.mapScene.def.id === 'palace_dock' && G.mapScene.player.x === 4 && G.mapScene.player.y === 15 && G.state.vars.ch6_s1_spotted === false), 'back at the checkpoint (fresh attempt)');
  assert(await s.ev(() => { const g = G.mapScene.npcs.find((n) => n.id === 'g2'); return g && g.y === 7 && g.c6 && g.c6.mode === 'patrol' && g.c6.meter < 0.2; }), 'guards reset');
});

test('moya', '潛行 S2：被墨鴉抓到 → 墨鴉再戰（一次）', async (s) => {
  await s.open('?debug&qa2d&map=palace_hall&lv=23&chapter=6&flags=ch6_s2_in,ch6_infiltrate');
  await s.gear();
  await s.ff(0.5);
  await s.ev(() => { const m = G.mapScene; const g = m.npcs.find((n) => n.id === 'moya'); g.setCell(20, 25); g.dir = 'left'; g.pauseT = 5; m.player.setCell(19, 25); });
  await s.until('__qa.top() === "BattleScene"', 20, 0.25);
  await s.idle(300);
  assert((await s.flags('ch6_moya_fled'))[0] && await s.ev(() => !G.mapScene.npcs.some((n) => n.id === 'moya') && G.state.inv.c6_crow_feather === 1), '墨鴉 fled, 黑鴉羽 dropped');
});

test('lose', '3-15 夜玄：強制敗北戰不會 Game Over', async (s) => {
  await s.open('?debug&qa2d&map=palace_lanterns&lv=23&chapter=6&flags=ch6_yexuan_met');
  await s.run(`async (S) => { window.__r = await S.battle('t_c6_yexuan_loss', ${'G.Mapx.c6Rules.yexuan()'}); }`);
  assert(await s.ev(() => window.__r === 'lose' && G.Party.active().every((m) => m.hp >= 1)), 'scripted loss → lose, party HP ≥ 1');
});

// ------------------------------------------------------------------ every map: NPC talk sweep + screenshots (2D) and a 3D build
test('sweep', '全部地圖：載入、與每個 NPC 對話、截圖（2D）', async (s) => {
  await s.open('?debug&qa2d&map=yanshui_road&lv=22&chapter=6&flags=' + QUIET);
  for (const id of MAPS) {
    await s.ev((id) => { const d = G.Maps.get(id); G.Mapx.goto(id, d.start[0], d.start[1], 'down'); }, id);
    await s.idle(60);
    await s.ff(0.6);
    await s.shot('map_' + id);
    const npcs = await s.ev(() => G.mapScene.npcs.filter((n) => !n.guard && (n.talk || (n.def && n.def.talk))).map((n) => n.id));
    for (const n of npcs) {
      await s.ev(([n]) => { G.Debug.choices = ['先不要', '不用了', '再等一下', '再逛一下']; G.Debug.talk(n); }, [n]);
      await s.idle(120);
      if (await s.map() !== id) await s.ev((id) => { const d = G.Maps.get(id); G.Mapx.goto(id, d.start[0], d.start[1], 'down'); }, id);
      await s.idle(60);
    }
    await s.drain();
  }
});

test('maps3d', '全部地圖：3D 檢視建置（?r3lite）', async (s) => {
  await s.open('?debug&r3lite&map=yanshui_road&lv=22&chapter=6&flags=' + QUIET);
  const res = [];
  for (const id of MAPS) {
    const r = await s.ev((id) => {
      const d = G.Maps.get(id);
      G.Mapx.goto(id, d.start[0], d.start[1], 'down');
      const m = G.mapScene;
      return { id, has3d: !!m.view3d, enabled: !!(G.R3 && G.R3.enabled()) };
    }, id);
    await s.ff(0.4);
    res.push(r);
  }
  const en = res.some((r) => r.enabled);
  if (en) for (const r of res) assert(r.has3d, '3D view built for ' + r.id);
  s.notes.push('3D ' + (en ? 'enabled: all maps built' : 'not available in this browser (2D fallback)'));
});

// ------------------------------------------------------------------ runner
(async () => {
  const browser = await chromium.launch({ headless: !HEADED, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const results = [];
  for (const t of tests) {
    if (ONLY && !ONLY.some((w) => t.id.includes(w))) continue;
    const s = new Session(browser);
    const t0 = Date.now();
    let status = 'PASS', msg = '';
    try { await t.fn(s); } catch (e) { status = 'FAIL'; msg = e.message; }
    await s.drain().catch(() => {});
    if (status === 'PASS' && s.errors.length) { status = 'FAIL'; msg = `${s.errors.length} game error(s)`; }
    await s.close();
    results.push({ id: t.id, status });
    console.log(`${status === 'PASS' ? '✓' : '✗'} [${t.id}] ${t.name}  (${((Date.now() - t0) / 1000).toFixed(0)}s)${msg ? '  — ' + msg : ''}`);
    for (const e of [...new Set(s.errors)].slice(0, 8)) console.log('    error: ' + e.split('\n').slice(0, 4).join(' | '));
    for (const n of [...new Set(s.notes)].slice(0, 4)) console.log('    note: ' + n.split('\n')[0].slice(0, 200));
  }
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log(`\nch6: ${results.length - fail.length}/${results.length} PASS${fail.length ? '  — FAIL: ' + fail.map((r) => r.id).join(', ') : ''}`);
  process.exit(fail.length ? 1 : 0);
})();

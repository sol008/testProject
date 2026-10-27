#!/usr/bin/env node
// Chapter 7 《雲山入夢》 automated playthrough (Playwright + Chromium, file:// index.html).
//
//   node tools/test/chapters/ch7.test.js            # full run
//   node tools/test/chapters/ch7.test.js --shots    # also save screenshots to tools/test/out/ch7/
//   node tools/test/chapters/ch7.test.js --headed
//   node tools/test/chapters/ch7.test.js --from s6_trials   # resume from a checkpoint written by an earlier run
//   node tools/test/chapters/ch7.test.js --only s4_yushan   # run one segment (needs its checkpoint)
// Segments: s1_shrine_bear s2_tsou s3_forest s4_yushan s5_cloud_rite s6_trials s7_xinghe_heart s8_sunmoon s9_shrine_end s10_extra
// Checkpoints: tools/test/out/ch7/checkpoints/<segment>.json. The 3D renderer is disabled (render3d:false, ?r3lite).
//
// 1. opens index.html?debug&startch=7 with G.Debug.setAutoplay(true) (dialogue auto-advances, choices take
//    G.Debug.choices or 0, minigames succeed, battles auto-fight) and fast-forwards the game loop deterministically;
// 2. drives the whole critical path (stepOn / talk / trigger) through every main beat to G.Story.next(S, 8);
// 3. exercises the side content on the way: 心燈 13 (霧中的獵刀), 心燈 14 (燈母祠的壁畫), 老吳的鹽, 糰子的雲芝, chests,
//    the 燈芯 (flame) mechanic and the 心火 awakening;
// 4. fails on page errors, console errors (ERR_FILE_NOT_FOUND ignored), G.lastError, missing-art / unknown-id warnings;
// 5. prints a PASS/FAIL summary (exit code 1 on failure).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch7');
const SHOTS = process.argv.includes('--shots');
// segments: --from <seg> resumes from the checkpoint saved by a previous run; --only <seg> runs one segment
const SEGS = ['s1_shrine_bear', 's2_tsou', 's3_forest', 's4_yushan', 's5_cloud_rite', 's6_trials', 's7_xinghe_heart', 's8_sunmoon', 's9_shrine_end', 's10_extra'];
const optv = (k) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : null; };
const ONLY = optv('only');
const FROM = ONLY || optv('from') || SEGS[0];
if (!SEGS.includes(FROM)) { console.log('unknown segment ' + FROM + ' (one of ' + SEGS.join(', ') + ')'); process.exit(2); }
const want = (seg) => (ONLY ? seg === ONLY : SEGS.indexOf(seg) >= SEGS.indexOf(FROM));
const CKPT = path.join(ROOT, 'tools', 'test', 'out', 'ch7', 'checkpoints');
const HEADED = process.argv.includes('--headed');
fs.mkdirSync(CKPT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/, /AudioContext/, /GL Driver/, /THREE\./, /WebGL/];
const BAD_WARN = [/\[shorelight\]/, /unknown item/, /no actor/, /Battle: unknown troop/, /unknown song/, /not registered/i, /missing art/i];

const INIT = () => {
  window.__qa = {
    errs: [],
    async ff(sec, o = {}) {
      const dt = o.dt || 0.05, steps = Math.ceil(sec / dt), drawEvery = o.drawEvery || 8;
      const ch = new MessageChannel();
      const yieldNow = () => new Promise((r) => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
      for (let i = 0; i < steps; i++) {
        try {
          G.time += dt;
          G.Input.update(dt); G.Timers.update(dt); G.Tweens.update(dt); G.Render.updateFx(dt); G.UI.updateToasts(dt);
          G.Scenes.update(dt);
          if (G.state && G.inGame) G.state.playtime += dt;
          if (i % drawEvery === 0) { G.Render.begin(); G.ctx.fillStyle = '#000'; G.ctx.fillRect(0, 0, G.W, G.H); G.Scenes.draw(G.ctx); G.UI.drawToasts(G.ctx); G.Render.drawOverlays(); }
          G.Input.endFrame();
        } catch (e) { G.lastError = e; this.errs.push('ff step: ' + (e && e.stack || e)); return 'error'; }
        await yieldNow();
      }
      return 'ok';
    },
    idleNow() {
      const top = G.Scenes.top();
      return !G.Script.busy() && top === G.mapScene && G.Render.fade.a < 0.05;
    },
    async settle(maxSec = 600) {
      for (let t = 0; t < maxSec; t += 1) {
        const top = G.Scenes.top();
        if (G.GameOverScene && top instanceof G.GameOverScene) return 'gameover';
        if (this.errs.length) return 'error';
        if (this.idleNow()) {
          await this.ff(0.4, { drawEvery: 4 });
          if (this.idleNow()) return 'idle';
        }
        await this.ff(1, { drawEvery: 10 });
      }
      return 'timeout';
    },
  };
  window.addEventListener('error', (e) => window.__qa.errs.push('window.onerror: ' + (e.error && e.error.stack || e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__qa.errs.push('unhandledrejection: ' + (e.reason && e.reason.stack || e.reason)));
};

const results = [];
let page;
const errors = [];
const warnings = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`);
  return ok;
}
const ev = (fn, arg) => page.evaluate(fn, arg);
async function shot(name) {
  if (!SHOTS) return;
  const d = await ev(() => G.canvas.toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(d.split(',')[1], 'base64'));
}
// run a statement in the page (not awaited there), then let the game settle
async function act(label, code, o = {}) {
  if (o.choices) await ev((c) => { G.Debug.choices = c.slice(); }, o.choices);
  await ev((c) => { (0, eval)(c); }, code);
  const r = await ev((s) => __qa.settle(s), o.max || 900);
  const st = await state();
  const ok = r === 'idle';
  if (!ok) check(`${label}: game settled`, false, `${r} (map=${st.map}, top=${st.top}, chapter=${st.chapter})`);
  if (o.shot) await shot(o.shot);
  return st;
}
async function state() {
  return ev(() => ({
    map: G.mapScene && G.mapScene.def && G.mapScene.def.id, top: G.Scenes.top() && G.Scenes.top().constructor && G.Scenes.top().constructor.name,
    chapter: G.state.chapter, flags: Object.assign({}, G.state.flags), lanterns: Object.keys(G.state.lanterns), inv: Object.assign({}, G.state.inv),
    party: G.state.party.slice(), lv: G.state.party.map((id) => G.state.members[id] && G.state.members[id].lv),
    quests: JSON.parse(JSON.stringify(G.state.quests)),
    xinghe: (() => { const m = G.state.members.xinghe; const s = G.Party.stats('xinghe'); return { hp: m.hp, mhp: s.mhp, flat: G.C7.flatHp('xinghe'), skills: m.skills.slice() }; })(),
  }));
}
async function drainErrors() {
  const e = await ev(() => { const r = __qa.errs.slice(); __qa.errs.length = 0; const le = G.lastError ? String(G.lastError.stack || G.lastError) : null; G.lastError = null; return { r, le }; }).catch(() => ({ r: [], le: null }));
  errors.push(...e.r);
  if (e.le) errors.push('G.lastError: ' + e.le);
}

async function checkpoint(next) {
  if (!next) return;
  const snap = await ev(() => ({ state: JSON.parse(JSON.stringify(G.state)), map: G.mapScene.def.id, x: G.mapScene.player.x, y: G.mapScene.player.y, dir: G.mapScene.player.dir }));
  fs.writeFileSync(path.join(CKPT, next + '.json'), JSON.stringify(snap));
}
const nextSeg = (seg) => SEGS[SEGS.indexOf(seg) + 1];

(async () => {
  const t0 = Date.now();
  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT);
  // 2D renderer (the 3D presentation is far too slow on software GL)
  await ctx.addInitScript(() => { try { const k = 'shorelight_settings'; const o = JSON.parse(localStorage.getItem(k) || '{}'); o.render3d = false; localStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* ignore */ } });
  page = await ctx.newPage();
  page.setDefaultTimeout(0);
  page.on('console', (m) => {
    const t = m.text();
    if (IGNORE.some((r) => r.test(t))) return;
    if (m.type() === 'error') errors.push('console.error: ' + t.slice(0, 800));
    else if (m.type() === 'warning' && BAD_WARN.some((r) => r.test(t))) warnings.push(t.slice(0, 300));
  });
  page.on('pageerror', (e) => {
    const msg = (e.stack || e.message || '').slice(0, 800);
    // a parallel chapter file being written by another builder must not fail this chapter's test
    if (/ch(?!7_)\d+_\w+\.js/.test(msg) && !/ch7_mountains/.test(msg)) { console.log('  (ignored foreign page error) ' + msg.split('\n')[0]); return; }
    errors.push('pageerror: ' + msg);
  });

  try {
    let st;
    if (FROM === SEGS[0]) {
      await page.goto(BASE + '?debug&startch=7&r3lite&flags=yuyuan_joined,mochi_joined', { timeout: 0 });
      await page.waitForFunction(() => window.G && G.Debug && G.Scenes, null, { timeout: 0 });
      await ev(() => { G.Audio.unlock = () => {}; G.Debug.setAutoplay(true); });
      await page.waitForFunction(() => G.mapScene && G.mapScene.def && G.mapScene.def.id === 'sugar_shrine', null, { timeout: 0, polling: 500 });
      console.log('\n第七章 雲山入夢 — playthrough');
      st = await state();
      check('chapter set to 7, party 星河/紅纓/雲歸 (no 白芷)', st.chapter === 7 && st.party.join() === 'xinghe,hongying,yungui', st.party.join());
      check('芋圓 & 麻糬 follow (麻糬 even while 白芷 is away)', await ev(() => ['yuyuan', 'mochi'].every((id) => G.mapScene.followers.some((f) => f.id === id))));
      check('燈芯 starts at 80 and scales 星河 max HP', st.flags.ch7_flame === 80 && st.xinghe.mhp === Math.floor(st.xinghe.flat * 0.8), JSON.stringify(st.xinghe));
    } else {
      const file = path.join(CKPT, FROM + '.json');
      if (!fs.existsSync(file)) throw new Error('no checkpoint for ' + FROM + ' — run the earlier segments first');
      const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
      await page.goto(BASE + `?debug&map=${snap.map}&x=${snap.x}&y=${snap.y}&r3lite`, { timeout: 0 });
      await page.waitForFunction(() => window.G && G.mapScene && G.mapScene.def, null, { timeout: 0, polling: 500 });
      await ev((sn) => { G.Audio.unlock = () => {}; G.Debug.setAutoplay(true); G.Script.reset(); G.state = Object.assign(G.newState(), sn.state); G.Mapx.goto(sn.map, sn.x, sn.y, sn.dir); }, snap);
      await ev(() => __qa.settle(60));
      console.log(`\n第七章 雲山入夢 — resumed at ${FROM}`);
      st = await state();
    }

    { const cur = 's1_shrine_bear';
    if (want(cur)) {
    // ---------------------------------------------------------------- 7-1 甘蔗田
    st = await act('7-1 opening', '0', { shot: '01_sugar_shrine' });
    check('7-1 opening done (ch7_intro, ch7_cart)', st.flags.ch7_intro && st.flags.ch7_cart);
    st = await act('crate & porridge', 'G.Script.run(async (S) => { const m = G.mapScene; const c = m.objects.find((o) => o.t === "crate"); await c.interact(S, c); const p = m.objects.find((o) => o.t === "pot"); await p.interact(S, p); })');
    check('工寮 crate gives 甘蔗 ×2, porridge banter', st.inv.c7_ganzhe === 2 && st.flags.ch7_porridge);
    st = await act('7-1 chest', 'G.Script.run(async () => { const m = G.mapScene; m.openChest(m.objects.find((o) => o.chestKey === "sugar_shrine:c7_ss_a")); })');
    check('廟後 chest: 金創藥 ×2', (st.inv.jinchuang || 0) >= 2);
    st = await act('ride the cart', 'G.Debug.talk("ss_abo")', { choices: [0] });
    check('阿伯 gives 甘蔗 ×3; cart ride → alishan_trail; 老吳 intro', st.map === 'alishan_trail' && st.inv.c7_ganzhe === 5 && st.flags.ch7_trader);

    // ---------------------------------------------------------------- 7-2 古道・黑熊
    await act('老吳 shop talk', 'G.Debug.talk("laowu")', { choices: [0] });
    await ev(() => G.Inv.add('c7_salt', 1));
    const hpBefore = (await state()).flags.ch7_flame;
    st = await act('7-2b black bear', 'G.Debug.stepOn(23, 12)', { shot: '02_bear_after' });
    check('黑熊精 freed (not killed), Voyu met', st.flags.ch7_bear_freed && st.flags.ch7_voyu);
    check('燈芯: battle −2 and story −4 applied', st.flags.ch7_flame === hpBefore - 6, `${hpBefore} → ${st.flags.ch7_flame}`);
    check('星河 HP never exceeds the scaled max', st.xinghe.hp <= st.xinghe.mhp && st.xinghe.mhp === Math.floor(st.xinghe.flat * st.flags.ch7_flame / 100));

      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's2_tsou';
    if (want(cur)) {
    // ---------------------------------------------------------------- 7-3 鄒族大社
    st = await act('7-3 tsou welcome', 'G.Debug.stepOn(23, 0)', { shot: '03_tsou_night' });
    check('7-3 kuba fire (ch7_tsou_welcome, ch7_tasan_told)', st.map === 'tsou_hosa' && st.flags.ch7_tsou_welcome && st.flags.ch7_tasan_told);
    st = await act('kuba is not entered', 'G.Debug.trigger("kuba")');
    check('kuba is solid and has no warp', await ev(() => { const m = G.mapScene; const o = m.objects.find((x) => x.t === 'kuba'); for (let y = o.y; y < o.y + 3; y++) for (let x = o.x; x < o.x + 4; x++) if (!m.solid[y * m.w + x]) return false; return !(m.def.warps || []).some((w) => w.x >= o.x && w.x < o.x + 4 && w.y >= o.y && w.y < o.y + 3); }));
    check('塔山 is beyond the cliff (no warp east)', await ev(() => !(G.mapScene.def.warps || []).some((w) => w.x >= 40)));
    st = await act('salt for the women', 'G.Debug.talk("tw1")');
    check('老吳的鹽 → 愛玉凍 ×3', st.inv.c7_aiyudong === 3 && !st.inv.c7_salt && st.flags.ch7_salt_given);
    const fl0 = st.flags.ch7_flame;
    st = await act('Voyu house night', 'G.Debug.stepOn(31, 20); ', {});
    st = await act('rest by the hearth', 'G.Debug.talk("mother")', { choices: [0] });
    check('first night: Pasuya told, morning, 燈芯 +8', st.flags.ch7_pasuya_told && st.flags.ch7_morning && st.flags.ch7_flame === fl0 + 8, `${fl0} → ${st.flags.ch7_flame}`);
    st = await act('back to the plaza', 'G.Debug.stepOn(6, 9)');
    st = await act('Voyu asks (心燈 13)', 'G.Debug.talk("voyu")');
    check('心燈 13 accepted (ch7_sq_pasuya = 1)', st.flags.ch7_sq_pasuya === 1 && st.quests.q_ch7_pasuya);

      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's3_forest';
    if (want(cur)) {
    // ---------------------------------------------------------------- 7-4 神木・雲海 + 霧谷
    st = await act('to the forest', 'G.Debug.stepOn(12, 0)');
    check('alishan_forest reached', st.map === 'alishan_forest');
    st = await act('north exit blocked before the sea of clouds', 'G.Debug.stepOn(21, 0)');
    check('must see the sea of clouds first', st.map === 'alishan_forest');
    st = await act('7-4a 神木', 'G.Debug.stepOn(16, 13)');
    check('7-4a shenmu', st.flags.ch7_shenmu);
    st = await act('7-4b 雲海', 'G.Debug.stepOn(39, 12)', { shot: '04_sea_of_clouds' });
    check('7-4b sea of clouds (燈芯 −4)', st.flags.ch7_seaofclouds);
    st = await act('log', 'G.Debug.trigger("log")');
    check('紅纓 pushes the log into the 霧谷', st.flags.ch7_log_moved);
    await act('glimmer 1', 'G.Debug.trigger("mark1")');
    await act('glimmer 2', 'G.Debug.trigger("mark2")');
    st = await act('glimmer 3', 'G.Debug.trigger("mark3")', { shot: '05_valley' });
    check('cap & knife found', st.flags.ch7_sq_pasuya === 2 && st.inv.c7_key_cap && st.inv.c7_key_knife);
    await act('valley chest', 'G.Script.run(async () => { const m = G.mapScene; m.openChest(m.objects.find((o) => o.chestKey === "alishan_forest:c7_af_e")); })');
    st = await act('back to the village', 'G.Debug.stepOn(21, 39)');
    st = await act('Voyu house', 'G.Debug.stepOn(31, 20)');
    st = await act('deliver to the mother', 'G.Debug.talk("mother")');
    check('心燈 13「霧中的獵刀」 granted via S.lantern', st.lanterns.includes('lantern_tsou_hunter') && st.flags.ch7_heartlamp_tsou && st.quests.q_ch7_pasuya && st.quests.q_ch7_pasuya.done);
    check('mother gifts 小米酒 & 烤山肉; cap returned', st.inv.c7_hulu === 1 && st.inv.c7_kaorou === 3 && !st.inv.c7_key_cap);
    st = await act('north again', 'G.Debug.stepOn(12, 0)');
    st = await act('to 玉山', 'G.Debug.stepOn(21, 0)');
    check('yushan_trail reached, Voyu farewell', st.map === 'yushan_trail' && st.flags.ch7_yushan_enter);

      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's4_yushan';
    if (want(cur)) {
    // ---------------------------------------------------------------- 7-5 / 7-6 玉山・布農
    st = await act('upper slope', 'G.Debug.stepOn(21, 27)', { choices: [0] });
    check('upper slope entered (no return)', st.flags.ch7_upper);
    const fl1 = st.flags.ch7_flame;
    st = await act('7-5b collapse → 7-6 Bunun night', 'G.Debug.stepOn(21, 23)', { choices: [0], shot: '06_bunun_morning', max: 1500 });
    check('Biung shelters them; pasibutbut heard (silent BGM); flood legend', st.flags.ch7_biung && st.flags.ch7_bunun_shelter && st.flags.ch7_pasibutbut_heard && st.flags.ch7_flood_legend);
    check('燈芯 −4 then +8 at the Bunun hearth', st.flags.ch7_flame === Math.min(100, Math.max(30, fl1 - 4) + 8), `${fl1} → ${st.flags.ch7_flame}`);
    check('黑鵯紅羽, 小米糕 ×3, 醃山肉 ×2', st.inv.c7_ac_hongyu && st.inv.c7_xiaomigao === 3 && st.inv.c7_yanrou === 2);
    check('farewell → 雲霧林', st.flags.ch7_bunun_farewell && st.map === 'cloud_forest');

      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's5_cloud_rite';
    if (want(cur)) {
    // ---------------------------------------------------------------- 7-7 雲霧林
    st = await act('雲芝', 'G.Debug.trigger("yunzhi")');
    check('雲歸 tastes the 雲芝 (mush_ch7, 七仙蕈 counter, 雲芝)', st.flags.mush_ch7 && st.inv.mat_yunzhi && (await ev(() => G.state.vars.tuanzi_mush)) >= 1);
    st = await act('fog loop A', 'G.Debug.stepOn(5, 15)');
    check('fog loop sends the party back to the fork', st.flags.ch7_loopA && st.map === 'cloud_forest' && (await ev(() => G.mapScene.player.y)) === 36);
    st = await act('to 藤婆', 'G.Debug.stepOn(20, 0)', { shot: '07_tengpo' });
    check('7-8 藤婆 + three days (ch7_tengpo_met, ch7_dieta)', st.map === 'tengpo_hut' && st.flags.ch7_tengpo_met && st.flags.ch7_dieta);

    // ---------------------------------------------------------------- 7-9 入夢禮 → 靈境
    st = await act('7-9 rite', 'G.Debug.talk("tengpo")', { choices: [0, 2], shot: '08_vision_hub' });
    check('intent chosen (ch7_intent = 3), rite, 靈境 entered', st.flags.ch7_intent === 3 && st.flags.ch7_rite && st.map === 'vision_hub' && st.flags.ch7_vision_enter);
    check('靈境 uses the psychedelic overlay; cats hidden (giant 芋圓 drawn instead)', await ev(() => G.Mapx.val(G.mapScene.def.psychedelic) > 0 && G.state.flags.yuyuan_hidden && !G.mapScene.followers.some((f) => f.id === 'yuyuan')));
    // P7-4 breathing bridges: solid on inhale, open on exhale
    check('P7-4 bridges follow the breath', await ev(async () => {
      const m = G.mapScene; const [bx, by] = G.C7.bridges[0];
      const P = G.state.flags.ch7_breath_slow ? 6 : 4;
      const want = (ph) => { m.t = Math.floor(m.t / P) * P + ph * P; };
      want(0.2); m.draw(G.ctx); const a = m.solid[by * m.w + bx];
      want(0.7); m.draw(G.ctx); const b = m.solid[by * m.w + bx];
      return a === 1 && b === 0;
    }));
      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's6_trials';
    if (want(cur)) {
    // 紅纓之境
    st = await act('to 紅纓之境', 'G.Debug.stepOn(2, 20)', { shot: '09_vision_hongying' });
    check('vision_hongying', st.map === 'vision_hongying');
    for (const k of ['A', 'B', 'C']) await act('mirror ' + k, `G.Debug.trigger("mir_${k}")`);
    st = await act('mirror D → beam reaches the hall → 心魔・鬼面 (紅纓 alone)', 'G.Debug.trigger("mir_D")', { max: 1500 });
    check('P7-1 solved, trial of 紅纓, 放手 learned', st.flags.ch7_hy_solved && st.flags.ch7_trial_hongying && st.map === 'vision_hub', st.map);
    check('party restored after the solo battle', st.party.join() === 'xinghe,hongying,yungui');
    // 雲歸之境
    st = await act('to 雲歸之境', 'G.Debug.stepOn(20, 2)', { shot: '10_vision_yungui' });
    for (const i of [0, 4]) await act('lamp ' + i, `G.Debug.trigger("lamp${i}")`);
    st = await act('lamp 8 → 心魔・雲歸', 'G.Debug.trigger("lamp8")', { max: 1500 });
    check('P7-2 solved (1-5-9), trial of 雲歸, 慢看 learned; east gate opens', st.flags.ch7_yg_solved && st.flags.ch7_trial_yungui && st.flags.ch7_east_open && st.map === 'vision_hub');
    const sk = await ev(() => ({ hy: G.state.members.hongying.skills.includes('hy_fangshou'), yg: G.state.members.yungui.skills.includes('yg_mankan') }));
    check('passives learned with S.learn (hy_fangshou, yg_mankan)', sk.hy && sk.yg);
      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's7_xinghe_heart';
    if (want(cur)) {
    // 星河之境
    st = await act('to 星河之境', 'G.Debug.stepOn(36, 20)', { shot: '11_vision_xinghe' });
    st = await act('wrong note', 'G.Debug.trigger("note_gong")');
    check('P7-3 wrong note: black tide rises', (await ev(() => G.state.vars.c7_wrong)) === 1);
    for (const k of ['jue', 'zhi', 'yu', 'zhi']) await act('note ' + k, `G.Debug.trigger("note_${k}")`);
    st = await act('note gong → memory theatre → 心火 → 無光之影 → dawn', 'G.Debug.trigger("note_gong")', { max: 3000, shot: '12_dawn' });
    check('cycles seen, lyric fragment (lyric_ch7)', st.flags.ch7_cycles_seen && st.flags.lyric_ch7);
    check('心火 awakened: ch7_flame removed, passive +8% max HP', st.flags.ch7_xinhuo && st.flags.ch7_flame === undefined && st.xinghe.mhp === st.xinghe.flat + Math.floor(st.xinghe.flat * 0.08), JSON.stringify(st.xinghe));
    check('心火 skills learned', ['xh_xinhuo_ran', 'xh_xinhuo_zhao', 'xh_xinhuo_bumie'].every((s) => st.xinghe.skills.includes(s)));
    check('7-11 dawn: 藤心結, 雲霧藥草包, 雲豹之紋', st.flags.ch7_dawn_after && st.inv.c7_ac_tengxin && st.inv.c7_key_leopard && st.map === 'tengpo_hut');
    check('芋圓 & 麻糬 follow again after the dream', !st.flags.yuyuan_hidden && !st.flags.mochi_hidden && (await ev(() => ['yuyuan', 'mochi'].every((id) => G.mapScene.followers.some((f) => f.id === id)))));

      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's8_sunmoon';
    if (want(cur)) {
    // ---------------------------------------------------------------- 7-12 日月潭
    st = await act('follow the leopard to the lake', 'G.Debug.stepOn(15, 7)', { shot: '13_sunmoon' });
    check('7-12 Thao elder, white deer, Lalu respected, 杵音', st.map === 'sunmoon' && st.flags.ch7_thao_met && st.flags.ch7_white_deer && st.flags.ch7_lalu_respect && st.flags.ch7_chuyin);
    check('Lalu is unreachable (deep water around the island)', await ev(() => { const m = G.mapScene; for (const [x, y] of [[23, 6], [27, 6], [25, 3], [25, 9]]) if (!m.solid[y * m.w + x]) return false; return true; }));
    st = await act('boat refusal', 'G.Debug.trigger("boats")');
    st = await act('7-12d rest → path in the mist', 'G.Debug.trigger("rest")', { choices: [0] });
    check('mist path (ch7_mist_path) → sunmoon_mist', st.flags.ch7_mist_path && st.map === 'sunmoon_mist');
    st = await act('7-13a 蛟', 'G.Debug.stepOn(15, 21)');
    check('蛟 defeated', st.flags.ch7_jiao);
    st = await act('7-13b shrine revealed', 'G.Debug.stepOn(15, 4)');
    st = await act('enter 燈母祠', 'G.Debug.stepOn(15, 0)', { shot: '14_lamp_shrine' });
    check('lamp_shrine', st.map === 'lamp_shrine');

      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's9_shrine_end';
    if (want(cur)) {
    // ---------------------------------------------------------------- 7-14 燈母祠
    for (const k of [1, 2, 3]) await act('mural ' + k, `G.Debug.trigger("m${k}")`);
    await act('wrong lamp (金 first)', 'G.Debug.trigger("wx_metal")');
    for (const el of ['wood', 'fire', 'earth', 'metal']) await act('lamp ' + el, `G.Debug.trigger("wx_${el}")`);
    st = await act('lamp water → stairs', 'G.Debug.trigger("wx_water")');
    check('P7-5 五行燈 (相生 order) solved, stairs revealed', st.flags.ch7_lamp_puzzle && (await ev(() => G.mapScene.objects.some((o) => o.t === 'stairs_down'))));
    st = await act('down the stairs', 'G.Debug.stepOn(20, 9)');
    for (const k of [4, 5]) await act('mural ' + k, `G.Debug.trigger("m${k}")`);
    st = await act('mural 6 → 心燈 14', 'G.Debug.trigger("m6")');
    check('心燈 14「燈母祠的壁畫」 granted via S.lantern', st.lanterns.includes('lantern_lamp_murals') && st.flags.ch7_heartlamp_murals);
    st = await act('7-15/16/17 清虛 → 燈母 → 魚粥 → chapter 8', 'G.Debug.stepOn(19, 3)', { choices: [0], max: 3000, shot: '15_end' });
    check('清虛 freed, 太虛神雷 learned, 清虛古符', st.flags.ch7_qingxu_freed && st.flags.ch7_taixu && (await ev(() => G.state.members.yungui.skills.includes('yg_taixu'))) && (st.inv.c7_fn_qingxu || (await ev(() => Object.values(G.state.members.yungui.equip).includes('c7_fn_qingxu')))));
    check('燈母之聲 + 章末 (ch7_mother_voice, ch7_end)', st.flags.ch7_mother_voice && st.flags.ch7_end);
    check('G.Story.next(S, 8) reached (chapter 8)', st.chapter === 8, 'chapter=' + st.chapter);
    check('both chapter-7 心燈 counted by G.Lanterns', st.lanterns.includes('lantern_tsou_hunter') && st.lanterns.includes('lantern_lamp_murals'));
    console.log(`  party levels at the end: ${st.lv.join(', ')}`);

      await checkpoint(nextSeg(cur));
    } }
    { const cur = 's10_extra';
    if (want(cur)) {
    // ---------------------------------------------------------------- separate: flame floor / game-over text / map loads
    await ev(() => { G.Debug.setAutoplay(true); });
    const extra = await ev(async () => {
      const out = {};
      G.state.flags.ch7_xinhuo = false;
      G.state.flags.ch7_flame = 31;
      delete G.state.members.xinghe.equip.c7heart;
      G.C7.applyFlame();
      for (let i = 0; i < 3; i++) await G.C7.flame(null, -4);
      out.floor = G.state.flags.ch7_flame;
      out.mhpAtFloor = G.Party.stats('xinghe').mhp === Math.floor(G.C7.flatHp('xinghe') * 0.3);
      G.C7.lastFell = 'xinghe';
      const go = new G.GameOverScene(null, {}, null, () => {});
      go.t = 2; go.draw(G.ctx);
      out.goOk = true;
      delete G.state.flags.ch7_flame; G.state.flags.ch7_xinhuo = true; G.C7.applyFlame();
      return out;
    });
    check('燈芯 never drops below 30; max HP = 30%', extra.floor === 30 && extra.mhpAtFloor, JSON.stringify(extra));
    check('「燈，熄了。」 game-over variant draws', extra.goOk);
    const mapsOk = await ev(() => {
      const ids = ['sugar_shrine', 'alishan_trail', 'tsou_hosa', 'tsou_house', 'alishan_forest', 'yushan_trail', 'bunun_home', 'bunun_house_in', 'cloud_forest', 'tengpo_hut', 'tengpo_hut_in', 'vision_hub', 'vision_hongying', 'vision_yungui', 'vision_xinghe', 'vision_heart', 'sunmoon', 'sunmoon_mist', 'lamp_shrine', 'lamp_shrine_lower', 'lamp_shrine_core'];
      const bad = [];
      for (const id of ids) {
        try { const d = G.Maps.get(id); const ms = new G.MapScene(id, d.start[0], d.start[1], 'down'); ms.draw(G.ctx); if (ms.solid[d.start[1] * ms.w + d.start[0]]) bad.push(id + ' start solid'); } catch (e) { bad.push(id + ': ' + e.message); }
      }
      return bad;
    });
    check('all 21 chapter-7 maps construct & draw', !mapsOk.length, mapsOk.join('; '));
    }
    }
  } catch (e) {
    check('test driver', false, e.stack || e.message);
  }
  await drainErrors();
  check('no page / console errors', !errors.length, errors.slice(0, 6).join('\n      '));
  check('no missing-art / unknown-id warnings', !warnings.length, [...new Set(warnings)].slice(0, 6).join('\n      '));
  await browser.close();
  const fail = results.filter((r) => !r.ok);
  console.log(`\n${fail.length ? 'FAIL' : 'PASS'} — ${results.length - fail.length}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(fail.length ? 1 : 0);
})();

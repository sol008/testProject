#!/usr/bin/env node
// Chapter 5 《鹿港舊夢》 automated playthrough (Playwright + Chromium against file://…/index.html).
//
//   node tools/test/chapters/ch5.test.js            # full run
//   node tools/test/chapters/ch5.test.js --shots    # also save screenshots to tools/test/out/ch5_*.png
//   node tools/test/chapters/ch5.test.js --headed
//   node tools/test/chapters/ch5.test.js --from boss      # start the main path at 記憶之門③/怨宴 (debug state)
//   node tools/test/chapters/ch5.test.js --from ending    # start at the 冬至 inn scene (debug state)
//   node tools/test/chapters/ch5.test.js --only main,fubo,maps   # run only these segments (default: all)
// The 3D renderer is disabled (localStorage settings render3d:false).
//
// 1. Opens index.html?debug&startch=5 (standalone chapter start) with G.Debug autoplay on.
// 2. Drives the critical path: arrival → 洛家大門 → 天后宮 → 九曲巷/摸乳巷 → 燈籠舖 → 洛家古厝 (memories, 戲箱,
//    公媽廳 mirror puzzle solved through the real mirror events) → 怨宴 → unmask → 福伯 → 冬至/除夕 → G.Story.next(6).
// 3. Exercises the side content: 半邊井 (心燈), 福伯 (心燈), 憶蕈, toys, all chests, shops, the 隘門 at night, 舊港.
// 4. Fails on page errors, console errors (except ERR_FILE_NOT_FOUND and syntax errors inside OTHER chapters'
//    files, which are being written in parallel), console warnings (missing art / unknown items / no actor),
//    G.lastError and script errors.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(ROOT, 'tools', 'test', 'out');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const HEADED = argv.includes('--headed');
const argOf = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : null; };
const FROM = argOf('from');                       // null | 'boss' | 'ending'
const ONLY = argOf('only') ? argOf('only').split(',') : ['main', 'fubo', 'maps'];
const CATS = 'mochi_joined,yuyuan_joined';
const PRE_BOSS = [CATS, 'mush_ch5', 'ch5_start', 'ch5_gate', 'ch5_mazu', 'ch5_alley', 'ch5_lamp', 'ch5_rabbit', 'ch5_memory_nian', 'ch5_enter',
  'ch5_mem1', 'ch5_mem2', 'ch5_trunk', 'ch5_hall_intro', 'ch5_lamp_seat', 'ch5_mirrors', 'ev_luo_1f_c5_l1_intro', 'ev_luo_gate_c5_gate_enter'].join(',');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let page;
const problems = [];
const foreign = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${!ok && detail ? '  — ' + detail : ''}`);
}

async function idle(ms = 120000) {
  const ok = await page.evaluate((t) => G.Debug.idle(t), ms);
  if (!ok) {
    const info = await page.evaluate(() => ({ map: G.mapScene && G.mapScene.def.id, top: G.Scenes.stack.map((s) => s.constructor && s.constructor.name), busy: G.Script.busy() }));
    throw new Error('timeout waiting for idle: ' + JSON.stringify(info));
  }
  await page.waitForTimeout(150);
  // auto events may start right after idle
  await page.evaluate((t) => G.Debug.idle(t), ms);
}
const ev = (js, arg) => page.evaluate(js, arg);
const mapId = () => ev(() => G.mapScene && G.mapScene.def.id);
const flag = (k) => ev((k) => !!G.state.flags[k], k);
async function stepOn(x, y) { await ev(([x, y]) => G.Debug.stepOn(x, y), [x, y]); await page.waitForTimeout(100); await idle(); }
async function trigger(id) { await ev((id) => G.Debug.trigger(id), id); await idle(); }
async function talk(id) { await ev((id) => G.Debug.talk(id), id); await idle(); }
async function choices(list) { await ev((l) => { G.Debug.choices = l; }, list); }
async function warp(map, x, y, dir = 'down') { await ev(([m, x, y, d]) => G.Script.run((S) => S.warp(m, x, y, d)), [map, x, y, dir]); await idle(); }
async function openChest(id) {
  const ok = await ev((id) => {
    const m = G.mapScene;
    const o = m.objects.find((ob) => ob.t === 'chest' && ob.chest && ob.chest.id === id && m.objActive(ob));
    if (!o || o.open) return false;
    m.openChest(o);
    return true;
  }, id);
  await idle();
  return ok;
}
async function shot(name) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `ch5_${name}.png`) });
}
async function expectMap(id, label) { const m = await mapId(); check(`${label || 'on map'} ${id}`, m === id, 'current map ' + m); }

(async () => {
  const browser = await chromium.launch({ headless: !HEADED });
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    // the WebGL 3D presentation layer (work in progress, see js/r3d/) is far too slow under headless
    // software rendering — this test exercises the chapter's content on the 2D renderer
    try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false, lang: 'zh', music: 0, sfx: 0 })); } catch (e) { /* ignore */ }
    window.__ch5err = [];
    window.addEventListener('error', (e) => {
      window.__ch5err.push({ msg: String(e.message), file: String(e.filename || ''), line: e.lineno });
    });
  });
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') { if (!/ERR_FILE_NOT_FOUND/.test(t)) problems.push('console.error: ' + t.slice(0, 400)); }
    else if (m.type() === 'warning' && !/^THREE\.|GL Driver Message|GPU stall|AudioContext was not allowed/.test(t)) problems.push('console.warn: ' + t.slice(0, 400));
  });
  page.on('pageerror', (e) => {
    const st = String(e.stack || e.message);
    // runtime errors thrown while loading OTHER chapters' files (being written in parallel) are not ours
    if (/js\/maps\/ch(?!5_)\d+_[a-z]+\.js/.test(st) && !/ch5_lukang\.js/.test(st)) { foreign.push(st.split('\n')[0]); return; }
    problems.push('pageerror: ' + st.slice(0, 400));
  });

  if (ONLY.includes('main')) try {
    if (!FROM) {
    const url = 'file://' + path.join(ROOT, 'index.html') + '?debug&startch=5&flags=mush_1,ch3_mask_shard,ch4_lamp_broken';
    await page.goto(url);
    await page.waitForFunction(() => window.G && G.Debug && G.Debug.setAutoplay, null, { timeout: 20000 });
    await ev(() => { G.Debug.setAutoplay(true); G.settings.lang = 'zh'; });
    await page.waitForFunction(() => G.mapScene && G.mapScene.def.id === 'lukang', null, { timeout: 60000 });
    await idle();
    // ------------------------------------------------------------------ chapter start
    check('chapter set to 5', (await ev(() => G.state.chapter)) === 5);
    check('party 星河 白芷 紅纓 雲歸', (await ev(() => G.state.party.slice(0, 4).join(','))) === 'xinghe,baizhi,hongying,yungui');
    check('cats 芋圓・麻糬 follow, no 糰子', await ev(() => { const f = G.mapScene.followers.map((a) => a.id); return f.includes('mochi') && f.includes('yuyuan') && !f.includes('tuanzi'); }));
    check('arrival cutscene ran (ch5_start)', await flag('ch5_start'));
    check('levels ≥ 16', await ev(() => G.Party.active().every((m) => m.lv >= 16)));
    await shot('01_arrive');

    // ------------------------------------------------------------------ 洛家大門 (first visit)
    await stepOn(27, 41);
    await expectMap('luo_gate', '§3-2');
    check('福伯 at the gate (ch5_gate)', await flag('ch5_gate'));
    await shot('02_gate');
    await stepOn(9, 5); // door is sealed → pushed back
    await expectMap('luo_gate', 'sealed door keeps you outside:');
    await stepOn(9, 13);
    await expectMap('lukang');

    // ------------------------------------------------------------------ 天后宮
    await choices([0]);
    await stepOn(27, 6);
    await expectMap('lukang_mazu', '§3-3');
    check('媽祖 scene (ch5_mazu)', await flag('ch5_mazu'));
    check('three 聖筊 (ch5_jiaobei)', await flag('ch5_jiaobei'));
    check('dusk (ch5_time = 1)', (await ev(() => G.state.vars.ch5_time)) === 1);
    await talk('lk_mazu_keeper');
    await shot('03_mazu');
    await stepOn(11, 17);
    await expectMap('lukang');

    // town NPCs (flag-dependent lines + shops are skipped in autoplay but validated)
    for (const id of ['lk_scholar', 'lk_fisher', 'lk_gossip1', 'lk_gossip2', 'lk_child', 'lk_lantern_stall', 'lk_doctor', 'lk_walker', 'lk_old', 'lk_oyster', 'lk_mianxian', 'lk_pilgrim', 'lk_sailor']) {
      const ok = await ev((id) => !!G.mapScene.npcs.find((n) => n.id === id), id);
      if (ok) await talk(id); else check(`npc ${id} present (day)`, false);
    }
    await trigger('c5_lions');
    check('chest c5_01 (港灘)', await openChest('c5_01'));
    // 舊港 is closed during the day
    await stepOn(0, 32);
    await expectMap('lukang', 'harbour closed by day:');
    // 兵器鋪
    await stepOn(35, 13); await expectMap('lukang_shop'); await talk('lk_smith'); await stepOn(6, 8);

    // ------------------------------------------------------------------ 九曲巷：摸乳巷
    await stepOn(55, 9);
    await expectMap('lukang_jiuqu');
    await stepOn(3, 3);
    check('摸乳巷 scene (ch5_alley)', await flag('ch5_alley'));
    await shot('04_alley');
    check('chest c5_03 (土地公)', await openChest('c5_03'));
    check('chest c5_02 (逆風直巷)', await openChest('c5_02'));
    await trigger('c5_shrine');

    // ------------------------------------------------------------------ 半邊井 steps 1–3
    await stepOn(15, 17);
    check('半邊井 started', (await ev(() => G.Quests.stage('q_halfwell'))) === 0);
    await stepOn(21, 15);
    await expectMap('lukang_wang');
    await choices([0]);
    await talk('lk_wang');
    check('王少爺 → ask the neighbours (stage 1)', (await ev(() => G.Quests.stage('q_halfwell'))) === 1);
    await trigger('c5_wang_ledger');
    await stepOn(10, 9);
    await expectMap('lukang_jiuqu');
    await talk('lk_granny_well');
    check('王字水桶', await ev(() => G.Inv.has('c5_wang_bucket')));
    await talk('lk_watchman');
    check('打更阿福伯 will beat the gong (ch5_well_gong)', await flag('ch5_well_gong'));
    await stepOn(0, 3);
    await expectMap('lukang');
    await talk('lk_niushe');
    check('舊帳本', await ev(() => G.Inv.has('c5_old_ledger')));
    check('半邊井 waits for night (stage 2)', (await ev(() => G.Quests.stage('q_halfwell'))) === 2);

    // ------------------------------------------------------------------ 施家燈籠舖
    await stepOn(55, 9);
    await stepOn(27, 22);
    await expectMap('lukang_lantern', '§3-5');
    check('洛家燈 (ch5_lamp + item)', (await flag('ch5_lamp')) && (await ev(() => G.Inv.has('c5_luo_lantern'))));
    check('兔子燈 (ch5_rabbit + item)', (await flag('ch5_rabbit')) && (await ev(() => G.Inv.has('c5_rabbit_lantern'))));
    check('念念 memory + lyric', (await flag('ch5_memory_nian')) && (await flag('lyric_ch5')));
    check('shard traced (ch4 branch)', await flag('ch5_shard_traced'));
    check('night (ch5_time = 2)', (await ev(() => G.state.vars.ch5_time)) === 2);
    await talk('lk_shi');
    await shot('05_lantern');

    // ------------------------------------------------------------------ 半邊井 step 4 (night, auto)
    await stepOn(6, 9);
    await expectMap('lukang_jiuqu');
    check('半邊井 done', await ev(() => G.Quests.isDone('q_halfwell')));
    check('心燈 lantern_halfwell', await ev(() => G.Lanterns.has('lantern_halfwell')));
    check('半邊井水 ×3', (await ev(() => G.Inv.count('c5_halfwell'))) === 3);
    check('bucket & ledger handed over', await ev(() => !G.Inv.has('c5_wang_bucket') && !G.Inv.has('c5_old_ledger')));
    await shot('06_halfwell');
    // 隘門 at night
    const wpos = await ev(() => { const n = G.mapScene.npcs.find((x) => x.id === 'lk_watchman'); return [n.x, n.y]; });
    check('隘門 closed at night (watchman in the gate)', wpos[0] === 33 && wpos[1] === 8, JSON.stringify(wpos));
    await choices([0]);
    await talk('lk_watchman');
    check('隘門 opened (ch5_gate_open)', await flag('ch5_gate_open'));
    await stepOn(0, 3);

    // ------------------------------------------------------------------ 舊港・墓仔埔 (night)
    await stepOn(0, 32);
    await expectMap('lukang_shore');
    check('chest c5_04 (墓仔埔)', await openChest('c5_04'));
    check('chest c5_05 (舢舨)', await openChest('c5_05'));
    await shot('07_shore');
    await stepOn(35, 11);
    await expectMap('lukang');

    // ------------------------------------------------------------------ 進入古厝
    await stepOn(27, 41);
    await expectMap('luo_1f', '§3-6');
    check('entered (ch5_enter)', await flag('ch5_enter'));
    await shot('08_luo1f');
    await trigger('c5_mem1');
    check('記憶之門① (ch5_mem1)', await flag('ch5_mem1'));
    await trigger('c5_mem2');
    check('記憶之門② (ch5_mem2)', await flag('ch5_mem2'));
    check('memory mode off again', (await ev(() => G.state.vars.c5_mem)) === 0);
    check('chest c5_06 (帳房)', await openChest('c5_06'));
    check('chest c5_07 (下人房)', await openChest('c5_07'));
    check('chest c5_08 (兵器架)', await openChest('c5_08'));
    check('福伯的老棉襖 + 牛舌餅 + 虎頭槍', await ev(() => G.Inv.has('c5_old_coat') && G.Inv.has('sp_hutou') && G.Inv.count('niushebing') >= 3));
    await trigger('c5_pipe');
    await trigger('c5_hall_seal');
    // 憶蕈 (麻糬 sniffs it out; 雲歸 eats it "for research")
    await trigger('c5_mush');
    check('憶蕈 (mush_ch5, tuanzi_mush +1)', (await flag('mush_ch5')) && (await ev(() => G.state.vars.tuanzi_mush >= 1)));

    // ------------------------------------------------------------------ 二樓
    await stepOn(36, 8);
    await expectMap('luo_2f');
    await stepOn(16, 10); // not ready yet → pushed back
    check('公媽廳 blocked before the trunk', !(await flag('ch5_hall_intro')));
    await trigger('c5_trunk');
    check('戲箱 (ch5_trunk)', await flag('ch5_trunk'));
    await trigger('c5_toys');
    check('毛線石虎', await ev(() => G.Inv.has('c5_yarn_tiger')));
    await trigger('c5_vanity');
    await trigger('c5_study_box');
    check('chest c5_09 (紅纓的房間)', await openChest('c5_09'));
    check('chest c5_11 (青鋒的房間)', await openChest('c5_11'));
    check('chest c5_10 hidden before the mirrors', !(await openChest('c5_10')));

    // ------------------------------------------------------------------ P2 銅鏡與燈
    await stepOn(16, 8);
    check('公媽廳 intro', await flag('ch5_hall_intro'));
    await choices([0]); await trigger('c5_lampseat');
    check('lamp on the seat', await flag('ch5_lamp_seat'));
    const beam0 = await ev(() => { const st = G.state.vars.c5_mir; return JSON.stringify(st); });
    void beam0;
    // uncover all four (first use), then rotate the ones that need it — through the real events
    await ev(() => { for (const e of G.mapScene.enemies) e.stun = 9999; }); // keep the 怨婢 out of the scripted test
    for (const m of ['c5_m1', 'c5_m2', 'c5_m3', 'c5_m4']) await trigger(m);
    check('mirrors uncovered, puzzle not yet solved', !(await flag('ch5_mirrors')));
    await shot('09_mirrors_wrong');
    for (const m of ['c5_m1', 'c5_m2', 'c5_m3', 'c5_m4']) { await choices([0]); await trigger(m); }
    check('mirror puzzle solved (ch5_mirrors)', await flag('ch5_mirrors'));
    check('final mirror orientation matches the solution', await ev(() => { const s = G.state.vars.c5_mir; return s.m1.d === '/' && s.m2.d === '/' && s.m3.d === '\\' && s.m4.d === '\\'; }));
    await shot('10_mirrors_solved');
    check('chest c5_10 (書房, after mirrors)', await openChest('c5_10'));
    } else if (FROM === 'boss') {
      await page.goto('file://' + path.join(ROOT, 'index.html') + `?debug&map=luo_2f&x=28&y=11&lv=19&chapter=5&flags=${PRE_BOSS}`);
      await page.waitForFunction(() => window.G && G.Debug && G.mapScene, null, { timeout: 20000 });
      await ev(() => { G.Debug.setAutoplay(true); G.state.vars.ch5_time = 2; G.Inv.add('niushebing', 3); G.Inv.add('c5_luo_lantern', 1); });
      await idle();
    }
    if (FROM !== 'ending') {

    // ------------------------------------------------------------------ 記憶之門③ + 怨宴 + 卸下面具
    await ev(() => { for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) G.Story.ensureLevel(id, 19); G.Party.healAll(); });
    await stepOn(29, 11);
    await expectMap('luo_1f');
    await ev(() => G.Debug.stepOn(19, 15));
    await page.waitForTimeout(300);
    await idle(900000); // memory ③ + the boss battle (autoplay) + the unmasking take a few minutes headless
    check('怨宴 defeated (ch5_boss)', await flag('ch5_boss'));
    check('怨宴燭台 dropped', await ev(() => G.Inv.has('c5_feast_candle')));
    check('unmasked (ch5_unmask)', await flag('ch5_unmask'));
    await expectMap('luo_2f', 'unmask happens in the 公媽廳:');
    await shot('11_after_unmask');

    // ------------------------------------------------------------------ 福伯（心燈）
    await stepOn(29, 11);
    await stepOn(19, 28);
    await expectMap('luo_gate');
    check('福伯 step 1 (q_fubo started)', await ev(() => !!G.state.quests.q_fubo));
    // the player still carries 牛舌餅 from the chest → handed over directly
    check('福伯 at rest (ch5_fubo_done)', await flag('ch5_fubo_done'));
    check('心燈 lantern_fubo', await ev(() => G.Lanterns.has('lantern_fubo')));
    check('福伯的煙斗 + 洛家大門鑰匙', await ev(() => G.Inv.has('c5_fubo_pipe') && G.Inv.has('c5_luo_key')));
    await shot('12_fubo');
    } else {
      await page.goto('file://' + path.join(ROOT, 'index.html') + `?debug&map=lukang&x=27&y=39&lv=19&chapter=5&flags=${PRE_BOSS},ch5_boss,ch5_unmask,ch5_fubo_done`);
      await page.waitForFunction(() => window.G && G.Debug && G.mapScene, null, { timeout: 20000 });
      await ev(() => { G.Debug.setAutoplay(true); G.state.vars.ch5_time = 2; G.Quests.done('q_fubo'); });
      await idle();
    }

    // ------------------------------------------------------------------ 冬至 → 除夕 → chapter 6
    await stepOn(9, 13);
    await expectMap('lukang');
    await stepOn(49, 13);
    // the last beat hands over to chapter 6 (whose own opening may already be running) — don't wait for idle
    await page.waitForFunction(() => (G.state.flags.ch5_done && G.state.chapter === 6) || G.lastError, null, { timeout: 400000 });
    await page.waitForTimeout(1500);
    check('冬至麵線 (ch5_noodles + 青鋒的字條)', (await flag('ch5_noodles')) && (await ev(() => G.Inv.has('c5_qf_note'))));
    check('白芷 rests (ch5_rest)', await flag('ch5_rest'));
    check('chapter finished (ch5_done)', await flag('ch5_done'));
    check('main quest done', await ev(() => G.Quests.isDone('q_ch5_main')));
    check('G.Story.next(S, 6) reached (chapter === 6)', (await ev(() => G.state.chapter)) === 6);
    await shot('13_end');
  } catch (e) {
    check('playthrough completed without exception', false, e.message);
  }

  // ------------------------------------------------------------------ separate check: 福伯 without 牛舌餅 (auntie gives one)
  if (ONLY.includes('fubo')) try {
    await page.goto('file://' + path.join(ROOT, 'index.html') + '?debug&map=lukang&x=27&y=39&lv=19&chapter=5&flags=mochi_joined,yuyuan_joined,ch5_start,ch5_gate,ch5_mazu,ch5_lamp,ch5_enter,ch5_boss,ch5_unmask');
    await page.waitForFunction(() => window.G && G.Debug && G.mapScene, null, { timeout: 20000 });
    await ev(() => { G.Debug.setAutoplay(true); G.Inv.remove('niushebing', 99); });
    await idle();
    await stepOn(27, 41);
    check('[fubo] step 1 waits for a 牛舌餅', (await ev(() => G.Quests.stage('q_fubo'))) === 0 && !(await flag('ch5_fubo_done')));
    await stepOn(9, 13);
    await talk('lk_niushe');
    check('[fubo] 牛舌餅阿嬸 gives one for 福伯', await ev(() => G.Inv.has('niushebing') && G.Quests.stage('q_fubo') === 1));
    await stepOn(27, 41);
    await talk('fubo');
    check('[fubo] lantern lit after giving the 牛舌餅', await ev(() => G.Lanterns.has('lantern_fubo') && G.Quests.isDone('q_fubo')));
    // inn: warning when a side quest is unfinished → choose "還有事要辦"
    await ev(() => { G.state.quests.q_halfwell = { stage: 1, done: false }; });
    await warp('lukang', 49, 14, 'up');
    await choices([1]);
    await stepOn(49, 13);
    check('[inn] can postpone resting while a side quest is open', !(await flag('ch5_noodles')) && (await mapId()) === 'lukang_inn');
  } catch (e) {
    check('福伯 side path completed without exception', false, e.message);
  }

  // ------------------------------------------------------------------ separate check: every ch5 map loads & renders
  if (ONLY.includes('maps')) for (const [m, x, y, fl] of [['lukang', 27, 15, 'ch5_start'], ['lukang_mazu', 11, 12, 'ch5_start'], ['lukang_jiuqu', 18, 18, 'ch5_start,ch5_alley'],
    ['lukang_lantern', 6, 7, 'ch5_lamp'], ['lukang_inn', 6, 7, ''], ['lukang_wang', 10, 7, ''], ['lukang_shop', 6, 6, ''], ['lukang_shore', 30, 12, ''],
    ['luo_gate', 9, 10, 'ch5_gate'], ['luo_1f', 19, 20, 'ch5_lamp,ch5_enter,ev_luo_1f_c5_l1_intro'], ['luo_2f', 28, 11, 'ch5_lamp,ch5_enter']]) {
    try {
      await page.goto('file://' + path.join(ROOT, 'index.html') + `?debug&map=${m}&x=${x}&y=${y}&lv=18&chapter=5&flags=mochi_joined,yuyuan_joined,${fl}`);
      await page.waitForFunction(() => window.G && G.mapScene, null, { timeout: 20000 });
      await page.waitForTimeout(800);
      const st = await ev(() => ({ id: G.mapScene.def.id, err: G.lastError ? String(G.lastError) : null }));
      check(`map ${m} loads`, st.id === m && !st.err, JSON.stringify(st));
      if (SHOTS) await page.screenshot({ path: path.join(OUT, `ch5_map_${m}.png`) });
    } catch (e) { check(`map ${m} loads`, false, e.message); }
  }

  // ------------------------------------------------------------------ errors
  const winErr = await ev(() => window.__ch5err || []).catch(() => []);
  const own = (s) => !/js\/maps\/ch(?!5_)\d+_[a-z]+\.js/.test(s);
  const foreignSyntax = winErr.filter((e) => !own(e.file));
  const bad = problems.filter((p) => {
    if (/^pageerror: SyntaxError|^pageerror: Unexpected/.test(p) && foreignSyntax.length) return false;
    return true;
  });
  const lastErr = await ev(() => (G.lastError ? String(G.lastError.stack || G.lastError) : null)).catch(() => null);
  if (foreign.length) console.log(`  note: ignored ${foreign.length} runtime error(s) thrown by other chapters' files: ${[...new Set(foreign)].slice(0, 3).join(' | ')}`);
  if (foreignSyntax.length) console.log(`  note: ignored ${foreignSyntax.length} syntax error(s) in other chapters' files: ${[...new Set(foreignSyntax.map((e) => path.basename(e.file)))].join(', ')}`);
  check('no page/console errors or warnings', bad.length === 0, bad.slice(0, 8).join('\n        '));
  check('G.lastError is null', !lastErr, lastErr);

  await browser.close();
  const fails = results.filter((r) => !r.ok);
  console.log(`\n${fails.length ? 'FAIL' : 'PASS'}: ch5 — ${results.length - fails.length}/${results.length} checks passed`);
  process.exit(fails.length ? 1 : 0);
})();

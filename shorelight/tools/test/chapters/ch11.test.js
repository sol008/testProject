#!/usr/bin/env node
// Chapter 11 (黑水溝・彼岸) automated playthrough + both endings.
//
//   node tools/test/chapters/ch11.test.js            # full run (true ending, then normal ending)
//   node tools/test/chapters/ch11.test.js --shots    # also screenshot every map / key moment → tools/test/out/ch11/
//   node tools/test/chapters/ch11.test.js --from tower        # replay from the snapshot saved after segment 'field'
//   node tools/test/chapters/ch11.test.js --only normal       # one segment (normal needs snap_breath.json)
//   segments: temple magong flats xuanwu voyage field tower breath true normal  (3D renderer disabled; ch1–10 map files stubbed unless --all)
//
// Run A: ?debug&startch=11&autoplay — drives the critical path (every main event) and every side quest / 心燈,
//        forces the heart-lantern count ≥ G.Lanterns.THRESHOLD (G.Lanterns.add) → 真結局「千燈」 → credits → stinger → title.
// Run B: restores the run-A state from just before the last step of the 光之曼陀羅 with only a few lanterns
//        → 普通結局「彼岸」 → credits → stinger → title.
// Fails on page errors, console errors (ERR_FILE_NOT_FOUND ignored), G.lastError, or missing-art warnings.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'tools', 'test', 'out', 'ch11');
const SHOTS = process.argv.includes('--shots');
const ALL = process.argv.includes('--all');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : null; })();
fs.mkdirSync(OUT, { recursive: true });

const IGNORE = [/ERR_FILE_NOT_FOUND/, /Failed to load resource/, /favicon/, /willReadFrequently/];
const results = [];
let failed = false;
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info });
  if (!ok) failed = true;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${info && !ok ? '  — ' + info : ''}`);
}

class Run {
  constructor(browser, label) { this.browser = browser; this.label = label; this.errors = []; this.warns = []; this.shotN = 0; }
  async open(query) {
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    // 2D renderer for the playthrough (software WebGL in headless Chromium is far too slow for the 3D view)
    await this.ctx.addInitScript(() => { try { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false, lang: 'zh' })); } catch (e) { /* ignore */ } });
    this.page = await this.ctx.newPage();
    const p = this.page;
    // other chapters' map files are not needed by chapter 11; stub them (unless --all) so their work-in-progress can't fail this test
    if (!ALL) await p.route(/js\/maps\/ch([1-9]|10)_[a-z0-9_]+\.js$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stubbed by ch11.test.js */' }));
    p.on('console', (m) => {
      const t = m.text();
      if (m.type() === 'error' && !IGNORE.some((r) => r.test(t))) this.errors.push(t.slice(0, 600));
      if (m.type() === 'warning' && /^\[shorelight\]/.test(t)) this.warns.push(t.slice(0, 300));
    });
    p.on('pageerror', (e) => this.errors.push('pageerror: ' + (e.stack || e.message).slice(0, 800)));
    await p.goto(BASE + query);
    await p.waitForFunction(() => window.G && G.Debug && G.Scenes && G.Scenes.top(), null, { timeout: 30000 });
  }
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  // wait (slow machines!) until a predicate on the page holds, then for the game to settle
  async until(fn, arg, ms = 600000) {
    await this.page.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
    await this.idle();
  }
  async idle(ms = 900000) {
    // idle must hold for ~0.6 s (auto events start a frame after the previous script ends)
    const ok = await this.page.evaluate((t) => new Promise((res) => {
      const t0 = Date.now(); let since = 0;
      const iv = setInterval(() => {
        if (G.GameOverScene && G.Scenes.top() instanceof G.GameOverScene) { clearInterval(iv); res('gameover'); return; }
        const idle = !G.Script.busy() && G.Scenes.top() === G.mapScene && G.Render.fade.a < 0.05;
        if (!idle) since = 0; else if (!since) since = Date.now();
        if ((since && Date.now() - since > 600) || Date.now() - t0 > t) { clearInterval(iv); res(idle); }
      }, 50);
    }), ms);
    if (ok === 'gameover') throw new Error(`[${this.label}] GAME OVER (party wiped): ${await this.where()}`);
    if (!ok) throw new Error(`[${this.label}] not idle: ${await this.where()}`);
  }
  where() { return this.page.evaluate(() => `map=${G.mapScene && G.mapScene.def.id} top=${G.Scenes.top() && G.Scenes.top().constructor.name} busy=${G.Script.busy()} fade=${G.Render.fade.a.toFixed(2)}`); }
  flag(k) { return this.page.evaluate((k) => !!G.state.flags[k], k); }
  map() { return this.page.evaluate(() => G.mapScene && G.mapScene.def.id); }
  async choices(list) { await this.page.evaluate((l) => { G.Debug.choices = l.slice(); }, list); }
  async script(code) { await this.page.evaluate((c) => G.Script.run(new Function('S', `return (async () => { ${c} })();`)), code); await this.idle(); }
  async warp(map, x, y, dir = 'up') { await this.script(`await S.warp('${map}', ${x}, ${y}, '${dir}');`); }
  async talk(id) { await this.page.evaluate((id) => G.Debug.talk(id), id); await this.idle(); }
  async trigger(id) { await this.page.evaluate((id) => G.Debug.trigger(id), id); await this.idle(); }
  async step(x, y) { await this.page.evaluate(([x, y]) => G.Debug.stepOn(x, y), [x, y]); await this.page.waitForTimeout(120); await this.idle(); }
  async stepGo(x, y) { await this.page.evaluate(([x, y]) => G.Debug.stepOn(x, y), [x, y]); }
  async interactObj(t, x, y) {
    await this.page.evaluate(([t, x, y]) => {
      const o = G.mapScene.objects.find((ob) => ob.t === t && ob.x === x && ob.y === y);
      if (!o || !o.interact) throw new Error('no interactive object ' + t + '@' + x + ',' + y);
      return G.Script.run(async (S) => { if (typeof o.interact === 'function') await o.interact(S, o); else await S.lines(o.interact); });
    }, [t, x, y]);
    await this.idle();
  }
  // (the autoplay AI is far worse than a player; the test runs ~2 levels above the progression table to keep boss fights deterministic)
  async heal() { await this.page.evaluate(() => { G.Party.healAll(); }); }
  async levelTo(lv) {
    await this.page.evaluate((lv) => { for (const id of ['xinghe', 'hongying', 'yungui', 'baizhi']) if (G.state.members[id]) G.Story.ensureLevel(id, lv); G.Party.healAll(); }, lv);
  }
  async shot(name, force) {
    if (!SHOTS && !force) return;
    await this.page.waitForTimeout(250);
    const f = path.join(OUT, `${this.label}_${String(++this.shotN).padStart(2, '0')}_${name}.png`);
    await this.page.screenshot({ path: f });
  }
  async health(name) {
    const st = await this.page.evaluate(() => ({ last: G.lastError ? String(G.lastError.stack || G.lastError).slice(0, 500) : null }));
    check(`${this.label}: no errors after ${name}`, !this.errors.length && !st.last && !this.warns.length,
      [...this.errors, ...(st.last ? ['G.lastError: ' + st.last] : []), ...this.warns].join(' | '));
    this.errors.length = 0; this.warns.length = 0;
    await this.page.evaluate(() => { G.lastError = null; });
  }
  // watch the ending to the title screen, holding the skip key through the credits
  async toTitle(ms = 20 * 60000) {
    const t0 = Date.now();
    let held = false, lastLog = Date.now();
    while (Date.now() - t0 < ms) {
      const top = await this.page.evaluate(() => { const t = G.Scenes.top(); return t && t.constructor ? t.constructor.name : ''; });
      if (top === 'CreditsScene' && !held) { await this.shot('credits', true); await this.page.keyboard.down('ControlLeft'); held = true; }
      if (top !== 'CreditsScene' && held) { await this.page.keyboard.up('ControlLeft'); held = false; }
      if (top === 'GameOverScene') throw new Error(`[${this.label}] GAME OVER during the finale: ${await this.where()}`);
      if (top === 'TitleScene') { if (held) await this.page.keyboard.up('ControlLeft'); return true; }
      if (Date.now() - lastLog > 60000) {
        lastLog = Date.now();
        console.log('    … ' + await this.page.evaluate(() => `${G.mapScene && G.mapScene.def.id} top=${G.Scenes.top() && G.Scenes.top().constructor.name} ` +
          ['ch11_reunion', 'ch11_yexuan_p1', 'ch11_yexuan', 'ch11_nianer', 'ch11_wuxiang_1', 'ch11_wuxiang_2', 'ch11_wuxiang', 'ch11_done', 'ending_true', 'ending_normal'].filter((k) => G.state.flags[k]).join(',')));
      }
      await this.page.waitForTimeout(250);
    }
    throw new Error(`[${this.label}] never reached the title screen: ${await this.where()}`);
  }
}

const EXTRA_LANTERNS = [
  ['xd_atu_watch', '阿土伯的懷錶'], ['xd_ahuang', '阿黃回家'], ['lantern_tamsui_soldiers', '紅毛城的異鄉兵'], ['lantern_alian', '阿蓮與阿德'],
  ['lantern_fubo', '福伯'], ['lantern_linto', '林投姐'], ['ch7_heartlamp_tsou', '霧中的獵刀'], ['ch7_heartlamp_murals', '燈母祠的壁畫'],
  ['xd_yueqin_names', '月琴伯的名字'], ['xd_lighthouse_home', '燈塔守的家書'], ['xd_tao_tatala', '達悟家族的拼板舟'], ['xd_amis_haiji', '阿美族海祭'],
  ['q_test_unknown_lamp', '某一盞別人點的燈'],
];

// ---- the playthrough, cut into segments. Each segment ends with a snapshot (tools/test/out/ch11/snap_<seg>.json),
// so a failing segment can be replayed alone:  --from <seg> [--to <seg>]  or  --only <seg>.
const SEGMENTS = {
  temple: async (R) => {
  // 11-01 → 11-02 → 11-03 (title card, deck, Magong, temple)
  await R.until(() => G.state.flags.ch11_magong && G.mapScene && G.mapScene.def.id === 'penghu_tianhou');
  check('A: chapter set to 11', await R.ev(() => G.state.chapter === 11));
  check('A: 11-01 ch11_start', await R.flag('ch11_start'));
  check('A: 11-02 ch11_magong', await R.flag('ch11_magong'));
  check('A: arrived at 天后宮', (await R.map()) === 'penghu_tianhou');
  await R.shot('tianhou');
  await R.trigger('incense_in');                   // wrong order: 阿進伯 corrects (no penalty)
  check('A: wrong incense order does not advance', await R.ev(() => G.state.vars.ch11_incense === 1));
  await R.trigger('incense_sky');
  await R.trigger('incense_in');
  check('A: 11-03 ch11_tianhou + 媽祖香火袋', await R.flag('ch11_tianhou') && await R.ev(() => G.Inv.has('c11_mazu_pouch')));
  for (const id of ['ph_ajin', 'ph_ajin', 'ph_oldman', 'ph_prayer', 'ph_ref1']) await R.talk(id);
  },
  magong: async (R) => {
  // ---- 媽宮: NPCs, shop, inn, 添姆, 4-5 海賊的寶藏, 4-1 step 1
  await R.warp('penghu_magong', 25, 9, 'down');
  await R.shot('magong');
  for (const id of ['ph_agui', 'ph_cat', 'ph_xiuqin', 'ph_smith', 'ph_sailor', 'ph_kid_yao', 'ph_mother', 'ph_town1', 'ph_town2', 'ph_town3']) await R.talk(id);
  await R.talk('ph_xu'); await R.talk('ph_xu');
  check('A: 許秀才 twice (ch11_xu_2)', await R.flag('ch11_xu_2'));
  await R.talk('ph_kid_zhu');
  await R.trigger('tower_gong');
  check('A: 4-5 海賊的寶藏 (ch11_treasure, 海賊金幣)', await R.flag('ch11_treasure') && await R.ev(() => G.Inv.has('c11_pirate_coin')));
  await R.talk('ph_atian');
  check('A: 4-1 step 1 (ch11_weir_1)', await R.flag('ch11_weir_1'));
  await R.warp('penghu_atian', 6, 7);
  await R.shot('atian');
  await R.talk('ph_atian_wife');
  check('A: 添姆 金瓜米粉 (ch11_pumpkin)', await R.flag('ch11_pumpkin'));
  await R.warp('penghu_inn', 7, 8);
  await R.shot('inn');
  await R.ev(() => { G.state.gold = Math.max(G.state.gold, 500); });
  await R.choices([0]); await R.talk('ph_innkeeper');
  },
  flats: async (R) => {
  await R.levelTo(39);
  // a ?startch=11 party wears starter gear: buy the Magong smith's kit (as a player would before the flats)
  await R.ev(() => {
    const kit = { xinghe: ['c11_sw_xuanwu', 'c11_ar_coral'], hongying: ['c11_sp_jinggu', 'c11_ar_haiwen'], yungui: ['c11_fn_leishan', 'c11_ar_coral'] };
    for (const [id, items] of Object.entries(kit)) {
      for (const it of items.concat(['c11_hd_douli', 'c11_ft_bu', 'c11_ac_juhua'])) {
        const slot = G.Data.items[it].type;
        if (G.state.members[id].equip[slot] === it) continue;
        G.Inv.add(it, 1); G.Party.equip(id, slot, it);
      }
    }
    G.Party.healAll();
  });
  // ---- 石滬灘 (11-04), 4-1 steps 2–4, 4-4 玄武蕈, 11-05 烏鬚船主
  await R.warp('penghu_flats', 28, 1, 'down');
  check('A: 11-04 ch11_flats', await R.flag('ch11_flats'));
  await R.shot('flats');
  await R.talk('fl_ghost_fisher');
  await R.talk('fl_pirate_kid');
  await R.step(41, 7);
  check('A: 4-1 step 2 (ch11_weir_2)', await R.flag('ch11_weir_2'));
  await R.warp('penghu_magong', 16, 4, 'up');
  await R.choices([1]); await R.talk('ph_atian');          // 「……那就算了。」 → 紅纓 scolds, can retry
  check('A: 4-1 refusing keeps step 2', !(await R.flag('ch11_weir_3')));
  await R.choices([0]); await R.talk('ph_atian');
  check('A: 4-1 step 3 (阿添伯 follows)', await R.flag('ch11_weir_3'));
  await R.warp('penghu_flats', 28, 1, 'down');
  check('A: 阿添伯 trails the party on the flats', await R.ev(() => !!G.mapScene.npcs.find((n) => n.id === 'ph_atian_f')));
  await R.step(40, 8);
  check('A: 4-1 心燈 石滬的缺口', await R.ev(() => G.Lanterns.has('lantern_penghu_weir')) && await R.flag('ch11_weir_done') && await R.ev(() => G.Inv.has('c11_ac_weir_stone')));
  // 4-4: seven mushrooms (counter pre-set to 6 as if chapters 3–10 found theirs)
  await R.ev(() => { G.state.vars.tuanzi_mush = 6; G.state.vars.vision = 60; G.mapScene.computeSolid(); });
  await R.step(7, 9);
  await R.ev(() => { G.mapScene.player.dir = 'up'; });
  await R.trigger('mush7');
  check('A: 4-4 玄武蕈 + 七仙蕈全收集 (七色蕈鈴, 萬色符)', await R.flag('mush_7') && await R.ev(() => G.Inv.has('c11_ac_cosmic') && G.state.members.yungui.skills.includes('c11_yg_cosmic') && G.state.quests.q_tuanzi_mush && G.state.quests.q_tuanzi_mush.done));
  await R.step(7, 39);
  check('A: barrier before the captain sends the player back', (await R.ev(() => G.mapScene.player.y)) < 39);
  await R.heal();                                   // rest at the save point before the boss
  await R.step(20, 32);
  check('A: 11-05 烏鬚船主 beaten (海圖)', await R.flag('ch11_captain') && await R.ev(() => G.Inv.has('c11_blacktide_chart')));
  },
  xuanwu: async (R) => {
  // ---- 玄武嶼 / 萬魂窟 P1 / 長明殿 / 囚室 / 逆潮台
  await R.levelTo(43);
  await R.step(7, 43);
  check('A: 11-06 ch11_xuanwu', (await R.map()) === 'xuanwu_shore' && await R.flag('ch11_xuanwu'));
  await R.shot('xuanwu_shore');
  await R.step(2, 18);
  check('A: cave → 萬魂窟', (await R.map()) === 'xuanwu_b1');
  await R.step(20, 16);
  await R.shot('b1_hall');
  for (let i = 1; i <= 5; i++) { await R.choices([0]); await R.trigger('lamp' + i); }
  check('A: P1 五盞長明燈 solved (jars freed, 鎖魂鑰)', await R.flag('ch11_jars_freed') && await R.ev(() => G.Inv.has('c11_soul_key')));
  await R.shot('b1_freed');
  await R.step(21, 2);
  check('A: iron gate → 長明殿', (await R.map()) === 'xuanwu_1f');
  await R.trigger('study');
  check('A: 11-08 夜玄的書房 (ch11_study)', await R.flag('ch11_study'));
  await R.shot('xuanwu_1f');
  await R.step(2, 5);
  check('A: 囚室', (await R.map()) === 'xuanwu_cell');
  for (let i = 1; i <= 6; i++) await R.trigger('letter' + i);
  check('A: 11-09 六封信 + 牆上的字 (ch11_letters, 玉笛)', await R.flag('ch11_letters') && await R.ev(() => G.state.vars.ch11_letters_read === 6 && G.Inv.has('c11_bz_flute')));
  await R.shot('cell');
  await R.step(6, 8);
  await R.choices([0]); await R.trigger('north');
  check('A: 北牆暗門 (ch11_secret)', await R.flag('ch11_secret'));
  await R.heal();                                   // rest at the save point before the boss
  await R.step(21, 2);
  check('A: 11-10 鎖魂將 → 錨燈碎 (ch11_jailer, ch11_night_moves)', await R.flag('ch11_jailer') && await R.flag('ch11_night_moves'));
  check('A: back on the 王船 after 11-10', (await R.map()) === 'wangboat_blacktide');
  // C-state Magong (wind is back): 阿桂's gift
  await R.step(27, 8);
  check('A: gangway → 玄武嶼', (await R.map()) === 'xuanwu_shore');
  await R.warp('penghu_magong', 20, 7, 'up');
  await R.talk('ph_agui');
  check('A: 阿桂 C-state gift (丁香魚乾)', await R.flag('ch11_agui_gift'));
  },
  voyage: async (R) => {
  // ---- 出航 (11-11 → 11-12), 溺魂暗流 (11-13), 鯤 (11-14), 無光之霧 (11-15) → 彼岸 (11-16)
  await R.ev((L) => { for (const [id, n] of L) G.Lanterns.add(id, n); }, EXTRA_LANTERNS);
  await R.warp('wangboat_blacktide', 22, 8, 'right');
  await R.choices([0]); await R.talk('chenbo');
  check('A: 11-11 陳伯的往事 + 11-12 漂燈之海', await R.flag('ch11_chenbo_story') && await R.flag('ch11_sail') && await R.flag('ch11_leg1'));
  await R.shot('deck_blacktide');
  await R.choices(['暗流', 0]); await R.talk('chenbo');
  check('A: 4-2 step 1 平安信', await R.flag('ch11_tangshan_letter') && await R.ev(() => G.Inv.has('c11_pingan_letter')));
  for (const id of ['deck_hy', 'deck_yg', 'deck_yy', 'deck_mc']) await R.talk(id);
  await R.levelTo(44);
  await R.heal();                                   // rest at the save point before the boss
  await R.choices(['鯤之淵']); await R.talk('chenbo');
  check('A: 11-14 鯤 (鯤鱗甲)', await R.flag('ch11_kun') && await R.ev(() => G.Inv.has('c11_ar_kun_scale')));
  await R.choices(['無光之霧']); await R.talk('chenbo');
  check('A: 11-15 無光之霧 → 11-16 彼岸', await R.flag('ch11_fog') && await R.flag('ch11_farshore') && (await R.map()) === 'farshore_field');
  await R.shot('farshore');
  },
  field: async (R) => {
  // ---- 彼岸花原 (11-17, 4-2 step 3, NPCs, shop)
  await R.talk('fs_child');
  check('A: 花葉不相見 (ch11_flower_talk)', await R.flag('ch11_flower_talk'));
  for (const id of ['fs_waiting_f', 'fs_oldman', 'fs_teawoman', 'fs_soul1']) await R.talk(id);
  await R.step(27, 33);
  await R.step(27, 13);
  check('A: 11-17 蘇婉 (ch11_wife_met)', await R.flag('ch11_wife_met'));
  await R.step(27, 12);
  check('A: 4-2 心燈 唐山客的平安信', await R.ev(() => G.Lanterns.has('lantern_tangshan')) && await R.flag('ch11_tangshan_done'));
  await R.warp('farshore_field', 28, 38, 'down');
  await R.choices([1]); await R.talk('chenbo');
  },
  tower: async (R) => {
  // ---- 彼岸燈塔 1F–5F + 頂
  await R.levelTo(45);
  await R.step(27, 2);
  check('A: tower 1F', (await R.map()) === 'farshore_tower_1');
  await R.trigger('echo');
  check('A: 11-18 紅之層 (ch11_tower_1)', await R.flag('ch11_tower_1'));
  await R.shot('tower1');
  await R.step(11, 3);
  check('A: tower 2F', (await R.map()) === 'farshore_tower_2');
  await R.trigger('echo');
  check('A: 11-19 雲之層', await R.flag('ch11_tower_2'));
  await R.trigger('wx_12');                         // wrong first pick → thunder + hint
  check('A: P2 wrong order resets + hint', await R.flag('ch11_wx_hint'));
  for (const id of ['wx_8', 'wx_16', 'wx_7', 'wx_15', 'wx_12']) await R.trigger(id);
  check('A: P2 五行生生 solved', await R.flag('ch11_wuxing_puzzle'));
  await R.shot('tower2');
  await R.step(11, 3);
  check('A: tower 3F', (await R.map()) === 'farshore_tower_3');
  await R.trigger('echo');
  check('A: 11-20 舊潮之層 (planks over the echo sea)', await R.flag('ch11_tower_3') && await R.ev(() => G.mapScene.terrainAt(12, 17) === 'lantern_bridge'));
  await R.shot('tower3_planks');
  // a plank sinks under you after 1.5 s → you fall back to the platform (no damage)
  await R.step(12, 17);
  await R.page.waitForTimeout(3500);
  await R.idle();
  check('A: P3 sinking plank → fall back to safety', await R.ev(() => (G.state.vars.ch11_falls || 0) >= 1 && G.mapScene.terrainAt(G.mapScene.player.x, G.mapScene.player.y) !== 'lantern_bridge'));
  await R.step(11, 4);
  check('A: P3 沉板 solved', await R.flag('ch11_p3_done'));
  await R.step(11, 3);
  await R.trigger('echo');
  check('A: 11-21 火之層 (螢火・明 equipped)', await R.flag('ch11_tower_4') && await R.ev(() => G.state.members.xinghe.equip.weapon === 'c11_sw_yinghuo_ming'));
  await R.step(11, 3);
  check('A: tower 5F', (await R.map()) === 'farshore_tower_5');
  await R.trigger('echo');
  check('A: 11-22 燈之層 (lyric_ch11)', await R.flag('ch11_tower_5') && await R.flag('lyric_ch11'));
  for (const [x, y] of [[6, 12], [18, 6], [17, 16], [5, 8], [12, 17], [15, 5]]) { await R.step(x, y); await R.page.waitForTimeout(200); await R.idle(); }
  check('A: 4-3 心燈 她的記憶 (6 memories, 憶燈)', await R.flag('ch11_mem_all') && await R.ev(() => G.Lanterns.has('lantern_baizhi_memory') && G.Inv.has('c11_ac_memory_lamp')));
  await R.shot('tower5');
  await R.heal();                                   // rest at the save point before the boss
  await R.step(11, 6);
  check('A: 11-23 千年燈塔守', await R.flag('ch11_warden'));
  await R.step(11, 3);
  check('A: 11-24 燈心之門 → 一息界', await R.flag('ch11_breath') && (await R.map()) === 'breath_realm');
  await R.shot('breath');
  },
  breath: async (R) => {
  // ---- 一息界: 萬象童子 + optional 萬象遊戲 + 光之曼陀羅 (P4)
  await R.levelTo(46);
  await R.choices(['好，來玩']);
  await R.heal();                                   // rest at the save point before the boss
  await R.step(19, 24);
  check('A: 11-25 萬象童子 met', await R.flag('ch11_tongzi_met'));
  check('A: 萬象遊戲 (optional battle) played', await R.ev(() => G.state.flags.ch11_tongzi_game || G.state.battles > 0));
  await R.step(18, 10);
  await R.shot('mandala');
  for (const [x, y] of [[19, 8], [16, 3], [22, 6]]) await R.interactObj('crystal', x, y);
  check('A: P4 light reaches the seat', await R.flag('ch11_seat_lit'));
  },
  true: async (R) => {
  await R.levelTo(48);
  await R.stepGo(19, 6);                            // the ending runs to the title screen: don't wait for map idle
  // ---- 燈心: reunion → 夜玄 ×2 → 夜念 → 無相 ×3 → E-00 → 真結局 → credits → stinger → title
  await R.toTitle();
  const fin = await R.ev(() => ({ f: G.state.flags, party: G.state.party.slice(), n: G.Lanterns.count(), th: G.Lanterns.THRESHOLD }));
  check('A: 11-27 reunion (白芷 rejoined)', !!fin.f.ch11_reunion);
  check('A: 11-28 夜玄 two phases', !!fin.f.ch11_yexuan_p1 && !!fin.f.ch11_yexuan);
  check('A: 11-29 夜念', !!fin.f.ch11_nianer);
  check('A: 11-31 黑潮・無相 three phases, 千燈 unlocked', !!fin.f.ch11_wuxiang_1 && !!fin.f.ch11_wuxiang_2 && !!fin.f.ch11_wuxiang && !!fin.f.ch8_qiandeng && !!fin.f.qiandeng);
  check(`A: lanterns ${fin.n} ≥ threshold ${fin.th} → 真結局`, fin.n >= fin.th && !!fin.f.ending_true && !fin.f.ending_normal);
  check('A: game_clear + cleared_true', !!fin.f.game_clear && !!fin.f.cleared_true && !!fin.f.ch11_done);
  await R.shot('title_after_true', true);
  },
  normal: async (R) => {
  // the state from the end of 'breath', with only a few heart lanterns left
  await R.ev(() => {
    const keep = ['lantern_penghu_weir', 'lantern_tangshan', 'lantern_baizhi_memory', 'xd_atu_watch'];
    for (const id of Object.keys(G.state.lanterns)) if (!keep.includes(id)) delete G.state.lanterns[id];
  });
  await R.levelTo(48);
  await R.script("await S.warp('breath_realm', 19, 7, 'up', { reload: true });");
  check('B: lanterns below the threshold', await R.ev(() => G.Lanterns.count() < G.Lanterns.THRESHOLD));
  await R.stepGo(19, 6);                            // the ending runs to the title screen: don't wait for map idle
  await R.toTitle();
  const fin = await R.ev(() => ({ f: G.state.flags, n: G.Lanterns.count() }));
  check(`B: lanterns ${fin.n} < 14 → 普通結局`, !!fin.f.ending_normal && !fin.f.ending_true);
  check('B: game_clear + cleared_normal', !!fin.f.game_clear && !!fin.f.cleared_normal);
  await R.shot('title_after_normal', true);
  },
};
const ORDER = ['temple', 'magong', 'flats', 'xuanwu', 'voyage', 'field', 'tower', 'breath', 'true', 'normal'];

function snapPath(seg) { return path.join(OUT, `snap_${seg}.json`); }
async function saveSnap(R, seg) {
  const snap = await R.ev(() => JSON.stringify({ state: G.state, map: G.mapScene.def.id, x: G.mapScene.player.x, y: G.mapScene.player.y, dir: G.mapScene.player.dir }));
  fs.writeFileSync(snapPath(seg), snap);
}
// open a fresh page and continue from the snapshot taken at the end of segment `seg`
async function openFrom(browser, label, seg) {
  const f = snapPath(seg);
  if (!fs.existsSync(f)) throw new Error(`no snapshot ${f}: run the earlier segments first`);
  const snap = JSON.parse(fs.readFileSync(f, 'utf8'));
  const R = new Run(browser, label);
  await R.open('?debug&map=sandbox&x=5&y=5&autoplay=1');
  await R.idle();
  await R.ev((st) => { G.state = Object.assign(G.newState(), st); }, snap.state);
  await R.script(`await S.warp('${snap.map}', ${snap.x}, ${snap.y}, '${snap.dir}', { reload: true, fade: 0 });`);
  return R;
}

const TIMES = [];
async function play(browser, from, to) {
  let R = null;
  const i0 = ORDER.indexOf(from), i1 = ORDER.indexOf(to);
  for (let i = i0; i <= i1; i++) {
    const seg = ORDER[i];
    console.log(`\n── segment ${seg}${seg === 'true' ? ' → 真結局「千燈」' : seg === 'normal' ? ' → 普通結局「彼岸」' : ''}`);
    if (seg === 'temple') {
      R = new Run(browser, 'A');
      await R.open('?debug&startch=11&autoplay=1');
    } else if (seg === 'normal') {
      if (R) await R.ctx.close();
      R = await openFrom(browser, 'B', 'breath');
    } else if (!R) {
      R = await openFrom(browser, 'A', ORDER[i - 1]);
    }
    // the autoplay battle AI barely heals: run the fights on 'easy' so the story path, not the dice, is what gets tested
    await R.ev(() => { G.settings.battleSpeed = 8; G.settings.difficulty = 'easy'; });
    const ts = Date.now();
    await SEGMENTS[seg](R);
    await R.health(seg);
    TIMES.push([seg, (Date.now() - ts) / 1000]);
    console.log(`  ⏱ ${seg}: ${((Date.now() - ts) / 1000).toFixed(0)}s`);
    if (seg !== 'true' && seg !== 'normal') await saveSnap(R, seg);
  }
  if (R) await R.ctx.close();
}

(async () => {
  const t0 = Date.now();
  const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
  let from = arg('--from') || 'temple', to = arg('--to') || 'normal';
  if (ONLY) { from = ONLY; to = ONLY; }
  if (!ORDER.includes(from) || !ORDER.includes(to)) { console.log('segments: ' + ORDER.join(' ')); process.exit(2); }
  const browser = await chromium.launch();
  try {
    await play(browser, from, to);
  } catch (e) {
    failed = true;
    console.log('  ✗ EXCEPTION ' + (e.stack || e));
    results.push({ name: 'exception', ok: false, info: String(e) });
  } finally {
    await browser.close();
  }
  if (TIMES.length) console.log('\nsegment times: ' + TIMES.map(([k, t]) => `${k} ${t.toFixed(0)}s`).join(', '));
  const nOk = results.filter((r) => r.ok).length;
  console.log(`\nch11: ${failed ? 'FAIL' : 'PASS'} — ${nOk}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  process.exit(failed ? 1 : 0);
})();

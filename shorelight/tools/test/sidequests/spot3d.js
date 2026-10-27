#!/usr/bin/env node
// 3D spot check (?r3lite, render3d on) of the visual side-quest clues in chapters 1–2, with screenshots in
// tools/test/out/side_3d/. Visual only: the maps are opened with ?debug&map=… presets (no quest is played here; the
// chN.side.js runs play them in 2D).
//   ch1 mine_2 cave-in room: the 懷錶 glint (light) + 「石縫」 hint tag
//   ch2 mistforest_s side path: illusion trees without 靈視 / clearing + 阿山 with 靈視
//   ch2 tiger_den porter's room: the 擔子 basket + 「擔子」 hint tag
//   node tools/test/sidequests/spot3d.js
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');
const { assert } = L;

const OUT = path.join(L.ROOT, 'tools', 'test', 'out', 'side_3d');
const results = [];
const SPOTS = [
  ['ch1 懷錶 glint + tag', 'mine_2', 3, 21, 'ch1_start,ch1_ahuang_lost,ch1_mine_open,ch1_wind_done', null, (G) => G.mapScene.def.events.find((e) => e.id === 'watch').hint(G.state)],
  ['ch2 illusion trees (no 靈視)', 'mistforest_s', 26, 6, 'ch2_azhu_met,ch2_maze_solved', null, (G) => G.mapScene.blocked(28, 6)],
  ['ch2 clearing + 阿山 (靈視)', 'mistforest_s', 26, 6, 'ch2_azhu_met,ch2_maze_solved', 'vision', (G) => !G.mapScene.blocked(28, 6) && G.mapScene.npcActive(G.mapScene.npcs.find((n) => n.id === 'ashan'))],
  ['ch2 den 擔子 + tag', 'tiger_den', 3, 6, 'ch2_granny_house', null, (G) => G.mapScene.def.events.find((e) => e.id === 'bundle').hint === true],
];

(async () => {
  console.log('3D spot check (r3lite)');
  const browser = await chromium.launch();
  for (const [name, map, x, y, flags, extra, check] of SPOTS) {
    await L.run(results, name, browser, async (b, open) => {
      const s = await open(`?debug&map=${map}&x=${x}&y=${y}&lv=10&party=xinghe,baizhi&flags=${flags}&r3lite`);
      await s.page.waitForFunction((m) => G.mapScene && G.mapScene.def.id === m, map, { timeout: 240000 });
      await s.page.waitForTimeout(3000);
      if (extra === 'vision') await s.ev(() => G.Script.S.vision(60));
      await s.page.waitForTimeout(2500);
      await s.idle();
      await s.page.waitForTimeout(500);
      const r = await s.ev((src) => ({ on: !!(G.R3 && G.R3.enabled && G.R3.enabled() && G.mapScene.view3d), ok: !!new Function('G', 'return (' + src + ')(G)')(G) }), check.toString());
      assert(r.on, '3D view not active');
      assert(r.ok, 'clue state check failed');
      await s.shot(OUT, name.replace(/[^a-z0-9]+/gi, '_'));
      return s;
    });
  }
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log('\n' + (fail.length ? `FAIL — ${fail.length}/${results.length}` : `PASS — ${results.length}/${results.length}`));
  process.exit(fail.length ? 1 : 0);
})();

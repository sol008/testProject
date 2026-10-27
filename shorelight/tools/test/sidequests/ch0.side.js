#!/usr/bin/env node
// 序章　夢 — side content check, played from ?debug&startch=0 the way a player can (tools/test/sidequests/lib.js).
//
//   node tools/test/sidequests/ch0.side.js [--shots]
//
// The prologue has no side quests and no 心燈 (docs/guide/chapters/ch00.md, docs/qa/points_of_no_return.md). This run
// proves it stays that way and that its optional content is reachable on foot: the four drifting souls (each talked to
// twice; the child's soul follows after the second talk), the lamps lit on the way, and the hand-off to chapter 1 with
// no quest opened and no 心燈 lit.
'use strict';
const path = require('path');
const { chromium } = require('playwright');
const L = require('./lib');
const { assert, waitMap, goTo, actEvent } = L;

const SHOTS = process.argv.includes('--shots') ? path.join(L.ROOT, 'tools', 'test', 'out', 'side_ch0') : null;
const results = [];

async function soul(s, id, k) {
  const n0 = await L.logLen(s);
  await actEvent(s, id);
  const n1 = await L.logLen(s);
  if (id !== 'soul_c') { await actEvent(s, id); assert((await L.logLen(s)) - n1 >= 1, id + ' repeat line'); }
  else await actEvent(s, id);
  assert(n1 - n0 >= 3 && (await s.flags())['ch0_soul_' + k], id + ' first talk');
}

async function runPrologue(browser, open) {
  const s = await open('?debug&startch=0');
  await waitMap(s, 'dream');
  await soul(s, 'soul_a', 'a');
  await actEvent(s, 'lamp1', [0]);                  // first lamp → tutorial battle
  assert((await s.flags()).ch0_lamp1, 'lamp 1');
  await goTo(s, 10, 33, { through: true });         // the broken bridge
  await actEvent(s, 'lamp2'); await actEvent(s, 'lamp3');
  assert((await s.flags()).ch0_bridge, 'the bridge forms');
  await soul(s, 'soul_b', 'b');
  await soul(s, 'soul_c', 'c');
  assert((await s.flags()).ch0_soulc_follow, 'the child\'s soul follows after the second talk');
  await goTo(s, 10, 17, { through: true });         // the mist rises (0-6) somewhere on the way
  await s.idle();
  await soul(s, 'soul_d', 'd');
  await actEvent(s, 'lamp_w');
  await s.shot(SHOTS, 'souls_done');
  const q = await s.ev(() => ({ quests: Object.keys(G.state.quests).filter((k) => !(G.Data.quests[k] || {}).main), lanterns: Object.keys(G.state.lanterns) }));
  assert(!q.quests.length && !q.lanterns.length, 'the prologue opens no side quest and lights no 心燈: ' + JSON.stringify(q));
  await goTo(s, 10, 10, { through: true });         // 0-7 / 0-8 → chapter 1
  await s.page.waitForFunction(() => G.state.chapter === 1 && G.state.flags.ch0_done, null, { timeout: 120000 });
  return s;
}

(async () => {
  console.log('序章　夢 — side content');
  const browser = await chromium.launch();
  await L.run(results, 'ch0 prologue: four souls on foot, no side quest / 心燈, hand-off', browser, runPrologue);
  await browser.close();
  const fail = results.filter((r) => r.status !== 'PASS');
  console.log('\n' + (fail.length ? `FAIL — ${fail.length}/${results.length}` : `PASS — ${results.length}/${results.length}`));
  process.exit(fail.length ? 1 : 0);
})();

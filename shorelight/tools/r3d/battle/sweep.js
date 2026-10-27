// 3D battle sweep: auto-battle (×3) one troop per backdrop id (or the given troops) back-to-back in one page,
// screenshot each fight once, and fail on any console error / page error / battle that does not finish.
//   node tools/r3d/battle/sweep.js [troop,troop…] [--full] [--max N] [--skip troop,troop…]  (--skip resumes a timed-out run)
const L = require('./lib');
const path = require('path');
const fs = require('fs');
(async () => {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const mI = args.indexOf('--max'); const max = mI >= 0 ? +args[mI + 1] : 999;
  const sI = args.indexOf('--skip'); const skip = sI >= 0 ? String(args[sI + 1] || '').split(',') : [];
  const only = (args.find((a, i) => !a.startsWith('--') && !/^\d+$/.test(a) && (sI < 0 || i !== sI + 1)) || '').split(',').filter(Boolean);
  const out = path.join(L.ROOT, 'tools/r3d/battle/out', 'sweep' + (full ? '_full' : ''));
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, errors } = await L.open({ troop: 'shore_1', lv: 45, lite: !full, auto: true });
  await L.waitBattle(page);
  await page.evaluate(() => { G.Debug.setAutoplay(true); }); // results screens / dialogue advance on their own
  await L.until(page, () => !G.Battle3D.current, null, 600000).catch(() => {});
  // one troop per backdrop (bosses preferred: they exercise boss intros and big units)
  const list = only.length ? only : await page.evaluate(() => {
    const byBg = {};
    for (const [id, t] of Object.entries(G.Data.troops)) { if (!t.bg || !G.Backdrops.has(t.bg)) continue; if (!byBg[t.bg] || (t.boss && !G.Data.troops[byBg[t.bg]].boss)) byBg[t.bg] = id; }
    return Object.values(byBg);
  });
  const res = [];
  for (const troop of list.filter((t) => !skip.includes(t)).slice(0, max)) {
    const n0 = errors.length, t0 = Date.now();
    await page.evaluate((troop) => { G.Party.healAll(); G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; window.__sw = null; G.Script.run(async (S) => { window.__sw = await S.battle(troop); }); }, troop);
    let r = 'timeout';
    try {
      await L.until(page, () => G.Battle3D.current, null, 120000);
      await L.hold(page, 2.5);
      await L.snap(page, path.join(out, troop + '.png'));
      await L.until(page, () => window.__sw != null, null, 900000);
      r = await page.evaluate(() => window.__sw);
      await L.until(page, () => G.Scenes.top() === G.mapScene || G.Scenes.top().constructor.name === 'GameOverScene', null, 60000).catch(() => {});
      // game over → back to the map for the next fight
      await page.evaluate(() => { const t = G.Scenes.top(); if (t && t.constructor.name === 'GameOverScene') { G.Scenes.pop(t); } });
    } catch (e) { r = 'ERR ' + e.message.split('\n')[0]; }
    const errs = errors.slice(n0).filter((e) => !/ERR_FILE_NOT_FOUND/.test(e));
    const bg = await page.evaluate((t) => G.Data.troops[t].bg, troop);
    res.push({ troop, bg, r, s: Math.round((Date.now() - t0) / 1000), errs: errs.length });
    fs.writeFileSync(path.join(out, 'sweep.json'), JSON.stringify(res, null, 1));
    console.log(troop.padEnd(22), (bg || '').padEnd(14), String(r).padEnd(8), ((Date.now() - t0) / 1000).toFixed(0) + 's', errs.length ? 'ERRORS:\n  ' + errs.slice(0, 5).join('\n  ') : '');
  }
  const bad = res.filter((x) => x.errs || !['win', 'lose', 'flee'].includes(x.r));
  console.log(`sweep: ${res.length} battles, ${bad.length} problem(s)`);
  fs.writeFileSync(path.join(out, 'sweep.json'), JSON.stringify(res, null, 1));
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})();

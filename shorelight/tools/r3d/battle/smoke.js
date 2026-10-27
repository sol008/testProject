// Smoke test: start a battle in 3D, screenshot the intro and a few seconds of auto-battle, report console errors.
//   node tools/r3d/battle/smoke.js [troop] [--full] [--auto]
const L = require('./lib');
const path = require('path');
(async () => {
  const args = process.argv.slice(2);
  const troop = args.find((a) => !a.startsWith('--')) || 'shore_5';
  const full = args.includes('--full');
  const out = path.join(L.ROOT, 'tools/r3d/battle/out', 'smoke_' + troop + (full ? '_full' : ''));
  const { browser, page, errors } = await L.open({ troop, lite: !full, auto: args.includes('--auto'), verbose: args.includes('--v') });
  const t0 = Date.now();
  try {
    await L.waitBattle(page);
    console.log('battle up after', ((Date.now() - t0) / 1000).toFixed(1), 's');
    await L.hold(page, 0.35); await L.shot(page, out, '01_shatter');
    await L.hold(page, 1.2); await L.shot(page, out, '02_establish');
    await L.hold(page, 1.6); await L.shot(page, out, '03_neutral');
    const info = await page.evaluate(() => { const v = G.Battle3D.current; return { units: [...v.units.values()].map((u) => u.kind + ':' + (u.u.sprite || u.u.art || u.u.id)), fps: G.fps, ev: v.events.slice(-5) }; });
    console.log(JSON.stringify(info));
    await L.hold(page, 3); await L.shot(page, out, '04_later');
  } catch (e) { console.log('FAIL', e.message); await L.shot(page, out, 'fail'); }
  console.log('errors:', errors.length ? '\n' + errors.slice(0, 20).join('\n') : 0);
  await browser.close();
})();

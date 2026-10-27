// Evaluate a JS expression inside a running 3D battle.  node tools/r3d/battle/probe.js <troop> "<expr>" [--shot f.png]
const L = require('./lib');
(async () => {
  const [troop, expr] = process.argv.slice(2);
  const shotI = process.argv.indexOf('--shot');
  const { browser, page, errors } = await L.open({ troop, lv: 30 });
  await L.waitBattle(page);
  await L.hold(page, 2.5);
  console.log(await page.evaluate((e) => { try { return JSON.stringify(eval(e), null, 1); } catch (er) { return 'ERR ' + er.stack; } }, expr));
  if (shotI > 0) await page.screenshot({ path: process.argv[shotI + 1] });
  console.log('errors', errors.filter((e) => !/ERR_FILE/.test(e)).slice(0, 10));
  await browser.close();
})();

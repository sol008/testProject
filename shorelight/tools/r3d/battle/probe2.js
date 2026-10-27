// probe2: run setup expr, wait sec (view time), screenshot. node probe2.js troop "<expr>" sec out.png ["<expr2 printed after>"]
const L = require('./lib');
(async () => {
  const [troop, expr, sec, out, expr2] = process.argv.slice(2);
  const { browser, page, errors } = await L.open({ troop, lv: 40 });
  await L.waitBattle(page);
  await page.evaluate(() => { const s = G.Scenes.top(); s.auto = false; G.state.vars.autoBattle = false; });
  await L.waitCommand(page);
  console.log(await page.evaluate((e) => { try { return JSON.stringify(eval(e)); } catch (er) { return 'ERR ' + er.stack; } }, expr));
  await L.hold(page, +sec);
  await page.screenshot({ path: out });
  if (expr2) console.log(await page.evaluate((e) => { try { return JSON.stringify(eval(e)); } catch (er) { return 'ERR ' + er.stack; } }, expr2));
  console.log('errors', errors.filter((e) => !/ERR_FILE/.test(e)).slice(0, 10));
  await browser.close();
})();

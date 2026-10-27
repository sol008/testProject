// In-game smoke test of the 3D field view with r3lite.  node tools/r3d/props_street/game.js "map=jiufen&x=17&y=14" out.png [waitSec]
// Prints console errors / warnings that mention 3D props and lists which street-prop types on the map got a real model.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = 'map=jiufen', out = 'game.png', wait = '25'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if ((m.type() === 'error' && !/ERR_FILE_NOT_FOUND/.test(m.text())) || (m.type() === 'warning' && /model|prop|mupd|THREE/i.test(m.text()))) errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  // optional generated files (font subset, English chapters) are not in the repo
  const OPTIONAL = /fontdata\.js|i18n\/en_ch/;
  p.on('requestfailed', (r) => { if (!OPTIONAL.test(r.url())) errs.push('REQFAIL ' + r.url().split('shorelight/').pop()); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?debug&r3lite&' + qs, { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(+wait * 1000);
  const info = await p.evaluate(() => {
    const ms = G.Scenes && G.Scenes.top && G.Scenes.top();
    const objs = (ms && ms.objects) || [];
    const types = {};
    for (const o of objs) types[o.t] = (types[o.t] || 0) + 1;
    return { map: ms && ms.def && ms.def.id, types, models: Object.keys(types).filter((t) => G.Models.has(t)), fallbacks: Object.keys(types).filter((t) => !G.Models.has(t)) };
  }).catch((e) => ({ err: String(e) }));
  console.log(JSON.stringify(info));
  await p.screenshot({ path: out });
  console.log(errs.length ? errs.join('\n') : 'no console errors');
  await b.close();
})();

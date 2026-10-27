// Evaluate a JS snippet inside the asset viewer: node tools/r3d/chars/probe.js "<query>" "<js expression>"
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = '', js = '1'] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() !== 'log' || /^\[probe\]/.test(m.text())) logs.push(m.type() + ': ' + m.text().slice(0, 600)); });
  p.on('pageerror', (e) => logs.push('PAGEERR ' + (e.stack || e.message).slice(0, 800)));
  await p.goto('file://' + path.resolve(__dirname, process.env.VIEW || 'view.html') + '?w=640&h=360&' + qs, { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const r = await p.evaluate(js);
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
  console.log(logs.filter((l) => !/GPU stall|PCFSoft/.test(l)).slice(0, 20).join('\n'));
  await b.close();
})();

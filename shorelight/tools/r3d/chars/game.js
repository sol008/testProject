// In-game smoke test: node tools/r3d/chars/game.js "debug&r3lite&map=jiufen" out.png [seconds] [walk]
// Loads index.html, waits, optionally walks the player around, screenshots, prints console errors and Char3D stats.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [qs = 'debug&r3lite&map=jiufen', out = 'game.png', secs = '6', walk = ''] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => logs.push('PAGEERR ' + (e.stack || e.message).slice(0, 800)));
  await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?' + qs, { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(+secs * 1000);
  if (walk) {
    for (const k of walk.split(',')) { const [key, ms] = k.split(':'); await p.keyboard.down(key); await p.waitForTimeout(+ms || 600); await p.keyboard.up(key); }
    await p.waitForTimeout(800);
  }
  const st = await p.evaluate(() => {
    const v = G.R3 && G.R3.view; if (!v) return { view: null };
    const chars = []; if (v.actors) for (const [a, r] of v.actors) chars.push((r.id || '?') + (r.ch.isFallback ? '(bb)' : r.ch.T ? '(3d)' : '(?)'));
    const info = G.R3.renderer ? G.R3.renderer.info.render : {};
    return { view: v.constructor && v.constructor.name, chars, calls: info.calls, tris: info.triangles, fps: G.fps || null };
  });
  console.log(JSON.stringify(st));
  await p.screenshot({ path: out });
  console.log(logs.filter((l) => !/GPU stall/.test(l)).slice(0, 30).join('\n'));
  await b.close();
})();

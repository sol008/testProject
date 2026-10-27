// In-game smoke test for the animals: loads a map with both pets following, walks the player around,
// screenshots and reports console errors.
//   node tools/r3d/animals/game.js [map] [outPrefix] [extraQuery]
// e.g. node tools/r3d/animals/game.js jiufen /tmp/g
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [map = 'jiufen', out = 'game', extra = ''] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /animal|Animal|THREE/.test(m.text()))) errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + '\n' + (e.stack || '').slice(0, 500)));
  // test-only shim: the merged base's mapview.js calls MapScene.hooks(), which map.js does not define yet
  await p.addInitScript(() => {
    const iv = setInterval(() => {
      if (window.G && G.MapScene && !G.MapScene.prototype.hooks) {
        G.MapScene.prototype.hooks = function (name) { const out = []; const d = this.def || {}; if (typeof d[name] === 'function') out.push(d[name].bind(d)); if (typeof this[name] === 'function' && name !== 'hooks') out.push(this[name].bind(this)); return out; };
        clearInterval(iv);
      }
    }, 5);
  });
  const qs = `debug&r3lite&map=${map}&party=xinghe,baizhi&flags=mochi_joined,yuyuan_joined${extra ? '&' + extra : ''}`;
  await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + '?' + qs, { waitUntil: 'load', timeout: 120000 });
  await p.waitForTimeout(9000);
  const info = await p.evaluate(() => {
    const v = G.R3 && G.R3.view; const ms = G.Scenes && G.Scenes.top && G.Scenes.top();
    const fol = ms && ms.followers ? ms.followers.map((f) => f.id) : null;
    let animals = 0; if (v && v.actors) for (const [, r] of v.actors) if (r.ch && r.ch.root && /^animal:/.test(r.ch.root.name)) animals++;
    return { view: !!v, followers: fol, animals, calls: G.R3.renderer ? G.R3.renderer.info.render.calls : -1 };
  }).catch((e) => ({ err: e.message }));
  console.log('info', JSON.stringify(info));
  await p.screenshot({ path: out + '_0.png' });
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  for (let i = 0; i < keys.length; i++) {
    await p.keyboard.down(keys[i]); await p.waitForTimeout(1300); await p.keyboard.up(keys[i]);
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}_${i + 1}.png` });
  }
  await p.waitForTimeout(6000);
  await p.screenshot({ path: out + '_idle.png' });
  console.log(errs.length ? errs.slice(0, 30).join('\n') : 'no console errors');
  await b.close();
})();

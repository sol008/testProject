// Long-fight probe: one troop in 3D (r3lite) with the chapter-test battle bot, logging every 10 s: real fps, scenes, round,
// actor, HP, phase, last view events. Ends on a result or a Game Over (which S.battle only resolves after a retry).
//   node tools/r3d/battle/bossprobe.js [troop] [--fragile] [--nobot] [--2d]     (MAXS=seconds, default 900)
const { chromium } = require('playwright');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const troop = process.argv[2] || 'boss_wuxiang';
const A = process.argv.slice(3);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (!A.includes('--nobot')) await ctx.addInitScript({ path: path.join(ROOT, 'tools/test/lib/battlebot.js') });
  const r3 = !A.includes('--2d');
  await ctx.addInitScript((r3) => { localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: r3 })); }, r3);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); if (m.type() === 'warning' && /shorelight/.test(m.text())) console.log('[warn]', m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + (e.stack || e.message).slice(0, 600)));
  await page.goto('file://' + ROOT + `/index.html?debug&r3lite&battle=${troop}&party=xinghe,hongying,yungui,baizhi&lv=48&auto=1&autoplay=1`);
  await page.waitForFunction(() => window.G && G.Scenes && G.Scenes.stack.some((s) => s instanceof G.Battle.Scene), null, { timeout: 300000, polling: 200 });
  if (A.includes('--fragile')) await page.evaluate(() => { const b = G.Scenes.stack.find((s) => s instanceof G.Battle.Scene); for (const u of b.enemies) u.hp = Math.max(1, Math.ceil(u.mhp * 0.15)); });
  await page.evaluate(() => { window.__fr = 0; const f = () => { window.__fr++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const t0 = Date.now(); let lastFr = 0, lastT = t0;
  while (Date.now() - t0 < (+process.env.MAXS || 900) * 1000) {
    const s = await page.evaluate(() => {
      const b = G.Scenes.stack.find((s) => s instanceof G.Battle.Scene);
      const v = G.Battle3D && G.Battle3D.current;
      return { names: G.Scenes.stack.map((s) => s.constructor.name).join('>'), res: window.__battleResult, fr: window.__fr, diff: G.settings.difficulty,
        b: b && { r: b.rounds, result: b.result, act: b.active && b.active.id, en: b.enemies.map((e) => `${e.id}:${e.hp}/${e.mhp} ph${e.phase}${e.dead ? ' dead' : ''}`).join(' '), pt: b.party.map((p) => p.id.slice(0, 2) + p.hp).join(' '), ink: !!(v && v.ink), cut: !!b.cutin, msg: b.msg && b.msg.text },
        v: v && { rt: +v.rt.toFixed(1), act: !!v.action, kind: v.director.kind, ev: v.events.slice(-2).map((e) => e.k + (e.id ? ':' + e.id : '')).join(' ') } };
    });
    const now = Date.now(); const fps = ((s.fr - lastFr) / ((now - lastT) / 1000)).toFixed(1); lastFr = s.fr; lastT = now;
    console.log(((now - t0) / 1000).toFixed(0) + 's fps=' + fps, JSON.stringify(s));
    if (s.res != null || /GameOver/.test(s.names)) break;
    await page.waitForTimeout(10000);
  }
  console.log('errors', errors);
  await browser.close();
})();

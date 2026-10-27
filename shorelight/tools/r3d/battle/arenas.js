// Render every battle arena (one per backdrop id) from two angles and build contact sheets.
//   node tools/r3d/battle/arenas.js [ids,comma,separated] [--full]
const L = require('./lib');
const path = require('path');
const fs = require('fs');
(async () => {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const only = (args.find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
  const out = path.join(L.ROOT, 'tools/r3d/battle/out', 'arenas' + (full ? '_full' : ''));
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, errors } = await L.open({ troop: 'shore_5', lv: 40, lite: !full });
  await L.waitBattle(page);
  await page.evaluate(() => { const s = G.Scenes.top(); s.auto = false; G.state.vars.autoBattle = false; for (const p of s.party) p.hp = p.mhp = 99999; for (const e of s.enemies) e.hp = e.mhp = 99999; });
  await L.waitCommand(page);
  await page.evaluate(() => { const s = G.Scenes.top(); s.drawHud = () => {}; s.view3d.drawOverlay = () => {}; });
  const ids = only.length ? only : await page.evaluate(() => G.Backdrops.ids());
  const views = {
    a: { pos: [6.5, 3.6, 14.5], look: [-1, 1.3, -1], fov: 40 },      // the neutral battle view
    b: { pos: [9.5, 2.4, 3.5], look: [-6, 1.6, -2.5], fov: 44 },      // over the party's shoulder toward the enemies
  };
  const files = [];
  for (const id of ids) {
    const t0 = Date.now();
    const ok = await page.evaluate((id) => { try { G.Battle3D.current.rebuildArena(id); return true; } catch (e) { return String(e.stack || e); } }, id);
    if (ok !== true) { console.log(id, 'BUILD FAILED', ok); continue; }
    for (const k of Object.keys(views)) {
      await page.evaluate((c) => { G.Battle3D.current.debugCam = c; }, views[k]);
      await L.hold(page, 0.25);
      const f = path.join(out, `${id}_${k}.png`);
      await page.screenshot({ path: f });
      files.push({ id, k, f });
    }
    console.log(id, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  }
  // contact sheets (8 per sheet: 2 views × 4 ids)
  for (let s = 0; s * 8 < files.length; s++) {
    const chunk = files.slice(s * 8, s * 8 + 8);
    const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(2,640px);gap:2px">${chunk.map((x) => `<div style="position:relative"><img src="file://${x.f}" width=640 height=360><span style="position:absolute;left:6px;top:4px;color:#fff;font:bold 18px sans-serif;text-shadow:0 0 3px #000">${x.id} ${x.k}</span></div>`).join('')}</body></html>`;
    const hf = path.join(out, `sheet${s}.html`);
    fs.writeFileSync(hf, html);
    const p2 = await browser.newPage({ viewport: { width: 1282, height: 1450 } });
    await p2.goto('file://' + hf); await p2.waitForTimeout(300);
    await p2.screenshot({ path: path.join(out, `sheet${s}.png`), fullPage: true });
    await p2.close();
    console.log('sheet', path.join(out, `sheet${s}.png`));
  }
  console.log('errors:', errors.filter((e) => !/ERR_FILE_NOT_FOUND/.test(e)).slice(0, 20).join('\n') || 0);
  await browser.close();
})();

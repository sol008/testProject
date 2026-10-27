// In-game smoke test for architecture team B: loads maps with ?debug&r3lite, places the player next to an
// arch_coast object, waits for the 3D view, screenshots, and reports console errors and any 2D-billboard
// fallbacks for arch_coast types.   node tools/r3d/arch_coast/ingame.js out_dir [map[:type] ...]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const MINE = ['lighthouse', 'lighthouse_lamp', 'kuba', 'bunun_house', 'tao_house', 'tatala', 'c10_amis_house', 'c10_fish_rack', 'c10_denggao', 'c10_monster_show', 'totem', 'millet_rack', 'drying_rack', 'fishing_net', 'loom', 'wang_boat', 'guzhao', 'stone_weir', 'boat_small', 'boat_ferry', 'dock_post', 'rainbow_arch'];
const DEFAULT = ['orchid_shore:tao_house', 'amis_village:c10_amis_house', 'truku_village:loom', 'toucheng:guzhao', 'penghu_flats:stone_weir', 'eluanbi:lighthouse', 'lighthouse_top:lighthouse_lamp', 'tsou_hosa:kuba', 'bunun_home:bunun_house', 'donggang:wang_boat', 'badouzi:fishing_net', 'zhuqian_mifen:drying_rack', 'huilan:c10_denggao'];
(async () => {
  const [outDir = '.', ...args] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const list = args.length ? args : DEFAULT;
  const b = await chromium.launch();
  let bad = 0;
  for (const item of list) {
    const [map, type] = item.split(':');
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error' && !/ERR_FILE_NOT_FOUND|favicon/.test(m.text())) errs.push(m.text().slice(0, 300)); });
    p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
    // first find the object to stand next to
    await p.goto('file://' + path.resolve(__dirname, '../../../index.html') + `?debug&r3lite&map=${map}`, { waitUntil: 'load' });
    const MS = '(G.Scenes.stack.find((s) => s.view3d) || null)';
    await p.waitForFunction(MS, null, { timeout: 120000 }).catch(() => {});
    const target = await p.evaluate(([type, MINE]) => {
      const ms = G.Scenes.stack.find((s) => s.view3d); if (!ms || !ms.objects) return null;
      const o = ms.objects.find((q) => q.t === type) || ms.objects.find((q) => MINE.includes(q.t));
      if (!o) return null;
      const d = G.Objects.get(o.t) || { w: 1, h: 1 };
      return { x: o.x + Math.floor((o.w || d.w) / 2), y: Math.min(ms.h - 2, o.y + (o.h || d.h) + 1), t: o.t };
    }, [type, MINE]);
    if (target) {
      await p.evaluate(([m, t]) => G.Mapx.goto(m, t.x, t.y, 'up'), [map, target]).catch((e) => errs.push('goto ' + e.message));
    }
    await p.waitForTimeout(4000);
    const rep = await p.evaluate((MINE) => {
      const ms = G.Scenes.stack.find((s) => s.view3d); const v = ms && ms.view3d; if (!v) return { noView: true };
      const fb = new Set(), real = new Set();
      for (const [, node] of v.nodes) { const o = node.userData.o; if (!o || !MINE.includes(o.t)) continue; const c = node.children[0]; if (c && c.userData.fallback) fb.add(o.t); else real.add(o.t); }
      return { fallback: [...fb], real: [...real], calls: G.R3.renderer.info.render.calls, tris: G.R3.renderer.info.render.triangles };
    }, MINE).catch((e) => ({ err: e.message }));
    const file = path.join(outDir, `${map}.png`);
    await p.screenshot({ path: file });
    const problems = errs.length || (rep.fallback && rep.fallback.length) || rep.noView;
    if (problems) bad++;
    console.log(`${problems ? 'FAIL' : 'ok  '} ${map.padEnd(16)} near ${target ? target.t : '-'}  ${JSON.stringify(rep)}${errs.length ? '\n   ' + errs.slice(0, 5).join('\n   ') : ''}`);
    await p.close();
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();

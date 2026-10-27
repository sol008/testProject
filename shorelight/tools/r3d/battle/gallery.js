// VFX gallery: with the battle paused at the command menu, fire every fx id at the enemies from a fixed camera and
// screenshot each effect at its build-up and its impact. Builds contact sheets in out/gallery/.
//   node tools/r3d/battle/gallery.js [ids,comma] [--troop t] [--full]
const L = require('./lib');
const path = require('path');
const fs = require('fs');
const ALL = ['slash', 'slash_multi', 'claw', 'claw_multi', 'bite', 'thrust', 'fire', 'fire_big', 'water', 'water_big', 'wood', 'wood_big', 'metal', 'metal_big', 'earth', 'earth_big',
  'wind', 'dark', 'ghost', 'lantern', 'magic', 'beam', 'heal', 'heal_all', 'revive', 'buff', 'cure', 'debuff', 'poison', 'sleep', 'seal', 'stun', 'song', 'kaleido', 'summon', 'combo',
  'ultimate_xinghe', 'ultimate_baizhi', 'ultimate_hongying', 'ultimate_yungui', 'ultimate_chenbo', 'hit', 'kill', 'status'];
(async () => {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const tI = args.indexOf('--troop');
  const troop = tI >= 0 ? args[tI + 1] : 'shore_5';
  const only = (args.find((a) => !a.startsWith('--') && a !== troop) || '').split(',').filter(Boolean);
  const ids = only.length ? only : ALL;
  const out = path.join(L.ROOT, 'tools/r3d/battle/out', 'gallery' + (full ? '_full' : ''));
  fs.mkdirSync(out, { recursive: true });
  const { browser, page, errors } = await L.open({ troop, lv: 40, lite: !full });
  await L.waitBattle(page);
  await page.evaluate(() => { const s = G.Scenes.top(); s.auto = false; G.state.vars.autoBattle = false; for (const p of s.party) p.hp = p.mhp = 99999; for (const e of s.enemies) e.hp = e.mhp = 99999; G.settings.battleSpeed = 1; });
  await L.waitCommand(page);
  await page.evaluate(() => { const s = G.Scenes.top(); s.drawHud = () => {}; });
  const files = [];
  for (const id of ids) {
    // pick caster/targets/camera per kind
    const info = await page.evaluate((id) => {
      const s = G.Scenes.top(), v = s.view3d;
      const ally = /^(heal|revive|buff|cure|ultimate_baizhi)/.test(id);
      const who = { ultimate_xinghe: 'xinghe', ultimate_baizhi: 'baizhi', ultimate_hongying: 'hongying', ultimate_yungui: 'yungui', ultimate_chenbo: 'xinghe', song: 'baizhi', summon: 'xinghe', combo: 'xinghe' }[id];
      const u = s.party.find((p) => p.id === who) || s.party[0];
      const all = /_big|_all|ultimate|combo|kaleido/.test(id);
      const targets = ally ? (all ? s.party.slice() : [s.party[1]]) : (all ? s.alive('enemy') : [s.alive('enemy')[1] || s.alive('enemy')[0]]);
      v.debugCam = ally ? { pos: [1.5, 2.6, 10], look: [5.2, 1.2, 0], fov: 42 } : { pos: [3, 2.6, 10.5], look: [-3.8, 1.3, 0.6], fov: 42 };
      return { ally, n: targets.length, caster: u.id };
    }, id);
    await L.hold(page, 0.3);
    const T = await page.evaluate((id) => {
      const s = G.Scenes.top(), v = s.view3d;
      const ally = /^(heal|revive|buff|cure|ultimate_baizhi)/.test(id);
      const who = { ultimate_xinghe: 'xinghe', ultimate_baizhi: 'baizhi', ultimate_hongying: 'hongying', ultimate_yungui: 'yungui', song: 'baizhi', combo: 'xinghe' }[id];
      const u = s.party.find((p) => p.id === who) || s.party[0];
      const all = /_big|_all|ultimate|combo|kaleido/.test(id);
      const targets = ally ? (all ? s.party.slice() : [s.party[1]]) : (all ? s.alive('enemy') : [s.alive('enemy')[1] || s.alive('enemy')[0]]);
      if (id === 'hit') { v.onDamage(targets[0], 100, { attacker: u, crit: true, elem: 'fire' }); return 0.05; }
      if (id === 'kill') { const e = targets[0]; v.fx.kill(e); s.tween(e, { alpha: 0 }, 0.8, 'linear'); return 0.3; }
      if (id === 'status') { const st = ['poison', 'seal', 'sleep', 'stun', 'trance', 'shield']; s.alive('enemy').forEach((e, i) => { e.st[st[i % st.length]] = 3; e.st.atkUp = 3; }); s.party[0].st.shield = { turns: 3, amt: 99 }; s.party[1].st.regen = 3; return 0.6; }
      const sk = id === 'combo' ? G.Data.skills.c_xingbai : { elem: /fire/.test(id) ? 'fire' : /water/.test(id) ? 'water' : /wood/.test(id) ? 'wood' : /metal/.test(id) ? 'metal' : /earth/.test(id) ? 'earth' : null, type: ally ? 'heal' : 'mag' };
      if (id === 'cast') { v.onCast(u, sk); return 0.4; }
      v.fx.cast(u, sk);
      return v.fx.play(id, u, targets, sk);
    }, id);
    await L.hold(page, Math.max(0.05, T * 0.55));
    let f = path.join(out, `${id}_a.png`); await page.screenshot({ path: f }); files.push({ id, k: 'build', f });
    await L.hold(page, T * 0.45 + 0.12);
    f = path.join(out, `${id}_b.png`); await page.screenshot({ path: f }); files.push({ id, k: 'impact', f });
    await L.hold(page, 1.6);
    await page.evaluate(() => { const s = G.Scenes.top(); for (const e of s.enemies) { e.alpha = 1; e.dead = false; e.st = {}; } for (const p of s.party) p.st = {}; });
    console.log(id, 'T=' + T.toFixed(2));
  }
  for (let s = 0; s * 8 < files.length; s++) {
    const chunk = files.slice(s * 8, s * 8 + 8);
    const html = `<html><body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(2,640px);gap:2px">${chunk.map((x) => `<div style="position:relative"><img src="file://${x.f}" width=640 height=360><span style="position:absolute;left:6px;top:4px;color:#fff;font:bold 18px sans-serif;text-shadow:0 0 3px #000">${x.id} ${x.k}</span></div>`).join('')}</body></html>`;
    const hf = path.join(out, `sheet${s}.html`); fs.writeFileSync(hf, html);
    const p2 = await browser.newPage({ viewport: { width: 1282, height: 1450 } });
    await p2.goto('file://' + hf); await p2.waitForTimeout(300);
    await p2.screenshot({ path: path.join(out, `sheet${s}.png`), fullPage: true }); await p2.close();
    console.log('sheet', s);
  }
  console.log('errors:', errors.filter((e) => !/ERR_FILE_NOT_FOUND/.test(e)).slice(0, 20).join('\n') || 0);
  await browser.close();
})();

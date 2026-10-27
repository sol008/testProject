// Cinematic tour of one battle in manual mode: intro, command camera, target camera, melee swing/impact, enemy turn,
// spell cast/impact, 劍意 ultimate (cut-in + impact), finishing blow, victory, ink-wash outro. Screenshots → out/tour_<troop>/
//   node tools/r3d/battle/tour.js [troop] [--full] [--lv N] [--party a,b,c]
const L = require('./lib');
const path = require('path');
(async () => {
  const args = process.argv.slice(2);
  const troop = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a) && !a.includes(',')) || 'boss_tiger';
  const full = args.includes('--full');
  const lvI = args.indexOf('--lv'); const lv = lvI >= 0 ? +args[lvI + 1] : 25;
  const pI = args.indexOf('--party'); const party = pI >= 0 ? args[pI + 1] : null;
  const out = path.join(L.ROOT, 'tools/r3d/battle/out', 'tour_' + troop + (full ? '_full' : ''));
  const { browser, page, errors } = await L.open({ troop, lv, lite: !full, party, verbose: args.includes('--v') });
  const T0 = Date.now();
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('step', name, 'FAILED', e.message.split('\n')[0]); try { await L.shot(page, out, 'fail_' + name); } catch (e2) { /* page gone */ } } };
  try {
    await L.waitBattle(page);
    // keep the fight going: enemies can't kill the party, and nothing dies before we want it to
    await page.evaluate(() => { const s = G.Scenes.top(); for (const e of s.enemies) { e.hp = e.mhp = Math.max(e.mhp, 99999); } for (const p of s.party) { p.hp = p.mhp = 99999; p.mp = p.mmp = 999; } s.auto = false; G.state.vars.autoBattle = false; G.settings.battleSpeed = 1; });
    await step('intro', async () => { await L.hold(page, 0.3); await L.shot(page, out, '01_shatter'); await L.hold(page, 0.9); await L.shot(page, out, '02_establish'); });
    await step('command', async () => { await L.waitCommand(page); await L.hold(page, 0.9); await L.shot(page, out, '03_command'); });
    await step('target', async () => {
      await page.evaluate(() => { const s = G.Scenes.top(); s.ui.target({ kind: 'attack' }, 'enemy'); });
      await L.hold(page, 0.8); await L.shot(page, out, '04_target');
    });
    await step('melee', async () => {
      await page.evaluate(() => { const s = G.Scenes.top(); const ui = s.ui; ui.done({ kind: 'attack', targets: [ui.tg.pool[ui.tg.i]] }); });
      const a = await L.nextEvent(page, 'action'); await L.atRt(page, a.rt + 0.18); await L.shot(page, out, '05_runup');
      const f = await L.nextEvent(page, 'fx'); await L.atRt(page, f.rt + f.T * 0.55); await L.shot(page, out, '06_swing');
      await L.atRt(page, f.rt + f.T + 0.04); await L.shot(page, out, '07_impact');
    });
    await step('enemy', async () => {
      const a = await L.nextEvent(page, 'action', 240000, { side: 'enemy' }); await L.atRt(page, a.rt + 0.1); await L.shot(page, out, '08_enemy_turn');
      const f = await L.nextEvent(page, 'fx', 240000, { side: 'enemy' }); await L.atRt(page, f.rt + f.T + 0.05); await L.shot(page, out, '09_enemy_hit');
    });
    await step('spell', async () => {
      await L.waitCommand(page);
      const sk = await page.evaluate(() => {
        const s = G.Scenes.top(), u = s.ui.u;
        const list = s.usableSkills(u).filter((k) => k.type === 'mag' || (k.type === 'phys' && /_big|fire|water|earth|metal|wood/.test(k.fx || '')));
        const pick = list.sort((a, b) => (b.mp || 0) - (a.mp || 0))[0];
        const id = Object.keys(G.Data.skills).find((k) => G.Data.skills[k] === pick);
        if (!id) { s.ui.done({ kind: 'attack', targets: [s.alive('enemy')[0]] }); return null; }
        s.ui.done(s.cmdForSkill(u, id, s.alive('enemy')[0]));
        return id + ' ' + pick.fx + ' by ' + u.id;
      });
      console.log('spell', sk);
      const a = await L.nextEvent(page, 'action'); await L.atRt(page, a.rt + 0.3); await L.shot(page, out, '10_cast');
      const f = await L.nextEvent(page, 'fx'); await L.atRt(page, f.rt + f.T * 0.6); await L.shot(page, out, '11_spell_travel');
      await L.atRt(page, f.rt + f.T + 0.08); await L.shot(page, out, '12_spell_impact');
      await L.atRt(page, f.rt + f.T + 0.4); await L.shot(page, out, '13_spell_after');
    });
    await step('ultimate', async () => {
      await L.waitCommand(page);
      const who = await page.evaluate(() => { const s = G.Scenes.top(), u = s.ui.u; u.gauge = 100; const ult = G.Data.chars[u.id].ultimate; s.ui.done(s.cmdForSkill(u, ult, s.alive('enemy')[0])); return u.id + ' ' + ult; });
      console.log('ultimate', who);
      const c = await L.nextEvent(page, 'cutin'); await L.atRt(page, c.rt + 0.55); await L.shot(page, out, '14_cutin');
      const f = await L.nextEvent(page, 'fx'); await L.atRt(page, f.rt + f.T * 0.5); await L.shot(page, out, '15_ult_build');
      await L.atRt(page, f.rt + f.T + 0.1); await L.shot(page, out, '16_ult_impact');
      await L.atRt(page, f.rt + f.T + 0.6); await L.shot(page, out, '17_ult_after');
    });
    await step('finish', async () => {
      await L.waitCommand(page);
      await page.evaluate(() => { const s = G.Scenes.top(); for (const e of s.enemies) e.hp = 1; s.ui.done({ kind: 'attack', targets: [s.alive('enemy')[0]] }); for (const e of s.enemies.slice(1)) { e.dead = true; e.alpha = 0; } });
      const k = await L.nextEvent(page, 'kill'); await L.atRt(page, k.rt + 0.25); await L.shot(page, out, '18_finisher');
      await L.until(page, () => G.Scenes.top() && G.Scenes.top().vic); await L.hold(page, 1.2); await L.shot(page, out, '19_victory');
      await page.evaluate(() => { const s = G.Scenes.top(); if (s.keyWait) s.keyWait.t = 99; G.Debug.autoplay = true; });
      await L.until(page, () => G.Battle3D.current && G.Battle3D.current.ink); await L.hold(page, 0.3); await L.shot(page, out, '20_ink');
    });
  } catch (e) { console.log('FAIL', e.message.split('\n')[0]); try { await L.shot(page, out, 'fail'); } catch (e2) { /* */ } }
  console.log('took', ((Date.now() - T0) / 1000).toFixed(0), 's; errors:', errors.length ? '\n' + errors.filter((e) => !/ERR_FILE_NOT_FOUND/.test(e)).slice(0, 20).join('\n') : 0);
  await browser.close();
})();

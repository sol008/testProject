// Team-B creature validation: node tools/r3d/monsters_b/test.js [ids]
// For every creature: builds battle + map instances, plays every clip (and alias) through, steps phases, renders a frame,
// and checks: no console/page errors, full instance interface, ≤ 8 draw calls, triangle budget (15k regular / 60k boss),
// finite skinned bounds after animation, map-context scaling, lights() output, dispose().
const { chromium } = require('playwright');
const path = require('path');
const IDS = 'marionette lantern_golem linto_jie nether_guardian fog_spirit bear_spirit hundred_eye serpent_shade inner_demon jiao stone_guardian lamp_moth drowned_soldier tide_grudge drowned_swarm kun lily_demon faceless tower_warden jewel_child baibu wuxiang wind_sprite wind_demon mountain_ghost plague_ghost greed_ghost hungry_ghost pirate_ghost moray sea_monster cliff_spirit fallwind gorge_colossus tide_serpent'.split(' ');
(async () => {
  const ids = process.argv[2] ? process.argv[2].split(',') : IDS;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/PCFSoftShadowMap/.test(m.text()))) errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, 'view.html') + '?ids=bear_spirit&w=640&h=360&labels=0&bloom=0', { waitUntil: 'commit' });
  await p.waitForFunction(() => window.__ready, null, { timeout: 600000 });
  const res = await p.evaluate((ids) => {
    const out = [];
    const r = G.R3.renderer, scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(-5, 10, 5); scene.add(sun);
    const CLIPS = ['idle', 'move', 'attack', 'cast', 'hurt', 'die', 'special', 'enter', 'ko', 'skill', 'attack2', 'victory', 'guard', 'revive'];
    for (const id of ids) {
      const rep = { id, problems: [] };
      try {
        if (!G.Mon3D.has(id)) { rep.problems.push('not registered'); out.push(rep); continue; }
        const def = G.Mon3D.B.DEFS[id];
        const inst = G.Mon3D.create(id, { context: 'battle' });
        for (const m of ['setFacing', 'setMove', 'play', 'emote', 'setExpression', 'lookAt', 'setOpacity', 'update', 'bone', 'dispose', 'lights', 'setPhase']) if (typeof inst[m] !== 'function') rep.problems.push('missing ' + m);
        if (!inst.root || !inst.root.isObject3D) rep.problems.push('no root');
        if (!(inst.height > 0)) rep.problems.push('bad height');
        scene.add(inst.root);
        // budgets
        let calls = 0, tris = 0;
        inst.root.traverse((o) => { if (o.isMesh || o.isPoints) { calls++; if (o.geometry.index && !o.userData.outline) tris += o.geometry.index.count / 3; } });
        rep.calls = calls; rep.tris = tris; rep.boss = !!def.boss;
        if (calls > 8) rep.problems.push('draw calls ' + calls);
        if (tris > (def.boss ? 60000 : 15000)) rep.problems.push('tris ' + tris);
        // clips
        inst.setFacing(0.3); inst.lookAt(new THREE.Vector3(0, 1.5, 6));
        let t = 0;
        const step = (n) => { for (let i = 0; i < n; i++) { t += 1 / 30; G.time = t; inst.update(1 / 30, 0, cam); } };
        for (const c of CLIPS) {
          if (c === 'move') { inst.play(null); inst.setMove(4.2); step(20); inst.setMove(0); continue; }
          let done = false; inst.play(c === 'idle' ? null : c, { onDone: () => { done = true; } }); step(70);
          if (!['idle', 'die', 'ko'].includes(c) && !done && G.Mon3D.B.DEFS[id]) rep.problems.push('clip ' + c + ' never finished');
          if (c === 'die' || c === 'ko') { if (inst.U.uDiss.value < 0.95) rep.problems.push(c + ' does not dissolve (' + inst.U.uDiss.value.toFixed(2) + ')'); inst.play('enter'); step(60); }
        }
        inst.emote('!'); inst.emote('💢'); step(20); inst.setExpression('angry'); inst.setOpacity(0.5, true); step(2); inst.setOpacity(1, false);
        if (def.boss) { inst.setPhase(2); step(60); inst.setPhase(3); step(60); }
        // bounds after animation: skinned bounding boxes must be finite
        inst.root.updateMatrixWorld(true);
        inst.root.traverse((o) => { if (o.isSkinnedMesh && !o.userData.outline) { o.computeBoundingBox(); const bb = o.boundingBox; if (![bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].every(isFinite)) rep.problems.push('NaN bounds ' + o.material.type); } });
        for (const bn of inst.bones) if (![bn.position.x, bn.position.y, bn.position.z, bn.quaternion.x, bn.quaternion.w].every(isFinite)) { rep.problems.push('NaN bone ' + bn.name); break; }
        const L = inst.lights(); for (const l of L) if (![l.x, l.y, l.z, l.i].every(isFinite)) rep.problems.push('NaN light');
        rep.lights = L.length;
        if (!inst.bone('head') || !inst.bone('hips')) rep.problems.push('bone() lookup');
        // render a frame (compiles every shader variant)
        cam.position.set(0, def.h * 0.6, def.h * 2.2); cam.lookAt(0, def.h * 0.45, 0); r.render(scene, cam);
        scene.remove(inst.root); inst.dispose();
        // map context
        const mi = G.Mon3D.create(id, { context: 'map' });
        rep.mapH = +mi.height.toFixed(2);
        if (mi.height > (def.boss ? 2.45 : 1.6)) rep.problems.push('map height ' + mi.height);
        mi.update(0.016, 0, cam); mi.dispose();
      } catch (e) { rep.problems.push('EXC ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')); }
      out.push(rep);
    }
    return out;
  }, ids);
  let bad = 0;
  for (const r of res) { const ok = !r.problems.length; if (!ok) bad++; console.log((ok ? 'ok   ' : 'FAIL ') + r.id.padEnd(16) + ` calls=${r.calls} tris=${r.tris}${r.boss ? ' (boss)' : ''} lights=${r.lights} mapH=${r.mapH}` + (ok ? '' : '  ' + r.problems.join('; '))); }
  if (errs.length) { console.log('console:'); console.log([...new Set(errs)].slice(0, 30).join('\n')); }
  console.log(`${res.length - bad}/${res.length} passed, ${errs.length} console errors/warnings`);
  await b.close();
  process.exit(bad || errs.length ? 1 : 0);
})();

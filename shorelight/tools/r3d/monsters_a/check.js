// Monster team A validation: node tools/r3d/monsters_a/check.js [ids]
// For every id × variant (0..2) × phase (1..2): build, run every clip (and the aliases the battle view uses) for
// 1.5 s, check bones/geometry for NaN, count triangles (unique geometry, outline excluded) and draw calls,
// exercise the instance interface (setOpacity, lookAt, emote, lights, bone, dispose). Prints a table + JSON.
const { chromium } = require('playwright');
const path = require('path');
const A_IDS = 'sea_wisp water_ghost ghost_lantern mine_bat miner_ghost sand_crab water_ghost_king mosina mushroom_imp bamboo_spirit bamboo_viper boar_demon macaque_demon tiger_granny yin_soldier stone_monkey rat_demon river_wraith paper_effigy chair_spirit jiangshi paper_servant hanged_ghost bone_general grudge_maid grudge_feast'.split(' ');
const BOSS = new Set(['water_ghost_king', 'tiger_granny', 'grudge_feast', 'chair_spirit', 'bone_general']);
(async () => {
  const ids = process.argv[2] ? process.argv[2].split(',') : A_IDS;
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/PCFSoft|GPU stall/.test(m.text()))) errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  await p.goto('file://' + path.resolve(__dirname, 'strip.html') + '?ids=jiangshi&ts=0');
  await p.waitForFunction(() => window.__ready);
  const res = await p.evaluate(([ids, bossList]) => {
    const BOSS = new Set(bossList);
    const out = {};
    const clips = ['idle', 'move', 'attack', 'cast', 'hurt', 'die', 'special', 'enter', 'attack2', 'skill', 'ko', 'revive', 'victory', 'guard', 'dodge', 'item', 'ready', 'run'];
    const nanIn = (inst) => { let bad = false; inst.root.updateMatrixWorld(true); inst.root.traverse((o) => { const e = o.matrixWorld.elements; for (let i = 0; i < 16; i++) if (!isFinite(e[i])) bad = true; }); return bad; };
    for (const id of ids) {
      const r = out[id] = { ok: true, issues: [] };
      if (!G.Mon3D.has(id)) { r.ok = false; r.issues.push('not registered'); continue; }
      for (let v = 0; v < 3; v++) for (let ph = 1; ph <= 2; ph++) {
        let inst;
        try { inst = G.Mon3D.create(id, { context: 'battle', variant: v, phase: ph }); } catch (e) { r.issues.push(`create v${v}p${ph}: ${e.message}`); continue; }
        if (!inst) { r.issues.push(`null v${v}p${ph}`); continue; }
        if (v === 0 && ph === 1) {
          let tris = 0, outl = 0, calls = 0;
          inst.root.traverse((o) => { if ((o.isMesh || o.isPoints) && o.visible) calls++; if (o.isMesh && o.geometry.index) { if (o.name === 'outline') outl += o.geometry.index.count / 3; else tris += o.geometry.index.count / 3; } });
          Object.assign(r, { tris, outline: outl, calls, height: +inst.height.toFixed(2), bones: inst.skeleton.bones.length });
          for (const m of inst.meshes) { m.geometry.computeBoundingSphere(); if (!isFinite(m.geometry.boundingSphere.radius)) r.issues.push('NaN bounding sphere ' + m.name); }
        }
        inst.setFacing(0.5); inst.update(1 / 60, 0, null);
        for (const c of clips) {
          let done = false;
          if (c === 'move') inst.setMove(4.2); else inst.play(c, { onDone: () => { done = true; } });
          for (let s = 0; s < 90; s++) inst.update(1 / 60, 0.3, null);
          if (nanIn(inst)) r.issues.push(`NaN after ${c} v${v}p${ph}`);
          inst.setMove(0); inst.play(null);
          for (let s = 0; s < 20; s++) inst.update(1 / 60, 0, null);
        }
        // varied frame rates (spring stability)
        for (const dt of [1 / 30, 1 / 144, 0.1]) for (let s = 0; s < 30; s++) inst.update(dt, 0, null);
        if (nanIn(inst)) r.issues.push(`NaN under dt sweep v${v}p${ph}`);
        inst.setOpacity(0.5, true); inst.update(1 / 60); inst.setOpacity(1, false);
        inst.lookAt(new THREE.Vector3(2, 1, 3)); inst.update(1 / 60); inst.lookAt(null);
        inst.emote('!'); inst.setExpression('angry'); inst.update(1 / 60);
        const L = inst.lights(); for (const l of L) if (![l.x, l.y, l.z, l.i, l.r].every(isFinite)) r.issues.push('bad light');
        for (const bn of ['head', 'hips', 'chest', 'handL', 'handR', 'footL']) if (!inst.bone(bn)) r.issues.push('no bone ' + bn);
        if (inst.setPhase) inst.setPhase(2);
        inst.dispose();
      }
      const budget = BOSS.has(id) ? 40000 : 15000;
      if (r.tris > budget) r.issues.push(`tris ${r.tris} > ${budget}`);
      if (r.calls > 6) r.issues.push(`draw calls ${r.calls} > 6`);
      r.ok = r.issues.length === 0;
    }
    return out;
  }, [ids, [...BOSS]]);
  let fail = 0;
  console.log('id'.padEnd(18), 'tris', 'outl', 'calls', 'bones', 'h', 'status');
  for (const id of ids) { const r = res[id]; if (!r.ok) fail++; console.log(id.padEnd(18), String(r.tris).padStart(5), String(r.outline).padStart(5), String(r.calls).padStart(3), String(r.bones).padStart(4), String(r.height).padStart(5), r.ok ? 'OK' : r.issues.slice(0, 4).join('; ')); }
  console.log(errs.length ? 'CONSOLE:\n' + [...new Set(errs)].slice(0, 20).join('\n') : 'console: clean');
  console.log(fail ? `${fail} FAILED` : 'ALL OK');
  require('fs').writeFileSync(path.resolve(__dirname, 'check_result.json'), JSON.stringify(res, null, 1));
  await b.close();
  process.exit(fail || errs.length ? 1 : 0);
})();

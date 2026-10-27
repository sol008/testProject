// Fast (no WebGL) check of the battle.js ↔ G.Battle3D hook contract: loads the game in a Node vm (tools/test/load.js),
// swaps G.Battle3D for a recording stub, forces G.R3.enabled() on, and auto-fights several troops to the end —
// including a 劍意 ultimate (gauge pre-filled) — stepping timers/tweens/scenes and drawing every frame.
//   node tools/r3d/battle/hooks.test.js
'use strict';
const assert = require('assert');
const { load } = require('../../test/load');

(async () => {
  const env = load();
  if (env.errors.length) console.log('load errors:', env.errors.map((e) => e.file + ': ' + e.error).join('\n'));
  const G = env.G;
  const calls = {};
  const hit = (k) => { calls[k] = (calls[k] || 0) + 1; };
  class Stub {
    constructor(bs) { this.bs = bs; hit('ctor'); this.fx = { heal() { hit('heal'); } }; }
    introWait() { hit('introWait'); return 0.6; }
    hideHud() { return false; }
    frame() { hit('frame'); }
    drawOverlay(ctx, t) { hit('drawOverlay'); assert(this.bs.pops.every((p) => p.u || p.x != null), 'pop without anchor'); }
    drawCutin() { hit('drawCutin'); }
    drawTransition() { hit('drawTransition'); }
    playFx(id, u, targets, s) { hit('playFx'); assert(typeof id === 'string' && u && Array.isArray(targets), 'playFx args'); return 0.25; }
    onCast(u, s) { hit('onCast'); }
    onAction(u, s, targets, melee) { hit('onAction'); assert(u && s && Array.isArray(targets) && typeof melee === 'boolean', 'onAction args'); }
    onActionEnd(u) { hit('onActionEnd'); }
    onDamage(tg, dmg, o) { hit('onDamage'); assert(tg && Number.isFinite(dmg), 'onDamage args'); }
    onKill(u) { hit('onKill'); assert(u.dead, 'onKill before dead'); }
    onSummonIntro() { hit('onSummonIntro'); }
    onCutin(u, s) { hit('onCutin'); }
    beforeFinish(r) { hit('beforeFinish'); return Promise.resolve(); }
    outro(r) { hit('outro'); G.Render.fade.a = 1; return Promise.resolve(); }
    dispose() { hit('dispose'); }
  }
  G.Battle3D = Stub;
  G.R3.enabled = () => true;
  const ctx = env.ctx.document.createElement('canvas').getContext('2d');
  G.ctx = ctx;
  G.Render.snapshot = () => ctx.canvas; // no real 2D canvas in the vm
  G.state = G.newState(); G.inGame = true;
  for (const id of ['xinghe', 'baizhi', 'hongying', 'yungui']) G.Party.join(id, 40);
  G.state.vars.autoBattle = true; G.settings.battleSpeed = 3; G.Debug.autoplay = true;
  const step = async (sec) => { for (let t = 0; t < sec; t += 0.05) { G.time = (G.time || 0) + 0.05; G.Timers.update(0.05); G.Tweens.update(0.05); G.Scenes.update(0.05); try { G.Scenes.draw(ctx); } catch (e) { throw new Error('draw threw: ' + e.stack); } await null; } };
  const troops = ['shore_5', 'forest_4', 'boss_tiger', 'mine_5'];
  for (const troop of troops) {
    for (const m of G.Party.active()) { m.hp = 9999; m.gauge = 100; } // auto-battle fires the ultimate first
    let res = null;
    G.Battle.start(troop).then((r) => { res = r; }, (e) => { res = 'threw: ' + (e && e.stack || e); });
    for (let i = 0; i < 400 && res == null; i++) await step(1);
    if (res !== 'win') { const s = G.Scenes.top(); console.log('state', s && s.constructor.name, s && s.result, s && s.vic && 'vic', s && s.keyWait && 'keyWait', s && s.enemies && s.enemies.map((e) => e.hp + '/' + e.dead), G.lastError && G.lastError.stack); }
    assert(res === 'win', `${troop}: result ${res}`);
    console.log('  ✓', troop, res);
  }
  for (const k of ['ctor', 'introWait', 'frame', 'drawOverlay', 'playFx', 'onAction', 'onActionEnd', 'onDamage', 'onKill', 'onCutin', 'drawCutin', 'beforeFinish', 'outro', 'dispose', 'drawTransition']) assert(calls[k] > 0, 'hook never called: ' + k);
  assert.strictEqual(calls.ctor, calls.dispose, 'every Battle3D created must be disposed');
  // a broken view must never hang a battle: NaN / huge impact times, a throwing playFx, an intro of Infinity and
  // presentation promises that never resolve (a missing clip, a camera move or ink wash that never ends) all time out.
  // Every troop with a phase boss (boss_wuxiang: three phases, the final boss) runs through its phase changes at 15% HP.
  class Broken extends Stub {
    introWait() { return Infinity; }
    playFx(id, u, targets, s) { hit('brokenFx'); const n = calls.brokenFx % 3; if (n === 0) return NaN; if (n === 1) return 1e9; throw new Error('missing clip'); }
    beforeFinish() { return new Promise(() => {}); }
    outro() { return new Promise(() => {}); }
  }
  G.Battle3D = Broken;
  const warnOnce = G.warnOnce; G.warnOnce = () => {}; // the timeouts warn (once per key) by design
  const phased = Object.keys(G.Data.troops).filter((t) => (G.Data.troops[t].enemies || []).some((id) => G.Data.enemies[id] && (G.Data.enemies[id].phases || []).length));
  assert(phased.includes('boss_wuxiang'), 'boss_wuxiang has phases');
  for (const troop of ['shore_5', ...phased]) {
    for (const m of G.Party.active()) { m.hp = 9999; m.gauge = 0; }
    let res = null;
    G.Battle.start(troop).then((r) => { res = r; }, (e) => { res = 'threw: ' + (e && e.stack || e); });
    await step(0.1);
    // 15% HP, and toothless: this checks that the flow never hangs, not the boss balance (the plain auto-battle loses it)
    for (const u of G.Scenes.top().enemies || []) { u.hp = Math.max(1, Math.ceil(u.mhp * 0.15)); u.atk = u.mag = 1; }
    for (let i = 0; i < 600 && res == null; i++) await step(1);
    const sc = G.Scenes.top();
    assert(res === 'win', `broken view, ${troop}: result ${res} (top ${sc && sc.constructor.name})`);
    console.log('  ✓ broken view', troop, res);
  }
  G.warnOnce = warnOnce;
  assert(calls.brokenFx > 0, 'broken view never asked for fx');
  console.log(`  broken view: ${phased.length} phase-boss troops OK`);
  console.log('hooks: OK', JSON.stringify(calls));
})().catch((e) => { console.error('hooks: FAIL', e.stack || e); process.exit(1); });

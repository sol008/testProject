#!/usr/bin/env node
// 彼岸燈 — story boss / scripted-fight simulator (the REAL battle engine, headless).
//
//   node tools/sim_story.js                     every fight in FIGHTS (tools/sim_story_fights.js), 300 trials each
//   node tools/sim_story.js --n 1000            more trials
//   node tools/sim_story.js --only c9_fallwind,c10_colossus     selected fights (ids or substrings)
//   node tools/sim_story.js --ch 9              one chapter
//   node tools/sim_story.js --lv -2             every fight with the party 2 levels lower (sensitivity)
//   node tools/sim_story.js --ai auto           the engine's own auto-battle (no items / guard) instead of the smart AI
//   node tools/sim_story.js --verbose           per-fight party setup (levels, gear, inventory)
//   node tools/sim_story.js --json out.json     also write the results as JSON
//   node tools/sim_story.js --shops             list the shop goods found in each chapter file
//
// Unlike tools/sim_battle.js (a re-implementation of the CONTRACTS formulas over js/data/* only), this loads the
// whole game (index.html script order, via tools/test/load.js' sandbox) and runs G.Battle.Scene itself with every
// timer / tween / dialogue / fade resolved instantly. Chapter files are loaded as they are, so their data
// registrations (enemies, troops, skills, items), their G.Battle.start wrappers (ch1 tutorials, ch4 t4_ hooks, ch7 心燈
// flame) and their battle `intro` / `onTurn` rule hooks all run unmodified. To reach the hook functions, which are
// private to each chapter's IIFE, the loader appends one line before each chapter file's closing `})();`:
//     G.__X.chN = { ev: (s) => eval(s) }
// so a fight's battle options are written as the same expression the chapter passes to S.battle(), evaluated in
// the chapter's own scope (see FIGHTS). Nothing is written back to the game files.
//
// The party is driven by a "sensible player" AI (playerCommand on the scene prototype, so per-battle hooks that wrap
// playerCommand — 陳伯 the guest, the ch7 mirror choice — still work): it revives, heals with skills or items, uses MP
// items, guards against telegraphed big attacks (enemy wind-ups / 「！」 charges / on-screen warnings), opens boss fights
// with the obvious buffs/debuffs (蓄勢, 迷魂扇, 天罡破法, 月霧護身曲), uses combos and ultimates, and otherwise picks
// the best expected damage (克 cycle, weak/resist, hit and crit included) with a light MP cost. It plays every fight
// blind and on the first try (no retries).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createSandbox, indexScripts, ROOT } = require('./test/load');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };

// ------------------------------------------------------------------------------------------------ load the game
function loadGame(seed) {
  const ctx = createSandbox({});
  // inert timers: battle pose resets / drum loops must not keep node alive or fire mid-battle
  ctx.setTimeout = () => 0; ctx.setInterval = () => 0; ctx.clearTimeout = () => {}; ctx.clearInterval = () => {};
  const errors = [];
  for (const rel of indexScripts()) {
    if (rel === 'js/core/fontdata.js' || rel === 'js/main.js') continue;
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    let code = fs.readFileSync(file, 'utf8');
    const m = /js\/maps\/(ch\d+)_[a-z]+\.js$/.exec(rel);
    if (m) {
      const i = code.lastIndexOf('})();');
      if (i > 0) code = code.slice(0, i) + `\n;(G.__X = G.__X || {})['${m[1]}'] = { ev: (__s) => eval(__s) };\n` + code.slice(i);
    }
    try { vm.runInContext(code, ctx, { filename: file }); } catch (e) { errors.push(rel + ': ' + (e && e.message)); }
  }
  const G = vm.runInContext('G', ctx);
  // deterministic Math.random inside the game
  let s = seed >>> 0;
  ctx.__rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  vm.runInContext('Math.random = () => __rnd();', ctx);
  headless(G);
  return { G, ctx, errors };
}

// everything that waits for time / input resolves at once
function headless(G) {
  const R = () => Promise.resolve();
  G.Timers.wait = R; G.Tweens.to = R;
  G.Dialog.say = R; G.Dialog.narrate = R; G.Dialog.close = () => {};
  G.Dialog.choice = () => Promise.resolve(G.__choice || 0);
  G.Render.fadeTo = R; G.Render.doFlash = () => {}; G.Render.doShake = () => {}; G.Render.snapshot = () => null;
  G.Music.play = () => {}; G.Music.stop = () => {}; G.Audio.sfx = () => {};
  if (G.UI) G.UI.toast = () => {};
  G.Scenes.push = (sc) => { G.__top = sc; }; G.Scenes.pop = () => {}; G.Scenes.top = () => G.__top; G.Scenes.replace = (sc) => { G.__top = sc; };
  G.settings.difficulty = 'normal'; G.settings.battleSpeed = 1;
  const P = G.Battle.Scene.prototype;
  P.tween = R; P.waitKey = R; P.cutIn = async function () {}; P.playFx = R;
  P.finish = async function () {
    const r = this.result || 'lose';
    if (r === 'win' || r === 'flee' || this.o.loseOk) for (const p of this.party) { p.m.hp = p.dead ? 1 : p.hp; p.m.mp = p.mp; p.m.gauge = Math.round(p.gauge); }
    this.resolve(r);
  };
  P.playerCommand = function (u) { return Promise.resolve(G.__ai(this, u)); };
  const exec = P.execute;
  P.execute = async function (u, cmd) {
    this.__acts = (this.__acts || 0) + 1;
    if (u.side === 'enemy') { this.__last = this.__last || new Map(); this.__last.set(u, cmd); }
    if (u.side === 'party' && cmd && cmd.kind === 'item') this.__items = (this.__items || 0) + 1;
    if (u.side === 'party' && cmd && cmd.kind === 'defend') this.__guards = (this.__guards || 0) + 1;
    return exec.call(this, u, cmd);
  };
  const say = P.say;
  P.say = function (text, sec) { this.__msgAt = this.__acts || 0; return say.call(this, text, sec); };
  const kill = P.kill;
  P.kill = function (u) { if (u.side === 'party') this.__ko = (this.__ko || 0) + 1; return kill.call(this, u); };
  // tutorials and other overlay scenes: never block
  G.state.flags = G.state.flags || {};
}

// ------------------------------------------------------------------------------------------------ party AI
function makeAI(G, mode) {
  const SK = () => G.Data.skills;
  const IT = () => G.Data.items;
  const statMul = (u, k) => (u.st[k + 'Up'] ? 1.3 : 1) * (u.st[k + 'Down'] ? 0.7 : 1) * (k === 'mag' && u.st.trance ? 1.25 : 1);
  const eff = (u, k) => u[k] * statMul(u, k);
  const hasSp = (u, id) => !!(u.specials && u.specials.includes(id));
  const pct = (u) => u.hp / u.mhp;

  function oneHit(sc, u, s, tg, avg) {
    const power = s.power || 1;
    const atk = avg ? avg.atk : eff(u, 'atk'), mag = avg ? avg.mag : eff(u, 'mag');
    let d;
    if (s.type === 'phys') {
      d = power * atk * 2 * 50 / (50 + eff(tg, 'def'));
      const hit = Math.max(0.6, Math.min(0.99, 0.95 - (eff(tg, 'spd') - eff(u, 'spd')) / 400));
      const crit = Math.min(1, 0.05 + (u.luk || 0) / 500 + (u.st.trance ? 0.3 : 0) + (s.crit || 0) + (hasSp(u, 'critUp') ? 0.12 : 0));
      d *= hit * (1 + crit * 0.5);
      if (tg.diving) d = 0;
    } else d = power * mag * 2 * 50 / (50 + (eff(tg, 'def') * 0.3 + eff(tg, 'mag') * 0.7));
    d *= sc.elemFactor(s.elem || null, tg);
    if (tg.st.guard) d *= 0.5;
    return d;
  }
  // expected damage of skill s by u on target tg (or the whole side), capped by remaining HP
  function expDmg(sc, u, s, tg, avg) {
    const foes = sc.alive('enemy');
    const hits = s.hits || 1;
    if (s.target === 'enemies') return foes.reduce((a, f) => a + Math.min(f.hp, oneHit(sc, u, s, f, avg) * hits), 0);
    if (s.target === 'random') return foes.reduce((a, f) => a + Math.min(f.hp, oneHit(sc, u, s, f, avg) * hits / foes.length), 0);
    return Math.min(tg.hp, oneHit(sc, u, s, tg, avg) * hits);
  }
  const isMain = (sc, e) => e.boss || e.mhp >= Math.max(...sc.enemies.map((x) => x.mhp));
  function pickTarget(sc, u, s, avg) {
    const foes = sc.alive('enemy');
    const F = sc.__fight || {};
    let best = null, bv = -1;
    for (const f of foes) {
      let v = expDmg(sc, u, s, f, avg);
      if (v <= 0) continue;
      if (F.focus && F.focus.includes(f.id)) v *= 3;
      if (F.avoid && F.avoid.includes(f.id)) v *= 0.2;
      // finish what can be finished; adds that die in ~2 hits come first, otherwise the main enemy
      if (f.hp <= v) v += f.mhp * 0.25 + 50;
      else if (!isMain(sc, f) && f.hp <= v * 2.2) v *= 1.4;
      else if (isMain(sc, f)) v *= 1.05;
      if (v > bv) { bv = v; best = f; }
    }
    return best || foes[0];
  }
  function cmdFor(sc, u, id, kind, tg) {
    const s = SK()[id];
    let targets;
    switch (s.target) {
      case 'enemies': case 'random': targets = sc.alive('enemy'); break;
      case 'allies': targets = s.revive ? sc.party.slice() : sc.alive('party'); break;
      case 'self': targets = [u]; break;
      case 'ally': targets = [tg || sc.alive('party').slice().sort((a, b) => pct(a) - pct(b))[0]]; break;
      case 'deadAlly': targets = [tg || sc.party.find((p) => p.dead) || u]; break;
      default: targets = [tg || pickTarget(sc, u, s)];
    }
    return { kind: kind || (s.ultimate ? 'ultimate' : 'skill'), skill: id, targets };
  }
  const healAmt = (u, s, avg) => ((s.power || 1) * (avg ? avg.mag : eff(u, 'mag')) * 1.2 + (s.power || 1) * 10) * (hasSp(u, 'healUp') ? 1.25 : 1);
  const knownSkills = (u) => ((u.m && u.m.skills) || []).filter((id) => SK()[id] && !SK()[id].combo && !SK()[id].hidden && SK()[id].type !== 'passive');
  const canCast = (u, id) => !u.st.seal && (SK()[id].mp || 0) <= u.mp;
  const invList = (f) => G.Inv.list((it) => it.type === 'use' && it.use && it.use.battle !== false && f(it.use, it));
  const healItems = () => invList((x) => (x.heal || x.healPct) && !x.revive && (x.target || 'ally') !== 'enemy');
  const itemHeal = (id, tg) => { const x = IT()[id].use; return (x.heal || 0) + (x.healPct ? x.healPct * tg.mhp : 0); };
  const healerOf = (sc) => {
    for (const id of ['baizhi', 'yungui', 'xinghe', 'hongying']) {
      const p = sc.party.find((q) => q.id === id && !q.dead && !q.st.sleep && !q.st.stun && !q.st.seal);
      if (p && knownSkills(p).some((k) => SK()[k].type === 'heal' && canCast(p, k))) return p;
    }
    return null;
  };
  const nextEnemyWait = (sc) => Math.min(...sc.alive('enemy').map((e) => e.wait), 1e9);
  const turnLen = (u) => 100 * 40 / (eff(u, 'spd') + 40);
  // a big enemy attack is telegraphed (wind-up skill, a 「！」 charge flag, or an on-screen warning)
  function telegraph(sc) {
    for (const e of sc.alive('enemy')) {
      for (const k in e) if (/charge|gather|windup|telegraph/i.test(k) && e[k] === true) return e;
      const c = sc.__last && sc.__last.get(e);
      const s = c && c.skill && SK()[c.skill];
      if (s && s.type === 'special' && s.target === 'self' && !s.summon && !s.outcomes) return e;
    }
    if (sc.msg && (sc.__acts || 0) - (sc.__msgAt || 0) <= 2 && /伏低|防禦|擋住|穩住|蓄力|要來了|快躲/.test(sc.msg.text || '')) return true;
    return null;
  }

  function useItem(sc, u, id, tg) { return { kind: 'item', item: id, targets: [tg] }; }

  return function smart(sc, u) {
    if (mode === 'auto') return sc.autoCommand(u);
    const F = sc.__fight || {};
    const party = sc.party, alive = sc.alive('party'), dead = party.filter((p) => p.dead), foes = sc.alive('enemy');
    if (!foes.length) return { kind: 'defend' };
    const skills = knownSkills(u);
    const usable = skills.filter((k) => !SK()[k].ultimate && canCast(u, k));
    const healer = healerOf(sc);
    const iAmHealer = healer === u;
    const hurt = alive.filter((p) => pct(p) < 0.55);
    const boss = !!sc.troop.boss || foes.some((e) => e.boss);
    const bossE = foes.filter((e) => isMain(sc, e))[0] || foes[0];
    const nearlyDone = foes.every((e) => e.hp < e.mhp * 0.08 || (e.endAt && e.hp < e.mhp * (e.endAt + 0.05)));

    // 1. ultimate
    if (u.gauge >= 100 && !u.st.seal) {
      const ults = [];
      const main = G.Data.chars[u.id] && G.Data.chars[u.id].ultimate;
      if (main && SK()[main]) ults.push(main);
      for (const k of skills) if (SK()[k].ultimate && !ults.includes(k)) ults.push(k);
      let best = null, bv = 0;
      for (const k of ults) {
        const s = SK()[k];
        let v;
        if (s.type === 'heal') v = (dead.length || hurt.length >= 2) ? 1e9 : -1;
        else v = expDmg(sc, u, s, pickTarget(sc, u, s));
        if (v > bv) { bv = v; best = k; }
      }
      if (best) return cmdFor(sc, u, best, 'ultimate');
    }
    // 2. revive
    if (dead.length && !nearlyDone) {
      const rev = usable.filter((k) => SK()[k].type === 'revive' || (SK()[k].revive && SK()[k].type === 'heal')).sort((a, b) => (SK()[b].power || 0) - (SK()[a].power || 0))[0];
      if (rev) return cmdFor(sc, u, rev, null, dead[0]);
      const reviverAlive = alive.some((p) => p !== u && knownSkills(p).some((k) => SK()[k].type === 'revive' && canCast(p, k)) && !p.st.sleep && !p.st.stun);
      const ri = invList((x) => x.revive)[0];
      if (ri && !reviverAlive) return useItem(sc, u, ri, dead[0]);
    }
    // 3. heal
    const healSk = usable.filter((k) => SK()[k].type === 'heal' && !SK()[k].ultimate);
    if (healSk.length && (iAmHealer || alive.some((p) => pct(p) < 0.3))) {
      const allH = healSk.filter((k) => SK()[k].target === 'allies').sort((a, b) => SK()[b].power - SK()[a].power);
      const oneH = healSk.filter((k) => SK()[k].target === 'ally').sort((a, b) => SK()[a].power - SK()[b].power);
      const worst = alive.slice().sort((a, b) => pct(a) - pct(b))[0];
      if (alive.filter((p) => pct(p) < 0.6).length >= 2 && allH.length) return cmdFor(sc, u, allH[0]);
      if (pct(worst) < 0.45) {
        const need = worst.mhp - worst.hp;
        const k = oneH.find((kk) => healAmt(u, SK()[kk]) >= need * 0.8) || oneH[oneH.length - 1] || allH[0];
        if (k) return cmdFor(sc, u, k, null, worst);
      }
    }
    // 4. heal items: someone in danger and the healer cannot cover it before the enemies act
    const crit = alive.filter((p) => pct(p) < 0.32).sort((a, b) => pct(a) - pct(b));
    if (crit.length) {
      const healerSoon = healer && healer !== u && healer.wait < nextEnemyWait(sc) && crit.length === 1;
      if (!healerSoon) {
        const hi = healItems();
        if (hi.length) {
          const t = crit[0], need = t.mhp - t.hp;
          const id = hi.slice().sort((a, b) => itemHeal(a, t) - itemHeal(b, t)).find((x) => itemHeal(x, t) >= need * 0.6) || hi[hi.length - 1];
          return useItem(sc, u, id, t);
        }
      }
    }
    // 5. MP for the healer
    if (iAmHealer && u.mp < u.mmp * 0.2) {
      const mi = invList((x) => (x.mp || x.mpPct) && !x.heal)[0] || invList((x) => x.mp || x.mpPct)[0];
      if (mi) return useItem(sc, u, mi, u);
    }
    // 6. cure the healer / a sealed caster / a stunned ally
    const cureSk = usable.find((k) => SK()[k].type === 'cure' || (SK()[k].cure && SK()[k].type !== 'heal'));
    const stuck = alive.find((p) => p !== u && (p.st.sleep > 1 || p.st.stun > 1 || (p.st.seal && p === healer)));
    if (cureSk && stuck) return cmdFor(sc, u, cureSk, null, stuck);
    // 6b. fight-specific play that the battle itself tells the player to do (on-screen hints)
    if (F.tactics) { const c = F.tactics(sc, u, { G, cmdFor: (id, tg) => cmdFor(sc, u, id, null, tg), item: (id, tg) => useItem(sc, u, id, tg), usable, healer, iAmHealer }); if (c) return c; }
    // 7. guard against a telegraphed blow
    const tel = telegraph(sc);
    if (tel && !F.noGuard) {
      const e = tel === true ? null : tel;
      const before = !e || e.wait < turnLen(u) * 1.05;
      if (before && (pct(u) < 0.8 || iAmHealer || tel === true)) return { kind: 'defend' };
    }
    // 8. last stand: nobody can heal and this member would drop
    if (pct(u) < 0.2 && !healer && !healItems().length && alive.length > 1 && !F.noGuard) return { kind: 'defend' };

    // 9. boss openers: buffs / debuffs that are certain to land (data `buffs` skip the status roll)
    if (boss && !u.st.seal && !nearlyDone) {
      const tryS = (k, cond, tg) => (usable.includes(k) && cond ? cmdFor(sc, u, k, null, tg) : null);
      const anyBossNot = (st) => foes.filter((e) => isMain(sc, e)).some((e) => !e.st[st]);
      const r = tryS('yg_mihun', anyBossNot('atkDown') && bossE.hp > bossE.mhp * 0.25, bossE)
        || tryS('yg_tiangang', anyBossNot('defDown') && bossE.hp > bossE.mhp * 0.3, bossE)
        || tryS('hy_xushi', !u.st.atkUp && bossE.hp > bossE.mhp * 0.2)
        || tryS('bz_yuewu', alive.filter((p) => !p.st.defUp).length >= 2 && u.mp > u.mmp * 0.45)
        || tryS('bz_ganlin', alive.filter((p) => pct(p) < 0.8 && !p.st.regen).length >= 2 && u.mp > u.mmp * 0.4);
      if (r) return r;
    }
    // 10. damage (skills, attack) vs combos
    const atkSk = { name: '攻擊', type: 'phys', power: 1, target: 'enemy', elem: u.elem || null };
    const atkT = pickTarget(sc, u, atkSk);
    const atkVal = expDmg(sc, u, atkSk, atkT);
    const kmp = boss ? atkVal / 30 : atkVal / 8;
    const reserve = iAmHealer ? u.mmp * 0.3 : 0;
    let best = { kind: 'attack', targets: [atkT] }, bv = F.valueMod ? F.valueMod(sc, u, atkSk, atkT, atkVal) : atkVal;
    for (const k of usable) {
      const s = SK()[k];
      if (s.type !== 'phys' && s.type !== 'mag') continue;
      if (u.mp - (s.mp || 0) < reserve) continue;
      const t = s.target === 'enemy' ? pickTarget(sc, u, s) : null;
      let v = expDmg(sc, u, s, t) * (s.delay ? 1 / s.delay : 1) - (s.mp || 0) * kmp;
      if (F.valueMod) v = F.valueMod(sc, u, s, t, v);
      if (s.buffs && s.buffs.some((b) => b.amt < 0) && t && isMain(sc, t)) v *= 1.15;
      if (v > bv) { bv = v; best = cmdFor(sc, u, k, null, t); }
    }
    // cats: roughly an attack, keep for non-boss filler only when nothing better
    if (boss && !u.st.seal) {
      for (const [k, s] of Object.entries(SK())) {
        if (!s.combo || s.combo[0] !== u.id) continue;
        if ((s.req && !G.state.flags[s.req]) || (s.flag && !G.state.flags[s.flag])) continue;
        const mates = s.combo.map((pid) => party.find((p) => p.id === pid));
        if (mates.some((p) => !p || p.dead || p.st.sleep || p.st.stun || p.st.seal || p.mp < (s.mp || 0) || (s.comboLv && p.lv < s.comboLv))) continue;
        const avg = { atk: mates.reduce((a, p) => a + eff(p, 'atk'), 0) / mates.length, mag: mates.reduce((a, p) => a + eff(p, 'mag'), 0) / mates.length };
        let v;
        if (s.type === 'heal') { if (alive.filter((p) => pct(p) < 0.6).length < 2) continue; v = 1e8; }
        else {
          const t = s.target === 'enemy' ? pickTarget(sc, u, s, avg) : null;
          v = expDmg(sc, u, s, t, avg) - bv * mates.length - (s.mp || 0) * kmp * mates.length;
          if (v <= 0) continue;
          return cmdFor(sc, u, k, 'skill', t);
        }
        return cmdFor(sc, u, k, 'skill');
      }
    }
    return best;
  };
}

// ------------------------------------------------------------------------------------------------ setup
const SLOTS = ['weapon', 'armor', 'head', 'feet', 'acc'];
function gearScore(G, cid, it, slot) {
  const c = G.Data.chars[cid];
  const s = it.stats || {};
  const caster = c.weapon === 'flute' || c.weapon === 'talisman';
  if (slot === 'weapon') return caster ? (s.mag || 0) + (s.atk || 0) * 0.2 + (s.hp || 0) / 20 : (s.atk || 0) + (s.mag || 0) * 0.1 + (s.hp || 0) / 20;
  const sp = [].concat(it.special || []);
  return (s.def || 0) * 1.5 + (s.hp || 0) / 8 + (s.mp || 0) / 8 + (s.spd || 0) * 1.2 + (caster ? (s.mag || 0) : (s.atk || 0)) + (s.atk || 0) * 0.3 + (s.mag || 0) * 0.3 + (s.luk || 0) * 0.3
    + sp.length * 4 + (it.immune ? 2 * it.immune.length : 0) + (it.resist ? 2 : 0);
}
function bestGear(G, cid, pool, slot) {
  let best = null, bv = -1;
  for (const id of pool) {
    const it = G.Data.items[id];
    if (!it || it.type !== slot || (it.who && !it.who.includes(cid))) continue;
    const v = gearScore(G, cid, it, slot);
    if (v > bv) { bv = v; best = id; }
  }
  return best;
}
// consumables a sensible player carries out of the shops listed for the fight
function kitFrom(G, pool, F) {
  const I = G.Data.items, inv = {};
  const use = pool.filter((id) => I[id] && I[id].type === 'use' && I[id].use && I[id].use.battle !== false && I[id].price > 0);
  const heal = use.filter((id) => I[id].use.heal && !I[id].use.revive && (I[id].use.target || 'ally') === 'ally').sort((a, b) => I[b].use.heal - I[a].use.heal);
  const healAll = use.filter((id) => I[id].use.heal && I[id].use.target === 'allies');
  const mp = use.filter((id) => (I[id].use.mp || I[id].use.mpPct) && !I[id].use.heal).sort((a, b) => (I[b].use.mp || 0) - (I[a].use.mp || 0));
  const rev = use.filter((id) => I[id].use.revive).sort((a, b) => I[a].price - I[b].price);
  const K = Object.assign({ heal: [5, 3], mp: 3, revive: 2, healAll: 0 }, F.kit || {});
  if (heal[0]) inv[heal[0]] = K.heal[0];
  if (heal[1]) inv[heal[1]] = (inv[heal[1]] || 0) + K.heal[1];
  if (mp[0] && K.mp) inv[mp[0]] = K.mp;
  if (rev[0] && K.revive) inv[rev[0]] = K.revive;
  if (healAll[0] && K.healAll) inv[healAll[0]] = K.healAll;
  return Object.assign(inv, F.inv || {});
}

function setup(env, F, lvShift) {
  const { G } = env;
  G.state = G.newState();
  G.state.chapter = F.ch;
  Object.assign(G.state.flags, F.flags || {});
  Object.assign(G.state.vars, F.vars || {});
  // tutorial popups never block
  for (const ch in G.__X) { try { for (const k of G.__X[ch].ev("typeof TUT !== 'undefined' ? Object.keys(TUT) : []")) G.state.flags[k] = true; } catch (e) { /* no TUT */ } }
  for (const k of ['tut_gauge', 'tut_element', 'tut_guest', 'tut_guard', 'tut_guard_hint', 'tut_combo', 'tut_item', 'tut_ultimate']) G.state.flags[k] = true;
  const pool = (F.shops || []).slice();
  for (const cid of F.party) {
    const lv = Math.max(1, (typeof F.lv === 'object' ? F.lv[cid] : F.lv) + (lvShift || 0));
    const m = G.Party.create(cid, lv);
    for (const sk of (F.skills && F.skills[cid]) || []) G.Party.learnSkill(cid, sk);
    const cand = pool.concat(Object.values(m.equip).filter(Boolean)).concat((F.gifts && F.gifts[cid]) || []);
    for (const slot of SLOTS) {
      const fixed = F.gear && F.gear[cid] && F.gear[cid][slot];
      if (fixed !== undefined) { m.equip[slot] = fixed; continue; }
      const b = bestGear(G, cid, cand.filter((id) => !(F.withhold || []).includes(id)), slot);
      if (b) m.equip[slot] = b;
    }
    const st = G.Party.stats(cid); m.hp = st.mhp; m.mp = st.mmp;
    G.state.party.push(cid);
  }
  const inv = kitFrom(G, pool, F);
  for (const [id, n] of Object.entries(inv)) G.Inv.add(id, n);
  if (F.pre) F.pre(G, env);
}

async function battleOnce(env, F, troop, optsSrc) {
  const { G } = env;
  const opts = optsSrc ? G.__X[F.file].ev('(' + optsSrc + ')') : {};
  let done = false, res = null;
  G.__top = null;
  const p = G.Battle.start(troop, opts || {});
  const sc = G.__top;
  if (sc) sc.__fight = F;
  p.then((r) => { done = true; res = r; }, (e) => { done = true; res = 'error:' + (e && e.stack); });
  for (let i = 0; i < 3 && !done; i++) await new Promise((r) => setImmediate(r));
  return { done, res, sc };
}
async function runOnce(env, F, lvShift) {
  const { G } = env;
  setup(env, F, lvShift);
  // fights that follow earlier ones without a chance to rest (HP / MP / gauge carry over)
  for (const b of F.before || []) {
    const r0 = await battleOnce(env, Object.assign({}, F, b.fight || {}), b.troop, b.opts);
    if (!r0.done) return { result: 'hung', sc: r0.sc };
    if (r0.res !== 'win' && !b.loseOk) return { result: 'lose', sc: r0.sc, rounds: 0, ko: 1, items: 0, guards: 0, hpLeft: 0, chainLoss: b.troop };
    if (b.after) b.after(G);
  }
  const { done, res, sc } = await battleOnce(env, F, F.troop, F.opts);
  if (!done) return { result: 'hung', sc };
  const party = sc ? sc.party : [];
  return {
    result: res, sc, rounds: sc ? sc.rounds : 0, ko: sc ? sc.__ko || 0 : 0, items: sc ? sc.__items || 0 : 0, guards: sc ? sc.__guards || 0 : 0,
    hpLeft: party.length ? party.reduce((a, p) => a + (p.dead ? 0 : p.hp), 0) / party.reduce((a, p) => a + p.mhp, 0) : 0,
    alive: party.filter((p) => !p.dead).length, size: party.length,
  };
}

async function runFight(env, F, n, lvShift) {
  const R = { n, win: 0, lose: 0, other: 0, rounds: 0, koAny: 0, ko: 0, items: 0, guards: 0, hpLeft: 0, err: null };
  for (let i = 0; i < n; i++) {
    let r;
    try { r = await runOnce(env, F, lvShift); } catch (e) { R.err = String(e && e.stack).split('\n').slice(0, 4).join(' | '); break; }
    if (r.result === 'hung') { R.err = 'battle never finished (a hook waits on input/time)'; break; }
    if (typeof r.result === 'string' && r.result.startsWith('error:')) { R.err = r.result.slice(0, 400); break; }
    const won = F.winIf ? F.winIf(r, env.G) : r.result === 'win';
    if (won) R.win++; else if (r.result === 'lose' || F.winIf) R.lose++; else R.other++;
    R.rounds += r.rounds; R.ko += r.ko; R.koAny += r.ko > 0 ? 1 : 0; R.items += r.items; R.guards += r.guards; R.hpLeft += r.hpLeft;
  }
  const m = R.win + R.lose + R.other || 1;
  for (const k of ['rounds', 'ko', 'koAny', 'items', 'guards', 'hpLeft']) R[k] /= m;
  R.n = m;
  return R;
}

function describe(env, F, lvShift) {
  const { G } = env;
  setup(env, F, lvShift);
  const out = [];
  for (const cid of G.state.party) {
    const m = G.state.members[cid], st = G.Party.stats(cid);
    out.push(`    ${cid} L${m.lv} HP${st.mhp} MP${st.mmp} atk${st.atk} def${st.def} mag${st.mag} spd${st.spd}  ${SLOTS.map((s) => m.equip[s] || '-').join(' ')}`);
  }
  out.push('    inv: ' + Object.entries(G.state.inv).map(([k, v]) => `${k}×${v}`).join(' '));
  return out.join('\n');
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  const env = loadGame(+opt('seed', 20261027));
  if (env.errors.length) console.log('load errors:\n  ' + env.errors.join('\n  '));
  const { G } = env;
  G.__ai = makeAI(G, opt('ai', 'smart'));
  const { FIGHTS } = require('./sim_story_fights');
  const fights = FIGHTS(G);
  if (opt('shops')) { printShops(env); return; }
  const only = opt('only', null) ? String(opt('only')).split(',') : null;
  const chOnly = opt('ch', null) != null ? +opt('ch') : null;
  const n = +opt('n', 300);
  const lvShift = +opt('lv', 0);
  const json = [];
  console.log(`story fights — ${opt('ai', 'smart')} AI, n=${n}${lvShift ? ', level shift ' + lvShift : ''}`);
  console.log('  win = first-try win rate; KO = fights where a member fell; items/guard = per fight; HP = party HP left at the end');
  for (const F of fights) {
    if (only && !only.some((o) => F.id === o || F.id.includes(o))) continue;
    if (chOnly != null && F.ch !== chOnly) continue;
    const R = await runFight(env, F, F.n || n, lvShift);
    const lv = typeof F.lv === 'object' ? Object.values(F.lv).join('/') : F.lv;
    const tag = R.err ? 'ERROR ' + R.err : (F.scripted ? 'scripted' : (R.win < 0.6 ? 'HARD' : R.win > 0.97 && R.koAny < 0.03 ? 'TRIVIAL' : ''));
    console.log(`${F.id.padEnd(22)} ch${String(F.ch).padEnd(3)} L${String(lv).padEnd(9)} win ${(R.win / R.n * 100).toFixed(0).padStart(3)}%  rounds ${R.rounds.toFixed(1).padStart(4)}  KO ${(R.koAny * 100).toFixed(0).padStart(3)}%  items ${R.items.toFixed(1)}  guard ${R.guards.toFixed(1)}  HP ${(R.hpLeft * 100).toFixed(0).padStart(3)}%  ${F.party.map((p) => p.slice(0, 2)).join('')}  ${tag}`);
    if (opt('verbose')) console.log(describe(env, F, lvShift));
    json.push({ id: F.id, ch: F.ch, name: F.name, lv: F.lv, party: F.party, win: R.win / R.n, koAny: R.koAny, rounds: R.rounds, items: R.items, hpLeft: R.hpLeft, err: R.err });
  }
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(json, null, 1));
}

function printShops(env) {
  const { SHOPS } = require('./sim_story_fights');
  for (const [k, v] of Object.entries(SHOPS)) console.log(k.padEnd(14), v.map((id) => `${id}${env.G.Data.items[id] ? '' : '(?)'}`).join(' '));
}

module.exports = { loadGame, makeAI, runFight, runOnce, setup, describe };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

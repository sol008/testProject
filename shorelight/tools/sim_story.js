#!/usr/bin/env node
// 彼岸燈 — story boss / scripted-fight simulator (the REAL battle engine, headless).
//
//   node tools/sim_story.js                     every fight in FIGHTS (tools/sim_story_fights.js), 300 trials each
//   node tools/sim_story.js --n 1000            more trials
//   node tools/sim_story.js --only c9_fallwind,c10_colossus     selected fights (ids or substrings)
//   node tools/sim_story.js --ch 9              one chapter
//   node tools/sim_story.js --lv -2             every fight with the party 2 levels lower (sensitivity)
//   node tools/sim_story.js --ai auto           the in-game auto-battle (F; js/engine/autobattle.js) instead of the
//                                               battle bot; --autostyle safe|normal|bold, --autoitems off = its settings
//   node tools/sim_story.js --notactics         the battle bot without the per-fight hints of sim_story_fights.js (the
//                                               browser bot of the chapter tests; --ai auto never uses them anyway)
//   node tools/sim_story.js --areas [a,b]       the js/data areas' field troops + bosses (sim_battle.js's list) through
//                                               the real engine (level/gear/kit per area; items + their gold per fight)
//   node tools/sim_story.js --verbose           per-fight party setup (levels, gear, inventory)
//   node tools/sim_story.js --json out.json     also write the results as JSON
//   node tools/sim_story.js --shops             list the shop goods found in each chapter file
//   node tools/sim_story.js --model normal      every boss at the state tools/sim_economy.js expects a normal player to
//                                               have there (level, gear it could afford, its consumables); also
//                                               --model minimal | thorough, --modelfile f.json (a saved model)
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
  const GROOT = process.env.SIM_ROOT || ROOT; // SIM_ROOT: run against another checkout (e.g. a git archive of the old data)
  for (const rel of indexScripts(GROOT)) {
    if (rel === 'js/core/fontdata.js' || rel === 'js/main.js') continue;
    const file = path.join(GROOT, rel);
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
  { const i = process.argv.indexOf('--diff'); if (i >= 0) G.settings.difficulty = process.argv[i + 1]; }
  const P = G.Battle.Scene.prototype;
  P.tween = R; P.waitKey = R; P.cutIn = async function () {}; P.playFx = R;
  P.finish = async function () {
    const r = this.result || 'lose';
    if (r === 'win' || r === 'flee' || this.o.loseOk) for (const p of this.party) { p.m.hp = p.dead ? 1 : p.hp; p.m.mp = p.mp; p.m.gauge = Math.round(p.gauge); }
    this.resolve(r);
  };
  P.playerCommand = function (u) { return Promise.resolve(G.__ai(this, u)); };
  instrument(P);
  const exec = P.execute;
  P.execute = async function (u, cmd) {
    if (G.__trace) {
      const tg = cmd && cmd.targets ? cmd.targets.map((t) => t && (t.id + ':' + t.hp)).join(',') : '';
      G.__trace.push(`r${this.rounds} ${u.id}(${u.hp}/${u.mhp} mp${u.mp}) ${cmd ? cmd.kind + ' ' + (cmd.skill || cmd.item || '') : '-'} -> ${tg}`);
    }
    if (u.side === 'party' && cmd && cmd.kind === 'item') { this.__items = (this.__items || 0) + 1; this.__itemGold = (this.__itemGold || 0) + ((G.Data.items[cmd.item] || {}).price || 0); }
    if (u.side === 'party' && cmd && cmd.kind === 'defend') this.__guards = (this.__guards || 0) + 1;
    return exec.call(this, u, cmd);
  };
  const kill = P.kill;
  P.kill = function (u) { if (u.side === 'party') this.__ko = (this.__ko || 0) + 1; return kill.call(this, u); };
  // tutorials and other overlay scenes: never block
  G.state.flags = G.state.flags || {};
}

// ------------------------------------------------------------------------------------------------ party AI
// The sensible-player policy lives in tools/test/lib/battlebot.js (shared with the chapter playthrough tests).
const { makeAI, instrument } = require('./test/lib/battlebot');

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
  // --test: the chapter playthrough test's conditions (its level boosts, the gear it equips, the auto-battle AI)
  const T = G.__testMode ? (F.test || {}) : null;
  const realGear = T && G.__testGear === 'real';
  const pool = T && !realGear ? (T.shops || []) : (F.shops || []).slice();
  const lvOf = (cid) => (T && T.lv != null ? (typeof T.lv === 'object' ? T.lv[cid] : T.lv) : (typeof F.lv === 'object' ? F.lv[cid] : F.lv));
  for (const cid of F.party) {
    const lv = Math.max(1, lvOf(cid) + (lvShift || 0));
    const m = G.Party.create(cid, lv);
    for (const sk of (F.skills && F.skills[cid]) || []) G.Party.learnSkill(cid, sk);
    const gifts = T && !realGear ? (T.gifts && T.gifts[cid]) || [] : (F.gifts && F.gifts[cid]) || [];
    const cand = pool.concat(Object.values(m.equip).filter(Boolean)).concat(gifts);
    if (T && !realGear && T.gearMaxCh != null) { // ch9 test's gearUp(): best atk+def+mag item of chapter <= N per slot
      for (const slot of ['weapon', 'armor', 'head', 'feet']) {
        let best = null;
        for (const [iid, it] of Object.entries(G.Data.items)) {
          if (it.type !== slot || (it.ch || 0) > T.gearMaxCh || (it.who && !it.who.includes(cid))) continue;
          const sc = it.stats ? (it.stats.atk || 0) + (it.stats.def || 0) + (it.stats.mag || 0) : 0;
          if (!best || sc > best.sc) best = { iid, sc };
        }
        if (best) m.equip[slot] = best.iid;
      }
    }
    for (const slot of SLOTS) {
      const gearSrc = T && !realGear ? T.gear : F.gear;
      const fixed = gearSrc && gearSrc[cid] && gearSrc[cid][slot];
      if (fixed !== undefined) { m.equip[slot] = fixed; continue; }
      if (T && !realGear) continue; // tests keep what they were given
      const noShopAcc = G.__noacc && slot === 'acc';
      const b = bestGear(G, cid, cand.filter((id) => !(F.withhold || []).includes(id) && !(noShopAcc && pool.includes(id))), slot);
      if (b) m.equip[slot] = b;
    }
    const st = G.Party.stats(cid); m.hp = st.mhp; m.mp = st.mmp;
    G.state.party.push(cid);
  }
  const inv = T ? Object.assign({}, G.__testKit || {}, T.inv || {}, F.inv || {}) : kitFrom(G, pool, F);
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
  if (sc) sc.__fight = G.__testMode || G.__noTactics ? {} : F; // the browser bot has no per-fight hints (--notactics)
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
    result: res, sc, rounds: sc ? sc.rounds : 0, ko: sc ? sc.__ko || 0 : 0, items: sc ? sc.__items || 0 : 0, itemGold: sc ? sc.__itemGold || 0 : 0, guards: sc ? sc.__guards || 0 : 0,
    hpLeft: party.length ? party.reduce((a, p) => a + (p.dead ? 0 : p.hp), 0) / party.reduce((a, p) => a + p.mhp, 0) : 0,
    alive: party.filter((p) => !p.dead).length, size: party.length,
  };
}

async function runFight(env, F, n, lvShift) {
  const R = { n, win: 0, lose: 0, other: 0, rounds: 0, koAny: 0, ko: 0, items: 0, itemGold: 0, guards: 0, hpLeft: 0, err: null };
  for (let i = 0; i < n; i++) {
    let r;
    try { r = await runOnce(env, F, lvShift); } catch (e) { R.err = String(e && e.stack).split('\n').slice(0, 4).join(' | '); break; }
    if (r.result === 'hung') { R.err = 'battle never finished (a hook waits on input/time)'; break; }
    if (typeof r.result === 'string' && r.result.startsWith('error:')) { R.err = r.result.slice(0, 400); break; }
    const won = F.winIf ? F.winIf(r, env.G) : r.result === 'win';
    if (won) R.win++; else if (r.result === 'lose' || F.winIf) R.lose++; else R.other++;
    R.rounds += r.rounds; R.ko += r.ko; R.koAny += r.ko > 0 ? 1 : 0; R.items += r.items; R.itemGold += r.itemGold || 0; R.guards += r.guards; R.hpLeft += r.hpLeft;
  }
  const m = R.win + R.lose + R.other || 1;
  for (const k of ['rounds', 'ko', 'koAny', 'items', 'itemGold', 'guards', 'hpLeft']) R[k] /= m;
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
  // --ai auto plays the in-game auto-battle (js/engine/autobattle.js) with the player's settings:
  // --autostyle safe|normal|bold (自動戰鬥 保守/標準/積極, default normal), --autoitems off (使用道具 關)
  G.settings.autoStyle = String(opt('autostyle', 'normal'));
  G.settings.autoItems = opt('autoitems', 'on') !== 'off';
  G.__plain = !!opt('plain'); G.__noacc = !!opt('noacc'); G.__noTactics = !!opt('notactics');
  G.__testMode = !!opt('test');
  if (opt('testkit')) G.__testKit = JSON.parse(opt('testkit'));
  G.__testGear = opt('testgear', null);
  if (G.__testMode && opt('testai', 'auto') === 'auto') G.__ai = makeAI(G, 'auto');
  // --set "enemyId:hp*1.3,atk*1.2/otherId:spd*0.9" — try stat multipliers without editing the data
  if (opt('set')) for (const part of String(opt('set')).split('/')) {
    const [eid, mods] = part.split(':');
    const e = G.Data.enemies[eid];
    if (!e) { console.log('--set: unknown enemy ' + eid); continue; }
    for (const m of mods.split(',')) { const [k, f] = m.split('*'); e[k] = Math.round(e[k] * +f); }
  }
  if (opt('areas')) { await runAreas(env, opt('areas') === true ? null : String(opt('areas')), +opt('n', 100)); return; }
  const { FIGHTS } = require('./sim_story_fights');
  let fights = FIGHTS(G);
  if (opt('shops')) { printShops(env); return; }
  // --model normal|minimal|thorough: each boss at the state tools/sim_economy.js expects that player to have there —
  // its whole level (lv.fraction rounded down), the gear it could afford, the consumables it bought (none if it could
  // not afford the chapter's kit). Only the bosses of the model are run. --modelfile f.json: a saved model() result.
  if (opt('model')) {
    const style = String(opt('model'));
    const M = opt('modelfile') ? JSON.parse(fs.readFileSync(opt('modelfile'), 'utf8')) : require('./sim_economy').model();
    const rec = {};
    for (const b of M.bosses) if (b.style === style) rec[b.id] = b;
    fights = fights.filter((F) => rec[F.id]).map((F) => {
      const b = rec[F.id], lv = Math.floor(b.lvf);
      const gear = {};
      for (const cid of F.party) gear[cid] = Object.assign({ weapon: null, armor: null, head: null, feet: null, acc: null }, b.gear[cid] || {});
      const lvs = typeof F.lv === 'object' ? Object.fromEntries(Object.keys(F.lv).map((c) => [c, lv + (F.lv[c] - Math.min(...Object.values(F.lv)))])) : lv;
      return Object.assign({}, F, { lv: lvs, gear, inv: Object.assign({}, b.kit || {}, F.inv || {}), kit: { heal: [0, 0], mp: 0, revive: 0 }, __model: b });
    });
    console.log(`--model ${style}: ${fights.length} bosses at the level / gear / kit of tools/sim_economy.js`);
  }
  if (opt('trace')) {
    const F = fights.find((f) => f.id === opt('trace'));
    G.__trace = [];
    console.log(describe(env, F, +opt('lv', 0)));
    const r = await runOnce(env, F, +opt('lv', 0));
    console.log(G.__trace.join('\n'));
    console.log('result', r.result, 'rounds', r.rounds, 'party', (r.sc ? r.sc.party : []).map((p) => p.id + ':' + p.hp).join(' '), 'enemies', (r.sc ? r.sc.enemies : []).map((e) => e.id + ':' + e.hp + '/' + e.mhp).join(' '));
    return;
  }
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
    const L = G.__testMode && F.test && F.test.lv != null ? F.test.lv : F.lv;
    const lv = typeof L === 'object' ? Object.values(L).join('/') : L;
    const tag = R.err ? 'ERROR ' + R.err : (F.scripted ? 'scripted' : (R.win < 0.6 ? 'HARD' : R.win > 0.97 && R.koAny < 0.03 ? 'TRIVIAL' : ''));
    const mb = F.__model ? `  [model: BALANCE Lv${F.__model.lvBalance}, gear ${Math.round(F.__model.coverage * 100)}%${F.__model.kitFull ? ', kit' : ', no kit'}]` : '';
    console.log(`${F.id.padEnd(22)} ch${String(F.ch).padEnd(3)} L${String(lv).padEnd(9)} win ${(R.win / R.n * 100).toFixed(0).padStart(3)}%  rounds ${R.rounds.toFixed(1).padStart(4)}  KO ${(R.koAny * 100).toFixed(0).padStart(3)}%  items ${R.items.toFixed(1)}  guard ${R.guards.toFixed(1)}  HP ${(R.hpLeft * 100).toFixed(0).padStart(3)}%  ${F.party.map((p) => p.slice(0, 2)).join('')}  ${tag}${mb}`);
    if (opt('verbose')) console.log(describe(env, F, lvShift));
    json.push({ id: F.id, ch: F.ch, name: F.name, lv: F.lv, party: F.party, win: R.win / R.n, koAny: R.koAny, rounds: R.rounds, items: R.items, hpLeft: R.hpLeft, err: R.err });
  }
  if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(json, null, 1));
}

// --areas [id,id]: the js/data areas' field troops and bosses (the list tools/sim_battle.js simulates with its formula
// re-implementation and its own party AI) through the real engine, with the AI of --ai. Party = the area's party, level =
// the area's low level for field troops and its top level for bosses (sim_battle's levelFor), gear = the best item per
// slot with item.ch <= the area's chapter, kit = kitFrom() over the buyable consumables of chapters <= the area's, story
// skills as in sim_battle (STORY). "gold" = shop value of the consumables used per fight.
const AREA_STORY = { xh_xinhuo_ran: 'shrine', xh_xinhuo_zhao: 'shrine', xh_xinhuo_bumie: 'shrine', yg_taixu: 'beigang', hy_luojia: 'dagou', c_qiandeng: 'breath' };
async function runAreas(env, only, n) {
  const { G } = env;
  const AR = G.Data.areas, order = Object.keys(AR);
  console.log(`js/data areas through the real engine — ${opt('ai', 'smart')} AI${opt('ai') === 'auto' ? ` (${G.settings.autoStyle}, items ${G.settings.autoItems ? 'on' : 'off'})` : ''}, n=${n} (bosses ×2)`);
  console.log('  ★ = boss; items/gold = consumables used per fight and their shop value');
  const tot = { trash: { n: 0, win: 0, items: 0, gold: 0 }, boss: { n: 0, win: 0, items: 0, gold: 0 } };
  for (const aid of order) {
    const a = AR[aid];
    if (only && !only.split(',').includes(aid)) continue;
    const pool = Object.keys(G.Data.items).filter((id) => { const it = G.Data.items[id]; return (it.ch || 0) <= a.ch && (it.type !== 'use' || it.price > 0); });
    const skills = {};
    for (const [sk, from] of Object.entries(AREA_STORY)) if (order.indexOf(aid) >= order.indexOf(from)) for (const c of a.party) if ((G.Data.chars[c].learn || []).some((l) => l.skill === sk)) (skills[c] = skills[c] || []).push(sk);
    const rows = [];
    for (const tid of a.troops.concat(a.bosses)) {
      if (!G.Data.troops[tid]) continue;
      const boss = !!G.Data.troops[tid].boss;
      const F = { id: tid, ch: a.ch, troop: tid, party: a.party, lv: boss ? a.lv[1] : a.lv[0], shops: pool, skills, kit: { heal: [5, 3], mp: 3, revive: 2 } };
      const R = await runFight(env, F, boss ? n * 2 : n, 0);
      const t = tot[boss ? 'boss' : 'trash']; t.n++; t.win += R.win / R.n; t.items += R.items; t.gold += R.itemGold;
      rows.push(`  ${(boss ? '★' : ' ') + tid.padEnd(22)} L${String(F.lv).padEnd(3)} win ${(R.win / R.n * 100).toFixed(0).padStart(3)}%  rounds ${R.rounds.toFixed(1).padStart(4)}  KO ${(R.koAny * 100).toFixed(0).padStart(3)}%  items ${R.items.toFixed(2)}  gold ${R.itemGold.toFixed(0).padStart(4)}  guard ${R.guards.toFixed(1)}  HP ${(R.hpLeft * 100).toFixed(0).padStart(3)}%${R.err ? '  ERROR ' + R.err : ''}`);
    }
    console.log(`[ch${a.ch}] ${a.name} (${aid}) L${a.lv[0]}–${a.lv[1]} ${a.party.join(',')}\n${rows.join('\n')}`);
  }
  for (const [k, t] of Object.entries(tot)) if (t.n) console.log(`${k.padEnd(6)} ${t.n} troops: avg win ${(t.win / t.n * 100).toFixed(0)}%  items ${(t.items / t.n).toFixed(2)} (${(t.gold / t.n).toFixed(0)} gold) per fight`);
}

function printShops(env) {
  const { SHOPS } = require('./sim_story_fights');
  for (const [k, v] of Object.entries(SHOPS)) console.log(k.padEnd(14), v.map((id) => `${id}${env.G.Data.items[id] ? '' : '(?)'}`).join(' '));
}

module.exports = { loadGame, makeAI, runFight, runOnce, setup, describe, bestGear, gearScore, kitFrom };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

#!/usr/bin/env node
// 彼岸燈 — battle balance simulator.
//
//   node tools/sim_battle.js              full report: data checks, every area's troops & bosses, progression
//   node tools/sim_battle.js --area forest --n 400     one area, more trials
//   node tools/sim_battle.js --boss       bosses only
//   node tools/sim_battle.js --prog       exp/gold progression only
//   node tools/sim_battle.js --check      reference checks only (also verifies monster art ids if the
//                                         js/gfx/monsters*.js files load in node)
//
// Loads js/data/{characters,skills,items,enemies}.js in a vm context with a global G = { Data: {} } and
// simulates battles with the CONTRACTS formulas (CTB turn order, physical/magic/heal formulas, crit, hit,
// 克 cycle, poison/regen, ±30% buffs, 劍意 gauge) and a simple party AI (heal when hurt, revive, use
// ultimates, otherwise the best expected-damage action with a mild MP cost). The party for each area uses
// the levels from G.Data.areas (normal fights at the area's low level, bosses at its high level) and the best
// equipment with item.ch <= area chapter.
//
// It only knows js/data/*. For the bosses and scripted fights of the chapter files (their own enemies, troops and
// battle rule hooks) use tools/sim_story.js, which runs the real battle engine headless with every chapter loaded and a
// sensible-player AI (tools/test/lib/battlebot.js); results and the tuning behind them are in docs/BALANCE.md.
// The party AI below is this file's own; the in-game auto-battle (F, js/engine/autobattle.js) needs the real engine:
// `node tools/sim_story.js --ai auto --areas` runs this file's area troops and bosses with it.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const N = +opt('n', 200);
const SEED = +opt('seed', 12345);

// ------------------------------------------------------------------------------------------- load data
const ctx = { G: { Data: {} }, console, Math };
vm.createContext(ctx);
for (const f of ['characters', 'skills', 'items', 'enemies']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const D = ctx.G.Data;
const { chars: CH, skills: SK, items: IT, enemies: EN, troops: TR, areas: AR } = D;

// deterministic RNG
let rs = SEED >>> 0;
function rnd() { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const pickW = (arr) => { const tot = arr.reduce((s, a) => s + a.w, 0); let r = rnd() * tot; for (const a of arr) { if ((r -= a.w) <= 0) return a; } return arr[arr.length - 1]; };
const expToNext = (lv) => Math.round(20 * Math.pow(lv, 1.8) + 30);

// ------------------------------------------------------------------------------------------- checks
const FX = 'slash slash_multi thrust fire fire_big water water_big wood wood_big metal metal_big earth earth_big wind heal heal_all revive buff debuff poison sleep seal stun dark ghost song lantern kaleido bite claw beam summon ultimate_xinghe ultimate_baizhi ultimate_hongying ultimate_yungui combo'.split(' ');
const ICONS = 'potion herb food drink wine pill incense talisman bomb mushroom sword spear flute fan armor hat hairpin shoes ring charm jade watch letter scroll key lantern vine gem bag'.split(' ');
const STATUS = 'poison seal sleep stun trance atkUp atkDown defUp defDown magUp magDown spdUp spdDown regen shield guard'.split(' ');
const ELEMS = ['metal', 'wood', 'water', 'fire', 'earth', null];
const BGS = 'dream jiufen_night jiufen_day shore mine forest mushroom pingxi mountain temple city mansion tainan palace linto tribe vision lake shrine chaos sea farshore lighthouse breath tamsui hakka windcave alishan yushan sunmoon procession south wangboat hengchun cape orchid eastcoast taroko toucheng penghu xuanwu'.split(' ');
const BGMS = 'title dream jiufen festival night mine forest mushroom pingxi temple city mansion tainan palace stealth tribe vision lake shrine chaos sea farshore lighthouse breath battle battle2 boss final_boss villain sad tension love ending credits victory gameover hakka wind mountain procession south voyage orchid taroko toucheng penghu'.split(' ');
const SPRITES = 'xinghe baizhi hongying yungui tuanzi chenbo yexuan qingfeng qingfeng_mask qingxu moya tengpo nianer lantern_mother temple_guard'.split(' ');
const ART_CONTRACT = 'wind_demon wind_sprite mountain_ghost plague_ghost greed_ghost moray fallwind sea_monster cliff_spirit hungry_ghost pirate_ghost gorge_colossus tide_serpent'.split(' ');
// ids planned for monsters.js / monsters2.js (tools/preview_monsters*.html at the time of writing)
const ART_PLANNED = 'sea_wisp water_ghost ghost_lantern mine_bat jiangshi tiger_granny marionette lantern_golem linto_jie nether_guardian fog_spirit bear_spirit hundred_eye serpent_shade inner_demon jiao stone_guardian lamp_moth drowned_soldier tide_grudge drowned_swarm kun lily_demon faceless tower_warden jewel_child baibu wuxiang'.split(' ');

function sfxKeys() {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'js/core/audio.js'), 'utf8');
    const i = src.indexOf('const SFX = {'); const j = src.indexOf('\n  };', i);
    return [...src.slice(i, j).matchAll(/^\s{4}([a-z0-9_]+)\(t, o\)/gm)].map((m) => m[1]);
  } catch (e) { return null; }
}
function loadArt() {
  // Try to load the monster modules in a stub canvas environment to list the defined art ids.
  try {
    const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : stub()), apply: () => stub(), set: () => true });
    const c2 = { console: { log() {}, warn() {}, error() {} }, Math, location: { search: '' }, document: { createElement: () => ({ getContext: () => stub(), width: 0, height: 0 }) } };
    c2.window = c2; vm.createContext(c2);
    for (const f of ['js/core/util.js', 'js/gfx/registry.js', 'js/gfx/monsters.js', 'js/gfx/monsters2.js', 'js/gfx/monsters3.js']) {
      const p = path.join(ROOT, f);
      if (fs.existsSync(p)) { try { vm.runInContext(fs.readFileSync(p, 'utf8'), c2, { filename: f }); } catch (e) { /* partial file */ } }
    }
    return c2.G && c2.G.Monsters ? Object.keys(c2.G.Monsters.defs) : [];
  } catch (e) { return []; }
}

function check() {
  const errs = [], warns = [];
  const SFX = sfxKeys();
  for (const [id, s] of Object.entries(SK)) {
    if (!FX.includes(s.fx)) errs.push(`skill ${id}: fx '${s.fx}'`);
    if (SFX && !SFX.includes(s.sfx)) errs.push(`skill ${id}: sfx '${s.sfx}'`);
    if (!ELEMS.includes(s.elem === undefined ? null : s.elem)) errs.push(`skill ${id}: elem ${s.elem}`);
    if (s.status && !STATUS.includes(s.status.id)) errs.push(`skill ${id}: status ${s.status.id}`);
    if (s.outcomes) for (const o of s.outcomes) if (!SK[o.skill]) errs.push(`skill ${id}: outcome ${o.skill}`);
    if (s.summon) for (const e of s.summon) if (!EN[e]) errs.push(`skill ${id}: summon ${e}`);
    if (s.combo) for (const c of s.combo) if (!CH[c]) errs.push(`skill ${id}: combo char ${c}`);
    if (!['phys', 'mag', 'heal', 'buff', 'debuff', 'revive', 'cure', 'special'].includes(s.type)) errs.push(`skill ${id}: type ${s.type}`);
    if (!['enemy', 'enemies', 'ally', 'allies', 'self', 'deadAlly', 'random'].includes(s.target)) errs.push(`skill ${id}: target ${s.target}`);
  }
  for (const [id, c] of Object.entries(CH)) {
    for (const l of c.learn) if (!SK[l.skill]) errs.push(`char ${id}: learn ${l.skill}`);
    if (!SK[c.ultimate]) errs.push(`char ${id}: ultimate ${c.ultimate}`);
    for (const k in c.equip) if (c.equip[k] && !IT[c.equip[k]]) errs.push(`char ${id}: equip ${c.equip[k]}`);
    for (const k in c.equip) { const it = IT[c.equip[k]]; if (it && (it.type !== k || (it.who && !it.who.includes(id)))) errs.push(`char ${id}: equip slot ${k} ${c.equip[k]}`); }
  }
  for (const [id, it] of Object.entries(IT)) {
    if (!ICONS.includes(it.icon)) errs.push(`item ${id}: icon ${it.icon}`);
    if (it.immune) for (const s of it.immune) if (!STATUS.includes(s)) errs.push(`item ${id}: immune ${s}`);
    if (it.use && it.use.status && !STATUS.includes(it.use.status.id)) errs.push(`item ${id}: status`);
  }
  const usedEnemies = new Set();
  for (const [id, t] of Object.entries(TR)) {
    for (const e of t.enemies) { if (!EN[e]) errs.push(`troop ${id}: enemy ${e}`); usedEnemies.add(e); }
    if (!BGS.includes(t.bg)) errs.push(`troop ${id}: bg ${t.bg}`);
    if (!BGMS.includes(t.bgm)) errs.push(`troop ${id}: bgm ${t.bgm}`);
  }
  for (const [id, e] of Object.entries(EN)) {
    for (const s of e.skills) if (!SK[s.id]) errs.push(`enemy ${id}: skill ${s.id}`);
    if (e.phases) for (const p of e.phases) for (const s of p.skills) if (!SK[s.id]) errs.push(`enemy ${id}: phase skill ${s.id}`);
    for (const d of e.drops) if (!IT[d.item]) errs.push(`enemy ${id}: drop ${d.item}`);
    if (e.sprite && !SPRITES.includes(e.sprite)) errs.push(`enemy ${id}: sprite ${e.sprite}`);
    if (!e.sprite && !e.art) errs.push(`enemy ${id}: no art`);
    if (!e.desc) warns.push(`enemy ${id}: no desc`);
    if (!usedEnemies.has(id) && !Object.values(SK).some((s) => s.summon && s.summon.includes(id))) warns.push(`enemy ${id}: unused`);
  }
  for (const [id, a] of Object.entries(AR)) for (const t of a.troops.concat(a.bosses)) if (!TR[t]) errs.push(`area ${id}: troop ${t}`);
  const arts = [...new Set(Object.values(EN).filter((e) => e.art).map((e) => e.art))].sort();
  const defined = loadArt();
  const known = new Set([...ART_CONTRACT, ...ART_PLANNED, ...defined]);
  const unknownArt = arts.filter((a) => !known.has(a));
  const notYetDrawn = arts.filter((a) => !defined.includes(a));
  return { errs, warns, arts, unknownArt, notYetDrawn, definedCount: defined.length };
}

// ------------------------------------------------------------------------------------------- party
const AREA_ORDER = Object.keys(AR);
const idx = (a) => AREA_ORDER.indexOf(a);
// story unlocks: skill available in areas strictly after `after` (or at it when `at:true` — boss fights only after)
const STORY = {
  xh_xinhuo_ran: { from: 'shrine' }, xh_xinhuo_zhao: { from: 'shrine' }, xh_xinhuo_bumie: { from: 'shrine' },
  yg_taixu: { from: 'beigang' }, hy_luojia: { from: 'dagou' }, c_qiandeng: { from: 'breath' },
};
// equipment withheld for specific fights (story gifts not yet received)
const WITHHOLD = { boss_moya: ['sw_yinghuo'], boss_ghost_king: ['sw_yinghuo'], mine: ['sw_yinghuo'], dream: ['sw_yinghuo'] };

function bestGear(cid, ch, slot, withhold) {
  const c = CH[cid];
  const cand = Object.entries(IT).filter(([id, it]) => it.type === slot && (it.ch || 0) <= ch && (!it.who || it.who.includes(cid)) && !(withhold || []).includes(id));
  const score = (it) => {
    const s = it.stats || {};
    if (slot === 'weapon') return (c.weapon === 'flute' || c.weapon === 'talisman') ? (s.mag || 0) * 1.0 + (s.atk || 0) * 0.2 : (s.atk || 0) + (s.mag || 0) * 0.1;
    if (slot === 'acc') return (s.atk || 0) + (s.def || 0) + (s.mag || 0) + (s.luk || 0) * 0.3 + (s.hp || 0) / 10 + (it.special ? 6 : 0) + (it.immune ? 3 : 0);
    return (s.def || 0) * 2 + (s.spd || 0) + (s.mag || 0) + (s.hp || 0) / 10 + (s.atk || 0);
  };
  cand.sort((a, b) => score(b[1]) - score(a[1]));
  return cand.length ? cand[0][0] : null;
}

function makeMember(cid, lv, ch, areaId, troopId) {
  const d = CH[cid];
  const withhold = (WITHHOLD[troopId] || []).concat(WITHHOLD[areaId] || []);
  const equip = {};
  for (const slot of ['weapon', 'armor', 'head', 'feet', 'acc']) equip[slot] = bestGear(cid, ch, slot, withhold);
  const s = {};
  for (const k of ['hp', 'mp', 'atk', 'def', 'mag', 'spd', 'luk']) s[k] = d.base[k] + d.growth[k] * (lv - 1);
  const specials = [], immune = [], resist = [];
  let elem = d.elem;
  for (const slot in equip) {
    const it = IT[equip[slot]]; if (!it) continue;
    for (const k in it.stats || {}) s[k] += it.stats[k];
    if (it.special) specials.push(...it.special);
    if (it.immune) immune.push(...it.immune);
    if (it.resist) resist.push(...it.resist);
    if (slot === 'weapon' && it.elem) elem = it.elem;
  }
  const skills = d.learn.filter((l) => !l.story && l.lv <= lv).map((l) => l.skill)
    .concat(d.learn.filter((l) => l.story && STORY[l.skill] && idx(areaId) >= idx(STORY[l.skill].from)).map((l) => l.skill));
  const ults = [d.ultimate].concat(skills.filter((k) => SK[k].ultimate));
  return {
    side: 'p', id: cid, name: d.name, lv, elem, equip, specials, immune, resist,
    mhp: Math.round(s.hp), hp: Math.round(s.hp), mmp: Math.round(s.mp), mp: Math.round(s.mp),
    atk: Math.round(s.atk), def: Math.round(s.def), mag: Math.round(s.mag), spd: Math.round(s.spd), luk: Math.round(s.luk),
    skills: skills.filter((k) => !SK[k].ultimate), ults, gauge: 0, st: {}, buffs: {},
  };
}
function makeEnemy(eid) {
  const e = EN[eid];
  return {
    side: 'e', id: eid, name: e.name, lv: e.lv, elem: e.elem, mhp: e.hp, hp: e.hp, mmp: e.mp, mp: e.mp, atk: e.atk, def: e.def, mag: e.mag,
    spd: e.spd, luk: e.luk, weak: e.weak || [], resist: e.resist || [], immune: e.immune || [], skillList: e.skills, phases: (e.phases || []).slice(),
    endAt: e.endAt, boss: !!e.boss, st: {}, buffs: {}, specials: [], phase: 1, used: {},
  };
}

// ------------------------------------------------------------------------------------------- battle
const KE = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
function elemMult(ae, t) {
  if (!ae) return 1;
  if (t.weak && t.weak.includes(ae)) return 1.5;
  if (t.resist && t.resist.includes(ae)) return 0.5;
  if (!t.elem) return 1;
  if (KE[ae] === t.elem) return 1.5;
  if (KE[t.elem] === ae) return 0.7;
  return 1;
}
const stat = (u, k) => { const b = u.buffs[k]; return u[k] * (b ? (b.amt > 0 ? 1.3 : 0.7) : 1) * (k === 'mag' && u.st.trance ? 1.2 : 1); };
const alive = (arr) => arr.filter((u) => u.hp > 0);
const wait = (u, delay) => 100 * (delay || 1) * 40 / (stat(u, 'spd') + 40);

function physDmg(a, t, power, elem, exp) {
  const base = power * stat(a, 'atk') * 2 * 50 / (50 + stat(t, 'def'));
  const em = elemMult(elem, t);
  const crit = Math.min(0.6, 0.05 + stat(a, 'luk') / 500 + (a.specials.includes('critUp') ? 0.1 : 0) + (a.st.trance ? 0.2 : 0));
  const hit = Math.max(0.6, Math.min(0.99, 0.95 - (stat(t, 'spd') - stat(a, 'spd')) / 400));
  let d = base * em * (t.st.guard ? 0.5 : 1) * (t.st.shield ? 0.6 : 1);
  if (t.side === 'p' && t.resist.includes(elem)) d *= 0.6;
  if (exp) return d * hit * (1 + crit * 0.5);
  if (rnd() > hit) return -1;
  return Math.max(1, Math.round(d * (0.9 + rnd() * 0.2) * (rnd() < crit ? 1.5 : 1)));
}
function magDmg(a, t, power, elem, exp) {
  const m = stat(a, 'mag');
  const base = power * m * 2 * 50 / (50 + stat(t, 'def') * 0.3 + stat(t, 'mag') * 0.7); // engine: the TARGET's mag resists (battle.js applyEffect)
  let d = base * elemMult(elem, t) * (t.st.shield ? 0.6 : 1);
  if (t.side === 'p' && t.resist.includes(elem)) d *= 0.6;
  if (exp) return d;
  return Math.max(1, Math.round(d * (0.9 + rnd() * 0.2)));
}
const healAmt = (a, power) => (power * stat(a, 'mag') * 1.2 + power * 10) * (a.specials.includes('healUp') ? 1.25 : 1);

function applyStatus(t, s) {
  if (!s || t.hp <= 0) return;
  if (t.immune.includes(s.id)) return;
  if (rnd() > (s.chance == null ? 1 : s.chance)) return;
  if (/Up$|Down$/.test(s.id)) { const k = s.id.replace(/Up|Down/, ''); t.buffs[k] = { amt: s.id.endsWith('Up') ? 0.3 : -0.3, turns: s.turns }; return; }
  t.st[s.id] = s.turns;
}
function applyBuffs(t, buffs) { for (const b of buffs || []) if (t.hp > 0) t.buffs[b.stat] = { amt: b.amt, turns: b.turns }; }

function damage(B, t, d) {
  if (d <= 0) return 0;
  const real = Math.min(t.hp, d);
  t.hp -= real;
  if (t.st.sleep) delete t.st.sleep;
  if (t.side === 'p') { t.gauge = Math.min(100, t.gauge + real / t.mhp * 100 * (t.specials.includes('gaugeUp') ? 1.5 : 1)); B.dmgTaken += real; }
  if (t.side === 'e' && t.phases.length && t.hp > 0) {
    const ph = t.phases[0];
    if (t.hp <= ph.at * t.mhp) { t.phases.shift(); t.skillList = ph.skills; t.phase = ph.phase; applyBuffs(t, ph.buffs); }
  }
  return real;
}

// resolve a skill (or item-like effect) by user u on target list
function resolve(B, u, sk, targets) {
  const foes = u.side === 'p' ? B.enemies : B.party;
  const friends = u.side === 'p' ? B.party : B.enemies;
  let total = 0;
  if (sk.type === 'phys' || sk.type === 'mag') {
    const hits = sk.hits || 1;
    for (let h = 0; h < hits; h++) {
      let tl = targets;
      if (sk.target === 'random') { const al = alive(foes); if (!al.length) break; tl = [al[Math.floor(rnd() * al.length)]]; }
      for (const t of tl) {
        if (t.hp <= 0) continue;
        const el = sk.elem !== undefined && sk.elem !== null ? sk.elem : (sk.isAttack ? u.elem : null);
        const d = sk.type === 'phys' ? physDmg(u, t, sk.power, el) : magDmg(u, t, sk.power, el);
        if (d > 0) { total += damage(B, t, d); if (sk.status) applyStatus(t, sk.status); if (sk.buffs) applyBuffs(t, sk.buffs); }
      }
    }
    if (B.endCheck) B.endCheck();
  } else if (sk.type === 'heal') {
    for (const t of targets) {
      if (t.hp <= 0 && !sk.revive) continue;
      const amt = Math.round(healAmt(u, sk.power));
      t.hp = Math.min(t.mhp, t.hp + amt);
      if (sk.status) applyStatus(t, sk.status);
      if (sk.cure) for (const c of sk.cure) { delete t.st[c]; if (/Down$/.test(c)) { const k = c.replace('Down', ''); if (t.buffs[k] && t.buffs[k].amt < 0) delete t.buffs[k]; } }
      if (sk.buffs) applyBuffs(t, sk.buffs);
    }
  } else if (sk.type === 'revive') {
    for (const t of targets) if (t.hp <= 0) t.hp = Math.max(1, Math.round(t.mhp * sk.power));
  } else if (sk.type === 'buff' || sk.type === 'debuff' || sk.type === 'cure') {
    for (const t of targets) {
      if (t.hp <= 0) continue;
      if (sk.status) applyStatus(t, sk.status);
      if (sk.buffs) applyBuffs(t, sk.buffs);
      if (sk.cure) for (const c of sk.cure) delete t.st[c];
    }
  } else if (sk.type === 'special' && sk.summon && u.side === 'e') {
    for (const eid of sk.summon) if (alive(B.enemies).length < 5) { const e = makeEnemy(eid); e.ct = B.time + wait(e); B.enemies.push(e); }
  }
  return total;
}
function targetsFor(B, u, sk, chosen) {
  const foes = u.side === 'p' ? B.enemies : B.party, friends = u.side === 'p' ? B.party : B.enemies;
  switch (sk.target) {
    case 'enemy': return [chosen || alive(foes)[Math.floor(rnd() * alive(foes).length)]];
    case 'enemies': return alive(foes);
    case 'ally': return [chosen || alive(friends).sort((a, b) => a.hp / a.mhp - b.hp / b.mhp)[0]];
    case 'allies': return sk.revive ? friends : alive(friends);
    case 'self': return [u];
    case 'deadAlly': return [chosen || friends.find((f) => f.hp <= 0)].filter(Boolean);
    case 'random': return [];
  }
  return [];
}

// ---- party AI -------------------------------------------------------------------------------
function expectedDmg(B, u, sk, t) {
  const el = sk.elem !== undefined && sk.elem !== null ? sk.elem : (sk.isAttack ? u.elem : null);
  const one = (tt) => Math.min(tt.hp, (sk.type === 'phys' ? physDmg(u, tt, sk.power, el, true) : magDmg(u, tt, sk.power, el, true)) * (sk.hits || 1));
  const al = alive(B.enemies);
  if (sk.target === 'enemies') return al.reduce((s, tt) => s + one(tt), 0);
  if (sk.target === 'random') return al.reduce((s, tt) => s + one(tt), 0) / al.length * Math.min(1, 1); // spread
  return one(t);
}
function bestTarget(B, u, sk) {
  let best = null, bv = -1;
  for (const t of alive(B.enemies)) { const v = expectedDmg(B, u, sk, t) + (t.hp <= expectedDmg(B, u, sk, t) ? t.mhp * 0.3 : 0); if (v > bv) { bv = v; best = t; } }
  return best;
}
const ATTACK = { name: '攻擊', type: 'phys', power: 1, target: 'enemy', mp: 0, isAttack: true };

function partyAct(B, u) {
  const al = alive(B.party), dead = B.party.filter((p) => p.hp <= 0);
  const can = (k) => !u.st.seal && SK[k] && u.mp >= SK[k].mp;
  const skills = u.skills.filter((k) => !SK[k].hidden && !SK[k].combo);
  const heals = skills.filter((k) => SK[k].type === 'heal' && can(k));
  const revs = skills.filter((k) => SK[k].type === 'revive' && can(k));
  const isHealer = u.id === 'baizhi' || (heals.length && !B.party.some((p) => p.id === 'baizhi' && p.hp > 0));
  const low = al.filter((p) => p.hp / p.mhp < 0.5);
  // 1. revive
  if (dead.length && revs.length) { const k = revs.sort((a, b) => SK[b].power - SK[a].power)[0]; return { sk: SK[k], id: k, t: [dead[0]] }; }
  if (dead.length && B.items.revive > 0 && (isHealer || !B.party.some((p) => p.hp > 0 && p.skills.some((k) => SK[k].type === 'revive')))) { B.items.revive--; B.itemsUsed++; return { item: true, fn: () => { dead[0].hp = Math.round(dead[0].mhp * B.items.reviveAmt); } }; }
  // 2. ultimates (baizhi's heal ultimate only when hurt)
  if (u.gauge >= 100 && !u.st.seal) {
    const opts = u.ults.filter((k) => SK[k].type !== 'heal' || low.length >= 1 || dead.length);
    if (opts.length) {
      const k = opts.sort((a, b) => (SK[b].type === 'heal' ? 1e9 : expectedDmg(B, u, SK[b], bestTarget(B, u, SK[b]))) - (SK[a].type === 'heal' ? 1e9 : expectedDmg(B, u, SK[a], bestTarget(B, u, SK[a]))))[0];
      u.gauge = 0; const sk = SK[k];
      return { sk, id: k, t: targetsFor(B, u, sk, sk.target === 'enemy' ? bestTarget(B, u, sk) : null) };
    }
  }
  // 3. heal
  if (isHealer && heals.length) {
    const hurt = al.filter((p) => p.hp / p.mhp < 0.6);
    const allH = heals.filter((k) => SK[k].target === 'allies').sort((a, b) => SK[b].power - SK[a].power);
    const oneH = heals.filter((k) => SK[k].target === 'ally').sort((a, b) => SK[b].power - SK[a].power);
    if (hurt.length >= 2 && allH.length) { const k = allH[0]; return { sk: SK[k], id: k, t: alive(B.party) }; }
    const worst = al.sort((a, b) => a.hp / a.mhp - b.hp / b.mhp)[0];
    if (worst.hp / worst.mhp < 0.45) {
      const need = worst.mhp - worst.hp;
      const k = oneH.find((kk) => healAmt(u, SK[kk].power) <= need * 1.2) || oneH[oneH.length - 1] || allH[0];
      if (k) return { sk: SK[k], id: k, t: SK[k].target === 'allies' ? alive(B.party) : [worst] };
    }
  }
  // 4. items when someone is in danger and nobody can heal
  const crit = al.filter((p) => p.hp / p.mhp < 0.3);
  if (crit.length && B.items.heal > 0 && !(isHealer && heals.length)) {
    B.items.heal--; B.itemsUsed++;
    const t = crit[0]; return { item: true, fn: () => { t.hp = Math.min(t.mhp, t.hp + B.items.healAmt); } };
  }
  // 5. opening buffs / debuffs in boss fights
  if (B.boss && !u.st.seal) {
    const tryB = (k, cond) => (skills.includes(k) && can(k) && cond) ? { sk: SK[k], id: k, t: targetsFor(B, u, SK[k], alive(B.enemies)[0]) } : null;
    const bossE = alive(B.enemies)[0];
    const r = tryB('hy_xushi', !u.buffs.atk) || tryB('yg_tiangang', bossE && !bossE.buffs.def) || tryB('bz_yuewu', !B.party[0].buffs.def && u.mp > u.mmp * 0.5);
    if (r) return r;
  }
  // 6. damage: combos + skills + attack
  const opts = [{ sk: ATTACK, id: 'attack' }];
  if (!u.st.seal) for (const k of skills) { const s = SK[k]; if ((s.type === 'phys' || s.type === 'mag') && can(k)) opts.push({ sk: s, id: k }); }
  const reserve = isHealer ? u.mmp * 0.35 : 0;
  const atkVal = expectedDmg(B, u, ATTACK, bestTarget(B, u, ATTACK));
  const kmp = B.boss ? atkVal / 25 : atkVal / 7;
  let best = null, bv = -1;
  for (const o of opts) {
    if (o.sk.mp && u.mp - o.sk.mp < reserve) continue;
    const t = o.sk.target === 'enemy' ? bestTarget(B, u, o.sk) : null;
    const v = expectedDmg(B, u, o.sk, t) - (o.sk.mp || 0) * kmp;
    if (v > bv) { bv = v; best = { sk: o.sk, id: o.id, t: o.sk.target === 'random' ? [] : (t ? [t] : alive(B.enemies)) }; }
  }
  // combos (boss fights): compare against both members' normal value
  if (B.boss && !u.st.seal) {
    for (const [k, s] of Object.entries(SK)) {
      if (!s.combo || !s.combo.includes(u.id) || s.combo[0] !== u.id) continue;
      if (STORY[k] && idx(B.areaId) < idx(STORY[k].from)) continue;
      const mates = s.combo.map((c) => B.party.find((p) => p.id === c));
      if (mates.some((m) => !m || m.hp <= 0 || m.mp < s.mp || m.st.seal || m.st.sleep || m.st.stun || m.lv < (s.comboLv || 1))) continue;
      const avg = { ...u, atk: mates.reduce((a, m) => a + stat(m, 'atk'), 0) / mates.length, mag: mates.reduce((a, m) => a + stat(m, 'mag'), 0) / mates.length, buffs: {}, st: {} };
      let v;
      if (s.type === 'heal') v = alive(B.party).filter((p) => p.hp / p.mhp < 0.6).length >= 2 ? 1e8 : -1;
      else { const t = s.target === 'enemy' ? bestTarget(B, avg, s) : null; v = expectedDmg(B, avg, s, t) - bv * mates.length - s.mp * kmp * mates.length; }
      if (v > 0 && (!best || v + bv > bv)) {
        const t = s.target === 'enemy' ? bestTarget(B, avg, s) : null;
        return { sk: s, id: k, combo: mates, user: avg, t: s.type === 'heal' ? alive(B.party) : (t ? [t] : alive(B.enemies)) };
      }
    }
  }
  return best;
}

function enemyAct(B, u) {
  const hpP = u.hp / u.mhp * 100;
  const ok = u.skillList.filter((s) => {
    const sk = SK[s.id];
    if (u.st.seal && sk.type !== 'phys') return false;
    if (!s.if) return true;
    if (s.if === 'once') return !u.used[s.id];
    let m;
    if ((m = /^hp<(\d+)/.exec(s.if))) return hpP < +m[1] && !(sk.type === 'buff' && (u.used[s.id] || 0) >= 2);
    if ((m = /^hp>(\d+)/.exec(s.if))) return hpP > +m[1];
    if (s.if === 'ally_hurt') return alive(B.enemies).some((e) => e.hp / e.mhp < 0.5);
    if ((m = /^turn>(\d+)/.exec(s.if))) return (u.turns || 0) > +m[1];
    return true;
  });
  if (!ok.length) return { sk: { ...ATTACK }, id: 'attack', t: [alive(B.party)[Math.floor(rnd() * alive(B.party).length)]] };
  const s = pickW(ok); u.used[s.id] = (u.used[s.id] || 0) + 1;
  const sk = SK[s.id];
  let chosen = null;
  if (sk.target === 'ally') chosen = alive(B.enemies).sort((a, b) => a.hp / a.mhp - b.hp / b.mhp)[0];
  return { sk, id: s.id, t: targetsFor(B, u, sk, chosen) };
}

function tick(u, B) {
  // start-of-turn effects; returns false if the unit loses its turn
  if (u.st.poison) damage(B, u, Math.max(1, Math.round(u.mhp * 0.06)));
  if (u.st.regen && u.hp > 0) u.hp = Math.min(u.mhp, u.hp + Math.round(u.mhp * 0.08));
  if (u.specials.includes('mpRegen')) u.mp = Math.min(u.mmp, u.mp + Math.round(u.mmp * 0.04));
  let skip = false;
  if (u.st.sleep || u.st.stun) skip = true;
  if (u.st.trance && rnd() < 0.1) skip = true;
  for (const k in u.st) { if (--u.st[k] <= 0) delete u.st[k]; }
  for (const k in u.buffs) { if (u.buffs[k].turns < 90 && --u.buffs[k].turns <= 0) delete u.buffs[k]; }
  return !skip && u.hp > 0;
}

function battle(partyIds, lv, troopId, areaId, items) {
  const a = AR[areaId];
  const B = {
    party: partyIds.map((c) => makeMember(c, typeof lv === 'object' ? lv[c] : lv, a.ch, areaId, troopId)),
    enemies: TR[troopId].enemies.map(makeEnemy), boss: !!TR[troopId].boss, areaId,
    time: 0, actionsP: 0, dmgTaken: 0, itemsUsed: 0, items: Object.assign({}, items), over: null,
  };
  for (const p of B.party) if (p.specials.includes('autoRegen')) p.st.regen = 5;
  const all = () => B.party.concat(B.enemies);
  for (const u of all()) u.ct = u.specials.includes('firstStrike') ? 0 : wait(u) * rnd();
  const mhpTot = B.party.reduce((s, p) => s + p.mhp, 0), mpTot = B.party.reduce((s, p) => s + p.mmp, 0);
  B.endCheck = () => { for (const e of B.enemies) if (e.endAt && e.hp > 0 && e.hp <= e.endAt * e.mhp) B.over = 'win'; };
  let guard = 0;
  while (!B.over && guard++ < 2000) {
    const units = all().filter((u) => u.hp > 0);
    const u = units.sort((x, y) => x.ct - y.ct)[0];
    B.time = u.ct;
    let act = null;
    if (tick(u, B)) {
      u.turns = (u.turns || 0) + 1;
      act = u.side === 'p' ? partyAct(B, u) : enemyAct(B, u);
      if (act) {
        if (act.item) act.fn();
        else {
          const user = act.user || u;
          if (act.combo) { for (const m of act.combo) { m.mp -= act.sk.mp; if (m !== u) m.ct += wait(m, 1); m.gauge = Math.min(100, m.gauge + 8); } }
          else if (u.side === 'p') u.mp -= act.sk.mp || 0;
          resolve(B, user, act.sk, act.t);
        }
      }
      if (u.side === 'p') { B.actionsP++; u.gauge = Math.min(100, u.gauge + 8 * (u.specials.includes('gaugeUp') ? 1.5 : 1)); }
    }
    u.ct += wait(u, act && act.sk ? act.sk.delay : 1);
    if (!alive(B.enemies).length) B.over = 'win';
    else if (!alive(B.party).length) B.over = 'lose';
    else if (B.actionsP > 60 * B.party.length) B.over = 'timeout';
  }
  const hpLeft = B.party.reduce((s, p) => s + Math.max(0, p.hp), 0);
  return {
    win: B.over === 'win', rounds: B.actionsP / B.party.length,
    hpLost: 1 - hpLeft / mhpTot, taken: B.dmgTaken / mhpTot, deaths: B.party.filter((p) => p.hp <= 0).length,
    mpUsed: 1 - B.party.reduce((s, p) => s + p.mp, 0) / mpTot, items: B.itemsUsed,
  };
}

function itemKit(ch, boss) {
  // consumables a reasonable player carries: best single-target heal available by this chapter
  const heals = Object.values(IT).filter((it) => it.type === 'use' && it.use && it.use.heal && it.use.target === 'ally' && (it.ch || 0) <= ch && it.price > 0);
  const healAmt = heals.reduce((m, it) => Math.max(m, Math.min(it.use.heal, 99999)), 0);
  return { heal: boss ? 8 : 1, healAmt, revive: boss ? (ch >= 2 ? 3 : 1) : 0, reviveAmt: ch >= 7 ? 1.0 : 0.3 };
}

function runTroop(areaId, troopId, lv, partyIds, n) {
  const a = AR[areaId]; const boss = !!TR[troopId].boss;
  const items = itemKit(a.ch, boss);
  const R = { win: 0, rounds: 0, hpLost: 0, taken: 0, deaths: 0, mpUsed: 0, items: 0, n };
  for (let i = 0; i < n; i++) {
    const r = battle(partyIds, lv, troopId, areaId, items);
    R.win += r.win ? 1 : 0; R.rounds += r.rounds; R.hpLost += r.hpLost; R.taken += r.taken; R.deaths += r.deaths; R.mpUsed += r.mpUsed; R.items += r.items;
  }
  for (const k of ['win', 'rounds', 'hpLost', 'taken', 'deaths', 'mpUsed', 'items']) R[k] /= n;
  return R;
}

// which party fights a given troop (story joins inside an area)
function partyFor(areaId, troopId) {
  if (troopId === 'boss_hongying') return ['xinghe', 'baizhi'];
  return AR[areaId].party;
}
function levelFor(areaId, troopId) {
  const a = AR[areaId];
  if (troopId === 'boss_hongying') return 4;           // "beatable at ~L4"
  return TR[troopId].boss ? a.lv[1] : a.lv[0];
}

// ------------------------------------------------------------------------------------------- report
const pct = (x) => (x * 100).toFixed(0).padStart(3) + '%';
const f1 = (x) => x.toFixed(1).padStart(4);
function flag(R, boss) {
  const f = [];
  if (R.win < (boss ? 0.8 : 0.97)) f.push('LOW-WIN');
  if (!boss && R.rounds > 4.5) f.push('LONG');
  if (!boss && R.rounds < 1.6) f.push('SHORT');
  if (!boss && R.hpLost > 0.45) f.push('HARSH');
  if (!boss && R.hpLost < 0.05) f.push('SOFT');
  if (boss && R.rounds < 5.5) f.push('SHORT');
  if (boss && R.rounds > 13) f.push('LONG');
  if (boss && R.win > 0.99 && R.taken < 0.8) f.push('EASY');
  if (boss && R.taken > 2.2) f.push('BRUTAL');
  return f.join(' ');
}
function reportAreas(onlyArea, bossOnly) {
  console.log('\n=== Battles (n=' + N + ' each; rounds = party actions / party size; HP lost = party HP missing at the end; taken = total damage received / party max HP; items = consumables used) ===');
  const summary = [];
  for (const [aid, a] of Object.entries(AR)) {
    if (onlyArea && aid !== onlyArea) continue;
    const ts = bossOnly ? a.bosses : a.troops.concat(a.bosses);
    if (!ts.length) continue;
    console.log(`\n[ch${a.ch}] ${a.name} (${aid})  levels ${a.lv[0]}–${a.lv[1]}  party: ${a.party.join(',')}`);
    let agg = { n: 0, win: 0, rounds: 0, hpLost: 0, taken: 0 };
    for (const tid of ts) {
      const lv = levelFor(aid, tid), pIds = partyFor(aid, tid);
      const R = runTroop(aid, tid, lv, pIds, TR[tid].boss ? Math.max(N, 200) : N);
      const boss = !!TR[tid].boss;
      console.log(`  ${(boss ? '★' : ' ') + tid.padEnd(20)} L${String(lv).padEnd(3)} win ${pct(R.win)}  rounds ${f1(R.rounds)}  HP lost ${pct(R.hpLost)}  taken ${pct(R.taken)}  KO ${R.deaths.toFixed(2)}  MP ${pct(R.mpUsed)}  items ${R.items.toFixed(1)}  ${TR[tid].enemies.join('+')}  ${flag(R, boss)}`);
      if (!boss) { agg.n++; agg.win += R.win; agg.rounds += R.rounds; agg.hpLost += R.hpLost; agg.taken += R.taken; }
      else summary.push({ aid, tid, lv, R });
    }
    if (agg.n) console.log(`  ${'avg normal'.padEnd(21)}      win ${pct(agg.win / agg.n)}  rounds ${f1(agg.rounds / agg.n)}  HP lost ${pct(agg.hpLost / agg.n)}  taken ${pct(agg.taken / agg.n)}`);
  }
  return summary;
}

function progression(fightsPerArea) {
  console.log(`\n=== Exp / gold progression (${fightsPerArea} random fights per area + every boss; full troop exp to each active member) ===`);
  const lvs = { xinghe: 1, baizhi: 1, hongying: 0, yungui: 0 };
  const exp = { xinghe: 0, baizhi: 0, hongying: 0, yungui: 0 };
  const join = { forest: { hongying: 5 }, guanyin: { yungui: 10 } };
  const absent = (aid, c) => c === 'baizhi' && AR[aid].ch >= 7 && aid !== 'breath';
  let gold = 0, chGold = {}, lastCh = -1;
  const rows = [];
  for (const [aid, a] of Object.entries(AR)) {
    for (const [c, l] of Object.entries(join[aid] || {})) { const avg = Math.round((lvs.xinghe + lvs.baizhi) / 2); lvs[c] = Math.max(l, avg - 1); exp[c] = 0; }
    if (aid === 'breath') { lvs.baizhi = Math.max(lvs.baizhi, Math.round((lvs.xinghe + lvs.hongying + lvs.yungui) / 3)); }
    const startLv = lvs.xinghe;
    const fights = [];
    for (let i = 0; i < fightsPerArea; i++) fights.push(a.troops[Math.floor(rnd() * a.troops.length)]);
    fights.push(...a.bosses);
    for (const tid of fights) {
      const ex = TR[tid].enemies.reduce((s, e) => s + EN[e].exp, 0);
      const gd = TR[tid].enemies.reduce((s, e) => s + EN[e].gold, 0);
      gold += gd; chGold[a.ch] = (chGold[a.ch] || 0) + gd;
      for (const c of Object.keys(lvs)) {
        if (!lvs[c] || absent(aid, c)) continue;
        if (!a.party.includes(c) && !(aid === 'breath')) continue;
        exp[c] += ex;
        while (exp[c] >= expToNext(lvs[c]) && lvs[c] < 50) { exp[c] -= expToNext(lvs[c]); lvs[c]++; }
      }
    }
    // benched / absent members are levelled to the party on rejoin (engine/script responsibility)
    rows.push({ aid, ch: a.ch, target: a.lv, start: startLv, end: lvs.xinghe, lvs: { ...lvs } });
  }
  const prog = D.progression;
  console.log('  area            ch  target    xinghe start→end   (hongying, yungui)');
  for (const r of rows) {
    const p = prog[r.ch];
    const ok = r.end >= r.target[1] - 1 && r.end <= r.target[1] + 2 ? '' : '  <-- off by ' + (r.end - r.target[1]);
    console.log(`  ${r.aid.padEnd(14)} ${String(r.ch).padStart(2)}  ${String(r.target[0]).padStart(2)}–${String(r.target[1]).padEnd(3)}   ${String(r.start).padStart(2)} → ${String(r.end).padEnd(3)}  (${r.lvs.hongying || '-'}, ${r.lvs.yungui || '-'})${ok}`);
  }
  // gear cost per chapter: buying every new shop item for the members present
  console.log('\n  gold per chapter vs. cost of buying each present member the new shop gear of that chapter:');
  for (let ch = 1; ch <= 11; ch++) {
    const party = D.progression[ch].party;
    let cost = 0;
    for (const c of party) for (const slot of ['weapon', 'armor', 'head', 'feet']) {
      const id = bestGear(c, ch, slot), it = IT[id];
      if (it && it.ch === ch && it.price > 0) cost += it.price;
    }
    console.log(`   ch${String(ch).padEnd(3)} earned ${String(chGold[ch] || 0).padStart(6)}   new-gear cost ${String(cost).padStart(6)}   ratio ${cost ? ((chGold[ch] || 0) / cost).toFixed(2) : '-'}`);
  }
}

// ------------------------------------------------------------------------------------------- main
const C = check();
console.log(`Data: ${Object.keys(CH).length} chars, ${Object.keys(SK).length} skills (${Object.keys(SK).filter((k) => k.startsWith('e_')).length} enemy), ${Object.keys(IT).length} items, ${Object.keys(EN).length} enemies, ${Object.keys(TR).length} troops, ${Object.keys(AR).length} areas`);
if (C.errs.length) { console.log('ERRORS:\n  ' + C.errs.join('\n  ')); }
else console.log('Reference check: OK');
if (C.warns.length) console.log('Warnings:\n  ' + C.warns.join('\n  '));
console.log(`Monster art ids used (${C.arts.length}); drawn by gfx files right now: ${C.definedCount}`);
if (C.unknownArt.length) console.log('  art ids not in CONTRACTS / planned lists (art agents must add, or remap): ' + C.unknownArt.join(', '));
if (opt('check')) { if (C.notYetDrawn.length) console.log('  not drawn yet: ' + C.notYetDrawn.join(', ')); process.exit(C.errs.length ? 1 : 0); }
if (opt('prog')) { progression(+opt('fights', 11)); process.exit(0); }
reportAreas(opt('area', null), !!opt('boss'));
if (!opt('area') && !opt('boss')) progression(+opt('fights', 11));

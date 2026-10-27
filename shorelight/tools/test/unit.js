#!/usr/bin/env node
// Shorelight engine-logic unit tests (Node, no browser).
//
//   node tools/test/unit.js              # run all
//   node tools/test/unit.js save battle  # only tests whose name contains one of the words
//
// Each test gets a FRESH game context (tools/test/load.js) with a small deterministic fixture
// (qa_* characters / skills / items) injected into G.Data, so engine logic is tested independently of
// the evolving game content. A few "content" tests at the end run over the real data.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const { load, ROOT, indexScripts } = require('./load');

// ------------------------------------------------------------------ tiny test framework
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
class AssertionError extends Error {}
const fmt = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
const A = {
  ok(v, msg) { if (!v) throw new AssertionError(msg || `expected truthy, got ${fmt(v)}`); },
  eq(a, b, msg) { if (a !== b) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ${fmt(b)}, got ${fmt(a)}`); },
  near(a, b, eps = 1e-6, msg) { if (!(Math.abs(a - b) <= eps)) throw new AssertionError(`${msg ? msg + ': ' : ''}expected ≈${b}, got ${a}`); },
  deep(a, b, msg) { const x = fmt(sortKeys(a)), y = fmt(sortKeys(b)); if (x !== y) throw new AssertionError(`${msg ? msg + ': ' : ''}\n      expected ${y.slice(0, 400)}\n      got      ${x.slice(0, 400)}`); },
  throws(fn, msg) { try { fn(); } catch (e) { return e; } throw new AssertionError(msg || 'expected an exception'); },
  includes(arr, v, msg) { if (!arr || !arr.includes(v)) throw new AssertionError(`${msg ? msg + ': ' : ''}${fmt(arr)} does not include ${fmt(v)}`); },
  notIncludes(arr, v, msg) { if (arr && arr.includes(v)) throw new AssertionError(`${msg ? msg + ': ' : ''}${fmt(arr)} should not include ${fmt(v)}`); },
};
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]); return o; }
  return v;
}

// ------------------------------------------------------------------ fixture
function fixture(G) {
  Object.assign(G.Data.chars, {
    qa_hero: {
      name: 'QA勇者', title: 't', elem: 'water', weapon: 'sword', sprite: 'xinghe', portrait: 'xinghe',
      base: { hp: 100, mp: 20, atk: 10, def: 10, mag: 10, spd: 10, luk: 5 },
      growth: { hp: 10, mp: 2, atk: 1.5, def: 1, mag: 1, spd: 0.5, luk: 0.25 },
      learn: [{ lv: 1, skill: 'qa_s1' }, { lv: 3, skill: 'qa_s2' }, { lv: 7, skill: 'qa_s3' }, { lv: 0, skill: 'qa_story', story: true, flag: 'qa_flag' }],
      ultimate: 'qa_ult', equip: { weapon: 'qa_sword', armor: null, head: null, feet: null, acc: null },
    },
    qa_mage: {
      name: 'QA法師', elem: 'fire', weapon: 'flute',
      base: { hp: 80, mp: 40, atk: 6, def: 6, mag: 16, spd: 12, luk: 8 },
      growth: { hp: 8, mp: 4, atk: 1, def: 1, mag: 2, spd: 0.6, luk: 0.3 },
      learn: [{ lv: 1, skill: 'qa_heal' }], ultimate: 'qa_ult', equip: {},
    },
  });
  for (const id of ['qa_c3', 'qa_c4', 'qa_c5']) G.Data.chars[id] = Object.assign({}, G.Data.chars.qa_mage, { name: id });
  Object.assign(G.Data.skills, {
    qa_s1: { name: 's1', mp: 2, type: 'phys', target: 'enemy', power: 1.5, fx: 'slash', sfx: 'slash' },
    qa_s2: { name: 's2', mp: 4, type: 'mag', elem: 'water', target: 'enemies', power: 1.2, fx: 'water', sfx: 'water' },
    qa_s3: { name: 's3', mp: 6, type: 'buff', target: 'ally', power: 0, buffs: [{ stat: 'atk', amt: 0.3, turns: 3 }], fx: 'buff', sfx: 'buff' },
    qa_story: { name: 'story', mp: 1, type: 'phys', target: 'enemy', power: 2, fx: 'slash', sfx: 'slash' },
    qa_heal: { name: 'heal', mp: 5, type: 'heal', target: 'ally', power: 1.6, fx: 'heal', sfx: 'heal' },
    qa_ult: { name: 'ult', mp: 0, type: 'phys', target: 'enemies', power: 3, ultimate: true, fx: 'ultimate', sfx: 'ultimate' },
    qa_poison: { name: 'poison', mp: 0, type: 'debuff', target: 'enemy', power: 0, status: { id: 'poison', chance: 1, turns: 3 }, fx: 'poison', sfx: 'poison' },
  });
  Object.assign(G.Data.items, {
    qa_sword: { name: 'QA劍', type: 'weapon', price: 100, icon: 'sword', stats: { atk: 5 }, elem: 'fire' },
    qa_sword2: { name: 'QA劍二', type: 'weapon', price: 300, icon: 'sword', stats: { atk: 9, spd: 1 }, who: ['qa_hero'] },
    qa_armor: { name: 'QA甲', type: 'armor', price: 200, icon: 'armor', stats: { hp: 50, def: 3 }, resist: ['fire'] },
    qa_potion: { name: 'QA藥', type: 'use', price: 10, icon: 'potion', use: { target: 'ally', heal: 50 } },
    qa_ether: { name: 'QA氣', type: 'use', price: 40, icon: 'potion', use: { target: 'ally', mp: 30 } },
    qa_key: { name: 'QA鑰', type: 'key', price: 0, icon: 'key' },
    qa_mat: { name: 'QA材', type: 'material', price: 5, icon: 'gem' },
  });
  G.Data.quests.qa_q = { name: 'QA任務', desc: 'd', stages: ['a', 'b'] };
  return G;
}

// Content scripts (maps / story / i18n) are skipped: engine tests must not depend on chapters other agents
// are still writing (validate.js reports those). Load failures in core/engine/data abort the test.
const CONTENT = indexScripts().filter((f) => /^js\/(maps|story|i18n)\//.test(f));
function fresh(o = {}) {
  const env = load(Object.assign({ console: 'silent', skip: CONTENT }, o));
  const fatal = env.errors.filter((e) => /^js\/(core|engine|data)\//.test(e.file));
  if (fatal.length) throw new Error('game failed to load: ' + fatal.map((e) => e.file + ': ' + e.error.message).join('; '));
  fixture(env.G);
  env.G.state = env.G.newState();
  return env;
}
// deterministic Math.random inside the game context: values are consumed in order, then `rest`
function setRandom(env, seq, rest = 0.5) {
  const q = seq.slice();
  env.ctx.__rnd = () => (q.length ? q.shift() : rest);
  env.run('Math.random = () => globalThis.__rnd()');
}

// ------------------------------------------------------------------ G.U / timers
test('util: clamp/lerp/hash/seeded/cnNum/fmtTime', ({ G }) => {
  const U = G.U;
  A.eq(U.clamp(5, 0, 3), 3); A.eq(U.clamp(-1, 0, 3), 0); A.eq(U.lerp(0, 10, 0.25), 2.5);
  for (let i = 0; i < 200; i++) { const h = U.hash(i, i * 7, 3); A.ok(h >= 0 && h <= 1, 'hash in [0,1]'); A.eq(h, U.hash(i, i * 7, 3), 'hash deterministic'); }
  const a = U.seeded(42), b = U.seeded(42);
  for (let i = 0; i < 20; i++) A.eq(a(), b(), 'seeded deterministic');
  A.eq(U.cnNum(3), '三'); A.eq(U.cnNum(10), '十'); A.eq(U.cnNum(15), '十五'); A.eq(U.cnNum(42), '四十二');
  A.eq(U.fmtTime(3725), '1:02:05');
  A.eq(U.shade('#808080', 0), '#808080');
});
test('timers & tweens: game-time driven promises resolve', async ({ G }) => {
  let done = false;
  G.Timers.wait(0.5).then(() => { done = true; });
  G.Timers.update(0.3); await null; A.eq(done, false);
  G.Timers.update(0.3); await null; await null; A.eq(done, true);
  const o = { x: 0 };
  let fin = false;
  G.Tweens.to(o, { x: 10 }, 1, 'linear').then(() => { fin = true; });
  G.Tweens.update(0.5); A.near(o.x, 5);
  G.Tweens.update(0.6); await null; A.eq(o.x, 10); A.eq(fin, true);
});

// ------------------------------------------------------------------ party
test('party: create at lv1 — full HP/MP, base skills, no story skills, starting equipment', ({ G }) => {
  const m = G.Party.create('qa_hero', 1);
  A.eq(m.lv, 1); A.eq(m.exp, 0);
  const st = G.Party.stats('qa_hero');
  A.eq(st.mhp, 100); A.eq(st.atk, 15, 'atk = base 10 + sword 5');
  A.eq(m.hp, st.mhp); A.eq(m.mp, st.mmp);
  A.deep(m.skills, ['qa_s1']);
  A.eq(m.equip.weapon, 'qa_sword');
  A.eq(G.Inv.count('qa_sword'), 0, 'starting equipment is not also in the bag');
});
test('party: create at lv7 learns every non-story skill up to that level', ({ G }) => {
  const m = G.Party.create('qa_hero', 7);
  A.deep(m.skills.slice().sort(), ['qa_s1', 'qa_s2', 'qa_s3']);
  A.notIncludes(m.skills, 'qa_story');
  const st = G.Party.stats('qa_hero');
  A.eq(st.mhp, 160); A.eq(st.atk, Math.round(10 + 1.5 * 6) + 5); A.eq(st.luk, Math.round(5 + 0.25 * 6));
});
test('party: expToNext matches CONTRACTS round(20*lv^1.8+30)', ({ G }) => {
  for (let lv = 1; lv <= 50; lv++) A.eq(G.Party.expToNext(lv), Math.round(20 * Math.pow(lv, 1.8) + 30), 'lv ' + lv);
  A.eq(G.Party.expToNext(1), 50);
});
test('party: addExpTo — below threshold, exact threshold, multi-level, skill learning, HP grows', ({ G }) => {
  const m = G.Party.create('qa_hero', 1);
  const ups = [];
  G.Party.addExpTo(m, 49, ups);
  A.eq(m.lv, 1); A.eq(m.exp, 49); A.eq(ups.length, 0);
  G.Party.addExpTo(m, 1, ups);
  A.eq(m.lv, 2); A.eq(m.exp, 0); A.eq(ups.length, 1); A.eq(ups[0].from, 1); A.eq(ups[0].lv, 2);
  A.eq(m.hp, 110, 'HP increases by the max-HP gain');
  const need = G.Party.expToNext(2) + G.Party.expToNext(3) + G.Party.expToNext(4) + 7;
  const ups2 = [];
  G.Party.addExpTo(m, need, ups2);
  A.eq(m.lv, 5); A.eq(m.exp, 7);
  A.eq(ups2.length, 1, 'one record per member'); A.eq(ups2[0].from, 2); A.eq(ups2[0].lv, 5);
  A.includes(ups2[0].learned, 'qa_s2');
  A.ok(ups2[0].before && ups2[0].after && ups2[0].after.mhp > ups2[0].before.mhp);
});
test('party: level cap 50 (exp beyond the cap is kept but no further levels)', ({ G }) => {
  const m = G.Party.create('qa_hero', 1);
  G.Party.addExpTo(m, 1e9, []);
  A.eq(m.lv, 50);
  const st = G.Party.stats('qa_hero');
  A.ok(Number.isFinite(st.mhp) && st.mhp > 0);
});
test('party: gainExp — KO members get nothing, bench (5th+) gets half', ({ G }) => {
  for (const id of ['qa_hero', 'qa_mage', 'qa_c3', 'qa_c4', 'qa_c5']) G.Party.join(id, 1);
  G.state.members.qa_mage.hp = 0;
  G.Party.gainExp(40);
  A.eq(G.state.members.qa_hero.exp, 40);
  A.eq(G.state.members.qa_mage.exp, 0, 'KO member');
  A.eq(G.state.members.qa_c5.exp, 20, 'bench half');
});
test('party: join/leave/active/leader', ({ G }) => {
  G.Party.join('qa_hero', 3); G.Party.join('qa_hero', 9);
  A.deep(G.state.party, ['qa_hero'], 'no duplicates');
  A.eq(G.state.members.qa_hero.lv, 3, 're-join keeps existing member');
  for (const id of ['qa_mage', 'qa_c3', 'qa_c4', 'qa_c5']) G.Party.join(id);
  A.eq(G.Party.active().length, 4); A.eq(G.Party.leader(), 'qa_hero');
  G.Party.leave('qa_hero');
  A.eq(G.Party.leader(), 'qa_mage'); A.ok(G.state.members.qa_hero, 'member data kept after leaving');
});
test('party: healAll restores HP/MP and clears status', ({ G }) => {
  G.Party.join('qa_hero', 5);
  const m = G.state.members.qa_hero;
  m.hp = 1; m.mp = 0; m.status = { poison: 3 };
  G.Party.healAll();
  const st = G.Party.stats('qa_hero');
  A.eq(m.hp, st.mhp); A.eq(m.mp, st.mmp); A.deep(m.status, {});
});
test('party: learnSkill adds once', ({ G }) => {
  G.Party.join('qa_hero', 1);
  G.Party.learnSkill('qa_hero', 'qa_story'); G.Party.learnSkill('qa_hero', 'qa_story');
  A.eq(G.state.members.qa_hero.skills.filter((s) => s === 'qa_story').length, 1);
});
test('party: stats — equipment stats, weapon element override, resist list', ({ G }) => {
  G.Party.join('qa_hero', 1);
  const m = G.state.members.qa_hero;
  m.equip.armor = 'qa_armor';
  const st = G.Party.stats('qa_hero');
  A.eq(st.mhp, 150); A.eq(st.def, 13); A.eq(st.elem, 'fire', 'weapon elem overrides character elem');
  A.deep(st.resist, ['fire']);
  m.equip.weapon = null;
  A.eq(G.Party.stats('qa_hero').elem, 'water');
});
test('party: equip/unequip inventory bookkeeping + HP clamp', ({ G }) => {
  G.Party.join('qa_hero', 1);
  const m = G.state.members.qa_hero;
  G.Inv.add('qa_sword2', 1); G.Inv.add('qa_armor', 2);
  G.Party.equip('qa_hero', 'weapon', 'qa_sword2');
  A.eq(m.equip.weapon, 'qa_sword2'); A.eq(G.Inv.count('qa_sword2'), 0); A.eq(G.Inv.count('qa_sword'), 1, 'old weapon back to bag');
  A.ok(!('qa_sword2' in G.state.inv), 'zero-count entries are deleted');
  G.Party.equip('qa_hero', 'armor', 'qa_armor');
  A.eq(G.Inv.count('qa_armor'), 1);
  m.hp = G.Party.stats('qa_hero').mhp; // 150
  G.Party.equip('qa_hero', 'armor', null);
  A.eq(m.equip.armor, null); A.eq(G.Inv.count('qa_armor'), 2);
  A.eq(m.hp, 100, 'HP clamped to new max after removing +HP armor');
  for (const k in G.state.inv) A.ok(G.state.inv[k] > 0, 'no non-positive counts');
});
test('party: canEquip respects who / type', ({ G }) => {
  A.eq(G.Party.canEquip('qa_hero', 'qa_sword2'), true);
  A.eq(G.Party.canEquip('qa_mage', 'qa_sword2'), false);
  A.eq(G.Party.canEquip('qa_mage', 'qa_armor'), true);
  A.eq(G.Party.canEquip('qa_hero', 'qa_potion'), false);
  A.eq(G.Party.canEquip('qa_hero', 'no_such_item'), false);
});

// ------------------------------------------------------------------ inventory
test('inv: add/remove/count/has', ({ G }) => {
  G.Inv.add('qa_potion'); G.Inv.add('qa_potion', 4);
  A.eq(G.Inv.count('qa_potion'), 5); A.ok(G.Inv.has('qa_potion'));
  G.Inv.remove('qa_potion', 2); A.eq(G.Inv.count('qa_potion'), 3);
  G.Inv.remove('qa_potion', 10); A.eq(G.Inv.count('qa_potion'), 0); A.ok(!G.Inv.has('qa_potion'));
  A.ok(!('qa_potion' in G.state.inv));
});
test('inv: 99 cap for normal items, key items uncapped', ({ G }) => {
  G.Inv.add('qa_potion', 150); A.eq(G.Inv.count('qa_potion'), 99);
  G.Inv.add('qa_key', 120); A.eq(G.Inv.count('qa_key'), 120);
});
test('inv: unknown item ids warn and are hidden from list()', (env) => {
  const { G } = env;
  G.Inv.add('no_such_thing');
  A.ok(env.console._rec.warns.some((w) => String(w[0]).includes('unknown item')), 'console.warn emitted');
  A.notIncludes(G.Inv.list(), 'no_such_thing');
});
test('inv: list() sorted by type order then price, with filter', ({ G }) => {
  for (const id of ['qa_key', 'qa_mat', 'qa_armor', 'qa_sword2', 'qa_sword', 'qa_ether', 'qa_potion']) G.Inv.add(id);
  A.deep(G.Inv.list(), ['qa_potion', 'qa_ether', 'qa_sword', 'qa_sword2', 'qa_armor', 'qa_mat', 'qa_key']);
  A.deep(G.Inv.list((it) => it.type === 'weapon'), ['qa_sword', 'qa_sword2']);
});

// ------------------------------------------------------------------ flags / lanterns / quests
test('flags: set/get/has', ({ G }) => {
  A.eq(G.Flags.has('x'), false); G.Flags.set('x'); A.eq(G.Flags.get('x'), true);
  G.Flags.set('n', 3); A.eq(G.Flags.get('n'), 3); G.Flags.set('x', false); A.eq(G.Flags.has('x'), false);
});
test('lanterns: add once, count, has, records playtime', ({ G }) => {
  G.state.playtime = 77;
  A.eq(G.Lanterns.add('a', '燈一'), true); A.eq(G.Lanterns.add('a', '燈一'), false);
  G.Lanterns.add('b', '燈二');
  A.eq(G.Lanterns.count(), 2); A.ok(G.Lanterns.has('a')); A.ok(!G.Lanterns.has('c'));
  A.eq(G.state.lanterns.a.time, 77);
  A.ok(G.Lanterns.THRESHOLD > 0);
});
test('quests: start/stage/set/done/isDone/active', ({ G }) => {
  A.eq(G.Quests.stage('q1'), -1);
  G.Quests.start('q1'); A.eq(G.Quests.stage('q1'), 0);
  G.Quests.set('q1', 2); G.Quests.start('q1'); A.eq(G.Quests.stage('q1'), 2, 'start() does not reset');
  G.Quests.set('q2', 1);
  A.deep(G.Quests.active().sort(), ['q1', 'q2']);
  G.Quests.done('q1');
  A.ok(G.Quests.isDone('q1')); A.deep(G.Quests.active(), ['q2']);
  G.Quests.done('q3'); A.ok(G.Quests.isDone('q3'), 'done() on unstarted quest');
});
test('script API (no map): quest/give/take/gold/flag/join/learn', async ({ G }) => {
  const S = G.Script.S;
  S.quest('qa_q'); A.eq(G.Quests.stage('qa_q'), 0);
  S.quest('qa_q', 1); A.eq(G.Quests.stage('qa_q'), 1);
  S.quest('qa_q', 'done'); A.ok(G.Quests.isDone('qa_q'));
  await S.give('qa_potion', 3); A.eq(G.Inv.count('qa_potion'), 3);
  S.take('qa_potion'); A.eq(G.Inv.count('qa_potion'), 2); A.ok(S.hasItem('qa_potion', 2)); A.ok(!S.hasItem('qa_potion', 3));
  G.state.gold = 10; S.gold(-50); A.eq(G.state.gold, 0, 'gold never negative'); S.gold(25); A.eq(G.state.gold, 25);
  S.flag('f1'); A.ok(S.has('f1')); S.flag('f1', false); A.ok(!S.has('f1'));
  S.join('qa_hero', 2); A.includes(G.state.party, 'qa_hero');
  S.learn('qa_hero', 'qa_story'); A.includes(G.state.members.qa_hero.skills, 'qa_story');
});

// ------------------------------------------------------------------ save / settings
function richState(G) {
  G.Party.join('qa_hero', 6); G.Party.join('qa_mage', 4);
  G.Inv.add('qa_potion', 7); G.Inv.add('qa_key');
  Object.assign(G.state, { gold: 1234, map: 'sandbox', x: 7, y: 9, dir: 'left', chapter: 3, playtime: 4567.5, steps: 99, battles: 12 });
  G.state.flags.met_baizhi = true; G.state.vars.objective = '去平溪'; G.Lanterns.add('l1', '燈');
  G.Quests.set('qa_q', 1); G.state.opened['sandbox:c1'] = true; G.state.bestiary.sea_wisp = 3;
  G.state.members.qa_hero.hp = 33; G.state.members.qa_hero.gauge = 55;
}
test('save: write → read round trip restores the exact state', ({ G }) => {
  richState(G);
  const snap = JSON.parse(JSON.stringify(G.state));
  A.ok(G.Save.write(1, null));
  G.state.gold = 1; G.state.members.qa_hero.lv = 40; G.state.flags.extra = 1;
  A.ok(G.Save.read(1));
  A.deep(G.state, snap);
});
test('save: snapshot is by value (later state changes do not leak into the slot)', ({ G }) => {
  richState(G);
  G.Save.write(2);
  G.state.gold = 5;
  G.Save.read(2);
  A.eq(G.state.gold, 1234);
});
test('save: meta, exists, any, latest', (env) => {
  const { G } = env;
  A.eq(G.Save.any(), false); A.eq(G.Save.latest(), -1);
  richState(G);
  env.run('Date.now = () => 1000'); G.Save.write(3);
  env.run('Date.now = () => 5000'); G.Save.write(5);
  env.run('Date.now = () => 3000'); G.Save.write(0);
  A.ok(G.Save.exists(3) && G.Save.exists(5) && !G.Save.exists(4)); A.ok(G.Save.any());
  A.eq(G.Save.latest(), 5);
  const meta = G.Save.meta(3);
  A.eq(meta.chapter, 3); A.eq(meta.lanterns, 1); A.eq(meta.playtime, 4567.5);
  A.deep(meta.party, [{ id: 'qa_hero', lv: 6 }, { id: 'qa_mage', lv: 4 }]);
});
test('save: missing or corrupt slot → read() false and state untouched', ({ G, ctx }) => {
  richState(G);
  A.eq(G.Save.read(7), false); A.eq(G.state.gold, 1234);
  ctx.localStorage.setItem(G.Save.key(6), '{not json');
  A.eq(G.Save.read(6), false); A.eq(G.state.gold, 1234); A.eq(G.Save.meta(6), null);
});
test('save: old save without newer fields is upgraded with defaults', ({ G, ctx }) => {
  ctx.localStorage.setItem(G.Save.key(4), JSON.stringify({ state: { version: 1, map: 'sandbox', x: 1, y: 2, party: [], members: {}, inv: {}, gold: 9, flags: {} }, meta: {} }));
  A.ok(G.Save.read(4));
  A.eq(G.state.gold, 9); A.deep(G.state.bestiary, {}); A.deep(G.state.lanterns, {}); A.eq(G.state.steps, 0);
});
test('save: quota exceeded → retried without thumbnail; total failure → false', ({ G, ctx }) => {
  richState(G);
  const ls = ctx.localStorage, orig = ls.setItem;
  ls.setItem = (k, v) => { if (v.length > 2000) throw new Error('QuotaExceededError'); orig(k, v); };
  A.eq(G.Save.write(1, 'data:image/jpeg;base64,' + 'A'.repeat(5000)), true);
  A.eq(G.Save.meta(1).thumb, null);
  ls.setItem = () => { throw new Error('QuotaExceededError'); };
  A.eq(G.Save.write(2, null), false);
});
test('settings: defaults, persistence across reloads, corrupt storage falls back to defaults', () => {
  const storage = new Map();
  const a = fresh({ storage });
  A.eq(a.G.settings.textSpeed, 2); A.eq(a.G.settings.difficulty, 'normal');
  a.G.settings.battleSpeed = 3; a.G.settings.difficulty = 'hard'; a.G.settings.music = 0.3;
  a.G.saveSettings();
  const b = fresh({ storage });
  A.eq(b.G.settings.battleSpeed, 3); A.eq(b.G.settings.difficulty, 'hard'); A.eq(b.G.settings.music, 0.3);
  A.eq(b.G.Audio.settings.music, 0.3, 'audio bus volume initialised from settings');
  A.eq(b.G.settings.textSpeed, 2, 'unsaved keys keep defaults');
  storage.set('shorelight_settings', '{broken');
  const c = fresh({ storage });
  A.eq(c.G.settings.battleSpeed, 1);
});

// ------------------------------------------------------------------ play statistics (js/engine/playstats.js)
// a controllable real-time clock: tick(sec) advances it and runs one PlayStats.tick of that length
function playClock(G) {
  let now = 1000;
  G.PlayStats.clock = () => now;
  G.PlayStats.input(now);
  G.inGame = true;
  return {
    get now() { return now; },
    tick(sec, step = 0.5) { for (let t = 0; t < sec - 1e-9; t += step) { now += step; G.PlayStats.tick(step); } },
    input() { G.PlayStats.input(now); },
  };
}
test('playstats: time counts only after input confirms it; total() includes the pending part', ({ G }) => {
  const c = playClock(G);
  c.tick(10);
  A.near(G.state.playtime, 0, 1e-9, 'nothing committed before the next input');
  A.near(G.PlayStats.total(), 10, 1e-9, 'HUD total includes pending time');
  c.input();
  A.near(G.state.playtime, 10, 1e-9);
  A.near(G.state.stats.chapters['0'].time, 10, 1e-9);
  A.near(G.state.stats.chapters['0'].act.explore, 10, 1e-9, 'no scenes, no script → exploration');
});
test('playstats: AFK — over 3 min without input winds back to the last input and stops the clock', ({ G }) => {
  const c = playClock(G);
  c.tick(30); c.input();
  c.tick(200);                                            // walks away
  A.near(G.PlayStats.total(), 30, 1e-9, 'the 3 idle minutes are subtracted');
  A.eq(G.PlayStats.stopReason(), 'afk');
  c.tick(600);
  A.near(G.PlayStats.total(), 30, 1e-9, 'nothing counts while AFK');
  c.input(); c.tick(5); c.input();                        // back at the keyboard
  A.near(G.state.playtime, 35, 1e-9);
  A.eq(G.state.stats.afk.count, 1); A.near(G.state.stats.afk.lost, 180, 0.6);
  // a held key (walking) is input too
  c.tick(5); c.input(); G.Input._hold('right', true); c.tick(400); G.Input._hold('right', false);
  A.ok(G.PlayStats.total() > 435, 'holding a direction keeps the clock running');
});
test('playstats: hidden tab, unfocused window and pause stop the clock', ({ G }) => {
  const c = playClock(G);
  c.tick(10);
  G.PlayStats.setHidden(true);
  A.near(G.state.playtime, 10, 1e-9, 'hiding the tab commits what was played');
  c.tick(60);
  A.near(G.PlayStats.total(), 10, 1e-9, 'hidden: not counted');
  G.PlayStats.setHidden(false); c.tick(4);
  G.PlayStats.setBlurred(true); c.tick(60);
  A.near(G.PlayStats.total(), 14, 1e-9, 'blurred: not counted');
  G.PlayStats.setBlurred(false);
  G.PlayStats.paused = true; c.tick(30); G.PlayStats.paused = false;
  A.near(G.PlayStats.total(), 14, 1e-9, 'paused: not counted');
  G.PlayStats.tick(30); c.input();
  A.near(G.state.playtime, 14, 1e-9, 'a frame gap > 2 s (suspended tab / sleep) is never counted');
  G.inGame = false; c.tick(20); c.input();
  A.near(G.state.playtime, 14, 1e-9, 'title screen: not counted');
});
test('playstats: activity split follows the scene stack and the chapter', ({ G }) => {
  const c = playClock(G);
  G.state.chapter = 2;
  const push = (s) => G.Scenes.push(s);
  G.Scenes.replace(new G.BlankScene());
  c.tick(4);                                                            // explore
  const menu = push(new G.MenuScene()); c.tick(3); G.Scenes.pop(menu);  // menu
  const shop = push(new G.ShopScene([], () => {})); c.tick(2); G.Scenes.pop(shop);
  const mini = push({ update() {}, draw() {}, statKind: 'minigame' }); c.tick(5); G.Scenes.pop(mini);
  const dlg = push(new (class DialogScene { update() {} draw() {} })()); c.tick(6); G.Scenes.pop(dlg);
  const bs = push(Object.assign(Object.create(G.Battle.Scene.prototype), { update() {}, draw() {} })); c.tick(7); G.Scenes.pop(bs);
  G.state.chapter = 3; c.tick(1);
  c.input();
  const ch2 = G.state.stats.chapters['2'];
  A.deep(ch2.act, { explore: 4, menu: 5, minigame: 5, dialogue: 6, battle: 7 });
  A.near(ch2.time, 27, 1e-9); A.near(G.state.stats.chapters['3'].time, 1, 1e-9);
  A.near(G.state.playtime, 28, 1e-9, 'chapter times add up to playtime');
  const s = G.PlayStats.summary();
  A.near(s.total, 28, 1e-9); A.eq(s.chapters.length, 2); A.near(s.act.explore, 5, 1e-9);
});
test('playstats: battles, wins, game overs, boss attempts/time; retry keeps the statistics', ({ G }) => {
  G.Data.enemies.qa_boss = { name: 'QA頭目', boss: true, hp: 100, atk: 1, def: 1, mag: 1, spd: 1 };
  const c = playClock(G);
  G.state.chapter = 1;
  const mk = (troopId, troop, o) => Object.assign(Object.create(G.Battle.Scene.prototype), { troopId, troop, o: o || {}, update() {}, draw() {} });
  const fight = (sc, sec, r) => { G.PlayStats.battleStart(sc); G.Scenes.push(sc); c.tick(sec); G.PlayStats.battleEnd(sc, r); G.Scenes.pop(sc); c.input(); };
  fight(mk('qa_t', { enemies: ['qa_boss_x'] }), 3, 'win');
  fight(mk('qa_t', { enemies: ['qa_boss_x'] }), 2, 'flee');
  fight(mk('qa_boss_t', { enemies: ['qa_boss'], boss: true }), 10, 'lose');
  // 重新挑戰: the state reverts to before the fight, the statistics must not
  const keep = G.PlayStats.keep();
  G.state = Object.assign(G.newState(), { chapter: 1, playtime: 0 });
  G.PlayStats.retry('qa_boss_t', keep);
  fight(mk('qa_boss_t', { enemies: ['qa_boss'], boss: true }), 20, 'win');
  fight(mk('qa_story', { enemies: ['qa_boss_x'] }, { loseOk: true }), 1, 'lose');
  const ch = G.state.stats.chapters['1'];
  A.deep({ b: ch.battles, w: ch.wins, l: ch.losses, go: ch.gameOvers, f: ch.flees, r: ch.retries }, { b: 5, w: 2, l: 2, go: 1, f: 1, r: 1 });
  const b = G.state.stats.bosses.qa_boss_t;
  A.deep({ a: b.attempts, w: b.wins, l: b.losses, r: b.retries, fw: b.firstWin, e: b.enemy }, { a: 2, w: 1, l: 1, r: 1, fw: 2, e: 'qa_boss' });
  A.near(b.time, 30, 1e-9, 'boss time = time in both boss battles');
  A.near(G.state.playtime, 36, 1e-9);
  const rep = G.PlayStats.report();
  A.ok(rep.includes('QA頭目') && rep.includes('0:00:36') && rep.includes('"bosses"'), 'report has the boss, the total and raw JSON');
});
test('playstats: survive save/load; old saves migrate (playtime → legacy); a same-run older save keeps newer stats', (env) => {
  const { G, ctx } = env;
  const c = playClock(G);
  G.state.chapter = 4; c.tick(50); c.input();
  A.ok(G.Save.write(1, null));
  const saved = JSON.parse(JSON.stringify(G.state.stats));
  A.ok(G.Save.read(1));
  A.deep(G.state.stats, saved); A.near(G.state.playtime, 50, 1e-9);
  // play on without saving, then load the older save of the same playthrough → keep the newer statistics
  c.tick(20); c.input(); G.state.stats.chapters['4'].gameOvers = 2;
  A.ok(G.Save.read(1));
  A.near(G.state.playtime, 70, 1e-9); A.eq(G.state.stats.chapters['4'].gameOvers, 2);
  // a different playthrough's save is loaded as saved
  G.state = G.newState();
  A.ok(G.Save.read(1)); A.ok(G.state.playtime >= 50);
  // pre-stats save
  ctx.localStorage.setItem(G.Save.key(5), JSON.stringify({ state: { version: 1, map: 'sandbox', party: [], members: {}, inv: {}, flags: {}, playtime: 1234, chapter: 3 }, meta: {} }));
  A.ok(G.Save.read(5));
  A.eq(G.state.stats.legacy, 1234); A.deep(G.state.stats.chapters, {}); A.eq(G.state.playtime, 1234);
  c.tick(6); c.input();
  const s = G.PlayStats.summary();
  A.near(s.total, 1240, 1e-9); A.near(s.chapters[0].time, 6, 1e-9);
  // partial stats from a newer/older stats version are filled in
  G.state.stats = { runId: 'x', chapters: { 1: { time: 5 } }, bosses: { b: { attempts: 1 } } };
  G.migrateStats(G.state);
  A.eq(G.state.stats.chapters['1'].act.battle, 0); A.eq(G.state.stats.bosses.b.wins, 0); A.eq(G.state.stats.afk.count, 0);
});

// ------------------------------------------------------------------ battle formulas
function unit(G, o) {
  return Object.assign({ side: 'party', id: 'u', name: 'u', lv: 1, hp: 500, mhp: 500, mp: 50, mmp: 50, atk: 50, def: 20, mag: 40, spd: 10, luk: 0, elem: null, weak: [], resist: [], immune: [], st: {}, x: 0, y: 0, ox: 0, oy: 0, gauge: 0, dead: false, pose: 'idle', alpha: 1, flash: 0 }, o);
}
function scene(G, o = {}) {
  const sc = Object.create(G.Battle.Scene.prototype);
  Object.assign(sc, { diff: 'normal', pops: [], fx: [], party: [], enemies: [], troop: { enemies: [] }, o: {}, fleeTries: 0, t: 0, shakeT: 0 }, o);
  sc.wait = () => Promise.resolve();
  sc.tween = () => Promise.resolve();
  return sc;
}
const lastDmg = (tg, before) => before - tg.hp;
test('battle: elemMult implements the 克 cycle metal>wood>earth>water>fire>metal (×1.5 / ×0.7)', ({ G }) => {
  const cyc = ['metal', 'wood', 'earth', 'water', 'fire'];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const a = cyc[i], d = cyc[j];
    const exp = cyc[(i + 1) % 5] === d ? 1.5 : cyc[(j + 1) % 5] === a ? 0.7 : 1;
    A.eq(G.Battle.elemMult(a, d), exp, `${a}→${d}`);
  }
  A.eq(G.Battle.elemMult(null, 'fire'), 1); A.eq(G.Battle.elemMult('fire', null), 1);
});
test('battle: physical damage = power*atk*2*50/(50+def) (rand=1.0, no crit)', (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { atk: 60, luk: 0 }), tg = unit(G, { side: 'enemy', def: 30 });
  setRandom(env, [0.5, 0.5, 0.99]); // hit roll, damage rand (→1.0), crit roll
  sc.applyEffect(u, tg, { type: 'phys', power: 1.5, target: 'enemy' }, 1);
  A.eq(lastDmg(tg, 500), Math.round(1.5 * 60 * 2 * 50 / 80));
});
test('battle: magic damage = power*mag*2*50/(50+def*0.3+mag*0.7), always hits', (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { mag: 70 }), tg = unit(G, { side: 'enemy', def: 40, mag: 20 });
  setRandom(env, [0.5], 0.999);
  sc.applyEffect(u, tg, { type: 'mag', power: 2, target: 'enemy' }, 1);
  const r = 0.9 + 0.999 * 0.2; // rand(0.9,1.1) with Math.random = 0.999 after the first draw
  void r;
  const base = 2 * 70 * 2 * 50 / (50 + 40 * 0.3 + 20 * 0.7);
  const d = lastDmg(tg, 500);
  A.ok(d >= Math.round(base * 0.9) && d <= Math.round(base * 1.1), `magic dmg ${d} within ±10% of ${base.toFixed(1)}`);
});
test('battle: crit ×1.5 with chance 5% + luk/5 %', (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { atk: 50, luk: 50 }), tg = unit(G, { side: 'enemy', def: 50 });
  const base = 1 * 50 * 2 * 50 / 100; // 50
  setRandom(env, [0.5, 0.5, 0.149]); // crit chance = 0.05 + 50/500 = 0.15 → crit
  sc.applyEffect(u, tg, { type: 'phys', power: 1, target: 'enemy' }, 1);
  A.eq(lastDmg(tg, 500), Math.round(base * 1.5));
  const tg2 = unit(G, { side: 'enemy', def: 50 });
  setRandom(env, [0.5, 0.5, 0.151]);
  sc.applyEffect(u, tg2, { type: 'phys', power: 1, target: 'enemy' }, 1);
  A.eq(lastDmg(tg2, 500), base);
});
test('battle: hit chance 95% − (tgt spd − atk spd)/4 %, clamped to [60%, 99%]', (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { spd: 10 }), tg = unit(G, { side: 'enemy', spd: 50 }); // hit = 0.95 - 40/400 = 0.85
  setRandom(env, [0.86]);
  sc.applyEffect(u, tg, { type: 'phys', power: 1, target: 'enemy' }, 1);
  A.eq(tg.hp, 500, 'miss when roll > hit');
  setRandom(env, [0.84, 0.5, 0.99]);
  sc.applyEffect(u, tg, { type: 'phys', power: 1, target: 'enemy' }, 1);
  A.ok(tg.hp < 500, 'hit when roll < hit');
  const slow = unit(G, { spd: 0 }), fast = unit(G, { side: 'enemy', spd: 400 }); // raw hit -0.05 → clamp 0.6
  setRandom(env, [0.59, 0.5, 0.99]);
  sc.applyEffect(slow, fast, { type: 'phys', power: 1, target: 'enemy' }, 1);
  A.ok(fast.hp < 500, 'minimum 60% hit');
});
test('battle: guard halves, element weak/resist lists override the cycle, min damage 1', (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { atk: 50 });
  const run = (tg, s) => { setRandom(env, [0.5, 0.5, 0.99]); sc.applyEffect(u, tg, Object.assign({ type: 'phys', power: 1, target: 'enemy' }, s), 1); return lastDmg(tg, 500); };
  A.eq(run(unit(G, { side: 'enemy', def: 50 }), {}), 50);
  A.eq(run(unit(G, { side: 'enemy', def: 50, st: { guard: 1 } }), {}), 25, 'guard ×0.5');
  A.eq(run(unit(G, { side: 'enemy', def: 50, elem: 'wood' }), { elem: 'metal' }), 75, 'metal beats wood ×1.5');
  A.eq(run(unit(G, { side: 'enemy', def: 50, elem: 'fire' }), { elem: 'metal' }), 35, 'fire resists metal ×0.7');
  A.eq(run(unit(G, { side: 'enemy', def: 50, elem: 'fire', weak: ['metal'] }), { elem: 'metal' }), 75, 'weak list wins');
  A.eq(run(unit(G, { side: 'enemy', def: 50, elem: 'wood', resist: ['metal'] }), { elem: 'metal' }), 25, 'resist list ×0.5');
  const weak = unit(G, { atk: 0 });
  setRandom(env, [0.5, 0.5, 0.99]);
  const tg = unit(G, { side: 'enemy', def: 999 });
  sc.applyEffect(weak, tg, { type: 'phys', power: 1, target: 'enemy' }, 1);
  A.eq(lastDmg(tg, 500), 1, 'minimum 1 damage');
});
test('battle: difficulty scales enemy damage (easy ×0.6, hard ×1.25)', (env) => {
  const { G } = env;
  for (const [diff, k] of [['easy', 0.6], ['normal', 1], ['hard', 1.25]]) {
    const sc = scene(G, { diff });
    const e = unit(G, { side: 'enemy', atk: 50 }), p = unit(G, { side: 'party', def: 50 });
    setRandom(env, [0.5, 0.5, 0.99]);
    sc.applyEffect(e, p, { type: 'phys', power: 1, target: 'enemy' }, 1);
    A.eq(lastDmg(p, 500), Math.round(50 * k), diff);
  }
});
test('battle: heal = power*mag*1.2 + power*10, capped at max HP, not on KO', (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { mag: 40 }), tg = unit(G, { hp: 100, mhp: 500 });
  sc.applyEffect(u, tg, { type: 'heal', power: 1.6, target: 'ally' }, 1);
  A.eq(tg.hp, 100 + Math.round(1.6 * 40 * 1.2 + 16));
  const full = unit(G, { hp: 490, mhp: 500 });
  sc.applyEffect(u, full, { type: 'heal', power: 3, target: 'ally' }, 1);
  A.eq(full.hp, 500);
  const ko = unit(G, { hp: 0, dead: true });
  sc.applyEffect(u, ko, { type: 'heal', power: 3, target: 'ally' }, 1);
  A.eq(ko.hp, 0);
});
test('battle: revive restores power×maxHP; shield absorbs before HP', (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { mag: 40 }), ko = unit(G, { hp: 0, dead: true, mhp: 400 });
  sc.applyEffect(u, ko, { type: 'revive', power: 0.4, target: 'deadAlly' }, 1);
  A.eq(ko.dead, false); A.eq(ko.hp, 160);
  const tg = unit(G, { st: { shield: { turns: 3, amt: 30 } } });
  sc.damage(tg, 50, {});
  A.eq(tg.hp, 480); A.ok(!tg.st.shield, 'depleted shield removed');
  const tg2 = unit(G, { st: { shield: { turns: 3, amt: 100 } } });
  sc.damage(tg2, 50, {});
  A.eq(tg2.hp, 500); A.eq(tg2.st.shield.amt, 50);
});
test('battle: statuses — opposite buffs cancel, boss resists (×0.35), immune, unknown ids ignored', (env) => {
  const { G } = env;
  const sc = scene(G);
  const tg = unit(G, { side: 'enemy' });
  sc.addStatus(tg, 'atkUp', 3); sc.addStatus(tg, 'atkDown', 3);
  A.ok(!tg.st.atkUp && !tg.st.atkDown, 'atkUp + atkDown cancel');
  sc.addStatus(tg, 'no_such_status', 3); A.ok(!('no_such_status' in tg.st));
  const boss = unit(G, { side: 'enemy', boss: true });
  setRandom(env, [0.4]);
  sc.applyEffect(unit(G), boss, { type: 'debuff', target: 'enemy', status: { id: 'sleep', chance: 1, turns: 3 } }, 1);
  A.ok(!boss.st.sleep, 'boss: 0.4 ≥ 1×0.35 → resisted');
  const imm = unit(G, { side: 'enemy', immune: ['poison'] });
  setRandom(env, [0]);
  sc.applyEffect(unit(G), imm, { type: 'debuff', target: 'enemy', status: { id: 'poison', chance: 1, turns: 3 } }, 1);
  A.ok(!imm.st.poison, 'immune');
  const buffed = unit(G);
  sc.applyEffect(unit(G), buffed, { type: 'buff', target: 'ally', buffs: [{ stat: 'def', amt: 0.3, turns: 4 }] }, 1);
  A.eq(buffed.st.defUp, 4);
});
test('battle: turn start — poison 6% max HP, regen 8%, sleep skips, durations tick down', async (env) => {
  const { G } = env;
  const sc = scene(G);
  const u = unit(G, { hp: 500, mhp: 500, st: { poison: 2, atkUp: 1 } });
  let skip = await sc.startTurn(u);
  A.eq(u.hp, 470); A.eq(skip, false); A.eq(u.st.poison, 1); A.ok(!u.st.atkUp, 'expired buff removed');
  const r = unit(G, { hp: 100, mhp: 500, st: { regen: 3 } });
  await sc.startTurn(r); A.eq(r.hp, 140);
  const s = unit(G, { st: { sleep: 2 } });
  skip = await sc.startTurn(s); A.eq(skip, true);
  const g = unit(G, { st: { guard: 1 } });
  await sc.startTurn(g); A.ok(!g.st.guard, 'guard ends at own next turn');
});
test('battle: phase buffs from enemy data are applied (phases[].buffs {stat, amt})', async (env) => {
  const { G } = env;
  const sc = scene(G);
  const e = unit(G, { side: 'enemy', hp: 40, mhp: 100, phase: 1, phasesDone: {} });
  e.d = { phases: [{ at: 0.5, phase: 2, msg: 'x', buffs: [{ stat: 'mag', amt: 0.3, turns: 99 }] }] };
  sc.enemies = [e]; sc.say = () => {};
  await sc.checkPhases();
  A.eq(e.phase, 2);
  A.ok(e.st.magUp > 0, `expected magUp status after phase change, got st=${JSON.stringify(e.st)} (battle.js checkPhases passes b.stat ('mag') to addStatus instead of 'magUp')`);
});
test('battle: CTB — nextActor picks the smallest wait and advances everyone; timeline favours speed', ({ G }) => {
  const sc = scene(G);
  const a = unit(G, { id: 'a', spd: 40, wait: 30 }), b = unit(G, { id: 'b', spd: 10, wait: 50 });
  sc.party = [a]; sc.enemies = [b];
  A.eq(sc.nextActor(), a); A.eq(a.wait, 0); A.eq(b.wait, 20);
  const tl = sc.timeline(10);
  A.ok(tl.filter((u) => u === a).length > tl.filter((u) => u === b).length, 'faster unit acts more often');
});
test('battle: AI honours if:"hp<50" and ally_hurt conditions', (env) => {
  const { G } = env;
  const sc = scene(G);
  G.Data.skills.qa_rage = { name: 'rage', mp: 0, type: 'phys', target: 'enemy', power: 2, fx: 'slash' };
  const p = unit(G, { side: 'party' });
  sc.party = [p];
  const e = unit(G, { side: 'enemy', hp: 90, mhp: 100 });
  e.d = { skills: [{ id: 'qa_rage', w: 1, if: 'hp<50' }] };
  sc.enemies = [e];
  setRandom(env, [], 0.01);
  A.eq(sc.aiCommand(e).kind, 'attack', 'healthy → basic attack');
  e.hp = 40;
  A.eq(sc.aiCommand(e).skill, 'qa_rage', 'below 50% → rage');
});
test('battle: flee impossible vs bosses / flee:false; possible otherwise', async (env) => {
  const { G } = env;
  const p = unit(G, { spd: 20 }), e = unit(G, { side: 'enemy', spd: 20 });
  const sc1 = scene(G, { troop: { boss: true }, party: [p], enemies: [e] }); sc1.say = () => {};
  await sc1.tryFlee(p); A.eq(sc1.result, undefined);
  const sc2 = scene(G, { troop: { flee: false }, party: [p], enemies: [e] }); sc2.say = () => {};
  await sc2.tryFlee(p); A.eq(sc2.result, undefined);
  const sc3 = scene(G, { troop: {}, party: [p], enemies: [e] }); sc3.say = () => {};
  setRandom(env, [0.01]);
  await sc3.tryFlee(p); A.eq(sc3.result, 'flee');
});
test('battle: kill() of an enemy records the bestiary', ({ G }) => {
  const sc = scene(G);
  const e = unit(G, { side: 'enemy', id: 'sea_wisp' });
  sc.damage(e, 9999, {});
  A.ok(e.dead); A.eq(G.state.bestiary.sea_wisp, 1);
});

test('battle: auto-battle ultimate with revive:true also targets KO\'d allies (cmdForSkill)', ({ G }) => {
  const sc = scene(G);
  G.Data.skills.qa_rez_ult = { name: 'rez', mp: 0, type: 'heal', target: 'allies', power: 2, revive: true, ultimate: true, fx: 'heal' };
  const a = unit(G, { id: 'qa_hero' }), b = unit(G, { id: 'qa_mage', hp: 0, dead: true });
  sc.party = [a, b];
  const cmd = sc.cmdForSkill(a, 'qa_rez_ult', null);
  A.ok(cmd.targets.includes(b), 'KO\'d ally missing from targets — auto-battle ultimate never revives (battle.js cmdForSkill uses alive(\'party\') for target allies; manual CommandUI uses sc.party)');
});

// auto-battle AI (js/engine/autobattle.js): items follow 使用道具, boss vs ordinary fights, rare / key items never
function autoSetup(G, boss) {
  const sc = scene(G);
  const a = unit(G, { id: 'qa_hero', name: '甲', m: { skills: [] }, wait: 50 });
  const b = unit(G, { id: 'qa_mage', name: '乙', m: { skills: [] }, hp: 50, wait: 50 });
  const e = unit(G, { side: 'enemy', id: 'qa_e', name: '敵', boss, hp: 5000, mhp: 5000, wait: 10 });
  Object.assign(sc, { party: [a, b], enemies: [e], troop: { boss, enemies: ['qa_e'] } });
  G.state.chapter = 1;
  G.Data.items.qa_elixir = { name: 'QA丹', type: 'use', price: 900, icon: 'pill', use: { target: 'ally', heal: 400 } };
  G.Data.items.qa_gift = { name: 'QA禮', type: 'use', price: 0, icon: 'food', use: { target: 'ally', heal: 9999 } };
  return { sc, a, b };
}
test('autobattle: heal items — boss fights use the kit, ordinary fights only cheap ones, never gifts / with 使用道具 off', ({ G }) => {
  const AB = G.AutoBattle;
  A.ok(AB && AB.command, 'G.AutoBattle.command missing (js/engine/autobattle.js not loaded before battle.js?)');
  let { sc, a, b } = autoSetup(G, true);
  G.Inv.add('qa_elixir', 1);
  let c = AB.command(sc, a);
  A.eq(c.kind, 'item', 'boss fight: a member at 10% HP should get a heal item'); A.eq(c.item, 'qa_elixir'); A.ok(c.targets[0] === b);
  ({ sc, a, b } = autoSetup(G, false));
  c = AB.command(sc, a);
  A.ok(c.kind !== 'item', 'ordinary fight: a 900-gold item must not be used in chapter 1');
  G.Inv.add('qa_potion', 2);
  c = AB.command(sc, a);
  A.eq(c.kind, 'item'); A.eq(c.item, 'qa_potion', 'ordinary fight: the cheap item is fine in an emergency');
  G.settings.autoItems = false;
  try { c = AB.command(sc, a); A.ok(c.kind !== 'item', '使用道具 off: no items'); } finally { G.settings.autoItems = true; }
  G.Inv.remove('qa_potion', 2); G.Inv.remove('qa_elixir', 1); G.Inv.add('qa_gift', 1); G.Inv.add('qa_key', 1);
  ({ sc, a, b } = autoSetup(G, true));
  c = AB.command(sc, a);
  A.ok(c.kind !== 'item', 'story gifts (no shop price) and key items are never used');
});
test('autobattle: an on-screen warning that names a member makes only that member guard', ({ G }) => {
  const { sc, a, b } = autoSetup(G, true);
  b.hp = b.mhp;
  sc.acts = 5; sc.say('牠朝乙游過去了！（防禦可以撐住）', 2);
  A.eq(G.AutoBattle.command(sc, b).kind, 'defend', 'the named member guards');
  A.ok(G.AutoBattle.command(sc, a).kind !== 'defend', 'the others keep fighting');
  sc.acts = 9; // two actions later the warning is stale
  A.ok(G.AutoBattle.command(sc, b).kind !== 'defend');
});

// ------------------------------------------------------------------ dialogue / menus (logic level, no rendering)
function pump(G, scene, sec, dt = 0.05) { for (let t = 0; t < sec; t += dt) { G.Input.update(dt); G.Timers.update(dt); G.Tweens.update(dt); G.Scenes.update(dt); G.Input.endFrame(); } }
test('dialog: pressing OK advances a single-page line (no auto/skip)', async ({ G, ctx }) => {
  G.ctx = ctx.document.createElement('canvas').getContext('2d');
  G.settings.autoAdvance = false;
  let done = false;
  G.Dialog.say('baizhi', '短句。').then(() => { done = true; });
  pump(G, null, 1.0); // let the typewriter finish
  G.Input._press('ok'); pump(G, null, 0.05); await null; await null;
  A.ok(done, 'line was not dismissed by OK — dialog.js DialogScene.update consumes the press in the multi-page check (I.pressed(\'ok\') evaluated before `this.page < this.pages.length - 1`) so the second check never sees it');
});
test('dialog: choice returns the highlighted index; cancel only when allowed', async ({ G, ctx }) => {
  G.ctx = ctx.document.createElement('canvas').getContext('2d');
  let r = null;
  G.Dialog.choice(['a', 'b', 'c']).then((i) => { r = i; });
  pump(G, null, 0.1);
  G.Input._press('down'); pump(G, null, 0.05);
  G.Input._press('cancel'); pump(G, null, 0.05); await null;
  A.eq(r, null, 'cancel without opts.cancel must not resolve');
  G.Input._press('ok'); pump(G, null, 0.05); await null;
  A.eq(r, 1);
  let r2 = null;
  G.Dialog.choice(['x', 'y'], { cancel: 1 }).then((i) => { r2 = i; });
  pump(G, null, 0.1); G.Input._press('cancel'); pump(G, null, 0.05); await null;
  A.eq(r2, 1);
});
test('menu: save-slot thumbnail failure must not leave G.ctx pointing at the offscreen canvas', ({ G, ctx }) => {
  const main = ctx.document.createElement('canvas').getContext('2d');
  G.ctx = main;
  G.Party.join('qa_hero', 1);
  G.mapScene = { def: { id: 'x' }, map: { name: 'x' }, draw() { throw new Error('draw failed'); } };
  const sc = new G.SaveScene('save', () => {});
  G.Scenes.push(sc);
  G.Input._press('ok');
  sc.update(0.016);
  A.ok(G.Save.exists(1), 'save still written');
  A.ok(G.ctx === main, 'G.ctx was not restored after G.mapScene.draw threw (menu.js SaveScene: `G.ctx = bctx; G.mapScene.draw(bctx); G.ctx = saved;` needs try/finally) — every later frame renders into a detached canvas');
});
test('shop: buy/sell arithmetic and 99 cap (logic level)', ({ G }) => {
  G.state.gold = 1000;
  let closed = false;
  const sc = new G.ShopScene(['qa_potion', 'no_such_item', 'qa_sword'], () => { closed = true; });
  A.deep(sc.goods, ['qa_potion', 'qa_sword'], 'unknown goods filtered');
  G.Scenes.push(sc);
  const step = (k) => { G.Input._press(k); sc.update(0.016); G.Input.endFrame(); };
  step('ok'); // 購買
  step('ok'); // potion → qty
  step('right'); step('right'); step('ok'); // buy 3
  A.eq(G.Inv.count('qa_potion'), 3); A.eq(G.state.gold, 970);
  G.Inv.add('qa_potion', 95); // 98
  step('ok'); step('right'); step('right'); step('ok'); // max qty is 1 (99 cap)
  A.eq(G.Inv.count('qa_potion'), 99, 'qty must be capped so the bag never exceeds 99');
  step('cancel'); step('down'); step('ok'); // 販賣
  step('ok'); step('ok'); // sell 1 potion (sorted first)
  A.eq(G.Inv.count('qa_potion'), 98); A.eq(G.state.gold, 970 - 10 + 5);
  step('cancel'); step('down'); step('ok'); // 離開
  A.ok(closed, 'shop resolve called on 離開');
});

test('map/script: S.move resolves for the player, an NPC and a FOLLOWER (party member)', async ({ G, ctx }) => {
  G.ctx = ctx.document.createElement('canvas').getContext('2d');
  if (!G.Maps.get('qa_room')) {
    G.Maps.define('qa_room', { name: 'QA', start: [3, 3], tiles: Array(8).fill('.'.repeat(10)), npcs: [{ id: 'qa_npc', sprite: 'old_m', x: 6, y: 2 }] });
  }
  G.Party.join('qa_hero', 1); G.Party.join('qa_mage', 1);
  G.Mapx.goto('qa_room', 3, 3, 'down');
  const S = G.Script.S;
  const done = {};
  const step = async (sec) => { for (let t = 0; t < sec; t += 0.05) { G.Timers.update(0.05); G.Tweens.update(0.05); G.Scenes.update(0.05); await null; } };
  S.move('player', 'R').then(() => { done.player = true; });
  S.move('qa_npc', 'D').then(() => { done.npc = true; });
  await step(1.5);
  S.move('qa_mage', 'L').then(() => { done.follower = true; });
  await step(1.5);
  A.ok(done.player, 'player move did not resolve');
  A.ok(done.npc, 'npc move did not resolve');
  A.ok(done.follower, "follower move never resolved — map.js updateFollowers() ignores updateMove()'s arrival and never calls f.onArrive, so `await S.move/S.walkTo(<party member>)` soft-locks cutscenes");
});
test('map/script: a cutscene pan (S.camera) left in place is released to the player when the script ends; S.cameraHold keeps it', async ({ G, ctx }) => {
  G.ctx = ctx.document.createElement('canvas').getContext('2d');
  if (!G.Maps.get('qa_cam')) G.Maps.define('qa_cam', { name: 'QA', start: [3, 3], tiles: Array(30).fill('.'.repeat(40)), npcs: [{ id: 'qa_npc', sprite: 'old_m', x: 30, y: 20 }] });
  G.Party.join('qa_hero', 1);
  G.Mapx.goto('qa_cam', 3, 3, 'down');
  const step = async (sec) => { for (let t = 0; t < sec; t += 0.05) { G.Timers.update(0.05); G.Tweens.update(0.05); G.Scenes.update(0.05); await null; } };
  const ms = G.mapScene;
  // ch2 mist_grove 2-5 bug: the script pans to the stele and never calls S.cameraFollow() → the player walks out of frame
  G.Script.run(async (S) => { await S.camera(30, 20, 0.1); });
  await step(0.5);
  A.ok(ms.cam.tx == null && ms.cam.follow === 'player', 'camera still parked after the script ended (MapScene.update camRelease): ' + JSON.stringify(ms.cam) + ' busy=' + G.Script.busy());
  // a follow on an NPC left behind is released too
  G.Script.run(async (S) => { S.cameraFollow('qa_npc'); });
  await step(0.3);
  A.eq(ms.cam.follow, 'player');
  // explicit hold: the framing survives the end of the script, until cameraFollow()
  G.Script.run(async (S) => { await S.camera(30, 20, 0.1); S.cameraHold(); });
  await step(0.5);
  A.ok(ms.cam.tx != null, 'S.cameraHold() should keep the camera parked');
  G.Script.run(async (S) => { S.cameraFollow(); });
  await step(0.3);
  A.ok(ms.cam.tx == null && !ms.cam.hold, 'cameraFollow() clears the hold');
});

test('story: S.pointOfNoReturn names open side quests, counts unlit 心燈, asks only when something is open', async ({ G, ctx, run }) => {
  // content scripts are skipped by fresh(): load only the story module (the helper) and the shared UI dictionary
  for (const f of ['js/story/story.js', 'js/i18n/en_ui.js']) run(require('fs').readFileSync(path.join(ROOT, f), 'utf8'));
  G.ctx = ctx.document.createElement('canvas').getContext('2d');
  Object.assign(G.Data.quests, {
    qa_side: { name: 'QA支線', lantern: true, desc: 'd', stages: ['a'] },
    qa_chore: { name: 'QA小事', desc: 'd', stages: ['a'] },
    qa_never: { name: 'QA未接', lantern: true, desc: 'd', stages: ['a'] },
  });
  if (!G.Maps.get('qa_pnr')) G.Maps.define('qa_pnr', { name: 'QA', start: [3, 3], tiles: Array(8).fill('.'.repeat(10)) });
  G.Party.join('qa_hero', 1);
  G.Mapx.goto('qa_pnr', 3, 3, 'down');
  const S = G.Script.S;
  const step = async (sec) => { for (let t = 0; t < sec; t += 0.05) { G.Input.update(0.05); G.Timers.update(0.05); G.Tweens.update(0.05); G.Scenes.update(0.05); G.Input.endFrame(); await null; } };
  const said = [];
  const say = G.Dialog.say;
  G.Dialog.say = (w, t, o) => { said.push(t); return say.call(G.Dialog, w, t, o); };
  const o = { quests: ['qa_side', 'qa_chore', 'qa_never'], lanterns: { qa_l1: 'qa_side', qa_l2: 'qa_never', qa_l3: { quest: null, can: () => false } } };
  // nothing open (lanterns lit, quests never started): no prompt at all
  for (const id of ['qa_l1', 'qa_l2']) G.Lanterns.add(id, id);
  let r = null;
  S.pointOfNoReturn(o).then((v) => { r = v; });
  await step(0.2);
  A.eq(r, true); A.eq(said.length, 0, 'no warning when nothing is open');
  // qa_side open (named, 心燈), qa_chore done (skipped), qa_never never started + its lantern unlit (counted)
  delete G.state.lanterns.qa_l1; delete G.state.lanterns.qa_l2;
  G.Quests.set('qa_side', 0); G.Quests.done('qa_chore');
  const open = G.Story.openContent(o);
  A.deep(open.quests.map((q) => q.id), ['qa_side']);
  A.deep(open.lanterns, ['qa_l2'], 'qa_l1 belongs to an open quest (named), qa_l3 is out of reach (can() false)');
  G.Debug.setAutoplay(true);
  G.Debug.choices = [];
  r = null;
  S.pointOfNoReturn(o).then((v) => { r = v; });
  await step(3);
  A.eq(r, true, '「繼續」 is the first option, so autoplay carries on');
  A.eq(said[0], '前方將無法回頭。尚有未完成的事：QA支線（心燈）、這一帶還有 1 盞心燈未點亮。確定要繼續嗎？');
  // 「再等等」: false, a `once` event is re-armed and the player steps back
  const ev = { id: 'qa_gate', once: true };
  G.state.flags[G.mapScene.evKey(ev)] = true;
  G.Debug.choices = ['再等等'];
  r = null;
  S.pointOfNoReturn(Object.assign({ event: ev, back: 'D' }, o)).then((v) => { r = v; });
  await step(3);
  A.eq(r, false);
  A.eq(G.state.flags[G.mapScene.evKey(ev)], false, 'once event re-armed');
  A.eq(G.mapScene.player.y, 4, 'player stepped back');
  // English: the list is built from translated pieces and the frame is one template
  G.settings.lang = 'en';
  G.I18N.add({ QA支線: 'QA errand' });
  said.length = 0;
  G.Debug.choices = [];
  S.pointOfNoReturn(o);
  await step(3);
  A.eq(G.I18N.t(said[0]), "There's no turning back past this point. Still unfinished: QA errand (heart lantern); heart lanterns still unlit around here: 1. Go on anyway?");
  G.settings.lang = 'zh';
  G.Dialog.say = say;
  G.Debug.setAutoplay(false);
});

// ------------------------------------------------------------------ content-driven sanity
test('content: every character can be created at lv 1..50 with finite positive stats', ({ G }) => {
  const real = Object.keys(G.Data.chars).filter((id) => !id.startsWith('qa_'));
  A.ok(real.length > 0, 'no characters');
  for (const id of real) {
    G.state = G.newState();
    const m = G.Party.create(id, 1);
    for (let lv = 1; lv <= 50; lv++) {
      m.lv = lv;
      const st = G.Party.stats(id);
      for (const k of ['mhp', 'mmp', 'atk', 'def', 'mag', 'spd', 'luk']) A.ok(Number.isFinite(st[k]) && st[k] > 0, `${id} lv${lv} ${k}=${st[k]}`);
    }
    for (const s of m.skills) A.ok(G.Data.skills[s], `${id} learned unknown skill ${s}`);
  }
});
test('content: every enemy produces finite damage against a mid-level party member', (env) => {
  const { G } = env;
  const sc = scene(G);
  setRandom(env, [], 0.5);
  for (const [id, d] of Object.entries(G.Data.enemies || {})) {
    const e = unit(G, { side: 'enemy', atk: d.atk, mag: d.mag, def: d.def, spd: d.spd, luk: d.luk || 5, elem: d.elem });
    const p = unit(G, { side: 'party', def: 40, mag: 40, hp: 1e6, mhp: 1e6 });
    sc.applyEffect(e, p, { type: 'phys', power: 1, target: 'enemy' }, 1);
    A.ok(Number.isFinite(p.hp) && p.hp < 1e6, `${id}: phys damage not finite/positive`);
  }
});
test('validator self-test: fixture with known problems is flagged', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, 'validate.js'), '--json', '--extra', 'tools/test/fixtures/bad_map.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = e.stdout; }
  const res = JSON.parse(out);
  const fx = res.issues.filter((i) => i.file === 'tools/test/fixtures/bad_map.js' && i.sev === 'error').map((i) => i.msg).join('\n');
  for (const needle of ["tile char '@'", "'no_such_object'", "bgm 'no_such_song'", 'start 0,0 is on a solid cell', "'no_such_item'", "duplicate npc id 'n1'",
    "'no_such_portrait'", "troop 'no_such_troop'", "'no_such_map'", 'lands at 0,0 on a solid cell', "'no_such_quest'", "'no_such_troop2'",
    "'no_such_item2'", "'no_such_item3'", "'no_such_song2'", "'no_such_sfx'", "S.warp('qa_bad', 99, 99)", "'nobody_id'", "'grumpy'"]) {
    A.ok(fx.includes(needle), `validator did not report: ${needle}`);
  }
  A.ok(res.issues.some((i) => i.msg.includes("'qa_never_set_flag'")), 'flag read-but-never-set warning');
});

// ------------------------------------------------------------------ runner
(async function main() {
  const filters = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const list = filters.length ? tests.filter((t) => filters.some((f) => t.name.includes(f))) : tests;
  const tty = process.stdout.isTTY;
  const C = tty ? { g: '\x1b[32m', r: '\x1b[31m', d: '\x1b[2m', x: '\x1b[0m', b: '\x1b[1m' } : { g: '', r: '', d: '', x: '', b: '' };
  console.log(`${C.b}Shorelight unit tests${C.x} (${list.length})`);
  let pass = 0, fail = 0;
  const failures = [];
  for (const t of list) {
    const t0 = Date.now();
    try {
      const env = fresh();
      await Promise.race([Promise.resolve(t.fn(env)), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout (5s)')), 5000).unref())]);
      pass++;
      console.log(`  ${C.g}✓${C.x} ${t.name} ${C.d}${Date.now() - t0}ms${C.x}`);
    } catch (e) {
      fail++;
      failures.push({ name: t.name, e });
      console.log(`  ${C.r}✗ ${t.name}${C.x}\n      ${String(e && e.message).split('\n').join('\n      ')}`);
      if (!(e instanceof AssertionError) && e && e.stack) console.log(C.d + e.stack.split('\n').slice(1, 4).join('\n') + C.x);
    }
  }
  console.log(`\n${fail ? C.r : C.g}${C.b}unit: ${pass} passed, ${fail} failed${C.x}`);
  process.exit(fail ? 1 : 0);
})();

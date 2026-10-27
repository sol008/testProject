#!/usr/bin/env node
// Shorelight content-integrity validator.
//
//   node tools/test/validate.js            # report (errors + grouped warnings), exit 1 on errors
//   node tools/test/validate.js -v         # list every warning individually
//   node tools/test/validate.js --json     # machine-readable issues on stdout
//   node tools/test/validate.js --strict   # warnings also fail the run
//
// Loads the game into a Node vm (tools/test/load.js) so registries (tiles, objects, monsters, portraits,
// backdrops, music...) are the real ones, then cross-checks every data table, every map and every
// script call found in map/story sources. Missing modules (art still being written) degrade the
// corresponding checks to a single warning instead of thousands of errors.
'use strict';
const fs = require('fs');
const path = require('path');
const { load, indexScripts, ROOT } = require('./load');
const SC = require('./lib/srcscan');

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('-v') || argv.includes('--verbose');
const JSON_OUT = argv.includes('--json');
const STRICT = argv.includes('--strict');
// --extra <file> (repeatable): load an additional script after index.html's list and treat it as a
// map/story source (used by unit.js to self-test the validator against tools/test/fixtures/).
const EXTRA = argv.flatMap((a, i) => (a === '--extra' && argv[i + 1] ? [argv[i + 1]] : []));

// ------------------------------------------------------------------ issue collection
const issues = [];
function issue(sev, cat, msg, where = {}) {
  issues.push({ sev, cat, msg, file: where.file || '', line: where.line || 0, id: where.id || '', group: where.group || null });
}
const err = (cat, msg, w) => issue('error', cat, msg, w);
const warn = (cat, msg, w) => issue('warn', cat, msg, w);
const info = (cat, msg, w) => issue('info', cat, msg, w);

// ------------------------------------------------------------------ load game
const env = load({ console: 'silent', extra: EXTRA });
const G = env.G;
const indexList = indexScripts().concat(EXTRA);
// content still being written by other agents → warning; core/engine/data → error
const ART_OPTIONAL = /^js\/(gfx|maps|story|i18n)\//;
for (const f of env.missing) {
  if (ART_OPTIONAL.test(f)) warn('load', `script listed in index.html does not exist yet: ${f} (related checks are skipped)`, { file: 'index.html', line: SC.locate('index.html', f), id: f });
  else err('load', `script listed in index.html does not exist: ${f} (page will log ERR_FILE_NOT_FOUND and dependent features break)`, { file: 'index.html', line: SC.locate('index.html', f), id: f });
}
for (const e of env.errors) {
  const st = (e.error && e.error.stack) || String(e.error);
  const m = /\((?:.*\/)?([^/()]+\.js):(\d+):\d+\)|at (?:.*\/)?([^/\s]+\.js):(\d+)/.exec(st);
  err('load', `script threw while loading: ${(e.error && e.error.message) || e.error}`, { file: e.file, line: m ? +(m[2] || m[4]) : 0, id: e.file });
}
if (!G) { err('load', 'G was not created — util.js failed?'); finish(); }

// js files not referenced by index.html
(function unreferenced() {
  const dirs = ['js/core', 'js/gfx', 'js/data', 'js/engine', 'js/maps', 'js/story'];
  const listed = new Set(indexList);
  for (const d of dirs) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!f.endsWith('.js')) continue;
      const rel = d + '/' + f;
      if (!listed.has(rel)) warn('load', `${rel} exists but is not loaded by index.html`, { file: rel, id: rel });
    }
  }
})();

const D = G.Data || {};
const keys = (o) => Object.keys(o || {});
const chars = D.chars || {}, skills = D.skills || {}, items = D.items || {}, enemies = D.enemies || {}, troops = D.troops || {}, quests = D.quests || {};
const maps = (G.Maps && G.Maps.defs) || {};
for (const [k, v] of Object.entries({ chars, skills, items, enemies, troops })) if (!keys(v).length) warn('data', `G.Data.${k} is empty or missing`);

// ------------------------------------------------------------------ registries / known id sets
function setOf(a) { return a ? new Set(a) : null; }
const K = {};
K.chars = new Set(keys(chars));
K.skills = new Set(keys(skills));
K.items = new Set(keys(items));
K.enemies = new Set(keys(enemies));
K.troops = new Set(keys(troops));
K.quests = new Set(keys(quests));
K.maps = new Set(keys(maps));
K.monsters = new Set(keys(G.Monsters && G.Monsters.defs));
K.tiles = setOf(G.Tiles && keys(G.Tiles.defs).length ? keys(G.Tiles.defs) : null);
K.objects = setOf(G.Objects && keys(G.Objects.defs).length ? keys(G.Objects.defs) : null);
K.sprites = setOf(G.Sprites && G.Sprites.ids ? G.Sprites.ids() : null);
K.portraits = setOf(G.Portraits && G.Portraits.ids ? G.Portraits.ids() : null);
K.exprs = setOf(G.Portraits && G.Portraits.exprs ? G.Portraits.exprs() : ['normal', 'smile', 'laugh', 'sad', 'cry', 'angry', 'surprise', 'think', 'shy', 'hurt', 'serious', 'smug']);
K.backdrops = setOf(G.Backdrops && G.Backdrops.ids ? G.Backdrops.ids() : null);
K.music = setOf(G.Music && G.Music.ids ? G.Music.ids() : null);
K.places = setOf(G.World && G.World.PLACES ? keys(G.World.PLACES) : null);
K.status = new Set(keys(G.Battle && G.Battle.STATUS_INFO));
K.elems = new Set(['metal', 'wood', 'water', 'fire', 'earth']);
K.names = new Set(keys(G.Names));
const audioSrc = SC.read('js/core/audio.js');
const sfxBlock = SC.blockKeys(audioSrc, /const\s+SFX\s*=\s*\{/);
K.sfx = new Set(sfxBlock ? sfxBlock.keys.map((k) => k.key) : []);
const uiSrc = SC.read('js/gfx/ui.js');
const iconBlock = SC.blockKeys(uiSrc, /const\s+ICON_DRAW\s*=\s*\{/);
K.icons = new Set(iconBlock ? iconBlock.keys.map((k) => k.key) : []);
const fxSrc = SC.read('js/gfx/fx.js');
const presetBlock = SC.blockKeys(fxSrc, /const\s+PRESETS\s*=\s*\{/);
K.particles = new Set(presetBlock ? presetBlock.keys.map((k) => k.key) : []);
const battleSrc = SC.read('js/engine/battle.js');
const playFx = SC.blockText(battleSrc, /\bplayFx\s*\(\s*id/);
K.fx = new Set();
for (const m of playFx.matchAll(/case\s+'([\w]+)'/g)) K.fx.add(m[1]);
const elemColorBlock = SC.blockKeys(playFx, /const\s+elemColor\s*=\s*\{/);
if (elemColorBlock) for (const k of elemColorBlock.keys) K.fx.add(k.key);
K.fx.add('magic'); K.fx.add('combo');
const fxKnown = (id) => {
  if (!id) return false;
  const base = String(id).replace(/_big|_multi/, '');
  return K.fx.has(base) || base.startsWith('ultimate');
};
const mapSrc = SC.read('js/engine/map.js');
const emoteBlock = SC.blockKeys(mapSrc, /const\s+colors\s*=\s*\{\s*'!'/);
K.emotes = new Set(emoteBlock ? emoteBlock.keys.map((k) => k.key) : ['!', '?', '…', '♪', '💢', '♥', '💧', '✦']);
// Behavioural probe of enemy skill conditions: run the real aiCommand() in two opposite situations
// (A: full HP, first turn, phase 1, never used, allies healthy; B: 1% HP, turn 99, phase 9, already
// used, an ally hurt & one dead). A condition the engine understands is true in exactly one of them.
const condCache = {};
function condProbe(cond) {
  if (condCache[cond]) return condCache[cond];
  let res = 'ok';
  try {
    G.Data.skills.__qa_probe = { name: 'probe', mp: 0, type: 'phys', target: 'enemy', power: 1 };
    const sc = Object.create(G.Battle.Scene.prototype);
    const mk = (o) => Object.assign({ side: 'enemy', hp: 100, mhp: 100, st: {}, dead: false, phase: 1, turns: 0 }, o);
    const pick = (st) => {
      const e = mk(st.e); e.d = { skills: [{ id: '__qa_probe', w: 1, if: cond }] };
      if (st.used) e.usedOnce = { __qa_probe: true };
      sc.enemies = [e, mk(st.ally)].concat(st.dead ? [mk({ dead: true, hp: 0 })] : []);
      sc.party = [mk({ side: 'party' })];
      const r = sc.aiCommand(e);
      return r.kind === 'skill';
    };
    const a = pick({ e: { hp: 100, turns: 0, phase: 1 }, ally: { hp: 100 } });
    const b = pick({ e: { hp: 1, turns: 99, phase: 9 }, ally: { hp: 10 }, dead: true, used: true });
    if (a && b) res = 'always';
    else if (!a && !b) res = 'never';
  } catch (e) { res = 'error: ' + e.message; } finally { delete G.Data.skills.__qa_probe; }
  return (condCache[cond] = res);
}

const missingModule = {};
function needModule(name, set, file) {
  if (set) return true;
  if (!missingModule[name]) { missingModule[name] = true; warn('load', `${name} registry is empty (${file} missing or failed) — ${name} references are not checked`, { file }); }
  return false;
}

// Engine source used for "field is never read" checks.
const engineFiles = indexList.filter((f) => /^js\/engine\//.test(f) || f === 'js/core/state.js');
const engineSrc = engineFiles.map(SC.read).join('\n');
const engineReads = (field) => new RegExp(`(\\.|\\[\\s*['"])${field.replace(/\$/g, '\\$')}\\b|\\b${field}\\s*\\}\\s*=|\\{[^}]*\\b${field}\\b[^}]*\\}\\s*=`).test(engineSrc);

const F = { chars: 'js/data/characters.js', skills: 'js/data/skills.js', items: 'js/data/items.js', enemies: 'js/data/enemies.js', quests: 'js/data/quests.js' };
const at = (file, id, group) => ({ file, line: SC.locate(file, id), id, group });

// ------------------------------------------------------------------ duplicate keys in data literals
function dupKeys(file, re, what) {
  const src = SC.read(file);
  if (!src) return;
  const b = SC.blockKeys(src, re);
  if (!b) return;
  const seen = {};
  for (const k of b.keys) {
    if (seen[k.key]) err('data', `duplicate ${what} key '${k.key}' (also on line ${seen[k.key]}) — the later definition silently overwrites the earlier one`, { file, line: k.line, id: k.key });
    else seen[k.key] = k.line;
  }
}
dupKeys(F.chars, /G\.Data\.chars\s*=\s*\{/, 'character');
dupKeys(F.skills, /G\.Data\.skills\s*=\s*\{/, 'skill');
dupKeys(F.items, /G\.Data\.items\s*=\s*\{/, 'item');
// enemies.js uses helper calls: check repeated definition calls
(function dupCalls() {
  const src = SC.read(F.enemies);
  for (const [fn, what] of [['base', 'enemy'], ['def', 'enemy'], ['variant', 'enemy'], ['troop', 'troop'], ['boss', 'troop'], ['area', 'area']]) {
    const seen = {};
    for (const m of src.matchAll(new RegExp(`\\b${fn}\\(\\s*'([\\w]+)'`, 'g'))) {
      const k = what + ':' + m[1];
      const line = SC.lineOf(src, m.index);
      if (seen[k]) err('data', `${what} '${m[1]}' defined twice (lines ${seen[k]} and ${line})`, { file: F.enemies, line, id: m[1] });
      else seen[k] = line;
    }
  }
})();

// ------------------------------------------------------------------ characters
const SLOTS = ['weapon', 'armor', 'head', 'feet', 'acc'];
const STATS = ['hp', 'mp', 'atk', 'def', 'mag', 'spd', 'luk'];
for (const [id, c] of Object.entries(chars)) {
  const w = (g) => at(F.chars, id, g);
  for (const k of STATS) {
    if (typeof (c.base || {})[k] !== 'number') err('chars', `${id}: base.${k} missing / not a number`, w());
    if (typeof (c.growth || {})[k] !== 'number') err('chars', `${id}: growth.${k} missing / not a number (stats become NaN on level up)`, w());
  }
  for (const l of c.learn || []) {
    if (!K.skills.has(l.skill)) err('chars', `${id}: learns unknown skill '${l.skill}' (lv ${l.lv})`, { file: F.chars, line: SC.locate(F.chars, l.skill), id });
    if (typeof l.lv !== 'number') err('chars', `${id}: learn entry ${l.skill} has no numeric lv`, w());
  }
  if (!c.ultimate) warn('chars', `${id}: no ultimate skill`, w());
  else if (!K.skills.has(c.ultimate)) err('chars', `${id}: ultimate '${c.ultimate}' is not a skill`, w());
  else if (!skills[c.ultimate].ultimate) err('chars', `${id}: ultimate '${c.ultimate}' lacks ultimate:true — battle.js cmdForSkill() then treats it as a normal skill (charges MP, never resets the gauge → ultimate every turn)`, { file: F.skills, line: SC.locate(F.skills, c.ultimate), id: c.ultimate });
  for (const slot of SLOTS) {
    const it = c.equip && c.equip[slot];
    if (!it) continue;
    if (!K.items.has(it)) { err('chars', `${id}: starting equip.${slot} '${it}' is not an item`, w()); continue; }
    if (items[it].type !== slot) err('chars', `${id}: starting equip.${slot} '${it}' has type '${items[it].type}'`, w());
    if (items[it].who && !items[it].who.includes(id)) err('chars', `${id}: starting equip '${it}' is restricted to [${items[it].who}]`, w());
  }
  if (K.sprites && c.sprite && !K.sprites.has(c.sprite)) err('chars', `${id}: sprite '${c.sprite}' not registered`, w());
  if (K.portraits && (c.portrait || id) && !K.portraits.has(c.portrait || id)) warn('chars', `${id}: portrait '${c.portrait || id}' not registered`, w());
  if (!['sword', 'flute', 'spear', 'talisman'].includes(c.weapon)) warn('chars', `${id}: weapon kind '${c.weapon}' unknown`, w());
  if (c.elem && !K.elems.has(c.elem)) err('chars', `${id}: elem '${c.elem}' invalid`, w());
  if (!G.Names || !G.Names[id]) warn('chars', `${id}: missing from G.Names (dialog.js) — dialogue/menu will show the raw id`, w());
}

// ------------------------------------------------------------------ skills
const TYPES = ['phys', 'mag', 'heal', 'buff', 'debuff', 'revive', 'cure', 'special', 'passive'];
const TARGETS = ['enemy', 'enemies', 'ally', 'allies', 'self', 'deadAlly', 'random'];
const BUFF_STATS = ['atk', 'def', 'mag', 'spd'];
const learnedBy = {};
for (const [cid, c] of Object.entries(chars)) for (const l of c.learn || []) (learnedBy[l.skill] = learnedBy[l.skill] || []).push(cid);
const usedByEnemies = new Set();
for (const e of Object.values(enemies)) {
  for (const s of e.skills || []) usedByEnemies.add(s.id);
  for (const p of e.phases || []) for (const s of p.skills || []) usedByEnemies.add(s.id);
}
const specialSupported = /'special'/.test(battleSrc);
for (const [id, s] of Object.entries(skills)) {
  const w = (g) => at(F.skills, id, g);
  if (!s.name) err('skills', `${id}: no name`, w());
  if (!TYPES.includes(s.type)) err('skills', `${id}: type '${s.type}' invalid`, w());
  if (!TARGETS.includes(s.target)) err('skills', `${id}: target '${s.target}' invalid`, w());
  if (s.elem != null && !K.elems.has(s.elem)) warn('skills', `${id}: elem '${s.elem}' is not one of the five elements (no 克 multiplier applies)`, w('skill-elem'));
  if (typeof s.mp !== 'number') err('skills', `${id}: mp not a number`, w());
  if ((s.type === 'phys' || s.type === 'mag' || s.type === 'heal') && !(s.power > 0)) err('skills', `${id}: ${s.type} skill with power ${s.power}`, w());
  if (!s.fx) warn('skills', `${id}: no fx`, w('skill-nofx'));
  else if (!fxKnown(s.fx)) warn('skills', `fx '${s.fx}' is not handled by battle.js playFx (falls back to a generic burst)`, w('fx:' + s.fx));
  if (s.sfx && !K.sfx.has(s.sfx)) err('skills', `${id}: sfx '${s.sfx}' is not a key of SFX in js/core/audio.js (plays nothing)`, w());
  if (s.castSfx && !K.sfx.has(s.castSfx)) err('skills', `${id}: castSfx '${s.castSfx}' unknown`, w());
  if (s.status && !K.status.has(s.status.id)) err('skills', `${id}: status '${s.status.id}' unknown (addStatus ignores it)`, w());
  for (const c of s.cure || []) if (!K.status.has(c)) err('skills', `${id}: cure status '${c}' unknown`, w());
  for (const b of s.buffs || []) {
    if (b.stat && !BUFF_STATS.includes(b.stat)) err('skills', `${id}: buff stat '${b.stat}' invalid`, w());
    if (!b.stat && !K.status.has(b.id)) err('skills', `${id}: buff '${b.id}' unknown`, w());
  }
  for (const c of s.combo || []) if (!K.chars.has(c)) err('skills', `${id}: combo member '${c}' is not a character`, w());
  if (s.type === 'revive' && s.target !== 'deadAlly') warn('skills', `${id}: revive skill targets '${s.target}' (expected deadAlly)`, w());
  if (s.type === 'special' && !specialSupported) warn('skills', `type 'special' skills have no effect in battle.js applyEffect (turn is spent doing nothing)`, w('special-type'));
  if (!learnedBy[id] && !usedByEnemies.has(id) && !s.combo && !s.ultimate && !s.hidden && !id.startsWith('tz_')) {
    const isUlt = Object.values(chars).some((c) => c.ultimate === id);
    if (!isUlt) info('skills', `${id}: not learned by any character nor used by any enemy`, w('unused-skill'));
  }
}

// ------------------------------------------------------------------ items
const ITYPES = ['use', 'weapon', 'armor', 'head', 'feet', 'acc', 'key', 'material'];
const UTARGETS = ['ally', 'allies', 'enemy', 'enemies', 'deadAlly', 'self', 'none', 'field'];
for (const [id, it] of Object.entries(items)) {
  const w = (g) => at(F.items, id, g);
  if (!it.name) err('items', `${id}: no name`, w());
  if (!ITYPES.includes(it.type)) err('items', `${id}: type '${it.type}' invalid`, w());
  if (typeof it.price !== 'number') err('items', `${id}: price missing`, w());
  if (!it.icon) warn('items', `${id}: no icon (type default used)`, w('item-noicon'));
  else if (!K.icons.has(it.icon)) err('items', `${id}: icon '${it.icon}' not in ICON_DRAW (js/gfx/ui.js) — falls back to a generic icon`, w());
  for (const c of it.who || []) if (!K.chars.has(c)) err('items', `${id}: who includes '${c}' which is not a character`, w());
  if (SLOTS.includes(it.type) && !it.stats) warn('items', `${id}: equipment without stats`, w());
  if (it.stats) for (const k in it.stats) if (!STATS.includes(k)) err('items', `${id}: stats.${k} is not a stat (ignored by G.Party.stats)`, w());
  if (it.elem && !K.elems.has(it.elem)) err('items', `${id}: elem '${it.elem}' invalid`, w());
  for (const r of it.resist || []) if (!K.elems.has(r)) err('items', `${id}: resist '${r}' invalid`, w());
  for (const r of it.immune || []) if (!K.status.has(r)) err('items', `${id}: immune '${r}' invalid`, w());
  if (it.type === 'use') {
    const u = it.use;
    if (!u) { err('items', `${id}: type 'use' without use{}`, w()); continue; }
    if (u.target && !UTARGETS.includes(u.target)) err('items', `${id}: use.target '${u.target}' invalid`, w());
    for (const c of u.cure || []) if (!K.status.has(c)) err('items', `${id}: use.cure '${c}' unknown status`, w());
    if (u.status && !K.status.has(u.status.id || u.status)) err('items', `${id}: use.status '${u.status.id || u.status}' unknown`, w());
    if (u.elem && !K.elems.has(u.elem)) err('items', `${id}: use.elem '${u.elem}' invalid`, w());
    if (u.damage && !['enemy', 'enemies'].includes(u.target)) warn('items', `${id}: damage item targets '${u.target}'`, w());
    const effects = ['heal', 'healPct', 'mp', 'mpPct', 'revive', 'cure', 'status', 'buffs', 'damage', 'vision', 'fieldRun', 'gauge'];
    if (!effects.some((k) => u[k] != null)) warn('items', `${id}: use{} has no effect the engine understands (${Object.keys(u).join(',')})`, w());
    if (u.revive && u.target !== 'deadAlly') warn('items', `${id}: revive item targets '${u.target}' (expected deadAlly)`, w());
  }
}

// ------------------------------------------------------------------ enemies
const ENEMY_NUM = ['hp', 'atk', 'def', 'mag', 'spd'];
for (const [id, e] of Object.entries(enemies)) {
  const w = (g) => at(F.enemies, id, g);
  if (!e.name) err('enemies', `${id}: no name`, w());
  for (const k of ENEMY_NUM) if (typeof e[k] !== 'number' || !isFinite(e[k])) err('enemies', `${id}: ${k} = ${e[k]} (damage becomes NaN)`, w());
  if (e.art) { if (!K.monsters.has(e.art)) err('enemies', `${id}: art '${e.art}' is not a registered monster (G.Monsters.define)`, w()); }
  else if (e.sprite) { if (needModule('sprites', K.sprites, 'js/gfx/sprites.js') && !K.sprites.has(e.sprite)) err('enemies', `${id}: sprite '${e.sprite}' not registered`, w()); }
  else err('enemies', `${id}: neither art nor sprite`, w());
  if (e.elem && !K.elems.has(e.elem)) err('enemies', `${id}: elem '${e.elem}' invalid`, w());
  for (const x of [...(e.weak || []), ...(e.resist || [])]) if (!K.elems.has(x)) err('enemies', `${id}: weak/resist '${x}' invalid`, w());
  for (const x of e.immune || []) if (!K.status.has(x)) err('enemies', `${id}: immune '${x}' unknown status`, w());
  const checkSkills = (list, where) => {
    if (!list || !list.length) { warn('enemies', `${id}: ${where} skill list empty (always basic attack)`, w()); return; }
    for (const s of list) {
      if (s.id !== 'attack' && !K.skills.has(s.id)) err('enemies', `${id}: ${where} skill '${s.id}' does not exist`, { file: F.enemies, line: SC.locate(F.enemies, s.id), id });
      if (s.if) {
        const r = condProbe(String(s.if));
        if (r === 'always') warn('enemies', `skill condition if:'${s.if}' is not understood by battle.js aiCommand (treated as always true)`, w('cond:' + s.if));
        else if (r === 'never') warn('enemies', `skill condition if:'${s.if}' can never be true in battle.js aiCommand (skill never used)`, w('cond:' + s.if));
        else if (r !== 'ok') err('enemies', `${id}: probing condition '${s.if}' crashed aiCommand: ${r}`, w());
      }
      if (s.w != null && !(s.w > 0)) warn('enemies', `${id}: skill '${s.id}' weight ${s.w}`, w());
    }
  };
  checkSkills(e.skills, 'base');
  for (const [i, p] of (e.phases || []).entries()) {
    if (p.skills) checkSkills(p.skills, `phase[${i}]`);
    for (const sid of p.summon || []) if (!K.enemies.has(sid)) err('enemies', `${id}: phase summons unknown enemy '${sid}'`, w());
    if (typeof p.at !== 'number') err('enemies', `${id}: phase[${i}].at missing`, w());
    for (const l of p.lines || []) checkSpeaker(String(l[0] || ''), F.enemies, SC.locate(F.enemies, id));
  }
  for (const d of e.drops || []) {
    if (!K.items.has(d.item)) err('enemies', `${id}: drop '${d.item}' is not an item`, { file: F.enemies, line: SC.locate(F.enemies, d.item), id });
    if (!(d.rate > 0 && d.rate <= 1)) warn('enemies', `${id}: drop ${d.item} rate ${d.rate}`, w());
  }
  if (e.endAt != null && !(e.endAt > 0 && e.endAt < 1)) warn('enemies', `${id}: endAt ${e.endAt}`, w());
}

// ------------------------------------------------------------------ troops & areas
for (const [id, t] of Object.entries(troops)) {
  const w = (g) => at(F.enemies, id, g);
  if (!Array.isArray(t.enemies) || !t.enemies.length) { err('troops', `${id}: no enemies`, w()); continue; }
  for (const e of t.enemies) if (!K.enemies.has(e)) err('troops', `${id}: enemy '${e}' does not exist (battle throws "Unknown enemy")`, w());
  if (t.enemies.length > 6) err('troops', `${id}: ${t.enemies.length} enemies (battle.js has positions for at most 6)`, w());
  if (!t.bg) warn('troops', `${id}: no bg (defaults to 'forest')`, w());
  else if (needModule('backdrops', K.backdrops, 'js/gfx/backdrops.js') && !K.backdrops.has(t.bg)) err('troops', `${id}: bg '${t.bg}' is not a backdrop id`, w());
  if (t.bgm && needModule('music', K.music, 'js/core/music.js') && !K.music.has(t.bgm)) err('troops', `${id}: bgm '${t.bgm}' is not a music id`, w());
  const hasBoss = t.enemies.some((e) => enemies[e] && enemies[e].boss);
  if (hasBoss && !t.boss) warn('troops', `${id}: contains a boss enemy but troop.boss is not set (fleeing allowed, normal bgm)`, w());
}
for (const [id, a] of Object.entries(D.areas || {})) {
  for (const t of [...(a.troops || []), ...(a.bosses || [])]) if (!K.troops.has(t)) err('areas', `area ${id}: troop '${t}' does not exist`, at(F.enemies, id));
  for (const c of a.party || []) if (!K.chars.has(c) && c !== 'tuanzi') err('areas', `area ${id}: party member '${c}' is not a character`, at(F.enemies, id));
}

// ------------------------------------------------------------------ quests
for (const [id, q] of Object.entries(quests)) {
  if (!q.name) err('quests', `${id}: no name`, { id });
  if (q.stages && !Array.isArray(q.stages)) err('quests', `${id}: stages must be an array`, { id });
}

// ------------------------------------------------------------------ fields the engine never reads
function unreadFields(table, label, file, skip = []) {
  const counts = {};
  for (const [id, o] of Object.entries(table)) for (const k of Object.keys(o || {})) (counts[k] = counts[k] || []).push(id);
  for (const [k, ids] of Object.entries(counts)) {
    if (skip.includes(k) || engineReads(k)) continue;
    warn('engine-support', `${label} field '${k}' is used by ${ids.length} entr${ids.length > 1 ? 'ies' : 'y'} (${ids.slice(0, 4).join(', ')}${ids.length > 4 ? ', …' : ''}) but never read by the engine`, { file, line: SC.locate(file, k), id: k });
  }
}
unreadFields(skills, 'skill', F.skills, ['ch', 'comboLv']);
unreadFields(items, 'item', F.items, ['ch']);
unreadFields(Object.fromEntries(Object.entries(items).filter(([, v]) => v.use).map(([k, v]) => [k, v.use])), 'item.use', F.items);
unreadFields(enemies, 'enemy', F.enemies, ['desc']);
unreadFields(chars, 'character', F.chars, ['joinLv', 'desc']);

// Targeted engine-support checks (data features documented by data files vs. what battle.js does)
(function targeted() {
  const phaseSrc = SC.blockText(battleSrc, /async\s+checkPhases\s*\(/);
  const phaseFields = new Set([...phaseSrc.matchAll(/\bp\.(\w+)/g)].map((m) => m[1]));
  const applySrc = SC.blockText(battleSrc, /\bapplyEffect\s*\(\s*u\s*,/);
  for (const [id, e] of Object.entries(enemies)) {
    (e.phases || []).forEach((p, i) => {
      for (const k of Object.keys(p)) if (phaseSrc && !phaseFields.has(k)) warn('engine-support', `enemy.phases[] field '${k}' is never read by battle.js checkPhases`, { ...at(F.enemies, id), group: 'phase-field:' + k });
      for (const b of p.buffs || []) {
        // engine: this.addStatus(e, b.stat || b.id, ...) — a bare stat name is not a status id
        const sid = /addStatus\(e,\s*b\.stat\s*\|\|\s*b\.id/.test(phaseSrc) ? (b.stat || b.id) : (b.stat ? b.stat + (b.amt < 0 ? 'Down' : 'Up') : b.id);
        if (!K.status.has(sid)) err('engine-support', `${id}: phase[${i}] buff {stat:'${b.stat}'} becomes addStatus('${sid}') which is not a status id — the buff is silently dropped (battle.js checkPhases should map stat→'${b.stat}${b.amt < 0 ? 'Down' : 'Up'}')`, at(F.enemies, id));
      }
    });
  }
  const specials = new Set();
  for (const it of Object.values(items)) for (const s of [].concat(it.special || [])) specials.add(s);
  for (const s of specials) if (!new RegExp(`['"]${s}['"]`).test(engineSrc)) {
    const ids = Object.keys(items).filter((k) => [].concat(items[k].special || []).includes(s));
    warn('engine-support', `item special '${s}' (${ids.join(', ')}) is collected into unit.specials but never acted on by the engine`, { ...at(F.items, ids[0]), group: 'special:' + s });
  }
  for (const [id, s] of Object.entries(skills)) {
    if (s.type === 'heal' && s.revive) {
      // behavioural probe: does applyEffect raise a KO'd target, and does the auto-battle path target the dead?
      try {
        const sc = Object.create(G.Battle.Scene.prototype);
        Object.assign(sc, { pops: [], fx: [], diff: 'normal', enemies: [] });
        const mk = (o) => Object.assign({ side: 'party', id: 'xinghe', hp: 100, mhp: 100, mp: 99, mmp: 99, atk: 10, def: 10, mag: 20, spd: 10, luk: 0, st: {}, dead: false, x: 0, y: 0 }, o);
        const caster = mk({}), ko = mk({ hp: 0, dead: true });
        sc.applyEffect(caster, ko, s, 1);
        if (ko.dead) warn('engine-support', `${id}: heal skill with revive:true does not revive a KO'd target in battle.js applyEffect`, at(F.skills, id));
        sc.party = [caster, mk({ hp: 0, dead: true })];
        const cmd = sc.cmdForSkill(caster, id, null);
        if (!cmd.targets.some((t) => t.dead)) warn('engine-support', `${id}: revive:true skill — auto-battle/ultimate path cmdForSkill() targets only living allies (alive('party')), so KO'd members are not revived (manual CommandUI does include them; use defaultTargets())`, at(F.skills, id));
      } catch (e) { err('engine-support', `${id}: probing revive skill crashed: ${e.message}`, at(F.skills, id)); }
    }
    if (s.summon && !/\bs\.summon\b/.test(battleSrc)) warn('engine-support', `${id}: skill-level summon:[${s.summon}] is not implemented (only phases[].summon is)`, at(F.skills, id));
    if (s.ultimate && !/u\.m\.skills[\s\S]{0,200}\.ultimate/.test(SC.blockText(battleSrc, /\bbuildMain\s*\(\s*\)/))) {
      const owners = Object.entries(chars).filter(([, c]) => (c.learn || []).some((l) => l.skill === id) && c.ultimate !== id).map(([c]) => c);
      if (owners.length) warn('engine-support', `${id}: learned skill with ultimate:true is never offered in battle (CommandUI only offers chars.${owners[0]}.ultimate)`, at(F.skills, id));
    }
  }
})();

// ------------------------------------------------------------------ maps
const mapFiles = indexList.filter((f) => /^js\/(maps|story)\//.test(f) || EXTRA.includes(f));
const mapFileOf = {};
for (const f of mapFiles) for (const m of SC.read(f).matchAll(/G\.Maps\.define\(\s*['"]([\w]+)['"]/g)) {
  if (mapFileOf[m[1]]) err('maps', `map '${m[1]}' defined in both ${mapFileOf[m[1]]} and ${f} (last one wins)`, { file: f, line: SC.lineOf(SC.read(f), m.index), id: m[1] });
  else mapFileOf[m[1]] = f;
}
const mw = (mid, needle) => { const f = mapFileOf[mid] || ''; let line = 0; if (f && needle != null) { const src = SC.read(f); const base = src.search(new RegExp(`G\\.Maps\\.define\\(\\s*['"]${mid}['"]`)); const i = src.indexOf(String(needle), Math.max(0, base)); line = SC.lineOf(src, i >= 0 ? i : Math.max(0, base)); } else if (f) line = SC.locate(f, mid); return { file: f, line, id: mid }; };
const valOf = (v, st) => (typeof v === 'function' ? v(st) : v);

// Build collision grids with the real MapScene where possible
const grids = {};
function buildGrid(mid) {
  if (grids[mid] !== undefined) return grids[mid];
  const def = maps[mid];
  let g = null;
  const st0 = G.state;
  try {
    G.state = G.newState();
    if (G.Party && chars.xinghe) G.Party.join('xinghe', 5);
    const start = def.start || [0, 0];
    const ms = new G.MapScene(mid, start[0], start[1], 'down');
    g = { w: ms.w, h: ms.h, solid: ms.solid, terrain: ms.terrain, ms };
  } catch (e) {
    err('maps', `${mid}: new G.MapScene() threw: ${e.message}`, mw(mid));
    g = null;
  } finally { G.state = st0; }
  grids[mid] = g;
  return g;
}
const inB = (g, x, y) => g && Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < g.w && y < g.h;
const solidAt = (g, x, y) => g.solid[y * g.w + x] === 1;

// incoming entry points per map (for reachability)
const entries = {};
const addEntry = (mid, x, y, from) => { (entries[mid] = entries[mid] || []).push({ x, y, from }); };

for (const [mid, def] of Object.entries(maps)) {
  const st = G.newState();
  const where = (n) => mw(mid, n);
  if (!def.name) warn('maps', `${mid}: no name`, where());
  const rows = valOf(def.tiles, st);
  if (!Array.isArray(rows) || !rows.length) { err('maps', `${mid}: tiles missing`, where('tiles')); continue; }
  const width = Math.max(...rows.map((r) => r.length));
  rows.forEach((r, y) => { if (r.length !== width) warn('maps', `${mid}: tiles row ${y} has length ${r.length}, expected ${width} (padded with void)`, where(r.slice(0, 12) || 'tiles')); });
  const legend = Object.assign({}, G.Maps.LEGEND, def.legend || {});
  const badChars = {};
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (!(r[x] in legend)) (badChars[r[x]] = badChars[r[x]] || []).push(`${x},${y}`); });
  for (const [ch, cells] of Object.entries(badChars)) err('maps', `${mid}: tile char '${ch}' not in legend (silently becomes grass) at ${cells.slice(0, 5).join(' ')}${cells.length > 5 ? ` (+${cells.length - 5})` : ''}`, where());
  if (needModule('tiles', K.tiles, 'js/gfx/tiles.js')) {
    const used = new Set();
    rows.forEach((r) => { for (const ch of r) if (legend[ch]) used.add(legend[ch]); });
    for (const tid of used) if (!K.tiles.has(tid)) err('maps', `${mid}: terrain '${tid}' is not registered via G.Tiles.define (rendered as fallback, collision = void→solid)`, where());
  }
  if (def.deco) {
    const dl = Object.assign({}, G.Maps.DECO, def.decoLegend || {});
    def.deco.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === ' ' || ch === '.') continue;
        if (!dl[ch]) err('maps', `${mid}: deco char '${ch}' at ${x},${y} not in deco legend (ignored)`, where());
        else if (K.objects && !K.objects.has(dl[ch])) err('maps', `${mid}: deco '${ch}' → object type '${dl[ch]}' not registered`, where());
        if (y >= rows.length || x >= width) warn('maps', `${mid}: deco '${ch}' at ${x},${y} is outside the map`, where());
      }
    });
  }
  for (const o of valOf(def.objects, st) || []) {
    if (needModule('objects', K.objects, 'js/gfx/objects*.js') && !K.objects.has(o.t)) err('maps', `${mid}: object type '${o.t}' at ${o.x},${o.y} not registered (drawn as a brown box, fully solid)`, where(`'${o.t}'`));
    if (!(o.x >= 0 && o.y >= 0 && o.x < width && o.y < rows.length)) warn('maps', `${mid}: object '${o.t}' at ${o.x},${o.y} outside map`, where(`'${o.t}'`));
  }
  if (def.bgm != null && typeof def.bgm === 'string' && K.music && !K.music.has(def.bgm)) err('maps', `${mid}: bgm '${def.bgm}' is not a music id`, where('bgm'));
  for (const p of [].concat(valOf(def.particles, st) || [])) {
    const name = typeof p === 'string' ? p : p && p.type;
    if (name && K.particles.size && !K.particles.has(name)) warn('maps', `${mid}: particle preset '${name}' unknown (ignored)`, where(name));
  }
  if (def.place && K.places && !K.places.has(def.place)) err('maps', `${mid}: place '${def.place}' not in G.World.PLACES`, where(def.place));
  if (def.place && !K.places) err('maps', `${mid}: def.place set but G.World is not loaded — MapScene.enter() will throw`, where('place'));

  const g = buildGrid(mid);
  if (!g) continue;
  // start
  if (def.start) {
    const [sx, sy] = def.start;
    if (!inB(g, sx, sy)) err('maps', `${mid}: start ${sx},${sy} out of bounds`, where('start'));
    else if (solidAt(g, sx, sy)) err('maps', `${mid}: start ${sx},${sy} is on a solid cell (${g.terrain[sy * g.w + sx]})`, where('start'));
    else addEntry(mid, sx, sy, 'start');
  } else warn('maps', `${mid}: no start position (debug/new-game fall back to 5,5)`, where());
  // chests
  const chestIds = {};
  for (const c of def.chests || []) {
    const cid = c.id || `${c.x},${c.y}`;
    if (chestIds[cid]) err('maps', `${mid}: duplicate chest id '${cid}' (share the same opened flag)`, where(cid));
    chestIds[cid] = 1;
    if (c.item && !K.items.has(c.item)) err('maps', `${mid}: chest ${cid} item '${c.item}' does not exist`, where(c.item));
    if (!c.item && !c.gold && !c.run) warn('maps', `${mid}: chest ${cid} is empty`, where(cid));
    if (!inB(g, c.x, c.y)) err('maps', `${mid}: chest ${cid} at ${c.x},${c.y} out of bounds`, where(cid));
  }
  // npcs
  const npcIds = {};
  for (const n of def.npcs || []) {
    if (!n.id) err('maps', `${mid}: npc without id (scripts cannot address it)`, where(n.sprite));
    else if (npcIds[n.id]) err('maps', `${mid}: duplicate npc id '${n.id}'`, where(`'${n.id}'`));
    npcIds[n.id] = 1;
    const spr = n.sprite || n.id;
    if (needModule('sprites', K.sprites, 'js/gfx/sprites.js') && !K.sprites.has(spr)) err('maps', `${mid}: npc ${n.id} sprite '${spr}' not registered`, where(`'${n.id}'`));
    if (n.portrait && K.portraits && !K.portraits.has(n.portrait)) err('maps', `${mid}: npc ${n.id} portrait '${n.portrait}' not registered`, where(`'${n.id}'`));
    const pos = valOf(n.pos, st) || [n.x, n.y];
    if (!inB(g, pos[0], pos[1])) err('maps', `${mid}: npc ${n.id} at ${pos} out of bounds`, where(`'${n.id}'`));
    else if (solidAt(g, pos[0], pos[1])) warn('maps', `${mid}: npc ${n.id} stands on a solid cell ${pos}`, where(`'${n.id}'`));
    if (n.ghost && false) void 0;
  }
  // roaming enemies
  for (const e of def.enemies || []) {
    if (!K.troops.has(e.troop)) err('maps', `${mid}: roaming enemy ${e.id || ''} troop '${e.troop}' does not exist`, where(e.troop));
    if (e.art && !K.monsters.has(e.art)) err('maps', `${mid}: roaming enemy art '${e.art}' not a monster`, where(e.art));
    if (e.sprite && K.sprites && !K.sprites.has(e.sprite)) err('maps', `${mid}: roaming enemy sprite '${e.sprite}' not registered`, where(e.sprite));
    if (!inB(g, e.x, e.y)) err('maps', `${mid}: roaming enemy at ${e.x},${e.y} out of bounds`, where(e.troop));
    else if (solidAt(g, e.x, e.y)) warn('maps', `${mid}: roaming enemy ${e.id || e.troop} on solid cell ${e.x},${e.y}`, where(e.troop));
  }
  // events
  for (const ev of def.events || []) {
    if (!['action', 'touch', 'auto'].includes(ev.trigger)) err('maps', `${mid}: event ${ev.id || ''} trigger '${ev.trigger}' invalid`, where(ev.trigger));
    if (typeof ev.run !== 'function') err('maps', `${mid}: event ${ev.id || ev.x + ',' + ev.y} has no run()`, where(ev.id));
    if (ev.trigger !== 'auto' && !inB(g, ev.x, ev.y)) err('maps', `${mid}: event at ${ev.x},${ev.y} out of bounds`, where(ev.id));
    if (ev.trigger === 'auto' && !ev.once && !ev.if) warn('maps', `${mid}: auto event ${ev.id || ''} has neither once nor if — it re-runs every frame the script is idle`, where(ev.id || 'auto'));
  }
  for (const w of def.warps || []) {
    const lbl = `warp ${w.x},${w.y}→${w.to}`;
    if (!inB(g, w.x, w.y)) warn('maps', `${mid}: ${lbl} trigger cell out of bounds (unreachable — edge warps must be inside the map)`, where(`to: '${w.to}'`));
    if (!K.maps.has(w.to)) { err('maps', `${mid}: ${lbl} target map '${w.to}' does not exist`, where(`'${w.to}'`)); continue; }
    if (w.tdir && !['up', 'down', 'left', 'right'].includes(w.tdir)) err('maps', `${mid}: ${lbl} tdir '${w.tdir}' invalid`, where(`'${w.to}'`));
    const tg = buildGrid(w.to);
    if (!tg) continue;
    if (!inB(tg, w.tx, w.ty)) err('maps', `${mid}: ${lbl} lands at ${w.tx},${w.ty} — out of bounds of '${w.to}' (${tg.w}x${tg.h})`, where(`'${w.to}'`));
    else if (solidAt(tg, w.tx, w.ty)) err('maps', `${mid}: ${lbl} lands at ${w.tx},${w.ty} on a solid cell (${tg.terrain[w.ty * tg.w + w.tx]}) in '${w.to}' — player is stuck`, where(`'${w.to}'`));
    else addEntry(w.to, w.tx, w.ty, `${mid} warp`);
  }
}

// ------------------------------------------------------------------ script calls in map/story sources
const scriptFiles = mapFiles;
const flagSets = {}, flagReads = {};
function checkSpeaker(who, file, line) {
  if (!who) return;
  const [id, expr] = who.split(':');
  if (G.Names && G.Names[id]) {
    if (K.portraits && !K.portraits.has(id)) warn('dialog', `speaker '${id}' has a G.Names entry but no portrait`, { file, line, id, group: 'noportrait:' + id });
    if (expr && K.exprs && !K.exprs.has(expr)) err('dialog', `speaker '${who}': expression '${expr}' unknown (valid: ${[...K.exprs].join(',')})`, { file, line, id });
  } else if (/^[a-z][a-z0-9_]*$/.test(id) && id.length > 1) {
    err('dialog', `speaker id '${id}' is not in G.Names — the raw id is shown as the name and no portrait is drawn`, { file, line, id });
  } else if (expr) warn('dialog', `speaker '${who}' has an expression but '${id}' is not a portrait id`, { file, line, id });
}
const sc = (re) => SC.scanCalls(scriptFiles, re);
const L = (c) => ({ file: c.file, line: c.line });
const str = (v) => (typeof v === 'string' ? v : null);

for (const c of sc(/\bS\.quest\(/)) { const q = str(c.args[0]); if (q && !K.quests.has(q)) err('scripts', `S.quest('${q}') — quest not defined in G.Data.quests`, { ...L(c), id: q }); }
for (const c of sc(/\bG\.Quests\.\w+\(/)) { const q = str(c.args[0]); if (q && !K.quests.has(q)) err('scripts', `G.Quests.*('${q}') — quest not defined`, { ...L(c), id: q }); }
for (const c of sc(/\b(?:S\.battle|G\.Battle\.start)\(/)) { const t = str(c.args[0]); if (t && !K.troops.has(t)) err('scripts', `battle('${t}') — troop does not exist`, { ...L(c), id: t }); }
for (const c of [...sc(/\bS\.(?:give|take|hasItem)\(/), ...sc(/\bG\.Inv\.(?:add|remove|has|count)\(/)]) { const i = str(c.args[0]); if (i && !K.items.has(i)) err('scripts', `${c.raw.split('(')[0]}('${i}') — item does not exist`, { ...L(c), id: i }); }
for (const c of sc(/\bS\.shop\(/)) {
  const a = c.args[0];
  if (a && a.array) for (const i of a.array) if (!K.items.has(i)) err('scripts', `S.shop: item '${i}' does not exist (silently dropped from the shop)`, { ...L(c), id: i });
}
for (const c of sc(/\bS\.inn\(/)) if (typeof c.args[0] !== 'number' && c.args[0] !== null) warn('scripts', 'S.inn(price) without numeric price', L(c));
for (const c of sc(/\b(?:S\.say|G\.Dialog\.say)\(/)) { const w = str(c.args[0]); if (w) checkSpeaker(w, c.file, c.line); }
// generic literal scan: skip ids already reported (structurally) for the same file
const dupe = (f, id) => issues.some((i) => i.sev === 'error' && i.file === f && i.msg.includes(`'${id}'`));
for (const f of scriptFiles) {
  const src = SC.read(f);
  for (const m of src.matchAll(/\[\s*'([a-z_]+:[a-z]+)'\s*,\s*['"`]/g)) checkSpeaker(m[1], f, SC.lineOf(src, m.index));
  for (const m of src.matchAll(/\bwho\s*:\s*'([^']+)'/g)) checkSpeaker(m[1], f, SC.lineOf(src, m.index));
  for (const m of src.matchAll(/\bportrait\s*:\s*'([\w]+)'/g)) if (!dupe(f, m[1]) && K.portraits && !K.portraits.has(m[1])) err('scripts', `portrait '${m[1]}' not registered`, { file: f, line: SC.lineOf(src, m.index), id: m[1] });
  for (const m of src.matchAll(/\bsprite\s*:\s*'([\w]+)'/g)) if (!dupe(f, m[1]) && K.sprites && !K.sprites.has(m[1])) err('scripts', `sprite '${m[1]}' not registered`, { file: f, line: SC.lineOf(src, m.index), id: m[1] });
  for (const m of src.matchAll(/\bbgm(?:After)?\s*:\s*'([\w]+)'/g)) if (!dupe(f, m[1]) && K.music && !K.music.has(m[1])) err('scripts', `bgm '${m[1]}' is not a music id`, { file: f, line: SC.lineOf(src, m.index), id: m[1] });
  for (const m of src.matchAll(/\btroop\s*:\s*'([\w]+)'/g)) if (!dupe(f, m[1]) && !K.troops.has(m[1])) err('scripts', `troop '${m[1]}' does not exist`, { file: f, line: SC.lineOf(src, m.index), id: m[1] });
  for (const m of src.matchAll(/\bitem\s*:\s*'([\w]+)'/g)) if (!dupe(f, m[1]) && !K.items.has(m[1])) err('scripts', `item '${m[1]}' does not exist`, { file: f, line: SC.lineOf(src, m.index), id: m[1] });
  // flags
  for (const m of src.matchAll(/\bflags(?:\.([A-Za-z_$][\w$]*)|\[\s*['"]([^'"]+)['"]\s*\])(\s*=(?!=))?/g)) {
    const k = m[1] || m[2];
    const rec = { file: f, line: SC.lineOf(src, m.index) };
    if (m[3]) (flagSets[k] = flagSets[k] || []).push(rec); else (flagReads[k] = flagReads[k] || []).push(rec);
  }
}
for (const c of [...sc(/\bS\.flag\(/), ...sc(/\bG\.Flags\.set\(/)]) { const k = str(c.args[0]); if (k) (flagSets[k] = flagSets[k] || []).push(L(c)); }
// files that set flags with a computed key (e.g. tutorial(k) → flags[k] = true): every snake_case string
// literal in such a file may be a flag that gets set, so don't report those as never-set.
const maybeSet = new Set();
for (const f of scriptFiles) {
  const src = SC.read(f);
  if (/\bflags\[\s*[A-Za-z_$][\w$.]*\s*\]\s*=(?!=)|\bS\.flag\(\s*[A-Za-z_$`]|\bG\.Flags\.set\(\s*[A-Za-z_$`]/.test(src)) for (const m of src.matchAll(/['"]([a-z][a-z0-9_]{2,})['"]/g)) maybeSet.add(m[1]);
}
for (const c of [...sc(/\bS\.has\(/), ...sc(/\bG\.Flags\.(?:has|get)\(/)]) { const k = str(c.args[0]); if (k) (flagReads[k] = flagReads[k] || []).push(L(c)); }
// data-side flag reads (learn entries gated by story flags, combo req)
for (const [cid, c] of Object.entries(chars)) for (const l of c.learn || []) if (l.flag) (flagReads[l.flag] = flagReads[l.flag] || []).push({ file: F.chars, line: SC.locate(F.chars, l.flag), data: true });
for (const [sid, s] of Object.entries(skills)) if (s.req) (flagReads[s.req] = flagReads[s.req] || []).push({ file: F.skills, line: SC.locate(F.skills, sid), data: true });
for (const [k, reads] of Object.entries(flagReads)) {
  if (flagSets[k] || maybeSet.has(k) || /^(ev_|dead_)/.test(k)) continue;
  const r = reads[0];
  if (r.data) warn('flags', 'story flag referenced by data (learn.flag / skill.req) is never set by any script — the gated skill can never be learned/used', { file: r.file, line: r.line, id: k, group: 'flag-data' });
  else warn('flags', `flag '${k}' is read (${reads.length}×) but never set by any script`, { file: r.file, line: r.line, id: k });
}
const setOnly = Object.keys(flagSets).filter((k) => !flagReads[k]);
if (setOnly.length) info('flags', `${setOnly.length} flag(s) set but never read: ${setOnly.slice(0, 20).join(', ')}${setOnly.length > 20 ? ' …' : ''}`);

for (const c of [...sc(/\bG\.Music\.play\(/), ...sc(/\bS\.bgm\(/)]) { const id = str(c.args[0]); if (id && K.music && !K.music.has(id)) err('scripts', `music '${id}' does not exist`, { ...L(c), id }); }
for (const c of [...sc(/\bS\.sfx\(/), ...sc(/\bG\.Audio\.sfx\(/)]) { const id = str(c.args[0]); if (id && !K.sfx.has(id)) err('scripts', `sfx '${id}' does not exist`, { ...L(c), id }); }
for (const c of [...sc(/\bS\.join\(/), ...sc(/\bS\.leave\(/), ...sc(/\bG\.Party\.(?:join|leave|create)\(/)]) { const id = str(c.args[0]); if (id && !K.chars.has(id)) err('scripts', `party call with unknown character '${id}'`, { ...L(c), id }); }
for (const c of [...sc(/\bS\.learn\(/), ...sc(/\bG\.Party\.learnSkill\(/)]) {
  const [cid, sid] = c.args.map(str);
  if (cid && !K.chars.has(cid)) err('scripts', `learn: unknown character '${cid}'`, { ...L(c), id: cid });
  if (sid && !K.skills.has(sid)) err('scripts', `learn: unknown skill '${sid}'`, { ...L(c), id: sid });
}
for (const c of sc(/\bS\.emote\(/)) { const k = str(c.args[1]); if (k && !K.emotes.has(k)) warn('scripts', `emote '${k}' has no colour in map.js drawEmote (drawn grey)`, { ...L(c), id: k }); }
for (const c of sc(/\bS\.particles\(/)) { const k = str(c.args[0]); if (k && K.particles.size && !K.particles.has(k)) warn('scripts', `particle preset '${k}' unknown`, { ...L(c), id: k }); }
for (const c of [...sc(/\bS\.travel\(/), ...sc(/\bS\.visit\(/), ...sc(/\bG\.World\.(?:travel|visit)\(/)]) {
  for (const p of c.args.slice(0, /visit/.test(c.raw) ? 1 : 2).map(str)) {
    if (!p) continue;
    if (!K.places) err('scripts', `travel/visit('${p}') but G.World is not loaded`, { ...L(c), id: p });
    else if (!K.places.has(p)) err('scripts', `travel/visit: place '${p}' not in G.World.PLACES (TravelScene would crash)`, { ...L(c), id: p });
  }
}
for (const c of sc(/\bS\.warp\(/)) {
  const [mid, x, y] = c.args;
  if (typeof mid !== 'string') continue;
  if (!K.maps.has(mid)) { err('scripts', `S.warp('${mid}') — map does not exist`, { ...L(c), id: mid }); continue; }
  if (typeof x !== 'number' || typeof y !== 'number') continue;
  const g = buildGrid(mid);
  if (!g) continue;
  if (!inB(g, x, y)) err('scripts', `S.warp('${mid}', ${x}, ${y}) out of bounds (${g.w}x${g.h})`, { ...L(c), id: mid });
  else if (solidAt(g, x, y)) err('scripts', `S.warp('${mid}', ${x}, ${y}) lands on a solid cell (${g.terrain[y * g.w + x]})`, { ...L(c), id: mid });
  else addEntry(mid, x, y, `${c.file}:${c.line}`);
}
for (const c of sc(/\bS\.travel\(/)) void c;
const lanternIds = {};
for (const c of sc(/\bS\.lantern\(/)) {
  const id = str(c.args[0]);
  if (!id) continue;
  if (lanternIds[id] && lanternIds[id].name !== str(c.args[1])) warn('scripts', `lantern '${id}' granted with different names ('${lanternIds[id].name}' vs '${str(c.args[1])}')`, { ...L(c), id });
  lanternIds[id] = lanternIds[id] || { name: str(c.args[1]), ...L(c) };
}
const nLanterns = Object.keys(lanternIds).filter((k) => !/test/.test(k)).length;
if (G.Lanterns && nLanterns < G.Lanterns.THRESHOLD) info('scripts', `${nLanterns} distinct heart lanterns found in scripts (true-ending threshold is ${G.Lanterns.THRESHOLD})`);

// ------------------------------------------------------------------ reachability (approximate)
for (const [mid, def] of Object.entries(maps)) {
  const g = grids[mid];
  if (!g) continue;
  const ent = entries[mid] || [];
  if (!ent.length) { if (mid !== 'sandbox') warn('reach', `${mid}: no entry point (no start, no warp/S.warp leads here)`, mw(mid)); continue; }
  const seen = new Uint8Array(g.w * g.h);
  const q = [];
  for (const e of ent) { const i = e.y * g.w + e.x; if (!seen[i]) { seen[i] = 1; q.push(i); } }
  while (q.length) {
    const i = q.pop();
    const x = i % g.w, y = (i / g.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const j = ny * g.w + nx;
      if (seen[j] || g.solid[j]) continue;
      seen[j] = 1; q.push(j);
    }
  }
  const reach = (x, y) => inB(g, x, y) && seen[y * g.w + x] === 1;
  // interaction happens from an orthogonally adjacent cell (NPCs also across a 1-cell counter)
  const adjReach = (x, y, w = 1, h = 1, far = false) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (reach(xx + dx, yy + dy) || (far && reach(xx + 2 * dx, yy + 2 * dy))) return true;
    }
    return false;
  };
  for (const w of def.warps || []) if (inB(g, w.x, w.y) && !w.if && !reach(w.x, w.y)) warn('reach', `${mid}: warp at ${w.x},${w.y} → ${w.to} is not reachable from any entry point`, mw(mid, `'${w.to}'`));
  for (const c of def.chests || []) if (inB(g, c.x, c.y) && !c.spirit && !c.if && !adjReach(c.x, c.y)) warn('reach', `${mid}: chest ${c.id || c.x + ',' + c.y} cannot be reached`, mw(mid, c.id));
  for (const n of def.npcs || []) {
    if (!n.talk || n.if || n.spirit) continue;
    const p = valOf(n.pos, G.newState()) || [n.x, n.y];
    if (inB(g, p[0], p[1]) && !adjReach(p[0], p[1], 1, 1, true)) warn('reach', `${mid}: npc ${n.id} cannot be reached to talk to`, mw(mid, `'${n.id}'`));
  }
  for (const ev of def.events || []) {
    if (ev.trigger === 'auto' || ev.if || ev.spirit) continue;
    let ok = false;
    for (let yy = ev.y; yy < ev.y + (ev.h || 1); yy++) for (let xx = ev.x; xx < ev.x + (ev.w || 1); xx++) if (ev.trigger === 'touch' || ev.self ? reach(xx, yy) : adjReach(xx, yy)) ok = true;
    if (!ok) warn('reach', `${mid}: ${ev.trigger} event ${ev.id || ev.x + ',' + ev.y} cannot be reached (initial state; ignores scripted terrain changes)`, mw(mid, ev.id));
  }
}

finish();

// ------------------------------------------------------------------ output
function finish() {
  const errors = issues.filter((i) => i.sev === 'error');
  const warns = issues.filter((i) => i.sev === 'warn');
  const infos = issues.filter((i) => i.sev === 'info');
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ errors: errors.length, warnings: warns.length, issues }, null, 1) + '\n');
  } else {
    const C = process.stdout.isTTY ? { r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' } : { r: '', y: '', d: '', b: '', x: '' };
    const loc = (i) => (i.file ? `${i.file}${i.line ? ':' + i.line : ''}` : '');
    console.log(`${C.b}Shorelight content validator${C.x}  (${env.loaded.length} scripts loaded; ${keys(chars).length} chars, ${keys(skills).length} skills, ${keys(items).length} items, ${keys(enemies).length} enemies, ${keys(troops).length} troops, ${keys(quests).length} quests, ${keys(maps).length} maps)`);
    const cats = [...new Set(issues.map((i) => i.cat))];
    for (const cat of cats) {
      const list = issues.filter((i) => i.cat === cat && i.sev !== 'info');
      if (!list.length) continue;
      const ne = list.filter((i) => i.sev === 'error').length;
      console.log(`\n${C.b}[${cat}]${C.x} ${ne} error(s), ${list.length - ne} warning(s)`);
      for (const i of list.filter((x) => x.sev === 'error')) console.log(`  ${C.r}ERROR${C.x} ${loc(i)}  ${i.msg}`);
      const grouped = {};
      for (const i of list.filter((x) => x.sev === 'warn')) {
        const gk = i.group || i.msg;
        (grouped[gk] = grouped[gk] || []).push(i);
      }
      for (const [, g] of Object.entries(grouped)) {
        if (g.length === 1 || VERBOSE) for (const i of g) console.log(`  ${C.y}WARN ${C.x} ${loc(i)}  ${i.msg}${g.length > 1 && i.id ? ` [${i.id}]` : ''}`);
        else {
          const ids = [...new Set(g.map((i) => i.id).filter(Boolean))];
          console.log(`  ${C.y}WARN ${C.x} ${loc(g[0])}  ${g[0].msg}  ${C.d}(×${g.length}: ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? ', …' : ''})${C.x}`);
        }
      }
    }
    if (infos.length) {
      console.log(`\n${C.b}[info]${C.x}`);
      const seenG = {};
      for (const i of infos) {
        if (i.group) { seenG[i.group] = (seenG[i.group] || []).concat(i.id); continue; }
        console.log(`  ${C.d}${loc(i)} ${i.msg}${C.x}`);
      }
      for (const [g, ids] of Object.entries(seenG)) console.log(`  ${C.d}${g}: ${ids.length} (${ids.slice(0, 10).join(', ')}${ids.length > 10 ? ', …' : ''})${C.x}`);
    }
    console.log(`\n${errors.length ? C.r : ''}${C.b}validate: ${errors.length} error(s), ${warns.length} warning(s)${C.x}`);
  }
  process.exit(errors.length || (STRICT && warns.length) ? 1 : 0);
}

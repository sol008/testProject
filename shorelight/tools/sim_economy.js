#!/usr/bin/env node
// 彼岸燈 — progression & economy model: the level and gold a player really has at each boss, for three play styles.
//
//   node tools/sim_economy.js                 per-chapter table (normal / minimal / thorough) + per-boss check
//   node tools/sim_economy.js --maps          per-map critical path, roaming enemies met, chests on the way
//   node tools/sim_economy.js --json out.json the whole model as JSON (per boss: level, gear worn, kit — the input of
//                                             `node tools/sim_story.js --model normal|minimal|thorough`)
//   node tools/sim_economy.js --diff easy     exp ×1.2 (the playthrough tests / full_chain play on easy)
//   node tools/sim_economy.js --schedule      the normal player's encounter exp / gold per chapter, split at the bosses
//                                             (what tools/test/full_chain.js --encounters applies)
//
// The data is the game's own (loaded like tools/sim_story.js: index.html order in a Node vm). What is modelled:
//
//   Story battles   the main-path battles of each chapter, in story order (STORY below: troops, the boss fights of
//                   docs/BALANCE.md marked with their sim id); exp / gold = the troop's enemies (G.Data.enemies), none
//                   for a fight that ends by script without `rewards: true`.
//   Encounters      roaming (symbol) enemies, G.Maps.defs[id].enemies. For every main-path map the critical path is
//                   the union of the shortest walks (the real collision grid, G.MapScene.solid; a gate that is closed
//                   now costs 25 steps) from the arrival warp to every other warp and to every story / puzzle spot
//                   (touch and action events, inspectable objects). An enemy is MET when its home is within its chase
//                   range (default 4) + wander radius (≤ 2) of that path — it walks to the player.
//                     normal   fights every enemy met, × 1.3 for backtracking (a typical player walks ~1.3 × the
//                              critical-path steps; respawning enemies are met again on re-entry; respawn:false once),
//                              plus the maps' step encounters (暗雷: rate × path cells on that terrain × 1.3) and half
//                              of ch10's optional sea fights; ch11's black-tide boarding at its rate.
//                     minimal  flees every roaming / random fight (0).
//                     thorough every roaming enemy of every map of the chapter (side maps too), × 1.5 (BALANCE.md's
//                              cross-check: each symbol enemy fought ~1.5 times), all sea fights.
//                   Not counted: stealth guards / rescue posts (chase 0), enemies that are story fights.
//   Chests          normal: chests within 10 steps of the critical path on main-path maps (and every chest of the
//                   chapter's towns); minimal: within 4 steps; thorough: all. Gold counts as gold; gear found in a chest
//                   is worn when it is better; consumables found pay for part of the next consumable restock.
//   Side quests     REWARDS below (the gold of each quest, read from the chapter scripts — the others give items):
//                   normal does half of the 心燈 (lantern) quests of a chapter, minimal none, thorough all.
//   Levels          each chapter opening's level floor (G.Story.chN ensureLevel), then the exp of everything before
//                   each boss, per active member (G.Party.gainExp: every active member gets the full troop exp).
//   Gear & spending before each boss: first the consumable kit of tools/sim_story.js (5 + 3 heals, 3 MP items,
//                   2 revives from the shops reachable there; the whole kit at a chapter's first boss, KIT_RESTOCK
//                   of it at the others; what is short of gold is bought in part), then the gear docs/BALANCE.md assumes
//                   (best item per slot from those shops — the same choice as sim_story.js): weapons, armour, head /
//                   feet, accessories, the biggest gain per coin first, keeping the next restock in reserve. A
//                   side-grade (armour / accessory < UPGRADE_MIN better) is bought last, with gold to spare. Selling
//                   old gear (half price) is not counted. `coverage` = the share (by price) of the boss's BALANCE gear
//                   the party has (a worn item at least as good).
//
// Exported for tools/test/full_chain.js (--encounters): model(), encounterSchedule() and mapInfo().
'use strict';
const path = require('path');

// ------------------------------------------------------------------------------------------------ the main path
// Per chapter, in story order: { map, random? } a main-path map with roaming enemies (encounters met on its critical
// path; `random` = the map's step encounters (暗雷): rate per step on the listed terrain, on the critical path),
// { sea: [troops], rate? } a fight at sea the player may take (ch10: the optional 巡海 on each leg; ch11: the
// black-tide boarding, `rate` per crossing),
// { troop } a story battle, { troop, boss: <sim_story_fights id> } a boss of docs/BALANCE.md (noShop: it follows the
// previous boss with no shop in between — same gear and kit; noReward: it ends by script without `rewards: true`;
// extra: enemies the fight summons that always give their reward, e.g. 清虛's 冥燈印). Adds other bosses summon now and
// then are not counted (the model's exp / gold are a little low there). `side` = optional maps
// (only the thorough player goes there). `floor` = the chapter opening's level floor (G.Story.chN).
const STORY = [
  { ch: 0, floor: 1, steps: [] },
  { ch: 1, floor: 2, side: [], steps: [
    { map: 'mine_1' }, { map: 'mine_2' }, { troop: 't_c1_foreman', boss: 'c1_foreman' },
    { map: 'badouzi' }, { troop: 't_c1_shore_ghost' },
    { map: 'jiufen' }, { troop: 'jiufen_3' }, { troop: 'jiufen_4' }, { troop: 'jiufen_1' }, { troop: 't_c1_moya', boss: 'c1_moya' }, { troop: 't_c1_ghost_king', boss: 'c1_ghost_king' },
  ] },
  { ch: 2, floor: 5, side: [], steps: [
    { map: 'mistforest_n' }, { map: 'mistforest_s' }, { troop: 't_c2_woodcutter_v' }, { troop: 'boss_hongying', boss: 'c2_duel', noReward: true }, { troop: 't_c2_ambush' },
    { map: 'tiger_lair' }, { map: 'tiger_den' }, { troop: 't_c2_tiger', boss: 'c2_tiger' },
  ] },
  { ch: 3, floor: 9, side: [], steps: [
    { map: 'guanyin_trail' }, { troop: 't_c3_monkeyking', boss: 'c3_monkeyking' }, { troop: 't_c3_raid' }, { troop: 't_c3_guimian', boss: 'c3_guimian' },
    { troop: 't_c3_theatre' }, { map: 'bangka_riverbank' }, { troop: 't_c3_river_boss', boss: 'c3_river_boss' },
  ] },
  { ch: 4, floor: 13, side: ['rat_den'], steps: [
    { map: 'zhuqian_coast' }, { troop: 't4_coast_intro' }, { map: 'hakka_road' }, { troop: 't4_rack_1' }, { troop: 't4_rack_2' }, { troop: 't4_rack_3' },
    { map: 'wuzhi_trail' }, { map: 'wind_cave_1' }, { map: 'wind_cave_2' }, { troop: 't4_boss_wind_demon', boss: 'c4_wind_demon' },
  ] },
  { ch: 5, floor: 16, side: [], steps: [
    { map: 'lukang_jiuqu' }, { map: 'lukang_shore' }, { map: 'luo_1f' }, { map: 'luo_2f' },
    { troop: 't_c5_feast', boss: 'c5_feast' },
  ] },
  { ch: 6, floor: 19, side: [], steps: [
    { troop: 't_c6_yanshui_1' }, { troop: 't_c6_yanshui_2' }, { troop: 't_c6_yanshui_3' }, { troop: 't_c6_plague_mass', boss: 'c6_plague_mass' },
    { map: 'linto' }, { troop: 't_c6_linto_boss', boss: 'c6_linto' }, { map: 'palace_dock' }, { map: 'palace_hall' },
    { troop: 't_c6_netherlamp', boss: 'c6_netherlamp' }, { troop: 't_c6_yexuan_loss', lose: true },
  ] },
  { ch: 7, floor: 23, side: [], steps: [
    { map: 'alishan_trail' }, { troop: 't_c7_bear', boss: 'c7_bear' }, { map: 'alishan_forest' }, { map: 'yushan_trail' }, { map: 'cloud_forest' },
    { map: 'vision_hub' }, { troop: 't_c7_mirror_qf', noReward: true }, { troop: 't_c7_mirror_yg', boss: 'c7_mirror_yg' }, { troop: 't_c7_shadow', boss: 'c7_shadow' },
    { map: 'sunmoon_mist' }, { troop: 't_c7_jiao', boss: 'c7_jiao' }, { map: 'lamp_shrine' }, { map: 'lamp_shrine_lower' }, { troop: 't_c7_qingxu', boss: 'c7_qingxu', extra: ['c7_dark_seal'] },
  ] },
  { ch: 8, floor: 27, side: [], steps: [
    { troop: 't_c8_street' }, { map: 'beigang_river' }, { troop: 't_c8_p1' }, { troop: 't_c8_p2' }, { troop: 't_c8_p3' }, { troop: 't_c8_p4' }, { troop: 't_c8_p5' },
    { troop: 't_c8_hundred', boss: 'c8_hundred' }, { map: 'anping_fort' }, { troop: 't_c8_guards' }, { troop: 't_c8_qingfeng', boss: 'c8_qingfeng' },
  ] },
  { ch: 9, floor: 30, side: [], steps: [
    { troop: 't_c9_beach_1' }, { troop: 't_c9_beach_2' }, { map: 'banping_cave' }, { troop: 't_c9_greed_boss', boss: 'c9_greed' }, { troop: 't_c9_road_a' }, { troop: 't_c9_road_b' },
    { map: 'wangchuan_yard' }, { troop: 't_c9_plague_eye' }, { troop: 't_c9_plague_boss', boss: 'c9_plague' }, { map: 'longpan' }, { troop: 't_c9_fallwind', boss: 'c9_fallwind' },
    { map: 'longkeng_caves' }, { troop: 't_c9_moray_king', boss: 'c9_moray' },
  ] },
  { ch: 10, floor: 34, side: [], steps: [
    { sea: ['t_c10_sea_a'] }, { map: 'orchid_reef' }, { troop: 't_c10_reef_kaswal' }, { troop: 'boss_tide_serpent', boss: 'c10_serpent' }, { sea: ['t_c10_sea_b'] }, { map: 'taitung_coast' },
    { troop: 't_c10_coast_fix_a' }, { troop: 't_c10_coast_fix_b' }, { troop: 't_c10_coast_boss', boss: 'c10_coast' }, { sea: ['t_c10_sea_a'] }, { map: 'qingshui_cliffs' }, { map: 'taroko_gorge' },
    { troop: 'boss_colossus', boss: 'c10_colossus' }, { sea: ['t_c10_sea_b'] }, { troop: 't_c10_guhun', boss: 'c10_guhun' },
  ] },
  { ch: 11, floor: 38, side: [], steps: [
    { map: 'penghu_flats', random: { terr: ['shallow'], rate: 0.07, troops: ['penghu_2'] } }, { troop: 't11_captain', boss: 'c11_captain' }, { map: 'xuanwu_shore' },
    { map: 'xuanwu_b1', random: { terr: ['shallow'], rate: 0.06, troops: ['t11_xw_drowned'] } }, { map: 'xuanwu_1f' }, { troop: 't11_jailer', boss: 'c11_jailer' },
    { sea: ['blacktide_1', 'blacktide_2', 'blacktide_3', 'blacktide_4'], rate: 0.5 }, { troop: 't11_kun', boss: 'c11_kun' }, { map: 'farshore_field' }, { map: 'farshore_tower_1' }, { map: 'farshore_tower_2' }, { map: 'farshore_tower_4' },
    { troop: 't11_warden', boss: 'c11_warden' }, { troop: 't11_yexuan_1', boss: 'c11_yexuan1', noReward: true }, { troop: 't11_yexuan_2', boss: 'c11_yexuan2', noShop: true },
    { troop: 't11_wuxiang_1', boss: 'c11_wuxiang1', noReward: true, noShop: true }, { troop: 't11_wuxiang_2', boss: 'c11_wuxiang2', noReward: true, noShop: true },
  ] },
];

// ------------------------------------------------------------------------------------------------ quest rewards
// Rewards of the optional quests, read from the chapter scripts (gold: S.gold; gear: S.give of an equipment item).
// lantern: a 心燈 quest (the normal player does half of them). Item-only rewards of consumables are not counted.
const REWARDS = {
  1: [{ q: 'q_ahuang', lantern: true }, { q: 'q_atu_watch', lantern: true }, { q: 'q_xingmu' }],
  2: [{ q: 'q_woodcutter', lantern: true }, { q: 'q_letter', lantern: true }, { q: 'q_hy_kitchen' }],
  3: [{ q: 'q_tamsui_soldiers', lantern: true }, { q: 'q_alian', lantern: true }, { q: 'q_xiaomei', lantern: true }, { q: 'q_feud', lantern: true }],
  4: [{ q: 'q_yimin', lantern: true }, { q: 'q_mifen', lantern: true, gold: 500 }, { q: 'q_persimmon' }, { q: 'q_leicha' }, { q: 'q_shange_yungui' }],
  5: [{ q: 'q_fubo', lantern: true }, { q: 'q_halfwell', lantern: true, gold: 1500 }],
  6: [{ q: 'q_yanshui_mother', lantern: true }],
  7: [{ q: 'q_ch7_pasuya', lantern: true }, { q: 'q_ch7_murals', lantern: true }, { q: 'q_ch7_salt' }],
  8: [{ q: 'q_ch8_pilgrims', lantern: true }, { q: 'q_ch8_oyster', lantern: true }],
  9: [{ q: 'q_ch9_banping', lantern: true, gold: 1000 }, { q: 'q_ch9_names', lantern: true }, { q: 'q_ch9_lighthouse', lantern: true }],
  10: [{ q: 'q_c10_tatala', lantern: true }, { q: 'q_c10_haiji', lantern: true }, { q: 'q_c10_race' }, { q: 'q_c10_luohanjiao', lantern: true }],
  11: [{ q: 'q_penghu_weir', lantern: true }, { q: 'q_tangshan', lantern: true }, { q: 'q_baizhi_memory', lantern: true }, { q: 'q_ch11_treasure' }],
};

const BACKTRACK = 1.3;      // normal player: ~1.3 × the critical-path steps
const THOROUGH = 1.5;       // thorough player: every symbol enemy ~1.5 times (BALANCE.md cross-check)
const CHEST_NEAR = { normal: 10, minimal: 4 }; // chests opened: within this many steps of the critical path
const KIT_RESTOCK = 0.4;
const UPGRADE_MIN = 0.08; // a gear upgrade smaller than this (relative score) is a side-grade: bought last, with gold to spare   // after a chapter's first boss, each boss restocks ~40 % of the kit


// ------------------------------------------------------------------------------------------------ the game
let GAME = null;
function game() {
  if (GAME) return GAME;
  const { loadGame } = require('./sim_story');
  const env = loadGame(1);
  const G = env.G;
  // which chapter file defined each map
  const fs = require('fs');
  const fileOf = {};
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js', 'maps'))) {
    const m = /^ch(\d+)_/.exec(f);
    if (!m) continue;
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'maps', f), 'utf8');
    for (const mm of src.matchAll(/G\.Maps\.define\(\s*'([a-z0-9_]+)'/g)) fileOf[mm[1]] = +m[1];
    for (const mm of src.matchAll(/(?:defineMap|def|M|map)\(\s*'([a-z0-9_]+)'\s*,\s*\{/g)) if (G.Maps.defs[mm[1]] && fileOf[mm[1]] == null) fileOf[mm[1]] = +m[1];
  }
  GAME = { G, fileOf };
  return GAME;
}
const troopSum = (G, id) => {
  const T = G.Data.troops[id];
  let exp = 0, gold = 0;
  if (T) for (const e of T.enemies) { const d = G.Data.enemies[e]; if (d) { exp += d.exp; gold += d.gold; } }
  return { exp, gold, missing: !T };
};

const avgTroop = (G, ids) => {
  const a = { exp: 0, gold: 0 };
  for (const id of ids) { const t = troopSum(G, id); a.exp += t.exp / ids.length; a.gold += t.gold / ids.length; }
  return a;
};

// ------------------------------------------------------------------------------------------------ map paths
const MAPCACHE = {};
function mapInfo(id) {
  if (MAPCACHE[id]) return MAPCACHE[id];
  const { G } = game();
  const def = G.Maps.defs[id];
  const st0 = def.start || [1, 1];
  G.state = G.newState(); G.state.party = ['xinghe']; G.Party.create('xinghe', 10);
  const sc = new G.MapScene(id, st0[0], st0[1]);
  // conditional blockers (puzzle rubble, story gates, push blocks, 靈視 walls) are open on the way through
  sc.objActive = (ob) => !(ob.if || ob.push || ob.spirit || ob.illusion);
  sc.computeSolid();
  const W = sc.w, H = sc.h, solid = sc.solid;
  const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !solid[y * W + x];
  // a walkable cell next to a rect (warps sit on doors / edges)
  const near = (x, y) => {
    if (free(x, y)) return [x, y];
    for (let r = 1; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (free(x + dx, y + dy)) return [x + dx, y + dy];
    return null;
  };
  const warps = (def.warps || []).map((w) => ({ to: w.to, cell: near(w.x + Math.floor((w.w || 1) / 2), w.y + Math.floor((w.h || 1) / 2)) })).filter((w) => w.cell);
  const events = (def.events || []).filter((e) => e.x != null && e.y != null && e.trigger !== 'auto' && !e.spirit).map((e) => ({ id: e.id, cell: near(e.x, e.y) })).filter((e) => e.cell);
  // shortest walk (Dijkstra): a closed gate / story wall (solid now, open when the story gets there) costs 25 steps
  const SOLID = 25;
  const bfs = (from) => {
    const dist = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
    const s0 = from[1] * W + from[0];
    dist[s0] = 0;
    const heap = [[0, s0]];
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const nd = d + (solid[j] ? SOLID : 1);
        if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push([nd, j]); }
      }
    }
    return { dist, prev };
  };
  // critical path: from the arrival warp to every other warp and to every story / puzzle spot of the map (touch and
  // action events, inspectable objects); a dead end without any also walks to its farthest NPC or chest
  const root = warps[0] ? warps[0].cell : near(st0[0], st0[1]);
  const { dist, prev } = bfs(root);
  const spotsOf = (list) => list.map((c) => near(c[0], c[1])).filter(Boolean);
  const inspect = spotsOf(sc.objects.filter((ob) => ob.interact && !ob.chest).map((ob) => [ob.x, ob.y]));
  const targets = warps.slice(1).map((w) => w.cell).concat(events.map((e) => e.cell)).concat(inspect);
  if (!targets.length) {
    let far = null;
    const spots = spotsOf((def.npcs || []).filter((n) => n.x != null).map((n) => [n.x, n.y]).concat((def.chests || []).map((c) => [c.x, c.y])));
    for (const c of spots) { const d = dist[c[1] * W + c[0]]; if (d > 0 && d < Infinity && (!far || d > far.d)) far = { d, cell: c }; }
    if (far) targets.push(far.cell);
  }
  const onPath = new Uint8Array(W * H);
  onPath[root[1] * W + root[0]] = 1;
  let steps = 0;
  for (const t of targets) {
    let i = t[1] * W + t[0];
    if (!(dist[i] < Infinity)) continue;
    steps += dist[i];
    while (i >= 0 && !onPath[i]) { onPath[i] = 1; i = prev[i]; }
  }
  const cells = [];
  for (let i = 0; i < W * H; i++) if (onPath[i]) cells.push([i % W, (i / W) | 0]);
  const dToPath = (x, y) => { let b = 1e9; for (const [cx, cy] of cells) { const d = Math.abs(cx - x) + Math.abs(cy - y); if (d < b) b = d; } return b; };
  const enemies = (def.enemies || []).map((e) => {
    const chase = e.chase == null ? 4 : e.chase;
    return { id: e.id, troop: e.troop, lv: e.lv, get exp() { return troopSum(G, e.troop).exp; }, get gold() { return troopSum(G, e.troop).gold; }, chase, respawn: e.respawn !== false, d: dToPath(e.x, e.y),
      story: chase === 0, met: chase > 0 && dToPath(e.x, e.y) <= chase + Math.min(2, e.radius == null ? 3 : e.radius) };
  });
  const chests = (def.chests || []).map((c) => ({ id: c.id, gold: c.gold || 0, item: c.item || null, n: c.n || 1, d: dToPath(c.x, c.y), extra: c.run ? String(c.run) : '' }));
  for (const c of chests) { const m = /S\.gold\((\d+)\)/.exec(c.extra); if (m) c.gold += +m[1]; delete c.extra; }
  const terrOnPath = {};
  for (const [x, y] of cells) { const t = sc.terrain[y * W + x]; terrOnPath[t] = (terrOnPath[t] || 0) + 1; }
  MAPCACHE[id] = { id, w: W, h: H, steps, pathCells: cells.length, warps: warps.length, enemies, chests, terrOnPath };
  return MAPCACHE[id];
}

// ------------------------------------------------------------------------------------------------ gear the bosses assume
const SLOTS = ['weapon', 'armor', 'head', 'feet', 'acc'];
const SLOT_ORDER = { weapon: 0, armor: 1, head: 2, feet: 2, acc: 3 };
// best item per slot among `pool` (+ what the member wears) — tools/sim_story.js bestGear / gearScore
function wantedGear(G, F, cid, wearing, extra) {
  const { bestGear } = require('./sim_story');
  const gifts = (F.gifts && F.gifts[cid]) || [];
  const cand = (F.shops || []).concat(Object.values(wearing).filter(Boolean)).concat(gifts).concat(extra || []);
  const out = {};
  for (const slot of SLOTS) {
    const fixed = F.gear && F.gear[cid] && F.gear[cid][slot];
    const b = fixed !== undefined ? fixed : bestGear(G, cid, cand.filter((id) => !(F.withhold || []).includes(id)), slot);
    if (b) out[slot] = b;
  }
  return out;
}
function kitOf(G, F) {
  const { kitFrom } = require('./sim_story');
  const inv = kitFrom(G, F.shops || [], F);
  let cost = 0;
  for (const [id, n] of Object.entries(inv)) cost += ((G.Data.items[id] || {}).price || 0) * n;
  return { inv, cost };
}

// ------------------------------------------------------------------------------------------------ the model
const STYLES = ['minimal', 'normal', 'thorough'];
function model(o = {}) {
  const { G, fileOf } = game();
  const { gearScore } = require('./sim_story');
  const diffK = o.diff === 'easy' ? 1.2 : o.diff === 'hard' ? 0.9 : 1;
  const { FIGHTS } = require('./sim_story_fights');
  const fights = {};
  for (const F of FIGHTS(G)) fights[F.id] = F;
  const I = G.Data.items;
  const e2n = (lv) => G.Party.expToNext(lv);
  const res = { chapters: [], bosses: [] };
  const P = {}, lastBoss = {};
  // each style's player: level / exp (every active member gets the full troop exp, so one track), gold, the gear each
  // member wears, gear found in chests (free, not yet worn)
  for (const s of STYLES) P[s] = { lv: 1, exp: 0, gold: 0, wear: {}, found: [], kitCredit: 0 };
  const wearOf = (p, cid) => p.wear[cid] || (p.wear[cid] = Object.assign({ weapon: null, armor: null, head: null, feet: null, acc: null }, (G.Data.chars[cid] || {}).equip || {}));
  const gain = (p, exp) => { p.exp += exp; while (p.exp >= e2n(p.lv) && p.lv < 50) { p.exp -= e2n(p.lv); p.lv++; } };
  const floorTo = (p, lv) => { if (p.lv < lv) { p.lv = lv; p.exp = 0; } };
  const lvf = (p) => +(p.lv + p.exp / e2n(p.lv)).toFixed(2);
  for (const C of STORY) {
    if (C.ch === 0) continue;
    const row = { ch: C.ch, floor: C.floor, styles: {}, encounters: [] };
    const chMaps = Object.keys(fileOf).filter((id) => fileOf[id] === C.ch);
    const mainMaps = C.steps.filter((s) => s.map).map((s) => s.map);
    for (const s of STYLES) {
      const p = P[s];
      const r = row.styles[s] = { goldIn: p.gold, storyExp: 0, storyGold: 0, encExp: 0, encGold: 0, encFights: 0, chestGold: 0, questGold: 0, spentGear: 0, spentKit: 0, wantedGear: 0, bosses: [] };
      floorTo(p, C.floor);
      r.lvIn = p.lv;
      r.wearIn = JSON.parse(JSON.stringify(p.wear));
      // chests (main-path maps: those near the path; town maps: all; thorough: every chest of the chapter) and quests
      // are credited at the chapter start: a player picks them up on the way, and shops in the chapter's towns
      const townMaps = chMaps.filter((id) => !(G.Maps.defs[id].enemies || []).length && !(C.side || []).includes(id));
      // chests: a main-path map's when the story gets there (those near its path), every town chest of the chapter at
      // its start (towns come first), the thorough player's side maps at the start too
      const openChests = (id) => {
        let g = 0;
        for (const c of mapInfo(id).chests) {
          if (s !== 'thorough' && mainMaps.includes(id) && c.d > CHEST_NEAR[s]) continue;
          g += c.gold;
          if (c.item && I[c.item] && SLOTS.includes(I[c.item].type)) p.found.push(c.item);
          if (c.item && I[c.item] && I[c.item].type === 'use') p.kitCredit += (I[c.item].price || 0) * c.n;
        }
        r.chestGold += g; p.gold += g;
      };
      for (const id of s === 'thorough' ? chMaps.filter((m) => !mainMaps.includes(m)) : townMaps) openChests(id);
      for (const q of REWARDS[C.ch] || []) {
        if (s === 'minimal') continue;
        r.questGold += Math.round((q.gold || 0) * (s === 'thorough' ? 1 : q.lantern ? 0.5 : 0));
      }
      p.gold += r.questGold;
      let kitBought = false;
      for (const st of C.steps) {
        if (st.map) {
          const mi = mapInfo(st.map);
          openChests(st.map);
          let ex = 0, go = 0, n = 0;
          for (const e of mi.enemies) {
            if (e.story) continue;
            let k = 0;
            if (s === 'normal') k = e.met ? (e.respawn ? BACKTRACK : 1) : 0;
            if (s === 'thorough') k = e.respawn ? THOROUGH : 1;
            ex += e.exp * k * diffK; go += e.gold * k; n += k;
          }
          if (st.random && s !== 'minimal') {
            // step encounters on the path's matching terrain (thorough walks 1.5 × as far)
            const cellsOn = st.random.terr.reduce((a, t) => a + (mi.terrOnPath[t] || 0), 0);
            const k = cellsOn * st.random.rate * (s === 'thorough' ? THOROUGH : BACKTRACK);
            const t = avgTroop(G, st.random.troops);
            ex += t.exp * k * diffK; go += t.gold * k; n += k;
          }
          r.encExp += ex; r.encGold += go; r.encFights += n;
          gain(p, Math.round(ex)); p.gold += Math.round(go);
          if (s === 'normal') row.encounters.push({ map: st.map, exp: Math.round(ex), gold: Math.round(go), fights: +n.toFixed(1) });
          continue;
        }
        if (st.sea) {
          // optional fights at sea (ch10 巡海): normal takes half, thorough all; a random boarding (ch11, `rate`): fought
          // by normal and thorough when it happens; minimal declines / flees
          const k = s === 'minimal' ? 0 : st.rate != null ? st.rate : s === 'normal' ? 0.5 : 1;
          const t = avgTroop(G, st.sea);
          r.encExp += t.exp * k * diffK; r.encGold += t.gold * k; r.encFights += k;
          gain(p, Math.round(t.exp * k * diffK)); p.gold += Math.round(t.gold * k);
          if (s === 'normal') row.encounters.push({ sea: st.sea.join('/'), exp: Math.round(t.exp * k * diffK), gold: Math.round(t.gold * k), fights: k });
          continue;
        }
        const F = st.boss && fights[st.boss];
        if (F && s === 'normal') row.encounters.push({ boss: st.boss, troop: st.troop });
        if (F && st.noShop && lastBoss[s]) {
          // a fight that follows the previous boss with no shop in between (the finale): same gear and kit
          const b = Object.assign({}, lastBoss[s], { id: st.boss, name: F.name, lvBalance: typeof F.lv === 'object' ? Math.min(...Object.values(F.lv)) : F.lv,
            lv: p.lv, lvf: lvf(p), goldBefore: p.gold, spent: 0, kitCost: 0, missing: [] });
          r.bosses.push(b); res.bosses.push(b);
        } else if (F) {
          // before a boss: restock the kit (once per chapter), then buy toward the gear docs/BALANCE.md assumes —
          // weapons, armour, head/feet, accessories, the biggest gain per coin first — with the gold carried
          const before = p.gold;
          const kit = kitOf(G, F);
          // the chapter's first boss: the whole kit; later bosses: restock what a fight uses up (KIT_RESTOCK)
          const kitNeed0 = Math.round(kit.cost * (kitBought ? KIT_RESTOCK : 1));
          // consumables found in chests cover part of it (at most half: they are not always the right ones)
          const credit = Math.min(p.kitCredit, Math.round(kitNeed0 / 2));
          p.kitCredit -= credit;
          const kitNeed = kitNeed0 - credit;
          let kitCost = 0, kitInv = {};
          if (p.gold >= kitNeed) { kitCost = kitNeed; kitInv = kit.inv; } else if (kitNeed > 0) {
            // (the credit already covers part of every item)
            // short of gold: as much of each item as the gold allows (a careful player never goes without heals)
            const f = (p.gold + credit) / kitNeed0;
            for (const [id, nn] of Object.entries(kit.inv)) { const k = Math.floor(nn * f); if (k > 0) kitInv[id] = k; }
            kitCost = p.gold;
          }
          p.gold -= kitCost; kitBought = true;
          // gear: keep the next boss's restock in reserve
          const reserve = Math.round(kit.cost * KIT_RESTOCK);
          const wants = [];
          let wantCost = 0;
          for (const cid of F.party) {
            const wear = wearOf(p, cid);
            const goal = wantedGear(G, F, cid, wear, p.found);
            for (const slot of SLOTS) {
              const id = goal[slot];
              if (!id || id === wear[slot]) continue;
              const cur = wear[slot] && I[wear[slot]] ? gearScore(G, cid, I[wear[slot]], slot) : 0;
              const gainV = gearScore(G, cid, I[id], slot) - cur;
              if (gainV <= 0.01) continue;
              // a side-grade (armour / accessory less than 8 % better than what is worn) is bought last, with gold to spare
              const side = slot !== 'weapon' && cur > 0 && gainV < cur * UPGRADE_MIN; // a new weapon may change the element
              const fi = p.found.indexOf(id);
              if (fi >= 0) { p.found.splice(fi, 1); wear[slot] = id; continue; } // found in a chest
              const gift = (F.gifts && (F.gifts[cid] || []).includes(id)) || !(I[id].price > 0);
              if (gift) { wear[slot] = id; continue; }
              wants.push({ cid, slot, id, gain: gainV, price: I[id].price, side });
              wantCost += I[id].price;
            }
          }
          wants.sort((a, b) => (a.side - b.side) || SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || b.gain / b.price - a.gain / a.price);
          let spent = 0;
          const missing = [];
          for (const w of wants) {
            if (p.gold - reserve >= w.price * (w.side ? 1.5 : 1)) { p.gold -= w.price; spent += w.price; wearOf(p, w.cid)[w.slot] = w.id; } else missing.push(`${w.cid}.${w.slot}=${w.id}(${w.price})`);
          }
          r.spentGear += spent; r.spentKit += kitCost; r.wantedGear += wantCost;
          const b = { id: st.boss, name: F.name, ch: C.ch, style: s, lvBalance: typeof F.lv === 'object' ? Math.min(...Object.values(F.lv)) : F.lv,
            lv: p.lv, lvf: lvf(p), goldBefore: before, wantCost, spent, kitCost, kitFull: kitCost >= kitNeed, missing,
            gear: Object.fromEntries(F.party.map((cid) => [cid, Object.assign({}, wearOf(p, cid))])), kit: kitInv };
          // coverage: the share (by price) of the boss's BALANCE.md gear the party has (a worn item at least as good)
          let balV = 0, haveV = 0;
          for (const cid of F.party) {
            const bal = wantedGear(G, F, cid, Object.assign({ weapon: null, armor: null, head: null, feet: null, acc: null }, (G.Data.chars[cid] || {}).equip || {}));
            const wear = wearOf(p, cid);
            for (const slot of SLOTS) {
              const id = bal[slot];
              if (!id || !(I[id].price > 0)) continue;
              balV += I[id].price;
              const want = gearScore(G, cid, I[id], slot);
              const have = wear[slot] && I[wear[slot]] ? gearScore(G, cid, I[wear[slot]], slot) : 0;
              if (have >= want * 0.97) haveV += I[id].price; // at least as good (3 % tolerance)
            }
          }
          b.coverage = balV ? +(haveV / balV).toFixed(2) : 1;
          r.bosses.push(b);
          res.bosses.push(b);
          lastBoss[s] = b;
        }
        if (!st.noReward && !st.lose) {
          const t = troopSum(G, st.troop);
          for (const id of st.extra || []) { const d = G.Data.enemies[id]; if (d) { t.exp += d.exp; t.gold += d.gold; } }
          r.storyExp += t.exp * diffK; r.storyGold += t.gold;
          gain(p, Math.round(t.exp * diffK)); p.gold += t.gold;
        }
      }
      if (s === 'thorough') {
        // the chapter's other maps with roaming enemies (side areas), all of them ~1.5 times
        for (const id of chMaps) {
          if (mainMaps.includes(id) || !(G.Maps.defs[id].enemies || []).length) continue;
          for (const e of mapInfo(id).enemies) {
            if (e.story) continue;
            const k = e.respawn ? THOROUGH : 1;
            r.encExp += e.exp * k * diffK; r.encGold += e.gold * k; r.encFights += k;
            gain(p, Math.round(e.exp * k * diffK)); p.gold += Math.round(e.gold * k);
          }
        }
      }
      r.lvOut = p.lv; r.lvOutF = lvf(p); r.goldOut = p.gold;
      r.income = Math.round(r.encGold + r.storyGold + r.chestGold + r.questGold);
      for (const k of ['encExp', 'encGold', 'encFights', 'storyExp']) r[k] = Math.round(r[k] * 10) / 10;
    }
    res.chapters.push(row);
  }
  return res;
}

// expected encounter rewards of the normal player, per chapter, split at the bosses (for full_chain --encounters):
// [{ ch, before: [{ troop, boss, exp, gold, fights, maps }], rest: { exp, gold, fights, maps } }] — `before` = what is
// met on the way to that boss (since the previous one), `rest` = after the chapter's last boss
function encounterSchedule(o = {}) {
  const out = [];
  for (const row of model(o).chapters) {
    const sch = { ch: row.ch, before: [], rest: null };
    let acc = { exp: 0, gold: 0, fights: 0, maps: [] };
    for (const e of row.encounters) {
      if (e.boss) {
        if (acc.fights > 0) sch.before.push(Object.assign({ troop: e.troop, boss: e.boss }, acc, { fights: +acc.fights.toFixed(1) }));
        acc = { exp: 0, gold: 0, fights: 0, maps: [] };
        continue;
      }
      acc.exp += e.exp; acc.gold += e.gold; acc.fights += e.fights; acc.maps.push(e.map || 'sea:' + e.sea);
    }
    sch.rest = Object.assign({}, acc, { fights: +acc.fights.toFixed(1) });
    out.push(sch);
  }
  return out;
}

module.exports = { STORY, REWARDS, BACKTRACK, THOROUGH, model, encounterSchedule, mapInfo, game };

// ------------------------------------------------------------------------------------------------ CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
  const diff = opt('diff', 'normal');
  if (opt('schedule')) {
    for (const c of encounterSchedule({ diff })) {
      for (const b of c.before) console.log(`ch${c.ch} before ${b.troop.padEnd(18)} +${b.exp} exp +${b.gold} gold (${b.fights} fights: ${b.maps.join(', ')})`);
      if (c.rest.fights) console.log(`ch${c.ch} rest of the chapter      +${c.rest.exp} exp +${c.rest.gold} gold (${c.rest.fights} fights: ${c.rest.maps.join(', ')})`);
    }
    process.exit(0);
  }
  if (opt('maps')) {
    for (const C of STORY) for (const st of C.steps) if (st.map) {
      const mi = mapInfo(st.map);
      const met = mi.enemies.filter((e) => e.met && !e.story);
      console.log(`ch${C.ch} ${st.map.padEnd(18)} ${mi.w}x${mi.h} path ${mi.pathCells} cells (${mi.steps} steps, ${mi.warps} warps) · roaming ${mi.enemies.filter((e) => !e.story).length}, met ${met.length}: ${met.map((e) => `${e.id}(${e.troop} ${e.exp}/${e.gold}${e.respawn ? '' : ' once'})`).join(' ')}`);
      const far = mi.enemies.filter((e) => !e.met && !e.story);
      if (far.length) console.log(`     off the path: ${far.map((e) => `${e.id}(d${e.d})`).join(' ')}`);
      if (mi.chests.length) console.log(`     chests: ${mi.chests.map((c) => `${c.id}(d${c.d} ${c.gold ? c.gold + 'g ' : ''}${c.item || ''}${c.n > 1 ? '×' + c.n : ''})`).join(' ')}`);
    }
    process.exit(0);
  }
  const M = model({ diff });
  if (opt('json')) require('fs').writeFileSync(opt('json'), JSON.stringify(M, null, 1));
  console.log(`progression & economy model (${diff}) — per chapter: level in → out, gold earned (encounters / story / chests / quests), spent (gear / kit), gold out`);
  for (const row of M.chapters) {
    const parts = STYLES.map((s) => {
      const r = row.styles[s];
      return `${s[0].toUpperCase()} Lv${r.lvIn}→${r.lvOutF} enc ${r.encFights}f ${Math.round(r.encExp)}xp/${Math.round(r.encGold)}g story ${Math.round(r.storyExp)}xp/${r.storyGold}g chest ${r.chestGold}g quest ${r.questGold}g = ${r.income}g · gear ${r.spentGear}/${r.wantedGear} kit ${r.spentKit} · out ${r.goldOut}g`;
    });
    console.log(`ch${row.ch} (floor ${row.floor})\n   ` + parts.join('\n   '));
  }
  console.log('\nbosses: docs/BALANCE.md level vs each style (level.fraction); gold before the boss, spent on gear / wanted (the BALANCE gear), kit');
  const by = {};
  for (const b of M.bosses) (by[b.id] = by[b.id] || {})[b.style] = b;
  for (const [id, x] of Object.entries(by)) {
    const n = x.normal, m = x.minimal, t = x.thorough;
    const g = (b) => `${b.goldBefore}g → gear ${b.spent}/${b.wantCost}${b.kitFull ? ' +kit' : b.kitCost ? ' +part kit' : ' NO KIT'}`;
    console.log(`  ${id.padEnd(15)} ch${String(n.ch).padEnd(3)} BAL ${String(n.lvBalance).padEnd(3)} min ${m.lvf.toFixed(1).padStart(4)} norm ${n.lvf.toFixed(1).padStart(4)} thor ${t.lvf.toFixed(1).padStart(4)} · norm ${g(n)} · min ${g(m)}`);
  }
}

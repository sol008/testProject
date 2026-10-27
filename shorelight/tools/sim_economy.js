#!/usr/bin/env node
// 彼岸燈 — progression & economy model: the level and gold a player really has at each boss, for three play styles.
//
//   node tools/sim_economy.js                 per-chapter table (normal / minimal / thorough) + per-boss check
//   node tools/sim_economy.js --maps          per-map critical path, roaming enemies met, chests on the way
//   node tools/sim_economy.js --bosses        per-boss level and gold for each style vs docs/BALANCE.md
//   node tools/sim_economy.js --json out.json the whole model as JSON
//   node tools/sim_economy.js --diff easy     exp ×1.2 (the playthrough tests / full_chain play on easy)
//
// The data is the game's own (loaded like tools/sim_story.js: index.html order in a Node vm). What is modelled:
//
//   Story battles   the main-path battles of each chapter, in story order (STORY below: troops, the boss fights of
//                   docs/BALANCE.md marked with their sim id); exp / gold = the troop's enemies (G.Data.enemies), none
//                   for a fight that ends by script without `rewards: true`.
//   Encounters      roaming (symbol) enemies, G.Maps.defs[id].enemies. For every main-path map the critical path is
//                   the union of the shortest walkable paths (the real collision grid, G.MapScene.solid) from the
//                   arrival warp to every other warp of the map (dead ends: to the farthest story event). An enemy is
//                   MET when its home cell is within its chase range (default 4) of that path — it walks to the player.
//                     normal   fights every enemy met, × 1.3 for backtracking (respawning enemies are met again on
//                              re-entry; enemies with respawn:false only once). The user-side assumption: a typical
//                              player walks ~1.3 × the critical-path steps.
//                     minimal  flees every roaming fight (0).
//                     thorough every roaming enemy of every map of the chapter (side maps too), × 1.5 (BALANCE.md's
//                              cross-check: each symbol enemy fought ~1.5 times).
//                   Not counted: stealth guards / rescue posts (chase 0), enemies that are story fights.
//   Chests          normal: chests within 6 cells of the critical path on main-path maps; minimal: within 2 cells;
//                   thorough: all. Gold counts as gold; gear found in a chest is not bought again.
//   Side quests     REWARDS below (gold and gear per quest, read from the chapter scripts): normal does half of the
//                   心燈 (lantern) quests of a chapter (the cheaper half is not assumed: the average), minimal none,
//                   thorough all side quests.
//   Levels          each chapter opening's level floor (G.Story.chN ensureLevel), then the exp of everything before
//                   each boss, per active member (G.Party.gainExp: every active member gets the full troop exp).
//   Gear & spending the gear docs/BALANCE.md assumes at each boss (best item per slot from the shops reachable before
//                   it — tools/sim_story_fights.js — the same choice as sim_story.js) bought the first time it is
//                   needed, plus a consumable restock per boss (the sim's kit: 5 + 3 heals, 3 MP items, 2 revives,
//                   bought once per chapter at the chapter's prices). Selling old gear (half price) is not counted.
//
// Exported for tools/test/full_chain.js (`--encounters`): model() → per chapter the normal player's expected
// encounter exp and gold, split by boss (what is met before each boss of the chapter, and the rest of the chapter).
'use strict';
const path = require('path');

// ------------------------------------------------------------------------------------------------ the main path
// Per chapter, in story order: { map } a main-path map with roaming enemies (encounters met on its critical path),
// { troop } a story battle, { troop, boss: <sim_story_fights id> } a boss of docs/BALANCE.md. `side` = optional maps
// (only the thorough player goes there). `floor` = the chapter opening's level floor (G.Story.chN).
const STORY = [
  { ch: 0, floor: 1, steps: [] },
  { ch: 1, floor: 2, side: [], steps: [
    { map: 'mine_1' }, { map: 'mine_2', to: 'foreman' }, { troop: 't_c1_foreman', boss: 'c1_foreman' },
    { map: 'badouzi' }, { troop: 't_c1_shore_ghost' },
    { map: 'jiufen' }, { troop: 'jiufen_3' }, { troop: 'jiufen_4' }, { troop: 't_c1_moya', boss: 'c1_moya' }, { troop: 't_c1_ghost_king', boss: 'c1_ghost_king' },
  ] },
  { ch: 2, floor: 5, side: [], steps: [
    { map: 'mistforest_n' }, { map: 'mistforest_s' }, { troop: 't_c2_woodcutter_v' }, { troop: 'boss_hongying', boss: 'c2_duel' }, { troop: 't_c2_ambush' },
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
    { map: 'lukang_jiuqu' }, { map: 'lukang_shore' }, { map: 'luo_1f' }, { troop: 'luo_1' }, { map: 'luo_2f' }, { troop: 'luo_1' },
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
    { map: 'sunmoon_mist' }, { troop: 't_c7_jiao', boss: 'c7_jiao' }, { map: 'lamp_shrine' }, { map: 'lamp_shrine_lower' }, { troop: 't_c7_qingxu', boss: 'c7_qingxu' },
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
    { map: 'orchid_reef' }, { troop: 't_c10_reef_kaswal' }, { troop: 'boss_tide_serpent', boss: 'c10_serpent' }, { map: 'taitung_coast' }, { troop: 't_c10_coast_fix_a' },
    { troop: 't_c10_coast_fix_b' }, { troop: 't_c10_coast_boss', boss: 'c10_coast' }, { map: 'qingshui_cliffs' }, { map: 'taroko_gorge' }, { troop: 'boss_colossus', boss: 'c10_colossus' },
    { troop: 't_c10_guhun', boss: 'c10_guhun' },
  ] },
  { ch: 11, floor: 0, side: [], steps: [
    { map: 'penghu_flats' }, { troop: 't11_captain', boss: 'c11_captain' }, { map: 'xuanwu_shore' }, { map: 'xuanwu_b1' }, { map: 'xuanwu_1f' }, { troop: 't11_jailer', boss: 'c11_jailer' },
    { troop: 't11_kun', boss: 'c11_kun' }, { map: 'farshore_field' }, { map: 'farshore_tower_1' }, { map: 'farshore_tower_2' }, { map: 'farshore_tower_4' },
    { troop: 't11_warden', boss: 'c11_warden' }, { troop: 't11_yexuan_1', boss: 'c11_yexuan1', noReward: true }, { troop: 't11_yexuan_2', boss: 'c11_yexuan2' },
    { troop: 't11_wuxiang_1', boss: 'c11_wuxiang1', noReward: true }, { troop: 't11_wuxiang_2', boss: 'c11_wuxiang2', noReward: true },
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
const CHEST_NEAR = { normal: 6, minimal: 2 };


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

// ------------------------------------------------------------------------------------------------ map paths
const MAPCACHE = {};
function mapInfo(id) {
  if (MAPCACHE[id]) return MAPCACHE[id];
  const { G } = game();
  const def = G.Maps.defs[id];
  const st0 = def.start || [1, 1];
  G.state = G.newState(); G.state.party = ['xinghe']; G.Party.create('xinghe', 10);
  const sc = new G.MapScene(id, st0[0], st0[1]);
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
  const bfs = (from) => {
    const dist = new Int32Array(W * H).fill(-1), prev = new Int32Array(W * H).fill(-1);
    const q = [from[1] * W + from[0]]; dist[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!free(nx, ny)) continue;
        const j = ny * W + nx;
        if (dist[j] >= 0) continue;
        dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
      }
    }
    return { dist, prev };
  };
  // critical path: from the first warp (arrival) to every other warp; a dead end (≤ 1 warp) also walks to its
  // farthest story event (the reason to go there)
  const root = warps[0] ? warps[0].cell : near(st0[0], st0[1]);
  const { dist, prev } = bfs(root);
  const targets = warps.slice(1).map((w) => w.cell);
  if (warps.length <= 1 && events.length) {
    let far = null;
    for (const e of events) { const d = dist[e.cell[1] * W + e.cell[0]]; if (d > 0 && (!far || d > far.d)) far = { d, cell: e.cell }; }
    if (far) targets.push(far.cell);
  }
  const onPath = new Uint8Array(W * H);
  onPath[root[1] * W + root[0]] = 1;
  let steps = 0;
  for (const t of targets) {
    let i = t[1] * W + t[0];
    if (dist[i] < 0) continue;
    steps += dist[i];
    while (i >= 0 && !onPath[i]) { onPath[i] = 1; i = prev[i]; }
  }
  const cells = [];
  for (let i = 0; i < W * H; i++) if (onPath[i]) cells.push([i % W, (i / W) | 0]);
  const dToPath = (x, y) => { let b = 1e9; for (const [cx, cy] of cells) { const d = Math.abs(cx - x) + Math.abs(cy - y); if (d < b) b = d; } return b; };
  const enemies = (def.enemies || []).map((e) => {
    const t = troopSum(G, e.troop);
    const chase = e.chase == null ? 4 : e.chase;
    return { id: e.id, troop: e.troop, lv: e.lv, exp: t.exp, gold: t.gold, chase, respawn: e.respawn !== false, d: dToPath(e.x, e.y),
      story: chase === 0, met: chase > 0 && dToPath(e.x, e.y) <= chase + Math.min(2, e.radius == null ? 3 : e.radius) };
  });
  const chests = (def.chests || []).map((c) => ({ id: c.id, gold: c.gold || 0, item: c.item || null, n: c.n || 1, d: dToPath(c.x, c.y), extra: c.run ? String(c.run) : '' }));
  for (const c of chests) { const m = /S\.gold\((\d+)\)/.exec(c.extra); if (m) c.gold += +m[1]; delete c.extra; }
  MAPCACHE[id] = { id, w: W, h: H, steps, pathCells: cells.length, warps: warps.length, enemies, chests };
  return MAPCACHE[id];
}

// ------------------------------------------------------------------------------------------------ gear the bosses assume
function bossGear(G, F) {
  const { bestGear } = require('./sim_story');
  const out = {};
  for (const cid of F.party) {
    const m = { equip: Object.assign({ weapon: null, armor: null, head: null, feet: null, acc: null }, (G.Data.chars[cid] || {}).equip || {}) };
    const gifts = (F.gifts && F.gifts[cid]) || [];
    const cand = (F.shops || []).concat(Object.values(m.equip).filter(Boolean)).concat(gifts);
    out[cid] = {};
    for (const slot of ['weapon', 'armor', 'head', 'feet', 'acc']) {
      const fixed = F.gear && F.gear[cid] && F.gear[cid][slot];
      const b = fixed !== undefined ? fixed : bestGear(G, cid, cand.filter((id) => !(F.withhold || []).includes(id)), slot);
      if (b) out[cid][slot] = b;
    }
  }
  return out;
}
function kitCost(G, F) {
  const { kitFrom } = require('./sim_story');
  const inv = kitFrom(G, F.shops || [], F);
  let c = 0;
  for (const [id, n] of Object.entries(inv)) c += ((G.Data.items[id] || {}).price || 0) * n;
  return c;
}

// ------------------------------------------------------------------------------------------------ the model
const STYLES = ['minimal', 'normal', 'thorough'];
function model(o = {}) {
  const { G, fileOf } = game();
  const diffK = o.diff === 'easy' ? 1.2 : o.diff === 'hard' ? 0.9 : 1;
  const { FIGHTS } = require('./sim_story_fights');
  const fights = {};
  for (const F of FIGHTS(G)) fights[F.id] = F;
  const e2n = (lv) => G.Party.expToNext(lv);
  const res = { chapters: [], bosses: [] };
  const P = {};
  for (const s of STYLES) P[s] = { lv: 1, exp: 0, gold: 0, owned: new Set(), spent: 0, income: 0 };
  const gain = (p, exp) => { p.exp += exp; while (p.exp >= e2n(p.lv) && p.lv < 50) { p.exp -= e2n(p.lv); p.lv++; } };
  const floorTo = (p, lv) => { if (p.lv < lv) { p.lv = lv; p.exp = 0; } };
  for (const C of STORY) {
    if (C.ch === 0) continue;
    const row = { ch: C.ch, floor: C.floor, styles: {}, encounters: [], maps: [] };
    // per style, the sources of this chapter
    const chMaps = Object.keys(fileOf).filter((id) => fileOf[id] === C.ch);
    const mainMaps = C.steps.filter((s) => s.map).map((s) => s.map);
    for (const s of STYLES) {
      const p = P[s];
      const r = row.styles[s] = { lvIn: null, goldIn: p.gold, storyExp: 0, storyGold: 0, encExp: 0, encGold: 0, encFights: 0, chestGold: 0, questGold: 0, spentGear: 0, spentKit: 0, bosses: [] };
      floorTo(p, C.floor);
      r.lvIn = p.lv;
      // chests and quests: credited at the chapter start (a player picks them up on the way; shopping happens in
      // the chapter's towns before its dungeons)
      const chestMaps = s === 'thorough' ? chMaps : mainMaps.concat(chMaps.filter((id) => !(G.Maps.defs[id].enemies || []).length && !(C.side || []).includes(id)));
      for (const id of chestMaps) {
        const mi = mapInfo(id);
        for (const c of mi.chests) {
          if (s !== 'thorough' && c.d > CHEST_NEAR[s] && (G.Maps.defs[id].enemies || []).length) continue;
          r.chestGold += c.gold;
          if (c.item && G.Data.items[c.item] && ['weapon', 'armor', 'head', 'feet', 'acc'].includes(G.Data.items[c.item].type)) p.owned.add(c.item);
        }
      }
      const qs = REWARDS[C.ch] || [];
      for (const q of qs) {
        if (s === 'minimal') continue;
        const k = s === 'thorough' ? 1 : q.lantern ? 0.5 : 0;
        r.questGold += Math.round((q.gold || 0) * k);
      }
      p.gold += r.chestGold + r.questGold;
      let kitBought = false;
      for (const st of C.steps) {
        if (st.map) {
          const mi = mapInfo(st.map);
          let ex = 0, go = 0, n = 0;
          for (const e of mi.enemies) {
            if (e.story) continue;
            let k = 0;
            if (s === 'normal') k = e.met ? (e.respawn ? BACKTRACK : 1) : 0;
            if (s === 'thorough') k = e.respawn ? THOROUGH : 1;
            ex += e.exp * k * diffK; go += e.gold * k; n += k;
          }
          r.encExp += ex; r.encGold += go; r.encFights += n;
          gain(p, Math.round(ex)); p.gold += Math.round(go);
          if (s === 'normal') row.encounters.push({ map: st.map, exp: Math.round(ex), gold: Math.round(go), fights: +n.toFixed(1) });
          continue;
        }
        // a story battle
        const t = troopSum(G, st.troop);
        const F = st.boss && fights[st.boss];
        if (F) {
          // buy what the boss assumes (first time it is needed), restock the kit once per chapter
          const gear = bossGear(G, F);
          let need = 0;
          for (const cid in gear) for (const slot in gear[cid]) {
            const id = gear[cid][slot];
            const key = cid + ':' + id;
            if (p.owned.has(key) || p.owned.has(id + '#' + cid)) continue;
            const it = G.Data.items[id];
            const free = !(it && it.price > 0) || (G.Data.chars[cid].equip && Object.values(G.Data.chars[cid].equip).includes(id)) || (F.gifts && (F.gifts[cid] || []).includes(id));
            if (!free && !p.owned.has(id)) need += it.price;
            if (p.owned.has(id)) p.owned.delete(id); // a chest item covers one member
            p.owned.add(key);
          }
          const kit = kitBought ? 0 : kitCost(G, F);
          kitBought = true;
          const before = p.gold;
          r.spentGear += need; r.spentKit += kit;
          p.gold -= need + kit;
          const b = { id: st.boss, name: F.name, ch: C.ch, lvBalance: typeof F.lv === 'object' ? Math.min(...Object.values(F.lv)) : F.lv, lv: p.lv,
            goldBefore: before, gearCost: need, kitCost: kit, short: Math.max(0, -p.gold) };
          r.bosses.push(b);
          if (s === 'normal') res.bosses.push(Object.assign({ style: s }, b));
          else res.bosses.push(Object.assign({ style: s }, b));
          if (p.gold < 0) p.gold = 0; // what could not be bought is simply not bought (the next chapter still assumes it)
        }
        if (!st.noReward && !st.lose) {
          r.storyExp += t.exp * diffK; r.storyGold += t.gold;
          gain(p, Math.round(t.exp * diffK)); p.gold += t.gold;
        }
      }
      r.lvOut = p.lv; r.expOut = p.exp; r.goldOut = p.gold;
      for (const k of ['encExp', 'encGold', 'encFights', 'storyExp']) r[k] = Math.round(r[k] * 10) / 10;
    }
    res.chapters.push(row);
  }
  return res;
}

// expected encounter rewards of the normal player, per chapter, split at the bosses (for full_chain --encounters):
// [{ ch, before: { <boss troop>: { exp, gold, maps } }, rest: { exp, gold, maps } }]
function encounterSchedule(o = {}) {
  const { G } = game();
  const diffK = o.diff === 'easy' ? 1.2 : 1;
  const out = [];
  for (const C of STORY) {
    if (!C.steps.length) continue;
    const sch = { ch: C.ch, before: [], rest: { exp: 0, gold: 0, fights: 0, maps: [] } };
    let acc = { exp: 0, gold: 0, fights: 0, maps: [] };
    for (const st of C.steps) {
      if (st.map) {
        const mi = mapInfo(st.map);
        for (const e of mi.enemies) {
          if (e.story || !e.met) continue;
          const k = e.respawn ? BACKTRACK : 1;
          acc.exp += e.exp * k * diffK; acc.gold += e.gold * k; acc.fights += k;
        }
        acc.maps.push(st.map);
      } else if (st.boss && acc.maps.length) {
        sch.before.push({ troop: st.troop, boss: st.boss, exp: Math.round(acc.exp), gold: Math.round(acc.gold), fights: +acc.fights.toFixed(1), maps: acc.maps });
        acc = { exp: 0, gold: 0, fights: 0, maps: [] };
      }
    }
    sch.rest = { exp: Math.round(acc.exp), gold: Math.round(acc.gold), fights: +acc.fights.toFixed(1), maps: acc.maps };
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
      return `${s[0].toUpperCase()} Lv${r.lvIn}→${r.lvOut} enc ${r.encFights}f ${Math.round(r.encExp)}xp/${Math.round(r.encGold)}g story ${Math.round(r.storyExp)}xp/${r.storyGold}g chest ${r.chestGold}g quest ${r.questGold}g spent ${r.spentGear}+${r.spentKit} out ${r.goldOut}g`;
    });
    console.log(`ch${row.ch} (floor ${row.floor})\n   ` + parts.join('\n   '));
  }
  console.log('\nbosses: BALANCE.md level vs the level each style has; gold before the boss vs the gear + kit it assumes');
  const by = {};
  for (const b of M.bosses) (by[b.id] = by[b.id] || {})[b.style] = b;
  for (const [id, x] of Object.entries(by)) {
    const n = x.normal, m = x.minimal, t = x.thorough;
    console.log(`  ${id.padEnd(16)} ch${String(n.ch).padEnd(3)} BAL Lv${String(n.lvBalance).padEnd(3)} min ${m.lv} norm ${n.lv} thor ${t.lv}   gold norm ${n.goldBefore} vs ${n.gearCost}+${n.kitCost}${n.short ? ' SHORT ' + n.short : ''} · min ${m.goldBefore} vs ${m.gearCost + m.kitCost}${m.short ? ' SHORT ' + m.short : ''}`);
  }
}

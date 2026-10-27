#!/usr/bin/env node
// 《彼岸燈 完全攻略》 builder — assembles the strategy guide from hand-written Markdown fragments and the live game data.
//
//   node tools/guide/build_guide.js            # → docs/guide/guide_zh.html (single self-contained page) + docs/guide/guide_zh.md
//   node tools/guide/build_guide.js --no-inline   # reference docs/guide/img/* as relative files instead of data: URIs
//   node tools/guide/build_guide.js --dump     # also write docs/guide/.data.json (everything extracted from the game)
//
// Sources (edit these, never the two outputs):
//   docs/guide/parts/*.md          入門・角色・雙結局・資料庫・圖表 (this file's sections)
//   docs/guide/chapters/chNN.md    流程攻略, one fragment per chapter 0–11, each starting with "# 第N章 …"
//                                  (headings are demoted one level when assembled under "# 流程攻略")
//   docs/guide/img/                map shots (tools/guide/shoot_maps.js), portraits (written by this script)
// Data: the game is loaded in a Node vm (tools/test/load.js) one chapter file at a time, so every map / item /
// enemy / troop / quest is attributed to the chapter that defines it. docs/BALANCE.md supplies the level, gold
// and win-rate tables. Nothing in a table or chart is typed by hand.
//
// Placeholders (one per line, anywhere in a fragment) — expanded to SVG / tables in HTML and to tables in the .md:
//   <!-- chart:ID -->   level_curve · boss_hp · gold · growth · wuxing · lanterns · route · route_chN · boss_chN
//   <!-- table:ID -->   shops:chN · chests:chN · bosses:chN · enemies:chN · charcard:CHAR · skills:CHAR · gear:CHAR
//                       combos · cats · story_skills · statuses · elements · difficulty · progression · lanterns
//                       items:use|weapon|armor|head|feet|acc|material|key · enemies:all · bosses:all · shops:all
//                       balance:levels · balance:bosses
// Spoilers: <details class="spoiler"><summary>劇透警告：…</summary> … </details> (Markdown inside is rendered).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const GUIDE = path.join(ROOT, 'docs', 'guide');
const ARGS = process.argv.slice(2);
const INLINE = !ARGS.includes('--no-inline');
const INLINE_LIMIT = 8 * 1024 * 1024;
const { load } = require(path.join(ROOT, 'tools', 'test', 'load.js'));

// =====================================================================================================================
// 1. game data
// =====================================================================================================================
function loadGame() {
  const mapDir = path.join(ROOT, 'js', 'maps');
  const chFiles = fs.readdirSync(mapDir).filter((f) => /^ch\d+_.*\.js$/.test(f))
    .sort((a, b) => parseInt(a.slice(2), 10) - parseInt(b.slice(2), 10));
  const env = load({ skip: chFiles.map((f) => 'js/maps/' + f).concat(['js/story/ending.js']) });
  if (env.errors.length) throw new Error('game failed to load: ' + env.errors.map((e) => e.file + ': ' + e.error).join('; '));
  const G = env.G;
  const own = {}, src = {}, file = {};
  const keys = () => ({
    maps: new Set(Object.keys(G.Maps.defs)), items: new Set(Object.keys(G.Data.items)), enemies: new Set(Object.keys(G.Data.enemies)),
    troops: new Set(Object.keys(G.Data.troops)), skills: new Set(Object.keys(G.Data.skills)), quests: new Set(Object.keys(G.Data.quests)),
  });
  for (const f of chFiles) {
    const ch = parseInt(f.slice(2), 10);
    const code = fs.readFileSync(path.join(mapDir, f), 'utf8');
    src[ch] = code; file[ch] = 'js/maps/' + f;
    const b = keys();
    vm.runInContext(code, env.ctx, { filename: 'js/maps/' + f });
    const a = keys();
    own[ch] = {};
    for (const k in a) own[ch][k] = [...a[k]].filter((x) => !b[k].has(x));
  }
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'story', 'ending.js'), 'utf8'), env.ctx, { filename: 'js/story/ending.js' });
  const chapters = Object.keys(own).map(Number).sort((a, b) => a - b);
  const mapCh = {};
  for (const ch of chapters) for (const m of own[ch].maps) mapCh[m] = ch;
  return { G, own, src, file, chapters, mapCh };
}

const D = loadGame();
const G = D.G;
const CHS = D.chapters;
const ELEM = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
const ELEM_ORDER = ['metal', 'wood', 'water', 'fire', 'earth'];
const BEATS = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
const BEATEN_BY = Object.fromEntries(Object.entries(BEATS).map(([a, b]) => [b, a]));
const STAT = { hp: '生命', mp: '真氣', atk: '武力', def: '防禦', mag: '法力', spd: '身法', luk: '運氣' };
const STAT_SHORT = { hp: '命', mp: '氣', atk: '武', def: '防', mag: '法', spd: '速', luk: '運' };
const SLOT = { weapon: '武器', armor: '衣裝', head: '頭飾', feet: '鞋履', acc: '佩飾' };
const PARTY = ['xinghe', 'baizhi', 'hongying', 'yungui'];
const CHAR_NAME = (id) => (G.Data.chars[id] ? G.Data.chars[id].name.replace(/^沈|^洛/, '') : id);
const CH_TITLE = (ch) => (G.Chapters && G.Chapters[ch]) || ('第' + ch + '章');
const CH_SHORT = (ch) => (ch === 0 ? '序章' : '第' + cnum(ch) + '章');
function cnum(n) {
  const d = '〇一二三四五六七八九';
  if (n <= 10) return n === 10 ? '十' : d[n];
  if (n < 20) return '十' + d[n - 10];
  return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
}
const STATUS_NAME = { poison: '中毒', seal: '封印', sleep: '沉睡', stun: '定身', trance: '幻境', regen: '再生', shield: '護盾', guard: '防禦',
  atkUp: '武力↑', atkDown: '武力↓', defUp: '防禦↑', defDown: '防禦↓', magUp: '法力↑', magDown: '法力↓', spdUp: '身法↑', spdDown: '身法↓' };
const SPECIAL_NAME = { gaugeUp: '劍意累積 ×1.5', healUp: '治療量 ×1.25', critUp: '暴擊率 +12%', mpRegen: '每回合回復 3% 真氣', autoRegen: '每回合回復 5% 生命',
  firstStrike: '戰鬥開始時先行動', expUp: '經驗 ×1.2', goldUp: '錢財 ×1.3' };
const TARGET_NAME = { enemy: '敵單體', enemies: '敵全體', ally: '我方單體', allies: '我方全體', self: '自身', deadAlly: '倒下的同伴', random: '敵隨機' };
const TYPE_NAME = { phys: '物理', mag: '術法', heal: '治療', buff: '增益', debuff: '減益', revive: '復活', cure: '解除', special: '特殊', passive: '被動' };

// ---------------------------------------------------------------- source scanning helpers
const quoted = (s) => [...s.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
function matchBracket(s, i) { // s[i] is an opening bracket; returns the index after its match (strings/comments skipped)
  const open = s[i], close = { '[': ']', '(': ')', '{': '}' }[open];
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\'' || c === '"' || c === '`') { const q = c; k++; while (k < s.length && s[k] !== q) { if (s[k] === '\\') k++; k++; } continue; }
    if (c === '/' && s[k + 1] === '/') { while (k < s.length && s[k] !== '\n') k++; continue; }
    if (c === '/' && s[k + 1] === '*') { k = s.indexOf('*/', k + 2) + 1; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) return k + 1; }
  }
  return s.length;
}
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

// ---------------------------------------------------------------- shops
function extractShops() {
  const IT = G.Data.items;
  const list = [];
  const isItem = (id) => !!IT[id];
  for (const ch of CHS) {
    const s = D.src[ch];
    const push = (title, ids, cond, o = {}) => {
      ids = ids.filter(isItem); cond = (cond || []).filter((x) => isItem(x) && !ids.includes(x));
      if (!ids.length && !cond.length) return;
      const prev = list.find((x) => x.ch === ch && x.title === title);
      if (prev) {
        for (const id of ids) if (!prev.items.includes(id)) { prev.items.push(id); prev.cond = prev.cond.filter((c) => c !== id); }
        for (const id of cond) if (!prev.items.includes(id) && !prev.cond.includes(id)) prev.cond.push(id);
        Object.assign(prev.prices, o.prices || {});
        for (const d of o.dyn || []) if (!prev.dyn.includes(d)) prev.dyn.push(d);
        return;
      }
      list.push({ ch, title, items: ids, cond, prices: o.prices || {}, dyn: o.dyn || [], line: o.line });
    };
    const resolve = (name, at) => { // const NAME = [...] | () => [...] ; plus NAME.push/.splice between definition and use
      let i = s.lastIndexOf('const ' + name + ' =', at);
      if (i < 0) i = s.indexOf('const ' + name + ' =');
      if (i < 0) return { ids: [], cond: [] };
      const b = s.indexOf('[', i);
      const e = matchBracket(s, b);
      const ids = quoted(s.slice(b, e));
      let stmtEnd = s.indexOf(';', e); if (stmtEnd < 0) stmtEnd = e;
      const cond = quoted(s.slice(e, stmtEnd));
      if (i < at) {
        const mid = s.slice(stmtEnd, at);
        for (const m of mid.matchAll(new RegExp(name + '\\.(?:push|splice)\\(([^)]*)\\)', 'g'))) cond.push(...quoted(m[1]));
      }
      return { ids, cond };
    };
    // S.shop(ARG, { title: '…' })
    for (const m of s.matchAll(/S\.shop\(/g)) {
      const a0 = m.index + m[0].length;
      let a1;
      if (s[a0] === '[') a1 = matchBracket(s, a0);
      else { a1 = a0; while (a1 < s.length && s[a1] !== ',' && s[a1] !== ')') { if ('([{'.includes(s[a1])) a1 = matchBracket(s, a1); else a1++; } }
      const arg = s.slice(a0, a1).trim();
      const tm = /^\s*,\s*\{\s*title:\s*'([^']+)'/.exec(s.slice(a1, a1 + 120));
      if (!tm) continue;
      let ids = [], cond = [];
      if (arg.startsWith('[')) ids = quoted(arg);
      else { const nm = /^([A-Za-z_$][\w$]*)/.exec(arg); if (nm) ({ ids, cond } = resolve(nm[1], m.index)); }
      const before = s.slice(Math.max(0, m.index - 90), m.index);
      const wp = /withPrice\('([a-z0-9_]+)'/.exec(before);
      push(tm[1], ids, cond, { dyn: wp ? [wp[1]] : [], line: lineOf(s, m.index) });
    }
    // shopkeeperTalk([lines], [goods], 'title')  (ch6)
    for (const m of s.matchAll(/shopkeeperTalk\(\s*\[/g)) {
      const b0 = m.index + m[0].length - 1;
      const e0 = matchBracket(s, b0);
      const rest = s.slice(e0);
      const mm = /^\s*,\s*(\[[^\]]*\])\s*,\s*'([^']+)'/.exec(rest);
      if (mm) push(mm[2], quoted(mm[1]), [], { line: lineOf(s, m.index) });
    }
    // shopAt(S, goods, 'title', { id: price })  (ch1 discounts)
    for (const m of s.matchAll(/shopAt\(S,\s*(\[[^\]]*\]|[A-Za-z_]\w*(?:\(\))?)\s*,\s*'([^']+)'\s*,\s*\{([^}]*)\}\)/g)) {
      const ids = m[1].startsWith('[') ? quoted(m[1]) : resolve(m[1].replace('()', ''), m.index).ids;
      const prices = {};
      for (const p of m[3].matchAll(/([a-z0-9_]+):\s*(\d+)/g)) prices[p[1]] = +p[2];
      push(m[2], ids, [], { prices, line: lineOf(s, m.index) });
    }
  }
  return list;
}

// ---------------------------------------------------------------- inns
function extractInns() {
  const out = [];
  for (const ch of CHS) for (const m of D.src[ch].matchAll(/S\.inn\((\d+)(?:,\s*\{\s*who:\s*'([^']*)')?/g)) out.push({ ch, price: +m[1], who: m[2] || '' });
  return out;
}

// ---------------------------------------------------------------- heart lanterns
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const LANTERN_QUEST_ALIAS = { xd_yueqin_names: 'q_ch9_names', lantern_fubo: 'q_fubo' };
function extractLanterns() {
  const out = [];
  for (const ch of CHS) {
    const seen = new Set();
    for (const m of D.src[ch].matchAll(/S\.lantern\('([a-z0-9_]+)',\s*'([^']+)'\)/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ ch, id: m[1], name: m[2], line: lineOf(D.src[ch], m.index) });
    }
  }
  const Q = G.Data.quests;
  // number them the way the chapter walkthroughs do (①…㉘ in docs/guide/chapters/chNN.md); unnumbered ones keep script order
  const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚';
  for (const l of out) {
    let q = LANTERN_QUEST_ALIAS[l.id] || Object.keys(Q).find((k) => Q[k].lantern && Q[k].name === l.name);
    if (!q) q = Object.keys(Q).find((k) => Q[k].lantern && (Q[k].name.includes(l.name) || l.name.includes(Q[k].name)));
    const frag = read(path.join(GUIDE, 'chapters', `ch${String(l.ch).padStart(2, '0')}.md`)) || '';
    const names = [l.name, q && Q[q].name].filter(Boolean);
    let best = null;
    for (const m of frag.matchAll(new RegExp(`([${CIRC}])\\s*[「『*]*(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g'))) { const v = CIRC.indexOf(m[1]); if (best == null || v < best) best = v; }
    l.fragNo = best;
  }
  out.sort((a, b) => a.ch - b.ch || ((a.fragNo == null ? 99 : a.fragNo) - (b.fragNo == null ? 99 : b.fragNo)) || a.line - b.line);
  out.forEach((l, i) => { l.no = i + 1; l.circ = CIRC[i] || String(i + 1); });
  for (const l of out) {
    let q = LANTERN_QUEST_ALIAS[l.id] || Object.keys(Q).find((k) => Q[k].lantern && Q[k].name === l.name);
    if (!q) q = Object.keys(Q).find((k) => Q[k].lantern && (Q[k].name.includes(l.name) || l.name.includes(Q[k].name)));
    l.quest = q || null;
  }
  return out;
}

// ---------------------------------------------------------------- chests
function extractChests() {
  const out = {};
  for (const ch of CHS) {
    out[ch] = [];
    for (const mid of D.own[ch].maps) {
      if (/^ending_/.test(mid)) continue;
      const d = G.Maps.defs[mid];
      let cs = d.chests;
      if (typeof cs === 'function') { try { cs = cs(G.state); } catch (e) { cs = []; } }
      (cs || []).forEach((c, i) => out[ch].push({ map: mid, mapName: d.name, n: i + 1, x: c.x, y: c.y, item: c.item, count: c.n || 1, gold: c.gold || 0,
        spirit: !!c.spirit, cond: !!c.if, script: !!c.run, id: c.id }));
    }
  }
  return out;
}

// ---------------------------------------------------------------- troops / enemies by chapter
function troopUse() {
  const byCh = {};
  for (const ch of CHS) {
    const s = D.src[ch];
    const set = new Set();
    for (const m of s.matchAll(/'([a-z0-9_]+)'/g)) if (G.Data.troops[m[1]]) set.add(m[1]);
    byCh[ch] = [...set];
  }
  return byCh;
}
function enemiesByChapter(troopsByCh) {
  const first = {};
  const addE = (id, ch) => {
    if (!G.Data.enemies[id] || first[id] != null) return;
    first[id] = ch;
    const e = G.Data.enemies[id];
    for (const sk of e.skills || []) { const s = G.Data.skills[sk.id]; if (s && s.summon) for (const x of s.summon) addE(x, ch); }
    for (const p of e.phases || []) { for (const x of p.summon || []) addE(x, ch); for (const sk of p.skills || []) { const s = G.Data.skills[sk.id]; if (s && s.summon) for (const x of s.summon) addE(x, ch); } }
  };
  for (const ch of CHS) for (const t of troopsByCh[ch]) for (const e of G.Data.troops[t].enemies) addE(e, ch);
  for (const ch of CHS) for (const e of D.own[ch].enemies) if (first[e] == null) addE(e, ch); // defined by a chapter but only spawned by script
  return first;
}

// ---------------------------------------------------------------- BALANCE.md
function parseBalance() {
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'BALANCE.md'), 'utf8');
  const tableAfter = (heading) => {
    const i = md.indexOf(heading);
    if (i < 0) return [];
    const lines = md.slice(i).split('\n');
    const rows = [];
    let started = false;
    for (const l of lines.slice(1)) {
      if (l.startsWith('|')) { started = true; rows.push(l.split('|').slice(1, -1).map((c) => c.trim())); } else if (started) break;
    }
    return rows.slice(2); // header + separator
  };
  const after = (cell) => { const p = cell.split('⇒'); return (p[1] || p[0]).replace(/\*/g, '').trim(); };
  const levels = tableAfter('### Before → after, per chapter').map((r) => {
    const lv = (c) => after(c).split('→').map((x) => parseFloat(x));
    const gold = after(r[5]).split('/').map((x) => parseInt(x.replace(/[^\d]/g, ''), 10));
    const ent = after(r[6]).split('·').map((x) => x.trim());
    const bl = r[1].split(/[–-]/).map(Number);
    return { ch: +r[0], bossLv: [bl[0], bl[1] || bl[0]], minimal: lv(r[2]), normal: lv(r[3]), thorough: lv(r[4]),
      gold: { minimal: gold[0], normal: gold[1], thorough: gold[2] }, normalEntryGold: parseInt(ent[0], 10), fieldFights: parseFloat(ent[1]) };
  });
  const resRows = (() => {
    const i = md.indexOf('| Fight | Ch | Lv |');
    const out = [];
    for (const l of md.slice(i).split('\n').slice(2)) { if (!l.startsWith('|')) break; out.push(l.split('|').slice(1, -1).map((c) => c.trim())); }
    return out.map((r) => ({ fight: r[0], ch: +r[1], lv: r[2], party: r[3], kind: r[4], win: (r[6] || '').replace(/\s*\(.*\)/, ''), ko: ((r[6] || '').match(/\(([^)]*)\)/) || [])[1] || '', rounds: r[7] }));
  })();
  const perBoss = tableAfter('### Before → after, per boss').map((r) => ({
    fight: r[0], ch: +r[1], lv: +r[2], normalLv: after(r[3]), minimalLv: after(r[4]).split('→').pop().trim(), thoroughLv: after(r[5]).split('→').pop().trim(),
    win: r[8].split('·').map((x) => after(x).replace(/[^\d%]/g, '')),
  }));
  return { levels, results: resRows, perBoss };
}

// ---------------------------------------------------------------- curated story-boss list (ids only — every number comes from data)
const BOSSES = [
  [0, 't_c0_dream_3', '大海霧魂'],
  [1, 't_c1_foreman', '工頭魂'], [1, 't_c1_moya', '墨鴉 (1-19'], [1, 't_c1_ghost_king', '水鬼王'],
  [2, 't_c2_woodcutter', '魔神仔頭'], [2, 'boss_hongying', '洛紅纓 duel'], [2, 't_c2_tiger', '虎姑婆'],
  [3, 't_c3_monkeyking', '石猴王'], [3, 't_c3_guimian', '鬼面 raid'], [3, 't_c3_feud', '頂下郊'], [3, 't_c3_river_boss', '河伯怨靈'],
  [4, 't4_ratking', '柿鼠大王'], [4, 't4_boss_wind_demon', '風魔'],
  [5, 't_c5_feast', '怨宴'],
  [6, 't_c6_plague_mass', '疫聚'], [6, 't_c6_linto_boss', '林投姐'], [6, 't_c6_moya', '墨鴉 (caught'], [6, 't_c6_netherlamp', '冥燈護法'], [6, 't_c6_yexuan_loss', '夜玄 (forced'],
  [7, 't_c7_bear', '黑熊精'], [7, 't_c7_mirror_qf', '心魔・鬼面'], [7, 't_c7_mirror_yg', '心魔・雲歸'], [7, 't_c7_shadow', '無光之影'], [7, 't_c7_jiao', '蛟'], [7, 't_c7_qingxu', '清虛真人'],
  [8, 't_c8_hundred', '潮怨・百手'], [8, 't_c8_qingfeng', '洛青鋒'],
  [9, 't_c9_greed_boss', '大肚貪鬼'], [9, 't_c9_plague_boss', '瘟鬼頭'], [9, 't_c9_fallwind', '落山風靈'], [9, 't_c9_moray_king', '潮病鰻王'],
  [10, 'boss_tide_serpent', '潮病海蛇'], [10, 't_c10_coast_boss', '大潮怨'], [10, 'boss_colossus', '太魯閣石巨靈'], [10, 't_c10_guhun', '孤魂眾'],
  [11, 't11_captain', '烏鬚船主'], [11, 't11_jailer', '鎖魂將'], [11, 't11_kun', '鯤'], [11, 't11_warden', '千年燈塔守'], [11, 't11_tongzi', '萬象童子'],
  [11, 't11_yexuan_1', '夜玄・玄冥法師'], [11, 't11_yexuan_2', '夜玄・逆潮法身'], [11, 't11_wuxiang_1', '黑潮・無相'], [11, 't11_wuxiang_2', '無相・深淵'], [11, 't11_wuxiang_3', '無相之心'],
];
const KIND_NAME = { boss: '頭目', loseOk: '劇情（輸了也能繼續）', scripted: '劇情（結果固定）', fight: '劇情戰' };

function buildBosses(BAL) {
  return BOSSES.map(([ch, troop, key]) => {
    const t = G.Data.troops[troop];
    if (!t) { console.warn('boss troop missing: ' + troop); return null; }
    const main = t.enemies.find((e) => G.Data.enemies[e] && G.Data.enemies[e].boss) || t.enemies[0];
    const res = BAL.results.find((r) => r.fight.startsWith(key)) || null;
    const per = BAL.perBoss.find((r) => r.fight.startsWith(key)) || null;
    return { ch, troop, main, e: G.Data.enemies[main], adds: t.enemies.filter((x, i) => i !== t.enemies.indexOf(main)), res, per };
  }).filter(Boolean);
}

// =====================================================================================================================
// 2. derived data
// =====================================================================================================================
const BAL = parseBalance();
const SHOPS = extractShops();
const INNS = extractInns();
const LANTERNS = extractLanterns();
const CHESTS = extractChests();
const TROOPS_BY_CH = troopUse();
const ENEMY_CH = enemiesByChapter(TROOPS_BY_CH);
const BOSS = buildBosses(BAL);
const ITEM_CH = {};
for (const ch of CHS) for (const id of D.own[ch].items) ITEM_CH[id] = ch;

// where each item can be obtained
const SOURCES = {};
const addSrc = (id, s) => { (SOURCES[id] = SOURCES[id] || []); if (!SOURCES[id].includes(s)) SOURCES[id].push(s); };
for (const sh of SHOPS) { for (const id of sh.items) addSrc(id, `${CH_SHORT(sh.ch)}・${sh.title}`); for (const id of sh.cond) addSrc(id, `${CH_SHORT(sh.ch)}・${sh.title}（限時）`); }
for (const ch of CHS) for (const c of CHESTS[ch]) if (c.item) addSrc(c.item, `${CH_SHORT(ch)}・${c.mapName}寶箱`);
for (const id in G.Data.enemies) { if (ENEMY_CH[id] == null) continue; for (const dr of G.Data.enemies[id].drops || []) addSrc(dr.item, `掉落：${G.Data.enemies[id].name}（${Math.round(dr.rate * 100)}%）`); }
// story / event gifts: any quoted mention of an item id in a chapter script (definitions and the debug-only
// "standalone start" kits excluded) means the story hands it over somewhere
const STORY_ITEMS = new Set();
for (const ch of CHS) {
  for (const line of D.src[ch].split('\n')) {
    if (/const (?:kit|gear) = \{|for \(const \[it, n\] of \[\[/.test(line)) continue;
    for (const m of line.matchAll(/'([a-z0-9_]+)'(?!\s*,\s*\{)/g)) if (G.Data.items[m[1]]) STORY_ITEMS.add(m[1]);
  }
}
for (const c of Object.values(G.Data.chars)) for (const v of Object.values(c.equip || {})) if (v) STORY_ITEMS.add(v);
const obtainable = (id) => !!(SOURCES[id] || STORY_ITEMS.has(id));

// =====================================================================================================================
// 3. formatting helpers
// =====================================================================================================================
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cell = (s) => String(s == null ? '' : s).replace(/\|/g, '｜').replace(/\n/g, ' ');
const fmtN = (n) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US'));
function mdTable(head, rows, align) {
  const al = align || head.map(() => 'l');
  const sep = al.map((a) => (a === 'r' ? '---:' : a === 'c' ? ':---:' : '---'));
  return ['| ' + head.map(cell).join(' | ') + ' |', '| ' + sep.join(' | ') + ' |', ...rows.map((r) => '| ' + r.map(cell).join(' | ') + ' |')].join('\n');
}
const elemStr = (e) => (e ? ELEM[e] || e : '—');
const statsStr = (st) => (st ? Object.entries(st).filter(([, v]) => v).map(([k, v]) => `${STAT_SHORT[k] || k}${v > 0 ? '+' : ''}${v}`).join(' ') : '');
function itemEffect(it) {
  const u = it.use;
  if (u) {
    const p = [];
    if (u.heal) p.push(`生命 +${u.heal}`);
    if (u.healPct) p.push(`生命 +${Math.round(u.healPct * 100)}%`);
    if (u.mp) p.push(`真氣 +${u.mp}`);
    if (u.mpPct) p.push(`真氣 +${Math.round(u.mpPct * 100)}%`);
    if (u.revive) p.push(`復活（${Math.round(u.revive * 100)}% 生命）`);
    if (u.cure) p.push('解除' + u.cure.map((c) => STATUS_NAME[c] || c).join('・'));
    if (u.damage) p.push(`${u.elem ? ELEM[u.elem] + '屬性' : ''}傷害 ${u.damage}`);
    if (u.status) { const st = u.status.id || u.status; p.push(`${STATUS_NAME[st] || st}${u.status.turns ? ' ' + u.status.turns + ' 回合' : ''}`); }
    if (u.buffs) p.push(u.buffs.map((b) => (STAT[b.stat] || b.stat) + (b.amt < 0 ? '↓' : '↑') + (b.turns ? ` ${b.turns} 回合` : '')).join('・'));
    if (u.gauge) p.push(`劍意 +${u.gauge}`);
    if (u.vision) p.push(`靈視約 ${Math.round(u.vision * 0.25)} 秒`);
    const where = u.battle === false ? '（僅限野外）' : u.field === false ? '（僅限戰鬥）' : '';
    const tg = u.target ? TARGET_NAME[u.target] || u.target : '';
    return (tg ? tg + '：' : '') + (p.join('，') || (u.fieldRun ? '特殊' : '—')) + where;
  }
  const p = [];
  const s = statsStr(it.stats);
  if (s) p.push(s);
  if (it.elem) p.push(`武器屬性：${ELEM[it.elem]}`);
  if (it.resist && it.resist.length) p.push('抗' + it.resist.map((e) => ELEM[e] || STATUS_NAME[e] || e).join('・'));
  if (it.immune && it.immune.length) p.push('免疫' + it.immune.map((e) => STATUS_NAME[e] || e).join('・'));
  for (const sp of [].concat(it.special || [])) p.push(SPECIAL_NAME[sp] || sp);
  if (it.pair && it.pair.stats) p.push(`與${CHAR_NAME(it.pair.with)}同隊：${statsStr(it.pair.stats)}${it.pair.both ? '（雙方）' : ''}`);
  return p.join('；') || '—';
}
const whoStr = (it) => (it.who && it.who.length ? it.who.map(CHAR_NAME).join('・') : '全員');
function skillEffect(s) {
  const p = [];
  if (s.type) p.push(TYPE_NAME[s.type] || s.type);
  if (s.elem) p.push(ELEM[s.elem] + '屬性');
  if (s.target) p.push(TARGET_NAME[s.target] || s.target);
  if (s.power && ['phys', 'mag', 'heal'].includes(s.type)) p.push(`威力 ${s.power}${s.hits > 1 ? ' ×' + s.hits + ' 段' : ''}`);
  if (s.status) p.push(`${STATUS_NAME[s.status.id] || s.status.id}${s.status.chance != null && s.status.chance < 1 ? ' ' + Math.round(s.status.chance * 100) + '%' : ''}${s.status.turns ? ' ' + s.status.turns + ' 回合' : ''}`);
  if (s.buffs) p.push(s.buffs.map((b) => (b.stat ? (STAT[b.stat] || b.stat) + (b.amt < 0 ? '↓' : '↑') : STATUS_NAME[b.id] || b.id) + (b.turns ? ' ' + b.turns + ' 回合' : '')).join('・'));
  if (s.revive) p.push('可復活');
  if (s.type === 'revive') p.push(`復活（${Math.round((s.power || 0.5) * 100)}% 生命）`);
  if (s.cure) p.push('解除' + s.cure.map((c) => STATUS_NAME[c] || c).join('・'));
  if (s.drain) p.push(`吸血 ${Math.round(s.drain * 100)}%`);
  if (s.shield) p.push('護盾');
  if (s.delay) p.push(`行動延遲 ×${s.delay}`);
  if (s.gaugeUp) p.push(`劍意 +${s.gaugeUp}`);
  if (s.mpHeal) p.push(`真氣 +${s.mpHeal}`);
  return p.join('，');
}
function effWeak(e) {
  const w = new Set(e.weak || []);
  if (e.elem && BEATEN_BY[e.elem]) w.add(BEATEN_BY[e.elem]);
  for (const r of e.resist || []) w.delete(r);
  return [...w];
}
const weakStr = (e) => effWeak(e).map((x) => ELEM[x]).join('・') || '—';
const resistStr = (e) => (e.resist || []).map((x) => ELEM[x] || x).join('・') || '—';
function enemySkills(e) {
  const ids = new Set((e.skills || []).map((s) => s.id));
  for (const p of e.phases || []) for (const s of p.skills || []) ids.add(s.id);
  return [...ids].filter((id) => G.Data.skills[id]).map((id) => {
    const s = G.Data.skills[id];
    return s.name + (s.elem ? `（${ELEM[s.elem]}）` : '');
  });
}

// =====================================================================================================================
// 4. tables (Markdown text; converted to HTML by the same renderer as the prose)
// =====================================================================================================================
function itemRow(id) {
  const it = G.Data.items[id];
  return [it.name, it.price ? fmtN(it.price) : '—', itemEffect(it)];
}
const TABLES = {};
TABLES.shops = (arg) => {
  const list = arg === 'all' ? SHOPS : SHOPS.filter((s) => s.ch === +arg.replace('ch', ''));
  if (!list.length) return '（本章沒有一般商店。）';
  return list.map((sh) => {
    const rows = sh.items.concat(sh.cond).map((id) => {
      const it = G.Data.items[id];
      const price = sh.prices[id] != null ? `${fmtN(sh.prices[id])}（特價，原價 ${fmtN(it.price)}）` : sh.dyn.includes(id) ? `${fmtN(it.price)}（依劇情變動）` : fmtN(it.price);
      const kind = it.type === 'use' ? '道具' : SLOT[it.type] || '其他';
      return [it.name + (sh.cond.includes(id) ? '＊' : ''), kind, price, it.type === 'use' ? itemEffect(it) : itemEffect(it) + (it.who ? `（${whoStr(it)}）` : '')];
    });
    const note = sh.cond.length ? '\n\n＊ 只在特定時段或劇情進度後上架。' : '';
    return `**${arg === 'all' ? CH_SHORT(sh.ch) + '・' : ''}${sh.title}**\n\n` + mdTable(['商品', '類別', '價格（文）', '效果／能力'], rows, ['l', 'l', 'r', 'l']) + note;
  }).join('\n\n');
};
TABLES.chests = (arg) => {
  const ch = +arg.replace('ch', '');
  const list = CHESTS[ch] || [];
  if (!list.length) return '（本章沒有寶箱。）';
  const rows = list.map((c) => {
    const what = [c.item ? `${G.Data.items[c.item] ? G.Data.items[c.item].name : c.item}${c.count > 1 ? ' ×' + c.count : ''}` : '', c.gold ? `${fmtN(c.gold)} 文` : ''].filter(Boolean).join('＋') || '（劇情）';
    const note = [c.spirit ? '靈視才看得見' : '', c.cond ? '依劇情出現' : '', c.script ? '開啟時有事件' : ''].filter(Boolean).join('、');
    return [c.mapName, c.n, `(${c.x}, ${c.y})`, what, note || ''];
  });
  return mdTable(['地圖', '#', '座標 (x, y)', '內容', '備註'], rows, ['l', 'r', 'l', 'l', 'l']) +
    '\n\n座標以地圖左上角為 (0, 0)，向右為 x、向下為 y；「#」對應地圖圖片上的寶箱編號。';
};
function bossRows(list) {
  return list.map((b) => {
    const e = b.e;
    const phases = (e.phases || []).map((p) => `${Math.round(p.at * 100)}%${p.heal ? ' 回復' + Math.round(p.heal * 100) + '%' : ''}${p.summon ? ' 召喚' : ''}${p.phase ? ' 變身' : ''}`).join('、');
    const adds = b.adds.map((x) => G.Data.enemies[x] && G.Data.enemies[x].name).filter(Boolean);
    return [e.name, e.lv, fmtN(e.hp), elemStr(e.elem), weakStr(e), resistStr(e), enemySkills(e).join('、'), (phases || '—') + (e.endAt ? `；剩 ${Math.round(e.endAt * 100)}% 時劇情結束` : ''),
      adds.length ? [...new Set(adds)].map((n) => n + '×' + adds.filter((x) => x === n).length).join('、') : '—',
      `${fmtN(e.exp)} / ${fmtN(e.gold)}`, b.res ? (KIND_NAME[b.res.kind] || b.res.kind) : '—'];
  });
}
const BOSS_HEAD = ['頭目', 'Lv', 'HP', '屬性', '弱點 ×1.5', '抗性 ×0.5', '招式', '階段', '同場敵人', '經驗 / 錢', '類型'];
TABLES.bosses = (arg) => {
  const list = arg === 'all' ? BOSS : BOSS.filter((b) => b.ch === +arg.replace('ch', ''));
  if (!list.length) return '（本章沒有頭目戰。）';
  if (arg === 'all') {
    return CHS.filter((ch) => BOSS.some((b) => b.ch === ch)).map((ch) => `**${CH_TITLE(ch)}**\n\n` + mdTable(BOSS_HEAD, bossRows(BOSS.filter((b) => b.ch === ch)), ['l', 'r', 'r', 'c', 'l', 'l', 'l', 'l', 'l', 'r', 'l'])).join('\n\n');
  }
  return mdTable(BOSS_HEAD, bossRows(list), ['l', 'r', 'r', 'c', 'l', 'l', 'l', 'l', 'l', 'r', 'l']);
};
function enemyRows(ids) {
  return ids.map((id) => {
    const e = G.Data.enemies[id];
    const drops = (e.drops || []).map((d) => `${G.Data.items[d.item] ? G.Data.items[d.item].name : d.item} ${Math.round(d.rate * 100)}%`).join('、');
    return [e.name, e.lv, fmtN(e.hp), elemStr(e.elem), weakStr(e), resistStr(e), fmtN(e.exp), fmtN(e.gold), drops || '—'];
  });
}
const ENEMY_HEAD = ['敵人', 'Lv', 'HP', '屬性', '弱點 ×1.5', '抗性 ×0.5', '經驗', '錢', '掉落'];
const isBossEnemy = (id) => BOSS.some((b) => b.main === id) || (G.Data.enemies[id] && G.Data.enemies[id].boss);
TABLES.enemies = (arg) => {
  const sortE = (a, b) => (G.Data.enemies[a].lv - G.Data.enemies[b].lv) || G.Data.enemies[a].name.localeCompare(G.Data.enemies[b].name, 'zh-Hant');
  const ids = (ch) => Object.keys(ENEMY_CH).filter((id) => ENEMY_CH[id] === ch && !isBossEnemy(id) && G.Data.enemies[id].hp > 1).sort(sortE);
  if (arg === 'all') return CHS.filter((ch) => ids(ch).length).map((ch) => `**${CH_TITLE(ch)}**\n\n` + mdTable(ENEMY_HEAD, enemyRows(ids(ch)), ['l', 'r', 'r', 'c', 'l', 'l', 'r', 'r', 'l'])).join('\n\n');
  const list = ids(+arg.replace('ch', ''));
  return list.length ? mdTable(ENEMY_HEAD, enemyRows(list), ['l', 'r', 'r', 'c', 'l', 'l', 'r', 'r', 'l']) : '（本章沒有一般敵人。）';
};
TABLES.items = (type) => {
  const ids = Object.keys(G.Data.items).filter((id) => G.Data.items[id].type === type && !/^qa_|^test_/.test(id) && (ITEM_CH[id] != null || G.Data.items[id].ch != null) && obtainable(id));
  const chOf = (id) => (ITEM_CH[id] != null ? ITEM_CH[id] : G.Data.items[id].ch);
  ids.sort((a, b) => chOf(a) - chOf(b) || (G.Data.items[a].price || 0) - (G.Data.items[b].price || 0));
  const equip = ['weapon', 'armor', 'head', 'feet', 'acc'].includes(type);
  const rows = ids.map((id) => {
    const it = G.Data.items[id];
    const src = (SOURCES[id] || []).slice(0, 3).join('；') + ((SOURCES[id] || []).length > 3 ? '…' : '');
    if (type === 'key') return [it.name, CH_SHORT(chOf(id)), it.desc || ''];
    if (type === 'material') return [it.name, CH_SHORT(chOf(id)), it.price ? fmtN(Math.floor(it.price / 2)) : '—', it.desc || ''];
    return equip ? [it.name, CH_SHORT(chOf(id)), whoStr(it), itemEffect(it), it.price ? fmtN(it.price) : '—', src || '劇情／事件']
      : [it.name, CH_SHORT(chOf(id)), itemEffect(it), it.price ? fmtN(it.price) : '—', src || '劇情／事件'];
  });
  if (type === 'key') return mdTable(['名稱', '章', '說明'], rows);
  if (type === 'material') return mdTable(['名稱', '章', '賣價（文）', '說明'], rows, ['l', 'l', 'r', 'l']);
  return equip ? mdTable(['名稱', '章', '可裝備', '能力', '價格', '取得'], rows, ['l', 'l', 'l', 'l', 'r', 'l'])
    : mdTable(['名稱', '章', '效果', '價格', '取得'], rows, ['l', 'l', 'l', 'r', 'l']);
};
TABLES.skills = (cid) => {
  const c = G.Data.chars[cid];
  const rows = c.learn.map((l) => {
    const s = G.Data.skills[l.skill];
    if (!s) return null;
    const when = l.story ? `劇情（${CH_SHORT(l.ch)}）` : 'Lv ' + l.lv;
    return [when, s.name, s.mp, skillEffect(s), s.desc || ''];
  }).filter(Boolean);
  // story skills granted by S.learn but not listed in learn[]
  for (const ch of CHS) for (const m of D.src[ch].matchAll(new RegExp(`S\\.learn\\('${cid}',\\s*'([a-z0-9_]+)'\\)`, 'g'))) {
    if (c.learn.some((l) => l.skill === m[1])) continue;
    const s = G.Data.skills[m[1]];
    if (s) rows.push([`劇情（${CH_SHORT(ch)}）`, s.name, s.mp, skillEffect(s), s.desc || '']);
  }
  const u = G.Data.skills[c.ultimate];
  if (u) rows.push(['劍意 100', '絕技・' + u.name, '—', skillEffect(u), u.desc || '']);
  return mdTable(['習得', '仙術', '真氣', '效果', '說明'], rows, ['l', 'l', 'r', 'l', 'l']);
};
TABLES.charcard = (cid) => {
  const c = G.Data.chars[cid];
  const at = (lv) => Object.fromEntries(Object.keys(STAT).map((k) => [k, Math.round(c.base[k] + c.growth[k] * (lv - 1))]));
  const rows = Object.keys(STAT).map((k) => [STAT[k], c.base[k], c.growth[k], at(20)[k], at(44)[k]]);
  const eq = Object.entries(c.equip).filter(([, v]) => v).map(([k, v]) => `${SLOT[k]}：${G.Data.items[v] ? G.Data.items[v].name : v}`).join('、');
  return `![${c.name}](img/portrait_${cid}.webp)\n\n**${c.name}**　${c.title}　屬性：${ELEM[c.elem]}　武器：${{ sword: '劍', flute: '笛', spear: '槍', talisman: '符扇' }[c.weapon] || c.weapon}\n\n${c.desc}\n\n` +
    mdTable(['能力', 'Lv1', '每級成長', 'Lv20', 'Lv44'], rows, ['l', 'r', 'r', 'r', 'r']) + `\n\n初始裝備：${eq}`;
};
function scoreItem(cid, it) {
  const W = {
    xinghe: { atk: 1, mag: 0.45, def: 0.8, spd: 0.9, hp: 0.06, mp: 0.15, luk: 0.3 },
    baizhi: { atk: 0.1, mag: 1, def: 0.8, spd: 0.9, hp: 0.06, mp: 0.3, luk: 0.3 },
    hongying: { atk: 1, mag: 0.1, def: 0.8, spd: 0.9, hp: 0.06, mp: 0.1, luk: 0.3 },
    yungui: { atk: 0.15, mag: 1, def: 0.8, spd: 0.9, hp: 0.06, mp: 0.3, luk: 0.3 },
  }[cid];
  let s = 0;
  for (const k in it.stats || {}) s += (W[k] || 0) * it.stats[k];
  if (it.pair && it.pair.stats) for (const k in it.pair.stats) s += 0.5 * (W[k] || 0) * it.pair.stats[k];
  s += [].concat(it.special || []).length * 3 + (it.immune || []).length * 1 + (it.resist || []).length * 1;
  return s;
}
TABLES.gear = (cid) => {
  const rows = [];
  const canUse = (it) => it && (!it.who || it.who.includes(cid)) && SLOT[it.type];
  for (const ch of CHS.filter((c) => c >= 1)) {
    const pool = new Set();
    for (const sh of SHOPS.filter((s) => s.ch <= ch)) for (const id of sh.items.concat(sh.cond)) pool.add(id);
    const best = {};
    for (const id of pool) {
      const it = G.Data.items[id];
      if (!canUse(it)) continue;
      const sc = scoreItem(cid, it);
      if (!best[it.type] || sc > best[it.type].sc) best[it.type] = { id, sc };
    }
    const inParty = (G.Data.progression.find((p) => p.ch === ch) || { party: [] }).party.includes(cid);
    if (!inParty) continue;
    rows.push([CH_SHORT(ch), ...Object.keys(SLOT).map((s) => (best[s] ? `${G.Data.items[best[s].id].name}（${statsStr(G.Data.items[best[s].id].stats)}，${fmtN(G.Data.items[best[s].id].price)}）` : '—'))]);
  }
  return mdTable(['章', ...Object.values(SLOT)], rows);
};
TABLES.exclusive = (cid) => {
  const ids = Object.keys(G.Data.items).filter((id) => { const it = G.Data.items[id]; return it.who && it.who.length === 1 && it.who[0] === cid && SLOT[it.type] && (ITEM_CH[id] != null || it.ch != null) && obtainable(id); });
  const chOf = (id) => (ITEM_CH[id] != null ? ITEM_CH[id] : G.Data.items[id].ch);
  ids.sort((a, b) => chOf(a) - chOf(b) || (G.Data.items[a].price || 0) - (G.Data.items[b].price || 0));
  return mdTable(['章', '裝備', '欄位', '能力', '價格', '取得'], ids.map((id) => {
    const it = G.Data.items[id];
    return [CH_SHORT(chOf(id)), it.name, SLOT[it.type], itemEffect(it), it.price ? fmtN(it.price) : '—', (SOURCES[id] || []).join('；') || (Object.values(G.Data.chars).some((c) => Object.values(c.equip || {}).includes(id)) ? '初始裝備' : '劇情／事件')];
  }), ['l', 'l', 'l', 'l', 'r', 'l']);
};
TABLES.combos = () => {
  const rows = Object.entries(G.Data.skills).filter(([, s]) => s.combo).map(([, s]) => [s.name, s.combo.map(CHAR_NAME).join('＋'), s.mp + '（每人）', s.comboLv ? 'Lv ' + s.comboLv : '—', skillEffect(s), s.desc || '']);
  return mdTable(['合擊', '成員', '真氣', '需要等級', '效果', '說明'], rows);
};
TABLES.cats = (arg) => {
  const s = G.Data.skills[arg || 'bz_maomi'];
  const tot = s.outcomes.reduce((a, o) => a + (o.w || 1), 0);
  const catName = { yuyuan: '芋圓', mochi: '麻糬', both: '芋圓＋麻糬' };
  const rows = s.outcomes.map((o) => { const k = G.Data.skills[o.skill]; return [catName[o.cat] || o.cat, k.name, `${Math.round((o.w / tot) * 1000) / 10}%`, skillEffect(k), o.text]; });
  return mdTable(['出場', '招式', '機率', '效果', '戰鬥訊息'], rows, ['l', 'l', 'r', 'l', 'l']);
};
TABLES.exp = () => {
  const rows = [];
  let tot = 0;
  const cum = {};
  for (let lv = 1; lv < 50; lv++) { cum[lv] = tot; tot += G.Party.expToNext(lv); }
  cum[50] = tot;
  for (let lv = 5; lv <= 50; lv += 5) rows.push(['Lv ' + lv, lv < 50 ? fmtN(G.Party.expToNext(lv)) : '（上限）', fmtN(cum[lv])]);
  return mdTable(['等級', '升下一級所需經驗', '從 Lv1 累計'], rows, ['l', 'r', 'r']);
};
TABLES.statuses = () => mdTable(['狀態', '效果'], [
  ['中毒', '每回合開始時損失最大生命的 6%。'],
  ['再生', '每回合開始時回復最大生命的 8%。'],
  ['沉睡', '無法行動；受到任何傷害就會醒來。'],
  ['定身', '無法行動，直到回合數用完。'],
  ['封印', '無法使用仙術（敵人只剩物理招式）。'],
  ['幻境', '法力 ×1.25、暴擊率 +30%；但出手時有 15% 機率打錯對象。'],
  ['武力／防禦／法力／身法 ↑↓', '該能力 ×1.3（↑）或 ×0.7（↓）。相反的效果互相抵銷。'],
  ['護盾', '吸收一定量的傷害，最多 4 回合。'],
  ['防禦', '選「防禦」後到自己下一次行動前，受到的傷害減半；下一次輪到你也會提早 25%。'],
]);
TABLES.elements = () => {
  const rows = ELEM_ORDER.map((e) => [ELEM[e], ELEM[BEATS[e]] + '（×1.5）', ELEM[BEATEN_BY[e]] + '（×0.7）', PARTY.filter((c) => G.Data.chars[c].elem === e).map(CHAR_NAME).join('、') || '—']);
  return mdTable(['屬性', '克（攻擊對方時傷害）', '被克（攻擊對方時傷害）', '隊員'], rows);
};
TABLES.difficulty = () => mdTable(['項目', '劇情', '普通', '困難'], [
  ['敵人生命', '×0.8', '×1', '×1.3'], ['敵人造成的傷害', '×0.6', '×1', '×1.25'], ['戰鬥經驗', '×1.2', '×1', '×0.9'],
], ['l', 'r', 'r', 'r']);
TABLES.progression = () => mdTable(['章', '標題', '區域等級', '隊伍', '頭目設計等級'], G.Data.progression.map((p) => {
  const b = BAL.levels.find((l) => l.ch === p.ch);
  return [CH_SHORT(p.ch), CH_TITLE(p.ch).replace(/^\S+　/, ''), p.lv[0] === p.lv[1] ? String(p.lv[0]) : `${p.lv[0]}–${p.lv[1]}`, p.party.map(CHAR_NAME).join('、'), b ? (b.bossLv[0] === b.bossLv[1] ? b.bossLv[0] : b.bossLv.join('–')) : '—'];
}));
TABLES.lanterns = () => {
  const Q = G.Data.quests;
  const rows = LANTERNS.map((l) => {
    const q = l.quest && Q[l.quest];
    return [l.circ, CH_SHORT(l.ch), l.name, q ? q.name : '（主線劇情）', q ? (q.stages || []).join(' → ') : '—'];
  });
  return mdTable(['#', '章', '心燈', '任務', '任務步驟（遊戲內任務日誌）'], rows, ['r', 'l', 'l', 'l', 'l']);
};
TABLES.story_skills = () => {
  const rows = [];
  for (const ch of CHS) for (const m of D.src[ch].matchAll(/S\.learn\('([a-z]+)',\s*'([a-z0-9_]+)'\)/g)) {
    const s = G.Data.skills[m[2]];
    if (s && !rows.some((r) => r[2] === s.name)) rows.push([CH_SHORT(ch), CHAR_NAME(m[1]), s.name, s.mp, skillEffect(s)]);
  }
  for (const cid of PARTY) for (const l of G.Data.chars[cid].learn) if (l.story) {
    const s = G.Data.skills[l.skill];
    if (s && !rows.some((r) => r[2] === s.name)) rows.push([CH_SHORT(l.ch), CHAR_NAME(cid), s.name, s.mp, skillEffect(s)]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'));
  return mdTable(['章', '角色', '仙術', '真氣', '效果'], rows);
};
TABLES.balance = (arg) => {
  if (arg === 'levels') {
    return mdTable(['章', '頭目等級', '速攻玩家 Lv（進→出）', '一般玩家 Lv（進→出）', '全收集玩家 Lv（進→出）', '本章收入（速攻／一般／全收集）'],
      BAL.levels.map((l) => [CH_SHORT(l.ch), l.bossLv[0] === l.bossLv[1] ? l.bossLv[0] : l.bossLv.join('–'), l.minimal.join(' → '), l.normal.join(' → '), l.thorough.join(' → '),
        [l.gold.minimal, l.gold.normal, l.gold.thorough].map(fmtN).join(' / ')]), ['l', 'r', 'r', 'r', 'r', 'r']);
  }
  return mdTable(['頭目戰', '章', '設計等級', '首戰勝率', '有人倒下', '平均回合'],
    BAL.results.map((r) => [r.fight.replace(/\s*\(.*?\)/g, ''), CH_SHORT(r.ch), r.lv, r.win, r.ko, r.rounds]), ['l', 'l', 'r', 'r', 'r', 'r']);
};
function expandTable(id) {
  const [k, ...rest] = id.split(':');
  const arg = rest.join(':');
  if (!TABLES[k]) { console.warn('unknown table placeholder: ' + id); return `（未知的表格：${id}）`; }
  return TABLES[k](arg);
}

// =====================================================================================================================
// 5. charts (inline SVG; colours come from CSS custom properties so they follow light / dark)
// =====================================================================================================================
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
const CHAR_COLOR = { xinghe: 'var(--s1)', baizhi: 'var(--s2)', hongying: 'var(--s3)', yungui: 'var(--s4)' };
const ELEM_COLOR = { metal: 'var(--e-metal)', wood: 'var(--e-wood)', water: 'var(--e-water)', fire: 'var(--e-fire)', earth: 'var(--e-earth)' };
const r1 = (x) => Math.round(x * 10) / 10;
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; }
const kfmt = (v) => (v >= 10000 ? (v / 1000) + 'K' : v >= 1000 ? r1(v / 1000) + 'K' : String(v));
function figure(id, title, sub, svg, tableMd) {
  return { id, title, sub, svg, tableMd };
}
function svgOpen(w, h, label) { return `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`; }
function yAxis(x0, x1, y0, y1, max, ticks, fmt = kfmt) {
  let s = '';
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i, y = y1 - (y1 - y0) * (i / ticks);
    s += `<line class="grid" x1="${x0}" x2="${x1}" y1="${r1(y)}" y2="${r1(y)}"/><text class="tick" x="${x0 - 6}" y="${r1(y + 4)}" text-anchor="end">${fmt(r1(v))}</text>`;
  }
  return s + `<line class="axis" x1="${x0}" x2="${x1}" y1="${y1}" y2="${y1}"/>`;
}
function legend(items, x, y) {
  let s = '', cx = x;
  for (const [label, color, kind] of items) {
    s += kind === 'line' ? `<line x1="${cx}" x2="${cx + 18}" y1="${y - 4}" y2="${y - 4}" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`
      : `<rect x="${cx}" y="${y - 10}" width="12" height="12" rx="3" fill="${color}"/>`;
    s += `<text class="lab" x="${cx + (kind === 'line' ? 24 : 17)}" y="${y}">${esc(label)}</text>`;
    cx += (kind === 'line' ? 30 : 22) + label.length * 13 + 14;
  }
  return s;
}

function chartLevelCurve() {
  const L = BAL.levels;
  const W = 760, H = 380, x0 = 56, x1 = W - 90, y0 = 46, y1 = H - 44;
  const maxLv = niceMax(Math.max(...L.map((l) => Math.max(l.thorough[1], l.bossLv[1]))) + 2);
  const chs = L.map((l) => l.ch);
  const X = (ch) => x0 + ((ch - chs[0]) / (chs[chs.length - 1] - chs[0])) * (x1 - x0 - 30) + 15;
  const Y = (v) => y1 - (v / maxLv) * (y1 - y0);
  let s = svgOpen(W, H, '各章結束時的等級：速攻、一般、全收集玩家') + yAxis(x0, x1, y0, y1, maxLv, 5, (v) => 'Lv' + v);
  for (const l of L) {
    s += `<text class="tick" x="${X(l.ch)}" y="${y1 + 18}" text-anchor="middle">${l.ch}</text>`;
    s += `<rect class="band" x="${X(l.ch) - 7}" y="${r1(Y(l.bossLv[1] + 0.5))}" width="14" height="${r1(Y(l.bossLv[0] - 0.5) - Y(l.bossLv[1] + 0.5))}" rx="3"><title>${CH_SHORT(l.ch)} 頭目設計等級 ${l.bossLv.join('–')}</title></rect>`;
  }
  s += `<text class="tick" x="${(x0 + x1) / 2}" y="${H - 8}" text-anchor="middle">章</text>`;
  const styles = [['minimal', '速攻（不打野怪）', SERIES[0]], ['normal', '一般玩家', SERIES[1]], ['thorough', '全收集', SERIES[2]]];
  for (const [k, label, col] of styles) {
    const pts = L.map((l) => [X(l.ch), Y(l[k][1])]);
    s += `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => p.map(r1).join(',')).join(' ')}"/>`;
    L.forEach((l, i) => { s += `<circle cx="${r1(pts[i][0])}" cy="${r1(pts[i][1])}" r="4" fill="${col}" stroke="var(--surface)" stroke-width="2"><title>${CH_SHORT(l.ch)} 結束時 ${label}：Lv ${l[k][1]}</title></circle>`; });
    const last = pts[pts.length - 1];
    s += `<text class="lab" x="${r1(last[0] + 9)}" y="${r1(last[1] + 4 + (k === 'minimal' ? 8 : k === 'thorough' ? -6 : 0))}">${esc(label.replace(/（.*）/, ''))}</text>`;
  }
  s += legend([...styles.map(([, l, c]) => [l, c, 'line']), ['頭目設計等級', 'var(--band)', 'rect']], x0, 22) + '</svg>';
  const tableMd = TABLES.balance('levels');
  return figure('level_curve', '推薦等級曲線', '各章結束時的等級（docs/BALANCE.md「Progression & economy」模擬：速攻＝逃過所有野戰、一般＝打路上遇到的怪並做一半心燈、全收集＝每隻怪約 1.5 次＋所有支線）；灰色直條是該章頭目的設計等級。等級的小數代表往下一級的進度（5.7 ＝ Lv5、已走完七成）。', s, tableMd);
}

function chartBossHp(list, id, title) {
  const bs = list.filter((b) => b.e && b.e.hp < 900000 && (!b.res || b.res.kind === 'boss'));
  const W = 760, rowH = 22, x0 = 196, x1 = W - 70, y0 = 30;
  const H = y0 + bs.length * rowH + 30;
  const max = niceMax(Math.max(...bs.map((b) => b.e.hp)));
  const X = (v) => x0 + (v / max) * (x1 - x0);
  let s = svgOpen(W, H, title);
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; s += `<line class="grid" x1="${r1(X(v))}" x2="${r1(X(v))}" y1="${y0 - 6}" y2="${H - 26}"/><text class="tick" x="${r1(X(v))}" y="${H - 10}" text-anchor="middle">${kfmt(v)}</text>`; }
  bs.forEach((b, i) => {
    const y = y0 + i * rowH, w = Math.max(3, X(b.e.hp) - x0);
    s += `<text class="lab" x="${x0 - 8}" y="${y + 13}" text-anchor="end">${esc(b.e.name)}　Lv${b.e.lv}</text>`;
    s += `<path d="M${x0},${y + 3} h${r1(w - 4)} a4,4 0 0 1 4,4 v6 a4,4 0 0 1 -4,4 h${r1(-(w - 4))} z" fill="${b.ch % 2 ? 'var(--s1)' : 'var(--s1b)'}"><title>${CH_SHORT(b.ch)}・${esc(b.e.name)}：HP ${fmtN(b.e.hp)}，Lv ${b.e.lv}</title></path>`;
    s += `<text class="val" x="${r1(x0 + w + 6)}" y="${y + 13}">${fmtN(b.e.hp)}</text>`;
  });
  s += '</svg>';
  const tableMd = mdTable(['章', '頭目', 'Lv', 'HP'], bs.map((b) => [CH_SHORT(b.ch), b.e.name, b.e.lv, fmtN(b.e.hp)]), ['l', 'l', 'r', 'r']);
  return figure(id, title, '普通難度的最大生命（劇情難度 ×0.8、困難 ×1.3）。深淺交替區分章節；同場的小怪與召喚物不計。', s, tableMd);
}

function chartGold() {
  const L = BAL.levels;
  const W = 760, H = 360, x0 = 60, x1 = W - 20, y0 = 46, y1 = H - 44;
  const max = niceMax(Math.max(...L.map((l) => l.gold.thorough)));
  const band = (x1 - x0) / L.length, bw = Math.min(16, (band - 14) / 3);
  const Y = (v) => y1 - (v / max) * (y1 - y0);
  let s = svgOpen(W, H, '各章收入（文）') + yAxis(x0, x1, y0, y1, max, 5);
  const keys = [['minimal', '速攻', SERIES[0]], ['normal', '一般', SERIES[1]], ['thorough', '全收集', SERIES[2]]];
  L.forEach((l, i) => {
    const cx = x0 + band * (i + 0.5);
    keys.forEach(([k, label, col], j) => {
      const v = l.gold[k], x = cx + (j - 1) * (bw + 2) - bw / 2, y = Y(v), h = y1 - y;
      s += `<path d="M${r1(x)},${y1} v${r1(-(h - 4))} a4,4 0 0 1 4,-4 h${r1(bw - 8)} a4,4 0 0 1 4,4 v${r1(h - 4)} z" fill="${col}"><title>${CH_SHORT(l.ch)} ${label}：${fmtN(v)} 文</title></path>`;
    });
    s += `<text class="tick" x="${r1(cx)}" y="${y1 + 18}" text-anchor="middle">${l.ch}</text>`;
  });
  s += `<text class="tick" x="${(x0 + x1) / 2}" y="${H - 8}" text-anchor="middle">章</text>` + legend(keys.map(([, l, c]) => [l, c, 'rect']), x0, 22) + '</svg>';
  const tableMd = mdTable(['章', '速攻', '一般', '全收集', '一般玩家進入本章時的存款', '一般玩家的野戰場數'],
    L.map((l) => [CH_SHORT(l.ch), fmtN(l.gold.minimal), fmtN(l.gold.normal), fmtN(l.gold.thorough), fmtN(l.normalEntryGold), l.fieldFights]), ['l', 'r', 'r', 'r', 'r', 'r']);
  return figure('gold', '各章收入', '每章賺到的錢（野戰＋劇情戰＋寶箱＋任務），依 docs/BALANCE.md 的經濟模擬。', s, tableMd);
}

function chartGrowth() {
  const stats = ['hp', 'mp', 'atk', 'def', 'mag', 'spd'];
  const LV = 50;
  const pw = 236, ph = 170, gap = 20, cols = 3;
  const W = cols * pw + (cols - 1) * gap + 20, H = 44 + 2 * (ph + 34);
  let s = svgOpen(W, H, '角色能力成長曲線');
  s += legend(PARTY.map((c) => [CHAR_NAME(c), CHAR_COLOR[c], 'line']), 10, 20);
  stats.forEach((k, i) => {
    const ox = 10 + (i % cols) * (pw + gap), oy = 44 + Math.floor(i / cols) * (ph + 34);
    const x0 = ox + 38, x1 = ox + pw - 34, y0 = oy + 22, y1 = oy + ph;
    const val = (c, lv) => G.Data.chars[c].base[k] + G.Data.chars[c].growth[k] * (lv - 1);
    const max = niceMax(Math.max(...PARTY.map((c) => val(c, LV))));
    s += `<text class="ttl" x="${ox}" y="${oy + 10}">${STAT[k]}</text>` + yAxis(x0, x1, y0, y1, max, 3);
    for (const lv of [1, 25, 50]) s += `<text class="tick" x="${r1(x0 + ((lv - 1) / (LV - 1)) * (x1 - x0))}" y="${y1 + 15}" text-anchor="middle">${lv}</text>`;
    const ends = [];
    for (const c of PARTY) {
      const yA = y1 - (val(c, 1) / max) * (y1 - y0), yB = y1 - (val(c, LV) / max) * (y1 - y0);
      s += `<line x1="${x0}" y1="${r1(yA)}" x2="${x1}" y2="${r1(yB)}" stroke="${CHAR_COLOR[c]}" stroke-width="2" stroke-linecap="round"><title>${CHAR_NAME(c)} ${STAT[k]}：Lv1 ${Math.round(val(c, 1))} → Lv${LV} ${Math.round(val(c, LV))}（每級 +${G.Data.chars[c].growth[k]}）</title></line>`;
      ends.push({ c, y: yB, v: Math.round(val(c, LV)) });
    }
    ends.sort((a, b) => a.y - b.y);
    for (let j = 1; j < ends.length; j++) if (ends[j].y - ends[j - 1].y < 11) ends[j].y = ends[j - 1].y + 11;
    for (const e of ends) s += `<text class="val" x="${x1 + 4}" y="${r1(e.y + 4)}">${e.v}</text>`;
  });
  s += '</svg>';
  const rows = [];
  for (const c of PARTY) for (const lv of [1, 10, 20, 30, 40, 50]) rows.push([CHAR_NAME(c), lv, ...stats.map((k) => Math.round(G.Data.chars[c].base[k] + G.Data.chars[c].growth[k] * (lv - 1)))]);
  const tableMd = mdTable(['角色', 'Lv', ...stats.map((k) => STAT[k])], rows, ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r']);
  return figure('growth', '角色能力成長', '不含裝備的基礎能力：Lv1 基礎值＋每級成長 ×（Lv−1），四捨五入。等級上限 50。線尾數字是 Lv50 的值。', s, tableMd);
}

function chartWuxing() {
  const W = 560, H = 470, cx = W / 2, cy = 245, R = 160;
  const pos = {};
  ELEM_ORDER.forEach((e, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; pos[e] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  let s = svgOpen(W, H, '五行相剋');
  s += `<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--ink2)"/></marker></defs>`;
  for (const e of ELEM_ORDER) {
    const [ax, ay] = pos[e], [bx, by] = pos[BEATS[e]];
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, rr = 44;
    s += `<line x1="${r1(ax + ux * rr)}" y1="${r1(ay + uy * rr)}" x2="${r1(bx - ux * (rr + 4))}" y2="${r1(by - uy * (rr + 4))}" stroke="var(--ink2)" stroke-width="2" marker-end="url(#arr)"><title>${ELEM[e]}克${ELEM[BEATS[e]]}：${ELEM[e]}屬性攻擊${ELEM[BEATS[e]]}屬性的敵人 ×1.5</title></line>`;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    s += `<text class="lab" x="${r1(mx + (mx - cx) * 0.18)}" y="${r1(my + (my - cy) * 0.18 + 4)}" text-anchor="middle">克</text>`;
  }
  for (const e of ELEM_ORDER) {
    const [x, y] = pos[e];
    const who = PARTY.filter((c) => G.Data.chars[c].elem === e).map(CHAR_NAME).join('、');
    s += `<circle cx="${r1(x)}" cy="${r1(y)}" r="38" fill="${ELEM_COLOR[e]}" stroke="var(--surface)" stroke-width="3"><title>${ELEM[e]}：克${ELEM[BEATS[e]]}，被${ELEM[BEATEN_BY[e]]}克</title></circle>`;
    s += `<text class="elem" x="${r1(x)}" y="${r1(y + 10)}" text-anchor="middle">${ELEM[e]}</text>`;
    if (who) s += `<text class="lab" x="${r1(x)}" y="${r1(y + (y > cy ? 58 : -48))}" text-anchor="middle">${esc(who)}</text>`;
  }
  s += `<text class="lab" x="${cx}" y="${cy - 6}" text-anchor="middle">箭頭 → 克</text><text class="tick" x="${cx}" y="${cy + 14}" text-anchor="middle">克 ×1.5　被克 ×0.7</text>`;
  s += '</svg>';
  return figure('wuxing', '五行相剋圖', '金克木、木克土、土克水、水克火、火克金。打在被克的一方 ×1.5，反過來打 ×0.7；敵人另有「弱點／抗性」時以弱點 ×1.5、抗性 ×0.5 為準。遊戲只用相剋，不用相生。', s, TABLES.elements());
}

function chartLanterns() {
  const per = CHS.map((ch) => ({ ch, n: LANTERNS.filter((l) => l.ch === ch).length }));
  const W = 760, H = 330, x0 = 46, x1 = W - 20, y0 = 50, y1 = H - 44;
  const total = LANTERNS.length, th = G.Lanterns.THRESHOLD;
  const max = niceMax(total);
  const Y = (v) => y1 - (v / max) * (y1 - y0);
  const band = (x1 - x0) / per.length, bw = Math.min(24, band - 12);
  let s = svgOpen(W, H, '各章心燈數與累計');
  s += yAxis(x0, x1, y0, y1, max, 4, (v) => String(v));
  let cum = 0;
  const pts = [];
  per.forEach((p, i) => {
    const cxx = x0 + band * (i + 0.5);
    cum += p.n;
    pts.push([cxx, Y(cum), cum, p.ch]);
    if (p.n) {
      const y = Y(p.n), h = y1 - y;
      s += `<path d="M${r1(cxx - bw / 2)},${y1} v${r1(-(h - 4))} a4,4 0 0 1 4,-4 h${r1(bw - 8)} a4,4 0 0 1 4,4 v${r1(h - 4)} z" fill="var(--s1)"><title>${CH_SHORT(p.ch)}：${p.n} 盞（${LANTERNS.filter((l) => l.ch === p.ch).map((l) => l.name).join('、')}）</title></path>`;
      s += `<text class="val" x="${r1(cxx)}" y="${r1(y - 5)}" text-anchor="middle">${p.n}</text>`;
    }
    s += `<text class="tick" x="${r1(cxx)}" y="${y1 + 18}" text-anchor="middle">${p.ch}</text>`;
  });
  s += `<polyline fill="none" stroke="var(--s2)" stroke-width="2" stroke-linejoin="round" points="${pts.map((p) => r1(p[0]) + ',' + r1(p[1])).join(' ')}"/>`;
  for (const p of pts) s += `<circle cx="${r1(p[0])}" cy="${r1(p[1])}" r="4" fill="var(--s2)" stroke="var(--surface)" stroke-width="2"><title>到${CH_SHORT(p[3])}為止最多 ${p[2]} 盞</title></circle>`;
  s += `<line x1="${x0}" x2="${x1}" y1="${r1(Y(th))}" y2="${r1(Y(th))}" stroke="var(--s8)" stroke-width="1.5"/><text class="lab" x="${x0 + 6}" y="${r1(Y(th) - 6)}">真結局門檻 ${th} 盞</text>`;
  const firstReach = pts.find((p) => p[2] >= th);
  if (firstReach) s += `<text class="val" x="${r1(firstReach[0])}" y="${r1(firstReach[1] - 10)}" text-anchor="middle">${firstReach[2]}</text>`;
  s += `<text class="val" x="${r1(pts[pts.length - 1][0] - 6)}" y="${r1(pts[pts.length - 1][1] - 10)}" text-anchor="end">共 ${total}</text>`;
  s += `<text class="tick" x="${(x0 + x1) / 2}" y="${H - 8}" text-anchor="middle">章</text>`;
  s += legend([['本章可得心燈', 'var(--s1)', 'rect'], ['累計（全拿）', 'var(--s2)', 'line']], x0, 22) + '</svg>';
  const tableMd = mdTable(['章', '心燈數', '累計', '心燈'], per.map((p, i) => [CH_SHORT(p.ch), p.n, pts[i][2], LANTERNS.filter((l) => l.ch === p.ch).map((l) => l.name).join('、') || '—']), ['l', 'r', 'r', 'l']);
  return figure('lanterns', '心燈分布', `全遊戲共 ${total} 盞心燈；真結局需要 ${th} 盞。長條是各章可取得的數量，折線是全部拿到時的累計。`, s, tableMd);
}

// Taiwan route map — coastline parsed from js/engine/worldmap.js
const WM_SRC = fs.readFileSync(path.join(ROOT, 'js', 'engine', 'worldmap.js'), 'utf8');
const COAST = (() => { const i = WM_SRC.indexOf('const COAST = ['); const b = WM_SRC.indexOf('[', i); return vm.runInNewContext(WM_SRC.slice(b, matchBracket(WM_SRC, b))); })();
const ISLANDS = (() => { const i = WM_SRC.indexOf('const ISLANDS = {'); const b = WM_SRC.indexOf('{', i); return vm.runInNewContext('(' + WM_SRC.slice(b, matchBracket(WM_SRC, b)) + ')'); })();
const CH_PLACES = (() => {
  const out = {};
  for (const ch of CHS) out[ch] = [...new Set(D.own[ch].maps.filter((m) => !/^ending_/.test(m)).map((m) => G.Maps.defs[m].place).filter((p) => p && G.World.PLACES[p]))];
  // a chapter that opens where the last one ended keeps that place first (ch7 leaves from 府城)
  return out;
})();
function chartRoute(hl) {
  const W = 520, H = 700;
  const lon0 = 118.75, lon1 = 122.15, lat0 = 25.45, lat1 = 21.75;
  const sx = (W - 20) / (lon1 - lon0), sy = sx / Math.cos(23.7 * Math.PI / 180);
  const P = (lon, lat) => [10 + (lon - lon0) * sx, 10 + (lat0 - lat) * sy];
  const Hh = Math.ceil(20 + (lat0 - lat1) * sy);
  let s = svgOpen(W, Hh, hl == null ? '旅程路線圖' : `${CH_TITLE(hl)} 路線圖`);
  const poly = (pts) => pts.map(([a, b]) => P(a, b).map(r1).join(',')).join(' ');
  s += `<polygon class="land" points="${poly(COAST)}"/>`;
  for (const k2 in ISLANDS) s += `<polygon class="land" points="${poly(ISLANDS[k2])}"/>`;
  // journey
  const seq = [];
  for (const ch of CHS) for (const p of CH_PLACES[ch]) if (!seq.length || seq[seq.length - 1].p !== p) seq.push({ p, ch });
  const n = seq.length;
  for (let i = 1; i < n; i++) {
    const a = P(...G.World.PLACES[seq[i - 1].p]), b = P(...G.World.PLACES[seq[i].p]);
    const ch = seq[i].ch;
    const on = hl == null || ch === hl;
    const col = hl == null ? `var(--r${Math.min(11, ch)})` : on ? 'var(--s2)' : 'var(--muted2)';
    const sea = ch >= 9 && ['orchid', 'taitung', 'taroko', 'toucheng', 'penghu', 'farshore', 'eluanbi', 'hengchun'].includes(seq[i].p);
    s += `<line x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}" stroke="${col}" stroke-width="${on ? 2.5 : 1.5}" stroke-linecap="round"${sea ? ' stroke-dasharray="1 5"' : ''}><title>${CH_SHORT(ch)}：${G.World.PLACES[seq[i - 1].p][2]} → ${G.World.PLACES[seq[i].p][2]}</title></line>`;
  }
  const placed = new Set();
  seq.forEach((q, i) => {
    if (placed.has(q.p)) return;
    placed.add(q.p);
    const [x, y] = P(...G.World.PLACES[q.p]);
    const chs = [...new Set(seq.filter((z) => z.p === q.p).map((z) => z.ch))];
    const on = hl == null || chs.includes(hl);
    const right = x < W * 0.55 ? q.p !== 'farshore' : false;
    const off = { tamsui: [-1, -6], guanyin: [-1, 8], bangka: [1, 12], pingxi: [1, 12], jiufen: [1, -2], badouzi: [1, -8], hsinchu: [-1, 0], xiangtian: [1, 6], beigang: [-1, 0], yanshui: [-1, -2], tainan: [-1, 6], takao: [-1, 0], alishan: [-1, -2], yushan: [1, 4], sunmoon: [1, -2], farshore: [1, 0], penghu: [1, 0] }[q.p] || [right ? 1 : -1, 0];
    const anchor = off[0] > 0 ? 'start' : 'end';
    s += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${on ? 5 : 3.5}" fill="${on ? (hl == null ? `var(--r${Math.min(11, chs[0])})` : 'var(--s2)') : 'var(--muted2)'}" stroke="var(--surface)" stroke-width="2"><title>${G.World.PLACES[q.p][2]}（${chs.map(CH_SHORT).join('、')}）</title></circle>`;
    if (on || hl == null) s += `<text class="${on ? 'lab' : 'tick'}" x="${r1(x + off[0] * 9)}" y="${r1(y + 4 + off[1])}" text-anchor="${anchor}">${esc(G.World.PLACES[q.p][2])}${hl == null ? ' ' + chs.join('・') : ''}</text>`;
    void i;
  });
  s += '</svg>';
  const rows = CHS.filter((ch) => CH_PLACES[ch].length).map((ch) => [CH_SHORT(ch), CH_TITLE(ch).replace(/^\S+　/, ''), CH_PLACES[ch].map((p) => G.World.PLACES[p][2]).join(' → ')]);
  if (hl != null) {
    return figure('route_ch' + hl, `${CH_TITLE(hl)}・路線`, `本章走過的地點：${(CH_PLACES[hl] || []).map((p) => G.World.PLACES[p][2]).join(' → ') || '夢境'}。`, s, null);
  }
  return figure('route', '旅程路線圖', '一年一渡：一行人大致順時針繞行全島。地名後的數字是到訪的章；顏色由淺到深代表旅程先後，虛線是王船的海路。', s, mdTable(['章', '標題', '地點'], rows));
}

function chartById(id) {
  if (id === 'level_curve') return chartLevelCurve();
  if (id === 'boss_hp') return chartBossHp(BOSS, 'boss_hp', '頭目 HP 一覽');
  if (id === 'gold') return chartGold();
  if (id === 'growth') return chartGrowth();
  if (id === 'wuxing') return chartWuxing();
  if (id === 'lanterns') return chartLanterns();
  if (id === 'route') return chartRoute(null);
  let m;
  if ((m = /^route_ch(\d+)$/.exec(id))) return chartRoute(+m[1]);
  if ((m = /^boss_ch(\d+)$/.exec(id))) {
    const list = BOSS.filter((b) => b.ch === +m[1]);
    if (!list.filter((b) => b.e.hp < 900000 && (!b.res || b.res.kind === 'boss')).length) return null;
    return chartBossHp(list, id, `${CH_TITLE(+m[1])}・頭目 HP`);
  }
  console.warn('unknown chart placeholder: ' + id);
  return null;
}

// =====================================================================================================================
// 6. Markdown → HTML (the subset the guide uses: headings, paragraphs, lists, tables, quotes, code, images, raw HTML)
// =====================================================================================================================
function inline(s) {
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0001${codes.length - 1}\u0001`; });
  // escape, but keep simple inline tags we write ourselves
  s = s.replace(/&(?![a-z#0-9]+;)/gi, '&amp;').replace(/<(?!\/?(?:br|kbd|span|b|i|em|strong|small|sup|sub|mark|a)\b)/g, '&lt;');
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => `<img src="${src}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, href) => `<a href="${href}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  s = s.replace(/\u0001(\d+)\u0001/g, (m, i) => `<code>${esc(codes[+i])}</code>`);
  return s;
}
const isCJK = (c) => /[⺀-鿿豈-﫿＀-￯　-〿]/.test(c || '');
function joinLines(lines) {
  let out = '';
  for (const l of lines) {
    const t = l.trim();
    if (!out) { out = t; continue; }
    out += (isCJK(out[out.length - 1]) || isCJK(t[0])) ? '' : ' ';
    out += t;
  }
  return out;
}
function slug(text, used) {
  let b = text.replace(/<[^>]+>/g, '').replace(/[\s　]+/g, '-').replace(/[()（）「」『』《》〈〉、，。！？：；・…“”"'`*#[\]{}|\\/.,!?:;~^%&+=<>@$]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'sec';
  let id = b, i = 2;
  while (used.has(id)) id = b + '-' + i++;
  used.add(id);
  return id;
}
function mdToHtml(md, ctx) {
  const lines = md.split('\n');
  let i = 0;
  const out = [];
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
  const blockStart = (l) => /^(#{1,6})\s/.test(l) || /^\s*([-*+]|\d+\.)\s+/.test(l) || /^>/.test(l) || /^```/.test(l) || /^\s*\|/.test(l) || /^<\/?(details|summary|div|figure|table|section|aside|p)\b/.test(l.trim()) || /^@@RAW:\d+@@$/.test(l.trim()) || /^<!--/.test(l.trim()) || /^(---|\*\*\*)\s*$/.test(l);
  function list(indent) {
    const ordered = /^\s*\d+\./.test(lines[i]);
    const items = [];
    while (i < lines.length) {
      const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
      if (!m || m[1].length < indent) break;
      if (m[1].length > indent) { if (items.length) items[items.length - 1].sub += list(m[1].length); else i++; continue; }
      const text = [m[3]];
      i++;
      while (i < lines.length && lines[i].trim() && !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) && !blockStart(lines[i].trim())) { text.push(lines[i]); i++; }
      items.push({ text: joinLines(text), sub: '' });
      if (i < lines.length && !lines[i].trim()) { const nx = lines.slice(i).find((l) => l.trim()); const mm = nx && /^(\s*)([-*+]|\d+\.)\s+/.exec(nx); if (mm && mm[1].length >= indent) { while (!lines[i].trim()) i++; } }
    }
    const tag = ordered ? 'ol' : 'ul';
    return `<${tag}>` + items.map((it) => `<li>${inline(it.text)}${it.sub}</li>`).join('') + `</${tag}>`;
  }
  while (i < lines.length) {
    const l = lines[i];
    const t = l.trim();
    if (!t) { i++; continue; }
    let m;
    if ((m = /^@@RAW:(\d+)@@$/.exec(t))) { out.push(ctx.raw[+m[1]]); i++; continue; }
    if (/^<!--/.test(t)) { while (i < lines.length && !lines[i].includes('-->')) i++; i++; continue; }
    if (/^<\/?(details|summary|div|figure|section|aside)\b/.test(t)) {
      if (/^<summary>/.test(t)) out.push(t.replace(/<summary>([\s\S]*?)<\/summary>/, (mm, x) => `<summary>${inline(x)}</summary>`));
      else out.push(t);
      i++; continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*(?:\{#([\w-]+)\})?\s*$/.exec(t))) {
      const lv = m[1].length, text = m[2];
      const id = m[3] || slug(text, ctx.used);
      if (m[3]) ctx.used.add(m[3]);
      ctx.heads.push({ lv, text: text.replace(/\*\*/g, ''), id });
      out.push(`<h${lv} id="${id}">${inline(text)}${lv <= 3 ? `<a class="anchor" href="#${id}" aria-label="連結到此段">#</a>` : ''}</h${lv}>`);
      i++; continue;
    }
    if (/^(---|\*\*\*)\s*$/.test(t)) { out.push('<hr>'); i++; continue; }
    if (/^```/.test(t)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\|/.test(t) && isTableSep(lines[i + 1])) {
      const row = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = row(t);
      const al = row(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'c' : /-:$/.test(c) ? 'r' : 'l'));
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(row(lines[i++]));
      const td = (c, j, tag) => `<${tag}${al[j] === 'r' ? ' class="r"' : al[j] === 'c' ? ' class="c"' : ''}>${inline(c)}</${tag}>`;
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, j) => td(c, j, 'th')).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c, j) => td(c, j, 'td')).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^>/.test(t)) {
      const q = [];
      while (i < lines.length && /^>/.test(lines[i].trim())) q.push(lines[i++].trim().replace(/^>\s?/, ''));
      const cls = /^\*\*(提示|注意|技巧|攻略要點|重點)/.test(q[0]) ? ' class="tip"' : '';
      out.push(`<blockquote${cls}>${mdToHtml(q.join('\n'), ctx)}</blockquote>`);
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(l)) { out.push(list(/^(\s*)/.exec(l)[1].length)); continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && blockStart(lines[i].trim()))) para.push(lines[i++]);
    const pt = joinLines(para);
    if (/^<img [^>]*>$/.test(inline(pt))) out.push(`<p class="pic${/src="img\/portrait_/.test(inline(pt)) ? ' portrait-wrap' : ''}">${inline(pt)}</p>`);
    else out.push(`<p>${inline(pt)}</p>`);
  }
  return out.join('\n');
}

// =====================================================================================================================
// 7. assembling
// =====================================================================================================================
function demote(md) { return md.replace(/^(#{1,5})(\s)/gm, '#$1$2'); }
function chapterFragment(ch) {
  const nn = String(ch).padStart(2, '0');
  const p = path.join(GUIDE, 'chapters', `ch${nn}.md`);
  const s = read(p);
  if (s && s.trim()) return demote(s.trim());
  return `## ${CH_TITLE(ch)}\n\n> **提示**　本章的流程攻略還在撰寫中（docs/guide/chapters/ch${nn}.md）。下面先列出本章的頭目、寶箱與商店資料。\n\n### 頭目\n\n<!-- table:bosses:ch${ch} -->\n\n### 寶箱\n\n<!-- table:chests:ch${ch} -->\n\n### 商店\n\n<!-- table:shops:ch${ch} -->`;
}
function assemble() {
  const partsDir = path.join(GUIDE, 'parts');
  const parts = fs.existsSync(partsDir) ? fs.readdirSync(partsDir).filter((f) => f.endsWith('.md')).sort() : [];
  const before = parts.filter((f) => parseInt(f, 10) < 50), after = parts.filter((f) => parseInt(f, 10) >= 50);
  const chunks = [];
  for (const f of before) chunks.push(read(path.join(partsDir, f)).trim());
  chunks.push('# 流程攻略\n\n<!-- include:walkthrough-intro -->\n\n每章依序整理：劇情提要（輕度）、地圖路線、心燈與支線、寶箱與祕密、商店、謎題解法、推薦等級，以及每一場頭目戰。標有「劇透警告」的段落預設收起。');
  for (const ch of CHS) chunks.push(chapterFragment(ch));
  for (const f of after) chunks.push(read(path.join(partsDir, f)).trim());
  return chunks.join('\n\n');
}

// expand placeholders → { html source (with raw tokens), md source }
function expand(md) {
  const raw = [];
  const charts = [];
  const figIds = new Set();
  const htmlSrc = [], mdOut = [];
  for (const line of md.split('\n')) {
    const m = /^\s*<!--\s*(chart|table|include):([\w:-]+)\s*-->\s*$/.exec(line);
    if (!m) { htmlSrc.push(line); mdOut.push(line); continue; }
    if (m[1] === 'include') continue;
    if (m[1] === 'table') { const t = expandTable(m[2]); htmlSrc.push('', t, ''); mdOut.push('', t, ''); continue; }
    const f = chartById(m[2]);
    if (!f) continue;
    charts.push(f);
    let fid = 'fig-' + f.id, k = 2;
    while (figIds.has(fid)) fid = 'fig-' + f.id + '-' + k++;
    figIds.add(fid);
    raw.push(`<figure class="chart-fig" id="${fid}"><figcaption><span class="fig-title">${esc(f.title)}</span><span class="fig-sub">${esc(f.sub)}</span></figcaption>${f.svg}` +
      (f.tableMd ? `\n@@TABLE:${raw.length}@@` : '') + '</figure>');
    if (f.tableMd) f.rawIndex = raw.length - 1;
    htmlSrc.push('', `@@RAW:${raw.length - 1}@@`, '');
    mdOut.push('', `> 圖表：${f.title}——${f.sub}（圖表只在 HTML 版顯示${f.tableMd ? '；數據如下' : ''}）`, '', f.tableMd || '', '');
  }
  return { htmlSrc: htmlSrc.join('\n'), mdOut: mdOut.join('\n').replace(/\n{3,}/g, '\n\n'), raw, charts };
}

function imgDataUri(p) {
  const ext = path.extname(p).slice(1).toLowerCase();
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
}

function writePortraits() {
  const imgDir = path.join(GUIDE, 'img');
  fs.mkdirSync(imgDir, { recursive: true });
  const out = [];
  for (const id of PARTY) {
    const set = G.PortraitImages && G.PortraitImages[id];
    const uri = set && (set.normal || set.smile || Object.values(set)[0]);
    const m = uri && /^data:image\/(\w+);base64,(.*)$/.exec(uri);
    if (!m) { console.warn('no baked portrait for ' + id); continue; }
    const p = path.join(imgDir, `portrait_${id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    const buf = Buffer.from(m[2], 'base64');
    if (!fs.existsSync(p) || !fs.readFileSync(p).equals(buf)) fs.writeFileSync(p, buf);
    out.push(p);
  }
  return out;
}

const CSS = fs.readFileSync(path.join(__dirname, 'guide.css'), 'utf8');
const JS = fs.readFileSync(path.join(__dirname, 'guide.js'), 'utf8');

function render() {
  writePortraits();
  const md = assemble();
  const { htmlSrc, mdOut, raw, charts } = expand(md);
  const ctx = { raw, used: new Set(), heads: [] };
  // chart data tables go inside <details> under each figure
  for (let k = 0; k < raw.length; k++) {
    const f = charts.find((c) => c.rawIndex === k);
    if (f && f.tableMd) raw[k] = raw[k].replace(`@@TABLE:${k}@@`, `<details class="chart-data"><summary>數據表</summary>${mdToHtml(f.tableMd, { raw: [], used: new Set(), heads: [] })}</details>`);
  }
  let body = mdToHtml(htmlSrc, ctx);
  // images: inline as data URIs when the total stays small, else keep relative paths
  const imgs = [...new Set([...body.matchAll(/<img src="(img\/[^"]+)"/g)].map((m) => m[1]))];
  const missing = imgs.filter((p) => !fs.existsSync(path.join(GUIDE, p)));
  const total = imgs.filter((p) => !missing.includes(p)).reduce((a, p) => a + fs.statSync(path.join(GUIDE, p)).size, 0);
  const inlineImgs = INLINE && total < INLINE_LIMIT;
  for (const p of imgs) {
    if (missing.includes(p)) { body = body.split(`<img src="${p}"`).join(`<img class="missing" data-src="${p}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="60"><rect width="100%" height="100%" fill="#8884"/><text x="10" y="36" font-size="16" fill="#888">（圖片準備中）</text></svg>')}"`); continue; }
    if (inlineImgs) body = body.split(`<img src="${p}"`).join(`<img src="${imgDataUri(path.join(GUIDE, p))}" data-file="${p}"`);
  }
  // TOC
  const heads = ctx.heads.filter((h) => h.lv <= 2);
  let toc = '<ol class="toc-l1">';
  let open = false;
  for (const h of heads) {
    if (h.lv === 1) { if (open) toc += '</ol></li>'; toc += `<li><a href="#${h.id}">${inline(h.text)}</a><ol class="toc-l2">`; open = true; }
    else toc += `<li><a href="#${h.id}">${inline(h.text)}</a></li>`;
  }
  if (open) toc += '</ol></li>';
  toc += '</ol>';
  const now = new Date().toISOString().slice(0, 10);
  const html = `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>彼岸燈 完全攻略</title>
<meta name="description" content="《彼岸燈》Shorelight 官方完全攻略：系統入門、角色、全章節流程、雙結局條件、資料庫與圖表。">
<style>
${CSS}
</style>
</head>
<body>
<a class="skip" href="#main">跳到內文</a>
<header class="masthead">
  <div class="mast-inner">
    <p class="kicker">Shorelight Official Strategy Guide</p>
    <h1 class="title">彼岸燈 <span>完全攻略</span></h1>
    <p class="subtitle">一年一渡，繞行福爾摩沙——從九份的中元夜，到黑水溝的彼岸。</p>
    <p class="meta">資料版本：${now}　·　全 ${CHS.length} 章　·　心燈 ${LANTERNS.length} 盞　·　頭目戰 ${BOSS.length} 場</p>
  </div>
  <button class="theme-toggle" type="button" aria-label="切換深淺色">◐</button>
</header>
<div class="layout">
<nav class="toc" aria-label="目錄">
  <details class="toc-box" open><summary>目錄</summary>
  ${toc}
  </details>
</nav>
<main id="main">
${body}
<footer class="colophon"><p>本攻略由 <code>tools/guide/build_guide.js</code> 依遊戲資料自動產生；表格與圖表的每一個數字都來自 <code>js/data</code>、<code>js/maps</code> 與 <code>docs/BALANCE.md</code>。</p></footer>
</main>
</div>
<script>
${JS}
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(GUIDE, 'guide_zh.html'), html);
  const mdHead = `<!-- 本檔由 tools/guide/build_guide.js 產生，請勿直接修改：文字請改 docs/guide/parts/*.md 與 docs/guide/chapters/*.md，再重新執行 node tools/guide/build_guide.js -->\n\n# 彼岸燈 完全攻略\n\n> 資料版本：${now}。圖表只收錄在 HTML 版（guide_zh.html）；本檔保留所有文字與表格。\n\n`;
  fs.writeFileSync(path.join(GUIDE, 'guide_zh.md'), mdHead + mdOut.trim() + '\n');
  if (ARGS.includes('--dump')) {
    fs.writeFileSync(path.join(GUIDE, '.data.json'), JSON.stringify({ shops: SHOPS, inns: INNS, lanterns: LANTERNS, chests: CHESTS, bosses: BOSS.map((b) => ({ ch: b.ch, troop: b.troop, main: b.main, name: b.e.name, lv: b.e.lv, hp: b.e.hp, kind: b.res && b.res.kind })), balance: BAL, places: CH_PLACES }, null, 1));
  }
  const size = fs.statSync(path.join(GUIDE, 'guide_zh.html')).size;
  console.log(`guide_zh.html ${(size / 1024 / 1024).toFixed(2)} MB (${inlineImgs ? 'images inlined' : 'images linked'}: ${imgs.length - missing.length} found, ${missing.length} missing${missing.length ? ' → ' + missing.join(', ') : ''})`);
  console.log(`guide_zh.md   ${(fs.statSync(path.join(GUIDE, 'guide_zh.md')).size / 1024).toFixed(0)} KB · charts: ${charts.map((c) => c.id).join(', ')}`);
  const fr = CHS.map((ch) => (read(path.join(GUIDE, 'chapters', `ch${String(ch).padStart(2, '0')}.md`)) ? ch : null)).filter((x) => x != null);
  console.log(`chapter fragments present: ${fr.length ? fr.join(', ') : 'none'}`);
}

render();

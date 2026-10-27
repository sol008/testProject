#!/usr/bin/env node
// 彼岸燈 Shorelight — FULL-CHAIN playthrough: one continuous game, title screen → 序章 → chapters 1–11 → both endings,
// with the state each chapter leaves (party, levels, inventory, gold, flags, quests, 心燈, cats) carried into the next.
//
//   node tools/test/full_chain.js                       # whole run (≈ 60–90 min), one browser, one page
//   node tools/test/full_chain.js --from ch6            # resume at the chapter-6 boundary save (saves/ch06.json)
//   node tools/test/full_chain.js --to ch3              # stop after chapter 3 (still writes the ch04 boundary save)
//   node tools/test/full_chain.js --assist              # also apply the chapter tests' own mid-chapter level boosts
//   node tools/test/full_chain.js --difficulty normal   # default: easy (the setting every chapter test uses)
//   node tools/test/full_chain.js --reload-at ch6       # boundary where the run reloads its save in a fresh page
//   node tools/test/full_chain.js --out <dir>           # screenshots, saves, logs, report.json (default tools/test/out/chain)
//   node tools/test/full_chain.js --check               # only load/compile the reused chapter drivers (no browser)
//
// How it works
//   · The page starts at the real title screen (no ?debug), localStorage shorelight_settings = {"render3d":false},
//     browser locale zh-TW. 序章 starts from 新的旅程 with the real keyboard (ch0.test.js testTitle).
//   · Chapter drivers are REUSED, not rewritten: each tools/test/chapters/chN.test.js is loaded as source, its main
//     runner (the trailing `(async () => { … })()`) is cut off, and its critical-path functions (testCritical, mainPath,
//     SEGMENTS, seg_*) — or, for ch5 / ch7 whose path is written inline in the runner, the exact source sections between
//     fixed markers — are run against the chain's page through a fake `browser` (newContext / newPage / goto are no-ops:
//     no debug preset is ever loaded).
//   · Every page.evaluate() of a driver goes through a FIREWALL. Calls that inject state the carried run might not have
//     (flags, vars, items, gear, gold, quests, party, 心燈, difficulty) are BLOCKED and logged as "assumed state";
//     level boosts (ensureLevel / addExpTo) are logged with the party's real level ("assumed Lv X, carried Lv Y") and only
//     applied with --assist; heals are allowed (documented help). Everything else (talk, trigger, stepOn, warp,
//     teleporting the player, choices, waits) runs unchanged.
//   · Allowed, documented help: difficulty easy + the shared battle bot (tools/test/lib/battlebot.js, a "sensible player"
//     that uses items), heals before bosses, and at each chapter start the party is raised to the expected start level
//     (G.Data.progression[ch].lv[0]; docs/BALANCE.md did not exist when this was written).
//   · At every chapter boundary: G.state.chapter must increment, no page errors / console errors / warnings, party /
//     cats / quest log sanity; time per chapter, a screenshot at each chapter start, a real save (G.Save.write → slot 1)
//     exported to <out>/saves/chNN.json (--from uses it through the title screen's 讀取進度 menu).
//   · Endings: in 彼岸燈塔 5F, before 她的記憶 (the last optional 心燈 before the finale), the run saves to slot 2, plays the
//     true ending 「千燈」, then reloads slot 2 in a fresh page, skips the memories and plays the normal ending 「彼岸」.
//   · Robustness: timestamped progress lines; fail fast on Game Over or 3 min without progress (dumps G.Scenes.names(),
//     the map and the busy state); one browser at a time.
'use strict';
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const CH_DIR = path.join(__dirname, 'chapters');
const BASE = 'file://' + path.join(ROOT, 'index.html');
const BATTLEBOT = path.join(__dirname, 'lib', 'battlebot.js');

// ------------------------------------------------------------------------------------------------ options
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const chNum = (s) => (s == null ? null : +String(s).replace(/^ch/i, ''));
const OPT = {
  from: chNum(opt('from', null)) || 0,
  to: chNum(opt('to', null)) ?? 11,
  assist: argv.includes('--assist'),
  difficulty: opt('difficulty', 'easy'),
  reloadAt: opt('reload-at', 'ch6') === 'none' ? -1 : chNum(opt('reload-at', 'ch6')),
  out: path.resolve(opt('out', path.join(__dirname, 'out', 'chain'))),
  speed: +opt('speed', 8),
  stall: +opt('stall', 180),
  headed: argv.includes('--headed'),
  check: argv.includes('--check'),
  endings: !argv.includes('--no-endings'),
};
const SAVES = path.join(OPT.out, 'saves');
fs.mkdirSync(SAVES, { recursive: true });

// ------------------------------------------------------------------------------------------------ logging
const T0 = Date.now();
const LOGF = path.join(OPT.out, OPT.from ? `chain_from_ch${OPT.from}.log` : 'chain.log');
fs.writeFileSync(LOGF, '');
const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp() {
  const d = new Date(), e = Math.floor((Date.now() - T0) / 1000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} +${pad(Math.floor(e / 60), 3)}m${pad(e % 60)}s`;
}
function log(tag, ...a) {
  const line = `${stamp()} [${tag}] ${a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')}`;
  console.log(line);
  fs.appendFileSync(LOGF, line + '\n');
}

// ------------------------------------------------------------------------------------------------ report
const REPORT_F = path.join(OPT.out, 'report.json');
const REPORT = (() => {
  const fresh = { started: new Date().toISOString(), runs: [], chapters: {}, endings: {}, helps: [], levels: [], blocked: [], errors: [], battles: [], bugs: [] };
  if (OPT.from > 0 && fs.existsSync(REPORT_F)) {
    try {
      const r = JSON.parse(fs.readFileSync(REPORT_F, 'utf8'));
      // keep what earlier runs found for chapters before the resume point
      for (const k of ['helps', 'levels', 'blocked', 'errors', 'battles']) r[k] = (r[k] || []).filter((x) => x.ch < OPT.from);
      for (const k of Object.keys(r.chapters || {})) if (+k >= OPT.from) delete r.chapters[k];
      r.endings = {};
      return Object.assign(fresh, r);
    } catch (e) { /* start over */ }
  }
  return fresh;
})();
REPORT.runs.push({ at: new Date().toISOString(), opts: OPT });
const saveReport = () => fs.writeFileSync(REPORT_F, JSON.stringify(REPORT, null, 1));

// ------------------------------------------------------------------------------------------------ chapter drivers
// Load tools/test/chapters/chN.test.js as a closure: its top-level bindings stay private to it but can be read, written
// (top-level `const` is turned into `let` so a binding like `page` can be pointed at the chain's page) and code can be
// compiled inside its scope (M.eval) — used to run the source sections of a runner (ch5, ch7) or of a segment (ch11).
function loadChapter(n) {
  const file = path.join(CH_DIR, `ch${n}.test.js`);
  let src = fs.readFileSync(file, 'utf8').replace(/^#!.*\n/, '\n');
  const k = src.lastIndexOf('\n(async () => {');
  if (k < 0) throw new Error(`ch${n}.test.js: no trailing runner found`);
  const runner = src.slice(k);
  src = src.slice(0, k).replace(/^const (\w+) = /gm, 'let $1 = ');
  const out = (...a) => log(`ch${n}.test`, a.map(String).join(' ').replace(/\n/g, ' ⏎ ').slice(0, 600));
  const con = { log: out, info: out, warn: out, error: out };
  const proc = Object.create(process, {
    argv: { value: [process.argv[0], file] },
    exit: { value: (c) => { throw new Error(`ch${n}.test.js called process.exit(${c})`); } },
  });
  const req = Module.createRequire(file);
  const body = src + '\n;return { get: (k__) => eval(k__), set: (k__, v__) => { eval(k__ + " = v__"); }, eval: (c__) => eval(c__) };';
  // eslint-disable-next-line no-new-func
  const M = new Function('require', 'module', 'exports', '__filename', '__dirname', 'process', 'console', body)(req, { exports: {} }, {}, file, CH_DIR, proc, con);
  M.n = n; M.file = file; M.runner = runner; M.source = src;
  return M;
}
// the source between two markers (start included, end excluded); fails loudly when a driver changed
function section(text, start, end, what) {
  const a = text.indexOf(start);
  if (a < 0) throw new Error(`${what}: start marker not found: ${start.slice(0, 80)}`);
  const b = text.indexOf(end, a + start.length);
  if (b < 0) throw new Error(`${what}: end marker not found: ${end.slice(0, 80)}`);
  return text.slice(a, b);
}
// the debug presets each chapter test starts from (?debug&startch=N[&lv=..][&flags=..]): what the chapter assumes
function presetOf(M) {
  const re = new RegExp(`['"\`](\\?debug&[^'"\`]*startch=${M.n}\\b[^'"\`]*)`);
  const m = M.source.match(re) || M.runner.match(re);
  if (!m) return { query: null, lv: null, flags: [] };
  const q = new URLSearchParams(m[1].replace(/^\?/, ''));
  return { query: m[1], lv: q.get('lv') ? +q.get('lv') : null, flags: (q.get('flags') || '').split(',').filter(Boolean) };
}
// source sections of the runners that hold a critical path inline (compiled in the driver's own scope)
const SECTIONS = {
  5: (R) => [
    section(R, "await ev(() => { G.Debug.setAutoplay(true); G.settings.lang = 'zh'; });", "    } else if (FROM === 'boss') {", 'ch5 start'),
    section(R, '    // ------------------------------------------------------------------ 記憶之門③ + 怨宴 + 卸下面具', '    } else {\n      await page.goto(', 'ch5 boss'),
    section(R, '    // ------------------------------------------------------------------ 冬至 → 除夕 → chapter 6', "  } catch (e) {\n    check('playthrough completed without exception'", 'ch5 end'),
  ],
  7: (R) => [
    section(R, '      await ev(() => { G.Audio.unlock = () => {}; G.Debug.setAutoplay(true); });', "    } else {\n      const file = path.join(CKPT, FROM + '.json');", 'ch7 start'),
    section(R, "    { const cur = 's1_shrine_bear';", "    { const cur = 's10_extra';", 'ch7 segments'),
  ],
};
const compileSections = (M, pre = '') => M.eval(`(async () => {\n${pre}\n${SECTIONS[M.n](M.runner).join('\n')}\n})`);

// docs/BALANCE.md (balance pass for ch0–10): per-fight level the bosses are tuned for — `| Fight | Ch | Lv | …`
function balanceTable() {
  const f = path.join(ROOT, 'docs', 'BALANCE.md');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').map((l) => l.split('|').map((c) => c.trim())).filter((c) => c.length > 4 && /^\d+$/.test(c[2]) && /^\d+$/.test(c[3]))
    .map((c) => ({ fight: c[1], ch: +c[2], lv: +c[3], kind: c[5], win: c[7] }));
}
const BALANCE = balanceTable();
// the BALANCE.md row of a battle: same chapter, the fight name contains one of the enemies' names
function balanceRow(b) {
  if (!b.boss && !/^t_/.test(b.troop)) return null;
  const names = (b.names || []).map((n) => String(n).replace(/[·・].*$/, ''));
  return BALANCE.find((r) => r.ch === b.ch && names.some((n) => n && r.fight.includes(n))) || null;
}

// choices a chapter test pre-loads before its debug start (consumed by the chapter's opening, i.e. by G.Story.next)
const OPENING_CHOICES = { 9: ['跟紅纓說話'] };

// ------------------------------------------------------------------------------------------------ firewall
const INJECT = {
  flags: /G\.state\.flags\s*(\.\w+|\[[^\]]+\])\s*=[^=>]|Object\.assign\(G\.state\.flags|\bS\.flag\(|G\.Flags\.set\(|delete G\.state\.flags/,
  vars: /G\.state\.vars\s*(\.\w+|\[[^\]]+\])\s*=[^=>]|Object\.assign\(G\.state\.vars/,
  items: /G\.Inv\.(add|remove)\(|G\.state\.inv\s*(\.\w+|\[[^\]]+\])?\s*=[^=>]/,
  gear: /\.equip\s*(\.\w+|\[[^\]]+\])\s*=[^=>]|Object\.assign\([^)]*\.equip\s*,|G\.Party\.equip\(/,
  gold: /G\.state\.gold\s*=[^=>]/,
  quests: /G\.Quests\.(set|done|start)\(|\bS\.quest\(/,
  lanterns: /G\.Lanterns\.add\(|G\.state\.lanterns\s*(\.\w+|\[[^\]]+\])\s*=[^=>]|delete G\.state\.lanterns/,
  party: /G\.Party\.(join|leave)\(|G\.state\.party\s*=[^=>]/,
  state: /G\.state\s*=[^=>]/,
  difficulty: /settings\.difficulty\s*=[^=>]/,
};
const LEVEL = /ensureLevel|addExpTo/;
const NOTES = {
  'roaming enemies removed (field encounters skipped)': /\.enemies\s*=\s*\[\]/,
  'stealth guards removed': /npcs\s*=\s*\w+\.npcs\.filter\(\(n\) => !n\.guard\)/,
  'enemies frozen during a puzzle': /\.stun\s*=\s*\d{3,}/,
  '靈視 cast by the driver': /S\.vision\(/,
};
function textOf(fn, arg) {
  const parts = [typeof fn === 'function' ? fn.toString() : String(fn)];
  const walk = (a) => { if (typeof a === 'string') parts.push(a); else if (Array.isArray(a)) a.forEach(walk); };
  walk(arg);
  return parts.join('\n');
}
function levelTarget(src, arg) {
  if (typeof arg === 'number') return arg;
  let m = src.match(/ensureLevel\([^,()]+,\s*(\d+)\)/) || src.match(/\.lv\s*<\s*(\d+)\)/);
  return m ? +m[1] : null;
}
const snippet = (src) => src.replace(/\s+/g, ' ').slice(0, 220);

// ------------------------------------------------------------------------------------------------ the harness
class Harness {
  constructor(browser) {
    this.browser = browser;
    this.ch = OPT.from;
    this.errors = [];
    this.noteCount = {};
    const h = this;
    this.ctxFake = { addInitScript: (s, a) => h.initScript(s, a), newPage: async () => h.proxy, route: async () => {}, close: async () => {}, setDefaultTimeout() {} };
    this.fakeBrowser = { newContext: async () => h.ctxFake, newPage: async () => h.proxy, close: async () => {} };
    // what the drivers see as `page`
    this.proxy = new Proxy({}, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'evaluate') return (fn, arg) => h.evaluate(fn, arg);
        if (k === 'goto') return async (url) => { h.query(url); return null; };
        if (k === 'close' || k === 'route' || k === 'unroute' || k === 'bringToFront') return async () => {};
        if (k === 'on' || k === 'once' || k === 'off') return () => h.proxy;
        if (k === 'addInitScript') return (s, a) => h.initScript(s, a);
        if (k === 'context') return () => h.ctxFake;
        const v = h.page[k];
        return typeof v === 'function' ? v.bind(h.page) : v;
      },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
  // ---------------------------------------------------------------- browser context / page
  async newContext(seed) {
    if (this.ctx) { await this.ctx.close().catch(() => {}); this.ctx = null; }
    this.ctx = await this.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'zh-TW' });
    await this.ctx.addInitScript(([kv, diff]) => {
      try {
        localStorage.setItem('shorelight_settings', JSON.stringify({ render3d: false }));
        for (const [k, v] of kv) localStorage.setItem(k, v);
      } catch (e) { /* ignore */ }
      window.__battleBot = { difficulty: diff };
    }, [Object.entries(seed || {}), OPT.difficulty]);
    await this.ctx.addInitScript({ path: BATTLEBOT });
    await this.ctx.addInitScript(([speed, choices]) => {
      window.__chain = { speed, battles: [], next: [], lastError: [] };
      const iv = setInterval(() => {
        if (!(window.G && G.Story && G.Story.next && G.Debug && G.Debug.setAutoplay && G.Battle && G.Battle.start)) return;
        clearInterval(iv);
        const next = G.Story.next;
        G.Story.next = async function (S, n) {
          __chain.next.push({ n, at: Date.now() });
          if (choices[n]) G.Debug.choices = choices[n].slice();
          return next.call(this, S, n);
        };
        const sa = G.Debug.setAutoplay;
        G.Debug.setAutoplay = function (on) { sa.call(this, on); if (on) G.settings.battleSpeed = __chain.speed; };
        const bs = G.Battle.start;
        G.Battle.start = function (troop) {
          const id = typeof troop === 'string' ? troop : (troop && troop.id) || '(inline troop)';
          const T = G.Data.troops && G.Data.troops[id];
          const rec = { troop: id, boss: !!(T && T.boss), names: T ? (T.enemies || []).map((e) => (G.Data.enemies[e] ? G.Data.enemies[e].name : e)) : [], ch: G.state.chapter, map: G.mapScene && G.mapScene.def && G.mapScene.def.id,
            lv: G.state.party.slice(0, 4).map((p) => (G.state.members[p] ? p + ':' + G.state.members[p].lv : p)), diff: G.settings.difficulty, at: Date.now() };
          __chain.battles.push(rec);
          const p = bs.apply(this, arguments);
          Promise.resolve(p).then((r) => {
            rec.result = r; rec.sec = Math.round((Date.now() - rec.at) / 100) / 10;
            rec.hp = G.state.party.slice(0, 4).map((q) => { const m = G.state.members[q]; return m ? m.hp : null; });
          }, (e) => { rec.result = 'error: ' + e; });
          return p;
        };
      }, 2);
    }, [OPT.speed, OPENING_CHOICES]);
    this.page = await this.ctx.newPage();
    this.page.on('console', (m) => {
      const ty = m.type();
      if (ty !== 'error' && ty !== 'warning') return;
      this.recordError(ty === 'error' ? 'console.error' : 'console.warn', m.text());
    });
    this.page.on('pageerror', (e) => this.recordError('pageerror', String(e.stack || e.message)));
    await this.page.goto(BASE);
    await this.page.waitForFunction(() => window.G && G.Scenes && G.Scenes.top() && G.Title && window.__chain, null, { timeout: 60000 });
  }
  recordError(kind, text) {
    const benign = /AudioContext was not allowed|GPU stall|GL Driver Message/.test(text);
    const e = { ch: this.ch, kind, text: text.slice(0, 700), map: this.lastMap || null, benign, at: stamp() };
    this.errors.push(e);
    REPORT.errors.push(e);
    log('ERROR', `${kind}${benign ? ' (benign)' : ''}: ${text.slice(0, 300).replace(/\n/g, ' ⏎ ')}`);
  }
  query(url) {
    const q = String(url).replace(/^.*?(\?|$)/, '');
    if (q) log('chain', `driver asked for ${q.slice(0, 160)} — ignored (no debug preset is ever loaded)`);
    const lv = new URLSearchParams(q).get('lv');
    if (lv) this.levelAssumption(+lv, 'debug preset lv=' + lv, null);
  }
  // init scripts a driver registers: storage/settings writers are dropped (they would wipe the chain's saves), page
  // helpers (__qa fast-forward, error hooks) are installed right away, the battle bot is already there
  async initScript(s, arg) {
    if (s && s.path) { if (!/battlebot\.js$/.test(s.path)) log('chain', 'ignored init script ' + s.path); return; }
    const src = String(s);
    if (/localStorage/.test(src) && !/__qa|__c4/.test(src)) return;
    await this.page.evaluate(s, arg).catch((e) => log('chain', 'init script failed: ' + e.message));
  }
  // ---------------------------------------------------------------- firewall
  note(kind, detail) {
    const key = this.ch + '|' + kind;
    this.noteCount[key] = (this.noteCount[key] || 0) + 1;
    if (this.noteCount[key] === 1) {
      REPORT.helps.push({ ch: this.ch, kind, detail, map: this.lastMap, count: 1 });
      log('help', `ch${this.ch} ${kind}${detail ? ' — ' + detail : ''}`);
    } else {
      const h = REPORT.helps.find((x) => x.ch === this.ch && x.kind === kind);
      if (h) h.count = this.noteCount[key];
    }
  }
  async evaluate(fn, arg) {
    const src = textOf(fn, arg);
    const cats = Object.keys(INJECT).filter((k) => INJECT[k].test(src));
    const level = LEVEL.test(src);
    if (!cats.length && !level) {
      for (const [k, re] of Object.entries(NOTES)) if (re.test(src)) this.note(k);
      return this.page.evaluate(fn, arg);
    }
    if (cats.length) {
      const b = { ch: this.ch, map: this.lastMap, cats, code: snippet(typeof fn === 'function' ? fn.toString() : String(fn)), arg: typeof arg === 'string' ? snippet(arg) : arg };
      if (cats.includes('items') || cats.includes('gear')) b.state = await this.page.evaluate(() => ({ gold: G.state.gold, equip: G.state.party.map((id) => id + ':' + Object.values(G.state.members[id].equip).filter(Boolean).join('/')) })).catch(() => null);
      REPORT.blocked.push(b);
      log('BLOCK', `ch${this.ch} [${cats.join(',')}] ${b.code.slice(0, 160)}${typeof arg === 'string' ? ' ‹' + snippet(arg).slice(0, 80) + '›' : ''}`);
    }
    if (level) await this.levelAssumption(levelTarget(src, arg), 'driver level boost', src);
    else if (/healAll/.test(src)) await this.heal('heal that came with a blocked driver call');
    return undefined;
  }
  async heal(why) {
    await this.page.evaluate(() => G.Party.healAll());
    this.note('heal (before a boss / with a level request)', why);
  }
  async partyLv() {
    return this.page.evaluate(() => G.state.party.map((id) => [id, G.state.members[id] ? G.state.members[id].lv : 0]));
  }
  // a chapter test assumes the party is at `target`: record it next to the real level; apply only with --assist
  async levelAssumption(target, how, src) {
    const party = await this.partyLv();
    const min = party.length ? Math.min(...party.map((p) => p[1])) : 0;
    const rec = { ch: this.ch, map: this.lastMap, how, assumed: target, party: party.map((p) => p.join(':')), min, deficit: target == null ? null : target - min, applied: false };
    if (target != null && OPT.assist && target > min) {
      await this.page.evaluate((lv) => { for (const id of G.state.party) G.Story.ensureLevel(id, lv); G.Party.healAll(); }, target);
      rec.applied = true;
    } else if (src != null) await this.page.evaluate(() => G.Party.healAll());
    REPORT.levels.push(rec);
    log('LEVEL', `ch${this.ch} ${how}: assumed Lv${target ?? '?'}, party ${rec.party.join(' ')}${rec.deficit > 0 ? ` → ${rec.deficit} below` : ''}${rec.applied ? ' (applied: --assist)' : src != null ? ' (not applied; party healed)' : ''}`);
    saveReport();
  }
  // ---------------------------------------------------------------- game helpers
  ev(fn, arg) { return this.page.evaluate(fn, arg); }
  async idle(ms = 600000) {
    const r = await this.page.evaluate((t) => G.Debug.idle(t), ms);
    if (r === 'gameover') throw new ChainFail('GAME OVER');
    if (!r) throw new ChainFail('the game did not become idle within ' + ms / 1000 + ' s');
    await this.page.waitForTimeout(400);
    const r2 = await this.page.evaluate((t) => G.Debug.idle(t), ms);
    if (r2 === 'gameover') throw new ChainFail('GAME OVER');
  }
  async status() {
    return this.page.evaluate(() => {
      const m = G.mapScene, top = G.Scenes.top();
      const b = G.Battle && top instanceof G.Battle.Scene ? top : null;
      return {
        names: G.Scenes.names ? G.Scenes.names() : [], top: G.Scenes.nameOf ? G.Scenes.nameOf(top) : top && top.constructor && top.constructor.name,
        map: m && m.def ? m.def.id : null, pos: m && m.player ? [m.player.x, m.player.y] : null, busy: G.Script.busy(), fade: +G.Render.fade.a.toFixed(2),
        ch: G.state.chapter, lv: G.state.party.map((id) => (G.state.members[id] ? G.state.members[id].lv : 0)), gold: G.state.gold, lanterns: G.Lanterns.count(),
        flags: Object.keys(G.state.flags).length, battles: G.state.battles, dlg: G.Dialog.log.length, dbg: G.Debug.log.length,
        bt: b ? [b.rounds, b.enemies.reduce((a, e) => a + e.hp, 0), b.party.reduce((a, e) => a + e.hp, 0)].join('/') : null,
        cred: top && top.t != null && /Credits|Ending|Narrate|Card/.test(top.constructor && top.constructor.name) ? Math.floor(top.t) : null,
        gameover: !!(G.GameOverScene && top instanceof G.GameOverScene),
        lastError: G.lastError ? String(G.lastError.stack || G.lastError).slice(0, 600) : null,
      };
    });
  }
  async dump(reason) {
    const d = await this.page.evaluate(() => ({
      names: G.Scenes.names ? G.Scenes.names() : null, map: G.mapScene && G.mapScene.def && G.mapScene.def.id,
      pos: G.mapScene && [G.mapScene.player.x, G.mapScene.player.y], busy: G.Script.busy(), fade: G.Render.fade.a, chapter: G.state.chapter,
      dialog: G.Dialog.log.slice(-6).map((l) => (l.name || '') + '：' + l.text), debugLog: G.Debug.log.slice(-8), choices: G.Debug.choices.slice(),
      party: G.state.party.map((id) => { const m = G.state.members[id]; return m ? `${id} Lv${m.lv} ${m.hp}HP` : id; }),
      battles: (window.__chain.battles || []).slice(-3), lastError: G.lastError ? String(G.lastError.stack || G.lastError).slice(0, 800) : null,
    })).catch((e) => ({ dumpFailed: e.message }));
    log('DUMP', reason);
    log('DUMP', JSON.stringify(d, null, 1));
    await this.page.screenshot({ path: path.join(OPT.out, `FAIL_ch${pad(this.ch)}.png`) }).catch(() => {});
    return d;
  }
  async shot(name) { await this.page.screenshot({ path: path.join(OPT.out, name + '.png') }).catch((e) => log('chain', 'screenshot failed: ' + e.message)); }
  // ---------------------------------------------------------------- saves (real save system)
  async save(slot, file) {
    const meta = await this.page.evaluate((s) => { const ok = G.Save.write(s, G.Save.thumbnail()); return { ok, meta: G.Save.meta(s), data: localStorage.getItem(G.Save.key(s)) }; }, slot);
    if (!meta.ok) throw new ChainFail('G.Save.write(' + slot + ') failed');
    fs.writeFileSync(file, JSON.stringify({ slot, key: 'shorelight_save_' + slot, data: meta.data }));
    log('save', `slot ${slot} (${meta.meta.place} · ${meta.meta.chapter} · 心燈 ${meta.meta.lanterns} · ${meta.meta.party.map((p) => p.id + ' Lv' + p.lv).join(' ')}) → ${path.relative(ROOT, file)}`);
    return meta.meta;
  }
  // a fresh page that only has the saved game, loaded through the title screen: any key → 讀取進度 → slot
  async loadInFreshPage(file) {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    await this.newContext({ [s.key]: s.data });
    const k = this.page.keyboard;
    await this.page.waitForFunction(() => G.Scenes.top() && G.Scenes.top().stage === 'press', null, { timeout: 30000 });
    await this.page.waitForTimeout(500);
    await k.press('Enter');
    await this.page.waitForFunction(() => G.Scenes.top().stage === 'menu', null, { timeout: 10000 });
    await this.page.waitForTimeout(400);
    for (let i = 0; i < 8; i++) {
      const cur = await this.ev(() => G.Scenes.top().list && G.Scenes.top().list.cur.k);
      if (cur === 'load') break;
      await k.press('ArrowDown'); await this.page.waitForTimeout(200);
    }
    await k.press('Enter');
    await this.page.waitForFunction(() => G.Scenes.top() && G.Scenes.top().constructor.name === 'SaveScene', null, { timeout: 10000 });
    await this.page.waitForTimeout(300);
    for (let i = 0; i < 12; i++) {
      const idx = await this.ev(() => { const t = G.Scenes.top(); return t.slots[t.idx]; });
      if (idx === s.slot) break;
      await k.press(idx < s.slot ? 'ArrowDown' : 'ArrowUp'); await this.page.waitForTimeout(150);
    }
    await k.press('Enter');
    await this.page.waitForFunction(() => G.inGame && G.mapScene && G.mapScene.def, null, { timeout: 30000 });
    await this.idle();
    const st = await this.ev(() => ({ map: G.mapScene.def.id, ch: G.state.chapter, lanterns: G.Lanterns.count() }));
    log('load', `slot ${s.slot} loaded from the title screen in a fresh page → ${st.map}, chapter ${st.ch}, 心燈 ${st.lanterns}`);
    return s;
  }
}
class ChainFail extends Error {}

// ------------------------------------------------------------------------------------------------ watchdog
// heartbeat every 5 s, a progress line every 30 s; fail on Game Over, on G.lastError, and on OPT.stall seconds without
// any change of map / position / scene stack / dialogue / battle state / flags
function watchdog(h) {
  let sig = null, since = Date.now(), lastLine = 0, failing = false, reject;
  const p = new Promise((_, rj) => { reject = rj; });
  const tick = async () => {
    if (failing) return;
    let st;
    try { st = await Promise.race([h.status(), new Promise((_, rj) => setTimeout(() => rj(new Error('status timeout')), 20000))]); } catch (e) { st = null; }
    if (st) {
      h.lastMap = st.map;
      if (st.lastError) { h.recordError('G.lastError', st.lastError); await h.ev(() => { G.lastError = null; }).catch(() => {}); }
      if (st.gameover) { failing = true; reject(new ChainFail('GAME OVER (party wiped) on ' + st.map)); return; }
      const s = JSON.stringify([st.map, st.pos, st.names, st.dlg, st.dbg, st.bt, st.flags, st.battles, st.cred, st.busy]);
      if (s !== sig) { sig = s; since = Date.now(); }
      if (Date.now() - lastLine > 30000) {
        lastLine = Date.now();
        log('progress', `ch${st.ch} ${st.map || '-'} ${st.pos ? st.pos.join(',') : ''} top=${st.top} busy=${st.busy} lv=${st.lv.join('/')} gold=${st.gold} 心燈=${st.lanterns} flags=${st.flags} battles=${st.battles}${st.bt ? ' battle=' + st.bt : ''} idle-for=${Math.round((Date.now() - since) / 1000)}s`);
      }
    }
    if (Date.now() - since > OPT.stall * 1000) { failing = true; reject(new ChainFail(`no progress for ${OPT.stall} s`)); }
  };
  const iv = setInterval(() => { tick(); }, 5000);
  return { promise: p, stop: () => clearInterval(iv), reset: () => { since = Date.now(); } };
}

// ------------------------------------------------------------------------------------------------ boundary checks
async function snapshot(h) {
  return h.ev(() => {
    const items = G.Data.items;
    const st = G.state, m = G.mapScene;
    const num = (x) => typeof x === 'number' && Number.isFinite(x);
    const party = st.party.map((id) => {
      const mm = st.members[id]; if (!mm) return { id, missing: true };
      const s = G.Party.stats(id);
      return { id, lv: mm.lv, hp: mm.hp, mhp: s.mhp, mp: mm.mp, mmp: s.mmp, atk: s.atk, def: s.def, mag: s.mag, spd: s.spd,
        equip: Object.assign({}, mm.equip), skills: mm.skills.length, bad: ['hp', 'mp', 'lv', 'exp'].filter((k) => !num(mm[k])).concat(['mhp', 'atk', 'def', 'mag', 'spd'].filter((k) => !num(s[k]))) };
    });
    return {
      chapter: st.chapter, map: m && m.def && m.def.id, pos: m && [m.player.x, m.player.y], playtime: Math.round(st.playtime), battles: st.battles, steps: st.steps,
      party, members: Object.keys(st.members), gold: st.gold,
      keyItems: Object.keys(st.inv).filter((i) => items[i] && items[i].type === 'key').map((i) => (items[i].name || i) + (st.inv[i] > 1 ? '×' + st.inv[i] : '')),
      consumables: Object.keys(st.inv).filter((i) => items[i] && items[i].type === 'use').reduce((a, i) => a + st.inv[i], 0),
      invKinds: Object.keys(st.inv).length,
      unknownItems: Object.keys(st.inv).filter((i) => !items[i]),
      badEquip: st.party.flatMap((id) => Object.values((st.members[id] || {}).equip || {}).filter((e) => e && !items[e])),
      lanterns: Object.keys(st.lanterns), lanternNames: Object.values(st.lanterns).map((l) => l.name),
      quests: { active: G.Quests.active(), done: Object.keys(st.quests).filter((q) => st.quests[q].done) },
      unknownQuests: Object.keys(st.quests).filter((q) => !G.Data.quests[q]),
      cats: { mochi: !!st.flags.mochi_joined, yuyuan: !!st.flags.yuyuan_joined, hidden: ['mochi_hidden', 'yuyuan_hidden'].filter((f) => st.flags[f]),
        following: m ? (m.followers || []).map((f) => f.id) : [] },
      tuanzi_mush: st.vars.tuanzi_mush || 0, flags: Object.keys(st.flags).length, difficulty: G.settings.difficulty,
    };
  });
}
function sanity(n, s, prevMain) {
  const p = [];
  if (s.chapter !== n) p.push(`G.state.chapter is ${s.chapter}, expected ${n}`);
  if (!s.party.length) p.push('party is empty');
  for (const m of s.party) {
    if (m.missing) { p.push(`party member ${m.id} has no member record`); continue; }
    if (m.bad.length) p.push(`${m.id}: non-numeric ${m.bad.join(',')}`);
    if (!(m.hp > 0)) p.push(`${m.id} has ${m.hp} HP at the chapter start`);
    if (m.hp > m.mhp || m.mp > m.mmp) p.push(`${m.id} HP/MP above max (${m.hp}/${m.mhp}, ${m.mp}/${m.mmp})`);
  }
  if (s.unknownItems.length) p.push('unknown items in the bag: ' + s.unknownItems.join(','));
  if (s.badEquip.length) p.push('unknown equipment: ' + s.badEquip.join(','));
  if (s.unknownQuests.length) p.push('quest log has undefined quests: ' + s.unknownQuests.join(','));
  if (n >= 2) {
    if (!s.cats.mochi || !s.cats.yuyuan) p.push(`cats not with the party (mochi_joined=${s.cats.mochi}, yuyuan_joined=${s.cats.yuyuan})`);
    for (const c of ['mochi', 'yuyuan']) if (s.cats[c] && !s.cats.hidden.includes(c + '_hidden') && !s.cats.following.includes(c)) p.push(`${c} is not following on ${s.map}`);
  }
  if (prevMain && !s.quests.done.includes(prevMain)) p.push(`previous main quest ${prevMain} is not done`);
  if (s.gold < 0 || !Number.isFinite(s.gold)) p.push('gold is ' + s.gold);
  return p;
}

// ------------------------------------------------------------------------------------------------ chapter adapters
// Each returns { checks: [{ name, ok, detail }] } — non-fatal check failures of the reused driver. A thrown error (an
// assert of the driver, a timeout, Game Over) stops the run at that chapter.
const okList = (arr) => (arr || []).map((r) => ({ name: r.name, ok: !!r.ok, detail: r.detail != null ? String(r.detail) : r.info != null ? String(r.info) : '' }));
const ADAPT = {
  0: async (h, M) => {
    const open = (q) => M.get('session')(h.fakeBrowser, q);
    log('ch0', 'title screen → 新的旅程 (real keyboard), ch0.test.js testTitle');
    await M.get('testTitle')(h.fakeBrowser, open);
    log('ch0', 'critical path 0-1 … 0-8, ch0.test.js testCritical');
    await M.get('testCritical')(h.fakeBrowser, open);
    return { checks: (M.get('warnings') || []).map((w) => ({ name: w, ok: true, detail: 'warning' })) };
  },
  1: async (h, M) => { await M.get('testCritical')(h.fakeBrowser, (q) => M.get('session')(h.fakeBrowser, q)); return { checks: [] }; },
  2: async (h, M) => { await M.get('testCritical')(h.fakeBrowser, (q) => M.get('session')(h.fakeBrowser, q)); return { checks: [] }; },
  3: async (h, M) => {
    const Run = M.get('Run');
    const r = new Run('main', h.fakeBrowser);
    await M.get('mainPath')(r);
    return { checks: r.fails.map((f) => ({ name: f, ok: false })), total: r.checks };
  },
  4: async (h, M) => { await M.get('mainPath')(h.fakeBrowser); return { checks: okList(M.get('results')) }; },
  5: async (h, M) => {
    M.set('page', h.proxy);
    await compileSections(M)();
    return { checks: okList(M.get('results')) };
  },
  6: async (h, M) => {
    const Session = M.get('Session');
    const s = new Session(h.fakeBrowser);
    s.page = h.proxy;
    await h.ev(M.get('INIT'));
    await s.until('G.mapScene && G.mapScene.def', 120);
    await s.pets();
    await s.gear();
    for (const seg of M.get('SEGMENTS')) { log('ch6', 'segment ' + seg.id); await seg.run(s); }
    await s.drain();
    return { checks: s.errors.map((e) => ({ name: 'driver-collected error', ok: false, detail: e })) };
  },
  7: async (h, M) => {
    M.set('page', h.proxy);
    M.set('checkpoint', async () => {});
    await h.ev(M.get('INIT'));
    const fn = compileSections(M, 'let st;');
    await fn();
    await M.get('drainErrors')();
    return { checks: okList(M.get('results')).concat((M.get('errors') || []).map((e) => ({ name: 'driver-collected error', ok: false, detail: e }))) };
  },
  8: async (h, M) => {
    const Session = M.get('Session');
    const s = new Session(h.fakeBrowser, 'main');
    s.page = h.proxy;
    await h.ev(M.get('INIT'));
    await h.ev(() => G.Debug.setAutoplay(true));
    const SEG = M.get('SEGMENTS');
    for (let i = 0; i < SEG.length; i++) { log('ch8', 'segment ' + SEG[i].id); await SEG[i].run(s, i === 0); }
    await s.collect();
    return { checks: s.errors.map((e) => ({ name: 'driver-collected error', ok: false, detail: e })) };
  },
  9: async (h, M) => {
    M.set('page', h.proxy);
    await h.ev(() => G.Debug.setAutoplay(true));
    const SEGS = M.get('SEGMENTS'), SEG_START = M.get('SEG_START');
    for (let i = 0; i < SEGS.length; i++) {
      const id = SEGS[i];
      log('ch9', 'segment ' + id);
      // ch9.test.js partA raises the party to each segment's start level between segments (the run skips encounters)
      if (i > 0 && SEG_START[id]) await h.levelAssumption(SEG_START[id].lv, `ch9 segment '${id}' start level (partA catch-up)`, 'segment');
      await M.get('seg_' + id)();
    }
    return { checks: okList(M.get('results')) };
  },
  10: async (h, M) => {
    const A = M.get('api')(h.proxy);
    try { await M.get('mainPath')(A); } finally { await h.ev(() => { clearInterval(window.__turbo); window.__turbo = null; }).catch(() => {}); }
    return { checks: [] };
  },
  11: async (h, M) => runCh11(h, M),
};

// ------------------------------------------------------------------------------------------------ chapter 11 + endings
function towerParts(M) {
  const src = M.get('SEGMENTS').tower.toString();
  const body = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  const memStart = 'for (const [x, y] of [[6, 12], [18, 6], [17, 16], [5, 8], [12, 17], [15, 5]])';
  const memEnd = "await R.shot('tower5');";
  const i = body.indexOf(memStart), j = body.indexOf(memEnd);
  if (i < 0 || j < 0) throw new Error('ch11 tower segment: memory markers not found');
  const mk = (t) => M.eval(`(async (R) => {\n${t}\n})`);
  return { a: mk(body.slice(0, i)), mem: mk(body.slice(i, j)), b: mk(body.slice(j)) };
}
async function runCh11(h, M) {
  const Run = M.get('Run'), SEG = M.get('SEGMENTS');
  const T = towerParts(M);
  const mkRun = (label) => { const R = new Run(h.fakeBrowser, label); R.page = h.proxy; R.ctx = h.ctxFake; return R; };
  const R = mkRun('A');
  for (const seg of ['temple', 'magong', 'flats', 'xuanwu', 'voyage', 'field']) {
    log('ch11', 'segment ' + seg);
    await SEG[seg](R);
    await R.health(seg);
  }
  log('ch11', "segment tower (1F–5F, up to 她的記憶)");
  await T.a(R);
  // ---- the finale branch: save before the last optional 心燈 (she 4-3 她的記憶)
  const branchFile = path.join(SAVES, 'ch11_branch.json');
  const meta = await h.save(2, branchFile);
  const L = meta.lanterns, TH = await h.ev(() => G.Lanterns.THRESHOLD);
  REPORT.endings.branch = { lanterns: L, threshold: TH, lanternIds: await h.ev(() => Object.keys(G.state.lanterns)), map: await h.ev(() => G.mapScene.def.id) };
  log('ch11', `finale branch saved: 心燈 ${L} / threshold ${TH} — 她的記憶 adds 1 → true needs ${L + 1} ≥ ${TH}, normal needs ${L} < ${TH}`);
  await h.shot('ch11_branch_5F');
  saveReport();
  if (!OPT.endings) return { checks: okList(M.get('results')) };
  // ---- true ending: collect the six memories, the warden, 一息界, the finale
  const tTrue = Date.now();
  log('ch11', 'TRUE route: 她的記憶 → 千年燈塔守 → 一息界 → 燈心 → 千燈');
  await T.mem(R);
  await T.b(R);
  await SEG.breath(R); await R.health('breath');
  h.watch && h.watch.reset();
  await SEG.true(R); await R.health('true');
  const fin = await h.ev(() => ({ f: { ending_true: !!G.state.flags.ending_true, ending_normal: !!G.state.flags.ending_normal, game_clear: !!G.state.flags.game_clear, cleared_true: !!G.state.flags.cleared_true }, n: G.Lanterns.count(), top: G.Scenes.nameOf(G.Scenes.top()), lv: G.state.party.map((id) => id + ':' + G.state.members[id].lv) }));
  REPORT.endings.true = Object.assign({ sec: Math.round((Date.now() - tTrue) / 1000) }, fin);
  log('ch11', 'TRUE route finished: ' + JSON.stringify(fin));
  await h.shot('ending_true_title');
  saveReport();
  // ---- normal ending: reload the branch save in a fresh page, leave 她的記憶 alone
  const tNorm = Date.now();
  log('ch11', 'NORMAL route: reload the branch save in a fresh page, skip 她的記憶 → 彼岸');
  await h.loadInFreshPage(branchFile);
  h.watch && h.watch.reset();
  const R2 = mkRun('B');
  await h.ev(() => G.Debug.setAutoplay(true));
  await T.b(R2);
  await SEG.breath(R2); await R2.health('breath (B)');
  await SEG.normal(R2); await R2.health('normal');
  const fin2 = await h.ev(() => ({ f: { ending_true: !!G.state.flags.ending_true, ending_normal: !!G.state.flags.ending_normal, game_clear: !!G.state.flags.game_clear, cleared_normal: !!G.state.flags.cleared_normal }, n: G.Lanterns.count(), top: G.Scenes.nameOf(G.Scenes.top()) }));
  REPORT.endings.normal = Object.assign({ sec: Math.round((Date.now() - tNorm) / 1000) }, fin2);
  log('ch11', 'NORMAL route finished: ' + JSON.stringify(fin2));
  await h.shot('ending_normal_title');
  return { checks: okList(M.get('results')) };
}

// ------------------------------------------------------------------------------------------------ main
async function main() {
  // load every driver first: a changed chapter test fails here, before a browser is started
  const MODS = {};
  for (let n = 0; n <= 11; n++) {
    MODS[n] = loadChapter(n);
    MODS[n].preset = presetOf(MODS[n]);
  }
  // compile the sections (throws on a missing marker / unbalanced extraction)
  compileSections(MODS[5]); compileSections(MODS[7], 'let st;');
  towerParts(MODS[11]);
  for (const k of ['testTitle', 'testCritical', 'session']) if (typeof MODS[0].get(k) !== 'function') throw new Error('ch0 driver lacks ' + k);
  log('chain', 'chapter drivers loaded: ' + Object.values(MODS).map((M) => `ch${M.n}${M.preset.query ? ' (' + M.preset.query + ')' : ''}`).join(', '));
  if (OPT.check) { log('chain', '--check: drivers load and compile'); return 0; }

  const balance = fs.existsSync(path.join(ROOT, 'docs', 'BALANCE.md'));
  log('chain', `options ${JSON.stringify(OPT)}; chapter-start level = G.Data.progression lv[0]${balance ? ` (docs/BALANCE.md: same table; ${BALANCE.length} per-fight levels loaded)` : ''}`);
  const browser = await chromium.launch({ headless: !OPT.headed });
  const h = new Harness(browser);
  let status = 0;
  try {
    if (OPT.from === 0) {
      await h.newContext({});
      log('chain', 'fresh profile → real title screen');
    } else {
      const f = path.join(SAVES, `ch${pad(OPT.from)}.json`);
      if (!fs.existsSync(f)) throw new ChainFail(`no boundary save ${f}: run the earlier chapters first`);
      await h.loadInFreshPage(f);
    }
    h.note(`difficulty '${OPT.difficulty}' + battle bot (tools/test/lib/battlebot.js)`, 'as in every chapter test');
    for (let n = OPT.from; n <= Math.min(OPT.to + 1, 11); n++) {
      h.ch = n;
      const boundaryOnly = n > OPT.to;   // --to chN: still reach, check and save the next boundary
      const M = MODS[n];
      const rec = REPORT.chapters[n] = { n, status: 'RUNNING', preset: M.preset, start: new Date().toISOString() };
      const t0 = Date.now();
      // ---------------------------------------------------------- chapter start / boundary
      if (n === 0) {
        await h.page.waitForFunction(() => G.Scenes.top() && G.Scenes.top().stage === 'press', null, { timeout: 30000 });
        await h.shot('ch00_start_title');
        rec.entry = { title: true };
      } else {
        await h.idle();
        const s = await snapshot(h);
        rec.entry = s;
        const prevMain = MODS[n - 1] && (await h.ev((q) => (G.Data.quests[q] ? q : null), `q_ch${n - 1}_main`));
        rec.sanity = sanity(n, s, prevMain);
        const newErr = h.errors.filter((e) => e.ch === n - 1 && !e.benign);
        rec.prevErrors = newErr.length;
        log('boundary', `ch${n} entry: ${s.map} · ${s.party.map((m) => `${m.id} Lv${m.lv} ${m.hp}/${m.mhp}`).join(' · ')} · gold ${s.gold} · 心燈 ${s.lanterns.length} · key items ${s.keyItems.length} · cats ${s.cats.following.join('+') || '-'} · quests active ${s.quests.active.length}`);
        for (const p of rec.sanity) log('boundary', 'SANITY: ' + p);
        // what the chapter test's debug start assumed (party / flags / level) vs what the chain carried in
        const prog = await h.ev((c) => (G.Data.progression || []).find((p) => p.ch === c) || null, n);
        rec.expected = { lv: prog && prog.lv, party: prog && prog.party, presetLv: M.preset.lv, presetFlags: M.preset.flags };
        const flagsHave = await h.ev((fl) => fl.filter((f) => !G.state.flags[f]), M.preset.flags);
        rec.missingPresetFlags = flagsHave;
        if (flagsHave.length) log('boundary', `the ch${n} test's debug start sets flags the carried state lacks: ${flagsHave.join(', ')}`);
        if (prog) {
          const missing = prog.party.filter((id) => !s.party.some((m) => m.id === id));
          const extra = s.party.map((m) => m.id).filter((id) => !prog.party.includes(id));
          if (missing.length || extra.length) log('boundary', `party differs from the progression table: missing ${missing.join(',') || '-'}, extra ${extra.join(',') || '-'}`);
          rec.partyDiff = { missing, extra };
        }
        // the real save at the boundary (the carried state, before any help)
        const file = path.join(SAVES, `ch${pad(n)}.json`);
        if (!(n === OPT.from)) rec.save = await h.save(1, file);
        await h.shot(`ch${pad(n)}_start`);
        // reload once mid-run in a fresh page, compare the state
        if (n === OPT.reloadAt && n !== OPT.from) {
          const before = await h.ev(() => JSON.stringify(Object.assign({}, G.state, { playtime: 0 })));
          await h.loadInFreshPage(file);
          const after = await h.ev(() => JSON.stringify(Object.assign({}, G.state, { playtime: 0 })));
          rec.reload = { same: before === after, bytes: after.length };
          if (before !== after) {
            const A = JSON.parse(before), B = JSON.parse(after);
            rec.reload.diff = Object.keys(Object.assign({}, A, B)).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
          }
          log('reload', `fresh page + title → 讀取進度 → slot 1: state ${rec.reload.same ? 'identical' : 'DIFFERS in ' + rec.reload.diff.join(',')}`);
        }
        // allowed help: raise the party to the chapter's expected start level
        if (prog) {
          const want = prog.lv[0];
          const below = s.party.filter((m) => m.lv < want);
          if (below.length) {
            await h.ev((lv) => { for (const id of G.state.party) G.Story.ensureLevel(id, lv); }, want);
            h.note('chapter-start level help', `party raised to the expected start level Lv${want} (was ${below.map((m) => m.id + ' Lv' + m.lv).join(', ')})`);
            REPORT.levels.push({ ch: n, map: s.map, how: 'chapter start (progression lv[0])', assumed: want, party: s.party.map((m) => m.id + ':' + m.lv), min: Math.min(...s.party.map((m) => m.lv)), deficit: want - Math.min(...s.party.map((m) => m.lv)), applied: true });
          }
          if (M.preset.lv && M.preset.lv > want) await h.levelAssumption(M.preset.lv, `debug start lv=${M.preset.lv} (above the progression table's ${want})`, null);
        }
      }
      saveReport();
      if (boundaryOnly) { rec.status = 'BOUNDARY'; delete rec.start; saveReport(); break; }
      // ---------------------------------------------------------- the chapter
      log('chain', `═════ chapter ${n} ═════`);
      const wd = watchdog(h);
      h.watch = wd;
      let res;
      try {
        res = await Promise.race([ADAPT[n](h, M), wd.promise]);
        if (n < 11) {
          await Promise.race([h.page.waitForFunction((c) => G.state.chapter === c, n + 1, { timeout: 600000 }), wd.promise]);
        }
      } catch (e) {
        wd.stop();
        rec.status = 'FAIL';
        rec.sec = Math.round((Date.now() - t0) / 1000);
        rec.error = String(e && e.message || e).slice(0, 2000);
        rec.dump = await h.dump(`chapter ${n} failed: ${rec.error}`);
        rec.battles = await h.ev(() => window.__chain.battles.slice()).catch(() => []);
        for (const b of rec.battles) REPORT.battles.push(Object.assign({ ch: n }, b));
        rec.checks = okList((() => { try { return M.get('results'); } catch (_) { return []; } })()).filter((c) => !c.ok);
        log('FAIL', `chapter ${n}: ${rec.error.split('\n')[0]}`);
        status = 1;
        break;
      }
      wd.stop();
      rec.sec = Math.round((Date.now() - t0) / 1000);
      rec.checks = (res.checks || []).filter((c) => !c.ok);
      rec.checksTotal = res.total || (res.checks || []).length;
      rec.battles = await h.ev(() => { const b = window.__chain.battles.slice(); window.__chain.battles.length = 0; return b; });
      for (const b of rec.battles) {
        const row = balanceRow(b);
        if (row) { b.balance = row; const lv = b.lv.map((x) => +String(x).split(':')[1]).filter(Boolean); b.lvGap = Math.min(...lv) - row.lv; }
        REPORT.battles.push(Object.assign({ ch: n }, b));
        if (b.boss || row) log('battle', `ch${n} ${b.troop} (${(b.names || []).join('+')}) party ${b.lv.join(' ')} → ${b.result} in ${b.sec}s${row ? ` · BALANCE.md: Lv${row.lv}, sim win ${row.win}` : ''}`);
      }
      const errs = h.errors.filter((e) => e.ch === n && !e.benign);
      rec.errors = errs.length;
      rec.status = rec.checks.length || errs.length || (rec.sanity || []).length ? 'PASS*' : 'PASS';
      log('chain', `chapter ${n} done in ${rec.sec}s — ${rec.checks.length} driver check(s) failed, ${errs.length} error(s), ${rec.battles.length} battle(s)`);
      for (const c of rec.checks) log('check', `ch${n} ✗ ${c.name}${c.detail ? ' — ' + c.detail.slice(0, 300) : ''}`);
      saveReport();
    }
  } catch (e) {
    status = 1;
    log('FAIL', 'harness: ' + (e && e.stack || e));
    await h.dump('harness failure').catch(() => {});
    REPORT.harnessError = String(e && e.stack || e);
  } finally {
    REPORT.finished = new Date().toISOString();
    REPORT.totalSec = Math.round((Date.now() - T0) / 1000);
    saveReport();
    await browser.close().catch(() => {});
  }
  // summary
  log('summary', 'chapter  status  time   entry');
  for (const r of Object.values(REPORT.chapters)) {
    const e = r.entry && r.entry.party ? `${r.entry.party.map((m) => m.id[0] + m.lv).join(' ')} gold ${r.entry.gold} 心燈 ${r.entry.lanterns.length}` : '';
    log('summary', `ch${pad(r.n)}     ${r.status.padEnd(6)} ${String(r.sec || '-').padStart(5)}s ${e}${r.error ? '  ✗ ' + r.error.split('\n')[0].slice(0, 120) : ''}`);
  }
  if (REPORT.endings.true) log('summary', 'true ending: ' + JSON.stringify(REPORT.endings.true));
  if (REPORT.endings.normal) log('summary', 'normal ending: ' + JSON.stringify(REPORT.endings.normal));
  log('summary', `report: ${path.relative(process.cwd(), REPORT_F)} · total ${REPORT.totalSec}s`);
  return status;
}

main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });

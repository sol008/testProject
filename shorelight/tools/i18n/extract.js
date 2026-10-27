#!/usr/bin/env node
// Extract every Chinese display string from the game sources and report English translation coverage.
//   node tools/i18n/extract.js            → writes tools/i18n/out/<bucket>.json + prints coverage
//   node tools/i18n/extract.js --missing  → also writes tools/i18n/out/<bucket>.missing.json (untranslated only)
// Buckets: ui (js/core, js/engine, js/gfx, js/story, index.html), data (js/data), chN (js/maps/chN_*.js).
// Template literals `獲得 ${x} 文` become keys with %s ('獲得 %s 文'); dictionaries may use %s / %d.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const CJK = /[㐀-鿿豈-﫿]/;

function listJs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) out.push(...listJs(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

// minimal JS string tokenizer (handles comments, quotes, escapes, template literals with ${})
function strings(src) {
  const res = [];
  let i = 0, line = 1;
  const n = src.length;
  let prevSig = ''; // previous significant char (for regex-literal heuristics)
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; } i += 2; continue; }
    if (c === '/' && /[(,=:[!&|?{};]/.test(prevSig)) {
      // regex literal: skip
      i++;
      let inClass = false;
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        else if (src[i] === '/' && !inClass) { i++; break; }
        i++;
      }
      while (/[a-z]/i.test(src[i] || '')) i++;
      prevSig = ')';
      continue;
    }
    if (c === '"' || c === "'") {
      const startLine = line;
      let s = ''; i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { const e = src[i + 1]; s += e === 'n' ? '\n' : e === 't' ? '\t' : e === 'u' ? String.fromCharCode(parseInt(src.substr(i + 2, 4), 16)) : e; i += e === 'u' ? 6 : 2; continue; }
        if (src[i] === '\n') line++;
        s += src[i++];
      }
      i++;
      res.push({ s, line: startLine });
      prevSig = 'a';
      continue;
    }
    if (c === '`') {
      const startLine = line;
      let s = ''; i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\\') { const e = src[i + 1]; s += e === 'n' ? '\n' : e; i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          let depth = 1; i += 2;
          while (i < n && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; if (src[i] === '\n') line++; i++; }
          s += '%s';
          continue;
        }
        if (src[i] === '\n') line++;
        s += src[i++];
      }
      i++;
      res.push({ s, line: startLine, tpl: true });
      prevSig = 'a';
      continue;
    }
    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  return res;
}

function bucketOf(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel.startsWith('js/i18n/') || rel.endsWith('fontdata.js') || rel.startsWith('tools/')) return null;
  if (rel.startsWith('js/r3d/')) return null;  // calligraphy painted into 3D textures (signs, couplets, tombs) stays Chinese, like 2D signs
  if (rel.startsWith('js/data/')) return 'data';
  const m = /^js\/maps\/(ch\d+)_/.exec(rel);
  if (m) return m[1];
  if (rel === 'js/maps/test.js') return null;
  return 'ui';
}

function loadDictionaries() {
  const keys = new Set();
  const ctx = { G: { I18N: { add(o) { for (const k in o) if (o[k]) keys.add(k); } } } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of listJs(path.join(ROOT, 'js', 'i18n'))) {
    try { vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f }); } catch (e) { console.error('dictionary error', f, e.message); }
  }
  return keys;
}

function main() {
  const wantMissing = process.argv.includes('--missing');
  const files = listJs(path.join(ROOT, 'js'));
  const buckets = {};
  for (const f of files) {
    const b = bucketOf(f);
    if (!b) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const { s, line } of strings(src)) {
      if (!CJK.test(s)) continue;
      buckets[b] = buckets[b] || {};
      const e = buckets[b][s] || (buckets[b][s] = []);
      if (e.length < 3) e.push(path.relative(ROOT, f) + ':' + line);
    }
  }
  const keys = loadDictionaries();
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  for (const b of Object.keys(buckets).sort()) {
    const all = Object.keys(buckets[b]);
    const missing = all.filter((s) => !keys.has(s));
    fs.writeFileSync(path.join(outDir, b + '.json'), JSON.stringify(buckets[b], null, 1));
    if (wantMissing) {
      const m = {};
      for (const s of missing) m[s] = buckets[b][s];
      fs.writeFileSync(path.join(outDir, b + '.missing.json'), JSON.stringify(m, null, 1));
    }
    rows.push([b, all.length, all.length - missing.length]);
  }
  console.log('bucket     strings  translated  coverage');
  let tot = 0, ok = 0;
  for (const [b, a, t] of rows) {
    tot += a; ok += t;
    console.log(b.padEnd(10), String(a).padStart(7), String(t).padStart(11), ((t / Math.max(1, a)) * 100).toFixed(1).padStart(8) + '%');
  }
  console.log('TOTAL'.padEnd(10), String(tot).padStart(7), String(ok).padStart(11), ((ok / Math.max(1, tot)) * 100).toFixed(1).padStart(8) + '%');
}
main();

// Source-text helpers shared by validate.js / unit.js: object-literal key extraction that survives
// strings, comments and template literals; line lookup; simple call scanning.
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT } = require('../load');

const cache = {};
function read(rel) {
  if (cache[rel] != null) return cache[rel];
  const f = path.join(ROOT, rel);
  cache[rel] = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  return cache[rel];
}

function lineOf(src, idx) {
  let n = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

// Skip a string / template / comment starting at i; returns index after it, or -1 if not one.
function skipNonCode(src, i) {
  const c = src[i], d = src[i + 1];
  if (c === '/' && d === '/') { const j = src.indexOf('\n', i); return j < 0 ? src.length : j; }
  if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); return j < 0 ? src.length : j + 2; }
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') break; j++; }
    return j + 1;
  }
  if (c === '`') {
    let j = i + 1, depth = 0;
    while (j < src.length) {
      if (src[j] === '\\') { j += 2; continue; }
      if (depth === 0 && src[j] === '`') break;
      if (src[j] === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
      if (depth > 0 && src[j] === '}') { depth--; j++; continue; }
      j++;
    }
    return j + 1;
  }
  return -1;
}

// Given the index of an opening '{', return { keys:[{key,line}], end } for depth-1 property keys.
function objectKeys(src, open) {
  const keys = [];
  let depth = 0, i = open, expectKey = false;
  const idRe = /[A-Za-z_$一-鿿][\w$一-鿿]*/y;
  while (i < src.length) {
    const s = skipNonCode(src, i);
    const ch = src[i];
    if (s >= 0) {
      if (depth === 1 && expectKey && (ch === '"' || ch === "'")) {
        const key = src.slice(i + 1, s - 1);
        let j = s; while (/\s/.test(src[j])) j++;
        if (src[j] === ':' || src[j] === '(') keys.push({ key, line: lineOf(src, i), idx: i });
        expectKey = false;
      }
      i = s; continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') { depth++; if (depth === 1) expectKey = true; i++; continue; }
    if (ch === '}' || ch === ']' || ch === ')') { depth--; i++; if (depth === 0) return { keys, end: i }; continue; }
    if (depth === 1 && ch === ',') { expectKey = true; i++; continue; }
    if (depth === 1 && expectKey) {
      if (/\s/.test(ch)) { i++; continue; }
      idRe.lastIndex = i;
      const m = idRe.exec(src);
      if (m) {
        let key = m[0];
        let j = i + key.length;
        while (/\s/.test(src[j])) j++;
        if ((key === 'async' || key === 'get' || key === 'set' || key === 'static') && /[A-Za-z_$]/.test(src[j] || '')) {
          idRe.lastIndex = j; const m2 = idRe.exec(src); if (m2) { key = m2[0]; j += key.length; while (/\s/.test(src[j])) j++; }
        }
        if (src[j] === ':' || src[j] === '(') keys.push({ key, line: lineOf(src, i), idx: i });
        expectKey = false;
        i = j; continue;
      }
      if (ch === '.' && src.startsWith('...', i)) { expectKey = false; i += 3; continue; }
      expectKey = false;
    }
    i++;
  }
  return { keys, end: src.length };
}

// Keys of the object literal following the first match of `re` (re must match up to/including '{').
function blockKeys(src, re) {
  const m = re.exec(src);
  if (!m) return null;
  const inMatch = m[0].indexOf('{');
  const open = inMatch >= 0 ? m.index + inMatch : src.indexOf('{', m.index + m[0].length);
  if (open < 0) return null;
  return objectKeys(src, open);
}

// Text of the function/method whose header matches re (balanced braces from the first '{').
function blockText(src, re) {
  const m = re.exec(src);
  if (!m) return '';
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const s = skipNonCode(src, i);
    if (s >= 0) { i = s - 1; continue; }
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return src.slice(open);
}

// Find the 1-based line of the first plausible definition / mention of `id` in rel.
function locate(rel, id) {
  const src = read(rel);
  if (!src || !id) return 0;
  const esc = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pats = [new RegExp(`(^|[\\s{,(])${esc}\\s*:\\s*\\{`, 'm'), new RegExp(`\\(\\s*['"]${esc}['"]`), new RegExp(`['"]${esc}['"]`), new RegExp(`\\b${esc}\\b`)];
  for (const p of pats) { const m = p.exec(src); if (m) return lineOf(src, m.index + (m[1] ? m[1].length : 0)); }
  return 0;
}

// Scan for calls: returns [{file, line, args:[string literal args or null], raw}]
// `callRe` should match the callee up to and including '('.
function scanCalls(files, callRe) {
  const out = [];
  for (const rel of files) {
    const src = read(rel);
    if (!src) continue;
    const re = new RegExp(callRe.source, 'g');
    let m;
    while ((m = re.exec(src))) {
      const start = m.index + m[0].length;
      const args = parseArgs(src, start);
      out.push({ file: rel, line: lineOf(src, m.index), args, raw: src.slice(m.index, Math.min(src.length, start + 80)).split('\n')[0] });
    }
  }
  return out;
}

// Parse top-level call arguments from just after '(' ; each is a literal string/number/array-of-strings or null.
function parseArgs(src, i) {
  const args = [];
  let depth = 0, cur = '';
  const flush = () => { args.push(literal(cur.trim())); cur = ''; };
  for (; i < src.length; i++) {
    const s = skipNonCode(src, i);
    if (s >= 0) { cur += src.slice(i, s); i = s - 1; continue; }
    const ch = src[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) { if (cur.trim() || args.length) flush(); return args; }
      depth--;
    }
    if (ch === ',' && depth === 0) { flush(); continue; }
    cur += ch;
    if (cur.length > 4000) break;
  }
  return args;
}
function literal(t) {
  if (!t) return null;
  let m = /^(['"])((?:\\.|(?!\1).)*)\1$/s.exec(t);
  if (m) return m[2];
  if (/^`[^`$]*`$/.test(t)) return t.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(t)) return +t;
  if (t[0] === '[') {
    const inner = [];
    const re = /(['"])((?:\\.|(?!\1).)*)\1/g;
    let k;
    while ((k = re.exec(t))) inner.push(k[2]);
    return { array: inner, raw: t };
  }
  return null;
}

module.exports = { read, lineOf, objectKeys, blockKeys, blockText, locate, scanCalls, parseArgs, skipNonCode };

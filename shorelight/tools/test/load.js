// Shorelight test harness: load the game's classic scripts (in index.html order) into a Node `vm`
// context with minimal DOM / canvas / storage stubs and return the global `G`.
//
//   const { load } = require('./load');
//   const env = load();                // all scripts except fontdata.js and main.js
//   env.G.Data.items ...               // live game objects
//   env.errors  -> [{ file, error }]   // scripts that threw while loading
//   env.missing -> [file]              // scripts listed in index.html that do not exist (yet)
//
// Options:
//   only:     array of file paths (relative to the game root) to load instead of index.html's list
//   skip:     extra files to skip (fontdata.js and main.js are always skipped)
//   extra:    files to load after the index.html list (e.g. engine files not referenced yet)
//   storage:  a Map used as localStorage backing (share it between loads to test persistence)
//   search:   location.search (e.g. '?debug')
//   console:  'silent' (default) | 'pass' | object with log/warn/error   — console inside the game
//
// The canvas stub is a permissive Proxy: every unknown method is a no-op, gradients/patterns accept
// addColorStop, measureText returns a width estimate. Rendering code therefore *loads* and can even
// run without crashing, but nothing is actually drawn (use e2e.js for real rendering).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const ALWAYS_SKIP = ['js/core/fontdata.js', 'js/main.js'];

function indexScripts(root = ROOT) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const out = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1].replace(/^\.\//, ''));
  return out;
}

// ------------------------------------------------------------------ canvas stubs
function makeGradient() { return { addColorStop() {} }; }

function makeContext2D(canvas) {
  const state = {
    canvas,
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000',
    lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', miterLimit: 10, font: '10px sans-serif',
    textAlign: 'start', textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, imageSmoothingQuality: 'low',
    lineDashOffset: 0, direction: 'ltr', filter: 'none',
    measureText(text) {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      const size = m ? +m[1] : 10;
      const w = String(text).length * size * 0.9;
      return { width: w, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2, fontBoundingBoxAscent: size, fontBoundingBoxDescent: size * 0.25 };
    },
    createLinearGradient: makeGradient,
    createRadialGradient: makeGradient,
    createConicGradient: makeGradient,
    createPattern: () => ({ setTransform() {} }),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  const noop = () => {};
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeCanvas() {
  const c = {
    width: 300, height: 150, style: {},
    getContext() { if (!c._ctx) c._ctx = makeContext2D(c); return c._ctx; },
    toDataURL: () => 'data:image/png;base64,',
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    addEventListener() {}, removeEventListener() {},
  };
  return c;
}

function makeElement(tag) {
  if (String(tag).toLowerCase() === 'canvas') return makeCanvas();
  const el = {
    tagName: String(tag).toUpperCase(), style: {}, textContent: '', innerHTML: '', children: [],
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    appendChild(ch) { el.children.push(ch); return ch; }, removeChild() {},
    setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {},
  };
  return el;
}

function makeStorage(map) {
  const m = map || new Map();
  return {
    _map: m,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() { return m.size; },
  };
}

// ------------------------------------------------------------------ context
function createSandbox(o = {}) {
  const elements = {};
  const document = {
    hidden: false,
    visibilityState: 'visible',
    createElement: makeElement,
    getElementById(id) { if (!elements[id]) elements[id] = id === 'game' ? makeCanvas() : makeElement('div'); return elements[id]; },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    body: makeElement('body'),
    documentElement: makeElement('html'),
    fonts: { load: () => Promise.resolve([]), add() {}, ready: Promise.resolve(), check: () => true },
    fullscreenElement: null,
  };
  const timers = new Set();
  const wrapTimer = (fn) => (...a) => { const h = fn(...a); if (h && h.unref) h.unref(); return h; };
  const sandbox = {
    document,
    location: { search: o.search || '', href: 'file:///index.html' + (o.search || ''), hash: '' },
    navigator: { userAgent: 'node-test', getGamepads: () => [], language: 'zh-TW' },
    localStorage: makeStorage(o.storage),
    sessionStorage: makeStorage(),
    devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout: wrapTimer(setTimeout), clearTimeout, setInterval: wrapTimer(setInterval), clearInterval,
    queueMicrotask, structuredClone, atob, btoa, TextEncoder, TextDecoder, URLSearchParams, URL,
    performance: { now: () => performance.now() },
    Image: class { constructor() { this.complete = true; this.width = 0; this.height = 0; } set src(v) { this._src = v; if (this.onload) setTimeout(this.onload, 0).unref?.(); } get src() { return this._src; } },
    Path2D: class { constructor() {} addPath() {} moveTo() {} lineTo() {} arc() {} ellipse() {} rect() {} closePath() {} bezierCurveTo() {} quadraticCurveTo() {} roundRect() {} arcTo() {} },
    OffscreenCanvas: class { constructor(w, h) { const c = makeCanvas(); c.width = w; c.height = h; return c; } },
    alert() {}, prompt: () => null, confirm: () => false,
    prompt_: null,
  };
  void timers;
  // console
  if (o.console === 'pass') sandbox.console = console;
  else if (o.console && typeof o.console === 'object') sandbox.console = o.console;
  else {
    const rec = { logs: [], warns: [], errors: [] };
    sandbox.console = {
      log: (...a) => rec.logs.push(a), info: (...a) => rec.logs.push(a), debug() {},
      warn: (...a) => rec.warns.push(a), error: (...a) => rec.errors.push(a), _rec: rec,
      group() {}, groupEnd() {}, table() {}, time() {}, timeEnd() {},
    };
  }
  const ctx = vm.createContext(sandbox);
  vm.runInContext('var window = this; var self = this; var globalThis_ = this;', ctx);
  return ctx;
}

function load(o = {}) {
  const root = o.root || ROOT;
  const list = o.only ? o.only.slice() : indexScripts(root).concat(o.extra || []);
  const skip = new Set(ALWAYS_SKIP.concat(o.skip || []));
  const ctx = createSandbox(o);
  const errors = [], missing = [], loaded = [];
  for (const rel of list) {
    if (skip.has(rel)) continue;
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) { missing.push(rel); continue; }
    const code = fs.readFileSync(file, 'utf8');
    try {
      vm.runInContext(code, ctx, { filename: file });
      loaded.push(rel);
    } catch (e) {
      errors.push({ file: rel, error: e });
    }
  }
  let G;
  try { G = vm.runInContext('typeof G !== "undefined" ? G : window.G', ctx); } catch (e) { G = undefined; }
  return { G, ctx, errors, missing, loaded, root, console: ctx.console, run: (code) => vm.runInContext(code, ctx) };
}

module.exports = { load, indexScripts, ROOT, makeStorage, createSandbox };

if (require.main === module) {
  const env = load();
  console.log('loaded:', env.loaded.length, 'missing:', env.missing.join(', ') || '-');
  for (const e of env.errors) console.log('ERROR in', e.file, '\n ', e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 3).join('\n  ') : e.error);
  const G = env.G;
  if (G) {
    const n = (o) => (o ? Object.keys(o).length : 0);
    console.log('chars', n(G.Data.chars), 'skills', n(G.Data.skills), 'items', n(G.Data.items), 'enemies', n(G.Data.enemies),
      'troops', n(G.Data.troops), 'quests', n(G.Data.quests), 'maps', G.Maps ? n(G.Maps.defs) : 0,
      'tiles', n(G.Tiles && G.Tiles.defs), 'objects', n(G.Objects && G.Objects.defs), 'monsters', n(G.Monsters && G.Monsters.defs));
  }
}

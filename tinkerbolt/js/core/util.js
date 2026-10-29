'use strict';
// Core helpers: G itself, math, seeded RNG, easing, tweens/timers on game time, warnOnce.
(function () {
  const G = (window.G = window.G || {});
  G.W = 540;
  G.H = 960;
  G.time = 0;
  G.lastError = null;
  G.key = (k) => G.CONFIG.id + '_' + k;

  const U = (G.U = G.U || {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.ease = {
    linear: (t) => t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => { const c = 1.70158, d = t - 1; return 1 + (c + 1) * d * d * d + c * d * d; },
    outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  };

  // mulberry32: small, fast, and its whole state is one number, so boards can be cloned exactly.
  U.Rng = function (seed) { this.s = seed >>> 0; };
  U.Rng.prototype.next = function () {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  U.Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };
  U.Rng.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
  U.Rng.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  U.Rng.prototype.clone = function () { return new U.Rng(this.s); };

  U.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  const warned = new Set();
  G.warnOnce = (key, err) => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn('[warnOnce] ' + key, err || '');
  };
  G.warnCount = () => warned.size;

  U.fmt = (s, ...args) => { let i = 0; return s.replace(/%[sd]/g, () => String(args[i++])); };
  U.today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

  // Tweens and timers run on game time (G.Tw.update(dt)), so pausing and test fast-forward work.
  const Tw = (G.Tw = { list: [] });
  Tw.add = function (opts) {
    return new Promise((resolve) => {
      Tw.list.push({ t: 0, dur: opts.dur || 0.3, delay: opts.delay || 0, ease: opts.ease || U.ease.outCubic,
        update: opts.update || null, done: () => { if (opts.done) opts.done(); resolve(); } });
    });
  };
  Tw.wait = (sec) => Tw.add({ dur: sec });
  Tw.update = function (dt) {
    const keep = [];
    const items = Tw.list;
    Tw.list = [];
    for (const it of items) {
      if (it.delay > 0) { it.delay -= dt; keep.push(it); continue; }
      it.t += dt;
      const k = Math.min(1, it.t / it.dur);
      try { if (it.update) it.update(it.ease(k), k); } catch (e) { G.warnOnce('tween', e); G.lastError = e; }
      if (k >= 1) it.done(); else keep.push(it);
    }
    Tw.list = keep.concat(Tw.list);
  };
  Tw.busy = () => Tw.list.length > 0;
  Tw.clear = () => { Tw.list = []; };
})();

// 彼岸燈 — core utilities
'use strict';
const G = window.G = {
  W: 1280,
  H: 720,
  TILE: 64,
  S: 1,            // backing-store scale
  time: 0,         // seconds since boot
  debug: /[?&]debug/.test(location.search),
};

G.U = (() => {
  const U = {};
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.chance = (p) => Math.random() < p;
  U.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  U.sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  U.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => t * (2 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  };

  // deterministic hash-based noise for procedural art
  U.hash = (x, y, s = 0) => {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  };
  U.seeded = (seed) => {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };
  U.vnoise = (x, y, s = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = U.hash(xi, yi, s), b = U.hash(xi + 1, yi, s);
    const c = U.hash(xi, yi + 1, s), d = U.hash(xi + 1, yi + 1, s);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  };

  // colour helpers
  U.hex2rgb = (hex) => {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  U.shade = (hex, amt) => {
    // amt -1..1 : darken/lighten
    const [r, g, b] = U.hex2rgb(hex);
    if (amt < 0) return U.rgb2hex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
    return U.rgb2hex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  };
  U.mix = (h1, h2, t) => {
    const a = U.hex2rgb(h1), b = U.hex2rgb(h2);
    return U.rgb2hex(U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t));
  };
  U.rgba = (hex, a) => {
    const [r, g, b] = U.hex2rgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  };

  U.makeCanvas = (w, h, scale = G.S) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * scale));
    c.height = Math.max(1, Math.ceil(h * scale));
    const ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    c.lw = w; c.lh = h;  // logical size
    return c;
  };

  U.deepCopy = (o) => JSON.parse(JSON.stringify(o));
  U.sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
  U.fmtTime = (sec) => {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  U.dirs = {
    up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
  };
  U.opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  U.cnNum = (n) => {
    const d = '〇一二三四五六七八九';
    if (n <= 10) return n === 10 ? '十' : d[n];
    if (n < 20) return '十' + d[n - 10];
    if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
    return String(n);
  };
  return U;
})();

// Promise-based timers driven by game time (paused when game paused)
G.Timers = (() => {
  const list = [];
  return {
    wait(sec) {
      return new Promise((res) => list.push({ t: sec, res }));
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].t -= dt;
        if (list[i].t <= 0) {
          const r = list[i].res;
          list.splice(i, 1);
          r();
        }
      }
    },
    clear() { list.length = 0; },
  };
})();

// Generic tween system
G.Tweens = (() => {
  const list = [];
  return {
    to(obj, props, dur, ease = 'outQuad') {
      return new Promise((res) => {
        const from = {};
        for (const k in props) from[k] = obj[k];
        list.push({ obj, from, props, dur: Math.max(0.0001, dur), t: 0, ease: G.U.ease[ease] || ease, res });
      });
    },
    update(dt) {
      for (let i = list.length - 1; i >= 0; i--) {
        const tw = list[i];
        tw.t += dt;
        const p = Math.min(1, tw.t / tw.dur);
        const e = tw.ease(p);
        for (const k in tw.props) tw.obj[k] = tw.from[k] + (tw.props[k] - tw.from[k]) * e;
        if (p >= 1) {
          list.splice(i, 1);
          tw.res();
        }
      }
    },
    clear() { list.length = 0; },
  };
})();

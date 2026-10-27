// G.Env3D — environment & atmosphere for the 3D field view (Map3D).
// Water 2.0 (shore foam, depth tint, flow, swells, sky reflection, glints, lantern reflections, black-sea
// phosphorescence), painterly sky (clouds, sun/moon, stars, Milky Way, kaleidoscope), time-of-day colour script,
// GPU weather/ambient particles mirroring the 2D presets, light shafts, cave crystals, lantern ground glow,
// sea of clouds, terrain detail (detail bump, contact AO, cloud shadows, wet ground, animated special tiles),
// per-mood post grading and psychedelic-realm enhancements. Contract: docs/CONTRACTS_3D.md (G.Env3D hooks).
// Hooks: G.Env3D.decorate(view) after Map3D build, G.Env3D.update(view, dt) every frame.
'use strict';
G.Env3D = (() => {
  const E = {};
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const val = (v) => (typeof v === 'function' ? v(G.state) : v);
  const QUAL = () => G.settings.quality || 'high';
  const QK = () => ({ low: 0.45, high: 1, ultra: 1.5 })[QUAL()] || 1;
  const FXK = () => (G.settings.visualFx == null ? 1 : clamp(+G.settings.visualFx, 0, 1));
  const warn = (k, e) => G.warnOnce('env3d ' + k, e);
  const safe = (k, fn) => { try { return fn(); } catch (e) { warn(k, e); return null; } };

  // tile classification ------------------------------------------------------------------------------
  const WATER_KIND = { water: 1, deepwater: 2, shallow: 3, lake: 4, river: 5, marsh: 6, black_sea: 7 };
  const SPECIAL = { moss_glow: 1, spirit_floor: 2, vision: 3, lantern_bridge: 4, breath: 5, cloud: 6 };
  const CLASS = {};
  for (const id of ['grass', 'grass_dark', 'flowers_ground', 'lily_field', 'field_rice', 'farmland', 'moss_glow']) CLASS[id] = 1;
  for (const id of ['stone', 'stairs', 'brick', 'slate', 'marble', 'basalt_floor', 'snow_rock', 'coral', 'cave', 'temple_floor', 'tile_floor']) CLASS[id] = 2;
  for (const id of ['sand', 'dirt', 'path']) CLASS[id] = 3;
  for (const id of ['wood', 'dock', 'deck', 'mat', 'bridge_h', 'bridge_v', 'rail', 'red_carpet']) CLASS[id] = 4;
  const OCCLUDER = { cliff: 1, cave_wall: 1, wall_plaster: 0.8, wall_brick: 0.8, wall_wood: 0.8, wall_temple: 0.85, hedge: 0.55, wall_slate: 0.9, wall_basalt: 1 };
  const isWaterId = (id) => WATER_KIND[id] != null;

  // deterministic RNG
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ===================================================================================== shared textures
  // RGBA tileable noise: R fbm (base period 4), G fbm (base 8), B fine fbm (base 16), A worley (8 cells).
  let noiseTex = null, rippleTex = null;
  function getNoise() {
    if (noiseTex) return noiseTex;
    const T = THREE, S = 256, data = new Uint8Array(S * S * 4), r = rng(1337);
    const lat = {};
    const lattice = (P, s) => { const k = P + ':' + s; if (!lat[k]) { const g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = r(); lat[k] = g; } return lat[k]; };
    const vn = (P, s, x, y) => {
      const g = lattice(P, s);
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const i0 = ((xi % P) + P) % P, i1 = (i0 + 1) % P, j0 = ((yi % P) + P) % P, j1 = (j0 + 1) % P;
      const a = g[j0 * P + i0], b = g[j0 * P + i1], c = g[j1 * P + i0], d = g[j1 * P + i1];
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    };
    const fbm = (base, s, x, y, oct) => { let sum = 0, amp = 0.5, tot = 0; for (let o = 0; o < oct; o++) { const P = base << o; sum += amp * vn(P, s + o, x * P, y * P); tot += amp; amp *= 0.5; } return sum / tot; };
    // worley feature points
    const C = 8, pts = [];
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) pts.push([(i + r()) / C, (j + r()) / C]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S, o = (y * S + x) * 4;
      data[o] = clamp(fbm(4, 10, u, v, 5) * 1.25 - 0.12, 0, 1) * 255;
      data[o + 1] = clamp(fbm(8, 30, u, v, 4) * 1.25 - 0.12, 0, 1) * 255;
      data[o + 2] = clamp(fbm(16, 50, u, v, 3) * 1.25 - 0.12, 0, 1) * 255;
      const ci = Math.floor(u * C), cj = Math.floor(v * C);
      let d1 = 9, d2 = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + C) % C, jj = (cj + dj + C) % C, p = pts[jj * C + ii];
        let dx = p[0] - u, dy = p[1] - v;
        dx -= Math.round(dx); dy -= Math.round(dy);
        const d = Math.hypot(dx, dy) * C;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      data[o + 3] = clamp(d2 - d1, 0, 1) * 255; // cell-edge distance: 0 on edges
    }
    noiseTex = new T.DataTexture(data, S, S, T.RGBAFormat);
    noiseTex.wrapS = noiseTex.wrapT = T.RepeatWrapping;
    noiseTex.magFilter = T.LinearFilter; noiseTex.minFilter = T.LinearMipmapLinearFilter; noiseTex.generateMipmaps = true;
    noiseTex.colorSpace = T.NoColorSpace; noiseTex.needsUpdate = true; noiseTex.shared = true;
    return noiseTex;
  }
  // tileable ripple normal map (sum of integer-wavenumber sines + noise)
  function getRipple() {
    if (rippleTex) return rippleTex;
    const T = THREE, S = 256, r = rng(77), H = new Float32Array(S * S), data = new Uint8Array(S * S * 4);
    const waves = [];
    for (let i = 0; i < 14; i++) waves.push({ kx: Math.round((r() - 0.5) * 14), ky: Math.round((r() - 0.5) * 14) || 2, a: 1 / (1 + i * 0.35), p: r() * 6.283 });
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let h = 0;
      for (const w of waves) h += Math.sin((w.kx * x + w.ky * y) / S * 6.283 + w.p) * w.a / Math.max(1, Math.hypot(w.kx, w.ky) * 0.25);
      H[y * S + x] = h;
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = H[y * S + ((x + 1) % S)] - H[y * S + ((x - 1 + S) % S)], dy = H[((y + 1) % S) * S + x] - H[((y - 1 + S) % S) * S + x];
      const nx = -dx * 2.2, ny = -dy * 2.2, l = Math.hypot(nx, ny, 1), o = (y * S + x) * 4;
      data[o] = (nx / l * 0.5 + 0.5) * 255; data[o + 1] = (ny / l * 0.5 + 0.5) * 255; data[o + 2] = (1 / l * 0.5 + 0.5) * 255; data[o + 3] = 255;
    }
    rippleTex = new T.DataTexture(data, S, S, T.RGBAFormat);
    rippleTex.wrapS = rippleTex.wrapT = T.RepeatWrapping;
    rippleTex.magFilter = T.LinearFilter; rippleTex.minFilter = T.LinearMipmapLinearFilter; rippleTex.generateMipmaps = true;
    rippleTex.colorSpace = T.NoColorSpace; rippleTex.needsUpdate = true; rippleTex.shared = true;
    return rippleTex;
  }

  // ===================================================================================== map analysis
  const RES = 4; // fine grid texels per tile
  function chamfer(W, H, seed) {
    // seed: Uint8Array (1 = source). returns Float32Array distance in texels (8-neighbour chamfer 1 / 1.414)
    const INF = 1e6, d = new Float32Array(W * H);
    for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : INF;
    const D1 = 1, D2 = 1.4142;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + D1);
      if (y > 0) { v = Math.min(v, d[i - W] + D1); if (x > 0) v = Math.min(v, d[i - W - 1] + D2); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D2); }
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + D1);
      if (y < H - 1) { v = Math.min(v, d[i + W] + D1); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D2); if (x > 0) v = Math.min(v, d[i + W - 1] + D2); }
      d[i] = v;
    }
    return d;
  }

  function analyse(view) {
    const T = THREE, ms = view.ms, w = ms.w, h = ms.h, terr = ms.terrain;
    const A = { w, h, waterCount: 0, kinds: {}, special: 0, cls: {}, edgeWater: false, walls: 0, cave: 0, snow: 0, cloudTiles: 0 };
    const kind = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const id = terr[i], k = WATER_KIND[id] || 0;
      kind[i] = k;
      if (k) { A.waterCount++; A.kinds[id] = (A.kinds[id] || 0) + 1; const x = i % w, y = (i / w) | 0; if (!x || !y || x === w - 1 || y === h - 1) A.edgeWater = true; }
      if (SPECIAL[id]) A.special++;
      if (OCCLUDER[id]) A.walls++;
      if (id === 'cave') A.cave++;
      if (id === 'snow_rock') A.snow++;
      if (id === 'cloud') A.cloudTiles++;
    }
    A.kind = kind;
    A.mainKind = Object.keys(A.kinds).sort((a, b) => A.kinds[b] - A.kinds[a])[0] || null;
    // fine grid ---------------------------------------------------------------------------------------
    const W = w * RES, H = h * RES;
    const water = new Uint8Array(W * H), land = new Uint8Array(W * H), occ = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = ((y / RES) | 0) * w + ((x / RES) | 0), o = y * W + x;
      if (kind[i]) water[o] = 1; else land[o] = 1;
      const oc = OCCLUDER[terr[i]];
      if (oc) occ[o] = oc;
    }
    // big solid objects (houses, temples…) darken their surroundings too
    for (const o of ms.objects || []) {
      const d = G.Objects && G.Objects.get(o.t);
      if (!d) continue;
      const ow = o.w || d.w || 1, oh = o.h || d.h || 1;
      if (ow * oh < 4 || !d.solid) continue;
      for (let y = o.y * RES + 1; y < (o.y + oh) * RES - 1; y++) for (let x = o.x * RES + 1; x < (o.x + ow) * RES - 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        occ[y * W + x] = Math.max(occ[y * W + x], 0.55);
      }
    }
    const occSeed = new Uint8Array(W * H);
    for (let i = 0; i < occ.length; i++) occSeed[i] = occ[i] > 0 ? 1 : 0;
    const dWater = A.waterCount ? chamfer(W, H, land) : null; // for water texels: distance to land
    const dLand = A.waterCount ? chamfer(W, H, water) : null; // for land texels: distance to water
    const dOcc = A.walls || occSeed.some((v) => v) ? chamfer(W, H, occSeed) : null;
    // nearest occluder strength: propagate by simple dilation (approximation: use max of 5×5 around)
    const mapData = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = y * W + x, q = o * 4;
      // signed shore distance in tiles: + into water, − into land, encoded [-1, 4] → [0,1]
      let sd = 4;
      if (dWater) sd = water[o] ? (dWater[o] - 0.5) / RES : -(dLand[o] - 0.5) / RES;
      // open sea continues past the map edge: water texels near an edge are not "near shore" because of it
      mapData[q] = clamp((sd + 1) / 5, 0, 1) * 255;
      // contact AO
      let ao = 1;
      if (dOcc && !occSeed[o]) {
        const dd = dOcc[o] / RES; // tiles
        let st = 0;
        for (let k = 0; k < 9 && !st; k++) { const xx = clamp(x + ((k % 3) - 1) * 3, 0, W - 1), yy = clamp(y + (((k / 3) | 0) - 1) * 3, 0, H - 1); st = Math.max(st, occ[yy * W + xx]); }
        st = st || 0.7;
        ao = 1 - st * 0.55 * Math.exp(-dd / 0.32);
      }
      mapData[q + 1] = clamp(ao, 0, 1) * 255;
      mapData[q + 2] = 0;
      mapData[q + 3] = 255;
    }
    // depth hint (deep kinds), blurred a little for smooth transitions
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = kind[((y / RES) | 0) * w + ((x / RES) | 0)];
      mapData[(y * W + x) * 4 + 2] = k === 2 || k === 7 ? 255 : k === 3 || k === 6 ? 0 : 110;
    }
    blurChannel(mapData, W, H, 2, 3);
    A.mapTex = new T.DataTexture(mapData, W, H, T.RGBAFormat);
    A.mapTex.magFilter = T.LinearFilter; A.mapTex.minFilter = T.LinearFilter; A.mapTex.generateMipmaps = false;
    A.mapTex.wrapS = A.mapTex.wrapT = T.ClampToEdgeWrapping; A.mapTex.colorSpace = T.NoColorSpace; A.mapTex.needsUpdate = true;
    // per-tile kind texture (nearest): R water kind (dilated into land so banks know their water), G special, B class
    const kd = new Uint8Array(w * h * 4);
    const dil = kind.slice();
    for (let pass = 0; pass < 3; pass++) {
      const prev = dil.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (prev[i]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && prev[ny * w + nx]) { dil[i] = prev[ny * w + nx]; break; }
        }
      }
    }
    const mainK = A.mainKind ? WATER_KIND[A.mainKind] : 1;
    for (let i = 0; i < w * h; i++) {
      kd[i * 4] = (dil[i] || mainK) * 32;
      kd[i * 4 + 1] = (SPECIAL[terr[i]] || 0) * 32;
      kd[i * 4 + 2] = (CLASS[terr[i]] || 0) * 32;
      kd[i * 4 + 3] = 255;
    }
    A.kindTex = new T.DataTexture(kd, w, h, T.RGBAFormat);
    A.kindTex.magFilter = T.NearestFilter; A.kindTex.minFilter = T.NearestFilter; A.kindTex.generateMipmaps = false;
    A.kindTex.colorSpace = T.NoColorSpace; A.kindTex.needsUpdate = true;
    // river flow ----------------------------------------------------------------------------------------
    const fl = new Uint8Array(w * h * 4).fill(128);
    const river = (i) => kind[i] === 5;
    const seen = new Uint8Array(w * h);
    for (let s = 0; s < w * h; s++) {
      if (!river(s) || seen[s]) continue;
      const comp = [], st = [s]; seen[s] = 1;
      while (st.length) {
        const i = st.pop(); comp.push(i);
        const x = i % w, y = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, j = ny * w + nx;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[j] && river(j)) { seen[j] = 1; st.push(j); }
        }
      }
      const axis = pca(comp.map((i) => [i % w, (i / w) | 0]));
      // downstream: toward the end of the component that touches the sea / map edge more
      let lo = Infinity, hi = -Infinity;
      for (const i of comp) { const p = (i % w) * axis[0] + ((i / w) | 0) * axis[1]; lo = Math.min(lo, p); hi = Math.max(hi, p); }
      let sLo = 0, sHi = 0;
      for (const i of comp) {
        const x = i % w, y = (i / w) | 0, p = x * axis[0] + y * axis[1];
        let ends = (!x || !y || x === w - 1 || y === h - 1) ? 1 : 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (y + dy) * w + x + dx; if (kind[j] && kind[j] !== 5 && kind[j] !== 6) ends += 2; }
        if (p - lo < (hi - lo) * 0.2) sLo += ends; if (hi - p < (hi - lo) * 0.2) sHi += ends;
      }
      const sign = sLo > sHi ? -1 : 1;
      for (const i of comp) {
        const x = i % w, y = (i / w) | 0;
        const loc = [];
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && river(ny * w + nx)) loc.push([nx, ny]); }
        let a = loc.length > 4 ? pca(loc) : axis;
        if (a[0] * axis[0] + a[1] * axis[1] < 0) a = [-a[0], -a[1]];
        fl[i * 4] = 128 + a[0] * sign * 120; fl[i * 4 + 1] = 128 + a[1] * sign * 120; fl[i * 4 + 2] = 255;
      }
    }
    A.flowTex = new T.DataTexture(fl, w, h, T.RGBAFormat);
    A.flowTex.magFilter = T.LinearFilter; A.flowTex.minFilter = T.LinearFilter; A.flowTex.generateMipmaps = false;
    A.flowTex.colorSpace = T.NoColorSpace; A.flowTex.needsUpdate = true;
    return A;
  }
  function pca(pts) {
    let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
    let xx = 0, xy = 0, yy = 0; for (const p of pts) { const dx = p[0] - mx, dy = p[1] - my; xx += dx * dx; xy += dx * dy; yy += dy * dy; }
    const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
    return [Math.cos(ang), Math.sin(ang)];
  }
  function blurChannel(data, W, H, ch, r) {
    const tmp = new Float32Array(W * H);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = pass ? x : clamp(x + k, 0, W - 1), yy = pass ? clamp(y + k, 0, H - 1) : y;
          s += data[(yy * W + xx) * 4 + ch]; n++;
        }
        tmp[y * W + x] = s / n;
      }
      for (let i = 0; i < W * H; i++) data[i * 4 + ch] = tmp[i];
    }
  }

  // ===================================================================================== mood / colour script
  function parseTint(s) {
    if (!s || typeof s !== 'string') return null;
    const m = /rgba?\(([^)]+)\)/.exec(s);
    if (!m) return null;
    const p = m[1].split(',').map((v) => parseFloat(v));
    return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p[3] != null ? p[3] : 1 };
  }
  const C = (hex) => new THREE.Color(hex);
  const PAL = {
    day: { zen: '#3f80d0', hor: '#cfe3ec', glow: '#fff0d0', sun: '#fff1dc', light: '#fff0d8', cLit: '#ffffff', cDark: '#9eb0c6', cover: 0.42 },
    golden: { zen: '#4a68ae', hor: '#ffd2a0', glow: '#ffb070', sun: '#ffc888', light: '#ffc890', cLit: '#ffe4c0', cDark: '#a07a92', cover: 0.5 },
    dusk: { zen: '#26346a', hor: '#f08c6c', glow: '#ff7a40', sun: '#ff8a50', light: '#ff9a62', cLit: '#ffa878', cDark: '#4c3660', cover: 0.55 },
    night: { zen: '#081030', hor: '#1c2850', glow: '#4a5c88', sun: '#cfd8ff', light: '#9fb6ff', cLit: '#3e4a72', cDark: '#0c1224', cover: 0.38 },
    overcast: { zen: '#7a8a9a', hor: '#b8c2ca', glow: '#d0d4d8', sun: '#e6e8ea', light: '#d8dce4', cLit: '#cdd2d8', cDark: '#68727e', cover: 0.95 },
  };
  function moodFrom(view, weather) {
    const lc = view.ms.lightCfg || {};
    const dark = clamp(lc.ambient || 0, 0, 0.95);
    const tint = parseTint(lc.tint);
    const lcol = C(lc.color || '#05081a');
    const warmTint = tint ? clamp(((tint.r - tint.b) / 255) * tint.a * 4, 0, 1) : 0;
    const coolTint = tint ? clamp(((tint.b - tint.r) / 255) * tint.a * 5, 0, 1) : 0;
    const warmCol = lc.color && lcol.r > lcol.b * 1.4 && dark > 0.06 ? 1 : 0;
    const night = sstep(0.36, 0.66, dark);
    const golden = Math.max(warmTint, warmCol * sstep(0.05, 0.2, dark)) * (1 - night);
    const dusk = golden * sstep(0.16, 0.38, dark);
    const rain = weather.rain || 0;
    const overcast = Math.max(rain, coolTint > 0.15 && dark < 0.25 ? 0.45 : 0, weather.mist > 1.2 ? 0.35 : 0);
    const m = { dark, night, golden, dusk, overcast, rain, warmTint, coolTint, tint };
    const mix = (key) => {
      const c = C(PAL.day[key]);
      c.lerp(C(PAL.golden[key]), golden); c.lerp(C(PAL.dusk[key]), dusk);
      c.lerp(C(PAL.overcast[key]), overcast * (1 - night * 0.6));
      const n = C(PAL.night[key]);
      if (key === 'zen' || key === 'hor') n.lerp(lcol, key === 'zen' ? 0.35 : 0.25);
      c.lerp(n, night);
      return c;
    };
    for (const k of ['zen', 'hor', 'glow', 'sun', 'light', 'cLit', 'cDark']) m[k] = mix(k);
    m.cover = lerp(lerp(lerp(lerp(PAL.day.cover, PAL.golden.cover, golden), PAL.dusk.cover, dusk), PAL.overcast.cover, overcast), PAL.night.cover, night);
    m.sunElev = lerp(lerp(1.0, 0.64, golden), 0.46, dusk);
    // post grade per environment
    let p;
    if (view.cave) p = { bloom: 0.72, thr: 0.58, vig: 0.58, sat: 0.96, tint: [0.95, 0.98, 1.05], exp: 1.04 };
    else if (view.interior) p = { bloom: 0.52, thr: 0.74, vig: 0.46, sat: 1.06, tint: [1.04, 1.0, 0.95], exp: 1.04 };
    else {
      p = { bloom: 0.36, thr: 0.86, vig: 0.3, sat: 1.1, tint: [1.0, 1.0, 1.0], exp: 1.02 };
      const g = { bloom: 0.5, thr: 0.8, vig: 0.34, sat: 1.12, tint: [1.05, 1.0, 0.93], exp: 1.02 };
      const d = { bloom: 0.62, thr: 0.72, vig: 0.42, sat: 1.1, tint: [1.06, 0.97, 0.96], exp: 1.03 };
      const n = { bloom: 0.8, thr: 0.6, vig: 0.5, sat: 0.94, tint: [0.9, 0.96, 1.1], exp: 1.06 };
      const o = { bloom: 0.34, thr: 0.86, vig: 0.36, sat: 0.86, tint: [0.95, 0.98, 1.03], exp: 1.0 };
      p = lerpPost(p, g, golden); p = lerpPost(p, d, dusk); p = lerpPost(p, o, overcast * (1 - night)); p = lerpPost(p, n, night);
    }
    if (tint && tint.a > 0.02) { // the 2D tint overlay becomes a gentle grade
      const k = clamp(tint.a, 0, 0.35) * 0.6, mx = Math.max(tint.r, tint.g, tint.b, 1);
      p.tint = p.tint.map((v, i) => v * lerp(1, [tint.r, tint.g, tint.b][i] / mx * 1.08, k));
    }
    m.post = p;
    return m;
  }
  function lerpPost(a, b, k) {
    if (k <= 0) return a;
    return { bloom: lerp(a.bloom, b.bloom, k), thr: lerp(a.thr, b.thr, k), vig: lerp(a.vig, b.vig, k), sat: lerp(a.sat, b.sat, k), exp: lerp(a.exp, b.exp, k), tint: a.tint.map((v, i) => lerp(v, b.tint[i], k)) };
  }

  // ===================================================================================== GLSL
  const GLSL_COMMON = `
    uniform sampler2D uNoise; uniform float uTime;
    float eHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float eHash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    float eFbm(vec2 p){ return texture2D(uNoise, p).r * 0.62 + texture2D(uNoise, p * 2.03 + 0.37).g * 0.38; }
    vec3 eHue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  `;
  const GLSL_SKY = `
    uniform vec3 uZen, uHor, uGlow, uSunCol, uCLit, uCDark, uSunDir, uMoonDir;
    uniform float uNight, uCover, uPsy, uStars;
    uniform vec2 uCloudOff;
    vec3 skyColor(vec3 d, float cloudK){
      float y = d.y, yy = max(y, 0.0);
      vec3 c = mix(uHor, uZen, pow(yy, 0.5));
      if (y < 0.0) c = mix(uHor, uHor * 0.55, clamp(-y * 2.5, 0.0, 1.0));
      float sd = max(dot(d, uSunDir), 0.0);
      float day = 1.0 - uNight;
      c += uGlow * (pow(sd, 5.0) * 0.45 + pow(sd, 48.0) * 0.7) * day * (1.0 - yy * 0.5);
      c += uSunCol * smoothstep(0.99925, 0.9997, sd) * 10.0 * day;
      float md = max(dot(d, uMoonDir), 0.0);
      vec3 moonC = vec3(0.92, 0.95, 1.0);
      float disc = smoothstep(0.99880, 0.99915, md);
      float crater = texture2D(uNoise, (d.xz - uMoonDir.xz) * 9.0 + 0.5).g;
      c += moonC * (disc * (1.8 - crater * 0.7) + pow(md, 260.0) * 0.25 + pow(md, 14.0) * 0.05) * uNight;
      if (uNight > 0.02 && y > -0.02) {
        // stars: point grid on the direction cube + Milky Way band with dust lanes
        vec3 q = d * 150.0; vec3 iq = floor(q);
        float h = eHash3(iq);
        float sz = smoothstep(0.48, 0.0, length(fract(q) - 0.5 - (vec3(eHash3(iq + 3.1), eHash3(iq + 7.7), eHash3(iq + 1.3)) - 0.5) * 0.5));
        float tw = 0.75 + 0.25 * sin(uTime * (0.6 + h * 1.4) + h * 40.0);
        float st = step(0.982, h) * sz * tw * (0.5 + 2.0 * step(0.996, h));
        vec3 mwN = normalize(vec3(0.42, 0.55, -0.72));
        float band = exp(-pow(dot(d, mwN) * 3.6, 2.0));
        vec2 mwp = vec2(atan(d.z, d.x) * 0.6, dot(d, mwN));
        float dust = texture2D(uNoise, mwp * vec2(0.8, 3.0) + 0.21).r;
        float glowB = band * (0.55 + 0.6 * texture2D(uNoise, mwp * vec2(1.6, 4.0)).g) * smoothstep(0.25, 0.65, dust + 0.15);
        vec3 mw = mix(vec3(0.32, 0.36, 0.62), vec3(0.72, 0.62, 0.78), texture2D(uNoise, mwp * 2.0).b) * glowB * 0.55;
        float extra = step(0.94, h) * sz * band * 0.8;
        c += (vec3(st + extra) * mix(vec3(1.0), vec3(0.75, 0.85, 1.0), eHash3(iq + 9.0)) + mw) * uNight * uStars * smoothstep(-0.02, 0.2, y);
      }
      if (cloudK > 0.0 && y > -0.08) {
        // painterly clouds: plane projection, two layers, light from the sun side, soft banding
        vec2 uv = d.xz / (yy + 0.14) * 0.11 + uCloudOff;
        float n = eFbm(uv);
        float n2 = eFbm(uv + uSunDir.xz * 0.025);
        float th = 1.0 - uCover;
        float dens = smoothstep(th - 0.06, th + 0.22, n);
        dens = mix(dens, floor(dens * 4.0 + 0.5) / 4.0, 0.25); // gentle brush banding
        float lit = clamp((n - n2) * 5.0 + 0.55 + (1.0 - dens) * 0.3, 0.0, 1.0);
        vec3 cc = mix(uCDark, uCLit, lit);
        cc += uGlow * pow(sd, 6.0) * (1.0 - dens) * 0.9 * day;  // silver lining
        cc += vec3(0.65, 0.72, 0.95) * pow(md, 8.0) * (1.0 - dens) * 0.35 * uNight;
        float hz = smoothstep(-0.05, 0.22, y);
        // high wispy layer
        vec2 uv2 = d.xz / (yy + 0.3) * 0.05 + uCloudOff * 0.6 + 3.7;
        float w2 = smoothstep(0.55, 0.85, texture2D(uNoise, uv2 * vec2(1.0, 3.0)).g) * 0.35;
        c = mix(c, mix(uCLit, uHor, 0.3), w2 * hz * cloudK * (1.0 - uNight * 0.5));
        c = mix(c, cc, dens * hz * 0.92 * cloudK);
      }
      if (uPsy > 0.001) {
        // kaleidoscope: fold the azimuth into 8 mirrored segments, slow hue rotation (no strobing)
        float a = atan(d.z, d.x); float seg = 6.2831853 / 8.0;
        a = abs(mod(a + uTime * 0.03, seg) - seg * 0.5);
        float r = 1.0 - yy;
        vec2 kp = vec2(cos(a), sin(a)) * r * 2.2;
        float pat = texture2D(uNoise, kp * 0.35 + vec2(uTime * 0.01, 0.0)).r;
        float rings = 0.5 + 0.5 * sin(r * 22.0 - uTime * 0.35 + pat * 6.0);
        vec3 kc = eHue(pat * 0.8 + r * 0.6 + uTime * 0.025) * (0.35 + 0.65 * rings);
        c = mix(c, kc * 1.15 + c * 0.25, clamp(uPsy, 0.0, 1.0) * 0.75);
      }
      return c;
    }
  `;

  // ===================================================================================== shared uniforms
  function makeUniforms() {
    const T = THREE;
    return {
      uNoise: { value: getNoise() }, uRipple: { value: getRipple() }, uTime: { value: 0 },
      uZen: { value: new T.Color() }, uHor: { value: new T.Color() }, uGlow: { value: new T.Color() }, uSunCol: { value: new T.Color() },
      uCLit: { value: new T.Color() }, uCDark: { value: new T.Color() }, uSunDir: { value: new T.Vector3(-0.4, 0.7, 0.3).normalize() },
      uMoonDir: { value: new T.Vector3(0, 0.5, -1).normalize() }, uGlintDir: { value: new T.Vector3(0, 0.5, -1).normalize() },
      uNight: { value: 0 }, uCover: { value: 0.45 }, uPsy: { value: 0 }, uStars: { value: 1 }, uCloudOff: { value: new T.Vector2() },
      uMapSize: { value: new T.Vector2(1, 1) }, uMapTex: { value: null }, uKindTex: { value: null }, uFlowTex: { value: null },
      uCloudShadow: { value: 0 }, uWet: { value: 0 }, uDetail: { value: 1 }, uSpecialK: { value: 1 }, uAmb: { value: new T.Color(1, 1, 1) },
      uWind: { value: new T.Vector2(1, 0.25) }, uWindK: { value: 0.3 }, uLightK: { value: 1 }, uCenter: { value: new T.Vector3() },
      uPL: { value: Array.from({ length: 12 }, () => new T.Vector4(0, -100, 0, 0)) }, uPLC: { value: Array.from({ length: 12 }, () => new T.Color(0, 0, 0)) },
      uShoreFoam: { value: 1 }, uSwell: { value: 1 },
    };
  }

  // ===================================================================================== sky
  function skyMaterial(U, cloudK) {
    const T = THREE;
    return new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: Object.assign({ time: { value: 0 }, zen: { value: U.uZen.value }, hor: { value: U.uHor.value }, stars: { value: 0 } }, U), // lead's names kept (mapview writes .time)
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: GLSL_COMMON + GLSL_SKY + `varying vec3 vP;
        void main(){ vec3 c = skyColor(normalize(vP), ${cloudK.toFixed(2)}); gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }
  function setupSky(view, S) {
    if (!view.outdoor) return;
    if (view.sky) {
      const old = view.sky.material;
      view.sky.material = skyMaterial(S.U, 1);
      old.dispose();
    }
    rebuildEnvMap(view, S);
  }
  // IBL from the painted sky (replaces the lead's gradient room); rebuilt when the mood changes
  function rebuildEnvMap(view, S) {
    if (!view.outdoor || !G.R3.renderer) return;
    safe('pmrem', () => {
      const T = THREE, pm = new T.PMREMGenerator(G.R3.renderer);
      const sc = new T.Scene();
      const m = new T.Mesh(new T.SphereGeometry(10, 32, 16), skyMaterial(S.U, 0.6));
      m.material.toneMapped = false;
      sc.add(m);
      const rt = pm.fromScene(sc, 0.03);
      if (view.envRT && view.envRT !== rt) view.envRT.dispose();
      view.envRT = rt;
      view.scene.environment = rt.texture;
      pm.dispose(); m.geometry.dispose(); m.material.dispose();
    });
  }

  // ===================================================================================== water
  const WATER_PARAMS = {
    // kind: [shallow rgb, deep rgb, alphaShallow, alphaDeep, reflect, flow, swell, foam]
    1: ['#3fa6a8', '#14466e', 0.55, 0.97, 1.0, 0.0, 1.0, 1.0], // sea
    2: ['#2c8896', '#0b2f58', 0.75, 0.985, 1.0, 0.0, 1.15, 0.9], // deep
    3: ['#6cc4bc', '#2e7f96', 0.45, 0.84, 0.9, 0.0, 0.45, 0.8], // shallow
    4: ['#4f9c94', '#1c5466', 0.6, 0.92, 1.1, 0.0, 0.15, 0.45], // lake
    5: ['#5aa8a0', '#235e70', 0.58, 0.9, 0.85, 1.0, 0.1, 0.8], // river
    6: ['#5e6e3e', '#2c3a24', 0.75, 0.94, 0.55, 0.05, 0.05, 0.15], // marsh
    7: ['#0a1426', '#010309', 0.94, 0.99, 0.45, 0.0, 0.6, 0.0], // black sea
  };
  function setupWater(view, S) {
    if (!view.water) return;
    const T = THREE, U = S.U, A = S.A;
    const shal = [], deep = [], par = [];
    for (let k = 0; k <= 7; k++) {
      const p = WATER_PARAMS[k] || WATER_PARAMS[1];
      shal.push(C(p[0])); deep.push(C(p[1]));
      par.push(new T.Vector4(p[2], p[3], p[4], p[5]), new T.Vector4(p[6], p[7], 0, 0));
    }
    const uni = Object.assign({}, U, T.UniformsUtils.clone(T.UniformsLib.fog), {
      uShal: { value: shal }, uDeep: { value: deep }, uPar: { value: par },
      uMainKind: { value: A.mainKind ? WATER_KIND[A.mainKind] : 1 }, uEdge: { value: A.edgeWater ? 1 : 0 },
    });
    const low = QUAL() === 'low';
    const mat = new T.ShaderMaterial({
      uniforms: uni, transparent: true, depthWrite: false, fog: true,
      defines: low ? { LOWQ: 1 } : {},
      vertexShader: `varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        ${GLSL_COMMON}${GLSL_SKY}
        uniform sampler2D uRipple, uMapTex, uKindTex, uFlowTex;
        uniform vec2 uMapSize, uWind; uniform vec3 uGlintDir, uAmb; uniform float uCloudShadow, uWindK, uMainKind, uEdge, uLightK, uShoreFoam;
        uniform vec3 uShal[8], uDeep[8]; uniform vec4 uPar[16]; uniform vec4 uPL[12]; uniform vec3 uPLC[12];
        varying vec3 vW;
        vec2 rip(vec2 p){ return texture2D(uRipple, p).xy * 2.0 - 1.0; }
        void main(){
          vec2 muv = vW.xz / uMapSize;
          vec2 cuv = clamp(muv, vec2(0.5) / (uMapSize * 4.0), 1.0 - vec2(0.5) / (uMapSize * 4.0));
          vec4 md = texture2D(uMapTex, cuv);
          float outd = max(max(-muv.x, muv.x - 1.0) * uMapSize.x, max(-muv.y, muv.y - 1.0) * uMapSize.y);
          // bilinear blend of the per-tile water kinds (no seams between shallow / deep / river tiles)
          vec2 tc = clamp(muv, 0.0, 1.0) * uMapSize - 0.5; vec2 tf = fract(tc), ti = floor(tc);
          vec3 kShal = vec3(0.0), kDeep = vec3(0.0); vec4 P0 = vec4(0.0), P1 = vec4(0.0); float blackW = 0.0;
          for (int j = 0; j < 4; j++) {
            vec2 o = vec2(float(j - (j / 2) * 2), float(j / 2));
            vec2 kc = clamp((ti + o + 0.5) / uMapSize, vec2(0.0), vec2(0.999));
            float kk = floor(texture2D(uKindTex, kc).r * 255.0 / 32.0 + 0.5);
            if (kk < 0.5) kk = uMainKind;
            int ki = int(kk);
            float wgt = (o.x > 0.5 ? tf.x : 1.0 - tf.x) * (o.y > 0.5 ? tf.y : 1.0 - tf.y);
            kShal += uShal[ki] * wgt; kDeep += uDeep[ki] * wgt; P0 += uPar[ki * 2] * wgt; P1 += uPar[ki * 2 + 1] * wgt;
            blackW += (ki == 7 ? 1.0 : 0.0) * wgt;
          }
          float sd = md.r * 5.0 - 1.0;                       // signed shore distance (tiles)
          if (outd > 0.0) sd = mix(sd, 4.0 + outd, uEdge);    // open sea beyond the map edge
          float deepK = smoothstep(0.0, 3.2, sd) * (0.55 + 0.45 * md.b);
          bool black = blackW > 0.5;
          // ---- normals: swell (analytic) + ripples (flow-mapped for rivers)
          vec2 p = vW.xz;
          vec2 flow = (texture2D(uFlowTex, cuv).rg * 2.0 - 1.0) * P0.w;
          float sw = P1.x * (0.35 + 0.65 * smoothstep(0.0, 2.5, sd)) * (0.6 + uWindK);
          vec2 wd = normalize(uWind + vec2(0.0001));
          // shore-facing direction (waves roll in toward land)
          float e = 1.0 / (uMapSize.x * 4.0);
          vec2 g = vec2(texture2D(uMapTex, cuv + vec2(e, 0.0)).r - texture2D(uMapTex, cuv - vec2(e, 0.0)).r,
                        texture2D(uMapTex, cuv + vec2(0.0, e)).r - texture2D(uMapTex, cuv - vec2(0.0, e)).r);
          vec2 sdir = length(g) > 0.0001 ? -normalize(g) : wd;
          vec2 dirs[4]; dirs[0] = normalize(mix(wd, sdir, 0.6)); dirs[1] = normalize(dirs[0] + vec2(0.45, -0.3)); dirs[2] = normalize(dirs[0] + vec2(-0.5, 0.35)); dirs[3] = normalize(vec2(-dirs[0].y, dirs[0].x) * 0.4 + dirs[0]);
          float hgt = 0.0; vec2 dh = vec2(0.0);
          float fr[4]; fr[0] = 0.55; fr[1] = 0.9; fr[2] = 1.45; fr[3] = 2.3;
          float am[4]; am[0] = 0.09; am[1] = 0.05; am[2] = 0.03; am[3] = 0.015;
          for (int i = 0; i < 4; i++) {
            float ph = dot(dirs[i], p) * fr[i] - uTime * sqrt(fr[i] * 9.8) * 0.45 + float(i) * 1.7;
            hgt += am[i] * sin(ph); dh += am[i] * fr[i] * cos(ph) * dirs[i];
          }
          hgt *= sw; dh *= sw;
          float ts = uTime * 0.045;
          vec2 r1, r2;
          if (P0.w > 0.01) {
            float ph0 = fract(uTime * 0.22), ph1 = fract(uTime * 0.22 + 0.5);
            vec2 f = flow * 1.6;
            vec2 a0 = rip(p * 0.42 - f * ph0), a1 = rip(p * 0.42 - f * ph1 + 0.5);
            r1 = mix(a0, a1, abs(1.0 - 2.0 * ph0));
            r2 = rip(p * 0.19 - f * uTime * 0.05 + 0.3);
          } else {
            r1 = rip(p * 0.37 + vec2(ts, ts * 0.6));
            r2 = rip(p * 0.16 - vec2(ts * 0.7, -ts * 0.8));
          }
          vec2 rp = (r1 * 0.6 + r2 * 0.4) * (0.22 + 0.25 * uWindK) * (black ? 0.6 : 1.0);
          vec3 N = normalize(vec3(-dh.x * 1.8 + rp.x, 1.0, -dh.y * 1.8 + rp.y));
          vec3 V = normalize(cameraPosition - vW);
          float ndv = clamp(dot(N, V), 0.0, 1.0);
          float F = (0.03 + 0.97 * pow(1.0 - ndv, 4.0)) * P0.z;
          vec3 R = reflect(-V, N); R.y = abs(R.y);
          vec3 sky = skyColor(R, 1.0) * (1.0 - 0.45 * uNight);
          // ---- body colour (depth tint), crest scatter, caustics
          vec3 body = mix(kShal, kDeep, deepK);
          float cs = 1.0;
          if (uCloudShadow > 0.0) cs = 1.0 - uCloudShadow * smoothstep(0.42, 0.7, texture2D(uNoise, p * 0.011 + uCloudOff * 0.35).r);
          vec3 lightC = uAmb + uSunCol * max(uSunDir.y, 0.0) * 0.55 * (1.0 - uNight) * cs;
          body *= lightC;
          body += kShal * smoothstep(0.02, 0.12, hgt) * 0.35 * (1.0 - uNight) * (1.0 - deepK * 0.5);
          #ifndef LOWQ
          if (!black) {
            float c1 = texture2D(uNoise, p * 0.23 + vec2(ts * 2.0, ts)).a, c2 = texture2D(uNoise, p * 0.31 - vec2(ts * 1.4, ts * 2.2) + 0.5).a;
            float caus = pow(1.0 - min(c1, c2), 10.0);
            body += uSunCol * caus * (1.0 - smoothstep(0.0, 0.6, deepK)) * 0.14 * (1.0 - uNight) * cs;
          }
          #endif
          vec3 col = mix(body, sky, clamp(F, 0.0, 1.0));
          // ---- specular: sun/moon glints + sparkle
          vec3 L = normalize(uGlintDir);
          vec3 H = normalize(L + V);
          float nh = max(dot(N, H), 0.0);
          vec3 glC = mix(uSunCol, vec3(0.75, 0.82, 1.0) * 0.3, uNight) * (black ? 0.35 : 1.0);
          float spec = pow(nh, 420.0) * 4.0 + pow(nh, 60.0) * 0.12;
          #ifndef LOWQ
          float spk = step(0.82, texture2D(uNoise, p * 1.7 + vec2(uTime * 0.05, -uTime * 0.04)).b) * pow(nh, 18.0);
          spec += spk * 1.6 * (0.4 + uWindK);
          #endif
          col += glC * spec * cs;
          // ---- lantern / light reflections (pool lights)
          vec3 lr = vec3(0.0);
          for (int i = 0; i < 12; i++) {
            vec4 pl = uPL[i];
            if (pl.w <= 0.001) continue;
            vec3 dl = pl.xyz - vW; float dd = length(dl); vec3 ld = dl / dd;
            float rr = max(dot(R, ld), 0.0);
            lr += uPLC[i] * pl.w * (pow(rr, 90.0) * 2.2 + pow(rr, 10.0) * 0.08) / (1.0 + dd * dd * 0.015);
          }
          col += lr * (black ? 0.6 : 1.0);
          // ---- foam: shore lapping lines, river banks, whitecaps
          float foam = 0.0;
          if (P1.y > 0.0) {
            vec2 fp = p * 0.6 + vec2(ts * 3.0, 0.0);
            float fn = texture2D(uNoise, fp).g, fw = texture2D(uNoise, p * 1.3 + flow * uTime * 0.25).a;
            float band = (1.0 - smoothstep(-0.05, 0.4, sd + (fn - 0.5) * 0.5)) * (0.45 + 0.55 * smoothstep(0.3, 0.7, fn));
            float lines = smoothstep(0.55, 0.95, sin(sd * 9.0 - uTime * 1.6 + fn * 5.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.1, 1.1, sd));
            foam = clamp(band * 0.9 + lines * 0.55, 0.0, 1.0) * smoothstep(0.08, 0.55, fw + band * 0.4);
            foam += smoothstep(0.075, 0.16, hgt) * smoothstep(0.55, 0.9, fn) * uWindK * 0.8;
            if (P0.w > 0.01) foam += smoothstep(0.6, 0.95, texture2D(uNoise, p * vec2(0.9, 0.9) - flow * uTime * 0.35).b) * 0.22 * (1.0 - smoothstep(0.0, 1.0, sd));
            foam = clamp(foam * P1.y * uShoreFoam, 0.0, 1.0);
            col = mix(col, uAmb * 1.25 + uSunCol * 0.6 * (1.0 - uNight) * cs, foam * 0.85);
          }
          // ---- black sea: inky depth with drifting phosphorescence
          if (black) {
            vec2 bp = p * 0.55 + vec2(uTime * 0.012, -uTime * 0.02);
            float cell = texture2D(uNoise, bp).a, cid = texture2D(uNoise, bp * 0.125).r;
            float pulse = 0.5 + 0.5 * sin(uTime * 0.7 + cid * 37.0);
            float spec2 = smoothstep(0.42, 0.62, cell) * smoothstep(0.62, 0.85, texture2D(uNoise, p * 0.9 - uTime * 0.01).b);
            float surf = (1.0 - smoothstep(-0.1, 0.9, sd)) * pow(0.5 + 0.5 * sin(sd * 7.0 - uTime * 0.9), 3.0);
            float wisps = smoothstep(0.62, 0.8, texture2D(uNoise, p * 0.08 + vec2(uTime * 0.006, 0.0)).r) * 0.25;
            vec3 ph = mix(vec3(0.1, 0.9, 0.85), vec3(0.45, 0.6, 1.0), cid);
            col += ph * (spec2 * pulse * 1.1 + surf * 0.12 + wisps * (0.5 + 0.4 * pulse)) * blackW;
          }
          // ---- psychedelic iridescence
          if (uPsy > 0.001) col = mix(col, col * 0.6 + eHue(dot(p, vec2(0.05, 0.08)) + uTime * 0.03 + hgt * 2.0) * 0.6 * (0.4 + F), uPsy * 0.45);
          float alpha = mix(P0.x, P0.y, deepK);
          alpha = clamp(alpha + F * 0.25 + foam * 0.5, 0.0, 1.0);
          alpha *= smoothstep(-0.32, -0.02, sd); // fade where the bank rises above the water line
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const old = view.water.material;
    view.water.material = mat;
    view.water.receiveShadow = false;
    if (old && old.dispose) old.dispose();
    S.waterMat = mat;
  }

  // ===================================================================================== ground / wall / apron patches
  const GROUND_PARS = `
    uniform sampler2D uMapTex, uKindTex; uniform vec2 uMapSize, uCloudOff;
    uniform float uCloudShadow, uWet, uDetail, uSpecialK, uPsy, uNight;
    varying vec3 vEnvW;
    float eDetailH(vec2 p, float cls){
      if (cls < 0.5) return 0.0;
      if (cls < 1.5) return texture2D(uNoise, p * vec2(0.55, 1.4)).b * 0.6 + texture2D(uNoise, p * 1.7).b * 0.4;
      if (cls < 2.5) return 1.0 - texture2D(uNoise, p * 0.33).a * 0.8 - texture2D(uNoise, p * 0.9).b * 0.2;
      if (cls < 3.5) return sin(p.x * 7.0 + p.y * 2.0 + texture2D(uNoise, p * 0.09).r * 9.0) * 0.35 + 0.35 + texture2D(uNoise, p * 1.4).b * 0.3;
      return texture2D(uNoise, p * vec2(0.06, 1.3)).g;
    }
    vec3 ePerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy){
      vec3 vSigmaX = dFdx(surf_pos), vSigmaY = dFdy(surf_pos), vN = surf_norm;
      vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
      float fDet = dot(vSigmaX, R1);
      vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
      return normalize(abs(fDet) * surf_norm - vGrad);
    }
    float eCloudSh(vec2 p){ return uCloudShadow * smoothstep(0.42, 0.7, texture2D(uNoise, p * 0.011 + uCloudOff * 0.35).r); }
  `;
  function patchGround(mat, U) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      for (const k of ['uNoise', 'uTime', 'uMapTex', 'uKindTex', 'uMapSize', 'uCloudOff', 'uCloudShadow', 'uWet', 'uDetail', 'uSpecialK', 'uPsy', 'uNight']) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEnvW; uniform float uPsy, uTime;')
        .replace('#include <project_vertex>', `vEnvW = (modelMatrix * vec4(transformed, 1.0)).xyz;
          if (uPsy > 0.001) { transformed.y += sin(uTime * 0.55 + length(vEnvW.xz - vec2(20.0)) * 0.35) * 0.05 * uPsy; }
          #include <project_vertex>`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + GROUND_PARS)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 eMuv = vEnvW.xz / uMapSize;
          vec4 eMd = texture2D(uMapTex, clamp(eMuv, 0.0, 1.0));
          vec4 eKd = texture2D(uKindTex, clamp(eMuv, 0.0, 0.999));
          float eCls = floor(eKd.b * 255.0 / 32.0 + 0.5), eSp = floor(eKd.g * 255.0 / 32.0 + 0.5);
          float eLum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb *= mix(1.0, eMd.g, 0.9);
          diffuseColor.rgb *= 1.0 - eCloudSh(vEnvW.xz);
          float ePud = smoothstep(0.5, 0.68, texture2D(uNoise, vEnvW.xz * 0.045).r);
          diffuseColor.rgb *= 1.0 - uWet * (0.22 + 0.2 * ePud);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, mix(0.55, 0.12, ePud), uWet);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (uDetail > 0.0 && eCls > 0.5) {
            float eH = eDetailH(vEnvW.xz, eCls);
            normal = ePerturb(-vViewPosition, normal, vec2(dFdx(eH), dFdy(eH)) * uDetail * 0.1 * (1.0 - uWet * ePud));
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec3 em = vec3(0.0); vec2 p = vEnvW.xz;
            if (eSp > 0.5) {
              if (eSp < 1.5) { // moss_glow: breathing bioluminescent speckles
                float n = texture2D(uNoise, p * 0.55).b, pulse = 0.55 + 0.45 * sin(uTime * 0.9 + texture2D(uNoise, p * 0.07).r * 14.0);
                em = vec3(0.25, 1.0, 0.72) * (smoothstep(0.58, 0.82, n) * 1.4 + eLum * 0.25) * pulse * (0.3 + 0.7 * uNight);
              } else if (eSp < 2.5) { // spirit_floor: flowing veins of light
                float w = texture2D(uNoise, p * 0.18 + vec2(0.0, uTime * 0.012)).a;
                float vein = smoothstep(0.16, 0.0, w) * (0.6 + 0.4 * sin(uTime * 0.8 - p.y * 0.6));
                em = vec3(0.55, 0.8, 1.0) * (vein * 1.3 + eLum * 0.18);
              } else if (eSp < 3.5) { // vision: slow iridescent flow
                em = eHue(p.x * 0.05 + p.y * 0.035 + uTime * 0.03) * (0.25 + 0.35 * eLum) * (0.75 + 0.25 * sin(uTime * 0.6 + p.x * 0.3));
              } else if (eSp < 4.5) { // lantern_bridge: warm pulses travelling along the planks
                float pl = pow(0.5 + 0.5 * sin((p.x + p.y) * 0.9 - uTime * 1.6), 4.0);
                em = vec3(1.0, 0.62, 0.25) * (0.25 + pl * 0.9) * (0.4 + eLum);
              } else if (eSp < 5.5) { // breath: slow breathing glow
                em = vec3(0.85, 0.5, 1.0) * (0.5 + 0.5 * sin(uTime * 0.75)) * (0.2 + eLum * 0.45);
              } else { // cloud: soft drifting brightness
                em = vec3(0.92, 0.95, 1.0) * (0.12 + 0.3 * texture2D(uNoise, p * 0.08 + vec2(uTime * 0.01, 0.0)).r) * (0.5 + eLum);
              }
              totalEmissiveRadiance += em * uSpecialK;
            }
            if (uPsy > 0.001) totalEmissiveRadiance += eHue(dot(p, vec2(0.04, 0.03)) + uTime * 0.02 + texture2D(uNoise, p * 0.05).r) * diffuseColor.rgb * 0.45 * uPsy;
          }`);
    };
    const pk = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return (pk ? pk.call(this) : '') + '|envground'; };
    mat.needsUpdate = true;
  }
  // walls: base AO gradient, cloud shadows, wet darkening
  function patchWall(mat, U) {
    if (mat.userData.envWall) return;
    mat.userData.envWall = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      for (const k of ['uNoise', 'uTime', 'uCloudOff', 'uCloudShadow', 'uWet']) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEnvW; varying float vEnvNy;')
        .replace('#include <project_vertex>', 'vEnvW = (modelMatrix * vec4(transformed, 1.0)).xyz; vEnvNy = normalize(mat3(modelMatrix) * objectNormal).y;\n#include <project_vertex>');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uNoise; uniform float uTime, uCloudShadow, uWet; uniform vec2 uCloudOff; varying vec3 vEnvW; varying float vEnvNy;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          { float side = 1.0 - abs(vEnvNy);
            float ao = mix(1.0, mix(0.5, 1.0, smoothstep(0.0, 1.3, vEnvW.y)), side);
            float streak = texture2D(uNoise, vec2(vEnvW.x + vEnvW.z, vEnvW.y * 0.15) * 0.35).g;
            ao *= 1.0 - side * smoothstep(0.55, 0.85, streak) * 0.18;  // weather staining
            diffuseColor.rgb *= ao;
            diffuseColor.rgb *= 1.0 - uCloudShadow * smoothstep(0.42, 0.7, texture2D(uNoise, vEnvW.xz * 0.011 + uCloudOff * 0.35).r);
            diffuseColor.rgb *= 1.0 - uWet * 0.18; }`);
    };
    const pk = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return (pk ? pk.call(this) : '') + '|envwall'; };
    mat.needsUpdate = true;
  }

  // ===================================================================================== particles (GPU-animated)
  // Every particle is an instanced quad whose motion is computed in the vertex shader from per-instance seeds and
  // time, wrapped in a box around the camera target (zero per-frame CPU cost).
  const P_VERT = `
    attribute vec4 aSeed; attribute vec3 aCol; uniform float uTime;
    uniform vec3 uCenter, uBox; uniform float uSpeed, uSize, uY0, uY1; uniform vec2 uWind; uniform float uWindK;
    varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vShade; varying float vSeed;
    vec3 wrapXZ(vec3 p){ vec3 lo = uCenter - uBox * 0.5; p.x = lo.x + mod(p.x - lo.x, uBox.x); p.z = lo.z + mod(p.z - lo.z, uBox.z); return p; }
    float edgeF(vec3 p){ vec2 q = abs(p.xz - uCenter.xz) / (uBox.xz * 0.5); return 1.0 - smoothstep(0.72, 1.0, max(q.x, q.y)); }
    mat3 rotE(vec3 a){ float cx = cos(a.x), sx = sin(a.x), cy = cos(a.y), sy = sin(a.y), cz = cos(a.z), sz = sin(a.z);
      return mat3(cy * cz, cy * sz, -sy, sx * sy * cz - cx * sz, sx * sy * sz + cx * cz, sx * cy, cx * sy * cz + sx * sz, cx * sy * sz - sx * cz, cx * cy); }
    void main(){
      vUv = uv; vCol = aCol; vSeed = aSeed.w; vShade = 1.0;
      vec4 s = aSeed; float t = uTime;
      float H = uY1 - uY0;
      vec3 c; float a = 1.0; float sz = uSize * (0.6 + 0.8 * s.w);
      vec3 qv = vec3(position.xy, 0.0);
      vec3 wpos;
      #if MODE == 0
        // rain streaks
        float sp = uSpeed * (0.85 + 0.3 * s.w);
        vec3 v = vec3(uWind.x * 0.25 * (1.0 + uWindK * 3.0), -sp, uWind.y * 0.25 * (1.0 + uWindK * 3.0));
        c = vec3(s.x * uBox.x, 0.0, s.z * uBox.z) + vec3(v.x, 0.0, v.z) * (t / sp) * 0.0;
        c.y = uY0 + mod(s.y * H - sp * t, H);
        c.xz += v.xz / sp * (uY1 - c.y);
        c = wrapXZ(c);
        vec3 ax = normalize(v);
        vec3 side = normalize(cross(ax, normalize(cameraPosition - c)));
        wpos = c + ax * (position.y * uSize * 18.0) + side * position.x * uSize;
        a = edgeF(c) * smoothstep(uY0, uY0 + 0.4, c.y);
      #elif MODE == 1
        // camera-facing sprites (snow, ash, embers, motes, dust, fireflies, sparkles, lantern halos)
        #if KIND == 1
          c = vec3(s.x * uBox.x + sin(t * 0.7 + s.w * 30.0) * 0.4 + uWind.x * t * 0.35, 0.0, s.z * uBox.z + cos(t * 0.5 + s.y * 20.0) * 0.4 + uWind.y * t * 0.35);
          c.y = uY0 + mod(s.y * H - uSpeed * (0.7 + 0.6 * s.w) * t, H);
          a = smoothstep(uY0, uY0 + 0.3, c.y) * smoothstep(uY1, uY1 - 1.0, c.y);
        #elif KIND == 2
          c = vec3(s.x * uBox.x + sin(t * 1.3 + s.w * 40.0) * 0.5 + uWind.x * t * 0.2, 0.0, s.z * uBox.z + cos(t * 1.1 + s.x * 30.0) * 0.5 + uWind.y * t * 0.2);
          c.y = uY0 + mod(s.y * H + uSpeed * (0.6 + 0.8 * s.w) * t, H);
          float life = (c.y - uY0) / H;
          a = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.45, 1.0, life)) * (0.55 + 0.45 * sin(t * 9.0 + s.w * 60.0) * sin(t * 4.3 + s.x * 20.0));
          sz *= 1.0 - life * 0.6;
        #elif KIND == 3
          c = vec3(s.x * uBox.x, uY0 + s.y * H, s.z * uBox.z) + vec3(sin(t * 0.21 + s.w * 50.0), sin(t * 0.17 + s.x * 40.0) * 0.4, cos(t * 0.19 + s.z * 30.0)) * 0.9 * uSpeed;
          c.y += mod(t * 0.08 * uSpeed + s.w * H, H) * 0.0;
          a = 0.45 + 0.55 * sin(t * (0.5 + s.w) + s.x * 30.0) * 0.5 + 0.275;
        #elif KIND == 4
          c = vec3(s.x * uBox.x, uY0 + s.y * H, s.z * uBox.z) + vec3(sin(t * 0.37 + s.w * 20.0) * 1.3, sin(t * 0.53 + s.x * 13.0) * 0.45, cos(t * 0.29 + s.z * 17.0) * 1.3);
          a = pow(0.5 + 0.5 * sin(t * (0.55 + s.w * 0.5) + s.w * 40.0), 5.0) * 0.9 + 0.1;
        #elif KIND == 5
          c = vec3(s.x * uBox.x + sin(t * 0.3 + s.w * 9.0) * 1.5, uY0 + s.y * H + sin(t * 0.4 + s.x * 9.0) * 0.6, s.z * uBox.z + cos(t * 0.25 + s.y * 9.0) * 1.5);
          a = max(0.0, sin(t * (0.45 + s.w * 0.4) + s.x * 50.0));
          sz *= 0.4 + 0.6 * a;
        #else
          // sky lanterns: rise slowly with sway
          c = vec3(s.x * uBox.x + sin(t * 0.35 + s.w * 20.0) * 0.5 + uWind.x * t * 0.12, 0.0, s.z * uBox.z + cos(t * 0.28 + s.x * 20.0) * 0.4 + uWind.y * t * 0.12);
          c.y = uY0 + mod(s.y * H + uSpeed * (0.7 + 0.6 * s.w) * t, H);
          float life = (c.y - uY0) / H;
          a = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.75, 1.0, life));
          sz *= 1.0 - life * 0.25;
        #endif
        c = wrapXZ(c);
        a *= edgeF(c);
        vec4 mv = viewMatrix * vec4(c, 1.0);
        #if KIND == 6
          mv.xy += position.xy * vec2(sz * 0.78, sz);
        #else
          mv.xy += position.xy * sz;
        #endif
        float cd = -mv.z;
        a *= smoothstep(1.5, 4.0, cd);
        gl_Position = projectionMatrix * mv;
        vA = a;
        return;
      #elif MODE == 2
        // tumbling flat shapes (petals, leaves)
        vec3 cc = vec3(s.x * uBox.x + uWind.x * t * (0.9 + s.w) + sin(t * 1.4 + s.w * 30.0) * 0.6, 0.0, s.z * uBox.z + uWind.y * t * (0.9 + s.w) + cos(t * 1.1 + s.y * 20.0) * 0.4);
        cc.y = uY0 + mod(s.y * H - uSpeed * (0.7 + 0.6 * s.w) * t, H);
        c = wrapXZ(cc);
        mat3 rm = rotE(vec3(t * (1.3 + s.x * 2.0) + s.y * 9.0, t * (0.9 + s.z) + s.w * 7.0, t * 0.7 + s.x * 5.0));
        vec3 nrm = rm * vec3(0.0, 0.0, 1.0);
        vShade = 0.55 + 0.45 * abs(nrm.y);
        wpos = c + rm * vec3(position.x * uSize * 1.5, position.y * uSize, 0.0);
        a = edgeF(c) * smoothstep(uY0, uY0 + 0.25, c.y);
      #elif MODE == 3
        // flat horizontal cards: mist banks
        c = vec3(s.x * uBox.x + uWind.x * t * 0.18 * (0.6 + s.w), uY0 + s.y * H, s.z * uBox.z + uWind.y * t * 0.18 * (0.6 + s.w));
        c = wrapXZ(c);
        float rot = s.w * 6.28 + t * 0.01 * (s.x - 0.5);
        vec2 q = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * position.xy * sz;
        wpos = c + vec3(q.x, 0.0, q.y);
        a = edgeF(c);
      #elif MODE == 4
        // wind streaks (horizontal, fading in and out)
        float ph = fract(t * 0.35 * (0.7 + s.w * 0.6) + s.x * 7.0);
        vec2 wd = normalize(uWind + vec2(0.0001));
        c = vec3(s.x * uBox.x, uY0 + s.y * H, s.z * uBox.z) + vec3(wd.x, 0.0, wd.y) * t * uSpeed * (0.7 + 0.5 * s.w);
        c.y += sin(t * 2.0 + s.w * 20.0) * 0.15;
        c = wrapXZ(c);
        vec3 ax = vec3(wd.x, sin(t * 3.0 + s.y * 10.0) * 0.05, wd.y);
        vec3 side = normalize(cross(ax, normalize(cameraPosition - c)));
        wpos = c + ax * position.y * uSize * 60.0 * (0.6 + s.w) + side * position.x * uSize;
        a = edgeF(c) * sin(ph * 3.14159);
      #else
        // rain splash rings on the ground (re-seeded every cycle)
        float rate = 1.6 + s.w;
        float cyc = floor(t * rate + s.y * 10.0); float ph = fract(t * rate + s.y * 10.0);
        vec3 r = vec3(fract(sin(cyc * 12.9898 + s.x * 78.2) * 43758.5), 0.0, fract(sin(cyc * 39.346 + s.z * 11.1) * 24634.6));
        c = wrapXZ(uCenter - uBox * 0.5 + r * uBox);
        c.y = 0.025;
        wpos = c + vec3(position.x, 0.0, position.y) * uSize * (0.4 + ph * 1.6);
        a = (1.0 - ph) * edgeF(c);
        vA = ph;
      #endif
      vA = a;
      #if MODE == 5
        vShade = 1.0 - ph;
      #endif
      gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);
    }`;
  const P_FRAG = `
    uniform float uAlpha, uLightK, uTime; uniform sampler2D uNoise; uniform vec3 uTint;
    varying vec2 vUv; varying vec3 vCol; varying float vA; varying float vShade; varying float vSeed;
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d) * 4.0;
      float a; vec3 col = vCol;
      #if SHAPE == 0
        a = pow(1.0 - min(1.0, abs(d.x) * 2.0), 2.0) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        col *= uLightK;
      #elif SHAPE == 1
        a = exp(-r2 * 4.5) + exp(-r2 * 28.0) * 0.8;
      #elif SHAPE == 2
        a = smoothstep(1.0, 0.55, r2);
        col *= uLightK;
      #elif SHAPE == 3
        // petal / leaf
        vec2 q = d * 2.0; float e = q.x * q.x + q.y * q.y * 1.15 + q.x * q.y * 0.3;
        a = smoothstep(1.0, 0.82, e);
        float rib = smoothstep(0.08, 0.0, abs(q.y + q.x * 0.1)) * step(vSeed, 0.6);
        col *= vShade * (1.0 - rib * 0.25) * uLightK * (0.85 + 0.3 * (0.5 - q.y * 0.5));
      #elif SHAPE == 4
        // 4-point star (sparkles), slowly hue-cycling
        float s1 = exp(-abs(d.x) * 40.0) * exp(-abs(d.y) * 6.0), s2 = exp(-abs(d.y) * 40.0) * exp(-abs(d.x) * 6.0);
        a = clamp(s1 + s2 + exp(-r2 * 30.0), 0.0, 1.0);
        col = mix(vCol, clamp(abs(mod((vSeed + uTime * 0.04) * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0) + 0.35, 0.7);
      #elif SHAPE == 5
        // sky lantern: tapered paper body with warm gradient + rim + soft halo
        vec2 q = vec2(d.x, d.y);
        float halfW = mix(0.2, 0.29, smoothstep(-0.36, 0.3, q.y));
        float body = step(abs(q.x), halfW) * step(-0.36, q.y) * step(q.y, 0.34);
        float edge = smoothstep(halfW - 0.05, halfW, abs(q.x));
        vec3 paper = mix(vec3(3.2, 1.35, 0.45), vec3(1.4, 0.38, 0.12), smoothstep(-0.36, 0.34, q.y));
        paper *= 1.0 - edge * 0.45;
        paper *= 0.9 + 0.1 * sin(q.y * 60.0);
        float halo = exp(-dot(d, d) * 9.0) * 0.55;
        col = paper * body + vec3(1.0, 0.55, 0.2) * halo * (1.0 - body);
        a = max(body, halo);
      #elif SHAPE == 6
        // mist card from noise
        float n = texture2D(uNoise, vUv * 0.55 + vec2(vSeed * 3.1, vSeed * 1.7) + uTime * 0.004).r;
        float n2 = texture2D(uNoise, vUv * 1.2 - vec2(uTime * 0.006, vSeed)).g;
        a = smoothstep(1.0, 0.15, r2) * smoothstep(0.25, 0.75, n * 0.75 + n2 * 0.35);
        col *= uLightK;
      #elif SHAPE == 7
        // splash ring
        float rr = sqrt(r2);
        a = smoothstep(0.12, 0.0, abs(rr - 0.8)) * vShade + exp(-r2 * 40.0) * vShade * 0.6;
        col *= uLightK;
      #else
        a = smoothstep(1.0, 0.0, abs(d.x) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
        col *= uLightK;
      #endif
      a *= vA * uAlpha;
      if (a < 0.003) discard;
      gl_FragColor = vec4(col * uTint, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  // preset → particle system specs
  function presetSpecs(name, dens, opts, S) {
    const k = dens * QK();
    const out = [];
    const sp = (o) => out.push(Object.assign({ n: 100, mode: 1, kind: 1, shape: 1, size: 0.05, speed: 1, y: [0, 6], box: [34, 0, 28], blend: 'add', alpha: 1, colors: ['#ffffff'] }, o));
    switch (name) {
      case 'rain':
        sp({ n: 1400 * k, mode: 0, shape: 0, size: 0.03, speed: 15, y: [0, 13], box: [36, 0, 30], blend: 'normal', alpha: 0.5, colors: ['#c8d8f0', '#a8bfe0', '#e0eaf8'] });
        sp({ n: 260 * k, mode: 5, shape: 7, size: 0.14, y: [0, 1], box: [26, 0, 20], blend: 'normal', alpha: 0.55, colors: ['#dfe9f5'] });
        break;
      case 'snow':
        sp({ n: 900 * k, mode: 1, kind: 1, shape: 2, size: 0.06, speed: 0.9, y: [0, 12], blend: 'normal', alpha: 0.9, colors: ['#ffffff', '#eef4ff'] });
        break;
      case 'ash':
        sp({ n: 500 * k, mode: 1, kind: 1, shape: 2, size: 0.04, speed: 0.7, y: [0, 10], blend: 'normal', alpha: 0.7, colors: ['#8a8a8a', '#6e6a68', '#a8a4a0'] });
        break;
      case 'petals':
        sp({ n: 320 * k, mode: 2, shape: 3, size: 0.07, speed: 0.55, y: [0, 9], blend: 'normal', alpha: 0.95, colors: ['#ffc8d8', '#ffb0c8', '#fff0f4', '#ffd6e4'] });
        break;
      case 'leaves':
        sp({ n: 200 * k, mode: 2, shape: 3, size: 0.09, speed: 0.7, y: [0, 9], blend: 'normal', alpha: 0.95, colors: ['#7aa83a', '#a8b83a', '#c89a3a', '#5a8a2a', '#d8a040'] });
        break;
      case 'embers':
        sp({ n: 260 * k, mode: 1, kind: 2, shape: 1, size: 0.08, speed: 1.1, y: [0, 7], colors: ['#ffb050', '#ff7a3a', '#ffd080'], alpha: 1.3 });
        break;
      case 'motes':
        sp({ n: 120 * k, mode: 1, kind: 3, shape: 1, size: 0.09, speed: 1, y: [0.2, 4.5], colors: ['#a8e0ff', '#e0f4ff', '#c8b8ff'], alpha: 0.6 });
        break;
      case 'dust':
        sp({ n: 220 * k, mode: 1, kind: 3, shape: 1, size: 0.035, speed: 0.4, y: [0.1, 3.2], box: [26, 0, 20], colors: ['#e8d8b8', '#d8c8a8'], alpha: 0.5 });
        break;
      case 'fireflies':
        sp({ n: 120 * k, mode: 1, kind: 4, shape: 1, size: 0.16, y: [0.25, 2.4], colors: ['#d8ff7a', '#fff3a0', '#b8ffb0'], alpha: 1.6 });
        break;
      case 'sparkles':
        sp({ n: 170 * k, mode: 1, kind: 5, shape: 4, size: 0.22, y: [0.3, 4.5], colors: ['#ffffff'], alpha: 1.1 });
        break;
      case 'lanterns':
        sp({ n: 75 * k, mode: 1, kind: 6, shape: 5, size: 0.6, speed: 0.45, y: [0, 15], box: [40, 0, 34], blend: 'normal', alpha: 1, colors: ['#ffffff'] });
        break;
      case 'mist': {
        const c = (opts && opts.color) || null;
        sp({ n: 18 * k + 6, mode: 3, shape: 6, size: 10, y: [0.3, 1.5], box: [46, 0, 40], blend: 'normal', alpha: ((opts && opts.alpha) || 0.16) * 1.3, colors: [c || S.mistColor || '#dce4f0'] });
        break;
      }
      case 'wind':
        sp({ n: 60 * k, mode: 4, shape: 8, size: 0.02, speed: 11, y: [0.4, 3.5], box: [34, 0, 26], blend: 'add', alpha: 0.28, colors: ['#e8f0ff'] });
        break;
      default: break;
    }
    return out;
  }
  function buildSystem(spec, U) {
    const T = THREE;
    const n = Math.max(1, Math.round(spec.n));
    const base = new T.PlaneGeometry(1, 1);
    const geo = new T.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    const seeds = new Float32Array(n * 4), cols = new Float32Array(n * 3), r = rng(Math.floor(Math.random() * 1e9));
    const cc = spec.colors.map((h) => C(h));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 4; j++) seeds[i * 4 + j] = r();
      const c = cc[Math.floor(r() * cc.length)];
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('aSeed', new T.InstancedBufferAttribute(seeds, 4));
    geo.setAttribute('aCol', new T.InstancedBufferAttribute(cols, 3));
    geo.instanceCount = n;
    const box = spec.box;
    const mat = new T.ShaderMaterial({
      uniforms: {
        uTime: U.uTime, uCenter: U.uCenter, uWind: U.uWind, uWindK: U.uWindK, uLightK: U.uLightK, uNoise: U.uNoise,
        uBox: { value: new T.Vector3(box[0], 1, box[2]) }, uSpeed: { value: spec.speed }, uSize: { value: spec.size },
        uY0: { value: spec.y[0] }, uY1: { value: spec.y[1] }, uAlpha: { value: spec.alpha }, uTint: { value: new T.Color(1, 1, 1) },
      },
      defines: { MODE: spec.mode, KIND: spec.kind || 0, SHAPE: spec.shape },
      vertexShader: P_VERT, fragmentShader: P_FRAG,
      transparent: true, depthWrite: false, side: T.DoubleSide,
      blending: spec.blend === 'add' ? T.AdditiveBlending : T.NormalBlending,
      toneMapped: spec.shape !== 5,
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = spec.mode === 3 ? 4 : 5;
    mesh.userData.spec = spec;
    return mesh;
  }
  function buildWeather(view, S) {
    clearWeather(view, S);
    const ms = view.ms;
    const groups = (ms.particles && ms.particles.groups) || [];
    S.weather = { rain: 0, snow: 0, mist: 0, wind: 0, lanterns: 0, fireflies: 0, leaves: 0, dust: 0, names: [] };
    S.mistColor = '#' + S.U.uHor.value.clone().lerp(new THREE.Color(1, 1, 1), 0.45).getHexString();
    for (const g of groups) {
      const dens = g.opts && g.opts.density ? g.opts.density : 1;
      S.weather.names.push(g.name);
      if (S.weather[g.name] != null) S.weather[g.name] += dens;
      for (const spec of presetSpecs(g.name, dens, g.opts, S)) {
        const m = safe('particles ' + g.name, () => buildSystem(spec, S.U));
        if (m) { view.scene.add(m); S.systems.push(m); }
      }
    }
    // the 3D systems replace the 2D presets: hide the screen-space duplicates and the lead's world-space points
    // Keep one invisible 2D particle (black under 'lighter' adds nothing): with a completely empty 2D canvas, the
    // lead's G.FX.vision overlay feedback buffer turns opaque in Chrome (see docs/r3d_reports/env.md).
    const blank = () => ({ x: G.W / 2, y: G.H / 2, vx: 0, vy: 0, ph: 0, c: '#000000' });
    if (ms.particles) ms.particles.groups = [{ name: 'dust', p: { space: 'screen', make: blank }, parts: [blank()], opts: {}, env3d: true }];
    for (const pg of view.pGroups || []) if (pg.pts) pg.pts.visible = false;
    S.particlesRef = ms.particles;
  }
  function clearWeather(view, S) {
    for (const m of S.systems || []) { view.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    S.systems = [];
  }

  // ===================================================================================== light shafts
  function buildShafts(view, S) {
    const T = THREE, ms = view.ms, w = ms.w, h = ms.h;
    const list = [];
    const r = rng(w * 131 + h * 7);
    const walk = (x, y) => view.walkable(x, y);
    const W = S.weather;
    const dark = S.mood.dark;
    if (view.interior && !view.cave && dark < 0.55) {
      // window shafts from the north wall slanting onto the floor
      const cand = [];
      for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if (walk(x, y) && view.isWall(x, y - 1)) cand.push([x, y]);
      cand.sort(() => r() - 0.5);
      const take = [];
      for (const c of cand) { if (take.length >= 4) break; if (take.every((t) => Math.abs(t[0] - c[0]) > 3)) take.push(c); }
      for (const [x, y] of take) list.push({ a: [x + 0.3, 3.0, y - 0.2], b: [x + 1.3, 0, y + 2.3], w: 0.9, col: '#ffe2b0', k: 0.22 });
    } else if (view.cave && dark < 0.92 && !/mine/.test(ms.def.id || '')) {
      const cand = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (walk(x, y) && r() < 0.01) cand.push([x, y]);
      for (const [x, y] of cand.slice(0, 3)) list.push({ a: [x - 0.6, 7, y - 1.4], b: [x + 0.4, 0, y + 0.6], w: 1.3, col: '#a8c8ff', k: 0.07 });
    } else if (view.outdoor && dark < 0.42 && (W.mist || W.leaves || W.dust || S.forest)) {
      const sd = view.sunDir.clone().normalize();
      const n = Math.round(clamp(w * h / 70, 6, 18));
      for (let i = 0; i < n * 3 && list.length < n; i++) {
        const x = r() * w, y = r() * h;
        if (!walk(Math.floor(x), Math.floor(y))) continue;
        const L = 10;
        list.push({ a: [x + sd.x * L, sd.y * L, y + sd.z * L], b: [x, 0, y], w: 1 + r() * 1.6, col: S.mood.golden > 0.3 ? '#ffd090' : '#fff2d0', k: 0.075 + 0.05 * W.mist });
      }
    }
    if (!list.length) return;
    const n = list.length;
    const base = new T.PlaneGeometry(1, 1);
    const geo = new T.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    const A = new Float32Array(n * 4), B = new Float32Array(n * 4), Cc = new Float32Array(n * 3);
    list.forEach((s, i) => {
      A.set([s.a[0], s.a[1], s.a[2], s.w], i * 4); B.set([s.b[0], s.b[1], s.b[2], s.k], i * 4);
      const c = C(s.col); Cc.set([c.r, c.g, c.b], i * 3);
    });
    geo.setAttribute('aA', new T.InstancedBufferAttribute(A, 4));
    geo.setAttribute('aB', new T.InstancedBufferAttribute(B, 4));
    geo.setAttribute('aCol', new T.InstancedBufferAttribute(Cc, 3));
    geo.instanceCount = n;
    const mat = new T.ShaderMaterial({
      uniforms: { uTime: S.U.uTime, uNoise: S.U.uNoise, uK: { value: 1 } },
      vertexShader: `attribute vec4 aA, aB; attribute vec3 aCol; varying vec2 vUv; varying vec3 vCol; varying float vK; varying float vS;
        void main(){ vUv = uv; vCol = aCol; vK = aB.w; vS = aA.x * 0.37 + aA.z * 0.11;
          vec3 a = aA.xyz, b = aB.xyz; vec3 ax = b - a; vec3 m = mix(a, b, 1.0 - uv.y);
          vec3 side = normalize(cross(normalize(ax), normalize(cameraPosition - m)));
          vec3 p = m + side * position.x * aA.w * mix(1.15, 0.7, uv.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uTime, uK; uniform sampler2D uNoise; varying vec2 vUv; varying vec3 vCol; varying float vK; varying float vS;
        void main(){ float x = abs(vUv.x - 0.5) * 2.0;
          float a = pow(1.0 - x, 1.6) * smoothstep(1.0, 0.7, vUv.y) * smoothstep(0.0, 0.3, vUv.y);
          float n = texture2D(uNoise, vec2(vUv.x * 0.6 + vS, vUv.y * 0.15 - uTime * 0.01)).r;
          a *= 0.55 + 0.6 * n; a *= 0.75 + 0.25 * sin(uTime * 0.35 + vS * 10.0);
          gl_FragColor = vec4(vCol * a * vK * uK, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 6;
    view.scene.add(mesh);
    S.shafts = mesh;
    // dense dust motes inside interior shafts
    if (view.interior && !view.cave) {
      for (const s of list) {
        const spec = { n: 40 * QK(), mode: 1, kind: 3, shape: 1, size: 0.03, speed: 0.25, y: [0.3, 2.6], box: [1.4, 0, 2.2], blend: 'add', alpha: 0.9, colors: ['#fff0c8'] };
        const m = buildSystem(spec, S.U);
        m.material.uniforms.uCenter = { value: new T.Vector3((s.a[0] + s.b[0]) / 2, 0, (s.a[2] + s.b[2]) / 2) };
        view.scene.add(m); S.statics.push(m);
      }
    }
  }

  // ===================================================================================== cave crystals / ore glints
  function buildCrystals(view, S) {
    if (!view.cave) return;
    const T = THREE, ms = view.ms, w = ms.w, h = ms.h;
    const gold = /mine/.test(ms.def.id || '');
    const r = rng(w * 17 + h * 3 + 5);
    const spots = [];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!view.walkable(x, y)) continue;
      for (const [dx, dy] of dirs) if (view.isWall(x + dx, y + dy) && r() < (gold ? 0.07 : 0.11) * QK()) { spots.push([x + 0.5 + dx * 0.4, y + 0.5 + dy * 0.4]); break; }
    }
    if (!spots.length) return;
    const per = gold ? 3 : 4;
    const geo = new T.OctahedronGeometry(1, 0);
    geo.scale(0.07, 0.3, 0.07); geo.translate(0, 0.22, 0);
    const mat = new T.MeshStandardMaterial({ color: gold ? 0xd8b050 : 0x9adfff, roughness: 0.18, metalness: gold ? 0.8 : 0.1, emissive: gold ? 0xffb040 : 0x60c8ff, emissiveIntensity: gold ? 0.6 : 1.4, transparent: !gold, opacity: 0.9 });
    const pulse = { value: 1 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uPulse = pulse;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uPulse;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor * uPulse;\n#endif');
    };
    mat.customProgramCacheKey = () => 'envcrystal';
    const n = spots.length * per;
    const im = new T.InstancedMesh(geo, mat, n);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
    const pal = gold ? ['#ffd070', '#ffb040', '#fff0a0'] : ['#7ad8ff', '#b088ff', '#90fff0', '#c8a0ff'];
    let k = 0;
    for (const [x, z] of spots) {
      const hue = pal[Math.floor(r() * pal.length)];
      for (let j = 0; j < per; j++) {
        e.set((r() - 0.5) * 0.9, r() * 6.28, (r() - 0.5) * 0.9); q.setFromEuler(e);
        const sc = gold ? 0.35 + r() * 0.3 : 0.55 + r() * 0.7;
        s.set(sc, sc * (0.7 + r() * 0.6), sc);
        p.set(x + (r() - 0.5) * 0.35, 0, z + (r() - 0.5) * 0.35);
        m4.compose(p, q, s);
        im.setMatrixAt(k, m4); im.setColorAt(k, C(hue)); k++;
      }
    }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = false; im.receiveShadow = true;
    view.scene.add(im);
    S.crystals = { mesh: im, pulse, spots, gold, hue: gold ? '#ffb850' : '#80c8ff' };
    S.statics.push(im);
  }

  // ===================================================================================== ground light pools (night)
  function buildGlowPool(view, S) {
    const T = THREE, n = 64;
    const base = new T.PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
    const geo = new T.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv);
    const P = new T.InstancedBufferAttribute(new Float32Array(n * 4), 4), Cc = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    P.setUsage(T.DynamicDrawUsage); Cc.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('aP', P); geo.setAttribute('aCol', Cc); geo.instanceCount = 0;
    const mat = new T.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uTime: S.U.uTime },
      vertexShader: `attribute vec4 aP; attribute vec3 aCol; varying vec2 vUv; varying vec3 vCol;
        void main(){ vUv = uv; vCol = aCol; vec3 p = vec3(aP.x, 0.03, aP.z) + position * aP.w; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uK; varying vec2 vUv; varying vec3 vCol;
        void main(){ vec2 d = vUv - 0.5; float a = exp(-dot(d, d) * 14.0); gl_FragColor = vec4(vCol * a * uK, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 3;
    view.scene.add(mesh);
    S.glow = { mesh, P, Cc, n };
  }
  function refreshGlowPool(view, S) {
    const g = S.glow;
    if (!g) return;
    let ls = [];
    try { ls = view.collectLights(); } catch (e) { ls = []; }
    let k = 0;
    const c = new THREE.Color();
    for (const l of ls) {
      if (l.player || k >= g.n) continue;
      c.set(l.color || '#ffb060');
      if (l.y < 0.25) continue;
      const rad = clamp(l.r * 0.6, 0.9, 3.2);
      g.P.setXYZW(k, l.x, 0, l.z, rad);
      g.Cc.setXYZ(k, c.r * (l.i || 1), c.g * (l.i || 1), c.b * (l.i || 1));
      k++;
    }
    g.mesh.geometry.instanceCount = k;
    g.P.needsUpdate = true; g.Cc.needsUpdate = true;
  }

  // ===================================================================================== sea of clouds (mountain maps)
  function buildCloudSea(view, S) {
    const T = THREE, ms = view.ms;
    const geo = new T.PlaneGeometry(420, 420, 1, 1); geo.rotateX(-Math.PI / 2);
    const mat = new T.ShaderMaterial({
      uniforms: Object.assign({}, S.U, T.UniformsUtils.clone(T.UniformsLib.fog)),
      fog: true, transparent: true, depthWrite: false,
      vertexShader: `varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        ${GLSL_COMMON}
        uniform vec3 uCLit, uCDark, uHor, uSunCol, uSunDir, uAmb; uniform float uNight; varying vec3 vW;
        void main(){
          vec2 p = vW.xz * 0.018 + vec2(uTime * 0.0035, uTime * 0.0012);
          float n = eFbm(p) * 0.7 + texture2D(uNoise, p * 3.1 + uTime * 0.002).b * 0.3;
          float n2 = eFbm(p + uSunDir.xz * 0.012) * 0.7 + texture2D(uNoise, (p + uSunDir.xz * 0.012) * 3.1 + uTime * 0.002).b * 0.3;
          float lit = clamp((n - n2) * 6.0 + 0.6, 0.0, 1.0);
          vec3 c = mix(uCDark, uCLit, lit * 0.7 + n * 0.45);
          c = mix(c, uHor, 0.25);
          c += uSunCol * pow(lit, 3.0) * 0.18 * (1.0 - uNight);
          float a = smoothstep(0.15, 0.5, n) * 0.25 + 0.75;
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const sea = new T.Mesh(geo, mat);
    sea.position.set(ms.w / 2, -2.2, ms.h / 2);
    sea.renderOrder = 1;
    view.scene.add(sea);
    S.cloudSea = sea; S.statics.push(sea);
    if (view.apron) { view.apron.position.y = -9; view.apron.material.color.copy(S.U.uHor.value).multiplyScalar(0.55); }
    // rock skirt so the plateau edge reads as cliffs dropping into the clouds
    const sk = new T.Group();
    const rock = G.R3M.env({ color: 0x4a4640, roughness: 1, cutout: false });
    const mk = (len, x, z, ry) => {
      const g = new T.PlaneGeometry(len, 9, Math.max(1, Math.round(len)), 6);
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const yy = pos.getY(i); pos.setZ(i, (G.U.hash(Math.round(pos.getX(i) * 3), Math.round(yy * 3), 9) - 0.5) * 0.35 * (yy < 4 ? 1 : 0)); }
      g.computeVertexNormals();
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const v = clamp((pos.getY(i) + 4.5) / 9, 0, 1) * 0.8 + 0.2; cols.set([v, v, v * 1.02], i * 3); }
      g.setAttribute('color', new T.BufferAttribute(cols, 3));
      const m = new T.Mesh(g, rock); m.material.vertexColors = true;
      m.position.set(x, -4.5, z); m.rotation.y = ry; sk.add(m);
    };
    mk(ms.w, ms.w / 2, 0, Math.PI); mk(ms.w, ms.w / 2, ms.h, 0); mk(ms.h, 0, ms.h / 2, -Math.PI / 2); mk(ms.h, ms.w, ms.h / 2, Math.PI / 2);
    view.scene.add(sk); S.statics.push(sk);
  }

  // ===================================================================================== psychedelic set dressing
  function buildPsy(view, S) {
    const T = THREE, ms = view.ms;
    const g = new T.Group();
    // kaleidoscope floor beyond the map (replaces the plain apron look)
    if (view.outdoor) {
      const geo = new T.PlaneGeometry(300, 300); geo.rotateX(-Math.PI / 2);
      const mat = new T.ShaderMaterial({
        uniforms: { uTime: S.U.uTime, uNoise: S.U.uNoise, uPsy: S.U.uPsy, uC: { value: new T.Vector2(ms.w / 2, ms.h / 2) } },
        transparent: true, depthWrite: false,
        vertexShader: 'varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: GLSL_COMMON.replace('uniform float uTime;', 'uniform float uTime;') + `uniform float uPsy; uniform vec2 uC; varying vec3 vW;
          void main(){ vec2 d = vW.xz - uC; float r = length(d) * 0.05; float a = atan(d.y, d.x); float seg = 6.2831853 / 12.0;
            a = abs(mod(a + uTime * 0.02, seg) - seg * 0.5);
            vec2 kp = vec2(cos(a), sin(a)) * r;
            float n = texture2D(uNoise, kp * 0.6 + vec2(uTime * 0.006, 0.0)).r;
            float rings = 0.5 + 0.5 * sin(r * 14.0 - uTime * 0.3 + n * 7.0);
            vec3 c = eHue(n * 0.9 + r * 0.25 + uTime * 0.02) * (0.25 + 0.55 * rings) * 0.8;
            gl_FragColor = vec4(c, uPsy * 0.85);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const m = new T.Mesh(geo, mat);
      m.position.set(ms.w / 2, -0.035, ms.h / 2); m.renderOrder = -1;
      g.add(m);
    }
    // slowly turning luminous rings hovering over the realm
    const ringMat = new T.ShaderMaterial({
      uniforms: { uTime: S.U.uTime, uPsy: S.U.uPsy },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime, uPsy; varying vec2 vUv;
        vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ float a = (0.35 + 0.25 * sin(vUv.x * 62.83 + uTime * 0.4)) * uPsy * 0.32; gl_FragColor = vec4(hue(vUv.x + uTime * 0.03) * a, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    });
    const r = rng(99);
    for (let i = 0; i < 5; i++) {
      const m = new T.Mesh(new T.TorusGeometry(2.2 + r() * 3.5, 0.025, 6, 96), ringMat);
      m.position.set(r() * ms.w, 3.5 + r() * 3, r() * ms.h);
      m.rotation.x = Math.PI / 2 + (r() - 0.5) * 0.5;
      m.userData.spin = (r() - 0.5) * 0.12;
      g.add(m);
    }
    view.scene.add(g);
    S.psy = g; S.statics.push(g);
  }

  // ===================================================================================== decorate
  E.decorate = function (view) {
    const T = THREE;
    if (!T) return;
    if (view.env) E.dispose(view);
    const S = { U: makeUniforms(), systems: [], statics: [], frame: 0, view };
    view.env = S;
    S.parts = {};
    const ms = view.ms;
    S.U.uMapSize.value.set(ms.w, ms.h);
    S.A = safe('analyse', () => analyse(view)) || null;
    if (!S.A) return;
    S.U.uMapTex.value = S.A.mapTex; S.U.uKindTex.value = S.A.kindTex; S.U.uFlowTex.value = S.A.flowTex;
    S.terrSnap = ms.terrain.slice();
    const id = ms.def.id || '', place = val(ms.def.place) || '';
    S.mountain = /alishan|yushan/.test(place) || /alishan|yushan|cloud_forest/.test(id) || S.A.cloudTiles > 20 || (G.state.flags.ch7_seaofclouds && /alishan/.test(id));
    S.forest = /forest|mist|grove|trail|gorge|lair/.test(id);
    S.U.uDetail.value = QUAL() === 'low' ? 0 : QUAL() === 'ultra' ? 1.2 : 0.9;
    // weather first (the mood reads it), then mood
    S.weather = { rain: 0, mist: 0, names: [] };
    buildWeatherCounts(view, S);
    applyMood(view, S, true);
    S.U.uWet.value = S.weather.rain > 0 ? 1 : 0;
    safe('weather', () => buildWeather(view, S));
    S.parts.weather = S.weather.names.join('+') || 'none';
    safe('sky', () => setupSky(view, S)); if (view.outdoor) S.parts.sky = 1;
    safe('water', () => setupWater(view, S)); if (S.waterMat) S.parts.water = 1;
    safe('ground', () => { for (const ch of view.chunks || []) patchGround(ch.mesh.material, S.U); }); S.parts.ground = 1;
    safe('walls', () => patchWalls(view, S));
    if (view.apron) safe('apron', () => patchApron(view.apron.material, S.U));
    safe('shafts', () => buildShafts(view, S)); if (S.shafts) S.parts.shafts = 1;
    safe('crystals', () => buildCrystals(view, S)); if (S.crystals) S.parts.crystals = 1;
    safe('glow', () => buildGlowPool(view, S));
    if (S.mountain && view.outdoor) { safe('cloudsea', () => buildCloudSea(view, S)); S.parts.cloudsea = 1; }
    const psyMap = (val(ms.def.psychedelic) || 0) > 0 || /vision|breath|realm|dream/.test(id);
    if (psyMap) { safe('psy', () => buildPsy(view, S)); S.parts.psy = 1; }
    // extra lights: crystals glow into the point-light pool
    if (S.crystals && !view._envLights) {
      const orig = view.collectLights;
      view._envLights = true;
      view.collectLights = function () {
        const out = orig.call(this);
        const cr = this.env && this.env.crystals;
        if (cr) for (let i = 0; i < cr.spots.length; i += 3) out.push({ x: cr.spots[i][0], y: 0.5, z: cr.spots[i][1], color: cr.hue, i: 0.5, r: 2.6, flicker: 0 });
        return out;
      };
    }
    // nature team hooks
    if (G.Nature3D && G.Nature3D.scatterGrass) safe('grass', () => G.Nature3D.scatterGrass(view));
    // clean up with the view
    if (!view._envDispose) {
      const d = view.dispose;
      view._envDispose = true;
      view.dispose = function () { E.dispose(this); return d.apply(this, arguments); };
    }
    refreshGlowPool(view, S);
  };
  function buildWeatherCounts(view, S) {
    const groups = (view.ms.particles && view.ms.particles.groups) || [];
    for (const g of groups) {
      const d = g.opts && g.opts.density ? g.opts.density : 1;
      if (g.name === 'rain') S.weather.rain = Math.min(1, 0.35 + d);
      if (g.name === 'mist') S.weather.mist = (S.weather.mist || 0) + d;
    }
  }
  function patchWalls(view, S) {
    if (!view.wallGroup) return;
    view.wallGroup.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial) patchWall(o.material, S.U); });
    S.wallRef = view.wallGroup;
  }
  function patchApron(mat, U) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      for (const k of ['uNoise', 'uCloudOff', 'uCloudShadow']) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEnvW;')
        .replace('#include <project_vertex>', 'vEnvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uNoise; uniform vec2 uCloudOff; uniform float uCloudShadow; varying vec3 vEnvW;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb *= 0.85 + 0.3 * texture2D(uNoise, vEnvW.xz * 0.05).r;
          diffuseColor.rgb *= 1.0 - uCloudShadow * smoothstep(0.42, 0.7, texture2D(uNoise, vEnvW.xz * 0.011 + uCloudOff * 0.35).r);`);
    };
    mat.customProgramCacheKey = () => 'envapron';
    mat.needsUpdate = true;
  }

  // mood → uniforms, lights, fog, post targets
  function applyMood(view, S, snap) {
    const m = moodFrom(view, S.weather || {});
    S.mood = m;
    S.lcRef = view.ms.lightCfg;
    S.lcSig = JSON.stringify(view.ms.lightCfg || {});
    S.target = m;
    if (snap) S.cur = { k: 1 };
    S.blend = snap ? 1 : 0;
    const U = S.U;
    const set = (u, c) => { if (snap) u.value.copy(c); };
    set(U.uZen, m.zen); set(U.uHor, m.hor); set(U.uGlow, m.glow); set(U.uSunCol, m.sun); set(U.uCLit, m.cLit); set(U.uCDark, m.cDark);
    if (snap) { U.uNight.value = m.night; U.uCover.value = m.cover; }
    view.dark = m.dark;
  }
  function stepMood(view, S, dt) {
    const m = S.target, U = S.U;
    const k = Math.min(1, dt * 1.2);
    U.uZen.value.lerp(m.zen, k); U.uHor.value.lerp(m.hor, k); U.uGlow.value.lerp(m.glow, k); U.uSunCol.value.lerp(m.sun, k);
    U.uCLit.value.lerp(m.cLit, k); U.uCDark.value.lerp(m.cDark, k);
    U.uNight.value = lerp(U.uNight.value, m.night, k); U.uCover.value = lerp(U.uCover.value, m.cover, k);
    const night = U.uNight.value;
    // lights follow the colour script (also when scripts change lightCfg at runtime)
    if (view.outdoor) {
      const amb = 1;
      view.hemi.color.copy(U.uZen.value).lerp(new THREE.Color(1, 1, 1), 0.55);
      view.hemi.groundColor.set(0x5a4a3a).lerp(new THREE.Color(0x10141e), night);
      view.hemi.intensity = lerp(view.hemi.intensity, (1.25 - m.dark) * amb, k);
      view.sun.color.lerp(new THREE.Color().copy(m.light), k);
      view.sun.intensity = lerp(view.sun.intensity, 3.0 - m.dark * 2.55, k);
      const e = lerp(1, m.sunElev, 1 - night);
      const sd = new THREE.Vector3(-0.55, e, 0.42).normalize();
      view.sunDir.lerp(sd, k);
      U.uSunDir.value.copy(view.sunDir).normalize();
      // fog: aerial perspective in the palette's horizon colour, closer with mist / rain
      if (view.scene.fog) {
        const mist = clamp((S.weather.mist || 0) * 0.5 + (S.weather.rain || 0) * 0.5, 0, 1.2);
        const fc = U.uHor.value.clone().lerp(U.uZen.value, 0.2).lerp(new THREE.Color(0xdde4ea), mist * 0.25 * (1 - night));
        view.scene.fog.color.lerp(fc, k);
        view.scene.fog.near = lerp(view.scene.fog.near, 20 - mist * 6, k);
        view.scene.fog.far = lerp(view.scene.fog.far, 62 - mist * 14, k);
      }
    } else {
      view.hemi.intensity = lerp(view.hemi.intensity, (1.25 - m.dark) * 0.55, k);
      if (view.scene.fog) {
        view.scene.fog.near = lerp(view.scene.fog.near, view.cave ? 13 : 20, k);
        view.scene.fog.far = lerp(view.scene.fog.far, view.cave ? 36 : 48, k);
      }
    }
    // ambient used by unlit-ish surfaces (water body, foam, particles)
    U.uAmb.value.copy(view.hemi.color).multiplyScalar(view.hemi.intensity * 0.35 + 0.04).lerp(U.uHor.value.clone().multiplyScalar(0.4), 0.3);
    U.uLightK.value = view.outdoor ? clamp(1.08 - m.dark * 0.85, 0.22, 1) : clamp(1.0 - m.dark * 0.7, 0.3, 0.9);
    U.uCloudShadow.value = view.outdoor ? 0.24 * (1 - night) * (1 - m.overcast * 0.85) * (1 - m.dusk * 0.6) : 0;
    U.uStars.value = view.outdoor ? 1 - m.overcast * 0.8 : 0;
  }

  // ===================================================================================== update
  const _v = new THREE.Vector3();
  E.update = function (view, dt) {
    const S = view.env;
    if (!S || !S.A) return;
    const U = S.U, ms = view.ms;
    S.frame++;
    U.uTime.value = view.t;
    U.uCenter.value.set(view.camTarget.x, 0, view.camTarget.z);
    // runtime changes: particles object replaced, lightCfg changed, terrain edited, walls rebuilt
    if (ms.particles !== S.particlesRef) {
      S.weather = { rain: 0, mist: 0, names: [] };
      buildWeatherCounts(view, S);
      safe('weather', () => buildWeather(view, S));
      S.target = moodFrom(view, S.weather);
    }
    if (ms.lightCfg !== S.lcRef || (S.frame % 30 === 0 && JSON.stringify(ms.lightCfg || {}) !== S.lcSig)) {
      applyMood(view, S, false);
      S.envDirty = 2.0; // rebuild the IBL once the colours have settled
    }
    if (S.envDirty != null) { S.envDirty -= dt; if (S.envDirty <= 0) { S.envDirty = null; rebuildEnvMap(view, S); } }
    if (view.wallGroup !== S.wallRef) safe('walls', () => patchWalls(view, S));
    if (S.frame % 45 === 0) {
      let ch = false;
      const t = ms.terrain;
      if (t.length === S.terrSnap.length) for (let i = 0; i < t.length; i++) if (t[i] !== S.terrSnap[i]) { ch = true; break; }
      if (ch) {
        S.terrSnap = t.slice();
        const A = safe('analyse', () => analyse(view));
        if (A) {
          for (const k of ['mapTex', 'kindTex', 'flowTex']) if (S.A[k]) S.A[k].dispose();
          S.A = A; U.uMapTex.value = A.mapTex; U.uKindTex.value = A.kindTex; U.uFlowTex.value = A.flowTex;
        }
      }
    }
    if (S.frame % 20 === 1) refreshGlowPool(view, S);
    stepMood(view, S, dt);
    const m = S.target;
    // wind
    const wind = (S.weather.wind || 0);
    U.uWindK.value = lerp(U.uWindK.value, clamp(0.25 + wind * 0.45 + (S.weather.rain || 0) * 0.3, 0, 1.4), Math.min(1, dt));
    const wa = 0.35 + Math.sin(view.t * 0.05) * 0.2;
    U.uWind.value.set(Math.cos(wa), Math.sin(wa)).multiplyScalar(0.6 + U.uWindK.value * 1.6);
    U.uCloudOff.value.x += dt * 0.004 * (1 + U.uWindK.value);
    U.uCloudOff.value.y += dt * 0.0015 * (1 + U.uWindK.value);
    U.uWet.value = lerp(U.uWet.value, (S.weather.rain || 0) > 0 ? 1 : 0, Math.min(1, dt * 0.3));
    // glint / moon direction: in front of the camera so reflections land in view
    const cam = view.camera;
    _v.set(view.camTarget.x - cam.position.x, 0, view.camTarget.z - cam.position.z).normalize();
    U.uGlintDir.value.set(_v.x * 0.86, 0.5, _v.z * 0.86).normalize();
    U.uMoonDir.value.set(_v.x * 0.6 - _v.z * 0.22, 0.82, _v.z * 0.6 + _v.x * 0.22).normalize();
    // pool lights → water reflections
    const pool = view.pool || [];
    for (let i = 0; i < 12; i++) {
      const pl = pool[i], u4 = U.uPL.value[i];
      if (pl && pl.intensity > 0.01) { u4.set(pl.position.x, pl.position.y, pl.position.z, Math.min(3, pl.intensity * 0.6)); U.uPLC.value[i].copy(pl.color); } else u4.w = 0;
    }
    // psychedelic & photosensitivity
    const fx = FXK();
    const warp = (view.post && view.post.warp) || 0;
    U.uPsy.value = lerp(U.uPsy.value, clamp(warp * 1.4, 0, 1) * fx, Math.min(1, dt * 0.8));
    if (S.psy) {
      S.psy.visible = U.uPsy.value > 0.01;
      for (const c of S.psy.children) if (c.userData.spin) { c.rotation.z += c.userData.spin * dt; c.position.y += Math.sin(view.t * 0.3 + c.position.x) * 0.002; }
    }
    U.uSpecialK.value = 0.75 + 0.25 * fx;
    // crystals: slow breathing (never flashing)
    if (S.crystals) S.crystals.pulse.value = 0.8 + 0.2 * Math.sin(view.t * 0.8);
    // night ground light pools
    if (S.glow) S.glow.mesh.material.uniforms.uK.value = clamp((m.dark - 0.12) * 0.35, 0, 0.2) * (view.interior ? 0.6 : 1);
    if (S.shafts) S.shafts.material.uniforms.uK.value = clamp(1.2 - m.dark * 1.6, 0.25, 1);
    // particles: the night dims non-emissive particles; fireflies brighten at night
    for (const s of S.systems) {
      const sp = s.material.uniforms;
      if (s.userData.spec.kind === 4) sp.uAlpha.value = s.userData.spec.alpha * (0.35 + m.dark * 0.9);
    }
    // post grade
    const P = view.post;
    if (P && m.post) {
      const pk = Math.min(1, dt * 1.5);
      const tg = m.post;
      const psy = U.uPsy.value;
      P.bloom = lerp(P.bloom != null ? P.bloom : tg.bloom, tg.bloom + psy * 0.2, pk);
      P.bloomThreshold = lerp(P.bloomThreshold != null ? P.bloomThreshold : tg.thr, tg.thr - psy * 0.08, pk);
      P.vignette = lerp(P.vignette != null ? P.vignette : tg.vig, tg.vig, pk);
      P.exposure = lerp(P.exposure != null ? P.exposure : tg.exp, tg.exp, pk);
      S.sat = lerp(S.sat != null ? S.sat : tg.sat, tg.sat, pk);
      P.sat = S.sat + (warp > 0 ? warp * 0.5 * fx : 0);
      S.tint = S.tint || tg.tint.slice();
      for (let i = 0; i < 3; i++) S.tint[i] = lerp(S.tint[i], tg.tint[i], pk);
      P.tint = S.tint.slice();
      // photosensitivity: scale the lead's warp/hue by visualFx is done in core; keep hue drift slow
      if (P.hue) P.hue *= fx;
    }
    if (G.Wind3D && G.Wind3D.update) safe('wind3d', () => G.Wind3D.update(dt));
  };

  // ===================================================================================== shared wind vertex shader
  // G.Env3D.windify(material, { strength, height }): sway vertices by height (foliage, cloth). Uses G.Wind3D if the
  // nature team provides one; otherwise a shared time/wind uniform pair driven by the current view.
  const windU = { uWT: { value: 0 }, uWDir: { value: null }, uWK: { value: 0.3 } };
  E.windify = function (material, opts = {}) {
    if (G.Wind3D && G.Wind3D.windify) return G.Wind3D.windify(material, opts);
    const T = THREE;
    if (!windU.uWDir.value) windU.uWDir.value = new T.Vector2(1, 0.3);
    const strength = opts.strength != null ? opts.strength : 1, hgt = opts.height || 2;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = function (sh, r) {
      if (prev) prev.call(this, sh, r);
      Object.assign(sh.uniforms, windU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWT, uWK; uniform vec2 uWDir;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
            float hk = clamp(transformed.y / ${hgt.toFixed(2)}, 0.0, 1.0); hk *= hk;
            float ph = uWT * 1.7 + wp0.x * 0.35 + wp0.z * 0.27;
            float sw = (sin(ph) * 0.6 + sin(ph * 2.3 + 1.1) * 0.25) * (0.35 + uWK) * ${(strength * 0.06).toFixed(4)} * hk;
            transformed.xz += uWDir * sw; }`);
    };
    const pk = material.customProgramCacheKey;
    material.customProgramCacheKey = function () { return (pk ? pk.call(this) : '') + '|wind'; };
    material.needsUpdate = true;
    return material;
  };
  const _origUpdate = E.update;
  E.update = function (view, dt) {
    windU.uWT.value = view.t;
    if (view.env) { windU.uWK.value = view.env.U.uWindK.value; if (windU.uWDir.value) windU.uWDir.value.copy(view.env.U.uWind.value).normalize(); }
    return _origUpdate(view, dt);
  };

  E.dispose = function (view) {
    const S = view.env;
    if (!S) return;
    clearWeather(view, S);
    for (const o of S.statics) { view.scene.remove(o); safe('dispose', () => G.R3.dispose(o)); }
    if (S.shafts) { view.scene.remove(S.shafts); S.shafts.geometry.dispose(); S.shafts.material.dispose(); }
    if (S.glow) { view.scene.remove(S.glow.mesh); S.glow.mesh.geometry.dispose(); S.glow.mesh.material.dispose(); }
    if (S.A) for (const k of ['mapTex', 'kindTex', 'flowTex']) if (S.A[k]) S.A[k].dispose();
    view.env = null;
  };
  E.moodFrom = moodFrom; // exposed for tests
  return E;
})();

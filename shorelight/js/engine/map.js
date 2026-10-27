// Map engine: terrain, objects, actors (player, followers, NPCs, roaming enemies), events, lighting.
'use strict';
G.Maps = {
  defs: {},
  define(id, def) { def.id = id; this.defs[id] = def; },
  get(id) { return this.defs[id]; },
};

// default terrain legend (maps may override with def.legend)
G.Maps.LEGEND = {
  '.': 'grass', ',': 'grass_dark', '"': 'flowers_ground', ':': 'dirt', '=': 'path', '#': 'stone', 'H': 'stairs',
  '%': 'brick', 's': 'sand', '~': 'water', 'w': 'deepwater', '-': 'shallow', 'l': 'lake', 'r': 'river', 'm': 'marsh',
  '_': 'wood', 't': 'tile_floor', 'c': 'red_carpet', 'T': 'temple_floor', 'n': 'mat', 'v': 'cave', '+': 'rail',
  'f': 'farmland', 'k': 'dock', 'b': 'bridge_h', 'B': 'bridge_v', '*': 'spirit_floor', 'L': 'lily_field',
  'g': 'moss_glow', 'V': 'vision', 'Z': 'breath', 'o': 'cloud', 'j': 'lantern_bridge', 'S': 'slate',
  'X': 'cliff', 'C': 'cave_wall', 'P': 'wall_plaster', 'R': 'wall_brick', 'W': 'wall_wood', 'E': 'wall_temple',
  'h': 'hedge', ' ': 'void', 'K': 'black_sea', 'q': 'snow_rock', 'M': 'marble', 'Y': 'basalt_floor', 'y': 'coral',
  'p': 'field_rice', 'd': 'deck', 'Q': 'wall_slate', 'U': 'wall_basalt',
};
// default deco legend (object types placed from the optional `deco` layer)
G.Maps.DECO = {
  t: 'tree_pine', b: 'tree_banyan', c: 'tree_camphor', a: 'tree_sakura', p: 'tree_betel', n: 'tree_banana',
  f: 'tree_fern', P: 'pandanus', B: 'bamboo', u: 'bush', w: 'flowers', g: 'tallgrass', r: 'rock_small',
  R: 'rock_big', e: 'reeds', o: 'lotus', m: 'mushroom_glow', M: 'mushroom_giant', y: 'crystal', l: 'lily',
  s: 'stump', x: 'silvergrass', d: 'tree_dead', k: 'tree_maple', C: 'tree_cypress', v: 'vine_curtain',
  j: 'jar', J: 'barrel', X: 'crate', L: 'stone_lantern', F: 'fence_wood', G: 'grave', W: 'water_lantern',
  S: 'sky_lantern', h: 'coconut_palm', i: 'tree_cedar_snow', z: 'basalt', q: 'rock_marble',
};

G.Mapx = G.Mapx || {};

(function () {
  const T = G.TILE;
  const U = G.U;
  const val = (v, ...a) => (typeof v === 'function' ? v(G.state, ...a) : v);
  G.Mapx.val = val;

  // ------------------------------------------------------------------------------
  class Actor {
    constructor(o) {
      Object.assign(this, o);
      this.dir = this.dir || 'down';
      this.speed = this.speed || 3.6; // tiles/sec
      this.setCell(this.x, this.y);
      this.moving = false;
      this.phase = 0;
      this.visible = this.visible !== false;
      this.alpha = 1;
      this.queue = [];
      this.emote = null;
      this.bob = 0;
    }
    setCell(x, y) {
      this.x = x; this.y = y;
      this.px = x * T + T / 2;
      this.py = y * T + T - 8;
      this.moving = false;
    }
    get frame() {
      if (!this.moving && !this.walkInPlace) return 0;
      return Math.floor(this.phase * 4) % 4;
    }
    startMove(nx, ny) {
      this.fromX = this.px; this.fromY = this.py;
      this.x = nx; this.y = ny;
      this.toX = nx * T + T / 2; this.toY = ny * T + T - 8;
      this.mt = 0;
      this.moving = true;
    }
    updateMove(dt, speedMul = 1) {
      if (!this.moving) return false;
      const d = (this.speed * speedMul) * dt;
      this.mt += d;
      this.phase += d * 0.5;
      if (this.mt >= 1) {
        this.px = this.toX; this.py = this.toY;
        this.moving = false;
        return true; // arrived
      }
      this.px = U.lerp(this.fromX, this.toX, this.mt);
      this.py = U.lerp(this.fromY, this.toY, this.mt);
      return false;
    }
  }
  G.Mapx.Actor = Actor;

  // ------------------------------------------------------------------------------
  class MapScene {
    constructor(mapId, x, y, dir) {
      this.opaque = true;
      this.t = 0;
      this.banner = 0;
      this.load(mapId, x, y, dir);
    }

    load(mapId, x, y, dir) {
      const def = G.Maps.get(mapId);
      if (!def) throw new Error('Unknown map ' + mapId);
      this.def = def;
      this.map = { id: mapId, name: val(def.name) || '' };
      const st = G.state;
      st.map = mapId; st.x = x; st.y = y; st.dir = dir || st.dir || 'down';
      const legend = Object.assign({}, G.Maps.LEGEND, def.legend || {});
      const rows = val(def.tiles);
      this.h = rows.length;
      this.w = Math.max(...rows.map((r) => r.length));
      this.terrain = new Array(this.w * this.h);
      for (let yy = 0; yy < this.h; yy++) {
        for (let xx = 0; xx < this.w; xx++) {
          const ch = rows[yy][xx] || ' ';
          this.terrain[yy * this.w + xx] = legend[ch] || 'grass';
        }
      }
      // pre-build tile textures now (during the transition fade) instead of on first draw (3D bakes them itself)
      if (!(G.R3 && G.R3.enabled())) this.warmTiles();
      // objects
      this.objects = [];
      const addObj = (o) => {
        const inst = Object.assign({}, o);
        inst.key = inst.key || (inst.t + '@' + inst.x + ',' + inst.y);
        if (inst.v == null) inst.v = Math.floor(U.hash(inst.x, inst.y, 7) * 4);
        this.objects.push(inst);
        return inst;
      };
      (val(def.objects) || []).forEach((o) => { if (!o.if || o.if(st)) addObj(o); });
      if (def.deco) {
        const dl = Object.assign({}, G.Maps.DECO, def.decoLegend || {});
        def.deco.forEach((row, yy) => {
          for (let xx = 0; xx < row.length; xx++) {
            const ch = row[xx];
            if (ch !== ' ' && ch !== '.' && dl[ch]) addObj({ t: dl[ch], x: xx, y: yy });
          }
        });
      }
      // chests
      (def.chests || []).forEach((c) => {
        const key = mapId + ':' + (c.id || c.x + ',' + c.y);
        addObj({ t: 'chest', x: c.x, y: c.y, chest: c, chestKey: key, open: !!st.opened[key], spirit: c.spirit, if: c.if });
      });
      // actors
      this.npcs = [];
      this.enemies = [];
      this.buildNpcs();
      this.buildEnemies();
      this.player = new Actor({ id: 'player', x, y, dir: st.dir, speed: 4.2 });
      if (G.Sprites && G.Sprites.preload) {
        try { G.Sprites.preload([...new Set(this.npcs.map((n) => n.sprite || n.id).concat(st.party))]); } catch (e) { G.warnOnce('sprite preload', e); }
      }
      this.followers = [];
      this.buildFollowers();
      this.computeSolid();
      // camera
      this.cam = { x: 0, y: 0, follow: 'player', tx: null, ty: null };
      this.snapCamera();
      // fx
      this.particles = new G.FX.Particles(val(def.particles), this);
      this.lightCfg = val(def.light) || { ambient: 0 };
      this.ranAuto = {};
      this.banner = 0;
      this.interactTarget = null;
      this.invuln = 0;
      this.stepCount = 0;
      if (this.initMech) this.initMech();
      // 3D presentation (rebuilt for every map load)
      if (this.view3d) { this.view3d.dispose(); this.view3d = null; }
      if (G.R3 && G.R3.enabled() && G.Map3D) {
        try { this.view3d = new G.Map3D(this); } catch (e) { console.error('Map3D build failed for ' + mapId, e); G.lastError = e; this.view3d = null; }
      }
    }

    exit() { if (this.view3d) { this.view3d.dispose(); this.view3d = null; } }

    // draw every cell once to a scratch canvas so the tile art builds its caches during the load fade
    warmTiles() {
      const w = this.w, h = this.h, terr = this.terrain;
      if (!G.MapScene._warmCanvas) G.MapScene._warmCanvas = G.U.makeCanvas(T, T);
      const c = G.MapScene._warmCanvas.getContext('2d');
      for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
        const id = terr[cy * w + cx];
        if (!G.Tiles.defs[id]) continue;
        const nb = (dx, dy) => { const nx = cx + dx, ny = cy + dy; return nx < 0 || ny < 0 || nx >= w || ny >= h ? id : terr[ny * w + nx]; };
        try { G.Tiles.draw(c, id, 0, 0, nb, cx, cy, 0); } catch (e) { G.warnOnce('tile ' + id, e); }
      }
    }

    buildNpcs() {
      const st = G.state;
      const old = {};
      for (const n of this.npcs || []) old[n.id] = n;
      this.npcs = [];
      for (const d of this.def.npcs || []) {
        if (d.if && !d.if(st)) continue;
        if (old[d.id] && !old[d.id].spawned) { this.npcs.push(old[d.id]); continue; }
        const pos = val(d.pos) || [d.x, d.y];
        const a = new Actor(Object.assign({}, d, { x: pos[0], y: pos[1], homeX: pos[0], homeY: pos[1], def: d, speed: d.speed || 2.2 }));
        a.wanderT = U.rand(1, 4);
        this.npcs.push(a);
      }
      // keep scripted (spawned) actors
      for (const id in old) if ((old[id].spawned || old[id].guard) && !this.npcs.includes(old[id])) this.npcs.push(old[id]);
    }

    buildEnemies() {
      const st = G.state;
      this.enemies = [];
      for (const d of this.def.enemies || []) {
        if (d.if && !d.if(st)) continue;
        const key = 'dead_' + this.def.id + '_' + (d.id || d.x + '_' + d.y);
        if (st.flags[key]) continue;
        const a = new Actor(Object.assign({}, d, { def: d, key, homeX: d.x, homeY: d.y, speed: d.speed || 2.4 }));
        a.wanderT = U.rand(0.5, 2.5);
        a.stun = 0;
        this.enemies.push(a);
      }
    }

    buildFollowers() {
      const st = G.state;
      const list = st.party.slice(1, 4).slice();
      // 麻糬 stays with the party even while 白芷 is away (ch7–ch11), waiting for her
      if (st.flags.mochi_joined && !st.flags.mochi_hidden) list.push('mochi');
      if (st.flags.yuyuan_joined && !st.flags.yuyuan_hidden) list.push('yuyuan');
      const prev = {};
      for (const f of this.followers || []) prev[f.id] = f;
      this.followers = list.map((id) => {
        if (prev[id]) return prev[id];
        const f = new Actor({ id, sprite: id, x: this.player.x, y: this.player.y, dir: this.player.dir, speed: 4.2 });
        return f;
      });
    }

    refresh() {
      this.buildNpcs();
      this.buildFollowers();
      this.computeSolid();
    }

    // ---------------- collision ----------------
    visionOn() { return (G.state.vars.vision || 0) > 0 || !!val(this.def.psychedelic); }
    objActive(o) {
      if (o.if && !o.if(G.state)) return false;
      if (o.spirit && !this.visionOn()) return false;
      if (o.illusion && this.visionOn()) return false;
      return true;
    }
    computeSolid() {
      const w = this.w, h = this.h;
      this.solid = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const td = G.Tiles.get(this.terrain[i]);
        this.solid[i] = td && td.solid ? 1 : 0;
        if (!td) this.solid[i] = this.terrain[i] === 'void' ? 1 : 0;
      }
      for (const o of this.objects) {
        if (!this.objActive(o)) continue;
        const d = G.Objects.get(o.t);
        const ow = o.w || (d ? d.w : 1), oh = o.h || (d ? d.h : 1);
        for (let dy = 0; dy < oh; dy++) for (let dx = 0; dx < ow; dx++) {
          const cx = o.x + dx, cy = o.y + dy;
          if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
          let s;
          if (o.solid != null) s = o.solid;
          else if (d && d.solidAt) s = d.solidAt(o, dx, dy);
          else s = d ? d.solid : true;
          if (s) this.solid[cy * w + cx] = 1;
        }
      }
      // explicit passability overrides
      for (const p of this.def.pass || []) for (let dy = 0; dy < (p.h || 1); dy++) for (let dx = 0; dx < (p.w || 1); dx++) {
        const i = (p.y + dy) * w + p.x + dx;
        if (i >= 0 && i < w * h) this.solid[i] = p.solid ? 1 : 0;
      }
    }
    terrainAt(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
      return this.terrain[y * this.w + x];
    }
    blocked(x, y, self) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
      if (this.solid[y * this.w + x]) return true;
      if (self && self === this.player && this.def.winds && this.windResists && this.windResists(x, y)) return true; // no stepping into a gust
      for (const n of this.npcs) if (n !== self && n.visible && !n.through && this.npcActive(n) && n.x === x && n.y === y) return true;
      if (self && self !== this.player && this.player.x === x && this.player.y === y) return true;
      return false;
    }
    npcActive(n) {
      if (n.spirit && !this.visionOn()) return false;
      return true;
    }

    // ---------------- actors lookup ----------------
    actor(id) {
      if (id === 'player' || id === G.state.party[0]) return this.player;
      return this.followers.find((f) => f.id === id) || this.npcs.find((n) => n.id === id) || this.enemies.find((e) => e.id === id);
    }

    // ---------------- camera ----------------
    camTarget() {
      if (this.cam.tx != null) return [this.cam.tx, this.cam.ty];
      const a = this.actor(this.cam.follow) || this.player;
      return [a.px - G.W / 2, a.py - G.H / 2 - 24];
    }
    clampCam(x, y) {
      const mw = this.w * T, mh = this.h * T;
      x = mw <= G.W ? (mw - G.W) / 2 : U.clamp(x, 0, mw - G.W);
      y = mh <= G.H ? (mh - G.H) / 2 : U.clamp(y, 0, mh - G.H);
      return [x, y];
    }
    snapCamera() {
      const [tx, ty] = this.clampCam(...this.camTarget());
      this.cam.x = tx; this.cam.y = ty;
    }

    // ---------------- update ----------------
    enter() {
      this.banner = 0.001;
      if (this.def.place) G.World.visit(this.def.place);
      const bgm = val(this.def.bgm);
      if (bgm) G.Music.play(bgm);
      else if (bgm === null) G.Music.stop(1);
    }
    resume() { G.Input.clear(); }

    update(dt) {
      this.t += dt;
      const st = G.state;
      if (this.banner > 0) { this.banner += dt; if (this.banner > 4) this.banner = 0; }
      if (st.vars.vision > 0) {
        const before = st.vars.vision;
        st.vars.vision = Math.max(0, st.vars.vision - dt);
        if (before > 0 && st.vars.vision === 0) { this.computeSolid(); G.UI.toast('靈視漸漸消退了……'); }
      }
      if (this.invuln > 0) this.invuln -= dt;
      const busy = G.Script.busy();
      // player
      this.updatePlayer(dt, busy);
      this.updateFollowers(dt);
      for (const n of this.npcs) this.updateNpc(n, dt, busy);
      for (const e of this.enemies) this.updateEnemy(e, dt, busy);
      if (this.updateMech) this.updateMech(dt, busy);
      if (this.def.onUpdate) this.def.onUpdate(dt, this, busy);
      // camera
      const [tx, ty] = this.clampCam(...this.camTarget());
      const k = Math.min(1, dt * (this.cam.speed || 7));
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
      this.particles.update(dt);
      // auto events
      if (!busy) this.checkAuto();
      // menu
      if (!busy && !this.player.moving && (G.Input.pressed('menu') || G.Input.pressed('cancel'))) {
        G.Audio.sfx('ok');
        G.Scenes.push(new G.MenuScene());
      }
      if (G.debug && G.Input.pressed('debug')) G.Debug && G.Debug.menu();
    }

    updatePlayer(dt, busy) {
      const p = this.player;
      const I = G.Input;
      const run = I.held('run') !== !!G.settings.runDefault;
      const spd = run ? 1.65 : 1;
      if (p.moving) {
        if (p.updateMove(dt, p.scripted ? 1 : spd * (p.stepMul || 1))) this.onPlayerArrive();
      }
      if (p.queue.length && !p.moving) { p.stepMul = 1; this.stepQueue(p); return; }
      if (busy || p.moving) return;
      const d = this.view3d ? this.view3d.remapDir(I.dir()) : I.dir();
      p.stepMul = 1;
      // map winds (mapmech.js): a gust pushes the player between steps, even while a direction is held
      if (this.windStep && this.windStep(d)) { this.interactTarget = null; return; }
      if (d) {
        p.dir = d;
        const [dx, dy] = U.dirs[d];
        const nx = p.x + dx, ny = p.y + dy;
        if (!this.blocked(nx, ny, p)) {
          this.shiftFollowers(p.x, p.y);
          p.startMove(nx, ny);
          G.state.dir = d;
        } else if (this.tryPush && this.tryPush(nx, ny, dx, dy)) {
          this.shiftFollowers(p.x, p.y);
          p.startMove(nx, ny);
        } else {
          p.phase += dt * 0.3; // shuffle
        }
      } else p.phase = 0;
      // interaction
      this.interactTarget = this.findInteract();
      if (I.pressed('ok')) this.doInteract();
    }

    shiftFollowers(x, y) {
      let px = x, py = y, pdir = this.player.dir;
      for (const f of this.followers) {
        if (f.scripted) continue;
        const ox = f.x, oy = f.y;
        if (ox !== px || oy !== py) {
          f.dir = px > ox ? 'right' : px < ox ? 'left' : py > oy ? 'down' : 'up';
          f.startMove(px, py);
        } else f.dir = pdir;
        px = ox; py = oy;
      }
    }
    updateFollowers(dt) {
      const run = G.Input.held('run') !== !!G.settings.runDefault;
      for (const f of this.followers) {
        if (f.moving) {
          // scripted moves on followers (S.move) resolve on arrival
          if (f.updateMove(dt, run && !G.Script.busy() ? 1.65 : 1) && f.onArrive) { const r = f.onArrive; f.onArrive = null; r(); }
        }
        else if (f.queue.length) this.stepQueue(f);
        else f.phase = 0;
      }
    }

    stepQueue(a) {
      const step = a.queue.shift();
      if (step.face) { a.dir = step.face; if (step.res) step.res(); return; }
      const [dx, dy] = U.dirs[step.dir];
      a.dir = step.dir;
      const nx = a.x + dx, ny = a.y + dy;
      if (a === this.player && !step.ghost) this.shiftFollowers(a.x, a.y);
      a.startMove(nx, ny);
      a.onArrive = step.res;
    }

    onPlayerArrive() {
      const p = this.player;
      const st = G.state;
      st.x = p.x; st.y = p.y; st.dir = p.dir;
      st.steps++;
      if (p.onArrive) { const r = p.onArrive; p.onArrive = null; r(); }
      if (G.Script.busy()) return;
      // warps
      for (const w of this.def.warps || []) {
        if (w.if && !w.if(st)) continue;
        if (p.x >= w.x && p.x < w.x + (w.w || 1) && p.y >= w.y && p.y < w.y + (w.h || 1)) {
          if (w.dir && w.dir !== p.dir && !w.anyDir) continue;
          this.doWarp(w);
          return;
        }
      }
      // touch events
      for (const e of this.def.events || []) {
        if (e.trigger !== 'touch') continue;
        if (!this.eventOk(e)) continue;
        if (p.x >= e.x && p.x < e.x + (e.w || 1) && p.y >= e.y && p.y < e.y + (e.h || 1)) {
          this.runEvent(e);
          return;
        }
      }
    }

    eventOk(e) {
      if (e.once && G.state.flags[this.evKey(e)]) return false;
      if (e.if && !e.if(G.state)) return false;
      if (e.spirit && !this.visionOn()) return false;
      return true;
    }
    evKey(e) { return 'ev_' + this.def.id + '_' + (e.id || e.x + '_' + e.y); }
    runEvent(e) {
      if (e.once) G.state.flags[this.evKey(e)] = true;
      return G.Script.run(e.run, e);
    }

    checkAuto() {
      for (const e of this.def.events || []) {
        if (e.trigger !== 'auto') continue;
        if (!this.eventOk(e)) continue;
        this.runEvent(e);
        return;
      }
    }

    doWarp(w) {
      if (w.door) G.Audio.sfx('door');
      G.Script.run(async (S) => {
        if (w.run) { const r = await w.run(S); if (r === false) return; }
        await S.warp(w.to, w.tx, w.ty, w.tdir || this.player.dir, { fade: w.fade });
      });
    }

    frontCell(a = this.player) {
      const [dx, dy] = U.dirs[a.dir];
      return [a.x + dx, a.y + dy];
    }

    findInteract() {
      const [fx, fy] = this.frontCell();
      for (const n of this.npcs) {
        if (!n.visible || !this.npcActive(n) || !(n.talk || n.def && n.def.talk)) continue;
        if (n.x === fx && n.y === fy) return { kind: 'npc', npc: n };
      }
      // talk across counters
      const [fx2, fy2] = [fx + (fx - this.player.x), fy + (fy - this.player.y)];
      const counter = this.objects.find((o) => this.objActive(o) && (o.t === 'counter' || o.counter) && fx >= o.x && fx < o.x + (o.w || 1) && fy >= o.y && fy < o.y + (o.h || 1));
      if (counter) {
        for (const n of this.npcs) if (n.visible && (n.def && n.def.talk) && n.x === fx2 && n.y === fy2) return { kind: 'npc', npc: n };
      }
      for (const e of this.def.events || []) {
        if (e.trigger !== 'action' || !this.eventOk(e)) continue;
        if (fx >= e.x && fx < e.x + (e.w || 1) && fy >= e.y && fy < e.y + (e.h || 1)) return { kind: 'event', ev: e };
        if (e.self && this.player.x >= e.x && this.player.x < e.x + (e.w || 1) && this.player.y >= e.y && this.player.y < e.y + (e.h || 1)) return { kind: 'event', ev: e };
      }
      for (const o of this.objects) {
        if (!this.objActive(o)) continue;
        if (o.t === 'chest' && !o.open && o.x === fx && o.y === fy) return { kind: 'chest', obj: o };
        if (o.interact && fx >= o.x && fx < o.x + (o.w || 1) && fy >= o.y && fy < o.y + (o.h || 1)) return { kind: 'obj', obj: o };
      }
      // enemy in reach → field strike
      for (const e of this.enemies) {
        if (e.dead || e.stun > 0) continue;
        if (U.dist(e.px, e.py, this.player.px + U.dirs[this.player.dir][0] * T * 0.8, this.player.py + U.dirs[this.player.dir][1] * T * 0.8) < T * 0.85) return { kind: 'enemy', enemy: e };
      }
      return null;
    }

    doInteract() {
      const it = this.interactTarget;
      if (!it) return;
      if (it.kind === 'npc') {
        const n = it.npc;
        const talk = n.talk || n.def.talk;
        const oldDir = n.dir;
        if (!n.fixedDir) n.dir = U.opposite[this.player.dir];
        G.Script.run(async (S) => {
          if (typeof talk === 'function') await talk(S, n);
          else await S.lines(talk, n);
          if (n.returnDir) n.dir = oldDir;
        });
      } else if (it.kind === 'event') {
        this.runEvent(it.ev);
      } else if (it.kind === 'chest') {
        this.openChest(it.obj);
      } else if (it.kind === 'obj') {
        const o = it.obj;
        G.Script.run(async (S) => {
          if (typeof o.interact === 'function') await o.interact(S, o);
          else await S.lines(o.interact);
        });
      } else if (it.kind === 'enemy') {
        this.fieldStrike(it.enemy);
      }
    }

    openChest(o) {
      const c = o.chest;
      G.Script.run(async (S) => {
        o.open = true;
        G.state.opened[o.chestKey] = true;
        G.Audio.sfx('chest');
        await S.wait(0.25);
        if (c.gold) { G.state.gold += c.gold; G.UI.toast(`獲得 {y}${c.gold}{/} 文錢`, { icon: 'bag' }); }
        if (c.item) await S.give(c.item, c.n || 1);
        if (c.run) await c.run(S);
      });
    }

    fieldStrike(e) {
      this.strikeFx = { t: 0, dir: this.player.dir };
      G.Audio.sfx('slash');
      e.stun = 1;
      this.startBattle(e, 'advantage');
    }

    // ---------------- NPC / enemy AI ----------------
    updateNpc(n, dt, busy) {
      if (n.guard && this.updateGuard) { this.updateGuard(n, dt, busy); return; }
      if (n.moving) {
        if (n.updateMove(dt)) { if (n.onArrive) { const r = n.onArrive; n.onArrive = null; r(); } }
        return;
      }
      if (n.queue.length) { this.stepQueue(n); return; }
      n.phase = 0;
      if (busy || !n.wander || n.scripted) return;
      n.wanderT -= dt;
      if (n.wanderT > 0) return;
      n.wanderT = U.rand(1.5, 4.5);
      const d = U.pick(['up', 'down', 'left', 'right']);
      const [dx, dy] = U.dirs[d];
      const nx = n.x + dx, ny = n.y + dy;
      n.dir = d;
      if (Math.abs(nx - n.homeX) > n.wander || Math.abs(ny - n.homeY) > n.wander) return;
      if (this.blocked(nx, ny, n) || (this.player.x === nx && this.player.y === ny)) return;
      if (this.followers.some((f) => f.x === nx && f.y === ny)) return;
      n.startMove(nx, ny);
    }

    updateEnemy(e, dt, busy) {
      if (e.stun > 0) e.stun -= dt;
      if (e.moving) { e.updateMove(dt); }
      if (busy || e.stun > 0) return;
      const p = this.player;
      const dist = Math.hypot(e.px - p.px, e.py - p.py) / T;
      // contact
      if (dist < 0.75 && this.invuln <= 0 && !G.Script.busy()) {
        const facingEnemy = U.dirs[p.dir][0] === Math.sign(e.x - p.x) && U.dirs[p.dir][1] === Math.sign(e.y - p.y);
        this.startBattle(e, facingEnemy ? 'normal' : (e.moving ? 'ambush' : 'normal'));
        return;
      }
      if (e.moving) return;
      const lvGap = (G.Party.active()[0] ? G.Party.active()[0].lv : 1) - (e.def.lv || 0);
      const chase = e.def.chase == null ? 4 : e.def.chase;
      const fleeing = e.def.lv && lvGap >= 10;
      if (dist < chase && !fleeing && chase > 0) {
        // step toward player
        const dx = p.x - e.x, dy = p.y - e.y;
        const opts = [];
        if (dx) opts.push([Math.sign(dx), 0]);
        if (dy) opts.push([0, Math.sign(dy)]);
        if (Math.abs(dy) > Math.abs(dx)) opts.reverse();
        for (const [sx, sy] of opts) {
          const nx = e.x + sx, ny = e.y + sy;
          if (!this.blocked(nx, ny, e) || (nx === p.x && ny === p.y)) {
            e.dir = sx > 0 ? 'right' : sx < 0 ? 'left' : sy > 0 ? 'down' : 'up';
            e.speed = (e.def.speed || 2.4) * 1.25;
            e.startMove(nx, ny);
            break;
          }
        }
        e.alert = 1;
      } else {
        e.alert = Math.max(0, (e.alert || 0) - dt);
        e.wanderT -= dt;
        if (e.wanderT > 0) return;
        e.wanderT = U.rand(0.8, 2.5);
        const [dx, dy] = U.dirs[U.pick(['up', 'down', 'left', 'right'])];
        const nx = e.x + dx, ny = e.y + dy;
        const r = e.def.radius == null ? 3 : e.def.radius;
        if (Math.abs(nx - e.homeX) > r || Math.abs(ny - e.homeY) > r) return;
        if (this.blocked(nx, ny, e)) return;
        e.speed = e.def.speed || 2.4;
        e.startMove(nx, ny);
      }
    }

    startBattle(e, mode) {
      if (G.Script.busy()) return;
      G.Script.run(async (S) => {
        const res = await S.battle(e.def.troop, { mode, enemyActor: e });
        if (res === 'error') { this.enemies = this.enemies.filter((x) => x !== e); return; }
        if (res === 'win') {
          this.enemies = this.enemies.filter((x) => x !== e);
          if (e.def.respawn === false) G.state.flags[e.key] = true;
          if (e.def.onWin) await e.def.onWin(S);
        } else if (res === 'flee') {
          e.stun = 3;
          this.invuln = 2;
        }
      });
    }

    // ---------------- drawing ----------------
    // Map draw hooks (def-level, then instance-level: ms.drawGround = fn): drawGround / drawOver (world px, 2D camera
    // applied), drawScreen (screen coords), update3d (3D only). In 3D, drawGround/drawOver go through Map3D's SplitCtx
    // (ground decal + screen overlay). Contract: docs/CONTRACTS_3D.md "2D map hooks in 3D".
    hooks(name) {
      const a = this.def[name], b = Object.prototype.hasOwnProperty.call(this, name) ? this[name] : null;
      const out = [];
      if (typeof a === 'function') out.push(a);
      if (typeof b === 'function' && b !== a) out.push(b);
      return out;
    }
    // the 2D camera of this frame (shake included, half-pixel snapped) — what world-space hooks are translated by
    camFrame() {
      const [sx, sy] = G.Render.shakeOffset();
      this.cam2d = [Math.round((this.cam.x + sx) * 2) / 2, Math.round((this.cam.y + sy) * 2) / 2];
      return this.cam2d;
    }
    // inside drawGround / drawOver: run fn(ctx) in screen coordinates (HUD meters, full-screen tints). Works in 2D
    // (cancels the camera translate) and in 3D (routes the drawing to the overlay above the 3D frame).
    screenSpace(ctx, fn) {
      ctx.save();
      if (ctx.__split) ctx.__split.markScreen();
      else { const [cx, cy] = this.cam2d || [this.cam.x, this.cam.y]; ctx.translate(cx, cy); }
      try { fn(ctx); } finally { ctx.restore(); }
    }
    draw(ctx) {
      if (this.view3d && G.R3.enabled()) { this.draw3d(ctx); return; }
      const t = this.t;
      const [camX, camY] = this.camFrame();
      ctx.save();
      ctx.fillStyle = val(this.def.bg) || '#05060a';
      ctx.fillRect(0, 0, G.W, G.H);
      ctx.translate(-camX, -camY);
      // terrain
      const x0 = Math.max(0, Math.floor(camX / T) - 1), y0 = Math.max(0, Math.floor(camY / T) - 1);
      const x1 = Math.min(this.w - 1, Math.floor((camX + G.W) / T) + 1), y1 = Math.min(this.h - 1, Math.floor((camY + G.H) / T) + 2);
      const w = this.w, h = this.h, terr = this.terrain;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const id = terr[cy * w + cx];
          const nb = (dx, dy) => {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) return id;
            return terr[ny * w + nx];
          };
          if (G.Tiles.defs[id]) G.Tiles.draw(ctx, id, cx * T, cy * T, nb, cx, cy, t);
          else this.fallbackTile(ctx, id, cx * T, cy * T);
        }
      }
      for (const f of this.hooks('drawGround')) f(ctx, t, this);
      if (this.drawMechFloor) this.drawMechFloor(ctx, t);
      // drawables
      const list = [];
      const vis = this.visionOn();
      for (const o of this.objects) {
        if (!this.objActive(o)) continue;
        const d = G.Objects.get(o.t);
        const ow = o.w || (d ? d.w : 1), oh = o.h || (d ? d.h : 1);
        const px = o.x * T, py = o.y * T;
        if (px > camX + G.W + 256 || px + ow * T < camX - 256 || py > camY + G.H + 128 || py + oh * T < camY - 400) continue;
        const sortY = (o.y + oh) * T + (o.z || 0) + (d && d.sortY ? d.sortY : 0);
        list.push({ y: (d && d.over) || o.over ? 1e9 : sortY, kind: 'obj', o, d, px, py });
      }
      for (const n of this.npcs) if (n.visible && (!n.spirit || vis)) list.push({ y: n.py, kind: 'actor', a: n });
      for (const e of this.enemies) list.push({ y: e.py, kind: 'enemy', a: e });
      for (const f of this.followers) if (f.visible && !this.hideFollowers) list.push({ y: f.py - 0.5, kind: 'actor', a: f });
      if (this.player.visible) list.push({ y: this.player.py, kind: 'player', a: this.player });
      list.sort((a, b) => a.y - b.y);
      for (const it of list) {
        if (it.kind === 'obj') {
          if (it.d) {
            ctx.save();
            if (it.o.spirit) ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 3);
            if (it.o.alpha != null) ctx.globalAlpha *= it.o.alpha;
            try { it.d.draw(ctx, it.px, it.py, it.o, t); } catch (e) { G.warnOnce('object ' + it.o.t, e); }
            ctx.restore();
          } else this.fallbackObj(ctx, it.o, it.px, it.py);
        } else if (it.kind === 'enemy') this.drawEnemy(ctx, it.a, t);
        else this.drawActor(ctx, it.a, t, it.kind === 'player');
      }
      if (this.strikeFx) this.drawStrike(ctx);
      this.particles.drawWorld(ctx, camX, camY);
      for (const f of this.hooks('drawOver')) f(ctx, t, this);
      // emotes & interaction prompt in world space
      for (const a of [this.player, ...this.followers, ...this.npcs]) if (a.emote) this.drawEmote(ctx, a, t);
      if (this.interactTarget && !G.Script.busy() && !this.player.moving) this.drawPrompt(ctx, this.interactTarget, t);
      ctx.restore();

      // lighting
      const lc = this.lightCfg;
      if (lc && (lc.ambient > 0 || lc.tint)) G.FX.lighting(ctx, this, camX, camY, t);
      this.particles.drawScreen(ctx);
      // psychedelic overlay
      const psy = Math.max(val(this.def.psychedelic) || 0, G.state.vars.vision > 0 ? Math.min(1, G.state.vars.vision / 3) * 0.75 : 0);
      if (psy > 0) G.FX.vision(ctx, t, psy);
      if (val(this.def.vignette) !== false) G.FX.vignette(ctx, lc && lc.ambient > 0.3 ? 0.55 : 0.32);
      this.drawScreenHooks(ctx, t);
      this.drawHud(ctx, t);
    }
    drawScreenHooks(ctx, t) {
      for (const f of this.hooks('drawScreen')) { ctx.save(); f(ctx, t, this); ctx.restore(); }
    }

    // 3D path: the WebGL layer renders the world; this draws the 2D overlay (prompts, emotes, HUD, screen fx).
    // v.frame(ctx) also runs the 2D map hooks: world-space output → ground decal, screen-space output → a layer that
    // v.drawHookLayer(ctx) composites after the screen fx, under drawScreen and the HUD.
    draw3d(ctx) {
      const t = this.t, v = this.view3d;
      this.camFrame();
      v.frame(ctx);
      if (this.strikeFx) {
        const p = this.player, s = v.actorScreen(p, 0.9);
        ctx.save(); ctx.translate(s.x - p.px, s.y - (p.py - 40)); this.drawStrike(ctx); ctx.restore();
      }
      for (const e of this.enemies) if (e.alert > 0.5) {
        const s = v.actorScreen(e);
        if (s.visible) G.Render.text(ctx, '!', s.x, s.y - 30 + Math.sin(t * 10) * 2, { size: 30, bold: true, align: 'center', color: '#ff6a5a', stroke: '#300', strokeW: 4 });
      }
      for (const a of [this.player, ...this.followers, ...this.npcs]) if (a.emote) {
        const s = v.actorScreen(a);
        const proxy = { emote: a.emote, px: s.x, py: s.y + 112 - 6 };
        this.drawEmote(ctx, proxy, t);
        if (!proxy.emote) a.emote = null;
      }
      if (this.interactTarget && !G.Script.busy() && !this.player.moving) {
        const it = this.interactTarget;
        let s;
        if (it.kind === 'npc') s = v.actorScreen(it.npc);
        else if (it.kind === 'enemy') s = v.actorScreen(it.enemy);
        else if (it.kind === 'chest') s = v.toScreen(it.obj.x + 0.5, 1.1, it.obj.y + 0.5);
        else if (it.kind === 'obj') s = v.toScreen(it.obj.x + (it.obj.w || 1) / 2, 1.5, it.obj.y + (it.obj.h || 1) / 2);
        else { const [fx, fy] = this.frontCell(); s = v.toScreen(fx + 0.5, 1.2, fy + 0.5); }
        this.drawPrompt(ctx, it, t, s);
      }
      this.particles.drawScreen(ctx);
      const psy = Math.max(val(this.def.psychedelic) || 0, G.state.vars.vision > 0 ? Math.min(1, G.state.vars.vision / 3) * 0.75 : 0);
      if (psy > 0) G.FX.vision(ctx, t, psy * 0.55);
      v.drawHookLayer(ctx); // screen-space output of drawGround/drawOver (see Map3D SplitCtx)
      this.drawScreenHooks(ctx, t);
      this.drawHud(ctx, t);
    }

    drawActor(ctx, a, t, isPlayer) {
      const sprite = isPlayer ? (G.state.party[0] || 'xinghe') : (a.sprite || a.id);
      const o = { alpha: a.alpha, ghost: a.ghost };
      if (a.jump) o.lift = a.jump;
      ctx.save();
      if (a.offsetY) ctx.translate(0, a.offsetY);
      if (a.jumpY) ctx.translate(0, -a.jumpY);
      let ok = false;
      if (G.Sprites && G.Sprites.has(sprite)) {
        try { G.Sprites.drawChar(ctx, sprite, a.dir, a.frame, Math.round(a.px), Math.round(a.py), o); ok = true; } catch (e) { G.warnOnce('sprite ' + sprite, e); }
      } else G.warnOnce('missing sprite ' + sprite);
      if (!ok) this.fallbackChar(ctx, a, isPlayer);
      ctx.restore();
    }

    drawEnemy(ctx, e, t) {
      const x = e.px, y = e.py;
      ctx.save();
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x, y - 2, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
      if (e.def.sprite && G.Sprites) {
        G.Sprites.drawChar(ctx, e.def.sprite, e.dir, e.frame, x, y, { shadow: false });
      } else {
        const art = e.def.art || (G.Data.troops[e.def.troop] && G.Data.enemies[G.Data.troops[e.def.troop].enemies[0]] && G.Data.enemies[G.Data.troops[e.def.troop].enemies[0]].art);
        const md = G.Monsters.get(art);
        const sc = e.def.mapScale || (md ? U.clamp(80 / md.h, 0.22, 0.6) : 0.45);
        const bob = Math.sin(t * 4 + e.homeX) * 3;
        ctx.translate(x, y + bob - (e.stun > 0 ? 0 : 0));
        if (e.dir === 'left') ctx.scale(-1, 1);
        ctx.scale(sc, sc);
        if (e.stun > 0) ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 30);
        G.Monsters.draw(ctx, art, 0, 0, t, { state: 'idle', variant: e.def.variant || 0 });
      }
      ctx.restore();
      // alert mark
      if (e.alert > 0.5) {
        G.Render.text(ctx, '!', x, y - 110 + Math.sin(t * 10) * 2, { size: 30, bold: true, align: 'center', color: '#ff6a5a', stroke: '#300', strokeW: 4 });
      }
    }

    drawStrike(ctx) {
      const s = this.strikeFx;
      s.t += 1 / 60;
      if (s.t > 0.3) { this.strikeFx = null; return; }
      const p = this.player;
      const [dx, dy] = U.dirs[s.dir];
      const cx = p.px + dx * 30, cy = p.py - 40 + dy * 30;
      ctx.save();
      ctx.globalAlpha = 1 - s.t / 0.3;
      ctx.strokeStyle = '#fff4d0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.shadowColor = '#ffb050'; ctx.shadowBlur = 18;
      const a0 = Math.atan2(dy, dx) - 1.2 + s.t * 6;
      ctx.beginPath(); ctx.arc(cx, cy, 44, a0, a0 + 1.6); ctx.stroke();
      ctx.restore();
    }

    drawEmote(ctx, a, t) {
      const em = a.emote;
      em.t = (em.t || 0) + 1 / 60;
      if (em.t > (em.life || 1.6)) { a.emote = null; return; }
      const x = a.px, y = a.py - 112 - Math.min(1, em.t * 8) * 10;
      ctx.save();
      const s = Math.min(1, em.t * 7);
      ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(255,252,240,0.95)';
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-22, -22, 44, 38, 12); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6, 15); ctx.lineTo(0, 24); ctx.lineTo(6, 15); ctx.fill();
      const colors = { '!': '#d8382a', '?': '#2a62c8', '…': '#444', '♪': '#c8288a', '💢': '#d8382a', '♥': '#e8406a', '💧': '#3a8ad8', '✦': '#d89a2a' };
      G.Render.text(ctx, em.k, 0, -16, { size: 26, bold: true, align: 'center', color: colors[em.k] || '#333', shadow: false });
      ctx.restore();
    }

    drawPrompt(ctx, it, t, at) {
      let x, y, label = '';
      if (it.kind === 'npc') { x = it.npc.px; y = it.npc.py - 108; label = '對話'; }
      else if (it.kind === 'chest') { x = it.obj.x * T + T / 2; y = it.obj.y * T - 20; label = '開啟'; }
      else if (it.kind === 'event') { const [fx, fy] = this.frontCell(); x = fx * T + T / 2; y = fy * T - 10; label = it.ev.label || '調查'; }
      else if (it.kind === 'obj') { x = (it.obj.x + (it.obj.w || 1) / 2) * T; y = it.obj.y * T - 16; label = it.obj.label || '調查'; }
      else if (it.kind === 'enemy') { x = it.enemy.px; y = it.enemy.py - 100; label = '先制攻擊'; }
      if (at) { x = at.x; y = at.y; }
      y += Math.sin(t * 4) * 3;
      ctx.save();
      ctx.font = G.font(17);
      const w = G.Render.measure(ctx, label) + 44;
      ctx.fillStyle = 'rgba(10,14,28,0.78)';
      ctx.beginPath(); ctx.roundRect(x - w / 2, y - 30, w, 28, 14); ctx.fill();
      ctx.strokeStyle = it.kind === 'enemy' ? 'rgba(255,120,100,0.8)' : 'rgba(240,210,140,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = it.kind === 'enemy' ? '#ff8a70' : '#ffd97a';
      ctx.beginPath(); ctx.arc(x - w / 2 + 14, y - 16, 8, 0, Math.PI * 2); ctx.fill();
      G.Render.text(ctx, 'Z', x - w / 2 + 14, y - 25, { size: 13, bold: true, align: 'center', color: '#1a1a1a', shadow: false });
      G.Render.text(ctx, label, x - w / 2 + 28, y - 27, { size: 17, color: '#f6ead0', shadow: false });
      ctx.restore();
    }

    drawHud(ctx, t) {
      // location banner
      if (this.banner > 0 && this.map.name) {
        const a = Math.min(1, this.banner * 2, (4 - this.banner) * 1.5);
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        const x = 40, y = 40;
        // long (English) place names: the backing gradient grows with the name, and the name shrinks past ~800px
        const nm = G.Render.fit(ctx, this.map.name, 800, { size: 40, minSize: 30 });
        const bw = Math.max(460, nm.w + 120);
        const g = ctx.createLinearGradient(x, 0, x + bw, 0);
        g.addColorStop(0, 'rgba(6,8,18,0.8)'); g.addColorStop(Math.min(0.75, (nm.w + 40) / bw), 'rgba(6,8,18,0.6)'); g.addColorStop(1, 'rgba(6,8,18,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 10, y - 6, bw + 10, 82);
        ctx.fillStyle = G.UI.GOLD; ctx.fillRect(x - 10, y - 6, 3, 82);
        G.Render.text(ctx, nm.str, x + 12, y + 2 + (40 - nm.size) / 2, { size: nm.size, color: '#fbeec8', glow: 'rgba(255,190,100,0.6)', glowBlur: 16 });
        const sub = val(this.def.subtitle) || (G.Chapters && G.Chapters[G.state.chapter]) || '';
        if (sub) G.Render.textClip(ctx, sub, x + 14, y + 52, 800, { size: 18, color: '#cbbf9e' });
        ctx.restore();
      }
      // objective tracker
      const obj = G.state.vars.objective;
      if (obj && !G.Script.busy()) {
        ctx.save();
        ctx.font = G.font(18);
        const tw = G.Render.measure(ctx, obj);
        const x = G.W - tw - 64, y = 22;
        G.UI.plate(ctx, x, y, tw + 44, 36, 0.55, 18);
        G.UI.lanternIcon(ctx, x + 18, y + 18, 6, t);
        G.Render.text(ctx, obj, x + 32, y + 7, { size: 18, color: '#f0e4c4' });
        ctx.restore();
      }
      // vision timer
      if (G.state.vars.vision > 0) {
        const v = G.state.vars.vision;
        ctx.save();
        G.UI.plate(ctx, 24, G.H - 64, 168, 40, 0.6, 20);
        G.UI.icon(ctx, 'mushroom', 34, G.H - 60, 32);
        G.Render.text(ctx, '靈視 ' + Math.ceil(v) + '秒', 74, G.H - 55, { size: 19, color: '#e8d0ff' });
        ctx.restore();
      }
    }

    // ---------- fallbacks while art modules are missing ----------
    fallbackTile(ctx, id, x, y) {
      const colors = { grass: '#4a7a3a', water: '#2a5a8a', stone: '#8a8478', wood: '#8a6a44', void: '#000', cliff: '#5a4a3a', sand: '#d8c890' };
      ctx.fillStyle = colors[id] || '#3a5a3a';
      ctx.fillRect(x, y, T, T);
    }
    fallbackObj(ctx, o, x, y) {
      ctx.fillStyle = 'rgba(120,80,60,0.8)';
      ctx.fillRect(x + 4, y + 4, (o.w || 1) * T - 8, (o.h || 1) * T - 8);
    }
    fallbackChar(ctx, a, isPlayer) {
      ctx.fillStyle = isPlayer ? '#3a5aa8' : '#a85a3a';
      ctx.beginPath(); ctx.ellipse(a.px, a.py - 30, 16, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f0d0b0'; ctx.beginPath(); ctx.arc(a.px, a.py - 66, 14, 0, Math.PI * 2); ctx.fill();
    }

    // collect light sources in world coords
    collectLights() {
      const out = [];
      for (const o of this.objects) {
        if (!this.objActive(o)) continue;
        const d = G.Objects.get(o.t);
        if (d && d.lights) {
          for (const l of d.lights(o) || []) out.push({ x: o.x * T + l.dx, y: o.y * T + l.dy, r: l.r, color: l.color, flicker: l.flicker });
        }
        if (o.light) out.push({ x: o.x * T + T / 2, y: o.y * T + T / 2, r: o.light.r || 160, color: o.light.color || '#ffb060', flicker: o.light.flicker });
      }
      for (const n of this.npcs) if (n.light) out.push({ x: n.px, y: n.py - 40, r: n.light.r || 120, color: n.light.color || '#ffb060', flicker: 0.2 });
      for (const l of val(this.def.lights) || []) out.push({ x: l.x * T + T / 2, y: l.y * T + T / 2, r: l.r, color: l.color, flicker: l.flicker });
      const lc = this.lightCfg;
      if (lc.player !== false && lc.ambient > 0.25) {
        out.push({ x: this.player.px, y: this.player.py - 40, r: lc.playerR || 200, color: lc.playerColor || '#ffcf8a', flicker: 0.15 });
      }
      if (G.state.vars.vision > 0 || val(this.def.psychedelic)) {
        out.push({ x: this.player.px, y: this.player.py - 40, r: 260, color: '#c89aff', flicker: 0.1 });
      }
      return out;
    }
  }
  G.MapScene = MapScene;
})();

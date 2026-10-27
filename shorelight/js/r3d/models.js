// 3D model registry (map objects, props, buildings) + billboard fallbacks built from the 2D art.
// Contract: docs/CONTRACTS_3D.md.
'use strict';
G.Models = (() => {
  const M = {
    defs: {},
    // def: { build(o, K) -> THREE.Object3D, variants?: n (o.v % n picks a cached variant), key?(o) -> cache key suffix,
    //        occluder?: bool (cut out when in front of the player; default true when height > 1.6),
    //        update?(node, o, t, dt) per-frame animation, lights?(o) -> [{x,y,z,color,intensity,distance,flicker}] (local units) }
    define(id, def) { this.defs[id] = def; },
    has(id) { return !!this.defs[id]; },
  };
  const cache = new Map();

  // Build (cached) and return a fresh instance sharing geometry & materials.
  M.create = function (id, o = {}) {
    const d = M.defs[id];
    if (!d) return null;
    const v = d.variants ? ((o.v || 0) % d.variants) : 0;
    const key = id + '#' + v + (d.key ? '#' + d.key(o) : '');
    let proto = cache.get(key);
    if (!proto) {
      try {
        proto = d.build(Object.assign({}, o, { v }), M.kit());
      } catch (e) { G.warnOnce('model ' + id, e); return null; }
      if (!proto) return null;
      proto.traverse((n) => { if (n.isMesh && n.castShadow === undefined) n.castShadow = true; });
      cache.set(key, proto);
    }
    const inst = d.noClone ? proto : (G.R3.hasSkin(proto) ? THREE.SkeletonUtils.clone(proto) : proto.clone(true));
    inst.userData.modelId = id;
    return inst;
  };

  M.clearCache = function () { cache.clear(); };

  // helper kit passed to build(): materials + common geometry helpers
  M.kit = function () {
    const T = THREE, R = G.R3M;
    const matCache = M._mats || (M._mats = new Map());
    const K = {
      T, R,
      // cached env material by colour/params (shared across models → fewer programs)
      mat(color, o = {}) {
        const key = color + JSON.stringify(o);
        if (!matCache.has(key)) matCache.set(key, R.env(Object.assign({ color: new T.Color(color) }, o)));
        return matCache.get(key);
      },
      glow(color, intensity = 2.5) {
        const key = 'glow' + color + intensity;
        if (!matCache.has(key)) matCache.set(key, new T.MeshStandardMaterial({ color: 0x000000, emissive: new T.Color(color), emissiveIntensity: intensity, roughness: 1 }));
        return matCache.get(key);
      },
      mesh(geo, mat, x = 0, y = 0, z = 0, opts = {}) {
        const m = new T.Mesh(geo, mat);
        m.position.set(x, y, z);
        if (opts.rx) m.rotation.x = opts.rx; if (opts.ry) m.rotation.y = opts.ry; if (opts.rz) m.rotation.z = opts.rz;
        if (opts.s) m.scale.setScalar(opts.s);
        m.castShadow = opts.cast !== false; m.receiveShadow = opts.receive !== false;
        return m;
      },
      box(w, h, d, mat, x = 0, y = 0, z = 0, opts) { return K.mesh(new T.BoxGeometry(w, h, d), mat, x, y + h / 2, z, opts); },
      rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, opts) { return K.mesh(new T.RoundedBoxGeometry(w, h, d, 2, r), mat, x, y + h / 2, z, opts); },
      cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, opts = {}) { return K.mesh(new T.CylinderGeometry(rt, rb, h, opts.seg || 12), mat, x, y + h / 2, z, opts); },
      sphere(r, mat, x = 0, y = 0, z = 0, opts = {}) { return K.mesh(new T.SphereGeometry(r, opts.seg || 16, opts.seg ? opts.seg * 0.75 | 0 : 12), mat, x, y, z, opts); },
      group(...kids) { const g = new T.Group(); for (const k of kids) if (k) g.add(k); return g; },
      // merge all static meshes of a group by material → few draw calls
      merge(group) { return G.R3.mergeStatic(group); },
    };
    return K;
  };

  // ------------------------------------------------------------------ 2D-art billboards (fallback)
  const bbCache = new Map();
  // Render a 2D G.Objects drawing into a trimmed canvas (cached per type+variant+state).
  function objectCanvas(o) {
    const d = G.Objects.get(o.t);
    const key = o.t + '#' + (o.v || 0) + (o.open ? 'o' : '') + (o.state || '');
    if (bbCache.has(key)) return bbCache.get(key);
    const T = G.TILE;
    const ow = (o.w || (d ? d.w : 1)), oh = (o.h || (d ? d.h : 1));
    const padX = 160, padTop = 420, padBot = 40;
    const W = ow * T + padX * 2, H = oh * T + padTop + padBot;
    const c = G.U.makeCanvas(W, H);
    const g = c.getContext('2d');
    try { if (d && d.draw) d.draw(g, padX, padTop, Object.assign({}, o, { x: 0, y: 0 }), 0); } catch (e) { G.warnOnce('bb ' + o.t, e); }
    // trim (canvas may be backed at G.S scale)
    const sc = c.width / W;
    const img = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
      if (img[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    let res = null;
    if (x1 >= 0) {
      x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(c.width - 1, x1 + 2); y1 = Math.min(c.height - 1, y1 + 2);
      const out = document.createElement('canvas');
      out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
      out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
      // logical-px geometry relative to the footprint: left edge & bottom edge of the footprint
      res = { canvas: out, lw: out.width / sc, lh: out.height / sc, left: x0 / sc - padX, top: y0 / sc - padTop, fw: ow * T, fh: oh * T };
    }
    bbCache.set(key, res);
    return res;
  }

  // flat-on-ground 2D objects (decals) vs. standing billboards
  const FLAT = new Set(['rug', 'bed_mat', 'lily', 'lotus', 'seaweed', 'switch', 'stairs_up', 'stairs_down', 'door_frame', 'bones', 'water_lantern', 'divination_blocks']);
  M.isFlat = (t) => FLAT.has(t) || (G.Objects.get(t) && G.Objects.get(t).flat);

  // Standing billboard: vertical card anchored at the footprint's bottom edge, yawed toward the camera each frame
  // by the view (node.userData.billboard = true). Casts alpha-tested shadows.
  M.billboard = function (o) {
    const info = objectCanvas(o);
    if (!info) return null;
    const T = THREE, U = G.TILE;
    const tex = G.R3M.canvasTex(info.canvas);
    tex.shared = true;
    const flat = M.isFlat(o.t);
    const mat = new T.MeshStandardMaterial({ map: tex, alphaTest: 0.35, transparent: false, roughness: 0.95, side: T.DoubleSide });
    G.R3M.addCutout(mat);
    const w = info.lw / U, h = info.lh / U;
    const geo = new T.PlaneGeometry(w, h);
    const mesh = new T.Mesh(geo, mat);
    const g = new T.Group();
    const fw = info.fw / U, fh = info.fh / U;
    if (flat) {
      // lay flat: 2D top-down art maps directly onto the ground
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(info.left / U + w / 2 - fw / 2, 0.02, info.top / U + h / 2 - fh / 2);
      mesh.receiveShadow = true;
      g.add(mesh);
    } else {
      // card stands on the footprint's south edge; art's footprint-bottom aligns with y=0
      const bottomBelow = (info.top + info.lh) / U - fh; // how far art extends below the footprint bottom
      geo.translate(info.left / U + w / 2 - fw / 2, h / 2 - bottomBelow, 0);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: tex, alphaTest: 0.35 });
      const pivot = new T.Group();
      pivot.position.z = fh / 2 - 0.2;
      pivot.add(mesh);
      pivot.userData.billboard = true;
      g.add(pivot);
    }
    g.userData.fallback = true;
    return g;
  };

  // ------------------------------------------------------------------ character billboard fallback
  // Same interface as G.Char3D instances so the map/battle views can treat both alike.
  const charFrames = new Map();
  function charCanvas(id, view, frame) {
    const key = id + view + frame;
    if (charFrames.has(key)) return charFrames.get(key);
    const W = 200, H = 220;
    const c = G.U.makeCanvas(W, H);
    const g = c.getContext('2d');
    const dir = view === 'back' ? 'up' : view === 'front' ? 'down' : 'left';
    try { G.Sprites.drawChar(g, id, dir, frame, W / 2, H - 20, { shadow: false }); } catch (e) { G.warnOnce('charbb ' + id, e); }
    const tex = G.R3M.canvasTex(c);
    tex.shared = true;
    const r = { tex, w: W / G.TILE, h: H / G.TILE, foot: 20 / G.TILE };
    charFrames.set(key, r);
    return r;
  }
  class CharBillboard {
    constructor(id, opts = {}) {
      const T = THREE;
      this.id = id; this.isFallback = true;
      this.root = new T.Group();
      this.mat = new T.MeshStandardMaterial({ alphaTest: 0.4, roughness: 0.9, side: T.DoubleSide, transparent: false });
      const f = charCanvas(id, 'front', 0);
      this.geo = new T.PlaneGeometry(f.w, f.h);
      this.geo.translate(0, f.h / 2 - f.foot, 0);
      this.mesh = new T.Mesh(this.geo, this.mat);
      this.mesh.castShadow = true;
      this.depth = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, alphaTest: 0.4 });
      this.mesh.customDepthMaterial = this.depth;
      this.root.add(this.mesh);
      this.yaw = 0; this.speed = 0; this.phase = 0; this.flip = false;
      this.height = 1.5;
      this.setFrame('front', 0);
    }
    setFrame(view, frame) {
      const f = charCanvas(this.id, view, frame);
      if (this.mat.map !== f.tex) { this.mat.map = f.tex; this.depth.map = f.tex; this.mat.needsUpdate = true; this.depth.needsUpdate = true; }
    }
    setFacing(yaw) { this.yaw = yaw; }
    setMove(speed) { this.speed = speed; }
    play() {} setExpression() {} lookAt() {} setAnim() {}
    setOpacity(a, ghost) { const o = a * (ghost ? 0.75 : 1); this.mat.transparent = o < 0.99; this.mat.opacity = o; }
    // camYaw: camera yaw; picks the sprite view from the character's yaw relative to the camera
    update(dt, camYaw = 0) {
      this.phase += dt * this.speed * 2.2;
      const rel = G.U.wrapAngle ? G.U.wrapAngle(this.yaw - camYaw) : Math.atan2(Math.sin(this.yaw - camYaw), Math.cos(this.yaw - camYaw));
      // yaw 0 = facing +z (toward default camera = 'front')
      let view = 'front', flip = false;
      if (Math.abs(rel) < Math.PI / 4) view = 'front';
      else if (Math.abs(rel) > Math.PI * 3 / 4) view = 'back';
      else { view = 'side'; flip = rel > 0; } // 2D side art faces left
      const frame = this.speed > 0.05 ? [0, 1, 0, 3][Math.floor(this.phase) % 4] : 0;
      this.setFrame(view, frame);
      this.mesh.scale.x = flip ? -1 : 1;
      this.mesh.rotation.y = camYaw;
    }
    dispose() { this.geo.dispose(); this.mat.dispose(); this.depth.dispose(); }
  }
  M.CharBillboard = CharBillboard;

  // monster billboard (2D G.Monsters art, idle frame) with a breathing bob
  class MonBillboard extends CharBillboard {
    constructor(art, opts = {}) {
      super('villager_m');
      this.id = art;
      const md = G.Monsters.get(art);
      const mw = md ? md.w : 140, mh = md ? md.h : 160;
      const W = Math.ceil(mw * 1.7), H = Math.ceil(mh * 1.5);
      const c = G.U.makeCanvas(W, H);
      try { G.Monsters.draw(c.getContext('2d'), art, W / 2, H - 16, 0, { state: 'idle', variant: opts.variant || 0 }); } catch (e) { G.warnOnce('monbb ' + art, e); }
      const tex = G.R3M.canvasTex(c);
      const hU = opts.height || 1.35;
      const k = hU / (mh / G.TILE); // scale so the creature body is ~height tall
      const w = W / G.TILE * k, h = H / G.TILE * k;
      this.geo.dispose();
      this.geo = new THREE.PlaneGeometry(w, h);
      this.geo.translate(0, h / 2 - 16 / G.TILE * k, 0);
      this.mesh.geometry = this.geo;
      this.mat.map = tex; this.depth.map = tex; this.mat.needsUpdate = true; this.depth.needsUpdate = true;
      this.monTex = tex;
      this.height = hU;
    }
    setFrame() {}
    update(dt, camYaw = 0) {
      this.phase += dt;
      const rel = Math.atan2(Math.sin(this.yaw - camYaw), Math.cos(this.yaw - camYaw));
      this.mesh.scale.x = rel > 0.2 ? -1 : 1; // 2D monster art faces left
      this.mesh.scale.y = 1 + Math.sin(this.phase * 3.2) * 0.025;
      this.mesh.position.y = Math.max(0, Math.sin(this.phase * 4)) * 0.04 * (this.speed > 0.1 ? 3 : 1);
      this.mesh.rotation.y = camYaw;
    }
    setOpacity(a) { this.mat.transparent = a < 0.99; this.mat.opacity = a; }
    dispose() { super.dispose(); if (this.monTex) this.monTex.dispose(); }
  }
  M.MonBillboard = MonBillboard;
  M.monsterBillboard = (art, opts) => new MonBillboard(art, opts);

  return M;
})();

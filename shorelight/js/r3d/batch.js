// Map3D static-object batching: repeated static map objects of the same model variant (trees, bamboo, grasses,
// rocks, stumps, logs …) are drawn as THREE.InstancedMeshes instead of one node (2–4 draw calls) each. Called by
// Map3D.syncObjects; see docs/qa/sweep3d.md "Batching". On by default; ?nobatch turns it off.
//
// What is batched — everything else keeps its own node, exactly as before:
//   • objects with no `if:` condition, not spirit / illusion, no o.alpha, active when the map is built;
//   • models with no update() hook, or whose def says `batch: true` (update() only ticks a shared clock and applies a
//     one-time pose, given as def.pose(node, o) — nature's per-instance yaw spin()), and not noClone / noBatch;
//   • models made only of plain meshes (no lights, sprites, points, lines, skinned/morph meshes, 2D-art billboards)
//     whose materials' shader patches are all instancing-aware (G.R3M.instSafe: the occluder cutout and G.Wind3D
//     windify; prop shaders that read modelMatrix for a per-object phase are not);
//   • at least 2 such objects of the same model variant in a 16×16-tile chunk.
// Opaque / alpha-tested meshes: one InstancedMesh per model mesh per chunk (keeps frustum culling). Alpha-blended
// meshes (ground decals): one InstancedMesh per geometry + material for the whole map, its instances sorted back to
// front exactly like the renderer sorts separate objects (depth, ties by mesh id), so overlapping decals blend in the
// same order as before. A decal that overlaps a blended mesh drawn separately (another material, or one that is not
// batched) cannot join: it stays a mesh of its own inside the proxy, and all nodes are created in map order so ids
// (and with them the order of equal-depth decals in one tile row) match the unbatched view.
// Each instance matrix is the world matrix the per-object mesh had (holder × node(+pose) × mesh chain) and the
// InstancedMesh itself stays at identity, so the wind shader (modelMatrix × instanceMatrix) sees the same origin:
// same per-plant sway phase, colour hash, cutout and shadows (up to float rounding of the matrix product on the GPU).
//
// build() creates every object's node (the others are handed to view.nodes as syncObjects would have built them).
// Each batched object keeps an invisible proxy holder in view.nodes (same userData.o / sig / def, precomputed AABB for
// the tall-occluder test, an empty child for update()), so objActive / sig / removal logic still runs on it. When a
// proxy is replaced or removed by syncObjects, hidden, or the object turns dynamic (alpha, spirit, if), its instances
// are removed from the batch and the object gets an ordinary per-object node from then on.
'use strict';
G.Batch3D = (() => {
  const B = { enabled: !/[?&]nobatch\b/.test(location.search), CH: 16, MIN: 2 };

  B.staticObj = (o) => !o.if && !o.spirit && !o.illusion && o.alpha == null && !o.noBatch;
  B.staticDef = (d) => !!d && !d.noClone && !d.noBatch && (!d.update || d.batch === true);

  function safeMat(m) {
    const T = THREE;
    if (!m || m.onBeforeRender !== T.Material.prototype.onBeforeRender) return false;
    return m.onBeforeCompile === T.Material.prototype.onBeforeCompile || (G.R3M.instSafe && G.R3M.instSafe.has(m.onBeforeCompile));
  }
  function shown(n, root) { for (let p = n; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }
  const mats = (n) => (Array.isArray(n.material) ? n.material : [n.material]);
  const blended = (n) => mats(n).some((m) => m.transparent);

  // the meshes of a placed object (holder with world matrices updated), or null when it can't be instanced
  function pieces(holder) {
    const out = [];
    let ok = true;
    holder.traverse((n) => {
      if (!ok) return;
      if (n.isLight || n.isSprite || n.isPoints || n.isLine || n.isSkinnedMesh || n.isInstancedMesh || n.isBatchedMesh ||
        n.userData.billboard || n.userData.fallback) { ok = false; return; }
      if (!n.isMesh) return;
      if (n.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender || n.morphTargetInfluences) { ok = false; return; }
      if (!shown(n, holder)) return; // hidden parts never render (no update() to show them)
      if (!mats(n).every(safeMat)) { ok = false; return; }
      out.push(n);
    });
    return ok && out.length ? out : null;
  }
  const uid = (x) => (x ? x.uuid : '');
  const meshSig = (n) => [n.geometry.uuid, mats(n).map(uid).join(','),
    n.castShadow ? 1 : 0, n.receiveShadow ? 1 : 0, n.renderOrder, uid(n.customDepthMaterial), uid(n.customDistanceMaterial),
    n.frustumCulled ? 1 : 0, n.layers.mask].join(':');
  // nature decals (mat.userData.decal: same material but for the map) of one geometry share a group, drawn from a
  // texture atlas of their maps; any other blended mesh groups by its own geometry + material
  const pow2 = (x) => x > 0 && (x & (x - 1)) === 0;
  const atlasable = (n) => !Array.isArray(n.material) && n.material.userData.decal && n.material.map && n.material.map.image &&
    n.material.map.image.width === n.material.map.image.height && pow2(n.material.map.image.width);
  const blendSig = (n) => (atlasable(n) ? 'decal' + n.material.map.image.width + '|' + meshSig(n).replace(n.material.uuid, '') : meshSig(n));

  // one material + texture atlas for a decal group's maps (all the same power-of-two size, tiles aligned to it, so
  // every mip level of a tile equals that level of the original map): instance attribute aTile picks the tile
  function atlasMaterial(src, maps) {
    const T = THREE, S = maps[0].image.width;
    let g = 1;
    while (g * g < maps.length) g *= 2;
    const cv = document.createElement('canvas');
    cv.width = cv.height = g * S;
    const cx = cv.getContext('2d');
    const tiles = new Map();
    maps.forEach((m, i) => {
      const x = i % g, y = (i / g) | 0;
      cx.drawImage(m.image, x * S, y * S);
      tiles.set(m, [x / g, m.flipY ? 1 - (y + 1) / g : y / g]); // canvas rows run down, flipY textures' v runs up
    });
    const tx = new T.CanvasTexture(cv);
    for (const k of ['colorSpace', 'flipY', 'anisotropy', 'magFilter', 'minFilter', 'generateMipmaps', 'premultiplyAlpha', 'wrapS', 'wrapT']) tx[k] = maps[0][k];
    tx.needsUpdate = true;
    const mat = src.clone();
    mat.userData = {};
    mat.map = tx;
    if (src.userData.cutout) G.R3M.addCutout(mat);
    const prev = mat.onBeforeCompile, scale = 1 / g;
    mat.onBeforeCompile = function (sh, r) {
      if (prev && prev !== T.Material.prototype.onBeforeCompile) prev.call(this, sh, r);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aTile;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * ' + scale.toFixed(6) + ' + aTile;\n#endif');
    };
    const prevKey = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|atlas' + g; };
    return { mat, tiles };
  }

  // group: { t, src: [Mesh] (one per InstancedMesh), meshes: [InstancedMesh], slots: [slot], transparent }
  // slot: one object's instance in a group { e, grp, idx, mats: [Matrix4 per mesh], z: sort point, id: tie-break }
  // entry: one batched object { o, proxy, slots: [slot] }
  class Batch {
    constructor(view) {
      this.view = view;
      this.group = new THREE.Group();
      this.group.name = 'batch3d';
      this.groups = [];
      this.entries = [];
      this.stats = { objects: 0, batches: 0, meshes: 0, ownDecals: 0, decalOnly: 0, released: 0 };
    }

    // build from the map's objects: returns the set of objects drawn by this batch
    build() {
      const view = this.view, ms = view.ms, CH = B.CH;
      const cand = new Map(); // model sig @ chunk → [item]
      const blends = []; // every blended mesh of every object: { n, c (world sphere centre), r, sig }
      const addBlends = (holder) => holder.traverse((n) => {
        if (!n.isMesh || !blended(n) || !shown(n, holder)) return;
        if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere();
        const s = n.geometry.boundingSphere;
        blends.push({ n, c: s.center.clone().applyMatrix4(n.matrixWorld), r: s.radius * n.matrixWorld.getMaxScaleOnAxis(), sig: blendSig(n) });
      });
      const all = []; // every object's node, in map order: { o, holder, box (when posed) }
      for (const o of ms.objects) {
        let holder;
        try { holder = view.objNode(o); } catch (e) { continue; }
        holder.updateMatrixWorld(true);
        const it = { o, holder, box: null };
        all.push(it);
        const d = G.Models.defs[o.t], model = holder.children[0];
        if (!B.staticObj(o) || !ms.objActive(o) || !B.staticDef(d) || !model || model.userData.fallback || !model.userData.modelId) { addBlends(holder); continue; }
        // AABB for Map3D.tallOccluder, taken before the pose — the per-node path caches it on its first frame,
        // before the first update() spins the model
        const box = it.box = new THREE.Box3();
        try { box.setFromObject(holder); } catch (e) { box.makeEmpty(); }
        if (!isFinite(box.max.y)) box.makeEmpty();
        if (d.pose) { try { d.pose(model, o); } catch (e) { addBlends(holder); continue; } holder.updateMatrixWorld(true); }
        addBlends(holder);
        // its plain blended meshes (decals) may join a decal group even when the rest of the model is not batched
        it.bl = [];
        holder.traverse((n) => {
          if (n.isMesh && blended(n) && shown(n, holder) && !n.isInstancedMesh && !n.isSkinnedMesh && !n.morphTargetInfluences &&
            n.onBeforeRender === THREE.Object3D.prototype.onBeforeRender && mats(n).every(safeMat)) it.bl.push(n);
        });
        const ps = pieces(holder);
        if (!ps) continue;
        it.ps = ps;
        const fp = view.footprint(o);
        const key = o.t + '|' + ps.filter((n) => !blended(n)).map(meshSig).join(';') +
          '@' + Math.floor((o.x + fp[0] / 2) / CH) + ',' + Math.floor((o.y + fp[1] / 2) / CH);
        if (!cand.has(key)) cand.set(key, []);
        cand.get(key).push(it);
      }
      // A blended mesh (ground decal) can join a map-wide instanced group only if nothing blended that is drawn
      // separately overlaps it at the same renderOrder (the renderer sorts by renderOrder before depth): a mesh of
      // another group, or one that stays per-object. Otherwise the group, drawn as one object, would change their
      // blend order. Repeat until no instanced decal touches an outsider.
      const inst = new Set();
      for (const it of all) if (it.bl) for (const n of it.bl) inst.add(n);
      if (inst.size) {
        const cell = Math.max(1, 2 * Math.max(...blends.map((b) => b.r))), grid = new Map();
        const ck = (x, z) => x + ',' + z;
        for (const b of blends) {
          const k = ck(Math.floor(b.c.x / cell), Math.floor(b.c.z / cell));
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(b);
        }
        const near = (a) => {
          const out = [], gx = Math.floor(a.c.x / cell), gz = Math.floor(a.c.z / cell);
          for (let x = gx - 1; x <= gx + 1; x++) for (let z = gz - 1; z <= gz + 1; z++) {
            for (const b of grid.get(ck(x, z)) || []) if (b !== a && b.n.renderOrder === a.n.renderOrder && a.c.distanceTo(b.c) < a.r + b.r) out.push(b);
          }
          return out;
        };
        const todo = blends.filter((a) => inst.has(a.n) && near(a).some((b) => b.sig !== a.sig || !inst.has(b.n)));
        for (const a of todo) inst.delete(a.n);
        while (todo.length) { // a decal that just left its group is now an outsider to its same-group neighbours
          const a = todo.pop();
          for (const b of near(a)) if (inst.has(b.n)) { inst.delete(b.n); todo.push(b); }
        }
      }
      const opaque = [], trans = new Map(); // blended meshes: one map-wide group per mesh sig
      for (const items of cand.values()) {
        if (items.length < B.MIN) continue;
        const grp = { t: items[0].o.t, src: items[0].ps.filter((n) => !blended(n)), meshes: [], slots: [], transparent: false };
        if (grp.src.length) opaque.push(grp);
        for (const it of items) it.grp = grp;
        this.stats.objects += items.length;
      }
      // nodes in map order, so every mesh that stays separate keeps the id order (the renderer's tie-break for
      // equal depths, e.g. decals in one tile row) it has without batching
      const done = new Set();
      const inv = new THREE.Matrix4();
      for (const it of all) {
        if (!it.grp) {
          // not batched: the node syncObjects would build (posed early, which update() would do on its first frame)
          if (it.box) it.holder.userData.box = it.box;
          view.nodes.set(it.o, it.holder); view.scene.add(it.holder);
          // … but its decals may still be drawn by a decal group: the holder then serves as the entry's proxy
          const dl = (it.bl || []).filter((n) => inst.has(n));
          if (!dl.length) continue;
          const e = { o: it.o, proxy: it.holder, slots: [] };
          for (const n of dl) { n.parent.remove(n); e.slots.push(this.decalSlot(e, n, trans)); }
          for (const s of e.slots) s.grp.slots.push(s);
          this.entries.push(e);
          this.stats.decalOnly++;
          continue;
        }
        const grp = it.grp;
        const proxy = new THREE.Group();
        const stub = new THREE.Object3D(); // node.children[0] for update(): its pose is already baked
        stub.userData.natSpun = true;
        proxy.add(stub);
        proxy.position.copy(it.holder.position); proxy.rotation.copy(it.holder.rotation);
        Object.assign(proxy.userData, it.holder.userData, { box: it.box, batched: true });
        const e = { o: it.o, proxy, slots: [] };
        if (grp.src.length) e.slots.push({ e, grp, mats: it.ps.filter((n) => !blended(n)).map((n) => n.matrixWorld.clone()) });
        inv.copy(it.holder.matrixWorld).invert();
        for (const n of it.ps) {
          if (!blended(n)) continue;
          if (!inst.has(n)) {
            // overlapping decal: the mesh itself moves into the proxy and is sorted by the renderer as before
            n.matrixAutoUpdate = false;
            n.matrix.multiplyMatrices(inv, n.matrixWorld);
            proxy.add(n);
            this.stats.ownDecals++;
            continue;
          }
          e.slots.push(this.decalSlot(e, n, trans));
        }
        for (const s of e.slots) s.grp.slots.push(s);
        this.entries.push(e);
        view.nodes.set(it.o, proxy);
        view.scene.add(proxy);
        done.add(it.o);
      }
      for (const grp of [...opaque, ...trans.values()]) {
        const maps = grp.transparent ? [...new Set(grp.slots.map((x) => x.map))] : [];
        if (maps.length > 1 && atlasable(grp.src[0])) {
          // several decal maps: one atlas material, tile offsets as an instance attribute on a private geometry
          const { mat, tiles } = atlasMaterial(grp.src[0].material, maps);
          const geo = grp.src[0].geometry.clone();
          grp.tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(grp.slots.length * 2), 2);
          geo.setAttribute('aTile', grp.tileAttr);
          for (const x of grp.slots) x.tile = tiles.get(x.map);
          grp.own = { mat, geo };
        }
        for (const src of grp.src) {
          const im = new THREE.InstancedMesh(grp.own ? grp.own.geo : src.geometry, grp.own ? grp.own.mat : src.material, grp.slots.length);
          im.name = 'batch:' + grp.t;
          im.castShadow = src.castShadow; im.receiveShadow = src.receiveShadow; im.renderOrder = src.renderOrder;
          im.frustumCulled = src.frustumCulled; im.layers.mask = src.layers.mask;
          if (src.customDepthMaterial) im.customDepthMaterial = src.customDepthMaterial;
          if (src.customDistanceMaterial) im.customDistanceMaterial = src.customDistanceMaterial;
          im.userData.batch = true;
          im.matrixAutoUpdate = false; // identity: modelMatrix × instanceMatrix == the per-object modelMatrix
          grp.meshes.push(im);
          this.group.add(im);
        }
        for (let i = 0; i < grp.slots.length; i++) this.write(grp, i);
        this.flush(grp);
        this.groups.push(grp);
        this.stats.batches++; this.stats.meshes += grp.meshes.length;
      }
      if (this.groups.length) view.scene.add(this.group);
      return done;
    }

    // a blended mesh's instance in its map-wide group (made on first use). The renderer sorts blended objects by
    // their bounding-sphere centre, ties by mesh id (creation order): the slot keeps both.
    decalSlot(e, n, trans) {
      const k = blendSig(n);
      let tg = trans.get(k);
      if (!tg) trans.set(k, (tg = { t: e.o.t, src: [n], meshes: [], slots: [], transparent: true }));
      return { e, grp: tg, map: n.material.map, mats: [n.matrixWorld.clone()], z: n.geometry.boundingSphere.center.clone().applyMatrix4(n.matrixWorld), id: n.id };
    }

    write(grp, i) {
      const s = grp.slots[i]; s.idx = i;
      for (let k = 0; k < grp.meshes.length; k++) grp.meshes[k].setMatrixAt(i, s.mats[k]);
      if (grp.tileAttr) { grp.tileAttr.setXY(i, s.tile[0], s.tile[1]); grp.tileAttr.needsUpdate = true; }
    }
    flush(grp) {
      for (const im of grp.meshes) {
        im.count = grp.slots.length; im.instanceMatrix.needsUpdate = true;
        if (im.count) { im.computeBoundingSphere(); im.computeBoundingBox(); }
        im.visible = im.count > 0;
      }
    }
    // drop an object's instances (opaque: swap with the last one; blended: keep the sorted order)
    remove(e) {
      for (const s of e.slots) {
        const grp = s.grp;
        if (grp.transparent) {
          grp.slots.splice(s.idx, 1);
          for (let i = s.idx; i < grp.slots.length; i++) this.write(grp, i);
        } else {
          const last = grp.slots.length - 1;
          if (s.idx !== last) { grp.slots[s.idx] = grp.slots[last]; this.write(grp, s.idx); }
          grp.slots.pop();
        }
        this.flush(grp);
      }
      e.slots.length = 0;
      this.entries.splice(this.entries.indexOf(e), 1);
      this.stats.released++;
    }

    // per frame, after syncObjects: hand objects that are no longer static over to per-object nodes
    sync() {
      const view = this.view;
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const e = this.entries[i];
        const cur = view.nodes.get(e.o);
        if (cur === e.proxy && e.proxy.visible && B.staticObj(e.o)) continue;
        this.remove(e);
        view.scene.remove(e.proxy);
        if (cur === e.proxy) {
          const n = view.objNode(e.o);
          n.visible = e.proxy.visible && !(e.o.alpha != null && e.o.alpha <= 0.01);
          view.nodes.set(e.o, n);
          view.scene.add(n);
        }
      }
      this.sortTransparent();
    }

    // blended batches: draw instances back to front like the renderer's per-object sort (view depth, ties by id).
    // Order along the camera's forward axis is invariant to camera translation, so it is redone only when the view
    // turns.
    sortTransparent() {
      const cam = this.view.camera;
      const f = this._fwd || (this._fwd = new THREE.Vector3());
      cam.getWorldDirection(f);
      const k = f.x.toFixed(4) + ',' + f.y.toFixed(4) + ',' + f.z.toFixed(4);
      if (k === this._sortKey) return;
      this._sortKey = k;
      for (const grp of this.groups) {
        if (!grp.transparent || grp.slots.length < 2) continue;
        for (const s of grp.slots) s.d = s.z.dot(f);
        grp.slots.sort((a, b) => b.d - a.d || a.id - b.id);
        for (let i = 0; i < grp.slots.length; i++) this.write(grp, i);
        for (const im of grp.meshes) im.instanceMatrix.needsUpdate = true;
      }
    }

    // frees the instance buffers; geometry / materials are shared with the model cache and are left to G.R3.dispose
    // (Map3D.dispose), as for per-object nodes
    dispose() {
      for (const grp of this.groups) {
        for (const im of grp.meshes) im.dispose();
        if (grp.own) { grp.own.geo.dispose(); grp.own.mat.map.dispose(); grp.own.mat.dispose(); }
      }
      this.groups.length = 0; this.entries.length = 0;
    }
  }

  // called from Map3D.syncObjects(initial): builds the batches and puts their proxies into view.nodes
  B.attach = function (view) {
    if (!B.enabled || !window.THREE || !THREE.InstancedMesh) return null;
    const b = new Batch(view);
    try { b.build(); } catch (e) {
      G.warnOnce('batch3d build', e);
      b.dispose(); view.scene.remove(b.group);
      for (const [o, n] of view.nodes) if (n.userData.batched) { view.scene.remove(n); view.nodes.delete(o); }
      return null;
    }
    return b.groups.length ? b : null;
  };
  B.Batch = Batch;
  return B;
})();

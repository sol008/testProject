// Map3D static-object batching: repeated static map objects of the same model variant (trees, bamboo, grasses,
// rocks, stumps, fences …) are drawn as one THREE.InstancedMesh per model mesh per 16×16-tile chunk instead of one
// node (2–4 draw calls) each. Called by Map3D.syncObjects; see docs/qa/sweep3d.md "Batching".
//
// What is batched — everything else keeps its own node, exactly as before:
//   • objects with no `if:` condition, not spirit / illusion, no o.alpha, active when the map is built;
//   • models with no update() hook, or whose def says `batch: true` (update() only ticks a shared clock and applies a
//     one-time pose, given as def.pose(node, o) — nature's per-instance yaw spin()), and not noClone / noBatch;
//   • models made only of plain meshes (no lights, sprites, points, lines, skinned/morph meshes, 2D-art billboards)
//     whose materials' shader patches are all instancing-aware (G.R3M.instSafe: the occluder cutout and G.Wind3D
//     windify; prop shaders that read modelMatrix for a per-object phase are not);
//   • at least 2 such objects of the same model variant in a chunk.
// Each instance matrix is the exact world matrix the per-object mesh had (holder × node(+pose) × mesh chain) and the
// InstancedMesh itself stays at identity, so modelMatrix × instanceMatrix in the wind shader is bit-identical:
// same sway phase, same per-plant colour hash, same cutout, same shadows.
//
// Each batched object keeps an invisible proxy holder in view.nodes (same userData.o / sig / def, precomputed AABB for
// the tall-occluder test, an empty child for update()), so objActive / sig / removal logic still runs on it. When a
// proxy is replaced or removed by syncObjects, hidden, or the object turns dynamic (alpha, spirit, if), its instance
// is removed from the batch and the object gets an ordinary per-object node from then on.
'use strict';
G.Batch3D = (() => {
  // OFF by default until verified on every map; opt in with ?batch
  const B = { enabled: /[?&]batch\b/.test(location.search), CH: 16, MIN: 2 };

  B.staticObj = (o) => !o.if && !o.spirit && !o.illusion && o.alpha == null && !o.noBatch;
  B.staticDef = (d) => !!d && !d.noClone && !d.noBatch && (!d.update || d.batch === true);

  function safeMat(m) {
    const T = THREE;
    if (!m || m.onBeforeRender !== T.Material.prototype.onBeforeRender) return false;
    return m.onBeforeCompile === T.Material.prototype.onBeforeCompile || (G.R3M.instSafe && G.R3M.instSafe.has(m.onBeforeCompile));
  }
  function shown(n, root) { for (let p = n; p && p !== root; p = p.parent) if (!p.visible) return false; return true; }

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
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      if (!mats.every(safeMat)) { ok = false; return; }
      out.push(n);
    });
    return ok && out.length ? out : null;
  }
  const uid = (x) => (x ? x.uuid : '');
  const meshSig = (n) => [n.geometry.uuid, Array.isArray(n.material) ? n.material.map(uid).join(',') : uid(n.material),
    n.castShadow ? 1 : 0, n.receiveShadow ? 1 : 0, n.renderOrder, uid(n.customDepthMaterial), uid(n.customDistanceMaterial),
    n.frustumCulled ? 1 : 0, n.layers.mask].join(':');

  class Batch {
    constructor(view) {
      this.view = view;
      this.group = new THREE.Group();
      this.group.name = 'batch3d';
      this.groups = []; // { t, meshes: [InstancedMesh], entries: [entry], transparent }
      this.entries = []; // { o, proxy, grp, idx, mats: [Matrix4], pos: Vector3 }
      this.stats = { objects: 0, batches: 0, meshes: 0, released: 0 };
    }

    // build from the map's objects: returns the set of objects drawn by this batch
    build() {
      const view = this.view, ms = view.ms, CH = B.CH;
      const cand = new Map(); // model sig @ chunk → [item]
      for (const o of ms.objects) {
        if (!B.staticObj(o) || !ms.objActive(o)) continue;
        const d = G.Models.defs[o.t];
        if (!B.staticDef(d)) continue;
        let holder;
        try { holder = view.objNode(o); } catch (e) { continue; }
        const model = holder.children[0];
        if (!model || model.userData.fallback || !model.userData.modelId) continue;
        holder.updateMatrixWorld(true);
        // AABB for Map3D.tallOccluder, taken before the pose — the per-node path caches it on its first frame,
        // before the first update() spins the model
        const box = new THREE.Box3();
        try { box.setFromObject(holder); } catch (e) { box.makeEmpty(); }
        if (!isFinite(box.max.y)) box.makeEmpty();
        if (d.pose) { try { d.pose(model, o); } catch (e) { continue; } holder.updateMatrixWorld(true); }
        const ps = pieces(holder);
        if (!ps) continue;
        const fp = view.footprint(o);
        const key = o.t + '|' + ps.map(meshSig).join(';') + '@' + Math.floor((o.x + fp[0] / 2) / CH) + ',' + Math.floor((o.y + fp[1] / 2) / CH);
        if (!cand.has(key)) cand.set(key, []);
        cand.get(key).push({ o, holder, box, ps, mats: ps.map((n) => n.matrixWorld.clone()) });
      }
      const done = new Set();
      for (const items of cand.values()) {
        if (items.length < B.MIN) continue;
        const grp = { t: items[0].o.t, meshes: [], entries: [], transparent: false };
        for (let k = 0; k < items[0].ps.length; k++) {
          const src = items[0].ps[k];
          const im = new THREE.InstancedMesh(src.geometry, src.material, items.length);
          im.name = 'batch:' + grp.t;
          im.castShadow = src.castShadow; im.receiveShadow = src.receiveShadow; im.renderOrder = src.renderOrder;
          im.frustumCulled = src.frustumCulled; im.layers.mask = src.layers.mask;
          if (src.customDepthMaterial) im.customDepthMaterial = src.customDepthMaterial;
          if (src.customDistanceMaterial) im.customDistanceMaterial = src.customDistanceMaterial;
          im.userData.batch = true;
          im.matrixAutoUpdate = false; // identity: modelMatrix × instanceMatrix == the per-object modelMatrix
          const mats = Array.isArray(src.material) ? src.material : [src.material];
          if (mats.some((m) => m.transparent)) grp.transparent = true;
          grp.meshes.push(im);
          this.group.add(im);
        }
        items.forEach((it, i) => {
          const proxy = new THREE.Group();
          const stub = new THREE.Object3D(); // node.children[0] for update(): its pose is already baked
          stub.userData.natSpun = true;
          proxy.add(stub);
          proxy.position.copy(it.holder.position); proxy.rotation.copy(it.holder.rotation);
          Object.assign(proxy.userData, it.holder.userData, { box: it.box, batched: true });
          const e = { o: it.o, proxy, grp, idx: i, mats: it.mats, pos: it.holder.position.clone() };
          grp.entries.push(e); this.entries.push(e);
          for (let k = 0; k < grp.meshes.length; k++) grp.meshes[k].setMatrixAt(i, it.mats[k]);
          view.nodes.set(it.o, proxy);
          view.scene.add(proxy);
          done.add(it.o);
        });
        for (const im of grp.meshes) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox(); }
        this.groups.push(grp);
        this.stats.batches++; this.stats.meshes += grp.meshes.length; this.stats.objects += items.length;
      }
      if (this.groups.length) view.scene.add(this.group);
      return done;
    }

    write(grp, i) { const e = grp.entries[i]; e.idx = i; for (let k = 0; k < grp.meshes.length; k++) grp.meshes[k].setMatrixAt(i, e.mats[k]); }
    flush(grp) {
      for (const im of grp.meshes) {
        im.count = grp.entries.length; im.instanceMatrix.needsUpdate = true;
        if (im.count) { im.computeBoundingSphere(); im.computeBoundingBox(); }
        im.visible = im.count > 0;
      }
    }
    // drop an object's instance (swap with the last one)
    remove(e) {
      const grp = e.grp, last = grp.entries.length - 1;
      if (e.idx !== last) { grp.entries[e.idx] = grp.entries[last]; this.write(grp, e.idx); }
      grp.entries.pop();
      this.flush(grp);
      e.grp = null;
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
          n.visible = e.proxy.visible;
          view.nodes.set(e.o, n);
          view.scene.add(n);
        }
      }
      this.sortTransparent();
    }

    // transparent batches (ground decals): draw instances back to front like the per-object sort did. Order along
    // the camera's forward axis is invariant to camera translation, so it is redone only when the view turns.
    sortTransparent() {
      const cam = this.view.camera;
      const f = this._fwd || (this._fwd = new THREE.Vector3());
      cam.getWorldDirection(f);
      const k = f.x.toFixed(3) + ',' + f.y.toFixed(3) + ',' + f.z.toFixed(3);
      if (k === this._sortKey) return;
      this._sortKey = k;
      for (const grp of this.groups) {
        if (!grp.transparent || grp.entries.length < 2) continue;
        grp.entries.sort((a, b) => b.pos.dot(f) - a.pos.dot(f));
        for (let i = 0; i < grp.entries.length; i++) this.write(grp, i);
        for (const im of grp.meshes) im.instanceMatrix.needsUpdate = true;
      }
    }

    // frees the instance buffers; geometry / materials are shared with the model cache and are left to G.R3.dispose
    // (Map3D.dispose), as for per-object nodes
    dispose() {
      for (const grp of this.groups) for (const im of grp.meshes) im.dispose();
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

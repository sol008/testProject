// 3D models for chapter-local object types (G.Objects defined inside js/maps/chN_*.js) that no asset team owned.
// Found by the 3D map sweep (tools/r3d/sweep/sweep.js, docs/qa/sweep3d.md): without these they fell back to 2D
// billboards (and c2_footprint stood upright). Contract: docs/CONTRACTS_3D.md. Origin = footprint centre, y = 0.
'use strict';
(() => {
  const THREE = window.THREE;
  if (!THREE || !G.Models || !G.R3M) return;
  const T = THREE, R = G.R3M, TAU = Math.PI * 2;
  const def = (id, d) => G.Models.define(id, d);
  const mats = new Map();
  const cm = (key, make) => { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); };
  const hash = (x, y, s) => (G.U && G.U.hash ? G.U.hash(x | 0, y | 0, s) : 0.5);

  // ---------------------------------------------------------------- shared painted textures
  const bambooTex = () => R.tex('pc_bamboo', 64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#6a7034'); gr.addColorStop(0.45, '#b4b866'); gr.addColorStop(1, '#5a6028');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) { // nodes
      g.fillStyle = 'rgba(60,64,24,0.85)'; g.fillRect(0, y, w, 5);
      g.fillStyle = 'rgba(230,230,160,0.35)'; g.fillRect(0, y + 5, w, 2);
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,60,30,${0.08 + Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 6 + Math.random() * 18); }
  }, { wrap: true });
  const woodTex = () => R.tex('pc_wood', 64, 256, (g, w, h) => {
    g.fillStyle = '#7a5a34'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(${40 + Math.random() * 30},${26 + Math.random() * 20},12,0.45)`; g.lineWidth = 1 + Math.random() * 2; const x = Math.random() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 4, h * 0.3, x - 4, h * 0.6, x + 2, h); g.stroke(); }
  }, { wrap: true });
  // 藍染 indigo cloth: deep blue with resist-dyed (shibori) white rings and a darker hem
  const indigoTex = (v) => R.tex('pc_indigo' + v, 128, 256, (g, w, h) => {
    const cols = ['#1a2a5a', '#243a78', '#132048'];
    g.fillStyle = cols[v]; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,215,240,0.55)'; g.lineWidth = 2.2;
    for (let y = 30; y < h - 30; y += 44) for (let x = 22 + ((y / 44) % 2) * 32; x < w; x += 64) {
      g.beginPath(); g.arc(x, y, 9 + v * 2, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(200,215,240,0.35)'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(5,10,30,0.5)'; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = 'rgba(160,190,255,0.12)'; g.fillRect(8, 0, 6, h);
  });
  const redClothTex = () => R.tex('pc_redcloth', 64, 128, (g, w, h) => {
    g.fillStyle = '#b03a30'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},20,20,0.25)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    // faded, stained
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,220,200,0.12)'); gr.addColorStop(1, 'rgba(40,10,10,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  const bambooMat = () => cm('bamboo', () => R.env({ map: bambooTex(), roughness: 0.55 }));
  const woodMat = () => cm('wood', () => R.env({ map: woodTex(), roughness: 0.85 }));
  const ropeMat = () => cm('rope', () => R.env({ color: 0x5a3a20, roughness: 1 }));

  // a cylinder from a to b (Vector3s)
  function rod(a, b, r, mat, seg = 7) {
    const d = b.clone().sub(a), len = d.length();
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg, 1), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const V = (x, y, z) => new T.Vector3(x, y, z);
  // hanging cloth: plane whose top edge is the pivot (child mesh named for update())
  function cloth(w, h, mat, segs = 6) {
    const geo = new T.PlaneGeometry(w, h, 2, segs);
    geo.translate(0, -h / 2, 0);
    const m = new T.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  // gentle per-vertex flutter for a cloth plane (cheap: a handful of vertices)
  function flutter(mesh, t, amp, phase) {
    const pos = mesh.geometry.attributes.position;
    const base = mesh.userData.base || (mesh.userData.base = Float32Array.from(pos.array));
    let hgt = 0; for (let i = 1; i < base.length; i += 3) hgt = Math.min(hgt, base[i]);
    for (let i = 0; i < pos.count; i++) {
      const y = base[i * 3 + 1], k = hgt ? y / hgt : 0; // 0 at the top edge → 1 at the hem
      pos.array[i * 3 + 2] = base[i * 3 + 2] + Math.sin(t * 2.1 + phase + k * 2.4) * amp * k * k;
      pos.array[i * 3] = base[i * 3] + Math.sin(t * 1.3 + phase * 1.7 + k) * amp * 0.35 * k;
    }
    pos.needsUpdate = true;
  }

  // ---------------------------------------------------------------- c2_indigo: 染坊 drying pole with indigo cloths (2×1)
  def('c2_indigo', {
    build(o, K) {
      const g = new T.Group();
      const H = 2.05;
      for (const x of [-0.86, 0.86]) {
        g.add(rod(V(x, 0, 0), V(x, H, 0), 0.05, woodMat()));
        g.add(K.cyl(0.12, 0.14, 0.12, cm('stone', () => R.env({ color: 0x77736a, roughness: 0.95 })), x, 0, 0));
      }
      g.add(rod(V(-1.0, H - 0.03, 0), V(1.0, H - 0.03, 0), 0.04, woodMat()));
      for (const x of [-0.86, 0.86]) g.add(rod(V(x - 0.06, H - 0.08, 0), V(x + 0.06, H + 0.0, 0), 0.025, ropeMat(), 5));
      const out = K.merge(g);
      for (let i = 0; i < 3; i++) {
        const c = cloth(0.46, 1.2 + i * 0.08, cm('indigo' + i, () => R.env({ map: indigoTex(i), roughness: 0.92, side: T.DoubleSide })));
        c.position.set(-0.54 + i * 0.54, H - 0.06, 0.02 * (i - 1));
        c.name = 'cloth' + i;
        out.add(c);
      }
      // a drip tray of dye on the ground
      const tub = K.cyl(0.26, 0.22, 0.28, woodMat(), 0.35, 0, 0.36);
      const dye = K.cyl(0.235, 0.235, 0.01, cm('dye', () => R.env({ color: 0x0e1838, roughness: 0.15 })), 0.35, 0.25, 0.36);
      out.add(K.merge(K.group(tub, dye)));
      return out;
    },
    update(node, o, t) {
      for (let i = 0; i < 3; i++) { const c = node.getObjectByName('cloth' + i); if (c) flutter(c, t, 0.08, i * 1.3 + (o.x || 0)); }
    },
  });

  // ---------------------------------------------------------------- c2_cage: 虎姑婆's bamboo cage (1×1, door opens)
  const cageOpen = (o) => (o.flag ? !!(G.state && G.state.flags[o.flag]) : !!o.open);
  def('c2_cage', {
    build(o, K) {
      const g = new T.Group();
      const hw = 0.44, H = 1.34, bm = bambooMat();
      // corner posts + top/bottom frame + roof slats
      for (const [x, z] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) g.add(rod(V(x, 0, z), V(x, H + 0.06, z), 0.035, bm));
      for (const y of [0.05, H]) {
        g.add(rod(V(-hw, y, -hw), V(hw, y, -hw), 0.03, bm)); g.add(rod(V(-hw, y, hw), V(hw, y, hw), 0.03, bm));
        g.add(rod(V(-hw, y, -hw), V(-hw, y, hw), 0.03, bm)); g.add(rod(V(hw, y, -hw), V(hw, y, hw), 0.03, bm));
      }
      for (let i = -3; i <= 3; i++) g.add(rod(V(-hw - 0.04, H + 0.03, i * 0.13), V(hw + 0.04, H + 0.03, i * 0.13), 0.022, bm));
      // bars: back, sides, and the front outside the door
      for (let i = 1; i < 7; i++) {
        const u = -hw + i * (2 * hw / 7);
        g.add(rod(V(u, 0.05, -hw), V(u, H, -hw), 0.017, bm));
        g.add(rod(V(-hw, 0.05, u), V(-hw, H, u), 0.017, bm));
        g.add(rod(V(hw, 0.05, u), V(hw, H, u), 0.017, bm));
        if (i < 2 || i > 4) g.add(rod(V(u, 0.05, hw), V(u, H, hw), 0.017, bm));
      }
      // rattan lashings
      for (const y of [0.12, H * 0.5, H - 0.06]) for (const z of [-hw, hw]) g.add(rod(V(-hw - 0.03, y, z), V(hw + 0.03, y, z), 0.026, ropeMat(), 6));
      const out = K.merge(g);
      // door: three bars on a hinge at the left of the opening (named; update() swings it)
      const door = new T.Group(); door.name = 'door';
      const x0 = -hw + 2 * (2 * hw / 7);
      door.position.set(x0 - 0.06, 0, hw + 0.01);
      const dg = new T.Group();
      for (let i = 0; i < 3; i++) dg.add(rod(V(0.06 + i * (2 * hw / 7), 0.08, 0), V(0.06 + i * (2 * hw / 7), H - 0.04, 0), 0.018, bm));
      dg.add(rod(V(0.03, 0.4, 0), V(0.42, 0.4, 0), 0.02, ropeMat(), 5));
      dg.add(rod(V(0.03, 0.95, 0), V(0.42, 0.95, 0), 0.02, ropeMat(), 5));
      door.add(K.merge(dg));
      out.add(door);
      return out;
    },
    update(node, o, t, dt) {
      const d = node.getObjectByName('door');
      if (!d) return;
      const goal = cageOpen(o) ? -1.9 : 0;
      d.rotation.y += (goal - d.rotation.y) * Math.min(1, (dt || 0.016) * 4);
    },
  });

  // ---------------------------------------------------------------- c2_redcloth: faded red cloth tied round a trunk
  def('c2_redcloth', {
    key: (o) => String(o.lift || 0),
    build(o, K) {
      const out = new T.Group();
      const y = 1.25 + (o.lift || 0) * 0.012;
      const m = cm('redcloth', () => R.env({ map: redClothTex(), roughness: 0.95, side: T.DoubleSide }));
      const band = new T.Mesh(new T.TorusGeometry(0.205, 0.045, 6, 18), m);
      band.rotation.x = Math.PI / 2; band.position.y = y; band.scale.set(1, 1, 1.6);
      band.castShadow = true;
      const knot = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), m);
      knot.position.set(0.12, y, 0.17); knot.castShadow = true;
      out.add(K.merge(K.group(band, knot)));
      for (let k = 0; k < 2; k++) {
        const c = cloth(0.09, 0.42 - k * 0.08, m, 5);
        c.position.set(0.14 + k * 0.04, y - 0.02, 0.18 - k * 0.03);
        c.rotation.y = 0.5 + k * 0.3;
        c.name = 'tail' + k;
        out.add(c);
      }
      return out;
    },
    update(node, o, t) {
      for (let k = 0; k < 2; k++) { const c = node.getObjectByName('tail' + k); if (c) flutter(c, t, 0.07, hash(o.x, o.y, 3) * 6 + k * 1.7); }
    },
  });

  // ---------------------------------------------------------------- c2_tongue: 靈視 — the red cloth as a licking tongue
  const tongueLen = (o) => {
    const st = G.state || { flags: {}, vars: {} };
    return o.maze ? (st.flags.ch2_maze_solved ? 0 : 4 - Math.min(4, st.vars.loopStep || 0)) : (o.len || 3);
  };
  def('c2_tongue', {
    build() {
      const out = new T.Group();
      const core = cm('tongue', () => new T.MeshStandardMaterial({ color: 0x3a0008, emissive: new T.Color('#d0283a'), emissiveIntensity: 1.6, roughness: 0.4 }));
      const hot = cm('tongue_hi', () => new T.MeshStandardMaterial({ color: 0x400010, emissive: new T.Color('#ff7a8a'), emissiveIntensity: 2.2, roughness: 0.3 }));
      const geo = new T.SphereGeometry(1, 10, 8);
      for (let i = 0; i <= 16; i++) {
        const s = new T.Mesh(geo, i % 4 === 0 ? hot : core);
        s.name = 'seg' + i; s.castShadow = false; s.scale.setScalar(0.01);
        out.add(s);
      }
      for (let k = 0; k < 2; k++) { const f = new T.Mesh(new T.ConeGeometry(0.035, 0.2, 6), core); f.name = 'fork' + k; out.add(f); }
      return out;
    },
    update(node, o, t) {
      const len = tongueLen(o), n = len * 4;
      // 2D: from (px+40, py-34), each step +11 px right and +9 px down → 3D: east and down from the cloth knot
      let last = null;
      for (let i = 0; i <= 16; i++) {
        const s = node.getObjectByName('seg' + i);
        if (!s) continue;
        s.visible = len > 0 && i <= n;
        if (!s.visible) continue;
        const k = i / 4;
        const x = 0.12 + k * 0.17 + Math.sin(t * 3 + k) * 0.06, y = 1.55 - k * 0.2 + Math.sin(t * 4.2 + k * 1.3) * 0.08, z = 0.2 + k * 0.08;
        const r = 0.075 * (1 - 0.5 * (i / Math.max(1, n)));
        s.position.set(x, y, z); s.scale.setScalar(r);
        last = s.position;
      }
      const fl = Math.sin(t * 9) * 0.3;
      for (let k = 0; k < 2; k++) {
        const f = node.getObjectByName('fork' + k);
        if (!f) continue;
        f.visible = !!last && len > 0;
        if (!f.visible) continue;
        f.position.copy(last).add(V(0.08, -0.04 - k * 0.06, 0.02));
        f.rotation.set(0, 0, -Math.PI / 2 - 0.4 + k * 0.8 + fl * (k ? -1 : 1));
      }
    },
    lights: (o) => (tongueLen(o) > 0 ? [{ x: 0.6, y: 1.3, z: 0.3, color: '#ff4060', intensity: 0.9, distance: 3.2, flicker: 0.4 }] : []),
  });

  // ---------------------------------------------------------------- c2_wisp: pale-blue will-o'-wisp (鬼火)
  const glowTex = () => R.glowTex();
  def('c2_wisp', {
    build() {
      const out = new T.Group();
      const b = new T.Group(); b.name = 'bob';
      const core = new T.Mesh(new T.SphereGeometry(0.1, 14, 10), cm('wisp', () => new T.MeshBasicMaterial({ color: new T.Color(2.2, 2.9, 3.4), toneMapped: false })));
      const flame = new T.Mesh(new T.ConeGeometry(0.075, 0.32, 10, 1, true), cm('wisp_f', () => new T.MeshBasicMaterial({ color: new T.Color(1.2, 2.0, 2.8), transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false })));
      flame.position.y = 0.17; flame.name = 'flame';
      const halo = new T.Sprite(cm('wisp_h', () => new T.SpriteMaterial({ map: glowTex(), color: 0x7ac8ff, blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false })));
      halo.scale.set(1.0, 1.0, 1);
      b.add(core, flame, halo);
      b.position.y = 1.45;
      out.add(b);
      return out;
    },
    update(node, o, t) {
      const b = node.getObjectByName('bob');
      if (!b) return;
      const s = (o.seed || 0) * 1.7;
      b.position.set(Math.sin(t * 1.3 + s) * 0.12, 1.45 + Math.sin(t * 2.1 + s) * 0.11, 0);
      const f = b.getObjectByName('flame');
      if (f) { f.scale.y = 1 + Math.sin(t * 6 + s) * 0.25; f.rotation.z = Math.sin(t * 6 + s) * 0.2; }
    },
    lights: () => [{ x: 0, y: 1.45, z: 0, color: '#8ad0ff', intensity: 0.8, distance: 3.2, flicker: 0.3 }],
  });

  // ---------------------------------------------------------------- c2_footprint: flat prints (painted from the 2D art)
  // silver child prints (maze, 靈視; pulse in sequence) / tiger paws in the mud / a lost embroidered shoe
  function printCanvas(o) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.scale(2, 2);
    try { G.Objects.get('c2_footprint').draw(g, 0, 0, { dir: o.dir, kind: o.kind, seq: 0, x: 0, y: 0, fade: 1 }, Math.PI / 2 / 2.4); } catch (e) { G.warnOnce('c2_footprint paint', e); }
    return c;
  }
  def('c2_footprint', {
    key: (o) => (o.kind || 'child') + ':' + (o.dir || 'right'),
    build(o) {
      const tex = R.canvasTex(printCanvas(o));
      const glow = !o.kind;
      const m = glow
        // fog: false — spirit light, it must not sink into the maze's dense mist fog
        ? new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false, color: new T.Color(1.6, 1.7, 1.9), polygonOffset: true, polygonOffsetFactor: -2 })
        : new T.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: o.kind === 'shoe' ? 0.8 : 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
      // the 2D art is centred at (32, 34) of the 64-px cell
      const geo = new T.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      const p = new T.Mesh(geo, m);
      p.position.set(0, 0.025, 0.03);
      p.renderOrder = 3; p.receiveShadow = true; p.castShadow = false;
      p.name = 'print';
      const out = new T.Group();
      out.add(p);
      if (o.kind === 'shoe') { // the shoe itself has some volume
        const s = new T.Mesh(new T.SphereGeometry(0.1, 10, 6), cm('shoe', () => R.env({ color: 0x5a3a5a, roughness: 0.8 })));
        s.scale.set(1.15, 0.38, 0.5); s.position.set(0, 0.035, 0.03); s.rotation.y = -0.6; s.castShadow = true;
        out.add(s);
      }
      return out;
    },
    // the spirit pulse is applied here, not by MapView's generic spirit fade: that pass clones the material once and
    // then scales the opacity it found on that frame, which froze each print at a random point of its pulse (often
    // ~0.2 — the "sometimes the footprints don't show" bug in 3D)
    ownFade: true,
    update(node, o, t) {
      const p = node.getObjectByName('print');
      if (!p) return;
      const hold = node.parent && node.parent.userData.fade != null ? node.parent.userData.fade : 1;
      if (o.kind && hold >= 0.999 && !p.userData.own) return;   // mud prints: shared material, no fade
      if (!p.userData.own) { p.material = p.material.clone(); p.userData.own = true; } // per-instance pulse
      if (o.kind) { p.material.opacity = Math.min(1, hold); return; }
      const ph = (o.seq || 0) * 0.6;
      // never dimmer than ~0.7: the prints are the way out of the maze and must read through the fog at any moment
      p.material.opacity = Math.min(1, (0.8 + 0.2 * Math.sin(t * 2.4 - ph)) * (o.fade == null ? 1 : o.fade) * Math.max(0.85, hold));
      const halo = node.getObjectByName('halo');
      if (halo) halo.material.opacity = p.material.opacity * 0.55;
    },
    lights: () => [], // the print glows by itself; a pool light + halo per print read as floating blobs on maze paths
  });

  // ---------------------------------------------------------------- c4_saisiyat_house: 賽夏族 thatched house (4×3)
  // Bamboo/plank walls, thatched gable, door in column 1: arch_coast's Amis long-house builder fits that build closely.
  def('c4_saisiyat_house', {
    variants: 3,
    build(o, K) {
      const amis = G.Models.defs.c10_amis_house;
      if (!amis) return null;
      return amis.build(Object.assign({}, o, { w: 4, door: 1, big: false }), K);
    },
    lights: () => [{ x: -2 + 1 + 0.5, y: 0.9, z: 0.4, color: '#ffae5a', intensity: 1, distance: 4.5, flicker: 0.3 }],
  });
})();

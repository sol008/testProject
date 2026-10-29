'use strict';
// The repair shop the stars rebuild: a 3D clay diorama (G.Shop3D) and its 2D picture fallback (G.Shop2D).
// Both read the same restoration `look` keys from the save, so they always show the same state.
(function () {
  const G = window.G;
  const R = G.Render;
  const looks = () => {
    const out = {};
    for (const id of (G.state ? G.state.restored : [])) { const t = G.Progress.task(id); if (t) out[t.look] = true; }
    return out;
  };
  G.shopLooks = looks;
  const TOYS = ['pip', 'biscuit', 'puff', 'dottie', 'gallop'];

  // ======================= 3D =======================
  const S3 = (G.Shop3D = G.Shop3D || {});
  S3.built = false;
  S3.pops = {};

  function mat(col, o) {
    return new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.82, metalness: 0.0 }, o || {}));
  }
  function rbox(w, h, d, r, col, o) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    r = Math.max(0.005, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    const bev = Math.min(r, d / 2) * 0.8;
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.6, bevelSegments: G.R3.lite ? 1 : 3, curveSegments: G.R3.lite ? 2 : 5 });
    g.translate(0, 0, -(d - bev * 2) / 2);
    const m = new THREE.Mesh(g, mat(col, o));
    m.castShadow = m.receiveShadow = !G.R3.lite;
    return m;
  }
  function sphere(r, col, o) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, G.R3.lite ? 10 : 20, G.R3.lite ? 8 : 14), mat(col, o)); m.castShadow = !G.R3.lite; return m; }
  function cyl(rt, rb, h, col, o) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, G.R3.lite ? 10 : 20), mat(col, o)); m.castShadow = !G.R3.lite; return m; }
  function at(m, x, y, z, ry) { m.position.set(x, y, z); if (ry) m.rotation.y = ry; return m; }
  function group(...kids) { const g = new THREE.Group(); kids.forEach((k) => g.add(k)); return g; }
  function textTex(str, w, h, bg, fg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = '900 ' + Math.round(h * 0.5) + 'px ' + G.CONFIG.font.stack;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(str, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  function buildToy(id) {
    if (id === 'pip') {
      const body = sphere(0.32, 0xf6d55c); body.scale.set(1.2, 0.9, 1);
      const head = at(sphere(0.2, 0xf6d55c), 0.28, 0.32, 0);
      const beak = at(cyl(0.0, 0.08, 0.18, 0xf4a259), 0.48, 0.3, 0); beak.rotation.z = -Math.PI / 2;
      const key = at(cyl(0.03, 0.03, 0.3, 0xb0b8c0), -0.4, 0.15, 0); key.rotation.z = Math.PI / 2;
      return group(body, head, beak, key);
    }
    if (id === 'biscuit') {
      const body = at(sphere(0.32, 0xb98a6a), 0, 0, 0);
      const head = at(sphere(0.24, 0xb98a6a), 0, 0.42, 0);
      const e1 = at(sphere(0.09, 0xa07050), -0.18, 0.6, 0), e2 = at(sphere(0.09, 0xa07050), 0.18, 0.6, 0);
      const patch = at(rbox(0.16, 0.16, 0.04, 0.03, 0x7cc6a4), 0.1, 0.05, 0.3);
      return group(body, head, e1, e2, patch);
    }
    if (id === 'puff') {
      const boiler = at(cyl(0.2, 0.2, 0.7, 0xef6f6c), 0.1, 0.05, 0); boiler.rotation.z = Math.PI / 2;
      const cab = at(rbox(0.36, 0.42, 0.42, 0.06, 0x6fa8dc), -0.36, 0.12, 0);
      const stack = at(cyl(0.07, 0.1, 0.24, 0x4a3428), 0.32, 0.32, 0);
      const wheels = [-0.36, 0, 0.3].map((x) => { const w = at(cyl(0.11, 0.11, 0.5, 0x4a3428), x, -0.16, 0); w.rotation.x = Math.PI / 2; return w; });
      return group(boiler, cab, stack, ...wheels);
    }
    if (id === 'dottie') {
      const dress = at(cyl(0.08, 0.3, 0.5, 0xa98bd6), 0, 0, 0);
      const head = at(sphere(0.18, 0xf5d0b0), 0, 0.38, 0);
      const hair = at(sphere(0.19, 0xc0603a), 0, 0.43, -0.04); hair.scale.set(1, 0.8, 1);
      return group(dress, head, hair);
    }
    if (id === 'gallop') {
      const body = at(rbox(0.7, 0.3, 0.26, 0.12, 0xefe3c8), 0, 0.2, 0);
      const head = at(rbox(0.22, 0.38, 0.22, 0.08, 0xefe3c8), 0.36, 0.42, 0); head.rotation.z = -0.4;
      const mane = at(rbox(0.08, 0.32, 0.24, 0.04, 0xef6f6c), 0.26, 0.48, 0); mane.rotation.z = -0.4;
      const rocker = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 24, Math.PI * 0.55), mat(0xc8945e));
      rocker.rotation.z = Math.PI * 1.225; rocker.position.set(0, 0.5, 0);
      const legs = [-0.25, 0.25].map((x) => at(cyl(0.04, 0.04, 0.26, 0xc8945e), x, -0.02, 0));
      return group(body, head, mane, rocker, ...legs);
    }
    return group(sphere(0.2, 0xcccccc));
  }
  function buildBolt() {
    const v = G.Clay.BOLT_VARIANTS[G.Clay.boltVariant()] || G.Clay.BOLT_VARIANTS[0];
    const col = new THREE.Color(v.body);
    const body = at(rbox(0.5, 0.36, 0.4, 0.14, col), 0, 0.3, 0);
    const head = at(rbox(0.6, 0.44, 0.46, 0.18, col), 0, 0.72, 0);
    const face = at(rbox(0.42, 0.26, 0.04, 0.08, new THREE.Color(v.face)), 0, 0.73, 0.24);
    const eyeM = mat(new THREE.Color(v.eye));
    const e1 = at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), eyeM), -0.09, 0.75, 0.27);
    const e2 = at(new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), eyeM), 0.09, 0.75, 0.27);
    const ant = at(cyl(0.015, 0.015, 0.16, 0x7a5c4a), 0, 1.0, 0);
    const bulb = at(sphere(0.06, new THREE.Color(v.ant), { emissive: new THREE.Color(v.ant), emissiveIntensity: 0.6 }), 0, 1.1, 0);
    const legC = new THREE.Color(v.body).multiplyScalar(0.7);
    const l1 = at(cyl(0.06, 0.06, 0.16, legC), -0.12, 0.06, 0);
    const l2 = at(cyl(0.06, 0.06, 0.16, legC), 0.12, 0.06, 0);
    const g = group(body, head, face, e1, e2, ant, bulb, l1, l2);
    g.userData.variant = G.Clay.boltVariant();
    return g;
  }

  S3.ensure = function () {
    if (S3.built || !G.R3.ok) return;
    try { S3.build(); } catch (e) { G.warnOnce('shop3d build', e); G.lastError = e; G.R3.ok = false; }
  };
  S3.build = function () {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6e7d4);
    const cam = new THREE.PerspectiveCamera(40, G.W / G.H, 0.1, 120);
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0xb08a6a, 0.8);
    const sun = new THREE.DirectionalLight(0xfff0d8, 0.65);
    sun.position.set(4, 9, 6);
    sun.castShadow = !G.R3.lite;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 });
    scene.add(hemi, sun);
    const root = new THREE.Group();
    scene.add(root);
    const parts = {};
    const floor = at(rbox(9, 7, 0.3, 0.1, 0xd9b48c), 0, -0.15, 0); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    const back = at(rbox(9, 4.2, 0.3, 0.1, 0xf3d9bf), 0, 2.0, -3.5);
    const left = at(rbox(7, 4.2, 0.3, 0.1, 0xeacaa9), -4.5, 2.0, 0); left.rotation.y = Math.PI / 2;
    const skirt = at(rbox(9, 0.4, 0.34, 0.08, 0xb98a6a), 0, 0.2, -3.35);
    root.add(floor, back, left, skirt);
    for (let i = -4; i <= 4; i++) root.add(at(rbox(0.04, 0.02, 7, 0.009, 0xc8a07a), i, 0.01, 0));
    parts.dust = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.3 + (i % 3) * 0.15, 12), mat(0x9e9086, { transparent: true, opacity: 0.55 }));
      d.rotation.x = -Math.PI / 2; d.position.set(-3.5 + ((i * 2.3) % 7.5), 0.03, -2.5 + ((i * 1.7) % 5.5));
      parts.dust.add(d);
    }
    root.add(parts.dust);
    const frame = at(rbox(2.8, 2.0, 0.24, 0.1, 0xb98a6a), 1.9, 2.3, -3.3);
    parts.paneDirty = at(rbox(2.5, 1.7, 0.08, 0.06, 0x8f8270), 1.9, 2.3, -3.15);
    parts.paneClean = at(rbox(2.5, 1.7, 0.08, 0.06, 0xbfe6f5, { emissive: 0x9fd3ef, emissiveIntensity: 0.35 }), 1.9, 2.3, -3.15);
    const bar1 = at(rbox(0.08, 1.7, 0.1, 0.03, 0xb98a6a), 1.9, 2.3, -3.08), bar2 = at(rbox(2.5, 0.08, 0.1, 0.03, 0xb98a6a), 1.9, 2.3, -3.08);
    parts.sunbeam = at(new THREE.SpotLight(0xfff2cc, 0.0, 12, 0.6, 0.6), 1.9, 3.2, -2.8);
    parts.sunbeam.target.position.set(1.2, 0, 1);
    root.add(frame, parts.paneDirty, parts.paneClean, bar1, bar2, parts.sunbeam, parts.sunbeam.target);
    const brokenTop = at(rbox(2.8, 0.14, 1.2, 0.06, 0xa77748), 0.2, 1.05, 0.1); brokenTop.rotation.z = 0.25;
    parts.counterBroken = group(at(rbox(2.6, 1.0, 1.0, 0.12, 0xc8945e), 0, 0.5, 0), brokenTop);
    parts.counterBroken.position.set(-1.6, 0, 1.0);
    const jars = [];
    for (let i = 0; i < 3; i++) {
      jars.push(at(cyl(0.22, 0.22, 0.44, 0xffffff, { transparent: true, opacity: 0.45, roughness: 0.2 }), -0.8 + i * 0.8, 1.38, 0));
      jars.push(at(cyl(0.18, 0.18, 0.28, [0xef6f6c, 0xf6d55c, 0x7cc6a4][i]), -0.8 + i * 0.8, 1.3, 0));
    }
    parts.counter = group(at(rbox(2.6, 1.0, 1.0, 0.12, 0xe7a96f), 0, 0.5, 0), at(rbox(2.8, 0.14, 1.2, 0.06, 0xa77748), 0, 1.07, 0), ...jars);
    parts.counter.position.set(-1.6, 0, 1.0);
    root.add(parts.counterBroken, parts.counter);
    const fallen = at(rbox(1.8, 0.1, 0.8, 0.04, 0xc8945e), 0.9, 0.08, 0.6); fallen.rotation.y = 0.5;
    parts.shelvesBroken = group(at(rbox(0.14, 2.6, 0.9, 0.05, 0xa77748), 0, 1.3, 0), fallen);
    parts.shelvesBroken.position.set(-4.2, 0, -1.6);
    const boxes = [];
    [[0.6, 0xef6f6c], [1.4, 0x6fa8dc], [2.2, 0xf6d55c]].forEach(([y, c], k) => {
      boxes.push(at(rbox(0.9, 0.08, 1.8, 0.03, 0xc8945e), 0.45, y, 0));
      boxes.push(at(rbox(0.5, 0.42, 0.42, 0.08, c), 0.45, y + 0.26, -0.4 + k * 0.3));
      boxes.push(at(sphere(0.18, [0xa98bd6, 0x7cc6a4, 0xf4a259][k]), 0.45, y + 0.2, 0.5));
    });
    parts.shelves = group(at(rbox(0.14, 2.6, 1.9, 0.05, 0xa77748), 0, 1.3, 0), ...boxes);
    parts.shelves.position.set(-4.2, 0, -1.4);
    root.add(parts.shelvesBroken, parts.shelves);
    parts.lampBulbs = [];
    parts.lampLights = [];
    for (const x of [-1.5, 1.5]) {
      const cord = at(cyl(0.02, 0.02, 1.2, 0x4a3428), x, 3.7, -0.5);
      const shade = at(cyl(0.18, 0.42, 0.34, 0xf4a259), x, 3.0, -0.5);
      const bulb = at(sphere(0.14, 0x777066, { emissive: 0xffd27a, emissiveIntensity: 0 }), x, 2.8, -0.5);
      const light = at(new THREE.PointLight(0xffcf8a, 0, 7, 1.6), x, 2.6, -0.5);
      parts.lampBulbs.push(bulb); parts.lampLights.push(light);
      root.add(cord, shade, bulb, light);
    }
    const signFace = new THREE.MeshStandardMaterial({ map: textTex("TINKER'S", 512, 128, '#7cc6a4', '#fff8ee'), roughness: 0.8 });
    const edge = mat(0x5fae94);
    const signGeo = new THREE.BoxGeometry(2.6, 0.65, 0.12);
    parts.signDown = group(new THREE.Mesh(signGeo, [edge, edge, edge, edge, signFace, edge]));
    parts.signDown.position.set(2.4, 0.4, -2.6); parts.signDown.rotation.set(-0.35, -0.2, 0.15);
    parts.signUp = group(new THREE.Mesh(signGeo, [edge, edge, edge, edge, signFace, edge]));
    parts.signUp.position.set(1.9, 3.75, -3.2);
    root.add(parts.signDown, parts.signUp);
    const bench = group(at(rbox(2.8, 0.16, 1.3, 0.06, 0xa77748), 0, 0.95, 0), at(rbox(0.16, 0.9, 1.1, 0.05, 0x8a5f3a), -1.2, 0.45, 0), at(rbox(0.16, 0.9, 1.1, 0.05, 0x8a5f3a), 1.2, 0.45, 0));
    bench.position.set(2.2, 0, 1.4);
    root.add(bench);
    parts.toys = {};
    const homes = [[-2.9, 0, 2.4], [-0.4, 0, 2.7], [0.8, 0, -1.7], [-1.6, 1.15, 1.0], [3.4, 0, -1.4]];
    TOYS.forEach((id, k) => {
      const broken = buildToy(id);
      broken.traverse((m) => { if (m.material) { m.material = m.material.clone(); m.material.color.lerp(new THREE.Color(0x9a9088), 0.65); } });
      broken.position.set(1.1 + k * 0.55, 1.2, 1.4 + (k % 2) * 0.25);
      broken.rotation.set(0.3, k, Math.PI / 2.4);
      broken.scale.setScalar(0.7);
      const fixed = buildToy(id);
      fixed.position.set(...homes[k]);
      fixed.position.y += id === 'gallop' ? 0.12 : 0.3;
      fixed.userData.home = fixed.position.clone();
      parts.toys[id] = { broken, fixed };
      root.add(broken, fixed);
    });
    parts.bunting = new THREE.Group();
    const cols = [0xef6f6c, 0xf6d55c, 0x7cc6a4, 0x6fa8dc, 0xa98bd6];
    for (let i = 0; i < 16; i++) {
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.32, 3), mat(cols[i % cols.length]));
      tri.position.set(-4 + i * 0.53, 3.6 - Math.sin((i / 15) * Math.PI) * 0.5, -1.0);
      tri.rotation.x = Math.PI;
      parts.bunting.add(tri);
    }
    root.add(parts.bunting);
    parts.bolt = buildBolt();
    parts.bolt.position.set(0.2, 0.02, 1.5);
    root.add(parts.bolt);
    S3.scene = scene; S3.cam = cam; S3.parts = parts; S3.t = 0;
    S3.built = true;
    S3.apply();
  };

  S3.apply = function () {
    if (!S3.built) return;
    const L = looks(), p = S3.parts;
    p.dust.visible = !L.floor;
    p.counterBroken.visible = !L.counter; p.counter.visible = !!L.counter;
    p.paneDirty.visible = !L.window; p.paneClean.visible = !!L.window; p.sunbeam.intensity = L.window ? 0.9 : 0;
    p.shelvesBroken.visible = !L.shelves; p.shelves.visible = !!L.shelves;
    p.lampBulbs.forEach((b) => { b.material.emissiveIntensity = L.lamps ? 1.2 : 0; b.material.color.set(L.lamps ? 0xfff0c0 : 0x777066); });
    p.lampLights.forEach((l) => { l.intensity = L.lamps ? 0.9 : 0; });
    p.signDown.visible = !L.sign; p.signUp.visible = !!L.sign;
    for (const id of TOYS) { p.toys[id].broken.visible = !L[id]; p.toys[id].fixed.visible = !!L[id]; }
    p.bunting.visible = !!L.parade;
    if (p.bolt.userData.variant !== G.Clay.boltVariant()) {
      const pos = p.bolt.position.clone(), parent = p.bolt.parent;
      parent.remove(p.bolt); p.bolt = buildBolt(); p.bolt.position.copy(pos); parent.add(p.bolt);
    }
  };
  S3.pop = function (look) {
    S3.apply();
    if (!S3.built) return;
    const p = S3.parts;
    const target = { counter: p.counter, window: p.paneClean, shelves: p.shelves, sign: p.signUp, parade: p.bunting }[look] || (p.toys[look] && p.toys[look].fixed);
    if (target) S3.pops[look] = { obj: target, t: 0 };
  };
  // Frame the 10-unit-wide room in the top part of the screen, whatever the aspect ratio.
  S3.frame = function () {
    const cam = S3.cam, R_ = G.Render;
    const aspect = G.R3.aspect || G.W / G.H;
    const hfov = 2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * aspect);
    const d = 5.6 / Math.tan(hfov / 2);
    const dir = new THREE.Vector3(0, 0.78, 1).normalize();
    const target = new THREE.Vector3(0, 0.9, -0.3);
    cam.position.copy(target).addScaledVector(dir, d);
    cam.lookAt(target);
    // shift the image so the room's centre sits at logical y ≈ 320 (of the 540×960 layout)
    const hPx = (G.H + 2 * (R_.padY || 0));
    const centreY = (R_.padY || 0) + 318;
    cam.setViewOffset(1000, 1000 * hPx / G.W, 0, (hPx / 2 - centreY) * (1000 / G.W), 1000, 1000 * hPx / G.W);
    cam.updateProjectionMatrix();
  };
  S3.update = function (dt) {
    S3.t += dt;
    if (S3.aspect !== G.R3.aspect || S3.pad !== G.Render.padY) { S3.aspect = G.R3.aspect; S3.pad = G.Render.padY; S3.frame(); }
    const p = S3.parts, t = S3.t, L = looks();
    p.bolt.position.y = 0.02 + Math.abs(Math.sin(t * 3)) * 0.05;
    p.bolt.rotation.y = -0.3 + Math.sin(t * 0.7) * 0.25;
    TOYS.forEach((id, k) => {
      const f = p.toys[id].fixed;
      if (!f.visible) return;
      const h = f.userData.home;
      if (L.parade) {
        const a = t * 0.35 + k * (Math.PI * 2 / TOYS.length);
        f.position.set(Math.cos(a) * 2.4, id === 'gallop' ? 0.12 : 0.3, 0.4 + Math.sin(a) * 1.5);
        f.rotation.y = -a;
      } else {
        f.position.copy(h);
        if (id === 'gallop') f.rotation.z = Math.sin(t * 2) * 0.15;
        else if (id === 'pip') f.rotation.y = Math.sin(t * 1.5) * 0.6;
        else f.position.y = h.y + Math.abs(Math.sin(t * 2 + k)) * 0.05;
      }
    });
    for (const k of Object.keys(S3.pops)) {
      const pp = S3.pops[k];
      pp.t += dt;
      pp.obj.scale.setScalar(Math.max(0.01, pp.t < 0.6 ? G.U.ease.outElastic(Math.min(1, pp.t / 0.6)) : 1));
      if (pp.t >= 0.6) { pp.obj.scale.setScalar(1); delete S3.pops[k]; }
    }
  };
  S3.view = function () {
    S3.ensure();
    if (!S3.built) return null;
    return { scene: S3.scene, camera: S3.cam, update: S3.update };
  };

  // ======================= 2D fallback =======================
  const S2 = (G.Shop2D = G.Shop2D || {});
  S2.pops = {};
  S2.pop = function (look) { S2.pops[look] = 0; };
  S2.draw = function (ctx, x, y, w, h, t, dt) {
    const L = looks();
    for (const k of Object.keys(S2.pops)) { S2.pops[k] += dt || 0; if (S2.pops[k] > 0.7) delete S2.pops[k]; }
    const sc = (k) => (S2.pops[k] != null ? G.U.ease.outElastic(Math.min(1, S2.pops[k] / 0.6)) : 1);
    const scaleAt = (k, cx, cy) => { const s = sc(k); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); };
    ctx.save();
    ctx.beginPath(); R.rr(ctx, x, y, w, h, 26); ctx.clip();
    const u = w / 9;
    ctx.fillStyle = '#f3d9bf'; ctx.fillRect(x, y, w, h * 0.62);
    ctx.fillStyle = '#d9b48c'; ctx.fillRect(x, y + h * 0.62, w, h * 0.38);
    ctx.fillStyle = '#c8a07a';
    for (let i = 1; i < 9; i++) ctx.fillRect(x + i * u, y + h * 0.62, 2, h * 0.38);
    ctx.fillStyle = '#b98a6a'; ctx.fillRect(x, y + h * 0.6, w, h * 0.03);
    const floorY = y + h * 0.62;
    const wx = x + w * 0.52, wy = y + h * 0.14, ww = w * 0.34, wh = h * 0.32;
    ctx.fillStyle = '#b98a6a'; R.rr(ctx, wx - 8, wy - 8, ww + 16, wh + 16, 10); ctx.fill();
    ctx.save(); if (L.window) scaleAt('window', wx + ww / 2, wy + wh / 2);
    ctx.fillStyle = L.window ? '#bfe6f5' : '#8f8270'; R.rr(ctx, wx, wy, ww, wh, 8); ctx.fill();
    ctx.restore();
    if (L.window) { ctx.fillStyle = 'rgba(255,242,204,0.35)'; ctx.beginPath(); ctx.moveTo(wx, wy + wh); ctx.lineTo(wx + ww, wy + wh); ctx.lineTo(wx + ww * 0.9, floorY + h * 0.3); ctx.lineTo(wx - ww * 0.5, floorY + h * 0.3); ctx.fill(); }
    ctx.fillStyle = '#b98a6a'; ctx.fillRect(wx + ww / 2 - 3, wy, 6, wh); ctx.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    ctx.save();
    if (L.sign) { scaleAt('sign', wx + ww / 2, y + h * 0.06); R.panel(ctx, wx, y + h * 0.02, ww, h * 0.08, { fill: '#7cc6a4', r: 10, lift: 3 }); R.text(ctx, "TINKER'S", wx + ww / 2, y + h * 0.062, { size: h * 0.05, color: '#fff8ee', weight: 900 }); }
    else { ctx.translate(wx + ww * 0.7, floorY + h * 0.05); ctx.rotate(0.2); R.panel(ctx, -ww * 0.4, -h * 0.04, ww * 0.8, h * 0.07, { fill: '#5fae94', r: 8, lift: 2 }); }
    ctx.restore();
    for (const lx of [x + w * 0.3, x + w * 0.72]) {
      ctx.strokeStyle = '#4a3428'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + h * 0.1); ctx.stroke();
      if (L.lamps) { const g = ctx.createRadialGradient(lx, y + h * 0.14, 2, lx, y + h * 0.14, h * 0.3); g.addColorStop(0, 'rgba(255,215,140,0.6)'); g.addColorStop(1, 'rgba(255,215,140,0)'); ctx.fillStyle = g; ctx.fillRect(lx - h * 0.3, y, h * 0.6, h * 0.5); }
      ctx.fillStyle = '#f4a259'; ctx.beginPath(); ctx.moveTo(lx - 10, y + h * 0.1); ctx.lineTo(lx + 10, y + h * 0.1); ctx.lineTo(lx + 22, y + h * 0.15); ctx.lineTo(lx - 22, y + h * 0.15); ctx.fill();
      ctx.fillStyle = L.lamps ? '#fff0c0' : '#777066'; ctx.beginPath(); ctx.arc(lx, y + h * 0.16, 7, 0, 7); ctx.fill();
    }
    const shx = x + w * 0.04;
    ctx.fillStyle = '#a77748'; ctx.fillRect(shx, y + h * 0.15, 8, h * 0.47);
    ctx.save();
    if (L.shelves) {
      scaleAt('shelves', shx + w * 0.13, y + h * 0.4);
      [0.27, 0.4, 0.53].forEach((f, k) => {
        ctx.fillStyle = '#c8945e'; ctx.fillRect(shx, y + h * f, w * 0.26, 6);
        ['#ef6f6c', '#6fa8dc', '#f6d55c'].forEach((c, j) => { ctx.fillStyle = c; R.rr(ctx, shx + 14 + j * 34 + k * 6, y + h * f - 24, 26, 24, 6); ctx.fill(); });
      });
    } else { ctx.translate(shx + w * 0.12, floorY + h * 0.06); ctx.rotate(0.35); ctx.fillStyle = '#c8945e'; ctx.fillRect(-w * 0.12, -3, w * 0.24, 6); }
    ctx.restore();
    const cx = x + w * 0.08, cy = floorY + h * 0.12;
    ctx.save();
    if (L.counter) {
      scaleAt('counter', cx + w * 0.17, cy + h * 0.12);
      R.panel(ctx, cx, cy, w * 0.34, h * 0.22, { fill: '#e7a96f', r: 10 });
      R.panel(ctx, cx - 6, cy - 8, w * 0.34 + 12, 14, { fill: '#a77748', r: 6, lift: 2 });
      ['#ef6f6c', '#f6d55c', '#7cc6a4'].forEach((c, k) => { ctx.fillStyle = 'rgba(255,255,255,0.6)'; R.rr(ctx, cx + 14 + k * w * 0.1, cy - 40, 30, 34, 8); ctx.fill(); ctx.fillStyle = c; R.rr(ctx, cx + 18 + k * w * 0.1, cy - 26, 22, 18, 6); ctx.fill(); });
    } else {
      R.panel(ctx, cx, cy, w * 0.34, h * 0.22, { fill: '#c8945e', r: 10 });
      ctx.translate(cx + w * 0.17, cy - 4); ctx.rotate(0.22); ctx.fillStyle = '#a77748'; ctx.fillRect(-w * 0.18, -6, w * 0.36, 12);
    }
    ctx.restore();
    const bx = x + w * 0.6, by = floorY + h * 0.14;
    ctx.fillStyle = '#8a5f3a'; ctx.fillRect(bx + 6, by, 10, h * 0.2); ctx.fillRect(bx + w * 0.34, by, 10, h * 0.2);
    R.panel(ctx, bx, by - 8, w * 0.37, 14, { fill: '#a77748', r: 6, lift: 2 });
    TOYS.forEach((id, k) => {
      const fixed = !!L[id];
      let tx = fixed ? x + w * (0.12 + k * 0.17) : bx + 22 + k * w * 0.065;
      const ty = fixed ? (L.parade ? floorY + h * 0.3 + Math.sin(t * 2 + k) * 4 : floorY + h * 0.07) : by - 18;
      if (L.parade && fixed) tx = x + ((tx - x + t * 30) % w);
      drawToy2D(ctx, id, tx, ty, h * 0.11 * (fixed ? sc(id) : 0.75), fixed);
    });
    if (L.parade) {
      const cols = ['#ef6f6c', '#f6d55c', '#7cc6a4', '#6fa8dc', '#a98bd6'];
      for (let i = 0; i < 14; i++) { const fx = x + i * w / 13, fy = y + h * 0.24 - Math.sin(i / 13 * Math.PI) * h * 0.08; ctx.fillStyle = cols[i % 5]; ctx.beginPath(); ctx.moveTo(fx - 10, fy); ctx.lineTo(fx + 10, fy); ctx.lineTo(fx, fy + 20); ctx.fill(); }
    }
    if (!L.floor) {
      ctx.fillStyle = 'rgba(150,135,125,0.5)';
      for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.ellipse(x + ((i * 97) % w), floorY + 10 + ((i * 53) % (h * 0.34)), 26, 8, 0, 0, 7); ctx.fill(); }
    }
    G.Clay.bolt(ctx, x + w * 0.47, floorY + h * 0.24, h * 0.22, { t, mood: 'idle' });
    ctx.restore();
  };
  function drawToy2D(ctx, id, x, y, s, fixed) {
    ctx.save();
    if (!fixed) ctx.globalAlpha = 0.85;
    const c = (col) => (fixed ? col : '#a59a90');
    if (id === 'pip') { ctx.fillStyle = c('#f6d55c'); ctx.beginPath(); ctx.ellipse(x, y, s * 0.45, s * 0.32, 0, 0, 7); ctx.arc(x + s * 0.32, y - s * 0.3, s * 0.2, 0, 7); ctx.fill(); ctx.fillStyle = c('#f4a259'); ctx.beginPath(); ctx.moveTo(x + s * 0.5, y - s * 0.32); ctx.lineTo(x + s * 0.72, y - s * 0.26); ctx.lineTo(x + s * 0.5, y - s * 0.2); ctx.fill(); }
    else if (id === 'biscuit') { ctx.fillStyle = c('#b98a6a'); ctx.beginPath(); ctx.arc(x, y, s * 0.36, 0, 7); ctx.arc(x, y - s * 0.5, s * 0.27, 0, 7); ctx.arc(x - s * 0.22, y - s * 0.72, s * 0.1, 0, 7); ctx.arc(x + s * 0.22, y - s * 0.72, s * 0.1, 0, 7); ctx.fill(); }
    else if (id === 'puff') { ctx.fillStyle = c('#ef6f6c'); R.rr(ctx, x - s * 0.3, y - s * 0.3, s * 0.7, s * 0.4, s * 0.15); ctx.fill(); ctx.fillStyle = c('#6fa8dc'); R.rr(ctx, x - s * 0.6, y - s * 0.5, s * 0.34, s * 0.6, s * 0.08); ctx.fill(); ctx.fillStyle = '#4a3428'; for (const dx of [-0.4, 0, 0.3]) { ctx.beginPath(); ctx.arc(x + dx * s, y + s * 0.15, s * 0.12, 0, 7); ctx.fill(); } }
    else if (id === 'dottie') { ctx.fillStyle = c('#a98bd6'); ctx.beginPath(); ctx.moveTo(x - s * 0.35, y + s * 0.2); ctx.lineTo(x + s * 0.35, y + s * 0.2); ctx.lineTo(x + s * 0.1, y - s * 0.3); ctx.lineTo(x - s * 0.1, y - s * 0.3); ctx.fill(); ctx.fillStyle = c('#f5d0b0'); ctx.beginPath(); ctx.arc(x, y - s * 0.48, s * 0.2, 0, 7); ctx.fill(); ctx.fillStyle = c('#c0603a'); ctx.beginPath(); ctx.arc(x, y - s * 0.55, s * 0.2, Math.PI, 0); ctx.fill(); }
    else if (id === 'gallop') { ctx.strokeStyle = c('#c8945e'); ctx.lineWidth = s * 0.08; ctx.beginPath(); ctx.arc(x, y - s * 0.8, s * 0.9, Math.PI * 0.3, Math.PI * 0.7); ctx.stroke(); ctx.fillStyle = c('#efe3c8'); R.rr(ctx, x - s * 0.4, y - s * 0.3, s * 0.8, s * 0.3, s * 0.14); ctx.fill(); R.rr(ctx, x + s * 0.25, y - s * 0.65, s * 0.22, s * 0.42, s * 0.08); ctx.fill(); ctx.fillStyle = c('#ef6f6c'); ctx.fillRect(x + s * 0.2, y - s * 0.62, s * 0.07, s * 0.34); }
    ctx.restore();
  }
})();

// 彼岸燈 — G.Battle3D: real-time 3D presentation of a BattleScene (owner: battle team; contract: docs/CONTRACTS_3D.md).
//
// The 2D BattleScene stays the single source of truth (turn order, damage, statuses, AI, scripts). This view reads it
// every frame and presents it in 3D:
//   • an arena per backdrop id (procedural terrain, sky, fog, lights and set dressing; see the ARENA section below),
//   • units: party via G.Char3D, enemies via G.Mon3D, falling back to billboards whose texture is painted by the
//     scene's OWN drawUnit() — so chapter scripts that override drawUnit (ghost / silhouette enemies …) still apply,
//   • a camera director (establishing shot, over-the-shoulder command camera, tracking melee shots, dramatic spell
//     angles, kill slow-mo, boss intro, victory orbit) that respects battle speed and snaps faster in auto-battle,
//   • VFX through G.VFX3D (hit-stop, shake, flashes), the field→battle shatter and the battle→field ink wash.
// battle.js calls the hooks below only when `this.view3d` is set (2D keeps working when G.R3 is disabled).
//   hooks: playFx(id,u,targets,s) → wait  · onCast(u,s) · onAction(u,s,targets,melee) · onActionEnd(u) · onDamage(tg,dmg,o)
//          onKill(u) · onSummonIntro(u) · onCutin(u,s) · beforeFinish(result) · outro(result) · frame() · drawOverlay(ctx)
'use strict';
G.Battle3D = (() => {
  const TAU = Math.PI * 2;
  const PX = 1 / 88;                       // 2D battle px → world units (a 150 px party sprite ≈ 1.7 m)
  const toX = (x) => (x - 640) / 80;       // 2D battle layout → arena ground plane
  const toZ = (y) => (y - 470) / 52;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sstep = (k) => k * k * (3 - 2 * k);
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

  // ======================================================================================== billboard units
  // Unlit sprite material: arena light tint, hit glow, opacity, and a glowing-edge dissolve for dying enemies.
  const BB_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
  const BB_FS = `
    uniform sampler2D map, uNoise; uniform vec3 uLight, uGlow, uEdge; uniform float uOpacity, uDissolve, uFlip;
    varying vec2 vUv;
    void main(){
      vec2 uv = vec2(uFlip > 0.5 ? 1.0 - vUv.x : vUv.x, vUv.y);
      vec4 t = texture2D(map, uv);
      if (t.a < 0.42) discard;
      float n = texture2D(uNoise, uv * 2.3).r;
      if (uDissolve > 0.0 && n < uDissolve) discard;
      vec3 c = t.rgb * uLight + uGlow * t.a;
      float edge = uDissolve > 0.0 ? smoothstep(uDissolve + 0.08, uDissolve, n) : 0.0;
      c = mix(c, uEdge, edge);
      gl_FragColor = vec4(c, uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  class BBUnit {
    constructor(view, u) {
      const T = THREE;
      this.view = view; this.u = u; this.kind = 'bb';
      const party = u.side === 'party' || u.sprite;
      let W, H, fx, fy, hpx, wpx;
      if (party) { W = 320; H = 330; fx = W / 2; fy = H - 40; hpx = 150; wpx = 80; }
      else {
        const md = G.Monsters.get(u.art) || { w: 140, h: 160 };
        const sc = u.scale || 1;
        W = Math.ceil(md.w * sc * 1.6 + 120); H = Math.ceil(md.h * sc * 1.4 + 110); fx = W / 2; fy = H - 50;
        hpx = md.h * sc; wpx = md.w * sc;
      }
      let res = view.lite ? 1 : 1.5;
      if (Math.max(W, H) * res > 2048) res = 2048 / Math.max(W, H);
      this.W = W; this.H = H; this.fx = fx; this.fy = fy;
      this.canvas = G.U.makeCanvas(W, H, res);
      this.ctx = this.canvas.getContext('2d');
      this.tex = G.R3M.canvasTex(this.canvas);
      this.tex.generateMipmaps = false; this.tex.minFilter = T.LinearFilter;
      this.uni = {
        map: { value: this.tex }, uNoise: { value: view.noiseTex }, uLight: { value: new T.Color(1, 1, 1) }, uGlow: { value: new T.Color(0, 0, 0) },
        uEdge: { value: new T.Color('#9fd0ff').multiplyScalar(1.6) }, uOpacity: { value: 1 }, uDissolve: { value: 0 }, uFlip: { value: 0 },
      };
      this.mat = new T.ShaderMaterial({ uniforms: this.uni, vertexShader: BB_VS, fragmentShader: BB_FS, side: T.DoubleSide, transparent: false });
      const geo = new T.PlaneGeometry(W * PX, H * PX);
      geo.translate((W / 2 - fx) * PX, (fy - H / 2) * PX, 0);
      this.mesh = new T.Mesh(geo, this.mat);
      this.mesh.castShadow = !view.lite;
      this.mesh.customDepthMaterial = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: this.tex, alphaTest: 0.5 });
      this.pivot = new T.Group(); this.pivot.add(this.mesh);
      this.root = new T.Group(); this.root.add(this.pivot);
      this.height = hpx * PX; this.radius = clamp(wpx * PX * 0.42, 0.35, 2.4);
      this.native = party ? (u.side === 'party' ? -1 : 1) : 1; // which way the 2D art faces on screen (−1 = left)
      // proxy: the unit as drawn at the canvas origin (live props read through to the real unit)
      this.proxy = Object.create(u);
      this.proxy.x = fx; this.proxy.y = fy; this.proxy.ox = 0; this.proxy.oy = 0; this.proxy.alpha = 1; this.proxy.st = {};
      this.lastDraw = -1;
      this.paint(0);
    }
    paint(t) {
      const c = this.ctx, bs = this.view.bs;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const s = this.canvas.width / this.W;
      c.setTransform(s, 0, 0, s, 0, 0);
      bs._bbPass = true;
      try { bs.drawUnit(c, this.proxy, t); } catch (e) { G.warnOnce('bb drawUnit ' + (this.u.art || this.u.sprite), e); }
      bs._bbPass = false;
      this.tex.needsUpdate = true;
    }
    play() {}
    setFacing(yaw) { this.yaw = yaw; }
    setOpacity(a) { this.uni.uOpacity.value = 1; this.uni.uDissolve.value = this.u.side === 'enemy' ? clamp(1 - a, 0, 1) * 1.05 : 0; this.mesh.visible = a > 0.01; }
    glow(c) { this.uni.uGlow.value.copy(c); }
    update(dt, cam, t) {
      // paint at ~30 fps (every frame on fast machines would also be fine)
      this.acc = (this.acc || 0) + dt;
      const every = this.view.lite ? 1 / 12 : 1 / 30;
      if (this.acc >= every || this.u.flash > 0.05) { this.acc = 0; this.paint(t); }
      // cylindrical billboard toward the camera
      const dx = cam.position.x - this.root.position.x, dz = cam.position.z - this.root.position.z;
      this.pivot.rotation.y = Math.atan2(dx, dz) - this.root.rotation.y;
      // mirror the art when the unit faces the other way on screen
      const f = V3(Math.sin(this.yaw || 0), 0, Math.cos(this.yaw || 0));
      const right = V3(1, 0, 0).applyQuaternion(cam.quaternion);
      const s = f.dot(right) >= 0 ? 1 : -1;
      this.uni.uFlip.value = s !== this.native ? 1 : 0;
    }
    bone() { return null; }
    dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.mesh.customDepthMaterial.dispose(); this.tex.dispose(); }
  }

  // ---------------------------------------------------------------------------------------- unit wrapper
  // Normalises Char3D / Mon3D / billboard instances and adds battle presentation state (knockback, lunge, glow …).
  class UnitView {
    constructor(view, u) {
      this.view = view; this.u = u;
      this.inst = null; this.kind = 'bb';
      const ctx = { context: 'battle' };
      try {
        if (u.side === 'party' || u.sprite) {
          const id = u.sprite || u.id;
          const special = view.bs.c7 && view.bs.c7.ghost && view.bs.c7.ghost[u.id]; // chapter-scripted look → keep the 2D painter
          if (!special && G.Char3D && G.Char3D.has && G.Char3D.has(id)) { this.inst = G.Char3D.create(id, ctx); this.kind = 'char'; }
        } else if (G.Mon3D && G.Mon3D.has && G.Mon3D.has(u.art)) {
          this.inst = G.Mon3D.create(u.art, { context: 'battle', variant: u.variant || 0, scale: u.scale || 1, phase: u.phase });
          this.kind = 'mon';
        }
      } catch (e) { G.warnOnce('battle3d unit ' + (u.sprite || u.art || u.id), e); this.inst = null; }
      if (!this.inst) { this.inst = new BBUnit(view, u); this.kind = 'bb'; }
      this.root = new THREE.Group();
      this.root.add(this.inst.root);
      this.height = this.inst.height || 1.7;
      if (this.kind === 'mon') {
        // keep the 2D battle proportions (party sprite 150 px ≈ 1.7 m): creature height = 2D h × scale × PX
        const md = G.Monsters && G.Monsters.get(u.art);
        const want = (md ? md.h : 160) * (u.scale || 1) * PX;
        const f = want / Math.max(0.1, this.inst.height || want);
        this.inst.root.scale.setScalar(f);
        this.height = want;
        this.radius = (this.inst.radius || this.height * 0.28) * f;
      }
      if (this.kind === 'char' && view.bs.c7 && view.bs.c7.childYungui && u.id === 'yungui') { this.inst.root.scale.setScalar(0.74); this.height *= 0.74; }
      if (this.kind !== 'mon') this.radius = this.inst.radius || clamp(this.height * 0.28, 0.35, 2.4);
      // contact shadow
      const blob = new THREE.Mesh(view.blobGeo, view.blobMat);
      blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.renderOrder = 1;
      blob.scale.setScalar(Math.max(1, this.radius * 2.2));
      this.blob = blob; this.root.add(blob);
      if (this.kind === 'mon') blob.visible = false; // Mon3D brings its own contact shadow
      this.pos = V3(); this.home = V3();
      this.yaw = u.side === 'party' ? -Math.PI / 2 : Math.PI / 2;
      this.knock = V3(); this.lunge = 0; this.glowC = new THREE.Color(0, 0, 0); this.glowT = 0; this.glowDur = 0; this.glowAmt = 0; this.glowCol = new THREE.Color();
      this.lastPose = null; this.lastDead = u.dead; this.moveSpeed = 0; this.prev = null;
      this.hitT = 9;
      if (this.kind !== 'bb' && this.inst.setWeaponDrawn) this.inst.setWeaponDrawn(true);
    }
    glow(color, amt = 0.6, dur = 0.25) { this.glowCol.set(color); this.glowAmt = amt; this.glowDur = dur; this.glowT = 0; }
    // play a clip on a real model; returns { hit, dur } timing if known
    clip(name, opts = {}) {
      if (this.kind === 'bb' || !this.inst.play) return null;
      try {
        const info = this.inst.clipInfo ? this.inst.clipInfo(name) : null;
        this.inst.play(name, opts);
        return info;
      } catch (e) { G.warnOnce('clip ' + name, e); return null; }
    }
    poseClip(pose) {
      const u = this.u;
      if (this.kind === 'bb') return;
      if (u.dead && u.side === 'party') { this.clip('ko'); return; }
      switch (pose) {
        case 'idle': this.inst.play(null, { fade: 0.25 }); break;
        case 'ready': this.clip('ready', { loop: true }); break;
        case 'attack': this.clip(this.alt ? 'attack2' : 'attack'); this.alt = !this.alt; break;
        case 'cast': this.clip(this.kind === 'mon' ? 'cast' : 'cast'); break;
        case 'hurt': this.clip('hurt', { fade: 0.06 }); break;
        case 'guard': this.clip('guard'); break;
        case 'ko': this.clip(this.kind === 'mon' ? 'die' : 'ko'); break;
        case 'victory': this.clip('victory', { loop: true }); break;
        case 'item': this.clip('item'); break;
        default: break;
      }
    }
    dispose() { if (this.inst.dispose) this.inst.dispose(); }
  }

  // ======================================================================================== the view
  class Battle3D {
    constructor(bs) {
      const T = THREE;
      this.bs = bs;
      this.lite = !!G.R3.lite;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(36, G.W / G.H, 0.1, 600);
      this.scene.add(this.camera);
      this.post = { vignette: 0.42, bloom: 0.6, bloomThreshold: 0.8 };
      this.t = 0; this.rt = 0;
      this.units = new Map();
      this.timeScale = 1; this.hitStopT = 0; this.slowT = 0; this.slowK = 1;
      this.trauma = 0; this.flashA = 0; this.flashC = new T.Color(1, 1, 1); this.fovKick = 0;
      this.noiseTex = G.R3M.tex('b3d_noise', 128, 128, (g, w, h) => { const img = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = (G.U.hash(i % w, (i / w) | 0, 7) * 0.6 + G.U.hash((i % w) >> 2, (i / w) >> 2, 9) * 0.4) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); }, { wrap: true, srgb: false });
      this.blobGeo = new T.PlaneGeometry(1, 1);
      this.blobMat = new T.MeshBasicMaterial({ map: G.R3M.blobTex(), transparent: true, depthWrite: false, opacity: 0.9 });
      this.captureField();
      // arena (sky, fog, lights, terrain, props)
      this.arena = G.Battle3D.Arena.build(this, bs.bg);
      this.lightK = this.arena.lightK || 1;
      this.fx = G.VFX3D ? G.VFX3D.create(this) : null;
      // markers: active ring + target reticles
      this.activeRing = this.makeRing('#ffd98a', 0.9);
      this.reticles = [];
      // camera
      this.cam = { pos: V3(10, 6, 16), look: V3(0, 1, 0), fov: 36, roll: 0 };
      this.shot = null;
      this.director = new Director(this);
      this.syncUnits(0);
      this.director.start();
      this.started = true;
      this.intro = { t: 0, dur: 1.15 };
      this.buildShatter();
      this.pops = new WeakMap();
      this.events = []; // debug/test log: { k, rt, … } (tools/r3d/battle/*.js screenshot on these)
      G.Battle3D.current = this;
    }
    ev(k, o) { this.events.push(Object.assign({ k, rt: this.rt }, o || {})); }

    // ---------------------------------------------------------------- helpers used by VFX
    speed() { return G.settings.battleSpeed || 1; }
    // debug/test: swap the arena for another backdrop id (tools/r3d/battle/arenas.js)
    rebuildArena(bg) {
      if (this.arena.dispose) this.arena.dispose();
      this.arena = G.Battle3D.Arena.build(this, bg);
      this.lightK = this.arena.lightK || 1;
      for (const [, uv] of this.units) uv.lastPose = null;
    }
    hideHud() { return !!(this.intro && this.intro.t < this.intro.dur * 0.7) || !!this.ink; }
    // battle-time seconds the scene should wait before the first turn (the intro shot length; snappier in auto-battle)
    introWait() { const boss = this.director.kind === 'boss' || this.director.shot && this.director.shot.kind === 'boss'; const real = boss ? 2.6 : this.bs.auto ? 1.0 : 1.7; return real * this.speed(); }
    unitView(u) { return this.units.get(u) || null; }
    pos(u, where = 'chest') {
      const uv = this.units.get(u);
      if (!uv) return V3(toX(u.x + (u.ox || 0)), where === 'feet' ? 0 : 1, toZ(u.y + (u.oy || 0)));
      const p = uv.root.position.clone();
      const h = uv.height;
      switch (where) {
        case 'feet': return p.setY(0);
        case 'head': return p.setY(p.y + h * 0.95);
        case 'top': return p.setY(p.y + h + 0.15);
        case 'hand': {
          const b = uv.inst.bone && uv.inst.bone('handR');
          if (b) return b.getWorldPosition(V3());
          const f = V3(Math.sin(uv.yaw), 0, Math.cos(uv.yaw));
          return p.addScaledVector(f, uv.radius * 0.8 + 0.2).setY(p.y + h * 0.62);
        }
        case 'front': { const f = V3(Math.sin(uv.yaw), 0, Math.cos(uv.yaw)); return p.addScaledVector(f, uv.radius + 0.3).setY(p.y + h * 0.5); }
        default: return p.setY(p.y + h * (uv.kind === 'bb' && u.side === 'enemy' ? 0.5 : 0.58));
      }
    }
    shake(a = 0.3) { this.trauma = Math.min(1.2, this.trauma + a); }
    flash(c, a = 0.4, d = 0.3) { this.flashC.set(c); this.flashA = Math.max(this.flashA, a); this.flashDur = d; }
    hitStop(sec) { this.hitStopT = Math.max(this.hitStopT, sec); }
    slowMo(k, sec) { this.slowK = k; this.slowT = sec; }
    dimSky(a, sec) { this.dimA = Math.max(this.dimA || 0, a); this.dimT = Math.max(this.dimT || 0, sec); }
    trance(sec) { this.tranceT = Math.max(this.tranceT || 0, sec); }
    makeRing(color, r) {
      const T = THREE;
      const m = new T.Mesh(new T.RingGeometry(r * 0.82, r, 48), new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(1.8), transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false, fog: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.035; m.renderOrder = 3; m.visible = false;
      this.scene.add(m);
      return m;
    }

    // ---------------------------------------------------------------- units
    syncUnits(dt) {
      const bs = this.bs, live = new Set();
      for (const u of bs.all()) {
        live.add(u);
        let uv = this.units.get(u);
        if (!uv) {
          uv = new UnitView(this, u); this.units.set(u, uv); this.scene.add(uv.root); this.placeUnit(uv, 0, true);
          // joined mid-battle (summons, story guests): entrance clip + a puff of spirit smoke
          if (this.started) { if (uv.kind === 'mon') uv.clip('enter'); if (this.fx) this.fx.summonPuff(u); }
        }
      }
      for (const [u, uv] of this.units) if (!live.has(u)) { this.scene.remove(uv.root); uv.dispose(); this.units.delete(u); }
    }
    enemyCenter(side) {
      const list = (side === 'party' ? this.bs.party : this.bs.enemies).filter((x) => !x.dead);
      const c = V3(); if (!list.length) return side === 'party' ? V3(5, 0, 0) : V3(-4, 0, 0.5);
      for (const x of list) c.add(V3(toX(x.x), 0, toZ(x.y)));
      return c.multiplyScalar(1 / list.length);
    }
    placeUnit(uv, dt, snap) {
      const u = uv.u, bs = this.bs;
      uv.home.set(toX(u.x), 0, toZ(u.y));
      const raw = V3(toX(u.x + u.ox), 0, toZ(u.y + u.oy));
      let p = raw;
      const act = this.action;
      if (act && act.u === u && act.melee && act.tg && (u.ox || u.oy)) {
        // melee run-up: follow the 2D tween's progress but stop at the target's real 3D silhouette
        const tg = act.tg, tuv = this.units.get(tg);
        const tgPos = tuv ? V3(tuv.root.position.x, 0, tuv.root.position.z) : V3(toX(tg.x), 0, toZ(tg.y));
        const away = uv.home.clone().sub(tgPos); away.y = 0;
        if (away.lengthSq() < 1e-4) away.set(u.side === 'party' ? 1 : -1, 0, 0);
        away.normalize();
        const contact = tgPos.clone().addScaledVector(away, (tuv ? tuv.radius : 0.5) + uv.radius + 0.35);
        const tx = tg.x + (u.side === 'party' ? 110 : -110) * (tg.side === u.side ? -1 : 1) - u.x;
        const full = Math.hypot(tx, tg.y - u.y + 4) || 1;
        const f = clamp(Math.hypot(u.ox, u.oy) / full, 0, 1);
        p = uv.home.clone().lerp(contact, f);
      }
      // presentation offsets: knockback & lunge
      uv.knock.multiplyScalar(Math.exp(-dt * 7));
      const f = V3(Math.sin(uv.yaw), 0, Math.cos(uv.yaw));
      p = p.clone().add(uv.knock).addScaledVector(f, uv.lunge);
      if (uv.prev && dt > 0) { const sp = p.distanceTo(uv.prev) / dt; uv.moveSpeed = lerp(uv.moveSpeed, sp, Math.min(1, dt * 10)); }
      uv.prev = p.clone();
      uv.root.position.copy(p);
      // ghost-ish hover for flying enemies drawn in 2D is part of their art; nothing to add here
    }
    updateUnits(dt, adt) {
      const bs = this.bs, cam = this.camera;
      const eC = this.enemyCenter('enemy'), pC = this.enemyCenter('party');
      const fwd = V3(0, 0, -1).applyQuaternion(cam.quaternion);
      this.camYaw = Math.atan2(-fwd.x, -fwd.z);
      for (const [u, uv] of this.units) {
        this.placeUnit(uv, adt, false);
        // facing
        let want;
        const act = this.action;
        if (act && act.u === u && act.tg && act.tg !== u) { const tp = this.pos(act.tg, 'feet'); want = Math.atan2(tp.x - uv.root.position.x, tp.z - uv.root.position.z); }
        else if (u.pose === 'victory' && this.victoryT != null && uv.kind !== 'bb') want = Math.atan2(cam.position.x - uv.root.position.x, cam.position.z - uv.root.position.z);
        else { const c = u.side === 'party' ? eC : pC; want = Math.atan2(c.x - uv.home.x, c.z - uv.home.z); }
        if (bs.result === 'flee' && u.side === 'party') want = Math.PI / 2;
        uv.yaw = wrapA(uv.yaw + wrapA(want - uv.yaw) * Math.min(1, adt * 10));
        uv.inst.setFacing(uv.yaw);
        // pose → clip / lunge
        const pose = u.dead && u.side === 'party' ? 'ko' : u.pose;
        if (pose !== uv.lastPose) {
          if (uv.lastDead && !u.dead && u.side === 'party' && uv.kind === 'char') uv.clip('revive');
          else if (!uv.skipPose) uv.poseClip(pose);
          uv.skipPose = false;
          if (pose === 'attack' && uv.kind === 'bb') uv.lungeT = 0;
          uv.lastPose = pose;
        }
        if (u.dead && !uv.lastDead && u.side === 'enemy' && uv.kind !== 'bb') uv.clip(uv.kind === 'mon' ? 'die' : 'ko');
        uv.lastDead = u.dead;
        if (uv.lungeT != null) { uv.lungeT += dt; const k = uv.lungeT / 0.3; uv.lunge = k < 0.3 ? easeOut(k / 0.3) * 0.35 : Math.max(0, 0.35 * (1 - (k - 0.3) / 0.7)); if (k >= 1) { uv.lungeT = null; uv.lunge = 0; } }
        // locomotion while running (melee approach / flee)
        if (uv.kind !== 'bb' && uv.inst.setMove) uv.inst.setMove(uv.moveSpeed > 1 ? Math.min(7, uv.moveSpeed) : 0);
        // glow / hit flash
        uv.glowT += dt;
        const gk = uv.glowDur > 0 ? Math.max(0, 1 - uv.glowT / uv.glowDur) : 0;
        uv.glowC.copy(uv.glowCol).multiplyScalar(uv.glowAmt * gk);
        if (u.flash > 0.05 && uv.kind !== 'bb') uv.glowC.addScalar(u.flash * 0.9);
        if (uv.kind === 'bb') uv.inst.glow(uv.glowC);
        else if (uv.inst.bodyMat && uv.inst.bodyMat.userData.u) { for (const m of [uv.inst.bodyMat, uv.inst.faceMat]) if (m && m.userData.u && m.userData.u.uGlow) m.userData.u.uGlow.value.copy(uv.glowC); }
        else if (uv.kind === 'mon') {
          if (u.flash > 0.05) uv.inst.flash = Math.max(uv.inst.flash || 0, u.flash);
          if (uv.inst.setPhase && u.phase !== uv.lastPhase) { uv.lastPhase = u.phase; try { uv.inst.setPhase(u.phase || 1); } catch (e) { G.warnOnce('mon phase', e); } }
        }
        // opacity / death dissolve
        const ghost = !!(bs.c7 && bs.c7.ghost && bs.c7.ghost[u.id] === 'ghost');
        if (uv.inst.setOpacity) uv.inst.setOpacity(u.alpha, ghost);
        if (u.side === 'enemy' && u.phase > 1 && uv.seenPhase != null && u.phase !== uv.seenPhase && !u.dead) this.director.onPhase(u);
        uv.seenPhase = u.phase;
        if (uv.kind === 'bb') uv.inst.uni.uLight.value.copy(this.arena.unitLight || new THREE.Color(1, 1, 1));
        uv.blob.material.opacity = 0.9;
        uv.blob.visible = u.alpha > 0.2 && uv.kind !== 'mon';
        uv.root.visible = u.alpha > 0.01;
        // hurt shake for billboards
        if (uv.kind === 'bb' && u.pose === 'hurt' && !u.dead) uv.inst.mesh.position.x = Math.sin(u.poseT * 70) * 0.04 * Math.exp(-u.poseT * 6);
        else if (uv.kind === 'bb') uv.inst.mesh.position.x = 0;
        // party KO billboard lies on the ground already in its art; keep upright otherwise
        if (uv.kind === 'bb') uv.inst.update(dt, cam, this.t);
        else if (uv.inst.update) uv.inst.update(dt, this.camYaw, cam);
      }
    }

    // ---------------------------------------------------------------- hooks from battle.js
    playFx(id, u, targets, s) {
      let T = this.fx ? this.fx.play(id, u, targets, s) : 0.3;
      const uv = this.units.get(u);
      const melee = /^(slash|claw|bite|thrust)/.test(id || '');
      // align the strike with a real model's hit frame
      if (melee && uv && uv.kind !== 'bb' && uv.inst.clipInfo) {
        const name = uv.alt ? 'attack' : 'attack2';
        const info = uv.inst.clipInfo(name) || uv.inst.clipInfo('attack');
        if (info && info.hit != null) T = Math.max(T, Math.min(0.5, info.hit / (uv.inst.clipSpeed || 1)));
      }
      this.director.onFx(id, u, targets, s, T);
      this.ev('fx', { id, T: T / this.speed(), side: u.side });
      return T;
    }
    onCast(u, s) { if (this.fx) this.fx.cast(u, s); this.director.onCast(u, s); }
    onAction(u, s, targets, melee) {
      this.action = { u, s, targets, tg: targets[0] || null, melee, t: 0 };
      this.ev('action', { side: u.side, melee, name: s && s.name });
      this.director.onAction(this.action);
    }
    onActionEnd(u) { if (this.action && this.action.u === u) this.action = null; this.director.onActionEnd(u); }
    onDamage(tg, dmg, o = {}) {
      const uv = this.units.get(tg);
      if (this.fx) this.fx.hit(tg, o);
      if (uv) {
        const a = o.attacker && this.units.get(o.attacker);
        const d = a ? uv.root.position.clone().sub(a.root.position) : V3(tg.side === 'party' ? 1 : -1, 0, 0);
        d.y = 0; if (d.lengthSq() > 1e-6) d.normalize();
        const big = tg.side === 'enemy' && tg.boss;
        uv.knock.addScaledVector(d, (o.crit ? 0.45 : 0.25) * (big ? 0.3 : 1));
        uv.glow('#ffffff', (o.crit ? 1 : 0.7) * (uv.kind === 'bb' ? 0.55 : 1), 0.14);
      }
      const melee = this.action && this.action.melee;
      this.hitStop(o.crit ? 0.12 : melee ? 0.07 : 0.035);
      this.shake(o.crit ? 0.45 : melee ? 0.22 : 0.12);
      if (o.crit) this.fovKick = Math.min(4, this.fovKick + 3);
    }
    onKill(u) {
      this.ev('kill', { side: u.side });
      if (this.fx) this.fx.kill(u);
      if (u.side === 'enemy') {
        const last = !this.bs.enemies.some((e) => !e.dead && e !== u);
        this.director.onKill(u, last);
      } else this.director.onPartyDown(u);
    }
    onSummonIntro(u, cat) { this.summonCat = cat; if (this.fx) this.fx.summonIntro(u, cat); }
    onCutin(u, s) { this.ev('cutin', { id: u.id }); this.director.onCutin(u, s); }
    async beforeFinish(r) {
      if (r === 'win') { await this.director.finisher(); this.director.victory(); }
      else if (r === 'lose') this.director.defeat();
    }
    outro() {
      return new Promise((res) => { this.ink = { t: 0, dur: 0.9, res }; });
    }

    // ---------------------------------------------------------------- field capture & shatter intro
    captureField() {
      // the BattleScene's 2D snapshot only holds the UI layer when the field is 3D: composite the WebGL frame under it
      const snap = this.bs.snapshot;
      try {
        if (G.R3.active && G.R3.view && G.R3.view !== this && G.R3.canvas) {
          const c = document.createElement('canvas'); c.width = snap.width; c.height = snap.height;
          const g = c.getContext('2d');
          G.R3.render(0);
          g.drawImage(G.R3.canvas, 0, 0, c.width, c.height);
          g.drawImage(snap, 0, 0);
          c.lw = snap.lw; c.lh = snap.lh;
          this.fieldSnap = c;
          return;
        }
      } catch (e) { G.warnOnce('battle3d capture', e); }
      this.fieldSnap = snap;
    }
    buildShatter() {
      const T = THREE;
      if (!this.fieldSnap) return;
      // jittered grid triangulation → shards that burst toward the camera
      const cols = 10, rows = 6, pts = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const edge = i === 0 || j === 0 || i === cols || j === rows;
        pts.push([i / cols + (edge ? 0 : rnd(-0.03, 0.03)), j / rows + (edge ? 0 : rnd(-0.04, 0.04))]);
      }
      const P = [], UV = [], C = [], R = [];
      const tri = (a, b, c) => {
        const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3;
        const r = [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(0.6, 1.4)];
        for (const p of [a, b, c]) { P.push(p[0] - 0.5, p[1] - 0.5, 0); UV.push(p[0], p[1]); C.push(cx - 0.5, cy - 0.5, rnd(0, 1)); R.push(...r); }
      };
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = pts[j * (cols + 1) + i], b = pts[j * (cols + 1) + i + 1], c = pts[(j + 1) * (cols + 1) + i], d = pts[(j + 1) * (cols + 1) + i + 1];
        if ((i + j) % 2) { tri(a, b, d); tri(a, d, c); } else { tri(a, b, c); tri(b, d, c); }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(P, 3));
      geo.setAttribute('uv', new T.Float32BufferAttribute(UV, 2));
      geo.setAttribute('aC', new T.Float32BufferAttribute(C, 3));
      geo.setAttribute('aR', new T.Float32BufferAttribute(R, 4));
      const tex = new T.CanvasTexture(this.fieldSnap);
      tex.colorSpace = T.SRGBColorSpace; tex.flipY = true; tex.needsUpdate = true;
      this.shatterTex = tex;
      const mat = new T.ShaderMaterial({
        uniforms: { map: { value: tex }, uK: { value: 0 }, uAspect: { value: G.W / G.H } },
        vertexShader: `
          uniform float uK, uAspect; attribute vec3 aC; attribute vec4 aR; varying vec2 vUv; varying float vShade;
          mat3 rotA(vec3 ax, float a){ ax = normalize(ax); float s = sin(a), c = cos(a), oc = 1.0 - c;
            return mat3(oc*ax.x*ax.x+c, oc*ax.x*ax.y+ax.z*s, oc*ax.z*ax.x-ax.y*s, oc*ax.x*ax.y-ax.z*s, oc*ax.y*ax.y+c, oc*ax.y*ax.z+ax.x*s, oc*ax.z*ax.x+ax.y*s, oc*ax.y*ax.z-ax.x*s, oc*ax.z*ax.z+c); }
          void main(){
            vUv = uv;
            float k = clamp((uK - aC.z * 0.18) / 0.82, 0.0, 1.0); k = k * k;
            vec3 local = position - vec3(aC.xy, 0.0);
            local = rotA(aR.xyz + vec3(0.001), k * 5.0 * aR.w) * local;
            vec3 p = vec3(aC.xy, 0.0) + local;
            p.xy += aC.xy * k * 2.4 * aR.w + vec2(0.0, -k * k * 1.6);
            p.z += k * 1.4 * aR.w;
            p.x *= uAspect;
            vShade = 1.0 - k * 0.6;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `uniform sampler2D map; uniform float uK; varying vec2 vUv; varying float vShade;
          void main(){ vec4 c = texture2D(map, vUv); float edge = 1.0; gl_FragColor = vec4(c.rgb * vShade + vec3(1.0, 0.95, 0.85) * max(0.0, 0.25 - uK) * 2.0, 1.0 - smoothstep(0.55, 1.0, uK));
            #include <colorspace_fragment>
          }`,
        transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide, toneMapped: false,
      });
      const m = new T.Mesh(geo, mat);
      m.renderOrder = 1000; m.frustumCulled = false;
      this.camera.add(m);
      this.shatter = m;
      this.placeShatter();
    }
    placeShatter() {
      if (!this.shatter) return;
      // a camera-space quad exactly filling the view at distance d
      const d = 1.2, h = 2 * d * Math.tan(this.camera.fov * Math.PI / 360);
      this.shatter.position.set(0, 0, -d);
      this.shatter.scale.set(h, h, h);
    }

    // ---------------------------------------------------------------- per frame
    frame() {
      const now = G.time;
      let rdt = this._last != null ? Math.min(0.05, Math.max(0, now - this._last)) : 1 / 60;
      this._last = now;
      if (G.Battle3D.freeze) rdt = 0; // test hook: hold the presentation still while a screenshot is taken
      const sp = this.speed();
      // presentation time: battle speed × hit-stop × slow-mo
      let ts = 1;
      if (this.hitStopT > 0) { this.hitStopT -= rdt; ts = 0.02; }
      if (this.slowT > 0) { this.slowT -= rdt; ts *= this.slowK; }
      const dt = rdt * sp * ts;
      this.rt += rdt; this.t += dt;
      this.cutin = !!this.bs.cutin;
      // 2D shake requests (boss phase changes, chapter scripts) → camera trauma
      if ((this.bs.shakeT || 0) > 0.05 && (this.bs.shakeT || 0) > (this._shk || 0)) this.trauma = Math.min(1, this.trauma + Math.min(0.6, this.bs.shakeT));
      this._shk = this.bs.shakeT || 0;
      // shared map systems: no see-through cutout in battle; drive the foliage wind clock
      if (G.R3M.cut) G.R3M.cut.uCutOn.value = 0;
      if (G.Wind3D && G.Wind3D.update) { try { G.Wind3D.update(rdt); } catch (e) { G.warnOnce('wind3d', e); } }
      this.syncUnits(dt);
      this.updateUnits(dt, rdt * sp * Math.max(ts, 0.25));
      if (this.fx) this.fx.update(dt);
      this.updateMarkers(rdt);
      this.arena.update && this.arena.update(dt, this.t, this);
      this.director.update(rdt * sp * (this.slowT > 0 ? this.slowK : 1), rdt);
      this.applyCamera(rdt);
      this.updatePost(rdt);
      // intro shatter
      if (this.intro) {
        this.intro.t += rdt;
        if (this.shatter) this.shatter.material.uniforms.uK.value = clamp(this.intro.t / this.intro.dur, 0, 1);
        if (this.intro.t > this.intro.dur) { this.intro = null; if (this.shatter) { this.camera.remove(this.shatter); this.shatter.geometry.dispose(); this.shatter.material.dispose(); this.shatterTex.dispose(); this.shatter = null; } }
      }
      G.R3.setView(this);
      G.R3.render(rdt);
    }
    updateMarkers(rdt) {
      const bs = this.bs, a = bs.active;
      const ring = this.activeRing;
      if (a && !bs.result && this.units.get(a) && !this.cutin) {
        const uv = this.units.get(a);
        ring.visible = true;
        ring.position.x = uv.root.position.x; ring.position.z = uv.root.position.z;
        const s = Math.max(0.8, uv.radius * 1.6) * (1 + 0.05 * Math.sin(this.rt * 6));
        ring.scale.set(s, s, s);
        ring.material.opacity = 0.55 + 0.25 * Math.sin(this.rt * 6);
        ring.material.color.set(a.side === 'party' ? '#ffd98a' : '#ff7a6a').multiplyScalar(1.8);
      } else ring.visible = false;
      // target reticles
      const ui = bs.ui, list = ui && ui.mode === 'target' && ui.tg ? (ui.tg.all ? ui.tg.pool : [ui.tg.pool[ui.tg.i]]) : [];
      while (this.reticles.length < list.length) this.reticles.push(this.makeRing('#ff5a4a', 1));
      this.reticles.forEach((r, i) => {
        const u = list[i];
        r.visible = !!u;
        if (!u) return;
        const uv = this.units.get(u); if (!uv) { r.visible = false; return; }
        r.position.x = uv.root.position.x; r.position.z = uv.root.position.z;
        const s = Math.max(0.9, uv.radius * 1.8) * (1.08 + 0.08 * Math.sin(this.rt * 8));
        r.scale.set(s, s, s); r.rotation.z = this.rt * 1.5;
        r.material.color.set(u.side === 'party' ? '#8affb0' : '#ff6a4a').multiplyScalar(2);
      });
    }
    applyCamera(rdt) {
      const c = this.cam, cam = this.camera;
      if (this.debugCam) { c.pos.set(...this.debugCam.pos); c.look.set(...this.debugCam.look); c.fov = this.debugCam.fov || 36; c.roll = 0; }
      // trauma-based shake (smooth noise)
      this.trauma = Math.max(0, this.trauma - rdt * 1.6);
      const s = this.trauma * this.trauma * (G.settings.screenShake === false ? 0 : 1);
      const t = this.rt * 30;
      const n = (o) => Math.sin(t * 1.13 + o) * 0.6 + Math.sin(t * 2.31 + o * 3.1) * 0.4;
      cam.position.copy(c.pos);
      cam.position.x += n(1) * s * 0.28; cam.position.y += n(2) * s * 0.22; cam.position.z += n(3) * s * 0.2;
      const look = c.look.clone(); look.x += n(4) * s * 0.12; look.y += n(5) * s * 0.12;
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
      if (c.roll || s) cam.rotateZ((c.roll || 0) + n(6) * s * 0.02);
      this.fovKick = Math.max(0, this.fovKick - rdt * 10);
      const fov = c.fov - this.fovKick;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); this.placeShatter(); }
      cam.updateMatrixWorld();
      if (this.arena.follow) this.arena.follow(cam);
    }
    updatePost(rdt) {
      const P = this.post, A = this.arena;
      this.flashA = Math.max(0, this.flashA - rdt / Math.max(0.05, this.flashDur || 0.3));
      if (this.dimT > 0) this.dimT -= rdt; else this.dimA = Math.max(0, (this.dimA || 0) - rdt * 1.5);
      const dim = Math.max(this.dimA || 0, Math.min(0.6, (this.bs.dim || 0) * 0.6));
      if (this.tranceT > 0) this.tranceT -= rdt;
      const kale = Math.max(0, Math.min(1, this.bs.overlayK || 0), this.tranceT > 0 ? Math.min(1, this.tranceT) : 0);
      P.exposure = (A.exposure || 1) * (1 - dim * 0.55) * (1 + this.flashA * 1.4);
      P.bloom = (A.bloom != null ? A.bloom : 0.6) + this.flashA * 0.8 + dim * 0.25;
      P.bloomThreshold = A.bloomThreshold != null ? A.bloomThreshold : 0.8;
      P.vignette = (A.vignette != null ? A.vignette : 0.42) + dim * 0.25 + (this.cutin ? 0.2 : 0);
      P.warp = (A.warp || 0) + kale * 0.8;
      P.hue = kale > 0 ? Math.sin(this.rt * 0.9) * 0.4 * kale : (A.hue || 0);
      P.sat = (A.sat || 1.06) + kale * 0.4 - dim * 0.15;
      const fc = this.flashC, fa = this.flashA * 0.6;
      P.tint = [lerp(1, fc.r * 1.4, fa), lerp(1, fc.g * 1.4, fa), lerp(1, fc.b * 1.4, fa)];
      if (A.tint) { P.tint[0] *= A.tint[0]; P.tint[1] *= A.tint[1]; P.tint[2] *= A.tint[2]; }
      if (A.lights) A.lights(1 - dim * 0.65);
    }

    // ---------------------------------------------------------------- 2D overlay (drawn after the 3D frame)
    scr(u, where) {
      const p = this.pos(u, where);
      return G.R3.project(this.camera, p.x, p.y, p.z);
    }
    drawOverlay(ctx, t) {
      const bs = this.bs;
      // r3lite (no post chain): screen flash drawn on the 2D layer instead
      if (this.lite && this.flashA > 0.01) { ctx.save(); ctx.globalAlpha = Math.min(0.6, this.flashA * 0.6); ctx.fillStyle = '#' + this.flashC.getHexString(); ctx.fillRect(0, 0, G.W, G.H); ctx.restore(); }
      if (this.lite && (this.dimA > 0.01 || bs.dim > 0)) { ctx.fillStyle = `rgba(0,0,10,${Math.min(0.5, Math.max(this.dimA || 0, bs.dim || 0) * 0.5)})`; ctx.fillRect(0, 0, G.W, G.H); }
      // legacy 2D fx pushed by chapter scripts (drawn through a best-fit 2D→screen affine)
      if (bs.fx.length) {
        const A = this.fitAffine();
        if (A) { ctx.save(); this.applyBaseTransform(ctx, A); for (const f of bs.fx) { try { f.draw(ctx); } catch (e) { G.warnOnce('legacy fx', e); } } ctx.restore(); }
      }
      if (this.cutin || this.intro) { this.drawPops(ctx, t); return; }
      // enemy HP bars and status chips
      for (const [u, uv] of this.units) {
        if (u.dead || u.alpha < 0.3 || !uv.root.visible) continue;
        const top = this.scr(u, 'top');
        if (!top.visible) continue;
        if (u.side === 'enemy' && !u.boss) {
          const bw = 84, x = top.x - bw / 2, y = top.y - 18;
          G.UI.bar(ctx, x, y, bw, 7, u.hp / u.mhp, '#ff8a6a', '#c8382a');
        }
        const sts = Object.keys(u.st).filter((k) => G.Battle.STATUS_INFO[k]);
        if (sts.length) {
          ctx.font = G.font(13, true);
          const ws = sts.map((k) => Math.max(20, G.Render.measure(ctx, G.Battle.STATUS_INFO[k].ch) + 8));
          let sx = top.x - ws.reduce((a, b) => a + b + 2, 0) / 2;
          const sy = top.y - (u.side === 'enemy' && !u.boss ? 44 : 30);
          sts.forEach((k, i) => {
            const info = G.Battle.STATUS_INFO[k], bw = ws[i];
            ctx.fillStyle = info.c; ctx.beginPath(); ctx.roundRect(sx, sy, bw, 20, 5); ctx.fill();
            G.Render.text(ctx, info.ch, sx + bw / 2, sy + 3, { size: 13, bold: true, align: 'center', color: '#101010', shadow: false });
            if (info.up) G.Render.text(ctx, info.up > 0 ? '▲' : '▼', sx + bw - 3, sy - 6, { size: 10, color: info.up > 0 ? '#8aff8a' : '#ff8a8a', shadow: false });
            sx += bw + 2;
          });
        }
      }
      // target cursor + info
      const ui = bs.ui;
      if (ui && ui.mode === 'target' && ui.tg) {
        const list = ui.tg.all ? ui.tg.pool : [ui.tg.pool[ui.tg.i]];
        for (const u of list) {
          if (!u) continue;
          const s = this.scr(u, 'top');
          const x = s.x, y = s.y - 30 + Math.sin(t * 6) * 5;
          ctx.save();
          ctx.fillStyle = '#ffd97a'; ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x - 14, y - 16); ctx.lineTo(x + 14, y - 16); ctx.lineTo(x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
          if (!ui.tg.all || list.length === 1) {
            G.Render.text(ctx, u.name, x, y - 74, { size: 22, align: 'center', color: '#fff0d0', stroke: '#1a0e08', strokeW: 4 });
            if (u.side === 'enemy' && u.d) {
              const known = (G.state.bestiary[u.id] || 0) > 0;
              const EN = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
              const weakTxt = known && u.weak && u.weak.length ? G.T('弱：' + u.weak.map((e) => EN[e]).join('')) : '';
              ctx.font = G.font(15);
              const ww = weakTxt ? ctx.measureText(weakTxt).width : 0;
              let lx = x - ((u.d.elem ? 26 : 0) + ww) / 2;
              if (u.d.elem) { G.UI.elemBadge(ctx, u.d.elem, lx + 10, y - 32, 10); lx += 26; }
              if (weakTxt) G.Render.text(ctx, weakTxt, lx, y - 41, { size: 15, color: '#ffd84a' });
            }
          }
        }
      }
      this.drawPops(ctx, t);
    }
    // damage numbers: anchored to the 3D unit, popping out along a little arc
    drawPops(ctx) {
      const bs = this.bs;
      for (const p of bs.pops) {
        let st = this.pops.get(p);
        if (!st) {
          let base = null;
          if (p.u) { const s = this.scr(p.u, p.label ? 'top' : 'chest'); base = { x: s.x, y: s.y }; }
          else { const A = this.fitAffine(); base = A ? { x: A[0] * p.x + A[2] * p.y + A[4], y: A[1] * p.x + A[3] * p.y + A[5] } : { x: p.x, y: p.y }; }
          st = { base, dx: p.label ? 0 : rnd(-1, 1) * 46, dy0: (p.dy || 0) };
          this.pops.set(p, st);
        }
        const life = p.label ? 1.1 : 1.0;
        const k = p.t / life;
        let x, y, sc;
        if (p.label) { x = st.base.x; y = st.base.y - 26 + st.dy0 - 28 * easeOut(Math.min(1, k * 1.5)); sc = 1 + 0.25 * Math.max(0, 1 - p.t * 8); }
        else {
          const a = Math.min(1, p.t / 0.55);
          x = st.base.x + st.dx * easeOut(a);
          y = st.base.y - 70 * Math.sin(a * Math.PI * 0.62) / Math.sin(Math.PI * 0.62) + (a >= 1 ? 0 : 0) + Math.max(0, p.t - 0.55) * -10;
          sc = (p.crit ? 1.25 : 1) * (1 + (p.crit ? 0.7 : 0.45) * Math.max(0, 1 - p.t * 7));
        }
        ctx.save();
        ctx.globalAlpha = Math.min(1, (1 - k) * 3);
        ctx.translate(x, y); ctx.scale(sc, sc);
        if (p.crit) G.Render.text(ctx, p.text, 0, 0, { size: p.size, bold: true, align: 'center', baseline: 'middle', color: '#ffe27a', stroke: 'rgba(60,20,0,0.9)', strokeW: 7, glow: 'rgba(255,170,60,0.8)', glowBlur: 14 });
        else G.Render.text(ctx, p.text, 0, 0, { size: p.size, bold: true, align: 'center', baseline: 'middle', color: p.color, stroke: 'rgba(20,10,10,0.85)', strokeW: p.label ? 4 : 6 });
        ctx.restore();
      }
    }
    // least-squares affine from 2D battle coordinates to the current screen, fitted on the units' feet and heads
    fitAffine() {
      if (this._affT === this.rt && this._aff) return this._aff;
      const src = [], dst = [];
      for (const [u] of this.units) {
        if (u.alpha < 0.05) continue;
        const f = this.scr(u, 'feet'), h = this.scr(u, 'top');
        const x = u.x + u.ox, y = u.y + u.oy, H = this.bs.unitH(u);
        src.push([x, y]); dst.push([f.x, f.y]);
        src.push([x, y - H]); dst.push([h.x, h.y]);
      }
      if (src.length < 3) return null;
      // solve [a c e; b d f] minimising Σ|A s − d|²  (normal equations, 3×3 per row)
      const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
      for (let i = 0; i < src.length; i++) {
        const v = [src[i][0], src[i][1], 1];
        for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) M[r][c] += v[r] * v[c]; bx[r] += v[r] * dst[i][0]; by[r] += v[r] * dst[i][1]; }
      }
      const sx = solve3(M, bx), sy = solve3(M, by);
      if (!sx || !sy) return null;
      this._aff = [sx[0], sy[0], sx[1], sy[1], sx[2], sy[2]];
      this._affT = this.rt;
      return this._aff;
    }
    applyBaseTransform(ctx, A) { ctx.setTransform(G.S * A[0], G.S * A[1], G.S * A[2], G.S * A[3], G.S * A[4], G.S * A[5]); }

    // 劍意 cut-in in 3D mode: the camera orbits the caster underneath; a lighter band with the portrait(s) on top
    drawCutin(ctx, t) {
      const bs = this.bs, c = bs.cutin;
      if (!c) return;
      const k = c.t, a = Math.max(0, Math.min(1, k * 6, (1.25 - k) * 5));
      const U = G.U;
      ctx.save();
      ctx.globalAlpha = a;
      const elem = (G.Data.chars[c.u.id] && G.Data.chars[c.u.id].elem) || 'fire';
      const ec = { fire: ['#c8401e', '#5a1208'], water: ['#2a7ac8', '#0a2a5a'], metal: ['#c8a038', '#4a3410'], wood: ['#3a9a4a', '#0a3a1a'], earth: ['#a8783a', '#3a2410'] }[elem] || ['#a03020', '#3a0a08'];
      // letterbox bars
      const bar = 70 * U.ease.outCubic(Math.min(1, k * 4));
      ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, G.W, bar); ctx.fillRect(0, G.H - bar, G.W, bar);
      ctx.save();
      ctx.translate(G.W / 2, G.H / 2); ctx.rotate(-0.12);
      const g = ctx.createLinearGradient(-G.W, 0, G.W, 0);
      g.addColorStop(0, U.rgba(ec[1], 0)); g.addColorStop(0.28, U.rgba(ec[0], 0.82)); g.addColorStop(0.72, U.rgba(ec[1], 0.82)); g.addColorStop(1, U.rgba(ec[1], 0));
      const bh = 110 + 20 * U.ease.outCubic(Math.min(1, k * 3));
      ctx.fillStyle = g; ctx.fillRect(-G.W, -bh, G.W * 2, bh * 2);
      // ink-brush edges
      ctx.fillStyle = 'rgba(10,6,4,0.75)';
      for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-G.W, sgn * bh); for (let x = -G.W; x <= G.W; x += 40) ctx.lineTo(x, sgn * (bh + 4 + 6 * Math.sin(x * 0.05 + sgn))); ctx.lineTo(G.W, sgn * (bh + 16)); ctx.lineTo(-G.W, sgn * (bh + 16)); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,236,200,0.4)'; ctx.lineWidth = 2;
      for (let i = 0; i < 22; i++) { const yy = -bh + 10 + (i * 41) % (bh * 2 - 20), xx = ((k * 2600 + i * 310) % (G.W * 2)) - G.W; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + 160 + (i % 3) * 60, yy); ctx.stroke(); }
      ctx.restore();
      const slide = U.ease.outCubic(Math.min(1, k * 3));
      const ids = c.partner ? [c.u.id, c.partner] : [c.u.id];
      ids.forEach((id, i) => {
        const px = -380 + slide * (ids.length > 1 ? 120 + i * 280 : 220) + k * 30;
        G.Portraits.draw(ctx, id, i === 0 ? 'serious' : 'angry', px, G.H / 2 - 210, 340, 380, t, {});
      });
      G.Render.text(ctx, c.s.name, G.W - 110 - (1 - slide) * 220, G.H / 2 - 40, { size: 62, align: 'right', color: '#fff4dc', glow: U.rgba(ec[0], 0.95), glowBlur: 26 });
      G.Render.text(ctx, c.partner ? '合擊' : '劍意・奧義', G.W - 112 - (1 - slide) * 260, G.H / 2 + 34, { size: 24, align: 'right', color: '#ffe0b0' });
      ctx.restore();
    }

    // battle→field: ink spreading over the screen (resolves when fully covered)
    drawTransition(ctx) {
      const ink = this.ink;
      if (!ink) return;
      const now = G.time; ink.t += ink.last != null ? Math.min(0.05, now - ink.last) : 0; ink.last = now;
      const k = clamp(ink.t / ink.dur, 0, 1);
      if (!this.inkBlots) {
        this.inkBlots = [];
        const seeds = [[0.5, 0.5], [0.15, 0.25], [0.85, 0.3], [0.25, 0.85], [0.8, 0.82], [0.5, 0.1], [0.05, 0.6], [0.95, 0.6]];
        seeds.forEach((s, i) => this.inkBlots.push({ x: s[0] * G.W, y: s[1] * G.H, d: i === 0 ? 0 : 0.08 + i * 0.05, r: rnd(0.9, 1.3), rot: rnd(0, TAU), spr: inkSprite(i % 3) }));
      }
      ctx.save();
      for (const b of this.inkBlots) {
        const kk = clamp((k - b.d) / (1 - b.d), 0, 1);
        if (kk <= 0) continue;
        const R = Math.pow(kk, 1.35) * 820 * b.r;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot + kk * 0.3);
        ctx.drawImage(b.spr, -R, -R, R * 2, R * 2);
        ctx.restore();
      }
      if (k > 0.8) { ctx.fillStyle = `rgba(6,5,8,${(k - 0.8) / 0.2})`; ctx.fillRect(0, 0, G.W, G.H); }
      ctx.restore();
      if (k >= 1 && ink.res) { const r = ink.res; ink.res = null; G.Render.fade.color = '#000'; G.Render.fade.a = 1; r(); }
    }

    dispose() {
      // units: instances dispose their own resources; detach them first (Char3D/Mon3D share template geometry with the field)
      for (const [, uv] of this.units) { this.scene.remove(uv.root); if (uv.kind !== 'bb') uv.root.remove(uv.inst.root); try { uv.dispose(); } catch (e) { /* ignore */ } G.R3.dispose(uv.root); }
      this.units.clear();
      if (this.fx) this.fx.dispose();
      if (this.arena.dispose) this.arena.dispose();
      G.R3.dispose(this.scene);
      this.blobGeo.dispose(); this.blobMat.dispose();
      if (G.R3.view === this) G.R3.view = null;
      if (G.Battle3D.current === this) G.Battle3D.current = null;
    }
  }

  function solve3(M, b) {
    const m = M.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      if (Math.abs(m[p][c]) < 1e-9) return null;
      [m[c], m[p]] = [m[p], m[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }
  const inkCache = [];
  function inkSprite(i) {
    if (inkCache[i]) return inkCache[i];
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#06050a';
    // ragged ink splat: noisy radial polygon + satellite drops + feathered rim
    g.beginPath();
    const n = 64;
    for (let k = 0; k <= n; k++) { const a = k / n * TAU; const r = S * (0.36 + 0.06 * Math.sin(a * (5 + i)) + 0.04 * Math.sin(a * 13 + i) + rnd(-0.015, 0.015)); g.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
    g.fill();
    for (let k = 0; k < 18; k++) { const a = rnd(0, TAU), r = S * rnd(0.36, 0.48), rr = S * rnd(0.01, 0.035); g.beginPath(); g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rr, 0, TAU); g.fill(); }
    const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5); gr.addColorStop(0, 'rgba(6,5,10,0.6)'); gr.addColorStop(1, 'rgba(6,5,10,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    inkCache[i] = c;
    return c;
  }

  // ======================================================================================== camera director
  // Shots are functions of time → { pos, look, fov, roll }. New shots blend (or cut) from the current camera pose.
  class Director {
    constructor(view) { this.v = view; this.shot = null; this.from = null; this.queue = []; this.idleT = 0; }
    get bs() { return this.v.bs; }
    get auto() { return !!this.bs.auto; }
    start() {
      const bs = this.bs;
      const boss = bs.enemies.find((e) => e.boss) || (bs.troop.boss ? bs.enemies[0] : null);
      if (boss) this.set(this.bossIntro(boss), 0);
      else this.set(this.establishing(), 0);
    }
    // set a shot. blend: seconds (0 = cut). hold: minimum seconds before idle logic may replace it
    set(shot, blend = 0.4, hold = 0) {
      const c = this.v.cam;
      this.from = { pos: c.pos.clone(), look: c.look.clone(), fov: c.fov, roll: c.roll || 0 };
      this.shot = shot; this.t = 0; this.blend = blend; this.hold = hold;
    }
    pose(shot, t) { const r = shot.f(t); r.fov = r.fov || 36; r.roll = r.roll || 0; return r; }
    update(dt, rdt) {
      const v = this.v, bs = this.bs, c = v.cam;
      if (!this.shot) this.set(this.neutral(), 0);
      this.t += dt;
      // idle logic: what should the camera be doing right now?
      if (this.t > this.hold && !this.locked) {
        const want = this.idleShotKind();
        if (want !== this.kind) {
          this.kind = want;
          const sp = v.speed() * (this.auto ? 1.6 : 1);
          if (want === 'command') this.set(this.commandShot(bs.active), 0.55 / sp);
          else if (want === 'target') this.set(this.targetShot(), 0.45 / sp);
          else if (want === 'enemyTurn') this.set(this.enemyTurnShot(bs.active), 0.5 / sp);
          else if (want === 'neutral') this.set(this.neutral(), 0.7 / sp);
        } else if (want === 'target' && this.tgKey !== this.targetKey()) { this.set(this.targetShot(), 0.3); }
      }
      const p = this.pose(this.shot, this.t);
      if (this.blend > 0 && this.t < this.blend) {
        const k = sstep(this.t / this.blend);
        c.pos.lerpVectors(this.from.pos, p.pos, k); c.look.lerpVectors(this.from.look, p.look, k);
        c.fov = lerp(this.from.fov, p.fov, k); c.roll = lerp(this.from.roll, p.roll, k);
      } else { c.pos.copy(p.pos); c.look.copy(p.look); c.fov = p.fov; c.roll = p.roll; }
    }
    idleShotKind() {
      const bs = this.bs, v = this.v;
      if (v.victoryT != null) return this.kind;
      if (bs.result) return this.kind || 'neutral';
      if (v.action) return this.kind;
      const a = bs.active;
      if (bs.ui && bs.ui.mode === 'target') return 'target';
      if (a && a.side === 'party' && bs.ui && !this.auto) return 'command';
      if (a && a.side === 'enemy') return 'enemyTurn';
      return 'neutral';
    }
    targetKey() { const ui = this.bs.ui; if (!ui || !ui.tg) return ''; return ui.tg.all ? 'all' : String(ui.tg.i) + (ui.tg.pool[ui.tg.i] && ui.tg.pool[ui.tg.i].side); }

    // ---------------------------------------------------------------- shot library
    P(u, w) { return this.v.pos(u, w); }
    neutral() {
      const pc = this.v.enemyCenter('party'), ec = this.v.enemyCenter('enemy');
      const mid = pc.clone().lerp(ec, 0.48);
      const span = Math.max(8, pc.distanceTo(ec));
      const bossK = this.bs.enemies.some((e) => e.boss && !e.dead) ? 1.2 : 1;
      return { kind: 'neutral', f: (t) => {
        const sway = Math.sin(t * 0.18) * 0.8;
        return { pos: V3(mid.x + 3.2 + sway, 3.3 * bossK, mid.z + span * 1.12 * bossK), look: V3(mid.x - 0.6, 1.25 * bossK, mid.z - 0.5), fov: 36 };
      } };
    }
    establishing() {
      const pc = this.v.enemyCenter('party'), ec = this.v.enemyCenter('enemy');
      const mid = pc.clone().lerp(ec, 0.5);
      const end = this.neutral();
      const dur = 1.9;
      return { kind: 'intro', f: (t) => {
        const k = clamp(t / dur, 0, 1), e = sstep(k);
        const a0 = -2.2, a1 = 0.35;                       // sweep from behind the enemies round to the party side
        const ang = lerp(a0, a1, e), R = lerp(17, 13, e), h = lerp(8.5, 3.6, e);
        const p0 = V3(mid.x + Math.sin(ang) * R, h, mid.z + Math.cos(ang) * R);
        const look0 = V3(mid.x, 1.2, mid.z);
        if (k < 1) return { pos: p0, look: look0, fov: lerp(46, 38, e) };
        return end.f(t - dur);
      } };
    }
    bossIntro(boss) {
      const end = this.neutral();
      return { kind: 'boss', f: (t) => {
        const uv = this.v.units.get(boss);
        const h = uv ? uv.height : 3;
        const bp = this.P(boss, 'feet');
        if (t < 1.6) { // low worm's-eye push-in on the boss
          const k = sstep(t / 1.6);
          return { pos: V3(bp.x + 3.2 + k * 0.6, 0.5 + k * 0.3, bp.z + lerp(h * 2.2 + 2.5, h * 1.6 + 1.6, k)), look: V3(bp.x, h * lerp(0.55, 0.75, k), bp.z), fov: lerp(30, 34, k), roll: lerp(0.06, 0, k) };
        }
        if (t < 2.4) { const k = sstep((t - 1.6) / 0.8); const a = this.pose({ f: () => ({ pos: V3(bp.x + 3.8, 0.8, bp.z + h * 1.6 + 1.6), look: V3(bp.x, h * 0.75, bp.z) }) }, 0); const b = end.f(0); return { pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k), fov: lerp(34, 36, k) }; }
        return end.f(t - 2.4);
      } };
    }
    // over-the-shoulder from behind the active party member toward the enemies
    commandShot(u) {
      if (!u) return this.neutral();
      return { kind: 'command', f: (t) => {
        const p = this.P(u, 'feet'), ec = this.v.enemyCenter('enemy');
        const d = ec.clone().sub(p); d.y = 0; d.normalize();
        const right = V3(-d.z, 0, d.x); // screen-right when looking along d
        const hmax = Math.max(1.7, ...this.bs.enemies.filter((e) => !e.dead).map((e) => (this.v.units.get(e) || { height: 1.7 }).height));
        const pos = p.clone().addScaledVector(d, -3.4).addScaledVector(right, 1.7).setY(2.05 + hmax * 0.12 + Math.sin(t * 0.5) * 0.05);
        const look = p.clone().lerp(ec, 0.72).addScaledVector(right, -0.4).setY(0.9 + hmax * 0.3);
        return { pos, look, fov: 40 + Math.max(0, hmax - 2) * 2 };
      } };
    }
    targetShot() {
      const ui = this.bs.ui; this.tgKey = this.targetKey();
      if (!ui || !ui.tg) return this.neutral();
      const list = ui.tg.all ? ui.tg.pool : [ui.tg.pool[ui.tg.i]];
      const u = this.bs.active;
      if (list[0] && list[0].side === 'party') {
        // healing/buff on allies: frame the party from the front-left
        const pc = this.v.enemyCenter('party');
        const tgt = ui.tg.all ? pc : this.P(list[0], 'feet');
        return { kind: 'target', f: (t) => ({ pos: V3(tgt.x - 4.2, 2.3, tgt.z + 5.2), look: V3(tgt.x + 0.2, 1.0, tgt.z), fov: 38 }) };
      }
      return { kind: 'target', f: (t) => {
        const c = V3(); for (const x of list) c.add(this.P(x, 'feet')); c.multiplyScalar(1 / Math.max(1, list.length));
        const hmax = Math.max(...list.map((x) => (this.v.units.get(x) || { height: 1.7 }).height));
        const p = u ? this.P(u, 'feet') : V3(5, 0, 0);
        const d = c.clone().sub(p); d.y = 0; const dist = d.length(); d.normalize();
        const right = V3(-d.z, 0, d.x);
        const back = ui.tg.all ? 2.6 : 1.6;
        const pos = p.clone().addScaledVector(d, -back).addScaledVector(right, 1.5 + (ui.tg.all ? 1 : 0)).setY(1.7 + hmax * 0.25);
        const look = c.clone().setY(Math.min(2.4, hmax * 0.55));
        return { pos, look, fov: ui.tg.all ? 44 : clamp(34 - dist * 0.4 + hmax * 1.4, 26, 40) };
      } };
    }
    enemyTurnShot(e) {
      if (!e) return this.neutral();
      return { kind: 'enemyTurn', f: (t) => {
        const p = this.P(e, 'feet'), pc = this.v.enemyCenter('party');
        const uv = this.v.units.get(e); const h = uv ? uv.height : 1.8;
        const d = p.clone().sub(pc); d.y = 0; d.normalize();
        const right = V3(-d.z, 0, d.x);
        // from behind the party's flank, looking at the enemy (3/4)
        const pos = pc.clone().addScaledVector(d, -1.2).addScaledVector(right, -2.6 - h * 0.4).setY(1.5 + h * 0.2);
        const look = p.clone().setY(h * 0.55).addScaledVector(right, 0.5);
        return { pos, look, fov: clamp(30 + h * 1.2, 30, 42) };
      } };
    }
    // melee tracking: side-on dolly that follows the attacker into the strike
    meleeShot(a) {
      const u = a.u, tg = a.tg;
      const side = 1; // the camera stays on the open front side of the line of action (never crosses it)
      const swing = rnd(-0.25, 0.25);
      const sp0 = this.P(u, 'feet');
      return { kind: 'melee', f: (t) => {
        const p = this.P(u, 'feet'), q = this.P(tg, 'feet');
        const huv = this.v.units.get(tg), auv = this.v.units.get(u);
        const h = Math.max(huv ? huv.height : 1.7, auv ? auv.height : 1.7);
        const d = q.clone().sub(sp0); d.y = 0; const L = d.length() || 1; d.normalize();
        const n = V3(-d.z, 0, d.x).multiplyScalar(side);
        if (n.z < 0) n.negate();
        n.addScaledVector(d, swing).normalize();
        const mid = p.clone().lerp(q, 0.5);
        const dist = Math.max(4.5, Math.min(13, p.distanceTo(q) * 0.75 + 3.0 + h * 1.5));
        const pos = mid.clone().addScaledVector(n, dist).addScaledVector(d, -1.0).setY(1.2 + h * 0.22);
        const look = mid.clone().setY(Math.min(2.2, h * 0.45) + 0.1);
        return { pos, look, fov: 38 };
      } };
    }
    // spell: low 3/4 on the caster, then the targets
    castShot(u) {
      return { kind: 'cast', f: (t) => {
        const p = this.P(u, 'feet'); const uv = this.v.units.get(u); const h = uv ? uv.height : 1.7;
        const f = V3(Math.sin(uv ? uv.yaw : 0), 0, Math.cos(uv ? uv.yaw : 0));
        const right = V3(-f.z, 0, f.x);
        if (right.z < 0) right.negate(); // swing out toward the open front side
        const ang = t * 0.25;
        const pos = p.clone().addScaledVector(f, 3.2 + h * 0.6).addScaledVector(right, 2.0 + ang).setY(0.7 + h * 0.15);
        const look = p.clone().setY(h * 0.6);
        return { pos, look, fov: 34 };
      } };
    }
    impactShot(u, targets, big) {
      return { kind: 'impact', f: (t) => {
        const c = V3(); for (const x of targets) c.add(this.P(x, 'feet')); c.multiplyScalar(1 / Math.max(1, targets.length));
        const hmax = Math.max(1.7, ...targets.map((x) => (this.v.units.get(x) || { height: 1.7 }).height));
        const spread = targets.length > 1 ? Math.max(...targets.map((x) => this.P(x, 'feet').distanceTo(c))) : 0;
        const allies = targets[0] && targets[0].side === 'party';
        const from = u ? this.P(u, 'feet') : V3(6, 0, 0);
        let d = c.clone().sub(from); d.y = 0; if (d.lengthSq() < 0.01) d = V3(allies ? 1 : -1, 0, 0); d.normalize();
        const right = V3(-d.z, 0, d.x);
        const dist = 4 + spread * 1.4 + hmax * 1.1 + (big ? 2 : 0);
        const pos = c.clone().addScaledVector(d, -dist * 0.7).addScaledVector(right, dist * 0.55 * (allies ? -1 : 1)).setY(1.4 + hmax * 0.35 + (big ? 1.5 : 0) + t * 0.2);
        if (pos.z < c.z) pos.z = c.z + dist * 0.6;
        const look = c.clone().setY(hmax * 0.45);
        return { pos, look, fov: big ? 42 : 36 };
      } };
    }
    // ---------------------------------------------------------------- events
    onAction(a) {
      const sp = this.v.speed() * (this.auto ? 1.5 : 1);
      this.locked = true; this.kind = 'action';
      if (a.melee && a.tg) this.set(this.meleeShot(a), 0.32 / sp);
      else if (a.s && (a.s.type === 'phys') && a.targets.length > 1) this.set(this.impactShot(a.u, a.targets, false), 0.35 / sp);
      else if (a.s && !a.s.attack) this.set(this.castShot(a.u), 0.35 / sp);
    }
    onCast(u) { /* the cast shot is already running from onAction */ }
    onFx(id, u, targets, s, T) {
      const sp = this.v.speed() * (this.auto ? 1.5 : 1);
      const melee = /^(slash|claw|bite|thrust)/.test(id || '');
      if (melee && this.v.action && this.v.action.melee) return;
      const big = /_big|ultimate|combo/.test(id || '');
      // cut to the targets so the impact lands on screen
      this.set(this.impactShot(u, targets, big), Math.min(0.35, T * 0.8) / sp);
    }
    onActionEnd() {
      this.locked = false; this.kind = null;
      this.hold = 0;
    }
    onCutin(u, s) {
      this.locked = true; this.kind = 'cutin';
      this.set({ kind: 'cutin', f: (t) => {
        const p = this.P(u, 'feet'); const uv = this.v.units.get(u); const h = uv ? uv.height : 1.7;
        const a = (uv ? uv.yaw : 0) + 0.9 - t * 0.7;
        return { pos: p.clone().add(V3(Math.sin(a) * 2.6, 0.5 + t * 0.4, Math.cos(a) * 2.6)), look: p.clone().setY(h * 0.62), fov: 30, roll: 0.05 };
      } }, 0);
    }
    onKill(u, last) {
      if (last) { this.finishTarget = u; this.v.slowMo(0.3, 0.55); this.v.fovKick = 3; }
    }
    onPartyDown() { this.v.shake(0.2); }
    // a boss changes form: hold a low close-up on it for a beat (unless an action is mid-flight)
    onPhase(u) {
      if (this.v.action) return;
      this.locked = true; this.kind = 'phase';
      this.set({ kind: 'phase', f: (t) => { const p = this.P(u, 'feet'); const uv = this.v.units.get(u); const h = uv ? uv.height : 2; return { pos: V3(p.x + 3 + t * 0.4, 0.6 + h * 0.2, p.z + h * 1.4 + 2.2), look: V3(p.x, h * 0.6, p.z), fov: 32, roll: 0.04 }; } }, 0.25);
      this.v.shake(0.5); this.v.fovKick = 3;
      setTimeout(() => { if (this.kind === 'phase') { this.locked = false; this.kind = null; } }, 1800);
    }
    async finisher() {
      const u = this.finishTarget;
      if (!u) return;
      this.locked = true; this.kind = 'finish';
      const p = this.P(u, 'feet'); const uv = this.v.units.get(u); const h = uv ? uv.height : 1.7;
      this.set({ kind: 'finish', f: (t) => ({ pos: V3(p.x + 2.4 + t * 0.3, 0.6 + h * 0.15, p.z + 2.2 + h * 0.8 - t * 0.4), look: V3(p.x, h * 0.55, p.z), fov: 30 }) }, 0.12);
      this.v.slowMo(0.35, 0.7);
      await G.Timers.wait(0.75);
    }
    victory() {
      this.locked = true; this.kind = 'victory';
      this.v.victoryT = 0;
      const pc = this.v.enemyCenter('party');
      // slow orbit in front of the party (who turn to the lens), framed low under the results panel
      this.set({ kind: 'victory', f: (t) => {
        const a = -0.95 + Math.min(t, 6) * 0.07;
        return { pos: V3(pc.x + Math.sin(a) * 9.2, 1.7 + Math.sin(t * 0.3) * 0.1, pc.z + Math.cos(a) * 9.2), look: V3(pc.x - 0.3, 2.65, pc.z), fov: 40, roll: -0.02 };
      } }, 0.9);
    }
    defeat() {
      this.locked = true; this.kind = 'defeat';
      const pc = this.v.enemyCenter('party');
      this.set({ kind: 'defeat', f: (t) => ({ pos: V3(pc.x + 1, 7 + t * 0.6, pc.z + 4 + t * 0.3), look: V3(pc.x, 0.4, pc.z), fov: 40 }) }, 1.2);
    }
  }

  // ======================================================================================== ARENA (filled below)
  const Arena = { build: null };
  Battle3D.Arena = Arena;
  Battle3D.toX = toX; Battle3D.toZ = toZ; Battle3D.PX = PX;
  return Battle3D;
})();

// ============================================================================================ ARENAS
// One arena per backdrop id: sky dome (gradient, sun/moon, clouds, stars), distant ridges, terrain with a painted
// ground texture, optional sea/lake, fog, sun + hemisphere + lamp lights, and themed set dressing ("kits").
// Palettes follow the 2D backdrops in js/gfx/backdrops.js. Battle layout: party at +x, enemies at −x, the default
// camera looks from +z toward −z, so dressing is placed in a ring outside |x|<10, |z|<5 and kept low on the +z side.
G.Battle3D.Arena = (() => {
  const A = {};
  const TAU = Math.PI * 2;
  const U = G.U;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const fbm = (x, y, s = 0, o = 4) => { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += a * U.vnoise(x * f, y * f, s + i * 17); f *= 2; a *= 0.5; } return v; };
  const C = (h) => new THREE.Color(h);

  // ------------------------------------------------------------------------------------------ themes
  // sky: zen/hor/low colours, sun|moon {az (deg, 0 = −z/behind the enemies, 90 = −x), el (deg), size, col}, stars, clouds
  // light: sun colour/intensity, hemi sky/ground/intensity, unit (billboard tint), lamps [{x,y,z,col,i,d}]
  // ground: painter id + tint; water: {col, deep, y, z (shoreline, negative = behind)}; kit: set-dressing builder
  const NIGHT = { stars: 1 };
  const T = {
    dream: { sky: { zen: '#050b1e', hor: '#1c3460', low: '#0a1428', moon: { az: 25, el: 24, size: 2.6 }, stars: 1, clouds: 0.25, cloudCol: '#1a2c4e' }, fog: ['#0f1e3a', 30, 140], light: { sun: '#9ab8ff', si: 0.9, hemi: ['#4a6aa8', '#1a1a2a', 0.7], unit: '#a8b8e8' }, ground: { kind: 'planks', tint: '#9a8a7a', none: true }, water: { col: '#060a16', deep: '#02040a', y: -0.6, all: true }, kit: 'dreampier', night: 1, post: { bloom: 0.9, threshold: 0.55, exposure: 1.05 } },
    jiufen_night: { sky: { zen: '#0c0a26', hor: '#3a2a5a', low: '#1a1430', moon: { az: -55, el: 30, size: 1.8 }, stars: 0.8, clouds: 0.2, cloudCol: '#2a2448' }, fog: ['#2a2244', 26, 110], light: { sun: '#8a9aff', si: 0.7, hemi: ['#5a4a8a', '#2a1a1a', 0.7], unit: '#c8b8d8', lamps: [{ x: -9, y: 3, z: -6, col: '#ffb060', i: 6, d: 14 }, { x: 8, y: 3, z: -7, col: '#ff9a50', i: 6, d: 14 }] }, ground: { kind: 'pavers', tint: '#8a7a80' }, ridges: [{ r: 160, h: 26, col: '#1a1a34', rough: 0.6 }], kit: 'jiufen', night: 1, post: { bloom: 0.95, threshold: 0.55 } },
    jiufen_day: { sky: { zen: '#5aa0e0', hor: '#d8ecf4', low: '#a8c0c8', sun: { az: -10, el: 40, size: 1.4 }, clouds: 0.5, cloudCol: '#ffffff' }, fog: ['#c8dce8', 40, 160], light: { sun: '#fff0d8', si: 2.6, hemi: ['#bcd8f0', '#6a5a4a', 1.1], unit: '#ffffff' }, ground: { kind: 'pavers', tint: '#c8bca8' }, ridges: [{ r: 170, h: 40, col: '#6a8a9a', rough: 0.6 }, { r: 120, h: 18, col: '#4a7a4a', rough: 0.7 }], kit: 'jiufen' },
    shore: { sky: { zen: '#050b1a', hor: '#2c5478', low: '#14284a', moon: { az: 35, el: 22, size: 2.4 }, stars: 1, clouds: 0.35, cloudCol: '#20365a' }, fog: ['#1f3a5e', 30, 150], light: { sun: '#a8c4ff', si: 1.1, hemi: ['#5a7ab8', '#1a1a2a', 0.8], unit: '#b0c0e8' }, ground: { kind: 'rockshelf', tint: '#6a6a80' }, water: { col: '#14284a', deep: '#081428', y: -0.35, z: -9 }, ridges: [{ r: 190, h: 14, col: '#101a2e', rough: 0.4, arc: [60, 140] }], kit: 'shore', night: 1, post: { bloom: 0.8, threshold: 0.6 } },
    mine: { indoor: 'cave', sky: null, bg: '#0a0806', fog: ['#0c0906', 10, 46], light: { sun: '#ffb070', si: 0.8, hemi: ['#8a7a6a', '#2a1a10', 0.75], unit: '#e8d0b0', lamps: [{ x: -7, y: 2.6, z: -5, col: '#ffa04a', i: 9, d: 13 }, { x: 6, y: 2.6, z: -6, col: '#ffa04a', i: 9, d: 13 }, { x: 0, y: 2.8, z: 6, col: '#ff9040', i: 5, d: 12 }] }, ground: { kind: 'cavefloor', tint: '#7a6a58' }, kit: 'mine', night: 1, post: { bloom: 0.8, threshold: 0.6, vignette: 0.55 } },
    forest: { sky: { zen: '#9ab8a8', hor: '#dcebe0', low: '#a8c0b0', sun: { az: 10, el: 50, size: 1.6, col: '#fff8e0' }, clouds: 0.2 }, fog: ['#b8d0c0', 12, 70], light: { sun: '#fff4d8', si: 1.8, hemi: ['#c8e8d8', '#3a4a2a', 1.0], unit: '#e8f0e0' }, ground: { kind: 'forestfloor', tint: '#8a9a6a' }, kit: 'forest', post: { bloom: 0.6, threshold: 0.75 }, motes: 'pollen' },
    mushroom: { sky: { zen: '#0a0620', hor: '#3a1a5a', low: '#1a0a2a', stars: 0.8, clouds: 0 }, fog: ['#2a1048', 14, 70], light: { sun: '#a080ff', si: 0.6, hemi: ['#6a4aaa', '#1a0a2a', 0.8], unit: '#c0b0e0', lamps: [{ x: -9, y: 3, z: -6, col: '#5affd8', i: 8, d: 14 }, { x: 8, y: 4, z: -7, col: '#ff5af0', i: 8, d: 14 }, { x: 0, y: 3, z: -11, col: '#5ac8ff', i: 6, d: 14 }] }, ground: { kind: 'moss', tint: '#5a4a8a' }, kit: 'mushroom', night: 1, post: { bloom: 1.1, threshold: 0.5, sat: 1.2 }, motes: 'spores' },
    pingxi: { sky: { zen: '#2a2050', hor: '#e89870', low: '#6a4060', sun: { az: -20, el: 3, size: 3, col: '#ffb070' }, stars: 0.5, clouds: 0.35, cloudCol: '#8a5a7a' }, fog: ['#8a5a6a', 30, 140], light: { sun: '#ffa070', si: 1.2, hemi: ['#a080b0', '#3a2a2a', 0.8], unit: '#f0c8c0' }, ground: { kind: 'grass', tint: '#7a6a5a' }, ridges: [{ r: 170, h: 22, col: '#3a2a48', rough: 0.6 }, { r: 120, h: 10, col: '#2a2034', rough: 0.7 }], kit: 'pingxi', post: { bloom: 0.9, threshold: 0.6 } },
    mountain: { sky: { zen: '#3a8ae0', hor: '#cfe6f4', low: '#a8c8d8', sun: { az: 40, el: 45, size: 1.5 }, clouds: 0.45, cloudCol: '#ffffff' }, fog: ['#c8e0ee', 40, 170], light: { sun: '#fff4e0', si: 2.8, hemi: ['#b8d8f8', '#4a5a3a', 1.1], unit: '#ffffff' }, ground: { kind: 'grass', tint: '#9ab86a' }, ridges: [{ r: 200, h: 60, col: '#8aa0c0', rough: 0.9, snow: 0.55 }, { r: 140, h: 22, col: '#4a7a5a', rough: 0.6 }], kit: 'meadow' },
    temple: { sky: { zen: '#4a5a9a', hor: '#f0b0a0', low: '#a07a7a', sun: { az: -30, el: 8, size: 2.2, col: '#ffd0a0' }, clouds: 0.4, cloudCol: '#d89090' }, fog: ['#c09090', 30, 130], light: { sun: '#ffc8a0', si: 1.9, hemi: ['#d0b0c8', '#5a3a2a', 0.9], unit: '#ffe8e0', lamps: [{ x: -4, y: 2.6, z: -12, col: '#ff8a40', i: 5, d: 10 }, { x: 4, y: 2.6, z: -12, col: '#ff8a40', i: 5, d: 10 }] }, ground: { kind: 'pavers', tint: '#b8a898' }, kit: 'temple', post: { bloom: 0.7, threshold: 0.7 } },
    city: { sky: { zen: '#3a4a8a', hor: '#e8a888', low: '#8a6a6a', sun: { az: 0, el: 4, size: 2.4, col: '#ffc890' }, clouds: 0.4, cloudCol: '#c88a8a' }, fog: ['#a08080', 26, 110], light: { sun: '#ffc090', si: 1.5, hemi: ['#c0a8c0', '#4a3020', 0.9], unit: '#f8e0d8', lamps: [{ x: -8, y: 3.2, z: -7, col: '#ffa050', i: 6, d: 12 }, { x: 7, y: 3.2, z: -8, col: '#ffa050', i: 6, d: 12 }] }, ground: { kind: 'pavers', tint: '#a8907a' }, kit: 'street', style: 'city', post: { bloom: 0.8, threshold: 0.65 } },
    mansion: { sky: { zen: '#061a1e', hor: '#1e4a4a', low: '#0a2020', moon: { az: -40, el: 28, size: 2.2, col: '#f0fff0' }, stars: 0.6, clouds: 0.25, cloudCol: '#103030' }, fog: ['#103030', 20, 100], light: { sun: '#a0e0d0', si: 0.9, hemi: ['#3a7a6a', '#1a1010', 0.7], unit: '#a8d0c8', lamps: [{ x: 0, y: 2.2, z: -12, col: '#80ffa0', i: 3, d: 10 }] }, ground: { kind: 'mossystone', tint: '#5a7068' }, kit: 'mansion', night: 1, post: { bloom: 0.8, threshold: 0.6, sat: 0.95 } },
    tainan: { sky: { zen: '#e8a060', hor: '#ffe0b0', low: '#d09070', sun: { az: 15, el: 10, size: 3, col: '#fff0c0' }, clouds: 0.3, cloudCol: '#ffffff' }, fog: ['#f0c8a0', 34, 140], light: { sun: '#ffd8a0', si: 2.4, hemi: ['#ffd8b8', '#7a4a30', 1.0], unit: '#fff0e0' }, ground: { kind: 'redbrick', tint: '#d0987a' }, kit: 'tainan', post: { bloom: 0.7, threshold: 0.75, sat: 1.1 } },
    palace: { indoor: 'hall', bg: '#04060e', fog: ['#060a18', 14, 60], light: { sun: '#8ab0ff', si: 0.9, hemi: ['#5a7ac8', '#1a1a2a', 0.9], unit: '#b8c4e8', lamps: [{ x: 0, y: 3, z: -12, col: '#ffe0a0', i: 10, d: 16 }, { x: -8, y: 3, z: -2, col: '#6a9aff', i: 8, d: 14 }, { x: 8, y: 3, z: -2, col: '#6a9aff', i: 8, d: 14 }, { x: 0, y: 4, z: 6, col: '#8ab0ff', i: 5, d: 14 }] }, ground: { kind: 'darktile', tint: '#6a7aa0' }, kit: 'palace', night: 1, post: { bloom: 1.0, threshold: 0.5, vignette: 0.55 } },
    linto: { sky: { zen: '#0e0a2a', hor: '#4a3a6a', low: '#1a1430', moon: { az: 10, el: 14, size: 2.2 }, stars: 0.8, clouds: 0.25, cloudCol: '#2a2448' }, fog: ['#3a2c58', 30, 140], light: { sun: '#b0a0ff', si: 0.9, hemi: ['#6a5a9a', '#1a1424', 0.75], unit: '#c0b8e0' }, ground: { kind: 'sand', tint: '#7a6a80' }, water: { col: '#2a2448', deep: '#100c24', y: -0.35, z: -10 }, kit: 'beach', style: 'linto', night: 1, post: { bloom: 0.8, threshold: 0.6 } },
    tribe: { sky: { zen: '#060a1a', hor: '#2a3050', low: '#10142a', stars: 1, milky: 1, clouds: 0.1 }, fog: ['#1a2036', 26, 110], light: { sun: '#9ab0ff', si: 0.8, hemi: ['#4a5a8a', '#1a1612', 0.7], unit: '#b0b8d8', lamps: [{ x: -6, y: 1.4, z: -10, col: '#ffb060', i: 6, d: 12 }] }, ground: { kind: 'slate', tint: '#6a6a70' }, ridges: [{ r: 170, h: 26, col: '#0c1020', rough: 0.6 }], kit: 'tribe', night: 1, post: { bloom: 0.85, threshold: 0.6 } },
    vision: { sky: { zen: '#1a0a3a', hor: '#5a2a8a', low: '#2a1a5a', stars: 1, clouds: 0, psy: 1 }, fog: ['#3a1a6a', 16, 80], light: { sun: '#c08aff', si: 0.8, hemi: ['#8a5aff', '#2a0a4a', 0.9], unit: '#e0c8ff', lamps: [{ x: -6, y: 3, z: -8, col: '#3affc0', i: 6, d: 14 }, { x: 6, y: 3, z: -8, col: '#ff6af0', i: 6, d: 14 }] }, ground: { kind: 'psyfloor', tint: '#8a6ac8', uvScale: 8 }, kit: 'vision', night: 1, post: { bloom: 1.0, threshold: 0.55, sat: 1.25, warp: 0.25 } },
    breath: { sky: { zen: '#2a0a3a', hor: '#a03a6a', low: '#3a1a4a', psy: 2, clouds: 0 }, fog: ['#5a1a5a', 20, 90], light: { sun: '#ffd0a0', si: 1.0, hemi: ['#ff8ac8', '#3a1a4a', 1.0], unit: '#ffe0f0', lamps: [{ x: 0, y: 4, z: -8, col: '#ffe08a', i: 8, d: 16 }] }, ground: { kind: 'mandala', tint: '#b8a8c0', uvScale: 14 }, kit: 'breath', post: { bloom: 1.1, threshold: 0.55, sat: 1.3, warp: 0.35 } },
    lake: { sky: { zen: '#0a1428', hor: '#3a5068', low: '#14202e', moon: { az: 30, el: 26, size: 2 }, stars: 0.8, clouds: 0.2, cloudCol: '#1e2c40' }, fog: ['#2a3a4c', 30, 140], light: { sun: '#a8c0e8', si: 1.0, hemi: ['#5a7090', '#1a1e14', 0.8], unit: '#b8c8d8' }, ground: { kind: 'grass', tint: '#4a5a4a' }, water: { col: '#1e3040', deep: '#0a1420', y: -0.3, z: -8 }, ridges: [{ r: 180, h: 18, col: '#1a2838', rough: 0.5 }], kit: 'lake', night: 1, post: { bloom: 0.8, threshold: 0.6 } },
    sunmoon: { sky: { zen: '#6a6ab0', hor: '#f8c8b8', low: '#c8a0a8', sun: { az: 20, el: 6, size: 2.4, col: '#fff0d8' }, clouds: 0.35, cloudCol: '#ffe8f0' }, fog: ['#e0b8c0', 34, 150], light: { sun: '#ffe0c8', si: 1.8, hemi: ['#e8c8e0', '#5a5a3a', 1.0], unit: '#fff0f0' }, ground: { kind: 'grass', tint: '#9aa070' }, water: { col: '#b8a0c8', deep: '#6a6aa0', y: -0.3, z: -8 }, ridges: [{ r: 180, h: 18, col: '#8a7aa8', rough: 0.5 }], kit: 'lake' },
    shrine: { indoor: 'hall', bg: '#04140e', fog: ['#06261e', 12, 60], light: { sun: '#a0fff0', si: 0.9, hemi: ['#3aa890', '#06140e', 0.7], unit: '#b8e8d8', lamps: [{ x: 0, y: 3, z: -12, col: '#ff9ad8', i: 8, d: 14 }, { x: -7, y: 1, z: -4, col: '#ffd8a0', i: 4, d: 8 }, { x: 7, y: 1, z: -4, col: '#ffd8a0', i: 4, d: 8 }] }, ground: { kind: 'shrinefloor', tint: '#4a8a7a' }, water: { col: '#1a6a5a', deep: '#06261e', y: 0.06, all: true, clear: true }, kit: 'shrine', night: 1, post: { bloom: 1.0, threshold: 0.55 } },
    chaos: { sky: { zen: '#0a0404', hor: '#a02a10', low: '#3a0a04', clouds: 0.6, cloudCol: '#2a0a06', stars: 0 }, fog: ['#5a1a0a', 20, 100], light: { sun: '#ff6a2a', si: 1.4, hemi: ['#ff7a3a', '#1a0604', 0.8], unit: '#ffc8a8', lamps: [{ x: -10, y: 2, z: -10, col: '#ff5a1a', i: 10, d: 16 }, { x: 10, y: 2, z: -12, col: '#ff7a2a', i: 10, d: 16 }] }, ground: { kind: 'ash', tint: '#6a4a40' }, ridges: [{ r: 150, h: 16, col: '#1a0804', rough: 0.8 }], kit: 'chaos', night: 1, post: { bloom: 1.0, threshold: 0.55, sat: 1.1 }, motes: 'embers' },
    sea: { sky: { zen: '#04101a', hor: '#1a4a5a', low: '#082028', stars: 0.9, clouds: 0.25, cloudCol: '#0c2a34' }, fog: ['#103a44', 26, 140], light: { sun: '#80d0e0', si: 0.8, hemi: ['#3a7a8a', '#1a120a', 0.75], unit: '#b0d0d8', lamps: [{ x: 0, y: 5, z: -2, col: '#ffb060', i: 8, d: 14 }] }, ground: { kind: 'deck', tint: '#8a6a4a', none: true }, water: { col: '#0c2a34', deep: '#041016', y: -1.6, all: true }, kit: 'deck', night: 1, post: { bloom: 0.85, threshold: 0.6 } },
    farshore: { sky: { zen: '#1a0a2a', hor: '#c03a6a', low: '#5a1a2a', sun: { az: 12, el: 14, size: 3.4, col: '#ffffff', eclipse: 1 }, clouds: 0.3, cloudCol: '#8a2a5a', stars: 0.4 }, fog: ['#6a1a3a', 24, 120], light: { sun: '#ff8ab0', si: 1.0, hemi: ['#c05a8a', '#2a0a10', 0.8], unit: '#ffc8d8' }, ground: { kind: 'lilyfield', tint: '#7a2a2a' }, ridges: [{ r: 180, h: 10, col: '#3a1028', rough: 0.4 }], kit: 'farshore', night: 1, post: { bloom: 0.95, threshold: 0.55, sat: 1.15 }, motes: 'petals' },
    lighthouse: { indoor: 'tower', bg: '#0a0a0e', fog: ['#16161c', 12, 50], light: { sun: '#fff0d0', si: 1.6, sunDir: [0.1, 1, -0.2], hemi: ['#6a6a7a', '#141418', 0.55], unit: '#d8d0c8', lamps: [{ x: 0, y: 8, z: -2, col: '#ffe8b0', i: 10, d: 20 }, { x: -9, y: 2, z: -6, col: '#6a8aff', i: 3, d: 8 }] }, ground: { kind: 'stonetile', tint: '#6a6a72' }, kit: 'tower', night: 1, post: { bloom: 0.9, threshold: 0.6, vignette: 0.55 } },
    tamsui: { sky: { zen: '#3a3a7a', hor: '#ffb070', low: '#a06050', sun: { az: 0, el: 4, size: 3.2, col: '#fff0b0' }, clouds: 0.35, cloudCol: '#ffb090' }, fog: ['#e0a080', 30, 140], light: { sun: '#ffb070', si: 2.0, hemi: ['#e0a8a0', '#4a3020', 0.9], unit: '#ffe0c8' }, ground: { kind: 'pavers', tint: '#a8906a' }, water: { col: '#c07060', deep: '#5a3048', y: -0.6, z: -8 }, ridges: [{ r: 170, h: 30, col: '#5a3a5a', rough: 0.7, arc: [-30, 40] }], kit: 'harbor', post: { bloom: 0.85, threshold: 0.65 } },
    hakka: { sky: { zen: '#4a90e0', hor: '#d8eaf0', low: '#b8c8c8', sun: { az: 30, el: 50, size: 1.4 }, clouds: 0.4, cloudCol: '#ffffff' }, fog: ['#d0e0e4', 40, 160], light: { sun: '#fff4e0', si: 2.7, hemi: ['#c0d8f0', '#7a6a4a', 1.1], unit: '#ffffff' }, ground: { kind: 'dirt', tint: '#d0b890' }, ridges: [{ r: 170, h: 20, col: '#6a8a9a', rough: 0.6 }], kit: 'hakka' },
    windcave: { indoor: 'cave', bg: '#0a0c10', fog: ['#141c26', 12, 50], light: { sun: '#c8e0ff', si: 1.6, sunDir: [-0.3, 0.6, -1], hemi: ['#7a8aaa', '#2a2a34', 0.9], unit: '#c8d4e8', lamps: [{ x: 0, y: 4, z: -14, col: '#a8d0ff', i: 12, d: 26 }, { x: -9, y: 2, z: -2, col: '#6ab8ff', i: 5, d: 10 }, { x: 9, y: 2, z: -3, col: '#6ab8ff', i: 5, d: 10 }] }, ground: { kind: 'cavefloor', tint: '#5a6070' }, kit: 'windcave', night: 1, post: { bloom: 0.9, threshold: 0.6 }, motes: 'wind' },
    alishan: { sky: { zen: '#5a6aa8', hor: '#f8d0b0', low: '#e0e0e8', sun: { az: -10, el: 8, size: 2.4, col: '#fff0d0' }, clouds: 0.25, cloudCol: '#ffffff' }, fog: ['#e0d8d8', 26, 130], light: { sun: '#ffd8b0', si: 2.0, hemi: ['#e0c8d0', '#4a5a3a', 1.0], unit: '#fff0e8' }, ground: { kind: 'forestfloor', tint: '#7a8a5a' }, cloudsea: '#f4f0f4', ridges: [{ r: 190, h: 18, col: '#8a7aa8', rough: 0.6 }], kit: 'alishan', motes: 'pollen' },
    yushan: { sky: { zen: '#02040e', hor: '#1a2240', low: '#0a0e1a', stars: 1, milky: 1, clouds: 0 }, fog: ['#141a2e', 30, 140], light: { sun: '#a0b4ff', si: 0.9, hemi: ['#4a5a8a', '#141418', 0.7], unit: '#b0b8d8' }, ground: { kind: 'scree', tint: '#5a5a66' }, ridges: [{ r: 150, h: 70, col: '#1e2234', rough: 0.95, snow: 0.7, arc: [-50, 50] }, { r: 110, h: 14, col: '#10141e', rough: 0.7 }], kit: 'scree', night: 1, post: { bloom: 0.8, threshold: 0.6 } },
    procession: { sky: { zen: '#1a1430', hor: '#a05a50', low: '#4a2a2a', clouds: 0.3, cloudCol: '#4a2a3a', stars: 0.4 }, fog: ['#6a3a34', 22, 100], light: { sun: '#ff9a6a', si: 1.0, hemi: ['#a07a8a', '#3a1a10', 0.8], unit: '#f0c8b8', lamps: [{ x: -7, y: 3, z: -6, col: '#ff8a3a', i: 8, d: 13 }, { x: 7, y: 3, z: -7, col: '#ff8a3a', i: 8, d: 13 }, { x: 0, y: 3, z: -14, col: '#ffb050', i: 6, d: 14 }] }, ground: { kind: 'pavers', tint: '#8a6a5a' }, kit: 'street', style: 'procession', night: 1, post: { bloom: 0.95, threshold: 0.55 }, motes: 'embers' },
    south: { sky: { zen: '#2a8ae8', hor: '#c8ecf8', low: '#a0d8e8', sun: { az: 50, el: 50, size: 1.5 }, clouds: 0.45, cloudCol: '#ffffff' }, fog: ['#c8e8f4', 40, 170], light: { sun: '#fff8e8', si: 3.0, hemi: ['#b8e0f8', '#8a7a5a', 1.1], unit: '#ffffff' }, ground: { kind: 'boardwalk', tint: '#c8a070' }, water: { col: '#2a90c0', deep: '#105a8a', y: -0.5, z: -7 }, kit: 'beach', style: 'south', post: { bloom: 0.6, threshold: 0.8, sat: 1.12 } },
    wangboat: { sky: { zen: '#3a90e8', hor: '#d8f0f8', low: '#a8d0e0', sun: { az: -20, el: 55, size: 1.4 }, clouds: 0.5, cloudCol: '#ffffff' }, fog: ['#d0e8f0', 40, 170], light: { sun: '#fff8e8', si: 2.9, hemi: ['#c0e0f8', '#7a5a3a', 1.1], unit: '#ffffff' }, ground: { kind: 'deck', tint: '#c89a6a', none: true }, water: { col: '#2a7ab0', deep: '#0e4a7a', y: -1.6, all: true }, kit: 'deck', style: 'wangboat' },
    hengchun: { sky: { zen: '#5a9ae0', hor: '#e0eef4', low: '#c0d0c8', sun: { az: -30, el: 45, size: 1.5 }, clouds: 0.5, cloudCol: '#ffffff' }, fog: ['#d8e8ec', 40, 160], light: { sun: '#fff4e0', si: 2.6, hemi: ['#c0d8f0', '#5a6a3a', 1.1], unit: '#ffffff' }, ground: { kind: 'tallgrass', tint: '#a8b860' }, ridges: [{ r: 170, h: 14, col: '#8aa0a8', rough: 0.5 }], kit: 'grassland', motes: 'wind' },
    cape: { sky: { zen: '#040814', hor: '#1a2a40', low: '#0a1420', moon: { az: 55, el: 30, size: 1.4 }, stars: 1, clouds: 0.15 }, fog: ['#142236', 30, 140], light: { sun: '#a0b8ff', si: 0.9, hemi: ['#3a5a7a', '#141a10', 0.7], unit: '#b0c0d8', lamps: [{ x: -16, y: 9, z: -16, col: '#fff0c0', i: 12, d: 30 }] }, ground: { kind: 'tallgrass', tint: '#3a5a3a' }, water: { col: '#101e30', deep: '#040a14', y: -6, z: -14 }, kit: 'cape', night: 1, post: { bloom: 0.85, threshold: 0.6 }, motes: 'wind' },
    orchid: { sky: { zen: '#2a7ae0', hor: '#c8e4f4', low: '#a0c8d8', sun: { az: 0, el: 48, size: 1.5 }, clouds: 0.4, cloudCol: '#ffffff' }, fog: ['#c8e0ee', 40, 170], light: { sun: '#fff8e8', si: 2.9, hemi: ['#b8d8f8', '#6a6a6a', 1.1], unit: '#ffffff' }, ground: { kind: 'gravel', tint: '#a8a8a8' }, water: { col: '#1a6ab0', deep: '#0a3a7a', y: -0.4, z: -9 }, kit: 'beach', style: 'orchid', post: { sat: 1.1 } },
    eastcoast: { sky: { zen: '#3a8ae0', hor: '#e8f4f8', low: '#c0d8e0', sun: { az: -5, el: 18, size: 2.4, col: '#fffae8' }, clouds: 0.3, cloudCol: '#ffffff' }, fog: ['#d8e8f0', 40, 170], light: { sun: '#fff4e0', si: 2.8, hemi: ['#c0d8f0', '#7a7060', 1.1], unit: '#ffffff' }, ground: { kind: 'sand', tint: '#c8b8a0' }, water: { col: '#2a7ac0', deep: '#0e4a8a', y: -0.4, z: -9 }, ridges: [{ r: 150, h: 34, col: '#3a6a4a', rough: 0.6, arc: [50, 130] }], kit: 'beach', style: 'eastcoast' },
    taroko: { sky: { zen: '#8ac0e8', hor: '#e8f0f4', low: '#c8d8e0', sun: { az: -10, el: 55, size: 1.4 }, clouds: 0.3, cloudCol: '#ffffff' }, fog: ['#d8e4ea', 26, 120], light: { sun: '#fff8ec', si: 2.4, hemi: ['#d0e0f0', '#6a6a6a', 1.1], unit: '#ffffff' }, ground: { kind: 'gravel', tint: '#c8c8c8' }, water: { col: '#4ac8c8', deep: '#1a8a9a', y: -0.4, z: -9, river: true }, kit: 'gorge' },
    toucheng: { sky: { zen: '#04060e', hor: '#1a1a2a', low: '#0a0a14', stars: 0.9, clouds: 0.1 }, fog: ['#1a1418', 24, 110], light: { sun: '#ffb070', si: 0.7, hemi: ['#5a4a5a', '#2a1a10', 0.7], unit: '#e0c8b0', lamps: [{ x: 0, y: 6, z: -14, col: '#ffc060', i: 12, d: 22 }, { x: -9, y: 2.5, z: -6, col: '#ff9a40', i: 5, d: 12 }, { x: 9, y: 2.5, z: -6, col: '#ff9a40', i: 5, d: 12 }] }, ground: { kind: 'dirt', tint: '#6a5040' }, kit: 'festival', night: 1, post: { bloom: 1.0, threshold: 0.55 } },
    penghu: { sky: { zen: '#3a8ae8', hor: '#d8f0f8', low: '#a8d8e0', sun: { az: 30, el: 50, size: 1.5 }, clouds: 0.45, cloudCol: '#ffffff' }, fog: ['#d0ecf4', 40, 170], light: { sun: '#fff8ec', si: 2.9, hemi: ['#c0e0f8', '#5a5a60', 1.1], unit: '#ffffff' }, ground: { kind: 'hexbasalt', tint: '#7a7a80' }, water: { col: '#3ac0c8', deep: '#1a7aa0', y: -0.4, z: -9 }, kit: 'basalt' },
    xuanwu: { sky: { zen: '#04060e', hor: '#1a2a4a', low: '#0a0e1a', clouds: 0.7, cloudCol: '#141c30', stars: 0.2 }, fog: ['#141e34', 22, 110], light: { sun: '#6a9aff', si: 0.8, hemi: ['#3a5a9a', '#0a0a14', 0.7], unit: '#a8b8e0', lamps: [{ x: -6, y: 2.4, z: -8, col: '#4a9aff', i: 7, d: 12 }, { x: 6, y: 2.4, z: -8, col: '#4a9aff', i: 7, d: 12 }, { x: 0, y: 6, z: -22, col: '#6ab8ff', i: 10, d: 24 }] }, ground: { kind: 'hexbasalt', tint: '#5a6278' }, kit: 'xuanwu', night: 1, post: { bloom: 0.95, threshold: 0.55 }, motes: 'souls' },
  };
  A.THEMES = T;
  A.ids = () => Object.keys(T);

  // ------------------------------------------------------------------------------------------ ground textures
  function groundTex(kind) {
    const P = PAINT[kind] || PAINT.dirt;
    const tx = G.R3M.tex('b3d_ground_' + kind, 512, 512, (g, w, h) => { const r = U.seeded(hashS(kind)); P(g, w, h, r); }, { wrap: true });
    return tx;
  }
  function hashS(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function speck(g, w, h, r, n, cols, s0, s1, a) { for (let i = 0; i < n; i++) { g.fillStyle = cols[(r() * cols.length) | 0]; g.globalAlpha = a * (0.5 + r() * 0.5); const s = s0 + r() * (s1 - s0); g.beginPath(); g.ellipse(r() * w, r() * h, s, s * (0.5 + r() * 0.5), r() * 3, 0, TAU); g.fill(); } g.globalAlpha = 1; }
  function noiseFill(g, w, h, r, base, var1, var2) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // tileable blotches (wrapped)
    for (let i = 0; i < 160; i++) {
      const x = r() * w, y = r() * h, rr = 20 + r() * 70, c = r() < 0.5 ? var1 : var2;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr); gr.addColorStop(0, U.rgba(c, 0.18)); gr.addColorStop(1, U.rgba(c, 0)); g.fillStyle = gr; g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2); }
    }
  }
  function tileGrid(g, w, h, r, nx, ny, base, joint, jitter, offsetRows) {
    const cw = w / nx, ch = h / ny;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const ox = offsetRows && j % 2 ? cw / 2 : 0;
      const x = i * cw + ox, y = j * ch;
      const v = (r() - 0.5) * jitter;
      g.fillStyle = U.shade(base, v);
      for (const dx of [0, -w]) { g.fillRect(x + dx + 1.5, y + 1.5, cw - 3, ch - 3); }
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 2, y + 2, cw - 4, 2);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 2, y + ch - 4, cw - 4, 2);
    }
    g.strokeStyle = joint; g.lineWidth = 3;
    for (let j = 0; j <= ny; j++) { g.beginPath(); g.moveTo(0, j * ch); g.lineTo(w, j * ch); g.stroke(); }
    for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) { const ox = offsetRows && j % 2 ? cw / 2 : 0; g.beginPath(); g.moveTo((i * cw + ox) % (w + 1), j * ch); g.lineTo((i * cw + ox) % (w + 1), (j + 1) * ch); g.stroke(); }
  }
  const PAINT = {
    sand: (g, w, h, r) => { noiseFill(g, w, h, r, '#c8b48e', '#e0d0a8', '#a89070'); speck(g, w, h, r, 900, ['#8a7458', '#f0e4c8', '#b09a78'], 0.6, 1.8, 0.5); for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(120,96,66,0.12)'; g.lineWidth = 3; g.beginPath(); const y = r() * h; g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 6); g.stroke(); } },
    rockshelf: (g, w, h, r) => { noiseFill(g, w, h, r, '#6a6a78', '#8a8898', '#3a3a48'); for (let i = 0; i < 60; i++) { g.fillStyle = U.rgba(r() < 0.5 ? '#c9b8a0' : '#1a1a24', 0.08 + r() * 0.08); g.beginPath(); g.ellipse(r() * w, r() * h, 30 + r() * 120, 2 + r() * 4, 0, 0, TAU); g.fill(); } speck(g, w, h, r, 500, ['#2a2a34', '#9a98a8'], 0.6, 2, 0.5); for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h, rx = 30 + r() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, rx); gr.addColorStop(0, 'rgba(70,100,150,0.7)'); gr.addColorStop(0.8, 'rgba(40,60,100,0.6)'); gr.addColorStop(1, 'rgba(40,60,100,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, rx * 0.6, r(), 0, TAU); g.fill(); } },
    grass: (g, w, h, r) => { noiseFill(g, w, h, r, '#5a7a3a', '#7a9a48', '#3a5a2a'); for (let i = 0; i < 4200; i++) { const x = r() * w, y = r() * h, l = 4 + r() * 8; g.strokeStyle = U.rgba(r() < 0.5 ? '#8aaa52' : '#3a5a24', 0.55); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y - l); g.stroke(); } },
    tallgrass: (g, w, h, r) => { PAINT.grass(g, w, h, r); speck(g, w, h, r, 300, ['#c8c880', '#e8e0a0'], 0.8, 2, 0.4); },
    forestfloor: (g, w, h, r) => { noiseFill(g, w, h, r, '#4a5a32', '#6a7a40', '#2a3220'); speck(g, w, h, r, 700, ['#7a6a3a', '#5a4a2a', '#8a9a50', '#3a4a22'], 1.5, 5, 0.6); for (let i = 0; i < 1500; i++) { const x = r() * w, y = r() * h; g.strokeStyle = U.rgba('#7a9a4a', 0.4); g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 5); g.stroke(); } },
    moss: (g, w, h, r) => { noiseFill(g, w, h, r, '#2a2a4a', '#3a3a6a', '#1a1a30'); speck(g, w, h, r, 900, ['#4a5a9a', '#2a3a5a', '#6a4a9a'], 1, 4, 0.5); speck(g, w, h, r, 120, ['#5affd8', '#ff5af0'], 0.6, 1.4, 0.6); },
    pavers: (g, w, h, r) => { g.fillStyle = '#5a5048'; g.fillRect(0, 0, w, h); tileGrid(g, w, h, r, 4, 8, '#a89c8c', '#4a4038', 0.22, true); speck(g, w, h, r, 900, ['#3a342e', '#d0c4b0'], 0.5, 1.6, 0.35); noiseFillOver(g, w, h, r); },
    stonetile: (g, w, h, r) => { g.fillStyle = '#3a3a40'; g.fillRect(0, 0, w, h); tileGrid(g, w, h, r, 4, 4, '#8a8a92', '#2a2a30', 0.25, false); speck(g, w, h, r, 700, ['#2a2a30', '#b0b0b8'], 0.5, 1.6, 0.35); noiseFillOver(g, w, h, r); },
    darktile: (g, w, h, r) => { g.fillStyle = '#0a0e1a'; g.fillRect(0, 0, w, h); tileGrid(g, w, h, r, 4, 4, '#3a4660', '#0a0c14', 0.15, false); g.strokeStyle = 'rgba(120,160,255,0.25)'; g.lineWidth = 1; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); } },
    redbrick: (g, w, h, r) => { g.fillStyle = '#7a4a3a'; g.fillRect(0, 0, w, h); tileGrid(g, w, h, r, 8, 16, '#c87a5a', '#8a5a48', 0.25, true); speck(g, w, h, r, 600, ['#5a3020', '#e8a888'], 0.5, 1.4, 0.3); },
    planks: (g, w, h, r) => { const n = 8; for (let i = 0; i < n; i++) { const y = i * h / n; g.fillStyle = U.shade('#7a6048', (r() - 0.5) * 0.25); g.fillRect(0, y, w, h / n); for (let k = 0; k < 30; k++) { g.strokeStyle = U.rgba('#3a2a1a', 0.18); g.lineWidth = 1; g.beginPath(); const yy = y + r() * h / n; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + (r() - 0.5) * 6, w * 0.6, yy + (r() - 0.5) * 6, w, yy); g.stroke(); } g.fillStyle = '#2a1e14'; g.fillRect(0, y, w, 3); for (const x of [r() * w, r() * w]) { g.fillStyle = '#3a2a1e'; g.fillRect(x, y, 3, h / n); g.fillStyle = '#9a9aa0'; g.fillRect(x - 6, y + h / n * 0.3, 3, 3); g.fillRect(x - 6, y + h / n * 0.7, 3, 3); } } },
    deck: (g, w, h, r) => { PAINT.planks(g, w, h, r); },
    boardwalk: (g, w, h, r) => { PAINT.planks(g, w, h, r); },
    cavefloor: (g, w, h, r) => { noiseFill(g, w, h, r, '#4a4038', '#6a5a4a', '#2a2420'); speck(g, w, h, r, 1200, ['#2a241e', '#7a6a58', '#5a4a3a'], 1, 6, 0.55); for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(20,16,12,0.4)'; g.lineWidth = 2; g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } },
    dirt: (g, w, h, r) => { noiseFill(g, w, h, r, '#9a8060', '#b89a74', '#6a5640'); speck(g, w, h, r, 1400, ['#5a4a36', '#c8b088', '#7a6448'], 0.6, 2.4, 0.5); },
    gravel: (g, w, h, r) => { noiseFill(g, w, h, r, '#8a8a8a', '#a8a8a8', '#5a5a5a'); for (let i = 0; i < 2600; i++) { const s = 1.5 + r() * 4; g.fillStyle = U.shade('#909090', (r() - 0.5) * 0.6); g.beginPath(); g.ellipse(r() * w, r() * h, s, s * 0.7, r() * 3, 0, TAU); g.fill(); g.fillStyle = 'rgba(0,0,0,0.25)'; } },
    scree: (g, w, h, r) => { noiseFill(g, w, h, r, '#4a4a54', '#5a5a66', '#2a2a32'); for (let i = 0; i < 1500; i++) { const s = 2 + r() * 7; g.fillStyle = U.shade('#5a5a66', (r() - 0.5) * 0.6); g.beginPath(); g.moveTo(r() * w, r() * h); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + s, y + s * 0.3); g.lineTo(x + s * 0.4, y + s); g.closePath(); g.fill(); } },
    slate: (g, w, h, r) => { g.fillStyle = '#2a2a30'; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, s = 30 + r() * 50; g.fillStyle = U.shade('#5a5a62', (r() - 0.5) * 0.4); g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + r() * 0.5; g.lineTo(x + Math.cos(a) * s * (0.7 + r() * 0.3), y + Math.sin(a) * s * 0.6 * (0.7 + r() * 0.3)); } g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2; g.stroke(); } },
    hexbasalt: (g, w, h, r) => { g.fillStyle = '#1a1a20'; g.fillRect(0, 0, w, h); const s = w / 8, hh = s * Math.sqrt(3) / 2; for (let j = -1; j < h / hh + 1; j++) for (let i = -1; i < 9; i++) { const x = i * s * 1.5 / 1.5 * 1 + (j % 2 ? s / 2 : 0), y = j * hh; g.fillStyle = U.shade('#5a5a64', (r() - 0.5) * 0.35); g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.PI / 6; g.lineTo(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55); } g.closePath(); g.fill(); g.strokeStyle = '#141418'; g.lineWidth = 3; g.stroke(); } speck(g, w, h, r, 500, ['#2a2a30', '#8a8a94'], 0.5, 1.4, 0.35); },
    mossystone: (g, w, h, r) => { PAINT.pavers(g, w, h, r); g.globalAlpha = 0.5; noiseFillOver(g, w, h, r, '#3a5a3a'); g.globalAlpha = 1; },
    ash: (g, w, h, r) => { noiseFill(g, w, h, r, '#3a2a26', '#5a3a2e', '#1a1210'); speck(g, w, h, r, 900, ['#1a1210', '#6a4a3a'], 1, 4, 0.5); speck(g, w, h, r, 160, ['#ff6a2a', '#ffa040'], 0.5, 1.4, 0.7); },
    lilyfield: (g, w, h, r) => { noiseFill(g, w, h, r, '#2a1418', '#4a1a1a', '#140a0c'); for (let i = 0; i < 380; i++) { const x = r() * w, y = r() * h; g.strokeStyle = U.rgba('#ff3a2a', 0.8); g.lineWidth = 1.2; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5 - 3, x + Math.cos(a) * 7, y + Math.sin(a) * 7 - 4); g.stroke(); } } },
    shrinefloor: (g, w, h, r) => { g.fillStyle = '#0a2a24'; g.fillRect(0, 0, w, h); tileGrid(g, w, h, r, 4, 4, '#2a5a50', '#06201a', 0.2, false); speck(g, w, h, r, 300, ['#4a8a7a'], 0.5, 1.5, 0.3); },
    psyfloor: (g, w, h, r) => { g.fillStyle = '#1a0a3a'; g.fillRect(0, 0, w, h); const s = w / 8; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { g.fillStyle = (i + j) % 2 ? '#3a1a6a' : '#2a1050'; g.beginPath(); g.moveTo(i * s + s / 2, j * s); g.lineTo(i * s + s, j * s + s / 2); g.lineTo(i * s + s / 2, j * s + s); g.lineTo(i * s, j * s + s / 2); g.closePath(); g.fill(); g.strokeStyle = 'rgba(120,255,220,0.35)'; g.lineWidth = 1.5; g.stroke(); } },
    mandala: (g, w, h, r) => { const cols = ['#ff6ad5', '#ffd06a', '#7af0ff', '#b6ff6a', '#a08aff']; g.fillStyle = '#2a0a3a'; g.fillRect(0, 0, w, h); const s = w / 4; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const cx = i * s + s / 2, cy = j * s + s / 2; for (let k = 6; k > 0; k--) { g.fillStyle = cols[(k + i + j) % 5]; g.globalAlpha = 0.85; g.beginPath(); for (let q = 0; q < 16; q++) { const a = q / 16 * TAU, rr = (q % 2 ? 0.55 : 1) * k / 6 * s * 0.5; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); } } g.globalAlpha = 1; },
  };
  // facade textures (white-based so materials tint them)
  PAINT.plaster = (g, w, h, r) => { noiseFill(g, w, h, r, '#e8e4dc', '#ffffff', '#c8c0b0'); for (let i = 0; i < 14; i++) { const x = r() * w; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(90,80,60,0)'); gr.addColorStop(1, 'rgba(90,80,60,0.18)'); g.fillStyle = gr; g.fillRect(x, h * 0.5 + r() * h * 0.3, 6 + r() * 20, h); } speck(g, w, h, r, 400, ['#b8b0a0', '#ffffff'], 0.5, 1.5, 0.4); g.fillStyle = 'rgba(70,60,50,0.25)'; g.fillRect(0, h - 26, w, 26); };
  PAINT.woodwall = (g, w, h, r) => { const n = 10; for (let i = 0; i < n; i++) { const x = i * w / n; g.fillStyle = U.shade('#d8c8b0', (r() - 0.5) * 0.25); g.fillRect(x, 0, w / n, h); for (let k = 0; k < 12; k++) { g.strokeStyle = 'rgba(70,50,30,0.2)'; g.lineWidth = 1; g.beginPath(); const xx = x + r() * w / n; g.moveTo(xx, 0); g.lineTo(xx + (r() - 0.5) * 6, h); g.stroke(); } g.fillStyle = 'rgba(40,28,18,0.5)'; g.fillRect(x, 0, 2, h); } g.fillStyle = 'rgba(40,28,18,0.6)'; g.fillRect(0, h * 0.48, w, 8); };
  PAINT.rooftile = (g, w, h, r) => { g.fillStyle = '#a0a0a8'; g.fillRect(0, 0, w, h); const n = 16; for (let i = 0; i < n; i++) { const x = i * w / n; const gr = g.createLinearGradient(x, 0, x + w / n, 0); gr.addColorStop(0, '#6a6a72'); gr.addColorStop(0.5, '#e0e0e8'); gr.addColorStop(1, '#5a5a62'); g.fillStyle = gr; g.fillRect(x, 0, w / n, h); } for (let j = 0; j < 16; j++) { g.fillStyle = 'rgba(30,30,36,0.35)'; g.fillRect(0, j * h / 16, w, 3); } speck(g, w, h, r, 300, ['#505058', '#f0f0f8'], 0.6, 1.6, 0.3); };
  PAINT.marble = (g, w, h, r) => { noiseFill(g, w, h, r, '#d8d8d4', '#f0f0ec', '#a8a8a4'); for (let i = 0; i < 40; i++) { g.strokeStyle = U.rgba(r() < 0.6 ? '#5a5a58' : '#8a8a86', 0.25 + r() * 0.3); g.lineWidth = 1 + r() * 3; g.beginPath(); let x = r() * w, y = 0; g.moveTo(x, y); while (y < h) { y += 8 + r() * 14; x += (r() - 0.5) * 18; g.lineTo(x, y); } g.stroke(); } for (let j = 0; j < 30; j++) { g.fillStyle = 'rgba(80,80,76,0.12)'; g.fillRect(0, r() * h, w, 1 + r() * 3); } };
  PAINT.brick = (g, w, h, r) => { g.fillStyle = '#b8b0a8'; g.fillRect(0, 0, w, h); tileGrid(g, w, h, r, 6, 16, '#f0e8e0', '#a8a098', 0.2, true); };
  function noiseFillOver(g, w, h, r, col = '#000000') { for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * h, rr = 30 + r() * 80; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, U.rgba(col, 0.12)); gr.addColorStop(1, U.rgba(col, 0)); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); } }

  // ------------------------------------------------------------------------------------------ sky dome
  const SKY_VS = 'varying vec3 vP; void main(){ vP = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
  const SKY_FS = `
    uniform vec3 zen, hor, low, sunDir, sunCol, cloudCol; uniform float sunSize, stars, clouds, time, moon, milky, eclipse, psy;
    varying vec3 vP;
    float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = h31(vec3(i, 1.0)), b = h31(vec3(i + vec2(1, 0), 1.0)), c = h31(vec3(i + vec2(0, 1), 1.0)), d = h31(vec3(i + vec2(1, 1), 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
    void main(){
      vec3 d = normalize(vP);
      float y = d.y;
      vec3 c = y > 0.0 ? mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.48)) : mix(hor, low, clamp(-y * 5.0, 0.0, 1.0));
      // psychedelic skies (spirit realms)
      if (psy > 0.5) {
        float a = atan(d.z, d.x), r = acos(clamp(y, -1.0, 1.0));
        float k = sin(a * (psy > 1.5 ? 12.0 : 6.0) + time * 0.4) * sin(r * 18.0 - time * 0.7);
        vec3 p1 = vec3(1.0, 0.42, 0.84), p2 = vec3(0.48, 0.94, 1.0), p3 = vec3(1.0, 0.82, 0.42);
        vec3 pc = mix(mix(p1, p2, 0.5 + 0.5 * sin(a * 3.0 + time * 0.3)), p3, 0.5 + 0.5 * k);
        c = mix(c, pc * (0.25 + 0.25 * max(y, 0.0)), 0.55);
      }
      // stars + milky way
      if (stars > 0.01 && y > 0.0) {
        vec3 q = floor(d * 300.0);
        float s = step(0.9972, h31(q)) * (0.6 + 0.4 * sin(time * 2.0 + h31(q + 3.0) * 40.0));
        float mw = milky * exp(-pow(dot(d, normalize(vec3(0.5, 0.3, -0.8))) * 3.2, 2.0)) * fbm(d.xz * 9.0 + d.y * 4.0);
        s += step(0.9935, h31(floor(d * 520.0))) * milky * mw * 2.0;
        c += vec3(0.85, 0.9, 1.0) * (s * stars * smoothstep(0.0, 0.25, y)) + vec3(0.55, 0.6, 0.8) * mw * 0.35 * stars;
      }
      // sun / moon
      float sd = dot(d, normalize(sunDir));
      float cs = cos(radians(sunSize));
      float disc = smoothstep(cs - 0.0004, cs + 0.0004, sd);
      if (moon > 0.5) {
        vec3 mc = sunCol * 1.6;
        float cr = n2(vec2(atan(d.z, d.x), d.y) * 160.0);
        c = mix(c, mc * (0.82 + 0.18 * cr), disc);
        c += sunCol * (pow(max(sd, 0.0), 300.0) * 0.6 + pow(max(sd, 0.0), 24.0) * 0.12);
      } else if (eclipse > 0.5) {
        float ring = smoothstep(cs - 0.0008, cs, sd) * (1.0 - smoothstep(cs + 0.0002, cs + 0.0012, sd));
        c = mix(c, vec3(0.0), disc);
        c += sunCol * ring * 6.0 + vec3(1.0, 0.5, 0.7) * pow(max(sd, 0.0), 60.0) * 0.5;
      } else {
        c = mix(c, sunCol * 6.0, disc);
        c += sunCol * (pow(max(sd, 0.0), 180.0) * 1.5 + pow(max(sd, 0.0), 10.0) * 0.25);
      }
      // clouds: two drifting fbm layers projected onto a dome
      if (clouds > 0.01 && y > -0.02) {
        vec2 uv = d.xz / (y + 0.18);
        float n = fbm(uv * 0.55 + vec2(time * 0.006, 0.0));
        float n3 = fbm(uv * 1.4 - vec2(time * 0.01, time * 0.004));
        float cov = smoothstep(1.0 - clouds * 0.9, 1.15 - clouds * 0.6, n * 0.8 + n3 * 0.35);
        float lit = clamp(0.55 + (n - n3) * 1.2 + max(sd, 0.0) * 0.6, 0.0, 1.4);
        vec3 cc = mix(cloudCol * 0.55, cloudCol, lit) + sunCol * pow(max(sd, 0.0), 6.0) * 0.4 * (1.0 - moon);
        c = mix(c, cc, cov * smoothstep(-0.02, 0.12, y) * 0.92);
      }
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  function dirFromAzEl(az, el) { // az 0 → −z, 90 → −x
    const a = az * Math.PI / 180, e = el * Math.PI / 180;
    return new THREE.Vector3(-Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  }

  // ------------------------------------------------------------------------------------------ water
  const WATER_VS = `varying vec3 vW; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
  const WATER_FS = `
    uniform vec3 uCol, uDeep, uSky, uSun, uSunDir, uFog; uniform float uTime, uShore, uFogNear, uFogFar, uClear, uRiver; uniform sampler2D uNoise;
    varying vec3 vW; varying vec3 vV;
    void main(){
      vec2 p = vW.xz;
      float n1 = texture2D(uNoise, p * 0.035 + vec2(uTime * 0.01, uTime * 0.006 + uRiver * uTime * 0.05)).r;
      float n2 = texture2D(uNoise, p * 0.08 - vec2(uTime * 0.008, -uTime * 0.012 - uRiver * uTime * 0.08)).r;
      vec3 N = normalize(vec3((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.25, 1.0, (n2 - 0.5) * 0.35 - (n1 - 0.5) * 0.2));
      vec3 V = normalize(vV);
      vec3 Vw = normalize(cameraPosition - vW);
      float fr = pow(1.0 - clamp(dot(N, Vw), 0.0, 1.0), 4.0);
      vec3 base = mix(uCol, uDeep, clamp((uShore - vW.z) * 0.06, 0.0, 1.0));
      vec3 c = mix(base, uSky, 0.15 + fr * 0.75);
      vec3 R = reflect(-Vw, N);
      float sp = pow(max(dot(R, normalize(uSunDir)), 0.0), 220.0);
      float gl = pow(max(dot(R, normalize(uSunDir)), 0.0), 18.0);
      c += uSun * (sp * 2.6 + gl * 0.12);
      // shore foam
      float f = smoothstep(1.2, 0.0, abs(vW.z - uShore) + (n1 - 0.5) * 1.6) * (1.0 - uClear);
      f *= 0.5 + 0.5 * sin(uTime * 1.3 + vW.x * 0.4 + n2 * 6.0);
      c = mix(c, vec3(0.92, 0.96, 1.0) * max(0.4, dot(uSky, vec3(0.33)) * 2.0), f * 0.6);
      float fogF = smoothstep(uFogNear, uFogFar, length(vV));
      c = mix(c, uFog, fogF);
      gl_FragColor = vec4(c, mix(1.0, 0.55 + fr * 0.4, uClear));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;

  // ------------------------------------------------------------------------------------------ build
  A.build = function (view, bg) {
    const TT = THREE;
    const th = T[bg] || autoTheme(bg);
    const scene = view.scene;
    const lite = view.lite;
    const out = { group: new TT.Group(), updaters: [], theme: th, lamps: [], disposables: [], models: [] };
    scene.add(out.group);
    const sky = th.sky;
    const fogC = C(th.fog ? th.fog[0] : (sky ? sky.hor : '#000000'));
    scene.fog = new TT.Fog(fogC, th.fog ? th.fog[1] : 30, th.fog ? th.fog[2] : 140);
    scene.background = th.bg ? C(th.bg) : fogC.clone();
    out.fogColor = fogC;
    // --- sky
    const sunDir = th.light && th.light.sunDir ? new TT.Vector3(...th.light.sunDir).normalize() : (sky && (sky.sun || sky.moon) ? dirFromAzEl((sky.sun || sky.moon).az, Math.max(12, (sky.sun || sky.moon).el)) : new TT.Vector3(0.4, 1, 0.3).normalize());
    if (sky) {
      const body = sky.sun || sky.moon;
      const bodyDir = body ? dirFromAzEl(body.az, body.el) : new TT.Vector3(0, -1, 0);
      const su = {
        zen: { value: C(sky.zen) }, hor: { value: C(sky.hor) }, low: { value: C(sky.low || sky.hor) }, sunDir: { value: bodyDir },
        sunCol: { value: C(body ? (body.col || (sky.moon ? '#f4f0e0' : '#fff4d8')) : '#000000') }, sunSize: { value: body ? body.size || 1.6 : 0.1 },
        stars: { value: sky.stars || 0 }, clouds: { value: sky.clouds || 0 }, cloudCol: { value: C(sky.cloudCol || '#ffffff') }, time: { value: 0 },
        moon: { value: sky.moon ? 1 : 0 }, milky: { value: sky.milky || 0 }, eclipse: { value: body && body.eclipse ? 1 : 0 }, psy: { value: sky.psy || 0 },
      };
      const dome = new TT.Mesh(new TT.SphereGeometry(400, 48, 24), new TT.ShaderMaterial({ uniforms: su, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: TT.BackSide, depthWrite: false, fog: false }));
      dome.renderOrder = -100; dome.frustumCulled = false;
      out.group.add(dome);
      out.sky = dome; out.skyU = su;
      out.updaters.push((dt, t) => { su.time.value = t; });
    }
    // --- lights
    const L = th.light || {};
    // night / interior arenas: keep the stage readable (the dark mood comes from sky, fog and grading)
    const nightLift = th.night ? 1.75 : 1;
    const hemi = new TT.HemisphereLight(C((L.hemi || [])[0] || '#ffffff'), C((L.hemi || [])[1] || '#404040').lerp(C((L.hemi || [])[0] || '#ffffff'), th.night ? 0.35 : 0), ((L.hemi || [])[2] != null ? L.hemi[2] : 1) * nightLift);
    out.group.add(hemi); out.hemi = hemi;
    const sun = new TT.DirectionalLight(C(L.sun || '#ffffff'), Math.max(th.night ? 1.3 : 0, L.si != null ? L.si : 2));
    sun.position.copy(sunDir).multiplyScalar(40); sun.target.position.set(0, 0, 0);
    sun.castShadow = !lite;
    if (!lite) {
      const q = G.settings.quality || 'high';
      const s = q === 'ultra' ? 4096 : q === 'low' ? 1024 : 2048;
      sun.shadow.mapSize.set(s, s);
      const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 100;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    }
    out.group.add(sun, sun.target); out.sun = sun;
    const base = { hemi: hemi.intensity, sun: sun.intensity };
    // IBL from the sky gradient
    try {
      const pm = new TT.PMREMGenerator(G.R3.renderer);
      const es = new TT.Scene();
      const eg = new TT.Mesh(new TT.SphereGeometry(10, 24, 12), new TT.MeshBasicMaterial({ side: TT.BackSide, vertexColors: true }));
      const pos = eg.geometry.attributes.position, cols = new Float32Array(pos.count * 3);
      const zc = C(sky ? sky.zen : (th.bg || '#202020')), hc = C(sky ? sky.hor : (th.fog ? th.fog[0] : '#202020')), gc = C((L.hemi || [])[1] || '#303030');
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10; const c = y > 0 ? hc.clone().lerp(zc, Math.pow(y, 0.6)) : hc.clone().lerp(gc, Math.min(1, -y * 3)); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
      eg.geometry.setAttribute('color', new TT.BufferAttribute(cols, 3));
      es.add(eg);
      out.envRT = pm.fromScene(es, 0.04);
      scene.environment = out.envRT.texture;
      scene.environmentIntensity = th.night ? 0.6 : 0.6;
      pm.dispose(); eg.geometry.dispose(); eg.material.dispose();
    } catch (e) { G.warnOnce('b3d pmrem', e); }
    // lamps (fixed set of point lights) with halos
    for (const lp of L.lamps || []) {
      const pl = new TT.PointLight(C(lp.col), lp.i * 1.0, lp.d || 12, 1.6);
      pl.position.set(lp.x, lp.y, lp.z); pl.castShadow = false;
      out.group.add(pl);
      out.lamps.push({ pl, i0: pl.intensity, flick: lp.flick != null ? lp.flick : 0.15, ph: Math.random() * 10 });
    }
    out.updaters.push((dt, t) => { for (const l of out.lamps) l.pl.intensity = l.i0 * (out.lightMul || 1) * (1 - l.flick * 0.5 * (0.5 + 0.5 * Math.sin(t * 9 + l.ph) * Math.sin(t * 5.3 + l.ph * 2))); });
    // camera-side fill (keeps toon-shaded characters readable in night arenas; follows the camera, no shadows)
    const fill = new TT.DirectionalLight(C(L.fill || L.unit || '#ffffff'), L.fi != null ? L.fi : (th.night ? 0.9 : 0.45));
    fill.castShadow = false;
    out.group.add(fill, fill.target);
    out.fill = fill; base.fill = fill.intensity;
    out.lights = (k) => { out.lightMul = k; hemi.intensity = base.hemi * k; sun.intensity = base.sun * (0.4 + 0.6 * k); fill.intensity = base.fill * (0.5 + 0.5 * k); };
    // billboards (unlit) take the ambient tint of the place
    out.unitLight = C(L.unit || '#ffffff');
    out.lightK = th.night ? 1.2 : 0.8;
    // post
    const P = th.post || {};
    out.bloom = P.bloom != null ? P.bloom : (th.night ? 0.8 : 0.5);
    out.bloomThreshold = P.threshold != null ? P.threshold : (th.night ? 0.62 : 0.82);
    out.exposure = (P.exposure || 1) * (th.night ? 1.12 : 1);
    out.vignette = P.vignette != null ? P.vignette : (th.night ? 0.5 : 0.38);
    out.sat = P.sat || 1.06;
    out.warp = P.warp || 0;
    // --- builder kit
    const K = kit(out, th, view);
    out.K = K;
    // --- ground
    const kitFn = KITS[th.kit] || KITS.generic;
    if (kitFn.pre) kitFn.pre(th);
    buildGround(out, th, K);
    if (th.water) buildWater(out, th, K, sunDir);
    if (th.cloudsea) buildCloudSea(out, th, K);
    for (const r of th.ridges || []) buildRidge(out, th, r, K);
    // --- kit dressing
    try { kitFn(K, th, out); } catch (e) { G.warnOnce('b3d kit ' + th.kit, e); }
    if (th.motes) buildMotes(out, th, K);
    // static merge of non-animated dressing (big draw-call win)
    if (K.staticGroup.children.length) {
      const merged = G.R3.mergeStatic(K.staticGroup);
      merged.traverse((m) => { if (m.isMesh) { m.castShadow = !lite && m.castShadow; m.receiveShadow = true; } });
      out.group.add(merged);
      out.disposables.push(() => G.R3.dispose(merged));
      for (const m of K.staticGroup.children) { m.traverse((n) => { if (n.geometry) n.geometry.dispose(); }); }
    }
    out.update = (dt, t, v) => {
      for (const f of out.updaters) f(dt, t, v);
      for (const h of out.models) { const g = h.userData.gm; if (g && g.def && g.def.update) { try { g.def.update(g.node, g.o, t, dt); } catch (e) { G.warnOnce('b3d model upd ' + g.o.t, e); } } }
    };
    const _f = new TT.Vector3();
    out.follow = (cam) => {
      if (out.sky) out.sky.position.copy(cam.position);
      // fill from slightly above/right of the lens toward what it looks at
      cam.getWorldDirection(_f);
      fill.position.copy(cam.position).add(new TT.Vector3(0, 2.5, 0));
      fill.target.position.copy(cam.position).addScaledVector(_f, 10);
      fill.target.updateMatrixWorld();
    };
    out.dispose = () => { scene.remove(out.group); for (const h of out.models) if (h.parent) h.parent.remove(h); /* shared with the G.Models cache */ for (const d of out.disposables) d(); G.R3.dispose(out.group); if (out.envRT) out.envRT.dispose(); scene.environment = null; };
    return out;
  };

  function autoTheme(bg) {
    // unknown backdrop id: a neutral dusk field (keeps new content working until it gets a bespoke arena)
    return { sky: { zen: '#3a4a7a', hor: '#c8a8a0', low: '#6a5a5a', sun: { az: 10, el: 10, size: 2 }, clouds: 0.3 }, fog: ['#a08888', 30, 140], light: { sun: '#ffd8b0', si: 1.8, hemi: ['#c0b0c8', '#4a3a2a', 0.9], unit: '#fff0e8' }, ground: { kind: 'grass', tint: '#8a8a6a' }, ridges: [{ r: 170, h: 18, col: '#4a4a6a', rough: 0.6 }], kit: 'meadow' };
  }

  function groundHeight(th, x, z) {
    // flat stage, gentle rolling land beyond it
    const d = Math.max(Math.abs(x) / 13, Math.abs(z) / 7.5);
    const k = sm(1, 2.2, d);
    if (!k) return 0;
    const n = fbm(x * 0.05, z * 0.05, 3) - 0.45;
    const hill = (th.ground && th.ground.hills != null ? th.ground.hills : 1);
    return k * (n * 3.2 + Math.max(0, d - 1.6) * 0.8) * hill;
  }
  function buildGround(out, th, K) {
    const TT = THREE;
    if (th.ground && th.ground.none) return;
    const size = th.ground && th.ground.size || 300;
    const seg = out.theme.indoor ? 60 : 140;
    const geo = new TT.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const base = th.groundFn || ((x, z) => groundHeight(th, x, z));
    const W = th.water;
    const hf = (W && !W.all && W.z != null) ? (x, z) => { const y = base(x, z); return z < W.z + 4 ? Math.min(y, lerp(0, W.y - 0.6, sm(W.z + 4, W.z - 3, z))) : y; } : base;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = hf(x, z);
      pos.setY(i, y);
      const v = 0.82 + fbm(x * 0.13, z * 0.13, 5) * 0.32;
      cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new TT.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    // world-scale UVs: one texture tile ≈ 4 m
    const uv = geo.attributes.uv;
    const us = th.ground && th.ground.uvScale || 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / us, -pos.getZ(i) / us);
    const tex = groundTex(th.ground ? th.ground.kind : 'dirt');
    const mat = new TT.MeshStandardMaterial({ map: tex, color: C(th.ground && th.ground.tint || '#ffffff'), vertexColors: true, roughness: th.ground && /tile|deck|planks/.test(th.ground.kind) ? 0.55 : 0.92, metalness: 0, envMapIntensity: 0.6 });
    if (th.ground && th.ground.kind === 'darktile') { mat.roughness = 0.12; mat.metalness = 0.2; mat.envMapIntensity = 1.4; }
    const m = new TT.Mesh(geo, mat);
    m.receiveShadow = true;
    out.group.add(m);
    out.ground = m; out.groundH = hf;
    out.disposables.push(() => { geo.dispose(); mat.dispose(); });
  }
  function buildWater(out, th, K, sunDir) {
    const TT = THREE, W = th.water, sky = th.sky || {};
    const u = {
      uCol: { value: C(W.col) }, uDeep: { value: C(W.deep || W.col) }, uSky: { value: C(sky.hor || W.col).lerp(C(sky.zen || W.col), 0.25) }, uSun: { value: C((sky.sun || sky.moon || {}).col || (sky.moon ? '#f0f0ff' : '#fff4d8')).multiplyScalar(sky.sun || sky.moon ? 1 : 0.2) },
      uSunDir: { value: sky.sun || sky.moon ? dirFromAzEl((sky.sun || sky.moon).az, (sky.sun || sky.moon).el) : new TT.Vector3(0, 1, 0) },
      uFog: { value: out.fogColor }, uFogNear: { value: th.fog ? th.fog[1] : 30 }, uFogFar: { value: th.fog ? th.fog[2] * 1.2 : 160 }, uTime: { value: 0 },
      uShore: { value: W.all ? 999 : (W.z != null ? W.z : -9) }, uNoise: { value: out.K.noise }, uClear: { value: W.clear ? 1 : 0 }, uRiver: { value: W.river ? 1 : 0 },
    };
    const mat = new TT.ShaderMaterial({ uniforms: u, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: !!W.clear, depthWrite: !W.clear, fog: false });
    const geo = new TT.PlaneGeometry(800, 800, 1, 1); geo.rotateX(-Math.PI / 2);
    const m = new TT.Mesh(geo, mat);
    m.position.y = W.y != null ? W.y : -0.4;
    m.renderOrder = W.clear ? 5 : 0;
    out.group.add(m);
    out.water = m;
    out.updaters.push((dt, t) => { u.uTime.value = t; });
    out.disposables.push(() => { geo.dispose(); mat.dispose(); });
  }
  function buildCloudSea(out, th, K) {
    const TT = THREE;
    const tex = G.R3M.tex('b3d_cloudsea', 512, 512, (g, w, h) => { const r = U.seeded(77); g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const x = r() * w, y = r() * h, rr = 20 + r() * 60; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2); } } }, { wrap: true });
    const mat = new TT.MeshBasicMaterial({ map: tex, color: C(th.cloudsea), transparent: true, depthWrite: false, fog: false, opacity: 0.95 });
    tex.repeat.set(12, 12);
    const geo = new TT.RingGeometry(40, 320, 64, 1); geo.rotateX(-Math.PI / 2);
    const m = new TT.Mesh(geo, mat); m.position.y = -6; m.renderOrder = -50;
    out.group.add(m);
    out.updaters.push((dt) => { tex.offset.x += dt * 0.002; });
    out.disposables.push(() => { geo.dispose(); mat.dispose(); });
  }
  function buildRidge(out, th, r, K) {
    const TT = THREE;
    const N = 220, R = r.r || 160, H = r.h || 20;
    const a0 = r.arc ? r.arc[0] : -180, a1 = r.arc ? r.arc[1] : 180;
    const seed = hashS(th.kit + R) % 1000;
    const pos = [], col = [], idx = [];
    const top = C(r.col), haze = out.fogColor.clone(), snow = C('#e8eef8');
    for (let i = 0; i <= N; i++) {
      const az = lerp(a0, a1, i / N);
      const d = dirFromAzEl(az, 0);
      const t = i / N;
      let h = fbm(t * 9 * (r.rough || 0.6) * 2, seed, seed, 5);
      h = Math.pow(h, 1.6) * H * 2.2;
      if (r.arc) h *= sm(0, 0.12, t) * sm(1, 0.88, t);
      pos.push(d.x * R, -8, d.z * R, d.x * R, h, d.z * R);
      const tc = top.clone(); if (r.snow && h > H * r.snow * 1.6) tc.lerp(snow, 0.75);
      col.push(haze.r, haze.g, haze.b, tc.r, tc.g, tc.b);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new TT.BufferGeometry();
    geo.setAttribute('position', new TT.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new TT.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const mat = new TT.MeshBasicMaterial({ vertexColors: true, fog: false, side: TT.DoubleSide, depthWrite: true });
    const m = new TT.Mesh(geo, mat); m.renderOrder = -60; m.frustumCulled = false;
    out.group.add(m);
    out.disposables.push(() => { geo.dispose(); mat.dispose(); });
  }
  function buildMotes(out, th, K) {
    const TT = THREE;
    const kind = th.motes;
    const n = out.theme.indoor ? 120 : 220;
    const cfg = {
      pollen: { col: '#fff8d0', s: 0.06, rise: 0.05, drift: 0.2, glow: 1.2 }, spores: { col: '#8affe8', s: 0.08, rise: 0.15, drift: 0.15, glow: 2.2 },
      embers: { col: '#ff8a3a', s: 0.07, rise: 0.6, drift: 0.4, glow: 2.6 }, petals: { col: '#ff5a5a', s: 0.12, rise: -0.25, drift: 0.6, glow: 1.0 },
      wind: { col: '#e8f0ff', s: 0.04, rise: 0, drift: 2.2, glow: 0.8 }, souls: { col: '#6ab8ff', s: 0.1, rise: 0.3, drift: 0.2, glow: 2.4 },
    }[kind] || { col: '#ffffff', s: 0.05, rise: 0.1, drift: 0.2, glow: 1 };
    const geo = new TT.BufferGeometry();
    const p = new Float32Array(n * 3), seedA = new Float32Array(n);
    for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 36; p[i * 3 + 1] = Math.random() * 6; p[i * 3 + 2] = (Math.random() - 0.5) * 22; seedA[i] = Math.random() * 100; }
    geo.setAttribute('position', new TT.BufferAttribute(p, 3));
    const mat = new TT.PointsMaterial({ size: cfg.s * 3, map: G.R3M.glowTex(), color: C(cfg.col).multiplyScalar(cfg.glow), transparent: true, depthWrite: false, blending: TT.AdditiveBlending, sizeAttenuation: true, fog: false });
    const pts = new TT.Points(geo, mat); pts.frustumCulled = false;
    out.group.add(pts);
    out.updaters.push((dt, t) => {
      for (let i = 0; i < n; i++) {
        p[i * 3] += (cfg.drift + Math.sin(t * 0.7 + seedA[i]) * 0.3) * dt * (kind === 'wind' ? 1 : 0.5);
        p[i * 3 + 1] += (cfg.rise + Math.sin(t + seedA[i]) * 0.1) * dt;
        p[i * 3 + 2] += Math.cos(t * 0.5 + seedA[i]) * 0.15 * dt;
        if (p[i * 3] > 18) p[i * 3] -= 36; if (p[i * 3 + 1] > 6) p[i * 3 + 1] = 0; if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 6;
      }
      geo.attributes.position.needsUpdate = true;
    });
    out.disposables.push(() => { geo.dispose(); mat.dispose(); });
  }

  // ------------------------------------------------------------------------------------------ prop kit
  function kit(out, th, view) {
    const TT = THREE;
    const mats = new Map();
    const staticGroup = new TT.Group();
    const K = {
      out, th, view, T: TT, staticGroup, rng: U.seeded(hashS(th.kit || 'x') + 7),
      noise: view.noiseTex,
      r(a = 0, b = 1) { return a + (b - a) * K.rng(); },
      mat(color, o = {}) {
        const key = color + JSON.stringify(o);
        if (!mats.has(key)) { const m = new TT.MeshStandardMaterial(Object.assign({ color: C(color), roughness: 0.85, metalness: 0 }, o)); mats.set(key, m); out.disposables.push(() => m.dispose()); }
        return mats.get(key);
      },
      glow(color, k = 2.5) {
        const key = 'glow' + color + k;
        if (!mats.has(key)) { const m = new TT.MeshBasicMaterial({ color: C(color).multiplyScalar(k), toneMapped: true }); mats.set(key, m); out.disposables.push(() => m.dispose()); }
        return mats.get(key);
      },
      mesh(geo, mat, x = 0, y = 0, z = 0, o = {}) {
        const m = new TT.Mesh(geo, mat); m.position.set(x, y, z);
        if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
        if (o.s) { if (Array.isArray(o.s)) m.scale.set(...o.s); else m.scale.setScalar(o.s); }
        m.castShadow = o.cast !== false; m.receiveShadow = true;
        return m;
      },
      box(w, h, d, mat, x, y, z, o) { const g = new TT.BoxGeometry(w, h, d); if (mat.map) boxUV(g, w, h, d, (o && o.tile) || 2.5); return K.mesh(g, mat, x, (y || 0) + h / 2, z, o); },
      // tinted painted material (cached): kind ∈ plaster | woodwall | rooftile | brick | pavers | planks …
      tmat(kind, color, o = {}) { return K.mat(color, Object.assign({ map: groundTex(kind) }, o)); },
      cyl(rt, rb, h, mat, x, y, z, o = {}) { return K.mesh(new TT.CylinderGeometry(rt, rb, h, o.seg || 10), mat, x, (y || 0) + h / 2, z, o); },
      // put a finished object on the ground at (x, z) (static → merged; dynamic → kept)
      place(obj, x, z, o = {}) {
        const g = out.groundH ? out.groundH(x, z) : 0;
        obj.position.set(x, (o.y != null ? o.y : g) + (o.dy || 0), z);
        if (o.ry != null) obj.rotation.y = o.ry;
        if (o.s) obj.scale.setScalar(o.s);
        (o.dynamic ? out.group : staticGroup).add(obj);
        return obj;
      },
      group(...kids) { const g = new TT.Group(); for (const k of kids) if (k) g.add(k); return g; },
      // ring placement helper: n items on an ellipse outside the stage, avoiding the camera's front corridor
      ring(n, rx, rz, fn, o = {}) {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + K.r(-0.15, 0.15) + (o.phase || 0);
          const x = Math.sin(a) * rx * K.r(0.85, 1.25), z = -Math.cos(a) * rz * K.r(0.85, 1.25);
          if (!o.front && z > 4 && x > -6 && x < 14) continue;
          fn(x, z, i, a);
        }
      },
      lampHalo(x, y, z, col, s = 1) {
        const sp = new TT.Sprite(new TT.SpriteMaterial({ map: G.R3M.glowTex(), color: C(col).multiplyScalar(1.6), blending: TT.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
        sp.position.set(x, y, z); sp.scale.set(s * 1.6, s * 1.6, 1); sp.renderOrder = 10;
        out.group.add(sp);
        out.disposables.push(() => sp.material.dispose());
        return sp;
      },
    };
    return K;
  }
  A.kit = kit;

  // ------------------------------------------------------------------------------------------ props
  const PR = {};
  A.props = PR;
  PR.rock = (K, s = 1, cols = ['#6a6a72', '#4a4a52']) => {
    const TT = K.T;
    const geo = new TT.DodecahedronGeometry(1, 1);
    const p = geo.attributes.position;
    const sd = K.r(0, 100);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 0.75 + U.vnoise(x * 1.7 + sd, z * 1.7 + y, 3) * 0.5; p.setXYZ(i, x * n, Math.max(-0.2, y * n * 0.7), z * n); }
    geo.computeVertexNormals();
    const m = K.mesh(geo, K.mat(cols[(K.rng() * cols.length) | 0], { flatShading: true, roughness: 0.95 }), 0, 0, 0, { s: [s * K.r(0.8, 1.3), s * K.r(0.6, 1.0), s * K.r(0.8, 1.3)] });
    m.rotation.y = K.r(0, TAU);
    return m;
  };
  PR.pine = (K, h = 6, col = '#2a4a32') => {
    const TT = K.T, g = new TT.Group();
    g.add(K.cyl(0.12 * h / 6, 0.2 * h / 6, h * 0.35, K.mat('#4a3426'), 0, 0, 0));
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const k = i / tiers, r = (1 - k * 0.8) * h * 0.22, hh = h * 0.3;
      const cone = new TT.ConeGeometry(r, hh, 8, 1);
      const pp = cone.attributes.position; for (let j = 0; j < pp.count; j++) if (pp.getY(j) < 0) { pp.setX(j, pp.getX(j) * K.r(0.85, 1.15)); pp.setZ(j, pp.getZ(j) * K.r(0.85, 1.15)); pp.setY(j, pp.getY(j) + K.r(-0.1, 0.1)); }
      cone.computeVertexNormals();
      g.add(K.mesh(cone, K.mat(U.shade(col, (k - 0.5) * 0.25), { flatShading: true }), 0, h * 0.28 + k * h * 0.62 + hh / 2, 0));
    }
    return g;
  };
  PR.broadTree = (K, h = 5, cols = ['#3a6a32', '#4a7a3a', '#2a5a2a'], trunk = '#5a4030') => {
    const TT = K.T, g = new TT.Group();
    g.add(K.cyl(0.14 * h / 5, 0.24 * h / 5, h * 0.55, K.mat(trunk), 0, 0, 0));
    for (let i = 0; i < 6; i++) {
      const geo = new TT.IcosahedronGeometry(h * K.r(0.18, 0.28), 1);
      const pp = geo.attributes.position; for (let j = 0; j < pp.count; j++) { const f = 0.85 + U.vnoise(pp.getX(j) * 2 + i, pp.getY(j) * 2, 4) * 0.3; pp.setXYZ(j, pp.getX(j) * f, pp.getY(j) * f, pp.getZ(j) * f); }
      geo.computeVertexNormals();
      const a = i / 6 * TAU;
      g.add(K.mesh(geo, K.mat(cols[i % cols.length], { flatShading: true }), Math.cos(a) * h * 0.18, h * K.r(0.55, 0.8), Math.sin(a) * h * 0.18));
    }
    return g;
  };
  // painted frond (rib + leaflets) used by palms and tree ferns
  function frondTex(kind) {
    return G.R3M.tex('b3d_frond_' + kind, 256, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineCap = 'round';
      for (let i = 0; i < 46; i++) {
        const x = 8 + i * (w - 16) / 46, len = h * 0.46 * Math.sin(Math.PI * Math.min(1, (x / w) * 1.05 + 0.05));
        g.lineWidth = kind === 'fern' ? 2.2 : 3.2;
        for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(x, h / 2); g.quadraticCurveTo(x + 6, h / 2 + sg * len * 0.6, x + 12, h / 2 + sg * len); g.stroke(); }
      }
      g.lineWidth = 3; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    });
  }
  function frondGeo(len, wid, droop, seg = 8) {
    const g = new THREE.PlaneGeometry(len, wid, seg, 1);
    g.translate(len / 2, 0, 0);
    g.rotateX(-Math.PI / 2); // lie flat: x along the frond, z across
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / len; p.setY(i, (0.35 * x - droop * x * x) * len); }
    g.computeVertexNormals();
    return g;
  }
  PR.palm = (K, h = 6, lean = 0.2, col = '#3a7a3a') => {
    const TT = K.T, g = new TT.Group();
    const curve = new TT.QuadraticBezierCurve3(new TT.Vector3(0, 0, 0), new TT.Vector3(lean * h * 0.3, h * 0.5, 0), new TT.Vector3(lean * h, h, 0));
    g.add(K.mesh(new TT.TubeGeometry(curve, 10, 0.13, 6, false), K.mat('#7a6048'), 0, 0, 0));
    const top = curve.getPoint(1);
    const mat = K.mat(col, { map: frondTex('palm'), alphaTest: 0.5, side: TT.DoubleSide });
    for (let i = 0; i < 10; i++) {
      const m = K.mesh(frondGeo(h * 0.45, 0.9, 0.9 + (i % 3) * 0.2), mat, top.x, top.y, top.z);
      m.rotation.y = i / 10 * TAU + K.r(-0.15, 0.15);
      g.add(m);
    }
    return g;
  };
  PR.treeFern = (K, h = 3.2) => {
    const TT = K.T, g = new TT.Group();
    g.add(K.cyl(0.11, 0.16, h, K.mat('#3a3024'), 0, 0, 0));
    const mat = K.mat('#4a7a34', { map: frondTex('fern'), alphaTest: 0.5, side: TT.DoubleSide });
    for (let i = 0; i < 12; i++) { const m = K.mesh(frondGeo(h * 0.6, 0.7, 1.1), mat, 0, h, 0); m.rotation.y = i / 12 * TAU; g.add(m); }
    return g;
  };
 // volcanic sea-stack spire (蘭嶼 rocks): jagged tall cone, dark stone, mossy top
  PR.spire = (K, s = 3) => {
    const TT = K.T, g = new TT.Group();
    for (let i = 0; i < 3; i++) {
      const h = s * K.r(2.2, 3.4) * (i ? 0.6 : 1), r = s * K.r(0.5, 0.75) * (i ? 0.6 : 1);
      const geo = new TT.ConeGeometry(r, h, 7, 6);
      const p = geo.attributes.position;
      for (let j = 0; j < p.count; j++) { const y = p.getY(j) / h + 0.5; const n = 0.75 + U.vnoise(p.getX(j) * 2 + i * 7, p.getY(j) * 1.5, 5) * 0.5; p.setX(j, p.getX(j) * n); p.setZ(j, p.getZ(j) * n); if (y > 0.92) p.setY(j, p.getY(j) - K.r(0, 0.2) * h); }
      geo.computeVertexNormals(); geo.translate(0, h / 2, 0);
      g.add(K.mesh(geo, K.mat(i ? '#3a3a40' : '#2e2e34', { flatShading: true, roughness: 0.95 }), i ? K.r(-1, 1) * s * 0.6 : 0, 0, i ? K.r(-1, 1) * s * 0.4 : 0));
    }
    const moss = new TT.SphereGeometry(s * 0.35, 8, 5, 0, TAU, 0, Math.PI / 2); moss.scale(1, 0.4, 1);
    g.add(K.mesh(moss, K.mat('#4a6a3a', { flatShading: true }), 0, s * 2.0, 0));
    return g;
  };
  PR.pandanus = (K, h = 3.5) => {
    const TT = K.T, g = new TT.Group();
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; g.add(K.mesh(new TT.CylinderGeometry(0.03, 0.05, 1.0, 5), K.mat('#6a5a40'), Math.cos(a) * 0.3, 0.4, Math.sin(a) * 0.3, { rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35 })); }
    g.add(K.cyl(0.1, 0.13, h * 0.6, K.mat('#6a5a44'), 0, 0.6, 0));
    for (let c = 0; c < 3; c++) {
      const cx = (c - 1) * 0.5, cy = h * 0.6 + 0.4 + (c === 1 ? 0.4 : 0);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * TAU, l = 1.2;
        const leaf = new TT.PlaneGeometry(l, 0.12, 4, 1); leaf.translate(l / 2, 0, 0);
        const pp = leaf.attributes.position; for (let j = 0; j < pp.count; j++) { const x = pp.getX(j); pp.setY(j, pp.getY(j) - x * x * 0.5); }
        const m = K.mesh(leaf, K.mat('#4a6a3a', { side: TT.DoubleSide }), cx, cy, 0); m.rotation.set(0, a, -0.3 + Math.sin(i) * 0.3);
        g.add(m);
      }
    }
    return g;
  };
  PR.bamboo = (K, h = 7, n = 7) => {
    const TT = K.T, g = new TT.Group();
    for (let i = 0; i < n; i++) {
      const x = K.r(-0.8, 0.8), z = K.r(-0.8, 0.8), hh = h * K.r(0.7, 1.1);
      g.add(K.mesh(new TT.CylinderGeometry(0.05, 0.06, hh, 6), K.mat(K.rng() < 0.5 ? '#6a9a4a' : '#5a8a3a'), x, hh / 2, z, { rz: K.r(-0.06, 0.06) }));
      for (let k = 0; k < 4; k++) { const leaf = new TT.ConeGeometry(0.35, 1.0, 4, 1); g.add(K.mesh(leaf, K.mat('#5a9a48', { flatShading: true }), x + K.r(-0.3, 0.3), hh * K.r(0.55, 1), z + K.r(-0.3, 0.3), { rz: K.r(-1.4, 1.4), rx: K.r(-0.5, 0.5) })); }
    }
    return g;
  };
  PR.fern = (K, s = 1, col = '#4a7a3a') => {
    const TT = K.T, g = new TT.Group();
    for (let i = 0; i < 9; i++) {
      const leaf = new TT.PlaneGeometry(0.9 * s, 0.22 * s, 5, 1); leaf.translate(0.45 * s, 0, 0);
      const pp = leaf.attributes.position; for (let j = 0; j < pp.count; j++) { const x = pp.getX(j) / s; pp.setY(j, pp.getY(j) * (1 - x) + (0.4 - x * x * 0.7) * s); }
      leaf.computeVertexNormals();
      const m = K.mesh(leaf, K.mat(U.shade(col, K.r(-0.15, 0.1)), { side: TT.DoubleSide }), 0, 0.05, 0, { cast: false }); m.rotation.y = i / 9 * TAU + K.r(-0.2, 0.2); m.rotation.x = -Math.PI / 2 + 0.6;
      m.rotation.order = 'YXZ';
      g.add(m);
    }
    return g;
  };
  PR.grassField = (K, n, area, cols, h = 0.5, opts = {}) => {
    // instanced crossed blades with a wind sway in the vertex shader
    const TT = K.T, out = K.out;
    const blade = new TT.PlaneGeometry(0.12, h, 1, 3); blade.translate(0, h / 2, 0);
    const pp = blade.attributes.position; for (let j = 0; j < pp.count; j++) { const y = pp.getY(j) / h; pp.setX(j, pp.getX(j) * (1 - y * 0.9)); }
    const mat = new TT.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: TT.DoubleSide, vertexColors: false });
    const uT = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 iw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sway = sin(uT * 1.8 + iw.x * 0.6 + iw.z * 0.4) * 0.12 + sin(uT * 3.1 + iw.x) * 0.04;
          transformed.x += sway * position.y * position.y;`);
    };
    mat.customProgramCacheKey = () => 'b3dgrass';
    const im = new TT.InstancedMesh(blade, mat, n);
    const m4 = new TT.Matrix4(), q = new TT.Quaternion(), s = new TT.Vector3(), p = new TT.Vector3(), c = new TT.Color();
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const x = K.r(area[0], area[1]), z = K.r(area[2], area[3]);
      if (opts.clear && Math.abs(x) < opts.clear[0] && Math.abs(z) < opts.clear[1] && K.rng() > (opts.inside || 0)) continue;
      p.set(x, out.groundH ? out.groundH(x, z) : 0, z);
      q.setFromAxisAngle(new TT.Vector3(0, 1, 0), K.r(0, TAU));
      const sc = K.r(0.6, 1.3); s.set(sc, sc * K.r(0.7, 1.3), sc);
      m4.compose(p, q, s); im.setMatrixAt(k, m4);
      c.set(cols[(K.rng() * cols.length) | 0]).multiplyScalar(K.r(0.8, 1.15)); im.setColorAt(k, c);
      k++;
    }
    im.count = k;
    im.receiveShadow = true; im.castShadow = false;
    out.group.add(im);
    out.updaters.push((dt, t) => { uT.value = t; });
    out.disposables.push(() => { blade.dispose(); mat.dispose(); });
    return im;
  };
  PR.instances = (K, geo, mat, list, o = {}) => {
    const TT = K.T, out = K.out;
    const im = new TT.InstancedMesh(geo, mat, list.length);
    const m4 = new TT.Matrix4(), q = new TT.Quaternion(), s = new TT.Vector3(), p = new TT.Vector3();
    list.forEach((it, i) => { p.set(it.x, it.y != null ? it.y : (out.groundH ? out.groundH(it.x, it.z) : 0), it.z); q.setFromEuler(new TT.Euler(it.rx || 0, it.ry || 0, it.rz || 0)); s.setScalar(it.s || 1); if (it.sy) s.y *= it.sy; m4.compose(p, q, s); im.setMatrixAt(i, m4); if (it.c) im.setColorAt(i, C(it.c)); });
    im.castShadow = o.cast !== false && !K.view.lite; im.receiveShadow = true;
    out.group.add(im);
    out.disposables.push(() => { geo.dispose(); });
    return im;
  };
  PR.lantern = (K, col = '#e83a2a', s = 1, lit = true) => {
    const TT = K.T, g = new TT.Group();
    const body = new TT.SphereGeometry(0.22 * s, 12, 8); body.scale(1, 1.25, 1);
    g.add(K.mesh(body, lit ? K.glow(col, 1.6) : K.mat(col), 0, 0, 0, { cast: false }));
    const cap = K.mat('#2a1a10');
    g.add(K.mesh(new TT.CylinderGeometry(0.1 * s, 0.12 * s, 0.06 * s, 8), cap, 0, 0.28 * s, 0, { cast: false }));
    g.add(K.mesh(new TT.CylinderGeometry(0.12 * s, 0.1 * s, 0.06 * s, 8), cap, 0, -0.28 * s, 0, { cast: false }));
    g.add(K.mesh(new TT.CylinderGeometry(0.01, 0.01, 0.25 * s, 3), K.mat('#ffd060'), 0, -0.42 * s, 0, { cast: false }));
    return g;
  };
  // catenary string of lanterns between two points (dynamic: sways)
  PR.lanternString = (K, a, b, n, col = '#e83a2a', s = 0.8) => {
    const TT = K.T, g = new TT.Group(), pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; const p = new TT.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * a.distanceTo(b) * 0.08; pts.push(p); }
    const rope = new TT.Mesh(new TT.TubeGeometry(new TT.CatmullRomCurve3(pts), 24, 0.012, 3, false), K.mat('#2a2018'));
    g.add(rope);
    const items = [];
    for (let i = 1; i < n; i++) {
      const t = i / n; const p = new TT.Vector3().lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * a.distanceTo(b) * 0.08 + 0.3 * s;
      const l = PR.lantern(K, col, s); l.position.copy(p); g.add(l); items.push({ l, ph: K.r(0, TAU), y: p.y });
    }
    K.out.group.add(g);
    K.out.updaters.push((dt, t) => { for (const it of items) { it.l.rotation.z = Math.sin(t * 1.6 + it.ph) * 0.08; it.l.rotation.x = Math.sin(t * 1.1 + it.ph) * 0.05; } });
    K.out.disposables.push(() => g.traverse((n2) => n2.geometry && n2.geometry.dispose()));
    return g;
  };
  PR.lanternPost = (K, col = '#ffb060', h = 2.4) => {
    const TT = K.T, g = new TT.Group();
    g.add(K.box(0.3, 0.2, 0.3, K.mat('#5a5a5a'), 0, 0, 0));
    g.add(K.cyl(0.05, 0.06, h, K.mat('#3a2a1e'), 0, 0.2, 0));
    g.add(K.box(0.6, 0.05, 0.05, K.mat('#3a2a1e'), 0.2, h + 0.1, 0));
    const l = PR.lantern(K, col, 0.9); l.position.set(0.42, h - 0.25, 0); g.add(l);
    return g;
  };
  PR.stoneLantern = (K, s = 1, lit = '#ffc070') => {
    const TT = K.T, g = new TT.Group(), st = K.mat('#8a8680', { flatShading: true });
    g.add(K.box(0.6 * s, 0.25 * s, 0.6 * s, st, 0, 0, 0));
    g.add(K.cyl(0.12 * s, 0.16 * s, 0.7 * s, st, 0, 0.25 * s, 0, { seg: 6 }));
    g.add(K.box(0.5 * s, 0.1 * s, 0.5 * s, st, 0, 0.95 * s, 0));
    g.add(K.box(0.36 * s, 0.32 * s, 0.36 * s, lit ? K.glow(lit, 1.4) : st, 0, 1.05 * s, 0, { cast: false }));
    g.add(K.mesh(new TT.ConeGeometry(0.45 * s, 0.35 * s, 4), st, 0, 1.55 * s, 0, { ry: Math.PI / 4 }));
    return g;
  };
  // swallow-tail roof (燕尾脊) over a w×d footprint at height y
  PR.roof = (K, w, d, col = '#3a3a44', ridge = '#c8442a', y = 0, curl = 0.6) => {
    const TT = K.T, g = new TT.Group();
    const H = d * 0.38;
    const shape = new TT.Shape(); shape.moveTo(-d / 2 - 0.35, 0); shape.quadraticCurveTo(-d / 4, H * 0.35, 0, H); shape.quadraticCurveTo(d / 4, H * 0.35, d / 2 + 0.35, 0); shape.lineTo(d / 2 + 0.35, -0.12); shape.quadraticCurveTo(d / 4, H * 0.25, 0, H - 0.12); shape.quadraticCurveTo(-d / 4, H * 0.25, -d / 2 - 0.35, -0.12); shape.closePath();
    const geo = new TT.ExtrudeGeometry(shape, { depth: w + 0.6, bevelEnabled: false, curveSegments: 6 });
    geo.translate(0, 0, -(w + 0.6) / 2);
    // tile UVs: shape coords run along the slope (u) and the extrusion along the ridge (v)
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.2, uv.getY(i) / 1.2);
    const roof = K.mesh(geo, K.tmat('rooftile', col, { roughness: 0.7 }), 0, y, 0, { ry: Math.PI / 2 });
    g.add(roof);
    // ridge with swallow tails
    const rg = K.mesh(new TT.BoxGeometry(w + 0.2, 0.18, 0.2), K.mat(ridge), 0, y + H + 0.04, 0);
    g.add(rg);
    for (const sgn of [-1, 1]) {
      const tail = new TT.Mesh(new TT.ConeGeometry(0.1, curl + 0.4, 4), K.mat(ridge));
      tail.position.set(sgn * (w / 2 + 0.25), y + H + 0.25, 0); tail.rotation.z = sgn * -0.9;
      tail.castShadow = true; g.add(tail);
    }
    return g;
  };
  // a Taiwanese/Minnan house: wall with door & windows, roof. lit windows at night
  PR.house = (K, w = 5, d = 4, h = 2.8, o = {}) => {
    const TT = K.T, g = new TT.Group();
    const wallM = K.tmat(o.tex || 'plaster', o.wall || '#c8b8a0', { roughness: 0.95 });
    g.add(K.box(w, h, d, wallM, 0, 0, 0, { tile: 3 }));
    g.add(K.box(w + 0.1, 0.35, d + 0.1, K.tmat('brick', o.base || '#6a5a4a'), 0, 0, 0, { tile: 1.5 }));
    // corner posts / beam for a framed look
    const frame = K.mat(o.frame || '#3a2a1e');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(K.box(0.18, h, 0.18, frame, sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05)));
    g.add(K.box(w + 0.1, 0.16, d + 0.1, frame, 0, h - 0.16, 0));
    const winM = o.lit ? K.glow(o.litCol || '#ffb860', 1.4) : K.mat('#2a2018');
    const fz = d / 2 + 0.02;
    g.add(K.box(0.9, 1.7, 0.06, K.mat(o.door || '#7a2a1a'), 0, 0.25, fz, { cast: false }));
    for (const sx of [-1, 1]) for (let i = 0; i < Math.max(1, Math.floor(w / 3)); i++) {
      const x = sx * (1.3 + i * 1.6);
      if (Math.abs(x) > w / 2 - 0.5) continue;
      g.add(K.box(0.7, 0.7, 0.06, winM, x, h * 0.45, fz, { cast: false }));
      g.add(K.box(0.84, 0.08, 0.1, K.mat('#3a2a1e'), x, h * 0.45 - 0.05, fz, { cast: false }));
    }
    if (o.floors > 1) {
      g.add(K.box(w + 0.6, 0.15, d + 0.6, K.mat('#4a3a2e'), 0, h, 0));
      const up = PR.house(K, w * 0.9, d * 0.9, h * 0.9, Object.assign({}, o, { floors: (o.floors || 1) - 1 }));
      up.position.y = h + 0.15; g.add(up);
      return g;
    }
    g.add(PR.roof(K, w, d, o.roof || '#3a3a46', o.ridge || '#b8442a', h, 0.6));
    return g;
  };
  PR.wall = (K, len, h, col = '#a84a3a', cap = '#3a3a44') => {
    const g = new K.T.Group();
    g.add(K.box(len, h, 0.5, K.tmat('brick', col, { roughness: 0.95 }), 0, 0, 0, { tile: 1.6 }));
    g.add(K.box(len + 0.2, 0.18, 0.7, K.mat(cap), 0, h, 0));
    return g;
  };
  PR.pillar = (K, h = 4, col = '#a82a1e', r = 0.22) => {
    const g = new K.T.Group();
    g.add(K.box(r * 3, 0.3, r * 3, K.mat('#6a6a68'), 0, 0, 0));
    g.add(K.cyl(r, r * 1.05, h, K.mat(col, { roughness: 0.6 }), 0, 0.3, 0, { seg: 14 }));
    g.add(K.box(r * 2.8, 0.25, r * 2.8, K.mat('#3a2a20'), 0, h + 0.3, 0));
    return g;
  };
  PR.mushroom = (K, h, col) => {
    const TT = K.T, g = new TT.Group();
    g.add(K.mesh(new TT.CylinderGeometry(h * 0.06, h * 0.1, h, 10), K.mat('#e8e0f0', { emissive: C(col), emissiveIntensity: 0.15 }), 0, h / 2, 0));
    const cap = new TT.SphereGeometry(h * 0.42, 20, 10, 0, TAU, 0, Math.PI / 2); cap.scale(1, 0.55, 1);
    g.add(K.mesh(cap, K.glow(col, 1.25), 0, h * 0.96, 0, { cast: false }));
    const under = new TT.CircleGeometry(h * 0.42, 20); under.rotateX(Math.PI / 2);
    g.add(K.mesh(under, K.mat(U.shade(col, -0.5), { side: TT.DoubleSide }), 0, h * 0.96, 0, { cast: false }));
    return g;
  };
  PR.boat = (K, l = 4, col = '#6a4a30') => {
    const TT = K.T, g = new TT.Group();
    const shape = new TT.Shape(); shape.moveTo(-l / 2, 0.5); shape.quadraticCurveTo(-l / 2 + 0.3, 0, 0, 0); shape.quadraticCurveTo(l / 2 - 0.3, 0, l / 2, 0.6); shape.lineTo(-l / 2, 0.5);
    const geo = new TT.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }); geo.translate(0, 0, -0.6);
    g.add(K.mesh(geo, K.mat(col)));
    return g;
  };
  PR.skyLantern = (K, s = 1) => {
    const TT = K.T;
    const geo = new TT.CylinderGeometry(0.32 * s, 0.24 * s, 0.6 * s, 8, 1, true);
    return K.mesh(geo, K.glow('#ffb058', 1.6), 0, 0, 0, { cast: false });
  };
  PR.floatingLanterns = (K, n, area, col, ymin, ymax, scale = 1) => {
    // dynamic, drifting (sky lanterns, soul lights)
    const TT = K.T, out = K.out;
    const geo = new TT.CylinderGeometry(0.3 * scale, 0.22 * scale, 0.56 * scale, 8, 1, true);
    const mat = new TT.MeshBasicMaterial({ color: C(col).multiplyScalar(1.8), side: TT.DoubleSide, fog: true });
    const im = new TT.InstancedMesh(geo, mat, n);
    const items = [];
    for (let i = 0; i < n; i++) items.push({ x: K.r(area[0], area[1]), y: K.r(ymin, ymax), z: K.r(area[2], area[3]), ph: K.r(0, TAU), sp: K.r(0.1, 0.35) });
    const m4 = new TT.Matrix4();
    out.group.add(im);
    out.updaters.push((dt, t) => {
      items.forEach((it, i) => { it.y += it.sp * dt; if (it.y > ymax) it.y = ymin; m4.makeTranslation(it.x + Math.sin(t * 0.4 + it.ph) * 0.4, it.y, it.z + Math.cos(t * 0.3 + it.ph) * 0.3); im.setMatrixAt(i, m4); });
      im.instanceMatrix.needsUpdate = true;
    });
    out.disposables.push(() => { geo.dispose(); mat.dispose(); });
    return im;
  };

  // ------------------------------------------------------------------------------------------ kits
  const KITS = {};
  A.KITS = KITS;
  KITS.generic = (K) => { K.ring(14, 18, 14, (x, z) => K.place(PR.rock(K, K.r(0.6, 1.6)), x, z)); };
  KITS.meadow = (K, th) => {
    K.ring(16, 20, 15, (x, z) => K.place(PR.pine(K, K.r(5, 9)), x, z));
    K.ring(10, 30, 22, (x, z) => K.place(PR.pine(K, K.r(7, 11), '#2a4038'), x, z), { phase: 0.3 });
    K.ring(12, 14, 9, (x, z) => K.place(PR.rock(K, K.r(0.3, 0.9), ['#8a8a84', '#6a6a66']), x, z), { phase: 0.15 });
    PR.grassField(K, K.view.lite ? 1500 : 5000, [-26, 26, -18, 14], ['#7aa04a', '#8ab052', '#5a8a3a'], 0.45, { clear: [10, 4.5], inside: 0.15 });
    // dirt path winding back toward the mountains
    const path = new K.T.Mesh(new K.T.PlaneGeometry(2.4, 40, 1, 20), K.mat('#a89068', { roughness: 1 }));
    path.rotation.x = -Math.PI / 2; path.position.set(0.5, 0.02, -24); path.receiveShadow = true;
    K.out.group.add(path);
  };
  KITS.forest = (K, th) => {
    const TT = K.T;
    // tall misty trunks in depth layers
    for (let i = 0; i < 40; i++) {
      const a = K.r(0, TAU), rr = K.r(13, 34);
      const x = Math.sin(a) * rr * 1.3, z = -Math.cos(a) * rr;
      if (z > 3 && x > -8 && x < 16) continue;
      const h = K.r(14, 22);
      const g = new TT.Group();
      g.add(K.cyl(K.r(0.25, 0.45), K.r(0.5, 0.75), h, K.mat(K.rng() < 0.5 ? '#4a4436' : '#5a5040'), 0, -0.2, 0));
      const crown = new TT.IcosahedronGeometry(K.r(2.5, 4), 1); crown.scale(1, 0.6, 1);
      g.add(K.mesh(crown, K.mat('#3a5a32', { flatShading: true }), 0, h, 0));
      K.place(g, x, z);
    }
    K.ring(18, 13, 8.5, (x, z) => K.place(PR.fern(K, K.r(0.9, 1.5)), x, z), { phase: 0.1 });
    K.ring(10, 16, 10, (x, z) => K.place(PR.treeFern(K, K.r(2.5, 3.8)), x, z), { phase: 0.4 });
    K.ring(8, 12, 8, (x, z) => K.place(PR.rock(K, K.r(0.4, 0.9), ['#5a6a4a', '#4a5a3a']), x, z), { phase: 0.25 });
    PR.grassField(K, K.view.lite ? 1000 : 3500, [-24, 24, -16, 12], ['#5a8a3a', '#6a9a42', '#4a7a32'], 0.35, { clear: [9, 4], inside: 0.25 });
    // light shafts
    for (let i = 0; i < 6; i++) {
      const geo = new TT.CylinderGeometry(0.6, 2.2, 22, 12, 1, true); geo.translate(0, -11, 0);
      const m = new TT.Mesh(geo, new TT.MeshBasicMaterial({ color: C('#fff6d8'), transparent: true, opacity: 0.06, blending: TT.AdditiveBlending, depthWrite: false, side: TT.DoubleSide, fog: false }));
      m.position.set(K.r(-14, 10), 20, K.r(-14, -4)); m.rotation.z = 0.3; m.rotation.x = 0.15;
      K.out.group.add(m); K.out.disposables.push(() => { geo.dispose(); m.material.dispose(); });
    }
  };
  KITS.mushroom = (K) => {
    const cols = ['#5affd8', '#ff5af0', '#ffd25a', '#5ab8ff', '#b06aff'];
    K.ring(14, 15, 10, (x, z, i) => K.place(PR.mushroom(K, K.r(1.5, 5.5), cols[i % cols.length]), x, z));
    K.ring(26, 11, 7, (x, z, i) => K.place(PR.mushroom(K, K.r(0.3, 0.8), cols[(i + 2) % cols.length]), x, z), { phase: 0.2 });
    K.ring(18, 26, 18, (x, z, i) => K.place(PR.mushroom(K, K.r(4, 9), cols[(i + 1) % cols.length]), x, z), { phase: 0.5 });
    PR.grassField(K, K.view.lite ? 800 : 2600, [-22, 22, -16, 12], ['#3a3a7a', '#4a3a8a', '#2a4a6a'], 0.4, { clear: [9, 4], inside: 0.2 });
  };
  KITS.shore = (K, th) => {
    K.ring(10, 14, 6.5, (x, z) => { if (z > -5) K.place(PR.rock(K, K.r(0.5, 1.4), ['#4a4c5e', '#3a3a4a', '#5a5a6a']), x, z); }, { phase: 0.1 });
    for (const [x, z, s] of [[-15, 1, 2.6], [16, -1, 2.4], [-11, 8, 1.6], [18, 7, 2.2], [-20, -4, 3]]) K.place(PR.rock(K, s, ['#3c3e50', '#26283a']), x, z);
    // distant lantern boats on the sea (渡魂 lights)
    PR.floatingLanterns(K, 12, [-30, 30, -60, -20], '#ffc070', -0.2, 0.1, 1.2);
    for (const [x, z] of [[-6, -8], [8, -8.5]]) K.lampHalo(x, 0.4, z, '#ffc070', 0.8);
    // driftwood + lantern post
    K.place(PR.lanternPost(K, '#ffb860', 2.2), -11.5, -3.5, { ry: 0.4 });
    K.lampHalo(-11.1, 2.0, -3.5, '#ffb860', 1);
  };
  KITS.beach = (K, th) => {
    const st = th.style;
    if (st === 'linto') {
      K.ring(12, 15, 8, (x, z) => { if (z > -7) K.place(PR.pandanus(K, K.r(2.8, 4)), x, z); });
      K.ring(6, 22, 12, (x, z) => { if (z > -7) K.place(PR.palm(K, K.r(5, 8), K.r(-0.3, 0.3), '#2a4a3a'), x, z); }, { phase: 0.3 });
    } else if (st === 'orchid') {
      for (const [x, z, s] of [[-18, -10, 6], [-13, -14, 4], [16, -12, 7], [22, -8, 5]]) { const r = PR.rock(K, s, ['#2a2a30', '#3a3a3e']); r.scale.y *= 2.2; K.place(r, x, z); }
      for (const [x, z, ry] of [[-10, -2, 0.3], [12, -3, -0.4]]) K.place(PR.canoe ? PR.canoe(K) : PR.boat(K, 4, '#e8e0d0'), x, z, { ry });
    } else if (st === 'south') {
      K.ring(8, 15, 7, (x, z) => { if (z > -6) K.place(PR.palm(K, K.r(5, 8), K.r(-0.4, 0.4)), x, z); });
      // pier posts in the water
      for (let i = 0; i < 6; i++) K.place(K.cyl(0.12, 0.14, 2, K.mat('#5a4030')), -4 + i * 1.6, -9 - i * 0.2, { y: -1.2 });
    } else {
      K.ring(10, 16, 8, (x, z) => { if (z > -6) K.place(PR.rock(K, K.r(0.4, 1.2), ['#8a7a6a', '#6a6058']), x, z); });
      K.ring(5, 22, 12, (x, z) => { if (z > -6) K.place(PR.palm(K, K.r(5, 7), K.r(-0.3, 0.3)), x, z); }, { phase: 0.2 });
    }
  };
  KITS.lake = (K, th) => {
    // reeds along the shore, rocks, a small boat
    const TT = K.T;
    const reeds = [];
    for (let i = 0; i < (K.view.lite ? 120 : 360); i++) { const x = K.r(-30, 30), z = K.r(-9.5, -6); if (Math.abs(x) < 3 && K.rng() < 0.7) continue; reeds.push({ x, z, s: K.r(0.8, 1.6), ry: K.r(0, TAU), rz: K.r(-0.15, 0.15) }); }
    const reed = new TT.CylinderGeometry(0.01, 0.02, 1.6, 3); reed.translate(0, 0.8, 0);
    PR.instances(K, reed, K.mat('#8a8a5a'), reeds, { cast: false });
    K.ring(8, 15, 8, (x, z) => { if (z > -6) K.place(PR.rock(K, K.r(0.4, 1.1), ['#4a4a50', '#5a5a5a']), x, z); });
    K.place(PR.boat(K, 3.5, '#4a3a2a'), -7, -12, { y: -0.45, ry: 0.3 });
    PR.grassField(K, K.view.lite ? 800 : 2400, [-24, 24, -6, 12], ['#4a6a3a', '#5a7a42'], 0.4, { clear: [9, 4], inside: 0.2 });
  };
  KITS.dreampier = (K, th) => {
    // a long wooden boardwalk over the black sea, lanterns on posts both sides, more lantern lines into the distance
    const TT = K.T;
    const deck = K.box(30, 0.3, 9, K.mat('#5a4a3e', { map: groundTex('planks'), roughness: 0.6 }), 0, -0.3, 0);
    deck.material.map.repeat && deck.geometry.attributes.uv && scaleUV(deck.geometry, 7, 2);
    K.out.group.add(deck);
    for (let i = 0; i < 9; i++) for (const zz of [-4.6, 4.6]) {
      const x = -16 + i * 4;
      K.place(K.cyl(0.1, 0.12, 3, K.mat('#2a2018')), x, zz, { y: -1.8 });
      if (zz > 0 && Math.abs(x) < 12) continue; // keep the camera side of the stage clear
      if (zz < 0 || i % 2) { const l = PR.lantern(K, '#ffb050', 0.9); l.position.set(x, 1.6, zz); K.out.group.add(l); K.lampHalo(x, 1.6, zz, '#ffb050', 0.9); K.place(K.cyl(0.04, 0.05, 1.5, K.mat('#2a2018')), x, zz, { y: 0 }); }
    }
    PR.floatingLanterns(K, 40, [-60, 60, -80, -12], '#ffb060', -0.5, -0.4, 1);
    for (let i = 0; i < 14; i++) K.lampHalo(-40 + i * 6, 0.6, -40, '#ffb050', 1.4);
  };
  // BoxGeometry faces are 0..1 each: rescale to world units (one texture tile per `tile` metres)
  function boxUV(g, w, h, d, tile) {
    const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  }
  // per-vertex planar projection on the dominant normal axis (any geometry, world-ish scale)
  function planarUV(g, tile) {
    g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i) / tile, p.getY(i) / tile);
      else if (ay >= az) uv.setXY(i, p.getX(i) / tile, p.getZ(i) / tile);
      else uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
    }
  }
  function scaleUV(geo, sx, sy) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); }
  KITS.jiufen = (K, th) => {
    const night = !!th.night;
    // teahouses climbing the hill on both sides of the stair plaza
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = side * (14 + i * 1.2), z = -6 - i * 5.5;
        K.place(PR.house(K, K.r(5, 7), 5, 3, { floors: 2 + (i % 2), wall: '#9a6a48', tex: 'woodwall', lit: night, roof: '#2a2a30', ridge: '#8a2a1a', base: '#4a3a30' }), x, z + 0, { ry: side > 0 ? -Math.PI / 2 + 0.2 : Math.PI / 2 - 0.2, y: groundOr(K, x, z) + i * 0.6 });
      }
    }
    for (let i = 0; i < 3; i++) K.place(PR.house(K, 6, 5, 3, { floors: 3, wall: '#8a5a3a', tex: 'woodwall', lit: night, roof: '#2a2a30', ridge: '#8a2a1a' }), -8 + i * 8, -20 - i * 2, { y: 2 + i });
    // red lantern strings
    for (let i = 0; i < 3; i++) PR.lanternString(K, new K.T.Vector3(-14, 6.5, -4 - i * 4), new K.T.Vector3(14, 6.5, -5 - i * 4), 12, '#e8402a', 0.8);
    // stone steps behind
    for (let i = 0; i < 6; i++) K.place(K.box(10, 0.4, 1.2, K.mat('#7a7068')), 0, -10 - i * 1.2, { y: i * 0.4 });
    K.place(PR.stoneLantern(K, 1.2, night ? '#ffc070' : null), -9, -4);
    K.place(PR.stoneLantern(K, 1.2, night ? '#ffc070' : null), 10, -4.5);
  };
  function groundOr(K, x, z) { return K.out.groundH ? K.out.groundH(x, z) : 0; }
  KITS.street = (K, th) => {
    const st = th.style, night = !!th.night;
    // shophouse arcades (亭仔腳) facing the street on both sides
    const wall = st === 'procession' ? '#8a4a3a' : '#b08a6a';
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = side * 15, z = -18 + i * 6.5;
      if (z > 6) continue;
      const g = PR.house(K, 6, 5, 3.2, { floors: 2, wall, lit: night || K.rng() < 0.3, roof: '#3a3a40', ridge: '#a8442a' });
      // arcade pillars in front
      for (let p = -1; p <= 1; p++) g.add(K.box(0.35, 3.2, 0.35, K.mat('#d8c8b0'), p * 2.4, 0, 3.0));
      K.place(g, x, z, { ry: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    // gate at the end of the street
    K.place(PR.house(K, 9, 5, 4, { wall: '#a8342a', roof: '#2a2a30', ridge: '#d8a03a', lit: night }), 0, -26);
    const cols = st === 'procession' ? ['#e8402a', '#ffd23a'] : ['#e8402a'];
    for (let i = 0; i < 4; i++) PR.lanternString(K, new K.T.Vector3(-12, 6, -2 - i * 5), new K.T.Vector3(12, 6, -3 - i * 5), 10, cols[i % cols.length], 0.75);
    if (st === 'procession') {
      for (let i = 0; i < 8; i++) { const x = (i % 2 ? 1 : -1) * 11, z = -16 + i * 3; const pole = K.group(K.cyl(0.05, 0.05, 4, K.mat('#3a2a1e'), 0, 0, 0), K.box(0.05, 1.6, 1.0, K.mat(i % 3 ? '#e8b02a' : '#d8342a', { side: K.T.DoubleSide }), 0, 2.2, 0.5)); K.place(pole, x, z); }
    }
  };
  KITS.temple = (K, th) => {
    // temple hall: red pillars, double roof, incense burner, stone lanterns, side walls
    const TT = K.T, g = new TT.Group();
    g.add(K.box(14, 0.8, 7, K.mat('#8a8078'), 0, 0, 0));
    for (let i = 0; i < 6; i++) g.add(PR.pillar(K, 3.6, '#b02a1e', 0.22).translateX(-5.5 + i * 2.2).translateY(0.8).translateZ(3));
    g.add(K.box(13, 3.6, 4.5, K.mat('#a83a2a'), 0, 0.8, -0.5));
    g.add(K.box(3, 2.6, 0.1, K.mat('#5a1a10'), 0, 0.8, 1.8));
    const r1 = PR.roof(K, 15, 8, '#2a3a4a', '#c8402a', 4.6, 1); g.add(r1);
    const r2 = PR.roof(K, 9, 5, '#2a3a4a', '#c8402a', 6.9, 1); g.add(r2);
    K.place(g, 0, -16);
    for (const side of [-1, 1]) K.place(PR.wall(K, 18, 2.4, '#a8443a'), side * 13, -8, { ry: Math.PI / 2 });
    K.place(PR.wall(K, 10, 2.4, '#a8443a'), -12, -16.5); K.place(PR.wall(K, 10, 2.4, '#a8443a'), 12, -16.5);
    // incense burner
    const bur = K.group(K.cyl(0.6, 0.5, 0.9, K.mat('#6a5030', { metalness: 0.6, roughness: 0.4 }), 0, 0.6, 0), K.cyl(0.15, 0.15, 0.6, K.mat('#4a3a2a'), 0, 0, 0), K.mesh(new TT.ConeGeometry(0.7, 0.5, 8), K.mat('#5a4028', { metalness: 0.6, roughness: 0.4 }), 0, 1.8, 0));
    K.place(bur, 0, -10);
    for (const [x, z] of [[-6, -10], [6, -10], [-11, -2], [12, -3]]) K.place(PR.stoneLantern(K, 1.1, '#ffb060'), x, z);
    for (const [x, z] of [[-16, -14], [17, -13], [-19, -4], [20, -2]]) K.place(PR.broadTree(K, K.r(5, 7), ['#2a4a2a', '#3a5a32', '#24402a']), x, z);
  };
  KITS.mansion = (K, th) => {
    const night = true;
    K.place(PR.house(K, 14, 6, 3.6, { wall: '#6a3a30', lit: true, litCol: '#80ffa0', roof: '#1a2a2a', ridge: '#4a2a20', door: '#3a1a10' }), 0, -17);
    for (const side of [-1, 1]) { K.place(PR.wall(K, 20, 2.6, '#5a3028', '#1a2a2a'), side * 14, -8, { ry: Math.PI / 2 }); K.place(PR.house(K, 6, 5, 3, { wall: '#5a3028', roof: '#1a2a2a', lit: K.rng() < 0.5, litCol: '#80ffa0' }), side * 11, -12, { ry: side * -Math.PI / 2 }); }
    // dead trees
    for (const [x, z] of [[-17, -16], [18, -14], [-19, 2]]) { const g = new K.T.Group(); g.add(K.cyl(0.2, 0.35, 5, K.mat('#2a2420'), 0, 0, 0)); for (let i = 0; i < 6; i++) g.add(K.cyl(0.03, 0.1, 2.4, K.mat('#2a2420'), 0, 3 + K.r(0, 1.5), 0, { rz: K.r(-1.2, 1.2), rx: K.r(-1, 1) })); K.place(g, x, z); }
    PR.floatingLanterns(K, 10, [-14, 14, -16, -6], '#80ffa0', 0.5, 4, 0.4);
  };
  KITS.tainan = (K, th) => {
    // 赤崁樓-style twin towers on a brick terrace + flame trees
    for (const x of [-7, 7]) {
      const g = new K.T.Group();
      g.add(K.box(8, 1.6, 7, K.mat('#b8684a'), 0, 0, 0));
      g.add(PR.house(K, 6, 5, 3, { floors: 2, wall: '#c84a32', roof: '#3a2a2a', ridge: '#e8a03a' }).translateY(1.6));
      K.place(g, x, -20);
    }
    K.place(PR.wall(K, 34, 1.4, '#b8684a', '#8a4a3a'), 0, -14);
    for (const [x, z] of [[-17, -10], [17, -11], [-21, -2], [21, -3], [-12, -20], [13, -21]]) K.place(PR.broadTree(K, K.r(5, 7), ['#d8401e', '#e85a2a', '#2a5a2a'], '#4a3020'), x, z);
  };
  KITS.palace = (K, th) => {
    // two rows of lacquered pillars receding to an altar; blue lamps on every pillar
    for (let i = 0; i < 7; i++) for (const side of [-1, 1]) {
      const x = side * (10 + i * 0.3), z = 6 - i * 4.5;
      K.place(PR.pillar(K, 7, '#5a1a1a', 0.35), x, z);
      K.lampHalo(x + side * -0.5, 3.2, z, '#5a8aff', 0.6);
      K.place(K.box(0.18, 0.3, 0.18, K.glow('#5a8aff', 2)), x - side * 0.45, z, { y: 3 });
    }
    // altar + candle
    K.place(K.box(6, 1.2, 2.4, K.mat('#3a1a14')), 0, -24);
    K.place(K.cyl(0.18, 0.18, 1.2, K.glow('#fff0c0', 1.5)), 0, -24, { y: 1.2 });
    K.lampHalo(0, 2.6, -24, '#ffe0a0', 2.2);
    // ceiling beams & back wall
    K.place(K.box(40, 14, 1, K.mat('#0e1220')), 0, -28);
    for (const side of [-1, 1]) K.place(K.box(1, 14, 50, K.mat('#0c1020')), side * 18, -4);
    K.place(K.box(40, 0.6, 50, K.mat('#1a1418')), 0, -4, { y: 9 });
  };
  KITS.shrine = (K, th) => {
    for (let i = 0; i < 5; i++) for (const side of [-1, 1]) K.place(PR.pillar(K, 6.5, '#3a6a60', 0.4), side * 10.5, 4 - i * 5);
    K.place(K.box(40, 14, 1, K.mat('#0e2a24')), 0, -22);
    for (const side of [-1, 1]) K.place(K.box(1, 14, 44, K.mat('#0a221c')), side * 17, -2);
    // glowing lotus shrine at the back
    const lotus = new K.T.Group();
    for (let i = 0; i < 10; i++) { const p = new K.T.SphereGeometry(0.6, 8, 6, 0, TAU, 0, Math.PI / 2); p.scale(0.5, 1.4, 1); const m = K.mesh(p, K.glow('#ff9ad8', 1.4), 0, 0, 0, { cast: false }); m.rotation.y = i / 10 * TAU; m.rotation.z = 0.5; m.position.set(Math.cos(i / 10 * TAU) * 0.5, 0.3, Math.sin(i / 10 * TAU) * 0.5); lotus.add(m); }
    K.place(lotus, 0, -18, { y: 1.2 });
    K.lampHalo(0, 2, -18, '#ff9ad8', 3);
    for (let i = 0; i < 10; i++) { const x = K.r(-12, 12), z = K.r(-16, 6); if (Math.abs(x) < 9 && Math.abs(z) < 4) continue; K.place(PR.lantern(K, '#ffd8a0', 0.6), x, z, { y: 0.25 }); K.lampHalo(x, 0.3, z, '#ffd8a0', 0.6); }
  };
  KITS.mine = (K, th) => {
    caveShell(K, '#3a3028', 16, 9);
    // timber frames receding + rails
    for (let i = 0; i < 6; i++) {
      const z = 4 - i * 5.5, w = 22 - i * 0.5;
      const g = K.group(K.box(0.45, 5, 0.45, K.mat('#5a4030'), -w / 2, 0, 0), K.box(0.45, 5, 0.45, K.mat('#5a4030'), w / 2, 0, 0), K.box(w + 0.6, 0.5, 0.5, K.mat('#4a3424'), 0, 5, 0));
      K.place(g, 0, z);
      if (i % 2 === 0) { const l = PR.lantern(K, '#ffa040', 0.8); l.position.set(-w / 2 + 0.6, 4.2, z + 0.3); K.out.group.add(l); K.lampHalo(-w / 2 + 0.6, 4.2, z + 0.3, '#ffa040', 1); }
    }
    for (const rx of [-0.7, 0.7]) K.place(K.box(0.1, 0.12, 40, K.mat('#6a6a70', { metalness: 0.7, roughness: 0.4 })), rx + 1, -12);
    for (let i = 0; i < 30; i++) K.place(K.box(2.2, 0.1, 0.3, K.mat('#4a3a2a')), 1, -30 + i * 1.2, { y: 0 });
    const cart = K.group(K.box(1.6, 0.9, 1.1, K.mat('#5a4a3a'), 0, 0.3, 0), K.box(1.4, 0.3, 0.9, K.mat('#d8b040', { metalness: 0.5, roughness: 0.4, emissive: C('#3a2a00') }), 0, 1.1, 0));
    K.place(cart, -12, -6, { ry: 0.3 });
    K.ring(12, 13, 8, (x, z) => K.place(PR.rock(K, K.r(0.4, 1.2), ['#4a4038', '#3a3028']), x, z));
  };
  KITS.windcave = (K) => {
    caveShell(K, '#2a3038', 15, 10, true);
    // the bright mouth of the cave behind the enemies
    const TT = K.T;
    const mouth = new TT.Mesh(new TT.CircleGeometry(6, 24), new TT.MeshBasicMaterial({ color: C('#d8ecff').multiplyScalar(2.2), fog: false }));
    mouth.position.set(0, 5, -26); mouth.scale.y = 0.8;
    K.out.group.add(mouth); K.out.disposables.push(() => { mouth.geometry.dispose(); mouth.material.dispose(); });
    for (let i = 0; i < 8; i++) { const sp = K.mesh(new TT.ConeGeometry(K.r(0.4, 1), K.r(2, 5), 6), K.mat('#c8e0f0', { roughness: 0.3, metalness: 0.1 }), K.r(-5, 5), 0, -24 + K.r(-1, 1)); sp.position.y = sp.geometry.parameters.height / 2; K.staticGroup.add(sp); }
    K.ring(14, 13, 8, (x, z) => K.place(PR.rock(K, K.r(0.5, 1.6), ['#3a4048', '#2a3038']), x, z));
    K.ring(10, 11.5, 7, (x, z) => M(K, 'crystal', x, z, { s: K.r(1, 1.8) }), { phase: 0.3 });
  };
  function caveShell(K, col, rx, rz, open) {
    // rough dome of rock around the arena (normals inward)
    const TT = K.T;
    const geo = new TT.SphereGeometry(1, 48, 24, 0, TAU, 0, Math.PI * 0.55);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 0.8 + fbm(x * 3 + 5, z * 3 + y * 2, 9, 4) * 0.4; p.setXYZ(i, x * n, y * n, z * n); }
    geo.computeVertexNormals();
    const m = new TT.Mesh(geo, K.mat(col, { side: TT.BackSide, flatShading: true, roughness: 1 }));
    m.scale.set(rx * 2.2, 9, rz * 2.6); m.position.set(0, -0.5, -4);
    m.receiveShadow = true;
    K.out.group.add(m);
    K.out.disposables.push(() => geo.dispose());
  }
  KITS.tower = (K) => {
    const TT = K.T;
    // round stone tower interior with a spiral stair and a beam of light from the lens room above
    const wall = new TT.Mesh(new TT.CylinderGeometry(16, 16, 24, 40, 1, true), K.mat('#4a4a52', { side: TT.BackSide, map: groundTex('stonetile'), roughness: 0.95 }));
    scaleUV(wall.geometry, 10, 6);
    wall.position.set(0, 12, -2); wall.receiveShadow = true;
    K.out.group.add(wall);
    for (let i = 0; i < 26; i++) { const a = -2.6 + i * 0.16, y = 0.4 + i * 0.45; K.place(K.box(2.6, 0.25, 1.2, K.mat('#6a6a70')), Math.sin(a) * 14.5, -2 - Math.cos(a) * 14.5, { y, ry: -a }); }
    const beam = new TT.Mesh(new TT.CylinderGeometry(1.2, 3.5, 24, 24, 1, true), new TT.MeshBasicMaterial({ color: C('#fff0d0'), transparent: true, opacity: 0.12, blending: TT.AdditiveBlending, depthWrite: false, side: TT.DoubleSide, fog: false }));
    beam.position.set(0, 12, -2); K.out.group.add(beam);
    K.out.disposables.push(() => { wall.geometry.dispose(); beam.geometry.dispose(); beam.material.dispose(); });
    const disc = new TT.Mesh(new TT.CircleGeometry(4, 32), new TT.MeshBasicMaterial({ color: C('#fff0d0').multiplyScalar(2), fog: false }));
    disc.rotation.x = Math.PI / 2; disc.position.set(0, 23.5, -2); K.out.group.add(disc);
    for (const x of [-9, 9]) K.place(K.cyl(0.4, 0.45, 1, K.mat('#5a4030')), x, -10);
  };
  KITS.pingxi = (K, th) => {
    PR.floatingLanterns(K, K.view.lite ? 40 : 90, [-40, 40, -60, -8], '#ffa850', 2, 26, 1);
    // railway on an embankment behind
    for (const rz of [-11.3, -12.7]) K.place(K.box(60, 0.1, 0.1, K.mat('#5a5a60', { metalness: 0.6 })), 0, rz, { y: 0.4 });
    K.place(K.box(60, 0.4, 3.4, K.mat('#5a4a40')), 0, -12);
    for (let i = 0; i < 40; i++) K.place(K.box(0.3, 0.1, 2.6, K.mat('#3a2a20')), -30 + i * 1.5, -12, { y: 0.4 });
    // village houses on the hillside
    for (let i = 0; i < 7; i++) K.place(PR.house(K, 4, 3.5, 2.6, { wall: '#c8a888', lit: true, roof: '#3a3a44' }), 10 + i * 4, -20 - i * 1.5, { ry: -0.3, y: i * 0.8 + 1 });
    PR.grassField(K, K.view.lite ? 1200 : 4000, [-26, 26, -10, 14], ['#6a6a4a', '#8a7a5a', '#5a5a3a'], 0.5, { clear: [9, 4], inside: 0.2 });
    K.place(PR.lanternPost(K, '#ffb060', 2.6), -12, -6);
  };
  KITS.tribe = (K) => {
    // 石板屋 slate houses and a watchtower
    for (const [x, z, ry] of [[-14, -12, 0.3], [12, -14, -0.2], [-6, -18, 0]]) {
      const g = new K.T.Group();
      g.add(K.box(6, 1.6, 4, K.mat('#4a4a50', { map: groundTex('slate') }), 0, 0, 0));
      g.add(PR.roof(K, 6.4, 4.4, '#3a3a40', '#3a3a40', 1.6, 0));
      g.add(K.box(0.8, 1.2, 0.05, K.glow('#ffb060', 1.2), 0, 0.1, 2.03, { cast: false }));
      K.place(g, x, z, { ry });
    }
    const tower = K.group(K.box(2, 0.3, 2, K.mat('#5a4030'), 0, 4, 0), ...[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z]) => K.box(0.15, 4, 0.15, K.mat('#4a3424'), x, 0, z)), K.mesh(new K.T.ConeGeometry(1.8, 1.4, 4), K.mat('#8a7a50'), 0, 5.1, 0, { ry: Math.PI / 4 }));
    K.place(tower, 16, -6);
    K.ring(12, 15, 10, (x, z) => K.place(PR.rock(K, K.r(0.4, 1), ['#4a4a50', '#3a3a40']), x, z));
  };
  KITS.vision = (K) => {
    // giant geometric leaves arching overhead, glowing seams
    const TT = K.T;
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * TAU, rr = K.r(14, 24);
      const x = Math.sin(a) * rr * 1.2, z = -Math.cos(a) * rr;
      if (z > 4 && x > -8 && x < 14) continue;
      const leaf = new TT.Shape(); leaf.moveTo(0, 0); leaf.quadraticCurveTo(1.6, 3, 0, 8); leaf.quadraticCurveTo(-1.6, 3, 0, 0);
      const geo = new TT.ShapeGeometry(leaf, 6);
      const m = K.mesh(geo, K.mat(K.rng() < 0.5 ? '#2a1a5a' : '#3a1a6a', { side: TT.DoubleSide, emissive: C(K.rng() < 0.5 ? '#3affc0' : '#ff6af0'), emissiveIntensity: 0.25 }), 0, 0, 0);
      m.rotation.set(-0.4, K.r(0, TAU), K.r(-0.3, 0.3)); m.scale.setScalar(K.r(1, 2));
      K.place(m, x, z);
    }
    PR.floatingLanterns(K, 30, [-24, 24, -24, 6], '#7af0ff', 1, 10, 0.3);
  };
  KITS.breath = (K) => {
    // kaleidoscope wedges standing around the arena, slowly rotating
    const TT = K.T, g = new TT.Group();
    const cols = ['#ff6ad5', '#ffd06a', '#7af0ff', '#b6ff6a', '#a08aff'];
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU;
      const geo = new TT.CircleGeometry(4, 3);
      const m = new TT.Mesh(geo, new TT.MeshBasicMaterial({ color: C(cols[i % 5]).multiplyScalar(1.2), side: TT.DoubleSide, transparent: true, opacity: 0.7, fog: false }));
      m.position.set(Math.sin(a) * 22, 6 + Math.sin(i) * 3, -Math.cos(a) * 22); m.lookAt(0, 6, 0);
      g.add(m);
      K.out.disposables.push(() => { geo.dispose(); m.material.dispose(); });
    }
    K.out.group.add(g);
    K.out.updaters.push((dt, t) => { g.rotation.y = t * 0.05; g.children.forEach((c, i) => { c.rotation.z = t * 0.3 + i; }); });
  };
  KITS.chaos = (K) => {
    // burning ruins: broken walls, roofs, fires
    for (let i = 0; i < 10; i++) {
      const a = K.r(-1.4, 1.4) + Math.PI, rr = K.r(14, 26);
      const x = Math.sin(a) * rr * 1.3, z = -Math.cos(a) * rr * -1;
      const g = PR.house(K, K.r(4, 7), 4, K.r(2, 3.5), { wall: '#2a1a14', roof: '#1a1010', ridge: '#3a1a10', lit: true, litCol: '#ff5a1a' });
      g.rotation.z = K.r(-0.12, 0.12);
      K.place(g, x, -Math.abs(z), { ry: K.r(0, TAU) });
    }
    K.ring(14, 14, 9, (x, z) => K.place(PR.rock(K, K.r(0.4, 1.2), ['#2a1a14', '#3a2418']), x, z));
    PR.floatingLanterns(K, 0, [0, 0, 0, 0], '#ff5a1a', 0, 1);
    for (let i = 0; i < 8; i++) K.lampHalo(K.r(-26, 26), K.r(0.5, 3), K.r(-30, -12), '#ff6a2a', K.r(2, 5));
  };
  KITS.deck = (K, th) => {
    // the deck of a junk: planks, rails, mast with sail, lanterns, ropes; sea all around
    const TT = K.T;
    const wang = th.style === 'wangboat';
    const hull = new TT.Group();
    const deckM = K.mat(wang ? '#b08a5a' : '#6a5038', { map: groundTex('deck'), roughness: 0.65 });
    const deck = K.box(30, 0.5, 13, deckM, 0, -0.5, 0); scaleUV(deck.geometry, 7, 3);
    hull.add(deck);
    hull.add(K.box(32, 2.4, 14, K.mat(wang ? '#c8342a' : '#3a2a20'), 0, -2.9, 0));
    for (const sz of [-6.8, 6.8]) hull.add(K.box(30, 1.0, 0.25, K.mat(wang ? '#d8a03a' : '#4a3424'), 0, 0, sz));
    hull.add(K.box(4, 3, 13, K.mat(wang ? '#c8342a' : '#3a2a20'), 15, 0, 0)); // stern castle
    K.staticGroup.add(hull);
    // masts & sails (behind the battle line)
    for (const [x, h] of [[-5, 13], [8, 10]]) {
      K.place(K.cyl(0.2, 0.28, h, K.mat('#5a4030')), x, -5.8, { y: 0 });
      // battened junk sail: bellied panel with darker battens
      const sw = 4.2, sh = h * 0.5;
      const sail = new TT.PlaneGeometry(sw, sh, 8, 8);
      const pp = sail.attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin((pp.getX(i) / sw + 0.5) * Math.PI) * 0.45);
      sail.computeVertexNormals();
      const s = new TT.Mesh(sail, K.mat(wang ? '#e8b05a' : '#9a8468', { side: TT.DoubleSide, roughness: 0.9 }));
      s.position.set(x + 0.4, h - sh / 2 - 0.4, -5.5); s.castShadow = true;
      for (let b = 0; b < 6; b++) s.add(K.mesh(new TT.BoxGeometry(sw + 0.3, 0.06, 0.08), K.mat('#3a2a1e'), 0, -sh / 2 + (b + 0.5) * sh / 6, 0.42, { cast: false }));
      K.out.group.add(s);
      K.out.disposables.push(() => sail.dispose());
      K.out.updaters.push((dt, t) => { s.rotation.y = Math.sin(t * 0.5 + x) * 0.04; });
    }
    if (!wang) { for (const [x, z] of [[-10, -6.5], [2, -6.5], [12, -6.5]]) { const l = PR.lantern(K, '#ffb050', 1); l.position.set(x, 2.4, z); K.out.group.add(l); K.lampHalo(x, 2.4, z, '#ffb050', 1.2); } }
    else for (let i = 0; i < 6; i++) { const f = K.box(0.05, 1.2, 1.6, K.mat(i % 2 ? '#d8342a' : '#e8c03a', { side: TT.DoubleSide }), 0, 0, 0); K.place(K.group(K.cyl(0.04, 0.04, 3, K.mat('#3a2a1e')), f.translateY(2.3).translateZ(0.8)), -12 + i * 4.6, -6.6, { y: 0.5 }); }
    // ship bob
    K.out.updaters.push((dt, t) => { K.out.group.children.forEach(() => {}); if (K.view.cam) { /* the deck stays put; the sea moves */ } });
  };
  KITS.harbor = (K) => {
    // stone embankment with bollards, a red fort on the right headland, junks on the water
    K.place(K.box(60, 1.2, 1.6, K.mat('#8a7a60')), 0, -7.6, { y: -0.6 });
    for (let i = 0; i < 10; i++) K.place(K.cyl(0.25, 0.3, 0.7, K.mat('#4a4a50')), -18 + i * 4, -7.2, { y: 0 });
    const fort = K.group(K.box(10, 4, 6, K.mat('#b8442a'), 0, 0, 0), K.box(10.4, 0.6, 6.4, K.mat('#e8e0d0'), 0, 4, 0));
    K.place(fort, 26, -22, { y: 4 });
    for (const [x, z] of [[-14, -20], [6, -26]]) { const b = PR.boat(K, 5, '#5a3a2a'); b.add(K.cyl(0.08, 0.1, 4, K.mat('#4a3424'), 0, 0.5, 0)); K.place(b, x, z, { y: -0.7, ry: 0.4 }); }
    K.ring(8, 16, 7, (x, z) => { if (z > -6) K.place(PR.broadTree(K, K.r(3, 5)), x, z); });
  };
  KITS.hakka = (K) => {
    // 伙房 long house with red-tile roof + bamboo + drying racks
    const g = new K.T.Group();
    g.add(PR.house(K, 16, 5, 2.8, { wall: '#f0ece0', roof: '#8a3a2a', ridge: '#6a2a1a', door: '#8a2a1a', base: '#7a6a5a' }));
    for (const sx of [-1, 1]) g.add(PR.house(K, 5, 8, 2.6, { wall: '#f0ece0', roof: '#8a3a2a', ridge: '#6a2a1a' }).translateX(sx * 10.5).translateZ(4));
    K.place(g, 0, -17);
    for (const [x, z] of [[-17, -8], [18, -7], [-20, 3]]) K.place(PR.bamboo(K, K.r(6, 9), 9), x, z);
    for (const [x, z] of [[-10, -6], [10, -6]]) { const r = K.group(K.box(3, 0.1, 1.4, K.mat('#8a6a40'), 0, 1, 0), K.box(2.8, 0.15, 1.2, K.mat('#e86a2a'), 0, 1.1, 0), ...[-1.4, 1.4].map((xx) => K.box(0.08, 1, 0.08, K.mat('#5a4030'), xx, 0, 0))); K.place(r, x, z); }
  };
  KITS.alishan = (K) => {
    // giant red cypress trunks framing the arena + misty undergrowth
    for (const [x, z, r] of [[-15, -6, 1.8], [-19, -14, 2.4], [16, -8, 2.0], [21, -15, 2.6], [-12, -18, 1.6], [10, -20, 1.8], [-22, 2, 2.0], [23, 1, 2.2]]) {
      const g = new K.T.Group();
      g.add(K.cyl(r * 0.8, r * 1.2, 30, K.mat('#6a3a2a', { roughness: 1 }), 0, -0.5, 0, { seg: 12 }));
      for (let i = 0; i < 5; i++) g.add(K.cyl(r * 0.2, r * 0.4, 2, K.mat('#5a3424'), Math.cos(i) * r, -0.2, Math.sin(i) * r, { rz: Math.cos(i) * 0.8, rx: Math.sin(i) * 0.8 }));
      K.place(g, x, z);
    }
    K.ring(16, 13, 8.5, (x, z) => K.place(PR.fern(K, K.r(0.8, 1.4)), x, z));
    PR.grassField(K, K.view.lite ? 900 : 3000, [-24, 24, -16, 12], ['#5a7a3a', '#6a8a42'], 0.35, { clear: [9, 4], inside: 0.2 });
  };
  KITS.scree = (K) => {
    for (let i = 0; i < 40; i++) { const a = K.r(0, TAU), rr = K.r(11, 26); const x = Math.sin(a) * rr * 1.3, z = -Math.cos(a) * rr; if (z > 4 && x > -8 && x < 14) continue; K.place(PR.rock(K, K.r(0.4, 2.2), ['#3a3a44', '#2a2a32', '#4a4a54']), x, z); }
    for (let i = 0; i < 20; i++) K.place(PR.pine(K, K.r(2, 3.5), '#1a2a28'), K.r(-30, 30), K.r(-30, -12));
  };
  KITS.grassland = (K) => {
    PR.grassField(K, K.view.lite ? 2000 : 7000, [-30, 30, -24, 14], ['#a8b860', '#c8c880', '#8aa050'], 0.7, { clear: [10, 4.5], inside: 0.2 });
    K.place(PR.wall(K, 40, 3.2, '#9a7a5a', '#6a5a4a'), 0, -26);
    for (const [x, z, l] of [[-20, -10, 0.5], [22, -14, -0.4], [-26, -18, 0.3]]) K.place(PR.broadTree(K, 4, ['#3a6a32', '#4a7a3a']), x, z);
  };
  KITS.cape = (K, th) => {
    // grass headland dropping to the sea; lighthouse on the cliff
    const lh = K.group(K.cyl(1.2, 1.6, 9, K.mat('#e8e4dc'), 0, 0, 0, { seg: 16 }), K.cyl(0.9, 0.9, 1.4, K.glow('#fff0c0', 2.5), 0, 9, 0), K.mesh(new K.T.ConeGeometry(1.3, 1.2, 16), K.mat('#3a3a3a'), 0, 11, 0));
    K.place(lh, -16, -16, { y: 0 });
    K.lampHalo(-16, 9.7, -16, '#fff0c0', 4);
    PR.grassField(K, K.view.lite ? 1600 : 5000, [-28, 28, -10, 14], ['#3a5a3a', '#4a6a42', '#2a4a2a'], 0.6, { clear: [10, 4.5], inside: 0.2 });
    K.ring(8, 16, 7, (x, z) => { if (z > -9) K.place(PR.rock(K, K.r(0.4, 1), ['#4a4a50']), x, z); });
  };
  KITS.cape.pre = (th) => { th.groundFn = (x, z) => (z < -10 ? -8 * sm(-10, -14, z) : groundHeight(th, x, z)); };
  KITS.gorge = (K, th) => {
    // marble cliffs on both sides, turquoise river behind, suspension bridge high above
    const TT = K.T;
    for (const side of [-1, 1]) {
      const geo = new TT.BoxGeometry(14, 40, 60, 6, 12, 12);
      const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const n = fbm(p.getY(i) * 0.15 + side * 10, p.getZ(i) * 0.15, 3); p.setX(i, p.getX(i) + (n - 0.5) * 5); }
      geo.computeVertexNormals();
      planarUV(geo, 6);
      const m = new TT.Mesh(geo, K.tmat('marble', '#e0e0dc', { flatShading: true, roughness: 0.7 }));
      m.position.set(side * 24, 18, -10); m.receiveShadow = true; m.castShadow = !K.view.lite;
      K.out.group.add(m); K.out.disposables.push(() => geo.dispose());
    }
    const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new TT.Vector3(-17 + t * 34, 22 - Math.sin(t * Math.PI) * 2, -24)); }
    const br = new TT.Mesh(new TT.TubeGeometry(new TT.CatmullRomCurve3(pts), 20, 0.08, 4), K.mat('#3a3028'));
    K.out.group.add(br); K.out.disposables.push(() => br.geometry.dispose());
    for (const [x, z, s] of [[-10, -6, 1.6], [12, -7, 2], [-14, 3, 1.2], [15, 4, 1.4]]) K.place(PR.rock(K, s, ['#d8d8d4', '#b8b8b4']), x, z);
  };
  KITS.festival = (K) => {
    // 搶孤 tower: a grid of tall poles topped with flags, strung with lights
    const g = new K.T.Group();
    g.add(K.box(10, 0.6, 8, K.mat('#5a4030'), 0, 9, 0));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) g.add(K.cyl(0.15, 0.2, 9, K.mat('#4a3424'), -4.5 + i * 3, 0, -3 + j * 3));
    for (let i = 0; i < 12; i++) { g.add(K.cyl(0.08, 0.12, 5, K.mat('#d8b040'), -4.5 + (i % 6) * 1.8, 9.6, -2 + Math.floor(i / 6) * 4)); g.add(K.box(0.05, 0.8, 1.2, K.mat(i % 2 ? '#e8402a' : '#ffd23a', { side: K.T.DoubleSide }), -4.5 + (i % 6) * 1.8, 14, -1.4 + Math.floor(i / 6) * 4)); }
    K.place(g, 0, -20);
    for (let i = 0; i < 3; i++) PR.lanternString(K, new K.T.Vector3(-20, 5 + i, -12 - i * 2), new K.T.Vector3(-4, 11, -18), 10, '#ffb040', 0.6);
    for (let i = 0; i < 3; i++) PR.lanternString(K, new K.T.Vector3(20, 5 + i, -12 - i * 2), new K.T.Vector3(4, 11, -18), 10, '#ffb040', 0.6);
    K.ring(10, 16, 8, (x, z) => K.place(PR.lanternPost(K, '#ff9a40', 2.4), x, z));
  };
  KITS.basalt = (K) => {
    // columnar basalt cliff behind + scattered hex columns
    const TT = K.T;
    const cols = [];
    for (let i = 0; i < 120; i++) { const x = K.r(-34, -15), z = K.r(-8, 6); cols.push({ x, z, s: 1, sy: K.r(3, 8) * (1 + (-x - 15) * 0.05), c: '#3a3a40' }); }
    for (let i = 0; i < 30; i++) { const a = K.r(0, TAU), rr = K.r(11, 18); const x = Math.sin(a) * rr * 1.2, z = -Math.cos(a) * rr * 0.7; if (z > 3 && x > -8 && x < 14) continue; cols.push({ x, z, s: 1, sy: K.r(0.2, 1.4), c: '#4a4a52' }); }
    const geo = new TT.CylinderGeometry(0.55, 0.55, 1, 6); geo.translate(0, 0.5, 0);
    PR.instances(K, geo, K.mat('#ffffff', { flatShading: true, roughness: 0.9 }), cols);
    for (let i = 0; i < 6; i++) { const st = K.mesh(new TT.TorusGeometry(2, 0.12, 4, 24), K.mat('#6a6a70'), 6 + i * 3, -0.3, -12, { rx: Math.PI / 2 }); K.staticGroup.add(st); } // stone fish weirs (石滬)
  };
  KITS.xuanwu = (K) => {
    // a temple atop a long stair, blue-lantern posts, basalt terrace
    for (let i = 0; i < 14; i++) K.place(K.box(8 + i * 0.6, 0.45, 1.3, K.mat('#26283a')), 0, -12 - i * 1.3, { y: i * 0.45 });
    const t = new K.T.Group();
    t.add(K.box(12, 4, 6, K.mat('#1a1c2a'), 0, 0, 0));
    t.add(K.box(4, 2.6, 0.1, K.glow('#4a9aff', 1.2), 0, 0.2, 3.02, { cast: false }));
    t.add(PR.roof(K, 13, 7, '#141626', '#3a6ad0', 4, 0.8));
    K.place(t, 0, -32, { y: 6.3 });
    for (const [x, z] of [[-7, -8], [7, -8], [-15, -3], [15, -4]]) { K.place(K.cyl(0.08, 0.1, 3, K.mat('#1a1c24')), x, z); const l = PR.lantern(K, '#3a6ad0', 1); l.position.set(x, 3.1, z); K.out.group.add(l); K.lampHalo(x, 3.1, z, '#4a9aff', 1.4); }
    PR.floatingLanterns(K, 30, [-14, 14, -30, -6], '#6ab8ff', 0.5, 8, 0.25);
  };
  KITS.farshore = (K, th) => {
    // a field of red spider lilies (彼岸花) to the horizon, a lighthouse far off
    const TT = K.T;
    const stems = [];
    for (let i = 0; i < (K.view.lite ? 600 : 2200); i++) { const x = K.r(-40, 40), z = K.r(-40, 12); if (Math.abs(x) < 9.5 && Math.abs(z) < 4 && K.rng() > 0.1) continue; stems.push({ x, z, s: K.r(0.7, 1.3), ry: K.r(0, TAU) }); }
    const flower = new TT.Group();
    const petal = new TT.ConeGeometry(0.06, 0.4, 3); petal.translate(0, 0.2, 0);
    const parts = [];
    for (let k = 0; k < 6; k++) { const g = petal.clone(); g.rotateZ(1.2); g.rotateY(k / 6 * TAU); g.translate(0, 0.55, 0); parts.push(g); }
    const stem = new TT.CylinderGeometry(0.01, 0.015, 0.55, 3); stem.translate(0, 0.275, 0);
    const petals = TT.BufferGeometryUtils.mergeGeometries(parts.map((g) => g.toNonIndexed()));
    PR.instances(K, petals, K.glow('#ff2a1a', 1.1), stems, { cast: false });
    PR.instances(K, stem, K.mat('#3a6a2a'), stems, { cast: false });
    const lh = K.group(K.cyl(0.8, 1.1, 7, K.mat('#2a1a24'), 0, 0, 0), K.cyl(0.6, 0.6, 1, K.glow('#fff0d0', 2.5), 0, 7, 0));
    K.place(lh, 40, -60);
    K.lampHalo(40, 7.5, -60, '#fff0d0', 4);
  };

  // ------------------------------------------------------------------------------------------ team models
  // Prefer the shared G.Models library (nature / architecture / props teams); fall back to the procedural props above.
  // Model origin = footprint centre on the ground, front facing +z (toward the battle camera).
  function gm(K, type, o = {}) {
    if (!G.Models || !G.Models.has || !G.Models.has(type)) return null;
    const obj = Object.assign({ t: type, x: Math.round(o.x || 0) + 1000, y: Math.round(o.z || 0) + 1000, v: o.v != null ? o.v : (K.rng() * 3) | 0, lit: o.lit !== false }, o.obj || {});
    let node = null;
    try { node = G.Models.create(type, obj); } catch (e) { G.warnOnce('b3d model ' + type, e); }
    if (!node) return null;
    const holder = new THREE.Group(); holder.add(node);
    holder.userData.gm = { def: G.Models.defs[type], o: obj, node };
    node.traverse((n) => { if (n.isMesh) { n.receiveShadow = true; if (K.view.lite) n.castShadow = false; } });
    return holder;
  }
  // place a team model (or the fallback) at x,z; returns the node
  function M(K, type, x, z, o = {}, fallback) {
    let node = gm(K, type, Object.assign({ x, z }, o));
    if (node) {
      K.place(node, x, z, { ry: o.ry, s: o.s, y: o.y, dynamic: true });
      K.out.models.push(node);
      return node;
    }
    if (fallback) { node = fallback(); if (node) K.place(node, x, z, { ry: o.ry, s: o.s, y: o.y }); }
    return node;
  }
  A.gm = gm; A.M = M;

  const PINES = ['tree_pine', 'tree_cedar_snow'];
  KITS.meadow = (K, th) => {
    K.ring(16, 21, 15, (x, z) => M(K, 'tree_pine', x, z, { s: K.r(1.1, 1.6) }, () => PR.pine(K, K.r(5, 9))));
    K.ring(10, 30, 22, (x, z) => M(K, 'tree_cedar_snow', x, z, { s: K.r(1.4, 2.2) }, () => PR.pine(K, K.r(7, 11), '#2a4038')), { phase: 0.3 });
    K.ring(12, 14, 9, (x, z) => M(K, K.rng() < 0.3 ? 'rock_big' : 'rock_small', x, z, { s: K.r(0.8, 1.4) }, () => PR.rock(K, K.r(0.3, 0.9), ['#8a8a84', '#6a6a66'])), { phase: 0.15 });
    K.ring(14, 12, 7.5, (x, z) => M(K, K.rng() < 0.5 ? 'flowers' : 'bush', x, z, { s: K.r(0.9, 1.3) }), { phase: 0.4 });
    PR.grassField(K, K.view.lite ? 1500 : 5000, [-26, 26, -18, 14], ['#7aa04a', '#8ab052', '#5a8a3a'], 0.45, { clear: [10, 4.5], inside: 0.15 });
    const path = new K.T.Mesh(new K.T.PlaneGeometry(2.4, 40, 1, 20), K.mat('#a89068', { roughness: 1 }));
    path.rotation.x = -Math.PI / 2; path.position.set(0.5, 0.02, -24); path.receiveShadow = true;
    K.out.group.add(path);
  };
  const forestBase = KITS.forest;
  KITS.forest = (K, th) => {
    if (!G.Models || !G.Models.has('tree_camphor')) { forestBase(K, th); return; }
    for (let i = 0; i < 34; i++) {
      const a = K.r(0, TAU), rr = K.r(12, 32);
      const x = Math.sin(a) * rr * 1.3, z = -Math.cos(a) * rr;
      if (z > 3 && x > -8 && x < 16) continue;
      M(K, K.rng() < 0.45 ? 'tree_cypress' : 'tree_camphor', x, z, { s: K.r(1.8, 2.8) });
    }
    K.ring(12, 14, 9, (x, z) => M(K, 'tree_fern', x, z, { s: K.r(1.1, 1.6) }), { phase: 0.4 });
    K.ring(16, 12, 7.5, (x, z) => M(K, K.rng() < 0.5 ? 'bush' : 'flowers', x, z, { s: K.r(1, 1.4) }, () => PR.fern(K, K.r(0.9, 1.5))), { phase: 0.1 });
    K.ring(6, 15, 9, (x, z, i) => M(K, i % 2 ? 'stump' : 'log', x, z, { ry: K.r(0, TAU) }), { phase: 0.25 });
    PR.grassField(K, K.view.lite ? 1000 : 3500, [-24, 24, -16, 12], ['#5a8a3a', '#6a9a42', '#4a7a32'], 0.35, { clear: [9, 4], inside: 0.25 });
    for (let i = 0; i < 6; i++) {
      const geo = new K.T.CylinderGeometry(0.6, 2.2, 22, 12, 1, true); geo.translate(0, -11, 0);
      const m = new K.T.Mesh(geo, new K.T.MeshBasicMaterial({ color: C('#fff6d8'), transparent: true, opacity: 0.06, blending: K.T.AdditiveBlending, depthWrite: false, side: K.T.DoubleSide, fog: false }));
      m.position.set(K.r(-14, 10), 20, K.r(-14, -4)); m.rotation.z = 0.3; m.rotation.x = 0.15;
      K.out.group.add(m); K.out.disposables.push(() => { geo.dispose(); m.material.dispose(); });
    }
  };
  const mushBase = KITS.mushroom;
  KITS.mushroom = (K, th) => {
    if (!G.Models || !G.Models.has('mushroom_giant')) { mushBase(K, th); return; }
    K.ring(12, 15, 10, (x, z) => M(K, 'mushroom_giant', x, z, { s: K.r(1.4, 2.6), ry: K.r(0, TAU) }));
    K.ring(22, 11, 7, (x, z) => M(K, 'mushroom_glow', x, z, { s: K.r(0.8, 1.4) }), { phase: 0.2 });
    K.ring(14, 26, 18, (x, z) => M(K, 'mushroom_giant', x, z, { s: K.r(2.5, 4) }), { phase: 0.5 });
    K.ring(10, 13, 8, (x, z) => M(K, 'crystal', x, z, { s: K.r(0.8, 1.5) }), { phase: 0.35 });
    PR.grassField(K, K.view.lite ? 800 : 2600, [-22, 22, -16, 12], ['#3a3a7a', '#4a3a8a', '#2a4a6a'], 0.4, { clear: [9, 4], inside: 0.2 });
  };
  const shoreBase = KITS.shore;
  KITS.shore = (K, th) => {
    shoreBase(K, th);
    for (const [x, z, t] of [[-9, -6, 'driftwood'], [12, -6.5, 'seaweed'], [-14, -2, 'seaweed'], [9, 7, 'driftwood']]) M(K, t, x, z, { ry: K.r(0, TAU) });
    M(K, 'stone_lantern', 13.5, -3, { lit: true });
  };
  const beachBase = KITS.beach;
  KITS.beach = (K, th) => {
    const st = th.style;
    if (!G.Models || !G.Models.has('coconut_palm')) { beachBase(K, th); return; }
    if (st === 'linto') {
      K.ring(12, 15, 8, (x, z) => { if (z > -7) M(K, 'pandanus', x, z, { s: K.r(1.2, 1.8) }); });
      K.ring(6, 22, 12, (x, z) => { if (z > -7) M(K, 'coconut_palm', x, z, { s: K.r(1.6, 2.2) }); }, { phase: 0.3 });
    } else if (st === 'orchid') {
      for (const [x, z, s] of [[-18, -9, 3.2], [-13, -12, 2.2], [16, -11, 3.6], [22, -7, 2.6], [-24, -4, 2.8]]) K.place(PR.spire(K, s), x, z);
      for (const [x, z, ry] of [[-10, -3, 0.3], [12, -3.5, -0.4]]) M(K, 'tatala', x, z, { ry }, () => PR.boat(K, 4, '#e8e0d0'));
      K.ring(8, 14, 7, (x, z) => { if (z > -6) M(K, 'rock_small', x, z, { s: K.r(0.8, 1.3) }); });
    } else if (st === 'south') {
      K.ring(8, 15, 7, (x, z) => { if (z > -6) M(K, K.rng() < 0.6 ? 'coconut_palm' : 'tree_betel', x, z, { s: K.r(1.6, 2.2) }); });
      for (let i = 0; i < 6; i++) M(K, 'dock_post', -4 + i * 1.6, -9 - i * 0.2, { y: -0.6 }, () => K.cyl(0.12, 0.14, 2, K.mat('#5a4030')));
      M(K, 'boat_small', 6, -12, { y: -0.45, ry: 0.4 });
    } else {
      K.ring(10, 16, 8, (x, z) => { if (z > -6) M(K, K.rng() < 0.3 ? 'driftwood' : 'rock_small', x, z, { s: K.r(0.8, 1.3), ry: K.r(0, TAU) }); });
      K.ring(5, 22, 12, (x, z) => { if (z > -6) M(K, 'coconut_palm', x, z, { s: K.r(1.6, 2.2) }); }, { phase: 0.2 });
    }
  };
  const jiufenBase = KITS.jiufen;
  KITS.jiufen = (K, th) => {
    if (!G.Models || !G.Models.has('house_jiufen')) { jiufenBase(K, th); return; }
    const night = !!th.night;
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const x = side * (14 + i * 1.5), z = -5 - i * 5.5;
      M(K, i % 2 ? 'teahouse' : 'house_jiufen', x, z, { ry: side > 0 ? -Math.PI / 2 + 0.25 : Math.PI / 2 - 0.25, y: groundOr(K, x, z) + i * 0.6, s: 1.3, lit: night });
    }
    for (let i = 0; i < 3; i++) M(K, 'teahouse', -9 + i * 9, -21 - i * 2, { y: 2 + i, s: 1.3, lit: night });
    for (let i = 0; i < 3; i++) PR.lanternString(K, new K.T.Vector3(-14, 6.5, -4 - i * 4), new K.T.Vector3(14, 6.5, -5 - i * 4), 12, '#e8402a', 0.8);
    for (let i = 0; i < 6; i++) K.place(K.box(10, 0.4, 1.2, K.tmat('pavers', '#8a8078')), 0, -10 - i * 1.2, { y: i * 0.4 });
    M(K, 'stone_lantern', -9, -4, { lit: night }, () => PR.stoneLantern(K, 1.2, night ? '#ffc070' : null));
    M(K, 'stone_lantern', 10, -4.5, { lit: night }, () => PR.stoneLantern(K, 1.2, night ? '#ffc070' : null));
    M(K, 'red_lantern', -12, 1, {}); M(K, 'red_lantern', 12, 0.5, {});
  };
  const streetBase = KITS.street;
  KITS.street = (K, th) => {
    if (!G.Models || !G.Models.has('shophouse')) { streetBase(K, th); return; }
    const st = th.style, night = !!th.night;
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const x = side * 14.5, z = -19 + i * 6;
      if (z > 6) continue;
      M(K, 'shophouse', x, z, { ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, s: 1.25, lit: night || K.rng() < 0.4 });
    }
    M(K, st === 'procession' ? 'city_god_temple' : 'paifang', 0, -26, { s: 1.3, lit: night }, () => PR.house(K, 9, 5, 4, { wall: '#a8342a', roof: '#2a2a30', ridge: '#d8a03a', lit: night }));
    const cols = st === 'procession' ? ['#e8402a', '#ffd23a'] : ['#e8402a'];
    for (let i = 0; i < 4; i++) PR.lanternString(K, new K.T.Vector3(-12, 6, -2 - i * 5), new K.T.Vector3(12, 6, -3 - i * 5), 10, cols[i % cols.length], 0.75);
    if (st === 'procession') for (let i = 0; i < 8; i++) M(K, i % 2 ? 'pilgrim_flag' : 'banner', (i % 2 ? 1 : -1) * 11, -16 + i * 3, {}, () => K.group(K.cyl(0.05, 0.05, 4, K.mat('#3a2a1e'), 0, 0, 0), K.box(0.05, 1.6, 1.0, K.mat(i % 3 ? '#e8b02a' : '#d8342a', { side: K.T.DoubleSide }), 0, 2.2, 0.5)));
    for (const [x, z] of [[-10, -6], [10, -7]]) M(K, 'lamp_post', x, z, { lit: true });
  };
  const templeBase = KITS.temple;
  KITS.temple = (K, th) => {
    if (!G.Models || !G.Models.has('temple')) { templeBase(K, th); return; }
    M(K, 'temple', 0, -17, { s: 1.35, lit: true });
    for (const side of [-1, 1]) K.place(PR.wall(K, 18, 2.4, '#a8443a'), side * 13, -8, { ry: Math.PI / 2 });
    M(K, 'incense_burner', 0, -9.5, { s: 1.6 });
    for (const [x, z] of [[-6, -10], [6, -10]]) M(K, 'statue_lion', x, z, { s: 1.3 }, () => PR.stoneLantern(K, 1.1, '#ffb060'));
    for (const [x, z] of [[-11, -2], [12, -3]]) M(K, 'stone_lantern', x, z, { lit: true }, () => PR.stoneLantern(K, 1.1, '#ffb060'));
    for (const [x, z] of [[-17, -14], [18, -13], [-20, -4], [21, -2]]) M(K, 'tree_camphor', x, z, { s: K.r(2, 2.6) }, () => PR.broadTree(K, K.r(5, 7), ['#2a4a2a', '#3a5a32', '#24402a']));
  };
  const mansionBase = KITS.mansion;
  KITS.mansion = (K, th) => {
    if (!G.Models || !G.Models.has('house_minnan')) { mansionBase(K, th); return; }
    M(K, 'house_minnan', 0, -17, { s: 1.6, lit: true });
    for (const side of [-1, 1]) { K.place(PR.wall(K, 20, 2.6, '#5a3028', '#1a2a2a'), side * 14, -8, { ry: Math.PI / 2 }); M(K, 'house_minnan', side * 11, -12, { ry: side * -Math.PI / 2, s: 1.2, lit: K.rng() < 0.5 }); }
    for (const [x, z] of [[-17, -16], [18, -14], [-19, 2]]) M(K, 'tree_dead', x, z, { s: 2.2 });
    PR.floatingLanterns(K, 10, [-14, 14, -16, -6], '#80ffa0', 0.5, 4, 0.4);
  };
  const tainanBase = KITS.tainan;
  KITS.tainan = (K, th) => {
    if (!G.Models || !G.Models.has('chikan_tower')) { tainanBase(K, th); return; }
    M(K, 'chikan_tower', 0, -20, { s: 1.4 });
    K.place(PR.wall(K, 34, 1.4, '#b8684a', '#8a4a3a'), 0, -13.5);
    for (const [x, z] of [[-17, -10], [17, -11], [-21, -2], [21, -3], [-12, -20], [13, -21]]) M(K, 'tree_maple', x, z, { s: K.r(2, 2.6), v: 0 }, () => PR.broadTree(K, K.r(5, 7), ['#d8401e', '#e85a2a', '#2a5a2a'], '#4a3020'));
  };
  const hakkaBase = KITS.hakka;
  KITS.hakka = (K, th) => {
    if (!G.Models || !G.Models.has('hakka_house')) { hakkaBase(K, th); return; }
    M(K, 'hakka_house', 0, -15, { s: 2.0 });
    for (const [x, z] of [[-17, -8], [18, -7], [-20, 3]]) M(K, 'bamboo', x, z, { s: 2 }, () => PR.bamboo(K, K.r(6, 9), 9));
    for (const [x, z] of [[-10, -6], [10, -6]]) M(K, 'drying_rack', x, z, { s: 1.2 });
  };
  const tribeBase = KITS.tribe;
  KITS.tribe = (K, th) => {
    if (!G.Models || !G.Models.has('slate_house')) { tribeBase(K, th); return; }
    for (const [x, z, ry] of [[-14, -12, 0.3], [12, -14, -0.2], [-4, -19, 0]]) M(K, 'slate_house', x, z, { ry, s: 1.3, lit: true });
    M(K, 'totem', 15, -6, { s: 1.4 }); M(K, 'firepit', -9, -7, { lit: true }); M(K, 'millet_rack', 10, -8, {});
    K.ring(12, 15, 10, (x, z) => M(K, 'rock_small', x, z, { s: K.r(0.8, 1.3) }, () => PR.rock(K, K.r(0.4, 1), ['#4a4a50', '#3a3a40'])));
  };
  const harborBase = KITS.harbor;
  KITS.harbor = (K, th) => {
    harborBase(K, th);
    M(K, 'red_fort', 24, -20, { s: 1.4, y: 3 });
  };
  KITS.grassland = (K) => {
    PR.grassField(K, K.view.lite ? 2000 : 7000, [-30, 30, -24, 14], ['#a8b860', '#c8c880', '#8aa050'], 0.7, { clear: [10, 4.5], inside: 0.2 });
    if (!M(K, 'gate_city', 0, -26, { s: 1.4 })) K.place(PR.wall(K, 40, 3.2, '#9a7a5a', '#6a5a4a'), 0, -26);
    for (const x of [-12, 12, -24, 24]) M(K, 'city_wall', x, -26, { s: 1.4, obj: { w: 8 } });
    for (const [x, z] of [[-20, -10], [22, -14], [-26, -18]]) M(K, K.rng() < 0.5 ? 'tree_banyan' : 'tree_camphor', x, z, { s: 1.6 }, () => PR.broadTree(K, 4, ['#3a6a32', '#4a7a3a']));
  };
  const capeBase = KITS.cape;
  KITS.cape = (K, th) => {
    if (!G.Models || !G.Models.has('lighthouse')) { capeBase(K, th); return; }
    M(K, 'lighthouse', -16, -16, { s: 1.5, lit: true });
    K.lampHalo(-16, 11, -16, '#fff0c0', 4);
    PR.grassField(K, K.view.lite ? 1600 : 5000, [-28, 28, -10, 14], ['#3a5a3a', '#4a6a42', '#2a4a2a'], 0.6, { clear: [10, 4.5], inside: 0.2 });
    K.ring(8, 16, 7, (x, z) => { if (z > -9) M(K, 'rock_small', x, z, {}, () => PR.rock(K, K.r(0.4, 1), ['#4a4a50'])); });
  };
  KITS.cape.pre = capeBase.pre;
  const gorgeBase = KITS.gorge;
  KITS.gorge = (K, th) => {
    gorgeBase(K, th);
    M(K, 'cliff_waterfall', -14, -14, { s: 2.2 });
    for (const [x, z] of [[-8, -7], [9, -8]]) M(K, 'rock_marble', x, z, { s: 1.6 });
  };
  const festBase = KITS.festival;
  KITS.festival = (K, th) => {
    if (!G.Models || !G.Models.has('guzhao')) { festBase(K, th); return; }
    M(K, 'guzhao', 0, -20, { s: 1.3, lit: true });
    for (let i = 0; i < 3; i++) PR.lanternString(K, new K.T.Vector3(-20, 5 + i, -12 - i * 2), new K.T.Vector3(-4, 11, -18), 10, '#ffb040', 0.6);
    for (let i = 0; i < 3; i++) PR.lanternString(K, new K.T.Vector3(20, 5 + i, -12 - i * 2), new K.T.Vector3(4, 11, -18), 10, '#ffb040', 0.6);
    K.ring(10, 16, 8, (x, z) => M(K, 'lamp_post', x, z, { lit: true }, () => PR.lanternPost(K, '#ff9a40', 2.4)));
  };
  const basaltBase = KITS.basalt;
  KITS.basalt = (K, th) => {
    basaltBase(K, th);
    for (let i = 0; i < 3; i++) M(K, 'stone_weir', 4 + i * 6, -13, { y: -0.5 });
  };
  const alishanBase = KITS.alishan;
  KITS.alishan = (K, th) => {
    if (!G.Models || !G.Models.has('tree_cypress')) { alishanBase(K, th); return; }
    for (const [x, z, s] of [[-15, -6, 2.6], [-19, -14, 3.2], [16, -8, 2.8], [21, -15, 3.4], [-12, -18, 2.4], [10, -20, 2.8], [-22, 2, 2.8], [23, 1, 3]]) M(K, 'tree_cypress', x, z, { s });
    K.ring(16, 13, 8.5, (x, z) => M(K, 'tree_fern', x, z, { s: K.r(1, 1.4) }, () => PR.fern(K, K.r(0.8, 1.4))));
    PR.grassField(K, K.view.lite ? 900 : 3000, [-24, 24, -16, 12], ['#5a7a3a', '#6a8a42'], 0.35, { clear: [9, 4], inside: 0.2 });
  };
  const screeBase = KITS.scree;
  KITS.scree = (K, th) => {
    if (!G.Models || !G.Models.has('tree_cedar_snow')) { screeBase(K, th); return; }
    for (let i = 0; i < 30; i++) { const a = K.r(0, TAU), rr = K.r(11, 26); const x = Math.sin(a) * rr * 1.3, z = -Math.cos(a) * rr; if (z > 4 && x > -8 && x < 14) continue; M(K, K.rng() < 0.4 ? 'rock_big' : 'rock_small', x, z, { s: K.r(0.8, 2) }); }
    for (let i = 0; i < 16; i++) M(K, 'tree_cedar_snow', K.r(-30, 30), K.r(-30, -12), { s: K.r(1.2, 2) });
  };
  const visionBase = KITS.vision;
  KITS.vision = (K, th) => {
    visionBase(K, th);
    K.ring(8, 13, 8, (x, z, i) => M(K, i % 2 ? 'geometry_pillar' : 'jewel_flower', x, z, { s: 1.3 }), { phase: 0.2 });
    K.ring(10, 18, 12, (x, z) => M(K, 'crystal', x, z, { s: K.r(1.2, 2) }), { phase: 0.6 });
  };
  const chaosBase = KITS.chaos;
  KITS.chaos = (K, th) => {
    chaosBase(K, th);
    for (const [x, z] of [[-16, -6], [17, -8], [-12, -16]]) M(K, 'tree_dead', x, z, { s: 2 });
  };
  const farBase = KITS.farshore;
  KITS.farshore = (K, th) => {
    if (!G.Models || !G.Models.has('lily')) { farBase(K, th); return; }
    // 彼岸花 to the horizon: instanced lily models would be heavy → keep the instanced field, add model clumps near the stage
    farBase(K, th);
    K.ring(18, 11.5, 6.5, (x, z) => M(K, 'lily', x, z, { v: 0, s: K.r(1, 1.4) }), { phase: 0.1, front: true });
  };
  const mineBase = KITS.mine;
  KITS.mine = (K, th) => {
    mineBase(K, th);
    for (const [x, z, t] of [[13, -5, 'crate'], [14, -3.5, 'barrel'], [-14, 2, 'barrel'], [12, 3, 'crate']]) M(K, t, x, z, { ry: K.r(0, TAU) });
  };
  const palaceBase = KITS.palace;
  KITS.palace = (K, th) => {
    palaceBase(K, th);
    for (const [x, z] of [[-5, -20], [5, -20]]) M(K, 'eternal_lamp', x, z, { lit: true });
  };
  const shrineBase = KITS.shrine;
  KITS.shrine = (K, th) => {
    shrineBase(K, th);
    for (let i = 0; i < 10; i++) { const x = K.r(-13, 13), z = K.r(-17, 5); if (Math.abs(x) < 9.5 && Math.abs(z) < 4.5) continue; M(K, 'lotus', x, z, { y: 0.05 }); }
  };
  const lakeBase = KITS.lake;
  KITS.lake = (K, th) => {
    lakeBase(K, th);
    for (let i = 0; i < 8; i++) M(K, 'lotus', K.r(-14, 14), K.r(-16, -10), { y: th.water.y + 0.05 });
  };
  return A;
})();

// Map3D: real-time 3D presentation of a MapScene (the 2D MapScene stays the source of truth for gameplay).
// Builds terrain (baked painted ground + displaced banks), extruded walls with camera-side cutaway, water,
// sky / fog / sun / moon, dynamic point lights, 3D models (or 2D-art billboards), 3D characters (or sprite
// billboards), world particles, a ground decal + screen overlay for maps' 2D drawGround/drawOver hooks (SplitCtx),
// and an orbit-step diorama camera. Contract: docs/CONTRACTS_3D.md ("2D map hooks in 3D").
'use strict';
G.Map3D = (() => {
  const TT = G.TILE;
  const CH = 16; // tiles per ground chunk
  const WALL_H = { cliff: 2.3, cave_wall: 2.5, wall_plaster: 2.7, wall_brick: 2.7, wall_wood: 2.6, wall_temple: 3.0, hedge: 1.05, wall_slate: 2.5, wall_basalt: 2.2 };
  const CUT_H = { cliff: 0.75, hedge: 0.6 }; // camera-side cutaway heights (default 0.42)
  const INTERIOR_FLOORS = new Set(['wood', 'tile_floor', 'red_carpet', 'mat', 'temple_floor']);
  const WATER_COL = { water: 0x2f6f96, deepwater: 0x1d4a78, shallow: 0x4f9fb0, lake: 0x2f7a8a, river: 0x3a8090, marsh: 0x4d6a48, black_sea: 0x060a16 };
  const DIR_YAW = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const val = (v, ...a) => (typeof v === 'function' ? v(G.state, ...a) : v);

  class Map3D {
    constructor(ms) {
      const T = THREE;
      this.ms = ms;
      this.def = ms.def;
      this.scene = new T.Scene();
      this.camera = new T.PerspectiveCamera(32, G.W / G.H, 0.3, 400);
      this.post = { vignette: 0.36 };
      this.nodes = new Map(); // object instance → node
      this.actors = new Map(); // Actor → { ch, blob }
      this.t = 0;
      const c3 = Object.assign({ pitch: 52, dist: 15, fov: 32, yaw: 0 }, val(this.def.cam3d) || {});
      this.camCfg = c3;
      this.yawStep = Math.round((c3.yaw || 0) / 90) & 3;
      this.yaw = this.yawStep * Math.PI / 2;
      this.classify();
      this.buildEnvironment();
      this.buildGround();
      this.buildWalls();
      this.buildWater();
      this.syncObjects(true);
      this.buildParticles();
      this.buildDecals();
      this.terrainSnap = ms.terrain.slice();
      if (G.Env3D && G.Env3D.decorate) { try { G.Env3D.decorate(this); } catch (e) { G.warnOnce('env3d decorate', e); } }
      if (G.Nature3D && G.Nature3D.scatterGrass) { try { this.grass = G.Nature3D.scatterGrass(this); } catch (e) { G.warnOnce('nature3d grass', e); } }
      if (this.def.build3d) { try { this.def.build3d(this, THREE); } catch (e) { G.warnOnce('build3d ' + this.def.id, e); } }
      this.snapCamera();
    }

    // ------------------------------------------------------------------ setup
    classify() {
      const ms = this.ms, n = ms.w * ms.h;
      let floors = 0, inter = 0, cave = 0;
      for (let i = 0; i < n; i++) {
        const id = ms.terrain[i];
        const d = G.Tiles.get(id);
        if (d && d.wall) continue;
        if (id === 'void') continue;
        floors++;
        if (INTERIOR_FLOORS.has(id)) inter++;
        if (id === 'cave') cave++;
      }
      const iv = val(this.def.interior);
      this.interior = iv != null ? !!iv : floors > 0 && (inter + cave) / floors > 0.55;
      this.cave = cave / Math.max(1, floors) > 0.4;
    }

    isWall(cx, cy) {
      const ms = this.ms;
      if (cx < 0 || cy < 0 || cx >= ms.w || cy >= ms.h) return false;
      const id = ms.terrain[cy * ms.w + cx];
      return WALL_H[id] != null;
    }
    isWater(id) { const d = G.Tiles.get(id); return !!(d && d.water) && !/bridge/.test(id); }
    walkable(cx, cy) {
      const ms = this.ms;
      if (cx < 0 || cy < 0 || cx >= ms.w || cy >= ms.h) return false;
      const id = ms.terrain[cy * ms.w + cx];
      return id !== 'void' && WALL_H[id] == null;
    }

    buildEnvironment() {
      const T = THREE;
      const lc = this.ms.lightCfg || {};
      const dark = G.U.clamp(lc.ambient || 0, 0, 0.95);
      this.dark = dark;
      const bg = new T.Color(val(this.def.bg) || '#05060a');
      const night = new T.Color(lc.color || '#05081a');
      // sky colours: day → bright zenith; night → toward the map's darkness tint
      const dayZen = new T.Color(val(this.def.sky3d) || 0x6fa8dc), dayHor = new T.Color(0xdfe9ee);
      const nightZen = night.clone().lerp(new T.Color(0x0a1230), 0.6), nightHor = night.clone().lerp(new T.Color(0x2a3050), 0.5);
      const zen = dayZen.clone().lerp(nightZen, Math.min(1, dark * 1.2));
      const hor = dayHor.clone().lerp(nightHor, Math.min(1, dark * 1.2));
      this.outdoor = !this.interior && !this.cave;
      const fogCol = this.outdoor ? hor.clone().lerp(bg, 0.15) : (this.cave ? new T.Color(0x07080c) : new T.Color(0x0a0807));
      this.scene.background = this.outdoor ? null : fogCol.clone();
      this.scene.fog = new T.Fog(fogCol, this.outdoor ? 26 : 22, this.outdoor ? 70 : 48);
      if (this.outdoor) {
        const sky = new T.Mesh(new T.SphereGeometry(180, 32, 16), new T.ShaderMaterial({
          side: T.BackSide, depthWrite: false, fog: false,
          uniforms: { zen: { value: zen }, hor: { value: hor }, stars: { value: dark }, time: { value: 0 } },
          vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: `uniform vec3 zen, hor; uniform float stars, time; varying vec3 vP;
            float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
            void main(){ float y = clamp(vP.y, -0.2, 1.0); vec3 c = mix(hor, zen, pow(max(y, 0.0), 0.55));
              if (stars > 0.3) { vec3 q = floor(vP * 260.0); float s = step(0.9965, h(q)); c += s * (stars - 0.3) * 1.6 * (0.6 + 0.4 * sin(time * 2.0 + h(q + 1.0) * 30.0)); }
              gl_FragColor = vec4(c, 1.0); }`,
        }));
        sky.renderOrder = -10;
        sky.frustumCulled = false;
        this.sky = sky;
        this.scene.add(sky);
      }
      // hemisphere + sun/moon
      const amb = this.interior ? 0.55 : 1;
      this.hemi = new T.HemisphereLight(zen.clone().lerp(new T.Color(0xffffff), 0.5), new T.Color(0x5a4a3a).lerp(night, dark), (1.25 - dark * 1.0) * amb);
      this.scene.add(this.hemi);
      const sunCol = dark > 0.45 ? new T.Color(0x9fb6ff) : new T.Color(0xfff0d8).lerp(new T.Color(0xffc890), Math.max(0, dark * 1.5));
      this.sun = new T.DirectionalLight(sunCol, this.interior ? 0.7 : (3.0 - dark * 2.55));
      this.sun.castShadow = true;
      const q = G.settings.quality || 'high';
      const sm = q === 'ultra' ? 4096 : q === 'low' ? 1024 : 2048;
      this.sun.shadow.mapSize.set(sm, sm);
      const sc = this.sun.shadow.camera;
      sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 3;
      this.sunDir = new T.Vector3(-0.55, 1, 0.42).normalize(); // late-afternoon key from upper-left/front
      this.scene.add(this.sun, this.sun.target);
      // image-based lighting from the sky colours (cheap PMREM of a gradient room)
      try {
        const pm = new T.PMREMGenerator(G.R3.renderer);
        const envScene = new T.Scene();
        envScene.background = null;
        const envSky = new T.Mesh(new T.SphereGeometry(10, 16, 8), new T.MeshBasicMaterial({ side: T.BackSide, vertexColors: true }));
        const pos = envSky.geometry.attributes.position, cols = new Float32Array(pos.count * 3);
        const ground = new T.Color(0x3a3228).lerp(night, dark);
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i) / 10;
          const c = y > 0 ? hor.clone().lerp(zen, Math.pow(y, 0.6)) : hor.clone().lerp(ground, Math.min(1, -y * 3));
          cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
        }
        envSky.geometry.setAttribute('color', new T.BufferAttribute(cols, 3));
        envScene.add(envSky);
        this.envRT = pm.fromScene(envScene, 0.04);
        this.scene.environment = this.envRT.texture;
        this.scene.environmentIntensity = (this.interior ? 0.25 : 0.55) * (1 - dark * 0.8);
        pm.dispose();
        envSky.geometry.dispose(); envSky.material.dispose();
      } catch (e) { G.warnOnce('pmrem', e); }
      // point-light pool (fixed count → no shader recompiles)
      this.pool = [];
      const n = q === 'low' ? 6 : 12;
      for (let i = 0; i < n; i++) {
        const l = new T.PointLight(0xffb060, 0, 6, 1.6);
        l.castShadow = false;
        this.scene.add(l);
        this.pool.push(l);
      }
      // post defaults
      this.post.bloom = this.dark > 0.4 ? 0.75 : 0.42;
      this.post.bloomThreshold = this.dark > 0.4 ? 0.62 : 0.86;
      this.post.exposure = this.interior ? 1.05 : 1.0;
      this.post.vignette = this.dark > 0.4 ? 0.5 : 0.34;
    }

    rebuildEnvironment() {
      for (const o of [this.sky, this.hemi, this.sun, this.sun && this.sun.target, ...(this.pool || []), ...(this.halos || [])]) if (o) { this.scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
      if (this.envRT) this.envRT.dispose();
      this.sky = null; this.halos = [];
      this.buildEnvironment();
      if (this.apron && this.outdoor) this.apron.material.color.copy(this.edgeColor());
    }

    // ------------------------------------------------------------------ terrain
    // vertex height on the half-tile lattice (hx, hz in half-tiles)
    heightAt(hx, hz) {
      const ms = this.ms;
      const cells = [];
      const ex = hx % 2 === 0, ez = hz % 2 === 0; // on a tile edge?
      const xs = ex ? [hx / 2 - 1, hx / 2] : [(hx - 1) / 2];
      const zs = ez ? [hz / 2 - 1, hz / 2] : [(hz - 1) / 2];
      for (const x of xs) for (const z of zs) {
        const cx = G.U.clamp(x, 0, ms.w - 1), cz = G.U.clamp(z, 0, ms.h - 1);
        cells.push(ms.terrain[cz * ms.w + cx]);
      }
      let water = 0, deep = 0;
      for (const id of cells) if (this.isWater(id)) { water++; if (id !== 'shallow' && id !== 'marsh') deep++; }
      if (!water) return 0;
      if (water === cells.length) return deep === cells.length ? -0.48 : -0.2;
      return -0.12;
    }

    buildGround() {
      const T = THREE, ms = this.ms;
      const q = G.settings.quality || 'high';
      const PX = q === 'ultra' ? 96 : q === 'low' ? 40 : 64; // texels per tile
      this.groundGroup = new T.Group();
      this.scene.add(this.groundGroup);
      this.chunks = [];
      for (let y0 = 0; y0 < ms.h; y0 += CH) for (let x0 = 0; x0 < ms.w; x0 += CH) {
        const cw = Math.min(CH, ms.w - x0), chh = Math.min(CH, ms.h - y0);
        const ch = { x0, y0, cw, ch: chh, PX };
        this.bakeChunk(ch);
        const nx = cw * 2, nz = chh * 2;
        const geo = new T.PlaneGeometry(cw, chh, nx, nz);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const lx = pos.getX(i) + cw / 2, lz = pos.getZ(i) + chh / 2;
          pos.setY(i, this.heightAt(Math.round((x0 + lx) * 2), Math.round((y0 + lz) * 2)));
        }
        geo.computeVertexNormals();
        const mat = G.R3M.env({ map: ch.tex, roughness: 0.92, cutout: false });
        const mesh = new T.Mesh(geo, mat);
        mesh.position.set(x0 + cw / 2, 0, y0 + chh / 2);
        mesh.receiveShadow = true;
        ch.mesh = mesh;
        this.groundGroup.add(mesh);
        this.chunks.push(ch);
      }
      // apron beyond the map edges (outdoors) so the world doesn't end in a hard line
      if (this.outdoor) {
        const edge = this.edgeColor();
        const apron = new T.Mesh(new T.PlaneGeometry(400, 400), G.R3M.env({ color: edge, roughness: 1, cutout: false }));
        apron.rotation.x = -Math.PI / 2;
        apron.position.set(ms.w / 2, -0.03, ms.h / 2);
        apron.receiveShadow = true;
        this.apron = apron;
        this.scene.add(apron);
      }
    }

    edgeColor() {
      // average colour of the outer ring of baked chunks
      const T = THREE;
      try {
        const c = this.chunks[0].canvas;
        const g = c.getContext('2d');
        const d = g.getImageData(0, 0, Math.min(c.width, 64), Math.min(c.height, 64)).data;
        let r = 0, gg = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 16) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
        return new T.Color(r / n / 255, gg / n / 255, b / n / 255).convertSRGBToLinear().multiplyScalar(0.8);
      } catch (e) { return new T.Color(0x2a3a22); }
    }

    bakeChunk(ch) {
      const ms = this.ms, PX = ch.PX;
      if (!ch.canvas) {
        ch.canvas = document.createElement('canvas');
        ch.canvas.width = ch.cw * PX; ch.canvas.height = ch.ch * PX;
      }
      const g = ch.canvas.getContext('2d');
      g.setTransform(PX / TT, 0, 0, PX / TT, 0, 0);
      g.fillStyle = '#000'; g.fillRect(0, 0, ch.cw * TT, ch.ch * TT);
      const w = ms.w, h = ms.h, terr = ms.terrain;
      for (let cy = ch.y0; cy < ch.y0 + ch.ch; cy++) for (let cx = ch.x0; cx < ch.x0 + ch.cw; cx++) {
        const id = terr[cy * w + cx];
        if (id === 'void') continue;
        const nb = (dx, dy) => { const nx = cx + dx, ny = cy + dy; return nx < 0 || ny < 0 || nx >= w || ny >= h ? id : terr[ny * w + nx]; };
        try { if (G.Tiles.defs[id]) G.Tiles.draw(g, id, (cx - ch.x0) * TT, (cy - ch.y0) * TT, nb, cx, cy, 0); }
        catch (e) { G.warnOnce('bake ' + id, e); }
      }
      if (ch.tex) ch.tex.needsUpdate = true;
      else { ch.tex = G.R3M.canvasTex(ch.canvas); ch.tex.wrapS = ch.tex.wrapT = THREE.ClampToEdgeWrapping; }
    }

    // ------------------------------------------------------------------ walls
    wallHeight(cx, cy) {
      const ms = this.ms;
      const id = ms.terrain[cy * ms.w + cx];
      let hgt = WALL_H[id];
      if (hgt == null) return 0;
      if (id === 'cliff' || id === 'wall_basalt' || id === 'cave_wall') hgt += (G.U.hash(cx, cy, 3) - 0.5) * 0.5;
      // camera-side cutaway: a wall with open floor on the far side (relative to the camera) would hide it
      const [fx, fz] = this.awayDir();
      if (this.walkable(cx + fx, cy + fz) || (this.interior && this.walkable(cx + fx * 2, cy + fz * 2) && !this.isWall(cx + fx, cy + fz))) {
        hgt = Math.min(hgt, CUT_H[id] != null ? CUT_H[id] : 0.42);
      }
      return hgt;
    }
    // grid direction pointing away from the camera (camera yaw 0 looks north = -z)
    awayDir() { return [[0, -1], [-1, 0], [0, 1], [1, 0]][this.yawStep]; }

    wallTex(id, kind) {
      const art = G.Tiles.art && G.Tiles.art[id];
      if (!art) return null;
      this._wt = this._wt || {};
      const key = id + kind;
      if (this._wt[key] !== undefined) return this._wt[key];
      let res = null;
      try {
        const src = kind === 'top' ? (art.topTex && art.topTex()) : (art.faceTex && art.faceTex());
        if (src) {
          const sc = src.sc || G.S, ts = src.ts || 256;
          const c = document.createElement('canvas');
          c.width = Math.round(ts * sc); c.height = kind === 'top' ? Math.round(ts * sc) : src.height;
          c.getContext('2d').drawImage(src, 0, 0, c.width, c.height, 0, 0, c.width, c.height);
          const tx = G.R3M.canvasTex(c, { wrap: true });
          res = { tex: tx, n: src.n || ts / TT, hUnits: kind === 'top' ? 1 : (src.height / sc) / TT };
        }
      } catch (e) { G.warnOnce('walltex ' + id, e); }
      this._wt[key] = res;
      return res;
    }

    buildWalls() {
      const T = THREE, ms = this.ms;
      if (this.wallGroup) { this.scene.remove(this.wallGroup); G.R3.dispose(this.wallGroup); }
      this.wallGroup = new T.Group();
      this.scene.add(this.wallGroup);
      const byType = {};
      const H = new Float32Array(ms.w * ms.h);
      for (let cy = 0; cy < ms.h; cy++) for (let cx = 0; cx < ms.w; cx++) H[cy * ms.w + cx] = this.wallHeight(cx, cy);
      const hAt = (x, y) => (x < 0 || y < 0 || x >= ms.w || y >= ms.h ? -1 : H[y * ms.w + x]);
      for (let cy = 0; cy < ms.h; cy++) for (let cx = 0; cx < ms.w; cx++) {
        const h = H[cy * ms.w + cx];
        if (!h) continue;
        const id = ms.terrain[cy * ms.w + cx];
        const b = byType[id] || (byType[id] = { top: { p: [], n: [], uv: [] }, face: { p: [], n: [], uv: [] } });
        const top = this.wallTex(id, 'top'), face = this.wallTex(id, 'face');
        const tn = top ? top.n : 1, fn = face ? face.n : 1, fh = face ? face.hUnits * 1.6 : 1.2;
        // top
        quad(b.top, [cx, h, cy], [cx + 1, h, cy], [cx + 1, h, cy + 1], [cx, h, cy + 1], [0, 1, 0],
          [cx / tn, -cy / tn], [(cx + 1) / tn, -cy / tn], [(cx + 1) / tn, -(cy + 1) / tn], [cx / tn, -(cy + 1) / tn]);
        // sides
        const sides = [
          [0, -1, [cx + 1, cy], [cx, cy], [0, 0, -1]],
          [0, 1, [cx, cy + 1], [cx + 1, cy + 1], [0, 0, 1]],
          [-1, 0, [cx, cy], [cx, cy + 1], [-1, 0, 0]],
          [1, 0, [cx + 1, cy + 1], [cx + 1, cy], [1, 0, 0]],
        ];
        for (const [dx, dy, a, bb, nrm] of sides) {
          const nh = hAt(cx + dx, cy + dy);
          if (nh < 0) continue; // map edge
          if (nh >= h) continue;
          const u0 = (dx ? cy : cx) / fn, u1 = u0 + 1 / fn;
          quad(b.face, [a[0], h, a[1]], [bb[0], h, bb[1]], [bb[0], nh, bb[1]], [a[0], nh, a[1]], nrm,
            [u0, 1 - (0) / fh], [u1, 1 - 0 / fh], [u1, 1 - (h - nh) / fh], [u0, 1 - (h - nh) / fh]);
        }
      }
      for (const id in byType) {
        const b = byType[id];
        const top = this.wallTex(id, 'top'), face = this.wallTex(id, 'face');
        const tint = id === 'hedge' ? 0xffffff : 0xffffff;
        const mk = (buf, tex) => {
          if (!buf.p.length) return;
          const geo = new T.BufferGeometry();
          geo.setAttribute('position', new T.Float32BufferAttribute(buf.p, 3));
          geo.setAttribute('normal', new T.Float32BufferAttribute(buf.n, 3));
          geo.setAttribute('uv', new T.Float32BufferAttribute(buf.uv, 2));
          const mat = G.R3M.env({ map: tex ? tex.tex : null, color: tex ? tint : 0x6a5a4a, roughness: 0.9 });
          const m = new T.Mesh(geo, mat);
          m.castShadow = true; m.receiveShadow = true;
          this.wallGroup.add(m);
        };
        mk(b.top, top); mk(b.face, face);
      }
      function quad(buf, a, b, c, d, n, ua, ub, uc, ud) {
        buf.p.push(...a, ...b, ...c, ...a, ...c, ...d);
        for (let i = 0; i < 6; i++) buf.n.push(...n);
        buf.uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
      }
    }

    // ------------------------------------------------------------------ water
    buildWater() {
      const T = THREE, ms = this.ms;
      const counts = {};
      let any = 0, edge = false;
      for (let cy = 0; cy < ms.h; cy++) for (let cx = 0; cx < ms.w; cx++) {
        const id = ms.terrain[cy * ms.w + cx];
        if (!this.isWater(id)) continue;
        any++; counts[id] = (counts[id] || 0) + 1;
        if (cx === 0 || cy === 0 || cx === ms.w - 1 || cy === ms.h - 1) edge = true;
      }
      if (!any) return;
      const main = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      const col = new T.Color(WATER_COL[main] != null ? WATER_COL[main] : 0x2f6f96);
      const nrm = G.R3M.tex('waternrm', 256, 256, paintWaterNormal, { wrap: true, srgb: false });
      const mat = new T.MeshPhysicalMaterial({
        color: col, roughness: 0.08, metalness: 0, transparent: true, opacity: main === 'black_sea' ? 0.96 : 0.82,
        normalMap: nrm, normalScale: new T.Vector2(0.35, 0.35), clearcoat: 0.6, clearcoatRoughness: 0.15,
        envMapIntensity: 1.2, depthWrite: false,
      });
      const uT = { value: 0 };
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uT = uT;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        // two scrolling normal layers + fresnel-driven opacity
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uT; varying vec3 vWP;')
          .replace('#include <normal_fragment_maps>', `
            vec3 n1 = texture2D(normalMap, vWP.xz * 0.23 + vec2(uT * 0.021, uT * 0.013)).xyz * 2.0 - 1.0;
            vec3 n2 = texture2D(normalMap, vWP.xz * 0.11 - vec2(uT * 0.017, -uT * 0.019)).xyz * 2.0 - 1.0;
            vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, n1.z * n2.z));
            normal = normalize(tbn * mapN);`)
          .replace('#include <opaque_fragment>', `
            float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
            diffuseColor.a = clamp(diffuseColor.a * (0.72 + 0.6 * fres), 0.0, 1.0);
            #include <opaque_fragment>`);
      };
      mat.customProgramCacheKey = () => 'water3d';
      this.waterU = uT;
      const size = edge ? 400 : Math.max(ms.w, ms.h) + 4;
      const geo = new T.PlaneGeometry(size, size);
      geo.rotateX(-Math.PI / 2);
      const water = new T.Mesh(geo, mat);
      water.position.set(ms.w / 2, -0.07, ms.h / 2);
      water.receiveShadow = true;
      water.renderOrder = 2;
      this.water = water;
      this.scene.add(water);
      if (edge && this.apron) this.apron.position.y = -0.6; // open sea: sink the land apron below the waves
    }

    // ------------------------------------------------------------------ objects
    objNode(o) {
      let node = null;
      const fp = this.footprint(o);
      if (G.Models.has(o.t)) node = G.Models.create(o.t, o);
      if (!node) node = G.Models.billboard(o);
      if (!node) node = new THREE.Group();
      const holder = new THREE.Group();
      holder.add(node);
      holder.position.set(o.x + fp[0] / 2, 0, o.y + fp[1] / 2);
      if (o.rot3d) holder.rotation.y = o.rot3d;
      holder.userData.o = o;
      holder.userData.sig = this.objSig(o);
      holder.userData.def = G.Models.defs[o.t] || null;
      holder.traverse((n) => { if (n.isMesh && n.receiveShadow === false && !n.userData.outline) n.receiveShadow = true; });
      return holder;
    }
    footprint(o) { const d = G.Objects.get(o.t); return [o.w || (d ? d.w : 1), o.h || (d ? d.h : 1)]; }
    objSig(o) { return o.t + '|' + o.x + ',' + o.y + '|' + (o.open ? 1 : 0) + '|' + (o.v || 0) + '|' + (o.state || '') + '|' + (o.lit ? 1 : 0) + '|' + (o.on ? 1 : 0) + '|' + (o.text || '') + '|' + (o.color || '') + '|' + (o.hang || '') + '|' + (o.w || ''); }

    syncObjects(initial) {
      const ms = this.ms;
      const seen = new Set();
      for (const o of ms.objects) {
        seen.add(o);
        let node = this.nodes.get(o);
        if (node && node.userData.sig !== this.objSig(o)) { this.scene.remove(node); this.nodes.delete(o); node = null; }
        if (!node) { node = this.objNode(o); this.nodes.set(o, node); this.scene.add(node); }
        const on = ms.objActive(o);
        node.visible = on;
      }
      for (const [o, node] of this.nodes) if (!seen.has(o)) { this.scene.remove(node); this.nodes.delete(o); }
    }

    // ------------------------------------------------------------------ actors
    charFor(a, isPlayer) {
      let rec = this.actors.get(a);
      const id = isPlayer ? (G.state.party[0] || 'xinghe') : (a.sprite || a.id);
      if (rec && rec.id !== id) { this.scene.remove(rec.ch.root); rec.ch.dispose && rec.ch.dispose(); rec = null; }
      if (!rec) {
        let ch = null;
        if (G.Char3D && G.Char3D.has && G.Char3D.has(id)) { try { ch = G.Char3D.create(id, { context: 'map' }); } catch (e) { G.warnOnce('char3d ' + id, e); } }
        if (!ch) ch = new G.Models.CharBillboard(id);
        const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: G.R3M.blobTex(), transparent: true, depthWrite: false }));
        blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; blob.renderOrder = 1;
        ch.root.add(blob);
        rec = { id, ch, blob, yaw: DIR_YAW[a.dir] || 0, lastX: a.px, lastY: a.py };
        this.actors.set(a, rec);
        this.scene.add(ch.root);
      }
      return rec;
    }
    enemyFor(e) {
      let rec = this.actors.get(e);
      if (!rec) {
        const art = e.def.art || (G.Data.troops[e.def.troop] && G.Data.enemies[G.Data.troops[e.def.troop].enemies[0]] && G.Data.enemies[G.Data.troops[e.def.troop].enemies[0]].art);
        let ch = null;
        if (e.def.sprite) ch = (G.Char3D && G.Char3D.has && G.Char3D.has(e.def.sprite)) ? G.Char3D.create(e.def.sprite, { context: 'map' }) : new G.Models.CharBillboard(e.def.sprite);
        else if (G.Mon3D && G.Mon3D.has && G.Mon3D.has(art)) { try { ch = G.Mon3D.create(art, { context: 'map', variant: e.def.variant || 0 }); } catch (er) { G.warnOnce('mon3d ' + art, er); } }
        if (!ch) ch = G.Models.monsterBillboard(art, { height: 1.35 * (e.def.mapScale ? e.def.mapScale / 0.45 : 1), variant: e.def.variant || 0 });
        const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: G.R3M.blobTex(), transparent: true, depthWrite: false }));
        blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015;
        ch.root.add(blob);
        rec = { id: art, ch, blob, yaw: DIR_YAW[e.dir] || 0, enemy: true };
        this.actors.set(e, rec);
        this.scene.add(ch.root);
      }
      return rec;
    }

    syncActor(a, rec, dt, opts = {}) {
      const ch = rec.ch;
      const x = a.px / TT, z = (a.py + 8) / TT - 0.5;
      const lift = ((a.jumpY || 0) + (a.jump || 0) - (a.offsetY || 0)) / TT;
      ch.root.position.set(x, lift, z);
      ch.root.visible = opts.visible !== false;
      // smooth turning
      const target = DIR_YAW[a.dir] != null ? DIR_YAW[a.dir] : rec.yaw;
      const d = wrapA(target - rec.yaw);
      rec.yaw = wrapA(rec.yaw + d * Math.min(1, dt * 16));
      ch.setFacing(rec.yaw);
      // locomotion speed (tiles/s) from actual displacement → feeds the animation blend
      const vx = (a.px - (rec.lastX != null ? rec.lastX : a.px)) / TT, vz = (a.py - (rec.lastY != null ? rec.lastY : a.py)) / TT;
      rec.lastX = a.px; rec.lastY = a.py;
      const sp = dt > 0 ? Math.hypot(vx, vz) / dt : 0;
      rec.speed = (rec.speed || 0) + (sp - (rec.speed || 0)) * Math.min(1, dt * 12);
      ch.setMove(a.moving || a.walkInPlace ? Math.max(rec.speed, a.walkInPlace ? 1.5 : 0) : (rec.speed > 0.2 ? rec.speed : 0));
      if (a.anim3d !== rec.anim3d) { rec.anim3d = a.anim3d; if (a.anim3d) ch.play(a.anim3d, { loop: true }); else ch.play(null); }
      if (a.emote && a.emote !== rec.emote) { rec.emote = a.emote; if (ch.emote) ch.emote(a.emote.k); }
      if (!a.emote) rec.emote = null;
      if (ch.setOpacity) ch.setOpacity(a.alpha != null ? a.alpha : 1, !!a.ghost);
      if (ch.update) ch.update(dt, this.yaw, this.camera);
    }

    syncActors(dt) {
      const ms = this.ms, vis = ms.visionOn();
      const live = new Set();
      const P = ms.player;
      live.add(P);
      this.syncActor(P, this.charFor(P, true), dt, { visible: P.visible });
      for (const f of ms.followers) { live.add(f); this.syncActor(f, this.charFor(f, false), dt, { visible: f.visible && !ms.hideFollowers }); }
      for (const n of ms.npcs) { live.add(n); this.syncActor(n, this.charFor(n, false), dt, { visible: n.visible && (!n.spirit || vis) }); }
      for (const e of ms.enemies) {
        live.add(e);
        const rec = this.enemyFor(e);
        this.syncActor(e, rec, dt, { visible: true });
        if (e.stun > 0 && rec.ch.setOpacity) rec.ch.setOpacity(0.5 + 0.3 * Math.sin(this.t * 30), false);
      }
      for (const [a, rec] of this.actors) if (!live.has(a)) { this.scene.remove(rec.ch.root); if (rec.ch.dispose) rec.ch.dispose(); this.actors.delete(a); }
      // look-at: NPCs near the player glance at him; the player looks at the interact target
      const it = ms.interactTarget;
      const pRec = this.actors.get(P);
      if (pRec && pRec.ch.lookAt) {
        const tgt = it && it.kind === 'npc' ? it.npc : null;
        if (tgt) { const r = this.actors.get(tgt); pRec.ch.lookAt(r ? r.ch.root.position.clone().setY(1.45) : null); } else pRec.ch.lookAt(null);
      }
      for (const n of ms.npcs) {
        const r = this.actors.get(n);
        if (!r || !r.ch.lookAt) continue;
        const d = Math.hypot(n.px - P.px, n.py - P.py) / TT;
        r.ch.lookAt(d < 2.6 && !n.noLook ? new THREE.Vector3(P.px / TT, 1.45, (P.py + 8) / TT - 0.5) : null);
      }
    }

    // ------------------------------------------------------------------ lights
    collectLights() {
      const ms = this.ms, out = [];
      for (const o of ms.objects) {
        if (!ms.objActive(o)) continue;
        const md = G.Models.defs[o.t];
        const fp = this.footprint(o);
        if (md && md.lights) {
          // light offsets are in model space: rotate them with the model's o.rot3d (THREE y-rotation)
          const cr = Math.cos(o.rot3d || 0), sr = Math.sin(o.rot3d || 0);
          for (const l of md.lights(o) || []) {
            const lx = l.x || 0, lz = l.z || 0;
            out.push({ x: o.x + fp[0] / 2 + lx * cr + lz * sr, y: l.y != null ? l.y : 1.2, z: o.y + fp[1] / 2 - lx * sr + lz * cr, color: l.color || '#ffb060', i: l.intensity || 1, r: l.distance || 4, flicker: l.flicker || 0 });
          }
          continue;
        }
        const d = G.Objects.get(o.t);
        if (d && d.lights) {
          for (const l of d.lights(o) || []) {
            // 2D: offset from the footprint's top-left in px; vertical offset above the footprint base ≈ height
            const base = (o.y + fp[1]) * TT;
            const ly = o.y * TT + l.dy;
            const hgt = G.U.clamp((base - ly) / TT * 0.85, 0.3, 4);
            out.push({ x: (o.x * TT + l.dx) / TT, y: hgt, z: o.y + fp[1] - 0.35, color: l.color, i: 1, r: (l.r || 120) / TT * 1.4, flicker: l.flicker || 0 });
          }
        }
        if (o.light) out.push({ x: o.x + 0.5, y: 1.1, z: o.y + 0.5, color: o.light.color || '#ffb060', i: 1, r: (o.light.r || 160) / TT * 1.4, flicker: o.light.flicker || 0 });
      }
      for (const n of ms.npcs) if (n.light && n.visible) out.push({ x: n.px / TT, y: 1.2, z: (n.py + 8) / TT - 0.3, color: n.light.color || '#ffb060', i: 1, r: (n.light.r || 120) / TT * 1.4, flicker: 0.2 });
      for (const l of val(this.def.lights) || []) out.push({ x: l.x + 0.5, y: l.h3d || 1.2, z: l.y + 0.5, color: l.color, i: 1, r: (l.r || 140) / TT * 1.4, flicker: l.flicker || 0 });
      const lc = ms.lightCfg || {};
      const P = ms.player;
      if (lc.player !== false && (lc.ambient || 0) > 0.25) out.push({ x: P.px / TT, y: 1.6, z: (P.py + 8) / TT - 0.2, color: lc.playerColor || '#ffcf8a', i: 0.8, r: (lc.playerR || 200) / TT * 1.3, flicker: 0.1, player: true });
      if (G.state.vars.vision > 0 || val(this.def.psychedelic)) out.push({ x: P.px / TT, y: 1.4, z: (P.py + 8) / TT, color: '#c89aff', i: 1.1, r: 5, flicker: 0.1, player: true });
      // characters' own lights (lantern props)
      for (const [, rec] of this.actors) if (rec.ch.lights) for (const l of rec.ch.lights()) out.push(l);
      return out;
    }

    updateLights() {
      const T = THREE;
      const ls = this.collectLights();
      const tx = this.camTarget.x, tz = this.camTarget.z;
      for (const l of ls) l.d = Math.hypot(l.x - tx, l.z - tz) - (l.player ? 100 : 0);
      ls.sort((a, b) => a.d - b.d);
      const nightK = 0.5 + this.dark * 1.4;
      for (let i = 0; i < this.pool.length; i++) {
        const pl = this.pool[i], l = ls[i];
        if (!l || l.d > 22) { pl.intensity = 0; continue; }
        pl.color.set(l.color);
        pl.position.set(l.x, l.y, l.z);
        pl.distance = l.r * 1.25;
        const fl = l.flicker ? 1 - l.flicker * 0.5 * (0.5 + 0.5 * Math.sin(this.t * 13 + i * 2.1) * Math.sin(this.t * 7.3 + i)) : 1;
        pl.intensity = l.i * nightK * 2.2 * fl * Math.min(1, l.r * 0.5);
      }
      // halos for every light (bloom does the rest)
      this.halos = this.halos || [];
      let k = 0;
      for (const l of ls) {
        if (l.player || l.d > 30) continue;
        let h = this.halos[k];
        if (!h) {
          h = new T.Sprite(new T.SpriteMaterial({ map: G.R3M.glowTex(), blending: T.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
          this.halos.push(h); this.scene.add(h);
        }
        h.visible = true;
        h.material.color.set(l.color).multiplyScalar(0.6 + this.dark * 0.9);
        const s = (0.55 + Math.min(1.4, l.r * 0.12)) * (1 + (l.flicker || 0) * 0.15 * Math.sin(this.t * 11 + k));
        h.scale.set(s, s, 1);
        h.position.set(l.x, l.y, l.z);
        k++;
      }
      for (; k < this.halos.length; k++) this.halos[k].visible = false;
    }

    // ------------------------------------------------------------------ particles (world-space presets → 3D)
    buildParticles() {
      const T = THREE, ms = this.ms;
      this.pGroups = [];
      for (const g of ms.particles.groups) {
        if (g.p.space !== 'world') continue;
        const n = g.parts.length;
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
        geo.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
        const mat = new T.PointsMaterial({ size: 0.22, map: G.R3M.glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, sizeAttenuation: true });
        const pts = new T.Points(geo, mat);
        pts.frustumCulled = false;
        this.scene.add(pts);
        this.pGroups.push({ g, pts });
      }
    }
    updateParticles() {
      const c = new THREE.Color();
      for (const { g, pts } of this.pGroups) {
        const pos = pts.geometry.attributes.position, col = pts.geometry.attributes.color;
        g.parts.forEach((q, i) => {
          pos.setXYZ(i, q.x / TT, 0.5 + 0.6 * (0.5 + 0.5 * Math.sin(q.ph * 0.9 + i)), q.y / TT);
          const k = 0.5 + 0.5 * Math.sin(q.ph * 3 + i);
          c.set(q.c || '#ffffaa').multiplyScalar(0.4 + k * 1.6);
          col.setXYZ(i, c.r, c.g, c.b);
        });
        pos.needsUpdate = true; col.needsUpdate = true;
      }
    }

    // ------------------------------------------------------------------ 2D map hooks: ground decal + screen overlay
    // drawGround / drawMechFloor / drawOver (def- and instance-level) run every frame through a SplitCtx: world-space
    // drawing lands on a canvas texture laid over the ground; screen-space drawing (after ctx.translate(cam.x, cam.y),
    // ms.screenSpace(), setTransform/resetTransform, or rects that fill the view) goes to the 2D overlay canvas above
    // the 3D frame. See docs/CONTRACTS_3D.md "2D map hooks in 3D".
    hookCount() {
      const ms = this.ms;
      const mech = !!(ms.drawMechFloor && ((this.def.winds && this.def.winds.length) || ms.npcs.some((n) => n.guard)));
      return ms.hooks('drawGround').length + ms.hooks('drawOver').length + (mech ? 1 : 0);
    }
    buildDecals() {
      this.hasDecals = this.hookCount() > 0;
      if (this.hasDecals) this.ensureDecal();
    }
    ensureDecal() {
      if (this.decal) return;
      const T = THREE, ms = this.ms;
      const S = Math.min(32, Math.floor(4096 / Math.max(ms.w, ms.h)));
      this.decalS = S;
      this.decalCanvas = document.createElement('canvas');
      this.decalCanvas.width = ms.w * S; this.decalCanvas.height = ms.h * S;
      this.decalTex = G.R3M.canvasTex(this.decalCanvas);
      const mat = new T.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const geo = new T.PlaneGeometry(ms.w, ms.h);
      geo.rotateX(-Math.PI / 2);
      this.decal = new T.Mesh(geo, mat);
      this.decal.position.set(ms.w / 2, 0.035, ms.h / 2);
      this.decal.renderOrder = 3;
      this.decal.visible = false;
      this.scene.add(this.decal);
    }
    // screen: the 2D overlay context (MapScene.draw3d passes its ctx; G.ctx otherwise) — sets the transform and size
    // of the screen layer
    updateDecals(screen) {
      const ms = this.ms, t = ms.t;
      if (!this.hookCount()) { if (this.decal && this.decal.visible) this.clearDecal(); return; }
      this.ensureDecal();
      this.hasDecals = true;
      const sp = this.split || (this.split = new SplitCtx(this));
      const ctx = sp.begin(screen || G.ctx);
      try {
        sp.phase = 'ground';
        for (const f of ms.hooks('drawGround')) f(ctx, t, ms);
        if (ms.drawMechFloor) ms.drawMechFloor(ctx, t);
        sp.phase = 'over';
        for (const f of ms.hooks('drawOver')) f(ctx, t, ms);
      } catch (e) { G.warnOnce('map hook ' + this.def.id, e); }
      const drew = sp.end();
      // upload only when something was drawn (this frame or the last one, which must be cleared away)
      if (drew || this.decal.visible) this.decalTex.needsUpdate = true;
      this.decal.visible = drew;
    }
    // composite the screen-space output of this frame's 2D hooks onto the overlay (called by MapScene.draw3d)
    drawHookLayer(ctx) {
      const sp = this.split;
      if (!sp || !sp.layerUsed) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(sp.layer, 0, 0);
      ctx.restore();
    }
    clearDecal() {
      const g = this.decalCanvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.decalCanvas.width, this.decalCanvas.height);
      this.decalTex.needsUpdate = true;
      this.decal.visible = false;
    }

    // ------------------------------------------------------------------ camera
    get camTarget() { return this._ct || (this._ct = new THREE.Vector3()); }
    desiredTarget() {
      const ms = this.ms;
      let x, z;
      if (ms.cam.tx != null) { x = (ms.cam.tx + G.W / 2) / TT; z = (ms.cam.ty + G.H / 2 + 24) / TT; }
      else { const a = ms.actor(ms.cam.follow) || ms.player; x = a.px / TT; z = (a.py + 8) / TT - 0.5; }
      // keep the view over the map
      const mx = Math.min(7, ms.w / 2), mz = Math.min(4.5, ms.h / 2);
      x = G.U.clamp(x, mx, Math.max(mx, ms.w - mx));
      z = G.U.clamp(z, mz, Math.max(mz, ms.h - mz + 1));
      return [x, z];
    }
    snapCamera() {
      const [x, z] = this.desiredTarget();
      this.camTarget.set(x, 0, z);
      this.placeCamera();
    }
    placeCamera() {
      const c = this.camCfg, cam = this.camera;
      const pitch = (c.pitch || 52) * Math.PI / 180, dist = (c.dist || 15) * (this.zoom || 1);
      const [sx, sy] = G.Render.shakeOffset();
      const tgt = this.camTarget.clone().add(new THREE.Vector3(sx / TT * 0.5, 0.6, sy / TT * 0.5));
      cam.position.set(tgt.x + Math.sin(this.yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(this.yaw) * Math.cos(pitch) * dist);
      cam.fov = c.fov || 32;
      cam.updateProjectionMatrix();
      cam.lookAt(tgt);
      // shadow frustum follows the view
      const s = this.sun;
      s.position.copy(this.camTarget).addScaledVector(this.sunDir, 30);
      s.target.position.copy(this.camTarget);
      s.target.updateMatrixWorld();
      if (this.sky) this.sky.position.copy(cam.position);
    }
    // rotate the camera in 90° steps (Q/E on the field)
    rotate(step) {
      this.yawStep = (this.yawStep + step + 4) & 3;
      this.yawGoal = this.yawStep * Math.PI / 2;
      this.buildWalls();
    }
    // map input direction from screen space to grid space under the current camera yaw
    remapDir(d) {
      if (!d || !this.yawStep) return d;
      const order = ['up', 'right', 'down', 'left'];
      return order[(order.indexOf(d) + this.yawStep) & 3];
    }

    // ------------------------------------------------------------------ occluder cutout
    updateCutout() {
      const U = G.R3M.cutUniforms();
      const P = this.ms.player;
      const p = new THREE.Vector3(P.px / TT, 0.9, (P.py + 8) / TT - 0.5);
      const v = p.clone().project(this.camera);
      U.uCutCenter.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      U.uCutDepth.value = p.clone().applyMatrix4(this.camera.matrixWorldInverse).z * -1;
      U.uCutRadius.value = 0.11 * (15 / ((this.camCfg.dist || 15) * (this.zoom || 1)));
      U.uCutOn.value = P.visible && !this.ms.def.noCutout3d ? 1 : 0;
      const r = G.R3.renderer;
      if (r) { const s = r.getDrawingBufferSize(new THREE.Vector2()); U.uResolution.value.copy(s); }
      U.uTime.value = this.t;
    }

    // ------------------------------------------------------------------ per-frame
    // ctx2d: the 2D overlay context of this frame (screen-space output of the 2D map hooks is drawn there)
    frame(ctx2d) {
      const now = G.time;
      const dt = this._last != null ? Math.min(0.05, Math.max(0, now - this._last)) : 1 / 60;
      this._last = now;
      this.t += dt;
      const ms = this.ms;
      // camera rotation input (field only, idle)
      if (G.Scenes.top() === ms && !G.Script.busy() && G.settings.camRotate !== false) {
        if (G.Input.pressed('pgup')) this.rotate(-1);
        if (G.Input.pressed('pgdn')) this.rotate(1);
      }
      if (this.yawGoal != null) {
        const d = wrapA(this.yawGoal - this.yaw);
        this.yaw = Math.abs(d) < 0.002 ? this.yawGoal : this.yaw + d * Math.min(1, dt * 7);
      }
      // S.light() mid-map (time-of-day change): rebuild sky, sun, fog, IBL and the light pool
      if (ms.lightCfg !== this._lightCfg) { if (this._lightCfg) this.rebuildEnvironment(); this._lightCfg = ms.lightCfg; }
      // terrain edits by scripts (rare): re-bake affected chunks
      if ((this._tf = (this._tf || 0) + 1) % 15 === 0) this.checkTerrain();
      this.syncObjects(false);
      this.syncActors(dt);
      const [x, z] = this.desiredTarget();
      const k = Math.min(1, dt * (ms.cam.speed || 6));
      this.camTarget.x += (x - this.camTarget.x) * k;
      this.camTarget.z += (z - this.camTarget.z) * k;
      this.placeCamera();
      this.updateLights();
      this.updateParticles();
      this.updateDecals(ctx2d);
      this.updateCutout();
      // billboards & animated models
      for (const [, node] of this.nodes) {
        if (!node.visible) continue;
        const o = node.userData.o, md = node.userData.def;
        if (md && md.update) { try { md.update(node.children[0], o, this.t, dt); } catch (e) { G.warnOnce('mupd ' + o.t, e); } }
        if (node.children[0] && node.children[0].userData.fallback) node.children[0].traverse((n) => { if (n.userData.billboard) n.rotation.y = this.yaw; });
        if (o.spirit) node.traverse((n) => {
          if (!n.material || n.userData.outline || Array.isArray(n.material)) return;
          // materials are shared between instances of a model: give spirit objects their own copy before fading
          if (!n.userData.spiritMat) { n.material = n.material.clone(); n.userData.spiritMat = true; n.material.transparent = true; }
          n.material.opacity = 0.7 + 0.25 * Math.sin(this.t * 3);
        });
      }
      if (G.Nature3D && G.Nature3D.update) { try { G.Nature3D.update(this, dt); } catch (e) { G.warnOnce('nature3d update', e); } }
      else if (G.Wind3D && G.Wind3D.update) G.Wind3D.update(dt);
      if (this.waterU) this.waterU.value = this.t;
      if (this.sky) this.sky.material.uniforms.time.value = this.t;
      // psychedelic grade
      const psy = Math.max(val(this.def.psychedelic) || 0, G.state.vars.vision > 0 ? Math.min(1, G.state.vars.vision / 3) * 0.75 : 0);
      this.post.warp = psy;
      this.post.hue = psy > 0 ? Math.sin(this.t * 0.3) * 0.35 * psy : 0;
      this.post.sat = 1.06 + psy * 0.5;
      if (G.Env3D && G.Env3D.update) { try { G.Env3D.update(this, dt); } catch (e) { G.warnOnce('env3d update', e); } }
      for (const f of ms.hooks('update3d')) { try { f(this, dt, THREE); } catch (e) { G.warnOnce('update3d ' + this.def.id, e); } }
      G.R3.setView(this);
      G.R3.render(dt);
    }

    checkTerrain() {
      const ms = this.ms, snap = this.terrainSnap;
      if (ms.terrain.length !== snap.length) return;
      const dirty = new Set();
      let wallDirty = false;
      for (let i = 0; i < snap.length; i++) if (snap[i] !== ms.terrain[i]) {
        const cx = i % ms.w, cy = (i / ms.w) | 0;
        dirty.add(((cy / CH) | 0) * 1000 + ((cx / CH) | 0));
        if (WALL_H[snap[i]] != null || WALL_H[ms.terrain[i]] != null) wallDirty = true;
        snap[i] = ms.terrain[i];
      }
      if (!dirty.size) return;
      for (const ch of this.chunks) if (dirty.has(((ch.y0 / CH) | 0) * 1000 + ((ch.x0 / CH) | 0))) this.bakeChunk(ch);
      if (wallDirty) this.buildWalls();
    }

    // world → logical 2D screen point
    toScreen(x, y, z) { return G.R3.project(this.camera, x, y, z); }
    actorScreen(a, h) {
      const rec = this.actors.get(a);
      const height = h != null ? h : (rec && rec.ch.height ? rec.ch.height + 0.35 : 1.95);
      return this.toScreen(a.px / TT, height, (a.py + 8) / TT - 0.5);
    }

    dispose() {
      for (const [, rec] of this.actors) if (rec.ch.dispose) rec.ch.dispose();
      this.actors.clear();
      G.R3.dispose(this.scene);
      for (const ch of this.chunks || []) if (ch.tex) ch.tex.dispose();
      if (this.envRT) this.envRT.dispose();
      if (this.decalTex) this.decalTex.dispose();
      if (G.R3.view === this) G.R3.view = null;
    }
  }

  // ------------------------------------------------------------------ SplitCtx
  // A CanvasRenderingContext2D stand-in handed to 2D map hooks in 3D. State and path calls go to both targets:
  //   W — the ground decal canvas (world px → decal px), S — the 2D overlay canvas with the 2D camera transform
  //   (device scale × translate(-cam)), so world px land where the 2D renderer would put them on screen.
  // Each draw call goes to ONE of them: S when the hook is in screen mode (it called translate(cam.x, cam.y) —
  // the chapters' screenSpace/hud2d idiom —, ms.screenSpace(), setTransform or resetTransform; the mode is saved and
  // restored with save()/restore()), or when a rect/image covers the whole view along one axis from a screen edge
  // (full-screen tints, vignettes, edge fades drawn at cam.x/cam.y). Everything else is world space → W.
  // In the 'ground' phase (drawGround, drawMechFloor) a solid full-view fill is spread over the whole decal instead
  // (a ground tint), since the 2D view rectangle means nothing on the 3D ground.
  const SPLIT_DRAW = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'putImageData', 'drawFocusIfNeeded']);
  const SPLIT_QUERY = new Set(['measureText', 'getTransform', 'isPointInPath', 'isPointInStroke', 'getImageData', 'getLineDash', 'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern', 'createImageData', 'getContextAttributes', 'isContextLost']);
  const SPLIT_SYNC = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'font', 'textAlign', 'textBaseline', 'globalAlpha', 'globalCompositeOperation', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'filter', 'imageSmoothingEnabled'];
  class SplitCtx {
    constructor(view) {
      this.view = view;
      this.fns = Object.create(null);
      this.phase = 'over';
      const self = this;
      this.proxy = new Proxy({}, {
        get(_, k) {
          if (k === '__split') return self;
          const f = self.fns[k];
          if (f) return f;
          const v = self.S[k];
          if (typeof v === 'function') return (self.fns[k] = self.wrap(k));
          return v;
        },
        set(_, k, v) { self.S[k] = v; self.W[k] = v; return true; },
        has(_, k) { return k in self.S; },
      });
    }
    begin(screen) {
      const v = this.view, ms = v.ms;
      // screen-space output goes to an offscreen layer the size of the overlay canvas; MapScene.draw3d composites it
      // (view.drawHookLayer) after the 2D screen fx, so passes that re-read the overlay (G.FX.vision) can't amplify it
      const cv = screen.canvas;
      if (!this.layer || this.layer.width !== cv.width || this.layer.height !== cv.height) {
        this.layer = document.createElement('canvas');
        this.layer.width = cv.width; this.layer.height = cv.height;
        this.layerUsed = false;
      }
      this.S = this.layer.getContext('2d'); this.W = v.decalCanvas.getContext('2d');
      const W = this.W, S = this.S;
      if (this.drewLast !== false) { W.setTransform(1, 0, 0, 1, 0, 0); W.clearRect(0, 0, v.decalCanvas.width, v.decalCanvas.height); }
      if (this.layerUsed) { S.setTransform(1, 0, 0, 1, 0, 0); S.clearRect(0, 0, this.layer.width, this.layer.height); }
      S.setTransform(screen.getTransform());
      S.save(); W.save();
      for (const k of SPLIT_SYNC) { try { W[k] = S[k] = screen[k]; } catch (e) { /* unsupported prop */ } }
      W.setLineDash([]); S.setLineDash([]);
      this.dev = S.getTransform();
      this.devInv = this.dev.inverse();
      const [cx, cy] = ms.cam2d || [ms.cam.x, ms.cam.y];
      this.cx = cx; this.cy = cy;
      S.translate(-cx, -cy);
      this.k = v.decalS / TT;
      W.setTransform(this.k, 0, 0, this.k, 0, 0);
      this.mode = false; this.stack = [];
      this.worldOps = 0; this.screenOps = 0;
      return this.proxy;
    }
    end() {
      this.S.restore(); this.W.restore();
      this.stack.length = 0;
      this.drewLast = this.worldOps > 0;
      this.layerUsed = this.screenOps > 0;
      return this.drewLast;
    }
    // decal transform matching a screen-ctx transform M: W = Wbase × T(cam) × dev⁻¹ × M
    worldFor(M) { return new DOMMatrix([this.k, 0, 0, this.k, 0, 0]).translateSelf(this.cx, this.cy).multiplySelf(this.devInv).multiplySelf(M); }
    markScreen() { this.S.setTransform(this.dev); this.W.setTransform(this.worldFor(this.dev)); this.mode = true; }
    isCam(x, y) {
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return false; // a no-op translate is not a camera cancel
      const c = this.view.ms.cam, near = (a, b) => Math.abs(a - b) <= 1.01;
      return (near(x, c.x) && near(y, c.y)) || (near(x, this.cx) && near(y, this.cy));
    }
    // does the rect (in current user space) cover the whole view along one axis, starting at a screen edge? Edges
    // count when they sit within 128 px outside the screen (overscan), so big world-space images and beams that merely
    // overlap the view are not taken for screen overlays. full: require the whole screen (used for drawImage).
    coversView(x, y, w, h, full) {
      if (![x, y, w, h].every(Number.isFinite)) return false;
      const m = this.devInv.multiply(this.S.getTransform());
      if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return false;
      let x0 = m.a * x + m.e, x1 = m.a * (x + w) + m.e, y0 = m.d * y + m.f, y1 = m.d * (y + h) + m.f;
      if (x0 > x1) [x0, x1] = [x1, x0];
      if (y0 > y1) [y0, y1] = [y1, y0];
      const L = x0 <= 2 && x0 >= -128, R = x1 >= G.W - 2 && x1 <= G.W + 128, T = y0 <= 2 && y0 >= -128, B = y1 >= G.H - 2 && y1 <= G.H + 128;
      if (full) return L && R && T && B;
      return (L && R && (T || B)) || (T && B && (L || R));
    }
    wrap(k) {
      const self = this;
      switch (k) {
        case 'save': return () => { self.S.save(); self.W.save(); self.stack.push(self.mode); };
        case 'restore': return () => { self.S.restore(); self.W.restore(); if (self.stack.length) self.mode = self.stack.pop(); };
        case 'translate': return (x, y) => { self.S.translate(x, y); self.W.translate(x, y); if (!self.mode && self.isCam(x, y)) self.mode = true; };
        case 'setTransform': return (...a) => { self.S.setTransform(...a); self.W.setTransform(self.worldFor(self.S.getTransform())); self.mode = true; };
        case 'resetTransform': return () => { self.S.resetTransform(); self.W.setTransform(self.worldFor(new DOMMatrix())); self.mode = true; };
        case 'reset': return () => {}; // would wipe the whole UI canvas
        default:
      }
      if (SPLIT_QUERY.has(k)) return (...a) => self.S[k](...a);
      if (!SPLIT_DRAW.has(k)) return (...a) => { self.S[k](...a); self.W[k](...a); };
      const rectOf = k === 'fillRect' || k === 'strokeRect' || k === 'clearRect' ? (a) => a
        : k === 'drawImage' ? (a) => (a.length >= 9 ? a.slice(5, 9) : a.length >= 5 ? a.slice(1, 5) : [a[1], a[2], a[0] && a[0].width, a[0] && a[0].height]) : null;
      return (...a) => {
        let screen = self.mode;
        if (!screen && rectOf) {
          const r = rectOf(a);
          if (self.coversView(r[0], r[1], r[2], r[3], k === 'drawImage')) {
            if (self.phase !== 'ground') screen = true;
            else if ((k === 'fillRect' && typeof self.W.fillStyle === 'string') || k === 'clearRect') {
              // ground tint: cover the whole decal
              const W = self.W, cv = self.view.decalCanvas;
              W.save(); W.setTransform(1, 0, 0, 1, 0, 0); W[k](0, 0, cv.width, cv.height); W.restore();
              self.worldOps++;
              return;
            }
          }
        }
        if (screen) { self.S[k](...a); self.screenOps++; } else { self.W[k](...a); self.worldOps++; }
      };
    }
  }
  Map3D.SplitCtx = SplitCtx;

  function paintWaterNormal(g, w, h) {
    // tileable ripple normal map from summed sine waves
    const img = g.createImageData(w, h);
    const waves = [];
    for (let i = 0; i < 9; i++) waves.push({ kx: Math.round((Math.random() - 0.5) * 8), ky: Math.round((Math.random() - 0.5) * 8) || 1, a: 0.6 / (1 + i * 0.4), p: Math.random() * 6.28 });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let dx = 0, dy = 0;
      for (const wv of waves) {
        const ph = (wv.kx * x / w + wv.ky * y / h) * Math.PI * 2 + wv.p;
        const c = Math.cos(ph) * wv.a;
        dx += c * wv.kx; dy += c * wv.ky;
      }
      const n = Math.hypot(dx * 0.08, dy * 0.08, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (dx * 0.08 / n * 0.5 + 0.5) * 255; img.data[i + 1] = (dy * 0.08 / n * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / n * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.putImageData(img, 0, 0);
  }

  return Map3D;
})();

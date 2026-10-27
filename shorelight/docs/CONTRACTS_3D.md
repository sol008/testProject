# 3D contracts (binding for all 3D work)

Shorelight renders the world in real-time 3D (Three.js r186, bundled at `js/vendor/three.bundle.js` → `window.THREE`,
including addons: EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, SMAAPass, BokehPass, GTAOPass,
OutlinePass, Sky, Water, BufferGeometryUtils, SkeletonUtils, RoundedBoxGeometry, ConvexGeometry, SimplexNoise).
The 2D canvas sits on top of the WebGL canvas and carries only UI. **Gameplay state stays in the existing engine**
(MapScene / BattleScene); 3D views read that state each frame and present it.

The target bar is a **2026 commercial stylised-3D JRPG** (Genshin Impact, Octopath/HD-2D, Sea of Stars 3D, 仙劍七, Tales of Arise),
not a prototype. That means:
- deliberate shape language;
- layered, hand-tuned materials;
- secondary motion on everything that should move (cloth, hair, foliage, flags, lanterns, water);
- readable silhouettes from the game camera;
- consistent lighting response;
- **no untextured grey boxes**.

Everything is procedural (code-built geometry + canvas-painted textures). There are no external asset files and no
network access at runtime, because the game must run from `file://` on macOS.

## Files & ownership
| file | global | owner |
|---|---|---|
| js/r3d/core.js | `G.R3` renderer, composer, post, `project`, `mergeStatic`, `dispose` | lead |
| js/r3d/materials.js | `G.R3M` toon ramps, `toon()`, `env()`, `outline()`, `addCutout()`, `tex()`, `canvasTex()` | lead |
| js/r3d/models.js | `G.Models` registry, billboard fallbacks, `CharBillboard`, `MonBillboard` | lead |
| js/r3d/mapview.js | `G.Map3D` field view | lead |
| js/r3d/chars.js | `G.Char3D` character system (rig, mesh-from-spec, toon, face, animation) | characters team |
| js/r3d/chars_cast.js | bespoke main-cast builds on top of chars.js | characters team |
| js/r3d/animals.js | `G.Animal3D` quadrupeds & birds incl. pets 芋圓/麻糬 (same instance interface) | animals team |
| js/r3d/arch_han.js | Han-Taiwanese architecture models | architecture team A |
| js/r3d/arch_coast.js | Indigenous, coastal, maritime & fortification models | architecture team B |
| js/r3d/nature.js | trees, plants, rocks, crystals, mushrooms, grass + wind | nature team |
| js/r3d/props.js | street & interior props | props team |
| js/r3d/monsters.js, monsters_boss.js | `G.Mon3D` creatures and bosses | monster teams |
| js/r3d/env.js | `G.Env3D`: water, sky & clouds, weather, terrain detail, ambient life | environment team |
| js/r3d/vfx.js, battleview.js | `G.VFX3D`, `G.Battle3D` | battle team |

Only edit your own files. If you need a change in a lead file, describe it in your final report (or add a clearly
marked, minimal, backwards-compatible hook). `index.html` already loads every file in the table.

## Units, axes, conventions
- **1 unit = 1 map tile ≈ 1 m.** +x east, +z south, +y up. Tile (cx, cy) spans x∈[cx, cx+1], z∈[cy, cy+1]; ground is y=0.
- The default camera looks **north** (from +z toward −z), pitch ≈ 52°, distance ≈ 15, FOV 32. The player can rotate it in
  90° steps (Q/E), so **models must look finished from all four sides**. The south (+z) side is the "front" for
  buildings (door, signboard).
- Adult human ≈ 1.65–1.75 units tall; child ≈ 1.15; doorway ≈ 2.1; single-storey house eave ≈ 2.6–3.2; temple ridge ≈ 5–7.
- Lighting: the sun is a DirectionalLight from upper-left-front with PCF soft shadows. HemisphereLight plus a PMREM
  environment (IBL) provide fill. Up to 12 PointLights are pooled and assigned to the nearest light sources. ACES
  tone mapping, bloom (threshold ~0.85 by day, ~0.6 at night), SMAA, vignette, and an optional GTAO pass on "ultra".
  Emissive values > 1 bloom.
- Colour: author material colours in sRGB hex (three converts). Textures painted on canvases go through
  `G.R3M.canvasTex()` / `G.R3M.tex()` (sRGB). Normal/roughness/data textures use `{ srgb: false }`.

## Materials
- Environment / props / architecture: `G.R3M.env({...MeshStandardMaterial params})`. It adds the see-through
  occluder cutout automatically (a dithered hole around the player when geometry is between camera and player).
  Inside `build(o, K)` prefer `K.mat(color, params)`, which caches and shares materials and so cuts shader programs and draw calls.
- Characters / creatures: `G.R3M.toon({ color, map, rim, rimColor, bands })` (MeshToonMaterial + fresnel rim), plus
  `G.R3M.outline(mesh, { width, color })` inverted-hull outlines (works on SkinnedMesh).
- Glowing parts: `K.glow(color, intensity)` (emissive; bloom picks it up). Real light emission goes through `lights(o)`.
- **Painted textures are expected.** Wood grain, plaster with stains, roof tiles, cloth weave, embroidery, carved
  stone, moss, rust and paper are painted with Canvas 2D into `G.R3M.tex(key, w, h, paint)` (cached by key), 256–1024 px.
  Use world-scale UVs so texel density stays consistent: ≈ 128–256 px per metre for props/buildings.
- Vertex colours are welcome for cheap AO and gradients (darken toward the ground and in crevices).

## G.Models: map objects (`G.Objects` types)
```js
G.Models.define('house_jiufen', {
  variants: 3,                        // optional: o.v % variants picks a variant; each variant is built once and cloned
  key: (o) => (o.open ? 'open' : ''), // optional extra cache key from instance state
  build(o, K) {                       // return a THREE.Object3D; ORIGIN = footprint centre on the ground (y = 0)
    const g = K.group(...);           // footprint: o.w × o.h tiles (from G.Objects defs; see table below)
    return K.merge(g);                // merge static meshes by material (big draw-call win)
  },
  update(node, o, t, dt) {},          // optional per-frame animation (lantern sway, flag cloth, water wheel)
  lights(o) { return [{ x: 0, y: 2.2, z: 0.6, color: '#ffb060', intensity: 1, distance: 4, flicker: 0.2 }]; }, // local coords
});
```
- The footprint is given by `G.Objects.get(type).w/h` (and `o.w/o.h` overrides). Solid cells come from the 2D def's
  `solid` / `solidAt(o, dx, dy)`. Visual geometry may overhang (eaves, branches) but must cover the solid cells and
  read as standing where collision is.
- Objects rendered *without* a model fall back to a camera-facing billboard of the 2D art. **Every object type
  listed in the game must get a real model.** The registry list: `Object.keys(G.Objects.defs)`.
- Instance fields you may read: `o.v` (variant), `o.open` (chests), `o.lit`, `o.state`, `o.t`, `o.spirit` (spirit-only
  objects render semi-transparent), and `o.rot3d` (y rotation, set by maps when needed).
- Budgets: small prop ≤ 3k tris; tree ≤ 12k; house ≤ 40k; temple ≤ 80k. After `K.merge`, ≤ 6 draw calls per
  model, plus animated parts kept separate.
- Animated parts (lantern sway, flags, leaves, water wheels) are separate child meshes; give them a `name` so
  `update(node, o, t, dt)` can find them via `node.getObjectByName(...)`. For foliage wind, prefer the shared wind
  vertex shader from `G.Env3D.windify(material, { strength })` once env.js provides it. Until then, use a simple
  `update()` sway.

## G.Char3D: humanoid characters (and pets)
```js
G.Char3D.has(id) -> bool                       // id = sprite id (G.Sprites ids: 'xinghe', 'villager_f', 'mochi'…)
G.Char3D.create(id, { context: 'map' | 'battle' | 'cutscene' }) -> inst
inst.root: THREE.Object3D   // origin at the feet, facing +z when yaw = 0
inst.height: number         // head-top height (for prompts/emotes)
inst.setFacing(yaw)         // radians; yaw 0 faces +z (south / camera), π/2 faces +x (east)
inst.setMove(speed)         // tiles/s; 0 idle, ~4.2 walk, ~7 run → blend idle/walk/run with foot-synced cadence
inst.play(name | null, { loop, fade, onDone })  // one-shots/loops on top of locomotion; null returns to locomotion
inst.emote(k)               // '!', '?', '…', '♪', '💢', '♥', '💧', '✦' → body/face reaction (2D bubble is drawn by the engine)
inst.setExpression(name)    // 'neutral','smile','sad','angry','surprised','shy','pain','closed','determined'
inst.lookAt(Vector3 | null) // head/eye tracking with limits and smoothing
inst.setOpacity(a, ghost)   // fades; ghost=true → translucent spectral look
inst.update(dt, camYaw, camera)
inst.lights?() -> [{ x,y,z (world), color, i, r, flicker }]  // e.g. a carried lantern
inst.bone(name) -> THREE.Bone // 'hips','spine','chest','neck','head','handL','handR','footL','footR' (attachment points)
inst.dispose()
```
Battle clips the battle team expects (via `play`): `idle` (battle stance), `ready`, `attack`, `attack2`, `cast`,
`skill`, `hurt`, `guard`, `ko` (stays down), `revive`, `victory`, `item`, `run`, `dodge`, plus field clips
`talk`, `nod`, `shake`, `bow`, `sit`, `kneel`, `point`, `wave`, `cry`, `laugh`, `think`, `surprise`, `pray`, `sleep`, `fall`.

**Coverage:** every id in `G.Sprites.ids()` must produce a character. The sprite specs (`G.Sprites.spec(id)`) are
parametric: body type, skin, hair style and colour, hat, outfit pieces with colours, held item, etc. (format at the
top of js/gfx/sprites.js). Build a parametric 3D generator from that spec so all ~100 NPCs exist in 3D, then add
bespoke builds for the main cast in chars_cast.js. Quadrupeds (`kind: 'quad'`) and birds are built by animals.js:
`G.Animal3D = { has(id), create(id, opts) }`, using the same instance interface. **`G.Char3D.has/create` must delegate to
`G.Animal3D` at call time** for ids whose sprite spec has `kind: 'quad' | 'bird'`, so views only ever call `G.Char3D`.

**Animation quality bar (2026):** procedural animation authored as real keyframed clips (THREE.AnimationClip /
AnimationMixer, cross-fades) and/or a procedural pose layer, with:
- foot-planted locomotion (no sliding: stride length × cadence matches speed), hip bob and sway, counter-rotating
  shoulders, arm swing with follow-through, and lean into turns/starts;
- breathing idle, weight shifts, occasional fidgets and blinking (texture/morph eyelids) with saccades;
- secondary motion via spring bones for hair, ribbons, sleeves, skirts, sashes, tails and ears (verlet / damped
  springs, stable at 30–144 fps);
- anticipation → action → follow-through → recovery timing on attacks; squash/stretch kept subtle;
- additive look-at (head + eyes) and facial expressions (eyebrows, eyelids, mouth shapes) with simple lip-flap while talking.

Faces: anime-style painted face textures (eyes, brows, mouth on a canvas texture; swap or redraw for blinks and
expressions) on a well-shaped head mesh. Follow the industry approach of Genshin/仙劍七-style stylised faces.
The heroine's face and hair follow `docs/design/REFERENCES.md` (binding), including the beauty mark. The final party
looks come from the client's v2 design picks (`docs/design/v2/`). Build the system so a look is a data spec.

## G.Mon3D: creatures (`G.Monsters` art ids)
Same instance interface as characters, with clips `idle`, `move`, `attack`, `cast`, `hurt`, `die`, `special`, `enter`.
`G.Mon3D.create(art, { context, variant })`. Every id in `Object.keys(G.Monsters.defs)` needs a 3D creature. Battle
scale: as in 2D (`G.Monsters.get(id).w/h` px ÷ 64 ≈ units; bosses large). The view scales them down on the field.

## Views & hooks
- `G.Map3D` (mapview.js) builds terrain, walls, water, objects, actors and lights from a MapScene. Map defs may add
  `cam3d: { pitch, dist, fov, yaw }`, `interior: bool`, `sky3d: '#hex'`, `build3d(view, THREE)`,
  `update3d(view, dt, THREE)` and `noCutout3d`. `update3d` may also be set on the map instance (`ms.update3d = fn`);
  def and instance hooks both run, every 3D frame, before the render.

### 2D map hooks in 3D (drawGround / drawOver / drawScreen)
Map defs **and map instances** (`G.mapScene.drawOver = fn`) may define these; def first, then instance. The same code
runs in 2D and 3D, so write it once in 2D terms:

| hook | 2D | 3D (field view on) |
|---|---|---|
| `drawGround(ctx, t, ms)` | world px (2D camera applied), under objects/actors | **ground decal**: a canvas texture laid over the whole map at y≈0.035 (1 tile = `view.decalS` px), drawn under actors, occluded by walls/models |
| `ms.drawMechFloor` (winds, guard cones) | as drawGround | ground decal |
| `drawOver(ctx, t, ms)` | world px, above actors (before emotes, lighting, HUD) | world-space drawing → ground decal; **screen-space drawing → the 2D overlay canvas, composited over the 3D frame** |
| `drawScreen(ctx, t, ms)` | screen coords, after lighting/vignette, under the HUD | same, on the overlay over the 3D frame |
| `update3d(view, dt, THREE)` | — | every frame before render (3D props/billboards for upright things) |

In 3D, drawGround/drawOver get a `SplitCtx` (js/r3d/mapview.js) instead of a real context. It behaves like a
CanvasRenderingContext2D (state, paths, gradients, `G.Render.text` all work) and routes **each draw call** to the
ground decal or to the screen overlay:
- **Screen space** when the hook is in screen mode: after `ctx.translate(ms.cam.x, ms.cam.y)` (the `screenSpace` /
  `hud2d` idiom; raw or half-pixel-rounded camera, shake included), after `ms.screenSpace(ctx, fn)`, or after
  `ctx.setTransform(...)` / `ctx.resetTransform()` (e.g. `setTransform(G.S, 0, 0, G.S, 0, 0)`). The mode is part of the
  save()/restore() state. On the overlay, world px still map through the 2D camera (`x - cam.x`), so a full-screen
  gradient built at `cam.x + G.W / 2` lands at the screen centre.
- **Screen space** for a `fillRect` / `strokeRect` / `clearRect` whose rectangle spans the whole view along one axis
  starting at a screen edge (its edges at most 128 px outside the screen), and for a `drawImage` that covers the whole
  screen — full-screen tints (`fillRect(cam.x - 40, cam.y - 40, G.W + 80, G.H + 80)`), vignettes, edge fades,
  letterbox bars. Paths (`fill()` / `stroke()`) are never classified by size: draw full-screen shapes in screen mode.
- **Ground decal** for everything else (glows, decals, chalk marks, rune circles, puddles, rockfall shadows, a hull
  rim, sprites drawn at world positions).
- In drawGround (and drawMechFloor), a solid-colour full-view `fillRect`/`clearRect` tints the **whole decal** instead
  (the 2D view rectangle has no meaning on the 3D ground).

Consequences and rules for chapter authors:
- Prefer `ms.screenSpace(ctx, (c) => …)` (or the explicit `drawScreen` hook) for HUD meters and full-screen overlays;
  the `ctx.translate(ms.cam.x, ms.cam.y)` idiom also works. Don't also draw the same HUD from `update3d` on `G.ctx` —
  screen-space drawOver output already reaches the screen in 3D and it would be drawn twice.
- Upright things (apparitions, figures, lantern heads, a big sprite "standing" on a roof ridge) flatten onto the
  ground decal. Skip them in the 2D hook when `ms.view3d` is set and mirror them in `update3d` with models / billboards
  / `G.Char3D` (see ch1's `sync3d`, ch9's `view3d`). Actor `offsetY` (px, negative = up) is already a 3D lift of
  `-offsetY / 64` units, and `jumpY`/`jump` lift too, so roof-ridge actors need no hook.
- Composite modes ('lighter', 'overlay', 'soft-light', 'multiply') on the overlay blend against the transparent UI
  layer, not the 3D pixels, so they act like normal alpha over the 3D frame; keep such overlays subtle.
- The decal texture is only uploaded on frames where something world-space was drawn (or must be cleared).

- `G.Env3D` (env.js), if present, is called by Map3D: `G.Env3D.decorate(view)` after build and
  `G.Env3D.update(view, dt)` every frame. Its interface: `view.scene`, `view.ms` (MapScene: `terrain`, `w`, `h`,
  `def`, `objects`, `player`), `view.camera`, `view.dark` (0 day … 0.95 night), `view.outdoor`, `view.interior`,
  `view.cave`, `view.sun`, `view.hemi`, `view.water` (mesh or undefined), `view.post` (bloom, warp, vignette …),
  `view.chunks` (ground chunk meshes), `view.t`.
- Battle: `G.Battle3D` (battleview.js) mirrors BattleScene the same way: 3D arena from the troop's `bg`; units from
  Char3D/Mon3D; camera choreography; VFX from `G.VFX3D`; the 2D canvas keeps menus, HP bars and numbers, projected
  through `G.R3.project`.

## Testing (mandatory)
- Headless Chromium uses SwiftShader (software GL) and is slow. Use `?r3lite` on the game URL (half resolution, no
  shadows, no post) for functional tests. Use `tools/r3d/viewer.html` for asset work: it renders model lineups and turntables
  (`?kind=models&ids=a,b&yaw=30`, `?kind=chars&ids=xinghe&anim=walk&t=0.4`, `?kind=mons&ids=…`). It waits for
  `window.__ready` and is fast enough for iteration.
- **Look at every render with the Read tool and iterate.** Compare against the quality bar above, not against "it renders".
- Any console error, NaN bounding sphere, or missing texture is a bug.

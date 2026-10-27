# Animals & pets: 3D report (`js/r3d/animals.js`, `G.Animal3D`)

Branch `r3d-animals`. Owner files: `js/r3d/animals.js`, `tools/r3d/animals/*`, this report.

## Status at a glance

| id | build | tris (body + eyes + hull + cards) | draw calls | notes |
|---|---|---|---|---|
| `yuyuan` 芋圓 | bespoke (hero) | 13.4k | 4 | blue-grey tabby, pick v2 #07 red silk bow collar |
| `mochi` 麻糬 | bespoke (hero) | 13.6k | 4 | long-haired dilute calico, pick v2 #04 lantern-warm eye highlights |
| `cat` | cat family | 7.5k | 4 | generic orange tabby |
| `c2_light_leopard` | cat family (石虎 coat) | 7.0k | 3 (ghost: no outline) | spirit leopard cat, ghost shader |
| `dog` 阿黃 | quadruped | 7.7k | 4 | yellow 台灣土狗, red collar, curled tail |
| `c10_muntjac`, `c2_light_muntjac` 山羌 | quadruped | 7.4k | 3 | short spike antlers on hairy pedicles, dark facial V |
| `buffalo` 水牛 | quadruped | 7.9k | 3 | slate hide, crescent horns, white throat chevrons, pale stockings, nose rope |
| `chicken` | bird | 7.5k | 4 | comb and wattles, sickle tail |
| `crow` | bird | 7.2k | 4 | |
| `c2_light_magpie` 臺灣藍鵲 | bird | 5.4k | 3 | Formosan blue magpie: long white-tipped tail, red bill/legs |

- **Coverage:** every `G.Sprites` id with `kind: 'quad' | 'bird'` builds. That includes the ids that maps define at load time (`has()` reads the spec at call time).
- **Budgets met:** pets ≤ 15k triangles, others ≤ 8k, all ≤ 5 draw calls.
- **Delegation:** `G.Char3D` already delegates to me. `tools/r3d/shot.js "kind=chars&ids=mochi,yuyuan,…"` reports 0 fallbacks.
- **`糰子` (tuanzi):** the client cut this pet (`docs/design/PICKS.md`). The id still builds (cat family with the leopard-cat coat), but it got no bespoke work.

## How it is built (all procedural, from `file://`)
1. **Body plan.** A species plan lists:
   - skeleton joints: spine chain, belly, neck/head/jaw, eye and lid bones, ears, a 7-bone tail, four digitigrade legs (thigh/shin/hock/foot; scapula/arm/fore/wrist/hand), and wing bones for birds;
   - SDF primitives (ellipsoids and round cones) owned by bones.

   The cat proportions, head shape (cheeks/jowls, whisker pads, brow bulge) and ear geometry are ported from the approved design kit (`tools/design2/tuanzi_yuyuan_mochi_catkit.js`), so the 3D cats match the picked cards.
2. **Mesh.** Surface nets run in a warped grid, so the head gets about 2.4× the vertex density. Vertices are projected onto the exact surface and normals come from the SDF gradient. A coarse second SDF mesh is the inverted-hull outline.
3. **Skinning.** Weights come from primitive ownership (soft falloff between neighbours, with joint splits along cones).
4. **Coat.** `MeshToonMaterial` plus the shared rim light, patched with a procedural fur shader:
   - per-vertex masks: white, patch A/B, stripe strength and coordinate, spots, SDF AO;
   - rest-space noise (silver ticking, ragged patch edges, broken mackerel stripes, Worley spots, strand detail);
   - a painted face texture: lat-long projection around the head, ray-traced onto the real head surface and 2×2 supersampled. Its marks are the kit's face-paint functions (tabby "M", mascara lines, cheek swirl, pale muzzle, nose leather with nostrils, `w` mouth; calico blaze with a grey patch over one eye and cream over the other brow; 石虎 forehead lines);
   - an open mouth (mouth bag, tongue, lip edge) drawn in the shader from the jaw parameter.
5. **Parts.**
   - real eyeballs: iris fibres, limbal ring, slit or round pupil driven per frame, view-space highlights;
   - skinned eyelid shells that hinge about the eye axis, so they close completely;
   - cupped ears with pink inner cup and pale furnishings;
   - whisker strips; alpha-tested fur cards (cheeks, ruff, belly); sculpted clump cones for 麻糬's ruff and plume tail;
   - horns, antlers, beaks, toes, feather vanes and the nose rope as tubes;
   - the bow collar hugs the actual neck surface.

## Animation (procedural pose layer, 60 Hz-stable)
- **Pose vector.** About 80 blendable channels. Locomotion, clips and emotes write poses; the instance crossfades them, then solves the rig.
- **Gaits.**
  - walk: lateral sequence, duty 0.64;
  - trot: diagonal pairs, duty 0.44;
  - rotary gallop: spine flexion/extension and a suspension phase;
  - birds: walk with world-locked head bob; crow and magpie hop.

  Cadence and stride come from speed, Froude-scaled per species, with hysteresis on gait changes. Stance feet sweep back at exactly body speed.
- **Leg IK.** Analytic two-bone IK plus a pantograph metatarsus. Out of reach, the scapula glides, the hock swings to the reach line, and the pelvis drops just enough.
- **Foot planting is measured.** The viewer's `slide=1` mode reports per-paw drift while planted. Result: **0 mm for every animal at walk, trot and gallop speeds 1.0, 2.2, 4.2 and 7 tiles/s.** The one exception is the muntjac's front hooves at the gallop, which drift 10–27 mm.
- **Additive layers:**
  - breathing, faster when moving;
  - random blinks, including double blinks;
  - ear flicks; tail swish oscillator;
  - lean into turns and acceleration;
  - look-at (neck + head + eyes, limited and smoothed) with idle saccades;
  - purr: a 17–23 Hz micro-vibration.
- **Springs.** Verlet chains on the tail, ears, belly (jiggle), ruff and whiskers-region. Fixed 60 Hz sub-steps keep them stable from 30 to 144 fps.
- **Cat clips:** `sit`, `loaf`, `sleep` (curled donut, tail wrapped), `groom` (lick paw, then wipe over the ear), `stretch`, `yawn`, `knead`, `headbutt`, `purr`, `pounce` (butt wiggle → leap → land), `judge` (芋圓's flat stare), `chirp` (麻糬's trill), `sniff`, `slowblink`.
- **Battle and field vocabulary:** `idle`, `ready`, `attack`, `attack2`, `cast`, `skill`, `hurt`, `guard` (芋圓's body-block stance), `ko` (holds), `revive`, `victory`, `item`, `dodge`, `talk`, `nod`, `shake`, `bow`, `kneel`, `point`, `wave`, `cry`, `laugh`, `think`, `surprise`, `pray`, `fall`.
- **Other quadrupeds:** `graze`, `chew`, `alert`, `pant`, `wag`, `bark`, `scratch`.
- **Birds:** `peck`, `preen`, `flap`, `call`, `scratch`, `roost`, `fly`, plus battle clips. Unknown clip names map through an alias table.
- **Idle brains (map/cutscene context).**
  - Cats: stand → sit → groom / yawn / judge (芋圓) / chirp (麻糬) / loaf → purr / sleep.
  - Weighted tables for the dog, buffalo, muntjac, chicken, crow and magpie.
  - Moving or any explicit `play()` overrides the brain.
- **Expressions:** `neutral`, `smile`, `sad`, `angry`, `surprised`, `shy`, `pain`, `closed`, `determined`, `judging`. They drive lids, pupils, ears and jaw. 芋圓's default is `judging` (half-lid, slit pupils).
- **Emotes:**
  - `!` → startle hop with wide pupils;
  - `?` → head tilt;
  - `…` → flat ears and a tail-tip flick;
  - `♪` → sway;
  - `💢` → pinned ears, open jaw, lashing tail;
  - `♥` → slow blink of affection plus purr;
  - `💧` → droopy ears;
  - `✦` → wide eyes.
- **`setOpacity(a, ghost)`:** fades; `ghost` gives a fresnel spectral look and drops the outline and shadow. Map spirit animals (`ghost: true`) start ghosted.
- **`bone(name)`:** supports `hips`, `spine`, `chest`, `neck`, `head`, `handL/R`, `footL/R`, plus every rig bone by name.

## Testing
- `node tools/r3d/animals/shot.js "<query>" out.png […]` drives `tools/r3d/animals/view.html`, which calls `G.Animal3D` directly.
  - Query options: `ids`, `views=4`, `anim=walk|trot|run|<clip>`, `speed`, `t`, `frames`/`dt` strips, `zoom=head`, `expr`, `emote`, `ghost=1`, `facetex=1` (texture overlay), `slide=1` (foot-plant metric).
- `node tools/r3d/animals/game.js jiufen <prefix>` loads `index.html?debug&r3lite&map=jiufen` with both pets following, walks around and screenshots.
  - Result: 4 animal actors live, **no errors from animals.js**.
  - The only console error is the missing generated `js/core/fontdata.js`, which is not in the repo and not mine.
- Builds take 0.4–1.8 s per id in SwiftShader and are cached per id (instances share geometry and textures).

## Gaps / known issues
- **Fur.** 麻糬's long coat uses sculpted clumps and cards. It reads as fluffy at game distance but is spiky in extreme close-ups; real shell fur was skipped to stay within the draw-call budget.
- **Scope of polish.** Gait strips and clip key-poses for the two hero cats were reviewed frame by frame. The other species got one pass, and the buffalo's legs are still a little bent at idle.
- **Expressions are geometric** (lids, pupils, ears, jaw, shader mouth). There are no per-expression face-texture swaps.
- **Not modelled yet.** 芋圓's embroidered ball prop (pick #07) and 麻糬's water-lantern prop (pick #04) are scene props, not part of the pet. Hook: `inst.bone('handR')` / `bone('head')` attachment points exist.
- **`lights()` is not implemented**, because the pets carry no light source.

## Hooks needed from other teams
1. **Lead (`js/engine/map.js` / `js/r3d/mapview.js`).**
   - On the merged base, `Map3D.hookCount()` calls `ms.hooks(...)`, which `MapScene` doesn't define, so the 3D map fails to build. My in-game test adds a test-only shim; please land the real `MapScene.prototype.hooks`.
   - Following pets look small next to humans at the default camera (≈0.4 m tall). If design wants pets read bigger, scale them on the map: `inst.root.scale` is safe because the IK works in model space.
2. **Map / engine.** Set `actor.anim3d = 'sit' | 'loaf' | 'sleep' | 'groom' | 'judge' | …` to pin a behaviour, for example 芋圓 sitting on pressure plates or 麻糬 in `sniff` near hidden spirit items. Leave it unset to let the idle brain run.
3. **Battle team.**
   - Pets answer `idle`, `ready`, `attack`, `attack2`, `cast`, `skill`, `hurt`, `guard`, `ko`, `revive`, `victory`, `item`, `dodge`.
   - Create them with `context: 'battle'`, which disables the idle brain.
   - Suggested pairings: `guard` for 芋圓's body-block; `cast` plus a `purr` emote (`♥`) for 麻糬's healing purr.

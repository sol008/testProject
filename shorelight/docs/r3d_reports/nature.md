# Nature team report — `js/r3d/nature.js`

All 40 nature object types from `js/gfx/nature.js` now have real procedural 3D models with 3 variants each (`o.v % 3`). Footprints and solid cells match the 2D defs. The module also provides a shared foliage wind system and an instanced grass carpet.

The viewer shows **zero console errors** and no NaN bounds, and every model is within budget (`tools/r3d/nature/budget.js`). The in-game smoke tests (`?debug&r3lite`) ran on jiufen, mistforest_n, mist_grove, alishan_trail, breath_realm and truku_village. They showed no JS errors and `G.lastError` stayed null. The only console errors there are pre-existing missing files (`js/i18n/en_ch*.js`, `js/core/fontdata.js`), which this team does not own.

## Exports

```js
G.Wind3D = {
  windify(material, opts),   // inject wind sway + per-instance colour variation (+ optional effects) into a built-in lit material
  update(dt),                // the lead / Env3D calls this once per frame (drives the shared wind clock + gusts)
  tick(t),                   // fallback used by the models' update(): follows the view clock when nobody calls update()
  uniforms,                  // { uWT time, uWDir world wind dir, uWGust gust envelope, uWAmp global strength (weather can raise it) }
}
G.Nature3D = {
  scatterGrass(view) -> handle | null,  // instanced grass carpet over grass / grass_dark / flowers_ground tiles
  update(view, dt),                     // optional per-frame hook: Wind3D.update(dt) + grass chunk distance culling
  spin(node, o),                        // per-instance yaw helper (used by the nature models)
  mats,                                 // material cache (debug)
}
```

### `windify(mat, opts)`
Option keys:
- `strength` (m of tip sway), `height` (m where the bend reaches 1), `flex` (bend exponent), `flutter` (leaf jitter along the normal), `radial` (extra bend away from the trunk axis)
- `var` (per-instance colour variation) and `trans` / `transColor` (back-lit translucency + wrap lighting = fake subsurface)
- `hang: y` (hanging parts bend more the further below `y` they are)
- `grass` (instanced: player push-away + distance fade)
- spirit effects: `pulse`, `pulseSpeed`, `hue`, `hueRate`, `vglow` (vertex colour → emissive), `irid` (view-angle rainbow fresnel), `billow` (slow swelling for clouds)

How it works:
- **Wind phase and colour variation** come from the instance's world origin (`modelMatrix` / `instanceMatrix`), so cloned models never sway or tint in sync.
- **The bend profile** is computed from object-space height, because `K.merge` drops custom vertex attributes. All materials of one plant share the same profile, so trunk, limbs and leaves move together. Leaves add flutter on top.
- **Two-sided cards** keep their authored (bent) normals on back faces. Three normally flips them, which turned half of each canopy black.
- It chains any previous `onBeforeCompile` (cutout) and extends `customProgramCacheKey`, so programs stay shared.

## Models (tris per variant · draw calls after merge)

| type | footprint | tris v0/v1/v2 | draws | notes |
|---|---|---|---|---|
| tree_camphor 樟樹 | 1×1 | 1834/1810/1834 | 3 | lumpy cauliflower canopy, furrowed bark, bronze young-flush clumps |
| tree_maple 楓香 | 1×1 | 2060/2036/1988 | 3 | red / gold / turning palmate leaves, leaf-litter decal |
| tree_sakura 山櫻 | 1×1 | 2184/2208/2232 | 3 | blossom-cluster atlas, lenticel cherry bark, petal carpet |
| tree_pine 二葉松 | 1×1 | 954 | 3 | red plated trunk, niwaki-like cloud pads of needles |
| tree_dead | 1×1 | ~1.3–1.9k | 3 | recursive gnarled limbs, hanging 松蘿 lichen |
| tree_cypress 紅檜 | 2×2 | 3048 | 4 | fluted buttressed trunk + roots, layered sprays, silver lightning snag, ferns at the foot |
| tree_banyan 榕樹 | 3×3 (solid 000/010/111) | 6.5–7.8k | 3 | 5 twisting fused trunks, vast dome, aerial-root curtains, 3 prop-root pillars on the south row |
| tree_cedar_snow 玉山圓柏 | 1×1 | 584 | 4 | wind-bent twisted juniper, leeward pads, painted snow clumps |
| tree_betel 檳榔 | 1×1 | 1572 | 4 | slim ringed trunk, crownshaft, nut clusters, pinnate fronds |
| coconut_palm | 1×1 | 1308 | 4 | seaward lean + recurve, drooping fronds, coconuts, dead fronds |
| tree_banana | 1×1 | 536–1316 | 3–4 | pseudo-stems, torn paddle leaves, hanging bunch + purple bud |
| tree_fern 筆筒樹 | 1×1 | 1188 | 4 | scarred trunk, great arching bipinnate fronds, fiddleheads, brown skirt |
| pandanus 林投 | 1×1 | 2.6–3.2k | 3–4 | stilt roots, forking trunk, spiral serrated straps, orange syncarp |
| bamboo | 1×1 | 1.4–2.0k | 3 | 9–13 waxy noded culms arching out, feathery top sprays, strong sway |
| bush | 1×1 | 284 | 3 | v1 = 杜鵑 azalea in bloom |
| flowers | 1×1 | 240/848/240 | 2 | v0 咸豐草 + 野牡丹, v1 台灣百合 trumpets, v2 gold/pink |
| tallgrass / reeds / silvergrass 芒草 | 1×1 | 482–744 | 1–2 | vertex-coloured blades; feathery plume cards on reeds/芒草 |
| rice_stalks / millet 小米 | 1×1 | ≤1242 | 1 | 3×3 rice hills (young / heading / golden); millet foxtail panicles |
| lily | 1×1 | 1432/1432/690 | 2 | v0/v1 **彼岸花** red spider lily (matches the 2D art); v2 台灣百合 |
| lotus | 1×1 | 924–1204 | 2 | notched cupped pads on the water line (y −0.06), flowers, buds |
| seaweed | 1×1 | 624 | 1 | washed-up kelp ribbons + bladders, wet sheen |
| rock_small / rock_big / rock_marble | 1×1 / 2×2 / 1×1 | 200–600 | 2 | noise-displaced faceted boulders, painted granite / 太魯閣 marble veins, moss on up-faces |
| rock_basalt / basalt | 1×1 / 2×2 | 284 / 908 | 2 | 澎湖 hexagonal columns, stepped (tallest at the back) |
| stump / log / driftwood | 1×1 / 2×1 / 2×1 | ≤708 | 2–5 | end-grain rings, moss mantle, fungi; bleached gnarled driftwood |
| mushroom_glow | 1×1 | 1.7–2.5k | 5 | emissive gradient caps with glowing spots, per-instance pulse + hue swing, GPU spores, `lights()` |
| mushroom_giant | 2×2 (solid south row) | 2470 | 4 | stem on the solid row, cap shelters the walkable north row, glowing drips, 2 lights |
| crystal | 1×1 | 208 | 4 | faceted prisms (cyan / violet / amber), vertex glow + iridescent fresnel |
| geometry_pillar | 1×1 | 2.2–3.7k | 5 | rune plinth (hue-cycling glyphs), counter-rotating nested solids + merkaba, light column |
| jewel_flower | 1×1 | 253 | 4 | crystal stem, faceted gem bloom turning and bobbing, hue cycling |
| vine_curtain | w×1 (reads `o.w`) | 0.9–1.3k | 3–5 | mossy bough; vines sway with a hanging profile; v1/v2 bioluminescent bulbs + light |
| cliff_waterfall | 2×3 | 5.5–6k | 8 | strata boulders, top stream, two scrolling-UV water sheets, raised plunge pool, spinning foam, GPU mist |
| sea_of_clouds | 4×2 (reads `o.w/o.h`) | 4860 | 2 | billowing puffs (warm tops, cool undersides), drifting mist motes |

Tree budgets (≤12k, banyan/cypress ≤20k) and small-plant budgets (≤1.5k) all pass. Trees are ≤4 draw calls: bark, foliage, an optional extra, and the ground decal. Animated or GPU parts (motes, halos, rotating geometry, water sheets, foam) are separate meshes added after `K.merge`, as the contract allows.

## Shared look techniques
- **Foliage.** Clumps of crossed, alpha-tested cards painted from a 2×2 leaf-cluster atlas. Each card has a scalloped solid core and leaves breaking the silhouette. Normals are bent toward the canopy ellipsoid and the clump sphere, which gives soft volumetric shading with lit tops and lumpy forms. Vertex colours add AO and a cool-underside / warm-top temperature split. Twigs connect every clump to the nearest limb.
- **Translucency and wrap lighting** in the foliage shader (back-lit leaves glow yellow-green).
- **Bark.** Canvas-painted, tileable bark (furrow / plates / fibre / lenticel / rings / tree-fern), with world-scale UVs on parallel-transport tubes. Trunks have buttress flutes, lumps, and surface roots diving into the soil. Soil tint and moss come from vertex colours near the ground.
- **Ground decals** under trees: a contact shadow plus species leaf litter (maple leaves, sakura petals, pine needles, snow).
- **Per-instance yaw** on the first `update()` for rotation-symmetric footprints. It is skipped when the map sets `o.rot3d`.

## Grass carpet — `G.Nature3D.scatterGrass(view)`
- **Placement.** Uses 8×8-tile chunks of `InstancedMesh`. Each instance is an 8-blade clump of about 32 tris.
  - Density depends on quality: high 14 clumps per tile, ultra 22, low none. Under `?r3lite` it is off unless `G.Nature3D.forceGrass = true`.
  - It skips tiles under solid object footprints, and puts fewer, inset clumps on tiles that border non-grass tiles.
  - Per-instance tint depends on the tile type. `flowers_ground` tiles get instanced flower heads.
- **Animation.** Blades sway with the shared wind, bend away from the player, and fade out with camera distance (`uGrassFar` 26 m, ultra 34 m).
- **Updates.** Chunks refresh the shared uniforms in `onBeforeRender`, so it works even if nobody calls `update`. `handle.update(view)` or `G.Nature3D.update(view, dt)` also hides chunks by distance.
- **Cost.** About 160k extra tris on jiufen with everything visible. Frustum culling per chunk removes most of it.

## Requests for the lead (lead-owned files; I did not edit them)
1. **Hook up the wind and the grass carpet.**
   - Call `G.Nature3D.scatterGrass(this)` once after `buildGround()`/`syncObjects()` in `Map3D`.
   - Each frame, call `G.Nature3D.update(this, dt)`, or at least `G.Wind3D.update(dt)`.
   - Until then, the models' `update()` drives the wind clock through `G.Wind3D.tick(t)`, so trees already sway in-game.
2. **Swaying shadows.** The shadow pass uses the default depth material. Alpha-tested leaves cast correct leafy shadows, but the shadows do not sway. `R.mergeStatic` would need to carry a `customDepthMaterial` through the merge (and `Object3D.clone`) for wind-matched shadows.
3. **`o.spirit` handling in `Map3D.update`.** It sets `transparent`/`opacity` on shared materials, which changes every instance of that type. Suggest cloning the materials of spirit nodes once.
4. **Dense forest maps (alishan_trail, mistforest).** 1×1 trees placed shoulder to shoulder form a closed canopy in 3D. The player cutout keeps the hero visible, but a larger cutout radius for foliage (or fading canopies between camera and player) would help readability. Tree heights were already tuned down for the 52° camera:
   - camphor 4.4 m, pine 5.4 m, cypress 9 m, banyan 6.3 m;
   - canopy radii are close to the 2D silhouettes.
5. **Viewer.** `tools/r3d/viewer.html` swallows exceptions thrown by `update()` and passes `{ t: id }` as the instance. Surfacing the error would have caught a wind-clock bug sooner. That bug was the fallback clock being gated off for the first 400 ms; it is fixed.

## Tools (`tools/r3d/nature/`)
- `budget.js`: tris, draw calls, NaN bounds and build errors for all 40 types × 3 variants. Exits with code 1 on any violation.
- `game.js <map> out.png [extra] [waitMs] [grass]`: in-game r3lite shot, with console errors, per-type node counts and fallbacks.
- `shots.sh outdir "qs" ...`: parallel viewer renders.
- `defs.js`: dumps the 2D footprints and solid cells.
- `longedges.js`: debugs stray long triangles.

Useful viewer queries: `kind=models&group=tree_&yaw=25&pitch=52`, `&v=0|1|2`, `&night=1`, `&t=2` (wind time).

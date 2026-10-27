# Props team A: street / outdoor props, report

Branch `r3d-props-street`. All code is in `js/r3d/props.js`; tests are in `tools/r3d/props_street/`.
Interior props belong in `js/r3d/props_interior.js` (interior team), so this file defines only the 32 ids below.

## Coverage (32/32 real models, 0 billboard fallbacks)

| id | what it is | variants / state | static + animated draw calls | tris |
|---|---|---|---|---|
| lantern_string | catenary cord on slim bamboo poles, ribbed paper 燈籠 with lacquer caps, gold rims, knot and tassel | 2D `v` (red / festival mix + paper pennants / blue), `w`, `lift`, `lit`, `color`, `poles:false` | 2 + 2 | 2.4k (w3), ~6k (w8) |
| red_lantern | big 燈籠 on a bamboo pole with a curved arm, or `hang` from an eave | `hang`, `text` glyph (福 default), `color`, `lit` | 2 + 2 | 0.9k |
| lamp_post | granite base, wooden post, 行燈 lamp box (lacquered frame, glowing paper with calligraphy on all four sides, hipped cap) | `text`, `lit` | 3 | 0.6k |
| stone_lantern | 石燈籠: octagonal plinth, shaft, 中台, 火袋 chamber with glowing core, concave square roof, 宝珠 finial, lichen on tops | `lit` | 2 | 0.7k |
| sky_lantern | 天燈: rounded-square paper body with domed top, four coloured panels (main wish + 心想事成 / 闔家平安 … in brush ink), bamboo hoop, wire cross, burning joss wad (live flame); rises, bobs, turns | 2D `v` colours, `text`, `alt` | 0 + 4 | 0.5k |
| water_lantern | 水燈頭: plank-and-bamboo raft, glowing paper house (lattice door, surname plaque from `text`, 慶讚 / 中元 / 普渡 panels), gold posts, gable roof, red swallowtail ridge, pearl; floats, bobs, tilts | `text`, `color` | 0 + 4 | 0.5k |
| cart | handcart: plank bed, side rails, shafts / handles, two spoked wheels with iron tyres, prop legs, rice sacks stamped 米, wine jar, lashing rope | – | 4 | 2.3k |
| barrel | 16-stave barrel with bamboo hoops and lid; open barrel with water | 2D `v` (single / open + small / pair) | 3–4 | 0.8–1.6k |
| crate | plank crate: corner posts, battens, diagonal braces, nails, red stencil 茶 / 米 / 鹽 | 2D `v` (crate / stacked / crate + sack) | 2–4 | 0.4–0.8k |
| jar | glazed 酒甕 with red cloth cap, cord, red diamond 斗方 label (酒 / 醋); open water vat with a gourd ladle | 2D `v` | 3 | 0.6–1.4k |
| basket | two woven bamboo baskets with rims, heaped with goods | 2D `v` (taro / fish / oranges / greens) | 2 | 2.1–2.7k |
| stall | night-market stall: bamboo frame, striped sagging awning, waving scalloped valance, plank counter, cloth banner with `text`, pot of 芋圓 with ladle and steam, bowl stacks, chopstick tube, board, stool, swaying lantern | 2D `v` awning colours, `text`, `lit` | 4 + 2 | 3.1k |
| signboard | two posts on stone feet, vertical board with brush calligraphy on both faces, tiled cap | `text`, `v:1` red board | 3 | 0.3k |
| fence_wood / fence_bamboo | posts with caps + nailed rails / bamboo stakes of uneven height + lashed rails | `w`, vertical runs (`w:1,h>1`) | 1–2 | 0.3–3.2k (long runs) |
| bench | wooden plank bench, or `v:1` granite slab on blocks | `w`, `v` | 1 | 0.1–0.3k |
| laundry | forked bamboo posts on stone, bamboo pole, 大襟衫 / trousers / striped cloth hung with pins; cloth waves | `w` (item count as in 2D) | 2 + 1 | 0.6–1k |
| statue_lion | 石獅 on a 須彌座 with carved panels: haunches, chest, legs, paws with toes, curly mane, bulging eyes, fierce brows, collar with bell, tail curls. Male: open mouth, fangs, paw on a ribboned 繡球. Female: closed mouth, cub under the paw | 2D `v`, `flip` mirrors (pair-appropriate) | 1 | 2.9–3.0k |
| wind_lion | 金門風獅爺: standing on a plinth, hands on belly, big grin with teeth, round eyes, red cape (waves) tied at the throat | – | 1 + 1 | 2.2k |
| banner | tall pole in 旗桿夾 stone clamps, crossbar, gold finial; flag with 火焰邊 flame teeth, pole rings, vertical `text`; waves | `color`, `edge`, `text` | 2 + 1 | 0.6k |
| pilgrim_flag | 進香旗: red lacquer pole, gold spear tip, triangular 令旗 with 犬牙 serrated border and `text`; bell and 香火袋 pouch sway | `text`, `color` | 3 + 2 | 0.5k |
| grave | v0: Taiwanese horseshoe tomb (墓龜 mound, 墓手 arms, arched 墓碑 with red 金浦 / 顯考陳公之墓, altar 墓桌 with incense, 后土 tablet, 壓墓紙 joss paper under pebbles, grass tufts). v1: weathered tilted stone, moss, crack. v2: wooden marker with 故人之墓, dirt mound, scattered joss paper | 2D `v` | 4 | 0.2–2.2k |
| coffin | 棺木 on two trestles: box body and separate convex overhanging lid, both rising toward the head, red band, flared head board with 壽 medallion | – | 3 | 0.8k |
| bones | skull with jaw and sockets, long bones with knobs, ribs | 2D `v` | 1 | 1.1k |
| firepit | stone ring, ash bed, glowing embers and coals, four leaning logs with glowing ends, three live flames, sparks | – | 3 + 2 | 0.9k |
| drum_rack | 廟鼓: bulging red lacquer drum, hide heads (faint 鼓), two rings of brass studs, splayed A-frame stand, cradle, drumsticks | – | 3 | 2.3k |
| chest | lacquered chest with domed lid, brass straps, corner brackets, ring handles, lock plate. `open`: lid swings back (eased with a little settle), red silk lining, gold / silver 元寶, coins and pearls with a faint glow | key `open` | 3 + lid | 0.8k / 2.5k |
| switch | octagonal stone plate carved with the 八卦 trigrams and 太極; `on` sinks and the carvings glow teal | key `on` | 2 | 72 |
| brazier | bronze tripod bowl, relief band, curled legs, ring ears, glowing coals, flames, sparks | – | 2 + 2 | 1.8k |
| pillar | red lacquer column on a lotus 柱珠 plinth, gold bands, teal capital with gold studs | – | 3 | 2.2k |
| eternal_lamp | 長明燈: octagonal stone pillar, bronze lamp-house with lattice, verdigris roof, oil cup with a pale steady flame | – | 2 + 1 | 1k |
| soul_jar | glass jar on a wooden stand, bronze lid, red cord, yellow 敕令 talisman draped over the lid and down the front; blue soul-flame and orbiting motes inside | – | 4 + 2 | 0.9k |

The draw-call column counts static calls + animated calls (sway / wave cloth, flames, particles). Per the contract,
animated parts are kept separate. Every model is ≤ 6 calls in total. Every small prop is ≤ 3k tris, except the long
2-tile+ runs, which grow with `w`. Lights (`lights(o)`) exist on every prop that glows and honour `o.lit` / `o.on` /
`o.open`. They use at most 2 lights per object, so long lantern strings don't drain the 12-light pool.

## How it's built (shared kit in props.js)
- **Painted textures** (canvas, `G.R3M.tex`, cached): wood grain with knots, barrel staves, granite (speckle,
  weathering, lichen, cracks), bronze (mottling, verdigris, scratches), plain-weave cloth, lacquer, bamboo with nodes,
  basket weave, glazed stoneware with drips, turf, lantern paper (ribs, seams, fibres), plus per-text textures.
  Textures are near-white, so **vertex colours carry the tint**. One wood material serves every wood colour, which is
  what keeps props at 1–3 draw calls.
- **Brush calligraphy** (`ink()` / `inkFit()`): uses the game's own `G.FONT_FAMILY` (bundled 霞鶩文楷 → Kaiti TC →
  STKaiti → …), with ink bleed, a pressure double-strike, and dry-brush streaks erased on an offscreen layer. It is used
  on lanterns, the lamp box, signboards, the stall banner, flags, crate / sack stamps, jar labels, the tomb inscription,
  the coffin 壽, the drum head, the talisman, sky-lantern wishes and the water-lantern house.
- **Baked vertex AO** (`bake()`): darkens toward the ground, darkens down-facing surfaces, and applies per-part cavity
  multipliers, gradients and top-surface moss tint. Static parts are then merged by material, keeping custom
  attributes.
- **Shader animation**: `sway` (pendulum about a per-part pivot; lanterns, tassels, bells, pouches) and `wave`
  (cloth: flags, laundry, valances, the cape, the stall banner). Both are chained after the occluder-cutout patch.
  Phase comes from the instance's world position, so neighbours never move in lockstep and a whole string of
  lanterns is one draw call. Time is the shared `G.R3M.cutUniforms().uTime` that Map3D already advances. Each
  model's `update()` also sets it, so the asset viewer animates too.
- **Flames / sparks / steam / motes**: small additive `ShaderMaterial`s with per-flame seeds in vertex colour
  (warm / pale / blue kinds). Flicker comes from height and noise; emissive values > 1 so bloom picks them up.
- **Glow**: emissive paper multiplied by vertex colour (a `vcEmit` patch), so red, blue and cream lanterns share one
  material. Unlit (`lit:false`) uses a near-zero emissive copy.

## Variants and the `v: 0` gotcha (needs a lead decision)
`G.Models.create()` calls `build(Object.assign({}, o, { v }))`, where `v = (o.v || 0) % def.variants`. That has two
problems:
1. Without `variants`, `build()` always sees `v: 0`.
2. With it, an instance with no `o.v` gets variant 0, while the 2D art hashes x / y (`variant(o, nv, salt)`).

To match 2D exactly, props.js wraps `define()`. `key(o)` (called right before `build` in `create`) remembers the real
instance, and `build` reads the 2D layout (`G.Objects.get(t).layout(o)`) from it. Suggested lead fix: pass the
original `o` to `build` (e.g. `o.v2d` or `{ ...o, vModel: v }`), or compute `v` with the 2D `layout(o).v` when it
exists.

## Notes and requests for the lead
- **`objSig()` doesn't include `on`, `text`, `color`, `hang`, `flip` or `w`.** A `switch` toggling `o.on` won't
  rebuild its node (it keeps the old glow and height). Please add at least `o.on` (and ideally `o.text` and
  `o.color`; ch1 swaps a `red_lantern` colour at night) to the signature.
- **Spirit objects:** Map3D sets `transparent / opacity` on the node's materials, but props share materials across
  all instances, so one spirit chest makes every chest flicker. Suggested fix: clone materials for `o.spirit` nodes
  once (`node.traverse(n => n.material = n.material.clone())`), or use a per-instance uniform.
- `lights()` positions are local and ignore `o.rot3d` (Map3D adds them unrotated). This only matters for the
  offset lights of `red_lantern` and `stall`.
- `water_lantern` sits at y ≈ −0.035 so the raft floats on Map3D's water plane (y = −0.07). On a deck it shows as
  slightly sunk, which is fine.
- `lantern_string` brings its own slim bamboo end poles (`poles:false` hides them for strings anchored between
  buildings).
- Missing files that show in the console on every map and are not from props: `js/core/fontdata.js` and
  `js/i18n/en_ch*.js` (optional generated files absent from the repo).

## Testing
- `node tools/r3d/props_street/check.js [ids]`: builds every id plus its variants and states (open / on / hang /
  flip / v / w), then reports draw calls, tris, bounding box vs footprint, NaN bounding spheres and console errors.
  Current result: **all ok**.
- `node tools/r3d/props_street/shot.js "items=[{...}]&yaw=…&pitch=…&dist=…&night=1&t=1" out.png`: the props harness
  `view.html` (a copy of the asset viewer). It takes per-item params, runs `update()` with the real `o`, adds the real
  point lights from `lights(o)`, and adds per-item stats. `#` in the query is escaped automatically.
- `node tools/r3d/props_street/game.js "map=jiufen&x=17&y=14" out.png 30`: in-game `?debug&r3lite` smoke test. It
  lists which object types on the map got real models and prints console errors (the optional missing files above are
  filtered out). Checked jiufen, bangka, tamsui_fort and dream (prologue water lanterns): no console errors from
  props.
- Every model was reviewed by eye at day and night from the game pitch and close-up, and iterated (coffin silhouette,
  lion expressions, sky-lantern panel order and saturation, ceramic glaze, stamp scale, drum-stand legs, chest lid,
  bagua glow, water-lantern size).

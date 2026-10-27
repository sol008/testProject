# Architecture team B report: coastal, maritime and Indigenous models

**Owner file:** `js/r3d/arch_coast.js`
**Tests:** `tools/r3d/arch_coast/` (`view.html`, `shot.js`, `check.js`, `ingame.js`)
**Contract:** `docs/CONTRACTS_3D.md`

## Coverage

Every object type assigned to team B now has a real 3D model; none use the 2D billboard fallback. Each model is finished on all four sides.

| type | footprint | what it is | animation / lights |
|---|---|---|---|
| `lighthouse` | 3×3, door col 1 | Whitewashed masonry tower in the style of 鵝鑾鼻. It has a stepped stone plinth with steps to the south door, an arched iron door with a fanlight, staggered windows, a corbelled cornice, an iron gallery with railing, a glazed 12-pane lantern room, and a copper cupola topped by a ventilator ball, lightning rod and vane. | Double beam sweeps (additive cones, brighter as `view.dark` rises), plus a lamp halo. Lamp light (16 m) and door light. `o.lit === false` turns everything off; `o.beam === false` keeps the lamp but drops the sweep. |
| `lighthouse_lamp` | 2×2 | Fresnel lens: riveted iron platform, brass pedestal, a beehive of prism rings around an 8-panel bulls-eye belt, brass struts, top cap with vent ball. | Lens assembly and beams rotate; strong warm light. |
| `kuba` | 4×3, door col (default 1; `door:false` → 0) | Tsou men's house: raised plank floor on a post grid with stone footings, open sides with benches, central hearth with logs and fire, notched log ladder at the door column, a rounded thatched hood (layered courses, under-shell, ragged fringe), ridge roll with lashings, and fiteu (金草) tufts with yellow flowers. | Hearth light (flicker 0.5). |
| `bunun_house` | 4×3, door col | Dry-stacked slate walls with big alternating corner stones and jutting slabs, timber door frame with a heavy lintel and the door ajar, small framed windows. Roof of ~150 individually placed overlapping slate slabs, with ridge capstones and slate gable infill. | Hearth glow at the door. |
| `tao_house` | 4×3, door col | Tao vahey: cobble retaining walls with rim stones (back and sides at ground+0.8, low front rim), stone steps at the door column, pebble-paved pit floor. Plank house front with three small low doorways. Low thatched roof whose ridge barely clears the rim, held down by typhoon binding rods. Backrest stone. Houses selected by a position hash also get a **tagakal** (raised cool pavilion); `o.pavilion` overrides. | — |
| `tatala` | 2×1 | Plank boat with tall upswept stems. Painted hull (white with red and black): sawtooth gunwale band, the boat's eye (mata no tatala) rosettes near both ends on both sides, a band of stylised human figures amidships, keel band, plank seams with dowels. Inner hull of bare wood with ribs, thwarts, two oars, and feather tufts on the stem tips. | Afloat (`o.water`): bob, pitch, roll. Beached: rests on log rollers with stones. Tufts sway. |
| `c10_amis_house` | `o.w`×3, `o.door` | Amis thatched long house: raised bamboo-pole floor, split-bamboo walls with rattan binding bands, barred windows, deep-eaved gabled thatch over a front porch with posts, bamboo gable infill. `o.big` (age-grade house) adds a carved and painted front board. | Interior light at the door. |
| `c10_fish_rack` | 2×1 | Tao flying-fish (飛魚) rack: bamboo frame with braces and two rows of split fish (painted, alpha-cut, long pectoral fins). | Both rows sway. |
| `c10_denggao` | 1×1 | 燈篙 (ghost-month lantern pole): 5.2 m bamboo pole on a stone footing, leafy crown, cross bar with white and red lanterns. `o.blue` gives ghost-blue lanterns; `o.name` hangs a name lantern with the painted name (e.g. 阿義). | Lanterns and crown sway; top light (blue when `o.blue`). |
| `c10_monster_show` | 1×1 | Cutscene creature prop. Uses `G.Mon3D.create(o.art)` when the monster team provides it, otherwise the 2D monster billboard. Created lazily per instance, with the 2D scale rule, blob shadow and bob. | `inst.update(dt, view.yaw)` each frame. |
| `totem` | 1×1 | Carved wooden marker post (see the cultural notes below): eye rosette, red/white/black diamond bands, zigzag relief, a simple figure, peaked cap, stone ring. | — |
| `millet_rack` | 2×1 | Forked posts and two cross poles hung with bound sheaves of golden, orange and red millet, tied with red string. | Sheaves sway. |
| `drying_rack` | 2×1, v0/v1 | v0: 米粉 cakes on a south-facing tilted bamboo screen (新竹). v1: tiered stand of round bamboo sieves with persimmons (柿餅). | — |
| `fishing_net` | 2×1 | Net between two poles. Alpha knotted mesh, top rope with alternating glass and cork floats, lead line with sinkers, net pile at the foot. | Net billows: per-instance vertex animation. |
| `loom` | 1×1 | Backstrap (horizontal) loom at rest, as used by Truku, Atayal and Saisiyat weavers: warp box braced by stones, warp sheet, shed rod, heddle rod with string loops, beater sword, cloth beam with a leather backstrap, half-woven red cloth with nested diamond motifs, yarn ball and basket. | — |
| `wang_boat` | 6×3 | 王船 junk. Painted hull bands (red with gold scrolls, gold, teal with waves and clouds, gold, deep red with key-fret, black bottom) and 龍目 eyes. Painted transoms with a sun medallion. Gold gunwale rails and planked deck. Stern 王府 cabin with red pillars, gilt lattice doors, green-tiled curved roof, swallowtail ridge and gourd. Three masts with gold caps carrying battened junk sails with sheet fans, plus stays, rudder and tiller, wooden anchor and windlass. | Sails billow; streamers, 16 five-colour 令旗 and the 代天巡狩 banner flutter; red lanterns swing. Afloat (`o.water`): bob, pitch, roll; otherwise sits on a timber cradle. Two lantern lights. |
| `guzhao` | 4×3 | 孤棚 (頭城搶孤): 12 greased poles (glossy, with grease streaks), cross bracing, a plank platform with an overhanging 倒爬 rim, red skirt with gold sawtooth, 13 孤棧 offering cones (offering-ring texture, bamboo ribs) each topped by a 順風旗, and 12 red lanterns along the rim. | All flags flutter (one mesh); three warm lights. |
| `stone_weir` | `o.w`×`o.h`, v0 arc / v1 雙心 | 澎湖石滬: basalt and coral-stone (咾咕石, porous texture) dry-stone wall built from the exact 2D `weirPath`, so stones sit on the solid cells. Wet waterline darkening. | Foam line pulses and drifts. |
| `boat_small` | 2×1 | 舢舨 sampan: plank hull, half-barrel bamboo-mat canopy (篷), stern scull oar, rope coil, basket. | Bob, pitch, roll. |
| `boat_ferry` | 3×2 | Ferry: painted dark hull with 龍目, deck, mat-roofed cabin with benches and a warm interior, stern scull, curved bow lantern pole with a lantern in `o.color`. | Bob plus lantern sway; lantern light. |
| `dock_post` | 1×1, 2 variants | v0: single piling. v1: a pair joined by slack rope. Rope wraps, weed band at the waterline, barnacles, pilings run below the water. The variant comes from the position hash, as in the 2D def. | — |
| `rainbow_arch` | `o.w`×`o.h`, non-solid | Spirit rainbow bridge: a translucent additive ribbon of seven radial bands with a walkable striped top face, faint outer halo, drifting sparkles and misty glowing feet. Light pulses walk across in a custom shader. It never casts shadows. | Time-driven shader, sparkles, mist; two coloured lights. |

I skipped `basalt` as instructed; the nature team owns it.

## Quality techniques used

* **Painted textures with derived normal maps.** `texSet()` paints colour and height together on canvases and converts height to a tangent-space normal map. This covers straw, wood grain, split bamboo, bamboo poles, mat weave, slate wall courses, slate slabs, river cobbles, plaster, stone blocks, coral stone, offering rings, grease, roof tiles, sail cloth with battens, and backstrap weave. UVs are in metres (about 256 px/m) via per-face box UVs, lathe and tube UV scaling, and triplanar rocks.
* **Builder.** Geometry is collected per material and vertex colours are baked: tint × ground AO × custom AO (thatch course shadow, sun-greyed upper courses, wet stone darkening, hull bilge shading). Each material is then merged into one mesh. **Every model is at or under 6 static draw calls** (`check.js` enforces this). Animated parts are separate named children.
* **Glow folding.** Every emissive part (fires, windows, lenses, flowers, door glows) is folded automatically into **one** shared unlit vertex-colour material with HDR colours above 1 (bloom). A model's lights therefore cost one draw call.
* **Thatch system.** `thatchHood()` builds rounded-rectangle contour roofs from the ridge to the eave, with fixed corner parameterisation and a welded seam. It adds course lips (sawtooth normal offset), lumpy periodic noise, an under-shell, a double-sided eave band and an alpha straw fringe. `thatchGable()` does the same for gables. Both are used for the kuba, Tao, Amis and tagakal roofs.
* **Parametric hulls.** `hullFn()` and `buildHull()` produce the outer painted surface, inner wood, gunwale caps and transoms. The hull textures paint one side and mirror it to the other; motifs (eyes) are pre-squashed to cancel UV stretch. The same system drives the tatala, 王船, sampan and ferry.
* **Cloth.** `flutter()` clones the geometry once per instance, then displaces vertices along an axis, weighted by UV distance from the attached edge, and recomputes normals. It drives sails, flags, the banner and the net. Shadows follow because this runs on the CPU.

## Budgets (from `node tools/r3d/arch_coast/check.js`)

All 37 cases pass: no errors, no NaN bounds, ≤ 6 static draws, and every solid cell inside the model bounds. Approximate triangle counts:

* Houses: kuba 13k, Tao 10–13k, Amis 9–11k, Bunun 3.3k.
* Large festival and maritime models: 王船 12k, 孤棚 10k, weir 11–16k.
* Lighthouse 6.5k.
* Boats: tatala 7k, ferry 4k, sampan 2.7k.
* Props: all under 3k, except the lamp and rainbow (prop+, under 6k).

## Testing

* `node tools/r3d/arch_coast/shot.js '<query>' out.png` renders with `tools/r3d/arch_coast/view.html`. The viewer loads the full game script list, so the `c10_*` defs from `ch10_east.js` exist. It accepts instance fields as JSON (`o={"water":true,"w":8}`) and supports `water=1` (water plane at −0.07), `night=1` (adds the model's `lights()` as point lights), `solid=1` (overlays the 2D solid cells), and `t=` for animation time.
* `node tools/r3d/arch_coast/check.js` is the per-model budget, error and coverage check.
* `node tools/r3d/arch_coast/ingame.js <outdir> [map:type …]` loads `index.html?debug&r3lite&map=…`, stands the player beside the object, screenshots, and reports console errors and any 2D fallbacks for team-B types.

**In-game result (`?debug&r3lite`, 14 maps):** `orchid_shore`, `toucheng`, `amis_village`, `truku_village`, `penghu_flats`, `eluanbi`, `lighthouse_top`, `tsou_hosa`, `bunun_home`, `donggang`, `badouzi`, `zhuqian_mifen`, `huilan` and `keelung_fest` all built their 3D view. There were **zero console errors** and **zero 2D fallbacks** for team-B types. Scene totals were 33–77 draw calls and 2k–38k triangles (r3lite).

What is not yet verified in-game: `rainbow_arch` (it needs `vars.c10_rainbow`, which the debug URL can't set) and `c10_monster_show` (it's only spawned in cutscenes). Both were checked in the viewer, including the `G.Mon3D` / billboard path.

## Cultural care notes

* **Kuba (Tsou):** shown as the men's house is described publicly: open sides, perpetual hearth, fiteu on the roof (as on the 2D art). No enemy-head baskets, weapons or other ritual objects are modelled. The optional 赤榕 tree is left to the nature team rather than placed inside the footprint.
* **Tatala (Tao):** the eye rosettes, sawtooth and figure bands follow the documented red, white and black decoration of plank boats. They are kept simple rather than inventing new "sacred" motifs.
* **Tao vahey and tagakal:** a semi-subterranean house with a low roof and typhoon rods, where the pit is shown as an embankment because Map3D ground is flat. The party never enters in-story, and the model has no interior.
* **Totem:** a "totem" post does not belong to the Tsou (ch7) or the Tao (ch11). To avoid misusing a sacred ancestor pillar (such as a Paiwan or Rukai 祖靈柱), the model is a neutral **carved marker post**. It carries the boat-eye motif named in the ch11 text plus generic geometric bands, with no specific ancestor imagery.
* **Rainbow bridge (Truku):** the model is ethereal and non-physical, only to be looked at (non-solid, no shadow), as the chapter notes require.
* **Loom:** the horizontal backstrap loom is the weaving tool of the Truku village where it appears (ch10), and of the Saisiyat village (ch4). The woven red cloth uses generic nested-diamond motifs.
* **孤棚 / 王船 / 燈篙:** Han festival structures are modelled with their customary details (代天巡狩 banner, 令旗 five colours, 順風旗, name lantern).

## Notes for the lead

* **`guzhao` is 孤棚, not 古厝.** The brief said "guzhao (古厝/澎湖咾咕石 house)", but the game's `guzhao` def (objects2.js) and its use in `toucheng` are the 頭城搶孤 **孤棚**. I modelled what the game uses. A 咾咕石 house type doesn't exist in `G.Objects`. If one is wanted, add a 2D def and I'll build it (the coral-stone texture already exists).
* **`G.Models.create` forces `o.v = 0`** for defs without `variants`. Map objects that rely on a position-hashed variant (such as `dock_post`) need the workaround in `key()`. A small change in models.js would avoid this: pass the original `o.v` through when `variants` is unset.
* **`o.spirit` in mapview.js** sets `transparent`/`opacity` on the node's materials. Those materials are shared caches, so one spirit object fades every model that uses the same material. I'd suggest cloning materials per spirit node.
* **`update(node, o, t, dt)` doesn't receive the camera.** For `c10_monster_show` I read `G.R3.view.yaw` and `G.R3.view.camera`, which works because `G.R3.view` is the active Map3D.

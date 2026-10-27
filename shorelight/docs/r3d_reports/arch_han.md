# Architecture team A: Han-Taiwanese buildings (`js/r3d/arch_han.js`)

## Coverage
Every Han building type in `G.Objects.defs` now has a real 3D model, plus a few related types:

| id | footprint | draw calls* | tris | lights | notes |
|---|---|---|---|---|---|
| house_jiufen | 4×3 (w/h resizable) | 4 | 2.9k | 2 | 4 variants (clapboard / planks + rubble footing / green clapboard with 湯 noren / plaster + shoji); tar-paper (油毛氈) roof on battens, chimney on even variants |
| teahouse | 5×4 | 6 | 9.1k | 4 | plank ground floor, pent roof (腰簷) with a row of lanterns, balcony and name board, shoji upper floor, front cross gable (破風) with a round window and 懸魚, 茶館 hanging sign |
| house_minnan | 5×3 (w/h resizable) | 6 | 12.8k | 2 | 凹壽 recessed entry, granite footing and quoins, 水車堵 frieze, 石條窗 stone-bar windows, couplets; v0 燕尾 swallowtail ridge, v1 馬背 gables |
| shophouse | 4×3 (w resizable) | 6 | 11.6k | 3 | 亭仔腳 arcade with arched piers, shopfronts, jars and lanterns; pastel upper façade with arched windows and louvred shutters; parapet with crest and shop name |
| temple | 7×5 | 6 | 49k | 4 | 三川殿 with raised central roof (斷簷升箭口), 龍柱 dragon columns, 門神 door gods, 龍虎窗, porch brackets and pendants, 剪黏 twin dragons with flaming pearl, 歇山 main hall |
| mazu_temple | 6×4 | 6 | 43k | 4 | red brick, studded side doors, vertical 豎匾 plaque, pagoda crown |
| city_god_temple | 6×4 | 6 | 44k | 4 | dark tiles and timber, gourd crown, the City God's great abacus under the porch |
| shrine_small | 2×2 | 6 | 4.0k | 1 | 土地公廟: veiled niche, couplets, swallowtail roof with pearl, incense burner; a 伯公 text gets grey tiles and Hakka couplets |
| pavilion | 3×3 | 4 | 17k | 2 | square 攢尖, green glazed tiles, 美人靠 benches, stone table, fretwork, gourd finial |
| paifang | 4×1 | 4 | 6.6k | 0 | v0 granite / green tiles, v1 red lacquer / red tiles; 抱鼓石 drum stones, carved post couplets |
| mine_entrance | 3×2 | 5 | 4.0k | 1 | mossy hillside with an adit, timbered portal, rails into the dark, oil lamp, ferns |
| city_wall | w×1 | 1 | 0.2k (4 m) | 0 | battered faces, crenellations, walkway; v0 stone / v1 brick; `o.tall` scales height |
| gate_city | 3×2 | 5 | 7.6k | 4 | masonry block with a vaulted passage, studded leaves, torches, gate tower (城樓) |
| fort_gate | 3×2 (w resizable) | 5 | 6.3k | 1 | 恆春 style: rubble base, brick upper, small tower |
| hakka_house | 6×4 (resizable) | 5 | 22k | 2 | 夥房 U-plan: 正身 with 祖堂 and its 堂號 board, 橫屋 wings with white gables, 門樓 gate, 禾埕 drying trays, 化胎 mound |
| red_fort | 5×4 | 5 | 15k | 1 | 紅毛城-inspired (not a copy): battered keep, white quoins, arches, crenellated terrace with cannons, sentry box, flag |
| chikan_tower | 5×4 | 5 | 36k | 3 | 赤崁樓-inspired: brick podium with an arched gate, rear hall, front 重簷歇山 pavilion |
| bell_tower | 2×2 | 3 | 16k | 0 | bronze bell, striker log on ropes, double green eaves |
| qixi_pavilion | 2×2 | 6 | 1.6k | 2 | 七娘媽亭: paper pavilion on an offering table with skirt, flowers, fruit, candles |
| firecracker_tower | 2×1 | 5 | 4.1k | 2 | 鹽水蜂炮 炮城 cart; spark particles unless `lit === false` |
| well | 1×1 | 2 | 2.0k | 0 | stone ring, windlass, buckets |
| palanquin | 2×2 | 4 | 4.9k | 0 | gilded 神轎 on trestles; sways unless `o.still` |
| granary, slate_house | 2×2, 4×3 | 1, 3 | 1.4k | 0, 1 | Indigenous types, built so they are covered (see Coordination) |
| c10_denggao | 1×1 | 2 | 1.4k | 1 | 中元 燈篙 lantern pole; `o.blue` and `o.name` supported |

\* "Draw calls" includes the animated sway (lanterns) and cloth (curtains, flags) meshes, so every model meets the ≤ 6 limit including animation. Triangle counts are per instance before the shadow pass. Every model is under budget (houses ≤ 40k, temples ≤ 80k).

Footprints and solid cells follow the 2D defs. Door cells are open: recessed entries (凹壽), porches, gate passages and the pavilion step. Variants, door column, `w`/`h` resizing, `lit` and `text` are resolved exactly as in `objects.js` / `objects2.js`, including the hash-based variant when `o.v` is unset, and are part of the model cache key.

## How it is built
- **Shared painted atlas** (2048², 64 cells of 240 px plus wrap gutters). Every cell is painted in Canvas 2D: clay tiles, tar paper, slate, thatch, 剪黏 porcelain, dragon scales, brick bonds, granite, plaster, timber grain, 彩繪 beams, the 水車堵 frieze, lattices, door gods, studded doors, lanterns (福/平/安), noren, embroidery, rock, bamboo and more. The geometry uses world-scale "atlas UVs". A small `onBeforeCompile` patch tiles each cell with `textureGrad`, so there are no seams or mip bleeding. One atlas plus three shared standard materials (matte, gloss, metal) and a glow material serve every building, which keeps the shader-program count low.
- **Builder (`Bld`)** writes triangles straight into material buckets with vertex colours for tint, ground and under-eave AO, and emission. There is no `mergeStatic` pass; each bucket becomes one mesh.
- **Roof generator**: curved gable, hip, 歇山 and 攢尖 roofs with 舉折 concavity, corner lift and flare (起翹), real tube-and-pan tile corrugation (瓦當 end caps), batten or flat variants, soffits, fascias and barge boards. Ridges are swept along the roof, with 燕尾 forks, curled hip ends, 剪黏 bands, twin dragons, a flaming pearl, a gourd or a pagoda.
- **Animation**: lanterns and cloth sway in the vertex shader (per-vertex pivot plus the global `uTime`), so they cost one draw call each. The palanquin sways via `update()`, and the rocket tower updates its sparks there. Point lights come from `lights(o)`: lantern clusters are merged and the strongest four are kept.
- Per-model text (plaques, couplets, shop names) goes into a small per-model decal sheet. Horizontal 匾額 read **right to left** (Qing convention, as `objects2.js` specifies), so `彼岸` appears as 岸彼. Changing this to left-to-right is a one-character change in `chars()` (`dir: 'hl'`).

## Cultural notes
- Deities are **never** shown: temple doors open onto an altar, candles and a closed embroidered curtain; the 土地公 niche and the palanquin are curtained too. Door gods (門神) are painted as guardian figures.
- Roof colours follow the 2D art: temple and Mazu use red/orange, City God uses dark grey, Hakka uses grey with white plaster, Jiufen uses black tar paper.

## Testing
- `tools/r3d/arch_han/sheet.js "id[:params],…" out.png "yaw=25&pitch=30" cols` renders each model framed on its own. Params prefixed `o.` (for example `o.w=6&o.door=-1&o.text=客棧`) are injected per instance without changing the viewer.
- `tools/r3d/arch_han/inspect.js ids [params]` prints draw calls, triangles, bounds, NaNs and lights.
- `tools/r3d/arch_han/ingame.js map out.png "x=..&y=.."` loads the real game (`?debug&r3lite`) and lists model versus fallback counts.
- `tools/r3d/arch_han/art2d.js` dumps the 2D reference art with solid cells.
- Checked in game on jiufen, bangka, keelung_fest (night) and lukang: zero console errors from these models. The only failed loads are the pre-existing optional `fontdata.js` and `i18n/en_ch*.js`.

## Coordination and requests for the lead
1. **slate_house and granary** are Indigenous types. I built them so they are covered. `arch_coast.js` loads after this file, so any team B definition overrides mine automatically.
2. **Not done:** `guzhao` (頭城搶孤 孤棚, a Han ritual structure). It was not in my list, and nobody else owns it either. The other `c*_` types are Indigenous or props.
3. **Spirit objects** (`o.spirit` in `mapview.js`) set `opacity`/`transparent` on the node's materials. Materials are shared across all buildings, so one spirit building would fade every Han building. Suggestion: clone the materials for spirit nodes in Map3D.
4. `lights(o)` offsets ignore `o.rot3d`, so rotated buildings get unrotated lights.
5. Swaying meshes cast static shadows (the default depth material has no sway). This is minor and only matters for lanterns.
6. The viewer doesn't forward instance params (`w`, `door`, `text`…); my sheet tool injects them instead.
7. The `G.ArchHan` export (builder, roof, ridge, wall, window, door, lantern, plaque helpers) is available if other teams want consistent architecture.

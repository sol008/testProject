# Shorelight 《彼岸燈》 — Technical Contracts

Pure HTML5 Canvas + vanilla JS. **No build step, no modules, no network** — the game must run by
double-clicking `index.html` (file://) in Chrome or Safari on macOS. All art is drawn procedurally
with Canvas 2D in code; all music/SFX are synthesised with WebAudio. Every file is a classic script
that attaches to the global `G` object (`'use strict';` at top). Do not use `ctx.filter` (Safari).
`ctx.roundRect`, `Path2D`, gradients and composite ops are fine.

## Global basics (js/core/util.js — already exists, read it)
- `G.W = 1280`, `G.H = 720` — logical screen size. `G.TILE = 64` — logical tile size.
- `G.S` — backing-store scale (1–2). Everything is drawn in **logical** coordinates; the engine
  sets the transform. When you pre-render to offscreen canvases use `G.U.makeCanvas(w, h)` — it
  creates a canvas at `G.S` resolution whose context is already scaled; draw it back with
  `ctx.drawImage(c, x, y, c.lw, c.lh)`.
- `G.U` helpers: `clamp, lerp, rand, randi, pick, hash(x,y,seed)->0..1, seeded(seed)->rng, vnoise,
  shade(hex, amt -1..1), mix(h1,h2,t), rgba(hex,a), hex2rgb, makeCanvas, ease.*`.
- `G.font(size, bold)` gives the game font string (Traditional Chinese Kai font stack).
- `G.time` seconds since boot (the engine passes `t` explicitly to draw calls anyway).

## Art direction (all visual modules)
- Modern HD 2D, "2026 indie" quality: clean painterly-vector look — soft gradients, layered
  shading (base / shadow / highlight / rim light), subtle coloured outlines (a darkened hue of the
  fill, never pure black, ~1.5–2.5px), anti-aliased curves. Avoid flat MS-Paint blobs.
- Camera: classic JRPG **top-down 3/4 view** (like 仙劍 / modern pixel-HD RPGs). Light from top-left.
- Palette: warm lantern reds/ambers, misty blue-greens, ink-dark nights, jade, gold. Taiwanese
  flavour: 九份 black-tar roofs & red lanterns, 閩南 red-brick with swallowtail ridges (燕尾脊),
  temple dragons, banyan, bamboo, tree ferns, betel palms, slate houses of mountain people.
- Performance: draw calls happen every frame at 60fps. **Pre-render static art into offscreen
  canvases (cache by key) at first use**, then `drawImage`. Only genuinely animated bits are drawn live.
- Deterministic variation: use `G.U.hash(cx, cy, seed)` so the same cell always looks the same.

## Character sprites — `js/gfx/sprites.js` → `G.Sprites`
```
G.Sprites.drawChar(ctx, id, dir, frame, x, y, o)   // map sprite
  dir: 'down'|'up'|'left'|'right'; frame: 0..3 walk cycle (0 and 2 = neutral stance, 1 and 3 = steps)
  x, y: logical px of the FEET centre (bottom-centre). Sprite ~48–56 px wide, ~88–100 px tall.
  o: { alpha?:0..1, scale?:number, ghost?:bool (translucent blue spirit look), shadow?:bool=true }
  Draw a soft ground shadow ellipse unless o.shadow===false.
G.Sprites.drawBattle(ctx, id, pose, t, x, y, o)     // battle sprite, FACING LEFT (party stands on the right)
  pose: 'idle'|'ready'|'attack'|'cast'|'hurt'|'ko'|'guard'|'victory'|'item'
  ~1.6x map size (≈150 px tall humans). Idle has breathing bob from t. o: { alpha, flip (face right), ghost }
G.Sprites.has(id) -> bool;  G.Sprites.ids() -> array
G.Sprites.define(id, spec)   // register custom NPC variants from your spec format (document it at top of file)
```
Required ids — main cast: `xinghe, baizhi, hongying, yungui, tuanzi` (石虎 leopard-cat spirit, small,
chubby, cute; walks on 4 legs on map), `chenbo, yexuan, qingfeng, qingfeng_mask, qingxu, moya, maya,
nianer` (little ghost girl), `lantern_mother` (glowing robed goddess).
NPC archetypes: `villager_m, villager_f, villager_m2, villager_f2, old_m, old_f, child_m, child_f,
miner, fisherman, merchant, shopkeeper_f, scholar, monk, taoist, temple_guard, soldier, noble_m,
noble_f, maid, servant_old, actress (歌仔戲 costume), storyteller, doctor, tribal_m, tribal_f,
tribal_elder, hunter, sailor, boatman, widow, ghost_m, ghost_f, ghost_child, linto (林投姐 ghost woman),
woodcutter, tea_girl`. Animals: `dog` (yellow 台灣土狗 阿黃), `cat`, `chicken`, `buffalo` (水牛), `crow`.
(Animals only need drawChar.) Main cast and important NPCs need drawBattle (all main cast + qingfeng,
qingfeng_mask, yexuan, moya, qingxu, chenbo, temple_guard, hongying also used as a boss).

## Portraits — `js/gfx/portraits.js` → `G.Portraits`
```
G.Portraits.draw(ctx, id, expr, x, y, w, h, t, o)   // bust portrait fitted into box (x,y,w,h), typically 300x340
  expr: 'normal'|'smile'|'laugh'|'sad'|'cry'|'angry'|'surprise'|'think'|'shy'|'hurt'|'serious'|'smug'
  t: seconds (for blinking ~every 3–5s, subtle breathing).  o: { flip?:bool, alpha?:number, dim?:bool }
  Faces RIGHT by default (shown on the left of the dialog box).
G.Portraits.has(id)
```
Ids: `xinghe, baizhi, hongying, yungui, tuanzi, chenbo, yexuan, qingfeng, qingfeng_mask, qingxu,
moya, maya, nianer, abing (storyteller), agan (芋圓 auntie), xiaojin (kid), atu (ghost miner), alian
(widow), linto (林投姐), lantern_mother`. Style: modern anime/donghua bust, painterly soft shading,
big expressive eyes, detailed hair strands, clothing per STORY_BIBLE. Unknown id → draw nothing.

## Battle backdrops — `js/gfx/backdrops.js` → `G.Backdrops`
```
G.Backdrops.draw(ctx, id, t)   // fills the full 1280x720 logical screen; animated elements via t
```
Ids: `dream` (lantern bridge over black sea), `jiufen_night` (stairs, red lanterns, night),
`jiufen_day`, `shore` (八斗子 night sea, floating lanterns), `mine`, `forest` (misty), `mushroom`
(bioluminescent psychedelic grove), `pingxi` (sky lanterns), `mountain`, `temple` (Taoist courtyard),
`city` (艋舺 street), `mansion` (haunted 閩南 mansion), `tainan` (府城), `palace` (長明宮 interior, jars of
blue soul-lanterns), `linto` (林投 pandanus forest by sea), `tribe` (slate village, firelight),
`vision` (psychedelic jungle of living geometry, serpent patterns, breathing colours), `lake`
(日月潭 mist), `shrine` (燈母祠 interior), `chaos` (burning city, reversed black tide), `sea` (black
tide, lanterns, boat), `farshore` (red 彼岸花 fields under strange sky), `lighthouse` (tower interior),
`breath` (一息界 kaleidoscope hyperspace — fractal jewel geometry, highly animated).
Ground plane: enemies stand around y≈420–560 on the left half, party around y≈430–600 on the right.

## Monsters — `js/gfx/monsters.js`, `js/gfx/monsters2.js` → `G.Monsters.define(id, def)`
```
G.Monsters.define(id, { w, h, draw(ctx, x, y, t, o) })
  x, y = FEET centre (bottom-centre) in logical px; draw upward from there. Face RIGHT (party is on the right).
  w,h = approximate bounding size (used for targeting cursor & damage number placement).
  o: { state:'idle'|'attack'|'hurt'|'cast'|'dead', st: seconds since state began, variant?:0|1|2 (palette
       swap for stronger versions), phase?:1|2|3 (bosses) }
  Idle animation from t (breathing, floating, flicker). The engine handles white hit-flash, death
  dissolve, shadows and scaling — do not implement those.
```
Normal enemies ~120–200 px tall, mini-bosses ~240, bosses 300–420.

## Tiles — `js/gfx/tiles.js` → `G.Tiles.define(id, def)` (registry in js/gfx/registry.js)
```
G.Tiles.define(id, { solid, wall?, water?, anim?, draw(ctx, px, py, nb, cx, cy, t) })
  Draw one 64x64 cell at (px,py) top-left. nb(dx,dy) returns the neighbour terrain id (out of bounds →
  same as centre). Use neighbours for autotiling: shorelines, path edges blending into grass, wall
  faces. `wall:true` tiles (cliff, cave_wall, wall_plaster, wall_brick, wall_wood, hedge, void) must
  render a 3/4-view front face when the cell below is not the same wall type, and a dark/top texture
  otherwise. Water must animate (gentle waves/sparkle).
```
Terrain ids: `grass, grass_dark, flowers_ground, dirt, path, stone (九份 stone street), stairs (stone steps
running north–south), brick (閩南 red brick courtyard), sand, water (sea), deepwater, shallow, lake, river,
marsh, wood (interior floor), tile_floor (interior stone), red_carpet, temple_floor, tatami? (no) →
mat (woven rattan floor), cave, rail (mine floor with rails), farmland, dock (wooden planks), bridge_h,
bridge_v, spirit_floor (glowing ethereal), lily_field (彼岸花 ground), moss_glow (bioluminescent moss),
vision (psychedelic animated floor), breath (kaleidoscope geometry floor, animated), cloud (dream
floor), lantern_bridge (planks over black sea, for the dream), slate (stone slab plaza of tribe)`;
walls: `cliff, cave_wall, wall_plaster, wall_brick, wall_wood, wall_temple, hedge, void, black_sea`
(black_sea is solid water of the dead, animated, with faint drifting lights).

## Objects — `js/gfx/nature.js` (nature) and `js/gfx/objects.js` (buildings & props)
```
G.Objects.define(type, {
  w, h,                 // footprint in tiles (collision area), anchored at instance (x,y) = top-left cell
  solid: true|false,    // whole footprint blocks; OR solidAt(o, dx, dy) -> bool for partial footprints
  draw(ctx, px, py, o, t),   // px,py = logical px of footprint top-left. May draw ABOVE the footprint
                             // (tall trees, roofs). Engine y-sorts objects with characters by footprint bottom.
  lights?(o) -> [{ dx, dy, r, color, flicker?:0..1 }],  // light sources (px offsets from footprint top-left)
  anim?: bool,          // true if appearance changes with t
  over?: bool,          // true = always drawn above characters (e.g. hanging lantern strings, canopies)
})
```
Instance `o` = `{ t: type, x, y, ...params }` from map data. Common params: `v` (variant number),
`door` (column offset of a door in a building's bottom row — that cell must be non-solid), `w`/`h`
overrides for resizable things (houses, walls, fences), `color`, `text` (sign text), `open` (chest).

**nature.js types:** `tree_pine, tree_banyan (big 3x3), tree_camphor, tree_maple, tree_dead,
tree_sakura (山櫻花), tree_cypress (giant 紅檜 2x2), tree_betel (檳榔 palm), tree_banana, tree_fern
(筆筒樹 tree fern), pandanus (林投), bamboo (dense clump), bush, flowers, tallgrass, reeds, lotus (on
water, non-solid? solid), rock_small, rock_big (2x2), mushroom_glow (cluster, glowing, anim), mushroom_giant
(2x2 glowing giant mushroom, lights), crystal (glowing), lily (彼岸花 cluster, non-solid), vine_curtain,
stump, log, cliff_waterfall (2x3 animated), geometry_pillar (psychedelic, anim), jewel_flower (一息界, anim)`.

**objects.js types:** buildings — `house_jiufen` (default 4x3, wood + black tar-paper roof, red lanterns),
`teahouse` (5x4, multi-storey 九份 茶樓 with many red lanterns — iconic), `house_minnan` (5x3 red brick,
swallowtail ridge 燕尾脊), `shophouse` (4x3 亭仔腳 arcade front), `temple` (7x5 big temple, ornate roof
with dragons), `shrine_small` (土地公廟 2x2), `slate_house` (4x3 tribal 石板屋), `granary` (2x2 raised),
`pavilion` (3x3 涼亭), `paifang` (4x1 牌坊 gate, cells passable except posts), `lighthouse` (3x3, tall),
`mine_entrance` (3x2 timbered), `city_wall` (w x 1), `gate_city` (3x2). Street props — `lantern_string`
(over:true, w=N, red lanterns strung across), `lamp_post`, `stone_lantern`, `red_lantern` (hanging from
eave/pole), `well`, `cart`, `barrel`, `crate`, `jar`, `basket`, `stall` (2x1 food stall with awning),
`signboard` (text), `fence_wood` (w x 1), `fence_bamboo`, `bench`, `laundry`, `boat_small` (2x1 on water),
`boat_ferry` (3x2), `dock_post`, `water_lantern` (水燈頭 floating, anim, light), `sky_lantern` (floating
天燈, anim, light, non-solid, over:true), `statue_lion` (石獅), `wind_lion` (風獅爺), `banner`, `grave`,
`coffin`, `bones`, `firepit` (anim, light), `totem` (carved pole), `loom`, `drum_rack`, `bell_tower`.
Interior — `table`, `chair`, `bed`, `cabinet`, `bookshelf`, `shelf_lanterns` (lantern shop shelves),
`counter`, `stove`, `altar` (神桌 with incense, light), `incense_burner` (anim smoke), `screen` (屏風),
`rug`, `door_frame`, `stairs_up`, `stairs_down`, `chest` (o.open), `switch` (o.on), `brazier` (anim, light),
`pillar` (red lacquer), `soul_jar` (blue soul-lantern in jar, anim, light), `eternal_lamp` (長明燈 pillar,
light), `mural` (wall painting, o.v), `bed_mat`, `tea_set`, `lantern_rack` (drying lanterns), `pot`.

## Music — `js/core/music.js` → `G.Music`
Uses `G.Audio` (js/core/audio.js — read it): `G.Audio.ctx`, `G.Audio.playNote(inst, when, midi,
durSec, vol, reverbSend)`, instruments `zheng, pipa, dizi, erhu, pad, bass, bell, drum, wood, cymbal,
gong`, `G.Audio.noteToMidi('c4')`.
```
G.Music.play(id, { fade = 1.0, loop = true })  // crossfade to song; no-op if already playing id
G.Music.stop(fade = 1.0)
G.Music.current  // id or null
G.Music.ids()
```
Lookahead scheduler (setInterval ~25ms, schedule ~0.15s ahead). Each song: tempo, length in bars,
multiple tracks (melody, counter-melody, bass/drone, percussion), loops seamlessly.
Song ids: `title, dream, jiufen (day town), festival (中元 night, lively), night (eerie calm), mine,
forest, mushroom (psychedelic shimmer), pingxi (sky lanterns, hopeful), temple, city (艋舺 bustle),
mansion (haunted), tainan (stately), palace (長明宮, cold & solemn), stealth, tribe (mountain village,
drums & chant-like), vision (ayahuasca trance, hypnotic, evolving), lake (日月潭 serene), shrine, chaos,
sea (black tide, vast, melancholy), farshore, lighthouse, breath (一息界 — cosmic, kaleidoscopic,
otherworldly), battle, battle2 (later-chapter battle), boss, final_boss, villain (夜玄's theme — tragic),
sad, tension, love (星河 & 白芷 theme), ending (true ending), credits, victory (short fanfare, loop:false
→ then silence), gameover (loop:false)`.
A main leitmotif ("渡魂謠", 白芷's song) should recur in title / love / ending / sad.

## Data — `js/data/*.js` → `G.Data`
```
G.Data.chars[id]   = { name, title, elem, weapon:'sword'|'flute'|'spear'|'talisman', base:{hp,mp,atk,def,mag,spd,luk},
                       growth:{...per-level floats}, learn:[{lv, skill}], ultimate: skillId, sprite, portrait,
                       equip:{weapon,armor,head,feet,acc} (starting item ids) }
G.Data.skills[id]  = { name, desc, mp, type:'phys'|'mag'|'heal'|'buff'|'debuff'|'revive'|'cure'|'special',
                       elem:'metal'|'wood'|'water'|'fire'|'earth'|null, target:'enemy'|'enemies'|'ally'|'allies'|'self'|'deadAlly'|'random',
                       power, hits?, status?:{id, chance, turns}, buffs?:[{stat, amt, turns}], delay?:1.0,
                       fx:'<fx id>', sfx:'<sfx id>', combo?:[charIdA, charIdB] }
G.Data.items[id]   = { name, desc, type:'use'|'weapon'|'armor'|'head'|'feet'|'acc'|'key'|'material', price,
                       use?:{ target, heal?, mp?, revive?, cure?:[status], status?, buffs?, damage?, elem?, field?:bool, battle?:bool },
                       stats?:{atk,def,...}, elem?, who?:[charIds], icon:'potion'|'herb'|'sword'|... }
G.Data.enemies[id] = { name, art (monster id) | sprite (character id, drawn facing right), lv, hp, mp, atk, def,
                       mag, spd, luk, elem, weak?:[elems], resist?:[elems], exp, gold, drops:[{item, rate}],
                       skills:[{id, w (weight), if?:'hp<50'|'ally_hurt'|...}], boss?:bool, scale?:number, desc }
G.Data.troops[id]  = { enemies:[enemyIds], bg:'<backdrop id>', bgm?:'battle'|'boss'|..., boss?:bool, flee?:bool }
```
Status ids: `poison, seal, sleep, stun, trance (幻境), atkUp, atkDown, defUp, defDown, magUp, magDown,
spdUp, spdDown, regen, shield, guard`. Elements 五行: 金 metal, 木 wood, 水 water, 火 fire, 土 earth;
克 cycle: metal>wood>earth>water>fire>metal (attacker element that 克s target element ×1.5; reverse ×0.7).

### Battle formulas (engine implements; data must be balanced against these)
- Physical: `power * atk * 2 * 50/(50+def)` × rand(0.9–1.1) × element × crit(1.5) × guard(0.5)
- Magic: `power * mag * 2 * 50/(50 + (def*0.3 + mag*0.7))` × rand × element
- Heal: `power * mag * 1.2 + power * 10`
- Crit chance: `5% + luk/5 %`; Hit: phys base 95% − (target spd − attacker spd)/4 %, magic always hits.
- Turn order (CTB): after acting, next wait = `100 * delay * 40/(spd+40)`.
- Poison 6% max HP per turn; regen 8%. Buffs ±30%. 劍意 gauge 0–100: +damage taken%, +8 per action;
  at 100 the character may use their ultimate.
- Exp to next level: `round(20 * lv^1.8 + 30)`. Level cap ~45. Final boss tuned for party lv ~38–42.

## Preview / testing workflow for art & audio agents
- Make a standalone preview page `tools/preview_<module>.html` that loads `../js/core/util.js`,
  `../js/core/font.js`, `../js/gfx/registry.js` (and `../js/core/audio.js` for music) plus your file,
  then draws a gallery of everything you made at `G.S = 1` on a 1280x720 (or larger) canvas.
- Screenshot it with the pre-installed Playwright (`require('playwright')`, `chromium.launch()`),
  e.g. a small node script in your scratch dir, and LOOK at the PNG with the Read tool. Iterate until it
  genuinely looks good. Check for console errors.
- Only create/modify the files you own. Never edit util.js, registry.js, index.html or other agents' files.
  Do not git commit (the lead commits).

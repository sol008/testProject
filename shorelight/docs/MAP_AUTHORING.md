# Map & Script Authoring Guide — 《彼岸燈》 Shorelight

How to turn a screenplay (docs/story/*.md) into playable content. Read docs/CONTRACTS.md for art ids.
Engine sources: js/engine/map.js, mapmech.js, script.js, dialog.js, battle.js, minigames.js, worldmap.js.

## Files
- One file per chapter: `js/maps/chN_<name>.js` (e.g. `js/maps/ch1_jiufen.js`). A chapter file defines all
  its maps with `G.Maps.define(id, def)`, its quests (`G.Data.quests.<id> = {...}`), shared helper
  functions, and any chapter-start function (`G.Story.chN = async (S) => {...}`).
- Map ids: ascii snake_case, globally unique, prefixed by place (`jiufen`, `jiufen_shop`, `mine_b1`).
- Classic script, `'use strict';` at top, no globals except via `G`.
- The lead adds your file to index.html (between MAPS-BEGIN/MAPS-END). For local testing you may add it yourself.

## Map definition
```js
G.Maps.define('jiufen', {
  name: '九份',                 // shown in the location banner & save slots (string or (st)=>string)
  subtitle: '雞籠山下的金色山城',  // optional banner subtitle (defaults to the chapter name)
  place: 'jiufen',              // world-map place id (G.World.PLACES) – marks it visited
  bgm: 'jiufen',                // music id (CONTRACTS) or (st)=>id ; null = silence
  start: [10, 20],              // default spawn (debug & tests)
  light: { ambient: 0.65, color: '#0a1030', playerR: 220 },  // night darkness 0..1; or (st)=>cfg
  particles: ['fireflies', 'mist'],   // fireflies motes embers leaves petals rain snow wind dust sparkles lanterns mist ash
  psychedelic: 0,               // 0..1 constant 靈視-style overlay (vision realms), or (st)=>number
  noSave: false,                // true disables saving from the menu (e.g. mid-dungeon set pieces)
  legend: { 'A': 'grass' },     // optional overrides of the default terrain legend
  tiles: [ '.....####.....', ... ],   // one string per row; every row the same length
  deco: [ '  t   b       ', ... ],    // optional object layer (single chars → object types, see DECO legend)
  decoLegend: { 'Q': 'mushroom_glow' },
  objects: [ { t: 'house_jiufen', x: 4, y: 3, w: 4, h: 3, door: 1 }, ... ],
  chests: [ { id: 'c1', x: 5, y: 6, item: 'herb_salve', n: 2 }, { id: 'c2', x: 9, y: 9, gold: 120, if: st => ... } ],
  npcs: [ ... ], enemies: [ ... ], events: [ ... ], warps: [ ... ],
  guards: [...], hides: [...], checkpoint: [x,y,dir], winds: [...],   // see mapmech.js header
  lights: [ { x: 5, y: 3, r: 180, color: '#ffb060', flicker: 0.3 } ],  // extra light sources (tile coords)
  pass: [ { x: 3, y: 4, w: 1, h: 1, solid: false } ],                  // force passability overrides
  onEnter: async (S) => {},     // runs every time the map is entered (after the fade); keep it light
  autosave: true,               // autosave on entering (default true)
});
```
### Default terrain legend (`G.Maps.LEGEND` in map.js)
```
.grass ,grass_dark "flowers_ground :dirt =path #stone Hstairs %brick ssand ~water wdeepwater -shallow
llake rriver mmarsh _wood ttile_floor cred_carpet Ttemple_floor nmat vcave +rail ffarmland kdock
bbridge_h Bbridge_v *spirit_floor Llily_field gmoss_glow Vvision Zbreath ocloud jlantern_bridge Sslate
Xcliff Ccave_wall Pwall_plaster Rwall_brick Wwall_wood Ewall_temple hhedge (space)void Kblack_sea
qsnow_rock Mmarble Ybasalt_floor ycoral pfield_rice ddeck Qwall_slate Uwall_basalt
```
Walls (X C P R W E h Q U, void, K) are solid. Author walls **2 cells thick** for interiors (top row =
ceiling, second row = wall face). Water types are solid unless crossed by a bridge/dock.

### Default deco legend (`G.Maps.DECO`)
```
t pine  b banyan(3x3)  c camphor  a sakura  p betel  n banana  f tree_fern  P pandanus  B bamboo
u bush  w flowers  g tallgrass  r rock_small  R rock_big(2x2)  e reeds  o lotus  m mushroom_glow
M mushroom_giant(2x2)  y crystal  l lily  s stump  x silvergrass  d tree_dead  k maple  C cypress(2x2)
v vine_curtain  j jar  J barrel  X crate  L stone_lantern  F fence_wood  G grave  W water_lantern
S sky_lantern  h coconut_palm  i tree_cedar_snow  z basalt  q rock_marble
```
Multi-tile objects anchor at their top-left cell. Check footprints in the art files (G.Objects.defs[type].w/h).

### Objects
`{ t: type, x, y, ...params }` — params per type (door, w, h, v, text, open...). Extra engine params:
`if: st=>bool` (exists only when true), `spirit: true` (only visible/solid with 靈視), `illusion: true`
(only WITHOUT 靈視 — e.g. 魔神仔 fake walls), `solid: false` (override), `push: true` (pushable),
`interact: '...' | ['line', ...] | async (S, o) => {}` + `label: '調查'` (makes it inspectable),
`light: { r, color, flicker }`, `alpha`, `over: true` (draw above actors).

### NPCs
```js
{ id: 'agan', sprite: 'shopkeeper_f', portrait: 'agan', name: '阿柑姨', x: 12, y: 8, dir: 'down',
  wander: 2,                 // tiles from home it may wander (0 = stand still)
  if: st => !st.flags.ch1_festival_night,     // presence condition (re-evaluated after every script)
  pos: st => st.flags.x ? [3,4] : [12,8],     // optional dynamic position
  fixedDir: false, ghost: false, spirit: false,   // spirit: only visible with 靈視
  light: { r: 120, color: '#ffb060' },          // carried light
  talk: ['line spoken by this NPC', ['xinghe:smile', '星河 replies'], ...]   // simple
  talk: async (S, npc) => { ... }               // full script
}
```
Simple `talk` arrays: plain strings are spoken by the NPC (portrait id if `portrait` set, else `name`).

### Roaming enemies (visible on the map; touch = battle; pressing Z when adjacent = pre-emptive strike)
```js
{ id: 'm1', troop: 'mine_1', x: 10, y: 12, art: 'mine_bat' /* or sprite: 'temple_guard' */,
  radius: 3, chase: 4, speed: 2.4, respawn: true /* false = gone for good after defeat */,
  variant: 0, lv: 3, if: st => ..., onWin: async (S) => {} }
```
Party ~10+ levels above `lv` → enemy ignores the player.

### Events
```js
{ id: 'intro', trigger: 'auto', once: true, if: st => !st.flags.ch1_intro, run: async (S) => {...} }
{ id: 'cliff', trigger: 'touch', x: 4, y: 9, w: 3, h: 1, once: true, run: async (S) => {...} }
{ id: 'shrine', trigger: 'action', x: 6, y: 2, label: '參拜', run: async (S) => {...} }
```
- `auto` runs as soon as the map is idle and `if` is true. Always guard with a flag (or `once`) to avoid loops.
- `touch` fires when the player steps on any cell in the rect. `action` fires when facing the rect + Z.
- `once: true` auto-sets an internal flag. `spirit: true` → only with 靈視.

### Warps
```js
{ x: 0, y: 10, h: 3, to: 'mine_b1', tx: 18, ty: 5, tdir: 'left', door: false, if: st => ..., run: async (S) => { /* return false to cancel */ } }
```
The destination cell must be walkable and should NOT itself be a warp cell (or the player bounces).
Put arrival points one step inside the map. Doors: put the warp on the door cell (non-solid bottom-row
cell of the building, `door` param) and set `door: true` for the sound.

## Script API (`S`, see js/engine/script.js)
Dialogue: `await S.say('xinghe:smile', '台詞')` — speaker `id:expr` (portrait ids in CONTRACTS; G.Names has
display names) or a plain name string `'阿伯'` (no portrait) or `''` (narration in the box).
Inline colour markup: `{y}金色{/}` `{r}` `{b}` `{g}` `{p}` `{o}` `{w}` `{d}`. Keep lines ≤ ~60 characters.
`await S.lines([...], npc)`; `const i = await S.choice(['A', 'B'], { cancel: 1 })`;
`await S.narrate(['line1', 'line2'], { veil: 0.9 })` full-screen narration.
Screen: `S.fadeOut(sec)`, `S.fadeIn(sec)`, `S.flash(color)`, `S.shake(mag, sec)`, `S.wait(sec)`,
`S.sfx('bell')`, `S.bgm('sad')`, `S.bgm(null)`, `S.titleCard('第一章　九份燈火', '雞籠・中元')`,
`S.particles(['rain'])`, `S.light({ ambient: 0.8 })`, `S.toast('text', 'icon')`.
Actors: ids are `'player'` (leader), party member ids (followers), NPC ids, enemy ids.
`await S.move('baizhi', 'UULLD')` (U/D/L/R steps; `{ wait: false }` to not await; `{ speed: 2 }`),
`await S.walkTo(id, x, y)`, `S.face(id, 'left' | otherActorId)`, `S.setPos(id, x, y, dir)`,
`S.emote(id, '!'|'?'|'…'|'♪'|'💢'|'♥'|'💧'|'✦')`, `S.show(id, false)`, `await S.jump(id)`,
`await S.fadeActor(id, 0)`, `S.spawn({ id, sprite, x, y, dir, portrait, ghost })`, `S.remove(id)`,
`S.gather()` (followers back behind leader), `S.hideFollowers(true)`, `await S.camera(x, y)`, `S.cameraFollow()`.
State: `S.flag('k')`, `S.has('k')`, `await S.give('item_id', n)`, `S.take(id, n)`, `S.hasItem(id)`,
`S.gold(n)`, `S.join('hongying', 5)`, `S.leave('baizhi')`, `S.learn('xinghe', 'skill_id')`, `S.healParty()`,
`await S.lantern('lantern_id', '心燈名稱')` (心燈 +1 with animation — ids unique & stable),
`S.quest('q_id', stage)` / `S.quest('q_id', 'done')`, `S.objective('前往八斗子海岸')`, `S.chapter(1)`, `S.vision(60)`.
Flow: `await S.warp(map, x, y, dir)`, `const r = await S.battle('troop', { loseOk: true, mode: 'normal'|'advantage'|'ambush', bgmAfter })`
→ 'win' | 'lose' | 'flee' (with loseOk a defeat continues the story instead of Game Over),
`await S.shop(['item', ...], { title: '雜貨店' })`, `await S.inn(80)`, `await S.saveMenu()`,
`await S.travel('jiufen', 'pingxi', { label: '沿著基隆河谷……' })` (world-map travel animation),
`await S.ending('true'|'normal')`.
Minigames (js/engine/minigames.js): `await G.Mini.timing({...})`, `await G.Mini.mash({...})`,
`await G.Mini.song({...})`, `await G.Mini.jiaobei({ throws: 3, results: ['sheng','sheng','sheng'] })`.

## Conventions
- Flags: `chN_<what>` snake_case (e.g. `ch1_met_baizhi`). Side quests: `q_<name>`. Never reuse a flag for two meanings.
- Quests: register in the chapter file: `G.Data.quests.q_atu_watch = { name: '阿土伯的懷錶', desc: '...', stages: ['...','...'], lantern: true }`; main-story quests `main: true`.
- 心燈 ids: `lantern_<name>`; the lantern call is the LAST beat of a side quest's resolution.
- Every chapter ends by setting up the next: `S.chapter(n)`, a `S.titleCard`, and placing the party on the next chapter's first map (or a travel scene).
- Items, skills, troops: only use ids that exist in js/data/*.js (grep them). If something is missing, add it to
  your chapter file under `G.Data.items.<id> = {...}` / `G.Data.troops.<id> = {...}` rather than editing data files.
- Keep cutscenes skippable-feeling: no `S.wait` longer than ~1.5s without text.
- Make each town feel alive: NPC wander, ambient particles, lighting at night, different dialogue after key flags.
- Shops: sensible stock for that region & chapter level; inn price scales by chapter.

## Testing your map (mandatory)
- Load directly: `index.html?debug&map=<id>&x=<x>&y=<y>&lv=<lv>&party=xinghe,baizhi&flags=a,b&chapter=N`
- Debug menu in game: F2 (when ?debug). Battle test: `?debug&map=<id>&battle=<troop>`.
- Run the validator: `node tools/test/validate.js` (when available) and fix every error for your maps.
- Use Playwright (require('playwright')) to load each of your maps, walk the critical path, trigger the main
  events (auto-advance dialogue by pressing Z while `G.Dialog.isOpen()`), and check there are no console errors
  and `G.lastError` stays null. Screenshot key scenes and look at them.

## Extra hooks (added later)
- Map `onUpdate: (dt, mapScene, busy) => {}` runs every frame (custom mechanics: noise meters, timed windows,
  lit/dark zones — read `mapScene.player.x/y`, start scripts with `G.Script.run`). Pair with `drawOver(ctx, t, mapScene)`
  (world space, above actors) and `drawGround(ctx, t, mapScene)` (world space, below actors) for visuals, and
  `drawScreen(ctx, t, mapScene)` (screen coordinates, under the HUD) for full-screen overlays and meters. Inside
  drawGround/drawOver use `mapScene.screenSpace(ctx, (c) => …)` for screen-space bits. How these behave with the 3D
  view on (ground decal vs. screen overlay): docs/CONTRACTS_3D.md "2D map hooks in 3D".
- Map `winds`: during a gust the player is pushed one tile downwind between steps, even while holding a direction;
  stepping straight into the wind is blocked, sideways steps are slowed (details in js/engine/mapmech.js).
- `S.battle(troop, { guests: ['yungui'], turnLimit: 6, turnLimitResult: 'win', loseOk: true, mode: 'ambush' })`:
  `guests` fight this battle only (created at the party's average level if they have never joined);
  `turnLimit` ends the battle after N rounds with `turnLimitResult`.
- Enemy data `endAt: 0.5` ends a story battle as a win at 50% HP (no death animation).
- Final-battle hooks: `S.battle(troop, { onTurn: async (b, unit) => {}, hpFloor: { enemyId: 0.2 }, finishers: ['skill_id'],
  onFloor: async (b, enemyUnit) => {}, loseOk: true })`. Inside hooks: `b.addPartyMember('baizhi', lv)`, `b.removePartyMember(id)`,
  `await b.say2('baizhi:sad', '台詞')` (dialogue mid-battle), `b.say('battle message')`, `b.result = 'win'` to end the battle,
  `b.rounds` (round counter), `b.enemies` / `b.party` units (hp, mhp, st, phase). Skills may set `invert: true` (turn the
  target's buffs into debuffs). Players can lower psychedelic visuals in Settings (G.settings.visualFx) — keep strobing gentle.

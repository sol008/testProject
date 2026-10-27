# Characters team report — G.Char3D (js/r3d/chars.js, js/r3d/chars_cast.js)

## What was built
**Parametric generator (chars.js).** Every human id in `G.Sprites.ids()` (71 ids, including the map-defined `c4_*` / `c10_*`)
builds a skinned 3D character from its sprite spec. No build failures. `kind: 'quad' | 'bird'` ids delegate to `G.Animal3D` at call time.
- **Rig.** About 38 core and prop-socket bones, plus spring-chain bones added by parts. The bind pose is a relaxed A-pose with world-aligned bone frames.
- **Proportions per body type.** adult/tall about 7.4 heads, female, stout, elder/elderf (stoop), child about 5.5 heads. Overridable per look (`body3d`).
- **Garments.**
  - Upper garments: torso shells, with 大襟 / 對襟 / 交領 / open / round closures painted with piping, 盤扣 knots and lapel bands. Also vests (馬褂, woven), armour (lamellar plate + pauldrons), stand collars and inner layers.
  - Sleeves: long, wide, flowing (with spring drape), rolled, short.
  - Lower garments: robe and jacket hems and skirts on spring chains with leg colliders and partial leg weighting. Wide / straight / cropped / short trousers, bloused over leg wraps when present.
  - Waist and over-garments: sashes with knot, spring tails and a taiji emblem; belts with buckle; aprons as flat panels over the jacket hem; capes, including feathered and ragged ones.
  - Accessories and footwear: towel, beads, bag with strap, bracers (with tape ties), bracelet. Cloth shoes with 千層底, sandals, boots, bare feet.
- **Painted atlas.** One per character: fabric weave, folds, AO, embroidery and woven motif bands, kasaya, badges (勇/明), mends, stains, straw and feathers.
- **Hair.** Cap shell with a hairline per style. Bangs for messy / side / center (with an off-centre part) / straight / part / back / wild / tuft styles. Spring-chained long hair, low tie, ponytail, queue (薙髮 shaved crown), face-framing locks (with a one-sided tucked option), buns, top knot, twin, half-up, ribbons and pins.
- **Hats.** 斗笠 (with emissive sigil and chin cord), 涼帽/紅纓, 瓜皮帽, 頭巾, headbands, wreath, tsou cap with feathers, crown, 道冠/儒巾, helmets, opera and procession headdresses, amis headdress, tea-picker hat with curtain.
- **Beards, glasses, masks.** Beards and moustaches, glasses, ghost mask and face cloth. Halo for deities.
- **Props.** All held items and weapons are rigidly skinned to sockets. Field `held` and battle `weapon` sit on separate sockets toggled by bone scale. Hanging lanterns, baskets, whisks and tassels are on springs. Back and hip items included. Lanterns feed `inst.lights()`.

**Faces.** The head mesh uses smooth face-plate normals, so no toon terminator crosses the features. Each instance has a canvas face (256 px for NPCs, 512 px for heroes) with:
- Eyes: iris, pupil, highlights, lid shadow, lash flick, double lid.
- Brows, nose, mouth, blush, wrinkles, tattoos (紋面), opera and ritual face paint, beauty marks.
- Expressions: neutral, smile, laugh, sad, angry, surprised, shy, pain, closed, determined, plus dreamy, smug, grumpy and cold.
- Behaviour: natural blinks (fast close, slower open, occasional doubles), saccades, eyes lead the look-at, and `inst.talk(on)` lip-flap.
- The face is redrawn only when its quantised state changes.

**Animation.**
- **Baking.** All clips are authored as eased key poses (monotone cubic, no overshoot) or as a procedural gait. They are baked per body type into `THREE.AnimationClip`s, with analytic two-bone IK for planted feet and for hand grips (weapon position and direction targets, two-handed shaft grips), and played by an `AnimationMixer` with cross-fades and layered one-shots.
- **Locomotion.** walk / jog / run form a phase-synchronised blend space, with cadence = speed / stride. Gaits include heel-to-ball foot roll and hip height limited by leg reach. A runtime foot-lock pins the stance foot in world space. Measured world slip of the stance foot is a median of 0 m/s at every speed, blend zones included.
- **Runtime layer.**
  - Turn and acceleration lean, breathing idle with weight shifts, random fidgets.
  - Additive look-at across chest, neck and head.
  - VRM-style spring bones: relative inertia plus air drag, sphere and capsule colliders, sub-stepped, LOD at distance.
  - Ghost float plus a translucent fresnel look with a depth prepass.
- **Clips.**
  - Battle (weapon families blade / pole / fan / flute / unarmed): idle (stance), ready, attack, attack2, cast, skill, hurt, guard, ko (holds), revive, victory (→ loop), item, run, dodge. Each has anticipation, action, follow-through and recovery. `clipInfo(name).hit` and `play(name, {onHit})` expose the hit frame.
  - Field: talk, nod, shake, bow (拱手), sit, kneel and sleep (intro → held loop), point, wave, cry, laugh, think, surprise, pray, fall.
  - Emote reactions for ! ? … ♪ 💢 ♥ 💧 ✦.

**Main cast (chars_cast.js).** Each cast member is a data *look* (spec + face3d + body3d + style + props3d + parts). Swap a costume with `G.Char3D.defineLook(id, name, look)` and `setLook(id, name)`. Looks can be per context (`contextLooks`) and can extend each other (`extend`).
- 白芷: follows REFERENCES.md exactly. Jet-black blue-sheen long hair with an off-centre part, one side tucked behind the ear; almond, upturned dark-brown eyes; beauty mark on her right cheek; drop earrings, red string and jade tag; dreamy default expression. The costume is the 2D lamp-spirit dress until the v2 pick arrives.
- 陳伯: FINAL sheet. In the field he wears the day look (queue, shaved crown, apron with stains and pocket, sleeve guards, mend patch, pipe and 「渡」 tally). In battle he automatically switches to the 引魂人 gear: sigil 斗笠, three-tier straw 簑衣, soul-oar with glowing inlay, and the soul lantern hung from the grip.
- 夜玄: FINAL sheet. Black robe with gold hem band and back sigil, 雲肩, 30-strip 千條簑, 長明冠 with blue flame and gauze ribbons, silver temples, knot tail, gold sorrowful eyes, celadon jar with the 「同」 tally, gold-cage lantern staff.
- 墨鴉: FINAL sheet. Three-tier crow-feather mantle, feather ruff, 「明」 badge, cap with feathers, queue with feathers, talisman bundle, crow-head crook with the 長明 lantern, smug face.
- 星河, 紅纓 (v2 opt01), 雲歸, 青鋒 (+ mask), 清虛, 藤婆, 夜念, 燈母: canon data looks.

**Budgets and performance.** NPCs are about 7.5–12.5k triangles; heroes are 8.5–14.5k (budget 25k). Each character is 3 draw calls: body, head and one merged outline (+1 depth prepass while translucent).

Measured in game (jiufen, 20 characters): about 1.5 ms per frame of CPU in total for all character updates (springs, IK, faces included). NPC templates build in about 0.1 s the first time an id appears; instances take about 2 ms. Two NPCs slightly exceed the 12k NPC budget: qianliyan/shunfenger (giant procession figures, 15k) and pirate_ghost (13.4k).

**Testing tools** (tools/r3d/chars/):
- `view.html` + `shot.js`: bench with strips, `move=1` real root motion, `anims=` / `exprs=` sheets, and `cam=face|heads|close|game`.
- `probe.js`: evaluate JS in the bench.
- `game.js`: in-game smoke test.

## Known gaps
- ~~The party's final costumes are pending.~~ Applied; see "v2 cast applied" below.
- Sheets for 青鋒, 清虛, 藤婆, 夜念 and 燈母 have not landed yet; these are upgraded 2D specs.
- Faces are a single canvas front projection: there is no SDF face shadow and no blendshape mouth. Lip flap is texture-based.
- Hands are mitten or fist shapes with no finger bones.
- There is no turn-in-place stepping when an idle character rotates (feet rotate with the root).
- Field hold poses for some props are FK approximations (fan, book, pipe), and battle clips were tuned for blade and pole first. Fan and flute attacks are simpler.
- Phase-2 / 逆潮 animation of 夜玄's strips (lifting tide-tendrils) is not authored; the strips are already on chains.

## Hooks / requests for the lead
1. **Walk speed.** The engine "walk" is 4.2 tiles/s, which is a jog for a 1.7 m human. I mapped walk 2.2 / jog 4.2 / run 6.9 so NPCs (1.8–2.4) walk and the player jogs. If you want the player to *walk*, use ≈2.2–2.6.
2. **Weapon toggle.** `inst.setWeaponDrawn(bool)` toggles field-held vs battle-weapon sockets. The battle context does this automatically. Cutscenes may want it.
3. **Teleports.** `inst.shift(dx, dy, dz)` moves a character while keeping spring state. Teleports larger than 1.5 m reset springs automatically.
4. **Hit timing.** `inst.clipInfo(name)` returns `{ dur, hit, loop }`, and `play(name, { onHit, onDone })` calls back at the hit frame — for Battle3D VFX timing.
5. **Map3D.** `G.R3.dispose(scene)` after `rec.ch.dispose()` is safe, because `dispose()` detaches the root first. Shared geometry and textures are flagged `shared`.
6. **Missing files.** `js/core/fontdata.js` and `js/i18n/en_ch*.js` are missing on this branch (console 404s, not character code).

## v2 cast applied
The client's party picks (docs/design/PICKS.md) are now the active looks in chars_cast.js. The old canon/reference
party looks were replaced. Each party look carries a `sheet` clip that reproduces its design card's pose
(bench: `anim=sheet`, battle context so the weapon shows).

| Character | Look | Sheet | Tris | Bones / chains | Contact sheet |
|---|---|---|---|---|---|
| 沈星河 | `v2_07` 螢火劍客 | v2/xinghe/opt07.png | 11.3k | 70 / 14 | [cast/xinghe_v2.png](cast/xinghe_v2.png) |
| 白芷 | `v2_02` 藍衫笛歌 | v2/baizhi/opt02.png | 13.5k | 107 / 24 | [cast/baizhi_v2.png](cast/baizhi_v2.png) |
| 洛紅纓 | `v2_01` 洛家槍・承 | v2/hongying/opt01.png | 11.2k | 73 / 15 | [cast/hongying_v2.png](cast/hongying_v2.png) |
| 雲歸 | `v2_01` 太虛青灰 | v2/yungui/opt01.png | 13.2k | 109 / 21 | [cast/yungui_v2.png](cast/yungui_v2.png) |

All four stay at 3 draw calls (body, head, merged outline) and well under the 25k hero budget. In-game smoke test
(jiufen, `?debug&r3lite`): all four build as 3D with no console errors.

**Per character**
- **星河.** Crown-high ponytail on a red cord that arcs up and trails; centre-parted fringe with long sideburns. Narrow
  face, long upturned amber eyes, sword brows. Charcoal 大襟 knee tunic with ember piping, side slits and ember
  flame-tongue hem embroidery. Ember scarf: one end down the chest, one long trailing tail. Wide belt with a round
  brass boss, bracer on the sword hand, red string on the 劍指 hand, tall brown riding boots. 螢火 has an ember edge
  glow, with the lacquer scabbard at the left hip.
- **白芷.** The REFERENCES.md identity is unchanged, apart from one correction: the old reference look had the
  face-framing curtain and the tucked ear mirrored. Now the curtain falls on the viewer's left, the drop earring hangs
  from the tucked ear on the viewer's right, and the beauty mark is on her right cheek. Costume:
  - Half-up loop with a jade comb and red string.
  - Indigo 藍衫 to mid-calf with light-blue 大襟 piping and side slits.
  - Banner sleeves with turned-back light-blue and cream cuffs.
  - 圍身裙 bib apron on a silver neck chain, with gold stitching and embroidered flowers.
  - Black trousers.
  - Jade flute with the red-string jade tag swinging from its foot.
- **紅纓.** Crown-high ponytail with a big red silk bow and a red ribbon down the tail. Crimson 箭袖袍 above the knee
  with 團紋 roundels, a white stand collar and a black hem band; side slits edged black with brass toggles. Black
  巴圖魯坎肩 with the 一字襟 brass/red button row, ending at the belt. Round-boss belt, laced bracers, moon-white
  trousers, black boots with a crimson top band, sachet and cat charm at the hip, red-tassel spear (on the back in the
  field).
- **雲歸.** Long hair half-up under a wooden crown with a cinnabar pin, long front locks; lazy half-lidded eyes. Blue-grey
  交領 道袍 to the ankle with a deep-indigo collar band under a wide white 護領 guard collar. Flowing sleeves with indigo
  and white cuff bands. Black belt with the 太極 plaque and hanging tails. Talisman pouch at the right hip, amber gourd
  on a red cord at the left. Large wooden folding fan, which rests on his shoulder in the `sheet` pose.

**Generator additions (chars.js).** All are data-driven spec options, so other looks and NPCs can use them:
- **Upper garment (`top`).**
  - `slits` makes a three-panel hem (front, plus back halves) on separate chains, so the legs open the slits.
  - `toggles`, `hemBand`, `collarColor`, `cuff2` (turned-back second cuff band) and `cuffW`.
  - `lapel: { w, guard, guardLen }` for a wide lapel band with a 護領 guard collar.
  - `sleeve: 'banner'` with `hang` and `sleeveR`: a deep back panel weighted to the drape spring.
- **`scarf`.** Implements the new sprite piece (wrap, knot, chest end, trailing tail) with options `tail`, `front`,
  `w`, `sweep` and `trim`.
- **`apron`.** `bib`, `chain` (silver neck chain and clasp), `stitch`, `emb`/`embN` (embroidered flowers), `trim`,
  `band`.
- **`vest`.** `closure: 'yizi'` (一字襟 button row and buttoned side seams), with `button`/`button2`, `buttons` and
  `rowAt`.
- **Belts, shoes, wristwear.** `belt.w`, `belt.round` (round boss) and `belt.dy`; boots `shoes.from`, `shoes.flare` and
  `shoes.band`; `bracers.side`; `bracelet.side`.
- **Hair.** Ponytail `tiePh`, `arch`, `sweep` and `stiff` (high, fountaining ponytails); `bow`; `ribbonLen`. Ribbons
  from a crown tie now route back over the skull. Half-up `knotPh`, `knotR` and `loop`. Pin `type: 'comb'` with an
  optional `string`.
- **Props.**
  - flute `len`/`foot`/`tag` (red-string jade tag on a spring);
  - fan `len`/`w`/`rib`;
  - hip items `talisman` and `charm`, and `props3d.hip_gourd: { mat, cord }`;
  - swatches `gourd`, `talisman`, `sachet`, `catcharm`.

**Fixes found along the way (they affect existing characters).**
1. `ribbon()` treated its `side` argument as the face normal, so every ribbon was edge-on to the direction its caller
   intended. This covered sash tails, hair ribbons, 夜玄's gauze ribbons, scholar-cap flaps and headband tails. `side`
   is now the width direction, as all callers assumed. Sash tails read face-on from the front again.
2. Two-handed grips (`hL`/`hR` given as a distance along the other hand's weapon) placed the fist up to about 10 cm off
   the shaft, because the grip offset assumed a roll that the final hand rotation did not have. The solve now runs two
   extra passes with the final rotation. This tightens every pole and flute two-hand grip.
3. Emblem sashes start their tails below the plaque, so the 太極 plaque is not half-covered.

**Bench.** `tools/r3d/chars/view.html` takes `wind=x,y,z`, which feeds the instance's spring wind. Scarves and
ponytails only trail when moving or in wind. The 星河 and 紅纓 sheet-pose shots use a light bench wind (the field
jogs in the contact sheets show the same trailing from motion alone).

**Notes and requests**
- 2D vs sheet: the 2D sprite spec gives 紅纓 dark trousers (`#2a1d20`), but the sheet and the spec text say moon-white
  (`#e9e0d0`). The 3D look follows the sheet; the 2D owner may want to match it. The 2D 雲歸 carries a fan at the
  hip. The 3D look follows the card instead (talisman pouch and gourd at the hips; the fan only in hand), so that
  there are never two fans.
- Raised wide, flowing or banner sleeves do not slide down the forearm (there is no cloth simulation); the drape
  spring lets them hang instead.
- The pets 芋圓 / 麻糬 are the animals team's and were not touched.

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
- The party's final costumes (v2 picks for 星河 / 白芷 / 紅纓 / 雲歸) are pending. They need only a new look in chars_cast.js.
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

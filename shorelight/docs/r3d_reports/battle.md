# Battle 3D & VFX team report — `G.Battle3D` (js/r3d/battleview.js) · `G.VFX3D` (js/r3d/vfx.js)

Battles now play in real-time 3D whenever `G.R3.enabled()` is true. The 2D `BattleScene` (js/engine/battle.js) is
still the single source of truth: turn order, damage, statuses, AI, boss phases and every chapter script are unchanged.
The 3D view reads the scene every frame and presents it. With 3D off, the original 2D battle runs untouched.

Screenshots are in `docs/r3d_reports/battle/`. They are half resolution (`?r3lite`, no post chain) unless the name ends in `_full`.

<!-- RESULTS -->

## Architecture

| piece | where | what |
|---|---|---|
| `G.Battle3D` | battleview.js | the view: scene, camera, units, markers, overlay, transitions, hooks |
| `G.Battle3D.Arena` | battleview.js (second half) | arena builder: theme table for all 41 backdrop ids, sky, terrain, water, ridges, lights, set-dressing kits |
| Director | battleview.js | camera shot library and the shot-selection logic |
| `G.VFX3D` | vfx.js | GPU particles, shader meshes, props and the fx-id → effect mapping |
| hooks | battle.js | small `if (this.view3d)` branches (listed below) |

### Hooks added to `battle.js` (all backwards compatible; each is a no-op when `view3d` is null)
- **Constructor:** creates `this.view3d = new G.Battle3D(this)` inside try/catch (falls back to 2D on failure). `exit()` disposes it.
- **`run()`:** the first wait is `view3d.introWait()`, so the establishing or boss shot can play (it scales with battle speed and is shorter in auto-battle).
- **`draw()` → `draw3d()`:** renders the 3D frame, then the 2D UI on top: `drawOverlay` (enemy HP bars, status chips, target cursor, damage numbers), `drawHud`, the 3D cut-in, messages, victory, the ink transition. The message box drawing was factored into `drawMsg()`, shared by both paths.
- **`drawUnit()`:** honours `this._bbPass` (skips the shadow, active ring, HP bar and status chips). This is used when the view paints a unit's billboard texture *with the scene's own drawUnit*, so chapter overrides of `drawUnit` (ch7 ghost / silhouette enemies, the child 雲歸) still apply in 3D.
- **`performSkill()`:** calls `onAction(u, s, targets, melee)` and `onActionEnd(u)`; the cast glow is replaced by `onCast`.
- **`playFx()`:** with `view3d`, returns `this.wait(view3d.playFx(...))`. The VFX library returns the impact time, so damage lands exactly on the visual impact. The 2D `switch` is kept intact (the validator parses it).
- **`damage()`:** calls `onDamage` (hit-stop, shake, knockback, hit sparks). Pops now carry `u` (also in `healUnit` / `popText`), so numbers anchor to the 3D unit.
- **`kill()`:** calls `onKill` (soul dispersal; last-enemy finisher slow-mo). The 2D burst is skipped in 3D.
- **`cutIn()`:** calls `onCutin` (orbiting close-up under the cut-in). The cat-summon intro goes to `onSummonIntro`.
- **`finish()`:** `beforeFinish(result)` runs the finisher slow-mo and the victory or defeat camera. `outro()` (the ink wash) replaces the 0.45 s fade to black.

Chapter maps that monkey-patch the scene (`sc.drawHud`, `sc.draw`, `sc.damage`, `sc.kill`, `sc.update`, `sc.drawUnit` …) keep working, because every hook sits inside the original methods those patches wrap. Chapter scripts that push 2D fx objects into `sc.fx` (ch0, ch1, ch4, ch6, ch11) are drawn in 3D through a least-squares affine fitted each frame from the units' 2D feet/head positions to their projected 3D positions, so they appear on the right unit. Pops pushed without `u` use the same mapping.

## Units
- **Party / human enemies:** `G.Char3D.create(sprite, {context:'battle'})`. Pose → clip mapping: idle (battle stance), ready, attack/attack2 (alternating), cast, hurt, guard, ko, revive (on resurrection), victory (looping), item. Locomotion runs during the melee run-up and on flee. Melee impact frames use `clipInfo(name).hit`. The hit flash uses the Char3D `uGlow` uniform.
- **Monsters:** `G.Mon3D.create(art, {context:'battle', variant, phase})`, rescaled to the 2D battle proportions (2D `h × scale / 88` m, the same factor as the 150 px party sprite ≈ 1.7 m; Mon3D's own map scale is `h / 64`). Hurt/die clips, `inst.flash`, `setPhase(n)` on boss phase changes, and its own contact shadow.
- **Fallback billboard (`BBUnit`)** for ids without a 3D model. The texture is painted by the scene's own `drawUnit` at ~30 fps (12 fps in r3lite), so the 2D monster animation states (attack / hurt / cast / phase art) come for free. It is a cylindrical billboard that mirrors itself when the unit faces the other way on screen. Its shader handles the arena light tint, additive hit glow, and a glowing-edge noise dissolve for dying enemies; it casts alpha-tested shadows.
- **Layout:** the 2D formation maps onto the ground plane (`x → (x−640)/80`, `y → (y−470)/52`): party at +x / front, enemies at −x / back. Melee run-ups follow the 2D tween's progress but stop at the target's real 3D radius (big bosses are not walked into). Presentation-only knockback, lunges for billboards, hurt shake, facing toward the opposing group or the current target.

## Camera director
Shots are functions of time `→ {pos, look, fov, roll}`. A new shot blends from the current pose (smoothstep) or cuts. Blend times divide by battle speed, and by a further 1.5–1.6 in auto-battle (snappier). On top of every shot sit trauma-based shake (smooth noise), an FOV kick on crits and finishers, hit-stop (presentation time ×0.02 for 35–120 ms) and slow-motion.

| situation | shot |
|---|---|
| battle start | establishing sweep from behind the enemies round to the party side (1.9 s) |
| boss battle start | low worm's-eye push-in on the boss, then pull out to the battle view (2.4 s) |
| idle | neutral wide 3/4 from the front-right, slow drift |
| player command | over-the-shoulder behind the active member, framed to the tallest enemy |
| target selection | over-the-shoulder onto the selected target (or the whole group); allies framed from the front-left |
| enemy turn | from behind the party's flank, 3/4 onto the acting enemy |
| melee | side-on tracking dolly that follows the run-up into the strike; always on the open front side of the line of action (never crosses it); distance scales with the tallest unit |
| spell | low 3/4 on the caster during the cast circle, then a cut to the targets timed to the impact |
| 劍意 / 合擊 | orbiting close-up under the cut-in (letterbox, element-coloured ink band, portraits), then a wide impact |
| last enemy falls | close low angle + slow-mo 0.3× and FOV kick, held ~0.75 s before results |
| victory | slow orbit in front of the party, low under the results panel; characters turn to the lens |
| defeat | slow rising top-down |

## VFX library (`G.VFX3D`)
- **GPU particles.** One `InstancedBufferGeometry` quad per particle in a ring buffer: 9000 additive + 3500 alpha (3500 / 1500 in r3lite). The vertex shader evaluates motion (velocity, exponential drag, gravity/wind), size and colour over life, spin, and velocity-stretched sparks. The CPU writes a particle only once, at birth, and uploads only the dirty ranges. A 16-cell painted atlas: glow, dot, spark, shard, smoke, leaf, petal, star flare, ring, droplet, ember, rune 敕, note, flame, crystal, bubble.
- **Shader meshes.**
  - Sweeping slash crescents (bright head, fading tail, white-hot core).
  - Shockwave rings, flat or camera-facing.
  - Explosion / void / water orbs: simplex-noise displaced, heat ramp, noise dissolve.
  - Energy columns for pillars, beams, geysers and tornadoes: scrolling noise streaks, twist, taper, wave. Wide pillars are automatically kept airy.
  - Lightning: midpoint-displaced, camera-facing ribbons with branches and a glow ribbon, rebuilt every 50 ms.
  - Ground decals: scorch, radial cracks, and painted magic circles per element (五行 glyphs, trigrams, pentagram, centre glyph).
- **Props.** Rock spikes erupting from the ground, falling spirit swords (extruded blade, gold guard; spark and crack on landing), talismans that fly and stick, paper/soul lanterns, growing vines (tube draw-range), and the summoned cat (`G.Char3D/Animal3D` if available, else a sprite billboard).
- **Lights & screen.** Four pooled point lights (fixed count: no shader recompiles) for explosions, lightning and heals. Camera shake, screen flash (post exposure/tint, or a 2D flash in r3lite), sky dimming for big spells, the trance warp (post warp + hue) for 幻境.
- **Persistent status visuals:**
  - poison: bubbles
  - sleep: rising bubbles
  - trance: rainbow motes
  - regen: leaves
  - stat ups / downs: rising / falling sparks
  - stun: orbiting stars
  - seal: orbiting 敕 runes
  - shield: hex-shimmer fresnel bubble
  - guard: hex plate
- **Timing.** `play()` returns the impact time; presentation time = real time × battle speed × hit-stop × slow-mo.

### fx id → effect (every `fx` value used in js/data/skills.js and the maps)
| fx id | effect |
|---|---|
| slash, slash_multi | 1 / 3 crossing crescent slashes (elemental tint when the skill has an element; fire adds flame licks) |
| claw, claw_multi | three parallel rakes (+ a cross-rake) |
| bite | closing upper and lower jaws |
| thrust | spear lance afterimage driving through + shock ring + spark jet |
| fire / fire_big | fireball projectile with smoke trail → noise-orb explosion, embers, smoke, scorch, shockwave, orange light / meteors falling from the sky onto fire circles |
| water / water_big | gathering ripple → twin-shell geyser, droplet spray, mist, rings |
| wood / wood_big (木 = thunder) | sky dims, circle, lightning bolt(s) from the sky, spark fountain, scorch, white-green flash / triple bolts + vines erupting + leaves |
| metal / metal_big | spirit swords rain and stab around the target (one giant sword for _big), star and crystal burst |
| earth / earth_big | tremor and grit → crack decal, rock spikes erupt, debris, dust cloud |
| wind | twin counter-twisted tornado columns, spiralling leaves, streaks |
| dark | dark sigil, inward-sucking sparks, imploding void orb → violet burst, black smoke |
| ghost | spiralling soul wisps from caster to target → spectral orb burst |
| lantern | paper lanterns rise around each target → warm explosion (damage) or light pillar + heal motes (heal skills) |
| magic, unknown ids | star projectile → arcane orb burst |
| beam | charged flare → beam column from the hand → impact sparks |
| heal, heal_all | heal circle, gentle pillar, rising leaves and embers, glow |
| revive | tall holy pillar, falling petals, white flare |
| buff, cure | rising rings + sparks / white sparkle wash |
| debuff, poison, sleep, seal, stun | descending ring + down sparks + dark sigil / toxic clouds + bubbles / drowsy bubbles + mist / flying talismans / star burst |
| song | expanding sound rings, notes spiralling from the singer to the targets |
| kaleido (幻境) | three counter-rotating rainbow circles → shard burst, trance warp |
| summon | the cat (芋圓 / 麻糬) is hurled at the target → puff + stars |
| combo (合擊) | each partner's element spirals to an apex → orb → huge column + explosions + rings |
| ultimate_xinghe 萬燈・螢火燎天 | firefly swarm spirals up → sky orb → comet rain → fire column, scorch, ember field |
| ultimate_baizhi 彼岸・渡魂 | water and holy circles bloom under the party, petals, moonlit pillars on every ally |
| ultimate_hongying 紅纓破陣 | three waves of crimson/gold spear streaks + slashes → crimson burst, red petals |
| ultimate_yungui 太極・萬符朝宗 | talisman blizzard → the five elements detonate in sequence (rings per element) → holy column |
| ultimate_chenbo | soul-lantern tide → spectral column and orbs |
| ultimate (other) | the caster's element `_big`, plus a flash |

## Arenas
Every backdrop id in `G.Backdrops.ids()` has a theme in `G.Battle3D.Arena.THEMES`. An unknown future id gets a neutral dusk field, so new content never breaks.

A theme defines:
- **Sky dome (shader):** zenith/horizon/below colours, sun or moon disc (the moon has crater shading; farshore has an eclipse ring), two drifting fbm cloud layers, stars plus a milky way, and psychedelic modes for 幻境 / 呼吸.
- **Atmosphere and lighting:** fog; sun + hemisphere + sky-gradient IBL (PMREM); a camera-side fill light so the toon characters read at night; fixed point-light lamps with halos.
- **Ground:** a 300 m terrain whose battle stage stays flat, with rolling fbm land beyond and vertex-colour variation. One of 25 painted ground textures at world scale: pavers, red brick, planks/deck, sand, rock shelf with tide pools, grass, forest floor, moss, cave floor, scree, slate, hex basalt, marble, lily field, shrine tiles, mandala …
- **Water:** a sea or lake shader with two-layer scrolling normals, sky fresnel, moon/sun glint path, shore foam and depth tint. Rivers flow; the flooded shrine floor is translucent.
- **Distance:** ridge silhouettes with snow caps and haze gradients.
- **Kit:** the set dressing (below).
- **Post:** bloom / exposure / vignette / saturation / warp.

Palettes follow the 2D paintings in js/gfx/backdrops.js.

**Kits** prefer the shared `G.Models` library (nature, architecture and props teams) and fall back to the procedural props in this file when a type is missing. They follow a placement rule: a ring outside the stage, nothing tall on the camera's front corridor.

| ids | kit |
|---|---|
| shore | rock shelf with tide pools, moonlit sea, rocks, driftwood, seaweed, stone lantern, distant soul-lantern boats |
| linto / south / orchid / eastcoast | beach: pandanus + palms / boardwalk + coconut palms, betel, dock posts, boat / black rock spires + 拼板舟 tatala / sand, driftwood, palms, green headland |
| dream | lantern boardwalk over the black sea, lantern lines into the distance |
| jiufen_night / jiufen_day | 九份 teahouses climbing both sides, red lantern strings, stone steps, stone lanterns |
| city / procession | 亭仔腳 shophouse arcades both sides, lantern strings, paifang / 城隍廟 at the end, banners & pilgrim flags |
| temple | full temple hall (team model) with red walls, incense burner, stone lions, lanterns, camphor trees |
| mansion | Minnan mansion & side wings, red walls, dead trees, drifting green will-o'-wisps |
| tainan | 赤崁樓 on its terrace, brick wall, flame trees |
| hakka / tribe | 伙房 with bamboo & drying racks / 石板屋, totem, fire pit, millet rack |
| mountain / hengchun / cape / yushan | meadow with pines, snowy ridges / grassland with the old city wall and gate / grass headland with the lighthouse above the sea / scree, snow cedars, starry peak |
| forest / alishan / mushroom / pingxi | misty cypress-camphor forest, tree ferns, light shafts / giant 紅檜 trunks above a sea of clouds / giant glowing mushrooms & crystals / dusk field, railway embankment, hillside village, hundreds of drifting sky lanterns |
| lake / sunmoon | lakeshore with reeds, lotus, boat, ridges (night / dawn) |
| tamsui | stone embankment with bollards, junks, 紅毛城 fort, 觀音山 ridge at sunset |
| taroko | marble gorge walls, turquoise river, suspension bridge, waterfall |
| penghu | hex-basalt ground, columnar cliff, 石滬 stone weirs |
| sea / wangboat | the deck of a junk (battened sails, rails, stern castle, lanterns / 王船 colours and banners), sea all around |
| mine / windcave / lighthouse | rock dome with timber frames, rails, cart, lamps / ice-lit cave mouth with icicles / round stone tower, spiral stair, beam of light from the lens room |
| palace / shrine | receding lacquered pillars with blue lamps, altar candle / flooded jade hall, glowing lotus shrine, floating lights |
| toucheng | 搶孤 tower with flags and light strings |
| xuanwu | blue-lantern basalt terrace, long stair up to a dark temple, soul motes |
| farshore / chaos / vision / breath | 彼岸花 field to the horizon under an eclipse / burning ruins, embers / giant geometric leaves, crystals, rune pillars / rotating kaleidoscope wedges over a mandala floor |

Ambient motes per theme: pollen, spores, embers, petals, wind streaks, souls.

## Transitions
- **Field → battle.** The field's WebGL frame is composited under the 2D UI snapshot. A 10×6 jittered triangulation of that image becomes camera-space shards that tumble toward the lens and fall away over 1.15 s, revealing the arena mid establishing shot. The HUD stays hidden until the shards clear.
- **Battle → field.** An ink wash: eight ragged ink splats bloom from the centre and the edges, then the screen hands over to the regular fade-in on the map.

## Tests (`tools/r3d/battle/`)
| script | what |
|---|---|
| `smoke.js [troop] [--full] [--auto]` | battle comes up in 3D, intro screenshots, console errors |
| `tour.js [troop] [--full]` | manual-mode cinematic tour: shatter, establishing, command, target, melee run-up/swing/impact, enemy turn, spell cast/travel/impact, ultimate cut-in/build/impact, finisher, victory, ink |
| `gallery.js [ids] [--troop t]` | fires every fx id (plus hit / kill / statuses) at frozen enemies from a fixed camera; contact sheets |
| `arenas.js [ids] [--full]` | every arena from two angles; contact sheets |
| `sweep.js [troops] [--full]` | auto-battles one troop per backdrop back to back in one page; fails on console errors or unfinished battles |
| `probe.js`, `probe2.js` | evaluate expressions or take a screenshot inside a running 3D battle |

`lib.js` freezes the game (timers, tweens, scene updates and the view clock) while it takes a screenshot. Under SwiftShader a screenshot takes seconds; without the freeze, every capture lands long after the moment it waited for.

<!-- KNOWN -->

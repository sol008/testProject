# 陳伯 · 陳渡 (Chen Du) — Character Design v2 · FINAL

Sheet: `docs/design/v2/chenbo_sheet.png` · Source: `tools/design2/chenbo.html`, `tools/design2/chenbo.js`,
`tools/design2/chenbo_yexuan_lib.js` · Render: `node tools/design2/chenbo_yexuan_render.js chenbo`

> Scope note: per the client's scope change, story-cast characters get **one final design** (not 10 options),
> presented as a full turnaround sheet and made **modelable as a cel-shaded (toon) 3D character** for an angled camera.

## Concept — 「燈籠舖後面藏了二十年的船槳」
By day the grumpiest lantern-maker in 九份; by night the last 引魂人 (soul-guide) of the Black Tide.
*The grumpy grandpa is the disguise; the ferryman is the man.* Age 68 · 166 cm (162 stooped) · 6.4 heads · stocky.

## Shape language & value
- **Round & square**: dome head, rounded shoulders, small belly, squared apron → warm, solid, immovable.
- Day look is **low-contrast and earthy** (mid-dark indigo / ink with one light apron block framing the face).
- Hidden gear adds one big **triangle** (斗笠 + 簑衣 bell) and one long **vertical** (the oar).
- **Soul teal is the only saturated hue**, reserved for 引魂人 items, so the reveal reads instantly.

## Palette
| Name | Hex | Use |
|---|---|---|
| 褪靛藍 Faded indigo | `#4d6789` | jacket |
| 帆布米 Canvas ecru | `#d9c6a0` | apron |
| 墨黑 Ink black | `#2f2b30` | trousers, shoes |
| 曬黑膚 Weathered skin | `#c98f68` | skin |
| 霜白髮 Frost grey | `#cfc9c0` | hair, brows, mustache |
| 簑草黃 Straw | `#b99b5f` | rain cape & hat (gear) |
| 魂青 Soul teal | `#4fd8c8` | focal accent, emissive |
| 燈籠紅 Lantern red | `#b8342b` | cords, paint stains |
| (secondary) 青銅 Bronze | `#b5823d` | 魚符 tally, oar collar |

## Costume breakdown
**Day look (lantern shop)**
- Head: Qing 薙髮 shaved front crown. The grey rear hair is braided into a **queue** (historical, kept) that hangs to
  the waist with a red silk tie. He has heavy drooping brows, a 八字 mustache, a chin tuft, a ruddy bulbous nose
  and big ears.
- 對襟短衫: a faded-indigo front-opening jacket with 盤扣 knot buttons (top two left open over a white 汗衫). The
  sleeves are **cut-in-one 連袖** (no shoulder seam, true to Qing flat tailoring), rolled at the elbow. There are side
  slits, and a **mended patch** on the back.
- 袖套 sleeve guards (navy) tied at the elbow & wrist with white tapes.
- 圍裙: a knee-length canvas apron with a stitched pocket (bamboo strips, brush) and red-lacquer / gilt / glue stains.
  It has a brown waist tie, knotted at his right hip and bowed at the back.
- 大褲 wide black trousers bloused over **綁腿** leg wraps (red tie); black **布鞋** with white 千層底 soles.
- Props on the body: a long bamboo **煙吹** pipe (brass bowl, jade mouthpiece, tobacco pouch) tucked at his left hip,
  and the bronze **魚符 「渡」** half-tally on a red/teal cord at his right hip.

**Hidden 引魂人 gear (ch.1 reveal, finale)** — worn over the same body
- **斗笠** conical bamboo hat with the teal-lacquer order sigil (a lantern in a wave ring) and a chin cord.
- **簑衣** three-tier straw rain cape, open at the front.
- **引魂槳** soul-oar (190 cm): ironwood shaft, T-grip, cord wrap, bronze collar. The blade is carved 「渡」 with
  tide-lines that glow teal when souls are near.
- **引魂燈** paper soul-lantern hung from the oar grip, glowing teal and marked 「引」.
- The tally wakes (glows) near drifting souls.

## Cultural basis
- **Real Qing-era Hoklo working dress:** 對襟短衫 with 盤扣 and 連袖 sleeves, 汗衫, 大褲, 綁腿, 千層底布鞋, and the
  薙髮留辮 queue.
- **Trade kit:** the lantern-maker's sleeve guards and apron; the coastal fisherman's 簑衣 and 斗笠; the long 煙吹.
- **Where the fantasy departs:** the 引魂人 gear is built from real ferry and fishing kit, and no real priestly vestment
  is used. The invented parts are the teal inlay, the hat sigil and the glowing tally. Teal is the game's "soul" colour
  (lanterns turn blue in ch.1).

## Pair link with 夜玄 (shared past)
- **The tally:** they were partners in the order, and the bronze fish 魚符 「同渡」 ("we cross together") was split
  between them. 陳渡 keeps 「渡」 on his belt; 夜玄 tied 「同」 to 夜念's jar. The halves lock with square tenons.
- **The cape:** 夜玄's white-silk strip mantle 千條簑 is a silk echo of this straw 簑衣.
- **The lantern:** both men carry the same soul-lantern shape. 陳渡's is paper (released); 夜玄's is a gold cage (kept).

## Game systems affected
- **Portrait:** the bust as shown on the sheet. Dialogue expressions: scolding 罵人, rare smile 難得一笑, and stern
  soul-guide 引魂 (under the hat).
- **Map sprite:** day look. The round dome + apron block reads at 90 px; see the silhouette test on the sheet.
- **Battle sprite** (ch.1 boss fight assist, finale ferryman): gear look. The oar gives a vertical and the hat a
  triangle at sprite scale. The soul-lantern is the attack/VFX source.

## 3D / toon modelling notes
- **Primary forms:** dome head, barrel torso, apron slab, two wrapped-shin cylinders. These read from any camera angle.
- **Texture vs geometry:** straw strands, weave, stitching, stains, braid lobes and oar inlay are **texture**, not
  geometry.
- **Straw cape:** 3 layered shell meshes with an alpha-cut fringe.
- **Queue:** one braided tube with 2 bones.
- **Shading:** 2-tone ramp + rim light, with an inverted-hull outline of about 2 px.
- **Emissive masks:** oar inlay, hat sigil, lantern and tally.
- **Swap kit:** hat, cape, oar and lantern attach to the head, neck and right-hand sockets, so the day ↔ gear switch
  needs no second body mesh.

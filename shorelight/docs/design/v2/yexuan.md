# 夜玄 「玄冥法師」 (Ye Xuan) — Character Design v2 · FINAL

Sheet: `docs/design/v2/yexuan_sheet.png` · Source: `tools/design2/yexuan.html`, `tools/design2/yexuan.js`,
`tools/design2/chenbo_yexuan_lib.js` · Render: `node tools/design2/chenbo_yexuan_render.js yexuan`

> Scope note: per the client's scope change, story-cast characters get **one final design** (not 10 options),
> presented as a full turnaround sheet and made **modelable as a cel-shaded (toon) 3D character** for an angled camera.

## Concept — 「每一盞長明燈都是籠子；第一個籠子是用愛做的」
The most revered ritual master of 府城 and head of 長明宮. He is calm, courteous and gaunt, and he carries his drowned
daughter 夜念's soul in a celadon jar at his hip. *A beloved saint whose every lantern is a cage.*
Age 44 · 184 cm · 7.9 heads · gaunt.

## Shape language & value
- **Vertical & angular:** a floor-length black column, a crown spike on top, a long narrow face with a pointed beard,
  and an inverted bell of **blade-like white strips**. Every line points up or down; nothing is round or soft.
- **Three value blocks only:** black (robe), white (mantle, cuffs, sash) and **gold** (the focal accent, always
  framing the head or a lantern).
- **Captive-soul blue** appears only on what he refuses to let go of: the crown flame, the jar and the staff lantern.

## Palette
| Name | Hex | Use |
|---|---|---|
| 玄黑 Xuan black | `#1c1b22` | robe, cloud collar, crown |
| 素白 Mourning white | `#eeeae0` | strip mantle, cuffs, sash |
| 長明金 Eternal-light gold | `#cda552` | trim, staff, crown frame (focal accent) |
| 蒼白膚 Indoor-pale skin | `#e8d3c3` | skin |
| 墨髮 · 霜鬢 Ink hair / silver temples | `#18161c` / `#a19eab` | hair |
| 魂藍 Captive-soul blue | `#8fdcff` | emissive: crown flame, jar, staff lantern |
| 青瓷 Celadon | `#9fbfb3` | 夜念's jar glaze |
| 硃紅 Cinnabar | `#a9312b` | jar string, seal ink — the only warm red |

## Costume breakdown
- **Head:** a long narrow face with high cheekbones and hollow cheeks. The eyes are half-lidded and downturned, with
  sleepless shadows beneath; the inner brow ends lift in permanent sorrow. Irises are **gold** (they flare in phase 2).
  He has a thin mustache and a narrow pointed goatee.
- **Hair:** black, silver at the temples, centre-parted and swept back. It is kept long in a **topknot** with a tied
  tail and a gold nape cuff, plus two loose front strands.
- **長明冠:** a small black-lacquer lantern-crown with a gold frame, a horizontal gold pin, a blue captive-flame finial
  and black gauze ribbons.
- **雲肩:** a black silk cloud-collar with a gold lantern-lobed edge and a gold lantern clasp at the throat.
- **千條簑:** a mantle of white silk strips with gold-dipped pointed tips — short at the front, long at the back.
- **大襟長袍:** a floor-length black silk robe with a white 立領 inner collar and a right-side closure, with gold
  piping and gold 盤扣. Side slits flash the white under-robe. The gold hem band carries a lantern-and-wave pattern.
- **Sleeves:** wide black sleeves with white turned-back cuffs.
- **Sash:** white silk with a gold lantern clasp and a long hanging end with a gold tassel.
- **Footwear:** black boots with thick white soles.
- **Back:** a gold 長明宮 sigil embroidered on the robe (a lantern ringed by turning waves).
- **Props:**
  - **夜念魂罐:** a celadon-white porcelain jar with a lotus band, a black-lacquer lid, a red string and a paper 符
    seal. It glows blue from within, and 陳渡's 「同」 tally half hangs from it. Inside is 夜念's tiny, tired
    soul-lantern.
  - **長明燈杖** (220 cm): a black-lacquer staff with gold collars and a gold cage lantern holding a trapped soul-flame.

## Cultural basis
- **Gentleman's dress:** the Qing 大襟長袍 with 立領, 盤扣 and side slits.
- **Temple lamps:** the Taiwanese temple practice of lighting 光明燈 / 長明燈 for blessing. His "ghost-warding" lamps
  parody it.
- **Ritual masters and the topknot:** he draws on Taoist and folk 法師 ritual masters. Keeping full hair in a topknot
  instead of the queue follows the popular 「僧道不從」 custom, under which clergy were exempt from the queue.
- **Mourning and paper effigies:** the white strips draw on funeral and ritual whites and on 紙紮 paper-effigy
  aesthetics.
- **Limits:** no real deity, god-image or real sect regalia is depicted.

## Fantasy departures
The 長明冠, the strip mantle (a silk translation of a ferryman's straw 簑衣), the gold irises, the blue captive flames
and the temple sigil are all invented. The sigil, a lantern in turning waves, visually reads as 逆潮 — the tide turned
back.

## Pair link with 陳渡 (shared past)
- **Same order, opposite choices:** 陳渡 wears real straw and paper lanterns that let souls go; 夜玄 wears silk
  strips and gold cages that keep them.
- **The tally:** the bronze 魚符 「同渡」 was split between them. 夜玄 tied his 「同」 half to 夜念's jar, and the
  halves meet again in the finale.

## Game systems affected
- **Portrait:** courteous default (bust). Grief 悲 (夜念 scenes), cold 冷 (逆潮, gold irises lit), and a profile view.
- **Map sprite:** the white bell mantle + crown spike read instantly at 90 px; see the silhouette test on the sheet.
- **Battle sprite / boss:**
  - Phase 1 uses the staff and talismans.
  - Phase 2 (逆潮): the strips lift and stream like tide-tendrils (same meshes, animated) and the gold irises flare.
  - The jar glows brighter until 夜念 speaks: 「爹，我好累……讓我走吧。」

## 3D / toon modelling notes
- **Primary forms:** a long cone robe, an inverted bell of strips and a small cylinder crown. One clear vertical from
  any camera angle.
- **Strips:** about 30 flat card meshes (15 front / 15 back), each on a 2-bone chain. The gold tips are texture.
  Phase 2 is animation on the same cards.
- **Texture vs geometry:** the hem pattern, back sigil, piping, knot buttons, jar lotus band and seal writing are
  **texture**, not geometry.
- **Hair:** skull cap + topknot + one tail mesh (3 bones); the two loose front strands are cards.
- **Shading:** 2-tone ramp with a cool rim light on the black, plus an inverted-hull outline.
- **Emissive:** crown flame, jar interior, staff lantern, and irises in phase 2.
- **Props:** the jar sits on a hip socket and the staff on the right-hand socket.

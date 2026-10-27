# 白芷 Bai Zhi: Character Design Pass v2

Heroine, appears about 17. 燈靈 (the lamp spirit) of the 彼岸燈. Water element, healer, jade flute, sings 「渡魂謠」.
She carries a red string and a jade tag carved 「白芷」.

- Sheet: `docs/design/v2/baizhi_sheet.png` (10 cards in a 5×2 grid plus a silhouette line-up at map-sprite scale)
- Single cards: `docs/design/v2/baizhi/opt01.png` … `opt10.png` (about 900 px tall)
- Source: `tools/design2/baizhi_lib.js` (drawing library and card layout), `baizhi_helpers.js` (shared figure helpers and
  the identity head), `baizhi_opt01.js` … `baizhi_opt10.js` (one file per design), `baizhi.html` (preview),
  `baizhi_render.js` (Playwright renderer).
  - `node tools/design2/baizhi_render.js` renders the sheet and all 10 cards.
  - `node tools/design2/baizhi_render.js 3 7` renders single cards only.
  - `… fig N scale y0 y1` renders a debug close-up of a figure.

## Binding constraints applied

1. **DESIGN_BRIEF_V2:** each card has a full body (420 px design height), a bust close-up, a palette, numbered
   callouts (Chinese + English), a title and concept line, the cultural basis, and front and back silhouettes. Every option
   has its own body ratio, shape language and silhouette (see the line-up row on the sheet).
2. **Client photo reference (REFERENCES.md, 白芷), binding:** the face and hair stay the same in all 10 options. They
   come from one shared module, `BZ.bzHead()` in `baizhi_helpers.js`:
   - Very long, straight jet-black hair (`#17151C`) with a blue-black sheen, worn down.
   - The part is slightly off-centre. A long face-framing curtain falls on the viewer's left. The other side is tucked
     behind the ear.
   - A long drop earring hangs from the tucked ear (gold hook, dark bead, drop). The drop changes colour per option.
   - Soft oval face, gently tapered chin. Mid-sized dark-brown almond eyes with softly upturned corners and a subtle
     double lid. The default gaze drifts upward and sideways, with a slightly lowered lid for a dreamy look.
   - Natural, slightly arched brows. Small nose.
   - Full rose lips in a closed, faintly asymmetric half-smile.
   - **Beauty mark on her right cheek beside the nose (viewer's left)**, at upper-cheek level.
   - A dark cord or red-string bracelet appears on one wrist in every option.

   Only these things vary between options: the expression (singing in 08, curious "o" in 04, a brighter smile in 09),
   partial updos (half-up loop in 02, half-up twin buns in 04, a 步搖 hairpin in 08), headwear (roof crown in 03, 斗笠
   in 05, 頭帕 in 09), and the spirit treatment of the hair ends (sea-glass, lantern red, foam, blue flame, lilac).
   The brief's request for "a different facial structure per design" applies to the other characters. For 白芷 the
   client's face reference overrides it.
3. **Lead directive: full 3D with cel-shaded characters and an angled camera.**
   - Every design is built from a few clear primary volumes.
   - Fine detail (piping, embroidery, weave, straw, bamboo, lettering) is meant to be painted texture, not geometry.
   - Glow, translucency and dissolving hair are shader or particle effects.
   - Each card has a "3D / TOON" note and a back-view silhouette. The back view uses a grey detail overlay to show the
     hair mass, ties and bows.

### Identity palette (shared)

| Hair | Sheen | Skin (typical) | Skin shadow | Eyes | Lips | Mole |
|---|---|---|---|---|---|---|
| `#17151C` | `#5D6F98` | `#F6E2D4` | `#ECC3B2` | `#4B2C20` | `#D98892` | `#3A2224` |

### Game systems affected (all options)

- **Portrait:** the bust is drawn from the same model as the full body, so the identity face carries straight into
  dialogue portraits. Portrait expressions should keep the drifting half-smile as the idle.
- **Map sprite:** use the silhouette line-up. What reads at about 90 px is noted per option below.
- **Battle sprite / 3D model:** see each option's 3D notes. Healer casting and 渡魂謠 animations use the flute and the
  per-option spirit effect.

---

## 01 九份借衫 Borrowed Best of Jiufen (HISTORICAL · 6.5 heads · round, soft)

**Idea.** 阿柑姨 lends her the 大裪衫 her daughter wore. She can pass as any 九份 girl. Only the sea-glass shimmer in
her hair ends and fingertips gives away that she is not human. Her first bowl of 芋圓 is the story moment.

**Palette.**

| Jacket | Piping | Hair | Skin | Red string | Jade | Shoes |
|---|---|---|---|---|---|---|
| `#A9CACB` | `#272B42` | `#17151C` | `#F6E1D1` | `#C32F3B` | `#86C4A2` | `#B8334A` |

**Costume.**
- Hoklo 大裪衫: right-overlap 大襟 curving to the armpit, low standing collar, 盤扣 at the collar, the curve and the
  side seam.
- Broad black 滾邊 with a cream inner line on the hem, side slits and wide cuffs. Knee-length, slightly A-line.
- Wide black 大褲 with a contrasting hem band. Red embroidered 繡鞋.
- Jade tag on a red string, tied to the lapel knot button.
- Flute bag slung across the back, with a red tassel.

**Cultural basis.** Everyday 19th-century Hoklo women's wear in Taiwan. The only fantasy is the light at her hair ends
and fingertips.

**3D.** Two simple garment shells. Piping and buttons are texture plus a small bevel. Hair is three large hair cards or
shells. Effects are a dissolve shader.

**Sprite read.** Rounded jacket mass, trousers, bowl, flute-bag spike over the shoulder.

## 02 藍衫笛歌 Hakka Blue-Shirt Flautist (HISTORICAL · 7 heads · vertical, banner sleeves)

**Idea.** A guest outfit from the 竹塹客家庄 山歌 duel. She holds the flute level at her chest, and the wide sleeves hang
like banners.

**Palette.**

| Shirt | Cuff band | Apron | Hair | Skin | Jade flute | Red |
|---|---|---|---|---|---|---|
| `#36598A` | `#A9C9E6` | `#2B2A3A` | `#17151C` | `#F3DCCB` | `#9FD3BD` | `#C3303A` |

**Costume.**
- Indigo 藍衫 to mid-calf: right overlap, side slits, wide sleeves with turned-back light-blue and cream cuff bands.
- 圍身裙 apron with a silver neck chain and an embroidered hem band.
- Black trousers, cloth shoes.
- Half-up loop with a jade comb and red string. The red-string jade tag hangs from the flute's end.

**Cultural basis.** Taiwanese Hakka 藍衫 and apron dress. The fantasy is limited to sea-mist motes coming off the flute.

**3D.** Tunic and apron layers. The sleeves are separate cloth or bone chains. The flute is a prop.

**Sprite read.** A tall column with a horizontal flute bar and hanging sleeve "wings".

## 03 水燈頭 Lantern-House Spirit (FOLK FANTASY · 6 heads · square, architectural)

**Idea.** She *is* the 水燈頭 that drifted back to shore. She wears a 燕尾脊 roof crown, her skirt is a glowing paper
lantern wall, and she cups a cold blue lamp-heart flame. She stands on the lantern's lotus-rim float.

**Palette.**

| Paper | Vermilion | Gilt | Sea teal | Hair | Glowing ends | Cold flame |
|---|---|---|---|---|---|---|
| `#F3E5C4` | `#C43E2C` | `#E2B24C` | `#1F5C60` | `#17151C` | `#FF7A3C` | `#BFF3FF` |

**Costume.**
- Swallow-tail roof crown with an eave tassel. The jade tag hangs from the other eave like a wind chime.
- Stiff shoulder eaves with upturned tips.
- Paper bodice with lantern ribs and a teal right-overlap edge. Roof-tile peplum.
- Trapezoid skirt of three paper panels with glowing lattice windows, a painted wave band, the character 渡, and a
  paper-strip fringe.
- Wrapped legs, bare feet, lacquered raft.
- 花鈿 flame mark on the forehead. Hair ends glow lantern red.

**Cultural basis.** Based on 放水燈頭 at the 雞籠中元祭. The garment underneath keeps the right-overlap collar and
sash.

**3D.** Hard-surface shells (crown, eaves, skirt) that are very easy to model. Windows are emissive texture. Flame and
inner glow are shaders.

**Sprite read.** Horned roof, square eaves, trapezoid, raft.

## 04 白家燈籠 The Bai-House Lantern (WHIMSICAL · 6.2 heads · round, bouncy)

**Idea.** "白" is the surname painted on a household lantern, and she takes it literally: she dresses as a walking
house-lantern. She waves hello and greets everything with a small 「咦？」.

**Palette.**

| Paper | Lantern red | Lacquer | Hair | Gold | Skin | Jade |
|---|---|---|---|---|---|---|
| `#FBF0D8` | `#D23B35` | `#2C2228` | `#17151C` | `#E8B84A` | `#F9E3D3` | `#8FD0B0` |

**Costume.**
- Half-up 雙丫髻 twin buns styled as tiny lanterns, with long red tassels. The rest of the hair stays down.
- Red 對襟 jacket with gold 盤扣. Puffed paper lantern sleeves.
- Spherical lantern skirt with bamboo ribs, lacquer caps, a big red 白 and a centre tassel.
- Leggings with red ties, cloth shoes. Flute held at her side with a red string and the jade tag.

**Cultural basis.** Taiwanese household and temple paper lanterns, and girls' twin buns. Fantasy: the skirt glows
from inside.

**3D.** Skirt is a sphere shell with rings and can squash and stretch. Ribs and the character are texture. Bun tassels
use bone physics.

**Sprite read.** The roundest option: a ball skirt and ear-like buns.

## 05 引魂舟娘 Soul-Ferry Girl (TRADE · 6.8 heads · triangle, steady)

**Idea.** 陳伯's 引魂人 gear, worn by her. She looks up at a 燈篙 soul-lantern, listening to it.

**Palette.**

| Straw | Bamboo hat | Indigo | Leg wraps | Soul-light | Skin | Red cord |
|---|---|---|---|---|---|---|
| `#B99B5E` | `#D2B57A` | `#2F4A6A` | `#ECE6DA` | `#8FD8FF` | `#F4DFD0` | `#B8303A` |

**Costume.**
- 斗笠 tied with a red cord under the chin.
- Three-tier palm 簑衣, open at the front.
- Indigo 對襟 shirt with a sash.
- Trousers rolled to mid-calf, 綁腿 leg wraps, 草鞋.
- Tall bamboo 燈篙 with a hanging 引 paper lantern lit by a cold blue light.

**Cultural basis.** Fisherfolk and ferry rain gear from 八斗子, plus the 普渡 燈篙 custom.

**3D.** The hat is a single cone. The cape is three skirt-shell tiers with alpha straw texture. The pole is a prop with a
lantern swing bone. The light is a point light plus emissive.

**Sprite read.** Flat cone, triangle cape, tall pole: the most distinct at 90 px.

## 06 海沫 Sea-Foam Spirit (SPIRIT FORM · 7.5 heads · flowing S-curves)

**Idea.** 白芷 as seen with 靈視, on a breaking wave. Her hair ends turn into foam, and a sheer sea-silk 褙子 curls into
wave crests at the hem.

**Palette.**

| Foam | Sea-glass | Deep teal | Black-tide | Coral | Skin | Jade |
|---|---|---|---|---|---|---|
| `#F2FBFA` | `#8FD6D0` | `#1F6F78` | `#123C50` | `#E8706A` | `#F6E3D8` | `#9FDAC4` |

**Costume.**
- White crossed-collar bodice, teal under-bust sash with a coral knot and streamers, and the jade tag.
- High-waisted skirt with a 海水紋 hem.
- Translucent aqua 褙子 with straight collar bands and wave-curl hems. Sheer sleeves over open palms.
- Bare feet on a foam crest.

**Cultural basis.** 褙子 plus a high-waisted skirt. This older silhouette is used only for the spirit-realm form, which
the brief allows. The wave pattern is traditional.

**3D.** Double-sided translucent shells with fresnel rim. Foam and hair dissolve are particles. The wave is a separate
FX mesh.

**Sprite read.** Long bell with curled wave "hooks" at both sides of the hem.

## 07 燈心冷焰 Lamp-Wick Flame (TRUE FORM · 7.5 heads · vertical teardrop, stately)

**Idea.** The moment she remembers what she is. A teardrop of cold blue flame rises behind her, she holds the jade
flute upright like a wick with a flame at its tip, and she stands in a lotus lamp-dish. She is the Shorelight itself.

**Palette.**

| Lamp white | Gold | Night navy | Cold flame | Wick core | Skin | Jade |
|---|---|---|---|---|---|---|
| `#F6F1E6` | `#D6AE52` | `#1E2A4A` | `#4FB4FF` | `#FFD890` | `#F6E4DA` | `#A8E0CC` |

**Costume.**
- Standing-collar, right-overlap long robe with navy and gold piping.
- Navy belt with a lamp-ring buckle. Narrow sleeves with gold cuffs.
- Flame-scroll embroidery rising from the hem.
- Lotus petal lamp base. Hair ends turn to blue flame.

**Cultural basis.** Temple 蓮花燈 and 光明燈 (點燈) imagery on a Qing women's robe structure. No real deity is
depicted: the light belongs to the lamp spirit.

**3D.** A simple mesh. The aura is three billboard or volume shader layers with animated tongues. The lotus base is a
hard prop.

**Sprite read.** Teardrop flame (shader). The figure underneath is a slim column with a lotus base. Keep the aura in
the field sprite as an emissive halo.

## 08 雲肩渡歌 Cloud-Collar Songstress (FESTIVE · 7 heads · lobed shoulders, bell)

**Idea.** On 中元 night the neighbours dress her from a dowry chest. She leads 渡魂謠 at the 主普壇, dressed for the
festival, while she looks out to sea.

**Palette.**

| Peacock ao | Begonia red | Gold | Moon-white | Border | Skin | Jade |
|---|---|---|---|---|---|---|
| `#1F6A74` | `#C8455A` | `#D8AC4C` | `#F3ECE0` | `#F2E6CC` | `#F6E1D3` | `#9FD3BD` |

**Costume.**
- 如意雲肩 with carved cloud heads at the left, front and right, gold edging, wave embroidery and a tassel fringe.
- Peacock-teal wide-sleeved 襖 with a broad cream border.
- 馬面裙 with a flat front panel, side pleats, and an embroidered wave-and-lotus hem.
- 繡鞋. Half-up hair with a 步搖 hairpin.
- Raised singing hand. Flute held low with a red string and the jade tag.

**Cultural basis.** Qing Han women's festive and wedding dress.

**3D.** The collar is a rigid shell with tassel bone chains. Two garment layers. Pleats use normal maps. All embroidery is
texture.

**Sprite read.** Wide lobed shoulders over a bell skirt.

## 09 八斗子拾貝 Tide-Pool Beachcomber (EVERYDAY · 6.6 heads · compact, lively diagonals)

**Idea.** Low tide at 八斗子. She wades barefoot into a rock pool and lifts a small crab to eye level to greet it
politely: 「你好。你也是從海那邊來的嗎？」 This is her comic, literal side.

**Palette.**

| Shirt | Trousers | Sash | Headband | Creel | Skin | Crab |
|---|---|---|---|---|---|---|
| `#EEE4CF` | `#3A3F52` | `#33476E` | `#D4584F` | `#B48C4C` | `#F3DCCB` | `#D8643A` |

**Costume.**
- Patched cotton 大襟汗衫 with rolled sleeves.
- Indigo cloth sash with the flute tucked in, and the jade tag.
- Floral 頭帕 headband knotted at the side.
- Trousers rolled below the knee, bare feet, red string at the ankle.
- Bamboo 魚簍 creel at the hip.

**Cultural basis.** Keelung fishing-village women's work dress. Fantasy: a faint glow where the tide touches the red
string.

**3D.** The simplest build (three garments). The creel is a textured prop. The crab is an idle-animation prop.

**Sprite read.** Raised arm with a crab, a creel bulge, and bare calves.

## 10 海月傘 Jellyfish Parasol (BOLD FANTASY · 6.8 heads · dome, trailing verticals)

**Idea.** Each memory makes her more translucent. Her bamboo oil-paper umbrella has become a 海月 jellyfish bell
trailing tassel-like light ribbons, and her skirt hem has faded enough to show the sea behind her.

**Palette.**

| Jelly bell | Rim pink | Lilac ao | Mist skirt | Indigo trim | Bamboo rib | Skin |
|---|---|---|---|---|---|---|
| `#BFE8F0` | `#F5A8C8` | `#DDD6EE` | `#C9D8EA` | `#3A3A6A` | `#C9A24A` | `#F6E3D8` |

**Costume.**
- Oil-paper umbrella: bamboo ribs, painted radial canals, rim lights, ribbon tentacles.
- Lilac side-fastened 襖 with indigo trim, knot buttons and little embroidered jellyfish.
- Pleated mist-blue skirt whose hem fades to transparent.
- Cloth shoes. Flute with a red string and the jade tag.

**Cultural basis.** Taiwanese (美濃 Hakka) bamboo oil-paper umbrellas, a wedding symbol of completeness, with 襖裙
dress. The fading hem shows the story's translucency mechanic.

**3D.** The umbrella is a separate prop: a translucent bell with 6–8 boned ribbons. The hem fade is an alpha or dither
parameter driven by story progress.

**Sprite read.** Dome with long vertical strands.

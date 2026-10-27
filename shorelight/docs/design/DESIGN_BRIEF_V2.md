# Character Design Pass v2 — Brief (binding)

The v1 options were rejected by the client as "really bad". Diagnosis of v1 (do NOT repeat):
- every option reused one generic face template → characters looked like palette swaps;
- generic "anime boy/girl" shapes with weak, mushy silhouettes and no distinct shape language;
- costumes were vague "Chinese-ish" robes, not grounded in the setting (Qing-era Taiwan, 19th c.);
- low detail, flat rendering, poor anatomy/proportions, no design rationale.

## Goal
For each assigned character produce **10 completely different, industry-standard character designs**, each presented as a
**concept sheet card** the way a game studio's art team would pitch them:
1. **Full-body front view** (the main image, ~420 px tall at 1x): correct proportions (pick a consistent body ratio per
   design — e.g. 6.5–7.5 heads stylised-realistic, or 5–6 heads stylised; NO chibi), readable silhouette, clean line art,
   2–3-tone cel/painterly shading with rim light, believable cloth folds and layering, hands and feet drawn properly.
2. **Bust / face close-up** (~200 px) showing facial structure, eyes, hair detail and expression. Every design must have its
   own facial structure (face shape, jaw, brow, eye shape & size, nose, mouth) — age, ethnicity-appropriate features and
   personality must read from the face.
3. **Colour palette** swatches (5–7 colours, primary / secondary / accent / skin / hair) with names.
4. **Callouts**: 3–5 short labels pointing at costume elements (Chinese name + English), e.g. 「大裪衫 side-fastened jacket」.
5. **Title + concept line**: option number, a Chinese option name, an English name, and a one-sentence design idea.
6. **Cultural basis**: one or two sentences: which real garments/practices it draws on and where the fantasy departs.

Present each character as one sheet image (10 cards in a 5×2 grid, 2400 px wide is fine) plus a large single-card image per
option for close inspection.

## Industry standards to meet
- **Silhouette first**: each of the 10 options must be recognisable in solid black at map-sprite scale (~90 px) and differ
  from the other 9 options by silhouette, not just colour (hat/hair mass, garment length & flare, weapon/prop, posture).
- **Shape language** matches personality (round/soft = warm, angular = sharp/dangerous, vertical = stately …).
- **Value & colour**: clear value grouping (light/mid/dark), one focal accent colour, palette harmony; avoid noisy rainbows.
- **Costume logic**: garments must be wearable and layered correctly (closure side, sleeve type, collar, belt/sash, trousers
  & leg wraps, footwear); props have believable construction.
- **Design coherence across the 10**: options range from faithful-historical to bold-fantasy, but each is a complete,
  polished proposal — no throwaway options.
- **Consistency with the story bible** (docs/STORY_BIBLE.md): personality, role, age, weapon/element, key motifs
  (星河 lantern/fire; 白芷 lamp spirit, sea, silver-white hair is NOT mandatory — the client wants brand-new looks, so
  keep only what is story-essential: her otherworldly lamp-spirit nature, the red string & jade tag, the flute).
  You MAY change hair colours, hairstyles, outfits, builds — the client explicitly asked for brand-new designs.

## Cultural soundness (setting: fantasy 19th-century Qing-era Taiwan)
Ground costumes in real dress, then stylise:
- Han Taiwanese (Hoklo 閩南 & Hakka 客家) everyday wear: men's 對襟短衫 / 大襟衫, 唐衫, wide trousers 大褲 / 寬腳褲,
  綁腿 leg wraps, 草鞋 / 布鞋, 斗笠 bamboo hat, 頭巾 head cloth, 汗衫, 圍裙; women's 大裪衫 (side-fastened 大襟 jacket with
  contrasting 滾邊 piping and 盤扣 knot buttons), 襖, 裙 or 褲, 繡鞋, 頭帕; Hakka 藍衫 (blue long jacket, wide sleeves).
  Men in the Qing era wore the queue (薙髮留辮); designs may use it (historical) or depart from it as an explicit fantasy /
  wuxia choice — label which. Children: 肚兜, 虎頭帽, 長命鎖.
- Trades: miners (九份 gold mines: head cloth, rolled trousers, waist bag, lamp), fishermen (簑衣 straw rain cape, 斗笠),
  lantern-makers (sleeve guards, paper/bamboo tools), temple keepers, Taoist priests (道袍, 道冠 / 混元巾, 八卦 motifs,
  拂塵, 法劍, 符), Buddhist & folk ritual specialists, 引魂人 / ferrymen (oar, lantern, 簑衣).
- Wealthy/merchant (鹿港 洛家, 府城): silk 長袍 + 馬褂, 瓜皮帽, embroidered cuffs, jade; martial clans: 箭袖 arrow sleeves,
  護腕 bracers, 腰帶, boots 靴.
- Spirits & deities: draw on Taiwanese folk imagery (紙紮 paper effigy aesthetics, 七爺八爺 silhouettes for inspiration only,
  lantern & water-lantern motifs, 普渡 imagery) — never depict a real deity (媽祖, 王爺, 城隍…) as a character.
- Fictional characters must NOT appropriate real Indigenous sacred dress (藤婆 is a fictional hermit of unknown origin).
- Avoid anachronism (no 20th-c. qipao 旗袍 for 19th-c. Taiwanese women, no Japanese-era clothing) unless explicitly
  pitched as fantasy, and avoid generic "Chinese costume drama" Tang/Song looks unless justified (e.g. a deity, a Taoist
  ritual vestment, a dream/spirit realm).

## Technical
- Canvas 2D procedural drawing (no external images), in your own files under `tools/design2/` (one JS file per character or
  per design is fine). Do NOT reuse the v1 face template; draw each design's face/body deliberately (shared helper
  functions for e.g. cloth shading are fine). Use plenty of Bezier paths; anti-aliased line art 1.5–2.5 px in a dark hue of
  the fill; shading layers; rim light; small details (stitching, piping, knot buttons, embroidery motifs, hair strands).
- Preview HTML `tools/design2/<char>.html`; render with Playwright (`require('playwright')`, `chromium.launch()`), write
  `docs/design/v2/<char>_sheet.png` (all 10) and `docs/design/v2/<char>/opt01.png … opt10.png` (single cards, ~900 px tall).
- LOOK at every PNG with the Read tool and iterate many times. Compare against your mental reference of professional
  concept sheets (e.g. Genshin Impact / 仙劍奇俠傳七 / Octopath / Sea of Stars character reveals). Do not stop at "okay".
- Write `docs/design/v2/<char>.md`: for each option: name, idea, palette hex codes, costume breakdown, cultural basis,
  and which existing game systems it affects (portrait, map sprite, battle sprite).
- Only create/modify files under tools/design2/ and docs/design/v2/. Do not edit game files. Do not git commit.

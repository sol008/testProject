# Side quests & 心燈 — chapters 6–8 (playtest QA)

Goal: prove every side quest and every 心燈 in chapters 6 (`js/maps/ch6_tainan.js`), 7 (`ch7_mountains.js`) and 8
(`ch8_tide.js`) can be **found, played and completed by a real player**, and fix what can't. Discoverability is
treated as a bug class: a required step with no visible object, glint, hint tag, NPC line or quest-log text pointing
at it is a bug.

## How it was tested

`tools/test/sidequests/chN.side.js` (shared driver: `tools/test/sidequests/lib68.js`) plays each quest in headless
Chromium, prints `PASS/FAIL` per quest and exits 1 on any failure.

```bash
node tools/test/sidequests/ch6.side.js          # ayi, ayi_warn, linto, mush, 3d, 3d_mush
node tools/test/sidequests/ch7.side.js          # salt, pasuya, warn, mush, murals, 3d_valley, 3d_yunzhi
node tools/test/sidequests/ch8.side.js          # pilgrims, oyster, warn
node tools/test/sidequests/ch7.side.js --only salt,pasuya    # a subset
SHOTS=/some/dir node tools/test/sidequests/ch6.side.js --only 3d   # 3D spot checks with screenshots
```

What the driver does, and does **not** do:

- **Never sets a quest's own flags, items or stages.** Starting points are either `?debug&startch=N` or a debug map
  with *main-story* progress flags only (the same start points the chapter tests use). Gear is given the way the
  chapter tests do (what a player would have bought by then); the ch8 洛青鋒 boss is fought at the level the ch8
  chapter test uses.
- **Walking** is a breadth-first path over the engine's real collision (`MapScene.blocked`, warps avoided). The
  player is stepped along it cell by cell (`G.Debug.stepOn`), so touch events on the way fire as for a walking
  player, and walking stops when a script starts. No path = FAIL.
- **Talking / examining** walks next to the target, faces it and presses the action key through the engine's own
  `findInteract()` → `doInteract()`. A hidden NPC, a `spirit` NPC without 靈視 or an action spot behind a wall FAILs.
- **Shops**: the test autoplay skips the shop screen, so `buy()` checks the item is in *that* shop's stock and pays
  its listed price.
- **Clues**: `clue(x, y)` lists what makes an action spot noticeable (hint tag, object on/next to it, NPC); the
  playthroughs print it for every required spot.
- Fails on console errors, page errors, `G.lastError` and missing-art warnings. Battles are fought by
  `tools/test/lib/battlebot.js`.
- **3D**: `3d*` tests run with `render3d: true` + `?r3lite` and screenshot the visual-only clues.

## Summary

| Ch | Quest / 心燈 | Result | Fixed |
|---|---|---|---|
| 6 | 轎夫與母親 (`q_yanshui_mother`, 心燈 `lantern_yanshui`) | PASS | 林伯 now points at 阿義 (temple scene + before 「開始吧」); objective after the 蜂炮夜 points at the 大疫塚 |
| 6 | 林投姐 (心燈 `lantern_linto`, main story) | PASS | — |
| 6 | 雲歸的蕈譜・潮音蕈 (`q_tuanzi_mush`, no 心燈) | PASS | spot was a bare, 靈視-only tile; now speaks without 靈視 and offers a 七彩靈蕈; 府城藥鋪 sells 七彩靈蕈 |
| 7 | 老吳的鹽 (`q_ch7_salt`, no 心燈) | PASS | 老吳 now tells you to bring salt up the mountain |
| 7 | 霧中的獵刀 (`q_ch7_pasuya`, 心燈 `lantern_tsou_hunter`) | PASS | objective now follows the quest (it kept saying 「和 Voyu 說話」 after he asked) |
| 7 | 燈母祠的壁畫 (`q_ch7_murals`, 心燈 `lantern_lamp_murals`) | PASS | — |
| 7 | 雲歸的蕈譜・雲芝 (`q_tuanzi_mush`) | PASS | — |
| 8 | 北港的香客 (`q_ch8_pilgrims`, 心燈 `lantern_beigang_pilgrims`) | PASS | — |
| 8 | 蚵殼阿嬤 (`q_ch8_oyster`, 心燈 `lantern_oyster_grandma`) | PASS | the 安平 arrival now shows her; the dawn objective reminds you to visit her before 陳伯 |

All 心燈 checked through `G.Lanterns.has(id)`, quest log through `G.Quests.isDone(id)`.

---

## Chapter 6

### 心燈「轎夫與母親」 (`q_yanshui_mother` → `lantern_yanshui`)

| | |
|---|---|
| **Start** | 鹽水主街 (23,8), **阿義**, after the 武廟 scene (`ch6_yanshui`) and before 「開始吧。（蜂炮夜）」. Before the temple he only talks about the palanquin. |
| **Steps** | 1. talk to 阿義 (stage 0) → 2. 林伯 「開始吧」 → 蜂炮夜 (4 battles); at the end 白芷: 「大疫塚那邊，還有一個人沒有走」 (stage 1) → 3. 大疫塚 (38,29): 「咳嗽的婦人」 (ghost, visible without 靈視) (stage 2) → 4. walk back onto the main street (20–22, 18–27) → 神轎回駕 cutscene → done. |
| **Rewards** | 心燈「轎夫與母親」, 武廟平安符 — verified. |
| **Window** | 阿義 leaves when the 蜂炮夜 starts; 鹽水 is gone after 「休息到天亮」. Both are covered by `S.pointOfNoReturn`: unstarted → 林伯's prompt counts 「1 盞心燈未點亮」 (test `ayi_warn`, 再等等 keeps the night from starting); started → the inn names 轎夫與母親（心燈） and 再等等 stays in 鹽水. |
| **Issues found** | (a) **Discoverability of step 1**: nothing in the game told the player to talk to 阿義, and the window closes the moment you start the main event. The only nudge was the generic 「1 盞心燈未點亮」 prompt. (b) After the 蜂炮夜 the objective said 「到鹽水客棧休息，天亮往府城」 even with the quest open. |
| **Fixed** | (a) 林伯 ends his plague story with 「……廟口那個阿義，今年第一次扛轎。他阿母，就是八年前那場瘟走的。」, and if you come to start the night without having met 阿義 he says 「起轎前，去廟口跟阿義講講話吧。」 (b) Objective becomes 「大疫塚還有一個人沒有走。去看看，再到客棧休息」 when the quest is open. English in `en_ch6.js`; guide ch06 step 1 updated. |
| **3D** | The ghost mother among the graves is clearly visible (screenshot `ch6_3d_mother`). |
| **Remaining** | none. |

### 心燈「林投姐」 (`lantern_linto`, main story)

| | |
|---|---|
| **Start** | Main story: 鹽水客棧 → 府城 → 墨鴉 → 做十六歲 → 肉粽伯 (鄭家肉粽 ×2) → 林投林 (0,40). |
| **Steps** | Walk the crying maze to the old pandanus (14,9) → boss (傾聽 = defend) → 鄭家肉粽 given → 心燈. |
| **Result** | PASS from the inn, walking every step. 心燈, 林投姐的木梳, 肉粽 consumed; 傾聽 ×5 → 昭娘的銀簪. |
| **Remaining** | none (guaranteed lantern). |

### 雲歸的蕈譜・潮音蕈 (`q_tuanzi_mush`, cross-chapter, no 心燈)

| | |
|---|---|
| **Start** | Cross-chapter (started in ch3). The ch6 opening sets the log to 「潮音蕈長在海邊的沙地上，靠近時聽得見潮聲。府城外的林投林……（開啟靈視）」. |
| **Steps** | 林投林, wet patch south of the B corridor (22–23, 21–22) → with 靈視 the touch event runs the tasting scene → log stage 9. |
| **Issues found** | **The same bug class as the ch3 report**: the find was a `spirit`-only touch event on a 2×2 patch with a `spirit`-only glow, inside a maze. Without 靈視 the tiles were completely bare, and walking over them did nothing. The guide also said 「本章商店不賣七彩靈蕈」: a player who had used up their 靈蕈 could not do it at all. |
| **Fixed** | New non-spirit touch event `mush_hear` on the same patch (once per visit): 「腳下的濕沙裡，傳來細細的潮聲……」 / 雲歸「……有什麼長在這裡。肉眼看不見。」. With a 七彩靈蕈 in the bag it offers 「吃一朵七彩靈蕈，開啟靈視」 and runs the scene on the spot (same pattern as ch3's 杉皮蕈). Without one, 雲歸 says the 府城藥鋪 might sell them, and **府城藥鋪 now stocks 七彩靈蕈** (120). Guide ch06 updated (section + shop table). |
| **Test** | `mush`: no 靈蕈 → step on the patch → hint, nothing recorded → walk back to 府城, buy at 藥鋪 → return → step on the patch → eat → recorded. |
| **3D** | `3d_mush`: the glow object is active under 靈視 in the 3D view. |
| **Remaining** | none. |

Other ch6 extras (赤崁樓燈謎, 大天后宮月老, 孔廟硯台) are not quests or 心燈; they are covered by
`tools/test/chapters/ch6.test.js` and listed in the guide as 「府城黃昏是最後的自由時間」.

## Chapter 7

### 老吳的鹽 (`q_ch7_salt`, no 心燈)

| | |
|---|---|
| **Start** | Buying 粗鹽 (10) at 老吳's 山腳交易寮 (阿里山古道 10,38) starts the quest. |
| **Steps** | carry it to 鄒族大社 → a woman by the millet racks (10,14 or 21,26) → 愛玉凍 ×3. |
| **Issues found** | The quest only appears *after* you buy a 10-文 material among 12 shop items, and nothing told the player to buy it. The note in `tools/test/chapters/ch7.test.js` injects the salt (`G.Inv.add('c7_salt')`), so this was never tested as a player. |
| **Fixed** | Before his shop choice, 老吳 now says 「上山的話，帶一包粗鹽去吧。山上的人家煮飯都用得著，送給部落的阿姨，她們會很歡喜。」 (until the quest starts). English in `en_ch7.js`; guide ch07 updated. |
| **Test** | `salt`: buy from 老吳 through his shop → quest stage 0 → bear → tribe → talk to the woman (she wanders; the driver re-aims like a player) → done, 愛玉凍 ×3, salt gone. |
| **Window** | Named by the 玉山 upper-gate prompt while open (test `warn`). |
| **Remaining** | none. |

### 心燈「霧中的獵刀」 (`q_ch7_pasuya` → `lantern_tsou_hunter`)

| | |
|---|---|
| **Start** | First night: talk to Voyu's mother → 「在火塘邊休息」 (Voyu tells of Pasuya). Morning objective: 「天亮了。和 Voyu 說話，再往北邊的神木林」 → Voyu (33,22) asks you (stage 0). |
| **Steps** | 神木林 west (6,23): the fallen log (visible object; 調查) → 紅纓 moves it → 霧谷: three 「微光」 at (10,29), (4,32), (10,35) (drawn glow + light, only while the quest is at stage 0) → the third gives the cap & knife (stage 1) → back to Voyu's house → the mother → cutscene → 心燈. |
| **Rewards** | 心燈, 小葫蘆, 烤山肉 ×3 — verified. |
| **Clues** | Voyu names 「神木林西南邊」, the quest log repeats it, the log is a visible object, the glimmers glow and cast light. |
| **Window** | 玉山 「繼續往上走」: unstarted → 「1 盞心燈未點亮」; started → named (test `warn`, which also showed 再等等 steps back). |
| **3D** | `3d_valley`: the three glimmer lights are present in the 3D view (screenshot `ch7_3d_valley`). |
| **Issue found / fixed** | After Voyu's request the on-screen objective still read 「天亮了。和 Voyu 說話，再往北邊的神木林」, and after the delivery it stayed on 「把皮帽和獵刀帶回 Voyu 的家」. It is now 「到神木林西南的霧谷，替 Voyu 看一看」 on accepting, and after the delivery it moves on to the 雲海 / 玉山 objective. English in `en_ch7.js`. |
| **Remaining** | none. |

### 心燈「燈母祠的壁畫」 (`q_ch7_murals` → `lantern_lamp_murals`)

| | |
|---|---|
| **Start** | Reading any mural in 燈母祠 (上殿 (4,17), (11,17), (26,17)). |
| **Steps** | 3 murals in 上殿 → 五行燈 (main puzzle, order from the 春 inscription) → 下殿 3 murals ((4,17), (11,17), (26,17)) → 心燈 on the sixth. |
| **Clues** | Murals are wall objects with a 「壁畫」 label. |
| **Window** | The big door: with murals unread 雲歸 stops you once; afterwards 「推開巨門」 → the shared prompt names 燈母祠的壁畫（心燈）, 再等等 stays (tested). |
| **Remaining** | none. |

### 雲歸的蕈譜・雲芝 (`q_tuanzi_mush`)

`hint: true` tag 「調查」 on a `mushroom_harvest` object among glowing mushrooms (8,20) in 雲霧林, no 靈視 needed.
PASS; the tag is drawn in 3D too (`3d_yunzhi`).

## Chapter 8

### 心燈「北港的香客」 (`q_ch8_pilgrims` → `lantern_beigang_pilgrims`)

| | |
|---|---|
| **Start** | Automatic at the 逆潮 (8-3a, `ch8_surge`). |
| **Steps** | 北港溪口: walk into the four pilgrim zones (each = one guard battle) → after three, 阿福 appears at the river mouth (auto battle) → all five saved before the tide gauge reaches 8 → 河口 百手 → dawn at 朝天宮 → 心燈. |
| **Clues** | The river intro lists the places (北橋頭、翻倒的牛車、沙洲、河岸小巷) and the tide rule; 添壽伯 repeats them; each pilgrim is a visible NPC with visible guards; the gauge is on screen. |
| **Result** | PASS walking from the chapter start: saved order ①③④(⑤)② ended at tide 4 of 8. 心燈, 媽祖餅 ×5. |
| **Window** | The tide (on-screen gauge); failure has its own scene and no 心燈 (`tools/test/chapters/ch8.test.js` `tide`). |
| **Remaining** | none. The driver steps cell by cell without running frames in between, so the three roaming groups of the drowned did not get a chance to chase; a real player has 3 spare battles for them (guide: 「全部閃開」). |

### 心燈「蚵殼阿嬤」 (`q_ch8_oyster` → `lantern_oyster_grandma`)

| | |
|---|---|
| **Start** | 安平 west beach (8,21), before the 觀潮台. Answer 「阿嬤，您不傻。」 (紅纓 hints just before: 「阿嬤要的不是安慰，是一句實話吧。」). |
| **Steps** | answer (stage 0) → main story: 弟子 ×2, 阿興伯, 舊城, sluice, 觀潮台 → dawn (stage 1 「觀潮台的燈熄了。回去看看阿嬤。」) → talk to her → 心燈. |
| **Rewards** | 心燈, 虱目魚粥 ×5 — verified. |
| **Issues found** | (a) Nothing in 安平 pointed at her: the arrival scene shows the 長明宮 disciple and a waiting relative, and the objective sends you north to the 小廟. The quest can only start before the 觀潮台. (b) At dawn the objective said 「與陳伯一起…往南出發」 even with her quest open (only the prompt at 陳伯 caught it). |
| **Fixed** | (a) The 安平 arrival now pans to the beach: 「西邊的海灘上，一位剖蚵的阿嬤守著一顆大石頭。石頭上，坐著一個渾身濕透、一動也不動的老漁夫。」 / 星河「……那個人，也是「走回來」的嗎？」 (b) Dawn objective: 「先去海邊看看蚵殼阿嬤，再與陳伯從安平東邊的路往南出發」 when her quest is open. English in `en_ch8.js`; guide ch08 updated. |
| **Window** | Tested (`warn`): never talked to her → the 舊城→觀潮台 warp counts 「1 盞心燈未點亮」, 再等等 stays; then back via the courtyard 潮信石 (channel 1 is flooded after the sluice), start her quest, 觀潮台, dawn → 陳伯 「出發，往南」 names 蚵殼阿嬤（心燈）, 再等等 stays in chapter 8. |
| **Remaining** | The wrong answer 「他會想起來的。」 loses the 心燈 for good; it is a choice hint (紅纓's line), as documented in `points_of_no_return.md`. |

## Points of no return — coverage

All windows in `docs/qa/points_of_no_return.md` for chapters 6–8 were exercised: 林伯 「開始吧」 (ch6), 鹽水客棧
「休息到天亮」 (ch6), 玉山 upper gate (ch7), 下殿巨門 (ch7), 觀潮台 warp (ch8), 陳伯 departure (ch8). Each names
the open quest or counts the unstarted 心燈 as documented, and 再等等 really keeps the player before the point.

## Test runs

- `node tools/test/sidequests/ch6.side.js`: 6/6 PASS (ayi, ayi_warn, linto, mush, 3d, 3d_mush).
- `node tools/test/sidequests/ch7.side.js`: 7/7 PASS (salt, pasuya, warn, mush, murals, 3d_valley, 3d_yunzhi).
- `node tools/test/sidequests/ch8.side.js`: 3/3 PASS (pilgrims, oyster, warn).
- `node tools/test/unit.js`: 64 passed. `node tools/test/validate.js`: 0 errors (15 warnings, about chests behind
  story-gated passages such as the 霧谷 log and the 舊城 sluice. These are reachable in play: the side-quest runs
  open the 霧谷 chest area and the sluice route).
- `tools/test/chapters/ch6.test.js --only main,ayi,mush,sweep`: 4/4 PASS. `ch7.test.js`: 63/63 checks PASS.
- `tools/test/chapters/ch8.test.js`: main, oyster_b, npcs PASS. **`tide` FAILS (Game Over on beigang_river)**, but it
  fails identically with the original `ch8_tide.js` (commit 2b451ea), so this branch did not cause it. It is a test-setup issue
  (no gear, roaming drowned / 百手 at Lv31) and is left for a separate fix.

## Remaining concerns

- **3D, 潮音蕈**: under 靈視 the glow on the wet sand is partly hidden by the pandanus foliage in the 3D view
  (screenshot `ch6_3d_mush`). The new non-靈視 line on the patch makes the spot findable regardless.
- **霧谷 微光 (ch7)**: glimmers 1 and 2 have no object on the cell, only the drawn glow and a light. They are flavour;
  the required third one sits next to a dead tree, and the guide gives all three coordinates.
- **蚵殼阿嬤's wrong answer** loses the 心燈 by design (choice hint only).

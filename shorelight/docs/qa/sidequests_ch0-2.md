# Side quests & 心燈 — chapters 0–2 (QA pass)

I played every side quest and 心燈 of 序章, 第一章 and 第二章 from the chapter start, the way a player can. The goal
was to show that each one can be found, played and completed. I also treated any required step with no clue as a bug.

**How it was played.** The scripts are `tools/test/sidequests/ch{0,1,2}.side.js`. They share a driver,
`tools/test/sidequests/lib.js`, and each run prints PASS/FAIL per quest.

- **Start and renderer:** every run starts from `?debug&startch=N` on the 2D renderer.
- **Walking:** the driver walks a BFS path one tile at a time with `G.Debug.stepOn`, so every touch event or warp on
  the way fires. It skips warp and touch-event cells that are not the target.
- **Interacting:** it presses the real Z key in front of NPCs and events, through `MapScene.findInteract`.
- **No state injection:** the tests never write a quest flag, item, stage or variable.
- **Help the tests do get:** the shared battle bot on easy, the chapter tests' level raises before bosses (each one is
  printed in the output), and the cat flags from chapter 1 on the ch2 start URL, as `ch2.test.js` does.
- **Shortcuts:** the main-path beats between quest steps use the chapter tests' shortcuts:
  - ch1, 雞籠 → night raid: `G.Debug.talk` / `stepOn`;
  - ch2, the maze loop exits: `stepOn`.
- **Eating a 七彩靈蕈:** the script does exactly what the 物品 menu does for a `use.vision` item.
- **Waiting for 靈視 to wear off:** the game is fast-forwarded with the main loop's own update calls.

**3D spot check.** `tools/test/sidequests/spot3d.js` checks every visual clue with `?r3lite`. Screenshots go to
`tools/test/out/side_3d/`.

**Results** (all PASS):

| Script | Runs | Time |
|---|---|---|
| `ch0.side.js` | 1/1 | ~1 min |
| `ch1.side.js` | 2/2 | ~3.5 + 7 min |
| `ch2.side.js` | 2/2 | ~5.5 + 7 min |
| `spot3d.js` | 4/4 | |
| `chapters/ch0.test.js` | 5/5 | |
| `chapters/ch1.test.js` | 6/6 | |
| `chapters/ch2.test.js` | 3/3 | |
| `unit.js` | 64 passed | |
| `validate.js` | 0 errors | |

`validate.js` gives 15 warnings, the same as before this pass. The ch0–2 warnings are spots that only open later,
through terrain the scripts change or 靈視 (the static reach check can't see those). There were no console errors and
no soft-locks.

## 序章　夢 (ch0)

The prologue has no side quests, no 心燈 and no chests. The four drifting souls are flavor only.

| | |
|---|---|
| **Content** | 4 drifting souls (dialogue only), lamps |
| **How to start** | Walk up to each soul (each has a `對話` prompt) |
| **Steps** | soul A by the start → light lamp 1 (tutorial battle) → lamps 2 and 3 rebuild the bridge → souls B and C on the cloud terrace; C follows after the second talk → soul D on the north bridge |
| **Result** | PASS: all four reachable on foot, first and repeat lines, the child's soul follows. No quest opened, no 心燈 lit, clean hand-off to ch1 |
| **Issues found / fixed** | none |
| **Remaining concerns** | none |

## 第一章　九份燈火 (ch1)

Time of day drives availability: P1 清晨 → P2 正午 → P3 午後 → (黃昏 / 子夜: side quests paused) → P5 翌晨.

### 心燈①　阿土伯的懷錶 (`q_atu_watch`, lantern `xd_atu_watch`)

| | |
|---|---|
| **How to start** | Beat 工頭魂 in the gold-vein hall (mine_2); 阿土伯's ghost asks for the watch and says where it is: 「上面那層，往東走，風很大的那條……『正』字，一劃、兩劃、三劃」. Finding the watch first also works. |
| **Steps** | mine_1: switches A=東 B=東, push the cart, east rubble opens → ladder in the east room → mine_2 west branch. The wind tunnel pushes you back (「得先把牆上的燈點起來」). Light the wall lamps in 正 stroke order 一 → 丅 → 下 (wrong order resets; after two misses 星河 recalls the hint). The cave-in room has the 便當盒 and the watch in the crack. Deliver to 阿土嬸: in her house in P3, outside her door in P5. |
| **Result** | PASS in P3 (run A, with one wrong lamp order first) and in P5 (run B: the mine re-entered the next morning, delivered outside). Rewards: 心燈, 麥芽糖 ×5, quest closed. |
| **Issues found / fixed** | **Bug (discoverability):** the watch sat on a bare cave tile (3,23) with no visual; 「石縫裡有東西在閃」 was only text after pressing Z on that exact tile. **Fix:** a flickering white glint light on the spot while the watch is there, and a `hint` tag 「石縫」 on the event. Both checked in 2D and 3D. Guide step 4 updated. |
| **Remaining concerns** | none |

### 心燈②　阿黃回家 (`q_ahuang`, lantern `xd_ahuang`)

| | |
|---|---|
| **How to start** | Talk to 小金 by his door (九份 NE) in P3 or P5. 阿旺 also starts it. |
| **Steps** | 阿旺: 「阿黃是阿土伯的狗！」 (he wants a witness) → 阿土嬸 (in her house in P3, outside in P5) → walk to 小金's door → scene at the mine mouth → 心燈 → 小金的金仔石. |
| **Result** | PASS in P3 (run A) and in P5 (run B: started in P3, left open over the night). In P5 阿旺 gives his farewell gift first; the quest choice comes on the next talk. |
| **Issues found / fixed** | **Weak clue:** nothing pointed the player at 小金 after the mine; the objective only says to go back to 陳伯. **Fix:** 陳伯's first afternoon line now adds 「阿旺講，明仔載要把阿黃送去雞籠。小金哭甲……你有閒去他厝看一下。」 Every player hears it before they can choose to leave. Guide updated. |
| **Remaining concerns** | In P5, 阿旺's gift talk ends without the quest choice, so a second talk is needed. This is a minor flow quirk, left as is. |

### 支線　醒木失竊記 (`q_xingmu`, no 心燈)

| | |
|---|---|
| **How to start** | Enter 聽雨樓 again after delivering the lanterns (P1–P3): 黑糖 steals the 醒木. The objective names the store roof. |
| **Steps** | 黑糖 by the store 「抓住牠！」 → by the laundry poles (錦霞嬸's 內衫) → asleep on the 福德祠 steps: trade a 小魚乾 (阿水 gives one in P1/P2; 阿財商行 sells it) → 阿炳伯 (閒聊). |
| **Result** | PASS in P1 (run A). Rewards: 說書折扇, 烏龍茶 ×2, the bonus story. |
| **Issues found / fixed** | **Weak clue:** without a fish, the sleeping cat only said 「要是有什麼好吃的可以跟牠換就好了」, which doesn't say what or where. **Fix:** 星河 adds 「貓最愛小魚乾。阿財商行有賣……早上豎崎路的阿水叔身上也常帶著。」 Guide updated. |
| **Remaining concerns** | It can only be *started* in P1–P3. A player who never re-enters the teahouse before leaving for 雞籠 loses it; no 心燈 is at stake. 陳伯's departure warning (「九份的支線會暫停到明天早上」) covers quests already started. |

### Windows & points of no return (ch1)

| Point | Covered? |
|---|---|
| 出發去雞籠 (P3 → evening) | Two-step choice 「真的要出發了（九份的支線會暫停到明天早上）」. Checked in run B: both 心燈 stay completable in P5. |
| Leaving 九份 (1-24) | `S.pointOfNoReturn` with `q_atu_watch`, `q_ahuang`, `q_xingmu`. Run B: with both 心燈 open the log reads `open: q_atu_watch, q_ahuang`; 再等等 steps back north. With both done: `nothing open`, and the chapter ends. |

## 第二章　霧林天燈 (ch2)

平溪 time slots: Q1 arrival night → Q2 七月十六 day → Q3 天燈之夜 → Q17 七月十七 morning → Q4 八月初五.

### 心燈③　山中的呼喚 (`q_woodcutter`, lantern `xd_woodcutter`)

| | |
|---|---|
| **How to start** | 阿竹 in the 霧林・北 clearing (2-2), automatic. He gives the 銅鑼: 「看到我阿爸，就敲鑼，喊他的名字」. |
| **Steps** | 霧林・南: the side path east of the entrance ends at a row of illusion camphor trees; 阿山 and three 魔神仔 are spirits. With 靈視 the trees vanish → walk into the clearing → gong → 魔神仔頭 battle (a loss also continues) → 阿山 follows → reunion in 平溪, on arrival or later at his door. |
| **Result** | PASS. Run A: forest rescue with 靈視 worn off first, reunion on arrival. Run B: 阿山 left in the forest, rescued on the 16th, reunion at his door. Rewards: 心燈, 山蘇 ×2, 金創藥 ×2. |
| **Issues found / fixed** | **Bug (discoverability):** with 靈視 off, which is normal after the maze's 120 s, nothing showed that the dead-end side path matters. 阿山 and the 魔神仔 are invisible, and the only clue was the illusion trees' own 調查 text, which shows only when pressing Z on one of six look-alike trees. **Fix:** a one-time touch event at the end of the side path (`ashan_clue`). It fires while the quest is open, 阿山 is not found and 靈視 is off: 魔神仔 laughter and 「雞腿……」 behind the thicket, 白芷 notes the trees' shadows are wrong, 星河 suggests a 七彩靈蕈. Checked in 2D, and in 3D with and without 靈視. Guide updated. |
| **Remaining concerns** | A player who has eaten every 七彩靈蕈 must go back to the 七彩靈蕈林 (its clumps regrow on each visit) or get the rare drop from 蕈菇 enemies. Without 靈視, 「擠過去」 only leads back out of the clearing. |

### 心燈④　寄到了的信 (`q_letter`, lantern `xd_letter`)

| | |
|---|---|
| **How to start** | 周家 (平溪 west), Q2: 周老伯/周老嬸. Picking up the letter first also advances it. |
| **Steps** | 阿全 (廟埕 N) tells of the porter chased by a tiger → 虎姑婆's den, NW room above the first cage: the 擔子 → letter read on 天燈之夜 (周家 at the square; their lantern rises → 心燈); or, if the letter is not in the bag that night, read at 周家 on 八月初五 (dawn lantern → 心燈). The 擔子 back to 阿全 → 挑夫草鞋 + 150 文. |
| **Result** | PASS on both paths. Run A: the lantern night. Run B: den revisited on 八月初五 for the 擔子, then 周家 → dawn lantern. The bundle returned to 阿全 in both runs. |
| **Issues found / fixed** | **Weak clue:** nothing tied the porter's load to the den, and the 擔子 was one basket among several decorative ones (`interact` on an object, prompt only when facing). **Fixes:** 阿全's talk ends with 星河: 「被大老虎追……說不定擔子被虎姑婆拖回窩裡了。」 (+ 「周阿伯家阿興的信，說不定也在裡面。」 if the quest is open). The den intro adds 白芷: 「挑夫的擔子，會不會也被拖到這裡來了？」 once the hint was heard. The basket is now an action event `bundle` with `hint: true`, which shows the tag 「擔子」. `ch2.test.js` now triggers `bundle` instead of interacting with the old basket object. Guide updated. |
| **Remaining concerns** | none |

### 支線　紅纓的廚房 (`q_hy_kitchen`, no 心燈)

| | |
|---|---|
| **How to start** | Automatic in 十分客棧 on the morning of the 16th (紅纓 in the party). |
| **Steps** | 竹筍 (平溪 NE bamboo trail, or the 虎姑婆 grove), 溪蝦 (阿溪 first, then 翻石頭; **Q2 only**), 山蘇 (霧林・南 SW corner, or 阿山's gift) → 月娘 cooks → 山產炒（焦）×3, 竹筍溪蝦湯 ×2. |
| **Result** | PASS (run B, every ingredient gathered by hand with the 山蘇 from the forest). In run A it stays open on purpose to check the warnings. |
| **Issues found / fixed** | **Weak clue:** the quest named the three ingredients but nobody said where they grow. The 山蘇 is back on the previous map, and the hint tags show only within 4 tiles. Nothing said the 溪蝦 is today-only. **Fix:** 紅纓 now says where each one is when the quest starts, and that the shrimp must be caught today. 月娘 repeats only the missing ones; on later days she says the river is too high. Guide updated. |
| **Remaining concerns** | none |

### Windows & points of no return (ch2)

| Point | Covered? |
|---|---|
| 虎姑婆 (2-15) | Warns when 紅纓的廚房 is open with no 溪蝦 (the shrimp is gone after the 16th). Run A: log `open: q_hy_kitchen`, 再等等 steps back, then 繼續. Run B (kitchen done): `nothing open`. 寄到了的信 is not lost here: the den stays open on 八月初五, as run B shows. |
| 阿河's boat (2-19) | Warns with `q_woodcutter`, `q_letter`, `q_hy_kitchen` and both lanterns. Run A: `open: q_hy_kitchen` only. Run B: `nothing open`. |

## Files changed

- `js/maps/ch1_jiufen.js`: watch glint and 「石縫」 tag; 陳伯's afternoon hint; the cat's 小魚乾 hint.
- `js/maps/ch2_mistforest.js`:
  - the `ashan_clue` touch event;
  - 紅纓's and 月娘's ingredient directions;
  - 阿全's and the den intro's 擔子 links;
  - the `bundle` action event with a hint tag (the basket object no longer has its own `interact`).
- `js/i18n/en_ch1.js`, `js/i18n/en_ch2.js`: English for every new line.
- `docs/guide/chapters/ch01.md`, `ch02.md`: the walkthrough steps that changed. Run `node tools/guide/build_guide.js`
  to regenerate `guide_zh.md/.html`; they are not rebuilt here, to avoid conflicts with the other QA branches.
- `tools/test/chapters/ch2.test.js`: triggers the new `bundle` event.
- New: `tools/test/sidequests/{lib,ch0.side,ch1.side,ch2.side,spot3d}.js`.

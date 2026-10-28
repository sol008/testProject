# Side quests & 心燈 — chapters 9–11 (QA pass)

Every side quest and 心燈 in chapters 9, 10 and 11 was played from the chapter start (`index.html?debug&startch=N`)
the way a player does: walking (pathfinding over real collision or `G.Debug.stepOn`), talking, inspecting, choosing
and fighting. No quest flag, item, var, stage or 心燈 was written by the tests. Visual finds were spot-checked in 3D
(`?r3lite`).

Reusable playthroughs (print `PASS <quest>` / `FAIL <quest> — reason`, exit 1 on any failure):

```bash
node tools/test/sidequests/ch9.side.js     # ~6–9 min  (--3d for the 3D spot-checks)
node tools/test/sidequests/ch10.side.js    # ~3 min
node tools/test/sidequests/ch11.side.js    # ~25 min, includes the 七仙蕈 chain and both endings
```

Help the scripts give, the same as the chapter tests: level boosts / heals before bosses and the shared battle bot
on easy. Each one prints a `[help]` line when it does.

**Discoverability rule used:** every required step needs a clue a player can follow. That can be an NPC line
pointing at the spot, a visible object or glint, a `hint: true` tag, or quest-log text. A bare action tile with
nothing drawn and nothing said counts as a bug.

## Chapter 9 — 王船南行

| Quest | How to start | Steps | Result | Issues found → fixed | Remaining concerns |
|---|---|---|---|---|---|
| 半屏山湯圓 → `xd_banpingshan` | After the night beach, talk to 阿秀 in the 金萬 courtyard (15,25) | 船夫阿水's ferry → 仙翁: pay one coin → crack → stone door → offering plate → 大肚貪鬼 → back in 旗後, 金萬 gives 1000 文 | **PASS** | Nothing pointed the player to 阿秀, who is about 16 tiles from where the morning starts → 阿全 now says she is crying in the 金萬 courtyard | — |
| 被風偷走的七個名字 → `xd_yueqin_names` (+ 歌詞殘篇) | 阿順伯's night scene on the east-gate wall | 落山風靈 (names ①–④) → ⑥ from the oar → first 思想起 with 5 names (殘篇 + 月琴弦護符, no 心燈 yet) → ⑤ from 潘家阿嬸 → ⑦ by plucking the string for the sand bridge → 阿順伯 again → 心燈 | **PASS** | **Soft-lock:** after the wind stops, the sand bridge collapsed during the ⑦ dialogue and stranded the party on a 5-cell strip → it now slides back to the west side. The gully hint was `once`, so the "use the string" hint could be lost → one hint per situation, plus a 撥弦 tag. With names still missing, nothing said where to look → 阿順伯 now names each missing spot | The ⑦ sparkle is drawn in the 2D ground layer; in 3D only its light shows (not spot-checked) |
| 燈塔守的家書 → `xd_lighthouse_home` | 湯姆 asks for his log pages when you first meet him (**new**) | 3 pages in 龍坑's side caves (before or after the 鰻王) → 湯姆 in the lamp room → 心燈 + telescope | **PASS** | The quest only began when a page was picked up, and nothing mentioned the pages until after the boss → 湯姆 now asks at the first meeting and, in the lamp room, says the rest are still in the caves. The pages sat in dark caves with nothing visible → uncollected pages now glimmer (checked in 2D and 3D) | — |
| 七仙蕈之六 潮汐蕈 (`mush_ch9`) | Quest started in ch3; ch9's start points the quest log at 龍坑 | Inspect the glowing mushrooms on the center coral (23,19), visible without 靈視 | **PASS** | Missable at 出航 with no warning → the 出航 prompt now names 雲歸的蕈譜 while 潮汐蕈 is uneaten. The guide wrongly called it a "spare" → all seven are required | No warning if the quest was never started in ch3 (by design: the set can't be finished then) |
| (main path) 王船廠 carts | — | — | PASS | Carts could not be pushed from their right half (the engine reads only the object's `w`) → `w: 2` | — |

**Windows:** 「出航・往東」 is the only point of no return. Before it, the 王船 sails back to 旗後, 東港 and 南灣,
and 龍坑 can be re-entered after the 鰻王. The warning names exactly what is open; 「再等等」 keeps you in the
chapter; with everything done it is skipped.

## Chapter 10 — 後山巡境

| Quest | How to start | Steps | Result | Issues found → fixed | Remaining concerns |
|---|---|---|---|---|---|
| 達悟家族的拼板舟 → `xd_tao_tatala` | Automatic on landing at 蘭嶼 | Sinan's rules → 抓住芋圓 (+1 trust) → reef path: both oars, rescue Kaswal (the figurehead is handed over) → Syapen 「準備好了」 → 潮病海蛇 → 安靜地看 → 心燈 (trust ≥ 3), 飛魚乾 ×5, 船眼護符 | **PASS** | The second oar (6,24) could not be picked up: its interactable half had no free side → `w: 2` on both oars (never a soft-lock, since the rescue hands over a missing oar). The 「安靜地看」 choice silently gives trust → 雲歸 now whispers a hint before it | The low-trust branch is covered by ch10.test.js, not the side script |
| 阿美族海祭 → `xd_amis_haiji` | Automatic on reaching the Amis village | Night coast: river mouth → 招魂 (20,25); reef shore → 招魂 (30,13); 大潮怨 → 招魂 (14,5) → dawn → watch the 海祭 (fixed camera) → 心燈, 阿里鳳鳳 ×3 (+ Kolas 的魚鉤 if done in one night) | **PASS** | The 招魂 spots were bare tiles marked only by a blue glow → `hint: true` 「招魂」 tags (checked in 3D). 雲歸 now points at spot B too | Not missable: sailing to 花蓮 requires the 海祭 |
| 寶桑海灘賽跑 | Talk to the runner in 寶桑 (30,16) → 比一圈 | Button-mash race → 快腿綁腿 + 卑南溪石 ×2 | **PASS** | **The warning came too late.** Sailing for 頭城 closes every southern port (陳伯 won't leave 頭城 before the 搶孤), but the only warning was later, at 阿坤 → there is now a prompt at 「出航 → 頭城」, with a line from 陳伯 | Autoplay always wins minigames, so losing the race is untested |
| 羅漢腳阿義 → `xd_luohanjiao` | Stay at the 頭城 inn until night → 阿義 under the 燈篙 (8,19) | Small boat to the 王船 → 陳伯 「請陳伯做燈籠」 → back ashore → hang it on the 燈篙 → 阿坤 「準備好了」 → 孤魂眾 → 心燈 | **PASS** | Nothing said 阿義 only appears at night → clues from the inn worker and from 雲歸 at the 燈篙 by day. The objective kept saying 「請陳伯做燈籠」 after the lantern was made → it now says to hang it. 阿坤's prompt named content that was already closed → it now covers only 阿義, and not at all once his lantern is hung | — |
| Drift crates / chests | — | 潮音笛 crate, 黑潮鱗甲 crate, 寶桑 chest, three coast chests, 洄瀾 chest | **PASS** | Four were missing from the guide's chest table → added | — |

Cultural content is unchanged. The only new 蘭嶼 line is 雲歸 telling the party to stand back and watch while the
family mends its own boat.

## Chapter 11 — 黑水溝・彼岸

| Quest | How to start | Steps | Result | Issues found → fixed | Remaining concerns |
|---|---|---|---|---|---|
| 石滬的缺口 → `lantern_penghu_weir` | 阿添伯 on the seawall (16,2), after the temple incense | Walk into 添家滬 (NE of the flats) and meet 阿湧 → back to 阿添伯 (「……那就算了」 doesn't advance) → he follows you to the weir → 心燈, 滬石護符 | **PASS** | — (clues: quest log, his 「東北爿」 line, soul-lights drawn in the weir). Also works after the 鎖魂將 | — |
| 海賊的寶藏 | Talk to 阿珠 (9,10) | Examine 塔公 (43,1); examining 塔婆 first gets a nudge from 紅纓 | **PASS** | — | — |
| 唐山客的平安信 → `lantern_tangshan` | 陳伯's helm option 「暗流裡有人在唱歌」, once the 黑水溝海圖 is in the bag | Write the letter → after 無光之霧, up the glowing path past 蘇婉 → 唐山阿婆 at the jetty → 心燈, 唐山銅錢 | **PASS** | 阿木伯's 無光之霧 cameo never played: it waited for his lantern, which is only lit later on the far shore → it now plays once the letter is written | — |
| 她的記憶 → `lantern_baizhi_memory` | The 5F echo lamp | Six drifting glows; the two shy ones hop away until 「麻糬，去！」 → 心燈, 憶燈 | **PASS** (one lamp left until after the 千年燈塔守: still collectible) | The guide said "missable before the boss" and "one shy lamp" → corrected to "before climbing to the top" and "two" | The glows are small and subtle in 3D |
| 七仙蕈之七 玄武蕈 → completes 雲歸的蕈譜 | Chapter start points the quest log at the 石滬灘 | Chest (7,12) gives 七彩靈蕈 → examine the basalt column (7,7) → 7/7: 七色蕈鈴 + 萬色符, quest closed | **PASS** | The column had no visual and only answered with 靈視 on, among nine identical columns → there is now a no-靈視 clue (麻糬 sits in front, a glimmer), an offer to eat a 七彩靈蕈 (same as ch3's 杉皮蕈), and a 靈視 glow. Not covered at 出航 → the prompt now names 雲歸的蕈譜 | — |
| (main path) Lighthouse climb | — | — | PASS | **Soft-lock of the whole finale for a walking player:** on every tower floor the up-stairs (11,3) sat on a wall tile, so walking up stopped at (11,4). ch11.test.js teleported past it → that cell is now floor | — |

**Windows:** all three points of no return were walked into. 澎湖 出航 names 石滬・寶藏・蕈譜. 無光之霧 counts the
溺魂暗流 lantern when 唐山阿伯 was never met. The 5F stairs name 她的記憶. 「再等等」 keeps the player in place each
time, and with nothing open there is no prompt.

## 七仙蕈 (`q_tuanzi_mush`, `vars.tuanzi_mush`) end to end

Each mushroom was picked the player's way on its own map, in one continuous save. Only main-story preconditions
were set (`ch3_yungui_join`, `ch5_enter`), plus 七彩靈蕈 bought as from a shop. The quest was started by talking to
青草阿伯. The flags those pickups wrote (`mush_1`, `mush_ch4`–`mush_ch7`, `mush_ch9`, counter 6, stage 9) were carried
into a fresh `startch=11` game, which is what a chapter-10 save holds.

| Ch | Mushroom | Where | Clue | Result |
|---|---|---|---|---|
| 3 | 杉皮蕈 | 剝皮寮 (36–37,2), night | Quest log + 靈視 glow; examining offers a 靈蕈 | pass |
| 4 | 風穴石耳 | 風穴 (37,2), behind a 靈視-only gap | Quest log only, **no visual object** | pass (gap noted below) |
| 5 | 憶蕈 | 洛家 (11,4) | Quest log + visible glow | pass |
| 6 | 潮音蕈 | 林投林 (22,21) | Quest log + 靈視 glow | pass |
| 7 | 雲芝 | 雲霧林 (8,20) | Quest log + glow + hint tag | pass |
| 9 | 潮汐蕈 | 龍坑 (23,19) | Quest log + visible glow; 出航 warning (**new**) | pass |
| 11 | 玄武蕈 | 石滬灘 (7,7) | No-靈視 clue + glow + 出航 warning (**new**) | pass → quest completes |

## Endings

- There are exactly **28** distinct 心燈 ids the game can light (`S.lantern(...)` across ch1–ch11). Chapters 9–11
  alone hold 9 (3 + 3 + 3), so the side content makes 14 easy to reach.
- The ending is chosen by `G.Lanterns.count() >= G.Lanterns.THRESHOLD` (14) (`ch11_farshore.js`, 燈心). From the
  pre-finale save, exactly 13 lanterns gives 彼岸 and exactly 14 gives 千燈. Both reach the title with no console
  errors. A full run with all 28 also ends in 千燈.
- All 28 lantern ids have both a 無光之霧 cameo and a 全島的燈 entry, and each rendered during the run. The one that
  never played (阿木伯's cameo) is fixed above.
- For the endings run, lanterns from chapters 1–8 were pre-seeded as carry-in, and ch11's own lanterns were earned
  by play.

## Points of no return

`docs/qa/points_of_no_return.md` is updated:
- ch9 出航 now also covers 潮汐蕈.
- ch10 has a new 「出航 → 頭城」 row, and 阿坤's row is narrowed to 阿義.
- ch11 澎湖 出航 now also covers 玄武蕈.
- There is a new choice-hint row for 「問他船是怎麼造的 / 安靜地看」.

## Remaining concerns (outside chapters 9–11 or untested)

- **ch4 風穴石耳** has no visual object, only quest-log text (a separate task is queued for it).
- **Engine quirk:** Z only reacts on an object's `w × h` cells, not on the size of its art. Other chapters may have
  2-wide objects with an unusable half; ch9's carts and ch10's oars were fixed locally.
- The side scripts teleport across ch10's falling-rock ledge (main path) rather than timing it.

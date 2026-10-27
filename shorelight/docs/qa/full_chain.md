# Full-chain playthrough QA — title screen → 序章 → ch1–11 → both endings

One continuous game in **one page**: **新的旅程** on the real title screen, no debug preset, 3D off
(`localStorage.shorelight_settings = {"render3d":false}`), browser locale zh-TW, headless Chromium, one browser.
Each chapter starts from the state the previous one actually left: party, levels, equipment, inventory, gold,
flags, quests, 心燈 and the cats. Harness: [`tools/test/full_chain.js`](../../tools/test/full_chain.js).

**Verdict.** The game plays end to end with carried state. It reaches 「千燈」 and then 「彼岸」 from the same
pre-finale save. There were **0 page errors, 0 console errors/warnings and no `G.lastError`** in 50 min of play,
every chapter boundary was sane, and saves survive reloads in a fresh page.

There is **one wall: 潮怨・百手 (ch8)**. The carried party cannot beat it, not even at the chapter test's own Lv31.
It only gets through with the free 北港 shop gear that ch8.test.js equips (worth 14,400 gold, against 1,983 carried).
Chapters 8–11 below were played with that documented assist.

## How the run plays

- **Driver code is reused, not rewritten.** Each `tools/test/chapters/chN.test.js` is loaded as source with its
  trailing runner cut off. Its critical-path functions run against the chain's page through a fake `browser`:
  `testTitle`/`testCritical` (ch0–2), `mainPath` (ch3, ch4, ch10), `SEGMENTS` (ch6, ch8, ch11) and `seg_*` (ch9).
  For ch5 and ch7, whose critical path is written inline in the runner, the exact source sections between fixed
  markers are compiled in the driver's own scope. `goto`/`newContext` are no-ops, so no `?debug&startch` preset is
  ever loaded.
- **Every `page.evaluate` of a driver passes a firewall.**
  - **Blocked and logged:** calls that inject state the carried run might lack (flags, vars, items, gear, gold,
    quests, party, 心燈, difficulty).
  - **Level boosts** (`ensureLevel` / `addExpTo`) are logged as *assumed Lv X vs carried Lv Y*. They are applied only
    in assist mode.
  - **Heals pass through.**
- **Allowed help, all logged:**
  - difficulty easy with the shared player bot [`tools/test/lib/battlebot.js`](../../tools/test/lib/battlebot.js),
    as in every chapter test;
  - a heal before bosses;
  - the expected start level at each chapter start. This is `G.Data.progression[ch].lv[0]`, the table
    docs/BALANCE.md uses. It was never needed after the ch8 fix, because the game floors itself.
- **Shopping** (the player's own gold, not a help): at each chapter start the party buys, with the gold it really
  carries, the best gear per slot from the shops reachable by then. The pools are the cumulative ones in
  `tools/sim_story_fights.js`, the same pools BALANCE.md was tuned with. Every purchase is logged.
- **Assist (`--assist-from ch8`), applied from ch8 on only:** the chapter tests' own assumptions, i.e. their
  mid-chapter level boosts and the free shop-gear kits they equip. It never lets through flags, quests, 心燈, vars or
  gold.
- **Saves.** At each boundary the run saves with `G.Save.write` (slot 1) and exports the save to
  `<out>/saves/chNN.json`. `--from chN` loads it in a fresh page through **title → 讀取進度 → slot**. In the run, the
  ch6 boundary save was reloaded in a fresh page mid-game and play continued from it.
- **Watchdog.**
  - A timestamped progress line every 30 s.
  - Fail fast on Game Over, `G.lastError`, or 3 min without progress (map, position, scene stack, dialogue, battle
    state or flags).
  - On a failure it dumps `G.Scenes.names()`, the map, the busy state, the last dialogue, the party and (`--trace`)
    the last 60 battle HP lines.

```
node tools/test/full_chain.js --assist-from ch8 --trace --out <dir>     # the run below (≈ 50 min)
node tools/test/full_chain.js --from ch8 --assist-from ch8 --out <dir>  # resume at a boundary save
node tools/test/full_chain.js --check                                   # drivers load & compile (no browser)
```

Run artefacts: in the session scratchpad `chain/` directory. It holds `ch00_start_title.png` … `ch11_start.png`,
`ch11_branch.png`, `ending_true_title.png`, `ending_normal_title.png`, `saves/ch01…ch11.json`,
`saves/ch11_branch.json`, `report_final.json` and the logs.

## Per chapter (final continuous run)

The entry state is taken at the first idle moment after the chapter's opening, before shopping or any help. The
opening applies the game's own level floor (see bug #3). (A) means assist mode.

| Ch | Result | Time | Entry: party Lv | Gold | Key items | 心燈 | Cats | Shopping (spent / had · full kit cost) | Help applied | Driver assumed vs carried |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 序章 | PASS | 45 s | 星河 1 (New Game) | 0 | 0 | 0 | – | – | easy + bot | – |
| 1 九份 | PASS | 260 s | 星河 2 | 33 | 0 | 0 | – | 30 / 33 · 120 | roaming enemies cleared by the driver | Lv4, 4, 5 before 工頭魂 / raid vs Lv2, 2, 3 |
| 2 霧林 | PASS | 205 s | 星河 白芷 5 | 849 | 4 | 0 | 芋圓 麻糬 | 800 / 849 · 1,160 | – | Lv9 before 虎姑婆 vs Lv5 |
| 3 觀音艋舺 | PASS | 209 s | 星河 白芷 紅纓 9 | 843 | 5 | 2 | ✓ | 720 / 843 · 1,020 | – | debug start lv=11 vs Lv9 |
| 4 竹塹 | PASS | 304 s | ×4 Lv13 | 1,074 | 8 | 3 | ✓ | 1,040 / 1,074 · 6,970 | – | Lv17 + free gear before 風魔 vs Lv13 + 2 bought weapons |
| 5 鹿港 | PASS | 268 s | ×4 Lv16 | 1,791 | 10 | 3 | ✓ | 1,790 / 1,791 · 9,510 | 怨婢 frozen during the mirror puzzle (driver) | Lv21 + 施家 gear before 怨宴 vs Lv16; flags `mush_1`, `ch3_mask_shard` not carried (not needed) |
| 6 府城 | PASS | 113 s | ×4 Lv19 | 3,190 | 13 | 5 | ✓ | 2,910 / 3,190 · 13,720 | stealth guards removed (driver) | Lv25 + gear kit + 6 續命散 + 4 還魂香 before 冥燈護法 vs Lv20 |
| 7 雲山 | PASS* | 203 s | 星河 紅纓 雲歸 23 | 2,344 | 14 | 6 | ✓ | 2,300 / 2,344 · 11,580 | – | 老吳's salt injected (blocked): 1 side check failed |
| 8 逆潮 | PASS (A) | 228 s | ×3 Lv27 | 1,740 | 16 | 8 | ✓ | 1,600 / 1,740 · 14,400 | **driver gear kit + Lv31 / Lv36** | strict: **wall at 百手** (bug #1) |
| 9 王船 | PASS* (A) | 280 s | ×3 Lv36 † | 3,228 | 18 | 10 | ✓ | 2,900 / 3,228 · 14,200 | – (already above every assumption) | segment levels 30–34 |
| 10 後山 | PASS (A) | 133 s | ×3 Lv37 | 9,498 | 24 | 13 | ✓ | 9,450 / 9,498 · 18,900 | driver gear kit + Lv40 / Lv44 | Lv40 at start, 44 before 石巨靈 |
| 11 + endings | PASS* (A) | 748 s | ×3 Lv44 | 4,915 | 29 | 16 | ✓ | 4,850 / 4,915 · 20,600 | driver gear kit + Lv46 / Lv48 | driver adds 13 心燈, `tuanzi_mush = 6`, gold ≥ 500 (all blocked) |

Total: **2,996 s (50 min)**, of which 序章 → ch7 was 26 min with no assist.

- † Ch9–11 entry levels are inflated by the ch8 assist (Lv36; ch9's table start is 30).
- PASS* means a driver check failed because the driver assumed injected state (bug #7). The ch9 failure was a
  harness artefact, fixed (bug #8); re-running ch9 from its boundary save: PASS, 0 failed checks.
- Key items per boundary are in `report_final.json` (e.g. ch2: 提燈 / 白芷的玉牌 / 斷掉的竹劍 / 引魂令). Cats:
  `mochi_joined` and `yuyuan_joined` are carried from ch1, and both cats follow on the entry map of every chapter
  from ch2 on.

**Boundary checks**, all chapters:

- `G.state.chapter` incremented by exactly one each time.
- 0 page errors and 0 console errors or warnings.
- Party records complete: no NaN, HP and MP within max, no unknown item, equipment or quest id.
- The previous chapter's main quest is done.

### Boss fights in the run, against docs/BALANCE.md

| Fight | Party Lv in the run | BALANCE.md Lv (sim win %) | Result |
|---|---|---|---|
| 工頭魂・金貴仔 (1-7) | 2 | 3 (93%) | win |
| 墨鴉 / 水鬼王 (1-19/20) | 3 / 4 | 4 (88%) | win / win |
| 虎姑婆 (2-15) | 5 | 8 (100%) | win |
| 石猴王 / 鬼面 (ch3) | 9 | 10 (100%) | win / win |
| 風魔 (4-15) | 13 | 16 (100%) | win |
| 怨宴 (ch5) | 16 | 19 (92%) | win, all four under 30% HP (run 1, in starting armour: **wipe**) |
| 疫聚 / 林投姐 / 冥燈護法 (ch6) | 19 / 19 / 20 | 21 / 22 / 23 | win (冥燈護法: 雲歸 left with 1 HP) |
| 黑熊精 · 心魔 ×2 · 無光之影 · 蛟 · 清虛 (ch7) | 23 | 24–27 (86–92%) | 6 wins |
| **潮怨・百手 (8-4)** | **27 strict / 31 with levels only** | **28 (89%)** | **wipe ×3 strict, wipe at Lv31**; win at Lv31 + driver gear |
| 洛青鋒 (8-6) | 36 (assist) | 29 | win |
| ch9 ×5, ch10 ×5, ch11 ×4 bosses | 36–46 (assist) | 31–43 | all wins |
| 夜玄 ×2 · 無相 ×3 (finale, both routes) | 48 (driver boost) | 44 | all wins |

Ch11 ran against the retuned ch11 bosses (commit c3c318b, which landed before the final run), so no ch11 re-run is
needed for that.

## Endings

The branch save was made in 一息界 once the light reaches the seat, right before the step that starts 燈心: slot 2,
`saves/ch11_branch.json`. At that point the party was 星河 / 紅纓 / 雲歸 Lv46 with **19 心燈** (threshold 14).

| Route | How | Result |
|---|---|---|
| **千燈 (true)** | continue from the branch | 11-27 reunion → 夜玄 ×2 → 夜念 → 無相 ×3 → `ending_true`, `cleared_true`, `game_clear`, credits → **TitleScene**. 230 s. 19 心燈 |
| **彼岸 (normal)** | reload slot 2 in a fresh page (title → 讀取進度), then the ch11 driver's `normal` segment | `ending_normal`, `cleared_normal`, `game_clear`, credits → **TitleScene**. 188 s. **The driver's removal of 16 心燈 was let through (FORCED)** — see bug #2 |

The 19 心燈 carried to the finale, with the source of each:

| Chapter | 心燈 | Source |
|---|---|---|
| ch2 | 樵夫 `xd_woodcutter`, 信 `xd_letter` | |
| ch3 | 椅仔姑 `lantern_yizigu` | main story |
| ch5 | 半邊井 `lantern_halfwell`, 福伯 `lantern_fubo` | |
| ch6 | 林投姐 `lantern_linto` | main story |
| ch7 | 獵刀 `lantern_tsou_hunter`, 壁畫 `lantern_lamp_murals` | |
| ch8 | 香客 `lantern_beigang_pilgrims`, 蚵殼阿嬤 `lantern_oyster_grandma` | |
| ch9 | 半屏山 `xd_banpingshan`, 七個名字 `xd_yueqin_names`, 家書 `xd_lighthouse_home` | |
| ch10 | 拼板舟 `xd_tao_tatala`, 海祭 `xd_amis_haiji`, 阿義 `xd_luohanjiao` | 拼板舟: main story, trust-dependent |
| ch11 | 石滬 `lantern_penghu_weir`, 平安信 `lantern_tangshan`, 她的記憶 `lantern_baizhi_memory` | |

Rows without a source are lantern side quests (`lantern: true` quests). All 19 came from the chapter tests'
critical-path drivers, which play most of the lantern side quests on the way. The count reached 14 in ch10 at 蘭嶼.

## Bugs and findings, by severity

### Fixed

| # | Where | What | Fix |
|---|---|---|---|
| 3 | `js/maps/ch8_tide.js` `G.Story.ch8` | The chapter-entry level floor was a hard-coded **25**. Every other chapter floors at its progression start (`ch4` 13, `ch5` 16, `ch6` 19, `ch7` 23, `ch9` 30, `ch10` 34) and the table's ch8 start is **27**. The ch8 test never saw it, because `?debug&startch=8` starts at 27. A party carried from ch7 (Lv23) arrived at 25, three below BALANCE.md's 百手 (Lv28). | Floor is now `G.Data.progression` ch8 `lv[0]` (27). Commit "ch8: chapter-entry level floor…". |
| 9 | `js/maps/ch9_south.js` 王船出港 (C9-08) | 王船舵, 王船帆 and 龍目 (key items) were given in the yard but never taken when they were fitted to the 王船. They sat in the key-item list through ch10 and ch11. | Taken at launch. 令旗 and 巡境圖 stay, because the 巡境 uses them. |
| 8 | harness | ch9's 擲筊 check counts every `minigame Jiaobei` line in `G.Debug.log` since page load. A continuous page still held one from an earlier chapter, so the check failed. | `full_chain.js` empties the test-only `G.Debug.log` at each chapter start. ch9 re-run: PASS. |

### Open (ranked)

1. **[S1, design gap] 潮怨・百手 (ch8) is a wall for a carried party.** BALANCE.md tunes it for Lv28 plus the best
   S8a shop gear (89%).
   - Strict (Lv27 after fix #3, easy, battle bot, gear bought with carried gold): **3 wipes in a row**
     (`--retries 2`). The trace shows the opening party-wide hit taking about 40% of max HP, and the party at
     0–49 HP by round 2 with the boss on 79%.
   - Lv31 (the driver's own `boost(31)`) without the shop gear: still a wipe, with the boss at 38% after the revive
     items run out.
   - It passes only with ch8.test.js's free kit (c8_liuguang / c8_jinxiang ×3 / 雲錦頭巾 / 綁腿 / accessories).
   - Root cause is gold, not level. The carried party has **1,983 gold at ch8** (1,740 after ch5–7 purchases in the
     final run); the S8a upgrades cost **14,400**. Across chapters the carried gold covers 15–60% of the gear
     BALANCE.md assumes: ch4 1,074 / 6,970, ch5 1,791 / 9,510, ch6 3,190 / 13,720, ch8 1,740 / 14,400,
     ch11 4,915 / 20,600.
   - BALANCE.md cross-checks *exp* against symbol enemies but not *gold*. A player who fights roaming enemies gets
     more of both; the chain skips them, as the drivers do. Needs a decision: more gold on the main path (story
     battles, chests, sellable drops), cheaper S8a gear, or tune 百手 for chapter-5–7 gear.
2. **[S2, design] Both endings cannot come from one late save.** The ending depends only on
   `G.Lanterns.count() >= THRESHOLD (14)`, and there is no choice at the finale.
   - With the critical paths the chapter tests define, the count reaches 14 in **ch10** and the finale has **19**.
   - So once a player has passed the threshold, no action is left that leads to 彼岸. The normal ending in this run
     needed the driver's lantern removal (FORCED, logged), exactly as ch11.test.js does.
   - Only 3–5 of the 19 are main story (yizigu, linto, tatala, plus haiji/pilgrims inside the main flow), so a
     main-path-only player gets 彼岸. That is the intended split, but it is worth knowing that even the "critical path"
     tests are deep into side content.
3. **[S2, finding] Levels come almost entirely from the chapter-entry floors.**
   - Story battles alone gave **≤ 1 level per chapter**: ch1 2→4, ch2 5→5, ch3 9→9, ch4 13→13, ch5 16→16,
     ch6 19→20, ch7 23→23.
   - The floors in each `G.Story.chN` (`ensureLevel`, which also heals fully) add 1–4 levels per chapter.
   - A main-path player therefore sits at the table's `lv[0]` for the whole chapter, while every boss is tuned at
     the top of its area (`lv[1]`): 怨宴 16 vs 19, 冥燈護法 20 vs 23, 清虛 23 vs 27, 百手 27 vs 28.
   - Ch1–7 still won every boss on easy with the bot and bought gear, so the deficit is survivable until ch8 (#1).
4. **[S2, test gap] The chapter tests prove less than their PASS suggests.** Every chapter test boosts the party
   above what a carried player has, and ch4/5/6/8/10/11 also equip free shop gear.

   | Ch | Assumed | Carried |
   |---|---|---|
   | 1 | 4 / 4 / 5 | 2 / 2 / 3 |
   | 2 | 9 | 5 |
   | 3 | 11 | 9 |
   | 4 | 17 | 13 |
   | 5 | 21 | 16 |
   | 6 | 25 | 20 |
   | 8 | 31 / 36 | 27 |
   | 10 | 40 / 44 | 37 |
   | 11 | 46 / 48 | 44–46 |

   `tools/test/full_chain.js` is the check that uses the real carried state.
5. **[S3] The 七仙蕈 side quest cannot complete from the critical paths.** `tuanzi_mush` is 2 at ch11, and 玄武蕈
   needs 6. ch11.test.js sets it to 6 (blocked here), so its 「七仙蕈全收集」 check fails in the chain. This is side
   content; the information is for the ch11 builder.
6. **[S3] Two side quests opened by main-path scenes stay open for the rest of the game:** `q_atu_watch` (ch1 mine)
   and `q_hy_kitchen` (ch2 inn). Expected for side quests, but they clutter the quest log for 10 chapters if
   skipped.
7. **[S4, driver assumptions] State the chapter drivers inject instead of playing** (all blocked and logged by the
   chain). None of these blocked anything in the game:
   - ch7: `G.Inv.add('c7_salt')`. 老吳's salt is a shop purchase; 1 side check fails.
   - ch6: `pets()` sets the cat flags (already carried) and `gear()` gives the kit.
   - ch11: `G.state.gold ≥ 500`, `tuanzi_mush = 6`, `G.Lanterns.add` ×13, and the 心燈 removal for 彼岸.
   - ch5: the debug start sets `mush_1`, `ch3_mask_shard`; ch5 passes without them.
8. **[info] Code changed under the run.** `js/engine/playstats.js` (a new `G.state.stats`) landed in WIP snapshots
   at 12:25–12:27, during the final run. The fresh page at the ch6 reload loaded it; the old one had not. That is why
   the reload compare reports `stats` as the only differing key. It is not a save bug: in run 2 the same reload was
   byte-identical (9,852 bytes). Ch6–11 of the final run therefore ran on that newer tree. The 王船 fix (#9) is
   newer than the final run; it was verified by re-running ch9 from its boundary save.

## Run history

| Run | Policy | Outcome |
|---|---|---|
| 1 | strict, no shopping | ch0–4 PASS. **ch5 wipe at 怨宴**, ×4 Lv16 in starting armour, 4,377 gold unspent. Shopping was added after this run |
| 2 | strict + shopping | ch0–7 PASS (ch7: 1 side check). **ch8 wipe at 百手**, Lv27 |
| ch8 probes | from the ch8 save: `--retries 2`, then `--assist` levels only, then `--assist` with driver gear | 3 wipes; wipe at Lv31; PASS → introduced `--assist-from` |
| final | strict ch0–7, `--assist-from ch8`, `--trace` | **all chapters + both endings, 50 min, 0 errors** |
| verify | `--from ch9` (boundary save, title load menu) after fixes #8 and #9 | PASS, 0 failed checks |

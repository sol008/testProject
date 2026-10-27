# Side quests & 心燈 QA — chapters 3–5

Goal: prove that every side quest and every 心燈 in chapters 3, 4 and 5 can be **found, played and completed by a real
player**, and fix what can't. Discoverability counts as a bug class: every required step must have a visible or
written clue (NPC line, visible object, glint, hint tag or quest-log text). Bare action tiles with no clue count as bugs.

## Method

- One playthrough script per chapter, each printing PASS/FAIL per quest:
  - `tools/test/sidequests/ch3.side.js`
  - `tools/test/sidequests/ch4.side.js`
  - `tools/test/sidequests/ch5.side.js`
- Each script starts from `index.html?debug&startch=N` (2D renderer for speed). The few exceptions are noted under each chapter.
- The game is then driven only the way a player can: walking (with on-foot reachability checks), talking, pressing Z on
  events, making choices and fighting with the test battle bot. Shop purchases are simulated because autoplay skips the
  shop UI; each one checks the item is on that shop's shelf and pays its price.
- No script sets a quest's own flags, items or stages.
- Each script checks that the quest starts, every stage advances and the quest completes; that rewards are given, the
  心燈 is lit (`G.Lanterns`) and the log entry closes; that there are no console or page errors and no `G.lastError`;
  and that the relevant point-of-no-return warning (`S.pointOfNoReturn`) covers the quest.
- Visual spot-checks in 3D (`?r3lite`, render3d on) for the 靈視 finds, glints and new hint tags.

## Summary

| Ch | Quest / 心燈 | Result | Fixed |
|---|---|---|---|
| 3 | 紅毛城的異鄉兵 (心燈) | PASS | quest log says where both keepsakes are; eating the mushroom at the grass picks the shell up at once |
| 3 | 阿蓮與阿德 (心燈) | PASS | — |
| 3 | 小梅與母親 (心燈) | PASS | 吳廟公 now points to 春婆 in 剝皮寮 |
| 3 | 頂下郊的兩個老人 (心燈) | PASS | 「八甲庄」 signboard at the ruins |
| 3 | 椅仔姑與花旦 (心燈) | PASS | — |
| 3 | 雲歸的蕈譜・杉皮蕈 | PASS | 雲歸 says where to buy 七彩靈蕈 |
| 4 | 嶺上松 (心燈) | PASS | — |
| 4 | 九降風裡的阿母 (心燈) | PASS | 紅纓 points back to 阿順伯 after the 城隍幻境 |
| 4 | 柿柿如意 | PASS | hint tags on the three clue spots |
| 4 | 擂茶課 / 紅纓's retry | PASS | 紅纓 says she'll relearn 擂茶 tonight |
| 4 | 山歌擂台・道士篇, 山歌竹笛 | PASS | — |
| 4 | 風穴石耳 (七仙蕈) | PASS | 麻糬/雲歸 clue on entering the chamber; 靈視-only hint tag |
| 5 | 半邊井 (心燈) | PASS | could be missed for good (inert touch strip): 井邊阿婆 / 泥水師傅 also start it; stage text names the witnesses |
| 5 | 顧門的福伯 (心燈) | PASS | his ghost no longer appears in the 冬至 cutscene after being skipped |
| 5 | 憶蕈 (七仙蕈) | PASS | hint tag; the inn warning names 雲歸的蕈譜 while 憶蕈 is unpicked |

Points of no return: the ch3 南門, ch4 歌薰門 and ch5 inn warnings were each exercised with a quest open: the
quest was named, 「再等等」 held, and there was no prompt when nothing was open. The ch5 row of
`docs/qa/points_of_no_return.md` was updated.

## Chapter 3 《觀音艋舺》 (`js/maps/ch3_guanyin.js`)

Script: `node tools/test/sidequests/ch3.side.js` (about 8 min). It has three sessions:

- **full**: from `?debug&startch=3`, it plays the first night, then 紅毛城, then the main path up to 艋舺, then every 艋舺 side quest, the show and the south gate.
- **window**: the 「先睡覺」 path.
- **ponr**: the south gate with a quest left open. This session starts at a 艋舺 debug map with main-story flags only; the quest itself is started in play.

Last run: **9/9 PASS**, 0 console or page errors. Every step walks on foot: a BFS over the real collision checks that the spot is reachable, then the script presses Z through the map's own `findInteract()`. Shop purchases are checked against the shopkeeper's real stock list.

3D spot check (`?r3lite`, render3d on, 靈視):
- the scallop glint by the 紅毛城 graves is visible;
- the 杉皮蕈 glow on the 剝皮寮 fir pile is visible;
- the new 八甲庄 sign stands next to the two ghosts.

### 紅毛城的異鄉兵 (`q_tamsui_soldiers`, 心燈)
| | |
|---|---|
| Start | First night: talk to 阿玉 at the 淡水客棧, choose 住宿, then 「去紅毛城看看」. Walk up the stairs to 紅毛城; the ghosts' cutscene starts the quest. |
| Steps | 1. **扇貝殼**: the grass by the nameless graves at the NW corner of the fort; needs 靈視 (七彩靈蕈 from 林記雜貨). 2. **小風車**: 阿狗仔 on the waterfront. Buy 紅紙・竹篾・蠟燭 at 林記雜貨, then the lantern mini-games. 3. 漁夫阿財 gives 水燈座 ×2. 4. At the inn choose 「等到夜裡」, return to the fort and talk to 迪亞哥. Release scene at sunset. |
| Result | **PASS** (50 checks). Played across two nights: scallop on night 1, sleep, 阿財 by day, 「等到夜裡」, release. Rewards: 心燈 lit, 異鄉的銅釦, quest closed, keepsakes taken. |
| Issues fixed | (a) The quest log only said 「找到扇貝殼、小風車」. Stage 2 now says where both are: the grass by the nameless graves (needs 靈視), and the windmill carried down the hill by a bird, maybe now in a child's hands. Before this, the only windmill clue was in a *repeat* talk with 彼得. (b) Eating a 七彩靈蕈 at the grass used to open 靈視 and stop, so the player had to search again with nothing saying so. Now the shell is picked up right away. (Re-check of the playtester's report: Diego's line, the brighter glint and 白芷's 「雜貨店有賣」 hint all show; verified in 2D and 3D.) |
| Window | Only the first night starts it. 白芷's line 「那個鼓聲，好像只有今晚會響」 comes right before the choice. The **window** session checks that 「先睡覺」 never starts the quest and that 「等到夜裡」 is then never offered (PASS, 7 checks). Once started, the quest can be finished on any later visit by ferry until the 南門 departure. |
| Remaining | The missable is by design: it costs one 心燈, the hint is subtle, and there is no confirmation prompt. |

### 阿蓮與阿德 (`q_alian`, 心燈)
| | |
|---|---|
| Start | 阿蓮 at the 碗粿 stall by 北渡頭. 吳廟公's opening scene and the toast in 3-11 both mention her. |
| Steps | At night take the north road (8–9,0) to 舊渡頭 → boss 河伯怨靈 → back to 阿蓮 → choose 「他一直在河邊救人……」 → release on the dock. |
| Result | **PASS** (16 checks). Rewards: 心燈, 阿德的斗笠, 碗粿（少鹽）×5, quest closed; the 舊渡頭 chest opened. The wrong answer can be retried (covered by `ch3.test.js`). |
| Issues | None. The north road explains itself by day and before the quest. |

### 小梅與母親 (`q_xiaomei`, 心燈)
| | |
|---|---|
| Start | 小梅's ghost by the dragon pillar in 龍山寺 (visible at dusk and night). |
| Steps | Find a mother with magnolia in her hair: 春婆 at the 玉蘭花 stall in 剝皮寮 → 「請春婆一起去龍山寺」 → reunion in the temple. |
| Result | **PASS** (13 checks). Rewards: 心燈, 玉蘭香囊, quest closed. |
| Issues fixed | 小梅 only describes a magnolia in her hair and a lullaby, and nothing in the game pointed to 剝皮寮. **吳廟公** now says, while the quest is open: 「剝皮寮賣玉蘭花的春婆，頭上插了一輩子玉蘭花。她每日黃昏都來上香。」 |
| Remaining | — |

### 頂下郊的兩個老人 (`q_feud`, 心燈)
| | |
|---|---|
| Start | At night, the two ghosts in the 八甲庄 ruins (SE of 艋舺). |
| Steps | Ask 吳廟公 (龍山寺), the 老茶店 owner (剝皮寮), 阿興 (土地公廟) and then his mother 秀琴 (阿興家). Talk to the ghosts again → 阿興家 scene → reconcile (optional 3-turn fight first). |
| Result | **PASS** (23 checks). Rewards: 心燈, 同船米酒, quest closed. |
| Issues fixed | The ruins had no name on the map; only dialogue said 「八甲庄」. Added a **「八甲庄」 signboard** at the ruins' NW corner (i18n *Bajia Village*). The quest log and the ghosts' repeat line already list who to ask. |
| Remaining | — |

### 椅仔姑與花旦 (`lantern_yizigu`, 心燈, no quest entry)
| | |
|---|---|
| Start | Main path 3-12 (戲棚後台): choose 「問問秀蘭姑娘自己怎麼想」. |
| Steps | Paper-men fight → inn rest (→ 八月十五) → 洪班主 「等到天暗」 → 中秋 show. |
| Result | **PASS** (13 checks). 心燈 lit after the show. |
| Window | The talisman choice loses it. 白芷's hint 「貼了符，她就永遠看不到這齣戲了」 is shown (checked). |
| Remaining | — |

### 雲歸的蕈譜・杉皮蕈 (`q_tuanzi_mush`, no 心燈)
| | |
|---|---|
| Start | 青草阿伯 in 青草巷 (after 雲歸 joins). |
| Steps | At night, the fir pile at the east end of 剝皮寮, with 靈視. |
| Result | **PASS** (9 checks). `mush_1`, stage 2, toast. |
| Issues fixed | Investigating at night without a 七彩靈蕈 gave no hint on how to get 靈視. Now 雲歸 says 「青草巷的阿伯有賣七彩靈蕈」. |

### 南門 point of no return
| | |
|---|---|
| Result | **PASS** (8 checks). With everything done there is no prompt. With 阿蓮 started and 小梅/頂下郊 never started, the shared warning names `q_alian`, counts `lantern_xiaomei` and `lantern_feud`, and 「再等等」 keeps the player in 艋舺. The soldiers' quest is correctly not counted once its first night has passed. |

## Chapter 4 《竹塹風起》 (`js/maps/ch4_hsinchu.js`)

Playthrough script: `node tools/test/sidequests/ch4.side.js` (one session from `index.html?debug&startch=4`, 2D renderer,
~400 s). It walks, talks, presses Z only on events that are really available, makes choices and fights. It never sets
quest flags, items or stages. The only state it touches: party level before 柿鼠大王 and 風魔 (the bosses are tuned
for a player, not the battle bot), shop gear, and 七彩靈蕈 bought at 回春堂 (simulated purchase, since shops are
skipped in autoplay). Result: **12/12 PASS**, no console errors. 3D spot-check (`?r3lite`): the new hint tags render on
the 柿餅寮 clue spots and on the 風穴 crevice under 靈視.

### 心燈⑩ 嶺上松 (`q_yimin`)

| | |
|---|---|
| How to start | First night in 柿樹坪 (4-8): the unanswered song "from the 義民廟 direction". Go north to 義民廟 at night and walk to 義民塚 (east of the temple, signboard). |
| Steps | 阿松 at the 塚 (stage 0) → 阿福/阿桃 point at 滿妹婆 (1) → 滿妹婆 gives 秋妹的藍衫 and points at 古伯 (2) → 古伯 agrees (3) → at night 滿妹婆 comes along → song → lantern. Night can be chosen any time at the 伙房 beds (「睏到暗晡」). |
| Result | PASS. Every step has an NPC line pointing at the next one. 心燈 `lantern_yimin` lit (exactly +1), 秋妹的藍衫 given, key item returned, log closed. |
| Issues found / fixed | None. |
| Remaining concerns | None. Still open after the boss, and 4-16 reminds the player (白芷「義民塚那位阿哥，還在等人回歌吧」). |

### 心燈⑪ 九降風裡的阿母 (`q_mifen`)

| | |
|---|---|
| How to start | After the 城隍幻境 (4-5), talk to 阿順伯 at the 北郊米粉寮 →「好！」. |
| Steps | Night watch: 3 battles in a row (stage 1) → break the lamp (main) → log stage 2 "夜裡再去米粉寮" → 阿順伯「今暗再來」→ 阿母's goodbye → lantern (3) → talk again → 阿玉's wedding (done). |
| Result | PASS. Both nights, all three battles, rewards (米粉湯/炒米粉, then 炒米粉 ×5, 喜糖 ×3, 500 文), 心燈 `lantern_mifen_mother`, log closed. |
| Issues found / fixed | **Discoverability:** the quest only opens after the vision, but by then the player is in the city heading east, and nothing pointed back to the north coast (the quest isn't in the log until 阿順伯 starts it). **Fixed:** 紅纓 now says, at the end of 4-5: 「……風裡有人叫名字，北郊米粉寮的阿順伯也說過。出東門前，回去看看他吧？」 (only if the watch hasn't been done). |
| Remaining concerns | None. Skipping the first night still works: part 2 covers it. 歌薰門 names the quest if it is open. |

### 柿柿如意 (`q_persimmon`)

| | |
|---|---|
| How to start | 往柿樹坪山路: 芋圓 runs to the 柿餅寮 in the 4-6 cutscene. Talk to 彭阿伯. |
| Steps | Three clue spots (bitten 柿餅 on a rack, footprints in the 柿霜, 柿蒂 by the bamboo) → hole by the big rock → 鼠窩 (2 fixed battles) → 柿鼠大王 → 失竊的柿餅 → 彭阿伯. After the lamp: 霜柿餅 ×3. |
| Result | PASS. 柿柿如意, 柿餅 ×6, 銅鈴 chest, 霜柿餅 ×3, log closed. |
| Issues found / fixed | **Discoverability:** the three clues were bare action tiles among a dozen identical drying racks and bamboo. 彭阿伯's「竹床、寮仔肚、竹林邊」is too vague, and (36,12) is an empty patch of ground. **Fixed:** `hint` tags (「調查」) on `clue1..3` while the quest is open; each tag disappears once its clue is found. |
| Remaining concerns | None. |

### 擂茶課 (`q_leicha`) + 紅纓's retry (硬頸頭帕)

| | |
|---|---|
| How to start | Talk to 滿妹婆 in the 劉家伙房 after the first night's rest (4-8). |
| Steps | 紅纓's failed attempt (紅纓擂茶 ×3) →「星河來 / 白芷來」 minigame → 擂茶. Retry: after the lamp, at night in the 伙房, 紅纓 asks to relearn → 硬頸頭帕. |
| Result | PASS. 紅纓擂茶 ×3, 擂茶 ×5, quest done. Retry gives 硬頸頭帕. |
| Issues found / fixed | **Discoverability:** the retry is an auto event (伙房, night, after the boss), but nothing told the player to come back at night. **Fixed:** in 4-16, 紅纓 says 「……今暗，我想去伙房，請滿妹婆再教我一次擂茶。」 (only if the lesson is done and the retry isn't). |
| Remaining concerns | None. |

### 山歌擂台・道士篇 (`q_shange_yungui`)

| | |
|---|---|
| How to start | Talk to 阿福 in 柿樹坪 after the 4-7 duel →「跟阿福對山歌（雲歸）」. |
| Steps | 3 rounds, with an optional cheat (應聲符). Once per rest. |
| Result | PASS. An honest win gives 花布頭巾 and closes the quest. 芋圓 comes back from the hay. |
| Issues found / fixed | None. |
| Remaining concerns | Getting caught or losing leaves the quest open (by design: you can retry after a rest). 歌薰門 then names it as unfinished. |

### 山歌竹笛 (4-7 duel, missable)

| | |
|---|---|
| How to start | Main story, 4-7. |
| Steps | Lose 白芷's first try (off-rhyme lines, missed tune) → hint →「再唱一遍」→ win. |
| Result | PASS. After the lost round the crowd's hint 「唱贏阿福个人，德興伯有好東西相送喔！」 plays, and the retry wins 山歌竹笛. |
| Issues found / fixed | None. |
| Remaining concerns | 「認輸」 still loses the flute for good (hint only, as documented). |

### 雲歸的蕈譜 · 風穴石耳 (七仙蕈 #2) + vision chests

| | |
|---|---|
| How to start | Cross-chapter collection. In ch4 the log points at the 風穴 (stage 3) only if the quest was started in ch3. |
| Steps | 風穴第一層, NE chamber: illusion rock (35,2) disappears with 靈視 → crevice → 石耳 (37,2). Vision chests c4_19 (same crevice) and c4_23 (第二層 SE). 七彩靈蕈: 回春堂, 120 文. |
| Result | PASS. 風穴石耳, `mush_ch4`, tuanzi_mush +1, log stage 9, both vision chests. |
| Issues found / fixed | **Discoverability:** a 靈視-only secret behind a rock that looks like every other rock. The only clue was the quest-log line, which doesn't exist for a player who never started the quest in ch3. 麻糬's sniff happened only *after* the find. **Fixed:** walking into the NE chamber (touch, once) → 麻糬 stares at the east rock and hears it ting, and 雲歸 says 「肉眼看是石頭。開了靈視，說不定就不是了。」. Also `hint: true` on the 石耳 spot (shows only with 靈視). |
| Remaining concerns | c4_23 (第二層) has no clue of its own. It's an optional chest, and the guide covers it. |

### Minor optional: 小風的風箏, 老秀才

| | |
|---|---|
| How to start | Kite drawn in the city banyan + 小風 on the coast talks about it. 老秀才 moves to the plaza after the boss and offers the lecture. |
| Result | PASS: 還魂香, 秀才毛筆. |
| Issues found / fixed | None. |

### 歌薰門 point of no return (4-18)

| | |
|---|---|
| Check | After 4-17, with the wedding not yet done →「前往鹿港」 → the shared prompt names `q_mifen`; 「再等等」 keeps the player in 竹塹. With everything done, the helper logs `nothing open` and doesn't prompt. |
| Result | PASS. It covers both ch4 心燈 and all side quests. |
| Remaining concerns | None. |

Files changed (ch4): `js/maps/ch4_hsinchu.js` (2 clue lines, 3 hint tags, 1 touch clue + hint on s6), `js/i18n/en_ch4.js`
(4 entries), `docs/guide/chapters/ch04.md` (clue mentions), new `tools/test/sidequests/ch4.side.js`.

## Chapter 5 《鹿港舊夢》 (`js/maps/ch5_lukang.js`)

Playthrough script: `node tools/test/sidequests/ch5.side.js` (4 sessions, about 7 minutes, PASS/FAIL per quest). The `chain` session plays from `?startch=5` through 怨宴 to chapter 6, driven only the way a player would. `fubo-buy` and `inn-skip-fubo` load the map just after the unmasking with **main-story** flags only. `fubo-buy` also sets the ch3 carry-over 蕈譜 stage (杉皮蕈 found), so the inn warning can be checked for 雲歸的蕈譜. No session sets these quests' own flags, items or stages.

Other checks: `ch5.test.js` 103/103 · `unit.js` 64/64 · `validate.js` 0 errors (no ch5 warnings). 3D spot check (`?r3lite`): the 憶蕈 glow and its hint tag render.

### 心燈⑫ 半邊井 (`q_halfwell`, `lantern_halfwell`)

| | |
|---|---|
| How to start | After 天后宮 (`ch5_mazu`, dusk): walk east from the 摸乳巷 courtyard into the 半邊井 square. This is the natural route to the lantern shop, and the 摸乳巷 scene drops the party in that courtyard. **New:** talking to 井邊阿婆 or the 泥水師傅 also starts it. |
| Steps | 1. 王家側門 → 王少爺. Pick 「巷子裡的人，也許會想幫你。」 (the other answer can be retried). 2. Ask 井邊阿婆 (王字水桶), 牛舌餅阿嬸 on 不見天街 (舊帳本) and 打更阿福伯 at the 土地公 square (gong), in any order. 3. After dark (once you leave the 施家燈籠舖), re-enter 九曲巷: the night scene plays automatically. |
| Result | **PASS**. Every stage advances. The log entry closes. 心燈 lit. 半邊井水 ×3 and 1500 文 received. Bucket and ledger are taken. The mason leaves. No console errors. |
| Issues found & fixed | (a) **The quest could be missed.** The only start was a touch strip at x=15. A player who first visits 九曲巷 *before* 天后宮 (nothing blocks it) crosses the strip while it is still inert. Coming back by the long straight alley never crosses it again. The granny and mason only had flavor lines. **Fix:** 井邊阿婆 / 泥水師傅 now start the quest (`wellCanStart()`). (b) Stage-1 log/objective text named the three witnesses but not where they are. **Fix:** 「問問巷子裡的人：井邊阿婆、不見天街的牛舌餅阿嬸、土地公廟前打更的阿福伯。」 (+ en_ch5). |
| Remaining concerns | At night the watchman stands in the 隘門 just south of the shrine, not at the shrine itself. That is close enough to find him. |

### 心燈⑬ 顧門的福伯 (`q_fubo`, `lantern_fubo`)

| | |
|---|---|
| How to start | After the unmasking, the objective is 「回大門，跟福伯說一聲」. Walk to 洛家大門 and the scene starts by itself. |
| Steps | 福伯 asks for a 牛舌餅. If you carry one (chest c5_07 gives ×3, or the stall sells them), it is handed over at once. If not, 牛舌餅阿嬸 on 不見天街 gives one for free (the objective names the stall). Then talk to 福伯. |
| Result | **PASS** on both paths (carried pastry / free pastry). 心燈 lit. 福伯的煙斗 and 洛家大門鑰匙 received. Main quest goes to stage 6 「回客棧休息」. |
| Issues found & fixed | **The ghost showed up in a cutscene after skipping him.** A player can go straight to the inn after the boss: 蔡頭家 runs `innScene` once `ch5_unmask` is set, even without 福伯. If they then chose 繼續, 福伯's ghost still stood at the gate during the 冬至 cutscene. The test caught this, and it fails if the fix is removed. **Fix:** the `fubo` NPC and the `c5_fubo_1` auto event now also need `!vars.c5_inn_scene`. |
| Remaining concerns | None. The inn warning counts 福伯's 心燈 when the player never went back to the gate. |

### 七仙蕈 憶蕈 (`q_tuanzi_mush`, flag `mush_ch5`)

| | |
|---|---|
| How to start | Once inside 洛家古厝 (`ch5_enter`, night), go to the 後院 behind the hall, at the old banyan (11,4). If ch3's 杉皮蕈 was found, the quest log (stage 4) already says 「鹿港洛家老宅的榕樹氣根間」. If not, finding 憶蕈 starts the quest. |
| Steps | Face the glowing mushroom and press Z. 雲歸 eats it. |
| Result | **PASS**. Can be picked before the boss and after it. `tuanzi_mush` +1, quest at stage 9, toast shown. |
| Issues found & fixed | (a) Its window closes at the inn (the inn runs straight to chapter 6), but the inn warning did not mention it. **Fix:** the `innScene` `pointOfNoReturn` now passes `{ id: 'q_tuanzi_mush', open: !mush_ch5 }`. It names 雲歸的蕈譜 while the quest is open. docs/qa/points_of_no_return.md is updated. (b) Without the ch3 quest there was no written clue, only the glow object. **Fix:** `hint: true` on `c5_mush` (floating 「憶蕈」 tag). |
| Remaining concerns | A player who skipped ch3's 杉皮蕈 has no quest entry, so the inn warning cannot name 憶蕈 for them. The visible glow and hint tag are the clue. It is not a 心燈. |

### Point of no return: the inn after the boss

| | |
|---|---|
| Trigger | `lukang_inn` auto event (after 福伯) or talking to 蔡頭家 any time after the unmasking |
| Result | **PASS**. With nothing open there is no prompt (`nothing open`). Open items are named: 福伯, 半邊井 and 雲歸的蕈譜 when started. A never-started 半邊井 or 福伯 is counted 「這一帶還有 N 盞心燈未點亮」. 「再等等」 holds the night (side content can still be finished), and 「繼續」 goes on to chapter 6. |
| Fixed | Added 憶蕈 (above). Guide ch05.md had an outdated line saying a never-started 半邊井 gives no warning; it is rewritten. |

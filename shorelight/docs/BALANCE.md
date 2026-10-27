# Boss & scripted-fight balance — chapters 0–11

Goal: every boss and scripted fight of chapters 0–11 is winnable on the **first try** by a normal player at the level
and gear they really have there, but stays a real challenge: a player who heals, guards and uses items sensibly should
win **about 70–90 %** of the time. The auto-battle does not count.

## How it was measured

**Tool — `tools/sim_story.js`.** `tools/sim_battle.js` only re-implements the formulas over `js/data/*`, so it cannot see
the chapter files' own enemies, troops, skills, items or battle rules. `sim_story.js` loads the whole game in a Node vm
(index.html order, via `tools/test/load.js`), appends one line to each chapter IIFE so the chapter scope can be
evaluated (`G.__X.chN.ev(…)`), and runs the real `G.Battle.Scene` with every wait/tween/dialogue/fade resolved instantly.
Each fight's battle options are the exact expression the chapter passes to `S.battle()`, so **all rule hooks run
unmodified** (工頭魂's raised pickaxe, 水鬼王's hands and 陳伯, 怨宴's 上菜/darkness, 林投姐's 泣訴, 冥燈護法's jars and
燈印, ch7's 心燈 flame and mirror rules, 青鋒's wicks, 貪鬼's 吞食, 瘟鬼頭, 落山風靈's wind gauge and 風團, 鰻王's 燈火,
海蛇's dives, 石巨靈's stone armour, 孤魂眾's hunger). Nothing had to be approximated except that the player never retries.
Fights that follow each other with no chance to rest are chained (HP/MP/劍意 carry over): ch1 1-18 → 墨鴉 → 水鬼王,
ch3 陰兵 → 鬼面, ch4 米粉架 ×3, ch9 night beach ×2, ch11 夜玄 phase 1 → (+30 % HP/MP) → phase 2 and 無相 phase 1 (full heal
before) → 白芷 taken, +50 % → phase 2. The win rate of a phase-2 row is that of the whole pair.

**The player — `tools/test/lib/battlebot.js`.** Revives (skill, else item); the designated healer (白芷, else 雲歸, else
星河) heals with skills, anyone uses a heal item when a member is below ~⅓ and the healer can't act first; MP items for
the healer; cures a stunned/sleeping ally or a sealed healer; **guards** when a big blow is telegraphed (an enemy
wind-up, a 「！」 charge flag, an on-screen 伏低/防禦/穩住 warning); opens boss fights with the debuffs/buffs that always
land (迷魂扇, 天罡破法, 蓄勢, 月霧護身曲, 甘霖); uses ultimates and combos; otherwise the best expected damage (克 cycle,
weak/resist, hit, crit) with a light MP cost. In the simulator it also follows the hints a fight puts on screen
(`tactics` in `tools/sim_story_fights.js`): 渡魂謠 on 風魔's drowned souls, listening to 林投姐, 護燈訣/guard against 燈印,
打燈 at 清虛, 護燈 for 鰻王's lamp, guarding 海蛇's dive target, wood against 石巨靈's armour, feeding 孤魂眾.

**Level.** The progression table / `G.Data.areas` (boss at the top level of its area). Cross-check: the exp of every
chapter map's symbol enemies plus all scripted fights reproduces the table when each symbol enemy is fought ~1.5 times
(they respawn on re-entry); a strict single pass ends 0–4 levels lower (ch6 19 vs 23, ch7 24 vs 27, ch9 32 vs 34,
ch10 34 vs 38). The **"2 levels lower"** column is that player.

**Party and gear.** The story party at that point (陳伯 / 雲歸 as guests where they are), story skills learned by then
(心火 after 無光之影, 太虛神雷 after 清虛, 洛家劍譜 from ch9, 放手/慢看), story gifts (螢火 from ch2; 星火石 after 無光之影; no
月琴弦護符 at 落山風靈 — it is given after that fight). Gear = the best item per slot from the **shops reachable before
the fight** (plus starting gear and gifts; chests not counted). Kit = 5 + 3 of the two best single heals, 3 MP items and
2 revive items sold in those shops.

**Runs.** 400 first-try trials per fight (300 for the −2 column), fixed seed.
`node tools/sim_story.js` (all), `--only id`, `--ch N`, `--lv -2`, `--trace id`, `--ai auto` (the in-game auto-battle),
`--test --testai smart --diff easy` (the playthrough tests' conditions with the battle bot).

Targets: bosses 70–90 %; outliers are < 60 % (too hard) or > 97 % with members falling in < 10 % of fights (trivial).
Scripted *normal* fights (rack fights, rescue fights, puzzle penalties …) keep the normal-fight target (≈100 %, 2–4
rounds) and were not retuned. *loseOk* fights continue the story after a loss; *scripted* fights have a fixed outcome.

## Results

Win = first-try win rate; (KO) = share of fights in which at least one member fell. Chapter 11 was added after
its builder finished it (their own lowering of 烏鬚船主 / 鎖魂將 / 鯤 / 千年燈塔守 is the "before").
| Fight | Ch | Lv | Party | Kind | Win before (KO) | Win after (KO) | Rounds after | 2 levels lower: before → after | Change |
|---|---|---|---|---|---|---|---|---|---|
| 大海霧魂 (0-6, optional) | 0 | 1 | 星河 | scripted | 100% (0%) | 100% (0%) | 5.1 | 100% (0%) → 100% (0%) |  |
| 工頭魂・金貴仔 (1-7) | 1 | 3 | 星河 | boss | 100% (0%) | 93% (8%) | 7.2 | 96% (4%) → 60% (40%) | 工頭魂 m.hp 4.1→5.2, atk 1.4→2.0, spd 1→1.4 (mag 1→1.4) |
| 遲疑的水鬼 (1-13) | 1 | 4 | 星河 | fight | 100% (0%) | 100% (0%) | 2.0 | 100% (0%) → 100% (0%) |  |
| 墨鴉 (1-19, after the 1-18 fight) | 1 | 4 | 星河 白芷 | boss | 89% (24%) | 88% (24%) | 6.4 | 49% (75%) → 49% (73%) |  |
| 水鬼王 + 陳伯 (1-20, right after 墨鴉) | 1 | 4 | 星河 白芷 +陳伯 | boss | 89% (23%) | 88% (24%) | 4.2 | 45% (72%) → 44% (71%) |  |
| 魔神仔頭 (2-7, loseOk) | 2 | 6 | 星河 白芷 | loseOk | 100% (1%) | 100% (2%) | 4.3 | 100% (3%) → 99% (3%) |  |
| 洛紅纓 duel (2-8, loseOk) | 2 | 6 | 星河 白芷 | loseOk | 100% (0%) | 100% (0%) | 2.3 | 100% (0%) → 100% (0%) |  |
| 魔神仔 ambush (2-9, loseOk) | 2 | 6 | 星河 白芷 紅纓 | loseOk | 100% (0%) | 100% (0%) | 1.6 | 100% (1%) → 100% (1%) |  |
| 虎姑婆 (2-15) | 2 | 8 | 星河 白芷 紅纓 | boss | 100% (15%) | 100% (14%) | 7.1 | 100% (38%) → 100% (43%) |  |
| 石猴王 (3-5) | 3 | 10 | 星河 白芷 紅纓 | boss | 100% (20%) | 100% (19%) | 6.2 | 100% (37%) → 100% (38%) |  |
| 鬼面 raid (3-9, after the 陰兵 fight) | 3 | 10 | 星河 白芷 紅纓 +雲歸 | boss | 100% (11%) | 100% (14%) | 6.4 | 100% (28%) → 100% (35%) |  |
| 戲棚 紙人 (3, 義子姑) | 3 | 12 | 星河 白芷 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 2.1 | 100% (0%) → 100% (0%) |  |
| 河伯怨靈 (4-2) | 3 | 13 | 星河 白芷 紅纓 雲歸 | boss | 100% (0%) | 100% (31%) | 10.0 | 100% (1%) → 99% (74%) | 河伯怨靈 hp 10.5→15.2, atk 1.5→3.0, mag 1.7→3.4, spd 0.95→1.9 (阿德's stun and the earth weakness keep it winnable; still >97% but members now fall in ~⅓ of fights) |
| 頂下郊 老鬼 (3 turns) | 3 | 12 | 星河 白芷 紅纓 雲歸 | scripted | 100% (0%) | 100% (0%) | 4.0 | 100% (0%) → 100% (0%) |  |
| 九降風精 (4-1) | 4 | 13 | 星河 白芷 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 1.3 | 100% (0%) → 100% (0%) |  |
| 米粉架 ×3 (4-3, back to back) | 4 | 14 | 星河 白芷 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 1.6 | 100% (0%) → 100% (0%) |  |
| 柿鼠大王 (side quest) | 4 | 15 | 星河 白芷 紅纓 雲歸 | boss | 100% (6%) | 93% (84%) | 14.9 | 100% (16%) → 61% (99%) | 柿鼠大王 hp 10→16, atk 2.3→4.2, mag 1.2→2.2, spd 1→1.85 |
| 風魔 (4-15) | 4 | 16 | 星河 白芷 紅纓 雲歸 | boss | 100% (38%) | 100% (45%) | 9.8 | 100% (57%) → 99% (61%) |  |
| 怨宴 (3-12) | 5 | 19 | 星河 白芷 紅纓 雲歸 | boss | 100% (4%) | 92% (78%) | 12.6 | 100% (6%) → 76% (85%) | 怨宴 atk 2.0→4.2, mag 2.05→4.3, spd 1.3→2.7 (HP unchanged: the 上菜 / darkness cycle already makes it long) |
| 疫聚 (鹽水蜂炮) | 6 | 21 | 星河 白芷 紅纓 雲歸 | boss | 100% (0%) | 100% (31%) | 8.2 | 100% (0%) → 98% (48%) | 疫聚 hp 12→17.4, atk 1.95→3.9, mag 2.05→4.1, spd 0.95→1.9 (capped at ×2: a four-member party with a healer still wins >97%, but with KOs) |
| 林投姐 (3-11) | 6 | 22 | 星河 白芷 紅纓 雲歸 | boss | 100% (1%) | 100% (0%) | 5.8 | 100% (1%) → 100% (1%) | unchanged — an empathy fight (listen = guard during 泣訴); it is meant to be gentle |
| 墨鴉 (caught while sneaking) | 6 | 22 | 星河 白芷 紅纓 雲歸 | boss | 99% (11%) | 91% (25%) | 5.7 | 98% (17%) → 85% (37%) | 墨鴉 (optional, caught sneaking) hp 6.5→7.2, atk 1.7→2.05, mag 1.8→2.15, spd 1.5→1.8 |
| 冥燈護法 (萬燈閣) | 6 | 23 | 星河 白芷 紅纓 雲歸 | boss | 100% (5%) | 93% (88%) | 14.7 | 100% (12%) → 79% (97%) | 冥燈護法 atk 2.05→3.45, mag 2.1→3.55, spd 1.3→2.2 (HP unchanged: jars/regen make it long) |
| 夜玄 (forced loss) | 6 | 23 | 星河 白芷 紅纓 雲歸 | scripted | 100% (100%) | 100% (100%) | 3.3 | 100% (100%) → 100% (100%) |  |
| 黑熊精 (alishan) | 7 | 24 | 星河 紅纓 雲歸 | boss | 100% (0%) | 91% (78%) | 9.2 | 100% (0%) → 68% (91%) | 黑熊精 hp 9→16.2, atk 1.75→3.6, mag 1→2.05, spd 1→2.05 |
| 心魔・鬼面 (紅纓 alone) | 7 | 25 | 紅纓 | scripted | 88% (12%) | 88% (12%) | 3.9 | 71% (29%) → 75% (25%) |  |
| 心魔・雲歸 | 7 | 25 | 星河 紅纓 雲歸 | boss | 100% (7%) | 86% (89%) | 5.2 | 100% (7%) → 59% (95%) | 心魔・雲歸 hp 5.2→8.1, atk 0.8→1.45, mag 1.9→3.4, spd 1.15→2.05 |
| 溺影 (puzzle penalty, loseOk) | 7 | 26 | 星河 紅纓 雲歸 | loseOk | 100% (1%) | 100% (0%) | 1.8 | 100% (2%) → 100% (3%) |  |
| 無光之影 (心火 awakens) | 7 | 26 | 星河 紅纓 雲歸 | boss | 100% (0%) | 92% (73%) | 8.5 | 100% (1%) → 75% (91%) | 無光之影 hp 9→13.3, atk 1.6→2.75, mag 1.9→3.25, spd 1.2→2.05 |
| 蛟 (日月潭) | 7 | 26 | 星河 紅纓 雲歸 | boss | 100% (2%) | 89% (94%) | 10.7 | 100% (3%) → 55% (99%) | 蛟 atk 1.8→3.6, mag 1.7→3.4, spd 1→2.0 (HP unchanged: the dives make it long) |
| 燈蛾 (puzzle penalty) | 7 | 27 | 星河 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 1.4 | 100% (1%) → 100% (1%) |  |
| 清虛真人 + 冥燈印 (燈母祠) | 7 | 27 | 星河 紅纓 雲歸 | boss | 100% (2%) | 86% (70%) | 12.7 | 100% (5%) → 73% (77%) | 清虛 atk 1.7→2.65, mag 2.0→3.1, spd 1.25→1.95; 冥燈印 atk 0.6→0.95, mag 1.6→2.5, spd 1.05→1.65 |
| 北港 street (8-1) | 8 | 27 | 星河 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 2.1 | 100% (0%) → 100% (0%) |  |
| 溪口 rescue 5 (8-3) | 8 | 28 | 星河 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 1.9 | 100% (0%) → 100% (0%) |  |
| 潮怨・百手 (8-4) | 8 | 28 | 星河 紅纓 雲歸 | boss | 100% (1%) | 89% (88%) | 18.1 | 100% (1%) → 68% (96%) | 潮怨・百手 atk 1.9→3.6, mag 2.0→3.8, spd 1.2→2.3 (HP unchanged: the 30% regen phase makes it long) |
| 長明宮衛 (fort) | 8 | 29 | 星河 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 2.4 | 100% (0%) → 100% (1%) |  |
| 洛青鋒 (8-6) | 8 | 29 | 星河 紅纓 雲歸 | boss | 100% (11%) | 91% (76%) | 10.2 | 100% (24%) → 72% (87%) | 洛青鋒 hp 9→10.4, atk 1.6→2.25, mag 1.5→2.15, spd 1.4→2.0 (was 100% with KOs in only ~10% of fights; the wicks / hesitation rules unchanged) |
| 旗後 night beach ×2 | 9 | 30 | 星河 紅纓 雲歸 | fight | 100% (2%) | 100% (2%) | 2.5 | 100% (4%) → 100% (5%) |  |
| 大肚貪鬼 (半屏山) | 9 | 31 | 星河 紅纓 雲歸 | boss | 100% (0%) | 94% (59%) | 9.8 | 100% (0%) → 79% (75%) | 大肚貪鬼 hp 7→10.7, atk 1.9→3.35, mag 1.7→3.0, spd 1→1.75 |
| 瘟鬼頭 (東港 船台) | 9 | 32 | 星河 紅纓 雲歸 | boss | 100% (0%) | 93% (55%) | 7.7 | 100% (0%) → 75% (72%) | 瘟鬼頭 hp 8→11.7, atk 1.8→3.05, mag 1.75→2.95, spd 1.1→1.85 |
| 落山風靈 (龍磐) | 9 | 33 | 星河 紅纓 雲歸 | boss | 96% (6%) | 89% (37%) | 7.4 | 95% (11%) → 76% (55%) | 落山風靈 hp 7.5→8.6, atk/mag 2.0→2.55, spd 1.25→1.6; 風團 hp 1→1.15, atk 1→1.27, mag 1.15→1.43, spd 1.35→1.7; rule fix: the three 風團 build the wind like one enemy (stun-lock) |
| 潮病鰻王 (鵝鑾鼻) | 9 | 34 | 星河 紅纓 雲歸 | boss | 100% (0%) | 86% (59%) | 7.1 | 100% (1%) → 77% (77%) | 潮病鰻王 hp 7.5→10.5, atk/mag 1.6→2.6, spd 1.1→1.75 |
| Kaswal reef fight | 10 | 35 | 星河 紅纓 雲歸 | fight | 100% (0%) | 100% (0%) | 2.2 | 100% (0%) → 100% (0%) |  |
| 潮病海蛇 (蘭嶼) | 10 | 35 | 星河 紅纓 雲歸 | boss | 100% (7%) | 86% (82%) | 11.2 | 100% (21%) → 76% (95%) | 潮病海蛇 (js/data) hp 9→11.5, atk 2.1→3.05, mag 2.03→2.95, spd 1.35→1.95 |
| 大潮怨 (海祭 岬角) | 10 | 36 | 星河 紅纓 雲歸 | boss | 96% (36%) | 94% (36%) | 4.3 | 90% (50%) → 88% (49%) | unchanged (the three 海祭 fights are separate map events: the player can heal between them) |
| 太魯閣石巨靈 | 10 | 37 | 星河 紅纓 雲歸 | boss | 11% (99%) | 86% (76%) | 8.3 | 4% (100%) → 66% (90%) | 峽谷巨像 (js/data) atk 3.04→2.15, mag 2.72→1.65 (its 濁流 nearly one-shot 星河); stone-armour rules unchanged |
| 孤魂眾 (頭城 普渡) | 10 | 38 | 星河 紅纓 雲歸 | boss | 100% (10%) | 92% (53%) | 8.1 | 100% (15%) → 78% (65%) | 孤魂眾 hp 5→6, atk 1.9→2.55, mag 1.8→2.4, spd 1.15→1.55 |
| 烏鬚船主 (11-05) | 11 | 39 | 星河 紅纓 雲歸 | boss | 100% (10%) | 89% (65%) | 9.5 | 100% (10%) → 77% (78%) | 烏鬚船主 hp 6.5→7.5, atk 1.9→3.05, mag 1.6→2.55, spd 1.2→1.9 |
| 鎖魂將 (11-10) | 11 | 40 | 星河 紅纓 雲歸 | boss | 100% (6%) | 90% (73%) | 10.6 | 100% (13%) → 79% (80%) | 鎖魂將 hp 8→8.8, atk 1.85→2.8, mag 1.75→2.6, spd 0.95→1.45 |
| 鯤 (11-14) | 11 | 41 | 星河 紅纓 雲歸 | boss | 100% (3%) | 91% (79%) | 12.5 | 100% (3%) → 79% (90%) | 鯤 atk 1.55→2.55, mag 1.45→2.4, spd 0.9→1.5 (HP unchanged: tumours heal it, the fight is already 12 rounds) |
| 千年燈塔守 (11-23) | 11 | 43 | 星河 紅纓 雲歸 | boss | 94% (32%) | 94% (32%) | 6.8 | 82% (56%) → 82% (50%) | unchanged |
| 萬象童子 (optional game, 15 turns) | 11 | 44 | 星河 紅纓 雲歸 | scripted | 100% (0%) | 100% (0%) | 3.0 | 100% (0%) → 100% (0%) |  |
| 夜玄・玄冥法師 (11-28 phase 1) | 11 | 44/44/44/45 | 星河 白芷 紅纓 雲歸 | boss | 100% (34%) | 100% (35%) | 15.3 | 100% (47%) → 99% (47%) | unchanged (phase 1 of a two-phase fight) |
| 夜玄・逆潮法身 (phase 2, after phase 1 +30%) | 11 | 44/44/44/45 | 星河 白芷 紅纓 雲歸 | boss | 94% (59%) | 90% (68%) | 11.3 | 90% (73%) → 84% (84%) | 夜玄・逆潮法身 atk 2.3→2.4, mag 2.45→2.55, spd 1.5→1.58 — the pair now ends at 90% |
| 黑潮・無相 (phase 1, full heal before) | 11 | 44/44/44/45 | 星河 白芷 紅纓 雲歸 | boss | 100% (28%) | 100% (28%) | 15.2 | 100% (40%) → 100% (35%) | unchanged (phase 1; KO bug fixed, see below) |
| 無相・深淵 (phase 2, trio, +50% after phase 1) | 11 | 44 | 星河 紅纓 雲歸 (白芷 taken) | boss | 92% (100%) | 89% (65%) | 12.6 | 95% (100%) → 71% (83%) | 無相・深淵 atk/mag 2.35→1.42, spd 1.4→0.84 (trio, after phase 1 with half HP/MP back); 'before' 92% was the KO bug — with the bug fixed and the old stats it is 0% |
| 無相之心 (phase 3, cannot be lost) | 11 | 44 | 星河 | scripted | 100% (21%) | 100% (23%) | 5.6 | 100% (20%) → 100% (21%) |  |

All multipliers are the `m:` stat multipliers of the enemy definitions (stats = `G.Data.enemyCurve(lv)` × m); exp and
gold are unchanged (every changed boss has an explicit `exp`/`gold` multiplier).

### Why the bosses were trivial

At the real level with shop gear, a single boss gets ~1 action per 3–4 party actions (boss `spd` ≈ 1.0–1.3 × the curve vs.
three or four party members), so it could not out-damage one healer. Most retunes therefore raise **speed and damage
together** (the boss now acts about twice a round) and HP only a little, so fights stay 6–12 rounds; where a mechanic
already makes the fight long (怨宴, 冥燈護法, 蛟, 百手) HP was left alone.

The builders' weakenings were undone or overruled by the numbers: ch3 鬼面 (c3_guimian, `endAt` 0.5) is at 100 % with KOs
in ~14 % of fights — left alone; ch9 瘟鬼頭 and 潮病鰻王 are now above their original pre-weakening values and 落山風靈 is back near
its original ones (much of its difficulty came from a rule bug, below); ch10 石巨靈 was **too hard**, not too easy — its data
`atk 3.04 / mag 2.72` (twice any other boss) made 濁流 nearly one-shot 星河, so it was brought down to boss norms instead
of touching its armour rules.

### Rule fix — 落山風靈 stun-lock (js/maps/ch9_south.js `fallwindIntro`)

The wind gauge rose by one on *every* enemy action. After the split, the three fast 風團 filled it every three actions,
each 落山 pushed every non-guarding member back 1.5 turns, and the party could be blown away again before anyone acted
to guard — whole-party wipes with the 風團 acting 15 times in a row. The 風團 now build the wind together like the one
風靈 did (one step per three of their actions). Same gimmick, no lock.

### Not retuned (and why)

- Bosses at 100 % but with members falling in 11–45 % of fights (虎姑婆, 石猴王, 鬼面, 風魔): not outliers by the rule;
  they are the easier end of the range.
- 林投姐: an empathy fight — 「怨」 falls when the party *listens* (guards) during 泣訴; making her lethal would contradict
  「別下重手！她不是惡鬼！」.
- 河伯怨靈 and 疫聚 are still > 97 % after a ×2 speed/damage raise (a four-member party with 白芷 out-heals them; 阿德
  stuns the 河伯 at round 3), but members now fall in ~⅓ of fights, so they are no longer trivial. Pushing further made
  them 15+ rounds long.
- ch1 墨鴉 / 水鬼王 (88 %), ch10 大潮怨 (94 % alone; the three 海祭 fights are separate map events) are in range.

## Chapter 11

- **Bug fixed — a party KO won the fight.** `battle.js damage()` computes `floorK = tg.side === 'enemy' && hpFloor && hpFloor[id]`,
  which is `false` (not null) for a party member, so the hpFloor branch runs for party members too: when a member
  drops to 0 HP it raises `onFloor`. 夜玄 phase 1 and 無相 phases 1–2 end the battle as a **win** in `onFloor`, so the
  first KO ended the phase as a victory (that is how 無相・深淵 looked 92 % before: the party "won" in 1.8 rounds while
  dying). Fixed in ch11 only — each `onFloor` now checks it is its boss (`(b, e) => { if (e && e.id !== …) return; … }`;
  無相之心's 「渡」 hint had the same issue). **Engine follow-up (not done, js/engine is another agent's):**
  `const floorK = tg.side === 'enemy' && this.o.hpFloor ? this.o.hpFloor[tg.id] : null;`. ch6 林投姐 already checked
  the id; no other chapter uses `onFloor`.
- With the bug fixed, 無相・深淵 (fought by the trio after phase 1, with half HP/MP back and 白芷 swallowed) won **0 %**:
  its stats were set as if it were an ordinary four-member boss. It now has much lower damage and speed; the whole
  final fight (phase 1 → 2) ends at ~88 %. Phase 3 (無相之心, 星河 alone) cannot be lost by design.
- 夜玄: phase 1 alone is 100 % with KOs; the pair ends at 90 % after a small raise of phase 2.
- 烏鬚船主, 鎖魂將, 鯤 (lowered by the builder) were trivial again at the real level with the 馬公 smith's gear and were
  raised to 89–91 %. 千年燈塔守 (94 %) and the optional 萬象童子 game (loseOk, 15 turns) are unchanged.
- Test: `tools/test/chapters/ch11.test.js` loads the battle bot like the others; `flats` levels to 41 (was 39) before
  烏鬚船主 and `voyage` to 46 (was 44) before 鯤. Browser runs, one at a time: `--only true` **PASS** (7/7, 夜玄 ×2, 無相
  ×3, true ending) and `--only normal` **PASS** (4/4). The other ch11 segments were not re-run.

## Playthrough tests

The playthrough tests fight with the in-game auto-battle, which never guards, never uses items and heals late; with
the tests' gear it now loses most retuned bosses even 8–12 levels above the tests' levels (simulated). The
tests check story flow, not balance, so instead of raising levels further:

- `tools/test/lib/battlebot.js` is loaded into the page by the ch1, 3, 4, 5, 6, 7, 8, 9 and 10 tests
  (`addInitScript({ path })`, one line each). It replaces `G.Battle.Scene.prototype.autoCommand` with the sensible-player
  policy above (generic only: no per-fight hints) and sets `G.settings.difficulty = 'easy'`.
- Extra margin before tuned bosses where the test plays with starting gear: ch1 `level(s, 4)` before 工頭魂 (was 3),
  ch4 `levelTo(17)` before 柿鼠大王 (was 16), ch5 equips the 施家鐵舖 gear and levels to 21 before 怨宴 (was 19, starting
  gear), ch6 levels to 25 at the start of the `finale` segment (冥燈護法).
- Simulated under each test's own conditions (level, the gear it equips, its items): every fight ≥ 99 %
  (`node tools/sim_story.js --test --testai smart --diff easy`).

Verified in the browser, one test at a time, on the segments that contain the tuned bosses — all **PASS**:
ch1 `critical`, ch3 `bangka` (河伯怨靈), ch4 `--only side` (柿鼠大王), ch5 `--only main --from boss` (怨宴),
ch6 `--only main` (疫聚, 冥燈護法), ch7 `--only s1_shrine_bear` and `--from s6_trials` (心魔・雲歸, 無光之影, 蛟, 清虛),
ch8 `--only main --seg river` (百手) and `--seg tower` (洛青鋒), ch9 `--only A --from banping` (all four bosses),
ch10 `--only main` (海蛇, 大潮怨, 石巨靈, 孤魂眾). `tools/test/validate.js` and `unit.js` pass.
Not re-run: the remaining segments/sessions of those tests (the bot also plays their normal fights) and ch0/ch2
(unchanged, no bot).

## Other changes

- `tools/sim_battle.js`: magic damage now resists with the **target's** `mag` like the engine
  (`battle.js applyEffect`: `def*0.3 + target.mag*0.7`); it used the attacker's, which hid how hard magic-heavy enemies
  hit low-`mag` members (石巨靈's 濁流). Also the engine's hit clamp (0.6–0.99) and party resist (×0.6).
  (With the fix sim_battle flags the *js/data* 夜玄 / 無相 as brutal at L44; the game uses chapter 11's own versions,
  which are in the table above.)
- No engine (`js/engine/*`) changes — but see the hpFloor bug below.

## Needs a human playtest

- **Speed of the retuned bosses.** Most now act about twice per party round. That is what makes them dangerous for a
  healer party, but it changes the feel; if it reads as unfair, lower `spd` first (re-check with `node tools/sim_story.js --only <id>`).
- **KO rates.** At 86–94 % wins a member falls in 35–95 % of the retuned boss fights; revives (回魂, 心火・不滅, 還魂香) carry the
  party. Check that this feels tense rather than grindy, especially 冥燈護法 (15 rounds), 潮怨・百手 (18) and 柿鼠大王
  (15).
- **Level assumptions.** A player who skips symbol enemies is 2–4 levels lower in ch6–10 (the right-hand column: the
  harder bosses drop to 55–75 %; 蛟 55 %, 心魔・雲歸 59 %, 柿鼠大王 61 %).
- **工頭魂** at Lv3 (星河 alone, guard tutorial): one bad 鶴嘴鋤重擊 crit can end it; 93 % in the sim.
- **The in-game auto-battle (F)** can no longer beat these bosses on normal.
- **無相・深淵** is now clearly weaker on paper than phase 1; it is the party state (trio, half HP/MP, no 白芷) that makes
  it a fight. Worth a look in the real ending sequence, together with 夜玄's 15-round phase 1.
- **The bot's hints are generic**: in the sim the player follows each fight's on-screen hints (`tactics`); a player who
  misses them (e.g. never feeds 孤魂眾, never guards 燈印) will find 冥燈護法 / 孤魂眾 / 海蛇 harder than listed.

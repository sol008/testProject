# Boss & scripted-fight balance — chapters 0–11

Goal: every boss and scripted fight of chapters 0–11 is winnable on the **first try** by a normal player at the level
and gear they really have there, but stays a real challenge: a player who heals, guards and uses items sensibly should
win **about 70–90 %** of the time. The tuning did not target the in-game auto-battle; since the "In-game auto-battle"
section below, the F-key auto-battle plays this same policy and reaches about the same numbers.

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

All multipliers are the `m:` stat multipliers of the enemy definitions (stats = `G.Data.enemyCurve(lv)` × m). This
pass left exp and gold unchanged; the later progression pass changed rewards only (see "Progression & economy").

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

The playthrough tests used to fight with the old in-game auto-battle, which never guarded, never used items and healed late; with
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

## Progression & economy

The balance pass above tuned every boss for the level and gear of `G.Data.areas` (boss at the top level of its area)
and the best gear of the shops reachable before it. The full-chain run (docs/qa/full_chain.md) showed that a player
who follows the main story does not get there: levels came almost only from the chapter-opening floors, carried gold
covered 15–60 % of the assumed gear, and 潮怨・百手 (ch8) walled a carried party. That run skips the field fights, so
the first step was to measure what a **normal** player gets, then close the gaps with the levers below — rewards first,
boss stats untouched.

### How it is measured — `tools/sim_economy.js`

A model over the game's own data (loaded like `sim_story.js`), three play styles, chapter by chapter:

- **Critical path per map.** The shortest walks on the real collision grid (`G.MapScene.solid`; a gate that is still
  closed costs 25 steps) from the arrival warp to every other warp and every story / puzzle spot of the map. A roaming
  enemy is *met* when its home is within its chase range (+ wander radius) of that path. `--maps` prints them.
- **Normal player** (the target): fights every enemy met, × 1.3 for backtracking (≈ 1.3 × the critical-path steps;
  respawning enemies again on re-entry), the maps' step encounters (ch11 暗雷 on shallows), half of ch10's optional sea
  fights, the ch11 boarding at its rate; opens chests within 10 steps of the path and all town chests; does half of each
  chapter's 心燈 quests. Before each boss it buys the sim's consumable kit (5 + 3 heals, 3 MP items, 2 revives; the
  whole kit at a chapter's first boss, 40 % restock at the others), then the gear BALANCE assumes there (weapons, armour,
  head/feet, accessories; a < 8 % side-grade only with gold to spare). Old gear is not sold (conservative).
- **Minimal player**: flees every field fight, no side content, chests within 4 steps of the path only.
- **Thorough player**: every roaming enemy of every map of the chapter ×1.5 (the cross-check of "How it was
  measured"), all sea fights, all chests, all side quests.
- Levels: the chapter opening's floor, then the exp of everything before each boss (every active member gets the full
  troop exp). Story fights that end by script without `rewards: true` give nothing; adds a boss summons mid-fight are
  not counted except 清虛's 冥燈印 (so the real numbers are a little higher).
- `node tools/sim_story.js --model normal|minimal|thorough` then runs every boss at exactly that state: the integer
  level the style has there, the gear it could afford, the kit it bought. That is the "sim win" column below.

### Before → after, per chapter

Level at chapter entry → at the end of the chapter (fraction = progress to the next level), and the gold earned in
the chapter (field fights + story fights + chests + quests). "Before" is the same model on the data of commit 45b5b4a
(the full-chain report); field fights = the normal player's expected count.

| Ch | BALANCE boss Lv | Minimal: Lv in → out | Normal: Lv in → out | Thorough: Lv in → out | Gold earned in the chapter (min / normal / thorough) | Normal: gold at entry · field fights |
|---|---|---|---|---|---|---|
| 1 | 3–4 | 2 → 4.5 ⇒ 2 → **4.7** | 2 → 5.4 ⇒ 2 → **5.7** | 2 → 5.6 ⇒ 2 → **5.9** | 446 / 827 / 955 ⇒ **519 / 900 / 1028** | 0 ⇒ 0 · 18.7 |
| 2 | 6–8 | 5 → 6.2 ⇒ 5 → **6.4** | 5 → 8.8 ⇒ 5 → **9.1** | 5 → 9.4 ⇒ 5 → **9.7** | 394 / 2037 / 2422 ⇒ **925 / 2768 / 3153** | 296 ⇒ 369 · 27.3 |
| 3 | 10–13 | 9 → 10.6 ⇒ 9 → **11.7** | 9 → 11.3 ⇒ 9 → **12.4** | 9 → 12.2 ⇒ 9 → **13.2** | 1626 / 2275 / 2775 ⇒ **3133 / 3782 / 4282** | 628 ⇒ 1102 · 7.8 |
| 4 | 16 | 13 → 14.0 ⇒ 13 → **14.2** | 13 → 15.9 ⇒ 13 → **16.4** | 13 → 16.8 ⇒ 13 → **17.6** | 1452 / 3783 / 5993 ⇒ **6945 / 9276 / 11486** | 676 ⇒ 1437 · 18.2 |
| 5 | 19 | 16 → 16.4 ⇒ 16 → **17.2** | 16 → 18.3 ⇒ 16 → **19.6** | 16 → 19.4 ⇒ 17 → **21.0** | 1158 / 4286 / 5793 ⇒ **7584 / 10712 / 12219** | 1204 ⇒ 4578 · 16.9 |
| 6 | 21–23 | 19 → 20.4 ⇒ 19 → **22.6** | 19 → 21.0 ⇒ 19 → **23.5** | 19 → 21.4 ⇒ 21 → **24.6** | 2864 / 3753 / 3890 ⇒ **13858 / 14747 / 14884** | 1440 ⇒ 9650 · 6.5 |
| 7 | 24–27 | 23 → 24.4 ⇒ 23 → **26.5** | 23 → 26.3 ⇒ 23 → **28.2** | 23 → 28.1 ⇒ 24 → **30.3** | 1696 / 7191 / 12907 ⇒ **14840 / 22335 / 28051** | 1310 ⇒ 9174 · 20.8 |
| 8 | 28–29 | 27 → 28.3 ⇒ 27 → **29.0** | 27 → 28.8 ⇒ 28 → **30.5** | 28 → 30.0 ⇒ 30 → **32.5** | 2926 / 4198 / 4767 ⇒ **16309 / 17581 / 18150** | 2547 ⇒ 11990 · 4.9 |
| 9 | 31–34 | 30 → 31.5 ⇒ 30 → **32.5** | 30 → 33.5 ⇒ 30 → **34.9** | 30 → 34.0 ⇒ 32 → **36.9** | 9853 / 19902 / 23576 ⇒ **12542 / 23129 / 26886** | 1563 ⇒ 14389 · 22.1 |
| 10 | 35–38 | 34 → 35.4 ⇒ 34 → **37.3** | 34 → 36.7 ⇒ 34 → **39.2** | 34 → 37.1 ⇒ 36 → **41.0** | 4938 / 11562 / 13203 ⇒ **21563 / 29187 / 30828** | 3935 ⇒ 22888 · 17.6 |
| 11 | 39–44 | 35 → 37.0 ⇒ 38 → **42.4** | 36 → 40.6 ⇒ 39 → **44.9** | 37 → 42.1 ⇒ 40 → **47.1** | 6103 / 18437 / 29562 ⇒ **25774 / 39108 / 50233** | 2345 ⇒ 19973 · 27.1 |

### Before → after, per boss

Level = the style's level there (fraction = progress to the next); "gear" = the share (by price) of the gear BALANCE
assumes that the normal / minimal player can afford by then (an item at least as good counts); "sim win" =
`sim_story.js --model` first-try win rate at that state (n = 300 normal and minimal, 100 thorough). Before the pass the
normal player fell 1–4 levels behind from ch6 on and could afford 10–45 % of the gear in ch6–8 (百手: 31 %, the wall of
the chain run); a minimal player lost most bosses from ch7 on.

| Boss | Ch | BALANCE Lv | Normal Lv (before → after) | Minimal Lv | Thorough Lv | Normal gear (before → after) | Minimal gear | Sim win: normal (before → after) · minimal (before → after) · thorough |
|---|---|---|---|---|---|---|---|---|
| 工頭魂・金貴仔 (1-7) | 1 | 3 | 2.9 → **3.1** | 2.0 → 2.0 | 3.4 → 3.6 | 36% → **36%** | 36% → 36% | 69% → **88%** · 69% → **69%** · 88% |
| 墨鴉 (1-19, after the 1-18 fight) | 1 | 4 | 4.7 → **5.0** | 3.4 → 3.6 | 5.0 → 5.3 | 75% → **100%** | 25% → 25% | 92% → **97%** · 69% → **69%** · 96% |
| 水鬼王 + 陳伯 (1-20, right after 墨鴉) | 1 | 4 | 5.1 → **5.3** | 4.1 → 4.2 | 5.3 → 5.6 | 100% → **100%** | 25% → 36% | 95% → **96%** · 89% → **89%** · 96% |
| 洛紅纓 duel (2-8, loseOk) | 2 | 6 | 7.0 → **7.4** | 5.2 → 5.5 | 7.7 → 8.0 | 63% → **100%** | 11% → 14% | 100% → **100%** · 100% → **100%** · 100% |
| 虎姑婆 (2-15) | 2 | 8 | 8.5 → **8.8** | 5.4 → 5.7 | 9.1 → 9.4 | 82% → **100%** | 11% → 13% | 100% → **100%** · 85% → **87%** · 100% |
| 石猴王 (3-5) | 3 | 10 | 9.5 → **9.6** | 9.0 → 9.0 | 10.5 → 10.7 | 100% → **100%** | 13% → 13% | 100% → **100%** · 100% → **100%** · 100% |
| 鬼面 raid (3-9, after the 陰兵 fight) | 3 | 10 | 10.0 → **10.5** | 9.5 → 10.0 | 10.9 → 11.4 | 100% → **100%** | 13% → 23% | 100% → **100%** · 100% → **100%** · 100% |
| 河伯怨靈 (4-2) | 3 | 13 | 11.1 → **12.2** | 10.3 → 11.4 | 11.9 → 13.0 | 58% → **100%** | 18% → 41% | 100% → **100%** · 100% → **100%** · 100% |
| 風魔 (4-15) | 4 | 16 | 15.4 → **15.9** | 13.4 → 13.5 | 16.2 → 16.9 | 54% → **100%** | 13% → 63% | 100% → **100%** · 55% → **91%** · 99% |
| 怨宴 (3-12) | 5 | 19 | 17.9 → **18.7** | 16.0 → 16.0 | 19.1 → 20.2 | 77% → **100%** | 35% → 100% | 79% → **91%** · 27% → **68%** · 95% |
| 疫聚 (鹽水蜂炮) | 6 | 21 | 19.4 → **20.0** | 19.4 → 19.4 | 19.8 → 21.3 | 11% → **92%** | 11% → 54% | 96% → **99%** · 78% → **99%** · 100% |
| 林投姐 (3-11) | 6 | 22 | 20.3 → **21.5** | 19.7 → 20.4 | 20.8 → 22.8 | 24% → **100%** | 18% → 71% | 100% → **100%** · 100% → **100%** · 100% |
| 冥燈護法 (萬燈閣) | 6 | 23 | 20.6 → **22.6** | 20.1 → 21.6 | 21.1 → 23.7 | 32% → **100%** | 26% → 86% | 72% → **97%** · 42% → **92%** · 99% |
| 黑熊精 (alishan) | 7 | 24 | 23.0 → **23.5** | 23.0 → 23.0 | 23.6 → 25.1 | 9% → **95%** | 9% → 64% | 13% → **88%** · 2% → **80%** · 93% |
| 心魔・雲歸 | 7 | 25 | 24.4 → **25.2** | 23.0 → 23.7 | 25.8 → 27.1 | 29% → **100%** | 9% → 76% | 61% → **93%** · 12% → **63%** · 98% |
| 無光之影 (心火 awakens) | 7 | 26 | 24.6 → **25.8** | 23.2 → 24.4 | 25.9 → 27.6 | 29% → **100%** | 9% → 76% | 86% → **91%** · 3% → **75%** · 96% |
| 蛟 (日月潭) | 7 | 26 | 25.2 → **26.7** | 23.4 → 25.1 | 26.6 → 28.5 | 29% → **100%** | 9% → 81% | 87% → **93%** · 1% → **81%** · 98% |
| 清虛真人 + 冥燈印 (燈母祠) | 7 | 27 | 25.7 → **27.6** | 23.6 → 25.8 | 27.6 → 29.7 | 24% → **100%** | 8% → 58% | 74% → **93%** · 0% → **76%** · 100% |
| 潮怨・百手 (8-4) | 8 | 28 | 27.9 → **29.0** | 27.8 → 27.8 | 29.1 → 31.1 | 29% → **100%** | 13% → 92% | 31% → **97%** · 0% → **80%** · 100% |
| 洛青鋒 (8-6) | 8 | 29 | 28.8 → **29.9** | 28.3 → 28.3 | 30.0 → 31.9 | 43% → **100%** | 26% → 78% | 62% → **91%** · 12% → **93%** · 97% |
| 大肚貪鬼 (半屏山) | 9 | 31 | 30.4 → **31.0** | 30.2 → 30.3 | 30.6 → 33.1 | 69% → **100%** | 30% → 100% | 75% → **93%** · 9% → **93%** · 95% |
| 瘟鬼頭 (東港 船台) | 9 | 32 | 31.7 → **32.6** | 30.7 → 31.1 | 32.0 → 34.6 | 82% → **100%** | 37% → 100% | 82% → **88%** · 23% → **87%** · 95% |
| 落山風靈 (龍磐) | 9 | 33 | 32.5 → **33.7** | 31.0 → 31.7 | 32.9 → 35.7 | 68% → **100%** | 20% → 68% | 77% → **93%** · 23% → **74%** · 97% |
| 潮病鰻王 (鵝鑾鼻) | 9 | 34 | 33.3 → **34.7** | 31.2 → 32.2 | 33.7 → 36.7 | 76% → **100%** | 29% → 68% | 100% → **92%** · 89% → **75%** · 96% |
| 潮病海蛇 (蘭嶼) | 10 | 35 | 34.3 → **35.2** | 34.1 → 34.1 | 34.4 → 37.2 | 76% → **100%** | 29% → 68% | 96% → **91%** · 84% → **78%** · 94% |
| 大潮怨 (海祭 岬角) | 10 | 36 | 35.4 → **36.5** | 34.6 → 35.0 | 35.6 → 38.5 | 92% → **100%** | 29% → 76% | 93% → **96%** · 98% → **88%** · 98% |
| 太魯閣石巨靈 | 10 | 37 | 36.2 → **38.0** | 34.8 → 36.1 | 36.5 → 39.9 | 60% → **100%** | 23% → 65% | 80% → **77%** · 22% → **72%** · 89% |
| 孤魂眾 (頭城 普渡) | 10 | 38 | 36.5 → **38.7** | 35.0 → 36.8 | 36.8 → 40.6 | 27% → **100%** | 12% → 53% | 76% → **90%** · 12% → **78%** · 96% |
| 烏鬚船主 (11-05) | 11 | 39 | 37.5 → **39.7** | 35.4 → 38.0 | 38.2 → 41.8 | 17% → **100%** | 11% → 58% | 48% → **93%** · 3% → **70%** · 94% |
| 鎖魂將 (11-10) | 11 | 40 | 39.0 → **41.5** | 35.6 → 38.9 | 40.0 → 43.6 | 41% → **100%** | 11% → 68% | 60% → **90%** · 2% → **73%** · 95% |
| 鯤 (11-14) | 11 | 41 | 39.3 → **42.4** | 36.0 → 39.9 | 40.3 → 44.4 | 41% → **100%** | 11% → 84% | 4% → **97%** · 0% → **76%** · 97% |
| 千年燈塔守 (11-23) | 11 | 43 | 40.0 → **43.6** | 36.3 → 41.0 | 41.5 → 46.0 | 56% → **100%** | 26% → 84% | 74% → **98%** · 12% → **78%** · 98% |
| 夜玄・玄冥法師 (11-28 phase 1) | 11 | 44 | 40.3 → **44.6** | 36.6 → 42.1 | 41.8 → 46.9 | 47% → **100%** | 22% → 78% | 78% → **100%** · 72% → **100%** · 100% |
| 夜玄・逆潮法身 (phase 2, after phase 1 +30%) | 11 | 44 | 40.3 → **44.6** | 36.6 → 42.1 | 41.8 → 46.9 | 47% → **100%** | 22% → 78% | 2% → **93%** · 1% → **81%** · 100% |
| 黑潮・無相 (phase 1, full heal before) | 11 | 44 | 40.6 → **44.9** | 37.0 → 42.4 | 42.1 → 47.1 | 47% → **100%** | 22% → 78% | 75% → **100%** · 63% → **97%** · 100% |
| 無相・深淵 (phase 2, trio, +50% after phase 1) | 11 | 44 | 40.6 → **44.9** | 37.0 → 42.4 | 42.1 → 47.1 | 47% → **100%** | 22% → 78% | 25% → **94%** · 0% → **70%** · 97% |

### What changed (levers in order of preference)

**1. Story battles and boss rewards** (the `m.exp` / `m.gold` reward multipliers of each boss; their stats are
unchanged, so the "Results" table above still holds). Each boss now pays roughly 0.5–1 level and a good part of the
next shop's gear, so a player who only follows the story still levels between floors and can buy most of the gear:

| Boss | Lv | Exp before → after | Gold before → after |
|---|---|---|---|
| 工頭魂・金貴仔 (`c1_foreman`) | 3 | 57 → 68 | 47 → 120 |
| 魔神仔頭 (`c2_mosin_lead`) | 6 | 74 → 200 | 51 → 250 |
| 虎姑婆 (`tiger_granny`) | 9 | 313 → 313 | 267 → 599 |
| 石猴王 (`c3_monkey_king`) | 12 | 260 → 802 | 120 → 500 |
| 鬼面 (`c3_guimian`) | 11 | 446 → 1503 | 219 → 700 |
| 河伯怨靈 (`c3_river_boss`) | 13 | 285 → 342 | 153 → 799 |
| 風魔 (`e_wind_demon`) | 18 | 1188 → 1485 | 507 → 3500 |
| 怨宴 (`c5_feast`) | 20 | 993 → 3503 | 576 → 3002 |
| 疫聚 (`c6_plague_mass`) | 21 | 851 → 4008 | 382 → 2500 |
| 林投姐 (`c6_linto`) | 22 | 1177 → 4994 | 0 → 0 |
| 冥燈護法 (`c6_netherlamp`) | 24 | 1376 → 5006 | 723 → 4999 |
| 黑熊精（潮病） (`c7_bear_boss`) | 24 | 983 → 4002 | 362 → 3001 |
| 心魔・雲歸 (`c7_heart_yg`) | 25 | 846 → 4004 | 0 → 0 |
| 無光之影 (`c7_lightless`) | 26 | 1361 → 4500 | 0 → 0 |
| 蛟 (`c7_jiao_boss`) | 26 | 1134 → 4500 | 501 → 3497 |
| 冥燈印 (`c7_dark_seal`) | 27 | 4207 → 5013 | 1053 → 3000 |
| 潮怨・百手 (`c8_hundred_hands`) | 28 | 2619 → 2619 | 662 → 3500 |
| 洛青鋒 (`c8_qingfeng`) | 30 | 2052 → 5013 | 726 → 3497 |
| 溺魂 (`c9_drowned`) | 30 | 281 → 449 | 116 → 185 |
| 海霧魂 (`c9_sea_wisp`) | 30 | 223 → 349 | 92 → 144 |
| 大肚貪鬼 (`c9_greed_big`) | 31 | 1555 → 4509 | 1012 → 1012 |
| 瘟鬼頭 (`c9_plague_chief`) | 31 | 2177 → 5006 | 759 → 1796 |
| 落山風靈 (`c9_fallwind`) | 32 | 2304 → 5003 | 924 → 2006 |
| 潮病鰻王 (`c9_moray_king`) | 33 | 2783 → 2783 | 1101 → 1101 |
| 潮病海蛇 (`tide_serpent`) | 36 | 2847 → 8017 | 1086 → 4004 |
| 大潮怨 (`c10_tide_wraith_big`) | 36 | 1627 → 12509 | 621 → 3508 |
| 峽谷巨像 (`gorge_colossus`) | 38 | 3137 → 9501 | 1172 → 5993 |
| 孤魂眾 (`c10_guhun_horde`) | 38 | 2689 → 5987 | 2 → 4001 |
| 烏鬚船主 (`c11_captain`) | 39 | 2348 → 11983 | 1042 → 5001 |
| 鎖魂將 (`c11_jailer`) | 40 | 3440 → 13995 | 1440 → 5004 |
| 鯤 (`c11_kun`) | 41 | 3596 → 15986 | 0 → 0 |
| 千年燈塔守 (`c11_warden_elder`) | 42 | 3755 → 17981 | 1351 → 4999 |
| 夜玄・逆潮法身 (`c11_yexuan_2`) | 44 | 5249 → 4199 | 1651 → 1651 |

- 林投姐, 心魔・雲歸, 無光之影 and 鯤 keep 0 gold (an empathy fight, two of the heroes' own shadows, a whale); 清虛真人
  stays 0/0 — the reward is on the 冥燈印 on his back. 夜玄・逆潮法身 only moved with the ch11 exp curve.
- 黑熊精 (`t_c7_bear`, ends at 30 %) and 洛青鋒 (`qfBattleOpts`, he kneels) ended by script **without** `rewards: true`,
  so they paid nothing at all; both now pay (js/maps/ch7_mountains.js, ch8_tide.js).
- 溺魂 / 海霧魂 (ch9's beach and road story fights) ×1.5 exp, so the first ch9 boss is not fought at the floor.
- **Chapter 11 now floors the party at Lv38** (`G.Data.progression` ch11 `lv[0]`) like every other chapter opening
  (it used the party average, so a player who arrived low stayed low for the whole finale).

**2. Main-path chests** (gold added to chests on or near the critical path, and in towns; items unchanged). Quest
rewards were left as they are (keepsakes and food; 半邊井 1,500, 米粉 500, 半屏山 1,000 gold): they only reach players
who do side content, and the normal player already ends every chapter with gold to spare.

| Ch | Chests (gold added) |
|---|---|
| 2 | 霧林南 c2_s1 +200 |
| 4 | 客家古道 c4_09 +500 · 五指山 c4_12 +300, c4_15 +500 · 風穴 c4_18 +600, c4_22 +600 |
| 5 | 鹿港 c5_01 +800 · 洛家 c5_06, c5_08 +600, c5_07 +800, c5_09, c5_10 +600 |
| 6 | 鹽水 c6_01, c6_02 +600 · 府城 c6_03 +800 · 長明宮 c6_09, c6_11 +800, c6_12 +1,000 |
| 7 | 糖廍 c7_ss_a +1,500 · 阿里山 c7_af_d +1,200 · 玉山 c7_ys_e +1,000 · 雲霧林 c7_cf_g +1,000 · 日月潭 c7_sm_i +1,500, c7_sm_j +1,000 |
| 8 | 北港 c8_bg_inn, c8_bg_alley +1,500 · 溪口 c8_rv_village +2,000 · 安平 c8_ap_oyster, c8_ap_shrine +1,000 |
| 10 | 台東海岸 coastC +2,000, coastB +1,000 |
| 11 | 媽宮 c11_01, c11_02 +2,500 · 潮間帶 c11_04 +1,000 · 玄武 B1 c11_08 +1,500, c11_09, c11_10 +1,000 |

**3. Encounter exp per area** (`G.Data.enemyCurve`'s fights-per-level table `FPL`, which scales every enemy of that
level band; js/data/enemies.js). The model counts the field fights a normal player really meets: few in ch1, ch4 and
ch5 (each worth more), many in ch7, ch10 and ch11 (each worth less — that exp moved to the bosses, which narrows the
gap between the normal and the minimal player and keeps the thorough player from running away):

| Band (levels) | ch1 (1–4) | ch4 (13–15) | ch5 (16–18) | ch7 (23–26) | ch10 (34–37) | ch11 (38+) |
|---|---|---|---|---|---|---|
| FPL before → after | 9 → 7.5 | 12 → 10 | 9 → 7.2 | 13 → 17.3 | 13 → 15.3 | 13 → 16.25 |
| exp per fight | ×1.2 | ×1.2 | ×1.25 | ×0.75 | ×0.85 | ×0.8 |

Field gold is unchanged.

**4. Shop prices** for gear priced above its chapter (gold per stat point):

- ch3 艋舺 armour and fan were dearer than ch4's better gear: 艋舺短打 520 → 380, 繡花褙子 540 → 400, 桃木符扇 600 → 450.
- ch10 頭城 sells a second full tier right after 花蓮's, priced like ch11 gear for ch10 stats: 蘭陽劍 2,600 → 1,900,
  海神符扇 2,800 → 2,000, 蕉絲衫 2,200 → 1,600, 蕉絲頭巾 1,150 → 850, 蕉絲綁腿 1,000 → 750, 漁家護腕 1,400 → 1,100.
- ch11 澎湖布鞋 1,300 → 1,000 and 漁夫斗笠 1,200 → 1,000 (the dearest per point of the whole game).

**5. Boss retunes: none.** No stat of any boss changed; the "Results" table and the "2 levels lower" column stand.

### Side fixes

- **七仙蕈 (雲歸的蕈譜, `q_tuanzi_mush`).** Only five of the six mushrooms 玄武蕈 needs existed before ch11 (ch3 剝皮寮,
  ch4 風穴, ch5 洛家, ch6 林投林, ch7 雲霧林), and ch4–6 also required ch3's 杉皮蕈, which needs a 青草阿伯 conversation
  and 靈視 at night — miss it and the quest could never be finished. Now: ch4–6 no longer require 杉皮蕈 (finding any
  mushroom starts the quest); a sixth, **潮汐蕈**, grows on the coral right on the path through 龍坑 (ch9, visible glow,
  short scene, EN text); and the quest log names where the next one grows — each chapter opening points it at that
  chapter's mushroom (stage texts in js/maps/ch3_guanyin.js), with 「（開啟靈視）」 for the three that need Spirit Sight.
  All six are reachable on normal play paths across ch3–ch9, so 玄武蕈 in ch11 can complete the seven.
- **Quests left open by main-story scenes.** `q_atu_watch` (opened in the mine by 阿土伯) and `q_hy_kitchen` (opened by
  the 平溪 morning) could only be finished in their chapter but stayed open for the rest of the game. The next
  chapter's opening now removes the previous chapter's unfinished chapter-local side quests from the log
  (ch2: `q_atu_watch`, `q_ahuang`, `q_xingmu`; ch3: `q_hy_kitchen`, `q_woodcutter`, `q_letter`).

### Verification

- `node tools/sim_story.js` (BALANCE conditions, n = 100): unchanged within noise — 85–100 % for every boss.
- `node tools/sim_story.js --model normal|minimal|thorough` (n = 300 / 300 / 100): the "Sim win" columns above.
- `node tools/test/full_chain.js --from ch5 --encounters` (no assist, one browser, 35 min): **ch5 → 千燈 and 彼岸,
  every boss won first try, 0 wipes, 0 errors** (docs/qa/full_chain.md). `--encounters` pays the model's field fights
  (exp + gold, logged) before each boss and at chapter boundaries and shops before bosses like a normal player. The
  chain plays easy (exp ×1.2), so it ran 1–4 levels above the boss levels from ch7 on — exactly the model's normal
  player on easy (`--diff easy`), which validates the model's level curve against the real game.
- The new 潮汐蕈 scene was run headless (event live, glow placed, counter / flag / quest stage set, event gone after).
- `node tools/test/validate.js`: 0 errors · `node tools/test/unit.js`: 60 passed.

### Notes / open

- **The normal player ends rich** (≈ 20–30 k gold unspent late in the game): the story and chest gold was sized so that
  the *minimal* player can buy most of the gear and a kit, and the normal player gets field gold on top. That surplus
  is consumables and luxury upgrades; it does not buy power the bosses were not tuned for (the best shop gear is what
  BALANCE assumed). If it feels too loose, trim the town chests of ch8–11 first (they only matter to the minimal player
  for 1–2 bosses each).
- **The thorough player** (every roaming enemy, 1.5 times) is 2–3.5 levels above the boss levels from ch7 on; with no
  exp penalty for being over-levelled that is the natural reward for grinding, and it is not required.
- The minimal player stays ≈ 1–2.5 levels under the BALANCE level (it never fights in the field) and relies on gear,
  kit and careful play: 63 % (心魔・雲歸) is its lowest first-try rate, and every boss has 重新挑戰.

## In-game auto-battle (F) — `js/engine/autobattle.js`

The old F-key auto-battle (`BattleScene.autoCommand`) never used items, never guarded and healed late: with the
retuned bosses it lost most of them on normal, the final 無相 included (37 % mean first-try win over the 36 bosses of
`--model normal`, 26 of them under 70 %). It is now **`G.AutoBattle`**, a port of the battle bot's policy (above) loaded
before `battle.js`; `autoCommand(u)` asks it first and keeps the old logic as `basicAutoCommand` (fallback if it throws).

- Same decisions as the bot: revive → healer heals → heal items when the healer can't act first → MP item for the healer
  → cure → guard against telegraphed blows (a warning that names a member: only that member) → boss openers →
  ultimates / combos / best expected damage. Deterministic, a few passes over skills × enemies per turn. The battle
  scene now records what it reads (`acts`, each enemy's `lastCmd`, `msgAt` in `say`).
- The per-fight hints the sim's player follows (`tactics` / `focus` / `valueMod` in `tools/sim_story_fights.js`) are
  built in as `G.AutoBattle.FIGHTS`, keyed by enemy id and reading only what the screen shows (燈印, 泣訴, hunger, the
  燈火 meter, the serpent's dive target, 石巨靈's armour); a skill an on-screen message names in 「」 (渡魂謠, 千燈) is
  played when usable. Hits on a `submerged` enemy count as 0.
- **Settings** (menu → 設定; `G.settings`): `autoStyle` 保守 / **標準** / 積極 (heal, item and guard thresholds, MP cost
  weight and the healer's MP reserve — `G.AutoBattle.STYLES`) and `autoItems` 使用道具 **開** / 關. Items: restoratives
  only, never `key` items, items without a shop price (story gifts) or flagged `rare`, never attack items.
- **Boss vs ordinary fight** (troop or a living enemy flagged `boss`): ordinary fights save ultimates (unless a member
  is down or below 40 %; 積極 always uses them), weigh MP 3–4× more heavily, keep a larger healer reserve, use no MP
  items, use heal items only below ¾ of the boss threshold and only when no healer is up, only items priced
  ≤ `40 + 30 × chapter`, and revive items only when one member is left.
- `tools/test/lib/battlebot.js` is **kept as it is** (it does not call `G.AutoBattle`): the chapter tests last passed
  with it, and switching them to the in-game AI would change every test's fights while only a few segments could be
  re-run here. The in-game AI reproduces the bot's numbers (below), so the two can be merged later by making
  `makeAI(G, 'smart')` return `G.AutoBattle.command` and re-running all chapter tests.

**Measured** — `node tools/sim_story.js --model normal --ai auto [--autostyle safe|bold] [--autoitems off] --n 300`
(each boss at the level / gear / kit a normal player has there; "before" = the same run on the commit before this
change via `SIM_ROOT`; "bot" = the battle bot with the sim's per-fight hints). Win (KO) = first-try win rate (share of
fights where a member fell); items = items the auto-battle used per fight.

| Fight | Ch | Lv | Before | **After, 標準** (KO) | Items | Bot | 保守 / 積極 | 標準, 使用道具 關 |
|---|---|---|---|---|---|---|---|---|
| 工頭魂・金貴仔 (1-7) | 1 | 3 | 80% | **88%** (12%) | 0.4 | 88% | 89% / 93% | 76% |
| 墨鴉 (1-19, after the 1-18 fight) | 1 | 5 | 96% | **97%** (10%) | 0.1 | 97% | 98% / 90% | 95% |
| 水鬼王 + 陳伯 (1-20, right after 墨鴉) | 1 | 5 | 94% | **96%** (10%) | 0.3 | 96% | 99% / 94% | 95% |
| 洛紅纓 duel (2-8, loseOk) | 2 | 7 | 100% | **100%** (0%) | 0 | 100% | 100% / 100% | 100% |
| 虎姑婆 (2-15) | 2 | 8 | 100% | **100%** (13%) | 0.2 | 100% | 100% / 100% | 99% |
| 石猴王 (3-5) | 3 | 9 | 82% | **100%** (30%) | 1.4 | 100% | 100% / 100% | 95% |
| 鬼面 raid (3-9, after the 陰兵 fight) | 3 | 10 | 99% | **100%** (13%) | 0.3 | 100% | 100% / 100% | 99% |
| 河伯怨靈 (4-2) | 3 | 12 | 100% | **100%** (37%) | 1.7 | 100% | 100% / 100% | 100% |
| 風魔 (4-15) | 4 | 15 | 49% | **100%** (51%) | 1.3 | 100% | 100% / 99% | 90% |
| 怨宴 (3-12) | 5 | 18 | 26% | **84%** (82%) | 3.1 | 91% | 93% / 82% | 51% |
| 疫聚 (鹽水蜂炮) | 6 | 19 | 90% | **99%** (49%) | 0.6 | 99% | 100% / 98% | 96% |
| 林投姐 (3-11) | 6 | 21 | 0% | **100%** (0%) | 0 | 100% | 100% / 100% | 100% |
| 冥燈護法 (萬燈閣) | 6 | 22 | 25% | **95%** (83%) | 2.3 | 97% | 98% / 96% | 80% |
| 黑熊精 (alishan) | 7 | 23 | 13% | **88%** (77%) | 2.1 | 88% | 92% / 68% | 50% |
| 心魔・雲歸 | 7 | 25 | 77% | **93%** (74%) | 2 | 93% | 94% / 84% | 73% |
| 無光之影 (心火 awakens) | 7 | 25 | 28% | **91%** (80%) | 2.3 | 91% | 95% / 66% | 45% |
| 蛟 (日月潭) | 7 | 26 | 10% | **95%** (87%) | 2.5 | 93% | 99% / 84% | 70% |
| 清虛真人 + 冥燈印 (燈母祠) | 7 | 27 | 3% | **91%** (73%) | 2.6 | 93% | 97% / 73% | 34% |
| 潮怨・百手 (8-4) | 8 | 29 | 0% | **97%** (73%) | 4.6 | 97% | 99% / 83% | 19% |
| 洛青鋒 (8-6) | 8 | 29 | 6% | **91%** (75%) | 2.2 | 91% | 96% / 83% | 50% |
| 大肚貪鬼 (半屏山) | 9 | 31 | 1% | **93%** (53%) | 1.3 | 93% | 96% / 82% | 72% |
| 瘟鬼頭 (東港 船台) | 9 | 32 | 2% | **94%** (52%) | 1.7 | 88% | 94% / 80% | 67% |
| 落山風靈 (龍磐) | 9 | 33 | 28% | **94%** (33%) | 1.3 | 93% | 99% / 87% | 81% |
| 潮病鰻王 (鵝鑾鼻) | 9 | 34 | 0% | **90%** (60%) | 1.8 | 92% | 94% / 78% | 66% |
| 潮病海蛇 (蘭嶼) | 10 | 35 | 0% | **95%** (75%) | 1.7 | 91% | 95% / 86% | 69% |
| 大潮怨 (海祭 岬角) | 10 | 36 | 35% | **95%** (35%) | 0.8 | 96% | 95% / 95% | 92% |
| 太魯閣石巨靈 | 10 | 37 | 2% | **78%** (87%) | 2 | 77% | 85% / 59% | 51% |
| 孤魂眾 (頭城 普渡) | 10 | 38 | 1% | **94%** (48%) | 5 | 90% | 94% / 81% | 50% |
| 烏鬚船主 (11-05) | 11 | 39 | 6% | **93%** (66%) | 1.8 | 93% | 96% / 88% | 73% |
| 鎖魂將 (11-10) | 11 | 41 | 2% | **93%** (69%) | 1.8 | 90% | 96% / 86% | 68% |
| 鯤 (11-14) | 11 | 42 | 0% | **96%** (70%) | 2.9 | 97% | 99% / 93% | 52% |
| 千年燈塔守 (11-23) | 11 | 43 | 46% | **96%** (23%) | 0.6 | 98% | 96% / 97% | 89% |
| 夜玄・玄冥法師 (11-28 phase 1) | 11 | 44/44/44/45 | 64% | **100%** (30%) | 0.8 | 100% | 100% / 100% | 96% |
| 夜玄・逆潮法身 (phase 2, after phase 1 +30%) | 11 | 44/44/44/45 | 9% | **93%** (62%) | 1.5 | 93% | 98% / 86% | 75% |
| 黑潮・無相 (phase 1, full heal before) | 11 | 44/44/44/45 | 57% | **100%** (27%) | 0.6 | 100% | 100% / 99% | 96% |
| 無相・深淵 (phase 2, trio, +50% after phase 1) | 11 | 44/44/44/45 | 8% | **94%** (52%) | 1.4 | 94% | 98% / 83% | 67% |
| **Mean** | | | **37 %** | **94.5 %** | 1.5 | 94.4 % | 96.8 % / 88.1 % | 74.5 % |
| Bosses < 70 % | | | 26 | **0** | | 0 | 0 / 3 | 14 |

保守 is a little safer than the bot (fewer KOs: 39 % vs 48 % of fights), 積極 is faster (8.4 vs 8.8 rounds) and loses
more; with items off the late bosses drop to 20–75 %. The battle bot without the per-fight hints (`--notactics`, the
browser bot of the chapter tests) is 93.8 % — the hints matter mostly for 冥燈護法 (71 % → 95 %).

js/data troops (`node tools/sim_story.js --areas --ai auto --n 50`: sim_battle.js's area list through the real engine,
area level, best gear of chapter ≤ the area's, the standard kit): the 173 field troops are won 100 % with **0 items**
used (before: 100 %, 0); the 26 area bosses average **86 %** (before 51 %, bot 85 %; `boss_wuxiang` at L44 1 % → 90 %).
Browser: `index.html?debug&battle=boss_wuxiang&party=xinghe,hongying,yungui,baizhi&lv=46&auto=1` (normal, 2D, in-game
AI only — no test bot): with the debug start's own starting gear the boss is unwinnable for any policy (bot and
in-game AI both 0 % in the sim at L44–50), so the run equipped the `--areas` gear for 一息界 (best item of chapter ≤ 11
per slot) before the battle and kept the debug bag. **Won** in 22 rounds, no console errors; the AI used 迷魂扇 ×5,
天罡破法 ×4, 蓄勢 ×2, 月霧護身曲 ×2, every member's ultimate, 回魂 ×4, and 4 items (米酒 for 白芷's MP, 還魂香 ×2 —
the cheaper revive, not 還魂丹 —, 九轉回生丹 ×1). Sim of the same setup: 98 % (bot 96 %). Before: 0 %.
Tests: `unit.js` 64 passed (2 new `autobattle:` tests: item rules, a warning naming one member), `validate.js` 0 errors
(15 warnings, unchanged); chapter segments one at a time: ch2 `--only=critical` **PASS** (no bot: the in-game AI
fights 紅纓's duel and 虎姑婆), ch1 `critical` **PASS** (a first run failed at the attic keyboard walk, before any
battle, while another browser was busy; the rerun and `--from=raid` passed), ch5 `--only main --from boss` **PASS** (怨宴).

## Needs a human playtest

- **Speed of the retuned bosses.** Most now act about twice per party round. That is what makes them dangerous for a
  healer party, but it changes the feel; if it reads as unfair, lower `spd` first (re-check with `node tools/sim_story.js --only <id>`).
- **KO rates.** At 86–94 % wins a member falls in 35–95 % of the retuned boss fights; revives (回魂, 心火・不滅, 還魂香) carry the
  party. Check that this feels tense rather than grindy, especially 冥燈護法 (15 rounds), 潮怨・百手 (18) and 柿鼠大王
  (15).
- **Level assumptions.** Superseded by "Progression & economy": a normal player is now at the boss level (±1), and a
  player who flees every field fight is 1–2.5 levels lower but can afford most of the gear (63–100 % first try).
- **Economy feel** (Progression & economy): bosses now pay 0.5–1 level each and the normal player ends with gold to
  spare; check that field fights still feel worth taking in ch7 / ch10 / ch11, where their exp moved to the bosses.
- **工頭魂** at Lv3 (星河 alone, guard tutorial): one bad 鶴嘴鋤重擊 crit can end it; 93 % in the sim.
- **The in-game auto-battle (F)** now plays the bot's policy (see above) and wins 78–100 % of the bosses at the normal
  player's state on 標準; check that it feels sensible to watch (guards, item use) and that 保守/積極 feel different.
- **無相・深淵** is now clearly weaker on paper than phase 1; it is the party state (trio, half HP/MP, no 白芷) that makes
  it a fight. Worth a look in the real ending sequence, together with 夜玄's 15-round phase 1.
- **The bot's hints are generic**: in the sim the player follows each fight's on-screen hints (`tactics`); a player who
  misses them (e.g. never feeds 孤魂眾, never guards 燈印) will find 冥燈護法 / 孤魂眾 / 海蛇 harder than listed.

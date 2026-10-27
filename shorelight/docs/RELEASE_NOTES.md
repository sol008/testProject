# 《彼岸燈》 Shorelight — Release 1.0.0 (2026-10-27)

## How to play (Mac)
1. Unzip, then double-click **Play Shorelight.command**. Chrome, Edge or Brave is recommended; Safari works too.
2. First time only: right-click → Open → Open. On macOS 15 or later: double-click once, then System Settings → Privacy & Security → Open Anyway.
3. Low-spec Mac: run the launcher with `lite`, or turn 3D off in Settings.
4. Language: the game follows the system language. Switch with 繁體中文 / English on the title screen.
5. Full guide: **PLAYING.md** (中文 / English).

## What's in this build
- **Story:** 12 chapters, from the prologue 九份 to the finale 彼岸, with two endings: 千燈 (true) and 彼岸 (normal).
  - The true ending needs 14 心燈 from the side stories.
  - Estimated play time: 20–28 h for the main story, 30–40 h with side content.
- **3D:** 3D field view and 3D battles.
  - Rigged, animated characters, including the chosen designs 白芷 #02, 星河 #07, 紅纓 #01 and 雲歸 #01.
  - Pets 芋圓 #07 and 麻糬 #04.
  - 61 animated monsters and bosses with phase changes.
  - Han and Indigenous/coastal architecture, nature, props, water, sky, weather and psychedelic vision effects.
  - 41 battle arenas, a camera director and spell effects.
  - All 175 maps were checked in 3D: 0 errors and no 2D fallbacks.
- **Languages:** Traditional Chinese (original) and American English (99.9%; the remaining 0.1% is internal text or puzzle glyphs kept on purpose).
- **Music:** four signature themes built on one 燈 motif: title, 白芷's theme, 渡魂謠 and the 千燈 ending. The 笛子, 二胡, 古箏 and voice synthesis are improved.
- **Play Stats (遊玩統計):** in the main menu.
  - An accurate play clock, with idle and hidden time excluded.
  - A breakdown per chapter and per activity, plus boss attempts.
  - **Z copies a report.** Please paste it back to us after your playtest.

## Quality work in this release
- **Balance:**
  - Every boss is tuned to an 86–94% first-try win for a careful player at the expected level.
  - Economy and level curve: a normal player, without grinding, reaches each boss within about 1 level of its expected level with the expected gear.
  - The chapter 5 → both endings playthrough passes with no assistance.
- **Full playthrough test:** New Game → all 12 chapters → both endings in one continuous run, with saves reloaded mid-run.
- **Proofreading:** 55+ Chinese fixes (typos, simplified characters, terms, voice, continuity, anachronisms). The English was updated to match.
- **Key emotional scenes hand-polished** for pacing, silence and callbacks:
  - finding 白芷
  - 白芷 taken at 萬燈閣
  - the vision of 18 years ago
  - 陳伯's past
  - 夜玄 / 夜念
  - both endings
- **English layout:** 29 overflow and wrapping issues fixed; every dialogue line fits the box.
- **Bugs fixed:**
  - Finale callbacks for four 心燈 stories never showed.
  - 鯤 fight could never end.
  - A fallen ally could count as a boss win.
  - 落山風靈 chain knockback.
  - Wind gusts could be walked through.
  - 七仙蕈 quest was impossible to finish.
  - Stuck quests in the log.
  - …and many more; see docs/qa/ and docs/BALANCE.md.

## Please check in your playtest (things tests can't judge)
- Whether the writing and the emotional scenes land.
- Whether the music themes fit; tell us in plain words what to change.
- Boss feel: most bosses act about twice a round, and a few fights run 15+ rounds (冥燈護法, 百手, 柿鼠大王, 夜玄 phase 1).
- Gold: a normal player ends rich (20–30k unspent).
- 3D look and performance on your Mac. This build was only tested with software rendering, which has no GPU.

## Known open items
- Optional story decisions (from proofreading):
  - 雲歸 says 我 until the finale's 貧道.
  - Duplicate minor names (阿順伯, 阿義) in the finale cameos.
  - 陳伯 knowing 紅纓's family.
  - Hakka 着 vs 著.
- 3D:
  - Very dense plant maps (sugarcane_night) use many draw calls.
  - No shoreline mesh at sea-map edges.
  - Leaf shadows don't sway.
- The F-key auto-battle can't beat bosses on normal; it has no item use. We can upgrade it to the smart battle AI if wanted.

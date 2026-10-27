# Chapter builder brief — 《彼岸燈》 Shorelight

You implement ONE chapter as playable content in `js/maps/chN_<name>.js` (exact filename given in your task;
it is already listed in index.html). The game is a Canvas/vanilla-JS RPG that runs from file://.

## Read first (in this order)
1. docs/MAP_AUTHORING.md — map format, events, script API `S`, conventions, testing. Binding.
2. Your screenplay in docs/story/ (canon for content) + docs/STORY_BIBLE.md (esp. cultural guide) + docs/WRITERS_GUIDE.md.
3. docs/CONTRACTS.md (art ids: terrain, objects, sprites, portraits, monsters, backdrops, music) and docs/ART_NOTES.md
   (footprints & placement rules). Check what actually exists: grep `G.Objects.define('`, `G.Tiles.define('`,
   `G.Monsters.define('` in js/gfx/*.js; sprite ids via `G.Sprites.ids()` (js/gfx/sprites.js may still be in progress —
   contract ids are guaranteed to exist eventually); portraits in js/gfx/portraits.js; music ids in js/core/music.js.
4. js/data/*.js — existing items, skills, enemies, troops, areas (G.Data.areas lists the troops intended per area).
5. js/engine/script.js, map.js, mapmech.js, minigames.js, battle.js, worldmap.js, story.js, debug.js — the real APIs.
6. The neighbouring chapter files if they exist (for hand-off flags) — but never edit them.

## Requirements
- Implement EVERYTHING in the screenplay: every map (with good layout & decoration — towns must feel alive, 3/4-view
  terrain with walls 2 cells thick, lighting at night, particles), every NPC and all their dialogue (incl. flag-dependent
  variants), every cutscene beat (camera, movement, emotes, sfx, bgm, fades), choices & branches, side quests with
  `G.Data.quests` entries and 心燈 (`S.lantern`), shops/inns/chests, puzzles (use mapmech: guards/hides/winds/push,
  switches via events + flags, `G.Mini.*` minigames), roaming enemies with appropriate troops, bosses with special
  rules (`S.battle(troop, { loseOk, ... })`, enemy `endAt`/`phases` already in data).
- Chapter entry: `G.Story.chN = async (S) => { ... }` — sets `S.chapter(N)`, title card `S.titleCard(G.Chapters[N], '…')`,
  party adjustments (join/leave; use `G.Story.ensureLevel(id, lv)` for returning members), objective, and warps to the
  first map. Chapter exit: the last story event calls `await G.Story.next(S, N + 1)`.
- If the screenplay needs items/skills/enemies/troops/quests that do not exist, define them in YOUR chapter file
  (`G.Data.items.x = {...}`, `G.Data.troops.t = {...}`, `G.Data.enemies.e = {...}`, `G.Data.skills.s = {...}`) using the same
  formats as js/data/*.js, with balanced numbers (see the progression table at the top of js/data/enemies.js and
  `node tools/sim_battle.js --help`). Never edit js/data/*.js or engine files.
- If the screenplay asks for art that does not exist, use the closest existing art id (the screenplay usually names a
  fallback). Never invent ids that are not registered — the validator will flag them.
- Localization: the game is bilingual (zh-Hant source, en-US via js/i18n). Write ALL display text as complete static
  Chinese string literals: no concatenating sentence fragments, no building lines from variables (if you must
  interpolate, use a template literal whose static parts form whole phrases, e.g. `` `${n} 位香客平安歸來。` ``).
  Do not write English — translators will produce js/i18n/en_chN.js from your file.
- Keep IDs stable and namespaced: maps `<place>[_<sub>]`, flags `chN_*`, quests `q_chN_*` or as given by the screenplay,
  troops/items you add prefixed with your chapter (`t_cN_*`, `cN_*`).

## Quality & testing (mandatory — studio standard: no bugs)
- Load each map: `index.html?debug&map=<id>&lv=<lv>&party=...&flags=...` and the chapter start `index.html?debug&startch=N`.
- Write an automated playthrough test `tools/test/chapters/chN.test.js` (Node + pre-installed Playwright:
  `require('playwright')`, `chromium.launch()`), which:
  1. opens `index.html?debug&startch=N`, sets `G.Debug.setAutoplay(true)` (dialogue auto-advances, choices pick
     `G.Debug.choices` entries (index or substring) or 0, minigames succeed, battles auto-fight fast),
  2. drives the critical path: wait for `G.Debug.idle()`, then trigger the next beat — `G.Debug.stepOn(x, y)` for touch
     events/warps, `G.Debug.talk(npcId)` for NPC talks, `G.Debug.trigger(eventId)` for action events, `S.warp` via
     `G.Script.run` where walking would be needed —, through every main event to the chapter's final `G.Story.next`
     (assert `G.state.chapter === N + 1` or a final flag),
  3. separately exercises every side quest & 心燈 and asserts the flags/lanterns/items you expect,
  4. fails on any page error, console error (ignore ERR_FILE_NOT_FOUND), `G.lastError`, or missing art warnings,
  5. prints a clear PASS/FAIL summary. Run it until it passes.
- Also screenshot every map (and key cutscene moments) at least once and LOOK at them with the Read tool: fix ugly
  layouts, characters hidden behind roofs, blocked doors, unreachable areas, wrong lighting.
- Run `node tools/test/validate.js` if it exists and fix every error that points at your file.
- Make sure every warp destination is walkable and that the player can never get stuck (soft-lock) — e.g. after a
  scripted event the party can always leave; one-way gates are explained.

Only create/modify your chapter file, `js/i18n/` NOTHING, `tools/test/chapters/chN.test.js`, and scratch files outside
the repo. Do not git commit. Final report (brief): maps implemented, quests/心燈 ids, data you added, any screenplay
parts you could not implement and why, and the test result.

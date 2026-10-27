# Shorelight QA suite (`tools/test/`)

Three layers, no `npm install` needed (plain Node ≥ 18 + the pre-installed Playwright/Chromium):

| stage | file | what it checks | runtime |
|---|---|---|---|
| content validator | `validate.js` | cross-references every data table, map and script call | ~1 s |
| unit tests | `unit.js` | engine logic in a Node `vm` (party, inventory, save, battle formulas, dialogue/menu/shop logic) | ~3 s |
| end-to-end | `e2e.js` | the real game in headless Chromium from `file://…/index.html` | 1–10 min |

```bash
tools/test/run.sh            # everything, prints a summary table, exit 1 on any failure
tools/test/run.sh --quick    # e2e battle sweep limited to 12 troops
node tools/test/validate.js [-v] [--json] [--strict]
node tools/test/unit.js [name-filter …]
node tools/test/e2e.js [--only menu,shop] [--maps a,b] [--troops N] [--workers 4] [--no-sweep] [--headed] [--shots]
```

Logs and reports go to `tools/test/out/` (git-ignored): `validate.log`, `unit.log`, `e2e.log`,
`e2e-report.json`, screenshots with `--shots`.

## `load.js` — game in a Node vm

`require('./load').load(opts)` reads `index.html`, runs every `<script src>` in order inside a `vm`
context with DOM / canvas / localStorage stubs (canvas contexts are permissive Proxies, so art modules
load and even draw without crashing), and returns `{ G, ctx, errors, missing, loaded, run }`.
`fontdata.js` and `main.js` are skipped (no boot loop). Options: `storage` (a `Map` — share it to test
persistence across reloads), `search` (location.search), `extra` / `only` / `skip` (script lists),
`console: 'pass'` to see the game's console. Missing files (art still being written) are reported in
`env.missing`, exceptions in `env.errors` — never thrown.

## `validate.js` — content integrity

Errors (exit 1) are references that are broken *now*; warnings are suspicious/degraded content.
Every issue prints `file:line` and the offending id. Checks include:

* **load**: scripts in `index.html` that are missing or throw; `js/**` files not referenced by `index.html`.
* **data**: duplicate keys in the big object literals (silent overwrite) and duplicate `base()/troop()` ids.
* **chars**: learn skills / ultimate exist (ultimate has `ultimate:true`), starting equipment exists, fits the slot and `who`.
* **skills**: type/target/elem/status/buff ids; `sfx` ∈ `SFX` keys of `js/core/audio.js`; `fx` handled by
  `battle.js playFx` (parsed from its `case`s + `elemColor`; unknown → generic burst = warning).
* **items**: icon ∈ `ICON_DRAW` (js/gfx/ui.js), `who` are characters, `use{}` targets/statuses/effects.
* **enemies**: `art` is a registered monster / `sprite` a sprite id, skills/drops/summons exist, numeric stats,
  skill `if:` conditions **probed against the real `aiCommand()`** (flags conditions that are always/never true).
* **troops / areas**: enemies exist (≤ 6), `bg` is a backdrop id, `bgm` a music id, bosses flagged.
* **engine-support**: data fields the engine never reads, item `special`s with no implementation,
  revive/ultimate behaviour probed on the real battle code.
* **maps**: every map is instantiated with the real `G.MapScene` (so collision = engine collision):
  legend/deco chars, terrain & object ids registered, NPC/enemy/chest/event/warp positions, warp targets
  in-bounds and **not solid**, start walkable, bgm/particles/place ids, duplicate NPC/chest ids.
* **reach**: flood fill from every entry point (start, incoming warps, `S.warp` literals) — unreachable
  warps, chests, NPCs, events.
* **scripts** (regex over `js/maps/*.js`, `js/story/*.js`): `S.quest/battle/give/take/hasItem/shop/join/learn/
  warp/travel/visit/sfx/bgm`, `G.Music.play`, `S.say` speakers (`G.Names` + portrait + expression),
  `sprite:/portrait:/troop:/item:/bgm:` literals, emotes, particles, heart-lantern ids.
* **flags**: flags read (`S.has`, `flags.x`, `G.Flags.has`, data `learn.flag`/`req`) but never set.

Add a check: find the section in `validate.js`, call `err(cat, msg, {file, line, id})` or `warn(...)`;
use `SC.locate(file, id)` for a line number. Prove it fires by adding a broken case to
`fixtures/bad_map.js` and a needle to the *validator self-test* in `unit.js`.

## `unit.js` — engine logic

Tiny built-in framework: `test(name, fn)`, assertions `A.eq / near / deep / ok / throws / includes`.
Each test receives a **fresh** vm context with deterministic `qa_*` fixtures (characters, skills, items,
quest) injected into `G.Data`, so tests don't break when content changes. Helpers:
`setRandom(env, [values], rest)` fixes `Math.random` inside the game; `scene(G)` builds a battle scene
object (real `G.Battle.Scene.prototype`, no rendering) and `unit(G, {...})` a combatant, so formulas
are tested through the real `applyEffect / damage / startTurn / aiCommand / tryFlee` code;
`pump(G, null, sec)` steps the scene stack for dialogue/menu logic.

Add a test:
```js
test('inv: my new rule', ({ G }) => { G.Inv.add('qa_potion', 3); A.eq(G.Inv.count('qa_potion'), 3); });
```

## `e2e.js` — the real game

Each test opens its own browser context (clean localStorage) and collects **console errors, page
errors, unhandled rejections and `G.lastError`**; any of these fails the test (404s for not-yet-written
optional files are ignored). Driver helpers on `Session`:

* `open(query, {waitMap})` — e.g. `?debug&map=sandbox&lv=50`
* `key('z')`, `key('ArrowRight', holdMs)`, `frames(n)`, `top()` / `waitTop('MenuScene')`
* `ff(seconds, {until})` — **fast-forward**: runs the main-loop update (+ periodic draws) with a fixed
  dt in-page, yielding between steps, so battles/cutscenes run many times faster than real time
* `script('async (S) => {...}')` — runs a script through `G.Script.run`; result in `window.__qa.res`
* `drive(maxSec, choice)` — runs scripts to completion: holds Ctrl-skip, answers choices, auto-battles,
  closes shops/menus; returns `'idle' | 'timeout' | 'gameover' | 'stuck'`. Not idle while an auto event
  is about to start (`G.Debug.pendingAuto()`), so a chained cutscene is never mistaken for player control.
  `'stuck'` is the soft-lock detector: a script is busy on the map with nothing on screen for 15 game-s.

Scenario tests: boot/title render, title → menu → settings (every row changed, persisted, survives
reload), new game, movement & collision, pause menu (every panel visited with keys), save slot 1 →
load round-trip, dialogue (say/lines/choice/narrate/backlog), shop buy/sell, inn, flee (normal + boss),
defeat → GameOver → retry restores state → win, world travel, `S.warp` + autosave, roaming-enemy
encounter. Sweeps (parallel `--workers`): **every map** via `?debug&map=<id>` (renders, frame cost,
every NPC talked to, every event run) and **every troop** auto-battled by a lv 50 party with the best
gear (must resolve win/lose/flee within 900 game-seconds, return to the map, no NaN/negative state).
Frame cost > 16 ms is reported as a warning (headless software rendering is slower than a real GPU).

**The map sweep only pokes an idle map.** On load, the real game loop starts the map's entry auto
event at once. The sweep first lets it finish (`settle`). If that cutscene leaves the map (for example
`taixu` → `taixu_hall` or `citygod_vision` → `zhuqian_citygod`), the sweep returns to the map with the
state it left. It then talks to NPCs and fires events one at a time, and settles again before each one.
Firing an NPC or event while another script runs starts two scripts at once. The engine never does
this: `checkAuto`, touch events and interaction all wait for `!G.Script.busy()`. When it happens, one
script's `fadeOut` or `warp` orphans the other's pending `S.say` (`G.Dialog.close` drops the line's
resolver) or `S.move` (the warp replaces the player whose queue held it). That looked like a soft-lock
on `mist_loop`, `citygod_vision`, `mist_grove` and `taixu`, but no player can reach it. If a map
can't be brought to idle, the sweep warns and skips that map's remaining NPC and event checks.

3D: `--3d` keeps the game's default renderer (3D on). Add `--r3lite` to append `?r3lite` (half
resolution, no shadows or post-processing), which makes headless SwiftShader runs practical; add
`--slow 3` for the longer timeouts, e.g.
`node tools/test/e2e.js --3d --r3lite --slow 3 --only map --maps mist_loop`.

Add a scenario:
```js
test('mything', 'my feature works', async (s) => {
  await openOnMap(s, info);
  await s.script(`async (S) => { await S.say('baizhi', 'hi'); return 1; }`);
  await s.drive(10);
  assert(await s.ev(() => window.__qa.res === 1), 'script result');
});
```

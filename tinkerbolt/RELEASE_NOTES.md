# Release notes

## 0.3.0 (2026-10-29): playtest fixes
- Out of moves → **Continue: +5 moves** for 50 coins; stuck on screws → Extra slot (or a 50-coin +1 slot on hard levels).
- New special: a **2×2 square** makes a **fish** that swims to something your goals need.
- Striped + striped (and other combos) go off where the dragged candy landed.
- Tied (twine) candy now falls, so no empty holes stay on the board.
- Screw plates: a plate held by one screw **swings down** and uncovers what was behind it; plates are see-through.
- A screw only counts as covered when a plate really overlaps it (fixes red/green screws that looked free but would not move); tapping a covered screw flashes the plate in the way.
- **Tray full = lost**, like Screwdom; a "1 slot left!" warning shows first.
- Chapter 1 rebalanced with a move floor (14–16+) and bigger goals; chapter 2 regenerated and re-proven under the new rules.

## 0.2.0 (2026-10-29)
- Fixed: candies, icons and buttons drew blank on Safari / iPhone / the Claude apps (sprite cache exhausted WebKit's canvas memory). The cache is now bounded.
- The last restoration of each chapter (hang the sign, build the parade float) needs every level of that chapter won, so the ending comes after level 30.
- Clearer layered plates on screw levels (outlines); HARD badge no longer covers the level number.
- The game also starts when a host injects the scripts late (link previewers).
- New: strategy guide (`docs/guide/GUIDE.md`) with an annotated picture of every level and the optimal screw order.

## 0.1.0 (2026-10-29): first playable
- 30 levels: 15 match-3 (chapter 1), 15 screw sorting (chapter 2); hard level every 5th level.
- Shop restoration with a 3D clay diorama (2D picture fallback); story with Mr. Tinker, Mina and five toys.
- Lives (5, +1 per 20 min), daily login reward with unlimited-lives time, win-streak gift boxes.
- Level in progress saved after every move; closing the page resumes it.
- Sound effects and vibration with separate settings; no music; reduce-effects option; play stats with copy report.

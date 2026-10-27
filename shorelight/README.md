# 《彼岸燈》 Shorelight

> 一盞為渡海亡魂點亮的燈，一場環繞福爾摩沙的一年之旅。
> *A lantern lit for souls lost at sea — and a year-long journey around Formosa.*

**繁體中文 / English** — a 仙俠 (xianxia) role-playing game in the spirit of 《仙劍奇俠傳》(1995), rebuilt to a 2026 standard and set
in a fantasy version of ancient Taiwan. Play it in **Traditional Chinese or American English** (switch any time on the title
screen or in 設定 / Settings).

---

## 如何遊玩 · How to play (macOS)

**最簡單 / Easiest:** double-click **`Play Shorelight.command`**.
It opens the game in its own window (Google Chrome / Edge / Brave app mode; falls back to Safari or your default browser).
*First time only:* macOS may say the file is from an unidentified developer — right-click → **Open** → **Open**.

**Or** open `index.html` directly in Chrome or Safari. No internet connection, server or installation is needed —
all art is drawn in code, all music is synthesised live, and the Chinese calligraphic font is bundled.

**Native app (optional):** with Node.js installed, run in this folder:
```bash
npm install
npm start          # play in a desktop window
npm run dist       # build a macOS .dmg (on a Mac)
```

Saves live in the browser's local storage (8 slots + autosave). The launcher uses its own profile, so saves made through
`Play Shorelight.command` stay together.

## 操作 · Controls

| 動作 Action | 鍵盤 Keyboard | 手把 Gamepad |
|---|---|---|
| 移動 Move | 方向鍵 / WASD | D-pad / left stick |
| 決定・對話・調查 Confirm / talk / examine | Z / Space / Enter | A |
| 取消・選單 Cancel / menu | X / Esc | B / Start |
| 奔跑 Run | 按住 Shift | X / RB |
| 先制攻擊 Pre-emptive strike | 面對野外妖怪按 Z | A |
| 自動戰鬥・自動對話 Auto battle / auto text | F | Select |
| 戰鬥速度 Battle speed | E | — |
| 對話紀錄 Dialogue log | L | — |
| 快進 Fast-forward text | 按住 Ctrl | — |
| 全螢幕 Fullscreen | F11 / ⌘F | — |

## 特色 · Features
- **一年環島 · A journey around the whole island:** 九份 → 平溪 → 淡水・觀音山・艋舺 → 竹塹 → 鹿港 → 府城 → 阿里山・玉山・日月潭 → 北港 →
  打狗・東港・恆春・鵝鑾鼻 → 蘭嶼・台東・太魯閣・頭城 → 澎湖 → 黑水溝 → 彼岸. Real festivals and customs (雞籠中元祭, 平溪天燈, 鹽水蜂炮,
  媽祖遶境, 東港王船, 頭城搶孤…), regional food, folklore monsters (魔神仔, 虎姑婆, 林投姐…) and respectful portrayals of
  Taiwan's Indigenous peoples.
- **心燈 Heart Lanterns:** every person you truly help lights a lantern of memory. How many you light decides the ending.
- **Battle:** speed-based turn timeline, five-element (五行) weaknesses, 劍意 Sword Will ultimates with cinematic cut-ins,
  combo arts, status effects, multi-phase bosses, auto-battle, battle speed, retry after defeat.
- **Modern conveniences:** autosave, 8 save slots with thumbnails, dialogue log, auto/skip text, world map of the journey,
  quest log, bestiary, equipment comparison, difficulty settings, gamepad support, bilingual UI.
- **Sacred visions:** spirit mushrooms (靈視), a dream-vine rite, and a breakthrough into the kaleidoscopic 一息界.

## 製作 · Credits
Story, art, music and code: **Claude** & the Shorelight Team.
Font: [LXGW WenKai TC 霞鶩文楷](https://github.com/lxgw/LxgwWenkaiTC) — SIL Open Font License 1.1 (see `fonts/OFL.txt`).

## 開發者 · For developers
- Design docs: `docs/STORY_BIBLE.md` (繁中: `docs/STORY_BIBLE_zh.md`), `docs/CONTRACTS.md`, `docs/MAP_AUTHORING.md`;
  screenplays in `docs/story/`.
- Debug URLs: `index.html?debug&map=<id>`, `?debug&startch=<n>`, `?debug&battle=<troop>&lv=<n>&auto=1`; F2 opens the debug menu.
- Tests: `bash tools/test/run.sh` (content validation, unit tests, end-to-end browser tests, chapter playthroughs).
- Translation coverage: `node tools/i18n/extract.js`. Font bundle: `python3 tools/build_font.py`.

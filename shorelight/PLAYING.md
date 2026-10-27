# 《彼岸燈》 Shorelight — 遊玩說明 · How to Play

[繁體中文](#繁體中文) · [English](#english)

---

## 繁體中文

### 在 Mac 上遊玩（建議）

1. 解壓縮 `Shorelight-….zip`，會得到 **Shorelight** 資料夾（可放在任何位置，路徑含空白或中文都沒問題）。
2. 雙擊 **`Play Shorelight.command`**。遊戲會以獨立視窗開啟（使用 Google Chrome、Microsoft Edge、Brave 或 Chromium 的「App 模式」）；若都沒有安裝，會改用 Safari 或預設瀏覽器。
3. **第一次開啟時**，macOS 可能提示「無法確認開發者」：
   - 在檔案上 **按右鍵（或 Control＋點按）→「打開」→「打開」**。之後即可直接雙擊。
   - **macOS 15 Sequoia 以後**：先雙擊一次（會被阻擋），再到 **系統設定 → 隱私權與安全性**，在下方按 **「強制打開」**。
   - 或在「終端機」執行一次：`xattr -dr com.apple.quarantine ~/Downloads/Shorelight`（請換成實際資料夾路徑）。

完全離線，不需網路、伺服器或安裝。美術以程式繪製、音樂即時合成、霞鶩文楷字型已內建。

> **Safari**：可以正常遊玩（WebGL 2、音效、存檔皆支援）。建議用「顯示方式 → 進入全螢幕」(⌃⌘F)。Safari 的存檔與 Chrome 的存檔互不相通。

### 在任何作業系統用 Chrome 遊玩

Windows、Linux 或 Mac 皆可：用 Google Chrome（或 Edge、Brave）開啟資料夾內的 **`index.html`**——把檔案拖進瀏覽器視窗，或按 ⌘O / Ctrl+O 選擇它。網址列會顯示 `file:///…/index.html`，這是正常的。

### 操作

| 動作 | 鍵盤 | 手把 |
|---|---|---|
| 移動 | 方向鍵 / WASD | 十字鍵 / 左搖桿 |
| 決定・對話・調查 | Z / 空白鍵 / Enter（或滑鼠左鍵） | A |
| 取消 | X / Esc / Backspace（或滑鼠右鍵） | B |
| 開啟選單（地圖上） | X / Esc / C / M / Tab | Y / Start |
| 奔跑 | 按住 Shift（設定中可改為預設奔跑） | X / RB |
| 先制攻擊 | 面對野外妖怪按 Z | A |
| 自動戰鬥 / 對話自動播放 | F | Back / Select |
| 戰鬥速度（戰鬥中） | E | — |
| 旋轉鏡頭（3D 地圖） | Q / E | LB / RB |
| 對話紀錄 | L | — |
| 快進對話 | 按住 Ctrl 或 ⌘ | — |
| 全螢幕 | ⌘F（Mac）/ F11 / Alt+Enter，或 設定 → 全螢幕 | — |

### 語言（中文 / English）

- 標題畫面選單中有 **English / 繁體中文** 選項，可隨時切換。
- 遊戲中：選單 → **設定 → 語言 Language**。
- 第一次啟動時依系統語言決定：系統為中文則顯示繁體中文，否則顯示英文。設定會被記住。

### 3D 畫面與低規格電腦

- **設定 → 3D 畫面：開 / 關**（重新啟動後生效；按 ⌘R 重新載入即可）。關閉時使用 2D 手繪畫面，任何電腦都很流暢。
- **設定 → 畫質：超高 / 高 / 省電**（重新啟動後生效）。
- **輕量 3D 模式 `?r3lite`**（半解析度、無陰影、無後製特效），適合舊款 MacBook Air 或內建顯示晶片：
  - 用 Chrome 開啟時，在網址後面加上 `?r3lite`，例如 `file:///Users/你/Shorelight/index.html?r3lite`。
  - 用啟動器時，在「終端機」執行：`"/路徑/Shorelight/Play Shorelight.command" lite`
- 若瀏覽器不支援 WebGL，遊戲會自動改用 2D 畫面。

### 存檔位置

遊戲有 8 個存檔欄位＋自動存檔，存在瀏覽器的 localStorage 中：

| 開啟方式 | 存檔位置 |
|---|---|
| `Play Shorelight.command`（Chrome / Edge / Brave） | `~/Library/Application Support/Shorelight/browser-profile/`（專用設定檔，不影響平常瀏覽） |
| 桌面版 App（Electron） | `~/Library/Application Support/Shorelight/electron-profile/` |
| 直接用 Chrome 開 `index.html` | 該瀏覽器平常的設定檔（Mac：`~/Library/Application Support/Google/Chrome/`；Windows：`%LOCALAPPDATA%\Google\Chrome\User Data\`） |
| Safari | Safari 的網站資料 |

- 搬移遊戲資料夾不會遺失 Chrome 系列的存檔。
- **清除瀏覽器的「網站資料／Cookie」會刪除存檔。** 要備份，請在遊戲關閉時複製上表的資料夾。
- 不同開啟方式的存檔互不相通（例如啟動器的存檔不會出現在 Safari）。

### 製作桌面版 App（選用，需在 Mac 上）

需要 [Node.js](https://nodejs.org) 18 以上。在 Shorelight 資料夾中於「終端機」執行：

```bash
npm install        # 下載 Electron 與 electron-builder（只需一次）
npm start          # 以桌面視窗直接遊玩（開發模式，可用開發者工具）
npm run dist       # 產生 dist/Shorelight-1.0.0-universal.dmg（Intel 與 Apple 晶片通用）
```

- 視窗為 1280×720，可調整大小；選單「View → 全螢幕」（⌃⌘F）或遊戲內 ⌘F 切換全螢幕。正式版不含開發者工具。
- 未簽署的 App 第一次開啟時同樣需要「右鍵 → 打開」；若出現「已損毀」，請執行 `xattr -cr /Applications/Shorelight.app`。
- 若要對外發佈，可使用 Apple Developer ID 簽署與公證（electron-builder 會自動使用鑰匙圈中的憑證）。

---

## English

### Playing on a Mac (recommended)

1. Unzip `Shorelight-….zip`. You get a **Shorelight** folder — put it anywhere (spaces or Chinese characters in the path are fine).
2. Double-click **`Play Shorelight.command`**. The game opens in its own window (Google Chrome, Microsoft Edge, Brave or Chromium "app mode"); if none is installed it uses Safari or your default browser.
3. **First time only**, macOS may say the file is from an unidentified developer:
   - **Right-click (or Control-click) the file → Open → Open.** After that, a normal double-click works.
   - **macOS 15 Sequoia and later:** double-click once (it is blocked), then go to **System Settings → Privacy & Security** and click **Open Anyway**.
   - Or run once in Terminal: `xattr -dr com.apple.quarantine ~/Downloads/Shorelight` (use your actual folder path).

Fully offline: no internet, server or installation. All art is drawn in code, music is synthesised live, and the LXGW WenKai calligraphic font is bundled.

> **Safari** works too (WebGL 2, audio and saves are all supported). Use View → Enter Full Screen (⌃⌘F). Safari saves and Chrome saves are separate.

### Playing in Chrome on any OS

On Windows, Linux or macOS: open **`index.html`** from the folder in Google Chrome (or Edge / Brave) — drag the file into a browser window, or press ⌘O / Ctrl+O and pick it. The address bar shows `file:///…/index.html`; that is expected.

### Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | Arrow keys / WASD | D-pad / left stick |
| Confirm, talk, examine | Z / Space / Enter (or left click) | A |
| Cancel | X / Esc / Backspace (or right click) | B |
| Open menu (on the map) | X / Esc / C / M / Tab | Y / Start |
| Run | Hold Shift (or turn on "always run" in Settings) | X / RB |
| Pre-emptive strike | Face a roaming monster and press Z | A |
| Auto battle / auto-advance text | F | Back / Select |
| Battle speed (in battle) | E | — |
| Rotate camera (3D maps) | Q / E | LB / RB |
| Dialogue log | L | — |
| Fast-forward text | Hold Ctrl or ⌘ | — |
| Full screen | ⌘F (Mac) / F11 / Alt+Enter, or Settings → Full screen | — |

### Language (中文 / English)

- The title-screen menu has an **English / 繁體中文** entry — switch any time.
- In game: Menu → **Settings → 語言 Language**.
- On first launch the game follows the system language (Chinese system → Traditional Chinese, otherwise English). The choice is remembered.

### 3D graphics and low-spec computers

- **Settings → 3D 畫面 (3D view): On / Off** (applies after a restart — press ⌘R to reload). Off uses the hand-drawn 2D view, which runs smoothly on any computer.
- **Settings → 畫質 (Quality): Ultra / High / Power-saving** (applies after a restart).
- **Light 3D mode `?r3lite`** (half resolution, no shadows, no post-processing) for older MacBook Airs or integrated graphics:
  - In Chrome, add `?r3lite` to the address, e.g. `file:///Users/you/Shorelight/index.html?r3lite`.
  - With the launcher, run in Terminal: `"/path/to/Shorelight/Play Shorelight.command" lite`
- If the browser has no WebGL, the game switches to the 2D view automatically.

### Where saves live

There are 8 save slots plus an autosave, kept in the browser's localStorage:

| How you play | Save location |
|---|---|
| `Play Shorelight.command` (Chrome / Edge / Brave) | `~/Library/Application Support/Shorelight/browser-profile/` (a dedicated profile, separate from your normal browsing) |
| Desktop app (Electron) | `~/Library/Application Support/Shorelight/electron-profile/` |
| `index.html` opened directly in Chrome | That browser's normal profile (Mac: `~/Library/Application Support/Google/Chrome/`; Windows: `%LOCALAPPDATA%\Google\Chrome\User Data\`) |
| Safari | Safari's website data |

- Moving the game folder does not lose Chrome-family saves.
- **Clearing the browser's "site data / cookies" deletes saves.** To back up, copy the folder above while the game is closed.
- Saves don't carry across ways of playing (e.g. launcher saves don't appear in Safari).

### Building the desktop app (optional, on a Mac)

Requires [Node.js](https://nodejs.org) 18 or later. In Terminal, inside the Shorelight folder:

```bash
npm install        # fetches Electron and electron-builder (once)
npm start          # play in a desktop window (development mode, DevTools available)
npm run dist       # builds dist/Shorelight-1.0.0-universal.dmg (Intel + Apple silicon)
```

- The window is 1280×720 and resizable; toggle full screen with View → Full Screen (⌃⌘F) or ⌘F in game. The packaged app has no DevTools.
- An unsigned app also needs right-click → Open the first time; if macOS says it is "damaged", run `xattr -cr /Applications/Shorelight.app`.
- For public distribution, sign and notarise with an Apple Developer ID (electron-builder picks up the certificate from your keychain).

---

Credits & licenses: see `LICENSES.txt` and `fonts/OFL.txt` (LXGW WenKai TC, SIL Open Font License 1.1; three.js, MIT).

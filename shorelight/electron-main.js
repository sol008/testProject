// Optional native wrapper for 彼岸燈 Shorelight.
//   npm install && npm start    run the game in a desktop window (development: DevTools available)
//   npm run dist                build a macOS .dmg (on a Mac) → dist/Shorelight-<version>-universal.dmg
// The game itself is unchanged: index.html is loaded over file:// exactly as in a browser.
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('path');

// DevTools only when running unpackaged (npm start) or with SHORELIGHT_DEBUG=1.
const DEV = !app.isPackaged || process.env.SHORELIGHT_DEBUG === '1';

// Saves (localStorage) live in Electron's userData. Pin it to a fixed folder so `npm start` and the packaged app
// share saves, and so everything Shorelight stores sits in one place next to the browser launcher's profile:
//   macOS: ~/Library/Application Support/Shorelight/electron-profile
app.setPath('userData', path.join(app.getPath('appData'), 'Shorelight', 'electron-profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 720,            // the game's native 16:9 resolution
    useContentSize: true,   // ... measured inside the title bar
    minWidth: 960,
    minHeight: 540,
    show: false,
    backgroundColor: '#05060a',
    title: '彼岸燈 Shorelight',
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: DEV,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  // The game never navigates; keep it that way (no stray drops / links replacing the game page).
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, 'index.html'));
}

function buildMenu() {
  const fullscreen = { label: '全螢幕 Full Screen', role: 'togglefullscreen', accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11' };
  // Reload (⌘R) applies the settings marked 「重新啟動後生效」 (3D view, quality) without quitting.
  const view = [fullscreen, { label: '重新載入 Reload', role: 'reload' }];
  if (DEV) view.push({ type: 'separator' }, { role: 'toggleDevTools' });
  if (process.platform === 'darwin') {
    return Menu.buildFromTemplate([
      { label: '彼岸燈', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] },
      { label: 'View', submenu: view },
      { role: 'windowMenu' },
    ]);
  }
  // Windows / Linux: a single hidden View menu (Alt shows it) — replaces Electron's default menu, whose
  // View → Toggle Developer Tools would otherwise be reachable in production.
  return Menu.buildFromTemplate([{ label: 'View', submenu: view }]);
}

if (!app.requestSingleInstanceLock()) {
  // a second copy would fight over the save database — just focus the running one
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildMenu());
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  // make sure the latest save is on disk before the process exits
  app.on('before-quit', () => { try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ } });
  app.on('window-all-closed', () => {
    try { session.defaultSession.flushStorageData(); } catch (e) { /* ignore */ }
    if (process.platform !== 'darwin') app.quit();
  });
}

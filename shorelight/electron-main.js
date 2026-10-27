// Optional native wrapper: `npm install && npm start` runs Shorelight as a desktop app;
// `npm run dist` builds a macOS .app / .dmg (requires macOS).
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 560,
    backgroundColor: '#05060a',
    title: '彼岸燈 Shorelight',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, backgroundThrottling: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: '彼岸燈', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'togglefullscreen' }, { type: 'separator' }, { role: 'quit' }] },
    ]));
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

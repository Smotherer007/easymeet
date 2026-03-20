/**
 * EasyMeet Desktop – lädt die Web-App per URL (Vite-Dev oder Deployment).
 *
 * Start-URL (Priorität):
 * 1. CLI: --easymeet-url=https://...
 * 2. Umgebung: EASYMEET_URL
 * 3. Standard: öffentliche Demo
 */
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const DEFAULT_URL = 'https://easymeet.easyroomtools.tech/';

function resolveStartUrl() {
  const fromArg = process.argv.find((a) => a.startsWith('--easymeet-url='));
  if (fromArg) {
    const u = fromArg.slice('--easymeet-url='.length).trim();
    if (u) return u;
  }
  if (process.env.EASYMEET_URL && String(process.env.EASYMEET_URL).trim()) {
    return String(process.env.EASYMEET_URL).trim();
  }
  return DEFAULT_URL;
}

function createWindow() {
  const startUrl = resolveStartUrl();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'EasyMeet',
  });

  win.once('ready-to-show', () => win.show());

  win.loadURL(startUrl).catch((err) => {
    console.error('[easymeet-electron] loadURL failed:', err?.message || err);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

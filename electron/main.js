/**
 * EasyMeet desktop — load web app, remember server URL, app menu.
 *
 * Start URL (priority):
 * 1. CLI: --easymeet-url=https://…
 * 2. Env: EASYMEET_URL
 * 3. Saved: userData/easymeet-electron-config.json
 * 4. Default demo URL
 */
const { app, BrowserWindow, shell, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const configStorage = require('./config-storage');

const DEFAULT_URL = 'https://easymeet.easyroomtools.tech/';

let mainWindow = null;
let settingsWindow = null;

function getIconPath() {
  const p = path.join(__dirname, 'assets', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

function tryNormalizeUrl(u) {
  try {
    return configStorage.normalizeBaseUrl(String(u).trim());
  } catch {
    return null;
  }
}

function resolveStartUrl() {
  const fromArg = process.argv.find((a) => a.startsWith('--easymeet-url='));
  if (fromArg) {
    const u = fromArg.slice('--easymeet-url='.length).trim();
    if (u) return tryNormalizeUrl(u) || u;
  }
  if (process.env.EASYMEET_URL && String(process.env.EASYMEET_URL).trim()) {
    const u = String(process.env.EASYMEET_URL).trim();
    return tryNormalizeUrl(u) || u;
  }
  const saved = configStorage.getSavedBaseUrl();
  if (saved) return saved;
  return DEFAULT_URL;
}

/** After saving config (CLI/env still take precedence). */
function resolveUrlAfterConfigSave() {
  const fromArg = process.argv.find((a) => a.startsWith('--easymeet-url='));
  if (fromArg) {
    const u = fromArg.slice('--easymeet-url='.length).trim();
    if (u) return tryNormalizeUrl(u) || u;
  }
  if (process.env.EASYMEET_URL && String(process.env.EASYMEET_URL).trim()) {
    const u = String(process.env.EASYMEET_URL).trim();
    return tryNormalizeUrl(u) || u;
  }
  return configStorage.getSavedBaseUrl() || DEFAULT_URL;
}

function createMainWindow() {
  const startUrl = resolveStartUrl();
  const icon = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    show: false,
    ...(icon ? { icon: nativeImage.createFromPath(icon) } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'EasyMeet',
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.loadURL(startUrl).catch((err) => {
    console.error('[easymeet-electron] loadURL failed:', err?.message || err);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  const icon = getIconPath();
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 300,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    parent,
    modal: Boolean(parent),
    show: false,
    ...(icon ? { icon: nativeImage.createFromPath(icon) } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'EasyMeet – Server',
  });

  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function buildMenu() {
  const serverItem = {
    label: 'Server-Adresse…',
    click: () => openSettingsWindow(),
  };

  const macAppMenu = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      serverItem,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  const fileMenuWinLinux = {
    label: 'Datei',
    submenu: [serverItem, { type: 'separator' }, { role: 'quit' }],
  };

  const template =
    process.platform === 'darwin'
      ? [macAppMenu, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]
      : [fileMenuWinLinux, { role: 'editMenu' }, { role: 'viewMenu' }];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  ipcMain.handle('easymeet-settings:get-saved-url', () => {
    const raw = configStorage.readConfig().baseUrl;
    return typeof raw === 'string' ? raw : '';
  });

  ipcMain.handle('easymeet-settings:get-default-url', () => DEFAULT_URL);

  ipcMain.handle('easymeet-settings:save-url', (_event, url) => {
    try {
      const trimmed = String(url ?? '').trim();
      configStorage.setSavedBaseUrl(trimmed);
      const next = resolveUrlAfterConfigSave();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(next).catch((err) => {
          console.error('[easymeet-electron] loadURL after save failed:', err?.message || err);
        });
      }
      return { ok: true };
    } catch (e) {
      const code = e?.message;
      const map = {
        INVALID_URL: 'Invalid URL.',
        INVALID_SCHEME: 'Only http:// and https:// are allowed.',
      };
      return { ok: false, error: map[code] || 'Save failed.' };
    }
  });

  ipcMain.on('easymeet-settings:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  });
}

app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  const icon = getIconPath();
  if (icon && process.platform === 'darwin') {
    try {
      app.dock.setIcon(nativeImage.createFromPath(icon));
    } catch (_) {
      /* ignore */
    }
  }
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

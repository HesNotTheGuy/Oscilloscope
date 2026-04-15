'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let win;
let displayWin = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#080808',
    autoHideMenuBar: true,
    title: 'DSO-1 Oscilloscope',
    icon: path.join(__dirname, 'icon.ico'),
    // Native min/max/close controls remain, but the bar background and
    // button colors are themed to match the dark UI.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#00ff41',
      height: 32,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Grant microphone + media permissions automatically
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });

  win.loadFile('index.html');
}

// ── Display window IPC ────────────────────────────────────────────────────────

ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Display ${i + 1} (${d.size.width}×${d.size.height})`,
    bounds: d.bounds,
    primary: d.id === screen.getPrimaryDisplay().id,
  }));
});

ipcMain.handle('open-display', (_event, opts = {}) => {
  if (displayWin && !displayWin.isDestroyed()) {
    displayWin.focus();
    return;
  }

  const fullscreen = opts.fullscreen || false;
  const displayId  = opts.displayId  || null;

  let targetBounds = null;
  if (fullscreen && displayId) {
    const target = screen.getAllDisplays().find(d => d.id === displayId);
    if (target) targetBounds = target.bounds;
  }

  const winOpts = {
    width: targetBounds ? targetBounds.width : 1280,
    height: targetBounds ? targetBounds.height : 800,
    minWidth: fullscreen ? undefined : 640,
    minHeight: fullscreen ? undefined : 400,
    x: targetBounds ? targetBounds.x : undefined,
    y: targetBounds ? targetBounds.y : undefined,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'DSO-1 — Display',
    icon: path.join(__dirname, 'icon.ico'),
    frame: !fullscreen,
    fullscreen: fullscreen,
    alwaysOnTop: fullscreen,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-display.js'),
    },
  };

  displayWin = new BrowserWindow(winOpts);
  displayWin.loadFile('display.html');

  if (fullscreen) {
    displayWin.setMenuBarVisibility(false);
  }

  displayWin.on('closed', () => {
    displayWin = null;
    if (win && !win.isDestroyed()) {
      win.webContents.send('display-closed');
    }
  });
});

ipcMain.on('close-display', () => {
  if (displayWin && !displayWin.isDestroyed()) displayWin.close();
});

// Display window can request its own close (Escape key / overlay X)
ipcMain.on('display-request-close', () => {
  if (displayWin && !displayWin.isDestroyed()) displayWin.close();
});

// Forward captured frames from controls window → display window
ipcMain.on('display-frame', (_event, dataURL) => {
  if (displayWin && !displayWin.isDestroyed()) {
    displayWin.webContents.send('display-frame-fwd', dataURL);
  }
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

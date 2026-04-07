'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
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

ipcMain.handle('open-display', () => {
  if (displayWin && !displayWin.isDestroyed()) {
    displayWin.focus();
    return;
  }
  displayWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    title: 'DSO-1 — Display',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-display.js'),
    },
  });
  displayWin.loadFile('display.html');

  displayWin.on('closed', () => {
    displayWin = null;
    // Notify the controls window so the button resets
    if (win && !win.isDestroyed()) {
      win.webContents.send('display-closed');
    }
  });
});

ipcMain.on('close-display', () => {
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

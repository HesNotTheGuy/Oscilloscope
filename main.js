'use strict';

const { app, BrowserWindow, session } = require('electron');
const path = require('path');

// Keep a global reference to prevent GC-triggered close
let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#080808',
    autoHideMenuBar: true,
    title: 'DSO-1 Oscilloscope',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Grant microphone + media permissions automatically
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  // Also handle the newer permission check handler (Electron 20+)
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media';
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

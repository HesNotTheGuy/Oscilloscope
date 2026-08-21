'use strict';

const { app, BrowserWindow, ipcMain, screen, session, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let win;
let displayWin = null;
let splashWin = null;

// Every window here loads a bundled local file and the app has no outbound
// links. Anything that tries to navigate away — a dropped file, a stray
// link — would land on foreign content that still inherits the preload
// bridge, so refuse navigation and window.open outright.
function hardenNavigation(wc) {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.on('will-attach-webview', (e) => e.preventDefault());
}

// Frameless splash shown instantly on launch so a slow (or hung) startup
// never looks like a dead app. Closed when the main window is ready.
function createSplash() {
  splashWin = new BrowserWindow({
    width: 500,
    height: 340,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    icon: path.join(__dirname, process.platform === 'darwin' ? 'icon.png' : 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  hardenNavigation(splashWin.webContents);
  splashWin.loadFile('splash.html');
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  const winOpts = {
    width: 1280,
    height: 960,
    minWidth: 800,
    minHeight: 600,
    show: false, // stay hidden until ready-to-show; splash covers the gap
    backgroundColor: '#080808',
    autoHideMenuBar: true,
    title: 'DSO-1 Oscilloscope',
    icon: path.join(__dirname, isMac ? 'icon.png' : 'icon.ico'),
    // Native min/max/close controls remain, but the bar background and
    // button colors are themed to match the dark UI (win/linux only).
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  };

  if (!isMac) {
    winOpts.titleBarOverlay = {
      color: '#0a0a0a',
      symbolColor: '#00ff41',
      height: 32,
    };
  }

  win = new BrowserWindow(winOpts);
  hardenNavigation(win.webContents);

  // Grant microphone + media + MIDI permissions automatically
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'midi');
  });
  win.webContents.session.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'midi';
  });

  // Grant system-audio loopback without a picker (Windows WASAPI loopback).
  // A video source is required by the API; the renderer discards it immediately.
  // An empty callback({}) cancels the request, which rejects the renderer's
  // getDisplayMedia() promise. Without it a failed/empty enumeration would
  // leave that promise pending forever and the UI stuck "connecting".
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
      if (!sources.length) {
        console.error('[display-media] no screen sources available');
        callback({});
        return;
      }
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(err => {
      console.error('[display-media] getSources failed:', err);
      callback({});
    });
  }, { useSystemPicker: false });

  // Swap splash → main window once the UI has actually painted.
  const showMain = () => {
    if (splashWin && !splashWin.isDestroyed()) splashWin.close();
    splashWin = null;
    if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  };
  win.once('ready-to-show', showMain);
  // Safety net: if the renderer hangs, show the main window anyway so the
  // splash can never trap the user. showMain() is idempotent.
  setTimeout(showMain, 20000);

  win.loadFile('index.html');
}

// ── OBJ library IPC ───────────────────────────────────────────────────────────

// The renderer stores absolute paths of OBJ models the user dropped in, so the
// library can reload them next launch. Deliberately narrow: .obj text only, and
// size-capped, so this stays a model loader rather than a general file-read
// primitive handed to the renderer.
const OBJ_MAX_BYTES = 64 * 1024 * 1024;

ipcMain.handle('read-file', async (_event, filePath) => {
  if (typeof filePath !== 'string' || !filePath) throw new Error('invalid path');
  if (path.extname(filePath).toLowerCase() !== '.obj') throw new Error('only .obj files may be read');
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('not a file');
  if (stat.size > OBJ_MAX_BYTES) throw new Error('file too large');
  return fs.readFile(filePath, 'utf8');
});

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
    icon: path.join(__dirname, process.platform === 'darwin' ? 'icon.png' : 'icon.ico'),
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
  hardenNavigation(displayWin.webContents);
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

app.whenReady().then(() => {
  createSplash();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

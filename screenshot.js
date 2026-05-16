/**
 * DSO-1 Automated Screenshot Script
 * Run:  node_modules\.bin\electron.cmd screenshot.js
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

// ─── Asset paths ──────────────────────────────────────────────────────────────
// Set these to your own local files for screenshot automation
const AUDIO_FILE = '';  // e.g. 'C:\\path\\to\\song.mp3'
const IMAGE_FILE = '';  // e.g. 'C:\\path\\to\\image.png'

const OUT_DIR = path.join(__dirname, 'docs', 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 1400, H = 820;

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.handle('read-file', (_e, fp) => fs.promises.readFile(fp, 'utf8'));

// ─── Local file server — serves asset files as Blobs to the renderer ──────────
let fileServerPort = 0;
function startFileServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      // URL: /audio or /image
      const filePath = req.url === '/audio' ? AUDIO_FILE : IMAGE_FILE;
      const ext = path.extname(filePath).toLowerCase();
      const mime = { '.mp3': 'audio/mpeg', '.png': 'image/png',
                     '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
      res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      fileServerPort = server.address().port;
      console.log(`  File server on port ${fileServerPort}`);
      resolve(server);
    });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function exec(win, code) {
  try {
    return await win.webContents.executeJavaScript(code, true);
  } catch(e) {
    console.warn('  [js]', e.message.slice(0, 120));
  }
}

async function waitForDso(win, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const ok = await win.webContents.executeJavaScript(
        `typeof window._dso !== 'undefined' && window._dso.scope != null`, true
      );
      if (ok) return true;
    } catch (_) {}
    await sleep(300);
  }
  return false;
}

async function shot(win, file, desc) {
  // Retry up to 3 times — capturePage can return empty if frame not ready
  for (let attempt = 0; attempt < 3; attempt++) {
    const img = await win.webContents.capturePage();
    const buf = img.toPNG();
    if (buf.length > 100) {
      fs.writeFileSync(path.join(OUT_DIR, file), buf);
      console.log(`  ✓  ${file.padEnd(36)} ${desc}`);
      return;
    }
    await sleep(500);
  }
  console.warn(`  ✗  ${file.padEnd(36)} EMPTY — capturePage failed`);
}

// ─── Renderer-side JS blocks ───────────────────────────────────────────────────

const APPLY_STUDIO_RIG = `
(() => {
  const store = document.getElementById('panel-store');
  const zones = {
    left:   document.getElementById('zone-left'),
    under:  document.getElementById('zone-under'),
    right:  document.getElementById('zone-right'),
    bottom: document.getElementById('zone-bottom'),
  };
  const studio = {
    left:   ['ch1', 'ch2', 'horiz', 'trig'],
    under:  ['audio', 'presets'],
    right:  ['beamfx', 'sigfx', 'scene', 'display'],
    bottom: ['ctrl', 'siggen'],
  };
  // Panels may be anywhere (store OR zones) — query from entire document
  const all = Array.from(document.querySelectorAll('.fp-section[data-panel-id]'));
  // Reset: move all back to store first
  all.forEach(s => store.appendChild(s));
  // Distribute into zones per studio layout
  Object.entries(studio).forEach(([zk, ids]) => {
    ids.forEach(id => {
      const sec = document.querySelector('[data-panel-id="' + id + '"]');
      if (sec && zones[zk]) zones[zk].appendChild(sec);
    });
  });
  // Expand all collapsed panels
  document.querySelectorAll('.fp-section.collapsed').forEach(s => s.classList.remove('collapsed'));
  return 'rig-ok';
})()
`;

const BOOT_AUDIO = `
(async () => {
  await window._dso.ensureAudio();
  return 'audio-ok';
})()
`;

// Load audio file via local file server, play it
function LOAD_AND_PLAY_AUDIO(port) {
  return `
  (async () => {
    const { engine: e } = window._dso;
    const resp = await fetch('http://127.0.0.1:${port}/audio');
    const ab   = await resp.arrayBuffer();
    e.buffer   = await e.actx.decodeAudioData(ab);
    e.pauseOffset = 12;   // start 12s in so it's past any intro silence
    e.play();
    return 'playing';
  })()
  `;
}

// Load image file via local file server into _imgScene
function LOAD_IMAGE(port) {
  return `
  (async () => {
    const { scope: s } = window._dso;
    const resp = await fetch('http://127.0.0.1:${port}/image');
    const blob = await resp.blob();
    const file = new File([blob], 'theguy.png', { type: 'image/png' });
    s.obj3dMode = false;
    s.objMode   = true;
    const ok = await s._imgScene.load(file);
    return ok ? 'img-loaded' : 'img-failed';
  })()
  `;
}

function START_GEN(freqL, freqR, phase, wave = 'sine') {
  return `
  (() => {
    const { scope: s, sigGen: sg, engine: e } = window._dso;
    // Stop idle signal — it adds equal signal to both analysers, corrupting XY mode
    e._stopIdleSignal?.();
    sg.stop();
    sg.freqL = ${freqL}; sg.freqR = ${freqR};
    sg.phase = ${phase};
    sg.waveform = '${wave}';
    sg.amplitude = 0.85;
    sg.start(e.analyserL, e.analyserR);
    s.mode = 'XY';
    // 2V/div so figures fit on screen — default 500mV makes them clip off-screen
    s.ch1.vdiv = {v: 2, label: '2V'}; s.ch1.vdivIdx = 5;
    s.ch2.vdiv = {v: 2, label: '2V'}; s.ch2.vdivIdx = 5;
    document.getElementById('btn-xy')?.classList.add('active');
    document.getElementById('btn-yt')?.classList.remove('active');
    return 'gen-ok';
  })()
  `;
}

const YT_MODE = `
(() => {
  const { scope: s, sigGen: sg } = window._dso;
  sg.stop();
  s.mode = 'YT';
  document.getElementById('btn-yt')?.classList.add('active');
  document.getElementById('btn-xy')?.classList.remove('active');
  return 'yt';
})()
`;

const STOP_GEN = `
(() => { window._dso.sigGen.stop(); return 'stopped'; })()
`;

const RESET_FX = `
(() => {
  const { scope: s } = window._dso;
  s.objMode = false;
  s.color = '#00ff41';
  s.beamWidth = 1.5; s.glowAmount = 12; s.persistence = 0.15;
  s.smooth = false; s.filterEnabled = false;
  s.showGrid = true; s.crtCurve = true; s.showMeasure = true;
  s.sceneColor = '';
  // Restore V/DIV to 500mV default
  s.ch1.vdiv = {v: 0.5, label: '500mV'}; s.ch1.vdivIdx = 3;
  s.ch2.vdiv = {v: 0.5, label: '500mV'}; s.ch2.vdivIdx = 3;
  Object.assign(s.fx, {
    reactive: false, beatFlash: false, bloom: false,
    mirrorX: false, mirrorY: false, rotation: false,
    afterglow: false, beatInvert: false,
    bloomStr: 1.0, reactiveStr: 1.0, afterglowSpeed: 0,
    afterglowStr: 0.7, _angle: 0, _flash: 0,
  });
  return 'reset';
})()
`;

// Flush the phosphor buffer — prevents previous shot trails bleeding into next shot.
// Sets persistence=0 (full clear each frame) and waits 500ms (~30 frames), then restores.
const FLUSH_PHOSPHOR = `
(() => {
  const { scope: s } = window._dso;
  s._flushPersistence = s.persistence;
  s.persistence = 0;
  return 'flushing';
})()
`;
const RESTORE_PERSISTENCE = `
(() => {
  const { scope: s } = window._dso;
  if (s._flushPersistence !== undefined) { s.persistence = s._flushPersistence; delete s._flushPersistence; }
  return 'restored';
})()
`;

function SET(props) {
  return `(() => { const { scope: s } = window._dso; ${props} return 'set'; })()`;
}

function SHOW_PANEL(id) {
  return `
  (() => {
    const sec = document.querySelector('[data-panel-id="${id}"]');
    if (sec) { sec.classList.remove('collapsed'); sec.scrollIntoView({ block: 'nearest' }); }
    return '${id}';
  })()
  `;
}

// Set image trace mode
function IMG_MODE(mode, threshold = 40) {
  return `
  (() => {
    const img = window._dso.scope._imgScene;
    img.traceMode  = '${mode}';
    img.threshold  = ${threshold};
    img._computeTrace();
    return '${mode}';
  })()
  `;
}

// Set scene motion FX
function MOTION(props) {
  return `
  (() => {
    const { scope: s } = window._dso;
    const obj = s._obj; const img = s._imgScene;
    ${props}
    return 'motion-set';
  })()
  `;
}

// ─── Shot sequence ────────────────────────────────────────────────────────────
async function runShots(win, port) {
  const go   = code => exec(win, code);
  const wait = sleep;

  // Flush helper — clears phosphor buffer so previous shot doesn't bleed in
  const flush = async () => {
    await go(FLUSH_PHOSPHOR);
    await wait(500);   // ~30 frames at 60fps fully clears the buffer
    await go(RESTORE_PERSISTENCE);
  };

  // Always scroll to top before capturing — SHOW_PANEL's scrollIntoView
  // drags the page down and pushes the scope canvas off-screen otherwise.
  const snap = async (f, d) => {
    await go(`(() => { window.scrollTo(0, 0); return 'scroll'; })()`);
    await wait(80);
    return shot(win, f, d);
  };

  // ── v1.3.0 Feature screenshots only ───────────────────────────────────────

  // Set up a nice baseline signal so the scope looks alive
  await go(RESET_FX); await go(YT_MODE);
  await go(`(() => { const { engine: e } = window._dso; e.startIdleSignal?.(); return 'idle'; })()`);
  await go(SET(`s.glowAmount=14; s.beamWidth=1.6; s.persistence=0.25;`));
  await wait(1500);

  // Close all menus — both use the hidden attribute, not CSS classes
  const closeMenus = async () => {
    await go(`(() => {
      const rm = document.getElementById('rec-menu');
      const wm = document.getElementById('rig-menu');
      if (rm) rm.hidden = true;
      if (wm) wm.hidden = true;
      return 'menus-closed';
    })()`);
    await wait(100);
  };

  await closeMenus();

  // 30 Record split-button menu open
  await go(`(() => { const rm = document.getElementById('rec-menu'); if(rm) rm.hidden = false; return 'rec-menu'; })()`);
  await wait(400);
  await snap('30-record-menu.png', 'Record split-button with mode dropdown');
  await closeMenus();

  // 31 Workspace menu open
  await closeMenus();
  await go(`(() => { const wm = document.getElementById('rig-menu'); if(wm) wm.hidden = false; return 'rig-menu'; })()`);
  await wait(400);
  await snap('31-workspace-menu.png', 'Workspace menu');
  await closeMenus();

  // 32 Snake game — display only (capture just the scope canvas area)
  await go(`(() => { window._dso.scope.setSnakeMode(true); return 'snake'; })()`);
  await wait(600);
  await go(`(() => { const s = window._dso.scope._snake; s.setDir(1,0); return 'r'; })()`);
  await wait(400);
  await go(`(() => { const s = window._dso.scope._snake; s.setDir(0,1); return 'd'; })()`);
  await wait(400);
  await go(`(() => { const s = window._dso.scope._snake; s.setDir(-1,0); return 'l'; })()`);
  await wait(400);
  await go(`(() => { const s = window._dso.scope._snake; s.setDir(0,-1); return 'u'; })()`);
  await wait(600);
  // Capture only the scope display area
  const scopeRect = await go(`(() => {
    const el = document.querySelector('.crt-bezel');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  if (scopeRect) {
    const img = await win.webContents.capturePage({
      x: scopeRect.x, y: scopeRect.y,
      width: scopeRect.w, height: scopeRect.h,
    });
    fs.writeFileSync(path.join(OUT_DIR, '32-snake-game.png'), img.toPNG());
    console.log('  ✓  32-snake-game.png                    Snake easter egg — display only');
  }
  await go(`(() => { window._dso.scope.setSnakeMode(false); return 'exit'; })()`);
  await wait(300);

  // ── v1.4.0 Feature shots ─────────────────────────────────────────────────

  // 40 Spectrum analyzer (FS) mode — full app
  await closeMenus();
  await flush();
  // Switch to FS mode, idle signal already running
  await go(`(() => {
    const s = window._dso.scope;
    s.mode = 'FS';
    document.getElementById('btn-fs')?.classList.add('active');
    document.getElementById('btn-yt')?.classList.remove('active');
    document.getElementById('btn-xy')?.classList.remove('active');
    document.getElementById('btn-vs')?.classList.remove('active');
    return 'fs';
  })()`);
  await go(SET(`s.color='#00ff41'; s.glowAmount=20; s.beamWidth=2.0; s.persistence=0.4;`));
  await wait(2000);
  await snap('40-spectrum-mode.png', 'Spectrum analyzer (FS) mode');

  // 41 Vectorscope (VS) mode — full app
  await go(`(() => {
    const s = window._dso.scope;
    s.mode = 'VS';
    document.getElementById('btn-vs')?.classList.add('active');
    document.getElementById('btn-yt')?.classList.remove('active');
    document.getElementById('btn-xy')?.classList.remove('active');
    document.getElementById('btn-fs')?.classList.remove('active');
    return 'vs';
  })()`);
  await flush();
  await wait(2000);
  await snap('41-vectorscope-mode.png', 'Vectorscope (VS) mode');

  // Back to YT for the rest
  await go(YT_MODE);
  await flush();
  await wait(500);

  // 42 Right-click context menu — full app with menu open at center of canvas
  await closeMenus();
  await go(`(() => {
    const canvas = document.getElementById('scope');
    const rect = canvas.getBoundingClientRect();
    // Dispatch a synthetic contextmenu event at the canvas center so the
    // menu controller positions the menu and shows it.
    const evt = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    canvas.dispatchEvent(evt);
    return 'ctx-menu';
  })()`);
  await wait(400);
  await snap('42-context-menu.png', 'Right-click context menu on scope canvas');
  // Hide menu
  await go(`(() => { const m = document.getElementById('canvas-context-menu'); if (m) m.hidden = true; return 'hide'; })()`);
  await wait(200);

  // 43 Keyboard synth panel open
  await closeMenus();
  await go(`(() => {
    document.getElementById('btn-synth')?.click();
    return 'synth-on';
  })()`);
  await wait(800);
  await snap('43-keyboard-synth.png', 'Keyboard synth panel');
  // Disable synth
  await go(`(() => {
    document.getElementById('btn-synth')?.click();
    return 'synth-off';
  })()`);
  await wait(400);

  // 44 Visual preset packs — show presets panel with packs visible
  await closeMenus();
  await go(SHOW_PANEL('presets'));
  await wait(1000);
  await snap('44-preset-packs.png', 'Visual preset packs in the presets panel');

  // ── Theme gallery (Classic rig so panels are visible) ────────────────────
  console.log('\n  Switching to Classic rig for theme shots...');
  await closeMenus();

  // Use the rig selector to apply Classic layout properly
  await go(`(() => {
    const sel = document.getElementById('rig-select');
    if (sel) { sel.value = 'classic'; sel.dispatchEvent(new Event('change')); }
    // Expand all collapsed panels so they're visible
    setTimeout(() => {
      document.querySelectorAll('.fp-section.collapsed').forEach(s => s.classList.remove('collapsed'));
      window.dispatchEvent(new Event('resize'));
    }, 300);
    return 'classic-rig';
  })()`);
  await wait(2000);

  await go(RESET_FX); await go(YT_MODE);
  await go(`(() => { const { engine: e } = window._dso; e.startIdleSignal?.(); return 'idle'; })()`);
  await go(SET(`s.glowAmount=14; s.beamWidth=1.6; s.persistence=0.25;`));

  const themes = [
    'classic-lab', 'tektronix-blue', 'analog-amber', 'mil-spec',
    'modern-minimal', 'synthwave', 'wooden-rack', 'oled-dark',
    'nixie-tube', 'frosted-glass', 'liquid-glass',
  ];

  for (const theme of themes) {
    await flush();
    // Apply theme
    await go(`(() => {
      const rm = document.getElementById('rec-menu');
      const wm = document.getElementById('rig-menu');
      if (rm) rm.hidden = true;
      if (wm) wm.hidden = true;
      const mgr = window._dso.ui?._themeMgr;
      if (mgr) {
        const defaults = mgr.apply('${theme}');
        const s = window._dso.scope;
        if (defaults?.traceColor) s.color = defaults.traceColor;
        if (defaults?.glowAmount !== undefined) s.glowAmount = defaults.glowAmount;
        if (defaults?.beamWidth !== undefined) s.beamWidth = defaults.beamWidth;
        if (defaults?.persistence !== undefined) s.persistence = defaults.persistence;
        document.getElementById('theme-select').value = '${theme}';
      }
      return '${theme}';
    })()`);
    await wait(1800);
    await closeMenus();
    await snap(`theme-${theme}.png`, `Theme: ${theme}`);
  }

  // Restore default theme
  await go(`(() => {
    const mgr = window._dso.ui?._themeMgr;
    if (mgr) mgr.apply('classic-lab');
    document.getElementById('theme-select').value = 'classic-lab';
    return 'restored';
  })()`);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  const server = await startFileServer();

  const win = new BrowserWindow({
    width: W, height: H, resizable: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  win.setMenuBarVisibility(false);
  win.show();   // Ensure window is visible — capturePage returns empty if hidden
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2) console.warn('  [renderer]', msg.slice(0, 120));
  });

  await win.loadFile('index.html');
  console.log('\nLoaded — waiting for _dso...');

  const ready = await waitForDso(win, 15000);
  if (!ready) {
    console.error('ERROR: window._dso never appeared');
    server.close(); app.quit(); return;
  }
  console.log('_dso ready!');

  win.focus();
  await exec(win, APPLY_STUDIO_RIG);
  console.log('Studio rig applied.');

  // Give the layout engine time to settle — panels won't be visible in early shots otherwise
  await exec(win, `(() => { window.dispatchEvent(new Event('resize')); return 'resize'; })()`);
  await sleep(2500);

  const audioResult = await exec(win, BOOT_AUDIO);
  console.log('Audio:', audioResult);
  await sleep(600);

  console.log('\nStarting captures...\n');
  await runShots(win, fileServerPort);

  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`✓ ${files.length} screenshots saved to docs/screenshots/`);
  console.log('\nStill manual (needs running app + Electron window):');
  console.log('  09-obj-wireframe.png   — load a .obj file');
  console.log('  25-popout.png          — click Pop Out button');
  console.log('  26-recording.png       — click Record button');

  server.close();
  app.quit();
});

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
const AUDIO_FILE = 'C:\\Users\\xbit\\Downloads\\Bread Beatz - Love Game.mp3';
const IMAGE_FILE = 'C:\\Users\\xbit\\Dropbox\\Assets\\1 - Uranium Corp\\Photos\\Emotes\\theguy.png';

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
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT_DIR, file), img.toPNG());
  console.log(`  ✓  ${file.padEnd(36)} ${desc}`);
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

  // ── Signal-gen / Lissajous shots ─────────────────────────────────────────

  // 01 Overview — idle signal gives a nice organic waveform
  await go(RESET_FX); await go(YT_MODE);
  await go(`(() => { const { engine: e } = window._dso; e.startIdleSignal?.(); return 'idle'; })()`);
  await go(SET(`s.glowAmount=14; s.beamWidth=1.6; s.persistence=0.25;`));
  await wait(2000);
  await snap('01-overview.png', 'Full app overview — YT mode');

  // 02 YT classic green
  await go(RESET_FX); await go(YT_MODE);
  await go(`(() => { const { engine: e } = window._dso; e.startIdleSignal?.(); return 'idle'; })()`);
  await go(SET(`s.color='#00ff41'; s.glowAmount=16; s.beamWidth=1.6; s.persistence=0.25;`));
  await wait(1800);
  await snap('02-yt-mode.png', 'YT waveform — classic green');

  // 02b YT bloom
  await flush();
  await go(RESET_FX); await go(YT_MODE);
  await go(`(() => { const { engine: e } = window._dso; e.startIdleSignal?.(); return 'idle'; })()`);
  await go(SET(`s.color='#00ff41'; s.glowAmount=20; s.beamWidth=1.8; s.persistence=0.2; s.fx.bloom=true; s.fx.bloomStr=0.9;`));
  await wait(1800);
  await snap('02b-yt-bloom.png', 'YT mode — bloom glow');

  // 03 Hero Lissajous — 2:3 sine at 45° gives a classic three-node pretzel figure
  await flush();
  await go(RESET_FX); await go(START_GEN(200, 300, 45, 'sine'));
  await go(SET(`s.color='#ff3366'; s.glowAmount=18; s.beamWidth=1.8; s.persistence=0.75;`));
  await wait(2500);
  await snap('03-xy-lissajous.png', 'XY Lissajous — 2:3 pretzel');

  // 03b–03i Lissajous variety — flush between each so trails don't bleed
  for (const [file, desc, fL, fR, ph, wave, color, persist] of [
    ['03b-circle.png',  'circle',   200, 200,  90, 'sine',     '#00ff41', 0.7],
    ['03c-figure8.png', 'figure 8', 200, 400,   0, 'sine',     '#00ffff', 0.7],
    ['03d-star.png',    'star',     100, 250,  90, 'sine',     '#ffff00', 0.7],
    ['03e-flower.png',  'flower',   100, 150,  90, 'sine',     '#ff00ff', 0.7],
    ['03f-diamond.png', 'diamond',  200, 200,  90, 'triangle', '#00ffff', 0.7],
    ['03g-web.png',     'web',      100, 175,   0, 'sine',     '#aaffaa', 0.6],
    ['03h-chaos.png',   'chaos',    317, 498,  37, 'sawtooth', '#ff6600', 0.08],
    ['03i-bowtie.png',  'bowtie',   200, 100,   0, 'sine',     '#ff3300', 0.7],
  ]) {
    await flush();
    await go(RESET_FX); await go(START_GEN(fL, fR, ph, wave));
    await go(SET(`s.color='${color}'; s.glowAmount=22; s.beamWidth=1.8; s.persistence=${persist};`));
    await wait(2000);
    await snap(file, `Lissajous — ${desc}`);
  }

  // 03j Rotating ring — 200 vs 201 Hz beat = 1Hz rotation, high persistence builds glowing trail
  await flush();
  await go(RESET_FX); await go(START_GEN(200, 201, 90, 'sine'));
  await go(SET(`s.color='#00ff99'; s.persistence=0.92; s.glowAmount=9; s.beamWidth=1.3;`));
  await wait(3000);
  await snap('03j-spiral.png', 'Lissajous — slow-rotating ring');

  // 04 Signal gen panel
  await go(RESET_FX); await go(START_GEN(100, 250, 90, 'sine'));
  await go(SET(`s.color='#ffff00'; s.glowAmount=16;`));
  await go(SHOW_PANEL('siggen'));
  await wait(1500);
  await snap('04-signal-generator.png', 'Signal generator panel');

  // 05 Channels panel
  await go(RESET_FX); await go(YT_MODE);
  await go(SHOW_PANEL('ch1')); await go(SHOW_PANEL('horiz')); await go(SHOW_PANEL('trig'));
  await wait(1300);
  await snap('05-channels-panel.png', 'Channels / timebase / trigger');

  // 06 Bloom + reactive
  await flush();
  await go(RESET_FX); await go(START_GEN(200, 300, 90, 'sine'));
  await go(SET(`s.color='#ff00ff'; s.glowAmount=16; s.beamWidth=1.8; s.persistence=0.6; s.fx.bloom=true; s.fx.bloomStr=0.9; s.fx.reactive=true; s.fx.reactiveStr=1.0;`));
  await wait(1800);
  await snap('06-beam-effects.png', 'Bloom + reactive — magenta');

  // 06b Bloom cyan
  await flush();
  await go(RESET_FX); await go(START_GEN(150, 225, 45, 'sine'));
  await go(SET(`s.color='#00ffff'; s.glowAmount=18; s.beamWidth=1.9; s.persistence=0.55; s.fx.bloom=true; s.fx.bloomStr=1.0;`));
  await wait(1800);
  await snap('06b-bloom-cyan.png', 'Bloom — cyan');

  // 06c Reactive amber YT
  await go(RESET_FX); await go(YT_MODE);
  await go(`(() => { const { engine: e } = window._dso; e.startIdleSignal?.(); return 'idle'; })()`);
  await go(SET(`s.color='#ffb000'; s.glowAmount=16; s.beamWidth=1.8; s.persistence=0.3; s.fx.reactive=true; s.fx.reactiveStr=1.2;`));
  await wait(1600);
  await snap('06c-reactive-amber.png', 'Reactive — amber');

  // 07 Afterglow rainbow (long wait to build trail)
  await flush();
  await go(RESET_FX); await go(START_GEN(200, 201, 90, 'sine'));
  await go(SET(`s.color='#00ffff'; s.glowAmount=22; s.beamWidth=1.8; s.persistence=0.06; s.fx.afterglow=true; s.fx.afterglowSpeed=0.005; s.fx.afterglowStr=0.85;`));
  await wait(4000);
  await snap('07-afterglow.png', 'Afterglow — rainbow trails');

  // 08 Mirror + rotation
  await go(RESET_FX); await go(START_GEN(150, 250, 45, 'sine'));
  await go(SET(`s.color='#00ff41'; s.glowAmount=18; s.beamWidth=1.6; s.fx.mirrorX=true; s.fx.mirrorY=true; s.fx.rotation=true; s.fx.rotSpeed=0.006; s.fx._angle=0.5;`));
  await wait(1600);
  await snap('08-mirror-rotation.png', 'Mirror X+Y + rotation');

  // 08b Mirror Lissajous
  await go(RESET_FX); await go(START_GEN(150, 225, 90, 'sine'));
  await go(SET(`s.color='#7700ff'; s.glowAmount=20; s.beamWidth=1.8; s.fx.mirrorX=true; s.fx.mirrorY=true;`));
  await wait(1600);
  await snap('08b-mirror-lissajous.png', 'Mirror X+Y on Lissajous');

  // ── Audio file shots ─────────────────────────────────────────────────────
  console.log('\n  Loading audio file...');
  await go(RESET_FX); await go(YT_MODE);
  const playResult = await go(LOAD_AND_PLAY_AUDIO(port));
  console.log('  ', playResult);
  await wait(2000);  // let audio settle

  // 02c YT with real audio — more organic waveform
  await go(SET(`s.color='#00ff41'; s.glowAmount=16; s.beamWidth=1.6;`));
  await wait(800);
  await snap('02c-yt-audio.png', 'YT mode — real audio');

  // 06c-audio Reactive with real audio
  await go(SET(`s.color='#ffb000'; s.glowAmount=22; s.beamWidth=2.0; s.fx.reactive=true; s.fx.reactiveStr=1.4; s.persistence=0.25;`));
  await wait(1200);
  await snap('06d-reactive-audio.png', 'Reactive — amber with audio');

  // 21 Frequency filter — bass, real audio
  await go(SET(`s.filterEnabled=true; s.filterLow=20; s.filterHigh=250; s.color='#ffb000'; s.glowAmount=16; s.persistence=0.3;`));
  await go(SHOW_PANEL('sigfx'));
  await wait(1400);
  await snap('21-frequency-filter.png', 'Frequency filter — bass band');

  // 27 Measurements with audio
  await go(SET(`s.filterEnabled=false; s.color='#00ff41'; s.glowAmount=16; s.persistence=0.15; s.showMeasure=true; s.fx.reactive=false;`));
  await wait(1400);
  await snap('27-measurements.png', 'Measurement bar — real audio');

  // 28 Beat flash (beat flash + bloom = dramatic)
  await go(SET(`s.color='#ff00ff'; s.glowAmount=25; s.beamWidth=2.0; s.fx.bloom=true; s.fx.bloomStr=1.3; s.fx.beatFlash=true; s.fx.beatStr=0.5; s.fx.beatSens=1.2;`));
  await wait(3000);  // wait for a beat to fire
  await snap('28-beat-flash.png', 'Beat flash triggered');

  // Stop audio for scene shots
  await go(`(() => { window._dso.engine.stop(); return 'stopped'; })()`);

  // ── Image scene shots ─────────────────────────────────────────────────────
  console.log('\n  Loading image...');
  await go(RESET_FX);
  const imgResult = await go(LOAD_IMAGE(port));
  console.log('  ', imgResult);
  await wait(1500);

  // 10 Edges mode
  await go(IMG_MODE('edges', 40));
  await go(SET(`s.color='#00ff41'; s.glowAmount=14; s.beamWidth=1.4;`));
  await wait(1200);
  await snap('10-image-edges.png', 'Image trace — Edges (Sobel)');

  // 11 Lum mode
  await go(IMG_MODE('lum', 60));
  await go(SET(`s.color='#00ffff'; s.glowAmount=12;`));
  await wait(1200);
  await snap('11-image-lum.png', 'Image trace — Luminance');

  // 12 Outline mode
  await go(IMG_MODE('outline', 20));
  await go(SET(`s.color='#ff00ff'; s.glowAmount=14;`));
  await wait(1200);
  await snap('12-image-outline.png', 'Image trace — Outline');

  // 22 Independent scene color
  await go(IMG_MODE('edges', 40));
  await go(SET(`s.color='#00ff41'; s.sceneColor='#ff00ff'; s.glowAmount=14;`));
  await wait(1200);
  await snap('22-scene-color.png', 'Scene color independent — magenta on green');

  // 13 Tiling 3x3
  await go(IMG_MODE('edges', 40));
  await go(SET(`s.color='#00ff41'; s.sceneColor=''; s.glowAmount=12;`));
  await go(MOTION(`obj.tileX=3; obj.tileY=3; img.tileX=3; img.tileY=3;`));
  await wait(1400);
  await snap('13-tiling.png', 'Tiling — 3×3 grid');

  // 14 Radial symmetry
  await go(MOTION(`obj.tileX=1; obj.tileY=1; img.tileX=1; img.tileY=1; img.radialN=6; obj.radialN=6;`));
  await wait(1400);
  await snap('14-radial.png', 'Radial symmetry — 6 copies');

  // 15 Infinite scroll
  await go(MOTION(`img.radialN=1; obj.radialN=1; img.tileX=3; img.tileY=1; img.scrollX=0.8; obj.tileX=3; obj.scrollX=0.8;`));
  await wait(2500);
  await snap('15-scroll.png', 'Infinite scroll — tiled field moving');

  // 16 Float + Ripple
  await go(MOTION(`img.scrollX=0; img.tileX=1; img.tileY=1; obj.scrollX=0; obj.tileX=1; obj.tileY=1;`));
  await go(MOTION(`img.float=true; img.ripple=true; img.motionAmt=0.35; img.motionSpeed=1.2;`));
  await wait(2000);
  await snap('16-float-ripple.png', 'Motion — Float + Ripple');

  // 17 Twist
  await go(MOTION(`img.float=false; img.ripple=false; img.twist=true; img.motionAmt=0.5; img.motionSpeed=0.8;`));
  await wait(2000);
  await snap('17-twist.png', 'Motion — Twist');

  // 18 Explode mid-burst
  await go(MOTION(`img.twist=false; img.explode=true; img.explodeLoop=true; img.motionAmt=0.6; img.motionSpeed=1.5;`));
  await wait(1500);
  await snap('18-explode.png', 'Motion — Explode burst');

  // 19 Breathe + Warp with audio
  await go(MOTION(`img.explode=false;`));
  console.log('\n  Reloading audio for Breathe+Warp...');
  const playAgain = await go(LOAD_AND_PLAY_AUDIO(port));
  console.log('  ', playAgain);
  await go(`
  (() => {
    const { scope: s } = window._dso;
    s._imgScene.breathe = true;
    s._imgScene.warp    = true;
    s._imgScene.warpAmt = 0.15;
    s._imgScene.showAudio = false;
    return 'breathe-warp';
  })()
  `);
  await wait(2500);
  await snap('19-breathe-warp.png', 'Breathe + Warp — music reactive');

  // 20 Draw power mid-ramp
  await go(`
  (() => {
    const { scope: s } = window._dso;
    s._imgScene.breathe   = false;
    s._imgScene.warp      = false;
    s._imgScene.power     = 0;
    s._imgScene.autoPower = true;
    s._imgScene.powerSpeed= 0.006;
    s._imgScene.powerLoop = false;
    window._dso.engine.stop();
    return 'power-ramp';
  })()
  `);
  await wait(2200);  // let it draw to ~40%
  await snap('20-draw-power.png', 'Draw Power — auto-ramp mid-animation');
  await go(`(() => { window._dso.scope._imgScene.autoPower=false; })()`);

  // ── Misc remaining ────────────────────────────────────────────────────────

  // 21 freq filter already done above — skip

  // 23 Presets panel
  await go(RESET_FX); await go(STOP_GEN);
  await go(SHOW_PANEL('presets'));
  await wait(900);
  await snap('23-presets-panel.png', 'Presets panel');

  // 24 Layout rig selector
  await go(SHOW_PANEL('ctrl'));
  await wait(900);
  await snap('24-layout-rigs.png', 'Layout rig selector');
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

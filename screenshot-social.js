/**
 * DSO-1 Social Media Screenshots
 * Run:  node_modules\.bin\electron.cmd screenshot-social.js
 *
 * Captures visually striking shots optimized for X/Twitter posts.
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');

const OUT_DIR = path.join(__dirname, 'docs', 'social');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const W = 1600, H = 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function exec(win, code) {
  try { return await win.webContents.executeJavaScript(code, true); }
  catch(e) { console.warn('  [js]', e.message.slice(0, 120)); }
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
  for (let attempt = 0; attempt < 3; attempt++) {
    const img = await win.webContents.capturePage();
    const buf = img.toPNG();
    if (buf.length > 100) {
      fs.writeFileSync(path.join(OUT_DIR, file), buf);
      console.log(`  ✓  ${file.padEnd(40)} ${desc}`);
      return;
    }
    await sleep(500);
  }
  console.warn(`  ✗  ${file.padEnd(40)} EMPTY`);
}

async function shotDisplay(win, file, desc) {
  const rect = await exec(win, `(() => {
    const el = document.querySelector('.crt-bezel');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  if (!rect) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const img = await win.webContents.capturePage({
      x: rect.x, y: rect.y, width: rect.w, height: rect.h,
    });
    const buf = img.toPNG();
    if (buf.length > 100) {
      fs.writeFileSync(path.join(OUT_DIR, file), buf);
      console.log(`  ✓  ${file.padEnd(40)} ${desc}`);
      return;
    }
    await sleep(500);
  }
}

// Hide most UI for a clean display-focused shot
const HIDE_UI_FOR_SCOPE = `(() => {
  const el = (id) => document.getElementById(id);
  ['panel-store', 'zone-left', 'zone-right', 'zone-under', 'zone-bottom'].forEach(z => {
    const e = el(z);
    if (e) e.style.display = 'none';
  });
  return 'ui-hidden';
})()`;

// Use Perform rig (minimal) so scope is maximized
const APPLY_PERFORM_RIG = `(() => {
  const sel = document.getElementById('rig-select');
  if (sel) { sel.value = 'perform'; sel.dispatchEvent(new Event('change')); }
  setTimeout(() => {
    document.querySelectorAll('.fp-section.collapsed').forEach(s => s.classList.remove('collapsed'));
    window.dispatchEvent(new Event('resize'));
  }, 300);
  return 'perform';
})()`;

// Use Classic rig with panels expanded
const APPLY_CLASSIC_RIG = `(() => {
  const sel = document.getElementById('rig-select');
  if (sel) { sel.value = 'classic'; sel.dispatchEvent(new Event('change')); }
  setTimeout(() => {
    document.querySelectorAll('.fp-section.collapsed').forEach(s => s.classList.remove('collapsed'));
    window.dispatchEvent(new Event('resize'));
  }, 300);
  return 'classic';
})()`;

const CLOSE_MENUS = `(() => {
  const rm = document.getElementById('rec-menu');
  const wm = document.getElementById('rig-menu');
  if (rm) rm.hidden = true;
  if (wm) wm.hidden = true;
  return 'closed';
})()`;

const FLUSH = `(() => {
  const { scope: s } = window._dso;
  s._flushPersistence = s.persistence;
  s.persistence = 0;
  return 'flush';
})()`;
const RESTORE = `(() => {
  const { scope: s } = window._dso;
  if (s._flushPersistence !== undefined) { s.persistence = s._flushPersistence; delete s._flushPersistence; }
  return 'restored';
})()`;

function START_GEN(fL, fR, ph, wave='sine') {
  return `(() => {
    const { scope: s, sigGen: sg, engine: e } = window._dso;
    e._stopIdleSignal?.();
    sg.stop();
    sg.freqL = ${fL}; sg.freqR = ${fR};
    sg.phase = ${ph};
    sg.waveform = '${wave}';
    sg.amplitude = 0.85;
    sg.start(e.analyserL, e.analyserR);
    s.mode = 'XY';
    s.ch1.vdiv = {v: 2, label: '2V'}; s.ch1.vdivIdx = 5;
    s.ch2.vdiv = {v: 2, label: '2V'}; s.ch2.vdivIdx = 5;
    return 'gen';
  })()`;
}

const YT_IDLE = `(() => {
  const { scope: s, engine: e, sigGen: sg } = window._dso;
  sg.stop();
  s.mode = 'YT';
  e.startIdleSignal?.();
  return 'yt';
})()`;

function applyTheme(theme) {
  return `(() => {
    const rm = document.getElementById('rec-menu');
    const wm = document.getElementById('rig-menu');
    if (rm) rm.hidden = true;
    if (wm) wm.hidden = true;
    const mgr = window._dso.ui?._themeMgr;
    if (mgr) {
      const defs = mgr.apply('${theme}');
      const s = window._dso.scope;
      if (defs?.traceColor) s.color = defs.traceColor;
      if (defs?.glowAmount !== undefined) s.glowAmount = defs.glowAmount;
      if (defs?.beamWidth !== undefined) s.beamWidth = defs.beamWidth;
      if (defs?.persistence !== undefined) s.persistence = defs.persistence;
      document.getElementById('theme-select').value = '${theme}';
    }
    return '${theme}';
  })()`;
}

function setScope(props) {
  return `(() => { const { scope: s } = window._dso; ${props} return 'set'; })()`;
}

async function run(win) {
  const go = code => exec(win, code);
  const flush = async () => { await go(FLUSH); await sleep(500); await go(RESTORE); };

  console.log('\n═══ HERO SHOTS — clean Lissajous patterns, display only ═══\n');

  // Use Perform rig so scope is maximized
  await go(APPLY_PERFORM_RIG);
  await sleep(1500);

  // Hero 1: Classic green 2:3 pretzel Lissajous — the quintessential scope shot
  await go(CLOSE_MENUS);
  await flush();
  await go(START_GEN(200, 300, 45, 'sine'));
  await go(setScope(`s.color='#00ff41'; s.glowAmount=22; s.beamWidth=1.9; s.persistence=0.85;`));
  await sleep(3500);
  await shotDisplay(win, 'hero-1-classic-lissajous.png', 'Classic green 2:3 Lissajous');

  // Hero 2: Synthwave cyan figure-8
  await go(applyTheme('synthwave'));
  await flush();
  await go(START_GEN(200, 400, 0, 'sine'));
  await go(setScope(`s.color='#00ffff'; s.glowAmount=28; s.beamWidth=2.1; s.persistence=0.82;`));
  await sleep(3500);
  await shotDisplay(win, 'hero-2-synthwave-figure8.png', 'Synthwave cyan figure-8');

  // Hero 3: Nixie tube amber spiral
  await go(applyTheme('nixie-tube'));
  await flush();
  await go(START_GEN(200, 201, 90, 'sine'));
  await go(setScope(`s.color='#ff8830'; s.glowAmount=26; s.beamWidth=1.8; s.persistence=0.94;`));
  await sleep(4500);
  await shotDisplay(win, 'hero-3-nixie-spiral.png', 'Nixie tube amber spiral ring');

  // Hero 4: Magenta flower 2:3 rotated (analog amber theme color clash = cool)
  await go(applyTheme('classic-lab'));
  await flush();
  await go(START_GEN(150, 225, 45, 'sine'));
  await go(setScope(`s.color='#ff00ff'; s.glowAmount=28; s.beamWidth=2.0; s.persistence=0.75;`));
  await sleep(3000);
  await shotDisplay(win, 'hero-4-magenta-flower.png', 'Magenta flower pattern');

  // Hero 5: Tektronix blue classic circle
  await go(applyTheme('tektronix-blue'));
  await flush();
  await go(START_GEN(200, 200, 90, 'sine'));
  await go(setScope(`s.color='#4488ff'; s.glowAmount=24; s.beamWidth=2.0; s.persistence=0.85;`));
  await sleep(3000);
  await shotDisplay(win, 'hero-5-tek-circle.png', 'Tektronix blue glowing circle');

  // Hero 6: YT waveform with bloom — synthwave theme
  await go(applyTheme('synthwave'));
  await flush();
  await go(YT_IDLE);
  await go(setScope(`s.color='#ff44ff'; s.glowAmount=26; s.beamWidth=2.0; s.persistence=0.35; s.fx.bloom=true; s.fx.bloomStr=1.1;`));
  await sleep(2500);
  await shotDisplay(win, 'hero-6-synthwave-yt.png', 'Synthwave waveform with bloom');

  console.log('\n═══ FULL APP SHOTS — showing the UI in different themes ═══\n');

  // Full-app shot 1: Synthwave with classic rig (most dramatic UI)
  await go(APPLY_CLASSIC_RIG);
  await sleep(2000);
  await go(CLOSE_MENUS);
  await go(applyTheme('synthwave'));
  await flush();
  await go(START_GEN(150, 225, 45, 'sine'));
  await go(setScope(`s.color='#00ffff'; s.glowAmount=24; s.beamWidth=2.0; s.persistence=0.8;`));
  await sleep(3000);
  await go(CLOSE_MENUS);
  await shot(win, 'full-1-synthwave.png', 'Full app — Synthwave theme');

  // Full-app shot 2: Frosted glass with waveform
  await go(applyTheme('frosted-glass'));
  await flush();
  await go(YT_IDLE);
  await go(setScope(`s.color='#aaccee'; s.glowAmount=18; s.beamWidth=1.8; s.persistence=0.3;`));
  await sleep(2500);
  await go(CLOSE_MENUS);
  await shot(win, 'full-2-frosted.png', 'Full app — Frosted Glass');

  // Full-app shot 3: MIL-SPEC with Lissajous (the most visually different theme)
  await go(applyTheme('mil-spec'));
  await flush();
  await go(START_GEN(200, 300, 45, 'sine'));
  await go(setScope(`s.color='#ff6633'; s.glowAmount=22; s.beamWidth=1.9; s.persistence=0.75;`));
  await sleep(3000);
  await go(CLOSE_MENUS);
  await shot(win, 'full-3-milspec.png', 'Full app — MIL-SPEC');

  // Full-app shot 4: Analog amber
  await go(applyTheme('analog-amber'));
  await flush();
  await go(START_GEN(200, 200, 90, 'sine'));
  await go(setScope(`s.color='#ffaa00'; s.glowAmount=22; s.beamWidth=1.9; s.persistence=0.85;`));
  await sleep(3000);
  await go(CLOSE_MENUS);
  await shot(win, 'full-4-amber.png', 'Full app — Analog Amber');

  // Restore classic
  await go(applyTheme('classic-lab'));
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W, height: H, resizable: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  win.setMenuBarVisibility(false);
  win.show();
  win.focus();
  win.webContents.on('console-message', (_e, lvl, msg) => {
    if (lvl >= 2) console.warn('  [renderer]', msg.slice(0, 120));
  });

  await win.loadFile('index.html');
  console.log('\nLoaded — waiting for _dso...');

  const ready = await waitForDso(win, 15000);
  if (!ready) { console.error('ERROR: _dso never appeared'); app.quit(); return; }
  console.log('_dso ready!');

  await exec(win, `(() => { window.dispatchEvent(new Event('resize')); })()`);
  await sleep(1500);

  await exec(win, `(async () => { await window._dso.ensureAudio(); return 'audio'; })()`);
  await sleep(500);

  await run(win);

  const files = fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`✓ ${files.length} social shots saved to docs/social/`);

  app.quit();
});

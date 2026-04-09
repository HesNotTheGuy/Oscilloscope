'use strict';

import { AudioEngine } from './audio-engine.js';
import { Oscilloscope } from './oscilloscope.js';
import { SignalGenerator } from './signal-generator.js';
import { VideoRecorder } from './video-recorder.js';
import { UIController } from './ui-controller.js';

//  Bootstrap
// ─────────────────────────────────────────────────────────────
(async () => {
  const canvas   = document.getElementById('scope');
  const engine   = new AudioEngine();
  const scope    = new Oscilloscope(canvas, engine);
  const sigGen   = new SignalGenerator();
  const recorder = new VideoRecorder(canvas);

  let audioReady = false;
  async function ensureAudio() {
    if (audioReady) return;
    await engine.init();
    sigGen.init(engine.actx);
    audioReady = true;
  }

  const origLoad = engine.loadFile.bind(engine);
  const origMic  = engine.startMic.bind(engine);
  engine.loadFile  = async f  => { await ensureAudio(); return origLoad(f); };
  engine.startMic  = async () => { await ensureAudio(); return origMic(); };
  document.addEventListener('click', ensureAudio, { once: true });

  const ui = new UIController(engine, scope, sigGen, recorder);
  ui._audioReady = false;
  ui._ensureAudio = ensureAudio;
  try {
    ui.init();
  } catch(err) {
    console.error('UIController.init() crashed:', err.message, '\n', err.stack);
    document.body.style.cssText = 'background:#111;color:#f66;font:14px monospace;padding:20px';
    document.body.innerHTML = '<b>Init error — open DevTools (Ctrl+Shift+I) for details:</b><br><pre>' + err.stack + '</pre>';
  }

  // Expose internals for screenshot automation (harmless on desktop)
  window._dso = { engine, scope, sigGen, recorder, ui, ensureAudio };
})();

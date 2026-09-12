'use strict';

// ─────────────────────────────────────────────────────────────
//  Shared UI utilities — passed as context to domain controllers
// ─────────────────────────────────────────────────────────────

/**
 * Bind a range input: fires fn on input events + once with initial value.
 */
export function bindRange(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', e => fn(parseFloat(e.target.value)));
  fn(parseFloat(el.value));
}

/**
 * Update status bar labels for CH1, timebase, trigger.
 */
export function updateStatus(scope) {
  const s = scope;
  document.getElementById('st-ch1').textContent  = `CH1: ${s.ch1.vdiv.label}/div`;
  document.getElementById('st-tb').textContent   = `${s.tb.label}/div`;
  const edge = s.trigEdge === 'rising' ? '↑' : '↓';
  document.getElementById('st-trig').textContent = `TRIG: ${s.trigMode.toUpperCase()} CH${s.trigSource} ${edge} ${s.trigLevel.toFixed(2)}V`;
}

/**
 * Clear phosphor canvas for mode switching (2D fallback only).
 */
export function resetPhosphor(scope) {
  if (!scope._phCtx) return;
  scope._phCtx.fillStyle = '#000';
  scope._phCtx.fillRect(0, 0, scope.canvas.width, scope.canvas.height);
}

export const SCOPE_MODES = {
  YT: { btn: 'btn-yt', label: 'waveform (voltage vs time)' },
  XY: { btn: 'btn-xy', label: 'lissajous (CH1 vs CH2)' },
  VS: { btn: 'btn-vs', label: 'vectorscope (stereo correlation)' },
  FS: { btn: 'btn-fs', label: 'spectrum analyzer' },
  SG: { btn: 'btn-sg', label: 'spectrogram waterfall' },
};

/** Keep the HORIZONTAL buttons and the always-visible status-strip in sync. */
export function syncModeButtons(mode) {
  for (const [m, spec] of Object.entries(SCOPE_MODES)) {
    const el = document.getElementById(spec.btn);
    if (el) el.classList.toggle('active', m === mode);
  }
  document.querySelectorAll('[data-scope-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.scopeMode === mode);
  });
}

export function setScopeMode(scope, mode) {
  if (!scope || !SCOPE_MODES[mode]) return;
  scope.mode = mode;
  syncModeButtons(mode);
  if (mode === 'SG' && scope._spectrogram) scope._spectrogram.clear();
  resetPhosphor(scope);
}

/**
 * Load audio file and start playback, updating UI state.
 */
export async function loadFile(engine, file) {
  document.getElementById('file-label').textContent = 'Loading…';
  try {
    await engine.loadFile(file);
    const name = file.name.length > 20 ? file.name.slice(0, 18) + '…' : file.name;
    document.getElementById('file-label').textContent = name;
    document.getElementById('file-drop').classList.add('loaded');
    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-stop-audio').disabled = false;
    document.getElementById('st-src').textContent = name;
    engine.play();
    document.getElementById('btn-play').textContent = '⏸ PAUSE';
  } catch (err) {
    document.getElementById('file-label').textContent = 'Error';
    console.error(err);
  }
}

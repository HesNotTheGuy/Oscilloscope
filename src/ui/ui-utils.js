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

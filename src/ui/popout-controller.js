'use strict';

// ─────────────────────────────────────────────────────────────
//  PopOutController — external display window (Electron-only)
// ─────────────────────────────────────────────────────────────
export class PopOutController {
  constructor(ctx) {
    this.scope = ctx.scope;
  }

  init() {
    if (typeof window.electronAPI === 'undefined') return;

    const btn        = document.getElementById('btn-popout');
    const fsControls = document.getElementById('fullscreen-controls');
    const monSelect  = document.getElementById('monitor-select');
    const btnFs      = document.getElementById('btn-fullscreen');
    const canvas     = this.scope.canvas;

    btn.style.display = '';
    fsControls.style.display = '';

    let _open     = false;
    let _rafId    = null;
    let _lastSent = 0;

    const _refreshDisplays = async () => {
      const displays = await window.electronAPI.getDisplays();
      monSelect.innerHTML = '';
      displays.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.label + (d.primary ? ' ★' : '');
        monSelect.appendChild(opt);
      });
      const nonPrimary = displays.find(d => !d.primary);
      if (nonPrimary) monSelect.value = nonPrimary.id;
    };
    _refreshDisplays();

    const _streamLoop = () => {
      if (!_open) return;
      _rafId = requestAnimationFrame(_streamLoop);
      const now = performance.now();
      if (now - _lastSent < 33) return;
      _lastSent = now;
      window.electronAPI.sendFrame(canvas.toDataURL('image/webp', 0.95));
    };

    const _openDisplay = async (fullscreen = false) => {
      const opts = fullscreen
        ? { fullscreen: true, displayId: parseInt(monSelect.value, 10) }
        : {};
      await window.electronAPI.openDisplay(opts);
      _open = true;
      btn.textContent = '✕ CLOSE DISPLAY';
      btn.classList.add('accent');
      if (fullscreen) {
        btnFs.textContent = '✕ EXIT FS';
        btnFs.classList.add('accent');
      }
      _streamLoop();
    };

    const _closeDisplay = () => {
      _open = false;
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      btn.textContent = '⤢ POP OUT';
      btn.classList.remove('accent');
      btnFs.textContent = '⛶ FULLSCREEN';
      btnFs.classList.remove('accent');
      window.electronAPI.closeDisplay();
    };

    const _reset = () => {
      _open = false;
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      btn.textContent = '⤢ POP OUT';
      btn.classList.remove('accent');
      btnFs.textContent = '⛶ FULLSCREEN';
      btnFs.classList.remove('accent');
    };

    btn.addEventListener('click', () => { if (_open) _closeDisplay(); else _openDisplay(false); });
    btnFs.addEventListener('click', () => { if (_open) _closeDisplay(); else _openDisplay(true); });
    monSelect.addEventListener('focus', _refreshDisplays);
    window.electronAPI.onDisplayClosed(_reset);
  }
}

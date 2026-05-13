'use strict';

// ─────────────────────────────────────────────────────────────
//  CanvasContextMenuController — right-click context menu on
//  the scope canvas with common quick-access actions.
// ─────────────────────────────────────────────────────────────
export class CanvasContextMenuController {
  constructor(ctx) {
    // No special context needed, but accept ctx for consistency
    this._menu = null;
    this._boundClose = null;
    this._boundKey   = null;
  }

  init() {
    const canvas = document.getElementById('scope');
    const menu   = document.getElementById('canvas-context-menu');
    if (!canvas || !menu) return;

    this._menu = menu;

    canvas.addEventListener('contextmenu', e => {
      e.preventDefault();
      this._show(e.clientX, e.clientY);
    });

    menu.addEventListener('click', e => {
      const action = e.target.closest('.ctx-item')?.dataset.action;
      if (!action) return;
      this._dispatch(action);
      this._hide();
    });

    window.addEventListener('blur', () => this._hide());
  }

  _show(x, y) {
    const menu = this._menu;
    // Temporarily make visible off-screen to measure dimensions
    menu.removeAttribute('hidden');
    menu.style.left = '0px';
    menu.style.top  = '0px';

    const mw = menu.offsetWidth  || 220;
    const mh = menu.offsetHeight || 200;

    const cx = (x + mw > window.innerWidth)  ? x - mw : x;
    const cy = (y + mh > window.innerHeight) ? y - mh : y;

    menu.style.left = `${Math.max(0, cx)}px`;
    menu.style.top  = `${Math.max(0, cy)}px`;

    // Outside-click handler (added once per open)
    this._boundClose = e => {
      if (!menu.contains(e.target)) this._hide();
    };
    this._boundKey = e => {
      if (e.key === 'Escape') this._hide();
    };
    // Use capture so we catch clicks before they bubble away
    document.addEventListener('click', this._boundClose, true);
    document.addEventListener('keydown', this._boundKey);
  }

  _hide() {
    if (!this._menu) return;
    this._menu.setAttribute('hidden', '');
    if (this._boundClose) {
      document.removeEventListener('click', this._boundClose, true);
      this._boundClose = null;
    }
    if (this._boundKey) {
      document.removeEventListener('keydown', this._boundKey);
      this._boundKey = null;
    }
  }

  _dispatch(action) {
    switch (action) {
      case 'screenshot': {
        const btn = document.getElementById('btn-screenshot');
        if (btn) btn.click();
        break;
      }
      case 'copy': {
        const canvas = document.getElementById('scope');
        if (!canvas) break;
        try {
          canvas.toBlob(blob => {
            if (!blob) return;
            navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]).catch(() => {/* silent — permissions may be denied */});
          });
        } catch (_) {/* browser may not support ClipboardItem */}
        break;
      }
      case 'measure': {
        const btn = document.getElementById('btn-measure');
        if (btn) btn.click();
        break;
      }
      case 'grid': {
        const cb = document.getElementById('show-grid');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        break;
      }
      case 'crt': {
        const cb = document.getElementById('crt-curve');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        break;
      }
      case 'popout': {
        const btn = document.getElementById('btn-popout');
        if (btn) btn.click();
        break;
      }
      case 'fullscreen': {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        break;
      }
      case 'runstop': {
        const btn = document.getElementById('btn-run-stop');
        if (btn) btn.click();
        break;
      }
    }
  }
}

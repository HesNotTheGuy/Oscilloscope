'use strict';

// ─────────────────────────────────────────────────────────────
//  KeyboardController — registers actions with InputMapper
//  and provides help overlay. All keyboard shortcuts route
//  through the InputMapper for remappability.
// ─────────────────────────────────────────────────────────────
export class KeyboardController {
  constructor(ctx) {
    this.scope    = ctx.scope;
    this.inputMap = ctx.inputMap;
    this._kbHelpVisible = false;
  }

  init() {
    const s = this.scope;
    const mapper = this.inputMap;

    // Register all actions (these are the targets that keyboard/MIDI/scenes trigger)
    if (mapper) {
      mapper.registerActions({
        'playback.toggle': () => document.getElementById('btn-play').click(),
        'playback.stop':   () => document.getElementById('btn-stop-audio').click(),

        'display.toggleGrid': () => {
          const cb = document.getElementById('show-grid');
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        },
        'display.toggleCRT': () => {
          const cb = document.getElementById('crt-curve');
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        },
        'display.toggleMeasure': () => document.getElementById('btn-measure').click(),
        'display.toggleFullscreen': () => {
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen();
        },

        'scope.modeYT':  () => document.getElementById('btn-yt').click(),
        'scope.modeXY':  () => document.getElementById('btn-xy').click(),
        'scope.runStop':  () => document.getElementById('btn-run-stop').click(),
        'scope.single':   () => document.getElementById('btn-single').click(),

        'scene.toggle': () => {
          const cb = document.getElementById('obj-mode');
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        },
        'scene.switchMode': () => {
          const cb = document.getElementById('obj-mode');
          if (!cb.checked) return;
          if (s.obj3dMode) document.getElementById('obj-mode-img').click();
          else document.getElementById('obj-mode-3d').click();
        },

        'help.toggle': () => this._toggleHelp(),
      });

      // Enable keyboard listener through InputMapper
      // (uses saved or default key bindings)
      mapper.enableKeyboard();
    }

    // Fallback: if no InputMapper, use legacy direct keyboard handler
    if (!mapper) {
      this._initLegacyKeyboard(s);
    }
  }

  _initLegacyKeyboard(s) {
    document.addEventListener('keydown', ev => {
      const tag = ev.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const key = ev.key;
      if (key === '?') { ev.preventDefault(); this._toggleHelp(); return; }
      if (this._kbHelpVisible && key === 'Escape') { ev.preventDefault(); this._toggleHelp(); return; }
      if (key === ' ')      { ev.preventDefault(); document.getElementById('btn-play').click(); return; }
      if (key === 'Escape') { ev.preventDefault(); document.getElementById('btn-stop-audio').click(); return; }
      if (key === 'g' || key === 'G') { ev.preventDefault(); const cb = document.getElementById('show-grid'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); return; }
      if (key === 'c' || key === 'C') { ev.preventDefault(); const cb = document.getElementById('crt-curve'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); return; }
      if (key === 'm' || key === 'M') { ev.preventDefault(); document.getElementById('btn-measure').click(); return; }
      if (key === 'f' || key === 'F' || key === 'F11') { ev.preventDefault(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); return; }
      if (key === '1') { ev.preventDefault(); document.getElementById('btn-yt').click(); return; }
      if (key === '2') { ev.preventDefault(); document.getElementById('btn-xy').click(); return; }
      if (key === 'r' || key === 'R') { ev.preventDefault(); document.getElementById('btn-run-stop').click(); return; }
      if (key === 's' || key === 'S') { ev.preventDefault(); document.getElementById('btn-single').click(); return; }
      if (key === '3') { ev.preventDefault(); const cb = document.getElementById('obj-mode'); cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); return; }
      if (key === 'Tab') { const cb = document.getElementById('obj-mode'); if (!cb.checked) return; ev.preventDefault(); if (s.obj3dMode) document.getElementById('obj-mode-img').click(); else document.getElementById('obj-mode-3d').click(); return; }
    });
  }

  _toggleHelp() {
    let overlay = document.getElementById('kb-help-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'kb-help-overlay';
      overlay.innerHTML = `
        <div class="kb-help-box">
          <div class="kb-help-title">KEYBOARD SHORTCUTS</div>
          <div class="kb-help-columns">
            <div class="kb-help-col">
              <div class="kb-help-section">PLAYBACK</div>
              <div class="kb-help-row"><kbd>Space</kbd> Play / Pause</div>
              <div class="kb-help-row"><kbd>Esc</kbd> Stop audio</div>
              <div class="kb-help-section">DISPLAY</div>
              <div class="kb-help-row"><kbd>G</kbd> Toggle grid</div>
              <div class="kb-help-row"><kbd>C</kbd> Toggle CRT curve</div>
              <div class="kb-help-row"><kbd>M</kbd> Toggle measurements</div>
              <div class="kb-help-row"><kbd>F</kbd> Toggle fullscreen</div>
              <div class="kb-help-row"><kbd>F11</kbd> Toggle fullscreen</div>
            </div>
            <div class="kb-help-col">
              <div class="kb-help-section">SCOPE</div>
              <div class="kb-help-row"><kbd>1</kbd> YT mode</div>
              <div class="kb-help-row"><kbd>2</kbd> XY mode</div>
              <div class="kb-help-row"><kbd>R</kbd> Run / Stop</div>
              <div class="kb-help-row"><kbd>S</kbd> Single trigger</div>
              <div class="kb-help-section">SCENE</div>
              <div class="kb-help-row"><kbd>3</kbd> Toggle OBJ/IMG enable</div>
              <div class="kb-help-row"><kbd>Tab</kbd> Switch OBJ / IMG</div>
              <div class="kb-help-section" style="margin-top:12px;opacity:0.5">
                Press <kbd>?</kbd> or <kbd>Esc</kbd> to close
              </div>
            </div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }
    this._kbHelpVisible = !this._kbHelpVisible;
    overlay.classList.toggle('visible', this._kbHelpVisible);
  }
}

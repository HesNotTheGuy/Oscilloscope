'use strict';

import { makeKonamiDetector } from '../snake-game.js';

// ─────────────────────────────────────────────────────────────
//  KeyboardController — registers actions with InputMapper
//  and provides help overlay. All keyboard shortcuts route
//  through the InputMapper for remappability.
// ─────────────────────────────────────────────────────────────
export class KeyboardController {
  constructor(ctx) {
    this.scope    = ctx.scope;
    this.inputMap = ctx.inputMap;
    this.tour     = (ctx && ctx.tour) || null;
    this._kbHelpVisible = false;
    this._onHelpKey = null;
    this._onHelpClick = null;
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
        'scope.modeVS':  () => document.getElementById('btn-vs').click(),
        'scope.modeFS':  () => document.getElementById('btn-fs').click(),
        'scope.modeSG':  () => document.getElementById('btn-sg').click(),
        'scope.runStop':  () => document.getElementById('btn-run-stop').click(),
        'scope.single':   () => document.getElementById('btn-single').click(),
        'scope.autoSet':  () => document.getElementById('btn-auto-set')?.click(),

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

    // ── Snake easter egg ──
    this._initSnake(s);
  }

  _initSnake(s) {
    if (!s.setSnakeMode) return;

    const enterSnake = () => {
      s.setSnakeMode(true);
    };
    const exitSnake = () => {
      s.setSnakeMode(false);
      // Clear overlay
      if (s._glr && s._glr.octx) {
        s._glr.octx.clearRect(0, 0, s.canvas.width, s.canvas.height);
      }
    };

    // Konami detector — global listener, sequence-only
    const konami = makeKonamiDetector(enterSnake);
    window.addEventListener('keydown', konami);

    // Snake controls — only act when snake mode is active
    window.addEventListener('keydown', ev => {
      if (!s._snakeActive) return;
      const tag = ev.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      switch (ev.key) {
        case 'ArrowUp':    ev.preventDefault(); s._snake.setDir(0, -1); break;
        case 'ArrowDown':  ev.preventDefault(); s._snake.setDir(0,  1); break;
        case 'ArrowLeft':  ev.preventDefault(); s._snake.setDir(-1, 0); break;
        case 'ArrowRight': ev.preventDefault(); s._snake.setDir( 1, 0); break;
        case 'Escape':     ev.preventDefault(); exitSnake(); break;
        case ' ':
          if (!s._snake.alive) { ev.preventDefault(); s._snake.reset(); }
          break;
      }
    });
  }

  _toggleHelp() {
    if (this._kbHelpVisible) this._hideHelp();
    else this._showHelp();
  }

  _showHelp() {
    let overlay = document.getElementById('kb-help-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'kb-help-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Keyboard shortcuts');
      document.body.appendChild(overlay);
    }
    overlay.replaceChildren(this._buildHelpBox());
    overlay.classList.add('visible');
    this._kbHelpVisible = true;

    this._onHelpKey = e => {
      if (!this._kbHelpVisible) return;
      if (e.key === 'Escape' || e.key === '?' ) {
        e.preventDefault();
        e.stopPropagation();
        this._hideHelp();
      }
    };
    // Window capture so Esc closes help even if the synth (document
    // capture) is also listening — the overlay said Esc would work.
    window.addEventListener('keydown', this._onHelpKey, true);
    this._onHelpClick = e => {
      if (e.target === overlay) this._hideHelp();
    };
    overlay.addEventListener('click', this._onHelpClick);
  }

  _hideHelp() {
    const overlay = document.getElementById('kb-help-overlay');
    if (overlay) overlay.classList.remove('visible');
    this._kbHelpVisible = false;
    if (this._onHelpKey) {
      window.removeEventListener('keydown', this._onHelpKey, true);
      this._onHelpKey = null;
    }
    if (this._onHelpClick && overlay) {
      overlay.removeEventListener('click', this._onHelpClick);
      this._onHelpClick = null;
    }
  }

  _buildHelpBox() {
    const box = document.createElement('div');
    box.className = 'kb-help-box';

    const title = document.createElement('div');
    title.className = 'kb-help-title';
    title.textContent = 'KEYBOARD SHORTCUTS';
    box.appendChild(title);

    const bindings = this.inputMap ? this.inputMap.getKeyBindings() : {};
    const grouped = helpSectionsFromBindings(bindings);

    const columns = document.createElement('div');
    columns.className = 'kb-help-columns';

    const left = document.createElement('div');
    left.className = 'kb-help-col';
    const right = document.createElement('div');
    right.className = 'kb-help-col';
    appendHelpSections(left, grouped, ['PLAYBACK', 'DISPLAY']);
    appendHelpSections(right, grouped, ['SCOPE', 'SCENE', 'SYNTH']);
    columns.appendChild(left);
    columns.appendChild(right);
    box.appendChild(columns);

    const footer = document.createElement('div');
    footer.className = 'kb-help-footer';

    if (this.tour) {
      const tourBtn = document.createElement('button');
      tourBtn.className = 'sys-btn kb-help-tour';
      tourBtn.type = 'button';
      tourBtn.textContent = 'Take the tour';
      tourBtn.addEventListener('click', () => {
        this._hideHelp();
        setTimeout(() => this.tour.start('basics'), 200);
      });
      footer.appendChild(tourBtn);
    }

    const hint = document.createElement('div');
    hint.className = 'kb-help-close-hint';
    hint.textContent = 'Press ? or Esc to close · right-click the scope for screenshot and pop-out';
    footer.appendChild(hint);
    box.appendChild(footer);
    return box;
  }
}

const HELP_SECTIONS = ['PLAYBACK', 'DISPLAY', 'SCOPE', 'SCENE', 'SYNTH'];

export const ACTION_HELP = {
  'playback.toggle':        { section: 'PLAYBACK', label: 'Play / Pause' },
  'playback.stop':          { section: 'PLAYBACK', label: 'Stop audio' },
  'display.toggleGrid':     { section: 'DISPLAY',  label: 'Toggle grid' },
  'display.toggleCRT':      { section: 'DISPLAY',  label: 'Toggle CRT curve' },
  'display.toggleMeasure':  { section: 'DISPLAY',  label: 'Toggle measurements' },
  'display.toggleFullscreen': { section: 'DISPLAY', label: 'Toggle fullscreen' },
  'scope.modeYT':           { section: 'SCOPE',    label: 'YT mode — waveform' },
  'scope.modeXY':           { section: 'SCOPE',    label: 'XY mode — lissajous' },
  'scope.modeVS':           { section: 'SCOPE',    label: 'VS mode — vectorscope' },
  'scope.modeFS':           { section: 'SCOPE',    label: 'FS mode — spectrum' },
  'scope.modeSG':           { section: 'SCOPE',    label: 'SG mode — spectrogram' },
  'scope.runStop':          { section: 'SCOPE',    label: 'Run / Stop' },
  'scope.single':           { section: 'SCOPE',    label: 'Single trigger' },
  'scope.autoSet':          { section: 'SCOPE',    label: 'Auto-set (fit the signal)' },
  'scene.toggle':           { section: 'SCENE',    label: 'Toggle OBJ/IMG enable' },
  'scene.switchMode':       { section: 'SCENE',    label: 'Switch OBJ / IMG' },
  'synth.toggle':           { section: 'SYNTH',    label: 'Toggle keyboard synth' },
};

const KEY_LABEL = { ' ': 'Space', escape: 'Esc', f11: 'F11' };

export function formatHelpKey(key) {
  if (KEY_LABEL[key]) return KEY_LABEL[key];
  if (key && key.length === 1) return key.toUpperCase();
  return String(key || '');
}

/** Build { section → [{key, label}] } from a live keymap. Tab is never listed. */
export function helpSectionsFromBindings(bindings) {
  const sections = new Map(HELP_SECTIONS.map(s => [s, []]));
  for (const [key, action] of Object.entries(bindings || {})) {
    if (String(key).toLowerCase() === 'tab') continue;
    const spec = ACTION_HELP[action];
    if (!spec || !spec.section) continue;
    sections.get(spec.section).push({ key: formatHelpKey(key), label: spec.label });
  }
  return sections;
}

function appendHelpSections(col, grouped, names) {
  for (const name of names) {
    const rows = grouped.get(name) || [];
    if (!rows.length) continue;
    const head = document.createElement('div');
    head.className = 'kb-help-section';
    head.textContent = name;
    col.appendChild(head);
    for (const row of rows) {
      const el = document.createElement('div');
      el.className = 'kb-help-row';
      const kbd = document.createElement('kbd');
      kbd.textContent = row.key;
      el.appendChild(kbd);
      el.appendChild(document.createTextNode(' ' + row.label));
      col.appendChild(el);
    }
  }
}

'use strict';

// ─────────────────────────────────────────────────────────────
//  InputMapper — unified mapping from input sources (keyboard,
//  MIDI, Stream Deck, scenes) to abstract actions.
//
//  Usage:
//    const mapper = new InputMapper(store);
//    mapper.registerAction('display.toggleGrid', () => { … });
//    mapper.bindKey('g', 'display.toggleGrid');
//    mapper.bindMidi(0, 64, 'display.toggleGrid');  // CC 64 on ch 0
//    mapper.trigger('display.toggleGrid');           // manual trigger
//
//  The mapper decouples input sources from actions. Keyboard
//  shortcuts, MIDI CCs, and scene triggers all go through the
//  same action registry. Mappings are user-configurable and
//  persisted to localStorage.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'osc_inputMap';

export class InputMapper {
  constructor(store) {
    this.store = store;

    /** @type {Map<string, Function>} action name → handler */
    this._actions = new Map();

    /** @type {Map<string, string>} key (lowercase) → action name */
    this._keyMap = new Map();

    /** @type {Map<string, string>} "ch:cc" → action name */
    this._midiMap = new Map();

    /** @type {boolean} whether keyboard listener is active */
    this._kbActive = false;

    /** @type {MIDIAccess|null} */
    this._midiAccess = null;

    this._loadMappings();
  }

  // ── Action registry ───────────────────────────────────────

  /**
   * Register a named action with its handler.
   * @param {string}   name – dot-separated action path (e.g. 'display.toggleGrid')
   * @param {Function} fn   – handler to execute
   */
  registerAction(name, fn) {
    this._actions.set(name, fn);
  }

  /**
   * Register multiple actions at once.
   * @param {Object} map – { 'action.name': handler, … }
   */
  registerActions(map) {
    for (const [name, fn] of Object.entries(map)) {
      this._actions.set(name, fn);
    }
  }

  /**
   * Execute an action by name.
   * @param {string} name
   * @param {any}    [value] – optional value (e.g. MIDI velocity 0-127)
   */
  trigger(name, value) {
    const fn = this._actions.get(name);
    if (fn) fn(value);
  }

  /**
   * Get all registered action names.
   * @returns {string[]}
   */
  getActions() {
    return Array.from(this._actions.keys());
  }

  // ── Keyboard mapping ──────────────────────────────────────

  /**
   * Bind a keyboard key to an action.
   * @param {string} key    – key value (e.g. 'g', ' ', 'F11')
   * @param {string} action – action name
   */
  bindKey(key, action) {
    this._keyMap.set(key.toLowerCase(), action);
    this._saveMappings();
  }

  /**
   * Remove a keyboard binding.
   */
  unbindKey(key) {
    this._keyMap.delete(key.toLowerCase());
    this._saveMappings();
  }

  /**
   * Get the action bound to a key.
   */
  getKeyAction(key) {
    return this._keyMap.get(key.toLowerCase());
  }

  /**
   * Get all key bindings as { key: action } object.
   */
  getKeyBindings() {
    const out = {};
    for (const [k, v] of this._keyMap) out[k] = v;
    return out;
  }

  /**
   * Install the global keyboard listener.
   */
  enableKeyboard() {
    if (this._kbActive) return;
    this._kbActive = true;

    this._kbHandler = ev => {
      const tag = ev.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const key = ev.key.toLowerCase();
      const action = this._keyMap.get(key);
      if (action) {
        ev.preventDefault();
        this.trigger(action);
      }
    };

    document.addEventListener('keydown', this._kbHandler);
  }

  /**
   * Remove the global keyboard listener.
   */
  disableKeyboard() {
    if (!this._kbActive) return;
    this._kbActive = false;
    document.removeEventListener('keydown', this._kbHandler);
    this._kbHandler = null;
  }

  // ── MIDI mapping ──────────────────────────────────────────

  /**
   * Bind a MIDI CC to an action.
   * @param {number} channel – MIDI channel (0-15)
   * @param {number} cc      – CC number (0-127)
   * @param {string} action  – action name
   */
  bindMidi(channel, cc, action) {
    this._midiMap.set(`${channel}:${cc}`, action);
    this._saveMappings();
  }

  /**
   * Remove a MIDI CC binding.
   */
  unbindMidi(channel, cc) {
    this._midiMap.delete(`${channel}:${cc}`);
    this._saveMappings();
  }

  /**
   * Get all MIDI bindings as { "ch:cc": action } object.
   */
  getMidiBindings() {
    const out = {};
    for (const [k, v] of this._midiMap) out[k] = v;
    return out;
  }

  /**
   * Initialize Web MIDI access (if available).
   * Call this after user gesture.
   */
  async enableMidi() {
    if (this._midiAccess) return;
    if (!navigator.requestMIDIAccess) return;

    try {
      this._midiAccess = await navigator.requestMIDIAccess();
      this._midiAccess.inputs.forEach(input => this._connectMidiInput(input));
      this._midiAccess.addEventListener('statechange', e => {
        if (e.port.type === 'input' && e.port.state === 'connected') {
          this._connectMidiInput(e.port);
        }
      });
    } catch (err) {
      console.warn('MIDI access denied:', err);
    }
  }

  _connectMidiInput(input) {
    input.onmidimessage = ev => {
      const [status, cc, value] = ev.data;
      // CC message: 0xB0-0xBF
      if ((status & 0xF0) === 0xB0) {
        const channel = status & 0x0F;
        const key = `${channel}:${cc}`;
        const action = this._midiMap.get(key);
        if (action) this.trigger(action, value);
      }
    };
  }

  // ── Persistence ───────────────────────────────────────────

  _saveMappings() {
    const data = {
      keys: Object.fromEntries(this._keyMap),
      midi: Object.fromEntries(this._midiMap),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  _loadMappings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.keys) {
        for (const [k, v] of Object.entries(data.keys)) {
          this._keyMap.set(k, v);
        }
      }
      if (data.midi) {
        for (const [k, v] of Object.entries(data.midi)) {
          this._midiMap.set(k, v);
        }
      }
    } catch (_) {}
  }

  /**
   * Install default keyboard bindings (used on first run
   * or when user resets to defaults).
   */
  installDefaults() {
    // Only install if no custom mappings exist
    if (this._keyMap.size > 0) return;

    const defaults = {
      ' ':   'playback.toggle',
      'escape': 'playback.stop',
      'g':   'display.toggleGrid',
      'c':   'display.toggleCRT',
      'm':   'display.toggleMeasure',
      'f':   'display.toggleFullscreen',
      'f11': 'display.toggleFullscreen',
      '1':   'scope.modeYT',
      '2':   'scope.modeXY',
      'r':   'scope.runStop',
      's':   'scope.single',
      '3':   'scene.toggle',
      'tab': 'scene.switchMode',
      '?':   'help.toggle',
    };

    for (const [key, action] of Object.entries(defaults)) {
      this._keyMap.set(key, action);
    }
    this._saveMappings();
  }

  /**
   * Reset all mappings to defaults.
   */
  resetToDefaults() {
    this._keyMap.clear();
    this._midiMap.clear();
    localStorage.removeItem(STORAGE_KEY);
    this.installDefaults();
  }
}

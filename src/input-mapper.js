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

    /**
     * "ch:cc" → action name (string) OR { type:'continuous', target:string }
     * @type {Map<string, string|{type:string,target:string}>}
     */
    this._midiMap = new Map();

    /** @type {boolean} whether keyboard listener is active */
    this._kbActive = false;

    /** @type {MIDIAccess|null} */
    this._midiAccess = null;

    /** @type {boolean} */
    this.midiAvailable = false;

    /** @type {string[]} currently connected input device names */
    this.midiDeviceNames = [];

    /**
     * Continuous target registry: name → { min, max, apply }
     * @type {Map<string, {min:number, max:number, apply:Function}>}
     */
    this._continuousTargets = new Map();

    /**
     * Rising-edge tracking: "ch:cc" → last value (0-127)
     * @type {Map<string, number>}
     */
    this._midiLastValue = new Map();

    /** @type {Function|null} learn-mode callback */
    this._learnCallback = null;

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
   * Bind a MIDI CC to an action name or a continuous target descriptor.
   * @param {number} channel – MIDI channel (0-15)
   * @param {number} cc      – CC number (0-127)
   * @param {string|{type:'continuous',target:string}} action
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
    this._midiLastValue.delete(`${channel}:${cc}`);
    this._saveMappings();
  }

  /**
   * Get all MIDI bindings as { "ch:cc": action } object.
   * Values are action strings or continuous-target descriptors.
   */
  getMidiBindings() {
    const out = {};
    for (const [k, v] of this._midiMap) out[k] = v;
    return out;
  }

  /**
   * Register a continuous parameter target.
   * @param {string} name
   * @param {{min:number, max:number, apply:Function}} opts
   */
  registerContinuous(name, opts) {
    this._continuousTargets.set(name, opts);
  }

  /**
   * Start MIDI learn mode. The next CC message received will call
   * callback({ channel, cc }) and then learn mode ends automatically.
   * @param {Function} callback
   */
  startMidiLearn(callback) {
    this._learnCallback = callback;
  }

  /**
   * Cancel learn mode without binding anything.
   */
  cancelMidiLearn() {
    this._learnCallback = null;
  }

  /**
   * Initialize Web MIDI access (if available).
   * @returns {Promise<boolean>} true if MIDI access was granted.
   */
  async enableMidi() {
    if (this._midiAccess) return true;
    if (!navigator.requestMIDIAccess) return false;

    try {
      this._midiAccess = await navigator.requestMIDIAccess();
      this.midiAvailable = true;
      this._refreshDeviceNames();
      this._midiAccess.inputs.forEach(input => this._connectMidiInput(input));
      this._midiAccess.addEventListener('statechange', e => {
        this._refreshDeviceNames();
        if (e.port.type === 'input' && e.port.state === 'connected') {
          this._connectMidiInput(e.port);
        }
        if (this._onDeviceChange) this._onDeviceChange(this.midiDeviceNames);
      });
      return true;
    } catch (err) {
      console.warn('MIDI access denied:', err);
      return false;
    }
  }

  /** @param {Function} fn  called with device name array on hot-plug */
  onMidiDeviceChange(fn) {
    this._onDeviceChange = fn;
  }

  _refreshDeviceNames() {
    if (!this._midiAccess) return;
    const names = [];
    this._midiAccess.inputs.forEach(input => {
      if (input.state === 'connected') names.push(input.name);
    });
    this.midiDeviceNames = names;
  }

  _connectMidiInput(input) {
    input.onmidimessage = ev => {
      const [status, cc, value] = ev.data;
      // CC message: 0xB0-0xBF
      if ((status & 0xF0) !== 0xB0) return;
      const channel = status & 0x0F;

      // Learn mode intercepts the first message
      if (this._learnCallback) {
        const cb = this._learnCallback;
        this._learnCallback = null;
        cb({ channel, cc });
        return;
      }

      const key = `${channel}:${cc}`;
      const binding = this._midiMap.get(key);
      if (!binding) return;

      if (typeof binding === 'object' && binding.type === 'continuous') {
        // Continuous: map 0-127 onto [min, max] and apply
        const target = this._continuousTargets.get(binding.target);
        if (target) {
          const t = value / 127;
          const mapped = target.min + t * (target.max - target.min);
          target.apply(mapped);
        }
      } else {
        // Trigger (action string): rising-edge only — fire when value crosses ≥64
        const last = this._midiLastValue.get(key) ?? 0;
        this._midiLastValue.set(key, value);
        if (value >= 64 && last < 64) {
          this.trigger(binding, value);
        }
      }
    };
  }

  // ── Persistence ───────────────────────────────────────────

  _saveMappings() {
    // Continuous-target descriptors are plain objects, so they
    // serialize to JSON and round-trip cleanly alongside action strings.
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
          // v is either a string (action) or { type:'continuous', target } object
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
      '4':   'scope.modeVS',
      '5':   'scope.modeFS',
      '6':   'scope.modeSG',
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

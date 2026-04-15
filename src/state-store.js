'use strict';

// ─────────────────────────────────────────────────────────────
//  StateStore — centralised, event-emitting state management
//
//  Usage:
//    const store = new StateStore(SCHEMA);
//    store.on('fx.gradient', (val, old) => { … });
//    store.on('fx.*', (val, old, path) => { … });   // wildcard
//    store.set('fx.gradient', true);
//    store.get('fx.gradient');                        // true
//    store.batch({ 'fx.gradient': true, 'color': '#ff0000' });
//    const snap = store.snapshot();                   // full clone
//    store.restore(snap);                             // bulk apply
// ─────────────────────────────────────────────────────────────

export class StateStore {
  /**
   * @param {Object} schema – nested object defining default values.
   *   Leaf values become the initial state; objects create groups.
   *   Keys starting with '_' are treated as internal/transient
   *   and excluded from snapshot()/restore().
   */
  constructor(schema) {
    /** @type {Map<string, any>} flat path → value */
    this._state = new Map();
    /** @type {Map<string, Set<Function>>} path|wildcard → listeners */
    this._listeners = new Map();
    /** @type {boolean} suppresses events during batch/restore */
    this._silent = false;
    /** @type {Map<string, any>|null} collects changes during batch */
    this._batchChanges = null;

    this._defaults = {};
    this._flatten('', schema, this._defaults);

    // Initialise state from defaults
    for (const [k, v] of Object.entries(this._defaults)) {
      this._state.set(k, this._clone(v));
    }
  }

  // ── Flatten nested schema into dot-paths ──────────────────

  _flatten(prefix, obj, out) {
    for (const key of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const val = obj[key];
      if (val !== null && typeof val === 'object' && !Array.isArray(val)
          && !(val instanceof Float32Array)) {
        this._flatten(path, val, out);
      } else {
        out[path] = val;
      }
    }
  }

  // ── Core API ──────────────────────────────────────────────

  /**
   * Get a value by dot-path.
   * @param {string} path
   * @returns {any}
   */
  get(path) {
    return this._state.get(path);
  }

  /**
   * Set a single value. Fires listeners if value changed.
   * @param {string} path
   * @param {any} value
   * @returns {boolean} true if value actually changed
   */
  set(path, value) {
    const old = this._state.get(path);
    if (old === value) return false;
    this._state.set(path, value);

    if (this._batchChanges) {
      this._batchChanges.set(path, old);
    } else if (!this._silent) {
      this._emit(path, value, old);
    }
    return true;
  }

  /**
   * Set multiple values atomically. Listeners fire once per path
   * after all values are applied.
   * @param {Object} map – { 'path': value, … }
   */
  batch(map) {
    this._batchChanges = new Map();
    for (const [path, value] of Object.entries(map)) {
      this.set(path, value);
    }
    const changes = this._batchChanges;
    this._batchChanges = null;

    if (!this._silent) {
      for (const [path, old] of changes) {
        this._emit(path, this._state.get(path), old);
      }
    }
  }

  /**
   * Return a plain object of all user-configurable state
   * (excludes paths starting with _ at any level).
   */
  snapshot() {
    const out = {};
    for (const [path, val] of this._state) {
      if (this._isInternal(path)) continue;
      out[path] = this._clone(val);
    }
    return out;
  }

  /**
   * Restore from a snapshot. Only sets paths present in the snapshot.
   * Fires listeners after all values applied.
   */
  restore(snap) {
    this.batch(snap);
  }

  /**
   * Reset all state to schema defaults.
   */
  reset() {
    const map = {};
    for (const [k, v] of Object.entries(this._defaults)) {
      map[k] = this._clone(v);
    }
    this.batch(map);
  }

  /**
   * Get all paths matching a prefix (for iteration).
   * @param {string} prefix e.g. 'fx' returns all fx.* paths
   * @returns {string[]}
   */
  keys(prefix) {
    const dot = prefix + '.';
    const result = [];
    for (const path of this._state.keys()) {
      if (path === prefix || path.startsWith(dot)) result.push(path);
    }
    return result;
  }

  /**
   * Get a nested group as a plain object.
   * e.g. store.group('fx') → { reactive: false, bloom: true, … }
   */
  group(prefix) {
    const dot = prefix + '.';
    const out = {};
    for (const [path, val] of this._state) {
      if (path.startsWith(dot)) {
        out[path.slice(dot.length)] = val;
      }
    }
    return out;
  }

  // ── Event system ──────────────────────────────────────────

  /**
   * Subscribe to changes on a path.
   * Supports exact match ('fx.gradient') or wildcard ('fx.*').
   * Wildcard matches any path starting with that prefix.
   *
   * Callback: (newValue, oldValue, path) => void
   *
   * @returns {Function} unsubscribe function
   */
  on(pattern, fn) {
    if (!this._listeners.has(pattern)) {
      this._listeners.set(pattern, new Set());
    }
    this._listeners.get(pattern).add(fn);
    return () => this._listeners.get(pattern)?.delete(fn);
  }

  /**
   * Subscribe to any change on any path.
   * Callback: (newValue, oldValue, path) => void
   * @returns {Function} unsubscribe function
   */
  onAny(fn) {
    return this.on('*', fn);
  }

  /**
   * Remove all listeners for a pattern (or all if no arg).
   */
  off(pattern) {
    if (pattern === undefined) {
      this._listeners.clear();
    } else {
      this._listeners.delete(pattern);
    }
  }

  // ── Internal ──────────────────────────────────────────────

  _emit(path, val, old) {
    // Exact match listeners
    const exact = this._listeners.get(path);
    if (exact) exact.forEach(fn => fn(val, old, path));

    // Wildcard listeners: check 'group.*' patterns
    for (const [pattern, fns] of this._listeners) {
      if (pattern === '*') {
        fns.forEach(fn => fn(val, old, path));
      } else if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        if (path.startsWith(prefix + '.')) {
          fns.forEach(fn => fn(val, old, path));
        }
      }
    }
  }

  _isInternal(path) {
    // Any segment starting with _ marks the path as internal
    const parts = path.split('.');
    return parts.some(p => p.startsWith('_'));
  }

  _clone(v) {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.slice();
    if (v instanceof Float32Array) return new Float32Array(v);
    return JSON.parse(JSON.stringify(v));
  }
}

// ─────────────────────────────────────────────────────────────
//  Default schema — canonical source of truth for all
//  user-configurable + internal oscilloscope state
// ─────────────────────────────────────────────────────────────

export const STATE_SCHEMA = {
  // ── Scope operational ──
  scope: {
    running:   true,     // is scope running (vs paused)
    mode:      'YT',     // 'YT' or 'XY'
  },

  // ── Channel 1 ──
  ch1: {
    coupling: 'AC',      // 'AC', 'DC', 'GND'
    vdivIdx:  3,         // index into VDIV table
    pos:      0,         // vertical position (-2 to 2)
  },

  // ── Channel 2 ──
  ch2: {
    coupling: 'AC',
    vdivIdx:  3,
    pos:      0,
  },

  // ── Horizontal / Timebase ──
  horiz: {
    tbIdx: 24,           // index into TIMEBASE table
    hPos:  0,            // horizontal position
  },

  // ── Trigger ──
  trigger: {
    source: 1,           // 1 or 2
    edge:   'rising',    // 'rising' or 'falling'
    mode:   'auto',      // 'auto', 'normal', 'single'
    level:  0,           // -1 to 1
  },

  // ── Display / beam appearance ──
  display: {
    color:       '#00ff41',
    sceneColor:  '',
    beamWidth:   1.5,
    glow:        12,
    persistence: 0.15,
    showGrid:    true,
    crtCurve:    true,
    showMeasure: true,
  },

  // ── Signal processing ──
  signal: {
    smooth:        false,
    filterEnabled: false,
    filterLow:     200,
    filterHigh:    3000,
  },

  // ── Visual FX ──
  fx: {
    reactive:     false,
    beatFlash:    false,
    bloom:        false,
    mirrorX:      false,
    mirrorY:      false,
    rotation:     false,
    beatInvert:   false,
    afterglow:    false,
    gradient:     false,

    rotSpeed:      0.003,
    beatSens:      1.5,
    afterglowSpeed: 0,
    afterglowStr:  0.7,
    reactiveStr:   1.0,
    beatStr:       0.35,
    bloomStr:      1.0,

    gradientStart: '#00ff41',
    gradientEnd:   '#ff00ff',
    gradientDir:   'h',

    // Internal animation (excluded from snapshots)
    _angle:    0,
    _flash:    0,
    _rms:      0,
    _lastRotT: 0,
  },

  // ── Scene (3D / image overlay) ──
  scene: {
    enabled:   false,     // objMode
    mode3d:    true,      // true = OBJ wireframe, false = image

    // Transform (shared between 3D and image)
    scale:  0.8,
    rotZ:   0,
    posX:   0,
    posY:   0,

    // Tiling
    tileX:   1,
    tileY:   1,
    radialN: 1,
    scrollX: 0,
    scrollY: 0,

    // Auto-rotation
    autoRotX:  false,
    autoRotY:  true,
    autoRotZ:  false,
    rotSpeedX: 0.5,
    rotSpeedY: 0.5,
    rotSpeedZ: 0.5,

    // Music reactivity
    beatPulse: true,
    showAudio: false,
    breathe:   false,
    shake:     false,

    // Warp & motion effects
    warp:        false,
    warpAmt:     0.1,
    float:       false,
    ripple:      false,
    twist:       false,
    explode:     false,
    explodeLoop: false,
    motionAmt:   0.2,
    motionSpeed: 1.0,

    // Draw power
    power:      1,
    autoPower:  false,
    powerSpeed: 0.004,
    powerLoop:  false,
  },

  // ── Signal generator ──
  siggen: {
    active:    false,
    waveform:  'sine',
    freqL:     440,
    freqR:     440,
    phase:     90,
    amplitude: 0.8,
  },

  // ── Audio engine ──
  audio: {
    _playing: false,     // internal: current playback state
  },
};

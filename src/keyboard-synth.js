'use strict';

// ─────────────────────────────────────────────────────────────
//  KeyboardSynth — polyphonic synth driven by computer keyboard.
//  Manages its own per-voice OscillatorNodes (one pair per held
//  key, L and R with the configured interval ratio) so multiple
//  notes can ring simultaneously to form chords.
//
//  In XY mode, intervals between simultaneous notes produce
//  layered Lissajous figures — chords appear as visual geometry.
//
//  FL Studio-style key layout:
//    White keys (Z-row): Z X C V B N M , . /
//    Black keys (A-row): S D _ G H J _ L ;
// ─────────────────────────────────────────────────────────────

// Base frequencies for octave 4, A4 = 440 Hz
const NOTE_FREQS = {
  'C':  261.63, 'C#': 277.18, 'D':  293.66, 'D#': 311.13,
  'E':  329.63, 'F':  349.23, 'F#': 369.99, 'G':  392.00,
  'G#': 415.30, 'A':  440.00, 'A#': 466.16, 'B':  493.88,
};

// key.toLowerCase() → [noteName, octaveOffset]
const KEY_MAP = {
  // White keys — Z row
  'z': ['C',  0], 'x': ['D',  0], 'c': ['E',  0], 'v': ['F',  0],
  'b': ['G',  0], 'n': ['A',  0], 'm': ['B',  0],
  ',': ['C',  1], '.': ['D',  1], '/': ['E',  1],
  // Black keys — A/S row
  's': ['C#', 0], 'd': ['D#', 0],
  'g': ['F#', 0], 'h': ['G#', 0], 'j': ['A#', 0],
  'l': ['C#', 1], ';': ['D#', 1],
};

// Keys that the InputMapper normally handles — we suppress these in synth mode
const SUPPRESS_IN_SYNTH = new Set([
  'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/',
  's', 'd', 'g', 'h', 'j', 'l', ';',
  '-', '=',
]);

// Per-voice peak gain. Total audible gain = NUM_VOICES × VOICE_GAIN, capped
// by the master gain node. Keep low to avoid clipping on chords.
const VOICE_GAIN = 0.20;
const ATTACK_S   = 0.005;   // 5ms attack — anti-click
const RELEASE_S  = 0.04;    // 40ms release — anti-click + smooth chord transitions

export class KeyboardSynth {
  /**
   * @param {import('./signal-generator.js').SignalGenerator} sigGen
   * @param {import('./oscilloscope.js').Oscilloscope} scope
   * @param {import('./audio-engine.js').AudioEngine} engine
   */
  constructor(sigGen, scope, engine) {
    this.sigGen  = sigGen;       // kept only for waveform preference
    this.scope   = scope;
    this.engine  = engine;

    this._enabled     = false;
    this._baseOctave  = 4;
    this._intervalNum = 1;
    this._intervalDen = 1;
    this._waveform    = 'sine';

    // voices: Map<voiceKey, voice> where voice = { oscL, oscR, gainL, gainR, releasing }
    this._voices = new Map();

    // Keep track of "currently held key" for UI display purposes only
    this._lastNote = null;   // { name, octave, freq }
    this._savedMode = null;
    this._savedSigGenActive = false;

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp   = this._handleKeyUp.bind(this);

    this.onStateChange = null;
  }

  // ── Public API ────────────────────────────────────────────

  enable() {
    if (this._enabled) return;
    this._enabled = true;

    const actx = this.engine.actx;
    if (actx && actx.state === 'suspended') {
      actx.resume().catch(() => {});
    }

    this._savedMode = this.scope.mode;
    this._savedSigGenActive = this.sigGen.active;

    // Switch scope to XY mode so chords visualize as layered Lissajous
    if (this.scope.mode !== 'XY') {
      this.scope.mode = 'XY';
      this._syncModeButtons('XY');
    }

    // The synth manages its own oscillators directly; stop the sigGen if
    // it was running so its single pair doesn't fight with our voices.
    if (this.sigGen.active) {
      this.sigGen.stop();
    }

    document.addEventListener('keydown', this._onKeyDown, true);
    document.addEventListener('keyup',   this._onKeyUp,   true);

    this._notify();
  }

  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('keyup',   this._onKeyUp,   true);

    // Stop all voices immediately (with quick release)
    for (const key of this._voices.keys()) {
      this._releaseVoice(key, true);   // forceFast = true
    }

    // Restore previous sigGen state if it was active
    if (this._savedSigGenActive) {
      this.sigGen.start(this.engine.analyserL, this.engine.analyserR, this.engine.gainNode);
    }

    // Restore scope mode
    if (this._savedMode && this._savedMode !== this.scope.mode) {
      this.scope.mode = this._savedMode;
      this._syncModeButtons(this._savedMode);
    }

    this._lastNote = null;
    this._notify();
  }

  isEnabled() { return this._enabled; }

  setBaseOctave(n) {
    this._baseOctave = Math.max(1, Math.min(8, n));
    this._notify();
  }

  getBaseOctave() { return this._baseOctave; }

  setIntervalRatio(num, denom) {
    this._intervalNum = num;
    this._intervalDen = denom;
    // Update R-channel frequency on all currently held voices
    const ratio = num / denom;
    const now = this.engine.actx ? this.engine.actx.currentTime : 0;
    for (const v of this._voices.values()) {
      if (v.releasing) continue;
      v.oscR.frequency.setTargetAtTime(v.freqL * ratio, now, 0.01);
    }
    this._notify();
  }

  getIntervalRatio() { return { num: this._intervalNum, den: this._intervalDen }; }

  getCurrentNote() { return this._lastNote; }

  getActiveVoiceCount() {
    let n = 0;
    for (const v of this._voices.values()) if (!v.releasing) n++;
    return n;
  }

  /**
   * Allow the UI to set the waveform. Applies to currently-held voices
   * and all future voices.
   */
  setWaveform(w) {
    this._waveform = w;
    for (const v of this._voices.values()) {
      try { v.oscL.type = w; v.oscR.type = w; } catch (_) {}
    }
  }

  // ── Internal ──────────────────────────────────────────────

  _handleKeyDown(ev) {
    if (!this._enabled) return;

    const tag = ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (ev.repeat) {
      // OS auto-repeat: ignore; voice is already on
      const key = this._normalizeKey(ev.key);
      if (KEY_MAP[key] || SUPPRESS_IN_SYNTH.has(key)) {
        ev.preventDefault(); ev.stopPropagation();
      }
      return;
    }

    const key = this._normalizeKey(ev.key);

    // Octave shift
    if (key === '-') {
      ev.preventDefault(); ev.stopPropagation();
      this.setBaseOctave(this._baseOctave - 1);
      return;
    }
    if (key === '=' || key === '+') {
      ev.preventDefault(); ev.stopPropagation();
      this.setBaseOctave(this._baseOctave + 1);
      return;
    }

    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      document.getElementById('btn-synth')?.click();
      return;
    }

    const mapping = KEY_MAP[key];
    if (!mapping) {
      if (SUPPRESS_IN_SYNTH.has(key)) {
        ev.preventDefault(); ev.stopPropagation();
      }
      return;
    }

    ev.preventDefault(); ev.stopPropagation();

    const [noteName, octOff] = mapping;
    const octave = this._baseOctave + octOff;
    this._startVoice(key, noteName, octave);
  }

  _handleKeyUp(ev) {
    if (!this._enabled) return;
    const key = this._normalizeKey(ev.key);
    if (!KEY_MAP[key]) return;
    this._releaseVoice(key);
  }

  _normalizeKey(k) {
    if (k === ',' || k === '.' || k === '/' || k === ';' || k === '-' || k === '=' || k === '+') return k;
    return (k || '').toLowerCase();
  }

  /** Voice key includes the resolved octave so changing octave creates a new voice. */
  _voiceKey(key, octave) { return `${key}@${octave}`; }

  _startVoice(key, noteName, octave) {
    const actx = this.engine.actx;
    if (!actx) return;

    const voiceKey = this._voiceKey(key, octave);

    // If this voice is already ringing, ignore (auto-repeat protection)
    const existing = this._voices.get(voiceKey);
    if (existing && !existing.releasing) return;
    // If a previous voice for this key is still releasing, stop it instantly
    if (existing) this._stopVoiceImmediate(voiceKey);

    const base = NOTE_FREQS[noteName];
    if (!base) return;

    const freqL = base * Math.pow(2, octave - 4);
    const freqR = freqL * (this._intervalNum / this._intervalDen);

    // Build voice graph: oscL → gainL → analyserL + gainNode (audible)
    const oscL  = actx.createOscillator();
    const oscR  = actx.createOscillator();
    const gainL = actx.createGain();
    const gainR = actx.createGain();

    oscL.type = this._waveform;
    oscR.type = this._waveform;
    oscL.frequency.value = freqL;
    oscR.frequency.value = freqR;

    // Anti-click attack envelope
    const now = actx.currentTime;
    gainL.gain.setValueAtTime(0, now);
    gainR.gain.setValueAtTime(0, now);
    gainL.gain.linearRampToValueAtTime(VOICE_GAIN, now + ATTACK_S);
    gainR.gain.linearRampToValueAtTime(VOICE_GAIN, now + ATTACK_S);

    oscL.connect(gainL);
    oscR.connect(gainR);
    gainL.connect(this.engine.analyserL);
    gainR.connect(this.engine.analyserR);
    if (this.engine.gainNode) {
      gainL.connect(this.engine.gainNode);
      gainR.connect(this.engine.gainNode);
    }

    oscL.start(now);
    oscR.start(now);

    this._voices.set(voiceKey, {
      oscL, oscR, gainL, gainR, freqL, freqR,
      noteName, octave, releasing: false,
    });

    this._lastNote = { name: noteName, octave, freq: freqL };
    this._notify();
  }

  _releaseVoice(voiceKeyOrPlainKey, forceFast = false) {
    // The argument can be the full voice key (e.g. "z@4") or just the
    // plain keyboard key. For the plain-key case, find the matching voice.
    let voiceKey = voiceKeyOrPlainKey;
    if (!voiceKey.includes('@')) {
      const plain = voiceKey;
      voiceKey = null;
      for (const k of this._voices.keys()) {
        if (k.startsWith(plain + '@')) { voiceKey = k; break; }
      }
      if (!voiceKey) return;
    }
    const v = this._voices.get(voiceKey);
    if (!v || v.releasing) return;

    v.releasing = true;

    const actx = this.engine.actx;
    const now = actx.currentTime;
    const releaseDur = forceFast ? 0.005 : RELEASE_S;

    // Cancel any pending automation, then ramp to zero
    try {
      v.gainL.gain.cancelScheduledValues(now);
      v.gainR.gain.cancelScheduledValues(now);
      v.gainL.gain.setValueAtTime(v.gainL.gain.value, now);
      v.gainR.gain.setValueAtTime(v.gainR.gain.value, now);
      v.gainL.gain.linearRampToValueAtTime(0, now + releaseDur);
      v.gainR.gain.linearRampToValueAtTime(0, now + releaseDur);
    } catch (_) {}

    // Schedule teardown after release
    setTimeout(() => this._stopVoiceImmediate(voiceKey), (releaseDur * 1000) + 20);

    // Update display: show another held note, or clear
    let surviving = null;
    for (const v2 of this._voices.values()) {
      if (!v2.releasing) { surviving = v2; break; }
    }
    this._lastNote = surviving
      ? { name: surviving.noteName, octave: surviving.octave, freq: surviving.freqL }
      : null;
    this._notify();
  }

  _stopVoiceImmediate(voiceKey) {
    const v = this._voices.get(voiceKey);
    if (!v) return;
    try { v.oscL.stop(); } catch (_) {}
    try { v.oscR.stop(); } catch (_) {}
    try { v.gainL.disconnect(); } catch (_) {}
    try { v.gainR.disconnect(); } catch (_) {}
    try { v.oscL.disconnect(); } catch (_) {}
    try { v.oscR.disconnect(); } catch (_) {}
    this._voices.delete(voiceKey);
  }

  _syncModeButtons(mode) {
    const ytBtn = document.getElementById('btn-yt');
    const xyBtn = document.getElementById('btn-xy');
    const vsBtn = document.getElementById('btn-vs');
    if (!ytBtn) return;
    ytBtn.classList.toggle('active', mode === 'YT');
    xyBtn.classList.toggle('active', mode === 'XY');
    if (vsBtn) vsBtn.classList.toggle('active', mode === 'VS');
  }

  _notify() {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({
        enabled:     this._enabled,
        baseOctave:  this._baseOctave,
        intervalNum: this._intervalNum,
        intervalDen: this._intervalDen,
        currentNote: this._lastNote,
        voiceCount:  this.getActiveVoiceCount(),
      });
    }
  }
}

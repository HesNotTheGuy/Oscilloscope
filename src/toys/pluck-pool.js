'use strict';

const MAX_EVENTS = 200;
const PEAK = 0.12;
const VIS_GAIN = 0.15;

const TIMBRES = {
  pluck:  { type: 'triangle', filter: 'lowpass',  mul: 5,   q: 0.7, decay: 0.45, noise: 0.35 },
  glass:  { type: 'sine',     filter: 'bandpass', mul: 1,   q: 12,  decay: 1.05, noise: 0 },
  mallet: { type: 'sine',     filter: 'lowpass',  mul: 3.5, q: 1.2, decay: 0.18, noise: 0.6 },
};

function midiOf(freq) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export class PluckPool {
  constructor({ actx, dest, visL, visR, maxVoices = 16, debounceMs = 40 } = {}) {
    this._actx = actx || null;
    this._dest = dest || null;
    this._visL = visL || null;
    this._visR = visR || null;
    this._max = maxVoices;
    this._debounceMs = debounceMs;
    this.noteEvents = [];
    this._voices = [];
    this._lastGlobal = -Infinity;
    this._lastById = new Map();
    this._noise = null;
  }

  activeCount() {
    this._prune();
    return this._voices.length;
  }

  pluck({ freq, timbre, when, id } = {}) {
    if (!this._actx || !this._dest) return false;
    const f = Number(freq);
    if (!Number.isFinite(f) || f < 20 || f > 12000) return false;
    const wall = performance.now();
    if (wall - this._lastGlobal < this._debounceMs) return false;
    if (id != null && wall - (this._lastById.get(id) ?? -Infinity) < this._debounceMs) return false;

    const spec = TIMBRES[timbre] || TIMBRES.pluck;
    const name = TIMBRES[timbre] ? timbre : 'pluck';
    this._prune();
    if (this._voices.length >= this._max) {
      this._silence(this._voices.shift());
    }

    const t0 = Number.isFinite(Number(when)) ? Number(when) : this._actx.currentTime;
    let voice;
    try {
      voice = this._start(f, spec, t0);
    } catch (_) {
      return false;
    }
    this._voices.push(voice);
    this._lastGlobal = wall;
    if (id != null) this._lastById.set(id, wall);
    this.noteEvents.push({ t: t0, freq: f, midi: midiOf(f), timbre: name, id: id ?? null });
    if (this.noteEvents.length > MAX_EVENTS) this.noteEvents.shift();
    return true;
  }

  dispose() {
    for (const v of this._voices) this._silence(v);
    this._voices = [];
  }

  _prune() {
    if (!this._actx) return;
    const t = this._actx.currentTime;
    this._voices = this._voices.filter(v => v.stopAt > t);
  }

  _noiseBuf() {
    if (this._noise) return this._noise;
    const sr = this._actx.sampleRate || 44100;
    const n = Math.max(1, Math.floor(sr * 0.03));
    const buf = this._actx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    this._noise = buf;
    return buf;
  }

  _start(freq, spec, t0) {
    const actx = this._actx;
    const osc = actx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(freq, t0);

    const filter = actx.createBiquadFilter();
    filter.type = spec.filter;
    filter.frequency.setValueAtTime(Math.min(16000, Math.max(80, freq * spec.mul)), t0);
    filter.Q.setValueAtTime(spec.q, t0);

    const mix = actx.createGain();
    const noiseAmp = spec.noise > 0 ? Math.min(spec.noise, 0.45) : 0;
    const oscGain = actx.createGain();
    oscGain.gain.value = 1 - noiseAmp;
    osc.connect(oscGain);
    oscGain.connect(mix);

    let noise = null;
    if (noiseAmp > 0) {
      noise = actx.createBufferSource();
      noise.buffer = this._noiseBuf();
      const ng = actx.createGain();
      ng.gain.value = noiseAmp;
      noise.connect(ng);
      ng.connect(mix);
      noise.start(t0);
      noise.stop(t0 + 0.03);
    }

    const env = actx.createGain();
    const attack = 0.004;
    const end = t0 + Math.max(spec.decay, attack + 0.02);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(PEAK, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    mix.connect(filter);
    filter.connect(env);
    env.connect(this._dest);

    if (this._visL || this._visR) {
      const tap = actx.createGain();
      tap.gain.value = VIS_GAIN;
      env.connect(tap);
      if (this._visL) tap.connect(this._visL);
      if (this._visR) tap.connect(this._visR);
    }

    osc.start(t0);
    osc.stop(end + 0.02);

    const voice = { osc, noise, env, stopAt: end + 0.03, dead: false };
    osc.onended = () => { voice.stopAt = 0; };
    return voice;
  }

  _silence(voice) {
    if (!voice || voice.dead || !this._actx) return;
    voice.dead = true;
    const t = this._actx.currentTime;
    try {
      voice.env.gain.cancelScheduledValues(t);
      voice.env.gain.setValueAtTime(0.0001, t);
    } catch (_) {}
    try { voice.osc.stop(t); } catch (_) {}
    try { if (voice.noise) voice.noise.stop(t); } catch (_) {}
    voice.stopAt = t;
  }
}

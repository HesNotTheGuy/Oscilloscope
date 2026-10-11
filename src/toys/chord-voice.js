'use strict';

import { voiceKind } from './chord-ratios.js';

const CLICK_SEC = 0.02;
const FADE_SEC = 0.04;
const CLICK_PEAK = 0.22;
const TONE_GAIN = 0.06;
const VIS_GAIN = 0.18;
const CLICK_HZ = [680, 1320, 2460, 4700];

function clickWhen(time, now) {
  if (time < now - CLICK_SEC) return null;
  return time < now ? now : time;
}

export class ChordVoice {
  constructor({ actx, dest, visL, visR }) {
    this._actx = actx;
    this._rates = [];
    this._oscs = [];
    this._noise = null;
    this._dead = false;
    this._clickGain = actx.createGain();
    this._toneGain = actx.createGain();
    this._out = actx.createGain();
    this._clickGain.gain.value = 1;
    this._toneGain.gain.value = 0;
    this._clickGain.connect(this._out);
    this._toneGain.connect(this._out);
    this._out.connect(dest);
    if (visL || visR) {
      const tap = actx.createGain();
      tap.gain.value = VIS_GAIN;
      this._out.connect(tap);
      if (visL) tap.connect(visL);
      if (visR) tap.connect(visR);
    }
  }

  setRates(rates) {
    const prev = this._kind();
    this._rates = rates.slice();
    const next = this._kind();
    const t = this._actx.currentTime;
    if (next === 'tone') {
      this._ensureOscs(t);
      if (prev !== 'tone') {
        this._ramp(this._clickGain.gain, 0, t);
        this._ramp(this._toneGain.gain, TONE_GAIN, t);
      }
    } else if (prev === 'tone') {
      this._ramp(this._toneGain.gain, 0, t);
      this._ramp(this._clickGain.gain, 1, t);
      this._stopOscs(t + FADE_SEC);
    }
  }

  scheduleClick(ring, time) {
    if (this._kind() === 'tone') return;
    const actx = this._actx;
    const t0 = clickWhen(time, actx.currentTime);
    if (t0 == null) return;
    const src = actx.createBufferSource();
    src.buffer = this._noiseBuf();
    const filter = actx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(CLICK_HZ[ring] || CLICK_HZ[CLICK_HZ.length - 1], t0);
    filter.Q.setValueAtTime(1.4, t0);
    const env = actx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(CLICK_PEAK, t0 + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + CLICK_SEC);
    src.connect(filter);
    filter.connect(env);
    env.connect(this._clickGain);
    src.start(t0);
    src.stop(t0 + CLICK_SEC + 0.01);
  }

  dispose() {
    if (this._dead) return;
    this._dead = true;
    this._stopOscs(this._actx.currentTime);
    this._out.disconnect();
  }

  _kind() {
    if (!this._rates.length) return 'click';
    let slow = this._rates[0];
    for (let i = 1; i < this._rates.length; i++) {
      if (this._rates[i] < slow) slow = this._rates[i];
    }
    return voiceKind(slow);
  }

  _ensureOscs(t) {
    if (this._oscs.length !== this._rates.length) {
      this._stopOscs(t);
      this._oscs = this._rates.map(freq => this._startOsc(freq, t));
      return;
    }
    for (let i = 0; i < this._rates.length; i++) {
      this._oscs[i].frequency.setTargetAtTime(this._rates[i], t, 0.02);
    }
  }

  _startOsc(freq, t) {
    const osc = this._actx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    osc.connect(this._toneGain);
    osc.start(t);
    osc._stopped = false;
    return osc;
  }

  _stopOscs(when) {
    const oscs = this._oscs;
    this._oscs = [];
    for (const osc of oscs) {
      if (osc._stopped) continue;
      osc._stopped = true;
      osc.stop(when);
    }
  }

  _ramp(param, target, t) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(target, t + FADE_SEC);
  }

  _noiseBuf() {
    if (this._noise) return this._noise;
    const sr = this._actx.sampleRate || 44100;
    const n = Math.max(1, Math.floor(sr * CLICK_SEC));
    const buf = this._actx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const falloff = 1 - i / n;
      data[i] = (Math.random() * 2 - 1) * falloff * falloff;
    }
    this._noise = buf;
    return buf;
  }
}

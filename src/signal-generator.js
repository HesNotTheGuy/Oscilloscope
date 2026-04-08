'use strict';

// ─────────────────────────────────────────────────────────────
//  SignalGenerator — built-in oscillators for Lissajous shapes
// ─────────────────────────────────────────────────────────────
export class SignalGenerator {
  constructor() {
    this.actx    = null;
    this._oscL   = null;
    this._oscR   = null;
    this._gainL  = null;
    this._gainR  = null;
    this.active  = false;
    this.waveform = 'sine';
    this.freqL   = 440;
    this.freqR   = 440;
    this.phase   = 90; // degrees
    this.amplitude = 0.8;
  }

  init(actx) { this.actx = actx; }

  start(analyserL, analyserR) {
    if (!this.actx) return;
    this.stop();

    this._gainL = this.actx.createGain(); this._gainL.gain.value = this.amplitude;
    this._gainR = this.actx.createGain(); this._gainR.gain.value = this.amplitude;

    this._oscL = this.actx.createOscillator();
    this._oscL.type = this.waveform;
    this._oscL.frequency.value = this.freqL;

    this._oscR = this.actx.createOscillator();
    this._oscR.type = this.waveform;
    this._oscR.frequency.value = this.freqR;

    this._oscL.connect(this._gainL);
    this._oscR.connect(this._gainR);
    this._gainL.connect(analyserL);
    this._gainR.connect(analyserR);

    const now = this.actx.currentTime;
    // Phase offset: R starts phaseDelay seconds after L
    const phaseDelay = (this.phase / 360) / Math.max(1, this.freqR);
    this._oscL.start(now);
    this._oscR.start(now + phaseDelay);
    this.active = true;
  }

  stop() {
    [this._oscL, this._oscR].forEach(o => {
      if (o) { try { o.stop(); } catch (_) {} }
    });
    [this._gainL, this._gainR].forEach(g => {
      if (g) { try { g.disconnect(); } catch (_) {} }
    });
    this._oscL = this._oscR = this._gainL = this._gainR = null;
    this.active = false;
  }

  setFreqL(f) { this.freqL = f; if (this._oscL) this._oscL.frequency.setTargetAtTime(f, this.actx.currentTime, 0.01); }
  setFreqR(f) { this.freqR = f; if (this._oscR) this._oscR.frequency.setTargetAtTime(f, this.actx.currentTime, 0.01); }
  setWaveform(w) { this.waveform = w; if (this._oscL) { this._oscL.type = w; this._oscR.type = w; } }
  setAmplitude(a) { this.amplitude = a; if (this._gainL) { this._gainL.gain.value = a; this._gainR.gain.value = a; } }
}

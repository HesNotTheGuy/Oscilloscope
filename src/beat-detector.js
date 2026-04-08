'use strict';

// ─────────────────────────────────────────────────────────────
//  BeatDetector — energy-based onset detection
// ─────────────────────────────────────────────────────────────
export class BeatDetector {
  constructor() {
    this._history  = new Float32Array(60);  // ~1s history at 60fps
    this._head     = 0;
    this._cooldown = 0;
    this._runSum   = 0;      // running sum of history entries (avoids .reduce() each frame)
    this.sensitivity = 1.5;
  }

  detect(rms) {
    // Accept pre-computed RMS instead of raw data (avoids double-computing)
    const e   = rms;
    const len = this._history.length;
    const idx = this._head % len;
    this._runSum -= this._history[idx];   // subtract oldest
    this._history[idx] = e;
    this._runSum += e;                    // add newest
    this._head++;

    const avg = this._runSum / len;
    this._cooldown = Math.max(0, this._cooldown - 1);

    if (e > avg * this.sensitivity && e > 0.02 && this._cooldown === 0) {
      this._cooldown = 18;
      return { beat: true, energy: e, avg };
    }
    return { beat: false, energy: e, avg };
  }
}

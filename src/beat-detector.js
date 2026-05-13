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
    this._beatTimes     = [];  // recent beat timestamps (ms)
    this._maxBeatHistory = 32; // sliding window
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
      this._beatTimes.push(performance.now());
      if (this._beatTimes.length > this._maxBeatHistory) this._beatTimes.shift();
      return { beat: true, energy: e, avg };
    }
    return { beat: false, energy: e, avg };
  }

  getBPM() {
    const t = this._beatTimes;
    if (t.length < 4) return 0;
    // Filter to recent beats (last 8 seconds) so old idle beats don't pollute
    const now = performance.now();
    const recent = t.filter(x => now - x < 8000);
    if (recent.length < 4) return 0;
    // Compute median inter-beat interval
    const intervals = [];
    for (let i = 1; i < recent.length; i++) intervals.push(recent[i] - recent[i - 1]);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median <= 0) return 0;
    let bpm = 60000 / median;
    // Snap to common tempos — most music is 60-200 BPM
    while (bpm < 60) bpm *= 2;
    while (bpm > 200) bpm /= 2;
    return Math.round(bpm);
  }
}

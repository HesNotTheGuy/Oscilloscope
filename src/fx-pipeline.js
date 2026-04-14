'use strict';

import { BeatDetector } from './beat-detector.js';

// ─────────────────────────────────────────────────────────────
//  FXPipeline — visual effects computation, separated from
//  oscilloscope rendering. Reads FX state, audio data,
//  and produces per-frame computed values.
// ─────────────────────────────────────────────────────────────
export class FXPipeline {
  constructor() {
    this._beatDet = new BeatDetector();
    this.lastBeat = false;

    // Computed per-frame outputs
    this.rms      = 0;
    this.flash    = 0;
    this.angle    = 0;
    this._lastRotT = 0;
  }

  /**
   * Update per-frame FX state.
   * @param {Float32Array} data    – audio waveform data
   * @param {Object}       fx      – FX state (reactive, beatFlash, rotation, etc.)
   */
  update(data, fx) {
    const len = data.length;

    // RMS — computed once, shared with beat detector
    let sumSq = 0;
    for (let i = 0; i < len; i++) sumSq += data[i] * data[i];
    this.rms = Math.sqrt(sumSq / len);

    // Beat detection
    this._beatDet.sensitivity = fx.beatSens;
    const { beat } = this._beatDet.detect(this.rms);
    this.lastBeat = beat;

    // Flash decay
    if (beat && fx.beatFlash) this.flash = 1.0;
    if (this.flash > 0) this.flash *= 0.72;

    // Rotation (time-based)
    if (fx.rotation) {
      const now = performance.now() / 1000;
      const dt  = this._lastRotT > 0 ? Math.min(now - this._lastRotT, 0.05) : 1 / 60;
      this._lastRotT = now;
      this.angle = (this.angle + fx.rotSpeed * dt * 60) % (Math.PI * 2);
    }

    // Write transient state back to fx for backward compat
    fx._rms   = this.rms;
    fx._flash = this.flash;
    fx._angle = this.angle;
    fx._lastRotT = this._lastRotT;
  }

  /**
   * Compute rendered glow value.
   */
  computeGlow(baseGlow, fx) {
    return fx.reactive
      ? baseGlow + this.rms * 60 * fx.reactiveStr
      : baseGlow;
  }

  /**
   * Compute rendered beam width.
   */
  computeBeamWidth(baseWidth, fx) {
    return fx.reactive
      ? baseWidth * (1 + this.rms * 1.5 * fx.reactiveStr)
      : baseWidth;
  }

  /**
   * Build per-point gradient color arrays for the GL renderer.
   * @param {Array<Array<[number,number]>>} allPts – point sets
   * @param {Object}   fx   – FX state
   * @param {number}   H    – canvas height (for vertical gradient)
   * @param {Function} rgba – glr._rgba() color parser
   * @returns {Array|null}   – array of color arrays, or null if gradient disabled
   */
  computeGradient(allPts, fx, H, rgba) {
    if (!fx.gradient || !allPts.length) return null;

    const _s0 = rgba(fx.gradientStart, 1.0);
    const r0 = _s0[0], g0 = _s0[1], b0 = _s0[2];
    const _s1 = rgba(fx.gradientEnd, 1.0);
    const r1 = _s1[0], g1 = _s1[1], b1 = _s1[2];
    const vertical = fx.gradientDir === 'v';

    return allPts.map(pts => {
      const n = pts.length;
      const colors = new Array(n);
      for (let i = 0; i < n; i++) {
        const t = vertical ? (pts[i][1] / H) : (n > 1 ? i / (n - 1) : 0);
        colors[i] = [r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t, 1.0];
      }
      return colors;
    });
  }

  /**
   * Compute beat flash RGB for the GL composite shader.
   * @returns {Array|null} [r, g, b] or null
   */
  computeFlashRGB(fx, color, rgba) {
    if (this.flash <= 0.01) return null;
    const c = rgba(fx.beatInvert ? '#ffffff' : color);
    const i = this.flash * fx.beatStr;
    return [c[0] * i, c[1] * i, c[2] * i];
  }

  /**
   * Compute decay value (persistence or afterglow override).
   */
  computeDecay(persistence, fx) {
    return fx.afterglow ? (1 - fx.afterglowStr) : persistence;
  }

  /**
   * Compute halation bloom strength.
   */
  computeHaloStr(fx) {
    return fx.bloom ? 0.35 * fx.bloomStr : 0;
  }

  /**
   * Compute hue shift value for afterglow.
   */
  computeHueShift(fx) {
    return fx.afterglow ? fx.afterglowSpeed : 0;
  }
}

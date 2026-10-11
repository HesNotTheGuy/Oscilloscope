'use strict';

const MIN_N = 8;
const MAX_N = 32;
const CLAMP = 4;
// The 5-point stencil goes unstable once speed^2 passes about 0.5.
const MAX_C2 = 0.45;

export function clampGrid(n) {
  const r = Math.round(Number(n));
  if (!Number.isFinite(r)) return 16;
  return Math.max(MIN_N, Math.min(MAX_N, r));
}

function clampAmp(v) {
  if (v > CLAMP) return CLAMP;
  if (v < -CLAMP) return -CLAMP;
  return v;
}

export class WaveField {
  constructor(n) {
    this._n = 0;
    this.u = new Float32Array(0);
    this.v = new Float32Array(0);
    this.resize(n);
  }

  get size() {
    return this._n;
  }

  resize(n) {
    const next = clampGrid(n);
    this._n = next;
    this.u = new Float32Array(next * next);
    this.v = new Float32Array(next * next);
  }

  impulse(x, y, amp) {
    const n = this._n;
    const xi = Math.max(1, Math.min(n - 2, Math.round(Number(x))));
    const yi = Math.max(1, Math.min(n - 2, Math.round(Number(y))));
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) return;
    const i = yi * n + xi;
    const a = Number(amp);
    if (!Number.isFinite(a)) return;
    this.u[i] = clampAmp(this.u[i] + a);
  }

  step({ speed, damping } = {}) {
    const n = this._n;
    const u = this.u;
    const v = this.v;
    const s = Number(speed);
    const c2 = Math.min(MAX_C2, Number.isFinite(s) ? s * s : 0);
    let d = Number(damping);
    if (!Number.isFinite(d)) d = 1;
    if (d < 0) d = 0;
    if (d > 1) d = 1;

    const last = n - 1;
    for (let y = 1; y < last; y++) {
      const row = y * n;
      for (let x = 1; x < last; x++) {
        const i = row + x;
        const lap = u[i - 1] + u[i + 1] + u[i - n] + u[i + n] - 4 * u[i];
        v[i] = d * (v[i] + c2 * lap);
      }
    }
    for (let y = 1; y < last; y++) {
      const row = y * n;
      for (let x = 1; x < last; x++) {
        const i = row + x;
        u[i] = clampAmp(u[i] + v[i]);
        v[i] = clampAmp(v[i]);
      }
    }
  }

  energy() {
    const u = this.u;
    const v = this.v;
    let e = 0;
    for (let i = 0; i < u.length; i++) e += u[i] * u[i] + v[i] * v[i];
    return e;
  }

  uAt(x, y) {
    return this._sample(this.u, x, y);
  }

  vAt(x, y) {
    return this._sample(this.v, x, y);
  }

  _sample(buf, x, y) {
    const n = this._n;
    if (x < 0 || y < 0 || x >= n || y >= n) return 0;
    return buf[y * n + x];
  }
}

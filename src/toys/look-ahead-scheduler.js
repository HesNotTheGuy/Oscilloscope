'use strict';

export class LookAheadScheduler {
  constructor({ clock, lookAhead, onSchedule }) {
    if (!clock || typeof clock.now !== 'function') throw new Error('clock.now is required');
    if (typeof onSchedule !== 'function') throw new Error('onSchedule is required');
    this._clock = clock;
    this._lookAhead = lookAhead;
    this._onSchedule = onSchedule;
    this._pulses = [];
    this._speed = 1;
    this._origin = 0;
    this._k = [];
  }

  setPattern({ pulses, speed, origin }) {
    if (!(speed > 0) || !Number.isFinite(speed)) throw new Error('speed must be positive');
    this._pulses = pulses;
    this._speed = speed;
    this._origin = origin;
    const now = this._clock.now();
    this._k = pulses.map(n => this._firstK(n, now));
  }

  tick() {
    const now = this._clock.now();
    const horizon = now + this._lookAhead;
    const pulses = this._pulses;
    for (let i = 0; i < pulses.length; i++) {
      const n = pulses[i];
      let k = this._k[i];
      let t = this._time(n, k);
      if (t < now) {
        k = this._firstK(n, now);
        t = this._time(n, k);
      }
      while (t < horizon) {
        this._onSchedule(i, t);
        k += 1;
        t = this._time(n, k);
      }
      this._k[i] = k;
    }
  }

  _time(n, k) {
    return this._origin + k / (n * this._speed);
  }

  _firstK(n, now) {
    if (now <= this._origin) return 0;
    const interval = 1 / (n * this._speed);
    return Math.ceil((now - this._origin) / interval - 1e-9);
  }
}

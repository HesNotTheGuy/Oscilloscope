'use strict';

import { sampleShape } from './shapes/index.js';

export class ShapePlayer {
  constructor() {
    this.actx = null;
    this.active = false;
    this.preset = null;
    this.trace = null;
    this._src = null;
    this._split = null;
    this._gainL = null;
    this._gainR = null;
  }

  init(actx) {
    this.actx = actx;
  }

  start(preset, visL, visR, n = 4096) {
    if (!this.actx) return;
    this.stop();
    const trace = sampleShape(preset, n);
    this.trace = trace;
    this.preset = preset;

    const buf = this.actx.createBuffer(2, trace.L.length, this.actx.sampleRate);
    buf.copyToChannel(trace.L, 0);
    buf.copyToChannel(trace.R, 1);

    this._src = this.actx.createBufferSource();
    this._src.buffer = buf;
    this._src.loop = true;
    this._split = this.actx.createChannelSplitter(2);
    this._gainL = this.actx.createGain();
    this._gainR = this.actx.createGain();
    this._gainL.gain.value = 1;
    this._gainR.gain.value = 1;
    this._src.connect(this._split);
    this._split.connect(this._gainL, 0);
    this._split.connect(this._gainR, 1);
    this._gainL.connect(visL);
    this._gainR.connect(visR);
    this._src.start();
    this.active = true;
  }

  stop() {
    if (this._src) {
      try { this._src.stop(); } catch (_) {}
      try { this._src.disconnect(); } catch (_) {}
    }
    [this._split, this._gainL, this._gainR].forEach(n => {
      if (n) { try { n.disconnect(); } catch (_) {} }
    });
    this._src = this._split = this._gainL = this._gainR = null;
    this.active = false;
    this.preset = null;
    this.trace = null;
  }
}

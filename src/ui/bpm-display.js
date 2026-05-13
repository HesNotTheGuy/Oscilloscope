'use strict';

// ─────────────────────────────────────────────────────────────
//  BpmDisplay — polls the beat detector and updates the BPM
//  status element every 500ms.
// ─────────────────────────────────────────────────────────────
export class BpmDisplay {
  constructor(ctx) {
    this.scope = ctx.scope;
    this._beatDet   = null;
    this._intervalId = null;
    this._el         = null;
  }

  init() {
    this._el = document.getElementById('st-bpm');
    if (!this._el) return;

    this._beatDet = this._findBeatDetector();
    this._intervalId = setInterval(() => this._refresh(), 500);
  }

  _findBeatDetector() {
    const s = this.scope;
    if (s?._fxPipe?._beatDet) return s._fxPipe._beatDet;
    if (s?._fxPipe?.beatDet)  return s._fxPipe.beatDet;
    if (s?._beatDetector)      return s._beatDetector;
    if (s?.engine?._beatDetector) return s.engine._beatDetector;
    return null;
  }

  _refresh() {
    if (!this._el) return;
    const bpm = this._beatDet?.getBPM ? this._beatDet.getBPM() : 0;
    this._el.textContent = bpm > 0 ? `${bpm} BPM` : '— BPM';
  }
}

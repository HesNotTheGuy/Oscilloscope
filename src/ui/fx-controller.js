'use strict';

import { bindRange } from './ui-utils.js';

// ─────────────────────────────────────────────────────────────
//  FXController — visual effects (gradient, reactive, bloom, etc.)
// ─────────────────────────────────────────────────────────────
export class FXController {
  constructor(ctx) {
    this.scope = ctx.scope;
    this.store = ctx.store;
  }

  init() {
    const s = this.scope;

    const fxBindCheck = (id, key) => {
      document.getElementById(id).addEventListener('change', e => {
        s.fx[key] = e.target.checked;
        const block = e.target.closest('.fx-block');
        if (block) block.classList.toggle('fx-active', e.target.checked);
      });
    };

    // ── Gradient beam ──
    fxBindCheck('fx-gradient', 'gradient');
    document.getElementById('gradient-start').addEventListener('input', e => { s.fx.gradientStart = e.target.value; });
    document.getElementById('gradient-end').addEventListener('input', e => { s.fx.gradientEnd = e.target.value; });
    document.getElementById('grad-dir-h').addEventListener('click', () => {
      s.fx.gradientDir = 'h';
      document.getElementById('grad-dir-h').classList.add('active');
      document.getElementById('grad-dir-v').classList.remove('active');
    });
    document.getElementById('grad-dir-v').addEventListener('click', () => {
      s.fx.gradientDir = 'v';
      document.getElementById('grad-dir-v').classList.add('active');
      document.getElementById('grad-dir-h').classList.remove('active');
    });

    // ── FX toggles ──
    fxBindCheck('fx-reactive',  'reactive');
    fxBindCheck('fx-beat',      'beatFlash');
    fxBindCheck('fx-bloom',     'bloom');
    fxBindCheck('fx-afterglow', 'afterglow');
    fxBindCheck('fx-mirror-x',  'mirrorX');
    fxBindCheck('fx-mirror-y',  'mirrorY');
    fxBindCheck('fx-rotate',    'rotation');
    fxBindCheck('fx-invert',    'beatInvert');

    // ── FX parameters ──
    bindRange('fx-rot-speed',      v => { s.fx.rotSpeed      = v; document.getElementById('fx-rs-val').textContent = v.toFixed(3); });
    bindRange('fx-beat-sens',      v => { s.fx.beatSens      = v; document.getElementById('fx-bs-val').textContent = v.toFixed(2); });
    bindRange('fx-afterglow-speed', v => { s.fx.afterglowSpeed = v; document.getElementById('fx-ag-val').textContent = v.toFixed(3); });
    bindRange('fx-afterglow-str',  v => { s.fx.afterglowStr  = v; document.getElementById('fx-afterglow-str-val').textContent = v.toFixed(2); });
    bindRange('fx-reactive-str',   v => { s.fx.reactiveStr   = v; document.getElementById('fx-reactive-str-val').textContent = v.toFixed(1); });
    bindRange('fx-beat-str',       v => { s.fx.beatStr       = v; document.getElementById('fx-beat-str-val').textContent = v.toFixed(2); });
    bindRange('fx-bloom-str',      v => { s.fx.bloomStr      = v; document.getElementById('fx-bloom-str-val').textContent = v.toFixed(1); });
  }
}

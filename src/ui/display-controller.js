'use strict';

import { bindRange } from './ui-utils.js';

// ─────────────────────────────────────────────────────────────
//  DisplayController — color, beam, grid, CRT, filters
// ─────────────────────────────────────────────────────────────
export class DisplayController {
  constructor(ctx) {
    this.scope = ctx.scope;
    this.store = ctx.store;
  }

  init() {
    const s = this.scope;

    // ── Display toggles ──
    document.getElementById('show-grid').addEventListener('change', e => s.showGrid = e.target.checked);
    document.getElementById('crt-curve').addEventListener('change', e => s.crtCurve = e.target.checked);
    document.getElementById('smooth').addEventListener('change', e => s.smooth = e.target.checked);
    document.getElementById('freq-filter').addEventListener('change', e => s.filterEnabled = e.target.checked);
    document.getElementById('filter-low').addEventListener('change', e => s.filterLow = Math.max(20, +e.target.value));
    document.getElementById('filter-high').addEventListener('change', e => s.filterHigh = Math.min(20000, +e.target.value));

    // ── Frequency filter presets ──
    const filterPresetBtns = document.querySelectorAll('.filter-preset-btn');
    filterPresetBtns.forEach(btn => btn.addEventListener('click', () => {
      const lo = +btn.dataset.lo, hi = +btn.dataset.hi;
      s.filterLow = lo; s.filterHigh = hi;
      document.getElementById('filter-low').value  = lo;
      document.getElementById('filter-high').value = hi;
      document.getElementById('freq-filter').checked = true;
      s.filterEnabled = true;
      filterPresetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }));

    // ── Scanlines ──
    document.getElementById('scanlines').addEventListener('change', e => {
      document.getElementById('crt-overlay').classList.toggle('scanlines', e.target.checked);
    });

    // ── Color swatches ──
    const _applyColor = hex => {
      s.color = hex;
      document.getElementById('phosphor-color').value = hex;
      document.documentElement.style.setProperty('--p', hex);
      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
      const match = document.querySelector(`.color-swatch[data-color="${hex}"]`);
      if (match) match.classList.add('active');
    };
    document.querySelectorAll('.color-swatch').forEach(btn => {
      btn.addEventListener('click', () => _applyColor(btn.dataset.color));
    });
    document.getElementById('phosphor-color').addEventListener('input', ev => {
      s.color = ev.target.value;
      document.documentElement.style.setProperty('--p', ev.target.value);
      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
    });

    // ── Beam parameters ──
    bindRange('beam-width',  v => { s.beamWidth   = v; document.getElementById('beam-width-val').textContent = v.toFixed(1); });
    bindRange('glow',        v => { s.glowAmount  = v; document.getElementById('glow-val').textContent = Math.round(v); });
    bindRange('persistence', v => { s.persistence = v; document.getElementById('persistence-val').textContent = v.toFixed(2); });

    // ── Scene color ──
    const scColorOn = document.getElementById('scene-color-on');
    const scColorPk = document.getElementById('scene-color');
    scColorOn.addEventListener('change', e => {
      const on = e.target.checked;
      scColorPk.disabled = !on;
      s.sceneColor = on ? scColorPk.value : '';
    });
    scColorPk.addEventListener('input', e => {
      if (scColorOn.checked) s.sceneColor = e.target.value;
    });
  }
}

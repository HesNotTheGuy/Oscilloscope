'use strict';

// ─────────────────────────────────────────────────────────────
//  ThemeController — theme picker UI wiring
// ─────────────────────────────────────────────────────────────
export class ThemeController {
  constructor(ctx) {
    this.scope = ctx.scope;
    this.store = ctx.store;
    this.themeMgr = ctx.themeMgr;
  }

  init() {
    const select = document.getElementById('theme-select');
    if (!select || !this.themeMgr) return;

    // Populate options
    const themes = this.themeMgr.list();
    themes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });

    // Set current value
    select.value = this.themeMgr.current();

    // On change, apply theme and update scope defaults
    select.addEventListener('change', () => {
      this._applyTheme(select.value);
    });
  }

  /** Apply theme and update scope/display defaults. */
  _applyTheme(themeId) {
    const scopeDefaults = this.themeMgr.apply(themeId);
    if (!scopeDefaults) return;

    const s = this.scope;

    // Update trace color (both beam and gradient start default)
    if (scopeDefaults.traceColor) {
      s.color = scopeDefaults.traceColor;
      const colorPicker = document.getElementById('phosphor-color');
      if (colorPicker) colorPicker.value = scopeDefaults.traceColor;

      // Update active swatch
      document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
      const match = document.querySelector(`.color-swatch[data-color="${scopeDefaults.traceColor}"]`);
      if (match) match.classList.add('active');
    }

    if (scopeDefaults.gradientStart) {
      const gradStart = document.getElementById('gradient-start');
      if (gradStart) gradStart.value = scopeDefaults.gradientStart;
    }

    // Update beam display parameters
    if (scopeDefaults.glowAmount !== undefined) {
      s.glowAmount = scopeDefaults.glowAmount;
      const el = document.getElementById('glow');
      const valEl = document.getElementById('glow-val');
      if (el) el.value = scopeDefaults.glowAmount;
      if (valEl) valEl.textContent = Math.round(scopeDefaults.glowAmount);
    }

    if (scopeDefaults.beamWidth !== undefined) {
      s.beamWidth = scopeDefaults.beamWidth;
      const el = document.getElementById('beam-width');
      const valEl = document.getElementById('beam-width-val');
      if (el) el.value = scopeDefaults.beamWidth;
      if (valEl) valEl.textContent = scopeDefaults.beamWidth.toFixed(1);
    }

    if (scopeDefaults.persistence !== undefined) {
      s.persistence = scopeDefaults.persistence;
      const el = document.getElementById('persistence');
      const valEl = document.getElementById('persistence-val');
      if (el) el.value = scopeDefaults.persistence;
      if (valEl) valEl.textContent = scopeDefaults.persistence.toFixed(2);
    }
  }
}

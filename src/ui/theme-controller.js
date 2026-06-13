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

    // Populate options (built-ins + customs)
    this._populateSelect(select);

    // Set current value
    select.value = this.themeMgr.current();

    // On change, apply theme and update scope defaults
    select.addEventListener('change', () => {
      this._applyTheme(select.value);
    });

    // Wire export button
    const exportBtn = document.getElementById('theme-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this._handleExport());
    }

    // Wire import button + hidden file input
    const importBtn  = document.getElementById('theme-import-btn');
    const importFile = document.getElementById('theme-import-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', () => {
        const file = importFile.files[0];
        if (!file) return;
        importFile.value = '';           // reset so same file can be re-imported
        const reader = new FileReader();
        reader.onload = (e) => this._handleImport(e.target.result, select);
        reader.readAsText(file);
      });
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Rebuild the <select> options, grouping built-ins and customs.
   * @param {HTMLSelectElement} select
   */
  _populateSelect(select) {
    // Remove all existing children
    while (select.firstChild) select.removeChild(select.firstChild);

    const themes   = this.themeMgr.list();
    const builtins = themes.filter(t => !t.custom);
    const customs  = themes.filter(t =>  t.custom);

    builtins.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });

    if (customs.length) {
      const group = document.createElement('optgroup');
      group.label = 'Custom';
      customs.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }
  }

  /** Export the currently selected theme as a JSON file. */
  _handleExport() {
    const themeId = this.themeMgr.current();
    const theme   = this.themeMgr.exportTheme(themeId);
    if (!theme) return;

    const json = JSON.stringify(theme, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href:     url,
      download: `dso1-theme-${themeId}.json`,
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Parse and import a JSON theme, rebuild the dropdown, and apply it.
   * @param {string} text  Raw file text
   * @param {HTMLSelectElement} select
   */
  _handleImport(text, select) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      console.warn('[ThemeController] import failed — invalid JSON:', e);
      select.title = 'Import failed: invalid JSON';
      return;
    }

    let theme;
    try {
      theme = this.themeMgr.importTheme(obj);
    } catch (e) {
      console.warn('[ThemeController] import failed — validation error:', e.message);
      select.title = `Import failed: ${e.message}`;
      return;
    }

    // Restore default title and rebuild dropdown
    select.title = 'Color theme';
    const prevId = select.value;
    this._populateSelect(select);

    // Select and apply the imported theme
    select.value = theme.id;
    // If the id somehow isn't in the list (shouldn't happen), fall back
    if (!select.value) select.value = prevId;
    this._applyTheme(select.value);
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

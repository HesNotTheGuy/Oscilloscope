'use strict';

import { THEMES, getTheme, hexToRgb } from './themes.js';

// ─────────────────────────────────────────────────────────────
//  ThemeManager — applies CSS custom-property themes and
//  returns scope default overrides for the active theme.
// ─────────────────────────────────────────────────────────────
const STORAGE_KEY        = 'osc_theme';
const CUSTOM_STORAGE_KEY = 'osc_customThemes';

/** Built-in IDs — used for collision detection during import. */
const BUILTIN_IDS = new Set(THEMES.map(t => t.id));

/** Keys allowed in a theme's `scope` object. */
const SCOPE_KEYS = new Set(['traceColor', 'gradientStart', 'glowAmount', 'beamWidth', 'persistence']);

// ── Custom theme storage helpers ──────────────────────────────

function _loadCustoms() {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function _saveCustoms(map) {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[ThemeManager] could not save custom themes:', e);
  }
}

export class ThemeManager {
  constructor() {
    this._current = localStorage.getItem(STORAGE_KEY) || 'classic-lab';
  }

  /**
   * Apply a theme by ID.
   * Sets CSS custom properties on :root, persists choice,
   * manages the body data-theme attribute for theme-specific
   * CSS selectors (e.g. frosted-glass backdrop-filter).
   *
   * @param {string} themeId
   * @returns {object} theme.scope defaults (traceColor, glowAmount, etc.)
   */
  apply(themeId) {
    // Resolve: built-ins win on id collision, then customs.
    const builtin = THEMES.find(t => t.id === themeId);
    const customs  = _loadCustoms();
    const theme    = builtin || customs[themeId];

    if (!theme) return this.apply('classic-lab');

    const root = document.documentElement;

    // Set all CSS custom properties
    for (const [prop, value] of Object.entries(theme.css)) {
      root.style.setProperty(prop, value);
    }

    // Ensure --p-rgb is always set (compute from --p if theme omitted it)
    if (!theme.css['--p-rgb'] && theme.css['--p']) {
      root.style.setProperty('--p-rgb', hexToRgb(theme.css['--p']));
    }

    // Theme-specific body attribute for CSS selectors
    document.body.dataset.theme = themeId;

    // Persist
    this._current = themeId;
    localStorage.setItem(STORAGE_KEY, themeId);

    return theme.scope || {};
  }

  /** Currently active theme ID. */
  current() {
    return this._current;
  }

  /**
   * Full list of available themes for populating the picker.
   * Built-ins first, then customs (flagged with `custom: true`).
   */
  list() {
    const builtins = THEMES.map(t => ({ id: t.id, name: t.name, custom: false }));
    const customs  = _loadCustoms();
    const customList = Object.values(customs).map(t => ({
      id:     t.id,
      name:   t.name,
      custom: true,
    }));
    return [...builtins, ...customList];
  }

  /** Get the full theme object for a given ID (built-in or custom). */
  exportTheme(themeId) {
    const builtin = THEMES.find(t => t.id === themeId);
    if (builtin) return builtin;
    const customs = _loadCustoms();
    if (customs[themeId]) return customs[themeId];
    return null;
  }

  /**
   * Validate and sanitize an imported theme object.
   * Returns the cleaned object or throws with a descriptive message.
   *
   * Rules:
   * - Must have `id` (string), `name` (string), `css` (object, all keys start with '--').
   * - `scope`: only keep known keys (traceColor, gradientStart, glowAmount, beamWidth, persistence).
   * - `titleBar`: kept as-is if present.
   * - Unknown top-level keys are stripped.
   * - `id` is sanitised to kebab-case; if it collides with a built-in, prefixed with `custom-`.
   */
  importTheme(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Theme must be an object.');
    if (typeof obj.id !== 'string' || !obj.id.trim()) throw new Error('Theme must have a string "id".');
    if (typeof obj.name !== 'string' || !obj.name.trim()) throw new Error('Theme must have a string "name".');
    if (!obj.css || typeof obj.css !== 'object' || Array.isArray(obj.css)) {
      throw new Error('Theme must have a "css" object.');
    }

    // Validate css keys
    for (const k of Object.keys(obj.css)) {
      if (!k.startsWith('--')) throw new Error(`css key "${k}" must start with "--".`);
    }

    // Sanitise id: lowercase, replace anything not [a-z0-9-] with '-', collapse runs
    let id = obj.id
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!id) id = 'custom';

    // Prefix if collides with built-in
    if (BUILTIN_IDS.has(id)) id = 'custom-' + id;

    // Sanitise scope
    let scope = {};
    if (obj.scope && typeof obj.scope === 'object' && !Array.isArray(obj.scope)) {
      for (const k of SCOPE_KEYS) {
        if (k in obj.scope) scope[k] = obj.scope[k];
      }
    }

    // Build clean object
    const clean = { id, name: String(obj.name).trim(), css: obj.css, scope };
    if (obj.titleBar && typeof obj.titleBar === 'object') clean.titleBar = obj.titleBar;

    // Persist
    const customs = _loadCustoms();
    customs[id] = clean;
    _saveCustoms(customs);

    return clean;
  }

  /** Remove a custom theme from storage. */
  deleteCustomTheme(id) {
    const customs = _loadCustoms();
    delete customs[id];
    _saveCustoms(customs);
  }

  /** Get the full theme object for the current theme. */
  currentTheme() {
    const builtin = THEMES.find(t => t.id === this._current);
    if (builtin) return builtin;
    const customs = _loadCustoms();
    return customs[this._current] || THEMES[0];
  }
}

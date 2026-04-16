'use strict';

import { THEMES, getTheme, hexToRgb } from './themes.js';

// ─────────────────────────────────────────────────────────────
//  ThemeManager — applies CSS custom-property themes and
//  returns scope default overrides for the active theme.
// ─────────────────────────────────────────────────────────────
const STORAGE_KEY = 'osc_theme';

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
    const theme = getTheme(themeId);
    const root  = document.documentElement;

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

    return theme.scope;
  }

  /** Currently active theme ID. */
  current() {
    return this._current;
  }

  /** Full list of available themes (for populating picker). */
  list() {
    return THEMES.map(t => ({ id: t.id, name: t.name }));
  }

  /** Get the full theme object for the current theme. */
  currentTheme() {
    return getTheme(this._current);
  }
}

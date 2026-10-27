# Themes and layout

The topbar theme `<select>` restyles the chrome and default beam color. The rig `<select>` moves panels among the four zones, or into the default tabbed layout. Both persist on the profile in `localStorage`.

## Sub-features

- `theme-pick` applies a built-in from `#theme-select` (`classic-lab`, `tektronix-blue`, `analog-amber`, `mil-spec`, `modern-minimal`, `synthwave`, `wooden-rack`, `oled-dark`, `nixie-tube`, `frosted-glass`, `liquid-glass`).
- `theme-export` / `theme-import` use `#theme-export-btn` and `#theme-import-btn` (file picker).
- `rig-pick` applies `#rig-select` values `default`, `classic`, `studio`, `perform`.
- `rig-menu` opens workspace actions from `#rig-menu-btn` / `#rig-menu` (hidden attribute, not a CSS class).

## How to get to it (user POV)

- Change the theme dropdown in the topbar.
- Change the rig dropdown. **Default** is tabbed (Scope / Beam / Scene / Source). **Classic**, **Studio**, and **Perform** spread panels across zones.
- Open **⋯** for Save / Update / Delete / Edit layout / Toggle masonry.

## Driving it with verify-dso1

Preconditions:

- Doctor is green.
- First-run card is dismissed so it does not cover the dropdowns.
- You are on the disposable `--user-data-dir` profile. Theme writes `osc_theme`. Rig writes `osc_rigName`.

- **Theme.** Choose Synthwave. Run `... select --id theme-select --value synthwave`. `#theme-select` value is `synthwave`. `document.body.dataset.theme` is `synthwave`. Snapshot field `bodyTheme` matches.
- **Theme proof.** Screenshot. The chrome is the synthwave styling. Brand `DSO-1` is still in the topbar. `evidence/themes-and-layout/theme-synthwave.png` plus `after-theme.json`.
- **Rig Classic.** Choose Classic. Run `... select --id rig-select --value classic`. `.app` loses `tabbed-mode`. The Scope tab bar is `display: none`. Horiz mode buttons are visible without clicking a tab.
- **Rig Default.** Choose Default. Run `... select --id rig-select --value default`. `.app.tabbed-mode` returns. Source tab is the one `layout-controller.js` selects (`activeTab = 'source'`).
- **Workspace menu.** Open **⋯**. Run `... click --id rig-menu-btn`. `#rig-menu` no longer has the `hidden` attribute.
- **Proof.** Keep before/after snapshots for both the theme value and `tabbed` / `rigSelect`. Cleanup must not delete those files.

## Gotchas

- README describes a **Minimal** rig. `index.html` options are only `default`, `classic`, `studio`, `perform`. Drive those.
- Setting `select.value` without a bubbling `change` event does nothing. The helper's `select` command dispatches that event.
- `screenshot.js` calls `themeMgr.apply()` directly. That is not this recipe.
- Custom theme import needs a real file through `#theme-import-file`. Skip import on a machine with no fixture file and report `verified-unreachable` with that reason.
- `#rig-menu` and `#rec-menu` use the `hidden` attribute. Do not look for an `.open` class.

# Scope modes

The Horiz panel switches the beam among voltage-vs-time (YT), XY Lissajous (XY), vectorscope (VS), spectrum bars (FS), and spectrogram waterfall (SG). The clicked mode button keeps class `active`. The others lose it.

## Sub-features

- `mode-yt` shows the standard waveform view from `#btn-yt` or key `1`.
- `mode-xy` shows XY / Lissajous from `#btn-xy` or key `2`.
- `mode-vs` shows the vectorscope from `#btn-vs` or key `4`.
- `mode-fs` shows the 64-bar spectrum from `#btn-fs` or key `5`.
- `mode-sg` shows the spectrogram from `#btn-sg` or key `6`.
- `mode-visible-tab` puts those buttons on screen via the Scope tab before a screenshot.

## How to get to it (user POV)

- Open the **Scope** tab (default window) or pick a Classic / Studio / Perform rig so the Horiz panel is visible.
- Click **YT**, **XY**, **VS**, **FS**, or **SG**.
- Press `1`, `2`, `4`, `5`, or `6` while focus is not in an input, select, or textarea. Key `3` toggles scene mode. It is not a display mode.

## Driving it with verify-dso1

Preconditions:

- Doctor is green on the instance this run launched.
- `.first-run-hint` is gone (`dismiss-first-run`).
- You are proving the user click path, not `window._dso.scope.mode = ...`.

- **Show the buttons.** Choose the Scope tab. Run `node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs click --selector 'button.tab-bar-btn[data-tab="scope"]'`. That button gets class `active`. `#btn-xy` is no longer under `.tab-hidden`.
- **Baseline snapshot.** Record YT as the factory default. Run `... snapshot --out .cursor/skills/verify-oscilloscope/evidence/scope-modes/before.json`. `modes.yt` is true. `modes.xy` is false. `scopeMode` is `YT`.
- **Click XY.** Choose **XY**. Run `... click --id btn-xy`. `#btn-xy` has class `active`. `#btn-yt`, `#btn-vs`, `#btn-fs`, and `#btn-sg` do not.
- **Resulting state.** Snapshot again. Run `... snapshot --out .cursor/skills/verify-oscilloscope/evidence/scope-modes/after.json`. `modes.xy` is true. `scopeMode` is `XY`.
- **Keyboard sibling.** Return to YT, then press `5`. Run `... click --id btn-yt` then `... press --key 5`. `#btn-fs` is active and `scopeMode` is `FS`. InputMapper maps `5` to `scope.modeFS`, which clicks `#btn-fs`.
- **One-shot.** The helper encodes the XY click recipe. Run `... drive-scope-modes`. It writes `evidence/scope-modes/proof.json`, `before.json`, `after.json`, and `after-xy.png`.
- **Proof.** Screenshot the window after XY. Run `... screenshot --out .cursor/skills/verify-oscilloscope/evidence/scope-modes/after-xy.png`. The topbar still shows `DSO-1`. If the Scope tab is active, **XY** is the lit mode button.

## Gotchas

- Default tab is Source. Horiz (and therefore the mode buttons) starts with class `tab-hidden`. Clicks still work. Screenshots of the button row do not, until you open Scope or change `#rig-select` off `default`.
- Key `3` is `scene.toggle` (`#obj-mode`), not a sixth waveform mode. Key `d` switches OBJ/IMG after scene is on. README still says Tab. The mapper stopped binding Tab because it trapped focus.
- `screenshot.js` sets `s.mode = 'FS'` and toggles classes by hand. That is not this recipe.
- Synth enable forces XY. Disable synth before you claim a YT click stuck.
- Synth enable forces XY. The old generator shape-preset path in `siggen-controller.js` would too, but those buttons are not in `index.html` now.

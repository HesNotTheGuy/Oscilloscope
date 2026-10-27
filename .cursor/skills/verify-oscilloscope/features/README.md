# DSO-1 Oscilloscope verification map

This directory is the maintained source for verifying user-facing behavior of DSO-1 Oscilloscope, the desktop Electron visualizer in this repo. Read this index, then the matching feature file, before you drive the window.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs launch` so the instance uses `/tmp/dso1-verify/user-data` (or `$DSO1_VERIFY_DIR/user-data`).
- Run `doctor` and require title `DSO-1 Oscilloscope`, a live pid that owns that user-data dir, and `window._dso.scope`.
- Dismiss `.first-run-hint` with `dismiss-first-run` (the **Got it** button) before clicking other controls.
- Never drive an Electron process this run did not start.
- Default layout is tabbed. The Source tab is selected. Mode buttons, RUN/STOP, and MEASURE live on the Scope tab (`button.tab-bar-btn[data-tab="scope"]`). Signal generator and presets live on Source (`data-tab="source"`).

## Driving conventions

- Start every recipe from the baseline unless the feature file says otherwise.
- Click real ids from `index.html`. Do not assign `window._dso.scope.mode` or other internals. `screenshot.js` does that for docs shots. It is not this map.
- Treat helper flags as literal.
- Restore nothing that lives in the disposable user-data dir. That dir is deleted on cleanup.
- Leave `evidence/<feature-id>/` in place.

## Proof and skip reporting

- Capture the action and the resulting state, not only the last screenshot.
- UI proof includes `snapshot` JSON and a PNG where the topbar brand `DSO-1` is visible.
- A skipped entry point is not verified by a different path. Say which handle you used.
- An unreachable path needs the command you ran and the unmet precondition (no display, AudioContext blocked, PATCH tour covering the rack).

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line each.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-dso1` starts with `Preconditions:` and uses labeled bullets that pair a user action with a helper command and an observable result.
4. `Gotchas` lists traps that waste or invalidate a run.

## Features

- [Scope modes](./scope-modes.md) covers YT, XY, VS, FS, and SG from the Horiz panel and from keys 1, 2, 4, 5, 6.
- [Signal generator](./signal-generator.md) covers START/STOP, ratio buttons, and Lissajous shape presets.
- [PATCH mode](./patch-mode.md) covers opening the rack, PATCH BOOK recipes, and STREAM.
- [Keyboard synth](./keyboard-synth.md) covers the SYNTH toggle, the floating panel, and interval buttons.
- [Themes and layout](./themes-and-layout.md) covers `#theme-select` and `#rig-select`.

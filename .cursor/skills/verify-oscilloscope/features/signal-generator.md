# Signal generator

The SIG GEN panel runs two oscillators into the scope. START routes them to the visualizer and writes `Signal Gen` into `#st-src`. The START button does not switch to XY. Lissajous is START plus an XY click plus L:R ratio and phase.

## Sub-features

- `gen-start` starts the dual oscillator from `#btn-gen-start`.
- `gen-stop` stops it from `#btn-gen-stop` and sets `#st-src` to `No signal`.
- `gen-ratio` sets L:R from `.ratio-btn[data-ratio]` (keeps L, updates R).
- `gen-lissajous` is START, then XY, then ratio and `#gen-phase`.
- `gen-help` toggles `#siggen-guide` from `#siggen-help-btn`.

## How to get to it (user POV)

- On the default tabbed layout, stay on **Source** or search for "signal generator".
- On Classic / Studio / Perform, find the SIG GEN panel in the under or bottom zone.
- Click **START**, a ratio chip, then **XY** on the Scope tab. Click **STOP** to idle.
- Click **?** beside the panel title for the in-panel guide.

## Driving it with verify-dso1

Preconditions:

- Doctor is green.
- First-run card is dismissed.
- Synth is off (`#synth-panel[hidden]`).
- Scope mode is still YT if you are proving that START does not steal XY.

- **Start.** Choose **START**. Run `... click --id btn-gen-start`. `#btn-gen-start` is `disabled`. `#btn-gen-stop` is enabled and has class `active`. `#st-src` text is `Signal Gen`.
- **Stay on YT.** Snapshot. `modes.yt` remains true. A toast may tell the user to switch to XY. That is intentional in `siggen-controller.js`.
- **Switch for Lissajous.** Choose **XY** yourself. Run `... click --selector 'button.tab-bar-btn[data-tab="scope"]'` then `... click --id btn-xy`. `#btn-xy` is active.
- **Ratio.** On Source, click **1:2**. Run `... click --selector '.ratio-btn[data-ratio="2"]'`. That chip gets `.active`. `#gen-freq-r` updates from L times 2.
- **Stop.** Choose **STOP**. Run `... click --id btn-gen-stop`. `#st-src` returns to `No signal`. `#btn-gen-start` is enabled again.
- **Proof.** Snapshot plus screenshot while START is down and XY is selected. `#st-src` reads `Signal Gen`. The brand `DSO-1` is in the topbar.

## Gotchas

- `ensureAudio()` needs an AudioContext. Launch already passes `--autoplay-policy=no-user-gesture-required`. If START no-ops, doctor the instance and check `electron.log` rather than poking `window._dso.sigGen`.
- START does not change mode. `siggen-controller.js` still has `SHAPE_PRESETS` and queries `.gen-preset-btn`, but `index.html` has no such buttons in this checkout. Do not drive a circle/heart preset that is not in the DOM.
- `#btn-idle-sig` is a different oscillator (CTRL panel, Scope tab). It does not set `#st-src` to `Signal Gen`.
- SYSTEM loopback (`#btn-sysaudio`) is Windows WASAPI in `main.js`. Do not claim it on Linux.

# Keyboard synth

The keyboard synth turns the computer keyboard into a polyphonic oscillator that drives the scope. Opening it shows `#synth-panel` and adds `.synth-active` on `#btn-synth`. Enable also switches the scope to XY so intervals draw as Lissajous figures.

## Sub-features

- `synth-open` opens the panel from `#btn-synth` or key `k`.
- `synth-close` closes from `#synth-panel-close`, a second `#btn-synth` click, or Esc once synth is on.
- `synth-interval` sets L:R from `#synth-interval-grid .synth-iv-btn` (`data-num` / `data-den`).
- `synth-wave` sets the oscillator shape from `#synth-wave`.
- `synth-octave` shifts with `#synth-oct-up`, `#synth-oct-down`, or keys `=` / `-` while synth is on.

## How to get to it (user POV)

- Click **SYNTH** in the topbar.
- Press `K` (InputMapper action `synth.toggle`, bound in `keyboard-synth-controller.js`).
- Play notes on the Z-row / S-row layout printed in the panel. Esc exits synth and restores the previous scope mode.

## Driving it with verify-dso1

Preconditions:

- Doctor is green.
- First-run is dismissed. The welcome card also dismisses on `k` / `K`, which would hide the card and not toggle synth if the hint is still up.
- PATCH tour is not covering the window.

- **Open from the button.** Choose **SYNTH**. Run `... click --id btn-synth`. `#synth-panel` has `hidden === false`. `#btn-synth` has class `synth-active`. `#btn-xy` becomes active because enable forces XY.
- **Open from the key.** Close, then press `k`. Run `... click --id btn-synth` to close, then `... press --key k`. Same panel and class results.
- **Interval.** Choose **3:2**. Run `... click --selector '.synth-iv-btn[data-num="3"][data-den="2"]'`. That chip has `.active`. The 1:1 chip does not.
- **Close.** Choose the panel X. Run `... click --id synth-panel-close`. `#synth-panel` is `hidden` again. `.synth-active` is gone. `#st-src` returns to `No signal` on this close path.
- **Proof.** Screenshot with the floating **KEYBOARD SYNTH** panel visible and `DSO-1` in the topbar. `snapshot` shows `synthPanelHidden: false` and `synthBtnActive: true`.

## Gotchas

- Prove open with the button or the key, not by calling `KeyboardSynth.enable()`.
- Factory first-run intercepts `k`. Dismiss **Got it** first.
- Enable mutates scope mode to XY. A later YT proof must disable synth first.
- Note keys (Z, X, …) need the synth enabled and focus off inputs. Do not send them while `#gen-freq-l` is focused.
- `#btn-synth` uses class `synth-active`, not `active`.

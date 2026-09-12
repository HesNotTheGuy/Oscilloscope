---
name: verify-oscilloscope
description: Drive DSO-1 Oscilloscope, the desktop Electron audio visualizer in this repo, through its real window. Use when proving a UI change, capturing live evidence, or checking behavior against the project-local feature map.
---

# Verify DSO-1 Oscilloscope

This skill is for the next agent that has to prove DSO-1 the way a user uses it. Read it cold. Do not import another app's driver, selectors, or paths.

The user-facing product is the **desktop Electron window** loaded from `index.html` (title `DSO-1 Oscilloscope`). Secondary windows exist: `splash.html` on boot, `display.html` after **POP OUT**. The MJPEG server at `127.0.0.1:8420` exists only after the user clicks **STREAM** in PATCH. Vitest under `test/` is unit-only and does not drive the UI.

Keep the map honest with `/maintain-verification-skill` as the app changes.

## Launch

Documented start in `README.md` and `package.json` is `npm install` then `npm start` (`electron .`). There is no login, no seed database, and no env file. Node `>=22.12.0`. Electron `^43.1.0`.

For verification, do not use a bare `npm start`. That lands in the default Electron profile and shares `localStorage` with a human session. Start through the helper, which passes a disposable `--user-data-dir` and a CDP port.

```bash
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs launch
```

Ready signal, same predicate `screenshot.js` uses, observed over CDP on the `index.html` target:

`typeof window._dso !== 'undefined' && window._dso.scope != null`

The helper also checks `document.title === 'DSO-1 Oscilloscope'`. Launch prints JSON with `pid`, `cdpPort`, `userDataDir`, and `logPath`. Session file: `$DSO1_VERIFY_DIR/session.json` (default `/tmp/dso1-verify/session.json`).

Linux Chromium flags the helper adds, verification-only, removed when the process dies:

- `--no-sandbox` and `--disable-dev-shm-usage` so a container can boot Electron
- `--remote-debugging-port` and `--remote-allow-origins=*` so CDP works
- `--autoplay-policy=no-user-gesture-required` so `#btn-gen-start`, `#btn-idle-sig`, `#btn-patch`, and `#btn-synth` can call `ensureAudio()` from a CDP click

If `DISPLAY` and `WAYLAND_DISPLAY` are both unset on Linux, wrap **the same launch command** with `xvfb-run -a` and record that xvfb pid for cleanup. This VM often already has `DISPLAY=:1`. Do not kill a display you did not start.

Teardown is the helper's `cleanup` command. See Cleanup.

## Doctor

Read-only. Run it before the first drive, after any failed drive, and whenever the window looks wrong.

```bash
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs doctor
```

Worth driving only when all of these hold:

- The session pid is alive.
- On Linux, `/proc/<pid>/cmdline` contains this run's `--user-data-dir`.
- CDP `/json` has a page whose URL ends in `index.html` (ignore `splash.html`).
- `document.title` is `DSO-1 Oscilloscope` and `.brand` contains `DSO`.
- `window._dso.scope` is present.

A first-run card (`.first-run-hint`, title `Welcome to DSO-1`) does not fail doctor. Dismiss it before clicking other controls:

```bash
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs dismiss-first-run
```

That clicks the **Got it** button, not **Take the tour**. Never drive an Electron instance this run did not launch.

## Drive

There is no Playwright project in this repo. `screenshot.js` / `npm run screenshots` is a docs screenshot generator. It mostly assigns `window._dso.scope` fields. Do not copy that as a proof. `KeyboardController` itself proves the user path: keys `1`/`2`/`4`/`5`/`6` call `document.getElementById('btn-yt').click()` and the sibling mode buttons.

Drive with the helper, which talks CDP to the live `index.html` window. Prefer `#id` clicks. The default layout is tabbed (`layout-controller.js`, `activeTab = 'source'`). Mode buttons live on the **Scope** tab (`data-tab="scope"`), which starts hidden via `.tab-hidden`. `element.click()` still fires the listener. Open the tab first when the screenshot must show the button.

```bash
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs click --selector 'button.tab-bar-btn[data-tab="scope"]'
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs click --id btn-xy
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs snapshot --out .cursor/skills/verify-oscilloscope/evidence/scope-modes/after.json
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs screenshot --out .cursor/skills/verify-oscilloscope/evidence/scope-modes/after-xy.png
```

Stable handles from this checkout:

| Control | Handle | Result |
|---|---|---|
| YT / XY / VS / FS / SG | `#btn-yt` `#btn-xy` `#btn-vs` `#btn-fs` `#btn-sg` | clicked button gets `.active`; `window._dso.scope.mode` matches |
| Keys 1, 2, 4, 5, 6 | `press --key 2` (and siblings) | same as the matching button. `3` toggles scene, not a mode |
| RUN / STOP | `#btn-run-stop` | text `RUN` or `STOP`; class `running` or `stopped` |
| IDLE SIG | `#btn-idle-sig` | `.active` when the idle oscillator is on |
| Signal generator | `#btn-gen-start` `#btn-gen-stop`; `#gen-freq-l` `#gen-freq-r`; `#gen-phase`; `.ratio-btn[data-ratio="2"]` | start disables itself, enables stop, sets `#st-src` to `Signal Gen`. It does **not** auto-switch to XY |
| PATCH | `#btn-patch` | `body.patch-open`, button `.active`, rack in `#patch-dock`. First open may start the patch tour |
| PATCH BOOK / STREAM | `#pk-book` `#pk-stream` (exist only after PATCH is on) | STREAM text becomes `STREAMING`; HTTP on `127.0.0.1` (prefers 8420) |
| Keyboard synth | `#btn-synth` or key `k` | `#synth-panel` loses `hidden`; button gets `.synth-active` |
| Theme | `#theme-select` values such as `classic-lab`, `synthwave` | `document.body.dataset.theme` matches; `localStorage osc_theme` |
| Layout rig | `#rig-select` values `default`, `classic`, `studio`, `perform` | `localStorage osc_rigName`. Built-in **Minimal** from the README is not in `index.html` |
| Preset packs | `.preset-pack-btn[data-pack-id="lissajous-lab"]` | brief `.preset-pack-applied`; pack lives on the Source tab |

`eval --expr` is for reading state, not for `scope.mode = 'XY'`. If you set internals, you did not drive the user path.

Feature recipes: `features/README.md`.

## Evidence

Write proof under `.cursor/skills/verify-oscilloscope/evidence/<feature-id>/`. That directory is outside `/tmp/dso1-verify` on purpose. Cleanup deletes the session and user-data dir only.

Minimum for a UI claim:

1. A real user path (click, key, or select from the table above).
2. State before the action and state after (`before.json` / `after.json` from `snapshot`).
3. A screenshot of the window after the action (`Page.captureScreenshot`). The topbar brand `DSO-1` must be visible.
4. Side effects that the action is supposed to cause. Mode click: `#btn-xy.active` and `scope.mode === 'XY'`. Theme change: `body.dataset.theme`. Generator start: `#st-src` is `Signal Gen`. STREAM: `curl -I` the URL the UI reported.

Mocks are not available and not allowed. Do not treat `npm test` as UI proof. Do not treat files under `docs/screenshots/` as proof of this run.

## Cleanup

```bash
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs cleanup
```

Sends `SIGTERM` to the process group recorded at launch (`session.pgid`, same as the Electron pid on POSIX), then `SIGKILL` if that pid is still alive. Then deletes the whole run directory (`/tmp/dso1-verify` by default, including `user-data`, `session.json`, and `electron.log`).

Never `pkill electron` or kill by process name. That can destroy a developer's own DSO-1 window. Never delete `evidence/`. After cleanup, `ls` the named evidence path and confirm the files are still there.

If this run started `xvfb-run`, kill that xvfb pid the same way, by pid, not by name.

## Helpers

`scripts/verify-dso1.mjs` is executable. Invoke it with `node` from the repo root as shown in Launch, Doctor, Drive, and Cleanup.

One-shot proof of the mapped **scope-modes** feature (dismiss welcome, open Scope tab, click `#btn-xy`, write evidence):

```bash
node .cursor/skills/verify-oscilloscope/scripts/verify-dso1.mjs drive-scope-modes
```

Isolation: `main.js` does not call `requestSingleInstanceLock`. Two verification instances can run if each has its own `--user-data-dir` and `--remote-debugging-port` (`DSO1_VERIFY_DIR` per run). They must not both click **STREAM** without reading the URL the app returns. Port 8420 is preferred and falls back to ephemeral. Art-Net UDP 6454 is silent until **SEND DMX**. Shared `localStorage` keys if you forget `--user-data-dir` include `osc_theme`, `osc_firstRunSeen`, `osc_rigName`, `osc_presets`, `osc_inputMap`, `dso1.patches`, `dso1.board`, `dso1.tour.*`.

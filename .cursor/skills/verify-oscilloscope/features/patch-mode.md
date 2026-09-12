# PATCH mode

PATCH opens a modular rack in `#patch-dock` and routes app audio through it in mono. The topbar **PATCH** button stays lit while the rack is open. Cables, PATCH BOOK recipes, STREAM, and SEND DMX all live in that rack, which is created on first open.

## Sub-features

- `patch-open` toggles the rack from `#btn-patch`.
- `patch-book` loads a recipe from `#pk-book` (values such as `r:groovebox`, `r:wobble`).
- `patch-stream` starts or stops the loopback MJPEG server from `#pk-stream`.
- `patch-dmx` toggles Art-Net from `#pk-dmx-btn` (UDP 6454, off by default).
- `patch-tour` may auto-start the patch tour on first open (`dso1.tour.patch`).

## How to get to it (user POV)

- Click **PATCH** in the topbar (`#btn-patch`).
- Inside the rack, use **PATCH BOOK**, **SAVE**, **STREAM**, **BOARD**, **?**, and **CLOSE**.
- Press Esc or **CLOSE** (`#pk-close`) to collapse the rack.

## Driving it with verify-dso1

Preconditions:

- Doctor is green.
- First-run card is gone. `PatchController` skips the auto-tour while `.first-run-hint` exists, then offers it on the next open.
- You accept that first enable calls `ensureAudio()` and builds `PatchRack`.

- **Open.** Choose **PATCH**. Run `... click --id btn-patch`. `document.body` has class `patch-open`. `#btn-patch` has class `active`. `#pk-close` exists.
- **If the tour covers the rack.** Dismiss or skip it before clicking book/stream. Snapshot should show `patchOpen: true`.
- **Load groovebox.** Choose that recipe. Run `... select --id pk-book --value r:groovebox` only after you confirm `#pk-book` is in the DOM. Cables render on `#pk-cables`. Loading a recipe is undoable inside the app (Ctrl+Z).
- **STREAM.** Choose **STREAM**. Run `... click --id pk-stream`. Button text becomes `STREAMING` and gains `pk-active`. Read the toast URL. `curl -sI` that URL (host `127.0.0.1`, preferred port 8420, ephemeral fallback). Stop with a second click so the port does not outlive the proof.
- **Close.** Choose **CLOSE** or click **PATCH** again. Run `... click --id pk-close`. `body.patch-open` is gone. `#btn-patch` is not `.active`.
- **Proof.** Screenshot with the rack open and the DSO-1 topbar visible. `after.json` has `patchOpen: true`. If you started STREAM, keep the curl headers next to the screenshot. Cleanup must not delete that evidence.

## Gotchas

- `#pk-book` and `#pk-stream` do not exist until the first successful PATCH open. Snapshot them after the click, not before.
- First open on a fresh profile starts the patch tour after 500 ms unless the welcome card is still up. That tour dims the UI.
- STREAM binds loopback only. It is not up at `npm start`. Two instances that both click STREAM must use the URL the app returned, not a hard-coded 8420.
- SEND DMX opens a UDP socket to the address in `#pk-dmx-host` (default `2.255.255.255`). Leave it off unless the feature under test is lighting.
- `window._patchRack` is a debug handle set in `patch-controller.js`. Reading it is not a user path.

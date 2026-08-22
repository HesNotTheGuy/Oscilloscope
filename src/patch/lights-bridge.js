'use strict';

// ─────────────────────────────────────────────────────────────
//  LightsBridge — patch-rack CV → DMX.
//
//  Modules write channels from the audio/render loop; this class
//  owns the wire cadence. Two rules shape it:
//   - a DMX gateway accepts at most 44 Hz, so we frame at ~40 Hz
//     and send only on change,
//   - an Art-Net receiver treats silence as a dead source, so an
//     unchanged rig still gets a refresh every keepalive.
//
//  `send` is injected (the integrator passes
//  window.electronAPI.artnetSend) so this stays unit-testable
//  with no Electron and no socket.
// ─────────────────────────────────────────────────────────────

const CHANNELS = 512;
const FRAME_MS = 25;        // 40 Hz — under the 44 Hz DMX512 gateway ceiling
const KEEPALIVE_MS = 1000;  // spec suggests 800-1000 ms to match sACN behaviour
const DEFAULT_HOST = '2.255.255.255';
const MAX_PORT_ADDRESS = 0x7fff;

// Range-check the value we are about to STORE, not the one we were handed.
// Validating first and truncating second lets a value pass the guard and then
// become something the guard would have rejected: `frameMs: 0.5` clears
// `> 0` but `| 0`s down to 0, and setInterval(0) free-runs at the timer floor
// (~1 kHz), far above the 44 Hz ceiling this whole class is built around.
function intOption(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const v = Math.trunc(value);
  return (v >= min && v <= max) ? v : fallback;
}

export class LightsBridge {
  constructor(send, opts = {}) {
    this._send = typeof send === 'function' ? send : null;
    // Same validation as configure(): a constructor is not a back door. An
    // unchecked `universe: -1` used to be stored verbatim and then masked to
    // 32767 by the main process, silently addressing the wrong Port-Address.
    this.host = typeof opts.host === 'string' && opts.host.trim()
      ? opts.host.trim() : DEFAULT_HOST;
    this.port = intOption(opts.port, 1, 65535, 6454);
    this.universe = intOption(opts.universe, 0, MAX_PORT_ADDRESS, 0);
    this.frameMs = intOption(opts.frameMs, 1, 60000, FRAME_MS);
    this.keepaliveMs = intOption(opts.keepaliveMs, 0, 3600000, KEEPALIVE_MS);

    // One buffer for the lifetime of the bridge — setChannel runs in the
    // render loop, so nothing on that path may allocate.
    this._data = new Uint8Array(CHANNELS);
    this._dirty = true;      // first frame after start always goes out
    this._inFlight = false;
    this._timer = null;
    this._lastSent = 0;
    // Bumped by stop(). A send issued before a stop must not report back into
    // the run that follows it — see _tick().
    this._gen = 0;

    // Diagnostics for the UI: frames sent, frames skipped because the
    // previous send hadn't returned, and sends that rejected.
    this.frames = 0;
    this.drops = 0;
    this.failures = 0;
  }

  // Stores where frames go. Deliberately inert: the socket lives in main,
  // and the integrator pushes host/port there via artnet:configure.
  configure({ host, port, universe } = {}) {
    if (typeof host === 'string' && host.trim()) this.host = host.trim();
    this.port = intOption(port, 1, 65535, this.port);
    const u = intOption(universe, 0, MAX_PORT_ADDRESS, this.universe);
    if (u !== this.universe) {
      this.universe = u;
      this._dirty = true;  // a new target needs a full frame, not a keepalive
    }
    return this;
  }

  // index 0..511, value 0..1 → 0..255. Out-of-range input is ignored rather
  // than thrown: this is called per audio frame from patch modules.
  setChannel(index, value) {
    // typeof + isFinite before trunc: Math.trunc(null) is 0, which would
    // silently write channel 1 from a junk index.
    if (typeof index !== 'number' || !Number.isFinite(index)) return;
    const i = Math.trunc(index);
    if (i < 0 || i >= CHANNELS) return;
    let b;
    if (!(value > 0)) b = 0;                 // NaN, negatives, exact 0
    else if (value >= 1) b = 255;
    else b = Math.round(value * 255);        // 0.5 → 128
    if (this._data[i] !== b) {
      this._data[i] = b;
      this._dirty = true;
    }
  }

  // 0 for an unreadable index — the render loop reads these back per frame,
  // so a bad index must not throw or return undefined into arithmetic.
  getChannel(index) {
    if (typeof index !== 'number' || !Number.isFinite(index)) return 0;
    const i = Math.trunc(index);
    if (i < 0 || i >= CHANNELS) return 0;
    return this._data[i];
  }

  // Zero the rig without stopping the loop; the next frame carries it.
  blackout() {
    this._data.fill(0);
    this._dirty = true;
  }

  get running() {
    return this._timer !== null;
  }

  start() {
    if (this._timer !== null) return this;
    this._dirty = true;
    this._timer = setInterval(() => this._tick(), this.frameMs);
    return this;
  }

  // Idempotent — the UI calls it on teardown, on error, and on toggle.
  stop() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
    // Abandon any send still outstanding. Leaving _inFlight true here meant a
    // restart stayed gated on the PREVIOUS run's promise: every tick just
    // incremented drops, and if that promise never settled (a torn-down IPC
    // channel resolves nothing) the bridge was dead for the rest of the
    // session while still reporting running === true. Bumping the generation
    // is what makes clearing the flag safe — the abandoned send can no longer
    // clear the guard belonging to the run that replaces it.
    this._gen++;
    this._inFlight = false;
    return this;
  }

  _tick() {
    // Dropping a lighting frame is correct; queueing them is not — a backlog
    // would play the rig's past state back in slow motion.
    if (this._inFlight) { this.drops++; return; }
    if (!this._send) return;

    const now = Date.now();
    if (!this._dirty && (now - this._lastSent) < this.keepaliveMs) return;

    this._dirty = false;
    this._lastSent = now;
    this._inFlight = true;
    this.frames++;

    const gen = this._gen;
    let p;
    try {
      // The live buffer is handed over: the IPC boundary structured-clones it
      // synchronously, so reuse is safe. Callers must not retain the reference.
      p = this._send(this.universe, this._data);
    } catch (_) {
      this._inFlight = false;
      this.failures++;
      this._dirty = true;
      return;
    }
    Promise.resolve(p).then(
      () => { if (gen === this._gen) this._inFlight = false; },
      () => {
        // A dead node or a closed socket must not stop the loop — the rig may
        // come back. Re-arm dirty so the current state is retried immediately.
        if (gen !== this._gen) return;  // settled after a stop(); not our run
        this._inFlight = false;
        this.failures++;
        this._dirty = true;
      },
    );
  }
}

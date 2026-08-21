'use strict';

import { PatchRack } from '../patch/patch-rack.js';

// ─────────────────────────────────────────────────────────────
//  PatchController — owns the PATCH button and the rack overlay.
//  The rack is built lazily on first open (it needs a live
//  AudioContext, which only exists after a user gesture).
// ─────────────────────────────────────────────────────────────
export class PatchController {
  constructor(ctx) {
    this.engine = ctx.engine;
    this.ensureAudio = ctx.ensureAudio;
    this.rack = null;
  }

  init() {
    this.btn = document.getElementById('btn-patch');
    if (!this.btn) return;
    this.btn.addEventListener('click', () => this.toggle());

    // Recording started while patched must capture the processed signal:
    // _recDest is lazily created and wired to the dry master by default.
    const orig = this.engine.getRecordingStream.bind(this.engine);
    this.engine.getRecordingStream = () => {
      const hadDest = !!this.engine._recDest;
      const stream = orig();
      if (!hadDest && this.engine._recDest && this.rack && this.rack.enabled) {
        try { this.engine.gainNode.disconnect(this.engine._recDest); } catch (_) {}
        this.rack.audio.limiter.connect(this.engine._recDest);
      }
      return stream;
    };
  }

  async toggle() {
    await this.ensureAudio();
    if (!this.rack) {
      this.rack = new PatchRack(this.engine);
      this.rack.onClose = () => this.toggle();
      // Debug hook for automated verification (same shape as the prototype's).
      window._patchRack = this.rack;
    }
    if (this.rack.enabled) {
      this.rack.disable();
      this.btn.classList.remove('active');
    } else {
      this.rack.enable();
      this.btn.classList.add('active');
    }
  }
}

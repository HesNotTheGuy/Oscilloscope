'use strict';

import { PatchRack, patchKnobIds } from '../patch/patch-rack.js';
import { TourController } from './tour-controller.js';

// ─────────────────────────────────────────────────────────────
//  PatchController — owns the PATCH button and the rack overlay.
//  The rack is built lazily on first open (it needs a live
//  AudioContext, which only exists after a user gesture).
// ─────────────────────────────────────────────────────────────
export class PatchController {
  constructor(ctx) {
    this.ctx = ctx;
    this.engine = ctx.engine;
    this.ensureAudio = ctx.ensureAudio;
    this.inputMap = ctx.inputMap || null;
    this.rack = null;
  }

  init() {
    this.btn = document.getElementById('btn-patch');
    if (!this.btn) return;
    this.btn.addEventListener('click', () => this.toggle());

    // Register every rack knob as a MIDI target up front. Bindings are saved
    // to localStorage by the mapper, so a CC learned last session must still
    // resolve at startup — before the rack has ever been built.
    if (this.inputMap && this.inputMap.registerContinuous) {
      for (const k of patchKnobIds()) {
        this.inputMap.registerContinuous('patch.' + k.id, {
          min: 0, max: 1,
          apply: v => { if (this.rack) this.rack.setKnob(k.id, v); },
        });
      }
    }

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

    // The app's volume control targets the dry master, which is out of the
    // audible path while patched — forward it to the rack's Monitor so the
    // volume knob never mysteriously stops working.
    const origVol = this.engine.setVolume.bind(this.engine);
    this.engine.setVolume = v => {
      origVol(v);
      // sqrt so the squared knob curve lands back on the app's linear volume
      if (this.rack && this.rack.enabled) this.rack.setKnob('out.monitor', Math.sqrt(Math.min(1, Math.max(0, v))));
    };
  }

  async toggle() {
    await this.ensureAudio();
    if (!this.rack) {
      this.rack = new PatchRack(this.engine, this.inputMap);
      this.rack.onClose = () => this.toggle();
      this.rack.onTour = (id) => { if (this.ctx.tour) this.ctx.tour.start(id); };
      // The frame pump lives in the popout controller; the stream needs it
      // running even when no display window is open.
      this.rack.onFramesWanted = (on) => {
        const po = this.ctx.ui && this.ctx.ui._popout;
        if (po && po.setFramesWanted) po.setFramesWanted(on);
      };
      // Debug hook for automated verification (same shape as the prototype's).
      window._patchRack = this.rack;
    }
    if (this.rack.enabled) {
      this.rack.disable();
      this.btn.classList.remove('active');
    } else {
      this.rack.enable();
      // First time in the rack, offer the patch tour once the DOM has settled.
      if (!TourController.seen('patch') && this.ctx.tour) {
        setTimeout(() => {
          if (this.rack && this.rack.enabled && !this.ctx.tour.running) this.ctx.tour.start('patch');
        }, 500);
      }
      // entering patch mode keeps the current loudness
      const g = this.engine.gainNode ? this.engine.gainNode.gain.value : 0.8;
      this.rack.setKnob('out.monitor', Math.sqrt(Math.min(1, Math.max(0, g))));
      this.btn.classList.add('active');
    }
  }
}

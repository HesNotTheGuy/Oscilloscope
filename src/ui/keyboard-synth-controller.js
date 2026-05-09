'use strict';

import { KeyboardSynth } from '../keyboard-synth.js';

// ─────────────────────────────────────────────────────────────
//  KeyboardSynthController — wires the KeyboardSynth module
//  to the UI. Handles the toggle button, floating synth panel,
//  interval buttons, wave select, octave controls, note display.
// ─────────────────────────────────────────────────────────────
export class KeyboardSynthController {
  constructor(ctx) {
    this.sigGen      = ctx.sigGen;
    this.scope       = ctx.scope;
    this.engine      = ctx.engine;
    this.ensureAudio = ctx.ensureAudio;
    this.inputMap    = ctx.inputMap;
    this._synth      = null;
  }

  init() {
    const sg = this.sigGen;

    this._synth = new KeyboardSynth(sg, this.scope, this.engine);

    // ── State-change callback ─────────────────────────────
    this._synth.onStateChange = (state) => this._updateUI(state);

    // ── Helper: toggle synth on/off ───────────────────────
    const toggle = async () => {
      await this.ensureAudio();
      const btnSynth = document.getElementById('btn-synth');
      if (this._synth.isEnabled()) {
        this._synth.disable();
        btnSynth?.classList.remove('synth-active');
        this._showPanel(false);
        // Restore status bar
        const stSrc = document.getElementById('st-src');
        if (stSrc) stSrc.textContent = 'No signal';
      } else {
        this._synth.enable();
        btnSynth?.classList.add('synth-active');
        this._showPanel(true);
      }
    };

    // ── Toggle button in topbar ───────────────────────────
    const btnSynth = document.getElementById('btn-synth');
    if (btnSynth) {
      btnSynth.addEventListener('click', toggle);
    }

    // ── Close button inside panel ─────────────────────────
    const btnClose = document.getElementById('synth-panel-close');
    if (btnClose) {
      btnClose.addEventListener('click', () => {
        if (this._synth.isEnabled()) toggle();
      });
    }

    // ── Register 'K' hotkey to toggle synth ──────────────
    if (this.inputMap) {
      this.inputMap.registerAction('synth.toggle', toggle);
      this.inputMap.bindKey('k', 'synth.toggle');
    }

    // ── Interval buttons ──────────────────────────────────
    const ivGrid = document.getElementById('synth-interval-grid');
    if (ivGrid) {
      ivGrid.querySelectorAll('.synth-iv-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          ivGrid.querySelectorAll('.synth-iv-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._synth.setIntervalRatio(+btn.dataset.num, +btn.dataset.den);
        });
      });
    }

    // ── Wave select ───────────────────────────────────────
    const waveSelect = document.getElementById('synth-wave');
    if (waveSelect) {
      waveSelect.addEventListener('change', () => this._synth.setWaveform(waveSelect.value));
    }

    // ── Octave buttons ────────────────────────────────────
    const octDown = document.getElementById('synth-oct-down');
    const octUp   = document.getElementById('synth-oct-up');
    if (octDown) octDown.addEventListener('click', () => this._synth.setBaseOctave(this._synth.getBaseOctave() - 1));
    if (octUp)   octUp.addEventListener('click',   () => this._synth.setBaseOctave(this._synth.getBaseOctave() + 1));
  }

  // ── UI helpers ────────────────────────────────────────────

  _showPanel(show) {
    const panel = document.getElementById('synth-panel');
    if (!panel) return;
    panel.hidden = !show;
  }

  _updateUI(state) {
    // Note display
    const noteDisp = document.getElementById('synth-note-display');
    if (noteDisp) {
      if (state.currentNote) {
        noteDisp.textContent = state.currentNote.name + state.currentNote.octave;
        noteDisp.style.opacity = '1';
      } else {
        noteDisp.textContent = '---';
        noteDisp.style.opacity = '0.4';
      }
    }

    // Octave display
    const octVal = document.getElementById('synth-octave-val');
    if (octVal) octVal.textContent = state.baseOctave;

    // Status bar
    const stSrc = document.getElementById('st-src');
    if (stSrc) {
      if (state.enabled && state.currentNote) {
        stSrc.textContent = 'Synth: ' + state.currentNote.name + state.currentNote.octave;
      } else if (state.enabled) {
        stSrc.textContent = 'Synth';
      }
    }
  }

  getSynth() { return this._synth; }
}

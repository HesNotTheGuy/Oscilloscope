'use strict';

// ─────────────────────────────────────────────────────────────
//  MidiController — UI wiring for Web MIDI hardware control.
//  Registers continuous targets, populates the CTRL-panel MIDI
//  section, and drives the LEARN flow.
// ─────────────────────────────────────────────────────────────
export class MidiController {
  constructor(ctx) {
    this.scope    = ctx.scope;
    this.engine   = ctx.engine;
    this.inputMap = ctx.inputMap;
  }

  init() {
    const mapper = this.inputMap;
    if (!mapper) return;

    this._registerContinuousTargets(mapper);
    this._buildUI(mapper);

    // Try to init MIDI at startup — in Electron this usually succeeds
    // without a user-gesture prompt. Update status regardless of outcome.
    mapper.enableMidi().then(() => {
      this._updateStatus();
    });

    // Hot-plug: refresh status when devices connect/disconnect
    mapper.onMidiDeviceChange(() => this._updateStatus());
  }

  // ── Continuous target registration ───────────────────────

  _registerContinuousTargets(mapper) {
    const s = this.scope;
    const e = this.engine;

    mapper.registerContinuous('beam.glow', {
      min: 0, max: 40,
      apply: v => {
        s.glowAmount = v;
        this._syncSlider('glow', 'glow-val', v, x => String(Math.round(x)));
      },
    });

    mapper.registerContinuous('beam.width', {
      min: 0.5, max: 4,
      apply: v => {
        s.beamWidth = v;
        this._syncSlider('beam-width', 'beam-width-val', v, x => x.toFixed(1));
      },
    });

    mapper.registerContinuous('beam.persistence', {
      min: 0, max: 0.98,
      apply: v => {
        s.persistence = v;
        this._syncSlider('persistence', 'persistence-val', v, x => x.toFixed(2));
      },
    });

    mapper.registerContinuous('audio.volume', {
      min: 0, max: 2,
      apply: v => {
        e.setVolume(v);
        this._syncSlider('volume', null, v, null);
      },
    });

    mapper.registerContinuous('fx.rotSpeed', {
      min: 0, max: 0.02,
      apply: v => {
        s.fx.rotSpeed = v;
        this._syncSlider('fx-rot-speed', 'fx-rs-val', v, x => x.toFixed(3));
      },
    });
  }

  /**
   * Set slider value and dispatch 'input', then update the paired
   * value label if provided.  Mirrors preset-manager's setVal pattern.
   */
  _syncSlider(sliderId, labelId, value, fmt) {
    const el = document.getElementById(sliderId);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (labelId) {
      const lbl = document.getElementById(labelId);
      if (lbl) lbl.textContent = fmt ? fmt(value) : String(value);
    }
  }

  // ── UI ────────────────────────────────────────────────────

  _buildUI(mapper) {
    const statusEl  = document.getElementById('midi-status');
    const targetSel = document.getElementById('midi-target');
    const learnBtn  = document.getElementById('midi-learn-btn');
    const bindsList = document.getElementById('midi-bindings');

    if (!statusEl || !targetSel || !learnBtn || !bindsList) return;

    // Populate target select
    const targets = [
      { value: 'beam.glow',        label: 'Glow' },
      { value: 'beam.width',       label: 'Beam Width' },
      { value: 'beam.persistence', label: 'Persistence' },
      { value: 'audio.volume',     label: 'Volume' },
      { value: 'fx.rotSpeed',      label: 'Rot Speed' },
      // Trigger actions
      { value: 'playback.toggle',  label: '▶ Play/Pause' },
      { value: 'scope.runStop',    label: '⏹ Run/Stop' },
      { value: 'scope.modeYT',     label: 'Mode YT' },
      { value: 'scope.modeXY',     label: 'Mode XY' },
    ];

    targets.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.value;
      opt.textContent = t.label;
      targetSel.appendChild(opt);
    });

    // Labels map for display in the bindings list
    this._targetLabels = Object.fromEntries(targets.map(t => [t.value, t.label]));

    // Continuous target names (for detecting binding kind in the list)
    this._continuousNames = new Set([
      'beam.glow', 'beam.width', 'beam.persistence', 'audio.volume', 'fx.rotSpeed',
    ]);

    this._isLearning = false;

    learnBtn.addEventListener('click', () => {
      if (this._isLearning) {
        mapper.cancelMidiLearn();
        this._setLearnIdle(learnBtn);
      } else {
        this._startLearn(mapper, targetSel, learnBtn, bindsList);
      }
    });

    // Cancel learn on Escape
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && this._isLearning) {
        mapper.cancelMidiLearn();
        this._setLearnIdle(learnBtn);
      }
    });

    this._statusEl  = statusEl;
    this._bindsList = bindsList;
    this._learnBtn  = learnBtn;
    this._mapper    = mapper;

    this._renderBindings();
  }

  _startLearn(mapper, targetSel, learnBtn) {
    this._isLearning = true;
    learnBtn.textContent = 'MOVE A CONTROL…';
    learnBtn.disabled = true;

    // Ensure MIDI is active before learning
    mapper.enableMidi().then(() => {
      mapper.startMidiLearn(({ channel, cc }) => {
        const target = targetSel.value;
        const isContinuous = this._continuousNames.has(target);
        const binding = isContinuous
          ? { type: 'continuous', target }
          : target;
        mapper.bindMidi(channel, cc, binding);
        this._setLearnIdle(learnBtn);
        this._renderBindings();
        this._updateStatus();
      });
    });
  }

  _setLearnIdle(learnBtn) {
    this._isLearning = false;
    learnBtn.textContent = 'LEARN';
    learnBtn.disabled = false;
  }

  _renderBindings() {
    const bindsList = this._bindsList;
    if (!bindsList) return;
    while (bindsList.firstChild) bindsList.removeChild(bindsList.firstChild);

    const bindings = this._mapper.getMidiBindings();
    for (const [key, binding] of Object.entries(bindings)) {
      const parts = key.split(':');
      const ch = parseInt(parts[0], 10);
      const cc = parseInt(parts[1], 10);

      let label;
      if (typeof binding === 'object' && binding.type === 'continuous') {
        label = this._targetLabels[binding.target] || binding.target;
      } else {
        label = this._targetLabels[binding] || String(binding);
      }

      const row = document.createElement('div');
      row.className = 'midi-binding-row';

      const info = document.createElement('span');
      info.className = 'midi-binding-info';
      info.textContent = 'CH' + (ch + 1) + ' CC' + cc + ' → ' + label;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'midi-unbind-btn';
      removeBtn.setAttribute('aria-label', 'Remove binding');
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', () => {
        this._mapper.unbindMidi(ch, cc);
        this._renderBindings();
      });

      row.appendChild(info);
      row.appendChild(removeBtn);
      bindsList.appendChild(row);
    }
  }

  _updateStatus() {
    const el = this._statusEl;
    if (!el) return;
    const mapper = this._mapper || this.inputMap;
    if (!mapper.midiAvailable) {
      el.textContent = 'No MIDI support';
      return;
    }
    const names = mapper.midiDeviceNames;
    el.textContent = names.length
      ? names.join(', ')
      : 'No MIDI device';
  }
}

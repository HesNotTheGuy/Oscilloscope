'use strict';

import { LISSAJOUS_RATIOS } from '../constants.js';
import { resetPhosphor } from './ui-utils.js';

// ─────────────────────────────────────────────────────────────
//  SignalGenController — oscillator, ratios, shape presets
// ─────────────────────────────────────────────────────────────
export class SignalGenController {
  constructor(ctx) {
    this.scope       = ctx.scope;
    this.engine      = ctx.engine;
    this.sigGen      = ctx.sigGen;
    this.store       = ctx.store;
    this.ensureAudio = ctx.ensureAudio;
  }

  init() {
    const s  = this.scope;
    const e  = this.engine;
    const sg = this.sigGen;

    const genFreqL    = document.getElementById('gen-freq-l');
    const genFreqR    = document.getElementById('gen-freq-r');
    const genPhase    = document.getElementById('gen-phase');
    const genWave     = document.getElementById('gen-wave');
    const genAmp      = document.getElementById('gen-amp');
    const btnGenStart = document.getElementById('btn-gen-start');
    const btnGenStop  = document.getElementById('btn-gen-stop');
    const genRatioRow = document.getElementById('gen-ratio-row');

    genFreqL.addEventListener('input', () => { sg.setFreqL(+genFreqL.value); this._syncRFreq(sg, genFreqR); });
    genFreqR.addEventListener('input', () => sg.setFreqR(+genFreqR.value));
    genPhase.addEventListener('input', () => {
      sg.phase = +genPhase.value;
      document.getElementById('gen-phase-val').textContent = genPhase.value + '°';
    });
    genWave.addEventListener('change', () => sg.setWaveform(genWave.value));
    genAmp.addEventListener('input', () => {
      sg.setAmplitude(+genAmp.value);
      document.getElementById('gen-amp-val').textContent = (+genAmp.value).toFixed(2);
    });

    // ── Ratio presets ──
    this._activeRatio = 1;
    genRatioRow.querySelectorAll('.ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        genRatioRow.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._activeRatio = +btn.dataset.ratio;
        genFreqR.value = Math.round(sg.freqL * this._activeRatio);
        sg.setFreqR(sg.freqL * this._activeRatio);
      });
    });

    // ── Shape presets ──
    const SHAPE_PRESETS = {
      circle:   { freqL: 200, ratio: 1,          phase: 90,  wave: 'sine'     },
      figure8:  { freqL: 200, ratio: 2,          phase: 0,   wave: 'sine'     },
      heart:    { freqL: 200, ratio: 2,          phase: 55,  wave: 'triangle' },
      star:     { freqL: 100, ratio: 2.5,        phase: 90,  wave: 'sine'     },
      spiral:   { freqL: 200, ratio: 1.007,      phase: 90,  wave: 'sine'     },
      diamond:  { freqL: 200, ratio: 1,          phase: 90,  wave: 'triangle' },
      web:      { freqL: 100, ratio: 1.75,       phase: 0,   wave: 'sine'     },
      chaos:    { freqL: 317, ratio: Math.PI/2,  phase: 37,  wave: 'sawtooth' },
      flower:   { freqL: 100, ratio: 1.5,        phase: 90,  wave: 'sine'     },
      bowtie:   { freqL: 200, ratio: 0.5,        phase: 0,   wave: 'sine'     },
    };

    const genPresetBtns = document.querySelectorAll('.gen-preset-btn');
    const _applyGenPreset = async (name) => {
      const p = SHAPE_PRESETS[name];
      if (!p) return;

      genFreqL.value = p.freqL;
      genFreqR.value = Math.round(p.freqL * p.ratio);
      genPhase.value = p.phase;
      document.getElementById('gen-phase-val').textContent = p.phase + '°';
      genWave.value = p.wave;
      this._activeRatio = p.ratio;

      sg.freqL = p.freqL;
      sg.freqR = p.freqL * p.ratio;
      sg.phase = p.phase;
      sg.waveform = p.wave;

      genRatioRow.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
      genPresetBtns.forEach(b => b.classList.remove('active'));
      const activeBtn = document.querySelector(`.gen-preset-btn[data-preset="${name}"]`);
      if (activeBtn) activeBtn.classList.add('active');

      if (!sg.active) {
        await this.ensureAudio();
        sg.init(e.actx);
        sg.start(e.analyserL, e.analyserR);
        btnGenStart.disabled = true;  btnGenStop.disabled = false;
        btnGenStart.classList.remove('accent'); btnGenStop.classList.add('active');
        if (s.mode !== 'XY') {
          s.mode = 'XY';
          document.getElementById('btn-xy').classList.add('active');
          document.getElementById('btn-yt').classList.remove('active');
          resetPhosphor(s);
        }
        document.getElementById('st-src').textContent = 'Signal Gen';
      } else {
        sg.setFreqL(sg.freqL); sg.setFreqR(sg.freqR); sg.setWaveform(sg.waveform);
        sg.stop(); sg.init(e.actx); sg.start(e.analyserL, e.analyserR);
      }
    };

    genPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => _applyGenPreset(btn.dataset.preset));
    });

    // ── Start / Stop ──
    btnGenStart.addEventListener('click', async () => {
      await this.ensureAudio();
      sg.freqL = +genFreqL.value; sg.freqR = +genFreqR.value;
      sg.phase = +genPhase.value; sg.waveform = genWave.value;
      sg.init(e.actx); sg.start(e.analyserL, e.analyserR);
      btnGenStart.disabled = true;  btnGenStop.disabled = false;
      btnGenStart.classList.remove('accent'); btnGenStop.classList.add('active');
      if (s.mode !== 'XY') {
        s.mode = 'XY';
        document.getElementById('btn-xy').classList.add('active');
        document.getElementById('btn-yt').classList.remove('active');
        resetPhosphor(s);
      }
      document.getElementById('st-src').textContent = 'Signal Gen';
    });

    btnGenStop.addEventListener('click', () => {
      sg.stop();
      btnGenStart.disabled = false; btnGenStop.disabled = true;
      btnGenStart.classList.add('accent'); btnGenStop.classList.remove('active');
      document.getElementById('st-src').textContent = 'No signal';
    });

    // ── Help toggle ──
    const sgHelpBtn = document.getElementById('siggen-help-btn');
    const sgGuide   = document.getElementById('siggen-guide');
    if (sgHelpBtn && sgGuide) {
      sgHelpBtn.addEventListener('click', ev => {
        ev.stopPropagation();
        const vis = sgGuide.style.display === 'none';
        sgGuide.style.display = vis ? '' : 'none';
        sgHelpBtn.classList.toggle('active', vis);
      });
    }
  }

  _syncRFreq(sg, genFreqR) {
    genFreqR.value = Math.round(sg.freqL * this._activeRatio);
    sg.setFreqR(sg.freqL * this._activeRatio);
  }
}

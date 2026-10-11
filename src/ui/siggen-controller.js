'use strict';

import { resetPhosphor, setScopeMode } from './ui-utils.js';
import { listShapes, getShape } from '../shapes/index.js';

const FAMILY_LABEL = {
  lissajous: 'Lissajous',
  polar: 'Polar',
  gielis: 'Gielis',
  epicycle: 'Epicycle',
  knot: 'Knot',
  parametric: 'Parametric',
  conformal: 'Conformal',
  ode: 'ODE',
  map: 'Map',
  implicit: 'Implicit',
  polylines: 'Polylines',
};

export class SignalGenController {
  constructor(ctx) {
    this.notify = ctx.notify || null;
    this.scope       = ctx.scope;
    this.engine      = ctx.engine;
    this.sigGen      = ctx.sigGen;
    this.shapes      = ctx.shapes || null;
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
    const shapeSelect = document.getElementById('shape-select');
    const shapeDual   = document.getElementById('shape-dual');

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

    this._fillShapeSelect(shapeSelect);

    const markRunning = () => {
      btnGenStart.disabled = true;
      btnGenStop.disabled = false;
      btnGenStart.classList.remove('accent');
      btnGenStop.classList.add('active');
      document.getElementById('st-src').textContent = 'Signal Gen';
    };

    const playShape = async (id) => {
      const preset = getShape(id);
      if (!preset || !this.shapes) return;
      await this.ensureAudio();
      if (e.idleActive) {
        e._stopIdleSignal();
        const idleBtn = document.getElementById('btn-idle-sig');
        if (idleBtn) idleBtn.classList.remove('active');
      }
      sg.stop();
      this.shapes.init(e.actx);
      this.shapes.start(preset, e.visBusL, e.visBusR);
      s.shapeTrace = this.shapes.trace;
      s.figureTitle = preset.title;
      s.figureFormula = preset.formula;
      s.dualView = !!(shapeDual && shapeDual.checked);
      if (s.mode !== 'XY') setScopeMode(s, 'XY');
      resetPhosphor(s);
      markRunning();
    };

    const clearShape = () => {
      if (this.shapes) this.shapes.stop();
      s.shapeTrace = null;
      s.figureTitle = '';
      s.figureFormula = '';
      s.dualView = false;
    };

    if (shapeSelect) {
      shapeSelect.addEventListener('change', () => {
        const id = shapeSelect.value;
        if (!id) {
          clearShape();
          return;
        }
        playShape(id);
      });
    }
    if (shapeDual) {
      shapeDual.addEventListener('change', () => {
        s.dualView = !!(shapeDual.checked && s.shapeTrace);
      });
    }

    btnGenStart.addEventListener('click', async () => {
      await this.ensureAudio();
      clearShape();
      if (shapeSelect) shapeSelect.value = '';
      sg.freqL = +genFreqL.value; sg.freqR = +genFreqR.value;
      sg.phase = +genPhase.value; sg.waveform = genWave.value;
      sg.init(e.actx); sg.start(e.visBusL, e.visBusR);
      markRunning();
      if (s.mode !== 'XY' && this.notify) {
        this.notify.say('Signal generator running. Switch to XY to see Lissajous figures', 'info', 6000);
      }
    });

    btnGenStop.addEventListener('click', () => {
      sg.stop();
      clearShape();
      if (shapeSelect) shapeSelect.value = '';
      btnGenStart.disabled = false; btnGenStop.disabled = true;
      btnGenStart.classList.add('accent'); btnGenStop.classList.remove('active');
      document.getElementById('st-src').textContent = 'No signal';
    });

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

  _fillShapeSelect(select) {
    if (!select) return;
    const groups = new Map();
    for (const p of listShapes()) {
      const key = FAMILY_LABEL[p.family] || p.family;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    select.innerHTML = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    select.appendChild(none);
    for (const [label, items] of groups) {
      const og = document.createElement('optgroup');
      og.label = label;
      for (const p of items) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.n}. ${p.title}`;
        og.appendChild(opt);
      }
      select.appendChild(og);
    }
  }

  _syncRFreq(sg, genFreqR) {
    genFreqR.value = Math.round(sg.freqL * this._activeRatio);
    sg.setFreqR(sg.freqL * this._activeRatio);
  }
}

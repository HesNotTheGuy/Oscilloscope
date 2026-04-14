'use strict';

import { Knob } from '../knob.js';
import { TIMEBASE, VDIV, TB_DEFAULT, VD_DEFAULT } from '../constants.js';
import { bindRange, updateStatus, resetPhosphor } from './ui-utils.js';

// ─────────────────────────────────────────────────────────────
//  ScopeController — channels, timebase, trigger, run/stop
// ─────────────────────────────────────────────────────────────
export class ScopeController {
  constructor(ctx) {
    this.scope  = ctx.scope;
    this.engine = ctx.engine;
    this.store  = ctx.store;
    this.knobs  = ctx.knobs;
    this.ensureAudio = ctx.ensureAudio;
  }

  init() {
    const s = this.scope;
    const e = this.engine;

    // ── CH1/CH2 V/div & position knobs ──
    this.knobs.ch1vdiv = new Knob(document.getElementById('knob-ch1-vdiv'), VDIV, VD_DEFAULT, (step, idx) => {
      s.ch1.vdiv = step; s.ch1.vdivIdx = idx;
      document.getElementById('val-ch1-vdiv').textContent = step.label;
      updateStatus(s);
    });
    this.knobs.ch2vdiv = new Knob(document.getElementById('knob-ch2-vdiv'), VDIV, VD_DEFAULT, (step, idx) => {
      s.ch2.vdiv = step; s.ch2.vdivIdx = idx;
      document.getElementById('val-ch2-vdiv').textContent = step.label;
    });
    this.knobs.ch1pos = new Knob(document.getElementById('knob-ch1-pos'), null, 0, delta => {
      if (delta === 'reset') s.ch1.pos = 0;
      else s.ch1.pos = Math.max(-2, Math.min(2, s.ch1.pos + delta));
      document.getElementById('val-ch1-pos').textContent = s.ch1.pos.toFixed(2);
    });
    this.knobs.ch2pos = new Knob(document.getElementById('knob-ch2-pos'), null, 0, delta => {
      if (delta === 'reset') s.ch2.pos = 0;
      else s.ch2.pos = Math.max(-2, Math.min(2, s.ch2.pos + delta));
      document.getElementById('val-ch2-pos').textContent = s.ch2.pos.toFixed(2);
    });

    // ── Timebase & H-position knobs ──
    this.knobs.timebase = new Knob(document.getElementById('knob-timebase'), TIMEBASE, TB_DEFAULT, (step, idx) => {
      s.tb = step; s.tbIdx = idx;
      document.getElementById('val-timebase').textContent = step.label;
      updateStatus(s);
    });
    this.knobs.hpos = new Knob(document.getElementById('knob-hpos'), null, 0, delta => {
      if (delta === 'reset') s.hPos = 0;
      else s.hPos = Math.max(-2000, Math.min(2000, s.hPos + Math.round(delta * 50)));
      document.getElementById('val-hpos').textContent = s.hPos;
    });

    // ── Trigger level knob ──
    this.knobs.trigLevel = new Knob(document.getElementById('knob-trig-level'), null, 0, delta => {
      if (delta === 'reset') s.trigLevel = 0;
      else s.trigLevel = Math.max(-1, Math.min(1, s.trigLevel + delta * 0.5));
      document.getElementById('val-trig-level').textContent = s.trigLevel.toFixed(2) + 'V';
      updateStatus(s);
    });

    // ── Coupling buttons ──
    document.querySelectorAll('.coup-row').forEach(row => {
      const ch = +row.dataset.ch;
      row.querySelectorAll('.coup-btn').forEach(btn => btn.addEventListener('click', () => {
        row.querySelectorAll('.coup-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        (ch === 1 ? s.ch1 : s.ch2).coupling = btn.dataset.coup;
      }));
    });

    // ── YT / XY mode ──
    document.getElementById('btn-yt').addEventListener('click', () => {
      s.mode = 'YT';
      document.getElementById('btn-yt').classList.add('active');
      document.getElementById('btn-xy').classList.remove('active');
      resetPhosphor(s);
    });
    document.getElementById('btn-xy').addEventListener('click', () => {
      s.mode = 'XY';
      document.getElementById('btn-xy').classList.add('active');
      document.getElementById('btn-yt').classList.remove('active');
      resetPhosphor(s);
    });

    // ── Trigger source / slope / mode ──
    document.getElementById('trig-source').addEventListener('change', e => {
      s.trigSource = +e.target.value;
      updateStatus(s);
    });
    document.getElementById('trig-slope').addEventListener('change', e => {
      s.trigEdge = e.target.value;
      updateStatus(s);
    });
    document.querySelectorAll('.trig-btn').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.trig-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      s.trigMode = btn.dataset.mode;
      updateStatus(s);
    }));

    // ── RUN/STOP ──
    const runBtn = document.getElementById('btn-run-stop');
    runBtn.addEventListener('click', () => {
      s.isRunning = !s.isRunning;
      runBtn.textContent = s.isRunning ? 'RUN' : 'STOP';
      runBtn.className   = 'run-stop-btn ' + (s.isRunning ? 'running' : 'stopped');
    });

    document.getElementById('btn-single').addEventListener('click', () => {
      s.isRunning = true; s._singleArmed = true;
      runBtn.textContent = 'RUN'; runBtn.className = 'run-stop-btn running';
    });

    // ── Auto-set ──
    document.getElementById('btn-auto-set').addEventListener('click', () => {
      s.autoSet();
      this.knobs.timebase.index = s.tbIdx; this.knobs.timebase._updateAngle();
      this.knobs.ch1vdiv.index  = s.ch1.vdivIdx; this.knobs.ch1vdiv._updateAngle();
      document.getElementById('val-timebase').textContent = s.tb.label;
      document.getElementById('val-ch1-vdiv').textContent = s.ch1.vdiv.label;
      document.getElementById('val-ch1-pos').textContent  = '0.00';
      document.getElementById('val-hpos').textContent     = '0';
      document.getElementById('val-trig-level').textContent = '0.00V';
      updateStatus(s);
    });

    // ── Measure toggle ──
    document.getElementById('btn-measure').addEventListener('click', () => {
      s.showMeasure = !s.showMeasure;
      document.getElementById('btn-measure').classList.toggle('active', s.showMeasure);
      document.getElementById('meas-led').classList.toggle('on', s.showMeasure);
    });
    document.getElementById('btn-measure').classList.add('active');
    document.getElementById('meas-led').classList.add('on');

    // ── Reset position ──
    document.getElementById('btn-reset-pos').addEventListener('click', () => {
      s.ch1.pos = 0; s.ch2.pos = 0; s.hPos = 0;
      ['val-ch1-pos', 'val-ch2-pos'].forEach(id => document.getElementById(id).textContent = '0.00');
      document.getElementById('val-hpos').textContent = '0';
    });

    // ── Idle signal ──
    document.getElementById('btn-idle-sig').addEventListener('click', async () => {
      await this.ensureAudio();
      const btn = document.getElementById('btn-idle-sig');
      if (e.idleActive) {
        e._stopIdleSignal();
        btn.classList.remove('active');
      } else {
        e.startIdleSignal();
        btn.classList.add('active');
      }
    });

    // ── Screenshot ──
    document.getElementById('btn-screenshot').addEventListener('click', () => {
      const canvas = s.canvas;
      let dataURL;
      if (s._glr) {
        const tmp = document.createElement('canvas');
        tmp.width = canvas.width; tmp.height = canvas.height;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(canvas, 0, 0);
        if (s._glr._ovCanvas) tctx.drawImage(s._glr._ovCanvas, 0, 0);
        dataURL = tmp.toDataURL('image/png');
      } else {
        dataURL = canvas.toDataURL('image/png');
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = dataURL;
      a.download = `osc_screenshot_${ts}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });

    // Initial status
    updateStatus(s);
  }
}

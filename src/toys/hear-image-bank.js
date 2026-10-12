'use strict';

import { HUE_BINS } from './hear-image-voices.js';

const RAMP_SEC = 0.04;
const MASTER_GAIN = 0.15;
const VIS_GAIN = 0.18;
const WAVE_BINS = 1024;

function release(fn) {
  try { fn(); } catch { return; }
}

export function createVoiceBank(nodes) {
  if (!nodes || !nodes.actx || !nodes.dest) throw new Error('missing audio nodes');
  const { actx, dest } = nodes;
  const oscs = [];
  const gains = [];
  let master = null;
  let analyser = null;
  let vis = null;

  try {
    master = actx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(dest);

    analyser = actx.createAnalyser();
    analyser.fftSize = WAVE_BINS;
    analyser.smoothingTimeConstant = 0.75;
    master.connect(analyser);

    if (nodes.visL || nodes.visR) {
      vis = actx.createGain();
      vis.gain.value = VIS_GAIN;
      master.connect(vis);
      if (nodes.visL) vis.connect(nodes.visL);
      if (nodes.visR) vis.connect(nodes.visR);
    }

    const started = actx.currentTime;
    for (const bin of HUE_BINS) {
      const osc = actx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = bin.hz;
      const gain = actx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(master);
      osc.start(started);
      oscs.push(osc);
      gains.push(gain);
    }
  } catch (err) {
    for (const osc of oscs) {
      release(() => osc.stop());
      release(() => osc.disconnect());
    }
    for (const gain of gains) release(() => gain.disconnect());
    if (vis) release(() => vis.disconnect());
    if (master) release(() => master.disconnect());
    throw err;
  }

  const last = new Float64Array(HUE_BINS.length);
  let primed = false;
  let dead = false;

  return {
    apply(voices, now) {
      if (dead) return;
      const target = new Float64Array(HUE_BINS.length);
      const seen = new Uint8Array(HUE_BINS.length);
      for (const voice of voices) {
        const key = voice.key;
        if (!Number.isInteger(key) || key < 0 || key >= HUE_BINS.length) {
          throw new Error('bad voice key');
        }
        if (seen[key]) throw new Error('duplicate voice ' + key);
        seen[key] = 1;
        target[key] = voice.gain;
      }
      if (primed) {
        let same = true;
        for (let i = 0; i < target.length; i++) {
          if (target[i] !== last[i]) {
            same = false;
            break;
          }
        }
        if (same) return;
      }
      last.set(target);
      primed = true;
      const t = Number.isFinite(now) ? now : actx.currentTime;
      for (let i = 0; i < gains.length; i++) {
        const param = gains[i].gain;
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.linearRampToValueAtTime(target[i], t + RAMP_SEC);
      }
    },
    timeDomain(into) {
      if (!into || into.length !== WAVE_BINS) throw new Error('bad waveform buffer');
      if (dead) return;
      analyser.getByteTimeDomainData(into);
    },
    dispose() {
      if (dead) return;
      dead = true;
      for (let i = 0; i < oscs.length; i++) {
        oscs[i].stop();
        oscs[i].disconnect();
        gains[i].disconnect();
      }
      if (vis) vis.disconnect();
      if (analyser) analyser.disconnect();
      master.disconnect();
    },
  };
}

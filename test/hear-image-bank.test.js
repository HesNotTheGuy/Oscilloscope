import { describe, expect, it } from 'vitest';
import { HUE_BINS } from '../src/toys/hear-image-voices.js';
import { createVoiceBank } from '../src/toys/hear-image-bank.js';

function param() {
  return {
    value: 0,
    events: [],
    cancelScheduledValues(t) { this.events.push(['cancel', t]); },
    setValueAtTime(v, t) { this.events.push(['set', v, t]); },
    linearRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); },
  };
}

function node(kind) {
  return {
    kind,
    inputs: [],
    outputs: [],
    disconnected: false,
    connect(dest) {
      this.outputs.push(dest);
      dest.inputs.push(this);
    },
    disconnect() {
      this.disconnected = true;
      this.outputs.length = 0;
    },
  };
}

function fakeGraph() {
  const oscs = [];
  const gains = [];
  const actx = {
    currentTime: 12,
    createOscillator() {
      const osc = node('osc');
      osc.type = '';
      osc.frequency = { value: -1 };
      osc.started = null;
      osc.stopped = 0;
      osc.start = (t) => { osc.started = t; };
      osc.stop = () => { osc.stopped += 1; };
      oscs.push(osc);
      return osc;
    },
    createGain() {
      const gain = node('gain');
      gain.gain = param();
      gain.gain.value = 1;
      gains.push(gain);
      return gain;
    },
    createAnalyser() {
      const analyser = node('analyser');
      analyser.fftSize = 0;
      analyser.smoothingTimeConstant = 0;
      analyser.filled = 0;
      analyser.getByteTimeDomainData = (into) => {
        analyser.filled += 1;
        into.fill(128);
      };
      return analyser;
    },
  };
  return { actx, dest: node('dest'), visL: node('visL'), visR: node('visR'), oscs, gains };
}

describe('hear image voice bank', () => {
  it('starts thirteen sines and ramps a column once', () => {
    const graph = fakeGraph();
    const bank = createVoiceBank(graph);
    expect(graph.oscs.length, 'one sine per bin').toBe(13);
    for (let key = 0; key < 13; key++) {
      expect(graph.oscs[key].type, 'sine').toBe('sine');
      expect(graph.oscs[key].frequency.value, 'bin hz').toBe(HUE_BINS[key].hz);
      expect(graph.oscs[key].started, 'started at construction').toBe(12);
      expect(graph.oscs[key].outputs[0].gain.value, 'silent until apply').toBe(0);
    }
    expect(graph.dest.inputs[0].gain.value, 'master into dest').toBe(0.15);
    expect(graph.visL.inputs[0].gain.value, 'vis tap').toBe(0.18);
    expect(graph.visR.inputs[0], 'same vis tap').toBe(graph.visL.inputs[0]);

    const voiceGain = graph.oscs[0].outputs[0].gain;
    bank.apply([{ key: 0, gain: 1 }], 20);
    expect(voiceGain.events, '40 ms ramp').toEqual([
      ['cancel', 20],
      ['set', 0, 20],
      ['ramp', 1, 20.04],
    ]);
    const before = voiceGain.events.length;
    bank.apply([{ key: 0, gain: 1 }], 21);
    expect(voiceGain.events.length, 'unchanged gains skip the ramp').toBe(before);

    const into = new Uint8Array(1024);
    bank.timeDomain(into);
    expect(into[0], 'analyser wrote the buffer').toBe(128);
    expect(() => bank.timeDomain(new Uint8Array(8)), 'wrong length').toThrow('bad waveform buffer');
    expect(() => bank.apply([{ key: 0, gain: 1 }, { key: 0, gain: 0.2 }], 22), 'duplicate').toThrow('duplicate voice 0');

    const resting = graph.oscs[1].outputs[0].gain;
    const restingEvents = resting.events.length;
    bank.dispose();
    expect(graph.oscs[0].stopped, 'oscillators stop').toBe(1);
    expect(graph.dest.inputs[0].disconnected, 'master leaves dest').toBe(true);
    expect(graph.visL.inputs[0].disconnected, 'vis tap leaves the buses').toBe(true);
    bank.dispose();
    expect(graph.oscs[0].stopped, 'second dispose is quiet').toBe(1);
    bank.apply([{ key: 1, gain: 1 }], 30);
    expect(resting.events.length, 'dead apply is a no-op').toBe(restingEvents);
  });

  it('refuses a bank with no destination', () => {
    expect(() => createVoiceBank(null), 'missing bag').toThrow('missing audio nodes');
    expect(() => createVoiceBank({ actx: {}, dest: null }), 'missing dest').toThrow('missing audio nodes');
  });
});
